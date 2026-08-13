// snapshot-production.mjs — "staging ringan" per Izzat's decision
// (2026-08-13, docs/staging-environment-setup-plan-v1.md): no Docker
// available on this machine for a local Supabase instance, and Izzat
// explicitly wants zero added Supabase cost — a dedicated staging
// project is deferred until real traffic grows. This is the lightest
// possible substitute: a READ-ONLY export of real production data to a
// local JSON file, which future test/verification scripts can load
// instead of hitting the live (shared) database at all.
//
// This script only ever SELECTs — no write-guard needed, matching the
// other confirmed-read-only scripts in db/production-write-guard-v1.md's
// audit. Output goes to db/snapshots/ (gitignored — real data, never
// committed).
//
// Usage: node db/snapshot-production.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = `${__dirname}/snapshots`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Chunked .in()/select — same lesson as ranking/shadow-runner.mjs's
// earlier fix, applied here from the start since some of these tables
// (rss_items, edition_story_classifications) are large.
async function selectAllChunked(table, columns) {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  console.log('\nPRODUCTION SNAPSHOT (read-only) — local staging dataset\n');
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const [sources, storyClusters, rssItems, placements, savedStories, historyEntries] = await Promise.all([
    selectAllChunked('sources', 'id, name, url, language, trust_score'),
    selectAllChunked('story_clusters', 'id, topic, editorial_score, workspace_state'),
    selectAllChunked('rss_items', 'id, source_id, cluster_id, title, description, link, language, published_at, categories, source_known_category'),
    selectAllChunked('edition_story_classifications', 'story_id, edition_id, field, classification_status, classification_confidence, classification_method, classification_rule, ruleset_version'),
    // Added 2026-08-13 per docs/restore-rehearsal-v1.md's found gap: the
    // Identity Layer's own user data tables were never covered by this
    // snapshot — harmless while both are empty (no real users yet), but
    // would silently lose real readers' saved stories/history with no
    // recovery path once they aren't.
    selectAllChunked('saved_stories', 'id, user_id, story_id, saved_at, expires_at'),
    selectAllChunked('history_entries', 'id, user_id, story_id, released_at, expires_at'),
  ]);

  const snapshot = {
    // Per docs/staging-environment-setup-plan-v1.md §4's versioned
    // snapshot format — snapshot date, source, schema/ruleset version.
    snapshotDate: new Date().toISOString(),
    source: 'production (shared Supabase project)',
    rulesetVersions: [...new Set(placements.map(p => p.ruleset_version))],
    counts: { sources: sources.length, storyClusters: storyClusters.length, rssItems: rssItems.length, placements: placements.length, savedStories: savedStories.length, historyEntries: historyEntries.length },
    sources,
    storyClusters,
    rssItems,
    placements,
    savedStories,
    historyEntries,
  };

  const path = `${SNAPSHOT_DIR}/production-snapshot.json`;
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written: ${path}`);
  console.log(`  sources: ${sources.length}`);
  console.log(`  story_clusters: ${storyClusters.length}`);
  console.log(`  rss_items: ${rssItems.length}`);
  console.log(`  edition_story_classifications: ${placements.length}`);
  console.log(`  saved_stories: ${savedStories.length}`);
  console.log(`  history_entries: ${historyEntries.length}`);
  console.log(`  ruleset versions present: ${snapshot.rulesetVersions.join(', ')}`);
  console.log('\nDone. Read-only — no production data was modified.\n');
}

main().catch(err => {
  console.error('snapshot-production failed:', err.message);
  process.exit(1);
});
