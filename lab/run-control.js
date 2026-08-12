// run-control.js — demonstrates Editorial Control (Pin/Prioritize/Remove)
// against real RSS data, using the STATEFUL incremental selector: cold-start
// selection, then a Pin issued while the Active Set is already full (the
// exact failure mode Grok flagged), proving the existing set is untouched,
// then a simulated slot release showing the pinned item — and only that
// slot — gets filled.

import { RSS_SOURCES } from './sources.js';
import { fetchFeed } from './rss.js';
import { buildRankedQueue, selectActiveSetWithControl } from './engine.js';
import { createEditorialControl } from './control.js';

function truncate(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }

function printActiveSet(label, activeSet) {
  console.log(`\n${label} (${activeSet.length} slots)\n`);
  activeSet.forEach((c, i) => {
    console.log(`  ${String(i + 1).padEnd(3)} [${c.selectionReason.padEnd(14)}] ${truncate(c.canonical.title, 60)}`);
  });
}

async function main() {
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  const rankedQueue = buildRankedQueue(allItems);

  const control = createEditorialControl();

  // --- Cold start: empty workspace, fill all 10 slots ---
  const activeSet = selectActiveSetWithControl(rankedQueue, control, 10, []);
  printActiveSet('=== COLD START (no overrides) ===', activeSet);
  const activeKeys = new Set(activeSet.map(c => c.clusterKey));

  // --- Izzat pins a story that ISN'T in the Active Set, while it's full ---
  const pinTarget = rankedQueue.find(c => !activeKeys.has(c.clusterKey));
  console.log(`\nIzzat pins (Active Set already full, 10/10): "${truncate(pinTarget.canonical.title, 65)}"`);
  control.pin(pinTarget.clusterKey);

  const stillFull = selectActiveSetWithControl(rankedQueue, control, 10, activeSet);
  const unchanged = stillFull.length === activeSet.length &&
    stillFull.every((c, i) => c.clusterKey === activeSet[i].clusterKey);
  const stillPending = control.pinPendingQueue().includes(pinTarget.clusterKey);
  console.log(`Active Set literally unchanged (same 10 items, same order): ${unchanged ? 'CONFIRMED' : 'FAILED'}`);
  console.log(`Pin still waiting in Pin-Pending Queue: ${stillPending ? 'CONFIRMED' : 'FAILED'}`);

  // --- Izzat releases the lowest-ranked slot -> exactly 1 slot opens up ---
  const released = stillFull[stillFull.length - 1];
  console.log(`\nIzzat releases slot 10: "${truncate(released.canonical.title, 65)}"`);
  const afterRelease = stillFull.slice(0, -1); // 9 items remain, 1 open slot

  const filled = selectActiveSetWithControl(rankedQueue, control, 10, afterRelease);
  printActiveSet('=== AFTER RELEASE (exactly 1 new slot filled) ===', filled);

  const first9Unchanged = filled.slice(0, 9).every((c, i) => c.clusterKey === afterRelease[i].clusterKey);
  const pinFilledSlot10 = filled[9]?.clusterKey === pinTarget.clusterKey && filled[9]?.selectionReason === 'pin_pending';
  console.log(`\nFirst 9 slots untouched: ${first9Unchanged ? 'CONFIRMED' : 'FAILED'}`);
  console.log(`Pinned item admitted into the newly-opened slot: ${pinFilledSlot10 ? 'CONFIRMED' : 'FAILED'}`);
  console.log(`Pin-Pending Queue now empty: ${control.pinPendingQueue().length === 0 ? 'CONFIRMED' : 'FAILED'}`);

  // --- Prioritize + Remove, from a fresh cold start (independent demo) ---
  const freshControl = createEditorialControl();
  const target = rankedQueue[15];
  const toRemove = rankedQueue[3];
  console.log(`\n--- Independent Prioritize/Remove demo (fresh cold start) ---`);
  console.log(`Prioritizing (was rank ${rankedQueue.indexOf(target) + 1}, score ${target.editorialScore}): "${truncate(target.canonical.title, 55)}"`);
  console.log(`Removing: "${truncate(toRemove.canonical.title, 55)}"`);
  freshControl.prioritize(target.clusterKey);
  freshControl.remove(toRemove.clusterKey);

  const withOverrides = selectActiveSetWithControl(rankedQueue, freshControl, 10, []);
  const targetInSet = withOverrides.find(c => c.clusterKey === target.clusterKey);
  const removedAbsent = !withOverrides.some(c => c.clusterKey === toRemove.clusterKey);
  console.log(`Prioritized item now in Active Set: ${targetInSet ? `YES (boosted score ${targetInSet.editorialScore})` : 'no — still didn\'t make the cut, boost wasn\'t enough'}`);
  console.log(`Removed item excluded from Active Set: ${removedAbsent ? 'CONFIRMED' : 'FAILED'}`);
  console.log('');
}

main().catch(err => {
  console.error('Editorial Control demo failed:', err);
  process.exit(1);
});
