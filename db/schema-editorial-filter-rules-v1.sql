-- schema-editorial-filter-rules-v1.sql — Editorial Filter Rules V1.
--
-- Per docs/editorial-filter-rules-design-v1.md, approved by ChatGPT
-- 2026-08-16. PURELY ADDITIVE — no existing table touched, no existing
-- column changed. Same pattern as schema-editorial-state.sql.
--
-- This is a global, deterministic keyword/phrase EDITORIAL filter —
-- distinct from story_overrides (per-story human decisions) and from
-- classification (field/Bidang assignment). Never read by
-- classify-production.js or ingest-production.js.
--
-- Apply manually via Supabase SQL Editor — this project has no
-- automated migration runner (same constraint that applied to the
-- drop_ingestion_old_tables() fix earlier this session).

BEGIN;

CREATE TABLE editorial_filter_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type    TEXT NOT NULL CHECK (rule_type IN ('exclude', 'except')),
  phrase       TEXT NOT NULL,       -- case-insensitive substring match against a story's title+description
  reason       TEXT,                -- optional editorial note ("Kurangkan berita hiburan rutin") — NEVER part of match logic
  created_by   UUID NOT NULL REFERENCES editors(user_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  active       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_editorial_filter_rules_active ON editorial_filter_rules (rule_type) WHERE active;

-- RLS. Not reader-visible — same posture as story_overrides/
-- source_overrides (schema-editorial-state.sql). Any signed-in
-- editor/admin can read and write, same pattern as those tables.
ALTER TABLE editorial_filter_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY editorial_filter_rules_editor_rw ON editorial_filter_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM editors e WHERE e.user_id = auth.uid())
  );

COMMIT;
