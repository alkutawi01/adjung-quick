// reader-adapter-pagination-static-audit.test.mjs — 2026-08-21.
//
// Guards the fix for a LIVE reader-facing bug found during the Global
// Edition v1 Release Readiness Audit: ui/src/adapter/productionAdapter.js
// read story_clusters and rss_items with a plain .select(), so PostgREST's
// ~1000-row default cap silently truncated the reader's data. Measured at
// the time: rss_items had 1052 rows, the reader received 1000, and the 52
// clusters whose members fell past the boundary arrived with ZERO members.
// Reader-visible symptom: ar-global تكنولوجيا showed 4 of its 10 real
// stories (AITNews, the newest source, sat past the cut).
//
// This project had already fixed the identical bug in three other files
// (ingest-production.js, reviewQueueAdapter.js, classify-production.js) —
// the READER was the one path nobody had checked. That is exactly why this
// is a static audit rather than a runtime test: the failure mode is "a
// query silently reverted to an unpaginated .select()", which no
// integration test against a <1000-row fixture would ever catch.
//
// Static-parse audit (same technique as db/ingest-classify-hook-static-
// audit.test.mjs and db/pagination-order-static-audit.test.mjs): assert
// against the REAL source text, not a re-implementation.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'ui', 'src', 'adapter', 'productionAdapter.js');
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
// Strip comments so a table name merely MENTIONED in prose can never
// satisfy (or break) an assertion about real code.
const code = raw
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n');

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nREADER ADAPTER PAGINATION — static audit (2026-08-21)\n');

// --- The helper must exist and be real. ---
check('selectAllChunked() helper is defined in the reader adapter',
  /async function selectAllChunked\s*\(/.test(code));
check('...and paginates with .range(), not a bare .select()',
  /\.range\(\s*from\s*,\s*from\s*\+\s*CHUNK_PAGE\s*-\s*1\s*\)/.test(code));
check('...and advances the cursor (from += CHUNK_PAGE)',
  /from\s*\+=\s*CHUNK_PAGE/.test(code));
check('...and stops only on a short page (data.length < CHUNK_PAGE)',
  /data\.length\s*<\s*CHUNK_PAGE/.test(code));
check('...and applies an explicit .order() before ranging (Polish 9A: range() across separate requests has no ordering guarantee otherwise)',
  /q\s*=\s*q\.order\(\s*col\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/.test(code));

// --- The three corpus-scaled tables MUST go through it. Each of these
// grows with the corpus, so each will cross 1000 rows on its own clock. ---
for (const table of ['story_clusters', 'rss_items', 'edition_story_classifications']) {
  const chunked = new RegExp(`selectAllChunked\\(\\s*\\(\\)\\s*=>\\s*supabase\\s*\\.?\\s*from\\('${table}'\\)`).test(code);
  check(`${table} is read through selectAllChunked()`, chunked);

  // And must NOT also appear as a bare, unpaginated read.
  const bare = new RegExp(`(?<!selectAllChunked\\(\\(\\) => )supabase\\.from\\('${table}'\\)\\.select\\(`).test(code);
  check(`${table} has NO remaining bare unpaginated supabase.from(...).select(...) read`, !bare);
}

// --- Ordering columns must be real primary keys, so pagination is stable.
// edition_story_classifications' PK is (story_id, edition_id); that query is
// already .eq()-filtered to one edition, which makes story_id unique there. ---
check('story_clusters paginates ordered by its primary key `id`',
  /selectAllChunked\([\s\S]{0,400}?from\('story_clusters'\)[\s\S]{0,300}?,\s*'id'\s*\)/.test(code));
check('rss_items paginates ordered by its primary key `id`',
  /selectAllChunked\([\s\S]{0,400}?from\('rss_items'\)[\s\S]{0,400}?,\s*'id'\s*\)/.test(code));
check('edition_story_classifications paginates ordered by `story_id` (unique under its .eq(edition_id) filter)',
  /selectAllChunked\([\s\S]{0,500}?from\('edition_story_classifications'\)[\s\S]{0,400}?,\s*'story_id'\s*\)/.test(code));

// --- The regression this guards must stay documented where the next
// person reading the query block will actually see it. ---
check('the 1000-row cap and its live symptom are documented in the source',
  /1000/.test(raw) && /PostgREST/.test(raw));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
