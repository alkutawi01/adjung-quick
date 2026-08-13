# Override Expiry Enforcement — Lifecycle Bug Fix v1 (2026-08-13)

Status: `[x] Found` `[x] Fixed` `[x] Verified` — **a lifecycle bug, not a Pin feature**

Recorded separately per ChatGPT's explicit instruction: this is not part
of Pin. It was *found* while planning Pin, but it affects hide,
reclassify, and boost — all already live in production.

## The principle this exposes

> **Storing an expiry date does not mean the system expires anything.
> Only the read path enforces it.**

Same family as the two bugs already found this phase:

| | Stored | Enforced |
|---|---|---|
| Earlier | UI reported success | DB never changed |
| Earlier | Schema + RLS existed | No `GRANT`, so nothing worked |
| **This** | `expires_at` written | **No read path checks it** |

The pattern is consistent: Adjung Quick's real risk is no longer
"building features" — it is layers that look connected but aren't.

## The bug

`story_overrides.expires_at` is `NOT NULL` and correctly populated at
write time (7 days for hide/reclassify/boost). **Nothing anywhere reads
it.** Every override is therefore permanent in practice.

Not yet visible in production only because the system is younger than
the shortest expiry. A 24-hour pin would have exposed it within a day.

### Two unenforced paths, not one

Grepping every query against overrides found the view *and* a second
site the original plan missed:

**1. Reader path** — `db/schema-public-active-overrides-view.sql`
filtered on `active = true` only. An expired hide would hide a story from
readers forever.

**2. Admin path** — `ui/src/admin/reviewQueueAdapter.js:53`, the
"already resolved" exclusion in `fetchReviewQueue()`, also filtered on
`active` only.

The second is subtler and arguably worse: once an override expired, the
story would become visible to readers again (after fix 1) **while still
being hidden from the admin's own Review Queue** — so the admin could
never see, let alone re-decide, a story the system had quietly restored.
Reader and admin would hold different beliefs about the same story.

## The fix

**Reader path** — `db/schema-public-active-overrides-view.sql`:

```sql
CREATE OR REPLACE VIEW public_active_overrides AS
  SELECT story_id, edition_id, override_type, new_field
  FROM story_overrides
  WHERE active = true
    AND (expires_at IS NULL OR expires_at > now());
```

**Admin path** — `fetchReviewQueue()` gains `.gt('expires_at', <now>)`.

### Why `expires_at IS NULL OR ...` when the column is `NOT NULL`

Per ChatGPT's caution not to assume every override type expires the same
way. Today `story_overrides.expires_at` is `NOT NULL`, so the null branch
is unreachable — but the intended model is deliberately **not** uniform:

| Override | Expiry |
|---|---|
| Hide | may expire |
| Reclassify | may expire |
| Boost | must expire |
| Pin | must expire |
| **Source override** | **different — never expires** (`source_overrides` has no `expires_at`; a source problem is operational config, not temporary content) |

The null-tolerant predicate encodes "an override without an expiry is
permanent, not instantly stale" so that a future non-expiring
story-level override cannot silently vanish. Cheap now; a real bug to
retrofit later.

## What this does NOT change

- No override type's expiry duration changes
- `active = false` (undo) still works exactly as before, independently
- `source_overrides` is untouched — it has no `expires_at` by design
- No Pin code. Pin remains unbuilt.

## Verification

1. Migration applied to production, view confirmed to carry the new predicate
2. Regression test added: an override past `expires_at` must not affect
   the reader, and must not be excluded from the Review Queue
3. Full suite green
