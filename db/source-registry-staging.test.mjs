// source-registry-staging.test.mjs — Backend Control Plane Phase 1.
//
// Per ChatGPT's explicit required tests (2026-08-16): the strong proof
// that `sources_registry_staging` is a REAL source of truth, not a
// mirror of lab/sources.js — a source that never existed in the JS file
// must be readable after add_source(), and a source that DID exist in
// the JS file must stop being readable after set_source_status()
// disables it. Live integration test against Supabase (staging table
// only, zero effect on production `sources` or real ingestion).
//
// Run: node db/source-registry-staging.test.mjs
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env, and
// db/backfill-source-registry-staging.mjs --write already run once.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { addSource, updateSource, setSourceStatus, fetchActiveSources } from './source-registry-adapter.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const TEST_ID = 'rss-test-phase1-' + Date.now();

async function main() {
  console.log('\nSOURCE REGISTRY STAGING — Phase 1 acceptance tests\n');

  // --- Admin gating: every write function refuses a non-admin role ---
  {
    let threw = false;
    try {
      await addSource(supabase, { id: TEST_ID, name: 'x', url: 'https://example.com/feed', language: 'ms', trustScore: 80, role: 'editor' });
    } catch { threw = true; }
    assert('addSource refuses editor role (admin-only)', threw);
  }

  // --- Validation: bad URL, bad trustScore refused before any write ---
  {
    let threw = false;
    try {
      await addSource(supabase, { id: TEST_ID, name: 'x', url: 'not-a-url', language: 'ms', trustScore: 80, role: 'admin' });
    } catch { threw = true; }
    assert('addSource refuses an invalid URL', threw);
  }
  {
    let threw = false;
    try {
      await addSource(supabase, { id: TEST_ID, name: 'x', url: 'https://example.com/feed', language: 'ms', trustScore: 150, role: 'admin' });
    } catch { threw = true; }
    assert('addSource refuses trustScore out of 0-100 range', threw);
  }

  // --- THE key test ChatGPT demanded: a source that NEVER existed in
  // lab/sources.js is readable by the (future) ingestion reader after
  // add_source() alone. If this fails, sources_registry_staging is
  // still secretly dependent on the JS file. ---
  await addSource(supabase, {
    id: TEST_ID, name: 'Test Source Phase 1', url: 'https://example.com/test-feed.xml',
    language: 'ms', trustScore: 77, knownCategory: 'ujian', sourceType: 'general', role: 'admin',
  });
  {
    const active = await fetchActiveSources(supabase);
    const found = active.find(s => s.id === TEST_ID);
    assert('a source added purely via addSource() — never in lab/sources.js — is visible to the active-source reader',
      found !== undefined && found.name === 'Test Source Phase 1' && found.known_category === 'ujian');
  }

  // --- updateSource: partial update, only touches provided fields ---
  await updateSource(supabase, { id: TEST_ID, trustScore: 88, role: 'admin' });
  {
    const active = await fetchActiveSources(supabase);
    const found = active.find(s => s.id === TEST_ID);
    assert('updateSource changes trust_score', found?.trust_score === 88);
    assert('updateSource leaves name untouched when not provided', found?.name === 'Test Source Phase 1');
  }

  // --- THE second key test ChatGPT demanded: disabling a source
  // (even one that also exists in the old lab/sources.js config, tested
  // here against a real production-mirrored id) makes it invisible to
  // the active-source reader on the very next read — no ingestion
  // re-run, no deploy, no code change. ---
  const REAL_SOURCE_ID = 'rss-kosmo'; // exists in lab/sources.js AND was just backfilled
  {
    const before = await fetchActiveSources(supabase);
    assert('sanity: rss-kosmo (a real, pre-existing source) is active before disabling', before.some(s => s.id === REAL_SOURCE_ID));
  }
  await setSourceStatus(supabase, { id: REAL_SOURCE_ID, status: 'disabled', reason: 'Phase 1 acceptance test', role: 'admin' });
  {
    const after = await fetchActiveSources(supabase);
    assert('a disabled source (existing in lab/sources.js) disappears from the active-source reader immediately',
      !after.some(s => s.id === REAL_SOURCE_ID));
  }
  // Restore — this test must not leave production-mirrored data altered.
  await setSourceStatus(supabase, { id: REAL_SOURCE_ID, status: 'active', role: 'admin' });
  {
    const restored = await fetchActiveSources(supabase);
    assert('rss-kosmo is active again after restoring status (test cleanup verified, not just assumed)', restored.some(s => s.id === REAL_SOURCE_ID));
  }

  // --- setSourceStatus requires a reason for disabled/archived, not for active ---
  {
    let threw = false;
    try {
      await setSourceStatus(supabase, { id: REAL_SOURCE_ID, status: 'archived', role: 'admin' }); // no reason
    } catch { threw = true; }
    assert('setSourceStatus refuses disabled/archived without a reason', threw);
  }

  // --- cleanup: remove the test row ---
  await supabase.from('sources_registry_staging').delete().eq('id', TEST_ID);
  {
    const active = await fetchActiveSources(supabase);
    assert('test row cleaned up after the run', !active.some(s => s.id === TEST_ID));
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('source-registry-staging.test.mjs failed:', err.message);
  process.exit(1);
});
