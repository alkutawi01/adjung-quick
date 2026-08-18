# Fasa 4 — Edition Rules: 3 Open Decisions

Design/product level only. No schema, no code. Per ChatGPT's instruction:
resolve decisions **1 and 3 first** (authority model), and only then
decision 2 (interface) — because building the interface before the
authority model is settled risks building the wrong interface.

Context: `docs/control-plane-phase4-storage-primitive-decision-v1.md`
established that `edition-rules` is the only one of the 3 items where
reuse of `classification_rules` remains genuinely undecided. These are
the 3 questions that must be answered before that can be settled.

---

## Decision 1 — Priority space

**The question:** When an admin adds a new edition rule, does it compete
for precedence with the existing built-in coded rule
(`foreign_politics_to_world`, ms-MY, hardcoded `priority: 2`), or is the
built-in rule always evaluated separately?

**What exists today:** `evaluateEditionRules()` sorts one flat per-edition
array by priority, first match wins. The built-in rule sits in that array
at `priority: 2`.

### Option A — Shared priority space
Admin rules go into the same sorted array as the built-in rule. An admin
rule with `priority: 3` would outrank the built-in `foreign_politics_to_world`
rule and win when both match.

- **For:** One consistent model, no special cases. Admin has genuine
  authority — including over decisions the developer previously made.
- **Against:** An admin could unknowingly override a rule that was
  carefully reasoned (the built-in rule's own comment explains why it
  exists and why it was deliberately *not* generalized). Blast radius of
  a mistake is larger.

### Option B — Admin rules evaluated first, built-in as fallback
All admin rules are checked before the built-in rule. Built-in only
applies if no admin rule matched.

- **For:** Admin authority is clear and unambiguous ("what I set wins"),
  but the built-in rule is never *silently* outranked by a low-priority
  admin rule — it's simply last in line.
- **Against:** Admin can't deliberately let the built-in rule win over
  their own rule for a specific case.

### Option C — Built-in rule always wins
Admin rules only apply where the built-in rule doesn't match.

- **For:** Safest.
- **Against:** Contradicts the whole point — Izzat said YA to Admin
  authority for edition-rules. This makes his authority conditional on a
  developer's prior decision. **Not recommended.**

**Recommendation: Option B.** It gives Izzat real authority (his rules
are checked first) without the trap where he adds a rule expecting it to
apply and it silently loses to a hardcoded rule he can't see. Matches the
"default + override" model already agreed for the other items: built-in
is the fallback, admin override wins.

**Open for Izzat/ChatGPT to confirm.**

---

## Decision 3 — Provenance semantics

*(Presented before Decision 2, per ChatGPT's ordering instruction.)*

**The question:** Today two different mechanisms produce two different
provenance records:

| | `classification_rules` match | `evaluateEditionRules()` match |
|---|---|---|
| `classification_method` | `'admin_rule'` | `'edition_rule'` |
| `subject_code` | comes from **the rule itself** | comes from **actual detection** (`subjectCandidates[0].value`) |
| Meaning | "An admin declared this story's category outright." | "The subject was detected correctly; this edition just displays it under a different Kategori." |

If edition-rules becomes admin-editable, do these stay distinct?

### Option A — Keep the distinction
An admin-added edition rule still records `classification_method =
'edition_rule'` with the detected subject, distinct from `'admin_rule'`.

- **For:** The two claims genuinely differ. "This story IS Sukan because
  I say so" is a different editorial statement from "this story is
  correctly detected as Politics, but in the Malaysian edition foreign
  politics displays under Dunia." Preserving that keeps the audit trail
  honest — an editor reviewing why a story landed somewhere sees which
  kind of decision applied.
- **Against:** Two admin-authored mechanisms with two provenance labels
  could confuse an admin who thinks of both as "my rule."

### Option B — Unify under `admin_rule`
Any admin-authored rule, of either kind, records `'admin_rule'`.

- **For:** Simpler from the admin's point of view.
- **Against:** Loses real information. Also loses the `subject_code`
  distinction — an edition rule's subject_code is *evidence* (what was
  actually detected), while a classification rule's is *assertion* (what
  the admin declared). Collapsing them would make the two
  indistinguishable in the data.

**Recommendation: Option A — keep the distinction.** The two records
answer different questions, and this project has repeatedly benefited
from keeping distinctions explicit rather than implied (the wiring-gap
lesson, the content-rules semantic mismatch). If the concern is admin
confusion, that's a UI labelling problem, not a reason to lose data.

**Open for Izzat/ChatGPT to confirm.**

---

## Decision 2 — Resolver interface

*(Answerable only once 1 and 3 are settled.)*

**The question:** `resolveClassificationRule()` currently receives only
`item` (`sourceId`, `link`, `title`, `description`). Edition-rule
conditions need `understanding` (detected subject + geography candidates).
Do we widen that function's contract, or keep a separate path?

### Option A — Widen `resolveClassificationRule()` to accept `understanding`
Add a new rule type inside `classification_rules` for geography-condition
/ display-redirect rules.

- **Viable only if Decision 3 = Option B (unify provenance).** If the two
  provenance records stay distinct (recommended above), then folding both
  into one resolver means that one function must return two different
  `classification_method` values with two different `subject_code`
  sources — i.e. the shapes stay separate anyway, and the "reuse" saves
  a table but not the complexity.
- **Also affected by Decision 1:** if admin edition-rules are evaluated
  before the built-in coded rule (Option B), they'd need to run at a
  point where `evaluateEditionRules()`'s built-in array is still consulted
  afterward — which is a different control flow from
  `classification_rules`' current "match → return immediately, short-
  circuit everything below."

### Option B — Keep a separate path
Admin edition rules live in their own structure, consumed by
`evaluateEditionRules()` (or alongside it), leaving
`resolveClassificationRule()` untouched.

- **For:** Preserves both semantic models cleanly. No signature change to
  a function that is currently correct and tested. Consistent with how
  desk-vocabulary and content-rules were each given their own primitive
  rather than forced into a shared one.
- **Against:** A second rules-shaped structure exists in the system,
  which looks like duplication at a glance (though the audit already
  established that structural similarity ≠ semantic compatibility).

**Preliminary recommendation: Option B — separate path** — *conditional
on* Decision 1 = B and Decision 3 = A being confirmed. If both
recommendations above are accepted, reuse of `classification_rules`
stops being attractive: the provenance stays distinct, the control flow
differs, and the only thing shared would be the column layout. That is
exactly the "shape looks similar, contract doesn't" case already rejected
for desk-vocabulary vs. content-rules.

If instead Decision 3 = B (unify provenance) **and** Decision 1 = A
(shared priority space), then Option A (extend `classification_rules`)
becomes the better answer, because at that point the two mechanisms
really would be the same thing.

**Not decided — depends on 1 and 3.**

---

## Summary

| Decision | Recommendation | Depends on |
|---|---|---|
| 1. Priority space | **B** — admin rules first, built-in as fallback | — |
| 3. Provenance | **A** — keep `admin_rule` / `edition_rule` distinct | — |
| 2. Resolver interface | **B** — separate path (*if* 1=B and 3=A) | 1 and 3 |

Nothing is committed. These are recommendations with reasoning, for
Izzat and ChatGPT to accept, reject, or amend before any storage or
implementation decision is made.
