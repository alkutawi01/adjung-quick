-- schema-fix-operational-snapshots-authenticated-grant.sql — 2026-08-15.
--
-- Real gap found while planning FASA 4.1.3 (Admin Digest Trend), before
-- any code was written: db/schema-operational-snapshots.sql granted
-- SELECT on operational_snapshots_public to `anon` only. But the actual
-- consumer of this data is the Admin Digest — ui/src/admin/reviewQueueAdapter.js's
-- fetchDigest(), which always runs on the AUTHENTICATED admin session
-- (adminSupabase), never the anonymous reader client.
--
-- `anon` and `authenticated` are separate Postgres roles in Supabase's
-- model with no automatic inheritance between them — granting one never
-- grants the other. Without this fix, fetchDigest() would have been
-- built against a view its own caller could not actually read, the
-- exact "table exists, policy exists, GRANT wrong/missing" bug shape
-- this project has already hit twice this phase.
--
-- `anon` access is kept, not removed: ChatGPT's own architecture note
-- called this an "anon-safe VIEW" — the projection is deliberately safe
-- even for anonymous access (no reason/created_by-equivalent fields),
-- so there's no least-privilege reason to withhold it from `authenticated`
-- once anon already has it. Both are granted rather than swapping one for
-- the other.

BEGIN;

GRANT SELECT ON operational_snapshots_public TO authenticated;

COMMIT;
