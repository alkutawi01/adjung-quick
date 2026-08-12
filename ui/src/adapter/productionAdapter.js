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
// `editionId` selects WHICH edition's placement each cluster carries as its
// `topic`. Per docs/edition-state-model.md the Wheel is edition-scoped, so
// the same cluster legitimately arrives labelled `Dunia` for ms-MY and
// `World` for en-global — that divergence is the Edition Architecture
// working, not a data inconsistency.
export async function fetchRankedQueue(editionId = 'ms-MY') {
  const [{ data: sources, error: sourcesErr }, { data: clusters, error: clustersErr }, { data: items, error: itemsErr }, { data: placements, error: placementsErr }] =
    await Promise.all([
      supabase.from('sources').select('id, trust_score'),
      supabase.from('story_clusters').select('id, topic, editorial_score, workspace_state'),
      supabase.from('rss_items').select('id, source_id, cluster_id, rss_guid, title, description, link, normalized_url, language, published_at'),
      // Per-edition placement, written by db/classify-production.js from the
      // frozen classification engine. Replaces story_clusters.topic (the OLD
      // classifier's Politics/Economy/Sports/World vocabulary, which has ZERO
      // overlap with any edition's real taxonomy).
      supabase.from('edition_story_classifications')
        .select('story_id, field, classification_status, classification_confidence')
        .eq('edition_id', editionId),
    ]);

  if (sourcesErr) throw new Error(`fetchRankedQueue: sources — ${sourcesErr.message}`);
  if (clustersErr) throw new Error(`fetchRankedQueue: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchRankedQueue: rss_items — ${itemsErr.message}`);
  if (placementsErr) throw new Error(`fetchRankedQueue: edition_story_classifications — ${placementsErr.message}`);

  const placementByStory = new Map(placements.map(p => [p.story_id, p]));

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
      const placement = placementByStory.get(c.id);
      return {
        clusterKey: c.id,
        // null when this edition has no placement for the story (genuinely
        // unclassified, or not yet run through classify-production.js).
        // `null` is correct and expected here — "Unclassified" is a STATUS,
        // never a Bidang value (docs/structural-evidence-fallback-policy.md).
        // Such stories simply don't appear under any Wheel field.
        topic: placement?.classification_status === 'classified' ? placement.field : null,
        // Kept for audit/debugging: what the OLD classifier said. Not used
        // for placement anymore. Remove once the new path is proven in
        // production, per db/schema-edition-classification.sql's own note.
        legacyTopic: c.topic,
        classificationConfidence: placement ? Number(placement.classification_confidence) : 0,
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
