-- schema-classification-rules-rpc-authenticated-rollback-v1.sql
--
-- Reverses db/schema-classification-rules-rpc-authenticated-patch-v1.sql.
--
-- Use this if the authenticated-write patch causes any problem in
-- production. It returns Classification Rules to service_role-only
-- writes, i.e. the exact state before the patch: the Admin Console goes
-- back to read-only for Kategori overrides, and nothing else changes.
--
-- This only REVOKES the grant. The admin guard added to the function
-- bodies is intentionally LEFT IN PLACE, because it is harmless once
-- `authenticated` can no longer reach the functions at all -- and because
-- it uses the V2 pattern, service_role (auth.uid() IS NULL) still passes
-- it. Removing the guard too would mean re-pasting three function bodies
-- for no safety gain.
--
-- STATUS: NOT APPLIED (rollback only -- run only if needed).

BEGIN;

REVOKE EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION archive_classification_rule(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION restore_classification_rule(UUID) FROM authenticated;

COMMIT;
