import { useEffect, useMemo, useRef, useState } from 'react';

// TopicWheel — dispatches SELECT_TOPIC only. Per Izzat's visual-direction
// correction (2026-08-11, second round): the Bidang Wheel stays VERTICAL
// and on the LEFT at every viewport width, including mobile — moving it to
// a horizontal top bar was explicitly rejected (it ate reading space and
// made Quick look like an ordinary mobile feed). A narrow vertical wheel
// also directly answers "how do you navigate 24 Bidang" without a
// horizontal menu that reads as a website nav bar.
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
// Per Izzat's SIXTH round correction (2026-08-11, after reviewing a
// separate design handoff for the same wheel concept — see
// docs/mobile-composition-study.md and the reference component's
// README): "setiap kali scroll, hanya SATU bidang bergerak" — one scroll
// gesture must move exactly one Bidang, never skip 2-3 at once. The
// PREVIOUS implementation used native browser scroll (scrollTop +
// CSS scroll-snap), which lets momentum/inertia carry a single fling
// through several snap points — the browser decides how far, not us.
// FIXED by removing native scrolling entirely: position is now a fully
// controlled `translateY` driven by React state (`currentIndex`), exactly
// matching the reference design's architecture (controlled `offset`,
// snap-to-nearest computed in JS, not left to native scroll physics).
//
// SEVENTH round correction (2026-08-12): the per-tick throttle above was
// still wrong — a real physical trackpad/mouse-wheel scroll fires MANY
// wheel events over ~300-500ms, and a 180ms throttle window is shorter
// than that, so several of those events still landed as separate
// "accepted" ticks, each moving one step — net result was still a
// multi-item jump for one gesture. Replaced throttle-per-event with
// GESTURE-level debounce: every wheel event during a continuous gesture
// only updates a live visual offset (so the wheel still tracks the
// motion smoothly); the index only actually changes ONCE, on a timer
// that keeps resetting until the gesture pauses (~180ms of silence) —
// at which point it commits exactly ±1 step from wherever the gesture
// started, regardless of how many wheel events fired in between.
// Pointer drag is unchanged and intentionally different: a deliberate
// LONG drag can still cross several items (matches the reference
// component's drag model), but a wheel/trackpad gesture never can.
export default function TopicWheel({ topics, selectedTopic, onSelect }) {
  const allValues = useMemo(() => [null, ...topics], [topics]); // null = "Semua"
  const currentIndex = Math.max(0, allValues.indexOf(selectedTopic));
  const trackRef = useRef(null);
  const itemStepRef = useRef(34); // px per item (line-height + gap); measured on mount
  const wheelGesture = useRef(null); // { startIndex, accumDeltaY } while a wheel gesture is in progress
  const wheelDebounceTimer = useRef(null);
  const [wheelVisualOffsetPx, setWheelVisualOffsetPx] = useState(0); // live tracking offset while a wheel gesture is uncommitted
  const drag = useRef(null); // { startY, startIndex } while a pointer drag is active
  const [dragOffsetPx, setDragOffsetPx] = useState(0); // live visual offset while dragging, reset on release
  const trackHeightRef = useRef(190); // matches .bidang-wheel__track's CSS height; re-measured on mount

  // Measure real per-item spacing (font size / gap can change with content)
  // and the track's own height, instead of hardcoding either, so the
  // centering transform math stays correct regardless of CSS tweaks.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    trackHeightRef.current = track.clientHeight;
    const items = track.querySelectorAll('.bidang-wheel__item');
    if (items.length >= 2) {
      itemStepRef.current = items[1].offsetTop - items[0].offsetTop;
    }
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
    const steps = Math.round(-dragOffsetPx / itemStepRef.current);
    selectIndex(drag.current.startIndex + steps);
    drag.current = null;
    setDragOffsetPx(0);
  };

  const handleKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    selectIndex(currentIndex + (e.key === 'ArrowDown' ? 1 : -1));
  };

  // Aligns item[currentIndex]'s own vertical center with the track's
  // vertical center — computed fully in px so it doesn't depend on
  // percentage-translateY's confusing "relative to own box" semantics.
  const centerOffset =
    trackHeightRef.current / 2 - (currentIndex * itemStepRef.current + itemStepRef.current / 2) + dragOffsetPx + wheelVisualOffsetPx;

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
          className="bidang-wheel__list"
          style={{ transform: `translateY(${centerOffset}px)`, transition: (drag.current || wheelGesture.current) ? 'none' : 'transform 150ms ease-out' }}
        >
          {allValues.map((value, i) => {
            const dist = Math.min(3, Math.abs(i - currentIndex) - (dragOffsetPx ? Math.abs(dragOffsetPx) / itemStepRef.current : 0));
            const t = Math.max(0, Math.min(1, dist / 3));
            return (
              <div
                key={value ?? '__all__'}
                data-value={value ?? ''}
                className={`bidang-wheel__item${i === currentIndex ? ' bidang-wheel__item--active' : ''}`}
                style={{ opacity: 1 - t * 0.75, transform: `scale(${1 - t * 0.28})` }}
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
