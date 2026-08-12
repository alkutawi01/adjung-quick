# Evidence Policy v1 (proposal, 2026-08-12 — NOT locked)

Status: **PROPOSAL only, per the active Calibration Freeze
(`docs/evidence-calibration-freeze.md`). No implementation, no code
change.** Synthesizes Batch A, Batch M, and Batch U's adjudicated
results into a working model — Batch Medium's adjudication is still
pending and may refine this further before anything locks.

## The headline finding driving this document

> Strong evidence from a publisher is not automatically strong evidence
> for Adjung. It's only strong evidence about how *that publisher* sees
> the story.

Batch U proved this concretely: all 3 URL-path-only samples and 1 of 11
RSS-category-only samples were `publisher_taxonomy_mismatch` errors
(`docs/batch-u-adjudication.md`) — the underlying structural evidence was
real and internally consistent, it just reflected the *publisher's*
editorial categorization, not Adjung's. This confirms something expected
since the edition-independence pivot
(`docs/multi-placement-consideration.md`, `docs/edition-taxonomy.mjs`'s
"editorial worldview" framing) but not previously measured directly.

## Four principles (per ChatGPT, synthesizing Batch A/M/U)

1. **Evidence generates candidates.** Structural signals (feed_category,
   url_segment, rss_category) and content signals (title_keyword) never
   directly become a placement — they produce candidates for Story
   Understanding, same as always.
2. **Edition determines placement.** The Edition Resolver (existing
   architecture, `docs/edition-rule-engine-contract.md`) decides what
   gets displayed — informed by, but not identical to, publisher
   evidence. Confirmed necessary specifically because Batch U showed
   publisher taxonomy diverges from Adjung's per-edition taxonomy.
3. **Ranking considers confidence/evidence quality — it is a safety net,
   not an excuse.** See below.
4. **A single publisher signal is never treated as absolute truth** —
   this reframes what "Medium evidence" means: useful as a candidate
   generator, not sufficient alone as a placement guarantee (pending
   Batch Medium's test of whether TWO Medium signals together change
   this).

## Ranking as safety net — with a condition

Izzat's hope (`docs/batch-u-adjudication.md`) that the ranking engine
pushes misclassified stories down so readers rarely encounter them is
accepted, but with a correction from ChatGPT:

**Wrong framing:** "It's fine if the classifier is sometimes wrong,
because ranking puts it at the back."

**Right framing:** "No classifier is perfect, so ranking must actually
account for confidence and evidence quality — not just topic relevance."

Concretely: **Classification Confidence ≠ Visibility Priority.** Two
stories in the same Bidang should not necessarily rank equally just
because they share a `field`:

```
Story A: Business, confidence 0.95, multi-mechanism agreement -> ranks higher
Story B: Business, confidence 0.55, url_path-only               -> ranks lower
```

This is a **ranking design implication**, not a classification engine
change — flagged here as a requirement for whichever system computes
Active Set ranking, not designed or implemented in this document.

## Why "impossible without AI" is only half right

Per ChatGPT's pushback on Izzat's framing (recorded fully in
`docs/batch-u-adjudication.md`): the core failures in Batch U aren't
language-comprehension failures an LLM would necessarily fix — they're
**editorial ontology disagreements**: Guardian says Politics, Adjung
wants Environment; ms-MY wants Ekonomi, English wants Business. An LLM
asked to classify would hit the same disagreement, because the
disagreement is about *whose categorization scheme wins*, not about
understanding the story's content. What actually moves accuracy:

- More/better source feeds (more independent structural evidence to
  agree or disagree, feeding Batch M's already-confirmed
  multi-mechanism-agreement strength).
- Edition-specific rules (`docs/edition-rule-engine-contract.md`).
- Evidence weighting that reflects the Evidence Quality Matrix
  (`docs/evidence-quality-matrix-contract.md`), refined by real
  adjudication data.
- A ranking feedback loop, per above.

Not necessarily "AI" as a category — though not ruled out either; simply
not assumed as the only path, since it wouldn't resolve an ontology
disagreement on its own.

## Illustrative policy shape (NOT locked — pending Batch Medium)

| Evidence pattern | Classification | Ranking weight |
|---|---|---|
| Strong | usable directly | high |
| Medium + Medium (independent mechanisms) agreeing | usable (pending Batch Medium confirmation) | high |
| Medium (single mechanism) | candidate only, not a placement guarantee | medium/low |
| Weak only | tentative / geography fallback (per `docs/structural-evidence-fallback-policy.md`) | low |
| No structural evidence | Unclassified | manual/retry |

This table is illustrative, matching the shape already sketched in
`docs/evidence-calibration-freeze.md`'s Policy Matrix placeholder — it
gets filled in with real values only after Batch Medium's adjudication,
not from this document alone.

## Explicitly out of scope here

- No code changed — `edition-classification.mjs`, `confidence-policy.mjs`,
  the Active Set ranking logic, all remain untouched.
- No ranking algorithm designed — only the *requirement* (confidence-
  aware ranking, not confidence-blind) is stated.
- No final Evidence Policy lock — Batch Medium's adjudication
  (`docs/evidence-calibration-freeze.md`) still pending.

## Next

Complete Batch Medium's adjudication (the last pending batch), then fold
Batch A + M + U + Medium's combined results into a final, locked Evidence
Policy — replacing this proposal with real numbers rather than
illustrative ones.
