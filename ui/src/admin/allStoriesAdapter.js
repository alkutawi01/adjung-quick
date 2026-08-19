// allStoriesAdapter.js — Admin Console V2, "Berita → Semua Berita" menu.
//
// Round 7/15 (2026-08-19). Per ChatGPT: the main daily workbench needs the
// real corpus a reader might see, PLUS admin-only state (hidden/filtered)
// they need to act on -- not a fixture, and not the Review Queue's narrow
// low-confidence-only slice.
//
// Traced before building: ui/src/adapter/productionAdapter.js::fetchRankedQueue
// is the closest existing real corpus query (story_clusters + rss_items +
// edition_story_classifications + story_overrides, reshaped with the same
// resolveStoryField() precedence used everywhere else in this app). This
// function reuses that EXACT set of tables/columns and the SAME resolver
// (state/editorialStateResolver.mjs::resolveStoryField, the identical
// "hide beats pin beats reclassify beats classifier" precedence), but
// deliberately diverges from fetchRankedQueue in two ways an admin
// workbench needs and a reader-facing query must not:
//   1. Hidden stories are KEPT (labelled "Disembunyikan"), not dropped --
//      an admin must be able to find and un-hide a story.
//   2. Keyword-filtered stories are KEPT (with a filteredByPhrase flag),
//      not dropped -- same reasoning fetchEditorialFilterMatches() already
//      documents: filtered is audit-visible, not invisible, to an admin.
// Queries story_overrides DIRECTLY (not the public_active_overrides view
// productionAdapter.js uses) because this runs on the ADMIN's own
// authenticated client, which story_overrides' RLS already permits --
// same posture as reviewQueueAdapter.js.
//
// No new schema/RPC/classifier/resolver/ranking logic -- every table,
// column and resolver here is already real and already used elsewhere.

import { resolveStoryField } from '../../../state/editorialStateResolver.mjs';
import { resolveEditorialFilterForStory } from '../../../state/editorialFilterResolver.mjs';
import { getFieldLabel } from '../../../state/editions.js';
// Pusingan 8/15: "Perlu semakan" status here MUST mean exactly what
// fetchReviewQueue() means, not a third independent definition -- these
// two functions are the SAME predicate that adapter's own `.or()` query
// expresses server-side, extracted so both call sites provably agree.
import { isReviewNeeded, getReviewReason } from './reviewQueueAdapter.js';
import { fetchClassificationRulesByIds } from './classificationRulesAdapter.js';

export async function fetchAllStories(supabase, editionId) {
  const [
    { data: clusters, error: clustersErr },
    { data: items, error: itemsErr },
    { data: sources, error: sourcesErr },
    { data: placements, error: placementsErr },
    { data: overrides, error: overridesErr },
    { data: filterRules, error: filterRulesErr },
  ] = await Promise.all([
    supabase.from('story_clusters').select('id, editorial_score, workspace_state'),
    supabase.from('rss_items').select('cluster_id, source_id, title, description, link, published_at'),
    supabase.from('sources').select('id, name'),
    // `classification_method`/`classification_rule` added Pusingan 8/15 --
    // same two already-real columns ReviewQueueCard's ClassificationProvenance
    // reads via fetchReviewQueue(), now surfaced here too.
    supabase.from('edition_story_classifications')
      .select('story_id, field_code, classification_status, classification_confidence, classification_method, classification_rule')
      .eq('edition_id', editionId),
    // Every active override type (hide/reclassify/boost/pin), unlike
    // productionAdapter.js's two-query split -- this table drives status
    // display here, not reader visibility, so all types are read together.
    supabase.from('story_overrides')
      .select('id, story_id, override_type, new_field_code')
      .eq('edition_id', editionId)
      .eq('active', true)
      .gt('expires_at', new Date().toISOString()),
    supabase.from('editorial_filter_rules').select('id, rule_type, phrase').eq('active', true),
  ]);
  if (clustersErr) throw new Error(`fetchAllStories: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchAllStories: rss_items — ${itemsErr.message}`);
  if (sourcesErr) throw new Error(`fetchAllStories: sources — ${sourcesErr.message}`);
  if (placementsErr) throw new Error(`fetchAllStories: edition_story_classifications — ${placementsErr.message}`);
  if (overridesErr) throw new Error(`fetchAllStories: story_overrides — ${overridesErr.message}`);
  // Same non-fatal posture as productionAdapter.js/reviewQueueAdapter.js:
  // this table is a manually-applied schema addition, absence must degrade
  // (no filter badges), never break the whole workbench.
  const rules = filterRulesErr ? [] : (filterRules ?? []);
  if (filterRulesErr) console.warn(`fetchAllStories: editorial_filter_rules unavailable — ${filterRulesErr.message}`);

  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));
  const placementByStory = new Map(placements.map(p => [p.story_id, p]));
  const overridesByStory = new Map();
  for (const o of overrides) {
    if (!overridesByStory.has(o.story_id)) overridesByStory.set(o.story_id, []);
    overridesByStory.get(o.story_id).push(o);
  }
  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  // Same batch-resolve reviewQueueAdapter.js uses -- one query for every
  // admin_rule-method placement in the edition, not one per story.
  const ruleIds = placements
    .filter(p => p.classification_method === 'admin_rule')
    .map(p => p.classification_rule);
  const ruleById = await fetchClassificationRulesByIds(supabase, ruleIds);

  return clusters
    .filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released')
    .map(c => {
      const members = itemsByCluster.get(c.id) || [];
      const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
      if (!canonical) return null; // defensive, matches productionAdapter.js's own guard

      const storyOverrides = overridesByStory.get(c.id) ?? [];
      const placement = placementByStory.get(c.id);
      const resolved = resolveStoryField(
        { field_code: placement?.field_code ?? null, classification_status: placement?.classification_status ?? 'unclassified' },
        storyOverrides,
      );
      const boosted = storyOverrides.some(o => o.override_type === 'boost');
      const pinned = Boolean(resolved.pinned);

      const filterResult = resolveEditorialFilterForStory(
        { title: canonical.title, description: canonical.description },
        rules,
      );

      // "Perlu semakan" here uses the EXACT same predicate + resolved-by-
      // override exclusion as fetchReviewQueue() -- a story with an active
      // hide OR reclassify override is treated as already resolved, same
      // as that adapter's `resolvedIds` set, even though its underlying
      // classification row is untouched (reclassify never rewrites
      // edition_story_classifications, only adds an override on top).
      const rawNeedsReview = isReviewNeeded(
        placement?.classification_status ?? 'unclassified',
        placement?.classification_confidence,
      );
      const resolvedByOverride = storyOverrides.some(o => o.override_type === 'hide' || o.override_type === 'reclassify');
      const needsReview = rawNeedsReview && !resolvedByOverride;

      let status, reasonCode = null, displayReason = null;
      if (!resolved.visible) status = 'Disembunyikan';
      else if (needsReview) {
        status = 'Perlu semakan';
        ({ reasonCode, displayReason } = getReviewReason(placement?.classification_status ?? 'unclassified'));
      } else status = 'Aktif';

      return {
        storyId: c.id,
        title: canonical.title,
        description: canonical.description ?? null,
        sourceName: sourceNameById.get(canonical.source_id) ?? canonical.source_id,
        link: canonical.link,
        publishedAt: canonical.published_at,
        // Only set when the hide itself is what makes this story invisible
        // -- lets the UI offer a direct "Nyahsembunyi" undo without a
        // separate lookup, same overrideId shape ReviewQueueCard already
        // uses for boost/pin undo.
        hideOverrideId: !resolved.visible && resolved.source === 'override' ? resolved.overrideId : null,
        // Real column, present for every cluster (set at ingest by
        // db/ingest-production.js) -- not the same as the explainable
        // freshness/sourceTrust/confidence/boost breakdown, which is only
        // live for ms-MY.Politik via the separate editorial_v1 ranking
        // path (ranking/candidate-scoring.mjs). Shown as the stored
        // ranking score, never claimed as that full breakdown.
        editorialScore: Number(c.editorial_score),
        fieldLabel: resolved.fieldCode ? getFieldLabel(editionId, resolved.fieldCode) : null,
        status,
        reasonCode,
        displayReason,
        classificationMethod: placement?.classification_method ?? null,
        resolvedRule: placement?.classification_method === 'admin_rule' ? (ruleById.get(placement.classification_rule) ?? null) : null,
        boosted,
        pinned,
        filteredByPhrase: filterResult.keep ? null : filterResult.phrase,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}
