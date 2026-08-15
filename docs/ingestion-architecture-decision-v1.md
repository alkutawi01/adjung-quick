# Ingestion Architecture Decision v1 (2026-08-15)

Status: `[x] Decision doc` `[ ] Approved` `[ ] Implemented` — **no code, no schema, no migration yet**

FASA 4.2, per ChatGPT's explicit instruction after the audit
(`docs/content-pipeline-reliability-plan-v1.md`) was approved as the
basis: before building staging+swap, produce a dedicated architecture
decision document, because staging+swap carries real implications this
project shouldn't walk into casually. This document answers the four
questions asked; it does not implement anything.

Also carrying forward two decisions ChatGPT already made on the audit's
open questions, since they shape §3 below:
- **Retention**: don't delete anything until the new ingestion
  lifecycle is stable. Retention policy is deferred to a later
  **FASA 4.2.3**, not decided or built here.
- **Source reliability**: already mature (registry, status handling,
  TLS handling, silent/known-broken detection, observation metrics all
  exist) — no new system needed now; recorded as a small future backlog
  (uptime trend, health history, automatic trust adjustment), not part
  of FASA 4.2's main work.

## 1. Current problem — what DELETE+INSERT actually risks

`db/ingest-production.js` runs, in order: `DELETE` on `sources`,
`story_clusters`, `rss_items`, then full re-`INSERT` of all three.
Concretely, between the delete and the completed insert:

- **Reader-empty window**: any reader request that lands mid-run sees
  an empty or partial feed — not a slow feed, an actually broken one.
- **All-or-nothing failure mode**: if the script crashes, times out, or
  loses connectivity partway through the re-`INSERT` (network blip,
  Supabase rate limit, process killed), the tables are left
  **permanently incomplete** — there is no partial-failure recovery,
  because the previous complete state was already deleted before the
  new one finished writing. This is the sharper form of ChatGPT's own
  question: *"Jika ingestion gagal separuh jalan, apa yang tinggal
  kepada pembaca, editor, dan sistem?"* — today's honest answer is
  **an incomplete database with no way back to the last-known-good
  state**, because that state no longer exists anywhere.
- **History loss by design**: every run erases what "yesterday's data"
  looked like. `daily-observation.mjs` and `operational_snapshots` only
  exist because nothing else remembers what changed day over day —
  they're a workaround for ingestion's own lack of history, not an
  independent feature.
- **Editorial data is structurally protected, not by luck**: the
  existing `evaluateDestructiveRebuildGuard`
  (`db/production-write-guard.mjs`) already refuses the `story_clusters`
  delete when `saved_stories`/`history_entries` have real rows, because
  both FK-reference `story_clusters` with no cascade. This is the right
  protection, but it's a **circuit breaker, not a fix** — it stops the
  script rather than letting ingestion and real user data coexist.

## 2. Comparing the three approaches

| | A. Incremental upsert | B. Staging + atomic swap | C. Append-only generated history |
|---|---|---|---|
| **Complexity** | Lowest — `ON CONFLICT` on a stable key (RSS GUID / cluster ID), no new tables | Medium — needs a second full table set per generated table, plus an atomic repoint step (table rename, or a view/pointer indirection every reader and script must respect) | Highest — every generated row needs a supersession marker (e.g. `superseded_at`/generation id), and every read query needs a "current only" filter added |
| **Data integrity** | **Weakest** — already found insufficient once: `classify-production.js`'s own history shows a plain upsert on `edition_story_classifications` left 2595 stale rows behind when a run only produced 867. The same gap applies to `rss_items`/`story_clusters`: a source or story that stops appearing wouldn't be removed. | Strong — the new set is validated complete before it ever becomes "current"; a bad run simply never gets swapped in | Strong — nothing is ever destroyed, so no upsert-gap failure mode exists at all |
| **Reader impact** | No empty window, but readers can see a **stale-plus-partial mix** (old rows never cleaned + new rows appearing) during a run — arguably worse than a clean empty window, since it looks correct but isn't | **None** — the swap is a single atomic step; readers see either the complete old set or the complete new set, never a mix | None — readers query "current" rows only, unaffected by history accumulating underneath |
| **Recovery impact** | A failed run leaves a half-updated table with no record of what "before" looked like — same history-loss problem as today, just without the empty window | A failed run leaves the OLD set fully intact and current — this is the only option that actually gives ingestion a real rollback, not just an avoided empty window | Best of the three — every past state is still queryable, not just the immediately-prior one; a bad run is a resumable/discardable branch, not a leap with no way back |

**Upsert is ruled out**, not just deprioritized: it has an already-proven
failure mode in this codebase and doesn't solve the reader-empty-window
problem it would need to justify its lower complexity.

## 3. Recommended final architecture

Confirms the boundary ChatGPT asked to keep explicit — it already
holds today and nothing here changes it:

| | Tables | Written by | Read by |
|---|---|---|---|
| **Generated** | `rss_items`, `story_clusters`, `sources`, `edition_story_classifications` | `ingest-production.js` / `classify-production.js` only | Reader (`productionAdapter.js`), admin (Review Queue, Digest, Timeline) |
| **Editorial / User** | `story_overrides`, `source_overrides`, `saved_stories`, `history_entries`, `editors` | Admin actions / reader identity flows only | Same, joined at read time |

**Recommendation for the Generated layer: staging + atomic swap for
`sources`/`story_clusters`/`rss_items`**, keeping
`edition_story_classifications`'s existing delete-then-upsert as-is —
it's a downstream recompute over already-swapped data with its own no
independent reader-empty risk (it doesn't sit directly under the live
reader query the same way `story_clusters` does).

Mechanism, at the level this decision doc should specify (not final
SQL — that's implementation):

1. Ingest into a **shadow set** — either a second physical table per
   generated table (`rss_items_staging`, etc.) or a `run_id`/generation
   column on the existing tables, filtered out of every current reader
   query until swapped.
2. Validate the shadow set is non-empty and structurally sane (row
   counts within a sane range of the last successful run — a bar
   already implicit in `evaluateDestructiveRebuildGuard`'s existence)
   before swapping.
3. **Atomic swap**: either a table rename inside one transaction, or —
   if append-only-style generation tracking is added later per §"Why
   not append-only now" below — a single `UPDATE` flipping which
   generation is "current."
4. Old data is dropped (or marked superseded) only AFTER the swap
   succeeds — this is what makes rollback real: a failed run never
   touches what's live.

**Why not append-only (option C) now**: it's the more architecturally
ambitious option, and directly correct for the eventual goal
(operational history, real day-over-day queries instead of a separate
`operational_snapshots` workaround) — but it depends on the retention
question ChatGPT already deferred to FASA 4.2.3. Building an
unbounded-growth append-only model before retention is decided would
be building on an unresolved question. Staging+swap solves the actual
named risk (reader-empty window, no rollback) without pre-deciding
retention; append-only is recorded as the likely FASA 4.2.3-and-beyond
evolution, not proposed for this pass.

## 4. Migration strategy

**Can this migrate without downtime?** Yes, in the sense that matters
most — the swap step itself is atomic and sub-second, so readers never
see an empty or partial state during a migrated run. There IS a
one-time transition cost: the very first staged run needs the shadow
tables to exist before ingestion can target them (a schema-only
addition, purely additive — no existing table touched).

**Does this need a new database?** No. Staging tables live in the same
Supabase project, same schema file family
(`db/schema-ingestion-staging-v1.sql` would be the natural name when
this is actually built) — purely additive, consistent with every other
migration this project has done.

**Rollback plan**: this is staging+swap's core advantage, not an
afterthought — if a staged run fails validation, it's simply never
swapped in; the previous complete generated-data set stays live and
untouched, no manual recovery step needed. A rollback of an ALREADY
completed swap (e.g. classification looks wrong after the fact) would
mean keeping the previous generation around for one extra cycle rather
than dropping it immediately post-swap — a small addition to step 4
above, worth deciding at implementation time rather than over-specifying
here.

**What this migration does NOT change**: nothing about the
Generated/Editorial boundary in §3 — `story_overrides` and friends stay
exactly as they are, read the same way, written the same way. This is
purely a Generated-layer internal mechanism change.

## What this plan does NOT do

- No code written, no schema applied
- No staging tables created
- No retention policy decided (FASA 4.2.3, explicitly deferred)
- No source-reliability system built (backlog item, not FASA 4.2 main work)
- Does not finalize exact table/column names — that's implementation detail, not architecture

## Next

Awaiting approval before any implementation (staging schema, swap
mechanism, updated `ingest-production.js`) begins.
