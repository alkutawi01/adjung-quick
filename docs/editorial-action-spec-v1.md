# Editorial Action Spec v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] spec. No action handler or UI built here.**
Fasa 3.4. Locks *when* each editorial action applies and *who* can use
it — the actions themselves (hide/reclassify/boost/pin/source rules)
were already fully designed in
`docs/editorial-override-data-model-v1.md`; this spec is the
operational rulebook for using them, in admin-facing terms.

## The five actions — when, who, what gets written

| Action | When an admin should use it | Who | Writes |
|---|---|---|---|
| **Sembunyikan** (hide) | Story is wrong/irrelevant/should never have appeared | `editor`+ | `story_overrides`, `override_type: 'hide'` |
| **Ubah bidang** (reclassify) | Story is real news, just in the wrong Bidang | `editor`+ | `story_overrides`, `override_type: 'reclassify'` |
| **Tonjolkan** (boost) | Story deserves more prominence than its score gives it, but shouldn't override the ranking entirely | `editor`+ | `story_overrides`, `override_type: 'boost'` |
| **Sematkan** (pin) | Genuine emergency/major announcement — must be at the front regardless of score | `admin` only | `story_overrides`, `override_type: 'pin'` |
| **Abaikan kategori sumber** (source: ignore category) | A source's self-declared category keeps misfiring (the RTM pattern) | `admin` only | `source_overrides`, `override_type: 'ignore_category'` |

**Pin restricted to `admin`, not `editor`** — new in this spec, not
previously decided. Reasoning: pin bypasses ranking entirely
(`docs/ranking-engine-contract-v1.md`'s amendment — `Active Set =
Pinned + Ranked selection`), the single most powerful, most
consequential action available. Source overrides are similarly
restricted — they affect every story from a source, every edition, not
one story.

## Admin-facing framing (per the v2 plan's language layer)

Buttons never say the internal action name — they say what happens, in
the same plain style as the Review Queue:

```
Sembunyikan berita ini
Pindah ke bidang lain
Tonjolkan berita ini
Sematkan di atas (kecemasan sahaja)
```

"Sematkan" specifically carries a visible warning in its own confirm
step — *"Ini akan meletakkan berita ini di kedudukan pertama, mengatasi
susunan biasa. Guna hanya untuk kecemasan atau pengumuman penting."* —
matching the schema's own mandatory `expires_at` and `reason`
requirements with an equally serious UI moment, not a casual button.

## Confirmation and reversal

- Every action requires `reason` before submitting (schema-enforced,
  per `docs/editorial-state-implementation-spec-v1.md`)
- Every action is reversible — "Batalkan" (undo) sets `active = false`
  / `status = 'retired'`, never deletes the row (§2 of the state spec)
- **No action is truly instant/silent** — each writes an audit-visible
  row by construction; there is no "quiet" editorial action in this
  design

## What this spec does NOT do

- Does not re-derive the override data model — fully inherited from
  `docs/editorial-override-data-model-v1.md`
- Does not build any action button, confirm dialog, or handler
- Does not implement role-checking logic (depends on
  `docs/admin-auth-spec-v1.md`'s `editors` table existing)
- Does not decide exact undo UI placement — an implementation detail
