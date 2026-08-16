// classificationFlowAdapter.js — Aliran Klasifikasi Langsung.
//
// Direct answer to Izzat's explicit complaint (2026-08-16): "saya tak
// mampu tgok rss mentah tu dikategorikan ke mana... sistem ni sembunyikan
// semua tu drpd saya." The data already existed (rss_items joined with
// edition_story_classifications) — it was simply never surfaced in any
// UI. This adapter changes nothing about classification itself; it is a
// read-only window into what already happens on every ingest+classify run.
//
// Every recent RSS item, its source, and which Bidang it landed in (or
// "belum diklasifikasi" if classify-production.js hasn't run over it
// yet) — the exact title -> source -> field mapping an admin needs to
// see in order to trust or challenge the system's routing decisions.

export async function fetchClassificationFlow(supabase, editionId, { limit = 60 } = {}) {
  const { data: items, error: itemsErr } = await supabase
    .from('rss_items')
    .select('cluster_id, title, source_id, published_at')
    .order('published_at', { ascending: false })
    .limit(limit * 3); // over-fetch: multiple items can share one cluster_id, dedupe below
  if (itemsErr) throw new Error(`fetchClassificationFlow: rss_items — ${itemsErr.message}`);

  const clusterIds = [...new Set(items.map(i => i.cluster_id))];
  const { data: classifications, error: clsErr } = await supabase
    .from('edition_story_classifications')
    .select('story_id, field, classification_status')
    .eq('edition_id', editionId)
    .in('story_id', clusterIds);
  if (clsErr) throw new Error(`fetchClassificationFlow: edition_story_classifications — ${clsErr.message}`);

  const { data: sources, error: srcErr } = await supabase.from('sources').select('id, name');
  if (srcErr) throw new Error(`fetchClassificationFlow: sources — ${srcErr.message}`);

  const fieldByCluster = new Map(classifications.map(c => [c.story_id, c]));
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));

  const seen = new Set();
  const rows = [];
  for (const item of items) {
    if (seen.has(item.cluster_id)) continue; // one row per story, not per RSS item
    seen.add(item.cluster_id);
    const cls = fieldByCluster.get(item.cluster_id);
    rows.push({
      storyId: item.cluster_id,
      title: item.title,
      sourceId: item.source_id,
      sourceName: sourceNameById.get(item.source_id) ?? item.source_id,
      publishedAt: item.published_at,
      field: cls?.field ?? null,
      classificationStatus: cls?.classification_status ?? 'not_yet_run', // distinct from 'unclassified' (ran, found nothing) — this ran never
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
