-- schema-fix-server-side-expiry.sql — 2026-08-13.
-- Fixes docs/editorial-adversarial-audit-v1.md Audit 2 findings B and C.
--
-- FINDING B — writeOverride() hardcoded a single 7-day expiry for every
-- override_type, with no branch for type. Pin's governance
-- (docs/pin-governance-design-v1.md) requires 24h default / 72h max — a
-- pin built on the existing write path would have silently lived 5 days
-- longer than its own rule.
--
-- FINDING C — expires_at was COMPUTED on the admin's device
-- (new Date(Date.now() + N)) but ENFORCED against the Postgres server
-- clock (expires_at > now(), in the view and in fetchReviewQueue). A
-- skewed client clock shifts real expiry either direction. Not
-- hypothetical: this project has already hit genuine client/server clock
-- skew ("JWT issued at future" errors, handled elsewhere with a retry
-- helper).
--
-- FIX FOR BOTH, AT ONCE: expires_at is no longer client-supplied at all.
-- A BEFORE INSERT trigger computes it server-side from override_type,
-- unconditionally overwriting whatever (if anything) the client sent.
-- Consequence: the SAME clock (Postgres's own now()) is now used to SET
-- expiry and to CHECK it — the two-clock mismatch is eliminated
-- structurally, not by trusting either side to stay in sync. Duration
-- policy also moves from a JS constant to one place in SQL, so a future
-- override type cannot ship without an explicit decision here.
--
-- Per-type durations, per governance:
--   hide / reclassify / boost : 7 days  (existing behaviour, unchanged)
--   pin                       : 24 hours (governance default; Pin itself
--                                is not implemented yet, but the CHECK
--                                constraint already accepts the value)
--
-- UPDATE is untouched — an admin extending/shortening an override's
-- expiry after the fact remains a normal UPDATE, not frozen by
-- schema-fix-override-rls-ownership.sql's identity trigger (expires_at is
-- deliberately not in that trigger's frozen column list).

BEGIN;

CREATE OR REPLACE FUNCTION story_overrides_set_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.expires_at := now() + CASE NEW.override_type
    WHEN 'pin' THEN interval '24 hours'
    ELSE interval '7 days'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_overrides_set_expiry_trg ON story_overrides;
CREATE TRIGGER story_overrides_set_expiry_trg
  BEFORE INSERT ON story_overrides
  FOR EACH ROW EXECUTE FUNCTION story_overrides_set_expiry();

COMMIT;
