# Ranking Engine Selection Policy v1 (2026-08-13)

Status: **Contract amendment, per ChatGPT — no code yet.** The benchmark
(`docs/ranking-engine-benchmark-v1.md`) exposed that
`docs/ranking-engine-contract-v1.md`'s original mental model — "calculate
a score per story, sort, take the top 10" — is the wrong shape for what
Adjung Quick actually needs. This document replaces that mental model
before any formula gets implemented.

## What ranking is

> Given a pool of already-eligible stories for one Edition + Field,
> select the 10 that should occupy the Active Set — under real editorial
> constraints, not just by score.

## What ranking is NOT

**Ranking is not a duplicate resolver.** The benchmark's Kayveas/Maglin
case (Astro Awani + Harian Metro, same event, ~1h apart) and the DAP
Perak case (same source, same title, 13 minutes apart) exposed two
DIFFERENT problems that both look like "duplicates" but need different
handling:

- **Cross-source duplicate** (Astro Awani's report + Harian Metro's
  report of the same event): this is **story redundancy** — the Ranking
  Engine's job is to pick ONE representative and treat the rest as not
  competing for a separate slot. This belongs to ranking/selection.
- **Same-source republish** (one source publishing the identical title
  twice, minutes apart): this is **publisher duplication**, a data
  quality problem, not an editorial diversity problem. It belongs
  upstream:

  ```
  RSS ingestion
        ↓
  duplicate detector
        ↓
  story cluster
        ↓
  ranking
  ```

  `lab/engine.js` already has a clustering concept — same-source
  republication should resolve there (or in ingestion), never inside the
  Ranking Engine. **The Ranking Engine receives stories that have already
  been through clustering/deduplication. It is not responsible for
  detecting duplicates itself.**

## Scoring vs. Selection — the model correction

**Old (wrong) mental model:**
```
calculate score → sort → take top 10
```

**Corrected mental model:**
```
candidate scoring
      ↓
diversity-aware selection
      ↓
10 Active Slots
```

The difference: a plain sort treats diversity as a tie-break or a small
penalty subtracted from an otherwise-independent score. The benchmark's
Group D (Astro Awani holding 25/35 of all Politik stories) showed that a
plain `sort(score)` — even with a diversity penalty subtracted — would
still often produce "Astro Awani's top 10," because a strong source can
simply out-score everyone else on every OTHER dimension too. Diversity
in Adjung Quick needs to behave as a **constraint on the selection
process itself**, closer to how a magazine editor fills a limited number
of print pages across desks/reporters, not as one more number added into
a weighted sum:

```
selection algorithm:
  pick the best candidates
  subject to diversity constraints
```

This means v1's implementation shape is closer to a constrained-selection
/ greedy-with-constraints algorithm than a single-pass sort. (Exact
algorithm not designed here — this document fixes the MODEL, not the
implementation.)

## Confidence role — demoted, not removed

The benchmark's most important finding: every sampled Politik story
shared `classification_confidence = 0.4` (`default_mapping`). Under the
original "Final Score = Freshness + Trust + Confidence" formula,
Confidence would have contributed literal zero differentiation for this
entire field — while giving the false impression it was doing
meaningful work.

Worse: low confidence does not mean low-quality news. A Bernama story
whose only evidence is a `title_prefix` match can be entirely legitimate,
important news at `confidence: 0.4` — confidence measures **evidence
certainty about subject placement**, not **story importance or quality**.
Conflating the two would systematically under-rank stories from sources
whose evidence signals are structurally weaker (title-prefix-only,
general feeds) regardless of the story's actual editorial value.

**Decision**: `classification_confidence` is not a primary ranking
signal in v1. It becomes:
- a **quality indicator** (surfaced, not scored)
- an **explanation/reason** (feeds the `reasons[]` array in ranking
  output — e.g. `"low_confidence_placement"` as a caveat, not a penalty)
- an optional **editorial warning** signal for a future correction queue
  (`docs/calibration-ready-engine.md` §B)

Renamed in the formula from "Classification Confidence Score" to
**Classification Confidence Modifier (optional)** — not a required
weighted component.

## Diversity — from penalty to constraint

Per the section above: Diversity moves from "one term subtracted in a
sum" to a **selection constraint** the algorithm must satisfy while
picking the best 10 candidates. Source overload (Group D) is the primary
case this protects against; near-duplicate cross-source stories (Group
B's Kayveas/Maglin pair) are the secondary case — pick one
representative, not both.

## Trust score ties need a defined tie-break, not arbitrary numbers

Astro Awani and Harian Metro share `trustScore: 90` in `lab/sources.js` —
a real tie, not a benchmark artifact. Per ChatGPT: do not silently
"fix" this by nudging one number up or down without a real justification
(`Astro = 91, Metro = 89` for no stated reason is exactly the kind of
unprincipled tuning this whole project has avoided elsewhere). Instead, a
tie-break HIERARCHY, applied only when upstream signals are genuinely
equal:

```
1. freshness
2. source trust
3. diversity (has this source/desk already filled a slot?)
4. editorial score (once/if a broader editorial-weight signal exists)
```

So: same trust, same confidence → **more recent wins** — resolved by an
explicit ordering rule, not by whatever order the database happens to
return rows in.

## Group C (5-portal consensus) — status confirmed correct

No real 5-source breaking-news case existed in the sample window. Per
ChatGPT: reporting "not found" is the right call — inventing a synthetic
example would have violated the same calibration discipline used
throughout this project (`docs/evidence-policy-v1-decision.md`). Future
option: a labeled **simulation** (explicitly marked as synthetic, never
mixed with production benchmark data) to stress-test this case before a
real breaking-news day happens to occur — not built now.

## What changes in `docs/ranking-engine-contract-v1.md` (superseded here, not yet edited in place)

- §3 formula: `Classification Confidence Score` → `Classification
  Confidence Modifier (optional)`, no longer a required weighted term.
- New explicit statement: "Ranking Engine receives stories that have
  already been through clustering/deduplication. Ranking is not a
  duplicate resolver."
- §3E (Diversity Penalty) reframed as a selection CONSTRAINT, not a
  score-reducing term in the same sum as Freshness/Trust.
- New: a defined tie-break hierarchy (freshness → trust → diversity →
  editorial score) for genuinely-tied candidates.

## Next

Only after this policy is confirmed: revise the formula/algorithm shape
in `docs/ranking-engine-contract-v1.md` to match, then implement against
the benchmark corpus (`docs/ranking-engine-benchmark-v1.md`).
