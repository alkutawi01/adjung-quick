// TapisanPanel.jsx — Admin Console V2, "Tapisan" menu.
//
// Pusingan 9/15 (2026-08-19). Per ChatGPT: table-first, not a collection
// of panels -- replaces FilterRulesManager.jsx + FilterRuleEffect.jsx's
// side-by-side layout with two dense tables sharing one mental model.
// Both existing adapters are reused as-is (fetchFilterRules,
// fetchEditorialFilterEffect, addFilterRule, setFilterRuleActive) -- no
// new query, no resolver change.
//
// Locked semantic (state/editorialFilterResolver.mjs, unchanged since
// design v1): EXCEPT is GLOBAL -- any active except phrase saves a story
// from ANY active exclude phrase, first-match-wins across the whole rule
// set. This UI deliberately does NOT pair one exclude row visually with
// one except row (no "skandal <-> bertaubat" grouping) -- that would
// misrepresent the resolver's real precedence as a per-rule relationship
// it doesn't have.
import { useState, useMemo } from 'react';

export default function TapisanPanel({ rules, effects, effectsError, busy, onAdd, onToggle }) {
  const [openRuleId, setOpenRuleId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const excludeRules = useMemo(() => (rules ?? []).filter(r => r.rule_type === 'exclude'), [rules]);
  const exceptRules = useMemo(() => (rules ?? []).filter(r => r.rule_type === 'except'), [rules]);
  const effectByRuleId = useMemo(() => new Map((effects ?? []).map(e => [e.ruleId, e])), [effects]);

  const openEffect = openRuleId ? effectByRuleId.get(openRuleId) : null;
  const openRule = openRuleId ? excludeRules.find(r => r.id === openRuleId) : null;

  return (
    <div className="tapisan-panel">
      <p className="bidang-panel__intro">
        Tapisan buang berita ikut kata/frasa dalam tajuk atau huraian -- tetapkan sekali, sistem
        terus bekerja setiap hari tanpa perlu disemak berulang kali.
      </p>

      <h2 className="bidang-panel__section-title">A. Peraturan tapisan</h2>
      {effectsError && <p className="review-queue__error">Ralat memuatkan kesan sebenar: {effectsError}</p>}
      {excludeRules.length === 0 ? (
        <p className="review-queue__empty">Tiada peraturan tapisan buat masa ini.</p>
      ) : (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Corak</th>
                <th>Sepadan</th>
                <th>Ditapis</th>
                <th>Dikecualikan</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {excludeRules.map(rule => {
                const effect = effectByRuleId.get(rule.id);
                return (
                  <tr key={rule.id} className={rule.active ? '' : 'source-table__row--inactive'}>
                    <td className="source-table__name">{rule.phrase}</td>
                    <td className="source-table__num">{rule.active ? (effect?.matchedCount ?? 0) : '—'}</td>
                    <td className="source-table__num">{rule.active ? (effect?.filteredCount ?? 0) : '—'}</td>
                    <td className="source-table__num">{rule.active ? (effect?.exceptedCount ?? 0) : '—'}</td>
                    <td><span className={`source-registry__status source-registry__status--${rule.active ? 'active' : 'disabled'}`}>{rule.active ? 'Aktif' : 'Diarkibkan'}</span></td>
                    <td className="source-table__actions">
                      {rule.active && <button type="button" onClick={() => setOpenRuleId(rule.id)}>Lihat</button>}
                      <button type="button" disabled={busy} onClick={() => onToggle(rule.id, !rule.active)}>
                        {rule.active ? 'Arkib' : 'Pulih'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="bidang-panel__section-title">B. Pengecualian global</h2>
      <p className="bidang-panel__section-desc">
        Jika berita sepadan dengan mana-mana pengecualian aktif, ia tidak ditapis oleh peraturan
        tapisan -- tidak kira peraturan tapisan mana yang termatuh. Pengecualian bukan pasangan
        khusus kepada satu peraturan tapisan tertentu.
      </p>
      {exceptRules.length === 0 ? (
        <p className="review-queue__empty">Tiada pengecualian buat masa ini.</p>
      ) : (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Corak pengecualian</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {exceptRules.map(rule => (
                <tr key={rule.id} className={rule.active ? '' : 'source-table__row--inactive'}>
                  <td className="source-table__name">{rule.phrase}</td>
                  <td><span className={`source-registry__status source-registry__status--${rule.active ? 'active' : 'disabled'}`}>{rule.active ? 'Aktif' : 'Diarkibkan'}</span></td>
                  <td className="source-table__actions">
                    <button type="button" disabled={busy} onClick={() => onToggle(rule.id, !rule.active)}>
                      {rule.active ? 'Arkib' : 'Pulih'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!addOpen && (
        <button type="button" onClick={() => setAddOpen(true)}>+ Tambah peraturan</button>
      )}
      {addOpen && (
        <AddRuleForm
          busy={busy}
          onAdd={payload => { onAdd(payload); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {openRule && (
        <div className="drawer-overlay" onClick={() => setOpenRuleId(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenRuleId(null)}>Tutup</button>
            <h3 className="drawer__title">Corak: "{openRule.phrase}"</h3>
            {openRule.reason && <p className="review-card__meta">{openRule.reason}</p>}
            {openEffect ? (
              <>
                <p className="filter-effect__summary">
                  Kesan semasa: <b>{openEffect.matchedCount}</b> berita sepadan &middot; <b>{openEffect.filteredCount}</b> ditapis
                  {openEffect.exceptedCount > 0 && <> &middot; <b>{openEffect.exceptedCount}</b> dikecualikan</>}
                </p>
                {openEffect.sampleFiltered.length > 0 && (
                  <>
                    <h4 className="filter-rules__list-title">Contoh berita ditapis</h4>
                    <ul className="filter-effect__list">
                      {openEffect.sampleFiltered.map(s => (
                        <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--filtered">Ditapis</span> {s.title} <span className="filter-effect__meta">({s.sourceName})</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {openEffect.sampleExcepted.length > 0 && (
                  <>
                    <h4 className="filter-rules__list-title">Contoh berita dikecualikan</h4>
                    <ul className="filter-effect__list">
                      {openEffect.sampleExcepted.map(s => (
                        <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--excepted">Dikecualikan</span> {s.title} <span className="filter-effect__meta">({s.sourceName}, oleh "{s.savedByPhrase}")</span></li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="admin-app__status">Tiada berita sepadan corak ini buat masa ini.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function AddRuleForm({ busy, onAdd, onCancel }) {
  const [ruleType, setRuleType] = useState('exclude');
  const [phrase, setPhrase] = useState('');

  const submit = e => {
    e.preventDefault();
    if (!phrase.trim()) return;
    onAdd({ ruleType, phrase: phrase.trim(), reason: null });
    setPhrase('');
  };

  return (
    <form className="source-registry__add" onSubmit={submit}>
      <select value={ruleType} onChange={e => setRuleType(e.target.value)} disabled={busy}>
        <option value="exclude">Tapis</option>
        <option value="except">Pengecualian</option>
      </select>
      <input
        type="text"
        placeholder="Corak"
        value={phrase}
        onChange={e => setPhrase(e.target.value)}
        disabled={busy}
      />
      <div className="card__actions">
        <button type="submit" disabled={busy || !phrase.trim()}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}
