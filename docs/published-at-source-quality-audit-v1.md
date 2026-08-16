# published_at Source Quality Audit v1 (2026-08-16)

Status: `[x] Audit` `[ ] Approved` — **read-only, no ingestion/schema/classifier/ranking/Attention change**

FASA 4.2/4.3 (dependency correction), per ChatGPT's instruction: before
trusting `published_at` as a freshness signal anywhere (Attention V2's
48h gate, Active Set ranking, or anything else), verify what
`published_at` actually measures for every active RSS source. Triggered
by Izzat's own live report that Bidang "Nasional" (ms-MY) looked
empty, which led to finding `rss-kpm` alone accounts for 193/470
(41%) of ms-MY's classified stories — a distribution skew serious
enough to question whether `published_at` means what the rest of the
system assumes it means.

## The parsing mechanism (one shared code path, per `lab/rss.js:73-75`)

Every source goes through the same regex-based parser — there is no
per-source date-parsing logic:

```js
const dateMatch = block.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i);
const parsedDate = dateMatch ? new Date(sanitizeHtmlText(dateMatch[1])) : new Date();
const publishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
```

Two distinct fallback triggers, both landing on "now" (fetch time):
1. No `pubDate`/`published`/`updated` tag present at all in the item/entry block.
2. A tag is present but its value doesn't parse to a valid date.

**Critically, a third failure mode exists that this code cannot
detect**: a tag IS present and DOES parse successfully, but its
real-world meaning isn't "date of publication" — e.g. Atom's
`<updated>` legitimately means "last modified," which some publishers
set to essentially "now" on every CMS sync, regardless of the
underlying content's actual age. This is not a parser bug — the code
is reading the field correctly — but the field itself doesn't carry
the meaning the rest of the system assumes.

## Method

For every source in `lab/sources.js` (26 total): pulled up to 500 real
production `rss_items` rows (`published_at`, `title`), computed the
timestamp span, and flagged sources where many items land in a
suspiciously tight window. For the sources this surfaced as anomalous,
fetched the **live** feed XML directly and inspected the actual date
tag used, per-item — not inferred from the production data alone.

## Findings — the confirmed case

**`rss-kpm` (Kementerian Pendidikan) — BROKEN.** Live feed XML,
checked directly:

```xml
<entry>
  <title>...Iklan Kekosongan Jawatan...</title>
  ...
  <updated>2026-08-16T10:42:09+08:00</updated>
</entry>
```

**No `<published>` tag exists anywhere in this feed — only
`<updated>`.** Confirmed against the live feed at the moment of this
audit: the `<updated>` value is effectively "now" (matches the fetch
time to the minute) on the entries checked, regardless of the fact
that many entries' own **titles** reference events from 2021–2023
("17 Mac 2022 - Tahniah Penerima Pingat...", "12 Januari 2023 - Majlis
Amanat..."). This is moe.gov.my's CMS stamping `<updated>` on every
sync of its content-archive index, not a genuine per-article
publication or last-edit date. Our parser reads this tag correctly
per the regex — the field itself is the wrong signal for this source.

**Consequence, concretely**: every one of KPM's 194 production items
currently carries a `published_at` within the last ~46 hours,
regardless of whether the underlying announcement is from this week or
from 2021. This is exactly the failure mode ChatGPT named before this
audit started: "artikel 2021 yang baru diambil [dianggap] sebagai
berita 15 jam lalu."

## Findings — two anomalies investigated and cleared or partially cleared

**`rss-bbc-arabic` — VERIFIED, with a noted content-hygiene caveat.**
Production data showed one real item at ~7 years old (2019). Checked
the live feed directly: current entries carry genuine, sensible
`<pubDate>` values (Aug 8–16, 2026 range) — no fallback pattern
observed. The 2019 item is best explained as BBC Arabic occasionally
re-surfacing an evergreen page (e.g. a "watch live" listing) in its
feed with its own real, original `<pubDate>` preserved — a content
decision on BBC's side, not a parsing failure on ours. **Recommendation
(not a threshold change)**: treated as VERIFIED for the parsing
question this audit asks, but named as a case worth the Attention
freshness gate handling gracefully regardless (an outlier this old
already fails the 48h gate correctly, so V2's own logic already
absorbs this case without needing a fix).

**`rss-rtm-sukan` — SUSPECT.** Production span was ~3 years (2023–2026).
Checked the live feed directly: the newest item has a normal
`<pubDate>`, but **the oldest sampled item has no date tag at all** —
confirming this feed inconsistently includes `pubDate` per item, so
some of its items genuinely do fall back to fetch-time while others
carry real dates. Both real and fallback timestamps are mixed in the
same source's data, which is worse than a source being uniformly
broken (harder to filter). Flagged, not fixed here.

## Findings — a different, separate problem: stale ingestion

Three RTM sources have **no data newer than late January 2026** despite
being marked `active` in the registry — `rss-rtm-ekonomi`,
`rss-rtm-dunia`, `rss-rtm-hiburan`. This is not a `published_at`
accuracy question — their existing timestamps look like real
`pubDate` values, correctly parsed — it's that ingestion appears to
have **stopped pulling new items from these three feeds entirely**
for roughly six months. Named here because it surfaced during this
audit, but it is a distinct issue (source health / ingestion cadence,
not timestamp semantics) — **not investigated further in this
document**, per scope.

## Full source classification

| Source | Category | Basis |
|---|---|---|
| rss-kosmo | VERIFIED | Spread (1.3h/10 items) consistent with real chronological publishing |
| rss-utusan | VERIFIED | Spread consistent |
| rss-metro | VERIFIED | Spread consistent |
| rss-metro-bisnes | VERIFIED | Spread consistent |
| rss-metro-arena | VERIFIED | Spread consistent |
| rss-metro-global | VERIFIED | Spread consistent |
| rss-metro-rap | VERIFIED | Spread consistent (24.8h/10 items) |
| rss-utusan-ekonomi | VERIFIED | Spread consistent |
| rss-utusan-sukan | VERIFIED | Spread consistent |
| rss-utusan-politik | VERIFIED | Spread consistent |
| rss-kosmo-hiburan | VERIFIED | Spread consistent |
| rss-bbc-world | VERIFIED | Spread consistent (32.3h/23 items) |
| rss-aljazeera-en | VERIFIED | Spread consistent |
| rss-guardian-world | VERIFIED | Spread consistent (125.8h/45 items, proportionate) |
| rss-bbc-arabic | VERIFIED (caveat) | Live-checked; real `pubDate`; one old evergreen outlier explained above |
| rss-aljazeera-ar | VERIFIED | Spread consistent |
| rss-awani-politik | VERIFIED | Spread consistent |
| rss-awani-nasional | VERIFIED | Spread consistent |
| rss-awani-bisnes | VERIFIED | Spread consistent |
| rss-awani-sukan | VERIFIED | Spread consistent |
| rss-awani-hiburan | VERIFIED | Spread proportionate (464.6h/25 items — low-frequency category, not bunched) |
| rss-awani-gayahidup | VERIFIED | Spread proportionate |
| rss-awani-dunia | VERIFIED | Spread consistent |
| rss-rtm-nasional | VERIFIED | Spread consistent (22.7h/50 items) |
| rss-rtm-ekonomi | VERIFIED data, but STALE ingestion | See separate finding above — not a timestamp problem |
| rss-rtm-dunia | VERIFIED data, but STALE ingestion | Same |
| rss-rtm-jenayah | VERIFIED | Spread consistent |
| rss-rtm-sukan | **SUSPECT** | Live-checked; feed inconsistently includes `pubDate` per item |
| rss-rtm-hiburan | VERIFIED data, but STALE ingestion | Same as ekonomi/dunia |
| rss-jakim-berita | VERIFIED | Spread proportionate (725h/10 items — low-frequency authority source) |
| rss-jakim-kenyataan | VERIFIED | Spread proportionate |
| rss-utusan-agama | VERIFIED | Spread proportionate |
| rss-ikim | VERIFIED | Spread proportionate |
| rss-mosti | VERIFIED | Spread proportionate |
| **rss-kpm** | **BROKEN** | Live-checked; only `<updated>` exists, effectively always "now" |
| rss-amanz | VERIFIED | Spread consistent (44.4h/30 items) |
| rss-jaipp | VERIFIED | Spread proportionate (very low frequency source, wide span expected) |
| rss-bernama-en | UNKNOWN | Only 1 production row sampled — insufficient evidence |
| rss-bernama-bm | UNKNOWN | Only 1 production row sampled |
| rss-utusanborneo-sabah | UNKNOWN | Only 1 production row sampled |
| rss-utusanborneo-sarawak | UNKNOWN | Only 1 production row sampled |
| rss-beritaharian | UNKNOWN | Only 1 production row sampled |

**Summary**: 1 BROKEN (`rss-kpm`), 1 SUSPECT (`rss-rtm-sukan`), 5
UNKNOWN (insufficient production samples — all recently-added sources
per `lab/sources.js`'s own comments, likely to accumulate more data
naturally), 3 flagged separately as stale-ingestion (not a
`published_at` issue), remainder VERIFIED.

## What this document does NOT do

- No global parser change — per ChatGPT's explicit instruction, a
  global fix risks corrupting the sources that are currently correct
- No fix to `rss-kpm` specifically — diagnosed, not corrected, here
- No fix to the stale-ingestion RTM sources — named, not investigated
  or corrected
- No re-run of the Attention V2 production simulation — that depends
  on this audit's outcome per ChatGPT's own stated sequencing, and
  isn't performed in this document
- Does not resolve the 5 UNKNOWN sources — flagged as needing more
  production data over time, not fixed by more live-XML sampling here

## Next

Awaiting review. Per ChatGPT's stated sequencing: (1) decide whether
`rss-kpm` (and possibly `rss-rtm-sukan`) needs a source-specific
correction — likely excluding it from freshness-sensitive computations
rather than inventing a new parser path, given it's the one confirmed
BROKEN case — (2) only after that, re-run the Attention V2 production
simulation against corrected/excluded data, (3) only then does the
2-item qualification audit regain meaning.
