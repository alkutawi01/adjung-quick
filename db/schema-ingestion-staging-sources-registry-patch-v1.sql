-- schema-ingestion-staging-sources-registry-patch-v1.sql — Backend
-- Control Plane Phase 1, ingestion staging/swap schema-drift fix.
--
-- Per ChatGPT's explicit instruction (2026-08-17): the pre-existing
-- reset_ingestion_staging()/swap_ingestion_staging() functions
-- (db/schema-ingestion-staging-functions-v1.sql) predate the Source
-- Registry V1 migration and still build `sources_staging` with the OLD
-- `sources` schema. Since swap_ingestion_staging() promotes
-- sources_staging to `sources` via a table RENAME (not a column-level
-- merge), a real ingestion run today would silently destroy every
-- column Phase 1 just added (status, known_category, source_type,
-- exclude_patterns, extra_ca, updated_at) the moment it swaps.
--
-- Audited per ChatGPT's explicit requirement (full swap path, not just
-- CREATE TABLE): 0 other schema objects need changes for this —
-- - No table other than `rss_items` has an FK into `sources`
--   (rss_items.source_id -> sources.id, db/schema.sql:69), and
--   rss_items_staging/sources_staging swap together in the SAME
--   transaction (both part of swap_ingestion_staging()'s rename set),
--   so that FK stays self-consistent through the swap automatically —
--   unlike story_clusters' incoming FKs from tables OUTSIDE the swap
--   set (story_overrides/saved_stories/history_entries/
--   edition_story_classifications), which is why only THOSE need
--   repoint_story_clusters_fks(). No equivalent repoint function is
--   needed for `sources` because nothing outside the swap set
--   references it.
-- - Index renaming in swap_ingestion_staging() (lines 318-330 of
--   schema-ingestion-staging-functions-v1.sql) is already generic
--   (driven by pg_indexes + a `_staging` name-suffix match), so the new
--   idx_sources_staging_status index added below is picked up
--   automatically at swap time — no changes needed to the swap
--   function itself.
-- - GRANT SELECT ... TO anon, authenticated (line 122) is table-level,
--   not per-column — already covers the new columns once they exist.
--
-- Only change required: sources_staging's CREATE TABLE, inside
-- reset_ingestion_staging(), gets the same additive columns already
-- applied to production `sources`
-- (db/schema-source-registry-production-v1.sql), so the swap's RENAME
-- promotes a schema-complete table instead of reverting to the old one.
--
-- STATUS: NOT YET APPLIED. Per ChatGPT's explicit "tiada production
-- execution sehingga patch itu diuji dan diverifikasi" — apply via
-- Supabase SQL Editor only after review, then verify with a
-- --dry-run cycle (proves staging build succeeds) before any real
-- (non-dry-run) ingestion run is separately approved.

BEGIN;

CREATE OR REPLACE FUNCTION reset_ingestion_staging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DROP TABLE IF EXISTS rss_items_staging, story_clusters_staging, sources_staging CASCADE;

  CREATE TABLE sources_staging (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    url               TEXT NOT NULL,
    language          TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
    trust_score       INTEGER NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
    coverage          TEXT CHECK (coverage IN ('malaysia', 'international', 'middle_east', 'unknown')),
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    last_success_at   TIMESTAMPTZ,
    last_failure_at   TIMESTAMPTZ,
    last_failure_reason TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Source Registry V1 columns (Backend Control Plane Phase 1,
    -- db/schema-source-registry-production-v1.sql) — added here so the
    -- swap's RENAME promotes a schema-complete table. Without these,
    -- every ingestion run would silently revert `sources` back to its
    -- pre-Phase-1 shape.
    status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'disabled', 'archived')),
    known_category    TEXT,
    source_type       TEXT CHECK (source_type IN ('general', 'specialised', 'authority_niche')),
    exclude_patterns  TEXT[],
    extra_ca          TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
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
  -- New, matches idx_sources_status on production `sources`
  -- (db/schema-source-registry-production-v1.sql) — picked up
  -- automatically by swap_ingestion_staging()'s generic
  -- `_staging`-suffix index rename, no swap-function change needed.
  CREATE INDEX idx_sources_staging_status ON sources_staging (status) WHERE status = 'active';

  CREATE TRIGGER trg_forbid_representative_reassignment_staging
    BEFORE UPDATE ON story_clusters_staging
    FOR EACH ROW
    EXECUTE FUNCTION forbid_representative_reassignment();

  GRANT SELECT ON sources_staging, story_clusters_staging, rss_items_staging TO anon, authenticated;

  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION reset_ingestion_staging() TO service_role;

COMMIT;
