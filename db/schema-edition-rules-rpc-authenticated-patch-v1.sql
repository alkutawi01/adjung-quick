-- schema-edition-rules-rpc-authenticated-patch-v1.sql
--
-- Patches schema-edition-rules-rpc-v1.sql (already applied to
-- production). Per ChatGPT's decision on the "browser admin UI can't
-- call service_role-only RPCs" blocker found before building the Admin
-- UI: keep the RPC architecture (validation, reason requirements,
-- archive/restore semantics — already built and tested), but fix the
-- authority grant + add an authorization check so it matches the real
-- deployment model (a signed-in admin's browser session is
-- `authenticated`, never `service_role` — that secret key is
-- server-side only and never reaches the SPA).
--
-- Security contract (verified against is_admin(check_user_id UUID)'s
-- existing definition in schema-fix-editors-rls-recursion.sql before
-- writing this — not assumed):
--   - is_admin() is SECURITY DEFINER, STABLE, search_path pinned to
--     public, already GRANTed to `authenticated` (schema-fix-editors-
--     is-admin-grant-v1.sql).
--   - Every call site below passes is_admin(auth.uid()) — the caller's
--     OWN session id, taken from the JWT Postgres already validated.
--     No function here exposes a p_user_id parameter, so a client can
--     never ask "is some OTHER user an admin" — there is no injection
--     surface for privilege escalation.
--   - anon has no execute grant (untouched, still revoked).
--   - authenticated non-admin: passes the GRANT check (can invoke the
--     function at all) but fails the internal is_admin() check inside
--     the function body, raising an exception before any write.
--   - authenticated admin: passes both checks, write proceeds.
--   - service_role: still granted (kept per ChatGPT's explicit note —
--     "service role masih boleh digunakan untuk operational/admin
--     backend use case jika diperlukan"), and SECURITY DEFINER means
--     service_role callers bypass the is_admin() check the same way
--     they already bypass RLS — consistent with how service_role is
--     treated everywhere else in this project.
--
-- Deliberately NOT touched: classification_rules' identical gap. Per
-- ChatGPT's explicit instruction, that is a separate, later checkpoint
-- (Fasa 3 is Admin Read-Only V1 by contract; opening its write RPCs to
-- authenticated is an authority-contract change for a different phase,
-- not a blocker fix).
--
-- STATUS: NOT YET APPLIED.

BEGIN;

CREATE OR REPLACE FUNCTION add_edition_rule(
  p_edition_id TEXT,
  p_condition_subject TEXT,
  p_action_field_code TEXT,
  p_condition_geography_type TEXT DEFAULT NULL,
  p_condition_geography_value TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 0,
  p_created_by TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'add_edition_rule: memerlukan peranan admin.';
  END IF;

  IF p_edition_id IS NULL OR p_edition_id = '' THEN
    RAISE EXCEPTION 'add_edition_rule: edition_id is required';
  END IF;

  IF p_condition_subject IS NULL OR p_condition_subject = '' THEN
    RAISE EXCEPTION 'add_edition_rule: condition_subject is required';
  END IF;

  IF p_action_field_code IS NULL OR p_action_field_code = '' THEN
    RAISE EXCEPTION 'add_edition_rule: action_field_code is required';
  END IF;

  IF p_condition_geography_type IS NOT NULL AND p_condition_geography_type NOT IN ('not', 'is') THEN
    RAISE EXCEPTION 'add_edition_rule: condition_geography_type must be "not" or "is", got "%"', p_condition_geography_type;
  END IF;

  IF NOT (
    (p_condition_geography_type IS NULL AND p_condition_geography_value IS NULL) OR
    (p_condition_geography_type IS NOT NULL AND p_condition_geography_value IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'add_edition_rule: geography type and value must both be set or both be null — got type=%, value=%',
      p_condition_geography_type, p_condition_geography_value;
  END IF;

  INSERT INTO edition_rules (
    edition_id, condition_subject, condition_geography_type, condition_geography_value,
    action_field_code, priority, status, created_by
  ) VALUES (
    p_edition_id, p_condition_subject, p_condition_geography_type, p_condition_geography_value,
    p_action_field_code, p_priority, 'active', p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION archive_edition_rule(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'archive_edition_rule: memerlukan peranan admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM edition_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'archive_edition_rule: id % not found', p_id;
  END IF;
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'archive_edition_rule: reason is required to archive a rule';
  END IF;
  UPDATE edition_rules SET status = 'archived', reason = p_reason, updated_at = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_edition_rule(
  p_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'restore_edition_rule: memerlukan peranan admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM edition_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'restore_edition_rule: id % not found', p_id;
  END IF;
  UPDATE edition_rules SET status = 'active', reason = NULL, updated_at = now() WHERE id = p_id;
END;
$$;

-- REVOKE/GRANT unchanged for PUBLIC and service_role (still revoked /
-- still granted respectively) — only the new `authenticated` grant is
-- additive here. Same block, same discipline as every prior RPC file.
REVOKE EXECUTE ON FUNCTION add_edition_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION archive_edition_rule(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION restore_edition_rule(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION add_edition_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION archive_edition_rule(UUID, TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION restore_edition_rule(UUID) TO service_role, authenticated;

COMMIT;
