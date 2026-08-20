import { useState } from 'react';

// EditionRulesManager.jsx — "Penempatan Berita" (Kategori → Penempatan Berita).
//
// Polish 8E (docs/polish-8e-placement-audit-v1.md). Rewritten from the
// "Paparan Edisi" form after the 8E-A audit found the page spoke the
// engine's language rather than the editor's: it rendered raw English
// classifier values ("Politics, bukan dari Malaysia → Dunia"), used the
// word "seksyen", stacked two headings, and split one product question
// ("from where?") across two technical dropdowns.
//
// The page now answers exactly one question, in the editor's words:
//   Berita kategori [Politik] / Jika lokasinya [Luar Malaysia] / Paparkan dalam [Dunia]
//
// WHAT IS STORED IS UNCHANGED. `condition_subject` and
// `condition_geography_value` still hold the English machine values the
// classifier matches on (classification/lib/edition-rules-resolver.mjs
// compares them as exact strings) — only the labels differ. The maps below
// are a small display layer, deliberately NOT a general translation system.

// Which categories may open a placement rule. Curated, not derived.
//
// NOT derived from SUBJECT_VOCABULARY: that list is missing 'Disaster'
// (the classifier can produce it via content-rules.mjs, but no phrase maps
// to it in desk-vocabulary.mjs), so deriving would silently drop Bencana.
//
// Three categories are deliberately EXCLUDED (director's decision):
//   - Nasional and Dunia are geography-residual categories, not subjects —
//     a story is not "about Nasional", it lands there by where it happened.
//   - Bisnes maps to TWO universal subjects (Business + Economy) in this
//     edition's taxonomy, so a single "Bisnes" choice cannot be stored as
//     one condition_subject without misrepresenting what the rule matches.
const PLACEMENT_SUBJECTS = [
  { value: 'Politics', label: 'Politik' },
  { value: 'Crime', label: 'Jenayah' },
  { value: 'Sports', label: 'Sukan' },
  { value: 'Environment', label: 'Alam Sekitar' },
  { value: 'Disaster', label: 'Bencana' },
  { value: 'Health', label: 'Kesihatan' },
  { value: 'Education', label: 'Pendidikan' },
  { value: 'Technology', label: 'Teknologi' },
  { value: 'Science', label: 'Sains' },
  { value: 'Culture', label: 'Budaya' },
  { value: 'Entertainment', label: 'Hiburan' },
  { value: 'Religion', label: 'Agama' },
  { value: 'Lifestyle', label: 'Gaya Hidup' },
];

// One product-level dropdown replacing the old type+value pair. The other
// universal geographies (Americas, Europe, Southeast Asia, World) are not
// offered in ms-MY V1 — the mental model here is only "ours vs not ours".
//
// `type: null, value: null` satisfies the schema's geography XOR constraint
// (both null or both set), so "Semua lokasi" is a real stored state rather
// than a UI-only convenience.
// Ordered narrowest-first (8E.1). "Semua lokasi" is a legitimate choice but
// it is also the BROADEST rule, and because every new rule is assigned the
// highest priority, a later "Politik / Semua lokasi" would silently outrank
// an earlier "Politik / Luar Malaysia" — the resolver has no specificity
// tie-break. Listing it last, behind an explicit "— Pilih lokasi —", means
// the broadest rule can no longer be created by simply not deciding.
const LOCATIONS = [
  { key: 'malaysia', label: 'Malaysia', type: 'is', value: 'Malaysia' },
  { key: 'luar', label: 'Luar Malaysia', type: 'not', value: 'Malaysia' },
  { key: 'all', label: 'Semua lokasi', type: null, value: null },
];
const ALL_LOCATIONS_LABEL = LOCATIONS.find(l => l.key === 'all').label;

// DISPLAY-ONLY labels for values this page no longer offers but that older
// rows (or a direct DB write) may still contain. Without these the table
// would print the raw English machine value straight into a Malay page —
// the exact defect 8E-A found. Kept separate from PLACEMENT_SUBJECTS /
// LOCATIONS so listing a legacy value here can never re-add it to a
// dropdown.
const LEGACY_SUBJECT_LABELS = { Business: 'Bisnes', Economy: 'Ekonomi' };
const LEGACY_GEOGRAPHY_LABELS = {
  Americas: 'Amerika', Europe: 'Eropah', 'Southeast Asia': 'Asia Tenggara',
  'Middle East': 'Asia Barat', World: 'Dunia', Malaysia: 'Malaysia',
};

export const subjectLabel = value =>
  PLACEMENT_SUBJECTS.find(s => s.value === value)?.label
  ?? LEGACY_SUBJECT_LABELS[value]
  // Last resort for a value no list knows. Shows the stored string rather
  // than "tidak dikenali": an unrecognised subject can only arrive by
  // writing the table directly, and the editor still needs to see what the
  // live rule actually matches on.
  ?? value;

export const locationLabel = (type, value) => {
  if (!type) return ALL_LOCATIONS_LABEL;
  const known = LOCATIONS.find(l => l.type === type && l.value === value);
  if (known) return known.label;
  const place = LEGACY_GEOGRAPHY_LABELS[value] ?? value;
  return type === 'not' ? `Bukan dari ${place}` : `Dari ${place}`;
};

// Exported and pure so the tests exercise the REAL logic the component runs.
// An adversarial review caught the previous test re-implementing both of
// these inline and asserting on its own copy — which stayed green when the
// component was reverted to the buggy formula.
//
// K2 (8E-A audit): was `activeRules.length + 1`, which reuses a live number
// as soon as any rule is archived. With priorities 1,2,3 and #2 archived the
// count is 2, so the next rule gets 3 — colliding with the existing #3. The
// resolver DISCARDS BOTH rules on a top-priority tie
// (edition-rules-resolver.mjs's pickWinner) and falls back to the built-in
// default, so an admin rule silently loses to the very default it was
// written to override. Counting from the max across ALL rules (archived
// included) means a restored rule can never collide either.
export function nextPriorityFor(rules) {
  const highest = (rules ?? []).reduce((max, r) => Math.max(max, r.priority ?? 0), 0);
  return highest + 1;
}

// Exported for the same reason as nextPriorityFor above: the interesting
// case is "subject and target chosen, location NOT chosen", which a static
// render cannot reach (it has no state) — so a rendered-HTML assertion
// passed happily when `locationKey` was dropped from this condition.
export function canSubmitRule({ subject, locationKey, fieldCode, busy }) {
  return Boolean(subject && locationKey && fieldCode && !busy);
}

// The geography XOR (`edition_rules_geography_xor`) requires type and value
// to be BOTH null or BOTH set. Keeping them on one LOCATIONS entry and
// building the payload here means no call site can ever split the pair.
//
// Returns null for a missing/unknown key (8E.1) rather than defaulting. It
// used to fall back to the first LOCATIONS entry, which meant a caller that
// forgot the field — or passed a stale key — silently created the BROADEST
// possible rule: the one hardest to notice and, under newest-wins priority,
// the one that outranks everything narrower. Failing loudly is the point.
export function buildRulePayload({ subject, locationKey, fieldCode, nextPriority }) {
  const location = LOCATIONS.find(l => l.key === locationKey);
  if (!location) return null;
  return {
    conditionSubject: subject,
    conditionGeographyType: location.type,
    conditionGeographyValue: location.value,
    actionFieldCode: fieldCode,
    priority: nextPriority,
  };
}

// The single built-in rule that ships in code (classification/lib/edition-
// rules.mjs), shown read-only so an editor can see why a story may route to
// Dunia with zero admin rules. Not fetched — it isn't stored in the DB.
const BUILT_IN_RULE_DESCRIPTION = 'Politik luar Malaysia → Dunia';

// Placement rules are read by db/classify-production.js and baked into
// edition_story_classifications; the reader only ever reads that stored
// table. So saving a rule changes nothing a reader sees until the next
// classification run. The 8E-A audit found the page never said so, leaving
// an editor to assume a saved rule was already live. Stating it is the
// whole fix — no "apply now" button, no scheduler (director's explicit
// instruction: confirm whether an out-of-repo scheduler exists first).
const EFFECT_NOTICE = 'Perubahan ini hanya berkuat kuasa pada pengelasan seterusnya, dan tidak mengubah paparan pembaca serta-merta.';

export default function EditionRulesManager({ taxonomyFieldCodes, taxonomyFieldLabels, rules, busy, onAdd, onArchive, onRestore }) {
  const activeRules = rules?.filter(r => r.status === 'active') ?? [];
  const archivedRules = rules?.filter(r => r.status === 'archived') ?? [];

  // A rule may point at a taxonomy field that has since been archived. The
  // FK only checks the row exists, not that it is still active, so such a
  // rule silently never fires while still listing as active here. Say so in
  // words rather than falling through to a raw field code.
  const fieldLabelFor = code => {
    const idx = taxonomyFieldCodes.indexOf(code);
    // Includes the stored code: without it two broken rules are
    // indistinguishable and neither can be diagnosed.
    return idx === -1 ? `Kategori sasaran tidak tersedia (${code})` : taxonomyFieldLabels[idx];
  };

  return (
    <article className="edition-rules">
      <p className="editorial-desk__placeholder-desc">
        Tentukan jika berita daripada sesuatu kategori perlu dipaparkan dalam kategori lain.
      </p>

      <p className="admin-app__status admin-app__status--notice">{EFFECT_NOTICE}</p>

      <div className="edition-rules__builtin">
        <span className="edition-rules__builtin-label">Tetapan asas</span>
        <p className="edition-rules__builtin-desc">{BUILT_IN_RULE_DESCRIPTION}</p>
      </div>

      {activeRules.length === 0 ? (
        <p className="review-queue__empty">
          Tiada penempatan tersendiri lagi. Sistem guna tetapan asas sahaja (di atas).
        </p>
      ) : (
        <RuleTable rules={activeRules} fieldLabelFor={fieldLabelFor} busy={busy} onArchive={onArchive} />
      )}

      {archivedRules.length > 0 && (
        <>
          <h4 className="filter-rules__list-title">Diarkibkan</h4>
          <RuleTable rules={archivedRules} fieldLabelFor={fieldLabelFor} busy={busy} onRestore={onRestore} archived />
        </>
      )}

      <AddEditionRuleForm
        taxonomyFieldCodes={taxonomyFieldCodes}
        taxonomyFieldLabels={taxonomyFieldLabels}
        busy={busy}
        onAdd={onAdd}
        nextPriority={nextPriorityFor(rules)}
      />
    </article>
  );
}

function RuleTable({ rules, fieldLabelFor, busy, onArchive, onRestore, archived }) {
  return (
    <div className="source-table-wrap">
      <table className="source-table">
        <thead>
          <tr>
            <th>Berita</th>
            <th>Lokasi</th>
            <th>Paparkan dalam</th>
            <th>Tindakan</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <EditionRuleRow
              key={rule.id}
              rule={rule}
              fieldLabelFor={fieldLabelFor}
              busy={busy}
              onArchive={onArchive}
              onRestore={onRestore}
              archived={archived}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditionRuleRow({ rule, fieldLabelFor, busy, onArchive, onRestore, archived }) {
  const [showArchiveReason, setShowArchiveReason] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  return (
    <tr className={archived ? 'source-table__row--inactive' : ''}>
      <td>{subjectLabel(rule.condition_subject)}</td>
      <td>{locationLabel(rule.condition_geography_type, rule.condition_geography_value)}</td>
      <td>{fieldLabelFor(rule.action_field_code)}</td>
      <td className="edition-rules__cell-actions">
        {!archived && !showArchiveReason && (
          <button type="button" disabled={busy} onClick={() => setShowArchiveReason(true)}>Arkibkan</button>
        )}
        {!archived && showArchiveReason && (
          <form
            className="edition-rules__archive-form"
            onSubmit={e => {
              e.preventDefault();
              if (!archiveReason.trim()) return;
              onArchive(rule.id, archiveReason.trim());
              setShowArchiveReason(false);
              setArchiveReason('');
            }}
          >
            <input
              type="text"
              placeholder="Sebab arkibkan (wajib)"
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !archiveReason.trim()}>Sahkan</button>
            <button type="button" disabled={busy} onClick={() => { setShowArchiveReason(false); setArchiveReason(''); }}>Batal</button>
          </form>
        )}
        {archived && (
          <>
            <button type="button" disabled={busy} onClick={() => onRestore(rule.id)}>Aktifkan semula</button>
            {rule.reason && <span className="edition-rules__reason">Sebab: {rule.reason}</span>}
          </>
        )}
      </td>
    </tr>
  );
}

// The priority number stays hidden from the editor (director's standing
// instruction) — conflict resolution is a backend concern. It is assigned
// silently from `nextPriority`; see the K2 note at the call site for why
// that value is now a max, not a count.
export function AddEditionRuleForm({ taxonomyFieldCodes, taxonomyFieldLabels, busy, onAdd, nextPriority }) {
  const [subject, setSubject] = useState('');
  // Starts empty (8E.1): location must be a deliberate choice, not something
  // an editor gets by default. See the LOCATIONS note.
  const [locationKey, setLocationKey] = useState('');
  const [fieldCode, setFieldCode] = useState('');

  const canSubmit = canSubmitRule({ subject, locationKey, fieldCode, busy });

  const submit = e => {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = buildRulePayload({ subject, locationKey, fieldCode, nextPriority });
    if (!payload) return; // unknown location key — never fall through to a global rule
    onAdd(payload);
    setSubject('');
    setLocationKey('');
    setFieldCode('');
  };

  return (
    <form className="edition-rules__add" onSubmit={submit}>
      <h4 className="filter-rules__list-title">Tambah Penempatan</h4>

      <label className="edition-rules__field">
        Berita kategori:
        <select value={subject} onChange={e => setSubject(e.target.value)} disabled={busy}>
          <option value="">— Pilih kategori —</option>
          {PLACEMENT_SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>

      <label className="edition-rules__field">
        Jika lokasinya:
        <select value={locationKey} onChange={e => setLocationKey(e.target.value)} disabled={busy}>
          <option value="">— Pilih lokasi —</option>
          {LOCATIONS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </label>

      <label className="edition-rules__field">
        Paparkan dalam:
        <select value={fieldCode} onChange={e => setFieldCode(e.target.value)} disabled={busy}>
          <option value="">— Pilih kategori —</option>
          {taxonomyFieldCodes.map((code, i) => (
            <option key={code} value={code}>{taxonomyFieldLabels[i]}</option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={!canSubmit}>+ Tambah</button>
    </form>
  );
}
