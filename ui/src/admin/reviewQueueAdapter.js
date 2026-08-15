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

import { canPerformAction } from '../../../db/editor-auth.mjs';

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
    // Active overrides for THIS edition — a story already RESOLVED (hide or
    // reclassify written) drops out of the active queue per the plan doc's
    // Detected -> Pending Review -> Resolved lifecycle. The override row
    // itself remains the permanent audit trail; it just isn't re-shown here.
    //
    // `.in('override_type', ['hide', 'reclassify'])` added 2026-08-13
    // (docs/editorial-adversarial-audit-v1.md Audit 2 finding D). This
    // query previously matched ANY active override, including boost —
    // which resolves no classification problem at all. A boosted story
    // with a genuine low-confidence/unclassified issue silently vanished
    // from the queue the moment it was boosted, even though nothing about
    // its classification problem had changed. "Resolved" now means what
    // the lifecycle actually claims: a CORRECTIVE action was taken, not
    // that ANY editorial action happened to touch the story. Pin, once
    // built, is also a promotional/editorial action, not corrective — it
    // must be excluded here too, for the same reason boost is.
    //
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
      .in('override_type', ['hide', 'reclassify'])
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
//
// FASA 4.1.3 (docs/admin-digest-trend-plan-v1.md, approved with ChatGPT's
// two conditions): trend reads ONLY operational_snapshots_public, no
// parallel computation. Per ChatGPT's explicit correction mid-approval —
// "Bukan: Digest kira failed source sendiri / kira override sendiri.
// Tetapi: operational_snapshot -> Digest presentation" — failedSources
// and activeOverrides get NEITHER a live "today" number NOR a trend
// unless TODAY's snapshot row already exists (daily-observation.mjs has
// run today); reviewQueue/storiesProcessed already have a live "today"
// value from the queries above, so those only need YESTERDAY's row to
// show a trend line.
export async function fetchDigest(supabase, editionId) {
  const [{ count: processed, error: processedErr }, queue, { data: overrides, error: overridesErr }, { data: snapshots, error: snapshotsErr }] = await Promise.all([
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
    // `.in()` on exact today/yesterday dates, never a range + "latest
    // row" pick — a gap of more than one day must NOT silently compare
    // against an older row and call it "semalam" (the edge case ChatGPT
    // named explicitly as "tipu senyap").
    supabase.from('operational_snapshots_public')
      .select('snapshot_date, stories_processed, review_queue_count, failed_sources_count, active_override_count')
      .in('snapshot_date', [localDateString(0), localDateString(-1)]),
  ]);
  if (processedErr) throw new Error(`fetchDigest: edition_story_classifications — ${processedErr.message}`);
  if (overridesErr) throw new Error(`fetchDigest: story_overrides — ${overridesErr.message}`);
  if (snapshotsErr) throw new Error(`fetchDigest: operational_snapshots_public — ${snapshotsErr.message}`);

  const todaySnapshot = snapshots.find(s => s.snapshot_date === localDateString(0)) ?? null;
  const yesterdaySnapshot = snapshots.find(s => s.snapshot_date === localDateString(-1)) ?? null;

  return {
    processed: processed ?? 0,
    needsAttention: queue.length,
    // processed minus what needs attention. Floored at 0 defensively: the
    // two numbers come from separate queries a moment apart, and a story
    // could in principle be resolved in between.
    noActionNeeded: Math.max(0, (processed ?? 0) - queue.length),
    actionsToday: summariseActions(overrides),
    // FASA 4.1.3 — see the block comment above for why failedSources /
    // activeOverrides are null unless todaySnapshot exists, while
    // reviewQueue / storiesProcessed only need yesterdaySnapshot.
    hasYesterdayComparison: yesterdaySnapshot !== null,
    failedSourcesToday: todaySnapshot?.failed_sources_count ?? null,
    activeOverridesToday: todaySnapshot?.active_override_count ?? null,
    trend: {
      reviewQueue: trendSuffix(queue.length, yesterdaySnapshot?.review_queue_count),
      storiesProcessed: trendSuffix(processed ?? 0, yesterdaySnapshot?.stories_processed),
      failedSources: todaySnapshot ? trendSuffix(todaySnapshot.failed_sources_count, yesterdaySnapshot?.failed_sources_count) : null,
      activeOverrides: todaySnapshot ? trendSuffix(todaySnapshot.active_override_count, yesterdaySnapshot?.active_override_count) : null,
    },
  };
}

function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Local calendar date (not UTC) as YYYY-MM-DD, matching
// operational_snapshots.snapshot_date's own local-day semantics
// (db/daily-observation.mjs writes `observedAt.slice(0, 10)`, and the
// script is intended to be run once per real day by whoever runs it).
function localDateString(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Human-language comparison clause, per ChatGPT's own approved format —
// never a bare "delta: +5". Returns null (no line at all) when either
// side is missing, or when there's genuinely no change to report.
function trendSuffix(today, yesterday) {
  if (today == null || yesterday == null) return null;
  const delta = today - yesterday;
  if (delta === 0) return null;
  return ` (${delta > 0 ? '+' : ''}${delta} berbanding semalam)`;
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

export async function submitHideOverride(supabase, { storyId, editionId, reason, createdBy, role }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'hide', reason, createdBy, role });
}

export async function submitReclassifyOverride(supabase, { storyId, editionId, newField, reason, createdBy, role }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'reclassify', newField, reason, createdBy, role });
}

export async function submitBoostOverride(supabase, { storyId, editionId, reason, createdBy, role }) {
  return writeOverride(supabase, { storyId, editionId, overrideType: 'boost', reason, createdBy, role });
}

// FASA 3.6.5 Pin. Per docs/pin-implementation-design-review-v1.md: reuses
// `new_field` (the column reclassify already has) rather than a new
// schema column — pin's new_field is "which Bidang this story should be
// pinned within", the same semantic reclassify's new_field already
// carries. Admin-only enforcement, expiry (24h), and audit fields are all
// handled by writeOverride()/the DB trigger already — nothing pin-specific
// needed there. The two guards below are pin-specific and checked BEFORE
// writeOverride() runs, so a rejected pin never reaches the database at
// all — refused with a readable reason, never silently dropped.
export async function submitPinOverride(supabase, { storyId, editionId, newField, reason, createdBy, role }) {
  if (!newField) {
    throw new Error('Pin memerlukan bidang — tiada bidang dipilih.');
  }

  // Per ChatGPT's explicit UX instruction: hide and pin must never both
  // apply to one story — if hide already exists, pin is moot (restrictive
  // beats permissive). Checked here, at write time, since no UI currently
  // offers a "pin" action to gate this at (per ChatGPT: Pin's surface is
  // deferred to a future Editorial Desk, not the Review Queue) — the
  // adapter is the only enforcement point that exists today.
  const { data: activeHides, error: hideErr } = await supabase
    .from('story_overrides')
    .select('id')
    .eq('story_id', storyId)
    .eq('edition_id', editionId)
    .eq('override_type', 'hide')
    .eq('active', true)
    .gt('expires_at', new Date().toISOString());
  if (hideErr) throw new Error(`submitPinOverride: checking hide — ${hideErr.message}`);
  if (activeHides.length > 0) {
    throw new Error('Berita ini sedang disembunyikan — nyahsembunyi dahulu sebelum pin.');
  }

  // Governance limit: maximum 2 active pins per (edition, field). Refused
  // with a readable reason naming the count, never silently accepted —
  // docs/pin-governance-design-v1.md is explicit that silent acceptance
  // of a pin that does nothing is the exact class of bug this project has
  // already hit three times. A genuine check-then-write race exists here
  // (two concurrent pins could both pass this check); with one real admin
  // today that cannot realistically occur, and state/reducer.js's own
  // defensive cap (oldest-2-win) bounds the damage if it ever does — see
  // that file's comment. A database constraint would close this properly;
  // not worth it before Pin has a single real caller.
  const { data: activePins, error: pinErr } = await supabase
    .from('story_overrides')
    .select('id')
    .eq('edition_id', editionId)
    .eq('override_type', 'pin')
    .eq('new_field', newField)
    .eq('active', true)
    .gt('expires_at', new Date().toISOString());
  if (pinErr) throw new Error(`submitPinOverride: checking pin limit — ${pinErr.message}`);
  if (activePins.length >= 2) {
    throw new Error(`Sudah ada ${activePins.length} pin aktif dalam bidang ini (had maksimum 2). Nyahpin satu dahulu.`);
  }

  return writeOverride(supabase, { storyId, editionId, overrideType: 'pin', newField, reason, createdBy, role });
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

async function writeOverride(supabase, { storyId, editionId, overrideType, newField, reason, createdBy, role }) {
  // AUDIT FIX (2026-08-13, docs/editorial-adversarial-audit-v1.md finding 1):
  // canPerformAction() had ZERO production callers. db/schema-editorial-state.sql
  // states the Principle of Escalation is "enforced at the APPLICATION layer",
  // and no such handler existed — the admin-only boundary was documented, unit
  // tested, and connected to nothing.
  //
  // Enforced HERE, at the single write choke point, deliberately rather than
  // only in the UI: a UI-only gate would repeat the same one-layer mistake the
  // audit just found. Every override write in the app goes through this
  // function, so no future caller (including Pin) can bypass it by forgetting
  // to add a check.
  //
  // Fails CLOSED on a missing/unknown role — consistent with getEditorRole()'s
  // own fail-closed contract in db/editor-auth.mjs.
  if (!canPerformAction(role, overrideType)) {
    throw new Error(
      `Tindakan "${overrideType}" memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`,
    );
  }

  // AUDIT FIX (2026-08-13, Audit 2 findings B+C): expires_at is no longer
  // computed here at all. It used to be set from the ADMIN'S DEVICE clock
  // and checked later against the POSTGRES clock — a skew in either
  // direction shifted real expiry, and every override used the same
  // hardcoded 7 days regardless of type, which would have made a 24h Pin
  // silently outlive its own governance rule by 5 days.
  // db/schema-fix-server-side-expiry.sql's BEFORE INSERT trigger now
  // computes expires_at server-side from override_type, unconditionally —
  // the same clock sets it and later checks it, and duration policy lives
  // in exactly one place (SQL), not duplicated as a JS constant here.
  const { error } = await supabase.from('story_overrides').insert({
    story_id: storyId,
    edition_id: editionId,
    override_type: overrideType,
    new_field: newField ?? null,
    reason,
    created_by: createdBy,
  });
  if (error) throw new Error(`writeOverride(${overrideType}): ${error.message}`);
}
