-- schema-edition-rules-rpc-authenticated-patch-v2-hotfix.sql
--
-- Hotfix for schema-edition-rules-rpc-authenticated-patch-v1.sql
-- (already applied to production). A real bug, found via live
-- verification immediately after applying v1 — not a static-test gap:
--
--   auth.uid() returns NULL for a service_role caller (no user JWT
--   session — service_role authenticates via the API key directly, not
--   a Supabase Auth session). So `is_admin(auth.uid())` evaluated
--   `is_admin(NULL)`, which is FALSE (the internal `WHERE user_id = NULL`
--   never matches), which meant service_role itself got rejected by the
--   v1 check with "memerlukan peranan admin" — exactly the operational
--   path ChatGPT explicitly required to keep working ("service role
--   masih boleh digunakan untuk operational backend use case").
--
-- Confirmed live: v1's add_edition_rule rejected a service_role call
-- with that exact message before this hotfix.
--
-- Fix: allow through when auth.uid() IS NULL. This is safe because the
-- ONLY caller that can reach this point with a NULL auth.uid() is
-- service_role (or another internal/DEFINER-context call) — anon is
-- already blocked at the GRANT/REVOKE layer before the function body
-- ever runs (anon has no EXECUTE grant at all), and a real authenticated
-- user session always has a non-null auth.uid() by construction (Supabase
-- Auth always sets `sub` on an issued JWT).
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
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
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
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
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
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'restore_edition_rule: memerlukan peranan admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM edition_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'restore_edition_rule: id % not found', p_id;
  END IF;
  UPDATE edition_rules SET status = 'active', reason = NULL, updated_at = now() WHERE id = p_id;
END;
$$;

-- Grants unchanged from v1 — this hotfix only touches function bodies.
COMMIT;
