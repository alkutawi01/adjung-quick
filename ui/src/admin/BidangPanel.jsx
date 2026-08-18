// BidangPanel.jsx — Admin Console V2, "Bidang" menu.
//
// Groups 3 real, audit-backed concepts under one menu (per docs/prototypes/
// source-feed-type-audit-v2-correction.md) instead of exposing backend
// module names (classification_rules / edition_rules) directly:
//
//   1. Pemetaan Sumber   -- sources whose feed is already dedicated to one
//                           field (real data, filtered from the same
//                           Source Registry read SourceRegistryPanel uses).
//   2. Petunjuk RSS/URL & Feed Campuran -- ClassificationRulesList as-is;
//                           its own Jenis filter (Sumber/URL/Kata kunci)
//                           already distinguishes these, so this is NOT
//                           split into two separate mounts of the same
//                           component/table.
//   3. Susunan Edisi     -- EditionRulesManager as-is (ms-MY only, matches
//                           its existing edition-gated behaviour).
//
// No new backend, no new mutations. All 3 sections reuse existing,
// already-wired components/adapters unchanged.

import { useEffect, useState } from 'react';
import { fetchAllSourcesForIngestion } from '../../../db/source-registry-adapter.mjs';
import ClassificationRulesList from './ClassificationRulesList.jsx';
import EditionRulesManager from './EditionRulesManager.jsx';

function PemetaanSumber({ supabase }) {
  const [sources, setSources] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSources(null);
    setError(null);
    fetchAllSourcesForIngestion(supabase)
      .then(setSources)
      .catch(err => setError(err.message));
  }, [supabase]);

  const mapped = (sources ?? []).filter(s => s.knownCategory);

  return (
    <div className="bidang-pemetaan">
      {error && <p className="review-queue__error">Ralat memuatkan sumber: {error}</p>}
      {sources === null && !error && <p className="admin-app__status">Memuatkan...</p>}
      {sources !== null && (
        <ul className="bidang-pemetaan__list">
          {mapped.map(s => (
            <li key={s.id} className="bidang-pemetaan__row">
              <span className="bidang-pemetaan__source">{s.name}</span>
              <span className="bidang-pemetaan__arrow">&rarr;</span>
              <span className="bidang-pemetaan__field">{s.knownCategory}</span>
            </li>
          ))}
          {mapped.length === 0 && (
            <p className="review-queue__empty">Tiada sumber dgn pemetaan bidang khusus dijumpai.</p>
          )}
        </ul>
      )}
    </div>
  );
}

export default function BidangPanel({ supabase, editionId, editionLabel, editionRules, editionRulesError, editionRulesBusy, onAddEditionRule, onArchiveEditionRule, onRestoreEditionRule, taxonomyFieldCodes, taxonomyFieldLabels }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__intro">
        Quick tidak menggunakan AI untuk meneka bidang. Ia bergantung dahulu pada petunjuk yang
        sumber sendiri sudah beri (sumber/URL/kategori RSS); kata kunci kandungan hanya
        digunakan sebagai jalan terakhir apabila petunjuk itu tidak mencukupi (cth. feed
        campuran seperti Metro Mutakhir).
      </p>

      <h2 className="bidang-panel__section-title">Pemetaan Sumber</h2>
      <p className="bidang-panel__section-desc">
        Sumber yang feednya sudah didedikasikan kepada satu bidang -- tiada peraturan diperlukan.
      </p>
      <PemetaanSumber supabase={supabase} />

      <h2 className="bidang-panel__section-title">Petunjuk RSS/URL &amp; Feed Campuran</h2>
      <p className="bidang-panel__section-desc">
        Peraturan bidang sebenar -- tapis &ldquo;Jenis&rdquo; di bawah kepada URL/Sumber utk
        petunjuk struktur, atau Kata kunci utk feed campuran (bila petunjuk struktur tak cukup).
      </p>
      <ClassificationRulesList supabase={supabase} />

      <h2 className="bidang-panel__section-title">Susunan Edisi</h2>
      <p className="bidang-panel__section-desc">
        Bila sesuatu bidang patut papar berbeza utk edisi ini (cth. Politik luar negara &rarr; Dunia).
      </p>
      {editionId === 'ms-MY' ? (
        <>
          {editionRulesError && <p className="review-queue__error">{editionRulesError}</p>}
          {editionRules === null && !editionRulesError && (
            <p className="admin-app__status">Memuatkan...</p>
          )}
          {editionRules !== null && (
            <EditionRulesManager
              editionLabel={editionLabel}
              taxonomyFieldCodes={taxonomyFieldCodes}
              taxonomyFieldLabels={taxonomyFieldLabels}
              rules={editionRules}
              busy={editionRulesBusy}
              onAdd={onAddEditionRule}
              onArchive={onArchiveEditionRule}
              onRestore={onRestoreEditionRule}
            />
          )}
        </>
      ) : (
        <article className="editorial-desk__placeholder-card">
          <h3 className="editorial-desk__placeholder-title">Susunan Edisi</h3>
          <p className="editorial-desk__placeholder-desc">
            Belum tersedia untuk edisi ini. Fasa 4 bermula dengan edisi Malaysia (ms-MY) sahaja.
          </p>
        </article>
      )}
    </div>
  );
}
