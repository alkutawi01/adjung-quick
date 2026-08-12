# Edition Architecture Model

Status: **ARCHITECTURE FREEZE — documentation only, no code, no migration.**
Sesi 1 of the re-ordered roadmap (see bottom). Supersedes
`docs/edition-taxonomy-model.md`'s two-layer sketch with a fuller model.
Decided 2026-08-12, in direct discussion between Izzat and ChatGPT.

## Why this changed again

Izzat's tradeoff, stated plainly and accepted: **a Malay-edition reader will
miss foreign-language stories even when they relate to Malaysia.** That's a
real cost, deliberately paid. ChatGPT's reasoning for accepting it: trying to
serve "all news + all languages + all editions + all taxonomy" at once
produces a mixed wheel, mixed ranking, no editorial identity, and creeping
complexity — Quick would drift into being a generic RSS reader instead of the
calm, directed reading experience it's meant to be. Cross-language discovery
for a single geography is deferred to a possible future "Cross-Edition
Discovery" feature — explicitly not v1. **MVP: a reader arrives at ONE
edition, not simultaneous access to the whole world's news at once — closer
to how reading an actual newspaper works.**

## The five-layer pipeline

```
Story Cluster
      │
      ▼
Story Understanding Layer      (renamed from "Universal Classification" —
      │                         same content, name change only: subject
      │                         signals, geography, entities)
      ▼
Edition                        (NEW — a first-class entity, not just a
      │                         language flag)
      ▼
Edition Classification          (per-edition placement: field, sub_field,
      │                         confidence, method — can genuinely differ
      │                         in substance between editions, not just
      │                         vocabulary)
      ▼
Edition Experience              (taxonomy + ranking_profile + layout
      │                         direction, etc. — Layer 3's "Edition
      │                         Preference" concept, now folded into the
      │                         Edition entity itself)
      ▼
Wheel                           (shows the current edition's taxonomy)
```

**Story Cluster** answers *what happened*. **Story Understanding** answers
*what kind of thing is this, and where/who does it involve* — language-
independent. **Edition** is now a first-class entity, not a language toggle.
**Edition Classification** answers *where does this land for THIS edition's
readers* — and this can be substantively different per edition, not a
translation of one universal answer. **Wheel** only ever reads the current
edition's resolved placement.

## What stays unchanged — do not refactor these

1. **RSS Engine.** `RSS → Parser → rss_items → story_clusters → Active Set`
   is untouched.
2. **Identity Layer.** Auth, `saved_stories`, `history_entries` — untouched.
3. **Reading UI Contract** — mostly untouched. One change: the Wheel is no
   longer "the Bidang wheel" showing a universal taxonomy; it's the
   **Edition Taxonomy Wheel**, reading whichever edition is active.
4. **Active Set** — stays ONE, 10 slots, Stable Spatial Slots. Completely
   unaffected by this pivot — Edition changes what's *labelled*, never how
   many slots exist or how release/refill works.

## What changes

### 1. Database shape (PROPOSAL ONLY — not migrated)

The `story_clusters` columns already live in production (`db/schema-classification.sql`,
run by Izzat 2026-08-12) assumed **one classification per story**. Under this
model that's wrong for `field`/`classification_status` specifically — a story
can resolve to a different `field` per edition (`Lebanon parliament vote` →
`Dunia` for ms-MY, `Politics` for en, `سياسة` for ar). Proposed shape:

```sql
-- Largely reusable AS-IS — these are Story Understanding signals, not
-- per-edition placement, so they don't need to move:
story_clusters.subject_candidate       -- keep (Story Understanding)
story_clusters.geography_candidate     -- keep (Story Understanding)
story_clusters.classification_ruleset_version  -- keep

-- No longer fits as single columns on story_clusters — these are
-- PER-EDITION, need to move to a new table:
story_clusters.field                   -- move
story_clusters.classification_status   -- move
story_clusters.classification_method   -- move
story_clusters.classification_rule     -- move
story_clusters.classification_confidence -- move

-- Proposed new table (NOT created):
edition_story_classifications (
  story_id     REFERENCES story_clusters(id),
  edition_id   REFERENCES editions(id),
  field        TEXT,
  sub_field    TEXT,
  confidence   NUMERIC(4,3),
  method       TEXT,
  PRIMARY KEY (story_id, edition_id)
)

-- Proposed new entity (NOT created):
editions (
  id               TEXT PRIMARY KEY,  -- 'ms-my', 'en-global', 'ar'
  direction        TEXT,               -- 'ltr' | 'rtl'
  taxonomy         JSONB,              -- or reference to a taxonomy table
  ranking_profile  JSONB,              -- e.g. Malaysia-first / Global-first
  layout           JSONB               -- future: layout hints
)
```

**Tension resolved, 2026-08-12 (ChatGPT, confirmed my reconciliation).**
`docs/universal-classification-model.md`'s "read-time, not precomputed" lock
applied to the *decision logic*, not necessarily the *result*. ChatGPT walked
back "pure read-time resolver" as too idealistic for production scale (191
items now, but not forever — thousands of clusters × multiple editions ×
real-time ranking would mean redoing classification on every Wheel render).
Correct framing: `edition_story_classifications` is a **derived editorial
classification cache** ("materialized edition view"), not hand-set truth and
not a live per-request computation either. When an edition's ruleset version
changes, affected editions get **recomputed**, not manually edited row by row
— the `classification_ruleset_version` mechanism is exactly the recompute
trigger.

**Classification Ownership principle (LOCKED):**

```
Story Understanding  → system-owned, language-independent  (the facts)
Edition Classification → edition-owned, derived              (how it's seen)
Wheel                 → presentation-only                    (what's shown)
```

This answers "who owns a category?" cleanly: facts about a story live in
Story Understanding; how an edition chooses to place it lives in Edition
Classification; the Wheel never owns anything, it only renders.

Refined `edition_story_classifications` shape (still PROPOSAL, not created):

```sql
edition_story_classifications (
  story_id              REFERENCES story_clusters(id),
  edition_id             REFERENCES editions(id),
  field                  TEXT,
  sub_field              TEXT,
  classification_method  TEXT,
  classification_rule    TEXT,
  confidence              NUMERIC(4,3),
  ruleset_version         TEXT,
  created_at              TIMESTAMPTZ,
  PRIMARY KEY (story_id, edition_id)
)
```

`ruleset_version` isn't just an audit trail — it's what answers "why was this
story Politik yesterday and Dunia today?" (*"kerana edition ms-MY ruleset v2
digunakan"*) and what triggers batch recomputation when an edition's mapping
rules change, rather than manual per-story edits.

### 2. Edition becomes explicit in onboarding/preferences

Old: a multi-select "which languages do you read" (`selectedLanguages`,
already implemented for Representation selection).

New: a primary single-select **"Choose your edition"** (Melayu / English /
العربية) — determines taxonomy, ranking profile, and layout direction — with
"reading languages" (which language Representations are acceptable) becoming
a secondary, separable preference underneath it. This touches the already-
built Identity Layer's onboarding flow — **not re-opened yet**, flagged for
Sesi 7 (Language/Edition switching).

### 3. RTL is now a real, first-class UI concern

Arabic edition needs the Wheel (and likely other chrome) mirrored — noted as
new Sesi 6 scope, not previously tracked anywhere in the Core Reading UI
Contract.

## Edition Display Transformations (LOCKED framework, 2026-08-12)

Resolves the Arabic Culture/Entertainment contradiction and the ms-MY
Economy/Business question with one reusable mechanism instead of ad hoc
per-case decisions. Four transformation types, applied at the Edition
Classification layer — **never at Story Understanding**, which always keeps
the full, un-merged subject list:

1. **Merge** — multiple universal subjects collapse to one edition display
   term. *`Business + Economy` → ms-MY `Bisnes`.*
2. **Split** — one universal subject expands to multiple edition entries.
   (Not used yet in v1, but the mechanism stays available — e.g. a future
   edition splitting `Culture` into finer categories.)
3. **Rename** — same subject, edition-appropriate label. *`Entertainment` →
   `Hiburan` (ms-MY) / `ثقافة وفنون`-as-part-of (ar).*
4. **Hide** — a universal subject exists but a given edition simply doesn't
   surface it as a Wheel entry (e.g. `Lifestyle` not yet drafted for ms-MY).

**Principle: Edition merge ≠ Universal merge.** A display-layer merge never
deletes the underlying distinction. `field: Business` and `field: Economy`
both still exist as facts about a story; only the ms-MY *Wheel* shows one
`Bisnes` entry for both.

### Locked v1 transformations

| Universal | ms-MY display | English display | Arabic display |
|---|---|---|---|
| Business + Economy | **Merge** → `Bisnes` | Rename ×2 → `Business`, `Economy` (kept separate — Guardian's real nav splits them) | Rename → `اقتصاد` (Arabic sources show no real split either) |
| Culture + Entertainment | Rename ×2 → `Budaya`, `Hiburan` (kept separate — ms-MY editorial call, Izzat's ruling) | Rename ×2 → `Culture`, `Entertainment` (BBC keeps both) | **Merge** → `ثقافة وفنون` (conservative v1 choice — stronger evidence from BBC Arabic + AJ Arabic; Al Araby's contradicting evidence noted but not followed, see below) |
| Health + Science | Rename ×2 → `Kesihatan`, `Sains` | Rename ×2 → `Health`, `Science` | **Merge** → `صحة وعلوم` (BBC Arabic evidence) |

**On the Al Araby contradiction specifically:** deliberately NOT resolved by
majority vote — "taxonomy edition bukan masalah statistik semata-mata, ia
editorial identity" (ChatGPT). The real question is which real outlet Quick's
Arabic edition wants to resemble, not which pattern has more votes. `ثقافة
وفنون` is the v1 choice because it has support from the two largest/most
comparable reference outlets and keeps the Arabic Wheel simpler — but this is
an editorial choice being made *knowingly*, and could reverse if Izzat prefers
Al Araby's more granular model.

### Human Rights (AJ English) — confirmed as Attribute, not Subject

Cross-cuts too many subjects (Politics, Crime, Conflict, Law) to be one
Subject. Lives in the Event/Attribute dimension as `Humanitarian` (already
in `universal-classification-model.md`'s attribute list).

## Document audit

| Document | Status | Why |
|---|---|---|
| `docs/classification-taxonomy-mapping.md` | **STAYS** | Evidence/findings (15% subject-signal coverage, geography≠subject, 24 Adjung Bidang don't fit news) are still exactly right and are *why* this whole pivot happened. |
| `docs/quick-bidang-taxonomy.md` | **NEEDS UPDATE** | Its 15-Bidang list is good raw material for the `ms-MY` edition's taxonomy (already re-confirmed 13/15 in `ms-my-edition-reaudit.md`), but needs re-framing under Edition-as-entity, not treated as a semi-universal draft anymore. |
| `docs/classification-evidence-model.md` | **NEEDS UPDATE** | Built around a single `field` column and single-classification-per-story assumption. Core evidence-model principles (raw vs. derived, confidence-from-evidence, precision-over-coverage) still hold; the schema section needs replacing with the per-edition table above. |
| `docs/universal-classification-model.md` | **NEEDS UPDATE (rename)** | Content (15 subjects, Geography dimension, Event/Attribute dimension) is sound and becomes the Story Understanding Layer — needs renaming throughout, not rewriting. |
| `docs/edition-taxonomy-model.md` | **OBSOLETE** | Its two-layer sketch (Universal → Edition Resolver → Wheel) is superseded by this document's five-layer model with Edition as a first-class entity. Superseded-by note added, kept for history. |
| `docs/edition-mapping-matrix-en-ar.md` | **STAYS as evidence** | The actual corpus evidence (AJ Arabic categories, Guardian desks) is real and reusable for Sesi 2 (Edition Taxonomy Design) — just needs to feed the new process rather than the old flat matrix. |
| `docs/ms-my-edition-reaudit.md` | **STAYS as evidence** | Its 13/15 mapping and the Malaysia/Dunia-are-geography finding both hold and directly informed this pivot. |
| `docs/edition-taxonomy-v0.1.md` | **OBSOLETE** | Built just before this pivot landed; its master table is useful raw material for Sesi 2 but the document's own framing (simple resolver, no Edition entity) is superseded. |
| `classification/benchmark-labels.json` | **OBSOLETE for re-use** | Labelled against a single flat taxonomy. Sesi 4 (Benchmark redone) re-labels asking "field for ms-MY? field for en? field for ar?" per story — this file doesn't extend, it gets redone with a different shape. |
| `classification/benchmark.mjs` | **NEEDS UPDATE** | Scoring logic assumes one `field` per story; needs to score per-edition once Sesi 4 starts. Not touched now. |
| `classification/boundary-review-round2.md` | **PAUSED, not obsolete** | The 49 cases are real disputes, but several were artifacts of forcing English/Arabic wire stories into an ms-MY-shaped flat taxonomy — expect a meaningful chunk to resolve automatically once editions separate. Re-examine after Sesi 2, don't discard. |
| `db/schema-classification.sql` | **PARTIALLY SUPERSEDED, already live** | Already run in production. `subject_candidate`/`geography_candidate`/`classification_ruleset_version` remain valid as Story Understanding columns. `field`/`classification_status`/`classification_method`/`classification_rule`/`classification_confidence` need a follow-up migration proposal moving them to the per-edition table — **not executed**, just flagged. The existing columns aren't wasted; nothing needs rolling back. |
| `docs/roadmap-10-sessions.md` | **NEEDS UPDATE** | Replace with the reordered roadmap below. |
| `docs/core-reading-ui-contract.md`, `docs/keyboard-interaction-contract.md` | **STAYS, minor update flagged** | Wheel behaviour contract itself is unaffected; add a note that Wheel content = current edition's taxonomy, and flag RTL as new unscoped work for Sesi 6. |
| `docs/identity-*.md` | **STAYS, minor update flagged** | Auth/Save/History mechanics unaffected. Onboarding's language-selection UX needs revisiting once Sesi 7 (Language/Edition switching) is designed — not now. |

## Roadmap — replaces `docs/roadmap-10-sessions.md`

| Sesi | Focus | Output |
|---|---|---|
| 1 | **Architecture Migration** (this doc) | Architecture freeze. No code. |
| 2 | Edition Taxonomy Design | **DONE, see `docs/sesi2-edition-taxonomy-design.md`.** Bottom-up from 8 real reference outlets' actual navigation. |
| 2.5 | **Source Feed Discovery & Source Registry Upgrade** — pulled forward 2026-08-12 | Triggered by Izzat's discovery that Harian Metro (and, verified, Utusan/Kosmo) publish separate RSS feeds per section — Quick was only ingesting each source's general mixed feed. This is an input-quality problem, more fundamental than classification: "classifier lemah kerana RSS tiada desk" turned out to actually be "kita ambil feed yang salah." Output: `docs/category-feeds-discovery.md` findings formalized into a Source Registry v2 (audit only — enumerate every source's available category feeds + declared category) and a **Source Evidence Priority** order: publisher-declared category feed > URL category path > RSS `<category>` tag > content rules > Unclassified. No production/`sources.js` change yet — audit first. |
| 3 | Classification Engine v2 | `story → signals → edition classifier → edition placement`, replacing the single `story → field` model. Now informed by Sesi 2.5's evidence priority. |
| 4 | Benchmark, redone | Re-label the 190-item corpus per-edition, not globally |
| 5 | Production Ingestion | RSS → source desk → rules → confidence, now edition-aware |
| 6 | UI Adaptation | Wheel reads current edition's taxonomy; RTL layout for Arabic |
| 7 | Language/Edition Switching | Edition switch vs. Representation switch, memory/state behaviour |
| 8–10 | Polish | Search, History, Sponsor, analytics, production hardening |

Real-device Reading UI acceptance (the old Sesi 4) and Save/Login (old Sesi 4)
move later in this ordering — architecture correctness now takes priority
over feature completion, consistent with how the whole classification effort
has been sequenced since Sesi 1 started.
