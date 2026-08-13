// snapshot-regression.test.mjs — per ChatGPT (2026-08-13): tests
// ARCHITECTURE against the local snapshot (db/snapshot-production.mjs),
// not ranking score. Confirms locked invariants from this session's own
// work still hold against a real data copy, entirely offline.
//
// Requires a snapshot to exist first: node db/snapshot-production.mjs
//
// Run: node db/snapshot-regression.test.mjs

import { loadLocalSnapshot } from './local-snapshot-loader.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nSNAPSHOT REGRESSION TEST — architecture invariants, not ranking score\n');

const snapshot = loadLocalSnapshot();
console.log(`Snapshot date: ${snapshot.snapshotDate}`);
console.log(`Ruleset versions: ${snapshot.rulesetVersions.join(', ')}\n`);

const itemById = new Map(snapshot.rssItems.map(i => [i.id, i]));
const itemsByCluster = new Map();
for (const item of snapshot.rssItems) {
  if (!itemsByCluster.has(item.cluster_id)) itemsByCluster.set(item.cluster_id, []);
  itemsByCluster.get(item.cluster_id).push(item);
}

// --- ms-MY.Politik has real candidates available (the Ranking Engine
// pilot's own field must not have silently gone empty) ---
{
  const politikPlacements = snapshot.placements.filter(p => p.edition_id === 'ms-MY' && p.field === 'Politik' && p.classification_status === 'classified');
  assert('ms-MY.Politik has at least 10 classified candidates available (Ranking Engine pilot field)',
    politikPlacements.length >= 10, `got ${politikPlacements.length}`);
}

// --- Edition Locale Authority: no story with ONLY Malay representation
// has a placement in en-global or ar-global (docs/edition-state-model.md's
// "Edition Locale Authority" principle + the Representation Eligibility
// Gate, docs/edition-representation-eligibility-policy.md) ---
{
  let violations = 0;
  for (const placement of snapshot.placements) {
    if (placement.edition_id === 'ms-MY') continue;
    const members = itemsByCluster.get(placement.story_id) ?? [];
    const requiredLocale = placement.edition_id === 'en-global' ? 'en' : 'ar';
    const hasRequiredRepresentation = members.some(m => m.language === requiredLocale);
    if (!hasRequiredRepresentation) violations++;
  }
  assert('No non-ms-MY placement exists for a story lacking that edition\'s own language representation (Representation Eligibility Gate)',
    violations === 0, `${violations} violation(s) found`);
}

// --- Arabic edition placements only ever pair with Arabic-language
// representation being AVAILABLE somewhere in the cluster (sanity check
// distinct from the eligibility gate check above — confirms the
// underlying rss_items data itself, not just the gate's own logic) ---
{
  const arPlacements = snapshot.placements.filter(p => p.edition_id === 'ar-global' && p.classification_status === 'classified');
  let withArabicMember = 0;
  for (const p of arPlacements) {
    const members = itemsByCluster.get(p.story_id) ?? [];
    if (members.some(m => m.language === 'ar')) withArabicMember++;
  }
  assert('ar-global classified placements: 100% have a real Arabic-language rss_items row backing them',
    arPlacements.length === 0 || withArabicMember === arPlacements.length,
    `${withArabicMember}/${arPlacements.length}`);
}

// --- Every classified placement has a non-null field (the "Unclassified
// is a status, never a Bidang value" principle) ---
{
  const badRows = snapshot.placements.filter(p => p.classification_status === 'classified' && !p.field);
  assert('Every "classified" placement has a real, non-null field',
    badRows.length === 0, `${badRows.length} bad row(s)`);
}

// --- KPM tender-notice filter still holds against this snapshot ---
{
  const kpmItems = snapshot.rssItems.filter(i => i.source_id === 'rss-kpm');
  const tenderLike = kpmItems.filter(i => /tender|sebut harga|perolehan|^notis\b/i.test(i.title));
  assert('rss-kpm snapshot data contains ZERO tender/procurement-pattern titles (docs/known-issues.md §1 fix still holds)',
    tenderLike.length === 0, `${tenderLike.length} found`);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
