// ClassificationRulesList.jsx — Backend Control Plane Phase 3, Admin
// Read-Only V1. Per docs/control-plane-phase3-admin-readonly-implementation-plan-v1.md
// §2: structure mirrors EditorialActivityTimeline.jsx's loading/error/empty
// shape exactly. No onAdd/onToggle/onDelete anywhere in this file — every
// row is inert, enforced by omission (the backend RPCs exist and are
// live, V1's Admin surface simply never calls them).

import { useEffect, useState } from 'react';
import { fetchClassificationRules } from './classificationRulesAdapter.js';
import { EDITION_IDS, getEdition, getFieldLabel } from '../../../state/editions.js';

const RULE_TYPE_LABELS = { source: 'Sumber', url: 'URL', keyword: 'Kata kunci' };

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('ms-MY', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ClassificationRulesList({ supabase }) {
  const [rules, setRules] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  // Default 'active': archived rows are hidden until explicitly asked
  // for — same behaviour as FilterRulesManager.jsx's existing filter
  // convention. This is the LIST view's own preference only; it has zero
  // effect on ClassificationProvenance, which never applies this filter.
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterEdition, setFilterEdition] = useState('all');
  const [filterField, setFilterField] = useState('all');

  useEffect(() => {
    setRules(null);
    setError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setError(err.message));
  }, [supabase]);

  const targetLabel = rule => rule.edition_id
    ? getFieldLabel(rule.edition_id, rule.field_code)
    : `${rule.subject_code ?? '—'} (global)`;

  const scopeLabel = rule => rule.edition_id
    ? getEdition(rule.edition_id).label
    : 'Global';

  const fieldOptions = [...new Set(
    (rules ?? []).map(r => r.edition_id ? r.field_code : r.subject_code).filter(Boolean)
  )];

  const filtered = (rules ?? []).filter(r =>
    (filterType === 'all' || r.rule_type === filterType) &&
    (filterStatus === 'all' || r.status === filterStatus) &&
    (filterEdition === 'all' ||
      (filterEdition === 'global' ? r.edition_id === null : r.edition_id === filterEdition)) &&
    (filterField === 'all' || (r.edition_id ? r.field_code : r.subject_code) === filterField)
  );

  return (
    <section className="classification-rules">
      {error && <p className="classification-rules__error">Tidak dapat dimuatkan: {error}</p>}
      {rules === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {rules !== null && rules.length === 0 && (
        <p className="classification-rules__empty">
          Tiada pelarasan admin lagi -- sistem tentukan bidang setiap berita sendiri berdasarkan
          petunjuk sumber/RSS/kandungan (lihat Pemetaan Sumber, Petunjuk RSS/URL, Feed Campuran di atas).
        </p>
      )}

      {rules !== null && rules.length > 0 && (
        <>
          <div className="classification-rules__filters">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">Semua Jenis</option>
              <option value="source">Sumber</option>
              <option value="url">URL</option>
              <option value="keyword">Kata kunci</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="active">Aktif</option>
              <option value="archived">Diarkibkan</option>
              <option value="all">Semua Status</option>
            </select>
            <select value={filterEdition} onChange={e => setFilterEdition(e.target.value)}>
              <option value="all">Semua Skop</option>
              <option value="global">Global</option>
              {EDITION_IDS.map(id => (
                <option key={id} value={id}>{getEdition(id).label}</option>
              ))}
            </select>
            <select value={filterField} onChange={e => setFilterField(e.target.value)}>
              <option value="all">Semua Kategori</option>
              {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {filtered.length === 0 && (
            <p className="classification-rules__empty">Tiada peraturan sepadan dengan penapis ini.</p>
          )}

          <ul className="classification-rules__list">
            {filtered.map(rule => (
              <li
                key={rule.id}
                className={`classification-rules__row${rule.status === 'archived' ? ' classification-rules__row--archived' : ''}`}
              >
                <span className="classification-rules__type">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}</span>
                <span className="classification-rules__pattern">
                  {rule.pattern}
                  {rule.sourceName && <em className="classification-rules__source-name"> ({rule.sourceName})</em>}
                </span>
                <span className="classification-rules__arrow">→</span>
                <span className="classification-rules__target">{targetLabel(rule)}</span>
                <span className="classification-rules__scope">{scopeLabel(rule)}</span>
                <span className="classification-rules__priority">Keutamaan {rule.priority}</span>
                <span className="classification-rules__status">{rule.status === 'archived' ? 'Diarkibkan' : 'Aktif'}</span>
                <span className="classification-rules__created">
                  {rule.created_by ? `${rule.created_by} · ` : ''}{formatTimestamp(rule.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
