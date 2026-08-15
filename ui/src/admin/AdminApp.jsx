import { useEffect, useState, useCallback } from 'react';
import { adminSupabase } from './adminSupabase.js';
import { getEditorRole, isEditor } from '../../../db/editor-auth.mjs';
import { fetchReviewQueue, fetchDigest, submitHideOverride, submitReclassifyOverride, submitBoostOverride } from './reviewQueueAdapter.js';
import AdminDigest from './AdminDigest.jsx';
import EditorialActivityTimeline from './EditorialActivityTimeline.jsx';
import { EDITION_IDS, getEdition, DEFAULT_EDITION_ID } from '../../../state/editions.js';
import { getRankingVersion } from '../../../state/rankingFlags.js';
import ReviewQueueCard from './ReviewQueueCard.jsx';

// AdminApp.jsx — Fasa 3.6.2 Review Queue. Per
// docs/review-queue-ui-implementation-plan-v1.md §5: reuses Supabase Auth
// exactly as a reader would (docs/admin-auth-spec-v1.md) — there is no
// separate admin login SYSTEM. There IS a login FORM here, because no
// reader-facing sign-in UI exists anywhere in the app yet
// (docs/editor-bootstrap-runbook-v1.md's own note) — this is the smallest
// form that can drive the shared auth backend, not a second auth system.
export default function AdminApp() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  const [role, setRole] = useState(null);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    adminSupabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = adminSupabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Keyed on the user ID (a primitive), NOT the session object. Fixed
  // 2026-08-13 after a real intermittent hang on "Memuatkan...":
  // onAuthStateChange fires repeatedly (INITIAL_SESSION, TOKEN_REFRESHED,
  // …) with a NEW session object each time but the same user. Keying on
  // the object re-ran this effect on every one of those, resetting
  // roleChecked to false — and supabase-js holds an internal auth lock
  // while that callback runs, so a query issued from the resulting render
  // could stall waiting for a lock the callback still held, leaving the UI
  // stuck on the loading state indefinitely. Keyed on userId, a token
  // refresh for the already-checked user is a no-op.
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (session === undefined) return; // still checking
    if (!userId) { setRole(null); setRoleChecked(true); return; }
    let cancelled = false;
    // Deferred out of the auth-callback call stack for the same
    // lock-contention reason above — per Supabase's own guidance not to
    // issue client calls from within an onAuthStateChange callback.
    const timer = setTimeout(() => {
      getEditorRole(adminSupabase, userId).then(r => {
        if (cancelled) return;
        setRole(r);
        setRoleChecked(true);
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session === undefined, userId]);

  if (session === undefined || (userId && !roleChecked)) {
    return <main className="admin-app"><p className="admin-app__status">Memuatkan...</p></main>;
  }

  if (session === null) {
    return <main className="admin-app"><SignInForm /></main>;
  }

  if (!isEditor(role)) {
    return (
      <main className="admin-app">
        <p className="admin-app__status">
          Tiada akses admin untuk akaun ini.
          <button type="button" className="admin-app__signout" onClick={() => adminSupabase.auth.signOut()}>
            Log keluar
          </button>
        </p>
      </main>
    );
  }

  return (
    <main className="admin-app">
      {/* `role` threaded through (2026-08-13, audit finding 1): it previously
          stopped here, so no descendant could gate on it even if it tried. */}
      <ReviewQueue userId={session.user.id} role={role} />
    </main>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await adminSupabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError(err.message);
  };

  return (
    <form className="admin-signin" onSubmit={submit}>
      <h1 className="admin-signin__title">Adjung Quick — Admin</h1>
      <label className="admin-signin__field">
        E-mel
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
      </label>
      <label className="admin-signin__field">
        Kata laluan
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      {error && <p className="admin-signin__error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Log masuk...' : 'Log masuk'}</button>
    </form>
  );
}

function ReviewQueue({ userId, role }) {
  const [editionId, setEditionId] = useState(DEFAULT_EDITION_ID);
  const [entries, setEntries] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(null);
  const [busyStoryId, setBusyStoryId] = useState(null);
  const [digest, setDigest] = useState(null);
  const [digestError, setDigestError] = useState(null);

  const load = useCallback(() => {
    setEntries(null);
    setLoadError(null);
    fetchReviewQueue(adminSupabase, editionId)
      .then(setEntries)
      .catch(err => setLoadError(err.message));
    // Loaded independently of the queue: a digest failure must never
    // block the queue itself (the queue is the surface that actually
    // lets an editor DO something), and vice versa.
    setDigest(null);
    setDigestError(null);
    fetchDigest(adminSupabase, editionId)
      .then(setDigest)
      .catch(err => setDigestError(err.message));
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (storyId, action) => {
    setBusyStoryId(storyId);
    try {
      await action();
      setEntries(prev => prev.filter(e => e.storyId !== storyId));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusyStoryId(null);
    }
  };

  const taxonomy = getEdition(editionId).taxonomy;

  return (
    <div className="review-queue">
      <div className="admin-app__masthead">
        <span className="admin-app__masthead-title">Senarai Semakan</span>
        <button type="button" className="admin-app__signout" onClick={() => adminSupabase.auth.signOut()}>
          Log keluar
        </button>
      </div>

      <div className="edition-switcher">
        {EDITION_IDS.map(id => (
          <button
            key={id}
            type="button"
            className={`edition-switcher__option${id === editionId ? ' edition-switcher__option--active' : ''}`}
            onClick={() => setEditionId(id)}
          >
            {getEdition(id).label}
          </button>
        ))}
      </div>

      <AdminDigest
        digest={digest}
        error={digestError}
        onOpenQueue={() => document.querySelector('.review-queue__list')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {loadError && <p className="review-queue__error">{loadError}</p>}
      {entries === null && !loadError && <p className="admin-app__status">Memuatkan...</p>}
      {entries !== null && entries.length === 0 && (
        <p className="review-queue__empty">Tiada berita perlu semakan buat masa ini.</p>
      )}

      <div className="review-queue__list">
        {entries?.map(entry => (
          <ReviewQueueCard
            key={entry.storyId}
            entry={entry}
            taxonomy={taxonomy}
            busy={busyStoryId === entry.storyId}
            // FASA 3.6.3c / Option A: Boost is offered ONLY where the
            // Editorial Ranking Engine is actually active, because that is
            // the only pipeline that reads a boost signal. Offering it
            // elsewhere would store a real decision that silently does
            // nothing — per ChatGPT: "jangan bina UI yang menjanjikan kuasa
            // yang backend sebenarnya tidak miliki."
            //
            // NOTE (ChatGPT's 3.6.3c closing decision): the Review Queue is
            // NOT Boost's long-term home — this queue surfaces stories with
            // classification PROBLEMS, while boost applies to correctly
            // classified ones. A dedicated boost surface is deferred to a
            // later phase; this gate stays correct in the meantime.
            boostAvailable={Boolean(entry.field) && getRankingVersion(editionId, entry.field) === 'editorial_v1'}
            onHide={reason => resolve(entry.storyId, () =>
              submitHideOverride(adminSupabase, { storyId: entry.storyId, editionId, reason, createdBy: userId, role }))}
            onReclassify={(newField, reason) => resolve(entry.storyId, () =>
              submitReclassifyOverride(adminSupabase, { storyId: entry.storyId, editionId, newField, reason, createdBy: userId, role }))}
            onBoost={reason => resolve(entry.storyId, () =>
              submitBoostOverride(adminSupabase, { storyId: entry.storyId, editionId, reason, createdBy: userId, role }))}
          />
        ))}
      </div>

      <EditorialActivityTimeline editionId={editionId} />
    </div>
  );
}
