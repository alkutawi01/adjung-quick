-- schema-source-registry-production-v1.sql — Backend Control Plane Phase 1,
-- PRODUCTION schema change.
--
-- Additive only — adds the same new columns already proven in
-- sources_registry_staging (docs/backend-control-plane-phase1-source-registry-design-v1.md
-- §A) to the REAL `sources` table. Does not touch, rename, or drop any
-- existing column (id, name, url, language, trust_score, coverage,
-- active, last_success_at, last_failure_at, last_failure_reason,
-- created_at all stay exactly as-is).
--
-- Per the approved cutover plan (docs/backend-control-plane-phase1-source-registry-production-cutover-plan-v1.md,
-- commit c8e3968): this schema change is safe to apply standalone — it
-- adds nullable/defaulted columns only, so existing rows and every
-- existing reader of `sources` are unaffected until the separate data
-- migration (db/generate-source-registry-production-migration.mjs) and
-- cutover (§7, still pending approval) run.
--
-- STATUS: NOT YET APPLIED. Written for review, per ChatGPT's explicit
-- "tulis migration script sahaja, jangan jalankan production" instruction
-- (2026-08-16). Apply manually via Supabase SQL Editor when approved —
-- this project has no automated migration runner (established convention,
-- every prior schema-*.sql file).

BEGIN;

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'archived')),
  ADD COLUMN IF NOT EXISTS known_category TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT
    CHECK (source_type IN ('general', 'specialised', 'authority_niche')),
  ADD COLUMN IF NOT EXISTS exclude_patterns TEXT[],
  ADD COLUMN IF NOT EXISTS extra_ca TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Fast lookup for the new active-source reader (fetchActiveSources(),
-- same shape as sources_registry_staging's usage) — mirrors idx_sources_active
-- (db/schema.sql:30), which stays in place unchanged for the legacy
-- `active` column per the cutover plan's §4a invariant.
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources (status) WHERE status = 'active';

COMMIT;
