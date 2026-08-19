// editorialFilterResolver.mjs — Editorial Filter Rules V1. Per
// docs/editorial-filter-rules-design-v1.md, approved by ChatGPT
// 2026-08-16.
//
// Pure function only — no I/O, no Supabase client. Deterministic
// keyword/phrase EXCLUDE/EXCEPT matching against a story's own
// title+description text. This is an EDITORIAL FILTER, not a
// classifier — it decides whether a story is shown, never which field
// it belongs to. Never reads or writes story_overrides, never touches
// classification/ranking code.
//
// V1 precedence, first match wins (docs/editorial-filter-rules-design-v1.md §2):
//   1. except  -> story is KEPT regardless of any exclude match
//   2. exclude -> story is EXCLUDED
//   3. default -> no rule matched, story is KEPT
// "Explicit Keep" is a named, reserved future tier — not implemented here.
//
// Matching (Polish 5A.1, 2026-08-19 — BREAKING change from V1's original
// plain substring, per live production audit against the real 691-story
// corpus): word/token-BOUNDARY, still case-insensitive, still
// title+description, still zero fuzzy/AI/scoring. Substring matching was
// found to catastrophically false-positive on ordinary Malay/English
// words that merely CONTAIN a filter phrase — 'arak' inside 'semarak'/
// 'menyemarakkan', 'pub' inside 'Republic'/'public', found live, not
// hypothetical. This is NOT the same lesson content-rules.mjs's own
// header comment already flags -- that file's real implementation still
// uses plain .includes() too (checked, not copied from here). Tapisan
// hard-filters (hides from readers), a much higher blast radius for a
// false positive than a classifier's Tier-5 candidate signal, hence the
// stricter fix here specifically.
//
// Boundary uses Unicode letter/number/mark categories, not ASCII \b --
// Quick also processes Arabic (ar-global), where \b does not work
// correctly against non-Latin scripts. Same lookaround pattern already
// proven correct for this in IstilahGlosari.tsx's own Unicode boundary
// fix (see CLAUDE.md's "Medan borang terima sebarang glif Unicode" note).
// Phrases are regex-escaped before compiling — admins type plain text in
// the UI, never regex.
//
// Morphological variants are NOT implied: a rule for 'judi' does NOT
// also match 'perjudian' -- each form an editor wants filtered must be
// its own explicit rule row. Deliberate (ChatGPT's call): safer than
// re-introducing substring-style guessing under a different name.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBoundaryRegex(phrase) {
  const escaped = escapeRegExp(phrase);
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escaped}(?![\\p{L}\\p{N}\\p{M}])`, 'iu');
}

// Strips HTML tags (and everything inside their angle brackets, incl.
// attributes) before matching -- same real bug class content-rules.mjs
// already fixed once (an <img alt="..."> caption's unrelated text
// masquerading as real article content). Reader hands resolver raw
// row.description; markup must never be able to trigger or suppress a
// filter match.
function stripHtml(s) {
  return (s ?? '').replace(/<[^>]*>/g, ' ');
}

// rules: editorial_filter_rules rows already filtered by the caller to
// `active = true` (a query concern, not this function's — keeps this
// pure and trivially testable with hand-built arrays).
export function resolveEditorialFilter(text, rules) {
  const clean = stripHtml(text);

  const except = rules.find(r => r.rule_type === 'except' && buildBoundaryRegex(r.phrase).test(clean));
  if (except) {
    return { keep: true, reason: 'exception', ruleId: except.id, phrase: except.phrase };
  }

  const exclude = rules.find(r => r.rule_type === 'exclude' && buildBoundaryRegex(r.phrase).test(clean));
  if (exclude) {
    return { keep: false, reason: 'exclude', ruleId: exclude.id, phrase: exclude.phrase };
  }

  return { keep: true, reason: 'default', ruleId: null, phrase: null };
}

// Convenience for callers with a canonical rss_items row rather than a
// bare string — matches how resolveStoryField's callers already pass
// classifierOutput/canonical shapes.
export function resolveEditorialFilterForStory(canonical, rules) {
  const text = `${canonical?.title ?? ''} ${canonical?.description ?? ''}`;
  return resolveEditorialFilter(text, rules);
}
