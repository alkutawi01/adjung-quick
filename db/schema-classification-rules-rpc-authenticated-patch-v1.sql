-- schema-classification-rules-rpc-authenticated-patch-v1.sql
--
-- Polish 2/5 (2026-08-19). Closes the Classification Rules
-- authenticated-write gap: add/archive/restore_classification_rule are
-- currently granted to service_role ONLY, so a signed-in admin using the
-- Admin Console cannot create or archive a Kategori override at all. This
-- is the single reason Kategori (Pemetaan Sumber / Petunjuk RSS-URL /
-- Feed Campuran) is still read-only in the UI.
--
-- THIS IS AN AUTHORITY PATCH ONLY.
-- Every function body below is copied VERBATIM from
-- db/schema-classification-rules-rpc-v1.sql, with exactly one addition:
-- the admin guard at the top. No validation was changed, added, relaxed
-- or removed. No schema change. No resolver change. No rule semantics
-- change. Diff this against that file to confirm.
--
-- AUTHORITY PATTERN: deliberately the V2 pattern from
-- db/schema-edition-rules-rpc-authenticated-patch-v2-hotfix.sql, NOT the
-- V1 pattern. This matters, and the reason is documented from a real
-- production incident on the edition_rules equivalent:
--
--   auth.uid() returns NULL for a service_role caller (service_role
--   authenticates by API key, not a Supabase Auth session). So a bare
--   `is_admin(auth.uid())` evaluates `is_admin(NULL)` -> FALSE, and
--   service_role locks ITSELF out. That is exactly what happened when the
--   edition_rules V1 patch was applied, and it had to be hotfixed live.
--
--   `auth.uid() IS NULL OR is_admin(auth.uid())` is the corrected form.
--   Allowing the NULL case is safe here because anon can never reach a
--   function body at all -- anon is denied at the GRANT layer below (no
--   EXECUTE), and a genuine signed-in user ALWAYS has a non-null
--   auth.uid() (Supabase Auth always sets `sub` on an issued JWT). So the
--   only caller that arrives with NULL is service_role / an internal
--   DEFINER-context call.
--
-- RESULTING ACCESS MATRIX (the acceptance target for this patch):
--   PUBLIC ................. no EXECUTE (revoked)
--   anon ................... no EXECUTE  -> blocked before function body
--   authenticated + admin .. allowed
--   authenticated non-admin  EXECUTE granted, but REJECTED inside body
--   service_role ........... still works (unchanged operational path)
--
-- STATUS: NOT YET APPLIED. Run this in the Supabase SQL Editor.
--         Rollback: db/schema-classification-rules-rpc-authenticated-rollback-v1.sql

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
  -- ADDED BY THIS PATCH (the only change). V2 pattern -- see header.
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'add_classification_rule: memerlukan peranan admin.';
  END IF;

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
  -- ADDED BY THIS PATCH (the only change).
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'archive_classification_rule: memerlukan peranan admin.';
  END IF;

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
  -- ADDED BY THIS PATCH (the only change).
  IF NOT (auth.uid() IS NULL OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'restore_classification_rule: memerlukan peranan admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM classification_rules WHERE id = p_id) THEN
    RAISE EXCEPTION 'restore_classification_rule: id % not found', p_id;
  END IF;
  UPDATE classification_rules SET status = 'active', updated_at = now() WHERE id = p_id;
END;
$$;

-- REVOKE stays first and explicit. CREATE OR REPLACE FUNCTION re-grants
-- EXECUTE to PUBLIC by default on replace, so these are NOT redundant --
-- omitting them would silently re-open the exact hole
-- db/schema-revoke-public-execute-v1.sql had to close retroactively
-- during the Phase 2 security incident.
REVOKE EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION archive_classification_rule(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION restore_classification_rule(UUID) FROM PUBLIC;

-- service_role: unchanged, still works.
GRANT EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION archive_classification_rule(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION restore_classification_rule(UUID) TO service_role;

-- authenticated: NEW. Non-admins still get rejected inside the body.
GRANT EXECUTE ON FUNCTION add_classification_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_classification_rule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_classification_rule(UUID) TO authenticated;

-- anon: deliberately NOT granted. Never add it here.

COMMIT;


-- ---------------------------------------------------------------------
-- VERIFY (run after COMMIT; read-only, safe to re-run)
-- ---------------------------------------------------------------------
-- Expect exactly: authenticated + service_role for all three functions,
-- and NO row for anon or PUBLIC.
--
-- SELECT p.proname,
--        r.rolname AS granted_to
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- CROSS JOIN LATERAL aclexplode(p.proacl) acl
-- JOIN pg_roles r ON r.oid = acl.grantee
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('add_classification_rule','archive_classification_rule','restore_classification_rule')
--   AND acl.privilege_type = 'EXECUTE'
-- ORDER BY p.proname, r.rolname;
