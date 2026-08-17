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

import { TAXONOMY_REGISTRY, GEOGRAPHY_RESIDUAL_FIELD_CODE } from './taxonomy-registry.mjs';

// Taxonomy Stable Field-ID V1 (2026-08-16, docs/taxonomy-stable-field-id-design-v1.md):
// this table is now DERIVED from taxonomy-registry.mjs's single source of
// truth, rather than hand-maintained here — the exact same shape
// ({ label, default_mapping }) is preserved so resolveDefaultPlacement()
// below needed zero changes to its own logic. Geography-residual entries
// (Nasional/Dunia/World/العالم — subject_codes: null in the registry) are
// excluded here, matching this table's pre-migration behavior exactly:
// default_mapping resolution never applied to those, only
// EDITION_GEOGRAPHY_RESIDUAL_LABEL below did.
// Backend Control Plane Phase 2 (2026-08-17): mutable, same reasoning
// as TAXONOMY_REGISTRY itself — this is a DERIVED snapshot taken at
// whatever moment `buildEditionTaxonomy()` last ran. Module load
// computes an initial value from the hardcoded fallback (safe default
// if nothing ever calls the DB loader); `loadTaxonomyRegistryFromDB()`
// below re-derives it after TAXONOMY_REGISTRY is reloaded from
// `taxonomy_fields`, so `resolveDefaultPlacement()` — unchanged, still
// fully synchronous — reads whichever table is current.
function buildEditionTaxonomy() {
  return Object.fromEntries(
    Object.entries(TAXONOMY_REGISTRY).map(([editionId, entries]) => [
      editionId,
      entries
        .filter(e => e.subject_codes !== null)
        .map(e => ({ label: e.label, default_mapping: e.subject_codes, field_code: e.field_code })),
    ]),
  );
}

export let EDITION_TAXONOMY = buildEditionTaxonomy();

// Per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §1:
// call once, at process startup, AFTER taxonomy-registry.mjs's
// loadTaxonomyRegistryFromDB(supabase) has already reassigned
// TAXONOMY_REGISTRY. Re-derives EDITION_TAXONOMY from the now-current
// TAXONOMY_REGISTRY — no DB access of its own, purely a resync.
export function rebuildEditionTaxonomy() {
  EDITION_TAXONOMY = buildEditionTaxonomy();
  return EDITION_TAXONOMY;
}

// EDITION POSITIONING (locked 2026-08-12, per Izzat + docs/edition-source-profile-model.md):
//   ms-MY     — Malaysian local edition (Malaysian readers)
//   en-global — international English edition, CNN/BBC-style (global readers)
//   ar-global — international Arabic edition, Al Jazeera-style (global readers)
// Renamed from 'en'/'ar' deliberately: those name a LANGUAGE, and the whole
// point of this decision is that language does not determine audience.
// Izzat: "saya tak nak Adjung Quick kelihatan seperti portal berasal dari
// Malaysia."
export const EDITION_GEOGRAPHY_RESIDUAL_LABEL = {
  // Used only when NO subject candidate exists at all — the pure residual
  // path, per the subject-beats-geography lock. 'Malaysia' geography ->
  // this edition's local label; anything else -> this edition's world label.
  //
  // local label changed 2026-08-13, per Izzat's direct decision after
  // docs/geography-residual-navigation-policy-v1.md found these 2 residual
  // values (63+46 real stories, ~15% of placed ms-MY content) had no Wheel
  // entry at all — genuinely unreachable by any reader. Izzat's own
  // question ("macam mana portal berita biasa buat?") corrected the
  // over-engineered "separate navigation mode" design this session had
  // converged on: real Malay portals (Astro Awani, Utusan, BH) simply list
  // Nasional/Dunia as ordinary menu items alongside Politik/Sukan/etc. —
  // no special mode. Final decision: rename the local label 'Malaysia' ->
  // 'Nasional', and treat both as ORDINARY Bidang (see state/editions.js's
  // taxonomy array) — not a second navigation mode. This is the universal
  // GEOGRAPHY value 'Malaysia' (desk-vocabulary.mjs's GEOGRAPHY_VOCABULARY)
  // being renamed only in its ms-MY DISPLAY label; the underlying subject/
  // geography distinction in the classifier is untouched.
  'ms-MY': { local: 'Nasional', world: 'Dunia' },
  // local: null — en-global/ar-global have NO local-country concept at all.
  // Deliberately not substituted with 'Asia' or 'العالم العربي' either;
  // that would move the problem, not solve it. A story with no resolvable
  // subject falls back to World / العالم regardless of its geography.
  // Malaysia-as-a-field for these editions is a DEFERRED personalization
  // feature (login / prior Malay-edition choice / shared location), never
  // part of the base taxonomy — see docs/edition-source-profile-model.md.
  'en-global': { local: null, world: 'World' },
  'ar-global': { local: null, world: 'العالم' },
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
