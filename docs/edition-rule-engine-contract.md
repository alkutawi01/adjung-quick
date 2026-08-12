# Edition Rule Engine Contract (Sesi 3B.2A)

> **Corrections applied 2026-08-12, after ChatGPT review of this contract:**
> (1) `Culture+Entertainment → Hiburan for ms-MY` was a mistaken example —
> **cancelled**, no decision change. The real Arabic-only rule:
> `{ edition: "ar", condition: { field_in: ["Culture","Entertainment"] },
> action: { display_field: "ثقافة وفنون" } }`. (2) The static taxonomy
> transform and the dynamic conditional rules are **not two separate code
> paths** — one Edition Resolution Pipeline, two data registries feeding it.
> See "Unified Resolver Model" below, which supersedes the "open design
> question" originally in this document.

Status: **CONTRACT — schema only, no rules implemented, no code written.**
Per ChatGPT: don't write rules yet, define how editions are *allowed* to make
decisions first.

## Why this exists

Sesi 3B.1's gap analysis revealed three genuinely different problems that
must not be collapsed into one "classifier fix":

| Gap | Problem | Owner |
|---|---|---|
| Gap 1 — candidate conflict | Story Understanding + Edition Rule |
| Gap 2 — subject correct, edition display wrong | Edition Rule |
| Gap 3 — weak candidate beats geography fallback | Resolver ranking policy |

Gap 2 in particular resolves a long-open question cleanly: Izzat originally
asked whether `Politik` should be Malaysia-only or global. The answer,
sharpened by this gap analysis: **Story Understanding says all politics is
`Politics` — universal, unscoped. The `ms-MY` *edition* then displays foreign
politics as `Dunia`.** Not a scoping rule on the subject itself; a display
rule on top of a correctly-identified, unscoped subject. Cleaner than either
of the two original options ("Politik = global" or "Politik = Malaysia
only").

## Rule schema

Data, never hard-coded per-edition branches (same discipline as
`edition-taxonomy.mjs`'s Merge/Split/Rename/Hide table):

```json
{
  "edition": "ms-MY",
  "rule_id": "foreign_politics_to_world",
  "priority": 20,
  "condition": {
    "subject_candidate": "Politics",
    "geography_not": "Malaysia"
  },
  "action": {
    "display_field": "Dunia"
  }
}
```

## Unified Resolver Model (LOCKED, corrected 2026-08-12)

One Edition Resolution Pipeline, two distinct registries feeding it — never
two separate code paths:

```
Story Understanding
        │
        ▼
   Edition Resolver
        │
        ├── Display Transform Registry   (STATIC — edition-taxonomy.mjs)
        │     "how does universal taxonomy map to this edition's menu?"
        │     Never looks at the individual story.
        │
        └── Edition Rule Registry        (DYNAMIC — new)
              "does THIS story's context change the display?"
              Looks at subject + geography (+ future signals) per story.
        │
        ▼
Resolved Edition Classification
```

### Refined priority hierarchy

```
1. Editorial override rules          (highest priority, most specific)
2. Contextual transformation rules   (e.g. foreign_politics_to_world)
3. Taxonomy display transformation   (the static Merge/Rename table)
4. Direct subject mapping            (fallback: pass the subject name through as-is)
5. Unclassified
```

Taxonomy transform is not "lower value" than a contextual rule — it simply
runs *after* we know the subject, and only when no contextual rule already
decided the outcome. Worked example:

- `subject: Business, geography: Malaysia` → no contextual rule matches →
  falls to taxonomy transform → `Business + Economy → Bisnes`.
- `subject: Politics, geography: Thailand` → `foreign_politics_to_world`
  matches at tier 2 → resolves to `Dunia` directly, taxonomy transform never
  runs for this story.

### Resolution Operation Types (vocabulary for the Display Transform Registry)

- **MAP** — one universal subject → one edition field (e.g. `Politics →
  Politik`).
- **MERGE** — multiple universal subjects → one edition field (e.g.
  `Business+Economy → Bisnes`).
- **SPLIT** — one universal subject → multiple edition fields (not used in
  v1, mechanism reserved).
- **HIDE** — subject exists but isn't surfaced as a Wheel entry (e.g.
  `Lifestyle`, not yet drafted for ms-MY).

`OVERRIDE` (context-dependent) belongs to the Edition Rule Registry, not this
vocabulary — it's a different registry entirely, evaluated at tiers 1–2
before the Display Transform Registry ever runs.

`edition-taxonomy.mjs` is **not replaced** — it becomes the **Edition
Taxonomy Registry**, read by the resolver at tier 3.

## Confidence threshold — parameter, not locked

Gap 3's fix is a resolver *policy*, not an editorial rule:

```json
{ "min_subject_confidence": 0.6 }
```

Below this, the resolver should prefer geography fallback over a weak
subject candidate. **Value not locked** — needs testing against real data
before fixing a number, per ChatGPT's explicit "threshold jangan lock dulu."

## Candidate rules — 3B.2B scope, deliberately narrow

Per ChatGPT: implement **only** rules already proven by evidence, not the
full Gap 2 list generalized speculatively:

| Rule | Type | Status |
|---|---|---|
| `foreign_politics_to_world` (Politics + geography≠Malaysia → Dunia) | Edition Rule Registry, OVERRIDE, tier 2 | **3B.2B — implement now** |
| `Business+Economy → Bisnes` | Display Transform Registry, MERGE, tier 3 | Already implemented (`edition-taxonomy.mjs`), just now correctly understood as tier 3 of the same pipeline, not a separate system |
| Equivalent foreign-routing for Crime, Disaster, Environment, Business | Gap 2 evidence exists (9/4/4/3 cases) | **NOT implemented yet** — deliberately not generalizing from one proven case (Politics) to four unproven ones. A foreign earthquake plausibly *should* stay `Bencana` for ms-MY (disaster relevance isn't geography-scoped the way domestic party politics is) — needs its own evidence/judgment call, not an automatic extension of the Politics rule. |
| `min_subject_confidence` threshold | Gap 3 evidence exists (23%) | Not implemented in 3B.2B — separate resolver-policy work, not an editorial rule |

**Corrected — not a candidate rule at all:** merging Culture+Entertainment
for ms-MY (see correction note at top of document). The real Arabic-only
version of this rule already exists as a Display Transform Registry MERGE
entry.

## Conflict Resolution (v1, added 2026-08-12 — proposal, freeze active)

When structural evidence from the same source genuinely disagrees (e.g.
Guardian's own `rss_category:Politics` vs `url_segment:Environment` for
the same story — not two different publishers, one publisher's own two
mechanisms disagreeing), v1 resolves to a single primary placement using
this priority:

```
URL desk path > RSS category > other structural signals
```

Rationale (Izzat, confirmed by ChatGPT): a publisher's URL structure
reflects a more deliberate editorial decision than an RSS `<category>`
tag, which tends to be looser or more automated. Not claimed as an
absolute truth ("URL is always right") — a v1 default tie-breaker.

**The losing candidate is not discarded.** It remains in Story
Understanding's evidence trail (`alternative_candidates`, per
`docs/structural-evidence-fallback-policy.md`'s Policy A) for audit,
debugging, and future reconsideration — only the *displayed* placement
is singular, not the underlying evidence.

This is deliberately a narrow, same-source rule — it does not attempt to
resolve disagreement *between* different publishers/sources on the same
story cluster. Per `docs/multi-placement-consideration.md`, cross-source
disagreement is expected to resolve through source diversity (more RSS
feeds, future clustering) rather than explicit multi-placement machinery
— not a v1 concern.

Still a proposal, not locked — pending confirmation via Batch M/U/Medium
adjudication that this holds consistently, per
`docs/evidence-calibration-freeze.md`.

## Sequencing (per ChatGPT)

| Step | Scope |
|---|---|
| 3B.2A (this doc) | Rule contract only |
| 3B.2B | `ms-MY` rules specifically — most evidence exists for this edition |
| 3B.2C | `en`/`ar` rules — later, don't do all editions simultaneously |

## Explicitly out of scope for 3B.2A

No rules implemented. No entity detection (per ChatGPT: Gap 2 isn't an
entity-detection problem — the engine already knows `subject: Politics,
geography: Thailand`; it's missing a display *transform*, not missing
information). No content-rule keyword changes. No taxonomy changes. No SQL
migration.

## Next

Once this contract is confirmed, Sesi 3B.2B implements `ms-MY`'s rules
specifically (the `foreign_politics_to_world`-style rules + confidence
threshold), tested against the same 284-item corpus, before touching `en`/`ar`.
