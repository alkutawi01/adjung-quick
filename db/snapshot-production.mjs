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
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = `${__dirname}/snapshots`;

// Per Izzat's decision (2026-08-13): a portal-berita snapshot isn't
// sensitive/critical data, and stories live ~1 week anyway — Google
// Drive's free desktop sync app (already installed on this machine,
// confirmed at G:\My Drive) is sufficient as an off-machine copy. No
// Supabase Pro backup needed for this. If Drive isn't mounted (e.g. the
// other computer, per Izzat's 2-machine setup), this step is skipped
// with a warning, not a failure — the local snapshot is still written.
const GOOGLE_DRIVE_BACKUP_DIR = 'G:\\My Drive\\Adjung Quick Backups';
const GOOGLE_DRIVE_RETENTION_DAYS = 14; // double the ~1 week news shelf-life Izzat described

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
// Same transient-error retry as db/daily-observation.mjs — Supabase
// intermittently returns "JWT issued at future" (clock skew, clears on
// retry). Hit repeatedly on 2026-08-13, including mid-launch.
const TRANSIENT_PATTERNS = [/JWT issued at future/i, /fetch failed/i];

// Polish 9A (docs/p0-classification-backlog-incident-v1.md, adversarial
// review): range()/offset pagination across separate HTTP requests has no
// ordering guarantee unless the query itself specifies one — a row could
// theoretically be skipped or duplicated at a page boundary if the
// table's physical/plan order shifts between two round-trips. Especially
// relevant here: this is a BACKUP/disaster-recovery snapshot — a silently
// dropped row here is a silent hole in the one artifact meant to make
// data recoverable. orderBy names the column(s) that make each table's
// row identity total and stable — always its real PRIMARY KEY.
async function selectAllChunked(table, columns, attempts = 3, orderBy = 'id') {
  const orderCols = Array.isArray(orderBy) ? orderBy : [orderBy];
  for (let i = 1; i <= attempts; i++) {
    try {
      const rows = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let q = supabase.from(table).select(columns);
        for (const col of orderCols) q = q.order(col, { ascending: true });
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    } catch (err) {
      if (!TRANSIENT_PATTERNS.some(p => p.test(err.message)) || i === attempts) throw err;
      console.log(`  (transient error on ${table}: ${err.message} — retry ${i}/${attempts - 1})`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

async function main() {
  console.log('\nPRODUCTION SNAPSHOT (read-only) — local staging dataset\n');
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const [sources, storyClusters, rssItems, placements, savedStories, historyEntries] = await Promise.all([
    selectAllChunked('sources', 'id, name, url, language, trust_score', 3, 'id'),
    selectAllChunked('story_clusters', 'id, topic, editorial_score, workspace_state', 3, 'id'),
    selectAllChunked('rss_items', 'id, source_id, cluster_id, title, description, link, language, published_at, categories, source_known_category', 3, 'id'),
    // Ordered by its real COMPOSITE primary key (story_id, edition_id) --
    // story_id alone repeats across rows (one story, one row per eligible
    // edition), so it isn't a total order on its own.
    selectAllChunked('edition_story_classifications', 'story_id, edition_id, field, classification_status, classification_confidence, classification_method, classification_rule, ruleset_version', 3, ['story_id', 'edition_id']),
    // Added 2026-08-13 per docs/restore-rehearsal-v1.md's found gap: the
    // Identity Layer's own user data tables were never covered by this
    // snapshot — harmless while both are empty (no real users yet), but
    // would silently lose real readers' saved stories/history with no
    // recovery path once they aren't.
    selectAllChunked('saved_stories', 'id, user_id, story_id, saved_at, expires_at', 3, 'id'),
    selectAllChunked('history_entries', 'id, user_id, story_id, released_at, expires_at', 3, 'id'),
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

  checkUpgradeTriggers(snapshot);
  backupToGoogleDrive(snapshot);

  console.log('\nDone. Read-only — no production data was modified.\n');
}

// Trigger B check from docs/production-safety-decision-proposal-v1.md
// §1: "Upgrade before saved_stories/history_entries hold real,
// meaningful user data." Automatable today — the other two triggers
// (A: sustained traffic, C: unattended automated jobs) aren't, since
// this project has no traffic tracking and no scheduler yet (both
// deliberately not built per Izzat's 2026-08-13 "skip for now"
// decision) — those stay manual judgment calls until/unless that
// changes. This check fires every run once real rows exist; not
// silenced after the first warning on purpose — a real trust-affecting
// gap deserves to stay visible, not be dismissed once and forgotten.
function checkUpgradeTriggers(snapshot) {
  const realUserDataRows = snapshot.counts.savedStories + snapshot.counts.historyEntries;
  if (realUserDataRows === 0) return;
  console.log(`\n⚠️  SUPABASE UPGRADE TRIGGER B FIRED — real user data exists now.`);
  console.log(`   saved_stories: ${snapshot.counts.savedStories}, history_entries: ${snapshot.counts.historyEntries}`);
  console.log(`   Per docs/production-safety-decision-proposal-v1.md: this data has no`);
  console.log(`   short-lived rationale (unlike news items) — losing it on a Free-Plan`);
  console.log(`   backup gap is a real trust failure, not an accepted risk. Revisit the`);
  console.log(`   Supabase Pro decision now.`);
}

// Dated copy into the Google Drive sync folder, so the local sync app
// uploads it automatically — zero new infrastructure, per Izzat's
// explicit decision. Old dated copies beyond GOOGLE_DRIVE_RETENTION_DAYS
// are pruned so the folder doesn't grow forever (this only ever touches
// files this script itself wrote, never anything else in the folder).
function backupToGoogleDrive(snapshot) {
  if (!existsSync('G:\\My Drive')) {
    console.log(`\nGoogle Drive backup SKIPPED — G:\\My Drive not found on this machine (Drive for Desktop not installed/mounted here).`);
    return;
  }
  mkdirSync(GOOGLE_DRIVE_BACKUP_DIR, { recursive: true });
  const dateStamp = snapshot.snapshotDate.slice(0, 10); // YYYY-MM-DD
  const backupPath = `${GOOGLE_DRIVE_BACKUP_DIR}\\production-snapshot-${dateStamp}.json`;
  writeFileSync(backupPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nGoogle Drive backup written: ${backupPath} (syncs automatically via Drive for Desktop)`);

  const cutoff = Date.now() - GOOGLE_DRIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const file of readdirSync(GOOGLE_DRIVE_BACKUP_DIR)) {
    if (!/^production-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const filePath = `${GOOGLE_DRIVE_BACKUP_DIR}\\${file}`;
    if (statSync(filePath).mtimeMs < cutoff) {
      unlinkSync(filePath);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`Pruned ${pruned} Google Drive backup(s) older than ${GOOGLE_DRIVE_RETENTION_DAYS} days.`);
}

main().catch(err => {
  console.error('snapshot-production failed:', err.message);
  process.exit(1);
});
