// ranking-engine.test.mjs — deterministic unit tests for the ranking
// prototype, using FIXED synthetic timestamps/candidates (not live DB
// data, which drifts as production re-ingests). Complements
// benchmark-runner.mjs, which runs against real (changing) production
// data — this file exists so the pipeline's own logic can be verified
// without depending on what happens to be in the DB right now.
//
// Run: node ranking/ranking-engine.test.mjs

import { scoreCandidates } from './candidate-scoring.mjs';
import { selectDiverseCandidates } from './diversity-selection.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nRANKING ENGINE PROTOTYPE — deterministic unit tests\n');

const NOW = new Date('2026-08-13T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

// --- Freshness/trust tie-break (Benchmark v1 Group A shape) ---
{
  const candidates = [
    { storyId: 'fresh-medium-trust', title: 'Fresh medium trust story', sourceId: 'src-a', publishedAt: hoursAgo(2), trustScore: 80, classificationConfidence: 0.6 },
    { storyId: 'old-high-trust', title: 'Old high trust story', sourceId: 'src-b', publishedAt: hoursAgo(72), trustScore: 95, classificationConfidence: 0.9 },
  ];
  const scored = scoreCandidates(candidates, NOW);
  const fresh = scored.find(c => c.storyId === 'fresh-medium-trust');
  const old = scored.find(c => c.storyId === 'old-high-trust');
  assert('Fresh+medium-trust beats old+high-trust when freshness gap is large enough (100 vs 50 bucket)',
    fresh.score > old.score, `fresh=${fresh.score} old=${old.score}`);
}

// --- True tie: same trust, same confidence, only freshness differs ---
{
  const candidates = [
    { storyId: 'newer', title: 'Newer story A', sourceId: 'src-a', publishedAt: hoursAgo(1), trustScore: 90, classificationConfidence: 0.4 },
    { storyId: 'older', title: 'Older story B', sourceId: 'src-b', publishedAt: hoursAgo(20), trustScore: 90, classificationConfidence: 0.4 },
  ];
  const scored = scoreCandidates(candidates, NOW);
  const newer = scored.find(c => c.storyId === 'newer');
  const older = scored.find(c => c.storyId === 'older');
  assert('Genuine tie case (same trust/confidence): more recent wins on score alone',
    newer.score > older.score, `newer=${newer.score} older=${older.score}`);
}

// --- Confidence must not dominate (contract §3C) ---
{
  const candidates = [
    { storyId: 'low-conf-fresh', title: 'Low confidence but fresh', sourceId: 'src-a', publishedAt: hoursAgo(2), trustScore: 90, classificationConfidence: 0.4 },
    { storyId: 'high-conf-stale', title: 'High confidence but stale', sourceId: 'src-b', publishedAt: hoursAgo(100), trustScore: 90, classificationConfidence: 1.0 },
  ];
  const scored = scoreCandidates(candidates, NOW);
  const lowConf = scored.find(c => c.storyId === 'low-conf-fresh');
  const highConf = scored.find(c => c.storyId === 'high-conf-stale');
  assert('A fresh low-confidence story outranks a stale high-confidence one (confidence never dominates freshness)',
    lowConf.score > highConf.score, `lowConf=${lowConf.score} highConf=${highConf.score}`);
}

// --- Source dominance (Benchmark v2 shape): one source can't take all 10 slots ---
{
  const dominant = Array.from({ length: 25 }, (_, i) => ({
    storyId: `dominant-${i}`, title: `Dominant source story ${i} about topic ${i}`,
    sourceId: 'dominant-source', publishedAt: hoursAgo(i % 20), trustScore: 90, classificationConfidence: 0.5,
  }));
  const minority = Array.from({ length: 5 }, (_, i) => ({
    storyId: `minority-${i}`, title: `Minority source story ${i} covering topic ${i + 100}`,
    sourceId: 'minority-source', publishedAt: hoursAgo(i), trustScore: 85, classificationConfidence: 0.5,
  }));
  const scored = scoreCandidates([...dominant, ...minority], NOW);
  const selected = selectDiverseCandidates(scored, 10);
  const dominantCount = selected.filter(s => s.sourceId === 'dominant-source').length;
  const minorityCount = selected.filter(s => s.sourceId === 'minority-source').length;
  assert('Dominant source (25/30 candidates = 83%) does NOT take all 10 Active Set slots',
    dominantCount < 10, `dominant=${dominantCount}/10`);
  assert('Minority source gets real representation despite being outnumbered 5:1',
    minorityCount > 0, `minority=${minorityCount}/10`);
}

// --- Near-duplicate: only one representative selected ---
{
  const candidates = [
    { storyId: 'dup-1', title: 'Kayveas gagal cabar pelantikan Maglin sebagai Presiden myPPP', sourceId: 'src-a', publishedAt: hoursAgo(3), trustScore: 90, classificationConfidence: 0.4 },
    { storyId: 'dup-2', title: 'Kayveas gagal cabar pelantikan Maglin sebagai Presiden myPPP', sourceId: 'src-b', publishedAt: hoursAgo(2), trustScore: 90, classificationConfidence: 0.4 },
    { storyId: 'unrelated', title: 'Completely different story about the budget', sourceId: 'src-c', publishedAt: hoursAgo(1), trustScore: 90, classificationConfidence: 0.4 },
  ];
  const scored = scoreCandidates(candidates, NOW);
  const selected = selectDiverseCandidates(scored, 10);
  const dupCount = selected.filter(s => s.storyId === 'dup-1' || s.storyId === 'dup-2').length;
  assert('Near-duplicate cross-source pair: exactly ONE representative selected, not both',
    dupCount === 1, `dupCount=${dupCount}`);
  assert('Unrelated story still gets selected alongside the duplicate resolution',
    selected.some(s => s.storyId === 'unrelated'));
}

// --- Every selected candidate has non-empty reasons (contract §6 transparency) ---
{
  const candidates = [
    { storyId: 'a', title: 'Story A', sourceId: 'src-a', publishedAt: hoursAgo(1), trustScore: 90, classificationConfidence: 0.8 },
  ];
  const scored = scoreCandidates(candidates, NOW);
  const selected = selectDiverseCandidates(scored, 10);
  assert('Selected candidate carries a non-empty reasons[] array',
    selected[0].reasons.length > 0, JSON.stringify(selected[0].reasons));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
