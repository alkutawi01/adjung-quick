# Editorial Composition Benchmark v1 (2026-08-13)

Status: **Benchmark corpus, no code.** Asks a different question than
`docs/ranking-engine-benchmark-v1.md`/`v2.md`. Those asked "is story A
correctly ranked above story B?" This asks:

> **"Does this final 10-story set feel like a page an editor deliberately
> composed — or like one source's output list?"**

Composition does not measure truth, classification accuracy, or ranking
score. It measures **balance, variety, and editorial usefulness** of the
final set as a whole.

## Case A — Source Dominance

```
Input: 10 candidates — Astro Awani 8, Bernama 1, Metro 1
Expected: NOT necessarily an even 3-3-3 split, but NOT "Astro 8/10"
          either, if Bernama/Metro meet the quality floor.
```

## Case B — Quality Floor Conflict

The exact case from the failing `ranking-engine.test.mjs` test.

```
Input: Astro Awani 95, 94, 93 — Bernama 80 — Metro 78
Question: should Composition open room for Bernama/Metro?
Expected: Yes — the additional slots carry real editorial value from
          diversity. But NOT "Astro is removed entirely" — the floor
          protects Astro's clearly-best stories from ever being
          displaced.
```

## Case C — Genuine Dominant Event

The counter-case, so diversity doesn't become too aggressive.

```
Input: A major earthquake — Astro Awani, Bernama, Metro, RTM all report
       the SAME event.
Expected: Diversity must NOT force a minor, unrelated story into the
          Active Set just to hit a variety target. When every major
          source is legitimately covering the same real event, that's
          not source dominance to correct — it's consensus on what
          matters today.
```

## Case D — Topic/Angle Diversity

```
Input: within one Politik field, 10 candidates — 8 election stories,
       1 political-economy story, 1 international-relations story.
Expected: Composition MAY give room to the different angles (economy,
          international relations) even if their raw scores trail the
          election stories — variety of ANGLE, not just variety of
          SOURCE, is a legitimate composition concern. Not required to
          force this, but permitted to.
```

## Case E — Small Field

```
Input: Sains — only 5 real candidates exist total.
Expected: Composition must not force artificial diversity when the
          candidate pool itself is small. If 4 of 5 real candidates
          happen to come from MOSTI, that's not dominance to correct —
          it's the honest shape of a niche field's actual coverage
          (docs/niche-field-coverage-audit.md already established this
          pattern for Sains/Pendidikan). Composition must be flexible
          to candidate volume, never rigid.
```

## Expected editorial outcome — stated as a PRINCIPLE, not a specific slot assignment

Per ChatGPT: do not write "Bernama gets slot 4" (too specific, too
brittle). Write the principle:

> **The set is not dominated by one source when a qualifying alternative
> candidate exists that meets the quality floor.**

Each case above is evaluated against this principle, not against an
exact expected list of story IDs in exact slots.

## Unknowns (deliberately not answered here)

- What is the quality floor threshold, numerically?
- How much diversity is "enough" — is there a target minimum number of
  distinct sources, or just "not one source above some share"?
- Does composition need SOURCE diversity only, or also ANGLE/TOPIC
  diversity (Case D)?
- Does composition ever need manual editorial weight (a human-set signal
  that a specific story matters more than its score suggests), or is it
  purely mechanical in v1?

Per ChatGPT: do not answer these now. They get answered once
`editorial-composition.mjs` has a real implementation to evaluate against
these five cases — implementation informs the answer, not the reverse.

## First implementation shape (once benchmarked)

Per ChatGPT — deliberately small, not an "AI editor":

```
ranked candidates
      ↓
composition constraints
      ↓
final 10
```

Output carries its own reasons, same transparency principle as ranking:

```json
{
  "selected": true,
  "compositionReason": ["source_diversity", "quality_floor_preserved"]
}
```

## The three layers, now fully separated

```
Candidate Scoring    = how valuable is this story on its own?
Diversity Selection  = prevent one pattern from dominating the set
Editorial Composition = does the FINAL set feel like a real editorial page?
```

Per ChatGPT's explicit warning: **do not collapse these three layers
into one big formula.** Each answers a genuinely different question, and
`ranking/diversity-selection.mjs` (including its dominance-discount
parameter) stays exactly as-is — Composition is a new layer on top, not
a rewrite of what already exists.

## Next

Implement `ranking/editorial-composition.mjs` against these five cases —
starting from the current pass-through placeholder, not a rewrite of
`diversity-selection.mjs`.
