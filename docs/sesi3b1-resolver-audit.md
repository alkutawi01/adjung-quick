# Sesi 3B.1 — Edition Resolver Audit & Rule Gap Analysis

Status: audit only, per ChatGPT — no entity detection, no keywords, no
taxonomy changes. Run: `node classification/audit-edition-rule-gaps.mjs`,
284 live items.

## Naming correction (ChatGPT, 2026-08-12)

What `classification/edition-classification.mjs` currently does is an
**Edition Presentation Resolver** — label translation via the
Merge/Split/Rename/Hide table — not a full **Edition Editorial
Interpretation Layer**. These are two different tiers of capability:

| | Supports |
|---|---|
| ✅ v1 (built) | Label translation, merge/split/rename/hide, edition taxonomy mapping |
| ❌ Not yet built | Candidate re-ranking per edition, editorial interpretation, entity-aware resolution |

Recorded explicitly so future work doesn't assume the system is more
editorially sophisticated than it actually is.

## Gap catalog

**Gap 1 — Candidate conflicts: 9/284 (3%).** Already catalogued in
`sesi3a2-evidence-quality-audit.md` — re-confirms same magnitude on the
current (larger) corpus.

**Gap 2 — Foreign-subject cases: 33/284 (12%).** Stories where a subject
resolved successfully AND geography is not Malaysia. These are exactly the
theoretical "edition divergence" cases ChatGPT described — the system
correctly knows the subject, but an edition might reasonably want to display
something different (e.g. `ms-MY` showing `Dunia` instead of `Politik` for a
foreign political story) — no such rule exists yet, v1 shows the same field
for every edition regardless of geography.

| Subject | Foreign-geography count |
|---|---|
| Politics | 11 |
| Crime | 9 |
| Disaster | 4 |
| Environment | 4 |
| Business | 3 |
| Health | 1 |
| Lifestyle | 1 |

**Gap 3 — Weak subject candidates still winning: 64/284 (23%).** Candidates
below 0.5 confidence currently still resolve to a field rather than falling
through to geography. A rule could reasonably prefer geography fallback over
a weak subject signal here — not implemented, flagged as a design choice for
Sesi 3B.2, not decided in this audit.

## A second, distinct problem surfaced by the Gap 2 sample

Several Gap 2 examples double as evidence for the *already-known*
`content-rules.mjs` false-positive issue from `sesi3a2-evidence-quality-audit.md`
— not a new finding, but worth linking:

- *"Britain larang penggunaan cermin mata Meta di mahkamah"* (UK bans Meta
  smart glasses in court — a regulatory/technology story) → tagged `Crime`
  purely from "mahkamah" appearing once, in passing.
- *"Adakah Bashar akan terselamat kerana berada di Rusia?"* (Will Assad
  survive being in Russia? — a political/diplomatic analysis) → tagged
  `Crime`, same pattern.

These are two **different kinds of gap**, worth keeping separate:
1. **Gap 2 (this audit)** — the subject is *correctly* identified, but the
   edition display doesn't yet account for geography.
2. **The content-rule issue (already known)** — the subject itself is
   *wrong*, from an over-broad phrase match.

Fixing Gap 2 (an edition rule) would not fix the content-rule issue, and
vice versa — they need separate remedies, not one combined fix.

## What Sesi 3B.2 (Edition Rules) needs to handle, based on this evidence

Not designed here, per instruction — but the shape of the problem is now
concrete: 12% of the corpus has a plausible geography-conditional rule
candidate (`IF subject=Politics AND geography≠Malaysia AND edition=ms-MY
THEN Dunia` style), and 23% has a plausible confidence-threshold rule
candidate. Both are genuine "Edition Rules" work, not entity detection —
consistent with ChatGPT's point that entity detection should wait until a
rule specifically needs it, not be built speculatively first.

## Explicitly not done

- No Edition Rules implemented (Sesi 3B.2, not started).
- No entity detection (Tier 4).
- No content-rule narrowing (separate known gap, not touched).
- No migration, no benchmark redo.
