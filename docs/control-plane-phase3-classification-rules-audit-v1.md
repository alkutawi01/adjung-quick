# Backend Control Plane — Phase 3: Classification Rules Audit v1

Status: AUDIT ONLY. No code changed. Answers "what rule actually decided this
story's Kategori, right now, in production" — nothing here is a proposal.

## The pipeline, end to end

```
RSS item
  │
  ▼
lab/rss.js                          — attaches source.knownCategory to the item
  │
  ▼
classification/story-understanding.mjs  — understandStory()
  │   reads: URL path, RSS <category>, source.knownCategory, Bernama title
  │   prefix, title/description phrases
  │   produces: ranked subject_candidates[] + geography_candidates[]
  │   (does NOT assign a Kategori — evidence only)
  ▼
classification/edition-classification.mjs  — classifyForEdition()
  │   reads: the candidates above + this edition's rules/taxonomy
  │   produces: final { field, field_code, classification_status, confidence }
  │   RUNS SEPARATELY PER EDITION — same story can land in a different
  │   Kategori in ms-MY vs en-global vs ar-global.
  ▼
edition_story_classifications (DB) → Reader/Admin
```

Every file below is either an **evidence source** (feeds candidates into
story-understanding.mjs) or part of the **resolver** (turns candidates into
one final Kategori inside edition-classification.mjs). Nothing else in the
codebase currently has a say in which Kategori a story ends up in.

## Evidence sources (in tier order, per docs/story-understanding-engine-spec.md)

| # | Tier | File | What it holds | Size | Scope |
|---|------|------|----------------|------|-------|
| 1 | publisher_declared (0.75) | `lab/sources.js` — `knownCategory` field | Per-feed default Kategori, set once per RSS source | 29 sources have it set | Global (per-source, not per-edition) |
| 1b | publisher_declared (0.75) | `classification/lib/bernama-prefix.mjs` | `BERNAMA_PREFIX_MAP` (3: business/sports/sukan → subject), `BERNAMA_GEOGRAPHY_PREFIX` (2: world/dunia → geography). Parses Bernama's `"Desk: headline"` title format | 5 entries | Global, only fires on Bernama-shaped titles |
| 2 | url_path (0.90, highest) | `classification/story-understanding.mjs` — `deskFromUrl()` | Parses URL path segments, filters out numeric/long/hyphenated slugs, feeds each segment through desk-vocabulary | logic, not data | Global |
| 3 | rss_category (0.70) | RSS `<category>` tag, read directly from feed | Whatever the publisher put in the tag, matched through desk-vocabulary | n/a (publisher data) | Global |
| — | (lookup table shared by tiers 1–3) | `classification/lib/desk-vocabulary.mjs` — `SUBJECT_VOCABULARY` | Keyword/desk-string → Universal Subject (Politics, Crime, Economy, Business, Sports, Health, Education, Technology, Science, Environment, Culture, Entertainment, Religion, Lifestyle...) | ~75 entries, ms-MY + EN + AR | Global |
| — | (same file) | `desk-vocabulary.mjs` — `GEOGRAPHY_VOCABULARY` | Keyword/desk-string → Universal Geography (Malaysia, World, Middle East, Americas, Europe, Southeast Asia) | ~13 entries | Global |
| — | (same file) | `desk-vocabulary.mjs` — `STRUCTURAL_NOISE` | Tokens explicitly ignored (e.g. `terkini`, `berita`, `news`) — prevents noise from becoming a false candidate | ~14 entries | Global |
| 4 | entity (not implemented) | — | Documented in spec as a future tier, no code exists | — | — |
| 5 | title_keyword (0.40, lowest) | `classification/lib/content-rules.mjs` — `PHRASE_RULES` | Phrase (not single-token) matching over title+description for 6 subjects only: Crime, Disaster, Politics, Sports, Health, Environment | ~6–20 phrases per subject | Global. Deliberately kept small per spec — this is the tier most likely to false-positive, so it stays minimal by design |

**Confidence gate** — `classification/lib/confidence-policy.mjs`:
`DEFAULT_CONFIDENCE_POLICY.min_subject_confidence = 0.6`. If the top subject
candidate scores below this, the resolver falls back to a geography-based
placement instead of trusting a weak subject guess.
`SUBJECT_CONFIDENCE_OVERRIDES` lowers the bar to 0.35 for 3 subjects only
(Disaster, Environment, Health) — these tend to be under-signalled by the
vocabulary tables, so the global 0.6 bar was judged too strict for them.
No per-edition overrides exist (`EDITION_CONFIDENCE_POLICY_OVERRIDES` is
empty).

## The resolver — `classification/edition-classification.mjs` (`classifyForEdition()`)

This is the ONE place that turns candidates into a final answer. Runs once
per edition, in this exact order:

1. **Edition rules** (`classification/lib/edition-rules.mjs` —
   `evaluateEditionRules()`) — checked FIRST, wins over everything below if
   matched.
   - Currently exactly **1 rule exists**, ms-MY only:
     `foreign_politics_to_world` — condition: top subject = Politics AND top
     geography ≠ Malaysia → forces `display_field: 'Dunia'`.
   - en-global and ar-global have empty rule arrays — 0 rules for them today.
   - Example: a Reuters wire story about US Congress, tagged Politics by
     desk-vocabulary, geography = Americas → this rule fires → lands in
     Dunia, not Politik, for an ms-MY reader.
2. **Confidence gate check** — if step 1 didn't fire and top subject
   confidence < policy threshold → fall through to geography-residual
   placement (per-edition local/world label from
   `edition-taxonomy.mjs`'s `EDITION_GEOGRAPHY_RESIDUAL_LABEL`: ms-MY →
   Nasional/Dunia, en-global → null/World, ar-global → null/العالم).
3. **Default placement** (`edition-taxonomy.mjs` — `resolveDefaultPlacement()`)
   — walks `subject_candidates` in confidence order, returns the first one
   that has a `default_mapping` entry in this edition's taxonomy
   (`taxonomy-registry.mjs` — e.g. ms-MY's taxonomy merges Business+Economy
   subjects into one "Bisnes" field_code; ar-global merges Health+Science
   into "صحة وعلوم").
4. If nothing above produced a field → geography fallback again → else
   `classification_status: 'unclassified'`, `field: null`.

### Conflict resolution — what actually happens today

- **Edition rule vs. everything else**: edition rule always wins if its
  condition matches. No override mechanism exists.
- **Two evidence tiers agreeing on the same subject**: `aggregate()` in
  `story-understanding.mjs` does noisy-OR combination — multiple tiers
  pointing at the same subject reinforce its confidence, they don't fight.
- **Two evidence tiers disagreeing (different subjects)**: there is no
  arbitration step. `subject_candidates` is simply a ranked list, ties
  broken by tier order (url_path > publisher_declared > rss_category >
  title_keyword). The resolver only ever looks at the top-ranked candidate;
  lower-ranked disagreeing candidates are silently discarded, never
  surfaced to an Admin.
- **Two subjects merged into one Kategori by taxonomy** (e.g. ms-MY
  Business+Economy → Bisnes): not a conflict — this is intentional,
  encoded in `taxonomy-registry.mjs`'s per-field `subject_codes` array.

## What's missing today (the actual complaint this phase exists to fix)

Izzat's example:
```
URL /arena/         → Sukan       (this works — desk-vocabulary has 'arena': 'Sports')
URL /jenayah/        → Jenayah     (works — desk-vocabulary has 'jenayah': 'Crime')
URL /mutakhir/       → ?           (no entry anywhere — falls through to lower tiers or unclassified)
kata "PM"            → Politik     (does NOT work — no such phrase rule exists in content-rules.mjs)
kata "gempa"         → Bencana     (does NOT work — Disaster has no PHRASE_RULES entries at all; check content-rules.mjs's 6-subject list — Disaster is one of the 6, but "gempa" specifically isn't in it)
```

None of this is visible to an Admin today. Every table above (desk
vocabulary, geography vocabulary, structural noise, Bernama prefixes,
content phrase rules, edition rules, confidence overrides, source
knownCategory) lives in source code, requires a Claude Code edit + git push
+ Vercel redeploy to change, and has zero read surface in `/admin`.

## Explicitly out of scope for this audit (per ChatGPT's instruction)

- Attention Rules / Attention V2
- Pin automation
- Any generic rule-engine abstraction
- Ranking/scoring logic unrelated to category assignment (editorial_score,
  boost, diversity selection — untouched, not part of this map)

## Files referenced (for implementation-plan phase, not to act on yet)

- `lab/sources.js` (knownCategory)
- `classification/lib/desk-vocabulary.mjs` (SUBJECT_VOCABULARY, GEOGRAPHY_VOCABULARY, STRUCTURAL_NOISE)
- `classification/lib/bernama-prefix.mjs` (BERNAMA_PREFIX_MAP, BERNAMA_GEOGRAPHY_PREFIX)
- `classification/lib/content-rules.mjs` (PHRASE_RULES)
- `classification/lib/edition-rules.mjs` (EDITION_RULES)
- `classification/lib/confidence-policy.mjs` (DEFAULT_CONFIDENCE_POLICY, SUBJECT_CONFIDENCE_OVERRIDES)
- `classification/lib/edition-taxonomy.mjs` (resolveDefaultPlacement, EDITION_GEOGRAPHY_RESIDUAL_LABEL)
- `classification/lib/taxonomy-registry.mjs` (subject_codes merges — already DB-backed since Phase 2)
- `classification/story-understanding.mjs` (understandStory, deskFromUrl, aggregate)
- `classification/edition-classification.mjs` (classifyForEdition — the resolver)
- `docs/story-understanding-engine-spec.md` (5-tier evidence model, source of the tier order/confidence numbers used above)
