// AdminDigest.jsx — FASA 3.6.4. Per docs/admin-digest-implementation-plan-v1.md.
//
// Answers Izzat's own constraint ("saya sibuk untuk pantau kerja awak
// satu-satu") by flipping who does the looking: instead of the admin
// hunting for problems, the system states what matters. Read-only — it
// creates no editorial state, so it needs no confirm/reason flow.

// Polish 9D-3: no established severity threshold exists for "how stale is
// too stale" (this project's own UI/UX-decisions-need-approval discipline
// -- inventing one unprompted would be exactly that mistake), so this is
// deliberately informational only: plain relative time, no attention
// styling, never suppresses the all-clear banner. If Izzat/the director
// later want a threshold-based warning, that's a real product decision
// for them to make, not something to guess at here.
function formatRelativeTime(isoString) {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'kurang daripada sejam lalu';
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export default function AdminDigest({ digest, error, classificationBacklog, classificationBacklogError, oldGenerationStatus, oldGenerationStatusError, latestIngestion, latestIngestionError, onOpenQueue }) {
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
        <p className="digest__loading">Menyediakan laporan…</p>
      </section>
    );
  }

  const {
    processed, needsAttention, noActionNeeded, actionsToday,
    hasYesterdayComparison, failedSourcesToday, activeOverridesToday, trend,
  } = digest;
  // P0-B (docs/p0-classification-backlog-incident-v1.md): a story with no
  // classification row at all is invisible to every reader, not merely
  // "needs a decision" like the review queue -- a nonzero backlog belongs
  // in the same "not actually all clear" bucket as needsAttention, or this
  // panel would say "Tiada apa-apa perlu perhatian" while hundreds of
  // stories are silently missing. `classificationBacklog` is optional
  // (null while its own best-effort fetch is still in flight) -- absence
  // must never itself read as "backlog is zero".
  //
  // classificationBacklogError is a SEPARATE, terminal state from "still
  // loading" (an adversarial review caught the first version conflating
  // the two): if the fetch genuinely failed, this panel does not know
  // whether there is a backlog, so it must not claim all-clear either --
  // "unverified" is not the same fact as "verified zero".
  const backlogCount = classificationBacklog?.backlogCount ?? 0;
  // Polish 9D-2 (docs/polish-9-audit-v1.md, risk #2): same "must never
  // silently read as all-clear while unverified" discipline as
  // classificationBacklog above — a stale *_old generation blocks the
  // NEXT ingestion attempt, so this panel staying quiet about it would
  // reproduce the exact blind spot this whole indicator exists to close.
  const oldGenerationExists = oldGenerationStatus?.oldGenerationExists ?? false;
  // Polish 9D-3: latestIngestion itself deliberately does NOT gate
  // allClear (no approved staleness threshold exists to judge "too old"
  // against — see formatRelativeTime's comment), but a fetch ERROR is a
  // different fact from "content is stale": it means this panel cannot
  // verify the claim at all, same "unverified is not verified-fine"
  // discipline as the two indicators above.
  const allClear = needsAttention === 0 && actionsToday.length === 0 && backlogCount === 0
    && !classificationBacklogError && !oldGenerationExists && !oldGenerationStatusError
    && !latestIngestionError;

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
              {needsAttention} berita belum pasti kategori{trend.reviewQueue}
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
        {/* P0-B: standing health check, not an edition-scoped "today"
            number like the rows below -- see fetchClassificationBacklog()'s
            own header for why this counts a cluster missing from EVERY
            edition, not just the active one. Hidden only while its own
            best-effort fetch hasn't resolved yet (classificationBacklog
            starts null); a 0 is a real, verified zero, never a stand-in for
            "not loaded". */}
        {classificationBacklogError ? (
          <div className="digest__row digest__row--attention">
            <dt>Klasifikasi tertunggak</dt>
            <dd>Tidak dapat disahkan: {classificationBacklogError}</dd>
          </div>
        ) : classificationBacklog !== null && (
          <div className={`digest__row${backlogCount > 0 ? ' digest__row--attention' : ''}`}>
            <dt>Klasifikasi tertunggak</dt>
            <dd>
              {backlogCount === 0
                ? '0'
                : `${backlogCount} berita belum melalui pengelasan`}
            </dd>
          </div>
        )}

        {/* Polish 9D-2: proactive warning, not auto-fixed — a stale *_old
            generation is normal between ingestions (every successful swap
            leaves one behind on purpose, as a rollback safety net) and
            only becomes a problem at the NEXT ingestion attempt. Surfacing
            it here lets an editor run the cleanup ahead of time instead of
            discovering it as a failed ingestion. */}
        {oldGenerationStatusError ? (
          <div className="digest__row digest__row--attention">
            <dt>Generasi lama (_old)</dt>
            <dd>Tidak dapat disahkan: {oldGenerationStatusError}</dd>
          </div>
        ) : oldGenerationStatus !== null && (
          <div className={`digest__row${oldGenerationExists ? ' digest__row--attention' : ''}`}>
            <dt>Generasi lama (_old)</dt>
            <dd>
              {oldGenerationExists
                ? 'Wujud — pembersihan diperlukan sebelum kandungan baharu boleh dimasukkan'
                : 'Tiada'}
            </dd>
          </div>
        )}

        {/* Polish 9D-3 (docs/polish-9-audit-v1.md): the one gap the
            director flagged as still genuinely open -- if content-fetching
            itself silently stops being run, nothing anywhere previously
            told an editor. Purely informational (see formatRelativeTime's
            own comment for why this deliberately has no severity
            threshold yet). */}
        {latestIngestionError ? (
          <div className="digest__row digest__row--attention">
            <dt>Kandungan terbaharu</dt>
            <dd>Tidak dapat disahkan: {latestIngestionError}</dd>
          </div>
        ) : latestIngestion !== null && (
          <div className="digest__row">
            <dt>Kandungan terbaharu</dt>
            <dd>
              {formatRelativeTime(latestIngestion.latestFetchedAt) ?? 'Belum ada kandungan'}
            </dd>
          </div>
        )}

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
