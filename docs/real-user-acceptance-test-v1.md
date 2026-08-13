# Real User Acceptance Test v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[x] Closed` (this pass — re-run before actual launch)

Per ChatGPT: a naive first-time-reader walkthrough, run manually
against the actual local dev server pointed at the real (shared)
Supabase project, distinct from every targeted/developer verification
done earlier this session. **Actually executed, not just documented.**

## Data Safety confirmation (per ChatGPT: WAJIB)

- [x] No `truncate` run
- [x] No migration run
- [x] No `db/ingest-production.js` run
- [x] No `db/classify-production.js --write` run
- [x] UAT was read-only — every action was a click/keypress in the UI,
      which only ever triggers `SELECT` queries (`productionAdapter.js`
      never writes). Confirmed no unexpected network errors beyond
      known, already-diagnosed stale HMR websocket noise (unrelated to
      the app, present before this session started).

## 1. Edition Journey — `ms-MY`

| Step | Result |
|---|---|
| Open app | ✅ Loads, cold-starts on Politik, 10 cards |
| Select Politik | ✅ 10 real cards (via `editorial_v1` pilot) |
| Select Agama | ✅ 10 real cards (via `legacy` — Agama not in the ranking pilot) |
| Select an empty field (Bencana) | ✅ 0 cards, editorial message: "Belum ada berita yang memenuhi piawaian editorial hari ini." — **not** treated as broken, Wheel still shows all 14 fields |

## 2. Edition Journey — `en-global`

| Check | Result |
|---|---|
| No Malay content leaks in | ✅ Confirmed — checked for common Malay words (dan/yang/dengan/untuk) across all 5 visible cards, none found |
| UI is English | ✅ `lang="en"`, `dir="ltr"` |
| Global categories, not Malaysian | ✅ Field showed "Politics" (not "Politik"), sources were Guardian World / Al Jazeera English |

## 3. Edition Journey — `ar-global`

| Check | Result |
|---|---|
| RTL | ✅ `dir="rtl"` confirmed on root |
| Arabic representation | ✅ Cards and Brief both showed real Arabic text |
| Navigation not broken | ✅ Wheel showed Arabic taxonomy (`سياسة` etc.), 10 real cards |

## 4. Active Set Behaviour

| Scenario | Result |
|---|---|
| Select field → open story → Brief matches card | ✅ Confirmed in `ar-global` — Brief title matched the card's title exactly, back button correctly Arabic ("رجوع →") |
| Switch edition away and back (`ar-global` → `ms-MY`) | ✅ Politik returned with 10 slots, correct `dir="ltr"`, no residual RTL/state leakage |

Swipe/release specifically was already verified earlier this session
under both `legacy` and `editorial_v1` (`docs/ui-2-closure-report.md`
Bug 3, `docs/editorial-ranking-activation-policy-v1.md` §6) — not
re-run here to avoid an unnecessary write-adjacent action during a
read-only UAT pass, though releasing a card is itself read-only (state
change only, no DB write).

## 5. Failure Experience

| Scenario | Result / Status |
|---|---|
| Empty field (Bencana, Sains) | ✅ Verified: editorial-standard message, not "Error" |
| Source failure (one RSS feed down) | **Not tested this pass** — would require simulating a live source outage, which isn't safe to do against the shared production Supabase without deliberately breaking ingestion. Recorded as an open gap, not silently assumed fine. |
| Slow loading / loading state | **Not tested this pass** — the app currently has no explicit loading-state UI observed during normal use (page loads fast enough locally that this wasn't visibly exercised). Worth a dedicated check under throttled network conditions before launch. |

## 6. Launch Blockers — from the user's perspective

**Blockers (none observed this pass):**
- ❌ Wrong-edition content — not observed
- ❌ Arabic showing Malay — not observed
- ❌ Active Set empty despite real candidates existing — not observed
  (Bencana/Sains are genuinely empty, not incorrectly empty)
- ❌ Crash — not observed

**Acceptable at launch (confirmed, not blockers):**
- ✅ Niche fields (Bencana, Sains) empty — expected, honest empty state
- ✅ Coverage uneven across fields — expected, already documented
- ✅ Editorial Value Dimension incomplete — expected, already documented

## What this pass did NOT cover (honest gaps, not closed)

- Source failure / degraded network experience (§5)
- Loading states under real latency
- Mobile viewport (this pass used desktop dimensions only)
- Multi-session / concurrent-reader behavior (single browser session tested)

## Next

Per ChatGPT: after UAT, do NOT launch immediately — one major decision
remains: **the shared Supabase dev/production risk**
(`docs/deployment-readiness-v1.md` §1's biggest finding). A
development/test environment genuinely separate from production is
"almost certainly needed" before real launch, but not decided or built
here — this UAT pass gives the full picture needed to make that decision
next, not a launch go-ahead by itself.
