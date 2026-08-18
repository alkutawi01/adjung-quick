// edition-rules-resolver.mjs — Backend Control Plane Fasa 4 (Admin
// Edition Rules). resolveAdminEditionRule() is the ONLY new entry point
// classifyForEdition() gains — the built-in Edition Rule Registry
// (edition-rules.mjs's EDITION_RULES/evaluateEditionRules()) is
// completely untouched by this file, per Decision 2 (separate path, not
// an extension of classification_rules or a merge into the built-in
// array).
//
// Per docs/control-plane-phase4-edition-rules-implementation-plan-v1.md:
// an admin edition rule is checked BEFORE the built-in rule. Priority
// convention here is the OPPOSITE of evaluateEditionRules()'s own sort —
// highest number wins (matching classification_rules' convention, for
// consistency across every admin-facing rule mechanism), not lowest.
// This is deliberate, not an inconsistency to "fix": the two functions
// are never compared against each other, only sequenced.

import { getFieldEntry } from './taxonomy-registry.mjs';

function matchesRule(rule, topSubject, topGeography) {
  if (rule.condition_subject && (!topSubject || topSubject.value !== rule.condition_subject)) return false;
  if (rule.condition_geography_type === 'not' && (!topGeography || topGeography.value === rule.condition_geography_value)) return false;
  if (rule.condition_geography_type === 'is' && (!topGeography || topGeography.value !== rule.condition_geography_value)) return false;
  return true;
}

// A tie at the top priority rejects outright rather than picking
// arbitrarily — same philosophy as classification_rules' pickWinner()
// cross-type tie handling, simplified here since edition rules have only
// one "type" (there's nothing to break a tie by specificity against).
function pickWinner(matches) {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const sorted = [...matches].sort((a, b) => b.priority - a.priority);
  const topPriority = sorted[0].priority;
  const tied = sorted.filter(r => r.priority === topPriority);
  return tied.length === 1 ? tied[0] : null;
}

// understanding: Story Understanding output (subject_candidates/
// geography_candidates already resolved, same shape classifyForEdition
// already has in scope).
// edition: 'ms-MY' | 'en-global' | 'ar-global'
// activeRules: edition_rules rows with status='active', already scoped
// by the caller to this edition — this function does not query the
// database and does not filter by edition_id itself.
//
// Returns null when no rule matches or a tie rejects — meaning "fall
// through to the built-in Edition Rule Registry, exactly as before this
// feature existed."
export function resolveAdminEditionRule(understanding, edition, activeRules) {
  const topSubject = understanding.subject_candidates?.[0];
  const topGeography = understanding.geography_candidates?.[0];

  const candidates = (activeRules ?? []).filter(r => matchesRule(r, topSubject, topGeography));
  const winner = pickWinner(candidates);
  if (!winner) return null;

  const entry = getFieldEntry(edition, winner.action_field_code);
  if (!entry) return null; // defensive: a stored field_code no longer valid for this edition — fall through rather than return a broken label

  return {
    rule_id: winner.id,
    field_code: winner.action_field_code,
    label: entry.label,
    confidence: topSubject?.confidence ?? topGeography?.confidence ?? 0.5,
  };
}
