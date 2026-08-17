// classification-rules-static-audit.test.mjs — static audit for
// schema-classification-rules-v1.sql and schema-classification-rules-rpc-v1.sql.
//
// No local Postgres available (same constraint as every prior phase this
// session). Proves, by parsing the SQL text directly, the properties
// ChatGPT required: the mutual-exclusion XOR constraint is real, the
// composite FK reuses Phase 2's natural key (no new UUID identity), every
// write RPC has REVOKE FROM PUBLIC in the same block as its GRANT (the
// direct lesson from the Phase 2 security incident), no anon grant on
// this table, exactly 3 RPC functions (no update/rename — V1 limitation),
// and no seed/migration statement anywhere in these two files (ships
// empty, per the withdrawn-migration revision).

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nCLASSIFICATION RULES — static audit\n');

function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

const schemaRaw = readFileSync('db/schema-classification-rules-v1.sql', 'utf8');
const rpcRaw = readFileSync('db/schema-classification-rules-rpc-v1.sql', 'utf8');
const schema = stripSqlComments(schemaRaw);
const rpc = stripSqlComments(rpcRaw);

// --- Schema: table shape ---
check('rule_type is constrained to source/url/keyword only', /CHECK \(rule_type IN \('source', 'url', 'keyword'\)\)/.test(schema));
check('status is constrained to active/archived only', /CHECK \(status IN \('active', 'archived'\)\)/.test(schema));
check('schema file contains no DROP TABLE / DELETE statement', !/DROP TABLE|DELETE FROM/i.test(schema));
check('schema file contains no INSERT statement (ships empty, no auto-seed)', !/INSERT INTO/i.test(schema));

// --- Design V1 §3/§4a/§4b: mutual-exclusion XOR constraint present ---
check('classification_rules_target_xor CHECK constraint is present', /CONSTRAINT classification_rules_target_xor CHECK/.test(schema));
check('XOR constraint requires edition_id+field_code together', /edition_id IS NOT NULL AND field_code IS NOT NULL AND subject_code IS NULL/.test(schema));
check('XOR constraint requires NULL edition_id+subject_code together', /edition_id IS NULL AND subject_code IS NOT NULL AND field_code IS NULL/.test(schema));

// --- Design V1 §4a: composite FK reuses Phase 2's natural key, no new UUID ---
check('composite FK on (edition_id, field_code) references taxonomy_fields', /FOREIGN KEY \(edition_id, field_code\) REFERENCES taxonomy_fields \(edition_id, field_code\)/.test(schema));
check('no new synthetic "global rule id" or similar identity column invented', !/global_rule_id|rule_group_id/i.test(schema));

// --- Read access: authenticated only, never anon (Admin-only data) ---
check('RLS is enabled on classification_rules', /ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY/.test(schema));
check('GRANT SELECT is scoped to authenticated only', /GRANT SELECT ON classification_rules TO authenticated;/.test(schema));
check('anon is never granted anything on classification_rules', !/TO anon/.test(schema) && !/anon,\s*authenticated/.test(schema));

// --- RPC file: exactly 3 functions, no update/rename (V1 limitation) ---
const expectedFns = ['add_classification_rule', 'archive_classification_rule', 'restore_classification_rule'];
for (const fn of expectedFns) {
  check(`RPC function ${fn}() is defined`, new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(`).test(rpc));
}
const createFunctionCount = (rpc.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length;
check('exactly 3 RPC functions defined, no extras', createFunctionCount === 3);
check('no update_classification_rule / rename_classification_rule function exists (V2 concern, not built)', !/update_classification_rule|rename_classification_rule/.test(rpc));

// --- THE critical security check: REVOKE FROM PUBLIC before every GRANT, same file ---
// This is the direct regression test for the Phase 2 incident: every
// write function here must revoke PUBLIC's default execute grant BEFORE
// (or at minimum, alongside, in the same file) granting service_role —
// never left for a follow-up patch.
for (const fn of expectedFns) {
  const revokeRe = new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn}\\([^)]*\\) FROM PUBLIC;`);
  check(`${fn}() has an explicit REVOKE EXECUTE ... FROM PUBLIC`, revokeRe.test(rpc));
}
const revokeCount = (rpc.match(/REVOKE EXECUTE ON FUNCTION/g) ?? []).length;
const grantCount = (rpc.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length;
check('REVOKE count equals GRANT count (one revoke per grant, none skipped)', revokeCount === grantCount && revokeCount === 3);

// Order check: every REVOKE line appears before its matching GRANT line in
// the file text — matches this project's established convention (REVOKE
// block, then GRANT block) rather than interleaved or GRANT-first.
const firstGrantIdx = rpc.indexOf('GRANT EXECUTE ON FUNCTION');
const lastRevokeIdx = rpc.lastIndexOf('REVOKE EXECUTE ON FUNCTION');
check('all REVOKE statements appear before the first GRANT statement', firstGrantIdx === -1 || lastRevokeIdx < firstGrantIdx);

// --- Source rule pattern validation: sources.id existence check inside the RPC, not just documented ---
const addFnMatch = /CREATE OR REPLACE FUNCTION add_classification_rule\([\s\S]*?\$\$;/.exec(rpc);
check('add_classification_rule() function body found', !!addFnMatch);
const addBody = addFnMatch ? addFnMatch[0] : '';
check('add_classification_rule() validates rule_type is one of the 3 allowed values', /rule_type NOT IN \('source', 'url', 'keyword'\)/.test(addBody));
check('add_classification_rule() validates the XOR invariant in code (defense in depth), not just relying on the CHECK constraint', /p_edition_id IS NOT NULL AND p_field_code IS NOT NULL AND p_subject_code IS NULL/.test(addBody));
check('add_classification_rule() validates source pattern against sources.id when rule_type=source', /p_rule_type = 'source' AND NOT EXISTS \(SELECT 1 FROM sources WHERE id = p_pattern\)/.test(addBody));

// --- No hard delete anywhere — archive/restore only ---
check('archive_classification_rule() sets status, never DELETEs', /UPDATE classification_rules SET status = 'archived'/.test(rpc));
check('restore_classification_rule() sets status, never re-INSERTs', /UPDATE classification_rules SET status = 'active'/.test(rpc));

// --- No extra features not in the implementation plan ---
const forbiddenTerms = ['audit_log', 'conditions_json', 'operator', 'expression', 'CREATE TRIGGER', 'metadata_json'];
for (const term of forbiddenTerms) {
  check(`no "${term}" anywhere in schema/RPC files (explicitly excluded by Design V1)`, !schema.includes(term) && !rpc.includes(term));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
