// boost-v1-simulation.mjs — Polish 8D-B, ChatGPT-scoped read-only
// simulation. Does NOT touch production code, DB, BOOST_WEIGHT, or
// RANKING_FLAGS -- reads the real production corpus (via
// ranking/shadow-runner.mjs's loadFieldCandidates(), the same read-only
// prototype loader already used for shadow-mode comparisons) and runs
// the exact production pipeline shape (scoreCandidates -> synthetic
// boost delta -> selectDiverseCandidates -> applyEditorialComposition)
// against synthetic +1/+2/+3 deltas on three candidate types per
// category: boundary (rank ~11/12), median, and weak (lower quartile).
//
// Usage: node lab/boost-v1-simulation.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadEditionsFromDB } from '../state/editions.js';
import { loadFieldCandidates } from '../ranking/shadow-runner.mjs';
import { scoreCandidates } from '../ranking/candidate-scoring.mjs';
import { selectDiverseCandidates } from '../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../ranking/editorial-composition.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CAPACITY = 10;
const DELTAS = [1, 2, 3];

function runSelection(scoredCandidates) {
  const diversitySelected = selectDiverseCandidates(scoredCandidates, CAPACITY);
  const alternativePool = scoredCandidates.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected } = applyEditorialComposition(diversitySelected, { alternativePool });
  return selected;
}

function rankOf(storyId, orderedByScoreDesc) {
  const idx = orderedByScoreDesc.findIndex(c => c.storyId === storyId);
  return idx === -1 ? null : idx + 1;
}

async function main() {
  const EDITIONS = await loadEditionsFromDB(supabase);
  const report = [];
  for (const edition of Object.values(EDITIONS)) {
    for (const fieldCode of edition.taxonomyFieldCodes) {
      let candidates;
      try {
        candidates = await loadFieldCandidates(edition.editionId, fieldCode);
      } catch (err) {
        console.error(`SKIP ${edition.editionId}/${fieldCode}: load error — ${err.message}`);
        continue;
      }
      if (candidates.length < 12) {
        report.push({ edition: edition.editionId, field: fieldCode, skipped: true, candidateCount: candidates.length });
        continue;
      }

      const baseScored = scoreCandidates(candidates);
      const byScoreDesc = [...baseScored].sort((a, b) => b.score - a.score);
      const baseSelected = runSelection(baseScored);
      const baseSelectedIds = new Set(baseSelected.map(c => c.storyId));
      const baseFinalOrder = baseSelected.map(c => c.storyId); // composition-applied order

      const n = byScoreDesc.length;
      const boundaryIdx = Math.min(11, n - 1); // rank 12 (0-indexed 11), or last if fewer
      const medianIdx = Math.floor(n / 2);
      const weakIdx = Math.min(n - 1, Math.floor(n * 0.75)); // lower quartile by rank

      const pick = (idx, label) => {
        const c = byScoreDesc[idx];
        if (!c) return null;
        return { candidate: c, label, originalRank: idx + 1, originalFinal: baseSelectedIds.has(c.storyId) };
      };

      const targets = [pick(boundaryIdx, 'Sempadan Top 10'), pick(medianIdx, 'Pertengahan'), pick(weakIdx, 'Lemah')]
        .filter(Boolean)
        // de-dup if small corpus collapses indices onto the same candidate
        .filter((t, i, arr) => arr.findIndex(x => x.candidate.storyId === t.candidate.storyId) === i);

      for (const target of targets) {
        for (const delta of DELTAS) {
          const boosted = baseScored.map(c =>
            c.storyId === target.candidate.storyId ? { ...c, score: c.score + delta } : c
          );
          const boostedByScoreDesc = [...boosted].sort((a, b) => b.score - a.score);
          const boostedSelected = runSelection(boosted);
          const boostedSelectedIds = new Set(boostedSelected.map(c => c.storyId));
          const boostedFinalOrder = boostedSelected.map(c => c.storyId);

          const newScoreRank = rankOf(target.candidate.storyId, boostedByScoreDesc);
          const inFinalAfter = boostedSelectedIds.has(target.candidate.storyId);
          const finalPositionAfter = inFinalAfter ? boostedFinalOrder.indexOf(target.candidate.storyId) + 1 : null;
          const finalPositionBefore = target.originalFinal ? baseFinalOrder.indexOf(target.candidate.storyId) + 1 : null;
          const positionsMoved = (finalPositionBefore != null && finalPositionAfter != null)
            ? finalPositionBefore - finalPositionAfter
            : null;

          // who got displaced: in base final set but not in boosted final set
          const displaced = baseFinalOrder.filter(id => !boostedSelectedIds.has(id));

          const compositionChangedElsewhere = baseFinalOrder
            .filter(id => id !== target.candidate.storyId)
            .some(id => !boostedSelectedIds.has(id)) &&
            !(displaced.length === 1 && !target.originalFinal && inFinalAfter); // more than just target's own swap

          report.push({
            edition: edition.editionId,
            field: fieldCode,
            candidateType: target.label,
            storyId: target.candidate.storyId,
            title: target.candidate.title,
            originalRank: target.originalRank,
            originalFinal: target.originalFinal,
            delta,
            newScoreRank,
            enteredFinal: !target.originalFinal && inFinalAfter,
            leftFinal: target.originalFinal && !inFinalAfter,
            finalPositionBefore,
            finalPositionAfter,
            positionsMoved,
            displacedStoryIds: displaced.filter(id => id !== target.candidate.storyId),
            compositionChangedElsewhere,
            becameTop3: finalPositionAfter != null && finalPositionAfter <= 3,
            becameNumber1: finalPositionAfter === 1,
            pinLikeFlag: (target.label !== 'Sempadan Top 10') && finalPositionAfter != null && finalPositionAfter <= 3,
          });
        }
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
