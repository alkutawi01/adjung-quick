// control.js — Editorial Control: Pin / Prioritize / Remove.
//
// Interface boundary only (per ChatGPT director directive): this module
// defines the shape and behaviour of manual override, not a UI. In
// production this sits behind a single unobtrusive trigger on each story
// card inside Quick itself (single-editor, hidden editor mode) — no admin
// dashboard, per Izzat's cost/automation constraint.
//
// Semantics locked tonight:
//   Pin        -> item MUST eventually enter the Active Set, but never by
//                 force-evicting an existing slot. It waits in a FIFO
//                 Pin-Pending Queue and is admitted the next time a slot is
//                 released naturally (Grok's patch for the Pin-vs-full-set
//                 failure mode).
//   Prioritize -> boosts the item's effective ranking, but it still competes
//                 through the normal Active Set Selector — not guaranteed.
//   Remove     -> item is excluded from selection entirely. Does NOT delete
//                 the underlying RSS item/cluster (per decision #29 — source
//                 reports are never deleted, only excluded from this
//                 workspace's selection).
//
// This is intentionally a plain in-memory store for the Laboratory. In
// production it's a small table (cluster_key, action, timestamp), not a
// permission/role system — there is exactly one editor (Izzat).

const PRIORITIZE_BOOST = 15; // added to editorialScore, same scale as scoreCluster's 0-100

export function createEditorialControl() {
  const pins = []; // FIFO queue of clusterKeys, ordered by pin time
  const prioritized = new Set(); // clusterKeys
  const removed = new Set(); // clusterKeys

  return {
    pin(clusterKey) {
      if (!pins.includes(clusterKey)) pins.push(clusterKey);
      removed.delete(clusterKey); // pinning un-removes, if it was removed
    },
    prioritize(clusterKey) {
      prioritized.add(clusterKey);
      removed.delete(clusterKey);
    },
    remove(clusterKey) {
      removed.add(clusterKey);
      prioritized.delete(clusterKey);
      const idx = pins.indexOf(clusterKey);
      if (idx !== -1) pins.splice(idx, 1);
    },
    // Called when the Active Set actually admits a pinned item — clears it
    // from the pending queue. Distinct from `pin()` itself: pinning declares
    // intent, this confirms fulfilment.
    fulfilPin(clusterKey) {
      const idx = pins.indexOf(clusterKey);
      if (idx !== -1) pins.splice(idx, 1);
    },
    isRemoved(clusterKey) {
      return removed.has(clusterKey);
    },
    isPrioritized(clusterKey) {
      return prioritized.has(clusterKey);
    },
    pinPendingQueue() {
      return [...pins];
    },
  };
}

// Apply Prioritize boost and Remove exclusion to a ranked queue. Pin is
// handled separately by the selector (it's about slot admission order, not
// score) — see selectActiveSetWithControl in engine.js.
export function applyEditorialControl(rankedQueue, control) {
  return rankedQueue
    .filter(c => !control.isRemoved(c.clusterKey))
    .map(c => control.isPrioritized(c.clusterKey)
      ? { ...c, editorialScore: c.editorialScore + PRIORITIZE_BOOST, prioritized: true }
      : c
    )
    .sort((a, b) => b.editorialScore - a.editorialScore);
}
