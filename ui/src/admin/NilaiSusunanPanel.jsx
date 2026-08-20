// NilaiSusunanPanel.jsx — Admin Console V2, "Nilai & Susunan" menu.
//
// Polish 8C (docs/polish-8-selection-audit-v1.md): replaces the four
// separate "labs" editors previously had to interpret as different tools
// (Data Sebenar / Kaedah Nilai / Pemilihan 10 / Susunan Akhir) with ONE
// page that answers one question: "Untuk kategori ini, berita mana
// dinilai, mana akhirnya dipilih, dan kenapa?" No "Kaedah semasa vs Skor
// V1 simulasi" toggle -- Polish 7D's calibrated formula IS the current
// production formula now, so that comparison was legacy calibration
// scaffolding, not a live decision editors need to see.
//
// ONE category dropdown drives everything below it. getRankingVersion()
// (state/rankingFlags.js) -- the same authority production itself uses,
// never a hardcoded field code -- decides whether this page's numbers are
// labelled as the real Reader result or an explicit preview.
import { useState, useEffect, useMemo } from 'react';
import { fetchValueRankingData } from './valueRankingAdapter.js';
import { getRankingVersion } from '../../../state/rankingFlags.js';

export default function NilaiSusunanPanel({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels }) {
  const [fieldCode, setFieldCode] = useState(null);
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState(null);

  const activeFieldCode = fieldCode ?? taxonomyFieldCodes[0] ?? null;
  const isActiveProduction = activeFieldCode ? getRankingVersion(editionId, activeFieldCode) === 'editorial_v1' : false;

  useEffect(() => {
    if (!activeFieldCode) return;
    setData(null);
    setError(null);
    fetchValueRankingData(supabase, editionId, activeFieldCode)
      .then(setData)
      .catch(err => setError(err.message));
  }, [supabase, editionId, activeFieldCode]);

  // Final set (has a position) first, ordered by position; everything else
  // (never made the final set) below, ordered by value. No re-sorting by
  // status beyond that -- the table reads top-to-bottom as "what the reader
  // gets" followed by "why not the rest".
  const sortedRows = useMemo(() => {
    if (!data) return [];
    const withPosition = data.rows.filter(r => r.position != null).sort((a, b) => a.position - b.position);
    const withoutPosition = data.rows.filter(r => r.position == null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return [...withPosition, ...withoutPosition];
  }, [data]);

  return (
    <div className="nilai-susunan-panel">
      <p className="bidang-panel__intro">
        Nilai mengambil kira kebaruan berita, kualiti sumber dan keyakinan klasifikasi. Pemilihan
        mempertimbangkan kepelbagaian sumber sebelum menghasilkan susunan akhir.
      </p>

      <div className="classification-rules__filters">
        <label>
          Kategori{' '}
          <select value={activeFieldCode ?? ''} onChange={e => setFieldCode(e.target.value)}>
            {taxonomyFieldCodes.map((code, i) => <option key={code} value={code}>{taxonomyFieldLabels[i] ?? code}</option>)}
          </select>
        </label>
      </div>

      {activeFieldCode && (
        <p className={`admin-app__status${isActiveProduction ? '' : ' admin-app__status--notice'}`}>
          {isActiveProduction
            ? 'Digunakan oleh pembaca — kaedah Nilai & Susunan ini aktif untuk kategori ini. Susunan setiap pembaca boleh berubah selepas mereka melepaskan berita.'
            : 'Pratonton — belum digunakan oleh pembaca. Paparan pembaca semasa untuk kategori ini masih menggunakan susunan sedia ada.'}
        </p>
      )}

      {error && <p className="review-queue__error">Ralat memuatkan data: {error}</p>}
      {data === null && !error && <p className="admin-app__status">Memuatkan…</p>}

      {data !== null && (
        sortedRows.length === 0 ? (
          <p className="review-queue__empty">Tiada berita layak dalam kategori ini buat masa ini.</p>
        ) : (
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Kedudukan</th><th>Berita</th><th>Nilai</th><th>Sumber</th><th>Status</th><th>Sebab</th></tr>
              </thead>
              <tbody>
                {sortedRows.map(r => (
                  <tr key={r.storyId} className={r.status === 'Tidak dipilih' || r.status === 'Keluar' ? 'source-table__row--inactive' : ''}>
                    <td className="source-table__num">{r.position ?? '—'}</td>
                    <td className="source-table__name">{r.title}</td>
                    <td className="source-table__num">{formatScore(r.score)}</td>
                    <td>{r.sourceName}</td>
                    <td><b>{r.status}</b></td>
                    <td>{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function formatScore(score) {
  return Number.isFinite(score) ? Math.round(score) : '—';
}
