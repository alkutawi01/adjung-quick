// editorialActivityAdapter.js — FASA 4.1.1. Per
// docs/editorial-activity-timeline-plan-v1.md, approved by ChatGPT:
// `story_overrides` is the ONLY source — `source_overrides` and
// `operational_snapshots` are explicitly out of scope, so the Admin
// layer ("what should I check?") stays distinct from the System layer
// ("is the pipeline healthy?").
//
// Each override row projects into up to two derived events — "created"
// (always) and "expired" (only once `expires_at` has actually passed) —
// computed HERE, at the application layer, per ChatGPT's explicit
// instruction: "Bukan tambah table. Hanya derived view di application
// layer." No new schema, no new table.
//
// A DEACTIVATED override (active flipped to false before its natural
// expiry — e.g. an undo) never gets a dated event: `deactivated_at`
// does not exist, and inventing one from "active is now false" would
// fabricate a timestamp no data supports — the exact thing ChatGPT
// named as not allowed. Its CREATED event still appears (that fact is
// real); it's just annotated `inactive: true` with no claimed time for
// when that happened.

const ACTIVITY_SENTENCES = {
  hide: { created: () => 'Berita disembunyikan', expired: 'Sembunyi tamat tempoh' },
  reclassify: { created: field => `Berita dipindahkan ke ${field ?? 'bidang lain'}`, expired: 'Pemindahan tamat tempoh' },
  boost: { created: () => 'Berita dinaikkan', expired: 'Naik taraf tamat tempoh' },
  pin: { created: field => `Berita disemat pada ${field ?? 'bidang lain'}`, expired: 'Semat tamat tempoh' },
};

// Identity: per ChatGPT's explicit V1 decision — role only (Admin/Editor),
// no display-name column. `editors` doesn't have one, and adding one just
// to satisfy the Timeline opens questions (who manages it, can it change,
// does old audit history follow a renamed editor) that are out of scope.
const ROLE_LABEL = { admin: 'Admin', editor: 'Editor' };

export async function fetchEditorialActivity(supabase, editionId, { limit = 30, offset = 0 } = {}) {
  const { data: overrides, error } = await supabase
    .from('story_overrides')
    // `editors:created_by(role)` — embedded via the existing FK
    // (story_overrides.created_by -> editors.user_id), no extra query.
    .select('id, override_type, new_field, created_at, expires_at, active, editors:created_by(role)')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: false })
    // Per ChatGPT: "V1 gunakan limit + pagination sederhana. Jangan load
    // semua." — paginated on OVERRIDE ROWS, not derived events; a
    // Timeline is a daily tool, not a full archive (export/dedicated
    // audit system is explicitly deferred).
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`fetchEditorialActivity: story_overrides — ${error.message}`);

  const now = Date.now();
  const events = [];
  for (const o of overrides) {
    const sentence = ACTIVITY_SENTENCES[o.override_type];
    if (!sentence) continue; // defensive — every current override_type is covered above
    events.push({
      id: `${o.id}-created`,
      overrideId: o.id,
      type: 'created',
      timestamp: o.created_at,
      text: sentence.created(o.new_field),
      roleLabel: ROLE_LABEL[o.editors?.role] ?? null,
      inactive: !o.active,
    });
    // Expiry is a real column fact, shown only once it's actually in the
    // past — a future expires_at is a forward-looking fact that belongs
    // on the created event's own line (rendered in the UI layer), not a
    // separate dated event that hasn't happened yet.
    if (new Date(o.expires_at).getTime() <= now) {
      events.push({
        id: `${o.id}-expired`,
        overrideId: o.id,
        type: 'expired',
        timestamp: o.expires_at,
        text: sentence.expired,
        roleLabel: null,
        inactive: false,
      });
    }
  }
  // Per ChatGPT: never sort by created_at alone — a single override can
  // produce two events at two different real times.
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return { events, rowsFetched: overrides.length, hasMore: overrides.length === limit };
}
