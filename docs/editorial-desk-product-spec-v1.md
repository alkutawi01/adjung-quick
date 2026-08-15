# Editorial Desk — Product Spec v1 (2026-08-15)

Status: `[x] Spec` `[ ] Approved` — **no code, no UI, no migration**

FASA 4.3, per ChatGPT's instruction: the audit (`docs/editorial-desk-audit-v1.md`)
found the real gaps — a flat single-page workflow, Pin with zero
surface despite full backend, Boost correctly gated but only proven
correct in one place. This document answers the five questions that
turn that audit into an actual product shape. It's still a concept,
not an implementation — no component, no route, no migration exists
after this document.

## 1. Editorial Desk is not "a dashboard"

Explicitly rejecting the failure mode the audit already found in
today's `/admin`: one long scrolling page with everything visible at
once answers "what exists in the system," not "what does an editor
need to do right now." Editorial Desk's actual question is:

> **"Apa yang perlu dibuat oleh editor hari ini?"**

Proposed structure — a concept, not a UI, not a route map yet:

```
Editorial Desk
├── Hari Ini
│     ├── Digest
│     └── Perlu perhatian
│
├── Semakan
│     ├── Low confidence
│     ├── Content mismatch
│     └── Manual review
│
├── Keputusan Editorial
│     ├── Hide
│     ├── Reclassify
│     ├── Boost
│     └── Pin
│
└── Rekod
      └── Timeline
```

Today's four surfaces (Digest, Review Queue, Boost, Timeline) map onto
this structure without contradiction — "Hari Ini" and "Rekod" already
roughly exist, "Semakan" is today's undifferentiated Review Queue
list split by reason, "Keputusan Editorial" groups the four actions
that today live scattered across cards and (for Pin) nowhere.

## 2. "Fix" vs "intervention" — a real semantic split, not a UI grouping choice

The audit already surfaced this distinction implicitly by tracing what
each action actually claims:

| | Hide / Reclassify | Boost / Pin |
|---|---|---|
| **What it claims** | *"Sistem salah, saya betulkan"* — the classifier's automatic output was wrong, an editor is correcting it back toward what should have happened anyway | *"Saya sengaja ubah keputusan walaupun sistem berjalan"* — the system worked correctly, an editor is deliberately overriding its normal output |
| **Category** | Correction | Intervention |

This is not a cosmetic distinction — it changes what the UI owes the
editor. A correction implies "the system will now behave as if this
had been right from the start" (and indeed, Hide/Reclassify already
integrate into the classifier's normal precedence chain). An
intervention implies "the system's normal behavior is being
deliberately overridden, and that fact should stay visible" — which is
exactly why Pin/Boost need their own precedence position, expiry, and
audit visibility distinct from a correction. **The workflow and UI
must keep these visually and structurally separate — never listed as
four equal-weight buttons on one card,** which is what today's
`ReviewQueueCard` effectively does for the three it supports.

## 3. Pin is FASA 4.3's primary focus — not because it's most important, because it's most dangerous unused

Restating the audit's central finding with its full weight: Pin has
**complete, tested backend** — resolver precedence (between hide and
reclassify), the no-hide-conflict guard, the max-2-per-field guard,
expiry, and dedicated reducer-level tests (`state/pin.test.mjs`, per
the FASA 3.6.5 implementation record) — **and genuinely zero way to
use it without touching the database directly.** A fully-armed,
fully-guarded capability with no front door is a real risk in its own
right: it's real power sitting unused, not "not yet built," and every
day it stays that way is a day the guards protecting it are unverified
by actual editorial use.

**Editorial Desk v1's priority order, per this document**:
1. **Pin surface** — first, precisely because it's the biggest gap
2. **Boost surface** — second, closely related in category
   (intervention), already has a working (if scattered) UI to build
   from
3. **Tidy Hide/Reclassify** — last, because they already work; this is
   refinement, not a gap

## 4. The Boost gate becomes a hard contract, not a convention

Stated as a rule any future implementation must follow, per ChatGPT's
explicit instruction — this is not new logic, it's *locking in* what
`AdminApp.jsx` already does correctly today so a future rewrite can't
regress it:

> **Boost UI may render ONLY when `boostAvailable(edition, field) === true`.**
> Never: "a `field` value exists, therefore show Boost." The two are
> not equivalent — most (edition, field) pairs have a field but are not
> gated into `editorial_v1` (confirmed in the audit: only ms-MY/Politik
> is gated in today).

This is named as a contract specifically because the audit found this
exact discipline already correctly implemented once — the risk isn't
that nobody knows this rule, it's that a future Editorial Desk rewrite
might not carry it forward if it isn't written down as a requirement.

## 5. Role boundary — restated, not expanded

No new power, no new role tier, in this document:

```
Editor:
  - hide
  - reclassify
  - boost (only where boostAvailable)

Admin:
  - pin
  - source override (future, not built)
```

Matches `ADMIN_ONLY_ACTIONS` (`db/editor-auth.mjs`) exactly — this
document doesn't change the boundary, it commits to keeping Editorial
Desk's UI honest about it. **Any future power added to either role
requires all three layers updated together, never one alone**: UI
permission (what a control even offers), backend permission
(`canPerformAction`'s enforcement), and database enforcement (RLS/
constraints where applicable). A UI-only permission check with no
backend/DB backing was exactly the kind of gap FASA 3's earlier audits
existed to catch — this spec commits to not reopening it.

**Chief Editor is explicitly out of scope for FASA 4.3** — per
ChatGPT: a third role tier is a real governance change (permission
model, not just one more `CHECK` value), deferred to a future decision,
not decided or designed here.

## What this document does NOT do

- No code, no component, no route
- No migration, no schema change
- Does not choose between "Pin surface first" or "Editorial Desk shell
  first" as the actual implementation starting point — per ChatGPT's
  explicit instruction, that decision comes only after this document
  is reviewed
- Does not design Chief Editor governance
- Does not specify exact UI layout/visual design — the structure in
  §1 is conceptual grouping, not a wireframe

## Next

Awaiting review. Only after approval: decide whether implementation
begins with the Pin surface or the Editorial Desk shell — not both at
once, per ChatGPT's explicit instruction not to choose prematurely.
