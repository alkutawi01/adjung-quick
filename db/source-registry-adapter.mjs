// source-registry-adapter.mjs — Backend Control Plane Phase 1: Source
// Registry RPC surface.
//
// Per docs/backend-control-plane-phase1-source-registry-design-v1.md §C.
// Three functions only — add_source/update_source/set_source_status,
// no per-field mutators, no generic rule engine. Each funnels through
// admin-only enforcement at a single choke point, same discipline as
// ui/src/admin/reviewQueueAdapter.js::writeOverride().
//
// STAGING ONLY (2026-08-16, per ChatGPT's explicit instruction): targets
// `sources_registry_staging`, never the real `sources` table, until a
// separately-approved production cutover. The table name is the ONLY
// thing that changes at cutover — every function body stays identical.

import { isAdmin } from './editor-auth.mjs';

const TABLE = 'sources_registry_staging';

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
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(`setSourceStatus: ${error.message}`);
}

// Read helper — what a (future, staging-only) ingestion reader would
// call. Mirrors the exact filter ingest-production.js will need at
// cutover: only 'active' sources are fetched.
export async function fetchActiveSources(supabase) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'active');
  if (error) throw new Error(`fetchActiveSources: ${error.message}`);
  return data;
}
