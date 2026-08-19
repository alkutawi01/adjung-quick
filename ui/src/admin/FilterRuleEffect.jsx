// FilterRuleEffect.jsx — Admin Console V2, "Tapisan" real-impact panel.
//
// Per ChatGPT's Find & Replace mental model: an admin must see what a
// rule actually DOES against real stories, not just that the rule
// exists. Renders fetchEditorialFilterEffect()'s per-exclude-rule
// aggregate. All counts/titles are real data or an honest empty/error
// state -- never a placeholder number.
//
// EXCEPT is global in the real resolver (state/editorialFilterResolver.mjs),
// not paired to one specific exclude rule -- the note below says so
// plainly rather than implying a pairing the data model doesn't have.
export default function FilterRuleEffect({ effects, error }) {
  if (error) {
    return <p className="review-queue__error">Ralat memuatkan kesan tapisan: {error}</p>;
  }
  if (effects === null) {
    return <p className="admin-app__status">Memuatkan kesan sebenar...</p>;
  }
  if (effects.length === 0) {
    return <p className="review-queue__empty">Tiada tapisan aktif buat masa ini, jadi tiada kesan untuk ditunjukkan.</p>;
  }

  return (
    <div className="filter-effect">
      <p className="filter-effect__note">
        Pengecualian (&ldquo;Kecuali jika&rdquo;) terpakai kepada SEMUA tapisan aktif, bukan
        pasangan khusus satu-satu -- kalau mana-mana pengecualian sepadan, berita itu kekal
        dipaparkan tanpa mengira tapisan mana yang termatuh.
      </p>
      {effects.map(effect => (
        <div key={effect.ruleId} className="filter-effect__card">
          <p className="filter-effect__rule">
            JIKA tajuk/huraian ada <b>&ldquo;{effect.phrase}&rdquo;</b> <span className="arrow">&rarr;</span> MAKA tapis
          </p>
          <p className="filter-effect__summary">
            Kesan semasa: <b>{effect.matchedCount}</b> berita sepadan &middot; <b>{effect.filteredCount}</b> ditapis
            {effect.exceptedCount > 0 && <> &middot; <b>{effect.exceptedCount}</b> dikecualikan</>}
          </p>
          {effect.sampleFiltered.length > 0 && (
            <ul className="filter-effect__list">
              {effect.sampleFiltered.map(s => (
                <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--filtered">Ditapis</span> {s.title} <span className="filter-effect__meta">({s.sourceName})</span></li>
              ))}
            </ul>
          )}
          {effect.sampleExcepted.length > 0 && (
            <ul className="filter-effect__list">
              {effect.sampleExcepted.map(s => (
                <li key={s.storyId}><span className="filter-effect__tag filter-effect__tag--excepted">Dikecualikan</span> {s.title} <span className="filter-effect__meta">({s.sourceName}, oleh &ldquo;{s.savedByPhrase}&rdquo;)</span></li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
