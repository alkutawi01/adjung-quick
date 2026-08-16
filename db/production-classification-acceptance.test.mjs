// production-classification-acceptance.test.mjs — Production Classification
// Acceptance Test, requested by ChatGPT (director) 2026-08-12 after the
// Production Evidence Persistence Gap incident.
//
// Purpose: guard against the exact regression ChatGPT flagged — a future
// developer sees `cluster.topic` on a row and assumes it's a live category,
// then wires new UI against `story_clusters.topic` (the OLD classifier's
// Politics/Economy/Sports/World vocabulary) instead of the edition-specific
// placement in `edition_story_classifications`. That mistake would compile,
// run, and show *something* on screen — silent wrong data, not a crash.
//
// This is a structural/mapping test, not a live-data test: it uses mocked
// Supabase rows shaped exactly like the real tables, run through the same
// pure mapRowsToRankedQueue() the app calls in production
// (ui/src/adapter/productionAdapter.js). No network, no DB — runs anytime.
//
// Taxonomy Stable Field-ID V1 (2026-08-16): `topic` is now field_code, not
// the mutable label — placements fixtures below carry field_code, and
// assertions check against it, not `field`.
//
// Run: node db/production-classification-acceptance.test.mjs

import { mapRowsToRankedQueue } from '../ui/src/adapter/productionAdapter.js';

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

// Three real stories per ChatGPT's example table, each with genuinely
// different placement per edition — this is the shape that would expose a
// legacy-field regression immediately.
const sources = [{ id: 's1', trust_score: 90 }];
const clusters = [
  { id: 'story-my-politics', topic: 'Politics', editorial_score: 10, workspace_state: 'active' }, // legacy field, must NOT be read
  { id: 'story-th-politics', topic: 'World', editorial_score: 9, workspace_state: 'active' },
  { id: 'story-science', topic: 'Science', editorial_score: 8, workspace_state: 'active' },
];
const items = clusters.map((c, i) => ({
  id: `item-${i}`, source_id: 's1', cluster_id: c.id, rss_guid: `g${i}`,
  title: c.id, description: '', link: `https://example.com/${i}`,
  normalized_url: `https://example.com/${i}`, language: 'ms',
  published_at: new Date(2026, 7, 12, i).toISOString(),
}));

const placementsByEdition = {
  'ms-MY': [
    { story_id: 'story-my-politics', field: 'Politik', field_code: 'politics', classification_status: 'classified', classification_confidence: 0.9 },
    { story_id: 'story-th-politics', field: 'Dunia', field_code: 'dunia', classification_status: 'classified', classification_confidence: 0.85 },
    { story_id: 'story-science', field: 'Sains', field_code: 'science', classification_status: 'classified', classification_confidence: 0.9 },
  ],
  'en-global': [
    { story_id: 'story-my-politics', field: 'Politics', field_code: 'politics', classification_status: 'classified', classification_confidence: 0.9 },
    { story_id: 'story-th-politics', field: 'Politics', field_code: 'politics', classification_status: 'classified', classification_confidence: 0.85 },
    { story_id: 'story-science', field: 'Science', field_code: 'science', classification_status: 'classified', classification_confidence: 0.9 },
  ],
  'ar-global': [
    { story_id: 'story-my-politics', field: 'سياسة', field_code: 'politics', classification_status: 'classified', classification_confidence: 0.9 },
    { story_id: 'story-th-politics', field: 'سياسة', field_code: 'politics', classification_status: 'classified', classification_confidence: 0.85 },
    { story_id: 'story-science', field: 'علوم', field_code: 'science', classification_status: 'classified', classification_confidence: 0.9 },
  ],
};

console.log('\nPRODUCTION CLASSIFICATION ACCEPTANCE TEST\n');

for (const [editionId, placements] of Object.entries(placementsByEdition)) {
  const queue = mapRowsToRankedQueue({ sources, clusters, items, placements });
  const byId = new Map(queue.map(c => [c.clusterKey, c]));

  console.log(`edition = ${editionId}`);
  assert(`${editionId}: Malaysia politics -> ${placements[0].field_code}`,
    byId.get('story-my-politics').topic === placements[0].field_code);
  assert(`${editionId}: Thailand politics -> ${placements[1].field_code}`,
    byId.get('story-th-politics').topic === placements[1].field_code);
  assert(`${editionId}: Science -> ${placements[2].field_code}`,
    byId.get('story-science').topic === placements[2].field_code);

  // The regression guard ChatGPT specifically asked for: `topic` must never
  // equal the legacy `story_clusters.topic` value when the edition-specific
  // placement genuinely differs from it (as it does here for every row).
  assert(`${editionId}: topic is NOT the legacy story_clusters.topic value`,
    byId.get('story-my-politics').topic !== 'Politics');
  assert(`${editionId}: legacyTopic is preserved separately, for audit only`,
    byId.get('story-my-politics').legacyTopic === 'Politics');
}

// Thailand politics is the sharpest case: ms-MY files it under Dunia (world
// desk, not the Malaysia-local Politik desk) while en-global/ar-global file
// it as their own Politics/سياسة — exactly the "same story, different
// editorial home" divergence the Edition Architecture exists to produce.
const msQueue = mapRowsToRankedQueue({ sources, clusters, items, placements: placementsByEdition['ms-MY'] });
const enQueue = mapRowsToRankedQueue({ sources, clusters, items, placements: placementsByEdition['en-global'] });
assert('cross-edition divergence: Thailand politics is dunia in ms-MY but politics in en-global',
  msQueue.find(c => c.clusterKey === 'story-th-politics').topic === 'dunia' &&
  enQueue.find(c => c.clusterKey === 'story-th-politics').topic === 'politics');

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
