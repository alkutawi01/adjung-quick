# Edition Source Profile Model (Sesi UI-1A, 2026-08-12)

Status: **DOCUMENT ONLY — no code changed, classification engine stays
frozen.** Triggered by Izzat spotting that `Malaysia` appeared as a
geography label in the `en` and `ar` editions, contradicting the locked
"every edition has its own taxonomy" principle.

## The decision that forced this document

Izzat, asked whether `en` means "international portal" or "Malaysian
news in English":

> *"saya cadangkan pembaca yg pilih English akan rasai pengalaman
> seperti membaca portal antarabangsa mcm CNN dan BBC. manakala yg pilih
> Arabic akan baca seperti baca portal berita Arab. **saya tak nak
> Adjung Quick kelihatan seperti portal berasal dari Malaysia**"*

And on whether Malaysia should appear at all in those editions:

> *"kalau nak masukkan 'Malaysia' juga, itu kita akan buat kemudian.
> khusus utk pembaca dari Malaysia. mcm mana nak tau? sama ada dia log
> in, atau dia pernah pilih pilihan bahasa Melayu. utk skrg, secara
> default, setiap versi mmg berlainan terus."*

This is a **product positioning decision**, not a taxonomy detail. It
separates three things that had been conflated throughout the project:

```
Language  ≠  Audience  ≠  Edition
```

## Edition identity (LOCKED)

| Edition | Identity | Audience |
|---|---|---|
| `ms-MY` | Malaysian local edition | Malaysian readers |
| `en-global` (renamed from `en`) | International English edition, CNN/BBC-style | Global English readers |
| `ar-global` (renamed from `ar`) | International Arabic edition, Al Jazeera/BBC Arabic-style | Global Arabic readers |

Rename rationale (per ChatGPT): `en`/`ar` alone are ambiguous — they name
a *language*, and the whole point of this decision is that language does
not determine audience. `en-global` states the positioning in the
identifier itself, so nobody re-introduces the "Adjung English Malaysia"
reading later by accident.

## Geography behavior (LOCKED)

| Edition | Local geography field | World fallback |
|---|---|---|
| `ms-MY` | `Malaysia` | `Dunia` |
| `en-global` | **none** | `World` |
| `ar-global` | **none** | `العالم` |

`en-global` and `ar-global` have **no local-country concept at all.**
Deliberately not substituted with something else either — replacing
`Malaysia` with `Asia` for `en-global` would just move the problem, not
solve it. A story with no resolvable subject falls back to `World` /
`العالم`, full stop.

Note on `ar-global`: `العالم العربي` (Arab world) was considered as a
local field and rejected for v1 — Al Jazeera Arabic is not only Arab-world
news; it covers the Americas, Europe, Asia, and Africa extensively.
`العالم` as the single residual is the safer v1 choice.

**Important: this is NOT a classifier correction.** Story Understanding
is already correct when it says `geography_candidate: Malaysia` — that's
a true fact about the story. What changes is how each *edition* treats
that fact:

```
Story: "Malaysia announces new economic policy"
Story Understanding:  { geography: Malaysia, subject: Economy }   ← unchanged, correct

Placement:
  ms-MY      → Malaysia / Ekonomi / Bisnes
  en-global  → World / Economy / Business
  ar-global  → العالم / اقتصاد
```

Same story, different placement per edition. This is the Edition layer
working exactly as designed — which is why the classification freeze
(`docs/evidence-calibration-freeze.md`) does **not** need to be lifted.
Reclassified as an *Edition geography policy correction*, scoped to the
Edition Resolver, not the frozen Story Understanding / evidence / confidence
layers.

## Source Profile (NEW concept — the biggest finding here)

The taxonomy fix alone is not enough. Per ChatGPT: if the RSS source mix
stays ~80% Malaysian, `en-global` will still *feel* like "a Malaysian
portal in English" no matter how correct the field labels are. Fixing
labels without fixing sources fixes nothing the reader can perceive.

So each Edition needs more than a taxonomy:

```
Edition
 ├── Taxonomy          (exists — classification/lib/edition-taxonomy.mjs, state/editions.js)
 ├── Source Profile    (NEW — this document)
 ├── Ranking Profile   (future — Session UI-3)
 └── Language/Direction (exists — state/editions.js)
```

**Illustrative source priorities (not yet implemented, not yet verified
against the real source registry):**

- `ms-MY` — Bernama BM, Astro Awani BM, Harian Metro, Utusan, Kosmo.
- `en-global` — BBC World, Reuters, AP, Guardian, Al Jazeera English, DW.
  Malaysian sources may still appear, but as *World/Business/Asia
  coverage*, never as the majority of the feed.
- `ar-global` — Al Jazeera Arabic, BBC Arabic, Asharq Al-Awsat, Al Arabiya.

Shape this would eventually take (concept only, no schema decided):

```
edition.sourceProfile {
  eligible_sources[]
  source_weight
}
```

**Known gap, flagged not solved:** the current source registry
(`lab/sources.js`) is Malaysia-heavy, and several of the international
sources listed above (Reuters, AP, DW) are not wired in at all yet.
`en-global` cannot actually deliver a CNN/BBC-style experience until that
gap is closed — this is real work, not a config change.

## Deferred (explicitly not v1)

**Malaysia as a field for `en-global`/`ar-global` readers** — per Izzat,
a future *personalization* feature, not part of the base taxonomy.
Trigger signals he named: reader is logged in, reader has previously
chosen the Malay edition, **or reader shares location and it resolves to
Malaysia**. Default behavior until then: every edition is completely
distinct, with no Malaysia in `en-global`/`ar-global` at all.

Note on the location signal: it is the only one of the three that
involves a permission prompt and personal data, so it needs its own
privacy treatment when built (opt-in, never silent geolocation) — not
designed here, flagged so it isn't implemented as an invisible default.

## What this changes in existing code (planned, not applied)

| File | Change | Status |
|---|---|---|
| `classification/lib/edition-taxonomy.mjs` | `EDITION_GEOGRAPHY_RESIDUAL_LABEL` — remove `local: 'Malaysia'` from `en`, `local: 'ماليزيا'` from `ar`; rename keys `en`→`en-global`, `ar`→`ar-global` | Pending — scoped as Edition-policy correction, freeze stays otherwise intact |
| `state/editions.js` | Rename `en`→`en-global`, `ar`→`ar-global` | Pending |
| `lab/sources.js` | Add international sources; tag sources per edition | Pending, larger scope |

No file above has been edited yet.

## Next

Confirm this model, then apply the three pending changes in the table
above — smallest first (`state/editions.js` rename), each with a test
checkpoint, per the incremental migration discipline already agreed for
Session UI-1.
