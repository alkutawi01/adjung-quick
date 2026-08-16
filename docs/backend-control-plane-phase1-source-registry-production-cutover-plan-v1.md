# Backend Control Plane — Phase 1 Production Cutover Plan v1 (2026-08-16)

Status: `[x] Plan` `[x] Approved (conditional, 2026-08-16, 3 amendments applied — §4, §4a, §7)` — **read-only. No production migration
executed, no cutover applied, no frontend built.**

Follow-up to `docs/backend-control-plane-phase1-source-registry-design-v1.md`
(design, approved) and its staging implementation (`db/source-registry-adapter.mjs`
etc., 11/11 tests pass — approved by ChatGPT as sufficient proof of the
mechanism). This plan covers ONLY what staging could never prove:
**cutting real production ingestion over from `lab/sources.js` to
`public.sources`**, safely.

## 0. Phase 1 status, per ChatGPT's own tracking

```
🟢 Design: LULUS
🟢 Staging implementation: LULUS
🟢 Staging tests: LULUS
🟡 Production migration: BELUM (this plan)
🟡 Production cutover: BELUM (this plan)
🔴 Frontend: JANGAN SENTUH
```

## 1. Production baseline — captured now, read-only, before anything changes

Queried directly against production `public.sources` (2026-08-16):

| Fact | Value |
|---|---|
| Row count | **43** (matches `lab/sources.js`'s 43 entries exactly) |
| `active` column | **all 43 rows `true`** — this column has never reflected `rss-kpm`'s code-level `status: 'disabled'`, confirming the audit's finding that `sources` is an overwritten mirror, not a real control surface |
| `coverage` | NULL on every row (never populated by `ingest-production.js`) |
| `last_success_at`/`last_failure_at`/`last_failure_reason` | NULL on every row (never populated) |
| `created_at` | Identical timestamp across all 43 rows (`2026-08-15T10:57:27`) — confirms wholesale overwrite behavior, not per-row history |

**Sources that must not disappear or change identity during cutover**
(full 43-id list, verbatim from `lab/sources.js`, unchanged by this
plan): `rss-kosmo, rss-utusan, rss-metro, rss-bernama-bm, rss-astro-awani,
rss-metro-bisnes, rss-metro-arena, rss-metro-global, rss-metro-rap,
rss-utusan-ekonomi, rss-utusan-sukan, rss-utusan-politik, rss-kosmo-hiburan,
rss-awani-politik, rss-awani-nasional, rss-awani-bisnes, rss-awani-sukan,
rss-awani-hiburan, rss-awani-gayahidup, rss-awani-dunia, rss-rtm-nasional,
rss-rtm-ekonomi, rss-rtm-dunia, rss-rtm-jenayah, rss-rtm-sukan,
rss-rtm-hiburan, rss-jakim-berita, rss-jakim-kenyataan, rss-utusan-agama,
rss-ikim, rss-mosti, rss-kpm, rss-amanz, rss-jaipp, rss-utusanborneo-sabah,
rss-utusanborneo-sarawak, rss-beritaharian` (+ 6 more per the full array —
the migration script enumerates the complete list programmatically from
`RSS_SOURCES` itself, never a hand-copied list, to avoid transcription
error).

**The one source whose STATUS must carry over correctly**: `rss-kpm` —
`status: 'disabled'` in `lab/sources.js` today (quarantined for fake
timestamps, per this session's earlier RTM/KPM investigation). The
migration MUST set `status: 'disabled'` on this row, not `'active'` —
a real, checkable regression risk if the migration script defaults
everything to active.

**Post-cutover question this plan must be able to answer**: *"Does
production still have the exact same sources as before, with the exact
same active/disabled state?"* — answered by §4's parity test.

## 2. Target — corrected per ChatGPT's explicit instruction

**Not** `sources_registry_staging` → production. That table was purely
for proving the mechanism in isolation and is never read by anything
production-facing.

```
lab/sources.js
       ↓
   43 sources (enumerated from RSS_SOURCES directly)
       ↓
   public.sources   (extended with known_category, source_type,
                      exclude_patterns, extra_ca, status — same
                      additive columns already proven in staging)
       ↓
   ingest-production.js reads from public.sources
```

`public.sources` gets the SAME additive schema change already proven
safe in staging (§ design doc, §A) — this plan does not redesign the
schema, only applies the already-approved shape to the real table.

## 3. Backfill — production, fail-closed, all-or-nothing

Same discipline as the staging backfill (`db/backfill-source-registry-staging.mjs`),
applied to `public.sources` instead, with one critical addition per
ChatGPT: **the production table is not empty** (43 rows already exist,
written by ingestion's own mirror behavior) — this is an **UPDATE-or-
UPSERT migration, not a fresh INSERT**, and must not silently overwrite
fields ingestion currently manages (`coverage`, `last_success_at`,
`last_failure_at`, `last_failure_reason` stay untouched by this
migration — only the NEW columns are populated).

**Explicit fail-closed rule, per ChatGPT's exact instruction**: if 42 of
43 rows succeed and 1 fails (e.g. a constraint violation, a duplicate,
an unexpected existing value) — **the entire migration rolls back, zero
rows are left changed.** "Continue with 42 and fix the 43rd later" is
explicitly rejected — a partially-migrated `sources` table is worse
than an unmigrated one, since it would make `active`/`status`
inconsistent with reality for an unknown subset of sources.

**Mechanism**: single Postgres transaction (`BEGIN`...`COMMIT`), same
pattern as `swap_ingestion_staging()`'s atomicity — either every row's
new columns are set correctly, or the transaction aborts and nothing
persists.

**Duplicate check**: `id` already exists as production `sources`' PK —
the migration uses `UPDATE ... WHERE id = $1`, never `INSERT`, for all
43 known ids — an id present in `RSS_SOURCES` but missing from
production `sources` (shouldn't happen, since ingestion already mirrors
100% of them) is treated as a fail-closed anomaly, not silently
inserted — investigate before proceeding, don't guess.

**URL validation**: re-validated against production's CURRENT `url`
column value too, not just `RSS_SOURCES`' value — if they've drifted
(shouldn't have, but never assumed), the migration reports the
mismatch and halts rather than silently picking one.

## 4. Parity test — mandatory, field-by-field, not just count

Per ChatGPT's explicit correction: **43 = 43 is not sufficient.** After
backfill, BEFORE `ingest-production.js` is touched, this plan requires
an explicit comparison script asserting, for every one of the 43 ids:

```
lab/sources.js entry          vs      public.sources row (post-backfill)
─────────────────────────────────────────────────────────────────────
id                             ==      id
url                            ==      url
language                       ==      language
trustScore                     ==      trust_score
knownCategory                  ==      known_category
sourceType                     ==      source_type
status (s.status ?? 'active')  ==      status
excludePatterns (as strings)   ==      exclude_patterns
```

**Corrected per ChatGPT's explicit instruction (2026-08-16)**: `status`
must be compared against each entry's **actual** `RSS_SOURCES[i].status`
value (defaulting to `'active'` only when the field is genuinely absent
on that entry) — never against a blanket `'active'` expected value. With
a blanket default, the one row that must differ (`rss-kpm`, `disabled`)
would silently pass parity even if the migration incorrectly activated
it — the exact failure this test exists to catch. Expected: 42 rows
`status: 'active'`, 1 row (`rss-kpm`) `status: 'disabled'`.

**Required result: 0 missing, 0 extra, 0 mismatch** — printed
explicitly (not just a boolean pass/fail) so a human can review the
exact diff if anything is off. This comparison script is written but
NOT run against production until this plan is approved.

### 4a. `active` ↔ `status` invariant — mandatory pre-cutover audit

Per ChatGPT's explicit instruction: `status` supersedes the legacy
`active BOOLEAN` column, but `active` is not dropped — it must be kept
in lockstep so no code path can observe two conflicting definitions of
"is this source live":

```
status = active    → active = true
status = disabled  → active = false
status = archived  → active = false
```

The backfill script (§3) sets `active` alongside `status` on every row,
per this mapping, in the same transaction.

**Before cutover (§7) is attempted**, a full `grep`/search of every
production code path for `.active` / `sources.active` reads is
required, and each consumer found must be one of:
- migrated to read `status` instead, or
- proven read-only/compatibility-only (never gates a real decision).

No consumer may be left reading `active` as if it were still
independently authoritative — that would let an admin `disable` a
source via `status` while some other code path still treats it as
active, reintroducing exactly the dual-source-of-truth problem Phase 1
exists to remove. This audit is a required gate before §7's cutover,
not an optional nice-to-have.

**Audit result (2026-08-16, run against the full codebase)**: every
`.from('sources').select(...)` call (`ui/src/admin/classificationFlowAdapter.js:31`,
`ui/src/adapter/productionAdapter.js:43,221`, `ui/src/admin/reviewQueueAdapter.js:90,150`)
selects only `id`, `name`, `trust_score` — **none select or read the
`active` column**. All other `.active`/`.eq('active', ...)` matches in
the codebase belong to unrelated tables (`editorial_filter_rules.active`,
`story_overrides.active`, `operational_snapshots.active_override_count`)
— confirmed by inspecting each match, not by the column name alone.
**Zero production consumers read `sources.active` today** — the
invariant in §4a is satisfied trivially at cutover time (nothing to
migrate), but the backfill still sets `active` correctly per the
mapping above so the column never drifts from `status` if a future
consumer is added.

## 5. Test: a source added purely via production backend (the test that proves independence from code)

Per ChatGPT's explicit escalation from the staging version — this must
be re-proven against REAL `public.sources` and (carefully) real
`ingest-production.js`, post-cutover:

```
Admin
  ↓
add_source()  (now targeting public.sources, not the staging table)
  ↓
public.sources
  ↓
next ingestion run
  ↓
source is fetched — WITHOUT editing lab/sources.js, WITHOUT a deploy
```

**Execution safety**: this test uses a real but harmless test source
(a stable, low-volume feed, or a `--dry-run` ingestion pass rather than
a real `--write` if a live test source can't be safely added to
production without polluting real content) — exact mechanism to be
finalized at execution time, not decided in this read-only plan. The
test is removed (`archived` or deleted) immediately after verification,
never left as permanent production clutter.

## 6. Test: disable via production backend

```
Admin
  ↓
set_source_status(id, 'disabled')  (on public.sources)
  ↓
next ingestion run
  ↓
source is NOT fetched
  ↓
restore: set_source_status(id, 'active')
  ↓
next ingestion run
  ↓
source IS fetched again — confirmed, not assumed
```

Run against a real, low-stakes existing source (candidate: one of the
already-known-noisy RTM feeds, or a dry-run-only test to avoid any real
content gap during the test window) — exact source choice finalized at
execution time.

## 7. Cutover — `ingest-production.js`'s read path

**Only after §3 (backfill) and §4 (parity, 0 mismatch) both pass**:

```
db/ingest-production.js
   BEFORE: import { RSS_SOURCES } from '../lab/sources.js'
   AFTER:  const sources = await fetchActiveSources(supabase)  // from public.sources, status='active' only
```

`lab/sources.js` is **not deleted**. It stays in the repository as a
rollback/reference artifact (§8) — but after this line changes, no
production code path reads it anymore. Per ChatGPT's explicit
principle: production never has two competing sources of truth at
once — this is a single-line cutover, not a gradual dual-read period.

**Verification immediately after cutover — corrected per ChatGPT's
explicit rejection of "IDENTICAL item/cluster counts" as an acceptance
criterion**: RSS content changes continuously (feeds update, items
appear/disappear, fetch timing varies) — the same 43 sources producing
a different item/cluster count between two runs is normal, expected
variance, not a defect. Requiring an exact match would be testing the
wrong thing.

**What must be exact** (the actual claim this phase makes):
```
Sources fetched:  42/42 — exact parity (same set, same exclude_patterns, same metadata)
Sources skipped:  1/1   — rss-kpm, correctly excluded as disabled
```

**What is observational only, reported but never gating pass/fail**:
```
RSS items:  747 → 752   (expected runtime variance)
Clusters:   693 → 698   (expected runtime variance)
```

A `--dry-run` ingestion run immediately post-cutover reports both
sections; only the source-set-parity section has a pass/fail
threshold (must be exact).

## 8. Rollback — explicit, not "redeploy code"

Per ChatGPT's explicit rejection of "edit `lab/sources.js` back and
redeploy" as a normal rollback path — that only fixes the CODE, not
`public.sources`' possibly-already-changed state, and reintroduces the
dual-source-of-truth problem this whole phase exists to remove.

**Real rollback mechanism**: revert `ingest-production.js`'s import line
only (`fetchActiveSources()` → `RSS_SOURCES` import again) — a single-
line code revert, deployed immediately, with `public.sources`'
additive columns left in place (harmless — ingestion simply stops
reading them again, same as before cutover). This is the ONLY
emergency lever, reserved for:
- A query against `public.sources` fails outright (connectivity,
  permission, unexpected schema issue).
- Fetched active-source count is unexpectedly wrong (too few/too many)
  immediately after cutover.
- A source is missing that shouldn't be.
- Ingestion errors in a way clearly traceable to the new read path.
- Generated data (item/cluster counts) doesn't match the pre-cutover
  baseline within the tolerance normal day-to-day RSS variance would
  produce.

**What rollback does NOT touch**: `public.sources`' data itself is
never rolled back or deleted — only the code path reading it. This
means a rollback is safe to execute quickly without any data-loss risk,
and re-attempting cutover later doesn't require re-running the backfill.

## 9. Acceptance criteria — upgraded, per ChatGPT's explicit instruction

Staging already proved: `Admin → source registry → (future) reader`.

**Production cutover must prove the FULL chain**:
```
Admin → production backend (public.sources) → production ingestion
  → RSS item → downstream classification → reader
```

**Explicitly NOT changed in this phase**: classification logic, reader
logic, ranking. This phase verifies that everything DOWNSTREAM of
ingestion continues to behave exactly as before — a story from a source
still gets classified, still reaches the reader, unaffected by WHERE
the source list came from. This is a verification, not new scope.

## What this document does NOT do

- No code written beyond what's already in staging
- No production migration executed
- No cutover applied
- No frontend/Source Management UI built
- Does not finalize the exact "safe test source" choice for §5/§6 —
  named as an execution-time decision, not a design gap
- Does not touch classification, ranking, or reader code

## Next

Awaiting ChatGPT's approval of this cutover plan before §3's migration
script is even written. Per the established discipline: plan approved
→ migration script written → run against production in a controlled,
monitored window → §4 parity verified (0 mismatch) → §5/§6 tests run
→ §7 cutover applied → §9 full-chain verification → only then is Phase
1 complete and Phase 2 (Kategori/Taxonomy) begins.
