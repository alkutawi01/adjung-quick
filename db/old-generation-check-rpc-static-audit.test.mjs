// old-generation-check-rpc-static-audit.test.mjs — Polish 9D-2.
//
// Static audit for schema-old-generation-check-rpc-v1.sql. No local
// Postgres available (same constraint every prior RPC migration audit in
// this project states — see edition-rules-static-audit.test.mjs). Proves,
// by parsing the SQL text directly: the function mirrors
// swap_ingestion_staging()'s own real existence-check idiom exactly (not
// a re-implementation that could quietly drift), returns a boolean only
// (no data exposure), and is locked to `authenticated` only — narrower
// than the service_role-only posture of every WRITE RPC in this project,
// appropriate since this is a read-only fact check called directly from
// the Admin UI (which authenticates as `authenticated`, never `anon` or
// `service_role`).
//
// Run: node db/old-generation-check-rpc-static-audit.test.mjs

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nOLD GENERATION CHECK RPC — static audit (Polish 9D-2)\n');

function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

const raw = readFileSync('db/schema-old-generation-check-rpc-v1.sql', 'utf8');
const sql = stripSqlComments(raw);

{
  const fnNames = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map(m => m[1]);
  check('exactly one RPC function defined', fnNames.length === 1 && fnNames[0] === 'check_old_generation_exists');
}

const fnBody = sql.slice(sql.indexOf('FUNCTION check_old_generation_exists'), sql.indexOf('$$;'));

check('the function returns BOOLEAN, not a row/table (no data exposure by construction)',
  /RETURNS BOOLEAN/i.test(sql));

// The real, load-bearing check: this must cover the SAME SET of tables
// swap_ingestion_staging() itself guards against, read directly from the
// real swap function's own source — a re-implementation (e.g.
// information_schema.tables, or checking only ONE of the three tables)
// could silently drift out of sync with what actually blocks a swap.
// Adversarial review caught an earlier version of this RPC checking only
// story_clusters_old — this file's own earlier version only regex-matched
// that one substring in both files, so it couldn't have caught the gap
// either. This extracts the real guard's IF...OR...OR...THEN condition
// block directly and confirms EVERY table name it mentions is also
// checked in the new RPC, not just one.
{
  const swapSql = readFileSync('db/schema-ingestion-staging-functions-v1.sql', 'utf8');
  const guardMatch = swapSql.match(/IF\s+to_regclass\([^)]+\)\s+IS\s+NOT\s+NULL(?:\s+OR\s+to_regclass\([^)]+\)\s+IS\s+NOT\s+NULL)*\s+THEN/is);
  check("swap_ingestion_staging()'s own real guard block was found (sanity check on what this audit compares against)",
    guardMatch !== null);

  const guardTables = guardMatch ? [...guardMatch[0].matchAll(/to_regclass\('public\.(\w+)'\)/g)].map(m => m[1]) : [];
  check('the real guard checks more than one table (proves this is genuinely a multi-table OR, not a single check -- otherwise this whole audit section is testing nothing)',
    guardTables.length >= 2);

  for (const table of guardTables) {
    check(`check_old_generation_exists() also checks '${table}' (every table the real swap guard blocks on, not just one)`,
      new RegExp(`to_regclass\\('public\\.${table}'\\)\\s+IS\\s+NOT\\s+NULL`, 'i').test(fnBody));
  }

  // The inverse direction matters too: the RPC must not check EXTRA
  // tables the real guard doesn't (which would false-positive the
  // indicator on something that doesn't actually block a swap).
  const rpcTables = [...fnBody.matchAll(/to_regclass\('public\.(\w+)'\)/g)].map(m => m[1]);
  check('check_old_generation_exists() checks EXACTLY the same set of tables as the real guard -- no fewer, no extra',
    rpcTables.length === guardTables.length && guardTables.every(t => rpcTables.includes(t)));
}

check('SECURITY DEFINER with search_path pinned to public (prevents the classic search-path hijack)',
  /SECURITY DEFINER\s+SET search_path = public/.test(sql));

check('REVOKE EXECUTE FROM PUBLIC is present, in the same file as the GRANT',
  /REVOKE EXECUTE ON FUNCTION check_old_generation_exists\(\) FROM PUBLIC/.test(sql));

check('GRANT EXECUTE is scoped to authenticated ONLY',
  /GRANT EXECUTE ON FUNCTION check_old_generation_exists\(\) TO authenticated;/.test(sql)
  && !/GRANT EXECUTE ON FUNCTION check_old_generation_exists\(\) TO (anon|service_role|public)/i.test(sql));

check('no anon or service_role grant anywhere in the file',
  !/TO anon\b/i.test(sql) && !/TO service_role\b/i.test(sql));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
