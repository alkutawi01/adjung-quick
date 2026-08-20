// run-all-tests.mjs — the `npm test` entrypoint.
//
// BUG THIS REPLACES: package.json's `test` script used to be a plain
// `node a.test.mjs && node b.test.mjs && ...` chain. `&&` short-circuits
// on the first non-zero exit code, so the moment ANY file in the middle
// of that list had a failing assertion, every file listed AFTER it
// silently never ran at all -- `npm test`'s final line still looked like
// a normal single-file summary ("33 passed, 2 failed"), giving no hint
// that most of the suite hadn't executed. Discovered 2026-08-20 (Polish
// 8D-C, Adjung Quick): db/editor-auth.test.mjs has had 2 pre-existing,
// unrelated failures for a while, which meant the 13 test files listed
// after it in package.json -- including copyLint.test.mjs and (at the
// time) the brand-new boostV1Cleanup.test.mjs -- had never actually run
// via `npm test`, even though every commit's verification notes claimed
// otherwise (each file had only ever been checked by running it directly
// with `node <file>`, one at a time).
//
// This script runs every file to completion regardless of earlier
// failures, prints each file's own output live (same as before -- PASS/
// FAIL lines are unchanged), then prints one final pass/fail summary
// across the WHOLE list, and exits 1 if any file failed. A CI/local run
// now always tells you the true state of every test file, not just the
// ones before the first failure.
//
// Add new test files to TEST_FILES below (same list package.json's old
// `test` script had, same order) -- do not add a new `&& node ...` chain
// link to package.json again.

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TEST_FILES = [
  'lab/test.js',
  'state/test.js',
  'ranking/editorial-composition.test.mjs',
  'ranking/shadow-runner.test.mjs',
  'classification/content-rules.test.mjs',
  'db/production-write-guard.test.mjs',
  'db/daily-observation.test.mjs',
  'db/edition-representation-eligibility.test.mjs',
  'db/production-classification-acceptance.test.mjs',
  'state/editorialStateResolver.test.mjs',
  'state/editorialFilterResolver.test.mjs',
  'db/editor-auth.test.mjs',
  'db/editorial-override-reader-integration.test.mjs',
  'ranking/boost-scoring.test.mjs',
  'ranking/candidate-scoring.test.mjs',
  'ui/src/admin/pemilihanSusunanParity.test.mjs',
  'ui/src/admin/nilaiSusunanPanel.test.mjs',
  'state/pin.test.mjs',
  'ui/src/admin/editorialAttentionAdapter.test.mjs',
  'classification/classification-rules-resolver.test.mjs',
  'db/classify-production-wiring.test.mjs',
  'db/classification-rules-static-audit.test.mjs',
  'db/edition-rules-static-audit.test.mjs',
  'classification/edition-rules-resolver.test.mjs',
  'ui/src/admin/copyLint.test.mjs',
  'db/carry-forward-personal-state.test.mjs',
  'ui/src/admin/boostV1Cleanup.test.mjs',
  'ui/src/admin/unpinWiring.test.mjs',
  'ui/src/admin/penempatanBerita.test.mjs',
  'db/polish-8-acceptance.test.mjs',
  'db/classification-atomic-replace-static-audit.test.mjs',
  'db/classify-production-p0b.test.mjs',
  'ui/src/admin/classificationBacklog.test.mjs',
  'db/ingest-classify-hook-static-audit.test.mjs',
  'db/pagination-order-static-audit.test.mjs',
];
// NOTE: db/daily-observation.mjs and db/snapshot-production.mjs are
// standalone CLI scripts (real Supabase client at module load, network
// I/O in main()) with no dedicated functional test file of their own,
// same posture as ingest-production.js — their selectAllChunked() .order()
// wiring is covered by the static audit above (db/pagination-order-
// static-audit.test.mjs), not by importing/running these files directly.

const results = [];
for (const file of TEST_FILES) {
  console.log(`\n\x1b[2m▶ ${file}\x1b[0m`);
  const { status } = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: 'inherit' });
  // A file that crashes outright (syntax error, uncaught throw) reports
  // `status: null` from spawnSync, not a number -- treated as a failure,
  // same as a normal non-zero exit.
  results.push({ file, passed: status === 0 });
}

const failed = results.filter(r => !r.passed);

console.log('\n' + '='.repeat(60));
// "fail ujian", not bare "fail" — in Malay a bare "fail" next to a count
// reads as English "failure", exactly backwards from what it means here
// (it's the Malay word for "file"). Director's note, 2026-08-20.
console.log(`TEST SUMMARY — ${results.length} fail ujian dijalankan, ${results.length - failed.length} lulus, ${failed.length} gagal`);
console.log('='.repeat(60));
if (failed.length > 0) {
  console.log('\nFail ujian yang GAGAL (semak output di atas untuk butiran):');
  for (const r of failed) console.log(`  ✗ ${r.file}`);
}
console.log('');

process.exit(failed.length > 0 ? 1 : 0);
