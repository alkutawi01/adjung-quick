-- schema-public-active-filter-rules-view.sql — Editorial Filter Rules V1,
-- same fix shape as schema-public-active-overrides-view.sql (2026-08-13).
--
-- Found live 2026-08-16, right after editorial_filter_rules was applied:
-- the reader (anon) client got "permission denied for table
-- editorial_filter_rules" — CORRECT per that table's own RLS (signed-in
-- editors only, matching story_overrides' posture). productionAdapter.js
-- runs on the anon client; it needs read access to ACTIVE rules only,
-- never `reason` or `created_by` (an editor's internal note and an
-- auth.users UUID). A narrow VIEW, not a broader GRANT on the base table.
--
-- ui/src/admin/reviewQueueAdapter.js is unaffected — it runs on the
-- signed-in admin's own authenticated client, which already has RLS
-- access to the base table directly.

BEGIN;

CREATE OR REPLACE VIEW public_active_filter_rules AS
  SELECT id, rule_type, phrase
  FROM editorial_filter_rules
  WHERE active = true;

GRANT SELECT ON public_active_filter_rules TO anon;

COMMIT;
