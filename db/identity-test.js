// identity-test.js — Identity Layer vertical slice verification, per
// ChatGPT (director) instruction (2026-08-11). Runs against the REAL
// Supabase project (same one Stream A verified against), not a stand-in.
//
// Proves, with real Supabase Auth + RLS (not just documentation):
// 1. Two real auth users (A, B) via Supabase Auth.
// 2. A can read/write A's own saved_stories/history_entries.
// 3. A CANNOT read/write B's rows (RLS enforced, P-005).
// 4. B can read/write B's own rows.
// 5. Save dedup+refresh: saving the same story twice = one row, expires_at refreshed.
// 6. History append-only: releasing the same story twice = two separate rows.
// 7. P-006 regression: Save/History do not alter story_clusters (Editorial
//    Score) or any Stream A engine state.
//
// Usage: node db/identity-test.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PASSWORD = 'IdentitySlice-Test-2026!';
const results = [];
function check(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function makeUser(email) {
  // Clean up any leftover user from a prior run.
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users?.find(u => u.email === email);
  if (found) await admin.auth.admin.deleteUser(found.id);

  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw new Error(`signIn(${email}) failed: ${signInErr.message}`);

  return { id: data.user.id, client };
}

async function main() {
  console.log('=== IDENTITY LAYER VERTICAL SLICE — REAL SUPABASE VERIFICATION ===\n');

  // Need two real story_clusters.id values from Stream A's actual data.
  const { data: clusters, error: clustersErr } = await admin
    .from('story_clusters').select('id').limit(2);
  if (clustersErr || !clusters || clusters.length < 2) {
    console.error('Could not fetch story_clusters — run db/ingest-production.js first.', clustersErr);
    process.exit(1);
  }
  const [storyA, storyB] = clusters.map(c => c.id);
  console.log(`Using real story_clusters: A=${storyA}, B=${storyB}\n`);

  console.log('--- 1. Supabase Auth: creating two real test identities ---');
  const userA = await makeUser('quick-identity-test-a@adjung.test');
  const userB = await makeUser('quick-identity-test-b@adjung.test');
  check('User A created + signed in', !!userA.id);
  check('User B created + signed in', !!userB.id);

  console.log('\n--- 2. Save: A saves storyA ---');
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const { data: save1, error: save1Err } = await userA.client
    .from('saved_stories')
    .insert({ user_id: userA.id, story_id: storyA, expires_at: expiresAt })
    .select();
  check('A can INSERT own saved_stories row', !save1Err && save1?.length === 1, save1Err?.message);

  console.log('\n--- 3. Save dedup + refresh: A saves storyA again ---');
  const expiresAt2 = new Date(Date.now() + 45 * 24 * 3600 * 1000).toISOString();
  const { data: save2, error: save2Err } = await userA.client
    .from('saved_stories')
    .upsert({ user_id: userA.id, story_id: storyA, expires_at: expiresAt2 }, { onConflict: 'user_id,story_id' })
    .select();
  check('Re-save same story = upsert, no error', !save2Err, save2Err?.message);
  const { data: savedRows } = await userA.client.from('saved_stories').select('*').eq('user_id', userA.id).eq('story_id', storyA);
  check('Exactly one row after re-save (no duplicate)', savedRows?.length === 1, `rows=${savedRows?.length}`);
  check('expires_at refreshed on re-save',
    new Date(savedRows?.[0]?.expires_at).getTime() === new Date(expiresAt2).getTime(),
    `stored=${savedRows?.[0]?.expires_at} expected=${expiresAt2}`);

  console.log('\n--- 4. RLS isolation: A cannot read/write B\'s rows ---');
  const { data: bSave } = await userB.client
    .from('saved_stories').insert({ user_id: userB.id, story_id: storyB, expires_at: expiresAt }).select();
  check('B can INSERT own saved_stories row', bSave?.length === 1);

  const { data: aReadsB } = await userA.client.from('saved_stories').select('*').eq('user_id', userB.id);
  check('A reading B\'s saved_stories returns 0 rows (RLS)', (aReadsB?.length ?? 0) === 0, `got ${aReadsB?.length}`);

  const { error: aWriteBErr } = await userA.client
    .from('saved_stories').insert({ user_id: userB.id, story_id: storyA, expires_at: expiresAt });
  check('A inserting a row AS B is rejected by RLS', !!aWriteBErr, aWriteBErr?.message ?? 'NO ERROR — RLS FAILED');

  const { data: aOwnRows } = await userA.client.from('saved_stories').select('*').eq('user_id', userA.id);
  check('A can still read own rows', (aOwnRows?.length ?? 0) >= 1);

  console.log('\n--- 5. History: append-only, not upsert ---');
  const histExpires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const { data: hist1 } = await userA.client
    .from('history_entries').insert({ user_id: userA.id, story_id: storyA, expires_at: histExpires }).select();
  check('A can INSERT history_entries row (release 1)', hist1?.length === 1);

  const { data: hist2 } = await userA.client
    .from('history_entries').insert({ user_id: userA.id, story_id: storyA, expires_at: histExpires }).select();
  check('Second release of same story = second row (append-only)', hist2?.length === 1);

  const { data: histRows } = await userA.client.from('history_entries').select('*').eq('user_id', userA.id).eq('story_id', storyA);
  check('Two distinct history_entries rows exist for same (user, story)', histRows?.length === 2, `rows=${histRows?.length}`);

  console.log('\n--- 6. History isolation: B cannot read A\'s history ---');
  const { data: bReadsAHistory } = await userB.client.from('history_entries').select('*').eq('user_id', userA.id);
  check('B reading A\'s history_entries returns 0 rows (RLS)', (bReadsAHistory?.length ?? 0) === 0);

  console.log('\n--- 7. P-006 regression: Save/History must not alter Stream A engine state ---');
  const { data: clusterBefore } = await admin.from('story_clusters').select('*').eq('id', storyA).single();
  // Re-run save + history actions again to double-check no side effect on story_clusters.
  await userA.client.from('saved_stories').upsert({ user_id: userA.id, story_id: storyA, expires_at: expiresAt2 }, { onConflict: 'user_id,story_id' });
  await userA.client.from('history_entries').insert({ user_id: userA.id, story_id: storyA, expires_at: histExpires });
  const { data: clusterAfter } = await admin.from('story_clusters').select('*').eq('id', storyA).single();
  check('editorial_score unchanged after Save/History', clusterBefore.editorial_score === clusterAfter.editorial_score,
    `before=${clusterBefore.editorial_score} after=${clusterAfter.editorial_score}`);
  check('workspace_state unchanged after Save/History', clusterBefore.workspace_state === clusterAfter.workspace_state);
  check('freshness/cross_source/prominence unchanged', clusterBefore.freshness_score === clusterAfter.freshness_score &&
    clusterBefore.cross_source_score === clusterAfter.cross_source_score &&
    clusterBefore.prominence_score === clusterAfter.prominence_score);

  console.log('\n--- Cleanup: remove test users (and their rows via ON DELETE CASCADE) ---');
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
  const { data: leftoverA } = await admin.from('saved_stories').select('*').eq('user_id', userA.id);
  check('CASCADE deleted A\'s saved_stories on user delete', (leftoverA?.length ?? 0) === 0);

  console.log('\n=== SUMMARY ===');
  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log(`${r.pass ? '✓' : '✗'} ${r.label}`));
  console.log(`\n${failed.length === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failed.length} CHECK(S) FAILED`}`);
  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Identity slice verification failed:', err);
  process.exit(1);
});
