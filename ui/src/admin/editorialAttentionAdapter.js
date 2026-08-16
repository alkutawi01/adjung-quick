// Editorial Attention Evaluation Layer — V2.
//
// This module is a derived, read-only projection over existing editorial and
// operational state. It never writes a table, changes reader state, ranks
// stories, or calls an external service. UI and Digest integration are
// intentionally deferred.
//
// V1 -> V2 (docs/editorial-attention-model-v2.md): the production
// simulation proved classification_confidence < 0.5 ALONE is too broad —
// 19 real items, 17 of them weeks/months/years old. The age-bucket
// analysis found a genuine gap in the real data (nothing between 24h and
// 70h), and that classification_confidence = 0.4 only ever appeared on
// stories already 70+ hours old — i.e. it behaves like a stale-pipeline
// residue, not a graded editorial probability. V2 therefore adds a second,
// independent qualification: the story must ALSO be under 48 hours old.
// This is a GATE (yes/no), never a score — it is not blended with
// confidence into a combined number, and there is still no ranking here.

import { PIN_EXPIRING_WINDOW_HOURS, LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS } from './editorialAttentionConfig.js';

const LOW_CONFIDENCE_QUERY = 'classification_confidence.lt.0.5';

const action = (type, label) => ({ type, label });

const validDateMs = value => {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Pure evaluator for the three V2 signals. `now` is injectable for boundary
 * tests; production always supplies the current time at read time.
 */
export function evaluateEditorialAttention({ classifications = [], snapshot = null, pins = [] }, now = new Date()) {
  const nowMs = now.getTime();
  const pinWindowEndsAtMs = nowMs + PIN_EXPIRING_WINDOW_HOURS * 60 * 60 * 1000;
  const freshnessCutoffMs = nowMs - LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;
  const items = [];

  // The value 0.5 is intentionally not a new config/threshold: it is the
  // exact existing Review Queue predicate, reused here verbatim. Age is a
  // SEPARATE, ADDITIONAL qualification (docs/editorial-attention-model-v2.md)
  // — a story failing the freshness gate is excluded here, not deleted,
  // expired, or reclassified anywhere else in the system.
  for (const classification of classifications) {
    if (Number(classification.classification_confidence) >= 0.5) continue;
    const publishedAtMs = validDateMs(classification.publishedAt);
    if (publishedAtMs === null || publishedAtMs < freshnessCutoffMs) continue;
    items.push({
      type: 'low_confidence',
      category: 'action_required',
      presentation: { status: 'action_required' },
      relatedStoryId: classification.story_id,
      what: 'Bidang berita ini belum cukup pasti.',
      reason: 'Keyakinan klasifikasi berada di bawah ambang semakan sedia ada, dan berita ini masih baharu.',
      recommendedAction: action('review_classification', 'Semak klasifikasi'),
    });
  }

  // `failed_sources_count` is only an aggregate. Do not derive, imply, or
  // expose a source name that the snapshot does not actually contain.
  const failedSourcesCount = Number(snapshot?.failed_sources_count ?? 0);
  if (Number.isFinite(failedSourcesCount) && failedSourcesCount > 0) {
    items.push({
      type: 'source_failure',
      category: 'informational',
      presentation: { status: 'informational' },
      relatedStoryId: null,
      what: `${failedSourcesCount} sumber berita gagal diproses hari ini.`,
      reason: 'Snapshot operasi hari ini merekodkan kegagalan ambilan sumber secara agregat.',
      recommendedAction: null,
    });
  }

  for (const pin of pins) {
    const expiresAtMs = validDateMs(pin.expires_at);
    // Defence in depth: the query already requests active, unexpired pins,
    // but a derived evaluator must not present an expired/inactive pin if a
    // caller supplies stale rows.
    if (pin.override_type !== 'pin' || pin.active !== true || expiresAtMs === null) continue;
    if (expiresAtMs <= nowMs || expiresAtMs > pinWindowEndsAtMs) continue;
    items.push({
      type: 'pin_expiring',
      category: 'informational',
      presentation: { status: 'informational' },
      relatedStoryId: pin.story_id,
      what: 'Pin berita ini akan tamat dalam tempoh enam jam.',
      reason: 'Pin masih aktif dan tarikh tamatnya berada dalam tetingkap perhatian V1.',
      recommendedAction: action('renew_pin', 'Perbaharui pin'),
      expiresAt: pin.expires_at,
    });
  }

  return items;
}

const localDateString = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Fetches only the V2 sources of truth and evaluates them at request time.
 * It is deliberately not called by AdminApp, Admin Digest, Review Queue, or
 * the reader path yet.
 */
export async function fetchEditorialAttention(supabase, editionId, now = new Date()) {
  const nowIso = now.toISOString();
  const pinWindowEndsAtIso = new Date(
    now.getTime() + PIN_EXPIRING_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: classifications, error: classificationsError }, { data: snapshots, error: snapshotsError }, { data: pins, error: pinsError }] = await Promise.all([
    supabase.from('edition_story_classifications')
      .select('story_id, classification_confidence')
      .eq('edition_id', editionId)
      // Exactly the existing Review Queue cutoff. Do not retune it here.
      .or(LOW_CONFIDENCE_QUERY),
    supabase.from('operational_snapshots_public')
      .select('snapshot_date, failed_sources_count')
      .eq('snapshot_date', localDateString(now)),
    supabase.from('story_overrides')
      .select('story_id, override_type, active, expires_at')
      .eq('edition_id', editionId)
      .eq('override_type', 'pin')
      .eq('active', true)
      .gt('expires_at', nowIso)
      .lte('expires_at', pinWindowEndsAtIso),
  ]);

  if (classificationsError) throw new Error(`fetchEditorialAttention: edition_story_classifications — ${classificationsError.message}`);
  if (snapshotsError) throw new Error(`fetchEditorialAttention: operational_snapshots_public — ${snapshotsError.message}`);
  if (pinsError) throw new Error(`fetchEditorialAttention: story_overrides — ${pinsError.message}`);

  // The freshness gate (docs/editorial-attention-model-v2.md) needs each
  // story's publish time — the same canonical resolution reviewQueueAdapter.js
  // already uses (earliest rss_items row for the cluster). Only fetched for
  // the (already small) low-confidence set, not every story in the edition.
  const lowConfidenceStoryIds = (classifications ?? []).map(c => c.story_id);
  let publishedAtByStoryId = new Map();
  if (lowConfidenceStoryIds.length > 0) {
    const { data: rssItems, error: rssItemsError } = await supabase
      .from('rss_items')
      .select('cluster_id, published_at')
      .in('cluster_id', lowConfidenceStoryIds);
    if (rssItemsError) throw new Error(`fetchEditorialAttention: rss_items — ${rssItemsError.message}`);
    for (const row of rssItems ?? []) {
      const existing = publishedAtByStoryId.get(row.cluster_id);
      if (!existing || new Date(row.published_at) < new Date(existing)) {
        publishedAtByStoryId.set(row.cluster_id, row.published_at);
      }
    }
  }

  return evaluateEditorialAttention({
    classifications: (classifications ?? []).map(c => ({
      ...c,
      publishedAt: publishedAtByStoryId.get(c.story_id) ?? null,
    })),
    snapshot: snapshots?.[0] ?? null,
    pins: pins ?? [],
  }, now);
}
