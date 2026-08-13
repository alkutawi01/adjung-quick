# Editorial Composition Policy v1 (2026-08-13)

Status: **Policy document, per ChatGPT — no code yet.** Triggered
directly by the quality-vs-diversity test failure in
`ranking/ranking-engine.test.mjs` (3 Astro Awani stories took 3 of 5
slots over Bernama/Metro, despite the Diversity Selection stage's
dominance discount). Per ChatGPT: **this is a design finding, not a
bug** — it shows the Diversity Selection stage (`ranking/diversity-selection.mjs`)
cannot fully solve source composition alone when the underlying score
gap is large. A separate layer is needed: Editorial Composition.

## 1. Purpose

**Composition is not ranking.** Ranking (Candidate Scoring + Diversity
Selection) answers "which candidates score well, with some room made for
diversity." Composition answers a different question:

> **"Does this set of 10 stories look like an editorial page — or does
> it look like one source's output list?"**

It operates on the OUTPUT of ranking, as a shape/structure check — not a
truth or subject-matter check.

## 2. Input

Composition receives **ranked candidates** (already scored, already
passed through Diversity Selection) — never raw stories, never anything
that hasn't already been through Candidate Scoring and Diversity
Selection first.

```
Candidate Scoring
      ↓
Diversity Selection
      ↓
Editorial Composition        ← this policy
      ↓
Active Set (10 slots)
```

## 3. Responsibility

Composition **can**:
- ✅ reorder the selected set (composition, not truth, is about
  arrangement)
- ✅ replace a MARGINAL candidate (one near the selection boundary, not
  a top performer) with a lower-scoring candidate from an
  under-represented source, when the set is too homogeneous
- ✅ ensure diversity as a final-pass check, catching cases Diversity
  Selection's per-pick discount didn't fully resolve

Composition **cannot**:
- ❌ determine which field a story belongs to (Edition Classification's
  job, frozen)
- ❌ determine truth/what a story is about (Story Understanding's job,
  frozen)
- ❌ override or replace classification in any way

## 4. First policy: "Quality floor + diversity opportunity"

The core idea, illustrated with the exact failing test case:

**Without composition** (current Diversity Selection alone):
```
1. Astro Awani  95
2. Astro Awani  94
3. Astro Awani  93
4. Astro Awani  92
5. Astro Awani  91
```

**With composition**:
```
1. Astro Awani  95
2. Astro Awani  94
3. Astro Awani  93
4. Bernama      80
5. Metro        78
```

**The important framing, per ChatGPT**: this is NOT claiming "Bernama's
80 is better than Astro Awani's 92." It IS saying "slot 4 and 5 carry
real editorial value from being diverse, even at a lower raw score" — a
deliberate, named trade-off, not a scoring illusion. The floor protects
against destroying quality (Astro Awani's top 3 — the clearly best
stories — are never displaced); the opportunity clause is what lets
genuinely marginal slots go to diversity instead of a 4th/5th pick from
the same dominant source.

**Concretely** (mechanism sketch, not final algorithm — implementation
still waits for its own contract per the existing Policy → Benchmark →
Prototype → Evaluation → Integrate discipline):
```
Primary selection: take the Diversity Selection output as-is
Composition check: is any single source over some threshold share
                    of the 10 slots?
If yes: look for a candidate from an under-represented source whose
        score is only marginally lower than the threshold-crossing
        source's LOWEST-scoring selected candidate, and swap it in
```

## Experimental Parameters (added after v0.1 implementation, 2026-08-13)

**Status: calibration required.** `ranking/editorial-composition.mjs` v0.1
introduced two numeric thresholds — dominance share (0.5) and quality
floor ratio (0.75). These are explicitly **not a final editorial
decision**, just a starting point for evaluation. A field with many
active sources (Politik) and a field with almost none (Sains: 7 real
candidates total; Agama: 1-2 real sources) will very plausibly need
different thresholds — one number is not expected to fit every field.
Locked only after the small-field production benchmark
(`docs/ranking-engine-small-field-production-benchmark.md`) produces
real evidence either way.

## 5. What this does NOT change

- `ranking/candidate-scoring.mjs` — untouched.
- `ranking/diversity-selection.mjs` — untouched, including its 0.6
  dominance-discount parameter (per ChatGPT's explicit "jangan tune 0.6
  dahulu" — not touched by this policy either).
- The failing quality-vs-diversity test in `ranking/ranking-engine.test.mjs`
  stays failing until Composition is actually implemented against it —
  it is currently testing Diversity Selection alone, which was never
  meant to solve this on its own.

## Next

Per ChatGPT: build a **Composition Benchmark** next — not "is the
ranking correct?" (already benchmarked) but **"does this 10-story set
look like a real editorial page?"** Only after that benchmark exists does
`editorial-composition.mjs` (currently a pass-through placeholder) get
real logic.
