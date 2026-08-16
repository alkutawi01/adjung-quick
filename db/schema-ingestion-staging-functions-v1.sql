-- schema-ingestion-staging-functions-v1.sql — FASA 4.2, 2026-08-15.
-- Per docs/ingestion-staging-swap-implementation-plan-v1.md §2/§3.
--
-- supabase-js/PostgREST issues one HTTP request per statement — there is
-- no client-side BEGIN/COMMIT across separate .from() calls. Real
-- atomicity for the swap has to happen SERVER-SIDE, inside a single
-- function call, which Postgres executes as one implicit transaction.
-- Both functions are SECURITY DEFINER (owned by the migration-applying
-- role, typically a superuser-ish Supabase role) so the service_role
-- caller doesn't need direct ALTER TABLE privilege — but search_path is
-- pinned to prevent the classic SECURITY DEFINER search-path hijack.
--
-- PURELY ADDITIVE — no existing table/function touched.

BEGIN;

-- Prepares FRESH, EMPTY staging tables at the START of every ingestion
-- run. NOT a plain TRUNCATE: a successful swap RENAMES the staging
-- tables away to become the live tables, so after any swap the
-- `*_staging` names simply don't exist anymore — a plain TRUNCATE would
-- fail on the very next run. DROP IF EXISTS + CREATE fresh makes this
-- self-healing regardless of whether staging tables survived from a
-- previous failed run (never swapped, still there) or were consumed by
-- a previous successful one (renamed away, need recreating) — same
-- structure schema-ingestion-staging-v1.sql defines, kept in sync here
-- since this function is now the source of truth staging is (re)built
-- from on every run, not just the one-time migration.
CREATE OR REPLACE FUNCTION reset_ingestion_staging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Found only by actually running this against production (2026-08-15,
  -- second dry-run attempt): story_clusters_staging and
  -- rss_items_staging have a genuine CIRCULAR foreign-key dependency
  -- (story_clusters_staging.representative_rss_item_id -> rss_items_staging,
  -- rss_items_staging.cluster_id -> story_clusters_staging) — neither can
  -- be dropped alone in any order without CASCADE. A single multi-table
  -- DROP resolves this the way separate DROP statements cannot.
  DROP TABLE IF EXISTS rss_items_staging, story_clusters_staging, sources_staging CASCADE;

  CREATE TABLE sources_staging (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    url           TEXT NOT NULL,
    language      TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
    trust_score   INTEGER NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
    coverage      TEXT CHECK (coverage IN ('malaysia', 'international', 'middle_east', 'unknown')),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE story_clusters_staging (
    id                          TEXT PRIMARY KEY,
    representative_rss_item_id  TEXT,
    topic                       TEXT NOT NULL DEFAULT 'Unclassified',
    workspace_state             TEXT NOT NULL DEFAULT 'queued'
                                 CHECK (workspace_state IN ('review', 'queued', 'active', 'released', 'expired')),
    freshness_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
    cross_source_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    prominence_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    editorial_score       NUMERIC(5,2) GENERATED ALWAYS AS
                           (freshness_score + cross_source_score + prominence_score) STORED,
    expires_at         TIMESTAMPTZ,
    review_expires_at  TIMESTAMPTZ,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE rss_items_staging (
    id              TEXT PRIMARY KEY,
    source_id       TEXT NOT NULL REFERENCES sources_staging(id),
    cluster_id      TEXT NOT NULL REFERENCES story_clusters_staging(id) ON DELETE CASCADE,
    rss_guid        TEXT,
    title           TEXT NOT NULL,
    description     TEXT,
    link            TEXT,
    normalized_url  TEXT,
    language        TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
    published_at    TIMESTAMPTZ NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    categories             TEXT[] NOT NULL DEFAULT '{}',
    source_known_category  TEXT
  );

  CREATE UNIQUE INDEX idx_rss_items_staging_source_guid ON rss_items_staging (source_id, rss_guid) WHERE rss_guid IS NOT NULL;
  CREATE INDEX idx_rss_items_staging_normalized_url ON rss_items_staging (normalized_url) WHERE normalized_url IS NOT NULL;
  CREATE INDEX idx_rss_items_staging_cluster ON rss_items_staging (cluster_id);
  CREATE INDEX idx_rss_items_staging_language ON rss_items_staging (language);

  ALTER TABLE story_clusters_staging
    ADD CONSTRAINT fk_representative_rss_item_staging
    FOREIGN KEY (representative_rss_item_id) REFERENCES rss_items_staging(id);

  CREATE INDEX idx_story_clusters_staging_workspace_state ON story_clusters_staging (workspace_state);
  CREATE INDEX idx_story_clusters_staging_editorial_score ON story_clusters_staging (editorial_score DESC);
  CREATE INDEX idx_story_clusters_staging_topic ON story_clusters_staging (topic);
  CREATE INDEX idx_sources_staging_language_coverage ON sources_staging (language, coverage);
  CREATE INDEX idx_sources_staging_active ON sources_staging (active) WHERE active = TRUE;

  CREATE TRIGGER trg_forbid_representative_reassignment_staging
    BEFORE UPDATE ON story_clusters_staging
    FOR EACH ROW
    EXECUTE FUNCTION forbid_representative_reassignment();

  -- CRITICAL, found only by the first real (non-dry-run) swap
  -- (2026-08-15): GRANT privileges, like FKs, are tied to a table's OID
  -- — a freshly `CREATE TABLE`'d staging table does NOT inherit the
  -- anon/authenticated SELECT grant the original `sources`/
  -- `story_clusters`/`rss_items` had, even after the rename gives it
  -- the same name. Without this, the reader breaks immediately
  -- post-swap ("permission denied for table sources") until someone
  -- notices and grants it by hand — exactly what happened live before
  -- this line was added. Granting here, before the swap even runs,
  -- means the grant is already present on the table BEFORE it gets
  -- renamed into place.
  GRANT SELECT ON sources_staging, story_clusters_staging, rss_items_staging TO anon, authenticated;

  -- Found only by actually running this against production (2026-08-15,
  -- first real dry run): PostgREST caches the schema, so a table created
  -- here via RPC is invisible to supabase-js's .from() calls until that
  -- cache reloads — Supabase's documented mechanism is this NOTIFY.
  -- Without it, ingest-production.js's very next line (inserting into
  -- sources_staging) fails with PGRST205 "Could not find the table".
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- CRITICAL, found only while writing this function (2026-08-15): a
-- Postgres table RENAME does NOT move that table's INCOMING foreign
-- keys — a referencing constraint stays bound to the table's OID, not
-- its name. After a naive swap, story_overrides/saved_stories/
-- history_entries/edition_story_classifications' story_id FK would
-- still point at the just-demoted `story_clusters_old`, NOT the newly
-- promoted `story_clusters` — meaning every admin action (hide/
-- reclassify/boost/pin) or reader save on a story from the fresh
-- generation would fail its own FK check immediately after a swap.
-- This function re-points each of those FKs at whichever table is
-- CURRENTLY named `story_clusters`, discovering the existing constraint
-- name dynamically (never assuming Postgres's default naming matches
-- reality) so the old, now-stale constraint is correctly dropped before
-- the new one is added. ON DELETE behavior is preserved EXACTLY as each
-- table's own schema originally defined it — this function only
-- re-targets the relationship, it must never change what happens on
-- delete.
CREATE OR REPLACE FUNCTION repoint_story_clusters_fks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- CRITICAL FIX, found live (2026-08-15) on the first real swap after
  -- the FK-repoint fix itself: the original filter here
  -- (`con.confrelid <> 'story_clusters'::regclass`) matches ANY foreign
  -- key on the table that isn't currently pointing at story_clusters —
  -- which also matched story_overrides' UNRELATED
  -- `created_by -> editors` FK, silently dropping it and never
  -- recreating it. This broke FASA 4.1.1's Editorial Activity Timeline
  -- live in production ("Could not find a relationship between
  -- 'story_overrides' and 'created_by'") before being caught by this
  -- same post-swap verification pass and fixed by hand. Every loop below
  -- now also requires the constraint's column to literally be
  -- `story_id` — the ONLY column this function has any business
  -- touching — so a table with other unrelated FKs (like
  -- story_overrides.created_by) is never touched by mistake again.

  -- story_overrides.story_id: NO ON DELETE action (schema-editorial-state.sql).
  FOR rec IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'story_overrides'::regclass AND con.contype = 'f'
      AND con.confrelid <> 'story_clusters'::regclass
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'story_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE story_overrides DROP CONSTRAINT %I', rec.conname);
  END LOOP;
  ALTER TABLE story_overrides
    ADD CONSTRAINT story_overrides_story_id_fkey FOREIGN KEY (story_id) REFERENCES story_clusters(id);

  -- saved_stories.story_id: NO ON DELETE action (schema-identity.sql —
  -- an already-open lifecycle question, not something this function decides).
  FOR rec IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'saved_stories'::regclass AND con.contype = 'f'
      AND con.confrelid <> 'story_clusters'::regclass
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'story_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE saved_stories DROP CONSTRAINT %I', rec.conname);
  END LOOP;
  ALTER TABLE saved_stories
    ADD CONSTRAINT saved_stories_story_id_fkey FOREIGN KEY (story_id) REFERENCES story_clusters(id);

  -- history_entries.story_id: NO ON DELETE action (schema-identity.sql).
  FOR rec IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'history_entries'::regclass AND con.contype = 'f'
      AND con.confrelid <> 'story_clusters'::regclass
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'story_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE history_entries DROP CONSTRAINT %I', rec.conname);
  END LOOP;
  ALTER TABLE history_entries
    ADD CONSTRAINT history_entries_story_id_fkey FOREIGN KEY (story_id) REFERENCES story_clusters(id);

  -- edition_story_classifications.story_id: ON DELETE CASCADE
  -- (schema-edition-classification.sql) — MUST be preserved, this table
  -- is not part of the swap set but still references story_clusters.
  --
  -- CRITICAL, found only by the first REAL swap attempt failing
  -- (2026-08-15): classify-production.js runs independently of
  -- ingest-production.js, so edition_story_classifications routinely
  -- holds rows for stories from a PREVIOUS ingest that the current
  -- staged generation doesn't reproduce. Under the OLD destructive
  -- DELETE+INSERT flow, this was never a problem — deleting
  -- story_clusters triggered this table's own ON DELETE CASCADE,
  -- silently wiping stale classifications as a side effect. Staging+swap
  -- never deletes anything (only renames), so that implicit cleanup
  -- stopped happening — and re-adding this FK then correctly fails
  -- validation against orphaned rows, exactly what happened live:
  -- "Key (story_id)=(...) is not present in table story_clusters".
  -- The swap rolled back safely (proof the atomicity design works) but
  -- can never succeed without replicating that cleanup explicitly here,
  -- once, right before the FK is re-added — a classification row for a
  -- story that no longer exists is meaningless anyway; classify-
  -- production.js regenerates it for the new generation on its own
  -- next run.
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

-- The atomic swap itself. Per docs/ingestion-staging-swap-implementation-plan-v1.md
-- §4b (Old Table Lifecycle Policy): refuses to run if a previous cycle's
-- `_old` tables are still present — those are dropped ONLY by a human
-- running the dedicated drop script (db/drop-ingestion-old-tables.mjs)
-- after the verification checklist passes, never silently overwritten
-- by the next swap. This is what makes "manual drop only" actually
-- enforced, not just documented.
CREATE OR REPLACE FUNCTION swap_ingestion_staging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF to_regclass('public.sources_old') IS NOT NULL
     OR to_regclass('public.story_clusters_old') IS NOT NULL
     OR to_regclass('public.rss_items_old') IS NOT NULL THEN
    RAISE EXCEPTION
      'swap_ingestion_staging: a previous _old generation still exists — '
      'run db/drop-ingestion-old-tables.mjs (after its verification checklist '
      'passes) before the next swap. Refusing to overwrite an un-dropped rollback set.';
  END IF;

  -- Single function invocation = single implicit transaction. Either
  -- every rename below applies, or (on any error) none do — Postgres's
  -- own transactional DDL guarantee, not application-level coordination.
  ALTER TABLE sources RENAME TO sources_old;
  ALTER TABLE story_clusters RENAME TO story_clusters_old;
  ALTER TABLE rss_items RENAME TO rss_items_old;

  ALTER TABLE sources_staging RENAME TO sources;
  ALTER TABLE story_clusters_staging RENAME TO story_clusters;
  ALTER TABLE rss_items_staging RENAME TO rss_items;

  -- CRITICAL, found live on the second real ingestion cycle
  -- (2026-08-15) — the exact "lifecycle 2" failure mode ChatGPT
  -- specifically flagged as the real test: table RENAME doesn't rename
  -- that table's INDEXES either (same underlying fact as the FK issue,
  -- a different object type). After this function's first-ever run,
  -- indexes literally named `idx_rss_items_staging_source_guid` etc.
  -- stayed attached to the newly-live `rss_items` table — so the NEXT
  -- reset_ingestion_staging() call's `CREATE INDEX
  -- idx_rss_items_staging_source_guid` failed with "already exists",
  -- since index names must be unique per SCHEMA, not per table. Fixed
  -- generically via pg_indexes rather than hardcoding each name, so it
  -- self-adapts if more indexes are ever added: first free up the
  -- canonical names still held by the demoted `_old` generation's
  -- indexes, then strip `_staging` from the newly-promoted generation's
  -- index names to claim those now-free canonical names.
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

  -- MUST run inside the same transaction as the renames above — a swap
  -- that promotes new tables without also repointing these FKs is worse
  -- than no swap at all (admin actions / saves on new-generation stories
  -- would start failing immediately).
  PERFORM repoint_story_clusters_fks();
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Rollback path (§3 "Post-swap rollback"): swaps `_old` back to live,
-- and the just-demoted current generation becomes `_bad` for forensic
-- inspection rather than being silently dropped — the same
-- never-auto-drop discipline applies to a bad swap as to a good one.
-- Also re-points the same FKs — a rollback is itself a rename, and the
-- same "renames don't move incoming FKs" fact applies here too.
CREATE OR REPLACE FUNCTION rollback_ingestion_swap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF to_regclass('public.sources_old') IS NULL
     OR to_regclass('public.story_clusters_old') IS NULL
     OR to_regclass('public.rss_items_old') IS NULL THEN
    RAISE EXCEPTION 'rollback_ingestion_swap: no _old generation exists to roll back to.';
  END IF;

  ALTER TABLE sources RENAME TO sources_bad;
  ALTER TABLE story_clusters RENAME TO story_clusters_bad;
  ALTER TABLE rss_items RENAME TO rss_items_bad;

  ALTER TABLE sources_old RENAME TO sources;
  ALTER TABLE story_clusters_old RENAME TO story_clusters;
  ALTER TABLE rss_items_old RENAME TO rss_items;

  -- Same index-rename fix as swap_ingestion_staging() — a rollback is
  -- itself a rename, so the same "RENAME TABLE doesn't move index
  -- names" fact applies in reverse: free the canonical names still held
  -- by the now-`_bad` generation, then strip the `_prevgen` suffix
  -- swap_ingestion_staging() left on the restored generation's indexes.
  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('sources_bad', 'story_clusters_bad', 'rss_items_bad')
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', rec.indexname, rec.indexname || '_badgen');
  END LOOP;
  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('sources', 'story_clusters', 'rss_items')
      AND indexname LIKE '%\_prevgen%'
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', rec.indexname, replace(rec.indexname, '_prevgen', ''));
  END LOOP;

  PERFORM repoint_story_clusters_fks();
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Manual-only drop of a previous generation's `_old` tables. Per §4b:
-- called ONLY by db/drop-ingestion-old-tables.mjs, itself gated behind
-- CONFIRM_OLD_TABLES_VERIFIED=true and its own automatable checks
-- (row-count sanity, FK-dangling scan) — this function does the actual
-- DROP once that script has already decided it's safe. No scheduled or
-- automatic caller exists anywhere.
CREATE OR REPLACE FUNCTION drop_ingestion_old_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- story_clusters_old.fk_representative_rss_item references rss_items_old
  -- (found live 2026-08-16: dropping rss_items_old first fails with 2BP01
  -- "other objects depend on it") — drop the referencing table first.
  DROP TABLE IF EXISTS story_clusters_old;
  DROP TABLE IF EXISTS rss_items_old;
  DROP TABLE IF EXISTS sources_old;
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Explicit — don't rely on PostgREST's default function-exposure grant.
-- Only service_role calls these (from ingest-production.js /
-- drop-ingestion-old-tables.mjs's service-role client); anon/authenticated
-- get nothing, matching every other write path in this project.
GRANT EXECUTE ON FUNCTION reset_ingestion_staging() TO service_role;
GRANT EXECUTE ON FUNCTION repoint_story_clusters_fks() TO service_role;
GRANT EXECUTE ON FUNCTION swap_ingestion_staging() TO service_role;
GRANT EXECUTE ON FUNCTION rollback_ingestion_swap() TO service_role;
GRANT EXECUTE ON FUNCTION drop_ingestion_old_tables() TO service_role;

COMMIT;
