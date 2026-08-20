// pemilihanSusunanParity.test.mjs — Polish 8B
// (docs/polish-8-selection-audit-v1.md). Polish 8A's audit found
// PemilihanPanel.jsx/SusunanAkhirPanel.jsx ran the real editorial engine
// for ANY category and labelled the result "Kaedah semasa"/"apa pembaca
// akan lihat" -- true only for the sole category actually on
// `editorial_v1` (state/rankingFlags.js). These tests prove that
// dishonesty cannot silently return: both panels must defer to
// getRankingVersion() as the single authority, never a second hardcoded
// category list of their own.
//
// Static source checks (same style as db/editor-auth.test.mjs's
// "X imports/calls Y" assertions) -- this repo has no React component
// test runner, so these check the actual source text rather than
// rendering the component. Run: node ui/src/admin/pemilihanSusunanParity.test.mjs

import fs from 'fs';
import { getRankingVersion } from '../../../state/rankingFlags.js';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nPEMILIHAN/SUSUNAN AKHIR — Admin/Reader parity test (Polish 8B)\n');

const pemilihanSrc = fs.readFileSync(new URL('./PemilihanPanel.jsx', import.meta.url), 'utf8');
const susunanSrc = fs.readFileSync(new URL('./SusunanAkhirPanel.jsx', import.meta.url), 'utf8');

// Strips `//` line comments only (JSX code has none of its own '//' inside
// string literals in these two files) -- used by the strict outside-ternary
// checks below so a doc comment quoting the old phrase for audit context
// doesn't false-positive as a live UI leak.
const stripLineComments = src => src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const pemilihanCode = stripLineComments(pemilihanSrc);
const susunanCode = stripLineComments(susunanSrc);

// --- 1. getRankingVersion() is the authority RANKING_FLAGS drives, and
// ms-MY.politics is recognised as the real active-production category. ---
{
  assert('ms-MY.politics -> editorial_v1 (recognised as active production)',
    getRankingVersion('ms-MY', 'politics') === 'editorial_v1');
  assert('ms-MY.sports -> legacy (a representative non-pilot category)',
    getRankingVersion('ms-MY', 'sports') === 'legacy');
  assert('ms-MY.bisnes -> legacy',
    getRankingVersion('ms-MY', 'bisnes') === 'legacy');
}

// --- 2. Both panels import getRankingVersion from the real module --
// never a local reimplementation or a second flag list. ---
for (const [name, src] of [['PemilihanPanel.jsx', pemilihanSrc], ['SusunanAkhirPanel.jsx', susunanSrc]]) {
  assert(`${name} imports getRankingVersion from state/rankingFlags.js`,
    /import\s*\{\s*getRankingVersion\s*\}\s*from\s*['"].*rankingFlags\.js['"]/.test(src));
  assert(`${name} computes isActiveProduction via getRankingVersion(...) === 'editorial_v1'`,
    /getRankingVersion\([^)]*\)\s*===\s*['"]editorial_v1['"]/.test(src));
}

// --- 3. Neither panel hardcodes a second category list (e.g. a literal
// fieldCode === 'politics' check) as a stand-in for the real flag --
// RANKING_FLAGS must be the only source of truth for what counts as
// "active production" in these panels. ---
for (const [name, src] of [['PemilihanPanel.jsx', pemilihanSrc], ['SusunanAkhirPanel.jsx', susunanSrc]]) {
  assert(`${name} does not hardcode fieldCode === 'politics' as a second authority`,
    !/fieldCode\s*===\s*['"]politics['"]/.test(src));
}

// --- 4. Both panels carry the required legacy-category notice, so a
// non-active category's results can never silently read as "Kaedah
// semasa" / "apa pembaca akan lihat" again. ---
for (const [name, src] of [['PemilihanPanel.jsx', pemilihanSrc], ['SusunanAkhirPanel.jsx', susunanSrc]]) {
  assert(`${name} shows the "belum diaktifkan" notice gated on !isActiveProduction`,
    /!isActiveProduction/.test(src) && /belum diaktifkan/.test(src));
  assert(`${name} labels non-active results as "Simulasi" / "belum digunakan oleh pembaca"`,
    /Simulasi/.test(src) && /belum digunakan oleh pembaca/.test(src));
}

// --- 5. STRICT intro-conditionality check (8B.1 -- ChatGPT caught that
// #4's loose "does the word Simulasi appear anywhere" check let
// PemilihanPanel.jsx's intro paragraph keep an UNCONDITIONAL "SEBENAR"
// claim even after the notice banner below it correctly said
// "simulasi" -- a real semantic contradiction the looser check missed).
// This verifies the specific "production truth" claim phrase for each
// panel is the TRUE-branch of an `isActiveProduction ?` ternary, and
// does not also appear unconditionally anywhere outside that ternary. ---
{
  // PemilihanPanel: the "SEBENAR (tidak diubah)" claim must live inside
  // `isActiveProduction ? '...SEBENAR...' : '...'`.
  const pemilihanTernary = /isActiveProduction\s*\?\s*'[^']*SEBENAR[^']*'\s*:\s*'[^']*'/.exec(pemilihanCode);
  assert('PemilihanPanel.jsx: "SEBENAR" claim is the true-branch of an isActiveProduction ternary',
    !!pemilihanTernary);
  if (pemilihanTernary) {
    const outsideTernary = pemilihanCode.slice(0, pemilihanTernary.index) + pemilihanCode.slice(pemilihanTernary.index + pemilihanTernary[0].length);
    assert('PemilihanPanel.jsx: "SEBENAR (tidak diubah)" claim does NOT also appear unconditionally elsewhere (comments excluded)',
      !outsideTernary.includes('SEBENAR (tidak diubah)'));
  }

  // SusunanAkhirPanel: the "yang pembaca akan lihat" claim must live
  // inside `isActiveProduction ? '...yang pembaca akan lihat...' : '...'`.
  const susunanTernary = /isActiveProduction\s*\?\s*'[^']*pembaca akan lihat[^']*'\s*:\s*'[^']*'/.exec(susunanCode);
  assert('SusunanAkhirPanel.jsx: "yang pembaca akan lihat" claim is the true-branch of an isActiveProduction ternary',
    !!susunanTernary);
  if (susunanTernary) {
    const outsideTernary = susunanCode.slice(0, susunanTernary.index) + susunanCode.slice(susunanTernary.index + susunanTernary[0].length);
    assert('SusunanAkhirPanel.jsx: "yang pembaca akan lihat" claim does NOT also appear unconditionally elsewhere (comments excluded)',
      !outsideTernary.includes('yang pembaca akan lihat'));
  }
}

// --- 6. No backend file::function references leaked into editor-facing
// UI copy (8B.1 -- ChatGPT caught "(reviewQueueAdapter.js::submitPinOverride)"
// literally rendered in PemilihanPanel.jsx's pin-limit notice). Code
// comments may still reference real file/function names; this only
// forbids the `.js::` / `.mjs::` backend-reference shape, which never
// belongs in rendered copy. ---
for (const [name, src] of [['PemilihanPanel.jsx', pemilihanSrc], ['SusunanAkhirPanel.jsx', susunanSrc]]) {
  assert(`${name} does not leak a "(file.js::function)" backend reference into UI copy`,
    !/\(\s*[\w-]+\.m?js::\w+\s*\)/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
