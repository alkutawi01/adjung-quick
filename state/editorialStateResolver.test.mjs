// editorialStateResolver.test.mjs — Fasa 3.6.1 Foundation tests.
// Pure function tests, no database/network.
//
// Taxonomy Stable Field-ID V1 (2026-08-16): field/new_field renamed to
// field_code/new_field_code throughout — resolver now operates on stable
// codes, never the mutable display label. Arbitrary code strings used
// below (this resolver doesn't validate against a real taxonomy).
//
// Run: node state/editorialStateResolver.test.mjs

import { resolveStoryField, pickMostRecent } from './editorialStateResolver.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nEDITORIAL STATE RESOLVER — precedence integration test\n');

const classified = { field_code: 'politics', classification_status: 'classified' };
const unclassified = { field_code: null, classification_status: 'unclassified' };

// --- no overrides: classifier output passes through unchanged ---
{
  const r = resolveStoryField(classified, []);
  assert('no override -> classifier fieldCode/visibility used as-is',
    r.visible === true && r.fieldCode === 'politics' && r.source === 'classifier');
}

{
  const r = resolveStoryField(unclassified, []);
  assert('unclassified + no override -> not visible, matches classification_status',
    r.visible === false && r.source === 'classifier');
}

// --- hide overrides everything, including a reclassify ---
{
  const overrides = [
    { id: 'o1', override_type: 'reclassify', new_field_code: 'disaster', created_at: '2026-08-13T01:00:00Z' },
    { id: 'o2', override_type: 'hide', created_at: '2026-08-13T02:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('hide beats reclassify, even if reclassify is present too',
    r.visible === false && r.fieldCode === null && r.overrideId === 'o2');
}

// --- reclassify changes field, keeps story visible ---
{
  const overrides = [{ id: 'o3', override_type: 'reclassify', new_field_code: 'disaster', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(classified, overrides);
  assert('reclassify -> visible, fieldCode replaced with new_field_code',
    r.visible === true && r.fieldCode === 'disaster' && r.source === 'override' && r.overrideId === 'o3');
}

// --- reclassify can rescue an unclassified story ---
{
  const overrides = [{ id: 'o4', override_type: 'reclassify', new_field_code: 'health', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(unclassified, overrides);
  assert('reclassify makes an unclassified story visible under the new fieldCode',
    r.visible === true && r.fieldCode === 'health');
}

// --- boost is not resolved here (out of this function's scope) ---
{
  const overrides = [{ id: 'o5', override_type: 'boost', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(classified, overrides);
  assert('boost override present but irrelevant to field/visibility -> classifier output used',
    r.visible === true && r.fieldCode === 'politics' && r.source === 'classifier',
    'boost affects ranking, not field resolution — deliberately not handled here');
}

// --- FASA 3.6.5: pin ---

// Pin on a classified story overrides the classifier's field, same shape
// as reclassify.
{
  const overrides = [{ id: 'p1', override_type: 'pin', new_field_code: 'nasional', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(classified, overrides);
  assert('pin -> visible, fieldCode replaced with new_field_code, pinned flag set',
    r.visible === true && r.fieldCode === 'nasional' && r.source === 'override' && r.overrideId === 'p1' && r.pinned === true);
}

// The actual fix for Finding F: pin rescues an UNCLASSIFIED story —
// classification_status is never checked once the pin branch matches.
{
  const overrides = [{ id: 'p2', override_type: 'pin', new_field_code: 'disaster', created_at: '2026-08-13T01:00:00Z' }];
  const r = resolveStoryField(unclassified, overrides);
  assert('pin on an unclassified story -> visible under new_field_code anyway (Finding F fix)',
    r.visible === true && r.fieldCode === 'disaster' && r.pinned === true);
}

// Locked precedence: hide beats pin, same as hide beats reclassify.
{
  const overrides = [
    { id: 'p3', override_type: 'pin', new_field_code: 'sports', created_at: '2026-08-13T01:00:00Z' },
    { id: 'h1', override_type: 'hide', created_at: '2026-08-13T02:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('hide beats pin, even if pin is present too',
    r.visible === false && r.fieldCode === null && r.overrideId === 'h1' && !r.pinned);
}

// Locked precedence: pin beats reclassify (pin sits between hide and
// reclassify in docs/editorial-override-data-model-v1.md §3).
{
  const overrides = [
    { id: 'r1', override_type: 'reclassify', new_field_code: 'crime', created_at: '2026-08-13T01:00:00Z' },
    { id: 'p4', override_type: 'pin', new_field_code: 'politics', created_at: '2026-08-13T02:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('pin beats reclassify, even if reclassify is present too',
    r.visible === true && r.fieldCode === 'politics' && r.overrideId === 'p4' && r.pinned === true);
}

// Every non-pin branch must leave `pinned` falsy, never explicitly false
// on unrelated paths — reducer.js's `c.pinned` check must only ever be
// true for an actual live pin.
{
  const r1 = resolveStoryField(classified, []);
  const r2 = resolveStoryField(classified, [{ id: 'r2', override_type: 'reclassify', new_field_code: 'science', created_at: '2026-08-13T01:00:00Z' }]);
  assert('pinned is falsy on the classifier-default path', !r1.pinned);
  assert('pinned is falsy on the reclassify path', !r2.pinned);
}

// --- conflict: two reclassify overrides for the same story, most recent wins ---
{
  const overrides = [
    { id: 'old', override_type: 'reclassify', new_field_code: 'science', created_at: '2026-08-10T00:00:00Z' },
    { id: 'new', override_type: 'reclassify', new_field_code: 'technology', created_at: '2026-08-13T00:00:00Z' },
  ];
  const r = resolveStoryField(classified, overrides);
  assert('two conflicting reclassify overrides -> most recent created_at wins',
    r.fieldCode === 'technology' && r.overrideId === 'new');
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
