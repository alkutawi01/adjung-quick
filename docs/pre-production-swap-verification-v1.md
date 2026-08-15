# Pre-Production Swap Verification (2026-08-15)

Status: `[x] Checklist complete` — **swap not yet executed, awaiting explicit approval**

Per ChatGPT's explicit instruction after reviewing the staging+swap
implementation: don't approve the live swap on implementation +
dry-run alone — run one more targeted verification pass focused on FK
behavior, PostgREST cache, and rollback, since a dry run proves staging
works but does NOT prove rename + FK repoint + reader path *after a
real commit*. This document is that pass. Real evidence throughout —
every claim below was checked against the live production database
just now, not assumed from code review.

## A. Backup / rollback acknowledgement

**Current backup: NONE.** Confirmed in the FASA 4.2 audit
(`docs/content-pipeline-reliability-plan-v1.md` §4,
`docs/restore-rehearsal-v1.md`) — Supabase Free Plan has no
point-in-time recovery or snapshot feature. This has not changed and
staging+swap does not change it either.

**What CAN roll back**: `db/rollback-ingestion-swap.mjs` — while `_old`
tables still exist (they are never auto-dropped), a human can restore
the previous generation and demote the bad one to `_bad` for
inspection. This is a real, tested-to-exist mechanism (the function
compiled and is callable), though it has not yet been exercised against
a real post-swap failure — that would only happen if the live swap is
run and something goes wrong, which hasn't happened yet.

**What CANNOT roll back**: anything after `_old` is manually dropped
(the drop is gated, per §4b of the implementation plan, but once done
it's final), or any failure mode unrelated to this mechanism entirely
(e.g. Supabase project-level incident). This is the same baseline risk
this project has always carried — staging+swap narrows the *ingestion's
own* failure blast radius, it does not add a database backup where none
existed.

**Mid-transaction failure**: automatic, not scripted. `swap_ingestion_staging()`
is a single Postgres function call, which Postgres always executes as
one implicit transaction — any error inside it (including a failed FK
validation, see §C) rolls back every statement in that call, leaving
production exactly as it was before the call started. This is a
Postgres guarantee, not application logic that could have a bug in it.

## B. Second dry-run

Run again just now, independently of the first (`docs/ingestion-staging-swap-implementation-plan-v1.md`'s
recorded run), against real current RSS content:

```
1247 items from 43/43 sources.
Lab (in-memory ground truth): 1247 raw items -> 880 clusters, top score 90.
Staged 43 sources.
Staged 880 story_clusters.
De-duplicated 93 cross-feed duplicate items.
Staged 932 rss_items.
Set representative_rss_item_id on all staged clusters.
Clusters: expected=880  staged=880  ✓
RSS items: expected=932  staged=932  ✓
✓ Staging valid. DRY RUN — stopping before swap. Production untouched.
```

Numbers differ from the first dry run (886/941 → 880/932) — expected
and correct: real RSS content changed between runs, this is the
pipeline actually tracking live news, not a discrepancy to explain
away. Validation passed cleanly both times.

## C. FK verification

**Before swap** — queried `pg_constraint` directly against production
for every FK referencing `story_clusters`:

| Referencing table | Constraint | Handled by repoint? |
|---|---|---|
| `edition_story_classifications` | `edition_story_classifications_story_id_fkey` | Yes |
| `history_entries` | `history_entries_story_id_fkey` | Yes |
| `rss_items` | `rss_items_cluster_id_fkey` | N/A — internal to the swap set, moves with it automatically |
| `saved_stories` | `saved_stories_story_id_fkey` | Yes |
| `story_overrides` | `story_overrides_story_id_fkey` | Yes |

Exactly 5 FKs exist, exactly matching what `repoint_story_clusters_fks()`
was written to handle (4 external + `rss_items` correctly excluded).
No surprise seventh table found.

**Real data check — the part that actually matters**: `saved_stories`
and `history_entries` are both empty (`0` rows) — no risk there yet.
But `story_overrides` has **2 real rows**, both referencing the same
`story_id`: `www.pressdisplay.com/pressdisplay/viewer.aspx`. Re-adding
this FK during repoint means Postgres **validates every existing row**
against the new `story_clusters` — if that `story_id` didn't exist in
the freshly staged generation, the `ADD CONSTRAINT` would fail, and
(correctly) roll back the entire swap.

Checked directly: that exact `story_id` exists in **both** the current
`story_clusters` and the just-staged `story_clusters_staging` from the
second dry run above. The real, current production override data would
survive this exact swap. This is evidence for *this specific run*, not
a permanent guarantee — a future override on a story that later rolls
out of the RSS window would hit this same risk, which is the same
`_old`-drop-timing question already flagged as open in the
implementation plan, not newly discovered here.

**"After swap in a safe environment"**: not possible to test literally
— no disposable/staging Postgres environment exists for this project
(confirmed in the FASA 4.2 audit). Stating this plainly rather than
skipping it: the only way to observe the actual post-swap FK state is
the real swap itself, verified in §E below.

## D. Production swap readiness

| Requirement | Status |
|---|---|
| `_old` tables not dropped automatically | Confirmed by code: `swap_ingestion_staging()` only ever creates `_old` (via rename); `DROP TABLE` only exists inside `drop_ingestion_old_tables()`, called only by the human-gated `db/drop-ingestion-old-tables.mjs` |
| Transaction rollback on failure | Confirmed — single function call = single implicit Postgres transaction (§A) |
| Schema reload after swap | Confirmed — `NOTIFY pgrst, 'reload schema'` is the last statement in `swap_ingestion_staging()`, `rollback_ingestion_swap()`, and `drop_ingestion_old_tables()` |

## E. Post-swap verification plan

Not yet executed (swap hasn't run) — this is the exact plan to run
immediately after, real checks against real state, same discipline
every other FASA 4 migration this phase used:

1. Reader (`/`) loads with real content, not empty
2. Edition switching works (ms-MY / en-global / ar-global)
3. Active Set renders correctly
4. Review Queue loads
5. Both real `story_overrides` rows still resolve — their hide/reclassify
   effect still visibly applies to the same story
6. `saved_stories`/`history_entries` row counts unchanged (sanity check,
   even though both are currently 0)
7. Re-run the §C query — confirm all 5 FKs now point at the NEW
   `story_clusters`, not `_old`
8. `npm test` — 0 failures
9. No console errors on reader or admin

## What this checklist does NOT do

- Does not execute the swap
- Does not drop any `_old` table
- Does not change retention policy
- Does not resolve the `_old`-drop-timing open question — same status
  as the implementation plan left it

## Next

Awaiting explicit approval for the live swap. Once approved: run
`node db/ingest-production.js` (without `--dry-run`), then execute the
§E checklist immediately and report real results.
