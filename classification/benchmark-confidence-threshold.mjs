// benchmark-confidence-threshold.mjs — Sesi 3B.2C-1, per
// docs/resolver-confidence-policy.md §5. Per ChatGPT: don't pick 0.6 by
// theory alone — test 0.40/0.50/0.60/0.70/0.80 against the live corpus and
// measure classified/unclassified/geography-fallback rates BEFORE locking
// a value. This script measures; it does not decide.
//
// Also produces the manual-review sample per ChatGPT's instruction: all
// Gap-3 (low-confidence, <0.5) cases + 20 random normal cases as control,
// ~76 items total — for a human (Izzat / ChatGPT) to judge as technical
// error vs editorial disagreement (docs/resolver-confidence-policy.md §5).
// This script does NOT fabricate that judgement — chief_editor_judgement
// is left blank for a human to fill in.
//
// Run: node classification/benchmark-confidence-threshold.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { classifyForAllEditions } from './edition-classification.mjs';

const THRESHOLDS = [0.40, 0.50, 0.60, 0.70, 0.80];
const EDITIONS = ['ms-MY', 'en-global', 'ar-global'];

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

const understood = items.map(item => ({ item, understanding: understandStory(item) }));

console.log(`\nRESOLVER CONFIDENCE THRESHOLD BENCHMARK — Sesi 3B.2C-1, ${items.length} real items\n`);

// --- Part 1: sweep thresholds, measure outcome distribution per edition ---
for (const threshold of THRESHOLDS) {
  console.log(`\n=== threshold = ${threshold} ===`);
  for (const edition of EDITIONS) {
    const counts = { classified: 0, unclassified: 0, low_confidence_fallback: 0, edition_rule: 0, default_mapping: 0, geography_fallback: 0 };
    for (const { understanding } of understood) {
      const result = classifyForAllEditions(understanding, threshold)[edition];
      if (result.classification_status === 'unclassified') counts.unclassified++;
      else counts.classified++;
      counts[result.classification_method] = (counts[result.classification_method] ?? 0) + 1;
    }
    const pct = n => `${Math.round(n / items.length * 100)}%`;
    console.log(`  ${edition.padEnd(6)} classified=${pct(counts.classified)} unclassified=${pct(counts.unclassified)}  ` +
      `(edition_rule=${counts.edition_rule}, default_mapping=${counts.default_mapping}, low_confidence_fallback=${counts.low_confidence_fallback}, geography_fallback=${counts.geography_fallback})`);
  }
}

// --- Part 2: manual-review sample — all Gap-3 (<0.5 confidence) cases + 20 random control ---
const gap3 = understood.filter(({ understanding }) => {
  const top = understanding.subject_candidates[0];
  return top && top.confidence < 0.5;
});
const nonGap3 = understood.filter(({ understanding }) => {
  const top = understanding.subject_candidates[0];
  return !(top && top.confidence < 0.5);
});
// Deterministic pseudo-random pick (no Math.random dependency): stride sample.
const controlStride = Math.max(1, Math.floor(nonGap3.length / 20));
const control = nonGap3.filter((_, i) => i % controlStride === 0).slice(0, 20);

console.log(`\n\nMANUAL REVIEW SAMPLE — ${gap3.length} Gap-3 cases + ${control.length} control cases = ${gap3.length + control.length} total`);
console.log('For human review: engine_output shown at threshold=0.6 (the contract\'s starting point, not locked).');
console.log('chief_editor_judgement intentionally left blank — fill in per docs/resolver-confidence-policy.md §5.\n');

const sample = [...gap3.map(x => ({ ...x, group: 'gap3' })), ...control.map(x => ({ ...x, group: 'control' }))];
for (const { item, understanding, group } of sample) {
  const editions = classifyForAllEditions(understanding, 0.6);
  const top = understanding.subject_candidates[0];
  console.log(`[${group}] "${item.title.slice(0, 70)}"`);
  console.log(`  top_candidate=${top ? `${top.value}@${top.confidence}` : 'none'}`);
  console.log(`  ms-MY: ${editions['ms-MY'].field ?? 'unclassified'} (${editions['ms-MY'].classification_method})   ` +
    `en: ${editions['en-global'].field ?? 'unclassified'} (${editions['en-global'].classification_method})   ` +
    `ar: ${editions['ar-global'].field ?? 'unclassified'} (${editions['ar-global'].classification_method})`);
  console.log(`  chief_editor_judgement: ____   technical_error_or_editorial_preference: ____\n`);
}
