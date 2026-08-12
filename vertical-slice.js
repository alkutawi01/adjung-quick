// vertical-slice.js — Phase 1 vertical slice per ChatGPT's (director) spec:
//
//   Scenario 1: real RSS -> Active Set -> pilih story -> buka Brief -> tutup
//               -> release satu story -> replacement masuk.
//   Scenario 2: tukar [Melayu+English] -> [English] -> Active Set berubah
//               atomically -> story yang sama pakai English representation
//               jika ada -> story yang tiada English representation diganti.
//
// Deliberately NOT a real UI — no framework, no visual design decisions.
// This is a terminal harness whose only job is to prove the state/reducer/
// engine contract holds end-to-end against real RSS and a real (if crude)
// input loop, per the instruction: "jangan campurkan UI dalam Fasa 1 kecuali
// vertical slice minimum yang diperlukan untuk membuktikan end-to-end flow."

import readline from 'node:readline';
import { RSS_SOURCES } from './lab/sources.js';
import { fetchFeed } from './lab/rss.js';
import { buildRankedQueue } from './lab/engine.js';
import { createEditorialControl } from './lab/control.js';
import { createInitialState } from './state/model.js';
import { reduce } from './state/reducer.js';
import * as actions from './state/actions.js';

function truncate(str, n) { return str && str.length > n ? str.slice(0, n - 1) + '…' : str || ''; }

function printActiveSet(state) {
  console.log(`\n--- ACTIVE SET (${state.activeSet.length}/${state.activeSetCapacity}) | languages: ${state.userContext.selectedLanguages.join(',')} ---`);
  state.activeSet.forEach((s, i) => {
    const rep = s._cluster?.representation;
    const marker = s.storyId === state.selection.highlightedStoryId ? '>' : ' ';
    console.log(`${marker} ${i + 1}. [${rep?.language ?? '?'}] ${truncate(rep?.title, 65)}`);
  });
  if (state.brief.open) {
    const openSlot = state.activeSet.find(s => s.storyId === state.brief.storyId);
    const rep = openSlot?._cluster?.representation;
    console.log(`\n=== BRIEF OPEN ===`);
    console.log(rep?.title ?? '(story no longer in Active Set)');
    console.log(truncate(rep?.description, 220));
    console.log(`Source: ${rep?.sourceName ?? '?'} | ${rep?.link ?? ''}`);
  }
  console.log('');
}

function printHelp() {
  console.log(`Commands:
  select <n>       - highlight story n (SELECT_STORY)
  open <n>         - open Brief for story n (OPEN_BRIEF)
  close            - close Brief (CLOSE_BRIEF)
  release <n>      - release story n, replacement fills the slot (RELEASE_STORY)
  lang <ms,en,ar>  - switch language context, e.g. "lang en" (SWITCH_LANGUAGE)
  topic <name|all> - select topic filter (SELECT_TOPIC) — does not touch Active Set
  help             - show this
  quit             - exit
`);
}

async function main() {
  console.log('Fetching real RSS...\n');
  const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
  const allItems = results.filter(r => r.ok).flatMap(r => r.items);
  console.log(`${allItems.length} items from ${results.filter(r => r.ok).length}/${RSS_SOURCES.length} sources.\n`);

  const rankedQueue = buildRankedQueue(allItems);
  const control = createEditorialControl();
  const context = { rankedQueue, control };

  let state = createInitialState();
  // Scenario 1 setup: cold start with Melayu + English (so Scenario 2's
  // switch-to-English-only has real Type 1 vs Type 2 cases to show).
  state = reduce(state, actions.switchLanguage(['ms', 'en']), context);

  printHelp();
  printActiveSet(state);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  rl.on('line', (line) => {
    const [cmd, arg] = line.trim().split(/\s+/, 2);
    const idx = arg ? parseInt(arg, 10) - 1 : null;
    const storyId = idx !== null && state.activeSet[idx] ? state.activeSet[idx].storyId : null;

    switch (cmd) {
      case 'select':
        if (!storyId) { console.log('No such slot.'); break; }
        state = reduce(state, actions.selectStory(storyId), context);
        break;
      case 'open':
        if (!storyId) { console.log('No such slot.'); break; }
        state = reduce(state, actions.openBrief(storyId), context);
        break;
      case 'close':
        state = reduce(state, actions.closeBrief(), context);
        break;
      case 'release':
        if (!storyId) { console.log('No such slot.'); break; }
        state = reduce(state, actions.releaseStory(storyId), context);
        break;
      case 'lang': {
        const langs = (arg || '').split(',').map(s => s.trim()).filter(Boolean);
        if (langs.length === 0) { console.log('Usage: lang ms,en,ar'); break; }
        const beforeIds = new Set(state.activeSet.map(s => s.storyId));
        state = reduce(state, actions.switchLanguage(langs), context);
        const afterIds = new Set(state.activeSet.map(s => s.storyId));
        const kept = [...beforeIds].filter(id => afterIds.has(id)).length;
        const replaced = beforeIds.size - kept;
        console.log(`Language switch: ${kept} stories kept (representation swap or already eligible), ${replaced} replaced.`);
        break;
      }
      case 'topic':
        state = reduce(state, actions.selectTopic(arg === 'all' ? null : arg), context);
        console.log(`Topic filter set to: ${state.userContext.selectedTopic ?? 'All'} (Active Set unchanged, by design)`);
        break;
      case 'help':
        printHelp();
        break;
      case 'quit':
        rl.close();
        return;
      default:
        console.log(`Unknown command: ${cmd}`);
    }

    printActiveSet(state);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nVertical slice session ended.');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Vertical slice failed:', err);
  process.exit(1);
});
