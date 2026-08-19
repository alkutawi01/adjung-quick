// carry-forward-personal-state.mjs — Polish 6B.1, per
// docs/polish-6b1-personal-state-carry-forward-design-v1.md (ChatGPT-
// approved design, 2026-08-19).
//
// Pure, unit-testable helper functions ONLY — no Supabase client, no I/O.
// db/ingest-production.js wires these into the real staging build. This
// stays a small carry-forward-specific helper, deliberately NOT a
// generic framework/service (per ChatGPT's explicit instruction).
//
// Purpose: db/ingest-production.js REBUILDS story_clusters/rss_items
// from scratch every run, from active sources only. saved_stories/
// history_entries reference story_clusters.id directly (FK, no ON
// DELETE action) — a story a reader saved/viewed that doesn't reappear
// in the fresh corpus would go dangling once *_old is dropped. These
// functions carry that ONE story (and only that story) forward into
// staging, marked workspace_state='expired' so it never re-enters the
// normal reader feed/ranking, purely to keep the FK valid and the
// personal reference retrievable later.

// rows: [{ story_id }], from saved_stories/history_entries SELECTs
// (already filtered to expires_at > nowIso by the caller).
export function computeProtectedStoryIds(savedRows, historyRows) {
  return new Set([...savedRows, ...historyRows].map(r => r.story_id));
}

// freshClusterIds: Set of cluster IDs already going into staging via the
// normal fresh-build path (labRankedQueue). Anything protected but NOT
// in that set needs carry-forward.
export function computeMissingProtected(protectedStoryIds, freshClusterIds) {
  return [...protectedStoryIds].filter(id => !freshClusterIds.has(id));
}

// liveCluster: a row read from the LIVE story_clusters table (before
// swap). Score/timestamps preserved EXACTLY as-is — carry-forward never
// recomputes editorial scoring. Only workspace_state is forced, and
// representative_rss_item_id is deliberately nulled here (circular FK,
// same pattern the fresh-build path already uses) — the caller restores
// it via a follow-up UPDATE after the cluster's items are inserted.
export function buildCarryForwardClusterRow(liveCluster) {
  return {
    id: liveCluster.id,
    representative_rss_item_id: null,
    topic: liveCluster.topic,
    workspace_state: 'expired',
    freshness_score: liveCluster.freshness_score,
    cross_source_score: liveCluster.cross_source_score,
    prominence_score: liveCluster.prominence_score,
    expires_at: liveCluster.expires_at,
    review_expires_at: liveCluster.review_expires_at,
    first_seen_at: liveCluster.first_seen_at,
    updated_at: liveCluster.updated_at,
  };
}

// liveItems: rows read from the LIVE rss_items table for one cluster.
// Every ordinary column copied as-is, including fetched_at (this item
// was NOT re-fetched this run — its original fetch time is the honest
// value, not "now").
export function buildCarryForwardItemRows(liveItems) {
  return liveItems.map(it => ({
    id: it.id,
    source_id: it.source_id,
    cluster_id: it.cluster_id,
    rss_guid: it.rss_guid,
    title: it.title,
    description: it.description,
    link: it.link,
    normalized_url: it.normalized_url,
    language: it.language,
    published_at: it.published_at,
    fetched_at: it.fetched_at,
    categories: it.categories,
    source_known_category: it.source_known_category,
  }));
}

// Fail-closed checks for ONE carry-forward cluster, before it's ever
// inserted into staging. Returns an array of human-readable error
// strings (empty = valid). Never "repairs" or guesses — every anomaly
// here means the whole ingestion run must fail before swap.
export function validateCarryForwardCluster({ liveCluster, liveItems, stagingSourceIds }) {
  const errors = [];
  const repId = liveCluster?.representative_rss_item_id;
  const itemIds = new Set(liveItems.map(i => i.id));
  if (!repId || !itemIds.has(repId)) {
    errors.push(`carry-forward gagal: representative_rss_item_id (${repId ?? 'null'}) tiada dalam item carry-forward cluster ${liveCluster?.id}`);
  }
  for (const it of liveItems) {
    if (!stagingSourceIds.has(it.source_id)) {
      errors.push(`carry-forward gagal: source_id "${it.source_id}" (item ${it.id}, cluster ${liveCluster?.id}) tiada dalam sources_staging`);
    }
  }
  return errors;
}

// Detects a carry-forward item ID colliding with a FRESH item ID that
// already went into staging via the normal build path, but pointing at
// a DIFFERENT cluster_id. Never happens in practice if IDs are truly
// unique per RSS item, but per ChatGPT's explicit instruction this must
// fail closed rather than silently pick one side.
export function findItemIdCollisions(carryForwardItems, freshItemsById) {
  const errors = [];
  for (const cf of carryForwardItems) {
    const fresh = freshItemsById.get(cf.id);
    if (fresh && fresh.cluster_id !== cf.cluster_id) {
      errors.push(`carry-forward gagal: item ID "${cf.id}" berlanggar -- cluster_id fresh="${fresh.cluster_id}" vs carry-forward="${cf.cluster_id}"`);
    }
  }
  return errors;
}

// Final pre-swap gate: every protected story ID (fresh OR carried) must
// be present in staging. Returns the list still missing (empty = safe
// to swap).
export function findStillMissingProtected(protectedStoryIds, stagingClusterIds) {
  return [...protectedStoryIds].filter(id => !stagingClusterIds.has(id));
}
