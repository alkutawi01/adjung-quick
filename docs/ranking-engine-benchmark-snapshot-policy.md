# Ranking Engine Benchmark Snapshot Policy (2026-08-13)

Status: **Locked, per ChatGPT.** Triggered by a real observation while
running `ranking/benchmark-runner.mjs`: `docs/ranking-engine-benchmark-v1.md`
Group A's specific stories ("DAP dijangka kekal dalam kerajaan", "Wong
Chen mohon maaf") no longer existed in live production data by the time
the prototype ran — RSS had moved on, a normal re-ingestion cycle had
happened. Confirms a real gap: a benchmark written against "current
production data" silently goes stale as soon as that data changes.

## The rule

**A production-data ranking benchmark must snapshot exactly what it
tested against, not just describe it in prose.** Every benchmark case
sourced from live data must record:

- **Story ID** (`story_clusters.id` — stable within one ingestion cycle)
- **Timestamp** (`published_at` at the time the benchmark was written)
- **Source** (`source_id`)
- **Expected outcome** (ranking/selection expectation, as already
  captured in `docs/ranking-engine-benchmark-v1.md` / `v2.md`)
- **Snapshot date** (when this data was pulled — since production
  re-ingests and re-classifies, "current" is a moving target)

Same discipline already established for
`docs/production-classification-snapshot-v1.md` — a benchmark is a
frozen record of a specific evaluation, not a live query that happens to
match today.

## Why this matters specifically for ranking (more than for classification)

Classification snapshots test whether a STORY resolves to the right
FIELD — relatively stable once a story exists. Ranking benchmarks test
RELATIVE ORDERING and SELECTION among a POOL of stories that is
constantly changing (new RSS arrives, old stories age out of the
freshness window entirely). A ranking benchmark is much more likely to
silently go stale than a classification benchmark, simply because its
input pool churns faster.

## What this does NOT require

- No automated snapshot/replay tooling built now — this is a
  documentation/discipline decision, not a new script.
- No change to how `ranking/benchmark-runner.mjs` runs (it deliberately
  runs against LIVE current data — useful for "is the pipeline still
  functioning," distinct from "does this specific historical case still
  rank as expected," which needs the frozen story IDs this policy
  requires).

## Going forward

Any NEW ranking benchmark case pulled from production data must be
written with the fields above from the start — `docs/ranking-engine-benchmark-v1.md`
and `v2.md` are retroactively incomplete by this standard (they recorded
titles/sources/timestamps in prose but not as a structured, replayable
snapshot) and should be upgraded the next time either is materially
revised, rather than rewritten now as a standalone task.
