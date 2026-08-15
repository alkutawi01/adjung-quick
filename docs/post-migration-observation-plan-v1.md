# Post-Migration Observation Plan v1 (2026-08-15)

Status: `[x] Plan` `[x] Approved` — **observation only, no new features, no retention, no classification pipeline change**

## Update (2026-08-15) — second lifecycle validated via dry-run, not a second swap

ChatGPT approved running a real second-cycle swap to test lifecycle
stability, but this surfaced a real conflict: `swap_ingestion_staging()`
refuses to run while a previous `_old` generation still exists (by
design), and this exact observation window requires `_old` to stay
untouched. Flagged rather than resolved unilaterally; ChatGPT chose
**Option B**: validate the second lifecycle through a clean staging
rebuild + dry-run only (real bugs found and fixed: index-name collision
across a table rename, a PostgREST schema-cache race — see
`docs/content-pipeline-reliability-final-verification-v1.md`'s "Second
lifecycle" section), and defer any second real production swap until
the Old Table Lifecycle Policy permits `_old` removal or rotation.
Observation window (16–20 Ogos) continues unchanged.

FASA 4.2, per ChatGPT's instruction immediately after the staging+swap
migration's real execution: before building anything new, define what
"stable" actually looks like and watch for it — the two live issues
found during post-swap verification (missing anon/authenticated grant,
the FK-repoint filter dropping an unrelated constraint) are exactly the
kind of boundary failure ChatGPT named: *"Sistem production biasanya
rosak bukan di tengah komponen, tetapi di tempat dua komponen
bertemu"* (production systems usually break not inside a component, but
where two components meet). Both were caught live because verification
was mandatory — this plan exists to keep watching a little longer
before declaring the migration fully settled.

## Observation period

**5 days** (2026-08-16 through 2026-08-20), within ChatGPT's suggested
3–7 day range. Reasoning: the migration's core mechanism (staging +
atomic swap + FK repoint) has now run successfully once for real, but
"successful once" and "stable" aren't the same claim — a second and
third real ingestion cycle, run under normal unattended conditions
rather than this session's close hand-holding, is the actual evidence
that would justify calling this settled. 5 days covers several natural
cycles without indefinitely blocking FASA 4.3.

## Metrics monitored

All of these are already-existing read paths (Digest, `daily-observation.mjs`,
direct queries) — this plan does not add new instrumentation, only
specifies what to watch and why, per the same "generated data ≠ new
detection engine" discipline this project has held all along.

| Metric | Source | Why it matters here specifically |
|---|---|---|
| **Ingestion success** | Exit code / console output of each `node db/ingest-production.js` run | The staging+swap mechanism itself has only been proven once for real — repeated clean runs are the actual stability evidence |
| **Cluster count trend** | `story_clusters` row count, day over day | A cluster count that suddenly collapses or spikes unexpectedly could indicate the staging validation step (row-count sanity check) isn't catching something it should |
| **RSS item count** | `rss_items` row count | Same reasoning, second signal |
| **Reader error** | Console errors / failed loads on `/`, checked manually or via the existing verification pattern this session used | The exact failure mode that already happened once (missing GRANT) — watching confirms the fix (`GRANT` now inside `reset_ingestion_staging()`) actually holds across a real unattended cycle, not just the one this session forced by hand |
| **Editorial override integrity** | `story_overrides` rows still resolving to real `story_clusters` rows (the same query used in the final verification doc) | Confirms `repoint_story_clusters_fks()`'s fix holds, and specifically that the corrected column-filtered version doesn't have its own undiscovered edge case |
| **FK anomaly** | `pg_constraint` check confirming `story_overrides`/`saved_stories`/`history_entries`/`edition_story_classifications` FKs point at the live `story_clusters`, and that `story_overrides.created_by → editors` still exists | Directly re-checks both real bugs found this session don't recur or regress |

## Conditions that require action (not just observation)

| Condition | Response |
|---|---|
| Reader fails to load / shows a permission or fetch error | Stop, diagnose immediately — this is the exact class of bug already found once; treat any recurrence as high priority, not routine |
| An editorial override (hide/reclassify/boost/pin) stops resolving or its effect disappears | Check FK state first (`repoint_story_clusters_fks()`'s output), since this is the exact failure mode already seen |
| Row counts move abnormally (a swap producing a cluster count wildly outside the recent range, not just normal day-to-day RSS variance) | Investigate before the next scheduled ingestion run — do not let a second bad swap happen while the first is still unexplained |
| A staging swap fails | Expected to fail SAFELY per the design (production untouched) — but any failure, safe or not, should be read as new information about a real edge case, the same way the `edition_story_classifications` orphan issue was, not dismissed as noise |

## `_old` table status

**Kept as-is, untouched, for the entire observation period.** Per
ChatGPT's explicit instruction — `_old` tables are not evaluated for
drop until observation is complete AND the Old Table Lifecycle Policy's
own checklist (`docs/ingestion-staging-swap-implementation-plan-v1.md`
§4b) independently passes. The two checklists are related but not the
same: this plan's 5-day window is about trusting the *mechanism*; §4b's
checklist is about trusting *this specific swap's* result. Both must
clear before any drop is even considered.

## Known follow-up, recorded not built

Per ChatGPT's explicit instruction: **Classification generated state
reconciliation** — the `edition_story_classifications` orphan issue
(Attempt 1's failure) is patched for *this* migration's specific case
(the `DELETE ... WHERE story_id NOT IN (...)` inside
`repoint_story_clusters_fks()`), but the underlying fact — that
`classify-production.js` and `ingest-production.js` run independently
and can drift out of sync — is a real, recurring risk any time the
taxonomy changes or a source disappears, not a one-time fluke. Named
here so it isn't rediscovered as a surprise; not addressed in FASA 4.2.

## What this plan does NOT do

- No new feature work
- No retention policy
- No classification pipeline redesign
- No Editorial Desk work
- No `_old` table dropped
- Does not add new instrumentation — watches existing read paths only

## Next

Observe per the metrics/conditions above through 2026-08-20. No
further FASA 4.2 implementation work until this window closes or a
condition above triggers earlier action.
