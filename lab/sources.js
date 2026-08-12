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

  // --- ms-MY category feeds (added 2026-08-12, Izzat) ---
  // Directly addresses the coverage gap found when the Wheel went live: only
  // 2 of 13 Politik clusters had Malay-language coverage, so the ms-MY
  // edition's Bidang rendered nearly empty. These are PUBLISHER-DECLARED
  // categories = Strong evidence (Tier 1, docs/evidence-quality-matrix-contract.md),
  // the most reliable class we have — and Astro Awani's own category names
  // (Politik/Bisnes/Sukan/Hiburan/Dunia/Gaya Hidup) map almost 1:1 onto the
  // ms-MY taxonomy, so they need almost no interpretation.
  // All verified live 2026-08-12: HTTP 200, 25 items each.
  { id: 'rss-awani-politik', name: 'Astro Awani — Politik', url: 'https://www.astroawani.com/rss/politics/public', language: 'ms', trustScore: 90, knownCategory: 'politik' },
  { id: 'rss-awani-nasional', name: 'Astro Awani — Nasional', url: 'https://www.astroawani.com/rss/national/public', language: 'ms', trustScore: 90, knownCategory: 'malaysia' },
  { id: 'rss-awani-bisnes', name: 'Astro Awani — Bisnes', url: 'https://www.astroawani.com/rss/business/public', language: 'ms', trustScore: 90, knownCategory: 'bisnes' },
  { id: 'rss-awani-sukan', name: 'Astro Awani — Sukan', url: 'https://www.astroawani.com/rss/sports/public', language: 'ms', trustScore: 90, knownCategory: 'sukan' },
  { id: 'rss-awani-hiburan', name: 'Astro Awani — Hiburan', url: 'https://www.astroawani.com/rss/entertainment/public', language: 'ms', trustScore: 90, knownCategory: 'hiburan' },
  { id: 'rss-awani-gayahidup', name: 'Astro Awani — Gaya Hidup', url: 'https://www.astroawani.com/rss/lifestyle/public', language: 'ms', trustScore: 90, knownCategory: 'gaya hidup' },
  { id: 'rss-awani-dunia', name: 'Astro Awani — Dunia', url: 'https://www.astroawani.com/rss/international/public', language: 'ms', trustScore: 90, knownCategory: 'dunia' },

  // RTM (berita.rtm.gov.my). OFFICIAL feeds — listed on RTM's own RSS page
  // (/rss/senarai-berita-rss/), 13 categories published by RTM themselves.
  // They deliver via rss.app, which is RTM's chosen platform, not a scrape or
  // an unofficial mirror. The only practical consequence is that rss.app sits
  // in the delivery path, so a delivery-side outage is possible independently
  // of RTM — worth knowing when debugging, not a reason to distrust the
  // source. Verified live: HTTP 200, 50 items each.
  // Jenayah is a category no other Malay source gives us this cleanly.
  { id: 'rss-rtm-nasional', name: 'RTM — Berita Nasional', url: 'https://rss.app/feeds/0q20i5CxKfD3ppJ9.xml', language: 'ms', trustScore: 88, knownCategory: 'malaysia' },
  { id: 'rss-rtm-ekonomi', name: 'RTM — Berita Ekonomi', url: 'https://rss.app/feeds/JCAvoTk2CKzZ7VrK.xml', language: 'ms', trustScore: 88, knownCategory: 'ekonomi' },
  { id: 'rss-rtm-dunia', name: 'RTM — Berita Dunia', url: 'https://rss.app/feeds/WAg4LOY6T5L7Le9m.xml', language: 'ms', trustScore: 88, knownCategory: 'dunia' },
  { id: 'rss-rtm-jenayah', name: 'RTM — Berita Jenayah', url: 'https://rss.app/feeds/C74Hu88HWR0XDAe0.xml', language: 'ms', trustScore: 88, knownCategory: 'jenayah' },
  { id: 'rss-rtm-sukan', name: 'RTM — Berita Sukan', url: 'https://rss.app/feeds/xdgz2Wiw03ZfQbD8.xml', language: 'ms', trustScore: 88, knownCategory: 'sukan' },
  { id: 'rss-rtm-hiburan', name: 'RTM — Berita Hiburan', url: 'https://rss.app/feeds/6YsTj9HrPlT7416Q.xml', language: 'ms', trustScore: 88, knownCategory: 'hiburan' },

  // JAKIM (islam.gov.my). The ONLY source we have for the Agama Bidang,
  // which renders completely empty today. Verified 2026-08-12: valid RSS
  // (Joomla), 10 items — but ONLY when fetched from a browser. Node's fetch
  // fails outright ("fetch failed"), the same symptom already documented for
  // Bernama's Malay feed. Likely TLS/User-Agent filtering at their end, not
  // a bad URL. Added anyway so the source is registered and the problem is
  // visible in the pipeline rather than forgotten — expect these two to be
  // skipped by lab/rss.js until that fetch issue is solved.
  { id: 'rss-jakim-berita', name: 'JAKIM — Berita', url: 'https://www.islam.gov.my/ms/berita?format=feed&type=rss', language: 'ms', trustScore: 85, knownCategory: 'agama' },
  { id: 'rss-jakim-kenyataan', name: 'JAKIM — Kenyataan Media', url: 'https://www.islam.gov.my/ms/kenyataan-media?format=feed&type=rss', language: 'ms', trustScore: 85, knownCategory: 'agama' },

  // DELIBERATELY NOT ADDED: Astro Awani's English feeds
  // (/rss/{category}/en/public, same 10 categories). Those are Malaysian
  // news in English — which is exactly what en-global must NOT be, per
  // Izzat's positioning decision (docs/edition-source-profile-model.md):
  // "saya tak nak Adjung Quick kelihatan seperti portal berasal dari
  // Malaysia." They are a strong candidate for a future ms-EN edition, or
  // as Asia coverage within en-global once per-edition Source Profiles
  // exist — not as general English sources today.
];
