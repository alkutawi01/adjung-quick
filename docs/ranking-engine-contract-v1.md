# Ranking Engine Contract v1 (2026-08-13)

Status: **Contract/design document, per ChatGPT — no code yet.** Written
before implementation, same discipline as `docs/core-reading-ui-contract.md`
and `docs/ui-2-navigation-contract.md` before their respective build
phases: the history of this project is that almost every major bug came
from implementation preceding concept separation. Reviewed against
`docs/ui-2-closure-report.md` (what's now locked upstream of ranking),
`docs/evidence-policy-v1-decision.md` (confidence-aware ranking already
named as a requirement there), `docs/calibration-ready-engine.md`
(ranking must stay editor-correctable later, never opaque).

## 1. Purpose

The Ranking Engine answers exactly one question:

> **"Of all the stories eligible in one Edition + Field, which ones
> belong in the Active Set?"**

It does **not** decide:
- which field a story belongs to (Edition Classification's job)
- which edition a story belongs to (Edition Placement's job)
- which language representation to show (Representation Eligibility/
  Preference's job)

```
RSS
  ↓
Story Understanding
  ↓
Edition Placement
  ↓
Representation Eligibility
  ↓
Ranking Engine          ← this contract
  ↓
Active Set (10 slots)
```

## 2. Input contract

Ranking only ever receives stories that are ALREADY:
- ✅ placed in the active edition (`edition_story_classifications` row
  exists, `classification_status = 'classified'`)
- ✅ representation-eligible (passed the Representation Eligibility Gate
  — `docs/edition-representation-eligibility-policy.md`)
- ✅ in the currently-selected field

Ranking never receives:
- ❌ unclassified stories
- ❌ stories from a different edition
- ❌ stories with no eligible representation

This is a hard boundary: if a story shouldn't be visible at all, that was
already decided upstream — the Ranking Engine's only job is ordering
what's already eligible, never re-deciding eligibility itself.

## 3. Ranking Score v1

Deliberately simple for v1 — no ML, no learned weights:

```
Final Score =
    Freshness Score
  + Source Trust Score
  + Classification Confidence Score
  + Field Relevance Score
  − Diversity Penalty
```

### A. Freshness

Newer stories score higher. Parameterized, not locked, since different
Bidang move at different speeds (Politik stays relevant for days; Sukan
scores can go stale within hours):

```
0–6 hours    100
6–24 hours    80
1–3 days      50
3–7 days      20
>7 days        0
```

These bucket boundaries are a **starting parameter set**, expected to be
tuned per field once real usage data exists — not a permanent rule.

### B. Source Trust

Uses the existing `trustScore` already on every `lab/sources.js` entry
(already flowing into production via `sources.trust_score` /
`productionAdapter.js`'s `trustById`) — **not** `sourceType`
(`general`/`specialised`/`authority_niche`), per the KPM lesson this
session already learned: `sourceType: 'specialised'` does not mean
"trustworthy newsroom" (KPM is `authority_niche` and a ministry, not a
newsroom, despite being a dedicated/specialised feed).

### C. Classification Confidence

Uses the existing `classification_confidence` already stored per
placement row. Deliberately **not allowed to dominate** the score — a
confidence-1.0 classification of a 3-day-old story should not
automatically outrank a confidence-0.8 classification of a story from 2
hours ago. Ranking is not a classifier popularity contest.

### D. Field Relevance

Per ChatGPT: after the current architecture, this component may be
redundant — a story either IS in `edition_story_classifications.field`
for the active field (score contribution: fixed value, e.g. 100) or it
isn't in the ranking pool at all (already filtered out upstream, §2).
**Placeholder only in v1** — kept as a named component in case a future
need for partial/fuzzy field relevance emerges, not because it does
meaningful work today.

### E. Diversity Penalty

**The most important component for Adjung Quick specifically.** Without
it, 10 slots could legitimately become "Astro Awani's top 10 Politik
stories" or "5 different portals covering the identical press
conference" — technically all correct placements, editorially a bad Active
Set.

Two penalty sources:
- **Source diversity**: many slots from the same single source lowers
  score for further picks from that source.
- **Story cluster similarity**: if multiple sources report the
  functionally-same event (already handled at the clustering layer,
  `lab/engine.js`, for exact-duplicate detection) — but near-duplicate
  coverage of the same event by different clusters should still be
  penalized in ranking, not just at clustering.

## 4. What is explicitly NOT in v1

Locked out, per ChatGPT — Adjung Quick is not a social feed:

- ❌ AI ranking / learned ranking model
- ❌ user behaviour signals
- ❌ click-through rate
- ❌ engagement score
- ❌ likes
- ❌ popularity

AI may enter later as an **enrichment layer on top of** a working
deterministic baseline — never as a replacement for having one. Same
discipline as `docs/calibration-ready-engine.md`'s "not auto-learning,
a human-in-the-loop calibration loop."

## 5. Naming

Not "AI Ranking." **Editorial Ranking Engine** — it encodes editorial
judgment (freshness matters, trust matters, diversity matters), it does
not learn on its own.

## 6. Ranking output

```json
{
  "edition": "ms-MY",
  "field": "Politik",
  "rankedStories": [
    {
      "storyId": "...",
      "score": 87.5,
      "reasons": ["fresh", "trusted_source", "high_confidence"]
    }
  ]
}
```

`reasons` exists so a future editor (or Izzat, informally, right now) can
answer "why is this story #1?" without reading code — same transparency
principle as the classification engine's evidence trail
(`docs/calibration-ready-engine.md` §A, already satisfied by
`db/schema-classification.sql`).

## 7. Required before implementation

A small ranking benchmark corpus — hand-picked, not random — covering:

1. A fresh story from a medium-trust source
2. An old story from a high-trust source
3. A near-duplicate story (same event, multiple sources)
4. Source overload (many candidates from one publisher)

The benchmark's purpose: confirm the ranking output looks editorially
sane on these specific, understood cases before trusting it against the
full 193-story Pendidikan pool or similar. Same benchmark-before-scale
discipline as `classification/benchmark-confidence-threshold.mjs` used
during the classification calibration arc.

## Next

1. Build the ranking benchmark corpus (§7).
2. Implement the Editorial Ranking Engine against it.
3. Verify benchmark cases rank as expected before wiring into
   `db/classify-production.js` / the Active Set selection path.
