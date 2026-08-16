-- schema-fix-editorial-filter-rules-grants.sql — hotfix (2026-08-16).
--
-- Same bug class as schema-fix-editorial-state-grants.sql (2026-08-13):
-- db/schema-editorial-filter-rules-v1.sql wrote an RLS POLICY for
-- editorial_filter_rules but never granted the base Postgres table-level
-- privilege for the `authenticated` role. RLS is a FURTHER restriction on
-- top of a base GRANT, not a replacement for it — a role with no GRANT
-- gets "permission denied" (42501) before RLS is ever evaluated.
--
-- Found live 2026-08-16, testing the new Editorial Filter Rules admin UI
-- immediately after building it (not discovered by a stale UAT this
-- time — caught before Izzat ever saw it): the signed-in admin session
-- got "permission denied for table editorial_filter_rules", with
-- Postgres's own error hint naming the exact fix.
--
-- Fix: grant exactly what the table's own RLS policy already assumes.
-- No RLS policy changed — this only unblocks the base privilege check
-- RLS depends on. DELETE included (unlike story_overrides/
-- source_overrides, which are never row-deleted by the app) because
-- FilterRulesManager's "Buang" button does a real DELETE.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON editorial_filter_rules TO authenticated;

COMMIT;
