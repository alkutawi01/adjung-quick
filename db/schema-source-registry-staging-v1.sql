-- schema-source-registry-staging-v1.sql — Backend Control Plane Phase 1.
--
-- Per docs/backend-control-plane-phase1-source-registry-design-v1.md and
-- ChatGPT's explicit staging-only instruction (2026-08-16): this is a
-- SEPARATE staging table, not the real `sources` table and not
-- ingestion's own `sources_staging` swap mechanism — deliberately
-- isolated so Phase 1 can be built and tested with zero risk of an
-- ingestion run overwriting it, and zero effect on the real reader/admin
-- until an explicit, separately-approved production cutover.
--
-- Shape matches what `sources` will look like AFTER Phase 1's cutover
-- (§A of the design doc) — this table exists so the migration/RPC logic
-- can be fully proven, then re-applied to the real `sources` table
-- verbatim at cutover time.
--
-- STATUS (2026-08-18, per docs/control-plane-phase1-cutover-completion-
-- implementation-plan-v1.md Item 3): cutover is complete —
-- db/source-registry-adapter.mjs now targets `sources` directly. This
-- table has no remaining production or test consumer as of commit
-- 649c53b + the source-registry-staging.test.mjs retirement. Kept
-- temporarily as a rollback reference only, pending a separate DROP
-- TABLE migration after live verification passes. Do not build new
-- functionality against this table.

BEGIN;

CREATE TABLE IF NOT EXISTS sources_registry_staging (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL,
  language          TEXT NOT NULL CHECK (language IN ('ms', 'en', 'ar')),
  trust_score       INTEGER NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  known_category    TEXT,
  source_type       TEXT CHECK (source_type IN ('general', 'specialised', 'authority_niche')),
  exclude_patterns  TEXT[],
  extra_ca          TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'disabled', 'archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only — this is a developer/staging verification table,
-- not reader/admin-facing yet. No RLS policy needed beyond default-deny
-- (RLS enabled, zero policies = zero access for anon/authenticated).
ALTER TABLE sources_registry_staging ENABLE ROW LEVEL SECURITY;

COMMIT;
