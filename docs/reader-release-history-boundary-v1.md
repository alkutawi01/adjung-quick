# Reader Release/History Boundary v1 (2026-08-13)

Status: `[x] Closed`

Category: **Hotfix record + boundary documentation.** Fixes a real live
bug (`state/reducer.js`), records the concept boundary ChatGPT flagged
so it isn't blurred later. No new feature built.

---

## The bug (fixed)

Izzat, live: *"berita yg telah di-swap kembali semula... sepatutnya ia
takkan kembali lagi di paparan user."*

`state/reducer.js`'s own prior comment on `RELEASE_STORY` admitted the
cause: *"Not the same as Editorial Control's REMOVE (permanent
exclusion)... For now: exclude for this pass only."* A released story
was only excluded from the ONE selection pass that replaced it — every
other path that rebuilds the Active Set (`SELECT_TOPIC`,
`SWITCH_LANGUAGE`, `SWITCH_EDITION`) had zero awareness of prior
releases, so navigating away and back (the common real path, not just
repeated releases) could bring a swiped story right back.

## Fix

`state.history` already logs every `RELEASE_STORY` (`storyId` +
`releasedAt`) — it was only ever read as an audit trail. A shared
helper, `excludeEverReleased(clusters, history)`, now makes that log
the **permanent exclusion source**, applied at all four sites that
build a candidate pool from `rankedQueue`. Verified: a new regression
test (`state/test.js` TEST 11a/b) fails without the fix, passes with
it; live-verified in the browser (swipe → navigate away 3 Bidang →
navigate back → story stays gone, replaced by a different real story).

**RELEASE_STORY ≠ Editorial Control's REMOVE.** They remain two
different mechanisms answering two different questions — this fix
changes RELEASE_STORY's *durability* (permanent instead of
single-pass), not its *meaning*. REMOVE (Editorial Control's own
permanent exclusion, `lab/control.js`) is unaffected and untouched.

## Concept boundary — RELEASED vs. VIEWED vs. BOOKMARKED

Per ChatGPT's explicit flag: these must never be conflated, even though
`history` is now doing real exclusion work.

| Action | Meaning | Touches `state.history`? |
|---|---|---|
| `RELEASE_STORY` (swipe) | *"Remove this from my current experience."* | **Yes** — the only writer |
| `OPEN_BRIEF` (tap to read) | *"I looked at this."* | **No** |
| Bookmark/save (not yet built) | *"Keep this for me."* | Would be its own thing — `saved_stories`, not `history` |

**Verified in code, not just asserted**: grepped `state/reducer.js` for
every `history:` write — exactly one site, inside `RELEASE_STORY`.
Opening a story to read it (`OPEN_BRIEF`) has never touched `history`
and doesn't now. A reader opening "berita banjir" to read it does not
exclude it from future Active Sets — only swiping it away does. This
distinction was already correct in the code; this document exists so a
future change doesn't blur it by accident (e.g. "let's also log opens
to history" would be a real, separate decision, not a natural extension
of this fix).

## Current state of `history` — honest status, not assumed solved

- **In-memory only.** `state.history` lives in React state, lost on
  page refresh. There is no persistence today.
- **`history_entries` (the DB table, `db/schema-identity.sql`) is never
  written by the real app** — confirmed via repo-wide search: only
  `db/identity-test.js` (a test script) touches it. The schema exists;
  the write path doesn't.
- **No reader-facing History screen exists.** Confirmed: zero UI
  components reference "history" in any form.

This is a genuine, not-yet-built feature gap — not a bug, not something
this fix pretends to solve. `state.history` doing real exclusion work
now (this fix) does not mean the reader-facing History feature is any
closer to existing; it's an internal mechanism reuse, not a preview of
the eventual feature.

## Deferred to Fasa 3 — questions for when History is actually built

Per ChatGPT, not answered here, listed so they aren't lost:

1. **What does History store?** Released stories, opened stories,
   bookmarked stories — likely three distinct lists, not one blended
   log, per the boundary table above.
2. **Storage**: moves from React state to `history_entries` (schema
   already exists, per `docs/identity-schema-design.md`).
3. **User identity**: real History needs `user_id` — without login, a
   global/local-only history isn't the real feature, per
   `docs/identity-schema-design.md`'s existing scope.

## What this document does NOT do

- Does not build a History screen or any reader-facing UI
- Does not persist `state.history` to `history_entries`
- Does not change `OPEN_BRIEF` or any bookmark/save mechanism
- Does not change Editorial Control's own REMOVE mechanism
