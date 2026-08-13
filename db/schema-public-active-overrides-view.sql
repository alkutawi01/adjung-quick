-- schema-public-active-overrides-view.sql — FASA 3.6.3a, continuation of
-- the same RLS hotfix (2026-08-13, same session, same authorized action:
-- "fix the RLS problem so the reader app can read overrides").
--
-- After schema-fix-editors-rls-recursion.sql, the recursion was gone but
-- the reader (anon) client got "permission denied for table
-- story_overrides" — CORRECT behaviour per story_overrides' own RLS
-- (signed-in editors only), and exactly the gap
-- db/schema-editorial-state.sql's own comment already named as deferred:
-- "Wiring overrides into the reader-facing feed is a separate, later step."
-- This is that step.
--
-- Rather than grant anon broad SELECT on story_overrides (which would also
-- expose `reason` and `created_by` — an editor's internal note and an
-- auth.users UUID — to anyone querying Supabase's REST API directly, even
-- though productionAdapter.js's own query never asks for those columns), a
-- narrow VIEW exposes only what a reader-facing resolve actually needs:
-- which story+edition is affected, which override type, and the
-- replacement field for a reclassify. Row-scoped to active=true only.

BEGIN;

CREATE OR REPLACE VIEW public_active_overrides AS
  SELECT story_id, edition_id, override_type, new_field
  FROM story_overrides
  WHERE active = true;

GRANT SELECT ON public_active_overrides TO anon;

COMMIT;
