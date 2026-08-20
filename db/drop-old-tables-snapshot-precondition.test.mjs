// drop-old-tables-snapshot-precondition.test.mjs — Polish 9D-1
// (docs/polish-9-audit-v1.md, risk #1).
//
// Tests the pure checkSnapshotFreshness() function exported from
// drop-ingestion-old-tables.mjs against REAL temporary snapshot files
// (not mocked fs) -- cheap, real I/O, no reason to fake it. Importing the
// module is safe without a live Supabase call: createClient() only reads
// env vars at construction, never opens a connection, matching the same
// posture db/classify-production-p0b.test.mjs already relies on for
// classify-production.js.
//
// Run: node db/drop-old-tables-snapshot-precondition.test.mjs

import { checkSnapshotFreshness, SNAPSHOT_MAX_AGE_MINUTES } from './drop-ingestion-old-tables.mjs';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nDROP-OLD-TABLES — snapshot freshness precondition (Polish 9D-1)\n');

const tmpDir = mkdtempSync(join(tmpdir(), 'adjung-quick-snapshot-test-'));
const NOW = 1755600000000; // fixed reference instant, per this project's "no Date.now() in deterministic tests" posture

function writeSnapshotFixture(name, contents) {
  const path = join(tmpDir, name);
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}

// --- Missing file: ABORT, not a crash. ---
{
  const path = join(tmpDir, 'does-not-exist.json');
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('missing snapshot file -> not ok', result.ok === false);
  assert('missing snapshot file -> reason names the real cause (no file), not a generic error', /tiada fail snapshot/.test(result.reason));
}

// --- Corrupted/unparseable file: fail closed, not throw. ---
{
  const path = writeSnapshotFixture('corrupt.json', 'this is not valid json {{{');
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('corrupt snapshot file -> not ok (caught, not thrown)', result.ok === false);
  assert('corrupt snapshot file -> reason mentions it could not be read', /rosak|tidak boleh dibaca/.test(result.reason));
}

// --- Valid file but missing/invalid snapshotDate field. ---
{
  const path = writeSnapshotFixture('no-date.json', { counts: { sources: 1 } });
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('snapshot with no snapshotDate field -> not ok', result.ok === false);
  assert('snapshot with no snapshotDate field -> reason says the date is missing/invalid', /snapshotDate/.test(result.reason));
}

// --- Fresh snapshot (5 minutes old, well within the 60-minute default) -> ok. ---
{
  const fiveMinutesAgo = new Date(NOW - 5 * 60000).toISOString();
  const path = writeSnapshotFixture('fresh.json', { snapshotDate: fiveMinutesAgo, counts: { sources: 43 } });
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('a 5-minute-old snapshot is ok', result.ok === true);
  assert('age is reported correctly (~5 minutes)', Math.abs(result.ageMinutes - 5) < 0.01);
}

// --- Exactly at the boundary (60 minutes) -> still ok (not stricter than stated). ---
{
  const exactlyAtLimit = new Date(NOW - SNAPSHOT_MAX_AGE_MINUTES * 60000).toISOString();
  const path = writeSnapshotFixture('boundary.json', { snapshotDate: exactlyAtLimit });
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('a snapshot exactly at the max-age boundary is still ok (not stricter than the stated limit)', result.ok === true);
}

// --- Adversarial review found a mutation none of the whole-minute-only
// fixtures above would catch: wrapping the comparison in Math.floor()
// (floor(ageMinutes) > max instead of ageMinutes > max) silently widens
// the window by up to just-under-a-minute, since every prior fixture
// used exact whole-minute ages. A snapshot 1 second past the boundary
// must still be refused. ---
{
  const oneSecondPastLimit = new Date(NOW - (SNAPSHOT_MAX_AGE_MINUTES * 60000 + 1000)).toISOString();
  const path = writeSnapshotFixture('just-past-boundary.json', { snapshotDate: oneSecondPastLimit });
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('a snapshot 1 second past the boundary is refused, not rounded down to still-fresh', result.ok === false);
}

// --- Stale snapshot (well past the limit) -> ABORT, real snapshot data present is
// NOT enough on its own if it's too old to trust for a destructive op happening now. ---
{
  const twoHoursAgo = new Date(NOW - 120 * 60000).toISOString();
  const path = writeSnapshotFixture('stale.json', { snapshotDate: twoHoursAgo, counts: { sources: 43, storyClusters: 690 } });
  const result = checkSnapshotFreshness(path, SNAPSHOT_MAX_AGE_MINUTES, NOW);
  assert('a 2-hour-old snapshot (past the 60-minute default) is refused', result.ok === false);
  assert('stale-snapshot refusal names both the actual age and the limit, so an operator can judge it', /120 minit/.test(result.reason) && /60 minit/.test(result.reason));
}

// --- A custom, caller-supplied maxAgeMinutes is honored, not hardcoded. ---
{
  const tenMinutesAgo = new Date(NOW - 10 * 60000).toISOString();
  const path = writeSnapshotFixture('custom-limit.json', { snapshotDate: tenMinutesAgo });
  const strict = checkSnapshotFreshness(path, 5, NOW); // 10 min old, 5 min limit
  const lenient = checkSnapshotFreshness(path, 15, NOW); // 10 min old, 15 min limit
  assert('a stricter caller-supplied limit correctly rejects the same snapshot', strict.ok === false);
  assert('a more lenient caller-supplied limit correctly accepts the same snapshot', lenient.ok === true);
}

rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
