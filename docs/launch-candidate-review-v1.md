# Launch Candidate Review v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` → **DECIDED 2026-08-13** `[x] Implementation pending` `[ ] Closed`

## Izzat's decision: Option A — Launch with accepted risks

Restore rehearsal, monitoring, and deployment rollback (beyond ranking)
are accepted as known, open gaps to close AFTER launch, not blockers to
launch itself. Not a decision that these gaps don't matter — a decision
about sequencing, made explicitly rather than by default.

Per ChatGPT: the final checkpoint before an actual launch decision —
synthesizes everything from this session's readiness work
(`docs/launch-readiness-gate-v1.md`, `docs/production-operations-readiness-v1.md`,
`docs/deployment-readiness-v1.md`, `docs/production-environment-separation-plan-v1.md`,
`docs/staging-environment-setup-plan-v1.md`, `docs/real-user-acceptance-test-v1.md`)
into one place. **Does not decide to launch** — presents the real
picture so Izzat can.

## 1. What's genuinely Ready

- Edition architecture (independent taxonomies, locale authority,
  representation eligibility) — verified live, regression-tested
- Active Set (Stable Spatial Slots, swipe/release) — verified live
- Ranking pilot (`ms-MY.Politik` on `editorial_v1`) — verified live,
  reversible via config flag, no data migration risk
- RTL (Arabic edition)
- i18n (UI chrome follows active edition's locale)
- Production write guard — verified live, closes a real accidental-write
  risk across every script that touches the shared database
- Real User Acceptance Test passed — zero launch blockers observed in a
  naive first-time-reader walkthrough

## 2. What's Conditional (not blocking, but real)

- **Niche field coverage** — Bencana/Kesihatan/Alam Sekitar have zero
  classified stories; Sains/Pendidikan are single-source. Reason: honest
  empty state, not broken routing — the empty-Bidang design already
  handles this gracefully, and a reader seeing "belum ada berita" is not
  the same failure class as a reader seeing wrong/broken content.
- **Source precision** — 21/43 sources never directly audited; 2
  confirmed RTM feed mismatches, 4 more in the same family flagged for
  review.
- **Editorial Value Dimension** — status: backlog. Not a technical
  blocker — a design gap not yet defined, deliberately deferred rather
  than rushed.
- **Local snapshot rehearsal** (not full staging) — real, versioned, but
  explicitly not a substitute for live-database testing.

## 3. What's genuinely NOT Ready — the real question for each

- **Restore rehearsal** — has a backup ever been proven restorable? No.
  If the production DB breaks, can it actually be recovered? Unverified.
- **Monitoring** — is there a real alert today? No — design exists
  (`docs/production-operations-readiness-v1.md` §1), tooling doesn't.
  Every number in every document this session came from a manually-run
  script, not an automatic system.
- **Deployment rollback** — can a bad deploy actually be reverted? The
  ranking flag can (verified). Schema migrations and UI deploys have no
  equally-verified path.

## 4. True Launch Blockers (potential, listed honestly)

| Item | Status | Real question |
|---|---|---|
| Restore rehearsal | Unproven | If production DB breaks, can it be recovered? |
| Monitoring | Design only | Would anyone know if something failed, without manually checking? |
| Deployment rollback | Partial (ranking only) | Can a bad deploy actually be reverted? |

## 5. Launch Decision Matrix

| Item | Status | Suggested decision |
|---|---|---|
| Edition architecture | Ready | Launch |
| Active Set | Ready | Launch |
| Ranking pilot (Politik only) | Ready | Launch |
| RTL / i18n | Ready | Launch |
| Production write guard | Ready | Launch |
| Niche field coverage | Conditional | Accept risk (honest empty state already handles this) |
| Source precision | Conditional | Accept risk (calibration backlog, not urgent) |
| Editorial Value Dimension | Conditional (backlog) | Accept risk (not technical, deliberately deferred) |
| Local snapshot staging | Conditional | Accept risk (real improvement over nothing, not equivalent to full staging) |
| Full staging | Not Ready | Accept risk (deferred by Izzat's own explicit decision until real traffic) |
| **Restore rehearsal** | **Gap** | **Decision needed** |
| **Monitoring** | **Gap** | **Decision needed** |
| **Deployment rollback (non-ranking)** | **Gap** | **Decision needed** |

## 6. Recommendation

**Not "launch."** Per ChatGPT's explicit instruction: proceed to a final
launch decision only after resolving (or consciously accepting the risk
on) the three genuine gaps above:

1. Restore rehearsal — at minimum, verify ONE real backup/restore cycle
   works before trusting the database with real reader traffic.
2. Monitoring — at minimum, a way to notice a real failure without
   someone manually running a script to check.
3. Deployment rollback — at minimum, confirm what actually happens if a
   bad frontend deploy or schema change needs to be undone.

## What NOT to do now (per ChatGPT, explicit)

Do not reopen the classifier, ranking formula, or taxonomy — this
project has already been through extensive, disciplined calibration
work this session. **The largest risk right now is scope creep before
launch**, not any remaining technical gap in those already-stabilized
layers.

## Izzat's decision — three options

**A. Launch with accepted risks** — proceed now, treating restore
rehearsal/monitoring/rollback as known, accepted gaps to close after
launch (real traffic would make some of this easier to prioritize
correctly anyway).

**B. Defer launch** until restore rehearsal, monitoring, and rollback
are resolved — the more conservative path, given this session's own
history shows real incidents (RLS-no-policy, UUID/TEXT mismatch, cascade
deletes) happening even during controlled development.

**C. Soft launch / closed beta** — a middle path: real traffic, but
limited/controlled exposure, giving the missing gaps (especially
monitoring) a lower-stakes environment to get built out in.

**No option chosen here — this is Izzat's decision.**
