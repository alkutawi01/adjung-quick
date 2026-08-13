# Editorial Override Data Model v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Contract document. No schema created, no code written.**

Per ChatGPT: lock the data model *before* any database schema exists, so
the schema implements a decided contract rather than discovering it.
Follows `docs/editorial-override-design-v1.md` (the "why"); this is the
"what exactly".

---

## 0. CORE INVARIANT

ChatGPT named this, then explicitly raised it from "architecture rule"
to **core invariant** — because it will protect far more than overrides:
editor notes, user reports, fact-checking, legal takedowns. None of
those can ever live inside a table the pipeline regenerates.

> **Generated Data ≠ Editorial State**
>
> A table produced by the pipeline can never be the place human
> decisions are stored.

```
edition_story_classifications     editorial_overrides
   (generated, truncated,            (human decisions,
    machine-owned)                    durable, never auto-written)
              \                      /
               \                    /
            Final Editorial State (read layer)
```

Grounded in a verified fact, not a preference:
`db/classify-production.js --write` truncates
`edition_story_classifications` on every run. Storing an override there
would destroy it silently on the next re-classification.

---

## 1. Two record types, deliberately NOT one table

Story overrides and source overrides differ in lifecycle, scope, and
expiry. Forcing them into one table would mean nullable columns that
only make sense for half the rows, and an expiry rule that's wrong for
one of them.

### 1.1 Story override

```
story_id        TEXT     — story_clusters.id is TEXT (clusterKey), never UUID
edition_id      TEXT     — 'ms-MY' | 'en-global' | 'ar-global' (exact values,
                           NOT 'en'/'ar' — see the corrected comment in
                           db/schema-edition-classification.sql)
override_type   TEXT     — 'reclassify' | 'hide' | 'boost' | 'pin'
new_field       TEXT     — reclassify only; must be valid in THAT edition's
                           own taxonomy, which differs per edition
reason          TEXT     — REQUIRED
created_by      TEXT     — editor identity
created_at      TIMESTAMPTZ
expires_at      TIMESTAMPTZ  — REQUIRED (see §2)
active          BOOLEAN  — soft delete; an undo stays auditable
```

Always per-edition. A story legitimately sits in a different Bidang per
edition — correcting `ms-MY` must never silently change `en-global`.

### 1.2 Source override

```
source_id       TEXT     — lab/sources.js id
override_type   TEXT     — 'ignore_category' | 'reduce_trust' | 'disable'
trust_override  NUMERIC  — reduce_trust only
reason          TEXT     — REQUIRED
created_by      TEXT
created_at      TIMESTAMPTZ
status          TEXT     — 'active' | 'retired'   (NOT expires_at — see §2)
review_date     DATE     — optional reminder, never auto-acts
```

Not per-edition: a source problem is a source problem everywhere.

The three levels exist because the real case demands it. `rss-rtm-sukan`
publishes non-sports content under a sports-labelled feed
(`docs/known-issues.md` §3) — the stories are fine, only the source's
self-declared category is wrong. That needs `ignore_category`, not
`disable`. A design offering only on/off would push an editor into
deleting a legitimate source.

---

## 2. Expiry rules — different by type, on purpose

| Type | Rule |
|---|---|
| Story override | **Must expire.** `expires_at` required. |
| Source override | **Never auto-expires.** Uses `status: active/retired`. |

**Story overrides expire** because news has a lifecycle (~a week here),
and the whole product already treats reader data as auto-expiring. Once
a story is gone from circulation, a correction pinned to it is dead
weight. After expiry, the classifier decides again — which is correct,
because by then the classifier may well have been recalibrated.

**Source overrides must not expire.** If an editor has determined that
`rss-rtm-sukan`'s category claim can't be trusted, and that silently
reverts 30 days later, a known-bad source quietly comes back to life.
As ChatGPT put it: source policy is *operational configuration*, not
temporary content. `review_date` may prompt a human to revisit — it must
never act on its own.

---

## 3. Precedence order

The part with real failure modes: what happens when overrides conflict,
or when an override contradicts the classifier. Resolution runs top
down; the first rule that applies wins.

```
1. Source disable          → story never enters the pool at all
2. Story hide              → story is not shown, whatever else says
3. Story pin               → forced into the Active Set
4. Story reclassify        → decides WHICH Bidang
5. Story boost             → competes more strongly, can still lose
6. Source ignore_category  → drops Tier 1 evidence before classification
7. Source reduce_trust     → lowers the trust input to scoring
8. Classifier output       → the default when nothing above applies
```

Three principles behind that ordering:

- **Restrictive beats permissive.** `hide` beats `pin`: an editor who
  hid a story and another who promoted it must not produce a promoted,
  visible story. The safe resolution is invisible.
- **Specific beats general.** A story-level reclassify beats a
  source-level category rule for that one story.
- **Human beats generated.** Any active override outranks classifier
  output — that's the entire point.

Conflict cases worth stating explicitly:

| Situation | Result |
|---|---|
| Story hidden **and** pinned | **Hidden.** Log the conflict for review. Worth stating plainly because it looks backwards at first glance — `pin` is the strongest *promotion*, but promotion never beats restriction. Editor A pins, Editor B hides → the story stays hidden. |
| Story hidden **and** reclassified | Hidden; the reclassify still records intent for when the hide expires. |
| Source disabled **and** a story from it pinned | Source disable wins — the story isn't ingested, so nothing to pin. |
| Two active reclassifies, same story+edition | Most recent `created_at` wins; the older stays visible in history. |
| Reclassify to a field that doesn't exist in that edition | Rejected at write time, not silently dropped. |

---

## 4. Audit trail

Every override answers, months later, *why does this story look like
this?*

- `reason` is **required**, never optional. An override without a
  recorded reason is indistinguishable from a mistake six weeks later.
- Undo is a soft delete (`active = false` / `status = 'retired'`), never
  a row deletion — reversing a decision must not erase that it happened.
- Overrides are **never written by any automated process.** Only a human
  action creates one. This is what makes the table trustworthy as a
  record of editorial judgment.

---

## 5. Overrides never train the classifier

Locked, per both `docs/calibration-ready-engine.md` and ChatGPT:

```
Override             →  immediate correction, one story
Aggregate overrides  →  a signal, surfaced to a human
Human decision       →  a deliberate calibration change
Calibration          →  a new classifier version
```

What must never exist is `editor correction → AI learns automatically`.
That path turns one unusual case into a global rule with nobody
deciding it. What the system *should* do is surface the pattern —
*"23 stories from `rss-rtm-sukan` were reclassified out of Sukan this
week. Review this source?"* — as input to the same
`observe → understand → decide → change` sequence the whole post-launch
phase runs on.

---

## 6. Where `boost` and `pin` enter the pipeline — RESOLVED 2026-08-13

This was raised as a contradiction rather than quietly decided, and
ChatGPT confirmed the correction.

### 6.1 `boost` is a scoring modifier

```
candidate scoring (+ editorial boost) → diversity selection → composition → Active Set
```

**Not** after diversity selection. Verified against the real code:
`selectDiverseCandidates()` (`ranking/diversity-selection.mjs`) picks
`capacity` (10) out of the whole pool, so anything applied afterwards
can only reorder survivors. A story ranked #15 could never be boosted
in — meaning the editor presses Promote, the system accepts it, and the
reader never sees any change. ChatGPT's own words for that outcome:
*"bug paling buruk."*

Worked example:

```
Story X before:  freshness 40 + trust 80 + diversity 70  →  score 65
Editorial boost: +20
Story X after:                                              score 85
   ↓ still passes through diversity selection
   ↓ still passes through composition
```

So the story **can rise, and can still lose.** A boosted story from an
over-represented source can still be held back by diversity selection.
Boost changes the probability; it does not bypass the system. It also
stays explainable — the boost appears as one more scoring reason
alongside freshness and trust.

### 6.2 `pin` is not a scoring modifier at all

```
Active Set = Pinned stories + Ranked selection
```

Putting `pin` into scoring would be wrong in principle, not just in
mechanics. An editor pinning a story is not claiming *"this scores
highly"* — they are saying *"this needs to be at the front regardless of
score."* National emergency, major government announcement, public
crisis.

That's why `pin` carries the strictest requirements: rare, audited,
mandatory expiry, and a required reason.

**Neither is implemented yet.** Per ChatGPT: the ranking pipeline
contract (`docs/ranking-engine-contract-v1.md`) must be updated to
reflect this before any code is written.

---

## 7. Not decided here

- Physical schema (column types, indexes, RLS) — after this contract is
  confirmed
- Dashboard UI — Fasa 3
- Roles/permissions — Fasa 3
- Whether `boost` has a magnitude or is a single fixed step — depends on
  §6 being resolved first
