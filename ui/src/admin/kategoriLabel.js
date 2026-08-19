// kategoriLabel.js — shared "what Kategori does this resolve to?" helper
// for the Admin Console.
//
// Polish 2/5 (2026-08-19). Created after a LIVE audit of every
// sources.known_category value in production found that the UI had been
// presenting that column as if it were a taxonomy field, which it is
// NOT. Per ChatGPT's Polish 2 finding (independently confirmed here
// against real data):
//
//   known_category is an EVIDENCE/desk token registered on a feed. The
//   taxonomy's field_code is a different vocabulary. They overlap only
//   by coincidence.
//
// Live audit result (30 sources with a value set, 2026-08-19):
//   A. resolves as a field_code directly ....... bisnes, dunia        (5 sources)
//   B. resolves via vocabulary -> subject -> field ................. (23 sources)
//        agama, ekonomi, gaya hidup, hiburan, jenayah, pendidikan,
//        politik, sains, sukan, teknologi
//   C. does not resolve at all .................. malaysia            (2 sources)
//        RTM — Berita Nasional, Astro Awani — Nasional
//
// Group C ('malaysia') resolved 2026-08-19 by Izzat's own explanation of
// the design intent, which corrects an earlier reading of mine:
//
//   The Subject/Geography split exists mainly to serve the ENGLISH
//   edition, which must separate global stories from Malaysia-relevant
//   ones. In ms-MY that distinction carries no extra meaning -- a Malay
//   reader is by definition Malaysia-connected -- so tagging a ms-MY feed
//   "malaysia" adds nothing beyond "this is domestic/national news".
//
// That is consistent with the taxonomy itself: ms-MY's `nasional` field is
// declared with `subject_codes: null` precisely BECAUSE it is not reached
// through any subject -- it is the geography-derived field. So mapping a
// Malaysia-geography token to Nasional for ms-MY is the designed path, not
// a cross-axis guess (my earlier concern).
//
// Handled at DISPLAY level only -- sources.known_category keeps the raw
// 'malaysia' token, which the edition rules still read as real geography
// evidence (e.g. "Politik luar Malaysia -> Dunia" needs it). Rewriting the
// stored value would destroy that evidence to fix a label.

import { getFieldLabel, getEdition } from '../../../state/editions.js';
import { SUBJECT_VOCABULARY, GEOGRAPHY_VOCABULARY } from '../../../classification/lib/desk-vocabulary.mjs';
import { getFieldEntryForSubject } from '../../../classification/lib/taxonomy-registry.mjs';

// Editions where a Malaysia-geography signal collapses into the domestic
// news field rather than staying a separate axis (see the note above).
// Keyed by edition so en-global/ar-global keep the distinction they
// genuinely need.
const DOMESTIC_GEOGRAPHY_FIELD = { 'ms-MY': { geography: 'Malaysia', fieldCode: 'nasional' } };

// Returns { label, resolved } — `resolved: false` means the token could
// not be mapped to any Kategori, and callers must show the
// needs-review wording rather than leaking the raw token to the editor.
export function resolveKnownCategory(editionId, knownCategory) {
  if (!knownCategory) {
    return { label: 'Umum (ditentukan melalui petunjuk berita)', resolved: true };
  }

  // A: already a real field_code for this edition.
  if (getEdition(editionId).taxonomyFieldCodes.includes(knownCategory)) {
    return { label: getFieldLabel(editionId, knownCategory), resolved: true };
  }

  // B: an evidence token the classifier's own vocabulary knows ->
  // Universal Subject -> this edition's field.
  const subject = SUBJECT_VOCABULARY[knownCategory];
  if (subject) {
    const entry = getFieldEntryForSubject(editionId, subject);
    if (entry) return { label: entry.label, resolved: true };
  }

  // C: a GEOGRAPHY token. For editions where domestic geography is not a
  // separate axis (ms-MY), this is the national-news field. Covers
  // 'malaysia', and equally 'nasional'/'negara' which the geography
  // vocabulary maps to the same value.
  const domestic = DOMESTIC_GEOGRAPHY_FIELD[editionId];
  if (domestic && GEOGRAPHY_VOCABULARY[knownCategory] === domestic.geography) {
    return { label: getFieldLabel(editionId, domestic.fieldCode), resolved: true };
  }

  // D: genuinely unresolvable. Never show the raw token.
  return { label: 'Perlu semakan', resolved: false };
}

// Subject/field code coming off a classification_rules row (which may
// carry either shape depending on rule scope).
export function resolveRuleTarget(editionId, { fieldCode, subjectCode }) {
  if (fieldCode) return getFieldLabel(editionId, fieldCode);
  if (subjectCode) return getFieldEntryForSubject(editionId, subjectCode)?.label ?? subjectCode;
  return null;
}
