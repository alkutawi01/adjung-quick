-- schema-fix-override-rls-ownership.sql — 2026-08-13.
-- Fixes docs/editorial-adversarial-audit-v1.md finding 2 (HIGH).
--
-- THE BUG
-- story_overrides_editor_rw was:
--   FOR ALL USING (EXISTS (SELECT 1 FROM editors WHERE user_id = auth.uid()))
--        WITH CHECK (same)
-- It tested only MEMBERSHIP in `editors`. It did not constrain override_type,
-- did not require created_by = auth.uid(), and was not row-scoped to the
-- writer. Combined with GRANT SELECT, INSERT, UPDATE TO authenticated
-- (db/schema-fix-editorial-state-grants.sql), any signed-in editor holding the
-- anon key that ships in the client bundle could, with no app code at all:
--
--   (a) INSERT override_type='pin' — an admin-only action per the Principle of
--       Escalation. The CHECK constraint already permits 'pin'.
--   (b) INSERT with created_by set to ANOTHER user's UUID, making the
--       "permanent audit trail" attacker-controlled.
--   (c) UPDATE any row: flip an admin's override_type, extend expires_at,
--       rewrite `reason`, or — with one broad filter — set active=false across
--       the whole table, silently wiping all editorial state.
--
-- The schema comment claimed escalation was "enforced at the APPLICATION
-- layer". Audit finding 1 showed that layer did not exist either: both layers
-- deferred to the other and neither implemented it. The app-layer gate is now
-- real (canPerformAction inside writeOverride), and this migration makes the
-- database enforce independently rather than trusting the client.
--
-- WHAT THIS ENFORCES
-- 1. INSERT: created_by MUST equal auth.uid() — no forging authorship.
-- 2. INSERT: admin-only override types are rejected for non-admins, in SQL.
-- 3. UPDATE: an editor may only modify their OWN rows; an admin may modify any
--    (needed to retire another editor's bad call).
-- 4. UPDATE: override_type/story_id/created_by are frozen — the audit-relevant
--    identity of a decision cannot be rewritten after the fact. Deactivation
--    (active -> false) and expiry changes remain allowed, which is the real
--    undo path deactivateOverride() uses.
--
-- Reuses the SECURITY DEFINER is_admin() helper from
-- db/schema-fix-editors-rls-recursion.sql, so no new recursion risk.
--
-- Purely policy changes. No table altered, no data touched.

BEGIN;

-- Freeze the identity fields of an existing override. Enforced by trigger
-- because a WITH CHECK clause cannot see the OLD row.
CREATE OR REPLACE FUNCTION story_overrides_freeze_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.override_type IS DISTINCT FROM OLD.override_type
     OR NEW.story_id IS DISTINCT FROM OLD.story_id
     OR NEW.edition_id IS DISTINCT FROM OLD.edition_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'story_overrides: override_type/story_id/edition_id/created_by/created_at are immutable; deactivate and create a new override instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_overrides_freeze_identity_trg ON story_overrides;
CREATE TRIGGER story_overrides_freeze_identity_trg
  BEFORE UPDATE ON story_overrides
  FOR EACH ROW EXECUTE FUNCTION story_overrides_freeze_identity();

-- Replace the single permissive FOR ALL policy with per-operation policies.
DROP POLICY IF EXISTS story_overrides_editor_rw ON story_overrides;

CREATE POLICY story_overrides_select_editor ON story_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  );

-- Authorship cannot be forged, and admin-only types are refused in SQL —
-- independently of the application's own canPerformAction check.
CREATE POLICY story_overrides_insert_own ON story_overrides
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
    AND (override_type <> 'pin' OR is_admin(auth.uid()))
  );

-- Own rows for an editor; any row for an admin (to retire a bad call).
CREATE POLICY story_overrides_update_own_or_admin ON story_overrides
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
    AND (created_by = auth.uid() OR is_admin(auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
    AND (created_by = auth.uid() OR is_admin(auth.uid()))
  );

-- No DELETE policy: overrides are the audit trail. Undo is active=false, never
-- removal. Absent policy = denied.

-- source_overrides: same treatment. Every type here is admin-only per the
-- Principle of Escalation (they affect every story from a source, every
-- edition), so the insert gate is simply is_admin().
DROP POLICY IF EXISTS source_overrides_editor_rw ON source_overrides;

CREATE POLICY source_overrides_select_editor ON source_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  );

CREATE POLICY source_overrides_insert_admin ON source_overrides
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND is_admin(auth.uid())
  );

CREATE POLICY source_overrides_update_admin ON source_overrides
  FOR UPDATE USING (is_admin(auth.uid()))
          WITH CHECK (is_admin(auth.uid()));

COMMIT;
