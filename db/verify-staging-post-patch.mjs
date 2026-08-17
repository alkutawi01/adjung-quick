// verify-staging-post-patch.mjs — Backend Control Plane Phase 1,
// post-patch staging verification. READ-ONLY (reads sources_staging,
// which was left in place by the just-run --dry-run; never swaps,
// never writes).
//
// Per ChatGPT's checklist (2026-08-17): after the reset_ingestion_staging()
// patch is applied and a --dry-run has populated sources_staging fresh,
// verify the ACTUAL staged table content — not a simulation — against
// the same requirements the pre-apply parity proof (4d3aaa7) checked.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('\nPOST-PATCH STAGING VERIFICATION — read-only (sources_staging, left by --dry-run)\n');

  const { data: staged, error: stagedErr } = await supabase
    .from('sources_staging')
    .select('id, name, url, language, trust_score, coverage, status, active, known_category, source_type, exclude_patterns, extra_ca')
    .order('id');
  if (stagedErr) throw new Error(`sources_staging read failed: ${stagedErr.message}`);

  const { data: current, error: curErr } = await supabase
    .from('sources')
    .select('id, name, url, language, trust_score, status, active, known_category, source_type, exclude_patterns, extra_ca')
    .order('id');
  if (curErr) throw new Error(`sources read failed: ${curErr.message}`);

  console.log(`1. sources_staging row count: ${staged.length === 43 ? 'PASS' : 'FAIL'} (${staged.length}/43)`);

  const active = staged.filter(r => r.status === 'active');
  const disabled = staged.filter(r => r.status !== 'active');
  console.log(`2. 42 active: ${active.length === 42 ? 'PASS' : 'FAIL'} (${active.length})`);
  console.log(`3. 1 disabled = rss-kpm: ${disabled.length === 1 && disabled[0]?.id === 'rss-kpm' ? 'PASS' : 'FAIL'} (${disabled.map(r => r.id)})`);

  const currentById = new Map(current.map(r => [r.id, r]));
  const stagedIds = new Set(staged.map(r => r.id));
  const currentIds = new Set(current.map(r => r.id));
  const missing = [...currentIds].filter(id => !stagedIds.has(id));
  const extra = [...stagedIds].filter(id => !currentIds.has(id));
  console.log(`4. no source missing/extra: ${missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL'} (missing: [${missing}], extra: [${extra}])`);

  const arrEq = (a, b) => { const na = a ?? [], nb = b ?? []; return na.length === nb.length && na.every((v, i) => v === nb[i]); };
  const fields = ['name', 'url', 'language', 'trust_score', 'status', 'known_category', 'source_type', 'extra_ca'];
  let mismatches = [];
  for (const row of staged) {
    const cur = currentById.get(row.id);
    if (!cur) continue;
    for (const f of fields) if (cur[f] !== row[f]) mismatches.push(`${row.id}.${f}: sources=${JSON.stringify(cur[f])} vs staged=${JSON.stringify(row[f])}`);
    if (!arrEq(cur.exclude_patterns, row.exclude_patterns)) mismatches.push(`${row.id}.exclude_patterns mismatch`);
    if ((row.status === 'active') !== (row.active === true)) mismatches.push(`${row.id}: active/status invariant violated (status=${row.status}, active=${row.active})`);
  }
  console.log(`5. metadata matches public.sources, no default-value leakage, active<->status invariant: ${mismatches.length === 0 ? 'PASS' : 'FAIL'}`);
  mismatches.forEach(m => console.log(`   ${m}`));

  const allPass = staged.length === 43 && active.length === 42 && disabled.length === 1 && disabled[0]?.id === 'rss-kpm' &&
    missing.length === 0 && extra.length === 0 && mismatches.length === 0;
  console.log(`\n${allPass ? '✓ ALL CHECKS PASS — sources_staging is schema+data correct post-patch' : '✗ FAILED'}\n`);
  if (!allPass) process.exit(1);
}

main().catch(err => {
  console.error('verify-staging-post-patch failed:', err.message);
  process.exit(1);
});
