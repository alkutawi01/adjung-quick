# Control Plane Fasa 4 — Admin Authority Design (4 items)

Design-only. No schema, no table names, no code, no implementation plan.
Per Izzat's decision (relayed via ChatGPT, `docs/control-plane-authority-
boundary-technical-assessment-v1.md`): 4 items get Admin authority
(desk-vocabulary, content-rules, edition-rules, candidate-scoring), in
that dependency order. 2 items (bernama-prefix, confidence-policy) are
KIV — nothing is designed for them here.

## The default + override model (applies to all 4)

```
BUILT-IN DEFAULT (code)
      │
      │  no override
      ↓
   RUNTIME

BUILT-IN DEFAULT (code)
      │
      │  Admin override exists
      ↓
  stored override
      │
      ↓
   RUNTIME
```

Storage holds only what an Admin actually changed — never a full copy of
every default. Removing/archiving an override returns behavior to the
built-in default automatically, no separate "reset" action needed. This
matches "configurable ≠ wajib dikonfigurasi": Quick works correctly on
day one with zero overrides.

---

## 1. `desk-vocabulary.mjs`

**Current default:** `SUBJECT_VOCABULARY` (~43 pairs) +
`GEOGRAPHY_VOCABULARY` (~12 pairs) + `STRUCTURAL_NOISE` set, hardcoded.
Consulted by `story-understanding.mjs` as Tier 1/2 evidence for every
story, before any edition-specific placement.

**Admin authority:** Add a new token → Subject or token → Geography
mapping. Edit an existing mapping's target value. Disable a mapping.

**Override model:** One override = one token → value pair. A flat
key→value relationship — no conditions, no priority between overrides
(each token has at most one active mapping).

**Fallback:** No override for a token → the built-in
`SUBJECT_VOCABULARY`/`GEOGRAPHY_VOCABULARY` lookup applies exactly as
today.

**Scope:** Global — desk-vocabulary evidence is gathered before any
edition-specific resolution; not edition-scoped today, and this design
doesn't introduce edition scoping unless a real need surfaces.

**Precedence:** An Admin override for a token always wins over the
built-in mapping for that same token. No cross-override conflicts
possible (one token = one active value).

**Validation:** Token must be non-empty. Target value must be a real,
existing Universal Subject or Universal Geography value — not free text.
Admin cannot invent a new category name through this mechanism.

**Preview/impact:** Not required. Narrow reach — only stories whose
desk/URL contains that exact token are affected.

**Auditability:** Who added/changed/disabled a mapping, when, and why —
same discipline as every other admin-write mechanism in this project
(Source Registry, Classification Rules).

**Primitive reuse:** `classification_rules` is a condition+priority+action
mechanism for matching a whole *story* (source/url/keyword). Desk-
vocabulary is a flat *term* lookup with no conditions and no priority —
structurally simpler and shaped differently. Not a natural fit to reuse
as-is. Storage primitive not yet determined.

**Out of scope:** `STRUCTURAL_NOISE` (noise-token exclusion set) is not
exposed to Admin in this design. `normalizeToken()` and the consuming
match logic in `story-understanding.mjs` stay untouched.

---

## 2. `content-rules.mjs`

**Current default:** `PHRASE_RULES` — ~40+ keyword phrases across 6
subjects (Crime, Disaster, Politics, Sports, Health, Environment),
hardcoded. Tier 5 evidence — produces a *candidate* subject, subject to
the confidence gate, via `extractContentEvidence()`.

**Admin authority:** Add a new keyword phrase mapped to a subject. **V1
scope is additive only** — editing or disabling a *built-in* phrase is
out of scope for this design (same escalation-avoidance principle used
elsewhere in this project: start with the smallest safe authority,
widen only if a real need appears).

**Override model:** One override = one phrase → subject pair, purely
additive on top of the built-in `PHRASE_RULES` list for that subject.

**Fallback:** No admin-added phrases → behavior is 100% identical to
today (only built-in `PHRASE_RULES` evaluated).

**Scope:** Global — same evidence-gathering stage as desk-vocabulary, not
edition-scoped.

**Precedence — the critical constraint:** An admin-added phrase **must
produce a candidate, exactly like a built-in phrase** — it goes through
the confidence gate identically. It must NOT behave like a
`classification_rules` short-circuit. This is a hard design constraint,
not an implementation detail: **this design explicitly rejects reusing
`classification_rules.rule_type = 'keyword'` for content-rules overrides**,
because that table's keyword type is an unconditional short-circuit
(per its own schema comment) while content-rules produces a weighted
candidate. Reusing it as-is would silently change classifier behavior
for every phrase moved. Whatever storage primitive is chosen must
preserve "evidence, not override" semantics. If multiple phrases (built-in
+ admin) match different subjects for the same story, today's existing
match-order logic in `extractContentEvidence()` applies unchanged — this
design does not redesign that resolution order.

**Validation:** Phrase must be non-empty, reasonable length. Subject must
be a valid Universal Subject.

**Preview/impact:** Not required at V1's additive-only scope — same
narrow-reach reasoning as desk-vocabulary.

**Auditability:** Who/when/why, same pattern.

**Primitive reuse:** Explicitly rejected for `classification_rules` (see
Precedence above). Storage primitive not yet determined — needs a shape
that structurally preserves "produces evidence" rather than "produces an
override."

**Out of scope:** Editing/disabling built-in phrases (V1 = additive
only). The confidence gate mechanism itself (`confidence-policy.mjs`) is
untouched — separately KIV'd.

---

## 3. `edition-rules.mjs`

**Current default:** `EDITION_RULES` — per-edition array of
condition→action rules. Currently exactly one active rule: for ms-MY, a
foreign-politics story displays under Dunia (World) instead of Politik.

**Admin authority:** Add a new edition-scoped rule (condition: detected
subject + a geography condition; action: display under a specific
Kategori for that edition). Edit or disable an admin-added rule.

**Override model:** Unlike items 1-2, an override here is a **full rule
object** (condition + action), not a single value. The existing ms-MY
rule stays as a coded, unchanged built-in default — per "kekal minimal,"
this design does not migrate a rule that already works into the override
system just for consistency. Admin authority is to add *new* rules for
scenarios the built-in rule doesn't cover (matching the file's own
comment, which already declines to auto-generalize the existing rule to
other subjects).

**Fallback:** No admin-added rules → behavior identical to today (only
the built-in ms-MY rule evaluated).

**Scope:** Edition-specific — every rule (built-in or admin-added) always
targets exactly one edition.

**Precedence:** Needs an explicit priority + tie-break model across
admin-added rules, and relative to the built-in default rule. This is the
one item among the 4 where reusing `classification_rules`' existing
priority/tie-break logic (`pickWinner()`) is a plausible structural fit,
since edition-rules' shape (condition/priority/action, per-edition) is
genuinely the closest of all 4 items to that mechanism.

**Validation:** The geography condition must be a valid Universal
Geography value. The target display field must be a valid `taxonomy_fields`
`field_code` for that edition — reusing the same FK-style validation
`classification_rules` already applies to edition-specific rules.

**Preview/impact:** Worth including — a "how many current stories would
this affect" check before applying, similar in spirit to the rigor
`classification_rules`' admin flow already has, though not necessarily a
hard blocker for a first version.

**Auditability:** Who/when/why, same pattern.

**Primitive reuse:** The strongest candidate among all 4 for extending
`classification_rules` — but not a trivial one. Today's
`classification_rules` only supports `source`/`url`/`keyword` rule types,
each matching a story's own raw fields (`sourceId`/`link`/`title`/
`description`). Edition-rules instead matches a story's *already-detected*
subject + geography evidence — a different matching signature entirely.
Extending `classification_rules` to cover this would need a new rule
type (e.g. a geography-condition/display-redirect type) with its own
matching logic — a real schema extension question, not a drop-in reuse.
Storage primitive not yet determined.

**Out of scope:** The evaluation engine (`evaluateEditionRules()`) itself.
Migrating the existing built-in ms-MY rule into the override system.

---

## 4. `ranking/candidate-scoring.mjs`

**Current default:** `FRESHNESS_BUCKETS` (5 age→score tiers),
`BOOST_WEIGHT` (40), and a confidence-modifier ×10 multiplier, combined
in `scoreCandidates()`. Live in production for ms-MY.Politik
(`editorial_v1` ranking).

**Admin authority:** Per Izzat's YA, but explicitly **not** raw constant
editing (`BOOST_WEIGHT = 1.4` as a bare field). Per ChatGPT's caution,
Admin needs a **human-understandable ranking policy**, not direct access
to the scoring formula's internal numbers.

**What that policy actually looks like is an open question this design
does not resolve.** Candidate shapes (not decided here, listed only to
show the kind of thing that needs product input before any storage
question can be answered):
- Named presets (e.g. "Freshness priority: Normal / High / Low") mapped
  internally to a pre-validated `FRESHNESS_BUCKETS` set.
- Descriptive levers with documented meaning and bounded ranges (e.g.
  "how strongly should an editorial boost affect ranking, on a bounded
  scale") rather than an open-ended weight field.

This needs to be resolved as its own product decision — likely with
Izzat's direct input on what he'd actually want to adjust and how he'd
think about it — before an override model can be designed at all.

**Override model:** TBD, blocked on the above.

**Fallback:** No override → today's hardcoded `FRESHNESS_BUCKETS`/
`BOOST_WEIGHT` values, unchanged.

**Scope:** Open question — global ranking policy, or per-edition/per-field
(ranking is currently only active for ms-MY.Politik)? Does Izzat want
Sukan to rank differently from Politik, or one policy for all of Quick?

**Precedence:** Not applicable until the shape is defined — this is
closer to a settings model than a rules-matching model, so there's no
conflicting-rule scenario to resolve yet.

**Validation:** Depends on final shape — whatever prevents a nonsensical
ranking outcome (e.g. bounded ranges preventing negative boost or an
extreme freshness decay).

**Preview/impact — explicitly required, per ChatGPT:** Given the broadest
reach of all 4 items (a change here reorders the entire Active Set, not
one source or one edition-rule) and that the scoring parameters interact
with each other, this design requires that any ranking-policy change be
previewable before it applies — "how would today's Active Set reorder
under this policy" — computed by reusing the existing `scoreCandidates()`
function against current candidates. **No new simulation engine** — the
preview must reuse the real scoring logic, not a parallel one.

**Auditability:** Who/when/why, same pattern.

**Primitive reuse:** None of `classification_rules`' shape applies — that
mechanism handles per-story classification rules, not scoring-formula
parameters. This needs its own, much smaller, primitive. Storage TBD.

**Out of scope:** The scoring *formula* itself (how freshness + trust +
confidence + boost combine) stays code. Per-story overrides (boost/pin)
are a separate, already-existing mechanism (`story_overrides`) and are
untouched by this design.

---

## Summary — what this design does and does not decide

| Item | Override shape | Storage primitive | Preview needed |
|---|---|---|---|
| desk-vocabulary | token → value pair | Not determined | No |
| content-rules | phrase → subject pair (additive only) | Not determined; explicitly not `classification_rules` | No |
| edition-rules | condition + action rule | Not determined; possible `classification_rules` extension, not confirmed | Recommended |
| candidate-scoring | Undetermined — needs product decision first | Not determined | Required |

Nothing here commits to a table, a schema, or an implementation
sequence. Per ChatGPT's explicit instruction: after this design is
reviewed, the next decision is whether these four need to extend
`classification_rules`, share one new primitive, need several small
distinct structures, or — for any one of them — turn out not to need
database storage after all.
