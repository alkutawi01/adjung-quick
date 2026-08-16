# Editorial Filter Rules — Design v1 (2026-08-16)

Status: `[x] Design` `[ ] Approved` — **no code, no schema, no production
change**. Per explicit instruction: audit first, report, stop for
approval before any implementation.

## Audit result (read-only, no code touched)

**Nothing matching this concept exists anywhere in the codebase.**
Confirmed via direct code/schema search, not assumption:

- No table (`filter_rules`, `excluded_keywords`, `editorial_filters`,
  or similar) exists in any `db/schema*.sql` file.
- The only related mechanism, `story_overrides` / `source_overrides`
  (`db/schema-editorial-state.sql:30-61`), is scoped to a single
  `story_id` or `source_id` — never a word/phrase. Its precedence
  resolver, `state/editorialStateResolver.mjs`, resolves conflicts
  between *per-story human decisions* (hide > pin > reclassify >
  classifier default) — a different problem from keyword conflicts,
  and explicitly, deliberately scoped away from the classifier already
  ("per ChatGPT's explicit instruction: jangan sentuh
  classifier/ranking algorithm").
- No admin UI screen accepts a keyword/phrase list anywhere in
  `ui/src/admin/`. All existing admin actions (`submitHideOverride`,
  `submitReclassifyOverride`, `submitPinOverride`) take a specific
  `storyId`, never free text.
- The classification pipeline (`classification/lib/content-rules.mjs`,
  `edition-rules.mjs`, `lab/classify.js`) contains **no** keyword-based
  include/exclude step — confirmed, so there is no existing scope
  violation to fix there, and nothing to accidentally duplicate.
- No test file references this concept or its example terms (`artis`,
  `penyanyi`, `bertaubat`, etc.).

This is a **greenfield feature** — a new build, not a correction of
partial work.

## What this document designs

A deterministic, keyword/phrase-based EDITORIAL filter, applied to a
story's canonical title/description — **separate from and blind to**
the classification pipeline (field/Bidang assignment). Classification
decides "what field does this story belong to"; this filter decides
"should this story be shown at all," and the two must never share
logic, per the locked instruction not to touch classification.

### 1. Data model

New table, additive only, same pattern as `story_overrides`:

```sql
CREATE TABLE editorial_filter_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type    TEXT NOT NULL CHECK (rule_type IN ('exclude', 'except')),
  phrase       TEXT NOT NULL,       -- case-insensitive substring/phrase match against canonical title+description
  reason       TEXT,                -- optional editorial note, not required (unlike story_overrides — this is a standing policy, not a one-off judgment call)
  created_by   UUID NOT NULL REFERENCES editors(user_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  active       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_editorial_filter_rules_active ON editorial_filter_rules (rule_type) WHERE active;
```

No `edition_id`, no `source_id`, no `field` scoping — global rules
only for V1, per explicit instruction not to add per-source/per-field
scope unless the codebase genuinely needs it (it doesn't today; nothing
currently reads filter rules at all).

No `expires_at` — unlike `story_overrides` (a one-off human judgment
about one story, which decays), a filter rule ("buang cerita tentang
artis") is a standing editorial policy, structurally closer to
`source_overrides` (never auto-expires) than to `story_overrides`.

### 2. Precedence

Full documented chain per the brief:

```
Explicit Keep > Exception > Exclude > Default
```

**V1 implements only three of these tiers** — decided by ChatGPT
2026-08-16: `Explicit Keep` is a reserved future slot, named in this
document so the chain has a place for it, but **no mechanism is built
for it in V1** — no schema column, no resolver branch, no UI. Building
it now would mean maintaining three mechanisms (Keep, Exception,
Exclude) for a use pattern (editing the keyword lists roughly weekly)
that doesn't need it yet.

V1's actual, implemented precedence, first match wins:

```
1. Exception  — any active 'except' phrase found in title/description
                 → story is KEPT regardless of any exclude match
2. Exclude    — any active 'exclude' phrase found in title/description
                 → story is DROPPED (reader) / MARKED (admin, see §3)
3. Default    — no rule matched → story is KEPT
```

Matching is case-insensitive substring match against the canonical
item's `title + ' ' + description`, mirroring the worked example
exactly:

- "Penyanyi terkenal lancar album baharu" → matches exclude
  `penyanyi`, no except match → **dropped**.
- "Penyanyi itu mengumumkan dirinya berhijrah" → matches exclude
  `penyanyi` AND except `berhijrah` → except wins → **kept**.

Pure function, deterministic, no scoring, no AI:

```js
// state/editorialFilterResolver.mjs (proposed name, mirrors editorialStateResolver.mjs)
export function resolveEditorialFilter(text, rules) {
  const lower = text.toLowerCase();
  const activeExcept = rules.filter(r => r.rule_type === 'except' && r.active);
  const activeExclude = rules.filter(r => r.rule_type === 'exclude' && r.active);
  if (activeExcept.some(r => lower.includes(r.phrase.toLowerCase()))) {
    return { keep: true, reason: 'exception' };
  }
  if (activeExclude.some(r => lower.includes(r.phrase.toLowerCase()))) {
    return { keep: false, reason: 'exclude' };
  }
  return { keep: true, reason: 'default' };
}
```

### 3. Where it applies

**Reader and admin behave differently — decided by ChatGPT 2026-08-16,
explicitly to avoid silent data loss from an audit/debugging
standpoint** ("admin nampak 466 berita → pembaca nampak 420 → admin tak
tahu 46 hilang kerana dasar editorial" — exactly the failure this
design must not create):

```
RSS → classification → Editorial Filter → Reader
                              │
                              ├── excluded story → NOT shown (reader)
                              └── kept story      → shown, resolveStoryField() runs as today

RSS → classification → Review Queue (admin)
                              │
                              └── excluded story → STILL VISIBLE, marked
                                  "Ditapis oleh kata kunci" — not hidden,
                                  not marked action_required, not
                                  re-added to the Active Set just
                                  because an admin viewed it
```

**Reader**: applied in `ui/src/adapter/productionAdapter.js`, at the
same per-story loop that already calls `resolveStoryField()` (line
~138) — a sibling check, not a replacement. Filter runs first (a
filtered-out story never needs field resolution); `resolveStoryField`
runs only for stories that survive the filter. No special reader UI
needed — excluded stories simply don't appear.

**Admin (Review Queue)**: the filter result is computed and attached
as a label on the existing Review Queue row (`reviewQueueAdapter.js`),
not used to remove the row. Purpose is audit visibility, not asking the
admin to resolve anything — the label is informational only, distinct
from `editorialAttentionAdapter.js`'s `action_required` items which
imply an admin should act.

A `hide` override (per-story, already existing) and an `exclude`
filter (keyword, new) both result in "not shown to reader" but via
entirely separate mechanisms — neither should call into the other.

Does not touch `classify-production.js`, `ingest-production.js`, or
any classification/ranking file, satisfying the explicit "jangan ubah
classification pipeline" instruction — the filter reads classification
output, never influences it.

### 4. Admin/UI surface

New admin screen (not yet designed pixel-by-pixel — scope for a
follow-up implementation pass, not this document), using plain
language per explicit instruction — **not** "override":

- **"Kata yang dibuang"** — the exclude list (add/remove phrases)
- **"Kecuali jika"** — the exception list (add/remove phrases)

Both lists editable independently; no priority/weight field, no
per-rule scoping UI, matching the "don't build a complex rule system"
instruction.

### 5. Test coverage (proposed, not built)

Mirroring `state/editorialStateResolver.test.mjs`'s shape:
`state/editorialFilterResolver.test.mjs` — pure-function tests against
`resolveEditorialFilter()`, covering: exclude-only match, except-only
match (no exclude present), both-match (except wins), neither match
(default keep), case-insensitivity, phrase-not-word-boundary behavior
(explicitly decide substring vs. word-boundary matching — the "penyanyi"
example works either way, but this should be a stated decision, not an
accident, before implementation).

## What this document does NOT do

- No code, no migration, no schema change, no admin UI built
- Does not touch `classify-production.js`, `ingest-production.js`, or
  any file under `classification/`
- Does not implement the "Explicit Keep" tier — named as a reserved
  precedence slot only, no mechanism proposed
- Does not decide substring-vs-word-boundary matching precisely — flagged
  as an open implementation decision for the next pass
- Does not decide per-edition scoping — assumes global-only for V1 per
  explicit instruction, revisit only if a real need appears

## Decisions confirmed by ChatGPT (2026-08-16)

- Reader vs. admin integration resolved — see §3 above (reader hides,
  admin marks-but-keeps-visible). No longer an open question.
- V1 precedence is `Exception > Exclude > Default` only —
  `Explicit Keep` stays a named, unbuilt reserved slot.
- `reason` stays optional, informational only, never part of match
  logic (already the case in §1's schema — confirmed correct, no
  change needed).
- Matching stays case-insensitive substring, `title + description`,
  no fuzzy matching, no AI, no scoring (already the case in §2 —
  confirmed correct, no change needed).

## Next

Design updated per the decisions above (schema shape, precedence
order, reader/admin integration split, terminology). Awaiting final
go-ahead before any code is written.
