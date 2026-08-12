// audit-tier-reliability.mjs — Sesi 3B.2C-1 follow-up, per ChatGPT: before
// any low_confidence_action gets locked, establish whether Tiers 1-4
// (publisher_declared, url_path, rss_category) actually deserve to be
// "trusted signals" the way Tier 5 (title_keyword) clearly does not.
// Read-only — no engine, taxonomy, or rule changes.
//
// Answers: Evidence Tier | Count | Manual accuracy (sample provided,
// judgment left to a human — not fabricated by the engine).
//
// Run: node classification/audit-tier-reliability.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

console.log(`\nTIER RELIABILITY AUDIT — Sesi 3B.2C-1, ${items.length} real items\n`);

// Bucket every item by its TOP subject candidate's evidence-tier composition.
// "tier" here maps evidence_type -> tier per story-understanding.mjs:
// feed_category/title_prefix -> publisher_declared, url_segment -> url_path,
// rss_category -> rss_category, title_keyword -> title_keyword.
function tierOf(evidenceType) {
  if (evidenceType === 'feed_category' || evidenceType === 'title_prefix') return 'publisher_declared';
  if (evidenceType === 'url_segment') return 'url_path';
  if (evidenceType === 'rss_category') return 'rss_category';
  if (evidenceType === 'title_keyword') return 'title_keyword';
  return 'unknown';
}

const buckets = { publisher_declared: [], url_path: [], rss_category: [], title_keyword: [], mixed: [], none: 0 };

for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) { buckets.none++; continue; }
  const tiers = [...new Set(top.evidence.map(e => tierOf(e.evidence_type)))];
  const bucketKey = tiers.length > 1 ? 'mixed' : tiers[0];
  buckets[bucketKey].push({ item, top });
}

console.log('Evidence Tier          Count   Share of classified   Manual accuracy');
console.log('---------------------------------------------------------------------');
const classifiedTotal = items.length - buckets.none;
for (const tier of ['publisher_declared', 'url_path', 'rss_category', 'title_keyword', 'mixed']) {
  const count = buckets[tier].length;
  const share = classifiedTotal ? Math.round(count / classifiedTotal * 100) : 0;
  const priorNote = tier === 'publisher_declared'
    ? '0.98-0.99 (confirmed, sesi3a2 30-item manual sample: 10 Business + 10 Sports, all correct)'
    : tier === 'title_keyword'
    ? 'LOW (confirmed, sesi3a2: 3 documented false positives — menteri/mahkamah/court bare-word matches)'
    : '? — see sample below, not yet manually judged';
  console.log(`${tier.padEnd(22)} ${String(count).padEnd(7)} ${String(share + '%').padEnd(21)} ${priorNote}`);
}
console.log(`${'no candidate'.padEnd(22)} ${buckets.none}`);

// Manual-review sample for the two tiers without prior manual judgment:
// url_path-only and rss_category-only. Up to 15 each — small enough to
// review by hand, per the same discipline as Batch A/A2 (no fabricated
// ground truth).
for (const tier of ['url_path', 'rss_category']) {
  const sample = buckets[tier].slice(0, 15);
  console.log(`\n\n${tier.toUpperCase()}-ONLY SAMPLE — ${sample.length}/${buckets[tier].length} for manual review (accuracy column left blank)`);
  console.log('| # | Story | subject@conf | evidence | manually_correct? |');
  console.log('|---|---|---|---|---|');
  sample.forEach((s, i) => {
    const evidenceStr = s.top.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ');
    console.log(`| ${i + 1} | ${s.item.title.slice(0, 55).replace(/\|/g, '/')} | ${s.top.value}@${s.top.confidence} | ${evidenceStr} | ____ |`);
  });
}
