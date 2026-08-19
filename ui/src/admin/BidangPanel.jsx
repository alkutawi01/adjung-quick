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

import { useEffect, useState, useMemo } from 'react';
import { fetchAllSourcesForIngestion } from '../../../db/source-registry-adapter.mjs';
import { fetchClassificationRules } from './classificationRulesAdapter.js';
import { SUBJECT_VOCABULARY } from '../../../classification/lib/desk-vocabulary.mjs';
import ClassificationRulesList from './ClassificationRulesList.jsx';
import EditionRulesManager from './EditionRulesManager.jsx';
import { getFieldLabel } from '../../../state/editions.js';

// ms-MY tokens only from SUBJECT_VOCABULARY -- Fasa 4's locked scope is
// ms-MY sahaja (en-global/ar-global deferred), same convention as
// EditionRulesManager's ms-MY-only gate elsewhere in this file. The
// dictionary itself has no per-token language tag, so this list is
// maintained by hand against the real file's own "--- ms-MY ---" section
// (classification/lib/desk-vocabulary.mjs) -- verified against that file
// this round, not guessed.
const MS_MY_TOKENS = [
  'politik', 'nasional/politik', 'berita-politik', 'jenayah', 'kes', 'ekonomi',
  'bisnes', 'berita-bisnes', 'sukan', 'berita-sukan', 'arena', 'kesihatan', 'sihat',
  'pendidikan', 'akademia', 'teknologi', 'itmetro', 'sains', 'alam sekitar', 'budaya',
  'hiburan', 'gaya/hiburan', 'berita-hiburan', 'rap', 'agama', 'addin',
  'gaya hidup', 'gaya-hidup', 'santai',
];

// Bernama's real title-prefix mechanism (classification/lib/bernama-prefix.mjs),
// hand-copied here for display since the source file exports a lookup
// function, not the raw map -- values verified to match that file exactly.
const BERNAMA_PREFIX_SUBJECTS = { business: 'Business', sports: 'Sports', sukan: 'Sports' };

// Pemetaan Sumber -- Round 4/15 (2026-08-19). Traced before building:
// classify-production.js's real precedence is Admin Classification Rule
// (rule_type='source', matched by source id) SHORT-CIRCUITS everything
// below it, including the built-in knownCategory/desk-vocabulary default
// (classification/edition-classification.mjs's classifyForEdition(),
// confirmed by reading the code, not assumed). So "Tetapan asas" here is
// literally sources.known_category (or "Umum" when unset, meaning the
// source itself has no field dedication and relies on Bidang's other
// two tiers -- URL/RSS petunjuk or content-rule fallback); "Pelarasan
// Admin" is a matching classification_rules row.
//
// Write path checked and found NOT browser-safe: db/schema-classification-
// rules-rpc-v1.sql grants add/archive/restore_classification_rule to
// service_role ONLY (never `authenticated`) -- unlike edition_rules' RPCs,
// which were specifically patched for browser/admin auth. No "Tambah
// pelarasan" action is offered here; the gap is stated plainly instead of
// papered over with a button that would fail or, worse, silently need a
// secret key this app must never hold.
function PemetaanSumber({ supabase }) {
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState(null);
  const [rules, setRules] = useState(null);
  const [rulesError, setRulesError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    setSources(null);
    setSourcesError(null);
    fetchAllSourcesForIngestion(supabase)
      .then(setSources)
      .catch(err => setSourcesError(err.message));
    setRules(null);
    setRulesError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setRulesError(err.message));
  }, [supabase]);

  // Admin override lookup: an ACTIVE classification_rules row of
  // rule_type='source' whose pattern is this source's id.
  const overrideBySourceId = useMemo(() => {
    const map = new Map();
    for (const r of rules ?? []) {
      if (r.rule_type === 'source' && r.status !== 'archived') map.set(r.pattern, r);
    }
    return map;
  }, [rules]);

  const rows = useMemo(() => (sources ?? []).map(s => ({
    source: s,
    override: overrideBySourceId.get(s.id) ?? null,
  })), [sources, overrideBySourceId]);

  const loading = sources === null || rules === null;
  const error = sourcesError || rulesError;
  const open = rows.find(r => r.source.id === openId) ?? null;

  return (
    <div className="bidang-pemetaan">
      {error && <p className="review-queue__error">Ralat memuatkan pemetaan: {error}</p>}
      {loading && !error && <p className="admin-app__status">Memuatkan...</p>}
      {!loading && (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Bidang</th>
                <th>Asal keputusan</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ source, override }) => {
                const fieldLabel = override
                  ? (override.subject_code ?? override.field_code ?? '—')
                  : (source.knownCategory ?? 'Umum (ditentukan melalui petunjuk berita)');
                return (
                  <tr key={source.id}>
                    <td className="source-table__name">{source.name}</td>
                    <td>{fieldLabel}</td>
                    <td>{override ? 'Pelarasan Admin' : 'Tetapan asas'}</td>
                    <td><button type="button" onClick={() => setOpenId(source.id)}>Lihat</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="drawer-overlay" onClick={() => setOpenId(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenId(null)}>Tutup</button>
            <h3 className="drawer__title">{open.source.name} &mdash; Pemetaan Bidang</h3>
            <dl className="drawer__fields">
              <dt>Tetapan asas</dt>
              <dd>{open.source.knownCategory ?? 'Umum (ditentukan melalui petunjuk berita)'}</dd>
              <dt>Pelarasan Admin</dt>
              <dd>{open.override ? (open.override.subject_code ?? open.override.field_code) : 'Tiada'}</dd>
            </dl>
            <p className="section-note" style={{ marginTop: 14 }}>
              Tambah/ubah pelarasan belum tersedia di sini -- laluan tulis backend
              (classification_rules RPC) masih terhad kepada service_role sahaja, bukan
              sesi admin biasa. Perlu dibetulkan di backend dahulu (macam edition_rules
              dahulu) sebelum boleh disambung dgn selamat.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

// Petunjuk RSS/URL -- Round 5/15 (2026-08-19). Traced every REAL
// production structural-evidence mechanism before building this table
// (per instruction: "cari semua production path... jangan gunakan audit
// malam tadi sebagai senarai pemetaan baru"):
//
// 1. desk-vocabulary.mjs's SUBJECT_VOCABULARY -- a token->Universal
//    Subject lookup matched against RSS <category>/URL segments alike
//    (story-understanding.mjs reads it for both). Always "Tetapan asas"
//    -- there is no admin-override path into this hardcoded dictionary.
// 2. bernama-prefix.mjs's title-prefix map -- Bernama-specific, a
//    DIFFERENT evidence shape (title text, not URL/category) but still
//    Tier 1 publisher-declared structure, not content/keyword.
// 3. classification_rules rows with rule_type='url' -- these ARE
//    Admin-authored per that table's own design (an explicit fact), so
//    always shown as "Pelarasan Admin", never "Tetapan asas".
//
// Deliberately excludes keyword-type rules and content-rules.mjs's
// phrase list -- those are Feed Campuran's scope (a later round), kept
// out so the hierarchy (source-dedicated -> structural evidence ->
// content fallback) stays legible to an editor reading this screen.
function PetunjukRssUrl({ supabase, editionId }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState(null);
  const [openRow, setOpenRow] = useState(null);

  useEffect(() => {
    setRules(null);
    setError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setError(err.message));
  }, [supabase]);

  const vocabRows = MS_MY_TOKENS
    .filter(token => SUBJECT_VOCABULARY[token])
    .map(token => ({
      key: `vocab-${token}`,
      sumber: 'Semua sumber',
      jenis: 'Kategori RSS / segmen URL',
      corak: token,
      bidang: getFieldLabel(editionId, SUBJECT_VOCABULARY[token]),
      asal: 'Tetapan asas',
      liputan: 'Hanya item sepadan',
    }));

  const bernamaRows = Object.entries(BERNAMA_PREFIX_SUBJECTS).map(([prefix, subject]) => ({
    key: `bernama-${prefix}`,
    sumber: 'Bernama',
    jenis: 'Prefix tajuk',
    corak: `"${prefix} : ..."`,
    bidang: getFieldLabel(editionId, subject),
    asal: 'Tetapan asas',
    liputan: 'Hanya item sepadan',
  }));

  const urlRuleRows = (rules ?? [])
    .filter(r => r.rule_type === 'url' && r.status !== 'archived')
    .map(r => ({
      key: `rule-${r.id}`,
      sumber: r.sourceName ?? 'Pelbagai',
      jenis: 'URL (peraturan Admin)',
      corak: r.pattern,
      bidang: getFieldLabel(r.edition_id ?? editionId, r.field_code ?? r.subject_code),
      asal: 'Pelarasan Admin',
      liputan: 'Hanya item sepadan',
    }));

  const rows = [...vocabRows, ...bernamaRows, ...urlRuleRows];
  const open = rows.find(r => r.key === openRow) ?? null;

  return (
    <div className="bidang-pemetaan">
      {error && <p className="review-queue__error">Ralat memuatkan peraturan Admin: {error}</p>}
      {rules === null && !error && <p className="admin-app__status">Memuatkan...</p>}
      {rules !== null && (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Jenis Petunjuk</th>
                <th>Corak/Nilai</th>
                <th>Bidang</th>
                <th>Asal</th>
                <th>Liputan</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td className="source-table__name">{r.sumber}</td>
                  <td>{r.jenis}</td>
                  <td><code>{r.corak}</code></td>
                  <td>{r.bidang}</td>
                  <td>{r.asal}</td>
                  <td>{r.liputan}</td>
                  <td><button type="button" onClick={() => setOpenRow(r.key)}>Lihat</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="section-note">
        Peraturan Admin baharu (jenis URL) belum boleh ditambah di sini -- laluan tulis
        classification_rules RPC masih terhad kepada service_role sahaja (sama isu macam
        Pemetaan Sumber di atas). Dicatat sebagai backlog, belum dibetulkan pusingan ini.
      </p>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpenRow(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenRow(null)}>Tutup</button>
            <h3 className="drawer__title">Petunjuk {open.jenis}</h3>
            <dl className="drawer__fields">
              <dt>Sumber</dt><dd>{open.sumber}</dd>
              <dt>Corak</dt><dd><code>{open.corak}</code></dd>
              <dt>Hasil</dt><dd>{open.bidang}</dd>
              <dt>Asal</dt><dd>{open.asal}</dd>
            </dl>
            <p className="section-note" style={{ marginTop: 14 }}>
              Digunakan apabila petunjuk ini ditemui pada item berita.
            </p>
          </aside>
        </div>
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

      <h2 className="bidang-panel__section-title">Petunjuk RSS/URL</h2>
      <p className="bidang-panel__section-desc">
        Bila kategori RSS, segmen URL atau prefix tajuk sudah cukup jelas -- tiada kata kunci
        kandungan terlibat di sini.
      </p>
      <PetunjukRssUrl supabase={supabase} editionId={editionId} />

      <h2 className="bidang-panel__section-title">Semua peraturan (pandangan penuh)</h2>
      <p className="bidang-panel__section-desc">
        Termasuk peraturan jenis Kata kunci (Feed Campuran) -- tapis &ldquo;Jenis&rdquo; di
        bawah utk fokus kepada satu jenis.
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
