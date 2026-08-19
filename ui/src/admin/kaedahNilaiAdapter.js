// kaedahNilaiAdapter.js — Admin Console V2, "Nilai & Susunan -> Kaedah
// Nilai" menu.
//
// Pusingan 13/15 (2026-08-19). Read-only corpus fetch for
// KaedahNilaiPanel.jsx's live simulation -- same real tables
// db/scoring-v1-simulation.mjs already reads (sources/story_clusters/
// rss_items/edition_story_classifications/public_active_overrides), just
// through the admin's browser client instead of a Node script. No write
// path exists here at all; this module is read-only by construction.

const EDITION_ID = 'ms-MY';

export async function fetchScoringCorpus(supabase) {
  const [{ data: sources, error: sourcesErr }, { data: clusters, error: clustersErr }] = await Promise.all([
    supabase.from('sources').select('id, name, trust_score'),
    supabase.from('story_clusters').select('id, workspace_state').neq('workspace_state', 'expired').neq('workspace_state', 'released'),
  ]);
  if (sourcesErr) throw new Error(`fetchScoringCorpus: sources — ${sourcesErr.message}`);
  if (clustersErr) throw new Error(`fetchScoringCorpus: story_clusters — ${clustersErr.message}`);

  const [{ data: items, error: itemsErr }, { data: placements, error: placementsErr }, { data: overrides, error: overridesErr }] = await Promise.all([
    supabase.from('rss_items').select('cluster_id, source_id, title, published_at'),
    supabase.from('edition_story_classifications')
      .select('story_id, field_code, classification_status, classification_confidence')
      .eq('edition_id', EDITION_ID),
    // `id, created_at` added Pusingan 14/15 for PemilihanPanel.jsx's pin
    // extraction -- same view productionAdapter.js already reads,
    // browser-safe (no admin gate needed for pin/boost STATE, unlike the
    // write paths).
    supabase.from('public_active_overrides').select('id, story_id, override_type, created_at').eq('edition_id', EDITION_ID),
  ]);
  if (itemsErr) throw new Error(`fetchScoringCorpus: rss_items — ${itemsErr.message}`);
  if (placementsErr) throw new Error(`fetchScoringCorpus: edition_story_classifications — ${placementsErr.message}`);
  if (overridesErr) throw new Error(`fetchScoringCorpus: story_overrides — ${overridesErr.message}`);

  const trustById = new Map(sources.map(s => [s.id, s.trust_score]));
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));
  const placementByStory = new Map(placements.map(p => [p.story_id, p]));
  const boostedIds = new Set(overrides.filter(o => o.override_type === 'boost').map(o => o.story_id));
  // Pusingan 14/15: pinnedAt kept per story (not just a boolean) --
  // state/reducer.js::selectFieldActiveSet sorts pins oldest-first, same
  // ordering PemilihanPanel.jsx must reproduce to match production.
  const pinByStory = new Map(overrides.filter(o => o.override_type === 'pin').map(o => [o.story_id, o]));
  const liveClusterIds = new Set(clusters.map(c => c.id));
  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  const candidates = [];
  for (const [clusterId, placement] of placementByStory) {
    if (!placement.field_code || !liveClusterIds.has(clusterId)) continue;
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
      pinned: pinByStory.has(clusterId),
      pinnedAt: pinByStory.get(clusterId)?.created_at ?? null,
      pinOverrideId: pinByStory.get(clusterId)?.id ?? null,
      fieldCode: placement.field_code,
    });
  }
  return candidates;
}

// Same pin extraction state/reducer.js::selectFieldActiveSet uses (pin
// bypasses the ranking contest entirely, capped at 2, oldest-pin-first)
// -- extracted here so both KaedahNilaiPanel-adjacent code and
// PemilihanPanel.jsx call the SAME logic rather than two copies.
export function extractPinned(group) {
  const pinned = group
    .filter(c => c.pinned)
    .sort((a, b) => new Date(a.pinnedAt ?? 0) - new Date(b.pinnedAt ?? 0))
    .slice(0, 2);
  const pinnedIds = new Set(pinned.map(c => c.storyId));
  const rest = group.filter(c => !pinnedIds.has(c.storyId));
  return { pinned, rest };
}
