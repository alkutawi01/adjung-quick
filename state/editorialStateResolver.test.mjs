// editorialStateResolver.test.mjs — Fasa 3.6.1 Foundation tests.
// Pure function tests, no database/network.
//
// Run: node state/editorialStateResolver.test.mjs

import { resolveStoryField, pickMostRecent } from './editorialStateResolver.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITORIAL STATE RESOLVER — precedence integration test\n');

const classified = { field: 'Politik', classification_status: 'classified' };
const unclassified = { field: null, classification_status: 'unclassified' };

// --- no overrides: classifier output passes through unchanged ---
{
  const r = resolveStoryField(classified, []);
  assert('no override -> classifier field/visibility used as-is',
    r.visible === true && r.field === 'Politik' && r.source === 'classifier');
}

{
  const r = resolveStoryField(unclassified, []);
  assert('unclassified + no override -> not visible, matches classification_status',
    r.visible === false && r.source === 'classifier');
}

// --- hide overrides everything, including a reclassify ---
{
  const overrides = [
    { id: 'o1', override_type: 'reclassify', new_field: 'Bencana', created_at: '2026-08-13T01:00:00Z' },
    { id: 'o2', override_type: 'hide', created_at: '2026-08-13T02:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('hide beats reclassify, even if reclassify is present too',
    r.visible === false && r.field === null && r.overrideId === 'o2');
}

// --- reclassify changes field, keeps story visible ---
{
  const overrides = [{ id: 'o3', override_type: 'reclassify', new_field: 'Bencana', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(classified, overrides);
  assert('reclassify -> visible, field replaced with new_field',
    r.visible === true && r.field === 'Bencana' && r.source === 'override' && r.overrideId === 'o3');
}

// --- reclassify can rescue an unclassified story ---
{
  const overrides = [{ id: 'o4', override_type: 'reclassify', new_field: 'Kesihatan', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(unclassified, overrides);
  assert('reclassify makes an unclassified story visible under the new field',
    r.visible === true && r.field === 'Kesihatan');
}

// --- boost/pin are not resolved here (out of this function's scope) ---
{
  const overrides = [{ id: 'o5', override_type: 'boost', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(classified, overrides);
  assert('boost override present but irrelevant to field/visibility -> classifier output used',
    r.visible === true && r.field === 'Politik' && r.source === 'classifier',
    'boost affects ranking, not field resolution — deliberately not handled here');
}

// --- conflict: two reclassify overrides for the same story, most recent wins ---
{
  const overrides = [
    { id: 'old', override_type: 'reclassify', new_field: 'Sains', created_at: '2026-08-10T00:00:00Z' },
    { id: 'new', override_type: 'reclassify', new_field: 'Teknologi', created_at: '2026-08-13T00:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('two conflicting reclassify overrides -> most recent created_at wins',
    r.field === 'Teknologi' && r.overrideId === 'new');
}

// --- pickMostRecent standalone behavior ---
{
  assert('pickMostRecent([]) returns null', pickMostRecent([]) === null);
  const picked = pickMostRecent([
    { id: 'a', created_at: '2026-08-01T00:00:00Z' },
    { id: 'b', created_at: '2026-08-13T00:00:00Z' },
    { id: 'c', created_at: '2026-08-05T00:00:00Z' },
  ]);
  assert('pickMostRecent picks the latest created_at among 3', picked.id === 'b');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
