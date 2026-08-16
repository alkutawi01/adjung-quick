// Editorial Attention V1 configuration. This is deliberately static and
// version-controlled: it changes what an admin sees, so it must never be a
// hidden query literal or a runtime-editable setting in V1.
//
// Pin expiry itself remains owned by PostgreSQL
// (db/schema-fix-server-side-expiry.sql: 24 hours). This value only defines
// when the derived Attention layer starts informing an admin about that fact.
export const PIN_EXPIRING_WINDOW_HOURS = 6;
