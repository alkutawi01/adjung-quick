# Phase 3.5 — Taxonomy Audit (Bidang / Topik)

Status: audit document only, per ChatGPT (director) instruction — no code
renamed, no schema changed, no selector logic touched, no UI label
reintroduced. Researched by directly reading the real Adjung Brief
(`Adjung-Core`) codebase and its live `adjung.db`, not inferred from
memory or the illustrative (non-authoritative) reference screenshot Izzat
shared.

---

## 1. What Adjung officially means by "Bidang"

**A real, DB-backed, curated closed taxonomy — canonical for Adjung
Brief's own purposes.**

- Table: `CategoryRegistry` (Adjung Brief's SQLite `adjung.db`), managed
  by `Adjung-Core/core/category/CategoryRegistry.js`.
- `isActive = 1` rows form the closed list editors can assign; `isActive
  = 0` rows are archived/legacy, kept only for historical color
  continuity.
- **Current live values** (24 active Bidang, queried directly from the
  real database): Al-Quran dan Sunnah, Alam Sekitar, Angkasa, Bahasa,
  Bisnes, Budaya, Ekonomi, Falsafah, Geografi, Geopolitik, Malaysiana,
  Matematik, Pendidikan, Perubatan, Perundangan, Psikologi, Sains,
  Sastera, Sejarah, Seni Reka Bentuk, Sukan, Syariah, Teknologi, Utama.
- Admin console: `src/components/editorium/BidangConsole.tsx` (Editorium
  → Slot tab) — explicitly documented in Adjung Brief's own code comments
  as "the only home for Bidang now — don't resurrect a second copy
  anywhere."
- Each Bidang is locked **per slot** (of 38 frontpage bento slots), one
  Bidang per slot, enforced server-side — changing a slot's Bidang
  archives its content rather than recategorizing it retroactively.
- Full audit trail exists (`daftar-bidang`, `namakan-semula-bidang`,
  `gabung-bidang`, `arkib-bidang` actions logged in `core/audit/AuditLog.js`).

**Assessment: genuinely canonical, actively used in production — not
provisional.** But it is editor-curated and mutable (Izzat can
rename/merge/archive/add at any time through the UI), so it should be
treated as "the current live list, pulled at integration time," not a
value list to hard-copy once and freeze.

---

## 2. What Adjung officially means by "Topik"

**Real and implemented, but explicitly free-text — NOT a controlled
vocabulary, NOT a second enumerated taxonomy level.**

- Stored as a single generic attribute definition:
  `editorial_attributes` table has one row `('topik', 'Topik', 'text')`
  (`Adjung-Core/server.js` ~line 1727); actual per-content values live in
  `editorial_attribute_values`.
- Per-item (not per-slot), free-text, mandatory for new/edited content.
  Validated only for **length** (must fit the card's eyebrow display
  space) via `validateBidangTopik()` in
  `Adjung-Core/core/editorial/ContentBudget.js` (~lines 135-195) — not
  against any enum or whitelist.
- **No `Topik` table, no seed list, no Bidang→allowed-Topik mapping
  table exists in Adjung Brief.** An editor can type any Topik string for
  a given Bidang; the only enforced rule is that it must not contradict
  the slot's locked Bidang and must fit the character budget.
- Confirmed explicitly in `Adjung-Core/CLAUDE.md`, section "Bidang &
  Topik": *"Setiap slot terkunci kepada SATU Bidang tetap. Topik ialah
  medan bebas-had, per-kandungan, boleh berbeza-beza dalam slot yang sama
  asalkan masih dalam Bidang terkunci tu (cth: Bidang `Ekonomi` tetap,
  Topik `Kewangan`/`Perbankan`/dll). Warna Topik mewarisi warna Bidang
  induknya. Label kad: `Bidang | Topik`."*
- Also documented in the in-app "Perlembagaan" (constitution) console,
  section "03 — Bidang & Topik" — described there as the authoritative
  spec doc inside the running Adjung Brief app itself.

**Assessment: this is a real two-level system, but only the top level
(Bidang) is an actual taxonomy.** Topik is a UX/data-model *pattern*
(free-text label scoped under a locked Bidang, inheriting its color) —
not a reusable value list. Adjung Quick's earlier assumption of examples
like "Islam > Fiqh Munakahat" or "Sains > Biokimia" as pre-registered
Topik values does not match reality — no such registry exists anywhere
in Adjung Brief.

---

## 3. Does Adjung Brief already have a canonical Bidang taxonomy?

**Yes — see §1.** It is live, DB-backed, actively used, audited, and has
dedicated admin tooling. This is the strongest finding of this audit:
Adjung Quick does not need to invent or guess a Bidang list — one already
exists and is maintained by Izzat as Chief Editor.

---

## 4. Should Quick eventually consume Adjung Brief's taxonomy rather than invent its own?

**[PROPOSAL, not decided here]** The audit's finding makes this the
obvious direction — Adjung Brief already has a real REST API surface
(`Adjung-Core/core/routes/categoryRoutes.js`, e.g. `GET
/api/system/categories/active`) that returns the live curated list. This
is presented as a strong candidate, not a locked decision, because:

- It requires cross-project integration (Adjung Quick and Adjung Brief
  are confirmed separate repos/stacks/hosting, per
  `project_adjung_two_separate_projects` — this is a new kind of
  dependency between them that doesn't exist today).
- It raises questions this audit doesn't answer: does Quick call that API
  live, or sync/cache the list periodically? What happens if Adjung
  Brief's list changes while Quick has already ingested/scored stories
  under the old list? Does this reintroduce a dependency Quick's
  architecture has otherwise avoided (Quick's whole design has been
  "fully anonymous, self-contained, cost-minimized" — calling out to
  another product's API is a new category of dependency worth deciding
  deliberately, not backing into).
- **This document does not recommend against it** — reusing a real,
  actively-maintained editorial taxonomy is clearly better than Quick
  inventing a second, competing one. It flags the decision for Izzat, per
  ChatGPT's instruction not to resolve OPEN points here.

---

## 5. Is the current engine's `topic` field semantically misnamed?

**Yes — confirmed.** `lab/classify.js`'s output values (`Politics`,
`Economy`, `Sports`, `Health`, `Science`, `World`, `Unclassified` — a
generic English news-classifier category set) do not match Adjung
Brief's real Bidang list (§1) at all — different names, different
language, different granularity, and no overlap beyond loose
conceptual similarity (e.g. `Sports`≈`Sukan`, `Science`≈`Sains`).

`cluster.topic` (the field name used throughout `lab/engine.js`,
`state/reducer.js`'s `existingTopics`/`fillSlots` diversity logic, and
the Supabase `story_clusters.topic` column) is currently:
- **Not** Adjung's real Bidang (wrong taxonomy, wrong values).
- **Not** Adjung's real Topik either (Topik isn't a fixed enum at all —
  it's free text under a Bidang; `classify.js`'s output has no Bidang
  parent to sit under).
- Its own **third, ad-hoc thing**: a generic RSS-classification category
  set built independently for Quick's dedup/diversity engine, never
  intended to map onto Adjung's editorial taxonomy, and never validated
  against it.

**[OPEN, per ChatGPT — not resolved here]** Whether this field should
eventually be renamed (e.g. to something that doesn't borrow either
`Bidang` or `Topik`'s name, avoiding the confusion this audit surfaced),
or whether its *values* should eventually be remapped to draw from
Adjung Brief's real Bidang list (§4), or both, or neither (keep it purely
as Quick's own internal engine-diversity signal, never reader-facing) —
this is a product/architecture decision for Izzat, not decided here.

---

## 6. About the illustrative screenshot Izzat shared

Per Izzat's own clarification ("tak, ni cuma bayangan. bukan mockup
sebenar" — "no, this is just an impression, not a real mockup"): treated
here strictly as **non-authoritative visual reference**, not as evidence
of a specification. Its labels (Teknologi, Sukan, Nasional, Pendidikan,
Sains, Sejarah, Global) partially overlap with Adjung Brief's real active
Bidang list (§1) — Teknologi, Sains, Sejarah, Sukan, Pendidikan all
genuinely exist as active Bidang — but also include values that do NOT
appear in the current active list (Nasional, Global) and are missing many
that do (Al-Quran dan Sunnah, Ekonomi, Syariah, Utama, etc.). This is
consistent with it being a rough illustrative impression rather than a
verified pull from the real system — worth noting as mild corroborating
evidence that Bidang-like concepts were in the right direction, but not
strong enough to treat as confirming anything specific.

---

## Summary — everything OPEN/PROPOSAL for Izzat

1. **[PROPOSAL]** Should Quick eventually consume Adjung Brief's real
   Bidang taxonomy via its API, rather than maintain its own category
   set? (§4)
2. **[OPEN]** If yes to #1 — live API call vs periodic sync/cache, and
   how to handle the taxonomy changing after stories are already
   ingested/scored under an older version.
3. **[OPEN]** Should `cluster.topic` (the current internal field name) be
   renamed to avoid colliding with either "Bidang" or "Topik" — given
   it's confirmed to be neither? (§5)
4. **[OPEN]** Should `cluster.topic`'s *values* eventually be remapped to
   Adjung Brief's real Bidang list, independent of the naming question?
5. **[OPEN]** Does Quick need a Topik-equivalent concept at all, given
   Adjung Brief's own Topik is unconstrained free text, not a reusable
   taxonomy Quick could adopt?

Nothing here is locked. Per ChatGPT's instruction, this document produces
findings and options only — no code, schema, or UI change, and no
decision made on Quick's behalf.
