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

  // Sesi 3A.1 (2026-08-12): re-found live at bernama.com/en|bm/rssfeed.php —
  // the earlier "DISABLED, every guessed URL 404s" note was simply wrong
  // about the URL, not about the feed's existence (Izzat found the real
  // one). Real, distinct Tier 1 evidence shape: every item title is
  // prefixed with its category ("World : ...", "Sukan : ..."), parsed by
  // classification/lib/bernama-prefix.mjs per-item — no knownCategory
  // needed on the source entry itself.
  { id: 'rss-bernama-en', name: 'Bernama (English)', url: 'https://www.bernama.com/en/rssfeed.php', language: 'en', trustScore: 92 },
  { id: 'rss-bernama-bm', name: 'Bernama (Malay)', url: 'https://www.bernama.com/bm/rssfeed.php', language: 'ms', trustScore: 92 },

  { id: 'rss-astro-awani', name: 'Astro Awani', url: 'https://www.astroawani.com/rss.xml', language: 'ms', trustScore: 90 },

  // Sesi 3A.1: Harian Metro's real per-section feeds (verified live via its
  // own /rss index page, docs/source-registry-v2-audit.md), added ALONGSIDE
  // rss-metro's general mutakhir.xml above — that feed still matters for
  // general/breaking coverage, but now only ITS items need full content
  // classification. These four carry a Tier 1 knownCategory directly.
  { id: 'rss-metro-bisnes', name: 'Harian Metro — Bisnes', url: 'https://www.hmetro.com.my/bisnes.xml', language: 'ms', trustScore: 90, knownCategory: 'bisnes' },
  { id: 'rss-metro-arena', name: 'Harian Metro — Arena', url: 'https://www.hmetro.com.my/arena.xml', language: 'ms', trustScore: 90, knownCategory: 'sukan' },
  { id: 'rss-metro-global', name: 'Harian Metro — Global', url: 'https://www.hmetro.com.my/global.xml', language: 'ms', trustScore: 90, knownCategory: 'dunia' },
  { id: 'rss-metro-rap', name: 'Harian Metro — Rap', url: 'https://www.hmetro.com.my/rap.xml', language: 'ms', trustScore: 90, knownCategory: 'hiburan' },

  // Sesi 3A.1: Utusan/Kosmo real category feeds — WordPress
  // /category/{slug}/feed/ pattern, spot-verified live (ekonomi, sukan,
  // politik for Utusan; negara, hiburan for Kosmo). Added alongside each
  // site's general feed above, same reasoning as Harian Metro.
  { id: 'rss-utusan-ekonomi', name: 'Utusan — Ekonomi', url: 'https://www.utusan.com.my/category/ekonomi/feed/', language: 'ms', trustScore: 95, knownCategory: 'ekonomi' },
  { id: 'rss-utusan-sukan', name: 'Utusan — Sukan', url: 'https://www.utusan.com.my/category/sukan/feed/', language: 'ms', trustScore: 95, knownCategory: 'sukan' },
  { id: 'rss-utusan-politik', name: 'Utusan — Politik', url: 'https://www.utusan.com.my/category/politik/feed/', language: 'ms', trustScore: 95, knownCategory: 'politik' },
  { id: 'rss-kosmo-hiburan', name: 'Kosmo — Hiburan', url: 'https://www.kosmo.com.my/category/hiburan/feed/', language: 'ms', trustScore: 90, knownCategory: 'hiburan' },

  // --- English (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-world', name: 'BBC News World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', trustScore: 90 },
  { id: 'rss-aljazeera-en', name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', trustScore: 88 },
  { id: 'rss-guardian-world', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', language: 'en', trustScore: 88 },

  // --- Arabic (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-arabic', name: 'BBC Arabic', url: 'https://feeds.bbci.co.uk/arabic/rss.xml', language: 'ar', trustScore: 90 },
  { id: 'rss-aljazeera-ar', name: 'Al Jazeera Arabic', url: 'https://www.aljazeera.net/aljazeerarss/89b3e91e-3a0c-4622-8e5c-4c3bb2f1a340/73d0e1b4-532f-45ef-b135-bfdff8b4177f', language: 'ar', trustScore: 88 },
];
