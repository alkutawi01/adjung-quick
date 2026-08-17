// ClassificationProvenance.jsx — Backend Control Plane Phase 3, Admin
// Read-Only V1. Per docs/control-plane-phase3-admin-readonly-implementation-plan-v1.md
// §3: PURELY PRESENTATIONAL — no network call anywhere in this file. The
// caller batch-fetches every rule it needs (classificationRulesAdapter.js's
// fetchClassificationRulesByIds()) and passes the already-resolved rule
// down as `resolvedRule`. This is the direct fix for the N+1 risk
// ChatGPT flagged in the original plan (a per-story internal fetch would
// mean one query per admin_rule-classified story in any list).

// classification_method -> short Malay label, for the non-admin_rule
// branch. Deliberately NOT the raw internal classification_rule string
// (e.g. "story_understanding.subject:Crime -> ms-MY.Jenayah") — that's
// debug-oriented phrasing, not meant for an Admin-facing screen.
const METHOD_LABELS = {
  edition_rule: 'Peraturan Edisi',
  default_mapping: 'Pemetaan Lalai',
  geography_fallback: 'Fallback Geografi',
  low_confidence_fallback: 'Fallback Geografi',
  none: 'Tiada',
};

const RULE_TYPE_LABELS = { source: 'Sumber', url: 'URL', keyword: 'Kata kunci' };

// resolvedRule: a classification_rules row (already fetched by the
// caller), or null/undefined — ignored entirely unless
// classificationMethod === 'admin_rule'.
export default function ClassificationProvenance({ classificationMethod, resolvedRule }) {
  if (classificationMethod !== 'admin_rule') {
    return (
      <p className="classification-provenance classification-provenance--classifier">
        Ditentukan oleh: Classifier
        <span className="classification-provenance__detail">
          Method: {METHOD_LABELS[classificationMethod] ?? classificationMethod ?? 'Tiada'}
        </span>
      </p>
    );
  }

  if (!resolvedRule) {
    // Defensive — should not happen (rules are archived, never deleted),
    // but a story's own classification_rule id is trusted external data
    // by the time it reaches this component, not re-validated here.
    return (
      <p className="classification-provenance classification-provenance--missing">
        Ditentukan oleh: Peraturan Klasifikasi
        <span className="classification-provenance__detail">Peraturan tidak dijumpai.</span>
      </p>
    );
  }

  return (
    <p className="classification-provenance classification-provenance--admin-rule">
      Ditentukan oleh: Peraturan Klasifikasi
      <span className="classification-provenance__detail">Jenis: {RULE_TYPE_LABELS[resolvedRule.rule_type] ?? resolvedRule.rule_type}</span>
      <span className="classification-provenance__detail">Pattern: {resolvedRule.pattern}</span>
      <span className="classification-provenance__detail">Priority: {resolvedRule.priority}</span>
      <span className="classification-provenance__detail">Rule ID: {resolvedRule.id}</span>
      {/* Never hidden regardless of the rule's current status — an
          archived rule that decided this story's Kategori in the past
          still shows its full detail, per the locked invariant. */}
      <span className="classification-provenance__detail">
        Status: {resolvedRule.status === 'archived' ? 'Diarkibkan' : 'Aktif'}
      </span>
    </p>
  );
}
