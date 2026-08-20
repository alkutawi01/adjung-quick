// boost-scoring.test.mjs — FASA 3.6.3c. Per ChatGPT's mandated
// verification layers 6 (score impact) and 7 (ranking integrity).
//
// Layer 7 is the one that matters most: a boost that ALWAYS wins is a pin
// wearing a different name. These tests exist to prove boost raises the
// chance of selection without guaranteeing placement.
//
// Run: node ranking/boost-scoring.test.mjs

import { scoreCandidate, BOOST_WEIGHT } from './candidate-scoring.mjs';
import { selectDiverseCandidates } from './diversity-selection.mjs';

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nEDITORIAL BOOST — scoring + ranking integrity test\n');

const NOW = new Date('2026-08-13T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

function candidate(overrides) {
  return {
    storyId: 'x', sourceId: 's1', title: 't',
    publishedAt: hoursAgo(1), trustScore: 50, classificationConfidence: 0.9,
    ...overrides,
  };
}

// --- Layer 6: score impact ---
{
  const plain = scoreCandidate(candidate({ boosted: false }), NOW);
  const boosted = scoreCandidate(candidate({ boosted: true }), NOW);
  assert('boost raises the score by exactly BOOST_WEIGHT',
    boosted.score - plain.score === BOOST_WEIGHT);
  assert('boost is surfaced in scoreBreakdown (explainability)',
    boosted.scoreBreakdown.editorialBoost === BOOST_WEIGHT && plain.scoreBreakdown.editorialBoost === 0);
  assert('boost is surfaced in reasons (an editor can see WHY it is here)',
    boosted.reasons.includes('editorial_boost') && !plain.reasons.includes('editorial_boost'));
  assert('boost does not alter the other scoring terms',
    boosted.scoreBreakdown.freshness === plain.scoreBreakdown.freshness &&
    boosted.scoreBreakdown.sourceTrust === plain.scoreBreakdown.sourceTrust &&
    boosted.scoreBreakdown.confidenceModifier === plain.scoreBreakdown.confidenceModifier);
}

// --- Layer 6b: a boost can lift a story that would otherwise lose ---
// Polish 7D (docs/polish-7-scoring-calibration-v1.md): BOOST_WEIGHT is
// currently 0 -- Polish 7C's synthetic sensitivity testing found every
// tested nonzero weight (+3/+5/+8) routinely let a mid/weak candidate
// reach #1 in the real (heavily clustered) corpus, so boost stays
// inactive pending Polish 8 rather than guess a number. With weight 0,
// "a boosted underdog can overtake a rival" is structurally impossible
// -- that's the CORRECT, intended behavior right now, not a regression.
// This proof becomes meaningful again once Polish 8 sets BOOST_WEIGHT > 0.
{
  const underdog = scoreCandidate(candidate({ storyId: 'underdog', publishedAt: hoursAgo(12), trustScore: 40, classificationConfidence: 0, boosted: true }), NOW);
  const rival = scoreCandidate(candidate({ storyId: 'rival', publishedAt: hoursAgo(1), trustScore: 45, classificationConfidence: 0 }), NOW);
  if (BOOST_WEIGHT > 0) {
    assert('Layer 6b — a boosted underdog CAN overtake a rival it would otherwise lose to',
      underdog.score > rival.score);
  } else {
    assert('Layer 6b — SKIPPED (BOOST_WEIGHT=0, inactive pending Polish 8): underdog correctly does NOT overtake the rival',
      underdog.score < rival.score);
  }
}

// --- Layer 7: ranking integrity — boost must be able to LOSE ---
{
  // A boosted but genuinely weak story: 8 days old (freshness 0), low trust
  // 10 -> 10 + 40 = 50. A strong rival: 1h old (100) + trust 95 = 195.
  // If boost could beat this, it would be a guarantee, not a chance.
  const weakBoosted = scoreCandidate(candidate({ storyId: 'weak', publishedAt: hoursAgo(24 * 8), trustScore: 10, classificationConfidence: 0, boosted: true }), NOW);
  const strong = scoreCandidate(candidate({ storyId: 'strong', publishedAt: hoursAgo(1), trustScore: 95, classificationConfidence: 0 }), NOW);
  assert('Layer 7 — a boosted stale/low-trust story STILL LOSES to a strong candidate (boost != pin)',
    weakBoosted.score < strong.score);
}

// --- Layer 7b: boost does not defeat diversity selection ---
{
  // Five boosted stories all from ONE source, plus one unboosted story from
  // another. If boost overrode diversity, the single source would take every
  // slot. Diversity must still admit the other source.
  // Titles must be genuinely distinct: diversity-selection.mjs also runs a
  // near-duplicate title filter, and identical titles would collapse to one
  // pick for that reason instead of the source-dominance reason under test.
  const sameSource = Array.from({ length: 5 }, (_, i) =>
    scoreCandidate(candidate({ storyId: `same-${i}`, title: `Dominant source story number ${i} about topic ${i}`, sourceId: 'dominant', publishedAt: hoursAgo(1), boosted: true }), NOW));
  const otherSource = scoreCandidate(candidate({ storyId: 'other', title: 'Independent outlet reports a completely separate matter', sourceId: 'independent', publishedAt: hoursAgo(20), trustScore: 30, classificationConfidence: 0 }), NOW);

  const selected = selectDiverseCandidates([...sameSource, otherSource], 3);
  const sourcesPicked = new Set(selected.map(s => s.sourceId));
  assert('Layer 7b — boost does not let one source monopolise the Active Set; diversity still applies',
    sourcesPicked.size > 1);
}

// --- BOOST_WEIGHT is a single configurable constant ---
// Polish 7D: value is intentionally 0 right now (inactive pending Polish
// 8) -- no longer asserting > 0, only that it's a valid non-negative
// tunable number in one place.
{
  assert('BOOST_WEIGHT is exported as a single tunable constant (per ChatGPT: one place only)',
    typeof BOOST_WEIGHT === 'number' && BOOST_WEIGHT >= 0);
}

// --- Polish 7D: boosted=true currently contributes +0 (explicit per
// ChatGPT's required test list, docs/polish-7-scoring-calibration-v1.md) ---
{
  const boosted = scoreCandidate(candidate({ boosted: true }), NOW);
  assert('boosted=true currently gives +0 (BOOST_WEIGHT inactive, Polish 7D)',
    boosted.scoreBreakdown.editorialBoost === 0);
}

// --- unboosted candidates are entirely unaffected ---
{
  const noFlag = scoreCandidate(candidate({}), NOW); // `boosted` undefined
  assert('a candidate with no `boosted` field scores exactly as before (no regression)',
    noFlag.scoreBreakdown.editorialBoost === 0 && !noFlag.reasons.includes('editorial_boost'));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
