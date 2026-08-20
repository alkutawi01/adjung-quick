// pagination-order-static-audit.test.mjs — Polish 9A.
//
// Static audit of the .order() calls added to ingest-production.js's and
// reviewQueueAdapter.js's selectAllChunked() implementations
// (docs/p0-classification-backlog-incident-v1.md). classify-production.js's
// version is already functionally proven in classify-production-p0b.test.mjs
// (a fake client that records which column each .order() call named) —
// this file covers the other two, which can't be exercised the same way
// without a live DB: ingest-production.js creates a real Supabase client
// at module load and does real RSS/network work in main(), and
// reviewQueueAdapter.js's caller (the Admin UI) is already covered
// end-to-end in ui/src/admin/classificationBacklog.test.mjs, but that
// suite's fake client didn't previously track .order() calls either.
// Same "static/fixture test, no DB" posture as
// edition-rules-static-audit.test.mjs and ingest-classify-hook-static-
// audit.test.mjs already state for the same reason.
//
// CRLF is normalised before any comment-stripping or matching — see the
// same header comment in ingest-classify-hook-static-audit.test.mjs for
// why this matters on this repo's actual (CRLF) checkout.
//
// Run: node db/pagination-order-static-audit.test.mjs

import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function loadStrippedSource(path) {
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
}

console.log('\nPAGINATION ORDER — static audit (Polish 9A)\n');

// --- ingest-production.js: selectAllChunked() itself must call .order()
// before .range(), and every one of its 5 call sites must pass an explicit
// orderBy naming that table's real PRIMARY KEY (all 'id' — verified
// against db/schema.sql and db/schema-identity.sql). Explicit at every
// call site, not just relying on the function's default, per the
// director's "jangan tambah .order() secara rawak" instruction — a
// reader auditing one call site shouldn't have to go check the function
// signature's default to know what column governs its pagination. ---
{
  const code = loadStrippedSource('db/ingest-production.js');

  const fnStart = code.indexOf('async function selectAllChunked(');
  const fnEnd = code.indexOf('\n}\n', fnStart);
  const fnBody = code.slice(fnStart, fnEnd);

  check('selectAllChunked() takes an orderBy parameter, defaulting to \'id\'',
    /async function selectAllChunked\(table, columns, applyFilter, orderBy = 'id'\)/.test(fnBody));
  check('selectAllChunked() calls .order(orderBy, { ascending: true }) before .range()',
    /q\.order\(orderBy, \{ ascending: true \}\)/.test(fnBody) && fnBody.indexOf('.order(orderBy') < fnBody.indexOf('.range('));

  const callSites = [
    { label: "saved_stories (PK: id)", pattern: /selectAllChunked\('saved_stories', 'story_id', q => q\.gt\('expires_at', nowIso\), 'id'\)/ },
    { label: "history_entries (PK: id)", pattern: /selectAllChunked\('history_entries', 'story_id', q => q\.gt\('expires_at', nowIso\), 'id'\)/ },
    { label: "story_clusters carry-forward read (PK: id)", pattern: /selectAllChunked\('story_clusters', '\*', q => q\.in\('id', toCarryForward\), 'id'\)/ },
    { label: "rss_items carry-forward read (PK: id)", pattern: /selectAllChunked\('rss_items', '\*', q => q\.eq\('cluster_id', id\), 'id'\)/ },
    { label: "story_clusters_staging protected-check read (PK: id)", pattern: /selectAllChunked\('story_clusters_staging', 'id', undefined, 'id'\)/ },
  ];
  for (const { label, pattern } of callSites) {
    check(`ingest-production.js: ${label} passes an explicit orderBy`, pattern.test(code));
  }
}

// --- reviewQueueAdapter.js: same shape, but edition_story_classifications'
// real PRIMARY KEY is the COMPOSITE (story_id, edition_id) — story_id
// alone repeats across rows (one story has a row per eligible edition), so
// ordering by story_id alone isn't a total order on its own. That call
// site must pass BOTH columns, not just the first. ---
{
  const code = loadStrippedSource('ui/src/admin/reviewQueueAdapter.js');

  const fnStart = code.indexOf('async function selectAllChunked(');
  const fnEnd = code.indexOf('\n}\n', fnStart);
  const fnBody = code.slice(fnStart, fnEnd);

  check('selectAllChunked() takes an orderBy parameter, defaulting to \'id\'',
    /async function selectAllChunked\(supabase, table, columns, orderBy = 'id'\)/.test(fnBody));
  check('selectAllChunked() normalises orderBy to an array (supports a composite key)',
    /Array\.isArray\(orderBy\)/.test(fnBody));
  check('selectAllChunked() calls .order() for every column before .range()',
    /for \(const col of orderCols\) q = q\.order\(col, \{ ascending: true \}\)/.test(fnBody)
    && fnBody.indexOf('orderCols) q = q.order') < fnBody.indexOf('.range('));

  check('story_clusters call orders by its real primary key (id)',
    /selectAllChunked\(supabase, 'story_clusters', 'id, workspace_state', 'id'\)/.test(code));
  check('edition_story_classifications call orders by its COMPOSITE primary key (story_id, edition_id), not story_id alone',
    /selectAllChunked\(supabase, 'edition_story_classifications', 'story_id', \['story_id', 'edition_id'\]\)/.test(code));
}

// --- db/daily-observation.mjs and db/snapshot-production.mjs: two MORE
// independent selectAllChunked() implementations an adversarial review
// found were missed the first time this audit was written — the exact
// "same tier/pattern must be treated uniformly" failure CLAUDE.md warns
// about (3 of 5 occurrences fixed, 2 missed). snapshot-production.mjs in
// particular is a backup/disaster-recovery snapshot — a silently dropped
// row there is a silent hole in the one artifact meant to make data
// recoverable, arguably higher stakes than any call site fixed first. ---
{
  const code = loadStrippedSource('db/daily-observation.mjs');

  const fnStart = code.indexOf('async function selectAllChunked(');
  const fnEnd = code.indexOf('\n}\n', fnStart);
  const fnBody = code.slice(fnStart, fnEnd);

  check('daily-observation.mjs: selectAllChunked() takes an orderBy parameter, defaulting to \'id\'',
    /async function selectAllChunked\(table, columns, orderBy = 'id'\)/.test(fnBody));
  check('daily-observation.mjs: selectAllChunked() calls .order() ascending for every column before .range()',
    /for \(const col of orderCols\) q = q\.order\(col, \{ ascending: true \}\)/.test(fnBody)
    && fnBody.indexOf('orderCols) q = q.order') < fnBody.indexOf('.range('));

  const callSites = [
    { label: 'sources (PK: id)', pattern: /selectAllChunked\('sources', 'id, name, status', 'id'\)/ },
    { label: 'story_clusters (PK: id)', pattern: /selectAllChunked\('story_clusters', 'id', 'id'\)/ },
    { label: 'rss_items (PK: id)', pattern: /selectAllChunked\('rss_items', 'id, source_id, published_at', 'id'\)/ },
    { label: 'edition_story_classifications (COMPOSITE PK: story_id, edition_id)', pattern: /selectAllChunked\('edition_story_classifications', '[^']+', \['story_id', 'edition_id'\]\)/ },
    { label: 'saved_stories (PK: id)', pattern: /selectAllChunked\('saved_stories', 'id', 'id'\)/ },
    { label: 'history_entries (PK: id)', pattern: /selectAllChunked\('history_entries', 'id', 'id'\)/ },
  ];
  for (const { label, pattern } of callSites) {
    check(`daily-observation.mjs: ${label} passes an explicit orderBy`, pattern.test(code));
  }
}
{
  const code = loadStrippedSource('db/snapshot-production.mjs');

  const fnStart = code.indexOf('async function selectAllChunked(');
  const fnEnd = code.indexOf('\n}\n', fnStart);
  const fnBody = code.slice(fnStart, fnEnd);

  check('snapshot-production.mjs: selectAllChunked() takes an orderBy parameter (after the pre-existing retry `attempts` param), defaulting to \'id\'',
    /async function selectAllChunked\(table, columns, attempts = 3, orderBy = 'id'\)/.test(fnBody));
  check('snapshot-production.mjs: selectAllChunked() calls .order() ascending for every column before .range()',
    /for \(const col of orderCols\) q = q\.order\(col, \{ ascending: true \}\)/.test(fnBody)
    && fnBody.indexOf('orderCols) q = q.order') < fnBody.indexOf('.range('));

  const callSites = [
    { label: 'sources (PK: id)', pattern: /selectAllChunked\('sources', '[^']+', 3, 'id'\)/ },
    { label: 'story_clusters (PK: id)', pattern: /selectAllChunked\('story_clusters', '[^']+', 3, 'id'\)/ },
    { label: 'rss_items (PK: id)', pattern: /selectAllChunked\('rss_items', '[^']+', 3, 'id'\)/ },
    { label: 'edition_story_classifications (COMPOSITE PK: story_id, edition_id)', pattern: /selectAllChunked\('edition_story_classifications', '[^']+', 3, \['story_id', 'edition_id'\]\)/ },
    { label: 'saved_stories (PK: id)', pattern: /selectAllChunked\('saved_stories', '[^']+', 3, 'id'\)/ },
    { label: 'history_entries (PK: id)', pattern: /selectAllChunked\('history_entries', '[^']+', 3, 'id'\)/ },
  ];
  for (const { label, pattern } of callSites) {
    check(`snapshot-production.mjs: ${label} passes an explicit orderBy`, pattern.test(code));
  }
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
