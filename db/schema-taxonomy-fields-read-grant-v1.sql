-- schema-taxonomy-fields-read-grant-v1.sql
--
-- Backend Control Plane — Phase 2, fix found live during browser
-- cutover verification (2026-08-17): taxonomy_fields was created with
-- RLS enabled and ZERO policies (default-deny), same "service-role
-- only for now" posture as every other admin-write table this session
-- — but taxonomy is PUBLIC reader-facing data (Kategori names), read
-- via the anon key from the browser (loadEditionsFromDB(), per
-- docs/control-plane-phase2-taxonomy-browser-cutover-implementation-plan-v1.md),
-- same as `sources`/`story_clusters`/`rss_items` already are. Confirmed
-- live: "permission denied for table taxonomy_fields" from the anon
-- key, exactly the class of bug this session's verification workflow
-- exists to catch before calling a cutover done.
--
-- Additive, read-only grant. Does not change write permissions —
-- add/rename/merge/etc. RPCs remain service_role only
-- (db/schema-taxonomy-fields-rpc-v1.sql, unchanged).
--
-- STATUS: APPLIED to production 2026-08-17, verified (anon/authenticated SELECT
-- work, anon write still blocked).

BEGIN;

CREATE POLICY taxonomy_fields_public_read ON taxonomy_fields
  FOR SELECT USING (true);

GRANT SELECT ON taxonomy_fields TO anon, authenticated;

COMMIT;
