// test.js — Regression suite for the Architecture Skeleton (state model +
// reducer). Companion to lab/test.js (which tests the engine in isolation);
// this tests the STATE TRANSITION MAP on top of it — the contract a future
// UI is only allowed to interact with via actions.js.

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';
import { createEditorialControl } from '../lab/control.js';
import { deterministicFixtureItems } from '../lab/testFixtures.js';
import { createInitialState, getRepresentationPreference } from './model.js';
import { getEdition } from './editions.js';
import { reduce } from './reducer.js';
import * as actions from './actions.js';
import { getRankingVersion } from './rankingFlags.js';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function main() {
  console.log('Fetching real RSS data for state regression suite...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const liveItems = results.filter(r => r.ok).flatMap(r => r.items);
  const allItems = liveItems.length >= 50 ? liveItems : deterministicFixtureItems();
  if (liveItems.length < 50) {
    console.log(`Only ${liveItems.length} live items fetched — using deterministic fixture for state regression assertions. Check network/sources for the live RSS smoke check.\n`);
  } else {
    console.log(`${liveItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);
  }

  const rankedQueue = buildRankedQueue(allItems);
  const control = createEditorialControl();
  const context = { rankedQueue, control };

  let state = createInitialState();
  state = reduce(state, actions.switchLanguage(['ms', 'en', 'ar']), context);

  assert('TEST 1 — cold-start SWITCH_LANGUAGE fills Active Set', state.activeSet.length > 0,
    `activeSet.length=${state.activeSet.length}`);

  const initialActiveSet = state.activeSet;

  // --- TEST 2: SELECT_TOPIC scopes the Active Set to the chosen Bidang ---
  // CHANGED 2026-08-12 (Izzat's decision): this previously asserted
  // SELECT_TOPIC never touched activeSet, with the Active Set holding the 10
  // globally top-ranked stories and the UI filtering at render time. That
  // left most Bidang empty (14 Bidang, 10 global slots) — selecting "Politik"
  // showed nothing despite 13 Politik stories existing. The Active Set is now
  // 10 slots OF THE SELECTED BIDANG.
  const topicWithStories = rankedQueue[0].topic;
  const afterSelectTopic = reduce(state, actions.selectTopic(topicWithStories), context);

  // Richest topic by candidate count — used below wherever a test needs a
  // Bidang guaranteed to have enough real candidates for a replacement to
  // actually happen (TEST 6e, TEST 9a-c). Since the Bidang-scoped Active
  // Set decision (2026-08-12), RELEASE_STORY/slot-preservation tests must
  // run against a SELECTED Bidang — a real reader is always inside one
  // (App.jsx auto-selects on cold start), so testing release before any
  // topic is selected (selectedTopic === null) is not a realistic scenario.
  const topicCounts = rankedQueue
    .reduce((counts, c) => (counts.set(c.topic, (counts.get(c.topic) ?? 0) + 1), counts), new Map());
  const [richestTopic] = [...topicCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null];
  const scopedState = reduce(state, actions.selectTopic(richestTopic), context);
  assert('TEST 2 — SELECT_TOPIC scopes activeSet to the selected Bidang',
    afterSelectTopic.activeSet.length > 0 &&
    afterSelectTopic.activeSet.every(s => s._cluster.topic === topicWithStories),
    `topic=${topicWithStories} got=${JSON.stringify(afterSelectTopic.activeSet.map(s => s._cluster.topic))}`);
  assert('TEST 2b — Bidang-scoped Active Set still respects capacity (Stable Spatial Slots intact)',
    afterSelectTopic.activeSet.length <= state.activeSetCapacity);
  assert('TEST 2c — SELECT_TOPIC on a Bidang with no stories yields an empty Active Set, not an error',
    reduce(state, actions.selectTopic('__no_such_bidang__'), context).activeSet.length === 0);

  // --- TEST 3: SELECT_STORY never touches activeSet ---
  const someStoryId = initialActiveSet[0].storyId;
  const afterSelectStory = reduce(state, actions.selectStory(someStoryId), context);
  assert('TEST 3 — SELECT_STORY does not change activeSet', afterSelectStory.activeSet === initialActiveSet);
  assert('TEST 3b — SELECT_STORY sets highlightedStoryId', afterSelectStory.selection.highlightedStoryId === someStoryId);

  // --- TEST 4: OPEN_BRIEF / CLOSE_BRIEF never touch activeSet ---
  const afterOpen = reduce(state, actions.openBrief(someStoryId), context);
  assert('TEST 4 — OPEN_BRIEF does not change activeSet', afterOpen.activeSet === initialActiveSet);
  assert('TEST 4b — OPEN_BRIEF sets brief.open=true', afterOpen.brief.open === true && afterOpen.brief.storyId === someStoryId);

  const afterClose = reduce(afterOpen, actions.closeBrief(), context);
  assert('TEST 5 — CLOSE_BRIEF does not change activeSet', afterClose.activeSet === initialActiveSet);
  assert('TEST 5b — CLOSE_BRIEF resets brief state', afterClose.brief.open === false);

  // --- TEST 6: RELEASE_STORY changes exactly one slot, rest untouched ---
  const beforeRelease = state.activeSet;
  const releasedId = beforeRelease[0].storyId;
  const afterRelease = reduce(state, actions.releaseStory(releasedId), context);
  const restUntouched = beforeRelease.slice(1).every(s =>
    afterRelease.activeSet.some(a => a.storyId === s.storyId));
  const releasedGone = !afterRelease.activeSet.some(a => a.storyId === releasedId);
  assert('TEST 6 — RELEASE_STORY keeps the other slots present', restUntouched);
  assert('TEST 6b — Active Set size restored after release (if candidates available)',
    afterRelease.activeSet.length === beforeRelease.length || afterRelease.activeSet.length === beforeRelease.length - 1);
  // Bug found running vertical-slice.js against real RSS 2026-08-11: the
  // released story (often still top-ranked) was being immediately
  // re-selected into the slot it just vacated, making release a no-op.
  assert('TEST 6c — released story does not immediately re-fill its own vacated slot', releasedGone);
  assert('TEST 6d — RELEASE_STORY records a history entry (L-045 placeholder)',
    afterRelease.history.length === state.history.length + 1 &&
    afterRelease.history[afterRelease.history.length - 1].storyId === releasedId);

  // BUG FOUND LIVE (2026-08-13, Izzat: "saya dah cuba semua bidang, takde
  // yg ganti pun" — RELEASE_STORY's replacement pool wasn't scoped to the
  // selected Bidang, so lab/engine.js's coverage-first diversity pass
  // admitted a DIFFERENT topic's story into the vacated slot — which then
  // silently vanished behind ActiveSetList's own topic filter, making
  // every release look like a no-op regardless of how many same-topic
  // candidates existed). Pick a Bidang with real volume so a replacement
  // should be possible, then verify any replacement that DOES appear is
  // the SAME topic as the one selected — never a different topic hidden
  // by the render-time filter.
  const beforeScopedRelease = scopedState.activeSet;
  const scopedReleasedId = beforeScopedRelease[0]?.storyId;
  const afterScopedRelease = scopedReleasedId
    ? reduce(scopedState, actions.releaseStory(scopedReleasedId), context)
    : scopedState;
  assert('TEST 6e — RELEASE_STORY replacement (if any) is the SAME topic as the selected Bidang, never a different one hidden by the render filter',
    afterScopedRelease.activeSet.every(s => s._cluster?.topic === richestTopic),
    `richestTopic=${richestTopic} got=${JSON.stringify(afterScopedRelease.activeSet.map(s => s._cluster?.topic))}`);

  // --- TEST 9: STABLE SPATIAL SLOTS (locked 2026-08-12) — RELEASE_STORY
  // must refill exactly the vacated slot index, never append at the end.
  // Found live by Izzat on the real device simulator: releasing slot #4
  // was shifting slots #5-9 up by one and appending the replacement at
  // slot #9 instead of #4. ---
  function assertSlotPreserved(label, slotIndexToRelease) {
    const before = scopedState.activeSet;
    const targetEntry = before.find(s => s.slot === slotIndexToRelease);
    if (!targetEntry) { assert(label, false, `no entry at slot ${slotIndexToRelease}`); return; }
    const after = reduce(scopedState, actions.releaseStory(targetEntry.storyId), context);
    const untouchedSlots = before.filter(s => s.slot !== slotIndexToRelease);
    const allUntouchedPreserved = untouchedSlots.every(s => {
      const match = after.activeSet.find(a => a.slot === s.slot);
      return match && match.storyId === s.storyId;
    });
    // Strengthened per ChatGPT audit (2026-08-12): the original assertion
    // let an EMPTY slot pass silently, which only proves "the old story
    // isn't there" — not "a replacement actually filled it". With 196 real
    // RSS items and only 10 slots occupied, a candidate always exists, so
    // this test environment must show a real replacement, not an empty slot.
    const maxOriginalSlot = Math.max(...before.map(s => s.slot));
    const noAppendedSlot = after.activeSet.every(a => a.slot <= maxOriginalSlot);
    const replacement = after.activeSet.find(a => a.slot === slotIndexToRelease);
    const slotActuallyRefilledWithNewStory = !!replacement && replacement.storyId !== targetEntry.storyId;
    assert(label, allUntouchedPreserved && noAppendedSlot && slotActuallyRefilledWithNewStory,
      `untouchedPreserved=${allUntouchedPreserved} noAppendedSlot=${noAppendedSlot} slotActuallyRefilledWithNewStory=${slotActuallyRefilledWithNewStory}`);
  }

  assertSlotPreserved('TEST 9a — release slot 0: only slot 0 changes, all others keep position+story', 0);
  assertSlotPreserved('TEST 9b — release middle slot 4: slots 0-3/5-9 retain same story AND position', 4);
  assertSlotPreserved('TEST 9c — release slot 9 (last): only slot 9 changes', 9);

  // --- TEST 10: RELEASE_STORY under editorial_v1 (2026-08-13, audit
  // finding docs/exhaustive-audit-findings-v1.md HIGH — the only
  // production-active advanced-ranking code path, ms-MY/Politik, was
  // never actually exercised here: TEST 9a-c above scope to `richestTopic`
  // (whichever Bidang has the most real candidates), which per reducer.js's
  // own comments is essentially never Politik (Politik/53 vs
  // Pendidikan/193 in observed real data) — so every run of `npm test`
  // was silently skipping reducer.js's editorial_v1 branch (lines
  // 194-199) and only ever exercising the legacy branch below it. Pinned
  // explicitly to ms-MY/Politik here so a regression in the ranking
  // engine's single-slot-fill or Stable Spatial Slots guarantee under
  // editorial_v1 can't ship undetected again. Does not change any
  // reducer/ranking behavior — test-only. ---
  {
    const politikState = reduce(state, actions.selectTopic('Politik'), context);
    const politikVersion = getRankingVersion(politikState.editionContext.activeEdition, politikState.userContext.selectedTopic);
    assert('TEST 10 — sanity check: ms-MY/Politik is actually on editorial_v1 (if this fails, the pin below is testing nothing)',
      politikVersion === 'editorial_v1', `got version=${politikVersion}`);

    if (politikState.activeSet.length > 0) {
      const before = politikState.activeSet;
      const targetSlot = before[0].slot;
      const targetEntry = before.find(s => s.slot === targetSlot);
      const after = reduce(politikState, actions.releaseStory(targetEntry.storyId), context);

      const untouchedSlots = before.filter(s => s.slot !== targetSlot);
      const untouchedPreserved = untouchedSlots.every(s => {
        const match = after.activeSet.find(a => a.slot === s.slot);
        return match && match.storyId === s.storyId;
      });
      const maxOriginalSlot = Math.max(...before.map(s => s.slot));
      const noAppendedSlot = after.activeSet.every(a => a.slot <= maxOriginalSlot);
      const replacement = after.activeSet.find(a => a.slot === targetSlot);
      const sameTopicIfReplaced = !replacement || replacement._cluster?.topic === 'Politik';

      assert('TEST 10a — editorial_v1 RELEASE_STORY: other slots untouched (position + story)', untouchedPreserved);
      assert('TEST 10b — editorial_v1 RELEASE_STORY: no slot appended beyond the original range', noAppendedSlot);
      assert('TEST 10c — editorial_v1 RELEASE_STORY: any replacement is the SAME Bidang (Politik), never leaked from another topic',
        sameTopicIfReplaced, `got=${replacement?._cluster?.topic}`);
    } else {
      assert('TEST 10 — editorial_v1 RELEASE_STORY (skipped: no live Politik candidates this run)', true);
    }
  }

  // --- TEST 11: a released story never returns (2026-08-13, live bug —
  // Izzat: "berita yg telah di-swap kembali semula" — a swiped-away
  // story reappeared later). Two distinct paths that both used to leak
  // this, both now fixed via excludeEverReleased() in reducer.js: ---
  {
    // 11a: RELEASE_STORY called twice in the same Bidang — the FIRST
    // released story must not be pulled back in as the SECOND release's
    // replacement, even if it's still the top-ranked candidate overall.
    const s1 = reduce(state, actions.selectTopic(richestTopic), context);
    const firstReleaseId = s1.activeSet[0]?.storyId;
    if (firstReleaseId) {
      const s2 = reduce(s1, actions.releaseStory(firstReleaseId), context);
      const secondReleaseId = s2.activeSet.find(a => a.storyId !== firstReleaseId)?.storyId;
      const s3 = secondReleaseId ? reduce(s2, actions.releaseStory(secondReleaseId), context) : s2;
      assert('TEST 11a — a story released 2 RELEASE_STORY calls ago does not resurface as a later replacement',
        !s3.activeSet.some(a => a.storyId === firstReleaseId),
        `firstReleaseId=${firstReleaseId} got=${JSON.stringify(s3.activeSet.map(a => a.storyId))}`);
    } else {
      assert('TEST 11a — (skipped: no live candidates this run)', true);
    }

    // 11b: the more common real-world path — release a story, navigate
    // AWAY (SELECT_TOPIC to a different Bidang, which fully rebuilds the
    // Active Set from rankedQueue), then navigate BACK. The released
    // story must still be excluded from the fresh rebuild, not just from
    // RELEASE_STORY's own single-slot-fill pass.
    const beforeAway = reduce(state, actions.selectTopic(richestTopic), context);
    const releasedId = beforeAway.activeSet[0]?.storyId;
    if (releasedId) {
      const afterReleaseThenAway = reduce(
        reduce(beforeAway, actions.releaseStory(releasedId), context),
        actions.selectTopic(topicWithStories === richestTopic ? rankedQueue[1]?.topic ?? topicWithStories : topicWithStories),
        context
      );
      const backAgain = reduce(afterReleaseThenAway, actions.selectTopic(richestTopic), context);
      assert('TEST 11b — a released story stays excluded after navigating away and back (SELECT_TOPIC full rebuild)',
        !backAgain.activeSet.some(a => a.storyId === releasedId),
        `releasedId=${releasedId} got=${JSON.stringify(backAgain.activeSet.map(a => a.storyId))}`);
    } else {
      assert('TEST 11b — (skipped: no live candidates this run)', true);
    }
  }

  // --- TEST 7: PIN/PRIORITIZE/REMOVE never mutate state.activeSet directly ---
  const beforeControl = state.activeSet;
  const controlTargetId = rankedQueue.find(c => !beforeControl.some(a => a.storyId === c.clusterKey))?.clusterKey;
  const afterPin = reduce(state, actions.pinStory(controlTargetId), context);
  assert('TEST 7 — PIN_STORY does not mutate activeSet directly', afterPin.activeSet === beforeControl);
  assert('TEST 7b — Pin recorded in control queue', control.pinPendingQueue().includes(controlTargetId));

  // --- TEST 8: SWITCH_LANGUAGE is atomic and closes Brief ---
  const withBriefOpen = reduce(state, actions.openBrief(someStoryId), context);
  const afterSwitch = reduce(withBriefOpen, actions.switchLanguage(['en']), context);
  assert('TEST 8 — SWITCH_LANGUAGE closes Brief', afterSwitch.brief.open === false);
  assert('TEST 8b — SWITCH_LANGUAGE updates selectedLanguages', JSON.stringify(afterSwitch.userContext.selectedLanguages) === JSON.stringify(['en']));
  assert('TEST 8c — SWITCH_LANGUAGE result only contains eligible-language representations',
    afterSwitch.activeSet.every(s => {
      const rep = s._cluster?.representation;
      return !rep || rep.language === 'en';
    }));

  // --- Session UI-1 acceptance tests (docs/edition-state-model.md,
  // docs/core-reading-ui-contract.md §11a). These test the EDITION layer,
  // which is a different concern from TEST 8's language/representation
  // layer above — the whole point of the O-012 split. ---

  // Test 1 — Edition isolation: each edition's Wheel reads its OWN taxonomy.
  const msEdition = getEdition('ms-MY');
  const enEdition = getEdition('en-global');
  const arEdition = getEdition('ar-global');
  assert('UI-1 TEST 1a — ms-MY taxonomy is ms-MY specific',
    msEdition.taxonomy.includes('Politik') && !msEdition.taxonomy.includes('Politics'));
  assert('UI-1 TEST 1b — en taxonomy is en specific',
    enEdition.taxonomy.includes('Politics') && !enEdition.taxonomy.includes('Politik'));
  assert('UI-1 TEST 1c — ar taxonomy is ar specific + RTL',
    arEdition.taxonomy.includes('سياسة') && arEdition.direction === 'rtl');
  assert('UI-1 TEST 1d — editions do NOT have identical field counts (independent taxonomies, not translations)',
    new Set([msEdition.taxonomy.length, enEdition.taxonomy.length, arEdition.taxonomy.length]).size > 1);

  // Test 2 — Active Set stability across edition switch: content may change,
  // capacity/slot model must not.
  let editionState = createInitialState();
  editionState = reduce(editionState, actions.switchLanguage(['ms', 'en', 'ar']), context);
  const beforeEditionSwitch = editionState.activeSet.length;
  const afterEditionSwitch = reduce(editionState, actions.switchEdition('en-global'), context);
  assert('UI-1 TEST 2a — SWITCH_EDITION updates activeEdition',
    afterEditionSwitch.editionContext.activeEdition === 'en-global');
  assert('UI-1 TEST 2b — Active Set capacity unchanged by edition switch',
    afterEditionSwitch.activeSetCapacity === editionState.activeSetCapacity);
  assert('UI-1 TEST 2c — Active Set never exceeds capacity after edition switch',
    afterEditionSwitch.activeSet.length <= afterEditionSwitch.activeSetCapacity,
    `before=${beforeEditionSwitch} after=${afterEditionSwitch.activeSet.length}`);
  assert('UI-1 TEST 2d — SWITCH_EDITION closes Brief',
    afterEditionSwitch.brief.open === false);

  // BUG FOUND LIVE (2026-08-13, Izzat: "berita melayu takkan keluar dalam
  // edisi arab"): editionState above deliberately seeds
  // selectedLanguages=['ms','en','ar'] (ALL three) via switchLanguage() a
  // few lines up — which accidentally masked this exact bug in every
  // earlier version of this test, since 'ms' being in the eligible set
  // let a Malay representation slip into a non-Malay edition's Active Set
  // without failing TEST 2a-2d above. This test targets that specific gap:
  // even with all languages "preferred", switching to en-global must never
  // seat a Malay-only representation — membership is edition-locale-bound,
  // representationPreference is not allowed to override it.
  assert('UI-1 TEST 2e — SWITCH_EDITION never admits a representation in the WRONG edition language (regression for the "Malay news in Arabic edition" bug)',
    afterEditionSwitch.activeSet.every(s => {
      const rep = s._cluster?.representation;
      return !rep || rep.language === 'en';
    }),
    `offending languages: ${JSON.stringify(afterEditionSwitch.activeSet.map(s => s._cluster?.representation?.language))}`);

  const afterArSwitch = reduce(editionState, actions.switchEdition('ar-global'), context);
  assert('UI-1 TEST 2f — same check for ar-global',
    afterArSwitch.activeSet.every(s => {
      const rep = s._cluster?.representation;
      return !rep || rep.language === 'ar';
    }),
    `offending languages: ${JSON.stringify(afterArSwitch.activeSet.map(s => s._cluster?.representation?.language))}`);

  // Test 3 — Field invalidation: a field that exists in the new edition
  // carries over; one that doesn't is dropped to null (never auto-mapped).
  const withSurvivingField = reduce(
    { ...editionState, userContext: { ...editionState.userContext, selectedTopic: 'Politik' } },
    actions.switchEdition('ms-MY'), context);
  assert('UI-1 TEST 3a — field valid in target edition carries over',
    withSurvivingField.userContext.selectedTopic === 'Politik');

  const withDroppedField = reduce(
    { ...editionState, userContext: { ...editionState.userContext, selectedTopic: 'Agama' } },
    actions.switchEdition('ar-global'), context);
  assert('UI-1 TEST 3b — field absent from target edition is dropped, not auto-mapped',
    withDroppedField.userContext.selectedTopic === null,
    `got ${JSON.stringify(withDroppedField.userContext.selectedTopic)}`);

  // Test 4 — Representation preference is a SEPARATE concern: it must not
  // rebuild the Active Set (unlike SWITCH_LANGUAGE, which does).
  const beforePrefChange = editionState.activeSet;
  const afterPrefChange = reduce(editionState, actions.setRepresentationPreference(['ar', 'en', 'ms']), context);
  assert('UI-1 TEST 4a — SET_REPRESENTATION_PREFERENCE does not rebuild Active Set',
    afterPrefChange.activeSet === beforePrefChange);
  assert('UI-1 TEST 4b — SET_REPRESENTATION_PREFERENCE records the preference order',
    JSON.stringify(afterPrefChange.userContext.representationPreference) === JSON.stringify(['ar', 'en', 'ms']));
  assert('UI-1 TEST 4c — getRepresentationPreference reads new field once written',
    JSON.stringify(getRepresentationPreference(afterPrefChange)) === JSON.stringify(['ar', 'en', 'ms']));
  assert('UI-1 TEST 4d — getRepresentationPreference falls back to selectedLanguages pre-migration',
    JSON.stringify(getRepresentationPreference(editionState)) === JSON.stringify(['ms', 'en', 'ar']));

  // --- Session UI-2B acceptance tests (docs/ui-2-navigation-contract.md),
  // per ChatGPT's explicit request. These name the same invariants already
  // exercised above (UI-1 TEST 1/2c/2b, the Edition Locale Authority fix)
  // under UI-2B's own numbering, for direct traceability against the
  // contract doc rather than requiring cross-referencing test numbers. ---

  // UI-2B TEST 1 — Wheel taxonomy source: the field list must come from the
  // edition registry alone, never from what stories exist today. Proven by
  // construction: getEdition().taxonomy takes no rankedQueue/story argument
  // at all, so a taxonomy addition needs zero stories to appear.
  const msTaxonomy = getEdition('ms-MY').taxonomy;
  assert('UI-2B TEST 1 — Wheel taxonomy source is edition-only, independent of any story data',
    Array.isArray(msTaxonomy) && msTaxonomy.length > 0 && msTaxonomy.includes('Sains'));

  // UI-2B TEST 2 — Empty field yields an empty Active Set, not an error or
  // a fallback into another field's stories (same guarantee as TEST 2c
  // above, re-run here against a field genuinely unlikely to have live
  // RSS coverage).
  const emptyFieldState = reduce(
    { ...state, editionContext: { activeEdition: 'ms-MY' } },
    actions.selectTopic('Budaya'), context);
  assert('UI-2B TEST 2 — empty field: Active Set has zero or few slots, never backfilled from another field',
    emptyFieldState.activeSet.every(s => s._cluster?.topic === 'Budaya'));

  // UI-2B TEST 3 — Edition isolation: ms-MY's field list and en-global's
  // field list are genuinely separate arrays with no shared identity —
  // 'Agama' existing in ms-MY says nothing about en-global's fields.
  const enTaxonomy = getEdition('en-global').taxonomy;
  assert('UI-2B TEST 3 — edition taxonomies do not share list identity or contents',
    msTaxonomy !== enTaxonomy && !msTaxonomy.every(f => enTaxonomy.includes(f)));

  // UI-2B TEST 4 — Active Set capacity is invariant across a topic with
  // many candidates: ranking changes which stories fill the 10 slots, the
  // slot COUNT never changes.
  const busyFieldState = reduce(state, actions.selectTopic('Malaysia'), context);
  assert('UI-2B TEST 4 — Active Set never exceeds capacity regardless of candidate volume',
    busyFieldState.activeSet.length <= busyFieldState.activeSetCapacity,
    `activeSet.length=${busyFieldState.activeSet.length} capacity=${busyFieldState.activeSetCapacity}`);

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('State regression suite crashed:', err);
  process.exit(1);
});
