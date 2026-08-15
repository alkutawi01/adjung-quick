# Ingestion Staging + Swap — Implementation Plan v1 (2026-08-15)

Status: `[x] Plan` `[x] Approved` `[x] Staging schema + functions applied` `[x] Dry run verified` `[ ] Live swap not yet executed`

## Implementation note (2026-08-15)

Migration applied (`db/schema-ingestion-staging-functions-v1.sql`) and
`ingest-production.js` rewritten for staging+swap. Two real bugs found
ONLY by actually running this against production, not by review:

1. **PostgREST schema cache**: a table created via RPC is invisible to
   `supabase-js`'s `.from()` calls until the cache reloads — the first
   dry-run attempt failed on `PGRST205 Could not find the table`. Fixed
   with `NOTIFY pgrst, 'reload schema'` at the end of every DDL-mutating
   function (reset/swap/rollback/drop).
2. **Circular FK drop order**: `story_clusters_staging` and
   `rss_items_staging` reference each other (the same circular
   representative-item pattern the live schema has) — separate
   `DROP TABLE` statements fail regardless of order. Fixed with a single
   multi-table `DROP TABLE ... CASCADE`.

Dry run (`node db/ingest-production.js --dry-run`) succeeded with real
evidence: 886 clusters / 941 RSS items staged, exact match against the
lab ground truth, staging validation passed, stopped cleanly before any
swap — production completely untouched throughout both failed attempts
and the successful one.

**Live swap has NOT been executed yet** — held for one more explicit
confirmation cycle given this is the highest-stakes change this project
has made (real schema mutation + FK repointing, first time tested
against production, no database backup exists per the FASA 4.2 audit).

FASA 4.2, per ChatGPT's approval of the staging+swap architecture
(`docs/ingestion-architecture-decision-v1.md`): this plan answers the
five implementation questions asked, still without writing any code.

One correction carried forward from ChatGPT's own review, applying to
`db/classify-production.js`'s existing delete+upsert on
`edition_story_classifications`: it stays as-is for this pass, but must
be understood as an **accepted temporary exception**, not as an
already-safe pattern. The audit already showed delete+upsert can leave
stale rows behind, and classification is generated state that can
mismatch if taxonomy changes — recorded here so it isn't quietly
treated as "already solved" later.

## 1. Staging schema

**Table suffix on the same schema, not a separate PostgreSQL schema or
`CREATE TEMP TABLE`.**

| Option | Why not |
|---|---|
| `CREATE TEMP TABLE` | Session-scoped — gone the moment the ingest script's connection closes. The swap needs the staged data to survive until a validation step (possibly a separate process/run) confirms it, then get promoted. Temp tables can't do that. |
| Separate Postgres schema (e.g. `staging.story_clusters`) | Real option, but adds a second surface every tool touching the DB (Supabase client config, RLS policies, `information_schema` queries used in past verification work) has to know about. No functional advantage over a suffix for this project's scale — one ingest run, one edition set, not multi-tenant staging. |
| **Table suffix** (`sources_staging`, `story_clusters_staging`, `rss_items_staging`) | Same schema, same RLS/grant machinery already understood and already verified working this project. A swap is a rename (`ALTER TABLE ... RENAME TO ...`), not a schema-qualification change every query needs to learn. **Chosen.** |

Staging tables are structurally identical copies of
`sources`/`story_clusters`/`rss_items` (same columns, same checks) —
purely additive schema, no existing table altered. They carry no RLS
policies granting reader/admin access; only the ingest script's
service-role client ever touches them, same access model as the
current production tables already have from that script's side.

## 2. Swap mechanism

**Three-way rename inside a single transaction** — the standard
atomic-swap pattern, chosen because it needs no application code to
understand a new "which generation is current" concept; readers keep
querying `story_clusters` by name, unaware anything happened:

```sql
BEGIN;
ALTER TABLE story_clusters RENAME TO story_clusters_old;
ALTER TABLE story_clusters_staging RENAME TO story_clusters;
-- (repeat for sources, rss_items)
COMMIT;
```

**Why this gives real atomicity**: a single transaction's DDL is atomic
in Postgres — no reader-visible state exists where `story_clusters` is
either missing or half-renamed. A concurrent `SELECT` either sees the
pre-swap table (transaction not yet committed) or the post-swap table
(committed) — never a table that doesn't exist. This directly answers
"how does the reader not see a half-complete state": the reader's own
query never observes the transaction mid-flight, by Postgres's own
transactional DDL guarantee, not by any coordination this project has
to build.

`story_clusters_old`/`rss_items_old`/`sources_old` are then the
rollback target (see §3) rather than being dropped immediately — a
change from the architecture decision doc's original "drop immediately
post-swap" framing, tightened here because §4 below found a real reason
to keep them one cycle longer.

## 3. Failure handling

| Failure point | What happens | Recovery |
|---|---|---|
| **RSS fetch fails** (some/all sources) | Staging tables end up incomplete or partially populated | Never swap — a pre-swap validation gate (row counts within a sane range of the last successful run, extending the check `evaluateDestructiveRebuildGuard` already does today) refuses the swap and the run ends with production untouched |
| **Classification fails** (downstream, after swap) | `story_clusters`/`rss_items` are already correctly swapped; `edition_story_classifications` is stale relative to the new clusters | Reader-facing risk is bounded to "some stories show no classification yet," not an empty feed — classification re-runs independently and its own delete+upsert (the accepted exception above) catches up on the next attempt |
| **Staging half-populated** (script crash mid-fetch) | Staging tables contain partial data, production untouched (staging was never renamed in) | Next run's staging step starts by dropping/recreating `*_staging` tables before fetching — no manual cleanup needed, since staging is disposable by construction |
| **Swap itself fails** (e.g. a lock conflict, an unexpected FK violation during rename) | Transaction rolls back entirely — Postgres transactional DDL means a failed `COMMIT` leaves every table exactly as it was before `BEGIN` | No action needed; production was never touched. This is the scenario staging+swap was built to make survivable, and it's also the cheapest to recover from — a rollback is automatic, not scripted |
| **Post-swap rollback** (classification or a downstream check finds the new generation structurally wrong AFTER commit) | The `_old` tables from §2 are still present (kept one cycle, not dropped immediately) | A second rename swaps back: `story_clusters` → `story_clusters_bad`, `story_clusters_old` → `story_clusters`. Requires the `_old` retention decided in §2; this is the concrete reason that retention exists |

## 4. Existing references — what a swap must not silently break

Checked against the actual schema, not assumed:

| Reference | Type | Risk under swap |
|---|---|---|
| `rss_items.cluster_id → story_clusters.id` | FK, `ON DELETE CASCADE` | Internal to the Generated layer — both tables swap together in the same transaction, so this FK is never left dangling mid-swap |
| `story_clusters.representative_rss_item_id → rss_items.id` | FK (circular, added post-creation) | Same — both swap together |
| `edition_story_classifications.story_id → story_clusters.id` | FK, `ON DELETE CASCADE` | This table is NOT part of the swap (stays delete+upsert, the accepted exception) — a classification row can briefly reference a `story_id` from the just-swapped-in generation before the next classify run catches up. Not a broken reference (the ID exists), just stale content, same as today |
| `story_overrides.story_id → story_clusters.id` | FK, **no `ON DELETE` action specified** | **Real finding**: `story_clusters.id` is a deterministic `clusterKey` (from `lab/engine.js`), not a fresh UUID per run — the SAME underlying story re-clustered in a new run gets the SAME id, so most overrides survive a swap transparently. But a story that simply doesn't reappear in the new generation (rolled off naturally) means its `story_clusters` row is gone once `_old` is eventually dropped — an override still referencing it would then reference nothing. This is the EXACT problem `evaluateDestructiveRebuildGuard` was written to prevent for `saved_stories`/`history_entries`; **staging+swap does not remove this risk for `story_overrides`, it only postpones it to whenever `_old` is finally dropped**, and no policy for "when is it safe to drop `_old`" exists yet. Flagged for approval, not resolved here. |
| `saved_stories.story_id → story_clusters.id` | FK, **no `ON DELETE` action** (per `schema-identity.sql`'s own comment, already an open lifecycle question) | Same risk as above — swap doesn't solve this, only changes its shape from "guard refuses the run outright" (today) to "silent dangling reference whenever `_old` is dropped" (under swap), which is arguably worse if not handled deliberately |
| `history_entries.story_id → story_clusters.id` | FK, **no `ON DELETE` action** | Same |
| `ui/src/adapter/productionAdapter.js`'s `fetchRankedQueue()` | Reader query | Queries `story_clusters`/`rss_items`/`sources` by table name — no change needed, a rename swap is invisible to it |
| `public_active_overrides` view (over `story_overrides`) | View | Doesn't reference the Generated tables directly — unaffected by the swap itself, but inherits the dangling-reference risk above if the `story_overrides` row it exposes points at a dropped cluster |
| Admin adapters (`reviewQueueAdapter.js`, `editorialActivityAdapter.js`) | Reader queries | Same as productionAdapter — table-name queries, no change needed |

**This is the single most important finding of this plan**: staging+swap
solves the atomicity/rollback problem completely, but does **not** by
itself solve the FK-dangling problem the original destructive-rebuild
guard exists for. `evaluateDestructiveRebuildGuard`'s current
"refuse if `saved_stories`/`history_entries` have rows" behavior should
**stay in place** even after staging+swap ships — not as a redundant
leftover, but because it protects against exactly this gap. Whether
`_old` tables can ever be safely dropped once real user data exists is
an open question this plan surfaces rather than answers.

## 4b. Old Table Lifecycle Policy

Per ChatGPT's explicit instruction, added before any coding: this is
the first time FASA 4 touches production data more sensitive than FASA
3 touched. FASA 3 protected human editorial decisions; FASA 4.2
protects the system's own memory of what it was serving a moment ago.
`_old` tables exist so a mistake found *after* the swap already
committed still has a way back — that only holds if their lifecycle is
deliberate, not incidental.

**Who can drop `_old` tables?** A human, running a script manually.
Never automated, never time-based.

**Why not automated/time-based**: per ChatGPT — *"production reality
tidak ikut jam"* (production reality doesn't follow a clock). A
`swap → sleep 24h → auto-drop` timer would drop `_old` exactly when a
slow-to-surface anomaly (a classification mismatch only visible after
the next classify run, a reader-reported issue that took a day to
reach an admin) is most likely to still need it. Time elapsed is not
evidence anything is fine.

**Verification criteria — ALL must hold before a manual drop is even
considered** (this is a checklist a human runs through, not something
this plan claims can be fully automated):

1. The swap committed successfully (not silently rolled back)
2. Reader surfaces are normal: `/`, edition switching, the Active Set
3. Admin surfaces are normal: Review Queue, Digest, Timeline
4. Editorial state is intact: `story_overrides`, `saved_stories`,
   `history_entries` rows created before the swap still resolve to
   real `story_clusters` rows after it (the §4 FK-dangling risk,
   checked directly, not assumed)
5. **At least one full ingestion cycle after this one has also
   succeeded** — a single successful swap isn't proof the new mechanism
   is stable; a second one that also swaps cleanly is much stronger
   evidence
6. No FK/reference anomaly reported by any of the above

**Rollback window**: `_old` tables remain until a human explicitly
drops them per the above — there is no fixed time bound. If criterion
4 or 6 fails at any point, the swap-back path from §3 ("Post-swap
rollback") uses these same `_old` tables — which is the entire reason
they aren't dropped automatically.

**Drop mechanism**: manual only for V1 — a human runs a dedicated,
explicit script (not folded into `ingest-production.js` itself) after
confirming the checklist above, gated by the same
`production-write-guard.mjs` discipline every other write script in
this project already uses. No auto-drop path exists or is proposed.

## 5. Deployment strategy

1. **Migration first**: apply the staging schema (`sources_staging`,
   `story_clusters_staging`, `rss_items_staging`, structurally identical
   to production, no RLS grants beyond service-role) as its own
   purely-additive migration — no production table touched.
2. **Dry run**: run the fetch+build step targeting the staging tables
   only, with the swap step disabled/commented out — confirms staging
   populates correctly against the real Supabase project without any
   risk to production, since production is never renamed.
3. **Production switch**: enable the swap step. First live run is
   watched manually (not left unattended) — this is a real architecture
   change to how ingestion behaves, warranting the same caution the
   Digest/Timeline live-verification passes this phase already used.
4. **Verification**, per the same discipline every migration this phase
   has used — real evidence, not assumption:
   - Row counts in the new `story_clusters`/`rss_items`/`sources` are
     within a sane range of the pre-swap counts
   - Reader (`/`) returns a non-empty, correct-looking feed immediately
     post-swap
   - Admin (Review Queue, Digest, Timeline) unaffected
   - `story_overrides`/`saved_stories`/`history_entries` rows created
     before the swap still resolve to real `story_clusters` rows
     post-swap (the §4 risk, checked directly rather than assumed away)
   - A deliberately-failed dry run (e.g. killing the script mid-fetch)
     leaves production completely untouched — the actual claim this
     whole design exists to make, verified, not just architected

`ingest-production.js` itself is not modified until this plan is
approved and steps 1-2 above are complete — today's DELETE+INSERT stays
exactly as-is in the interim.

## What this plan does NOT do

- No code written, no `ingest-production.js` change
- No staging tables created
- No swap executed
- No retention policy added (still deferred to a future phase, per
  ChatGPT's explicit "jangan tambah retention sekarang")
- Does not resolve the `_old`-table-drop-timing question for
  `story_overrides`/`saved_stories`/`history_entries` — flagged, not
  decided

## Next

Awaiting approval — including the `_old`-retention-timing question §4
surfaces — before the staging schema migration (step 1 of §5) is
applied.
