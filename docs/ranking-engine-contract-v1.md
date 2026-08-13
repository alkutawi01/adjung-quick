# Ranking Engine Contract v1 (2026-08-13)

Status: **Contract/design document, per ChatGPT — no code yet.** Written
before implementation, same discipline as `docs/core-reading-ui-contract.md`
and `docs/ui-2-navigation-contract.md` before their respective build
phases: the history of this project is that almost every major bug came
from implementation preceding concept separation. **Amended 2026-08-13**
per `docs/ranking-engine-selection-policy-v1.md`, after
`docs/ranking-engine-benchmark-v1.md` exposed that the original
score-sort-top-10 model was the wrong shape — see §2/§3 for the
corrected model. Reviewed against
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
- ✅ **clustered/deduplicated** (per `docs/ranking-engine-selection-policy-v1.md`:
  Ranking Engine input is `story_clusters`, not raw `rss_items`)

Ranking never receives:
- ❌ unclassified stories
- ❌ stories from a different edition
- ❌ stories with no eligible representation
- ❌ raw, unclustered RSS items — deduplication is NOT ranking's job

```
RSS Items
  ↓
Deduplication / Clustering   ← same-source republish resolves HERE, not in ranking
  ↓
Story Candidates
  ↓
Ranking Engine
  ↓
Active Set
```

**Ranking is not a duplicate resolver.** Cross-source duplicate
(different sources reporting the same event) is genuine story redundancy
— picking ONE representative among several eligible candidates IS
ranking's job, handled through the Diversity Constraint (§3E) below.
Same-source republish (one source, identical title, minutes apart) is a
publisher data-quality problem that belongs to ingestion/clustering, and
must never reach the Ranking Engine as two separate candidates in the
first place.

This is a hard boundary: if a story shouldn't be visible at all, that was
already decided upstream — the Ranking Engine's only job is selecting
among what's already eligible, never re-deciding eligibility or
deduplication itself.

## 3. Ranking Model v1

Deliberately simple for v1 — no ML, no learned weights, **and no locked
percentages**. Per ChatGPT: weights come only after a benchmark shows
which components actually discriminate for which fields (the original
Politik sample showed `classification_confidence` was identical across
every story — a locked weight for it would have been meaningless).

**Model shape corrected after `docs/ranking-engine-benchmark-v1.md`**:
not a single sorted score, but candidate scoring followed by
diversity-constrained selection —

```
candidate scoring
      ↓
diversity-aware selection
      ↓
10 Active Slots
```

```
Candidate Score =
    Freshness Score
  + Source Trust Score
  + Field Relevance Score
  (+ Classification Confidence Modifier — optional, see §3C)

Selection = pick 10 candidates from the scored pool,
            subject to the Diversity Constraint (§3E)
```

Note this is deliberately NOT `Score − Diversity Penalty` — see §3E for
why treating diversity as a subtracted term produces the wrong result
(a strong-enough single source can still dominate all 10 slots even
after a penalty).

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

### C. Classification Confidence Modifier (optional)

Renamed from "Classification Confidence Score" per
`docs/ranking-engine-selection-policy-v1.md` — **not a required weighted
component.** The benchmark found every sampled Politik story shared
`classification_confidence = 0.4`, meaning it contributed zero real
differentiation there while implying it did.

Confidence measures evidence certainty about SUBJECT PLACEMENT, not
story importance or quality. **`confidence 0.4` ≠ low-quality story** — a
Bernama story whose only evidence is a `title_prefix` match can be
entirely legitimate, important news at 0.4. This must not be
demoted/buried for that reason alone.

Role in v1:
- does NOT determine ranking on its own
- does NOT replace or outweigh Source Trust
- surfaces as a **quality indicator** / **reason** (feeds `reasons[]` in
  the output, e.g. `"low_confidence_placement"` as a caveat) rather than
  a scored term in the sum

### D. Field Relevance

Per ChatGPT: after the current architecture, this component may be
redundant — a story either IS in `edition_story_classifications.field`
for the active field (score contribution: fixed value, e.g. 100) or it
isn't in the ranking pool at all (already filtered out upstream, §2).
**Placeholder only in v1** — kept as a named component in case a future
need for partial/fuzzy field relevance emerges, not because it does
meaningful work today.

### E. Diversity Constraint / Selection Factor

Renamed from "Diversity Penalty" per
`docs/ranking-engine-selection-policy-v1.md` — **not a subtracted score
term.** "Penalty" implies "take the highest scores, then subtract a
little" — that model still lets one strong-enough source dominate all 10
slots. Adjung Quick needs the stronger form: **select the best
COMBINATION of 10 candidates, not the top 10 individual scores.**

Example: Story A (score 95, Astro Awani) and Story B (score 92, Bernama)
— B may be selected over a second Astro Awani candidate even though its
raw score is lower, because the resulting SET of 10 is better than a set
with two Astro Awani stories and no Bernama.

**The most important component for Adjung Quick specifically** — the
Group D benchmark case (`rss-awani-politik` holding 25/35 of all Politik
candidates) is exactly the scenario this exists to prevent.

Two constraint sources:
- **Source diversity**: the selection should not let one source occupy
  a disproportionate share of the 10 slots, even when every one of its
  candidate stories individually scores well.
- **Cross-source story redundancy**: when multiple sources cover the
  functionally-same event (the benchmark's Kayveas/Maglin case — Astro
  Awani + Harian Metro, ~1h apart), select ONE representative, not both.
  This is explicitly the ranking layer's responsibility for CROSS-SOURCE
  duplicates — same-source republish is excluded per §2's input contract
  (that never reaches ranking as two candidates in the first place).

### F. Tie-break hierarchy

Real ties exist in production data — Astro Awani and Harian Metro share
`trustScore: 90` (`lab/sources.js`), not a benchmark artifact. Per
ChatGPT: do not resolve this by nudging trust numbers arbitrarily
(`Astro = 91, Metro = 89` with no stated justification is the kind of
unprincipled tuning this project has avoided elsewhere). When upstream
signals are genuinely equal, apply this order:

```
1. freshness
2. source trust
3. diversity (has this source/desk already filled a slot?)
4. editorial score (once/if a broader editorial-weight signal exists)
```

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

`docs/ranking-engine-benchmark-v1.md` (score-focused, v1) is done. Per
ChatGPT, a **benchmark v2** is required before implementation — v1 tested
whether individual scores looked sane; v2 must test whether a full
SELECTION (10-story combination) looks editorially sane, e.g.:

```
Input: 35 Politik candidates (25 Astro Awani, 5 Bernama, 5 Metro)
Expected Active Set: no more than X from Astro Awani, real source
                      diversity present — not simply candidates #1-10
                      by raw score.
```

Same benchmark-before-scale discipline as
`classification/benchmark-confidence-threshold.mjs` used during the
classification calibration arc.

## Next

1. Build `docs/ranking-engine-benchmark-v2.md` — selection-level
   expectations, not score-level.
2. Implement the Editorial Ranking Engine against both benchmarks.
3. Verify benchmark cases rank/select as expected before wiring into
   `db/classify-production.js` / the Active Set selection path.

---

## AMENDMENT 2026-08-13 — Editorial Override insertion points

Added after `docs/editorial-override-data-model-v1.md` §6 resolved where
human editorial decisions enter this pipeline. **Not yet implemented** —
recorded here first, per ChatGPT: the pipeline contract must state this
before any override code is written.

### The pipeline, with editorial control included

```
candidate scoring  (+ editorial BOOST modifier)
        ↓
diversity selection
        ↓
editorial composition
        ↓
Active Set  =  PINNED stories  +  ranked selection
```

### `boost` — inside the contest

An editorial boost is a **scoring modifier**, applied at the candidate
scoring stage alongside freshness, source trust, and classification
confidence. It is not a separate later stage.

Consequences, all intentional:
- A boosted story competes more strongly but **can still lose**.
- Diversity selection still applies — a boosted story from an
  over-represented source can still be held back.
- Editorial composition still applies.
- The boost is visible in `reasons[]` like any other scoring factor, so
  explainability is preserved.

**Why not after diversity selection:** `selectDiverseCandidates()` picks
`capacity` out of the whole pool, so a later modifier could only reorder
survivors. A story outside the top `capacity` could never be promoted at
all — the editor would press Promote, the system would accept it, and
the reader would see no change.

### `pin` — outside the contest

A pin does not participate in scoring at all:

```
Active Set = Pinned stories + Ranked selection
```

An editor pinning a story is not asserting that it scores well; they are
asserting it must be at the front regardless of score (national
emergency, major announcement, public crisis). Encoding that as a very
large score bonus would misrepresent the intent and pollute
explainability.

Pins therefore consume Active Set capacity before ranked selection runs,
and carry the strictest requirements: rare, audited, mandatory expiry,
required reason.

### Unchanged by this amendment

Candidate scoring inputs, the diversity dominance discount, and
editorial composition all keep their existing behaviour and parameters.
This amendment adds where human decisions enter — it does not retune
anything.
