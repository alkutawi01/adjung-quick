# Backend Control Plane — Phase 3: Admin Classification Rules V1 (Read-Only) Design

Status: DESIGN ONLY. No UI code in this document, per ChatGPT's explicit
"Jangan bina UI lagi." Answers every question in the GO brief. Builds on
`classification-rules-implementation-plan-v1.md` (schema/RPC, already
live in production) and `classification-rules-resolver.mjs` (classifier
integration, already live in code).

## 1. Location in `/admin`

A new top-level Admin section, sibling to the existing Editorial
Filter Rules / Review Queue / Activity Timeline sections in
`AdminApp.jsx` — not nested inside an existing screen, since
Classification Rules answer a distinct question ("what determined this
Kategori?") from what any current section covers. Named **"Peraturan
Klasifikasi"** in the nav, matching the "Kategori" terminology Izzat
already locked for Taxonomy in Phase 2 (not "Classification Rules"
verbatim — this project's Admin UI is consistently Malay-labelled).

## 2. Rule list — what's shown, per row

One row per `classification_rules` row (all statuses, filterable — see
§3), reusing `EditorialActivityTimeline.jsx`'s list-item shape (a plain
`<ul>`/`<li>` list with a loading/error/empty state trio, not a data-grid
component — per ChatGPT's "jangan bina generic table/grid framework
baharu"):

- **Jenis** (rule_type): "Sumber" / "URL" / "Kata kunci" — Malay labels
  for source/url/keyword, matching every other Admin-facing string.
- **Pattern**: the raw `pattern` value. For a `source` rule, resolved
  additionally to the source's display `name` (a join against `sources`,
  read-only, purely for readability — e.g. "rss-rtm-hiburan (RTM
  Hiburan)") so Admin isn't staring at a bare source_id.
- **Target Kategori**: for an edition-specific rule, the resolved
  `label` (via `field_code` → `taxonomy_fields`, same join Phase 2's
  Admin already does elsewhere) — e.g. "Hiburan". For a global rule, the
  raw `subject_code` value with a "(global)" marker — e.g. "Entertainment
  (global — semua edisi)" — since a global rule has no single label until
  resolved per-edition at classification time (Design V1 §4b); showing
  one edition's resolution would misleadingly imply the rule is scoped
  there.
- **Skop**: "Global" or the specific edition label (ms-MY/en-global/
  ar-global — reusing `EDITION_META`'s existing display labels from
  `state/editions.js`, not a new naming scheme).
- **Priority**: the raw integer, plain.
- **Status**: "Aktif" or "Diarkibkan" (Diarkibkan rows shown greyed/dimmed
  in the list, same visual treatment `FilterRulesManager.jsx`'s
  `filter-rules__row--inactive` class already gives inactive filter
  rules — reused class-naming convention, not a new visual language).
- **Dicipta oleh / bila**: `created_by` + formatted `created_at` (reusing
  `EditorialActivityTimeline.jsx`'s `formatTimestamp()` helper verbatim).

## 3. Filters

Four independent filters, combinable, client-side over the already-fetched
list (no new query complexity — `classification_rules` is small by
construction, V1 has no bulk-seed per the withdrawn migration, so
client-side filtering over a full fetch is appropriate, not a premature
optimization concern):

- **Jenis**: Sumber / URL / Kata kunci / Semua
- **Status**: Aktif / Diarkibkan / Semua (default: Aktif, since that's
  what Admin usually cares about — Diarkibkan rows are there for the
  "why did this OLD story get this Kategori" lookup, §5, not day-to-day
  browsing)
- **Skop**: Global / per-edition / Semua
- **Kategori**: a dropdown of target Kategori (both edition-specific
  labels and global subject values), filters to rules targeting that
  Kategori — answers "which rules affect Hiburan?"

## 4. Empty state (`classification_rules` = 0 rows)

Not an error, not a loading-forever state — an honest, positive empty
state matching `FilterRulesManager.jsx`'s `emptyLabel` pattern and
`EditorialActivityTimeline.jsx`'s "Tiada aktiviti editorial direkod lagi."
wording style:

> "Tiada Peraturan Klasifikasi lagi. Klasifikasi berita masih ditentukan
> sepenuhnya oleh sistem automatik."

This is V1's actual production state today (per the implementation plan's
explicit "ships empty" decision) — the empty state is not a hypothetical
edge case to handle, it's what every Admin sees on day one.

## 5. Per-story provenance display — "kenapa berita ini masuk kategori ini?"

Wherever a story's Kategori is already shown in Admin (Review Queue card,
Editorial Activity Timeline entries, or a future dedicated story-detail
view — this design doesn't require adding a NEW screen, only a new
expandable/inline block wherever `classification_method`/
`classification_rule` are already fetched alongside a story), render one
of two shapes:

**When `classification_method = 'admin_rule'`** (a Classification Rule
decided):
```
Kategori: Jenayah
Ditentukan oleh: Peraturan Admin
  Jenis: URL
  Pattern: /jenayah/
  Priority: 80
  Rule ID: <uuid>
  Status: Aktif
```
If the referenced rule's current `status = 'archived'`, the last line
reads **"Status: Diarkibkan"** instead — the historical fact stays
correct and visible (per Implementation Plan §8a's provenance-survives-
archival guarantee), never silently reverting to "no rule" just because
the rule was later archived.

**When `classification_method` is anything else** (the pre-existing
classifier decided — `edition_rule` / `default_mapping` /
`geography_fallback` / `low_confidence_fallback` / `none`):
```
Kategori: Jenayah
Ditentukan oleh: Classifier
  Method: url_path
```
Where "Method" is a short, human-readable translation of
`classification_method`/the existing `classification_rule` free-text
field already stored today (e.g. `edition-classification.mjs` currently
writes strings like `"story_understanding.subject:Crime -> ms-MY.Jenayah"`
for `default_mapping` — V1 shows a simplified label derived from
`classification_method` alone: "Peraturan Edisi" for `edition_rule`,
"Pemetaan Lalai" for `default_mapping", "Fallback Geografi" for
`geography_fallback`/`low_confidence_fallback`, "Tiada" for `none`/
`unclassified` — not the raw internal string, which is debug-oriented
phrasing not meant for an Admin-facing screen).

This two-shape rendering is the ONLY new display logic this design adds —
everything else (the rules list itself) is a straightforward read view
over `classification_rules`.

## 6. What V1 explicitly does NOT have

No Tambah/Edit/Arkibkan buttons anywhere in this screen — every row is
inert. The backend RPCs (`add_classification_rule`,
`archive_classification_rule`, `restore_classification_rule`) exist and
are live in production, but V1's Admin surface never calls them; a
non-technical Admin who wants a new rule created still asks for it via
the same request channel used today (this doesn't change until V2). This
mirrors Phase 2's own V1-read/V2-edit split for Taxonomy exactly — same
precedent, not a new pattern invented for this phase.

## Explicitly out of scope (carried forward)

Attention Rules, Pin automation, generic rule engine, ranking/scoring, any
Add/Edit/Archive control surface (V2), a new generic table/grid
component, and `edition-rules.mjs`'s `foreign_politics_to_world` display
(not part of `classification_rules`, out of this table's scope entirely
— see the implementation plan §"Explicitly out of scope").
