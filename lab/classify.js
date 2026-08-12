// classify.js — rule-based topic classification. Zero AI: pure keyword matching
// against a static list Izzat can edit directly. Ties broken by list order
// (earlier topic wins), per the "single derived topic" decision — an item is
// never split across two topics in v1.
//
// 2026-08-11: expanded with Malaysian party/coalition/club names after
// Laboratory testing showed the generic-only list misclassifying local
// stories (e.g. "Speedy Tigers perkemas benteng" — a Kedah FC football story
// — tagged World because no Sports keyword matched a proper noun). Filled in
// autonomously from general knowledge per Izzat's "don't stop" directive —
// he should still review/correct this list, it's a starting point, not final.
//
// Matching uses word boundaries (not raw substring) to avoid false hits like
// "perang" matching inside an unrelated longer word.

const TOPIC_KEYWORDS = [
  {
    topic: 'Politics',
    keywords: [
      'kerajaan', 'menteri', 'parlimen', 'pilihan raya', 'dewan rakyat', 'dewan negara',
      'bersatu', 'perikatan nasional', ' pn ', 'pakatan harapan', ' ph ', 'barisan nasional', ' bn ',
      'umno', 'pkr', 'dap', 'amanah', 'gps', 'gris', 'pas', 'mca', 'mic', 'warisan',
      'rci', 'suruhanjaya diraja', 'anwar', 'perdana menteri',
      'government', 'minister', 'parliament', 'election', 'coalition',
      'حكومة', 'وزير', 'برلمان', 'انتخابات',
    ],
  },
  {
    topic: 'Economy',
    keywords: [
      'ekonomi', 'ringgit', 'saham', 'bank negara', 'inflasi', 'gst', 'sst', 'cukai',
      'economy', 'inflation', 'stock market', 'ringgit', 'gdp', 'tariff',
      'اقتصاد', 'سوق الأسهم', 'تضخم',
    ],
  },
  {
    topic: 'Sports',
    keywords: [
      'sukan', 'bola sepak', 'football', 'sports', 'olympics', 'fifa', 'fam',
      'jdt', 'johor darul ta\'zim', 'harimau malaya', 'speedy tigers', 'kedah fc',
      'selangor fa', 'perak fc', 'terengganu fc', 'sri pahang', 'pdrm fa', 'negeri sembilan fc',
      'super league', 'liga super', 'piala malaysia', 'piala fa',
      'chelsea', 'arsenal', 'liverpool', 'man utd', 'manchester', 'epl', 'premier league',
      'رياضة', 'كرة القدم', 'الدوري',
    ],
  },
  {
    topic: 'World',
    keywords: [
      'antarabangsa', 'dunia', 'perang', 'world', 'international', 'conflict',
      'gaza', 'ukraine', 'ukraina', 'russia', 'rusia', 'israel', 'netanyahu', 'trump',
      'عالم', 'حرب', 'دولي',
    ],
  },
  {
    topic: 'Science',
    keywords: [
      'sains', 'teknologi', 'nasa', 'science', 'technology', 'research', 'ai ', 'artificial intelligence',
      'علم', 'تكنولوجيا',
    ],
  },
  {
    topic: 'Health',
    keywords: [
      'kesihatan', 'hospital', 'penyakit', 'vaksin', 'health', 'disease', 'vaccine', 'cdc',
      'صحة', 'مستشفى', 'مرض',
    ],
  },
];

function containsKeyword(text, keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  // Word-boundary match where the keyword is plain word chars; for phrases
  // with spaces/apostrophes, fall back to substring (boundary regex on a
  // multi-word phrase is unnecessary — the phrase itself is specific enough).
  if (/^[a-z0-9]+$/i.test(kw)) {
    return new RegExp(`\\b${kw}\\b`, 'i').test(text);
  }
  return text.includes(kw);
}

export function classifyTopic(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  for (const { topic, keywords } of TOPIC_KEYWORDS) {
    if (keywords.some(kw => containsKeyword(text, kw))) {
      return topic;
    }
  }
  return 'Unclassified';
}
