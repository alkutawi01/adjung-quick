// valueRankingAdapter.js — Admin Console V2, "Nilai & Susunan" real data.
//
// Pusingan 11/15 (2026-08-19). Per ChatGPT: stop being an explanatory
// page, show what the system is actually choosing and why.
//
// Traced first (state/rankingFlags.js, state/reducer.js::selectFieldActiveSet):
// the real, explainable Editorial Ranking Engine (candidate-scoring ->
// diversity-selection -> editorial-composition) is LIVE for exactly ONE
// (edition, field): ms-MY / politics. Every other field/edition uses the
// legacy path -- plain stored editorial_score order, no per-candidate
// breakdown, no diversity/composition reasoning to show. This module
// therefore only computes the real pipeline for ms-MY/politics; nothing
// here is invented for fields that don't have it.
//
// Reuses the EXACT pure functions production already calls (imported
// unmodified from ranking/*.mjs and state/editorialRankingAdapter.js's
// exported clusterToCandidate) rather than a re-implementation -- this
// module's only job is to call them from the admin side and expose each
// intermediate stage (score -> diversity selection -> composition) that
// state/reducer.js's selectFieldActiveSet() normally collapses into one
// return value, so the admin can see the difference between Nilai,
// Pemilihan, and Susunan Akhir instead of just the final list.
//
// Data source: productionAdapter.js's fetchRankedQueue() -- the SAME
// corpus the real reader pipeline runs on (hidden/filtered stories
// already excluded, matching what a reader's Active Set selection would
// actually draw from). Admin-authenticated `supabase` client is used only
// for the promotional-override id lookup below (boost/pin ids aren't
// carried on rankedQueue entries); the ranked queue read itself goes
// through the same reader-facing adapter, unmodified.

import { fetchRankedQueue, fetchSourceNames } from '../adapter/productionAdapter.js';
import { getFieldLabel } from '../../../state/editions.js';
import { scoreCandidates } from '../../../ranking/candidate-scoring.mjs';
import { selectDiverseCandidates } from '../../../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../../../ranking/editorial-composition.mjs';
import { clusterToCandidate } from '../../../state/editorialRankingAdapter.js';

export const RANKED_EDITION_ID = 'ms-MY';
export const RANKED_FIELD_CODE = 'politics';
const CAPACITY = 10; // state/model.js's activeSetCapacity baseline

const REASON_LABELS = {
  displaced_for_source_diversity: 'Digantikan demi kepelbagaian sumber',
  source_diversity_opportunity: 'Dimasukkan demi kepelbagaian sumber',
  dominant_event_preserved: 'Peristiwa dominan sebenar, tiada gantian sesuai',
  no_diversity_candidate_available: 'Tiada calon sumber lain tersedia',
};

export async function fetchValueRankingData(supabase) {
  const [rankedQueue, sourceNameById] = await Promise.all([
    fetchRankedQueue(RANKED_EDITION_ID),
    fetchSourceNames(),
  ]);
  const eligible = rankedQueue.filter(c => c.topic === RANKED_FIELD_CODE);

  // Same pin extraction as state/reducer.js::selectFieldActiveSet -- pin
  // bypasses the ranking contest entirely, so it's separated BEFORE
  // scoring, not folded into the score.
  const pinned = eligible
    .filter(c => c.pinned)
    .sort((a, b) => new Date(a.pinnedAt ?? 0) - new Date(b.pinnedAt ?? 0))
    .slice(0, 2);
  const pinnedIds = new Set(pinned.map(c => c.clusterKey));
  const rest = eligible.filter(c => !pinnedIds.has(c.clusterKey));
  const remainingCapacity = Math.max(0, CAPACITY - pinned.length);

  const candidates = rest.map(clusterToCandidate);
  const scored = scoreCandidates(candidates);
  const diversitySelected = selectDiverseCandidates(scored, remainingCapacity);
  const alternativePool = scored.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected: composed, compositionReasons } = applyEditorialComposition(diversitySelected, { alternativePool });

  const storyIds = eligible.map(c => c.clusterKey);
  const promo = storyIds.length > 0 ? await fetchPromotionalOverrideIds(supabase, RANKED_EDITION_ID, storyIds) : new Map();

  const enrich = candidate => {
    const promoIds = promo.get(candidate.storyId) ?? {};
    return {
      storyId: candidate.storyId,
      title: candidate.title,
      sourceName: sourceNameById.get(candidate.sourceId) ?? candidate.sourceId,
      fieldLabel: getFieldLabel(RANKED_EDITION_ID, RANKED_FIELD_CODE),
      score: candidate.score ?? candidate.finalScore,
      boosted: candidate.boosted,
      boostOverrideId: promoIds.boostOverrideId ?? null,
      pinOverrideId: promoIds.pinOverrideId ?? null,
    };
  };

  return {
    editionLabel: RANKED_EDITION_ID,
    fieldLabel: getFieldLabel(RANKED_EDITION_ID, RANKED_FIELD_CODE),
    // Fokus 1 — every scored candidate (the full eligible pool minus
    // pinned, since pinned bypasses scoring entirely), sorted by real
    // stored score.
    scoredCandidates: [...scored].sort((a, b) => b.score - a.score).map(enrich),
    // Fokus 2 — pinned (Dikekalkan) + Diversity Selection's real order,
    // then whatever didn't make it in (Tidak terpilih), so the table
    // shows the full contest outcome, not just the winners.
    selection: [
      ...pinned.map(c => ({ ...enrich(clusterToCandidate(c)), reason: 'Dikekalkan', pinned: true, kedudukan: null })),
      ...diversitySelected.map((c, i) => ({
        ...enrich(c),
        reason: c.boosted ? 'Keutamaan editor' : 'Dipilih',
        pinned: false,
        kedudukan: pinned.length + i + 1,
      })),
      ...alternativePool
        .filter(c => !diversitySelected.some(s => s.storyId === c.storyId))
        .map(c => ({ ...enrich(c), reason: 'Tidak terpilih', pinned: false, kedudukan: null })),
    ],
    // Fokus 3 — the actual final Active Set order (pinned + composed),
    // with composition's own reason codes where a swap happened.
    finalOrder: [
      ...pinned.map(c => ({ ...enrich(clusterToCandidate(c)), reason: 'Dikekalkan', kedudukan: null })),
      ...composed.map((c, i) => ({
        ...enrich(c),
        reason: REASON_LABELS[compositionReasons[c.storyId]?.[0]] ?? (c.boosted ? 'Keutamaan editor' : 'Dipilih'),
        kedudukan: pinned.length + i + 1,
      })),
    ],
  };
}

// Same query shape as reviewQueueAdapter.js's promotionalOverrides query
// (boost/pin, active, unexpired) -- parameterized to an arbitrary story
// id list instead of that adapter's implicit review-queue set, since this
// panel's eligible pool is a different corpus. Not new write/business
// logic, just the existing read pattern reused for a different row set.
async function fetchPromotionalOverrideIds(supabase, editionId, storyIds) {
  const { data, error } = await supabase.from('story_overrides')
    .select('id, story_id, override_type')
    .eq('edition_id', editionId)
    .eq('active', true)
    .in('override_type', ['boost', 'pin'])
    .gt('expires_at', new Date().toISOString())
    .in('story_id', storyIds);
  if (error) throw new Error(`fetchPromotionalOverrideIds: ${error.message}`);

  const map = new Map();
  for (const row of data) {
    if (!map.has(row.story_id)) map.set(row.story_id, {});
    if (row.override_type === 'boost') map.get(row.story_id).boostOverrideId = row.id;
    else map.get(row.story_id).pinOverrideId = row.id;
  }
  return map;
}
