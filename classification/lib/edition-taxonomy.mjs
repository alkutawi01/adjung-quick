// edition-taxonomy.mjs — Sesi 3B.2B refactor (2026-08-12), per ChatGPT
// correcting its own earlier framing after Izzat asked "kenapa nak padankan
// bidang dlm edisi arab dengan edisi malaysia?": each edition's taxonomy is
// independent, not derived from a shared Universal Subject parent. Politics
// (EN) / Politik (MY) / سياسة (AR) are NOT "the same category" — they are
// three separate editorial decisions that happen to often agree.
//
// What this file IS: each edition's own list of display fields.
// What this file is NOT: a translation table that every Universal Subject
// must resolve into. There is no assumption that every universal subject
// has (or needs) a display field in every edition.
//
// default_mapping (renamed from maps_from): an OPTIONAL fallback hint — "if
// no Edition Rule already decided the placement, and this story's subject
// candidate matches one of these, place it here by default." It is NOT a
// required contract. A subject with no default_mapping anywhere just falls
// through to geography_fallback / unclassified, which is normal, not a gap.

export const EDITION_TAXONOMY = {
  'ms-MY': [
    { label: 'Politik', default_mapping: ['Politics'] },
    { label: 'Jenayah', default_mapping: ['Crime'] },
    { label: 'Bisnes', default_mapping: ['Business', 'Economy'] }, // LOCKED merge, real ms-MY portals don't split these
    { label: 'Sukan', default_mapping: ['Sports'] },
    { label: 'Alam Sekitar', default_mapping: ['Environment'] },
    { label: 'Bencana', default_mapping: ['Disaster'] },
    { label: 'Kesihatan', default_mapping: ['Health'] },
    { label: 'Pendidikan', default_mapping: ['Education'] },
    { label: 'Teknologi', default_mapping: ['Technology'] },
    { label: 'Sains', default_mapping: ['Science'] },
    { label: 'Budaya', default_mapping: ['Culture'] },
    { label: 'Hiburan', default_mapping: ['Entertainment'] },
    { label: 'Agama', default_mapping: ['Religion'] }, // future candidate for Wheel display; still a valid classification result
    { label: 'Gaya Hidup', default_mapping: ['Lifestyle'] },
  ],
  'en': [
    { label: 'Politics', default_mapping: ['Politics'] },
    { label: 'Crime', default_mapping: ['Crime'] },
    { label: 'Economy', default_mapping: ['Economy'] },
    { label: 'Business', default_mapping: ['Business'] }, // BBC/Guardian both split these — no merge for en
    { label: 'Sports', default_mapping: ['Sports'] },
    { label: 'Environment', default_mapping: ['Environment'] },
    { label: 'Disaster', default_mapping: ['Disaster'] },
    { label: 'Health', default_mapping: ['Health'] },
    { label: 'Education', default_mapping: ['Education'] },
    { label: 'Technology', default_mapping: ['Technology'] },
    { label: 'Science', default_mapping: ['Science'] },
    { label: 'Culture', default_mapping: ['Culture'] },
    { label: 'Entertainment', default_mapping: ['Entertainment'] },
    { label: 'Religion', default_mapping: ['Religion'] },
    { label: 'Lifestyle', default_mapping: ['Lifestyle'] },
  ],
  'ar': [
    { label: 'سياسة', default_mapping: ['Politics'] },
    { label: 'جريمة', default_mapping: ['Crime'] },
    { label: 'اقتصاد', default_mapping: ['Business', 'Economy'] }, // LOCKED merge, Arabic sources show no real split
    { label: 'رياضة', default_mapping: ['Sports'] },
    { label: 'بيئة', default_mapping: ['Environment'] },
    { label: 'كوارث', default_mapping: ['Disaster'] },
    { label: 'صحة وعلوم', default_mapping: ['Health', 'Science'] }, // LOCKED merge, BBC Arabic evidence
    { label: 'تعليم', default_mapping: ['Education'] },
    { label: 'تكنولوجيا', default_mapping: ['Technology'] },
    { label: 'ثقافة وفنون', default_mapping: ['Culture', 'Entertainment'] }, // LOCKED v1 merge, editorial choice not unanimous evidence — see sesi2-edition-taxonomy-design.md
    { label: 'دين', default_mapping: ['Religion'] },
    { label: 'منوعات', default_mapping: ['Lifestyle'] },
  ],
};

export const EDITION_GEOGRAPHY_RESIDUAL_LABEL = {
  // Used only when NO subject candidate exists at all — the pure residual
  // path, per the subject-beats-geography lock. 'Malaysia' geography ->
  // this edition's local label; anything else -> this edition's world label.
  'ms-MY': { local: 'Malaysia', world: 'Dunia' },
  'en': { local: 'Malaysia', world: 'World' },
  'ar': { local: 'ماليزيا', world: 'العالم' },
};

// Tier 3 of the resolver: default placement mapping. Only consulted when no
// Edition Rule (tiers 1-2, edition-rules.mjs) already matched. Returns null
// (not a thrown error, not a forced fallback) when this edition simply has
// no default placement for the given subject — that is a legitimate,
// expected outcome, not a gap to patch over.
export function resolveDefaultPlacement(edition, universalSubject) {
  const table = EDITION_TAXONOMY[edition] ?? [];
  const entry = table.find(e => e.default_mapping.includes(universalSubject));
  return entry?.label ?? null;
}
