# Field Visibility Policy v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Product decision document, not code.** Per ChatGPT: the
Health false-positive bug (`docs/post-launch-observations.md`) proved
that a Bidang looking "populated" can be misleading — and that field
visibility (should a near-empty Bidang show at all?) is a real product
decision that hasn't been locked, not something to improvise per
screenshot. **Nothing here is implemented yet.**

## Why this matters now

Before the HTML-stripping fix, Kesihatan showed 1 story in `ms-MY` —
looked "quiet but real." After the fix, it's genuinely 0. If a
hide/unhide rule had been built reactively around the pre-fix count, it
would have been calibrated against a false signal. This is the concrete
argument for locking the *rule* first, separately from any one day's
numbers — per ChatGPT: *"jangan hide/unhide bidang berdasarkan satu
hari."*

## Open questions this policy needs to answer

1. **When does a Bidang appear to the reader?**
2. **When is it hidden/deprioritized instead?**
3. **Does "hidden" mean disabled (reader can never reach it), or just
   deprioritized (reachable but not promoted)?**
4. **Does this differ per edition** (`ms-MY` vs `en-global` vs
   `ar-global` — each has its own independent taxonomy and, so far,
   very different classified-story counts)?

## Proposed starting rule (not locked, not implemented)

Three states, not a binary show/hide:

```
VISIBLE — >= 3 valid stories in the active window
QUIET   — the Bidang exists in the edition's taxonomy, but supply is low
HIDDEN  — not shown to the reader at all
```

Reasoning for a three-state model rather than binary: the current
architecture already has a deliberate design for genuinely-empty fields
(`docs/empty-bidang-policy.md` — showing "belum ada berita" rather than
hiding the Bidang or erroring), and this session's own Real User
Acceptance Test found that an honest empty state read fine to a
first-time reader. A three-state model preserves that finding for
QUIET, while leaving room for a stricter HIDDEN state if a Bidang
proves to have no supply at all over a longer observation window — a
decision this document deliberately does not make yet.

## What this document explicitly does NOT do

- Does not implement hide/show logic anywhere in the codebase
- Does not change the Bidang Wheel, Active Set, or any UI component
- Does not decide the `>= 3` threshold as final — it's a starting point
  for discussion, chosen because it's roughly what
  `docs/post-launch-stability-checkpoint-v1.md`'s baseline shows
  separating "has real content" fields (Bencana: 8, Alam Sekitar: 4)
  from "borderline" ones (Sains: 5, Kesihatan: 0)

## What happens before this gets implemented

Per ChatGPT: observe real field-population data over several days
(`docs/post-launch-observations.md`) before locking numbers — the
Kesihatan false-positive is itself the reason not to decide this from
one snapshot. Revisit this document once there's a few days of
observation log to check the proposed thresholds against.
