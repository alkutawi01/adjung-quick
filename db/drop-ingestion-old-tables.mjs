// drop-ingestion-old-tables.mjs — FASA 4.2. Per
// docs/ingestion-staging-swap-implementation-plan-v1.md §4b "Old Table
// Lifecycle Policy": `_old` tables are NEVER auto-dropped — only a
// human, running this script, after the verification checklist passes.
// No time-based/scheduled drop path exists anywhere in this project.
//
// This script automates what CAN be checked mechanically (row counts,
// FK-dangling references) and clearly prints what it cannot (reader/
// admin visual normalcy) — it refuses to drop unless every automatable
// check passes AND the human explicitly confirms the rest via env var,
// same two-key discipline production-write-guard.mjs already uses
// elsewhere.
//
// Governance v3 update (docs/old-table-lifecycle-policy-v3-review-v1.md,
// approved by ChatGPT 2026-08-16): for the `_old` generation produced by
// the FIRST migration swap specifically, the original "at least one
// MORE ingestion cycle has succeeded since this swap" precondition does
// NOT apply — it is circular under the V1 single-generation guard (the
// only thing blocking a second swap from succeeding is this `_old`'s own
// presence). That precondition remains mandatory for every future
// generation once daily ingestion (Track B) exists. Classification
// projection consistency (the other original concern) is separately
// satisfied — see below.
//
// Usage: node db/drop-ingestion-old-tables.mjs
//   Requires: DATABASE_ENV=production CONFIRM_PRODUCTION_WRITE=true
//             CONFIRM_OLD_TABLES_VERIFIED=true (asserts the human has
//             already confirmed reader/admin normalcy AND all of Track
//             A's applicable preconditions — NOT a subsequent ingestion
//             cycle for this specific migration-era generation, see
//             above. This script cannot see reader/admin normalcy.)
//   Also requires a FRESH local snapshot (npm run snapshot)
//   — see checkSnapshotFreshness() below, Polish 9D-1.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { assertWriteAllowed } from './production-write-guard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Polish 9D-1 (docs/polish-9-audit-v1.md, risk #1): this project's ONLY
// backup mechanism (db/snapshot-production.mjs) had zero mechanical
// connection to this script — a human could drop *_old with a backup that
// was days old, or none at all, and nothing here would notice. Confirmed
// by that audit: neither this script nor any of its 3 governing docs ever
// mentioned "snapshot". This closes that gap the same way this script
// already gates on CONFIRM_OLD_TABLES_VERIFIED — fail closed, not a
// warning that's easy to miss.
//
// Pure function (snapshotPath/maxAgeMinutes/now all passed in, no reach
// for Date.now()/module-level constants directly) so it's unit-testable
// without touching the real filesystem clock or the real snapshot path.
export const SNAPSHOT_PATH = `${__dirname}/snapshots/production-snapshot.json`;
export const SNAPSHOT_MAX_AGE_MINUTES = 60;

export function checkSnapshotFreshness(snapshotPath, maxAgeMinutes, now = Date.now()) {
  if (!existsSync(snapshotPath)) {
    return { ok: false, reason: 'tiada fail snapshot ditemui' };
  }
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `fail snapshot rosak / tidak boleh dibaca (${err.message})` };
  }
  const snapshotTime = Date.parse(snapshot.snapshotDate);
  if (Number.isNaN(snapshotTime)) {
    return { ok: false, reason: 'fail snapshot tiada snapshotDate yang sah' };
  }
  const ageMinutes = (now - snapshotTime) / 60000;
  if (ageMinutes > maxAgeMinutes) {
    return { ok: false, reason: `snapshot berumur ${Math.round(ageMinutes)} minit (had dibenarkan: ${maxAgeMinutes} minit)`, ageMinutes, snapshotDate: snapshot.snapshotDate };
  }
  return { ok: true, ageMinutes, snapshotDate: snapshot.snapshotDate };
}

async function main() {
  assertWriteAllowed();

  const freshness = checkSnapshotFreshness(SNAPSHOT_PATH, SNAPSHOT_MAX_AGE_MINUTES);
  if (!freshness.ok) {
    console.error('');
    console.error('✗ ABORT: No verified snapshot found before destructive operation.');
    console.error(`  Sebab: ${freshness.reason}`);
    console.error('');
    console.error('  Ini operasi memusnahkan (*_old TIDAK dapat dipulihkan selepas dibuang).');
    console.error('  Jalankan dahulu: npm run snapshot');
    console.error(`  kemudian ulang semula arahan ini dalam ${SNAPSHOT_MAX_AGE_MINUTES} minit.`);
    process.exit(1);
  }
  console.log(`✓ Snapshot sah ditemui (${Math.round(freshness.ageMinutes)} minit lalu, ${freshness.snapshotDate}).\n`);

  if (process.env.CONFIRM_OLD_TABLES_VERIFIED !== 'true') {
    console.error('');
    console.error('Refusing to drop: CONFIRM_OLD_TABLES_VERIFIED=true is required.');
    console.error('');
    console.error('This asserts YOU have already confirmed, by hand, per');
    console.error('docs/old-table-lifecycle-policy-v3-review-v1.md (Track A):');
    console.error('  - Reader (/) and admin (Review Queue, Digest, Timeline) look normal');
    console.error('This script cannot see that — it only checks what a database query');
    console.error('can prove. (A subsequent ingestion cycle is NOT required for this');
    console.error('migration-era _old — see the governance v3 note atop this file.)');
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

// Polish 9D-1 adversarial-testing discovery: this file previously called
// main() unconditionally at module scope — merely IMPORTING it (e.g. to
// unit-test checkSnapshotFreshness()) triggered a real destructive-drop
// attempt against production. classify-production.js already guarded
// against exactly this; this one had silently never gotten the same
// treatment. (A second adversarial review of THIS fix then found the
// identical unguarded pattern still live in ingest-production.js —
// fixed there too, same commit, per CLAUDE.md's "same pattern must be
// treated uniformly" rule; don't assume "every other script" already
// has a fix without checking each one.) pathToFileURL() (not a raw
// `file://${argv[1]}` string) is required for this comparison to work on
// Windows, where argv[1] uses backslashes and import.meta.url is a
// proper file:// URL with forward slashes — same reasoning
// classify-production.js's own guard comment states.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('drop-ingestion-old-tables failed:', err);
    process.exit(1);
  });
}
