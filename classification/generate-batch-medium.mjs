// generate-batch-medium.mjs — Sesi 3B.2C-5, per ChatGPT: the last step
// before locking any confidence/resolver policy. Medium-class evidence
// (rss_category, url_segment — per docs/evidence-quality-matrix-contract.md)
// makes up 147 evidence items in the corpus but has NO manual accuracy
// judgment yet — this generates that review sample. Read-only, no
// engine/taxonomy/threshold changes, editorial_judgement left blank.
//
// Three groups, per ChatGPT's spec (~60 total):
//   - RSS category-only, expanded from Batch U's 11 toward 20
//   - URL path-only, expanded from Batch U's 4 toward 20
//   - Mixed-medium: rss_category + url_segment agreeing, neither Strong
//     nor Weak evidence involved — tests whether two Medium signals
//     together behave like the "mixed" bucket's high reliability, or not.
//
// Run: node classification/generate-batch-medium.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { STRUCTURAL_NOISE, normalizeToken } from './lib/desk-vocabulary.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

function classifyEvidence(evidenceType, value) {
  if (evidenceType === 'feed_category' || evidenceType === 'title_prefix') return 'strong';
  if (evidenceType === 'url_segment' || evidenceType === 'rss_category') {
    if (STRUCTURAL_NOISE.has(normalizeToken(value))) return 'ignored';
    return 'medium';
  }
  if (evidenceType === 'title_keyword') return 'weak';
  return 'unknown';
}

const rssOnly = [], urlOnly = [], mixedMedium = [];
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) continue;
  const classes = top.evidence.map(e => ({ ...e, cls: classifyEvidence(e.evidence_type, e.value) }));
  if (classes.some(c => c.cls === 'strong')) continue; // Medium-only groups exclude Strong entirely
  const mediumEv = classes.filter(c => c.cls === 'medium');
  const weakEv = classes.filter(c => c.cls === 'weak');
  if (mediumEv.length === 0) continue;

  const mechanisms = new Set(mediumEv.map(e => e.evidence_type));
  if (weakEv.length === 0 && mechanisms.size === 1 && mechanisms.has('rss_category')) rssOnly.push({ item, top, evidence: mediumEv });
  else if (weakEv.length === 0 && mechanisms.size === 1 && mechanisms.has('url_segment')) urlOnly.push({ item, top, evidence: mediumEv });
  else if (weakEv.length === 0 && mechanisms.size > 1) mixedMedium.push({ item, top, evidence: mediumEv });
}

console.log(`\nBATCH MEDIUM — Sesi 3B.2C-5 Medium Evidence Validation\n`);
console.log(`Available: rss_category-only=${rssOnly.length}, url_path-only=${urlOnly.length}, mixed-medium=${mixedMedium.length}\n`);

function printGroup(name, group, target) {
  const sample = group.slice(0, target);
  console.log(`\n=== ${name} (${sample.length}/${group.length} available, target ${target}) ===`);
  console.log('| # | source | Story | evidence | candidate@conf | editor_judgement | notes |');
  console.log('|---|---|---|---|---|---|---|');
  sample.forEach((s, i) => {
    const ev = s.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ');
    console.log(`| ${i + 1} | ${s.item.sourceName} | ${s.item.title.slice(0, 50).replace(/\|/g, '/')} | ${ev} | ${s.top.value}@${s.top.confidence} | ____ | ____ |`);
  });
  if (sample.length < target) console.log(`\n(Only ${sample.length} available in the live corpus — not padded to reach ${target}.)`);
}

printGroup('rss_category-only', rssOnly, 20);
printGroup('url_path-only', urlOnly, 20);
printGroup('mixed-medium (2+ Medium mechanisms, no Strong/Weak)', mixedMedium, 20);
