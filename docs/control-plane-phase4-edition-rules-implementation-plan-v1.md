# Fasa 4 — Edition Rules: Implementation Plan (ms-MY only)

Finalizes the 3 open decisions from `docs/control-plane-phase4-edition-
rules-open-decisions-v1.md` per ChatGPT's confirmed direction: Decision 1
= Option B (admin rules evaluated first, built-in as fallback), Decision
3 = Option A (keep `admin_rule`/`edition_rule` provenance distinct),
Decision 2 = Option B (separate storage/path, not an extension of
`classification_rules`). Scope: ms-MY only, per Izzat's locked
instruction — en-global/ar-global deferred, no multilingual abstraction
built in advance.

## A detail found while finalizing: priority direction differs between the two mechanisms

`classification_rules`' `pickWinner()` treats a **higher** priority
number as winning. `evaluateEditionRules()`'s existing sort
(`a.priority - b.priority`, ascending, first match wins) treats a
**lower** number as winning. These are already inconsistent conventions
in the live codebase — not something this plan introduces. Decision:
admin-authored edition rules will use the `classification_rules`
convention (higher number wins), for consistency with every other
admin-facing rule mechanism in Quick. The existing built-in
`evaluateEditionRules()` function and its ascending-order convention are
**not touched** — per Decision 1, it's consulted separately, only as a
fallback after all admin rules are checked.

## Resolution flow (per Decision 1)

```
Admin edition rules (new, this table)
   │
   │ any match?
   ├── YES → use it (classification_method = 'edition_rule', admin-authored)
   │
   └── NO
        ↓
   Built-in evaluateEditionRules() (existing, untouched)
        │
        │ any match?
        ├── YES → use it (classification_method = 'edition_rule', built-in)
        │
        └── NO → falls through to Tier 2.5/3 (confidence gate / default placement), unchanged
```

Both admin and built-in matches produce `classification_method =
'edition_rule'` — per Decision 3, this stays distinct from
`'admin_rule'` (`classification_rules`). `subject_code` continues to come
from actual detection (`understanding.subject_candidates[0].value`), not
from the rule, matching today's exact behavior.

## Storage shape (design-level — table name/exact types are implementation detail, not a new architectural decision)

One row = one admin-authored edition rule:

- `edition_id` — always required (unlike `classification_rules`, edition
  rules are never global; today's only edition in scope is `ms-MY`).
- `condition_subject` — a Universal Subject value the rule matches
  against `understanding.subject_candidates[0]`. Required (every rule
  needs at least a subject condition, matching the only existing
  example).
- `condition_geography_type` — `'not'` or `'is'`, nullable (a rule may
  have no geography condition at all).
- `condition_geography_value` — a Universal Geography value, required
  only if `condition_geography_type` is set.
- `action_field_code` — the target `taxonomy_fields.field_code` for this
  edition. **Stores field_code, not a label** — reusing the exact FK-style
  validation `classification_rules` already applies to edition-specific
  rules (composite validation against `taxonomy_fields`), rather than the
  built-in rule's label-based shape (`display_field: 'Dunia'`). The label
  is resolved for display at read time via `taxonomy-registry.mjs`, same
  as every other resolver output.
- `priority` — integer, higher wins (see convention note above).
- `status` — `'active'` / `'archived'`.
- `created_by`, `created_at`, `reason` — same audit pattern as every
  other admin-write mechanism in this project.

**Deliberately not supported (matches only what's proven needed today,
per "kekal minimal"):** condition types beyond subject + single geography
check (no keyword/source/url conditions — that's `classification_rules`'
job); multiple geography conditions per rule; conditions on anything
other than `understanding`'s already-detected subject/geography.

## What does NOT change

- `evaluateEditionRules()` and `EDITION_RULES` (the built-in ms-MY rule)
   — untouched, evaluated exactly as today, just consulted one step later
  in the overall resolution order.
- `resolveClassificationRule()` and `classification_rules` — untouched.
  No new rule type added there (this was the live option per Decision 2,
  now closed in favor of a separate path).
- `story-understanding.mjs` and all classifier machinery — untouched.

## Admin authority (per the approved Fasa 4 design)

- Add a new edition rule (condition + action + priority).
- Edit or archive an admin-added rule.
- Cannot edit or remove the built-in coded rule through this mechanism
  (matches the "built-in stays coded" decision — if the built-in rule
  itself needs to change, that remains a code change, not an admin
  action, at least for this V1).

## Acceptance criterion (per ChatGPT's locked standard)

Izzat must be able to, through the Admin UI alone, without asking
Claude: add an edition rule, see it take effect, understand why a story
landed where it did (provenance shows which rule, admin or built-in,
placed it), and remove the rule to return to built-in behavior. A
preview ("how many current stories would this affect") is recommended
before applying, given edition rules can affect every matching story for
an edition — not a hard blocker for V1, but should be scoped into the
implementation.

## Sequence from here

1. This plan reviewed by ChatGPT (schema-shape checkpoint, per the new
   delegation criteria — significant new table/RPC).
2. If approved: write SQL (table + RPC, admin-only, same discipline as
   every other Fasa 1-3 write path) for review — not applied.
3. Static audit.
4. ChatGPT approval.
5. Applied by Izzat via Supabase SQL Editor (only step that needs his
   direct action).
6. Resolver wiring (the flow above) + tests (no-op parity when 0 admin
   rules exist, admin-rule-wins test, fallback-to-built-in test, archived
   rule excluded test) — mirroring the rigor already used for Fasa 3's
   production wiring.
7. Admin UI (add/edit/archive rule, with taxonomy-validated dropdowns,
   not free text, for subject/geography/field_code).
8. Live verification, matching Fasa 1/3 rigor (toggle a real low-impact
   rule, confirm it reaches production, confirm reverting removes it
   cleanly).

Not yet implemented — this document is the design/schema checkpoint,
awaiting ChatGPT's review before any code or SQL is written.
