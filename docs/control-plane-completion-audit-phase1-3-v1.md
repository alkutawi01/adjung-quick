# Control Plane Completion Audit — Fasa 1-3

Read-only audit. No code or schema changed by this document. Produced after
Backend Control Plane Fasa 1 (Source Registry), Fasa 2 (Taxonomy), and Fasa 3
(Classification Rules) were all closed, per ChatGPT's explicit request to
audit before proposing Fasa 4.

**Question this audit answers:** after Source Registry, Taxonomy, and
Classification Rules became backend-controlled, what editorial decisions are
still hardcoded in code — and of those, which are genuine editorial
authority that should eventually move to the DB, versus legitimate
classifier machinery that should stay in code?

## Headline finding: Fasa 1 (Source Registry) cutover is incomplete

The Phase 1 admin UI/adapter (`db/source-registry-adapter.mjs`) writes to
`sources_registry_staging` — explicitly marked STAGING ONLY, pending a
separately-approved production cutover. But **no script in the ingest or
ranking pipeline reads from that table, or from production `sources`, at
runtime.** Every fetch/rank/classify script (`lab/run.js`, `run-control.js`,
`run-match.js`, all of `classification/*.mjs`, `ranking/*.mjs`,
`db/ingest-test.js`, `db/daily-observation.mjs`) still imports `RSS_SOURCES`
directly from `lab/sources.js` — the original hardcoded 43-entry array
(`trustScore`, `sourceType`, `knownCategory`, `excludePatterns`, `status`).

The only DB↔code relationship is a one-way, manually-triggered sync
(`db/backfill-source-registry-staging.mjs`,
`db/generate-source-registry-production-migration.mjs`) copying
`lab/sources.js` → DB. Nothing copies the other direction.

**Consequence:** an admin editing a source's trust score, disabling a
source, or adding a new one via the Fasa 1 UI today has **zero effect on
production ingestion/ranking**. "Source Registry is backend-controlled" is
true only for the admin-editing surface, not for the pipeline that actually
runs. This is a gap in Fasa 1's own completion, not a new Fasa 4 item — it
should be closed (or explicitly acknowledged and deferred) before Fasa 4
adds anything that assumes Fasa 1 is fully live.

## Classifier files — editorial authority vs. machinery

| File | Hardcoded content | Verdict | Why |
|---|---|---|---|
| `classification/lib/desk-vocabulary.mjs` | ~43 subject-vocabulary pairs, 12 geography pairs, 13-item structural-noise set | **DB-worthy** | Pure "this desk/URL-segment token means this Bidang" mappings — same shape as Fasa 2/3 already moved to DB. File's own edit history shows repeated "found a live URL, add a mapping" changes (e.g. `'kes'` added 2026-08-16) — exactly what Fasa 3 was built to let an editor do without a deploy. |
| `classification/lib/content-rules.mjs` | ~61 keyword phrases across 6 subjects (Crime, Disaster, Politics, Sports, Health, Environment) | **DB-worthy**, but functionally redundant with Fasa 3's `rule_type: 'keyword'` rules | File's own header calls itself "deliberately small, not a finished ruleset." Three separate 2026-08-13 hotfixes (Environment, Health, Disaster) were all "production title missed, add a phrase" — the same workflow `classification_rules` keyword rules already serve, except content-rules produces a *candidate* (subject to confidence gate) rather than an authoritative short-circuit. Recommend routing future additions through `classification_rules` rather than building a parallel table; the HTML-stripping/matching mechanism itself stays in code. |
| `classification/lib/bernama-prefix.mjs` | 5 hardcoded token→subject/geography pairs, single source (Bernama) | **DB-worthy in principle, low priority** | Same shape as desk-vocabulary but tiny and stable since 2026-08-12 — no evidence of repeated hotfixing. Fold into desk-vocabulary's table later rather than treating as urgent. |
| `classification/lib/confidence-policy.mjs` | Global threshold 0.6, per-subject overrides (Disaster/Environment/Health = 0.35), empty per-edition override slot | **Mixed** — values DB-worthy, gate logic stays in code | File itself says 0.6 "NOT locked"; the 0.35 overrides were a manual unblock (2026-08-13) pending a benchmark re-run, with a noted unvalidated false-positive risk ("kemarau emas"). A real calibration lever, but numeric and coupled to `classification/benchmark-confidence-threshold.mjs` — should not become a bare open text field; any DB exposure should require/log a benchmark re-run, not just an admin typing a new number. |
| `classification/lib/edition-rules.mjs` | 1 active rule (ms-MY: foreign politics → Dunia); en-global/ar-global empty | **DB-worthy — clearest case of the five** | Condition→action, priority-ordered, evaluated per edition — structurally near-identical to Fasa 3's `classification_rules`. File's own comment defers generalizing to Crime/Disaster/Business as "needs its own evidence." Strongest recommendation: extend `classification_rules` with a geography-condition/display-field rule type rather than building a second hardcoded registry — `classification-rules-resolver.mjs`'s `pickWinner()` is already a near-superset of `evaluateEditionRules()`. |

## Confirmed unchanged from the earlier audit

- **`classification/lib/taxonomy-registry.mjs`** — still contains the full
  hardcoded literal, but only as a fallback; `loadTaxonomyRegistryFromDB()`
  is the only place it's ever reassigned at runtime, fail-closed on zero
  rows. Runtime behavior is DB-controlled (Fasa 2), matching what was
  already confirmed.
- **`state/reducer.js::excludeEverReleased()`** — still frontend-only,
  in-memory. Filters clusters against every `storyId` ever released
  (tracked in reducer `state.history`), called at all 4 candidate-pool
  rebuild sites. Resets on reload/new session, not shared across
  devices, not backend-checked. Untouched by Fasa 1-3 — a frontend
  data-loss/consistency concern more than a "should be DB" editorial
  question.

## Other hardcoded editorial-shaped config found (broader sweep)

| Location | Hardcoded | Editorial or mechanism |
|---|---|---|
| `ranking/candidate-scoring.mjs:23-29` `FRESHNESS_BUCKETS` | 5 age→score tiers | DB-worthy candidate — file calls itself "a STARTING PARAMETER, not locked," live in production for ms-MY.Politik. |
| `ranking/candidate-scoring.mjs:61` `BOOST_WEIGHT = 40` | Single boost-weight constant | DB-worthy candidate — explicitly framed as a calibration knob, centralized to one edit point already. |
| `ranking/candidate-scoring.mjs:72` confidence-modifier `×10` multiplier | Fixed multiplier | Minor, likely stays as part of the scoring formula's shape; interacts with confidence-policy thresholds. |
| `state/editions.js:19-45` `EDITION_META` | Per-edition locale/direction/display label | Borderline — fixed identity config, not really an editorial classification decision, low urgency. |
| `lab/sources.js` (43 entries) | trustScore, sourceType, knownCategory, excludePatterns, status | Confirmed still fully code-driven at runtime — see headline finding above. |
| `classification/lib/edition-taxonomy.mjs` | `resolveDefaultPlacement()` and related mapping logic | Not fully inspected this pass — depended on by both `classification-rules-resolver.mjs` and `edition-rules.mjs`; flagged for a follow-up read if full resolver-chain coverage is wanted. |

No other standalone keyword lists, priority numbers, or source-trust flags
were found outside the above in `classification/`, `lab/`, `state/`,
`ranking/`. `ui/src/` was not exhaustively swept beyond confirming admin
adapters write to DB tables already covered by Fasa 1-3 — a dedicated
`ui/src/` sweep would be needed for full confidence on that directory.

## Summary recommendation

Before Fasa 4 (whatever it turns out to be), two things are worth deciding
explicitly rather than by default:

1. **Close the Fasa 1 gap** — decide whether to complete the production
   cutover (pipeline reads from `sources` DB table, not `lab/sources.js`)
   or explicitly document that Fasa 1 remains admin-editing-only for now.
   Leaving it silently half-done risks an admin believing an edit took
   effect when it didn't.
2. **Decide the shape of a "vocabulary/rules v2"** — desk-vocabulary,
   content-rules, and edition-rules are all editorial-authority-shaped and
   two of the three (content-rules, edition-rules) already overlap
   structurally with the existing `classification_rules` table. Rather than
   building 3 new tables, the cheaper path is likely extending
   `classification_rules` with 1-2 new rule shapes (geography-condition,
   plain vocabulary mapping) — a design question for whenever this becomes
   the active phase, not a Fasa 4 pre-requisite.

Everything else (confidence-policy numeric values, freshness/boost ranking
constants, edition metadata) is a smaller, lower-urgency calibration
question, not a structural gap.
