# Story Understanding Engine — Spec (Sesi 3A)

Status: **SPEC ONLY — no implementation yet.** Per ChatGPT: audit the spec
first, implement only after. No Edition Classification, no database change,
no display field, no UI in this session.

## What Sesi 3A is NOT

Not "classify this story as Politik/Jenayah/Ekonomi." That's Edition
Classification (3B) — a different layer, resolved per-edition, later.
Terminology discipline matters here: use **detected / candidate / signal /
evidence**, never **classified** — the word itself signals which layer is
talking.

## What Sesi 3A IS

Turn raw RSS + source registry evidence into a set of **candidate signals**,
each carrying its own evidence and confidence, usable by *any* edition later.
Ambiguity is data, not a defect — a story genuinely torn between `Crime` and
`Politics` should say so, not get forced to one value early. Different
editions may legitimately resolve that ambiguity differently in 3B.

## Input audit

| Source | What it gives Sesi 3A | Status |
|---|---|---|
| `classification/benchmark-labels.json` | 190-item real corpus, still useful as reference examples, NOT ground truth for this layer (its labels are flat-model, single-value — a different shape than 3A produces) | existing |
| `lab/rss.js` | title, description, link, `categories` (parsed but historically dropped before persistence — `db/schema-classification.sql` already added `rss_items.categories TEXT[]` to fix this, migration run 2026-08-12) | existing, partially wired |
| `docs/source-registry-v2-audit.md` | which sources have publisher-declared category feeds (Harian Metro's 4 confirmed, Utusan/Kosmo's WordPress pattern) vs. URL-path-only sources (Astro Awani) | existing, Sesi 2.5 |
| Story Cluster model (`lab/engine.js`) | cluster identity — Sesi 3A operates per-item evidence first, aggregated to cluster level per the "evidence may come from any cluster member" ruling in `classification-evidence-model.md` | existing, unaffected |

## Output contract

```json
{
  "subject_candidates": [
    {
      "value": "Crime",
      "confidence": 0.72,
      "evidence": [
        { "evidence_type": "title_keyword", "value": "waran tangkap" },
        { "evidence_type": "source_category", "value": "mahkamah" }
      ]
    },
    {
      "value": "Politics",
      "confidence": 0.31,
      "evidence": [
        { "evidence_type": "entity", "value": "menteri" }
      ]
    }
  ],
  "geography_candidates": [
    {
      "value": "Malaysia",
      "confidence": 0.90,
      "evidence": [
        { "evidence_type": "source", "value": "Astro Awani Malaysia" }
      ]
    }
  ]
}
```

**Evidence provenance is mandatory per candidate** — not just a confidence
number, but exactly what produced it (`evidence_type` + `value`). Purpose:
when a benchmark fails later, the answer is *"why did it think Business?"*,
traceable to a specific rule — never "the engine was wrong" as an
unexplainable black box.

**Confidence is ranking strength, not a probability.** `0.83` does not mean
"83% likely true" — it means "stronger evidence than a lower-scored
candidate." Don't imply mathematical precision the evidence doesn't support.
This applies to *candidate* confidence specifically (Sesi 3A); *resolved*
confidence (3B, per-edition) is a separate number, per
`edition-classification-contract.md`'s two-confidence split.

## Evidence hierarchy (priority order, from Source Registry v2)

```
1. Publisher-declared category/feed   (Harian Metro's bisnes.xml, etc.)
2. URL structure                      (/berita-politik/, /ekonomi/)
3. RSS <category> tag
4. Entity detection                   (not designed in detail yet)
5. Title/description content rules
```

**Explicitly do not start by writing a large keyword list.** Source Registry
v2 found publisher-declared feeds may already carry substantial signal for
several sources — a big keyword ruleset written before that's reflected risks
being wasted work. Start from tiers 1–3 (what the source already tells us),
add tier 5 rules only where coverage gaps show they're actually needed.

## Test plan — coverage and ambiguity, NOT accuracy

"Accuracy" isn't measurable yet — there's no per-edition ground truth (that's
3B + a redone benchmark). What Sesi 3A *can* and must measure, against the
190-item corpus, purely as candidate-generation quality:

- **Subject candidate coverage** — % of stories that get at least one subject
  candidate at all (target ballpark: high, e.g. ~95%).
- **Geography candidate coverage** — same, for geography (~80%+ plausible
  given `classification-taxonomy-mapping.md`'s original 32% geographic-signal
  finding, now boosted by Source Registry v2's feed-level evidence).
- **Ambiguity rate** — split into: single-strong-candidate / multiple-
  candidates / no-signal-at-all. A healthy engine has a meaningful multiple-
  candidates bucket, not artificially forced down to zero.
- **Evidence source distribution** — % of candidates coming from feed vs. URL
  vs. RSS category vs. text rules. This is the key health metric: if text
  rules dominate, the engine is still over-relying on content guessing
  despite Source Registry v2's findings; if feed/URL dominate, the
  publisher-evidence strategy is working.

No "% correct" metric in this phase — that requires per-edition ground truth,
which doesn't exist until 3B and a redone benchmark.

## Explicitly out of scope for Sesi 3A

- Edition Classification (3B)
- Database migration (schema is already proposed in
  `edition-architecture-model.md`, not created)
- Display fields, UI, Wheel changes
- Large keyword/content-rule authoring — only as much as needed to see
  where the evidence hierarchy leaves real gaps

## Next

Spec awaits audit (Izzat/ChatGPT). Only after that does implementation of the
extraction pipeline begin, tested first against the 190-item corpus for
coverage/ambiguity/evidence-distribution — not correctness.
