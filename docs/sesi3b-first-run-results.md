# Sesi 3B — Edition Classification, First Run Results

Status: implementation of `docs/edition-classification-contract.md`, first
real run against 274 live items. No SQL migration — tested in-memory only,
per ChatGPT's explicit "jangan migration dahulu."

Code: `classification/lib/edition-taxonomy.mjs` (Edition Display
Transformations as data — the locked ms-MY/en/ar merge/rename tables),
`classification/edition-classification.mjs` (resolver — full candidate set
in, one field per edition out, per-item, never mutating Story
Understanding's output).

## Pipeline works correctly

Verified the mechanics end-to-end: `story_understanding.subject:Politics ->
ms-MY.Politik` / `en.Politics` / `ar.سياسة` for the same story, correctly
reading through `EDITION_SUBJECT_TAXONOMY`'s data tables rather than
per-source code branches. Merges apply correctly — a Business/Economy
candidate resolves to `Bisnes` (ms-MY) but stays split into `Business`/
`Economy` for English, `اقتصاد` for Arabic — exactly the locked v1
transformations. Geography fallback works: items with no subject candidate
correctly resolve through `geography_fallback` to `Malaysia`/`Dunia` (or
each edition's equivalent), not `Unclassified`, when geography evidence
exists.

## Distribution across editions (274 items, all three run in parallel)

All three editions show **identical unclassified count (81/274, 30%)** and
proportional field distribution — expected, since v1's resolver is a pure
vocabulary translation of the same underlying Story Understanding candidate.

## Honest, important finding: 0/274 items show editions disagreeing on subject

ChatGPT's own worked example (SPRM waran tangkap: ms-MY might prefer
`Jenayah` while English prefers `Politics` if a minister/parliament entity is
present) **does not happen in this v1 implementation.** The resolver's
current policy — `highest_confidence`, explicitly documented as such in the
code — always picks the same top-ranked Story Understanding candidate
regardless of edition, then only translates its *label*. There is currently
no mechanism for one edition to legitimately choose a *different* candidate
than another.

This isn't a bug — it's the honest boundary of what v1 can do without either:

1. **Entity detection** (Tier 4 of Story Understanding, explicitly not
   implemented per `story-understanding-engine-spec.md` — "is this person a
   politician?" was flagged back in `quick-bidang-taxonomy.md`'s SPRM
   adjudication as needing role-phrase detection, not built yet), or
2. **Explicit per-edition subject-priority rules** — deliberately not
   invented without real evidence, since ChatGPT has repeatedly warned
   against speculative rule-writing (most recently: "jangan buat 500
   keyword... kita belum tahu bottleneck sebenar").

**Recommendation, not yet acted on:** the deeper Edition Classification
promise (editions genuinely disagreeing, not just relabeling) needs one of
those two prerequisites built first. Flagging for ChatGPT rather than
inventing a priority heuristic now.

## What this run validates

- Full candidate set consumed correctly (per ChatGPT's explicit "gunakan
  candidate set penuh, jangan overwrite Story Understanding" instruction) —
  `alternatives[]` in the output shows the 2nd/3rd candidates considered,
  not discarded.
- `ruleset_version` present on every result (`v1.0.0`), ready to be the
  recompute trigger when edition rules change, per the Classification
  Ownership lock.
- Story Understanding's output is untouched by this module — verified by
  reading the code path, not just the output (no field of the input object
  is ever written to).

## Not yet done

- SQL migration (no `editions` or `edition_story_classifications` table
  created — proposal only, per `edition-architecture-model.md`).
- Ranking, Active Set, Wheel/UI — explicitly out of scope for 3B per
  ChatGPT ("ranking hanya selepas classification stabil").
- Edition Relevance (does a story belong in an edition's Active Set at all,
  independent of classification) — noted as a concept to watch for, not
  solved, per the contract.
- Per-edition subject-priority resolution — the finding above.
