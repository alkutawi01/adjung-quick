// test.js — Regression suite for the Editorial Ranking Laboratory engine.
// Per ChatGPT (director) directive, 2026-08-11: this is the baseline that
// must keep passing as the engine evolves toward production. If a future
// change breaks one of these, that's a signal to stop and look — not to
// "fix the test".
//
// Usage: node lab/test.js
// Runs against REAL RSS data (matches how this was actually proven tonight,
// not synthetic fixtures) — some tests are adaptive (they find a suitable
// real item at runtime) rather than asserting on exact fabricated data.

import { RSS_SOURCES } from './sources.js';
import { fetchFeed } from './rss.js';
import { buildRankedQueue, dedupeAndCluster, selectActiveSet, selectActiveSetWithControl } from './engine.js';
import { createEditorialControl } from './control.js';
import { tokenize, jaccardSimilarity } from './match.js';
import { deterministicFixtureItems } from './testFixtures.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function main() {
  console.log('Fetching real RSS data for regression suite...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const liveItems = results.filter(r => r.ok).flatMap(r => r.items);
  const allItems = liveItems.length >= 50 ? liveItems : deterministicFixtureItems();

  if (liveItems.length < 50) {
    console.log(`Only ${liveItems.length} live items fetched — using deterministic fixture for engine regression assertions. Check network/sources for the live RSS smoke check.`);
  } else {
    console.log(`${liveItems.length} items fetched from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);
  }

  // --- TEST 1: Tier-0 exact duplicate detected ---
  {
    const a = allItems[0];
    const dupe = { ...a, title: a.title + ' ' }; // same guid/url, trivial variation
    const clusters = dedupeAndCluster([a, dupe]);
    assert('TEST 1 — Tier-0 exact duplicate detected', clusters.length === 1,
      `expected 1 cluster, got ${clusters.length}`);
  }

  // --- TEST 2: Cross-source title match gets clustered ---
  {
    const a = { ...allItems[0], sourceId: 'src-a', rssGuid: 'guid-a', normalizedUrl: 'example.com/a', title: 'Government announces new education policy today' };
    const b = { ...allItems[0], sourceId: 'src-b', rssGuid: 'guid-b', normalizedUrl: 'example.com/b', title: 'New education policy announced by government today' };
    const clusters = dedupeAndCluster([a, b]);
    assert('TEST 2 — cross-source title match clustered', clusters.length === 1 && clusters[0].sourceIds.size === 2,
      `expected 1 cluster with 2 sources, got ${clusters.length} cluster(s)`);
  }

  // --- TEST 3: Genuinely different stories stay separate ---
  {
    const a = { ...allItems[0], sourceId: 'src-a', rssGuid: 'guid-x', normalizedUrl: 'example.com/x', title: 'Prime Minister opens new hospital in Kuala Lumpur' };
    const b = { ...allItems[0], sourceId: 'src-b', rssGuid: 'guid-y', normalizedUrl: 'example.com/y', title: 'Stock market falls sharply amid inflation fears' };
    const clusters = dedupeAndCluster([a, b]);
    assert('TEST 3 — different stories NOT clustered', clusters.length === 2,
      `expected 2 separate clusters, got ${clusters.length}`);
  }

  // --- TEST 4: Cross-source count feeds Editorial Score ---
  {
    const now = new Date();
    const a = { ...allItems[0], sourceId: 'src-a', rssGuid: 'guid-p', normalizedUrl: 'example.com/p', title: 'Earthquake strikes capital city overnight', publishedAt: now.toISOString(), trustScore: 90 };
    const single = buildRankedQueue([a], now);
    const b = { ...a, sourceId: 'src-b', rssGuid: 'guid-q', normalizedUrl: 'example.com/q', title: 'Overnight earthquake strikes the capital city' };
    const multi = buildRankedQueue([a, b], now);
    assert('TEST 4 — cross-source count raises Editorial Score', multi[0].editorialScore > single[0].editorialScore,
      `single=${single[0].editorialScore} multi=${multi[0].editorialScore}`);
  }

  // --- TEST 5: Existing Active Set + new RSS arrival = unchanged ---
  {
    const rankedQueue = buildRankedQueue(allItems);
    const control = createEditorialControl();
    const activeSet = selectActiveSetWithControl(rankedQueue, control, 10, []);
    // Simulate new RSS arriving: re-run selector with the SAME existingActiveSet.
    const afterNewRss = selectActiveSetWithControl(rankedQueue, control, 10, activeSet);
    const unchanged = afterNewRss.length === activeSet.length &&
      afterNewRss.every((c, i) => c.clusterKey === activeSet[i].clusterKey);
    assert('TEST 5 — Active Set unchanged when re-run with no open slots', unchanged);

    // --- TEST 6: Pin while full -> Pin-Pending, no eviction ---
    const activeKeys = new Set(activeSet.map(c => c.clusterKey));
    const pinTarget = rankedQueue.find(c => !activeKeys.has(c.clusterKey));
    control.pin(pinTarget.clusterKey);
    const stillFull = selectActiveSetWithControl(rankedQueue, control, 10, activeSet);
    const stillUnchanged = stillFull.every((c, i) => c.clusterKey === activeSet[i].clusterKey);
    const pending = control.pinPendingQueue().includes(pinTarget.clusterKey);
    assert('TEST 6 — Pin while full goes to Pin-Pending, no eviction', stillUnchanged && pending);

    // --- TEST 7: Release slot -> pinned item fills it, others untouched ---
    const nineRemain = stillFull.slice(0, -1);
    const filled = selectActiveSetWithControl(rankedQueue, control, 10, nineRemain);
    const first9Untouched = filled.slice(0, 9).every((c, i) => c.clusterKey === nineRemain[i].clusterKey);
    const pinFilled = filled[9]?.clusterKey === pinTarget.clusterKey && filled[9]?.selectionReason === 'pin_pending';
    assert('TEST 7 — released slot filled by pinned item, others untouched', first9Untouched && pinFilled);

    // --- TEST 8: Prioritize changes selection ---
    const freshControl = createEditorialControl();
    const withoutPriority = selectActiveSetWithControl(rankedQueue, createEditorialControl(), 10, []);
    const lowRanked = rankedQueue.find(c => !withoutPriority.some(a => a.clusterKey === c.clusterKey));
    freshControl.prioritize(lowRanked.clusterKey);
    const withPriority = selectActiveSetWithControl(rankedQueue, freshControl, 10, []);
    const nowIncluded = withPriority.some(c => c.clusterKey === lowRanked.clusterKey);
    assert('TEST 8 — Prioritize changes selection outcome', nowIncluded,
      'prioritized item still excluded — boost may be too weak for this dataset (expected occasionally, not a hard failure)');

    // --- TEST 9: Remove excludes without deleting ---
    const removeControl = createEditorialControl();
    const toRemove = rankedQueue[0];
    removeControl.remove(toRemove.clusterKey);
    const afterRemove = selectActiveSetWithControl(rankedQueue, removeControl, 10, []);
    const excluded = !afterRemove.some(c => c.clusterKey === toRemove.clusterKey);
    const clusterStillExists = rankedQueue.some(c => c.clusterKey === toRemove.clusterKey);
    assert('TEST 9 — Remove excludes from selection, cluster still exists', excluded && clusterStillExists);

    // --- TEST 10: existingActiveSet array identity never mutated in place ---
    const before = JSON.stringify(activeSet.map(c => c.clusterKey));
    selectActiveSetWithControl(rankedQueue, createEditorialControl(), 10, activeSet);
    const after = JSON.stringify(activeSet.map(c => c.clusterKey));
    assert('TEST 10 — existingActiveSet never mutated/reordered by selector', before === after);
  }

  // --- Bonus: tokenize/jaccard sanity (used by Tier-1) ---
  {
    const sim = jaccardSimilarity(tokenize('Prime Minister opens new hospital'), tokenize('Hospital opened by Prime Minister'));
    assert('BONUS — Jaccard similarity symmetric-ish for reordered words', sim > 0.5, `sim=${sim}`);
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Regression suite crashed:', err);
  process.exit(1);
});
