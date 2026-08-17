// drop-old-tables-fk-cycle.test.mjs — regression guard for the
// story_clusters_old <-> rss_items_old circular-FK bug (found live
// 2026-08-17, fixed in db/schema-drop-old-tables-fk-cycle-fix-v1.sql).
//
// No local Postgres is available to this project to exercise a real
// DROP TABLE against the circular FK directly (every schema file in
// this repo is applied manually via Supabase SQL Editor — no migration
// runner, per every schema-*.sql file's own header). This test instead
// statically asserts the fixed function's SQL never regresses back to
// three separate DROP TABLE statements — the exact shape that fails —
// by parsing the source SQL itself.

import { readFileSync } from 'fs';
import assert from 'assert';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nDROP_INGESTION_OLD_TABLES — FK-cycle regression guard\n');

const sql = readFileSync('db/schema-drop-old-tables-fk-cycle-fix-v1.sql', 'utf8');

// Extract the function body between the CREATE OR REPLACE FUNCTION
// drop_ingestion_old_tables() and its closing $$.
const bodyMatch = /CREATE OR REPLACE FUNCTION drop_ingestion_old_tables\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(sql);
assert(bodyMatch, 'drop_ingestion_old_tables() function body not found in schema file');
const body = bodyMatch[1];

const dropStatements = body.match(/DROP TABLE[^;]*;/g) ?? [];
check('exactly one DROP TABLE statement (not three separate ones — the original bug)', dropStatements.length === 1);

const drop = dropStatements[0] ?? '';
check('drops story_clusters_old', /\bstory_clusters_old\b/.test(drop));
check('drops rss_items_old', /\brss_items_old\b/.test(drop));
check('drops sources_old', /\bsources_old\b/.test(drop));
check('uses CASCADE (required to resolve the circular FK in one statement)', /\bCASCADE\b/.test(drop));
check('uses IF EXISTS (idempotent — safe if a previous partial drop already removed one)', /IF EXISTS/.test(drop));

// Scope guard, per ChatGPT's explicit instruction: CASCADE must not be
// used more broadly than these exactly 3 known tables.
const tableNames = drop.match(/\b\w+_old\b/g) ?? [];
check('CASCADE scoped to exactly 3 tables, no more', new Set(tableNames).size === 3);

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
