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

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
