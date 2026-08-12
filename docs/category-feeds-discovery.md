# Discovery: Per-Category RSS Feeds Exist for Most ms-MY Sources

Status: **Major finding, 2026-08-12** — found by Izzat during Sesi 2 reference-
portal research. Changes the ingestion strategy for Sesi 5 (Production
Ingestion) and sharply raises Tier-1 confidence for the ms-MY edition.

## The finding

Izzat noticed Harian Metro publishes an RSS index page
(`hmetro.com.my/rss`) listing **separate feeds per section**, not just one
mixed feed:

```
Utama    → hmetro.com.my/utama.xml
Mutakhir → hmetro.com.my/mutakhir.xml
Bisnes   → hmetro.com.my/bisnes.xml
Arena    → hmetro.com.my/arena.xml   (= Sukan)
Global   → hmetro.com.my/global.xml  (= Dunia)
Rap      → hmetro.com.my/rap.xml     (= Hiburan)
```

Verified live 2026-08-12. Quick currently only ingests `mutakhir.xml` — the
general "latest" feed that mixes everything, which is exactly why the corpus
audit found Harian Metro at 0/20 usable desk signal (`classification-taxonomy-mapping.md`).
**The desk signal was there all along, just not subscribed to.**

Checked whether this generalizes — it does, via a different but equally
reliable mechanism:

```
Utusan (WordPress): utusan.com.my/category/{slug}/feed/
  → verified live: utusan.com.my/category/ekonomi/feed/
    = "EKONOMI Archives - Utusan Malaysia", lastBuildDate today

Kosmo (WordPress):  kosmo.com.my/category/{slug}/feed/
  → verified live: kosmo.com.my/category/negara/feed/
    = "Negara Archives - Kosmo Digital", lastBuildDate today
```

Both Utusan and Kosmo run WordPress, which exposes a per-category feed for
*every* category in the CMS by default at `/category/{slug}/feed/` — not
something either site had to build specially. Astro Awani already gave clean
desk signal via URL path (`/berita-politik/`, `/berita-malaysia/`, etc.) even
without checking for a similar feed index.

## Why this matters more than it first looks

This isn't just "one more data point" — it changes the confidence tier
entirely. Compare:

| Approach | What it is | Confidence |
|---|---|---|
| URL-path desk extraction (current) | Inferring desk from URL structure heuristically | Tier 1, but a *guess* — could break if a site restructures URLs |
| **Category feed subscription** | The publisher's own explicit, structured commitment: "this feed is Ekonomi" | Stronger than Tier 1 — this is the source **asserting** its own classification, not us inferring it |

For 3 of 4 ms-MY sources (Utusan, Kosmo, Harian Metro), the real desk signal
that was measured as weak or absent in the original corpus audit
(`classification-taxonomy-mapping.md` — Kosmo 0/10 URL desk, Harian Metro
0/20 signal) was actually recoverable — just not from the single general feed
each was being polled through.

## Consequence for `lab/sources.js` (NOT changed yet — proposal only)

Current `RSS_SOURCES` treats each publisher as **one feed**. This finding
suggests treating each publisher's *category feeds* as multiple distinct
sources, each pre-tagged with a known, high-confidence desk:

```js
// Illustrative shape, NOT implemented:
{ id: 'rss-metro-bisnes', name: 'Harian Metro — Bisnes',
  url: 'https://www.hmetro.com.my/bisnes.xml', language: 'ms',
  knownDesk: 'Bisnes' },
{ id: 'rss-utusan-ekonomi', name: 'Utusan — Ekonomi',
  url: 'https://www.utusan.com.my/category/ekonomi/feed/', language: 'ms',
  knownDesk: 'Ekonomi' },
```

`Mutakhir`/`Utama`-style general feeds still need Tier-4 content
classification (they deliberately mix everything) — this doesn't eliminate
the classifier, it shrinks how much of the corpus depends on it.

## Not yet done

- Full category-feed inventory per source (which categories does each site
  actually expose? Utusan/Kosmo being WordPress means likely *every*
  category has one — needs enumeration, not assumed).
- Astro Awani's own feed index (if any) not checked — its URL-path signal
  was already strong enough that this wasn't urgent.
- No `sources.js` change made. This is a Sesi 5 (Production Ingestion)
  concern per the current roadmap — flagged now while fresh, not acted on
  out of sequence.
- Confirm with ChatGPT whether to pull this forward given how much it
  simplifies the ms-MY Tier-1/Tier-4 balance, or keep it queued for Sesi 5.
