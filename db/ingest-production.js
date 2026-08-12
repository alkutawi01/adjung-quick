// ingest-production.js — REAL Stream A production verification.
//
// Per ChatGPT (director) "DO NOW" instruction (2026-08-11): ingest real RSS
// into the actual Supabase project (not a local stand-in), then verify
// EXACT parity against lab/engine.js's in-memory numbers (190 items, 177
// clusters, top score 79). Uses the service_role key — server-side only,
// never exposed to a client per ChatGPT's security note.
//
// Usage: node db/ingest-production.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('Fetching real RSS...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);

  const labRankedQueue = buildRankedQueue(allItems);
  console.log(`Lab (in-memory ground truth): ${allItems.length} raw items -> ${labRankedQueue.length} clusters, top score ${labRankedQueue[0].editorialScore}.\n`);

  // --- Clean slate: this is a fresh schema-only database, safe to truncate
  // between runs while iterating. Order matters (FK dependencies). ---
  console.log('Clearing existing rows (fresh verification run)...');
  await supabase.from('rss_items').delete().not('id', 'is', null);
  await supabase.from('story_clusters').delete().not('id', 'is', null);
  await supabase.from('sources').delete().not('id', 'is', null);

  // --- 1. Sources ---
  const sourceRows = RSS_SOURCES.map(s => ({
    id: s.id, name: s.name, url: s.url, language: s.language, trust_score: s.trustScore,
  }));
  const { error: sourcesErr } = await supabase.from('sources').insert(sourceRows);
  if (sourcesErr) { console.error('sources insert failed:', sourcesErr); process.exit(1); }
  console.log(`Inserted ${sourceRows.length} sources.`);

  // --- 2. Story clusters (representative_rss_item_id deferred — inserted
  // NULL first, set after rss_items exist, exactly like schema.sql's own
  // circular-FK ordering). ---
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
  const { error: clustersErr } = await supabase.from('story_clusters').insert(clusterRows);
  if (clustersErr) { console.error('story_clusters insert failed:', clustersErr); process.exit(1); }
  console.log(`Inserted ${clusterRows.length} story_clusters.`);

  // --- 3. RSS items ---
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
        // Production Evidence Persistence Gap fix (2026-08-12): these two
        // were silently never written, so every classification run against
        // production data was missing Tier 1 (feed_category) and Tier 3
        // (rss_category) evidence entirely — only Tier 2 (url_path, derived
        // from `link` above, which WAS persisted) survived. Kept as two
        // separate columns, never merged: `categories` is what the
        // PUBLISHER declared, `source_known_category` is what OUR source
        // registry (lab/sources.js) declares about that specific feed URL —
        // different provenance, must stay distinguishable.
        categories: item.categories ?? [],
        source_known_category: item.sourceKnownCategory ?? null,
      });
    }
  }
  // De-duplicate by primary key before inserting. Once per-category feeds
  // were added (2026-08-12), the SAME article legitimately arrives from two
  // feeds of one publisher — e.g. Utusan's general feed and Utusan's Politik
  // feed both carry the same story, with the same rssGuid. That is not bad
  // data; it is how category feeds work. Without this the whole insert aborts
  // on "duplicate key value violates unique constraint rss_items_pkey",
  // leaving clusters in the database with no items behind them (hit live).
  // Keeping the FIRST occurrence is deliberate: cluster membership is decided
  // upstream by lab/engine.js, so any copy resolves to the same cluster.
  const seenIds = new Set();
  const dedupedItemRows = itemRows.filter(r => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });
  const droppedDupes = itemRows.length - dedupedItemRows.length;
  if (droppedDupes > 0) console.log(`De-duplicated ${droppedDupes} cross-feed duplicate items.`);

  // Batch insert (Supabase/PostgREST has payload limits) — chunks of 500.
  for (let i = 0; i < dedupedItemRows.length; i += 500) {
    const chunk = dedupedItemRows.slice(i, i + 500);
    const { error } = await supabase.from('rss_items').insert(chunk);
    if (error) { console.error(`rss_items insert failed at chunk ${i}:`, error); process.exit(1); }
  }
  console.log(`Inserted ${dedupedItemRows.length} rss_items.`);

  // --- 4. Close the circular FK: set representative_rss_item_id now that rss_items exist. ---
  for (const cluster of labRankedQueue) {
    const repId = cluster.canonical.rssGuid || cluster.canonical.normalizedUrl;
    const { error } = await supabase.from('story_clusters').update({ representative_rss_item_id: repId }).eq('id', cluster.clusterKey);
    if (error) { console.error(`representative update failed for ${cluster.clusterKey}:`, error); process.exit(1); }
  }
  console.log('Set representative_rss_item_id on all clusters.\n');

  // --- Verification: exact parity against Lab ---
  const { count: dbClusterCount } = await supabase.from('story_clusters').select('*', { count: 'exact', head: true });
  const { count: dbItemCount } = await supabase.from('rss_items').select('*', { count: 'exact', head: true });
  const { data: topRow } = await supabase.from('story_clusters').select('id, editorial_score, topic').order('editorial_score', { ascending: false }).limit(1).single();
  const { data: top5 } = await supabase.from('story_clusters').select('id, editorial_score, topic').order('editorial_score', { ascending: false }).limit(5);

  console.log('=== STREAM A — PRODUCTION VERIFICATION ===\n');
  const clusterMatch = labRankedQueue.length === dbClusterCount;
  const itemMatch = allItems.length === dbItemCount;
  const scoreMatch = Number(labRankedQueue[0].editorialScore) === Number(topRow.editorial_score);

  console.log(`Clusters:  Lab=${labRankedQueue.length}  Supabase=${dbClusterCount}  ${clusterMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);
  console.log(`RSS items: Lab=${allItems.length}  Supabase=${dbItemCount}  ${itemMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);
  console.log(`Top score: Lab=${labRankedQueue[0].editorialScore}  Supabase=${topRow.editorial_score}  ${scoreMatch ? '✓ EXACT MATCH' : '✗ MISMATCH'}`);

  console.log('\nTop 5 (Supabase, real Ranked Queue query):');
  top5.forEach((r, i) => console.log(`  ${i + 1}. [${r.editorial_score}] ${r.topic} — ${r.id}`));

  console.log('\nTop 5 (Lab, in-memory):');
  labRankedQueue.slice(0, 5).forEach((c, i) => console.log(`  ${i + 1}. [${c.editorialScore}] ${c.topic} — ${c.clusterKey}`));

  const allPass = clusterMatch && itemMatch && scoreMatch;
  console.log(`\n${allPass ? '✓ ALL PARITY CHECKS PASSED — real Supabase, real RSS, exact match with Lab.' : '✗ PARITY FAILED — see mismatches above.'}`);

  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('Production ingestion failed:', err);
  process.exit(1);
});
