// edition-rules-resolver.test.mjs — Backend Control Plane Fasa 4
// acceptance tests, per docs/control-plane-phase4-edition-rules-
// implementation-plan-v1.md. All synthetic — no production data, no DB
// access. Mirrors classification-rules-resolver.test.mjs's structure and
// rigor.

import { understandStory } from './story-understanding.mjs';
import { classifyForEdition, classifyForAllEditions } from './edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nEDITION RULES RESOLVER — acceptance tests\n');

// Real case the built-in rule already handles: a foreign politics story
// for ms-MY, redirected to Dunia by evaluateEditionRules().
const foreignPoliticsItem = {
  sourceId: 'rss-bernama-en',
  title: 'Jordan announces new cabinet',
  description: 'The Jordanian government today.',
  link: 'https://bernama.com/world/politics/jordan-cabinet',
  categories: [],
  sourceKnownCategory: undefined,
};

// --- Test 1: true no-op — omitting activeEditionRules entirely produces
// byte-identical output to the pre-Fasa-4 built-in-only behavior. ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const withoutParam = classifyForEdition(understanding, 'ms-MY', undefined, undefined, []);
  const withEmptyArray = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], []);
  check('omitting activeEditionRules entirely produces byte-identical output to passing []',
    JSON.stringify(withoutParam) === JSON.stringify(withEmptyArray));
  check('built-in rule still fires when no admin edition rules exist (unchanged behavior)',
    withoutParam.classification_method === 'edition_rule' && withoutParam.field === 'Dunia');
}

// --- Test 2: an admin edition rule wins over a story the built-in rule
// would ALSO have matched — proves admin is checked first (Decision 1). ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const adminRules = [
    { id: 'admin-rule-1', edition_id: 'ms-MY', condition_subject: 'Politics', condition_geography_type: 'not', condition_geography_value: 'Malaysia', action_field_code: 'nasional', priority: 10 },
  ];
  const result = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], adminRules);
  check('admin edition rule wins over the built-in rule when both match',
    result.classification_method === 'edition_rule' && result.classification_rule === 'admin-rule-1');
  check('admin rule result does NOT use the built-in rule\'s target (Dunia)',
    result.field !== 'Dunia');
}

// --- Test 3: admin rules that don't match fall through to the built-in
// rule — proves the fallback direction (Decision 1, Option B). ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const nonMatchingAdminRules = [
    { id: 'admin-rule-2', edition_id: 'ms-MY', condition_subject: 'Sports', action_field_code: 'nasional', priority: 100 },
  ];
  const result = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], nonMatchingAdminRules);
  check('non-matching admin rule falls through to the built-in rule',
    result.classification_method === 'edition_rule' && result.classification_rule === 'foreign_politics_to_world' && result.field === 'Dunia');
}

// --- Test 4: "archived rule excluded" — an archived rule never appears
// in the active set the caller fetches (status='active' filter happens
// at fetch time, per the implementation plan), so this is functionally
// identical to "the rule simply isn't in activeEditionRules." ---
{
  const understanding = understandStory(foreignPoliticsItem);
  // Simulates classify-production.js's real fetch: only 'active' rows
  // are ever included in the array passed here. An archived rule is
  // absent, not present-but-flagged.
  const onlyActiveRules = []; // the archived rule from a prior test is NOT in this array
  const result = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], onlyActiveRules);
  check('an archived (i.e. absent from the active set) rule does not fire — falls through to built-in',
    result.classification_method === 'edition_rule' && result.classification_rule === 'foreign_politics_to_world');
}

// --- Test 5: subject_code always comes from detection, never from the
// admin rule itself (Decision 3 — provenance distinction preserved). ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const adminRules = [
    { id: 'admin-rule-3', edition_id: 'ms-MY', condition_subject: 'Politics', condition_geography_type: 'not', condition_geography_value: 'Malaysia', action_field_code: 'nasional', priority: 10 },
  ];
  const result = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], adminRules);
  check('subject_code comes from actual detection (Politics), not asserted by the rule',
    result.subject_code === 'Politics');
  check('classification_method is edition_rule, never admin_rule (that label is classification_rules-only)',
    result.classification_method !== 'admin_rule');
}

// --- Test 6: a cross-rule priority tie among admin rules rejects, falls
// through to the built-in rule — same "reject rather than guess" as
// classification_rules' tie handling. ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const tiedRules = [
    { id: 'tied-a', edition_id: 'ms-MY', condition_subject: 'Politics', condition_geography_type: 'not', condition_geography_value: 'Malaysia', action_field_code: 'nasional', priority: 5 },
    { id: 'tied-b', edition_id: 'ms-MY', condition_subject: 'Politics', condition_geography_type: 'not', condition_geography_value: 'Malaysia', action_field_code: 'bisnes', priority: 5 },
  ];
  const result = classifyForEdition(understanding, 'ms-MY', undefined, undefined, [], tiedRules);
  check('a priority tie between two matching admin rules rejects, falls through to built-in',
    result.classification_rule === 'foreign_politics_to_world');
}

// --- Test 7: classifyForAllEditions() scopes edition_rules per edition
// before handing them to the resolver — a rule targeting en-global never
// fires for ms-MY, and vice versa. Note: resolveAdminEditionRule() itself
// does NOT filter by edition_id (same contract as
// resolveClassificationRule() — "already scoped by the caller"), so this
// scoping is specifically classifyForAllEditions()'s responsibility,
// tested here at that level rather than against classifyForEdition()
// directly. ---
{
  const understanding = understandStory(foreignPoliticsItem);
  const mixedEditionRules = [
    { id: 'en-only-rule', edition_id: 'en-global', condition_subject: 'Politics', action_field_code: 'nasional', priority: 100 },
  ];
  const results = classifyForAllEditions(understanding, undefined, undefined, [], mixedEditionRules);
  check('an en-global-scoped rule does not fire for ms-MY (falls through to built-in)',
    results['ms-MY'].classification_rule !== 'en-only-rule' && results['ms-MY'].classification_rule === 'foreign_politics_to_world');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
