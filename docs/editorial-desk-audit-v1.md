# Editorial Desk — Requirements Audit v1 (2026-08-15)

Status: `[x] Audit` `[ ] Approved` — **no code, no UI, no schema**

FASA 4.3, per ChatGPT's instruction: before proposing any Editorial
Desk implementation, audit whether the editorial power FASA 3 already
built (Review Queue, Hide, Reclassify, Boost, Pin, Timeline, Digest)
has an actual "place an editor works," or is scattered across
disconnected surfaces. Every claim below is checked against the real
codebase, not assumed.

## 1. Who is the user?

**Today's model is flat: two roles, one column.**
`editors.role CHECK (role IN ('editor', 'admin'))`
(`db/schema-editorial-state.sql:19-24`) — no hierarchy table, no
per-permission grants, no Chief Editor concept anywhere in the schema.
Enforcement is a single set-membership check:
`ADMIN_ONLY_ACTIONS = {'pin', 'ignore_category', 'reduce_trust', 'disable'}`
(`db/editor-auth.mjs:45`) — everything not in that set, any signed-in
editor can do.

**Does every editorial decision go through the same person?**
Currently, functionally yes for most actions — there's no assignment,
routing, or "this story belongs to this editor" concept anywhere.
Hide/Reclassify/Boost are open to any editor; Pin/source-overrides
require admin. With Izzat as the only real admin today, this flat
model hasn't been tested against a real multi-editor scenario — that's
a known, not a hidden, limitation.

**Open question, not answered here**: does Adjung Quick need a Chief
Editor tier before Editorial Desk ships, or is admin/editor sufficient
for the realistic near-term user count? Named for approval, not
decided.

## 2. What is the daily workflow, as it actually exists today?

Traced end to end, not assumed: `AdminApp.jsx`'s `ReviewQueue`
component renders, in one continuous scrolling page — masthead +
edition switcher → `AdminDigest` → the Review Queue card list →
`EditorialActivityTimeline`. **No tabs, no routes, no separate
navigation between these four pieces.** The only cross-link that
exists is the Digest's "Buka Senarai Semakan" button, which does an
in-page `scrollIntoView` — not a real navigation, just a scroll jump on
the same page.

The workflow ChatGPT sketched —
`Laporan Hari Ini → Perkara perlu perhatian → Semakan berita → Tindakan editorial → Audit timeline`
— **is roughly what exists today, but only by page order, not by
designed flow.** There's no explicit hand-off between steps (nothing
tells an editor "you finished the queue, now check the Timeline"), and
Pin has no step in this flow at all because it has no UI to reach it
from (§3).

**Is this enough?** As a single-editor tool, arguably yes — Izzat
scrolls one page and sees everything. It stops being enough the moment
there's more than one editor working concurrently, since nothing here
shows "who's working on what" or prevents two editors acting on the
same story — not evaluated further here, flagged as a real gap this
audit surfaces rather than solves.

## 3. Feature surface — backend vs. UI, checked directly

| Feature | Backend | UI today |
|---|---|---|
| Hide | `submitHideOverride` (`reviewQueueAdapter.js:253`) | Yes — `ReviewQueueCard.jsx` |
| Reclassify | `submitReclassifyOverride` (`reviewQueueAdapter.js:257`) | Yes — `ReviewQueueCard.jsx` |
| Boost | `submitBoostOverride` (`reviewQueueAdapter.js:261`) | **Conditional** — see below |
| Pin | `submitPinOverride` (`reviewQueueAdapter.js:274`) | **None at all** |
| Timeline | `fetchEditorialActivity` | Read-only display |
| Digest | `fetchDigest` | Read-only display |

**Boost's real gate, confirmed in code, not assumed**:
`boostAvailable={Boolean(entry.field) && getRankingVersion(editionId, entry.field) === 'editorial_v1'}`
(`AdminApp.jsx:215`). `state/rankingFlags.js` currently activates
`editorial_v1` for exactly **one** (edition, field) pair — ms-MY /
Politik — everything else defaults to `'legacy'`, where a boost signal
is silently meaningless (nothing reads it). `ReviewQueueCard.jsx`
already shows an explicit "belum tersedia" message when a story's
field isn't gated in — this one gate is handled correctly today.

**Pin's real gap, confirmed by absence, not inference**: grepping
`AdminApp.jsx`/`ReviewQueueCard.jsx`/`AdminDigest.jsx` finds zero
pin-related JSX. `reviewQueueAdapter.js`'s own comment states this
directly — Pin's surface was deliberately deferred to a future
Editorial Desk, not the Review Queue, per an earlier decision. The
Timeline can *display* a past pin event (if one was created by direct
DB/script access), but nothing in the UI can *create* one. This is the
single largest concrete Editorial Desk requirement this audit
surfaces: **Pin has real backend, real guards (no-hide-conflict, max-2
enforcement, both already tested), and zero way for an admin to use it
without touching the database directly.**

## 4. Don't repeat FASA 3's mistake — where would UI overclaim power?

Per ChatGPT's explicit instruction: name every place a future
Editorial Desk UI could visually imply a capability the backend
doesn't actually have everywhere.

- **Boost, again**: if an Editorial Desk redesign ever shows a Boost
  control without re-checking `boostAvailable`'s exact gate, it would
  silently promise a working action outside ms-MY/Politik. The current
  `ReviewQueueCard` gets this right (explicit unavailable-message,
  never a disabled-but-present button) — any redesign must preserve
  that discipline, not just the control's presence.
- **Pin's constraints are invisible without the UI enforcing them
  visibly**: max-2-active-pins-per-field and no-pin-over-active-hide
  are real, tested guards (`reviewQueueAdapter.js:285-319`), but they
  only surface as a rejected write today (no UI exists to hit them at
  all yet). A Pin surface that doesn't show *why* a pin was refused
  (not just that it failed) would repeat the "UI implies more than
  backend guarantees" pattern in the opposite direction — refusing
  silently instead of explaining.
- **The flat role model (§1)** means any UI that visually distinguishes
  "admin actions" from "editor actions" (e.g., a locked icon) is
  currently drawing a boundary the backend also draws identically —
  safe today, but would silently drift wrong if a Chief Editor tier is
  ever added without updating both layers together.
- **Timeline's own documented limitation carries forward**: it cannot
  show *who* deactivated an override or *when* (no `deactivated_at`
  exists, per `docs/editorial-activity-timeline-plan-v1.md`'s own
  finding) — any Editorial Desk view surfacing override history must
  preserve that same honesty, not paper over the gap with an invented
  timestamp.

## What this audit does NOT do

- No code, no UI component, no schema/migration
- Does not propose an Editorial Desk information architecture — that's
  the next document, only after this audit is reviewed
- Does not decide the Chief Editor question (§1)
- Does not decide multi-editor concurrency handling (§2)
- Does not implement a Pin surface — only names it as the clearest gap

## Next

Per ChatGPT: after this audit is reviewed, decide FASA 4.3's actual
shape (which surfaces to build first, in what architecture) —
separately from and after this document, not assumed here.
