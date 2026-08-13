-- schema-editorial-state.sql — Fasa 3.6.1 Editorial Operations Foundation.
--
-- Per docs/editorial-state-implementation-spec-v1.md +
-- docs/admin-auth-spec-v1.md + docs/editorial-action-spec-v1.md.
-- PURELY ADDITIVE — no existing table touched, no existing column
-- changed. Same pattern as schema-identity.sql (2026-08-11) and
-- schema-edition-classification.sql (2026-08-12).
--
-- Core invariant this schema exists to protect (locked this session,
-- docs/production-data-lifecycle-v2-design.md): Generated Data != Editorial
-- State. story_overrides/source_overrides are NEVER touched by
-- db/classify-production.js's truncate-and-rewrite — a completely
-- separate table, read at query time, not regenerated.

BEGIN;

-- Admin/editor allowlist. Reuses Supabase's own auth.users — no second
-- auth system, no custom login. Per docs/admin-auth-spec-v1.md.
CREATE TABLE editors (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'admin')),
  added_by    UUID REFERENCES auth.users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Story-level human decisions. Per docs/editorial-state-implementation-spec-v1.md §1
-- and docs/editorial-override-data-model-v1.md. story-level overrides
-- MUST expire (news has a ~1 week shelf life, per this project's own
-- established content lifecycle) — enforced NOT NULL, not just convention.
CREATE TABLE story_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        TEXT NOT NULL REFERENCES story_clusters(id),
  edition_id      TEXT NOT NULL,       -- 'ms-MY' | 'en-global' | 'ar-global' (exact values — see the corrected comment in schema-edition-classification.sql, this was previously wrong as 'en'/'ar' and cost a real bug)
  override_type   TEXT NOT NULL CHECK (override_type IN ('reclassify','hide','boost','pin')),
  new_field       TEXT,                -- reclassify only; app layer validates against that edition's own taxonomy, not enforced at DB level
  reason          TEXT NOT NULL,       -- REQUIRED — an override with no reason is indistinguishable from a mistake later
  created_by      UUID NOT NULL REFERENCES editors(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_story_overrides_story_edition ON story_overrides (story_id, edition_id) WHERE active;
CREATE INDEX idx_story_overrides_expires ON story_overrides (expires_at) WHERE active;

-- Source-level human decisions. Cross-edition (a source problem is a
-- source problem everywhere) — NEVER auto-expires, per
-- docs/editorial-state-implementation-spec-v1.md §2: source policy is
-- operational configuration, not temporary content. review_date is a
-- reminder only, never itself changes `status`.
CREATE TABLE source_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        TEXT NOT NULL,      -- lab/sources.js id — not a real FK, that registry is code, not a table
  override_type    TEXT NOT NULL CHECK (override_type IN ('ignore_category','reduce_trust','disable')),
  trust_override   NUMERIC,            -- reduce_trust only
  reason           TEXT NOT NULL,
  created_by       UUID NOT NULL REFERENCES editors(user_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  review_date      DATE
);

CREATE INDEX idx_source_overrides_source ON source_overrides (source_id) WHERE status = 'active';

-- RLS. Editorial state is NOT reader-visible in this foundation pass —
-- deliberately conservative: no anon read access yet. Wiring overrides
-- into the reader-facing feed (productionAdapter.js) is a separate,
-- later step (docs/editorial-state-implementation-spec-v1.md §4 leaves
-- the merge mechanism as an implementation-time decision, not decided
-- here) — this migration only makes the storage exist and be usable by
-- authenticated editors.
ALTER TABLE editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_overrides ENABLE ROW LEVEL SECURITY;

-- editors: anyone signed-in can check their OWN row (the role-check
-- every request needs); an existing admin can see the full list
-- (needed for a future "manage editors" admin action).
CREATE POLICY editors_select_own_or_admin ON editors
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid() AND e.role = 'admin')
  );
-- Only an existing admin can add a new editor. The very first row has
-- no existing admin to satisfy this — bootstrapped once via a direct
-- insert outside the app (docs/admin-auth-spec-v1.md's documented
-- one-time step), never through this policy.
CREATE POLICY editors_insert_admin_only ON editors
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid() AND e.role = 'admin')
  );
CREATE POLICY editors_delete_admin_only ON editors
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid() AND e.role = 'admin')
  );

-- story_overrides / source_overrides: any signed-in editor/admin can
-- read and write. Per the Principle of Escalation
-- (docs/editorial-action-spec-v1.md), pin/source-overrides should be
-- admin-only — enforced at the APPLICATION layer (the action handler
-- checks role before writing), not by RLS, since RLS can't cheaply
-- distinguish "this INSERT has override_type='pin'" from any other
-- insert without duplicating the app's own validation in SQL. Documented
-- here so the boundary isn't assumed to be DB-enforced when it isn't.
CREATE POLICY story_overrides_editor_rw ON story_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  );
CREATE POLICY source_overrides_editor_rw ON source_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  );

COMMIT;
