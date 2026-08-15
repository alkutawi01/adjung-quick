# Content Pipeline Reliability — Audit & Design Plan v1 (2026-08-15)

Status: `[x] Audit` `[ ] Approved` `[ ] Implemented` — **audit + design only, no code, no schema, no ingestion change**

FASA 4.2, per ChatGPT's explicit instruction: design review before any
incremental-ingestion work, because Fasa 3 already taught this project
"jangan ubah pipeline sebelum kita faham semua boundary." Everything
below is a factual account of what exists today, plus a recommendation
— nothing here has been applied.

## 1. Current ingestion lifecycle

`RSS fetch → clustering/ranking (in-memory) → Supabase write → classification → reader read`.

| Step | Script | Behaviour | Data kind |
|---|---|---|---|
| Fetch + rank | `db/ingest-production.js` | Fetches all `RSS_SOURCES` in parallel, builds the ranked queue in-memory via `lab/engine.js` | n/a (no DB write yet) |
| Write | `db/ingest-production.js` (~L79-159) | **Destructive full rebuild**: `DELETE` on `sources`, `story_clusters`, `rss_items`, then full re-`INSERT` of all three | **GENERATED** — legitimately regenerable |
| Classify | `db/classify-production.js` (~L152-163) | **Destructive-then-upsert**: `DELETE` on `edition_story_classifications`, then batched `upsert(..., { onConflict: 'story_id,edition_id' })` — a plain upsert alone was found to leave stale rows behind (a real bug once found: 2595 rows survived a run that only produced 867) | **GENERATED** |
| Read | `ui/src/adapter/productionAdapter.js`'s `fetchRankedQueue()` | Joins `sources` + `story_clusters` + `rss_items` + `edition_story_classifications`, and separately reads `public_active_overrides` (a view over `story_overrides`) | Reads GENERATED + **EDITORIAL** |

**The boundary that actually matters is already respected**: ingestion
and classification never write to `story_overrides`, `source_overrides`,
`saved_stories`, `history_entries`, or `editors` — only the admin
Review Queue writes those. A guard already exists
(`evaluateDestructiveRebuildGuard`, `db/production-write-guard.mjs`,
invoked from `ingest-production.js` ~L43-76): the destructive `DELETE`
on `story_clusters` is **refused** if `saved_stories`/`history_entries`
have any rows, because both FK-reference `story_clusters` with no
cascade — deleting clusters under real user data would either fail or
orphan it. `ALLOW_DESTRUCTIVE_REBUILD=true` can override this, but the
guard's own comments already name the real fix as incremental
ingestion, referencing a design doc (`docs/ingestion-lifecycle-v2-design.md`)
that predates this one.

**What "destructive" costs today, concretely**: between the `DELETE`
and the completed re-`INSERT`, the reader-facing tables are briefly
empty — a real, already-acknowledged risk (reader-empty window,
user-state risk, no history retained across runs) rather than a
hypothetical one.

## 2. Incremental ingestion design — three options compared

| Approach | How it would work here | Fit |
|---|---|---|
| **Plain upsert** (`ON CONFLICT`) | Insert/update rows keyed on a stable identity (e.g. RSS item GUID, cluster ID) | **Already tried and found insufficient once** — `classify-production.js`'s own history shows a plain upsert on `edition_story_classifications` left stale rows behind when the source set shrank. The same failure mode would hit `rss_items`/`story_clusters`: a source or story that stops appearing wouldn't be removed by an upsert alone. |
| **Staging + swap** | Write a full new set to a shadow table, then atomically repoint reads (rename tables / flip a "current" pointer) | Removes the reader-empty window entirely — the swap is instant. Closest to solving the actual named risk. Heavier: needs a second full table set and a swap mechanism (table rename or a view-based indirection), and every reader query and downstream `snapshot-production.mjs`/`daily-observation.mjs` script would need to agree on what "current" means. |
| **Append-only history** | Never delete `rss_items`/`story_clusters`; mark superseded rows instead (a `superseded_at` or generation counter) | Solves history-loss and enables real "what changed since yesterday" queries (useful for `operational_snapshots`' own values, which currently only exist because a separate script computes them daily). Growth-unbounded without an explicit retention/archival step — directly couples to the retention question in §3, so can't be decided independently of it. |

**Recommendation, not a decision**: staging + swap for `rss_items`/
`story_clusters` (removes the reader-empty window, the most concrete
named risk), keeping `edition_story_classifications`'s existing
delete-then-upsert pattern as-is for now, since it's a downstream
recompute over already-swapped data and has no independent
reader-empty risk of its own. Append-only is the more architecturally
ambitious option and probably the right eventual answer once retention
is settled — flagged as a later evolution, not proposed for this pass.

## 3. Data retention

**No retention policy is currently enforced on `rss_items` or
`story_clusters`.** `story_clusters.workspace_state` has a
`'expired'`/`'released'` state and `expires_at`/`review_expires_at`
columns (`db/schema.sql`), and `classify-production.js` already filters
out expired/released clusters when computing classifications — but no
script in the repository was found that actually *sets* those
columns to `'expired'` on a schedule. The state machine exists; nothing
drives it. `expired`/`released` clusters are excluded reader-side (via
the same filter classify-production.js applies) but **never physically
removed** — `rss_items`/`story_clusters` grow forever today by default.

The "~1 week shelf life" language that's been reused a few times this
project is specific to `story_overrides.expires_at` (an EDITORIAL
decision's own lifespan, `db/schema-editorial-state.sql`) and to
`snapshot-production.mjs`'s own 14-day Drive-backup pruning window —
**neither is an enforced TTL on the underlying news data itself.**
Conflating the two would be a real mistake this audit is naming
explicitly so it isn't assumed later.

**Open question, not answered here**: does old news need to remain
queryable indefinitely (a real archive), or is "no longer in any
edition's active/queued/review state" sufficient reason to physically
delete it? This has a real cost either way — indefinite retention grows
`rss_items` unbounded; deletion means a `story_overrides` row can end
up referencing a `story_id` that no longer exists in `story_clusters`
(the FK would need `ON DELETE` behavior decided, not currently
specified either). Flagged for approval.

## 4. Recovery

**There is currently no database backup of any kind** — confirmed
directly against the Supabase dashboard
(`docs/restore-rehearsal-v1.md`, Free Plan, no PITR/snapshot feature
available). What exists instead:

- `db/snapshot-production.mjs` — a **read-only export**, not a backup:
  `sources`, `story_clusters`, `rss_items`, `edition_story_classifications`,
  `saved_stories`, `history_entries` written to a local JSON file and
  copied to Google Drive (`G:\My Drive\Adjung Quick Backups`), 14-day
  rolling retention, run **manually** — no cron/scheduled job found in
  the repo. It explicitly does not capture schema, RLS policies,
  indexes, triggers, or Auth users.
- **Restore has never been tested**, and per the same doc, can't safely
  be rehearsed without either a real backup or a disposable environment
  — neither exists today.
- **What's lost if the database is destroyed right now**: everything.
  The JSON export is data-only and would need a hand-written
  reimport script that doesn't currently exist, run against a
  from-scratch schema (all `db/schema-*.sql` files would need to be
  replayed in the right order) with no rehearsal that this even works.

**Not proposing a fix here** — `docs/restore-rehearsal-v1.md` already
recorded the honest recommendation (Supabase Pro once real traffic
exists) and this plan doesn't re-decide it. Repeating it here only to
keep §4 complete, since ChatGPT's question was "audit," not "propose."

## 5. Source reliability

Already-existing infrastructure, not something to build:

- `lab/sources.js` — the source registry, with a per-source `status`
  field (e.g. `'active'` vs a broken status with a reason, as already
  used for JAKIM/islam.gov.my's TLS problem).
- `lab/rss.js`'s `fetchFeed()` skips any source whose registry
  `status !== 'active'` without attempting a fetch — a known-broken
  source doesn't generate daily noise.
- `db/daily-observation.mjs` already computes `silentSources` (active
  per the registry, but contributed zero items — the real alert-worthy
  signal) separately from `knownBrokenSources` (already flagged
  non-active, suppressed) by cross-referencing actual item counts
  against the registry.
- TLS handling: `lab/rss.js`'s `fetchWithExtraCa()` supplies a missing
  intermediate certificate for sources that declare one in the
  registry — deliberately not `rejectUnauthorized: false` (that would
  disable verification entirely, not fix the actual chain gap). A
  retry-exclusion list already treats TLS trust failures as a real,
  non-retryable answer about the source rather than a transient error.

**What this section does NOT find a gap in**: source reliability
detection is already reasonably mature. The open question for FASA 4.2
is narrower — should `daily-observation.mjs`'s existing
silent/known-broken split feed anything more automated (e.g. an admin
alert), or does the Digest Trend's `failed_sources_count` line already
cover the "admin needs to know" case? Left open, not decided here.

## What this plan does NOT do

- No code written, no ingestion script touched
- No schema migration
- No retention policy enforced
- No incremental-ingestion approach implemented — three options
  compared, one recommended, none applied
- No backup mechanism changed
- Does not re-litigate `docs/restore-rehearsal-v1.md`'s own
  recommendation, only restates it for completeness

## Next

Awaiting approval — including the two open questions (retention policy
for expired/released content, and whether source-reliability needs
anything beyond what already exists) — before any implementation
starts.
