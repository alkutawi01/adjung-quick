import { useEffect, useState, useCallback } from 'react';
import { fetchClassificationFlow } from './classificationFlowAdapter.js';

// ClassificationFlow.jsx — Aliran Klasifikasi Langsung.
//
// Direct answer to Izzat's complaint (2026-08-16): a live, readable list
// of every recent RSS item, its source, and which Bidang it landed in.
// No aggregation, no interpretation — the raw routing decision, visible.
// Auto-refreshes every 30s; a manual button for "I want it now".
export default function ClassificationFlow({ supabase, editionId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const load = useCallback(() => {
    fetchClassificationFlow(supabase, editionId)
      .then(r => { setRows(r); setLastRefreshed(new Date()); setError(null); })
      .catch(err => setError(err.message));
  }, [supabase, editionId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="classification-flow">
      <div className="classification-flow__header">
        <p className="editorial-desk__placeholder-desc">
          Setiap berita RSS terkini, sumber, dan Bidang yang ia diberikan —
          tanpa tafsiran, terus daripada data sebenar.
        </p>
        <button type="button" onClick={load}>Muat semula sekarang</button>
        {lastRefreshed && (
          <span className="classification-flow__refreshed">
            Kemas kini terakhir: {lastRefreshed.toLocaleTimeString('ms-MY')}
          </span>
        )}
      </div>

      {error && <p className="review-queue__error">{error}</p>}
      {rows === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {rows !== null && (
        <div style={{ overflowX: 'auto' }}>
        <table className="classification-flow__table">
          <thead>
            <tr>
              <th>Tajuk</th>
              <th>Sumber</th>
              <th>Bidang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.storyId} className={row.field ? '' : 'classification-flow__row--unplaced'}>
                <td>{row.title}</td>
                <td>{row.sourceName}</td>
                <td>
                  {row.field ?? (
                    row.classificationStatus === 'not_yet_run'
                      ? 'belum diklasifikasi'
                      : 'tiada Bidang (unclassified)'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
