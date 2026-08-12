// edition-classification.mjs — Sesi 3B, refactored Sesi 3B.2B (2026-08-12)
// after ChatGPT corrected its own earlier framing: editions do NOT share a
// taxonomy derived from Universal Subject. Each edition makes its own
// editorial placement decision from Story Understanding's signals. This
// module resolves ONE display field per edition, per
// docs/edition-classification-contract.md and
// docs/edition-rule-engine-contract.md — but "resolve" means "this
// edition's own decision," not "translate a shared category."
//
// Never overwrites or mutates Story Understanding's output — this produces
// a separate, derived result. Ownership: Story Understanding = system-owned
// facts; Edition Classification = edition-owned, derived (this module).

import { resolveDefaultPlacement, EDITION_GEOGRAPHY_RESIDUAL_LABEL } from './lib/edition-taxonomy.mjs';
import { evaluateEditionRules } from './lib/edition-rules.mjs';

export const RULESET_VERSION = 'v1.2.0'; // bumped: maps_from -> default_mapping, reframed as optional (not a required universal->edition contract)

// Resolver order (per ChatGPT, 2026-08-12 correction):
// 1-2. Edition Rules (dynamic, context-aware — edition-rules.mjs)
// 3.   Default Placement Mapping (optional fallback hint — edition-taxonomy.mjs)
// 4.   Geography fallback / Unclassified
// A subject with no default_mapping in a given edition is NOT a gap — that
// edition simply hasn't (yet, or ever) chosen to surface that subject.
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
        display_field: resolveDefaultPlacement(edition, c.value),
      })),
    };
  }

  // Tier 3: Default Placement Mapping (optional fallback, not a required
  // contract) — try every subject candidate in confidence order until one
  // has a default mapping for this edition. No match at all just falls
  // through to geography, then unclassified — an expected outcome, not an
  // error.
  for (const candidate of subjectCandidates) {
    const label = resolveDefaultPlacement(edition, candidate.value);
    if (label) {
      return {
        edition_id: edition,
        field: label,
        sub_field: null,
        classification_status: 'classified',
        classification_method: 'default_mapping',
        classification_rule: `story_understanding.subject:${candidate.value} -> ${edition}.${label}`,
        confidence: candidate.confidence,
        ruleset_version: RULESET_VERSION,
        // Full alternative candidate set retained for transparency — this
        // is NOT a second classification, just visibility into what else
        // was considered, per ChatGPT's "don't discard ambiguity" principle.
        alternatives: subjectCandidates.slice(1, 3).map(c => ({
          universal_subject: c.value, confidence: c.confidence,
          display_field: resolveDefaultPlacement(edition, c.value),
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
