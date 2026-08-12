// generate-batch-a.mjs — Sesi 3B.2C-1 editorial review prep, per ChatGPT's
// instruction: "Batch A — 20 Gap-3 paling kritikal. Utamakan: (1) subject
// confidence rendah, (2) geography kuat, (3) hasil resolver berubah akibat
// threshold." Read-only — no code changes, this only selects and formats
// the sample for Izzat/ChatGPT to judge.
//
// Run: node classification/generate-batch-a.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { classifyForAllEditions } from './edition-classification.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

const candidates = [];
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  const topGeo = understanding.geography_candidates[0];
  if (!top || top.confidence >= 0.5) continue; // Gap-3 only: low subject confidence

  const at04 = classifyForAllEditions(understanding, 0.4)['ms-MY'];
  const at08 = classifyForAllEditions(understanding, 0.8)['ms-MY'];
  const changed = at04.field !== at08.field || at04.classification_method !== at08.classification_method;

  candidates.push({
    item, top, topGeo, changed,
    at04, at08,
    // Ranking score: prioritize low subject confidence, strong geography, and threshold-sensitivity.
    score: (0.5 - top.confidence) + (topGeo ? topGeo.confidence : 0) + (changed ? 0.5 : 0),
  });
}

candidates.sort((a, b) => b.score - a.score);
const batchA = candidates.slice(0, 20);

console.log(`Batch A — ${batchA.length} most critical Gap-3 cases (of ${candidates.length} total Gap-3)\n`);
console.log('| # | Story | subject@conf | geography@conf | Engine output (0.6) | Changes 0.4->0.8? |');
console.log('|---|---|---|---|---|---|');
batchA.forEach((c, i) => {
  const at06 = classifyForAllEditions(c.item ? understandStory(c.item) : {}, 0.6)['ms-MY'];
  console.log(`| ${i + 1} | ${c.item.title.slice(0, 60).replace(/\|/g, '/')} | ${c.top.value}@${c.top.confidence} | ${c.topGeo ? `${c.topGeo.value}@${c.topGeo.confidence}` : '-'} | ${at06.field ?? 'unclassified'} (${at06.classification_method}) | ${c.changed ? `YES: ${c.at04.field}(${c.at04.classification_method}) -> ${c.at08.field}(${c.at08.classification_method})` : 'no'} |`);
});
