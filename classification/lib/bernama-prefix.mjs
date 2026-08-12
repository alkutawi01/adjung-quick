// bernama-prefix.mjs — Bernama's real, distinct evidence shape: every item
// title is prefixed with a category, e.g. "World : Bangladesh To Have..."
// or "Sukan : Malaysia Sertai...". Found by Izzat 2026-08-12, verified live
// on bernama.com/en/rssfeed.php and /bm/rssfeed.php. This is Tier 1
// (publisher-declared), just a different place to read it from than a
// separate feed URL (Harian Metro) or a URL path segment (Astro Awani).

const BERNAMA_PREFIX_MAP = {
  'business': 'Business',
  'sports': 'Sports',
  'sukan': 'Sports',
  // 'world'/'dunia' -> geography only, not a subject
  // 'general'/'am' -> true catch-all, no subject signal
};

const BERNAMA_GEOGRAPHY_PREFIX = {
  'world': 'World',
  'dunia': 'World',
};

export function extractBernamaPrefix(title) {
  const m = /^([^:]+):\s*/.exec(title || '');
  if (!m) return { subject: null, geography: null, strippedTitle: title };
  const prefix = m[1].trim().toLowerCase();
  return {
    subject: BERNAMA_PREFIX_MAP[prefix] ?? null,
    geography: BERNAMA_GEOGRAPHY_PREFIX[prefix] ?? null,
    rawPrefix: m[1].trim(),
    strippedTitle: title.slice(m[0].length),
  };
}
