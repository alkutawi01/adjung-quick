// Editorial Attention configuration. This is deliberately static and
// version-controlled: it changes what an admin sees, so it must never be a
// hidden query literal or a runtime-editable setting.
//
// Pin expiry itself remains owned by PostgreSQL
// (db/schema-fix-server-side-expiry.sql: 24 hours). This value only defines
// when the derived Attention layer starts informing an admin about that fact.
export const PIN_EXPIRING_WINDOW_HOURS = 6;

// V2 (docs/editorial-attention-model-v2.md): a low_confidence story only
// qualifies for action_required if it is also this fresh. Chosen from the
// real production data's own natural gap (nothing between 24h and 70.1h),
// not an arbitrary round number — 48h sits inside that gap with some
// tolerance for an admin who opens the system a day+ later, while staying
// well short of the next real item at 70.1h. A gate, not a ranking input.
export const LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS = 48;
