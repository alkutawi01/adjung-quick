# Edition Representation Eligibility Policy (2026-08-13)

Status: **Locked, per ChatGPT.** Found during Izzat's UI-2 live test:
`en-global`'s "Religion" field showed 20 classified stories in
`edition_story_classifications`, but the Active Set rendered it empty.
Not a bug in the Edition Locale Authority fix (`docs/edition-state-model.md`)
— all 20 stories were from Malay-only sources (Utusan Agama, IKIM, JAIPP),
correctly excluded at render time for having no English representation.
The real problem is one layer upstream: those placements should never
have been created in the first place.

## The rule

**Edition classification only happens if a representation exists in that
edition's own locale. Placement can never be created for a language that
doesn't exist.**

```
if (!story.hasRepresentation(edition.locale)) {
  skip this edition's classification for this story;
}
```

Before:

| Story | ms-MY | en-global | ar-global |
|---|---|---|---|
| Utusan Agama (ms only) | Agama | Religion | دين |

After:

| Story | ms-MY | en-global | ar-global |
|---|---|---|---|
| Utusan Agama (ms only) | Agama | NULL | NULL |

## Why this belongs here, not in Story Understanding

`classification/story-understanding.mjs` answers "what is this story
about?" — it is deliberately language-neutral and stays untouched. The
gate belongs to the **Edition Classification layer** (or a new **Edition
Eligibility Gate** immediately before it) — the layer that decides
per-edition PLACEMENT, which is exactly where language availability
belongs, per the Edition Architecture's own principle that placement
(not subject understanding) is edition-specific.

## Why this doesn't contradict "each edition owns its own taxonomy"

It strengthens it. An edition isn't only defined by its own taxonomy — it
also has its own corpus and its own representation availability. Two
editions can each place a story under "Religion"/"Agama" only if each
actually has a representation of that story in its own language. An
edition never inherits or borrows another edition's content just because
the subject matches.

## What this fixes, concretely

Before: `en-global Religion: 20 classified, 0 visible` — reads as either
a classifier failure or a UI bug, and neither is true.

After: `en-global Religion: 0 classified, 0 visible` — an honest number.
It tells us directly: **we have zero English-language religion/Islamic-affairs
sources**, which is a source-coverage gap (`docs/known-issues.md`,
`docs/niche-field-coverage-audit.md`), not a classification or UI defect.

## Implementation notes

- `db/classify-production.js` gains the gate: for each cluster, before
  calling `classifyForAllEditions()`'s per-edition loop, check whether
  the cluster has ANY member whose `language` matches that edition's
  locale (`state/editions.js`'s `EDITIONS[id].locale`). If not, that
  edition's row is skipped entirely — never written with a placeholder
  or null-field row, simply not created.
- `ui/src/adapter/productionAdapter.js`'s existing `null` handling
  ("Unclassified is a status, never a Bidang value") is unaffected — a
  story with no row for an edition already resolves to `topic: null`
  there, since `placementByStory.get(c.id)` returns `undefined`.
- No change to the frozen classification engine
  (`classification/story-understanding.mjs`,
  `classification/edition-classification.mjs`) — the gate sits in the
  production wiring script that calls them, same layer as the earlier
  Production Evidence Persistence Gap fix.
