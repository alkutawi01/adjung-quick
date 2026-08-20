// classification-atomic-replace-static-audit.test.mjs — static audit for
// schema-classification-atomic-replace-rpc-v1.sql (P0-B).
//
// No local Postgres available (same constraint every prior RPC migration
// audit in this file's family notes — see edition-rules-static-audit.test.mjs
// for the same pattern). Proves, by parsing the SQL text directly: the
// function performs DELETE+INSERT as ONE statement pair inside a single
// function body (the actual atomicity fix), refuses an empty batch rather
// than treating it as "wipe everything", replaces the FULL table rather
// than being scoped to one edition (matching the script it replaces), and
// is locked to service_role only — same security posture as every other
// write RPC in this project.

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}`); failed++; }
}

console.log('\nCLASSIFICATION ATOMIC REPLACE RPC — static audit (P0-B)\n');

function stripSqlComments(sql) {
  return sql.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

const raw = readFileSync('db/schema-classification-atomic-replace-rpc-v1.sql', 'utf8');
const sql = stripSqlComments(raw);
const fnBody = sql.slice(sql.indexOf('FUNCTION replace_edition_story_classifications'), sql.indexOf('$$;'));

// --- The actual atomicity fix: exactly one function, DELETE then INSERT,
// both statements inside its body (one Postgres implicit transaction). ---
{
  const fnNames = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map(m => m[1]);
  check('exactly one RPC function defined', fnNames.length === 1 && fnNames[0] === 'replace_edition_story_classifications');
  check('function body contains a DELETE FROM edition_story_classifications', /DELETE FROM edition_story_classifications/.test(fnBody));
  check('function body contains an INSERT INTO edition_story_classifications', /INSERT INTO edition_story_classifications/.test(fnBody));
  check('the DELETE textually precedes the INSERT (old rows cleared before new ones land)',
    fnBody.indexOf('DELETE FROM edition_story_classifications') < fnBody.indexOf('INSERT INTO edition_story_classifications'));
  check('no explicit BEGIN/COMMIT/ROLLBACK inside the function body (a single PL/pgSQL function call is already one implicit transaction — matches swap_ingestion_staging()\'s own documented reasoning)',
    !/\bBEGIN\s+TRANSACTION\b|\bCOMMIT\s*;|\bROLLBACK\b/i.test(fnBody));
}

// --- Concurrency: two writers (a human's --write + the automatic
// post-ingest hook) are serialized, not left to race into a raw PK
// collision. ---
{
  check('the function takes a transaction-scoped advisory lock (pg_advisory_xact_lock)',
    /pg_advisory_xact_lock\(/.test(fnBody));
  check('the lock is acquired BEFORE the DELETE (a concurrent caller waits, rather than both racing into the DELETE/INSERT)',
    fnBody.indexOf('pg_advisory_xact_lock(') !== -1
    && fnBody.indexOf('pg_advisory_xact_lock(') < fnBody.indexOf('DELETE FROM edition_story_classifications'));
  check('the lock key is derived from the function\'s own name (hashtext), not a magic number with no documented meaning',
    /hashtext\('replace_edition_story_classifications'\)/.test(fnBody));
}

// --- P0-B.1: the stale-generation guard the director required before
// approving this migration. Checked AFTER the lock, BEFORE the DELETE --
// wrong-ordered, it would either compare against a state a concurrent
// writer could still change (before the lock) or check too late (after
// data is already gone). No force/bypass parameter -- director's explicit
// instruction that this check is never optional, unlike the row-count
// floor. ---
{
  check('the function signature takes p_expected_story_ids as a second parameter',
    /CREATE OR REPLACE FUNCTION replace_edition_story_classifications\(\s*p_rows JSONB,\s*p_expected_story_ids TEXT\[\]/.test(sql));
  const lockIdx = fnBody.indexOf('pg_advisory_xact_lock(');
  const guardIdx = fnBody.indexOf('EXCEPT');
  const deleteIdx = fnBody.indexOf('DELETE FROM edition_story_classifications');
  check('the stale-generation guard is present (compares live story_clusters against the snapshot)',
    guardIdx !== -1 && /SELECT id FROM story_clusters WHERE workspace_state NOT IN \('expired', 'released'\)/.test(fnBody));
  check('the guard runs AFTER the advisory lock is acquired (compares against a now-settled state, not one a concurrent writer could still change)',
    lockIdx !== -1 && guardIdx !== -1 && lockIdx < guardIdx);
  check('the guard runs BEFORE the DELETE (rejection happens before any data is touched)',
    guardIdx !== -1 && deleteIdx !== -1 && guardIdx < deleteIdx);
  // Adversarial review: merely counting 2 EXCEPTs does not prove they
  // check OPPOSITE directions -- a mutation with both EXCEPT clauses
  // reading live-minus-expected TWICE (silently dropping the
  // disappeared-cluster check) still passed a "count >= 2" test. Each
  // EXCEPT block is isolated and its LEFT/RIGHT operand order is checked
  // directly: block 1 must be (live) EXCEPT (expected), block 2 must be
  // (expected) EXCEPT (live) -- the two blocks are REQUIRED to disagree
  // on which side story_clusters is on, or this fails.
  {
    const exceptBlocks = fnBody.split(/\bEXCEPT\b/).slice(0, -1); // last chunk has no EXCEPT after it
    check('exactly 2 EXCEPT clauses in the guard (not 1, not 3+)', exceptBlocks.length === 2,
      `found ${exceptBlocks.length}`);
    if (exceptBlocks.length === 2) {
      // For each EXCEPT, the operand immediately BEFORE it is the "left"
      // side -- take the tail of that chunk (the nearest preceding SELECT)
      // to identify which table it queries.
      const leftOperandIsLive = chunk => {
        const lastSelect = chunk.slice(chunk.lastIndexOf('SELECT'));
        return /story_clusters/.test(lastSelect) && !/unnest/.test(lastSelect);
      };
      const leftOperandIsExpected = chunk => {
        const lastSelect = chunk.slice(chunk.lastIndexOf('SELECT'));
        return /unnest\(p_expected_story_ids\)/.test(lastSelect);
      };
      check('EXCEPT #1\'s LEFT side is the LIVE set (story_clusters) -- catches "something disappeared from live since compute"',
        leftOperandIsLive(exceptBlocks[0]));
      check('EXCEPT #2\'s LEFT side is the EXPECTED set (the snapshot) -- catches "something NEW appeared in live since compute"',
        leftOperandIsExpected(exceptBlocks[1]));
      check('the two EXCEPT clauses do NOT both read the same direction (would silently drop one half of the check)',
        leftOperandIsLive(exceptBlocks[0]) !== leftOperandIsLive(exceptBlocks[1]));
    }
  }
  check('a mismatch raises an exception naming the real cause, not a generic error',
    /data berita berubah sejak pengelasan dikira/.test(fnBody));
  check('there is no force/bypass parameter for this specific guard (director: never optional, unlike the row-count floor)',
    !/p_force/i.test(sql) && !/skip.*stale/i.test(sql));
}

// --- Refuses an empty batch rather than silently wiping every classification. ---
{
  check('raises an exception when p_rows is NULL or an empty array',
    /IF p_rows IS NULL OR jsonb_array_length\(p_rows\) = 0 THEN/.test(fnBody));
  check('the empty-batch check runs BEFORE the DELETE (never deletes, THEN discovers there is nothing to insert)',
    fnBody.indexOf('jsonb_array_length(p_rows) = 0') < fnBody.indexOf('DELETE FROM edition_story_classifications'));
  check('the exception message says why, so a caller reading logs understands the refusal',
    /refusing to write 0 rows/.test(fnBody));
}

// --- Full-table replace, matching classify-production.js's own semantics
// (it computes rows for every edition in one pass) — NOT scoped to one
// edition_id, which would silently wipe every OTHER edition's rows if a
// future caller ever computed only a subset. ---
{
  check('the DELETE has no WHERE clause scoping it to one edition_id (full-table replace, by design)',
    !/DELETE FROM edition_story_classifications\s+WHERE/i.test(fnBody));
  // Checked against the RAW file, not the comment-stripped copy — this is
  // a documentation-presence check, and stripSqlComments() deletes exactly
  // the `--` comment text this assertion is looking for.
  check('the file documents that a partial-edition caller must not use this function',
    /must NOT call this function/.test(raw) || /silently drop every other edition/i.test(raw));
}

// --- Confidence coercion doesn't crash the whole batch on a missing/empty value. ---
{
  check('classification_confidence uses COALESCE + NULLIF, never a bare ::numeric cast on possibly-empty text',
    /COALESCE\(NULLIF\(r->>'classification_confidence', ''\)::numeric, 0\)/.test(fnBody));
}

// --- Security: same posture as every other write RPC in this project
// (schema-edition-rules-rpc-v1.sql, schema-ingestion-staging-functions-v1.sql). ---
{
  check('SECURITY DEFINER with search_path pinned to public (prevents the classic search-path hijack)',
    /SECURITY DEFINER\s+SET search_path = public/.test(fnBody) || /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/.test(sql));
  check('REVOKE EXECUTE FROM PUBLIC is present, in the same file as the GRANT',
    /REVOKE EXECUTE ON FUNCTION replace_edition_story_classifications\(JSONB, TEXT\[\]\) FROM PUBLIC/.test(sql));
  check('GRANT EXECUTE is scoped to service_role ONLY',
    /GRANT EXECUTE ON FUNCTION replace_edition_story_classifications\(JSONB, TEXT\[\]\) TO service_role\s*;/.test(sql));
  check('no anon or authenticated grant anywhere in the file (this is a service-role-only internal write path, unlike edition_rules\' admin-UI RPCs)',
    !/TO anon\b/i.test(sql) && !/TO authenticated\b/i.test(sql));
}

// --- THE JS<->SQL COLUMN CONTRACT. Adversarial review proved by mutation
// (renaming the SQL's r->>'sub_field' to r->>'subField') that NEITHER
// this file nor classify-production-p0b.test.mjs's fully-faked rpc() would
// catch a column-name mismatch on either side — `r->>'wrong_key'` returns
// SQL NULL, not an error, so a typo/rename silently inserts NULL for a
// real value forever, with zero signal. This closes that gap directly:
// extracts the JS row-builder's own key list and the SQL's INSERT column
// list + SELECT r->>'x' extraction list, and asserts all three are the
// SAME NAMES IN THE SAME ORDER — order matters because `INSERT INTO t
// (a,b,c) SELECT x,y,z` maps POSITIONALLY; a same-set-wrong-order bug
// (e.g. field_code and subject_code swapped on one side only) would pass
// a set-equality check while still corrupting every row. ---
{
  const jsSrc = readFileSync('db/classify-production.js', 'utf8').replace(/\r\n/g, '\n');
  const pushStart = jsSrc.indexOf('rows.push({');
  const pushEnd = jsSrc.indexOf('});', pushStart);
  const pushBlock = jsSrc.slice(pushStart, pushEnd);
  // One key per line, of the form `key: value,` — comments (the Taxonomy
  // Stable Field-ID note) are excluded by requiring the line to actually
  // contain a colon-value pair, not just matching any word.
  const jsKeys = [...pushBlock.matchAll(/^\s*(\w+):\s*[\w.??]+,?\s*$/gm)].map(m => m[1]);

  const insertCols = sql.slice(sql.indexOf('INSERT INTO edition_story_classifications ('), sql.indexOf(')', sql.indexOf('INSERT INTO edition_story_classifications (')))
    .replace('INSERT INTO edition_story_classifications (', '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // The SELECT clause between the INSERT's column list and `FROM
  // jsonb_array_elements` -- each line is either a bare `r->>'key'` or
  // (for classification_confidence) wrapped in COALESCE(NULLIF(...)),
  // so the key is pulled out via the r->>'KEY' pattern wherever it
  // appears on the line, not by assuming a fixed shape per line.
  const selectClause = fnBody.slice(fnBody.indexOf('SELECT'), fnBody.indexOf('FROM jsonb_array_elements'));
  const selectKeys = [...selectClause.matchAll(/r->>'(\w+)'/g)].map(m => m[1]);

  check('extracted at least 10 keys from the JS row builder (sanity check on the extraction regex itself)',
    jsKeys.length >= 10, `got ${jsKeys.length}: ${jsKeys.join(',')}`);
  check('extracted the same NUMBER of columns from SQL INSERT as from JS',
    insertCols.length === jsKeys.length, `INSERT has ${insertCols.length}, JS has ${jsKeys.length}`);
  check('extracted the same NUMBER of r->>\'x\' extractions from SQL SELECT as from JS',
    selectKeys.length === jsKeys.length, `SELECT has ${selectKeys.length}, JS has ${jsKeys.length}`);
  check('JS row-builder keys and SQL INSERT column list are IDENTICAL, IN THE SAME ORDER',
    JSON.stringify(jsKeys) === JSON.stringify(insertCols),
    `JS: [${jsKeys.join(', ')}]  SQL INSERT: [${insertCols.join(', ')}]`);
  check('JS row-builder keys and SQL SELECT r->>\'x\' extraction list are IDENTICAL, IN THE SAME ORDER',
    JSON.stringify(jsKeys) === JSON.stringify(selectKeys),
    `JS: [${jsKeys.join(', ')}]  SQL SELECT: [${selectKeys.join(', ')}]`);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
