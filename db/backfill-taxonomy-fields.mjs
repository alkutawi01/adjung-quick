// backfill-taxonomy-fields.mjs — Backend Control Plane Phase 2.
//
// Per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §5.
// Deterministic 1:1 copy of TAXONOMY_REGISTRY into taxonomy_fields —
// no re-derivation, no ambiguity. Fail-closed: refuses to run if the
// table already has rows; verifies post-insert count matches exactly.
//
// Usage:
//   node db/backfill-taxonomy-fields.mjs           (dry-run, prints only)
//   node db/backfill-taxonomy-fields.mjs --write    (actually inserts)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { TAXONOMY_REGISTRY } from '../classification/lib/taxonomy-registry.mjs';

const WRITE = process.argv.includes('--write');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(`\nTAXONOMY FIELDS BACKFILL — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);

  const rows = [];
  for (const [editionId, entries] of Object.entries(TAXONOMY_REGISTRY)) {
    entries.forEach((e, index) => {
      rows.push({
        edition_id: editionId,
        field_code: e.field_code,
        label: e.label,
        subject_codes: e.subject_codes,
        wheel_visible: e.wheel_visible,
        status: 'active',
        display_order: index,
      });
    });
  }
  console.log(`${rows.length} rows derived from TAXONOMY_REGISTRY (expected 45 = 16 ms-MY + 16 en-global + 13 ar-global).\n`);

  if (rows.length !== 45) {
    console.error(`FAIL-CLOSED — expected exactly 45 rows, computed ${rows.length}. TAXONOMY_REGISTRY may have changed since this script was written — investigate before proceeding.`);
    process.exit(1);
  }

  // field_code must pass the same machine-safe check the DB CHECK
  // constraint / add_taxonomy_field() RPC will enforce — verified here
  // too so a bad backfill row is caught before it ever reaches the DB.
  const badCodes = rows.filter(r => !/^[a-z][a-z0-9_]{1,31}$/.test(r.field_code));
  if (badCodes.length > 0) {
    console.error('FAIL-CLOSED — field_code(s) fail the machine-safe format:');
    badCodes.forEach(r => console.error(`  ${r.edition_id}/${r.field_code}`));
    process.exit(1);
  }

  const { data: existing, error: existingErr } = await supabase.from('taxonomy_fields').select('id');
  if (existingErr) throw new Error(`checking existing rows — ${existingErr.message}`);
  if (existing.length > 0) {
    console.error(`FAIL-CLOSED — taxonomy_fields already has ${existing.length} row(s). Refusing to double-insert.`);
    process.exit(1);
  }

  console.log('All validations passed. Row preview (first 3):');
  console.log(rows.slice(0, 3));

  if (!WRITE) {
    console.log(`\nDRY RUN — ${rows.length} rows would be inserted. Re-run with --write to apply.\n`);
    return;
  }

  const { error: insertErr } = await supabase.from('taxonomy_fields').insert(rows);
  if (insertErr) throw new Error(`insert — ${insertErr.message}`);

  const { count, error: countErr } = await supabase
    .from('taxonomy_fields').select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(`count verification — ${countErr.message}`);
  if (count !== rows.length) {
    console.error(`FAIL-CLOSED — expected ${rows.length} rows after insert, found ${count}. Investigate before proceeding.`);
    process.exit(1);
  }

  console.log(`\n✓ Backfilled ${count}/${rows.length} rows into taxonomy_fields.\n`);
}

main().catch(err => {
  console.error('backfill-taxonomy-fields failed:', err.message);
  process.exit(1);
});
