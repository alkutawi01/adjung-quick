// reviewQueueAdapter.js — Fasa 3.6.2. Per
// docs/review-queue-ui-implementation-plan-v1.md §1: queries the ALREADY
// COMPUTED results in edition_story_classifications directly (written once
// by db/classify-production.js), rather than re-running the classifier the
// way db/classification-observatory.mjs does for its from-scratch CLI
// report. Same detected conditions, cheaper live path.
//
// Every query here runs against the signed-in admin's OWN client (passed
// in, never a module-level singleton) — story_overrides' RLS policy
// requires auth.uid() to resolve to a real editors row, so reads of it
// (via the "is this story already resolved" exclusion) must go through an
// authenticated session, not the anonymous reader client.

// reason_code -> display_reason, per docs/review-queue-spec-v1.md's
// translation table. Only the two v1-supported codes are here — see the
// plan doc §1 for why content_mismatch/manual_flag aren't wired yet.
const REASON_DISPLAY = {
  low_confidence: 'Sistem belum pasti bidang yang sesuai.',
  no_evidence: 'Sistem tidak jumpa petunjuk untuk letak berita ini dalam mana-mana bidang.',
};

// story_overrides.expires_at is NOT NULL (db/schema-editorial-state.sql) —
// per this project's own established content lifecycle, news has a ~1 week
// shelf life (Izzat's own reasoning for the Google Drive backup decision).
const OVERRIDE_LIFESPAN_DAYS = 7;

export async function fetchReviewQueue(supabase, editionId) {
  const { data: classifications, error: classErr } = await supabase
    .from('edition_story_classifications')
    // `field` added for FASA 3.6.3c: Boost availability depends on which
    // Bidang the story sits in, since the Editorial Ranking Engine (the
    // only consumer of a boost signal) is active per (edition, field).
    .select('story_id, field, classification_status, classification_confidence')
    .eq('edition_id', editionId)
    .or('classification_status.eq.unclassified,classification_confidence.lt.0.5');
  if (classErr) throw new Error(`fetchReviewQueue: edition_story_classifications — ${classErr.message}`);
  if (classifications.length === 0) return [];

  const storyIds = classifications.map(c => c.story_id);

  const [
    { data: clusters, error: clustersErr },
    { data: items, error: itemsErr },
    { data: overrides, error: overridesErr },
    { data: sources, error: sourcesErr },
  ] = await Promise.all([
    supabase.from('story_clusters').select('id, workspace_state').in('id', storyIds),
    supabase.from('rss_items').select('cluster_id, source_id, title, published_at').in('cluster_id', storyIds),
    // Active overrides for THIS edition — a story already resolved (hide or
    // reclassify written) drops out of the active queue per the plan doc's
    // Detected -> Pending Review -> Resolved lifecycle. The override row
    // itself remains the permanent audit trail; it just isn't re-shown here.
    // `.gt('expires_at')` added 2026-08-13
    // (docs/override-expiry-enforcement-bugfix-v1.md). Without it, an
    // EXPIRED override still excluded its story from the queue — so once
    // the reader-side fix let that story reappear to readers, it would
    // remain invisible to the admin's own Review Queue. Reader and admin
    // would hold different beliefs about the same story, and the admin
    // could never re-decide it.
    supabase.from('story_overrides').select('story_id')
      .eq('edition_id', editionId)
      .eq('active', true)
      .gt('expires_at', new Date().toISOString())
      .in('story_id', storyIds),
    supabase.from('sources').select('id, name'),
  ]);
  if (clustersErr) throw new Error(`fetchReviewQueue: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchReviewQueue: rss_items — ${itemsErr.message}`);
  if (overridesErr) throw new Error(`fetchReviewQueue: story_overrides — ${overridesErr.message}`);
  if (sourcesErr) throw new Error(`fetchReviewQueue: sources — ${sourcesErr.message}`);

  const resolvedIds = new Set(overrides.map(o => o.story_id));
  // Same exclusion productionAdapter.js applies to the reader-facing queue
  // — a story no reader can ever see doesn't belong in the review queue
  // either (docs/review-queue-ui-implementation-plan-v1.md's scope is
  // "stories a real reader might encounter", not every row in the table).
  const liveClusterIds = new Set(
    clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released').map(c => c.id),
  );
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));

  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  return classifications
    .filter(c => liveClusterIds.has(c.story_id) && !resolvedIds.has(c.story_id))
    .map(c => {
      const members = itemsByCluster.get(c.story_id) || [];
      const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
      if (!canonical) return null;
      const reasonCode = c.classification_status === 'unclassified' ? 'no_evidence' : 'low_confidence';
      return {
        storyId: c.story_id,
        field: c.field ?? null,
        title: canonical.title,
        sourceName: sourceNameById.get(canonical.source_id) ?? canonical.source_id,
        publishedAt: canonical.published_at,
        reasonCode,
        displayReason: REASON_DISPLAY[reasonCode],
      };
    })
    .filter(Boolean)
    // Most recent first, per docs/review-queue-spec-v1.md's ordering rule.
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// FASA 3.6.4 Admin Digest. Per docs/admin-digest-implementation-plan-v1.md
// §1: NOT a new detection system. `needsAttention` comes from calling
// fetchReviewQueue() itself — the same code path, same thresholds, so the
// digest and the Review Queue can never disagree about what counts as a
// problem. The other numbers are plain counts, no new rules.
export async function fetchDigest(supabase, editionId) {
  const [{ count: processed, error: processedErr }, queue, { data: overrides, error: overridesErr }] = await Promise.all([
    supabase.from('edition_story_classifications')
      .select('story_id', { count: 'exact', head: true })
      .eq('edition_id', editionId),
    fetchReviewQueue(supabase, editionId),
    // "Today" in the admin's own local day, not UTC — an editor reading
    // "hari ini" means their day. Computed here rather than in SQL so it
    // follows the browser's timezone without a server-side assumption.
    supabase.from('story_overrides')
      .select('override_type, new_field, created_at')
      .eq('edition_id', editionId)
      // active only: an override made and then undone the same day is no
      // longer a change in effect, and listing it under "Perubahan
      // editorial hari ini" would tell the admin something is true of the
      // system when it isn't. The row still exists as audit trail; a
      // history view (deferred) is where undone actions belong.
      .eq('active', true)
      .gte('created_at', startOfLocalDayIso()),
  ]);
  if (processedErr) throw new Error(`fetchDigest: edition_story_classifications — ${processedErr.message}`);
  if (overridesErr) throw new Error(`fetchDigest: story_overrides — ${overridesErr.message}`);

  return {
    processed: processed ?? 0,
    needsAttention: queue.length,
    // processed minus what needs attention. Floored at 0 defensively: the
    // two numbers come from separate queries a moment apart, and a story
    // could in principle be resolved in between.
    noActionNeeded: Math.max(0, (processed ?? 0) - queue.length),
    actionsToday: summariseActions(overrides),
  };
}

function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Plain-Malay sentences, per the human-first language layer — the admin
// never sees an override_type like 'reclassify'.
function summariseActions(overrides) {
  const lines = [];
  const hidden = overrides.filter(o => o.override_type === 'hide').length;
  const boosted = overrides.filter(o => o.override_type === 'boost').length;
  const reclassified = overrides.filter(o => o.override_type === 'reclassify');

  for (const [field, count] of countByField(reclassified)) {
    lines.push(`${count} berita dipindahkan ke ${field}`);
  }
  if (hidden > 0) lines.push(`${hidden} berita disembunyikan`);
  if (boosted > 0) lines.push(`${boosted} berita dinaikkan`);
  return lines;
}

function countByField(rows) {
  const counts = new Map();
  for (const r of rows) {
    const field = r.new_field ?? 'bidang lain';
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  return [...counts.entries()];
}

export async function submitHideOverride(supabase, { storyId, editionId, reason, createdBy }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'hide', reason, createdBy });
}

export async function submitReclassifyOverride(supabase, { storyId, editionId, newField, reason, createdBy }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'reclassify', newField, reason, createdBy });
}

export async function submitBoostOverride(supabase, { storyId, editionId, reason, createdBy }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'boost', reason, createdBy });
}

// FASA 3.6.3a Test 4 (undo/remove override): deactivating is a soft update
// (active -> false), never a delete — the row stays as the permanent audit
// trail of what was decided and by whom, per
// docs/editorial-state-implementation-spec-v1.md. No UI calls this yet
// (ChatGPT's 3.6.3a scope explicitly excludes a History screen) — this
// exists so the mechanism itself is real and provable, not just a promise.
export async function deactivateOverride(supabase, overrideId) {
  const { error } = await supabase.from('story_overrides').update({ active: false }).eq('id', overrideId);
  if (error) throw new Error(`deactivateOverride: ${error.message}`);
}

async function writeOverride(supabase, { storyId, editionId, overrideType, newField, reason, createdBy }) {
  const expiresAt = new Date(Date.now() + OVERRIDE_LIFESPAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('story_overrides').insert({
    story_id: storyId,
    edition_id: editionId,
    override_type: overrideType,
    new_field: newField ?? null,
    reason,
    created_by: createdBy,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`writeOverride(${overrideType}): ${error.message}`);
}
