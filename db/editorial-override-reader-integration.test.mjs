// editorial-override-reader-integration.test.mjs — FASA 3.6.3a + 3.6.3b.
// Per ChatGPT's explicit "Test wajib" for the Hide action's Resolver
// Integration requirement, extended for Reclassify per
// docs/reclassify-action-plan-v1.md §3.
//
// Structural/mapping test, same pattern as
// db/production-classification-acceptance.test.mjs: hand-built rows shaped
// like the real tables, run through the same pure mapRowsToRankedQueue()
// the app calls in production (ui/src/adapter/productionAdapter.js). No
// network, no DB — runs anytime.
//
// This guards the exact gap found live 2026-08-13: story_overrides rows
// existed and were writable via the admin Review Queue, but
// mapRowsToRankedQueue() never read them — a hide/reclassify decision sat
// in the database with zero effect on what a reader actually saw.
//
// Run: node db/editorial-override-reader-integration.test.mjs

import { mapRowsToRankedQueue } from '../ui/src/adapter/productionAdapter.js';

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nEDITORIAL OVERRIDE — READER INTEGRATION TEST\n');

const sources = [{ id: 's1', trust_score: 90 }];
const clusters = [
  // Deliberately the HIGHEST editorial_score of the three — proves hide
  // beats ranking structurally, not by luck of a low score.
  { id: 'story-hidden', topic: 'Politics', editorial_score: 99, workspace_state: 'active' },
  { id: 'story-reclassified', topic: 'Politics', editorial_score: 50, workspace_state: 'active' },
  { id: 'story-untouched', topic: 'Politics', editorial_score: 40, workspace_state: 'active' },
];
const items = clusters.map((c, i) => ({
  id: `item-${i}`, source_id: 's1', cluster_id: c.id, rss_guid: `g${i}`,
  title: c.id, description: '', link: `https://example.com/${i}`,
  normalized_url: `https://example.com/${i}`, language: 'ms',
  published_at: new Date(2026, 7, 13, i).toISOString(),
}));
const placements = [
  { story_id: 'story-hidden', field: 'Politik', classification_status: 'classified', classification_confidence: 0.9 },
  { story_id: 'story-reclassified', field: 'Politik', classification_status: 'classified', classification_confidence: 0.9 },
  { story_id: 'story-untouched', field: 'Politik', classification_status: 'classified', classification_confidence: 0.9 },
];

const activeOverrides = [
  { story_id: 'story-hidden', override_type: 'hide', new_field: null, created_at: '2026-08-13T10:00:00Z' },
  { story_id: 'story-reclassified', override_type: 'reclassify', new_field: 'Bencana', created_at: '2026-08-13T10:00:00Z' },
];

// --- Test 1: Hide story aktif -> override exists -> reader excludes ---
{
  const queue = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const hidden = queue.find(c => c.clusterKey === 'story-hidden');
  assert('Test 1 — hidden story: topic is null (reader never shows it under any Bidang)',
    hidden.topic === null);
  const reclassified = queue.find(c => c.clusterKey === 'story-reclassified');
  assert('Test 1b — reclassified story: topic follows the override, not the classifier',
    reclassified.topic === 'Bencana');
  const untouched = queue.find(c => c.clusterKey === 'story-untouched');
  assert('Test 1c — story with no override: classifier output passes through unchanged',
    untouched.topic === 'Politik');
}

// --- Test 2: Hide + refresh -> rebuild Active Set -> masih hilang ---
// mapRowsToRankedQueue is a pure function — "refresh" in the real app is
// just calling it again with a fresh fetch. Re-running it here with the
// SAME override still active proves the result doesn't drift/reset.
{
  const queue1 = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const queue2 = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  assert('Test 2 — recomputing with the same active override: still hidden both times',
    queue1.find(c => c.clusterKey === 'story-hidden').topic === null &&
    queue2.find(c => c.clusterKey === 'story-hidden').topic === null);
}

// --- Test 3: Hide + ranking -> ranking pilih -> resolver buang ---
// story-hidden has the HIGHEST editorial_score of all three (99) — if hide
// didn't beat ranking, it would sort first. Prove it's excluded from the
// pool a Bidang view would ever filter into, regardless of score.
{
  const queue = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const politikEligible = queue.filter(c => c.topic === 'Politik');
  assert('Test 3 — highest-scoring story is still excluded from the eligible pool once hidden',
    !politikEligible.some(c => c.clusterKey === 'story-hidden'));
  // Sanity: it's not gone from the array entirely (still a valid cluster,
  // e.g. for admin/audit views) — just unreachable via any real Bidang.
  assert('Test 3b — hidden story remains in rankedQueue as a row, just with topic:null',
    queue.some(c => c.clusterKey === 'story-hidden'));
}

// --- Test 4: Undo/remove override -> hide removed -> story boleh muncul semula ---
// Deactivating an override in production means it drops out of the
// `.eq('active', true)` query fetchRankedQueue runs — modeled here by
// calling mapRowsToRankedQueue WITHOUT it in the overrides array.
{
  const queueWithHide = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const overridesAfterUndo = activeOverrides.filter(o => o.story_id !== 'story-hidden');
  const queueAfterUndo = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: overridesAfterUndo });

  assert('Test 4 — before undo: story is hidden',
    queueWithHide.find(c => c.clusterKey === 'story-hidden').topic === null);
  assert('Test 4b — after undo: story reappears under its classifier field',
    queueAfterUndo.find(c => c.clusterKey === 'story-hidden').topic === 'Politik');
}

// --- Test 5: Reclassify is edition-scoped ---
// fetchRankedQueue(editionId) only ever fetches overrides WHERE
// edition_id = editionId (the query shape from 3.6.3a). Modeled here by
// calling with the SAME clusters/placements but an overrides array that
// does NOT include the ms-MY reclassify — exactly what en-global's own
// fetch would actually return, since the override row's edition_id is
// 'ms-MY', never 'en-global'.
{
  const msQueue = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const enOverrides = []; // what an en-global fetch would actually receive
  const enQueue = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: enOverrides });
  assert('Test 5 — ms-MY reclassify applies in ms-MY',
    msQueue.find(c => c.clusterKey === 'story-reclassified').topic === 'Bencana');
  assert('Test 5b — the SAME story in en-global (no matching override): classifier field unaffected',
    enQueue.find(c => c.clusterKey === 'story-reclassified').topic === 'Politik');
}

// --- Test 6: Reclassify does not touch ranking score ---
// editorialScore comes from story_clusters.editorial_score, independent
// of topic — reclassify changes which Bidang a story competes in, never
// the score it competes with (ranking algorithm is out of scope, per
// ChatGPT's explicit "jangan sentuh ranking algorithm").
{
  const queue = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const reclassified = queue.find(c => c.clusterKey === 'story-reclassified');
  assert('Test 6 — reclassified story keeps its original editorial_score (50), unchanged by the override',
    reclassified.editorialScore === 50);
}

// --- Test 7: Reclassify is reversible ---
// Same undo mechanism as hide (Test 4) — deactivating the override drops
// it from the active-overrides fetch, and the story falls back to its
// classifier field.
{
  const queueWithReclassify = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: activeOverrides });
  const overridesAfterUndo = activeOverrides.filter(o => o.story_id !== 'story-reclassified');
  const queueAfterUndo = mapRowsToRankedQueue({ sources, clusters, items, placements, overrides: overridesAfterUndo });

  assert('Test 7 — before undo: story sits under the reclassified field',
    queueWithReclassify.find(c => c.clusterKey === 'story-reclassified').topic === 'Bencana');
  assert('Test 7b — after undo: story reverts to its classifier field',
    queueAfterUndo.find(c => c.clusterKey === 'story-reclassified').topic === 'Politik');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
