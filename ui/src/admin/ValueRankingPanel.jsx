// ValueRankingPanel.jsx — Admin Console V2, "Nilai & Susunan" menu.
//
// Pusingan 11/15 (2026-08-19): no longer an explanatory-only page.
// Traced first (state/rankingFlags.js): the real, explainable Editorial
// Ranking Engine is LIVE for exactly ONE (edition, field) -- ms-MY /
// Politik. Every other field/edition still uses the legacy path (plain
// stored editorial_score order, no per-candidate breakdown to show) --
// this panel is honestly scoped to ms-MY/Politik only, not a pretend
// breakdown for fields that don't have one (see the note at the bottom).
//
// Three real tables, computed by valueRankingAdapter.js from the SAME
// pure ranking functions production calls (not re-implemented, not
// tuned here): Nilai (every scored candidate) -> Pemilihan (Diversity
// Selection's real order, including who didn't make it) -> Susunan Akhir
// (Editorial Composition's final order, with its own real swap reasons
// when one occurred). Nilai != Pemilihan != Susunan akhir, per locked
// product decision -- three distinct tables, not one renamed three times.
import { useState, useEffect } from 'react';
import { fetchValueRankingData } from './valueRankingAdapter.js';
import { submitBoostOverride, submitPinOverride, deactivateOverride } from './reviewQueueAdapter.js';

export default function ValueRankingPanel({ supabase, role, userId }) {
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = () => {
    setError(null);
    fetchValueRankingData(supabase).then(setData).catch(err => setError(err.message));
  };

  useEffect(load, [supabase]);

  const runAction = async (storyId, fn) => {
    setBusyId(storyId);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const boost = (storyId, reason) => runAction(storyId, () =>
    submitBoostOverride(supabase, { storyId, editionId: data.editionLabel, reason, createdBy: userId, role }));
  const unboost = (storyId, overrideId) => runAction(storyId, () => deactivateOverride(supabase, overrideId));
  const pin = (storyId, reason) => runAction(storyId, () =>
    submitPinOverride(supabase, { storyId, editionId: data.editionLabel, newField: data.fieldLabel, reason, createdBy: userId, role }));
  const unpin = (storyId, overrideId) => runAction(storyId, () => deactivateOverride(supabase, overrideId));

  return (
    <div className="value-ranking-panel">
      <p className="bidang-panel__intro">
        Tiga modul berasingan &mdash; nilai berita tidak menyusun, pemilihan tidak menilai
        semula, susunan tidak memilih. Setiap satu buat SATU kerja sahaja. Data di bawah cuma
        untuk <b>ms-MY &middot; Politik</b> -- satu-satunya bidang yang menggunakan enjin
        ranking boleh terang ini buat masa ini (lihat nota di bawah).
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan data ranking: {error}</p>}
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {data === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {data !== null && (
        <>
          <h2 className="bidang-panel__section-title">1. Nilai Berita</h2>
          <p className="bidang-panel__section-desc">
            Skor tersimpan sebenar bagi setiap berita layak dalam bidang ini (jumlah mentah, bukan
            peratus/100) -- kebaruan + kualiti sumber + keyakinan klasifikasi + keutamaan editor.
          </p>
          <RankTable
            rows={data.scoredCandidates}
            columns={['Berita', 'Sumber', 'Bidang', 'Nilai', 'Boost', 'Tindakan']}
            renderRow={r => (
              <tr key={r.storyId}>
                <td className="source-table__name">{r.title}</td>
                <td>{r.sourceName}</td>
                <td>{r.fieldLabel}</td>
                <td className="source-table__num">{formatScore(r.score)}</td>
                <td>{r.boosted ? 'Ya' : 'Tidak'}</td>
                <td className="source-table__actions">
                  {r.boostOverrideId ? (
                    <button type="button" disabled={busyId === r.storyId} onClick={() => unboost(r.storyId, r.boostOverrideId)}>Nyahaktifkan boost</button>
                  ) : (
                    <button type="button" disabled={busyId === r.storyId} onClick={() => boost(r.storyId, 'Dinaikkan dari Nilai & Susunan')}>Naikkan keutamaan</button>
                  )}
                </td>
              </tr>
            )}
          />

          <h2 className="bidang-panel__section-title">2. Pemilihan 10 Berita</h2>
          <p className="bidang-panel__section-desc">
            Susunan sebenar Diversity Selection -- ambil calon terbaik satu demi satu, kurangkan
            keutamaan berita kalau sumber yang sama dah banyak dipilih. Termasuk yang tidak
            terpilih, supaya nampak keseluruhan pertandingan, bukan cuma yang menang.
          </p>
          <RankTable
            rows={data.selection}
            columns={['Kedudukan', 'Berita', 'Nilai', 'Sebab dipilih', 'Pin', 'Tindakan']}
            renderRow={r => (
              <tr key={r.storyId} className={r.reason === 'Tidak terpilih' ? 'source-table__row--inactive' : ''}>
                <td className="source-table__num">{r.kedudukan ?? '—'}</td>
                <td className="source-table__name">{r.title}</td>
                <td className="source-table__num">{formatScore(r.score)}</td>
                <td>{r.reason}</td>
                <td>{r.pinned ? 'Ya' : 'Tidak'}</td>
                <td className="source-table__actions">
                  {r.pinOverrideId ? (
                    <button type="button" disabled={busyId === r.storyId} onClick={() => unpin(r.storyId, r.pinOverrideId)}>Nyahaktifkan pin</button>
                  ) : r.reason !== 'Tidak terpilih' && (
                    <button type="button" disabled={busyId === r.storyId} onClick={() => pin(r.storyId, 'Dikekalkan dari Nilai & Susunan')}>Kekalkan dalam pemilihan</button>
                  )}
                </td>
              </tr>
            )}
          />

          <h2 className="bidang-panel__section-title">3. Susunan Akhir</h2>
          <p className="bidang-panel__section-desc">
            Set akhir Editorial Composition -- terima susunan Modul 2 SEPERTI ADANYA (tak dinilai
            semula), tukar SATU kedudukan sahaja jika satu sumber menguasai &gt;50% slot DAN ada
            calon lain yang cukup kualiti untuk gantikannya.
          </p>
          <RankTable
            rows={data.finalOrder}
            columns={['Kedudukan', 'Berita', 'Sumber', 'Nilai', 'Sebab']}
            renderRow={r => (
              <tr key={r.storyId}>
                <td className="source-table__num">{r.kedudukan ?? '—'}</td>
                <td className="source-table__name">{r.title}</td>
                <td>{r.sourceName}</td>
                <td className="source-table__num">{formatScore(r.score)}</td>
                <td>{r.reason}</td>
              </tr>
            )}
          />
        </>
      )}

      <div className="section-note">
        Bidang/edisi lain (semua selain ms-MY &middot; Politik) guna susunan tersimpan
        (<code>editorial_score</code>) tanpa enjin ranking boleh terang ini -- lihat lajur Nilai
        dalam Berita &rarr; Semua Berita untuk skor am semua bidang. Menambah bidang baharu ke
        enjin ini ialah perubahan konfigurasi (<code>state/rankingFlags.js</code>), bukan sesuatu
        yang boleh dilakukan dari Admin Console setakat ini.
      </div>
    </div>
  );
}

function formatScore(score) {
  return Number.isFinite(score) ? Math.round(score) : '—';
}

function RankTable({ rows, columns, renderRow }) {
  if (rows.length === 0) {
    return <p className="review-queue__empty">Tiada berita layak dalam bidang ini buat masa ini.</p>;
  }
  return (
    <div className="source-table-wrap">
      <table className="source-table">
        <thead>
          <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
