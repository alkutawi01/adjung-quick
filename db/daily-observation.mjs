// daily-observation.mjs — Fasa 1 (Observation & Stabilization) tooling,
// per docs/roadmap-to-production-v1.md.
//
// Closes the gap named in docs/observability-readiness-audit-v1.md:
// everything the monitoring plan needs was already queryable, but
// nothing kept HISTORY across runs — each snapshot overwrote the last,
// so "is today different from yesterday" depended on a human remembering
// yesterday's numbers. This script records a small dated metrics file
// per run (metrics only, not full data — cheap to keep many) and prints
// a day-over-day diff plus any alert conditions from
// docs/post-launch-monitoring-plan-v1.md.
//
// READ-ONLY against production. No write guard needed (only SELECTs),
// same as db/snapshot-production.mjs.
//
// Usage: node db/daily-observation.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { RSS_SOURCES } from '../lab/sources.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSERVATION_DIR = `${__dirname}/observations`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EDITIONS = ['ms-MY', 'en-global', 'ar-global'];

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

function countBy(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1;
  return out;
}

async function gatherMetrics() {
  const [sources, clusters, items, placements, saved, history] = await Promise.all([
    selectAllChunked('sources', 'id, name'),
    selectAllChunked('story_clusters', 'id'),
    selectAllChunked('rss_items', 'id, source_id, published_at'),
    selectAllChunked('edition_story_classifications', 'story_id, edition_id, field, classification_status'),
    selectAllChunked('saved_stories', 'id'),
    selectAllChunked('history_entries', 'id'),
  ]);

  // Per-edition field distribution + unclassified count.
  const editions = {};
  for (const ed of EDITIONS) {
    const forEdition = placements.filter(p => p.edition_id === ed);
    const classified = forEdition.filter(p => p.classification_status === 'classified');
    editions[ed] = {
      total: forEdition.length,
      classified: classified.length,
      unclassified: forEdition.length - classified.length,
      fields: countBy(classified, 'field'),
    };
  }

  // Source health: which sources actually contributed items. A source
  // registered but contributing nothing is the "source dying" signal
  // the monitoring plan asks about — BUT only if it was expected to
  // work. Sources already marked broken in lab/sources.js (e.g. JAKIM's
  // known failed_tls certificate problem) are separated out: an alert
  // that fires daily for a problem already recorded in the registry is
  // noise, and noise is how real alerts get ignored.
  const itemsBySource = countBy(items, 'source_id');
  const registryStatus = new Map(RSS_SOURCES.map(s => [s.id, s.status]));
  const allSilent = sources.filter(s => !itemsBySource[s.id]).map(s => s.id);
  const silentSources = allSilent.filter(id => (registryStatus.get(id) ?? 'active') === 'active');
  const knownBrokenSources = allSilent.filter(id => (registryStatus.get(id) ?? 'active') !== 'active');

  return {
    observedAt: new Date().toISOString(),
    counts: {
      sources: sources.length,
      sourcesContributing: Object.keys(itemsBySource).length,
      clusters: clusters.length,
      items: items.length,
      placements: placements.length,
      savedStories: saved.length,
      historyEntries: history.length,
    },
    silentSources,
    knownBrokenSources,
    editions,
  };
}

// --- history ---

function loadPreviousObservation(currentFile) {
  if (!readdirSync(OBSERVATION_DIR).length) return null;
  const files = readdirSync(OBSERVATION_DIR)
    .filter(f => /^observation-.*\.json$/.test(f) && f !== currentFile)
    .sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(`${OBSERVATION_DIR}/${files[files.length - 1]}`, 'utf-8'));
}

function delta(now, before) {
  if (before == null) return '';
  const d = now - before;
  if (d === 0) return '  (unchanged)';
  return d > 0 ? `  (+${d})` : `  (${d})`;
}

// --- alerts, per docs/post-launch-monitoring-plan-v1.md §2-3 ---

export function evaluateAlerts(current, previous) {
  const alerts = [];

  if (previous) {
    if (current.counts.clusters <= previous.counts.clusters) {
      alerts.push(
        `Cluster count did not grow since the last observation ` +
        `(${previous.counts.clusters} → ${current.counts.clusters}). ` +
        `One flat reading can just be a quiet news period; two consecutive ` +
        `flat/shrinking readings is the real ingestion-stall signal.`
      );
    }

    for (const ed of EDITIONS) {
      const before = previous.editions?.[ed]?.fields ?? {};
      const now = current.editions[ed].fields;
      for (const [field, wasCount] of Object.entries(before)) {
        if (wasCount >= 3 && !now[field]) {
          alerts.push(`${ed}: field "${field}" dropped from ${wasCount} stories to ZERO — real regression, not a slow news day.`);
        }
      }
      const beforeUnclassified = previous.editions?.[ed]?.unclassified;
      const nowUnclassified = current.editions[ed].unclassified;
      if (beforeUnclassified != null && nowUnclassified > beforeUnclassified * 1.5 && nowUnclassified - beforeUnclassified >= 10) {
        alerts.push(`${ed}: unclassified jumped sharply (${beforeUnclassified} → ${nowUnclassified}).`);
      }
    }
  }

  // Trigger B — same rule as db/snapshot-production.mjs, repeated here
  // so whichever script gets run still surfaces it.
  const userDataRows = current.counts.savedStories + current.counts.historyEntries;
  if (userDataRows > 0) {
    alerts.push(
      `SUPABASE UPGRADE TRIGGER B — real user data now exists ` +
      `(saved_stories: ${current.counts.savedStories}, history_entries: ${current.counts.historyEntries}). ` +
      `See docs/production-safety-decision-proposal-v1.md.`
    );
  }

  if (current.silentSources.length) {
    alerts.push(
      `${current.silentSources.length} ACTIVE source(s) contributed ZERO items: ${current.silentSources.join(', ')} — ` +
      `these are not marked broken in lab/sources.js, so this is unexpected.`
    );
  }

  // A source recovering on its own is worth knowing about too — it means
  // the registry's status field is now stale and should be corrected.
  if (previous) {
    const recovered = (previous.knownBrokenSources ?? []).filter(id => !(current.knownBrokenSources ?? []).includes(id) && !current.silentSources.includes(id));
    if (recovered.length) {
      alerts.push(`Source(s) previously marked broken are now producing items: ${recovered.join(', ')} — update their status in lab/sources.js.`);
    }
  }

  return alerts;
}

// --- report ---

function report(current, previous) {
  console.log(`\nDAILY OBSERVATION — ${current.observedAt.slice(0, 10)}`);
  if (previous) console.log(`Comparing against: ${previous.observedAt.slice(0, 10)}\n`);
  else console.log(`No previous observation found — this is the first, so no diff yet.\n`);

  console.log('PIPELINE');
  for (const [key, value] of Object.entries(current.counts)) {
    console.log(`  ${key.padEnd(22)} ${String(value).padStart(6)}${delta(value, previous?.counts?.[key])}`);
  }

  for (const ed of EDITIONS) {
    const e = current.editions[ed];
    const pe = previous?.editions?.[ed];
    const pct = e.total ? Math.round((e.classified / e.total) * 100) : 0;
    console.log(`\n${ed} — ${e.classified}/${e.total} classified (${pct}%)${delta(e.classified, pe?.classified)}`);
    const sorted = Object.entries(e.fields).sort((a, b) => b[1] - a[1]);
    for (const [field, count] of sorted) {
      console.log(`  ${field.padEnd(22)} ${String(count).padStart(4)}${delta(count, pe?.fields?.[field])}`);
    }
    // Fields that existed before and are gone entirely now.
    for (const [field, was] of Object.entries(pe?.fields ?? {})) {
      if (!e.fields[field]) console.log(`  ${field.padEnd(22)} ${String(0).padStart(4)}  (${-was})`);
    }
    if (e.unclassified) console.log(`  ${'(unclassified)'.padEnd(22)} ${String(e.unclassified).padStart(4)}${delta(e.unclassified, pe?.unclassified)}`);
  }

  const alerts = evaluateAlerts(current, previous);
  console.log('\nALERTS');
  if (!alerts.length) console.log('  None — nothing crossed a monitoring-plan threshold.');
  else for (const a of alerts) console.log(`  ⚠️  ${a}`);

  if (current.knownBrokenSources?.length) {
    console.log(`\nKNOWN-BROKEN SOURCES (expected, not an alert)`);
    for (const id of current.knownBrokenSources) {
      const src = RSS_SOURCES.find(s => s.id === id);
      console.log(`  ${id} — ${src?.status ?? 'unknown'}${src?.statusReason ? `: ${src.statusReason}` : ''}`);
    }
  }
}

async function main() {
  mkdirSync(OBSERVATION_DIR, { recursive: true });
  const current = await gatherMetrics();
  const fileName = `observation-${current.observedAt.slice(0, 10)}.json`;
  const previous = loadPreviousObservation(fileName);

  report(current, previous);

  writeFileSync(`${OBSERVATION_DIR}/${fileName}`, JSON.stringify(current, null, 2));
  console.log(`\nRecorded: db/observations/${fileName}`);
  console.log('Read-only — no production data was modified.\n');
}

// Only run when executed directly — importing this module (e.g. from
// daily-observation.test.mjs to test evaluateAlerts in isolation) must
// never trigger a real production query.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(err => {
    console.error('daily-observation failed:', err.message);
    process.exit(1);
  });
}
