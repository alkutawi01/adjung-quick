# Ranking Engine Benchmark v2 — Selection-Level (2026-08-13)

Status: **Benchmark corpus, no code.** v1 (`docs/ranking-engine-benchmark-v1.md`)
tested individual story scores in isolation. Per ChatGPT: that's not
enough — the real question is whether a full 10-story SELECTION looks
editorially sane, since a plain top-10-by-score sort can still produce
"one dominant source's top 10" even with individually-reasonable scores.
v2 tests the SELECTION (the combination), not the score.

## Input (real production data, `ms-MY` Politik, 2026-08-13)

```
35 classified Politik candidates:
  rss-awani-politik:    25
  rss-utusan-politik:    7
  rss-metro:             2
  rss-utusan:            1
```

This is the exact real distribution `docs/ranking-engine-benchmark-v1.md`
Group D found live — reused here as the input for the selection-level
test rather than re-pulled, so v1 and v2 stay comparable against the same
underlying data.

## Expected Active Set (selection-level, not score-level)

**Not this** (plain top-10-by-score, ignoring source):
```
1-10: rss-awani-politik (all 10 slots, since it holds 71% of candidates
      and nothing in a plain score forces room for anyone else)
```

**Expected**:
```
A selection where:
- rss-awani-politik holds AT MOST 6 of 10 slots (its 71% candidate
  share should NOT translate to 100% of slots — real diversity required
  even though it's the largest, most prolific source)
- rss-utusan-politik has AT LEAST 2 slots (second-largest source,
  meaningfully represented, not zero'd out)
- rss-metro and rss-utusan each have a real chance to appear if their
  candidates are otherwise strong — not guaranteed a slot just for
  existing, but not structurally excluded either
- no single EVENT (cross-source duplicate cluster) occupies more than
  one slot — e.g. if both an Astro Awani and a Harian Metro story cover
  the same event, only one representative appears
```

The specific number (6, not 5 or 7) is a **starting parameter**, same
status as Benchmark v1's freshness bucket boundaries — expected to be
tuned once the selection algorithm exists and produces a real result to
evaluate against actual reader experience, not treated as a locked rule
here.

## Why this is the harder, more honest test

A ranking engine can pass v1 (every individual score looks reasonable)
and still fail v2 (the resulting 10-story set is editorially bad) if
diversity is implemented as a subtracted penalty rather than a true
selection constraint — exactly the failure mode
`docs/ranking-engine-selection-policy-v1.md` identified: a strong enough
source can out-score everyone else on every OTHER dimension too, so a
small penalty term never catches up.

## Additional selection-level case: cross-source redundancy

Using Benchmark v1 Group B's real near-duplicate pair (Kayveas/Maglin,
reported by both `rss-awani-politik` and `rss-metro`, ~1h apart):

```
Input: both cluster entries eligible, both pass individual scoring
Expected: exactly ONE of the pair appears in the Active Set
Not expected: both appearing as if they were two different stories
```

This is a selection-level assertion specifically — v1 could only say
"both score reasonably," it couldn't say "but only one should be
chosen." That choice only exists once selection (not just scoring) is
implemented.

## What this benchmark does NOT test

- Exact numeric thresholds (the "6" above is illustrative, not final)
- A true 5-portal breaking-news case (still absent from the sample
  window — same gap noted in Benchmark v1, unresolved here too)
- Performance/scale behavior (35 candidates is small; a busier field
  like Pendidikan's 193 would need its own pass once the algorithm
  exists)

## Next

Per ChatGPT: implement the Editorial Ranking Engine prototype against
both Benchmark v1 (score sanity) and Benchmark v2 (selection sanity)
together — a candidate scoring pass followed by a diversity-constrained
selection pass, per the corrected model in
`docs/ranking-engine-selection-policy-v1.md` and the updated
`docs/ranking-engine-contract-v1.md` §3.
