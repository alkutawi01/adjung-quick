# Phase 4 — Production Maturity Roadmap v1 (2026-08-14)

Status: `[x] Roadmap` `[ ] Approved` `[ ] Any sub-phase started` —
**documentation only, nothing implemented**

Per ChatGPT: Fasa 4 is **not** "Editorial Intelligence." The bottleneck
Fasa 3 exposed isn't ranking sophistication — it's whether the system
can run every day without a developer watching it. Four sub-phases, in
this order, none started.

## Why this order

Fasa 3 took as long as it did not because its scope was large, but
because of *where* the real bugs lived: UI→database, schema→permission,
expiry→read-path, state→reader, plan→actual code — boundary failures
between layers, the kind that only surface once real usage exists. That
pattern is the actual argument for this ordering: **visibility and
reliability come before more editorial power**, because more power
without either just produces more of the same class of failure, at
higher stakes (Pin already proved that — three real bugs found *while
building it*, before a single admin ever used it).

## 4.1 — Operational Visibility

**Goal**: the admin knows the state of the system without asking Claude
or reading the database directly.

**Problems this answers**, straight from
`docs/editorial-operations-mvp-final-closure-v1.md` §4:
- One real admin — no second reviewer on any decision
- No history/undo UI — `deactivateOverride()` exists, nothing calls it
- Overrides can expire silently — nothing notifies anyone
- No realtime Active Set updates — a decision applies on next fetch, not
  visibly, in an already-open session

**Work**:
- **Editorial Activity Log / History** — not "an audit query," a real
  admin-facing view. Natural extension of the Admin Digest's own
  language and data source (`fetchDigest()`'s "perubahan editorial hari
  ini" already computes most of this for *today*; History is the same
  shape over a longer window):
  > 3 berita dipindahkan · 1 berita disorok · 2 berita dinaikkan · 1 pin
  > tamat tempoh
- Surfaces `deactivateOverride()` for the first time — an admin can
  actually reverse a decision from the UI, not just via direct database
  access
- Expiry visibility — at minimum, upcoming/recent expiries appear
  somewhere the admin can see them before they lapse unnoticed

**Explicitly not this sub-phase**: no new detection logic (same rule the
Digest was built under) — reuses existing data, presents it differently.

## 4.2 — Content Pipeline Reliability

Ranked above Editorial Desk and ranking work deliberately — the closure
doc's other named risks are structural, not editorial:

- No reliable backups (Google Drive snapshots only)
- Ingestion is still a destructive full rebuild, not incremental
- No real restore rehearsal has been performed
- No source health monitoring beyond the CLI observation scripts

**Goal**: `RSS → Database → Classification → Reader` has no window where
a rebuild, a bad deploy, or a dead source silently breaks the pipeline
without anyone knowing.

**Work**:
- Incremental ingestion (replacing the destructive rebuild — the
  existing frozen/"jangan sentuh" boundary on this needs a real decision
  here, not another deferral)
- A retention policy for snapshots (currently ad hoc)
- An actual restore rehearsal — proving a backup restores, not just that
  it exists
- Source health monitoring promoted from CLI-only
  (`db/daily-observation.mjs`) to something the admin doesn't need a
  terminal to see

## 4.3 — Editorial Desk

**Only after 4.1 and 4.2.** The tools already exist — Pin, Boost, Review
Queue — but scattered: Pin and Boost both have working backends and
*no* admin surface, by earlier deliberate decision. Editorial Desk is
the single place that finally gathers them:

> Cari berita → Lihat status → Pin → Boost → Pindah bidang → Lihat kesan

**Explicit constraint, per ChatGPT**: do not build Pin's UI and Boost's
UI as two separate, unrelated features. If both ship before this
sub-phase, that's the exact "berselerak" (scattered) outcome Editorial
Desk exists to avoid — they belong in ONE surface, designed together,
not bolted on individually the moment each backend was ready.

## 4.4 — Ranking Expansion

**Last, deliberately.** `editorial_v1` activation for fields beyond
`ms-MY.Politik`, and any new Editorial Value Dimension (long-term
importance, etc.) belong here — once operations (4.1), the pipeline
(4.2), and the editorial toolset (4.3) are all mature enough that
expanding ranking doesn't mean expanding blast radius on top of
unfinished foundations.

## Dependencies between the four

```
4.1 Operational Visibility ──┐
                              ├──► 4.3 Editorial Desk ──► 4.4 Ranking Expansion
4.2 Pipeline Reliability ────┘
```

4.1 and 4.2 can run in parallel — they don't depend on each other. 4.3
depends on both (an Editorial Desk without visibility into what it's
doing, or built on an unreliable pipeline, repeats Fasa 3's own lesson).
4.4 depends on 4.3 existing as the real UI ranking decisions would need
to be made from.

## What is NOT done first — explicit, not implied

- No Pin UI or Boost UI shipped independently of Editorial Desk (4.3)
- No `editorial_v1` expansion to any field before 4.4
- No Source Override implementation — still waiting on story-level
  actions proving out at scale, per Fasa 3's own closure
- No new detection/scoring logic in 4.1 — presentation over existing
  data only
- No incremental-ingestion work starts inside 4.1 — it belongs to 4.2

## Next

Awaiting ChatGPT's review of this ordering before any sub-phase begins.
No implementation in this document.
