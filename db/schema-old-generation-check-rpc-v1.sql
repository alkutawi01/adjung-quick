-- schema-old-generation-check-rpc-v1.sql — Polish 9D-2, 2026-08-20.
--
-- Read-only existence check surfaced in the Admin Ringkasan panel: does a
-- stale *_old generation exist right now, which would block the NEXT
-- ingestion swap? Per db/schema-ingestion-staging-functions-v1.sql,
-- swap_ingestion_staging() refuses to proceed while ANY of the three
-- `_old` tables exist (its real guard is a three-way OR:
-- `to_regclass('public.sources_old') IS NOT NULL OR
-- to_regclass('public.story_clusters_old') IS NOT NULL OR
-- to_regclass('public.rss_items_old') IS NOT NULL`) — this function
-- checks all three, matching that guard exactly, not just one of them.
-- (Adversarial review caught an earlier version of this file checking
-- only story_clusters_old: safe today only because swap_ingestion_staging()
-- and drop_ingestion_old_tables() both create/drop all three tables in
-- one function call each, keeping them in lockstep — but that lockstep is
-- an invariant of THOSE functions, not something this read-only check can
-- rely on staying true forever. Checking all three directly means this
-- indicator stays correct even if that invariant is ever broken later.)
-- That refusal is only discovered AFTER a human attempts ingestion, which
-- is literally why db/drop-ingestion-old-tables.mjs had to be run twice
-- mid-session tonight (docs/polish-9-audit-v1.md, risk #2). This surfaces
-- the same fact proactively, before the attempt, in Admin Ringkasan.
--
-- SECURITY DEFINER, not a direct table grant: story_clusters_old is
-- created dynamically (renamed into existence at swap time, dropped by
-- db/drop-ingestion-old-tables.mjs) — granting the authenticated role
-- table-level access to a table that may not exist, whose grants depend
-- on whatever the live table's grants happened to be at rename time, is
-- exactly the kind of implicit-grant fragility this project's
-- "Automatically expose new tables OFF" posture (docs/supabase-project.md)
-- exists to avoid. This function returns ONLY a boolean — no data
-- exposure risk at all — so a direct, explicit grant is safe and simple,
-- same posture as every other admin-facing RPC in this project
-- (schema-classification-rules-rpc-authenticated-patch-v1.sql,
-- schema-edition-rules-rpc-v1.sql).
--
-- PURELY ADDITIVE — no existing table touched, no column changed.

BEGIN;

CREATE OR REPLACE FUNCTION check_old_generation_exists()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN to_regclass('public.sources_old') IS NOT NULL
      OR to_regclass('public.story_clusters_old') IS NOT NULL
      OR to_regclass('public.rss_items_old') IS NOT NULL;
END;
$$;

-- authenticated only, not anon — this is an Admin-only operational fact
-- (per ui/src/admin/adminSupabase.js, the Admin UI always calls RPCs as a
-- logged-in `authenticated` session, never `anon`), and there is no
-- reason for the public reader-facing site to ever need it.
REVOKE EXECUTE ON FUNCTION check_old_generation_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_old_generation_exists() TO authenticated;

COMMIT;
