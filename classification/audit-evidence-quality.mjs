// audit-evidence-quality.mjs — Sesi 3A.2, per ChatGPT: audit the evidence
// the engine already produces, don't touch the engine, taxonomy, or rules.
// Answers: is the evidence layer healthy enough to hand to Edition
// Classification (Sesi 3B)?
//
// Run: node classification/audit-evidence-quality.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

console.log(`\nEVIDENCE QUALITY AUDIT — Sesi 3A.2, ${items.length} real items\n`);

// --- 1. Coverage broken down by TOP candidate's evidence type mix ---
const evidenceMixCounts = {};
let noCandidate = 0;
const rows = [];

for (const item of items) {
  const result = understandStory(item);
  const top = result.subject_candidates[0];
  if (!top) { noCandidate++; rows.push({ item, result, top: null, conflict: false }); continue; }

  const types = [...new Set(top.evidence.map(e => e.evidence_type))].sort();
  const mixKey = types.length > 1 ? 'multiple_types' : types[0];
  evidenceMixCounts[mixKey] = (evidenceMixCounts[mixKey] ?? 0) + 1;

  // Conflict: 2+ candidates within 0.15 confidence of each other.
  const second = result.subject_candidates[1];
  const conflict = !!(second && (top.confidence - second.confidence) <= 0.15);

  rows.push({ item, result, top, conflict });
}

const n = items.length;
console.log('1. TOP-CANDIDATE EVIDENCE MIX (of items WITH a candidate)');
const withCandidate = n - noCandidate;
for (const [mix, count] of Object.entries(evidenceMixCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${mix.padEnd(16)} ${count}/${withCandidate}  (${Math.round(count / withCandidate * 100)}%)`);
}
console.log(`  (no candidate at all: ${noCandidate}/${n}, ${Math.round(noCandidate / n * 100)}%)`);

// --- 2. Conflict cases ---
const conflicts = rows.filter(r => r.conflict);
console.log(`\n2. CANDIDATE CONFLICT REPORT — ${conflicts.length}/${n} items (${Math.round(conflicts.length / n * 100)}%) have 2+ close candidates`);
for (const r of conflicts.slice(0, 15)) {
  console.log(`\n  "${r.item.title.slice(0, 70)}" (${r.item.sourceName})`);
  for (const c of r.result.subject_candidates.slice(0, 3)) {
    console.log(`    ${c.value.padEnd(14)} ${c.confidence}  ${c.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ')}`);
  }
}
if (conflicts.length > 15) console.log(`\n  ... +${conflicts.length - 15} more conflict cases not shown`);

// --- 3. Manual review sample: 30 items, weighted toward interesting cases ---
// Priority: conflicts first, then single-weak-signal (title_keyword only),
// then single-strong-signal (feed_category/url_segment), then no-signal —
// so the sample actually covers the full quality spectrum, not just the top.
function bucket(r) {
  if (r.conflict) return 0;
  if (!r.top) return 4;
  const types = new Set(r.top.evidence.map(e => e.evidence_type));
  if (types.has('feed_category')) return 1;
  if (types.has('url_segment') || types.has('rss_category') || types.has('title_prefix')) return 2;
  return 3; // title_keyword only
}
const sample = [...rows].sort((a, b) => bucket(a) - bucket(b)).slice(0, 30);

console.log(`\n3. MANUAL REVIEW SAMPLE (30 items, spread across quality buckets — for Izzat/ChatGPT to eyeball, not auto-scored)\n`);
for (const r of sample) {
  const label = r.top ? `${r.top.value} (${r.top.confidence})` : 'NO CANDIDATE';
  const evid = r.top ? r.top.evidence.map(e => `${e.evidence_type}:${e.value}`).join(', ') : '—';
  console.log(`  [${label}] "${r.item.title.slice(0, 65)}" — ${evid}`);
}
console.log('');
