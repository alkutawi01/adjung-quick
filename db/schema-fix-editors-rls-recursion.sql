-- schema-fix-editors-rls-recursion.sql — FASA 3.6.3a hotfix (2026-08-13).
--
-- Bug found live: wiring story_overrides into productionAdapter.js's
-- fetchRankedQueue() (the reader's anonymous client) surfaced
-- "infinite recursion detected in policy for relation 'editors'".
--
-- Root cause: editors' own RLS SELECT policy
-- (db/schema-editorial-state.sql) checks admin status with
--   EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid() AND e.role = 'admin')
-- — a subquery against `editors` INSIDE editors' own policy. Postgres must
-- satisfy that same SELECT policy to evaluate the subquery's rows, which
-- requires evaluating the subquery again, recursing until Postgres's
-- recursion-depth guard throws.
--
-- Why this wasn't caught during 3.6.1's own verification: for an admin
-- checking THEIR OWN row, `auth.uid() = user_id` is true on the very first
-- clause, and Postgres's planner can short-circuit the OR before ever
-- evaluating the recursive EXISTS — so Izzat's own admin session and the
-- getEditorRole() bootstrap check never hit it. An ANONYMOUS session
-- (auth.uid() IS NULL) can never satisfy that first clause, forcing full
-- evaluation of the OR's right side on every call — which is exactly the
-- code path productionAdapter.js's reader client takes when it now queries
-- story_overrides (whose own policy also bottoms out in a SELECT against
-- editors).
--
-- Standard fix (Supabase's own documented pattern for self-referential
-- "is this user an admin of this same table" policies): move the admin
-- check into a SECURITY DEFINER function. Such a function runs as its
-- OWNER (the migration role, which owns `editors` and is therefore exempt
-- from editors' own RLS unless FORCE ROW LEVEL SECURITY is set — it isn't
-- here), so its internal SELECT never re-triggers editors' policy, and the
-- recursion cycle is broken structurally, not papered over.
--
-- Purely additive/replacing — no data touched, no table dropped.

BEGIN;

CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM editors WHERE user_id = check_user_id AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS editors_select_own_or_admin ON editors;
CREATE POLICY editors_select_own_or_admin ON editors
  FOR SELECT USING (
    auth.uid() = user_id OR is_admin(auth.uid())
  );

-- Same structural flaw existed in these two (never observed live yet, since
-- nothing exercises editor add/remove through the app today) — fixed
-- alongside the SELECT policy rather than left for the next person to
-- rediscover the identical bug.
DROP POLICY IF EXISTS editors_insert_admin_only ON editors;
CREATE POLICY editors_insert_admin_only ON editors
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS editors_delete_admin_only ON editors;
CREATE POLICY editors_delete_admin_only ON editors
  FOR DELETE USING (is_admin(auth.uid()));

-- story_overrides_editor_rw / source_overrides_editor_rw are NOT changed —
-- they were never self-referential (their EXISTS queries `editors` from a
-- DIFFERENT table's policy). They only recursed because the `editors`
-- SELECT policy they depend on was itself broken; fixing that policy above
-- is sufficient to unblock every downstream query through them.

COMMIT;
