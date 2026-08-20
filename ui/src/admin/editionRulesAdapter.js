// editionRulesAdapter.js — Backend Control Plane Fasa 4, Edition Rules
// Admin Self-Service. Per docs/control-plane-phase4-edition-rules-
// implementation-plan-v1.md and the authenticated-access patch
// (db/schema-edition-rules-rpc-authenticated-patch-v1.sql +
// v2-hotfix.sql). Writes go through the 3 RPCs — each already enforces
// is_admin(auth.uid()) server-side, so this file adds no client-side
// admin check of its own (the RPC is the real boundary; a client check
// would only be UI politeness, never security).
//
// Polish 8E: thrown messages no longer carry the JS function name. These
// strings are rendered verbatim to the editor (BidangPanel.jsx), and
// "fetchEditionRules: ..." told them nothing they could act on while
// leaking an internal identifier into the product. The function name is
// still recoverable from the stack trace when debugging.

export async function fetchEditionRules(supabase, editionId) {
  const { data, error } = await supabase
    .from('edition_rules')
    .select('id, edition_id, condition_subject, condition_geography_type, condition_geography_value, action_field_code, priority, status, reason, created_by, created_at')
    .eq('edition_id', editionId)
    .order('priority', { ascending: false });
  if (error) throw new Error(`Gagal memuatkan penempatan berita: ${error.message}`);
  return data;
}

export async function addEditionRule(supabase, { editionId, conditionSubject, actionFieldCode, conditionGeographyType, conditionGeographyValue, priority, createdBy }) {
  const { data, error } = await supabase.rpc('add_edition_rule', {
    p_edition_id: editionId,
    p_condition_subject: conditionSubject,
    p_action_field_code: actionFieldCode,
    p_condition_geography_type: conditionGeographyType ?? null,
    p_condition_geography_value: conditionGeographyValue ?? null,
    p_priority: priority ?? 0,
    p_created_by: createdBy ?? null,
  });
  if (error) throw new Error(`Gagal menambah penempatan berita: ${error.message}`);
  return data;
}

export async function archiveEditionRule(supabase, id, reason) {
  const { error } = await supabase.rpc('archive_edition_rule', { p_id: id, p_reason: reason });
  if (error) throw new Error(`Gagal mengarkibkan penempatan berita: ${error.message}`);
}

export async function restoreEditionRule(supabase, id) {
  const { error } = await supabase.rpc('restore_edition_rule', { p_id: id });
  if (error) throw new Error(`Gagal mengaktifkan semula penempatan berita: ${error.message}`);
}
