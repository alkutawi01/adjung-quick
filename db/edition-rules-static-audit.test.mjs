// edition-rules-static-audit.test.mjs — static audit for
// schema-edition-rules-v1.sql and schema-edition-rules-rpc-v1.sql.
//
// No local Postgres available (same constraint as every prior phase).
// Proves, by parsing the SQL text directly: geography type/value XOR
// constraint is real, the field_code FK reuses taxonomy_fields' natural
// key (no new identity), every write RPC has REVOKE FROM PUBLIC in the
// same block as its GRANT, no anon grant, exactly 3 RPC functions, no
// seed/migration statement (ships empty — the built-in rule is not
// copied into this table), and archive requires a reason.

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nEDITION RULES — static audit\n');

function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

const schemaRaw = readFileSync('db/schema-edition-rules-v1.sql', 'utf8');
const rpcRaw = readFileSync('db/schema-edition-rules-rpc-v1.sql', 'utf8');
const schema = stripSqlComments(schemaRaw);
const rpc = stripSqlComments(rpcRaw);

// --- Schema: table shape ---
check('edition_id is NOT NULL (always required, never global)', /edition_id\s+TEXT NOT NULL/.test(schema));
check('condition_geography_type is constrained to not/is only', /CHECK \(condition_geography_type IN \('not', 'is'\)\)/.test(schema));
check('status is constrained to active/archived only', /CHECK \(status IN \('active', 'archived'\)\)/.test(schema));
check('schema file contains no DROP TABLE / DELETE statement', !/DROP TABLE|DELETE FROM/i.test(schema));
check('schema file contains no INSERT statement (ships empty, built-in rule not copied in)', !/INSERT INTO/i.test(schema));

// --- Geography XOR: type and value must both be null or both be set ---
check('edition_rules_geography_xor CHECK constraint is present', /CONSTRAINT edition_rules_geography_xor CHECK/.test(schema));
check('XOR constraint requires both null together', /condition_geography_type IS NULL AND condition_geography_value IS NULL/.test(schema));
check('XOR constraint requires both set together', /condition_geography_type IS NOT NULL AND condition_geography_value IS NOT NULL/.test(schema));

// --- action_field_code FK reuses taxonomy_fields' natural key, no new identity ---
check('composite FK on (edition_id, action_field_code) references taxonomy_fields', /FOREIGN KEY \(edition_id, action_field_code\) REFERENCES taxonomy_fields \(edition_id, field_code\)/.test(schema));
check('no new synthetic rule-group/global identity column invented', !/global_rule_id|rule_group_id/i.test(schema));

// --- action stores field_code, not a label (unlike the built-in rule's display_field) ---
check('action_field_code column exists (not action_display_field/action_label)', /action_field_code\s+TEXT NOT NULL/.test(schema));
check('no "display_field" or "label" column on this table (field_code only, resolved to label at read time)', !/action_display_field|action_label/i.test(schema));

// --- RLS: authenticated read only, no anon ---
check('RLS is enabled on edition_rules', /ALTER TABLE edition_rules ENABLE ROW LEVEL SECURITY/.test(schema));
check('read policy grants to authenticated', /GRANT SELECT ON edition_rules TO authenticated/.test(schema));
check('no anon grant anywhere in the schema file', !/TO anon/i.test(schema));

// --- RPC: exactly 3 functions, no update-in-place (matches classification_rules' V1 limitation) ---
const rpcFunctionNames = [...rpc.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map(m => m[1]);
check('exactly 3 RPC functions defined', rpcFunctionNames.length === 3);
check('functions are add/archive/restore only, no update/rename', new Set(rpcFunctionNames).size === 3 &&
  rpcFunctionNames.includes('add_edition_rule') && rpcFunctionNames.includes('archive_edition_rule') && rpcFunctionNames.includes('restore_edition_rule'));

// --- Security: REVOKE FROM PUBLIC in the same file as every GRANT, per the Phase 2 lesson ---
for (const fn of ['add_edition_rule', 'archive_edition_rule', 'restore_edition_rule']) {
  check(`${fn}: REVOKE EXECUTE FROM PUBLIC is present`, new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn}\\(`).test(rpc));
  check(`${fn}: GRANT EXECUTE TO service_role is present`, new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\(.*TO service_role`).test(rpc));
}
check('no anon grant anywhere in the RPC file', !/TO anon/i.test(rpc));

// --- Archive requires a reason (operational-consequence discipline) ---
check('archive_edition_rule requires a reason (raises exception if null/empty)', /archive_edition_rule[\s\S]*?p_reason IS NULL OR p_reason = ''/.test(rpc));

// --- Defense in depth: RPC validates the same XOR the table enforces ---
{
  const addFnBody = rpc.slice(rpc.indexOf('FUNCTION add_edition_rule'), rpc.indexOf('FUNCTION archive_edition_rule'));
  check('add_edition_rule has defense-in-depth geography XOR validation', /p_condition_geography_type IS NULL AND p_condition_geography_value IS NULL/.test(addFnBody));
}

// --- Authenticated-access patch (schema-edition-rules-rpc-authenticated-
// patch-v1.sql): fixes the browser-admin-UI-can't-call-service_role-only-
// RPCs blocker found before building the Admin UI. Proves the fix adds
// an is_admin() check to EVERY function (not just some), passes
// auth.uid() (never a client-supplied user id — no privilege escalation
// surface), and grants authenticated without ever granting anon. ---
const patchRaw = readFileSync('db/schema-edition-rules-rpc-authenticated-patch-v1.sql', 'utf8');
const patch = stripSqlComments(patchRaw);

for (const fn of ['add_edition_rule', 'archive_edition_rule', 'restore_edition_rule']) {
  const fnBody = patch.slice(patch.indexOf(`FUNCTION ${fn}`), patch.indexOf('$$;', patch.indexOf(`FUNCTION ${fn}`)));
  check(`${fn}: calls is_admin(auth.uid()) — never a client-supplied user id`, /IF NOT is_admin\(auth\.uid\(\)\) THEN/.test(fnBody));
  check(`${fn}: raises an exception (does not silently no-op) when not admin`, /RAISE EXCEPTION[\s\S]*?memerlukan peranan admin/.test(fnBody));
}
check('patch grants EXECUTE to authenticated (alongside service_role, not instead of it)',
  /GRANT EXECUTE ON FUNCTION add_edition_rule\([^)]*\) TO service_role, authenticated/.test(patch) &&
  /GRANT EXECUTE ON FUNCTION archive_edition_rule\([^)]*\) TO service_role, authenticated/.test(patch) &&
  /GRANT EXECUTE ON FUNCTION restore_edition_rule\([^)]*\) TO service_role, authenticated/.test(patch));
check('patch never grants anything to anon', !/TO anon/i.test(patch));
check('patch keeps REVOKE FROM PUBLIC for all 3 functions (grant is narrowed to specific roles, not opened to everyone)',
  (patch.match(/REVOKE EXECUTE ON FUNCTION/g) || []).length === 3);

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
