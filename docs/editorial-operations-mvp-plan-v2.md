# Editorial Operations MVP Plan v2 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] plan document. No UI, schema, or code written
here.** Supersedes `docs/editorial-operations-mvp-plan-v1.md` — not
because v1 was wrong, but because Izzat stated a constraint that
changes what "the real product" is:

> "saya nak sistem yg mudah diseleggara dan difahami oleh admin mcm
> saya, yg takde asas dlm programming, kewartawanan, dll. saya sibuk
> utk pantau kerja awak satu-satu."

Two distinct requirements follow from that, addressed separately below.

---

## Admin persona — stated explicitly, so nothing downstream assumes otherwise

**Izzat, the admin, is:**
- Not a programmer
- Not a trained journalist/editor
- Busy — cannot review every step of implementation work in detail

**Consequence**: any word, concept, or number surfaced to the admin must
be understandable **without** background in either software or
newsroom editorial practice. This rules out surfacing raw system
vocabulary (`confidence_score`, `evidence_tier`, `classification_method`,
`RTM category mismatch`) directly — those are true and precise, but
meaningless to the actual user.

---

## 1. Human-first language layer

**Principle**: every issue shown to the admin must answer three
questions in plain language, per ChatGPT:

1. **Apa yang berlaku?** (What happened?)
2. **Kenapa ia muncul?** (Why is this here?)
3. **Apa tindakan saya?** (What can I do about it?)

### Data model consequence

Internal reason codes and admin-facing explanations are **two different
fields**, never the same string reused:

```js
// Illustrative — not implemented here.
{
  reason_code: 'low_confidence',        // internal, for logs/debugging/developers
  display_reason: 'Sistem tidak pasti berita ini patut diletakkan di bidang mana.', // admin-facing
}
```

`reason_code` is never rendered to the admin. A lookup table maps each
internal code to its plain-language explanation — one new translation
entry per reason type, not a redesign of the underlying detection logic
(the observatory's low-confidence/mismatch/unclassified detection from
`docs/editorial-operations-mvp-plan-v1.md` §3 stays exactly as-is; only
its *presentation* changes).

### Example transformation (from ChatGPT, illustrative)

**Before (developer-facing, v1's implicit assumption):**
```
Review Queue
Story: Gempa bumi Sarawak
Reason: classification_confidence=0.42
```

**After (admin-facing, v2):**
```
Perlu Semakan
Gempa bumi Sarawak

Kenapa muncul: Sistem belum pasti bidang yang sesuai.
Cadangan sistem: Bencana

Tindakan:
[Terima]  [Letak bidang lain]  [Sembunyikan]
```

The underlying override write (`story_overrides`, per
`docs/editorial-override-data-model-v1.md`) is unchanged — `[Terima]`
confirms the system's own suggestion, `[Letak bidang lain]` writes a
`reclassify` override, `[Sembunyikan]` writes a `hide` override. Same
data model as v1; only the admin's path to producing that write changes.

## 2. Review Queue — redesigned around action, not diagnosis

v1 defined the Review Queue as a list of *reasons a story needs
attention* (developer framing). v2 reframes each entry around *what the
admin should do*:

| | v1 (diagnosis-first) | v2 (action-first) |
|---|---|---|
| Framing | "Why is this flagged?" | "What do you want to do?" |
| Language | System terms | Plain Malay, no jargon |
| Output | A fact | A decision, with a default suggestion |

Every Review Queue entry carries:
- The story (title, source — already human-readable)
- **Kenapa muncul** — one plain sentence, from the `display_reason` lookup
- **Cadangan sistem** — the system's own best guess, so the admin's
  default action is usually just "confirm", not "diagnose from scratch"
- **Tindakan** — the same 2-3 buttons every time (Terima / Letak bidang
  lain / Sembunyikan), consistent across every reason type so the admin
  never has to learn a new interaction per issue category

## 3. Admin Digest — new component, not in v1

Per ChatGPT: Izzat not monitoring step-by-step means the system itself
must proactively summarize, not wait to be asked. Every significant
system run (daily observation, classification run) should produce a
digest, not just a log.

**Before (system-facing, what exists today — `db/daily-observation.mjs`,
`db/classification-observatory.mjs` terminal output):**
```
CLASSIFICATION FUNNEL
RSS items: 917 → understood: 721 → classified: 814 → placed: 737
```

**After (admin-facing digest, illustrative):**
```
Laporan Hari Ini

917 berita diproses.

Perkara yang perlu perhatian:
• 3 berita tidak pasti bidang
• 1 sumber gagal diambil
• 2 berita perlu semakan editor

Tiada tindakan diperlukan: 912 berita.
```

**Design rule**: the digest leads with what needs attention, ends with
"nothing else needs you" — the admin should be able to read one screen
and know whether today requires any action at all. This directly serves
"saya sibuk" — the admin's default state should be *not reading detail*,
only escalating to detail when the digest says something needs it.

**Relationship to existing tooling**: `db/daily-observation.mjs` and
`db/classification-observatory.mjs` already compute everything the
digest needs (funnel counts, low-confidence/mismatch samples, source
health). The digest is a **presentation layer over data these scripts
already produce** — not a new detection system, matching the same
"reuse, don't rebuild" principle as the Review Queue.

---

## What stays unchanged from v1

- `editors` table (admin identity/access) — unaffected by this
  constraint, still needed regardless of UI language
- `story_overrides` / `source_overrides` schema
  (`docs/editorial-override-data-model-v1.md`) — the underlying write
  model is correct; only what triggers a write (plain-language UI
  instead of raw diagnosis) changes
- Precedence order, expiry rules, audit trail — all still apply exactly
  as designed
- Fasa 3.2's action list (hide/reclassify/boost/pin/source rules) — same
  actions, described in plain language at the UI layer

## What this document does NOT do

- Does not write the `reason_code` → `display_reason` translation table
  (a real but small piece of implementation-time work)
- Does not build the Review Queue or Admin Digest UI
- Does not change any schema, migration, or backend logic
- Does not decide exact digest frequency/delivery (daily? on-demand?
  email? in-app only?) — an implementation-time question

## Next

Per ChatGPT: review this plan before implementation begins. Once
confirmed, Fasa 3.1 build order becomes: `editors` table → override
tables → `reason_code`/`display_reason` translation layer → Review
Queue → Admin Digest — human-language surfaces last, after the data
model they depend on exists.
