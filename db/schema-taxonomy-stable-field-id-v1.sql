-- schema-taxonomy-stable-field-id-v1.sql — Taxonomy Stable Field-ID V1.
--
-- Per docs/taxonomy-stable-field-id-design-v1.md (§5, Option C, locked by
-- ChatGPT 2026-08-16) and docs/taxonomy-stable-field-id-migration-plan-v1.md.
-- PURELY ADDITIVE — no existing column dropped, no existing data touched by
-- this file (backfill is a separate script, db/backfill-taxonomy-codes.mjs).
--
-- subject_code: the raw global Universal Subject fact (e.g. 'business',
-- 'economy') — what the classifier actually matched, before any edition
-- collapses it into a display field. NULL is legitimate for
-- geography-residual rows (Nasional/Dunia/World — no subject candidate
-- ever existed for these).
--
-- field_code: the edition-resolved, stable identifier for the DISPLAYED
-- Bidang (e.g. 'bisnes' for ms-MY, which merges 'business'+'economy').
-- This is what every consumer (reader, ranking, Pin) compares going
-- forward — never the mutable `label`.
--
-- Apply manually via Supabase SQL Editor — this project has no automated
-- migration runner.

BEGIN;

ALTER TABLE edition_story_classifications
  ADD COLUMN IF NOT EXISTS subject_code TEXT,
  ADD COLUMN IF NOT EXISTS field_code   TEXT;

-- 'unknown_pre_migration' is an explicit, deliberate sentinel (per
-- ChatGPT's fail-closed instruction) for the 59 ms-MY Bisnes rows whose
-- original business-vs-economy fact was already discarded before this
-- migration existed — never guessed, never silently NULL (which would be
-- indistinguishable from a genuine geography-residual row).
COMMENT ON COLUMN edition_story_classifications.subject_code IS
  'Global Universal Subject fact (e.g. business, economy, crime). NULL for geography-residual rows (Nasional/Dunia/World) — legitimate, not a gap. ''unknown_pre_migration'' for rows classified before this column existed, whose original fact was already discarded by resolveDefaultPlacement() at the time.';
COMMENT ON COLUMN edition_story_classifications.field_code IS
  'Stable, edition-resolved identifier for the displayed Bidang (e.g. bisnes for ms-MY). Every consumer compares this, never the mutable label.';

CREATE INDEX IF NOT EXISTS idx_esc_edition_field_code
  ON edition_story_classifications (edition_id, field_code);

-- story_overrides.new_field_code — same discipline, for reclassify/pin
-- overrides (they share this column, per editorialStateResolver.mjs).
ALTER TABLE story_overrides
  ADD COLUMN IF NOT EXISTS new_field_code TEXT;
COMMENT ON COLUMN story_overrides.new_field_code IS
  'Stable field_code equivalent of new_field, for reclassify/pin overrides. An editor picks a displayed Bidang, so this is always an edition-resolved code, never a raw subject_code.';

COMMIT;
