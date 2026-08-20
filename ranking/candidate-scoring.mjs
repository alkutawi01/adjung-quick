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

// Freshness — smooth exponential decay, 72-hour half-life (Polish 7D,
// docs/polish-7-scoring-calibration-v1.md). Replaces the old 5-step
// bucket, which collapsed most of the real ms-MY.politics corpus into
// one or two identical scores (19 of 21 candidates tied within 0.1
// points) because two stories published hours apart within the same
// bucket scored identically. Still a STARTING PARAMETER (contract §3A),
// not locked; per-field tuning is future calibration work.
//
// freshness(hours) = 100 * 0.5^(hours / 72) -- exactly 100 at 0h, 50 at
// 72h, 25 at 144h, approaching 0 for very old stories, never a hard
// floor (unlike the old bucket's flat 0 past 7 days).
const FRESHNESS_HALF_LIFE_HOURS = 72;

// Fixed 2026-08-13 (audit finding, docs/exhaustive-audit-findings-v1.md
// HIGH): a missing/unparseable publishedAt produced NaN hours, which
// satisfies no bucket's <= comparison (not even the Infinity one), so
// .find() returned undefined and `.score` threw — crashing ranking for
// the entire edition/field, not just the one bad candidate. Guarded to
// degrade to the oldest score (0) instead: a story with no known
// publish time should rank as if it's old, not take the whole pipeline
// down. A future-dated publishedAt (clock skew between the source and
// this server) is clamped to ageHours=0 (freshness=100) rather than a
// negative age, which the exponential would otherwise turn into a score
// above 100 (Polish 7D, ChatGPT's explicit instruction).
export function freshnessScore(publishedAt, now = new Date()) {
  const hours = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  if (Number.isNaN(hours)) return 0;
  const ageHours = Math.max(0, hours);
  return 100 * Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
}

// Editorial Boost weight (FASA 3.6.3c). THE single place this number
// lives — per ChatGPT's explicit instruction not to hardcode it in
// several files, since real data may show what weight is too strong or
// too weak and it must be adjustable in one edit.
//
// SET TO 0 (Polish 7D, docs/polish-7-scoring-calibration-v1.md): boost
// has never been exercised in real production (0 story_overrides boost
// rows, ever), and synthetic sensitivity testing across +3/+5/+8 in
// Polish 7C found that even the smallest tested weight routinely lifted
// a mid-ranked or weak candidate straight to #1 in 3 of 5 tested
// categories, because the real corpus is heavily clustered/tied. A
// weight that reliably wins is a pin wearing a different name
// (docs/boost-action-plan-v1.md §1) -- so boost stays inactive rather
// than guess a number. Re-evaluate once Polish 8 tests real selection
// behavior. The Admin UI's Boost action is hidden while this is 0 so
// editors are never shown a control that silently does nothing.
export const BOOST_WEIGHT = 0;

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
