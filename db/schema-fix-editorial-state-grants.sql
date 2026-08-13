-- schema-fix-editorial-state-grants.sql — hotfix (2026-08-13).
--
-- Bug found live: `editors` (and, by the same missing pattern,
-- story_overrides/source_overrides) never received a base Postgres GRANT
-- for the `authenticated` role — only RLS POLICIES were written in
-- db/schema-editorial-state.sql (3.6.1). In Postgres/Supabase, RLS is a
-- FURTHER restriction on top of a base table-level GRANT, not a
-- replacement for it: a role with no GRANT gets "permission denied"
-- (42501) before RLS is ever evaluated, regardless of how correct the
-- policy is.
--
-- Real-world impact just discovered: this means NO signed-in editor
-- session — including Izzat's own admin account — could ever actually
-- read `editors` or write `story_overrides` through the app's normal
-- (non-service-role) client. The Fasa 3.6.1 bootstrap verification and
-- the Fasa 3.6.2 Admin UAT Izzat reported as PASS were both false
-- positives: `story_overrides` currently has ZERO rows, confirming no
-- override write ever actually reached the database. The UI likely
-- degraded quietly enough (no dramatic crash) that this wasn't obvious
-- from the admin side.
--
-- Fix: grant exactly what each table's own RLS policies already assume.
-- No RLS policy is changed — this only unblocks the base privilege check
-- that RLS depends on.

BEGIN;

GRANT SELECT, INSERT, DELETE ON editors TO authenticated;

GRANT SELECT, INSERT, UPDATE ON story_overrides TO authenticated;

GRANT SELECT, INSERT, UPDATE ON source_overrides TO authenticated;

COMMIT;
