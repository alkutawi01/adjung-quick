# Editorial Desk — Shell Implementation Plan v1 (2026-08-15)

Status: `[x] Plan` `[ ] Approved` — **no Pin, no Boost, no migration** (plan document — see note on scope below)

FASA 4.3.1, per ChatGPT's decision: Option A confirmed (nest under
`/admin` — real infra already supports it, no new Vercel rewrite, no
new router, the auth gate already exists). This document plans the
shell only: structure, navigation, permission gate, layout, and empty
states for features not yet built. Pin and Boost get visible-but-inactive
sections, never a broken button or dead link.

**Scope note**: this instruction did not carry the explicit "no code"
line every prior FASA 4.2/4.3 document in this session has had — only
"no Pin, no Boost, no migration." Treating this as a plan document
consistent with every other step in this sequence, and flagging that
distinction explicitly in the report back, rather than assuming
silence means "go ahead and build" on something this session hasn't
been asked to build yet.

## Confirmed structure

```
/admin
  Editorial Desk
    ├── Hari Ini
    │     └── Digest
    ├── Semakan
    │     └── Review Queue
    ├── Rekod
    │     └── Timeline
    └── Keputusan Editorial
          ├── Pin (akan datang)
          └── Boost (akan datang)
```

## 1. `/admin` structure

Real current structure, confirmed:
`AdminApp.jsx`'s `ReviewQueue` component renders everything as one
scrolling tree — masthead, edition switcher, `AdminDigest`, the queue
card list, `EditorialActivityTimeline`. Shell work reorganizes this
into the four labeled sections above **as a layout/grouping change**,
not a new routing layer — matches ChatGPT's explicit reasoning
("jangan cipta struktur URL baharu tanpa sebab"). Each of the four
top-level sections becomes a visually distinct group (a sidebar, tabs,
or accordion — a UI-detail decision left for the actual build, not
this plan) rather than one undifferentiated scroll.

**Existing components map directly onto three of the four sections
with no new component needed**:
- Hari Ini → `AdminDigest.jsx` (already exists)
- Semakan → the Review Queue card list (already exists, currently
  inline in `AdminApp.jsx`'s `ReviewQueue`)
- Rekod → `EditorialActivityTimeline.jsx` (already exists)

**Keputusan Editorial is new** — today's `ReviewQueueCard.jsx` already
embeds Hide/Reclassify/Boost actions *inside* the Semakan section
(right on each queue card), which per the product spec's fix-vs-intervention
split is itself worth reconsidering later (should Boost stay attached
to a queue card, or move fully into Keputusan Editorial?) — **not
decided in this plan**, named as a real open question the shell alone
doesn't resolve.

## 2. Auth boundary

**No change** — `AdminApp.jsx`'s existing sign-in + `isEditor`/`isAdmin`
role check (`db/editor-auth.mjs`) already gates the entire `/admin`
surface. The shell doesn't introduce a new permission model; it
organizes what's already behind that same gate. Within the shell,
per-section visibility (e.g., an admin-only affordance inside
Keputusan Editorial once Pin exists) reuses the same `role` value
already threaded through today (`AdminApp.jsx:84` passes `role` to
`ReviewQueue`) — no new auth mechanism needed for the shell itself.

## 3. Components that need to exist

| Component | Status | Shell's job |
|---|---|---|
| Section container/navigation (however the four groups are visually organized) | **New** | The one genuinely new piece of UI structure this phase introduces |
| Hari Ini (Digest) | Exists (`AdminDigest.jsx`) | Reposition under the new structure, no logic change |
| Semakan (Review Queue) | Exists (inline in `AdminApp.jsx`) | Reposition; possibly extracted into its own component for cleanliness, still no logic change |
| Rekod (Timeline) | Exists (`EditorialActivityTimeline.jsx`) | Reposition, no logic change |
| Keputusan Editorial | **New container, empty content** | Houses the Pin/Boost "coming soon" placeholders (§4) — no real action UI yet |

## 4. Empty state for not-yet-active features

Per ChatGPT's explicit instruction: Pin and Boost must read as
**"belum tersedia"** (not yet available) — a real, visible section
with honest framing — never:
- A broken/disabled button that looks like it should work
- An empty component with no explanation
- A dead link

Concretely: the Keputusan Editorial section shows two named cards —
"Pin" and "Boost" — each with a short, honest description of what the
feature will do once built (not a vague "coming soon"), and no
interactive control that could be mistaken for a working action. This
mirrors the same honesty discipline `ReviewQueueCard.jsx` already uses
today for Boost's own unavailable-field message ("Naikkan belum
tersedia untuk bidang ini...") — extending a pattern this project
already trusts, not inventing a new one.

## 5. Verification contract — basic version for the shell itself

The full FASA 3-style chain
(`UI action → Auth → Database row → Reader effect → Undo/expiry`,
per `docs/editorial-desk-implementation-plan-v1.md` §4) doesn't fully
apply yet, since the shell introduces no new writable action. The
shell-specific verification is narrower but still real:

1. Auth gate still correctly blocks non-editors from the whole
   Editorial Desk (regression check — the reorganization must not
   accidentally loosen this)
2. All three existing sections (Digest, Review Queue, Timeline)
   still function identically after being repositioned — same data,
   same actions, same behavior, just relocated
3. Keputusan Editorial's Pin/Boost placeholders render correctly and
   contain no interactive element that fires a real request
4. No console errors, no broken existing Hide/Reclassify/Boost actions
   inside Semakan after the reorganization

## What this document does NOT do

- No Pin implementation
- No Boost implementation
- No migration
- Does not decide whether Boost moves out of the Review Queue card
  into Keputusan Editorial — named as an open question, not resolved
- Does not build the story-selection mechanism — per ChatGPT, that's
  a separate document (`docs/editorial-story-selection-design-v1.md`),
  planned for after this shell is built, before Pin itself is
  implemented

## Next

Per ChatGPT: after this shell plan is reviewed (and, if approved,
built), the story selection design document comes next — locking how
an editor picks which story to Pin/Boost — before Pin implementation
begins.
