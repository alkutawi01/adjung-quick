// actions.js — Action Contract for Adjung Quick.
//
// This is the ONLY vocabulary keyboard, touch, and mouse are allowed to speak.
// Per Master Spec L-012/MVP Contract §9: "Jangan bina keyboard logic, touch
// logic, mouse logic sebagai tiga sistem berlainan." Every input device maps
// to these same action types — see input-map.js for the (still-OPEN, UI-phase)
// device→action mapping. This file defines WHAT can happen, not HOW a key or
// gesture triggers it.

export const ActionTypes = Object.freeze({
  SELECT_TOPIC: 'SELECT_TOPIC',
  SELECT_STORY: 'SELECT_STORY',       // move focus/highlight, does NOT open Brief
  OPEN_BRIEF: 'OPEN_BRIEF',
  CLOSE_BRIEF: 'CLOSE_BRIEF',
  GO_BACK: 'GO_BACK',                 // alias-able to CLOSE_BRIEF depending on context — see reducer

  RELEASE_STORY: 'RELEASE_STORY',     // the ONLY way (besides language switch) a slot opens

  // DEPRECATED as a combined concept, per docs/edition-state-model.md —
  // SWITCH_LANGUAGE currently conflates two separate things (which
  // edition am I reading vs which representation language do I prefer
  // for a given story). Kept working for now (Step 3 is additive; the
  // reducer case is unchanged) so nothing breaks mid-migration.
  SWITCH_LANGUAGE: 'SWITCH_LANGUAGE',

  // The two actions SWITCH_LANGUAGE splits into. Added Step 3, not yet
  // wired into the reducer (Step 4).
  SWITCH_EDITION: 'SWITCH_EDITION',                       // changes editionContext.activeEdition; re-resolves Wheel taxonomy, selectedField, Active Set
  SET_REPRESENTATION_PREFERENCE: 'SET_REPRESENTATION_PREFERENCE', // changes preferred representation-language ORDER only; must NOT rebuild the Active Set

  // Editorial Control — single-editor only, per L-018/L-019/L-020/L-021.
  PIN_STORY: 'PIN_STORY',
  PRIORITIZE_STORY: 'PRIORITIZE_STORY',
  REMOVE_STORY: 'REMOVE_STORY',
});

export function selectTopic(topic) {
  return { type: ActionTypes.SELECT_TOPIC, topic };
}
export function selectStory(storyId) {
  return { type: ActionTypes.SELECT_STORY, storyId };
}
export function openBrief(storyId) {
  return { type: ActionTypes.OPEN_BRIEF, storyId };
}
export function closeBrief() {
  return { type: ActionTypes.CLOSE_BRIEF };
}
export function goBack() {
  return { type: ActionTypes.GO_BACK };
}
export function releaseStory(storyId) {
  return { type: ActionTypes.RELEASE_STORY, storyId };
}
export function switchLanguage(selectedLanguages) {
  return { type: ActionTypes.SWITCH_LANGUAGE, selectedLanguages };
}
export function switchEdition(editionId) {
  return { type: ActionTypes.SWITCH_EDITION, editionId };
}
export function setRepresentationPreference(representationPreference) {
  return { type: ActionTypes.SET_REPRESENTATION_PREFERENCE, representationPreference };
}
export function pinStory(storyId) {
  return { type: ActionTypes.PIN_STORY, storyId };
}
export function prioritizeStory(storyId) {
  return { type: ActionTypes.PRIORITIZE_STORY, storyId };
}
export function removeStory(storyId) {
  return { type: ActionTypes.REMOVE_STORY, storyId };
}
