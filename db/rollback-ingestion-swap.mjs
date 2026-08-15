// rollback-ingestion-swap.mjs — FASA 4.2. Per
// docs/ingestion-staging-swap-implementation-plan-v1.md §3 "Post-swap
// rollback": if a swap already committed but something's wrong with the
// new generation (parity failure, a reader-reported anomaly), this swaps
// `_old` back to live and demotes the bad generation to `*_bad` for
// forensic inspection — never silently dropped, same discipline as
// every other generation this project keeps around.
//
// Manual only, deliberately: this is a human decision ("the last
// ingestion run produced something wrong"), not something a script
// should ever infer and act on by itself.
//
// Usage: node db/rollback-ingestion-swap.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { assertWriteAllowed } from './production-write-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  assertWriteAllowed();

  console.log('Rolling back to the previous *_old generation...\n');
  const { error } = await supabase.rpc('rollback_ingestion_swap');
  if (error) {
    console.error('Rollback FAILED:', error);
    console.error('\nIf this says no *_old generation exists, there is nothing to roll back to —');
    console.error('either no swap has run yet, or a previous rollback/drop already consumed it.');
    process.exit(1);
  }

  console.log('✓ Rolled back. The previous generation is live again; the just-demoted');
  console.log('  generation is preserved as *_bad for inspection — not dropped automatically.');
  console.log('\nVerify: query story_clusters/rss_items directly, then check the reader (/)');
  console.log('and admin surfaces before considering this resolved.');
}

main().catch(err => {
  console.error('rollback-ingestion-swap failed:', err);
  process.exit(1);
});
