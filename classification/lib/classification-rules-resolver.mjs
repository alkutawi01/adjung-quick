// classification-rules-resolver.mjs — Backend Control Plane Phase 3
// (Classification Rules). resolveClassificationRule() is the ONLY new
// entry point classifyForEdition() gains — everything else in the
// existing classifier (story-understanding.mjs, edition-classification.mjs's
// own 4-step resolver, desk-vocabulary.mjs, content-rules.mjs,
// bernama-prefix.mjs, confidence-policy.mjs, edition-rules.mjs) is
// completely untouched by this file.
//
// Per docs/control-plane-phase3-classification-rules-design-v1.md §5 and
// docs/control-plane-phase3-classification-rules-implementation-plan-v1.md §5
// (both approved by ChatGPT): a Classification Rule is an explicit,
// admin-authored fact that short-circuits the probabilistic classifier
// outright when it matches — never a candidate, never a confidence score.

import { resolveDefaultPlacement } from './edition-taxonomy.mjs';
import { getFieldEntry, getFieldEntryByLabel } from './taxonomy-registry.mjs';

function matchesRule(rule, item) {
  if (rule.rule_type === 'source') {
    return item.sourceId != null && item.sourceId === rule.pattern;
  }
  if (rule.rule_type === 'url') {
    return typeof item.link === 'string' && item.link.includes(rule.pattern);
  }
  if (rule.rule_type === 'keyword') {
    const haystack = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
    return haystack.includes(rule.pattern.toLowerCase());
  }
  return false;
}

// Design V1 §5a (revised): priority is flat across ALL rule types — the
// only lever Admin has to control which rule wins when rules of
// different types both match. A same-priority tie only compares pattern
// specificity when both rules are the SAME type (comparing a source_id's
// length against a URL/keyword pattern's length would be an arbitrary,
// meaningless cross-type ranking, per ChatGPT's explicit instruction) —
// a cross-type tie at the same priority rejects outright rather than
// picking arbitrarily.
function pickWinner(matches) {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const sorted = [...matches].sort((a, b) => b.priority - a.priority);
  const topPriority = sorted[0].priority;
  const tied = sorted.filter(r => r.priority === topPriority);
  if (tied.length === 1) return tied[0];

  const sameType = tied.every(r => r.rule_type === tied[0].rule_type);
  if (!sameType) return null; // cross-type tie: reject, fall through to classifier

  const bySpecificity = [...tied].sort((a, b) => b.pattern.length - a.pattern.length);
  if (bySpecificity[0].pattern.length === bySpecificity[1].pattern.length) return null; // still tied: reject
  return bySpecificity[0];
}

// item: { sourceId, link, title, description } — only the fields actual
// rule matching needs, never the full raw RSS row.
// edition: 'ms-MY' | 'en-global' | 'ar-global'
// activeRules: classification_rules rows with status='active', already
// scoped by the caller to (edition_id IS NULL OR edition_id = edition) —
// this function does not query the database itself.
//
// Returns null when: no rule matches, a cross-type tie rejects, or a
// global rule matched but its subject_code has no active mapping in this
// edition (Design V1 §4b-i — "unresolved for this edition", never a
// silent admin_rule with no real Kategori). null means "the classifier
// decides, exactly as it did before Phase 3."
export function resolveClassificationRule(item, edition, activeRules) {
  const candidates = (activeRules ?? []).filter(r => matchesRule(r, item));
  const winner = pickWinner(candidates);
  if (!winner) return null;

  if (winner.edition_id) {
    // Edition-specific rule: field_code was already validated at write
    // time (composite FK into taxonomy_fields), so it's edition-correct
    // by construction — only the label needs a lookup, purely for the
    // return shape (same taxonomy-registry.mjs entry point every other
    // branch of the classifier already uses).
    const entry = getFieldEntry(edition, winner.field_code);
    return { field_code: winner.field_code, label: entry?.label ?? null, subject_code: null, rule_id: winner.id };
  }

  // Global rule: resolve subject_code -> field_code for THIS edition via
  // the exact same lookup the existing classifier's Tier 3 already uses
  // (edition-classification.mjs's fieldCodeFor() does the identical
  // two-step resolveDefaultPlacement() -> getFieldEntryByLabel() chain).
  const label = resolveDefaultPlacement(edition, winner.subject_code);
  if (!label) return null; // unresolved for this edition — fall through
  const fieldCode = getFieldEntryByLabel(edition, label)?.field_code ?? null;
  if (!fieldCode) return null; // defensive: label existed but no field_code — still unresolved

  return { field_code: fieldCode, subject_code: winner.subject_code, rule_id: winner.id, label };
}
