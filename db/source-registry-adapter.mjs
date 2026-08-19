// source-registry-adapter.mjs — Backend Control Plane Phase 1: Source
// Registry RPC surface.
//
// Per docs/backend-control-plane-phase1-source-registry-design-v1.md §C.
// Three functions only — add_source/update_source/set_source_status,
// no per-field mutators, no generic rule engine. Each funnels through
// admin-only enforcement at a single choke point, same discipline as
// ui/src/admin/reviewQueueAdapter.js::writeOverride().
//
// CUTOVER COMPLETE (per docs/control-plane-phase1-cutover-completion-
// implementation-plan-v1.md, Item 1): targets the real `sources` table.
// Previously targeted `sources_registry_staging` as a proving ground
// (2026-08-16 - this cutover). `active` is a legacy boolean column kept
// in lockstep with `status` by setSourceStatus() below — db/verify-
// source-registry-production-migration.mjs and db/verify-staging-post-
// patch.mjs both enforce (status === 'active') === (active === true) as
// a hard invariant, so any status-changing write must set both.

import { isAdmin } from './editor-auth.mjs';

const TABLE = 'sources';

// Source Registry actions compound across every future story from that
// source, every edition — same Principle of Escalation class as
// source_overrides' ADMIN_ONLY_ACTIONS (db/editor-auth.mjs). All three
// functions below are admin-only, no exceptions.
function assertAdmin(role, action) {
  if (!isAdmin(role)) {
    throw new Error(`${action} memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`);
  }
}

export async function addSource(supabase, { id, name, url, language, trustScore, knownCategory, sourceType, excludePatterns, role }) {
  assertAdmin(role, 'add_source');
  if (!id || !name || !url || !language) {
    throw new Error('addSource: id, name, url, language semua diperlukan.');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new Error(`addSource: URL tidak sah — "${url}".`);
  }
  if (trustScore == null || trustScore < 0 || trustScore > 100) {
    throw new Error('addSource: trustScore diperlukan, 0-100.');
  }

  const { error } = await supabase.from(TABLE).insert({
    id,
    name,
    url,
    language,
    trust_score: trustScore,
    known_category: knownCategory ?? null,
    source_type: sourceType ?? null,
    exclude_patterns: excludePatterns ?? null,
    status: 'active',
  });
  if (error) throw new Error(`addSource: ${error.message}`);
}

export async function updateSource(supabase, { id, name, url, trustScore, knownCategory, sourceType, excludePatterns, extraCa, role }) {
  assertAdmin(role, 'update_source');
  if (!id) throw new Error('updateSource: id diperlukan.');

  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (url !== undefined) {
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      throw new Error(`updateSource: URL tidak sah — "${url}".`);
    }
    patch.url = url;
  }
  if (trustScore !== undefined) {
    if (trustScore < 0 || trustScore > 100) throw new Error('updateSource: trustScore mesti 0-100.');
    patch.trust_score = trustScore;
  }
  if (knownCategory !== undefined) patch.known_category = knownCategory;
  if (sourceType !== undefined) patch.source_type = sourceType;
  if (excludePatterns !== undefined) patch.exclude_patterns = excludePatterns;
  if (extraCa !== undefined) patch.extra_ca = extraCa;

  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`updateSource: ${error.message}`);
}

const VALID_STATUSES = new Set(['active', 'disabled', 'archived']);

export async function setSourceStatus(supabase, { id, status, reason, role }) {
  assertAdmin(role, 'set_source_status');
  if (!id) throw new Error('setSourceStatus: id diperlukan.');
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`setSourceStatus: status tidak sah — "${status}". Mesti salah satu: active, disabled, archived.`);
  }
  // Per design doc §B: disabled/archived are deliberate actions with
  // real operational consequence (a source stops supplying content) —
  // require a reason, same discipline as story_overrides.reason NOT NULL.
  if (status !== 'active' && !reason) {
    throw new Error(`setSourceStatus: sebab diperlukan utk status "${status}".`);
  }

  const { error } = await supabase.from(TABLE).update({
    status,
    active: status === 'active',
    updated_at: new Date().toISOString(),
    // Polish 6B-a (2026-08-19): `reason` was validated above but never
    // actually stored -- editor types a reason, system silently
    // discarded it. Current-status reason only (no history/event log,
    // per ChatGPT's explicit call) -- cleared back to null once the
    // source is active again, since a stale disable-reason on an active
    // source would be misleading.
    status_reason: status === 'active' ? null : reason,
  }).eq('id', id);
  if (error) throw new Error(`setSourceStatus: ${error.message}`);
}

// Parses a stringified regex like '/tender/i' (produced by
// String(regex) — the exact form the migration generator wrote into
// exclude_patterns, db/generate-source-registry-production-migration.mjs)
// back into a real RegExp. Fail-closed: an unparseable stored pattern
// is a data-integrity bug, not something to silently skip.
function parseExcludePattern(str) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(str);
  if (!m) throw new Error(`parseExcludePattern: cannot parse stored pattern "${str}"`);
  return new RegExp(m[1], m[2]);
}

// Production ingestion reader — Backend Control Plane Phase 1 cutover
// (2026-08-17, per ChatGPT's explicit go-ahead). Reads the REAL
// `sources` table (not sources_registry_staging), ALL rows regardless
// of status — fetchFeed() itself already skips non-'active' sources
// (lab/rss.js:191), so this must return the full set (including
// rss-kpm/disabled) for that existing skip-logic to still see it and
// for the sources_staging mirror step to still record it. Maps DB
// column names back to the exact camelCase shape lab/sources.js's
// RSS_SOURCES entries have, since fetchFeed/parseRssXml read
// source.trustScore, source.knownCategory, source.excludePatterns,
// source.extraCa — not the DB's snake_case columns.
export async function fetchAllSourcesForIngestion(supabase) {
  const { data, error } = await supabase.from('sources').select('*');
  if (error) throw new Error(`fetchAllSourcesForIngestion: ${error.message}`);
  return data.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    language: r.language,
    trustScore: r.trust_score,
    status: r.status,
    statusReason: r.status_reason ?? undefined,
    knownCategory: r.known_category ?? undefined,
    sourceType: r.source_type ?? undefined,
    excludePatterns: r.exclude_patterns ? r.exclude_patterns.map(parseExcludePattern) : undefined,
    extraCa: r.extra_ca ?? undefined,
    // ChatGPT catch (2026-08-19, Polish 6B.1 review): these 6 columns
    // exist on live `sources` but were silently dropped here, so the
    // ingestion mirror into sources_staging never carried them --
    // sources_staging.created_at/updated_at DEFAULT now(), so the very
    // first real swap would have overwritten every source's real
    // creation/update time and nulled out coverage/last_success_at/
    // last_failure_at/last_failure_reason on promotion. Carried through
    // exactly, no recomputation.
    coverage: r.coverage ?? undefined,
    lastSuccessAt: r.last_success_at ?? undefined,
    lastFailureAt: r.last_failure_at ?? undefined,
    lastFailureReason: r.last_failure_reason ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
