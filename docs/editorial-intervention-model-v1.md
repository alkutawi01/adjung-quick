# Editorial Intervention Model v1 (2026-08-15)

Status: `[x] Design` `[ ] Approved` — **no code, no UI, no picker**

FASA 4.3, per ChatGPT's instruction after `docs/editorial-desk-admin-ux-simulation-v1.md`:
that simulation found FASA 4.3 had been designing Editorial Desk as if
its user were a daily newsroom editor, when Izzat's own confirmed
usage pattern — "saya mungkin hanya pin seminggu sekali. selebihnya
saya biarkan sistem bergerak sendiri" — describes something smaller:
an owner who intervenes occasionally, not a staff that manages a feed
continuously. This document stops asking "how does an editor find a
story" (the picker question) and asks a prior, more consequential
question: **what does Izzat actually need to be *able* to do by hand,
at all?**

> Editorial Desk bukan tempat mencari berita.
> Editorial Desk ialah tempat bertindak apabila ada sebab.

## 1. Which actions genuinely need a human?

Checked one at a time, against what each action actually claims (the
correction-vs-intervention split already locked in
`docs/editorial-desk-product-spec-v1.md` §2) and against Izzat's own
stated usage:

| Action | Claim | Needs a human, why |
|---|---|---|
| **Hide** | "Sistem salah, saya betulkan" — a correction | Yes — this is error-correction, and errors are by definition something the system can't self-detect. The Review Queue already surfaces the specific cases (low-confidence, content mismatch) where this applies. This is reactive, not proactive: Izzat only needs it when the system already flagged something. |
| **Reclassify** | Same correction category as Hide | Yes, same reasoning — reactive, already has a working UI (`ReviewQueueCard.jsx`), already scoped as "refinement, not a gap" in the product spec. Nothing in this document changes that. |
| **Pin** | "Saya sengaja ubah keputusan walaupun sistem berjalan" — intervention | Yes — this is the one action whose entire purpose is a human override of a working system, for a story the ranking engine correctly scored low but a human judges to matter more than its score. No automated signal can substitute for this judgment (that is Pin's whole reason to exist). This is proactive: Izzat has to notice something himself, unprompted by any queue. |
| **Boost** | Also intervention, but a weaker claim | Debatable, restated below (§1a) — its claim ("give this a higher chance, not a guarantee") is a subtler judgment call than Pin's ("make sure this is seen"), and per Izzat's own usage pattern, may not be a claim he ever needs to make. |

### 1a. Boost, examined specifically

Boost's claim is genuinely harder to act on than Pin's: an editor
using Boost is reasoning about *relative* competitive advantage
inside a scoring system ("this deserves a *better chance*, not a
guaranteed spot") — a mental model close to campaign/growth tooling,
not editorial judgment. Pin's claim ("make sure this is seen") is a
direct, binary decision any owner can make on instinct. Boost requires
the user to already think in terms of "ranking," "competing
candidates," and "probability of selection" — exactly the vocabulary
`docs/editorial-desk-admin-ux-simulation-v1.md` §3 flagged as a real
jargon risk, and the vocabulary Izzat has not used unprompted anywhere
in this project's own history.

**Finding, not yet a final decision**: Boost is very plausibly not a
FASA 4.3 priority feature for Izzat specifically. Its backend
(`submitBoostOverride`, the `editorial_v1`/`boostAvailable` gate)
should be kept exactly as-is — it is real, tested, and already scoped
correctly (`ms-MY.Politik` only) — but building a *UI* for it should
not be assumed as a near-term deliverable just because the backend
exists. This reframes, not reverses, the product spec's original
priority order (Pin → Boost → Correction refinement,
`docs/editorial-desk-product-spec-v1.md` §3): Pin's priority stands;
Boost's priority is now genuinely open, not automatic.

## 2. Expected frequency per action

Restated from Izzat's own words, extended to the other three actions
by the same reasoning:

| Action | Expected frequency | Why |
|---|---|---|
| **Hide / Reclassify** | Whenever the Review Queue has something — likely still infrequent, since Review Queue only surfaces genuine low-confidence cases, not routine volume | Reactive to a real signal, not a schedule |
| **Pin** | "Seminggu sekali" (Izzat's own estimate) or less | Proactive, judgment-driven, tied to genuinely significant news events — which are not a daily occurrence for any single admin to personally flag |
| **Boost** | Unknown, plausibly near-zero for Izzat specifically | Requires a mental model (§1a) Izzat hasn't demonstrated using; this document does not assume a frequency it can't support with evidence |

**This table is a hypothesis, not measured data** — named explicitly
as something that should be checked against Izzat's *actual* behavior
once any of these surfaces exist to observe, not treated as settled
fact from a single self-report.

## 3. Shortest path: "I see something important" → "I want readers to see it"

This is Pin's real job, restated as the design constraint everything
else in this document serves. Per ChatGPT's rejection of the
Bidang-first flow, the path must not require the admin to first
navigate a taxonomy they didn't come here to browse:

```
Saya nampak sesuatu penting
        ↓
Saya mahu pembaca nampak
```

expands to, at most:

```
1. Buka Editorial Desk         (0 klik — sesi berterusan)
2. "Ada berita penting?"       (1 klik — bukan "Pilih Bidang")
3. Pilih berita                (2 — dari senarai PENDEK, bukan taxonomy)
4. "Pastikan muncul di atas"   (3)
5. Pilih tempoh                (4)
6. Sahkan                      (5)
```

This directly supersedes `docs/editorial-story-selection-design-v1.md`'s
Model B (Bidang-first) as the *default* entry point — that document's
underlying comparison of information shapes (what metadata to show
per story, how unclassified stories are handled, the permission
boundary) still holds and is not discarded, but its recommended
*primary navigation* is overridden by this document's finding: Bidang
browsing may still exist as a secondary, opt-in path for the rarer
case an admin genuinely wants to browse a category, but it cannot be
the only or default way to reach a story.

**What "berita untuk perhatian" (the short list at step 2) actually
is, stated honestly**: this document does not yet design that list's
selection logic (which stories qualify, how many, what ordering) —
naming it as the next real open question, not resolving it here. It
is provisionally *not* the Review Queue (which is for corrections,
not interventions) and *not* a full recent-per-field browse (rejected
in §3 above) — most likely a short, recency-weighted, cross-field
list, but that is a hypothesis for the next design pass to confirm,
not a locked decision.

## 4. What can be deferred despite an existing backend?

Direct answer, per the findings above:

- **Boost's UI can be deferred.** Its backend (guard logic, gate
  contract, test coverage) is complete and correct and needs zero
  further work — but no Boost surface needs to ship as part of FASA
  4.3's near-term scope. This is the single biggest scope reduction
  this document identifies.
- **The Bidang-first / taxonomy-browsing picker can be deferred**,
  not because it's wrong, but because it answers a need
  (systematic category browsing) that doesn't match how Izzat actually
  intends to use this feature. It remains a valid secondary path for a
  future daily-editor persona, if Adjung Quick ever has one — not
  discarded, just not built first.
- **Pin cannot be deferred** — it is the one intervention whose
  absence is a real, already-identified risk (per the original audit:
  "a fully-armed, fully-guarded capability with no front door").
- **Hide/Reclassify already have working UI** — nothing to defer,
  nothing new to build; per the product spec, refinement only, and
  explicitly last in priority.

## Consequence: FASA 4.3's real shape may be smaller than "Editorial Desk"

Restating ChatGPT's own framing, because it changes what "done" means
for this phase: FASA 4.3 may not be building a desk with four
sections that eventually all become equally active. It may be building
a much smaller **Human Intervention Layer** — Pin as the one genuinely
necessary proactive action, Hide/Reclassify as the two already-working
reactive corrections, and Boost kept dormant (backend intact, UI
deferred) until real evidence says otherwise. The Editorial Desk shell
itself (`docs/editorial-desk-shell-implementation-plan-v1.md`, already
shipped) remains the right container for this — the four-section
structure doesn't need to be undone, only Keputusan Editorial's
internal contents need to reflect this narrower scope once built.

## What this document does NOT do

- No code, no component, no route
- Does not design the "berita untuk perhatian" short list's selection
  logic — named as the next open question
- Does not build Pin, does not build a picker
- Does not finally decide Boost's fate — states a finding (its UI is
  plausibly not near-term priority) and the reasoning behind it, but
  leaves the final call to review, since it reverses part of an
  already-approved priority order (`docs/editorial-desk-product-spec-v1.md`)
- Does not change the Editorial Desk shell's shipped structure — only
  reframes what belongs inside Keputusan Editorial

## Next

Awaiting review. If approved, the next design step (per ChatGPT's own
framing) is likely: design the "berita untuk perhatian" short list —
the actual entry point to Pin — rather than resuming the discarded
Bidang-first picker.
