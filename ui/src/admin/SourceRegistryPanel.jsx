// SourceRegistryPanel.jsx — Admin Console V2, "Sumber" menu, read-only V1.
//
// Wires the REAL production source registry read path
// (db/source-registry-adapter.mjs::fetchAllSourcesForIngestion, already
// browser-safe -- takes any supabase client, no admin-role gate on read),
// same loading/error shape convention as ClassificationRulesList.jsx.
// Reads public.sources directly -- NOT lab/sources.js (fixture/reference
// only, per the project's locked Fasa 1 finding).
//
// Deliberately READ-ONLY: addSource/updateSource/setSourceStatus exist
// in the adapter and are admin-gated, but wiring live writes here is a
// separate step Izzat should review before it goes live -- flagged
// honestly below rather than silently omitted or faked as working.

import { useEffect, useState } from 'react';
import { fetchAllSourcesForIngestion } from '../../../db/source-registry-adapter.mjs';

export default function SourceRegistryPanel({ supabase }) {
  const [sources, setSources] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    setSources(null);
    setError(null);
    fetchAllSourcesForIngestion(supabase)
      .then(setSources)
      .catch(err => setError(err.message));
  }, [supabase]);

  return (
    <div className="source-registry">
      <p className="source-registry__note">
        Senarai ini baca terus daripada <code>public.sources</code> (produksi sebenar).
        Tindakan tulis (nyahaktifkan / tambah sumber baharu / kemas kini kepercayaan) belum
        disambungkan di sini lagi -- backend admin-gated sudah wujud, tetapi perlu semakan
        berasingan sebelum disambung.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan sumber: {error}</p>}
      {sources === null && !error && <p className="admin-app__status">Memuatkan...</p>}
      {sources !== null && sources.length === 0 && (
        <p className="review-queue__empty">Tiada sumber didaftarkan.</p>
      )}

      {sources !== null && sources.length > 0 && (
        <ul className="source-registry__list">
          {sources.map(s => (
            <li key={s.id} className={`source-registry__row${s.status !== 'active' ? ' source-registry__row--inactive' : ''}`}>
              <span className="source-registry__name">{s.name}</span>
              <span className="source-registry__url">{s.url}</span>
              <span className="source-registry__meta">Kepercayaan: {s.trustScore ?? '—'}</span>
              <span className="source-registry__meta">{s.knownCategory ? `Kategori: ${s.knownCategory}` : (s.sourceType ?? '')}</span>
              <span className={`source-registry__status source-registry__status--${s.status}`}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
