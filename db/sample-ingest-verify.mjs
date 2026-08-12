// sample-ingest-verify.mjs — Step 3 of the Production Evidence Persistence
// Gap fix sequencing (docs/production-evidence-persistence-gap.md): confirm
// the RSS -> rss_items -> understandStory() round trip actually carries
// evidence for a handful of real sources, BEFORE running the full
// (unconditionally-truncating) db/ingest-production.js.
//
// Deliberately does NOT touch story_clusters or sources, and does NOT
// truncate anything — inserts test rows under one throwaway cluster with a
// clearly-marked id prefix, verifies, then deletes exactly those rows.
// Safe to run against the live production DB without risking existing data
// (per Izzat's "no reliable backups, test carefully" standing instruction).
//
// Usage: node db/sample-ingest-verify.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from '../classification/story-understanding.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SAMPLE_SOURCE_IDS = ['rss-mosti', 'rss-kpm', 'rss-amanz', 'rss-utusan-agama', 'rss-bernama-bm'];
const TEST_PREFIX = 'sampleverify-';

async function main() {
  console.log('\nSAMPLE INGESTION VERIFICATION (Step 3) — 5 sources, no truncation\n');

  const sources = SAMPLE_SOURCE_IDS.map(id => RSS_SOURCES.find(s => s.id === id)).filter(Boolean);
  const results = await Promise.all(sources.map(fetchFeed));

  const testItemRows = [];
  const expectedBySource = {};
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const result = results[i];
    if (!result.ok) { console.log(`  ${source.id}: FETCH FAILED — ${result.error}`); continue; }
    const sample = result.items.slice(0, 2); // 2 items per source is enough to prove the round trip
    expectedBySource[source.id] = sample.length;
    for (const item of sample) {
      testItemRows.push({
        id: TEST_PREFIX + (item.rssGuid || item.normalizedUrl),
        source_id: source.id,
        cluster_id: null, // set after we insert a throwaway cluster below
        // Prefixed too — idx_rss_items_source_guid is UNIQUE on
        // (source_id, rss_guid), and the real row for this same guid
        // already exists in production from the last real ingestion.
        rss_guid: item.rssGuid ? TEST_PREFIX + item.rssGuid : null,
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

  if (testItemRows.length === 0) {
    console.log('No items fetched from any sample source — aborting, nothing to verify.');
    process.exit(1);
  }

  // Throwaway cluster so the FK on rss_items.cluster_id is satisfiable, then
  // deleted along with the test items at the end.
  const testClusterId = TEST_PREFIX + 'cluster';
  const { error: clusterErr } = await supabase.from('story_clusters').insert({
    id: testClusterId,
    representative_rss_item_id: null,
    topic: '(sample-verify, not real)',
    workspace_state: 'expired', // never eligible for the real Ranked Queue
    freshness_score: 0,
    cross_source_score: 0,
    prominence_score: 0,
    first_seen_at: new Date(2026, 0, 1).toISOString(),
  });
  if (clusterErr) { console.error('throwaway cluster insert failed:', clusterErr.message); process.exit(1); }

  testItemRows.forEach(r => { r.cluster_id = testClusterId; });

  const { error: insertErr } = await supabase.from('rss_items').insert(testItemRows);
  if (insertErr) {
    console.error('test rss_items insert failed:', insertErr.message);
    await supabase.from('story_clusters').delete().eq('id', testClusterId);
    process.exit(1);
  }
  console.log(`Inserted ${testItemRows.length} test rows across ${Object.keys(expectedBySource).length} sources.\n`);

  // Read back exactly what was inserted, run it through the SAME frozen
  // classification input path db/classify-production.js uses, per source.
  let allPass = true;
  for (const sourceId of Object.keys(expectedBySource)) {
    const { data: rows, error } = await supabase
      .from('rss_items')
      .select('title, description, link, categories, source_known_category')
      .eq('source_id', sourceId)
      .like('id', TEST_PREFIX + '%');
    if (error) { console.log(`  ${sourceId}: READ FAILED — ${error.message}`); allPass = false; continue; }

    const row = rows[0];

    const understanding = understandStory({
      title: row.title, description: row.description, link: row.link,
      categories: row.categories ?? [], sourceKnownCategory: row.source_known_category ?? undefined,
    });
    const topCandidate = understanding.subject_candidates?.[0];
    // Bernama carries its evidence a different way (title_prefix, e.g.
    // "Politik : ..."), not via categories[]/source_known_category — so the
    // real pass condition is "does understandStory() land a real subject
    // candidate", not "are those two specific columns non-empty".
    const evidencePresent = !!topCandidate;

    console.log(`  ${sourceId}:`);
    console.log(`    categories=${JSON.stringify(row.categories)}  source_known_category=${JSON.stringify(row.source_known_category)}`);
    console.log(`    understandStory() top candidate: ${topCandidate ? `${topCandidate.value}@${topCandidate.confidence}` : '(none)'}`);
    console.log(`    round-trip evidence present: ${evidencePresent ? 'YES' : 'NO'}`);
    if (!evidencePresent) allPass = false;
  }

  // Clean up — this script only ever proves the round trip; it must not
  // leave test rows in a database with no reliable backup.
  await supabase.from('rss_items').delete().like('id', TEST_PREFIX + '%');
  await supabase.from('story_clusters').delete().eq('id', testClusterId);
  console.log('\nTest rows cleaned up.');

  console.log(`\n${allPass ? 'PASS' : 'FAIL'} — ${allPass ? 'evidence survives the full round trip for all sampled sources.' : 'at least one sampled source lost evidence — do NOT proceed to full re-ingest.'}\n`);
  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('sample-ingest-verify failed:', err.message);
  process.exit(1);
});
