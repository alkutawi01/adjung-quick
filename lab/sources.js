// sources.js — RSS source registry for the Editorial Ranking Laboratory.
// Malay sources copied from Adjung Brief's live rss_sources_registry seed
// (Adjung-Core/server.js) so Quick's scoring behaves against feeds Izzat
// already trusts. English/Arabic sources are new — proposed, not yet vetted
// by Izzat, and should be swapped/pruned once real output is reviewed.

export const RSS_SOURCES = [
  // --- Malay (from Adjung Brief seed) ---
  { id: 'rss-kosmo', name: 'Kosmo Digital', url: 'https://www.kosmo.com.my/feed/', language: 'ms', trustScore: 90, sourceType: 'general' },
  { id: 'rss-utusan', name: 'Utusan Malaysia', url: 'https://www.utusan.com.my/feed/', language: 'ms', trustScore: 95, sourceType: 'general' },
  { id: 'rss-metro', name: 'Harian Metro', url: 'https://www.hmetro.com.my/mutakhir.xml', language: 'ms', trustScore: 90, sourceType: 'general' },

  // Sesi 3A.1 (2026-08-12): re-found live at bernama.com/en|bm/rssfeed.php —
  // the earlier "DISABLED, every guessed URL 404s" note was simply wrong
  // about the URL, not about the feed's existence (Izzat found the real
  // one). Real, distinct Tier 1 evidence shape: every item title is
  // prefixed with its category ("World : ...", "Sukan : ..."), parsed by
  // classification/lib/bernama-prefix.mjs per-item — no knownCategory
  // needed on the source entry itself.
  { id: 'rss-bernama-en', name: 'Bernama (English)', url: 'https://www.bernama.com/en/rssfeed.php', language: 'en', trustScore: 92, sourceType: 'general' },
  { id: 'rss-bernama-bm', name: 'Bernama (Malay)', url: 'https://www.bernama.com/bm/rssfeed.php', language: 'ms', trustScore: 92, sourceType: 'general' },

  { id: 'rss-astro-awani', name: 'Astro Awani', url: 'https://www.astroawani.com/rss.xml', language: 'ms', trustScore: 90, sourceType: 'general' },

  // Sesi 3A.1: Harian Metro's real per-section feeds (verified live via its
  // own /rss index page, docs/source-registry-v2-audit.md), added ALONGSIDE
  // rss-metro's general mutakhir.xml above — that feed still matters for
  // general/breaking coverage, but now only ITS items need full content
  // classification. These four carry a Tier 1 knownCategory directly.
  { id: 'rss-metro-bisnes', name: 'Harian Metro — Bisnes', url: 'https://www.hmetro.com.my/bisnes.xml', language: 'ms', trustScore: 90, knownCategory: 'bisnes', sourceType: 'specialised' },
  { id: 'rss-metro-arena', name: 'Harian Metro — Arena', url: 'https://www.hmetro.com.my/arena.xml', language: 'ms', trustScore: 90, knownCategory: 'sukan', sourceType: 'specialised' },
  { id: 'rss-metro-global', name: 'Harian Metro — Global', url: 'https://www.hmetro.com.my/global.xml', language: 'ms', trustScore: 90, knownCategory: 'dunia', sourceType: 'specialised' },
  { id: 'rss-metro-rap', name: 'Harian Metro — Rap', url: 'https://www.hmetro.com.my/rap.xml', language: 'ms', trustScore: 90, knownCategory: 'hiburan', sourceType: 'specialised' },

  // Sesi 3A.1: Utusan/Kosmo real category feeds — WordPress
  // /category/{slug}/feed/ pattern, spot-verified live (ekonomi, sukan,
  // politik for Utusan; negara, hiburan for Kosmo). Added alongside each
  // site's general feed above, same reasoning as Harian Metro.
  { id: 'rss-utusan-ekonomi', name: 'Utusan — Ekonomi', url: 'https://www.utusan.com.my/category/ekonomi/feed/', language: 'ms', trustScore: 95, knownCategory: 'ekonomi', sourceType: 'specialised' },
  { id: 'rss-utusan-sukan', name: 'Utusan — Sukan', url: 'https://www.utusan.com.my/category/sukan/feed/', language: 'ms', trustScore: 95, knownCategory: 'sukan', sourceType: 'specialised' },
  { id: 'rss-utusan-politik', name: 'Utusan — Politik', url: 'https://www.utusan.com.my/category/politik/feed/', language: 'ms', trustScore: 95, knownCategory: 'politik', sourceType: 'specialised' },
  { id: 'rss-kosmo-hiburan', name: 'Kosmo — Hiburan', url: 'https://www.kosmo.com.my/category/hiburan/feed/', language: 'ms', trustScore: 90, knownCategory: 'hiburan', sourceType: 'specialised' },

  // --- English (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-world', name: 'BBC News World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', trustScore: 90, sourceType: 'general' },
  { id: 'rss-aljazeera-en', name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', trustScore: 88, sourceType: 'general' },
  { id: 'rss-guardian-world', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', language: 'en', trustScore: 88, sourceType: 'general' },

  // Global Phase 3A (2026-08-21, docs/global-edition-decision-v1.md B1) —
  // approved candidate, source-owned feed (not a scraper proxy, per
  // Phase 2A Principle B). Confirmed live via direct fetch at wiring time:
  // valid RSS 2.0, <language>en</language>, most items carry a real
  // <category> tag (Americas/Middle East/Africa/Europe/etc) -- closer to
  // Tier 1 evidence than BBC/AJ/Guardian's undifferentiated general feeds
  // above. Correction to the dry-run-first plan (2026-08-21): fetchFeed()
  // itself (lab/rss.js:191-192) skips any non-active source before ANY
  // network call -- a disabled source produces zero preview data, so
  // "disabled + --dry-run" gave no real signal (confirmed live: raw item
  // count was byte-identical across two dry-runs while these 3 sources
  // were disabled). --dry-run's own "stage but never swap" behavior is
  // the actual safety layer, not the source's active/disabled status.
  // Izzat approved flipping to 'active' for a real dry-run preview.
  { id: 'rss-france24-en', name: 'France 24 English', url: 'https://www.france24.com/en/rss', language: 'en', trustScore: 88, sourceType: 'general' },

  // Global Phase 3A (2026-08-21, docs/global-edition-decision-v1.md B1) --
  // approved candidate. Confirmed live 2026-08-21 via server-side fetch
  // from Izzat's own machine (this session's own WebFetch tool could not
  // reach rss.dw.com at all -- network-level block on the audit
  // environment, not a dead feed): HTTP 200, valid <title>Deutsche
  // Welle</title>. This is the GENERAL feed only -- per-category DW URLs
  // (business/sports/culture/science/environment) found during the
  // Phase 2A source search were NEVER independently verified live, only
  // guessed from search-result citations, so they are deliberately NOT
  // added here. Verify each one individually before adding -- do not
  // assume a plausible-looking rss.dw.com/xml/rss-en-* URL works just
  // because the pattern matches this one. Activated 2026-08-21 -- see
  // rss-france24-en's comment above for why "disabled" never provided
  // real preview safety, and --dry-run's stage-never-swap behavior does.
  { id: 'rss-dw-en', name: 'Deutsche Welle (English)', url: 'https://rss.dw.com/xml/rss-en-all', language: 'en', trustScore: 85, sourceType: 'general' },

  // --- Arabic (proposed — verify before treating as permanent) ---
  { id: 'rss-bbc-arabic', name: 'BBC Arabic', url: 'https://feeds.bbci.co.uk/arabic/rss.xml', language: 'ar', trustScore: 90, sourceType: 'general' },
  { id: 'rss-aljazeera-ar', name: 'Al Jazeera Arabic', url: 'https://www.aljazeera.net/aljazeerarss/89b3e91e-3a0c-4622-8e5c-4c3bb2f1a340/73d0e1b4-532f-45ef-b135-bfdff8b4177f', language: 'ar', trustScore: 88, sourceType: 'general' },

  // Global Phase 3A (2026-08-21, docs/global-edition-decision-v1.md B1) —
  // same reasoning/status as rss-france24-en above. Confirmed live: valid
  // RSS 2.0, <language>ar</language>, real current Arabic items. Distinct
  // editorial voice from AJ Arabic/BBC Arabic (French state broadcaster,
  // heavier Africa/Francophone coverage) -- directly targets ar-global's
  // Politics/Sports/Economy concentration risk (per Phase 2A Task A, 6/7
  // Politics items currently from Al Jazeera Arabic alone). Activated
  // 2026-08-21 -- see rss-france24-en's comment above.
  { id: 'rss-france-24-ar', name: 'France 24 Arabic', url: 'https://www.france24.com/ar/rss', language: 'ar', trustScore: 88, sourceType: 'general' },

  // --- ms-MY category feeds (added 2026-08-12, Izzat) ---
  // Directly addresses the coverage gap found when the Wheel went live: only
  // 2 of 13 Politik clusters had Malay-language coverage, so the ms-MY
  // edition's Bidang rendered nearly empty. These are PUBLISHER-DECLARED
  // categories = Strong evidence (Tier 1, docs/evidence-quality-matrix-contract.md),
  // the most reliable class we have — and Astro Awani's own category names
  // (Politik/Bisnes/Sukan/Hiburan/Dunia/Gaya Hidup) map almost 1:1 onto the
  // ms-MY taxonomy, so they need almost no interpretation.
  // All verified live 2026-08-12: HTTP 200, 25 items each.
  { id: 'rss-awani-politik', name: 'Astro Awani — Politik', url: 'https://www.astroawani.com/rss/politics/public', language: 'ms', trustScore: 90, knownCategory: 'politik', sourceType: 'specialised' },
  { id: 'rss-awani-nasional', name: 'Astro Awani — Nasional', url: 'https://www.astroawani.com/rss/national/public', language: 'ms', trustScore: 90, knownCategory: 'malaysia', sourceType: 'specialised' },
  { id: 'rss-awani-bisnes', name: 'Astro Awani — Bisnes', url: 'https://www.astroawani.com/rss/business/public', language: 'ms', trustScore: 90, knownCategory: 'bisnes', sourceType: 'specialised' },
  { id: 'rss-awani-sukan', name: 'Astro Awani — Sukan', url: 'https://www.astroawani.com/rss/sports/public', language: 'ms', trustScore: 90, knownCategory: 'sukan', sourceType: 'specialised' },
  { id: 'rss-awani-hiburan', name: 'Astro Awani — Hiburan', url: 'https://www.astroawani.com/rss/entertainment/public', language: 'ms', trustScore: 90, knownCategory: 'hiburan', sourceType: 'specialised' },
  { id: 'rss-awani-gayahidup', name: 'Astro Awani — Gaya Hidup', url: 'https://www.astroawani.com/rss/lifestyle/public', language: 'ms', trustScore: 90, knownCategory: 'gaya hidup', sourceType: 'specialised' },
  { id: 'rss-awani-dunia', name: 'Astro Awani — Dunia', url: 'https://www.astroawani.com/rss/international/public', language: 'ms', trustScore: 90, knownCategory: 'dunia', sourceType: 'specialised' },

  // RTM (berita.rtm.gov.my). OFFICIAL feeds — listed on RTM's own RSS page
  // (/rss/senarai-berita-rss/), 13 categories published by RTM themselves.
  // They deliver via rss.app, which is RTM's chosen platform, not a scrape or
  // an unofficial mirror. The only practical consequence is that rss.app sits
  // in the delivery path, so a delivery-side outage is possible independently
  // of RTM — worth knowing when debugging, not a reason to distrust the
  // source. Verified live: HTTP 200, 50 items each.
  // Jenayah is a category no other Malay source gives us this cleanly.
  { id: 'rss-rtm-nasional', name: 'RTM — Berita Nasional', url: 'https://rss.app/feeds/0q20i5CxKfD3ppJ9.xml', language: 'ms', trustScore: 88, knownCategory: 'malaysia', sourceType: 'specialised' },
  { id: 'rss-rtm-ekonomi', name: 'RTM — Berita Ekonomi', url: 'https://rss.app/feeds/JCAvoTk2CKzZ7VrK.xml', language: 'ms', trustScore: 88, knownCategory: 'ekonomi', sourceType: 'specialised' },
  { id: 'rss-rtm-dunia', name: 'RTM — Berita Dunia', url: 'https://rss.app/feeds/WAg4LOY6T5L7Le9m.xml', language: 'ms', trustScore: 88, knownCategory: 'dunia', sourceType: 'specialised' },
  { id: 'rss-rtm-jenayah', name: 'RTM — Berita Jenayah', url: 'https://rss.app/feeds/C74Hu88HWR0XDAe0.xml', language: 'ms', trustScore: 88, knownCategory: 'jenayah', sourceType: 'specialised' },
  { id: 'rss-rtm-sukan', name: 'RTM — Berita Sukan', url: 'https://rss.app/feeds/xdgz2Wiw03ZfQbD8.xml', language: 'ms', trustScore: 88, knownCategory: 'sukan', sourceType: 'specialised' },
  { id: 'rss-rtm-hiburan', name: 'RTM — Berita Hiburan', url: 'https://rss.app/feeds/6YsTj9HrPlT7416Q.xml', language: 'ms', trustScore: 88, knownCategory: 'hiburan', sourceType: 'specialised' },

  // JAKIM (islam.gov.my). Root cause diagnosed 2026-08-12 (not a status-code
  // issue like Bernama): UNABLE_TO_VERIFY_LEAF_SIGNATURE. Confirmed via a
  // direct TLS handshake — JAKIM's server does not send its intermediate
  // certificate, so any strict TLS client (Node) correctly rejects it while
  // browsers tolerate it (they cache/fetch intermediates more leniently).
  // This is a genuine misconfiguration on JAKIM's server, not our bug.
  //
  // Per ChatGPT (2026-08-12): do NOT relax TLS verification to work around
  // this, not even scoped to this one domain — that would set a precedent
  // ("if the source matters enough, bypass TLS") this project doesn't want,
  // for a feed that isn't even reachable reliably in the first place. Kept
  // registered rather than deleted, with status: 'failed_tls', so the gap
  // stays visible in the pipeline instead of being silently forgotten.
  // FIXED 2026-08-13: previously status:'failed_tls' — islam.gov.my serves
  // an incomplete chain (omits the GlobalSign intermediate). Rather than
  // leaving Bidang Agama without its two authority sources, the missing
  // intermediate is now supplied via `extraCa`, restoring FULL chain
  // verification (verified live: authorized: true). See lab/certs/README.md.
  { id: 'rss-jakim-berita', name: 'JAKIM — Berita', url: 'https://www.islam.gov.my/ms/berita?format=feed&type=rss', language: 'ms', trustScore: 85, knownCategory: 'agama', extraCa: 'globalsign-ecc-ov-ssl-ca-2018.pem', sourceType: 'authority_niche' },
  { id: 'rss-jakim-kenyataan', name: 'JAKIM — Kenyataan Media', url: 'https://www.islam.gov.my/ms/kenyataan-media?format=feed&type=rss', language: 'ms', trustScore: 85, knownCategory: 'agama', extraCa: 'globalsign-ecc-ov-ssl-ca-2018.pem', sourceType: 'authority_niche' },

  // Agama alternatives (2026-08-12), found per ChatGPT's instruction to keep
  // searching rather than rely on JAKIM alone. Both verified: valid feed,
  // real Islamic-content items.
  { id: 'rss-utusan-agama', name: 'Utusan — Agama', url: 'https://www.utusan.com.my/category/agama/feed/', language: 'ms', trustScore: 90, knownCategory: 'agama', sourceType: 'specialised' },
  // IKIM's feed mixes in occasional English-titled items (its own site is
  // bilingual) — kept anyway since the majority is genuine Malay Islamic
  // content and language filtering already happens downstream
  // (state/representation.js); not treated as reason to exclude the source.
  { id: 'rss-ikim', name: 'IKIM', url: 'https://www.ikim.gov.my/feed/', language: 'ms', trustScore: 85, knownCategory: 'agama', sourceType: 'authority_niche' },

  // Niche-authority sources for Bidang with no dedicated Malay news desk
  // (docs/empty-bidang-policy.md: fix the source registry, never infer the
  // Bidang from keywords). All verified 2026-08-12 through lab/rss.js itself,
  // not a raw fetch — that distinction mattered: a raw `<item>` regex showed
  // KPM as empty, while the real parser finds 329 entries, because KPM
  // publishes Atom `<entry>` rather than RSS `<item>`.
  { id: 'rss-mosti', name: 'MOSTI', url: 'https://www.mosti.gov.my/feed/', language: 'ms', trustScore: 85, knownCategory: 'sains', sourceType: 'authority_niche' },
  // excludePatterns (2026-08-12, per ChatGPT — see lab/rss.js's filtering
  // comment for the full reasoning): KPM's feed mixes real education news
  // with government procurement notices. 116/309 Pendidikan-classified
  // items in the first full re-ingest after the evidence-persistence fix
  // were tender/sebut-harga notices, not news, per docs/known-issues.
  //
  // DISABLED 2026-08-16 (docs/published-at-integrity-containment-plan-v1.md,
  // Option A, ChatGPT-approved): moe.gov.my/feed is Atom with no <published>
  // tag, only <updated> — confirmed live (docs/rss-kpm-published-date-resolution-audit-v1.md)
  // to be the CMS's last-sync time, not a real publish date, on EVERY sampled
  // entry including ones whose own titles reference 2018/2019 events. This
  // is the same status:'disabled' mechanism JAKIM used above while its TLS
  // issue was unresolved — kept registered (not deleted) so the gap stays
  // visible, per that same precedent. Existing rss-kpm rows already in
  // production are NOT cleaned up by this change — per ChatGPT's explicit
  // instruction, that is a separate ingestion-lifecycle decision, not part
  // of this containment step.
  { id: 'rss-kpm', name: 'Kementerian Pendidikan', url: 'https://www.moe.gov.my/feed', language: 'ms', trustScore: 85, knownCategory: 'pendidikan', sourceType: 'authority_niche',
    status: 'disabled',
    excludePatterns: [/tender/i, /sebut harga/i, /perolehan/i, /^notis\b/i] },
  // Amanz — a real Malay tech newsroom (not a ministry), so unlike MOSTI/KPM
  // it publishes daily and won't leave the Bidang looking stale. 30 items
  // verified. Tagged 'teknologi' rather than 'sains': its output is device
  // and product coverage, and per docs/empty-bidang-policy.md we place by
  // what a source actually publishes, not by what we wish filled the gap.
  { id: 'rss-amanz', name: 'Amanz', url: 'https://cms.amanz.my/feed/', language: 'ms', trustScore: 85, knownCategory: 'teknologi', sourceType: 'specialised' },

  // JHEAIPP — Penang state Islamic affairs department, found live by Izzat
  // 2026-08-13. Small (4 items at verification time) but real programme/
  // event announcements, same authority_niche shape as JAKIM/IKIM/Utusan
  // Agama — adds state-level Agama coverage alongside the federal sources.
  { id: 'rss-jaipp', name: 'JHEAIPP (Pulau Pinang)', url: 'https://jaipp.penang.gov.my/index.php/en/component/content/category/15-berita?Itemid=567&format=feed&type=rss', language: 'ms', trustScore: 80, knownCategory: 'agama', sourceType: 'authority_niche' },

  // NOTE: Bernama's Malay feed (rss-bernama-bm, registered above at line ~21)
  // was RECOVERED by the same change — it answers HTTP 500 while serving
  // valid RSS, so it was being discarded before lab/rss.js started trusting
  // the payload over the status code. No new entry needed; it simply works
  // now. It carries no knownCategory on purpose: Bernama encodes the category
  // as a TITLE PREFIX ("Dunia : ...", "Sukan : ..."), handled per-item by
  // classification/lib/bernama-prefix.mjs.

  // DELIBERATELY NOT ADDED: Astro Awani's English feeds
  // (/rss/{category}/en/public, same 10 categories). Those are Malaysian
  // news in English — which is exactly what en-global must NOT be, per
  // Izzat's positioning decision (docs/edition-source-profile-model.md):
  // "saya tak nak Adjung Quick kelihatan seperti portal berasal dari
  // Malaysia." They are a strong candidate for a future ms-EN edition, or
  // as Asia coverage within en-global once per-edition Source Profiles
  // exist — not as general English sources today.

  // PressDisplay-hosted newspaper front-page feeds, added by Izzat
  // 2026-08-13. Verified live: all 3 return real HTTP 200 RSS, general
  // (no knownCategory) editorial content — titles carry a date/section
  // prefix ("8/13/2026: MUKA DEPAN: ...") that isn't parsed as evidence
  // (unlike Bernama's prefix scheme), just ordinary title text.
  { id: 'rss-utusanborneo-sabah', name: 'Utusan Borneo (Sabah)', url: 'https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4965&type=full', language: 'ms', trustScore: 85, sourceType: 'general' },
  { id: 'rss-utusanborneo-sarawak', name: 'Utusan Borneo (Sarawak)', url: 'https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4888&type=full', language: 'ms', trustScore: 85, sourceType: 'general' },
  { id: 'rss-beritaharian', name: 'Berita Harian', url: 'https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5831&type=full', language: 'ms', trustScore: 92, sourceType: 'general' },
];
