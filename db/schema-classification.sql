-- schema-classification.sql — Classification evidence + result columns.
--
-- Approved by ChatGPT 2026-08-12 (confidence 0.99) with one mandatory
-- amendment: classification_ruleset_version. Design rationale lives in
-- docs/classification-evidence-model.md and docs/quick-bidang-taxonomy.md.
--
-- PURELY ADDITIVE. Nothing is dropped, nothing is backfilled, no existing
-- behaviour changes. In particular `story_clusters.topic` and
-- idx_story_clusters_topic are DELIBERATELY KEPT — productionAdapter.js and
-- the UI still read `topic`, and the old values came from the very classifier
-- we are replacing, so a blind topic -> field backfill would import the old
-- classifier's mistakes as if they were ground truth. `topic` is dropped only
-- after: classifier v1 -> benchmark -> corpus classified -> readers switched
-- -> regression passes.

BEGIN;

-- §1 Raw evidence preservation (P0).
-- lab/rss.js already parses <category> but throws it away before persistence,
-- so the Tier-2 signal is destroyed at ingestion today. TEXT[] not TEXT: Utusan
-- sends ["BERITA","NASIONAL","Politik","TERKINI"] and the useful token is the
-- third one — collapsing to categories[0] would keep the junk and lose the
-- signal. Store exactly what the publisher sent; normalization happens
-- downstream, never in place.
ALTER TABLE rss_items
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

-- The URL desk is intentionally NOT stored — rss_items.link is already
-- persisted, so the desk can be re-derived at any time. Raw evidence is kept;
-- derived interpretation is always recomputed.

-- §2 Classification result on the story cluster.
-- Per ChatGPT: clustering decides what counts as one story; classification
-- decides that story's Bidang. The two engines stay separate, and
-- classification must never alter clustering.
ALTER TABLE story_clusters
  -- NULL when unclassified — "Unclassified" is a STATUS, never a Bidang value.
  ADD COLUMN IF NOT EXISTS field                          TEXT,
  ADD COLUMN IF NOT EXISTS classification_status          TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'unclassified')),
  ADD COLUMN IF NOT EXISTS classification_method          TEXT,
  ADD COLUMN IF NOT EXISTS classification_rule            TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence      NUMERIC(4,3) NOT NULL DEFAULT 0,
  -- Both candidates are retained even though only one wins, so the audit trail
  -- can say "Politik by subject rule, even though it is also a Malaysia story".
  ADD COLUMN IF NOT EXISTS subject_candidate              TEXT,
  ADD COLUMN IF NOT EXISTS geography_candidate            TEXT,
  -- Nullable on purpose: rows predating classifier v1 genuinely have no
  -- ruleset. After the first classification pass every row carries one —
  -- including unclassified rows, because "unclassified" is itself a RESULT of
  -- a ruleset, not the absence of a decision. Never use updated_at as a
  -- substitute: that is a lifecycle timestamp, not classification provenance.
  ADD COLUMN IF NOT EXISTS classification_ruleset_version TEXT;

-- Enforces the field/status split at the database level, so "Unclassified"
-- can never creep back in as a Bidang value.
ALTER TABLE story_clusters
  DROP CONSTRAINT IF EXISTS field_matches_status;
ALTER TABLE story_clusters
  ADD CONSTRAINT field_matches_status CHECK (
    (classification_status = 'classified'   AND field IS NOT NULL) OR
    (classification_status = 'unclassified' AND field IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_story_clusters_field  ON story_clusters (field);
CREATE INDEX IF NOT EXISTS idx_story_clusters_status ON story_clusters (classification_status);

COMMIT;
