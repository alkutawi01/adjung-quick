# Batch A Adjudication — Izzat, 2026-08-12

Source: `classification/generate-batch-a.mjs` output, 20 items.
Reviewed by: Izzat (Chief Editor), via chat relay.

## Verdict: ALL 20 CORRECT

Izzat's exact words: **"betul dh. ni yg versi bahasa melayu kan? portal
berita bahasa melayu mmg akan klasifikasikan mcm tu"** — confirmed this is
the ms-MY edition view, and real Malay-language news portals genuinely do
classify foreign crime/disaster stories this way (bucketed under Dunia)
and domestic institutional stories under Malaysia/local labels, even when
the underlying subject signal (Jenayah/Politik/Bencana) was correct but
low-confidence.

## What this confirms

Per Batch A's purpose (`docs/evidence-calibration-freeze.md` — "False
positive recovery: does the low-confidence fallback discard candidates
that were wrong to begin with?"):

**`low_confidence_action: "fallback_geography"` is editorially correct
for this population.** All 20 cases were `title_keyword`-only (Weak
class) subject candidates — mostly content-rule false positives
(mahkamah/court, menteri, didakwa) — that got rerouted to a
geography-based placement (Dunia for foreign stories, Malaysia for
domestic ones). Izzat's judgment: this reroute matches real ms-MY
editorial practice, not just an accident of the fallback logic.

## What this does NOT yet confirm

- Whether this generalizes to `en`/`ar` editions (Batch A was ms-MY only).
- Whether Medium-class evidence (Batch M/U/Medium) behaves the same way —
  those are testing a different question (agreement/reliability, not
  false-positive recovery) and are NOT settled by this result.
- The exact `minimum_candidate_confidence` numeric value — Batch A
  confirms the *behavior* (fallback to geography) is right, not a
  specific threshold number.

## Status

Batch A: **ADJUDICATED, CONFIRMED CORRECT.** Per
`docs/evidence-calibration-freeze.md`, this is one of four batches that
must all be adjudicated before the classification engine's frozen files
can be touched again. Batches M, U, Medium remain pending.
