// small-field-benchmark-runner.mjs — runs the full Editorial Ranking
// Engine pipeline against real small/niche fields (Sains, Agama,
// Pendidikan), per ChatGPT's explicit request: does Composition stay
// calm when sources are few, or does it over-search for diversity that
// isn't really there? Politik (benchmark-runner.mjs) has many sources;
// this checks the opposite end of the spectrum.
//
// PROTOTYPE — isolated, not wired into production.
//
// Usage: node ranking/small-field-benchmark-runner.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreCandidates } from './candidate-scoring.mjs';
import { selectDiverseCandidates } from './diversity-selection.mjs';
import { applyEditorialComposition } from './editorial-composition.mjs';
import { RSS_SOURCES } from '../lab/sources.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const trustById = new Map(RSS_SOURCES.map(s => [s.id, s.trustScore]));

async function loadFieldCandidates(field) {
  const { data: placements, error: pErr } = await supabase
    .from('edition_story_classifications')
    .select('story_id, classification_confidence')
    .eq('edition_id', 'ms-MY')
    .eq('field', field);
  if (pErr) throw new Error(pErr.message);
  const ids = placements.map(p => p.story_id);
  if (ids.length === 0) return [];

  // Chunked — a large field (Pendidikan: 193 candidates) can push the
  // .in() query past what a single request handles reliably.
  const items = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error: iErr } = await supabase
      .from('rss_items')
      .select('cluster_id, title, source_id, published_at')
      .in('cluster_id', chunk);
    if (iErr) throw new Error(iErr.message);
    items.push(...data);
  }

  const byCluster = new Map();
  for (const item of items) {
    const existing = byCluster.get(item.cluster_id);
    if (!existing || new Date(item.published_at) < new Date(existing.published_at)) {
      byCluster.set(item.cluster_id, item);
    }
  }
  const confidenceByCluster = new Map(placements.map(p => [p.story_id, p.classification_confidence]));

  return [...byCluster.entries()].map(([storyId, item]) => ({
    storyId, title: item.title, sourceId: item.source_id, publishedAt: item.published_at,
    trustScore: trustById.get(item.source_id) ?? 0,
    classificationConfidence: Number(confidenceByCluster.get(storyId) ?? 0),
  }));
}

function runPipeline(candidates, now) {
  const scored = scoreCandidates(candidates, now);
  const diversitySelected = selectDiverseCandidates(scored, 10);
  const alternativePool = scored.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected, compositionReasons } = applyEditorialComposition(diversitySelected, { alternativePool });
  return { selected, compositionReasons };
}

async function main() {
  console.log('\nSMALL-FIELD PRODUCTION BENCHMARK — Sains / Agama / Pendidikan\n');
  const now = new Date();

  for (const field of ['Sains', 'Agama', 'Pendidikan']) {
    const candidates = await loadFieldCandidates(field);
    const bySource = {};
    candidates.forEach(c => { bySource[c.sourceId] = (bySource[c.sourceId] ?? 0) + 1; });

    console.log(`=== ${field} — ${candidates.length} real candidates ===`);
    console.log('Source distribution:', JSON.stringify(bySource));

    if (candidates.length === 0) {
      console.log('(no candidates — skipping)\n');
      continue;
    }

    const { selected, compositionReasons } = runPipeline(candidates, now);
    const selectedBySource = {};
    selected.forEach(s => { selectedBySource[s.sourceId] = (selectedBySource[s.sourceId] ?? 0) + 1; });
    console.log(`Active Set: ${selected.length}/10 slots`);
    console.log('Selected source distribution:', JSON.stringify(selectedBySource));
    console.log(`Composition swaps made: ${Object.keys(compositionReasons).length / 2}`); // each swap writes 2 entries (in + out)
    console.log('');
  }

  console.log('Done. Results are for evaluation, not automatically wired to production.\n');
}

main().catch(err => {
  console.error('small-field-benchmark-runner failed:', err.message);
  process.exit(1);
});
