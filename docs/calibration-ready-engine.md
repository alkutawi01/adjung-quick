# Calibration-Ready Engine (Sesi 3C follow-up, 2026-08-12)

Status: **Mental-model correction + one concept note, no code/schema
change beyond what already exists.** Triggered by Izzat's question about
whether the classification engine can "learn" — answered by ChatGPT:
not auto-learning like AI, but the architecture must support a
correction loop being added later **without a rebuild**. This document
records what that requires and confirms most of it is already in place.

## Mental model

Not: `Classification Engine that is finished.`
But: `Classification Engine v1 + Calibration Framework.`

Not auto-learning:

```
RSS volume increases → system automatically gets smarter
```

A real, human-in-the-loop calibration loop:

```
RSS volume increases → mistakes accumulate → editor corrects →
weight/rule/model gets updated → classification improves
```

This is the same discipline as `docs/evidence-policy-v1-decision.md`'s
"editorial calibration loop, not machine learning" — extended forward:
this document is about making sure *future* calibration rounds (against
production RSS, post-launch) don't require re-architecting anything.

## Three requirements, per ChatGPT — status check

### A. Classification Decision Log (audit trail) — ALREADY DONE

`db/schema-classification.sql` already stores everything ChatGPT's
worked example asked for: raw `categories` (evidence preservation),
`classification_method`, `classification_rule`,
`classification_confidence`, `subject_candidate`/`geography_candidate`
(both candidates retained, not just the winner), and
`classification_ruleset_version`. No change needed — confirmed already
satisfies this requirement.

### B. Editorial Correction Queue — CONCEPT ONLY, no UI/code yet

Per ChatGPT: not needed for MVP (would slow Quick's launch), but the
*concept* must be named now so it doesn't get designed as an
afterthought:

```
future: editor corrections → calibration dataset
```

When built (post-launch, not now): an editor flags/corrects a story's
classification. That correction is stored as data — **never** applied
as an immediate rule change. Per ChatGPT's explicit warning: if 100
editors correct `mahkamah != Crime`, the wrong move is auto-generating
`if title.includes("mahkamah") reject Crime` — that's the same
keyword-whack-a-mole trap this whole calibration arc deliberately
avoided (`docs/evidence-calibration-report.md`'s false positive
catalogue, kept as reference, not acted on automatically). The right
move: corrections accumulate into a dataset, a human periodically reviews
the pattern (the same Batch-A/M/U/Medium adjudication methodology,
repeated against production data), and only then are
rules/evidence-weights revised — deliberately, not automatically.

No schema, table, or UI designed here. This section exists so the
concept has a name and a place in the docs before UI/UX work starts, not
because it's being built now.

### C. Ruleset versioning — ALREADY DONE

`classification_ruleset_version` already exists in
`db/schema-classification.sql`, already incremented through this
session's work (v1.0.0 → v1.3.0 across the classification engine
changes). Nothing further needed — continue incrementing it as the
engine's frozen files are eventually revised in a future calibration
round.

## What this means for UI/UX (starting now)

Per ChatGPT, three things to carry forward into UI/UX design without
building them yet:

1. **Confidence-aware ranking is a backend requirement**, not a user-
   facing display. Two stories in the same Bidang with different
   evidence quality should not rank equally in Active Set selection.
   Already locked as a requirement in
   `docs/evidence-policy-v1-decision.md` §8 — repeated here because it
   affects ranking/Active Set work coming up in UI/UX, not just the
   classification engine.
2. **`Unclassified` is not a dead end** — it means "available evidence
   isn't strong enough yet," not "this story is broken." Worth keeping
   in mind if/when an editorial dashboard surfaces classification status
   later — Unclassified stories are a queue, not an error log.
3. **Don't discard the evidence trail** — already satisfied by the DB
   schema (§A above); noted here as a reminder not to accidentally drop
   it while building UI-facing data models on top.

## Explicitly out of scope

- No editorial correction UI or backend endpoint built.
- No automatic rule-generation from corrections — explicitly rejected as
  an approach, not just deferred.
- No changes to `db/schema-classification.sql` — it already satisfies
  the audit-trail and versioning requirements.

## Next

UI/UX Phase 1 (per ChatGPT's proposed sequencing): Product Contract
Validation (Wheel behavior, Active Set 10-slot, swipe replacement,
reading flow, Brief view, language/edition switching) — the parts users
directly feel. Then Phase 2 (Edition Experience — taxonomy-aware, not
translation-only) and Phase 3 (Ranking + Editorial Layer — where
confidence-aware ranking and, eventually, the Editorial Correction Queue
concept from §B actually get built).
