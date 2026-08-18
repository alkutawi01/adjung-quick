import { useState } from 'react';
import { SUBJECT_VOCABULARY, GEOGRAPHY_VOCABULARY } from '../../../classification/lib/desk-vocabulary.mjs';

// EditionRulesManager.jsx — Backend Control Plane Fasa 4, Edition Rules
// Admin Self-Service (ms-MY only, per Izzat's locked scope). Per
// docs/control-plane-phase4-edition-rules-implementation-plan-v1.md and
// ChatGPT's UI acceptance checkpoint: Izzat must be able to manage this
// without understanding resolveAdminEditionRule() or the schema.
//
// Dropdowns, not free text, for condition_subject/geography/action_field —
// reuses the SAME vocabulary the real classifier matches against
// (desk-vocabulary.mjs's SUBJECT_VOCABULARY/GEOGRAPHY_VOCABULARY values,
// and this edition's own live taxonomy field codes) so a rule an admin
// creates can never target a value the classifier doesn't recognize.
const UNIVERSAL_SUBJECTS = [...new Set(Object.values(SUBJECT_VOCABULARY))].sort();
const UNIVERSAL_GEOGRAPHIES = [...new Set(Object.values(GEOGRAPHY_VOCABULARY))].sort();

// The one built-in rule that ships in code (classification/lib/edition-
// rules.mjs) — shown as read-only context so Izzat can see it's there
// and understand why a story might route to Dunia even with zero admin
// rules. This is NOT fetched from the DB (it isn't stored there,
// deliberately — default+override model) — it's a static description of
// what the code currently does, kept in sync by hand since it's a single
// fixed fact, not a list that grows.
const BUILT_IN_RULE_DESCRIPTION = 'Cerita Politik dari luar Malaysia dipaparkan di bawah Dunia (bukan Politik) — peraturan asas sistem, sentiasa aktif.';

export default function EditionRulesManager({ editionLabel, taxonomyFieldCodes, taxonomyFieldLabels, rules, busy, onAdd, onArchive, onRestore }) {
  const activeRules = rules?.filter(r => r.status === 'active') ?? [];
  const archivedRules = rules?.filter(r => r.status === 'archived') ?? [];

  const fieldLabelFor = code => {
    const idx = taxonomyFieldCodes.indexOf(code);
    return idx === -1 ? code : taxonomyFieldLabels[idx];
  };

  return (
    <article className="edition-rules">
      <h3 className="editorial-desk__placeholder-title">Peraturan Susunan Edisi — {editionLabel}</h3>
      <p className="editorial-desk__placeholder-desc">
        Tentukan bila sesuatu Bidang patut dipaparkan di bawah Kategori
        lain untuk edisi ini. Peraturan yang awak tambah di sini akan
        DIUTAMAKAN berbanding peraturan asas sistem di bawah.
      </p>

      <div className="edition-rules__builtin">
        <span className="edition-rules__builtin-label">Peraturan asas sistem (tak boleh diubah di sini):</span>
        <p className="edition-rules__builtin-desc">{BUILT_IN_RULE_DESCRIPTION}</p>
      </div>

      <h4 className="filter-rules__list-title">Peraturan Admin — Aktif</h4>
      {activeRules.length === 0 && (
        <p className="review-queue__empty">
          Tiada peraturan admin lagi. Sistem guna peraturan asas sahaja (di atas).
        </p>
      )}
      {activeRules.map(rule => (
        <EditionRuleRow key={rule.id} rule={rule} fieldLabelFor={fieldLabelFor} busy={busy} onArchive={onArchive} />
      ))}

      {archivedRules.length > 0 && (
        <>
          <h4 className="filter-rules__list-title">Diarkibkan</h4>
          {archivedRules.map(rule => (
            <EditionRuleRow key={rule.id} rule={rule} fieldLabelFor={fieldLabelFor} busy={busy} onRestore={onRestore} archived />
          ))}
        </>
      )}

      <AddEditionRuleForm
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        busy={busy}
        onAdd={onAdd}
      />
    </article>
  );
}

function EditionRuleRow({ rule, fieldLabelFor, busy, onArchive, onRestore, archived }) {
  const [showArchiveReason, setShowArchiveReason] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  const geographyText = rule.condition_geography_type === 'not'
    ? `bukan dari ${rule.condition_geography_value}`
    : rule.condition_geography_type === 'is'
      ? `dari ${rule.condition_geography_value}`
      : null;

  return (
    <div className={`edition-rules__row${archived ? ' edition-rules__row--archived' : ''}`}>
      <span className="edition-rules__condition">
        {rule.condition_subject}{geographyText ? `, ${geographyText}` : ''}
      </span>
      <span className="edition-rules__arrow">→</span>
      <span className="edition-rules__target">{fieldLabelFor(rule.action_field_code)}</span>
      <span className="edition-rules__priority">Keutamaan {rule.priority}</span>
      {archived && rule.reason && <span className="edition-rules__reason">Sebab: {rule.reason}</span>}

      <div className="edition-rules__row-actions">
        {!archived && !showArchiveReason && (
          <button type="button" disabled={busy} onClick={() => setShowArchiveReason(true)}>
            Arkibkan
          </button>
        )}
        {!archived && showArchiveReason && (
          <form
            className="edition-rules__archive-form"
            onSubmit={e => {
              e.preventDefault();
              if (!archiveReason.trim()) return;
              onArchive(rule.id, archiveReason.trim());
              setShowArchiveReason(false);
              setArchiveReason('');
            }}
          >
            <input
              type="text"
              placeholder="Sebab arkibkan (wajib)"
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !archiveReason.trim()}>Sahkan</button>
            <button type="button" disabled={busy} onClick={() => { setShowArchiveReason(false); setArchiveReason(''); }}>Batal</button>
          </form>
        )}
        {archived && (
          <button type="button" disabled={busy} onClick={() => onRestore(rule.id)}>
            Aktifkan Semula
          </button>
        )}
      </div>
    </div>
  );
}

function AddEditionRuleForm({ taxonomyFieldCodes, taxonomyFieldLabels, busy, onAdd }) {
  const [subject, setSubject] = useState('');
  const [geographyType, setGeographyType] = useState('');
  const [geographyValue, setGeographyValue] = useState('');
  const [fieldCode, setFieldCode] = useState('');
  const [priority, setPriority] = useState(1);

  const canSubmit = subject && fieldCode && (!geographyType || geographyValue) && !busy;

  const submit = e => {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({
      conditionSubject: subject,
      conditionGeographyType: geographyType || null,
      conditionGeographyValue: geographyType ? geographyValue : null,
      actionFieldCode: fieldCode,
      priority: Number(priority) || 0,
    });
    setSubject('');
    setGeographyType('');
    setGeographyValue('');
    setFieldCode('');
    setPriority(1);
  };

  return (
    <form className="edition-rules__add" onSubmit={submit}>
      <h4 className="filter-rules__list-title">Tambah Peraturan Baharu</h4>

      <label className="edition-rules__field">
        Bila cerita ini Bidang:
        <select value={subject} onChange={e => setSubject(e.target.value)} disabled={busy}>
          <option value="">— Pilih Bidang —</option>
          {UNIVERSAL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <label className="edition-rules__field">
        Dan (opsyenal) geografi:
        <select value={geographyType} onChange={e => setGeographyType(e.target.value)} disabled={busy}>
          <option value="">— Tiada syarat geografi —</option>
          <option value="is">Dari negara/kawasan ini:</option>
          <option value="not">Bukan dari negara/kawasan ini:</option>
        </select>
      </label>

      {geographyType && (
        <label className="edition-rules__field">
          Negara/Kawasan:
          <select value={geographyValue} onChange={e => setGeographyValue(e.target.value)} disabled={busy}>
            <option value="">— Pilih —</option>
            {UNIVERSAL_GEOGRAPHIES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      )}

      <label className="edition-rules__field">
        Papar di bawah Kategori:
        <select value={fieldCode} onChange={e => setFieldCode(e.target.value)} disabled={busy}>
          <option value="">— Pilih Kategori —</option>
          {taxonomyFieldCodes.map((code, i) => (
            <option key={code} value={code}>{taxonomyFieldLabels[i]}</option>
          ))}
        </select>
      </label>

      <label className="edition-rules__field">
        Keutamaan (nombor lebih tinggi = diutamakan bila 2 peraturan berlanggar):
        <input type="number" value={priority} onChange={e => setPriority(e.target.value)} disabled={busy} min={0} />
      </label>

      <button type="submit" disabled={!canSubmit}>+ Tambah Peraturan</button>
    </form>
  );
}
