// shadow-runner.mjs — Shadow Mode, per docs/editorial-ranking-integration-plan-v1.md §3.
// Runs BOTH the legacy selector and the editorial pipeline against the
// same real candidate pool for one (edition, field), for comparison only.
//
// PROTOTYPE — isolated. Does not write to any table, does not touch
// productionAdapter.js or the reducer, does not affect any real reader.
//
// legacySelector mirrors what production actually does today: sort by
// editorial_score (set once at ingestion, db/ingest-production.js),
// take the top `capacity` — no diversity awareness, no composition.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreCandidates } from './candidate-scoring.mjs';
import { selectDiverseCandidates } from './diversity-selection.mjs';
import { applyEditorialComposition } from './editorial-composition.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Taxonomy Stable Field-ID V1 (2026-08-16): `field` here is now a
// field_code ('politics'), not the mutable label — this function is fed
// from RANKING_FLAGS via db/daily-observation.mjs, which is keyed on
// field_code as of this migration.
export async function loadFieldCandidates(edition, field) {
  // Phase 1 cutover completion, Item 2: trustScore now comes from
  // public.sources (production authority) instead of the static
  // lab/sources.js import — same Map shape, same fallback (?? 0),
  // only the data source changed.
  const { data: sourceRows, error: sErr } = await supabase.from('sources').select('id, trust_score');
  if (sErr) throw new Error(sErr.message);
  const trustById = new Map(sourceRows.map(s => [s.id, s.trust_score]));

  const { data: placements, error: pErr } = await supabase
    .from('edition_story_classifications')
    .select('story_id, classification_confidence')
    .eq('edition_id', edition)
    .eq('field_code', field);
  if (pErr) throw new Error(pErr.message);
  const ids = placements.map(p => p.story_id);
  if (ids.length === 0) return [];

  // Chunked — same reason as the rss_items query below (Pendidikan's 193
  // candidates pushed a single .in() past what one request handles
  // reliably).
  const clusters = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error: cErr } = await supabase
      .from('story_clusters')
      .select('id, editorial_score')
      .in('id', chunk);
    if (cErr) throw new Error(cErr.message);
    clusters.push(...data);
  }
  const scoreByCluster = new Map(clusters.map(c => [c.id, Number(c.editorial_score)]));

  const items = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error: iErr } = await supabase
      .from('rss_items')
      .select('cluster_id, title, source_id, published_at')
      .in('cluster_id', chunk);
    if (iErr) throw new Error(iErr.message);
    items.push(...data);
  }

  const byCluster = new Map();
  for (const item of items) {
    const existing = byCluster.get(item.cluster_id);
    if (!existing || new Date(item.published_at) < new Date(existing.published_at)) {
      byCluster.set(item.cluster_id, item);
    }
  }
  const confidenceByCluster = new Map(placements.map(p => [p.story_id, p.classification_confidence]));

  return [...byCluster.entries()].map(([storyId, item]) => ({
    storyId, title: item.title, sourceId: item.source_id, publishedAt: item.published_at,
    trustScore: trustById.get(item.source_id) ?? 0,
    classificationConfidence: Number(confidenceByCluster.get(storyId) ?? 0),
    editorialScore: scoreByCluster.get(storyId) ?? 0,
  }));
}

export function legacySelect(candidates, capacity = 10) {
  return [...candidates]
    .sort((a, b) => b.editorialScore - a.editorialScore)
    .slice(0, capacity)
    .map(c => ({ ...c, reasons: ['legacy_editorial_score'] }));
}

export function editorialSelect(candidates, capacity = 10, now = new Date()) {
  const scored = scoreCandidates(candidates, now);
  const diversitySelected = selectDiverseCandidates(scored, capacity);
  const alternativePool = scored.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected, compositionReasons } = applyEditorialComposition(diversitySelected, { alternativePool });
  return selected.map(s => ({ ...s, reasons: [...s.reasons, ...(compositionReasons[s.storyId] ?? [])] }));
}

export async function runShadow(edition, field, capacity = 10, now = new Date()) {
  const candidates = await loadFieldCandidates(edition, field);
  return {
    edition,
    field,
    candidateCount: candidates.length,
    legacy: legacySelect(candidates, capacity),
    editorial: editorialSelect(candidates, capacity, now),
  };
}
