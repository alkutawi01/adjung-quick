-- schema-sources-status-reason-v1.sql
-- Polish 6B-a (2026-08-19), per ChatGPT's explicit design: setSourceStatus()
-- has always REQUIRED a non-empty `reason` for any non-active status
-- (validated in db/source-registry-adapter.mjs), but never actually wrote
-- it anywhere -- the editor types a reason, the system silently discards
-- it. Fix: ONE column, current-value-only (no event log/history table,
-- per ChatGPT's explicit "bukan history/event log baharu").
--
-- Semantics: disabled/archived -> stores the reason given at that status
-- change. Reverting to active -> NULL (the reason no longer applies once
-- the source is active again).
--
-- CRITICAL: `sources` goes through the staging+swap pipeline (db/
-- schema-ingestion-staging-functions-v1.sql, patched further by
-- schema-ingestion-staging-sources-registry-patch-v1.sql). Every
-- ingestion run RENAMES sources_staging -> sources (full replace, not a
-- column merge) -- so status_reason must exist on sources_staging too,
-- or the very next ingestion cycle silently wipes it (exact same class
-- of bug schema-ingestion-staging-sources-registry-patch-v1.sql's own
-- header describes for status/known_category/etc). This patch updates
-- reset_ingestion_staging() accordingly.

BEGIN;

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS status_reason TEXT;

GRANT UPDATE (status_reason) ON public.sources TO authenticated;

-- Rebuild reset_ingestion_staging() with status_reason added to
-- sources_staging -- otherwise the next ingestion swap reverts `sources`
-- to a shape without it. Identical to
-- schema-ingestion-staging-sources-registry-patch-v1.sql's function body
-- except for this one added column.
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
    status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'disabled', 'archived')),
    known_category    TEXT,
    source_type       TEXT CHECK (source_type IN ('general', 'specialised', 'authority_niche')),
    exclude_patterns  TEXT[],
    extra_ca          TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Polish 6B-a: current-status reason only, no history.
    status_reason     TEXT
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

-- Sahkan selepas jalan (berasingan):
--   select column_name from information_schema.columns
--   where table_name = 'sources' and column_name = 'status_reason';
-- Dijangka: 1 baris.
