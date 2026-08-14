# Pin Implementation — Design Review v1 (2026-08-13)

Status: `[x] Design decided` `[ ] Implemented` — **no code written yet**

Per ChatGPT: the four blocking findings are plumbing fixes; the
remaining risk is that Pin's *behaviour contract* isn't yet translated
into a real data model and pipeline. This resolves that, before any
coding — answering pipeline placement, the data model (Finding E),
precedence across all four cases, and the verification additions.

## 1. Pipeline placement — resolved without a new stage

ChatGPT's own framing: pin extraction may need to happen **before** the
classification filter, or an unclassified story could never be pinned
(Finding F).

**Finding, re-examined**: it doesn't need a new pipeline stage at all.
`topic` — the value the classification filter gates on — is already
decided by `resolveStoryField()` inside `productionAdapter.js`, which
already runs *before* App.jsx/reducer.js's topic filter and already lets
`hide`/`reclassify` override the classifier's verdict. Extending that
same function with a `pin` branch makes pin override `topic` at the
**same point** reclassify already does — which is structurally *before*
the classification filter, because `resolveStoryField()` *produces* the
value the filter reads.

```js
// state/editorialStateResolver.mjs — the ONE addition needed
const pin = pickMostRecent(activeOverrides.filter(o => o.override_type === 'pin'));
if (pin) return { visible: true, field: pin.new_field, source: 'override', overrideId: pin.id, pinned: true };
```

Placed between the existing `hide` and `reclassify` branches — matching
the already-locked precedence order (`docs/editorial-override-data-
model-v1.md`: source disable > hide > **pin** > reclassify > boost >
classifier).

**This is the actual resolution to Finding F**: an unclassified story's
`classifierOutput.classification_status` is `'unclassified'`, but the
`pin` branch returns before that's ever checked — its `field` comes from
the override, not the classifier. A story the classifier never placed
anywhere can now be pinned, using exactly the mechanism hide/reclassify
already proved out, not a new one.

**What still lives where it already does**: once a pinned story's
`topic` is correctly set, it reaches `eligible` in
`state/reducer.js`'s `SELECT_TOPIC` case like any other story. The
position + membership guarantee (`docs/pin-implementation-plan-v1.md`
§2 — extract pinned entries, place first, rank the remainder into
`capacity - pins`) still belongs inside `selectFieldActiveSet`, unchanged
from the original plan. That plan was correct about *where the Active
Set gets built*; it just didn't yet explain how an unclassified story
gets into `eligible` in the first place. This section is that missing
piece.

## 2. Data model — Finding E resolved: reuse `new_field`, add no column

ChatGPT posed this as A) add a `field` column vs B) resolve field at
query time. **Neither, exactly** — a third option dominates both:
**reuse `story_overrides.new_field`, the column `reclassify` already
has.**

Once §1 is settled, this becomes obvious: `new_field` already means
*"the Bidang this override says the story belongs in"* — that's
`reclassify`'s exact semantic, and it's precisely what pin needs too. A
pin write sets `new_field` to the admin's chosen Bidang, exactly like a
reclassify write does.

| | Option A (new column) | Option B (query-time) | **Chosen: reuse `new_field`** |
|---|---|---|---|
| Schema change | Yes | No | **No** |
| Query for the 2-pin limit | Simple | Needs a join/derivation | **Simple — same column reclassify already uses** |
| "Duplicates classification state"? | Yes (new duplication) | No | **No new duplication — `new_field` already duplicates it for reclassify, an accepted, already-shipped pattern** |
| Handles an unclassified story | Yes | **No** — nothing to derive from | Yes |

Option B is eliminated outright: it cannot resolve Finding F at all —
there is no classifier field to derive when the story is unclassified,
which is exactly pin's real use case. Option A works, but invents a
second column to store what `new_field` already stores. Reuse avoids the
migration entirely.

**Considered and rejected**: renaming `new_field` to something more
generic now that two override types share it. Real improvement, real
migration risk (every existing query touches it), no functional gain.
Deferred, not forgotten — noted here for whoever revisits this.

## 3. Precedence — four cases, three already correct by existing code order

| Case | Behaviour | Why |
|---|---|---|
| **Classified + pin** | Pin's `new_field` overrides the classifier's field | `resolveStoryField()`'s pin branch (§1), same as reclassify |
| **Unclassified + pin** | Pin's `new_field` places it — the case pin exists to solve | Same branch; classifier status never checked once pin matches |
| **Hidden + pin** (both active) | **Hide wins** — story invisible | Hide is checked *first* in `resolveStoryField()`, before pin is ever evaluated. No new code. |
| **Released (reader) + pin** | **Release wins** — story stays excluded | `excludeEverReleased()` strips the story from `eligible` in `state/reducer.js` *before* `selectFieldActiveSet` (and therefore pin) ever runs. No new code. |

Three of four cases require **zero new logic** — they already resolve
correctly purely from the *order* existing functions run in. Only the
unclassified case needed the one-branch addition in §1. This is worth
stating plainly: Pin's behaviour contract is almost entirely a
consequence of where in the pipeline it's inserted, not new rules.

## 4. Verification plan — additions to the existing standard

Per `docs/editorial-action-verification-standard-v1.md`'s five layers,
plus the pin-specific cases ChatGPT named:

| # | Test | Proves |
|---|---|---|
| 1 | Pin enters Active Set at position 0 | Position guarantee |
| 2 | Pin **not otherwise selected** (low score, wrong topic under the old classifier field) still enters | Membership guarantee — the actual point of pin |
| 3 | Pin on a genuinely **unclassified** story enters under `new_field` | §1's fix, proven not just reasoned |
| 4 | Pin **expires** → story reverts to classifier field (or disappears, if it was never otherwise eligible) | Read-time expiry (already fixed) applies to pin too |
| 5 | Pin **conflicts**: hidden pin doesn't appear; pinned-and-released doesn't appear; pinned-and-reclassified appears under the *pin's* field, not the reclassify's | All four precedence cases from §3, mechanically |
| 6 | Pin **undo** (`deactivateOverride`) → story reverts | Reuses the existing, already-tested undo mechanism |
| 7 | Pin on **cold start** (first page load, not just after Bidang navigation) | Proves the Active Set convergence fix (finding A) actually protects Pin — the exact scenario that bug would have broken |

Test 7 is the one this whole review chain exists to make possible: it
was structurally untestable before the convergence fix landed, since
cold start used a different code path than everything else.

## Summary for implementation

- No new schema migration — `new_field` is reused, not duplicated
- One new branch in `state/editorialStateResolver.mjs`'s
  `resolveStoryField()` (pin, between hide and reclassify)
- Pin extraction inside `selectFieldActiveSet` per the original plan §2,
  unchanged
- All four precedence cases covered, three with no new code
- 7 tests specified, none yet written

Still not implemented. This document is the design; implementation is
the next step, pending ChatGPT's review of it.
