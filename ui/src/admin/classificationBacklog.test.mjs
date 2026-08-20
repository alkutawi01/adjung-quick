// classificationBacklog.test.mjs — Polish P0-B.
//
// Two things, both proven functionally rather than by regex:
//   1. fetchClassificationBacklog() (ui/src/admin/reviewQueueAdapter.js) --
//      counts a cluster as backlog only if it has NO classification row in
//      ANY edition, never per-edition, and only among LIVE clusters.
//   2. AdminDigest.jsx renders the indicator correctly for each state
//      (loading/hidden, verified zero, real backlog) and a real backlog
//      breaks the "Tiada apa-apa perlu perhatian hari ini" all-clear
//      banner even when every other digest field is clean -- the exact
//      thing this indicator exists to prevent (408 invisible stories while
//      the panel claimed nothing needed attention).
//
// Run: node ui/src/admin/classificationBacklog.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchClassificationBacklog } from './reviewQueueAdapter.js';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nCLASSIFICATION BACKLOG INDICATOR — adapter + panel (Polish P0-B)\n');

// --- fetchClassificationBacklog(): fake client, same thenable-builder
// pattern as db/classify-production-p0b.test.mjs. ---
// fetchClassificationBacklog() now reads through selectAllChunked()
// (adversarial review caught the original unpaginated read -- this exact
// codebase has already hit PostgREST's ~1000-row cap on this very table
// once), so the fake query must answer .range() too. Fixtures here are
// well under one page, so a single .range() call returning the full set
// is realistic -- the chunking LOOP itself is exercised for real against
// production data, not re-simulated with a fake multi-page dataset here.
function makeQuery(data, error = null) {
  const q = { select: () => q, range: () => q, then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject) };
  return q;
}
function fakeSupabase({ story_clusters = [], edition_story_classifications = [] }) {
  const tables = { story_clusters, edition_story_classifications };
  return { from(table) { return makeQuery(tables[table] ?? []); } };
}

{
  // 5 live clusters, 1 expired, 1 released. Of the 5 live: 'a' has an
  // ms-MY row, 'b' has an en-global row ONLY (still counts as classified --
  // it went through the pipeline, just landed eligible for a different
  // edition), 'c'/'d'/'e' have no row anywhere (real backlog).
  const clusters = [
    { id: 'a', workspace_state: 'active' },
    { id: 'b', workspace_state: 'active' },
    { id: 'c', workspace_state: 'active' },
    { id: 'd', workspace_state: 'active' },
    { id: 'e', workspace_state: 'queued' },
    { id: 'f-expired', workspace_state: 'expired' },
    { id: 'g-released', workspace_state: 'released' },
  ];
  const classifications = [
    { story_id: 'a' }, // ms-MY row (edition_id irrelevant to this fixture)
    { story_id: 'b' }, // en-global row only -- still "classified", not backlog
    { story_id: 'f-expired' }, // has a row but is expired -- must not count as live
  ];
  const client = fakeSupabase({ story_clusters: clusters, edition_story_classifications: classifications });
  const result = await fetchClassificationBacklog(client);

  assert('live cluster count excludes expired/released (5 of 7)', result.liveClusterCount === 5);
  assert('backlog counts only live clusters with ZERO rows in ANY edition (c, d, e = 3)',
    result.backlogCount === 3);
  assert('a cluster classified under a DIFFERENT edition only still counts as classified (b is not backlog)',
    result.backlogCount === 3); // would be 4 if per-edition scoping leaked in
}
{
  // All live clusters classified -> genuinely zero, not a default/fallback zero.
  const client = fakeSupabase({
    story_clusters: [{ id: 'x', workspace_state: 'active' }],
    edition_story_classifications: [{ story_id: 'x' }],
  });
  const result = await fetchClassificationBacklog(client);
  assert('a fully-classified corpus reports backlogCount 0, not null/undefined', result.backlogCount === 0);
}

// --- Pagination itself, exercised for real (not just a single-page no-op
// like the fixtures above) -- the exact gap an adversarial review found:
// the original version of this function read story_clusters and
// edition_story_classifications with no .range() at all, which
// PostgREST silently truncates at ~1000 rows once a table exceeds one
// page. This project has hit that exact cap on this exact table before
// (a stale comment in classify-production.js's own history cites 2595
// rows observed live). A fake here that tracks real .range() offsets and
// returns a full page (1000) then a partial final page (proving the loop
// terminates on `data.length < CHUNK_PAGE`, not on a fixed number of
// calls) is the only way to prove the chunking LOOP itself is correct,
// not merely that a page-sized-or-smaller fixture happens to work. ---
{
  const PAGE = 1000;
  const totalClusters = PAGE + 42; // forces exactly 2 pages
  const allClusters = Array.from({ length: totalClusters }, (_, i) => ({ id: `c${i}`, workspace_state: 'active' }));
  // Half of them classified, spread across BOTH pages -- proves rows from
  // page 2 are actually reachable by the backlog count, not silently
  // dropped the way an unpaginated read would drop everything past row 1000.
  const classified = allClusters.filter((_, i) => i % 2 === 0).map(c => ({ story_id: c.id }));

  let clusterCalls = 0, classifiedCalls = 0;
  const pagedClient = {
    from(table) {
      const source = table === 'story_clusters' ? allClusters : classified;
      const q = {
        select: () => q,
        range(from, to) {
          if (table === 'story_clusters') clusterCalls++; else classifiedCalls++;
          return { then: (resolve) => resolve({ data: source.slice(from, to + 1), error: null }) };
        },
      };
      return q;
    },
  };
  const result = await fetchClassificationBacklog(pagedClient);

  assert('story_clusters required exactly 2 .range() calls to exhaust (1000 + 42, not silently stopping at page 1)',
    clusterCalls === 2);
  assert('edition_story_classifications required exactly 1 .range() call (its own count is under one page)',
    classifiedCalls === 1);
  assert('the FULL cluster count is reflected, including everything past row 1000',
    result.liveClusterCount === totalClusters);
  assert('backlog correctly reflects classified rows from BOTH pages, not just page 1',
    result.backlogCount === totalClusters - classified.length);
}

// --- AdminDigest.jsx render tests. ---
const digestUrl = new URL('./AdminDigest.jsx', import.meta.url);
const tmpUrl = new URL('./.classificationBacklog.compiled.tmp.mjs', import.meta.url);
let AdminDigest;
try {
  await build({
    entryPoints: [fileURLToPath(digestUrl)], outfile: fileURLToPath(tmpUrl),
    bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/server'],
  });
  ({ default: AdminDigest } = await import(tmpUrl.href));
} finally {
  fs.rmSync(tmpUrl, { force: true });
}

const cleanDigest = {
  processed: 500, needsAttention: 0, noActionNeeded: 500, actionsToday: [],
  hasYesterdayComparison: true, failedSourcesToday: null, activeOverridesToday: null,
  trend: { storiesProcessed: '', reviewQueue: '', failedSources: null, activeOverrides: null },
};
const render = (digest, classificationBacklog, classificationBacklogError = null) => renderToStaticMarkup(
  React.createElement(AdminDigest, { digest, error: null, classificationBacklog, classificationBacklogError, onOpenQueue() {} }),
);

{
  const html = render(cleanDigest, null);
  assert('classificationBacklog=null (still loading) -> the row is not rendered at all',
    !/Klasifikasi tertunggak/.test(html));
  assert('while loading, an otherwise-clean digest still shows the all-clear banner (loading must not itself read as a problem)',
    /Tiada apa-apa perlu perhatian hari ini/.test(html));
}
{
  const html = render(cleanDigest, { liveClusterCount: 500, backlogCount: 0 });
  assert('backlogCount=0 (verified) renders the row showing "0"', /Klasifikasi tertunggak/.test(html) && /<dd>0<\/dd>/.test(html));
  assert('a verified zero does not carry the attention style', !/digest__row--attention[^>]*>\s*<dt>Klasifikasi tertunggak/.test(html.replace(/\s+/g, ' ')));
  assert('an otherwise-clean digest with verified zero backlog still shows all-clear',
    /Tiada apa-apa perlu perhatian hari ini/.test(html));
}
{
  const html = render(cleanDigest, { liveClusterCount: 686, backlogCount: 408 });
  assert('a real backlog shows the count + explanatory sentence', /408 berita belum melalui pengelasan/.test(html));
  assert('a real backlog carries the attention style (same visual weight as needsAttention)',
    /digest__row--attention[^>]*>\s*<dt>Klasifikasi tertunggak/.test(html.replace(/\s+/g, ' ')));
  // The exact incident this indicator exists to prevent: needsAttention=0
  // and actionsToday=[] (a "clean" digest by the OLD criteria alone) must
  // NOT show "Tiada apa-apa perlu perhatian" while 408 stories are invisible.
  assert('a real backlog SUPPRESSES the all-clear banner even though every other field is clean',
    !/Tiada apa-apa perlu perhatian hari ini/.test(html));
}

// --- classificationBacklogError: a TERMINAL failure, distinct from
// "still loading" (classificationBacklog stays null in both cases --
// adversarial review caught the first version treating them the same,
// which reproduces the exact "silent gap nobody sees" shape of the P0
// incident this indicator exists to catch, just relocated one level up). ---
{
  const html = render(cleanDigest, null, 'network error');
  assert('a fetch error DOES render the row (unlike plain loading, which hides it)',
    /Klasifikasi tertunggak/.test(html));
  assert('the row states the fetch could not be verified, not a fabricated number',
    /Tidak dapat disahkan/.test(html) && /network error/.test(html));
  assert('an error carries the attention style, same as a real backlog',
    /digest__row--attention[^>]*>\s*<dt>Klasifikasi tertunggak/.test(html.replace(/\s+/g, ' ')));
  assert('a fetch error SUPPRESSES the all-clear banner -- "unverified" is not "verified zero"',
    !/Tiada apa-apa perlu perhatian hari ini/.test(html));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
