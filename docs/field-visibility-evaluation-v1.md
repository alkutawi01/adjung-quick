# Field Visibility Evaluation v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Evaluation framework, not a locked decision.** Per
ChatGPT: before locking `field-visibility-policy-v1.md`'s proposed
`>= 3` threshold, evaluate it against real per-Bidang supply data — and
identify special cases the simple threshold gets wrong before writing
any code.

## Current snapshot (2026-08-13, single day — NOT enough to decide from)

Using `docs/post-launch-stability-checkpoint-v1.md`'s baseline
(`ms-MY`, post Health-bug-fix):

| Bidang | Stories | Naive `>=3` verdict |
|---|---|---|
| Pendidikan | 193 | VISIBLE |
| Bisnes | 93 | VISIBLE |
| Sukan | 91 | VISIBLE |
| Hiburan | 61 | VISIBLE |
| Politik | 36 | VISIBLE |
| Teknologi | 31 | VISIBLE |
| Jenayah | 28 | VISIBLE |
| Gaya Hidup | 25 | VISIBLE |
| Agama | 24 | VISIBLE |
| Bencana | 8 | VISIBLE |
| Sains | 5 | VISIBLE (borderline) |
| Alam Sekitar | 4 | VISIBLE (borderline) |
| Kesihatan | 0 | HIDDEN |

## Why this single day is NOT sufficient to lock a rule

This is exactly the day the Health false-positive was found and fixed —
Kesihatan's count moved from 1 to 0 within this same session, on this
same day. Locking a threshold against numbers that unstable would mean
calibrating a UI rule against noise, not signal. Per ChatGPT: this
needs several days of stable data first.

## The Bencana special case — why a flat threshold is the wrong shape

A naive `>= 3` rule would have called Bencana borderline-visible today
(8 stories). But Bencana's real editorial requirement is different from
every other Bidang: it needs to be prominently visible **during an
actual disaster event**, even if its 7-day average the rest of the time
is low or zero. A flat supply threshold, applied uniformly, would
under-serve exactly the moment a reader most wants Bencana to be
visible.

**Proposed shape (not implemented, for future evaluation):**

```
Bencana — normal state:     QUIET (low baseline supply is expected)
Bencana — event spike:      VISIBLE immediately (real news volume spike
                             should promote it, not wait for a rolling
                             average to catch up)
```

This likely generalizes to any Bidang where the ONGOING-CONDITION vs.
ACUTE-EVENT distinction already used in classification design
(`classification/lib/content-rules.mjs`'s Disaster-vs-Environment split
comment) matters for visibility too, not just classification. Not
explored further here — flagged as a real shape difference the eventual
policy needs to account for, not solved in this document.

## What real evaluation requires (not done yet)

1. **Multiple days of `db/classify-production.js` dry-run output**,
   compared day over day — not a single snapshot. Ties directly into
   `docs/post-launch-observations.md`'s ongoing log.
2. **A definition of "active window"** for the threshold — 24 hours? 7
   days? Bencana's spike-vs-baseline shape above suggests this can't be
   one fixed window for every Bidang.
3. **Per-edition check** — this evaluation only covers `ms-MY`; `en-global`
   and `ar-global` have much lower absolute story counts across the
   board (`docs/post-launch-stability-checkpoint-v1.md`), so the same
   raw threshold likely doesn't transfer directly.

## Explicitly not decided by this document

- The final threshold number(s)
- Whether Bencana's spike behavior gets built as a special case or a
  more general "acute event" visibility rule
- Any UI/Wheel/Active Set code change

## Next

Per ChatGPT: continue `docs/post-launch-observations.md` for a few more
days, then return to this evaluation with real day-over-day data before
`field-visibility-policy-v1.md`'s rule gets implemented.
