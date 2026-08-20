// desk-vocabulary.mjs — Known desk/category/prefix strings, mapped to
// Universal Subjects (docs/universal-classification-model.md) and
// Universal Geography values. This is DATA extracted from real evidence
// already gathered (docs/classification-taxonomy-mapping.md,
// docs/sesi2-edition-taxonomy-design.md, docs/source-registry-v2-audit.md)
// — not a fresh guess. Extend this table as new real evidence appears;
// don't hand-add speculative entries.
//
// Per docs/story-understanding-engine-spec.md: this feeds Tiers 1-3 of the
// evidence hierarchy (publisher-declared feed/prefix, URL structure, RSS
// <category>). Tier 5 (content rules) lives separately in content-rules.mjs
// — deliberately kept minimal, not a large keyword list, per spec.

// Real evidence: Astro Awani URL desks, Utusan/Kosmo URL + category-feed
// slugs, Harian Metro section names, Bernama title prefixes, BBC/Guardian/
// Al Jazeera EN desks, Al Jazeera/BBC Arabic desks + categories.
export const SUBJECT_VOCABULARY = {
  // --- ms-MY ---
  'politik': 'Politics', 'nasional/politik': 'Politics', 'berita-politik': 'Politics',
  'jenayah': 'Crime', 'kes': 'Crime', // 'kes' added 2026-08-16 — RTM uses both /jenayah/ and /kes/ URL paths for crime/court stories (Izzat found /kes/ live)
  'ekonomi': 'Economy',
  'bisnes': 'Business', 'berita-bisnes': 'Business',
  'sukan': 'Sports', 'berita-sukan': 'Sports', 'arena': 'Sports',
  'kesihatan': 'Health', 'sihat': 'Health',
  'pendidikan': 'Education', 'akademia': 'Education',
  'teknologi': 'Technology', 'itmetro': 'Technology',
  'sains': 'Science',
  'alam sekitar': 'Environment',
  'budaya': 'Culture',
  'hiburan': 'Entertainment', 'gaya/hiburan': 'Entertainment', 'berita-hiburan': 'Entertainment', 'rap': 'Entertainment',
  'agama': 'Religion', 'addin': 'Religion',
  'gaya hidup': 'Lifestyle', 'gaya-hidup': 'Lifestyle', 'santai': 'Lifestyle',

  // Polish 9C (2026-08-20, docs/polish-9-audit-v1.md): RTM's site serves
  // the SAME categories under TWO different URL structures —
  // "/{category}/senarai-berita-{category}/..." (leading bare category
  // segment, already covered above via 'sukan'/'jenayah'/etc.) AND
  // "/senarai-berita-{category}/senarai-artikel/..." (no leading bare
  // segment — deskFromUrl() takes the first 2 path segments as a WHOLE
  // token each, no hyphen-splitting, so this compound form never matched
  // the shorter keys above). Verified against real production data: the
  // first structure was 100% classified across every RTM category
  // checked (63/63 nasional, 32/32 dunia, 29/29 sukan, 24/24 jenayah,
  // 19/19 ekonomi); the second structure was the ONLY source of RTM's
  // classification gaps (sukan 9/12, nasional 6/12, pilihan-raya 0/1) —
  // items under it were classifying only by lucky title-keyword hits, not
  // via this URL signal RTM's own site already provides accurately.
  // Added for every category confirmed live under this second structure,
  // not just the one this audit started from — CLAUDE.md's "same
  // tier/pattern must be treated uniformly" rule; picking one category
  // and leaving the rest broken would be exactly that failure mode.
  //
  // Adversarial review noted: for a Structure-A URL, deskFromUrl()'s
  // first 2 segments are the bare category AND this compound (e.g.
  // "sukan" + "senarai-berita-sukan"), so BOTH now match the same value
  // at the same url_path tier — aggregate()'s noisy-OR nudges confidence
  // from 0.90 to 0.99 for a case that was already unambiguous. Currently
  // inert (0.90 already clears every confidence threshold this project
  // uses), not a behavior change for any classification outcome today —
  // recorded here in case a future, stricter threshold ever makes it
  // matter.
  'senarai-berita-sukan': 'Sports',
  'senarai-berita-jenayah': 'Crime', 'senarai-berita-kes': 'Crime',
  'senarai-berita-ekonomi': 'Economy', 'senarai-berita-niaga': 'Business',
  'senarai-berita-hiburan': 'Entertainment',
  // 'pilihan raya' (election) has no more specific Universal Subject than
  // Politics in this project's taxonomy — matches content-rules.mjs's own
  // existing 'election'/'PRU' -> Politics mapping.
  'senarai-berita-pilihan-raya': 'Politics',

  'business': 'Business',
  'sports': 'Sports',
  // 'world'/'general' deliberately absent here — 'World' is Bernama's
  // geography-only prefix (see GEOGRAPHY_VOCABULARY), 'General' is
  // Bernama's true catch-all with no subject signal at all.

  // --- English ---
  'politics': 'Politics',
  'crime': 'Crime',
  'economy': 'Economy',
  'us-politics': 'Politics',
  'environment': 'Environment', 'climate': 'Environment',
  'culture': 'Culture', 'arts': 'Culture',
  'entertainment': 'Entertainment',
  'science': 'Science', 'science and technology': 'Technology', // AJ-EN combines these; split heuristically in mapper
  'technology': 'Technology',
  'health': 'Health', 'global health': 'Health',
  'football': 'Sports', 'sport': 'Sports',
  'travel': 'Lifestyle', 'food': 'Lifestyle',

  // --- Arabic ---
  'سياسة': 'Politics', 'politics_ar': 'Politics',
  'اقتصاد': 'Economy', 'ebusiness': 'Economy',
  'رياضة': 'Sports', 'sport_ar': 'Sports',
  'علوم': 'Science', 'science_ar': 'Science',
  'تكنولوجيا': 'Technology', 'tech_ar': 'Technology',
  'فن': 'Entertainment', 'فنون': 'Entertainment', 'ثقافة': 'Culture', // AJ Arabic's single "فن" desk mixes both — real ambiguity, kept as two entries, resolved by disambiguation in mapper
  'صحة': 'Health', 'health_ar': 'Health',
  'تعليم': 'Education',
};

// Geography desk/prefix strings — kept separate per the locked Subject/
// Geography split (universal-classification-model.md).
export const GEOGRAPHY_VOCABULARY = {
  'malaysia': 'Malaysia', 'berita-malaysia': 'Malaysia', 'nasional': 'Malaysia', 'negara': 'Malaysia',
  'dunia': 'World', 'berita-dunia': 'World', 'global': 'World', 'world': 'World',
  // Polish 9C (2026-08-20) — see the matching comment block in
  // SUBJECT_VOCABULARY above: RTM's alternate "senarai-berita-{category}/
  // senarai-artikel/..." URL structure, verified against real production
  // data (nasional 6/12 unclassified under this structure specifically,
  // 0/63 under the other; dunia already 100% under both, added here for
  // consistency with the same confirmed URL family, not because a gap was
  // measured for it).
  'senarai-berita-nasional': 'Malaysia', 'senarai-berita-dunia': 'World',
  'senarai-berita-global': 'World',
  'asia barat': 'Middle East', 'middle east': 'Middle East', 'mideast': 'Middle East',
  'us-news': 'Americas', 'us-canada': 'Americas', 'americas': 'Americas',
  'uk-news': 'Europe', 'europe': 'Europe',
  'australia-news': 'Southeast Asia', // Australia isn't SEA geographically, but closest bucket in v1 6-region list; flag as a future refinement, not corrected silently
  'asia': 'Southeast Asia',
};

// Structural sections/recency markers — explicitly NEVER a subject or
// geography signal. Matching these should produce NO candidate, not a
// weak one. Per quick-bidang-taxonomy.md's exclusion list.
export const STRUCTURAL_NOISE = new Set([
  'mutakhir', 'terkini', 'berita', 'news', 'utama', 'semasa',
  'news/articles', 'news/videos', 'news/liveblog', 'video/newsfeed',
  'features/longform', 'arabic/articles', 'berita', 'أخبار', 'akhbar',
  'show types', 'newsfeed', 'tv news',
]);

export function normalizeToken(s) {
  return (s || '').toString().trim().toLowerCase();
}
