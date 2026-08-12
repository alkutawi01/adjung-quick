-- schema-source-known-category.sql — Production Evidence Persistence Gap fix
-- (2026-08-12). Per ChatGPT: keep publisher-declared RSS <category> tags
-- and source-registry knownCategory SEPARATE, never merged into one field —
-- provenance matters ("did this come from the RSS publisher or from our own
-- source registry?").
--
-- PURELY ADDITIVE.

BEGIN;

ALTER TABLE rss_items
  ADD COLUMN IF NOT EXISTS source_known_category TEXT;

COMMENT ON COLUMN rss_items.categories IS
  'Raw <category> tags as published by the RSS feed itself (Tier 3 evidence, rss_category).';
COMMENT ON COLUMN rss_items.source_known_category IS
  'Tier 1 evidence: the desk this specific feed URL is registered under in lab/sources.js (e.g. Harian Metro — Bisnes -> "bisnes"). Set by us, not the publisher — kept in its own column so provenance is never ambiguous.';

COMMIT;
