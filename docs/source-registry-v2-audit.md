# Source Registry v2 — Audit (Sesi 2.5)

Status: **AUDIT ONLY — no `lab/sources.js` change made.** Pulled forward from
Sesi 5 per ChatGPT: this is an input-quality problem more fundamental than
classification. The original framing was "classifier lemah kerana RSS tiada
desk" — the real finding is "kita ambil feed yang salah."

## Source Evidence Priority (LOCKED)

```
1. Publisher-declared category feed   (source explicitly asserts its own category)
2. URL category path                  (inferred from URL structure — current Tier 1)
3. RSS <category> tag                 (current Tier 2)
4. Content rules                      (current Tier 4)
5. Unclassified
```

Tier 1 is stronger than a URL-path guess now has a real distinct tier above
it: the publisher's own explicit feed subscription commitment. This doesn't
replace the earlier tier system (`classification-evidence-model.md`) — it
adds a stronger tier on top of it.

## What's actually available, per source (verified live 2026-08-12)

### Harian Metro — publisher-declared feeds confirmed (index page exists)

`hmetro.com.my/rss` lists feeds directly:

| Feed | URL | Declared category |
|---|---|---|
| Utama | `hmetro.com.my/utama.xml` | (general/prominence — not a subject) |
| Mutakhir | `hmetro.com.my/mutakhir.xml` | **mixed — still needs content rules** (currently the ONLY feed ingested) |
| Bisnes | `hmetro.com.my/bisnes.xml` | Business |
| Arena | `hmetro.com.my/arena.xml` | Sports |
| Global | `hmetro.com.my/global.xml` | Dunia (geography, not subject) |
| Rap | `hmetro.com.my/rap.xml` | Entertainment |

**5 more feeds exist on the site's nav that don't have confirmed direct XML
URLs yet** (Akademia=Education, Sihat=Health, Addin=Religion, Vroom, Agro,
etc. — the `/rss` index page only listed 6; the full nav has ~20 sections).
Not all necessarily have feeds — needs checking per section, not assumed.

### Utusan — WordPress `/category/{slug}/feed/` pattern confirmed generalizable

Verified live, all returning fresh (`lastBuildDate` = today) category
archives:

| Slug tested | Result |
|---|---|
| `ekonomi` | "EKONOMI Archives - Utusan Malaysia" ✓ |
| `sukan` | "SUKAN Archives - Utusan Malaysia" ✓ |

Standard WordPress behavior — **every** category in Utusan's CMS almost
certainly has a working feed at this pattern, not just the two tested. Full
category slug list not yet enumerated (needs checking Utusan's own category
taxonomy, e.g. via their sitemap or category archive pages) — flagged as
remaining work, not assumed complete.

### Kosmo — same WordPress pattern confirmed

| Slug tested | Result |
|---|---|
| `negara` | "Negara Archives - Kosmo Digital" ✓ |

Same generalization logic as Utusan applies — Kosmo is WordPress too.

### Astro Awani — NO separate category feeds found

Tested `astroawani.com/berita-politik/rss.xml` → 404. Astro Awani (Drupal-
based, per its `node-article-detail-title` markup) does not appear to expose
per-category feeds the same way. **Its existing URL-path signal
(`/berita-politik/`, `/berita-malaysia/`, etc.) remains the best available
evidence for this source** — already Tier-1-strength, just not
publisher-declared-feed-strength. Not a blocker, just a different tier.

## What Sesi 3 (Classification Engine v2) should assume

- Harian Metro: ingest `bisnes.xml`, `arena.xml`, `global.xml`, `rap.xml` as
  **separate pre-tagged sources**, each carrying a near-100%-confidence
  Tier-1 declared category. Keep `mutakhir.xml` too — it's still needed for
  general/breaking coverage — but only *that* feed's items need full content
  classification, not all of Harian Metro's output.
- Utusan/Kosmo: the `/category/{slug}/feed/` pattern likely extends to every
  category each site runs. Before wiring into production, enumerate each
  site's actual category list (their own nav/sitemap) rather than
  hand-picking slugs.
- Astro Awani: no change — keep relying on URL-path Tier-1 inference.

## Bernama re-discovered (Izzat, 2026-08-12)

`lab/sources.js` had Bernama marked DISABLED ("every guessed URL variant
returns 404 — appears to have retired public RSS"). Wrong — the working URL
was simply `bernama.com/en/rssfeed.php` (English) / `bernama.com/bm/rssfeed.php`
(Malay), not the patterns previously guessed. Both verified live 2026-08-12.

**Real, distinct evidence pattern**: Bernama embeds category as a **title
prefix** on every item — `"World : Bangladesh To Have Strong Presence..."`,
`"Business : SME Financing Conditions..."`, `"Sukan : Malaysia Sertai
Sulung..."`. Not a separate feed per category (like Harian Metro) and not a
URL path (like Astro Awani) — a third distinct evidence shape: **parse the
category prefix off `title`, strip it before using the title itself.**
Add to Source Evidence Priority as a variant of tier 1 (publisher-declared),
not a new tier.

Also found via a third-party aggregator (`aimadani.com/data-sources`, itself
running a Malaysian RSS registry) confirming Bernama EN operational and
listing several more real, currently-working Malaysian sources not yet in
`lab/sources.js`: Harapan Daily, Malay Mail, Media Selangor (ms), plus two
Tamil-language outlets (Makkal Osai, Vanakkam Malaysia) — relevant if Quick
ever adds a Tamil edition, not acted on now. That same registry lists
`rss.app`-proxied Astro Awani/Berita Harian/Bernama(BM) feeds as discontinued
— doesn't contradict our findings, since we're using each site's own direct
feed, not a third-party proxy.

**Not yet done:** re-enabling Bernama in `lab/sources.js`, adding the
title-prefix parsing to the evidence pipeline, or adding any of the newly
found sources. Flagged for Sesi 3A/5, not acted on out of sequence.

## Asharq Al-Awsat discovered (Izzat, 2026-08-12) — richest Arabic source found

`aawsat.com/rss-feed` lists ~30 real category feeds — by far the most
granular Arabic source found. Confirms several universal subjects
distinctly, some for the first time in Arabic evidence: `الاقتصاد` (Economy),
`الرياضة` (Sports), **`التعليم` (Education — second confirmation, after
elalmelarby.com)**, `تقنية المعلومات` (Technology), **`صحتك` (Health — second
confirmation)**, **`علوم` (Science — second confirmation)**. Also carries
real geography-only feeds separate from subject (`العالم العربي` Arab World,
`الخليج` Gulf, `أوروبا` Europe, `الأميركيتين` Americas, `آسيا` Asia, `أفريقيا`
Africa) — further independent confirmation of the Subject/Geography split.

**Adds a third position to the Culture/Entertainment/Arts question**, beyond
the BBC-Arabic/AJ-Arabic merge vs. Al Araby's two-way split: Asharq
Al-Awsat runs **three** separate feeds — `فضاءات` (Culture), `سينما`
(Cinema/Entertainment), `أنغام وفنون` (Music & Arts) — not merged at all.
Strengthens the case that the earlier `ثقافة وفنون` merge decision was a
genuine simplification choice for Quick's v1, not something "the evidence"
uniformly supports — real major outlets range from fully-merged to
three-way-split. Not reopening the locked v1 decision now, just recording
that the evidence is more mixed than the original two-source confirmation
suggested.

Not yet added to `lab/sources.js` or the desk vocabulary — flagged for when
Sesi 3A/5 actually wires in new sources.

## Explicitly not done (Sesi 3+ or later)

- No `lab/sources.js` change.
- No full enumeration of every Utusan/Kosmo category slug (spot-checked 3,
  not exhaustive).
- Harian Metro's remaining ~14 nav sections not checked for dedicated feeds.
- Berita Harian and the English/Arabic reference sources not checked for
  this pattern at all — this audit focused on the sources Quick currently
  actually ingests.
