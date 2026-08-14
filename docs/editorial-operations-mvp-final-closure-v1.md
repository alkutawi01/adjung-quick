# Editorial Operations MVP — Final Closure v1 (2026-08-14)

Status: `[x] Fasa 3 fully closed (3.6.1–3.6.5)`

Supersedes `docs/editorial-operations-mvp-closure-report-v1.md` (written
after 3.6.4, before Pin existed). This is the closure after **every**
sub-phase, per ChatGPT's explicit request before Fasa 4 is chosen.

## 1. All features, 3.6.1 through 3.6.5

| Phase | Delivered |
|---|---|
| **3.6.1 Foundation** | `editors` allowlist on Supabase Auth, `story_overrides`/`source_overrides` tables + RLS, `resolveStoryField()`, `canPerformAction()`/role logic, admin bootstrap |
| **3.6.2 Review Queue** | `/admin` route, sign-in, role gate, mobile-first one-card-one-decision queue, human-first `display_reason` translation |
| **3.6.3a Hide** | Resolver integration — the first time an editorial decision actually reached a reader (previously written, never read) |
| **3.6.3b Reclassify** | Edition-scoped field override, same resolver path as hide |
| **3.6.3c Boost** | Scoring signal (`BOOST_WEIGHT`, one tunable constant) applied at candidate scoring — proven able to still *lose*, so it argues rather than decides. Gated to `editorial_v1` fields only (`ms-MY.Politik`); no admin surface, since the Review Queue shows *problem* stories and boost promotes *correct* ones — deliberately deferred to a future Editorial Desk |
| **3.6.4 Admin Digest** | In-app daily status panel, computed by calling `fetchReviewQueue()` itself for "perlu perhatian" — same code path as the queue, so the two can never disagree about what counts as a problem |
| **3.6.5 Pin** | Position + membership guarantee, extracted before the ranking-version branch (no `editorial_v1` activation needed, unlike boost); reuses `new_field` (no schema column); two write-time guards (no pin over an active hide, max 2 per edition/field) |

Plus, found and fixed along the way (not features, but load-bearing):
RLS infinite recursion, a missing base `GRANT` that made every editorial
write fail silently, no anonymous read path for overrides, override
expiry never enforced at read time, the Review Queue conflating "any
override" with "resolved," the Active Set's cold-start path bypassing
the shared selection function, and `canPerformAction()` having zero
production callers despite being fully unit-tested.

Test suite: **15 files, 0 failures** (up from 2 at the start of Fasa 3).

## 2. Final architecture decisions

1. **Generated Data ≠ Editorial State.** The classifier truncates and
   rewrites its own tables every run; human decisions live in tables it
   never touches. Every schema decision in Fasa 3 traces back to this.
2. **Locked precedence**: source disable > hide > pin > reclassify >
   boost > classifier. Restrictive beats permissive; specific beats
   general; human beats generated.
3. **Reuse over duplication, proven twice.** `new_field` serves both
   reclassify and pin — considered and rejected adding a second column.
   `fetchDigest()`'s "needs attention" count calls `fetchReviewQueue()`
   directly rather than re-deriving the same number.
4. **Boost argues, pin decides.** Boost is a scoring modifier that can
   lose (tested). Pin bypasses the ranking contest entirely and
   guarantees both membership and position.
5. **Principle of Escalation.** Single-story actions (hide, reclassify,
   boost) are `editor`-level; actions with compounding blast radius
   (pin, source overrides) are `admin`-only — enforced at the database
   (RLS) **and** the application (`canPerformAction()` inside the single
   write choke point), not either alone, after finding the app-layer
   half didn't actually exist for months.
6. **Two auth postures, two clients.** The reader is anonymous
   (`persistSession: false`); the admin is a signed-in session that must
   survive reload (`persistSession: true`). Never one client with a flag.
7. **Least privilege at the data layer.** Readers see overrides only
   through `public_active_overrides`, a narrow view omitting `reason`
   and `created_by` — verified live: the base table returns 401 to an
   anonymous request, the view returns 200.
8. **UI success is not proof of persistence.** The verification standard
   (`docs/editorial-action-verification-standard-v1.md`) exists because a
   reported "PASS" once meant zero database rows.
9. **A defensive backstop is not a substitute for the real guard.** Every
   write-time limit (2-pin cap, hide/pin exclusivity) is checked before
   the write; the reducer's own oldest-2-win cap exists only in case bad
   data ever reaches it anyway — never relied on as the enforcement
   point.

## 3. Deliberately NOT built

| Not built | Why |
|---|---|
| **Pin UI** | The Review Queue means "something may be wrong"; pin means "something is already correct, an editor wants it emphasised" — wrong home for it. No Editorial Desk exists yet to be its right home. Backend is complete and tested; `submitPinOverride()` has no caller. |
| **Boost surface** | Same reasoning as Pin UI, decided first for boost. |
| **Editorial Desk** | The surface both of the above actually belong on. Not designed, not built — a real candidate for Fasa 4, not assumed into being here. |
| **Source Override** | `source_overrides` table and RLS exist (3.6.1), but no write path, no UI. Cross-edition, cross-story blast radius — waits until story-level actions have run in production long enough to trust the pattern at a wider radius. |

## 4. Known limitations carried into Fasa 4

- **`editorial_v1` covers exactly one field** (`ms-MY.Politik`). Boost is
  a silent no-op everywhere else. Any new scoring feature must check
  `getRankingVersion()` before assuming it's live.
- **No reliable database backups** — Google Drive snapshots only, per
  Izzat's own risk call ("cuma portal berita, bukan maklumat sensitif").
  Destructive changes still need real care.
- **One real admin.** No second reviewer on an editorial decision.
- **Overrides can expire out from under a longer-lived story.** A 7-day
  hide on a story still being covered a week later silently reverts;
  nothing currently notifies anyone.
- **A genuine check-then-write race exists on the 2-pin limit** (and
  structurally on any count-based write guard) — acceptable with one
  admin, not airtight. A database constraint would close it properly.
- **No undo/history UI.** `deactivateOverride()` exists and is tested;
  nothing in the app calls it. An admin who wants to reverse a decision
  currently needs direct database access.
- **`content_mismatch` detection was never wired into the Review Queue**
  — it needs `classify-production.js` to persist evidence it currently
  discards after computing.
- **No realtime/live-push Active Set updates.** An editorial decision
  (hide, reclassify, pin) takes effect on a reader's *next* fetch, not
  instantly in an already-open session. Consistent throughout the phase,
  never silently assumed otherwise.
- **Pin's replacement cost is invisible to the admin** by Izzat's own
  explicit choice (no "this will displace X" preview) — recorded as a
  deliberate tradeoff, not an oversight, in
  `docs/pin-governance-design-v1.md` §8.

## 5. Production verification summary

Every phase in §1 was verified against the **real** production database
and the **real** deployed site, not reasoned about:

- **Auth boundary**: attempted to forge `created_by`, rewrite an
  override's `override_type` after the fact, and reassign authorship —
  each attempt against the live database with a real signed-in session,
  each correctly rejected (`403`/`400`), each cleanup confirmable only
  because the client genuinely cannot delete audit rows.
- **Expiry**: inserted an already-expired override into production and
  confirmed it stopped reaching both the reader view and the admin
  queue; inserted a pin with a forged 30-day expiry and confirmed the
  server-side trigger overwrote it to exactly 24 hours.
- **Least privilege**: confirmed live that `public_active_overrides`
  returns `200` to an anonymous request while the base `story_overrides`
  table (`reason`, `created_by`) returns `401` to the same request.
- **Pin end-to-end**: two legitimate pins actually written to production,
  read back through the reader's own anonymous projection, a third pin
  in the same field correctly refused with a readable count, all test
  rows deleted afterward.
- **Deploy health**: `/` and `/admin` both `200` on
  `https://adjung-quick.vercel.app` after every phase's deploy; the
  reader's cold-start path produces a full 10-card Active Set with zero
  console errors, checked in a clean browser tab (not one carrying
  accumulated debugging history).

No feature in this document is implemented here. This is a record of
what exists.
