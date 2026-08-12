// benchmark.mjs — Measures classifier quality against a human-labelled set.
//
// ChatGPT's governing rule for this whole session:
//   "Jangan ukur kejayaan classifier berdasarkan berapa banyak berita berjaya
//    dipaksa keluar daripada Unclassified. Ukur berdasarkan KETEPATAN Bidang."
//
// So this reports precision/recall per Bidang and a confusion matrix — never
// just "Unclassified went down". It also reports the residual share
// (Malaysia/Dunia) SEPARATELY from subject-Bidang accuracy, because a big
// residual bucket can otherwise masquerade as good coverage.
//
// Usage:
//   node classification/benchmark.mjs            # score the labelled set
//   node classification/benchmark.mjs --template # emit a labelling template
//
// The labelled set lives in classification/benchmark-labels.json as
// { "<item link>": "<expected Bidang or Unclassified>", ... }

import { readFileSync, existsSync } from 'node:fs';
import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';

const LABELS_PATH = new URL('./benchmark-labels.json', import.meta.url);

// Residual Bidang are geography-only fallbacks, not subject classifications.
// Kept separate in reporting so they can never inflate the accuracy headline.
const RESIDUAL = new Set(['Malaysia', 'Dunia']);

async function loadItems() {
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  return results.filter(r => r.ok).flatMap(r =>
    r.items.map(i => ({ ...i, sourceName: r.source.name })));
}

function pad(s, n) { return String(s).padEnd(n); }

if (process.argv.includes('--template')) {
  const items = await loadItems();
  // Tolerate a missing/empty/half-written file — shell redirection
  // (`--template > benchmark-labels.json`) truncates the target before this
  // process reads it, so "exists" does not imply "parseable".
  let existing = {};
  try { existing = JSON.parse(readFileSync(LABELS_PATH, 'utf8')); } catch { existing = {}; }
  const out = {};
  for (const i of items) out[i.link] = existing[i.link] ?? '';
  console.log(JSON.stringify(out, null, 2));
  console.error(`\n${Object.keys(out).length} items; ${Object.values(out).filter(Boolean).length} already labelled.`);
  console.error(`Write this to classification/benchmark-labels.json and fill in the blanks.\n`);
  process.exit(0);
}

if (!existsSync(LABELS_PATH)) {
  console.error('No benchmark-labels.json yet. Generate one with:');
  console.error('  node classification/benchmark.mjs --template > classification/benchmark-labels.json');
  process.exit(1);
}

const { classify } = await import('./classifier.mjs');
const labels = JSON.parse(readFileSync(LABELS_PATH, 'utf8'));
const items = (await loadItems()).filter(i => labels[i.link]);

if (!items.length) {
  console.error('No labelled items matched the current feed contents (feeds move on).');
  process.exit(1);
}

const confusion = new Map();   // `expected→actual` -> count
const perField = new Map();    // Bidang -> {tp, fp, fn}
const perSource = new Map();   // source -> {correct, total}

function bump(map, key, field) {
  const e = map.get(key) ?? { tp: 0, fp: 0, fn: 0 };
  e[field]++; map.set(key, e);
}

let correct = 0, residualCount = 0, unclassifiedCount = 0;

for (const item of items) {
  const expected = labels[item.link];
  const result = classify(item);
  const actual = result.status === 'unclassified' ? 'Unclassified' : result.field;

  const key = `${expected} → ${actual}`;
  confusion.set(key, (confusion.get(key) ?? 0) + 1);

  const s = perSource.get(item.sourceName) ?? { correct: 0, total: 0 };
  s.total++;
  if (expected === actual) { correct++; s.correct++; bump(perField, expected, 'tp'); }
  else { bump(perField, actual, 'fp'); bump(perField, expected, 'fn'); }
  perSource.set(item.sourceName, s);

  if (RESIDUAL.has(actual)) residualCount++;
  if (actual === 'Unclassified') unclassifiedCount++;
}

const n = items.length;
const subjectItems = items.filter(i => !RESIDUAL.has(labels[i.link]) && labels[i.link] !== 'Unclassified');
const subjectCorrect = subjectItems.filter(i => {
  const r = classify(i);
  return (r.status === 'unclassified' ? 'Unclassified' : r.field) === labels[i.link];
}).length;

console.log(`\nBENCHMARK — ${n} labelled items\n`);
console.log(`Overall accuracy      ${correct}/${n}  (${Math.round(correct / n * 100)}%)`);
console.log(`Subject-Bidang acc.   ${subjectCorrect}/${subjectItems.length}  (${subjectItems.length ? Math.round(subjectCorrect / subjectItems.length * 100) : 0}%)   <-- the number that matters`);
console.log(`Residual (Malaysia/Dunia) share  ${residualCount}/${n}  (${Math.round(residualCount / n * 100)}%)`);
console.log(`Unclassified rate     ${unclassifiedCount}/${n}  (${Math.round(unclassifiedCount / n * 100)}%)`);

console.log(`\nPER BIDANG`);
console.log(`  ${pad('Bidang', 16)} ${pad('precision', 10)} ${pad('recall', 10)} tp/fp/fn`);
for (const [field, { tp, fp, fn }] of [...perField].sort()) {
  const p = tp + fp ? (tp / (tp + fp) * 100).toFixed(0) + '%' : '—';
  const r = tp + fn ? (tp / (tp + fn) * 100).toFixed(0) + '%' : '—';
  console.log(`  ${pad(field, 16)} ${pad(p, 10)} ${pad(r, 10)} ${tp}/${fp}/${fn}`);
}

console.log(`\nPER SOURCE`);
for (const [src, { correct: c, total: t }] of [...perSource].sort()) {
  console.log(`  ${pad(src, 22)} ${c}/${t}  (${Math.round(c / t * 100)}%)`);
}

console.log(`\nCONFUSION (expected → actual), mismatches first`);
for (const [k, v] of [...confusion].sort((a, b) => {
  const am = a[0].split(' → ')[0] !== a[0].split(' → ')[1];
  const bm = b[0].split(' → ')[0] !== b[0].split(' → ')[1];
  return (bm - am) || b[1] - a[1];
})) {
  const [exp, act] = k.split(' → ');
  console.log(`  ${exp === act ? ' ' : '✗'} ${pad(k, 44)} ${v}`);
}
console.log('');
