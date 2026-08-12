import { useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState } from '../../state/model.js';
import { reduce } from '../../state/reducer.js';
import { selectTopic, selectStory, openBrief, closeBrief, releaseStory } from '../../state/actions.js';
import { selectRepresentation } from '../../state/representation.js';
import { selectActiveSet } from '../../lab/engine.js';
import { createEditorialControl } from '../../lab/control.js';
import { fetchRankedQueue, fetchSourceNames } from './adapter/productionAdapter.js';
import TopicWheel from './components/TopicWheel.jsx';
import ActiveSetList from './components/ActiveSetList.jsx';
import Brief from './components/Brief.jsx';

// Phase 2A/Candidate-B Core Reading Shell. Per Izzat's visual-direction
// correction (2026-08-11): ONE composition, not a desktop-specific
// 3-permanent-column layout — the Bidang Wheel + bounded Active Set render
// identically at every viewport width; Brief is always a full-screen
// transition, never a permanently-visible empty third pane. `control` is a
// real (but never-editor-facing) Editorial Control instance — needed so
// RELEASE_STORY's slot-replacement behaviour works, per state/reducer.js.
export default function App() {
  const [state, setState] = useState(createInitialState());
  const [rankedQueue, setRankedQueue] = useState([]);
  const [sourceNames, setSourceNames] = useState(new Map());
  const [loadError, setLoadError] = useState(null);
  const controlRef = useRef(createEditorialControl());
  const pendingFocusStoryId = useRef(null); // set right before CLOSE_BRIEF, consumed by the effect below

  // Per keyboard-interaction-contract.md §C: Esc must restore focus to the
  // story card that opened the Brief, not <body>. A useEffect keyed on
  // brief.open guarantees this runs after React's own commit/unmount for
  // this transition, rather than racing it with a bare rAF.
  useEffect(() => {
    if (state.brief.open || !pendingFocusStoryId.current) return;
    const storyId = pendingFocusStoryId.current;
    pendingFocusStoryId.current = null;
    const card = Array.from(document.querySelectorAll('.story-card')).find(el => el.dataset.storyId === storyId);
    card?.focus();
  }, [state.brief.open]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [queue, names] = await Promise.all([fetchRankedQueue(), fetchSourceNames()]);
        if (cancelled) return;
        setRankedQueue(queue);
        setSourceNames(names);
        const eligible = queue
          .map(c => ({ ...c, representation: selectRepresentation(c, state.userContext.selectedLanguages) }))
          .filter(c => c.representation !== null);
        const initial = selectActiveSet(eligible, state.activeSetCapacity);
        setState(s => ({
          ...s,
          activeSet: initial.map((c, i) => ({ slot: i, storyId: c.clusterKey, representationId: c.representation?.rssGuid, _cluster: c })),
        }));
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => { cancelled = true; };
    // Intentionally runs once — Phase 2A cold-start only, per contract scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatch = action => {
    setState(prev => reduce(prev, action, { rankedQueue, control: controlRef.current, now: new Date().toISOString() }));
  };

  const topics = useMemo(() => [...new Set(rankedQueue.map(c => c.topic))].sort(), [rankedQueue]);

  // There is no "Semua"/All Bidang (removed 2026-08-12 per Izzat — he never
  // decided to have one). The reader is always inside exactly one real
  // Bidang, so as soon as the Bidang list is known, select the first one.
  useEffect(() => {
    if (state.userContext.selectedTopic == null && topics.length > 0) {
      dispatch(selectTopic(topics[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics]);

  const openStory = useMemo(() => {
    if (!state.brief.open) return null;
    const cluster = rankedQueue.find(c => c.clusterKey === state.brief.storyId);
    if (!cluster) return null;
    const rep = selectRepresentation(cluster, state.userContext.selectedLanguages) ?? cluster.canonical;
    return { title: rep.title, description: rep.description, link: rep.link, sourceId: rep.sourceId };
  }, [state.brief, rankedQueue, state.userContext.selectedLanguages]);

  const closeBriefAndRestoreFocus = () => {
    pendingFocusStoryId.current = state.brief.storyId;
    dispatch(closeBrief());
  };

  if (loadError) {
    return <div className="app-error">Gagal memuatkan berita: {loadError}</div>;
  }

  // Full-screen Brief: a state transition at ANY viewport width, never a
  // permanently-visible empty third pane (Izzat's explicit correction).
  if (state.brief.open) {
    return (
      <main className="app">
        <Brief
          story={openStory}
          sourceName={sourceNames.get(openStory?.sourceId) ?? openStory?.sourceId}
          onClose={closeBriefAndRestoreFocus}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <div className="app__masthead">Adjung Quick</div>
      <div className="app__body">
        <TopicWheel
          topics={topics}
          selectedTopic={state.userContext.selectedTopic}
          onSelect={topic => dispatch(selectTopic(topic))}
        />
        <ActiveSetList
          activeSet={state.activeSet}
          sourceNames={sourceNames}
          selectedTopic={state.userContext.selectedTopic}
          activeSetCapacity={state.activeSetCapacity}
          highlightedStoryId={state.selection.highlightedStoryId}
          onSelect={id => dispatch(selectStory(id))}
          onOpen={id => dispatch(openBrief(id))}
          onRelease={id => dispatch(releaseStory(id))}
        />
      </div>
    </main>
  );
}
