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
-- replacement field for a reclassify.
--
-- AMENDED 2026-08-13 (docs/override-expiry-enforcement-bugfix-v1.md):
-- added the expires_at predicate. The view previously filtered on
-- `active` alone, so an override whose expires_at had long passed still
-- applied to readers forever — storing an expiry date does not expire
-- anything; only the read path enforces it. Found while planning Pin
-- (24h expiry would have exposed it within a day), but it affects
-- hide/reclassify/boost, all already live.
--
-- The `expires_at IS NULL OR` branch is unreachable today
-- (story_overrides.expires_at is NOT NULL) and deliberately kept: not
-- every override type is meant to expire the same way — source_overrides
-- never expires at all — so the predicate encodes "no expiry means
-- permanent", never "no expiry means instantly stale".

BEGIN;

CREATE OR REPLACE VIEW public_active_overrides AS
  SELECT story_id, edition_id, override_type, new_field
  FROM story_overrides
  WHERE active = true
    AND (expires_at IS NULL OR expires_at > now());

GRANT SELECT ON public_active_overrides TO anon;

COMMIT;
