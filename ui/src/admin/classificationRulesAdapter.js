// classificationRulesAdapter.js — Backend Control Plane Phase 3, Admin
// Read-Only V1. Per docs/control-plane-phase3-admin-readonly-implementation-plan-v1.md
// §1: plain queries only, no RPC for reads (the correction ChatGPT made
// for Taxonomy's listTaxonomyFields() in Phase 2, reused here).

// Source display names for `rule_type = 'source'` rows are joined
// client-side against `sources` — `pattern` is validated as a real
// sources.id at the RPC write layer (Design V1 §4c), but is NOT a
// declared DB foreign key (one shared `pattern` column can't carry a
// type-conditional FK across 3 rule types), so there is no embedded
// Supabase join to use here.
export async function fetchClassificationRules(supabase) {
  const [rulesResult, sourcesResult] = await Promise.all([
    supabase.from('classification_rules')
      .select('id, rule_type, edition_id, pattern, field_code, subject_code, priority, status, created_by, created_at'),
    supabase.from('sources').select('id, name'),
  ]);
  if (rulesResult.error) throw new Error(`fetchClassificationRules: ${rulesResult.error.message}`);
  if (sourcesResult.error) throw new Error(`fetchClassificationRules: ${sourcesResult.error.message}`);

  const sourceNameById = new Map(sourcesResult.data.map(s => [s.id, s.name]));
  return rulesResult.data.map(rule => ({
    ...rule,
    sourceName: rule.rule_type === 'source' ? (sourceNameById.get(rule.pattern) ?? null) : null,
  }));
}

// Batch fetch — the ONLY way classification_rule ids ever get resolved to
// rule detail. Per the implementation plan's N+1 fix: callers deduplicate
// their own ids (this function also defends against duplicates itself,
// since `.in()` handles them harmlessly, but building the Map here means
// a caller that forgot to dedupe still only issues one query — the fix
// is structural, not just "remember to dedupe before calling").
// Returns a Map<id, rule> — a missing id simply has no entry, which
// ClassificationProvenance.jsx treats as "rule not found" rather than
// throwing.
export async function fetchClassificationRulesByIds(supabase, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('classification_rules')
    .select('id, rule_type, edition_id, pattern, field_code, subject_code, priority, status, created_by, created_at')
    .in('id', uniqueIds);
  if (error) throw new Error(`fetchClassificationRulesByIds: ${error.message}`);

  return new Map(data.map(rule => [rule.id, rule]));
}
