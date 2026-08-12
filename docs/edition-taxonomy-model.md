# Edition Taxonomy Model

Status: **LOCKED direction, design in progress.** Supersedes the single-taxonomy
assumption in `docs/quick-bidang-taxonomy.md` and the "Politik is global at the
display layer" part of `docs/classification-evidence-model.md`'s language
collision resolution. Confirmed by Izzat 2026-08-12.

## What changed and why

Izzat's original instruction, restated and clarified 2026-08-12: language in
Quick isn't a translation toggle. **Each language is a different editorial
edition, with a different taxonomy, because it serves a different reading
experience:**

- **Bahasa Melayu** → should feel like reading a Malaysian news portal
  (Utusan/Kosmo/Metro-style): Utama, Politik, Semasa, Jenayah, Ekonomi, Sukan,
  Hiburan, Kesihatan, Pendidikan, Teknologi, Agama, Dunia. Focus: what's
  happening in Malaysia, what matters to Malaysian society, international news
  that matters *to a Malaysian reader*.
- **Bahasa Inggeris** → should feel like an international wire (CNN/Reuters/BBC
  style): World, Politics, Business, Technology, Science, Climate, Health,
  Culture, Sports, Entertainment. Focus: global affairs, geopolitics,
  international coverage.
- **Bahasa Arab** → should feel like a pan-Arab outlet (Al Jazeera style):
  سياسة، اقتصاد، رياضة، علوم وتكنولوجيا، ثقافة، مجتمع، الشرق الأوسط، العالم.
  Focus: the Arab world, the Middle East, regional geopolitics.

This resolves the earlier "language-scoping collision" (recorded in
`classification-evidence-model.md`) more precisely than the fix agreed there.
That fix treated `Politik` as a single global Bidang and punted reader
relevance to an unbuilt future filter. The real answer: `Politik` was never
meant to be one universal display category at all — it's the *ms-MY edition's*
name for a category whose English-edition counterpart is `Politics` (broader,
global scope) and whose composition genuinely differs by edition.

## Two layers — never conflate them

```
RSS Story
    │
    ▼
Story Cluster                    (ONE per story — O-012 unaffected)
    │
    ▼
Universal Classification         (language-independent, engine-facing)
    ├── subject: Politics
    ├── geography: Lebanon
    └── entities: [...]
    │
    ▼
Edition Resolver                 (per reader language/edition)
    ├── ms-MY → display field: Dunia      (reason: international politics)
    ├── en    → display field: Politics   (reason: political event)
    └── ar    → display field: سياسة
    │
    ▼
Wheel                            (shows the resolved display field)
```

**Layer 1 — Universal Classification.** Attached to the Story Cluster, ONE
value set, language-independent. This is what the classification engine
(Sesi 1's actual deliverable) produces: `subject`, `geography`, `entities`.
Candidate universal subjects: Politics, Crime, Economy, Sports, Science,
Technology, Environment, Disaster, Health, Education, Culture, Entertainment.
**Never shown to the reader directly.**

**Layer 2 — Edition Taxonomy.** A per-language mapping from universal signal to
a display Bidang, in that edition's own vocabulary and boundaries. The Wheel
reads *this*, not Layer 1.

## What stays locked

- **Story Cluster identity stays singular.** Not `Story Cluster { ms_field,
  en_field, ar_field }` — that was explicitly rejected as over-complicating the
  model.
- **Active Set stays singular** (O-012). Language selects an editorial view via
  the Edition Resolver, exactly the way it already selects a language
  Representation — it does not fork the Active Set or reclassify the story.
- **Universal Classification is computed once**, per Story Cluster, not per
  edition.

## Consequence: sub-Bidang question reframed

The earlier "does Politik need sub-Bidang" question (73/190 in the flat
sample) was really an edition question in disguise. In the `ms-MY` edition,
`Politik` may legitimately split into `Malaysia` / `Dunia` — but in the `en`
edition, `Politics` can stay one global category, because an international-wire
reader expects that. This is edition-specific taxonomy design, not a universal
sub-field mechanism — the Field/Sub-field/Attribute layers documented in
`quick-bidang-taxonomy.md` may still apply *within* an edition, but the
decision of whether to split now belongs to each edition's taxonomy design, not
one universal answer.

## Status of prior work

- `docs/quick-bidang-taxonomy.md`'s 15-Bidang list (Politik, Jenayah, Ekonomi,
  Bisnes, Sukan, Alam Sekitar, Bencana, Kesihatan, Pendidikan, Teknologi,
  Sains, Budaya, Hiburan, Malaysia, Dunia) is a strong **draft of the `ms-MY`
  edition taxonomy** — not a universal Quick taxonomy. Keep it, relabel its
  role.
- The 190-item benchmark corpus mixed sources of all three languages and
  classified everything into one flat taxonomy. That labelling assumed the now-
  superseded single-taxonomy model, so a meaningful share of it needs
  rework — expect items redistributing rather than the label itself being
  "wrong."
- Round 2 (Subject Boundary review, 49 cases) is **paused**, per Izzat's
  explicit choice, until the Edition Taxonomy Model is designed — several of
  those 49 disputes were symptoms of forcing English/Arabic international
  stories into an ms-MY-shaped taxonomy, and should resolve differently once
  editions separate.

## Open design questions (not yet resolved)

1. What are the `en` and `ar` edition taxonomies, concretely? ChatGPT proposed
   drafts above — need the same evidence-based mapping-matrix treatment the
   `ms-MY` taxonomy got (`docs/classification-taxonomy-mapping.md`), run
   against the actual English/Arabic corpus.
2. Universal Classification's subject list (Politics, Crime, Economy, ...) —
   is it exactly the union of all three editions' subjects, or a smaller
   fixed set that each edition maps *down* from? Affects how much the Edition
   Resolver has to do.
3. Where does the Edition Resolver live — computed at read time (like
   Representation selection already is), or precomputed per edition at
   classification time? Read-time keeps Layer 1 the only stored truth;
   precompute is faster but risks staleness if edition mapping rules change.
4. How does `SWITCH_LANGUAGE` interact with the Wheel's current selected Field?
   If a reader is in `Politik` (ms-MY) and switches to English, is there a
   natural resolved equivalent (`Politics`), or does the wheel reset to a
   default?
