// run-match.js — Tier-1A experiment entry point.
// Usage: node lab/run-match.js
//
// Fetches the same real RSS sources, runs Tier-0 dedup, then Tier-1A
// deterministic title-similarity matching, and writes candidate pairs to
// a CSV with a blank "human_verdict" column for Izzat to fill in
// (Same / Different / Uncertain). Once labelled, precision/recall can be
// measured — that decides whether Tier-1B (MinHash+LSH) is justified.

import fs from 'node:fs';
import { RSS_SOURCES } from './sources.js';
import { fetchFeed } from './rss.js';
import { dedupeAndCluster } from './engine.js';
import { findStoryMatchCandidates } from './match.js';

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

async function main() {
  console.log(`\nFetching ${RSS_SOURCES.length} sources...\n`);
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));

  const allItems = [];
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.source.name.padEnd(24)} ${r.ok ? r.items.length + ' items' : 'FAILED (' + r.error + ')'}`);
    if (r.ok) allItems.push(...r.items);
  }

  const clusters = dedupeAndCluster(allItems);
  console.log(`\n${allItems.length} raw items -> ${clusters.length} Tier-0 clusters\n`);

  const candidates = findStoryMatchCandidates(clusters);
  console.log(`Tier-1A found ${candidates.length} candidate story-match pairs (similarity >= 0.15, within 48h)\n`);

  if (candidates.length === 0) {
    console.log('No candidates found — nothing to label.\n');
    return;
  }

  const header = ['similarity', 'time_diff_hours', 'source_a', 'title_a', 'source_b', 'title_b', 'shared_tokens', 'human_verdict'];
  const rows = candidates.map(c => [
    c.similarity, c.timeDiffHours, c.sourceA, c.titleA, c.sourceB, c.titleB, c.sharedTokens.join(' | '), '',
  ]);

  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const outPath = new URL('./story-match-candidates.csv', import.meta.url);
  fs.writeFileSync(outPath, csv, 'utf-8');

  console.log(`Written to lab/story-match-candidates.csv`);
  console.log(`Isi lajur "human_verdict" dengan Same / Different / Uncertain untuk setiap baris.\n`);

  console.log('=== PREVIEW (top 15 by similarity) ===\n');
  candidates.slice(0, 15).forEach((c, i) => {
    console.log(`${i + 1}. [${c.similarity}] ${c.sourceA} vs ${c.sourceB} (${c.timeDiffHours}h apart)`);
    console.log(`   A: ${c.titleA}`);
    console.log(`   B: ${c.titleB}`);
    console.log(`   shared: ${c.sharedTokens.join(', ')}\n`);
  });
}

main().catch(err => {
  console.error('Tier-1A experiment failed:', err);
  process.exit(1);
});
