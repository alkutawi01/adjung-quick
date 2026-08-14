-- schema-operational-snapshots.sql — FASA 4.1, 2026-08-15.
-- Per docs/operational-visibility-data-contract-v1.md, approved by
-- ChatGPT with three explicit guards, all applied here:
--
-- 1. SUMMARY COLUMNS ONLY, never a raw JSON blob — a typed row, not a
--    dumping ground. daily-observation.mjs's full computed object stays
--    exactly where it already is (db/observations/*.json, local,
--    service-role-only); this table holds only the four numbers an
--    admin actually needs to see.
-- 2. RLS clear from the start: anon gets SELECT on the VIEW only, never
--    the base table. No policy at all is granted to anon/authenticated
--    on the base table — absence of a policy is a denial, the same
--    fail-closed default this project's RLS has used throughout. The
--    service role (daily-observation.mjs's existing client) bypasses
--    RLS by default in Postgres/Supabase, so it can INSERT without any
--    policy naming it — this is NOT the "GRANT missing" bug from
--    earlier this phase; that gap was `authenticated` needing INSERT
--    through the anon-key + RLS path, which `service_role` never uses.
-- 3. Bounded exposure: the view returns only the most recent 30 rows —
--    not unlimited history to anyone who can reach the anon key.
--
-- operational_snapshots is HISTORICAL OBSERVATION DATA — what happened —
-- never editorial state, and never a source of truth for reader-facing
-- decisions. Nothing in the ranking or classification path may read
-- from it, now or later.

BEGIN;

CREATE TABLE operational_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date           DATE NOT NULL UNIQUE,
  stories_processed       INTEGER NOT NULL,
  review_queue_count      INTEGER NOT NULL,
  failed_sources_count    INTEGER NOT NULL,
  active_override_count   INTEGER NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operational_snapshots ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy for anon or authenticated on the base table —
-- the view below is the only sanctioned read path for either role.

CREATE VIEW operational_snapshots_public AS
  SELECT snapshot_date, stories_processed, review_queue_count,
         failed_sources_count, active_override_count
  FROM operational_snapshots
  ORDER BY snapshot_date DESC
  LIMIT 30;

GRANT SELECT ON operational_snapshots_public TO anon;

COMMIT;
