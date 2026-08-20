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
//   node db/classify-production.js --write --force
//     (bypasses the >=50% row-count-drop guard in writeClassificationRows() --
//     use only after confirming a large drop is genuinely expected, e.g. a
//     deliberate mass-archive, never as a reflex when the guard fires.)
//
// Requires db/schema-edition-classification.sql to have been run first.

import 'dotenv/config';
import { pathToFileURL } from 'url';
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
const FORCE = process.argv.includes('--force');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Extracted per docs/control-plane-phase3-production-wiring-audit-plan-v1.md
// so the wiring itself (not just resolveClassificationRule() in isolation)
// is directly testable — this is the exact shape classification-rules-
// resolver.mjs's matchesRule() needs (item.sourceId/link/title/description),
// pulled from a canonical rss_items row. Pure mapping, no classifier logic.
export function buildRuleMatchItem(canonical) {
  return { sourceId: canonical.source_id, link: canonical.link, title: canonical.title, description: canonical.description };
}

// P0-B (docs/p0-classification-backlog-incident-v1.md): extracted so
// ingest-production.js can run the exact same compute step right after a
// successful swap, without shelling out to a second process. Takes the
// caller's OWN supabase client (never a module-level singleton) so a
// caller that already holds a connection reuses it, same posture as every
// adapter in ui/src/admin that accepts `supabase` as a parameter.
//
// Pure I/O + the frozen classifier — no writes here. Returns everything
// main()'s CLI printing needs, so the CLI path below stays a thin wrapper
// around this rather than a second, drifting copy of the same logic.
export async function computeClassificationRows(client) {
  // Backend Control Plane Phase 2 (2026-08-17): load taxonomy from
  // taxonomy_fields ONCE here, before the classification loop below —
  // per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §1.
  // Every function this cache feeds (resolveDefaultPlacement(),
  // getFieldEntry*()) stays fully synchronous; only this one startup
  // step is async.
  await loadTaxonomyRegistryFromDB(client);
  rebuildEditionTaxonomy();

  // Backend Control Plane Phase 3 production wiring (per docs/control-
  // plane-phase3-production-wiring-audit-plan-v1.md): fetch active
  // classification_rules ONCE here, before the loop — same pattern as
  // the taxonomy load above. classifyForAllEditions() itself already
  // scopes global-vs-edition-specific rules internally; this script only
  // needs to supply the flat active set.
  const { data: activeRules, error: rErr } = await client
    .from('classification_rules')
    .select('id, rule_type, edition_id, pattern, field_code, subject_code, priority')
    .eq('status', 'active');
  if (rErr) throw new Error(`classification_rules — ${rErr.message}`);

  // Backend Control Plane Fasa 4 (edition_rules): same one-time fetch
  // pattern. Unlike classification_rules, edition_rules has no global
  // case (edition_id is always required) — classifyForAllEditions()
  // still does the per-edition equality filter itself, this script only
  // supplies the flat active set.
  const { data: activeEditionRules, error: erErr } = await client
    .from('edition_rules')
    .select('id, edition_id, condition_subject, condition_geography_type, condition_geography_value, action_field_code, priority')
    .eq('status', 'active');
  if (erErr) throw new Error(`edition_rules — ${erErr.message}`);

  // Pull clusters + their member items. The classifier needs the item's
  // own signals (link/categories/title), not the cluster's legacy topic.
  const [{ data: clusters, error: cErr }, { data: items, error: iErr }] = await Promise.all([
    client.from('story_clusters').select('id, topic, workspace_state'),
    client.from('rss_items').select('id, cluster_id, source_id, title, description, link, categories, source_known_category, published_at, language'),
  ]);
  if (cErr) throw new Error(`story_clusters — ${cErr.message}`);
  if (iErr) throw new Error(`rss_items — ${iErr.message}`);

  const itemsByCluster = new Map();
  for (const row of items) {
    if (!itemsByCluster.has(row.cluster_id)) itemsByCluster.set(row.cluster_id, []);
    itemsByCluster.get(row.cluster_id).push(row);
  }

  const active = clusters.filter(c => c.workspace_state !== 'expired' && c.workspace_state !== 'released');

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
    const editions = classifyForAllEditions(
      understanding,
      undefined, // thresholdOverride — unchanged, was never passed before this change
      buildRuleMatchItem(canonical),
      activeRules,
      activeEditionRules,
    );

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

  // P0-B.1 (docs/p0-classification-backlog-incident-v1.md): the exact set
  // of active cluster IDs this computation was run against -- the
  // "generation" writeClassificationRows() must prove is still current
  // before it's allowed to write. The advisory lock alone only serializes
  // two WRITES; it says nothing about which one's underlying COMPUTE is
  // stale. Real scenario ChatGPT named: a slow manual --write started
  // against generation G1 finishes computing after an ingestion has
  // already produced G2 and the automatic hook has already written G2 --
  // the lock lets the slow G1 write proceed cleanly (no PK collision), but
  // it silently overwrites the fresh G2 classification with stale G1
  // results. The row-count floor guard doesn't catch this either if G1
  // and G2 happen to be similar sizes.
  const activeClusterIds = active.map(c => c.id);

  return { rows, stats, noItems, skippedIneligible, activeClusterIds, activeClusterCount: active.length, totalClusterCount: clusters.length, totalItemCount: items.length };
}

// P0-B: the atomic write, extracted for the same reason as
// computeClassificationRows() above — ingest-production.js's post-swap hook
// needs the exact write behavior a human running --write gets, not a
// second copy of it. Always writes (there is no dry-run form of this
// function — main() below decides whether to call it at all), so the
// production-write guard is enforced HERE, unconditionally, rather than
// trusted to every caller to remember. A caller that only wants a preview
// simply doesn't call this function.
// A drop this large below the CURRENT row count is refused unless the
// caller explicitly forces it. Adversarial review caught the gap this
// closes: the RPC's own guard only refuses a fully EMPTY batch
// (schema-classification-atomic-replace-rpc-v1.sql), so a non-empty but
// drastically SMALLER result (a partial upstream hiccup producing 50 rows
// instead of 543) would sail straight through and silently wipe good data
// -- the exact thing a human running --write used to catch by eye, reading
// the printed dry-run stats before confirming. Once this call happens
// automatically after every ingestion (no human review step at all), that
// safety net has to live in code instead.
const CLASSIFICATION_DROP_FLOOR_RATIO = 0.5;

// P0-B.1: `expectedStoryIds` is REQUIRED, not optional, and there is no
// force-bypass for it (unlike the row-count floor below) -- per ChatGPT's
// explicit instruction: "--force hanya boleh bypass floor 50%, bukan
// membenarkan hasil stale menimpa generasi baru." A caller cannot forget
// this snapshot and cannot opt out of the check it enables; the RPC itself
// re-verifies it server-side (schema-classification-atomic-replace-rpc-
// v1.sql) rather than trusting the client's own freshness claim.
export async function writeClassificationRows(client, rows, expectedStoryIds, { force = false } = {}) {
  assertWriteAllowed();

  if (!force) {
    const { count: currentCount, error: countErr } = await client
      .from('edition_story_classifications')
      .select('story_id', { count: 'exact', head: true });
    if (countErr) throw new Error(`writeClassificationRows: checking current row count — ${countErr.message}`);
    if (currentCount > 0 && rows.length < currentCount * CLASSIFICATION_DROP_FLOOR_RATIO) {
      throw new Error(
        `writeClassificationRows: refusing to write ${rows.length} rows, down from ${currentCount} currently `
        + `(a drop of more than ${Math.round((1 - CLASSIFICATION_DROP_FLOOR_RATIO) * 100)}%). `
        + 'This looks like a partial failure upstream, not an intentional shrink. '
        + 'If this drop is genuinely expected, pass { force: true } (CLI: --force).'
      );
    }
  }

  // schema-classification-atomic-replace-rpc-v1.sql: DELETE + INSERT inside
  // ONE Postgres function call, i.e. one implicit transaction. Replaces the
  // old truncate-then-batched-upsert flow, which made multiple separate
  // HTTP requests with no client-side transaction spanning them — a batch
  // failing partway through could leave the table with the delete
  // committed and only some of the new rows written. That was tolerable
  // for an occasional manual run; not once this runs automatically after
  // every ingestion (below).
  const { data: written, error } = await client.rpc('replace_edition_story_classifications', {
    p_rows: rows,
    p_expected_story_ids: expectedStoryIds,
  });
  if (error) throw new Error(`replace_edition_story_classifications — ${error.message}`);
  return written;
}

function printClassificationSummary({ stats, noItems, skippedIneligible, activeClusterCount, totalClusterCount, totalItemCount }) {
  console.log(`${activeClusterCount} active clusters (of ${totalClusterCount} total), ${totalItemCount} items.\n`);
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
}

async function main() {
  console.log(`\nPRODUCTION CLASSIFICATION WIRING — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);

  const result = await computeClassificationRows(supabase);
  printClassificationSummary(result);

  if (!WRITE) {
    console.log(`DRY RUN — ${result.rows.length} rows would be written. Re-run with --write to apply.\n`);
    return;
  }

  const written = await writeClassificationRows(supabase, result.rows, result.activeClusterIds, { force: FORCE });
  console.log(`Done. ${written} rows written to edition_story_classifications (atomic replace).\n`);
}

// Guarded so importing this module for buildRuleMatchItem() (per the
// wiring integration test) never triggers a real run against Supabase.
// pathToFileURL() (not a raw `file://${argv[1]}` string) is required for
// this comparison to work on Windows, where argv[1] uses backslashes and
// import.meta.url is a proper file:// URL with forward slashes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('classify-production failed:', err.message);
    process.exit(1);
  });
}
