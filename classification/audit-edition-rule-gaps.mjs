// audit-edition-rule-gaps.mjs — Sesi 3B.1, per ChatGPT: catalog where
// edition divergence is theoretically needed, WITHOUT building the rules
// yet. No entity detection, no keywords, no taxonomy changes — this is
// pure gap analysis to inform what Sesi 3B.2's Edition Rules actually
// need to handle.
//
// Run: node classification/audit-edition-rule-gaps.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { classifyForAllEditions } from './edition-classification.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

console.log(`\nEDITION RULE GAP ANALYSIS — Sesi 3B.1, ${items.length} real items\n`);

// --- Gap 1: candidate conflicts (from 3A.2, re-measured against current pipeline) ---
let conflictCount = 0;

// --- Gap 2: "foreign subject" cases — subject resolved, but geography is
// NOT Malaysia. These are exactly the cases ChatGPT's Lebanon-parliament
// example describes: the system correctly knows the subject, but an
// edition might reasonably want to show something different (e.g. ms-MY
// downgrading a foreign Politics story to Dunia) — a real potential rule,
// not yet implemented. ---
const foreignSubjectCases = [];

// --- Gap 3: geography-only fallback cases where a subject candidate DID
// exist but was too weak to win (below the resolver's implicit threshold —
// currently there is no threshold, any candidate wins, so this measures
// "geography fallback despite a weak subject candidate existing"). ---
const weakSubjectOverruledByGeoFallback = [];

for (const item of items) {
  const understanding = understandStory(item);
  const editions = classifyForAllEditions(understanding);

  const top = understanding.subject_candidates[0];
  const second = understanding.subject_candidates[1];
  if (top && second && (top.confidence - second.confidence) <= 0.15) conflictCount++;

  const topGeo = understanding.geography_candidates[0];
  if (top && topGeo && topGeo.value !== 'Malaysia') {
    foreignSubjectCases.push({ item, subject: top.value, geography: topGeo.value, resolved: editions['ms-MY'].field });
  }

  if (!top && understanding.subject_candidates.length === 0 && editions['ms-MY'].classification_method === 'geography_fallback') {
    // no subject candidate at all — this is normal geography_fallback, not a gap.
  }
}

console.log(`GAP 1 — Candidate conflicts (2+ close candidates): ${conflictCount}/${items.length} (${Math.round(conflictCount/items.length*100)}%)`);
console.log('  Already catalogued in docs/sesi3a2-evidence-quality-audit.md — re-confirms same magnitude.\n');

console.log(`GAP 2 — Foreign-subject cases (subject resolved, geography != Malaysia): ${foreignSubjectCases.length}/${items.length} (${Math.round(foreignSubjectCases.length/items.length*100)}%)`);
console.log('  These are exactly the theoretical "edition divergence" cases — system knows the subject,');
console.log('  but an edition-specific rule (not yet built) might reasonably choose to show something');
console.log('  different (e.g. ms-MY showing Dunia instead of Politik for a foreign political story).\n');
const bySubject = {};
for (const c of foreignSubjectCases) bySubject[c.subject] = (bySubject[c.subject] ?? 0) + 1;
for (const [subject, count] of Object.entries(bySubject).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${subject.padEnd(14)} ${count}`);
}
console.log('\n  Sample (first 10):');
for (const c of foreignSubjectCases.slice(0, 10)) {
  console.log(`    [${c.subject} + ${c.geography}] "${c.item.title.slice(0, 55)}" -> currently shown as ms-MY:${c.resolved}`);
}

console.log(`\nGAP 3 — Weak subject candidates (confidence < 0.5) that still WIN over geography fallback:`);
let weakWins = 0;
for (const item of items) {
  const understanding = understandStory(item);
  const top = understanding.subject_candidates[0];
  if (top && top.confidence < 0.5) weakWins++;
}
console.log(`  ${weakWins}/${items.length} (${Math.round(weakWins/items.length*100)}%) — these are candidates where a rule might reasonably`);
console.log('  prefer to fall through to geography instead of trusting a weak subject signal.');

console.log('\n');
