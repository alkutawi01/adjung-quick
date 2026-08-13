# Editorial Ranking Integration Plan v1 (2026-08-13)

Status: **Plan document, per ChatGPT — no production code touched.**
Written before any integration work, same discipline as every other
contract in this arc: Policy → Benchmark → Prototype → Evaluation →
Integrate. The prototype (`ranking/`) and every benchmark have produced
evidence; this document is where that evidence turns into a plan for
touching real production code — not the touching itself.

## 1. Current architecture (legacy path)

```
edition_story_classifications
        ↓
productionAdapter.js (fetchRankedQueue)
        ↓
state/reducer.js (toActiveSetEntries — filters by edition locale,
                   scopes to selected Bidang)
        ↓
Active Set (10 slots, ordered by editorial_score set at ingestion time)
```

Ranking today is a single number (`editorial_score`) computed once at
`db/ingest-production.js` time and never revisited — no diversity
awareness, no composition, no explainability. This is what
`docs/ui-2-closure-report.md` and every UI-2 bug fix were built on top
of; it has been stable enough to ship UI-2A/2B against.

## 2. New architecture (editorial path)

```
edition_story_classifications
        ↓
Representation Eligibility (already exists,
                             docs/edition-representation-eligibility-policy.md)
        ↓
Candidate Scoring       (ranking/candidate-scoring.mjs)
        ↓
Diversity Selection     (ranking/diversity-selection.mjs)
        ↓
Editorial Composition   (ranking/editorial-composition.mjs)
        ↓
Explainability          (ranking/explainability-report.mjs)
        ↓
Active Set (10 slots)
```

Full flow context, matching the layering established across every
contract this session:

```
RSS
 ↓
Clustering
 ↓
Story Understanding
 ↓
Edition Placement
 ↓
Representation Eligibility
 ↓
Candidate Scoring
 ↓
Diversity Selection
 ↓
Editorial Composition
 ↓
Explainability
 ↓
Active Set
```

## 3. Shadow mode

Before either path is authoritative for a real reader, run BOTH for the
same Edition + Field and compare outputs — never let `editorial_v1`
affect what a reader actually sees until it's been evaluated this way.

```
For a given (edition, field):
  legacy_result   = current productionAdapter.js + reducer path
  editorial_result = new ranking/ pipeline

Compare:
  - overlap: how many of the 10 slots agree?
  - divergence: which stories does editorial_v1 include that legacy
    excludes, and vice versa?
  - explainability: for each divergence, is editorial_v1's reason
    (selectedBy[]) editorially defensible?
```

Shadow mode produces comparison LOGS/reports only — it does not write to
`edition_story_classifications`, does not affect
`productionAdapter.js`'s output, and is invisible to any reader. This is
the step that turns "does this look reasonable in isolated benchmarks"
into "does this look reasonable against everything the legacy engine
already handles."

## 4. Feature flag — scope and fallback

**Scoped per (edition, field), never global.** Per ChatGPT: different
fields are at genuinely different maturity — Politik has enough source
diversity to exercise Diversity Selection and Composition meaningfully;
Sains/Pendidikan are single-source fields where the new pipeline
currently does the same thing the legacy path already does (see
`docs/ranking-engine-small-field-production-benchmark.md`) — no reason to
gate those behind extra risk yet.

```
rankingEngineVersion: {
  'ms-MY': {
    'Politik': 'editorial_v1',
    'Sains': 'legacy',
    ...
  },
  'en-global': {
    'Politics': 'legacy',
    ...
  }
}
```

Default for every (edition, field) not explicitly listed: `legacy`. A
new field or edition never silently inherits `editorial_v1` — it must be
opted in deliberately, per field, after its own shadow-mode evidence.

## 5. Rollback plan

**If `editorial_v1` misbehaves for a given (edition, field): flip that
one entry back to `legacy` in the flag map.** No data migration required
— `editorial_v1` never writes to `edition_story_classifications` or any
other persisted table; it only computes an in-memory Active Set
selection at read time, same as the legacy path does today. Rolling back
is a config change, not a database operation. This is possible precisely
because the ranking prototype has been kept isolated
(`ranking/` — never imported by `productionAdapter.js`, `db/classify-production.js`,
or the reducer) throughout this entire arc.

## 6. Explicitly not done yet

- No change to `productionAdapter.js`, `db/classify-production.js`, or
  `state/reducer.js`.
- No feature flag activated for any real (edition, field) — the flag
  MECHANISM is planned here; turning it on for even one field is a
  future step, not part of this document.
- No shadow-mode comparison tooling built yet — §3 describes what it
  needs to do, not an implementation.
- Editorial Composition classes A-D, angle diversity, manual editorial
  weight — all still out of scope, per
  `docs/editorial-composition-policy-v1.md`.

## Next

Per ChatGPT: only after this plan is reviewed does actual integration
work (shadow-mode tooling first, then a real feature-flag activation for
one well-understood field like Politik) begin.
