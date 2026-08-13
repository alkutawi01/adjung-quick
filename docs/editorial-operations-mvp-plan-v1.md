# Editorial Operations MVP Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[x] Closed`

## SUPERSEDED 2026-08-13 — see `docs/editorial-operations-mvp-plan-v2.md`

Izzat added a constraint after this was written: the admin is
non-technical and won't monitor implementation step-by-step. v2 adds a
human-first language layer (internal `reason_code` vs. admin-facing
`display_reason`) and an Admin Digest component. The data
model/schema below (`editors`, `story_overrides`, `source_overrides`,
Review Queue *sourcing*) stays valid — only the UI/presentation layer
changes.

Category: **[DECISION] plan document. No UI, schema, or code written
here.** Opens **Fasa 3**. Fasa 2 (Editorial Correctness) is formally
closed — see `docs/roadmap-to-production-v1.md` and the design chain it
produced (taxonomy review, geography navigation, editorial override
model, ingestion lifecycle design, production safety audit).

Per ChatGPT: the product question has shifted. Fasa 1–2 answered *"can
the system collect and show news correctly?"* Fasa 3 answers *"can a
human manage the system's decisions without opening code?"* Every
real incident this session (RTM category mismatch, JAKIM TLS, the
Bencana/Kesihatan calibration, the Nasional/Dunia navigation gap, the
released-story bug) required a code change and a redeploy. None of them
should, going forward.

Scoped into two sub-phases, per ChatGPT: build the foundation before any
UI.

---

## Fasa 3.1 — Editorial Control Foundation (this plan's scope)

### 1. Admin identity/access

**Reuse the existing Supabase Auth system** — `db/schema-identity.sql`
already puts readers on `auth.users` with no custom profile table; the
same system, not a new one, distinguishes an editor from a reader.

Minimum viable shape (not implemented here):

```sql
CREATE TABLE editors (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'admin')),
  added_by    UUID REFERENCES auth.users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

An allowlist table, not a role embedded in `auth.users` metadata —
keeps "who can override editorial decisions" as its own auditable,
queryable list (itself following the `Generated Data ≠ Editorial State`
invariant: this is human-curated access, not derived from anything).

**Who can grant access first?** Not decided here — a real bootstrap
question (the first `admin` row has no `added_by`) for implementation
time, not this plan.

### 2. Editorial state storage

**Already designed, not yet built** —
`docs/editorial-override-data-model-v1.md` fully specifies this:

- `story_overrides` (reclassify / hide / boost / pin, per-edition,
  required `reason`, story-level expiry)
- `source_overrides` (ignore_category / reduce_trust / disable,
  cross-edition, never auto-expires)
- Precedence order (§3 of that document) already locked
- `boost`/`pin` insertion points into the ranking pipeline already
  resolved (`docs/ranking-engine-contract-v1.md`'s amendment)

This plan does not redesign that model — it schedules building it.

### 3. Review Queue — concept, not UI

**What populates the queue** — sourced from mechanisms that already
exist and already produce this exact data, per
`db/classification-observatory.mjs`:

| Reason | Source |
|---|---|
| Low confidence placement | Observatory's existing `LOW-CONFIDENCE PLACEMENTS` sample |
| Possible source/content mismatch | Observatory's existing `POSSIBLE MISMATCH` sample |
| Unclassified | Observatory's existing `UNCLASSIFIED QUEUE` sample |
| Manual flag | New — an editor flags a story directly (needs Fasa 3.2's actions) |

**Not a new detection system** — the observatory already computes all
three data-driven reasons; a Review Queue is a UI over queries that
already exist, filtered to a threshold (e.g. confidence `< 0.5`,
already the observatory's own cutoff).

### 4. Audit trail

**Already specified, not separate work**:
`docs/editorial-override-data-model-v1.md` §4 already requires
`reason` (mandatory), `created_by`, `created_at` on every override, and
soft-delete (never hard-delete) for undo. The `editors` table (§1
above) adds the second half: knowing *who* `created_by` refers to.

---

## Fasa 3.2 — Editorial Actions (after 3.1, not this plan's scope)

Listed for sequencing only, not designed here:

- hide story
- reclassify story
- boost story
- pin story
- source rules (the 3-tier suppression already designed)

Each maps directly onto `docs/editorial-override-data-model-v1.md`'s
already-locked precedence order — 3.2 is largely "build the UI that
writes rows shaped like the already-designed schema," not new design
work.

---

## What this plan explicitly excludes (per ChatGPT)

- ❌ History screen (needs real user identity/login flow, separate
  concern from admin identity)
- ❌ Supabase Pro upgrade (Trigger B hasn't fired — `saved_stories`/
  `history_entries` still 0 rows)
- ❌ Incremental ingestion (real migration risk — `docs/ingestion-lifecycle-v2-design.md`
  stays designed-not-built until its own review)
- ❌ Ranking engine expansion beyond `ms-MY.Politik` (Editorial
  Operations should exist before expanding what it needs to operate)
- ❌ Any UI component — this plan defines scope, not screens

## Sequencing

```
1. editors table + access bootstrap decision
2. story_overrides + source_overrides tables (schema from the
   already-locked design doc)
3. Review Queue query layer (reuses observatory logic, no new
   detection)
4. THEN: review before any UI/Fasa 3.2 implementation begins
```

## What this document does NOT do

- Does not create any table, migration, or auth configuration
- Does not build any admin UI
- Does not decide the access-bootstrap question (who grants the first
  admin)
- Does not touch ranking, ingestion, or classification code
