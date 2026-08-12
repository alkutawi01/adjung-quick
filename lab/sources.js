// sources.js — RSS source registry for the Editorial Ranking Laboratory.
// Malay sources copied from Adjung Brief's live rss_sources_registry seed
// (Adjung-Core/server.js) so Quick's scoring behaves against feeds Izzat
// already trusts. English/Arabic sources are new — proposed, not yet vetted
// by Izzat, and should be swapped/pruned once real output is reviewed.

export const RSS_SOURCES = [
  // --- Malay (from Adjung Brief seed) ---
  { id: 'rss-kosmo', name: 'Kosmo Digital', url: 'https://www.kosmo.com.my/feed/', language: 'ms', trustScore: 90 },
  { id: 'rss-utusan', name: 'Utusan Malaysia', url: 'https://www.utusan.com.my/feed/', language: 'ms', trustScore: 95 },
  { id: 'rss-metro', name: 'Harian Metro', url: 'https://www.hmetro.com.my/mutakhir.xml', language: 'ms', trustScore: 90 },
  // rss-bernama DISABLED 2026-08-11: every guessed URL variant (news.php,
  // rss.php, general.php, etc.) returns 404 — Bernama appears to have
  // retired public RSS. Swapped for Astro Awani (verified working, ms
  // language) as an autonomous substitution; flag to Izzat for confirmation
  // — he may know a current Bernama feed URL, or may want it dropped for good.
  { id: 'rss-astro-awani', name: 'Astro Awani', url: 'https://www.astroawani.com/rss.xml', language: 'ms', trustScore: 90 },

  // --- English (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-world', name: 'BBC News World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', trustScore: 90 },
  { id: 'rss-aljazeera-en', name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', trustScore: 88 },
  { id: 'rss-guardian-world', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', language: 'en', trustScore: 88 },

  // --- Arabic (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-arabic', name: 'BBC Arabic', url: 'https://feeds.bbci.co.uk/arabic/rss.xml', language: 'ar', trustScore: 90 },
  { id: 'rss-aljazeera-ar', name: 'Al Jazeera Arabic', url: 'https://www.aljazeera.net/aljazeerarss/89b3e91e-3a0c-4622-8e5c-4c3bb2f1a340/73d0e1b4-532f-45ef-b135-bfdff8b4177f', language: 'ar', trustScore: 88 },
];
