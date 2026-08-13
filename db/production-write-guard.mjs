// production-write-guard.mjs — per docs/production-write-guard-v1.md /
// docs/production-environment-separation-plan-v1.md §7.
//
// Every destructive script (ingest-production.js, classify-production.js
// --write, and any future --write/destructive mode) must call
// assertWriteAllowed() before its first write. Fails CLOSED: an unset
// DATABASE_ENV is treated as unsafe, not as "assume production is fine" —
// this matches the real current state (one shared Supabase project, no
// staging exists yet) where an accidental write is exactly the risk this
// guard exists to prevent.
//
// DATABASE_ENV=production additionally requires CONFIRM_PRODUCTION_WRITE=true.
// DATABASE_ENV=staging or DATABASE_ENV=development are allowed freely —
// once a real staging project exists (docs/production-environment-separation-plan-v1.md
// Option A), pointing SUPABASE_URL/keys at it and setting
// DATABASE_ENV=staging is what makes iteration safe again.

export function assertWriteAllowed(env = process.env) {
  const dbEnv = env.DATABASE_ENV;

  if (dbEnv === 'production') {
    if (env.CONFIRM_PRODUCTION_WRITE !== 'true') {
      throw new Error(
        'Refusing to write: DATABASE_ENV=production requires CONFIRM_PRODUCTION_WRITE=true. ' +
        'This is not a bug — it is the guard working as designed.'
      );
    }
    return; // production, explicitly confirmed
  }

  if (dbEnv === 'staging' || dbEnv === 'development') {
    return; // non-production, always allowed
  }

  throw new Error(
    `Refusing to write: DATABASE_ENV is ${JSON.stringify(dbEnv)} (unset or unrecognized). ` +
    "Set DATABASE_ENV to 'production', 'staging', or 'development' explicitly before running a write script."
  );
}

// Destructive-rebuild guard (2026-08-13, docs/ingestion-destructive-rebuild-finding.md):
// ingest-production.js deletes ALL story_clusters every run, but
// saved_stories/history_entries reference story_clusters with no ON
// DELETE action — so once any reader has saved anything, the rebuild
// both fails (FK violation) and, if forced, orphans real user data.
//
// Decision logic only — the caller supplies the live counts, so this is
// unit-testable without ever writing fake rows to production
// (db/production-write-guard.test.mjs). Returns:
//   { allowed: true }                      — DB has no user data, safe
//   { allowed: true, forced: true }        — user data exists, but
//                                            ALLOW_DESTRUCTIVE_REBUILD=true
//                                            was set deliberately
//   { allowed: false, reason }             — user data exists, refuse
export function evaluateDestructiveRebuildGuard(savedCount, historyCount, env = process.env) {
  const userRows = (savedCount ?? 0) + (historyCount ?? 0);
  if (userRows === 0) return { allowed: true, userRows: 0 };
  if (env.ALLOW_DESTRUCTIVE_REBUILD === 'true') {
    return { allowed: true, forced: true, userRows };
  }
  return {
    allowed: false,
    userRows,
    reason:
      `user-owned data detected (saved_stories: ${savedCount ?? 0}, ` +
      `history_entries: ${historyCount ?? 0}) — a destructive rebuild would `
      + 'fail on the FK and orphan real readers’ data if forced. See ' +
      'docs/ingestion-destructive-rebuild-finding.md.',
  };
}
