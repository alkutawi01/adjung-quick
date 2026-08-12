// generate-batch-u.mjs — Sesi 3B.2C-2, Batch U: url_path-only and
// rss_category-only candidates, per ChatGPT's instruction to answer
// "can url_path/rss_category alone be trusted without content agreement?"
// Read-only, no engine/taxonomy/threshold changes.
//
// Run: node classification/generate-batch-u.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

function tierOf(evidenceType) {
  if (evidenceType === 'feed_category' || evidenceType === 'title_prefix') return 'publisher_declared';
  if (evidenceType === 'url_segment') return 'url_path';
  if (evidenceType === 'rss_category') return 'rss_category';
  if (evidenceType === 'title_keyword') return 'title_keyword';
  return 'unknown';
}

const buckets = { url_path: [], rss_category: [] };
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) continue;
  const tiers = [...new Set(top.evidence.map(e => tierOf(e.evidence_type)))];
  if (tiers.length !== 1) continue;
  if (buckets[tiers[0]]) buckets[tiers[0]].push({ item, top });
}

console.log(`\nBATCH U — URL/RSS-ONLY REVIEW — Sesi 3B.2C-2\n`);
for (const key of ['url_path', 'rss_category']) {
  console.log(`\n=== ${key}-only (${buckets[key].length}) ===`);
  console.log('| # | source | Story | evidence | candidate@conf | editorial_judgement |');
  console.log('|---|---|---|---|---|---|');
  buckets[key].forEach((s, i) => {
    const ev = s.top.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ');
    console.log(`| ${i + 1} | ${s.item.sourceName} | ${s.item.title.slice(0, 55).replace(/\|/g, '/')} | ${ev} | ${s.top.value}@${s.top.confidence} | ____ |`);
  });
}
