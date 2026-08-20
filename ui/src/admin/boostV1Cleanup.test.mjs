// boostV1Cleanup.test.mjs — Polish 8D-C (docs/polish-8-selection-audit-v1.md).
// ChatGPT's locked Boost V1 decision (8D-B simulation on the real
// production corpus: a +1 delta alone sent rank #15-22 candidates to
// #1 in 3 of 8 tested categories) means Boost stays permanently OFF for
// V1. This test proves the mounted Admin surface no longer offers a way
// to CREATE a new Boost, while the backend/data model (override_type
// 'boost', submitBoostOverride(), BOOST_WEIGHT=0, historical read
// display) is untouched -- per ChatGPT's explicit instruction, this is
// a UI-write-path removal, not a schema/data change.
//
// Run: node ui/src/admin/boostV1Cleanup.test.mjs

import fs from 'fs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nBOOST V1 CLEANUP — mounted UI write-path removed, backend intact (Polish 8D-C)\n');

const allStoriesSrc = fs.readFileSync(new URL('./AllStoriesPanel.jsx', import.meta.url), 'utf8');
const adminAppSrc = fs.readFileSync(new URL('./AdminApp.jsx', import.meta.url), 'utf8');
const adapterSrc = fs.readFileSync(new URL('./reviewQueueAdapter.js', import.meta.url), 'utf8');
const scoringSrc = fs.readFileSync(new URL('../../../ranking/candidate-scoring.mjs', import.meta.url), 'utf8');

// --- Mounted UI (AllStoriesPanel.jsx, the only "Berita" surface AdminApp
// actually renders per Round 8/15) no longer offers a Boost-writing path. ---
{
  assert('AllStoriesPanel.jsx does not import submitBoostOverride',
    !/submitBoostOverride/.test(allStoriesSrc));
  assert('AllStoriesPanel.jsx has no onBoost prop/callback',
    !/onBoost/.test(allStoriesSrc));
  assert('AllStoriesPanel.jsx has no composing===\'boost\' branch',
    !/composing\s*===\s*['"]boost['"]/.test(allStoriesSrc));
  assert('AllStoriesPanel.jsx does not render "Naikkan keutamaan" (the dead Boost label)',
    !/Naikkan keutamaan/.test(allStoriesSrc));
  assert('AllStoriesPanel.jsx still shows the read-only "Dinaikkan" tag for historical boosted stories',
    /s\.boosted/.test(allStoriesSrc) && /Dinaikkan/.test(allStoriesSrc));
}

// --- AdminApp.jsx's dead top-level Boost import is gone too (it was
// never wired to the mounted AllStoriesPanel path -- ReviewQueueCard.jsx,
// the only component that used it, was already orphaned since Round 8/15). ---
{
  assert('AdminApp.jsx does not import submitBoostOverride',
    !/submitBoostOverride/.test(adminAppSrc));
}

// --- Backend/data model untouched: submitBoostOverride() still exists
// for whatever still calls it (orphaned ReviewQueueCard.jsx, future
// re-activation), BOOST_WEIGHT stays 0 (not deleted, not renamed). ---
{
  assert('reviewQueueAdapter.js still exports submitBoostOverride (backend/data model preserved)',
    /export\s+(async\s+)?function\s+submitBoostOverride/.test(adapterSrc));
  assert('candidate-scoring.mjs keeps BOOST_WEIGHT = 0 (not removed, not reactivated)',
    /export const BOOST_WEIGHT\s*=\s*0/.test(scoringSrc));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
