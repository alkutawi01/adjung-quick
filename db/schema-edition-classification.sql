-- schema-edition-classification.sql — Production Classification Wiring
-- (Session UI-1.1A, 2026-08-12).
--
-- Creates the per-edition placement table proposed (but never created) in
-- docs/edition-architecture-model.md. This is the missing link found while
-- starting UI-1.1: the classification engine (frozen, validated across
-- Batch A/M/U/Medium — docs/evidence-policy-v1-decision.md) produces
-- per-edition placements, but production still serves the OLD classifier's
-- single `story_clusters.topic` (values: Politics/Economy/Sports/World/
-- Science/Health from lab/classify.js), which has ZERO overlap with any
-- edition's real taxonomy (Politik/Jenayah/Bisnes/... for ms-MY).
--
-- PURELY ADDITIVE. `story_clusters.topic` is deliberately KEPT and NOT
-- dropped — same discipline as db/schema-classification.sql: the legacy
-- column stays until the new path is proven in production, so a bad
-- migration can't take the reader-facing app down. Cleanup happens only
-- after: table populated -> adapter switched -> UI verified -> regression
-- passes.

BEGIN;

-- One row per (story, edition). A single story legitimately resolves to a
-- DIFFERENT field per edition — that is the entire point of the Edition
-- Architecture, not a data anomaly:
--   "Lebanon parliament votes..." -> ms-MY: Dunia | en: Politics | ar: سياسة
CREATE TABLE IF NOT EXISTS edition_story_classifications (
  -- TEXT, not UUID: story_clusters.id is TEXT (it holds clusterKey from
  -- lab/engine.js, not a generated UUID — see db/schema.sql:38). Getting
  -- this wrong fails at migration time with "Key columns story_id and id
  -- are of incompatible types: uuid and text".
  story_id    TEXT NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  edition_id  TEXT NOT NULL,          -- 'ms-MY' | 'en' | 'ar' — matches state/editions.js's editionId

  -- NULL when unclassified. Per docs/structural-evidence-fallback-policy.md,
  -- "Unclassified" is an honest, legitimate outcome (evidence too weak to
  -- place automatically), NEVER a field value and never an error state.
  field       TEXT,
  sub_field   TEXT,

  classification_status  TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'unclassified')),

  -- Audit trail, per docs/calibration-ready-engine.md §A. These are what
  -- make the engine "teachable" later: without a record of WHY a story
  -- landed where it did, there is nothing for a future calibration round
  -- to correct against.
  classification_method  TEXT,        -- 'edition_rule' | 'default_mapping' | 'geography_fallback' | 'low_confidence_fallback' | 'none'
  classification_rule    TEXT,
  classification_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  ruleset_version        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (story_id, edition_id)
);

-- Mirrors story_clusters' own field/status constraint so "Unclassified"
-- can never leak in as a Bidang value at the database level.
ALTER TABLE edition_story_classifications
  DROP CONSTRAINT IF EXISTS edition_field_matches_status;
ALTER TABLE edition_story_classifications
  ADD CONSTRAINT edition_field_matches_status CHECK (
    (classification_status = 'classified'   AND field IS NOT NULL) OR
    (classification_status = 'unclassified' AND field IS NULL)
  );

-- The production read path: "give me this edition's placement for these
-- stories" — the query productionAdapter.js will run once switched over.
CREATE INDEX IF NOT EXISTS idx_esc_edition_field
  ON edition_story_classifications (edition_id, field);

CREATE INDEX IF NOT EXISTS idx_esc_story
  ON edition_story_classifications (story_id);

-- Reader access. This is public editorial data — the same class as
-- story_clusters/rss_items/sources, which the app already reads with the
-- anon key. Without this the UI fails with "permission denied for table
-- edition_story_classifications" (found live, 2026-08-12).
--
-- SELECT only: writes stay service-role (db/classify-production.js). This is
-- deliberately NOT the pattern used by saved_stories/history_entries in
-- db/schema-identity.sql — those are per-user personal data and use RLS with
-- auth.uid() policies. Editorial placement is not personal data.
GRANT SELECT ON edition_story_classifications TO anon, authenticated;

COMMIT;
