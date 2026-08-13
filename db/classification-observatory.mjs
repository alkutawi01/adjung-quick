// classification-observatory.mjs — per ChatGPT (2026-08-13), the missing
// "Editorial Observatory" layer: this project had a Reader View (the
// Wheel/Active Set) but no Editorial View — a founder/editor had no way
// to answer "how many stories got mapped to an existing Bidang, how many
// are unclassified, and is anything obviously misplaced?" without opening
// the database directly. This is that view.
//
// READ-ONLY. Runs the frozen classification engine exactly like
// db/classify-production.js's dry-run does, but never writes, and adds
// the diagnostic samples (unclassified/low-confidence/possible-mismatch)
// that classify-production.js's own output doesn't surface. No
// classifier, taxonomy, or ranking change of any kind.
//
// Usage: node db/classification-observatory.mjs [edition]
//   edition defaults to ms-MY (the edition the taxonomy question is about)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { understandStory } from '../classification/story-understanding.mjs';
import { classifyForAllEditions } from '../classification/edition-classification.mjs';
import { isEditionEligible } from './edition-representation-eligibility.mjs';
import { EDITIONS } from '../state/editions.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TARGET_EDITION = process.argv[2] ?? 'ms-MY';
const LOW_CONFIDENCE_THRESHOLD = 0.5; // reporting cutoff only, not a classifier parameter
const SAMPLE_SIZE = 20;

// Same transient-error retry as db/daily-observation.mjs / db/snapshot-production.mjs.
const TRANSIENT_PATTERNS = [/JWT issued at future/i, /fetch failed/i];
async function withRetry(label, fn, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err) {
      if (!TRANSIENT_PATTERNS.some(p => p.test(err.message)) || i === attempts) throw err;
      console.log(`  (transient error on ${label}: ${err.message} — retry ${i}/${attempts - 1})`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

async function main() {
  console.log(`\nCLASSIFICATION OBSERVATORY — read-only — edition: ${TARGET_EDITION}\n`);

  const [{ data: clusters, error: cErr }, { data: items, error: iErr }] = await withRetry('fetch', () => Promise.all([
    supabase.from('story_clusters').select('id, workspace_state'),
    supabase.from('rss_items').select('id, cluster_id, source_id, title, description, link, categories, source_known_category, published_at, language'),
  ]));
  if (cErr) throw new Error(`story_clusters — ${cErr.message}`);
  if (iErr) throw new Error(`rss_items — ${iErr.message}`);

  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }
  const active = clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released');

  // --- Run the full pipeline once per cluster, keep the per-cluster
  // detail around for the sample sections below (classify-production.js's
  // dry-run discards this after tallying counts). ---
  const results = [];
  let noItems = 0;
  for (const cluster of active) {
    const members = itemsByCluster.get(cluster.id) ?? [];
    if (members.length === 0) { noItems++; continue; }
    const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
    const understanding = understandStory({
      title: canonical.title,
      description: canonical.description,
      link: canonical.link,
      categories: canonical.categories ?? [],
      sourceKnownCategory: canonical.source_known_category ?? undefined,
    });
    const editions = classifyForAllEditions(understanding);
    const eligible = isEditionEligible({ members }, EDITIONS[TARGET_EDITION].locale);
    results.push({ cluster, canonical, understanding, result: editions[TARGET_EDITION], eligible });
  }

  // --- 1. Classification Funnel ---
  const understood = results.filter(r => (r.understanding.subject_candidates ?? []).length > 0);
  const classified = results.filter(r => r.result.classification_status === 'classified');
  const placed = classified.filter(r => r.eligible);

  console.log('CLASSIFICATION FUNNEL');
  console.log(`  RSS items (raw)                    ${items.length}`);
  console.log(`  Active story_clusters               ${active.length}  (${noItems} skipped — no member items)`);
  console.log(`  -> has >=1 subject candidate         ${understood.length}  (${results.length - understood.length} with ZERO — pure geography/unclassified)`);
  console.log(`  -> classified for ${TARGET_EDITION}${' '.repeat(Math.max(0, 12 - TARGET_EDITION.length))}${classified.length}  (${results.length - classified.length} unclassified)`);
  console.log(`  -> eligible placement written        ${placed.length}  (${classified.length - placed.length} dropped by Representation Eligibility Gate)`);
  console.log('');

  // --- 2. Field Distribution ---
  const byField = new Map();
  for (const r of placed) byField.set(r.result.field, (byField.get(r.result.field) ?? 0) + 1);
  console.log(`FIELD DISTRIBUTION — ${TARGET_EDITION}`);
  for (const [field, count] of [...byField.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(field).padEnd(20)} ${count}`);
  }
  console.log('');

  // --- 3. Unclassified queue sample ---
  const unclassified = results.filter(r => r.result.classification_status === 'unclassified');
  console.log(`UNCLASSIFIED QUEUE — ${unclassified.length} total, showing up to ${SAMPLE_SIZE}`);
  for (const r of unclassified.slice(0, SAMPLE_SIZE)) {
    const hasSubject = (r.understanding.subject_candidates ?? []).length > 0;
    const hasGeo = (r.understanding.geography_candidates ?? []).length > 0;
    const reason = !hasSubject && !hasGeo ? 'no subject or geography evidence at all'
      : !hasSubject ? 'no subject candidate (geography exists but this edition has no residual fallback)'
      : 'subject candidate(s) exist but none map to this edition\'s taxonomy, and no geography fallback';
    console.log(`  [${r.canonical.source_id}] ${r.canonical.title}`);
    console.log(`      reason: ${reason}`);
  }
  console.log('');

  // --- 4. Low-confidence sample ---
  const lowConfidence = classified.filter(r => r.result.confidence < LOW_CONFIDENCE_THRESHOLD);
  console.log(`LOW-CONFIDENCE PLACEMENTS (< ${LOW_CONFIDENCE_THRESHOLD}) — ${lowConfidence.length} total, showing up to ${SAMPLE_SIZE}`);
  for (const r of lowConfidence.slice(0, SAMPLE_SIZE)) {
    console.log(`  [${r.canonical.source_id}] ${r.canonical.title}`);
    console.log(`      field: ${r.result.field}  confidence: ${r.result.confidence}  method: ${r.result.classification_method}`);
  }
  console.log('');

  // --- 5. Possible mismatch sample ---
  // A story where real title/description TEXT (Tier 5 content-rule
  // evidence) points at a DIFFERENT UNIVERSAL SUBJECT than the one that
  // actually won placement. Not necessarily wrong — a higher tier
  // legitimately outranks a weak text match — but worth a human glance,
  // since this is exactly the shape of the real vaccine/HTML-leak
  // incident found earlier this session, just without assuming which
  // direction is the error.
  //
  // Must compare SUBJECT to SUBJECT (both from story-understanding.mjs's
  // universal vocabulary, e.g. "Politics"/"Disaster") — never subject to
  // `result.field`, which is the EDITION's own localized display label
  // (e.g. ms-MY's "Politik"). An earlier version of this script compared
  // those directly and flagged ~1/3 of all classified stories as
  // "mismatched" purely because "Politics" != "Politik" as strings —
  // a false-positive from comparing two different vocabularies, not a
  // real finding. The winning subject is recovered from
  // classification_rule's own "story_understanding.subject:X -> ..."
  // encoding, which only 'default_mapping'/'low_confidence_fallback'
  // produce — 'edition_rule' matches don't derive from a single subject
  // candidate this cleanly, so those are left out rather than guessed.
  const SUBJECT_RULE_PATTERN = /story_understanding\.subject:([^ ]+) ->/;
  const possibleMismatch = classified
    .map(r => {
      const ruleMatch = SUBJECT_RULE_PATTERN.exec(r.result.classification_rule ?? '');
      if (!ruleMatch) return null; // edition_rule or geography_fallback — no single subject to compare against
      const winningSubject = ruleMatch[1];
      const contentHits = (r.understanding.subject_candidates ?? [])
        .filter(c => c.evidence?.some(e => e.evidence_type === 'title_keyword'));
      const conflicting = contentHits.filter(c => c.value !== winningSubject);
      return conflicting.length ? { ...r, winningSubject, conflicting } : null;
    })
    .filter(Boolean);
  console.log(`POSSIBLE MISMATCH (content evidence points elsewhere) — ${possibleMismatch.length} total, showing up to ${SAMPLE_SIZE}`);
  for (const r of possibleMismatch.slice(0, SAMPLE_SIZE)) {
    console.log(`  [${r.canonical.source_id}] ${r.canonical.title}`);
    console.log(`      placed: ${r.result.field} (winning subject: ${r.winningSubject})  |  content evidence also suggests: ${r.conflicting.map(c => `${c.value}@${c.confidence}`).join(', ')}`);
  }
  console.log('');

  console.log('Read-only — no production data was modified, no classifier/taxonomy/ranking logic changed.\n');
}

main().catch(err => {
  console.error('classification-observatory failed:', err.message);
  process.exit(1);
});
