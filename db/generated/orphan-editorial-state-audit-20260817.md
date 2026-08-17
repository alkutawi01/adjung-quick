# Orphan editorial state audit — 2026-08-17

Read-only, per ChatGPT's explicit instruction. Compared `story_overrides`,
`saved_stories`, `history_entries` against `story_clusters_staging`
(685 rows — the NEW ingestion generation that failed to swap).

| table | total rows | orphan vs new generation |
|---|---|---|
| story_overrides | 2 | 2 (both = pressdisplay/viewer.aspx test residue) |
| saved_stories | 0 | 0 |
| history_entries | 0 | 0 |

Both orphaned `story_overrides` rows are the confirmed test residue
(`active=false`, reason "Ujian sistem 3.6.3a/b", created 2026-08-13,
expired 2026-08-20) — not live editorial decisions.

**Conclusion**: after these 2 rows are removed, 0 orphans remain across
all three editorial-state tables — nothing else currently blocks a
clean swap.
