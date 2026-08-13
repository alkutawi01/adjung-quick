# Ranking Engine Benchmark v1 (2026-08-13)

Status: **Benchmark corpus, no code.** Per ChatGPT: this is not for
proving the formula in `docs/ranking-engine-contract-v1.md` is correct —
it's for finding missing components, weird weights, and trade-offs the
formula doesn't yet handle sensibly, BEFORE any weight is chosen.
Weight/formula discussion happens after this document, not inside it.

## Objective

Given real production stories with genuine editorial trade-offs (not
obvious "new + trusted beats old + untrusted" cases — those don't test
anything), write down what a human editor would expect the Active Set to
look like, then later check the implemented Ranking Engine against these
expectations by hand.

## Dataset selection

Pulled live from `ms-MY`'s "Politik" field (`edition_story_classifications`,
2026-08-13) — chosen because it has enough real volume (source
distribution: `rss-awani-politik` 25, `rss-utusan-politik` 7, `rss-metro`
2, `rss-utusan` 1) to produce genuine near-duplicate and source-overload
cases without inventing synthetic data.

## Group A — Freshness vs. Editorial Weight (2 stories)

The hard trade-off ChatGPT asked for: not "new+trusted beats old+
untrusted" (too easy), but two stories where a straight freshness-first
ranking would produce a defensible-but-arguable result.

```json
{
  "storyId": "utusan-dap-dijangka-kekal",
  "title": "DAP dijangka kekal dalam kerajaan",
  "edition": "ms-MY",
  "field": "Politik",
  "source": "rss-utusan",
  "publishedAt": "2026-08-12T23:35:19+00:00",
  "classificationConfidence": 0.4,
  "expectedRanking": "high — freshest AND a coalition-stability story with real national-politics weight",
  "editorialReason": "Most recent Politik story in the sample. Also the kind of story an editor would lead with regardless of freshness — a coalition-party stability signal outranks routine personnel news even a day newer."
}
```

```json
{
  "storyId": "utusan-politik-wong-chen-mohon-maaf",
  "title": "Wong Chen mohon maaf kepada pengundi Subang",
  "edition": "ms-MY",
  "field": "Politik",
  "source": "rss-utusan-politik",
  "publishedAt": "2026-08-12T07:02:49+00:00",
  "classificationConfidence": 0.4,
  "expectedRanking": "lower than the DAP story above, but NOT bottom-of-list — real news, ~16 hours older",
  "editorialReason": "This is the genuine trade-off case: both stories share the same source trust tier (rss-utusan family, trust 95) and the same low classification confidence (0.4, default_mapping — neither is a 'sure thing' classification). The only real differentiator is freshness (~16h gap) and editorial weight (party-coalition story vs. one MP's personal apology). A ranking engine that ONLY weighs freshness heavily would still get this right by luck; a ranking engine that ignores freshness entirely and only weighs source trust would get it WRONG (tie, arbitrary order) since both stories share identical trust and confidence. This case exists specifically to catch that failure mode."
}
```

## Group B — Near-duplicate, single-event, multiple sources (3 stories)

```json
{
  "storyId": "awani-kayveas-gagal-cabar-1315",
  "title": "Kayveas gagal cabar pelantikan Maglin sebagai Presiden myPPP",
  "edition": "ms-MY",
  "field": "Politik",
  "source": "rss-awani-politik",
  "publishedAt": "2026-08-12T13:15:00+00:00",
  "classificationConfidence": 0.4,
  "expectedRanking": "ONE of these two should represent the story in the Active Set — not both",
  "editorialReason": "Same event as the Metro item below, same headline almost verbatim, ~1 hour apart. A reader should never see this exact story twice."
}
```

```json
{
  "storyId": "metro-kayveas-gagal-cabar-1419",
  "title": "Kayveas gagal cabar pelantikan Maglin sebagai Presiden myPPP",
  "edition": "ms-MY",
  "field": "Politik",
  "source": "rss-metro",
  "publishedAt": "2026-08-12T14:19:42+00:00",
  "classificationConfidence": 0.4,
  "expectedRanking": "whichever of this pair the Diversity Penalty keeps should rank on its own merit (freshness/trust) — the OTHER should not appear at all",
  "editorialReason": "Genuinely ambiguous which of the pair 'wins': Metro is 1h04m fresher; Astro Awani and Harian Metro carry comparable trust (90 vs 90 in lab/sources.js — a real tie). This is deliberately NOT an easy case — if the engine picks Metro for freshness that's defensible, if it picks Awani for being the FIRST report that's also defensible. What's NOT defensible is showing both."
}
```

```json
{
  "storyId": "awani-dap-perak-sebulat-suara-dup",
  "title": "DAP Perak sebulat suara kekal bersama Kerajaan Perpaduan",
  "edition": "ms-MY",
  "field": "Politik",
  "source": "rss-awani-politik",
  "publishedAt": "2026-08-12T07:40:04+00:00",
  "classificationConfidence": 0.4,
  "expectedRanking": "excluded entirely if a true byte-identical duplicate of an already-clustered item, OR ranks as a near-duplicate of the Utusan item below if genuinely a separate cluster",
  "editorialReason": "This exact title appears TWICE in raw rss_items from the SAME source (07:40:04 and 07:53:11) — worth flagging as a possible feed-level duplicate (same source publishing the same story twice, not a cross-source diversity case) rather than assuming it's automatically a Diversity Penalty case. The Ranking Engine benchmark should distinguish 'same source republished' from 'different sources covering the same event' — they may need different handling."
}
```

## Group C — Cross-source consensus, single representative expected (context for Group B)

Per ChatGPT: 5 portals reporting the same story should produce **1
representative story + genuinely different other stories** in the Active
Set, never the same event occupying multiple slots. Group B above is the
real 2-3-source instance of this pattern found in the live data — a
clean 5-portal example wasn't present in the current Politik sample size,
so Group B stands in as the real-data version of this case. Noted here
so the gap is visible, not silently assumed away.

## Group D — Source overload (5 stories, by distribution not enumeration)

Real distribution pulled live, `ms-MY` Politik, all `classified` rows:

```
rss-awani-politik:   25 stories
rss-utusan-politik:   7 stories
rss-metro:            2 stories
rss-utusan:           1 story
```

**Expected**: with only 10 Active Set slots and `rss-awani-politik`
alone able to fill all 10, the Diversity Penalty must prevent that —
the Active Set should include real Politik coverage from more than one
source, not become "Astro Awani's top 10 Politik stories today," even
though every one of those 25 stories is a legitimately-placed Politik
story on its own.

**Editorial reason**: this is the exact scenario named in
`docs/ranking-engine-contract-v1.md` §3E as the reason Diversity Penalty
exists — a single dominant source shouldn't be able to own the whole
Bidang just by publishing more volume than everyone else.

## Unknowns discovered while building this benchmark

1. **Feed-level duplicate vs. cross-source duplicate are different
   problems.** Group B's third item (DAP Perak, published twice by the
   SAME source 13 minutes apart) suggests `lab/engine.js`'s clustering
   may need a distinct check for same-source republication, separate from
   the Diversity Penalty's cross-source concern. Not designed here —
   flagged for the implementation discussion.
2. **Trust ties are real, not theoretical.** Astro Awani and Harian
   Metro share the identical `trustScore: 90` in `lab/sources.js` (Group
   B's first pair) — the ranking formula needs a defined tie-break
   behavior (freshness? first-published? stable sort by storyId?), not
   an accidental one from object/array ordering.
3. **`classification_confidence` may not discriminate much within one
   field.** Every story sampled in this benchmark has confidence exactly
   `0.4` (`default_mapping` method) — meaning, at least for Politik right
   now, the Classification Confidence component of the ranking formula
   contributes ZERO differentiation between any of these stories. Worth
   checking whether this is specific to Politik (a field with weaker
   Tier 1/3 evidence than niche fields like Agama/Sains) or a broader
   pattern before assuming Classification Confidence pulls real weight
   in the final formula.
4. **Group C's true 5-source case wasn't present in this sample** — the
   benchmark should be re-checked against a field/day with a bigger
   breaking-news moment (multiple portals covering one major event) once
   one is available in production data, rather than assuming Group B's
   2-3-source case generalizes.

## Next

Per ChatGPT: formula/weight discussion and implementation only start
after this document is reviewed — not inside it.
