import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// TopicWheel — dispatches SELECT_TOPIC only. Per Izzat's visual-direction
// correction (2026-08-11, second round): the Bidang Wheel stays VERTICAL
// and on the LEFT at every viewport width, including mobile — moving it to
// a horizontal top bar was explicitly rejected (it ate reading space and
// made Quick look like an ordinary mobile feed).
//
// Per Izzat's THIRD round correction: writing-mode: vertical-rl REMOVED —
// labels read normal horizontal text.
//
// Per Izzat's FOURTH round correction: no click-to-select, no up/down step
// buttons. Whichever Bidang lands in the CENTER of the wheel after
// scrolling/spinning is automatically selected.
//
// Per Izzat's FIFTH round correction: continuous scale/opacity falloff by
// distance from center — the classic iOS-picker-wheel visual cue.
//
// Per Izzat's SIXTH round correction: native browser scroll removed
// entirely; position is a fully controlled `translateY` driven by state.
//
// Per Izzat's SEVENTH round correction: per-tick throttle replaced with
// gesture-level debounce so one physical scroll gesture commits exactly
// one index step.
//
// EIGHTH round rebuild (2026-08-12) — "reka enjin wheel yg sebenar", two
// real bugs found and fixed together:
//
// (a) Track height/item spacing were measured once on mount and cached in
//     refs — stale forever after a real mobile browser's usable viewport
//     height changed later (address bar collapse, orientation, keyboard).
//     FIXED: ResizeObserver + window resize/orientationchange listeners,
//     measurements held in React state so every real layout change forces
//     a fresh, correct re-render — not a one-time snapshot.
//
// (b) Even with correct measurement, an item near the list's start/end
//     (e.g. "Semua", or the last Bidang) mathematically CANNOT be
//     centered in a tall track — there simply aren't enough real items
//     above/below it to fill the space. This is not a bug in the
//     centering math; it's a structural mismatch between a short list and
//     a tall track. FIXED per the reference design handoff's own spec
//     ("renders categories tripled for infinite-feel scroll"): the list
//     is rendered as 3 concatenated copies, and the selection is always
//     positioned in the MIDDLE copy — so every item, including the first
//     and last logical Bidang, always has real neighbour items (from the
//     adjacent copies) to fill space above and below it. Selection logic
//     itself still clamps at the true first/last Bidang (wrap-around
//     remains OPEN, undecided) — this only fixes the visual space-filling
//     problem, not the selection boundary behaviour.
export default function TopicWheel({ topics, selectedTopic, onSelect }) {
  const allValues = useMemo(() => [null, ...topics], [topics]); // null = "Semua"
  const currentIndex = Math.max(0, allValues.indexOf(selectedTopic));
  // Middle-copy index: where the selection actually renders in the tripled list.
  const middleIndex = allValues.length + currentIndex;
  const tripledValues = useMemo(() => [...allValues, ...allValues, ...allValues], [allValues]);

  const trackRef = useRef(null);
  const listRef = useRef(null);
  const [trackHeight, setTrackHeight] = useState(0);
  const [itemStep, setItemStep] = useState(34); // px per item (line-height + gap); refined continuously below

  const wheelGesture = useRef(null); // { startIndex, accumDeltaY } while a wheel gesture is in progress
  const wheelDebounceTimer = useRef(null);
  const [wheelVisualOffsetPx, setWheelVisualOffsetPx] = useState(0);
  const drag = useRef(null); // { startY, startIndex } while a pointer drag is active
  const [dragOffsetPx, setDragOffsetPx] = useState(0);

  // Continuous measurement: ResizeObserver fires whenever the track's real
  // rendered size changes for ANY reason (mobile browser chrome show/hide,
  // orientation change, keyboard opening, font/layout settling) — not just
  // once at mount. This is what actually fixes the real-phone drift.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      setTrackHeight(track.clientHeight);
      const items = listRef.current?.querySelectorAll('.bidang-wheel__item');
      if (items && items.length >= 2) {
        setItemStep(items[1].offsetTop - items[0].offsetTop);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('resize', measure);
    };
  }, [allValues]);

  const clampIndex = i => Math.max(0, Math.min(allValues.length - 1, i));

  const selectIndex = i => {
    const clamped = clampIndex(i);
    if (allValues[clamped] !== selectedTopic) onSelect(allValues[clamped]);
  };

  // Gesture-level debounce: a whole physical scroll gesture (however many
  // wheel events it fires) commits exactly ONE index step, per Izzat's
  // "1 scroll = 1 line" requirement. Live visual offset tracks the raw
  // motion while the gesture is in progress so it still feels responsive,
  // but only the debounce timer actually commits the index change.
  const handleWheel = e => {
    e.preventDefault();
    if (!wheelGesture.current) wheelGesture.current = { startIndex: currentIndex, accumDeltaY: 0 };
    wheelGesture.current.accumDeltaY += e.deltaY;
    setWheelVisualOffsetPx(-wheelGesture.current.accumDeltaY * 0.4); // damped — visual hint only, not 1:1 tracking
    if (wheelDebounceTimer.current) clearTimeout(wheelDebounceTimer.current);
    wheelDebounceTimer.current = setTimeout(() => {
      const gesture = wheelGesture.current;
      wheelGesture.current = null;
      setWheelVisualOffsetPx(0);
      if (!gesture || gesture.accumDeltaY === 0) return;
      selectIndex(gesture.startIndex + (gesture.accumDeltaY > 0 ? 1 : -1));
    }, 180); // gesture "pause" detection — resets on every event, only fires after motion stops
  };

  const handlePointerDown = e => {
    drag.current = { startY: e.clientY, startIndex: currentIndex };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = e => {
    if (!drag.current) return;
    setDragOffsetPx(e.clientY - drag.current.startY);
  };

  const endDrag = () => {
    if (!drag.current) return;
    const steps = Math.round(-dragOffsetPx / itemStep);
    selectIndex(drag.current.startIndex + steps);
    drag.current = null;
    setDragOffsetPx(0);
  };

  const handleKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    selectIndex(currentIndex + (e.key === 'ArrowDown' ? 1 : -1));
  };

  // Aligns the MIDDLE copy's selected item center with the track's
  // vertical center — computed fully in px, from continuously-fresh
  // measurements. Using middleIndex (not currentIndex) is what guarantees
  // real neighbour items exist above/below even at the true first/last
  // logical Bidang.
  const centerOffset =
    trackHeight / 2 - (middleIndex * itemStep + itemStep / 2) + dragOffsetPx + wheelVisualOffsetPx;

  return (
    <div className="bidang-wheel" aria-label="Bidang">
      <nav
        className="bidang-wheel__track"
        ref={trackRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div
          ref={listRef}
          className="bidang-wheel__list"
          style={{ transform: `translateY(${centerOffset}px)`, transition: 'none' }}
        >
          {tripledValues.map((value, domIndex) => {
            const dist = Math.min(3, Math.abs(domIndex - middleIndex) - (dragOffsetPx ? Math.abs(dragOffsetPx) / itemStep : 0));
            const t = Math.max(0, Math.min(1, dist / 3));
            return (
              <div
                key={domIndex}
                data-value={value ?? ''}
                className={`bidang-wheel__item${domIndex === middleIndex ? ' bidang-wheel__item--active' : ''}`}
                style={{ opacity: 1 - t * 0.75, transform: `scale(${1 - t * 0.28})` }}
                aria-hidden={domIndex !== middleIndex}
              >
                {value ?? 'Semua'}
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
