// taxonomy-fields-static-audit.test.mjs — static audit for
// schema-taxonomy-fields-v1.sql and schema-taxonomy-fields-rpc-v1.sql.
//
// No local Postgres available (same constraint as every prior phase
// this session). Proves, by parsing the SQL text directly, the
// properties ChatGPT required: RPC/adapter separation is real (not
// just documentation), merge is one atomic function with no client-side
// pre-check, field_code validated, no extra features beyond the plan.

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nTAXONOMY FIELDS — static audit\n');

function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

const schemaRaw = readFileSync('db/schema-taxonomy-fields-v1.sql', 'utf8');
const rpcRaw = readFileSync('db/schema-taxonomy-fields-rpc-v1.sql', 'utf8');
const adapterRaw = readFileSync('db/taxonomy-fields-adapter.mjs', 'utf8');
const schema = stripSqlComments(schemaRaw);
const rpc = stripSqlComments(rpcRaw);

// --- Schema: field_code validated, no hard delete anywhere ---
check('field_code has a machine-safe CHECK constraint', /field_code\s+TEXT NOT NULL CHECK \(field_code ~/.test(schema));
check('status is constrained to active/archived only', /CHECK \(status IN \('active', 'archived'\)\)/.test(schema));
check('schema file contains no DROP TABLE / DELETE statement', !/DROP TABLE|DELETE FROM/i.test(schema));

// --- RPC file: exactly 5 functions, all present ---
const expectedFns = ['add_taxonomy_field', 'rename_taxonomy_field', 'set_taxonomy_field_visibility', 'set_taxonomy_field_status', 'merge_taxonomy_fields'];
for (const fn of expectedFns) {
  check(`RPC function ${fn}() is defined`, new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(`).test(rpc));
}
const createFunctionCount = (rpc.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length;
check('exactly 5 RPC functions defined, no extras', createFunctionCount === 5);

// --- No extra features ChatGPT explicitly excluded ---
const forbiddenTerms = ['audit_log', 'taxonomy_version', 'taxonomy_history', 'event_bus', 'CREATE TRIGGER'];
for (const term of forbiddenTerms) {
  check(`no "${term}" anywhere in schema/RPC files (not in plan, not built)`, !schema.includes(term) && !rpc.includes(term));
}

// --- rename_taxonomy_field: field_code structurally not a parameter ---
const renameFnMatch = /CREATE OR REPLACE FUNCTION rename_taxonomy_field\(([^)]*)\)/.exec(rpc);
check('rename_taxonomy_field() signature does not accept field_code as a parameter', !!renameFnMatch && !/field_code/.test(renameFnMatch[1]));

// --- merge_taxonomy_fields: validation inside the function, not just documented ---
const mergeFnMatch = /CREATE OR REPLACE FUNCTION merge_taxonomy_fields\([\s\S]*?\$\$;/.exec(rpc);
check('merge_taxonomy_fields() function body found', !!mergeFnMatch);
const mergeBody = mergeFnMatch ? mergeFnMatch[0] : '';
check('merge validates from != into inside the function', /p_from_field_code = p_into_field_code/.test(mergeBody));
check('merge validates into_field_code exists and is active inside the function', /p_into_field_code AND status = 'active'/.test(mergeBody));
check('merge validates from_field_code exists and is active inside the function', /p_from_field_code AND status = 'active'/.test(mergeBody));
check('merge updates edition_story_classifications', /UPDATE edition_story_classifications/.test(mergeBody));
check('merge updates story_overrides (reclassify rows only)', /UPDATE story_overrides[\s\S]*override_type = 'reclassify'/.test(mergeBody));
check('merge archives the from row (never deletes it)', /UPDATE taxonomy_fields SET status = 'archived'/.test(mergeBody));
check('merge never contains a DELETE statement', !/DELETE FROM/i.test(mergeBody));

// --- Adapter: thin wrappers only, no business logic ---
check('adapter never issues a raw .update()/.insert() for merge (must go through .rpc())', !/mergeTaxonomyFields[\s\S]*?\.from\(/.test(adapterRaw.split('export async function listTaxonomyFields')[0]));
const mergeAdapterMatch = /export async function mergeTaxonomyFields[\s\S]*?^}/m.exec(adapterRaw);
check('mergeTaxonomyFields() adapter calls exactly one .rpc()', !!mergeAdapterMatch && (mergeAdapterMatch[0].match(/\.rpc\(/g) ?? []).length === 1);
check('mergeTaxonomyFields() adapter does not pre-check field existence before the RPC call (no .from(\'taxonomy_fields\').select before .rpc)', !/mergeTaxonomyFields[\s\S]*?\.from\('taxonomy_fields'\)\.select[\s\S]*?\.rpc\('merge_taxonomy_fields'/.test(adapterRaw));
check('listTaxonomyFields() uses a plain .from() query, not .rpc()', /export async function listTaxonomyFields[\s\S]*?\.from\('taxonomy_fields'\)/.test(adapterRaw) && !/export async function listTaxonomyFields[\s\S]*?\.rpc\(/.test(adapterRaw.split('export async function listTaxonomyFields')[1] ?? ''));

// --- GRANT: service_role only, no anon/authenticated ---
check('all 5 RPCs granted to service_role only (no anon/authenticated)', expectedFns.every(fn => new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\) TO service_role;`).test(rpc)) && !/TO (anon|authenticated)/.test(rpc));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
