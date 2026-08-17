// editions.js — Edition Registry for the UI state layer.
//
// Per docs/edition-state-model.md (Session UI-1, Step 1): editionContext
// is the single source of taxonomy for the Wheel — each edition owns its
// own independent field list, never derived from a shared universal
// taxonomy.
//
// Taxonomy Stable Field-ID V1 (2026-08-16, docs/taxonomy-stable-field-id-design-v1.md):
// `taxonomy` (labels, for display) and `taxonomyFieldCodes` (stable codes,
// for matching/dispatch — never renamed) are now BOTH derived from
// classification/lib/taxonomy-registry.mjs's single source of truth,
// filtered to `wheel_visible` entries, in the same order. This is the
// same consolidation classification/lib/edition-taxonomy.mjs already did
// for the classifier's own table — collapsing what were two independently
// hand-maintained lists into one.
import { TAXONOMY_REGISTRY as FALLBACK_TAXONOMY_REGISTRY, getFieldEntry } from '../classification/lib/taxonomy-registry.mjs';

const EDITION_META = {
  'ms-MY': {
    locale: 'ms',
    direction: 'ltr',
    // UI-2A (per ChatGPT, 2026-08-13): label communicates EDITION identity
    // ("which editorial worldview"), never just the language name alone —
    // "Malay" would wrongly imply this is a translation switch. Malaysia
    // context is real for this edition only (docs/edition-source-profile-model.md).
    label: 'Malaysia · Malay Edition',
  },
  // en-global / ar-global: INTERNATIONAL editions, not "Malaysian news in
  // English/Arabic". Named with the -global suffix deliberately so the
  // positioning lives in the identifier itself — 'en' alone names a
  // language, and the locked decision is that language does not determine
  // audience. See docs/edition-source-profile-model.md.
  'en-global': {
    locale: 'en',
    direction: 'ltr',
    // Deliberately "Global", never "Global · Malaysia" or similar — per
    // ChatGPT's explicit instruction: Malaysia context does not appear in
    // en-global/ar-global for v1, only as a possible future personalization
    // feature (login / prior ms-MY choice / shared location).
    label: 'Global · English Edition',
  },
  'ar-global': {
    locale: 'ar',
    direction: 'rtl',
    label: 'Global · Arabic Edition',
  },
};

// Backend Control Plane Phase 2 (2026-08-17): builds the EDITIONS shape
// from whichever taxonomy table is passed in — the hardcoded fallback
// at module load, or `taxonomy_fields` after loadEditionsFromDB()
// resolves. Public shape unchanged either way.
function buildEditionsFromRegistry(registry) {
  return Object.fromEntries(
    Object.entries(EDITION_META).map(([editionId, meta]) => {
      // 'Nasional'/'Dunia' lead ms-MY's list (taxonomy[0] is the cold-start
      // default, App.jsx) — real Malay portals (Astro Awani/Utusan/BH) lead
      // with Nasional/Utama, a deliberate choice preserved from the
      // registry's own ordering (docs/geography-residual-navigation-policy-v1.md).
      const wheelEntries = (registry[editionId] ?? []).filter(e => e.wheel_visible);
      return [editionId, {
        editionId,
        ...meta,
        taxonomy: wheelEntries.map(e => e.label),
        taxonomyFieldCodes: wheelEntries.map(e => e.field_code),
      }];
    }),
  );
}

// Mutable — reassigned once by loadEditionsFromDB() below, per
// docs/control-plane-phase2-taxonomy-browser-cutover-implementation-plan-v1.md.
// This initial, synchronous value is ONLY a pre-fetch placeholder
// (never rendered to a real user — App.jsx/AdminApp.jsx both gate their
// real content behind a loading state until loadEditionsFromDB()
// resolves) — never a silent production fallback if the DB call fails.
export let EDITIONS = buildEditionsFromRegistry(FALLBACK_TAXONOMY_REGISTRY);

// Loads taxonomy_fields (the backend source of truth, Backend Control
// Plane Phase 2) and reassigns EDITIONS. Callers (App.jsx, AdminApp.jsx)
// MUST await this and keep their own loading gate active until it
// resolves — this function has no opinion about React rendering, it
// only updates the module-level cache other functions here read.
export async function loadEditionsFromDB(supabase) {
  const { data, error } = await supabase
    .from('taxonomy_fields')
    .select('edition_id, field_code, label, wheel_visible, display_order')
    .eq('status', 'active')
    .order('display_order');
  if (error) throw new Error(`loadEditionsFromDB: ${error.message}`);
  if (data.length === 0) {
    throw new Error('loadEditionsFromDB: taxonomy_fields returned 0 active rows — refusing to load an empty taxonomy.');
  }
  // Preserves the DB's own .order('display_order') sequence — a single
  // forward pass over an already-sorted array never reorders entries.
  const grouped = {};
  for (const row of data) {
    if (!grouped[row.edition_id]) grouped[row.edition_id] = [];
    grouped[row.edition_id].push({ field_code: row.field_code, label: row.label, wheel_visible: row.wheel_visible });
  }
  EDITIONS = buildEditionsFromRegistry(grouped);
  return EDITIONS;
}

// field_code -> label, for this edition. What TopicWheel/ActiveSetList
// render — the ONLY place a field_code becomes user-visible text.
export function getFieldLabel(editionId, fieldCode) {
  return getFieldEntry(editionId, fieldCode)?.label ?? fieldCode;
}

// Stable iteration order for the edition switcher UI — Object.keys() order
// is technically insertion order for string keys, but naming it explicitly
// avoids that being an implicit dependency.
export const EDITION_IDS = ['ms-MY', 'en-global', 'ar-global'];

export const DEFAULT_EDITION_ID = 'ms-MY';

export function getEdition(editionId) {
  return EDITIONS[editionId] ?? EDITIONS[DEFAULT_EDITION_ID];
}
