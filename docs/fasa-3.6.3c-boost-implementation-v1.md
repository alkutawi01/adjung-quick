# FASA 3.6.3c — Boost: Implementation Report (2026-08-13)

Status: `[x] Implemented` `[x] Tested` `[~] Verified — see the honest gap below` `[x] Closed — "implementation complete, human action surface deferred"`

## ChatGPT's decision (2026-08-13)

Reviewed and closed. On the surface question raised below, the ruling
was explicit: **do not put Boost in the Review Queue.** The finding was
judged correct and not a bug — it revealed that the Review Queue and
Boost have genuinely different purposes (fixing problems vs. promoting
good stories). A separate editorial surface for Boost is deferred to a
later phase, not built now.

3.6.3c therefore closes as **implementation complete, human action
surface deferred** — the mechanism is real, tested, and correct; the
place a human reaches it is future work.

Decision followed: **Option A** — Boost offered only where the Editorial
Ranking Engine actually consumes it. Plan:
`docs/boost-action-plan-v1.md`.

## What was built

| Piece | File |
|---|---|
| `BOOST_WEIGHT = 40`, single tunable constant | `ranking/candidate-scoring.mjs` |
| Boost applied at **scoring** (never after selection) | `ranking/candidate-scoring.mjs` |
| `boosted` flag threaded through the candidate shape | `state/editorialRankingAdapter.js` |
| `boosted` derived from active overrides | `ui/src/adapter/productionAdapter.js` |
| Boost write path | `ui/src/admin/reviewQueueAdapter.js` |
| Conditional availability + explanation | `ui/src/admin/AdminApp.jsx`, `ReviewQueueCard.jsx` |
| Tests | `ranking/boost-scoring.test.mjs` |

Per ChatGPT's note, `BOOST_WEIGHT` lives in exactly one place — a
calibration change is a one-line edit, not a search across files.

No schema migration: `story_overrides`' `override_type` CHECK already
allowed `'boost'`.

## Honest availability constraint (the point of Option A)

Boost appears only when
`getRankingVersion(editionId, entry.field) === 'editorial_v1'`.
Verified live, all four cases:

| Case | Gate |
|---|---|
| `ms-MY` / `Politik` | ✅ true |
| `ms-MY` / `Bencana` | ❌ false |
| `ms-MY` / no field | ❌ false |
| `en-global` / `Politics` | ❌ false |

Where unavailable *and the story has a Bidang*, the card explains why
rather than silently omitting a button, per ChatGPT's amendment:

> "Naikkan belum tersedia untuk bidang ini. Bidang ini masih menggunakan
> pemilihan berita automatik biasa."

A story with **no** Bidang shows nothing — it has no ranking contest to
enter at all, so "unavailable" would be misleading; the real problem
there is that it's unclassified, which the card already says.

## ⚠️ Boost's UI surface is currently empty in practice

Live check of the real ms-MY queue: **43 entries — none in Politik.**

```
(none): 11   Bencana: 13   Jenayah: 6   Dunia: 5   Kesihatan: 3   Alam Sekitar: 5
```

So although Boost is fully implemented, correct, and tested, **an admin
cannot currently reach it**, because:

1. Only `ms-MY.Politik` runs `editorial_v1`, and
2. the Review Queue shows only unclassified/low-confidence stories, and
3. there happen to be no low-confidence Politik stories right now.

This is not a bug — it's Option A behaving exactly as intended, and
arguably a sign the Review Queue may be the wrong home for Boost.
Hide/reclassify are *problem-fixing* actions, which is what the queue
surfaces; Boost is a *promotion* action, which applies to correctly
classified stories the queue deliberately excludes. Flagged for
ChatGPT's judgement rather than resolved unilaterally — it's a product
decision, not a technical one.

## Verification against the standard

`docs/editorial-action-verification-standard-v1.md`, layers 1–5 plus the
two boost-specific layers:

| # | Layer | Status |
|---|---|---|
| 1 | UI action | ⚠️ **Not verifiable end-to-end today** — no Politik entry exists to click. Gate logic verified directly instead (4/4 cases). |
| 2 | Auth role | ✅ Verified this session (HTTP 200, `admin`) |
| 3 | DB row | ⚠️ Not exercised for `boost` specifically — same reason as layer 1. The write path is the identical `writeOverride()` proven for hide and reclassify. |
| 4 | Reader projection | ✅ `public_active_overrides` already returns all active override types; verified for hide and reclassify |
| 5 | Undo | ✅ Same `deactivateOverride()` verified for hide/reclassify |
| 6 | Score impact | ✅ Boost adds exactly `BOOST_WEIGHT`; surfaced in `scoreBreakdown` and `reasons` for explainability; a boosted underdog demonstrably overtakes a rival it would otherwise lose to |
| 7 | Ranking integrity | ✅ A boosted stale/low-trust story **still loses** to a strong candidate, and boost does not let one source monopolise the Active Set (diversity holds) |

**Layers 1 and 3 are honestly incomplete**, and this report says so
rather than claiming a PASS — precisely the discipline the verification
standard was written to enforce after the 3.6.2 false positive. They can
be closed the moment a low-confidence Politik story appears, or
immediately if ChatGPT decides Boost belongs on a different surface.

Layer 7 is the one that mattered most, and it passes: **boost is not a
pin in disguise.**

## A test-fixture bug caught along the way

The first run of the diversity-integrity test failed. Cause was my own
fixture, not the code: every candidate shared the title `'t'`, so
`diversity-selection.mjs`'s near-duplicate filter collapsed them all to a
single pick — the test was measuring the wrong mechanism. Fixed with
genuinely distinct titles; it then passed for the right reason.

## Tests

`ranking/boost-scoring.test.mjs` — 9 assertions. Full suite: **14 files,
0 failures.**

## Untouched

Ranking activation (`RANKING_FLAGS` unchanged), legacy selection,
taxonomy, classifier, pin, source override.
