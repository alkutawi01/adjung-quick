// snapshot-source-operational-baseline.mjs — Backend Control Plane Phase 1,
// pre-migration READ-ONLY baseline.
//
// Per ChatGPT's explicit instruction (2026-08-17): before production
// migration runs, capture the real current values of the 4 operational
// columns the migration structurally never writes (coverage,
// last_success_at, last_failure_at, last_failure_reason) — so
// "the script doesn't touch them" can be verified against a real
// before/after diff, not just trusted as a structural claim.
//
// READ-ONLY. Zero writes. Safe to run against production at any time.
//
// Usage: node db/snapshot-source-operational-baseline.mjs

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from '../lab/sources.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('\nSOURCE OPERATIONAL BASELINE SNAPSHOT — read-only\n');

  const expectedIds = RSS_SOURCES.map(s => s.id);

  const { data, error } = await supabase
    .from('sources')
    .select('id, coverage, last_success_at, last_failure_at, last_failure_reason, active, created_at')
    .order('id');
  if (error) throw new Error(`snapshot query failed: ${error.message}`);

  console.log(`${data.length} rows read from production sources.\n`);

  const foundIds = new Set(data.map(r => r.id));
  const missing = expectedIds.filter(id => !foundIds.has(id));
  const extra = data.map(r => r.id).filter(id => !expectedIds.includes(id));

  if (data.length !== expectedIds.length || missing.length > 0 || extra.length > 0) {
    console.error('FAIL-CLOSED — production sources does not match RSS_SOURCES 1:1:');
    if (missing.length) console.error(`  missing from production: ${missing.join(', ')}`);
    if (extra.length) console.error(`  present in production but not in RSS_SOURCES: ${extra.join(', ')}`);
    console.error('Investigate before proceeding to migration. Baseline NOT saved.');
    process.exit(1);
  }
  console.log('✓ 43/43 ids match RSS_SOURCES exactly — 0 missing, 0 extra.\n');

  const populated = {
    coverage: data.filter(r => r.coverage !== null).length,
    last_success_at: data.filter(r => r.last_success_at !== null).length,
    last_failure_at: data.filter(r => r.last_failure_at !== null).length,
    last_failure_reason: data.filter(r => r.last_failure_reason !== null).length,
  };
  console.log('Non-null counts (context, not a pass/fail check):');
  console.log(`  coverage: ${populated.coverage}/43, last_success_at: ${populated.last_success_at}/43, last_failure_at: ${populated.last_failure_at}/43, last_failure_reason: ${populated.last_failure_reason}/43\n`);

  mkdirSync('db/generated', { recursive: true });
  const outPath = 'db/generated/source-operational-baseline.json';
  writeFileSync(outPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    rowCount: data.length,
    rows: data,
  }, null, 2), 'utf8');

  console.log(`✓ Baseline saved to ${outPath}. Compare against this file after migration runs — every row's coverage/last_success_at/last_failure_at/last_failure_reason must be byte-identical (this migration never writes them; any diff would only come from ingestion running in between).\n`);
}

main().catch(err => {
  console.error('snapshot-source-operational-baseline failed:', err.message);
  process.exit(1);
});
