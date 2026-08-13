# Boost Action Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] plan. No implementation here**, per ChatGPT's
explicit "jangan implement dahulu". FASA 3.6.3c. Answers ChatGPT's 5
points, plus one blocking finding that materially changes the scope.

## ⚠️ Blocking finding: Boost would be a silent no-op almost everywhere

Read from the code, not assumed (`state/rankingFlags.js`,
`state/reducer.js` §`selectFieldActiveSet`, `state/editorialRankingAdapter.js`):

```js
export const RANKING_FLAGS = { 'ms-MY': { Politik: 'editorial_v1' } };
```

The Editorial Ranking Engine — the *only* pipeline that calls
`scoreCandidates()`, and therefore the only place a scoring signal like
boost can possibly take effect — is active for exactly **one**
(edition, field) pair: `ms-MY.Politik`. Every other pair falls through
to the legacy path:

```js
return control ? selectActiveSetWithControl(...) : eligible.slice(0, capacity);
```

Neither branch consults candidate scoring at all. So a boost written
against a story in Nasional, Sukan, Bencana — or anything in en-global
or ar-global — would be stored correctly, pass every RLS and audit
check, and **do absolutely nothing**, with no error shown.

That is precisely the failure shape this session already hit twice (the
missing GRANT; the never-read `story_overrides`). Shipping boost
without addressing it would be the third instance of the same class.

**Recommended resolution (needs ChatGPT's decision, not assumed here):**

- **Option A — scope the UI to reality.** Offer Boost only where
  `getRankingVersion(edition, field) === 'editorial_v1'`. Elsewhere the
  button is absent, with a plain-Malay explanation. Honest, small, no
  ranking changes. **This is my recommendation.**
- **Option B — widen `editorial_v1`.** Activate the Editorial Ranking
  Engine for more fields so boost is broadly useful. This is a ranking
  activation decision with real blast radius, explicitly out of
  3.6.3c's scope and against "jangan sentuh ranking algorithm".
- **Option C — teach the legacy path about boost.** Rejected: it means
  editing the ranking path directly, the one thing repeatedly ruled out.

## 1. What Boost means

Boost is **a signal added to scoring**, raising a story's *chance* of
selection. It is explicitly **not** a pin, not a guaranteed slot, not a
ranking bypass. A boosted story still competes — and can still lose, to
a fresher story, a more trusted source, or diversity selection.

Contract, stated so it can be tested:

> Boost increases the probability of selection. It never guarantees
> placement.

## 2. Pipeline position

Locked previously (`docs/ranking-engine-contract-v1.md` amendment) and
unchanged here — boost enters at **scoring**, never after selection:

```
Generated signals (freshness + sourceTrust + confidence)
              +
       Editorial boost
              ↓
      Candidate scoring          ← boost applies HERE
              ↓
     Diversity selection
              ↓
   Editorial composition
              ↓
        Active Set
```

Applying boost after `selectDiverseCandidates()` would make it a no-op
(that stage already truncates to capacity) — the exact bug caught in an
earlier design review. It stays at scoring.

**Magnitude**: current scores are `freshness (0–100) + sourceTrust
(0–~100) + confidence (0–10)`. A boost must be meaningful but not
dominant — a proposed **+40**, roughly "two freshness buckets", enough
to lift a good-but-older story into contention without letting a stale
story from a weak source beat a breaking one. A starting parameter for
calibration, not a locked constant — same posture as `FRESHNESS_BUCKETS`.

## 3. Data model

No schema change needed — `story_overrides` already supports it
(`override_type` CHECK already includes `'boost'`):

| Field | Column |
|---|---|
| Scope | story-level only (`story_id` + `edition_id`) |
| Reason | `reason`, `NOT NULL` |
| Actor | `created_by` → `editors.user_id` |
| Lifecycle | `expires_at NOT NULL` (7 days, as hide/reclassify) |
| Reversible | `active` → `false` via existing `deactivateOverride()` |

`new_field` stays `NULL` for boost. No new column, no migration.

## 4. Guards

| Guard | Mechanism | Status |
|---|---|---|
| Editor may boost | `canPerformAction('editor', 'boost') === true` | Already true and tested (`db/editor-auth.test.mjs`) |
| Pin stays admin-only | `ADMIN_ONLY_ACTIONS` includes `pin`, not `boost` | Already true and tested |
| **Boost never beats hide** | `resolveStoryField()` returns `visible: false` on hide, so a hidden story gets `topic: null` and never enters the candidate pool — boost cannot resurrect it | Already true; will be given an explicit test |
| Boost does not alter field | Boost must leave `topic` untouched — it changes *rank within* a Bidang, never *which* Bidang | Already true (`resolveStoryField` ignores boost — proven by an existing test) |

Notably every guard is already satisfied by existing code. Boost needs
*wiring and proof*, not new safety machinery.

## 5. Verification plan

Per `docs/editorial-action-verification-standard-v1.md`, all 5 layers,
plus two boost-specific ones that layers 1–5 don't cover:

| # | Layer | Evidence |
|---|---|---|
| 1 | UI action | Boost flow completes, card leaves the queue |
| 2 | Auth role | `editors` returns the real role, HTTP 200 |
| 3 | DB row | `override_type: boost`, reason + `created_by` present |
| 4 | Reader projection | `public_active_overrides` returns it to anon |
| 5 | Undo | Deactivate restores prior ranking; row kept as audit |
| **6** | **Ranking effect** | The boosted story's score is measurably higher, and it can be shown entering a selection it would otherwise miss |
| **7** | **Ranking integrity** | Diversity still holds (no single-source takeover), and a boosted story still *loses* to a sufficiently stronger candidate — proving "chance, not guarantee" |

Layer 7 matters most: a boost that always wins is a pin wearing a
different name.

## Out of scope

Pin, source override, classifier rules, taxonomy, widening
`editorial_v1` (unless ChatGPT picks Option B), and any change to
`freshnessScore`/`scoreCandidate`'s existing terms.

## Next

Await ChatGPT's decision on the blocking finding (Option A / B / C),
then implement accordingly. Not implementing before that answer — the
choice changes what gets built.
