import { useState } from 'react';

// FilterRulesManager.jsx — Editorial Filter Rules V1, per
// docs/editorial-filter-rules-design-v1.md and ChatGPT's 2026-08-16
// instruction: "set dasar sekali -> sistem terus bekerja sendiri", not a
// daily-maintenance surface for an admin who logs in roughly weekly.
//
// Deliberately simple, per explicit instruction NOT to build: score,
// priority, drag-and-drop ordering, per-source/per-field scoping, AI
// suggestion, fuzzy matching, or a new dashboard. Two plain lists —
// "Kata yang dibuang" (exclude) and "Kecuali jika" (except) — add,
// toggle active/inactive, delete. `reason` is optional and purely a
// memory aid for the admin, never part of matching logic
// (state/editorialFilterResolver.mjs never reads it).
export default function FilterRulesManager({ rules, busy, onAdd, onToggle, onDelete }) {
  const excludeRules = rules?.filter(r => r.rule_type === 'exclude') ?? [];
  const exceptRules = rules?.filter(r => r.rule_type === 'except') ?? [];

  return (
    <article className="filter-rules">
      <h3 className="editorial-desk__placeholder-title">Penapisan Editorial</h3>
      <p className="editorial-desk__placeholder-desc">
        Tetapkan kata/frasa sekali — sistem terus menapis berita secara
        automatik setiap hari, tanpa perlu awak semak setiap kali.
      </p>

      <FilterRuleList
        label="Kata yang dibuang"
        emptyLabel="Tiada kata dibuang buat masa ini."
        rules={excludeRules}
        ruleType="exclude"
        busy={busy}
        onAdd={onAdd}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      <FilterRuleList
        label="Kecuali jika"
        emptyLabel="Tiada pengecualian buat masa ini."
        rules={exceptRules}
        ruleType="except"
        busy={busy}
        onAdd={onAdd}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    </article>
  );
}

function FilterRuleList({ label, emptyLabel, rules, ruleType, busy, onAdd, onToggle, onDelete }) {
  const [phrase, setPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);

  const submit = e => {
    e.preventDefault();
    if (!phrase.trim()) return;
    onAdd({ ruleType, phrase: phrase.trim(), reason: reason.trim() || null });
    setPhrase('');
    setReason('');
    setShowReason(false);
  };

  return (
    <div className="filter-rules__list">
      <h4 className="filter-rules__list-title">{label}</h4>

      {rules.length === 0 && <p className="review-queue__empty">{emptyLabel}</p>}

      {rules.map(rule => (
        <div key={rule.id} className={`filter-rules__row${rule.active ? '' : ' filter-rules__row--inactive'}`}>
          <span className="filter-rules__phrase">{rule.phrase}</span>
          {rule.reason && <span className="filter-rules__reason">{rule.reason}</span>}
          <div className="filter-rules__row-actions">
            <button type="button" disabled={busy} onClick={() => onToggle(rule.id, !rule.active)}>
              {rule.active ? 'Nyahaktifkan' : 'Aktifkan'}
            </button>
            <button type="button" disabled={busy} onClick={() => onDelete(rule.id)}>
              Buang
            </button>
          </div>
        </div>
      ))}

      <form className="filter-rules__add" onSubmit={submit}>
        <input
          type="text"
          placeholder="Tambah kata/frasa"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          disabled={busy}
        />
        {showReason ? (
          <input
            type="text"
            placeholder="Sebab (opsyenal)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={busy}
          />
        ) : (
          <button type="button" className="filter-rules__reason-toggle" onClick={() => setShowReason(true)} disabled={busy}>
            + sebab
          </button>
        )}
        <button type="submit" disabled={busy || !phrase.trim()}>+ Tambah kata</button>
      </form>
    </div>
  );
}
