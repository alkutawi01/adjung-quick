# ADR: Nasional/Dunia as Ordinary Bidang (2026-08-13)

Status: `[x] Closed`

## Decision

`ms-MY`'s geography-residual label `Malaysia` was renamed to `Nasional`.
Both `Nasional` and `Dunia` were added to `state/editions.js`'s
`ms-MY.taxonomy` array as ordinary, reader-selectable Bidang — not a
separate navigation mode.

## Context

`db/classification-observatory.mjs` found 109 real, correctly-classified
`ms-MY` stories (`Malaysia`: 63, `Dunia`: 46 — ~15% of placed content)
had no Wheel entry at all. `classification/lib/edition-taxonomy.mjs`'s
`EDITION_GEOGRAPHY_RESIDUAL_LABEL` produces these values only when a
story has zero subject evidence but is identifiably local/foreign —
correct classification behavior, but the Wheel's taxonomy array
(`state/editions.js`) never included them, so `state/reducer.js`'s
`SELECT_TOPIC` could never be dispatched with these values. Correctly
classified, permanently unreachable.

## Alternatives considered

- **A — Add Malaysia/Dunia to the Wheel as ordinary items.** Initially
  rejected: judged to conflate two internally-distinct concepts
  (subject vs. geography) in one list.
- **B — Geography as a separate navigation mode/dimension**
  (`Bidang | Lokasi`, mutually exclusive). Chosen initially, fully
  designed (`docs/geography-residual-navigation-policy-v1.md` →
  `docs/geography-navigation-contract-v1.md` →
  `docs/geography-navigation-implementation-plan-v1.md`).
- **C — Force residual stories into an existing subject.** Rejected
  throughout — would fabricate subject evidence that doesn't exist,
  making classification less honest.

## Decision reason

Izzat's direct question — *"macam mana portal berita biasa buat utk
isu-isu macam ni?"* — overturned B in favor of A. Real Malay news
portals (Astro Awani, Utusan, Berita Harian) list Nasional/Dunia as
ordinary categories alongside Politik/Sukan, with no separate mode.

The subject-vs-geography distinction driving Option B's design was real
and stays true internally (`field` still holds either kind of value,
unchanged) — but it's an internal data-model fact, not something a
reader needs surfaced as a separate UI concept. Option B solved a
problem the architecture had, not one readers have. This is recorded
as the specific lesson: *don't let internal model purity dictate a
product decision reader convention already answers.*

Supporting factors:
- No schema change required — `field` remains the single source of
  truth
- `SELECT_TOPIC`/`state/reducer.js` needed zero new logic — the
  existing generic filter (`c.topic === action.topic`) works unmodified
  against any taxonomy value, subject or geography
- Matches real reader mental models of a Malay news portal

## Consequence

- `ms-MY.taxonomy` is now 16 items (was 14)
- `Nasional` is `taxonomy[0]` — the cold-start default edition view
  (per `App.jsx`), a deliberate choice matching how most Malay portals
  lead with Nasional/Utama
- `Nasional`/`Dunia` are reader-facing Bidang like any other; internally
  they remain geography-residual classification outputs (unchanged
  mechanism, only their UI treatment changed)
- The superseded design chain (`docs/geography-residual-navigation-policy-v1.md`,
  `docs/geography-navigation-contract-v1.md`,
  `docs/geography-navigation-implementation-plan-v1.md`) is kept, not
  deleted — its diagnosis (the 109-story gap) remains the correct record
  of the problem; only its navigation-model recommendation was overridden
