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

## Evidence Independence (added after ChatGPT review, 2026-08-12)

**Evidence Agreement ≠ Evidence Count.** Agreement only means something
when the evidence comes from genuinely different sources — three keyword
matches from the same content-rule family are not three independent
signals, they're one weak signal repeated:

```
Weaker (looks like more, isn't):
  title_keyword: "menteri"
  title_keyword: "parlimen"
  title_keyword: "kerajaan"
  → 3 matches, but Weak + Weak + Weak, same evidence family

Stronger (fewer, but independent):
  rss_category: Politics
  → 1 match, but Medium/Strong, a different mechanism entirely
```

Independent evidence sources (publisher declaration, URL structure, RSS
category, content — genuinely different *mechanisms*) carry more combined
value than multiple signals drawn from the same mechanism, even when the
same-mechanism count is higher. Any future confidence model must count
*independent corroborating mechanisms*, not raw evidence-item count.

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
Evidence Agreement (independent corroborating mechanisms, not raw count — see above)
        │
        ▼
Candidate Confidence
        │
        ▼
Minimum Candidate Confidence Policy (resolver-confidence-policy.md, renamed
        │                            from min_subject_confidence — a candidate
        │                            can be subject, geography, or future entity)
        ▼
Edition Resolver / Placement
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

## Resolved: don't replace min_subject_confidence, layer it instead (2026-08-12)

The open question above is answered, not left open. Per ChatGPT: don't
replace `min_subject_confidence` with `minimum_evidence_quality` — they
answer different questions and collapsing them would hide that
difference:

- **Evidence Quality** — determines a candidate's base strength (this doc).
- **Candidate Confidence** — the result of combining evidence (quality ×
  independent agreement, per above).
- **Minimum Candidate Confidence Policy** — decides whether a candidate is
  usable at all (`docs/resolver-confidence-policy.md`, renamed from
  `min_subject_confidence` to `minimum_candidate_confidence` — a
  "candidate" isn't only ever a subject; geography candidates already
  exist, entity candidates are a plausible future).

These currently produce identical behavior on the live corpus only
because of a corpus coincidence (Batch A2: low confidence == Tier-5-only,
right now) — not because they're the same concept. Keeping them layered
and separately named preserves the distinction for when that coincidence
stops holding (e.g. once Tier 5 content rules improve, or entity
detection is added).

## Explicitly out of scope for 3B.2C-3

- No confidence formula changed or implemented.
- No renamed parameter actually implemented in code yet — the
  `minimum_candidate_confidence` name is locked here as vocabulary; the
  `confidence-policy.mjs` module still uses the old field name until a
  dedicated implementation pass.
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
