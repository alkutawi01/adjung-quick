# UI-2 Closure Report (2026-08-13)

Status: **Architecture freeze review.** Not a coding document. Written
per ChatGPT's instruction after UI-2A/2B shipped, the four bugs Izzat's
live test surfaced were fixed, and the full end-to-end regression walk
passed against real production data. Records what's now locked before
the next phase (Ranking Engine) begins.

## 1. Decisions locked

```
Edition determines:
- taxonomy (Wheel field list)
- ranking universe (which clusters are even candidates)
- eligible representation locale (which language a story must have
  to occupy a slot in this edition's Active Set)
- UI chrome language (empty states, buttons, error copy)

Representation determines:
- presentation only — which language version of an ALREADY-eligible
  story is shown, when more than one exists
- never expands or changes Active Set membership
- never determines Wheel taxonomy or edition identity

Classification (edition_story_classifications) determines:
- subject placement (which field a story belongs to, per edition)
- but a placement row only exists if the story has a representation
  in that edition's own locale (Representation Eligibility Gate)
- classification ≠ display eligibility — the two are validated
  independently now, not conflated into one check
```

These six equivalences (`bahasa ≠ edition`, `representation ≠
membership`, `taxonomy ≠ today's data`, `classification ≠ display
eligibility`, `Active Set ≠ global feed`, `Wheel ≠ filter over stories`)
are the throughline of every bug below — each one is the same root
assumption (one concept silently standing in for a different, related
one) surfacing in a different layer.

## 2. Bugs discovered and resolved

**Bug 1 — Representation preference leakage (cross-edition language leak)**
Root: `selectedLanguages`/`representationPreference` (defaults `['ms']`)
was used as the Active Set MEMBERSHIP filter in `SELECT_TOPIC`,
`RELEASE_STORY`, `SWITCH_EDITION`, and the cold-start effect — completely
independent of which edition was active. Malay representations passed
into `ar-global`/`en-global`'s Active Set.
Fix: `editionEligibleLanguages(state)` — membership is anchored to the
active edition's own locale, never to a reader preference.
Found by: Izzat, live ("berita melayu takkan keluar dalam edisi arab").

**Bug 2 — Brief representation mismatch**
Root: `App.jsx`'s `openStory()` re-resolved a representation from scratch
via `selectRepresentation(cluster, selectedLanguages)`, ignoring the
edition-correct representation the Active Set slot already carried.
Could show a different-language Brief than the card the reader tapped.
Fix: reuse `_cluster.representation` from the Active Set slot directly.
Found by: UI-2A Final Audit (self-directed search after Bug 1, per
ChatGPT's instruction to search for the same anti-pattern elsewhere).

**Bug 3 — Active Set replacement leakage (swipe never replaces)**
Root: `RELEASE_STORY`'s replacement candidate pool was built from the
full `rankedQueue` (every topic), never scoped to
`state.userContext.selectedTopic` — unlike `SELECT_TOPIC`. Since the
Bidang-scoped Active Set decision, `lab/engine.js`'s `fillSlots()`
coverage-first pass (built for the OLD multi-topic Active Set) saw the
selected topic already "covered" and deliberately admitted a DIFFERENT
topic's story — which then vanished behind `ActiveSetList`'s own
render-time topic filter. Every swipe looked like a no-op, regardless of
real candidate supply.
Fix: scope the replacement pool to the selected Bidang first, matching
`SELECT_TOPIC`.
Found by: Izzat, live ("saya dah cuba semua bidang, takde yg ganti pun").

**Bug 4 — Stale edition classification rows**
Root: `db/classify-production.js --write` used `upsert`, which never
deletes rows a run no longer produces. After adding the Representation
Eligibility Gate, the table still held 2595 rows from before the gate
existed (only 867 should remain) — including exactly the ineligible
placements (e.g. Malay-only stories placed under `en-global` "Religion")
the gate was built to eliminate.
Fix: truncate `edition_story_classifications` before each write — the
table is a fully-regenerated materialized view of current placements
each run, not an append log or history. (If classification history ever
needs preserving, it belongs in a separate `edition_classification_history`
table — this one stays single-purpose.)
Found by: self-directed verification immediately after implementing the
Representation Eligibility Gate.

## 3. Deferred issues (recorded, not fixed)

**Source precision — `rss-rtm-sukan`**
Two non-sports stories (a car-crash death, a financial-aid announcement)
classified `Sports@0.9` purely because that feed's Tier 1
`source_known_category: 'sukan'` fired regardless of content — this RTM
feed isn't narrowly sports-scoped the way Astro Awani's category feeds
are. `docs/niche-field-coverage-audit.md`. **Status: DEFERRED** — a
source-registry precision decision, not an urgent fix.

**Classification vocabulary gap — Education**
6/10 sampled mainstream-newsroom education stories get ZERO Education
subject candidates from `understandStory()` — no vocabulary entries for
"sekolah"/"universiti"/"murid"/"USM"/"UKM". Real content exists; the
classifier can't see it as Education-subject. `docs/niche-field-coverage-audit.md`.
**Status: DEFERRED** — do not add keywords ad hoc; this needs its own
calibration round with the same discipline as the frozen engine's
original Batch A/M/U/Medium adjudication.

**Visual polish**
Card design, typography, animation, spacing, transitions. Izzat's own
words: "UI masih sangat tak cantik, tp takpe ni polish kemudian."
**Status: POST-MVP.**

## 4. Verification record

- 43/43 `state/test.js` tests passing (includes regression tests for all
  four bugs above: `UI-1 TEST 2e/2f`, `TEST 6e`, `TEST 9a-c` rebuilt).
- 8/8 `db/edition-representation-eligibility.test.mjs` passing.
- `vite build` clean throughout.
- Full end-to-end journey verified live against real production data:
  `ms-MY` → select Agama → open a story → Brief matches card → switch
  `en-global` → Agama resets to null (no forced mapping) → auto-picks
  first field → navigate to Religion → correct English empty state, 0
  cards → switch `ar-global` → Religion resets again → auto-picks first
  field → `dir="rtl"`, `lang="ar"` → 10 real Arabic cards. Zero failures,
  zero console errors (excluding unrelated stale HMR websocket noise).

## Current layer status (per ChatGPT)

| Layer | Status |
|---|---|
| Evidence persistence | done |
| Classification pipeline | done, frozen |
| Edition placement | done |
| Representation eligibility | done |
| Production snapshot baseline | done (`docs/production-classification-snapshot-v1.md`) |
| `activeEdition` authority | done |
| Locale authority | done |
| Representation preference separation | done |
| Field-scoped Active Set | done |
| Field-scoped replacement | done |
| Edition switch (UI) | done |
| Wheel taxonomy source | done |
| Empty state localization | done |
| RTL | done |
| Wheel controls | done |
| Brief representation consistency | done |

**90% classification coverage is not "classification is finished forever"
— it's the correct state for this stage: stable enough to build a
product on, open for future calibration.**

## Next phase

Per ChatGPT: do not add new UI features or continue visual polish yet.
Next is **Ranking Engine Phase 1** — the question the product now needs
to answer is no longer "what field is this story in?" (settled) but "of
193 Pendidikan stories, why are these 10 the ones in the Active Set?"
Deterministic first (freshness + source trust + classification confidence
+ field relevance + diversity penalty), AI as a later enrichment layer,
not a replacement for a working baseline.
