// editor-auth.test.mjs — Fasa 3.6.1 Foundation tests. Pure logic only
// (isEditor/isAdmin/canPerformAction) — getEditorRole needs a real
// Supabase client and is exercised live separately, not unit-tested
// here with a mock (per this project's own established preference for
// verifying against real data over mocked plumbing).
//
// Run: node db/editor-auth.test.mjs

import { isEditor, isAdmin, canPerformAction } from './editor-auth.mjs';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITOR AUTH — role/permission logic test\n');

assert('isEditor("editor") -> true', isEditor('editor') === true);
assert('isEditor("admin") -> true', isEditor('admin') === true);
assert('isEditor(null) -> false (a reader)', isEditor(null) === false);
assert('isEditor("something-else") -> false (defensive)', isEditor('something-else') === false);

assert('isAdmin("admin") -> true', isAdmin('admin') === true);
assert('isAdmin("editor") -> false', isAdmin('editor') === false);
assert('isAdmin(null) -> false', isAdmin(null) === false);

// Per docs/editorial-action-spec-v1.md's Principle of Escalation:
// single-story-impact actions = editor; system-wide-impact = admin.
for (const action of ['hide', 'reclassify', 'boost']) {
  assert(`editor CAN perform "${action}" (single-story impact)`, canPerformAction('editor', action) === true);
  assert(`admin CAN perform "${action}" too`, canPerformAction('admin', action) === true);
}
for (const action of ['pin', 'ignore_category', 'reduce_trust', 'disable']) {
  assert(`editor CANNOT perform "${action}" (system-wide impact, admin only)`, canPerformAction('editor', action) === false);
  assert(`admin CAN perform "${action}"`, canPerformAction('admin', action) === true);
}
assert('a reader (null role) cannot perform any action', canPerformAction(null, 'hide') === false);

// --- WIRING TESTS (2026-08-13, docs/editorial-adversarial-audit-v1.md finding 1) ---
//
// The tests above all passed while canPerformAction() had ZERO production
// callers. They proved the function was correct and said nothing about whether
// anything used it — the exact blind spot behind three bugs this phase
// ("succeeded visually, did nothing real").
//
// These tests assert the CONNECTION, not the logic. A future refactor that
// removes the guard from writeOverride() now fails here instead of silently
// reopening the hole.
{
  const src = readFileSync(new URL('../ui/src/admin/reviewQueueAdapter.js', import.meta.url), 'utf8');
  assert('reviewQueueAdapter imports canPerformAction',
    /import\s*\{[^}]*canPerformAction[^}]*\}\s*from\s*['"].*editor-auth\.mjs['"]/.test(src));
  assert('writeOverride() actually CALLS canPerformAction (the guard is wired, not just imported)',
    /canPerformAction\s*\(/.test(src));
  assert('writeOverride() throws when the check fails, rather than continuing',
    /if\s*\(\s*!\s*canPerformAction\s*\([^)]*\)\s*\)\s*\{[\s\S]{0,300}?throw/.test(src));
  assert('every submit*Override wrapper forwards `role` to writeOverride',
    (src.match(/writeOverride\(supabase,\s*\{[^}]*\brole\b/g) || []).length >= 3);
}
{
  const app = readFileSync(new URL('../ui/src/admin/AdminApp.jsx', import.meta.url), 'utf8');
  assert('AdminApp passes `role` into ReviewQueue (it previously stopped at the top level)',
    /<ReviewQueue[^>]*\brole=\{role\}/.test(app));
  assert('ReviewQueue accepts `role` as a prop',
    /function ReviewQueue\(\s*\{[^}]*\brole\b/.test(app));
  assert('both action handlers forward `role` to the adapter',
    (app.match(/createdBy:\s*userId,\s*role\s*\}/g) || []).length >= 2);
}

// --- FASA 3.6.5 Pin wiring (2026-08-13) ---
// Same discipline as the block above, applied to Pin specifically: assert
// the guards ChatGPT's instruction required actually exist in the code
// that runs, not just that a function named submitPinOverride exists.
{
  const src = readFileSync(new URL('../ui/src/admin/reviewQueueAdapter.js', import.meta.url), 'utf8');
  assert('submitPinOverride is exported',
    /export\s+async\s+function\s+submitPinOverride/.test(src));
  assert('submitPinOverride reuses writeOverride (admin-only + expiry) rather than a parallel write path',
    /export async function submitPinOverride[\s\S]{0,3000}?writeOverride\(supabase/.test(src));
  assert('submitPinOverride reuses new_field, no separate pin-only field parameter/column referenced',
    !/story_overrides\.select\([^)]*\bfield\b[^)]*\)/.test(src)); // no query ever selects a `field` column that doesn't exist
  assert('submitPinOverride checks for an active hide before writing (ChatGPT: never offer hide+pin together)',
    /export async function submitPinOverride[\s\S]{0,2000}?override_type',\s*'hide'/.test(src));
  assert('submitPinOverride enforces the 2-pin-per-field limit',
    /activePins\.length >= 2/.test(src));
  assert('the pin limit is refused with a readable error, not silently capped',
    /Sudah ada.*pin aktif/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
