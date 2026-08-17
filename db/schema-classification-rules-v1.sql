-- schema-classification-rules-v1.sql
--
-- Backend Control Plane — Phase 3 (Classification Rules), table only.
-- Per docs/control-plane-phase3-classification-rules-implementation-plan-v1.md
-- §1-2 (approved by ChatGPT, revision that withdrew auto-seeding, 2026-08-17).
--
-- A Classification Rule is an explicit, admin-authored fact ("this
-- pattern always means this Kategori") — it short-circuits the existing
-- evidence-tier classifier outright when it matches, unlike every
-- existing evidence source (desk-vocabulary.mjs, content-rules.mjs,
-- bernama-prefix.mjs, confidence-policy.mjs), which stays completely
-- untouched by this file and keeps producing probabilistic candidates
-- exactly as it does today.
--
-- CRITICAL, per ChatGPT's explicit instruction: this table ships EMPTY.
-- No seed data, no migration of lab/sources.js's knownCategory field
-- (withdrawn — see the implementation plan §6 for why an automatic bulk
-- migration would have silently reversed correct existing classifier
-- outcomes). Admin adopts a rule one at a time, deliberately, later.
--
-- STATUS: NOT YET APPLIED. Apply via Supabase SQL Editor only after
-- explicit production-execution approval, per this session's established
-- discipline. Bring this file + its static audit to ChatGPT for review
-- before Izzat applies it.

BEGIN;

CREATE TABLE classification_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  rule_type     TEXT NOT NULL CHECK (rule_type IN ('source', 'url', 'keyword')),

  -- NOT NULL for an edition-specific rule (targets field_code directly,
  -- see below); NULL for a global rule (targets subject_code, resolved
  -- per-edition at classification time by the classifier — NOT by this
  -- schema, which only stores the fact).
  edition_id    TEXT,

  -- Semantics depend on rule_type:
  --   source  -> sources.id (Phase 1's stable TEXT PK, e.g. 'rss-kosmo')
  --              — NEVER a display name or feed URL, so renaming a
  --              source never breaks a rule that targets it.
  --   url     -> a URL path substring (e.g. '/jenayah/')
  --   keyword -> a phrase matched against title+description
  pattern       TEXT NOT NULL,

  -- Edition-specific target: exact row in taxonomy_fields. Set only when
  -- edition_id is set.
  field_code    TEXT,

  -- Global target: a Universal Subject (same domain as
  -- taxonomy_fields.subject_codes and desk-vocabulary.mjs's
  -- SUBJECT_VOCABULARY values, e.g. 'Business', 'Crime'). Set only when
  -- edition_id is NULL. Resolved to a field_code per-edition at
  -- classification time via the exact same lookup
  -- edition-taxonomy.mjs's resolveDefaultPlacement() already performs —
  -- if no active taxonomy_fields row in a given edition carries this
  -- subject, the rule is unresolved for that edition (falls through to
  -- the existing classifier untouched, never a silent "admin_rule" with
  -- no real Kategori).
  subject_code  TEXT,

  -- Flat across ALL rule types (Design V1 §5a, revised) — the ONLY lever
  -- Admin has to control which rule wins when two rules of any type both
  -- match the same story. Set at creation only; V1 has no update RPC
  -- (Implementation Plan §3) — changing priority means archive + re-add.
  priority      INTEGER NOT NULL DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The mutual-exclusion invariant from Design V1 §3: a rule targets
  -- EITHER an exact (edition_id, field_code) pair, OR a global
  -- subject_code — never both, never neither. This is what makes the
  -- composite FK below meaningful (it's only ever checked for rows where
  -- it's actually supposed to hold).
  CONSTRAINT classification_rules_target_xor CHECK (
    (edition_id IS NOT NULL AND field_code IS NOT NULL AND subject_code IS NULL) OR
    (edition_id IS NULL AND subject_code IS NOT NULL AND field_code IS NULL)
  ),

  -- Reuses Phase 2's exact natural key (taxonomy_fields.UNIQUE(edition_id,
  -- field_code)) rather than inventing a new identity concept, per
  -- ChatGPT's explicit "jangan selesaikan dengan UUID baharu" instruction.
  -- Postgres composite FKs are satisfied (not checked) when any column in
  -- the pair is NULL — exactly the global-rule case, where this
  -- constraint correctly does not apply.
  CONSTRAINT classification_rules_field_fk
    FOREIGN KEY (edition_id, field_code) REFERENCES taxonomy_fields (edition_id, field_code)
);

-- Resolver's lookup pattern: fetch active rules by type to check pattern
-- matches against a story.
CREATE INDEX idx_classification_rules_type_status ON classification_rules (rule_type, status);
CREATE INDEX idx_classification_rules_edition ON classification_rules (edition_id) WHERE edition_id IS NOT NULL;

-- classification_rules is Admin-only data — unlike taxonomy_fields, the
-- public Reader never reads this table directly (it only ever sees the
-- RESULT of a rule having fired, via edition_story_classifications'
-- existing classification_method/classification_rule columns, already
-- publicly readable since Phase "3B.2B"). So: authenticated read only,
-- no anon.
ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY classification_rules_authenticated_read ON classification_rules
  FOR SELECT USING (true);

GRANT SELECT ON classification_rules TO authenticated;

COMMIT;
