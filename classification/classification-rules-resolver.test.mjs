// classification-rules-resolver.test.mjs — Backend Control Plane Phase 3
// acceptance tests, per ChatGPT's explicit list before any real rule is
// ever created. All synthetic — no production data, no DB access.

import { understandStory } from './story-understanding.mjs';
import { classifyForEdition } from './edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nCLASSIFICATION RULES RESOLVER — acceptance tests\n');

// The real case this whole phase started from: an RTM Hiburan-desk story
// whose URL happens to contain /jenayah/. Today's classifier correctly
// resolves this to Jenayah because url_path evidence (0.90) outranks
// publisher_declared evidence (0.75) — this is the exact scenario
// ChatGPT rejected auto-migrating knownCategory over, since a blanket
// Source Rule would have silently reversed it.
const rtmHiburanJenayahItem = {
  sourceId: 'rss-rtm-hiburan',
  title: 'Bekas pelakon didakwa di mahkamah',
  description: 'Kes membabitkan seorang bekas pelakon.',
  link: 'https://rtm.gov.my/berita/jenayah/bekas-pelakon-didakwa',
  categories: [],
  sourceKnownCategory: 'hiburan',
};

// --- Test 1: no rule exists — behaviour must be identical to pre-Phase-3 ---
{
  const understanding = understandStory(rtmHiburanJenayahItem);
  const noRuleResult = classifyForEdition(understanding, 'ms-MY', undefined, rtmHiburanJenayahItem, []);
  check('no Admin Rule: RTM Hiburan + /jenayah/ resolves to Jenayah (url_path evidence wins, as today)', noRuleResult.field === 'Jenayah');
  check('no Admin Rule: classification_method is NOT admin_rule', noRuleResult.classification_method !== 'admin_rule');

  // Also confirm omitting item/activeRules entirely (the pre-Phase-3 call
  // shape every existing caller still uses) produces the exact same
  // result — proving the prefix is a true structural no-op, not just
  // empirically equal when rules happen to be empty.
  const omittedArgsResult = classifyForEdition(understanding, 'ms-MY');
  check('omitting item/activeRules entirely produces byte-identical output to passing []', JSON.stringify(omittedArgsResult) === JSON.stringify(noRuleResult));
}

// --- Test 2: Admin creates a Source Rule for this exact source — must override ---
{
  const understanding = understandStory(rtmHiburanJenayahItem);
  const sourceRule = {
    id: 'synthetic-source-rule-1', rule_type: 'source', edition_id: null,
    pattern: 'rss-rtm-hiburan', field_code: null, subject_code: 'Entertainment',
    priority: 100, status: 'active',
  };
  const withRuleResult = classifyForEdition(understanding, 'ms-MY', undefined, rtmHiburanJenayahItem, [sourceRule]);
  check('Admin Source Rule (priority 100) overrides URL evidence: Hiburan', withRuleResult.field === 'Hiburan');
  check('classification_method is admin_rule', withRuleResult.classification_method === 'admin_rule');
  check('classification_rule is the rule id', withRuleResult.classification_rule === 'synthetic-source-rule-1');
  check('field_code resolved correctly for ms-MY (entertainment)', withRuleResult.field_code === 'entertainment');
}

// --- Test 3: a different source, Admin creates a URL Rule instead ---
{
  const otherSourceItem = {
    sourceId: 'rss-some-other-source', // no knownCategory, no Source Rule
    title: 'Berita mahkamah terkini',
    description: 'Perbicaraan diteruskan hari ini.',
    link: 'https://example.com/berita/jenayah/kes-mahkamah',
    categories: [],
  };
  const understanding = understandStory(otherSourceItem);
  const urlRule = {
    id: 'synthetic-url-rule-1', rule_type: 'url', edition_id: 'ms-MY',
    pattern: '/jenayah/', field_code: 'crime', subject_code: null,
    priority: 50, status: 'active',
  };
  const withUrlRuleResult = classifyForEdition(understanding, 'ms-MY', undefined, otherSourceItem, [urlRule]);
  check('Admin URL Rule matches and wins: Jenayah', withUrlRuleResult.field === 'Jenayah');
  check('classification_method is admin_rule (URL rule works identically to Source rule)', withUrlRuleResult.classification_method === 'admin_rule');
  check('classification_rule is the URL rule id', withUrlRuleResult.classification_rule === 'synthetic-url-rule-1');
}

// --- Test 4: global rule whose subject has no active mapping in this edition ---
{
  // Every real Universal Subject currently has SOME mapping in every
  // edition (ar-global merges several fields but its subject_codes union
  // still covers the full set, per taxonomy-registry.mjs) — so this test
  // uses a deliberately nonexistent subject value to exercise the
  // unresolved path honestly, rather than relying on a real edition gap
  // that may not exist. This is the same "unresolved" code path that
  // WOULD fire for a real subject/edition combination that genuinely had
  // no mapping (Design V1 §4b-i) — the resolver has no special case for
  // "fake" vs. "real but unmapped" subjects, it just looks up whatever
  // string it's given.
  const item = {
    sourceId: 'rss-unresolved-test-source',
    title: 'A story with no real classifier signal',
    description: 'Nothing here matches any known desk/URL/keyword.',
    link: 'https://example.com/no-desk-match-here-either',
    categories: [],
  };
  const understanding = understandStory(item);
  const globalNonexistentSubjectRule = {
    id: 'synthetic-unresolved-rule-1', rule_type: 'source', edition_id: null,
    pattern: 'rss-unresolved-test-source', field_code: null, subject_code: 'Astrology',
    priority: 100, status: 'active',
  };
  const result = classifyForEdition(understanding, 'ms-MY', undefined, item, [globalNonexistentSubjectRule]);
  check('global rule whose subject has no mapping in ANY edition falls through to the classifier, not admin_rule', result.classification_method !== 'admin_rule');
  check('unresolved fallback produces the honest pre-Phase-3 outcome (unclassified, no other evidence in this synthetic story)', result.classification_status === 'unclassified');
}

// --- Test 4b: the SAME global-rule mechanism resolves correctly when the subject IS real ---
{
  const item = {
    sourceId: 'rss-resolved-test-source',
    title: 'A generic education story',
    description: 'Nothing here matches any known desk/URL/keyword either.',
    link: 'https://example.com/no-desk-match-here-too',
    categories: [],
  };
  const understanding = understandStory(item);
  const globalEducationRule = {
    id: 'synthetic-resolved-rule-1', rule_type: 'source', edition_id: null,
    pattern: 'rss-resolved-test-source', field_code: null, subject_code: 'Education',
    priority: 100, status: 'active',
  };
  const msMyResult = classifyForEdition(understanding, 'ms-MY', undefined, item, [globalEducationRule]);
  check('a global rule with a real, mapped subject resolves via admin_rule', msMyResult.classification_method === 'admin_rule');
  check('ms-MY result field_code is the education field', msMyResult.field_code === 'education');

  const arGlobalResult = classifyForEdition(understanding, 'ar-global', undefined, item, [globalEducationRule]);
  check('the SAME rule also resolves in ar-global (its merged taxonomy still covers Education)', arGlobalResult.classification_method === 'admin_rule');
  check('ar-global result field_code is its own education field (تعليم)', arGlobalResult.field_code === 'education');
}

// --- Cross-type tie: reject, fall through to classifier ---
{
  const item = {
    sourceId: 'rss-tie-test-source',
    title: 'artis didakwa',
    description: '',
    link: 'https://example.com/no-desk-match-here',
    categories: [],
  };
  const understanding = understandStory(item);
  const sourceR = { id: 'tie-source', rule_type: 'source', edition_id: null, pattern: 'rss-tie-test-source', field_code: null, subject_code: 'Entertainment', priority: 10, status: 'active' };
  const keywordR = { id: 'tie-keyword', rule_type: 'keyword', edition_id: 'ms-MY', pattern: 'didakwa', field_code: 'crime', subject_code: null, priority: 10, status: 'active' };
  const tieResult = classifyForEdition(understanding, 'ms-MY', undefined, item, [sourceR, keywordR]);
  check('cross-type priority tie rejects (no admin_rule), falls through to classifier', tieResult.classification_method !== 'admin_rule');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
