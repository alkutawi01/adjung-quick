// ingest-classify-hook-static-audit.test.mjs — Polish P0-B.
//
// Static audit of the classify-after-ingest hook added to
// ingest-production.js. Not a live run (RSS fetch + lab/engine.js scoring +
// real staging tables are too heavy to fake meaningfully here, same
// reasoning db/edition-rules-static-audit.test.mjs gives for its own
// SQL-text-only approach) — instead proves, by parsing the real source,
// that the hook is wired where the director specified and fails the way
// the director specified, using the SAME real exported functions
// db/classify-production-p0b.test.mjs already proves work correctly in
// isolation.
//
// CRLF is normalised before any comment-stripping or ordering check — a
// `.` in a JS regex does not match `\r`, so on a CRLF checkout (this
// repo's actual line endings) an un-normalised strip leaves every comment
// intact and several earlier "does X appear before Y" checks in this
// project's own history passed by accident against a commented-out
// mention rather than real code. Normalising first is what makes this
// audit trustworthy rather than lucky.

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nINGEST -> CLASSIFY HOOK — static audit (P0-B)\n');

const raw = readFileSync('db/ingest-production.js', 'utf8').replace(/\r\n/g, '\n');
// Strip line comments (`//`) AFTER normalising CRLF, and block comments
// (`/* */`) too, so ordering checks below are measuring real statements,
// not prose that happens to mention the right words in the right order.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// --- Imports the REAL functions, not a re-implementation. ---
check('imports computeClassificationRows from classify-production.js',
  /import\s*\{[^}]*\bcomputeClassificationRows\b[^}]*\}\s*from\s*['"]\.\/classify-production\.js['"]/.test(code));
check('imports writeClassificationRows from classify-production.js',
  /import\s*\{[^}]*\bwriteClassificationRows\b[^}]*\}\s*from\s*['"]\.\/classify-production\.js['"]/.test(code));

// --- Call order: swap -> parity check -> classify. Located by real
// statement text, not proximity to a comment. ---
{
  const swapIdx = code.indexOf(`supabase.rpc('swap_ingestion_staging')`);
  const allPassIdx = code.indexOf('const allPass = clusterMatch && itemMatch && scoreMatch;');
  const computeIdx = code.indexOf('await computeClassificationRows(supabase)');
  const writeIdx = code.indexOf('await writeClassificationRows(supabase');

  check('the swap call is present', swapIdx !== -1);
  check('the parity computation is present', allPassIdx !== -1);
  check('computeClassificationRows() is called', computeIdx !== -1);
  check('writeClassificationRows() is called', writeIdx !== -1);
  check('classification runs AFTER the swap (never before production is live)',
    swapIdx !== -1 && computeIdx !== -1 && swapIdx < computeIdx);
  check('classification runs AFTER the parity check (never on unverified data)',
    allPassIdx !== -1 && computeIdx !== -1 && allPassIdx < computeIdx);
  // P0-B.1: the automatic hook is the exact scenario the stale-generation
  // guard exists for (a slow concurrent manual --write racing this
  // automatic call) -- if this call site ever stopped forwarding the
  // snapshot, the hook itself would be writing with no protection against
  // its own compute going stale mid-flight.
  check('writeClassificationRows() is called with the compute step\'s activeClusterIds as its 3rd argument (P0-B.1 stale-generation snapshot)',
    /writeClassificationRows\(supabase,\s*classification\.rows,\s*classification\.activeClusterIds\)/.test(code));
  check('rows are computed before they are written (compute -> write, not the other way round)',
    computeIdx !== -1 && writeIdx !== -1 && computeIdx < writeIdx);
}

// --- The parity-failure exit and the classification-failure exit are
// TWO DIFFERENT process.exit(1) sites with distinct messages — a reader
// of the logs must be able to tell "ingestion itself is suspect, maybe
// roll back" apart from "ingestion is fine, only classification lagged". ---
{
  const parityFailBlock = code.slice(code.indexOf('if (!allPass)'), code.indexOf('Running classification'));
  check('the parity-failure branch still tells the operator to consider a rollback',
    /rollback-ingestion-swap/.test(parityFailBlock));

  const classifyCatchBlock = code.slice(code.indexOf('} catch (err) {', code.indexOf('writeClassificationRows(supabase')), code.indexOf('}\n}\n\nmain()'));
  check('a classification failure explicitly does NOT tell the operator to roll back the swap',
    !/rollback-ingestion-swap/.test(classifyCatchBlock));
  check('a classification failure explicitly states ingestion itself is fine',
    /ingestion IS live and correct/.test(classifyCatchBlock) || /Production ingestion IS live/.test(classifyCatchBlock));
  check('a classification failure states the previous classification data was NOT partially overwritten',
    /untouched/.test(classifyCatchBlock) || /never partially/.test(classifyCatchBlock));
  check('a classification failure exits non-zero so the caller (human or future scheduler) sees it',
    /process\.exit\(1\)/.test(classifyCatchBlock));
  check('a classification failure names the manual recovery command',
    /classify-production\.js --write/.test(classifyCatchBlock));
}

// --- The hook is INSIDE main(), reachable only past the DRY_RUN early
// return, never on a --dry-run invocation. ---
{
  const dryRunReturnIdx = code.indexOf("DRY RUN — stopping before swap, per --dry-run. Production untouched.");
  const computeIdx = code.indexOf('await computeClassificationRows(supabase)');
  check('the dry-run early return is textually before the classification call (dry-run never reaches it)',
    dryRunReturnIdx !== -1 && computeIdx !== -1 && dryRunReturnIdx < computeIdx);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
