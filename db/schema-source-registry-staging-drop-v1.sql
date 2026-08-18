-- schema-source-registry-staging-drop-v1.sql — Backend Control Plane
-- Phase 1, Item 3 housekeeping (per ChatGPT's explicit recommendation
-- after Phase 1 cutover completion closed, docs/control-plane-phase1-
-- cutover-completion-verification-v1.md).
--
-- Pre-drop checks completed (all read-only, no code change needed):
-- 1. schema-source-registry-staging-v1.sql already carries a STATUS note
--    marking the table pending-retirement (added alongside commit
--    a8746e7).
-- 2. db/backfill-source-registry-staging.mjs is the only remaining
--    writer — a manual, one-off migration script, never invoked by any
--    running production/scheduled process (grep-confirmed).
-- 3. No migration/deployment script recreates this table automatically
--    — this project applies schema SQL manually via the Supabase SQL
--    Editor only; there is no CI/deploy step that runs .sql files.
--
-- Live verification (docs/control-plane-phase1-cutover-completion-
-- verification-v1.md) already confirmed zero writes reach this table
-- through the real admin adapter. Dropping it removes the last artifact
-- that could make a future developer believe the old staging path is
-- still live.
--
-- STATUS: NOT YET APPLIED. Apply via Supabase SQL Editor only after
-- explicit approval, per this project's established discipline.

BEGIN;

DROP TABLE IF EXISTS public.sources_registry_staging;

COMMIT;
