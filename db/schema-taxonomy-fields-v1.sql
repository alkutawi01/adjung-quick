-- schema-taxonomy-fields-v1.sql
--
-- Backend Control Plane — Phase 2 (Taxonomy/Kategori).
-- Per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md
-- (approved by ChatGPT 2026-08-17).
--
-- Additive only — no existing table touched. `taxonomy_fields` becomes
-- the backend source of truth for what classification/lib/taxonomy-registry.mjs's
-- TAXONOMY_REGISTRY currently hardcodes; TAXONOMY_REGISTRY itself is
-- kept as a fallback/reference (same posture as lab/sources.js after
-- Phase 1's cutover), not deleted.
--
-- STATUS: NOT YET APPLIED. Apply via Supabase SQL Editor only after
-- explicit production-execution approval, per this session's
-- established discipline.

BEGIN;

CREATE TABLE taxonomy_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id      TEXT NOT NULL,
  -- Stable, immutable once created — every consumer (classification,
  -- reader, overrides) keys on this, never on `label`. Validated
  -- machine-safe: lowercase, starts with a letter, 2-32 chars.
  field_code      TEXT NOT NULL CHECK (field_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  -- The ONLY Admin-editable field for an existing row (rename = UPDATE
  -- label, nothing else).
  label           TEXT NOT NULL,
  -- Which Universal Subject value(s) this field resolves from —
  -- classification-internal, not Admin-facing. NULL for
  -- geography-residual fields (Nasional/Dunia/World/العالم), matching
  -- taxonomy-registry.mjs's existing convention exactly.
  subject_codes   TEXT[],
  wheel_visible   BOOLEAN NOT NULL DEFAULT true,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  -- Preserves the Wheel's existing curated order (not alphabetical) —
  -- taxonomy-registry.mjs's own array order, per edition.
  display_order   INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, field_code)
);

CREATE INDEX idx_taxonomy_fields_edition_status ON taxonomy_fields (edition_id, status);
CREATE INDEX idx_taxonomy_fields_edition_order ON taxonomy_fields (edition_id, display_order);

-- Service-role only for now — this table has no reader-facing RLS
-- policy yet because the reader consumes it via the existing
-- state/editions.js -> EDITIONS shape (§6 of the implementation plan),
-- not a direct client-side query, same posture editorial state tables
-- started with in this project.
ALTER TABLE taxonomy_fields ENABLE ROW LEVEL SECURITY;

COMMIT;
