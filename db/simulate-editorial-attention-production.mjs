// simulate-editorial-attention-production.mjs — read-only production
// simulation of the Editorial Attention Layer (docs/editorial-attention-
// implementation-plan-v1.md), per ChatGPT's explicit instruction after the
// V1 implementation was verified and committed (7592370).
//
// Purpose: test one hypothesis, not add a feature — if Izzat opens /admin
// roughly once a week, does evaluateEditorialAttention() over real
// production data produce a small, genuinely useful list, or noise?
//
// READ-ONLY. No table is written. No config/threshold/query/UI/Digest is
// touched. If this ever needs a write to run, it must stop instead.
//
// Usage: node db/simulate-editorial-attention-production.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchEditorialAttention } from '../ui/src/admin/editorialAttentionAdapter.js';
import { EDITION_IDS } from '../state/editions.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Enriches low_confidence / pin_expiring items with a real title + field,
// the same way reviewQueueAdapter.js resolves a canonical title — a
// simulation report with a story_id and nothing else isn't useful to a
// human reviewing it.
async function enrichWithTitles(items) {
  const storyIds = [...new Set(items.map(i => i.relatedStoryId).filter(Boolean))];
  if (storyIds.length === 0) return items;

  const [{ data: rssItems, error: itemsErr }, { data: classifications, error: classErr }] = await Promise.all([
    supabase.from('rss_items').select('cluster_id, title, published_at').in('cluster_id', storyIds),
    supabase.from('edition_story_classifications').select('story_id, field').in('story_id', storyIds),
  ]);
  if (itemsErr) throw new Error(`enrichWithTitles: rss_items — ${itemsErr.message}`);
  if (classErr) throw new Error(`enrichWithTitles: edition_story_classifications — ${classErr.message}`);

  const titleByCluster = new Map();
  for (const row of rssItems ?? []) {
    const existing = titleByCluster.get(row.cluster_id);
    if (!existing || new Date(row.published_at) < new Date(existing.published_at)) {
      titleByCluster.set(row.cluster_id, row);
    }
  }
  const fieldByStory = new Map((classifications ?? []).map(c => [c.story_id, c.field]));

  return items.map(item => ({
    ...item,
    title: item.relatedStoryId ? (titleByCluster.get(item.relatedStoryId)?.title ?? null) : null,
    field: item.relatedStoryId ? (fieldByStory.get(item.relatedStoryId) ?? null) : null,
  }));
}

function assessNoise(total) {
  if (total <= 3) return { level: 'LOW', reason: '0-3 perkara — senarai boleh dibaca sepenuhnya dalam beberapa saat, setiap satu jelas memerlukan keputusan atau maklum sahaja.' };
  if (total <= 9) return { level: 'MODERATE', reason: '4-9 perkara — masih boleh diproses dalam satu sesi ringkas, tapi mula memerlukan admin membaca setiap item untuk saring yang penting.' };
  return { level: 'HIGH', reason: `${total} perkara — melebihi apa yang admin sekali-sekala (seminggu sekali) boleh proses tanpa rasa terbeban; model perlu dikecilkan sebelum sebarang UI dibina.` };
}

async function main() {
  console.log('PRODUCTION ATTENTION SIMULATION');
  console.log(`Snapshot time: ${new Date().toISOString()}\n`);

  let grandTotal = 0;
  const grandCounts = { low_confidence: 0, source_failure: 0, pin_expiring: 0 };

  for (const editionId of EDITION_IDS) {
    const items = await fetchEditorialAttention(supabase, editionId);
    const enriched = await enrichWithTitles(items);

    const counts = { low_confidence: 0, source_failure: 0, pin_expiring: 0 };
    for (const item of enriched) counts[item.type] = (counts[item.type] ?? 0) + 1;
    for (const key of Object.keys(counts)) grandCounts[key] += counts[key];
    grandTotal += enriched.length;

    console.log(`=== Edition: ${editionId} ===`);
    console.log(`Low confidence: ${counts.low_confidence}`);
    console.log(`Source failure: ${counts.source_failure}`);
    console.log(`Pin expiring: ${counts.pin_expiring}`);
    console.log(`Total: ${enriched.length}\n`);

    const actionRequired = enriched.filter(i => i.category === 'action_required');
    const informational = enriched.filter(i => i.category === 'informational');

    if (actionRequired.length > 0) {
      console.log('Action required:');
      for (const item of actionRequired) {
        console.log(`- [${item.type}] ${item.title ?? '(tiada tajuk dijumpai)'} | Bidang: ${item.field ?? '(tiada)'} | Sebab: ${item.reason}`);
      }
      console.log('');
    }
    if (informational.length > 0) {
      console.log('Informational:');
      for (const item of informational) {
        if (item.type === 'pin_expiring') {
          console.log(`- [pin_expiring] ${item.title ?? '(tiada tajuk dijumpai)'} | Bidang: ${item.field ?? '(tiada)'} | Tamat: ${item.expiresAt} | Sebab: ${item.reason}`);
        } else {
          console.log(`- [${item.type}] ${item.what} | Sebab: ${item.reason}`);
        }
      }
      console.log('');
    }
    if (enriched.length === 0) console.log('(tiada attention item untuk edition ini)\n');
  }

  console.log('=== KESELURUHAN (semua edition) ===');
  console.log(`Low confidence: ${grandCounts.low_confidence}`);
  console.log(`Source failure: ${grandCounts.source_failure}`);
  console.log(`Pin expiring: ${grandCounts.pin_expiring}`);
  console.log(`Total: ${grandTotal}\n`);

  const assessment = assessNoise(grandTotal);
  console.log(`Jika admin buka sistem seminggu sekali: ${assessment.level} noise`);
  console.log(`Sebab: ${assessment.reason}\n`);

  console.log('Had snapshot (apa yang BOLEH dan TIDAK BOLEH disimpulkan):');
  console.log('- Ini SATU snapshot pada satu masa. Ia menunjukkan keadaan sistem SEKARANG sahaja.');
  console.log('- Perbandingan "buka setiap hari / selepas 3 hari / selepas 7 hari" memerlukan snapshot BERULANG pada masa sebenar — data sejarah untuk simulasi itu tidak wujud (tiada rakaman AttentionItem harian setakat ini), jadi ia TIDAK direka di sini.');
  console.log('- pin_expiring khususnya sangat bergantung pada BILA pin terakhir dibuat — snapshot ini hanya sah untuk detik ia dijalankan; ulang skrip ini pada hari lain untuk lihat corak sebenar.');
}

main().catch(err => {
  console.error('Simulation failed:', err.message);
  process.exit(1);
});
