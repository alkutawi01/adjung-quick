// classify-production-wiring.test.mjs — Backend Control Plane Phase 3
// production wiring, per docs/control-plane-phase3-production-wiring-
// audit-plan-v1.md. Resolver-level tests (classification/classification-
// rules-resolver.test.mjs) already prove resolveClassificationRule()
// itself is correct — they do NOT catch a bug in the call site that
// feeds it, which is exactly what was found here (classify-production.js
// never passed `item` or `allActiveRules` at all). This test exercises
// classify-production.js's own buildRuleMatchItem() plus the real
// classifyForAllEditions(), the same combination the live script runs,
// with zero mocks of the classifier itself.

import { readFileSync } from 'node:fs';
import { buildRuleMatchItem } from './classify-production.js';
import { understandStory } from '../classification/story-understanding.mjs';
import { classifyForAllEditions } from '../classification/edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nCLASSIFY-PRODUCTION WIRING — integration tests\n');

// A canonical rss_items-shaped row, exactly as classify-production.js's
// `canonical` variable looks (snake_case source_id, per the real select).
const canonicalRow = {
  source_id: 'rss-rtm-hiburan',
  title: 'Bekas pelakon didakwa di mahkamah',
  description: 'Kes membabitkan seorang bekas pelakon.',
  link: 'https://rtm.gov.my/berita/jenayah/bekas-pelakon-didakwa',
  categories: [],
  source_known_category: 'hiburan',
  published_at: '2026-08-17T00:00:00Z',
};

// --- buildRuleMatchItem(): the exact shape bug found in this audit ---
{
  const item = buildRuleMatchItem(canonicalRow);
  check('buildRuleMatchItem maps source_id -> sourceId (snake_case DB column to resolver shape)', item.sourceId === 'rss-rtm-hiburan');
  check('buildRuleMatchItem carries link through unchanged', item.link === canonicalRow.link);
  check('buildRuleMatchItem carries title through unchanged', item.title === canonicalRow.title);
  check('buildRuleMatchItem carries description through unchanged', item.description === canonicalRow.description);
}

// --- End-to-end: a Source Rule matching this canonical row's source_id
// must actually fire when run through the REAL combination classify-
// production.js uses — item built via buildRuleMatchItem(), passed
// alongside activeRules to the real classifyForAllEditions(). If the
// call site ever regresses to the old classifyForAllEditions(understanding)
// single-argument form, this test fails because the rule never matches. ---
{
  const understanding = understandStory(canonicalRow);
  const item = buildRuleMatchItem(canonicalRow);
  const activeRules = [
    { id: 'rule-wiring-test', rule_type: 'source', edition_id: 'ms-MY', pattern: 'rss-rtm-hiburan', field_code: 'entertainment', priority: 100 },
  ];
  const editions = classifyForAllEditions(understanding, undefined, item, activeRules);
  check('a Source Rule fires end-to-end through the real call-site wiring (admin_rule provenance)',
    editions['ms-MY'].classification_method === 'admin_rule' && editions['ms-MY'].classification_rule === 'rule-wiring-test');
}

// --- The critical regression guard: omitting item/activeRules (the old,
// broken call shape) must NOT accidentally still work — if it does, this
// test can't actually prove the wiring matters. ---
{
  const understanding = understandStory(canonicalRow);
  const activeRules = [
    { id: 'rule-wiring-test-2', rule_type: 'source', edition_id: 'ms-MY', pattern: 'rss-rtm-hiburan', field_code: 'entertainment', priority: 100 },
  ];
  const editionsWithoutItem = classifyForAllEditions(understanding, undefined, undefined, activeRules);
  check('omitting item (the pre-fix bug) means the Source Rule never matches — proves item was load-bearing',
    editionsWithoutItem['ms-MY'].classification_method !== 'admin_rule');
}

// --- Zero rules (today's real production state) must be a true no-op,
// through the same real call-site combination. ---
{
  const understanding = understandStory(canonicalRow);
  const item = buildRuleMatchItem(canonicalRow);
  const editions = classifyForAllEditions(understanding, undefined, item, []);
  check('zero active rules: classification_method is never admin_rule (today\'s real production state)',
    editions['ms-MY'].classification_method !== 'admin_rule');
}

// --- K3 (Polish 8E, docs/polish-8e-placement-audit-v1.md): edition_rules
// wiring had ZERO coverage. Every call above passes FOUR arguments, but
// allActiveEditionRules is the FIFTH (edition-classification.mjs), so if
// classify-production.js ever stopped reading edition_rules or stopped
// forwarding them, nothing would have failed.
//
// Deliberately NOT a regex asserting a variable name exists (director's
// explicit instruction) — these run the real classifier and assert the
// placement OUTPUT actually changes.
//
// This row understands as subject Politics with geography World: the
// 'not Malaysia' condition requires geography to be PRESENT and different,
// so a story with no detected geography would not exercise the rule at all.
const foreignPoliticsRow = {
  source_id: 'rss-awani-politik',
  title: 'Kongres lulus undang-undang',
  description: 'Parlimen.',
  link: 'https://www.astroawani.com/berita-politik/kongres-lulus',
  categories: ['dunia'],
  source_known_category: 'dunia',
  published_at: '2026-08-17T00:00:00Z',
};

{
  const understanding = understandStory(foreignPoliticsRow);
  const item = buildRuleMatchItem(foreignPoliticsRow);
  check('fixture really is Politics + non-Malaysia (otherwise the rule below proves nothing)',
    understanding.subject_candidates[0]?.value === 'Politics'
    && understanding.geography_candidates[0]?.value === 'World');

  const editionRule = {
    id: 'edition-rule-wiring-test',
    edition_id: 'ms-MY',
    condition_subject: 'Politics',
    condition_geography_type: 'not',
    condition_geography_value: 'Malaysia',
    action_field_code: 'dunia',
    priority: 50,
    status: 'active',
  };

  const withRule = classifyForAllEditions(understanding, undefined, item, [], [editionRule]);
  check('an admin edition rule (Politics + not Malaysia -> dunia) fires as the FIFTH argument',
    withRule['ms-MY'].field_code === 'dunia'
    && withRule['ms-MY'].classification_rule === 'edition-rule-wiring-test');

  // Proves it was the ADMIN rule, not the built-in default. The built-in
  // (classification/lib/edition-rules.mjs) routes the SAME story to Dunia,
  // so field_code alone cannot tell them apart — provenance can.
  const withoutRule = classifyForAllEditions(understanding, undefined, item, []);
  check('omitting the fifth argument falls back to the BUILT-IN rule, not the admin one',
    withoutRule['ms-MY'].classification_rule === 'foreign_politics_to_world'
    && withoutRule['ms-MY'].classification_rule !== 'edition-rule-wiring-test');

  // Strongest form: an admin rule pointing somewhere the built-in never
  // would proves the fifth argument genuinely CHANGES the placement output
  // rather than coinciding with the default.
  const divergent = classifyForAllEditions(understanding, undefined, item, [], [
    { ...editionRule, id: 'edition-rule-divergent', action_field_code: 'nasional' },
  ]);
  check('an admin rule overrides the built-in and changes the output field (dunia -> nasional)',
    divergent['ms-MY'].field_code === 'nasional'
    && withoutRule['ms-MY'].field_code === 'dunia');

  // Edition rules are never global (edition_id NOT NULL), so a rule for a
  // different edition must not leak into ms-MY.
  const otherEdition = classifyForAllEditions(understanding, undefined, item, [], [
    { ...editionRule, id: 'edition-rule-other', edition_id: 'en-global', action_field_code: 'nasional' },
  ]);
  check('an edition rule scoped to another edition does NOT affect ms-MY',
    otherEdition['ms-MY'].field_code === 'dunia'
    && otherEdition['ms-MY'].classification_rule === 'foreign_politics_to_world');
}

// --- The live script must actually READ edition_rules and forward them.
// The assertions above prove the classifier honours a fifth argument; this
// proves classify-production.js is the thing supplying it. ---
{
  // Comments are stripped FIRST. An earlier version of this check collapsed
  // whitespace without removing them, and the `// thresholdOverride —
  // unchanged, was never passed…` comment sitting on argument 2 contains a
  // comma — so a FOUR-argument call already produced five comma-separated
  // segments and matched. Deleting the edition-rules argument entirely left
  // this test green, which an adversarial review proved by doing exactly
  // that. Same class of miss as the whole-file `.eq('status','active')`
  // check it replaces: that string also appears in the classification_rules
  // query ten lines above, so removing it from the edition_rules query —
  // which would make ARCHIVED placement rules fire in production — passed too.
  // CRLF is normalised BEFORE stripping: `.` does not match `\r`, so on a
  // CRLF checkout `//.*$` never reaches end-of-string and every line comment
  // survives — which is how the first attempt at this fix still matched a
  // commented-out mention of the function instead of the real call.
  const raw = readFileSync(new URL('./classify-production.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

  // Scope the status filter to the edition_rules query's own statement.
  const editionRulesQuery = src.match(/\.from\('edition_rules'\)[\s\S]*?;/)?.[0] ?? '';
  check('classify-production.js queries edition_rules',
    /\.from\('edition_rules'\)/.test(src));
  check('that query filters to status=active (archived placement rules must not fire)',
    /\.eq\('status',\s*'active'\)/.test(editionRulesQuery));

  // Match the real call and count its ARGUMENTS, rather than trusting a
  // comma-counting regex over the raw text.
  const call = src.match(/classifyForAllEditions\(([\s\S]*?)\);/)?.[1] ?? '';
  const args = call.split(',').map(a => a.trim()).filter(Boolean);
  check('classifyForAllEditions is called with five arguments',
    args.length === 5);
  check('the fifth argument is the active edition rules the query above loaded',
    args[4] === 'activeEditionRules' && /const \{ data: activeEditionRules/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
