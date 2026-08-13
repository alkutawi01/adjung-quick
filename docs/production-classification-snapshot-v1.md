# Production Classification Snapshot v1 (2026-08-13)

Status: **Baseline, locked.** The Real Classification Snapshot Test
ChatGPT requested as the final checkpoint before UI-2 — the first time the
frozen classification engine's output against REAL production data (post
Production Evidence Persistence Gap fix, post KPM content filter, post
final source additions) is recorded as a comparison point. Per ChatGPT:
this snapshot exists so any future classification-engine change can be
diffed against "what changed, and why" — not to freeze the data itself
(the underlying stories will age out; this is a record of *behavior*).

Pipeline state this snapshot was taken against: 43 sources (41 fetched
successfully), 865 clusters, 917 rss_items, classified 781/865 (90%) per
edition. Full run log: `docs/production-evidence-persistence-gap.md`,
`docs/known-issues.md`.

Format per story: Story ID (= `story_clusters.id`, the canonical item's
normalized URL) / Title / Source / Evidence, then each edition's
field/confidence/method.

## 1. Edition Architecture confirmation — 5 stories

Purpose: confirm the same story can legitimately resolve to different
fields per edition, and that `ms-MY`'s local/world split behaves as
designed.

**1.1**
Story ID: `www.theguardian.com/world/2026/aug/12/thailand-suspends-gun-licences-teenage-shooter-grandparents-cremated`
Title: "Thailand suspends gun licences as teen shooter and grandparents cremated"
Source: rss-guardian-world
- ms-MY: field=Dunia, confidence=0.4, method=edition_rule
- en-global: field=World, confidence=0.75, method=low_confidence_fallback
- ar-global: field=العالم, confidence=0.75, method=low_confidence_fallback
Editorial notes: the exact case ChatGPT used as an illustrative example
before real data existed — confirmed live. Foreign (Thai) story files as
Dunia in ms-MY (no Malaysia-local angle), World/العالم in the global
editions. `ms-MY`'s lower confidence (0.4 vs 0.75) reflects the
`edition_rule` method being a coarser signal than the global editions'
own `low_confidence_fallback` reasoning for the same story.

**1.2**
Story ID: `www.hmetro.com.my/mutakhir/2026/08/1397270/pm-anwar-ucap-takziah-pemergian-bekas-pm-china-zhu-rongji`
Title: "PM Anwar ucap takziah pemergian bekas PM China Zhu Rongji" (canonical item; cluster also carries a Bernama BM member titled "Dunia : Bekas Perdana Menteri China Zhu Rongji Meninggal Dunia")
Source: rss-metro (canonical), rss-bernama-bm (co-member)
- ms-MY: field=Politik, confidence=0.4, method=default_mapping
- en-global: field=Politics, confidence=0.4, method=default_mapping
- ar-global: field=سياسة, confidence=0.4, method=default_mapping
Editorial notes: a foreign leader's death involving Malaysia's own PM
(Anwar's condolences) — genuinely ambiguous between Politik and Dunia;
0.4 confidence correctly reflects that ambiguity rather than false
certainty. Also a real example of cross-source clustering: the same
story arrived from both Harian Metro (general) and Bernama BM
(title-prefix evidence), confirmed as one cluster.

**1.3**
Story ID: `www.astroawani.com/berita-malaysia/malaysia-rusia-perkukuh-kerjasama-strategik-penyelidikan-perdagangan-dua-hala-zambry`
Title: "Malaysia, Rusia perkukuh kerjasama strategik penyelidikan, perdagangan dua hala — Zambry"
Source: rss-awani-nasional
- ms-MY: field=Malaysia, confidence=0.99, method=geography_fallback
Editorial notes: high-confidence local geography placement — Malaysia's
own bilateral diplomacy, correctly kept out of Dunia.

**1.4**
Story ID: `www.hmetro.com.my/global/asia/2026/08/1397017/murid-naik-lif-288-meter-ke-sekolah`
Title: "Murid naik lif 288 meter ke sekolah"
Source: rss-metro-global
- ms-MY: field=Dunia, confidence=0.98, method=geography_fallback
Editorial notes: Harian Metro's own Global desk feed — Tier 1
(feed-level) geography evidence, high confidence as expected.

**1.5**
Story ID: `www.theguardian.com/australia-news/2026/aug/13/whats-behind-sydney-airports-heavy-delays-and-near-miss-incident`
Title: "What's behind Sydney airport's heavy delays and near-miss incident"
Source: rss-guardian-world
- ms-MY: field=Dunia, confidence=0.75, method=geography_fallback
- en-global: field=World, confidence=0.75
- ar-global: field=العالم, confidence=0.75
Editorial notes: consistent World placement across all three editions —
no political/local angle to diverge on, unlike 1.1/1.2.

## 2. Niche fields — 5 stories

Purpose: confirm the Bidang that were structurally empty before the
Production Evidence Persistence Gap fix (`docs/production-evidence-persistence-gap.md`)
are now genuinely populated by real evidence, not keyword-pulled
(`docs/empty-bidang-policy.md`).

**2.1** Agama — Story ID: `www.utusan.com.my/gaya/2026/06/legasi-pena-santuni-ummah-merentasi-zaman`, Title: "Legasi pena santuni ummah merentasi zaman", Source: rss-utusan-agama — ms-MY: field=Agama, confidence=0.97, method=default_mapping. Evidence: `categories` includes "Agama" (Tier 3, publisher-declared).

**2.2** Pendidikan — Story ID: `www.moe.gov.my/lawatan-kerja-sempena-pembukaan-hari-pertama-persekolahan-di-negeri-kedah`, Title: "Lawatan Kerja Sempena Pembukaan Hari Pertama Persekolahan di Negeri Kedah", Source: rss-kpm — ms-MY: field=Pendidikan, confidence=0.9, method=default_mapping. Editorial notes: post-filter — the excludePatterns fix (`docs/known-issues.md` §1) removed KPM's tender/procurement noise; this is a genuine school-opening news item, not an administrative notice.

**2.3** Sains — Story ID: `www.mosti.gov.my/berita/malaysia-techlympics-2026-zon-selatan-buka-tirai-pertandingan`, Title: "Malaysia Techlympics 2026: Zon Selatan Buka Tirai Pertandingan", Source: rss-mosti — ms-MY: field=Sains, confidence=0.9, method=default_mapping. Evidence: `source_known_category='sains'` (Tier 1, our registry).

**2.4** Teknologi — Story ID: `cms.amanz.my/2026576631`, Title: "Redmi A7 Dijual Di Malaysia Pada Harga RM469", Source: rss-amanz — ms-MY: field=Teknologi, confidence=0.9, method=default_mapping. Evidence: `source_known_category='teknologi'`.

**2.5** Alam Sekitar — Story ID: `www.theguardian.com/global-development/2026/aug/12/african-armyworm-crop-pest-discovery-fungus-science-hope-farmers`, Title: "Halting the march of the African armyworm...", Source: rss-guardian-world — ms-MY: field=Alam Sekitar, confidence=0.7, method=default_mapping. Editorial notes: lower confidence (0.7) is appropriate — a crop-pest/agriculture story sits at the edge between Alam Sekitar and Sains; the engine did not force false certainty.

## 3. Source diversity — 5 stories

Purpose: record evidence provenance across different evidence tiers (feed
category, source-registry knownCategory, title-prefix, URL-path).

**3.1** rss-bernama-bm (title_prefix evidence, per `classification/lib/bernama-prefix.mjs`) — see story 1.2 above; Bernama's items carry no `categories`/`source_known_category`, evidence comes entirely from the "Dunia : ..." title prefix.

**3.2** rss-kpm (Tier 1, source_known_category='pendidikan', post-filter) — see story 2.2 above.

**3.3** rss-mosti (Tier 1, source_known_category='sains') — see story 2.3 above.

**3.4** rss-amanz (Tier 1, source_known_category='teknologi', specialised newsroom not a ministry) — see story 2.4 above.

**3.5** rss-utusan-agama (Tier 3, publisher categories=["Agama"]) — see story 2.1 above.

## 4. Potential risk cases — 5 stories

Purpose: regression samples — low confidence, keyword-driven, general
(non-category) feeds, or foreign-geography edge cases that a future
classification-engine change should be checked against.

**4.1** Low confidence (default_mapping, 0.4) — Story ID: `www.hmetro.com.my/mutakhir/2026/08/1397238/80-peratus-kandungan-ruu-mara-baharu-tumpu-perkukuh-tadbir-urus-asyraf`, Title: "80 peratus kandungan RUU Mara baharu tumpu perkukuh tadbir urus Asyraf", Source: rss-metro (general feed, no knownCategory) — ms-MY: field=Politik, confidence=0.4, method=default_mapping. Risk: general-feed item relying on weak/keyword-tier evidence for a legislative-content story; watch for regression toward false certainty.

**4.2** Low confidence, disaster classification — Story ID: `www.aljazeera.com/video/newsfeed/2026/8/12/deadly-india-landslide-kills-at-least-seven-in-mumbai`, Title: "Deadly India landslide kills at least seven in Mumbai", Source: rss-aljazeera-en — ms-MY: field=Bencana, confidence=0.4, method=default_mapping. Risk: foreign disaster story on a general international feed — correct field, but low confidence is the honest signal, not a false positive.

**4.3** Low confidence, Arabic source — Story ID: `www.bbc.com/arabic/articles/cwyl1wn674ro`, Title: "ماذا نعرف عن زلزال 1992 في مصر ولماذا تأثرت به البلاد" (What do we know about the 1992 Egypt earthquake), Source: rss-bbc-arabic — ms-MY: field=Bencana, confidence=0.4, method=default_mapping. Risk: historical/retrospective disaster coverage, not breaking news — worth checking this doesn't over-trigger Bencana urgency signals in a future ranking change.

**4.4** Known false positive (documented, not fixed) — Story: "PSPN 2026-2030 Pacu Autonomi Strategik Pertahanan Negara" (Kosmo, defence policy) classified Teknologi@0.7. Full detail in `docs/known-issues.md` §2 — kept here as the regression case to check first if Teknologi confidence patterns shift.

**4.5** Cross-edition confidence divergence — see story 1.1 (Thailand gun licences): same story, ms-MY confidence 0.4 vs en-global/ar-global 0.75, different classification_method (`edition_rule` vs `low_confidence_fallback`) despite reaching the "same shape" of placement (Dunia/World/العالم). Risk: any future engine change should preserve this asymmetry deliberately, not accidentally converge or diverge the per-edition confidence values.

## Baseline lock

This snapshot is now the v1 baseline. Per ChatGPT: a future classification
engine or evidence-pipeline change should be diffed against this document
— "what changed, and why" — not treated as ground truth to preserve
unconditionally. Coverage and field distribution at lock time:
ms-MY/en-global/ar-global all 781/865 classified (90%), full breakdown in
the ingestion run recorded in this session's commit history
(`db/classify-production.js --write` output, 2026-08-13).

**UI-2 (Navigation Experience) is unblocked as of this lock.**
