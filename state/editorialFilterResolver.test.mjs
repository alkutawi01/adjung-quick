// editorialFilterResolver.test.mjs — Editorial Filter Rules V1 tests.
// Pure function tests, no database/network.
//
// Run: node state/editorialFilterResolver.test.mjs

import { resolveEditorialFilter, resolveEditorialFilterForStory } from './editorialFilterResolver.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITORIAL FILTER RESOLVER — precedence + matching test\n');

const rules = [
  { id: 'r1', rule_type: 'exclude', phrase: 'artis' },
  { id: 'r2', rule_type: 'exclude', phrase: 'penyanyi' },
  { id: 'r3', rule_type: 'exclude', phrase: 'selebriti' },
  { id: 'r4', rule_type: 'except', phrase: 'bertaubat' },
  { id: 'r5', rule_type: 'except', phrase: 'berhijrah' },
];

// --- worked examples from the product spec, verbatim ---
{
  const r = resolveEditorialFilter('Penyanyi terkenal lancar album baharu', rules);
  assert('exclude-only match -> dropped', r.keep === false && r.reason === 'exclude');
}
{
  const r = resolveEditorialFilter('Penyanyi itu mengumumkan dirinya berhijrah', rules);
  assert('except beats exclude on same story -> kept', r.keep === true && r.reason === 'exception');
}

// --- no exclude present, except alone is a no-op but still keeps ---
{
  const r = resolveEditorialFilter('Rakyat sambut Hari Kemerdekaan', rules);
  assert('neither matches -> default keep', r.keep === true && r.reason === 'default');
}

// --- case-insensitivity ---
{
  const r = resolveEditorialFilter('PENYANYI terkenal lancar album baharu', rules);
  assert('case-insensitive exclude match', r.keep === false && r.reason === 'exclude');
}
{
  const r = resolveEditorialFilter('Penyanyi itu mengumumkan dirinya BERHIJRAH', rules);
  assert('case-insensitive except match beats exclude', r.keep === true && r.reason === 'exception');
}

// --- inactive rules must already be filtered out by the caller — this
// function trusts its input, so an empty rule list is the "no active
// rules" case ---
{
  const r = resolveEditorialFilter('Penyanyi terkenal lancar album baharu', []);
  assert('empty rule list -> default keep (caller responsible for active filtering)', r.keep === true && r.reason === 'default');
}

// --- substring behavior: "artis" matches inside "wartawan"? No — but
// does match inside a longer word containing it as a substring, since
// V1 is explicitly substring not word-boundary matching. ---
{
  const r = resolveEditorialFilter('Seorang artistik mempamerkan lukisan', rules);
  assert('substring match fires even mid-word (documented V1 behavior, not word-boundary)', r.keep === false && r.reason === 'exclude');
}

// --- title+description combined ---
{
  const r = resolveEditorialFilterForStory({ title: 'Berita hari ini', description: 'Seorang penyanyi popular' }, rules);
  assert('resolveEditorialFilterForStory checks description too', r.keep === false && r.reason === 'exclude');
}
{
  const r = resolveEditorialFilterForStory({ title: 'Penyanyi lancar album', description: null }, rules);
  assert('resolveEditorialFilterForStory tolerates null description', r.keep === false && r.reason === 'exclude');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
