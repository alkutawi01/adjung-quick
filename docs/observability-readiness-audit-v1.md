# Observability Readiness Audit v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: **not** an implementation task — just checking what's
already queryable today, ahead of the "observe real data over the next
few days" period (`docs/post-launch-stability-checkpoint-v1.md`). No
monitoring system built here, no schedule set up — just answering three
concrete questions.

## Q1: Can we query cluster counts today?

**Yes.** `story_clusters` count is a plain, instant Supabase query —
`865` as of this check. Already the basis of
`db/snapshot-production.mjs`'s own summary output, no new tooling
needed.

## Q2: Can we detect a field suddenly going empty?

**Yes.** `edition_story_classifications` filtered by `edition_id` +
`classification_status='classified'`, grouped by `field`, is a plain
query — confirmed working, returned 15 distinct fields with real counts
in this check. This is exactly the shape `db/classify-production.js`'s
dry-run mode already prints per edition — no new tooling needed to
*read* this; only a scheduled comparison against yesterday's numbers
would need building (not built here, per instruction).

## Q3: Is there a place to store daily snapshot metadata?

**Partially.** No dedicated database table exists (`snapshot_metadata`
checked directly — does not exist). But `db/snapshot-production.mjs`
already embeds its own metadata *inside* each snapshot file
(`snapshotDate`, `source`, `rulesetVersions`, per-table `counts`) — so
metadata isn't lost, it just isn't queryable via SQL or aggregated
across multiple days in one place. Each snapshot run overwrites the
previous one (`db/snapshots/production-snapshot.json`, single file, not
dated/versioned on disk).

## Summary — what this means for monitoring, without building it yet

Everything the monitoring plan (`docs/post-launch-monitoring-plan-v1.md`)
needs to check is **already queryable today** with existing scripts
(`db/snapshot-production.mjs`, `db/classify-production.js` dry-run).
Nothing here is blocked on new infrastructure. The only real gap: no
history is kept across runs — each snapshot overwrites the last, so
"is today different from yesterday" currently requires a human to
remember yesterday's numbers (or read them from
`docs/post-launch-stability-checkpoint-v1.md`'s recorded baseline).

**Not proposed as a task here, just named as the natural next step**
if daily observation becomes routine: timestamp each snapshot file
instead of overwriting (e.g. `production-snapshot-2026-08-13.json`) so
day-over-day comparison doesn't rely on memory. Left as a future
decision, not built now — per ChatGPT's explicit "audit, don't
implement" instruction for this step.
