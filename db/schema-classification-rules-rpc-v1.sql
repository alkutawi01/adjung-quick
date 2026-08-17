-- schema-classification-rules-rpc-v1.sql
--
-- Backend Control Plane — Phase 3 (Classification Rules), RPC functions.
-- Per docs/control-plane-phase3-classification-rules-implementation-plan-v1.md §3.
--
-- 3 PostgreSQL RPC functions, each SECURITY DEFINER, service_role only.
-- No update/rename function in V1 (priority is set-at-creation-only,
-- explicit V1 limitation per the implementation plan — not an oversight).
--
-- SECURITY: every function below explicitly REVOKEs EXECUTE FROM PUBLIC
-- in the SAME statement block as its GRANT TO service_role — never as a
-- follow-up fix. This is the direct, named lesson from the security
-- incident found and closed during Phase 2 browser cutover verification
-- (2026-08-17): PostgreSQL grants EXECUTE to PUBLIC by default on every
-- new function, so `GRANT ... TO service_role` alone is additive, not
-- exclusive — the anon key was able to call every admin RPC written this
-- session until db/schema-revoke-public-execute-v1.sql closed the gap
-- retroactively. This file does not repeat that mistake.
--
-- STATUS: NOT YET APPLIED.

BEGIN;

CREATE OR REPLACE FUNCTION add_classification_rule(
  p_rule_type TEXT,
  p_edition_id TEXT,
  p_pattern TEXT,
  p_field_code TEXT DEFAULT NULL,
  p_subject_code TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 0,
  p_created_by TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_rule_type NOT IN ('source', 'url', 'keyword') THEN
    RAISE EXCEPTION 'add_classification_rule: rule_type must be source, url, or keyword, got "%"', p_rule_type;
  END IF;

  -- Defense in depth alongside the table's classification_rules_target_xor
  -- CHECK constraint — validated here too so the error message is
  -- specific to this RPC rather than a bare constraint-violation string.
  IF NOT (
    (p_edition_id IS NOT NULL AND p_field_code IS NOT NULL AND p_subject_code IS NULL) OR
    (p_edition_id IS NULL AND p_subject_code IS NOT NULL AND p_field_code IS NULL)
  ) THEN
    RAISE EXCEPTION 'add_classification_rule: exactly one of (edition_id+field_code) or (NULL edition_id+subject_code) must be set — got edition_id=%, field_code=%, subject_code=%',
      p_edition_id, p_field_code, p_subject_code;
  END IF;

  -- Design V1 §4c: a source rule's pattern MUST be a real, stable
  -- sources.id — never validated as free text. Renaming a source's
  -- display `name` later never breaks this, since `id` never changes.
  IF p_rule_type = 'source' AND NOT EXISTS (SELECT 1 FROM sources WHERE id = p_pattern) THEN
    RAISE EXCEPTION 'add_classification_rule: pattern "%" is not a known source id (sources.id)', p_pattern;
  END IF;

  -- Edition-specific target: taxonomy_fields' own field_code CHECK
  -- constraint plus the composite FK on this table already validate the
  -- pair exists and is machine-safe; nothing extra needed here beyond
  -- letting the FK constraint fire naturally on INSERT if it's wrong.

  INSERT INTO classification_rules (
    rule_type, edition_id, pattern, field_code, subject_code, priority, status, created_by
  ) VALUES (
    p_rule_type, p_edition_id, p_pattern, p_field_code, p_subject_code, p_priority, 'active', p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION archive_classification_rule(
  p_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM classification_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'archive_classification_rule: id % not found', p_id;
  END IF;
  UPDATE classification_rules SET status = 'archived', updated_at = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_classification_rule(
  p_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM classification_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'restore_classification_rule: id % not found', p_id;
  END IF;
  UPDATE classification_rules SET status = 'active', updated_at = now() WHERE id = p_id;
END;
$$;

-- REVOKE before GRANT, every function, same block — the lesson from the
-- Phase 2 incident applied directly, not retrofitted.
REVOKE EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION archive_classification_rule(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION restore_classification_rule(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION archive_classification_rule(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION restore_classification_rule(UUID) TO service_role;

COMMIT;
