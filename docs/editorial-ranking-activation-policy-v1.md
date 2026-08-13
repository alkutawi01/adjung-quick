# Editorial Ranking Activation Policy v1 (2026-08-13)

Status: **Policy document, per ChatGPT — written before any production
wiring.** This is the first time the Editorial Ranking Engine touches a
real reader's path. Same controlled-entry discipline as the
classification calibration arc — activation is not a switch-flip, it's a
scoped, monitored, reversible step.

## 1. Rollback criteria

Rollback (flip the flag for `ms-MY.Politik` back to `legacy`) is
triggered by:

- ❌ runtime error in the ranking pipeline
- ❌ Active Set comes back empty when candidates genuinely exist
- ❌ ranking latency becomes a real problem (noticeably slower than
  legacy's simple sort)
- ❌ editorial review finds a MAJOR regression (not a single debatable
  story — a pattern, e.g. a whole class of legitimate content
  systematically excluded)

Rollback is **NOT** triggered by:

- "output differs from legacy" — difference is expected and is the whole
  point (`docs/editorial-ranking-shadow-evaluation-v1.md` already showed
  Politik at 70% stability, by design)

## 2. Comparison period

Activation does not mean shadow mode stops. Per ChatGPT:

```
Reader sees:       editorial_v1 (for ms-MY.Politik)
Monitoring runs:    legacy vs editorial_v1, in parallel (shadow mode continues)
```

This lets real day-to-day stability, daily change patterns, and edge
cases keep being observed AFTER activation, not just in the one-time
shadow evaluation that preceded it. No fixed end date set here — the
comparison period continues until there's a specific reason to stop
(e.g. confidence is high enough that shadow monitoring for Politik
specifically is no longer informative).

## 3. Explainability requirement

Every slot in `ms-MY.Politik`'s live Active Set must be able to answer
"why is this story here?" — already satisfied by
`ranking/explainability-report.mjs`'s `selectedBy[]` output shape,
carried through to whatever surfaces this in production (not necessarily
reader-facing UI yet — at minimum, available for Izzat/editorial review
on demand).

## 4. Explicit non-goals of this activation

Locking `editorial_v1` for `ms-MY.Politik` does **NOT** mean:

- ❌ the Editorial Value Dimension gap
  (`docs/editorial-value-dimension-discovery.md`) is considered solved
- ❌ every field will follow the same model — each field gets its own
  activation decision, on its own evidence
- ❌ AI ranking is now needed or planned — this remains a deterministic,
  editor-judgment-encoded engine, per
  `docs/ranking-engine-contract-v1.md` §4/§5

## 5. Wiring approach

Per ChatGPT: do NOT touch `ranking/candidate-scoring.mjs`,
`ranking/diversity-selection.mjs`, or `ranking/editorial-composition.mjs`
during activation — those are already benchmarked and reviewed. The ONLY
new code is a **feature flag resolver**, config-driven, never a hardcoded
field check inline in the adapter:

```json
{
  "ms-MY": {
    "Politik": "editorial_v1"
  }
}
```

Every (edition, field) not listed defaults to `legacy`. This is what
makes future activation (Agama, Teknologi, Sains, once each has its own
evidence) a config change, not a code change.

```js
if (rankingFlags[edition]?.[field] === 'editorial_v1') {
  useEditorialRanking();
} else {
  useLegacyRanking();
}
```

## 6. Live verification checklist (after wiring)

- [ ] 10 slots come back for `ms-MY` / Politik
- [ ] no duplicate story in the Active Set
- [ ] source distribution looks reasonable (not one source dominating)
- [ ] opening a story → Brief still shows the matching representation
- [ ] switching edition away from `ms-MY` and back still works correctly
      (editorial_v1 is scoped to `ms-MY.Politik` only — every other
      edition/field must be completely unaffected)

## Next

1. Wire the feature flag config + resolver (this document's §5).
2. Activate `ms-MY.Politik` → `editorial_v1` in the config.
3. Run the live verification checklist (§6) against the real running app.
4. Report results — this is Adjung Quick's first real reader-facing use
   of the Editorial Ranking Engine.
