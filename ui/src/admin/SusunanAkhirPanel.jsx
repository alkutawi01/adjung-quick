// SusunanAkhirPanel.jsx — Admin Console V2, "Nilai & Susunan -> Susunan
// Akhir" menu.
//
// Pusingan 15/15 (2026-08-19), penghujung rangkaian Nilai -> Pemilihan ->
// Susunan Akhir. Traced again before coding
// (ranking/editorial-composition.mjs's own header, unchanged since round
// 11's reading): composition NEVER re-scores, NEVER re-ranks by score --
// it accepts Diversity Selection's order AS-IS, and only asks one
// question: does ONE source hold >50% of the 10 slots? If not, nothing
// happens (`compositionReasons` empty, `selected` identical to input).
// If yes, it looks for exactly one swap (weakest dominant-source pick <->
// strongest qualifying alternative from another source), and always
// tells you WHY it didn't/did swap via `compositionReasons` --
// 'dominant_event_preserved' (alternatives exist but don't clear the
// quality floor), 'no_diversity_candidate_available' (no other-source
// candidate exists at all), or the swap pair
// 'source_diversity_opportunity'/'displaced_for_source_diversity'. This
// panel shows ONLY these four real codes, translated -- nothing invented.
//
// Both "Kaedah semasa" and "Skor V1 simulasi" run the FULL real chain --
// score -> selectDiverseCandidates() -> applyEditorialComposition() --
// unmodified, imported directly. Only the score fed in at stage 1 differs.
import { useState, useMemo } from 'react';
import { scoreCandidates } from '../../../ranking/candidate-scoring.mjs';
import { scoreCandidateV1 } from '../../../ranking/scoring-v1-simulation.mjs';
import { selectDiverseCandidates } from '../../../ranking/diversity-selection.mjs';
import { applyEditorialComposition } from '../../../ranking/editorial-composition.mjs';
import { extractPinned } from './kaedahNilaiAdapter.js';
import { getFieldLabel } from '../../../state/editions.js';

const EDITION_ID = 'ms-MY';
const CAPACITY = 10;

const COMPOSITION_LABEL = {
  source_diversity_opportunity: 'Dimasukkan — gantikan pilihan sumber dominan yang lebih lemah',
  displaced_for_source_diversity: 'Digantikan — sumbernya menguasai >50% slot, ada gantian lebih kuat',
  dominant_event_preserved: 'Dikekalkan — peristiwa dominan sebenar, tiada gantian cukup kualiti',
  no_diversity_candidate_available: 'Dikekalkan — tiada calon sumber lain langsung dalam kategori ini',
};

function runPipeline(group, mode, weights, now) {
  const titles = group.map(c => c.title);
  const { pinned, rest } = extractPinned(group);
  const remaining = Math.max(0, CAPACITY - pinned.length);

  const scored = rest.map(c => {
    if (mode === 'semasa') {
      const s = scoreCandidates([c], now)[0];
      return { ...s, reasons: s.reasons ?? [] };
    }
    const s = scoreCandidateV1(c, titles, now, weights);
    return { ...s, score: s.scoreV1, reasons: [] };
  });
  const diversitySelected = selectDiverseCandidates(scored, remaining);
  const alternativePool = scored.filter(c => !diversitySelected.some(s => s.storyId === c.storyId));
  const { selected: composed, compositionReasons } = applyEditorialComposition(diversitySelected, { alternativePool });

  const finalOrder = [
    ...pinned.map(c => ({ storyId: c.storyId, title: c.title, sourceName: c.sourceName, score: null, pinned: true, compositionReason: null })),
    ...composed.map(c => ({ storyId: c.storyId, title: c.title, sourceName: c.sourceName, score: c.score, pinned: false, compositionReason: compositionReasons[c.storyId]?.[0] ?? null })),
  ];
  return { pinned, finalOrder, finalIds: new Set(finalOrder.map(c => c.storyId)) };
}

export default function SusunanAkhirPanel({ corpus, error, weights }) {
  const [fieldCode, setFieldCode] = useState(null);
  const [mode, setMode] = useState('semasa');

  const fieldOptions = useMemo(() => {
    if (!corpus) return [];
    return [...new Set(corpus.map(c => c.fieldCode))].sort();
  }, [corpus]);
  const activeField = fieldCode ?? fieldOptions[0] ?? null;

  const result = useMemo(() => {
    if (!corpus || !activeField) return null;
    const group = corpus.filter(c => c.fieldCode === activeField);
    const now = new Date();
    const semasaRun = runPipeline(group, 'semasa', weights, now);
    const v1Run = runPipeline(group, 'v1', weights, now);
    const activeRun = mode === 'semasa' ? semasaRun : v1Run;
    const otherIds = mode === 'semasa' ? v1Run.finalIds : semasaRun.finalIds;

    const rows = activeRun.finalOrder.map((c, i) => {
      const status = c.pinned ? 'Dikekalkan editor' : (otherIds.has(c.storyId) ? 'Kekal' : 'Masuk');
      return { ...c, position: i + 1, status };
    });
    const otherRun = mode === 'semasa' ? v1Run : semasaRun;
    const droppedOut = otherRun.finalOrder
      .filter(c => !activeRun.finalIds.has(c.storyId))
      .map(c => ({ ...c, status: 'Keluar' }));

    return { rows, droppedOut };
  }, [corpus, activeField, mode, weights]);

  if (error) return <p className="review-queue__error">Ralat memuatkan korpus: {error}</p>;
  if (!corpus) return <p className="admin-app__status">Memuatkan…</p>;

  return (
    <div className="susunan-akhir-panel">
      <p className="bidang-panel__intro">
        Set akhir 10 berita yang pembaca akan lihat — guna enjin komposisi editorial SEBENAR (tidak diubah).
        <b> Komposisi TIDAK mengira skor semula dan TIDAK membuat ranking kedua berdasarkan skor</b> — ia
        terima susunan Pemilihan 10
        SEPERTI ADANYA, cuma semak: adakah satu sumber menguasai &gt;50% daripada 10 slot; jika ya, cuba
        satu pertukaran (calon terlemah sumber dominan itu, gantikan dengan calon sumber lain yang cukup
        kualiti) — paling banyak SATU pertukaran, bukan susun semula penuh.
      </p>

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
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr><th># Akhir</th><th>Berita</th><th>Sumber</th><th>Nilai</th><th>Status</th><th>Kesan Komposisi</th></tr>
            </thead>
            <tbody>
              {result.rows.map(c => (
                <tr key={c.storyId}>
                  <td className="source-table__num">{c.position}</td>
                  <td className="source-table__name">{c.title}</td>
                  <td>{c.sourceName}</td>
                  <td className="source-table__num">{c.score != null ? c.score.toFixed(1) : '—'}</td>
                  <td><b>{c.status}</b></td>
                  <td>{c.compositionReason ? COMPOSITION_LABEL[c.compositionReason] : 'Tiada pertukaran — kekal susunan Pemilihan 10'}</td>
                </tr>
              ))}
              {result.droppedOut.map(c => (
                <tr key={c.storyId} className="source-table__row--inactive">
                  <td>—</td>
                  <td className="source-table__name">{c.title}</td>
                  <td>{c.sourceName}</td>
                  <td className="source-table__num">{c.score != null ? Number(c.score).toFixed(1) : '—'}</td>
                  <td><b>{c.status}</b></td>
                  <td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
