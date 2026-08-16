// backfill-source-registry-staging.mjs — Backend Control Plane Phase 1
// migration, STAGING ONLY.
//
// Per docs/backend-control-plane-phase1-source-registry-design-v1.md §E.
// Deterministic 1:1 copy of RSS_SOURCES into sources_registry_staging —
// no re-derivation, no ambiguity. Fail-closed: any row that can't be
// validated stops the whole run, nothing partial is written.
//
// Usage:
//   node db/backfill-source-registry-staging.mjs           (dry-run, prints only)
//   node db/backfill-source-registry-staging.mjs --write    (actually inserts)
//
// This targets sources_registry_staging, NEVER the real `sources` table
// — safe to run against the same Supabase project as production, since
// this table is not read by ingestion and not exposed to anon/authenticated.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from '../lab/sources.js';

const WRITE = process.argv.includes('--write');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(`\nSOURCE REGISTRY STAGING BACKFILL — ${WRITE ? 'WRITE MODE' : 'DRY RUN (no writes)'}\n`);
  console.log(`${RSS_SOURCES.length} entries in lab/sources.js.\n`);

  // Duplicate-id check within RSS_SOURCES itself — the source data's own
  // integrity, before touching the DB at all.
  const idCounts = new Map();
  for (const s of RSS_SOURCES) idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1);
  const dupes = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    console.error('FAIL-CLOSED — duplicate ids within lab/sources.js itself:');
    for (const [id, count] of dupes) console.error(`  ${id}: ${count} entries`);
    process.exit(1);
  }

  // URL validation — every entry, before any write.
  const badUrls = RSS_SOURCES.filter(s => {
    try { new URL(s.url); return false; } catch { return true; }
  });
  if (badUrls.length > 0) {
    console.error('FAIL-CLOSED — invalid URL(s):');
    for (const s of badUrls) console.error(`  ${s.id}: "${s.url}"`);
    process.exit(1);
  }

  // Duplicate-id check against existing staging rows — should be empty
  // on a fresh run, but never assume; fail closed rather than silently
  // upsert-overwrite an unexpected existing row.
  const { data: existing, error: existingErr } = await supabase
    .from('sources_registry_staging')
    .select('id');
  if (existingErr) throw new Error(`checking existing rows — ${existingErr.message}`);
  if (existing.length > 0) {
    console.error(`FAIL-CLOSED — sources_registry_staging already has ${existing.length} row(s). Refusing to double-insert. Truncate the table manually first if a clean re-run is intended.`);
    process.exit(1);
  }

  const rows = RSS_SOURCES.map(s => ({
    id: s.id,
    name: s.name,
    url: s.url,
    language: s.language,
    trust_score: s.trustScore,
    known_category: s.knownCategory ?? null,
    source_type: s.sourceType ?? null,
    exclude_patterns: s.excludePatterns ? s.excludePatterns.map(String) : null,
    extra_ca: s.extraCa ?? null,
    status: s.status ?? 'active',
  }));

  console.log('All validations passed. Row preview (first 3):');
  console.log(rows.slice(0, 3));

  if (!WRITE) {
    console.log(`\nDRY RUN — ${rows.length} rows would be inserted. Re-run with --write to apply.\n`);
    return;
  }

  const { error: insertErr } = await supabase.from('sources_registry_staging').insert(rows);
  if (insertErr) throw new Error(`insert — ${insertErr.message}`);

  const { count, error: countErr } = await supabase
    .from('sources_registry_staging')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(`count verification — ${countErr.message}`);

  if (count !== RSS_SOURCES.length) {
    console.error(`FAIL-CLOSED — expected ${RSS_SOURCES.length} rows after insert, found ${count}. Investigate before proceeding.`);
    process.exit(1);
  }

  console.log(`\n✓ Backfilled ${count}/${RSS_SOURCES.length} rows into sources_registry_staging.\n`);
}

main().catch(err => {
  console.error('backfill-source-registry-staging failed:', err.message);
  process.exit(1);
});
