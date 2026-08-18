# Fasa 3 Production Wiring — Audit + Implementation Plan

Scope: close the gap found in `docs/control-plane-completion-audit-phase1-3-v2.md`
— `classify-production.js` never fetches or passes `classification_rules`
to the classifier, so the Fasa 3 table has zero live effect regardless of
its contents. Per ChatGPT's explicit instruction: audit + plan only, no
implementation yet. Narrow scope — no changes to `story-understanding.mjs`
or any classifier machinery unless this audit proves it's needed (it
doesn't — see below).

## Audit — answering each question ChatGPT asked

**1. Where should active `classification_rules` be fetched?**

Inside `db/classify-production.js`'s `main()`, once, before the
per-cluster loop — the same pattern already used for taxonomy
(`await loadTaxonomyRegistryFromDB(supabase)` at line 57, run once before
the loop starts). No existing adapter function fetches *only* active
rules for this shape (`ui/src/admin/classificationRulesAdapter.js`'s
`fetchClassificationRules()` fetches ALL rows regardless of status, for
the admin UI's own filter controls — not a fit here). The minimal query:

```js
const { data: activeRules, error: rErr } = await supabase
  .from('classification_rules')
  .select('id, rule_type, edition_id, pattern, field_code, subject_code, priority')
  .eq('status', 'active');
if (rErr) throw new Error(`classification_rules — ${rErr.message}`);
```

No new adapter file needed — this is a single inline query, consistent
with how `classify-production.js` already queries `story_clusters` and
`rss_items` directly rather than through a separate adapter module.

**2. How should `allActiveRules` be formed?**

Exactly the shape above — `resolveClassificationRule()`
(`classification/lib/classification-rules-resolver.mjs:69`) expects rows
with `rule_type, edition_id, pattern, field_code, subject_code, priority,
id`. The query above returns exactly that shape directly from the table;
no transformation needed.

**3. Does scope/edition resolution already happen before the call?**

Yes — confirmed by reading `classifyForAllEditions()`
(`classification/edition-classification.mjs:227-234`):

```js
const rulesFor = edition => allActiveRules.filter(r => r.edition_id === null || r.edition_id === edition);
```

This already scopes the flat `allActiveRules` array per edition (global
rules apply everywhere, edition-specific rules only to their own edition)
— `classify-production.js` does not need to do any per-edition filtering
itself. It fetches once, passes the flat array, `classifyForAllEditions`
does the rest.

**4. Is `resolveClassificationRule()` already sufficient?**

Yes — confirmed by reading the full file. It handles source/url/keyword
matching (`matchesRule()`), priority + same-type-specificity tie-breaking
with cross-type-tie rejection (`pickWinner()`), both edition-specific and
global (subject_code-resolved) rules, and returns `null` (meaning "the
classifier decides, exactly as before Phase 3") on no match, a rejected
tie, or an unresolved global-subject mapping. Nothing in this function
needs to change.

**5. What happens when `allActiveRules = []`?**

Already proven to be a true no-op — `classification/classification-rules-resolver.test.mjs`
(existing, from Fasa 3's original implementation) has a dedicated test:
omitted `item`/`activeRules` args default to `undefined`/`[]`, verified
via `JSON.stringify()` byte-equality against the pre-Phase-3 output shape.
Passing an actual empty array (`[]`) fetched from a genuinely-empty table
today produces the identical code path — `resolveClassificationRule()`'s
`candidates` filter on an empty array always returns `[]`, `pickWinner([])`
returns `null` immediately. No new test needed to prove this specific
case; the existing test already covers the mechanism, and production's
current real state (0 rows in `classification_rules`) means the very
first live run after this wiring lands IS that test, for real.

**6. `item` is also currently missing, not just `allActiveRules`**

Found during this audit, not mentioned in v2's headline finding directly
but part of the same root cause: `classify-production.js:101` calls
`classifyForAllEditions(understanding)` — a single argument. The function
signature is `classifyForAllEditions(understanding, thresholdOverride,
item, allActiveRules = [])`. So **`item` is also never passed today**,
meaning even after wiring in `allActiveRules`, rule matching would
silently fail for every rule (`matchesRule()` reads `item.sourceId`,
`item.link`, `item.title`, `item.description` — all `undefined` if `item`
itself is `undefined`). Both must be wired together.

`item`'s required shape (per `classification-rules-resolver.mjs:57`):
`{ sourceId, link, title, description }`. `classify-production.js`
already has every one of these fields on `canonical`
(`db/classify-production.js:93`, from the `rss_items` select at line 65):
`canonical.source_id`, `canonical.link`, `canonical.title`,
`canonical.description`. The call becomes:

```js
const editions = classifyForAllEditions(
  understanding,
  undefined, // thresholdOverride — unchanged, was already never passed
  { sourceId: canonical.source_id, link: canonical.link, title: canonical.title, description: canonical.description },
  activeRules,
);
```

## Required tests before this is considered verified

Per ChatGPT's explicit list — each maps to either an existing test or a
new one needed:

| Requirement | Status |
|---|---|
| No rules → no behaviour change | Already covered by `classification-rules-resolver.test.mjs`'s true no-op test (byte-identical JSON). Confirmed sufficient, no new test needed. |
| Matching rule → rule actually used | Already covered — `classification-rules-resolver.test.mjs` has dedicated Source Rule / URL Rule override tests. Covers the resolver in isolation; **new integration test needed** to prove `classify-production.js`'s wiring itself passes the right shape end-to-end (resolver tests alone don't catch a wiring bug like the missing `item` found above). |
| Archived rule → not used | Covered at the fetch layer (`.eq('status', 'active')` excludes archived rows before they ever reach the resolver) rather than resolver logic — **new test needed** for the fetch query itself, or acceptable as a live-verification-only check since it's a one-line filter, not resolver logic. Recommend a lightweight test asserting the fetch query includes the status filter. |
| Provenance `classification_method = 'admin_rule'` | Already covered — `classification/edition-classification.mjs`'s prefix block (added in Fasa 3) sets this on a rule match, tested in `classification-rules-resolver.test.mjs`. |
| Non-matching rule → classifier proceeds normally | Already covered — `resolveClassificationRule()` returning `null` falls through to the existing 4-step resolver, tested. |
| All editions still correct | The existing `--dry-run` parity check (692-row byte-identical comparison, run when Fasa 3's classifier integration originally shipped) proved this for the *no-rules* case. **New verification needed**: after wiring, a `--dry-run` with the real (currently 0-row) `classification_rules` table must still produce byte-identical output to before this change — proving the wiring itself introduces no regression even before any rule exists to test against. |

**New test/verification work implied (not yet written):**
1. A small integration-level test or manual `--dry-run` diff proving
   `classify-production.js`'s actual call site passes a correctly-shaped
   `item` and `allActiveRules` — not just that the resolver function
   works in isolation.
2. A live `--dry-run` parity check post-wiring (0 rules in production
   today → must match pre-wiring output exactly).
3. Optionally, a temporary test rule (added via the admin RPC, then
   archived/removed after) to prove a real end-to-end override actually
   changes a real story's classification — mirroring the rigor of the
   Fasa 1 live verification (toggle → observe → revert). This should be
   proposed as part of the implementation plan's verification step, not
   done now (this document is audit + plan only).

## What does NOT need to change

- `story-understanding.mjs`, `desk-vocabulary.mjs`, `content-rules.mjs`,
  `bernama-prefix.mjs`, `confidence-policy.mjs`, `edition-rules.mjs` —
  none of these are touched by this wiring; they remain exactly as they
  are, per `classification-rules-resolver.mjs`'s own header comment
  ("everything else in the existing classifier... is completely untouched
  by this file").
- `resolveClassificationRule()`, `classifyForEdition()`,
  `classifyForAllEditions()` — all already correctly built for this;
  only the *caller* (`classify-production.js`) needs to change.
- No new table, column, or RPC.

## Implementation plan (small, per the above)

1. In `db/classify-production.js`'s `main()`, add the active-rules fetch
   (shown above) alongside the existing taxonomy load, before the
   per-cluster loop.
2. Change the `classifyForAllEditions()` call site to pass `item` (built
   from `canonical`) and `activeRules` (the fetch result), per the shape
   shown above.
3. Add the wiring-level integration test (item 1 in the test table above).
4. Run `--dry-run` against real production data (0 rules today) and
   diff against a pre-change `--dry-run` run — must be byte-identical.
5. Run full `npm test`.
6. Only after 1-5 pass: propose (separately, to ChatGPT) whether to also
   do a live temporary-rule end-to-end proof (item 3 in the test table),
   matching the Fasa 1 verification rigor.

Not yet implemented — awaiting ChatGPT's review of this audit + plan
before any code changes are made, per established discipline.
