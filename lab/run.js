// run.js — Editorial Ranking Laboratory entry point.
// Usage: node lab/run.js
//
// This is NOT the production engine. It exists to answer one question with
// real RSS data: does the Editorial Score + coverage-first Active Set
// Selector produce a 10-item set that looks reasonable — before we spend
// time building Pin/Prioritize/Remove, aging boost, or near-duplicate
// clustering that nothing has proven necessary yet.

import { RSS_SOURCES } from './sources.js';
import { fetchFeed } from './rss.js';
import { buildRankedQueue, selectActiveSet } from './engine.js';

const ACTIVE_SET_CAPACITY = 10;

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

async function main() {
  console.log(`\nFetching ${RSS_SOURCES.length} sources...\n`);

  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));

  const allItems = [];
  for (const r of results) {
    const status = r.ok ? `${r.items.length} items` : `FAILED (${r.error})`;
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.source.name.padEnd(24)} ${status}`);
    if (r.ok) allItems.push(...r.items);
  }

  if (allItems.length === 0) {
    console.log('\nNo items fetched — check network access / feed URLs. Stopping.\n');
    return;
  }

  const rankedQueue = buildRankedQueue(allItems);
  const activeSet = selectActiveSet(rankedQueue, ACTIVE_SET_CAPACITY);

  console.log(`\n${allItems.length} raw items -> ${rankedQueue.length} deduped clusters (Tier-0 exact-match + Tier-1 title-similarity, threshold 0.25)\n`);

  console.log('=== RANKED QUEUE (top 20 by Editorial Score) ===\n');
  console.log('#'.padEnd(4) + 'Score'.padEnd(7) + 'Topic'.padEnd(14) + 'Src'.padEnd(5) + 'Age(h)'.padEnd(8) + 'Title');
  rankedQueue.slice(0, 20).forEach((c, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      String(c.editorialScore).padEnd(7) +
      c.topic.padEnd(14) +
      String(c.scoreBreakdown.sourceCount).padEnd(5) +
      String(c.ageHours).padEnd(8) +
      truncate(c.canonical.title, 60)
    );
  });

  console.log(`\n=== SIMULATED ACTIVE SET (${activeSet.length}/${ACTIVE_SET_CAPACITY} slots) ===\n`);
  console.log('#'.padEnd(4) + 'Score'.padEnd(7) + 'Topic'.padEnd(14) + 'Why'.padEnd(18) + 'Title');
  activeSet.forEach((c, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      String(c.editorialScore).padEnd(7) +
      c.topic.padEnd(14) +
      c.selectionReason.padEnd(18) +
      truncate(c.canonical.title, 55)
    );
  });

  const topicCounts = {};
  activeSet.forEach(c => { topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1; });
  console.log('\nTopic distribution in Active Set:', topicCounts);
  console.log('');
}

main().catch(err => {
  console.error('Laboratory run failed:', err);
  process.exit(1);
});
