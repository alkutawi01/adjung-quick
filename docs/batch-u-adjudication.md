# Batch U Adjudication — Izzat, 2026-08-12

Source: `generate-batch-u.mjs` output, 14 items reviewed (3 url_path-only,
11 rss_category-only — corpus rotated between generation and review, so
exact item text may differ slightly from earlier runs; counts match the
live snapshot Izzat actually reviewed).

## Verdict: MIXED — real errors found (first batch to surface them)

Unlike Batch A (20/20 correct) and Batch M (19/19 correct), Batch U
surfaces genuine misclassifications. This is itself the expected,
valuable finding — Batch U's purpose
(`docs/evidence-calibration-freeze.md`) was specifically "can a single
Medium-class signal stand on its own?", and the answer for this sample
is: not reliably.

### URL-path-only (3 reviewed)

| # | Story | Engine said | Izzat said | Verdict |
|---|---|---|---|---|
| A1 | Ringgit ditutup mengukuh berbanding dolar AS | Business | **Ekonomi** | publisher_taxonomy_mismatch |
| A2 | Foxconn untung naik 35% (AI demand) | Economy | **Bisnes** | publisher_taxonomy_mismatch |
| A3 | Canadian airline cancels flight (child refuses mask) | Business | **Dunia** (not business at all) | publisher_taxonomy_mismatch |

All 3 of 3 URL-path-only samples were wrong. A1/A2 are notably a mirror-
image error — the engine's Business/Economy assignment was exactly
inverted relative to Izzat's ms-MY distinction (**Ekonomi** = market/
currency/macro indicators; **Bisnes** = company/operations/organizational
performance). A3 shows a deeper problem: the publisher's `/business/`
URL desk doesn't necessarily reflect the story's actual subject at all —
a customer-service/travel incident, not a business story.

Izzat's explicit reminder: his Ekonomi/Bisnes/Dunia answers are in
**ms-MY edition terms specifically** — "versi bahasa melayu tak sama
dengan versi english dan arab. setiap versi ada pembahagian kategori
masing2." Not claimed as universal/cross-edition truth.

### rss_category-only (2 flagged of 11 reviewed)

| # | Story | Engine said | Izzat said | Verdict |
|---|---|---|---|---|
| B6 | Guardian: man with dementia told to leave Sweden | Politics | "boleh dipertimbangkan walaupun kurang tepat" | acceptable with reservation, not a clean error |
| B9 | Guardian: drone footage of stingrays | Environment | **Teknologi** | publisher_taxonomy_mismatch |

The other 9 rss_category-only items were not flagged as errors (implicit
pass, not individually re-confirmed one-by-one in this session — see
note below).

## Error category introduced: `publisher_taxonomy_mismatch`

Per ChatGPT: not the same failure mode as Weak/content-rule false
positives (`docs/sesi3a2-evidence-quality-audit.md`'s menteri/mahkamah
pattern). This is structural evidence (URL desk, RSS category) that is
internally consistent and genuinely reflects *the publisher's own*
editorial categorization — it's just not the same categorization Adjung
wants for its own edition. **Strong-looking evidence from a publisher is
only strong evidence about how that publisher sees the story, not
automatically strong evidence for Adjung's placement.**

## Izzat's broader framing (relayed, then challenged by ChatGPT)

Izzat: *"mcm mustahil utk kita cari ketepatan 99% melainkan guna AI...
harapnya enjin ranking kita mampu letakkan berita2 yg salah kategori mcm
ni di belakang, biar kemungkinan utk user sampai ke berita2 tu jadi
sangat tipis."* (Near-impossible to hit 99% accuracy without AI; hoping
the ranking engine pushes misclassified stories down so readers rarely
reach them.)

ChatGPT's response (see `docs/evidence-policy-v1.md` for the resulting
proposal): agrees ranking should be a safety net, but pushes back on
"impossible without AI" — the core problem isn't language understanding,
it's **editorial ontology** (Guardian says Politics, Adjung wants
Environment; ms-MY wants Ekonomi, English wants Business — a
disagreement about categorization, not comprehension). An LLM would hit
the same disagreement. What actually helps: more source feeds,
edition-specific rules, evidence weighting, and a ranking feedback loop —
not necessarily "AI" as a category.

## Status

Batch U: **ADJUDICATED — 4 confirmed publisher_taxonomy_mismatch errors,
1 accepted-with-reservation, remainder implicit pass.** First batch to
surface real errors, informing `docs/evidence-policy-v1.md`'s proposal
that single-mechanism Medium evidence should be treated as a *candidate*
generator, not a placement source, with ranking weight tied to evidence
quality rather than treated as a separate fix-it-later concern. Batch
Medium remains pending per `docs/evidence-calibration-freeze.md`.
