// pin-uat-snapshot.mjs — Polish 8D-A production Pin UAT, READ-ONLY snapshot tool.
// Records the exact current state so we can prove, after unpinning, that
// production returned to precisely where it started. No writes of any kind.
//
// Run from the adjung-quick repo root:
//   node <path-to-this-file> [label]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const REPO = process.cwd(); // must be run from the adjung-quick repo root
const imp = p => import(pathToFileURL(resolve(REPO, p)).href);

const { loadFieldCandidates } = await imp('ranking/shadow-runner.mjs');
const { scoreCandidates } = await imp('ranking/candidate-scoring.mjs');
const { selectDiverseCandidates } = await imp('ranking/diversity-selection.mjs');
const { applyEditorialComposition } = await imp('ranking/editorial-composition.mjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EDITION = 'ms-MY';
const FIELD = 'politics'; // the only category on editorial_v1 — where Pin's effect is real
const label = process.argv[2] ?? 'snapshot';

// 1. Every ACTIVE pin override anywhere — so we can prove we didn't disturb
//    an existing real pin, and that ours is fully gone afterwards.
const { data: pins, error: pinErr } = await supabase
  .from('story_overrides')
  .select('id, story_id, edition_id, override_type, new_field_code, active, created_at, expires_at, created_by, reason')
  .eq('override_type', 'pin')
  .eq('active', true)
  .order('created_at');
if (pinErr) throw new Error(pinErr.message);

// 2. The live ranked top-10 for the test field, via the real pipeline.
const candidates = await loadFieldCandidates(EDITION, FIELD);
const scored = scoreCandidates(candidates);
const diversity = selectDiverseCandidates(scored, 10);
const alternativePool = scored.filter(c => !diversity.some(s => s.storyId === c.storyId));
const { selected } = applyEditorialComposition(diversity, { alternativePool });

console.log(JSON.stringify({
  label,
  takenAt: new Date().toISOString(),
  edition: EDITION,
  field: FIELD,
  activePinsGlobal: pins,
  activePinCount: pins.length,
  candidateCount: candidates.length,
  top10: selected.map((c, i) => ({
    position: i + 1,
    storyId: c.storyId,
    title: c.title?.slice(0, 90),
    sourceId: c.sourceId,
    score: Math.round(c.score),
  })),
  // Just-outside candidates — a low-scoring one here is the ideal Pin test
  // subject (proves Pin overrides score, rather than merely reordering).
  nextFive: [...scored]
    .sort((a, b) => b.score - a.score)
    .filter(c => !selected.some(s => s.storyId === c.storyId))
    .slice(0, 5)
    .map(c => ({ storyId: c.storyId, title: c.title?.slice(0, 90), score: Math.round(c.score) })),
}, null, 2));
