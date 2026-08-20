// nilaiSusunanPanel.test.mjs — Polish 8C
// (docs/polish-8-selection-audit-v1.md). ChatGPT's exact required test
// list for the unified "Nilai & Susunan" surface (NilaiSusunanPanel.jsx +
// the generalized valueRankingAdapter.js), replacing the four separate
// panels (Data Sebenar / Kaedah Nilai / Pemilihan 10 / Susunan Akhir).
//
// Static source checks (same style as pemilihanSusunanParity.test.mjs) for
// the UI-shape requirements, plus functional fixture tests (no Supabase
// client) against valueRankingAdapter.js's pure computeFieldRanking() for
// the pipeline-behavior requirements. Run:
// node ui/src/admin/nilaiSusunanPanel.test.mjs

import fs from 'fs';
import { computeFieldRanking } from './valueRankingAdapter.js';
import { getRankingVersion } from '../../../state/rankingFlags.js';
import { PAGES, resolveRedirect } from './adminRouter.js';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nNILAI & SUSUNAN — unified panel test (Polish 8C)\n');

const panelSrc = fs.readFileSync(new URL('./NilaiSusunanPanel.jsx', import.meta.url), 'utf8');
const adapterSrc = fs.readFileSync(new URL('./valueRankingAdapter.js', import.meta.url), 'utf8');
// Strips `//` line comments -- a doc comment EXPLAINING what was retired
// (e.g. "no longer has a Kaedah semasa toggle") would otherwise
// false-positive as if the retired UI text were still rendered.
const panelCode = panelSrc.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// --- Static: single category selector, no legacy comparison mode, no
// hardcoded field, real getRankingVersion() authority. ---
{
  assert('NilaiSusunanPanel.jsx has exactly one <select> (one category dropdown)',
    (panelSrc.match(/<select/g) ?? []).length === 1);
  assert('NilaiSusunanPanel.jsx does not import scoreCandidateV1 (retired R&D comparison mode)',
    !/scoreCandidateV1/.test(panelSrc));
  assert('NilaiSusunanPanel.jsx has no "Kaedah semasa" / "Skor V1 simulasi" radio text',
    !/Kaedah semasa/.test(panelCode) && !/Skor V1 simulasi/.test(panelCode));
  assert('NilaiSusunanPanel.jsx imports getRankingVersion from state/rankingFlags.js',
    /import\s*\{\s*getRankingVersion\s*\}\s*from\s*['"].*rankingFlags\.js['"]/.test(panelSrc));
  assert('NilaiSusunanPanel.jsx does not hardcode fieldCode === \'politics\'',
    !/fieldCode\s*===\s*['"]politics['"]/.test(panelSrc));
  assert('NilaiSusunanPanel.jsx labels active-production categories as "Digunakan oleh pembaca"',
    /Digunakan oleh pembaca/.test(panelSrc));
  assert('NilaiSusunanPanel.jsx labels non-active categories as "Pratonton"',
    /Pratonton/.test(panelSrc));
  assert('NilaiSusunanPanel.jsx has no Pin/Boost action buttons (view-only surface, per Polish 8C scope)',
    !/onClick=\{.*(?:pin|boost|Boost|Pin)\(/i.test(panelSrc));
}

// --- Static: adapter still calls the real pipeline, no reimplementation. ---
{
  for (const fn of ['scoreCandidates', 'selectDiverseCandidates', 'applyEditorialComposition']) {
    assert(`valueRankingAdapter.js imports the real ${fn}`,
      new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from`).test(adapterSrc));
  }
  assert('valueRankingAdapter.js no longer exports hardcoded RANKED_EDITION_ID/RANKED_FIELD_CODE constants',
    !/export const RANKED_EDITION_ID/.test(adapterSrc) && !/export const RANKED_FIELD_CODE/.test(adapterSrc));
  assert('fetchValueRankingData takes editionId/fieldCode as parameters',
    /fetchValueRankingData\(supabase,\s*editionId,\s*fieldCode\)/.test(adapterSrc));
  // Polish 7D fix's exact discipline (editorial_boost gated on real score
  // contribution, not the raw boosted flag) must still hold here -- this
  // module reads `reasons` off the real scored candidate rather than
  // re-deriving a boost label from `candidate.boosted` itself.
  assert('valueRankingAdapter.js does not derive a boost/editorial reason from the raw `boosted` flag directly',
    !/c\.boosted\s*\?/.test(adapterSrc) && !/candidate\.boosted\s*\?/.test(adapterSrc));
}

// --- Static: exactly one "Nilai & Susunan" route, old routes redirect. ---
{
  const nilaiPages = PAGES.filter(p => p.group === 'nilai');
  assert('adminRouter.js has exactly one page in the "nilai" group', nilaiPages.length === 1);
  assert('the one "nilai" page path is /admin/nilai', nilaiPages[0]?.path === '/admin/nilai');
  for (const old of ['/admin/nilai/data-sebenar', '/admin/nilai/kaedah', '/admin/nilai/pemilihan', '/admin/nilai/susunan-akhir']) {
    assert(`old URL ${old} redirects to /admin/nilai`, resolveRedirect(old) === '/admin/nilai');
  }
}

// --- Functional (fixtures, no Supabase): pipeline behavior via the real
// pure computeFieldRanking(). ---
const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

function candidate(overrides) {
  return {
    storyId: 'x', title: 'Judul', sourceId: 's1', sourceName: 'Sumber 1',
    publishedAt: hoursAgo(1), trustScore: 50, classificationConfidence: 0.5,
    pinned: false, pinnedAt: null,
    ...overrides,
  };
}

// 2 Pin -> both stay (Dikekalkan editor), a 3rd pin falls back into the
// normal contest instead of being silently dropped.
{
  const cands = [
    candidate({ storyId: 'p1', pinned: true, pinnedAt: hoursAgo(200) }),
    candidate({ storyId: 'p2', pinned: true, pinnedAt: hoursAgo(150) }),
    candidate({ storyId: 'p3', pinned: true, pinnedAt: hoursAgo(50), trustScore: 90 }),
    candidate({ storyId: 'c1', trustScore: 90 }),
  ];
  const rows = computeFieldRanking(cands);
  const p1 = rows.find(r => r.storyId === 'p1');
  const p2 = rows.find(r => r.storyId === 'p2');
  const p3 = rows.find(r => r.storyId === 'p3');
  assert('2 Pin (oldest-first) both marked "Dikekalkan editor"',
    p1.status === 'Dikekalkan editor' && p2.status === 'Dikekalkan editor');
  assert('a 3rd pin is NOT dropped -- it re-enters the normal ranking contest',
    p3.status !== 'Dikekalkan editor' && rows.some(r => r.storyId === 'p3'));
}

// <10 eligible candidates -> all shown, no padding/filler rows.
{
  const cands = [candidate({ storyId: 'a' }), candidate({ storyId: 'b' }), candidate({ storyId: 'c' })];
  const rows = computeFieldRanking(cands);
  assert('3 eligible candidates -> exactly 3 rows, no padding', rows.length === 3);
}

// Composition swap is at most ONE substitution -- exactly one 'Masuk' and
// one 'Keluar' row when a genuine dominant-source swap fires, never more.
{
  const cands = [
    candidate({ storyId: 'd1', sourceId: 'dominant', trustScore: 95, publishedAt: hoursAgo(1) }),
    candidate({ storyId: 'd2', sourceId: 'dominant', trustScore: 94, publishedAt: hoursAgo(2) }),
    candidate({ storyId: 'd3', sourceId: 'dominant', trustScore: 93, publishedAt: hoursAgo(3) }),
    candidate({ storyId: 'd4', sourceId: 'dominant', trustScore: 40, publishedAt: hoursAgo(4) }), // weakest dominant
    candidate({ storyId: 'alt', sourceId: 'alt-source', trustScore: 92, publishedAt: hoursAgo(5) }), // strong alt, only just missed diversity pick
  ];
  const rows = computeFieldRanking(cands);
  const masuk = rows.filter(r => r.status === 'Masuk');
  const keluar = rows.filter(r => r.status === 'Keluar');
  assert('composition produces at most one "Masuk" row', masuk.length <= 1);
  assert('composition produces at most one "Keluar" row', keluar.length <= 1);
  assert('"Masuk" and "Keluar" counts match (a swap is a pair, not independent)', masuk.length === keluar.length);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
