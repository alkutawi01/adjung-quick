// verify-source-registry-production-migration.mjs — Backend Control
// Plane Phase 1, POST-migration verification. READ-ONLY.
//
// Per ChatGPT's explicit checklist (2026-08-17): after production
// migration COMMIT, verify and report — 43/43 exist, 42 active, 1
// disabled=rss-kpm, active<->status 0 violations, all 4 operational
// columns still NULL 43/43, 0 missing/extra ids.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { RSS_SOURCES } from '../lab/sources.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('\nPOST-MIGRATION VERIFICATION — read-only\n');

  const { data, error } = await supabase
    .from('sources')
    .select('id, status, active, coverage, last_success_at, last_failure_at, last_failure_reason')
    .order('id');
  if (error) throw new Error(error.message);

  const expectedIds = RSS_SOURCES.map(s => s.id);
  const foundIds = new Set(data.map(r => r.id));
  const missing = expectedIds.filter(id => !foundIds.has(id));
  const extra = data.map(r => r.id).filter(id => !expectedIds.includes(id));
  console.log(`1. 43/43 exist: ${data.length === 43 ? 'PASS' : 'FAIL'} (${data.length} rows) — missing: [${missing}], extra: [${extra}]`);

  const active = data.filter(r => r.status === 'active');
  const disabled = data.filter(r => r.status !== 'active');
  console.log(`2. 42 active: ${active.length === 42 ? 'PASS' : 'FAIL'} (${active.length})`);
  console.log(`3. 1 disabled = rss-kpm: ${disabled.length === 1 && disabled[0].id === 'rss-kpm' ? 'PASS' : 'FAIL'} (${disabled.map(r => r.id)})`);

  const invariantViolations = data.filter(r => (r.status === 'active') !== (r.active === true));
  console.log(`4. active<->status invariant, 0 violations: ${invariantViolations.length === 0 ? 'PASS' : 'FAIL'} (${invariantViolations.map(r => r.id)})`);

  const baseline = JSON.parse(readFileSync('db/generated/source-operational-baseline.json', 'utf8'));
  const baselineById = new Map(baseline.rows.map(r => [r.id, r]));
  const opColumns = ['coverage', 'last_success_at', 'last_failure_at', 'last_failure_reason'];
  let opDrift = [];
  for (const row of data) {
    const before = baselineById.get(row.id);
    for (const col of opColumns) {
      if (before[col] !== row[col]) opDrift.push(`${row.id}.${col}: ${before[col]} -> ${row[col]}`);
    }
  }
  console.log(`5. operational columns unchanged vs baseline (5f4ce56): ${opDrift.length === 0 ? 'PASS' : 'FAIL'} (${opDrift.length} drifted: ${opDrift.join(', ')})`);

  const stillNull = c => data.filter(r => r[c] === null).length;
  console.log(`   coverage NULL: ${stillNull('coverage')}/43, last_success_at NULL: ${stillNull('last_success_at')}/43, last_failure_at NULL: ${stillNull('last_failure_at')}/43, last_failure_reason NULL: ${stillNull('last_failure_reason')}/43`);

  const allPass = data.length === 43 && missing.length === 0 && extra.length === 0 &&
    active.length === 42 && disabled.length === 1 && disabled[0]?.id === 'rss-kpm' &&
    invariantViolations.length === 0 && opDrift.length === 0;

  console.log(`\n${allPass ? '✓ ALL CHECKS PASS' : '✗ VERIFICATION FAILED — see above'}\n`);
  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('verify-source-registry-production-migration failed:', err.message);
  process.exit(1);
});
