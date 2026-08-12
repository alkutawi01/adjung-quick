import { useEffect, useRef } from 'react';
import SourceLink from './SourceLink.jsx';

// Brief — §5 of the contract. Resolves the open story's current
// representation from rankedQueue + the reader's selectedLanguages, same
// data the Active Set itself already uses (no separate "reading mode" state).
//
// Keyboard, per keyboard-interaction-contract.md §C and its clarification:
// - Focus moves into the Brief when it opens, so Esc/↑/↓ work immediately.
// - Esc calls onClose (App.jsx owns restoring focus to the triggering card).
// - ↑/↓ scroll WITHIN the Brief only — never change Story selection behind it.
export default function Brief({ story, sourceName, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (story) containerRef.current?.focus();
  }, [story]);

  if (!story) return null;

  const handleKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Contained scroll only — deliberately does NOT dispatch SELECT_STORY
      // or any action; this is a DOM scroll operation, not a product action.
      e.preventDefault();
      containerRef.current?.scrollBy({ top: e.key === 'ArrowDown' ? 80 : -80 });
    }
  };

  return (
    <div
      className="brief"
      role="region"
      aria-label="Brief"
      tabIndex={-1}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button className="brief__close" onClick={onClose} aria-label="Close brief">
        ← Kembali
      </button>
      {/* Topic display removed (KIV) — per Izzat's 2026-08-11 decision, see StoryCard.jsx */}
      <h1 className="brief__title" dir="auto">{story.title}</h1>
      <p className="brief__description" dir="auto">{story.description}</p>
      <div className="brief__footer">
        <SourceLink name={sourceName} href={story.link} />
      </div>
    </div>
  );
}
