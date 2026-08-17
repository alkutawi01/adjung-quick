-- migration-C-swap-reconciliation-fix-v1.sql
--
-- Backend Control Plane — Editorial State Orphan Lifecycle, Migration C.
-- Per docs/migration-C-swap-reconciliation-fix-design-and-plan-v1.md
-- (approved by ChatGPT 2026-08-17).
--
-- Fixes the bug found live immediately after the first post-Migration-B
-- production swap: repoint_story_clusters_fks() (called by both
-- swap_ingestion_staging() and rollback_ingestion_swap()) still
-- unconditionally re-creates the 3 FKs Migration B removed
-- (story_overrides/saved_stories/history_entries -> story_clusters)
-- on every single swap — silently undoing Migration B one ingestion
-- cycle at a time.
--
-- What this does: removes the story_overrides/saved_stories/
-- history_entries blocks from repoint_story_clusters_fks() entirely
-- (not "IF NOT EXISTS" — per ChatGPT's explicit instruction, that
-- would keep the old mental model, just made idempotent instead of
-- correct). The edition_story_classifications block is kept verbatim
-- — that table is machine-generated projection data with no
-- independent expires_at, and correctly still needs its FK repointed
-- to the new story_clusters OID at every swap.
--
-- Explicitly NOT touched: swap_ingestion_staging() (Migration A's
-- lock line stays exactly as committed), validate_editorial_story_reference()
-- and its 3 triggers (Migration B, unchanged), any table structure,
-- any data.
--
-- STATUS: NOT YET APPLIED. Per the locked sequencing
-- (design doc §5): apply this FIRST, verify the function body no
-- longer contains the 3 removed blocks, and ONLY THEN manually drop
-- the 3 FKs that came back after the last swap (dropping them before
-- this migration would just have them recreated by the next swap —
-- an infinite loop).

BEGIN;

CREATE OR REPLACE FUNCTION repoint_story_clusters_fks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- story_overrides / saved_stories / history_entries blocks: REMOVED.
  -- These 3 tables are editorial state (docs/editorial-state-orphan-lifecycle-design-v1.md)
  -- — since Migration B, their story_id reference is validated at
  -- write time by validate_editorial_story_reference() (a trigger,
  -- gated by the same pg_advisory_xact_lock_shared(71827364501)/
  -- pg_advisory_xact_lock(71827364501) boundary Migration A installed
  -- on the swap side), not by a standing FK. A table RENAME has
  -- nothing to "repoint" for these 3 tables anymore — there is no FK
  -- left pointing at story_clusters from them, by design, and this
  -- function must never recreate one.

  -- edition_story_classifications.story_id: UNCHANGED from the prior
  -- committed version — ON DELETE CASCADE (schema-edition-classification.sql)
  -- MUST be preserved, this table is not part of the swap set but
  -- still references story_clusters, and is machine-regenerated
  -- projection data with no independent expires_at of its own — a
  -- classification row for a story that's gone is meaningless and
  -- classify-production.js regenerates it for the new generation on
  -- its own next run.
  DELETE FROM edition_story_classifications
  WHERE story_id NOT IN (SELECT id FROM story_clusters);

  FOR rec IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'edition_story_classifications'::regclass AND con.contype = 'f'
      AND con.confrelid <> 'story_clusters'::regclass
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'story_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE edition_story_classifications DROP CONSTRAINT %I', rec.conname);
  END LOOP;
  ALTER TABLE edition_story_classifications
    ADD CONSTRAINT edition_story_classifications_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES story_clusters(id) ON DELETE CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION repoint_story_clusters_fks() TO service_role;

COMMIT;

-- Post-migration verification (run manually after COMMIT, read-only —
-- per design doc §5 "Migration C applied -> verify function"):
--   SELECT prosrc FROM pg_proc WHERE proname = 'repoint_story_clusters_fks';
--     -- expected: prosrc does NOT contain 'story_overrides_story_id_fkey',
--     --   'saved_stories_story_id_fkey', or 'history_entries_story_id_fkey'
--     -- expected: prosrc STILL contains 'edition_story_classifications_story_id_fkey'
--   SELECT prosrc FROM pg_proc WHERE proname = 'swap_ingestion_staging';
--     -- expected: unchanged — still contains 'pg_advisory_xact_lock(71827364501)'
--     --   as the first statement (Migration A untouched)
--
-- ONLY AFTER the above verification passes — separate manual step, NOT
-- part of this transaction, per the locked sequencing — drop the 3 FKs
-- that came back after the last swap:
--   ALTER TABLE story_overrides DROP CONSTRAINT story_overrides_story_id_fkey;
--   ALTER TABLE saved_stories DROP CONSTRAINT saved_stories_story_id_fkey;
--   ALTER TABLE history_entries DROP CONSTRAINT history_entries_story_id_fkey;
-- (constraint names confirmed via the same pg_constraint discovery
-- query Migration B used, re-run at execution time — not assumed to
-- still be exactly these default-looking names, since they were
-- re-created by repoint_story_clusters_fks()'s literal ADD CONSTRAINT
-- ... story_overrides_story_id_fkey ... — which does use these exact
-- names — but verify before running, same discipline as every prior
-- migration this session).
