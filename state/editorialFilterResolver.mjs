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
// Matching: case-insensitive substring, against `title + ' ' + description`,
// no fuzzy matching, no AI, no scoring.

// rules: editorial_filter_rules rows already filtered by the caller to
// `active = true` (a query concern, not this function's — keeps this
// pure and trivially testable with hand-built arrays).
export function resolveEditorialFilter(text, rules) {
  const lower = (text ?? '').toLowerCase();

  const except = rules.find(r => r.rule_type === 'except' && lower.includes(r.phrase.toLowerCase()));
  if (except) {
    return { keep: true, reason: 'exception', ruleId: except.id, phrase: except.phrase };
  }

  const exclude = rules.find(r => r.rule_type === 'exclude' && lower.includes(r.phrase.toLowerCase()));
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
