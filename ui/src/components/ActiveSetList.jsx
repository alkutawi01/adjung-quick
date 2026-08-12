import StoryCard from './StoryCard.jsx';

// Renders state.activeSet, filtered by the currently selected topic — the
// Bidang wheel's whole purpose is to change which stories are visible.
//
// HISTORY: an earlier version of this filter was removed as a "bug" after
// two real problems Izzat caught live: (1) a single matching card would
// stretch to fill the whole screen, because cards used flex:1 which
// divides available height by however many happen to be VISIBLE — filter
// down to one match and it balloons; (2) swiping a card away appeared to
// disturb unrelated cards, since the filtered view could reshuffle
// entirely on release. Re-added (2026-08-12) per Izzat's explicit
// correction — "kalau tak tukar berita, apa fungsi wheel?" (if it doesn't
// change the news, what's the wheel even for?) — with the actual CSS bug
// fixed this time: each of the activeSetCapacity slots always gets an
// EQUAL, FIXED share of height via CSS grid (ActiveSetList--grid rows),
// whether or not that slot's card is currently visible. Filtering to
// fewer matches now just leaves empty grid rows — nothing stretches, and
// unrelated slots never reflow, because the underlying state.activeSet
// (all 10 engine-controlled slots) is completely untouched by this view
// filter — Stable Spatial Slots still governs the real data underneath.
export default function ActiveSetList({ activeSet, sourceNames, highlightedStoryId, selectedTopic, activeSetCapacity, onSelect, onOpen, onRelease }) {
  // selectedTopic == null only during cold start, before the Bidang list has
  // loaded (there is no "Semua"/All pseudo-Bidang — removed 2026-08-12 per
  // Izzat). Once a real Bidang is selected, the view always filters to it.
  const visible = selectedTopic == null
    ? activeSet
    : activeSet.filter(slot => slot._cluster?.topic === selectedTopic);

  if (visible.length === 0) {
    return (
      <div
        className="active-set-list active-set-list--empty"
        style={{ '--capacity': activeSetCapacity }}
      >
        Tiada berita untuk Bidang ini buat masa ini.
      </div>
    );
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
    <div
      className="active-set-list"
      onKeyDown={handleKeyDown}
      style={{ '--capacity': activeSetCapacity }}
    >
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
