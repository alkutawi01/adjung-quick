-- schema-revoke-public-execute-v1.sql
--
-- CRITICAL SECURITY FIX (2026-08-17). Found live during Backend Control
-- Plane Phase 2 verification: PostgreSQL grants EXECUTE on every new
-- function to PUBLIC by default. Every admin RPC function created this
-- session used `GRANT EXECUTE ON FUNCTION ... TO service_role` but NEVER
-- `REVOKE ... FROM PUBLIC` first — so the service_role grant was additive,
-- not exclusive, and the anon/authenticated keys could call these
-- functions the entire time.
--
-- Proven live: called rename_taxonomy_field() with the anon key against a
-- real row (the 'Nasional' Bidang) — it succeeded (status 204) and
-- actually renamed the row to 'HACK' in production. Reverted immediately
-- via service_role. This is not a theoretical gap.
--
-- Fix: explicit REVOKE EXECUTE FROM PUBLIC on every admin-write/trigger
-- function defined so far, before the existing GRANTs (which are kept,
-- unchanged) take effect. Read-only data access is untouched — this file
-- only removes the accidental PUBLIC execute grant on functions that were
-- always meant to be service_role-only (or service_role+authenticated for
-- the one trigger function).
--
-- STATUS: APPLIED to production 2026-08-17. Containment verified: all 12
-- functions return code 42501 (permission denied) for anon; service_role
-- unaffected. Follow-up catalog audit (pg_proc + has_function_privilege)
-- found 4 additional trigger functions with default_public_exec=true
-- (forbid_representative_reassignment, story_overrides_freeze_identity,
-- story_overrides_set_expiry, validate_editorial_story_reference) — confirmed
-- empirically non-exploitable: PostgREST returns PGRST202 ("not found") for
-- all 4 when called as RPC, since RETURNS TRIGGER functions are never
-- exposed as callable RPC endpoints regardless of EXECUTE grants. 0
-- unintended exposure remains after this fix.

BEGIN;

REVOKE EXECUTE ON FUNCTION swap_ingestion_staging() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_editorial_story_reference() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION repoint_story_clusters_fks() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION drop_ingestion_old_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_ingestion_staging() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rollback_ingestion_swap() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_admin(UUID) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION add_taxonomy_field(TEXT, TEXT, TEXT, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rename_taxonomy_field(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_taxonomy_field_visibility(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_taxonomy_field_status(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION merge_taxonomy_fields(TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;
