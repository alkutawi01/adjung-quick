// ranking-comparator.mjs — compares a legacy selection against an
// editorial selection for the SAME candidate pool. Per ChatGPT's explicit
// framing: never "winner/loser" — this reports DIFFERENCE, not which
// path is better. That judgment is Izzat's, informed by the reasons.

export function compareSelections(legacy, editorial) {
  const legacyIds = new Set(legacy.map(c => c.storyId));
  const editorialIds = new Set(editorial.map(c => c.storyId));

  const added = editorial.filter(c => !legacyIds.has(c.storyId));
  const removed = legacy.filter(c => !editorialIds.has(c.storyId));
  const unchanged = legacy.filter(c => editorialIds.has(c.storyId));

  const stability = legacy.length > 0 ? unchanged.length / legacy.length : 1;

  const sourceDist = list => {
    const dist = {};
    list.forEach(c => { dist[c.sourceId] = (dist[c.sourceId] ?? 0) + 1; });
    return dist;
  };

  return {
    stability: Math.round(stability * 100) / 100,
    sourceDistribution: {
      legacy: sourceDist(legacy),
      editorial: sourceDist(editorial),
    },
    diff: {
      added: added.map(c => ({ storyId: c.storyId, title: c.title, source: c.sourceId, reasons: c.reasons })),
      removed: removed.map(c => ({ storyId: c.storyId, title: c.title, source: c.sourceId })),
      unchanged: unchanged.map(c => c.storyId),
    },
  };
}
