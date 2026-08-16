# rss-kpm published_date Resolution Audit v1 (2026-08-16)

Status: `[x] Audit` `[ ] Approved` — **read-only, no code/migration/data change**

FASA 4.2/4.3 (dependency correction, follow-up to `docs/published-at-source-quality-audit-v1.md`),
per ChatGPT's instruction: that audit confirmed `rss-kpm`'s Atom feed
carries only `<updated>` (CMS sync time), not a genuine publish date.
Before deciding how to handle it, this document answers one narrow
question: **can a real publish date be recovered for KPM content at
all** — from the feed, the linked article page, or anywhere else —
or is the source's true publish date simply unknowable?

## Method

Live-fetched the full KPM Atom feed (330 entries at audit time — more
than the 194 captured in production, meaning the feed has grown since
the last ingest). Sampled 8 entries spread across the feed's full
order (indices 0, 1, 50, 100, 150, 200, 250, 300) — not just the
newest, per ChatGPT's ask for "5–10 old entries" — deliberately
including entries whose **titles reference old tender/notice years**
(2018, 2019) to stress-test the recovery question against content
that is provably not from today. For each entry: recorded the feed's
own `<updated>` value, followed the entry's `<link>` to the live
article page, and searched that page for every date source ChatGPT
named — `<time datetime>`, JSON-LD `datePublished`/`dateCreated`, an
`article:published_time`/`date` meta tag, a date pattern in the URL,
and a Malay-month-name date pattern in the visible body text.

## Result — identical across all 8 samples, old and new alike

| Entry | Title (truncated) | Feed `<updated>` | Page `<time>` | JSON-LD | Meta tag | URL date | Body text date |
|---|---|---|---|---|---|---|---|
| 0 | Majlis Sambutan Ulang Tahun Ke-69 DBP | 2026-08-16T10:47 | not found | not found | not found | not found | **15 Ogos 2026** |
| 1 | Program Bicara Profesional... MADANI | 2026-08-16T10:46 | not found | not found | not found | not found | **15 Ogos 2026** |
| 50 | Keputusan Tender...SMK Tun Haji Abdul Malek | 2026-08-16T09:51 | not found | not found | not found | not found | **15 Ogos 2026** |
| 100 | Iklan Tender Perkhidmatan Penyenggaraan... | 2026-08-16T08:05 | not found | not found | not found | not found | **15 Ogos 2026** |
| 150 | Pembatalan Tender...**Bagi Tahun 2019** | 2026-08-16T04:43 | not found | not found | not found | not found | **15 Ogos 2026** |
| 200 | Kempen 1 Juta Poskad Palestin Merdeka | 2026-08-16T00:24 | not found | not found | not found | not found | **15 Ogos 2026** |
| 250 | Keputusan Tender...SK Buis, Telupid, Sabah | 2026-08-15T12:36 | not found | not found | not found | not found | **15 Ogos 2026** |
| 300 | Notis Pembatalan Tender...**Ten.\*/2018** | 2026-08-09T19:36 | not found | not found | not found | not found | **15 Ogos 2026** |

**Every single article page — including entry 150, whose own title
says "Bagi Tahun 2019," and entry 300, whose title references
2018-dated tender numbers — displays the identical visible date "15
Ogos 2026."** This is the single most conclusive finding in this
audit: the page's own displayed date is not tied to the content's real
age at all. It reads as a site-wide "last touched" or template-level
timestamp (most plausibly tied to whatever the CMS considers the
page's last render/sync date), not a per-article publish date. No
`<time>` element, no structured JSON-LD data, and no meta tag exist on
these pages at all — this isn't a parsing gap on our side, the
information is simply absent from the page's markup.

## Category: NOT RECOVERABLE

Per ChatGPT's three-way categorization:

- **Recoverable** — ruled out. No structured date field (`<time>`,
  JSON-LD, meta tag) exists anywhere in the 8 sampled pages.
- **Partially recoverable** — ruled out. This isn't a case where some
  entries have a good field and others don't (contrast with
  `rss-rtm-sukan`'s per-item inconsistency, a genuinely different
  failure shape) — here, *zero* of 8 samples, spanning the entire feed
  order and explicitly including title-dated old content, expose a
  real date anywhere accessible.
- **Not recoverable** — confirmed. There is no deterministic,
  source-specific rule that could extract a true publish date for
  `rss-kpm` content from anything this audit could access. A title
  occasionally contains a **year** as incidental text inside a tender
  reference number ("Ten.2/2018") or a phrase ("Bagi Tahun 2019") —
  but that is the tender's own reference year or the subject year of
  the notice, not a reliable "this was published on X" signal, and
  most entries (e.g. "Majlis Sambutan Ulang Tahun Ke-69 DBP") carry no
  date-shaped text in the title at all. Building a regex to scrape an
  incidental year out of free text would be exactly the kind of
  unreliable, source-specific guess this audit exists to avoid
  proposing.

## Consequence, stated as a fact-finding, not a fix

Per ChatGPT's own framing in the prior turn: the honest position is
that `rss-kpm`'s true publish date is **unknown**, not that it should
be silently represented by fetch/sync time as if it were real. This
document does not decide what "unknown" should mean downstream
(`published_at = NULL`, excluding the source from freshness-sensitive
computation entirely, or something else) — that is a source-handling
decision for review, not this audit's call to make.

## What this document does NOT do

- No code, migration, or data change
- Does not decide how `rss-kpm` should be handled going forward (NULL,
  exclusion, or another approach) — names the finding, not the fix
- Does not investigate `rss-rtm-sukan` (explicitly deferred by
  ChatGPT to a separate, narrower follow-up) or the 3 stale-ingestion
  RTM sources (named as a distinct backlog item, not investigated here)
- Does not re-run the Attention V2 production simulation — per
  ChatGPT's explicit instruction, that waits until a source-handling
  decision is made and applied

## Next

Awaiting review. Per ChatGPT's stated sequencing: KPM timestamp audit
(this document) → source-specific handling decision → fix +
verification → re-run Attention V2 simulation → only then does the
2-item qualification audit regain meaning.
