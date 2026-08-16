// backfill-taxonomy-codes.mjs — Taxonomy Stable Field-ID V1 backfill.
//
// Per docs/taxonomy-stable-field-id-migration-plan-v1.md §3-4 and
// ChatGPT's explicit fail-closed guard (2026-08-16): backfills
// `field_code`/`subject_code` on existing edition_story_classifications
// rows written before those columns existed.
//
// field_code is fully deterministic for every row (a straight reverse
// lookup from the currently stored label — every label maps to exactly
// one field entry). subject_code is deterministic ONLY for non-merged
// fields; for a merged field (today: only ms-MY's Bisnes, which merges
// Business+Economy) the original Universal Subject fact was already
// discarded before this migration existed — subject_code is set to the
// explicit sentinel 'unknown_pre_migration', NEVER guessed. Geography-
// residual rows (Nasional/Dunia/World) correctly get subject_code: null
// — that is not a gap, there was never a subject candidate for them.
//
// FAIL-CLOSED: if any classified row's (edition_id, field) does not
// resolve to a known taxonomy entry, the script stops and reports that
// row WITHOUT writing anything — never silently skips or guesses.
//
// Usage:
//   node db/backfill-taxonomy-codes.mjs             (default: dry-run, prints only)
//   node db/backfill-taxonomy-codes.mjs --write      (actually updates)
//
// Requires: DATABASE_ENV=production CONFIRM_PRODUCTION_WRITE=true (write mode only)
// Requires: db/schema-taxonomy-stable-field-id-v1.sql already applied.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { TAXONOMY_REGISTRY, getFieldEntryByLabel } from '../classification/lib/taxonomy-registry.mjs';
import { assertWriteAllowed } from './production-write-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const WRITE = process.argv.includes('--write');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  if (WRITE) assertWriteAllowed();

  console.log(`\nTAXONOMY CODES BACKFILL — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);

  const { data: rows, error } = await supabase
    .from('edition_story_classifications')
    .select('story_id, edition_id, field, field_code, subject_code')
    .eq('classification_status', 'classified')
    .is('field_code', null); // idempotent — only unbackfilled rows
  if (error) throw new Error(`fetch — ${error.message}`);

  console.log(`${rows.length} classified rows with field_code not yet set.\n`);
  if (rows.length === 0) { console.log('Nothing to backfill.\n'); return; }

  const updates = [];
  const problems = [];

  for (const row of rows) {
    if (!TAXONOMY_REGISTRY[row.edition_id]) {
      problems.push({ ...row, reason: `unknown edition_id: ${row.edition_id}` });
      continue;
    }
    const entry = getFieldEntryByLabel(row.edition_id, row.field);
    if (!entry) {
      problems.push({ ...row, reason: `label "${row.field}" not found in taxonomy registry for ${row.edition_id}` });
      continue;
    }

    let subjectCode;
    if (entry.subject_codes === null) {
      subjectCode = null; // geography-residual — correct, not a gap
    } else if (entry.subject_codes.length === 1) {
      subjectCode = entry.subject_codes[0]; // non-merged — fully deterministic
    } else {
      subjectCode = 'unknown_pre_migration'; // merged field — original fact already discarded, never guessed
    }

    updates.push({
      story_id: row.story_id,
      edition_id: row.edition_id,
      field_code: entry.field_code,
      subject_code: subjectCode,
    });
  }

  if (problems.length > 0) {
    console.error(`\n✗ FAIL-CLOSED — ${problems.length} row(s) could not be mapped with confidence:\n`);
    for (const p of problems) {
      console.error(`  story_id=${p.story_id} edition_id=${p.edition_id} field="${p.field}" — ${p.reason}`);
    }
    console.error('\nRefusing to write ANYTHING until every row resolves. No partial backfill.\n');
    process.exit(1);
  }

  console.log(`✓ All ${updates.length} rows resolved with confidence:`);
  const bySentinel = updates.filter(u => u.subject_code === 'unknown_pre_migration').length;
  const byNull = updates.filter(u => u.subject_code === null).length;
  const byReal = updates.length - bySentinel - byNull;
  console.log(`  ${byReal} with a real subject_code`);
  console.log(`  ${bySentinel} with 'unknown_pre_migration' sentinel (merged field, pre-migration)`);
  console.log(`  ${byNull} with subject_code=null (geography-residual, correct)\n`);

  if (!WRITE) {
    console.log('DRY RUN — no rows written. Re-run with --write to apply.\n');
    return;
  }

  let written = 0;
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('edition_story_classifications')
      .update({ field_code: u.field_code, subject_code: u.subject_code })
      .eq('story_id', u.story_id)
      .eq('edition_id', u.edition_id);
    if (updErr) throw new Error(`update ${u.story_id}/${u.edition_id} — ${updErr.message}`);
    written++;
  }
  console.log(`✓ Backfilled ${written} rows.\n`);
}

main().catch(err => {
  console.error('backfill-taxonomy-codes failed:', err.message);
  process.exit(1);
});
