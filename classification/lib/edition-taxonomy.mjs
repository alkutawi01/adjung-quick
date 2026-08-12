// edition-taxonomy.mjs — Edition Display Transformations, as DATA, per
// docs/edition-architecture-model.md's LOCKED framework and
// docs/edition-classification-contract.md's display_fields shape. Never
// code branches per edition inside the resolver — this table IS the rule.
//
// maps_from: which Universal Subjects/Geography values collapse into this
// one display label for this edition. Multiple universal values -> one
// label = Merge. One universal value -> its own label = Rename (or
// pass-through, for English).

export const EDITION_SUBJECT_TAXONOMY = {
  'ms-MY': [
    { label: 'Politik', maps_from: ['Politics'] },
    { label: 'Jenayah', maps_from: ['Crime'] },
    { label: 'Bisnes', maps_from: ['Business', 'Economy'] }, // LOCKED merge, real ms-MY portals don't split these
    { label: 'Sukan', maps_from: ['Sports'] },
    { label: 'Alam Sekitar', maps_from: ['Environment'] },
    { label: 'Bencana', maps_from: ['Disaster'] },
    { label: 'Kesihatan', maps_from: ['Health'] },
    { label: 'Pendidikan', maps_from: ['Education'] },
    { label: 'Teknologi', maps_from: ['Technology'] },
    { label: 'Sains', maps_from: ['Science'] },
    { label: 'Budaya', maps_from: ['Culture'] },
    { label: 'Hiburan', maps_from: ['Entertainment'] },
    { label: 'Agama', maps_from: ['Religion'] }, // future candidate for Wheel display; still a valid classification result
    { label: 'Gaya Hidup', maps_from: ['Lifestyle'] },
  ],
  'en': [
    { label: 'Politics', maps_from: ['Politics'] },
    { label: 'Crime', maps_from: ['Crime'] },
    { label: 'Economy', maps_from: ['Economy'] },
    { label: 'Business', maps_from: ['Business'] }, // BBC/Guardian both split these — no merge for en
    { label: 'Sports', maps_from: ['Sports'] },
    { label: 'Environment', maps_from: ['Environment'] },
    { label: 'Disaster', maps_from: ['Disaster'] },
    { label: 'Health', maps_from: ['Health'] },
    { label: 'Education', maps_from: ['Education'] },
    { label: 'Technology', maps_from: ['Technology'] },
    { label: 'Science', maps_from: ['Science'] },
    { label: 'Culture', maps_from: ['Culture'] },
    { label: 'Entertainment', maps_from: ['Entertainment'] },
    { label: 'Religion', maps_from: ['Religion'] },
    { label: 'Lifestyle', maps_from: ['Lifestyle'] },
  ],
  'ar': [
    { label: 'سياسة', maps_from: ['Politics'] },
    { label: 'جريمة', maps_from: ['Crime'] },
    { label: 'اقتصاد', maps_from: ['Business', 'Economy'] }, // LOCKED merge, Arabic sources show no real split
    { label: 'رياضة', maps_from: ['Sports'] },
    { label: 'بيئة', maps_from: ['Environment'] },
    { label: 'كوارث', maps_from: ['Disaster'] },
    { label: 'صحة وعلوم', maps_from: ['Health', 'Science'] }, // LOCKED merge, BBC Arabic evidence
    { label: 'تعليم', maps_from: ['Education'] },
    { label: 'تكنولوجيا', maps_from: ['Technology'] },
    { label: 'ثقافة وفنون', maps_from: ['Culture', 'Entertainment'] }, // LOCKED v1 merge, editorial choice not unanimous evidence — see sesi2-edition-taxonomy-design.md
    { label: 'دين', maps_from: ['Religion'] },
    { label: 'منوعات', maps_from: ['Lifestyle'] },
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

export function subjectToDisplayField(edition, universalSubject) {
  const table = EDITION_SUBJECT_TAXONOMY[edition] ?? [];
  const entry = table.find(e => e.maps_from.includes(universalSubject));
  return entry?.label ?? null;
}
