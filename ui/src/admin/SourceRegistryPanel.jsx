// SourceRegistryPanel.jsx — Admin Console V2, "Sumber" menu.
//
// Round 3/15 (2026-08-19): reads REAL public.sources via
// db/source-registry-adapter.mjs::fetchAllSourcesForIngestion (browser-safe,
// no admin gate on read). NOT lab/sources.js -- that's fixture/reference
// only per the project's locked Fasa 1 finding.
//
// Write path (add/disable) traced before wiring: addSource/setSourceStatus
// follow the EXACT same convention already trusted elsewhere in this
// codebase (supabase client + role param, checked server-side via
// assertAdmin/isAdmin -- same shape as submitPinOverride, addEditionRule,
// addFilterRule). Wired here on that basis, but NOT claimed "verified
// working" -- no editor login credentials were available locally to
// actually submit one and confirm.
//
// Only fields useful to an editor are shown on the main row (name/URL/
// status/trust/type). exclude_patterns and extra_ca are real but
// technical/rarely-relevant -- kept behind "Lihat butiran", not in the
// main table, per explicit instruction not to clutter it with schema
// internals.

import { useState, useEffect, useMemo } from 'react';
import { fetchAllSourcesForIngestion, addSource, setSourceStatus } from '../../../db/source-registry-adapter.mjs';

export default function SourceRegistryPanel({ supabase, role, userId }) {
  const [sources, setSources] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | disabled | archived
  const [expandedId, setExpandedId] = useState(null);
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
    const active = sources.filter(s => s.status === 'active').length;
    const disabled = sources.filter(s => s.status !== 'active').length;
    return { active, disabled };
  }, [sources]);

  const filtered = useMemo(() => {
    if (!sources) return [];
    const q = query.trim().toLowerCase();
    return sources.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.url ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, query, statusFilter]);

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

  return (
    <div className="source-registry">
      <p className="source-registry__note">
        Baca terus daripada <code>public.sources</code> (produksi sebenar). Tindakan
        tambah/nyahaktif guna path admin sebenar (<code>addSource</code>/
        <code>setSourceStatus</code>) tetapi belum disahkan hujung-ke-hujung -- tiada akaun
        editor tersedia tempatan untuk log masuk dan cuba sebenar.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan sumber: {error}</p>}
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {sources === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {sources !== null && (
        <>
          <p className="source-registry__summary">
            <b>{counts.active}</b> aktif &middot; <b>{counts.disabled}</b> tidak aktif
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

          {filtered.length === 0 && (
            <p className="review-queue__empty">Tiada sumber sepadan carian.</p>
          )}

          <ul className="source-registry__list">
            {filtered.map(s => (
              <li key={s.id} className={`source-registry__row${s.status !== 'active' ? ' source-registry__row--inactive' : ''}`}>
                <div className="source-registry__row-main">
                  <span className="source-registry__name">{s.name}</span>
                  <span className={`source-registry__status source-registry__status--${s.status}`}>
                    {s.status === 'active' ? 'Aktif' : s.status === 'disabled' ? 'Tidak aktif' : 'Diarkibkan'}
                  </span>
                  <span className="source-registry__meta">Kepercayaan: {s.trustScore ?? '—'}</span>
                  {s.knownCategory && <span className="source-registry__meta">Bidang: {s.knownCategory}</span>}
                  <button type="button" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                    {expandedId === s.id ? 'Sorok butiran' : 'Lihat butiran'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => toggleStatus(s)}
                  >
                    {busyId === s.id ? 'Menyimpan...' : s.status === 'active' ? 'Nyahaktifkan' : 'Aktifkan'}
                  </button>
                </div>
                {expandedId === s.id && (
                  <div className="source-registry__details">
                    <div>URL: <code>{s.url}</code></div>
                    <div>Bahasa/Edisi: {s.language ?? '—'}</div>
                    <div>Jenis: {s.sourceType ?? '—'}</div>
                    {s.excludePatterns && <div>Corak dikecualikan: {s.excludePatterns.map(String).join(', ')}</div>}
                    {s.extraCa && <div>Sijil tambahan (extra_ca): ada</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>

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
