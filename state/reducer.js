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
import { getEdition } from './editions.js';

function toActiveSetEntries(clusters, eligibleLanguages) {
  return clusters
    .map(c => ({ cluster: c, representation: selectRepresentation(c, eligibleLanguages) }))
    .filter(x => x.representation !== null); // Type 2 exclusion: no eligible representation
}

// BUG FOUND live (2026-08-13, Izzat: "berita melayu takkan keluar dalam
// edisi arab" — Malay news showing up in the Arabic edition). Root cause:
// every toActiveSetEntries() call below used to pass representationPreference
// (defaults to ['ms'] per getRepresentationPreference's fallback) as the
// ACTIVE SET MEMBERSHIP filter — completely independent of which edition
// was actually active. So ar-global's Active Set was still being filtered
// for Malay-eligible representations, and since nearly every cluster has a
// Malay member, selectRepresentation() happily returned it — a Malay
// article rendering inside the Arabic edition's Wheel.
//
// Fix: Active Set MEMBERSHIP must be anchored to the ACTIVE EDITION's own
// locale — a story cannot occupy a slot in an edition's Active Set unless
// it has a representation in THAT edition's language. This is distinct
// from representationPreference (docs/edition-state-model.md O-012B),
// which only matters for choosing among several representations of an
// ALREADY-eligible story (e.g. in the Brief view) — it must never be able
// to pull a story into an edition it doesn't belong in.
function editionEligibleLanguages(state) {
  return [getEdition(state.editionContext.activeEdition).locale];
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
    // SELECT_TOPIC — Bidang-scoped Active Set (Izzat's decision, 2026-08-12).
    //
    // This action USED to be pure navigation ("never touches activeSet"), with
    // the Active Set holding the 10 globally top-ranked stories and the UI
    // filtering them by Bidang at render time. That produced the bug this
    // change fixes: with 14 Bidang but only 10 global slots, most Bidang
    // rendered empty — selecting "Politik" showed nothing even though 13
    // Politik stories existed in the database.
    //
    // The Active Set is now scoped to the selected Bidang: 10 slots OF THAT
    // BIDANG. This matches the Session UI-1 contract's own data flow
    // (Selected Field -> Edition Filter -> Ranking -> 10 Active Slots) and
    // makes the Wheel a real navigation surface rather than a filter over
    // whatever happened to rank globally.
    //
    // Supersedes: docs/core-reading-ui-contract.md §3's "topic selection
    // never filters the Active Set itself", and this file's own header rule
    // that only RELEASE_STORY/SWITCH_LANGUAGE may change activeSet.
    // Stable Spatial Slots is UNAFFECTED — still exactly `capacity` fixed
    // positions; only which stories are eligible to fill them changed.
    case ActionTypes.SELECT_TOPIC: {
      const eligibleLanguages = editionEligibleLanguages(state);
      const inBidang = rankedQueue.filter(c => c.topic === action.topic);
      const eligible = toActiveSetEntries(inBidang, eligibleLanguages)
        .map(x => ({ ...x.cluster, representation: x.representation }));

      const selected = control
        ? selectActiveSetWithControl(eligible, control, state.activeSetCapacity, [])
        : eligible.slice(0, state.activeSetCapacity);

      return {
        ...state,
        userContext: { ...state.userContext, selectedTopic: action.topic },
        activeSet: buildActiveSetSlots(selected),
        // A Bidang change replaces every story on screen, so an open Brief
        // would be showing something no longer in view — same reasoning as
        // SWITCH_LANGUAGE/SWITCH_EDITION below.
        brief: { open: false, storyId: null },
      };
    }

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
      const eligibleLanguages = editionEligibleLanguages(state);

      // BUG FOUND LIVE (2026-08-13, Izzat: "saya dah cuba semua bidang,
      // takde yg ganti pun" — swiping a card away never replaced it, in
      // EVERY Bidang, even ones with plenty of candidates like Politik/53
      // or Pendidikan/193). Root cause: `rankedQueue` here was never scoped
      // to the SELECTED Bidang, unlike SELECT_TOPIC's `inBidang` filter.
      // Since the Bidang-scoped Active Set decision (2026-08-12), every
      // slot in state.activeSet shares the SAME topic — so
      // lab/engine.js's fillSlots() "coverage first" pass (designed for
      // the OLD multi-topic Active Set) saw that topic already in
      // `existingTopics` and deliberately picked a replacement from a
      // DIFFERENT topic to maximise diversity. That replacement WAS
      // admitted into activeSet — it just immediately vanished, because
      // ActiveSetList's render-time filter (`slot._cluster?.topic ===
      // selectedTopic`) hid it. From the reader's side: swipe, then
      // nothing happens. Fix: scope to the selected Bidang FIRST, same as
      // SELECT_TOPIC — with only one topic in the candidate pool,
      // fillSlots' Pass 2 (ranked fallback, no topic constraint) is what
      // actually fills the slot, correctly, every time.
      const inBidang = rankedQueue.filter(c => c.topic === state.userContext.selectedTopic);

      // Excludes the just-released story from THIS selection pass — without
      // this it's often still the top-ranked candidate and gets immediately
      // re-selected into the very slot it just left, making RELEASE_STORY a
      // no-op from the reader's perspective. Not the same as Editorial
      // Control's REMOVE (permanent exclusion) — a released story can still
      // reappear later (new RSS, or once §Story Lifecycle / History governs
      // re-eligibility properly). For now: exclude for this pass only.
      const eligible = toActiveSetEntries(inBidang, eligibleLanguages)
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

    case ActionTypes.SWITCH_EDITION: {
      // Per docs/edition-state-model.md + docs/core-reading-ui-contract.md
      // §11a. Switching edition is NOT a label translation — each edition
      // owns an independent taxonomy, so the currently-selected field may
      // simply not exist in the new one (ms-MY's "Agama" has no Arabic
      // Wheel equivalent). In that case the field is dropped rather than
      // carried over or auto-mapped onto a "similar" field — auto-mapping
      // is exactly the universal-taxonomy assumption the whole edition
      // architecture rejected.
      const nextEdition = getEdition(action.editionId);
      const currentField = state.userContext.selectedTopic;
      const fieldSurvives = currentField != null && nextEdition.taxonomy.includes(currentField);

      // Active Set is rebuilt because edition determines placement/ranking,
      // but capacity and the stable-spatial-slot model are untouched — the
      // slot count never changes with edition (docs/edition-state-model.md,
      // Active Set stays 10 stable slots regardless of edition). Eligibility
      // uses the NEW edition's own locale (editionEligibleLanguages reads
      // action.editionId indirectly via nextEdition below) — this is the
      // exact fix for the "Malay news in Arabic edition" bug.
      const eligibleLanguages = [nextEdition.locale];
      const eligible = toActiveSetEntries(rankedQueue, eligibleLanguages)
        .map(x => ({ ...x.cluster, representation: x.representation }));
      const freshSelection = control
        ? selectActiveSetWithControl(eligible, control, state.activeSetCapacity, [])
        : eligible.slice(0, state.activeSetCapacity);

      return {
        ...state,
        editionContext: { ...state.editionContext, activeEdition: nextEdition.editionId },
        userContext: {
          ...state.userContext,
          // null (not a fallback field, not "Semua") when the field doesn't
          // survive — model.js already documents null as "not chosen yet",
          // and the UI picks the first real field of the new edition, same
          // as it does at cold start.
          selectedTopic: fieldSurvives ? currentField : null,
        },
        activeSet: buildActiveSetSlots(freshSelection),
        brief: { open: false, storyId: null }, // same reasoning as SWITCH_LANGUAGE: the open story may not be placed/available in the new edition
      };
    }

    case ActionTypes.SET_REPRESENTATION_PREFERENCE:
      // Deliberately does NOT rebuild the Active Set, unlike
      // SWITCH_LANGUAGE. Per docs/edition-state-model.md, representation
      // preference only affects which language version of a story is shown
      // when several exist — it never changes which stories are in the
      // Active Set, because membership belongs to the edition, not to a
      // language preference.
      return {
        ...state,
        userContext: {
          ...state.userContext,
          representationPreference: action.representationPreference,
        },
      };

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
