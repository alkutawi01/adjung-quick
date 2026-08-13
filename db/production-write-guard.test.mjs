// production-write-guard.test.mjs — verifies the exact 3 scenarios
// docs/production-write-guard-v1.md requires: staging write allowed;
// production write blocked without confirmation; production write
// allowed with explicit confirmation. Plus the fail-closed default.
//
// Run: node db/production-write-guard.test.mjs

import { assertWriteAllowed } from './production-write-guard.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function doesNotThrow(fn) {
  try { fn(); return true; } catch { return false; }
}
function throwsWithMessage(fn, substring) {
  try { fn(); return false; }
  catch (e) { return e.message.includes(substring); }
}

console.log('\nPRODUCTION WRITE GUARD — test\n');

assert('Staging write is allowed',
  doesNotThrow(() => assertWriteAllowed({ DATABASE_ENV: 'staging' })));

assert('Development write is allowed',
  doesNotThrow(() => assertWriteAllowed({ DATABASE_ENV: 'development' })));

assert('Production write is BLOCKED without confirmation',
  throwsWithMessage(() => assertWriteAllowed({ DATABASE_ENV: 'production' }), 'CONFIRM_PRODUCTION_WRITE'));

assert('Production write is BLOCKED with confirmation set to something other than the literal string "true"',
  throwsWithMessage(() => assertWriteAllowed({ DATABASE_ENV: 'production', CONFIRM_PRODUCTION_WRITE: 'yes' }), 'CONFIRM_PRODUCTION_WRITE'));

assert('Production write is ALLOWED with explicit confirmation',
  doesNotThrow(() => assertWriteAllowed({ DATABASE_ENV: 'production', CONFIRM_PRODUCTION_WRITE: 'true' })));

assert('Unset DATABASE_ENV FAILS CLOSED (not treated as safe)',
  throwsWithMessage(() => assertWriteAllowed({}), 'DATABASE_ENV'));

assert('Unrecognized DATABASE_ENV value FAILS CLOSED',
  throwsWithMessage(() => assertWriteAllowed({ DATABASE_ENV: 'oops' }), 'DATABASE_ENV'));

assert('CONFIRM_PRODUCTION_WRITE alone, without DATABASE_ENV=production, does NOT bypass the guard',
  throwsWithMessage(() => assertWriteAllowed({ CONFIRM_PRODUCTION_WRITE: 'true' }), 'DATABASE_ENV'));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
