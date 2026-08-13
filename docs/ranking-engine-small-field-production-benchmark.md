# Ranking Engine Small-Field Production Benchmark (2026-08-13)

Status: **Result record, no code changes here.** Per ChatGPT: does
`ranking/editorial-composition.mjs` stay calm when a field genuinely has
few sources, or does it over-search for diversity that isn't really
there? `docs/ranking-engine-benchmark-v1.md`/`v2.md` only tested Politik
(many active sources). This runs the full pipeline
(`ranking/small-field-benchmark-runner.mjs`) against real production data
for three niche fields at the opposite end of the source-count spectrum.

## Results

| Field | Real candidates | Sources | Active Set | Composition swaps |
|---|---|---|---|---|
| Sains | 5 | 100% `rss-mosti` | 5/10 | 0 |
| Agama | 24 | `rss-ikim` 10, `rss-utusan-agama` 10, `rss-jaipp` 4 | 10/10, spread 3-4-3 | 0 |
| Pendidikan | 193 | 100% `rss-kpm` | 10/10 | 0 |

## Reading the results

**Sains (5 candidates, single source)**: stays calm exactly as designed
— all 5 real MOSTI candidates fill the Active Set, no forced diversity.
Matches Benchmark v1 Case E's expectation directly with real data, not
just the synthetic version.

**Agama (24 candidates, 3 real sources)**: Diversity Selection alone
already produced a healthy 3-4-3 spread across `rss-ikim`,
`rss-utusan-agama`, `rss-jaipp` — Composition correctly found nothing to
correct (0 swaps), same pattern as the Politik result in
`docs/ranking-engine-benchmark-v1.md`/`v2.md`.

**Pendidikan (193 candidates, single source)**: the most interesting
result. 0 Composition swaps here is correct, but for a **different
reason** than Sains — this is `docs/known-issues.md`'s previously-documented
finding that `rss-kpm` is currently the ONLY real Pendidikan source (all
193 candidates come from one feed). There is no alternative in the pool
for Composition to swap toward, so the mechanism correctly does nothing —
but this is a **genuine single-source field**, not
`docs/editorial-composition-benchmark-v1.md` Case C's "genuine dominant
event" (a temporary consensus moment). Mechanically identical outcome (no
swap), structurally different cause. Worth naming the distinction so a
future reader doesn't conflate "Composition did nothing because sources
genuinely agree today" with "Composition did nothing because there is
only one source, period."

## What this confirms

- Composition does not force fake diversity on thin fields (Sains,
  Pendidikan) — matches the design intent directly.
- Composition does not unnecessarily intervene when Diversity Selection
  already produced a reasonable spread (Agama) — matches Politik's
  earlier result.
- The 0.5 dominance threshold / 0.75 quality floor ratio (both marked
  "calibration required," `ranking/editorial-composition.mjs`,
  `docs/editorial-composition-policy-v1.md`) did not need adjustment for
  ANY of these three real fields to produce a sane result — no evidence
  yet that per-field tuning is actually necessary, though the
  possibility remains open per the "calibration required" status.

## What this does NOT test

- A field with moderate source diversity (2-4 sources) where dominance
  genuinely sits near the 50% threshold boundary — none of the three
  sampled fields landed there; Sains/Pendidikan are 100%-one-source,
  Agama already had healthy natural spread. This boundary case remains
  untested against real data.
- Whether the KPM-single-source situation for Pendidikan should be
  addressed at the SOURCE layer (adding more education sources, per the
  still-deferred finding in `docs/niche-field-coverage-audit.md`) rather
  than the ranking layer — out of scope here, this document only reports
  ranking/composition behavior against whatever sources currently exist.

## Next

Per ChatGPT: add a ranking explainability report format
(`ranking/explainability-report.mjs`), then discuss integration.
