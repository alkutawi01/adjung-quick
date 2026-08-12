// generate-batch-a2.mjs — Sesi 3B.2C-1, per ChatGPT's follow-up correction:
// Batch A was biased toward "false-positive candidate generation" cases
// (e.g. Crime tagged purely from a passing "mahkamah" mention), which only
// tests whether fallback cleans up already-wrong candidates. The real risk
// — does fallback hurt a candidate that's correct but genuinely weak? —
// needs a differently-filtered sample: "Batch A2 — Genuine Weak Subject
// Cases". Read-only, no code changes, no threshold locked.
//
// Filter (per ChatGPT):
// 1. subject confidence < 0.6
// 2. subject evidence is NOT solely a title_keyword hit (excludes the
//    known content-rule false-positive pattern — a real signal exists,
//    even if it's still not strong enough alone)
// 3. a subject candidate exists at all
// 4. a geography candidate also exists (so fallback is actually possible)
// 5. resolver result changes as threshold rises 0.4 -> 0.8
//
// Run: node classification/generate-batch-a2.mjs

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

  if (!top || top.confidence >= 0.6) continue; // filter 1 + 3
  const onlyKeywordEvidence = top.evidence.every(e => e.evidence_type === 'title_keyword');
  if (onlyKeywordEvidence) continue; // filter 2 — excludes the false-positive-generation pattern
  if (!topGeo) continue; // filter 4

  const at04 = classifyForAllEditions(understanding, 0.4)['ms-MY'];
  const at08 = classifyForAllEditions(understanding, 0.8)['ms-MY'];
  const changed = at04.field !== at08.field || at04.classification_method !== at08.classification_method;
  if (!changed) continue; // filter 5

  candidates.push({ item, top, topGeo, at04, at08 });
}

console.log(`Batch A2 — Genuine Weak Subject Cases: ${candidates.length} matches (of ${items.length} total corpus)\n`);
console.log('| # | Story | subject@conf | evidence | geography@conf | Engine (0.6) | 0.4 -> 0.8 |');
console.log('|---|---|---|---|---|---|---|');
candidates.forEach((c, i) => {
  const at06 = classifyForAllEditions(understandStory(c.item), 0.6)['ms-MY'];
  const evidenceStr = c.top.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ');
  console.log(`| ${i + 1} | ${c.item.title.slice(0, 55).replace(/\|/g, '/')} | ${c.top.value}@${c.top.confidence} | ${evidenceStr} | ${c.topGeo.value}@${c.topGeo.confidence} | ${at06.field ?? 'unclassified'} (${at06.classification_method}) | ${c.at04.field}(${c.at04.classification_method}) -> ${c.at08.field}(${c.at08.classification_method}) |`);
});
