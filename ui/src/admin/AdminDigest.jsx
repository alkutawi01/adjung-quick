// AdminDigest.jsx — FASA 3.6.4. Per docs/admin-digest-implementation-plan-v1.md.
//
// Answers Izzat's own constraint ("saya sibuk untuk pantau kerja awak
// satu-satu") by flipping who does the looking: instead of the admin
// hunting for problems, the system states what matters. Read-only — it
// creates no editorial state, so it needs no confirm/reason flow.

export default function AdminDigest({ digest, error, onOpenQueue }) {
  if (error) {
    return (
      <section className="digest">
        <p className="digest__error">Laporan tidak dapat dimuatkan: {error}</p>
      </section>
    );
  }
  if (!digest) {
    return (
      <section className="digest">
        <p className="digest__loading">Menyediakan laporan...</p>
      </section>
    );
  }

  const {
    processed, needsAttention, noActionNeeded, actionsToday,
    hasYesterdayComparison, failedSourcesToday, activeOverridesToday, trend,
  } = digest;
  const allClear = needsAttention === 0 && actionsToday.length === 0;

  return (
    <section className="digest">
      <h2 className="digest__title">Laporan Hari Ini</h2>

      {/* Zero state stated explicitly, per the plan §2: silence must read
          as a confident answer, never an ambiguous blank panel. */}
      {allClear ? (
        <p className="digest__clear">Tiada apa-apa perlu perhatian hari ini.</p>
      ) : null}

      <dl className="digest__rows">
        <div className="digest__row">
          <dt>Berita diproses</dt>
          <dd>{processed}{trend.storiesProcessed}</dd>
        </div>

        {needsAttention > 0 && (
          <div className="digest__row digest__row--attention">
            <dt>Perlu perhatian</dt>
            <dd>
              {needsAttention} berita belum pasti bidang{trend.reviewQueue}
              {/* A digest that reports a problem without a route to fix it
                  just relocates the hunting — plan §2. */}
              <button type="button" className="digest__action" onClick={onOpenQueue}>
                Buka Senarai Semakan
              </button>
            </dd>
          </div>
        )}

        {/* FASA 4.1.3 — only shown once today's snapshot exists
            (daily-observation.mjs has run today); before that there is no
            "today" number to show at all, per ChatGPT's explicit guard
            against Digest computing these itself. */}
        {failedSourcesToday !== null && (
          <div className="digest__row">
            <dt>Sumber gagal</dt>
            <dd>{failedSourcesToday} sumber{trend.failedSources}</dd>
          </div>
        )}

        {activeOverridesToday !== null && (
          <div className="digest__row">
            <dt>Keputusan editorial aktif</dt>
            <dd>{activeOverridesToday} keputusan editorial sedang aktif{trend.activeOverrides}</dd>
          </div>
        )}

        {actionsToday.length > 0 && (
          <div className="digest__row">
            <dt>Perubahan editorial hari ini</dt>
            <dd>
              <ul className="digest__list">
                {actionsToday.map(line => <li key={line}>{line}</li>)}
              </ul>
            </dd>
          </div>
        )}

        <div className="digest__row digest__row--quiet">
          <dt>Tiada tindakan diperlukan</dt>
          <dd>{noActionNeeded} berita</dd>
        </div>

        {!hasYesterdayComparison && (
          <p className="digest__note">Belum ada perbandingan semalam.</p>
        )}
      </dl>
    </section>
  );
}
