# Evidence Quality Matrix Contract (Sesi 3B.2C-3)

Status: **CONTRACT — concept and vocabulary only. No formula locked, no
code changed.** Per ChatGPT: Batch M/U showed that "Tier 1 > Tier 2 > ...
> Tier 5" as a strict linear ranking doesn't match reality — mixed
evidence (58% of the corpus) is dramatically more reliable than any
single tier alone, and even within a single tier, reliability varies by
what the evidence actually says (a specific RSS category vs a generic
"News" catch-all). This document replaces the tier-ranking mental model
with an **Evidence Quality Matrix**.

## Why this exists

Three real findings, all from Sesi 3B.2C-1/2's benchmarking against the
live 284-item corpus, drove this:

1. **`docs/sesi3b2c1-benchmark-results.md`** — confidence threshold
   (0.4-0.8) doesn't change the unclassified rate at all; it only reroutes
   stories between subject-based and geography-based placement.
2. **Batch A2 (`generate-batch-a2.mjs`)** — 0 matches. Every single
   low-confidence (<0.6) subject candidate in the corpus is backed
   *exclusively* by `title_keyword` (Tier 5) evidence. "Genuinely weak but
   correct" doesn't exist as a distinct population — low confidence and
   Tier-5-only are the same population.
3. **Batch M (`mixed-evidence-review-batch.mjs`)** — of 96 items where 2+
   evidence tiers agree, the large majority are clean, 0.97-1.0 confidence,
   with only 1 genuine conflict case out of 96. Agreement between
   independent signals is a far stronger reliability predictor than which
   single tier produced the top candidate.

Conclusion: **confidence should come from evidence quality and agreement,
not primarily from which tier produced the candidate.**

## Evidence classes (replaces the old Tier 1-5 linear ranking)

| Class | Meaning | Example |
|---|---|---|
| **Strong** | Publisher explicitly declared this category for this specific story, source-verified | `feed_category:bisnes` (Harian Metro's dedicated Bisnes feed) |
| **Medium** | A structural signal that's usually reliable but not editorially declared | `rss_category:Politics` (Guardian's own RSS tag), `url_segment:economy` |
| **Weak** | Inferred from content, not structure — the story's own words, not the publisher's placement | `title_keyword:mahkamah` |
| **Ignored** | Structural noise — technically present but carries no subject signal | `rss_category:News`, `rss_category:General`, `rss_category:BERITA`, `rss_category:Mutakhir` |

This is not identical to the old tier list — it's a reliability judgment,
not a pipeline-order label. Per ChatGPT's Batch U observations:
`rss_category` is not uniformly Medium — `rss_category:Politics` (specific)
and `rss_category:News` (generic) are structurally the same evidence type
but very different reliability. **The class depends on what the evidence
value says, not just which mechanism produced it.**

## Evidence agreement

Per Batch M's finding, agreement between *independent* evidence sources is
the strongest reliability signal observed so far — stronger than any
single Strong-class evidence alone:

- **Multiple independent evidence agreeing** — e.g. `feed_category:bisnes`
  + `url_segment:bisnes` + `title_keyword:untung` all pointing to
  `Business` — should boost confidence beyond what either alone would
  produce. This is the empirical basis for the 0.97-1.0 confidence range
  observed across the 96-item mixed bucket.
- **Conflicting evidence** — two Strong/Medium-class candidates disagreeing
  (not yet common: 1/96 in Batch M) needs its own handling, not yet
  designed here. The one observed case (`Politics` vs `Environment` for a
  UK heatwave/minister story) looks like genuine dual-relevance rather
  than an error — consistent with the "don't discard ambiguity" principle
  already locked for Story Understanding.

## Generic category handling

Explicitly a distinct problem from "weak evidence" — a generic category
(`News`, `General`, `BERITA`, `Mutakhir`) is not weak signal, it's **no
signal**, structurally different from a specific-but-uncorroborated
signal like a lone `title_keyword` hit. It should be excluded from
candidate generation entirely (Ignored class), not scored low. This list
is not exhaustive — expect to grow it as new sources are added.

## How confidence should be calculated — concept only, no formula locked

Per ChatGPT's explicit instruction: this document fixes the *model*, not
a formula. The shape:

```
Evidence Quality (per piece of evidence: strong/medium/weak/ignored)
        │
        ▼
Evidence Agreement (do independent pieces corroborate the same value?)
        │
        ▼
Candidate Confidence
        │
        ▼
Edition Resolver
```

Not:

```
Keyword confidence
        │
        ▼
Threshold
```

The current `TIER_CONFIDENCE` noisy-OR aggregation in
`story-understanding.mjs` (publisher_declared=0.90, url_path=0.75,
rss_category=0.70, title_keyword=0.40) already captures *some* of this —
agreement across tiers does compound via noisy-OR — but it doesn't yet
distinguish specific-vs-generic values within a tier (the `rss_category`
problem above), and it wasn't designed with "evidence quality class" as
an explicit first-class concept. Whether the existing formula needs to
change, and how, is **not decided in this document** — that's
implementation work for whenever this contract is confirmed.

## Open question this contract raises, not answers

Should `min_subject_confidence` (`docs/resolver-confidence-policy.md`)
be replaced by a `minimum_evidence_quality` gate instead — e.g. "reject
candidates backed only by Weak-class evidence" rather than "reject
candidates below a numeric threshold"? Per Batch A2's finding, these two
framings currently produce *identical* behavior on the live corpus (since
low confidence and Tier-5-only are the same population right now) — but
they diverge in intent and in future behavior once evidence sources
change. This document does not choose between them; that decision comes
after this contract is confirmed.

## Explicitly out of scope for 3B.2C-3

- No confidence formula changed or implemented.
- No `min_subject_confidence` vs `minimum_evidence_quality` decision made.
- No evidence class values (`quality`/`provenance` fields) added to
  `story-understanding.mjs`'s actual output — this is vocabulary/design
  only.
- No generic-category exclusion list implemented in `content-rules.mjs`
  or `desk-vocabulary.mjs`'s `STRUCTURAL_NOISE`.
- Batch U's `editorial_judgement` columns remain unfilled by design — per
  ChatGPT, these are Izzat's material for building "Adjung Quick's
  editorial memory," not something the engine should self-grade.

## Next

Once this contract is confirmed: decide the `min_subject_confidence` vs
`minimum_evidence_quality` question, then (only after that) implement
whichever confidence model wins — informed by Izzat's Batch M/U/A
judgments once filled in, not before.
