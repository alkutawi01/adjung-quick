// test-story-understanding.mjs — Sesi 3A test plan, per
// docs/story-understanding-engine-spec.md: measure COVERAGE and AMBIGUITY,
// explicitly NOT accuracy (no per-edition ground truth exists yet — that
// needs Edition Classification, Sesi 3B, and a redone benchmark).
//
// Run: node classification/test-story-understanding.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';

const withTier1 = !process.argv.includes('--no-tier1');

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const failed = results.filter(r => !r.ok);
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name, sourceKnownCategory: withTier1 ? i.sourceKnownCategory : undefined })));

if (failed.length) {
  console.log('FETCH FAILURES:', failed.map(r => `${r.source.name} (${r.error})`).join(', '));
}
console.log(`\nSTORY UNDERSTANDING ENGINE — Sesi 3A test, ${items.length} real items (Tier 1: ${withTier1 ? 'ON' : 'OFF, --no-tier1'})\n`);

let subjectCovered = 0, geographyCovered = 0;
let ambiguitySingle = 0, ambiguityMultiple = 0, ambiguityNone = 0;
const evidenceTypeCounts = {};
const subjectTally = {};

for (const item of items) {
  const result = understandStory(item);

  if (result.subject_candidates.length >= 1) subjectCovered++;
  if (result.geography_candidates.length >= 1) geographyCovered++;

  if (result.subject_candidates.length === 0) ambiguityNone++;
  else if (result.subject_candidates.length === 1) ambiguitySingle++;
  else ambiguityMultiple++;

  for (const c of result.subject_candidates) {
    for (const e of c.evidence) {
      evidenceTypeCounts[e.evidence_type] = (evidenceTypeCounts[e.evidence_type] ?? 0) + 1;
    }
  }
  if (result.subject_candidates[0]) {
    subjectTally[result.subject_candidates[0].value] = (subjectTally[result.subject_candidates[0].value] ?? 0) + 1;
  }
}

const n = items.length;
const pct = x => Math.round(x / n * 100) + '%';

console.log('COVERAGE');
console.log(`  Subject candidate coverage:    ${subjectCovered}/${n}  (${pct(subjectCovered)})`);
console.log(`  Geography candidate coverage:  ${geographyCovered}/${n}  (${pct(geographyCovered)})`);

console.log('\nAMBIGUITY RATE');
console.log(`  No signal:            ${ambiguityNone}/${n}  (${pct(ambiguityNone)})`);
console.log(`  Single candidate:     ${ambiguitySingle}/${n}  (${pct(ambiguitySingle)})`);
console.log(`  Multiple candidates:  ${ambiguityMultiple}/${n}  (${pct(ambiguityMultiple)})`);

const totalEvidence = Object.values(evidenceTypeCounts).reduce((a, b) => a + b, 0);
console.log('\nEVIDENCE SOURCE DISTRIBUTION (health metric — feed/URL/category should dominate, not text)');
for (const [type, count] of Object.entries(evidenceTypeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(16)} ${count}  (${Math.round(count / totalEvidence * 100)}%)`);
}

console.log('\nTOP-CANDIDATE SUBJECT DISTRIBUTION (for sanity-checking, not accuracy)');
for (const [subject, count] of Object.entries(subjectTally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${subject.padEnd(14)} ${count}`);
}

console.log('\nSAMPLE OUTPUT (first 5 items, full shape)');
for (const item of items.slice(0, 5)) {
  const result = understandStory(item);
  console.log(`\n  "${item.title.slice(0, 70)}" (${item.sourceName})`);
  console.log('  ' + JSON.stringify(result));
}
console.log('');
