// edition-rules.mjs — Edition Rule Registry (the DYNAMIC half of the
// Unified Resolver Model, docs/edition-rule-engine-contract.md). Data, not
// code branches — each rule is condition/action, evaluated in priority
// order by edition-classification.mjs's resolver.
//
// Sesi 3B.2B scope, deliberately narrow per ChatGPT: only rules already
// proven by Sesi 3B.1's gap analysis, not a speculative generalization.
// foreign_politics_to_world is the ONLY rule here — its Gap 2 siblings
// (Crime/Disaster/Environment/Business) are explicitly NOT extended to
// automatically, since e.g. a foreign earthquake plausibly still belongs
// under Bencana for ms-MY (disaster relevance isn't geography-scoped the
// way domestic party politics is) — that needs its own evidence, not an
// automatic copy of this rule.

export const EDITION_RULES = {
  'ms-MY': [
    {
      rule_id: 'foreign_politics_to_world',
      priority: 2, // tier 2: contextual transformation
      condition: { subject: 'Politics', geographyNot: 'Malaysia' },
      action: { display_field: 'Dunia' },
    },
  ],
  'en-global': [],
  'ar-global': [],
};

// Evaluate an edition's rules against one story's Story Understanding
// output. Returns the first matching rule's action, or null if none match
// — in which case the resolver falls through to the Display Transform
// Registry (tier 3).
export function evaluateEditionRules(edition, understanding) {
  const rules = (EDITION_RULES[edition] ?? []).slice().sort((a, b) => a.priority - b.priority);
  const topSubject = understanding.subject_candidates[0];
  const topGeography = understanding.geography_candidates[0];

  for (const rule of rules) {
    const c = rule.condition;
    if (c.subject && (!topSubject || topSubject.value !== c.subject)) continue;
    if (c.geographyNot && (!topGeography || topGeography.value === c.geographyNot)) continue;
    if (c.geographyIs && (!topGeography || topGeography.value !== c.geographyIs)) continue;
    return {
      rule_id: rule.rule_id,
      display_field: rule.action.display_field,
      confidence: topSubject?.confidence ?? topGeography?.confidence ?? 0.5,
    };
  }
  return null;
}
