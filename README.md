# Adjung Quick — Editorial Ranking Laboratory

Not the production app. This is the Phase A "prove the engine before building
the UI" step from the 2026-08-11 design session (Claude + ChatGPT as project
director, with Grok/Gemini/DeepSeek consulted on specific failure modes).

Adjung Quick itself is a **keyboard-first, mobile-first news reader** for the
end reader — RSS-based, three languages (Melayu/Arab/English) selectable
simultaneously into ONE mixed-language Active Set (no per-language Editions),
a 10-slot (baseline, not final) **Active Set** that only changes when the
reader releases a slot or explicitly switches language (atomic transition).
Full product philosophy lives in the ChatGPT "Adjung Quick" project (chats:
Overview, Ingatan, Pitching-corrected) — this repo implements the backend
ranking/dedup/selection engine AND the platform-agnostic state/action
contract, both tested against real data, so neither is guessed at when the
real UI gets built.

Two layers so far:
- **`lab/`** — the Editorial Ranking Laboratory: RSS → dedup → score → rank → Active Set.
- **`state/`** — the Architecture Skeleton: the state shape, action vocabulary,
  and transition rules that keyboard, touch, and mouse UI will ALL dispatch
  into identically. No UI exists yet — this only proves the contract holds.

## What's actually proven here (run it yourself)

```bash
npm test              # everything: engine + state regression (26 assertions)
npm run test:engine    # lab/ only
npm run test:state     # state/ only
npm run lab            # full pipeline: fetch -> dedup -> score -> rank -> Active Set
npm run lab:match      # Tier-1 story-match candidates as a labelled CSV
npm run lab:control    # Pin/Prioritize/Remove correctness demo, with assertions
```

`lab:control` is the one worth running first — it proves, against real RSS
data, that:
- the Active Set never changes except when a slot is explicitly released
- a Pin issued while the set is full waits in a FIFO queue and never evicts
  an existing slot
- Prioritize boosts ranking without guaranteeing a slot
- Remove excludes an item from selection without deleting the underlying
  RSS report

## Pipeline

```
RSS (9 sources: 4 ms, 3 en, 2 ar)
  -> parse + sanitise                 (rss.js)
  -> Tier-0 dedup (exact GUID/URL)    (engine.js: dedupeAndCluster)
  -> Tier-1 dedup (title-token        (match.js: tokenize/jaccardSimilarity,
     Jaccard, threshold 0.25,          integrated into dedupeAndCluster —
     representative-only matching,     never transitive, never all-pairs)
     48h window)
  -> topic classification             (classify.js — keyword rules, zero AI)
  -> Editorial Score                  (engine.js: scoreCluster —
     (freshness + cross-source         freshness + cross-source + prominence)
     + source prominence)
  -> Editorial Control                (control.js — Pin/Prioritize/Remove)
  -> Active Set Selector              (engine.js: selectActiveSetWithControl —
     (coverage-first, ranked           STATEFUL: takes existingActiveSet,
     fallback, incremental)            only fills open slots)
```

## Hard constraints (do not violate when extending this)

- **Zero AI.** No LLM/NER/embedding/model-inference calls anywhere in this
  pipeline. Everything here is regex, keyword lists, and arithmetic. If a
  future feature seems to need AI, it doesn't belong in this engine — flag
  it to Izzat instead of adding it quietly.
- **Active Set is reader-owned.** Nothing in this codebase should ever mutate
  an existing Active Set slot except an explicit release. `selectActiveSetWithControl`
  enforces this structurally (it takes `existingActiveSet` and only touches
  open slots) — don't add a code path that recomputes the whole set.
- **Pin never evicts.** It waits in `control.pinPendingQueue()`. If you're
  tempted to force-admit a pin by kicking out a slot, stop — that was an
  explicitly rejected design (see Master Spec X-003 equivalent for Quick's
  ranking engine).
- **MinHash/LSH is deferred, not banned.** Tier-1 (deterministic title
  similarity) was proven sufficient against real RSS data
  (`lab/story-match-candidates.csv` — 100% observed precision at threshold
  ≥0.25 on an 18-item sample, labelled by Claude, not yet human-verified).
  Re-open this only if production data shows Tier-1's recall is actually
  inadequate — don't build MinHash pre-emptively.

## Architecture Skeleton (`state/`)

```
actions.js        — the ONLY vocabulary keyboard/touch/mouse may speak
                     (SELECT_TOPIC, SELECT_STORY, OPEN_BRIEF, CLOSE_BRIEF,
                     RELEASE_STORY, SWITCH_LANGUAGE, PIN/PRIORITIZE/REMOVE_STORY)
model.js           — the single state shape desktop AND mobile render from
representation.js  — Representation Selector: picks ONE language report per
                     story cluster for the current language context (Type 1:
                     swap: same story, different language. Type 2: replace:
                     story unavailable in the new language context)
reducer.js         — reduce(state, action, context) -> newState. Enforces:
                     only RELEASE_STORY and SWITCH_LANGUAGE may change
                     activeSet; everything else (topic/story select, brief
                     open/close, editorial control) provably doesn't.
test.js            — 16 assertions on real RSS proving the above.
```

## Vertical Slice (`vertical-slice.js`)

```bash
node vertical-slice.js
```

An interactive terminal harness (NOT a real UI — no framework, no visual
design) proving the two Phase 1 exit scenarios ChatGPT specified end-to-end
against real RSS:
1. select → open Brief → close → release → replacement fills the vacated slot
2. switch language → Active Set changes atomically (Type 1 swap / Type 2 replace)

**Bug found and fixed by actually running this** (2026-08-11): `RELEASE_STORY`
was letting the just-released story — usually still the top-ranked candidate
— immediately re-fill the slot it just vacated, making release a silent
no-op. Fixed in `reducer.js` (excluded for that selection pass) and locked in
by `state/test.js` TEST 6c. This is exactly why ChatGPT insisted on building
a vertical slice before more architecture — the 15 assertions alone did not
catch it because they never released and then inspected *which* story filled
the resulting slot.

Language mechanism (approved by Izzat 2026-08-11, after Grok found this as
the #1 risk in the phase plan): one Active Set, mixed languages. When a story
exists in more than one language, `representation.js` picks one using
deterministic source-coverage metadata (Malaysia→ms, international→en,
Middle East→ar as a *tiebreak*, never overriding Editorial Score outright —
Al Jazeera Arabic reporting the Colombia earthquake is real RSS evidence
that "source language implies story scope" is false). Switching language is
one atomic transition (`SWITCH_LANGUAGE`), not N releases — no per-language
Active Set is ever persisted.

## Known gaps / things Izzat still needs to supply

- **Bernama's RSS feed is dead** (every guessed URL 404s). Swapped to Astro
  Awani (`sources.js`) as a working substitute — confirm or replace.
- **Topic keyword list** (`classify.js`) was filled in from general knowledge
  of Malaysian politics/football, not verified by Izzat. Expect
  misclassifications until he reviews/extends it.
- **English/Arabic RSS sources** (`sources.js`) are Claude's picks (BBC,
  Al Jazeera, Guardian), not vetted against what Izzat actually wants Quick
  to cover.
- **`story-match-candidates.csv` labels are Claude's, not Izzat's.** The
  100% precision number is real but small-sample and AI-labelled — treat the
  0.25 threshold as a starting point, not a proven constant.
