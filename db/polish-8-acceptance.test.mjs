// polish-8-acceptance.test.mjs — Polish 8F, final verification.
//
// Polish 8 spanned five sub-phases across the ranking engine, the Pin
// lifecycle, the Boost decision and the placement-rules page. Each has its
// own unit tests; this file is the DIRECTOR'S acceptance list, asserted in
// one place, so "is Polish 8 actually done" is a single command rather than
// a reading exercise across nine files.
//
// Deliberately end-to-end where it can be: the ranking checks run the real
// scoring -> diversity -> composition chain, and the placement checks run the
// real classifier. Where a claim is about the SHAPE of the mounted UI (a
// create path existing or not), it is a source assertion — those are marked
// as such rather than dressed up as behavioural.
//
// Run: node db/polish-8-acceptance.test.mjs

import { readFileSync } from 'node:fs';
import { scoreCandidates, BOOST_WEIGHT } from '../ranking/candidate-scoring.mjs';
import { selectDiverseCandidates } from '../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../ranking/editorial-composition.mjs';
import { computeFieldRanking } from '../ui/src/admin/valueRankingAdapter.js';
import { understandStory } from '../classification/story-understanding.mjs';
import { classifyForAllEditions } from '../classification/edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nPOLISH 8 — final acceptance (8F)\n');

const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 3600e3).toISOString();
const cand = o => ({
  storyId: 'x', title: 'Judul', sourceId: 's1', sourceName: 'Sumber 1',
  publishedAt: hoursAgo(1), trustScore: 50, classificationConfidence: 0.5,
  pinned: false, pinnedAt: null, ...o,
});
const runPipeline = (candidates, capacity = 10) => {
  const scored = scoreCandidates(candidates);
  const diversity = selectDiverseCandidates(scored, capacity);
  const pool = scored.filter(c => !diversity.some(s => s.storyId === c.storyId));
  return { scored, diversity, ...applyEditorialComposition(diversity, { alternativePool: pool }) };
};

console.log('-- Ranking: selection and composition --');
{
  // One source dominating the top, with a genuinely comparable alternative
  // available: composition may correct it, but only ONCE.
  const candidates = [
    ...Array.from({ length: 8 }, (_, i) => cand({ storyId: `dom${i}`, sourceId: 'dominant', trustScore: 95 - i, publishedAt: hoursAgo(i + 1) })),
    cand({ storyId: 'alt1', sourceId: 'alt-a', trustScore: 88, publishedAt: hoursAgo(2) }),
    cand({ storyId: 'alt2', sourceId: 'alt-b', trustScore: 86, publishedAt: hoursAgo(3) }),
    cand({ storyId: 'alt3', sourceId: 'alt-c', trustScore: 84, publishedAt: hoursAgo(4) }),
  ];
  const { diversity, selected, compositionReasons } = runPipeline(candidates);
  const swappedIn = selected.filter(c => !diversity.some(d => d.storyId === c.storyId));
  const swappedOut = diversity.filter(d => !selected.some(c => c.storyId === d.storyId));
  check('composition performs AT MOST one substitution', swappedIn.length <= 1 && swappedOut.length <= 1);
  check('a substitution is a matched pair, never a lone add or drop', swappedIn.length === swappedOut.length);
  check('composition never changes the size of the final set', selected.length === diversity.length);
  check('any substitution carries a stated reason',
    swappedIn.every(c => (compositionReasons[c.storyId] ?? []).length > 0));
}
{
  // Thin field: nothing comparable to swap in. The engine must leave it
  // alone rather than manufacture diversity from weak candidates.
  const candidates = [
    ...Array.from({ length: 6 }, (_, i) => cand({ storyId: `d${i}`, sourceId: 'dominant', trustScore: 95 - i })),
    cand({ storyId: 'weak', sourceId: 'alt-a', trustScore: 5, publishedAt: hoursAgo(200) }),
  ];
  const { diversity, selected } = runPipeline(candidates);
  const swappedIn = selected.filter(c => !diversity.some(d => d.storyId === c.storyId));
  check('no comparable alternative -> no swap (quality floor holds, no fake diversity)',
    swappedIn.length === 0);
}
{
  // Distinct titles on purpose: selectDiverseCandidates also drops
  // near-duplicate TITLES (one representative per event), so a fixture that
  // reused one title would collapse to a single row and this check would
  // measure the dedup filter instead of padding. That dedup is correct
  // behaviour, and is asserted separately below.
  const three = [
    cand({ storyId: 'a', title: 'Banjir di Kelantan' }),
    cand({ storyId: 'b', sourceId: 's2', title: 'Harga minyak naik' }),
    cand({ storyId: 'c', sourceId: 's3', title: 'Pasukan bola menang' }),
  ];
  const { selected } = runPipeline(three);
  check('fewer than 10 eligible candidates -> all shown, never padded', selected.length === 3);
  const rows = computeFieldRanking(three);
  check('the Admin surface pads nothing either', rows.filter(r => r.position != null).length === 3);

  // The flip side: three reports of the SAME event must not fill three of
  // the ten slots. They are still listed for the editor, just not selected.
  const dupes = [
    cand({ storyId: 'd1', title: 'Banjir besar melanda Kelantan' }),
    cand({ storyId: 'd2', sourceId: 's2', title: 'Banjir besar melanda Kelantan' }),
    cand({ storyId: 'd3', sourceId: 's3', title: 'Banjir besar melanda Kelantan' }),
  ];
  const dupeRun = runPipeline(dupes);
  check('near-duplicate coverage of one event takes ONE slot, not three',
    dupeRun.selected.length === 1);
  check('the ones not selected are still visible to the editor, not hidden',
    computeFieldRanking(dupes).length === 3);
}

console.log('\n-- Pin --');
{
  const candidates = [
    cand({ storyId: 'p1', pinned: true, pinnedAt: hoursAgo(200), trustScore: 1, publishedAt: hoursAgo(300) }),
    cand({ storyId: 'p2', pinned: true, pinnedAt: hoursAgo(150), trustScore: 1, publishedAt: hoursAgo(300) }),
    ...Array.from({ length: 12 }, (_, i) => cand({ storyId: `c${i}`, sourceId: `s${i}`, title: `Judul ${i}`, trustScore: 90 - i })),
  ];
  const rows = computeFieldRanking(candidates);
  const final = rows.filter(r => r.position != null).sort((a, b) => a.position - b.position);
  check('two Pins hold positions 1 and 2',
    final[0]?.storyId === 'p1' && final[1]?.storyId === 'p2');
  check('Pins outrank every scored candidate despite the WORST scores in the field',
    final[0].status === 'Dikekalkan editor' && final[1].status === 'Dikekalkan editor');
  check('the final set is a continuous 1..10 with the Pins included',
    final.length === 10 && final.every((r, i) => r.position === i + 1));
  const third = computeFieldRanking([...candidates, cand({ storyId: 'p3', pinned: true, pinnedAt: hoursAgo(10) })]);
  check('a third Pin is not honoured as a Pin, and is not silently discarded either',
    third.find(r => r.storyId === 'p3')?.status !== 'Dikekalkan editor'
    && third.some(r => r.storyId === 'p3'));
}
{
  // Source assertions: the mounted admin surface must offer BOTH directions.
  // The unpin path was lost twice before (8D-A.1) precisely because nothing
  // checked the live surface.
  const panel = readFileSync(new URL('../ui/src/admin/AllStoriesPanel.jsx', import.meta.url), 'utf8');
  const adminApp = readFileSync(new URL('../ui/src/admin/AdminApp.jsx', import.meta.url), 'utf8');
  check('[source] mounted UI can CREATE a pin', /submitPinOverride\(/.test(panel));
  check('[source] mounted UI can REMOVE a pin', /unpinOverride\(/.test(panel) && /Nyahpin/.test(panel));
  check('[source] the panel carrying both is the one AdminApp actually mounts', /<AllStoriesPanel/.test(adminApp));
}

console.log('\n-- Boost: OFF for V1 --');
{
  const panel = readFileSync(new URL('../ui/src/admin/AllStoriesPanel.jsx', import.meta.url), 'utf8');
  const adminApp = readFileSync(new URL('../ui/src/admin/AdminApp.jsx', import.meta.url), 'utf8');
  const adapter = readFileSync(new URL('../ui/src/admin/reviewQueueAdapter.js', import.meta.url), 'utf8');
  check('BOOST_WEIGHT is 0', BOOST_WEIGHT === 0);
  const boosted = scoreCandidates([cand({ storyId: 'b', boosted: true })])[0];
  const plain = scoreCandidates([cand({ storyId: 'b' })])[0];
  check('a boosted candidate scores identically to an unboosted one', boosted.score === plain.score);
  check('boost is not surfaced as a reason while it contributes nothing',
    !(boosted.reasons ?? []).includes('editorial_boost'));
  check('[source] no mounted CREATE path for boost',
    !/submitBoostOverride/.test(panel) && !/submitBoostOverride/.test(adminApp));
  check('[source] the backend/data model is preserved for the future',
    /export async function submitBoostOverride/.test(adapter));
}

console.log('\n-- Placement: subject decided first, display may differ --');
{
  const row = {
    source_id: 'rss-awani-politik', title: 'Kongres lulus undang-undang',
    description: 'Parlimen.', link: 'https://www.astroawani.com/berita-politik/kongres-lulus',
    categories: ['dunia'], source_known_category: 'dunia', published_at: '2026-08-17T00:00:00Z',
  };
  const u = understandStory(row);
  check('the classifier decides the SUBJECT is Politics, independent of geography',
    u.subject_candidates[0]?.value === 'Politics');

  const builtIn = classifyForAllEditions(u, undefined, row, []);
  check('with no admin rule, foreign Politics still DISPLAYS under Dunia (built-in default)',
    builtIn['ms-MY'].field_code === 'dunia'
    && builtIn['ms-MY'].classification_rule === 'foreign_politics_to_world');
  check('placement changes the DISPLAY field without rewriting the detected subject',
    builtIn['ms-MY'].subject_code === 'Politics');

  const adminRule = {
    id: 'admin-wins', edition_id: 'ms-MY', condition_subject: 'Politics',
    condition_geography_type: 'not', condition_geography_value: 'Malaysia',
    action_field_code: 'nasional', priority: 1, status: 'active',
  };
  const withAdmin = classifyForAllEditions(u, undefined, row, [], [adminRule]);
  check('an admin placement rule OVERRIDES the built-in default',
    withAdmin['ms-MY'].field_code === 'nasional'
    && withAdmin['ms-MY'].classification_rule === 'admin-wins');
}
{
  // K1 honesty: the page must not imply a saved rule is already live.
  const manager = readFileSync(new URL('../ui/src/admin/EditionRulesManager.jsx', import.meta.url), 'utf8');
  check('[source] the placement page states rules apply at the NEXT classification run',
    /pengelasan seterusnya/.test(manager) && /tidak mengubah paparan pembaca serta-merta/.test(manager));
  check('[source] no "apply now" control was invented', !/Terapkan sekarang/i.test(manager));
}

console.log(`\n${passed} passed, ${failed} failed.`);
console.log('\nMANUAL UAT still owed by Izzat (cannot be automated here):');
console.log('  1. Production Pin: pin a low-scoring story in Admin, confirm it takes #1, then Nyahpin and confirm restore.');
console.log('  2. Visual: the rewritten Penempatan Berita table/form renders correctly (many CSS/layout changes).\n');
if (failed > 0) process.exit(1);
