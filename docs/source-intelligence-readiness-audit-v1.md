# Source Intelligence Readiness Audit v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: not a fix — a source health map. Answers "how far can we
trust the SHAPE of signal from this source?", separate from the
pipeline layer that already exists:

```
RSS Source
    ↓
Ingestion
    ↓
Evidence
    ↓
Classification
    ↓
Ranking
```

Source Intelligence is the missing layer underneath all of it — the RTM
mismatch findings (`docs/known-issues.md` §3) showed this isn't a
one-off, it's a pattern worth mapping across the whole registry once,
not rediscovering per-field.

**No source is disabled or reconfigured by this document.** Purely a
map of what's confirmed, what's suspected, and what's genuinely unknown.

## Audit table (all 43 registered sources)

| Source | Registered Type | Expected Precision | Actual Findings | Action |
|---|---|---|---|---|
| rss-rtm-sukan | specialised (sukan) | narrow (sports only) | **CONFIRMED mismatch** — non-sports content (car-crash death, financial aid) classified Sports@0.9 (`docs/niche-field-coverage-audit.md`) | review |
| rss-rtm-ekonomi | specialised (ekonomi) | narrow (economy only) | **CONFIRMED mismatch** — disaster story (fatal storm) classified Economy@0.9 (`docs/known-issues.md` §3) | review |
| rss-rtm-nasional | specialised (malaysia) | narrow | same feed family as the 2 confirmed mismatches above — not yet directly audited | review (priority — same family as confirmed issues) |
| rss-rtm-dunia | specialised (dunia) | narrow | same feed family — not yet directly audited | review (priority) |
| rss-rtm-jenayah | specialised (jenayah) | narrow | same feed family — not yet directly audited | review (priority) |
| rss-rtm-hiburan | specialised (hiburan) | narrow | same feed family — not yet directly audited | review (priority) |
| rss-kpm | authority_niche (pendidikan) | narrow, but mixed with admin notices | **CONFIRMED mixed content** — 37.5% tender/procurement notices, already filtered (`docs/known-issues.md` §1) | monitor (fix already applied, watch for recurrence) |
| rss-utusan-agama | specialised (agama) | narrow | Verified precise — real religious content, high confidence (`docs/production-classification-acceptance-test.md` sample) | keep |
| rss-ikim | authority_niche (agama) | narrow | Verified precise — real religious/values content (manual review, `docs/editorial-ranking-shadow-evaluation-v1.md`) | keep |
| rss-mosti | authority_niche (sains) | narrow | Verified precise — real science content (`docs/production-classification-acceptance-test.md` sample) | keep |
| rss-amanz | specialised (teknologi) | narrow | Verified precise — real tech/product content, though see `docs/editorial-value-dimension-discovery.md` for a separate editorial-value (not precision) question about gadget churn | keep |
| rss-jaipp | authority_niche (agama) | narrow | Verified precise — real programme/event content (manual review) | keep |
| rss-jakim-berita | authority_niche (agama) | narrow | Not fetchable — `status: failed_tls`, diagnosed as a real server misconfiguration (missing intermediate cert), not a code bug | keep disabled (already short-circuited, not a content issue) |
| rss-jakim-kenyataan | authority_niche (agama) | narrow | Same as above | keep disabled |
| rss-metro-bisnes | specialised (bisnes) | narrow | Not yet directly audited | keep (unaudited) |
| rss-metro-arena | specialised (sukan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-metro-global | specialised (dunia) | narrow | Not yet directly audited | keep (unaudited) |
| rss-metro-rap | specialised (hiburan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-utusan-ekonomi | specialised (ekonomi) | narrow | Not yet directly audited | keep (unaudited) |
| rss-utusan-sukan | specialised (sukan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-utusan-politik | specialised (politik) | narrow | Sampled repeatedly during Ranking Engine benchmarks — no mismatch observed (`docs/ranking-engine-benchmark-v1.md`, `v2.md`) | keep |
| rss-kosmo-hiburan | specialised (hiburan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-politik | specialised (politik) | narrow | Sampled repeatedly during Ranking Engine benchmarks — no mismatch observed | keep |
| rss-awani-nasional | specialised (malaysia) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-bisnes | specialised (bisnes) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-sukan | specialised (sukan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-hiburan | specialised (hiburan) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-gayahidup | specialised (gaya hidup) | narrow | Not yet directly audited | keep (unaudited) |
| rss-awani-dunia | specialised (dunia) | narrow | Sampled during coverage audit — real, on-topic world-news content found (`docs/niche-field-coverage-audit.md`) | keep |
| rss-kosmo | general | mixed (expected) | General feed — mixed content is the design, not a defect | keep |
| rss-utusan | general | mixed (expected) | Sampled repeatedly across sessions — real news content | keep |
| rss-metro | general | mixed (expected) | Sampled repeatedly across sessions — real news content | keep |
| rss-bernama-en | general | mixed (expected); category via title-prefix, not source label | Verified precise via a distinct evidence path (`classification/lib/bernama-prefix.mjs`) | keep |
| rss-bernama-bm | general | mixed (expected); category via title-prefix | Verified precise via title-prefix evidence | keep |
| rss-astro-awani | general | mixed (expected) | Sampled repeatedly — real news content | keep |
| rss-bbc-world | general | mixed (expected) | Not yet directly audited | keep (unaudited) |
| rss-aljazeera-en | general | mixed (expected) | Not yet directly audited | keep (unaudited) |
| rss-guardian-world | general | mixed (expected) | Sampled during coverage audit — real world-news content found | keep |
| rss-bbc-arabic | general | mixed (expected) | Not yet directly audited | keep (unaudited) |
| rss-aljazeera-ar | general | mixed (expected) | Sampled during en/ar edition verification — real Arabic content confirmed | keep |
| rss-utusanborneo-sabah | general | mixed (expected) | Added 2026-08-13, verified live (HTTP 200, real content) at add-time, not yet content-sampled since | keep (unaudited beyond initial add-time check) |
| rss-utusanborneo-sarawak | general | mixed (expected) | Same as above | keep (unaudited beyond initial add-time check) |
| rss-beritaharian | general | mixed (expected) | Same as above | keep (unaudited beyond initial add-time check) |

## Summary

| Action | Count | Meaning |
|---|---|---|
| review (confirmed mismatch) | 2 | rss-rtm-sukan, rss-rtm-ekonomi — real, verified precision failures |
| review (same-family priority) | 4 | Other RTM category feeds — untested, but share the confirmed-mismatch feeds' registration pattern |
| monitor | 1 | rss-kpm — already fixed, watching for recurrence |
| keep disabled | 2 | JAKIM feeds — TLS issue, not a content issue |
| keep (verified precise) | 13 | Directly sampled at some point this session, no mismatch found |
| keep (unaudited) | 21 | Never directly sampled — not flagged, but genuinely unknown, not "confirmed fine" |

**Honest framing, per the audit's own purpose**: "keep (unaudited)" is
the majority category (21/43) — this document maps what's KNOWN, not a
claim that everything else is verified safe. The 4 RTM feeds flagged
"review (same-family priority)" are the highest-value next audit target,
since 2 of their 6 siblings already showed the exact same failure shape.

## Next

Per ChatGPT's own caution against building a "museum of issues": this
document does not by itself trigger new work. It exists so a future
audit of the flagged sources (especially the 4 same-family RTM feeds)
has a starting point, and so "keep (unaudited)" sources aren't mistaken
for "verified fine" later.
