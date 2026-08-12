// reducer.js — Quick State Transition Map, implemented as a pure reducer.
//
// reduce(state, action, context) -> newState
//
// `context` carries the things the reducer needs but that aren't UI state:
// rankedQueue (from engine.js buildRankedQueue) and control (from
// control.js createEditorialControl). This keeps the reducer pure and
// testable without a database.
//
// THE CENTRAL RULE (L-013/L-014, tested tonight in engine.js, now enforced
// here at the state-transition level too): activeSet entries are NEVER
// mutated or reordered except by RELEASE_STORY or SWITCH_LANGUAGE. Every
// other action either doesn't touch activeSet at all, or explicitly asserts
// it returns the same array reference.

import { ActionTypes } from './actions.js';
import { selectActiveSetWithControl } from '../lab/engine.js';
import { selectRepresentation } from './representation.js';

function toActiveSetEntries(clusters, eligibleLanguages) {
  return clusters
    .map(c => ({ cluster: c, representation: selectRepresentation(c, eligibleLanguages) }))
    .filter(x => x.representation !== null); // Type 2 exclusion: no eligible representation
}

function buildActiveSetSlots(clusterEntries) {
  return clusterEntries.map((c, i) => ({
    slot: i,
    storyId: c.clusterKey,
    representationId: c.representation?.rssGuid ?? c.canonical?.rssGuid,
    // carried through for convenience; UI reads full story/representation via storyId+representationId lookups
    _cluster: c,
  }));
}

export function reduce(state, action, context = {}) {
  const { rankedQueue = [], control } = context;

  switch (action.type) {
    // --- Pure navigation/observation actions: NEVER touch activeSet. ---
    case ActionTypes.SELECT_TOPIC:
      return { ...state, userContext: { ...state.userContext, selectedTopic: action.topic } };

    case ActionTypes.SELECT_STORY:
      return { ...state, selection: { highlightedStoryId: action.storyId } };

    case ActionTypes.OPEN_BRIEF:
      return { ...state, brief: { open: true, storyId: action.storyId } };

    case ActionTypes.CLOSE_BRIEF:
    case ActionTypes.GO_BACK:
      // Per L (tonight): "Inspecting an item never changes its state." Exiting
      // Brief is pure observation-undo — activeSet is untouched, guaranteed by
      // simply not referencing it in this branch.
      return { ...state, brief: { open: false, storyId: null } };

    // --- The only two actions allowed to change activeSet membership. ---
    case ActionTypes.RELEASE_STORY: {
      // STABLE SPATIAL SLOTS (locked 2026-08-12, per Izzat's live device-
      // simulator finding + ChatGPT's architecture decision): the Active
      // Set is 10 fixed positions, not an ordered list that reflows.
      // Releasing slot N must refill exactly slot N with the replacement
      // — every other slot's story AND position must stay untouched.
      // Previously this returned `[...remaining, ...newlyAdmitted]`
      // (engine.js's own array-append semantics), which silently shifted
      // every slot after the released one up by one and appended the
      // replacement at the END instead of the vacated position — verified
      // wrong live against real Supabase data. Fixed here at the
      // reducer/state layer, NOT inside engine.js: engine.js's job is only
      // "which cluster should fill an open slot", it has no concept of
      // slot identity — that's this reducer's responsibility.
      const releasedEntry = state.activeSet.find(s => s.storyId === action.storyId);
      const releasedSlot = releasedEntry?.slot;
      const remaining = state.activeSet.filter(s => s.storyId !== action.storyId);
      const eligibleLanguages = state.userContext.selectedLanguages;

      // BUG FOUND running the vertical slice against real RSS (2026-08-11):
      // without this exclusion, the just-released story — often still the
      // top-ranked candidate — gets immediately re-selected into the very
      // slot it just left, making RELEASE_STORY a no-op from the reader's
      // perspective. It must be excluded from THIS selection pass. This is
      // not the same as Editorial Control's REMOVE (permanent exclusion) —
      // a released story can still reappear later (new RSS, or once §Story
      // Lifecycle / History — Fasa 1A — governs re-eligibility properly).
      // For now: exclude for this pass only.
      const eligible = toActiveSetEntries(rankedQueue, eligibleLanguages)
        .map(x => ({ ...x.cluster, representation: x.representation }))
        .filter(c => c.clusterKey !== action.storyId);

      const existingAsClusters = remaining.map(s => s._cluster ?? s);
      const filled = control
        ? selectActiveSetWithControl(eligible, control, state.activeSetCapacity, existingAsClusters)
        : existingAsClusters;

      // `filled` is engine.js's own `[...existingAsClusters, ...newlyAdmitted]`
      // — since existingAsClusters.length never changes here (we only ever
      // open exactly one slot per RELEASE_STORY), anything beyond that
      // length is the (at most one) newly admitted replacement. Extract it
      // and place it at `releasedSlot` explicitly, instead of trusting its
      // position in `filled`.
      const newlyAdmitted = filled.slice(existingAsClusters.length);
      let nextActiveSet;
      if (newlyAdmitted.length > 0 && releasedSlot !== undefined) {
        const replacement = newlyAdmitted[0];
        const replacementEntry = {
          slot: releasedSlot,
          storyId: replacement.clusterKey,
          representationId: replacement.representation?.rssGuid ?? replacement.canonical?.rssGuid,
          _cluster: replacement,
        };
        nextActiveSet = [...remaining, replacementEntry].sort((a, b) => a.slot - b.slot);
      } else {
        // No eligible replacement exists — the slot stays empty rather
        // than being force-filled or collapsing the array (model.js
        // already documents activeSet.length < capacity as a normal state).
        nextActiveSet = remaining;
      }

      // L-045 placeholder (see docs/personal-layer-contract.md): record that
      // this story was released, not merely dropped. `releasedAt` is passed
      // in via context so this reducer stays pure (no Date.now() inside).
      const historyEntry = { storyId: action.storyId, releasedAt: context.now ?? null };

      return {
        ...state,
        activeSet: nextActiveSet,
        history: [...state.history, historyEntry],
      };
    }

    case ActionTypes.SWITCH_LANGUAGE: {
      // Atomic: one state transition, not N releases + N refills. See
      // representation.js for Type 1 (swap) vs Type 2 (replace) — both are
      // handled uniformly here because toActiveSetEntries() re-resolves
      // representation for every cluster under the new language context.
      const eligibleLanguages = action.selectedLanguages;
      const eligible = toActiveSetEntries(rankedQueue, eligibleLanguages)
        .map(x => ({ ...x.cluster, representation: x.representation }));

      const freshSelection = control
        ? selectActiveSetWithControl(eligible, control, state.activeSetCapacity, [])
        : eligible.slice(0, state.activeSetCapacity);

      return {
        ...state,
        userContext: { ...state.userContext, selectedLanguages: eligibleLanguages },
        activeSet: buildActiveSetSlots(freshSelection),
        brief: { open: false, storyId: null }, // closing Brief on language switch avoids showing a story that may no longer be eligible
      };
    }

    // --- Editorial Control: single-editor, delegates to control.js. These
    // mutate the CONTROL state, not activeSet directly — activeSet only
    // changes on the next RELEASE_STORY/SWITCH_LANGUAGE that consults it,
    // consistent with "Pin cannot evict" (L-015).
    case ActionTypes.PIN_STORY:
      control?.pin(action.storyId);
      return state;

    case ActionTypes.PRIORITIZE_STORY:
      control?.prioritize(action.storyId);
      return state;

    case ActionTypes.REMOVE_STORY:
      control?.remove(action.storyId);
      return state;

    default:
      return state;
  }
}
