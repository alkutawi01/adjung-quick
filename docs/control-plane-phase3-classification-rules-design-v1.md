# Backend Control Plane — Phase 3: Classification Rules Design V1

Status: DESIGN ONLY. No schema, SQL, or code in this document. Builds on
`docs/control-plane-phase3-classification-rules-audit-v1.md` (the audit of
what exists today). Answers ChatGPT's design questions in order.

## 1. What counts as a Classification Rule

A Classification Rule is an **explicit, admin-authored fact**: "this
specific pattern always means this Kategori." It is not a probability, not
a signal to be combined with others — if it matches, it wins outright.

This is deliberately different from everything in the audit doc. Every
existing evidence tier (desk-vocabulary, content-rules, bernama-prefix,
confidence-policy) is a **linguistic/structural heuristic** — general-purpose
pattern recognition that applies the same way to any story, tuned by
engineers reading evidence, not an editorial decision about one specific
source or URL. A Classification Rule is the opposite: a human (Admin)
looking at one concrete case and saying "no, THIS is always Jenayah,"
the same kind of judgment call that created `lab/sources.js`'s
`knownCategory` field or `edition-rules.mjs`'s single rule.

Only 3 rule shapes exist in V1 — no generic condition/action table:

| Type | Matches on | Example |
|---|---|---|
| **Source rule** | `source_id` (the whole feed) | RTM's Hiburan feed → always Hiburan |
| **URL rule** | a URL path pattern | `/jenayah/` → Jenayah |
| **Keyword rule** | a phrase in title/description | "rasuah" → Jenayah |

This mirrors exactly the 3 evidence tiers that are genuinely about *where
the story came from or what it says*, and deliberately excludes anything
that would require a generic expression language (no AND/OR trees, no
regex builder, no arbitrary field conditions). If a future need doesn't fit
one of these 3 shapes, it is out of scope for V1 — raise it as a new
decision, don't bend this table to fit it.

## 2. What stays as classifier mechanism in code

Everything in the audit doc stays exactly where it is:

- `desk-vocabulary.mjs` (SUBJECT_VOCABULARY, GEOGRAPHY_VOCABULARY, STRUCTURAL_NOISE)
- `content-rules.mjs` (PHRASE_RULES)
- `bernama-prefix.mjs`
- `confidence-policy.mjs`
- `story-understanding.mjs`'s tier aggregation logic
- `edition-rules.mjs`'s `foreign_politics_to_world` (see §12 — not a
  Classification Rule, stays separate, out of scope for this phase)

None of this is "editorial decision about one source/URL/phrase" — it's the
general-purpose signal-detection machinery every story passes through
regardless of which admin rules exist. Per ChatGPT's explicit instruction:
we only pull out of code the decisions that are genuinely supposed to be
under human editorial control, not the whole classifier just because Admin
wants control over *something*.

## 3. Minimum rule structure

One row = one rule. Every rule has exactly these fields, regardless of type
(type-specific fields are simply null for the types that don't use them):

- `rule_type`: `source` | `url` | `keyword`
- `edition_id`: **NOT NULL for an edition-specific rule, NULL for a global
  rule** — see §3a/§3b below for what each case actually targets. This is
  the field ChatGPT's revision request centers on; the naive nullable design
  from the first draft didn't work because `field_code` isn't globally
  unique or even globally meaningful (see §3a).
- `pattern`: the source_id / URL substring / keyword phrase, depending on
  type — see §3c for `source` rules specifically.
- `field_code`: the target Kategori — **only set when `edition_id` is set**
  (§3a). Null for global rules.
- `subject_code`: the target Universal Subject — **only set when
  `edition_id` is NULL** (§3b). Null for edition-specific rules.
- `priority`: integer, admin-set, used only to break ties between two
  rules of the SAME type (see §5) — not a cross-type priority number
- `status`: `active` | `archived` (same posture as `taxonomy_fields` — no
  hard delete, matches the whole Control Plane's convention so far)
- `created_at` / `updated_at`, `created_by` (which admin — for the "why did
  this story get this Kategori" explainability Admin needs)

Enforced invariant (a CHECK constraint at implementation time, not
described further here since this doc has no SQL): exactly one of
`(edition_id IS NOT NULL AND field_code IS NOT NULL AND subject_code IS NULL)`
or `(edition_id IS NULL AND subject_code IS NOT NULL AND field_code IS NULL)`
must hold — never both, never neither.

Nothing else. No `conditions_json`, no `operator`, no generic expression —
the type IS the shape of the match.

## 4. How a rule produces a field_code

### 4a. Edition-specific rule → field_code directly, via a real composite FK

`field_code` is **not** globally unique — Phase 2 made it unique only
*per edition* (`UNIQUE(edition_id, field_code)` on `taxonomy_fields`), and
different editions don't share field_code strings for the "same" Kategori
(ms-MY's Business+Economy merge is `field_code = 'bisnes'`, en-global's
equivalent is `field_code = 'business'` — different strings, per
`taxonomy-registry.mjs`'s existing per-edition tables). So a rule that
targets one specific edition can and must FK straight into that pair:

```
FOREIGN KEY (edition_id, field_code) REFERENCES taxonomy_fields (edition_id, field_code)
```

This reuses the exact natural key Phase 2 already established — no new
UUID, no new identity concept, per ChatGPT's explicit instruction. This is
the *only* case where `field_code` is set on a rule, and it's an exact,
unambiguous FK: "this rule points at precisely this row of
`taxonomy_fields`."

### 4b. Global rule → Universal Subject, resolved per-edition at classification time (not stored as a field_code)

A genuinely global rule (`edition_id IS NULL`) cannot target one
`field_code`, because no single field_code string is valid across all three
editions. Rather than invent a translation table (a new concept) or force
every "global" rule to actually be three duplicate rows (defeats the point
of "global"), a global rule stores a **Universal Subject** value instead —
the exact same domain already used by `taxonomy_fields.subject_codes`
(Phase 2) and by `desk-vocabulary.mjs`/`story-understanding.mjs` today
(Politics, Crime, Economy, Business, Sports, ...). At classification time,
the resolver converts subject → field_code for the CURRENT edition using
the identical subject→field_code lookup `edition-taxonomy.mjs`'s
`resolveDefaultPlacement()` already does for the existing classifier — no
new lookup mechanism, reuses what's already proven and running.

This means: an edition-specific rule is exact (points at one taxonomy row);
a global rule is one level more abstract (points at a Subject, resolved
per-edition through existing, already-trusted machinery) — but *neither*
is a probability or a candidate. Both are still direct, deterministic
assignments once resolved; only the resolution step differs by scope.

### 4c. Source Rule pattern = stable `source_id`, not a name or URL

Per ChatGPT's explicit correction: `sources.id` (e.g. `'rss-kosmo'`, TEXT
PRIMARY KEY on the production `sources` table since before Phase 1, and
Phase 1's own Source Registry stable identifier) is what `pattern` stores
for a `rule_type = 'source'` row — never the source's display `name`
(which Admin can already rename) and never a feed URL. A single shared
`pattern` TEXT column can't carry a real FK constraint that only applies
conditionally on `rule_type`, so referential integrity for this case is
enforced at the write layer (the future add/edit RPC validates
`pattern` exists in `sources` before insert, matching this project's
existing convention of validating inside the RPC rather than only via DB
constraints — same pattern `merge_taxonomy_fields()` already uses). If a
source is later renamed, the rule is unaffected — `id` never changes,
only `name` does, exactly why ChatGPT flagged this.

URL rules and keyword rules keep `pattern` as plain text (a path substring
or a phrase) — no stable-identifier concern for those two, since URLs and
keywords aren't Phase 1/2 first-class entities with their own identity.

## 5. Precedence and conflict resolution (the big question)

Two separate conflict questions exist, and they need two separate answers.

### 5a. Two rules of the SAME type both match

Example from ChatGPT's brief: keyword "artis" → Hiburan AND keyword
"didakwa" → Jenayah, both present in "Artis X didakwa atas kes rasuah."

Resolution, in order:
1. **Higher `priority` number wins.** Admin sets this explicitly per rule
   — this is the only lever Admin has to say "if these two ever collide, I
   want THIS one to win." Simple, visible, no magic.
2. **If priority ties**: the more specific pattern wins — longer keyword
   phrase, or longer URL path. ("kes rasuah" beats "artis" if both were
   phrases; `/jenayah/mahkamah/` beats `/jenayah/` if both matched.) This
   mirrors ordinary intuition without needing Admin to pre-empt every
   possible collision by hand.
3. **If still tied**: reject the match — story falls through to §5b
   (existing classifier) rather than picking arbitrarily. A silent
   coin-flip is worse than falling back to what already exists today.

This needs to be genuinely rare in practice — V1's job is to let Admin see
and manage the table, not to become a conflict-resolution puzzle. If
real-world rule sets start colliding often, that is itself a signal V1's
rule count/quality needs review, not that the tie-break logic needs to get
smarter.

### 5b. A Classification Rule vs. the existing classifier

**A matching Classification Rule wins outright and skips the rest of the
pipeline entirely** — no edition rules, no confidence gate, no default
placement. If nothing matches, the story falls through to exactly today's
pipeline, unchanged (audit doc §"The resolver", steps 1–4).

Why this order, not ChatGPT's example order literally
(`Explicit → Source → URL → Keyword → existing classifier → Unclassified`):
that list is really "Classification Rules (any of the 3 types, in §5a
order) as ONE combined first step, then fall through to today's pipeline
as one combined last step" — I've collapsed it to two stages because
introducing Source/URL/Keyword as three SEPARATE precedence rungs above
the classifier (rather than one rung with internal tie-breaking) would mean
a low-priority Source rule always beats a high-priority Keyword rule no
matter what Admin sets — which contradicts giving Admin a real priority
lever in §5a. Two stages, with `priority` doing the real work inside stage
one, is simpler and matches "Admin can see why this happened" better: the
answer is always either "rule X fired" or "classifier decided," never a
three-way tier explanation.

Concretely, this means a Classification Rule **bypasses even
`edition-rules.mjs`'s `foreign_politics_to_world`** when both would apply
to the same story. This is intentional: an explicit admin fact ("this
source is always Jenayah") is a stronger signal than an automatic
heuristic ("Politics stories about non-Malaysia usually belong in Dunia").
If this turns out to be wrong in practice for a real story, that itself is
evidence the specific rule was too broad — fixable by narrowing the rule,
not by re-ordering the whole precedence model.

## 6. Scope: global vs. edition-specific

`edition_id` nullable on every rule (mechanism detailed in §4a/§4b — this
section covers *when* to use which, not *how* the target field resolves):
- **Global** (`edition_id = null`, targets a `subject_code`, §4b): a
  Source rule for RTM's Hiburan feed almost certainly should apply to
  whichever editions read that source at all — most Source/URL rules will
  be global.
- **Edition-specific** (`edition_id` set, targets a `field_code`, §4a):
  matches `edition-rules.mjs`'s existing pattern
  (`foreign_politics_to_world` is ms-MY only) — needed for cases where the
  SAME pattern should mean something different per edition, or should only
  apply in one. Keyword rules are the most likely to need this (an
  Arabic-language keyword rule is meaningless for en-global).

Resolution order when a global and an edition-specific rule of the same
type both match the same story: **edition-specific wins** (more specific
scope beats less specific scope) — this is the same "specificity wins"
principle as §5a's pattern-length tiebreak, applied one level up.

## 7. Active / inactive

`status: active | archived`. Matches Phase 2's `taxonomy_fields` convention
exactly (no hard delete, ever — an archived rule stops matching but its
history/audit trail survives). An archived rule is invisible to the
resolver but still visible to Admin (with an "archived" badge) — same
posture as archived Kategori.

## 8. What Admin can see in V1

Read-only list view of all rules (per the "Admin boleh melihat peraturan"
requirement from the kickoff): type, pattern, target Kategori, edition
scope, priority, status, created_by/created_at. Plus, critically, **per
classified story: which rule (if any) decided its Kategori** — this is the
explainability gap the audit doc identified as currently completely
missing (disagreeing candidates discarded silently today).

### 8a. Provenance survives rule archival — reusing existing columns, no new history system

Per ChatGPT's correction: explainability must reflect the rule that fired
**at classification time**, not a live re-evaluation against whatever
rules happen to be active when Admin later looks at the story — otherwise
archiving a rule silently erases the historical explanation for every
story it ever classified.

`edition_story_classifications` (Phase "3B.2B" schema,
`db/schema-edition-classification.sql`) **already has exactly the two
columns this needs** — no new table, no audit log, no event bus, per
ChatGPT's explicit "guna tempat sedia ada" instruction:

- `classification_method` (TEXT) — already holds one of `'edition_rule'`,
  `'default_mapping'`, `'geography_fallback'`, `'low_confidence_fallback'`,
  `'none'`. Phase 3 adds one more value: **`'admin_rule'`**, written when a
  Classification Rule short-circuits the pipeline (§10).
- `classification_rule` (TEXT) — already exists, currently unused by any
  classifier path (`edition-rules.mjs`'s single rule doesn't populate it
  today, a separate small gap this phase doesn't need to fix). Phase 3
  writes the firing rule's **stable row id** here (its own primary key,
  never reused — archiving only changes `status`, never the id).

At read time: story shows `classification_method = 'admin_rule'`,
`classification_rule = <rule id>` → Admin UI joins that id against the
rules table to show type/pattern/target, **plus an "archived" badge if the
rule's current `status` is `archived`** — the historical fact ("this rule
decided this") stays correct and visible even after the rule itself is
retired, exactly answering ChatGPT's "kenapa cerita ini masuk Kategori
ini?" requirement without inventing a versioning/history system.

## 9. What V1 cannot do

- Cannot add, edit, archive, or reorder rules — that's V2, matching the
  same V1-read/V2-edit split already used for Taxonomy (Phase 2).
- Cannot define a rule outside the 3 shapes (no generic conditions).
- Cannot see WHY the existing classifier (not a rule) chose a Kategori —
  that gap stays open for a future phase; V1 only makes RULE-caused
  Kategori explainable, not classifier-caused Kategori.

## 10. How new rules interact with the existing classifier

Exactly as in §5b: rule match short-circuits the whole existing pipeline
for that one story/edition; no interaction with candidate confidence,
edition rules, or default placement when a rule fires. When no rule
matches, the classifier runs completely unchanged — Phase 3 adds a new
first gate, it does not modify `story-understanding.mjs` or
`edition-classification.mjs`'s existing logic at all.

## 11. Worked examples

**RTM `/jenayah/` (the real case that started this phase):**
Today: `deskFromUrl()` extracts `jenayah` from the path, looks it up in
`SUBJECT_VOCABULARY` (`'jenayah': 'Crime'`) — this already works, per the
audit. What Phase 3 actually fixes for RTM is not this specific URL (it's
already correctly classified) but the *general capability*: if RTM (or any
other source) has a URL desk that ISN'T in `desk-vocabulary.mjs` yet (the
audit's `/mutakhir/` example — no entry anywhere), Admin can add a URL rule
for it directly, without a Claude Code edit + redeploy. No RTM-specific
code exists or is proposed — the URL rule type is fully general.

**"Artis X didakwa atas kes rasuah" (the conflict case):**
Keyword rule "artis" → Hiburan (priority 10), keyword rule "didakwa" →
Jenayah (priority 20). Both match. §5a step 1: priority 20 > 10, "didakwa"
→ Jenayah wins. Admin sees, in the story's classification detail, "Rule:
keyword 'didakwa' → Jenayah (priority 20)" — not a silent confidence
comparison.

## 12. Migration — what actually needs to move

Per ChatGPT's explicit caution: migrate only what is genuinely an editorial
per-source/per-pattern decision, not the whole classifier.

- **Migrate**: `lab/sources.js`'s `knownCategory` field (29 sources) → seed
  data for Source rules. This is the one existing piece of hardcoded logic
  that is structurally identical to what a Source rule is — "this source's
  stories are always this Kategori" is exactly `knownCategory`'s job today,
  just unreachable by Admin. This is the natural V1 seed set, not a fresh
  guess. Each `knownCategory` value today is itself a desk-vocabulary key
  (e.g. `'bisnes'`, `'sukan'`, `'hiburan'` — confirmed by reading
  `lab/sources.js` directly), not a raw source_id or field_code — so
  migration is a **one-time deterministic lookup** through the existing
  `SUBJECT_VOCABULARY` table to resolve each `knownCategory` string to its
  Universal Subject, then stored as that Source rule's `subject_code`
  (§4b) with `edition_id = NULL` — these were always global, source-level
  facts (`rss-metro-bisnes` is Bisnes-desk regardless of which edition
  eventually reads it), consistent with how `knownCategory` behaves today
  as Tier 1 evidence.
- **Do NOT migrate**: `desk-vocabulary.mjs`, `content-rules.mjs`,
  `bernama-prefix.mjs`, `confidence-policy.mjs` — these are the general
  linguistic classifier, not per-source/per-URL editorial facts. Migrating
  ~75+ keyword entries into the new table would recreate exactly the
  generic-rule-engine sprawl this design is explicitly avoiding, for
  entries that were never individual editorial decisions in the first
  place.
- **Not addressed by this phase**: `edition-rules.mjs`'s single
  `foreign_politics_to_world` rule. It doesn't fit any of the 3 rule
  shapes (it's a subject+geography combination rule, not a
  source/URL/keyword pattern) — noting this explicitly so it isn't
  silently forgotten, not proposing a 4th rule type to absorb it. If Admin
  needs to control this specific rule later, that's a deliberate follow-up
  decision, not something V1 should stretch to cover.

## Explicitly out of scope (carried over from the audit)

Attention Rules, Pin automation, any generic rule engine, ranking/scoring
logic. Also out of scope for V1 specifically: any admin write/edit UI
(V2), and migrating `edition-rules.mjs` (see §12).
