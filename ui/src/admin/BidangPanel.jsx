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
import { addClassificationRule, archiveClassificationRule, restoreClassificationRule } from './classificationRulesAdapter.js';
import { PHRASE_RULES as REAL_CONTENT_PHRASE_RULES } from '../../../classification/lib/content-rules.mjs';

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
        <button type="submit" disabled={!canSubmit}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="btn--quiet" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}

// Polish 3/10 -- borang kongsi untuk Petunjuk RSS/URL dan Feed Campuran.
// Sama struktur seperti TambahPelarasanSumber (corak + kategori sasaran),
// tetapi medan corak di sini ialah teks bebas (URL/segmen atau frasa
// kandungan), bukan pilihan sumber tetap. `nasihat` membawa amaran khusus
// setiap jenis (contoh: elak perkataan terlalu umum untuk kata kunci).
function TambahPelarasanCorak({ ruleType, patternLabel, patternPlaceholder, nasihat, taxonomyFieldCodes, taxonomyFieldLabels, busy, nextPriority, onAdd, onCancel }) {
  const [pattern, setPattern] = useState('');
  const [fieldCode, setFieldCode] = useState('');
  const canSubmit = pattern.trim() && fieldCode && !busy;

  return (
    <form
      className="source-registry__add"
      onSubmit={e => {
        e.preventDefault();
        if (!canSubmit) return;
        onAdd({ ruleType, pattern: pattern.trim(), fieldCode, priority: nextPriority });
      }}
    >
      <label className="review-card__field">
        {patternLabel}
        <input
          type="text"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          placeholder={patternPlaceholder}
          disabled={busy}
        />
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
      {nasihat && <p className="section-note">{nasihat}</p>}
      <div className="card__actions">
        <button type="submit" disabled={!canSubmit}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
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

// Polish 4B (2026-08-19) -- was a hand-copied duplicate of content-
// rules.mjs's real PHRASE_RULES, kept in sync "by hand" (Fasa 4's own
// words). It drifted stale within one round (missing Education/Economy/
// Business, an old narrower Sports list) -- Admin was describing rules
// that no longer matched the runtime classifier. content-rules.mjs now
// exports PHRASE_RULES directly; this imports the SAME array the
// classifier runs, zero duplication, zero classifier-behavior change.
// ms-MY/EN phrases only shown below (Arabic phrases filtered out,
// matches Fasa 4's ms-MY-only scope -- the real array has more per
// subject than what renders here).
const ARABIC_RE = /[؀-ۿ]/;
const CONTENT_PHRASE_RULES = REAL_CONTENT_PHRASE_RULES.map(r => ({
  subject: r.subject,
  phrases: r.phrases.filter(p => !ARABIC_RE.test(p)),
}));

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

  // Polish 3/10: pelarasan yang telah dinyahaktifkan (status='archived') --
  // dipaparkan berasingan supaya editor boleh aktifkan semula tanpa
  // menaip semula pelarasan yang sama.
  const archivedOverrides = useMemo(() => {
    const bySource = new Map((sources ?? []).map(s => [s.id, s]));
    return (rules ?? [])
      .filter(r => r.rule_type === 'source' && r.status === 'archived')
      .map(r => ({ rule: r, source: bySource.get(r.pattern) ?? null }))
      .filter(r => r.source);
  }, [rules, sources]);

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
      {loading && !error && <p className="admin-app__status">Memuatkan…</p>}

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
                          Nyahaktifkan
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

      {!loading && archivedOverrides.length > 0 && (
        <>
          <h3 className="bidang-panel__section-title">Pelarasan dinyahaktifkan</h3>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Sumber</th><th>Kategori (sebelum dinyahaktifkan)</th><th>Tindakan</th></tr>
              </thead>
              <tbody>
                {archivedOverrides.map(({ rule, source }) => (
                  <tr key={rule.id}>
                    <td className="source-table__name">{source.name}</td>
                    <td>{resolveBidangLabel(editionId, { fieldCode: rule.field_code, subjectCode: rule.subject_code })}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(() => restoreClassificationRule(supabase, rule.id))}
                      >
                        Aktifkan semula
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
function PetunjukRssUrl({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = () => {
    setRules(null);
    setError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setError(err.message));
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
      kategori: resolveBidangLabel(editionId, { subjectCode: SUBJECT_VOCABULARY[token] }),
      asal: 'Tetapan asas',
      liputan: 'Hanya item sepadan',
    }));

  const bernamaRows = Object.entries(BERNAMA_PREFIX_SUBJECTS).map(([prefix, subject]) => ({
    key: `bernama-${prefix}`,
    sumber: 'Bernama',
    jenis: 'Prefix tajuk',
    corak: `"${prefix} : …"`,
    kategori: resolveBidangLabel(editionId, { subjectCode: subject }),
    asal: 'Tetapan asas',
    liputan: 'Hanya item sepadan',
  }));

  const urlRuleRows = (rules ?? [])
    .filter(r => r.rule_type === 'url' && r.status !== 'archived')
    .map(r => ({
      key: `rule-${r.id}`,
      id: r.id,
      sumber: r.sourceName ?? 'Pelbagai',
      jenis: 'URL (peraturan Admin)',
      corak: r.pattern,
      kategori: resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code }),
      asal: 'Pelarasan Admin',
      liputan: 'Hanya item sepadan',
      boleh_nyahaktif: true,
    }));

  const archivedUrlRules = (rules ?? []).filter(r => r.rule_type === 'url' && r.status === 'archived');

  const rows = [...vocabRows, ...bernamaRows, ...urlRuleRows];
  const open = rows.find(r => r.key === openRow) ?? null;

  return (
    <div className="bidang-pemetaan">
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {error && <p className="review-queue__error">Ralat memuatkan peraturan Admin: {error}</p>}
      {rules === null && !error && <p className="admin-app__status">Memuatkan…</p>}

      {rules !== null && !addOpen && (
        <button type="button" onClick={() => setAddOpen(true)}>+ Tambah pelarasan URL</button>
      )}
      {rules !== null && addOpen && (
        <TambahPelarasanCorak
          ruleType="url"
          patternLabel="Segmen URL"
          patternPlaceholder="contoh: /sukan/"
          nasihat="Pelarasan ini terpakai pada mana-mana berita yang URL-nya mengandungi segmen ini, tidak kira sumber."
          taxonomyFieldCodes={taxonomyFieldCodes}
          taxonomyFieldLabels={taxonomyFieldLabels}
          busy={busy}
          nextPriority={urlRuleRows.length + 1}
          onCancel={() => setAddOpen(false)}
          onAdd={payload => runAction(async () => {
            await addClassificationRule(supabase, { ...payload, editionId, createdBy: userId ?? null });
            setAddOpen(false);
          })}
        />
      )}

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
                  <td className="source-table__actions">
                    <button type="button" onClick={() => setOpenRow(r.key)}>Lihat</button>
                    {r.boleh_nyahaktif && (
                      <button type="button" disabled={busy} onClick={() => runAction(() => archiveClassificationRule(supabase, r.id))}>
                        Nyahaktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archivedUrlRules.length > 0 && (
        <>
          <h3 className="bidang-panel__section-title">Pelarasan URL dinyahaktifkan</h3>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Corak</th><th>Kategori</th><th>Tindakan</th></tr>
              </thead>
              <tbody>
                {archivedUrlRules.map(r => (
                  <tr key={r.id}>
                    <td><code>{r.pattern}</code></td>
                    <td>{resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code })}</td>
                    <td>
                      <button type="button" disabled={busy} onClick={() => runAction(() => restoreClassificationRule(supabase, r.id))}>
                        Aktifkan semula
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
function FeedCampuran({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = () => {
    setRules(null);
    setError(null);
    fetchClassificationRules(supabase)
      .then(setRules)
      .catch(err => setError(err.message));
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

  const builtInRows = CONTENT_PHRASE_RULES.map(r => ({
    key: `phrase-${r.subject}`,
    sumber: 'Sumber dengan metadata tidak cukup (contoh feed campuran)',
    corak: r.phrases.slice(0, 4).join(', ') + (r.phrases.length > 4 ? `, +${r.phrases.length - 4} lagi` : ''),
    fullPhrases: r.phrases,
    kategori: resolveBidangLabel(editionId, { subjectCode: r.subject }),
    kaedah: 'Calon sahaja — tertakluk get keyakinan',
    asal: 'Tetapan asas',
    isMahkamah: r.subject === 'Crime',
  }));

  const adminRows = (rules ?? [])
    .filter(r => r.rule_type === 'keyword' && r.status !== 'archived')
    .map(r => ({
      key: `rule-${r.id}`,
      id: r.id,
      sumber: r.sourceName ?? 'Pelbagai',
      corak: r.pattern,
      fullPhrases: [r.pattern],
      kategori: resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code }),
      kaedah: 'Fakta admin — keputusan terus (bukan calon)',
      asal: 'Pelarasan Admin',
      isMahkamah: false,
      boleh_nyahaktif: true,
    }));

  const archivedKeywordRules = (rules ?? []).filter(r => r.rule_type === 'keyword' && r.status === 'archived');

  const rows = [...builtInRows, ...adminRows];
  const open = rows.find(r => r.key === openKey) ?? null;

  return (
    <div className="bidang-pemetaan">
      <p className="section-note">
        Cara ia berfungsi: petunjuk sumber/RSS tidak cukup &rarr; sistem semak kandungan &rarr;
        peraturan hasilkan CALON kategori &rarr; sistem tentukan sama ada keyakinan cukup untuk
        klasifikasi terus, atau berita masuk Perlu Semakan. Bukan &ldquo;ada kata X = terus
        kategori Y&rdquo;.
      </p>
      <p className="section-note">
        Contoh feed campuran sebenar: Metro Mutakhir — 0% item ada metadata struktur, peraturan
        Jenayah di bawah selesaikan ~30% sampel dengan betul. Angka daripada kajian audit 20 item
        (bukan metrik masa nyata).
      </p>

      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {error && <p className="review-queue__error">Ralat memuatkan peraturan Admin: {error}</p>}
      {rules === null && !error && <p className="admin-app__status">Memuatkan…</p>}

      {rules !== null && !addOpen && (
        <button type="button" onClick={() => setAddOpen(true)}>+ Tambah peraturan kata kunci</button>
      )}
      {rules !== null && addOpen && (
        <TambahPelarasanCorak
          ruleType="keyword"
          patternLabel="Kata kunci / frasa"
          patternPlaceholder="contoh: waran tangkap"
          nasihat="Elakkan perkataan terlalu umum (contoh: 'mahkamah' sahaja) — perkataan sedemikian boleh padan cerita yang bukan kategori ini. Guna frasa yang lebih khusus."
          taxonomyFieldCodes={taxonomyFieldCodes}
          taxonomyFieldLabels={taxonomyFieldLabels}
          busy={busy}
          nextPriority={adminRows.length + 1}
          onCancel={() => setAddOpen(false)}
          onAdd={payload => runAction(async () => {
            await addClassificationRule(supabase, { ...payload, editionId, createdBy: userId ?? null });
            setAddOpen(false);
          })}
        />
      )}

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
                  <td className="source-table__actions">
                    <button type="button" onClick={() => setOpenKey(r.key)}>Lihat</button>
                    {r.boleh_nyahaktif && (
                      <button type="button" disabled={busy} onClick={() => runAction(() => archiveClassificationRule(supabase, r.id))}>
                        Nyahaktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archivedKeywordRules.length > 0 && (
        <>
          <h3 className="bidang-panel__section-title">Peraturan kata kunci dinyahaktifkan</h3>
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr><th>Corak</th><th>Kategori</th><th>Tindakan</th></tr>
              </thead>
              <tbody>
                {archivedKeywordRules.map(r => (
                  <tr key={r.id}>
                    <td><code>{r.pattern}</code></td>
                    <td>{resolveBidangLabel(r.edition_id ?? editionId, { fieldCode: r.field_code, subjectCode: r.subject_code })}</td>
                    <td>
                      <button type="button" disabled={busy} onClick={() => runAction(() => restoreClassificationRule(supabase, r.id))}>
                        Aktifkan semula
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                <b>Dapatan audit (bukan metrik masa nyata):</b> dalam sampel 20 berita Metro
                Mutakhir, 2/7 pengesanan &ldquo;mahkamah&rdquo; sebenarnya bukan cerita
                jenayah (cerita dasar yang sekadar sebut keputusan mahkamah secara prosedur).
                Risiko salah padanan ini terbukti dalam sampel itu, bukan andaian.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// Polish 4A (2026-08-19) -- BidangPanel dipecah kepada 5 komponen laman
// berasingan (arahan ChatGPT, disahkan Izzat) supaya AdminShell.jsx boleh
// mount SATU sahaja setiap URL, bukan gulung kelima-lima dalam satu
// scroll seperti sebelum ini. Komponen dalaman (PemetaanSumber,
// PetunjukRssUrl, FeedCampuran) TIDAK ditulis semula -- hanya dibungkus
// dengan tajuk+intro masing-masing yang dahulunya tinggal di sini.
// "Susunan Edisi" -> "Penempatan Berita" (nama baharu, arahan Izzat --
// "Susunan" disalah anggap sebagai kedudukan/ranking, padahal fungsi ini
// menentukan berita diletakkan di kategori mana).
export function PemetaanSumberPage({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__section-desc">
        Sumber yang feednya sudah didedikasikan kepada satu kategori — tiada peraturan diperlukan.
      </p>
      <PemetaanSumber
        supabase={supabase}
        editionId={editionId}
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        userId={userId}
      />
    </div>
  );
}

export function PetunjukRssUrlPage({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__section-desc">
        Bila tag RSS, segmen URL atau prefix tajuk sudah cukup jelas — tiada kata kunci
        kandungan terlibat di sini.
      </p>
      <PetunjukRssUrl
        supabase={supabase}
        editionId={editionId}
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        userId={userId}
      />
    </div>
  );
}

export function FeedCampuranPage({ supabase, editionId, taxonomyFieldCodes, taxonomyFieldLabels, userId }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__section-desc">
        Bila petunjuk sumber/RSS/URL tidak mencukupi — kandungan diperiksa sebagai jalan
        terakhir (contoh Metro Mutakhir).
      </p>
      <FeedCampuran
        supabase={supabase}
        editionId={editionId}
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        userId={userId}
      />
    </div>
  );
}

export function SemuaPelarasanPage({ supabase }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__section-desc">
        Semua pelarasan Kategori dalam satu pandangan — termasuk jenis Kata kunci (Feed
        Campuran). Tapis &ldquo;Jenis&rdquo; di bawah untuk fokus kepada satu jenis.
      </p>
      <ClassificationRulesList supabase={supabase} />
    </div>
  );
}

export function PenempatanBeritaPage({ supabase, editionId, editionLabel, editionRules, editionRulesError, editionRulesBusy, onAddEditionRule, onArchiveEditionRule, onRestoreEditionRule, taxonomyFieldCodes, taxonomyFieldLabels }) {
  return (
    <div className="bidang-panel">
      <p className="bidang-panel__section-desc">
        Bila sesuatu kategori patut papar berbeza untuk edisi ini (contoh Politik luar negara &rarr; Dunia).
      </p>
      {editionId === 'ms-MY' ? (
        <>
          {editionRulesError && <p className="review-queue__error">{editionRulesError}</p>}
          {editionRules === null && !editionRulesError && (
            <p className="admin-app__status">Memuatkan…</p>
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
          <h3 className="editorial-desk__placeholder-title">Penempatan Berita</h3>
          <p className="editorial-desk__placeholder-desc">
            Belum tersedia untuk edisi ini. Fasa 4 bermula dengan edisi Malaysia (ms-MY) sahaja.
          </p>
        </article>
      )}
    </div>
  );
}
