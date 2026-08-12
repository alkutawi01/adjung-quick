# Batch Medium Adjudication — Izzat, 2026-08-12

Source: `generate-batch-medium.mjs` output. url_path-only (3) and
rss_category-only (13) groups heavily overlapped with Batch U's already-
adjudicated items (same live corpus snapshot) — those verdicts carry
forward from `docs/batch-u-adjudication.md` rather than being re-asked:
Ringgit/Foxconn/Airline (3x `publisher_taxonomy_mismatch`), drone
footage (`publisher_taxonomy_mismatch`), Sweden dementia (accepted with
reservation), remainder implicit pass.

The genuinely new population — never tested before — was the
**mixed-medium group: 14 items where two independent Medium-class
mechanisms (url_segment + rss_category) agree, with no Strong or Weak
evidence involved.** This is what Batch Medium actually exists to test:
"Are two independent Medium signals together closer to Strong evidence,
or still just publisher-taxonomy agreement?"

## Verdict: ALL 14 CONFIRMED CORRECT

Izzat's exact words: **"Ya. saya tak jumpa apa2 yg salah."** — no errors
found across Entertainment, Sports (x5), Environment (x2), Business (x2),
Economy (x3), Science, Politics.

## What this confirms

Per Batch Medium's purpose (`docs/evidence-calibration-freeze.md` —
"Medium evidence composition: do two independent Medium signals together
behave close to Strong?"): **YES, confirmed for this sample — 0 errors,
matching Batch M's multi-mechanism-agreement result rather than Batch
U's single-mechanism error rate.**

This is the key differentiator Evidence Policy v1 needs:
`url_segment` alone or `rss_category` alone → unreliable (Batch U: 4
errors across 6 flagged items). `url_segment` + `rss_category` agreeing
→ reliable (Batch M: 19/19, Batch Medium: 14/14, combined 33/33 across
both agreement-tested batches).

## Final calibration status — all four batches complete

| Batch | Question | Result |
|---|---|---|
| A | Weak subject + strong geography → geography fallback for ms-MY? | ✅ 20/20 confirmed |
| M | Multi-mechanism agreement trustworthy? | ✅ 19/19 confirmed |
| U | Single Medium mechanism trustworthy alone? | ⚠️ 4 `publisher_taxonomy_mismatch` errors out of 6 flagged items |
| Medium | Two independent Medium mechanisms agreeing ≈ trustworthy? | ✅ 14/14 confirmed |

Per `docs/evidence-calibration-freeze.md`: all four batches are now
adjudicated. Next per the freeze document's own sequencing: fold these
into a locked Evidence Policy decision — see `docs/evidence-policy-v1.md`
for the proposal these results confirm.
