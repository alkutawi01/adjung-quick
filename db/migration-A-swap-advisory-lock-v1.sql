-- migration-A-swap-advisory-lock-v1.sql
--
-- Backend Control Plane — Editorial State Orphan Lifecycle, Migration A.
-- Per docs/editorial-state-orphan-lifecycle-implementation-plan-v1.md §4
-- (revised order, approved by ChatGPT 2026-08-17): this migration MUST
-- be applied and verified BEFORE Migration B (migration-B-editorial-fk-removal-v1.sql).
-- Applying B before A re-opens the exact protection gap this ordering
-- exists to close.
--
-- What this does: adds ONE statement to the START of
-- swap_ingestion_staging() — acquire a transaction-scoped EXCLUSIVE
-- advisory lock before any ALTER TABLE rename runs. Nothing else in
-- the function changes. The 3 editorial-state FKs
-- (story_overrides/saved_stories/history_entries -> story_clusters)
-- are NOT touched by this migration — they remain exactly as they are
-- today, so editorial writes stay protected by the existing hard FK
-- for the entire time between Migration A and Migration B.
--
-- STATUS: NOT YET APPLIED. SQL written per ChatGPT's explicit
-- instruction ("SQL ditulis ≠ SQL diluluskan untuk production") —
-- apply via Supabase SQL Editor only after a separate, explicit
-- production-execution approval.

BEGIN;

-- Lock key: ONE pinned literal bigint, defined here and reused
-- verbatim in Migration B's trigger function — never re-derived at
-- call time (per ChatGPT's explicit "jangan gunakan hashtext() setiap
-- kali trigger dipanggil" instruction). This specific value has no
-- meaning beyond being this project's dedicated, collision-avoidant
-- key for this one boundary — documented here as the single source of
-- truth for it.
--
--   EDITORIAL_INGESTION_LOCK_KEY = 71827364501
--
-- (11 digits leaves plenty of headroom below bigint's max (19 digits)
-- and is distinctive enough to be very unlikely to collide with any
-- other advisory lock
-- this project — or Supabase's own internals — might independently
-- choose. Any other fixed bigint would work equally well; the only
-- requirement is that it is written ONCE and referenced identically
-- everywhere.)

CREATE OR REPLACE FUNCTION swap_ingestion_staging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- NEW — Editorial State Orphan Lifecycle, Migration A
  -- (docs/editorial-state-orphan-lifecycle-design-v1.md §8a/§8d,
  -- Option D). Transaction-scoped EXCLUSIVE lock, auto-released at
  -- commit/rollback. Any editorial write holding the SHARED form of
  -- this same key (installed in Migration B) must fully finish before
  -- this swap can proceed past this point — and conversely, once this
  -- swap holds the lock, no editorial write can begin its own
  -- existence check until this entire swap transaction ends. This is
  -- the ONLY change in this function versus its prior committed
  -- version (commit 9b6984a) — every statement below is unchanged.
  PERFORM pg_advisory_xact_lock(71827364501);

  IF to_regclass('public.sources_old') IS NOT NULL
     OR to_regclass('public.story_clusters_old') IS NOT NULL
     OR to_regclass('public.rss_items_old') IS NOT NULL THEN
    RAISE EXCEPTION
      'swap_ingestion_staging: a previous _old generation still exists — '
      'run db/drop-ingestion-old-tables.mjs (after its verification checklist '
      'passes) before the next swap. Refusing to overwrite an un-dropped rollback set.';
  END IF;

  ALTER TABLE sources RENAME TO sources_old;
  ALTER TABLE story_clusters RENAME TO story_clusters_old;
  ALTER TABLE rss_items RENAME TO rss_items_old;

  ALTER TABLE sources_staging RENAME TO sources;
  ALTER TABLE story_clusters_staging RENAME TO story_clusters;
  ALTER TABLE rss_items_staging RENAME TO rss_items;

  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('sources_old', 'story_clusters_old', 'rss_items_old')
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', rec.indexname, rec.indexname || '_prevgen');
  END LOOP;
  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('sources', 'story_clusters', 'rss_items')
      AND indexname LIKE '%\_staging%'
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', rec.indexname, replace(rec.indexname, '_staging', ''));
  END LOOP;

  PERFORM repoint_story_clusters_fks();
  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION swap_ingestion_staging() TO service_role;

COMMIT;

-- Post-migration verification (run manually after COMMIT, read-only —
-- per implementation plan §7 "After Migration A"):
--   SELECT prosrc FROM pg_proc WHERE proname = 'swap_ingestion_staging';
--     -- expected: prosrc contains 'pg_advisory_xact_lock(71827364501)'
--     --   BEFORE any ALTER TABLE statement in the body
--   SELECT conname, conrelid::regclass FROM pg_constraint
--     WHERE conrelid IN ('story_overrides'::regclass, 'saved_stories'::regclass, 'history_entries'::regclass)
--       AND contype = 'f' AND confrelid = 'story_clusters'::regclass;
--     -- expected: 3 rows (UNCHANGED — this migration does not touch these FKs)
