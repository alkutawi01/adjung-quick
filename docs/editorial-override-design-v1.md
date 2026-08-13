# Editorial Override Design v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Design document. No schema created, no code written.**

Fasa 2.4 in `docs/roadmap-to-production-v1.md`, added by ChatGPT with a
single framing question that has to be answered before any editorial
dashboard is built:

> **"Kalau editor tidak setuju dengan keputusan AI, apa jalan keluar?"**

Right now the answer is: *there isn't one.* The flow is `RSS → AI →
Reader`, with no point at which a human can disagree. Everything below
is about designing that missing step — deliberately **before** building
the dashboard that would expose it, so the dashboard implements a
decided model rather than inventing one.

---

## 1. The constraint that shapes everything

`db/classify-production.js --write` **truncates
`edition_story_classifications` on every run** and fully regenerates it
(verified in the code, and the truncate exists for a real reason — an
earlier bug left 2595 stale rows when only 867 were valid).

**Therefore: an override can never be stored as an edit to that table.**
The next re-classification would silently destroy every editorial
decision, with no error and no trace. An editor would correct the same
story repeatedly and never understand why it kept reverting.

This is not a limitation to work around — it's the correct shape,
and it forces the right architecture:

```
Classifier output  (regenerated, disposable, machine-owned)
        +
Editorial overrides  (durable, human-owned, never auto-written)
        ↓
   What the reader actually sees
```

Overrides live in their **own table**, are applied **on top of**
classifier output at read time, and survive re-classification by
construction.

---

## 2. Four override types, and what each really means

ChatGPT named four. They are not variations of one thing — they differ
in scope, in which layer they touch, and in how dangerous they are.

| Override | Scope | Layer it corrects | Reversible |
|---|---|---|---|
| **Reclassify** | one story, one edition | Classification (which Bidang) | Yes |
| **Hide story** | one story, one edition | Visibility | Yes |
| **Promote story** | one story, one edition | Ranking | Yes |
| **Suppress source** | one source, all editions | Ingestion/trust | Yes |

### 2.1 Reclassify — "this story is in the wrong Bidang"

Per-edition, never global. A single story legitimately resolves to a
*different* field in each edition — that's the entire point of the
Edition Architecture, not an anomaly. So an editor correcting `ms-MY`
must not silently change `en-global`.

### 2.2 Hide story — "this shouldn't be shown at all"

Distinct from reclassify: the story isn't misfiled, it shouldn't be
there. Non-news content, duplicate slipping past clustering, a
correction notice.

Must **not** be implemented as deletion. The story stays in the
database, flagged; deletion would mean the next ingestion re-adds it and
the editor fights the same story forever.

### 2.3 Promote story — "this matters more than the ranking thinks"

This is the one that touches the Ranking Engine, and the most
constrained. The Active Set has 10 fixed slots with Stable Spatial
Slots — a promote is not "add an 11th", it displaces something.

Open question, deliberately not answered here: **does a promote pin the
story to a specific slot, or just boost its score?** Pinning fights the
ranking engine; boosting cooperates with it. This needs a decision
before implementation, and it should be made with the Ranking Engine's
own composition logic in view, not separately.

### 2.4 Suppress source — "this source is doing harm"

The blunt one. Not per-story and not per-edition — suppressing a source
affects every Bidang and every edition at once.

Real precedent already in the project: `rss-rtm-sukan` and
`rss-rtm-ekonomi` publish non-sports/non-economy content under
category-labelled feeds, so their Tier 1 `source_known_category`
evidence fires wrongly (`docs/known-issues.md` §3). An editor watching
that happen daily needs *some* lever.

But it needs graduated options, not one switch:

| Action | Effect |
|---|---|
| Suppress `knownCategory` only | Keep the source's stories; stop trusting its self-declared category |
| Lower trust score | Source still competes, but ranks weaker |
| Suppress entirely | No stories ingested at all |

The RTM case needs the *first* option, not the third — the stories
themselves are fine, only the category claim is wrong. A design offering
only "on/off" would push an editor toward deleting a legitimate source.

---

## 3. The rule that must not be broken

**An override corrects one story. It never becomes a rule.**

This is the project's existing, hard-won discipline applied to a new
layer — `docs/calibration-ready-engine.md` already establishes that
corrections never auto-apply as classifier rules, and this session's own
calibration work followed it (evidence gathered → reviewed → applied
deliberately, never automatically).

So: 100 editors reclassifying 100 stories from Sukan to Bencana must
**not** silently retrain anything. What it should do is **surface the
pattern**:

> "23 stories from `rss-rtm-sukan` were manually reclassified out of
> Sukan this week. Review this source?"

That's an input to a deliberate calibration decision — the same
`observe → understand → decide → change` sequence the whole post-launch
phase runs on. Turning override volume directly into classifier
behaviour would be exactly the "auto-fix" ChatGPT warned against.

---

## 4. What an override record has to carry

Enough to answer, months later, *why* a story looks the way it does:

```
story_id        which story (TEXT — story_clusters.id is TEXT, not UUID)
edition_id      'ms-MY' | 'en-global' | 'ar-global'   (NULL for source-level)
source_id       for suppress_source only
override_type   reclassify | hide | promote | suppress_source
new_field       for reclassify
reason          free text — required, not optional
created_by      which editor
created_at      when
expires_at      nullable — see §5
active          soft-delete, so an undo is auditable rather than erasing history
```

**`reason` is required.** An override without a recorded reason is
indistinguishable from a mistake six weeks later, and this whole system
exists to make editorial judgment legible, not just enforceable.

---

## 5. The question this design does NOT answer

**Do overrides expire?**

There is a real tension, and it should be decided by Izzat rather than
assumed:

- Adjung Quick's content is short-lived — news has roughly a week of
  life, and all reader-saved data already auto-expires by design
  (`project_adjung_quick_identity_decisions`). An override on a
  story nobody will ever see again is dead weight.
- But a *source-level* suppression is not story-shaped at all. It should
  persist until deliberately revoked. Expiring it silently would
  re-enable a source an editor deliberately switched off.

Proposed (not decided): **story-level overrides expire with the story;
source-level overrides never expire.** Needs Izzat's confirmation.

---

## 6. What is deliberately NOT designed here

- The dashboard UI (Fasa 3 — this document defines what it must express)
- Roles/permissions (Fasa 3)
- Anything about auto-applying overrides back into the classifier (§3 —
  explicitly rejected)
- The promote-pins-vs-boosts decision (§2.3 — flagged, not resolved)

## 7. Why this is written now, in Fasa 1

It isn't Fasa 1 work — it's Fasa 2.4, written early because it's pure
design with no production impact, and because Fasa 1's observation
period is time-bound rather than effort-bound.

**It must not be implemented before Fasa 1's observation concludes.**
Some of what an editor would want to override is exactly what
`docs/observation-conclusion-v1.md` is measuring — building override
tooling first risks designing around problems the data may show don't
exist.
