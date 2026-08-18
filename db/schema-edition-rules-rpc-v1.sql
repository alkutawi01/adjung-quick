-- schema-edition-rules-rpc-v1.sql
--
-- Backend Control Plane — Fasa 4, Admin Edition Rules, RPC functions. Per
-- docs/control-plane-phase4-edition-rules-implementation-plan-v1.md.
--
-- 3 RPC functions, mirroring classification_rules' exact shape and
-- discipline (add/archive/restore, no update-in-place — priority is
-- set-at-creation-only, same V1 limitation, not an oversight).
--
-- SECURITY: REVOKE EXECUTE FROM PUBLIC in the same block as GRANT TO
-- service_role, every function — per the Phase 2 security-incident
-- lesson, applied directly here, not retrofitted.
--
-- Validation posture matches add_classification_rule(): condition_subject
-- is NOT validated against a fixed enum (Universal Subject has no single
-- canonical DB-side list — classification_rules' own subject_code column
-- isn't validated against one either, for the same reason). Only
-- structural invariants (non-empty, geography type+value paired) and the
-- taxonomy_fields FK are enforced here.
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

  -- Defense in depth alongside the table's edition_rules_geography_xor
  -- CHECK constraint — same pattern as add_classification_rule()'s own
  -- defense-in-depth check for its XOR constraint.
  IF NOT (
    (p_condition_geography_type IS NULL AND p_condition_geography_value IS NULL) OR
    (p_condition_geography_type IS NOT NULL AND p_condition_geography_value IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'add_edition_rule: geography type and value must both be set or both be null — got type=%, value=%',
      p_condition_geography_type, p_condition_geography_value;
  END IF;

  -- (edition_id, action_field_code) FK against taxonomy_fields fires
  -- naturally on INSERT if the pair doesn't exist — no extra check needed
  -- here, same reasoning as add_classification_rule()'s equivalent note.

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
  IF NOT EXISTS (SELECT 1 FROM edition_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'archive_edition_rule: id % not found', p_id;
  END IF;
  -- A rule with real operational consequence (redirects every matching
  -- story for an edition) requires a stated reason to archive — same
  -- discipline as story_overrides/source_overrides' non-active-status
  -- reason requirement.
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
  IF NOT EXISTS (SELECT 1 FROM edition_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'restore_edition_rule: id % not found', p_id;
  END IF;
  UPDATE edition_rules SET status = 'active', reason = NULL, updated_at = now() WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_edition_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION archive_edition_rule(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION restore_edition_rule(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION add_edition_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION archive_edition_rule(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION restore_edition_rule(UUID) TO service_role;

COMMIT;
