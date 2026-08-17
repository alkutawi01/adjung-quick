-- migration-B-editorial-fk-removal-v1.sql
--
-- Backend Control Plane — Editorial State Orphan Lifecycle, Migration B.
-- Per docs/editorial-state-orphan-lifecycle-implementation-plan-v1.md §4:
-- MUST NOT be applied until Migration A (migration-A-swap-advisory-lock-v1.sql)
-- has been applied AND verified (its post-migration check confirms
-- swap_ingestion_staging() already holds the exclusive advisory lock).
-- Applying this file first would remove the FK safety net before the
-- advisory-lock mutex exists on the swap side — exactly the gap
-- ChatGPT's review caught and this ordering exists to prevent.
--
-- What this does:
--   1. Creates one shared trigger function, validate_editorial_story_reference(),
--      attached to story_overrides / saved_stories / history_entries.
--      It takes the SHARED form of the same advisory lock key Migration
--      A installed on the EXCLUSIVE side, then checks story_id exists
--      in the live story_clusters — raising a specific, greppable error
--      if not, matching Migration A's lock key exactly (71827364501,
--      same literal, not re-derived).
--   2. Drops the 3 existing story_id -> story_clusters FK constraints
--      on those same tables. Constraint names are discovered dynamically
--      via pg_constraint (never hardcoded/guessed), same technique
--      repoint_story_clusters_fks() already uses elsewhere in this schema.
--
-- Explicitly NOT touched, per the design doc's §8e/§9 and this session's
-- repeated instruction: edition_story_classifications' FK (machine-
-- generated data, no independent expires_at, correctly still enforced
-- by a hard FK). No orphan cleanup. No change to expires_at on any
-- table. No change to reader behavior. No change to
-- swap_ingestion_staging() beyond what Migration A already did.
--
-- STATUS: NOT YET APPLIED. Written per ChatGPT's explicit "SQL ditulis
-- != SQL diluluskan untuk production" — apply via Supabase SQL Editor
-- only after Migration A is confirmed applied+verified, AND a separate
-- explicit production-execution approval for this file specifically.

BEGIN;

CREATE OR REPLACE FUNCTION validate_editorial_story_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SAME literal key as Migration A's PERFORM pg_advisory_xact_lock(...)
  -- call in swap_ingestion_staging() — this is the single, pinned
  -- constant both sides of the boundary share. Do not compute this via
  -- hashtext() here or anywhere else; it is a fixed literal by design
  -- (per ChatGPT's explicit instruction), copy-pasted identically from
  -- migration-A-swap-advisory-lock-v1.sql's own comment.
  PERFORM pg_advisory_xact_lock_shared(71827364501);

  -- The actual write-time validation this trigger exists for — per
  -- docs/editorial-state-orphan-lifecycle-design-v1.md §8c's precise
  -- definition of "live": a row exists in the table currently named
  -- story_clusters, checked inside this same transaction.
  PERFORM 1 FROM story_clusters WHERE id = NEW.story_id;
  IF NOT FOUND THEN
    -- Message intentionally starts with "story_id" and contains "does
    -- not exist" — a stable, greppable substring the application layer
    -- (ui/src/admin/reviewQueueAdapter.js::writeOverride(), per
    -- implementation plan §3) matches on to distinguish this specific
    -- failure from any other DB error and surface a clear Malay message
    -- to the Admin instead of a generic one.
    RAISE EXCEPTION 'story_id % does not exist in the current live generation', NEW.story_id;
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE INSERT OR UPDATE OF story_id — covers writeOverride()'s
-- insert path today, and guards a hypothetical future UPDATE of an
-- existing row's story_id (nothing currently does this, but the
-- trigger should not silently miss it if it ever does).
CREATE TRIGGER trg_validate_story_overrides_reference
  BEFORE INSERT OR UPDATE OF story_id ON story_overrides
  FOR EACH ROW EXECUTE FUNCTION validate_editorial_story_reference();

CREATE TRIGGER trg_validate_saved_stories_reference
  BEFORE INSERT OR UPDATE OF story_id ON saved_stories
  FOR EACH ROW EXECUTE FUNCTION validate_editorial_story_reference();

CREATE TRIGGER trg_validate_history_entries_reference
  BEFORE INSERT OR UPDATE OF story_id ON history_entries
  FOR EACH ROW EXECUTE FUNCTION validate_editorial_story_reference();

-- Drop the 3 existing FKs — constraint names discovered dynamically,
-- never hardcoded (per ChatGPT's explicit instruction and matching
-- repoint_story_clusters_fks()'s existing technique elsewhere in this
-- schema). edition_story_classifications is deliberately absent from
-- this list — its FK is untouched.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT con.conname, con.conrelid::regclass::text AS table_name
    FROM pg_constraint con
    WHERE con.conrelid IN ('story_overrides'::regclass, 'saved_stories'::regclass, 'history_entries'::regclass)
      AND con.contype = 'f'
      AND con.confrelid = 'story_clusters'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', rec.table_name, rec.conname);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION validate_editorial_story_reference() TO service_role, authenticated;

COMMIT;

-- Post-migration verification (run manually after COMMIT, read-only —
-- per implementation plan §7 "After Migration B"):
--   SELECT conname, conrelid::regclass FROM pg_constraint
--     WHERE conrelid IN ('story_overrides'::regclass, 'saved_stories'::regclass, 'history_entries'::regclass)
--       AND contype = 'f' AND confrelid = 'story_clusters'::regclass;
--     -- expected: 0 rows
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'edition_story_classifications'::regclass AND contype = 'f'
--       AND confrelid = 'story_clusters'::regclass;
--     -- expected: 1 row (unchanged)
--   SELECT event_object_table, trigger_name FROM information_schema.triggers
--     WHERE event_object_table IN ('story_overrides', 'saved_stories', 'history_entries');
--     -- expected: 3 rows
--   SELECT prosrc FROM pg_proc WHERE proname = 'swap_ingestion_staging';
--     -- expected: still contains 'pg_advisory_xact_lock(71827364501)' — unchanged by this migration
--   -- Functional test (via a real editor-role session, not service_role):
--   --   INSERT INTO story_overrides (story_id, edition_id, override_type, reason, created_by, expires_at)
--   --     VALUES ('this-story-id-does-not-exist', 'ms-MY', 'hide', 'test', <a real editor uuid>, now() + interval '1 day');
--   --   -- expected: ERROR — story_id does not exist in the current live generation
--   --   -- expected: 0 rows actually inserted (verify via a following SELECT)
