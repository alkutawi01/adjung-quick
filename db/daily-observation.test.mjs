// daily-observation.test.mjs — tests the ALERT LOGIC of
// db/daily-observation.mjs in isolation, with synthetic before/after
// observations. No database access (importing the module must not run
// its main(), guarded by the isDirectRun check there).
//
// Why this is worth testing: an alert that fails silently is worse than
// no alert, because it creates false confidence that something is being
// watched. These cases encode the thresholds from
// docs/post-launch-monitoring-plan-v1.md §2-3 so a future edit can't
// quietly loosen them.
//
// Run: node db/daily-observation.test.mjs

import { evaluateAlerts } from './daily-observation.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const baseEditions = {
  'ms-MY': { total: 100, classified: 95, unclassified: 5, fields: { Politik: 30, Bencana: 8, Sains: 2 } },
  'en-global': { total: 50, classified: 40, unclassified: 10, fields: { Politics: 20 } },
  'ar-global': { total: 20, classified: 15, unclassified: 5, fields: { 'سياسة': 15 } },
};

function makeObservation(overrides = {}) {
  return {
    observedAt: '2026-08-13T00:00:00.000Z',
    counts: { sources: 43, sourcesContributing: 41, clusters: 900, items: 950, placements: 870, savedStories: 0, historyEntries: 0 },
    silentSources: [],
    knownBrokenSources: [],
    editions: JSON.parse(JSON.stringify(baseEditions)),
    rankingPilots: {
      'ms-MY.politics': { version: 'editorial_v1', candidatePoolSize: 36, selectedStoryIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] },
    },
    ...overrides,
  };
}

console.log('\nDAILY OBSERVATION — alert logic test\n');

// --- healthy day: growth, nothing broken, no user data yet ---
{
  const previous = makeObservation({ counts: { ...makeObservation().counts, clusters: 865 } });
  const alerts = evaluateAlerts(makeObservation(), previous);
  assert('healthy day (clusters grew, no drops) produces NO alerts', alerts.length === 0, JSON.stringify(alerts));
}

// --- ingestion stall: clusters flat ---
{
  const previous = makeObservation();
  const alerts = evaluateAlerts(makeObservation(), previous);
  assert('flat cluster count raises an ingestion-stall alert', alerts.some(a => /did not grow/i.test(a)), JSON.stringify(alerts));
}

// --- a populated field collapsing to zero ---
{
  const previous = makeObservation();
  const current = makeObservation();
  delete current.editions['ms-MY'].fields.Bencana; // 8 -> 0
  const alerts = evaluateAlerts(current, previous);
  assert('a field with >=3 stories dropping to zero raises an alert', alerts.some(a => /Bencana.*ZERO/i.test(a)), JSON.stringify(alerts));
}

// --- a genuinely tiny field disappearing should NOT alarm ---
{
  const previous = makeObservation();
  const current = makeObservation();
  current.counts.clusters = 950;
  delete current.editions['ms-MY'].fields.Sains; // only 2 -> 0, below the >=3 bar
  const alerts = evaluateAlerts(current, previous);
  assert('a field with only 2 stories dropping to zero does NOT alert (normal for niche fields)', !alerts.some(a => /Sains/i.test(a)), JSON.stringify(alerts));
}

// --- unclassified spike ---
{
  const previous = makeObservation();
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  current.editions['ms-MY'].unclassified = 40; // 5 -> 40
  const alerts = evaluateAlerts(current, previous);
  assert('a sharp unclassified jump raises an alert', alerts.some(a => /unclassified jumped/i.test(a)), JSON.stringify(alerts));
}

// --- small unclassified wobble should NOT alert ---
{
  const previous = makeObservation();
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  current.editions['ms-MY'].unclassified = 9; // 5 -> 9: proportionally large, but only +4 absolute
  const alerts = evaluateAlerts(current, previous);
  assert('a small absolute unclassified wobble does NOT alert', !alerts.some(a => /unclassified jumped/i.test(a)), JSON.stringify(alerts));
}

// --- Trigger B: real user data appears ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950, savedStories: 3 } });
  const alerts = evaluateAlerts(current, makeObservation());
  assert('real user data fires the Supabase upgrade Trigger B alert', alerts.some(a => /TRIGGER B/i.test(a)), JSON.stringify(alerts));
}

// --- known-broken sources must NOT alert (the noise problem) ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 }, knownBrokenSources: ['rss-jakim-berita'] });
  const alerts = evaluateAlerts(current, makeObservation({ knownBrokenSources: ['rss-jakim-berita'] }));
  assert('a source already marked broken in the registry does NOT alert', !alerts.some(a => /jakim/i.test(a)), JSON.stringify(alerts));
}

// --- an ACTIVE source going silent MUST alert ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 }, silentSources: ['rss-astro-awani'] });
  const alerts = evaluateAlerts(current, makeObservation());
  assert('an active source contributing zero items DOES alert', alerts.some(a => /rss-astro-awani/.test(a)), JSON.stringify(alerts));
}

// --- a broken source recovering should be surfaced ---
{
  const previous = makeObservation({ knownBrokenSources: ['rss-jakim-berita'] });
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  const alerts = evaluateAlerts(current, previous);
  assert('a previously-broken source now producing items is surfaced (registry status is stale)', alerts.some(a => /now producing items/i.test(a)), JSON.stringify(alerts));
}

// --- ranking pilot: ordinary churn must NOT alert ---
{
  const previous = makeObservation();
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  // Entirely different selection — normal for a news reader over a day.
  current.rankingPilots['ms-MY.politics'].selectedStoryIds = ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'];
  const alerts = evaluateAlerts(current, previous);
  assert('a completely changed ranking selection does NOT alert (churn is normal)', !alerts.some(a => /Ranking pilot/i.test(a)), JSON.stringify(alerts));
}

// --- ranking pilot: empty candidate pool IS structurally wrong ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  current.rankingPilots['ms-MY.politics'] = { version: 'editorial_v1', candidatePoolSize: 0, selectedStoryIds: [] };
  const alerts = evaluateAlerts(current, makeObservation());
  assert('an empty ranking candidate pool DOES alert', alerts.some(a => /EMPTY candidate pool/i.test(a)), JSON.stringify(alerts));
}

// --- ranking pilot: candidates exist but nothing selected = broken ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  current.rankingPilots['ms-MY.politics'] = { version: 'editorial_v1', candidatePoolSize: 36, selectedStoryIds: [] };
  const alerts = evaluateAlerts(current, makeObservation());
  assert('selecting nothing despite available candidates DOES alert (selection broken)', alerts.some(a => /selected nothing/i.test(a)), JSON.stringify(alerts));
}

// --- ranking pilot: evaluation failure must surface, not vanish ---
{
  const current = makeObservation({ counts: { ...makeObservation().counts, clusters: 950 } });
  current.rankingPilots['ms-MY.politics'] = { version: 'editorial_v1', error: 'fetch failed' };
  const alerts = evaluateAlerts(current, makeObservation());
  assert('a ranking pilot evaluation error surfaces as an alert', alerts.some(a => /failed to evaluate/i.test(a)), JSON.stringify(alerts));
}

// --- first-ever run: no previous observation, must not crash ---
{
  const alerts = evaluateAlerts(makeObservation(), null);
  assert('first run with no previous observation does not crash and raises no diff alerts', Array.isArray(alerts) && alerts.length === 0, JSON.stringify(alerts));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
