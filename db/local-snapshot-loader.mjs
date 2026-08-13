// local-snapshot-loader.mjs — loads db/snapshots/production-snapshot.json
// (created by db/snapshot-production.mjs) for scripts that want to test
// against a real-data copy WITHOUT touching the live shared Supabase
// project. This is Izzat's chosen "staging ringan" — no Docker available
// for a local Supabase instance, no new Supabase project cost — a local
// file snapshot is the substitute, per docs/staging-environment-setup-plan-v1.md.
//
// Not a database — no writes, no SQL, no RLS. Just the read shape most
// verification scripts this session actually needed (real rows to
// reason about), available offline and free.

import { readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = `${__dirname}/snapshots/production-snapshot.json`;

export function loadLocalSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `No local snapshot found at ${SNAPSHOT_PATH}. Run: node db/snapshot-production.mjs`
    );
  }
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
}

// Convenience: same shape ranking/shadow-runner.mjs's loadFieldCandidates()
// produces from a live query, but from the local snapshot instead.
export function loadFieldCandidatesFromSnapshot(editionId, field) {
  const snapshot = loadLocalSnapshot();
  const trustById = new Map(snapshot.sources.map(s => [s.id, s.trust_score]));
  const placements = snapshot.placements.filter(p => p.edition_id === editionId && p.field === field);
  const idsInField = new Set(placements.map(p => p.story_id));

  const byCluster = new Map();
  for (const item of snapshot.rssItems) {
    if (!idsInField.has(item.cluster_id)) continue;
    const existing = byCluster.get(item.cluster_id);
    if (!existing || new Date(item.published_at) < new Date(existing.published_at)) {
      byCluster.set(item.cluster_id, item);
    }
  }
  const confidenceByCluster = new Map(placements.map(p => [p.story_id, p.classification_confidence]));

  return [...byCluster.entries()].map(([storyId, item]) => ({
    storyId,
    title: item.title,
    sourceId: item.source_id,
    publishedAt: item.published_at,
    trustScore: trustById.get(item.source_id) ?? 0,
    classificationConfidence: Number(confidenceByCluster.get(storyId) ?? 0),
  }));
}
