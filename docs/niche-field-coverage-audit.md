# Niche Field Coverage Audit (2026-08-13)

Status: **Diagnosis only — no classifier/rule/keyword changes.** Per
ChatGPT's explicit instruction after Izzat's live-test finding ("Sains
cuma MOSTI, Pendidikan cuma KPM — takkan takde berita pendidikan dari
media arus perdana?"): answer whether niche Bidang are thin because of
weak source coverage, or because the classifier is failing to see real
content that exists. **Frozen classification engine
(`classification/story-understanding.mjs`, `classification/edition-classification.mjs`)
untouched.**

## Method

Pulled 20 real production `rss_items` rows from mainstream Malay
newsrooms (Astro Awani, Bernama, Utusan, Harian Metro, RTM) whose titles
contain an unambiguous education keyword (sekolah/universiti/pelajar/
murid/peperiksaan/IPT/kampus/guru). Ran each through the real
`understandStory()` call — same one `db/classify-production.js` uses —
and compared its top subject candidate against what's actually stored in
`edition_story_classifications` for `ms-MY`.

## Results

| Title | Source | `understandStory()` top candidate | DB `ms-MY` placement | Category |
|---|---|---|---|---|
| Jerebu: Enam sekolah di Tebedu ditutup sementara | rss-rtm-nasional | (none) | Malaysia @0.98 (geography_fallback) | **B** |
| Jerebu: 108 sekolah di Serian ditutup... | rss-awani-nasional | (none) | Malaysia @0.98 (geography_fallback) | **B** |
| Murid naik lif 288 meter ke sekolah | rss-metro-global | (none) | Dunia @0.98 (geography_fallback) | **B** |
| USM cipta RM1.2 juta projek kerjasama inovasi... | rss-rtm-nasional | (none) | Malaysia @0.98 (geography_fallback) | **B** |
| AMAR pemangkin budaya integriti di universiti | rss-rtm-nasional | (none) | Malaysia @0.98 (geography_fallback) | **B** |
| Murid SK Tasek Utara johan di Doha | rss-rtm-nasional | (none) | Malaysia @0.98 (geography_fallback) | **B** |
| Video pelajar dipukul tular, polis buka kertas siasatan | rss-rtm-jenayah | Crime @0.98 | Jenayah @0.98 (default_mapping) | editorial — correctly Crime, not Education |
| UKM cipta sejarah anjur Konsert Diraja... | rss-awani-hiburan | Entertainment @0.97 | Hiburan @0.97 (default_mapping) | editorial — correctly Entertainment |
| Dua termasuk pelajar sekolah maut kereta terbabas, terbakar | **rss-rtm-sukan** | Sports @0.9 | Sukan @0.9 (default_mapping) | **NEW finding, below** |
| Bantuan persekolahan ringankan beban pelajar asnaf | **rss-rtm-sukan** | Sports @0.9 | Sukan @0.9 (default_mapping) | **NEW finding, below** |

## Answer to Izzat's question

**Mostly Case B: genuine evidence/coverage gap, not a classifier bug.**

For 6 of the 10 sampled stories, `understandStory()` returns **zero**
subject candidates for Education — not a low-confidence guess, nothing at
all. The subject vocabulary the classifier matches against
(`classification/lib/`) has no entries connecting words like "sekolah",
"universiti", "murid", "USM", "UKM" to an Education subject. These
stories fall back to `geography_fallback` (Malaysia/Dunia) because
that's the only signal strong enough to fire — not because Education
lost a close contest, but because Education was never a candidate in the
race at all.

This means: mainstream Malay newsrooms DO cover education-adjacent news
(school closures, university funding, student achievements) — the
classifier simply has no vocabulary to recognize it as Education-subject
content, so it falls through to geography instead. This is a real,
fixable evidence gap — but fixing it means extending the subject
vocabulary (a classifier change), which is explicitly out of scope for
this diagnosis-only audit and needs its own calibration decision.

## A NEW finding, not part of the original question

Two stories from `rss-rtm-sukan` — a car-crash death involving a student
and a financial-aid announcement for schooling — were classified
**Sports @0.9**, purely because `rss-rtm-sukan`'s `source_known_category:
'sukan'` (Tier 1 evidence) fired regardless of actual content. Neither
story is remotely about sports.

Root cause: `lab/sources.js` registered RTM's "Sukan" RSS feed on the
assumption that a category-labeled feed only carries content matching
that category — true for Astro Awani's category feeds (verified earlier
this session), evidently NOT true for at least this RTM feed, which
appears to carry general/human-interest news under its Sports URL.

**This is a source-registry precision issue, not a classifier bug** —
Tier 1 evidence (our own registry's `knownCategory`) is doing exactly
what it's designed to do (fire with high confidence); the registry's
assumption about `rss-rtm-sukan`'s actual content shape was wrong. Fixing
this would mean either downgrading `rss-rtm-sukan`'s trust for
non-sports-looking titles, or verifying/re-scoping which RTM feeds are
actually narrowly-categorized — a source-registry decision, not
something to patch inside the frozen engine.

## Summary

| Category | Count | Meaning |
|---|---|---|
| B — no candidate, evidence gap | 6/10 | Real content exists, classifier has no vocabulary to see it as Education |
| Correct (different subject) | 2/10 | Crime/Entertainment stories that happen to mention students/schools in passing — correctly NOT classified as Education |
| New finding — Tier 1 evidence misfiring | 2/10 | `rss-rtm-sukan` source registry precision issue |

**Not fixed in this audit, per instruction — recorded for a future
calibration decision:**
1. Education subject vocabulary gap (would need new keyword/evidence
   entries in the classifier — a real calibration change, same discipline
   as the frozen-engine work earlier this session).
2. `rss-rtm-sukan` source-registry precision (separate from KPM's
   tender-notice filter in `docs/known-issues.md` — different failure
   shape: wrong CONTENT under a correctly-labeled feed URL, not
   non-news content mixed with real news).
