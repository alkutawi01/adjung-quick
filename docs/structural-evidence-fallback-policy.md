# Structural Evidence Fallback Policy (proposal, 2026-08-12 — NOT locked)

Status: **PROPOSAL only, per the active Calibration Freeze
(`docs/evidence-calibration-freeze.md`). No implementation, no code
change.** Emerged from Izzat's two follow-up questions while reviewing
Batch M — refines, but does not contradict, Batch A's confirmed result.

## Why this refines Batch A rather than contradicting it

Batch A confirmed: for ms-MY, a weak subject candidate falling back to a
geography-based placement (`Dunia`/`Malaysia`) matches real Malay-portal
editorial practice. That result is unchanged. What this document adds:
**"weak subject" was actually two different situations we'd been
treating as one.**

**Weak subject + strong geography** — e.g. `Crime@0.4` (title_keyword
only) but `World@0.98` (structural, from `rss_category`/`url_segment`).
This is what Batch A actually tested and confirmed:
`geography_fallback` is the right call.

**Weak subject + NO structural evidence at all** — the real case that
surfaced Izzat's question. Example: *"Sultan Brunei hubungi Anwar,
doakan kesihatan"* — `Politics@0.4` from a bare `title_keyword:menteri`
match, with **zero** `rss_category`, `url_segment`, or `feed_category`
evidence anywhere (confirmed against `docs/sesi3a2-evidence-quality-audit.md`'s
original record of this exact case). The engine doesn't have a weak
guess propped up by strong geography here — it has *no structural
evidence whatsoever*, just one bare keyword.

These are different enough to warrant different handling.

## Three policies, not one blanket rule

### Policy A — Structural evidence exists

- Subject candidate backed by Strong/Medium evidence → use it directly
  as subject placement (per `docs/evidence-quality-matrix-contract.md`).
- **Genuine structural conflict** (e.g. `rss_category:Politics` vs
  `url_segment:Environment`, both Medium, disagreeing) → **URL desk path
  wins as the default tie-breaker.** Per Izzat: "portal takkan masukkan
  berita dalam URL yg salah" — a publisher's URL structure reflects a
  more deliberate editorial decision than an RSS `<category>` tag, which
  tends to be looser/more automated.
- The losing candidate is **not discarded** from Story Understanding's
  output — it stays visible as a secondary candidate with a
  `resolution_reason: url_path_tiebreaker` note, so the system still
  knows the publisher gave two signals. This connects to
  `docs/multi-placement-consideration.md`'s not-yet-decided
  primary/secondary placement idea, without committing to it here.

### Policy B — Subject weak, geography strong (CONFIRMED via Batch A)

- Weak/title-keyword-only subject + strong geography evidence →
  `geography_fallback` (`Dunia`/`Malaysia` for ms-MY). Already validated
  by Izzat's Batch A review — unchanged by this document.

### Policy C — No structural evidence at all (new proposal)

- Weak/title-keyword-only subject with **no** corroborating structural
  evidence (no geography, no rss_category, no url_segment, no
  feed_category) → **`Unclassified`**, not an auto-guessed placement.
- Rationale (Izzat): a story with zero structural taxonomy from this
  source will very likely get picked up with accurate, specific
  categorization by another RSS source covering the same event — so
  skipping the auto-guess here isn't a meaningful coverage loss, and
  avoids publishing a confident-looking but evidence-free guess.

## Reframing "Unclassified"

Not a coverage failure. Per ChatGPT: "5% Unclassified yang jujur" (an
honest 5% unclassified) is preferable to "5% berita yang sistem yakin
palsu dan letak dalam bidang yang salah" (5% of stories the system
confidently — and wrongly — places in the wrong Bidang). Unclassified
means *"available evidence isn't strong enough to auto-place this,"* not
*"this story cannot be classified."*

## Three clean concepts this proposal produces

- **Candidate** — what the evidence says (Story Understanding's output,
  unchanged, never resolved to one).
- **Placement** — what the edition chooses to display (Edition
  Classification's output, informed by Policy A/B/C).
- **Unclassified** — evidence available isn't strong enough for an
  automatic placement; a legitimate, honest outcome, not an error state.

## Explicitly out of scope / not decided here

- No code implemented — `edition-classification.mjs`,
  `confidence-policy.mjs`, `edition-rules.mjs` remain frozen per
  `docs/evidence-calibration-freeze.md` until Batch M/U/Medium
  adjudication completes.
- Exact rule for what counts as "genuine structural conflict" (Policy A)
  vs. two independent Medium signals that happen to agree — not
  formalized, needs real conflict-case volume from Batch M/U/Medium.
- Whether Policy C's Unclassified stories get surfaced anywhere for
  manual editor review, and how — a product/UI question, not addressed
  here.
- Relationship to `min_subject_confidence`/`minimum_candidate_confidence`
  — this three-policy model may make a single numeric threshold less
  central than originally assumed (consistent with
  `docs/sesi3b2c1-benchmark-results.md`'s finding that threshold tuning
  alone doesn't move the unclassified rate).

## Next

Stays a proposal until Batch M/U/Medium adjudication is complete and the
Calibration Freeze lifts. Then: fold this into the Policy Matrix
(`docs/evidence-calibration-freeze.md`) as one of the decisions made from
real evidence, not before.
