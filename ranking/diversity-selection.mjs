// diversity-selection.mjs — Editorial Ranking Engine, Stage 2: Diversity
// Selection. Per docs/ranking-engine-selection-policy-v1.md: NOT
// sort(score).slice(0,10) — that fails Benchmark v2 (one dominant source
// can still take every slot). This is an incremental, constraint-aware
// picker: select the best REMAINING candidate one at a time, but each
// pick's effective priority is discounted by how much its own source
// (and near-duplicate event) is already represented in what's been
// selected so far — so dominance is reduced organically as picks
// accumulate, never via a hardcoded cap ("Astro <= 6" is explicitly
// rejected in docs/ranking-engine-contract-v1.md §3E/§3F).
//
// PROTOTYPE — isolated, not wired into production. See candidate-scoring.mjs.

// Cheap, deliberately simple near-duplicate signal: normalize a title
// (lowercase, strip punctuation/whitespace-runs) and compare word-set
// overlap. Exists as a SAFETY NET against clustering gaps, per ChatGPT:
// "walaupun upstream sudah cluster, test Kayveas/Maglin mesti kekal" —
// this is not a replacement for lab/engine.js's own clustering, just a
// second check at the ranking boundary.
function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a, b) {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union; // Jaccard similarity
}

const NEAR_DUPLICATE_THRESHOLD = 0.6; // starting parameter, not locked

// Proportional dominance reduction — NOT a hard cap. Each already-selected
// pick from the same source multiplicatively discounts further picks from
// that source. discountFactor is a starting parameter (contract §3E),
// tunable once real selection results exist to evaluate.
const SOURCE_DOMINANCE_DISCOUNT = 0.6;

export function selectDiverseCandidates(scoredCandidates, capacity = 10) {
  const remaining = [...scoredCandidates];
  const selected = [];
  const sourceCounts = new Map();

  while (selected.length < capacity && remaining.length > 0) {
    let bestIdx = -1;
    let bestEffectiveScore = -Infinity;
    let bestReason = null;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Near-duplicate check: skip candidates that are a near-duplicate
      // of something already selected — one representative per event.
      const duplicateOf = selected.find(s => titleSimilarity(s.title, candidate.title) >= NEAR_DUPLICATE_THRESHOLD);
      if (duplicateOf) continue;

      const priorPicks = sourceCounts.get(candidate.sourceId) ?? 0;
      const dominanceMultiplier = Math.pow(SOURCE_DOMINANCE_DISCOUNT, priorPicks);
      const effectiveScore = candidate.score * dominanceMultiplier;

      if (effectiveScore > bestEffectiveScore) {
        bestEffectiveScore = effectiveScore;
        bestIdx = i;
        bestReason = priorPicks > 0 ? 'source_diversity_discounted' : null;
      }
    }

    if (bestIdx === -1) break; // everything remaining is a near-duplicate of what's selected

    const [picked] = remaining.splice(bestIdx, 1);
    const priorPicks = sourceCounts.get(picked.sourceId) ?? 0;
    sourceCounts.set(picked.sourceId, priorPicks + 1);

    const reasons = [...picked.reasons];
    if (priorPicks === 0) reasons.push('source_diversity_preserved');
    if (bestReason) reasons.push(bestReason);

    selected.push({
      ...picked,
      finalScore: bestEffectiveScore,
      selected: true,
      reasons,
    });
  }

  return selected;
}
