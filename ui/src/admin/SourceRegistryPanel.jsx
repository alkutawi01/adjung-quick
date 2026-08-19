// SourceRegistryPanel.jsx — Admin Console V2, "Sumber" menu.
//
// Round 3/15 (2026-08-19), corrected same round after Izzat's direct
// pushback on the first draft ("kenapa awak tak guna table? cara awak ni
// buat editor menyampah. banyak kad"). Locked UI principle from that
// correction: TABLE when the editor needs to scan/compare many rows,
// CARD only for reading one item with context, FORM for decisions.
// Sumber is registry/inventory data -- many rows, needs sort/filter/scan
// -- so it's a table, not a card list.
//
// Reads REAL public.sources via db/source-registry-adapter.mjs::
// fetchAllSourcesForIngestion (browser-safe, no admin gate on read). NOT
// lab/sources.js -- that's fixture/reference only per the project's
// locked Fasa 1 finding.
//
// Write path (add/disable) traced before wiring: addSource/setSourceStatus
// follow the EXACT same convention already trusted elsewhere in this
// codebase (supabase client + role param, checked server-side via
// assertAdmin/isAdmin -- same shape as submitPinOverride, addEditionRule,
// addFilterRule). Wired here on that basis, but NOT claimed "verified
// working" -- no editor login credentials were available locally to
// actually submit one and confirm.
//
// exclude_patterns/extra_ca are real but technical/rarely-relevant --
// kept in the row-click detail drawer, never a table column.

import { useState, useEffect, useMemo } from 'react';
import { fetchAllSourcesForIngestion, addSource, setSourceStatus } from '../../../db/source-registry-adapter.mjs';

export default function SourceRegistryPanel({ supabase, role }) {
  const [sources, setSources] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | disabled | archived
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1); // 1 asc, -1 desc
  const [openId, setOpenId] = useState(null); // drawer
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [adding, setAdding] = useState(false);

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

  const toggleStatus = async source => {
    const nextStatus = source.status === 'active' ? 'disabled' : 'active';
    let reason = null;
    if (nextStatus === 'disabled') {
      reason = window.prompt(`Sebab nyahaktifkan "${source.name}"?`);
      if (!reason || !reason.trim()) return; // setSourceStatus requires a reason for non-active status
    }
    setBusyId(source.id);
    setActionError(null);
    try {
      await setSourceStatus(supabase, { id: source.id, status: nextStatus, reason, role });
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openSource = rows.find(s => s.id === openId) ?? null;

  return (
    <div className="source-registry">
      <p className="source-registry__note">
        Baca terus daripada <code>public.sources</code> (produksi sebenar). Tindakan
        tambah/nyahaktif guna path admin sebenar tetapi belum disahkan hujung-ke-hujung --
        tiada akaun editor tersedia tempatan untuk log masuk dan cuba sebenar.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan sumber: {error}</p>}
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {sources === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {sources !== null && (
        <>
          <p className="source-registry__summary">
            <b>{counts.active}</b> aktif &middot; <b>{counts.inactive}</b> tidak aktif
          </p>
          <div className="classification-rules__filters">
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
                    <th>Bidang</th>
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
                      <td>{s.sourceType ?? '—'}</td>
                      <td>{s.knownCategory ?? '—'}</td>
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
                          {busyId === s.id ? '...' : s.status === 'active' ? 'Nyahaktif' : 'Aktif'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!adding && (
            <button type="button" onClick={() => setAdding(true)}>+ Tambah sumber</button>
          )}
          {adding && (
            <AddSourceForm
              supabase={supabase}
              role={role}
              onDone={() => { setAdding(false); load(); }}
              onCancel={() => setAdding(false)}
            />
          )}
        </>
      )}

      {openSource && (
        <div className="drawer-overlay" onClick={() => setOpenId(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenId(null)}>Tutup</button>
            <h3 className="drawer__title">{openSource.name}</h3>
            <dl className="drawer__fields">
              <dt>URL</dt><dd><code>{openSource.url}</code></dd>
              <dt>Status</dt><dd>{openSource.status}</dd>
              <dt>Kepercayaan</dt><dd>{openSource.trustScore ?? '—'}</dd>
              <dt>Bahasa/Edisi</dt><dd>{openSource.language ?? '—'}</dd>
              <dt>Jenis</dt><dd>{openSource.sourceType ?? '—'}</dd>
              <dt>Bidang</dt><dd>{openSource.knownCategory ?? '—'}</dd>
              {openSource.excludePatterns && <><dt>Corak dikecualikan</dt><dd>{openSource.excludePatterns.map(String).join(', ')}</dd></>}
              {openSource.extraCa && <><dt>Sijil tambahan</dt><dd>Ada (extra_ca)</dd></>}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}

function AddSourceForm({ supabase, role, onDone, onCancel }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('ms');
  const [trustScore, setTrustScore] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addSource(supabase, { id: id.trim(), name: name.trim(), url: url.trim(), language, trustScore: Number(trustScore), role });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="source-registry__add" onSubmit={submit}>
      {error && <p className="review-queue__error">{error}</p>}
      <input type="text" placeholder="id (cth. rss-contoh)" value={id} onChange={e => setId(e.target.value)} required disabled={busy} />
      <input type="text" placeholder="Nama sumber" value={name} onChange={e => setName(e.target.value)} required disabled={busy} />
      <input type="text" placeholder="URL RSS/API" value={url} onChange={e => setUrl(e.target.value)} required disabled={busy} />
      <select value={language} onChange={e => setLanguage(e.target.value)} disabled={busy}>
        <option value="ms">Melayu</option>
        <option value="en">Inggeris</option>
        <option value="ar">Arab</option>
      </select>
      <input type="number" min="0" max="100" value={trustScore} onChange={e => setTrustScore(e.target.value)} disabled={busy} />
      <div className="card__actions">
        <button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan sumber'}</button>
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}
