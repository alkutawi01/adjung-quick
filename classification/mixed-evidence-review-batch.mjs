// mixed-evidence-review-batch.mjs — Sesi 3B.2C-2, per ChatGPT: the "mixed"
// bucket (2+ evidence tiers agreeing on the top subject candidate) is 58%
// of the corpus and the likely real foundation of production
// classification — review it before the smaller url_path/rss_category-only
// buckets. Read-only, no engine/taxonomy/threshold changes.
//
// Batch M: 30 stratified samples from the mixed bucket —
//   10 "subject"   — clean mixed-evidence subject candidate, no conflict
//   10 "geography" — mixed-evidence subject AND geography candidate also
//                    multi-tier (testing whether geography agreement holds too)
//   10 "conflict"  — mixed-evidence subject but a close second candidate
//                    (genuine ambiguity or a real conflict)
//
// Run: node classification/mixed-evidence-review-batch.mjs

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

const mixed = [];
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) continue;
  const tiers = [...new Set(top.evidence.map(e => tierOf(e.evidence_type)))];
  if (tiers.length <= 1) continue; // not mixed

  const second = understanding.subject_candidates[1];
  const conflict = !!(second && (top.confidence - second.confidence) <= 0.15);
  const topGeo = understanding.geography_candidates[0];
  const geoTiers = topGeo ? [...new Set(topGeo.evidence.map(e => tierOf(e.evidence_type)))] : [];
  const geoAlsoMixed = geoTiers.length > 1;

  mixed.push({ item, understanding, top, topGeo, conflict, geoAlsoMixed });
}

const conflictGroup = mixed.filter(m => m.conflict).slice(0, 10);
const conflictKeys = new Set(conflictGroup.map(m => m.item.title));
const geoGroup = mixed.filter(m => !conflictKeys.has(m.item.title) && m.geoAlsoMixed).slice(0, 10);
const geoKeys = new Set(geoGroup.map(m => m.item.title));
const subjectGroup = mixed.filter(m => !conflictKeys.has(m.item.title) && !geoKeys.has(m.item.title)).slice(0, 10);

console.log(`\nBATCH M — MIXED EVIDENCE REVIEW — Sesi 3B.2C-2 (${mixed.length} total mixed items in corpus)\n`);

function printGroup(name, group) {
  console.log(`\n=== ${name} (${group.length}) ===`);
  console.log('| Story | Evidence | Candidate | editor_judgement |');
  console.log('|---|---|---|---|');
  for (const m of group) {
    const evidenceStr = m.top.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ');
    const candidateStr = m.conflict
      ? `${m.top.value}@${m.top.confidence} vs ${m.understanding.subject_candidates[1].value}@${m.understanding.subject_candidates[1].confidence}`
      : `${m.top.value}@${m.top.confidence}`;
    console.log(`| ${m.item.title.slice(0, 55).replace(/\|/g, '/')} | ${evidenceStr} | ${candidateStr} | ____ |`);
  }
}

printGroup('subject (clean mixed, no conflict)', subjectGroup);
printGroup('geography (subject AND geography both multi-tier)', geoGroup);
printGroup('conflict (close second candidate)', conflictGroup);
