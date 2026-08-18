-- schema-edition-rules-v1.sql
--
-- Backend Control Plane — Fasa 4, Admin Edition Rules (table only). Per
-- docs/control-plane-phase4-edition-rules-implementation-plan-v1.md,
-- approved by ChatGPT 2026-08-18.
--
-- An admin edition rule is an override, not a replacement — the existing
-- built-in rule in classification/lib/edition-rules.mjs (EDITION_RULES,
-- foreign_politics_to_world) is NOT migrated here and stays exactly as
-- it is. This table only holds rules an Admin has explicitly added, on
-- top of that built-in default, per the default+override model already
-- used for Source Registry / Taxonomy / Classification Rules.
--
-- CRITICAL: this table ships EMPTY. No seed data — the built-in rule is
-- not copied in here (per ChatGPT's explicit instruction: "jangan
-- populate default built-in edition rules ke DB").
--
-- Scope: ms-MY only for V1, per Izzat's locked instruction. edition_id
-- is a plain TEXT column (not an enum) so en-global/ar-global can be
-- added later without a schema change — but no rows for them are
-- expected yet, and no admin UI exposes them yet either.
--
-- Priority convention: HIGHER number wins (matches classification_rules'
-- pickWinner() convention, for consistency across every admin-facing
-- rule mechanism in Quick). This is a DIFFERENT direction from the
-- existing built-in evaluateEditionRules()'s own sort (lower number
-- wins, ascending) — that function is untouched, evaluated separately,
-- and only consulted as a fallback after all admin rules are checked, so
-- the two conventions never need to be compared against each other
-- directly.
--
-- STATUS: NOT YET APPLIED. Apply via Supabase SQL Editor only after
-- explicit production-execution approval, per this project's established
-- discipline. Bring this file + its static audit to ChatGPT for review
-- before Izzat applies it.

BEGIN;

CREATE TABLE edition_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Always required — unlike classification_rules' global rules, an
  -- edition rule always targets exactly one edition. No NULL/global case.
  edition_id                TEXT NOT NULL,

  -- Condition: matched against understanding.subject_candidates[0].value
  -- at resolution time (same field the built-in evaluateEditionRules()
  -- already reads). A Universal Subject value — not validated against a
  -- FK here (Universal Subject is a fixed vocabulary in code, per
  -- desk-vocabulary.mjs/story-understanding.mjs, not a DB table), but
  -- validated at the RPC layer against the same vocabulary the classifier
  -- itself uses.
  condition_subject         TEXT NOT NULL,

  -- Optional geography condition. NULL type = no geography check at all
  -- (matches on subject alone). 'not' mirrors the built-in rule's
  -- geographyNot; 'is' mirrors geographyIs — both already exist as
  -- concepts in evaluateEditionRules()'s condition shape, just not yet
  -- exercised by the one built-in rule.
  condition_geography_type  TEXT CHECK (condition_geography_type IN ('not', 'is')),
  condition_geography_value TEXT,

  -- Action: the display field this rule redirects a matching story to,
  -- for this edition. Stored as field_code (NOT a label, unlike the
  -- built-in rule's display_field: 'Dunia') so it can reuse the exact
  -- composite FK pattern classification_rules already established.
  action_field_code         TEXT NOT NULL,

  -- Flat priority, HIGHER wins — see header note on convention.
  priority                  INTEGER NOT NULL DEFAULT 0,

  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  created_by                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same discipline as story_overrides / classification_rules'
  -- disabled/archived reason requirement — a rule with real operational
  -- consequence needs a stated reason for non-active status. Required
  -- only when archiving, enforced at the RPC layer (not a bare NOT NULL
  -- here, matching classification_rules' own pattern of enforcing this
  -- application-side).
  reason                    TEXT,

  -- A geography condition, if present, must have both a type and a
  -- value — never one without the other.
  CONSTRAINT edition_rules_geography_xor CHECK (
    (condition_geography_type IS NULL AND condition_geography_value IS NULL) OR
    (condition_geography_type IS NOT NULL AND condition_geography_value IS NOT NULL)
  ),

  -- Reuses taxonomy_fields' exact natural key, same as
  -- classification_rules_field_fk — no new identity concept invented.
  CONSTRAINT edition_rules_field_fk
    FOREIGN KEY (edition_id, action_field_code) REFERENCES taxonomy_fields (edition_id, field_code)
);

-- Resolver's lookup pattern: fetch active rules for one edition, checked
-- before the built-in evaluateEditionRules() fallback.
CREATE INDEX idx_edition_rules_edition_status ON edition_rules (edition_id, status);

-- Admin-only data, same posture as classification_rules — the public
-- Reader never reads this table directly, only the RESULT of a rule
-- having fired (via edition_story_classifications' existing
-- classification_method/classification_rule columns).
ALTER TABLE edition_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY edition_rules_authenticated_read ON edition_rules
  FOR SELECT USING (true);

GRANT SELECT ON edition_rules TO authenticated;

COMMIT;
