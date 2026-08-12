// verify-ingestion-persistence.mjs — regression check for the Production
// Evidence Persistence Gap (2026-08-12). Per ChatGPT: "sekarang schema
// sudah ada, tetapi ingestion terlupa mengisi" — this script exists so that
// specific failure can never silently recur. Read-only, checks live DB.
//
// Run: node db/verify-ingestion-persistence.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
function assert(name, cond, detail = '') {
  console.log(cond ? '  \u2713' : '  \u2717', name, cond ? '' : detail);
  if (!cond) failures++;
}

console.log('\nINGESTION PERSISTENCE VERIFICATION\n');

// Pick a source we KNOW declares a knownCategory in lab/sources.js
// (rss-mosti -> 'sains') and one we know publishes real RSS <category> tags
// (rss-utusan-agama, WordPress category feed).
const { data: mostiRows, error: e1 } = await supabase
  .from('rss_items').select('source_known_category').eq('source_id', 'rss-mosti').limit(5);
if (e1) throw new Error(e1.message);
assert('rss-mosti items exist in DB', mostiRows.length > 0, '(run db/ingest-production.js first)');
assert('rss-mosti items carry source_known_category = "sains"',
  mostiRows.length > 0 && mostiRows.every(r => r.source_known_category === 'sains'),
  `got: ${JSON.stringify(mostiRows.map(r => r.source_known_category))}`);

const { data: utusanRows, error: e2 } = await supabase
  .from('rss_items').select('categories').eq('source_id', 'rss-utusan-agama').limit(5);
if (e2) throw new Error(e2.message);
assert('rss-utusan-agama items exist in DB', utusanRows.length > 0);
assert('rss-utusan-agama items carry non-empty categories[]',
  utusanRows.length > 0 && utusanRows.every(r => Array.isArray(r.categories) && r.categories.length > 0),
  `got: ${JSON.stringify(utusanRows.map(r => r.categories))}`);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED — evidence is not being persisted.\n`);
process.exit(failures === 0 ? 0 : 1);
