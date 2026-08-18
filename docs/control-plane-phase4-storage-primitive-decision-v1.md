# Control Plane Fasa 4 — Minimum Storage Primitive Decision (3 items)

Design-level only. No table names, no column schema, no migration, no
RPC, no API, no UI, no code. Per ChatGPT's explicit scope for this note.
Covers `desk-vocabulary`, `content-rules`, `edition-rules` — the 3 items
approved to start with (`docs/control-plane-phase4-admin-authority-
design-v1.md`). `candidate-scoring` and the 2 KIV items are out of scope
here.

---

## 1. `desk-vocabulary`

| | |
|---|---|
| **Current default** | `SUBJECT_VOCABULARY` (~43 pairs) + `GEOGRAPHY_VOCABULARY` (~12 pairs), hardcoded, consulted by `story-understanding.mjs`. |
| **Required override state** | A set of admin-added/edited `token → (Subject or Geography) value` mappings, each taking precedence over the built-in mapping for that exact token. |
| **Minimum stored information** | token, target type (subject/geography), target value, status (active/disabled). Nothing else is load-bearing for the classifier itself. |
| **Scope** | Global. Desk-vocabulary evidence is gathered before edition-specific resolution; no edition/source scoping exists today, and none is needed to satisfy the approved authority (add/edit/disable a mapping). |
| **Precedence** | Trivial — a token has at most one active override. No priority or tie-break logic needed at all (unlike `classification_rules`, which resolves competing rules across multiple types). |
| **Lifecycle** | Add → immediately active. Disable/remove → reverts to the built-in mapping for that token if one exists, otherwise the token simply has no mapping (same as today for any unmapped token). |
| **Candidate primitive** | A flat key→value structure: (token, target_type, target_value, status). This is the simplest of all three items — direct-equality lookup, no matching logic, no conditions. |
| **Reuse possibility** | Tested against `classification_rules`: **rejected**. That table exists to resolve competing condition+priority+action rules across an entire story; desk-vocabulary needs none of that — it's a single exact-key lookup. Forcing it into that shape would add condition/priority/tie-break machinery this problem doesn't have, making the model *more* abstract than the actual problem, which is the exact trap flagged to avoid. Tested against a shared primitive with `content-rules` (see below): also rejected, despite superficially similar columns. |
| **Why / why not** | Needs its own minimal shape — direct key→value, no matching engine required. |
| **Open decision** | Should `target_value` be re-validated at *read* time against the live taxonomy (in case a Subject/Geography value is later retired), or only at write time? Not resolved here — a validation-timing question, not a shape question. |

---

## 2. `content-rules`

| | |
|---|---|
| **Current default** | `PHRASE_RULES` — ~40+ keyword phrases across 6 subjects, hardcoded. Tier 5 evidence: produces a *candidate* subject, subject to the confidence gate, via `extractContentEvidence()`. |
| **Required override state** | Admin-added phrases (V1 = additive only, per the approved design — editing/disabling *built-in* phrases stays out of scope). Each admin phrase must be evaluated **identically** to a built-in phrase: substring match → candidate subject → confidence gate. Never a short-circuit. |
| **Minimum stored information** | phrase, target subject, status (active/disabled). |
| **Scope** | Global — same evidence-gathering stage as desk-vocabulary. |
| **Precedence** | None needed for V1's additive-only scope — all active phrases (built-in + admin) are evaluated by the same existing match logic; an admin phrase doesn't "beat" anything, it just adds another phrase the existing extraction checks. |
| **Lifecycle** | Add → included in the next evidence extraction immediately. Disable/remove → stops being considered; built-in phrases are never affected by an admin phrase's lifecycle. |
| **Candidate primitive** | A phrase-list structure: (phrase, subject, status) — deliberately flagging that this *looks* almost identical in shape to desk-vocabulary's (token, target_value, status). |
| **Reuse possibility** | Two things tested, both rejected: **(a) `classification_rules`** — rejected per the already-established semantic mismatch (unconditional short-circuit vs. weighted candidate through the confidence gate); reusing it would silently change every migrated phrase's behavior. **(b) A shared primitive with `desk-vocabulary`**, despite near-identical columns — also rejected. The storage *shape* is similar but the *consuming contract* is not: desk-vocabulary's override is a definitive, authoritative value; content-rules' override is a weighted evidence input that must still pass through the confidence gate. Storing both in one shared structure would make the classifier's actual behavior for a given row depend on which "type" flag it carries rather than which table it's in — exactly the kind of implicit, easy-to-miss distinction this project's wiring-gap lesson (Fasa 3) warned against. Keeping them structurally separate keeps the confidence-gate distinction explicit in the code path, not implied by data. |
| **Why / why not** | Needs its own small structure, kept deliberately distinct from desk-vocabulary despite the shape similarity, specifically to protect the "candidate, not override" invariant. |
| **Open decision** | Does a single admin-added phrase ever need to map to more than one subject at once, or is one row = one subject always sufficient (matching today's per-subject-bucket shape in `PHRASE_RULES`)? Recommend the latter (simpler, matches current shape) but not decided here. |

---

## 3. `edition-rules`

| | |
|---|---|
| **Current default** | `EDITION_RULES` — per-edition array of condition→action rules. Currently one active rule: ms-MY, `{subject: Politics, geographyNot: Malaysia} → display_field: Dunia`. |
| **Required override state** | Admin-added *new* rules (the existing ms-MY rule stays coded/unmigrated, per the approved design). Each rule: edition + condition (detected subject + a geography condition) + action (target display field). |
| **Minimum stored information** | edition_id, condition (subject value, geography condition type, geography value), action (target field_code), priority, status. |
| **Scope** | Edition-specific — every rule, built-in or admin, targets exactly one edition. |
| **Precedence** | **Open decision, not resolved here**: does an admin-added rule share the same priority space as the built-in coded ms-MY rule (i.e., could an admin rule ever outrank it), or is the built-in rule always evaluated as a separate, later fallback? Today's `evaluateEditionRules()` sorts one flat per-edition array by priority — folding admin rules into that same array implies they'd need a priority genuinely comparable to the built-in rule's (currently hardcoded as `priority: 2`). Not decided here. |
| **Lifecycle** | Add → active. Archive/disable → falls through to (a) other still-matching active admin rules, else (b) the built-in coded rule if it matches, else (c) normal subject/geography-based placement. |
| **Candidate primitive** | Tested as a new `classification_rules` rule type (e.g. a geography-redirect type) vs. its own small structure. |
| **Reuse possibility — the corrected finding** | Initially assumed a staging/timing incompatibility (edition-rules runs after subject detection, `classification_rules` before) — **checked directly against `classification/edition-classification.mjs` and this was wrong**: `understanding.subject_candidates`/`geography_candidates` are already computed (by `story-understanding.mjs`, upstream of `classifyForEdition()` entirely) and in scope by the time *both* `classification_rules` (line 66) and `evaluateEditionRules()` (line 88) run. The data edition-rules' conditions need is available at the same point `classification_rules` is evaluated. The real incompatibility is narrower: **`resolveClassificationRule()`'s current signature only receives raw `item` fields (`sourceId`/`link`/`title`/`description`) — never `understanding`'s detected subject/geography candidates.** Supporting a geography-condition rule type would require widening that function's input contract, not just adding a row shape — a real interface change, though a scoped one (not a rejection, but a real cost to weigh). Separately, a **semantic distinction worth preserving**: every `classification_rules` match sets `classification_method = 'admin_rule'` with `subject_code` coming from *the rule itself*; every `evaluateEditionRules()` match sets `classification_method = 'edition_rule'` with `subject_code` coming from *actual detection* (`subjectCandidates[0].value`). Folding edition-rules into `classification_rules` as another rule type would need a decision on whether to collapse or preserve this distinction — an "explicit admin fact overriding classification entirely" is a different claim than "the subject was correctly detected, but this edition displays it under a different Kategori." |
| **Why / why not** | Structural similarity confirmed (condition+priority+action+edition_id+status, matching `classification_rules`' existing shape). Semantic compatibility is **not fully confirmed** — it requires a signature change to the resolver and a decision on whether to preserve or collapse the `admin_rule` vs `edition_rule` distinction. This is the one item of the three where reuse remains a live, undecided option rather than a clear yes or no. |
| **Open decision** | (1) Priority space shared with the built-in rule or not. (2) Whether `resolveClassificationRule()`'s contract should be widened to accept `understanding`, and whether that's worth doing vs. building a small separate structure. (3) Whether to preserve the `admin_rule`/`edition_rule` method distinction if reuse proceeds. None resolved here — flagged for the next decision round. |

---

## Summary

| Item | Minimum primitive needed | Shared with another item? | Extends `classification_rules`? |
|---|---|---|---|
| desk-vocabulary | Flat token→value lookup | No — rejected shared primitive with content-rules (adds unneeded matching machinery either way) | No — rejected, shape mismatch |
| content-rules | Phrase→subject list, additive-only | No — rejected shared primitive with desk-vocabulary (shape looks similar, consuming contract isn't) | No — rejected, semantic mismatch (short-circuit vs. candidate) |
| edition-rules | Condition+priority+action, per-edition | N/A | **Undecided** — structurally close, semantically unconfirmed; needs a resolver signature-change decision before either direction is settled |

No table names, columns, or implementation plan proposed. Stopping here
per instruction — awaiting the next decision round before any schema
work begins.
