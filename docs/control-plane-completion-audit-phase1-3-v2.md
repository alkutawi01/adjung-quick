# Control Plane Completion Audit — Fasa 1-3, v2 (Redo)

Read-only audit, redone per ChatGPT's explicit instruction after v1's
Source Registry headline finding turned out to be stale (it flagged a gap
that had, in fact, already been fixed before the audit ran). This version
applies a stricter 3-step discipline to every finding:

1. **Classify the consumer first** — production / production-adjacent /
   test / benchmark / fixture-dev-only, based on a traced caller chain,
   not an assumption.
2. **Only for production/production-adjacent findings** — editorial
   authority (a human/editorial decision) vs. classifier machinery (the
   mechanism that applies it).
3. **Only for editorial-authority findings** — would DB storage help, and
   what shape, without assuming "DB-worthy" always means "new table."

No code or schema is proposed or changed by this document. Where evidence
is incomplete, that is stated explicitly rather than filled with
assumption.

## Update (post-audit): headline finding since resolved

The wiring gap below was found and reported by this audit. It has since
been implemented and strongly verified — see
`docs/control-plane-phase3-production-wiring-status-v1.md` for the full
implementation, integration test, and dry-run parity evidence. Status is
"implemented + strongly verified, live rule activation pending" (not
CLOSED — live activation proof was explicitly deferred rather than
proven via a disproportionate full-corpus write or a newly-built scoped
mechanism). The finding below is left as originally written, as the
historical record of what this audit found.

## Headline finding: `classification_rules` is not wired into production

This is a new finding, independently verified (not just traced by the
audit agent — directly grep-confirmed):

```
db/classify-production.js:101   const editions = classifyForAllEditions(understanding);
classification/edition-classification.mjs:227
  export function classifyForAllEditions(understanding, thresholdOverride, item, allActiveRules = []) { ... }
```

`classify-production.js` — the actual production classification script,
whose output (`edition_story_classifications`) is what
`ui/src/adapter/productionAdapter.js` reads for the live reader UI — calls
`classifyForAllEditions()` with a single argument. `allActiveRules`
defaults to `[]`. **`classify-production.js` contains zero references to
`classification_rules` anywhere in the file** (confirmed via grep — no
import, no fetch call).

Consequence: regardless of whether `classification_rules` (the Fasa 3
table) has rows in it, production classification never sees them. The
Admin Read-Only UI shipped in Fasa 3 can correctly display an empty state
("0 rules") because there ARE 0 rules — but even if an admin's future
write path added rows, today's production script would silently continue
ignoring them, because the wiring between "fetch active rules" and "pass
them into the classifier" was never added at the production call site.

This is the same class of issue as the Source Registry finding (a write
surface exists with no live effect) — found independently this time, with
the caller chain traced and grep-confirmed before reporting, per the
explicit lesson from that earlier mistake.

**This is scoped separately from the 5-file audit below** — it's a wiring
gap in Fasa 3's own production integration, not a new editorial-authority
finding. Flagging it here because it changes the frame for item 5
(edition-rules.mjs) below: "extend `classification_rules`" is not just a
schema question while this gap exists.

## The 5 classifier files — re-verified

All 5 confirmed **production**, via a common caller chain:
`classification/lib/*.mjs` → `classification/story-understanding.mjs`
and/or `classification/edition-classification.mjs` →
`db/classify-production.js` → `edition_story_classifications` →
`ui/src/adapter/productionAdapter.js` (the live reader UI's data source).

| File | Step 1 (consumer) | Step 2 (authority vs machinery) | Step 3 (DB shape) |
|---|---|---|---|
| `desk-vocabulary.mjs` | Production, confirmed via `story-understanding.mjs` import | ~43+12 token→Subject/Geography mappings = editorial authority; matching loop = machinery | DB-worthy in principle. `schema-classification-rules-v1.sql`'s own header explicitly excludes this file from `classification_rules`' scope — it is a *different* shape (unconditional lookup table, not a condition/priority/action override). No documented minimal-shape decision exists; left as an open, unresolved design question rather than assumed. |
| `content-rules.mjs` | Production, same chain | ~40+ keyword phrases across 6 subjects = editorial authority; HTML-strip/match loop = machinery | DB-worthy in principle. **Structural similarity vs. semantic compatibility, kept distinct**: content-rules' keyword phrases are *structurally* similar to `classification_rules`' `rule_type: 'keyword'` (both are keyword→subject mappings) — but *semantically* incompatible: content-rules produces a weighted candidate subject to the confidence gate, while `classification_rules`' keyword type is an unconditional short-circuit per its own schema comment. Structural similarity here does NOT establish semantic compatibility. Moving phrases as-is would silently change their behavior from "evidence" to "override" — a real design decision, not a data migration. |
| `bernama-prefix.mjs` | Production, same chain | 5 token→Subject/Geography pairs (Bernama-specific) = editorial authority; parsing = machinery | DB-worthy in principle, low urgency. **Stability: UNVERIFIED** — the file's own comment claims no change since 2026-08-12, but this project has no git history available to independently confirm edit frequency. That claim is not used as evidence for anything in this audit; it is flagged, not trusted. Same "excluded from classification_rules' scope" caveat as desk-vocabulary. |
| `confidence-policy.mjs` | Production, confirmed via `edition-classification.mjs` import | Threshold values (0.6 global, 0.35 per-subject overrides) = editorial/calibration authority; `checkConfidenceGate()` comparison logic = machinery | Mixed, not a bare DB-worthy call: the file's own comments tie these numbers to a benchmark process (`classification/benchmark-confidence-threshold.mjs`) and flag the 0.35 overrides as an unvalidated manual unblock. A plain editable DB field would let an admin bypass that process. Needs a process design, not just storage. |
| `edition-rules.mjs` | Production, confirmed via `edition-classification.mjs` import | 1 active rule (ms-MY foreign-politics→Dunia) = editorial authority; `evaluateEditionRules()` priority/match loop = machinery | **Structural similarity vs. semantic compatibility, kept distinct**: this file's condition/priority/action shape is structurally the closest match to `classification_rules` of anything audited — but structural resemblance is not, by itself, evidence that the two are semantically interchangeable. No design doc confirms edition-rules' geography-condition logic actually maps cleanly onto `classification_rules`' field_code/subject_code XOR — that fit is this audit's own inference from reading schema comments side-by-side, explicitly not a confirmed decision. Separately, per the headline finding above, `classification_rules` isn't wired into production at all today, which is a precondition, not a shape question. |

## `state/reducer.js::excludeEverReleased()`

**Step 1:** Production (client-side) — confirmed via `App.jsx`'s direct
comment reference and `state/reducer.js` driving the UI's dispatch logic.

**Step 2/3: not applicable.** This isn't a config value (no keyword list,
threshold, or mapping) — it's control-flow logic filtering candidates
against in-memory `state.history`. The real gap here (confirmed by
reading the function and surrounding comments) is architectural: session
state resets on reload, isn't shared across devices, isn't backend-
checked. That's a persistence/consistency question, not an editorial-
content question — forcing a DB-worthy verdict onto it would mischaracterize
the finding. Unchanged from both the v1 audit and the original Fasa 1-3
completion audit.

## Other hardcoded editorial-shaped config — re-verified, not trusted from v1

**`ranking/candidate-scoring.mjs`: `FRESHNESS_BUCKETS`, `BOOST_WEIGHT`**

Step 1 re-confirmed independently (not taken on the file's own comment
alone): `state/editorialRankingAdapter.js` imports `scoreCandidates` from
this file; `state/reducer.js` imports from `editorialRankingAdapter.js`;
`state/rankingFlags.js` has `politics: 'editorial_v1'` — i.e. the flag
gating this path is actually on. **Classification: production, confirmed
via traced import chain**, matching the file's own claim (this is the
kind of check that caught the Source Registry problem elsewhere, and here
it held up).

Step 2: age→score tiers and the boost constant are editorial/calibration
judgment; the scoring formula combining them is machinery.

Step 3: DB-worthy candidates per the file's own "not locked, starting
parameter" comments, but these are numeric ranking constants with no
existing table shape they obviously fit — a distinct design question from
`classification_rules`, not an extension of it.

**`state/editions.js`: `EDITION_META`**

Step 1: production, confirmed (`App.jsx`, `AdminApp.jsx`,
`productionAdapter.js` all consume `EDITIONS`, built by merging
`EDITION_META` with DB-sourced taxonomy data).

Step 2: this is locale/direction/display-label identity config (e.g.
`'Malaysia · Malay Edition'`, RTL flag) — not a classification or ranking
decision. Flagged as likely **out of scope** for the editorial-authority
question rather than forced into a DB-worthy verdict. Worth noting:
`EDITIONS` is already partially DB-sourced — `loadEditionsFromDB()`
reassigns the taxonomy portion (labels/field codes) at runtime; only
`EDITION_META` itself (locale/direction/label) remains hardcoded.

## Known gaps in this audit (stated explicitly, not assumed clean)

- No exhaustive line-by-line sweep of `ui/src/` beyond the specific files
  traced above (`App.jsx`, `productionAdapter.js`, `editions.js`,
  `rankingFlags.js`). Inherited from the v1 audit; not closed here either.
- Bernama-prefix's "stable since 2026-08-12, no repeated hotfixes" claim
  is read from an in-file comment only — this project has no git history
  available to independently verify edit frequency.
- The plausible fit between `edition-rules.mjs`'s shape and
  `classification_rules`' `field_code`/`subject_code` XOR design is an
  inference from reading schema comments side-by-side, not a confirmed
  design decision anywhere in the docs.

## Summary

Two things need a decision before any new editorial-authority work is
designed:

1. **The `classification_rules` production-wiring gap** — the table's
   write surface (Fasa 3 Admin UI, RPCs) has no live effect today because
   `classify-production.js` never fetches or passes it. This is the same
   shape of problem as the Source Registry finding, independently found
   and grep-confirmed this time.
2. **None of the 5 classifier files' content is a drop-in fit for
   `classification_rules` as it exists** — desk-vocabulary and
   bernama-prefix are explicitly out of that table's documented scope;
   content-rules would need a semantics decision (candidate vs.
   override); confidence-policy needs a process decision, not just
   storage; edition-rules is the closest structural fit but is blocked on
   item 1 above regardless of shape.

No code, schema, or table design is proposed here, per instruction. This
is evidence, classification, and rationale only — ready for review before
any Fasa 4 or vocabulary/rules v2 proposal.
