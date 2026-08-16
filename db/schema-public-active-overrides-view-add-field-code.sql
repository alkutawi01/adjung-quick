-- schema-public-active-overrides-view-add-field-code.sql — Taxonomy
-- Stable Field-ID V1 (2026-08-16). Appends new_field_code to
-- public_active_overrides, per that view's own established convention
-- (CREATE OR REPLACE VIEW may only APPEND columns, never reorder/rename —
-- see schema-public-active-overrides-view.sql's own comment).
--
-- productionAdapter.js needs this to resolve a pin/reclassify override's
-- fieldCode without a second query — same reasoning as the original view.

BEGIN;

CREATE OR REPLACE VIEW public_active_overrides AS
  SELECT story_id, edition_id, override_type, new_field, id, created_at, new_field_code
  FROM story_overrides
  WHERE active = true
    AND (expires_at IS NULL OR expires_at > now());

COMMIT;
