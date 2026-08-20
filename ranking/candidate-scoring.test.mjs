// candidate-scoring.test.mjs — Polish 7D
// (docs/polish-7-scoring-calibration-v1.md). Per ChatGPT's exact required
// test list for the smooth-freshness formula that replaced the 5-step
// bucket. Run: node ranking/candidate-scoring.test.mjs

import { scoreCandidate, freshnessScore, BOOST_WEIGHT } from './candidate-scoring.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nCANDIDATE SCORING — smooth freshness (Polish 7D) test\n');

const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();
const hoursAhead = h => new Date(NOW.getTime() + h * 60 * 60 * 1000).toISOString();

function candidate(overrides) {
  return {
    storyId: 'x', sourceId: 's1', title: 't',
    publishedAt: hoursAgo(0), trustScore: 0, classificationConfidence: 0,
    ...overrides,
  };
}

// --- freshnessScore: exact values at the reference points ---
{
  assert('0 hours -> freshness 100', freshnessScore(hoursAgo(0), NOW) === 100,
    freshnessScore(hoursAgo(0), NOW));
  assert('72 hours -> freshness 50 (one half-life)',
    Math.abs(freshnessScore(hoursAgo(72), NOW) - 50) < 1e-9,
    freshnessScore(hoursAgo(72), NOW));
  assert('144 hours -> freshness 25 (two half-lives)',
    Math.abs(freshnessScore(hoursAgo(144), NOW) - 25) < 1e-9,
    freshnessScore(hoursAgo(144), NOW));
}

// --- invalid/missing publishedAt fails closed to the oldest score ---
{
  assert('invalid date -> freshness 0', freshnessScore('not-a-date', NOW) === 0);
  assert('missing publishedAt (undefined) -> freshness 0', freshnessScore(undefined, NOW) === 0);
}

// --- future-dated publishedAt (clock skew) clamps to ageHours=0, not a
// score above 100 ---
{
  assert('future timestamp (clock skew) -> freshness 100, not >100',
    freshnessScore(hoursAhead(5), NOW) === 100,
    freshnessScore(hoursAhead(5), NOW));
}

// --- confidenceModifier: classificationConfidence * 10 ---
{
  const scored = scoreCandidate(candidate({ classificationConfidence: 0.75 }), NOW);
  assert('classificationConfidence 0.75 -> confidenceModifier +7.5',
    scored.scoreBreakdown.confidenceModifier === 7.5,
    scored.scoreBreakdown.confidenceModifier);
}

// --- boosted=true currently contributes +0 (BOOST_WEIGHT=0, Polish 7D) ---
{
  assert('BOOST_WEIGHT is currently 0 (inactive pending Polish 8)', BOOST_WEIGHT === 0);
  const scored = scoreCandidate(candidate({ boosted: true }), NOW);
  assert('boosted=true still gives +0 while BOOST_WEIGHT=0',
    scored.scoreBreakdown.editorialBoost === 0);
  // ChatGPT's catch (Polish 7D review): reasons must reflect the ACTUAL
  // score contribution, not the raw `boosted` flag -- a boosted=true
  // legacy override that adds zero points must not be labelled
  // 'editorial_boost', or explainability would misrepresent the score
  // as human-influenced when it isn't.
  assert('boosted=true with BOOST_WEIGHT=0 does NOT surface the editorial_boost reason',
    !scored.reasons.includes('editorial_boost'));
}

// --- full score assembly sanity check ---
{
  const scored = scoreCandidate(candidate({ publishedAt: hoursAgo(72), trustScore: 90, classificationConfidence: 1 }), NOW);
  assert('score = freshness(50) + sourceTrust(90) + confidenceModifier(10) + boost(0) = 150',
    scored.score === 150, scored.score);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
