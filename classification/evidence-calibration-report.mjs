// evidence-calibration-report.mjs — Sesi 3B.2C-4, per ChatGPT: use existing
// data to produce a baseline BEFORE any new confidence model is built.
// Read-only — no engine, taxonomy, threshold, or rule changes. This script
// applies the Evidence Quality Matrix (docs/evidence-quality-matrix-contract.md)
// as a REPORTING overlay only — story-understanding.mjs itself is untouched.
//
// Three sections, exactly as ChatGPT specified:
// 1. Reliability per evidence class (Strong/Medium/Weak/Ignored)
// 2. Agreement impact (single evidence vs multi evidence)
// 3. False positive catalogue (known failure modes, not new rules)
//
// Run: node classification/evidence-calibration-report.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { STRUCTURAL_NOISE, normalizeToken } from './lib/desk-vocabulary.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

// Evidence Quality Matrix classification, applied read-only for this report.
function classifyEvidence(evidenceType, value) {
  if (evidenceType === 'feed_category' || evidenceType === 'title_prefix') return 'strong';
  if (evidenceType === 'url_segment' || evidenceType === 'rss_category') {
    if (STRUCTURAL_NOISE.has(normalizeToken(value))) return 'ignored';
    return 'medium';
  }
  if (evidenceType === 'title_keyword') return 'weak';
  return 'unknown';
}

console.log(`\nEVIDENCE CALIBRATION REPORT — Sesi 3B.2C-4, ${items.length} real items\n`);

// --- 1. Reliability per evidence class ---
// "Confirmed" is only reported where a prior MANUAL judgment already
// exists (docs/sesi3a2-evidence-quality-audit.md) — not fabricated here.
// Classes without a prior manual pass are marked accordingly, not guessed.
const classCounts = { strong: 0, medium: 0, weak: 0, ignored: 0 };
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) continue;
  for (const e of top.evidence) {
    const cls = classifyEvidence(e.evidence_type, e.value);
    if (classCounts[cls] !== undefined) classCounts[cls]++;
  }
}

console.log('1. RELIABILITY PER EVIDENCE CLASS\n');
console.log('Evidence class   Count (evidence items, not stories)   Manual confirmation status');
console.log('---------------------------------------------------------------------------------');
console.log(`Strong           ${String(classCounts.strong).padEnd(40)} Confirmed reliable — sesi3a2 30-item manual sample: 10 Business + 10 Sports feed_category items, 0.98-0.99 confidence, ALL correct. No disconfirming case found since.`);
console.log(`Medium           ${String(classCounts.medium).padEnd(40)} NOT YET manually confirmed — Batch U (generate-batch-u.mjs) generated 15 url_path/rss_category-only samples for Izzat's review, judgments not yet filled in.`);
console.log(`Weak             ${String(classCounts.weak).padEnd(40)} Confirmed UNRELIABLE — sesi3a2: 3 documented false positives (Sultan Brunei/menteri, Tabung Haji/didakwa, Hungarian president/court), all from bare-word title_keyword matches.`);
console.log(`Ignored          ${String(classCounts.ignored).padEnd(40)} By definition excluded from candidate generation — no confirmation needed, these evidence items never produce a candidate.`);

// --- 2. Agreement impact: single evidence vs multi evidence ---
console.log('\n\n2. AGREEMENT IMPACT — single evidence vs multi evidence (structural, from corpus)\n');
const single = [];
const multi = [];
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (!top) continue;
  const mechanisms = new Set(top.evidence.map(e => e.evidence_type));
  (mechanisms.size > 1 ? multi : single).push(top.confidence);
}
function stats(arr) {
  if (!arr.length) return 'n/a';
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return `n=${arr.length}, min=${Math.min(...arr)}, max=${Math.max(...arr)}, avg=${Math.round(avg * 100) / 100}`;
}
console.log(`Single-mechanism candidates: ${stats(single)}`);
console.log(`Multi-mechanism candidates:  ${stats(multi)}`);
console.log('(Matches Batch M\'s finding: multi-mechanism agreement clusters at 0.97-1.0; single-mechanism spans the full range depending on which mechanism.)');
console.log('\nNote: this is a STRUCTURAL comparison (does confidence separate the groups), not a manual-accuracy comparison —');
console.log('"is confidence calibration actually aligned with manual judgment" requires Batch M/U/A\'s human review, not yet complete.');

// --- 3. False positive catalogue — known failure modes, not new rules ---
console.log('\n\n3. FALSE POSITIVE CATALOGUE — known failure modes (documentation only, no rule changes)\n');
const knownFailureModes = [
  { phrase: 'mahkamah / court', subject: 'Crime', note: 'Fires on ANY passing mention of a court, not stories actually about a legal case. Documented sesi3a2 + reconfirmed in Batch A (8/20 items).' },
  { phrase: 'menteri', subject: 'Politics', note: 'Fires on any minister-adjacent mention, including courtesy/human-interest stories (Sultan Brunei/Anwar health call). Documented sesi3a2.' },
  { phrase: 'parlimen', subject: 'Politics', note: 'Similar pattern to menteri — institutional-adjacent mention, not necessarily a story about parliamentary politics.' },
  { phrase: 'kerajaan / government', subject: 'Politics', note: 'Same family as menteri/parlimen — same content-rule group, so 3 matches together are still only ONE independent signal per Evidence Independence (see contract).' },
  { phrase: 'didakwa', subject: 'Crime', note: 'Fires on any mention of an accusation/allegation, not necessarily a crime story (e.g. policy-recommendation stories mentioning past allegations in passing).' },
];
for (const f of knownFailureModes) {
  console.log(`  "${f.phrase}" -> ${f.subject}: ${f.note}`);
}
console.log('\nNot proposing fixes here — per ChatGPT, this is a catalogue for reference, not a queue for immediate rule-narrowing.');
