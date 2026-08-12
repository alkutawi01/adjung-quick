// test.js — Regression suite for the Architecture Skeleton (state model +
// reducer). Companion to lab/test.js (which tests the engine in isolation);
// this tests the STATE TRANSITION MAP on top of it — the contract a future
// UI is only allowed to interact with via actions.js.

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';
import { createEditorialControl } from '../lab/control.js';
import { createInitialState, getRepresentationPreference } from './model.js';
import { getEdition } from './editions.js';
import { reduce } from './reducer.js';
import * as actions from './actions.js';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function main() {
  console.log('Fetching real RSS data for state regression suite...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);

  const rankedQueue = buildRankedQueue(allItems);
  const control = createEditorialControl();
  const context = { rankedQueue, control };

  let state = createInitialState();
  state = reduce(state, actions.switchLanguage(['ms', 'en', 'ar']), context);

  assert('TEST 1 — cold-start SWITCH_LANGUAGE fills Active Set', state.activeSet.length > 0,
    `activeSet.length=${state.activeSet.length}`);

  const initialActiveSet = state.activeSet;

  // --- TEST 2: SELECT_TOPIC never touches activeSet ---
  const afterSelectTopic = reduce(state, actions.selectTopic('Politics'), context);
  assert('TEST 2 — SELECT_TOPIC does not change activeSet', afterSelectTopic.activeSet === initialActiveSet);

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

  // --- TEST 9: STABLE SPATIAL SLOTS (locked 2026-08-12) — RELEASE_STORY
  // must refill exactly the vacated slot index, never append at the end.
  // Found live by Izzat on the real device simulator: releasing slot #4
  // was shifting slots #5-9 up by one and appending the replacement at
  // slot #9 instead of #4. ---
  function assertSlotPreserved(label, slotIndexToRelease) {
    const before = state.activeSet;
    const targetEntry = before.find(s => s.slot === slotIndexToRelease);
    if (!targetEntry) { assert(label, false, `no entry at slot ${slotIndexToRelease}`); return; }
    const after = reduce(state, actions.releaseStory(targetEntry.storyId), context);
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

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('State regression suite crashed:', err);
  process.exit(1);
});
