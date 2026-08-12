// edition-classification.mjs — Sesi 3B. Takes Story Understanding's FULL
// candidate set (never just the top one — per ChatGPT's explicit
// instruction, since different editions may prioritize differently) and
// resolves it to ONE display field per edition, per
// docs/edition-classification-contract.md.
//
// Never overwrites or mutates Story Understanding's output — this produces
// a separate, derived result. Ownership: Story Understanding = system-owned
// facts; Edition Classification = edition-owned, derived (this module).

import { subjectToDisplayField, EDITION_GEOGRAPHY_RESIDUAL_LABEL } from './lib/edition-taxonomy.mjs';
import { evaluateEditionRules } from './lib/edition-rules.mjs';

export const RULESET_VERSION = 'v1.1.0'; // bumped: Edition Rule Registry (tier 1-2) added ahead of the Display Transform Registry (tier 3)

// Unified Resolver Model, per docs/edition-rule-engine-contract.md:
// ONE pipeline, TWO registries. Tier 1-2 (Edition Rule Registry, dynamic,
// context-aware) is checked FIRST; only if no rule matches does tier 3
// (Display Transform Registry, static, edition-taxonomy.mjs) run. Tier 3
// is not "lower value" — it simply runs after we know no contextual rule
// already decided the outcome.
export function classifyForEdition(understanding, edition) {
  const subjectCandidates = understanding.subject_candidates ?? [];
  const geographyCandidates = understanding.geography_candidates ?? [];

  // Tiers 1-2: Edition Rule Registry (dynamic, context-aware — checked first)
  const ruleMatch = evaluateEditionRules(edition, understanding);
  if (ruleMatch) {
    return {
      edition_id: edition,
      field: ruleMatch.display_field,
      sub_field: null,
      classification_status: 'classified',
      classification_method: 'edition_rule',
      classification_rule: ruleMatch.rule_id,
      confidence: ruleMatch.confidence,
      ruleset_version: RULESET_VERSION,
      alternatives: subjectCandidates.slice(1, 3).map(c => ({
        universal_subject: c.value, confidence: c.confidence,
        display_field: subjectToDisplayField(edition, c.value),
      })),
    };
  }

  // Tier 3: Display Transform Registry (static) — try every subject
  // candidate in confidence order until one has a display mapping for
  // this edition (a subject with no edition mapping is a real gap, not
  // silently dropped — falls through to the next candidate, then to
  // geography, then unclassified).
  for (const candidate of subjectCandidates) {
    const label = subjectToDisplayField(edition, candidate.value);
    if (label) {
      return {
        edition_id: edition,
        field: label,
        sub_field: null,
        classification_status: 'classified',
        classification_method: 'highest_confidence',
        classification_rule: `story_understanding.subject:${candidate.value} -> ${edition}.${label}`,
        confidence: candidate.confidence,
        ruleset_version: RULESET_VERSION,
        // Full alternative candidate set retained for transparency — this
        // is NOT a second classification, just visibility into what else
        // was considered, per ChatGPT's "don't discard ambiguity" principle.
        alternatives: subjectCandidates.slice(1, 3).map(c => ({
          universal_subject: c.value, confidence: c.confidence,
          display_field: subjectToDisplayField(edition, c.value),
        })),
      };
    }
  }

  // No usable subject candidate — pure residual geography path.
  const residual = EDITION_GEOGRAPHY_RESIDUAL_LABEL[edition];
  const topGeo = geographyCandidates[0];
  if (residual && topGeo) {
    const label = topGeo.value === 'Malaysia' ? residual.local : residual.world;
    return {
      edition_id: edition,
      field: label,
      sub_field: null,
      classification_status: 'classified',
      classification_method: 'geography_fallback',
      classification_rule: `story_understanding.geography:${topGeo.value} -> ${edition}.${label}`,
      confidence: topGeo.confidence,
      ruleset_version: RULESET_VERSION,
      alternatives: [],
    };
  }

  // Genuinely nothing to go on.
  return {
    edition_id: edition,
    field: null,
    sub_field: null,
    classification_status: 'unclassified',
    classification_method: 'none',
    classification_rule: null,
    confidence: 0,
    ruleset_version: RULESET_VERSION,
    alternatives: [],
  };
}

export function classifyForAllEditions(understanding) {
  return {
    'ms-MY': classifyForEdition(understanding, 'ms-MY'),
    'en': classifyForEdition(understanding, 'en'),
    'ar': classifyForEdition(understanding, 'ar'),
  };
}
