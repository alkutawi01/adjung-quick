// scoring-v1-simulation.mjs — runs Scoring V1 (ranking/scoring-v1-
// simulation.mjs) against a real sample of the ms-MY corpus and compares
// it to the OLD, LIVE-in-production formula (ranking/candidate-
// scoring.mjs), unmodified. READ-ONLY. Zero writes, zero production
// ranking change -- this is analysis only, per Izzat's explicit
// instruction: "Jangan ubah ranking production lagi... Commit local
// sahaja."
//
// Anon/publishable key only (same as db/source-registry-adapter.mjs's
// browser-safe reads) -- no service role key available in this
// environment, and none needed: story_clusters/rss_items/sources/
// edition_story_classifications are already readable anonymously (the
// same tables ui/src/adapter/productionAdapter.js reads from the
// browser).
//
// Usage: node db/scoring-v1-simulation.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreCandidates } from '../ranking/candidate-scoring.mjs';
import { scoreCandidateV1, SCORING_V1_WEIGHTS } from '../ranking/scoring-v1-simulation.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const EDITION_ID = 'ms-MY';
const SAMPLE_TARGET = 200;

async function main() {
  console.log('\n=== SCORING V1 SIMULATION (read-only, ms-MY) ===\n');

  const [{ data: sources, error: sourcesErr }, { data: clusters, error: clustersErr }] = await Promise.all([
    supabase.from('sources').select('id, name, trust_score'),
    supabase.from('story_clusters').select('id, workspace_state').neq('workspace_state', 'expired').neq('workspace_state', 'released'),
  ]);
  if (sourcesErr) throw new Error(`sources: ${sourcesErr.message}`);
  if (clustersErr) throw new Error(`story_clusters: ${clustersErr.message}`);

  // Per-table full read, no .in(clusterIds) filter -- same pattern
  // productionAdapter.js's fetchRankedQueue() uses (a 691-id .in() list
  // blows the GET request's URL length, found live while running this
  // script; unfiltered select + client-side grouping is what the real
  // reader adapter already does for exactly this reason).
  const [{ data: items, error: itemsErr }, { data: placements, error: placementsErr }, { data: overrides, error: overridesErr }] = await Promise.all([
    supabase.from('rss_items').select('cluster_id, source_id, title, published_at'),
    supabase.from('edition_story_classifications')
      .select('story_id, field_code, classification_status, classification_confidence')
      .eq('edition_id', EDITION_ID),
    // story_overrides itself is signed-in-editors-only RLS (same posture
    // documented in ui/src/adapter/productionAdapter.js) -- anon reads go
    // through the narrow public_active_overrides view instead, same as
    // that adapter does.
    supabase.from('public_active_overrides').select('story_id, override_type').eq('edition_id', EDITION_ID),
  ]);
  if (itemsErr) throw new Error(`rss_items: ${itemsErr.message}`);
  if (placementsErr) throw new Error(`edition_story_classifications: ${placementsErr.message}`);
  if (overridesErr) throw new Error(`story_overrides: ${overridesErr.message}`);

  const trustById = new Map(sources.map(s => [s.id, s.trust_score]));
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));
  const placementByStory = new Map(placements.map(p => [p.story_id, p]));
  const boostedIds = new Set(overrides.map(o => o.story_id));
  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  // Sample: every classified story (field_code present, status !=
  // unclassified), capped near SAMPLE_TARGET, real cross-section of
  // fields/sources as they exist -- no artificial balancing, since the
  // point is to see the real corpus's behavior, not a curated one.
  let candidates = [];
  for (const [clusterId, placement] of placementByStory) {
    if (!placement.field_code) continue;
    const members = itemsByCluster.get(clusterId) || [];
    const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
    if (!canonical) continue;
    candidates.push({
      storyId: clusterId,
      title: canonical.title,
      sourceId: canonical.source_id,
      sourceName: sourceNameById.get(canonical.source_id) ?? canonical.source_id,
      publishedAt: canonical.published_at,
      trustScore: trustById.get(canonical.source_id) ?? 0,
      classificationConfidence: Number(placement.classification_confidence ?? 0),
      boosted: boostedIds.has(clusterId),
      fieldCode: placement.field_code,
    });
  }
  candidates = candidates.slice(0, SAMPLE_TARGET);
  console.log(`Sampel: ${candidates.length} berita diklasifikasi merentasi ${new Set(candidates.map(c => c.fieldCode)).size} bidang, ${new Set(candidates.map(c => c.sourceId)).size} sumber.\n`);

  const now = new Date();
  const oldScored = scoreCandidates(candidates, now);
  const allTitles = candidates.map(c => c.title);
  const newScored = candidates.map(c => scoreCandidateV1(c, allTitles, now));

  const oldRank = new Map([...oldScored].sort((a, b) => b.score - a.score).map((c, i) => [c.storyId, i + 1]));
  const newRank = new Map([...newScored].sort((a, b) => b.scoreV1 - a.scoreV1).map((c, i) => [c.storyId, i + 1]));

  const merged = candidates.map(c => {
    const oldEntry = oldScored.find(s => s.storyId === c.storyId);
    const newEntry = newScored.find(s => s.storyId === c.storyId);
    return {
      ...c,
      oldScore: oldEntry.score,
      newScore: newEntry.scoreV1,
      oldRank: oldRank.get(c.storyId),
      newRank: newRank.get(c.storyId),
      rankDelta: oldRank.get(c.storyId) - newRank.get(c.storyId), // positive = moved UP (improved) under V1
      breakdownV1: newEntry.breakdownV1,
    };
  });

  const top20New = [...merged].sort((a, b) => a.newRank - b.newRank).slice(0, 20);
  console.log('--- TOP 20 MENGIKUT SKOR CADANGAN (V1) ---');
  console.log('Kdd(lama->baru) | Berita | Sumber | Bidang | Skor lama | Skor baharu | Sebab utama\n');
  for (const c of top20New) {
    const reason = biggestFactor(c.breakdownV1);
    console.log(`${c.oldRank}->${c.newRank} | ${truncate(c.title, 60)} | ${c.sourceName} | ${c.fieldCode} | ${c.oldScore.toFixed(1)} | ${c.newScore.toFixed(1)} | ${reason}`);
  }

  console.log('\n--- SEMAKAN KESALAHAN JELAS ---');
  selfCritique(merged);

  console.log('\n--- DASAR SKOR (Faktor | Berat | Aktif/Tidak | Laras) ---');
  for (const w of SCORING_V1_WEIGHTS) {
    console.log(`${w.faktor} | ${w.berat} | ${w.aktif ? 'Aktif' : 'Tidak aktif'} | ${w.laras}`);
  }
}

function biggestFactor(breakdown) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const LABELS = { freshness: 'kebaruan', sourceTrust: 'kepercayaan sumber', duplication: 'keunikan (bukan ulangan)', confidenceModifier: 'keyakinan pengelasan', editorialBoost: 'boost editor' };
  return LABELS[entries[0][0]] ?? entries[0][0];
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Five checks per Izzat's explicit list -- each prints a real finding
// from the actual sampled data, never a hypothetical.
function selfCritique(merged) {
  // 1. berita remeh naik terlalu tinggi -- low old-rank (unimportant
  // under the live formula) that jumped into the new top 10 driven
  // mainly by duplication/freshness rather than trust/confidence.
  const trivialRisers = merged.filter(c => c.newRank <= 10 && c.oldRank > 30);
  console.log(`1. Berita remeh naik terlalu tinggi: ${trivialRisers.length} kes (lama>#30, baharu<=#10).`);
  trivialRisers.slice(0, 3).forEach(c => console.log(`   - "${truncate(c.title, 70)}" (#${c.oldRank}->#${c.newRank})`));

  // 2. berita penting jatuh terlalu rendah -- was top 10 under live
  // formula, fell out of top 30 under V1.
  const importantFallers = merged.filter(c => c.oldRank <= 10 && c.newRank > 30);
  console.log(`2. Berita penting jatuh terlalu rendah: ${importantFallers.length} kes (lama<=#10, baharu>#30).`);
  importantFallers.slice(0, 3).forEach(c => console.log(`   - "${truncate(c.title, 70)}" (#${c.oldRank}->#${c.newRank})`));

  // 3. source trust terlalu dominan -- among the new top 10, is trust
  // the single dominant factor for more than half?
  const top10 = [...merged].sort((a, b) => a.newRank - b.newRank).slice(0, 10);
  const trustDominated = top10.filter(c => biggestFactor(c.breakdownV1) === 'kepercayaan sumber').length;
  console.log(`3. Kepercayaan sumber dominan dalam top 10 baharu: ${trustDominated}/10.`);

  // 4. freshness terlalu dominan -- same check for freshness.
  const freshDominated = top10.filter(c => biggestFactor(c.breakdownV1) === 'kebaruan').length;
  console.log(`4. Kebaruan dominan dalam top 10 baharu: ${freshDominated}/10.`);

  // 5. satu bidang membolot semua -- does one field_code take more than
  // half of the new top 10?
  const fieldCounts = new Map();
  top10.forEach(c => fieldCounts.set(c.fieldCode, (fieldCounts.get(c.fieldCode) ?? 0) + 1));
  const [dominantField, dominantCount] = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  console.log(`5. Bidang dominan dalam top 10 baharu: ${dominantField ?? '—'} (${dominantCount}/10)${dominantCount > 5 ? ' -- MEMBOLOT' : ''}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
