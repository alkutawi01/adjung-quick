# Old Table Lifecycle Policy v3 — Review (2026-08-16)

Status: `[x] Review` `[x] Approved (A/B split + §3.7 functional equivalence, ChatGPT 2026-08-16, confidence 0.99)` — **design review, retirement checklist still pending, no drop yet**

FASA 4.2 follow-up #3, per ChatGPT's explicit instruction after HOLD was
chosen over waiving `_old` v2 preconditions §3.5/§3.7: answer exactly
three questions, do not implement anything, do not silently edit v2.
This document does not decide anything on its own — it hands ChatGPT
(and Izzat) a clear choice.

## 1. What does `_old` actually protect right now?

**Rollback for the first migration (the staging+swap mechanism itself
going live), not a recurring daily backup.** `_old` was created by the
one real production swap this project has ever run — the migration
from the pre-staging ingestion model to `ingest-production.js`'s
staging+swap+atomic-rename mechanism. Its job was narrow and specific:
if that *mechanism* turned out to be broken in a way staging
validation didn't catch, `_old` was the way back to the last known-good
state.

It was never designed as, and does not behave as, an ongoing
generation-over-generation safety net — `swap_ingestion_staging()`'s
hard single-`_old` guard (confirmed twice this session, both times
correctly blocking a second swap) makes that mechanically impossible
today. There is exactly one `_old`, from exactly one migration event,
sitting untouched since 2026-08-15.

## 2. Do we already have enough evidence to retire it?

**Partially — and this is the crux of the conflict ChatGPT flagged.**

What v1's original six-point checklist asked for has, in substance,
already been observed:

| v1/v2 §3 condition | Status |
|---|---|
| 1. Swap committed successfully, no silent rollback | ✓ — the original migration swap committed cleanly |
| 2. Reader surfaces normal | ✓ — verified post-migration (`/`, edition switching, Active Set) |
| 3. Admin surfaces normal | ✓ — Review Queue, Digest, Timeline all verified |
| 4. Editorial state intact | ✓ — `story_overrides`/`saved_stories`/`history_entries` verified resolving |
| 5. Subsequent ingestion cycle succeeded | ✗ — **both real attempts today failed at the swap guard**, by design, because `_old` was still present |
| 6. No FK/reference anomaly | ✓ — none observed |
| 7. Classification Lifecycle Reconciliation implemented | ✓ (functional equivalence, confirmed 2026-08-16) — `db/classify-production.js`'s `--write` path already does a full `DELETE` of all `edition_story_classifications` (line 152) followed by a full rebuild from currently-active `story_clusters`, every run (added 2026-08-13, before the Reconciliation design doc existed). `grep -ri "reconcil"` finds zero matches because the code never uses that word, not because the mechanism is missing — the design doc's own §2 requirement ("rebuild the projection... each run") is already met. **Known follow-up, not a blocker**: the `DELETE` + batched `upsert` is not wrapped in a transaction, so a reader/admin query mid-run could see an empty or partially-rebuilt projection. This is an atomicity risk, not a reconciliation failure — the source of truth (`story_clusters`) is never touched, and a completed run always leaves a fully consistent projection. ChatGPT's explicit call: do not build a second staging+swap system to close this window pre-emptively (avoids repeating FASA 4.2's staging/swap/FK-repoint/grant/cache chain for a risk with no observed operational impact) — record it as a named risk instead. |

Six of seven hold (1–4, 6, 7). Only §3.5 remains unmet, and it is not
an independent failure — it exposes the same structural problem named
below: **§3.5 as written cannot ever be satisfied while `_old` still
exists**, because the only thing blocking "a subsequent cycle
succeeding" is `_old`'s own presence. It is not evidence of an
unverified generation; it is evidence of a precondition that was
written for a different lifecycle shape (ongoing multi-generation
rotation) and applied here to a one-time migration artifact where it
creates a circular lock instead of a real test.

Revised honest read, updated 2026-08-16: **6/7 real conditions hold**,
and the 7th (§3.5) is unsatisfiable as currently worded for this
artifact, not unsatisfied in substance.

## 3. If daily refresh is the real goal, what's the right lifecycle?

Two different things have been living under one policy name and
should split:

**A. Retiring *this specific* `_old`** — a one-time decision about the
migration artifact described in §1. Its evidence bar should be the six
substantive conditions (1–4, 6, and a genuine §3.7 implementation of
Reconciliation), **not** a "subsequent swap succeeded" condition that
this same `_old` structurally prevents from ever being true.

**B. The ongoing daily-refresh lifecycle** — a different, future
policy (`docs/daily-ingestion-classification-lifecycle-v1.md`, already
proposed by ChatGPT) governing generation N vs. generation N+1 once
daily ingestion is real. *That* document is where a "did the next
cycle succeed" condition genuinely belongs — because in a running daily
system, "the next `_old` only exists because this one was retired and
a new swap happened" is a real, meaningful test. Applied to a single
migration-era `_old`, it's a paradox instead of a test.

```
TODAY (one-time migration artifact)          FUTURE (daily operation)
LIVE (post-migration)                        LIVE (day N)
  │                                             │
  └── _old  ← migration rollback only           └── _old (day N-1) ← rotates
        │                                              │
        Retire once: 1,2,3,4,6 + real §3.7             Retire once: N+1 swap
        (NOT "next swap succeeded" —                    genuinely succeeded
         that's B's job, not A's)                       (this condition is
                                                          real here — nothing
                                                          blocks the next swap
                                                          except normal ops)
```

## What this review recommends, stated plainly (not yet a decision)

- Split v2 into two scopes rather than patch it: an **A-track**
  (retire the one migration-era `_old`) evaluated on conditions 1–4, 6,
  7; and a **B-track** (`daily-ingestion-classification-lifecycle-v1.md`,
  not yet written) where a "next cycle succeeded" condition is
  reintroduced correctly, because in that future system it stops being
  circular.
- Do **not** waive §3.5 as an ad-hoc exception on this document's own
  authority — that would be exactly the "governance made not to mean
  anything" outcome ChatGPT already named as unacceptable. Retiring
  §3.5 requires an explicit v3 decision, made deliberately, not implied
  by this review. Precise wording per ChatGPT: §3.5 does not "waive" —
  it does not apply to retiring the migration-era `_old` generation,
  because the precondition is circular under the single-generation V1
  lifecycle; it remains mandatory for Track B's future generations.
- **Reconciliation (§3.7) does not need new code.** Confirmed
  2026-08-16: `classify-production.js`'s existing full delete+rebuild
  already satisfies the design doc's own requirement in substance —
  see §2 above. ChatGPT's explicit instruction: do not build a second
  staging+swap mechanism for `edition_story_classifications` to close
  the remaining non-atomicity window pre-emptively — that would repeat
  FASA 4.2's full staging/swap/FK-repoint/grant/cache chain for a risk
  with no observed operational impact. Record the window as a named,
  accepted follow-up instead (see §2's table row above).

## What this document does NOT do

- Does not waive, drop, or edit any precondition — only names the
  circularity in §3.5 as currently worded and proposes a split
- Does not build a new staging+swap mechanism for
  `edition_story_classifications` — the existing rebuild mechanism is
  accepted as satisfying §3.7 in substance, non-atomicity recorded as a
  known follow-up, not a blocker
- Does not run or modify the drop script, the swap guard, or any
  ingestion code
- Does not write `daily-ingestion-classification-lifecycle-v1.md` —
  that remains a separate, later document per ChatGPT's own sequencing
- Does not conclude the `_old` in production should be dropped —
  that is the next step, gated on running the full retirement
  verification checklist (FK, index/PK, grants, reader, admin,
  Timeline, overrides, classification projection) per ChatGPT's
  explicit instruction, not on this document alone

## Next

A/B split and §3.7 functional-equivalence both confirmed by ChatGPT
(2026-08-16, confidence 0.99). Track A may proceed to the retirement
verification checklist — full FK/index/grants/reader/admin/Timeline/
overrides/classification-projection verification — before any DROP.
