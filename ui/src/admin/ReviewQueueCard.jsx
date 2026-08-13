import { useState } from 'react';

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
export default function ReviewQueueCard({ entry, taxonomy, busy, boostAvailable, onHide, onReclassify, onBoost }) {
  const [composing, setComposing] = useState(null); // null | 'hide' | 'reclassify' | 'boost'
  const [reason, setReason] = useState('');
  const [newField, setNewField] = useState(taxonomy[0] ?? '');

  const cancel = () => { setComposing(null); setReason(''); };

  const confirm = () => {
    if (!reason.trim()) return;
    if (composing === 'hide') onHide(reason.trim());
    else if (composing === 'boost') onBoost(reason.trim());
    else onReclassify(newField, reason.trim());
  };

  return (
    <article className="review-card">
      <h3 className="review-card__title">{entry.title}</h3>
      <div className="review-card__meta">{entry.sourceName}</div>
      <p className="review-card__reason">
        <span className="review-card__reason-label">Kenapa muncul: </span>
        {entry.displayReason}
      </p>

      {composing === null && (
        <div className="review-card__actions">
          <button type="button" onClick={() => setComposing('reclassify')} disabled={busy}>
            Ubah bidang
          </button>
          <button type="button" onClick={() => setComposing('hide')} disabled={busy}>
            Sembunyikan
          </button>
          {boostAvailable && (
            <button type="button" onClick={() => setComposing('boost')} disabled={busy}>
              Naikkan
            </button>
          )}
        </div>
      )}

      {/* Per ChatGPT's explicit amendment to Option A: an absent button is
          not enough — an admin must be told WHY, or they'll assume the
          system is broken. Only shown for a story that actually has a
          Bidang; a story with none has no ranking contest to enter at all,
          so raising it would be meaningless rather than unavailable. */}
      {composing === null && !boostAvailable && entry.field && (
        <p className="review-card__unavailable">
          Naikkan belum tersedia untuk bidang ini. Bidang ini masih menggunakan
          pemilihan berita automatik biasa.
        </p>
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
          {composing === 'boost' && (
            // States the real contract honestly (docs/boost-action-plan-v1.md
            // §1): boost raises the CHANCE of selection, it never guarantees
            // placement. Promising otherwise would make it a pin in disguise.
            <p className="review-card__confirm">
              Berita ini akan mendapat peluang lebih tinggi untuk dipaparkan.
              Ia masih bersaing dengan berita lain, bukan dijamin tempat.
            </p>
          )}
          <label className="review-card__field">
            Sebab (wajib)
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                composing === 'hide' ? 'Kenapa berita ini disembunyikan?'
                : composing === 'boost' ? 'Kenapa berita ini patut dinaikkan?'
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
