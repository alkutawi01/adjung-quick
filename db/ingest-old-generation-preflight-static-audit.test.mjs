// ingest-old-generation-preflight-static-audit.test.mjs — 9D-4.
//
// Static audit of the *_old preflight check added to ingest-production.js
// (docs/global-edition-decision-v1.md, "_old operational review",
// 2026-08-21). Not a live run (same reasoning
// db/ingest-classify-hook-static-audit.test.mjs gives for its own
// approach — RSS fetch + real staging tables are too heavy to fake
// meaningfully here) — instead proves, by parsing the real source, that
// the check runs where ChatGPT specified (before ANY fetch/write, --write
// only, reusing the existing RPC, no auto-drop) rather than trusting a
// comment describing intent.
//
// CRLF is normalised before any ordering/proximity check, same reason
// ingest-classify-hook-static-audit.test.mjs normalises first: a `.` in a
// JS regex does not match `\r`, and this repo's real checkout is CRLF.

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n*_OLD PREFLIGHT CHECK — static audit (9D-4)\n');

const raw = readFileSync('db/ingest-production.js', 'utf8').replace(/\r\n/g, '\n');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// --- Reuses the SAME RPC the Admin Ringkasan indicator (9D-2) already
// reads -- one source of truth, no new query invented. ---
check("calls the existing check_old_generation_exists() RPC (not a new query)",
  /supabase\.rpc\(\s*['"]check_old_generation_exists['"]\s*\)/.test(code));

// --- Ordering: the preflight check must run before assertWriteAllowed()'s
// caller reaches ANY fetch or cleanup-delete call, not just "somewhere
// early". Located by real statement text, not proximity to a comment. ---
{
  const assertIdx = code.indexOf('assertWriteAllowed();');
  const preflightIdx = code.indexOf("supabase.rpc('check_old_generation_exists')");
  const savedDeleteIdx = code.indexOf("supabase.from('saved_stories').delete()");
  const fetchIdx = code.indexOf('sources.map(fetchFeed)');

  check('assertWriteAllowed() call is present', assertIdx !== -1);
  check('the *_old preflight check is present', preflightIdx !== -1);
  check('preflight runs AFTER assertWriteAllowed() (env guard still first)',
    assertIdx !== -1 && preflightIdx !== -1 && assertIdx < preflightIdx);
  check('preflight runs BEFORE the saved_stories/history_entries cleanup delete (no writes before the check)',
    preflightIdx !== -1 && savedDeleteIdx !== -1 && preflightIdx < savedDeleteIdx);
  check('preflight runs BEFORE any RSS fetch (fetchFeed call site)',
    preflightIdx !== -1 && fetchIdx !== -1 && preflightIdx < fetchIdx);
}

// --- --write only: the check must be gated behind `if (!DRY_RUN)`, and a
// --dry-run invocation must never reach it (dry-run stays usable for
// staging preview even with a stale *_old present, per ChatGPT's explicit
// instruction not to change dry-run behavior). ---
{
  const preflightIdx = code.indexOf("supabase.rpc('check_old_generation_exists')");
  // Walk backward from the preflight call to the nearest enclosing
  // `if (!DRY_RUN) {` — proves the gate, not just presence nearby.
  const guardIdx = code.lastIndexOf('if (!DRY_RUN) {', preflightIdx);
  check('the preflight check is gated behind if (!DRY_RUN) (write mode only)',
    guardIdx !== -1 && preflightIdx !== -1 && guardIdx < preflightIdx && (preflightIdx - guardIdx) < 400);
}

// --- No auto-drop: the failure branch must instruct the operator to run
// the drop script themselves, never call it or perform the drop inline.
// This is a deliberate design decision (per ChatGPT's explicit call) --
// *_old is a human decision to clear, not something this script may do
// silently on the operator's behalf. ---
{
  const preflightIdx = code.indexOf("supabase.rpc('check_old_generation_exists')");
  // The oldExists failure branch, not the oldErr (RPC-call-itself-failed)
  // branch that comes first -- anchor on the console.error message text.
  const oldExistsMsgIdx = code.indexOf('ABORT: generasi', preflightIdx);
  const nextExitIdx = code.indexOf('process.exit(1);', oldExistsMsgIdx);
  const failBlock = code.slice(oldExistsMsgIdx, nextExitIdx + 'process.exit(1);'.length);

  check('the failure message names the drop script for the operator to run',
    /drop-ingestion-old-tables\.mjs/.test(failBlock));
  check('the failure branch exits non-zero (fails closed, does not continue)',
    /process\.exit\(1\)/.test(failBlock));
  check('the failure branch does NOT itself call drop_ingestion_old_tables or similar (no auto-drop)',
    !/drop_ingestion_old_tables\s*\(/.test(failBlock) && !/\.rpc\(\s*['"]drop_ingestion_old_tables['"]/.test(failBlock));
  check('the failure message states no RSS/staging work happened (explains WHY failing fast matters)',
    /tiada rss diambil/i.test(failBlock) || /tiada staging/i.test(failBlock));
}

// --- --dry-run itself must remain completely unaffected: the early
// "DRY RUN — stopping before swap" message and the preflight RPC call
// must never both execute on the same run (proven by the DRY_RUN gate
// above), and dry-run's own early-return path must still exist unchanged. ---
check('the dry-run "stage and validate, NEVER swap" message is still present unchanged',
  /DRY RUN — will stage and validate, NEVER swap\./.test(code));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
