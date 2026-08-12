# Universal Classification Model

Status: **Design in progress, locked sequencing.** Builds on
`docs/edition-taxonomy-model.md`. ChatGPT's ruling, 2026-08-12: build this
layer FIRST — not three parallel edition taxonomies compared for overlap
afterward, which risks producing an unmanageable "union taxonomy." Sequence:

```
Universal Subject Model  →  Edition Mapping Matrix  →  Edition Resolver  →  Wheel
```

Portal taxonomy is **presentation**. Universal classification is **ontology**.
Don't copy a portal's menu directly — `World` on CNN isn't a subject, it's
geography; `Middle East` on Al Jazeera is a region, not a subject either.

## Layer 1 — Universal Classification

Attached to the Story Cluster. Language-independent. Engine-facing only,
**never shown to the reader directly**. Two separate dimensions, deliberately
not merged:

### Subject (what the story is about) — 15, LOCKED

```
Politics
Crime
Economy
Business
Sports
Health
Education
Science
Technology
Environment
Disaster
Culture
Entertainment
Religion
Lifestyle
```

Not a union of all three editions' category names — genuinely smaller.
`ms-MY`'s `Hiburan`, `en`'s `Entertainment`, `ar`'s `فنون/ترفيه` are not three
different subjects; they're one subject (`Entertainment`) read through three
editorial lenses.

**Guiding principle (ChatGPT, 2026-08-12):** Universal Classification is not
about minimizing subject count — it's a set of concepts that stay *stable
across cultures and languages*. 15 is still small; a professional news portal
typically runs dozens of sections. Don't fear adding a subject that's
genuinely cross-cultural; do reject one that's really geography, a portal
section, or a ranking preference in disguise (see exclusions below).

**`Business` vs `Economy` — LOCKED, confidence 0.98.** This was flagged as a
possible ms-MY-only quirk from Izzat's Kanopi Residences ruling, but ChatGPT
confirmed it's a real cross-language distinction: English media split
Economy/Business/Markets; Arabic splits اقتصاد (macro) from أعمال/شركات
(business/company). Not local portal bias.

Boundary rule:

- **Business** — story has a specific economic actor: a company, CEO, product,
  corporate transaction, investment entity. *"Kanopi Residences capai 90%
  jualan"*, *"Petronas catat keuntungan RMX bilion"*, *"Tesla buka kilang
  baharu"*.
- **Economy** — story is about policy, market conditions, or national/global
  economic indicators. *"Kerajaan umum subsidi minyak baharu"*, *"Harga minyak
  dunia meningkat"*.
- Don't add `Markets`/`Finance` as a further split yet — that's an edition- or
  attribute-level nuance (e.g. "Bursa Malaysia naik selepas keputusan Fed" is
  Economy with a markets *attribute*, not a 16th subject) until real volume
  justifies it.

### Geography (where, or whose orbit the story sits in)

```
Malaysia
Southeast Asia
Middle East
Europe
Americas
World
```

This is the formalization of what were previously drafted as `Malaysia`/
`Dunia` **Bidang** in the ms-MY draft — under this model they were never real
subjects, they were geography wearing a Bidang costume. Confirmed by
`docs/classification-taxonomy-mapping.md`'s own Finding 2 ("newsroom desks are
geography+section, Adjung Bidang is subject" — the residual buckets were
always the geography half of that split, just not named as such yet).

A story can have **both**: `subject: Politics, geography: Malaysia` for
domestic party politics, `subject: Politics, geography: Middle East` for
Lebanon parliament news. Same subject, different geography — exactly the case
that caused most of the 49 boundary disputes when forced into one flat
taxonomy.

### Event / Attribute (cross-cutting tags, non-exclusive)

```
Conflict
Election
Diplomacy
Humanitarian
Research
Innovation
```

This absorbs the earlier "Konflik/Antarabangsa attribute" decision from the
Taxonomy Gap Round — a war story stays `subject: Politics`, tagged
`attribute: Conflict`, rather than needing its own subject. Entity (e.g.
"Wong Chen", "Petronas") remains an unscoped placeholder for a future pass —
not designed in v1, noted so schema doesn't foreclose it.

## Layer 2 — Edition Taxonomy Mapping

One universal subject maps to a different display term per edition. Table
format, not three separately-labelled lists — this is what keeps editions
comparable and stops accidental subject drift between them.

| Universal Subject | English | Arabic | ms-MY |
|---|---|---|---|
| Politics | Politics | سياسة | Politik |
| Crime | Crime | جريمة | Jenayah |
| Economy | Economy | اقتصاد | Ekonomi |
| Business | Business | أعمال | Bisnes |
| Sports | Sports | رياضة | Sukan |
| Health | Health | (TBD) | Kesihatan |
| Education | Education | (TBD) | Pendidikan |
| Science | Science | علوم | Sains |
| Technology | Technology | تكنولوجيا | Teknologi |
| Environment | Environment/Climate | (TBD) | Alam Sekitar |
| Disaster | Disaster | (TBD) | Bencana |
| Culture | Culture | ثقافة | Budaya |
| Entertainment | Entertainment | فنون/ترفيه | Hiburan |
| Religion | (TBD — may not exist as a section) | (TBD) | Agama (future candidate) |
| Lifestyle | Lifestyle | (TBD) | (not in ms-MY draft) |

Three-column format (not Universal→one-portal-category at a time) deliberately
so gaps are visible at a glance: which subjects have a direct edition
equivalent, which need merging, which don't exist in a given edition at all.

TBD cells need the same evidence-based treatment `ms-MY` got in
`classification-taxonomy-mapping.md`, run against the real 71-item English and
51-item Arabic slices of the 190-item corpus — not guessed. In progress, see
`docs/edition-mapping-matrix-en-ar.md`.

**Excluded from all layers — geography, section, or ranking preference in
disguise, not subjects:**
- `World` (CNN-style) — geography, not subject.
- `Middle East` (Al Jazeera-style) — region, not subject.
- `Semasa` (Malay portals' "current affairs" section) — pure recency, same
  reasoning that excluded `Unclassified`.
- `Utama` — prominence, already the Editorial Score's job.

## Layer 3 — Edition Preference (new concept, not just taxonomy)

ChatGPT's addition: an edition isn't only a category-name mapping, it's also a
**priority/ranking lens** and a **source lens**:

```
ms-MY:  Malaysia > Regional > World      (Malaysia-first)
en:     Global > Regional > Local        (Global-first)
ar:     Arab World > Middle East > Global (Arab-world-first)
```

So the Edition Resolver combines: Taxonomy Mapping + Ranking Preference +
Source Preference. Not designed in detail yet — flagged so schema/engine work
doesn't assume taxonomy mapping is the resolver's only job. Likely intersects
with Editorial Score (`lab/engine.js`) and `lab/control.js`, not just
classification — needs its own design pass, probably after Layer 1/2 are
locked.

## Resolver behaviour — LOCKED decisions

- **Read-time, not precomputed.** Category mapping is an editorial decision,
  not a fact about the story — if an editor moves `Politics` from top-level to
  `Semasa > Politik` tomorrow, old stories shouldn't need reclassification.
  Only Layer 1 (Universal Classification) is stored; Layer 2 resolves live.
  Revisit only if this becomes a real performance problem — at 191 items / 9
  sources / Active Set 10, it isn't one now.
- **`SWITCH_LANGUAGE` tries semantic mapping before resetting the Wheel.** If
  the reader is on `Politik` (ms-MY) and switches to English, the resolver
  looks up `Politik`'s universal subject (`Politics`) and finds `en`'s
  equivalent (`Politics`) — position is maintained. If no equivalent exists
  (e.g. `Agama` has no `en` edition counterpart), fall back to that edition's
  default, don't force a match.

## Consequence for the 15-Bidang ms-MY draft

Per ChatGPT: this will likely **reduce**, not grow, the Bidang count — several
things provisionally treated as Bidang were actually portal sections
(`Semasa`) or geography (`Malaysia`, `Dunia`) misfiled as subjects. Once Layer
1/2 are confirmed, audit `docs/quick-bidang-taxonomy.md`'s 15 against this
model rather than assuming they all survive as-is.

## Immediate next steps (per ChatGPT, in order)

1. Confirm this Universal Subject list (14 or 15 with `Business`) with
   ChatGPT.
2. Build the `en` and `ar` mapping matrices against real corpus evidence,
   filling the TBD cells above.
3. Re-audit the ms-MY 15-Bidang draft against the confirmed universal model —
   expect some entries to collapse into Geography or get excluded as
   sections.
4. Only then resume Round 2 (Subject Boundary, the 49 paused cases) — many
   should resolve automatically once geography stops competing with subject
   in a single flat list.

Explicitly NOT started yet, per ChatGPT: classifier rules, Edition Preference
detail design, schema changes.
