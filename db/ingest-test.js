// ingest-test.js — Stream A schema verification.
//
// IMPORTANT / TRANSPARENCY NOTE: ChatGPT's instruction was "jalankan pada
// local/test Supabase". I do not have Supabase project credentials for
// Adjung Quick (it's a separate project from Adjung Core, which has its own
// existing Supabase/SQLite setup — nothing here reuses that). Rather than
// skip verification, this uses Node's built-in node:sqlite as a LOCAL
// stand-in to prove the schema SHAPE holds real ingested data and that
// querying it back reproduces the Laboratory's in-memory results exactly.
// db/schema.sql remains the real Postgres/Supabase target — Izzat needs to
// provide a Supabase project (or confirm local Postgres) before this can
// run against the actual target database.
//
// Usage: node db/ingest-test.js

import { DatabaseSync } from 'node:sqlite';
import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';

// SQLite-flavored translation of schema.sql (same shape, different dialect —
// no TIMESTAMPTZ/GENERATED STORED/plpgsql triggers in SQLite). This file is
// NOT the production migration; db/schema.sql is.
const SQLITE_SCHEMA = `
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  language TEXT NOT NULL,
  trust_score INTEGER NOT NULL,
  coverage TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE story_clusters (
  id TEXT PRIMARY KEY,
  representative_rss_item_id TEXT,
  topic TEXT NOT NULL DEFAULT 'Unclassified',
  workspace_state TEXT NOT NULL DEFAULT 'queued',
  freshness_score REAL NOT NULL DEFAULT 0,
  cross_source_score REAL NOT NULL DEFAULT 0,
  prominence_score REAL NOT NULL DEFAULT 0,
  editorial_score REAL NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rss_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  cluster_id TEXT NOT NULL REFERENCES story_clusters(id),
  rss_guid TEXT,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  normalized_url TEXT,
  language TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_rss_items_source_guid ON rss_items (source_id, rss_guid) WHERE rss_guid IS NOT NULL;
CREATE INDEX idx_rss_items_normalized_url ON rss_items (normalized_url);
CREATE INDEX idx_rss_items_cluster ON rss_items (cluster_id);
CREATE INDEX idx_story_clusters_workspace_state ON story_clusters (workspace_state);
CREATE INDEX idx_story_clusters_editorial_score ON story_clusters (editorial_score DESC);
`;

async function main() {
  console.log('Fetching real RSS...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);

  // Ground truth: the Laboratory's own in-memory computation (unchanged).
  const labRankedQueue = buildRankedQueue(allItems);
  console.log(`Lab (in-memory): ${allItems.length} raw items -> ${labRankedQueue.length} clusters.\n`);

  // Now persist that SAME result into SQLite, following schema.sql's shape,
  // and verify a straight read-back reproduces it — this tests the SCHEMA,
  // not a reimplementation of clustering logic in SQL (clustering stays in
  // the application layer per the architecture skeleton — DB is persistence,
  // not business logic, consistent with tonight's "reducer never talks to
  // Supabase directly" principle).
  const db = new DatabaseSync(':memory:');
  db.exec(SQLITE_SCHEMA);

  const insertSource = db.prepare(`INSERT OR IGNORE INTO sources (id, name, url, language, trust_score, coverage) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const s of RSS_SOURCES) {
    insertSource.run(s.id, s.name, s.url, s.language, s.trustScore, null);
  }

  const insertCluster = db.prepare(`
    INSERT INTO story_clusters (id, representative_rss_item_id, topic, workspace_state, freshness_score, cross_source_score, prominence_score, editorial_score, first_seen_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO rss_items (id, source_id, cluster_id, rss_guid, title, description, link, normalized_url, language, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cluster of labRankedQueue) {
    const repId = cluster.canonical.rssGuid || cluster.canonical.normalizedUrl;
    insertCluster.run(
      cluster.clusterKey, repId, cluster.topic,
      cluster.scoreBreakdown.freshness, cluster.scoreBreakdown.crossSourceScore, cluster.scoreBreakdown.prominence,
      cluster.editorialScore, cluster.canonical.publishedAt
    );
    for (const item of cluster.members) {
      const itemId = item.rssGuid || item.normalizedUrl;
      insertItem.run(
        itemId, item.sourceId, cluster.clusterKey, item.rssGuid || null,
        item.title, item.description || null, item.link || null, item.normalizedUrl || null,
        item.language, item.publishedAt
      );
    }
  }

  // Read back and compare against Lab's in-memory numbers.
  const dbClusterCount = db.prepare('SELECT COUNT(*) AS n FROM story_clusters').get().n;
  const dbItemCount = db.prepare('SELECT COUNT(*) AS n FROM rss_items').get().n;
  const dbTopScore = db.prepare('SELECT editorial_score FROM story_clusters ORDER BY editorial_score DESC LIMIT 1').get()?.editorial_score;

  console.log('=== SCHEMA VERIFICATION (SQLite local stand-in) ===\n');
  console.log(`Clusters:  Lab=${labRankedQueue.length}  DB=${dbClusterCount}  ${labRankedQueue.length === dbClusterCount ? '✓ MATCH' : '✗ MISMATCH'}`);
  console.log(`RSS items: Lab=${allItems.length}  DB=${dbItemCount}  ${allItems.length === dbItemCount ? '✓ MATCH' : '✗ MISMATCH'}`);
  console.log(`Top score: Lab=${labRankedQueue[0].editorialScore}  DB=${dbTopScore}  ${labRankedQueue[0].editorialScore === dbTopScore ? '✓ MATCH' : '✗ MISMATCH'}`);

  // Prove the Ranked Queue "table" is really just a query (§6 of the audit).
  const rankedFromDb = db.prepare(`
    SELECT id, topic, editorial_score FROM story_clusters
    WHERE workspace_state = 'queued'
    ORDER BY editorial_score DESC LIMIT 5
  `).all();
  console.log('\nTop 5 via query (proving "Ranked Queue" needs no separate table):');
  rankedFromDb.forEach((r, i) => console.log(`  ${i + 1}. [${r.editorial_score}] ${r.topic} — ${r.id}`));

  db.close();
  console.log('\nDone. This proves the SHAPE holds real data — it is not a substitute for running db/schema.sql against real Supabase.');
}

main().catch(err => {
  console.error('Schema verification failed:', err);
  process.exit(1);
});
