// editor-auth.test.mjs — Fasa 3.6.1 Foundation tests. Pure logic only
// (isEditor/isAdmin/canPerformAction) — getEditorRole needs a real
// Supabase client and is exercised live separately, not unit-tested
// here with a mock (per this project's own established preference for
// verifying against real data over mocked plumbing).
//
// Run: node db/editor-auth.test.mjs

import { isEditor, isAdmin, canPerformAction } from './editor-auth.mjs';

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

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
