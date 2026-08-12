# Edition Rule Engine Contract (Sesi 3B.2A)

Status: **CONTRACT — schema only, no rules implemented, no code written.**
Per ChatGPT: don't write rules yet, define how editions are *allowed* to make
decisions first.

## Why this exists

Sesi 3B.1's gap analysis revealed three genuinely different problems that
must not be collapsed into one "classifier fix":

| Gap | Problem | Owner |
|---|---|---|
| Gap 1 — candidate conflict | Story Understanding + Edition Rule |
| Gap 2 — subject correct, edition display wrong | Edition Rule |
| Gap 3 — weak candidate beats geography fallback | Resolver ranking policy |

Gap 2 in particular resolves a long-open question cleanly: Izzat originally
asked whether `Politik` should be Malaysia-only or global. The answer,
sharpened by this gap analysis: **Story Understanding says all politics is
`Politics` — universal, unscoped. The `ms-MY` *edition* then displays foreign
politics as `Dunia`.** Not a scoping rule on the subject itself; a display
rule on top of a correctly-identified, unscoped subject. Cleaner than either
of the two original options ("Politik = global" or "Politik = Malaysia
only").

## Rule schema

Data, never hard-coded per-edition branches (same discipline as
`edition-taxonomy.mjs`'s Merge/Split/Rename/Hide table):

```json
{
  "edition": "ms-MY",
  "rule_id": "foreign_politics_to_world",
  "priority": 20,
  "condition": {
    "subject_candidate": "Politics",
    "geography_not": "Malaysia"
  },
  "action": {
    "display_field": "Dunia"
  }
}
```

## Rule hierarchy (evaluation order)

```
1. Explicit edition override
2. Geography transformation       (e.g. foreign_politics_to_world)
3. Subject mapping                (the existing Merge/Rename table)
4. Default presentation mapping
5. Unclassified
```

Higher-priority rules short-circuit lower ones. A rule that doesn't match
falls through to the next tier — the existing `edition-taxonomy.mjs`
Merge/Rename table becomes Tier 3 of this hierarchy, not a separate
mechanism.

**Open design question, not resolved here:** are Tier 3 (the existing static
Merge/Rename table) and Tiers 1–2 (conditional IF/AND/THEN rules) the *same*
mechanism at different priorities, or two genuinely different systems (static
table vs. rule engine) that need separate code paths? ChatGPT's own Sesi
3B.2B example listed `Business+Economy → Bisnes` (currently a static Merge)
alongside `foreign_politics_to_world` (a new conditional rule) as if they
were the same kind of "rule" — this needs explicit confirmation before
implementation, not assumed.

## Confidence threshold — parameter, not locked

Gap 3's fix is a resolver *policy*, not an editorial rule:

```json
{ "min_subject_confidence": 0.6 }
```

Below this, the resolver should prefer geography fallback over a weak
subject candidate. **Value not locked** — needs testing against real data
before fixing a number, per ChatGPT's explicit "threshold jangan lock dulu."

## Candidate rules — sourced ONLY from Gap Analysis, none invented

| Candidate rule | Evidence | Edition |
|---|---|---|
| `foreign_politics_to_world` (Politics + geography≠Malaysia → Dunia) | Gap 2: 11/33 foreign-subject cases are Politics | ms-MY |
| Equivalent for Crime, Disaster, Environment, Business | Gap 2: 9/4/4/3 cases respectively | ms-MY |
| `min_subject_confidence` threshold (candidate < threshold → geography fallback) | Gap 3: 64/284 (23%) weak candidates currently winning | all editions, value TBD |

**Not a candidate rule (per ChatGPT, explicit correction):** merging
Culture+Entertainment for ms-MY. Already locked the opposite — Izzat's
ruling keeps `Budaya`/`Hiburan` separate for ms-MY (only the Arabic edition
merges these). Flagging this discrepancy rather than silently adopting
ChatGPT's example literally, since it contradicts an existing lock.

## Sequencing (per ChatGPT)

| Step | Scope |
|---|---|
| 3B.2A (this doc) | Rule contract only |
| 3B.2B | `ms-MY` rules specifically — most evidence exists for this edition |
| 3B.2C | `en`/`ar` rules — later, don't do all editions simultaneously |

## Explicitly out of scope for 3B.2A

No rules implemented. No entity detection (per ChatGPT: Gap 2 isn't an
entity-detection problem — the engine already knows `subject: Politics,
geography: Thailand`; it's missing a display *transform*, not missing
information). No content-rule keyword changes. No taxonomy changes. No SQL
migration.

## Next

Once this contract is confirmed, Sesi 3B.2B implements `ms-MY`'s rules
specifically (the `foreign_politics_to_world`-style rules + confidence
threshold), tested against the same 284-item corpus, before touching `en`/`ar`.
