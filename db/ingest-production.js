// ingest-production.js — Stream A production ingestion.
//
// UPDATED 2026-08-15 (FASA 4.2, docs/ingestion-staging-swap-implementation-plan-v1.md):
// no longer DELETE+INSERT directly against the live tables. Fetches and
// builds into `*_staging` tables, validates, then calls the
// swap_ingestion_staging() Postgres function (db/schema-ingestion-staging-functions-v1.sql)
// to atomically rename staging -> live and live -> `*_old` in one
// transaction. A failed run (fetch error, insert error, failed
// validation) simply never reaches the swap call — production is left
// completely untouched, not partially rebuilt. `*_old` tables are never
// auto-dropped (see db/drop-ingestion-old-tables.mjs) — that stays a
// deliberate, manual, checklist-gated human action.
//
// Original per ChatGPT (director) "DO NOW" instruction (2026-08-11): ingest
// real RSS into the actual Supabase project (not a local stand-in), then
// verify EXACT parity against lab/engine.js's in-memory numbers. Uses the
// service_role key — server-side only, never exposed to a client.
//
// Usage: node db/ingest-production.js
// Dry run (stage + validate, never swap): node db/ingest-production.js --dry-run

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';
import { assertWriteAllowed } from './production-write-guard.mjs';
import { fetchAllSourcesForIngestion } from './source-registry-adapter.mjs';
import { computeClassificationRows, writeClassificationRows } from './classify-production.js';
import {
  computeProtectedStoryIds,
  computeMissingProtected,
  buildCarryForwardClusterRow,
  buildCarryForwardItemRows,
  validateCarryForwardCluster,
  findItemIdCollisions,
  findStillMissingProtected,
} from './carry-forward-personal-state.mjs';

// CUTOVER (2026-08-17, Backend Control Plane Phase 1, per ChatGPT's
// explicit go-ahead): production ingestion's source registry now reads
// from public.sources (the real DB, single source of truth) instead of
// importing lab/sources.js. lab/sources.js is NOT deleted — it remains
// a development/lab reference (Editorial Ranking Laboratory tests still
// use it directly) — but this file, the production entrypoint, no
// longer reads it at all.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Adversarial-review fix (Polish 6B.1): saved_stories/history_entries and
// story_clusters_staging reads that touch personal-state preservation must
// never rely on PostgREST's default row-return cap. db/daily-observation.mjs
// already hit this exact cap on these exact tables and works around it with
// an identical range()-chunked pattern (selectAllChunked, PAGE=1000) -- an
// unpaginated read here would silently truncate protectedStoryIds at scale,
// reopening the dangling-FK bug this whole feature exists to close.
const CHUNK_PAGE = 1000;
async function selectAllChunked(table, columns, applyFilter) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(columns);
    if (applyFilter) q = applyFilter(q);
    const { data, error } = await q.range(from, from + CHUNK_PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < CHUNK_PAGE) break;
    from += CHUNK_PAGE;
  }
  return { data: rows, error: null };
}

async function main() {
  // Per docs/production-write-guard-v1.md: fails immediately, before any
  // network call or write, if DATABASE_ENV isn't explicitly set safe.
  assertWriteAllowed();

  // Polish 6B.1 (docs/polish-6b1-personal-state-carry-forward-design-v1.md,
  // step A): ONE nowIso used for the whole run -- both the cleanup delete
  // below and the protected-ID read (step B) must agree on the same instant.
  const nowIso = new Date().toISOString();

  console.log(DRY_RUN ? 'DRY RUN — will stage and validate, NEVER swap.\n' : 'Fetching real RSS...\n');

  // --- Polish 6B.1 step A: bersihkan saved_stories/history_entries yang
  // dah tamat. Physical DELETE hanya non-dry-run -- kontrak --dry-run
  // sedia ada ("stage + validate, NEVER swap") tidak bermakna "tiada
  // kesan production langsung"; ia tak boleh padam data pengguna sebenar.
  // Fail closed pada sebarang ralat Supabase (jangan teruskan dgn andaian
  // "set protected kosong"). ---
  if (!DRY_RUN) {
    const delSaved = await supabase.from('saved_stories').delete().lte('expires_at', nowIso);
    if (delSaved.error) { console.error('cleanup saved_stories gagal:', delSaved.error); process.exit(1); }
    const delHistory = await supabase.from('history_entries').delete().lte('expires_at', nowIso);
    if (delHistory.error) { console.error('cleanup history_entries gagal:', delHistory.error); process.exit(1); }
    console.log('Dibersihkan: saved_stories/history_entries yang dah tamat.\n');
  }

  // --- Polish 6B.1 step B: baca protected story IDs (SELEPAS cleanup A,
  // guna nowIso sama). Fail closed pada ralat. ---
  const [savedRes, historyRes] = await Promise.all([
    selectAllChunked('saved_stories', 'story_id', q => q.gt('expires_at', nowIso)),
    selectAllChunked('history_entries', 'story_id', q => q.gt('expires_at', nowIso)),
  ]);
  if (savedRes.error) { console.error('baca saved_stories gagal:', savedRes.error); process.exit(1); }
  if (historyRes.error) { console.error('baca history_entries gagal:', historyRes.error); process.exit(1); }
  const protectedStoryIds = computeProtectedStoryIds(savedRes.data, historyRes.data);
  console.log(`${protectedStoryIds.size} protected story ID (saved/history aktif).\n`);

  const sources = await fetchAllSourcesForIngestion(supabase);
  console.log(`${sources.length} sources read from public.sources (production registry).\n`);

  if (!DRY_RUN) console.log('Fetching real RSS...\n');
  const results = await Promise.all(sources.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${sources.length} sources.\n`);

  const labRankedQueue = buildRankedQueue(allItems);
  console.log(`Lab (in-memory ground truth): ${allItems.length} raw items -> ${labRankedQueue.length} clusters, top score ${labRankedQueue[0].editorialScore}.\n`);

  // Polish 6B.1: preservation moved to carry-forward step D/E later in
  // this run (fixture-proven, db/carry-forward-personal-state.test.mjs).

  // --- Reset staging (clears any partial data left by a previous failed
  // run — staging is disposable working space by construction). ---
  console.log('Resetting staging tables...');
  const { error: resetErr } = await supabase.rpc('reset_ingestion_staging');
  if (resetErr) { console.error('reset_ingestion_staging failed:', resetErr); process.exit(1); }

  // Found live (2026-08-15, second real dry-run cycle): reset_ingestion_staging()
  // already ends with NOTIFY pgrst, 'reload schema', but that reload is
  // asynchronous — PostgREST's own cache can still be mid-refresh when the very
  // next request (the sources_staging insert below) lands, producing a real but
  // misleading PGRST205 "table not found" even though the table genuinely
  // exists (confirmed directly via information_schema.tables at the time this
  // was hit). A short wait here is cheap insurance against that race — it does
  // NOT paper over a real missing-table bug, since the table's existence was
  // independently confirmed.
  await new Promise(r => setTimeout(r, 1500));

  // --- 1. Sources -> staging ---
  // Carries the full Source Registry V1 shape through the staging cycle
  // (status/known_category/source_type/exclude_patterns/extra_ca), not
  // just the original 4 columns — otherwise every row would silently
  // fall back to sources_staging's column DEFAULTs on insert (status
  // defaulting to 'active' would incorrectly re-activate rss-kpm on the
  // very next swap, undoing the Phase 1 migration one ingestion cycle
  // at a time).
  const sourceRows = sources.map(s => ({
    id: s.id, name: s.name, url: s.url, language: s.language, trust_score: s.trustScore,
    status: s.status ?? 'active',
    // sources_staging.active DEFAULTs to TRUE (legacy column, kept for
    // §4a's invariant) — must be set explicitly here, not left to the
    // default, or a disabled source (status='disabled') would still
    // land with active=true, violating the active<->status invariant
    // the moment staging is rebuilt (found live via
    // db/verify-staging-post-patch.mjs, 2026-08-17: rss-kpm exactly).
    active: (s.status ?? 'active') === 'active',
    // Polish 6B-a: same reason this whole block exists for known_category
    // etc -- sources_staging is a fresh CREATE TABLE every run, promoted
    // via RENAME (not merged), so any column left out here is silently
    // wiped from `sources` on the very next swap.
    status_reason: s.statusReason ?? null,
    known_category: s.knownCategory ?? null,
    source_type: s.sourceType ?? null,
    exclude_patterns: s.excludePatterns ? s.excludePatterns.map(String) : null,
    extra_ca: s.extraCa ?? null,
    // ChatGPT catch (2026-08-19): sources_staging has these columns too
    // (coverage/last_success_at/last_failure_at/last_failure_reason with
    // no default, created_at/updated_at DEFAULT now()) -- omitting them
    // here means a real swap would silently null the operational fields
    // and reset every source's created_at/updated_at to ingestion time.
    // Carried through exactly from the live row read earlier, never
    // recomputed.
    coverage: s.coverage ?? null,
    last_success_at: s.lastSuccessAt ?? null,
    last_failure_at: s.lastFailureAt ?? null,
    last_failure_reason: s.lastFailureReason ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }));
  const { error: sourcesErr } = await supabase.from('sources_staging').insert(sourceRows);
  if (sourcesErr) { console.error('sources_staging insert failed:', sourcesErr); process.exit(1); }
  console.log(`Staged ${sourceRows.length} sources.`);

  // --- 2. Story clusters -> staging (representative_rss_item_id deferred,
  // same circular-FK ordering as the live schema). ---
  const clusterRows = labRankedQueue.map(c => ({
    id: c.clusterKey,
    representative_rss_item_id: null,
    topic: c.topic,
    workspace_state: 'queued',
    freshness_score: c.scoreBreakdown.freshness,
    cross_source_score: c.scoreBreakdown.crossSourceScore,
    prominence_score: c.scoreBreakdown.prominence,
    first_seen_at: c.canonical.publishedAt,
  }));
  const { error: clustersErr } = await supabase.from('story_clusters_staging').insert(clusterRows);
  if (clustersErr) { console.error('story_clusters_staging insert failed:', clustersErr); process.exit(1); }
  console.log(`Staged ${clusterRows.length} story_clusters.`);

  // --- 3. RSS items -> staging ---
  const itemRows = [];
  for (const cluster of labRankedQueue) {
    for (const item of cluster.members) {
      itemRows.push({
        id: item.rssGuid || item.normalizedUrl,
        source_id: item.sourceId,
        cluster_id: cluster.clusterKey,
        rss_guid: item.rssGuid || null,
        title: item.title,
        description: item.description || null,
        link: item.link || null,
        normalized_url: item.normalizedUrl || null,
        language: item.language,
        published_at: item.publishedAt,
        categories: item.categories ?? [],
        source_known_category: item.sourceKnownCategory ?? null,
      });
    }
  }
  // De-duplicate by primary key before inserting — same reasoning as the
  // original script: category feeds legitimately produce cross-feed
  // duplicates of the same rssGuid, keeping the first occurrence is
  // deliberate since cluster membership is already decided upstream.
  const seenIds = new Set();
  const dedupedItemRows = itemRows.filter(r => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });
  const droppedDupes = itemRows.length - dedupedItemRows.length;
  if (droppedDupes > 0) console.log(`De-duplicated ${droppedDupes} cross-feed duplicate items.`);

  for (let i = 0; i < dedupedItemRows.length; i += 500) {
    const chunk = dedupedItemRows.slice(i, i + 500);
    const { error } = await supabase.from('rss_items_staging').insert(chunk);
    if (error) { console.error(`rss_items_staging insert failed at chunk ${i}:`, error); process.exit(1); }
  }
  console.log(`Staged ${dedupedItemRows.length} rss_items.`);

  // --- 4. Close the circular FK on staging. ---
  for (const cluster of labRankedQueue) {
    const repId = cluster.canonical.rssGuid || cluster.canonical.normalizedUrl;
    const { error } = await supabase.from('story_clusters_staging').update({ representative_rss_item_id: repId }).eq('id', cluster.clusterKey);
    if (error) { console.error(`representative update failed for ${cluster.clusterKey}:`, error); process.exit(1); }
  }
  console.log('Set representative_rss_item_id on all staged clusters.\n');

  // --- Polish 6B.1 step D: carry-forward protected stories (saved/history)
  // that did NOT reappear in this run's fresh corpus. Read from LIVE
  // (pre-swap) story_clusters/rss_items, insert into staging separately
  // from the fresh-build path above -- never routed through
  // buildRankedQueue(). Fail closed on any anomaly (see step E). ---
  const freshClusterIds = new Set(labRankedQueue.map(c => c.clusterKey));
  const toCarryForward = computeMissingProtected(protectedStoryIds, freshClusterIds);
  console.log(`Polish 6B.1: ${toCarryForward.length} protected story/stories missing from fresh corpus, carrying forward.`);

  const stagingSourceIds = new Set(sourceRows.map(s => s.id));
  const carryForwardErrors = [];
  let carriedItemCount = 0;

  if (toCarryForward.length > 0) {
    // ChatGPT catch (2026-08-19): an unpaginated .in('id', toCarryForward)
    // is still subject to PostgREST's default row-return cap once the
    // cluster count is large -- reuse selectAllChunked so this scales the
    // same way the protected-ID reads already do.
    const { data: liveClusters, error: liveClustersErr } = await selectAllChunked('story_clusters', '*', q => q.in('id', toCarryForward));
    if (liveClustersErr) { console.error('baca live story_clusters (carry-forward) gagal:', liveClustersErr); process.exit(1); }

    for (const id of toCarryForward) {
      const liveCluster = liveClusters.find(c => c.id === id);
      if (!liveCluster) {
        carryForwardErrors.push(`carry-forward gagal: protected story "${id}" tiada langsung dalam story_clusters LIVE (data tercicir/corrupt).`);
        continue;
      }
      // Same reasoning: a single unpaginated .eq('cluster_id', id) select
      // could silently truncate a cluster's item set once it legitimately
      // exceeds the row cap -- and if the representative happened to land
      // in the first page, the earlier validateCarryForwardCluster() check
      // would pass despite older items actually being lost.
      const { data: liveItems, error: liveItemsErr } = await selectAllChunked('rss_items', '*', q => q.eq('cluster_id', id));
      if (liveItemsErr) { console.error(`baca live rss_items (carry-forward, cluster ${id}) gagal:`, liveItemsErr); process.exit(1); }

      const errs = validateCarryForwardCluster({ liveCluster, liveItems, stagingSourceIds });
      if (errs.length > 0) { carryForwardErrors.push(...errs); continue; }

      const cfItems = buildCarryForwardItemRows(liveItems);
      const collisionErrs = findItemIdCollisions(cfItems, new Map(dedupedItemRows.map(r => [r.id, r])));
      if (collisionErrs.length > 0) { carryForwardErrors.push(...collisionErrs); continue; }

      const cfClusterRow = buildCarryForwardClusterRow(liveCluster);
      const { error: cfClusterErr } = await supabase.from('story_clusters_staging').insert(cfClusterRow);
      if (cfClusterErr) { console.error(`carry-forward story_clusters_staging insert gagal (${id}):`, cfClusterErr); process.exit(1); }

      const { error: cfItemsErr } = await supabase.from('rss_items_staging').insert(cfItems);
      if (cfItemsErr) { console.error(`carry-forward rss_items_staging insert gagal (${id}):`, cfItemsErr); process.exit(1); }
      carriedItemCount += cfItems.length;

      const { error: cfRepErr } = await supabase.from('story_clusters_staging')
        .update({ representative_rss_item_id: liveCluster.representative_rss_item_id })
        .eq('id', id);
      if (cfRepErr) { console.error(`carry-forward representative restore gagal (${id}):`, cfRepErr); process.exit(1); }
    }
  }

  if (carryForwardErrors.length > 0) {
    console.error('\n✗ CARRY-FORWARD VALIDATION FAILED — refusing to swap. Production untouched.');
    carryForwardErrors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  if (toCarryForward.length > 0) console.log(`Carried forward ${toCarryForward.length} protected story/stories (workspace_state='expired').\n`);

  // --- Validate staging BEFORE swapping — row counts must be sane
  // relative to what was actually computed, not just non-zero. A staging
  // set that silently under-populated (a partial insert that still
  // returned no error, or a logic bug) must never get promoted. ---
  const { count: stagedClusterCount, error: stagedClusterCountErr } = await supabase.from('story_clusters_staging').select('*', { count: 'exact', head: true });
  if (stagedClusterCountErr) { console.error('baca kiraan story_clusters_staging gagal:', stagedClusterCountErr); process.exit(1); }
  const { count: stagedItemCount, error: stagedItemCountErr } = await supabase.from('rss_items_staging').select('*', { count: 'exact', head: true });
  if (stagedItemCountErr) { console.error('baca kiraan rss_items_staging gagal:', stagedItemCountErr); process.exit(1); }
  const expectedClusterCount = labRankedQueue.length + toCarryForward.length;
  const expectedItemCount = dedupedItemRows.length + carriedItemCount;
  const stagingValid = stagedClusterCount === expectedClusterCount && stagedItemCount === expectedItemCount;

  console.log('=== STAGING VALIDATION ===');
  console.log(`Clusters: expected=${expectedClusterCount} (fresh=${labRankedQueue.length} + carry-forward=${toCarryForward.length})  staged=${stagedClusterCount}  ${stagedClusterCount === expectedClusterCount ? '✓' : '✗ MISMATCH'}`);
  console.log(`RSS items: expected=${expectedItemCount} (fresh=${dedupedItemRows.length} + carry-forward=${carriedItemCount})  staged=${stagedItemCount}  ${stagedItemCount === expectedItemCount ? '✓' : '✗ MISMATCH'}`);

  if (!stagingValid) {
    console.error('\n✗ STAGING VALIDATION FAILED — refusing to swap. Production untouched.');
    console.error('Staging tables left in place for forensic inspection (cleared on next run).');
    process.exit(1);
  }

  // --- Polish 6B.1 step E.1: every protected story ID must be present in
  // staging (fresh OR carried forward) before swap is ever attempted. ---
  const { data: stagingClusterRows, error: stagingClusterIdsErr } = await selectAllChunked('story_clusters_staging', 'id');
  if (stagingClusterIdsErr) { console.error('baca story_clusters_staging (protected check) gagal:', stagingClusterIdsErr); process.exit(1); }
  const stagingClusterIds = new Set(stagingClusterRows.map(r => r.id));
  const stillMissing = findStillMissingProtected(protectedStoryIds, stagingClusterIds);
  if (stillMissing.length > 0) {
    console.error('\n✗ PROTECTED STORY MISSING FROM STAGING — refusing to swap. Production untouched.');
    stillMissing.forEach(id => console.error(`  - ${id}`));
    process.exit(1);
  }
  if (protectedStoryIds.size > 0) console.log(`✓ Semua ${protectedStoryIds.size} protected story ID disahkan wujud dalam staging.\n`);

  if (DRY_RUN) {
    console.log('\n✓ Staging valid. DRY RUN — stopping before swap, per --dry-run. Production untouched.');
    return;
  }

  // --- Atomic swap: staging -> live, live -> _old. Single Postgres
  // function call = single implicit transaction (see
  // schema-ingestion-staging-functions-v1.sql). Refuses if a previous
  // cycle's _old tables are still un-dropped. ---
  console.log('\nSwapping staging into production (atomic)...');
  const { error: swapErr } = await supabase.rpc('swap_ingestion_staging');
  if (swapErr) {
    console.error('\n✗ SWAP FAILED — production tables are untouched (Postgres rolled back the whole transaction):');
    console.error(swapErr);
    process.exit(1);
  }
  console.log('✓ Swap committed. Previous generation preserved as *_old (manual drop only — see db/drop-ingestion-old-tables.mjs).\n');

  // --- Verification: exact parity against Lab, now querying the
  // just-promoted live tables (same table names the reader queries).
  // Adversarial-review fix (Polish 6B.1): this block used to compare
  // against labRankedQueue.length/dedupedItemRows.length (fresh-only
  // counts). Once the swap promotes staging, the live tables legitimately
  // also contain carry-forward rows -- comparing against the fresh-only
  // baseline would ALWAYS report a false MISMATCH (and suggest a rollback
  // that would discard the very data carry-forward exists to protect)
  // whenever any protected story was carried forward. Reuse the same
  // expectedClusterCount/expectedItemCount the pre-swap staging check
  // already validated. The top-score query also excludes
  // workspace_state='expired' -- a carried-forward story keeps its
  // original frozen score and must never be reported as the "top" live
  // story in this diagnostic. ---
  const { count: dbClusterCount } = await supabase.from('story_clusters').select('*', { count: 'exact', head: true });
  const { count: dbItemCount } = await supabase.from('rss_items').select('*', { count: 'exact', head: true });
  const { data: topRow } = await supabase.from('story_clusters').select('id, editorial_score, topic').neq('workspace_state', 'expired').order('editorial_score', { ascending: false }).limit(1).single();
  const { data: top5 } = await supabase.from('story_clusters').select('id, editorial_score, topic').neq('workspace_state', 'expired').order('editorial_score', { ascending: false }).limit(5);

  console.log('=== STREAM A — PRODUCTION VERIFICATION (post-swap) ===\n');
  const clusterMatch = expectedClusterCount === dbClusterCount;
  const itemMatch = expectedItemCount === dbItemCount;
  const scoreMatch = Number(labRankedQueue[0].editorialScore) === Number(topRow.editorial_score);

  console.log(`Clusters:  expected=${expectedClusterCount} (fresh=${labRankedQueue.length} + carry-forward=${toCarryForward.length})  Supabase=${dbClusterCount}  ${clusterMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);
  console.log(`RSS items: expected=${expectedItemCount} (fresh=${dedupedItemRows.length} + carry-forward=${carriedItemCount})  Supabase=${dbItemCount}  ${itemMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}  (raw fetch: ${allItems.length}, engine+ID dedup applied)`);
  console.log(`Top score (excl. expired carry-forward): Lab=${labRankedQueue[0].editorialScore}  Supabase=${topRow.editorial_score}  ${scoreMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);

  console.log('\nTop 5 (Supabase, real Ranked Queue query):');
  top5.forEach((r, i) => console.log(`  ${i + 1}. [${r.editorial_score}] ${r.topic} — ${r.id}`));

  console.log('\nTop 5 (Lab, in-memory):');
  labRankedQueue.slice(0, 5).forEach((c, i) => console.log(`  ${i + 1}. [${c.editorialScore}] ${c.topic} — ${c.clusterKey}`));

  const allPass = clusterMatch && itemMatch && scoreMatch;
  console.log(`\n${allPass ? '✓ ALL PARITY CHECKS PASSED — real Supabase, real RSS, exact match with Lab.' : '✗ PARITY FAILED — see mismatches above.'}`);

  if (!allPass) {
    console.error('\nParity failed AFTER swap — the swap itself already committed. Use');
    console.error('db/rollback-ingestion-swap.mjs to swap *_old back if this needs reverting.');
    process.exit(1);
  }

  // P0-B (docs/p0-classification-backlog-incident-v1.md): every ingestion
  // that reaches this point has already committed a new generation of
  // story_clusters/rss_items — until now, NOTHING then told the classifier
  // about it. classify-production.js only ever ran when a human separately
  // remembered to run it by hand, and the incident this closes found 408 of
  // 686 live clusters (59%) had gone through ingestion but never
  // classification, invisible to every reader, discovered only because
  // Izzat asked why one category looked nearly empty.
  //
  // Deliberately NOT a second independent scheduler — the director's own
  // reasoning: two separately-triggered automatic processes can drift out
  // of sync with each other exactly the way ingestion and classification
  // already had. Piggybacking on whatever already triggers ingestion (today
  // a human running this script; potentially a real scheduler later) means
  // classification is now automatic FOR FREE, for every existing and future
  // caller, with no second cron/endpoint/secret to keep in sync.
  //
  // Failure here does NOT roll back the swap — the new generation is
  // already live and correctly ingested; only classification of it is
  // stale/missing, same recoverable state as today's manual gap, not a new
  // failure mode. It exits non-zero specifically so an operator (or
  // whatever eventually calls this script on a schedule) sees a clear
  // signal rather than the run quietly reporting success while the exact
  // incident this section exists to prevent recurs. writeClassificationRows()
  // itself calls the same atomic RPC a human's --write does (schema-
  // classification-atomic-replace-rpc-v1.sql) — if it fails partway, the
  // PREVIOUS classification stays intact, never a half-written table.
  console.log('\nRunning classification for the new generation (P0-B, automatic post-ingest)...');
  try {
    const classification = await computeClassificationRows(supabase);
    const written = await writeClassificationRows(supabase, classification.rows);
    console.log(`✓ Classification complete: ${written} rows written (atomic replace).\n`);
  } catch (err) {
    console.error('\n✗ CLASSIFICATION FAILED after a successful ingestion swap.');
    console.error('  Production ingestion IS live and correct — only classification is stale.');
    console.error('  Previous classification data is untouched (the atomic RPC never partially wrote).');
    console.error('  Re-run manually: node db/classify-production.js --write');
    console.error('  Underlying error:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Production ingestion failed:', err);
  process.exit(1);
});
