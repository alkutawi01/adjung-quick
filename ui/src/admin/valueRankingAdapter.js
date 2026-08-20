// valueRankingAdapter.js — Admin Console V2, "Nilai & Susunan" real data.
//
// Polish 8C (docs/polish-8-selection-audit-v1.md): generalized from a
// hardcoded ms-MY/politics-only module into the single adapter the unified
// NilaiSusunanPanel.jsx uses for ANY (editionId, fieldCode) — active or
// not. The pipeline itself is unchanged (still the exact production
// functions, unmodified): fetchRankedQueue() -> scoreCandidates() ->
// selectDiverseCandidates() -> applyEditorialComposition(). Whether the
// RESULT is "what the reader sees" or "pratonton" is a presentation
// decision the caller makes via getRankingVersion() -- this module always
// computes the real pipeline, honestly, for whatever field it's asked for.
//
// Data source: productionAdapter.js's fetchRankedQueue() -- the SAME
// corpus the real reader pipeline runs on (hidden/filtered stories already
// excluded). This was previously KaedahNilaiPanel/PemilihanPanel/
// SusunanAkhirPanel's separate concern (a different corpus via
// kaedahNilaiAdapter.fetchScoringCorpus) -- Polish 8C intentionally
// standardises on ONE corpus reader for the whole "Nilai & Susunan" surface
// so an active category and a not-yet-active category are never computed
// from two different data shapes on the same page.

import { fetchRankedQueue, fetchSourceNames } from '../adapter/productionAdapter.js';
import { getFieldLabel } from '../../../state/editions.js';
import { scoreCandidates } from '../../../ranking/candidate-scoring.mjs';
import { selectDiverseCandidates } from '../../../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../../../ranking/editorial-composition.mjs';
import { clusterToCandidate } from '../../../state/editorialRankingAdapter.js';

const CAPACITY = 10; // state/model.js's activeSetCapacity baseline

const REASON_LABELS = {
  displaced_for_source_diversity: 'Digantikan demi kepelbagaian sumber',
  source_diversity_opportunity: 'Dimasukkan demi kepelbagaian sumber',
  dominant_event_preserved: 'Peristiwa dominan sebenar, tiada gantian sesuai',
  no_diversity_candidate_available: 'Tiada calon sumber lain tersedia',
  source_diversity_preserved: 'Pilihan pertama daripada sumber ini',
  source_diversity_discounted: 'Penalti kepelbagaian dikenakan',
};

// Pure -- no I/O. Takes an already-built candidate list (clusterToCandidate
// shape, `pinned`/`pinnedAt` already attached) for ONE field and runs the
// real pipeline. Separated from fetchValueRankingData() below so this can
// be unit-tested with fixtures, no Supabase client required.
export function computeFieldRanking(candidates) {
  // Same pin extraction as state/reducer.js::selectFieldActiveSet -- pin
  // bypasses the ranking contest entirely, so it's separated BEFORE
  // scoring, not folded into the score. Capped at 2, oldest-pin-first.
  const pinned = candidates
    .filter(c => c.pinned)
    .sort((a, b) => new Date(a.pinnedAt ?? 0) - new Date(b.pinnedAt ?? 0))
    .slice(0, 2);
  const pinnedIds = new Set(pinned.map(c => c.storyId));
  const rest = candidates.filter(c => !pinnedIds.has(c.storyId));
  const remainingCapacity = Math.max(0, CAPACITY - pinned.length);

  const scored = scoreCandidates(rest);
  const diversitySelected = selectDiverseCandidates(scored, remainingCapacity);
  const diversitySelectedIds = new Set(diversitySelected.map(c => c.storyId));
  const alternativePool = scored.filter(c => !diversitySelectedIds.has(c.storyId));
  const { selected: composed, compositionReasons } = applyEditorialComposition(diversitySelected, { alternativePool });
  const composedIds = new Set(composed.map(c => c.storyId));

  // Status per Polish 8C's locked semantics -- Masuk/Kekal/Keluar now mean
  // something real about the selection -> composition transition, not a
  // comparison between two experimental score formulas:
  //   Dikekalkan editor — Pin (bypasses the contest entirely)
  //   Kekal            — selected by diversity, stays after composition
  //   Masuk            — NOT in diversity selection, added by composition swap
  //   Keluar           — WAS in diversity selection, displaced by composition
  //   Tidak dipilih    — never in the final set at any stage
  const rows = [];
  pinned.forEach((c, i) => {
    // `c` is already candidate-shaped here (this function's `candidates`
    // input is post-clusterToCandidate) -- no second conversion needed.
    // Reader production puts Pin at the front of the Active Set
    // (`[...pinned, ...ranked]`, state/reducer.js), so Pin genuinely
    // occupies position 1/2 -- leaving this `null` let the panel sort
    // Pin rows in among the unranked candidates below the real top 10
    // (8C.1 fix, ChatGPT-caught Admin/Reader mismatch).
    rows.push({ ...enrich(c), position: i + 1, status: 'Dikekalkan editor', reason: 'Pin oleh editor' });
  });
  composed.forEach((c, i) => {
    const wasInDiversitySelection = diversitySelectedIds.has(c.storyId);
    const status = wasInDiversitySelection ? 'Kekal' : 'Masuk';
    const compositionReason = compositionReasons[c.storyId]?.[0];
    const reason = compositionReason ? REASON_LABELS[compositionReason] : (c.reasons?.map(r => REASON_LABELS[r]).find(Boolean) ?? '—');
    rows.push({ ...enrich(c), position: pinned.length + i + 1, status, reason });
  });
  for (const c of diversitySelected) {
    if (composedIds.has(c.storyId)) continue; // already added above as 'Kekal'
    const compositionReason = compositionReasons[c.storyId]?.[0];
    rows.push({ ...enrich(c), position: null, status: 'Keluar', reason: compositionReason ? REASON_LABELS[compositionReason] : '—' });
  }
  const finalIds = new Set(rows.map(r => r.storyId));
  const notSelected = scored
    .filter(c => !finalIds.has(c.storyId))
    .sort((a, b) => b.score - a.score)
    .map(c => ({ ...enrich(c), position: null, status: 'Tidak dipilih', reason: '—' }));

  return [...rows, ...notSelected];
}

function enrich(candidate) {
  return {
    storyId: candidate.storyId,
    title: candidate.title,
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    score: candidate.score ?? candidate.finalScore,
    reasons: candidate.reasons,
  };
}

export async function fetchValueRankingData(supabase, editionId, fieldCode) {
  const [rankedQueue, sourceNameById] = await Promise.all([
    fetchRankedQueue(editionId),
    fetchSourceNames(),
  ]);
  const eligible = rankedQueue.filter(c => c.topic === fieldCode);
  const candidates = eligible.map(c => {
    const candidate = clusterToCandidate(c);
    return {
      ...candidate,
      sourceName: sourceNameById.get(candidate.sourceId) ?? candidate.sourceId,
      // clusterToCandidate() doesn't carry pin state (it's outside the
      // scoring-relevant shape) -- pulled from the raw rankedQueue row,
      // same as the pre-8C code did.
      pinned: c.pinned ?? false,
      pinnedAt: c.pinnedAt ?? null,
    };
  });

  const rows = computeFieldRanking(candidates);

  return {
    editionId,
    fieldCode,
    fieldLabel: getFieldLabel(editionId, fieldCode),
    rows,
  };
}
