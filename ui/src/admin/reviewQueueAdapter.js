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

import { canPerformAction, isAdmin } from '../../../db/editor-auth.mjs';
import { resolveEditorialFilterForStory, phraseMatchesText } from '../../../state/editorialFilterResolver.mjs';
import { getFieldEntryByLabel } from '../../../classification/lib/taxonomy-registry.mjs';
import { fetchClassificationRulesByIds } from './classificationRulesAdapter.js';

// reason_code -> display_reason, per docs/review-queue-spec-v1.md's
// translation table. Only the two v1-supported codes are here — see the
// plan doc §1 for why content_mismatch/manual_flag aren't wired yet.
const REASON_DISPLAY = {
  low_confidence: 'Sistem belum pasti bidang yang sesuai.',
  no_evidence: 'Sistem tidak jumpa petunjuk untuk letak berita ini dalam mana-mana bidang.',
};

// Extracted Pusingan 8/15 (2026-08-19), per ChatGPT's explicit instruction
// not to let AllStoriesPanel's "Semua Berita" table invent a second,
// slightly-different definition of "perlu semakan". This is the EXACT
// same predicate the `.or(...)` query below expresses server-side --
// kept in sync by hand since a Supabase `.or()` filter string can't
// itself be shared code across a server-side query and a client-side
// array filter. If this predicate ever changes, change the `.or()`
// string below to match, and vice versa.
export function isReviewNeeded(classificationStatus, classificationConfidence) {
  return classificationStatus === 'unclassified' || Number(classificationConfidence) < 0.5;
}

export function getReviewReason(classificationStatus) {
  const reasonCode = classificationStatus === 'unclassified' ? 'no_evidence' : 'low_confidence';
  return { reasonCode, displayReason: REASON_DISPLAY[reasonCode] };
}

// Editorial Filter Rules V1 (docs/editorial-filter-rules-design-v1.md,
// approved by ChatGPT 2026-08-16): a story excluded by a keyword rule is
// audit-visible here, NOT action_required — this reasonCode is deliberately
// excluded from `needsAttention` counting below. Purpose is transparency
// (why did a reader-visible story drop to 0), not asking the admin to
// resolve anything.

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
    // `classification_method`/`classification_rule` added for
    // ClassificationProvenance wiring (Admin Console V2) -- both already
    // real, persisted columns (db/schema-edition-classification.sql),
    // written by db/classify-production.js since Fasa 3. Not new backend.
    .select('story_id, field, classification_status, classification_confidence, classification_method, classification_rule')
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
    { data: promotionalOverrides, error: promotionalErr },
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
    // Boost/Pin are promotional, not corrective (see the long comment
    // above) -- deliberately queried SEPARATELY from the resolved-exclusion
    // query, so fetching their current state can never accidentally start
    // excluding stories from the queue the way merging them in did before
    // the 2026-08-13 fix. Read-state only; existence of a row here has no
    // bearing on whether a story appears above.
    supabase.from('story_overrides').select('id, story_id, override_type, new_field')
      .eq('edition_id', editionId)
      .eq('active', true)
      .in('override_type', ['boost', 'pin'])
      .gt('expires_at', new Date().toISOString())
      .in('story_id', storyIds),
  ]);
  if (clustersErr) throw new Error(`fetchReviewQueue: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchReviewQueue: rss_items — ${itemsErr.message}`);
  if (overridesErr) throw new Error(`fetchReviewQueue: story_overrides — ${overridesErr.message}`);
  if (sourcesErr) throw new Error(`fetchReviewQueue: sources — ${sourcesErr.message}`);
  if (promotionalErr) throw new Error(`fetchReviewQueue: story_overrides (boost/pin) — ${promotionalErr.message}`);

  const boostByStoryId = new Map();
  const pinByStoryId = new Map();
  for (const row of promotionalOverrides) {
    if (row.override_type === 'boost') boostByStoryId.set(row.story_id, row.id);
    else if (row.override_type === 'pin') pinByStoryId.set(row.story_id, { overrideId: row.id, field: row.new_field });
  }

  // Batch-resolve classification_rule ids -> full rule detail, per
  // classificationRulesAdapter.js's own N+1-avoidance contract (one query
  // for the whole queue, not one per story). Only 'admin_rule'-method
  // stories actually carry a rule id; ClassificationProvenance.jsx treats
  // a missing Map entry as "rule not found", never throws.
  const ruleIds = classifications
    .filter(c => c.classification_method === 'admin_rule')
    .map(c => c.classification_rule);
  const ruleById = await fetchClassificationRulesByIds(supabase, ruleIds);

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
      const { reasonCode, displayReason } = getReviewReason(c.classification_status);
      return {
        storyId: c.story_id,
        field: c.field ?? null,
        title: canonical.title,
        sourceName: sourceNameById.get(canonical.source_id) ?? canonical.source_id,
        publishedAt: canonical.published_at,
        reasonCode,
        displayReason,
        classificationMethod: c.classification_method,
        resolvedRule: c.classification_method === 'admin_rule' ? (ruleById.get(c.classification_rule) ?? null) : null,
        boostOverrideId: boostByStoryId.get(c.story_id) ?? null,
        pin: pinByStoryId.get(c.story_id) ?? null,
      };
    })
    .filter(Boolean)
    // Most recent first, per docs/review-queue-spec-v1.md's ordering rule.
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// Editorial Filter Rules V1 (docs/editorial-filter-rules-design-v1.md,
// approved by ChatGPT 2026-08-16). Deliberately SEPARATE from
// fetchReviewQueue()/fetchDigest()'s `needsAttention` — a keyword-excluded
// story is audit-visible, never action-required, so it must never be
// counted alongside genuine classification issues. Callers render this as
// its own labelled section, not merged into the main queue array.
export async function fetchEditorialFilterMatches(supabase, editionId) {
  const [
    { data: clusters, error: clustersErr },
    { data: items, error: itemsErr },
    { data: sources, error: sourcesErr },
    { data: filterRules, error: filterRulesErr },
  ] = await Promise.all([
    supabase.from('story_clusters').select('id, workspace_state'),
    supabase.from('rss_items').select('cluster_id, source_id, title, description, published_at'),
    supabase.from('sources').select('id, name'),
    supabase.from('editorial_filter_rules').select('id, rule_type, phrase').eq('active', true),
  ]);
  if (clustersErr) throw new Error(`fetchEditorialFilterMatches: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchEditorialFilterMatches: rss_items — ${itemsErr.message}`);
  if (sourcesErr) throw new Error(`fetchEditorialFilterMatches: sources — ${sourcesErr.message}`);
  // Non-fatal, like productionAdapter.js's identical guard: if the schema
  // hasn't been applied yet (manual Supabase SQL Editor step, no automated
  // migration path here), this section just shows nothing — never breaks
  // the rest of the admin UI.
  if (filterRulesErr) { console.warn(`fetchEditorialFilterMatches: editorial_filter_rules unavailable — ${filterRulesErr.message}`); return []; }
  if (filterRules.length === 0) return [];

  const liveClusterIds = new Set(
    clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released').map(c => c.id),
  );
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));
  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  const matches = [];
  for (const clusterId of liveClusterIds) {
    const members = itemsByCluster.get(clusterId) || [];
    const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
    if (!canonical) continue;
    const result = resolveEditorialFilterForStory({ title: canonical.title, description: canonical.description }, filterRules);
    if (result.keep) continue;
    matches.push({
      storyId: clusterId,
      title: canonical.title,
      sourceName: sourceNameById.get(canonical.source_id) ?? canonical.source_id,
      publishedAt: canonical.published_at,
      // Deliberately distinct shape from fetchReviewQueue()'s rows — no
      // reasonCode from REASON_DISPLAY, no field, and NOT action-required.
      filteredByPhrase: result.phrase,
      displayLabel: 'Ditapis oleh kata kunci',
      actionRequired: false,
    });
  }

  return matches.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// Per-rule real impact for the Tapisan admin screen (Admin Console V2),
// per ChatGPT's Find & Replace mental model: an admin must see what a
// rule actually DOES, not just that it exists. Reuses the same live-story
// scan as fetchEditorialFilterMatches() above but aggregates PER EXCLUDE
// RULE instead of returning a flat list, and separates "sepadan & ditapis"
// from "sepadan tapi dikecualikan" -- state/editorialFilterResolver.mjs's
// own doc comment is explicit that EXCEPT is GLOBAL (any active except
// phrase can save a story from ANY active exclude phrase, first-match-wins
// across the whole rule set) -- it is NOT scoped to one specific exclude
// rule, even though the UI groups exclude/except into two visual lists.
// This function's counts respect that real semantics rather than
// pretending each exclude has its own private except list.
// Polish 5B (2026-08-19) -- extracted so previewFilterRuleCandidate()
// (below) scans the exact same live-story set as fetchEditorialFilterEffect,
// no second implementation of "what counts as a live canonical story".
async function fetchCanonicalLiveStoriesForFilterScan(supabase) {
  const [
    { data: clusters, error: clustersErr },
    { data: items, error: itemsErr },
    { data: sources, error: sourcesErr },
  ] = await Promise.all([
    supabase.from('story_clusters').select('id, workspace_state'),
    supabase.from('rss_items').select('cluster_id, source_id, title, description, published_at'),
    supabase.from('sources').select('id, name'),
  ]);
  if (clustersErr) throw new Error(`fetchCanonicalLiveStoriesForFilterScan: story_clusters — ${clustersErr.message}`);
  if (itemsErr) throw new Error(`fetchCanonicalLiveStoriesForFilterScan: rss_items — ${itemsErr.message}`);
  if (sourcesErr) throw new Error(`fetchCanonicalLiveStoriesForFilterScan: sources — ${sourcesErr.message}`);

  const liveClusterIds = new Set(
    clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released').map(c => c.id),
  );
  const sourceNameById = new Map(sources.map(s => [s.id, s.name]));
  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  const canonicalStories = [];
  for (const clusterId of liveClusterIds) {
    const members = itemsByCluster.get(clusterId) || [];
    const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
    if (canonical) canonicalStories.push({ clusterId, ...canonical });
  }
  return { canonicalStories, sourceNameById };
}

export async function fetchEditorialFilterEffect(supabase) {
  const [{ canonicalStories, sourceNameById }, { data: filterRules, error: filterRulesErr }] = await Promise.all([
    fetchCanonicalLiveStoriesForFilterScan(supabase),
    supabase.from('editorial_filter_rules').select('id, rule_type, phrase').eq('active', true),
  ]);
  if (filterRulesErr) { console.warn(`fetchEditorialFilterEffect: editorial_filter_rules unavailable — ${filterRulesErr.message}`); return []; }

  const excludeRules = filterRules.filter(r => r.rule_type === 'exclude');
  if (excludeRules.length === 0) return [];

  return excludeRules.map(rule => {
    const filtered = [];
    const excepted = [];
    for (const story of canonicalStories) {
      const text = `${story.title ?? ''} ${story.description ?? ''}`;
      // Polish 5B (2026-08-19), real bug found while building rule preview:
      // this used to pre-filter with plain text.includes(phraseLower) --
      // the exact substring hole Polish 5A.1 fixed in the resolver itself
      // (e.g. rule "arak" would "match" the word "semarak" here, then the
      // real resolver correctly returns a DEFAULT keep for it, which the
      // old `if (result.keep) excepted.push(...)` below wrongly counted as
      // "dikecualikan" with a blank/null savedByPhrase). Now uses the same
      // boundary-aware matcher as the resolver -- one matcher, everywhere.
      if (!phraseMatchesText(text, rule.phrase)) continue; // this exclude rule doesn't apply to this story at all
      const result = resolveEditorialFilterForStory({ title: story.title, description: story.description }, filterRules);
      const row = {
        storyId: story.clusterId,
        title: story.title,
        sourceName: sourceNameById.get(story.source_id) ?? story.source_id,
        publishedAt: story.published_at,
      };
      // Only a real 'exception' outcome counts as "saved by an except" --
      // a story that matched THIS rule's phrase but landed on a plain
      // 'default' keep (impossible now that the matcher is shared, kept as
      // a defensive check) must never be mislabelled as excepted.
      if (result.keep && result.reason === 'exception') excepted.push({ ...row, savedByPhrase: result.phrase });
      else if (!result.keep) filtered.push(row);
    }
    return {
      ruleId: rule.id,
      phrase: rule.phrase,
      matchedCount: filtered.length + excepted.length,
      filteredCount: filtered.length,
      exceptedCount: excepted.length,
      sampleFiltered: filtered.slice(0, 5),
      sampleExcepted: excepted.slice(0, 5),
    };
  });
}

// Polish 5B (2026-08-19) -- read-only rule-candidate preview, per
// ChatGPT's "Find & Replace" mental model: show what a rule would do
// BEFORE it's saved/activated, not after. Zero writes (no INSERT, no
// UPDATE, no temp DB row) -- purely a live scan + in-memory resolver run.
//
// Simulates the REAL rule set, not just "does this phrase appear
// anywhere" -- combines the candidate with the CURRENTLY ACTIVE rules
// (excludeRuleId lets a Pulih/reactivate preview omit the rule's own
// now-inactive row from the "existing active rules" side, since it's
// about to become the candidate again) before calling the same
// resolveEditorialFilterForStory() production uses. This is what makes
// "serbuan kasino" correctly preview as KEPT when an active except rule
// like "serbuan" already exists, instead of naively reporting every
// "kasino" match as a future filter.
export async function previewFilterRuleCandidate(supabase, candidate, { excludeRuleId } = {}) {
  const [{ canonicalStories, sourceNameById }, { data: activeRules, error }] = await Promise.all([
    fetchCanonicalLiveStoriesForFilterScan(supabase),
    supabase.from('editorial_filter_rules').select('id, rule_type, phrase').eq('active', true),
  ]);
  if (error) throw new Error(`previewFilterRuleCandidate: editorial_filter_rules — ${error.message}`);

  const baseRules = (activeRules ?? []).filter(r => r.id !== excludeRuleId);
  const combinedRules = [...baseRules, { id: '__candidate__', rule_type: candidate.ruleType, phrase: candidate.phrase }];

  const toRow = s => ({
    storyId: s.clusterId,
    title: s.title,
    sourceName: sourceNameById.get(s.source_id) ?? s.source_id,
    publishedAt: s.published_at,
  });

  const matched = canonicalStories.filter(s => phraseMatchesText(`${s.title ?? ''} ${s.description ?? ''}`, candidate.phrase));

  if (candidate.ruleType === 'exclude') {
    const filtered = [], excepted = [];
    for (const s of matched) {
      const result = resolveEditorialFilterForStory({ title: s.title, description: s.description }, combinedRules);
      if (!result.keep) filtered.push(toRow(s));
      else excepted.push({ ...toRow(s), savedByPhrase: result.phrase });
    }
    return {
      ruleType: 'exclude',
      matchedCount: matched.length,
      filteredCount: filtered.length,
      exceptedCount: excepted.length,
      sampleFiltered: filtered.slice(0, 5),
      sampleExcepted: excepted.slice(0, 5),
    };
  }

  // except: for each story the phrase itself matches, compare the outcome
  // WITHOUT the candidate (current active rules only) against WITH it --
  // "saved" means this except would flip an exclude match to kept; a
  // story that was already going to be kept regardless is NOT a rescue.
  const saved = [], alreadyKept = [];
  for (const s of matched) {
    const withoutCandidate = resolveEditorialFilterForStory({ title: s.title, description: s.description }, baseRules);
    if (!withoutCandidate.keep) saved.push(toRow(s));
    else alreadyKept.push(toRow(s));
  }
  return {
    ruleType: 'except',
    matchedCount: matched.length,
    savedCount: saved.length,
    alreadyKeptCount: alreadyKept.length,
    sampleSaved: saved.slice(0, 5),
    sampleAlreadyKept: alreadyKept.slice(0, 5),
  };
}

// Editorial Filter Rules V1 management (Editorial Desk > Keputusan
// Editorial), per docs/editorial-filter-rules-design-v1.md and ChatGPT's
// 2026-08-16 instruction to build this before dropping any *_old table.
//
// Admin-only, checked here (same choke-point discipline as writeOverride()
// below) — per db/editor-auth.mjs's own Principle of Escalation, a global
// keyword rule affects every future story across every edition, the same
// "impact compounds" class as source_overrides' ADMIN_ONLY_ACTIONS, even
// though it isn't itself an override_type value canPerformAction() knows
// about. RLS on editorial_filter_rules is signed-in-editor, matching
// story_overrides' posture — this is the actual admin boundary.

export async function fetchFilterRules(supabase) {
  // ALL rows, not just active — an admin managing rules needs to see and
  // re-toggle inactive ones too, unlike fetchEditorialFilterMatches()
  // above (which only ever needs active rules to evaluate stories).
  const { data, error } = await supabase
    .from('editorial_filter_rules')
    .select('id, rule_type, phrase, reason, active, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`fetchFilterRules: editorial_filter_rules — ${error.message}`);
  return data;
}

export async function addFilterRule(supabase, { ruleType, phrase, reason, createdBy, role }) {
  if (!isAdmin(role)) throw new Error(`Menambah rule penapisan memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`);
  const trimmed = phrase.trim();
  if (!trimmed) throw new Error('Kata/frasa tidak boleh kosong.');
  const { error } = await supabase
    .from('editorial_filter_rules')
    .insert({ rule_type: ruleType, phrase: trimmed, reason: reason?.trim() || null, created_by: createdBy });
  if (error) throw new Error(`addFilterRule: editorial_filter_rules — ${error.message}`);
}

export async function setFilterRuleActive(supabase, id, active, role) {
  if (!isAdmin(role)) throw new Error(`Menukar status rule memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`);
  const { error } = await supabase.from('editorial_filter_rules').update({ active }).eq('id', id);
  if (error) throw new Error(`setFilterRuleActive: editorial_filter_rules — ${error.message}`);
}

export async function deleteFilterRule(supabase, id, role) {
  if (!isAdmin(role)) throw new Error(`Membuang rule memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`);
  const { error } = await supabase.from('editorial_filter_rules').delete().eq('id', id);
  if (error) throw new Error(`deleteFilterRule: editorial_filter_rules — ${error.message}`);
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
  // Taxonomy Stable Field-ID V1 (2026-08-16): governance-limit check below
  // must compare field_code, not the mutable label — otherwise a Bidang
  // rename mid-flight would let two "different" labels (old and new) both
  // independently hit the 2-pin cap, silently doubling it during the
  // rename window (docs/taxonomy-stable-field-id-design-v1.md §1g).
  const pinFieldEntry = getFieldEntryByLabel(editionId, newField);
  if (!pinFieldEntry) throw new Error(`submitPinOverride: label "${newField}" not found in ${editionId} taxonomy.`);
  const pinFieldCode = pinFieldEntry.field_code;

  // Per ChatGPT's explicit UX instruction: hide and pin must never both
  // apply to one story — if hide already exists, pin is moot (restrictive
  // beats permissive). Checked here, at write time — AllStoriesPanel's
  // "Kekalkan dalam pemilihan" action now offers pin directly (Polish
  // 8D-A comment fix, this was stale since that UI shipped), but the
  // adapter stays the enforcement point regardless of which surface
  // calls it.
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
    .eq('new_field_code', pinFieldCode)
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
  // Taxonomy Stable Field-ID V1 (2026-08-16): the UI still passes a label
  // (ReviewQueueCard's dropdown value), so it's resolved to the stable
  // new_field_code here, at the single write choke point — same reasoning
  // as canPerformAction() above, no future caller can forget this step.
  // resolveStoryField() (state/editorialStateResolver.mjs) reads
  // new_field_code, not new_field — an override written without it would
  // silently become invisible to every reader.
  let newFieldCode = null;
  if (newField) {
    const entry = getFieldEntryByLabel(editionId, newField);
    if (!entry) throw new Error(`writeOverride(${overrideType}): label "${newField}" not found in ${editionId} taxonomy — cannot resolve a stable field_code.`);
    newFieldCode = entry.field_code;
  }

  const { error } = await supabase.from('story_overrides').insert({
    story_id: storyId,
    edition_id: editionId,
    override_type: overrideType,
    new_field: newField ?? null,
    new_field_code: newFieldCode,
    reason,
    created_by: createdBy,
  });
  if (error) throw new Error(`writeOverride(${overrideType}): ${error.message}`);
}
