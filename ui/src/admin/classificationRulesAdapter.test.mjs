// classificationRulesAdapter.test.mjs — Backend Control Plane Phase 3,
// Admin Read-Only V1. Mocked Supabase client, matching this project's
// existing adapter-test convention (editorialAttentionAdapter.test.mjs).
//
// No React component-test harness exists anywhere in this codebase
// (every existing *.test.mjs is a plain-JS logic/adapter test) --
// introducing one now would be scope creep beyond this task. Component
// behavior (archived-row visibility, provenance rendering) is verified
// live against the dev server instead, per ChatGPT's explicit
// instruction to confirm the real /admin empty state, not just a mock.
// This file covers everything that IS pure JS: the adapter functions,
// including the direct regression test for the N+1 fix -- one query per
// batch, regardless of how many/duplicate ids are requested.

import { fetchClassificationRules, fetchClassificationRulesByIds } from './classificationRulesAdapter.js';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nCLASSIFICATION RULES ADAPTER — tests\n');

function makeSupabaseMock(resultByTable) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        select() { calls.push([table, 'select']); return query; },
        in(column, values) { calls.push([table, 'in', column, values]); return Promise.resolve(resultByTable[table]); },
        then(resolve, reject) { return Promise.resolve(resultByTable[table]).then(resolve, reject); },
      };
      return query;
    },
  };
}

// --- fetchClassificationRules(): true 0-row production state ---
{
  const supabase = makeSupabaseMock({
    classification_rules: { data: [], error: null },
    sources: { data: [{ id: 'rss-kosmo', name: 'Kosmo' }], error: null },
  });
  const rules = await fetchClassificationRules(supabase);
  check('0 rows returns an empty array (V1 true production state)', Array.isArray(rules) && rules.length === 0);
}

// --- fetchClassificationRules(): source name joined only for source rows ---
{
  const supabase = makeSupabaseMock({
    classification_rules: {
      data: [
        { id: 'r1', rule_type: 'source', edition_id: null, pattern: 'rss-kosmo', field_code: null, subject_code: 'Entertainment', priority: 10, status: 'active', created_by: 'admin', created_at: '2026-08-17T00:00:00Z' },
        { id: 'r2', rule_type: 'url', edition_id: 'ms-MY', pattern: '/jenayah/', field_code: 'crime', subject_code: null, priority: 5, status: 'active', created_by: 'admin', created_at: '2026-08-17T00:00:00Z' },
      ],
      error: null,
    },
    sources: { data: [{ id: 'rss-kosmo', name: 'Kosmo Digital' }], error: null },
  });
  const rules = await fetchClassificationRules(supabase);
  const sourceRule = rules.find(r => r.id === 'r1');
  const urlRule = rules.find(r => r.id === 'r2');
  check('source rule gets its resolved sourceName', sourceRule.sourceName === 'Kosmo Digital');
  check('url rule never gets a sourceName (its pattern is not a source id)', urlRule.sourceName === null);
}

// --- fetchClassificationRulesByIds(): the N+1 regression test ---
{
  const supabase = makeSupabaseMock({
    classification_rules: {
      data: [
        { id: 'r1', rule_type: 'keyword', edition_id: 'ms-MY', pattern: 'didakwa', field_code: 'crime', subject_code: null, priority: 20, status: 'active' },
        { id: 'r2', rule_type: 'source', edition_id: null, pattern: 'rss-rtm-hiburan', field_code: null, subject_code: 'Entertainment', priority: 100, status: 'archived' },
      ],
      error: null,
    },
  });
  // Simulates a Review Queue with 20 stories, but only 2 DISTINCT rules
  // among them -- the exact scenario ChatGPT flagged.
  const twentyStoryIds = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 'r1' : 'r2'));
  const result = await fetchClassificationRulesByIds(supabase, twentyStoryIds);

  const inCalls = supabase.calls.filter(c => c[0] === 'classification_rules' && c[1] === 'in');
  check('exactly ONE query issued for a batch of 20 ids (the N+1 fix, structural)', inCalls.length === 1);
  check('the single query was deduplicated to the 2 distinct ids, not all 20', inCalls[0][3].length === 2);
  check('result is a Map keyed by rule id', result instanceof Map && result.size === 2);
  check('r1 resolves to its full row', result.get('r1')?.pattern === 'didakwa');
  check('r2 (archived) still resolves — batch fetch does not filter by status', result.get('r2')?.status === 'archived');
}

// --- fetchClassificationRulesByIds(): empty input never queries at all ---
{
  const supabase = makeSupabaseMock({ classification_rules: { data: [], error: null } });
  const result = await fetchClassificationRulesByIds(supabase, []);
  check('empty id array returns an empty Map with zero queries', result.size === 0 && supabase.calls.length === 0);
}

// --- fetchClassificationRulesByIds(): a missing id has no entry, not a thrown error ---
{
  const supabase = makeSupabaseMock({
    classification_rules: { data: [{ id: 'exists', rule_type: 'url', edition_id: 'ms-MY', pattern: '/x/', field_code: 'crime', subject_code: null, priority: 1, status: 'active' }], error: null },
  });
  const result = await fetchClassificationRulesByIds(supabase, ['exists', 'does-not-exist']);
  check('a nonexistent id simply has no Map entry', result.has('exists') && !result.has('does-not-exist'));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
