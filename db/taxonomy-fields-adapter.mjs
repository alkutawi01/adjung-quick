// taxonomy-fields-adapter.mjs — Backend Control Plane Phase 2.
//
// Per docs/control-plane-phase2-taxonomy-implementation-plan-v1.md §3:
// each write function is a THIN WRAPPER — assertAdmin() then exactly
// one supabase.rpc() call. No business logic, no validation, no
// multi-step sequences here — all of that lives in the PostgreSQL RPC
// functions themselves (db/schema-taxonomy-fields-rpc-v1.sql),
// especially merge_taxonomy_fields(), which must never be reimplemented
// as separate client calls from this file.

import { isAdmin } from './editor-auth.mjs';

function assertAdmin(role, action) {
  if (!isAdmin(role)) {
    throw new Error(`${action} memerlukan peranan admin. Peranan anda: ${role ?? 'tiada'}.`);
  }
}

export async function addTaxonomyField(supabase, { editionId, fieldCode, label, subjectCodes, wheelVisible, role }) {
  assertAdmin(role, 'add_taxonomy_field');
  const { data, error } = await supabase.rpc('add_taxonomy_field', {
    p_edition_id: editionId, p_field_code: fieldCode, p_label: label,
    p_subject_codes: subjectCodes ?? null, p_wheel_visible: wheelVisible ?? true,
  });
  if (error) throw new Error(`addTaxonomyField: ${error.message}`);
  return data;
}

export async function renameTaxonomyField(supabase, { id, label, role }) {
  assertAdmin(role, 'rename_taxonomy_field');
  const { error } = await supabase.rpc('rename_taxonomy_field', { p_id: id, p_label: label });
  if (error) throw new Error(`renameTaxonomyField: ${error.message}`);
}

export async function setTaxonomyFieldVisibility(supabase, { id, wheelVisible, role }) {
  assertAdmin(role, 'set_taxonomy_field_visibility');
  const { error } = await supabase.rpc('set_taxonomy_field_visibility', { p_id: id, p_wheel_visible: wheelVisible });
  if (error) throw new Error(`setTaxonomyFieldVisibility: ${error.message}`);
}

export async function setTaxonomyFieldStatus(supabase, { id, status, role }) {
  assertAdmin(role, 'set_taxonomy_field_status');
  const { error } = await supabase.rpc('set_taxonomy_field_status', { p_id: id, p_status: status });
  if (error) throw new Error(`setTaxonomyFieldStatus: ${error.message}`);
}

export async function mergeTaxonomyFields(supabase, { editionId, fromFieldCode, intoFieldCode, role }) {
  assertAdmin(role, 'merge_taxonomy_fields');
  // No pre-check here — every validation (existence, active status,
  // from != into) happens inside the RPC's own transaction. A
  // client-side check here would be exactly the TOCTOU gap this
  // session already rejected once for the editorial-state design.
  const { error } = await supabase.rpc('merge_taxonomy_fields', {
    p_edition_id: editionId, p_from_field_code: fromFieldCode, p_into_field_code: intoFieldCode,
  });
  if (error) throw new Error(`mergeTaxonomyFields: ${error.message}`);
}

// NOT an RPC — a plain read query, per ChatGPT's explicit correction.
// No atomicity concern for a SELECT.
export async function listTaxonomyFields(supabase, { editionId } = {}) {
  let query = supabase.from('taxonomy_fields').select('*').order('display_order');
  if (editionId) query = query.eq('edition_id', editionId);
  const { data, error } = await query;
  if (error) throw new Error(`listTaxonomyFields: ${error.message}`);
  return data;
}
