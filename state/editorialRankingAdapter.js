// editorialRankingAdapter.js — bridges state/reducer.js's cluster shape
// to the ranking/ prototype's candidate shape, and back. Per
// docs/editorial-ranking-activation-policy-v1.md §5: candidate-scoring,
// diversity-selection, and editorial-composition are NOT modified for
// activation — this is the only new code, a thin adapter.
//
// The ranking/ modules are pure, synchronous functions (no I/O), so they
// can be called directly inside the reducer's own synchronous
// computation — no async boundary needed.

import { scoreCandidates } from '../ranking/candidate-scoring.mjs';
import { selectDiverseCandidates } from '../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../ranking/editorial-composition.mjs';

// Exported Pusingan 11/15 (2026-08-19, admin Nilai & Susunan panel) --
// same function, no behavior change. The admin panel needs to build the
// identical candidate shape to call scoreCandidates/selectDiverseCandidates/
// applyEditorialComposition itself (to show the intermediate stages this
// module's own selectEditorialActiveSet() collapses into one return
// value) -- exporting this avoids a second, potentially-drifting copy of
// the same mapping living in ui/src/admin/.
export function clusterToCandidate(clusterEntry) {
  return {
    storyId: clusterEntry.clusterKey,
    title: clusterEntry.canonical.title,
    sourceId: clusterEntry.canonical.sourceId,
    publishedAt: clusterEntry.canonical.publishedAt,
    trustScore: clusterEntry.canonical.trustScore ?? 0,
    classificationConfidence: clusterEntry.classificationConfidence ?? 0,
    // FASA 3.6.3c — set by productionAdapter.js from an active
    // story_overrides row of type 'boost'. Only consumed here, on the
    // editorial_v1 path; the legacy path never scores candidates at all,
    // which is exactly why boost is offered only where editorial_v1 is
    // active (docs/boost-action-plan-v1.md's blocking finding).
    boosted: clusterEntry.boosted ?? false,
  };
}

// eligible: array of cluster-shaped entries (the same objects
// toActiveSetEntries() produces — { clusterKey, canonical, representation,
// classificationConfidence, ... }). Returns the same shape, reordered/
// selected by the Editorial Ranking Engine, capped at `capacity`.
export function selectEditorialActiveSet(eligible, capacity) {
  const candidates = eligible.map(clusterToCandidate);
  const now = new Date();
  const scored = scoreCandidates(candidates, now);
  const diversitySelected = selectDiverseCandidates(scored, capacity);
  const alternativePool = scored.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected } = applyEditorialComposition(diversitySelected, { alternativePool });

  // Map back to the original cluster-shaped entries, in the Editorial
  // Ranking Engine's chosen order — preserving `representation` and every
  // other field the rest of the reducer/UI already relies on.
  const byId = new Map(eligible.map(e => [e.clusterKey, e]));
  return selected.map(s => byId.get(s.storyId)).filter(Boolean);
}
