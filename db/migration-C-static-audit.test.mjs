// migration-C-static-audit.test.mjs — static audit for
// migration-C-swap-reconciliation-fix-v1.sql, per
// docs/migration-C-swap-reconciliation-fix-design-and-plan-v1.md §4.
//
// No local Postgres available (same constraint as Migration A/B's
// audits). Proves, by parsing the SQL text directly:
//   - the story_overrides/saved_stories/history_entries FK-repoint
//     blocks are completely ABSENT from the new function
//   - the edition_story_classifications block is byte-for-byte
//     IDENTICAL to the last committed version (exact-equivalence,
//     same technique as db/editorial-fk-migration-static-audit.test.mjs
//     used for Migration A)
//   - swap_ingestion_staging() and Migration A/B are untouched by this file

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nMIGRATION C — static audit (repoint_story_clusters_fks fix)\n');

const cRaw = readFileSync('db/migration-C-swap-reconciliation-fix-v1.sql', 'utf8');
function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}
const c = stripSqlComments(cRaw);

// --- The 3 editorial FK blocks must be completely absent ---
check('Migration C never creates story_overrides_story_id_fkey', !/story_overrides_story_id_fkey/.test(c));
check('Migration C never creates saved_stories_story_id_fkey', !/saved_stories_story_id_fkey/.test(c));
check('Migration C never creates history_entries_story_id_fkey', !/history_entries_story_id_fkey/.test(c));
check('Migration C never touches the story_overrides table at all', !/\bstory_overrides\b/.test(c));
check('Migration C never touches the saved_stories table at all', !/\bsaved_stories\b/.test(c));
check('Migration C never touches the history_entries table at all', !/\bhistory_entries\b/.test(c));

// --- swap_ingestion_staging() must not be touched by this file ---
check('Migration C does not redefine swap_ingestion_staging()', !/CREATE OR REPLACE FUNCTION swap_ingestion_staging/.test(c));
check('Migration C does not reference the Migration A/B lock key at all (no reason to)', !/71827364501/.test(c));

// --- Exact-equivalence: edition_story_classifications block unchanged ---
function extractFunctionBody(sql, fnName) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION ${fnName}\\(\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`);
  const m = re.exec(sql);
  if (!m) throw new Error(`could not find function body for ${fnName}`);
  return m[1];
}
function extractEditionBlock(functionBody) {
  // The edition_story_classifications block starts at the DELETE
  // statement and runs to the end of the function body (it's the last
  // block in both the old and new versions).
  const idx = functionBody.indexOf('DELETE FROM edition_story_classifications');
  if (idx === -1) throw new Error('edition_story_classifications block not found');
  return functionBody.slice(idx);
}
function normalize(body) {
  return body.split('\n')
    .map(line => line.replace(/--.*$/, '').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

const originalSchema = readFileSync('db/schema-ingestion-staging-functions-v1.sql', 'utf8');
const originalFullBody = extractFunctionBody(originalSchema, 'repoint_story_clusters_fks');
const originalEditionBlock = normalize(extractEditionBlock(originalFullBody));

const newFullBody = extractFunctionBody(cRaw, 'repoint_story_clusters_fks');
const newEditionBlock = normalize(extractEditionBlock(newFullBody));

check(
  'edition_story_classifications block is byte-for-byte identical to the last committed version',
  originalEditionBlock === newEditionBlock
);
if (originalEditionBlock !== newEditionBlock) {
  const linesOld = originalEditionBlock.split('\n');
  const linesNew = newEditionBlock.split('\n');
  for (let i = 0; i < Math.max(linesOld.length, linesNew.length); i++) {
    if (linesOld[i] !== linesNew[i]) {
      console.log(`    first diff at line ${i}: old="${linesOld[i]}" vs new="${linesNew[i]}"`);
      break;
    }
  }
}

// --- New function body, after its DECLARE/BEGIN preamble, IS the
// edition_story_classifications block and nothing else ---
const normalizedNewBody = normalize(newFullBody);
const afterBegin = normalizedNewBody.slice(normalizedNewBody.indexOf('BEGIN') + 'BEGIN'.length).replace(/^\n+/, '');
check(
  'the new function body, after BEGIN, IS the edition_story_classifications block, nothing more',
  afterBegin === newEditionBlock
);

// --- No orphan cleanup beyond what already existed (the DELETE here is the SAME DELETE as before, not new scope) ---
const deleteCount = (c.match(/\bDELETE\s+FROM\b/gi) ?? []).length;
check('exactly one DELETE statement (the pre-existing edition_story_classifications cleanup, not a new one)', deleteCount === 1);
check('the one DELETE targets only edition_story_classifications', /DELETE FROM edition_story_classifications/.test(c));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
