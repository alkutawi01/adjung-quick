// benchmark-runner.mjs — runs the Editorial Ranking Engine prototype
// against real production data and evaluates it against
// docs/ranking-engine-benchmark-v1.md (score sanity) and
// docs/ranking-engine-benchmark-v2.md (selection sanity).
//
// PROTOTYPE — isolated, not wired into production. Per ChatGPT:
// "Selepas result benchmark keluar, barulah kita tentukan sama ada model
// ini cukup matang untuk masuk Active Set sebenar" (only after seeing
// results do we decide whether this is mature enough for the real
// Active Set) — this script's whole purpose is producing that evidence,
// not integrating anything.
//
// Usage: node ranking/benchmark-runner.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreCandidates } from './candidate-scoring.mjs';
import { selectDiverseCandidates } from './diversity-selection.mjs';
import { applyCompositionConstraints } from './editorial-composition.mjs';
import { RSS_SOURCES } from '../lab/sources.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const trustById = new Map(RSS_SOURCES.map(s => [s.id, s.trustScore]));

async function loadPolitikCandidates() {
  const { data: placements, error: pErr } = await supabase
    .from('edition_story_classifications')
    .select('story_id, classification_confidence')
    .eq('edition_id', 'ms-MY')
    .eq('field', 'Politik');
  if (pErr) throw new Error(pErr.message);

  const ids = placements.map(p => p.story_id);
  const { data: items, error: iErr } = await supabase
    .from('rss_items')
    .select('cluster_id, title, source_id, published_at')
    .in('cluster_id', ids);
  if (iErr) throw new Error(iErr.message);

  // One canonical (earliest) item per cluster — matching how the rest of
  // the pipeline already picks a representative.
  const byCluster = new Map();
  for (const item of items) {
    const existing = byCluster.get(item.cluster_id);
    if (!existing || new Date(item.published_at) < new Date(existing.published_at)) {
      byCluster.set(item.cluster_id, item);
    }
  }
  const confidenceByCluster = new Map(placements.map(p => [p.story_id, p.classification_confidence]));

  return [...byCluster.entries()].map(([storyId, item]) => ({
    storyId,
    title: item.title,
    sourceId: item.source_id,
    publishedAt: item.published_at,
    trustScore: trustById.get(item.source_id) ?? 0,
    classificationConfidence: Number(confidenceByCluster.get(storyId) ?? 0),
  }));
}

function runPipeline(candidates, now) {
  const scored = scoreCandidates(candidates, now);
  const selected = selectDiverseCandidates(scored, 10);
  return applyCompositionConstraints(selected);
}

async function main() {
  console.log('\nEDITORIAL RANKING ENGINE — BENCHMARK RUN (prototype, not wired to production)\n');

  const candidates = await loadPolitikCandidates();
  const now = new Date(); // real "now" for a live run — benchmark v1/v2 both reference real production timestamps
  console.log(`Loaded ${candidates.length} real ms-MY Politik candidates.\n`);

  const bySource = {};
  candidates.forEach(c => { bySource[c.sourceId] = (bySource[c.sourceId] ?? 0) + 1; });
  console.log('Input source distribution:', JSON.stringify(bySource), '\n');

  const activeSet = runPipeline(candidates, now);

  console.log(`=== SELECTED ACTIVE SET (${activeSet.length}/10) ===\n`);
  activeSet.forEach((s, i) => {
    console.log(`${i + 1}. [${s.finalScore.toFixed(1)}] (${s.sourceId}) ${s.title.slice(0, 60)}`);
    console.log(`   reasons: ${s.reasons.join(', ')}`);
  });

  // --- Benchmark v1 checks (score sanity) ---
  console.log('\n=== BENCHMARK v1 — score-level checks ===\n');
  const dap = candidates.find(c => c.title.includes('DAP dijangka kekal'));
  const wongChen = candidates.find(c => c.title.includes('Wong Chen mohon maaf'));
  if (dap && wongChen) {
    const dapScored = scoreCandidates([dap], now)[0];
    const wongChenScored = scoreCandidates([wongChen], now)[0];
    console.log(`Group A — freshness/weight tradeoff: DAP score=${dapScored.score.toFixed(1)}, Wong Chen score=${wongChenScored.score.toFixed(1)}`);
    console.log(`  Expected: DAP (fresher) scores higher, Wong Chen not near-zero. Got: ${dapScored.score > wongChenScored.score ? 'PASS (DAP higher)' : 'CHECK'}`);
  } else {
    console.log('Group A stories not found in current live data (production data changes over time — expected).');
  }

  // --- Benchmark v2 checks (selection sanity) ---
  console.log('\n=== BENCHMARK v2 — selection-level checks ===\n');
  const selectedBySource = {};
  activeSet.forEach(s => { selectedBySource[s.sourceId] = (selectedBySource[s.sourceId] ?? 0) + 1; });
  console.log('Selected source distribution:', JSON.stringify(selectedBySource));
  const dominantSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
  const dominantSourceSelected = selectedBySource[dominantSource[0]] ?? 0;
  console.log(`Dominant input source: ${dominantSource[0]} (${dominantSource[1]}/${candidates.length} = ${Math.round(dominantSource[1] / candidates.length * 100)}% of candidates)`);
  console.log(`Same source in selected Active Set: ${dominantSourceSelected}/10`);
  console.log(`Diversity check: ${dominantSourceSelected < 10 ? 'PASS (does not take all 10 slots)' : 'FAIL (took every slot)'}`);
  console.log(`Distinct sources represented: ${Object.keys(selectedBySource).length}`);

  const kayveasMaglin = activeSet.filter(s => s.title.includes('Kayveas') || s.title.includes('Maglin'));
  console.log(`\nNear-duplicate check (Kayveas/Maglin): ${kayveasMaglin.length} representative(s) in Active Set — ${kayveasMaglin.length <= 1 ? 'PASS' : 'FAIL (duplicate not resolved)'}`);
  if (kayveasMaglin.length > 0) console.log(`  (${kayveasMaglin[0].sourceId})`);

  console.log('\nDone. Results are for evaluation, not automatically wired to production.\n');
}

main().catch(err => {
  console.error('benchmark-runner failed:', err.message);
  process.exit(1);
});
