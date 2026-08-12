# ms-MY Edition Re-audit Against Universal Classification

Status: DRAFT. Re-examines `docs/quick-bidang-taxonomy.md`'s 15-Bidang draft
now that `docs/universal-classification-model.md`'s Subject/Geography split
is locked.

## Result: 13 of 15 map cleanly, 2 are not subjects at all

| ms-MY Bidang | Universal Subject | Verdict |
|---|---|---|
| Politik | Politics | ✓ direct match |
| Jenayah | Crime | ✓ direct match |
| Ekonomi | Economy | ✓ direct match |
| Bisnes | Business | ✓ direct match |
| Sukan | Sports | ✓ direct match |
| Alam Sekitar | Environment | ✓ direct match |
| Bencana | Disaster | ✓ direct match |
| Kesihatan | Health | ✓ direct match |
| Pendidikan | Education | ✓ direct match |
| Teknologi | Technology | ✓ direct match |
| Sains | Science | ✓ direct match |
| Budaya | Culture | ✓ direct match |
| Hiburan | Entertainment | ✓ direct match |
| **Malaysia** | — | ✗ not a subject — this **is** the Geography dimension's `Malaysia` value, mis-cast as a Bidang the whole time |
| **Dunia** | — | ✗ not a subject — this **is** the Geography dimension's residual (`World`/other region), mis-cast as a Bidang |

13/15 confirmed as genuine ms-MY edition mappings, near-identical to what was
already drafted — the earlier work wasn't wasted, it correctly identified 13
real subjects. The 2 non-matches (`Malaysia`, `Dunia`) confirm exactly what
`universal-classification-model.md` predicted: they were geography wearing a
Bidang costume.

Two universal subjects have no ms-MY Wheel entry yet: `Religion` (already
flagged as a future candidate, `Agama`) and `Lifestyle` (never drafted for
ms-MY — see open question below).

## Consequence that needs a decision, not a guess

Under the old model, `Malaysia`/`Dunia` served a real function: they were
where a story landed when it had geography but no clear subject — e.g. "Baru
sebulan carum Perkeso, ibu terkejut layak terima pencen arwah anak" (a mother's
surprise SOCSO pension eligibility — human interest, not really Economy
policy, not really any of the 13 subjects).

If `Malaysia`/`Dunia` stop being Wheel entries (per the "Wheel uses Field/
Subject only" lock), stories like that no longer have anywhere to land except
`Unclassified` — a real regression risk: `Unclassified` rate could rise
exactly for the human-interest stories the old residual buckets were quietly
absorbing.

Two ways this might resolve, not deciding between them here:

1. **`Lifestyle` absorbs most of it.** Human-interest, personal-story,
   general-audience content is arguably what `Lifestyle` is *for* — the SOCSO
   pension story, "Warisan Tampok yang makin pupus"-style pieces. If so, `Unclassified` stays low and `Malaysia`/`Dunia` genuinely aren't needed as
   Bidang.
2. **Geography surfaces in the Wheel after all**, contradicting the earlier
   "Wheel uses Field only" lock — e.g. as a secondary dimension the reader can
   still browse, even though it's architecturally Geography not Subject. Not
   recommended without re-opening that lock deliberately.

Flagging for ChatGPT rather than picking one — this changes the shape of what
"Unclassified" means for the ms-MY edition specifically.

## Not yet re-labelled

The 50 ms-MY-source items in `classification/benchmark-labels.json` still
carry their old flat-model labels (including 10 labelled `Malaysia`, 1
labelled `Dunia`). Not touched pending the decision above — relabelling before
that would guess at exactly the open question just raised.
