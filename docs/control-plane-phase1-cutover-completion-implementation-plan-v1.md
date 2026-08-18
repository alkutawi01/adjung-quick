# Phase 1 Source Registry — Cutover Completion: Implementation Plan

Scope locked by ChatGPT's approval of
`docs/control-plane-phase1-cutover-completion-findings-v1.md`. No new
table, column, or RPC. Four items, each a repoint of an existing read/write
path to `public.sources`. Written, not yet applied — awaiting review.

## Item 1 — Repoint admin write adapter to `public.sources`

**File:** `db/source-registry-adapter.mjs`

**Change:** `const TABLE = 'sources_registry_staging'` → `const TABLE = 'sources'`. No other line in `addSource`/`updateSource`/`setSourceStatus`/`fetchActiveSources` changes — they already target the column names `public.sources` has (verified identical schema, per the findings doc's field comparison).

**Field mapping:** none needed — `sources_registry_staging` and `sources` are shape-identical (`trust_score`, `known_category`, `source_type`, `exclude_patterns`, `status`, `extra_ca`, `updated_at` all present on both). This is the entire reason ChatGPT's original staging design worked as a proving ground.

**Existing validation (unchanged, already correct for production):** `assertAdmin()` gate on all 3 mutators; URL validation via `new URL()`; `trustScore` 0-100 range check; `status` whitelist (`active`/`disabled`/`archived`); `reason` required for any non-active status.

**New risk surface once this targets real `sources`:**
- `addSource()` does not set the legacy `active` boolean column — only `status`. Per the findings doc, no production reader consumes `.active` today, so this is not a functional bug, but it means a row inserted via the admin adapter will have `active` at its column default (need to confirm default is not `NULL`/`false` in a way that could matter to some future reader — check `db/schema.sql`'s `active` column default before applying).
- `updateSource()`/`setSourceStatus()` write directly to the table `ingest-production.js` reads on every run. Unlike staging, a bad write here has an immediate operational blast radius (a mistyped `trustScore` or wrong `status` affects the next ingestion cycle, not just a test). No code change mitigates this — it's the nature of "this is now real"; call it out explicitly rather than silently accept it.
- `sources.id` is the ingestion join key everywhere (`fetchAllSourcesForIngestion`, `daily-observation.mjs`, ranking). `addSource` has no duplicate-id guard beyond the DB's own `PRIMARY KEY` constraint (relies on Postgres to reject a duplicate insert with an error surfaced to the admin) — acceptable, just noting it's DB-enforced, not app-enforced.

## Item 2 — Repoint `daily-observation.mjs` and `shadow-runner.mjs` to `public.sources`

**Files:** `db/daily-observation.mjs`, `ranking/shadow-runner.mjs`

**Current exact usage (both are read-only consumers, no write path):**
- `daily-observation.mjs:28,134,354` — imports `RSS_SOURCES`, builds `registryStatus = new Map(RSS_SOURCES.map(s => [s.id, s.status]))` to classify silent sources as expected-broken vs. alertable, and at line 354 looks up `src.status`/`src.statusReason` for a known-broken-sources report line.
- `shadow-runner.mjs:17,22,75` — imports `RSS_SOURCES`, builds `trustById = new Map(RSS_SOURCES.map(s => [s.id, s.trustScore]))`, used once to set `trustScore` on shadow candidates.

**Change:** replace the static import with an async fetch from `public.sources` using the existing `fetchAllSourcesForIngestion(supabase)` helper (already returns `{id, status, trustScore, ...}` in the exact shape these two files key off), or a narrower dedicated read helper if threading a `supabase` client into these scripts' entrypoints is cleaner than reusing the ingestion-shaped one. Concretely:
- `daily-observation.mjs`: `gatherMetrics()`/`main()` already has a `supabase` client in scope (it queries other tables) — call the source list fetch once at the top of `gatherMetrics()` and pass the resulting `registryStatus` map through, same as today, just DB-sourced instead of file-sourced. Same for the line-354 report lookup — build a small `Map` from the same fetch result instead of a second `RSS_SOURCES.find()`.
- `shadow-runner.mjs`: `loadFieldCandidates()` needs a `supabase` argument (check whether it's already passed one from its caller in `daily-observation.mjs`, since that's the one production-adjacent caller — if not, thread it through the existing call site).

**No logic change** — same Map-building shape, same fields read, same fallback behavior (`?? 'active'` for missing status stays as-is). Only the data source changes from a static import to an awaited DB read.

## Item 3 — Decision record: `sources_registry_staging`

**Decision: Retire it**, per ChatGPT's stated preference ("B hanya jika memang ada nilai testing, jika tidak A lebih bersih") and the fact that once Item 1 lands, staging has no remaining purpose — it was built as a proving ground specifically so admin writes could be exercised before touching production, and that proving is now complete (the write adapter itself becomes the thing under test against real `sources`, same as `ingest-production.js`'s read path already is).

**Concrete retirement steps (for review, not yet executed):**
- Drop `sources_registry_staging` table — separate SQL file, applied only after Item 1's cutover is verified live (not bundled with the cutover itself, so a rollback of Item 1 doesn't also need to resurrect a dropped table).
- `db/source-registry-staging.test.mjs` — this test suite exercises `sources_registry_staging` in isolation; once retired, either delete this file (its coverage is superseded by re-pointing the same test patterns at `sources`, if such a test exists or is worth adding) or repoint it to test against `sources` directly. Recommend deciding this at the same time as Item 1's actual code change, not deferred.
- `db/backfill-source-registry-staging.mjs` — becomes dead code once staging is retired; delete alongside the table drop, not before (keep it available in case Item 1 needs a staging-based dry run first).

**Sequencing:** staging retirement happens *after* Item 1 is live and verified, not simultaneously — so there's a rollback path (re-point `TABLE` back to staging) if something's wrong with the production repoint, without needing to also un-drop a table.

## Item 4 — Lock boundary: `lab/sources.js` = fixture only

**Change:** doc-only, no code. Add a header comment to `lab/sources.js` itself stating explicitly that as of this cutover it is a fixture/reference/migration-source file only, not read by any production or production-adjacent runtime path, and any new script that needs live source data must read `public.sources`, not this file. This directly prevents the exact confusion the original Completion Audit ran into (treating a stale state as current) — the file's own header becomes the source of truth for what it currently is.

**Also update:** `docs/backend-single-source-of-truth-audit-v1.md` and
`docs/control-plane-completion-audit-phase1-3-v1.md` do not get edited
(they're dated historical audits — editing them would falsify the audit
trail); instead this implementation plan and its post-apply verification
doc become the up-to-date record, linked from `HAND-OFF` for future
sessions.

## Sequence

1. Item 1 code change (adapter repoint) + Item 2 code changes (2 files) — written together since both are simple repoints with no interdependency, reviewed together.
2. Static audit (grep-based, confirm no remaining `lab/sources.js` import in any production/production-adjacent path except the migration scripts, confirm `sources_registry_staging` is no longer referenced by the adapter).
3. ChatGPT review of the diff.
4. Deploy (this is a Vercel/Node code change, not a SQL migration — no Izzat Supabase action needed for Items 1-2, only a `git push`/deploy).
5. Verification (below) — run after deploy.
6. Only after verification passes: Item 3's actual retirement (separate SQL drop, needs Izzat to apply via Supabase SQL Editor, same discipline as all prior schema changes).
7. Item 4 doc-only change can land any time, independent of the others.

## Verification plan (per ChatGPT's explicit requirement — prove authority is unified, not just that imports changed)

1. Via the (now production-pointed) admin adapter, call `setSourceStatus()` on a real source (a low-stakes one, e.g. toggle a currently-active minor source to `disabled` with a test reason, then immediately back to `active` — never leave a real source disabled as a side effect of testing).
2. Read-verify directly: `select id, status, updated_at from sources where id = '<test-id>'` — confirm the row actually changed in `public.sources` (not staging).
3. Run `db/ingest-production.js` (or a dry-run mode if one exists) and confirm its fetched source list reflects the change made in step 1 — this is the step that actually proves "admin edit reaches the pipeline," not just "admin edit reached a database."
4. Run `db/daily-observation.mjs` and confirm its `registryStatus` map reflects the same DB state (not `lab/sources.js`'s hardcoded state) — a concrete way to check: temporarily this could be verified by comparing observation output against a known DB-vs-file divergence, but since after Item 2 the file is no longer read at all, the simplest proof is: grep the running process's actual import graph / or add a one-line temporary log of the fetched map size and compare against `select count(*) from sources` — remove the temporary log after.
5. Confirm `sources_registry_staging` receives zero writes during this entire test (query it before/after, expect no change) — proves the adapter is no longer touching the old table at all.
6. Full `npm test`.
7. Revert the test source's status back to its original value, confirm via direct read.

Each step's expected result and actual result get recorded in a short post-apply verification doc (`docs/control-plane-phase1-cutover-completion-verification-v1.md`) once this runs for real, same pattern as Phase 3's closure report.
