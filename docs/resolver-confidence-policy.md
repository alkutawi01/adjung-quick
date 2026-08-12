# Resolver Confidence Policy (Sesi 3B.2C-0)

Status: **CONTRACT — definitions and decision framework only. No threshold
implemented, no rules added, no taxonomy changed.** Per ChatGPT: `0.6`
looks like a small parameter, but it actually decides who has authority
over the placement decision — that needs to be settled in writing before
it's a number in code.

## Why this exists

Sesi 3B.1's gap analysis found Gap 3: weak subject candidates (confidence
< 0.5) still win the resolver over geography fallback — currently
re-measured at 56/284 (20%) of the live corpus (originally recorded as 23%;
the difference is corpus/feed drift between runs, not a code regression).
No policy currently governs what should happen when a subject candidate
exists but is weak.

## 1. Confidence is not truth — two distinct meanings

Already locked at the Story Understanding layer
(`docs/story-understanding-engine-spec.md`): a candidate's `confidence` is
**evidence strength** (this candidate is ranked ahead of others), never a
probability that the classification is correct.

The Resolver introduces a **second, different** confidence meaning, which
must not be confused with the first:

| | Meaning |
|---|---|
| Story Understanding confidence | How strong is the evidence for this candidate, relative to other candidates for the same story? |
| Resolver confidence | How much does this edition trust that the resulting placement decision is the right one to show a reader? |

These can diverge. Worked example — `"Thailand suspends gun licences..."`:

```
Story Understanding:
{ Politics: 0.82, Crime: 0.55, geography: Thailand }

ms-MY resolver (edition_rule fires: foreign_politics_to_world):
{ field: "Dunia", method: "edition_rule", confidence: 0.95 }
```

`0.95` here is not `0.82` re-labeled — it's the resolver's own confidence
that "foreign politics → Dunia" is the right editorial call, which is high
*because* an explicit rule matched, not because the underlying subject
evidence changed.

## 1a. Confidence Gate Semantics (added after ChatGPT review, 2026-08-12)

The confidence gate never says:

> "this candidate is wrong."

It only ever says:

> "this candidate is not strong enough to be the basis of a default
> placement."

Worked example:

```json
{
  "subject_candidates": [{ "value": "Politics", "confidence": 0.45 }],
  "geography_candidate": "Malaysia",
  "geography_confidence": 0.90
}
```

The gate does not discard `Politics` — it remains in Story Understanding's
output, untouched, as evidence. The gate only tells the *resolver*: this
subject signal isn't strong enough to drive this edition's default
placement, try geography fallback instead. This distinction matters
because future evidence (e.g. entity detection, not yet built) could
strengthen the same candidate later — a discarded candidate could never
recover; a gated one can.

## 2. The real open question: what happens when subject confidence is low?

Not yet decided. Worked example:

```
Story Understanding:
{ Politics: 0.45, geography: { Malaysia: 0.90 } }
```

Three candidate behaviors:

| Option | Result | Reasoning |
|---|---|---|
| A | Keep `Politics` | A candidate exists; a weak signal is still a signal. |
| B | Fall through to geography (`Malaysia`) | Subject too weak to trust; geography is strong, use it instead. |
| C | `Unclassified` | Neither signal is strong enough to commit to a display decision. |

This document does not choose one — that decision belongs to Sesi 3B.2C-1,
informed by the benchmark in §5. What it does lock is the *shape* of the
policy that will make this decision (§3) and *where* it sits in the
resolver (§4).

## 3. Resolution Confidence Policy — proposed shape (value NOT locked)

Not a single global constant. A named policy object, so it can differ per
edition without becoming a special case in the resolver code:

```json
{
  "min_subject_confidence": 0.6,
  "low_confidence_action": "fallback"
}
```

`low_confidence_action` is one of the three options from §2 (`"keep"` /
`"fallback"` / `"unclassified"`) — naming it explicitly means the resolver
reads a policy decision, never a hard-coded branch.

Per-edition override is allowed, not required:

```json
{
  "ms-MY": { "min_subject_confidence": 0.65 },
  "en":    { "min_subject_confidence": 0.55 }
}
```

Rationale sketch (not evidence yet, needs the benchmark to confirm):
ms-MY may reasonably want to be more conservative (fewer editions of
"guessing"), while `en` covers a broader, more granular subject set
(BBC/Guardian-style) where a moderate-confidence candidate is more often
still useful than not. **This asymmetry is a hypothesis, not a decision.**

## 4. Where the confidence gate sits in the resolver

Per ChatGPT: the gate must sit **after** Edition Rules, not before —
an explicit editorial rule already represents a human/system decision
that should not be second-guessed by a generic confidence number.
`foreign_politics_to_world` should not fail to fire just because the
underlying `Politics` candidate happened to score `0.58`.

```
Edition Rules (tiers 1-2)
        │  (rule matched -> return immediately, gate never runs)
        ▼
Confidence Gate                  <-- NEW, Sesi 3B.2C-1
        │
        ├── pass -> continue to Default Placement Mapping (tier 3)
        │
        └── fail -> low_confidence_action (§2/§3)
        ▼
Default Placement Mapping (tier 3)
        ▼
Geography fallback / Unclassified
```

This slots into the existing resolver order
(`docs/edition-rule-engine-contract.md`) without changing tiers 1-2 or the
relative order of tiers 3+ — it only adds a checkpoint between them.

## 5. Benchmark plan — required before locking any threshold value

Per ChatGPT: `0.6` must not be picked by theory alone. Before Sesi
3B.2C-1 locks a value, test candidate thresholds against the live corpus
and measure:

- **Unclassified rate** — how many stories lose a display field entirely
  at each threshold.
- **Residual geography growth** — how many stories that currently get a
  subject-based placement would instead fall through to geography-only.
- **Wrong-placement rate** — requires a small manual-judgment sample (not
  yet collected) to check whether low-confidence candidates that *do* win
  are actually reasonable placements or not.
- **Editorial disagreement rate** (added after ChatGPT review, 2026-08-12)
  — kept separate from wrong-placement, not folded into it. "Wrong" is too
  harsh a word for cases where the engine's output is defensible but a
  Chief Editor would have made a different, equally legitimate call.
  Worked example: *"Anwar bertemu Presiden Indonesia"* — engine says
  `Politics`; the Chief Editor might reasonably say `Malaysia` or `Dunia`
  instead. That is not a technical error, it's an editorial preference.
  The manual-review sample must record `engine_output` vs
  `chief_editor_judgement` and classify each disagreement as either
  **technical error** (the engine missed real evidence) or **editorial
  preference** (both calls are defensible, humans just differ) — mixing
  the two into one "error rate" would overstate how broken the engine is.

Illustrative shape only (no real numbers yet):

| threshold | unclassified | technical error | editorial disagreement |
|---|---|---|---|
| 0.4 | low | ? | ? |
| 0.6 | moderate | ? | ? |
| 0.8 | high | ? | ? |

The actual table gets filled in during 3B.2C-1, not here.

## Explicitly out of scope for 3B.2C-0

- No threshold value implemented or hard-coded anywhere.
- No `low_confidence_action` chosen (A/B/C from §2 stays open).
- No new Edition Rules.
- No taxonomy changes.
- No benchmark run yet — §5 is a plan, not results.

## Next

Once this contract is confirmed: **Sesi 3B.2C-1** — implement the
Confidence Gate as a policy-driven step (not a hard-coded number), run the
§5 benchmark against the live corpus, and lock `min_subject_confidence` +
`low_confidence_action` from evidence. Only after that: Sesi 3B.2C (en/ar
editorial rules), per the standing sequencing in
`docs/edition-rule-engine-contract.md`.
