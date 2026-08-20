// PemilihanPanel.jsx — Admin Console V2, "Nilai & Susunan -> Pemilihan
// 10" menu.
//
// Pusingan 14/15 (2026-08-19). Shows how a score becomes 10 active
// stories -- Kaedah semasa vs Skor V1 (Pusingan 13's shared `weights`),
// BOTH run through the REAL, unmodified
// ranking/diversity-selection.mjs::selectDiverseCandidates() -- only the
// score fed into it differs between modes. editorial-composition.mjs is
// explicitly out of scope (Pusingan 15).
//
// Polish 8B fix (docs/polish-8-selection-audit-v1.md): Polish 8A's audit
// found this panel ran selectDiverseCandidates() for ANY category and
// labelled the result "Kaedah semasa" (current/production method) --
// true only for ms-MY.politics, the sole category on `editorial_v1`
// (state/rankingFlags.js). Every other category's real Reader uses a
// plain legacy .slice() with NO diversity selection at all, so showing
// this pipeline's output as "Kaedah semasa" for those categories was a
// real, provable Admin/Reader mismatch. getRankingVersion() is now the
// single authority for whether a category's results may be presented as
// production truth vs simulation-only -- never hardcode a field code.
//
// Traced first (state/reducer.js::selectFieldActiveSet, this session's
// own round 11 finding, re-verified): pin bypasses the diversity
// SELECTION contest entirely -- extracted BEFORE scoring/selection ever
// runs, capped at 2, oldest-pin-first. Never a "score boost"; production
// never blends pin into `score`. This panel keeps that separation
// exactly: pinned rows carry a "Dikekalkan editor" badge, their score
// column shows the REAL computed score (for reference) but the pin
// itself never changes that number.
//
// "Why not selected" honesty constraint: selectDiverseCandidates()
// (traced directly, ranking/diversity-selection.mjs) attaches `reasons`
// to picked candidates ('source_diversity_preserved' first pick from a
// source, 'source_diversity_discounted' subsequent ones) -- these ARE
// real, provable outputs, reused verbatim. For anything selectDiverse
// Candidates does NOT prove (e.g. exactly why one specific candidate
// lost to another), this panel says only "Tidak dipilih oleh peringkat
// pemilihan" -- never a fabricated one-line reason the algorithm doesn't
// actually carry.
import { useState, useMemo } from 'react';
import { scoreCandidates } from '../../../ranking/candidate-scoring.mjs';
import { scoreCandidateV1 } from '../../../ranking/scoring-v1-simulation.mjs';
import { selectDiverseCandidates } from '../../../ranking/diversity-selection.mjs';
import { extractPinned } from './kaedahNilaiAdapter.js';
import { getFieldLabel } from '../../../state/editions.js';
import { getRankingVersion } from '../../../state/rankingFlags.js';

const EDITION_ID = 'ms-MY';
const CAPACITY = 10;

const REASON_LABEL = {
  source_diversity_preserved: 'Pilihan pertama daripada sumber ini',
  source_diversity_discounted: 'Penalti kepelbagaian dikenakan',
};

export default function PemilihanPanel({ corpus, error, weights }) {
  const [fieldCode, setFieldCode] = useState(null);
  const [mode, setMode] = useState('semasa'); // 'semasa' | 'v1'

  const fieldOptions = useMemo(() => {
    if (!corpus) return [];
    return [...new Set(corpus.map(c => c.fieldCode))].sort();
  }, [corpus]);

  const activeField = fieldCode ?? fieldOptions[0] ?? null;
  // Polish 8B: single authority for whether THIS category's pipeline
  // output may be shown as production truth. Never hardcode a field
  // code -- when a category is later added to RANKING_FLAGS, this
  // panel follows automatically.
  const isActiveProduction = activeField ? getRankingVersion(EDITION_ID, activeField) === 'editorial_v1' : false;

  const result = useMemo(() => {
    if (!corpus || !activeField) return null;
    const group = corpus.filter(c => c.fieldCode === activeField);
    const now = new Date();
    const titles = group.map(c => c.title);
    const { pinned, rest } = extractPinned(group);
    const remainingCapacity = Math.max(0, CAPACITY - pinned.length);

    const runMode = m => {
      const scored = rest.map(c => {
        if (m === 'semasa') {
          const s = scoreCandidates([c], now)[0];
          return { ...s, reasons: s.reasons ?? [] }; // production formula already carries `reasons`
        }
        const s = scoreCandidateV1(c, titles, now, weights);
        return { ...s, score: s.scoreV1, reasons: [] }; // V1 has no `reasons` field — selectDiverseCandidates requires the key to exist, never fabricated content
      });
      // REAL, unmodified production selector -- only the `score` fed in differs.
      const selected = selectDiverseCandidates(scored, remainingCapacity);
      const selectedIds = new Set(selected.map(c => c.storyId));
      const notSelected = scored.filter(c => !selectedIds.has(c.storyId));
      return { scored, selected, notSelected };
    };

    const semasaRun = runMode('semasa');
    const v1Run = runMode('v1');
    const activeRun = mode === 'semasa' ? semasaRun : v1Run;

    const semasaFinalIds = new Set([...pinned.map(c => c.storyId), ...semasaRun.selected.map(c => c.storyId)]);
    const v1FinalIds = new Set([...pinned.map(c => c.storyId), ...v1Run.selected.map(c => c.storyId)]);
    const otherFinalIds = mode === 'semasa' ? v1FinalIds : semasaFinalIds;

    const finalOrder = [...pinned, ...activeRun.selected].map((c, i) => {
      const inOther = otherFinalIds.has(c.storyId);
      const inThis = true; // by construction, everyone in finalOrder is in this mode's set
      const status = c.pinned ? 'Dikekalkan editor' : (inOther ? 'Kekal' : 'Masuk');
      return { ...c, position: i + 1, status, score: c.pinned ? null : (c.score ?? c.scoreV1) };
    });
    // Stories that WERE in the final 10 under the other mode but aren't here.
    const droppedOut = [...pinned, ...(mode === 'semasa' ? v1Run.selected : semasaRun.selected)]
      .filter(c => !new Set(finalOrder.map(f => f.storyId)).has(c.storyId))
      .map(c => ({ ...c, status: 'Keluar' }));

    return { pinned, candidatePool: activeRun.scored, selectedIds: new Set(activeRun.selected.map(c => c.storyId)), finalOrder, droppedOut };
  }, [corpus, activeField, mode, weights]);

  if (error) return <p className="review-queue__error">Ralat memuatkan korpus: {error}</p>;
  if (!corpus) return <p className="admin-app__status">Memuatkan…</p>;

  return (
    <div className="pemilihan-panel">
      <p className="bidang-panel__intro">
        {isActiveProduction
          ? 'Bagaimana Nilai Berita diterjemah kepada 10 berita aktif — guna enjin pemilihan kepelbagaian SEBENAR (tidak diubah), skor sahaja berbeza antara mod.'
          : 'Simulasi pemilihan 10 berita — belum digunakan oleh pembaca untuk kategori ini.'}
        {' '}Susunan Akhir (pemeriksaan komposisi selepas ini) ada di tab berasingan.
      </p>
      {activeField && !isActiveProduction && (
        <p className="admin-app__status admin-app__status--notice">
          Kaedah Nilai &amp; Susunan baharu belum diaktifkan untuk kategori ini. Paparan pembaca semasa
          masih menggunakan susunan sedia ada. Keputusan di bawah ialah simulasi — belum digunakan oleh
          pembaca.
        </p>
      )}

      <div className="classification-rules__filters">
        <label>
          Kategori{' '}
          <select value={activeField ?? ''} onChange={e => setFieldCode(e.target.value)}>
            {fieldOptions.map(f => <option key={f} value={f}>{getFieldLabel(EDITION_ID, f)}</option>)}
          </select>
        </label>
        <label>
          <input type="radio" checked={mode === 'semasa'} onChange={() => setMode('semasa')} /> Kaedah semasa
        </label>
        <label>
          <input type="radio" checked={mode === 'v1'} onChange={() => setMode('v1')} /> Skor V1 simulasi
        </label>
      </div>

      {result && (
        <>
          <h2 className="bidang-panel__section-title">Semua calon dalam kategori ini</h2>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Kedudukan calon</th><th>Berita</th><th>Nilai</th><th>Dipilih?</th><th>Pin</th><th>Sumber</th></tr>
              </thead>
              <tbody>
                {result.pinned.map(c => (
                  <tr key={c.storyId}>
                    <td>—</td>
                    <td className="source-table__name">{c.title}</td>
                    <td className="source-table__num">—</td>
                    <td>Dikekalkan editor</td>
                    <td>Ya</td>
                    <td>{c.sourceName}</td>
                  </tr>
                ))}
                {[...result.candidatePool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((c, i) => (
                  <tr key={c.storyId} className={result.selectedIds.has(c.storyId) ? '' : 'source-table__row--inactive'}>
                    <td className="source-table__num">{i + 1}</td>
                    <td className="source-table__name">{c.title}</td>
                    <td className="source-table__num">{(c.score ?? 0).toFixed(1)}</td>
                    <td>{result.selectedIds.has(c.storyId) ? 'Ya' : 'Tidak dipilih oleh peringkat pemilihan'}</td>
                    <td>Tidak</td>
                    <td>{c.sourceName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="bidang-panel__section-title">
            10 berita yang dipilih (
            {isActiveProduction
              ? (mode === 'semasa' ? 'Kaedah semasa' : 'Skor V1 simulasi')
              : (mode === 'semasa' ? 'Simulasi — formula semasa, belum digunakan oleh pembaca' : 'Simulasi — Skor V1, belum digunakan oleh pembaca')}
            )
          </h2>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>#</th><th>Berita</th><th>Nilai</th><th>Sumber</th><th>Sebab (jika terbukti)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {result.finalOrder.map(c => (
                  <tr key={c.storyId}>
                    <td className="source-table__num">{c.position}</td>
                    <td className="source-table__name">{c.title}</td>
                    <td className="source-table__num">{c.score != null ? c.score.toFixed(1) : '—'}</td>
                    <td>{c.sourceName}</td>
                    <td>{(c.reasons ?? []).map(r => REASON_LABEL[r] ?? r).join('; ') || '—'}</td>
                    <td><b>{c.status}</b></td>
                  </tr>
                ))}
                {result.droppedOut.map(c => (
                  <tr key={c.storyId} className="source-table__row--inactive">
                    <td>—</td>
                    <td className="source-table__name">{c.title}</td>
                    <td className="source-table__num">{c.score != null ? Number(c.score).toFixed(1) : '—'}</td>
                    <td>{c.sourceName}</td>
                    <td>—</td>
                    <td><b>{c.status}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-app__status">
            Had maksimum 2 pin serentak bagi setiap kategori.
          </p>
        </>
      )}
    </div>
  );
}
