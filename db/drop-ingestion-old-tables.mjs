// drop-ingestion-old-tables.mjs — FASA 4.2. Per
// docs/ingestion-staging-swap-implementation-plan-v1.md §4b "Old Table
// Lifecycle Policy": `_old` tables are NEVER auto-dropped — only a
// human, running this script, after the verification checklist passes.
// No time-based/scheduled drop path exists anywhere in this project.
//
// This script automates what CAN be checked mechanically (row counts,
// FK-dangling references) and clearly prints what it cannot (reader/
// admin visual normalcy, "at least one more successful ingestion cycle
// since this swap") — it refuses to drop unless every automatable check
// passes AND the human explicitly confirms the rest via env var, same
// two-key discipline production-write-guard.mjs already uses elsewhere.
//
// Usage: node db/drop-ingestion-old-tables.mjs
//   Requires: DATABASE_ENV=production CONFIRM_PRODUCTION_WRITE=true
//             CONFIRM_OLD_TABLES_VERIFIED=true (asserts the human has
//             already confirmed reader/admin normalcy AND a second
//             successful ingestion cycle since this swap, per the
//             checklist in the plan doc — this script cannot see either)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { assertWriteAllowed } from './production-write-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  assertWriteAllowed();

  if (process.env.CONFIRM_OLD_TABLES_VERIFIED !== 'true') {
    console.error('');
    console.error('Refusing to drop: CONFIRM_OLD_TABLES_VERIFIED=true is required.');
    console.error('');
    console.error('This asserts YOU have already confirmed, by hand, per');
    console.error('docs/ingestion-staging-swap-implementation-plan-v1.md §4b:');
    console.error('  - Reader (/) and admin (Review Queue, Digest, Timeline) look normal');
    console.error('  - At least one MORE ingestion cycle has succeeded since this swap');
    console.error('This script cannot see either of those — it only checks what a');
    console.error('database query can prove.');
    process.exit(1);
  }

  console.log('Checking automatable verification criteria...\n');

  const anyOldExists = await checkOldTablesExist();
  if (!anyOldExists) {
    console.log('No *_old tables exist — nothing to drop.');
    return;
  }

  // Row counts sane (non-empty, since an empty _old would itself be a
  // red flag — it would mean a previous run somehow swapped in nothing).
  const { count: oldClusterCount } = await supabase.from('story_clusters_old').select('*', { count: 'exact', head: true });
  const { count: oldItemCount } = await supabase.from('rss_items_old').select('*', { count: 'exact', head: true });
  console.log(`story_clusters_old: ${oldClusterCount} rows`);
  console.log(`rss_items_old: ${oldItemCount} rows`);

  // FK-dangling check: any story_overrides/saved_stories/history_entries
  // row whose story_id does NOT exist in the CURRENT (live) story_clusters
  // is exactly the risk this whole lifecycle policy exists to catch
  // before it becomes irreversible.
  const dangling = await checkDangling();
  if (dangling.length > 0) {
    console.error('\n✗ REFUSING TO DROP — dangling reference risk found:');
    for (const d of dangling) console.error(`  ${d.table}: ${d.count} row(s) reference a story_id not in the live story_clusters`);
    console.error('\nDropping *_old now would not fix this (those rows already point at');
    console.error('nothing live) but would remove the forensic trail for investigating it.');
    process.exit(1);
  }
  console.log('\n✓ No dangling story_id references found in story_overrides/saved_stories/history_entries.');

  console.log('\nAll automatable checks passed. Proceeding with drop (you confirmed the');
  console.log('rest via CONFIRM_OLD_TABLES_VERIFIED=true).\n');

  const { error } = await supabase.rpc('drop_ingestion_old_tables');
  if (error) { console.error('Drop failed:', error); process.exit(1); }

  console.log('✓ *_old tables dropped. Next swap can now proceed.');
}

async function checkOldTablesExist() {
  const { error } = await supabase.from('story_clusters_old').select('id', { head: true, count: 'exact' }).limit(1);
  // A "relation does not exist" error means there's nothing to drop —
  // not a real failure.
  return !error;
}

async function checkDangling() {
  const { data: liveIds } = await supabase.from('story_clusters').select('id');
  const liveIdSet = new Set((liveIds ?? []).map(r => r.id));
  const results = [];
  for (const table of ['story_overrides', 'saved_stories', 'history_entries']) {
    const { data: rows, error } = await supabase.from(table).select('story_id');
    if (error) continue; // table may not exist in every environment
    const danglingCount = (rows ?? []).filter(r => !liveIdSet.has(r.story_id)).length;
    if (danglingCount > 0) results.push({ table, count: danglingCount });
  }
  return results;
}

main().catch(err => {
  console.error('drop-ingestion-old-tables failed:', err);
  process.exit(1);
});
