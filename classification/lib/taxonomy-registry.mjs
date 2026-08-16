// taxonomy-registry.mjs — Taxonomy Stable Field-ID V1, single source of
// truth. Per docs/taxonomy-stable-field-id-design-v1.md (§5, §7) and
// docs/taxonomy-stable-field-id-migration-plan-v1.md.
//
// Collapses what were previously TWO independently hand-maintained lists
// (state/editions.js's `taxonomy` arrays and this directory's own
// edition-taxonomy.mjs's `EDITION_TAXONOMY`) into one. Both files now
// derive their existing exported shapes from this registry — neither
// file's public API changed, only where the data comes from.
//
// Each entry:
//   field_code    — stable, never changes once assigned. What every
//                    consumer (reader, ranking, Pin) compares going
//                    forward. Equal to the (lowercased) subject_code when
//                    the field is a 1:1 mapping; a distinct code only
//                    when an edition merges multiple global subjects into
//                    one displayed Bidang (e.g. ms-MY's Bisnes).
//   label         — the ONLY thing an admin ever edits. Freely renameable
//                    without touching any classification data.
//   subject_codes — which global Universal Subject value(s) resolve here.
//                    MUST match desk-vocabulary.mjs's SUBJECT_VOCABULARY
//                    output casing exactly ('Politics', 'Business', …) —
//                    deliberately NOT lowercased, to avoid a much larger,
//                    riskier rename across the classifier/evidence layer
//                    for zero real benefit (these strings are already
//                    stable, human-readable machine values, just not
//                    snake_case). null for geography-residual fields
//                    (Nasional/Dunia/World/العالم) — there is no subject
//                    fact for these, by design
//                    (docs/geography-residual-navigation-policy-v1.md).
//   wheel_visible — whether this field appears in the reader's Wheel.
//                    Preserves an existing, pre-migration divergence:
//                    en-global/ar-global's world-residual field IS a real
//                    classification output (confirmed live: 3 en-global
//                    rows with field='World') but was NEVER in
//                    state/editions.js's taxonomy array — genuinely
//                    unreachable on the Wheel today. This registry
//                    preserves that exact behavior rather than silently
//                    fixing it (a real, separate gap, out of scope here).

export const TAXONOMY_REGISTRY = {
  'ms-MY': [
    { field_code: 'nasional', label: 'Nasional', subject_codes: null, wheel_visible: true },
    { field_code: 'dunia', label: 'Dunia', subject_codes: null, wheel_visible: true },
    { field_code: 'politics', label: 'Politik', subject_codes: ['Politics'], wheel_visible: true },
    { field_code: 'crime', label: 'Jenayah', subject_codes: ['Crime'], wheel_visible: true },
    { field_code: 'bisnes', label: 'Bisnes', subject_codes: ['Business', 'Economy'], wheel_visible: true }, // LOCKED merge, real ms-MY portals don't split these
    { field_code: 'sports', label: 'Sukan', subject_codes: ['Sports'], wheel_visible: true },
    { field_code: 'environment', label: 'Alam Sekitar', subject_codes: ['Environment'], wheel_visible: true },
    { field_code: 'disaster', label: 'Bencana', subject_codes: ['Disaster'], wheel_visible: true },
    { field_code: 'health', label: 'Kesihatan', subject_codes: ['Health'], wheel_visible: true },
    { field_code: 'education', label: 'Pendidikan', subject_codes: ['Education'], wheel_visible: true },
    { field_code: 'technology', label: 'Teknologi', subject_codes: ['Technology'], wheel_visible: true },
    { field_code: 'science', label: 'Sains', subject_codes: ['Science'], wheel_visible: true },
    { field_code: 'culture', label: 'Budaya', subject_codes: ['Culture'], wheel_visible: true },
    { field_code: 'entertainment', label: 'Hiburan', subject_codes: ['Entertainment'], wheel_visible: true },
    { field_code: 'religion', label: 'Agama', subject_codes: ['Religion'], wheel_visible: true }, // future candidate for Wheel display; still a valid classification result
    { field_code: 'lifestyle', label: 'Gaya Hidup', subject_codes: ['Lifestyle'], wheel_visible: true },
  ],
  'en-global': [
    { field_code: 'politics', label: 'Politics', subject_codes: ['Politics'], wheel_visible: true },
    { field_code: 'crime', label: 'Crime', subject_codes: ['Crime'], wheel_visible: true },
    { field_code: 'economy', label: 'Economy', subject_codes: ['Economy'], wheel_visible: true },
    { field_code: 'business', label: 'Business', subject_codes: ['Business'], wheel_visible: true }, // BBC/Guardian both split these — no merge for en
    { field_code: 'sports', label: 'Sports', subject_codes: ['Sports'], wheel_visible: true },
    { field_code: 'environment', label: 'Environment', subject_codes: ['Environment'], wheel_visible: true },
    { field_code: 'disaster', label: 'Disaster', subject_codes: ['Disaster'], wheel_visible: true },
    { field_code: 'health', label: 'Health', subject_codes: ['Health'], wheel_visible: true },
    { field_code: 'education', label: 'Education', subject_codes: ['Education'], wheel_visible: true },
    { field_code: 'technology', label: 'Technology', subject_codes: ['Technology'], wheel_visible: true },
    { field_code: 'science', label: 'Science', subject_codes: ['Science'], wheel_visible: true },
    { field_code: 'culture', label: 'Culture', subject_codes: ['Culture'], wheel_visible: true },
    { field_code: 'entertainment', label: 'Entertainment', subject_codes: ['Entertainment'], wheel_visible: true },
    { field_code: 'religion', label: 'Religion', subject_codes: ['Religion'], wheel_visible: true },
    { field_code: 'lifestyle', label: 'Lifestyle', subject_codes: ['Lifestyle'], wheel_visible: true },
    { field_code: 'world', label: 'World', subject_codes: null, wheel_visible: false }, // pre-existing gap, preserved not fixed — see header comment
  ],
  'ar-global': [
    { field_code: 'politics', label: 'سياسة', subject_codes: ['Politics'], wheel_visible: true },
    { field_code: 'crime', label: 'جريمة', subject_codes: ['Crime'], wheel_visible: true },
    { field_code: 'iqtisad', label: 'اقتصاد', subject_codes: ['Business', 'Economy'], wheel_visible: true }, // LOCKED merge, Arabic sources show no real split
    { field_code: 'sports', label: 'رياضة', subject_codes: ['Sports'], wheel_visible: true },
    { field_code: 'environment', label: 'بيئة', subject_codes: ['Environment'], wheel_visible: true },
    { field_code: 'disaster', label: 'كوارث', subject_codes: ['Disaster'], wheel_visible: true },
    { field_code: 'health_science', label: 'صحة وعلوم', subject_codes: ['Health', 'Science'], wheel_visible: true }, // LOCKED merge, BBC Arabic evidence
    { field_code: 'education', label: 'تعليم', subject_codes: ['Education'], wheel_visible: true },
    { field_code: 'technology', label: 'تكنولوجيا', subject_codes: ['Technology'], wheel_visible: true },
    { field_code: 'culture_entertainment', label: 'ثقافة وفنون', subject_codes: ['Culture', 'Entertainment'], wheel_visible: true }, // LOCKED v1 merge, editorial choice not unanimous evidence — see sesi2-edition-taxonomy-design.md
    { field_code: 'religion', label: 'دين', subject_codes: ['Religion'], wheel_visible: true },
    { field_code: 'lifestyle', label: 'منوعات', subject_codes: ['Lifestyle'], wheel_visible: true },
    { field_code: 'world', label: 'العالم', subject_codes: null, wheel_visible: false }, // same pre-existing gap as en-global's World
  ],
};

// Geography-residual field codes — mirrors EDITION_GEOGRAPHY_RESIDUAL_LABEL's
// existing shape exactly, since the residual-placement CODE PATH
// (subject-beats-geography fallback) is distinct from default_mapping
// resolution, even though both now resolve to a field_code from this
// same registry.
export const GEOGRAPHY_RESIDUAL_FIELD_CODE = {
  'ms-MY': { local: 'nasional', world: 'dunia' },
  'en-global': { local: null, world: 'world' },
  'ar-global': { local: null, world: 'world' },
};

// field_code -> entry, per edition. Used anywhere a field_code needs to
// resolve back to its label/subject_codes.
export function getFieldEntry(editionId, fieldCode) {
  const table = TAXONOMY_REGISTRY[editionId] ?? [];
  return table.find(e => e.field_code === fieldCode) ?? null;
}

// universalSubject -> entry, per edition. This is what
// resolveDefaultPlacement() needs: given a story's top Universal Subject
// candidate (e.g. 'Business'), which field_code (and label) does this
// edition resolve it to.
export function getFieldEntryForSubject(editionId, universalSubject) {
  const table = TAXONOMY_REGISTRY[editionId] ?? [];
  return table.find(e => e.subject_codes?.includes(universalSubject)) ?? null;
}

// label -> entry, per edition. edition-classification.mjs's resolver
// already computes a display label per code path (edition rule, default
// mapping, geography fallback) — this lets it attach field_code to
// whichever label it already resolved, without duplicating that logic.
export function getFieldEntryByLabel(editionId, label) {
  const table = TAXONOMY_REGISTRY[editionId] ?? [];
  return table.find(e => e.label === label) ?? null;
}
