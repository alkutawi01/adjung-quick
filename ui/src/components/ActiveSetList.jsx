import StoryCard from './StoryCard.jsx';

// Renders state.activeSet, filtered by the currently selected topic per
// contract §3 (topic filters discovery, but membership itself is fully
// engine-controlled — this component never decides which stories exist in
// the Active Set, only which of them are currently shown).
//
// Keyboard: per keyboard-interaction-contract.md §B — ↑/↓ move roving DOM
// focus among the visible cards AND dispatch SELECT_STORY (selection only,
// never opens Brief — that's Enter's job, handled per-card). Per the
// contract's wrap-around item (still OPEN), this stops at the ends rather
// than wrapping — the conservative default until Izzat decides otherwise.
export default function ActiveSetList({ activeSet, selectedTopic, sourceNames, highlightedStoryId, onSelect, onOpen, onRelease }) {
  const visible = selectedTopic
    ? activeSet.filter(s => s._cluster?.topic === selectedTopic)
    : activeSet;

  if (visible.length === 0) {
    return <div className="active-set-list active-set-list--empty">Tiada berita buat masa ini.</div>;
  }

  const handleKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const container = e.currentTarget;
    const cards = Array.from(container.querySelectorAll('.story-card'));
    const currentIndex = cards.findIndex(c => c === document.activeElement);
    if (currentIndex === -1) return;
    const nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= cards.length) return; // stop at ends, no wrap (OPEN item)
    e.preventDefault();
    cards[nextIndex].focus();
    onSelect(cards[nextIndex].dataset.storyId);
  };

  return (
    <div className="active-set-list" onKeyDown={handleKeyDown}>
      {visible.map(slot => {
        const cluster = slot._cluster;
        const rep = cluster?.representation ?? cluster?.canonical;
        return (
          <StoryCard
            key={slot.storyId}
            story={{
              storyId: slot.storyId,
              topic: cluster?.topic,
              title: rep?.title,
              link: rep?.link,
              publishedAt: rep?.publishedAt,
              sourceId: rep?.sourceId,
            }}
            sourceName={sourceNames.get(rep?.sourceId) ?? rep?.sourceId}
            highlighted={slot.storyId === highlightedStoryId}
            onSelect={onSelect}
            onOpen={onOpen}
            onRelease={onRelease}
          />
        );
      })}
    </div>
  );
}
