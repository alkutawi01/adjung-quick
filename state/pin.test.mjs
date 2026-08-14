// pin.test.mjs — FASA 3.6.5. Reducer-level tests for Pin's position +
// membership guarantee (docs/pin-implementation-design-review-v1.md).
//
// Deliberately hand-built fixtures, not a live RSS fetch like state/test.js
// — pin's own logic doesn't need real data, and a fixed fixture makes the
// position/membership/cap assertions deterministic instead of depending on
// whatever happens to be in the feeds this run.
//
// Run: node state/pin.test.mjs

import { createInitialState } from './model.js';
import { reduce } from './reducer.js';
import { selectTopic, releaseStory } from './actions.js';
import { createEditorialControl } from '../lab/control.js';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// A cluster shaped like productionAdapter.js's output — real enough for
// the reducer/representation pipeline to accept it. `rss-kosmo` resolves
// to 'malaysia' scope -> 'ms' preferred language in state/representation.js,
// matching ms-MY (the default edition) so selectRepresentation() succeeds.
function cluster(clusterKey, { topic, editorialScore, pinned = false, pinnedAt = null, hoursAgo = 0 }) {
  const publishedAt = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const member = {
    sourceId: 'rss-kosmo', rssGuid: `g-${clusterKey}`, title: clusterKey, description: '',
    link: `https://example.com/${clusterKey}`, normalizedUrl: `https://example.com/${clusterKey}`,
    language: 'ms', publishedAt, trustScore: 90,
  };
  return {
    clusterKey, topic, boosted: false, pinned, pinnedAt,
    legacyTopic: topic, classificationConfidence: 0.9, editorialScore,
    canonical: member, members: [member], sourceIds: new Set(['rss-kosmo']),
  };
}

console.log('\nPIN — Active Set position + membership guarantee\n');

const control = createEditorialControl();
const state0 = createInitialState(); // ms-MY, capacity 10

// --- TEST 1: membership guarantee — a pinned story with a LOW score
// (would never rank into 10 slots on its own, given 12 competitors) still
// enters the Active Set. ---
{
  const highScoreCompetitors = Array.from({ length: 12 }, (_, i) =>
    cluster(`competitor-${i}`, { topic: 'Politik', editorialScore: 100 - i }));
  const lowScorePin = cluster('pinned-low-score', { topic: 'Politik', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T00:00:00Z' });
  const rankedQueue = [...highScoreCompetitors, lowScorePin];

  const state = reduce(state0, selectTopic('Politik'), { rankedQueue, control, now: new Date().toISOString() });
  const ids = state.activeSet.map(s => s.storyId);

  assert('TEST 1 — a pinned story with the LOWEST score still enters the Active Set',
    ids.includes('pinned-low-score'), `activeSet=${JSON.stringify(ids)}`);
  assert('TEST 1b — position guarantee: the pinned story is at slot 0',
    state.activeSet[0]?.storyId === 'pinned-low-score');
  assert('TEST 1c — capacity still respected (10 slots, not 13)',
    state.activeSet.length <= state0.activeSetCapacity);
}

// --- TEST 2: two pins, ordered oldest-first ---
{
  const rest = Array.from({ length: 5 }, (_, i) => cluster(`rest-${i}`, { topic: 'Sukan', editorialScore: 50 - i }));
  const pinA = cluster('pin-a', { topic: 'Sukan', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T02:00:00Z' }); // newer
  const pinB = cluster('pin-b', { topic: 'Sukan', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T01:00:00Z' }); // older
  const rankedQueue = [...rest, pinA, pinB];

  const state = reduce(state0, selectTopic('Sukan'), { rankedQueue, control, now: new Date().toISOString() });
  assert('TEST 2 — two pins ordered oldest-pin-first regardless of insertion order',
    state.activeSet[0]?.storyId === 'pin-b' && state.activeSet[1]?.storyId === 'pin-a',
    `got=${JSON.stringify(state.activeSet.slice(0, 2).map(s => s.storyId))}`);
}

// --- TEST 3: defensive cap — 3 "pinned" entries reaching the reducer
// (bad/stale data; write-time guard should normally prevent this) must
// never blank the Active Set. Oldest 2 win, third is treated as ranked. ---
{
  const rest = Array.from({ length: 5 }, (_, i) => cluster(`rest3-${i}`, { topic: 'Bisnes', editorialScore: 50 - i }));
  const pins = [
    cluster('pin-3rd', { topic: 'Bisnes', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T03:00:00Z' }),
    cluster('pin-1st', { topic: 'Bisnes', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T01:00:00Z' }),
    cluster('pin-2nd', { topic: 'Bisnes', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T02:00:00Z' }),
  ];
  const rankedQueue = [...rest, ...pins];

  const state = reduce(state0, selectTopic('Bisnes'), { rankedQueue, control, now: new Date().toISOString() });
  const ids = state.activeSet.map(s => s.storyId);
  assert('TEST 3 — defensive cap: only the 2 OLDEST pins get the guarantee',
    ids[0] === 'pin-1st' && ids[1] === 'pin-2nd');
  assert('TEST 3b — the 3rd pin competes normally on score, not guaranteed a slot',
    !ids.slice(0, 2).includes('pin-3rd'),
    `activeSet=${JSON.stringify(ids)}`);
  assert('TEST 3c — Active Set is not blanked by the excess pin', state.activeSet.length > 0);
}

// --- TEST 4: release (reader action) beats pin (editorial action) —
// ChatGPT's confirmed decision. A released story must stay excluded even
// though it's pinned. ---
{
  const rest = Array.from({ length: 3 }, (_, i) => cluster(`rest4-${i}`, { topic: 'Teknologi', editorialScore: 50 - i }));
  const pinned = cluster('pinned-then-released', { topic: 'Teknologi', editorialScore: 99, pinned: true, pinnedAt: '2026-08-13T01:00:00Z' });
  const rankedQueue = [...rest, pinned];

  const afterSelect = reduce(state0, selectTopic('Teknologi'), { rankedQueue, control, now: new Date().toISOString() });
  assert('TEST 4 setup — the pinned story is present before release',
    afterSelect.activeSet.some(s => s.storyId === 'pinned-then-released'));

  const afterRelease = reduce(afterSelect, releaseStory('pinned-then-released'), { rankedQueue, control, now: new Date().toISOString() });
  // Navigate away and back — same mechanism TEST 11b in state/test.js
  // already proves for hide; pin must not be exempt from it.
  const afterAway = reduce(afterRelease, selectTopic('Sukan'), { rankedQueue, control, now: new Date().toISOString() });
  const afterBack = reduce(afterAway, selectTopic('Teknologi'), { rankedQueue, control, now: new Date().toISOString() });

  assert('TEST 4 — a released pinned story does NOT return, even though it is still "pinned"',
    !afterBack.activeSet.some(s => s.storyId === 'pinned-then-released'),
    `activeSet=${JSON.stringify(afterBack.activeSet.map(s => s.storyId))}`);
}

// --- TEST 5: cold start — the exact scenario Audit 2 finding A found
// broken (App.jsx used to bypass this reducer entirely on first load).
// Not re-testable via App.jsx here (that's a browser integration concern,
// verified live in the browser instead — see
// docs/pin-implementation-design-review-v1.md §4 test 7), but this proves
// the UNDERLYING mechanism SELECT_TOPIC now uses for cold start
// (App.jsx's fixed effect calls exactly this reducer path) handles pin
// correctly, which is the structural guarantee the fix provides.
{
  const rest = Array.from({ length: 12 }, (_, i) => cluster(`cold-${i}`, { topic: 'Nasional', editorialScore: 100 - i }));
  const pinned = cluster('cold-start-pin', { topic: 'Nasional', editorialScore: 1, pinned: true, pinnedAt: '2026-08-13T00:00:00Z' });
  const rankedQueue = [...rest, pinned];

  // Simulates App.jsx's cold-start call: reduce() with SELECT_TOPIC on a
  // freshly-created state, exactly as the fixed effect does.
  const cold = createInitialState();
  const state = reduce(cold, selectTopic('Nasional'), { rankedQueue, control, now: new Date().toISOString() });
  assert('TEST 5 — pin applies on the FIRST SELECT_TOPIC call (cold start), not just subsequent ones',
    state.activeSet[0]?.storyId === 'cold-start-pin');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
