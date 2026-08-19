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
  // unclassified) -- the full real corpus, no artificial balancing or
  // cap, since Pusingan 12's per-field ranking needs enough stories in
  // each field to produce a meaningful top 10.
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
  console.log(`Korpus: ${candidates.length} berita diklasifikasi merentasi ${new Set(candidates.map(c => c.fieldCode)).size} bidang, ${new Set(candidates.map(c => c.sourceId)).size} sumber.\n`);

  const now = new Date();

  // Pusingan 12/15: ranking PER BIDANG, sama seperti production sebenar
  // (state/reducer.js::selectFieldActiveSet dipanggil sekali per bidang
  // dipilih -- tidak pernah merentasi bidang). Pusingan 11's cross-field
  // ranking (masih di bawah, dikekalkan untuk overview korpus) dedahkan
  // corak sebenar TAPI "satu bidang membolot" finding-nya ialah artifak
  // reka bentuk itu, bukan tingkah laku production -- per-bidang di sini
  // ialah ujian yang betul-betul sepadan production.
  const byField = new Map();
  for (const c of candidates) {
    if (!byField.has(c.fieldCode)) byField.set(c.fieldCode, []);
    byField.get(c.fieldCode).push(c);
  }

  const REPORT_FIELDS = ['politics', 'disaster', 'sports', 'bisnes', 'nasional', 'crime'];
  console.log('--- TOP 10 PER BIDANG (lama vs V1, ranking BERASINGAN setiap bidang) ---\n');
  const perFieldResults = new Map();
  for (const [fieldCode, group] of byField) {
    const titles = group.map(c => c.title);
    const oldS = scoreCandidates(group, now).sort((a, b) => b.score - a.score);
    const newS = group.map(c => scoreCandidateV1(c, titles, now)).sort((a, b) => b.scoreV1 - a.scoreV1);
    perFieldResults.set(fieldCode, { oldS, newS, group });
    if (!REPORT_FIELDS.includes(fieldCode)) continue;
    console.log(`## ${fieldCode} (${group.length} berita)`);
    console.log('  LAMA top 10:');
    oldS.slice(0, 10).forEach((c, i) => console.log(`    ${i + 1}. [${c.score.toFixed(0)}] ${truncate(c.title, 55)} (${c.sourceName})`));
    console.log('  V1 top 10:');
    newS.slice(0, 10).forEach((c, i) => console.log(`    ${i + 1}. [${c.scoreV1.toFixed(0)}] ${truncate(c.title, 55)} (${c.sourceName})`));
    console.log('');
  }

  // Cross-field overview (Pusingan 11's original comparison), kept as a
  // corpus-wide sanity check only -- NOT how production actually ranks.
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
      breakdownV1: newEntry.breakdownV1,
    };
  });

  console.log('--- SEMAKAN KESALAHAN JELAS (ikhtisar merentasi korpus) ---');
  selfCritique(merged);

  console.log('\n--- UJIAN SENSITIVITI: BOOST EDITOR ---');
  boostSensitivity(perFieldResults, now);

  console.log('\n--- UJIAN SENSITIVITI: KEYAKINAN PENGELASAN ---');
  confidenceSensitivity(perFieldResults, now);

  console.log('\n--- DASAR SKOR SEMASA (Faktor | Berat | Aktif/Tidak | Laras) ---');
  for (const w of SCORING_V1_WEIGHTS) {
    console.log(`${w.faktor} | ${w.berat} | ${w.aktif ? 'Aktif' : 'Tidak aktif'} | ${w.laras}`);
  }
}

// Re-scores every candidate with a different boost weight (score minus
// the default 40 flat, plus the variant), re-ranks PER FIELD, and counts
// how many boosted stories actually change top-10 membership at each
// weight -- a real measurement of how much the number matters, not a
// guess. Only fields with at least one boosted story in the sample are
// informative; reported regardless so an empty result is visible too.
function boostSensitivity(perFieldResults, now) {
  const VARIANTS = [3, 5, 8, 10, 15, 20, 40];
  const totalBoosted = [...perFieldResults.values()].reduce((sum, { group }) => sum + group.filter(c => c.boosted).length, 0);
  if (totalBoosted === 0) {
    console.log('  Tiada berita dgn override boost aktif dalam sampel semasa -- ujian sensitiviti tak dapat dijalankan terhadap data sebenar buat masa ini. Simulasi sintetik di bawah: ambil 1 berita rawak per bidang laporan, tandakan boosted=true secara hipotesis, ukur berapa kedudukan ia naik.\n');
    for (const [fieldCode, { group }] of perFieldResults) {
      if (!REPORT_FIELDS_G.includes(fieldCode) || group.length < 5) continue;
      const titles = group.map(c => c.title);
      const target = group[Math.floor(group.length / 2)]; // a mid-pack story, not already top
      const baseRank = group.map(c => scoreCandidateV1(c, titles, now)).sort((a, b) => b.scoreV1 - a.scoreV1).findIndex(c => c.storyId === target.storyId) + 1;
      console.log(`  Bidang ${fieldCode} -- "${truncate(target.title, 50)}" (kedudukan asal #${baseRank}/${group.length}):`);
      for (const weight of VARIANTS) {
        const scored = group.map(c => {
          const scoredC = scoreCandidateV1(c, titles, now);
          return { ...scoredC, scoreV1: scoredC.scoreV1 + (c.storyId === target.storyId ? weight : 0) };
        }).sort((a, b) => b.scoreV1 - a.scoreV1);
        const newRank = scored.findIndex(c => c.storyId === target.storyId) + 1;
        console.log(`    +${weight}: #${baseRank} -> #${newRank}${newRank <= 10 ? ' (MASUK TOP 10)' : ''}`);
      }
    }
    return;
  }
  for (const [fieldCode, { group }] of perFieldResults) {
    const boostedInField = group.filter(c => c.boosted);
    if (boostedInField.length === 0) continue;
    const titles = group.map(c => c.title);
    console.log(`  Bidang ${fieldCode} (${boostedInField.length} berita boosted dlm sampel):`);
    for (const weight of VARIANTS) {
      const scored = group.map(c => {
        const base = scoreCandidateV1({ ...c, boosted: false }, titles, now);
        const boost = c.boosted ? weight : 0;
        return { ...c, scoreV1: base.scoreV1 + boost };
      }).sort((a, b) => b.scoreV1 - a.scoreV1);
      const boostedInTop10 = scored.slice(0, 10).filter(c => c.boosted).length;
      console.log(`    +${weight}: ${boostedInTop10}/${boostedInField.length} berita boosted masuk top 10`);
    }
  }
}

const REPORT_FIELDS_G = ['politics', 'disaster', 'sports', 'bisnes', 'nasional', 'crime'];

function confidenceSensitivity(perFieldResults, now) {
  const VARIANTS = [0, 2, 5, 10, 15];
  for (const fieldCode of ['politics', 'disaster', 'bisnes']) {
    const entry = perFieldResults.get(fieldCode);
    if (!entry) continue;
    const { group } = entry;
    const titles = group.map(c => c.title);
    const top10AtWeight = weight => new Set(
      group.map(c => {
        const base = scoreCandidateV1({ ...c, classificationConfidence: 0 }, titles, now);
        return { storyId: c.storyId, scoreV1: base.scoreV1 + (c.classificationConfidence ?? 0) * weight };
      }).sort((a, b) => b.scoreV1 - a.scoreV1).slice(0, 10).map(c => c.storyId),
    );
    const baseline = top10AtWeight(5); // current default weight
    console.log(`  Bidang ${fieldCode} (bandingkan top 10 setiap x drpd x5 semasa):`);
    for (const weight of VARIANTS) {
      const set = top10AtWeight(weight);
      const changed = [...set].filter(id => !baseline.has(id)).length;
      console.log(`    x${weight}: ${changed} daripada 10 slot top-10 berubah berbanding x5 semasa`);
    }
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
