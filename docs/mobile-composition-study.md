# Mobile-First Visual Composition Study

Status: composition study only, per ChatGPT (director) instruction — no
React, no CSS, no implementation. Three candidates, evaluated against the
same criteria, one recommended as PROPOSAL pending Izzat's approval.
Grounded in what's already real: `state/model.js`'s Active Set contract,
`docs/core-reading-ui-contract.md`, `docs/keyboard-interaction-contract.md`,
and `docs/taxonomy-audit.md`'s 24 canonical Bidang.

Framing question, per ChatGPT: not "how do 10 cards fit on a phone" but
**"how many stories can a reader comfortably hold and choose from on one
screen, given Active Set is working memory, not a feed."** `10` (or
whatever `activeSetCapacity` ends up being) is a config value this study
treats as variable, not a visual target to force-fit.

---

## Shared constraints across all three candidates

- No images (locked product constraint).
- No page scroll at the application-shell level — only bounded regions
  (Active Set list, Brief) may scroll internally (established in Phase 2B).
- Keyboard parity required: whatever mouse/touch does, `↑`/`↓` + `Enter`
  + `Esc` must do identically, per the Keyboard Interaction Contract.
- 24 canonical Bidang (`docs/taxonomy-audit.md` §1) must be navigable —
  none of the three candidates can assume a small, fixed category count.
- Selection ≠ opening Brief (existing two-step keyboard pattern must hold
  on mobile too, even if touch collapses it to one step per contract §9).
- Release/Replacement must read as "the working set stays full," not as
  "the page grows."

---

## Candidate A — Vertical Wheel + Compact Story Stack

```
┌───────────────────────┐
│ Adjung                │
│                       │
│       ◀ BIDANG ▶      │
│         Sains         │
│                       │
│ ───────────────────── │
│                       │
│ Tajuk berita 1        │
│ Tajuk berita 2        │
│ Tajuk berita 3        │
│ Tajuk berita 4        │
│ Tajuk berita 5        │
│                       │
└───────────────────────┘
```

- **Viewport usage:** Bidang selector fixed at top (~15-20% of height),
  story stack fills the rest as a plain scrollable list.
- **Stories comfortably visible:** roughly 5-7 title-only rows without
  scrolling on a typical phone viewport; more with a scroll.
- **24-Bidang wheel behavior:** a single current-Bidang label with
  prev/next arrows (`◀ Sains ▶`) — one Bidang visible at a time, cycling
  through all 24 via repeated taps/arrow-key presses. Simple, but reaching
  Bidang #20 from #1 takes 19 steps with no shortcut.
- **Selection:** tap/arrow-key highlights a row in the stack (list-style,
  no visual boundary distinguishing "this is the bounded Active Set" from
  "this is an infinite feed").
- **Release/Replacement:** a released row disappears and the list
  reflows — visually indistinguishable from "an item was deleted from an
  ordinary list," which risks reading as content shrinking rather than a
  working set staying full.
- **Full-screen Brief:** entered on Enter/tap, standard full-screen
  transition, exits back to the same scroll position.
- **Keyboard parity:** straightforward — `↑`/`↓` move through the stack,
  `←`/`→` cycle Bidang. No structural obstacle.
- **Accessibility:** plain list semantics, easiest to implement
  correctly, but the weakest at communicating "bounded" to assistive
  tech too (a screen reader has no cue this list has a capacity).
- **Page scroll:** the story stack itself needs internal scroll once
  content exceeds the visible rows; shell itself stays fixed.

**Assessment, per ChatGPT's own concern:** simplest to build, closest to
a familiar list mental model — but "mudah kembali menjadi feed" (easily
regresses into being a feed). The core product idea (Active Set as
bounded working memory, not an infinite stream) is not visually
reinforced by anything in this layout — it would only be true in the
data model, invisible to the reader.

---

## Candidate B — Vertical Wheel + Bounded Active Set

```
┌───────────────────────┐
│ Adjung                │
│                       │
│      ┌──────────┐     │
│      │  Sains   │     │
│      └──────────┘     │
│                       │
│ ┌───────────────────┐ │
│ │ Tajuk 1           │ │
│ │ Tajuk 2           │ │
│ │ Tajuk 3           │ │
│ │ Tajuk 4           │ │
│ │ Tajuk 5           │ │
│ └───────────────────┘ │
│                       │
└───────────────────────┘
```

- **Viewport usage:** same rough proportions as A, but the story list
  sits inside a visually distinct container (border/card/panel) — the
  Active Set's boundary is drawn, not implied.
- **Stories comfortably visible:** same as A (5-7 rows) — the visual
  difference is the container, not the density.
- **24-Bidang wheel behavior:** same prev/next cycling as A, but the
  current Bidang is itself rendered as a bounded chip/pill rather than
  bare text — reinforces "this is a selected value from a set," visually
  consistent with the Active Set's own boundary treatment below it.
- **Selection:** highlighting a row inside the bounded container reads as
  "picking from a fixed working set," not "scrolling a feed."
- **Release/Replacement:** a released row disappearing and being replaced
  WITHIN the same visible container communicates "the working set stayed
  full" far more directly than A — the container's edges don't move, only
  its contents change. This is the single biggest advantage of B over A
  for the product's actual thesis.
- **Full-screen Brief:** identical transition to A.
- **Keyboard parity:** identical to A — the bounded container is a visual
  treatment, not a new interaction, so no keyboard changes needed.
- **Accessibility:** the container can carry `role="region"` with an
  `aria-label` like "Active Set (10 stories)" — screen reader users get
  the "bounded" cue for free that A's plain list lacks.
- **Page scroll:** same as A — internal scroll inside the bounded
  container only, if content exceeds it.

**Assessment:** structurally identical to A in every functional respect
(same actions, same keyboard mapping, same data) — the entire difference
is a container boundary. Low implementation cost for a real gain in
communicating the product's actual mental model (working memory, not
feed) to the reader, not just encoding it invisibly in state.

---

## Candidate C — Wheel + Spatial/Radial Active Set

```
          berita
            │
    berita ─┼─ berita
            │
          BIDANG
            │
       berita berita
```

- **Viewport usage:** stories arranged radially/spatially around a
  central Bidang anchor rather than in a linear list.
- **Stories comfortably visible:** capacity-dependent, but radial
  layouts typically max out readably around 6-8 items before spacing
  becomes too tight on a phone-width viewport — potentially forces a
  lower `activeSetCapacity` than list-based candidates, or requires
  a secondary "expand" interaction.
- **24-Bidang wheel behavior:** unclear without a prototype — a spatial
  arrangement built around ONE Bidang doesn't obviously extend to
  browsing/switching among 24 without either a totally separate Bidang
  picker (defeating some of the spatial idea's cohesion) or radial Bidang
  selection too (compounding complexity).
- **Selection:** spatial position mapped to `↑`/`↓`/`←`/`→` is
  significantly more ambiguous than a linear list — which direction is
  "next"? This needs its own interaction study, not a reuse of the
  existing Keyboard Interaction Contract's linear navigation model.
- **Release/Replacement:** visually interesting (a released item's
  position could visibly "open up" and get refilled) but harder to keep
  legible — radial layouts are more prone to visual clutter as items are
  swapped in/out at different positions.
- **Full-screen Brief:** no particular advantage or disadvantage over A/B
  here — Brief is full-screen regardless of what the previous screen
  looked like.
- **Keyboard parity:** the weakest of the three — genuinely unclear how
  `↑`/`↓` (currently LOCKED as list-style navigation, per the Keyboard
  Interaction Contract) would map onto a 2D spatial arrangement without
  either contradicting that lock or requiring new key mappings.
- **Accessibility:** hardest of the three — screen readers and keyboard
  users generally do much better with linear structures; a spatial
  layout would need substantial additional ARIA work to avoid being
  materially worse for non-visual/non-mouse use, which cuts directly
  against Quick's keyboard-first, accessibility-conscious identity
  (§19 of the Core Reading UI Contract).
- **Page scroll:** likely avoidable (fixed spatial canvas), but at the
  cost of the accessibility and keyboard concerns above.

**Assessment, matching ChatGPT's own stated caution:** visually the most
distinctive, but genuinely risky for readability and keyboard navigation
without a working prototype to validate against. Not recommended for v1
without further study — this document doesn't rule it out permanently,
only flags it as needing real prototyping before it could be evaluated
fairly.

---

## Recommendation

**[PROPOSAL, pending Izzat's approval] Candidate B — Vertical Wheel +
Bounded Active Set.**

Reasoning: A and B are functionally and technically identical (same
actions, same keyboard contract, same accessibility floor, same
implementation cost) — B's only difference is drawing the Active Set's
boundary visually, which directly reinforces the product's actual thesis
("Active Set is working memory, not a feed") instead of leaving it purely
as an invisible data-model fact. C is the most visually interesting but
carries real, unresolved risk to keyboard-first navigation and
accessibility — both locked/near-locked product priorities — without a
prototype to de-risk it first.

This recommendation does not resolve the 24-Bidang wheel-cycling cost
noted in both A and B (reaching Bidang #20 from #1 takes many steps) —
that's a real usability question this study surfaces but doesn't solve;
worth flagging to Izzat as a likely next refinement (e.g. a searchable/
jumpable Bidang picker) regardless of which composition candidate is
chosen.

Not locked. Per ChatGPT's instruction, this is a recommendation, not a
decision — implementation should not begin until Izzat approves a
candidate.
