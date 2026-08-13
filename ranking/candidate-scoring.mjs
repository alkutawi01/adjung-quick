// candidate-scoring.mjs — Editorial Ranking Engine, Stage 1: Candidate
// Scoring. Per docs/ranking-engine-contract-v1.md §3 / docs/ranking-engine-selection-policy-v1.md.
//
// LIVE IN PRODUCTION for ms-MY.Politik (state/rankingFlags.js's
// editorial_v1), via state/editorialRankingAdapter.js and
// state/reducer.js. (Corrected 2026-08-13 — this comment previously
// called it an isolated prototype "not wired into production," which
// the exhaustive-audit-findings-v1.md session found was stale and
// misleading about this file's real blast radius.)
//
// Scores ONLY. Never sorts, never picks 10, never applies diversity —
// that is diversity-selection.mjs's job. Deliberately excludes:
// Field Relevance (a placeholder per the contract — every candidate here
// is already field-filtered upstream, so it contributes nothing yet),
// classes A-D "editorial composition" (headline/update/context/niche —
// still policy concepts, no operational definition), AI, user behaviour.
//
// candidateScore = freshness + sourceTrust + optional confidenceModifier

// Freshness buckets — explicitly a STARTING PARAMETER (contract §3A),
// not locked. Same shape for every field in this prototype; per-field
// tuning is future calibration work, not done here.
const FRESHNESS_BUCKETS = [
  { maxHours: 6, score: 100 },
  { maxHours: 24, score: 80 },
  { maxHours: 24 * 3, score: 50 },
  { maxHours: 24 * 7, score: 20 },
  { maxHours: Infinity, score: 0 },
];

// Fixed 2026-08-13 (audit finding, docs/exhaustive-audit-findings-v1.md
// HIGH): a missing/unparseable publishedAt produced NaN hours, which
// satisfies no bucket's <= comparison (not even the Infinity one), so
// .find() returned undefined and `.score` threw — crashing ranking for
// the entire edition/field, not just the one bad candidate. Guarded to
// degrade to the oldest bucket (score 0) instead: a story with no known
// publish time should rank as if it's old, not take the whole pipeline
// down.
export function freshnessScore(publishedAt, now = new Date()) {
  const hours = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  if (Number.isNaN(hours)) return 0;
  const bucket = FRESHNESS_BUCKETS.find(b => hours <= b.maxHours);
  return bucket.score;
}

// Editorial Boost weight (FASA 3.6.3c). THE single place this number
// lives — per ChatGPT's explicit instruction not to hardcode it in
// several files, since real data may show +40 is too strong or too weak
// and it must be adjustable in one edit.
//
// Sized against the other terms (freshness 0–100, sourceTrust 0–~100,
// confidence 0–10): +40 is roughly two freshness buckets — enough to
// lift a good-but-older story into contention, not enough to let a stale
// story from a weak source beat a fresh one from a trusted source. A
// starting parameter for calibration, exactly like FRESHNESS_BUCKETS
// above, not a locked truth.
//
// This magnitude is what keeps boost honest: boost must raise the CHANCE
// of selection, never guarantee it (docs/boost-action-plan-v1.md §1). A
// weight large enough to always win would make boost a pin in disguise.
export const BOOST_WEIGHT = 40;

// candidate: { storyId, title, sourceId, publishedAt, trustScore, classificationConfidence, boosted }
// trustScore comes from lab/sources.js (NOT sourceType — the KPM lesson:
// per docs/ranking-engine-contract-v1.md §3B).
export function scoreCandidate(candidate, now = new Date()) {
  const freshness = freshnessScore(candidate.publishedAt, now);
  const sourceTrust = candidate.trustScore ?? 0;
  // Confidence Modifier — small, optional, never dominant. Per contract
  // §3C: confidence measures evidence certainty, not story importance,
  // so it contributes a capped, secondary amount only.
  const confidenceModifier = (candidate.classificationConfidence ?? 0) * 10;
  // Editorial Boost — a human signal added at SCORING (never after
  // selection, which would make it a no-op since diversity-selection
  // already truncates to capacity). Per
  // docs/ranking-engine-contract-v1.md's amendment.
  const editorialBoost = candidate.boosted ? BOOST_WEIGHT : 0;

  const score = freshness + sourceTrust + confidenceModifier + editorialBoost;
  const reasons = [];
  if (freshness >= 80) reasons.push('fresh');
  if (sourceTrust >= 85) reasons.push('trusted_source');
  if ((candidate.classificationConfidence ?? 0) < 0.5) reasons.push('low_confidence_placement');
  // Surfaced in reasons so boost stays EXPLAINABLE — an editor must be
  // able to see that a human decision, not the algorithm alone, is why
  // this story is here (docs/ranking-engine-contract-v1.md's
  // explainability requirement).
  if (candidate.boosted) reasons.push('editorial_boost');

  return { ...candidate, score, scoreBreakdown: { freshness, sourceTrust, confidenceModifier, editorialBoost }, reasons };
}

export function scoreCandidates(candidates, now = new Date()) {
  return candidates.map(c => scoreCandidate(c, now));
}
