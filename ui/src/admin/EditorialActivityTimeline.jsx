// EditorialActivityTimeline.jsx — FASA 4.1.1. Per
// docs/editorial-activity-timeline-plan-v1.md. Read-only, per-edition —
// same "Admin" layer as AdminDigest/ReviewQueueCard, answering "what
// happened editorially?" rather than "what needs my attention right
// now?" (that's the Review Queue) or "is the pipeline healthy?" (that's
// the System Health Snapshot, deliberately not mixed in here).

import { useCallback, useEffect, useState } from 'react';
import { adminSupabase } from './adminSupabase.js';
import { fetchEditorialActivity } from './editorialActivityAdapter.js';

const PAGE_SIZE = 30;

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('ms-MY', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function EditorialActivityTimeline({ editionId }) {
  const [events, setEvents] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [rowOffset, setRowOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    setEvents(null);
    setError(null);
    setRowOffset(0);
    fetchEditorialActivity(adminSupabase, editionId, { limit: PAGE_SIZE, offset: 0 })
      .then(r => { setEvents(r.events); setRowOffset(r.rowsFetched); setHasMore(r.hasMore); })
      .catch(err => setError(err.message));
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await fetchEditorialActivity(adminSupabase, editionId, { limit: PAGE_SIZE, offset: rowOffset });
      setEvents(prev => [...prev, ...r.events]);
      setRowOffset(prev => prev + r.rowsFetched);
      setHasMore(r.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="activity-timeline">
      <h2 className="activity-timeline__title">Aktiviti Editorial</h2>

      {error && <p className="activity-timeline__error">Tidak dapat dimuatkan: {error}</p>}
      {events === null && !error && <p className="admin-app__status">Memuatkan...</p>}
      {events !== null && events.length === 0 && (
        <p className="activity-timeline__empty">Tiada aktiviti editorial direkod lagi.</p>
      )}

      {events !== null && events.length > 0 && (
        <ul className="activity-timeline__list">
          {events.map(e => (
            <li key={e.id} className={`activity-timeline__item${e.type === 'expired' ? ' activity-timeline__item--expired' : ''}`}>
              <span className="activity-timeline__time">{formatTimestamp(e.timestamp)}</span>
              <span className="activity-timeline__text">
                {e.text}
                {/* Present-tense fact only, never a claimed time — per
                    ChatGPT's explicit "jangan reka timestamp" rule for
                    deactivation. */}
                {e.inactive && e.type === 'created' && <em className="activity-timeline__inactive"> · sudah tidak aktif</em>}
              </span>
              {e.roleLabel && <span className="activity-timeline__role">Oleh: {e.roleLabel}</span>}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button type="button" className="activity-timeline__more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Memuatkan...' : '30 lagi'}
        </button>
      )}
    </section>
  );
}
