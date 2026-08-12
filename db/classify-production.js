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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const WRITE = process.argv.includes('--write');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(`\nPRODUCTION CLASSIFICATION WIRING — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);

  // Pull clusters + their member items. The classifier needs the item's
  // own signals (link/categories/title), not the cluster's legacy topic.
  const [{ data: clusters, error: cErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from('story_clusters').select('id, topic, workspace_state'),
    supabase.from('rss_items').select('id, cluster_id, source_id, title, description, link, categories, source_known_category, published_at'),
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
      if (!stats[editionId]) stats[editionId] = {};
      const bucket = stats[editionId];
      const key = result.field ?? '(unclassified)';
      bucket[key] = (bucket[key] ?? 0) + 1;

      rows.push({
        story_id: cluster.id,
        edition_id: editionId,
        field: result.field,
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
