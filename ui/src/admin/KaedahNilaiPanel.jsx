// KaedahNilaiPanel.jsx — Admin Console V2, "Nilai & Susunan -> Kaedah
// Nilai" menu.
//
// Pusingan 13/15 (2026-08-19). Brings Scoring V1 (docs/scoring-v1-policy.md,
// ranking/scoring-v1-simulation.mjs -- Pusingan 11-12's real, per-field-
// calibrated simulation) into the Admin, as an interactive "what if"
// preview over the real ms-MY corpus. NEVER wired to
// ranking/candidate-scoring.mjs (production) -- that file is imported
// here ONLY to compute the fixed "Kaedah semasa" baseline column, never
// modified, never has a value written back to it. Every weight change
// here is a pure, in-browser recompute (scoreCandidateV1's optional
// `weights` argument, Pusingan 13's own addition, backward-compatible
// with Pusingan 12's Node script) -- zero DB writes anywhere in this file.
import { useState, useEffect, useMemo } from 'react';
import { fetchScoringCorpus } from './kaedahNilaiAdapter.js';
import { scoreCandidates } from '../../../ranking/candidate-scoring.mjs';
import { scoreCandidateV1, SCORING_V1_WEIGHTS, DEFAULT_SCORING_V1_WEIGHTS } from '../../../ranking/scoring-v1-simulation.mjs';
import { getFieldLabel } from '../../../state/editions.js';

const EDITION_ID = 'ms-MY';

// "Kaedah semasa" -- real ceilings/shape from ranking/candidate-scoring.mjs,
// written out here as display text (the file itself is never touched).
const CURRENT_METHOD_LABEL = {
  freshnessCeiling: 'Bucket tetap: <=6j=100, <=24j=80, <=3h=50, <=7h=20, lebih=0 (sama utk semua bidang)',
  trustCeiling: '0-100 mentah (skala penuh, TIDAK dinormal)',
  duplicationCeiling: '(tiada faktor ini dlm formula lama)',
  confidenceMultiplier: 'x10',
  boostWeight: '+40',
};
const FACTOR_LABEL = {
  freshnessCeiling: 'Kebaruan',
  trustCeiling: 'Kepercayaan sumber',
  duplicationCeiling: 'Pertindihan (bukan ulangan)',
  confidenceMultiplier: 'Keyakinan pengelasan',
  boostWeight: 'Keutamaan editor (boost)',
};
// Range munasabah -- diambil terus drpd nilai/hasil ujian sensitiviti
// Pusingan 12 (docs/scoring-v1-policy.md), bukan reka baharu. Boost diuji
// sehingga +40 (nilai lama); lain-lain dibenarkan naik ke ~2x cadangan
// V1 supaya Admin boleh terokai tanpa had sewenang-wenangnya.
const INPUT_RANGE = {
  freshnessCeiling: { min: 0, max: 50 },
  trustCeiling: { min: 0, max: 100 }, // sehingga 100 -- sengaja, supaya kesan dominasi trust boleh dilihat semula jika Admin nak uji
  duplicationCeiling: { min: 0, max: 20 },
  confidenceMultiplier: { min: 0, max: 10 },
  boostWeight: { min: 0, max: 40 },
};

// Hampiran "macam formula lama" -- BUKAN candidate-scoring.mjs sebenar
// (kurva kebaruan V1 masih ikut bentuk per-bidang Pusingan 12, tak boleh
// ditukar jadi bucket rata guna penukar magnitud sahaja). Label UI
// nyatakan ini jelas supaya tak disalah anggap sbg formula lama tepat.
const PRODUCTION_LIKE_PRESET = { freshnessCeiling: 25, trustCeiling: 100, duplicationCeiling: 0, confidenceMultiplier: 10, boostWeight: 40 };

export default function KaedahNilaiPanel({ supabase }) {
  const [corpus, setCorpus] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [weights, setWeights] = useState(DEFAULT_SCORING_V1_WEIGHTS);
  const [fieldCode, setFieldCode] = useState(null);
  const [majorOnly, setMajorOnly] = useState(false);

  useEffect(() => {
    fetchScoringCorpus(supabase).then(setCorpus).catch(err => setError(err.message));
  }, [supabase]);

  const fieldOptions = useMemo(() => {
    if (!corpus) return [];
    return [...new Set(corpus.map(c => c.fieldCode))].sort();
  }, [corpus]);

  useEffect(() => {
    if (fieldCode === null && fieldOptions.length > 0) setFieldCode(fieldOptions[0]);
  }, [fieldCode, fieldOptions]);

  const comparison = useMemo(() => {
    if (!corpus || !fieldCode) return [];
    const group = corpus.filter(c => c.fieldCode === fieldCode);
    const now = new Date();
    const titles = group.map(c => c.title);
    const oldRanked = [...scoreCandidates(group, now)].sort((a, b) => b.score - a.score);
    const oldRank = new Map(oldRanked.map((c, i) => [c.storyId, i + 1]));
    const newRanked = group.map(c => scoreCandidateV1(c, titles, now, weights)).sort((a, b) => b.scoreV1 - a.scoreV1);
    const newRank = new Map(newRanked.map((c, i) => [c.storyId, i + 1]));

    return group.map(c => {
      const oldEntry = oldRanked.find(s => s.storyId === c.storyId);
      const newEntry = newRanked.find(s => s.storyId === c.storyId);
      const oR = oldRank.get(c.storyId);
      const nR = newRank.get(c.storyId);
      return {
        storyId: c.storyId, title: c.title, sourceName: c.sourceName,
        oldRank: oR, newRank: nR, delta: oR - nR, // positive = moved up under V1
        oldScore: oldEntry.score, newScore: newEntry.scoreV1,
      };
    }).sort((a, b) => a.newRank - b.newRank);
  }, [corpus, fieldCode, weights]);

  const rows = majorOnly ? comparison.filter(c => Math.abs(c.delta) >= 3) : comparison;

  const setWeight = (key, value) => setWeights(w => ({ ...w, [key]: Number(value) }));

  return (
    <div className="kaedah-nilai-panel">
      <p className="bidang-panel__intro">
        Terokai bagaimana Skor V1 (docs/scoring-v1-policy.md, ditala Pusingan 11-12) berbanding
        kaedah semasa production -- ubah berat di bawah dan lihat kesannya terus atas berita
        sebenar. <b>Simulasi sahaja -- belum mengubah sistem sebenar.</b> Tiada apa-apa di sini
        ditulis ke pangkalan data atau ke <code>ranking/candidate-scoring.mjs</code> production.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan korpus: {error}</p>}
      {corpus === null && !error && <p className="admin-app__status">Memuatkan...</p>}

      {corpus !== null && (
        <>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Faktor</th><th>Kaedah semasa</th><th>Cadangan V1</th><th>Pelarasan simulasi</th></tr>
              </thead>
              <tbody>
                {Object.keys(DEFAULT_SCORING_V1_WEIGHTS).map(key => (
                  <tr key={key}>
                    <td className="source-table__name">{FACTOR_LABEL[key]}</td>
                    <td>{CURRENT_METHOD_LABEL[key]}</td>
                    <td className="source-table__num">{DEFAULT_SCORING_V1_WEIGHTS[key]}</td>
                    <td className="source-table__num">
                      <input
                        type="number"
                        min={INPUT_RANGE[key].min}
                        max={INPUT_RANGE[key].max}
                        value={weights[key]}
                        onChange={e => setWeight(key, e.target.value)}
                        style={{ width: '5em' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="review-card__actions">
            <button type="button" onClick={() => setWeights(DEFAULT_SCORING_V1_WEIGHTS)}>Reset ke V1</button>
            <button type="button" onClick={() => setWeights(PRODUCTION_LIKE_PRESET)}>Reset ke Production (hampiran)</button>
          </div>

          <div className="classification-rules__filters">
            <label>
              Bidang{' '}
              <select value={fieldCode ?? ''} onChange={e => setFieldCode(e.target.value)}>
                {fieldOptions.map(f => <option key={f} value={f}>{getFieldLabel(EDITION_ID, f)}</option>)}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={majorOnly} onChange={e => setMajorOnly(e.target.checked)} />
              {' '}Tunjuk hanya perubahan besar (&ge;3 kedudukan)
            </label>
          </div>

          {rows.length === 0 && (
            <p className="review-queue__empty">{majorOnly ? 'Tiada perubahan besar dgn tetapan semasa.' : 'Tiada berita dlm bidang ini.'}</p>
          )}
          {rows.length > 0 && (
            <div className="source-table-wrap">
              <table className="source-table">
                <thead>
                  <tr><th># Lama</th><th># V1</th><th>Perubahan</th><th>Berita</th><th>Skor lama</th><th>Skor V1</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.storyId}>
                      <td className="source-table__num">{r.oldRank}</td>
                      <td className="source-table__num">{r.newRank}</td>
                      <td className="source-table__num">{r.delta > 0 ? `↑${r.delta}` : r.delta < 0 ? `↓${-r.delta}` : '—'}</td>
                      <td className="source-table__name">{r.title} <span className="filter-effect__meta">({r.sourceName})</span></td>
                      <td className="source-table__num">{r.oldScore.toFixed(1)}</td>
                      <td className="source-table__num">{r.newScore.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="bidang-panel__section-title">Belum boleh dinilai secara automatik</h3>
          <p className="bidang-panel__section-desc">
            Empat faktor ini TAK dimasukkan ke Skor V1 sebagai nombor -- tiada metadata boleh
            dipercayai wujud utk mengukurnya secara selamat (docs/scoring-v1-policy.md). Ranking
            V1 boleh silap tepat pada faktor-faktor ini.
          </p>
          <ul className="value-ranking-panel__factors">
            {SCORING_V1_WEIGHTS.filter(w => !w.aktif).map(w => (
              <li key={w.faktor}><b>{w.faktor}</b> — {w.laras}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
