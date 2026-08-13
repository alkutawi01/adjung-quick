# Post-Launch Observations (running log)

Per ChatGPT's explicit post-launch mindset shift: before launch, the
project moved *find bug → fix → add system*. After launch, it moves
*observe → gather evidence → decide*. This log is where evidence
accumulates — not a place to fix things from directly. An entry here
becomes a decision only when reviewed deliberately, not reflexively.

Format per entry:

```
Date:
Area:
Observation:
Impact:
Classification:
Action:
```

---

**Date:** 2026-08-13
**Area:** Classification
**Observation:** Bencana went from 0 to 8 stories, Alam Sekitar 0 to 4,
Kesihatan 0 to 1, in `ms-MY`, after the Disaster/Health/Environment
vocabulary + confidence-gate calibration
(`docs/post-launch-classification-calibration-v1.md`).
**Impact:** Coverage increase — real, verified live.
**Classification:** Calibration success.
**Action:** Observe. Watch for false-positive drift (the disclosed
"kemarau emas" idiom risk) over the next few days before treating this
as fully settled.

---

**Date:** 2026-08-13
**Area:** Infrastructure
**Observation:** Supabase Free Plan has zero backup capability of any
kind (confirmed directly in dashboard, not assumed).
**Impact:** No restore path exists beyond the local, partial JSON
snapshot.
**Classification:** Real operational risk, pre-existing (not caused by
launch), now precisely quantified.
**Action:** Decision proposed (`docs/production-safety-decision-proposal-v1.md`),
awaiting Izzat's review. No infrastructure change made.

---

**Date:** 2026-08-13
**Area:** Frontend
**Observation:** Desktop layout was stretching edge-to-edge with no
max-width; Izzat flagged wanting a centered reading column like
amanz.my.
**Impact:** Visual/UX only, no data risk.
**Classification:** Enhancement.
**Action:** Fixed (640px centered column ≥720px viewport), verified
live, deployed.

---

**Date:** 2026-08-13
**Area:** Classification
**Observation:** Izzat spotted a real story ("Konflik Asia Barat: Trump
dakwa AS akan terus kekalkan penguasaan Selat Hormuz" — a geopolitics
story) misclassified as Kesihatan in `ms-MY`. Root cause: `rss-astro-awani`
stores `description` as raw, uncleaned HTML; an unrelated `<img
alt="...vaccine flexibility...">` caption (a different photo, a
different event entirely) got matched by the `Health` content-rule
phrase `vaccine` added in this session's earlier calibration.
**Impact:** One false-positive placement, live, user-facing — the exact
"kemarau emas" class of risk disclosed (but not this specific shape) in
`docs/post-launch-classification-calibration-v1.md` §5.
**Classification:** Bug technical (A) — HTML markup was never stripped
before Tier 5 content matching, a pre-existing gap this calibration's
new phrases (vaccine, wabak, outbreak, etc.) happened to expose.
**Action:** Fixed — `classification/lib/content-rules.mjs` now strips
all HTML tags/attributes before matching. Verified the exact story no
longer misclassifies. Re-ran `classify-production.js --write`; Kesihatan
in `ms-MY` correctly returned to 0 (that story was never really Health —
this isn't a new coverage regression, it's the false positive being
removed). No other test suite regressions.

---

## Day 1 after launch — baseline (2026-08-13, immediately post-calibration)

```
Clusters: 865
Sources: 43
rss_items: 917
Placements: 867

ms-MY classified: 709/725 (98%)
  Fields with content: 14 of 15
  Empty fields: Sains has only 5 (single-source risk, not zero)

en-global classified: 53/91 (58%)
ar-global classified: 22/51 (43%)
```

Full per-field breakdown: `docs/post-launch-stability-checkpoint-v1.md`.
Use this as Day 1 — future entries should note Day N and diff against
this, not restate it in full.
