// SourceRegistryPanel.jsx — Admin Console V2, "Sumber" menu.
//
// Round 3/15 (2026-08-19): TABLE when the editor needs to scan/compare
// many rows, CARD only for reading one item with context, FORM for
// decisions. Sumber is registry/inventory data -- many rows, needs
// sort/filter/scan -- so it's a table, not a card list. Locked after
// Izzat's direct correction on the first draft.
//
// Round 10/15: table stays the operational center; "+ Tambah sumber" and
// row "Ubah" now open a real drawer/form wired to the FULL write surface
// traced in db/source-registry-adapter.mjs (addSource/updateSource/
// setSourceStatus -- all three, not just the two this panel used before).
// Every field offered here is one addSource()/updateSource() actually
// accepts; nothing is exposed that the adapter would silently ignore or
// reject. Fields the adapter has NO write path for (id, language) show an
// honest "belum boleh diubah" note in the edit drawer instead of a fake
// disabled input.
//
// Read path unchanged: fetchAllSourcesForIngestion from
// db/source-registry-adapter.mjs (browser-safe read, no admin gate) --
// NOT lab/sources.js, that's fixture/reference only.
//
// exclude_patterns/extra_ca are real but technical/rarely-relevant --
// kept in the drawer's technical section, never a table column or a
// primary add-form field.

import { useState, useEffect, useMemo } from 'react';
import { fetchAllSourcesForIngestion, addSource, updateSource, setSourceStatus } from '../../../db/source-registry-adapter.mjs';
import { getEdition } from '../../../state/editions.js';

// known_category values observed in production (db/generate-source-
// registry-production-migration.mjs carries lab/sources.js's sourceType/
// knownCategory straight into the sources table) match ms-MY's real
// taxonomy field_codes exactly (e.g. 'bisnes', 'sukan') -- this is the
// SAME vocabulary classification/lib/taxonomy-registry.mjs defines, not a
// separate guessed list. ms-MY specifically because every existing
// knownCategory value in the fixture/migration is an ms-MY field_code;
// the sources table itself carries no edition_id to scope this by.
const MS_MY_TAXONOMY = getEdition('ms-MY');
const BIDANG_OPTIONS = MS_MY_TAXONOMY.taxonomyFieldCodes.map((code, i) => ({ code, label: MS_MY_TAXONOMY.taxonomy[i] }));

// sourceType is a real two-value enum -- every row in lab/sources.js
// (the fixture the production migration was generated FROM, per
// db/generate-source-registry-production-migration.mjs) uses only these
// two values for source_type. Translated to editor language here; the
// DB column itself stores the English enum value unchanged.
const JENIS_OPTIONS = [
  { value: 'general', label: 'Am' },
  { value: 'specialised', label: 'Khusus' },
];

export default function SourceRegistryPanel({ supabase, role }) {
  const [sources, setSources] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | disabled | archived
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1); // 1 asc, -1 desc
  const [openId, setOpenId] = useState(null); // drawer (view/edit an existing source)
  const [addOpen, setAddOpen] = useState(false); // drawer (add new source)
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  const load = () => {
    setSources(null);
    setError(null);
    fetchAllSourcesForIngestion(supabase)
      .then(setSources)
      .catch(err => setError(err.message));
  };

  useEffect(load, [supabase]);

  const counts = useMemo(() => {
    if (!sources) return null;
    return {
      active: sources.filter(s => s.status === 'active').length,
      inactive: sources.filter(s => s.status !== 'active').length,
    };
  }, [sources]);

  const rows = useMemo(() => {
    if (!sources) return [];
    const q = query.trim().toLowerCase();
    const filtered = sources.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.url ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    const val = s => {
      if (sortKey === 'trust') return s.trustScore ?? -1;
      if (sortKey === 'status') return s.status;
      return (s.name ?? '').toLowerCase();
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }, [sources, query, statusFilter, sortKey, sortDir]);

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  };

  // Post-action: refresh straight from public.sources (never optimistic
  // local state) so the table can never show something the DB doesn't
  // actually have -- per Pusingan 10's explicit instruction.
  const runAction = async (fn, successMessage) => {
    setActionError(null);
    setActionMessage(null);
    try {
      await fn();
      load();
      setActionMessage(successMessage);
    } catch (err) {
      setActionError(err.message);
      throw err;
    }
  };

  const toggleStatus = async source => {
    const nextStatus = source.status === 'active' ? 'disabled' : 'active';
    let reason = null;
    if (nextStatus === 'disabled') {
      // setSourceStatus requires a reason for any non-active status
      // (db/source-registry-adapter.mjs) -- same discipline as
      // story_overrides.reason NOT NULL elsewhere in this app.
      reason = window.prompt(
        'Sumber ini tidak akan digunakan untuk pengambilan berita baharu. Rekod lama tidak dipadam.\n\nSebab nyahaktifkan?',
      );
      if (!reason || !reason.trim()) return;
    }
    setBusyId(source.id);
    try {
      await runAction(
        () => setSourceStatus(supabase, { id: source.id, status: nextStatus, reason, role }),
        nextStatus === 'active' ? `"${source.name}" diaktifkan semula.` : `"${source.name}" dinyahaktifkan.`,
      );
    } catch {
      // error already surfaced via actionError
    } finally {
      setBusyId(null);
    }
  };

  const openSource = rows.find(s => s.id === openId) ?? null;

  return (
    <div className="source-registry">
      <p className="source-registry__note">
        Senarai sumber sebenar (produksi). Tambah/aktif/nyahaktif ditulis terus ke pangkalan data
        sebaik disahkan.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan sumber: {error}</p>}
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {actionMessage && <p className="source-registry__summary">{actionMessage}</p>}
      {sources === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {sources !== null && (
        <>
          <p className="source-registry__summary">
            <b>{counts.active}</b> aktif &middot; <b>{counts.inactive}</b> tidak aktif
          </p>
          <div className="classification-rules__filters">
            <button type="button" onClick={() => setAddOpen(true)}>+ Tambah sumber</button>
            <input
              type="text"
              placeholder="Cari sumber..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Semua status</option>
              <option value="active">Aktif</option>
              <option value="disabled">Tidak aktif</option>
              <option value="archived">Diarkibkan</option>
            </select>
          </div>

          {rows.length === 0 && (
            <p className="review-queue__empty">Tiada sumber sepadan carian.</p>
          )}

          {rows.length > 0 && (
            <div className="source-table-wrap">
              <table className="source-table">
                <thead>
                  <tr>
                    <th className="source-table__sortable" onClick={() => toggleSort('name')}>
                      Sumber{sortKey === 'name' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th>Jenis</th>
                    <th>Kategori</th>
                    <th className="source-table__sortable" onClick={() => toggleSort('status')}>
                      Status{sortKey === 'status' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className="source-table__sortable" onClick={() => toggleSort('trust')}>
                      Kepercayaan{sortKey === 'trust' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th>URL</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id} className={s.status !== 'active' ? 'source-table__row--inactive' : ''}>
                      <td className="source-table__name">{s.name}</td>
                      <td>{JENIS_OPTIONS.find(o => o.value === s.sourceType)?.label ?? s.sourceType ?? '—'}</td>
                      <td>{BIDANG_OPTIONS.find(o => o.code === s.knownCategory)?.label ?? s.knownCategory ?? '—'}</td>
                      <td>
                        <span className={`source-registry__status source-registry__status--${s.status}`}>
                          {s.status === 'active' ? 'Aktif' : s.status === 'disabled' ? 'Tidak aktif' : 'Diarkibkan'}
                        </span>
                      </td>
                      <td className="source-table__num">{s.trustScore ?? '—'}</td>
                      <td className="source-table__url" title={s.url}>{s.url}</td>
                      <td className="source-table__actions">
                        <button type="button" onClick={() => setOpenId(s.id)}>Lihat</button>
                        <button type="button" disabled={busyId === s.id} onClick={() => toggleStatus(s)}>
                          {busyId === s.id ? '...' : s.status === 'active' ? 'Nyahaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {addOpen && (
        <AddSourceDrawer
          supabase={supabase}
          role={role}
          onDone={message => { setAddOpen(false); load(); setActionMessage(message); setActionError(null); }}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {openSource && (
        <SourceDrawer
          source={openSource}
          supabase={supabase}
          role={role}
          onClose={() => setOpenId(null)}
          onSaved={message => { load(); setActionMessage(message); setActionError(null); }}
        />
      )}
    </div>
  );
}

function SourceDrawer({ source, supabase, role, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url);
  const [trustScore, setTrustScore] = useState(source.trustScore ?? 0);
  const [sourceType, setSourceType] = useState(source.sourceType ?? '');
  const [knownCategory, setKnownCategory] = useState(source.knownCategory ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateSource(supabase, {
        id: source.id,
        name: name.trim(),
        url: url.trim(),
        trustScore: Number(trustScore),
        sourceType: sourceType || null,
        knownCategory: knownCategory || null,
        role,
      });
      setEditing(false);
      onSaved(`"${name.trim()}" dikemas kini.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <button type="button" className="drawer__close" onClick={onClose}>Tutup</button>
        <h3 className="drawer__title">{source.name}</h3>

        {!editing ? (
          <>
            <dl className="drawer__fields">
              <dt>URL</dt><dd><code>{source.url}</code></dd>
              <dt>Status</dt><dd>{source.status === 'active' ? 'Aktif' : source.status === 'disabled' ? 'Tidak aktif' : 'Diarkibkan'}</dd>
              <dt>Kepercayaan</dt><dd>{source.trustScore ?? '—'}</dd>
              <dt>Bahasa</dt><dd>{source.language ?? '—'} <span className="admin-app__status">(belum boleh diubah daripada Admin)</span></dd>
              <dt>Jenis</dt><dd>{JENIS_OPTIONS.find(o => o.value === source.sourceType)?.label ?? source.sourceType ?? '—'}</dd>
              <dt>Kategori</dt><dd>{BIDANG_OPTIONS.find(o => o.code === source.knownCategory)?.label ?? source.knownCategory ?? '—'}</dd>
              {source.excludePatterns && <><dt>Corak dikecualikan</dt><dd>{source.excludePatterns.map(String).join(', ')}</dd></>}
              {source.extraCa && <><dt>Sijil tambahan</dt><dd>Ada (extra_ca) <span className="admin-app__status">(belum boleh diubah daripada Admin)</span></dd></>}
            </dl>
            <div className="review-card__actions">
              <button type="button" onClick={() => setEditing(true)}>Ubah</button>
            </div>
          </>
        ) : (
          <form className="source-registry__add" onSubmit={save}>
            {error && <p className="review-queue__error">{error}</p>}
            <label className="review-card__field">
              Nama sumber
              <input type="text" value={name} onChange={e => setName(e.target.value)} required disabled={busy} />
            </label>
            <label className="review-card__field">
              URL RSS/API
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} required disabled={busy} />
            </label>
            <label className="review-card__field">
              Kepercayaan (0-100)
              <input type="number" min="0" max="100" value={trustScore} onChange={e => setTrustScore(e.target.value)} disabled={busy} />
            </label>
            <label className="review-card__field">
              Jenis
              <select value={sourceType} onChange={e => setSourceType(e.target.value)} disabled={busy}>
                <option value="">— Tiada —</option>
                {JENIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="review-card__field">
              Kategori
              <select value={knownCategory} onChange={e => setKnownCategory(e.target.value)} disabled={busy}>
                <option value="">— Tiada kategori khusus —</option>
                {BIDANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </label>
            <p className="admin-app__status">Bahasa dan pengecal sistem tidak boleh diubah daripada Admin.</p>
            <div className="review-card__actions">
              <button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button>
              <button type="button" className="review-card__cancel" onClick={() => setEditing(false)} disabled={busy}>Batal</button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}

function AddSourceDrawer({ supabase, role, onDone, onCancel }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('ms');
  const [trustScore, setTrustScore] = useState(80);
  const [sourceType, setSourceType] = useState('');
  const [knownCategory, setKnownCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const bidangLabel = BIDANG_OPTIONS.find(o => o.code === knownCategory)?.label ?? 'Tiada';

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addSource(supabase, {
        id: id.trim(),
        name: name.trim(),
        url: url.trim(),
        language,
        trustScore: Number(trustScore),
        sourceType: sourceType || null,
        knownCategory: knownCategory || null,
        role,
      });
      onDone(`"${name.trim()}" ditambah sebagai aktif.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <button type="button" className="drawer__close" onClick={onCancel}>Tutup</button>
        <h3 className="drawer__title">Tambah sumber</h3>
        <form className="source-registry__add" onSubmit={submit}>
          {error && <p className="review-queue__error">{error}</p>}
          <label className="review-card__field">
            Pengecal sistem (unik, cth: rss-contoh)
            <input type="text" value={id} onChange={e => setId(e.target.value)} required disabled={busy} />
          </label>
          <label className="review-card__field">
            Nama sumber
            <input type="text" value={name} onChange={e => setName(e.target.value)} required disabled={busy} />
          </label>
          <label className="review-card__field">
            URL RSS/API
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} required disabled={busy} />
          </label>
          <label className="review-card__field">
            Bahasa
            <select value={language} onChange={e => setLanguage(e.target.value)} disabled={busy}>
              <option value="ms">Melayu</option>
              <option value="en">Inggeris</option>
              <option value="ar">Arab</option>
            </select>
          </label>
          <label className="review-card__field">
            Kepercayaan (0-100)
            <input type="number" min="0" max="100" value={trustScore} onChange={e => setTrustScore(e.target.value)} disabled={busy} />
          </label>
          <label className="review-card__field">
            Jenis
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} disabled={busy}>
              <option value="">— Tiada —</option>
              {JENIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="review-card__field">
            Kategori (jika feed ini khusus satu kategori sahaja)
            <select value={knownCategory} onChange={e => setKnownCategory(e.target.value)} disabled={busy}>
              <option value="">— Tiada kategori khusus —</option>
              {BIDANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </label>

          <p className="filter-effect__summary">
            Sumber akan ditambah sebagai aktif<br />
            Nama: <b>{name || '—'}</b><br />
            URL: <b>{url || '—'}</b><br />
            Kategori: <b>{bidangLabel}</b>
          </p>

          <div className="review-card__actions">
            <button type="submit" disabled={busy || !id.trim() || !name.trim() || !url.trim()}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
            <button type="button" className="review-card__cancel" onClick={onCancel} disabled={busy}>Batal</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
