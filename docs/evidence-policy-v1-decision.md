# Evidence Policy v1 — DECISION (Sesi 3C Closure, 2026-08-12)

Status: **LOCKED where marked. This document is the production behavior
record** — supersedes `docs/evidence-policy-v1.md`'s illustrative
proposal with real, adjudicated decisions. Closes the Sesi 3B.2C
calibration arc (`docs/evidence-calibration-freeze.md`). After this
document, classification engine work pauses and focus shifts to UI/UX
per Izzat's direction, confirmed by ChatGPT.

## Why this document exists

Four calibration batches, all adjudicated by Izzat against the live RSS
corpus:

| Batch | What it tested | Result |
|---|---|---|
| A (`docs/batch-a-adjudication.md`) | Weak subject + strong geography → geography fallback for ms-MY | ✅ 20/20 confirmed |
| M (`docs/batch-m-adjudication.md`) | Multi-mechanism agreement trustworthy? | ✅ 19/19 confirmed |
| U (`docs/batch-u-adjudication.md`) | Single Medium mechanism trustworthy alone? | ⚠️ 4 `publisher_taxonomy_mismatch` errors of 6 flagged |
| Medium (`docs/batch-medium-adjudication.md`) | Two independent Medium mechanisms agreeing? | ✅ 14/14 confirmed |

This is enough evidence to build a product on. The open question going
forward is volume and edge cases, not "how the engine behaves" — that's
now known.

## LOCKED

1. **Evidence generates candidates; it is never itself a placement.**
   Applies uniformly regardless of evidence class.
2. **Edition determines placement**, not publisher taxonomy. Confirmed
   necessary by Batch U: publisher categorization (URL desk, RSS
   category) reflects *the publisher's own* editorial view, not
   automatically Adjung's.
3. **A single publisher signal is never absolute truth.** `url_path`
   alone or `rss_category` alone → treated as a candidate signal only,
   not a trusted placement (Batch U: 4/6 flagged errors, all
   `publisher_taxonomy_mismatch` — real, internally-consistent publisher
   evidence that simply didn't match Adjung's taxonomy).
4. **Multi-mechanism agreement is trusted.** Two or more independent
   evidence mechanisms (e.g. `url_segment` + `rss_category`, or either
   plus `feed_category`) agreeing on the same value → usable directly.
   Confirmed by Batch M (19/19) and Batch Medium (14/14) — 33/33
   combined, 0 errors.
5. **Weak subject + strong geography → geography fallback, for ms-MY.**
   Confirmed by Batch A (20/20). `Dunia`/`Malaysia` placement for a
   low-confidence subject candidate matches real ms-MY portal practice —
   not a workaround, an editorial placement decision in its own right
   (`docs/structural-evidence-fallback-policy.md` Policy B).
6. **Weak subject + NO structural evidence at all → `Unclassified`.**
   Per `docs/structural-evidence-fallback-policy.md` Policy C — don't
   auto-guess a placement from a bare content-rule keyword match alone
   (e.g. "Sultan Brunei hubungi Anwar" from `title_keyword:menteri`,
   zero other evidence).
7. **Same-source structural conflict resolves URL desk > RSS category >
   other structural signals**, per
   `docs/edition-rule-engine-contract.md`'s v1 Conflict Resolution
   section. Scoped to same-source only (one publisher's own two
   mechanisms disagreeing) — not a claim that URL always wins
   cross-source disagreement.
8. **Ranking must account for classification confidence and evidence
   quality — documented as a requirement, not yet implemented.**
   `Classification Confidence ≠ Visibility Priority`: two stories in the
   same Bidang should not rank equally just because they share a
   `field`. A Strong/multi-mechanism-agreement story should outrank a
   single-mechanism-evidence story in the same field. This is a
   requirement on whichever system computes Active Set ranking — not
   designed or implemented here.
9. **Multi-placement is deferred, not built for v1.** Per Izzat's own
   resolution (`docs/multi-placement-consideration.md`): genuine
   cross-source ambiguity is expected to resolve through source
   diversity over time, not per-story dual placement. One primary
   placement per story per edition; alternative candidates stay in
   Story Understanding's evidence trail, not discarded.

## DEFERRED (explicitly not built, not scheduled)

- **Entity detection** — repeatedly deferred throughout this arc
  (`docs/story-understanding-engine-spec.md`, `docs/sesi3b1-resolver-audit.md`).
  Batch U's errors were editorial-ontology mismatches, not missing-entity
  problems — entity detection wouldn't have fixed Foxconn/Ringgit/Airline/
  drone.
- **Multi-placement machinery** — see LOCKED §9.
- **More aggressive content-rule keywords** — the Weak-evidence
  unreliability (menteri/mahkamah/court/kerajaan/didakwa,
  `docs/evidence-calibration-report.md`) is a known, accepted limitation,
  not a queue for keyword expansion.
- **Automatic/passive "learning" from production RSS.** Correcting an
  analogy from this session: this system does **not** get smarter on its
  own as more RSS flows through it. It is NOT:
  ```
  RSS volume increases → engine automatically improves
  ```
  It IS:
  ```
  RSS volume increases → failure cases accumulate → editorial judgement
  accumulates → rules/evidence model gets manually revised
  ```
  This is an **editorial calibration loop**, not machine learning. Real
  production RSS is valuable specifically as a source of future
  calibration batches (the same Batch A/M/U/Medium pattern, repeated
  periodically against live data) — not as a mechanism that improves
  results without human review.

## What happens now

1. Classification engine files remain as they are at this commit
   (`edition-classification.mjs`, `confidence-policy.mjs`,
   `edition-rules.mjs`, `edition-taxonomy.mjs`, `story-understanding.mjs`,
   `content-rules.mjs`) — this document describes their *validated
   behavior*, not a pending implementation. No further classification
   engine changes are scheduled.
2. Focus shifts to UI/UX per Izzat's direction.
3. Production RSS becomes the source for periodic future calibration —
   same batch-adjudication methodology, run again once there's enough
   real usage/volume to justify it, not on a fixed schedule.
