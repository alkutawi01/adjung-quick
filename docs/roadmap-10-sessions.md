# Adjung Quick — Roadmap 10 Sesi

Source: ChatGPT (project director), 2026-08-12, in response to Izzat's request
for a 10-session plan. Confidence stated: 0.98.

**Governing rule for all 10 sessions:** Do not go back and change the Engine,
Architecture Skeleton, Active Set semantics, or Wheel architecture in order to
solve a new UI feature's problem — unless there is evidence of a real
regression. If a new feature collides with an existing contract, STOP and bring
the conflict to ChatGPT/Izzat. Do not silently "fix" architecture.

Claude may work autonomously through each session. Only decisions that change
**product semantics** need to go to Izzat.

| Sesi | Fokus | Hasil yang mesti siap |
|------|-------|----------------------|
| 1 | Real-Device Acceptance | Uji deployment sebenar pada phone + desktop |
| 2 | Reading Loop Hardening | Tutup semua bug acceptance; freeze core UI |
| 3 | Production Ingestion | Tukar verification ingestion → ingestion produksi sebenar |
| 4 | Save + Login | Login, Save/Unsave, persistence sebenar |
| 5 | History + Expiry | History release, saved expiry, re-discovery |
| 6 | Language Layer | Language switch + Representation Selector UI |
| 7 | Sponsor System | Sponsor period + logo + sponsor directory |
| 8 | Theme System | Theme berdasarkan Bidang, fallback neutral |
| 9 | Search + Filter | Search dan filter sebagai dua mekanisme berasingan |
| 10 | Production Hardening + Release Audit | Security, performance, a11y, regression, RC |

---

## SESI 1 — Real-Device Acceptance ← CURRENT

Use the real deployment (https://adjung-quick.vercel.app). Do not skip ahead.

**Wheel**
- touch drag
- mouse wheel
- trackpad
- mouse drag
- ↑/↓
- wrap World → Semua
- wrap Semua → World
- exactly one active throughout the gesture
- active always centered
- continuous scale/opacity
- wheel does not move the Active Set

**Reading**
- pilih story
- buka Brief
- Brief title/header kekal
- only Brief *content* scrolls
- Esc/back
- focus restoration
- swipe release
- replacement enters the SAME slot
- the other nine stories do not change

**Responsive**
- 375
- 390
- desktop
- orientation change

**Exit gate:** all critical acceptance PASS. If anything fails, Sesi 2 fixes
only what failed — do not add features.

---

## SESI 2 — Reading Loop Hardening

One dedicated session to close out remaining issues: keyboard acceptance, touch
interaction, Brief scrolling, focus, RTL, no page scroll, Active Set spatial
stability, stable slot replacement, mobile/desktop parity.

Then produce `docs/reading-loop-acceptance.md` declaring:

> **Core Reading Loop = FROZEN**

After this checkpoint, Claude may not alter wheel / Active Set / Brief
architecture at will while building other features.

---

## SESI 3 — Production Ingestion

`ingest-production.js` currently still TRUNCATEs + reinserts for verification.
That is not production ingestion. Build:

- source polling
- RSS item deduplication
- upsert
- story cluster matching
- representative preservation
- Editorial Score update
- freshness
- expired item handling
- failure/retry behaviour
- ingestion logging

Test: new RSS arrives **without destroying the existing Active Set**.
Output: ingestion can run repeatedly without wiping the database.

---

## SESI 4 — Save + Login

Infrastructure already exists (Supabase Auth, `saved_stories`,
`history_entries`, RLS, dedup/upsert, expiry). This session builds the UI.

- Anonymous: can read as normal
- Authenticated: Save, Unsave, see saved status

Per the existing proposal: `SAVE_STORY` and `UNSAVE_STORY` are two separate
actions, not a generic toggle. Login must also establish a clear boundary
between anonymous and authenticated state.

---

## SESI 5 — History + Expiry

**History** — release produces a History Entry (story, released_at,
expires_at). Reader can re-find released stories via History. This is distinct
from Search.

**Expiry** — one admin-configurable personal retention period covering Saved +
History. UI must notify that saved items/history will be deleted after that
period. Do not build a retention system more complex than Izzat's decision.

---

## SESI 6 — Language Layer

O-012 already LOCKED; this brings it to real UI.

A story has Malay / English / Arabic representations, but there is still
**ONE** Active Set — not one per language.

Must prove: language switch is an atomic transition. A story existing only in
Malay may be replaced immediately, while a story that has an English
representation is preserved as the same story. Editorial Score remains
authoritative; language preference only helps pick representation / break ties,
as already LOCKED.

---

## SESI 7 — Sponsor System

Only after core reading + identity + language are stable.

Not an advertising network: no ads, no banners, no sponsored articles. Sponsors
open by week/month; logo/name only. The Sponsor page is a collection of
sponsors, not a page dedicated to one sponsor.

Build: Sponsor, Sponsor Period, Sponsor Logo, Sponsor Status, plus UI placement
that does not disturb the reading experience.

**Needs Izzat's approval:** logo placement in the composition.

---

## SESI 8 — Theme System

Theme is optional per Bidang — do not require every Bidang to have one.

Bidang → optional theme → Quick UI. If no theme, use the default Quick theme.
Theme must be metadata-driven presentation, never hardcoded
(`if topic === "Malaysia"`), so ad hoc Bidang can appear later without a UI
rewrite.

---

## SESI 9 — Search + Filter

Keep these clearly separate. Search = user searching the corpus Quick stores /
permits searching. Filter = user narrowing results by metadata. Do not conflate
Search with History or with Filter. History remains personal reading history.

Also the right time to decide whether source / language / date / saved-history
scope filters are actually needed — but don't invent filters just to satisfy a
checklist.

---

## SESI 10 — Production Readiness Audit

Not a feature session — a session to try to break Quick.

- **Data:** RLS, anonymous access, authenticated isolation, service-role
  boundary, ingestion idempotency
- **Performance:** RSS volume, clustering, Active Set selection, mobile
  rendering, large History/Saved datasets
- **UX:** keyboard, touch, mouse, RTL, accessibility, focus
- **Failure:** dead RSS source, duplicate RSS, malformed RSS, empty category, no
  candidate replacement, missing language representation, expired saved story,
  deleted account
- **Regression:** Engine, Architecture, Vertical Slice, Production DB, Identity,
  Reading UI, Wheel, Keyboard, Save, History, Language, Sponsor, Theme, Search

Produce `docs/mvp-release-audit.md` with explicit PASS / FAIL / OPEN status —
not "rasanya siap".
