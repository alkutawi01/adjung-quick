# Editorial Value Dimension Discovery (2026-08-13)

Status: **Findings record, NOT a policy.** Per ChatGPT: this documents a
real gap surfaced by Izzat's manual review
(`docs/editorial-ranking-shadow-evaluation-v1.md` §5) — it does not
propose a fix, formula, or implementation. The definition of what
"lasting editorial value" means for Adjung has to come from editorial
principle, not be reverse-engineered from one regression.

## The gap

None of Candidate Scoring (freshness, source trust, confidence),
Diversity Selection, or Editorial Composition v0.1 currently measure
whether a story has **lasting/evergreen editorial value** — as opposed
to being simply fresh, from a trusted source, or diverse from what else
is selected. All three existing dimensions are about the STORY'S
CIRCUMSTANCES (when it arrived, who published it, how it compares to
other selected stories) — none are about the STORY'S OWN CONTENT VALUE.

## Observation 1 — "Ujian buat Imam al-Bukhari di tanah kelahirannya"

```
Freshness:        low  (older story, discounted by the freshness bucket)
Source trust:      high (rss-utusan-agama)
Editorial value:   high — per Izzat's manual verdict, "incorrectly demoted"
```

The engine had no signal available to it that would have kept this
story in — nothing in freshness, trust, or diversity captured "this is
real historical/religious knowledge content, not routine news." It lost
purely because something else scored/discounted higher on the
dimensions that DO exist.

## Observation 2 — Product/gadget announcements

```
Freshness:        high (HONOR Robot Phone, SpaceX/Grok — recent)
Editorial value:   Izzat's verdict — "correctly demoted"/"conditional,
                    watch for hype" — freshness alone does not make a
                    product announcement editorially significant
```

The inverse problem: HIGH freshness does not reliably mean high value
either. Izzat's own words: "Adjung tidak perlu jadi portal gadget."

## Observation 3 — Individual-politician news

```
Freshness:        high (Wong Chen leaving PKR — recent)
Editorial value:   Izzat's verdict — "correctly demoted" — "politik
                    individu biasanya cepat basi... hanya naik jika ada
                    implikasi besar terhadap negara/dasar"
```

Same pattern as Observation 2 from a different field: freshness and
source trust are necessary but not sufficient signals for what actually
belongs in a limited 10-slot Active Set.

## What this is NOT yet

Per ChatGPT, an illustrative sketch of what a future "Editorial Value
Dimension" MIGHT look like — explicitly **not implemented, not locked,
not even fully specified** here:

```
Class A — Significant / Lasting Value
  history, knowledge, major change, future reference
  (studies, discoveries, figures, heritage)

Class B — Current Importance
  significant current news, policy decisions, major developments
  (laws, government decisions, crises)

Class C — Useful Update
  useful information, routine developments

Class D — Low persistence / ephemeral
  minor announcements, temporary trends, quickly-stale content
```

This sketch is recorded here ONLY as a discovery artifact — it must not
be treated as `docs/editorial-composition-policy-v1.md`'s already-named
"editorial classes A-D" getting a real definition. Per ChatGPT: **the
definition must come from Adjung's own editorial principles, not be
reverse-engineered from a single regression case.** No code implements
this sketch.

## What NOT to do about this

- Do not patch with a keyword rule (e.g. "if source is rss-utusan-agama
  and title mentions a historical figure, boost score") — this is
  exactly the keyword-whack-a-mole trap the classification calibration
  arc already rejected (`docs/evidence-policy-v1-decision.md`), applied
  to a new layer.
- Do not block all activation on solving this — it affects specific
  field CHARACTERS (evergreen/niche content-heavy fields like Agama),
  not every field equally.

## Consequence for pilot scope

Per ChatGPT: **pilot `editorial_v1` activation on `ms-MY.Politik` only**
(`docs/editorial-ranking-integration-plan-v1.md` §4's feature flag,
scoped per edition+field). Politik has the most shadow-mode evidence
(many sources, a clear diversity problem, clear source distribution) and
its manual review sample raised no lasting-value concerns. `Agama`
(where the one real regression occurred) and other evergreen/niche-heavy
fields stay on `legacy` until an Editorial Value Dimension is actually
defined and evaluated — not because legacy is better, but because niche
fields with evergreen content need this dimension and Politik's
character doesn't currently expose the same gap.

## Next

Per ChatGPT's exact sequencing:
1. This document (done).
2. Pilot activation: `ms-MY.Politik` → `editorial_v1` only.
3. Editorial Value Dimension gets developed as its own policy document
   later — grounded in Adjung's editorial principles, informed by (not
   dictated by) this discovery record.
