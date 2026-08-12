// model.js — Quick State Model.
//
// This is the single source of truth Desktop and Mobile both render FROM.
// Per MVP Contract: "desktop dan mobile hanya menjadi dua presentation layer
// kepada state yang sama." Neither platform owns its own copy of this shape.

export function createInitialState() {
  return {
    // §2 LANGUAGE CONTRACT
    userContext: {
      selectedLanguages: ['ms'],   // O-012 resolved: mixed set, but user still
                                    // picks which languages are eligible at all
      // null here means "not chosen yet" (cold start, before the Bidang list
       // has loaded) — NOT an "All"/"Semua" pseudo-Bidang. Izzat's correction
       // (2026-08-12): he never decided on a "Semua" Bidang; it was added
       // without his approval and is now removed. The reader is always inside
       // exactly one real Bidang. App.jsx picks the first real Bidang as soon
       // as the list is known.
      selectedTopic: null,

      // Derived state only — theme is a lookup FROM selectedTopic via a
      // theme resolver (topic -> ThemeTokens), never hardcoded per-topic UI
      // branching. null = Quick's default visual system (most topics have
      // no theme_id — see O-009, still OPEN/PROPOSAL). Ad-hoc topics
      // (e.g. "PRU", "Banjir", "Perang") may carry a temporary theme too.
      theme: null,

      // Placeholder ONLY. L-043 (Reader Account) is LOCKED as a concept —
      // Quick works fully anonymous; login is required only for Save/History
      // personal-state features, never to read. Do NOT build real
      // authentication logic against this field yet — session/identity
      // wiring is Fasa 1A (Identity & Personal Layer), not yet started.
      identity: null,
    },

    // §12 ACTIVE SET CONTRACT — array of exactly `capacity` slots (or fewer,
    // per L-023: existing set may be < capacity, e.g. right after a
    // SWITCH_LANGUAGE that had fewer eligible replacements available).
    // Each entry: { slot, storyId, representationId }
    activeSet: [],
    activeSetCapacity: 10,          // O-005 still OPEN — 10 is a baseline, not final

    // §4 STORY LIFECYCLE / §8 BRIEF CONTRACT
    brief: {
      open: false,
      storyId: null,
    },

    // L-045 (Release History) — in-memory placeholder ONLY, not the Fasa 1A
    // implementation (no persistence, no user_id, no expiry enforcement).
    // Exists so RELEASE_STORY can demonstrate/test "released stories are
    // recorded, not silently discarded" per docs/personal-layer-contract.md.
    // Shape mirrors HistoryEntry minus persistence: { storyId, releasedAt }.
    history: [],

    // Navigation focus — which story is highlighted (not necessarily open).
    // SELECT_STORY only ever touches this; it never touches activeSet or brief.
    selection: {
      highlightedStoryId: null,
    },

    // §24 OBSERVABILITY — not reader-facing, but part of state so the UI CAN
    // surface it (e.g. a subtle "last updated" indicator) without a separate
    // admin surface.
    system: {
      loading: false,
      lastIngestionAt: null,
    },
  };
}
