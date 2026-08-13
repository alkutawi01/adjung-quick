# Geography Residual Navigation Policy v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[RISK] policy document. No classifier, taxonomy, or UI code
changed here.**

Supersedes the original ask (a taxonomy naming-convention document for
"Malaysia vs Nasional") — while gathering data for that question, a
larger, previously-undiscovered gap surfaced: it isn't a naming
question, it's a **navigation gap**. Real, correctly-classified stories
have no way for a reader to ever reach them.

---

## 1. Subject taxonomy vs. geography residual label — two different
concepts, currently conflated in how they're discussed

**Subject taxonomy** — the 14 declared Bidang a reader selects from the
Wheel (`state/editions.js`'s `taxonomy` array): Politik, Jenayah, Bisnes,
Sukan, Alam Sekitar, Bencana, Kesihatan, Pendidikan, Teknologi, Sains,
Budaya, Hiburan, Agama, Gaya Hidup. Each answers *"what is this story
about?"*

**Geography residual label** — `Malaysia`/`Dunia` for `ms-MY`
(`classification/lib/edition-taxonomy.mjs`'s `EDITION_GEOGRAPHY_RESIDUAL_LABEL`).
Fires only when a story has **zero subject evidence** but is
identifiably about Malaysia or elsewhere. Answers a completely different
question: *"where is this story, given we don't know what it's about?"*

These were designed as genuinely different concepts — and the design
itself is sound (confirmed in `docs/ms-my-taxonomy-review-v1.md`: forcing
these into a subject would fabricate false subject signal). **The gap is
that only one of the two ever got a reader-facing door.**

## 2. Current state — verified, not estimated

| | Count | % of placed ms-MY content |
|---|---:|---:|
| Malaysia (geography residual) | 63 | 8.5% |
| Dunia (geography residual) | 46 | 6.2% |
| **Total orphaned** | **109** | **~15%** |

**Why inaccessible — verified two ways:**

1. `state/editions.js`'s `ms-MY.taxonomy` array (14 items) — confirmed
   by direct read — does not include `Malaysia` or `Dunia`.
2. Live DOM check against the running app
   (`.bidang-wheel__item` elements): exactly the same 14 items render,
   `Malaysia`/`Dunia` appear nowhere.

`state/reducer.js`'s `SELECT_TOPIC` filters via `c.topic === action.topic`,
and `action.topic` can only ever be one of the 14 Wheel-rendered
strings — so `inBidang = rankedQueue.filter(c => c.topic === 'Malaysia')`
is simply never computed. These 109 stories are correctly classified,
correctly placed in the database, and then structurally unreachable —
not an empty state (which the product already handles gracefully,
`docs/empty-bidang-policy.md`), but stories that exist and can never be
shown.

**This is distinct from "unclassified"** — the existing empty-Bidang
design (a graceful "belum ada berita" message) was built for a Bidang
with genuinely zero content. This is the opposite: real content with
zero door to it.

## 3. Options

### A. Add Malaysia/Dunia to the Wheel as selectable items

```
Wheel: Politik, Jenayah, ..., Gaya Hidup, Malaysia, Dunia
```

- ✅ Fast, every story becomes reachable
- ❌ Mixes two different concepts in one list — a reader sees "Sukan,
  Agama, Malaysia, Dunia" side by side with no signal that the last two
  answer a different question than the rest

### B. Geography as a second dimension (not merged into the Wheel)

```
Bidang:  Politik / Agama / Sukan / ...      (subject — existing Wheel)
Lokasi:  Malaysia / Dunia                   (geography — new, separate)
```

- ✅ Keeps the two concepts honestly separate — matches what the
  architecture already models correctly under the hood
- ✅ Extensible if geography ever needs more granularity
- ❌ More UI work than A

### C. Force every residual-geography story into a subject

- ❌ **Not recommended.** `docs/ms-my-taxonomy-review-v1.md` already
  confirmed the residual path exists precisely because these stories
  have no real subject evidence — forcing one would fabricate signal
  and make classification less honest, not more useful.

## 4. Recommendation

**Short term: Option B, in minimum viable form.** The architecture
decision to lock now, before any implementation:

> **A geography residual label must have a reader-facing visibility
> path.** Classification producing content with no way to reach it is
> itself the defect — independent of which UI shape eventually solves
> it.

Minimum viable shape (illustrative, not a UI spec — implementation is a
separate, later step):

```
Bidang Wheel (unchanged):
  Politik, Jenayah, Bisnes, ..., Gaya Hidup

+ one additional, clearly-separate entry point:
  Lokasi: Malaysia / Dunia
```

Not decided here: whether that's a second wheel, a toggle, a tab, or
something else — that's a UI design question for whoever implements
this, informed by this policy, not decided by it.

**Option A is not recommended** — it would silently resolve the
navigation gap while re-introducing the conceptual mixing this review
exists to avoid.

## 5. What this document does NOT do

- Does not change `classification/lib/edition-taxonomy.mjs`,
  `state/editions.js`, or any classifier logic
- Does not modify `TopicWheel.jsx` or any UI component
- Does not implement Option B or any option — awaiting Izzat/ChatGPT
  decision
- Does not resolve the original "Malaysia vs Nasional" naming question
  — that's now downstream of this decision, not upstream of it (naming
  a thing that's unreachable is the wrong order of operations)

## 6. Why this matters for the original naming question

Once navigation exists (whatever shape it takes), the naming question
(`docs/ms-my-taxonomy-review-v1.md`'s recommendation) becomes live
again and unchanged in substance: `Malaysia` vs a "Nasional" label is
still a low-risk, purely cosmetic decision — it just needs to be made
*after* a reader can actually reach the content it's labeling.
