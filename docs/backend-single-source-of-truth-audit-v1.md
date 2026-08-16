# Backend Single Source of Truth — Audit v1 (2026-08-16)

Status: `[x] Audit` `[ ] Reviewed` — **read-only, no code, no schema, no
migration, no UI built**

Per ChatGPT's explicit instruction (director, 2026-08-16, confidence
0.99), triggered by Izzat directly: stop building any more admin UI
until the backend is mapped as the genuine Single Source of Truth.
"Frontend kemudian hanya menjadi cermin dan alat kawalan kepada
backend." This document answers: *what is Quick's real backend state,
who controls it, and does admin actually have control over that source
of truth?*

Legend used throughout: **[A]** Fakta/data — what is actually stored.
**[B]** Peraturan/dasar — how the system decides something (rule/policy
logic). **[C]** Presentation — how the frontend merely displays it.

```
                BACKEND
            SINGLE SOURCE OF TRUTH
                      │
      ┌───────────────┼────────────────┐
      ↓               ↓                ↓
    Sources       Classification    Editorial Rules
      ↓               ↓                ↓
      └───────────────┼────────────────┘
                      ↓
                Reader State
                      ↓
                   FRONTEND
```

## 1. RSS Sources

**Registry: `lab/sources.js`, `RSS_SOURCES` array, 43 entries.** [B] —
this is code, not stored data. Fields per entry (not all present on
every one): `id, name, url, language, trustScore, sourceType,
knownCategory, status, excludePatterns, extraCa`.

```js
// lab/sources.js:140-142 — disabled, with an exclude rule
{ id: 'rss-kpm', name: 'Kementerian Pendidikan', url: 'https://www.moe.gov.my/feed', ...,
  status: 'disabled',
  excludePatterns: [/tender/i, /sebut harga/i, /perolehan/i, /^notis\b/i] },
```

1 of 43 sources is `status: 'disabled'` today (`rss-kpm`). **No
`active`/`enabled` boolean exists on the JS objects** — only the ad-hoc
`status` string, checked at `lab/rss.js:191`.

**Adding/removing/disabling a source [B]: a code edit + redeploy, full
stop.** No DB-backed mechanism exists. Confirmed by the code's own
comment (`lab/rss.js:189-190`): *"removing `status` from sources.js
re-enables fetching with no code change here."*

**The `sources` Postgres table is NOT a control surface — it is a dumb
mirror, overwritten every ingest run.** [A, but misleading if presented
as backend-controlled] `db/schema.sql:15-27` defines a real, richer
shape (`active BOOLEAN`, `coverage`, `last_success_at`,
`last_failure_at`, `last_failure_reason`) — but **none of these columns
are ever populated**. `db/ingest-production.js:104-109` only ever
writes `{id, name, url, language, trust_score}` from `RSS_SOURCES` into
`sources_staging`, swapped in wholesale on every run. Writing to
`sources.active` directly would be silently clobbered on the next
ingest — `lab/sources.js` is the only real source of truth here.

## 2. Raw RSS ingestion

**Parsing — `lab/rss.js`.** [B]
- GUID: falls back to `link` when no `<guid>`/`<id>` tag exists
  (`lab/rss.js:70-71`).
- Published date (`lab/rss.js:73-75`): accepts Atom `<updated>` as a
  stand-in for `<pubDate>`/`<published>` — the exact failure mode that
  made `rss-kpm`'s timestamps fake (its `<updated>` is CMS-sync time,
  not real publish time), the reason it's quarantined (§1).
- Per-source `excludePatterns` filtering happens **before an item is
  even built** (`lab/rss.js:96`) — hardcoded in `lab/sources.js`, not
  DB-driven, even though most other exclusion logic (Editorial Filter
  Rules, §5) is.
- Dedup, two tiers: exact match on `normalizedUrl`/`${sourceId}:${rssGuid}`
  then fuzzy title-Jaccard ≥0.25 within 48h (`lab/engine.js:29-72`);
  a second PK-level dedup at insert time (`db/ingest-production.js:151-157`).

**`fetched_at` exists in schema but is never explicitly set** —
`db/ingest-production.js`'s insert never writes it, so it always
defaults to `now()` at INSERT time (the ingestion run's moment, not the
feed's serve time). A re-run of an unchanged item resets it.

**Staging + swap lifecycle** (`db/ingest-production.js`): fetch → build
`*_staging` → validate against in-memory Lab counts → atomic RPC
`swap_ingestion_staging()` (staging→live, live→`*_old`) → post-swap
verification. A failed validation never reaches swap — production
untouched. `*_old` is never auto-dropped; only a manual, env-var-gated
CLI script can drop it, and that script's own comment admits it "cannot
see reader/admin normalcy" — a human must eyeball the app first.

**Is there any per-source ingestion-run log an admin could see?**
Only a coarse daily aggregate — `operational_snapshots` (one row/day:
`stories_processed, review_queue_count, failed_sources_count,
active_override_count`), exposed read-only via
`operational_snapshots_public`. **No per-source, per-run detail**
(which source failed, why, how many items) exists anywhere except
console output from a manually-run `node db/ingest-production.js`.

## 3. Story clusters

**Clustering — `lab/engine.js`.** [B] Deterministic: Tier-0 exact-key
match, Tier-1 fuzzy title match. Canonical/representative = earliest-
published item, **immutable once set**, enforced by a Postgres trigger
(`forbid_representative_reassignment()`, `db/schema.sql:94-108`) — a
real DB-level guarantee, not just convention. `editorialScore` is a
deterministic formula (freshness + cross-source + prominence), computed
once at ingest, not recomputed by the reader.

`workspace_state` lifecycle (`review|queued|active|released|expired`)
is DB-enforced via CHECK constraint; `productionAdapter.js` filters out
`expired`/`released` in the adapter (not a DB query filter) — reader
invisibility for these states is an application-layer convention, not
a database-guaranteed one.

`story_clusters.topic` is the **OLD classifier's** output (Politics/
Economy/Sports/World/Science/Health vocabulary) — deliberately kept,
no longer used for placement, carried through only as `legacyTopic`
"for audit/debugging."

## 4. Classification

**Three-stage pipeline, all in application code [B], none DB-driven
as rules:**
1. `story-understanding.mjs::understandStory()` — evidence candidates
   only, never a resolved field. Tier confidences:
   `url_path: 0.90 > publisher_declared: 0.75 > rss_category: 0.70 >
   title_keyword: 0.40` (fixed 2026-08-16, §RTM incident).
2. `edition-classification.mjs::classifyForEdition()` — resolves ONE
   edition's field: Edition Rules → Confidence Gate → Default Placement
   Mapping → Geography fallback → Unclassified.
3. `db/classify-production.js` — **a developer-run CLI script**
   (`--dry-run`/`--write`), not an admin-triggerable API/RPC.

**`subject_code`/`field_code` (Taxonomy Stable Field-ID V1, just
added)**: real DB columns on `edition_story_classifications` and
`story_overrides.new_field_code`, backfilled fail-closed (unmapped rows
halt the script, never guessed). This is the ONE piece of classification
infrastructure that is genuinely DB-stored as data, not just code.

**Is the taxonomy (Bidang list) itself stored in the database? NO —
confirmed 100% code-driven.** [B] `classification/lib/taxonomy-registry.mjs`'s
`TAXONOMY_REGISTRY` is a hardcoded JS object (16/16/13 entries per
edition). **No `taxonomy_fields` table exists.** The DB only stores the
*output* of applying this static table (the `field_code` values landing
on rows) — never the taxonomy *definition* (labels, merges, visibility)
as admin-editable rows. Every schema file's own header says the same
thing: *"Apply manually via Supabase SQL Editor — this project has no
automated migration runner."*

**Every hardcoded classification/URL-matching rule, exhaustively:**
- `desk-vocabulary.mjs::SUBJECT_VOCABULARY` — ~60 hardcoded token→subject
  mappings (`'politik': 'Politics'`, `'sukan': 'Sports'`, ...).
- `desk-vocabulary.mjs::GEOGRAPHY_VOCABULARY` — ~15 hardcoded token→region
  mappings, with its own comment flagging one entry as a known misfit.
- `desk-vocabulary.mjs::STRUCTURAL_NOISE` — hardcoded noise-token set.
- `edition-rules.mjs::EDITION_RULES` — one hardcoded contextual rule
  (`foreign_politics_to_world`, ms-MY only); en-global/ar-global empty.

**Propagating a taxonomy rename/merge today**: confirmed code-change +
redeploy, then a **separate manual CLI re-run**
(`db/backfill-taxonomy-codes.mjs --write` and/or
`db/classify-production.js --write`) to re-project historical rows —
two disconnected manual steps, no single admin action.

## 5. Editorial rules

**Editorial Filter Rules — genuinely backend-driven [A], real admin UI
already exists.** `editorial_filter_rules` table + `FilterRulesManager.jsx`
(add/toggle/delete, no code deploy needed). Resolution
(`editorialFilterResolver.mjs`) is a pure function wired live into the
reader path, applied before field resolution. **This is the model to
replicate for everything else in this audit.**

**`story_overrides` (hide/reclassify/pin/boost) — genuinely backend-
driven [A].** Schema enforces `reason NOT NULL`, mandatory `expires_at`.
Resolution (`editorialStateResolver.mjs::resolveStoryField()`) wired
live: an active `hide` makes `topic: null` structurally, so ranking
never even sees the story. Written via the Review Queue admin UI.

**`source_overrides` — schema exists, admin-configurable types defined
(`ignore_category`/`reduce_trust`/`disable`), but ENTIRELY UNWIRED.**
[A/B, real gap] The schema comment itself admits `source_id` isn't a
real FK because "that registry is code, not a table" — the schema
author already knew about §1's split. **Nothing in `lab/rss.js`,
`db/ingest-production.js`, or `productionAdapter.js` reads this table
at all**, and **no admin UI writes to it** (unlike Filter Rules). Rows
can only be inserted via direct DB/SQL access, and even then have zero
runtime effect. This is a designed-but-dead table.

**Classification Rules (URL pattern → field) — confirmed: does not
exist as a backend concept at all.** Entirely the hardcoded
`desk-vocabulary.mjs` from §4. No table, no admin UI, no RPC.

## 6. Reader state — who really decides what a reader sees

| Decision | Deciding code | Backend-driven? |
|---|---|---|
| **Visible?** | `mapRowsToRankedQueue()` — `workspace_state` filter, Editorial Filter Rules, `hide` override | Yes, all three DB-sourced |
| **Which Bidang?** | `resolveStoryField()` — `field_code` + reclassify override | Yes, DB-sourced |
| **Ranking?** | `story_clusters.editorial_score` (legacy) or `editorial_v1` pipeline; pin/boost from `story_overrides` | Base scores DB-sourced; **which algorithm runs is a code-level feature flag** (`rankingFlags.js`), not a DB row |
| **Excluded?** | Filter Rules + `hide` (DB) — **but also** per-source `excludePatterns` regex (hardcoded in `lab/sources.js`, applied at parse time) | Mixed — one DB path, one code path |

**One genuine frontend-only decision point, worth flagging directly:**
`state/reducer.js::excludeEverReleased()` — permanently excludes any
story present in `state.history`, which is **built purely in client
memory** from dispatched `RELEASE_STORY` actions, never cross-checked
against a backend `history_entries` table inside the reducer itself.
This is real decision logic living in the frontend, not a pure read of
backend-computed state — the one place this audit found the reducer's
own "activeSet only changes via two actions" invariant is enforced
client-side, not server-verified.

`productionAdapter.js` itself is otherwise a faithful pure reshape —
no other frontend-only business rule found there.

## 7. Admin operations gap — the key deliverable

Every operation that currently requires a developer editing code/SQL,
that conceptually should be admin-operable via a real backend API/RPC:

| # | Operation | Today's mechanism | What a real backend action needs |
|---|---|---|---|
| 1 | Add/disable/edit an RSS source | Hand-edit `lab/sources.js`, redeploy | Real `sources` table (schema already has the shape) + `add_source()`/`disable_source()` RPC; `ingest-production.js` reads from DB, not a static import |
| 2 | Rename a taxonomy field label | Edit `taxonomy-registry.mjs`, redeploy | `taxonomy_fields` table (doesn't exist yet) + `rename_field()` RPC |
| 3 | Merge two taxonomy fields | Edit `subject_codes` array, redeploy, manually re-run backfill/classify CLI | `merge_fields()` RPC that updates taxonomy AND triggers the backfill server-side, not as a disconnected manual step |
| 4 | Add a URL-pattern classification rule | Edit `desk-vocabulary.mjs`, redeploy | Net-new `classification_vocabulary` table + `add_vocabulary_rule()` RPC — this is "Classification Rules," confirmed nonexistent today |
| 5 | Add/change an Edition Rule | Edit `edition-rules.mjs`, redeploy | `edition_rules` table + `add_edition_rule()` RPC |
| 6 | Run a classification pass | Developer CLI (`--write`, env-var gated) | Admin-triggerable RPC/Edge Function, same guard logic moved server-side with a UI confirm step |
| 7 | Run RSS ingestion | Developer CLI or external scheduler (not found in repo) | Scheduled Edge Function / admin-triggerable RPC over the existing staging+swap logic (the logic itself is solid — only the trigger surface is missing) |
| 8 | Drop `*_old` generation tables | Developer CLI, env-var asserts human already checked the UI | RPC gated behind an admin-UI confirmation checklist — automatable checks (row counts, FK-dangling) already exist and could move server-side; the human "looks fine" judgment stays a UI click, not an env var |
| 9 | Wire up `source_overrides` | Table exists, unused | (a) Build the missing admin UI (mirror `FilterRulesManager.jsx`), (b) actually read it in `lab/rss.js`/`ingest-production.js`/`productionAdapter.js` |
| 10 | Apply schema/migration files | Manual paste into Supabase SQL Editor, every single time, for every table in this audit — including the ones already "backend-driven" | Out of scope for an RPC — needs a real migration runner (e.g. tracked Supabase CLI migrations). The deepest layer of "developer must act," even for tables that already work |
| 11 | Bootstrap the first admin/editor | Documented one-time manual DB insert (chicken-and-egg, inherent) | Accepted manual step, not a gap to close |

## Summary — three real categories, not one uniform "backend"

- **Genuinely backend-driven today, with real admin UI**: Editorial
  Filter Rules, `story_overrides` (hide/reclassify/pin/boost), the
  ingestion staging/swap safety mechanics. These are the actual Single
  Source of Truth today — small in number.
- **Table exists but is a dumb mirror or entirely unwired**: `sources`
  (overwritten every ingest run, not a real control surface);
  `source_overrides` (complete schema, zero runtime effect, no UI).
  Presenting either as "backend-controlled" today would be misleading.
- **Entirely code-driven, organized well enough to look like
  configuration but isn't**: `lab/sources.js` (RSS registry),
  `taxonomy-registry.mjs` (the Bidang taxonomy itself),
  `desk-vocabulary.mjs` (SUBJECT/GEOGRAPHY vocabularies),
  `edition-rules.mjs` (EDITION_RULES). All four require a code change +
  redeploy, and three of them additionally require a disconnected
  manual CLI re-run to re-project existing data.

This is the honest map ChatGPT asked for. The gap is not "we need more
admin UI" — it's that most of what would need a UI doesn't have a real
backend surface to point that UI at yet.

## What this document does NOT do

- No code written, no schema applied, no migration executed
- Does not build any admin UI/API/RPC
- Does not decide which item in §7's table to build first
- Does not propose a generic rule engine — each gap in §7 stays its own
  named table/RPC, per the director's explicit "jangan tambah generic
  rule engine" instruction

## Next

Awaiting ChatGPT's review of this map before any implementation
sequencing is proposed — per the director's explicit instruction:
"Selepas audit selesai, berhenti dan bentangkan architecture gap
sebelum implementation."
