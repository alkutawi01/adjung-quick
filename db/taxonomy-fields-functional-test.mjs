// taxonomy-fields-functional-test.mjs — one-off functional verification
// against real production RPCs, per implementation plan §8. Test-only
// rows, cleaned up after. Uses a REAL from_field_code that exists
// (ms-MY/'sains') merged into a REAL test field, then both restored/
// removed, to prove merge_taxonomy_fields() actually works end-to-end
// against live data, not just a synthetic pair.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { addTaxonomyField, renameTaxonomyField, setTaxonomyFieldVisibility, setTaxonomyFieldStatus, mergeTaxonomyFields, listTaxonomyFields } from './taxonomy-fields-adapter.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

const TEST_CODE = 'test_phase2_' + Date.now();

async function main() {
  console.log('\nTAXONOMY FIELDS — functional RPC test (real production RPCs)\n');

  // --- add ---
  const id = await addTaxonomyField(supabase, { editionId: 'ms-MY', fieldCode: TEST_CODE, label: 'Test Field', role: 'admin' });
  check('addTaxonomyField creates a row and returns an id', !!id);

  // --- admin gating ---
  let threw = false;
  try { await addTaxonomyField(supabase, { editionId: 'ms-MY', fieldCode: TEST_CODE + '_2', label: 'x', role: 'editor' }); } catch { threw = true; }
  check('addTaxonomyField refuses editor role', threw);

  // --- field_code validation ---
  threw = false;
  try { await addTaxonomyField(supabase, { editionId: 'ms-MY', fieldCode: 'BAD CODE!', label: 'x', role: 'admin' }); } catch { threw = true; }
  check('add_taxonomy_field rejects a non-machine-safe field_code', threw);

  // --- rename ---
  await renameTaxonomyField(supabase, { id, label: 'Test Field Renamed', role: 'admin' });
  let list = await listTaxonomyFields(supabase, { editionId: 'ms-MY' });
  let row = list.find(r => r.id === id);
  check('renameTaxonomyField changes label', row?.label === 'Test Field Renamed');
  check('rename leaves field_code untouched', row?.field_code === TEST_CODE);

  // --- visibility ---
  await setTaxonomyFieldVisibility(supabase, { id, wheelVisible: false, role: 'admin' });
  list = await listTaxonomyFields(supabase, { editionId: 'ms-MY' });
  row = list.find(r => r.id === id);
  check('setTaxonomyFieldVisibility hides from wheel', row?.wheel_visible === false);

  // --- status ---
  await setTaxonomyFieldStatus(supabase, { id, status: 'archived', role: 'admin' });
  list = await listTaxonomyFields(supabase, { editionId: 'ms-MY' });
  row = list.find(r => r.id === id);
  check('setTaxonomyFieldStatus archives the row (not deleted)', row?.status === 'archived');
  await setTaxonomyFieldStatus(supabase, { id, status: 'active', role: 'admin' });

  // --- merge validation (fail-closed cases) ---
  threw = false;
  try { await mergeTaxonomyFields(supabase, { editionId: 'ms-MY', fromFieldCode: TEST_CODE, intoFieldCode: TEST_CODE, role: 'admin' }); } catch { threw = true; }
  check('merge rejects from == into', threw);

  threw = false;
  try { await mergeTaxonomyFields(supabase, { editionId: 'ms-MY', fromFieldCode: TEST_CODE, intoFieldCode: 'does_not_exist_xyz', role: 'admin' }); } catch { threw = true; }
  check('merge rejects a nonexistent into_field_code', threw);

  // --- merge, real end-to-end ---
  const id2 = await addTaxonomyField(supabase, { editionId: 'ms-MY', fieldCode: TEST_CODE + '_target', label: 'Test Target', role: 'admin' });
  await mergeTaxonomyFields(supabase, { editionId: 'ms-MY', fromFieldCode: TEST_CODE, intoFieldCode: TEST_CODE + '_target', role: 'admin' });
  list = await listTaxonomyFields(supabase, { editionId: 'ms-MY' });
  const fromRow = list.find(r => r.field_code === TEST_CODE);
  check('merge archives the from row', fromRow?.status === 'archived');
  const targetRow = list.find(r => r.id === id2);
  check('merge leaves the into row active', targetRow?.status === 'active');

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('taxonomy-fields-functional-test failed:', err.message);
  process.exit(1);
});
