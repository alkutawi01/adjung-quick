// editorialStateResolver.mjs — Fasa 3.6.1 Foundation, precedence
// integration. Per docs/editorial-state-implementation-spec-v1.md §4 +
// docs/editorial-override-data-model-v1.md §3.
//
// Pure function only — no I/O, no Supabase client. Merges the frozen
// classifier's output for one story+edition with that story's ACTIVE
// story_overrides, following the locked precedence order.
//
// SCOPE — per ChatGPT's explicit "jangan sentuh classifier/ranking
// algorithm" instruction: `hide`, `pin`, and `reclassify` are resolved
// here, because together they determine field/visibility — a read-time
// concern this function can answer in isolation. `boost` affects RANKING
// SELECTION, not field/visibility (docs/ranking-engine-contract-v1.md's
// amendment — boost is a scoring modifier), and `source_overrides`
// (ignore_category/reduce_trust) affect CLASSIFICATION INPUT, upstream
// of this function, inside classify-production.js. Neither is wired in
// here.
//
// FASA 3.6.5 (2026-08-13, docs/pin-implementation-design-review-v1.md):
// pin added between hide and reclassify, reusing `new_field` — the same
// column reclassify already uses — rather than a new schema column
// (Finding E). This is also the actual fix for Finding F (pin on an
// unclassified story): `classifierOutput.classification_status` is
// never checked once the pin branch matches, so a story the classifier
// never placed anywhere becomes placeable via pin's own `new_field`.
//
// Precedence order followed here (docs/editorial-override-data-model-v1.md §3,
// amended for pin per docs/pin-governance-design-v1.md):
//   1. hide        -> story is not shown, regardless of anything else
//   2. pin         -> decides which field AND signals position/membership
//                     guarantee to the Active Set builder, if not hidden
//   3. reclassify  -> decides which field, if neither hidden nor pinned
//   4. classifier output -> the default when no override applies
//
// Per ChatGPT's explicit UX instruction: hide and pin must never both be
// offered as live options on the same story (restrictive beats
// permissive — if hide already exists, pin is moot). That is enforced
// at WRITE time (reviewQueueAdapter.js's submitPinOverride refuses to
// write a pin over an active hide); this resolver's own hide-first
// check is what makes a hide correct even if that write-time guard were
// ever bypassed.

// Taxonomy Stable Field-ID V1 (2026-08-16, docs/taxonomy-stable-field-id-design-v1.md):
// this resolver now operates on `field_code` (stable, rename-proof)
// throughout, not the mutable display label — `classifierOutput.field_code`
// and `new_field_code` on override rows, per Option C. The returned
// `field` property is renamed `fieldCode` to make that explicit at every
// call site; label lookup for display happens separately
// (state/editions.js's getFieldLabel), never inside this pure resolver.
//
// activeOverrides: story_overrides rows already filtered by the caller
// to `active = true` AND `story_id` + `edition_id` matching the story
// being resolved (a query concern, not this function's — keeps this
// pure and trivially testable with hand-built arrays).
export function resolveStoryField(classifierOutput, activeOverrides) {
  const hide = pickMostRecent(activeOverrides.filter(o => o.override_type === 'hide'));
  if (hide) {
    return {
      visible: false,
      fieldCode: null,
      source: 'override',
      overrideId: hide.id,
    };
  }

  const pin = pickMostRecent(activeOverrides.filter(o => o.override_type === 'pin'));
  if (pin) {
    return {
      visible: true,
      fieldCode: pin.new_field_code,
      source: 'override',
      overrideId: pin.id,
      // Consumed by state/reducer.js's selectFieldActiveSet: a pinned
      // story gets the position + membership guarantee (placed first,
      // pulled in even if ranking wouldn't otherwise select it) rather
      // than competing normally. Absent (undefined, falsy) on every
      // other branch — never explicitly `false` — so existing callers
      // that don't know about pin are unaffected.
      pinned: true,
    };
  }

  const reclassify = pickMostRecent(activeOverrides.filter(o => o.override_type === 'reclassify'));
  if (reclassify) {
    return {
      visible: true,
      fieldCode: reclassify.new_field_code,
      source: 'override',
      overrideId: reclassify.id,
    };
  }

  return {
    visible: classifierOutput.classification_status === 'classified',
    fieldCode: classifierOutput.field_code ?? null,
    source: 'classifier',
    overrideId: null,
  };
}

// Two active overrides of a KIND that conflicts (e.g. two reclassify
// rows for the same story+edition) should not happen if the write path
// enforces one-active-override-per-type — but this function doesn't
// assume that discipline; it resolves deterministically if it does
// happen: most recent `created_at` wins, per
// docs/editorial-override-data-model-v1.md §3's conflict table.
export function pickMostRecent(overridesOfSameType) {
  if (overridesOfSameType.length === 0) return null;
  return [...overridesOfSameType].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}
