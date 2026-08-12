# Sesi 3A — Story Understanding Engine, First Run Results

Status: Implementation of `docs/story-understanding-engine-spec.md`, first
real run against live corpus (193 items — RSS feeds rotate live, so this
isn't exactly the frozen 190/191-item benchmark set, close enough for a
coverage/ambiguity baseline).

Code: `classification/story-understanding.mjs` (engine),
`classification/lib/desk-vocabulary.mjs` (real evidence mapped to Universal
Subject/Geography), `classification/lib/content-rules.mjs` (minimal Tier 5,
5 phrase groups only — deliberately not a large keyword list, per spec),
`classification/lib/bernama-prefix.mjs` (Bernama's title-prefix evidence
shape). Run: `node classification/test-story-understanding.mjs`.

## Results

```
COVERAGE
  Subject candidate coverage:    101/193  (52%)
  Geography candidate coverage:  63/193  (33%)

AMBIGUITY RATE
  No signal:            92/193  (48%)
  Single candidate:     89/193  (46%)
  Multiple candidates:  12/193  (6%)

EVIDENCE SOURCE DISTRIBUTION
  title_keyword    72  (49%)
  rss_category     43  (29%)
  url_segment      33  (22%)
```

## Honest read — this is a baseline, not a disappointing result

Both coverage numbers are below the spec's informal ballparks (~95% subject,
~80% geography) — expected and explainable, not a red flag:

1. **Tier 1 (publisher-declared) isn't wired in yet.** No source in
   `lab/sources.js` currently carries `sourceKnownCategory`, and Bernama
   (the title-prefix source) isn't in `RSS_SOURCES` at all yet — both are
   explicitly flagged "not yet done" in `source-registry-v2-audit.md`,
   deferred to avoid changing production ingestion out of sequence. Once
   Harian Metro's category feeds and Bernama are added, Tier 1 should
   activate for a real, measurable share of the corpus.
2. **`title_keyword` at 49% is exactly the unhealthy signal the spec warned
   about** — "if text rules dominate, the engine is still over-relying on
   content guessing." This confirms the diagnosis, it doesn't contradict it:
   the fix is wiring in Tiers 1/3 more fully, not writing more keywords.
3. **Content rules are deliberately minimal** (5 phrase groups) — the spec
   explicitly said not to write a large keyword list yet. Coverage will stay
   modest on text-only signal until either more Tier 1-3 evidence is wired in
   or (later, deliberately) targeted keyword additions respond to specific
   measured gaps.

## What this run validates

- The output contract shape works end-to-end: multi-candidate,
  evidence-provenance-carrying, confidence-as-ranking-not-probability — all
  match `story-understanding-engine-spec.md` exactly.
- Ambiguity is genuinely preserved, not collapsed — 6% of items get multiple
  candidates rather than being forced to one value.
- Geography detection at 33% is mostly `rss_category` picking up Kosmo's
  `Negara` tag — consistent with the original corpus finding that Kosmo's
  category signal is geographic, not subject (`classification-taxonomy-mapping.md`).

## Not yet done

- Tier 1 wiring (Harian Metro category feeds, Bernama, Utusan/Kosmo
  `/category/{slug}/feed/` sources) — would likely move coverage and evidence
  distribution substantially, per Source Registry v2's findings. Flagged for
  Sesi 3A continuation or Sesi 5, not done in this pass to keep scope
  contained to "does the pipeline shape work."
- No accuracy measurement — correctly out of scope per spec (needs Edition
  Classification + a redone benchmark, Sesi 3B+4).
- Entity detection (Tier 4) — explicitly not implemented, per spec.
- Content rules only cover Crime/Disaster/Politics/Sports/Health — the 5
  subjects where real corpus evidence was strongest. The other 10 subjects
  currently rely entirely on Tiers 1-3.

## Tier 1 wired in (Sesi 3A.1, same day) — before/after

Per ChatGPT: this stays inside Sesi 3A ("melengkapkan Sesi 3A", not a jump to
Sesi 5), and must be a data-driven **Source Evidence Layer**, never
`if (source === "Harian Metro") return "Business"`. Implemented as:
`lab/rss.js` now passes through an optional `source.knownCategory` onto every
parsed item as `sourceKnownCategory` (undefined for ordinary feeds — nothing
guessed). `lab/sources.js` gained 9 new source entries, additive only,
nothing removed: Bernama EN/BM (rediscovered by Izzat, title-prefix evidence
via `classification/lib/bernama-prefix.mjs`), Harian Metro's 4 confirmed
category feeds (`bisnes`/`arena`=sukan/`global`=dunia/`rap`=hiburan), and 4
spot-verified Utusan/Kosmo `/category/{slug}/feed/` feeds (ekonomi, sukan,
politik, hiburan) — all confirmed live before adding, per
`source-registry-v2-audit.md`.

```
                          BEFORE (193 items,     AFTER (283 items,
                          no new sources)        +9 sources, Tier 1 ON)
Subject coverage          52%                    61%
Geography coverage        33%                    34%
No signal                 48%                    39%
Single candidate          46%                    55%
Multiple candidates       6%                     6%

Evidence distribution:
  title_keyword           49%                    28%
  rss_category             —  (29% of a          24%
                               different total)
  url_segment              —  (22%)               25%
  feed_category             0%                    22%   <- new
  title_prefix              0%                    1%    <- new (Bernama)
```

**Honest read — the gain is mostly from the new sources' inherent URL
signal, not the explicit Tier 1 flag on its own.** Isolated test with
`--no-tier1` (same 283-item corpus, `sourceKnownCategory` suppressed) shows
coverage *unchanged* at 61%/34% — because the new category feeds' URLs
already contain the category (`/category/ekonomi/feed/` matches Tier 2's
URL-path lookup regardless of the explicit `knownCategory` field). Verified
directly on a real Harian Metro Bisnes item: `Business` at 0.98 confidence,
evidence `[feed_category: "bisnes", url_segment: "bisnes"]` — Tier 1's real,
measurable contribution here is **higher confidence and explicit
provenance** (a `feed_category` entry that didn't exist before), not
additional raw coverage, for sources where URL and feed category happen to
agree. `title_keyword`'s share dropping from 49%→28% is the real health
signal ChatGPT asked to track — less reliance on content guessing, evidence
now genuinely spread across 4 types instead of 3.

Bernama's title-prefix mechanism verified working directly: `"World : ..."`
→ `geography_candidates: [{value: "World", confidence: 0.9}]`; `"General :
..."` → correctly produces **no** candidate (General is Bernama's real
catch-all, same as `mutakhir`/`utama` elsewhere — matches the
`STRUCTURAL_NOISE` exclusion principle).

**Known issue, not blocking:** `rss-bernama-bm` (Malay Bernama) returns
HTTP 500 via our fetch client (`lab/rss.js`'s `fetch()` with a custom
User-Agent) despite loading fine directly in a browser — possibly UA-
sensitive on Bernama's side. English Bernama works and already validates
the title-prefix mechanism; not investigated further in this pass.

## Recommended next step

Per ChatGPT: Sesi 3A.2 — audit this output further, target is *not* 100%
coverage but continuing to reduce `title_keyword` dependency. Then Sesi 3B
(Edition Classification) can begin.
