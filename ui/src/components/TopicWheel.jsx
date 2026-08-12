import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  // BUG FOUND 2026-08-12 (real device testing, "gagal lg."): React attaches
  // onWheel as a PASSIVE listener by default (perf optimisation), so
  // e.preventDefault() inside a JSX-bound handler is silently a no-op —
  // confirmed via console: "Unable to preventDefault inside passive event
  // listener invocation." The browser's native page/element scroll was
  // firing at the same time as this custom transform logic the entire time,
  // which is what actually caused the drift/skip Izzat saw — not the
  // debounce or centering math. FIXED: attach the wheel listener
  // imperatively via addEventListener with { passive: false } so
  // preventDefault genuinely takes effect. currentIndex/selectIndex are
  // read through refs so this effect doesn't need to re-attach every render.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const selectIndexRef = useRef(selectIndex);
  selectIndexRef.current = selectIndex;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheelNative = e => {
      e.preventDefault();
      if (!wheelGesture.current) wheelGesture.current = { startIndex: currentIndexRef.current, accumDeltaY: 0 };
      wheelGesture.current.accumDeltaY += e.deltaY;
      setWheelVisualOffsetPx(-wheelGesture.current.accumDeltaY * 0.4); // damped — visual hint only, not 1:1 tracking
      if (wheelDebounceTimer.current) clearTimeout(wheelDebounceTimer.current);
      wheelDebounceTimer.current = setTimeout(() => {
        const gesture = wheelGesture.current;
        wheelGesture.current = null;
        setWheelVisualOffsetPx(0);
        if (!gesture || gesture.accumDeltaY === 0) return;
        selectIndexRef.current(gesture.startIndex + (gesture.accumDeltaY > 0 ? 1 : -1));
      }, 180); // gesture "pause" detection — resets on every event, only fires after motion stops
    };
    track.addEventListener('wheel', onWheelNative, { passive: false });
    return () => track.removeEventListener('wheel', onWheelNative);
  }, []);

  // BUG FOUND 2026-08-12 (real device, Izzat's report "tetap pilih Semua
  // walaupun discroll"): the track shrank to a fixed 238px window in the
  // previous fix. A normal thumb drag easily carries the finger outside
  // that small element almost immediately — and setPointerCapture (which
  // was supposed to keep delivering pointermove/pointerup to the track
  // regardless) can silently fail on real touch too (the same NotFoundError
  // seen in testing). Once that happens, pointerup never reaches the
  // track's own handler, so endDrag() never runs — the list still LOOKS
  // like it's spinning in real time (dragOffsetPx tracks live), but the
  // gesture never commits, so on release it just snaps back to whatever
  // was last actually selected (Semua, at cold start). FIXED: track the
  // drag with window-level pointermove/pointerup listeners instead of
  // relying on the small element retaining the pointer — this is correct
  // regardless of whether capture succeeds, and regardless of how far the
  // finger drifts outside the track's bounds.
  const handlePointerDown = e => {
    const startY = e.clientY;
    const startIndex = currentIndexRef.current;
    drag.current = { startY, startIndex };
    let localOffset = 0;

    const onMove = ev => {
      localOffset = ev.clientY - startY;
      setDragOffsetPx(localOffset);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const steps = Math.round(-localOffset / itemStep);
      selectIndexRef.current(startIndex + steps);
      drag.current = null;
      setDragOffsetPx(0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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
  const rawOffsetPx = dragOffsetPx + wheelVisualOffsetPx;
  const centerOffset = trackHeight / 2 - (middleIndex * itemStep + itemStep / 2) + rawOffsetPx;

  // BUG FOUND 2026-08-12 (real device, Izzat's report: highlight change
  // isn't smooth/immediate — there are moments with NO active Bidang at
  // all, which must never happen). Root cause: the active-item class and
  // opacity/scale falloff were keyed on `middleIndex`, which only reflects
  // the last COMMITTED selection — it doesn't move at all while a gesture
  // is in progress. But the list itself visually slides via rawOffsetPx
  // during that same gesture, so the item that's actually sitting at the
  // track's visual center keeps changing while the "active" class stays
  // stuck on the old (now-scrolled-away) item — a moment with zero visibly
  // active items, exactly matching the "no bidang aktif" report. FIXED:
  // derive a LIVE index from the current raw offset, continuously, so
  // whichever item is nearest the visual center is always the one styled
  // active — never lagging behind the drag, and never zero.
  const liveIndex = clampIndex(currentIndex + Math.round(-rawOffsetPx / itemStep));
  const liveMiddleIndex = allValues.length + liveIndex;

  return (
    <div className="bidang-wheel" aria-label="Bidang">
      <nav
        className="bidang-wheel__track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div
          ref={listRef}
          className="bidang-wheel__list"
          style={{ transform: `translateY(${centerOffset}px)`, transition: 'none' }}
        >
          {tripledValues.map((value, domIndex) => {
            const dist = Math.min(3, Math.abs(domIndex - liveMiddleIndex));
            const t = Math.max(0, Math.min(1, dist / 3));
            return (
              <div
                key={domIndex}
                data-value={value ?? ''}
                className={`bidang-wheel__item${domIndex === liveMiddleIndex ? ' bidang-wheel__item--active' : ''}`}
                style={{ opacity: 1 - t * 0.75, transform: `scale(${1 - t * 0.28})` }}
                aria-hidden={domIndex !== liveMiddleIndex}
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
