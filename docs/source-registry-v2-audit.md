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

## Explicitly not done (Sesi 3+ or later)

- No `lab/sources.js` change.
- No full enumeration of every Utusan/Kosmo category slug (spot-checked 3,
  not exhaustive).
- Harian Metro's remaining ~14 nav sections not checked for dedicated feeds.
- Berita Harian and the English/Arabic reference sources not checked for
  this pattern at all — this audit focused on the sources Quick currently
  actually ingests.
