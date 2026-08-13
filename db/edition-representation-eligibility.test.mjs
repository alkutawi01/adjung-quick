// edition-representation-eligibility.test.mjs — acceptance test for
// docs/edition-representation-eligibility-policy.md, written BEFORE the
// gate itself per ChatGPT's explicit instruction ("jangan 'fix' satu bug
// dan cipta regression" — write the test first, then implement against it).
//
// Tests the pure gate function in isolation (no DB, no Story Understanding,
// no Edition Classification changes) — it only decides, given a cluster's
// member languages and an edition's locale, whether that edition's
// classification should be attempted at all.
//
// Run: node db/edition-representation-eligibility.test.mjs

import { isEditionEligible } from './edition-representation-eligibility.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITION REPRESENTATION ELIGIBILITY GATE — acceptance test\n');

// Exact case from docs/edition-representation-eligibility-policy.md: a
// Malay-only Utusan Agama story must be eligible for ms-MY, but NOT for
// en-global or ar-global, since no English/Arabic representation exists.
const utusanAgamaCluster = { members: [{ language: 'ms' }] };
assert('Utusan Agama (ms only): eligible for ms-MY', isEditionEligible(utusanAgamaCluster, 'ms') === true);
assert('Utusan Agama (ms only): NOT eligible for en-global', isEditionEligible(utusanAgamaCluster, 'en') === false);
assert('Utusan Agama (ms only): NOT eligible for ar-global', isEditionEligible(utusanAgamaCluster, 'ar') === false);

// A cluster with real cross-source representation (e.g. clustered together
// from both a Malay AND an English wire report of the same story) should be
// eligible for every edition it actually has language coverage for.
const multiLangCluster = { members: [{ language: 'ms' }, { language: 'en' }] };
assert('Multi-language cluster: eligible for ms-MY', isEditionEligible(multiLangCluster, 'ms') === true);
assert('Multi-language cluster: eligible for en-global', isEditionEligible(multiLangCluster, 'en') === true);
assert('Multi-language cluster: NOT eligible for ar-global (no Arabic member)', isEditionEligible(multiLangCluster, 'ar') === false);

// Edge cases the gate must not crash on.
assert('Empty members array: not eligible for anything', isEditionEligible({ members: [] }, 'ms') === false);
assert('Missing members field: not eligible (defensive, does not throw)', isEditionEligible({}, 'ms') === false);

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
