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
// UPDATED 2026-08-15 (FASA 4.1, docs/operational-visibility-data-contract-v1.md):
// no longer read-only. Also writes ONE summary row to
// operational_snapshots — the mechanism that gets this script's numbers
// in front of the admin (via an anon-safe view), since the local JSON
// files below were never reachable outside this machine. That write is
// gated by db/production-write-guard.mjs, same as every other write
// script in this project; everything else here remains a plain SELECT.
//
// Usage: node db/daily-observation.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { RSS_SOURCES } from '../lab/sources.js';
import { RANKING_FLAGS } from '../state/rankingFlags.js';
import { assertWriteAllowed } from './production-write-guard.mjs';
import { loadFieldCandidates, editorialSelect } from '../ranking/shadow-runner.mjs';

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

// Supabase intermittently rejects a request with "JWT issued at future"
// — a clock-skew artifact between this machine and Supabase's auth
// service, not a code fault, and it clears on an immediate retry. Hit
// repeatedly on 2026-08-13. Retried here rather than left manual,
// because this script is meant to be a daily habit: a command that
// randomly fails and needs rerunning is a command that stops being run.
const TRANSIENT_PATTERNS = [/JWT issued at future/i, /fetch failed/i];

async function withRetry(label, fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!TRANSIENT_PATTERNS.some(p => p.test(err.message)) || i === attempts) throw err;
      console.log(`  (transient error on ${label}: ${err.message} — retry ${i}/${attempts - 1})`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  throw lastError;
}

async function selectAllChunked(table, columns) {
  return withRetry(table, async () => {
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
  });
}

function countBy(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1;
  return out;
}

async function gatherMetrics() {
  const [sources, clusters, items, placements, saved, history, activeOverrides] = await Promise.all([
    selectAllChunked('sources', 'id, name'),
    selectAllChunked('story_clusters', 'id'),
    selectAllChunked('rss_items', 'id, source_id, published_at'),
    // `classification_confidence` added for FASA 4.1's operational_snapshots
    // review_queue_count — needs the same low-confidence predicate
    // ui/src/admin/reviewQueueAdapter.js's fetchReviewQueue() uses, not
    // just classification_status.
    selectAllChunked('edition_story_classifications', 'story_id, edition_id, field, classification_status, classification_confidence'),
    selectAllChunked('saved_stories', 'id'),
    selectAllChunked('history_entries', 'id'),
    // FASA 4.1: active, unexpired overrides — mirrors the same
    // active=true AND expires_at>now() definition used everywhere else
    // this phase (the view, fetchReviewQueue, fetchDigest).
    withRetry('active_overrides', () =>
      supabase.from('story_overrides').select('id').eq('active', true).gt('expires_at', new Date().toISOString()).then(r => {
        if (r.error) throw new Error(r.error.message);
        return r.data;
      })),
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

  // Ranking pilot stability — per ChatGPT's suggested metric list for
  // the Observation Layer. Records WHICH stories the Editorial Ranking
  // Engine currently selects for each field that's actually on
  // editorial_v1 (only ms-MY.politics today, read from RANKING_FLAGS so
  // this follows activation automatically rather than hardcoding).
  // Taxonomy Stable Field-ID V1 (2026-08-16): `key` below is now
  // `${edition}.${field_code}` (e.g. 'ms-MY.politics'), not the label —
  // survives a Bidang rename automatically, since RANKING_FLAGS/
  // loadFieldCandidates() both operate on field_code now.
  //
  // Interpreting it: low overlap day-over-day is NOT automatically bad —
  // a news reader SHOULD churn as new stories arrive. What this makes
  // visible is the difference between normal churn and something
  // structurally wrong (e.g. the pilot field's candidate pool collapsing,
  // or the selection freezing entirely).
  const rankingPilots = {};
  for (const [edition, fields] of Object.entries(RANKING_FLAGS)) {
    for (const [field, version] of Object.entries(fields)) {
      if (version !== 'editorial_v1') continue;
      const key = `${edition}.${field}`;
      try {
        const candidates = await withRetry(key, () => loadFieldCandidates(edition, field));
        const selected = editorialSelect(candidates, 10);
        rankingPilots[key] = {
          version,
          candidatePoolSize: candidates.length,
          selectedStoryIds: selected.map(s => s.storyId),
        };
      } catch (err) {
        rankingPilots[key] = { version, error: err.message };
      }
    }
  }

  // FASA 4.1 operational_snapshots: ms-MY only, matching
  // fetchReviewQueue()'s own scope and predicate (unclassified OR
  // confidence < 0.5) — this is a rough daily health number, not a
  // live-precision count (it doesn't exclude already-resolved stories
  // the way the real Review Queue does), which is fine for a historical
  // snapshot per docs/operational-visibility-data-contract-v1.md's own
  // "what happened, not what needs deciding right now" scope.
  const reviewQueueCount = placements.filter(p =>
    p.edition_id === 'ms-MY' &&
    (p.classification_status === 'unclassified' || Number(p.classification_confidence) < 0.5),
  ).length;

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
    rankingPilots,
    // Carried separately from `counts` — these two exist ONLY to feed
    // operational_snapshots' summary row, not part of the original
    // Fasa 1 observation shape.
    reviewQueueCount,
    activeOverrideCount: activeOverrides.length,
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

  // Ranking pilot: only alert on structurally wrong states, never on
  // ordinary day-to-day churn (a news reader is SUPPOSED to change).
  for (const [key, pilot] of Object.entries(current.rankingPilots ?? {})) {
    if (pilot.error) {
      alerts.push(`Ranking pilot ${key} failed to evaluate: ${pilot.error}`);
      continue;
    }
    if (pilot.candidatePoolSize === 0) {
      alerts.push(`Ranking pilot ${key} has an EMPTY candidate pool — the field the Editorial Ranking Engine is piloting on has no stories at all.`);
    } else if (pilot.selectedStoryIds.length === 0) {
      alerts.push(`Ranking pilot ${key} selected nothing despite ${pilot.candidatePoolSize} candidates available — selection is broken, not merely quiet.`);
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

  const pilots = Object.entries(current.rankingPilots ?? {});
  if (pilots.length) {
    console.log('\nRANKING PILOT');
    for (const [key, pilot] of pilots) {
      if (pilot.error) { console.log(`  ${key} — ERROR: ${pilot.error}`); continue; }
      const before = previous?.rankingPilots?.[key]?.selectedStoryIds;
      let stability = '';
      if (before?.length) {
        const kept = pilot.selectedStoryIds.filter(id => before.includes(id)).length;
        const pct = Math.round((kept / before.length) * 100);
        stability = `  |  ${pct}% of yesterday's selection retained (${kept}/${before.length}) — churn is normal for a news reader, this is context not a score`;
      }
      console.log(`  ${key} (${pilot.version}) — ${pilot.selectedStoryIds.length} selected from ${pilot.candidatePoolSize} candidates${delta(pilot.candidatePoolSize, previous?.rankingPilots?.[key]?.candidatePoolSize)}`);
      if (stability) console.log(`   ${stability}`);
    }
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

  // FASA 4.1 (docs/operational-visibility-data-contract-v1.md): the ONE
  // write this script now makes — a single summary row upserted into
  // operational_snapshots, gated by the same production-write-guard
  // every other write script in this project uses. Non-fatal if the
  // guard isn't satisfied: the local JSON file + console report above
  // are still a complete, useful read-only run on their own — this
  // script's own "daily habit" design shouldn't require production-write
  // env vars just to look at the numbers locally.
  try {
    assertWriteAllowed();
    const { error } = await supabase.from('operational_snapshots').upsert({
      snapshot_date: current.observedAt.slice(0, 10),
      stories_processed: current.counts.clusters,
      review_queue_count: current.reviewQueueCount,
      failed_sources_count: current.silentSources.length,
      active_override_count: current.activeOverrideCount,
    }, { onConflict: 'snapshot_date' });
    if (error) throw new Error(error.message);
    console.log(`Snapshot recorded to operational_snapshots for ${current.observedAt.slice(0, 10)}.`);
  } catch (err) {
    console.log(`\noperational_snapshots NOT written: ${err.message}`);
    console.log('(Set DATABASE_ENV=production CONFIRM_PRODUCTION_WRITE=true to record it.)');
  }

  console.log('Everything else in this script remains read-only.\n');
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
