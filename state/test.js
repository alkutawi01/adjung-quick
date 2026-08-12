// test.js — Regression suite for the Architecture Skeleton (state model +
// reducer). Companion to lab/test.js (which tests the engine in isolation);
// this tests the STATE TRANSITION MAP on top of it — the contract a future
// UI is only allowed to interact with via actions.js.

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { buildRankedQueue } from '../lab/engine.js';
import { createEditorialControl } from '../lab/control.js';
import { createInitialState } from './model.js';
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

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('State regression suite crashed:', err);
  process.exit(1);
});
