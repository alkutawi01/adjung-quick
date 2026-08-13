// editor-auth.mjs — Fasa 3.6.1 Foundation. Per docs/admin-auth-spec-v1.md.
//
// The ENTIRE admin/reader distinction: presence in the `editors` table,
// nothing else. No separate login, no separate password — same
// Supabase Auth sign-in a reader already uses; this is the one new
// check the app makes after sign-in completes.

// supabase: an already-authenticated client (the signed-in user's own
// session, not the service_role key — this is meant to run with the
// user's own auth context so RLS's `auth.uid() = user_id` applies).
export async function getEditorRole(supabase, userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('editors')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Fail closed — per this project's own standing rule
    // (docs/exhaustive-audit-findings-v1.md's CRITICAL finding: a failed
    // safety check must never be treated as "safe/none", the exact bug
    // already found and fixed in db/ingest-production.js's destructive
    // guard). A failed editors lookup must never be silently treated as
    // "not an editor" vs. "genuinely not an editor" — both look the same
    // to the caller (null), which is correct: either way, this request
    // gets the reader experience, never a false admin grant.
    return null;
  }
  return data?.role ?? null;
}

export function isEditor(role) {
  return role === 'editor' || role === 'admin';
}

export function isAdmin(role) {
  return role === 'admin';
}

// Principle of Escalation (docs/editorial-action-spec-v1.md): actions
// whose impact is scoped to one story are editor-level; actions whose
// impact compounds across many future stories (pin bypasses ranking
// entirely; source overrides affect every story from that source, every
// edition) require admin.
const ADMIN_ONLY_ACTIONS = new Set(['pin', 'ignore_category', 'reduce_trust', 'disable']);

export function canPerformAction(role, overrideType) {
  if (!isEditor(role)) return false;
  if (ADMIN_ONLY_ACTIONS.has(overrideType)) return isAdmin(role);
  return true; // hide, reclassify, boost — editor or admin
}
