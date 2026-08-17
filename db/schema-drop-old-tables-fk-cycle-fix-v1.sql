-- schema-drop-old-tables-fk-cycle-fix-v1.sql
--
-- Fixes a pre-existing (pre-Phase-1, unrelated to Backend Control Plane)
-- bug in drop_ingestion_old_tables() found live 2026-08-17: it issues
-- three SEPARATE `DROP TABLE IF EXISTS` statements
-- (story_clusters_old, then rss_items_old, then sources_old), but
-- story_clusters_old and rss_items_old have a CIRCULAR foreign-key
-- dependency — the exact same fact reset_ingestion_staging() already
-- documents and solves for the *_staging tables via one multi-table
-- DROP (db/schema-ingestion-staging-functions-v1.sql:42). Dropping
-- story_clusters_old alone fails: "cannot drop table story_clusters_old
-- because other objects depend on it — constraint
-- rss_items_cluster_id_fkey on table rss_items_old depends on table
-- story_clusters_old".
--
-- Fix: one atomic multi-table DROP ... CASCADE, scoped to exactly these
-- three tables — per ChatGPT's explicit instruction (2026-08-17), CASCADE
-- must not be used more broadly than resolving this known cycle. Verified
-- safe: nothing outside this three-table set references them — every
-- external FK into story_clusters (story_overrides/saved_stories/
-- history_entries/edition_story_classifications) is repointed to the
-- LIVE `story_clusters` at swap time by repoint_story_clusters_fks()
-- (schema-ingestion-staging-functions-v1.sql:151-265), never left
-- pointing at the demoted `_old` generation.
--
-- Scope, per ChatGPT: drop_ingestion_old_tables() ONLY. Preflight safety
-- checks (row counts, dangling-reference scan in
-- db/drop-ingestion-old-tables.mjs) are unchanged — this patches only
-- the mechanical DROP order inside the RPC itself.

BEGIN;

CREATE OR REPLACE FUNCTION drop_ingestion_old_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Single atomic DROP, not three separate statements — story_clusters_old
  -- and rss_items_old have a circular FK (story_clusters_old.representative_rss_item_id
  -- -> rss_items_old, rss_items_old.cluster_id -> story_clusters_old),
  -- so no ordering of individual DROPs can succeed. CASCADE here only
  -- resolves that known internal cycle across exactly these 3 tables —
  -- nothing external references any of them by this point (swap has
  -- already repointed all live-facing FKs away from the _old generation).
  DROP TABLE IF EXISTS story_clusters_old, rss_items_old, sources_old CASCADE;
  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION drop_ingestion_old_tables() TO service_role;

COMMIT;
