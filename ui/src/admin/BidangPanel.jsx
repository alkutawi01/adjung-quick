// BidangPanel.jsx — Admin Console V2, "Kategori" menu.
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
import { getFieldEntryForSubject } from '../../../classification/lib/taxonomy-registry.mjs';
import { resolveKnownCategory } from './kategoriLabel.js';
import { addClassificationRule, archiveClassificationRule } from './classificationRulesAdapter.js';

// Polish 2/5: self-service form for a source-scoped Kategori override.
// A classification rule of rule_type='source' SHORT-CIRCUITS the whole
// automatic resolver when it matches (confirmed in classifyForEdition()),
// so the copy here says "tetapkan" -- a firm decision -- never "cadangan".
// Priority is auto-assigned by the caller; the editor never sees a number.
function TambahPelarasanSumber({ sources, taxonomyFieldCodes, taxonomyFieldLabels, busy, nextPriority, onAdd, onCancel }) {
  const [sourceId, setSourceId] = useState('');
  const [fieldCode, setFieldCode] = useState('');
  const canSubmit = sourceId && fieldCode && !busy;

  return (
    <form
      className="source-registry__add"
      onSubmit={e => {
        e.preventDefault();
        if (!canSubmit) return;
        onAdd({ ruleType: 'source', pattern: sourceId, fieldCode, priority: nextPriority });
      }}
    >
      <label className="review-card__field">
        Sumber
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} disabled={busy}>
          <option value="">— Pilih sumber —</option>
          {[...(sources ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="review-card__field">
        Paparkan dalam
        <select value={fieldCode} onChange={e => setFieldCode(e.target.value)} disabled={busy}>
          <option value="">— Pilih kategori —</option>
          {taxonomyFieldCodes.map((code, i) => (
            <option key={code} value={code}>{taxonomyFieldLabels[i]}</option>
          ))}
        </select>
      </label>
      <p className="section-note">
        Semua berita daripada sumber ini akan terus diletakkan dalam kategori yang dipilih,
        mengatasi petunjuk automatik.
      </p>
      <div className="card__actions">
        <button type="submit" disabled={!canSubmit}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}

// Pusingan Polish 1/5 (2026-08-19), real bug found via authenticated
// screenshot audit: getFieldLabel(editionId, fieldCode) only resolves a
// FIELD code ('politics', 'bisnes') to its Malay label -- it was being
// called throughout this file with Universal SUBJECT codes instead
// ('Politics', 'Economy', from desk-vocabulary.mjs's SUBJECT_VOCABULARY
// or classification_rules.subject_code), which getFieldLabel doesn't
// know how to resolve, so it fell back to returning the raw English
// subject code verbatim -- exactly the "Politics"/"Crime"/"Economy" raw
// text an authenticated pass caught live in Petunjuk RSS/URL. The real
// subject->field reverse lookup already exists
// (taxonomy-registry.mjs::getFieldEntryForSubject, keyed on each field's
// own `subject_codes` array) -- this helper picks the right one of the
// two lookups depending on which kind of code it's given, so every call
// site in this file resolves correctly instead of re-guessing.
function resolveBidangLabel(editionId, { fieldCode, subjectCode }) {
  if (fieldCode) return getFieldLabel(editionId, fieldCode);
  if (subjectCode) return getFieldEntryForSubject(editionId, subjectCode)?.label ?? subjectCode;
  return null;
}

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

// content-rules.mjs's real PHRASE_RULES (Tier 5, "deliberately minimal"
// per that file's own header) -- hand-copied here since PHRASE_RULES
// itself isn't exported (only extractContentEvidence() is), and this
// stays UI-only rather than touching classifier code just to add an
// export. Kept in sync by hand against the real file, verified this
// round -- ms-MY/EN phrases only shown (Arabic phrases omitted, matches
// Fasa 4's ms-MY-only scope).
const CONTENT_PHRASE_RULES = [
  { subject: 'Crime', phrases: ['mahkamah', 'didakwa', 'waran tangkap', 'ditahan', 'SPRM', 'dipenjara', 'court', 'charged', 'arrested', 'jailed', 'sentenced'] },
  { subject: 'Disaster', phrases: ['gempa bumi', 'gempa', 'earthquake', 'banjir besar', 'banjir', 'flood', 'kapal karam', 'tanah runtuh', 'landslide', 'jerebu', 'haze', 'kebakaran hutan', 'wildfire', 'ribut', 'storm', 'kemarau', 'drought'] },
  { subject: 'Politics', phrases: ['parlimen', 'ahli parlimen', 'menteri', 'parti politik', 'PRU', 'parliament', 'minister', 'election'] },
  { subject: 'Sports', phrases: ['bola sepak', 'football', 'olympics', 'piala'] },
  { subject: 'Health', phrases: ['hospital', 'penyakit', 'vaksin', 'disease', 'vaccine', 'wabak', 'outbreak'] },
  { subject: 'Environment', phrases: ['perubahan iklim', 'climate change', 'pencemaran', 'pollution', 'kualiti udara', 'air quality'] },
];

// Pemetaan Sumber -- Round 4/15 (2026-08-19). Traced before building:
// classify-production.js's real precedence is Admin Classification Rule
// (rule_type='source', matched by source id) SHORT-CIRCUITS everything
// below it, including the built-in knownCategory/desk-vocabulary default
// (classification/edition-classification.mjs's classifyForEdition(),
// confirmed by reading the code, not assumed). So "Tetapan asas" here is
// literally sources.known_category (or "Umum" when unset, meaning the
// source itself has no field dedication and relies on Kategori's other
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
function PemetaanSumber({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState(null);
  const [rules, setRules] = useState(null);
  const [rulesError, setRulesError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = () => {
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
  };

  useEffect(load, [supabase]);

  const runAction = async fn => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

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
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {loading && !error && <p className="admin-app__status">Memuatkan...</p>}

      {!loading && !addOpen && (
        <button type="button" onClick={() => setAddOpen(true)}>+ Tambah pelarasan</button>
      )}
      {!loading && addOpen && (
        <TambahPelarasanSumber
          sources={sources}
          taxonomyFieldCodes={taxonomyFieldCodes}
          taxonomyFieldLabels={taxonomyFieldLabels}
          busy={busy}
          nextPriority={(rules ?? []).filter(r => r.rule_type === 'source' && r.status !== 'archived').length + 1}
          onCancel={() => setAddOpen(false)}
          onAdd={payload => runAction(async () => {
            await addClassificationRule(supabase, { ...payload, editionId, createdBy: userId ?? null });
            setAddOpen(false);
          })}
        />
      )}

      {!loading && (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Kategori</th>
                <th>Asal keputusan</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ source, override }) => {
                const fieldLabel = override
                  ? resolveBidangLabel(editionId, { fieldCode: override.field_code, subjectCode: override.subject_code })
                  : resolveKnownCategory(editionId, source.knownCategory).label;
                return (
                  <tr key={source.id}>
                    <td className="source-table__name">{source.name}</td>
                    <td>{fieldLabel}</td>
                    <td>{override ? 'Pelarasan Admin' : 'Tetapan asas'}</td>
                    <td className="source-table__actions">
                      <button type="button" onClick={() => setOpenId(source.id)}>Lihat</button>
                      {override && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction(() => archiveClassificationRule(supabase, override.id))}
                        >
                          Buang pelarasan
                        </button>
                      )}
                    </td>
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
            <h3 className="drawer__title">{open.source.name} &mdash; Pemetaan Kategori</h3>
            <dl className="drawer__fields">
              <dt>Tetapan asas</dt>
              <dd>{resolveKnownCategory(editionId, open.source.knownCategory).label}</dd>
              <dt>Pelarasan Admin</dt>
              <dd>{open.override ? resolveBidangLabel(editionId, { fieldCode: open.override.field_code, subjectCode: open.override.subject_code }) : 'Tiada'}</dd>
            </dl>
            <p className="section-note" style={{ marginTop: 14 }}>
              Pelarasan Admin mengatasi tetapan asas: semua berita daripada sumber ini akan
              terus diletakkan dalam kategori yang ditetapkan.
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
      // "Tag RSS", bukan "Kategori RSS" -- selepas Bidang dinamakan semula
      // jadi Kategori (arahan Izzat), "Kategori RSS" jadi taksa: pembaca
      // tak tahu sama ada maksudnya Kategori Adjung atau tag kategori
      // milik feed RSS itu sendiri. Ini yang KEDUA.
      jenis: 'Tag RSS / segmen URL',
      corak: token,
      bidang: resolveBidangLabel(editionId, { subjectCode: SUBJECT_VOCABULARY[token] }),
      asal: 'Tetapan asas',
      liputan: 'Hanya item sepadan',
    }));

  const bernamaRows = Object.entries(BERNAMA_PREFIX_SUBJECTS).map(([prefix, subject]) => ({
    key: `bernama-${prefix}`,
    sumber: 'Bernama',
    jenis: 'Prefix tajuk',
    corak: `"${prefix} : ..."`,
    bidang: resolveBidangLabel(editionId, { subjectCode: subject }),
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
      bidang: resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code }),
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
                <th>Kategori</th>
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
                  <td>{r.kategori}</td>
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
        Pelarasan baharu (jenis URL) belum boleh ditambah di sini -- laluan tulis backend
        masih terhad kepada sistem sahaja (sama isu macam Pemetaan Sumber di atas). Dicatat
        sebagai backlog, belum dibetulkan pusingan ini.
      </p>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpenRow(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenRow(null)}>Tutup</button>
            <h3 className="drawer__title">Petunjuk {open.jenis}</h3>
            <dl className="drawer__fields">
              <dt>Sumber</dt><dd>{open.sumber}</dd>
              <dt>Corak</dt><dd><code>{open.corak}</code></dd>
              <dt>Hasil</dt><dd>{open.kategori}</dd>
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

// Feed Campuran -- Round 6/15 (2026-08-19). Traced content-rules.mjs +
// story-understanding.mjs before building: a content-rule phrase hit is
// NOT a direct keyword->field mapping. extractContentEvidence() returns
// hits which story-understanding.mjs pushes into subjectHits, combined
// via aggregate()'s noisy-OR across ALL evidence tiers into ranked
// subject_candidates -- Tier 5 (content) is the WEAKEST/last tier, one
// input among several, gated by classification-confidence-policy
// afterwards (classifyForEdition() only calls a story "classified" once
// confidence clears its threshold; otherwise it lands in Semakan as
// low-confidence). This component's copy reflects "calon, tertakluk
// keyakinan" throughout -- never "kata X = terus kategori Y".
//
// classification_rules rows with rule_type='keyword' ARE a direct/
// deterministic admin fact (per that table's own design, same as type=
// 'source'/'url') -- shown separately as "Pelarasan Admin", not
// conflated with the probabilistic built-in phrase rules above.
//
// Metro Mutakhir's real coverage numbers (0% Layer-1, 30% resolved by
// the Crime phrases, 10% false-positive risk on "mahkamah") come from
// docs/prototypes/metro-mutakhir-classification-coverage-analysis-v1.md
// -- an AUDIT FINDING from a 20-item sample, labelled as such, never
// presented as a live runtime metric this component computed itself.
function FeedCampuran({ supabase, editionId }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState(null);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    setRules(null);
    setError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setError(err.message));
  }, [supabase]);

  const builtInRows = CONTENT_PHRASE_RULES.map(r => ({
    key: `phrase-${r.subject}`,
    sumber: 'Sumber dengan metadata tak cukup (cth. feed campuran)',
    corak: r.phrases.slice(0, 4).join(', ') + (r.phrases.length > 4 ? `, +${r.phrases.length - 4} lagi` : ''),
    fullPhrases: r.phrases,
    bidang: resolveBidangLabel(editionId, { subjectCode: r.subject }),
    kaedah: 'Calon sahaja -- tertakluk get keyakinan',
    asal: 'Tetapan asas',
    isMahkamah: r.subject === 'Crime',
  }));

  const adminRows = (rules ?? [])
    .filter(r => r.rule_type === 'keyword' && r.status !== 'archived')
    .map(r => ({
      key: `rule-${r.id}`,
      sumber: r.sourceName ?? 'Pelbagai',
      corak: r.pattern,
      fullPhrases: [r.pattern],
      bidang: resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code }),
      kaedah: 'Fakta admin -- keputusan terus (bukan calon)',
      asal: 'Pelarasan Admin',
      isMahkamah: false,
    }));

  const rows = [...builtInRows, ...adminRows];
  const open = rows.find(r => r.key === openKey) ?? null;

  return (
    <div className="bidang-pemetaan">
      <p className="section-note">
        Mental model: petunjuk sumber/RSS tak cukup &rarr; sistem semak kandungan &rarr; rule
        hasilkan CALON kategori &rarr; sistem tentukan sama ada keyakinan cukup utk klasifikasi
        terus, atau berita masuk Perlu Semakan. Bukan &ldquo;ada kata X = terus kategori Y&rdquo;.
      </p>
      <p className="section-note">
        Contoh feed campuran sebenar: Metro Mutakhir -- 0% item ada metadata struktur, peraturan
        Jenayah di bawah selesaikan ~30% sampel dgn betul. Angka daripada kajian audit 20 item
        (bukan metrik masa nyata).
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan peraturan Admin: {error}</p>}
      {rules === null && !error && <p className="admin-app__status">Memuatkan...</p>}
      {rules !== null && (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Corak kandungan</th>
                <th>Kategori</th>
                <th>Kaedah</th>
                <th>Asal</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td>{r.sumber}</td>
                  <td><code>{r.corak}</code></td>
                  <td>{r.kategori}</td>
                  <td>{r.kaedah}</td>
                  <td>{r.asal}</td>
                  <td><button type="button" onClick={() => setOpenKey(r.key)}>Lihat</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="section-note">
        Peraturan kandungan baharu belum boleh ditambah di sini -- laluan tulis backend masih
        terhad kepada sistem sahaja (backlog sama macam Pemetaan Sumber &amp; Petunjuk RSS/URL).
      </p>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpenKey(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <button type="button" className="drawer__close" onClick={() => setOpenKey(null)}>Tutup</button>
            <h3 className="drawer__title">Peraturan kandungan</h3>
            <dl className="drawer__fields">
              <dt>Semua corak</dt><dd>{open.fullPhrases.join(', ')}</dd>
              <dt>Kategori (calon)</dt><dd>{open.kategori}</dd>
              <dt>Kaedah</dt><dd>{open.kaedah}</dd>
              <dt>Asal</dt><dd>{open.asal}</dd>
            </dl>
            {open.isMahkamah && (
              <p className="section-note" style={{ marginTop: 14 }}>
                <b>Dapatan audit (bukan metrik masa nyata):</b> dlm sampel 20 berita Metro
                Mutakhir, 2/7 pengesanan &ldquo;mahkamah&rdquo; sebenarnya bukan cerita
                jenayah (cerita dasar yg sekadar sebut keputusan mahkamah secara prosedur).
                Risiko false-positive terbukti dlm sampel tu, bukan andaian.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default function BidangPanel({ supabase, editionId, editionLabel, editionRules, editionRulesError, editionRulesBusy, onAddEditionRule, onArchiveEditionRule, onRestoreEditionRule, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__intro">
        Quick tidak menggunakan AI untuk meneka kategori. Ia bergantung dahulu pada petunjuk yang
        sumber sendiri sudah beri (sumber/URL/tag RSS); kata kunci kandungan hanya
        digunakan sebagai jalan terakhir apabila petunjuk itu tidak mencukupi (cth. feed
        campuran seperti Metro Mutakhir).
      </p>

      <h2 className="bidang-panel__section-title">Pemetaan Sumber</h2>
      <p className="bidang-panel__section-desc">
        Sumber yang feednya sudah didedikasikan kepada satu kategori -- tiada peraturan diperlukan.
      </p>
      <PemetaanSumber
        supabase={supabase}
        editionId={editionId}
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        userId={userId}
      />

      <h2 className="bidang-panel__section-title">Petunjuk RSS/URL</h2>
      <p className="bidang-panel__section-desc">
        Bila tag RSS, segmen URL atau prefix tajuk sudah cukup jelas -- tiada kata kunci
        kandungan terlibat di sini.
      </p>
      <PetunjukRssUrl supabase={supabase} editionId={editionId} />

      <h2 className="bidang-panel__section-title">Feed Campuran</h2>
      <p className="bidang-panel__section-desc">
        Bila petunjuk sumber/RSS/URL di atas tak mencukupi -- kandungan diperiksa sebagai
        jalan terakhir (cth. Metro Mutakhir).
      </p>
      <FeedCampuran supabase={supabase} editionId={editionId} />

      <h2 className="bidang-panel__section-title">Semua Pelarasan Kategori (pandangan penuh)</h2>
      <p className="bidang-panel__section-desc">
        Termasuk pelarasan jenis Kata kunci (Feed Campuran) -- tapis &ldquo;Jenis&rdquo; di
        bawah utk fokus kepada satu jenis.
      </p>
      <ClassificationRulesList supabase={supabase} />

      <h2 className="bidang-panel__section-title">Susunan Edisi</h2>
      <p className="bidang-panel__section-desc">
        Bila sesuatu kategori patut papar berbeza utk edisi ini (cth. Politik luar negara &rarr; Dunia).
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
