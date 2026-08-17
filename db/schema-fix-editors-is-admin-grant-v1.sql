-- schema-fix-editors-is-admin-grant-v1.sql
--
-- Fixes a pre-existing bug in db/schema-fix-editors-rls-recursion.sql
-- (Fasa 3.6.3a, applied 2026-08-13) — NOT a Backend Control Plane Phase 3
-- regression. That migration created is_admin(UUID) as a SECURITY
-- DEFINER helper for editors' own RLS policy:
--
--   editors_select_own_or_admin: (auth.uid() = user_id) OR is_admin(auth.uid())
--
-- but never granted `authenticated` EXECUTE on the function itself. Its
-- own header comment assumed Postgres would short-circuit the OR for a
-- self-lookup (auth.uid() = user_id true, so is_admin() never actually
-- runs) — that assumption was wrong: Postgres validates EXECUTE
-- privilege on every function referenced in a policy expression
-- regardless of whether short-circuit evaluation would skip calling it.
-- The result: ANY authenticated user's own editors row lookup failed
-- outright with "permission denied for function is_admin" (42501),
-- including a genuine admin checking their own row — this went
-- undetected until 2026-08-18 because no one had reason to test a truly
-- fresh /admin sign-in since the recursion-fix migration shipped.
--
-- Confirmed live via a temporary, since-reverted diagnostic
-- (commit dc01b04) on a real admin account (alkutawi01@gmail.com):
--   status: 401, errorCode: 42501,
--   errorMessage: "permission denied for function is_admin"
--
-- Fix: the single missing GRANT. Does not touch the policy expression,
-- does not touch SECURITY DEFINER, does not touch is_admin()'s body, and
-- deliberately does NOT grant anon — is_admin() is an authorization
-- helper for authenticated users' own RLS evaluation, not a public RPC.
--
-- STATUS: NOT YET APPLIED. Apply via Supabase SQL Editor only after
-- explicit approval, per this session's established discipline.

BEGIN;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

COMMIT;
