// classify-production.js — Production Classification Wiring (Session
// UI-1.1A, 2026-08-12).
//
// Runs the FROZEN classification engine (classification/*.mjs, validated
// across Batch A/M/U/Medium — docs/evidence-policy-v1-decision.md) against
// existing production story_clusters, and writes per-edition placements
// into edition_story_classifications.
//
// This changes NO classification logic. The engine stays exactly as
// calibrated; this only connects its output to the production data path —
// the step that was deferred while the engine was being built, and which
// UI-1.1 exposed as the reason the Wheel still reads the OLD classifier's
// story_clusters.topic (Politics/Economy/Sports/World/Science/Health), a
// vocabulary with ZERO overlap with any edition's real taxonomy.
//
// Usage:
//   node db/classify-production.js --dry-run   (default: prints, writes nothing)
//   node db/classify-production.js --write     (actually upserts)
//
// Requires db/schema-edition-classification.sql to have been run first.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { understandStory } from '../classification/story-understanding.mjs';
import { classifyForAllEditions } from '../classification/edition-classification.mjs';
import { isEditionEligible } from './edition-representation-eligibility.mjs';
import { EDITIONS } from '../state/editions.js';
import { assertWriteAllowed } from './production-write-guard.mjs';
import { loadTaxonomyRegistryFromDB } from '../classification/lib/taxonomy-registry.mjs';
import { rebuildEditionTaxonomy } from '../classification/lib/edition-taxonomy.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const WRITE = process.argv.includes('--write');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  // Per docs/production-write-guard-v1.md: only --write mode is
  // destructive (it truncates edition_story_classifications) — a
  // --dry-run never writes, so it never needs the guard.
  if (WRITE) assertWriteAllowed();

  console.log(`\nPRODUCTION CLASSIFICATION WIRING — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);

  // Backend Control Plane Phase 2 (2026-08-17): load taxonomy from
  // taxonomy_fields ONCE here, before the classification loop below —
  // per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §1.
  // Every function this cache feeds (resolveDefaultPlacement(),
  // getFieldEntry*()) stays fully synchronous; only this one startup
  // step is async.
  await loadTaxonomyRegistryFromDB(supabase);
  rebuildEditionTaxonomy();
  console.log('Taxonomy loaded from taxonomy_fields (backend source of truth).\n');

  // Pull clusters + their member items. The classifier needs the item's
  // own signals (link/categories/title), not the cluster's legacy topic.
  const [{ data: clusters, error: cErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from('story_clusters').select('id, topic, workspace_state'),
    supabase.from('rss_items').select('id, cluster_id, source_id, title, description, link, categories, source_known_category, published_at, language'),
  ]);
  if (cErr) throw new Error(`story_clusters — ${cErr.message}`);
  if (iErr) throw new Error(`rss_items — ${iErr.message}`);

  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  const active = clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released');
  console.log(`${active.length} active clusters (of ${clusters.length} total), ${items.length} items.\n`);

  const rows = [];
  // Derived from whatever classifyForAllEditions() actually returns, rather
  // than a hardcoded key list — that hardcoding is exactly what broke when
  // en/ar were renamed to en-global/ar-global.
  const stats = {};
  let noItems = 0;
  let skippedIneligible = 0;

  for (const cluster of active) {
    const members = itemsByCluster.get(cluster.id) ?? [];
    if (members.length === 0) { noItems++; continue; }

    // Classify from the cluster's CANONICAL (earliest) item, matching how
    // productionAdapter.js already picks a canonical representative.
    const canonical = [...members].sort((a, b) => new Date(a.published_at) - new Date(b.published_at))[0];
    const understanding = understandStory({
      title: canonical.title,
      description: canonical.description,
      link: canonical.link,
      categories: canonical.categories ?? [],
      sourceKnownCategory: canonical.source_known_category ?? undefined,
    });
    const editions = classifyForAllEditions(understanding);

    for (const [editionId, result] of Object.entries(editions)) {
      // Edition Representation Eligibility Gate (docs/edition-representation-eligibility-policy.md,
      // 2026-08-13): a placement row is never created for an edition the
      // cluster has no representation in — found live when en-global's
      // "Religion" showed 20 classified stories that were all Malay-only,
      // permanently invisible in the UI (Edition Locale Authority). Story
      // Understanding / Edition Classification stay untouched; this gate
      // sits after them, before persistence.
      if (!isEditionEligible({ members }, EDITIONS[editionId].locale)) {
        skippedIneligible++;
        continue;
      }

      if (!stats[editionId]) stats[editionId] = {};
      const bucket = stats[editionId];
      const key = result.field ?? '(unclassified)';
      bucket[key] = (bucket[key] ?? 0) + 1;

      rows.push({
        story_id: cluster.id,
        edition_id: editionId,
        field: result.field,
        // Taxonomy Stable Field-ID V1 (docs/taxonomy-stable-field-id-design-v1.md,
        // Option C, locked by ChatGPT 2026-08-16): field_code is what every
        // consumer compares going forward, never the mutable label above.
        // subject_code preserves the raw Universal Subject fact — null is
        // correct for geography-residual/unclassified results, not a gap.
        field_code: result.field_code,
        subject_code: result.subject_code,
        sub_field: result.sub_field,
        classification_status: result.classification_status,
        classification_method: result.classification_method,
        classification_rule: result.classification_rule,
        classification_confidence: result.confidence,
        ruleset_version: result.ruleset_version,
      });
    }
  }

  if (noItems > 0) console.log(`(${noItems} clusters skipped — no member items fetched)\n`);
  if (skippedIneligible > 0) console.log(`(${skippedIneligible} edition placements skipped — no representation in that edition's locale, per Edition Representation Eligibility Gate)\n`);

  for (const [editionId, bucket] of Object.entries(stats)) {
    const total = Object.values(bucket).reduce((a, b) => a + b, 0);
    const classified = total - (bucket['(unclassified)'] ?? 0);
    console.log(`=== ${editionId} — ${classified}/${total} classified (${Math.round(classified / total * 100)}%) ===`);
    for (const [field, count] of Object.entries(bucket).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(field).padEnd(20)} ${count}`);
    }
    console.log('');
  }

  if (!WRITE) {
    console.log(`DRY RUN — ${rows.length} rows would be upserted. Re-run with --write to apply.\n`);
    return;
  }

  // BUG FOUND live (2026-08-13, right after adding the Representation
  // Eligibility Gate above): upsert alone does NOT delete rows that this
  // run no longer produces. The gate's whole purpose is to STOP writing
  // ineligible placements (e.g. a Malay-only story's en-global "Religion"
  // row) — but every ineligible row written by an EARLIER run (before the
  // gate existed) stayed in the table untouched, since upsert only
  // touches rows present in `rows`. Confirmed live: table had 2595 rows
  // after a --write that only produced 867. Truncate first — this script
  // already fully regenerates its output from `active` every run (same
  // full-recompute pattern as db/ingest-production.js), so there is no
  // partial/incremental state here worth preserving between runs.
  const { error: truncateErr } = await supabase.from('edition_story_classifications').delete().not('story_id', 'is', null);
  if (truncateErr) throw new Error(`truncate edition_story_classifications — ${truncateErr.message}`);

  // Upsert in batches; onConflict on the composite PK makes this safely
  // re-runnable (a later calibration round re-runs the same script).
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('edition_story_classifications')
      .upsert(chunk, { onConflict: 'story_id,edition_id' });
    if (error) throw new Error(`upsert batch ${i / BATCH} — ${error.message}`);
    written += chunk.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`\nDone. ${written} rows written to edition_story_classifications.\n`);
}

main().catch(err => {
  console.error('classify-production failed:', err.message);
  process.exit(1);
});
