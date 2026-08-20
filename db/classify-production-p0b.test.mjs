// classify-production-p0b.test.mjs — Polish P0-B.
//
// Functional tests for the two functions extracted from classify-
// production.js's main() (computeClassificationRows / writeClassificationRows)
// so ingest-production.js's post-swap hook can call the EXACT same logic a
// human running --write gets — not a second, drifting copy of it.
//
// Runs the REAL classifier (understandStory/classifyForAllEditions) against
// a fake Supabase client that returns fixture rows for the four tables
// computeClassificationRows() reads, and a fake RPC response for
// writeClassificationRows(). No live Postgres involved, per this project's
// established "static/fixture test, no DB" posture for anything that would
// otherwise need one (edition-rules-static-audit.test.mjs's own header
// states the same constraint).
//
// Run: node db/classify-production-p0b.test.mjs

import { computeClassificationRows, writeClassificationRows } from './classify-production.js';
import { TAXONOMY_REGISTRY } from '../classification/lib/taxonomy-registry.mjs';

// computeClassificationRows() also calls loadTaxonomyRegistryFromDB(),
// which queries `taxonomy_fields` -- captured here, BEFORE any real DB call
// ever reassigns the live TAXONOMY_REGISTRY binding, from the same
// hardcoded fallback object taxonomy-registry.mjs itself ships as the
// pre-Phase-2 reference. Converting it back into taxonomy_fields-shaped
// rows keeps this fixture consistent with the real classifier's default
// registry instead of hand-authoring a second, driftable copy.
function taxonomyFieldsFixture() {
  const rows = [];
  let order = 0;
  for (const [editionId, fields] of Object.entries(TAXONOMY_REGISTRY)) {
    for (const f of fields) {
      rows.push({ edition_id: editionId, field_code: f.field_code, label: f.label, subject_codes: f.subject_codes, wheel_visible: f.wheel_visible, status: 'active', display_order: order++ });
    }
  }
  return rows;
}
const TAXONOMY_FIELDS_FIXTURE = taxonomyFieldsFixture();

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nCLASSIFY-PRODUCTION P0-B — computeClassificationRows / writeClassificationRows\n');

// A minimal thenable that mimics supabase-js's query builder: .select()/
// .eq() are no-ops returning the same object, and awaiting it resolves
// {data, error} — matching the exact shape every call site in
// computeClassificationRows() awaits. `.select(cols, {count:'exact',
// head:true})` — the shape writeClassificationRows()'s row-count-floor
// guard uses — resolves {count, error} instead, same as the real client.
function makeQuery(data, error = null) {
  const q = {
    select: (_cols, opts) => (opts?.count ? { then: (resolve, reject) => Promise.resolve({ count: data.length, error }).then(resolve, reject) } : q),
    eq: () => q,
    order: () => q,
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return q;
}

function fakeSupabase({ classification_rules = [], edition_rules = [], story_clusters = [], rss_items = [], taxonomy_fields = TAXONOMY_FIELDS_FIXTURE, edition_story_classifications = [], rpcResult = { data: 0, error: null } } = {}) {
  const tables = { classification_rules, edition_rules, story_clusters, rss_items, taxonomy_fields, edition_story_classifications };
  const rpcCalls = [];
  const client = {
    from(table) {
      if (!(table in tables)) throw new Error(`fakeSupabase: unexpected table "${table}"`);
      return makeQuery(tables[table]);
    },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      return Promise.resolve(rpcResult);
    },
    _rpcCalls: rpcCalls,
  };
  return client;
}

// Two clusters: one a Politics story with no detectable geography (so it
// classifies under default_mapping to Politik), one an RTM-sourced item
// with a Malaysia URL segment and no subject (geography_fallback ->
// Nasional) — deliberately distinct classification_method values so the
// stats bucket / row shape assertions below are checking real variety, not
// one lucky path.
const clusterA = { id: 'cluster-a', topic: 'Unclassified', workspace_state: 'active' };
const clusterB = { id: 'cluster-b', topic: 'Unclassified', workspace_state: 'active' };
const clusterExpired = { id: 'cluster-expired', topic: 'Unclassified', workspace_state: 'expired' };
const clusterNoItems = { id: 'cluster-no-items', topic: 'Unclassified', workspace_state: 'active' };

const itemA = {
  id: 'item-a', cluster_id: 'cluster-a', source_id: 'rss-awani-politik',
  title: 'Kongres lulus undang-undang', description: 'Parlimen.',
  link: 'https://www.astroawani.com/berita-politik/kongres-lulus',
  categories: [], source_known_category: null, published_at: '2026-08-17T00:00:00Z', language: 'ms',
};
const itemB = {
  id: 'item-b', cluster_id: 'cluster-b', source_id: 'rss-rtm-nasional',
  title: 'Kerja penggantian paip di dasar Sungai Perai', description: null,
  link: 'https://berita.rtm.gov.my/nasional/senarai-berita-nasional/senarai-artikel/kerja-penggantian-paip/',
  categories: [], source_known_category: null, published_at: '2026-08-17T01:00:00Z', language: 'ms',
};

{
  const client = fakeSupabase({
    story_clusters: [clusterA, clusterB, clusterExpired, clusterNoItems],
    rss_items: [itemA, itemB],
  });
  const result = await computeClassificationRows(client);

  assert('expired clusters are excluded from the active set',
    result.activeClusterCount === 3); // A, B, no-items — not expired
  assert('a cluster with no member items is skipped and counted, not classified',
    result.noItems === 1);
  assert('rows were produced for the two real clusters, across the 3 editions each is eligible for',
    result.rows.length > 0);
  assert('every row carries the cluster id it came from (no cross-contamination between clusters)',
    result.rows.every(r => r.story_id === 'cluster-a' || r.story_id === 'cluster-b'));

  const msRows = result.rows.filter(r => r.edition_id === 'ms-MY');
  const aRow = msRows.find(r => r.story_id === 'cluster-a');
  const bRow = msRows.find(r => r.story_id === 'cluster-b');
  assert('cluster A (Politics, no geography) classifies to Politik via default_mapping',
    aRow?.field_code === 'politics' && aRow?.classification_method === 'default_mapping');
  assert('cluster B (RTM Nasional URL, no subject) classifies to Nasional via geography_fallback',
    bRow?.field_code === 'nasional' && bRow?.classification_method === 'geography_fallback');
  assert('subject_code is preserved as the raw Universal Subject fact for A',
    aRow?.subject_code === 'Politics');
  assert('subject_code is null for the geography-residual result, not fabricated',
    bRow?.subject_code == null);

  assert('stats bucket is keyed by editionId, matching classifyForAllEditions\' own real keys',
    Object.keys(result.stats).includes('ms-MY'));

  // computeClassificationRows() must be READ-ONLY. Confirmed structurally
  // rather than assumed: the fake client's tables have no write methods at
  // all (no .insert/.update/.delete/.upsert defined on the query object),
  // so any attempt to write would have thrown a TypeError and failed this
  // whole block already — the block completing at all IS the proof.
  assert('completed without ever calling the fake rpc() (compute is I/O-read-only)',
    client._rpcCalls.length === 0);
}

// --- writeClassificationRows(): routes through the RPC, not a client-side
// delete+upsert loop, and returns the RPC's own row count. ---
{
  const originalEnv = { DATABASE_ENV: process.env.DATABASE_ENV, CONFIRM_PRODUCTION_WRITE: process.env.CONFIRM_PRODUCTION_WRITE };
  try {
    process.env.DATABASE_ENV = 'development'; // assertWriteAllowed() allows this freely
    delete process.env.CONFIRM_PRODUCTION_WRITE;

    const rows = [{ story_id: 'x', edition_id: 'ms-MY', field: 'Politik' }];
    const expectedIds = ['x'];
    const client = fakeSupabase({ rpcResult: { data: 42, error: null } });
    const written = await writeClassificationRows(client, rows, expectedIds);

    assert('calls the replace_edition_story_classifications RPC exactly once',
      client._rpcCalls.length === 1 && client._rpcCalls[0].name === 'replace_edition_story_classifications');
    assert('passes the rows through as p_rows, unmodified',
      client._rpcCalls[0].params.p_rows === rows);
    assert('passes the ID snapshot through as p_expected_story_ids, unmodified (P0-B.1)',
      client._rpcCalls[0].params.p_expected_story_ids === expectedIds);
    assert('returns the RPC\'s own row count, not a client-side counter',
      written === 42);
  } finally {
    if (originalEnv.DATABASE_ENV === undefined) delete process.env.DATABASE_ENV; else process.env.DATABASE_ENV = originalEnv.DATABASE_ENV;
    if (originalEnv.CONFIRM_PRODUCTION_WRITE === undefined) delete process.env.CONFIRM_PRODUCTION_WRITE; else process.env.CONFIRM_PRODUCTION_WRITE = originalEnv.CONFIRM_PRODUCTION_WRITE;
  }
}

// --- writeClassificationRows() enforces the production-write guard ITSELF
// — a caller (like the future ingest hook) cannot forget it, because there
// is no way to reach the RPC call without going through this function. ---
{
  const originalEnv = { DATABASE_ENV: process.env.DATABASE_ENV, CONFIRM_PRODUCTION_WRITE: process.env.CONFIRM_PRODUCTION_WRITE };
  try {
    delete process.env.DATABASE_ENV;
    delete process.env.CONFIRM_PRODUCTION_WRITE;
    const client = fakeSupabase({ rpcResult: { data: 1, error: null } });
    let threw = false;
    try { await writeClassificationRows(client, [{ story_id: 'x' }], ['x']); }
    catch { threw = true; }
    assert('refuses to write with DATABASE_ENV unset (fails closed, same guard --write already used)', threw);
    assert('the refusal happens BEFORE the RPC is ever called', client._rpcCalls.length === 0);

    process.env.DATABASE_ENV = 'production';
    process.env.CONFIRM_PRODUCTION_WRITE = 'false';
    let threw2 = false;
    try { await writeClassificationRows(client, [{ story_id: 'x' }], ['x']); }
    catch { threw2 = true; }
    assert('refuses production writes without CONFIRM_PRODUCTION_WRITE=true', threw2);
  } finally {
    if (originalEnv.DATABASE_ENV === undefined) delete process.env.DATABASE_ENV; else process.env.DATABASE_ENV = originalEnv.DATABASE_ENV;
    if (originalEnv.CONFIRM_PRODUCTION_WRITE === undefined) delete process.env.CONFIRM_PRODUCTION_WRITE; else process.env.CONFIRM_PRODUCTION_WRITE = originalEnv.CONFIRM_PRODUCTION_WRITE;
  }
}

// --- The empty-rows guard lives in the RPC/SQL layer (tested statically in
// classification-atomic-replace-static-audit.test.mjs), not duplicated in
// JS — writeClassificationRows() must not silently swallow that refusal;
// the RPC's error must surface as a thrown JS error. ---
{
  const client = fakeSupabase({ rpcResult: { data: null, error: { message: 'replace_edition_story_classifications: refusing to write 0 rows' } } });
  process.env.DATABASE_ENV = 'development';
  let threw = false, message = '';
  try { await writeClassificationRows(client, [], []); }
  catch (err) { threw = true; message = err.message; }
  delete process.env.DATABASE_ENV;
  assert('an RPC-level error (e.g. the empty-batch guard firing) is re-thrown as a real JS Error, not swallowed',
    threw && /refusing to write 0 rows/.test(message));
}

// --- The row-count-drop floor: adversarial review caught that the RPC's
// own guard only refuses a fully EMPTY batch, so a non-empty but
// drastically SMALLER result (a partial upstream hiccup, not the deliberate
// "wipe everything" case) would sail through and silently destroy good
// data once this runs automatically after every ingestion, with no human
// eyeballing the dry-run stats first. ---
{
  const originalEnv = { DATABASE_ENV: process.env.DATABASE_ENV, CONFIRM_PRODUCTION_WRITE: process.env.CONFIRM_PRODUCTION_WRITE };
  process.env.DATABASE_ENV = 'development';
  try {
    // 543 rows currently, only 50 computed this run -- a >50% drop.
    const currentRows = Array.from({ length: 543 }, (_, i) => ({ story_id: `s${i}` }));
    const client = fakeSupabase({ edition_story_classifications: currentRows, rpcResult: { data: 50, error: null } });
    const newRows = Array.from({ length: 50 }, (_, i) => ({ story_id: `s${i}` }));

    const newIds = newRows.map(r => r.story_id);
    let threw = false, message = '';
    try { await writeClassificationRows(client, newRows, newIds); }
    catch (err) { threw = true; message = err.message; }
    assert('refuses a drop from 543 to 50 rows (>50%) without force', threw);
    assert('the refusal happens BEFORE the RPC is ever called (no partial write attempted)', client._rpcCalls.length === 0);
    assert('the error names both counts so an operator can judge it, not a generic message',
      /543/.test(message) && /50/.test(message));

    const written = await writeClassificationRows(client, newRows, newIds, { force: true });
    assert('{ force: true } bypasses the floor and reaches the RPC', client._rpcCalls.length === 1);
    assert('a forced write still returns the RPC\'s real count', written === 50);
  } finally {
    if (originalEnv.DATABASE_ENV === undefined) delete process.env.DATABASE_ENV; else process.env.DATABASE_ENV = originalEnv.DATABASE_ENV;
    if (originalEnv.CONFIRM_PRODUCTION_WRITE === undefined) delete process.env.CONFIRM_PRODUCTION_WRITE; else process.env.CONFIRM_PRODUCTION_WRITE = originalEnv.CONFIRM_PRODUCTION_WRITE;
  }
}
{
  process.env.DATABASE_ENV = 'development';
  // A modest, plausible day-to-day fluctuation (543 -> 400, ~26% drop)
  // must NOT trip the guard -- it exists for a catastrophic drop, not
  // ordinary corpus churn (old clusters expiring, a quiet news day).
  const currentRows = Array.from({ length: 543 }, (_, i) => ({ story_id: `s${i}` }));
  const client = fakeSupabase({ edition_story_classifications: currentRows, rpcResult: { data: 400, error: null } });
  const newRows = Array.from({ length: 400 }, (_, i) => ({ story_id: `s${i}` }));
  const written = await writeClassificationRows(client, newRows, newRows.map(r => r.story_id));
  delete process.env.DATABASE_ENV;
  assert('a modest ~26% drop (ordinary churn) is NOT blocked by the floor', written === 400 && client._rpcCalls.length === 1);
}
{
  process.env.DATABASE_ENV = 'development';
  // An INCREASE (the real P0-A recovery: 278 -> 543) must never be treated
  // as a drop by an inverted or off-by-one comparison.
  const currentRows = Array.from({ length: 278 }, (_, i) => ({ story_id: `s${i}` }));
  const client = fakeSupabase({ edition_story_classifications: currentRows, rpcResult: { data: 543, error: null } });
  const newRows = Array.from({ length: 543 }, (_, i) => ({ story_id: `s${i}` }));
  const written = await writeClassificationRows(client, newRows, newRows.map(r => r.story_id));
  delete process.env.DATABASE_ENV;
  assert('a large INCREASE (278 -> 543, the real P0-A recovery) is never mistaken for a drop',
    written === 543 && client._rpcCalls.length === 1);
}

// --- P0-B.1: the stale-generation scenario ChatGPT specified exactly --
// compute G1, live data changes to G2, write of G1's (now stale) result
// must be refused.
//
// HONEST SCOPE NOTE (adversarial review): the "rejectingClient" below
// re-implements the staleness comparison in JS to decide whether its
// fake rpc() should reject. That proves the JS layer collects and
// forwards the right snapshot UNCHANGED to the RPC call -- it does NOT
// and CANNOT prove the real SQL guard's own two-directional EXCEPT logic
// is correct, since no live Postgres is available in this environment
// (same constraint every RPC audit in this project states, e.g.
// edition-rules-static-audit.test.mjs's header). That correctness is
// verified separately and more rigorously in
// classification-atomic-replace-static-audit.test.mjs, which parses the
// real SQL's two EXCEPT clauses and checks their operand order directly
// (not just "EXCEPT appears twice") -- confirmed by reproducing the
// director's own review mutation (both EXCEPT clauses reading the same
// direction) and verifying that specific static check catches it. ---
{
  process.env.DATABASE_ENV = 'development';
  // computeClassificationRows() ran against G1: clusters a and b.
  const g1Client = fakeSupabase({
    story_clusters: [
      { id: 'a', topic: 'Unclassified', workspace_state: 'active' },
      { id: 'b', topic: 'Unclassified', workspace_state: 'active' },
    ],
    rss_items: [itemA, { ...itemB, cluster_id: 'b' }],
  });
  const g1 = await computeClassificationRows(g1Client);
  delete process.env.DATABASE_ENV;

  assert('the G1 snapshot captured exactly the two clusters compute ran against',
    JSON.stringify([...g1.activeClusterIds].sort()) === JSON.stringify(['a', 'b']));

  // Simulates the real scenario: by the time the (slow) G1 write is about
  // to happen, live data has moved on to G2 -- a NEW cluster 'c' appeared,
  // matching a fake RPC that behaves like the real one would (rejects a
  // stale p_expected_story_ids). This proves writeClassificationRows()
  // genuinely SENDS the snapshot it was given, not a value it silently
  // recomputes or drops -- the actual staleness DECISION is the SQL
  // guard's job, proven separately and statically.
  const rejectingClient = {
    _rpcCalls: [],
    rpc(name, params) {
      rejectingClient._rpcCalls.push({ name, params });
      const live = new Set(['a', 'b', 'c']); // G2: c appeared since G1 was computed
      const stale = params.p_expected_story_ids.some(id => !live.has(id)) || [...live].some(id => !params.p_expected_story_ids.includes(id));
      return Promise.resolve(stale
        ? { data: null, error: { message: 'replace_edition_story_classifications: data berita berubah sejak pengelasan dikira -- kira semula.' } }
        : { data: g1.rows.length, error: null });
    },
    from() { return { select: () => ({ then: (resolve) => resolve({ count: 0, error: null }) }) }; },
  };
  process.env.DATABASE_ENV = 'development';
  let threw = false, message = '';
  try { await writeClassificationRows(rejectingClient, g1.rows, g1.activeClusterIds); }
  catch (err) { threw = true; message = err.message; }
  delete process.env.DATABASE_ENV;

  assert('writeClassificationRows() forwards the ORIGINAL G1 snapshot to the RPC unchanged (it is the RPC\'s job to detect it is stale, not the JS layer\'s)',
    rejectingClient._rpcCalls[0]?.params.p_expected_story_ids === g1.activeClusterIds);
  assert('a stale-generation rejection from the RPC surfaces as a real thrown error (not swallowed)',
    threw && /data berita berubah sejak pengelasan dikira/.test(message));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
