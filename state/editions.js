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
    // UI-2A (per ChatGPT, 2026-08-13): label communicates EDITION identity
    // ("which editorial worldview"), never just the language name alone —
    // "Malay" would wrongly imply this is a translation switch. Malaysia
    // context is real for this edition only (docs/edition-source-profile-model.md).
    label: 'Malaysia · Malay Edition',
    // 'Nasional' and 'Dunia' added 2026-08-13, per Izzat's direct decision
    // (docs/geography-residual-navigation-policy-v1.md found these two
    // geography-residual classification outputs — 63+46 real stories,
    // ~15% of placed ms-MY content — had no Wheel entry, unreachable by
    // any reader). Izzat corrected the session's over-engineered "separate
    // navigation mode" design with a simpler, industry-standard one: real
    // Malay portals just list Nasional/Dunia as ORDINARY categories
    // alongside Politik/Sukan/etc — no special mode needed. taxonomy[0]
    // is the cold-start default (App.jsx) — 'Nasional' leading matches
    // standard portal convention (Astro Awani/Utusan/BH all lead with
    // Nasional/Utama), a deliberate choice, not incidental ordering.
    taxonomy: [
      'Nasional', 'Dunia', 'Politik', 'Jenayah', 'Bisnes', 'Sukan',
      'Alam Sekitar', 'Bencana', 'Kesihatan', 'Pendidikan', 'Teknologi',
      'Sains', 'Budaya', 'Hiburan', 'Agama', 'Gaya Hidup',
    ],
  },
  // en-global / ar-global: INTERNATIONAL editions, not "Malaysian news in
  // English/Arabic". Named with the -global suffix deliberately so the
  // positioning lives in the identifier itself — 'en' alone names a
  // language, and the locked decision is that language does not determine
  // audience. See docs/edition-source-profile-model.md.
  'en-global': {
    editionId: 'en-global',
    locale: 'en',
    direction: 'ltr',
    // Deliberately "Global", never "Global · Malaysia" or similar — per
    // ChatGPT's explicit instruction: Malaysia context does not appear in
    // en-global/ar-global for v1, only as a possible future personalization
    // feature (login / prior ms-MY choice / shared location).
    label: 'Global · English Edition',
    taxonomy: [
      'Politics', 'Crime', 'Economy', 'Business', 'Sports', 'Environment',
      'Disaster', 'Health', 'Education', 'Technology', 'Science', 'Culture',
      'Entertainment', 'Religion', 'Lifestyle',
    ],
  },
  'ar-global': {
    editionId: 'ar-global',
    locale: 'ar',
    direction: 'rtl',
    label: 'Global · Arabic Edition',
    taxonomy: [
      'سياسة', 'جريمة', 'اقتصاد', 'رياضة', 'بيئة', 'كوارث', 'صحة وعلوم',
      'تعليم', 'تكنولوجيا', 'ثقافة وفنون', 'دين', 'منوعات',
    ],
  },
};

// Stable iteration order for the edition switcher UI — Object.keys() order
// is technically insertion order for string keys, but naming it explicitly
// avoids that being an implicit dependency.
export const EDITION_IDS = ['ms-MY', 'en-global', 'ar-global'];

export const DEFAULT_EDITION_ID = 'ms-MY';

export function getEdition(editionId) {
  return EDITIONS[editionId] ?? EDITIONS[DEFAULT_EDITION_ID];
}
