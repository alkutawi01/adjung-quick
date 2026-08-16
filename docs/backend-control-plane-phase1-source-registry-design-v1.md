# Backend Control Plane — Phase 1: Source Registry Design v1 (2026-08-16)

Status: `[x] Design` `[ ] Approved` — **schema/RPC/migration/cutover
design only. No code, no schema applied, no migration executed, no
production ingestion change, no UI.**

Follow-up to `docs/backend-control-plane-implementation-plan-v1.md`
Phase 1, per ChatGPT's explicit correction: `lab/sources.js` must NOT
survive as a competing source of truth after cutover — a clean,
provable, all-or-nothing swap, never "database has some sources,
sources.js still has others."

## A. The single source of truth

**`public.sources`** (existing table name, `db/schema.sql:15-27`) —
extended, not replaced. After Phase 1's cutover, this table is the
**only** place `db/ingest-production.js` reads the active source list
from. `lab/sources.js` stops being imported by any production code
path — it may remain in the repo as a historical/rollback artifact
(§F), but is never read at runtime once cutover completes.

**Extended columns** (additive to the existing `id, name, url,
language, trust_score, coverage, active, last_success_at,
last_failure_at, last_failure_reason, created_at`):
```
known_category    TEXT              -- e.g. 'sukan', 'bisnes' — Tier 1 evidence input
source_type       TEXT              -- 'general' | 'specialised' | 'authority_niche'
exclude_patterns  TEXT[]            -- regex-as-text, applied at parse time (lab/rss.js:96)
extra_ca          TEXT              -- rare TLS cert override (JAKIM's one historical case)
status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled', 'archived'))
```

**Why a new `status` column instead of reusing `active BOOLEAN`**: see
§B — the existing `active` boolean can't distinguish "temporarily
disabled" from "archived/retired", and ChatGPT explicitly wants that
distinction preserved.

## B. Source lifecycle

Per ChatGPT's explicit preference: **`disable` is a routine, frequent
operation; `archive` is a heavier, deliberate one** — so RSS history
is never silently lost by a casual toggle.

```
active ──disable──> disabled ──enable──> active
   │                    │
   │                archive (admin, deliberate)
   │                    ↓
   └──────archive──> archived
```

- **`active`**: normal state, ingestion fetches from this source.
- **`disabled`**: ingestion skips fetching (mirrors today's
  `status: 'disabled'` semantic in `lab/sources.js`, e.g. `rss-kpm`'s
  quarantine) — fully reversible, no data implications, editor-level
  action per §D.
- **`archived`**: source is retired from the registry's active view
  entirely (e.g. a newsroom shut down, a feed URL is permanently dead)
  — existing `rss_items`/`story_clusters` rows referencing this source
  are untouched (historical data never deleted), but the source no
  longer appears in normal admin source-management views. Admin-only,
  per §D — a heavier, less frequent action than disable.

The existing `active BOOLEAN` column is superseded by `status` for new
code, but **kept, not dropped**, computed as `active = (status =
'active')` via a generated column or trigger — this avoids breaking
any code this audit didn't find that might already read `sources.active`
directly (defensive, low-cost).

## C. RPC surface — minimum viable, checked for redundancy per ChatGPT's instruction

Three RPCs, not more — `update_source` already covers metadata edits,
so a separate RPC per field (rename, change URL, etc.) is unnecessary:

```
add_source(name, url, language, trust_score, known_category?, source_type?, exclude_patterns?)
  -> new source row, status='active' by default

update_source(source_id, {name?, url?, trust_score?, known_category?, source_type?, exclude_patterns?, extra_ca?})
  -> partial update, only provided fields change

set_source_status(source_id, status, reason?)
  -> status transition (active/disabled/archived), reason required for disabled/archived
  -> replaces both "disable" and "archive" as ONE RPC with a status
     parameter, rather than three separate toggle RPCs — fewer entry
     points to a single state machine is safer than parallel ad-hoc
     mutators that could disagree
```

No `delete_source` — sources are never hard-deleted (matches this
project's established "generated data lives forever, editorial
decisions expire, nothing is silently destroyed" posture from
`story_overrides`/`_old` table discipline elsewhere in the codebase).

## D. Ownership / permission — reuses the existing role model exactly

Per ChatGPT's explicit instruction: no new role. `editors.role IN
('editor', 'admin')` already exists (`db/editor-auth.mjs`), governed by
the existing **Principle of Escalation**
(`docs/editorial-action-spec-v1.md`): actions whose impact compounds
across many future stories are admin-only.

A source-level action affects **every future item from that source,
across every edition** — the same class of impact `editor-auth.mjs`
already assigns to `source_overrides`' `disable`/`ignore_category`/
`reduce_trust` (`ADMIN_ONLY_ACTIONS` set). Source Registry actions get
the same tier:

```
add_source        -> admin only  (compounds: introduces a new supply of future stories)
update_source     -> admin only  (compounds: changes evidence/trust for all future items)
set_source_status -> admin only  (compounds: turns supply on/off/away entirely)
```

Enforced at the same single write choke point pattern already used in
`ui/src/admin/reviewQueueAdapter.js::writeOverride()` — one function
all three RPCs funnel through, checking `isAdmin(role)` before any
write, never left to be re-implemented per call site.

## E. Migration — `lab/sources.js` → `sources` table

**Deterministic, 1:1 copy of existing known data — no re-derivation, no
ambiguity.** All 43 entries currently in `RSS_SOURCES` map directly to
a `sources` row:

```
lab/sources.js entry          ->  sources row
{ id, name, url, language,        { id, name, url, language,
  trustScore, sourceType,           trust_score: trustScore,
  knownCategory, status,            source_type: sourceType,
  excludePatterns, extraCa }        known_category: knownCategory,
                                     status: status ?? 'active',
                                     exclude_patterns: excludePatterns?.map(String),
                                     extra_ca: extraCa }
```

**Duplicate detection**: `id` is already the natural, existing primary
key (`rss-kosmo`, `rss-utusan`, ...) — the migration script checks for
any `id` collision against existing `sources` rows before insert (there
should be none, since `sources` today only ever contains a full
overwrite-mirror of the same 43 ids, but the check costs nothing and
fails closed if the assumption is wrong).

**URL validation**: each `url` is checked as a syntactically valid URL
(`new URL(url)` doesn't throw) before insert — this is the SAME
validation `lab/rss.js`'s fetch already implicitly requires, just
checked earlier so a malformed entry is caught at migration time, not
silently at the next ingest run.

**Count verification**: migration asserts `sources` has exactly 43 rows
matching `RSS_SOURCES` after the run — same fail-closed discipline as
`db/backfill-taxonomy-codes.mjs` (halt and report, never partial-write
silently).

**Rollback**: the migration is a single transaction — either all 43
rows insert successfully or none do. If discovered wrong after commit,
a corrective script re-derives from `RSS_SOURCES` (still in the repo,
unread by production but present) and re-syncs — the JS file's role
during this window is "known-good reference for recovery," never "read
by ingestion."

## F. Cutover — provable, atomic, never half-swapped

Per ChatGPT's explicit diagram and "jangan buat swap separuh-separuh":

```
lab/sources.js (current production reader)
       ↓
   backfill migration (§E) — sources table populated, NOT yet read by ingestion
       ↓
   verify 43/43 — row-for-row diff against RSS_SOURCES, zero mismatches
       ↓
   switch db/ingest-production.js's import: RSS_SOURCES -> query sources table
       ↓
   verify — a --dry-run ingestion run produces IDENTICAL item/cluster
            counts sourced from the DB as it did from the JS array
            (same 43 active-eligible sources, same exclude behavior)
       ↓
   lab/sources.js now fully out of the production path — no code
   imports it for ingestion decisions anymore
```

**The proof ChatGPT specifically demanded**, restated as this phase's
actual completion criterion — not "SQL succeeded," but:

> Admin changes a source's status in `sources` (via `set_source_status`)
> → the next ingestion run genuinely reflects that change → reader
> content changes accordingly → **with zero Claude/Codex involvement
> and zero deploy.**

This is the acceptance test for Phase 1, to be run for real once
cutover is applied (out of scope for this design document itself, but
named here as the exact bar the implementation must clear before Phase
1 can be marked done).

**No frontend for this yet** — Phase 1 stops at RPC + verified cutover.
An admin UI to call `add_source`/`update_source`/`set_source_status`
is explicitly Phase 6+ territory, per ChatGPT's "jangan bina frontend"
instruction for this phase.

## What this document does NOT do

- No SQL written or applied
- No migration executed
- No change to `db/ingest-production.js` or any other production code
- No admin UI
- Does not remove `lab/sources.js` from the repository — only names the
  point at which it stops being read
- Does not run the Phase 1 acceptance test (§F) — that happens only
  after implementation, not as part of this design

## Next

Awaiting ChatGPT's review of §A-F before any schema is written. Once
approved: implement additive schema (extended columns + `status`) →
write the three RPCs → run the migration (§E) in a non-production
verification pass first → cutover (§F) → run the real acceptance test
→ only then is Phase 1 complete and Phase 2 (Kategori/Taxonomy) begins.
