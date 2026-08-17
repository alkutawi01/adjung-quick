// editorial-fk-migration-static-audit.test.mjs — static audit for
// migration-A-swap-advisory-lock-v1.sql and
// migration-B-editorial-fk-removal-v1.sql.
//
// No local Postgres exists in this project (every schema file's own
// header says so — applied manually via Supabase SQL Editor). This
// test cannot exercise the actual DDL/trigger behavior; it parses the
// SQL text itself and asserts the specific properties ChatGPT required
// per docs/editorial-state-orphan-lifecycle-implementation-plan-v1.md
// §4/§7 and the "Arahan tambahan untuk SQL" instruction:
//   - the lock key is ONE pinned literal, identical in both files
//   - it is never re-derived via hashtext() at call time
//   - FK constraint names are discovered dynamically, never hardcoded
//   - edition_story_classifications is never referenced by either file
//   - Migration A only adds the lock line to swap_ingestion_staging(),
//     nothing else in that function's body changes
//   - the trigger is attached to exactly the 3 intended tables

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nEDITORIAL FK MIGRATION — static audit (A + B)\n');

const aRaw = readFileSync('db/migration-A-swap-advisory-lock-v1.sql', 'utf8');
const bRaw = readFileSync('db/migration-B-editorial-fk-removal-v1.sql', 'utf8');

// Strip full-line and trailing SQL comments so checks reflect EXECUTABLE
// SQL only — this file's own extensive documentation comments
// (explaining what's NOT touched, cross-referencing the other
// migration, showing verification queries) legitimately mention
// things like "edition_story_classifications" or the other file's
// lock-call form without that being a real usage.
function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}
const a = stripSqlComments(aRaw);
const b = stripSqlComments(bRaw);

// --- Lock key: one pinned literal, identical in both files ---
const aKeyMatches = [...a.matchAll(/pg_advisory_xact_lock\((\d+)\)/g)].map(m => m[1]);
const bExclusiveMatches = [...b.matchAll(/pg_advisory_xact_lock\((\d+)\)/g)].map(m => m[1]);
const bSharedMatches = [...b.matchAll(/pg_advisory_xact_lock_shared\((\d+)\)/g)].map(m => m[1]);

check('Migration A calls pg_advisory_xact_lock with exactly one literal key', aKeyMatches.length === 1);
check('Migration A does not also call the shared variant', !/pg_advisory_xact_lock_shared/.test(a));
check('Migration B calls pg_advisory_xact_lock_shared with exactly one literal key', bSharedMatches.length === 1);
check('Migration B does not call the exclusive variant', bExclusiveMatches.length === 0);

const keyA = aKeyMatches[0];
const keyB = bSharedMatches[0];
check(`lock key is identical across both migrations (A=${keyA}, B=${keyB})`, !!keyA && keyA === keyB);
check('lock key is a plain literal, not derived at runtime', /^\d+$/.test(keyA ?? ''));

// --- Never re-derive via hashtext() at call time ---
check('Migration A never calls hashtext() in executable SQL (only in a comment, if at all)', !/hashtext\(/.test(a));
check('Migration B never calls hashtext() in executable SQL', !/hashtext\(/.test(b));

// --- FK constraint names discovered dynamically, never hardcoded ---
check('Migration B discovers FK constraint names via pg_constraint (not a hardcoded name)',
  /SELECT con\.conname.*FROM pg_constraint/s.test(b));
check('Migration B uses EXECUTE format(...) to DROP CONSTRAINT dynamically, not a literal constraint name',
  /EXECUTE format\('ALTER TABLE %s DROP CONSTRAINT %I'/.test(b));
check('Migration B never contains a literal "DROP CONSTRAINT <name>" (would mean a hardcoded guess)',
  !/DROP CONSTRAINT [a-z_]+_fkey/i.test(b));

// --- edition_story_classifications never touched ---
check('Migration A never references edition_story_classifications', !/edition_story_classifications/.test(a));
check('Migration B never references edition_story_classifications', !/edition_story_classifications/.test(b));

// --- Migration B targets exactly the 3 intended tables, nothing else ---
const fkTargetTables = [...b.matchAll(/'([a-z_]+)'::regclass/g)].map(m => m[1]);
const uniqueTargets = new Set(fkTargetTables.filter(t => t !== 'story_clusters'));
check('Migration B\'s FK-drop targets exactly story_overrides, saved_stories, history_entries',
  uniqueTargets.size === 3 &&
  uniqueTargets.has('story_overrides') &&
  uniqueTargets.has('saved_stories') &&
  uniqueTargets.has('history_entries'));

const triggerTables = [...b.matchAll(/BEFORE INSERT OR UPDATE OF story_id ON (\w+)/g)].map(m => m[1]);
check('Migration B attaches the trigger to exactly 3 tables',
  triggerTables.length === 3 &&
  new Set(triggerTables).size === 3 &&
  ['story_overrides', 'saved_stories', 'history_entries'].every(t => triggerTables.includes(t)));

// --- Migration A changes only what it says it changes ---
// 6 = 3 "live -> _old" renames + 3 "_staging -> live" renames, unchanged
// from the prior committed version of this function.
const alterTableCount = (a.match(/ALTER TABLE \w+ RENAME TO/g) ?? []).length;
check('Migration A preserves all 6 original renames (3 live->_old, 3 _staging->live)', alterTableCount === 6);
check('Migration A still calls repoint_story_clusters_fks() (unchanged from the prior committed version)',
  /PERFORM repoint_story_clusters_fks\(\);/.test(a));
check('Migration A does not touch story_overrides/saved_stories/history_entries at all',
  !/story_overrides|saved_stories|history_entries/.test(a));

// --- No orphan cleanup, no expires_at changes, anywhere ---
check('Neither migration contains a DELETE statement (no orphan cleanup)', !/\bDELETE\s+FROM\b/i.test(a) && !/\bDELETE\s+FROM\b/i.test(b));
check('Neither migration touches expires_at', !/expires_at\s*=/.test(a) && !/expires_at\s*=/.test(b));

// --- Error message contract (per implementation plan §3) ---
check('Migration B\'s trigger raises a message starting with "story_id" and containing "does not exist"',
  /RAISE EXCEPTION 'story_id % does not exist/.test(b));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
