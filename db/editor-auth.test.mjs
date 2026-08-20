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
  // Round 7/15 -> 8/15 moved the actual write-action handlers (Hide/
  // Reclassify/Pin/formerly-Boost) out of AdminApp.jsx and into
  // AllStoriesPanel.jsx -- ReviewQueueCard.jsx (which used to hold them
  // directly inside AdminApp.jsx's own render) is now orphaned, unmounted.
  // The old regex checked AdminApp.jsx's own source text for the call
  // pattern and had gone stale (0 matches, silently -- caught 2026-08-20
  // during Polish 8D-C's npm test audit) once that move happened. The
  // real current wiring is a two-hop trace: AdminApp's ReviewQueue
  // wrapper forwards role/userId as PROPS to AllStoriesPanel, which is
  // where the write calls themselves live.
  assert('AdminApp\'s ReviewQueue wrapper forwards `role`/`userId` as props into both AllStoriesPanel mounts (Perlu Semakan + Semua Berita)',
    (app.match(/<AllStoriesPanel[^>]*\brole=\{role\}[^>]*\buserId=\{userId\}/g) || []).length >= 2
    || (app.match(/<AllStoriesPanel[^>]*\buserId=\{userId\}[^>]*\brole=\{role\}/g) || []).length >= 2);
}
{
  const panel = readFileSync(new URL('../ui/src/admin/AllStoriesPanel.jsx', import.meta.url), 'utf8');
  // The 3 write actions AllStoriesPanel's StoryDrawer still offers since
  // Polish 8D-C removed Boost (Hide/Reclassify/Pin) must each forward
  // `role` alongside `createdBy: userId` to the adapter -- this is the
  // actual current location of what the retired AdminApp-level assertion
  // above used to check.
  assert('every action handler in the real mounted UI (AllStoriesPanel) forwards `role` to the adapter',
    (panel.match(/createdBy:\s*userId,\s*role\s*\}/g) || []).length >= 3);
}

// --- FASA 3.6.5 Pin wiring (2026-08-13) ---
// Same discipline as the block above, applied to Pin specifically: assert
// the guards ChatGPT's instruction required actually exist in the code
// that runs, not just that a function named submitPinOverride exists.
{
  const src = readFileSync(new URL('../ui/src/admin/reviewQueueAdapter.js', import.meta.url), 'utf8');
  assert('submitPinOverride is exported',
    /export\s+async\s+function\s+submitPinOverride/.test(src));
  // Was a fixed {0,3000}-char window from the function's start to
  // `writeOverride(supabase` -- brittle by construction (any comment
  // growth inside the function pushes the real call further away in
  // source text without changing what it does). It broke silently at
  // 3061 chars on 2026-08-20 after this session's own 8D-A comment fix
  // (correcting a stale "no UI offers pin" note) pushed it 61 chars past
  // the cap. Replaced with the function's real boundaries (its own
  // `export async function` line to the next top-level `export`), so
  // growing a comment inside the function can never break this again --
  // the semantic check (submitPinOverride really does end by calling the
  // shared admin-only+expiry writeOverride(), not a parallel write path)
  // is unchanged.
  const pinFnStart = src.indexOf('export async function submitPinOverride');
  const nextExportStart = src.indexOf('\nexport ', pinFnStart + 1);
  const pinFnBody = src.slice(pinFnStart, nextExportStart === -1 ? src.length : nextExportStart);
  assert('submitPinOverride reuses writeOverride (admin-only + expiry) rather than a parallel write path',
    pinFnStart !== -1 && /writeOverride\(supabase/.test(pinFnBody));
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
