-- schema.sql — Stream A (Engine Production) migration.
-- Per ChatGPT (director) instruction: sources, rss_items, story_clusters
-- ONLY. Do NOT add active_set_slots (owner_ref/anonymous-vs-authenticated
-- still pending Fasa 1A), Auth, saved_stories, or history_entries here —
-- those are Stream B / Fasa 1A per docs/production-data-model-audit.md.
--
-- Written for Postgres (Supabase target). Every table/column/index below
-- traces back to a numbered section in docs/production-data-model-audit.md
-- — see the comment above each block.

BEGIN;

-- §1 Source Registry (L-030 Configurable Source Registry, L-031 Source
-- failure isolation, L-032 Source replacement)
CREATE TABLE sources (
  id            TEXT PRIMARY KEY,               -- e.g. 'rss-kosmo', matches lab/sources.js today
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  language      TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
  trust_score   INTEGER NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  coverage      TEXT CHECK (coverage IN ('malaysia', 'international', 'middle_east', 'unknown')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,   -- L-031: deactivate on persistent failure, don't delete
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sources_language_coverage ON sources (language, coverage);
CREATE INDEX idx_sources_active ON sources (active) WHERE active = TRUE;

-- §3 Story Cluster. representative_rss_item_id is set once on creation and
-- MUST NEVER be updated afterward — this is the schema-level enforcement of
-- "representative-only matching, no transitive drift" from lab/engine.js.
-- Postgres can't natively forbid updating one column while allowing others
-- without a trigger; the trigger below is that enforcement, not a suggestion.
CREATE TABLE story_clusters (
  id                          TEXT PRIMARY KEY,   -- matches clusterKey from lab/engine.js today
  representative_rss_item_id  TEXT,               -- FK added after rss_items exists (circular ref)
  topic                       TEXT NOT NULL DEFAULT 'Unclassified',
  workspace_state             TEXT NOT NULL DEFAULT 'queued'
                               CHECK (workspace_state IN ('review', 'queued', 'active', 'released', 'expired')),

  -- §4 Editorial Score — columns, not a separate table (Gemini's original
  -- proposal, confirmed still correct in the audit).
  freshness_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  cross_source_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  prominence_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  editorial_score       NUMERIC(5,2) GENERATED ALWAYS AS
                         (freshness_score + cross_source_score + prominence_score) STORED,

  -- §3/§10: two independent expiry clocks (L-025 Queue expiry vs L-026 Review expiry).
  expires_at         TIMESTAMPTZ,
  review_expires_at  TIMESTAMPTZ,

  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_story_clusters_workspace_state ON story_clusters (workspace_state);
CREATE INDEX idx_story_clusters_editorial_score ON story_clusters (editorial_score DESC);
CREATE INDEX idx_story_clusters_topic ON story_clusters (topic);

-- §2 RSS Item. Tier-0 exact-match dedup lookup depends on
-- (source_id, rss_guid) and normalized_url both being indexed — this IS the
-- Tier-0 mechanism at ingestion time, not just a convenience index.
CREATE TABLE rss_items (
  id              TEXT PRIMARY KEY,             -- rss_guid, or normalized_url when guid is absent
  source_id       TEXT NOT NULL REFERENCES sources(id),
  cluster_id      TEXT NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  rss_guid        TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  link            TEXT,
  normalized_url  TEXT,
  language        TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
  published_at    TIMESTAMPTZ NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rss_items_source_guid ON rss_items (source_id, rss_guid) WHERE rss_guid IS NOT NULL;
CREATE INDEX idx_rss_items_normalized_url ON rss_items (normalized_url) WHERE normalized_url IS NOT NULL;
CREATE INDEX idx_rss_items_cluster ON rss_items (cluster_id);
CREATE INDEX idx_rss_items_language ON rss_items (language);

-- Now that rss_items exists, add the circular FK for the representative pointer.
ALTER TABLE story_clusters
  ADD CONSTRAINT fk_representative_rss_item
  FOREIGN KEY (representative_rss_item_id) REFERENCES rss_items(id);

-- Schema-level enforcement: representative_rss_item_id, once set (NOT NULL),
-- can never change. Every other column on story_clusters may still be
-- updated freely (score recompute, workspace_state transitions, etc).
CREATE OR REPLACE FUNCTION forbid_representative_reassignment()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.representative_rss_item_id IS NOT NULL
     AND NEW.representative_rss_item_id IS DISTINCT FROM OLD.representative_rss_item_id THEN
    RAISE EXCEPTION 'story_clusters.representative_rss_item_id is immutable once set (cluster %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forbid_representative_reassignment
  BEFORE UPDATE ON story_clusters
  FOR EACH ROW
  EXECUTE FUNCTION forbid_representative_reassignment();

COMMIT;
