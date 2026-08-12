import { useEffect, useRef, useState } from 'react';
import SourceLink from './SourceLink.jsx';

function formatPublishedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const SWIPE_THRESHOLD_PX = 100;
const EXIT_ANIMATION_MS = 200;

// Card fields, per Izzat's 2026-08-11 decision: published date/time, title,
// source name as a link. No image (locked product constraint), no raw URL.
// Topic display REMOVED (KIV) — Izzat's decision: "topic" as produced by
// lab/classify.js is not Adjung's real Topik taxonomy (Bidang > Topik,
// e.g. Islam > Fiqh Munakahat) — RSS doesn't provide that, and the
// classifier hasn't been validated. `story.topic` still exists in data
// (used internally for Active Set diversity, unchanged) but is no longer
// shown to the reader as if it were a trustworthy fact.
//
// RELEASE (2026-08-12, per Izzat's direct correction — he never asked for
// a delete/dismiss button): the × button is REMOVED. Release is now a
// horizontal SWIPE gesture — the card follows the finger/pointer, and
// past SWIPE_THRESHOLD_PX it animates out and dispatches onRelease. The
// replacement that mounts into this same slot animates in from the left
// (see the mount effect below) — per Izzat: "berita lain akan
// gantikan tempat berita tu, masuk dari arah kiri." Unrelated cards
// above/below are untouched because ActiveSetList no longer filters or
// reorders the list (see its own fix note) — releasing one slot only
// ever affects that slot's own mount/unmount, never its siblings'.
export default function StoryCard({ story, sourceName, highlighted, onSelect, onOpen, onRelease, cardRef }) {
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [entered, setEntered] = useState(false); // false → true right after mount, drives the slide-in-from-left transition
  const drag = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Per the same real-device bug found in TopicWheel (window-level
  // pointer tracking instead of relying on setPointerCapture, which can
  // silently fail on real touch): track the swipe via window listeners so
  // a fast/long swipe that carries the finger outside this card's own
  // bounds still commits correctly on release.
  const handlePointerDown = e => {
    const startX = e.clientX;
    drag.current = { startX, moved: false };
    let localDx = 0;

    const onMove = ev => {
      localDx = ev.clientX - startX;
      if (Math.abs(localDx) > 4) drag.current.moved = true; // distinguish drag from click
      setDragX(localDx);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const wasDrag = drag.current?.moved;
      drag.current = null;
      if (Math.abs(localDx) > SWIPE_THRESHOLD_PX) {
        setExiting(true);
        setTimeout(() => onRelease(story.storyId), EXIT_ANIMATION_MS);
        return;
      }
      setDragX(0);
      // A short drag that didn't cross the threshold and barely moved still
      // counts as a tap/click — but real drags (moved=true, under threshold)
      // should NOT also trigger selection on release.
      if (!wasDrag) onSelect(story.storyId);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const transform = exiting
    ? `translateX(${dragX > 0 ? 700 : -700}px) rotate(${dragX > 0 ? 12 : -12}deg)`
    : entered
      ? `translateX(${dragX}px) rotate(${dragX * 0.02}deg)`
      : 'translateX(-40px)'; // pre-entrance position, per the mount effect above

  return (
    <div
      ref={cardRef}
      className={`story-card${highlighted ? ' story-card--highlighted' : ''}`}
      tabIndex={0}
      role="button"
      data-story-id={story.storyId}
      aria-label={story.title}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onOpen(story.storyId)}
      onKeyDown={e => {
        // Per keyboard-interaction-contract.md §C: Enter opens the Brief.
        // ↑/↓ are handled by the ActiveSetList container (roving focus +
        // SELECT_STORY) — this handler only owns Enter, so it doesn't
        // fight the container's arrow-key handling.
        if (e.key === 'Enter') onOpen(story.storyId);
      }}
      style={{
        transform,
        opacity: exiting ? 0 : entered ? Math.max(0.4, 1 - Math.abs(dragX) / 500) : 0,
        transition: drag.current ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
        touchAction: 'pan-y',
      }}
    >
      <div className="story-card__meta">
        <span className="story-card__time">{formatPublishedAt(story.publishedAt)}</span>
      </div>
      <div className="story-card__title" dir="auto">{story.title}</div>
      <div className="story-card__footer">
        <SourceLink name={sourceName} href={story.link} />
      </div>
    </div>
  );
}
