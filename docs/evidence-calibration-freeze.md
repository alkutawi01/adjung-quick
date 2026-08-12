# Evidence Calibration Freeze Point (Sesi 3B.2C-5 checkpoint, 2026-08-12)

Status: **documentation only, no code.** Locks the process discipline for
the evidence calibration batches (A, M, U, Medium) while they await
Izzat's manual adjudication.

## The freeze rule

**After an evidence calibration batch is generated, the ruleset and
evidence weighting it's measuring must not change until human
adjudication of that batch is complete.**

Why: changing the engine mid-review creates a circular problem —

```
Engine emits sample
        ↓
Human reviews sample
        ↓
Rule gets changed based on the review
        ↓
The sample no longer represents the engine being tested
```

What's wanted instead:

```
Snapshot A, Engine version X
        ↓
Human judgement
        ↓
Decision
        ↓
Engine version Y
```

Concretely: `classification/lib/confidence-policy.mjs`,
`classification/lib/edition-taxonomy.mjs`, `classification/lib/edition-rules.mjs`,
`classification/story-understanding.mjs`, and `classification/lib/content-rules.mjs`
stay unchanged until the four batches below are adjudicated and a
resulting Policy Matrix decision is made (see
`docs/evidence-quality-matrix-contract.md`). Read-only report/audit
scripts (the `generate-batch-*.mjs` / `audit-*.mjs` / `*-report.mjs`
family) may still be run freely — they don't change what's being
measured, only how it's displayed.

## Batch purpose labels

Each batch answers a different question — their accuracy numbers must
never be pooled into one combined figure, since they're testing different
things:

| Batch | Script | Purpose | Question it answers |
|---|---|---|---|
| **A** | `generate-batch-a.mjs` | False positive recovery | Does the low-confidence fallback actually discard candidates that were wrong to begin with? |
| **M** | `mixed-evidence-review-batch.mjs` | Agreement validation | Does multi-mechanism agreement genuinely produce a trustworthy candidate? |
| **U** | `generate-batch-u.mjs` (+ `audit-tier-reliability.mjs`) | Single Medium evidence reliability | Can one publisher/structural signal (url_path or rss_category alone) stand on its own? |
| **Medium** | `generate-batch-medium.mjs` | Medium evidence composition | Do two independent Medium-class signals together behave close to Strong? |

Batch A2 (`generate-batch-a2.mjs`) is a special case — 0 matches, which
was itself the finding (no "genuinely weak but correct" population exists
in the current corpus). It doesn't need adjudication; its result already
answered the question it was built to ask.

## What comes after adjudication

Not "what threshold?" — a **Policy Matrix**, keyed by evidence pattern
rather than a single number:

| Evidence pattern | Decision (TBD, pending adjudication) |
|---|---|
| Strong | use directly |
| Strong + anything | very high confidence |
| Medium + Medium (independent mechanisms) | use? / needs threshold? |
| Medium (single) | needs threshold or rule? |
| Weak (single) | tentative/fallback |
| Weak + Weak (same family) | does NOT count as agreement — see Evidence Independence, `docs/evidence-quality-matrix-contract.md` |

This table is a placeholder shape, not a decision — every cell gets filled
in from Izzat's adjudication of Batches A/M/U/Medium, not assumed here.
Once filled, it determines whether `minimum_candidate_confidence`
(`docs/resolver-confidence-policy.md`) remains a primary mechanism or
becomes a small safety-valve parameter underneath the Policy Matrix.

## Why this matters beyond this one confidence decision

Per ChatGPT: the adjudication dataset Izzat produces isn't just
classifier-accuracy data — it becomes part of Adjung Quick's editorial
memory: a record of *why* a placement decision was made, not just
*what* was decided. That's why `editorial_judgement`/`notes` columns
across every batch were deliberately left blank for Izzat to fill,
never auto-completed by the engine.
