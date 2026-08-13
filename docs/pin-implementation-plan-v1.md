# Pin Implementation Plan v1 (2026-08-13)

Status: `[x] Plan` `[ ] Approved` `[ ] Implemented` — **no code written yet**

FASA 3.6.5. Governance is locked in `docs/pin-governance-design-v1.md`
(Purpose B, position + membership guarantee, admin-only, max 2 per
edition/field, 24–72h expiry, mandatory reason). This plan answers *how*,
grounded in the actual code rather than assumption.

## 1. Where Pin applies — and why it has no Boost-style limitation

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

## 4. Expiry must be enforced at READ time

Pin uses 24–72h, far shorter than hide/reclassify's 7 days, so expiry
actually matters here in a way it has not yet.

`expires_at` is `NOT NULL` and set at write time, but **nothing currently
enforces it on read** — `public_active_overrides` filters only on
`active = true`. An expired pin would therefore keep occupying slot 1
indefinitely.

Fix, as part of this phase:

```sql
CREATE OR REPLACE VIEW public_active_overrides AS
  SELECT story_id, edition_id, override_type, new_field
  FROM story_overrides
  WHERE active = true AND expires_at > now();
```

This corrects a latent flaw affecting hide/reclassify too — they simply
have not been alive long enough for anyone to notice.

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

Admin-only, per `canPerformAction` (already enforced and tested). Same
compose pattern as the other actions, with governance-mandated copy:

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

## Open questions for ChatGPT

1. Reader release vs. pin (§5) — confirm the recommendation
2. Where Pin's admin surface lives (§6)
3. Whether the read-time expiry fix (§4) ships with Pin or separately, as
   it also changes hide/reclassify behaviour
