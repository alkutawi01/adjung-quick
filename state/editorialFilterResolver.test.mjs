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

// --- Polish 5A.1: word-boundary matching (BREAKING change from V1's
// original plain substring) -- "artis" must NOT fire inside "artistik".
// Live production audit (691-story corpus) found exactly this class of
// false positive for real filter-candidate words: arak/semarak,
// pub/Republic, seks/seksyen, judi/judicial. ---
{
  const r = resolveEditorialFilter('Seorang artistik mempamerkan lukisan', rules);
  assert('word-boundary: "artis" does NOT fire mid-word inside "artistik"', r.keep === true && r.reason === 'default');
}
{
  const boundaryRules = [
    { id: 'b1', rule_type: 'exclude', phrase: 'arak' },
    { id: 'b2', rule_type: 'exclude', phrase: 'pub' },
    { id: 'b3', rule_type: 'exclude', phrase: 'seks' },
    { id: 'b4', rule_type: 'exclude', phrase: 'judi' },
  ];
  const r1 = resolveEditorialFilter('Lagu KITA semarak semangat patriotisme', boundaryRules);
  assert('"arak" does not fire inside "semarak"', r1.keep === true && r1.reason === 'default');
  const r2 = resolveEditorialFilter('Public in England and Wales wrongly think', boundaryRules);
  assert('"pub" does not fire inside "Public"', r2.keep === true && r2.reason === 'default');
  const r3 = resolveEditorialFilter('Pemansuhan AUKU boleh jejas seksyen tertentu', boundaryRules);
  assert('"seks" does not fire inside "seksyen"', r3.keep === true && r3.reason === 'default');
  const r4 = resolveEditorialFilter('Kajian bidang judicial review di Malaysia', boundaryRules);
  assert('"judi" does not fire inside "judicial"', r4.keep === true && r4.reason === 'default');

  const real1 = resolveEditorialFilter('Kedai jual arak tanpa lesen dirampas', boundaryRules);
  assert('real standalone "arak" still fires', real1.keep === false && real1.reason === 'exclude');
  const real2 = resolveEditorialFilter('Pub tutup lewat malam disaman', boundaryRules);
  assert('real standalone "Pub" still fires (case-insensitive)', real2.keep === false && real2.reason === 'exclude');
  const real3 = resolveEditorialFilter('Kes seks tanpa persetujuan didakwa', boundaryRules);
  assert('real standalone "seks" still fires', real3.keep === false && real3.reason === 'exclude');
  const real4 = resolveEditorialFilter('Sindiket judi online ditumpaskan', boundaryRules);
  assert('real standalone "judi" still fires', real4.keep === false && real4.reason === 'exclude');
}

// --- morphological variants are NOT implied ---
{
  const r = resolveEditorialFilter('Sindiket perjudian online ditumpaskan', [
    { id: 'j1', rule_type: 'exclude', phrase: 'judi' },
  ]);
  assert('"judi" rule does NOT also match "perjudian" (explicit-rule-per-form policy)', r.keep === true && r.reason === 'default');
}

// --- HTML stripping (Polish 5A.1, same real bug class content-rules.mjs
// found: an <img alt="..."> caption's unrelated text must never trigger
// or suppress a filter match) ---
{
  const r = resolveEditorialFilterForStory({
    title: 'Berita sukan hari ini',
    description: '<img alt="gambar arak di kedai lama" src="x.jpg"> Perlawanan berjalan lancar.',
  }, [{ id: 'h1', rule_type: 'exclude', phrase: 'arak' }]);
  assert('markup/attribute text does not trigger a filter match', r.keep === true && r.reason === 'default');
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
