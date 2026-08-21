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
import { getFieldEntryByLabel } from './lib/taxonomy-registry.mjs';
import { resolveClassificationRule } from './lib/classification-rules-resolver.mjs';
import { resolveAdminEditionRule } from './lib/edition-rules-resolver.mjs';

// Taxonomy Stable Field-ID V1 (2026-08-16): field_code is derived from
// whichever label a code path already resolved — every branch below
// already computes `label`/`field` before this runs, so this never
// duplicates resolution logic, only attaches the stable code alongside it.
function fieldCodeFor(edition, label) {
  return getFieldEntryByLabel(edition, label)?.field_code ?? null;
}

export const RULESET_VERSION = 'v1.4.0'; // bumped: Global Phase 4B-D precedence fix — Default Placement Mapping (Tier 3) now always runs before geography-residual fallback, confidence gate no longer short-circuits ahead of it

// Resolver order (Global Phase 4B-D, 2026-08-21 correction — supersedes the
// 2026-08-12 order below, which the confidence-gate step no longer matches):
// 1-2. Edition Rules (dynamic, context-aware — edition-rules.mjs)
// 3.   Default Placement Mapping (optional fallback hint — edition-taxonomy.mjs)
//      — tried for EVERY subject candidate, regardless of confidence.
// 4.   Geography fallback / Unclassified — only when Tier 3 found nothing.
// A weak subject candidate with a specific default mapping always beats a
// generic geography residual; geography residual is the last resort, not
// an early exit for low-confidence subjects.
// A subject with no default_mapping in a given edition is NOT a gap — that
// edition simply hasn't (yet, or ever) chosen to surface that subject.
//
// thresholdOverride: benchmark-only escape hatch (classification/
// benchmark-confidence-threshold.mjs) to test multiple min_subject_confidence
// values without mutating the policy module's shared state. Omit in normal use.
//
// item / activeRules (Backend Control Plane Phase 3, both optional,
// default to undefined/[]): ONLY used by the new Classification Rules
// prefix step immediately below. Every existing caller that omits these
// two arguments gets activeRules=[] here, which makes
// resolveClassificationRule() return null unconditionally (zero rules to
// match against) — so this is a structural no-op for any call site that
// hasn't been updated to pass real rules, not just an empirically-tested
// one. The 4-step resolver beneath this prefix (edition rules ->
// confidence gate -> default placement -> geography fallback) is
// byte-for-byte the same code that existed before Phase 3.
export function classifyForEdition(understanding, edition, thresholdOverride, item, activeRules = [], activeEditionRules = []) {
  const subjectCandidates = understanding.subject_candidates ?? [];
  const geographyCandidates = understanding.geography_candidates ?? [];

  // Backend Control Plane Phase 3: Classification Rules. An explicit,
  // admin-authored rule short-circuits everything below it — including
  // Edition Rules — when it matches and its target resolves for this
  // edition (Design V1 §5b: an explicit admin fact is a stronger signal
  // than an automatic heuristic). No match, a rejected tie, or an
  // unresolved global rule all return null here, in which case nothing
  // below this block is any different from before Phase 3 existed.
  if (item) {
    const ruleMatch = resolveClassificationRule(item, edition, activeRules);
    if (ruleMatch) {
      return {
        edition_id: edition,
        field: ruleMatch.label,
        field_code: ruleMatch.field_code,
        subject_code: ruleMatch.subject_code,
        sub_field: null,
        classification_status: 'classified',
        classification_method: 'admin_rule',
        classification_rule: ruleMatch.rule_id,
        confidence: 1,
        ruleset_version: RULESET_VERSION,
        alternatives: subjectCandidates.slice(0, 3).map(c => ({
          universal_subject: c.value, confidence: c.confidence,
          display_field: resolveDefaultPlacement(edition, c.value),
        })),
      };
    }
  }

  // Backend Control Plane Fasa 4: Admin Edition Rules. Checked BEFORE the
  // built-in Edition Rule Registry below — per the approved default+
  // override model, an admin-authored rule is a stronger signal than the
  // hardcoded default. No match (including a rejected tie) falls through
  // to the built-in rule untouched, exactly as before this feature
  // existed. classification_method stays 'edition_rule' either way
  // (Decision 3) — this is NOT classification_rules' 'admin_rule'
  // short-circuit; subject_code still comes from actual detection, never
  // from the rule itself.
  const adminEditionRuleMatch = resolveAdminEditionRule(understanding, edition, activeEditionRules);
  if (adminEditionRuleMatch) {
    return {
      edition_id: edition,
      field: adminEditionRuleMatch.label,
      field_code: adminEditionRuleMatch.field_code,
      subject_code: subjectCandidates[0]?.value ?? null,
      sub_field: null,
      classification_status: 'classified',
      classification_method: 'edition_rule',
      classification_rule: adminEditionRuleMatch.rule_id,
      confidence: adminEditionRuleMatch.confidence,
      ruleset_version: RULESET_VERSION,
      alternatives: subjectCandidates.slice(1, 3).map(c => ({
        universal_subject: c.value, confidence: c.confidence,
        display_field: resolveDefaultPlacement(edition, c.value),
      })),
    };
  }

  // Tiers 1-2: Edition Rule Registry (dynamic, context-aware — checked first)
  const ruleMatch = evaluateEditionRules(edition, understanding);
  if (ruleMatch) {
    return {
      edition_id: edition,
      field: ruleMatch.display_field,
      field_code: fieldCodeFor(edition, ruleMatch.display_field),
      // The one rule that exists (foreign_politics_to_world) requires a
      // subject match to fire at all — subjectCandidates[0].value is the
      // real Universal Subject fact this rule actually matched on.
      subject_code: subjectCandidates[0]?.value ?? null,
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

  // Tier 2.5: Confidence Gate — precedence fix (Global Phase 4B-D,
  // 2026-08-21, docs/global-edition-decision-v1.md). Per ChatGPT's
  // regression finding: a low-confidence subject candidate that still has
  // a specific Default Placement Mapping (Tier 3) must win over a merely-
  // present geography candidate. The gate previously returned a
  // geography-residual classification immediately on failure, BEFORE Tier
  // 3 ever ran — this was invisible while geography candidates were rare
  // (only populated by Tiers 1-3), but the Phase 4B-C Tier 5 geography
  // extension (extractGeographyContentEvidence) started producing weak
  // 'Malaysia' candidates from generic words ('malaysia', 'negara') in
  // ordinary ms-MY story titles, which made this early return fire for
  // stories that used to fall through to Tier 3 untouched — downgrading 5
  // real stories (Sukan/Politik/Jenayah) to generic Nasional. Fix: the
  // gate no longer short-circuits here — geography-residual fallback is
  // only reached below, AFTER Tier 3 has had a genuine chance to find a
  // specific mapping for every subject candidate. "A weak subject is
  // still better than a generic geography residual" is now true
  // unconditionally, not just in the no-geography case this comment used
  // to describe as an edge case.

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
        field_code: fieldCodeFor(edition, label),
        subject_code: candidate.value,
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
      // residual.local is null for en-global/ar-global — those editions have
      // no local-country concept (docs/edition-source-profile-model.md), so a
      // Malaysia-geography story falls back to World/العالم like any other.
      // Without the `&& residual.local` guard this would yield field=null
      // while status='classified', violating edition_field_matches_status.
    const label = (topGeo.value === 'Malaysia' && residual.local) ? residual.local : residual.world;
    return {
      edition_id: edition,
      field: label,
      field_code: fieldCodeFor(edition, label),
      subject_code: null,
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
    field_code: null,
    subject_code: null,
    sub_field: null,
    classification_status: 'unclassified',
    classification_method: 'none',
    classification_rule: null,
    confidence: 0,
    ruleset_version: RULESET_VERSION,
    alternatives: [],
  };
}

// allActiveRules: every active classification_rules row (any edition_id),
// scoped down per edition here before being handed to
// resolveClassificationRule() — a global rule (edition_id NULL) applies
// to every edition, an edition-specific rule only to its own.
//
// allActiveEditionRules (Backend Control Plane Fasa 4): every active
// edition_rules row, any edition — unlike classification_rules, edition
// rules are NEVER global (edition_id is always required, per the table's
// NOT NULL constraint), so scoping here is a plain equality filter, no
// NULL-means-global case to handle.
export function classifyForAllEditions(understanding, thresholdOverride, item, allActiveRules = [], allActiveEditionRules = []) {
  const rulesFor = edition => allActiveRules.filter(r => r.edition_id === null || r.edition_id === edition);
  const editionRulesFor = edition => allActiveEditionRules.filter(r => r.edition_id === edition);
  return {
    'ms-MY': classifyForEdition(understanding, 'ms-MY', thresholdOverride, item, rulesFor('ms-MY'), editionRulesFor('ms-MY')),
    'en-global': classifyForEdition(understanding, 'en-global', thresholdOverride, item, rulesFor('en-global'), editionRulesFor('en-global')),
    'ar-global': classifyForEdition(understanding, 'ar-global', thresholdOverride, item, rulesFor('ar-global'), editionRulesFor('ar-global')),
  };
}
