# Editorial Attention Model v1 (2026-08-15)

Status: `[x] Design` `[ ] Approved` — **no code, no UI, no picker**

FASA 4.3, per ChatGPT's instruction after `docs/editorial-intervention-model-v1.md`:
that document established Pin as the one genuinely necessary
proactive intervention, Hide/Reclassify as already-solved corrections,
and Boost as frozen (backend intact, UI deferred). It left one thing
unanswered, and per ChatGPT, this is "lebih penting daripada UI":
**how does the system decide what's worth interrupting Izzat for at
all?** This document answers that, and only that — not the picker,
not Pin's UI, not Digest's implementation.

## The question

> Bagaimana sistem memilih perkara yang layak mengganggu perhatian
> admin?

## The distinction that governs everything below

Per ChatGPT's explicit instruction, restated as the document's central
rule:

| | Contoh | Perlukan manusia? |
|---|---|---|
| **Informasi** | "43 berita belum pasti bidang" | Tidak semestinya — ini keadaan sistem yang normal dan self-resolving (low-confidence stories get reclassified or naturally age out; the Review Queue already exists to handle these reactively, at Izzat's own pace, not as an interrupt) |
| **Keputusan** | "1 berita penting belum diberi keutamaan" | Ya — ini memerlukan judgment yang sistem tidak boleh buat sendiri (exactly Pin's domain, per `docs/editorial-intervention-model-v1.md` §1) |

Today's Digest (`AdminDigest.jsx`) already computes a count
(`needsAttention`) but doesn't yet make this distinction — it reports
*information* ("4 berita belum pasti bidang") using the same visual
weight a real *decision* would need. This document's job is to design
the logic that tells those two apart, not to build the surface that
displays the result.

## Three models compared

### Model A — All Review Queue

Show every entry the Review Queue already surfaces (currently:
low-confidence classification, content mismatch) as "needing
attention," unfiltered.

| | |
|---|---|
| **Apa ini hari ini** | Digest's current `needsAttention` count is effectively this model already — it's the same signal `fetchReviewQueue` computes. |
| **Masalah** | Terlalu teknikal — "belum pasti bidang" is a classification-pipeline concept, not a decision Izzat needs to make. Bukan semua perlukan keputusan manusia — most of these resolve themselves (a story gets reclassified on the next ingest pass, or simply doesn't matter enough for anyone to ever look at it). Treating all of them as "attention-worthy" is exactly the Informasi/Keputusan conflation this document exists to fix. |

### Model B — Rule-based Attention

A short, explicit, hand-written list of conditions that genuinely
warrant a human look:

```
Perlu perhatian:
1. Berita dengan confidence sangat rendah
2. Konflik classification
3. Sumber gagal
4. Pin akan tamat?
5. Anomali pipeline
```

| | |
|---|---|
| **Kelebihan** | Mudah difahami — each rule is independently readable and auditable, no hidden weighting. Matches the "informasi vs keputusan" split cleanly: each rule can be written to answer "does this genuinely need a decision" rather than just "is this unusual." Extends signals the codebase already computes (Review Queue's confidence/mismatch signals, Pin's `expires_at`, source-health data implied by FASA 4.2's own ingestion monitoring) — no new signal-generation infrastructure needed. |
| **Risiko** | Boleh jadi panjang — as more rules get added over time, the list itself risks becoming a second undifferentiated pile, the same failure Model A has, just with an extra filtering step in front of it. Mitigation (not decided here, named for whoever implements this): cap the rule set deliberately small and require an explicit reason to add a new rule, rather than letting it grow by default. |

### Model C — Editorial Priority Score

Compute a weighted score per story (topic importance, freshness,
uncertainty, impact) and surface whatever crosses a threshold.

| | |
|---|---|
| **Kelebihan** | Lebih pintar — can in principle rank "how much this deserves attention" more precisely than a fixed rule list. |
| **Risiko, per ChatGPT's explicit framing** | **"Ini bahaya buat masa ini."** Mencipta ranking kedua untuk admin — Adjung Quick already has one ranking system (the reader-facing content ranking engine, `state/rankingFlags.js` / `editorial_v1`); building a second, separate scoring system just to decide what to show *Izzat* duplicates that complexity in a place with far less need for it, and reintroduces exactly the "confidence score," "impact," "uncertainty" vocabulary `docs/editorial-desk-admin-ux-simulation-v1.md` §3 already flagged as jargon risk for a non-journalist admin. A score is also inherently less auditable than a named rule — when Izzat asks "why did this show up," an explicit rule (§Model B) answers directly; a weighted score requires explaining a formula. |

## Recommendation

**Model B (Rule-based Attention), with the size discipline named in
its own risk row treated as a hard constraint, not a suggestion.**
Model C is explicitly rejected for this phase, per ChatGPT's own
"bahaya buat masa ini" — not ruled out forever, but not proposed here.
Model A is superseded — it's what the Digest does today, and this
document's whole purpose is replacing it with something that actually
distinguishes information from decisions.

## 1. Definition of "perlu perhatian"

A story or system state qualifies as needing Izzat's attention **only
if a human decision would change the outcome, and no existing
automatic process will resolve it on its own within a reasonable
window.** Concretely, this means:

- It is **not** enough that something is unusual (a low-confidence
  classification is unusual but usually self-resolves)
- It **is** enough that something is unusual *and* time-sensitive *and*
  no automated path already handles it (an important story that will
  never be pinned unless a human notices it *this week*, because next
  week it's no longer news)

This directly operationalizes the Informasi/Keputusan split: an
"informasi" item fails this test (automation will likely handle it,
or nothing meaningfully changes if it's never looked at); a
"keputusan" item passes it (only a human choice resolves it, and the
window to act matters).

## 2. Signal sources

Per Model B, each rule maps to a signal that already exists or is a
direct, small extension of one that does — no new signal-generation
system:

| Rule | Signal source | Status |
|---|---|---|
| Confidence sangat rendah | `fetchReviewQueue`'s existing classification-confidence signal | Exists today |
| Konflik classification | Review Queue's content-mismatch detection | Exists today |
| Sumber gagal | FASA 4.2's ingestion monitoring (source health, per the operational-visibility work already shipped in FASA 4.1) | Exists today, not yet wired into Digest specifically |
| Pin akan tamat | `story_overrides.expires_at` | Exists today (schema-level), not yet surfaced anywhere in UI |
| Anomali pipeline | FASA 4.2's own operational snapshots / observation tooling | Exists today, not yet wired into Digest specifically |

**No rule in this list requires inventing a new signal.** This is a
direct consequence of restricting to Model B — every condition is
something the system can already detect, the work is *filtering and
surfacing* it correctly, not computing something new.

## 3. What should be hidden from the admin entirely

Per the Informasi/Keputusan distinction, anything that fails §1's test
should not appear in the attention surface at all — not deprioritized,
not shown smaller, simply absent:

- Routine low-confidence classifications that the Review Queue already
  handles reactively (Izzat can still open Review Queue directly if he
  wants to browse these — this document doesn't remove that surface,
  it just stops treating its raw count as an attention-worthy number)
- Any story where no realistic human action would change the outcome
  (e.g. a low-importance story that's simply never going to be pinned,
  regardless of its classification state)
- Raw counts with no decision attached — "43 berita belum pasti
  bidang" is exactly the kind of number this model should stop
  surfacing as if it were urgent

## 4. What must be escalated to a human

Anything passing §1's test, expressed as the Model B rule list —
restated with the reasoning for why each one specifically requires
Izzat, not automation:

1. **Confidence sangat rendah, di atas ambang tertentu** — automation
   already tried and couldn't resolve it confidently; further
   automatic retries won't change that
2. **Konflik classification** — two signals disagree; only a human can
   break the tie with real-world knowledge the classifier doesn't have
3. **Sumber gagal** — an operational failure with no automatic self-heal
   (per FASA 4.2's own finding that ingestion failures need a human to
   notice, not an automatic retry-forever loop)
4. **Pin akan tamat** — time-boxed by design (`expires_at`), and
   whether to renew is inherently a judgment call, not something the
   system can decide for itself
5. **Anomali pipeline** — by definition an unexpected state; automation
   handling the expected case correctly says nothing about how to
   handle what it didn't expect

**Explicitly not on this list, named as a boundary**: "an important
story exists" is not itself an escalation trigger — the system has no
way to know a story is Pin-worthy without a human first judging it so.
This is why Pin is fundamentally different from the other four rules:
it can never be system-detected, only system-surfaced as a
*candidate* for Izzat's own judgment (the eventual "berita untuk
perhatian" list, deferred per ChatGPT's own framing to after this
document).

## 5. Relationship with the existing Digest

`AdminDigest.jsx` already has the right shape — `needsAttention`,
`actionsToday`, `noActionNeeded` — but its `needsAttention` count
currently mixes Model A's raw Review Queue count with genuine
decision-requiring signals. This document's consequence for the
Digest, **named as a direction for a future implementation, not
designed here**:

- `needsAttention` should be recomputed against this document's §1
  test (rule-based, Model B), not against the raw Review Queue count
- The Digest's ideal empty state, per
  `docs/editorial-desk-admin-ux-simulation-v1.md`'s Simulation 1,
  becomes achievable in the way that simulation described — most weeks
  will genuinely show "Tiada tindakan diperlukan," because most weeks
  won't produce any Model-B-qualifying event, not because the Digest
  is hiding real problems

This is not a redesign of `AdminDigest.jsx` — the component's shape
stays correct; only the *signal* feeding its count changes, per
whoever implements this next.

## What this document does NOT do

- No code, no component, no route
- Does not implement the rule list's exact thresholds (what counts as
  "sangat rendah" confidence, what window makes a Pin "akan tamat") —
  named as implementation-time decisions, not policy decisions this
  design document should fix
- Does not build the "berita untuk perhatian" / Pin-candidate list —
  per ChatGPT, that question (does Pin need a full picker, or just a
  short "berita yang layak dipertimbangkan" list) is answered only
  after this document, not by it
- Does not modify `AdminDigest.jsx` or any other shipped component

## Next

Awaiting review. Per ChatGPT: after this document, decide whether Pin
needs a full picker or just a short "berita yang layak
dipertimbangkan" list — the answer depends directly on how narrow this
document's attention rules turn out to be in practice.
