# Multi-Placement Consideration (raised 2026-08-12, not decided)

Status: **CONSIDERATION document only — no decision made, no code
changed.** Triggered by Izzat's question while reviewing Batch M's 2
conflict cases: *"kenapa masih perlu klasifikasi drpd enjin sedangkan rss
mentah tu sendiri dah nyatakan ia adalah berita alam sekitar? kalau rss
tu sendiri bercanggah... masukkan satu di politik, satu di alam
sekitar."* (Why does the engine need to resolve to one category when the
raw RSS itself already states it — and if RSS sources genuinely
disagree, why not place the story under both?)

## Why this issue surfaced

Batch M's 2 conflict cases (both Guardian UK-heatwave/minister stories):

```
rss_category: Politics
url_segment:  Environment
```

This isn't two different publishers disagreeing — it's ONE story from
ONE publisher (Guardian) where two of Guardian's own internal mechanisms
(their RSS `<category>` tag vs their URL desk structure) don't agree with
each other. Forcing a single resolved answer here risks discarding real
information the publisher itself expressed.

## Two situations that look similar but aren't: Ambiguity vs Uncertainty

**Genuine ambiguity** — the publisher gives two independent, comparably
strong signals that disagree. Example: the Guardian case above
(`rss_category:Politics` vs `url_segment:Environment`, both Medium-class
per the Evidence Quality Matrix). This is real editorial information, not
an engine failure — collapsing it to one answer loses something true.

**Weak/uncertain candidate** — a single low-confidence signal with no
real corroboration. Example: `"Sultan Brunei hubungi Anwar..."` →
`Politics@0.4` from a bare `title_keyword` match. This is NOT ambiguity —
there's no second comparably-strong candidate disagreeing, just one weak
guess. It should not appear in multiple Bidang; it's a confidence problem,
not a multi-signal problem.

These need different handling. Multi-placement is a candidate response to
the first situation, never the second.

## Two candidate models

**Single placement (current)** — Edition Classification resolves to
exactly one `field` per (story, edition). Simple, matches the current
`edition_story_classifications` shape
(`docs/edition-classification-contract.md`). Loses information when
genuine ambiguity exists.

**Multi-placement (proposed, not implemented)** — Edition Classification
becomes an "Edition Placement Layer" that can output more than one
placement per story per edition, split into two roles:

```json
{
  "story_id": "123",
  "edition": "ms-MY",
  "placements": [
    { "field": "Politik", "role": "primary", "reason": "rss_category", "confidence": 0.8 },
    { "field": "Alam Sekitar", "role": "secondary", "reason": "url_segment", "confidence": 0.75 }
  ]
}
```

- **Primary placement** — drives Active Set selection, ranking, and
  default Wheel display. Exactly one per (story, edition), always.
- **Secondary placement(s)** — available for discovery/search/field
  browsing, but does NOT create a second slot-competing entry.

## Why "always resolve to one" isn't strictly necessary, but "always have exactly one primary" still is

This directly answers Izzat's question. Adjung Quick has real operational
constraints a pure archive doesn't: the Active Set holds a fixed 10 slots,
and the Bidang Wheel shows one Bidang at a time. If a story with two
placements (`Politik` + `Alam Sekitar`) were treated as two separate
candidate entries by the Active Set selector, it would appear to occupy
two slots for what a reader experiences as one story — a duplication bug,
not a feature.

So: we don't need to discard the secondary signal, but we do need exactly
one **primary** placement for anything that competes for a limited slot.
Secondary placement can still exist as retrievable context (search,
"related Bidang," editorial memory) without ever entering the slot
competition.

## Impact on downstream systems (not yet analyzed in depth — flagged, not solved)

- **Wheel** — only reads primary placement; unaffected in its current
  single-field-per-story assumption.
- **Active Set / ranking** (`lab/` selector, `state/` reducer) — currently
  assumes one story = one candidate slot. Multi-placement doesn't change
  this IF only primary placement feeds the selector. Needs verification
  once/if this is implemented — not done in this document.
- **Database** (`edition_story_classifications`) — would need a shape
  change to support an array of placements with a `role` field, rather
  than the current one-row-per-(story,edition) assumption. Not designed
  here.

## Explicitly not decided here

- Whether multi-placement gets implemented at all.
- What threshold/rule distinguishes "genuine ambiguity" from "uncertain
  candidate" in code (conceptually sketched above, not formalized).
- Any schema or code change to `edition-classification.mjs`,
  `edition_story_classifications`, the Active Set selector, or the Wheel.

## Next

Per ChatGPT: don't decide this from 2 conflict cases. Wait until Izzat
finishes adjudicating Batch M/U/Medium and the full pattern of
genuine-ambiguity vs weak-candidate cases across all batches is known,
then revisit this document with real evidence of how common each
situation actually is before deciding whether multi-placement is worth
building.
