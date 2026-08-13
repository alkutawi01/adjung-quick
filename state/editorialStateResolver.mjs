// editorialStateResolver.mjs — Fasa 3.6.1 Foundation, precedence
// integration. Per docs/editorial-state-implementation-spec-v1.md §4 +
// docs/editorial-override-data-model-v1.md §3.
//
// Pure function only — no I/O, no Supabase client. Merges the frozen
// classifier's output for one story+edition with that story's ACTIVE
// story_overrides, following the locked precedence order.
//
// SCOPE — deliberately narrow for this Foundation pass, per ChatGPT's
// explicit "jangan sentuh classifier/ranking algorithm" instruction:
// only `hide` and `reclassify` are resolved here, because they alone
// determine field/visibility — a read-time concern this function can
// answer in isolation. `boost`/`pin` affect RANKING SELECTION (already
// resolved in docs/ranking-engine-contract-v1.md's amendment — boost is
// a scoring modifier, pin bypasses selection), and `source_overrides`
// (ignore_category/reduce_trust) affect CLASSIFICATION INPUT, upstream
// of this function, inside classify-production.js. Wiring either of
// those in is separate future work, not done here.
//
// Precedence order followed here (docs/editorial-override-data-model-v1.md §3),
// restricted to the two override types this function resolves:
//   1. hide        -> story is not shown, regardless of anything else
//   2. reclassify   -> decides which field, if not hidden
//   3. classifier output -> the default when no override applies

// activeOverrides: story_overrides rows already filtered by the caller
// to `active = true` AND `story_id` + `edition_id` matching the story
// being resolved (a query concern, not this function's — keeps this
// pure and trivially testable with hand-built arrays).
export function resolveStoryField(classifierOutput, activeOverrides) {
  const hide = pickMostRecent(activeOverrides.filter(o => o.override_type === 'hide'));
  if (hide) {
    return {
      visible: false,
      field: null,
      source: 'override',
      overrideId: hide.id,
    };
  }

  const reclassify = pickMostRecent(activeOverrides.filter(o => o.override_type === 'reclassify'));
  if (reclassify) {
    return {
      visible: true,
      field: reclassify.new_field,
      source: 'override',
      overrideId: reclassify.id,
    };
  }

  return {
    visible: classifierOutput.classification_status === 'classified',
    field: classifierOutput.field ?? null,
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
