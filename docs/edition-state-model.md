# Edition State Model (Session UI-1, 2026-08-12)

Status: **State migration PLAN — documentation only, no code changed.**
Per ChatGPT: write this before touching `state/model.js`,
`state/actions.js`, `state/reducer.js`, or `state/representation.js`.
Resolves a real conflict found while starting Session UI-1: the existing
locked `O-012` ("mixed set" language model) contradicts the newer
Edition Architecture locked throughout the classification calibration
arc (`docs/edition-taxonomy.mjs`, `docs/evidence-policy-v1-decision.md`).

## The conflict, precisely

**O-012 (existing, `state/model.js`/`state/reducer.js`) assumed:**

```
Language = filter preference
```

`userContext.selectedLanguages` is an array (e.g. `['ms', 'en']`) meaning
"show me stories available in Malay OR English, mixed together in one
Active Set." `SWITCH_LANGUAGE`'s reducer case re-resolves representation
for every cluster against that eligible-language list and rebuilds the
Active Set from the mixed pool.

**Edition Architecture (newer, from the classification arc) assumes:**

```
Edition = editorial universe
```

Exactly ONE edition is active at a time. Each edition owns its own
taxonomy, Wheel, and ranking — `ms-MY`'s Politik is not `en`'s Politics
is not `ar`'s سياسة, not because of translation gaps but because each
edition is an independent editorial worldview (confirmed concretely by
Batch A/M/U/Medium adjudication this session).

These cannot both be true of the same state field. Mixing `ms-MY` and
`en` stories in one Active Set would mean mixing two different editorial
worldviews' rankings and taxonomies into one feed — not a "translation
gap" problem, a category error.

## Resolution: split into two concepts, not one

### O-012A — Edition Context (NEW, primary, supersedes the old mixed-set Active Set behavior)

```
editionContext {
  activeEdition   // e.g. "ms-MY" — exactly ONE at a time
  locale
  direction       // LTR / RTL
  taxonomy
  selectedField
  availableFields[]
}
```

The active Edition controls: Wheel, taxonomy, ranking, Active Set
membership/placement. This is the state Session UI-1's four
confirmations (editionContext as taxonomy source, Wheel reads from it,
switching resolves context fresh, Active Set stays 10 stable slots)
attach to.

### O-012B — Representation Preference (the old concept, kept, meaning changed)

```
representationPreference: ["ms", "en", "ar"]   // renamed from selectedLanguages
```

No longer "which languages to mix into one feed." Now: **"if a story has
multiple language representations available, which order do I prefer?"**
Example: reading "Anwar meets Saudi leader," if it has `ms`/`en`/`ar`
representations and the reader's preference is `ar > en > ms`, the Brief/
Full View picks the Arabic representation when available. This is a
per-story representation choice, not a feed-mixing mechanism.

## What does NOT happen for v1

**Active Set does not mix editions.** Considered and rejected for v1:
mixing `ms-MY` Politik stories with `en` Politics stories in one Active
Set produces a bad editorial experience, since the two editions can
have genuinely different priorities (e.g. `en` weighted toward
international stories like Ukraine/US Congress/Iran, `ms-MY` weighted
toward Parlimen Malaysia/local parties/kerajaan) — mixing them isn't
"more complete," it's editorially incoherent.

**Future possibility, explicitly not v1:** an "Edition Comparison /
Multi-Edition View" mode where a reader can see multiple editions
side-by-side (e.g. `✓ Malaysia ✓ International ✓ Arab World`) — a
distinct mode from the normal single-edition Active Set experience, not
designed here.

## Migration mapping (plan, not yet applied to code)

| Old | New | Change |
|---|---|---|
| `userContext.selectedLanguages[]` | `representationPreference[]` | Renamed; meaning narrows from "feed filter" to "representation preference order" |
| *(did not exist)* | `editionContext.activeEdition` | New — single active edition, drives Wheel/taxonomy/ranking/Active Set |
| `SWITCH_LANGUAGE` reducer case (mixes eligible languages into Active Set) | Two concerns: an edition-switch flow (`docs/core-reading-ui-contract.md` §11a) + a representation-preference update (no Active Set rebuild) | The action's current behavior conflates both; needs splitting when implemented — not done in this document |

No `state/*.js` file has been edited yet. This table is the plan Session
UI-1's actual state changes will follow.

## Edition Locale Authority (added 2026-08-13, after a real production bug)

**Active Set membership MUST be constrained by the active edition's own
locale. Representation preference MUST NOT expand edition eligibility.**

Found live by Izzat ("berita melayu takkan keluar dalam edisi arab" —
Malay news shouldn't appear in the Arabic edition): every call site that
built Active Set membership (`state/reducer.js`'s `SELECT_TOPIC`,
`RELEASE_STORY`, `SWITCH_EDITION`, plus `App.jsx`'s cold-start effect) was
passing `representationPreference`/`selectedLanguages` — which defaults to
`['ms']` — as the eligibility filter, completely independent of which
edition was actually active. Since almost every cluster has a Malay
member, switching to `ar-global` still resolved a Malay representation for
nearly every story and rendered it inside the Arabic edition.

The fix: a dedicated `editionEligibleLanguages(state)` helper
(`state/reducer.js`) returns `[getEdition(activeEdition).locale]` — never
`representationPreference`. This is the single source of truth for Active
Set membership eligibility. `representationPreference` still exists and
still matters (O-012B above) — but only for choosing among representations
of a story ALREADY admitted to the current edition (e.g. the Brief view),
never for deciding whether a story belongs in the edition's Active Set at
all.

**The exact anti-pattern to never reintroduce:**
```js
selectedLanguages.includes(cluster.language)   // or representationPreference —
                                                 // used as a MEMBERSHIP test
```
If new code needs to know "is this story eligible for the current
edition," it must go through the edition's own locale, not through a
reader preference field. A regression test exists for this specific
failure mode: `state/test.js` `UI-1 TEST 2e`/`2f` — switches to
`en-global`/`ar-global` with `representationPreference` deliberately set
to include ALL languages, and asserts no wrong-language representation is
ever admitted regardless.

## Why language was never really the same thing as edition

Per ChatGPT: earlier architecture assumed "language = edition." What the
classification calibration arc's evidence actually showed: **language is
one entry point into an edition, not the definition of one.** This
single reframing is what resolves nearly every cross-cutting conflict
found this session: Arabic vs Malay Bidang structure, Malaysia-politics
vs global-politics placement, RTL handling, taxonomy mismatches, and now
language-switching behavior — all traced back to the same root
assumption, now corrected in one place rather than patched per-symptom.

## Explicitly out of scope here

- No `state/model.js`, `actions.js`, `reducer.js`, or `representation.js`
  changes — this is the plan those changes will follow, not the changes
  themselves.
- No UI/component code.
- Exact `SWITCH_LANGUAGE` vs a new edition-switch action split — noted as
  needed in the migration table, not designed in full here.

## Next

Only after this plan is confirmed: implement the state changes (rename
`selectedLanguages` → `representationPreference`, add `editionContext`,
split the reducer's edition-switch and representation-preference
concerns), then proceed to Session UI-1's four confirmations and
acceptance tests against the real, migrated state model — not before.
