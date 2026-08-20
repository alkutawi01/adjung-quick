// unpinWiring.test.mjs — Polish 8D-A.1.
//
// WHY THIS EXISTS: the ability to REMOVE a pin was silently lost TWICE.
// ReviewQueueCard.jsx had an "Nyahaktifkan" button (onUnpin) and
// ValueRankingPanel.jsx had "Nyahaktifkan pin" — but Round 8/15 orphaned
// the first (AllStoriesPanel.jsx replaced it) and Polish 8C orphaned the
// second (NilaiSusunanPanel.jsx replaced it), and neither replacement
// carried the capability over. An editor could CREATE a pin but never
// remove it; it only cleared via the 24h server-side expiry
// (db/schema-fix-server-side-expiry.sql:46).
//
// The FIRST version of this test was regex-only, and an adversarial review
// proved it was theatre: one assertion passed against the pre-fix code
// (its /story\.pinned\s*&&/ matched the *existing* `!story.pinned &&` pin
// CREATE button), and two realistic mutations that fully broke the feature
// still left it green. So this version RENDERS StoryDrawer for real, via
// esbuild (already a vite dependency) + react-dom/server, and asserts on
// the produced markup. Both of those mutations now fail it.
//
// Run: node ui/src/admin/unpinWiring.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nUNPIN WIRING — the mounted admin UI can undo a pin (Polish 8D-A.1)\n');

const panelUrl = new URL('./AllStoriesPanel.jsx', import.meta.url);
const panelSrc = fs.readFileSync(panelUrl, 'utf8');
const adapterSrc = fs.readFileSync(new URL('./allStoriesAdapter.js', import.meta.url), 'utf8');
const reviewAdapterSrc = fs.readFileSync(new URL('./reviewQueueAdapter.js', import.meta.url), 'utf8');
const adminAppSrc = fs.readFileSync(new URL('./AdminApp.jsx', import.meta.url), 'utf8');

// --- Render the REAL component. esbuild (already a vite dependency) bundles
// the panel and its .jsx dependency graph — plain `node` cannot import .jsx
// at all — with react/react-dom left external so the test shares this
// process's React instance. Emitted beside the source so bare specifiers
// resolve from node_modules exactly as they do in the real build, then
// removed. ---
const tmpUrl = new URL('./.unpinWiring.compiled.tmp.mjs', import.meta.url);
let StoryDrawer;
try {
  await build({
    entryPoints: [fileURLToPath(panelUrl)],
    outfile: fileURLToPath(tmpUrl),
    bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/server', '@supabase/supabase-js'],
  });
  ({ StoryDrawer } = await import(tmpUrl.href));
} finally {
  fs.rmSync(tmpUrl, { force: true });
}

const baseStory = {
  storyId: 's1', title: 'Tajuk ujian', description: null, sourceName: 'Sumber',
  link: null, publishedAt: '2026-08-20T00:00:00Z', fieldLabel: 'Politik',
  status: 'Aktif', displayReason: null, classificationMethod: null, resolvedRule: null,
  hideOverrideId: null, pinOverrideId: null, pinned: false, filteredByPhrase: null,
};
const render = story => renderToStaticMarkup(
  React.createElement(StoryDrawer, {
    story, taxonomy: ['Politik', 'Dunia'], busy: false,
    onClose() {}, onHide() {}, onReclassify() {}, onPin() {}, onUnhide() {}, onUnpin() {},
    canUnpin: story.__canUnpin ?? true,
  }),
);

// A pinned story shows the undo control.
{
  const html = render({ ...baseStory, pinned: true, pinOverrideId: 'ov-1' });
  assert('pinned story renders the "Nyahaktifkan" undo control', /Nyahaktifkan/.test(html));
  assert('pinned story does NOT still offer "Kekalkan dalam pemilihan"', !/Kekalkan dalam pemilihan/.test(html));
  assert('pinned story tells the editor the pin expires by itself', /24 jam/.test(html));
}

// An unpinned story must not show it — otherwise the assertion above proves nothing.
{
  const html = render(baseStory);
  assert('unpinned story shows NO undo control', !/Nyahaktifkan/.test(html));
  assert('unpinned story DOES offer "Kekalkan dalam pemilihan"', /Kekalkan dalam pemilihan/.test(html));
}

// The bug an adversarial review caught: hide outranks pin in the resolver,
// so a pinned-then-hidden story reports pinned=false while its pin row is
// still active and still consuming one of the 2 per-category slots. If the
// undo lived only in the not-hidden branch, that pin would be invisible AND
// unremovable until expiry — the exact failure this change exists to remove.
{
  const html = render({ ...baseStory, status: 'Disembunyikan', hideOverrideId: 'h-1', pinned: false, pinOverrideId: 'ov-2' });
  assert('hidden-AND-pinned story STILL exposes the pin undo (not stranded until expiry)', /Nyahaktifkan/.test(html));
  assert('hidden-AND-pinned story also still offers "Nyahsembunyi"', /Nyahsembunyi/.test(html));
  assert('hidden-AND-pinned story explains the pin is still holding a slot', /had dua/.test(html));
}

// Pin is admin-only on the way in, so it is admin-only on the way out.
{
  const html = render({ ...baseStory, pinned: true, pinOverrideId: 'ov-3', __canUnpin: false });
  assert('non-admin sees NO unpin control (pin is admin-only both directions)', !/Nyahaktifkan/.test(html));
}

// --- Adapter + guard wiring. Not renderable here (fetchAllStories needs a
// live Supabase client), so these stay static — but they are specific. ---
{
  assert('allStoriesAdapter.js exposes pinOverrideId',
    /pinOverrideId\s*:/.test(adapterSrc));
  assert('pinOverrideId comes from the RAW override row, not from resolved.pinned (hide outranks pin)',
    /pinOverrideId\s*:\s*activePin\?\.id/.test(adapterSrc));
  assert('the override query selects created_at, so pickMostRecent() can actually sort',
    /\.select\('id, story_id, override_type, new_field_code, created_at'\)/.test(adapterSrc));
  assert('unpinOverride() exists and is role-gated at the adapter, not only in the UI',
    /export async function unpinOverride[\s\S]{0,400}?canPerformAction\(role,\s*'pin'\)/.test(reviewAdapterSrc));
  assert('AllStoriesPanel routes unpin through unpinOverride (not the ungated deactivateOverride)',
    /onUnpin=\{[^}]*unpinOverride\(/.test(panelSrc));
}

// The capability must live on the MOUNTED path — orphaned components
// carrying an unpin button is exactly the state that hid this bug twice.
{
  assert('AllStoriesPanel is actually mounted by AdminApp (this test is about the live surface)',
    /<AllStoriesPanel/.test(adminAppSrc));
  for (const orphan of ['ReviewQueueCard', 'ValueRankingPanel']) {
    assert(`${orphan} is still NOT rendered — if this flips, re-check which surface owns unpin`,
      !new RegExp(`<${orphan}`).test(adminAppSrc));
  }
}

// NOT COVERED, stated plainly rather than implied: fetchAllStories() itself
// is never executed here (it needs a live Supabase client), so the mapping
// from real override rows to pinOverrideId is asserted statically above, not
// exercised. Click behaviour is likewise not simulated — renderToStaticMarkup
// drops handlers — so "the button calls unpinOverride with the right id" is
// covered by the static check above, not by a real click.

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
