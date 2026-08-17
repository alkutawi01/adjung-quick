-- schema-taxonomy-fields-rpc-v1.sql
--
-- Backend Control Plane — Phase 2 (Taxonomy/Kategori), RPC functions.
-- Per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §3-4.
--
-- 5 PostgreSQL RPC functions, each SECURITY DEFINER, service_role only.
-- No generic "update anything" function — one choke point per
-- operation, same discipline as source-registry-adapter.mjs's RPCs.
--
-- STATUS: NOT YET APPLIED.

BEGIN;

CREATE OR REPLACE FUNCTION add_taxonomy_field(
  p_edition_id TEXT, p_field_code TEXT, p_label TEXT,
  p_subject_codes TEXT[] DEFAULT NULL, p_wheel_visible BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_next_order INTEGER;
  v_id UUID;
BEGIN
  IF p_field_code !~ '^[a-z][a-z0-9_]{1,31}$' THEN
    RAISE EXCEPTION 'add_taxonomy_field: field_code "%" is not machine-safe (lowercase, starts with a letter, 2-32 chars, [a-z0-9_] only)', p_field_code;
  END IF;
  IF EXISTS (SELECT 1 FROM taxonomy_fields WHERE edition_id = p_edition_id AND field_code = p_field_code) THEN
    RAISE EXCEPTION 'add_taxonomy_field: field_code "%" already exists for edition "%"', p_field_code, p_edition_id;
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_next_order
    FROM taxonomy_fields WHERE edition_id = p_edition_id;

  INSERT INTO taxonomy_fields (edition_id, field_code, label, subject_codes, wheel_visible, status, display_order)
  VALUES (p_edition_id, p_field_code, p_label, p_subject_codes, p_wheel_visible, 'active', v_next_order)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION rename_taxonomy_field(
  p_id UUID, p_label TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- field_code is deliberately NOT a parameter of this function — the
  -- signature itself makes it structurally impossible to change via
  -- rename, not just a convention enforced by the caller.
  IF NOT EXISTS (SELECT 1 FROM taxonomy_fields WHERE id = p_id) THEN
    RAISE EXCEPTION 'rename_taxonomy_field: id % not found', p_id;
  END IF;
  UPDATE taxonomy_fields SET label = p_label, updated_at = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_taxonomy_field_visibility(
  p_id UUID, p_wheel_visible BOOLEAN
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM taxonomy_fields WHERE id = p_id) THEN
    RAISE EXCEPTION 'set_taxonomy_field_visibility: id % not found', p_id;
  END IF;
  UPDATE taxonomy_fields SET wheel_visible = p_wheel_visible, updated_at = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_taxonomy_field_status(
  p_id UUID, p_status TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'set_taxonomy_field_status: status must be active or archived, got "%"', p_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM taxonomy_fields WHERE id = p_id) THEN
    RAISE EXCEPTION 'set_taxonomy_field_status: id % not found', p_id;
  END IF;
  UPDATE taxonomy_fields SET status = p_status, updated_at = now() WHERE id = p_id;
END;
$$;

-- The one operation that genuinely requires a multi-statement
-- transaction. All validation happens HERE, inside this function's own
-- transaction — never as a client-side pre-check before calling this
-- RPC (that would reopen the exact TOCTOU gap this session already
-- closed once for the editorial-state lifecycle design).
CREATE OR REPLACE FUNCTION merge_taxonomy_fields(
  p_edition_id TEXT, p_from_field_code TEXT, p_into_field_code TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_into_label TEXT;
BEGIN
  IF p_from_field_code = p_into_field_code THEN
    RAISE EXCEPTION 'merge_taxonomy_fields: from_field_code and into_field_code are the same ("%")', p_from_field_code;
  END IF;

  SELECT label INTO v_into_label FROM taxonomy_fields
    WHERE edition_id = p_edition_id AND field_code = p_into_field_code AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_taxonomy_fields: into_field_code "%" not found or not active for edition "%"', p_into_field_code, p_edition_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM taxonomy_fields
    WHERE edition_id = p_edition_id AND field_code = p_from_field_code AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'merge_taxonomy_fields: from_field_code "%" not found or already archived for edition "%"', p_from_field_code, p_edition_id;
  END IF;

  -- All 3 writes below run inside this function's single implicit
  -- transaction — either all three commit, or (on any error) none do.
  UPDATE edition_story_classifications
    SET field_code = p_into_field_code, field = v_into_label
    WHERE field_code = p_from_field_code AND edition_id = p_edition_id;

  UPDATE story_overrides
    SET new_field_code = p_into_field_code, new_field = v_into_label
    WHERE new_field_code = p_from_field_code AND edition_id = p_edition_id
      AND override_type = 'reclassify';

  UPDATE taxonomy_fields SET status = 'archived', updated_at = now()
    WHERE edition_id = p_edition_id AND field_code = p_from_field_code;
END;
$$;

GRANT EXECUTE ON FUNCTION add_taxonomy_field(TEXT, TEXT, TEXT, TEXT[], BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION rename_taxonomy_field(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION set_taxonomy_field_visibility(UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION set_taxonomy_field_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION merge_taxonomy_fields(TEXT, TEXT, TEXT) TO service_role;

COMMIT;
