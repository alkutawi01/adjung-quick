# Pin Implementation Plan v1 (2026-08-13)

Status: `[x] Plan` `[ ] Approved` `[ ] Implemented` — **no code written yet**

FASA 3.6.5. Governance is locked in `docs/pin-governance-design-v1.md`
(Purpose B, position + membership guarantee, admin-only, max 2 per
edition/field, 24–72h expiry, mandatory reason). This plan answers *how*,
grounded in the actual code rather than assumption.

## ⚠️ Section 1 was WRONG — corrected 2026-08-13

The convergence audit refuted this plan's central architectural claim.
Left visible rather than silently rewritten.

**What §1 claimed**: Active Set construction "funnels through a single
function", `selectFieldActiveSet`, called from exactly two sites.

**What is actually true**: there is a **third** construction site the
plan missed. `ui/src/App.jsx:74` builds the Active Set directly via
`selectActiveSet(eligible, capacity)` from `lab/engine.js`, bypassing
`selectFieldActiveSet` entirely — verified: `App.jsx:7` imports it,
`App.jsx:74` calls it.

**Why it matters, and why it is nearly invisible**: that bypassing path
is what produces the Active Set on **first page load**, and again after
every `SWITCH_EDITION` (the effect's dependency array is
`[state.editionContext.activeEdition]`). So a pin implemented per §2 —
inside `selectFieldActiveSet` — would be **inert on the cold-start
view**, which is the first thing every reader sees. An admin would pin a
public-safety notice, see it work when navigating between Bidang, and
never learn that readers arriving fresh don't get it.

This costs nothing *today* only because `taxonomy[0]` (`Nasional`) is a
legacy-ranking field, so the bypass currently changes no behaviour. Pin
would be the first feature to expose it.

**Consequence for implementation**: pin must be applied at **all three**
construction sites, or — better — the third site must be collapsed into
`selectFieldActiveSet` first, so the "single choke point" this plan
assumed becomes true rather than merely asserted. That refactor should
land **before** Pin, not alongside it.

This is the fourth instance of the phase's recurring shape, and the first
one found in a *plan* rather than in code: something documented as
already-true that isn't.

### Fixed 2026-08-13 — the claim is now actually true

`ui/src/App.jsx`'s cold-start effect no longer builds the Active Set
directly. It now calls `reduce()` with the `SELECT_TOPIC` action —
the exact same reducer case `SELECT_TOPIC`/`SWITCH_EDITION` already use
— passing the just-fetched `rankedQueue` as context explicitly (calling
through `dispatch()`'s own closure here would still see the pre-fetch
empty state, since this runs before React re-renders from
`setRankedQueue()`). `selectActiveSet`/`selectRepresentation` are no
longer imported by `App.jsx` at all — the duplicate logic is gone, not
routed around.

**§1's claim is therefore now genuinely true**: `selectFieldActiveSet`
is the one place eligibility, released-story exclusion, and the ranking-
flag branch are allowed to live. Pin can be implemented per §2 below
without the caveat above.

---

## 1. Where Pin applies — and why it has no Boost-style limitation

*(Original text retained below for the record — read it with the
correction above in mind.)*

Traced in `state/reducer.js`. Active Set construction funnels through a
single function:

```js
function selectFieldActiveSet(eligible, editionId, field, capacity, control) {
  if (getRankingVersion(editionId, field) === 'editorial_v1') {
    return selectEditorialActiveSet(eligible, capacity);   // scoring path
  }
  return control
    ? selectActiveSetWithControl(eligible, control, capacity, [])
    : eligible.slice(0, capacity);                          // legacy path
}
```

Called from exactly two sites (`SELECT_TOPIC` line 125, `SWITCH_EDITION`
line 300), plus a separate incremental path in `RELEASE_STORY`.

**This is the decisive structural difference from Boost.** Boost is a
*scoring modifier*, so it only does anything where scoring runs —
`editorial_v1`, i.e. `ms-MY.Politik` alone. Pin *bypasses selection*, so
it can be applied **before the branch**, wrapping `selectFieldActiveSet`
rather than living inside either path:

```
eligible ──► [extract pinned] ──► [rank the rest, either path] ──► [pinned first, then ranked]
```

Result: **Pin works in every edition and every Bidang immediately**, with
no ranking activation required and no change to either selection
algorithm. Both paths keep their existing behaviour on the non-pinned
remainder.

This is the honest inverse of the Boost finding: there, the plan had to
*restrict* the UI to match a limited backend. Here, no restriction is
needed — and that must not be assumed by analogy. It is a real
difference, verified in the code.

## 2. Implementation shape

```js
// applied inside selectFieldActiveSet, before the ranking branch
const pinned  = eligible.filter(c => c.pinned);           // position guarantee
const rest    = eligible.filter(c => !c.pinned);
const ranked  = <existing branch, capacity - pinned.length>;
return [...pinned, ...ranked];
```

- **Position guarantee**: pinned entries are placed first, in `created_at`
  order (oldest pin first, so a second pin does not displace the first).
- **Membership guarantee**: satisfied automatically — a pinned story is
  in `eligible` regardless of whether ranking would have chosen it.
- **Displacement**: `capacity - pinned.length` is exactly the
  acknowledged cost from the governance doc, expressed in one line.
- `pinned` is threaded the same way `boosted` already is
  (`productionAdapter.js` → cluster → `editorialRankingAdapter.js`), so
  no new plumbing pattern.

**Cap defensively**: if more than 2 pins somehow reach the reducer
(stale data, a write that bypassed the app), take the 2 oldest and ignore
the rest. The reducer must never let bad data blank the Active Set.

## 3. Enforcing the 2-pin limit at write time

Per governance: refused with a plain explanation, **never silently
accepted**. In `reviewQueueAdapter.js`'s `submitPinOverride()`:

1. Query active, unexpired pins for that `(edition, field)`
2. If ≥ 2, throw an error naming the existing pinned stories so the admin
   can choose what to unpin
3. Otherwise write the override

**Known limitation, stated not hidden**: this is a check-then-write race
— two concurrent pins could both pass step 1. With one admin this cannot
realistically occur, and the reducer's defensive cap (§2) bounds the
damage to "the 2 oldest win" rather than a broken Active Set. A database
constraint would be the real fix; not worth it today, recorded so the
next person doesn't assume it's airtight.

## 4. Expiry — enforced at read time AND set at write time (DONE)

Pin uses 24h default, far shorter than hide/reclassify's 7 days, so this
section originally flagged two things as still-needed. **Both are now
fixed**, ahead of Pin, per ChatGPT's explicit instruction to close
lifecycle bugs before opening Pin implementation:

**Read-time enforcement** — `db/schema-public-active-overrides-view.sql`
now filters `active = true AND (expires_at IS NULL OR expires_at >
now())`, and `fetchReviewQueue()` carries the matching `.gt('expires_at',
…)` predicate. Documented in full at
`docs/override-expiry-enforcement-bugfix-v1.md`.

**Write-time duration** — originally the write path used one hardcoded
7-day expiry for every override type, which would have let a pin
silently outlive its own 24h/72h rule by five days
(`docs/editorial-adversarial-audit-v1.md` finding B). Fixed by
`db/schema-fix-server-side-expiry.sql`: a `BEFORE INSERT` trigger
computes `expires_at` server-side from `override_type` (`pin` → 24h,
everything else → 7 days), unconditionally — the client no longer
supplies `expires_at` at all. This also closed finding C in the same
migration: since only Postgres's own clock ever sets or checks expiry
now, the browser-vs-server clock skew this project has already hit for
real ("JWT issued at future") cannot affect it.

Verified live in production: a pin row inserted with a forged 30-day
`expires_at` came back at exactly 24 hours.

## 5. Reader release vs. pin — a real conflict

If a reader swipes away (releases) a pinned story, does it come back?

**Recommendation: no.** `state/reducer.js`'s `excludeEverReleased()`
should keep winning over pin.

Reasoning: a pin guarantees the story is *offered*, not that it is forced
back after a reader has personally dismissed it. Re-inserting it would
make the reader's own action feel broken, and Purpose B — "the editor
wants readers to see this" — is satisfied the moment it is shown. The
alternative (pin overrides release) turns an editorial guarantee into
something a reader cannot escape.

Needs ChatGPT's confirmation, as it is a genuine precedence question the
existing table does not cover: it ranks *editorial* actions against each
other, not editorial actions against *reader* actions.

## 6. UI

Admin-only.

**Corrected 2026-08-13** (audit finding 1): this line previously said
"already enforced and tested", which was false — `canPerformAction()`
had no production callers at all. The gate is now real, in
`writeOverride()` **and** in RLS. Pin therefore needs no new
authorization machinery, but that is true *because the gap was fixed*,
not because it was never there. Anyone reading this plan should treat
"already enforced" claims as requiring a caller-level check, not a unit
test.

Same compose pattern as the other actions, with governance-mandated copy:

> "Berita ini akan diberi keutamaan dan dipaparkan di bahagian teratas."

Never mentions displacement. Reason field required, with a placeholder
holding it to the higher standard governance asks for.

Surface question: like Boost, the Review Queue is arguably the wrong home
(it shows *problem* stories; pin targets *correct* ones). Deferred to
ChatGPT rather than assumed.

## 7. Verification

All five layers of `docs/editorial-action-verification-standard-v1.md`,
plus pin-specific:

| # | Check |
|---|---|
| 6 | Pinned story appears at **position 0** of the Active Set |
| 7 | A pinned story **not otherwise selected** does enter (membership guarantee) |
| 8 | Exactly `capacity - pins` ranked stories accompany it — no over/under-fill |
| 9 | A third pin is **refused with a readable error**, not silently dropped |
| 10 | An **expired** pin stops taking slot 1 |
| 11 | Hide still beats pin |
| 12 | Works on **both** ranking paths (`ms-MY.Politik` and a legacy field) |

Layer 12 matters most: it is the claim in §1 that Pin has no Boost-style
limitation, and it must be proven rather than reasoned.

## Open questions — answered by ChatGPT (2026-08-13)

1. **Reader release vs. pin (§5) — confirmed.** A reader's own release
   wins; pin is never forced back after a reader has dismissed it. Pin
   guarantees the story is *offered*, not that it survives a reader's own
   decision to dismiss it.
2. **Where Pin's admin surface lives (§6) — NOT the Review Queue.** The
   queue means "something may be wrong"; pin means "something is already
   correct, and an editor wants it emphasised". Deferred to a future
   Editorial Desk / Active Set management surface — not decided or built
   this phase.
3. **Expiry fix — ship alongside Pin's effort, but recorded as its own
   lifecycle bug, never as a "Pin feature".** ChatGPT's own framing:
   *"Menyimpan tarikh tamat tidak bermaksud sistem benar-benar tamatkan
   sesuatu. Hanya read path yang menguatkuasakannya."* Both halves (§4)
   are now done and committed under their own name
   (`docs/override-expiry-enforcement-bugfix-v1.md`,
   `db/schema-fix-server-side-expiry.sql`), landing before Pin's own
   implementation commits — consistent with that framing, not a
   contradiction of it.

## Status

Findings A (Active Set convergence), B (hardcoded duration), and C (clock
mismatch) — all confirmed by the audit and blocking Pin — are now fixed
and verified against production. Finding D (Review Queue conflating
"resolved" with "any override") is also fixed, in
`ui/src/admin/reviewQueueAdapter.js`. Findings E (no `field` column) and F
(pin on unclassified stories) remain open, deferred to Pin's own
implementation per `docs/editorial-adversarial-audit-v1.md`.

Governance and the architectural foundation are now sound. Pin
**implementation** itself has not started.
