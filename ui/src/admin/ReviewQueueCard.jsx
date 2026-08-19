import { useState } from 'react';
import ClassificationProvenance from './ClassificationProvenance.jsx';

// ReviewQueueCard.jsx — Fasa 3.6.2. One card, one story, one decision, per
// docs/review-queue-ui-implementation-plan-v1.md §4. No "Terima" button in
// v1 — per the plan doc §3, the system has no pre-filled suggestion to
// accept (that needs the same undone evidence-persistence work as
// content_mismatch), so offering it would fake a suggestion that doesn't
// exist.
//
// Every action requires a reason (docs/review-queue-spec-v1.md — a hard
// requirement carried down from story_overrides.reason NOT NULL, not a UI
// nicety) — the Confirm button stays disabled until reason text is present.
export default function ReviewQueueCard({ entry, taxonomy, busy, onHide, onReclassify }) {
  const [composing, setComposing] = useState(null); // null | 'hide' | 'reclassify'
  const [reason, setReason] = useState('');
  const [newField, setNewField] = useState(taxonomy[0] ?? '');

  const cancel = () => { setComposing(null); setReason(''); };

  const confirm = () => {
    if (!reason.trim()) return;
    if (composing === 'hide') onHide(reason.trim());
    else onReclassify(newField, reason.trim());
  };

  return (
    <article className="review-card">
      <h3 className="review-card__title">{entry.title}</h3>
      <div className="review-card__meta">{entry.sourceName}</div>
      <p className="review-card__reason">
        <span className="review-card__reason-label">Sebab perlu semakan: </span>
        {entry.displayReason}
      </p>
      <ClassificationProvenance
        classificationMethod={entry.classificationMethod}
        resolvedRule={entry.resolvedRule}
      />

      {composing === null && (
        <div className="review-card__actions">
          <button type="button" onClick={() => setComposing('reclassify')} disabled={busy}>
            Ubah bidang
          </button>
          <button type="button" onClick={() => setComposing('hide')} disabled={busy}>
            Sembunyikan
          </button>
        </div>
      )}

      {composing !== null && (
        <div className="review-card__compose">
          {composing === 'reclassify' && (
            <>
              <label className="review-card__field">
                Bidang baru
                <select value={newField} onChange={e => setNewField(e.target.value)}>
                  {taxonomy.map(field => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </label>
              {/* Human-first confirm copy, per ChatGPT's explicit 3.6.3b
                  mandate — never "Override classification". */}
              <p className="review-card__confirm">Letakkan berita ini di bidang lain.</p>
            </>
          )}
          {composing === 'hide' && (
            // Human-first confirm copy, per ChatGPT's explicit 3.6.3a
            // requirement — never "Set hidden=true", always the real-world
            // consequence stated plainly before the admin commits.
            <p className="review-card__confirm">Berita ini tidak akan muncul kepada pembaca.</p>
          )}
          <label className="review-card__field">
            Sebab (wajib)
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                composing === 'hide' ? 'Kenapa berita ini disembunyikan?'
                : 'Kenapa bidang ini lebih sesuai?'
              }
              rows={2}
            />
          </label>
          <div className="review-card__actions">
            <button type="button" onClick={confirm} disabled={busy || !reason.trim()}>
              {busy ? 'Menyimpan...' : 'Sahkan'}
            </button>
            <button type="button" className="review-card__cancel" onClick={cancel} disabled={busy}>
              Batal
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
