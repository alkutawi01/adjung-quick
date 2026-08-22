import { useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState } from '../../state/model.js';
import { reduce } from '../../state/reducer.js';
import { selectTopic, selectStory, openBrief, closeBrief, releaseStory, switchEdition } from '../../state/actions.js';
import { getEdition, loadEditionsFromDB } from '../../state/editions.js';
import { createEditorialControl } from '../../lab/control.js';
import { fetchRankedQueue, fetchSourceNames, supabase } from './adapter/productionAdapter.js';
import TopicWheel from './components/TopicWheel.jsx';
import ActiveSetList from './components/ActiveSetList.jsx';
import Brief from './components/Brief.jsx';
import EditionSwitcher from './components/EditionSwitcher.jsx';
import { t } from './i18n.js';

// A Bidang only appears in the Wheel once it can actually fill a full
// Active Set — see the `topics` useMemo below for the full rationale
// (2026-08-21, Izzat's direct instruction after the Global Edition v1
// audit). Same number as activeSetCapacity (state/model.js) by design.
const MIN_TOPIC_STORIES = 10;

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
  // Distinguishes "still fetching" from "genuinely no stories in this
  // Bidang" — before this, ActiveSetList had no way to tell the two apart
  // (rankedQueue/activeSet both start empty), so a reader saw the same
  // "Belum ada berita..." message on a slow connection as on a real
  // editorial-empty Bidang. Izzat caught this live (2026-08-16).
  const [isLoading, setIsLoading] = useState(true);
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
    setIsLoading(true);
    (async () => {
      try {
        // Backend Control Plane Phase 2 (2026-08-17): taxonomy MUST be
        // loaded and resolved BEFORE the ranked-queue fetch starts —
        // getEdition() below (line ~89) needs the DB-backed taxonomy,
        // not the pre-fetch fallback. Not run in parallel with
        // fetchRankedQueue()/fetchSourceNames() deliberately — a queue
        // built against stale taxonomy would need re-deriving anyway.
        await loadEditionsFromDB(supabase);
        if (cancelled) return;

        // Edition-scoped: each cluster's `topic` comes back as THIS
        // edition's placement (docs/edition-state-model.md). Switching
        // edition re-runs this effect, since the whole ranked queue must be
        // re-labelled — a Bidang list can't be translated in place.
        const [queue, names] = await Promise.all([
          fetchRankedQueue(state.editionContext.activeEdition),
          fetchSourceNames(),
        ]);
        if (cancelled) return;
        setRankedQueue(queue);
        setSourceNames(names);
        // Bidang-scoped cold start (2026-08-12, Izzat's decision): seed the
        // Active Set from the FIRST Bidang's stories, not the global top-10.
        //
        // UNIFIED (2026-08-13, docs/editorial-adversarial-audit-v1.md Audit 2
        // finding A — confirmed by 23/23 agents): this used to build the
        // Active Set here directly via selectActiveSet(), bypassing
        // state/reducer.js's selectFieldActiveSet() entirely — the exact
        // function every later SELECT_TOPIC/SWITCH_EDITION goes through. That
        // meant the reader's very FIRST screen, and every screen right after
        // an edition switch, used a DIFFERENT selection path than every
        // subsequent Bidang change: no ranking-flag branch, no
        // excludeEverReleased, no shared eligibility logic — duplicated by
        // hand and silently able to drift from the real one.
        //
        // Costed nothing so far only because taxonomy[0] happens to be a
        // legacy-ranking field everywhere. It would have made Pin — and any
        // future ranking-aware feature — silently inert on first load: an
        // admin pins a story, sees it work while navigating between Bidang,
        // and never learns a reader arriving fresh never saw it.
        //
        // Fix: reuse reduce()'s own SELECT_TOPIC case — the ONE place
        // eligibility, released-story exclusion, and ranking-flag dispatch
        // are allowed to live — passing the just-fetched `queue` as context
        // directly. dispatch()'s own closure can't be used here: it still
        // holds the PRE-fetch `rankedQueue` state (empty) since this runs
        // before React re-renders from the setRankedQueue() call above.
        const activeEdition = getEdition(state.editionContext.activeEdition);
        // field_code, not label — see topics useMemo below for why.
        //
        // MIN_TOPIC_STORIES filtering (2026-08-21) means taxonomyFieldCodes[0]
        // is no longer guaranteed to be a visible Bidang — the wheel now
        // hides thin categories, so cold start must pick the first field
        // that ACTUALLY clears the threshold against the just-fetched
        // queue, the same count the topics useMemo below computes. Falls
        // back to taxonomyFieldCodes[0] only if literally every field is
        // under threshold (a near-empty edition), so this never dispatches
        // a field code that doesn't exist in the taxonomy at all.
        const countByCode = new Map();
        for (const c of queue) {
          if (!c.topic) continue;
          countByCode.set(c.topic, (countByCode.get(c.topic) ?? 0) + 1);
        }
        // 'entertainment' excluded here too — see the topics useMemo below,
        // same 2026-08-21 instruction. Cold start must never land on a
        // Bidang the Wheel itself won't offer.
        const firstTopic = activeEdition.taxonomyFieldCodes.find(
          code => code !== 'entertainment' && (countByCode.get(code) ?? 0) >= MIN_TOPIC_STORIES,
        ) ?? activeEdition.taxonomyFieldCodes.find(code => code !== 'entertainment')
          ?? activeEdition.taxonomyFieldCodes[0];
        setState(s => reduce(s, selectTopic(firstTopic), {
          rankedQueue: queue,
          control: controlRef.current,
          now: new Date().toISOString(),
        }));
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-runs on edition change (UI-1.1): the ranked queue carries
    // edition-specific placements, so a new edition needs a fresh fetch,
    // not a client-side re-label. Still cold-start-only otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.editionContext.activeEdition]);

  const dispatch = action => {
    setState(prev => reduce(prev, action, { rankedQueue, control: controlRef.current, now: new Date().toISOString() }));
  };

  // UI-1.1 Wheel Taxonomy Source Migration (2026-08-12, per
  // docs/edition-state-model.md) established that the Wheel reads its
  // field list from the ACTIVE EDITION's taxonomy, never from whatever
  // topics happen to exist in today's stories — the Wheel was meant as
  // the edition's editorial map, not a filter over available content.
  //
  // REVERSED 2026-08-21, per Izzat's explicit, direct instruction after
  // the Global Edition v1 audit surfaced thin categories (ar-global had
  // several Bidang sitting at 0-4 stories): "kalau kategori tidak ada
  // berita atau kurang daripada 10, kategori itu disembunyikan." A Bidang
  // a reader can select into and find almost nothing is worse than a
  // Bidang that isn't offered at all — so story SUPPLY now decides WHICH
  // Bidang appear, not just how much is in each one. MIN_TOPIC_STORIES is
  // the same number as activeSetCapacity (state/model.js) — a Bidang
  // should only appear once it can actually fill a full Active Set.
  //
  // Taxonomy Stable Field-ID V1 (2026-08-16): TopicWheel needs both the
  // stable code (dispatch/matching) and the label (display) — paired here
  // from editions.js's parallel `taxonomy`/`taxonomyFieldCodes` arrays.
  const topics = useMemo(() => {
    const edition = getEdition(state.editionContext.activeEdition);
    const countByCode = new Map();
    for (const c of rankedQueue) {
      if (!c.topic) continue;
      countByCode.set(c.topic, (countByCode.get(c.topic) ?? 0) + 1);
    }
    return edition.taxonomyFieldCodes
      .map((code, i) => ({ code, label: edition.taxonomy[i] }))
      // Entertainment hidden in every edition, 2026-08-21, Izzat's direct
      // instruction — field_code is the same literal 'entertainment' in
      // all three editions' taxonomy_fields rows (confirmed, not assumed).
      // Not a MIN_TOPIC_STORIES case: this is a full editorial exclusion,
      // independent of story count, until an explicit "bermanfaat" quality
      // rule is defined — deliberately not invented here.
      .filter(t => t.code !== 'entertainment')
      .filter(t => (countByCode.get(t.code) ?? 0) >= MIN_TOPIC_STORIES);
  }, [state.editionContext.activeEdition, rankedQueue]);

  // There is no "Semua"/All Bidang (removed 2026-08-12 per Izzat — he never
  // decided to have one). The reader is always inside exactly one real
  // Bidang. Since UI-1.1 the taxonomy is known synchronously from the
  // edition (no longer waiting on async story data), so this resolves
  // immediately at cold start — and re-resolves after SWITCH_EDITION drops
  // a field that doesn't exist in the new edition (reducer sets it to null,
  // per docs/core-reading-ui-contract.md §11a).
  //
  // Extended 2026-08-21 for MIN_TOPIC_STORIES/entertainment filtering: the
  // reducer's own SWITCH_EDITION "field survives" check only asks whether
  // the field_code exists in the new edition's RAW taxonomy — 'entertainment'
  // always does, in every edition, so a reader who switches edition while
  // Entertainment is selected would otherwise land on a Bidang the Wheel no
  // longer lists at all, with no arrow-button path back to a visible one.
  // Checking membership in the already-filtered `topics` (not just
  // non-null) closes that gap the same way the null case is already
  // handled, without touching the reducer's own survival contract.
  useEffect(() => {
    const stillVisible = topics.some(t => t.code === state.userContext.selectedTopic);
    if (!stillVisible && topics.length > 0) {
      dispatch(selectTopic(topics[0].code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, state.userContext.selectedTopic]);

  const openStory = useMemo(() => {
    if (!state.brief.open) return null;
    // BUG FIX (2026-08-13, same class as the reducer's Active Set membership
    // fix — ChatGPT's UI-2A audit instruction specifically asked for this
    // pattern to be found and removed): this used to re-resolve a
    // representation via selectRepresentation(cluster, selectedLanguages),
    // completely ignoring the edition-correct representation the Active Set
    // slot already carries (`_cluster.representation`). With
    // selectedLanguages defaulting to ['ms'], opening a story from a
    // non-Malay edition's Active Set could show a DIFFERENT, wrong-language
    // representation in the Brief than the card the reader actually tapped.
    // Fix: reuse the slot's already-resolved, edition-correct representation
    // first — never re-derive from representationPreference/selectedLanguages,
    // per docs/edition-state-model.md's Edition Locale Authority principle.
    const slot = state.activeSet.find(s => s.storyId === state.brief.storyId);
    const cluster = slot?._cluster ?? rankedQueue.find(c => c.clusterKey === state.brief.storyId);
    if (!cluster) return null;
    const rep = cluster.representation ?? cluster.canonical;
    return { title: rep.title, description: rep.description, link: rep.link, sourceId: rep.sourceId };
  }, [state.brief, state.activeSet, rankedQueue]);

  const closeBriefAndRestoreFocus = () => {
    pendingFocusStoryId.current = state.brief.storyId;
    dispatch(closeBrief());
  };

  // UI-2A (docs/ui-2-navigation-contract.md §4): dir/lang follow the ACTIVE
  // EDITION, not a separate language setting — direction is an edition
  // property (state/editions.js), so ar-global renders RTL from the very
  // root, before any child component needs to know about it individually.
  const currentEdition = getEdition(state.editionContext.activeEdition);

  // Backend Control Plane Phase 2 (2026-08-17): gates the WHOLE reader
  // render — not just a prop to one child (isLoading was previously
  // only passed to ActiveSetList, which meant TopicWheel/currentEdition
  // rendered on the very first paint using EDITIONS' pre-fetch fallback
  // value, before loadEditionsFromDB() had a chance to resolve). Must
  // come before anything below reads getEdition()/topics.
  if (isLoading) {
    return <div className="app-loading">{t(currentEdition.locale, 'loading')}</div>;
  }

  if (loadError) {
    return <div className="app-error">{t(currentEdition.locale, 'loadError')}: {loadError}</div>;
  }

  // Full-screen Brief: a state transition at ANY viewport width, never a
  // permanently-visible empty third pane (Izzat's explicit correction).
  if (state.brief.open) {
    return (
      <main className="app" dir={currentEdition.direction} lang={currentEdition.locale}>
        <Brief
          story={openStory}
          sourceName={sourceNames.get(openStory?.sourceId) ?? openStory?.sourceId}
          onClose={closeBriefAndRestoreFocus}
          locale={currentEdition.locale}
        />
      </main>
    );
  }

  return (
    <main className="app" dir={currentEdition.direction} lang={currentEdition.locale}>
      <div className="app__masthead">
        <span className="app__masthead-title">Adjung Quick</span>
        <EditionSwitcher
          activeEdition={state.editionContext.activeEdition}
          onSwitch={id => dispatch(switchEdition(id))}
        />
      </div>
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
          locale={currentEdition.locale}
          isLoading={isLoading}
          onSelect={id => dispatch(selectStory(id))}
          onOpen={id => dispatch(openBrief(id))}
          onRelease={id => dispatch(releaseStory(id))}
        />
      </div>
    </main>
  );
}
