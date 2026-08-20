// AllStoriesPanel.jsx — Admin Console V2, "Berita → Semua Berita" menu.
//
// Round 7/15 (2026-08-19). Per ChatGPT: the daily workbench. One dense
// table over the real corpus (allStoriesAdapter.js::fetchAllStories),
// scannable like a spreadsheet, not a queue of cards. "Perlu Semakan" is a
// status FILTER over this same dataset, not a separate query/dataset.
//
// Round 8/15: Perlu Semakan's card-based experience (ReviewQueueCard.jsx)
// is retired from the main path -- this table + drawer is now the ONLY
// "Berita" surface. `presetStatusFilter` lets AdminApp.jsx's "Perlu
// Semakan" tab open this exact same panel pre-filtered, instead of a
// separate component. The drawer now also carries the two things worth
// keeping from the old card (Sebab perlu semakan, ClassificationProvenance)
// -- allStoriesAdapter.js computes them with the SAME predicate
// fetchReviewQueue() uses (reviewQueueAdapter.js::isReviewNeeded), not a
// re-guessed one.
//
// Editorial actions reuse the exact same write functions Semakan already
// uses (reviewQueueAdapter.js's submit*/deactivateOverride) -- no new
// write logic. The composer UI here is a simplified version of
// ReviewQueueCard.jsx's pattern (same reason-required, same confirm-copy
// principle) rather than that component verbatim.
import { useState, useEffect, useMemo } from 'react';
import { fetchAllStories } from './allStoriesAdapter.js';
import {
  submitHideOverride, submitReclassifyOverride, submitPinOverride, deactivateOverride, unpinOverride,
} from './reviewQueueAdapter.js';
import { isAdmin } from '../../../db/editor-auth.mjs';
import ClassificationProvenance from './ClassificationProvenance.jsx';

const STATUS_OPTIONS = ['Aktif', 'Perlu semakan', 'Disembunyikan'];

export default function AllStoriesPanel({ supabase, editionId, role, userId, taxonomy, presetStatusFilter = 'all' }) {
  const [stories, setStories] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fieldFilter, setFieldFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(presetStatusFilter);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Re-apply the preset whenever the caller changes it -- this is how
  // AdminApp.jsx's "Perlu Semakan" tab and "Semua Berita" tab both mount
  // this same component with a different starting filter (switching tabs
  // remounts nothing, so without this the filter would stick from
  // whichever tab was opened first).
  useEffect(() => { setStatusFilter(presetStatusFilter); }, [presetStatusFilter]);

  const load = () => {
    setStories(null);
    setError(null);
    fetchAllStories(supabase, editionId)
      .then(setStories)
      .catch(err => setError(err.message));
  };

  useEffect(load, [supabase, editionId]);

  const sourceOptions = useMemo(() => {
    if (!stories) return [];
    return [...new Set(stories.map(s => s.sourceName))].sort();
  }, [stories]);

  const fieldOptions = useMemo(() => {
    if (!stories) return [];
    return [...new Set(stories.map(s => s.fieldLabel).filter(Boolean))].sort();
  }, [stories]);

  const rows = useMemo(() => {
    if (!stories) return [];
    const q = query.trim().toLowerCase();
    return stories.filter(s => {
      if (q && !s.title.toLowerCase().includes(q)) return false;
      if (sourceFilter !== 'all' && s.sourceName !== sourceFilter) return false;
      if (fieldFilter !== 'all' && s.fieldLabel !== fieldFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [stories, query, sourceFilter, fieldFilter, statusFilter]);

  const counts = useMemo(() => {
    if (!stories) return null;
    return { total: stories.length, needsReview: stories.filter(s => s.status === 'Perlu semakan').length };
  }, [stories]);

  const openStory = stories?.find(s => s.storyId === openId) ?? null;

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

  return (
    <div className="all-stories">
      <p className="all-stories__note">
        Semua berita dalam edisi ini (produksi sebenar) — termasuk yang disembunyikan atau ditapis kata
        kunci, supaya boleh diuruskan terus dari sini. Tindakan editorial guna path yang sama seperti
        Perlu Semakan.
      </p>

      {error && <p className="review-queue__error">Ralat memuatkan berita: {error}</p>}
      {actionError && <p className="review-queue__error">Ralat: {actionError}</p>}
      {stories === null && !error && <p className="admin-app__status">Memuatkan…</p>}

      {stories !== null && (
        <>
          <p className="source-registry__summary">
            <b>{counts.total}</b> berita &middot; <b>{counts.needsReview}</b> perlu semakan
          </p>

          <div className="classification-rules__filters">
            <input
              type="text"
              placeholder="Cari tajuk…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
              <option value="all">Semua sumber</option>
              {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fieldFilter} onChange={e => setFieldFilter(e.target.value)}>
              <option value="all">Semua kategori</option>
              {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Semua status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {statusFilter !== 'Perlu semakan' && (
              <button type="button" onClick={() => setStatusFilter('Perlu semakan')}>Perlu Semakan sahaja</button>
            )}
          </div>

          {rows.length === 0 && <p className="review-queue__empty">Tiada berita sepadan carian.</p>}

          {rows.length > 0 && (
            <div className="source-table-wrap">
              <table className="source-table">
                <thead>
                  <tr>
                    <th>Berita</th>
                    <th>Sumber</th>
                    <th>Masa</th>
                    <th>Kategori</th>
                    <th>Status</th>
                    <th>Nilai</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.storyId} className={s.status !== 'Aktif' ? 'source-table__row--inactive' : ''}>
                      <td className="source-table__name">
                        {s.title}
                        {s.filteredByPhrase && <span className="review-card__promo-tag" title={`Ditapis oleh: ${s.filteredByPhrase}`}> Ditapis</span>}
                        {s.boosted && <span className="review-card__promo-tag"> Dinaikkan</span>}
                        {s.pinned && <span className="review-card__promo-tag"> Pin</span>}
                      </td>
                      <td>{s.sourceName}</td>
                      <td>{formatMasa(s.publishedAt)}</td>
                      <td>{s.fieldLabel ?? '—'}</td>
                      <td><span className={`source-registry__status source-registry__status--${statusClass(s.status)}`}>{s.status}</span></td>
                      <td className="source-table__num">{Number.isFinite(s.editorialScore) ? Math.round(s.editorialScore) : '—'}</td>
                      <td className="source-table__actions">
                        <button type="button" onClick={() => setOpenId(s.storyId)}>Lihat</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openStory && (
        <StoryDrawer
          story={openStory}
          taxonomy={taxonomy}
          busy={busy}
          onClose={() => setOpenId(null)}
          onHide={reason => runAction(() => submitHideOverride(supabase, { storyId: openStory.storyId, editionId, reason, createdBy: userId, role }))}
          onReclassify={(newField, reason) => runAction(() => submitReclassifyOverride(supabase, { storyId: openStory.storyId, editionId, newField, reason, createdBy: userId, role }))}
          onPin={(newField, reason) => runAction(() => submitPinOverride(supabase, { storyId: openStory.storyId, editionId, newField, reason, createdBy: userId, role }))}
          onUnhide={overrideId => runAction(() => deactivateOverride(supabase, overrideId))}
          onUnpin={overrideId => runAction(() => unpinOverride(supabase, { overrideId, role }))}
          canUnpin={isAdmin(role)}
        />
      )}
    </div>
  );
}

function statusClass(status) {
  if (status === 'Aktif') return 'active';
  if (status === 'Disembunyikan') return 'disabled';
  return 'archived';
}

function formatMasa(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Exported for ui/src/admin/unpinWiring.test.mjs, which renders it directly
// with fixtures. The 8D-A.1 regression (an editor could create a pin and
// never remove it) survived a static/regex-only test, so this one actually
// renders the drawer — which needs a handle on the component.
export function StoryDrawer({ story, taxonomy, busy, onClose, onHide, onReclassify, onPin, onUnhide, onUnpin, canUnpin }) {
  // Rendered in BOTH branches below (hidden and not), because hide outranks
  // pin in the resolver: a pinned story that is later hidden reports
  // pinned=false, yet its pin row stays active and keeps consuming one of
  // the 2 per-category slots. If the undo lived only in the not-hidden
  // branch, that pin would be invisible AND unremovable until the 24h
  // expiry — the very failure this change exists to remove.
  const pinUndo = story.pinOverrideId && canUnpin ? (
    <button type="button" className="review-card__promo-undo" onClick={() => onUnpin(story.pinOverrideId)} disabled={busy}>Nyahaktifkan</button>
  ) : null;
  const [composing, setComposing] = useState(null); // null | 'hide' | 'reclassify' | 'pin'
  const [reason, setReason] = useState('');
  const [newField, setNewField] = useState(taxonomy[0] ?? '');

  const cancel = () => { setComposing(null); setReason(''); };
  const confirm = () => {
    if (!reason.trim()) return;
    if (composing === 'hide') onHide(reason.trim());
    else if (composing === 'pin') onPin(newField, reason.trim());
    else onReclassify(newField, reason.trim());
    cancel();
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <button type="button" className="drawer__close" onClick={onClose}>Tutup</button>
        <h3 className="drawer__title">{story.title}</h3>
        {story.description && <p className="review-card__meta">{story.description}</p>}
        <dl className="drawer__fields">
          <dt>Sumber</dt><dd>{story.sourceName}</dd>
          <dt>Masa</dt><dd>{formatMasa(story.publishedAt)}</dd>
          <dt>Kategori</dt><dd>{story.fieldLabel ?? '—'}</dd>
          <dt>Status</dt><dd>{story.status}</dd>
          {story.link && <><dt>URL sumber</dt><dd><code>{story.link}</code></dd></>}
          {story.filteredByPhrase && <><dt>Ditapis</dt><dd>Sepadan kata kunci "{story.filteredByPhrase}" (tidak dipaparkan kepada pembaca).</dd></>}
        </dl>

        {story.status === 'Perlu semakan' && (
          <p className="review-card__reason">
            <span className="review-card__reason-label">Sebab perlu semakan: </span>
            {story.displayReason}
          </p>
        )}
        <ClassificationProvenance
          classificationMethod={story.classificationMethod}
          resolvedRule={story.resolvedRule}
        />

        {story.status === 'Disembunyikan' ? (
          <>
            <p className="review-card__promo-status">
              Berita ini disembunyikan daripada pembaca.
              {story.hideOverrideId && (
                <button type="button" className="review-card__promo-undo" onClick={() => onUnhide(story.hideOverrideId)} disabled={busy}>Nyahsembunyi</button>
              )}
            </p>
            {story.pinOverrideId && (
              <p className="review-card__promo-status">
                Berita ini masih dikekalkan dalam pemilihan walaupun disembunyikan, dan masih mengambil satu tempat daripada had dua bagi kategori ini.
                {pinUndo}
              </p>
            )}
          </>
        ) : composing === null && (
          <>
            {/* 8D-A.1 regression fix: an unpin path existed in
                ReviewQueueCard.jsx and ValueRankingPanel.jsx, but BOTH were
                orphaned by later consolidations (Round 8/15 and Polish 8C),
                and neither replacement carried it over. An editor could
                create a pin and then had no way to remove it -- it only
                cleared via the 24h server-side expiry. Unlike hide (which
                replaces the action list entirely, since a hidden story has
                nothing else to act on), pin sits ALONGSIDE the other
                actions: a pinned story is still active and can still be
                reclassified or hidden. */}
            {story.pinOverrideId && (
              <p className="review-card__promo-status">
                Berita ini dikekalkan dalam pemilihan, dan tamat secara automatik selepas 24 jam.
                {pinUndo}
              </p>
            )}
            <div className="review-card__actions">
              <button type="button" onClick={() => setComposing('reclassify')} disabled={busy}>Ubah kategori</button>
              <button type="button" onClick={() => setComposing('hide')} disabled={busy}>Sembunyikan</button>
              {!story.pinned && <button type="button" onClick={() => setComposing('pin')} disabled={busy}>Kekalkan dalam pemilihan</button>}
            </div>
          </>
        )}

        {composing !== null && (
          <div className="review-card__compose">
            {(composing === 'reclassify' || composing === 'pin') && (
              <label className="review-card__field">
                Kategori{composing === 'pin' ? '' : ' baru'}
                <select value={newField} onChange={e => setNewField(e.target.value)}>
                  {taxonomy.map(field => <option key={field} value={field}>{field}</option>)}
                </select>
              </label>
            )}
            {composing === 'hide' && <p className="review-card__confirm">Berita ini tidak akan muncul kepada pembaca.</p>}
            {composing === 'pin' && <p className="review-card__confirm">Tidak mengubah nilai berita; mempengaruhi pemilihan akhir dalam kategori ini. Had maksimum 2 berita dikekalkan serentak setiap kategori.</p>}
            {composing === 'reclassify' && <p className="review-card__confirm">Letakkan berita ini di kategori lain.</p>}
            <label className="review-card__field">
              Sebab (wajib)
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
            </label>
            <div className="review-card__actions">
              <button type="button" onClick={confirm} disabled={busy || !reason.trim()}>{busy ? 'Menyimpan…' : 'Sahkan'}</button>
              <button type="button" className="review-card__cancel" onClick={cancel} disabled={busy}>Batal</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
