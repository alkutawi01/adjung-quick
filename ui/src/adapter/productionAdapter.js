// productionAdapter.js — Supabase production data → engine.js cluster shape.
//
// Per ChatGPT (director) instruction: no Supabase queries inside React
// components. This is the ONLY place that talks to Supabase for reading
// data. It reshapes real story_clusters/rss_items/sources rows into the
// same cluster object shape lab/engine.js's buildRankedQueue() produces
// ({ clusterKey, canonical, members, sourceIds, topic, editorialScore }),
// so state/reducer.js and state/representation.js — already built and
// tested — work unmodified against real data. Scores are NOT recomputed
// here; production's already-stored editorial_score (set by
// db/ingest-production.js) is used as-is.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Fetches the current Ranked Queue from Supabase and reshapes it into the
// cluster array state/reducer.js's `context.rankedQueue` expects.
export async function fetchRankedQueue() {
  const [{ data: sources, error: sourcesErr }, { data: clusters, error: clustersErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase.from('sources').select('id, trust_score'),
      supabase.from('story_clusters').select('id, topic, editorial_score, workspace_state'),
      supabase.from('rss_items').select('id, source_id, cluster_id, rss_guid, title, description, link, normalized_url, language, published_at'),
    ]);

  if (sourcesErr) throw new Error(`fetchRankedQueue: sources — ${sourcesErr.message}`);
  if (clustersErr) throw new Error(`fetchRankedQueue: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchRankedQueue: rss_items — ${itemsErr.message}`);

  const trustById = new Map(sources.map(s => [s.id, s.trust_score]));
  const itemsByCluster = new Map();
  for (const row of items) {
    const member = {
      sourceId: row.source_id,
      rssGuid: row.rss_guid,
      title: row.title,
      description: row.description,
      link: row.link,
      normalizedUrl: row.normalized_url,
      language: row.language,
      publishedAt: row.published_at,
      trustScore: trustById.get(row.source_id) ?? 0,
    };
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(member);
  }

  const rankedQueue = clusters
    .filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released')
    .map(c => {
      const members = itemsByCluster.get(c.id) || [];
      // Canonical = earliest report, matching engine.js's own "representative
      // is the earliest item" rule (db/schema-identity.sql's
      // representative_rss_item_id already enforces this at insert time;
      // re-deriving here keeps the adapter correct even if that column isn't selected).
      const canonical = [...members].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))[0];
      return {
        clusterKey: c.id,
        topic: c.topic,
        editorialScore: Number(c.editorial_score),
        canonical,
        members,
        sourceIds: new Set(members.map(m => m.sourceId)),
      };
    })
    .filter(c => c.canonical) // drop any cluster with no fetched items (shouldn't happen, defensive)
    .sort((a, b) => b.editorialScore - a.editorialScore);

  return rankedQueue;
}

// Source registry lookup — used by SourceLink to resolve a source's display
// name (rss_items only stores source_id, not the human-readable name).
export async function fetchSourceNames() {
  const { data, error } = await supabase.from('sources').select('id, name');
  if (error) throw new Error(`fetchSourceNames: ${error.message}`);
  return new Map(data.map(s => [s.id, s.name]));
}
