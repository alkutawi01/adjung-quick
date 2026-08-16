// Editorial Attention Evaluation Layer — V1.
//
// This module is a derived, read-only projection over existing editorial and
// operational state. It never writes a table, changes reader state, ranks
// stories, or calls an external service. UI and Digest integration are
// intentionally deferred.

import { PIN_EXPIRING_WINDOW_HOURS } from './editorialAttentionConfig.js';

const LOW_CONFIDENCE_QUERY = 'classification_confidence.lt.0.5';

const action = (type, label) => ({ type, label });

const validDateMs = value => {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Pure evaluator for the three V1 signals. `now` is injectable for boundary
 * tests; production always supplies the current time at read time.
 */
export function evaluateEditorialAttention({ classifications = [], snapshot = null, pins = [] }, now = new Date()) {
  const nowMs = now.getTime();
  const pinWindowEndsAtMs = nowMs + PIN_EXPIRING_WINDOW_HOURS * 60 * 60 * 1000;
  const items = [];

  // The value 0.5 is intentionally not a new config/threshold: it is the
  // exact existing Review Queue predicate, reused here verbatim.
  for (const classification of classifications) {
    if (Number(classification.classification_confidence) >= 0.5) continue;
    items.push({
      type: 'low_confidence',
      category: 'action_required',
      presentation: { status: 'action_required' },
      relatedStoryId: classification.story_id,
      what: 'Bidang berita ini belum cukup pasti.',
      reason: 'Keyakinan klasifikasi berada di bawah ambang semakan sedia ada.',
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
 * Fetches only the V1 sources of truth and evaluates them at request time.
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

  return evaluateEditorialAttention({
    classifications: classifications ?? [],
    snapshot: snapshots?.[0] ?? null,
    pins: pins ?? [],
  }, now);
}
