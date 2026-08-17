// audit-orphan-editorial-state.mjs — READ-ONLY audit per ChatGPT's
// explicit instruction (2026-08-17): before any ingestion swap is
// attempted again, report how many rows in story_overrides,
// saved_stories, and history_entries reference a story_id that does
// not exist in the CURRENT live story_clusters generation. No cleanup
// performed here — ChatGPT explicitly forbade a generic DELETE; this
// only reports numbers so a lifecycle decision can be made deliberately.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('\nORPHAN EDITORIAL STATE AUDIT — read-only\n');

  const { data: liveIds, error: liveErr } = await supabase.from('story_clusters').select('id');
  if (liveErr) throw new Error(liveErr.message);
  const liveSet = new Set(liveIds.map(r => r.id));
  console.log(`live story_clusters: ${liveSet.size}\n`);

  for (const table of ['story_overrides', 'saved_stories', 'history_entries']) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) { console.log(`${table}: ERROR ${error.message}`); continue; }
    const orphans = data.filter(r => !liveSet.has(r.story_id));
    console.log(`${table}: total=${data.length}, orphan=${orphans.length}`);
    orphans.forEach(o => console.log('  ', JSON.stringify(o)));
  }
  console.log('');
}

main().catch(err => {
  console.error('audit-orphan-editorial-state failed:', err.message);
  process.exit(1);
});
