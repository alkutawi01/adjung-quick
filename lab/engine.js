// engine.js — Tier-0 + Tier-1 clustering, deterministic Editorial Score, and a
// coverage-first Active Set Selector. No MinHash/LSH (deferred per Master Spec
// P-xxx), no aging boost, no Pin/Prioritize/Remove, no AI — per Phase A scope.
//
// Tier-1 status per Master Spec (locked v1, 2026-08-11): deterministic
// title-token Jaccard similarity, threshold 0.25 default/configurable.
// IMPORTANT: matching is representative-only (each new item is compared
// against existing cluster REPRESENTATIVES, never against other members) to
// avoid transitive false-clustering (A~B, B~C, A!~C forming one bad cluster) —
// this was ChatGPT's explicit guardrail before locking Tier-1.

import { classifyTopic } from './classify.js';
import { tokenize, jaccardSimilarity } from './match.js';
import { applyEditorialControl } from './control.js';

const TIER1_SIMILARITY_THRESHOLD = 0.25; // v1 default — configurable, not universal truth
const TIER1_MAX_TIME_DIFF_HOURS = 48;

// --- Tier-0 (exact match) + Tier-1 (deterministic title similarity) clustering ---
export function dedupeAndCluster(items, options = {}) {
  const threshold = options.tier1Threshold ?? TIER1_SIMILARITY_THRESHOLD;
  const exactIndex = new Map(); // exact key -> cluster
  const clusters = [];

  // Process oldest-first so the representative of a cluster is always the
  // earliest report — a stable anchor, not whichever item happened to fetch first.
  const sorted = [...items].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

  for (const item of sorted) {
    const exactKey = item.normalizedUrl || `${item.sourceId}:${item.rssGuid}`;
    if (!exactKey) continue;

    // Tier-0: exact match.
    if (exactIndex.has(exactKey)) {
      const cluster = exactIndex.get(exactKey);
      if (!cluster.sourceIds.has(item.sourceId)) {
        cluster.sourceIds.add(item.sourceId);
        cluster.members.push(item);
      }
      continue;
    }

    // Tier-1: compare against existing cluster REPRESENTATIVES only (not all
    // members), and only across different sources within the time window.
    const itemTokens = tokenize(item.title);
    let matchedCluster = null;
    for (const cluster of clusters) {
      if (cluster.sourceIds.has(item.sourceId)) continue;
      const timeDiffHours = Math.abs(new Date(item.publishedAt) - new Date(cluster.canonical.publishedAt)) / 36e5;
      if (timeDiffHours > TIER1_MAX_TIME_DIFF_HOURS) continue;
      const sim = jaccardSimilarity(itemTokens, tokenize(cluster.canonical.title));
      if (sim >= threshold) {
        matchedCluster = cluster;
        break; // first match wins — representative-only, no exhaustive re-scoring
      }
    }

    if (matchedCluster) {
      matchedCluster.sourceIds.add(item.sourceId);
      matchedCluster.members.push(item);
      exactIndex.set(exactKey, matchedCluster);
    } else {
      const cluster = {
        clusterKey: exactKey,
        canonical: item, // representative — never reassigned after creation
        members: [item],
        sourceIds: new Set([item.sourceId]),
      };
      clusters.push(cluster);
      exactIndex.set(exactKey, cluster);
    }
  }

  return clusters;
}

// --- Deterministic Editorial Score: freshness + cross-source count + source prominence ---
// All on-write in production; here it's just computed once per Lab run.
export function scoreCluster(cluster, now = new Date()) {
  const item = cluster.canonical;
  const ageHours = Math.max(0, (now - new Date(item.publishedAt)) / 36e5);

  // Freshness: 0-50, simple decay (not the aging-boost formula — that's a
  // queue-side proposal for later, not part of the base score).
  let freshness;
  if (ageHours <= 1) freshness = 50;
  else if (ageHours <= 3) freshness = 42;
  else if (ageHours <= 6) freshness = 34;
  else if (ageHours <= 12) freshness = 25;
  else if (ageHours <= 24) freshness = 15;
  else freshness = 5;

  // Cross-source count: 0-20, more independent sources reporting = more signal.
  const sourceCount = cluster.sourceIds.size;
  const crossSourceScore = sourceCount === 1 ? 0
    : sourceCount === 2 ? 7
    : sourceCount === 3 ? 12
    : sourceCount === 4 ? 16
    : 20;

  // Source prominence: 0-30, from the static trustScore already in the source registry.
  const maxTrust = Math.max(...cluster.members.map(m => m.trustScore || 0));
  const prominence = Math.round((maxTrust / 100) * 30);

  const editorialScore = freshness + crossSourceScore + prominence;

  return {
    ...cluster,
    topic: classifyTopic(item),
    ageHours: Math.round(ageHours * 10) / 10,
    scoreBreakdown: { freshness, crossSourceScore, prominence, sourceCount },
    editorialScore,
  };
}

export function buildRankedQueue(rawItems, now = new Date()) {
  const clusters = dedupeAndCluster(rawItems);
  const scored = clusters.map(c => scoreCluster(c, now));
  scored.sort((a, b) => b.editorialScore - a.editorialScore);
  return scored;
}

// --- Active Set Selector core: fills a given number of OPEN slots only,
// aware of topics already covered by whatever is already in the Active Set
// (existingTopics). This is the shared logic behind both cold-start
// (existingTopics empty) and incremental fill (existingTopics from the
// caller's current Active Set) — coverage-first, then ranked fallback. ---
function fillSlots(candidates, openSlots, existingTopics = new Set()) {
  const picked = [];
  const remaining = [...candidates];
  const usedTopics = new Set(existingTopics);

  // Pass 1: coverage — best candidate from each topic not yet represented
  // (counting topics already present in the existing Active Set, so a
  // topic that's already covered there won't be picked again here).
  for (const topic of [...new Set(remaining.map(r => r.topic))]) {
    if (picked.length >= openSlots) break;
    if (usedTopics.has(topic)) continue;
    const idx = remaining.findIndex(r => r.topic === topic);
    if (idx !== -1) {
      const [item] = remaining.splice(idx, 1);
      picked.push({ ...item, selectionReason: 'coverage_first' });
      usedTopics.add(topic);
    }
  }

  // Pass 2: ranked fallback — fill remaining open slots by score, no topic constraint.
  while (picked.length < openSlots && remaining.length > 0) {
    const item = remaining.shift();
    picked.push({ ...item, selectionReason: 'ranked_fallback' });
  }

  return picked;
}

// --- Cold-start selection: no existing Active Set yet (first run / empty
// workspace). Thin wrapper over fillSlots with no pre-existing topics. ---
export function selectActiveSet(rankedQueue, capacity = 10) {
  return fillSlots(rankedQueue, capacity);
}

// --- Incremental selector WITH Editorial Control — THE function production
// actually calls. It NEVER recomputes the whole Active Set: it only fills
// however many slots are currently open (capacity - existingActiveSet.length),
// and every item already in existingActiveSet is returned untouched, in
// place. This is what makes "Active Set only changes when the user releases
// a slot" true in code, not just in the spec.
//
//   selectActiveSetWithControl(rankedQueue, control, capacity, existingActiveSet)
//
// Pass order for the open slots: Pin-Pending Queue (FIFO) first — this is
// what lets a Pin issued while the set was full eventually get admitted
// without ever evicting anything — then coverage-first + ranked fallback
// for whatever capacity remains. ---
export function selectActiveSetWithControl(rankedQueue, control, capacity = 10, existingActiveSet = []) {
  const openSlots = capacity - existingActiveSet.length;
  if (openSlots <= 0) return existingActiveSet;

  const existingKeys = new Set(existingActiveSet.map(c => c.clusterKey));
  const existingTopics = new Set(existingActiveSet.map(c => c.topic));

  const controlled = applyEditorialControl(rankedQueue, control)
    .filter(c => !existingKeys.has(c.clusterKey));

  const newlyAdmitted = [];

  // Pass 0: Pin-Pending Queue, oldest pin first — consumes open slots before
  // coverage/ranked passes get a chance to.
  for (const clusterKey of control.pinPendingQueue()) {
    if (newlyAdmitted.length >= openSlots) break;
    const idx = controlled.findIndex(c => c.clusterKey === clusterKey);
    if (idx !== -1) {
      const [picked] = controlled.splice(idx, 1);
      newlyAdmitted.push({ ...picked, selectionReason: 'pin_pending' });
      control.fulfilPin(clusterKey);
    }
    // If the pinned item isn't in `controlled` (e.g. it was Removed, or fell
    // out of the ranked queue entirely), it silently stays pinned/pending —
    // it is never force-admitted by relaxing any other rule.
  }

  const remainingOpenSlots = openSlots - newlyAdmitted.length;
  if (remainingOpenSlots > 0) {
    newlyAdmitted.push(...fillSlots(controlled, remainingOpenSlots, existingTopics));
  }

  return [...existingActiveSet, ...newlyAdmitted];
}
