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
import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';
import { assertWriteAllowed, evaluateDestructiveRebuildGuard } from './production-write-guard.mjs';

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

async function main() {
  // Per docs/production-write-guard-v1.md: fails immediately, before any
  // network call or write, if DATABASE_ENV isn't explicitly set safe.
  assertWriteAllowed();

  console.log(DRY_RUN ? 'DRY RUN — will stage and validate, NEVER swap.\n' : 'Fetching real RSS...\n');
  if (!DRY_RUN) console.log('Fetching real RSS...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);

  const labRankedQueue = buildRankedQueue(allItems);
  console.log(`Lab (in-memory ground truth): ${allItems.length} raw items -> ${labRankedQueue.length} clusters, top score ${labRankedQueue[0].editorialScore}.\n`);

  // --- Destructive-rebuild guard, KEPT per ChatGPT's explicit instruction
  // not to remove it even under staging+swap (2026-08-15 review of
  // docs/content-pipeline-reliability-plan-v1.md's audit): staging+swap
  // solves the reader-empty-window/no-rollback risk, but does NOT solve
  // the FK-dangling risk this guard exists for — saved_stories/
  // history_entries reference story_clusters with no ON DELETE action, so
  // a swap that eventually leads to `_old` being dropped can still orphan
  // real user data if a referenced cluster simply didn't reappear in the
  // new generation. This checks NOW, every run, never trusting "it was
  // empty yesterday".
  const [{ count: savedCount }, { count: historyCount }] = await Promise.all([
    supabase.from('saved_stories').select('*', { count: 'exact', head: true }),
    supabase.from('history_entries').select('*', { count: 'exact', head: true }),
  ]);
  const guard = evaluateDestructiveRebuildGuard(savedCount, historyCount);
  if (!guard.allowed) {
    console.error('');
    console.error('ERROR: Ingestion blocked.');
    console.error('');
    console.error(`Reason: ${guard.reason}`);
    console.error('');
    console.error('See docs/ingestion-staging-swap-implementation-plan-v1.md §4 —');
    console.error('staging+swap does not remove this risk, only postpones it to');
    console.error('whenever _old tables are eventually dropped.');
    process.exit(1);
  }
  if (guard.forced) {
    console.log(`WARNING: proceeding with ALLOW_DESTRUCTIVE_REBUILD=true over ${guard.userRows} user row(s).`);
  }

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
  const sourceRows = RSS_SOURCES.map(s => ({
    id: s.id, name: s.name, url: s.url, language: s.language, trust_score: s.trustScore,
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

  // --- Validate staging BEFORE swapping — row counts must be sane
  // relative to what was actually computed, not just non-zero. A staging
  // set that silently under-populated (a partial insert that still
  // returned no error, or a logic bug) must never get promoted. ---
  const { count: stagedClusterCount } = await supabase.from('story_clusters_staging').select('*', { count: 'exact', head: true });
  const { count: stagedItemCount } = await supabase.from('rss_items_staging').select('*', { count: 'exact', head: true });
  const stagingValid = stagedClusterCount === labRankedQueue.length && stagedItemCount === dedupedItemRows.length;

  console.log('=== STAGING VALIDATION ===');
  console.log(`Clusters: expected=${labRankedQueue.length}  staged=${stagedClusterCount}  ${stagedClusterCount === labRankedQueue.length ? '✓' : '✗ MISMATCH'}`);
  console.log(`RSS items: expected=${dedupedItemRows.length}  staged=${stagedItemCount}  ${stagedItemCount === dedupedItemRows.length ? '✓' : '✗ MISMATCH'}`);

  if (!stagingValid) {
    console.error('\n✗ STAGING VALIDATION FAILED — refusing to swap. Production untouched.');
    console.error('Staging tables left in place for forensic inspection (cleared on next run).');
    process.exit(1);
  }

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
  // just-promoted live tables (same table names the reader queries). ---
  const { count: dbClusterCount } = await supabase.from('story_clusters').select('*', { count: 'exact', head: true });
  const { count: dbItemCount } = await supabase.from('rss_items').select('*', { count: 'exact', head: true });
  const { data: topRow } = await supabase.from('story_clusters').select('id, editorial_score, topic').order('editorial_score', { ascending: false }).limit(1).single();
  const { data: top5 } = await supabase.from('story_clusters').select('id, editorial_score, topic').order('editorial_score', { ascending: false }).limit(5);

  console.log('=== STREAM A — PRODUCTION VERIFICATION (post-swap) ===\n');
  const clusterMatch = labRankedQueue.length === dbClusterCount;
  const itemMatch = dedupedItemRows.length === dbItemCount;
  const scoreMatch = Number(labRankedQueue[0].editorialScore) === Number(topRow.editorial_score);

  console.log(`Clusters:  Lab=${labRankedQueue.length}  Supabase=${dbClusterCount}  ${clusterMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);
  console.log(`RSS items: staged=${dedupedItemRows.length}  Supabase=${dbItemCount}  ${itemMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}  (raw fetch: ${allItems.length}, engine+ID dedup applied)`);
  console.log(`Top score: Lab=${labRankedQueue[0].editorialScore}  Supabase=${topRow.editorial_score}  ${scoreMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);

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
}

main().catch(err => {
  console.error('Production ingestion failed:', err);
  process.exit(1);
});
