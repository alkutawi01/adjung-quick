import SourceLink from './SourceLink.jsx';

function formatPublishedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Card fields, per Izzat's 2026-08-11 decision: published date/time, title,
// source name as a link. No image (locked product constraint), no raw URL.
// Topic display REMOVED (KIV) — Izzat's decision: "topic" as produced by
// lab/classify.js is not Adjung's real Topik taxonomy (Bidang > Topik,
// e.g. Islam > Fiqh Munakahat) — RSS doesn't provide that, and the
// classifier hasn't been validated. `story.topic` still exists in data
// (used internally for Active Set diversity, unchanged) but is no longer
// shown to the reader as if it were a trustworthy fact.
export default function StoryCard({ story, sourceName, highlighted, onSelect, onOpen, onRelease, cardRef }) {
  return (
    <div
      ref={cardRef}
      className={`story-card${highlighted ? ' story-card--highlighted' : ''}`}
      tabIndex={0}
      role="button"
      data-story-id={story.storyId}
      aria-label={story.title}
      onClick={() => onSelect(story.storyId)}
      onDoubleClick={() => onOpen(story.storyId)}
      onKeyDown={e => {
        // Per keyboard-interaction-contract.md §C: Enter opens the Brief.
        // ↑/↓ are handled by the ActiveSetList container (roving focus +
        // SELECT_STORY) — this handler only owns Enter, so it doesn't
        // fight the container's arrow-key handling.
        if (e.key === 'Enter') onOpen(story.storyId);
      }}
    >
      <div className="story-card__meta">
        <span className="story-card__time">{formatPublishedAt(story.publishedAt)}</span>
      </div>
      <div className="story-card__title" dir="auto">{story.title}</div>
      <div className="story-card__footer">
        <SourceLink name={sourceName} href={story.link} />
        {/* Release kept reachable but visually minimal — per Izzat's
            correction, this must not read as a dominant CRUD action.
            Touch/final interaction affordance is still undecided
            (Touch Interaction Contract not yet written). */}
        <button
          className="story-card__release"
          onClick={e => { e.stopPropagation(); onRelease(story.storyId); }}
          aria-label="Release story"
        >
          ×
        </button>
      </div>
    </div>
  );
}
