// editions.js — Edition Registry for the UI state layer.
//
// Per docs/edition-state-model.md (Session UI-1, Step 1): editionContext
// is the single source of taxonomy for the Wheel — each edition owns its
// own independent field list, never derived from a shared universal
// taxonomy (same principle as classification/lib/edition-taxonomy.mjs,
// kept as a separate state-layer module rather than importing that
// classification-internal file directly, since this registry is about
// what the UI presents, not how the classification engine resolves
// evidence — the two may diverge, e.g. a field present in classification
// but deliberately not shown in the Wheel).

export const EDITIONS = {
  'ms-MY': {
    editionId: 'ms-MY',
    locale: 'ms',
    direction: 'ltr',
    taxonomy: [
      'Politik', 'Jenayah', 'Bisnes', 'Sukan', 'Alam Sekitar', 'Bencana',
      'Kesihatan', 'Pendidikan', 'Teknologi', 'Sains', 'Budaya', 'Hiburan',
      'Agama', 'Gaya Hidup',
    ],
  },
  'en': {
    editionId: 'en',
    locale: 'en',
    direction: 'ltr',
    taxonomy: [
      'Politics', 'Crime', 'Economy', 'Business', 'Sports', 'Environment',
      'Disaster', 'Health', 'Education', 'Technology', 'Science', 'Culture',
      'Entertainment', 'Religion', 'Lifestyle',
    ],
  },
  'ar': {
    editionId: 'ar',
    locale: 'ar',
    direction: 'rtl',
    taxonomy: [
      'سياسة', 'جريمة', 'اقتصاد', 'رياضة', 'بيئة', 'كوارث', 'صحة وعلوم',
      'تعليم', 'تكنولوجيا', 'ثقافة وفنون', 'دين', 'منوعات',
    ],
  },
};

export const DEFAULT_EDITION_ID = 'ms-MY';

export function getEdition(editionId) {
  return EDITIONS[editionId] ?? EDITIONS[DEFAULT_EDITION_ID];
}
