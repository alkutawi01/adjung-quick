// editorial-composition.mjs — Editorial Ranking Engine, Stage 3: Editorial
// Composition v0.1. Per docs/editorial-composition-policy-v1.md /
// docs/editorial-composition-benchmark-v1.md.
//
// PROTOTYPE — isolated, not wired into production.
//
// Composition is NOT a second ranking pass. It receives already-ranked,
// already-diversity-selected candidates and asks one narrower question:
// does this final set look like a deliberately-composed editorial page,
// or one source's output list? It never re-scores, never re-orders by
// score, and never forces diversity that isn't actually available at a
// quality floor.
//
// v0.1 scope, per ChatGPT: source dominance + quality floor only. NOT
// included yet (deliberately): AI judgement, topic/angle understanding,
// manual editorial weighting, editorial classes A-D (headline/update/
// context/niche) — those wait for their own policy documents.

// EXPERIMENTAL PARAMETERS — status: calibration required. Per ChatGPT
// (2026-08-13): these are NOT a final editorial decision, just a
// starting point for evaluation. A field with many sources (Politik)
// and a field with almost none (Sains: 7 candidates, Agama: 1-2 real
// sources) will very plausibly need different thresholds — one number
// is not expected to fit every field. Do not treat 0.5/0.75 as locked
// until real cross-field benchmark results (see
// docs/ranking-engine-small-field-production-benchmark.md) say otherwise.
const DOMINANCE_SHARE_THRESHOLD = 0.5; // a source holding >50% of slots triggers a look for a swap
const QUALITY_FLOOR_RATIO = 0.75; // a replacement must score at least 75% of the candidate it would replace

export function applyEditorialComposition(candidates, options = {}) {
  const dominanceShareThreshold = options.dominanceShareThreshold ?? DOMINANCE_SHARE_THRESHOLD;
  const qualityFloorRatio = options.qualityFloorRatio ?? QUALITY_FLOOR_RATIO;

  // Step 1: accept ranked candidates as-is. Composition is not a second
  // ranking engine — it never resorts by score.
  const selected = [...candidates];
  const compositionReasons = {};

  // Step 2: detect dominance. On a genuinely small field (Case E — Sains
  // with 5 real candidates), there's nothing to correct: forcing
  // diversity onto a thin pool is exactly the "fake diversity" ChatGPT
  // warned against.
  if (selected.length === 0) return { selected, compositionReasons };

  const sourceCounts = new Map();
  selected.forEach(c => sourceCounts.set(c.sourceId, (sourceCounts.get(c.sourceId) ?? 0) + 1));
  const [dominantSource, dominantCount] = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominantShare = dominantCount / selected.length;

  if (dominantShare <= dominanceShareThreshold) {
    return { selected, compositionReasons }; // nothing to do — no source dominates
  }

  // Step 3: look for a replacement opportunity. Only ever replace the
  // dominant source's LOWEST-scoring selected candidate (never a top
  // performer — this is the quality floor), and only with an
  // under-represented source's candidate that itself clears the quality
  // floor ratio against what it would replace. If nothing qualifies
  // (Case C — a genuine dominant event where every source legitimately
  // covers the same story, so there IS no real alternative candidate),
  // no swap happens — this is the mechanism that keeps Case C honest
  // without a hardcoded "don't touch earthquakes" rule.
  const dominantSourceCandidates = selected
    .filter(c => c.sourceId === dominantSource)
    .sort((a, b) => a.score - b.score); // ascending — weakest first
  const weakestDominant = dominantSourceCandidates[0];

  const otherSourceCandidates = (options.alternativePool ?? [])
    .filter(c => c.sourceId !== dominantSource)
    .filter(c => !selected.some(s => s.storyId === c.storyId));

  // Per ChatGPT (2026-08-13, after the small-field production benchmark):
  // "0 swap" is not one category. Distinguish WHY nothing was swapped —
  // these are structurally different situations that happen to produce
  // the same mechanical outcome:
  if (otherSourceCandidates.length === 0) {
    // No candidate from any other source exists in the pool AT ALL —
    // this is a genuine single-source field (Sains/Pendidikan in
    // docs/ranking-engine-small-field-production-benchmark.md: only
    // rss-mosti / rss-kpm exist for that field, period).
    compositionReasons[weakestDominant.storyId] = ['no_diversity_candidate_available'];
    return { selected, compositionReasons };
  }

  const underrepresentedAlternatives = otherSourceCandidates
    .filter(c => c.score >= weakestDominant.score * qualityFloorRatio)
    .sort((a, b) => b.score - a.score); // strongest qualifying alternative first

  if (underrepresentedAlternatives.length === 0) {
    // Alternatives DO exist, but none clear the quality floor — this is
    // Case C (genuine dominant event): every source is legitimately
    // reporting the same big story, so what's sitting in the pool from
    // other sources is real but genuinely weaker, not a viable swap.
    compositionReasons[weakestDominant.storyId] = ['dominant_event_preserved'];
    return { selected, compositionReasons };
  }

  const replacement = underrepresentedAlternatives[0];
  const idx = selected.findIndex(s => s.storyId === weakestDominant.storyId);
  selected[idx] = replacement;
  compositionReasons[replacement.storyId] = ['source_diversity_opportunity'];
  compositionReasons[weakestDominant.storyId] = ['displaced_for_source_diversity'];

  return { selected, compositionReasons };
}
