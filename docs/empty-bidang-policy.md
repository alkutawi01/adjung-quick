# Empty Bidang Policy (2026-08-12)

Status: **DECISION recorded — no code changed yet.** Answers Izzat's
question after the Wheel went live with real data: what do we do about
Bidang that are empty because Malay-language sources rarely have a
dedicated desk for them?

## The problem, with real numbers

After the 618-cluster ingestion (coverage 57% -> 71%):

- **Rich Bidang:** Politik (full 10 slots), Jenayah, Dunia, Bisnes, Sukan.
- **Empty/thin Bidang:** Agama, Sains, Pendidikan, Budaya, Alam Sekitar.

Two different causes, which matter because they need different fixes:

- **Agama** — a source problem. Our only source (JAKIM) is valid RSS in a
  browser but fails from Node, so the Bidang has zero stories.
- **Sains / Pendidikan / Budaya** — a structural reality. Malay portals
  mostly don't run a dedicated desk for these; such stories sit under
  "Nasional" or "Semasa".

## Izzat's proposal, and why it was refined

Izzat asked whether the classification engine should "pull" stories out of
other Bidang — e.g. detect a science story hiding in a Nasional feed and
move it to Sains.

Claude flagged the risk: doing that by title keyword is exactly the trap
the whole calibration arc rejected (the mahkamah/menteri false positives,
`docs/evidence-calibration-report.md`), and it contradicts the locked rule
that Weak evidence must never drive placement
(`docs/evidence-policy-v1-decision.md`).

ChatGPT agreed, and drew the distinction precisely:

```
Case A — RSS category: Nasional, URL: /pendidikan/...
  Two structural signals. Strong. -> Pendidikan, high confidence.

Case B — RSS category: Nasional, title: "Saintis Malaysia cipta teknologi..."
  Keyword only. -> NOT Sains. Could be science politics, industry
  economics, or university PR. -> Unclassified, or a Sains *candidate*.
```

## Decisions

1. **Do NOT pull stories into a Bidang using keywords alone.** (Confidence
   0.98.) This is the same rule already locked for placement generally;
   empty Bidang are not an exception to it.
2. **Allow pulling from general feeds when Strong/Medium evidence exists**
   — e.g. a URL desk path or an RSS category that genuinely says
   `pendidikan`, even if the feed's headline category says `Nasional`.
3. **Add dedicated sources for niche Bidang** rather than inferring them.
   (Confidence 0.9.) Candidates named: JAKIM / state mufti / hukum feeds
   for Agama; MOSTI / planetarium / university feeds for Sains; KPM /
   university feeds for Pendidikan.
4. **Keep empty Bidang in the Wheel — do not HIDE them.** (Confidence
   0.85.) The Wheel is the *edition's identity*, not a summary of what
   happened to arrive today. Real portals keep a Science section on days
   with no science article.
5. **Empty state is an editorial statement, not a failure message.** Not
   "Tiada berita" but something closer to *"Belum ada berita yang memenuhi
   piawaian editorial hari ini."* The difference matters: it reads as
   Adjung choosing, not Adjung failing.

## The larger implication

Adjung Quick still runs on "ingest every RSS feed, then classify". For
niche Bidang, established portals use a different model: **each desk has
its own sources.** So the real fix for empty Bidang is the source
registry, not the classifier — which reinforces the earlier decision to
prefer per-category RSS feeds over adding more keywords.

## Not yet done

- No code changed. The empty-state copy (§5) is UI work; per-Bidang source
  registry (§3) is a `lab/sources.js` + Source Profile change
  (`docs/edition-source-profile-model.md`).
- The JAKIM fetch failure still blocks Agama regardless of policy.
