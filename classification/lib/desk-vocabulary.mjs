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
  'jenayah': 'Crime',
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
