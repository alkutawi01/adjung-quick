# Pin Governance Design v1 (2026-08-13)

Status: `[x] Design` `[ ] Approved` `[ ] Implementation` — **documentation only, Pin is NOT built**

FASA 3.6.5. Per ChatGPT: answer the governance questions before Pin
exists as code. *"Jangan beri pistol sebelum ada peraturan
penggunaannya."*

## Izzat's decisions (2026-08-13) — both now locked

**1. Purpose: B confirmed** ("ya"). Pin means *"the editor wants readers
to see this"*, not *"the most important story today"*. Importance stays
ranking's job.

**2. Pin behaviour: priority placement, appears first.** Izzat's own
words: *"diberi keutamaan je. mungkin muncul dlm aktif set pertama."*

This is a **refinement of §2 below, not just an answer about preview** —
it changes what Pin is:

| | Original draft | Izzat's decision |
|---|---|---|
| Guarantee | Membership in the Active Set | Membership **and position** — appears first |
| Framing | "bypasses the ranking contest" | "just given priority" |

So Pin is now a **positional** guarantee: the pinned story appears, and
it appears at the top. Section 7's conflict table is unaffected.

**On the replacement preview (§8): not wanted.** Izzat's framing is
prioritisation, not eviction, so a "this will displace X" prompt does not
match how he thinks about the action. §8 stays deferred and unbuilt.

## Pin Placement Guarantee (locked)

The nuance above was reviewed and resolved into governance rather than
left as a footnote. **Pin has two distinct effects**, and both are
intended:

1. **Position guarantee** — a pinned story appears at the **first
   position** of the Active Set.
2. **Membership guarantee** — if the story is **not already** in the
   Active Set, the system **brings it in**.

**Pin is therefore not merely re-sorting.** It is an intervention in the
Active Set.

**Consequence, acknowledged not hidden**: when the membership guarantee
engages, one Active Set slot is taken from another candidate. This is
recorded here as a real technical cost of the action. It is deliberately
**not** surfaced as a replacement preview (§8) — Izzat's framing is
prioritisation, and a preview would contradict it.

### Why pin is NOT restricted to stories already in the Active Set

That restriction was considered and **rejected**. It would make pin
purely a re-sort, which sounds safer but destroys the entire point of
Purpose B: the stories that most need pinning — a public-safety notice,
an official statement with low engagement — are exactly the ones ranking
would *not* place in the top 10 on their own. A pin that can only
reorder what already won cannot intervene in the real problem.

### Admin-facing language

The system must never expose the displacement mechanic to the admin:

| | |
|---|---|
| ❌ | "Berita ini akan menggantikan berita X." |
| ✅ | "Berita ini akan diberi keutamaan dan dipaparkan di bahagian teratas." |

The system manages slots. The admin states editorial intent.

### Why the 2-pin limit now matters *more*

Under the original "re-sort" reading, a high pin count was untidy. Under
the confirmed reading, each pin actively displaces a candidate — so the
limit is what keeps ranking alive rather than decorative. **The limit
stays at 2 active pins per (edition, field)**, unchanged, along with
admin-only, mandatory expiry, and mandatory reason.

## 1. Purpose — A or B?

ChatGPT posed two readings that look alike but aren't:

- **A** — "the most important story today"
- **B** — "a story the editor wants to be sure readers see"

**Recommendation: B.**

A is a *claim about the world* — and the ranking engine already tries to
answer it from freshness, source trust, and evidence. If a human has to
pin something because A is wrong, the honest fix is calibrating the
ranking, not overriding it story by story.

B is a *statement of editorial intent* the algorithm cannot derive: a
correction that must be seen, a public-safety notice, an ongoing story
the newsroom is committed to. Pin exists for what the system has no way
of knowing.

This distinction is testable, and it matters: under B, a pin that stays
up because "it's still important" is misuse — importance is ranking's
job.

## 2. Pin vs. Boost

| | Boost | Pin |
|---|---|---|
| Mechanism | +`BOOST_WEIGHT` at candidate scoring | Bypasses the ranking contest |
| Outcome | Raises the *chance* | *Guarantees* the slot |
| Can lose | **Yes** — proven by test | No, by definition |
| Role | `editor` | `admin` only |
| Works where | `editorial_v1` fields only | Any field (it doesn't need scoring) |

One line: **boost argues, pin decides.**

Updated per Izzat's decision above: pin guarantees not just *presence*
but *position* — the pinned story appears first in the Active Set.

Note the asymmetry — pin works everywhere precisely *because* it skips
scoring, so it does not carry Boost's `editorial_v1`-only limitation.
That makes it more available and more dangerous at once.

## 3. Who may pin

`admin` only. Already enforced and tested (`ADMIN_ONLY_ACTIONS` in
`db/editor-auth.mjs`), per the Principle of Escalation: actions whose
impact compounds beyond a single story need the higher role.

## 4. How many pins

**Recommendation: maximum 2 active pins per (edition, field).**

Reasoning from the real number: the Active Set is 10 Stable Spatial
Slots. At 10 pins ranking is dead; at 5 it's half-decorative. Two is
~20% of the surface — enough for a genuine editorial statement, small
enough that the other 8 slots still reflect a working ranking engine.

**Enforced at write time, not silently discarded** — attempting a third
pin must be refused with a plain-Malay explanation naming the existing
pins, so the admin makes a real choice about what to unpin. Silently
accepting a pin that does nothing would be exactly the class of bug this
project has now hit three times.

## 5. Duration

**Recommendation: 24 hours default, 72 hours maximum.**

Shorter than the 7 days used for hide/reclassify, deliberately. Those
are corrections — they should live as long as the story does. A pin is
an *active intervention*, and news moves fast; a pin nobody revisits
becomes a stale front page. The existing `expires_at NOT NULL` column
already supports this — no schema change.

## 6. Audit

Same as every editorial action (Decision + Reason + Actor + Reversible),
with one addition: because pin overrides the system rather than
correcting it, `reason` should be held to a higher standard — "penting"
is not a reason; "arahan keselamatan awam, perlu dilihat semua pembaca"
is. Not machine-enforceable; stated as the norm and reinforced by the UI
placeholder when Pin is built.

## 7. Conflicts

Follows the locked precedence in
`docs/editorial-override-data-model-v1.md`, which already ranks
**hide > pin**:

| Conflict | Result | Why |
|---|---|---|
| Pin + hide | **Hidden.** | Restrictive beats permissive. Already true in `resolveStoryField()` and covered by a passing test. |
| Pin + reclassify | Pinned **in the new field.** | Reclassify decides *which* Bidang; pin decides *prominence within* it. They answer different questions and compose cleanly. |
| Pin + boost | Pinned; boost irrelevant. | Boost improves odds in a contest pin has already skipped. Harmless, but the UI should not offer both at once — it would imply a power that does nothing. |
| Pin + story expires | Pin dies with the story. | A pin cannot resurrect content outside the ranked queue; it only reorders what's already eligible. |

Encouragingly, three of these four already hold in shipped code — pin
governance is mostly about *limits*, not new precedence logic.

## 8. Deferred Decision: Replacement Preview

**Recorded, not implemented.** Per ChatGPT's addition to this design.

A pin is never simply "+1 story". It is always:

```
+1 pinned story
-1 slot that something else would have held
```

The Active Set has a fixed 10 slots, so pinning necessarily evicts
whatever would have occupied the last one. That cost is currently
invisible to the admin at the moment of deciding.

Possible future behaviour — before a pin is confirmed, show its effect:

> "Berita ini akan mengambil tempat slot yang kini diisi oleh X."

**Deferred because** it requires computing composition *after* the pin
is applied, not merely candidate ranking — a full re-run of the
selection pipeline in a speculative state, which the current
architecture doesn't expose. Not hard in principle, but not the small
addition it appears to be.

Open question that remains Izzat's to answer, not mine: whether a busy
admin actually wants this information at decision time, or whether it
becomes one more thing to read past. Flagged rather than assumed.

## What is explicitly NOT decided

- No implementation, no UI, no ranking change (per instruction)
- Whether pin needs its own surface, or belongs with Boost's deferred
  Editorial Desk
- Whether the 2-pin limit is per field or per edition if a future
  "semua bidang" view exists
