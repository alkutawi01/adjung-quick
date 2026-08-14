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
import { resolveStoryField } from '../../../state/editorialStateResolver.mjs';

// import.meta.env only exists under Vite — guarded so this module can also
// be imported by plain-Node scripts (e.g. the acceptance test) that only
// need the pure mapRowsToRankedQueue() below, not a real Supabase client.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? 'http://localhost';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Distinct storageKey (2026-08-13, found live via the /admin build):
  // main.jsx statically imports both this module and
  // ui/src/admin/adminSupabase.js on every page load regardless of route,
  // so both GoTrueClient instances always exist together in one browser
  // context. Without separate keys they'd default to the same
  // "sb-<project-ref>-auth-token" storage key — see adminSupabase.js.
  auth: { persistSession: false, storageKey: 'adjung-quick-reader-auth' },
});

// Fetches the current Ranked Queue from Supabase and reshapes it into the
// cluster array state/reducer.js's `context.rankedQueue` expects.
// `editionId` selects WHICH edition's placement each cluster carries as its
// `topic`. Per docs/edition-state-model.md the Wheel is edition-scoped, so
// the same cluster legitimately arrives labelled `Dunia` for ms-MY and
// `World` for en-global — that divergence is the Edition Architecture
// working, not a data inconsistency.
export async function fetchRankedQueue(editionId = 'ms-MY') {
  const [{ data: sources, error: sourcesErr }, { data: clusters, error: clustersErr }, { data: items, error: itemsErr }, { data: placements, error: placementsErr }, { data: overrides, error: overridesErr }] =
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
      // FASA 3.6.3a — Resolver Integration: this is the ONE place a human
      // editorial decision (ui/src/admin's Review Queue) actually reaches a
      // reader. Without this query, story_overrides rows exist in the
      // database but readers never see their effect — a real gap found and
      // closed 2026-08-13, not a hypothetical.
      //
      // Queries public_active_overrides (a narrow VIEW,
      // db/schema-public-active-overrides-view.sql), NOT story_overrides
      // directly — story_overrides' own RLS is signed-in-editors-only by
      // design (db/schema-editorial-state.sql), and rightly so: it also
      // carries `reason`/`created_by`, an editor's internal note and an
      // auth.users reference, neither of which a reader needs or should be
      // able to pull via direct REST access. The view exposes only
      // story_id/edition_id/override_type/new_field, for active rows only.
      // `id, created_at` added 2026-08-13 (audit finding 3): without
      // created_at, resolveStoryField()'s most-recent-wins conflict rule was
      // inert here — it sorted undefined against undefined. Selecting them is
      // half the fix; the view had to expose them too.
      supabase.from('public_active_overrides')
        .select('id, story_id, override_type, new_field, created_at')
        .eq('edition_id', editionId),
    ]);

  if (sourcesErr) throw new Error(`fetchRankedQueue: sources — ${sourcesErr.message}`);
  if (clustersErr) throw new Error(`fetchRankedQueue: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchRankedQueue: rss_items — ${itemsErr.message}`);
  if (placementsErr) throw new Error(`fetchRankedQueue: edition_story_classifications — ${placementsErr.message}`);
  if (overridesErr) throw new Error(`fetchRankedQueue: public_active_overrides — ${overridesErr.message}`);

  return mapRowsToRankedQueue({ sources, clusters, items, placements, overrides });
}

// Pure reshape, split out from fetchRankedQueue so the edition-placement
// mapping (the exact thing the Production Classification Acceptance Test
// needs to guard) is testable without a live Supabase call — see
// db/production-classification-acceptance.test.mjs.
export function mapRowsToRankedQueue({ sources, clusters, items, placements, overrides = [] }) {
  const placementByStory = new Map(placements.map(p => [p.story_id, p]));

  // FASA 3.6.3a: active story_overrides, grouped by story — the SAME
  // resolveStoryField() precedence (hide beats reclassify beats classifier)
  // state/editorialStateResolver.test.mjs already proves in isolation, now
  // reused here rather than re-implemented. `overrides` is the caller's
  // already-active-filtered query result (per-edition), not re-filtered here.
  const overridesByStory = new Map();
  for (const o of overrides) {
    if (!overridesByStory.has(o.story_id)) overridesByStory.set(o.story_id, []);
    overridesByStory.get(o.story_id).push(o);
  }

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
      // FASA 3.6.3a: fold in any active editorial override BEFORE the topic
      // is decided. A hidden story reuses the exact same "topic: null"
      // invisibility an unclassified story already has — no reader-facing
      // Bidang ever matches null, so it never enters any edition's eligible
      // pool, and therefore never reaches selectActiveSet()'s ranking at
      // all. That's the "hide beats ranking" contract satisfied
      // structurally (the ranking step never even sees it), not as a
      // separate check layered on top.
      const resolved = resolveStoryField(
        { field: placement?.field ?? null, classification_status: placement?.classification_status ?? 'unclassified' },
        overridesByStory.get(c.id) ?? [],
      );
      // FASA 3.6.3c: a `boost` override is NOT resolved by
      // resolveStoryField() — boost affects ranking selection, not
      // field/visibility, so it is deliberately outside that function's
      // scope (see its own header comment). It rides along as a flag that
      // state/editorialRankingAdapter.js reads on the editorial_v1 path.
      const boosted = (overridesByStory.get(c.id) ?? []).some(o => o.override_type === 'boost');
      // FASA 3.6.5: unlike boost, `pinned` (and `pinnedAt`, for placement
      // ordering among multiple pins) come straight from resolveStoryField()
      // — pin DOES determine field/visibility, so it's already resolved
      // above. Just carried through onto the cluster here, same as boosted.
      return {
        clusterKey: c.id,
        boosted,
        pinned: Boolean(resolved.pinned),
        pinnedAt: resolved.pinned ? overridesByStory.get(c.id).find(o => o.id === resolved.overrideId)?.created_at ?? null : null,
        // null when this edition has no placement for the story (genuinely
        // unclassified, not yet run through classify-production.js), OR
        // when an active `hide` override applies. `null` is correct and
        // expected in both cases — "Unclassified"/"Hidden" are STATUSES,
        // never a Bidang value (docs/structural-evidence-fallback-policy.md).
        // Such stories simply don't appear under any Wheel field.
        topic: resolved.visible ? resolved.field : null,
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
