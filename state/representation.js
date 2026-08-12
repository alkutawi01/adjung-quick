// representation.js — Representation Selector.
//
// Sits between Story Clustering (engine.js) and the Active Set Selector.
// Picks ONE representation (language-specific report) per cluster for the
// CURRENT user_context. Per tonight's locked decision: cluster identity is
// stable; the chosen representation can change (e.g. on language switch)
// without the story itself being considered "different".
//
// The exact geography→language algorithm is explicitly NOT locked yet
// (O-xxx, pending Izzat review) — `resolveScope` below is a placeholder using
// simple deterministic source metadata, swappable without touching anything
// downstream (Active Set Selector doesn't know or care how a representation
// was chosen).

// PROPOSAL — source coverage registry. Extends the existing source registry
// (sources.js) conceptually; kept separate here so it's obviously swappable.
const SOURCE_COVERAGE = {
  'rss-kosmo': 'malaysia', 'rss-utusan': 'malaysia', 'rss-metro': 'malaysia', 'rss-astro-awani': 'malaysia',
  'rss-bbc-world': 'international', 'rss-guardian-world': 'international',
  'rss-aljazeera-en': 'international', 'rss-bbc-arabic': 'international', 'rss-aljazeera-ar': 'international',
};

// PROPOSAL — which language is preferred for which story scope. Explicitly
// NOT "language implies scope" (ChatGPT's counter-example: Al Jazeera Arabic
// reporting on the Colombia earthquake is not a Middle East story) — this
// only fires once scope is already known from the story's own signals.
const SCOPE_LANGUAGE_PREFERENCE = {
  malaysia: 'ms',
  international: 'en',
  middle_east: 'ar',
};

function resolveScope(cluster) {
  // Minimal v1: majority coverage signal among cluster members' sources.
  // Deliberately simple — escalate only if production evidence shows this
  // guesses wrong often (same discipline as Tier-1 vs MinHash tonight).
  const counts = {};
  for (const member of cluster.members) {
    const coverage = SOURCE_COVERAGE[member.sourceId] || 'unknown';
    counts[coverage] = (counts[coverage] || 0) + 1;
  }
  const [topScope] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['unknown', 0];
  return topScope;
}

// Selects a representation from a cluster for the given eligible languages.
// Never lets language preference override a materially better representation
// (per tonight's discussion) — "materially better" defined here as: a
// representation is only skipped in favour of a lower-ranked one if both are
// in eligibleLanguages, using preference as a TIEBREAK, not an override.
export function selectRepresentation(cluster, eligibleLanguages) {
  const candidates = cluster.members.filter(m => eligibleLanguages.includes(m.language));
  if (candidates.length === 0) return null; // Type 2: story unavailable in this language context

  if (candidates.length === 1) return candidates[0];

  const scope = resolveScope(cluster);
  const preferred = SCOPE_LANGUAGE_PREFERENCE[scope];
  const preferredMatch = candidates.find(c => c.language === preferred);
  return preferredMatch || candidates[0];
}
