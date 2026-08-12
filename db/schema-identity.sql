-- schema-identity.sql — Identity Layer vertical slice (Fasa 1A), per
-- docs/identity-schema-design.md v1.1 and ChatGPT's implementation
-- instruction (2026-08-11).
--
-- Scope: saved_stories, history_entries ONLY. Uses Supabase's built-in
-- auth.users — no custom auth, no profile table (not needed yet).
--
-- Explicitly NOT in this migration (per ChatGPT): no anonymous-session
-- table, no transfer/discard/selective mechanism, no active_set_slots.
-- Those are a separate "Transition Slice" for later.

BEGIN;

CREATE TABLE saved_stories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id    TEXT NOT NULL REFERENCES story_clusters(id), -- no ON DELETE action yet: see docs/identity-schema-design.md §5 (OPEN lifecycle dependency)
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, story_id)
);

CREATE INDEX idx_saved_stories_user ON saved_stories (user_id);
CREATE INDEX idx_saved_stories_expires ON saved_stories (expires_at);

CREATE TABLE history_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id     TEXT NOT NULL REFERENCES story_clusters(id),
  released_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
  -- deliberately no UNIQUE(user_id, story_id) — history is an event log,
  -- see docs/identity-schema-design.md §3
);

CREATE INDEX idx_history_entries_user ON history_entries (user_id);
CREATE INDEX idx_history_entries_expires ON history_entries (expires_at);

-- RLS — own-row-only, per docs/identity-schema-design.md §6 (implements P-005)
ALTER TABLE saved_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_stories_select_own ON saved_stories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY saved_stories_insert_own ON saved_stories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY saved_stories_update_own ON saved_stories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY saved_stories_delete_own ON saved_stories
  FOR DELETE USING (auth.uid() = user_id);

-- history_entries: no UPDATE policy — events are immutable, per
-- docs/identity-schema-design.md §6.
CREATE POLICY history_entries_select_own ON history_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY history_entries_insert_own ON history_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY history_entries_delete_own ON history_entries
  FOR DELETE USING (auth.uid() = user_id);

COMMIT;
