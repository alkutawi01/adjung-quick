# Edition Classification Contract (Sesi 2.75 — Freeze)

Status: **CONTRACT FREEZE — documentation only, no SQL, no classifier rules.**
ChatGPT's checkpoint before Sesi 3: too many foundational layers changed in
Sesi 2/2.5 to start building a classification engine on a still-moving
contract. This document is what Sesi 3 is built against.

## Why this checkpoint exists

Sesi 2 and 2.5 produced several real architectural decisions in quick
succession: Universal ≠ Edition, Edition can merge/split/rename/hide
subjects, the source registry now carries editorial signal (not just raw
RSS), and that signal changes how much weight falls on content rules. Building
Classification Engine v2 before freezing all of this risks building the
engine against a contract that's still moving.

## 1. Story Understanding Layer — output contract

**Input:** a Story Cluster (already deduplicated/merged by the existing
clustering engine — unaffected by any of this).

**Output — multi-candidate, with evidence, NOT a single resolved value:**

```json
{
  "subject_candidates": [
    { "value": "Business", "evidence": "feed_category", "source": "hmetro-bisnes-feed" },
    { "value": "Economy",  "evidence": "content_rule",  "confidence": 0.4 }
  ],
  "geography_candidates": [
    { "value": "Malaysia", "evidence": "source_desk" }
  ],
  "entity_signal": [],
  "event_signal": [],
  "source_signal": [
    { "source": "Harian Metro", "feed": "bisnes.xml", "declared_category": "Business" }
  ]
}
```

**LOCKED — must NOT appear here:** `field`, `category`, `edition`. Those
belong entirely to Edition Classification. Story Understanding stays
multiple-candidates-with-evidence, never resolves to one answer — resolution
is an edition-specific act, not a universal fact.

**Ownership:** system-owned, language-independent. This is "the facts."

## 2. Edition Classification — output contract

**Input:** Story Understanding's candidate list + that edition's own rules
(the Edition Display Transformations table + edition-specific priority/
confidence weighting).

**Output — ONE resolved value per (story, edition):**

```json
{
  "story_id": "...",
  "edition_id": "ms-MY",
  "field": "Bisnes",
  "sub_field": null,
  "classification_method": "feed_category",
  "classification_rule": "hmetro.bisnes_feed -> Business -> ms-MY.Bisnes",
  "confidence": 0.97,
  "ruleset_version": "ms-my-v1"
}
```

**Ownership:** edition-owned, **derived** (materialized cache per the
Classification Ownership lock — recomputed on `ruleset_version` change, never
hand-edited row by row).

**Confidence is two different numbers, kept separate — don't conflate:**
- Story Understanding candidate confidence (how sure is the *signal itself* —
  e.g. a feed-category candidate is near-certain, a content-rule candidate is
  weaker).
- Edition Classification confidence (how sure is the *resolved display
  field* — combines candidate confidence with how clean that edition's
  merge/rename rule is).

## 3. Merge/Split/Rename/Hide — restated from `edition-architecture-model.md`

Applied only at Edition Classification, never at Story Understanding. Locked
v1 table (Business+Economy → ms-MY `Bisnes`; Culture+Entertainment and
Health+Science → Arabic merges; full table in
`edition-architecture-model.md`). Any edition's transformation set is data
(the `display_fields[].maps_from[]` shape below), not code branches:

```json
{
  "edition": "ms-MY",
  "display_fields": [
    { "label": "Bisnes", "maps_from": ["Business", "Economy"] },
    { "label": "Politik", "maps_from": ["Politics"] }
  ]
}
```

```json
{
  "edition": "ar",
  "display_fields": [
    { "label": "ثقافة وفنون", "maps_from": ["Culture", "Entertainment"] },
    { "label": "صحة وعلوم", "maps_from": ["Health", "Science"] }
  ]
}
```

## 4. NEW — Edition Relevance (PROPOSED, not implemented)

A question that hadn't surfaced explicitly until now: **does a story belong
in a given edition's Active Set at all**, independent of what field it would
resolve to if it did? Example: a flood in Kelantan clearly resolves to
`Bencana` for ms-MY — but should it appear in the Arabic edition's world at
all, filed under `العالم`, or should it simply not surface there?

This is **not classification** — it's a separate relevance-scoring concern
that sits before Edition Classification in the pipeline:

```
RSS → Story Understanding → Edition Relevance → Edition Classification → Ranking → Active Set → Wheel
```

Not designed in detail. Flagged so schema/engine work doesn't assume every
story appears in every edition once classified — that's a real product
question (does ms-MY-only news even reach the English/Arabic editions?) with
UX and Editorial Score implications, deferred to its own design pass.

## 5. Sesi 3 split (revises the single "Classification Engine v2" entry)

**Sesi 3A — Story Understanding Engine.** Builds the multi-candidate
extraction pipeline: source evidence (category feeds per
`source-registry-v2-audit.md`), URL-path signals, RSS `<category>` signals,
title/content signals. Output is candidates-with-evidence (§1 above) — never
resolves to `Bisnes`/`Politik`/`Dunia`.

**Sesi 3B — Edition Classification Engine.** Consumes 3A's output +
per-edition rules, produces the resolved `edition_story_classifications` row
(§2 above).

Reasoning for splitting: Source Registry v2 found that publisher-declared
category feeds may substantially reduce how much weight Tier-4 content rules
need to carry. Writing keyword-based content rules now, before that shift is
reflected in the engine design, risks wasted work.

## Document audit (supersedes the table in `edition-architecture-model.md`)

| Document | Status |
|---|---|
| `docs/edition-architecture-model.md` | STAYS — five-layer pipeline and Document Ownership principle still hold, this contract just formalizes the Story Understanding / Edition Classification boundary in implementable detail |
| `docs/source-registry-v2-audit.md` | STAYS — feeds directly into Sesi 3A |
| `docs/universal-classification-model.md` | STAYS as the Subject/Geography/Attribute vocabulary — renamed conceptually to "Story Understanding" per earlier decision |
| `docs/sesi2-edition-taxonomy-design.md` | STAYS — real navigation evidence feeds the `display_fields` tables above |

## Next

Once Izzat/ChatGPT confirm this contract, Sesi 3A begins — building the
Story Understanding candidate-extraction pipeline against real corpus data,
still no classifier rules or SQL migration until 3A's output shape is
validated against real stories.
