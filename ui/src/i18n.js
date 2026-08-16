// i18n.js — UI chrome string table, keyed by locale.
//
// BUG FOUND LIVE (2026-08-13, Izzat's UI-2 live validation): the empty-Bidang
// message stayed in Malay even inside en-global/ar-global — screenshot
// confirmed "Belum ada berita..." rendering under an Arabic Wheel. UI-2A's
// contract (docs/ui-2-navigation-contract.md) covered DATA/taxonomy/RTL
// localization but never named UI CHROME (static copy: empty states,
// buttons, error messages) as something that must follow the edition too —
// a real gap, not just this one string.
//
// Every edition-facing static string used to live inline in JSX. This table
// is the single place they live now, keyed by locale (state/editions.js's
// own locale field — 'ms' | 'en' | 'ar'), so a new edition or a missed
// string is easy to audit against this file alone.
export const STRINGS = {
  ms: {
    emptyField: 'Belum ada berita yang memenuhi piawaian editorial hari ini.',
    back: '← Kembali',
    loadError: 'Gagal memuatkan berita',
    loading: 'Memuatkan berita...',
  },
  en: {
    emptyField: 'No stories meeting today’s editorial standard yet.',
    back: '← Back',
    loadError: 'Failed to load stories',
    loading: 'Loading stories...',
  },
  ar: {
    emptyField: 'لا توجد أخبار تستوفي المعايير التحريرية اليوم.',
    back: 'رجوع →',
    loadError: 'فشل تحميل الأخبار',
    loading: 'جارٍ تحميل الأخبار...',
  },
};

export function t(locale, key) {
  return STRINGS[locale]?.[key] ?? STRINGS.ms[key] ?? key;
}
