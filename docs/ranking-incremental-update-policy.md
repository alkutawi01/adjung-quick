# Ranking Incremental Update Policy (2026-08-13)

Status: **Policy document, per ChatGPT — no code changes here** (records
behavior already implemented during activation, `state/reducer.js`).
Written so Stable Spatial Slots stays explicit and auditable as the
Editorial Ranking Engine gets used in production, not just implicit in
code comments.

## Two distinct operations, must never be conflated

### 1. Initial Active Set construction (`SELECT_TOPIC`, `SWITCH_EDITION`)

A FULL rebuild — every one of the (up to) 10 slots is recomputed from
the eligible candidate pool. Under `editorial_v1`
(`state/editorialRankingAdapter.js`): Candidate Scoring → Diversity
Selection → Editorial Composition run over the WHOLE eligible pool, and
the result becomes the entire new Active Set.

**What can change**: every slot, its story, and its position.
**When this happens**: reader selects a Bidang, or switches edition.

### 2. Replacement after release (`RELEASE_STORY`)

An INCREMENTAL fill — exactly ONE slot changes, the other 9 (or however
many are currently filled) must stay completely untouched, both story
AND position (`docs/core-reading-ui-contract.md`'s Stable Spatial Slots,
locked 2026-08-12). Under `editorial_v1`: the full pipeline runs to get
the engine's preferred ORDER over the eligible pool, but the reducer only
ever takes the FIRST candidate from that order not already occupying a
slot — it does not re-select or reorder the other 9.

**What can change**: exactly the vacated slot's story.
**What must NOT change**: every other slot's story or position.
**When this happens**: reader swipes/releases a card.

## Why this distinction matters specifically for the Editorial Ranking Engine

Diversity Selection and Editorial Composition are, by design, HOLISTIC —
they reason about the whole 10-story set (source balance, near-duplicate
resolution). Naively re-running that full pipeline on every single
release would silently reshuffle the OTHER 9 slots too, since a
recomputed diversity-aware selection over the full pool could produce a
totally different combination than what's currently on screen. That
would violate Stable Spatial Slots even though each individual output
might look "more optimal" in isolation.

The fix already implemented (`state/reducer.js`'s `RELEASE_STORY` case):
run the full editorial pipeline to get a RANKING, but apply it only as a
single-slot-fill — same contract the legacy path already had via
`selectActiveSetWithControl(..., existingActiveSet)`'s incremental
semantics.

## What this does NOT cover

- No change to `ranking/diversity-selection.mjs` or
  `ranking/editorial-composition.mjs` — both remain full-pool functions;
  the incremental behavior lives entirely in how the reducer USES their
  output, not in the functions themselves.
- Does not address what happens if the SAME story that would be the
  "next best" replacement was already excluded from a slot by Editorial
  Composition in the initial construction (e.g. a near-duplicate that
  lost the swap) — currently it's simply eligible again for
  `RELEASE_STORY`'s incremental fill, same as any other candidate.

## Next

None planned — this document records already-verified behavior
(`docs/editorial-ranking-activation-policy-v1.md` §6's live verification
already confirmed swipe-release works correctly under `editorial_v1`).
