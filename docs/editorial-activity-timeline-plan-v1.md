# Editorial Activity Timeline — Design Plan v1 (2026-08-15)

Status: `[x] Plan` `[x] Approved` `[x] Implemented` — commit `b80eab5`

## Implementation note (2026-08-15)

ChatGPT approved with: role-only identity (no name column), 30-row
pagination ("30 lagi"), and one added rule not in the original plan —
event ordering must never be `created_at` alone, since one override can
produce two events at two different real times; both are pushed into a
single derived list and sorted by `timestamp`. Verified live against
production: real created/deactivated events render with correct role
attribution, deactivated overrides show "sudah tidak aktif" with no
fabricated timestamp, reader (`/`) unaffected. 14 suites, 0 failures.

FASA 4.1.1, per ChatGPT's explicit instruction: design document only.
"Editorial Activity Timeline", not "Everything Timeline" — the name is
deliberate. This fills the **Admin** visibility layer ("apa yang perlu
saya semak?"), distinct from the System layer `operational_snapshots`
already fills ("adakah pipeline sihat?"). The two must not be merged.

## Definisi "aktiviti editorial"

A **human decision an editor/admin made about a story**, recorded as a
row in `story_overrides`. Not a system event, not a pipeline event, not
a reader action. Concretely, for V1: the four `override_type` values
`story_overrides` already supports — `hide`, `reclassify`, `boost`,
`pin` — plus the natural fact each row already carries: when its effect
ends (`expires_at`).

`source_overrides` (ignore_category/reduce_trust/disable) is a
**source-level operational decision**, not a story-level editorial one
— its own `override_type` values don't appear in ChatGPT's V1 scope
list, so it's out of scope here, not silently folded in. Named as a
likely V1.1 candidate, not decided now.

## Data source

| Source | Used for | NOT used for |
|---|---|---|
| `story_overrides` | The entire V1 event set — every row already carries `override_type`, `new_field`, `reason`, `created_by`, `created_at`, `expires_at`, `active` | — |
| `source_overrides` | Nothing in V1 | Deferred — see above |
| `operational_snapshots` | Nothing — explicitly excluded per ChatGPT ("jangan campur jika bukan editorial") | System Health Snapshot already owns this data |

One query, one table, same discipline the Digest and Review Queue were
already built under: **read what exists, compute nothing new.**

```js
// Sketch, not final code.
const { data } = await supabase
  .from('story_overrides')
  .select('id, story_id, edition_id, override_type, new_field, reason, created_by, created_at, expires_at, active')
  .eq('edition_id', editionId)
  .order('created_at', { ascending: false })
  .limit(50); // bounded — see "What this plan does NOT do"
```

## Event format

Two DISTINCT sentence types come from the SAME row — a created-event
(always present) and an expiry-event (only if `expires_at` is real,
which it always is — `story_overrides.expires_at` is `NOT NULL`):

| override_type | Created sentence | Expiry sentence |
|---|---|---|
| `hide` | "Berita disembunyikan" | "Sembunyi tamat tempoh" |
| `reclassify` | "Berita dipindahkan ke {new_field}" | "Pemindahan tamat tempoh" |
| `boost` | "Berita dinaikkan" | "Naik taraf tamat tempoh" |
| `pin` | "Berita disemat pada {new_field}" | "Semat tamat tempoh" |

Both sentences are **facts already in the row** — `created_at` and
`expires_at` are real columns, never invented. This is the same
"allowed vs not allowed" line ChatGPT drew explicitly:

- **Allowed**: "Pin dibuat pada 10:00 dan akan tamat pada 10:00 esok."
  (both timestamps are real columns)
- **Not allowed**: "Admin membatalkan Pin pada 14:00." (`deactivated_at`
  does not exist — see Lifecycle below)

**Who**: `created_by` is a real `UUID` (`editors.user_id`), but
`editors` has no display-name column today — only `user_id` and `role`.
V1 can show a role-level attribution ("oleh admin" / "oleh editor")
resolved via a join to `editors`, or omit the actor entirely and show
only the action + timestamp. **Left open for approval, not decided
here** — this is a real gap the design shouldn't paper over with a
guessed name field.

## Sorting

Most recent first, `created_at` descending — for both created- and
expiry-events. When both event types exist for the same row, they're
independent items in the sorted list, not nested — a Timeline is a
feed of things that happened, not a tree of overrides.

## Lifecycle — the three states ChatGPT asked about

| State | Can Timeline show it? | Why |
|---|---|---|
| **Active override** | Yes — "dibuat" event, plus "akan tamat pada {expires_at}" as a forward-looking fact if `expires_at` is in the future | Both fields are real |
| **Expired override** (`expires_at` < now, `active` still `true` — this project's own established behaviour: expiry is enforced by query filters at read time, e.g. `fetchReviewQueue()`'s `.gt('expires_at', now)`, never by flipping `active`) | Yes — "tamat tempoh pada {expires_at}" once that timestamp has passed | `expires_at` is real; nothing is inferred |
| **Deactivated override** (`active` flipped to `false` before its natural expiry — e.g. an undo) | **Limited.** Timeline can state the CURRENT fact "sudah tidak aktif", but cannot say WHEN or WHO, and must not appear as a dated event in the chronological feed at all — there is no timestamp to sort it by | `deactivated_at`/`deactivated_by` do not exist. Inventing a event-time from "I noticed `active` is now `false`" would be exactly the fabricated-timestamp problem ChatGPT named |

Concretely: a deactivated override's *created* event still appears
(that's real), but no *deactivated* event appears in the feed — its
absence is itself the honest representation of what the data can
support today.

## Migration needed for V1?

**No.** Everything above reads columns `story_overrides` already has.
No schema change, no new table — consistent with "purely additive,
nothing before design is agreed."

## Audit metadata for the future — named, not built

Already flagged once before
(`docs/operational-visibility-data-contract-v1.md` §"Editorial Activity
Timeline — real timestamps only"), repeated here because this is where
it would actually get used: `deactivated_at`, `deactivated_by`,
`deactivation_reason` on `story_overrides` becomes worth a real
migration once more than one admin exists and a manual-reversal audit
trail actually matters (right now Izzat is the only admin — attribution
of "who undid this" has no second party to distinguish it from).
Recording it here again so it isn't rediscovered as a surprise when
Timeline V2 or a second editor account eventually needs it.

## What this plan does NOT do

- No UI built
- No schema/migration applied
- No `deactivated_at`/`deactivated_by` added
- No `source_overrides` events included (deferred, not decided)
- No unbounded query — a real limit (sketch above uses 50) belongs in
  the approved version; exact number not decided here
- Does not decide the "who" display question (role-only vs a future
  display-name column) — flagged for approval, per the same discipline
  4.1.3's open (a)/(b) question was left open rather than assumed

## Next

Awaiting approval — including the two open decisions (actor display,
and the exact row-limit/pagination shape) — before any implementation
starts.
