// editorial-composition.test.mjs — deterministic tests for
// editorial-composition.mjs against the 5 benchmark cases in
// docs/editorial-composition-benchmark-v1.md. Fixed synthetic data, not
// live-DB-dependent (same reasoning as ranking-engine.test.mjs).
//
// Run: node ranking/editorial-composition.test.mjs

import { applyEditorialComposition } from './editorial-composition.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITORIAL COMPOSITION v0.1 — benchmark tests\n');

// --- Case A: Source Dominance ---
{
  const selected = Array.from({ length: 8 }, (_, i) => ({ storyId: `astro-${i}`, sourceId: 'astro', score: 90 - i }))
    .concat([{ storyId: 'bernama-1', sourceId: 'bernama-pool', score: 40 }])
    .concat([{ storyId: 'metro-1', sourceId: 'metro-pool', score: 39 }])
    .slice(0, 10); // 8 astro (selected), bernama/metro NOT selected — in alternativePool instead
  const dominantSelected = Array.from({ length: 10 }, (_, i) => ({ storyId: `astro-${i}`, sourceId: 'astro', score: 90 - i }));
  const alternativePool = [
    { storyId: 'bernama-1', sourceId: 'bernama-pool', score: 78 }, // clears floor vs weakest astro (90-9=81 * 0.75 = 60.75)
    { storyId: 'metro-1', sourceId: 'metro-pool', score: 30 }, // does NOT clear floor
  ];
  const { selected: result, compositionReasons } = applyEditorialComposition(dominantSelected, { alternativePool });
  const dominantCount = result.filter(c => c.sourceId === 'astro').length;
  assert('Case A — Astro Awani 8-10/10 does not stand when a qualifying alternative exists',
    dominantCount < 10, `dominantCount=${dominantCount}`);
  assert('Case A — reasons recorded for the swap',
    Object.keys(compositionReasons).length > 0);
}

// --- Case B: Quality Floor Conflict (the exact failing ranking-engine.test.mjs case) ---
{
  const dominantSelected = [
    { storyId: 'astro-1', sourceId: 'astro', score: 95 },
    { storyId: 'astro-2', sourceId: 'astro', score: 94 },
    { storyId: 'astro-3', sourceId: 'astro', score: 93 },
    { storyId: 'astro-4', sourceId: 'astro', score: 92 },
    { storyId: 'astro-5', sourceId: 'astro', score: 91 },
  ];
  const alternativePool = [
    { storyId: 'bernama-1', sourceId: 'bernama', score: 80 },
    { storyId: 'metro-1', sourceId: 'metro', score: 78 },
  ];
  const { selected } = applyEditorialComposition(dominantSelected, { alternativePool });
  assert('Case B — the CLEARLY BEST Astro stories (95, 94, 93) are never displaced',
    selected.some(c => c.storyId === 'astro-1') && selected.some(c => c.storyId === 'astro-2') && selected.some(c => c.storyId === 'astro-3'));
  assert('Case B — at least one alternative (Bernama/Metro) gets real room',
    selected.some(c => c.sourceId === 'bernama') || selected.some(c => c.sourceId === 'metro'));
}

// --- Case C: Genuine Dominant Event (the crucial counter-case) ---
{
  const dominantSelected = Array.from({ length: 10 }, (_, i) => ({ storyId: `event-${i}`, sourceId: 'astro', score: 95 - i }));
  // No alternative pool at all — every source is legitimately covering
  // the same big event, there IS no other real story sitting around.
  const { selected, compositionReasons } = applyEditorialComposition(dominantSelected, { alternativePool: [] });
  assert('Case C — no forced swap when there is genuinely no qualifying alternative (dominant event, not dominant source bias)',
    selected.every((c, i) => c.storyId === dominantSelected[i].storyId), 'set should be unchanged');
  assert('Case C — no composition reasons recorded (nothing was swapped)',
    Object.keys(compositionReasons).length === 0);
}

// --- Case D: Topic/Angle Diversity — v0.1 explicitly does not implement this (per policy §, out of v0.1 scope) ---
{
  // v0.1 only handles SOURCE dominance, not angle/topic. Documented here
  // as a known non-goal, not silently skipped — confirms the function
  // doesn't crash or misbehave on angle-diverse-but-source-concentrated
  // input; it correctly falls through to the source-dominance path only.
  const dominantSelected = Array.from({ length: 10 }, (_, i) => ({ storyId: `angle-${i}`, sourceId: `source-${i}`, score: 90 - i }));
  const { selected } = applyEditorialComposition(dominantSelected, { alternativePool: [] });
  assert('Case D — v0.1 scope: no source dominates here (10 distinct sources), no swap needed regardless of angle',
    selected.length === 10);
}

// --- Case E: Small Field ---
{
  const smallField = [
    { storyId: 'mosti-1', sourceId: 'mosti', score: 90 },
    { storyId: 'mosti-2', sourceId: 'mosti', score: 85 },
    { storyId: 'mosti-3', sourceId: 'mosti', score: 80 },
    { storyId: 'mosti-4', sourceId: 'mosti', score: 75 },
    { storyId: 'guardian-1', sourceId: 'guardian', score: 70 },
  ];
  // No real alternative pool — this IS the whole field, 5 candidates total.
  const { selected, compositionReasons } = applyEditorialComposition(smallField, { alternativePool: [] });
  assert('Case E — small field (5 real candidates, 4 from MOSTI) is not force-diversified with fake candidates',
    selected.length === 5 && Object.keys(compositionReasons).length === 0);
}

// --- Transparency: every replacement carries a reason ---
{
  const dominantSelected = Array.from({ length: 10 }, (_, i) => ({ storyId: `astro-${i}`, sourceId: 'astro', score: 90 - i }));
  const alternativePool = [{ storyId: 'bernama-1', sourceId: 'bernama', score: 70 }]; // clears floor vs weakest (90-9=81 * 0.75 = 60.75)
  const { compositionReasons } = applyEditorialComposition(dominantSelected, { alternativePool });
  const reasonValues = Object.values(compositionReasons).flat();
  assert('Transparency — a swap records "source_diversity_opportunity"',
    reasonValues.includes('source_diversity_opportunity'), JSON.stringify(compositionReasons));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
