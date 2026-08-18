# Phase 1 Source Registry — Cutover Completion: Pre-Implementation Findings

Read-only fact-finding, per ChatGPT's instruction before any implementation.
Corrects a stale claim in `docs/control-plane-completion-audit-phase1-3-v1.md`.

## Correction to the earlier audit's headline finding

`db/ingest-production.js` — the real production ingestion entrypoint — was
**already cut over on 2026-08-17**, before the Completion Audit ran. It no
longer imports `lab/sources.js`; it calls `fetchAllSourcesForIngestion()`
(`db/source-registry-adapter.mjs`), which reads live `public.sources`. The
production migration was run and verified (43/43 rows,
`db/verify-source-registry-production-migration.mjs` passing). The reader-
facing ranking path (`ui/src/adapter/productionAdapter.js` →
`supabase.from('sources')`) was also already 100% DB-driven for
`trust_score`, independent of this work.

So "Source Registry backend-controlled" is **not** false for the core
ingest/rank/read path. The Completion Audit's headline finding was accurate
at the moment it was written but is now stale.

## What is still actually broken

`db/source-registry-adapter.mjs`'s three admin write functions
(`addSource`, `updateSource`, `setSourceStatus`) still hardcode
`TABLE = 'sources_registry_staging'` — a table nothing in production reads.
**An admin using the Phase 1 write path today writes to a table that has no
effect on production ingestion**, because ingestion reads `public.sources`,
a completely separate table. No doc in the repo ever claimed the write side
was cut over — the production-cutover plan (2026-08-16) only scoped the
ingestion *read* path.

Two other real (non-dev-tooling) scripts still read `lab/sources.js`
directly and would silently miss any future admin edit:
- `db/daily-observation.mjs` — scheduled operational monitor, reads
  `RSS_SOURCES` for `status` only.
- `ranking/shadow-runner.mjs` — imports `RSS_SOURCES` for `trustScore`;
  called transitively by `daily-observation.mjs`, so not fully isolated
  despite its own "prototype" comment.

No schema gap: `public.sources` already has every column
(`known_category`, `source_type`, `exclude_patterns`, `extra_ca`, `status`,
`updated_at`) that `lab/sources.js` / `sources_registry_staging` has. This
is purely a "which table does each code path touch" problem, not a design
problem.

Two smaller items worth deciding, not blocking:
- `sources.active` (legacy boolean) and `status` are kept in sync by
  convention only, no DB constraint/trigger enforces it.
- `excludePatterns` round-trips through string-serialize/parse
  (`String(regex)` ↔ `parseExcludePattern()`) — works today (only
  `rss-kpm` uses it), worth being explicit about, not a blocker.

## Proposed narrow scope for the actual cutover-completion change

1. Repoint `db/source-registry-adapter.mjs`'s three write functions from
   `sources_registry_staging` to `public.sources`.
2. Repoint `db/daily-observation.mjs` and `ranking/shadow-runner.mjs` to
   read `status`/`trustScore` from `public.sources` (via the existing
   `fetchAllSourcesForIngestion()` or a similarly-shaped read helper)
   instead of `lab/sources.js`.
3. Decide fate of `sources_registry_staging` — retire it, or keep as a
   deliberately separate pre-prod testing table (current tests
   (`db/source-registry-staging.test.mjs`) exercise it in isolation; if
   retired, that test suite needs a decision too).
4. `lab/sources.js` remains as historical/migration-source fixture only —
   already effectively true for the runtime path; this makes it true for
   the admin-write and monitoring paths too.
5. No new table, no new column, no new RPC shape — only repointing which
   table 3-4 existing functions read/write.

Not proposing SQL or code changes yet — this is the fact base. Will write
the implementation plan next for review.
