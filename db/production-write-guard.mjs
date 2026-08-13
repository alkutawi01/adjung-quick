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
