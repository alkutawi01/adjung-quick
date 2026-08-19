// TapisanPanel.jsx — Admin Console V2, "Tapisan" menu.
//
// Pusingan 9/15 (2026-08-19). Per ChatGPT: table-first, not a collection
// of panels -- replaces FilterRulesManager.jsx + FilterRuleEffect.jsx's
// side-by-side layout with two dense tables sharing one mental model.
//
// Polish 5B (2026-08-19) -- "Find & Replace" mental model: a rule (new,
// or an archived one being reactivated) MUST be previewed against the
// live corpus before it can affect readers. Preview is read-only (zero
// writes) and simulates the REAL rule set (candidate + currently active
// rules together, via previewFilterRuleCandidate()), not just "does this
// phrase appear anywhere" -- so an except candidate correctly shows 0
// rescued stories when no active exclude rule would have caught them.
//
// Locked semantic (state/editorialFilterResolver.mjs, unchanged since
// design v1): EXCEPT is GLOBAL -- any active except phrase saves a story
// from ANY active exclude phrase, first-match-wins across the whole rule
// set. This UI deliberately does NOT pair one exclude row visually with
// one except row (no "skandal <-> bertaubat" grouping) -- that would
// misrepresent the resolver's real precedence as a per-rule relationship
// it doesn't have.
import { useState, useMemo } from 'react';
import { previewFilterRuleCandidate } from './reviewQueueAdapter.js';

export default function TapisanPanel({ supabase, rules, effects, effectsError, busy, onAdd, onToggle }) {
  const [openRuleId, setOpenRuleId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reactivateId, setReactivateId] = useState(null);

  const excludeRules = useMemo(() => (rules ?? []).filter(r => r.rule_type === 'exclude'), [rules]);
  const exceptRules = useMemo(() => (rules ?? []).filter(r => r.rule_type === 'except'), [rules]);
  const effectByRuleId = useMemo(() => new Map((effects ?? []).map(e => [e.ruleId, e])), [effects]);

  const openEffect = openRuleId ? effectByRuleId.get(openRuleId) : null;
  const openRule = openRuleId ? (rules ?? []).find(r => r.id === openRuleId) : null;
  const reactivateRule = reactivateId ? (rules ?? []).find(r => r.id === reactivateId) : null;

  return (
    <div className="tapisan-panel">
      <p className="bidang-panel__intro">
        Tapisan buang berita ikut kata/frasa dalam tajuk atau huraian — tetapkan sekali, sistem
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
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rule.active ? onToggle(rule.id, false) : setReactivateId(rule.id)}
                      >
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
        tapisan — tidak kira peraturan tapisan mana yang termatuh. Pengecualian bukan pasangan
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
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => rule.active ? onToggle(rule.id, false) : setReactivateId(rule.id)}
                    >
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
          supabase={supabase}
          busy={busy}
          onAdd={payload => { onAdd(payload); setAddOpen(false); }}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {reactivateRule && (
        <div className="drawer-overlay" onClick={() => setReactivateId(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setReactivateId(null)}>Tutup</button>
            <h3 className="drawer__title">Aktifkan semula: "{reactivateRule.phrase}"</h3>
            <ReactivatePreview
              supabase={supabase}
              rule={reactivateRule}
              busy={busy}
              onConfirm={() => { onToggle(reactivateRule.id, true); setReactivateId(null); }}
              onCancel={() => setReactivateId(null)}
            />
          </aside>
        </div>
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

// Polish 5B -- reactivating an archived rule now goes through the same
// preview-before-write gate a brand-new rule does (per ChatGPT: "Pulih
// terus memanggil setFilterRuleActive... ubah hanya laluan pengaktifan").
function ReactivatePreview({ supabase, rule, busy, onConfirm, onCancel }) {
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    setPreviewError(null);
    try {
      const result = await previewFilterRuleCandidate(supabase, { ruleType: rule.rule_type, phrase: rule.phrase });
      setPreview(result);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rule-preview">
      {!preview && !checking && (
        <button type="button" onClick={runCheck} disabled={busy}>Semak kesan</button>
      )}
      {checking && <p className="admin-app__status">Menyemak…</p>}
      {previewError && <p className="review-queue__error">{previewError}</p>}
      {preview && <RulePreviewResult preview={preview} />}
      <div className="card__actions">
        {preview && (
          <button type="button" disabled={busy} onClick={onConfirm}>Aktifkan semula</button>
        )}
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </div>
  );
}

// Shared preview result renderer -- copy per ChatGPT's exact spec:
// exclude candidates use "ditapis"/"dikecualikan" language; except
// candidates deliberately avoid the word "ditapis" (they never hide
// anything themselves).
function RulePreviewResult({ preview }) {
  if (preview.ruleType === 'exclude') {
    if (preview.matchedCount === 0) {
      return (
        <p className="admin-app__status">
          Tiada berita semasa sepadan. Peraturan ini masih boleh mempengaruhi berita baharu pada
          masa hadapan.
        </p>
      );
    }
    return (
      <div className="rule-preview__result">
        <p className="filter-effect__summary">
          Kesan jika peraturan ini diaktifkan: <b>{preview.matchedCount}</b> berita sepadan
          &middot; <b>{preview.filteredCount}</b> akan ditapis
          {preview.exceptedCount > 0 && <> &middot; <b>{preview.exceptedCount}</b> akan kekal kerana pengecualian</>}
        </p>
        {preview.sampleFiltered.length > 0 && (
          <>
            <h4 className="filter-rules__list-title">Contoh berita yang akan ditapis</h4>
            <ul className="filter-effect__list">
              {preview.sampleFiltered.map(s => (
                <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--filtered">Ditapis</span> {s.title} <span className="filter-effect__meta">({s.sourceName})</span></li>
              ))}
            </ul>
          </>
        )}
        {preview.sampleExcepted.length > 0 && (
          <>
            <h4 className="filter-rules__list-title">Contoh berita yang akan kekal</h4>
            <ul className="filter-effect__list">
              {preview.sampleExcepted.map(s => (
                <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--excepted">Kekal</span> {s.title} <span className="filter-effect__meta">({s.sourceName}, oleh "{s.savedByPhrase}")</span></li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  // except
  if (preview.matchedCount === 0) {
    return (
      <p className="admin-app__status">
        Tiada berita semasa sepadan. Peraturan ini masih boleh mempengaruhi berita baharu pada
        masa hadapan.
      </p>
    );
  }
  return (
    <div className="rule-preview__result">
      <p className="filter-effect__summary">
        <b>{preview.matchedCount}</b> berita sepadan dengan frasa ini &middot; <b>{preview.savedCount}</b> berita
        yang kini ditapis akan diselamatkan &middot; <b>{preview.alreadyKeptCount}</b> berita sudah pun kekal
      </p>
      {preview.sampleSaved.length > 0 && (
        <>
          <h4 className="filter-rules__list-title">Contoh berita yang akan diselamatkan</h4>
          <ul className="filter-effect__list">
            {preview.sampleSaved.map(s => (
              <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--excepted">Diselamatkan</span> {s.title} <span className="filter-effect__meta">({s.sourceName})</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AddRuleForm({ supabase, busy, onAdd, onCancel }) {
  const [ruleType, setRuleType] = useState('exclude');
  const [phrase, setPhrase] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [checking, setChecking] = useState(false);

  // Polish 5B: changing type/phrase after a preview was run must
  // invalidate it -- the save button must never fire against a preview
  // that no longer matches what's about to be submitted.
  const changeRuleType = value => { setRuleType(value); setPreview(null); setPreviewError(null); };
  const changePhrase = value => { setPhrase(value); setPreview(null); setPreviewError(null); };

  const runCheck = async () => {
    if (!phrase.trim()) return;
    setChecking(true);
    setPreviewError(null);
    try {
      const result = await previewFilterRuleCandidate(supabase, { ruleType, phrase: phrase.trim() });
      setPreview(result);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const submit = e => {
    e.preventDefault();
    if (!phrase.trim() || !preview) return;
    onAdd({ ruleType, phrase: phrase.trim(), reason: null });
  };

  return (
    <form className="source-registry__add" onSubmit={submit}>
      <select value={ruleType} onChange={e => changeRuleType(e.target.value)} disabled={busy}>
        <option value="exclude">Tapis</option>
        <option value="except">Pengecualian</option>
      </select>
      <input
        type="text"
        placeholder="Corak"
        value={phrase}
        onChange={e => changePhrase(e.target.value)}
        disabled={busy}
      />

      {!preview && (
        <button type="button" onClick={runCheck} disabled={busy || checking || !phrase.trim()}>
          {checking ? 'Menyemak…' : 'Semak kesan'}
        </button>
      )}
      {previewError && <p className="review-queue__error">{previewError}</p>}
      {preview && <RulePreviewResult preview={preview} />}

      <div className="card__actions">
        {preview && (
          <>
            <button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan & aktifkan'}</button>
            <button type="button" className="btn--quiet" onClick={() => setPreview(null)} disabled={busy}>Ubah frasa</button>
          </>
        )}
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}
