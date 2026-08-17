import { useEffect, useState, useCallback } from 'react';
import { adminSupabase } from './adminSupabase.js';
import { getEditorRole, isEditor } from '../../../db/editor-auth.mjs';
import { fetchReviewQueue, fetchDigest, submitHideOverride, submitReclassifyOverride, fetchFilterRules, addFilterRule, setFilterRuleActive, deleteFilterRule } from './reviewQueueAdapter.js';
import AdminDigest from './AdminDigest.jsx';
import EditorialActivityTimeline from './EditorialActivityTimeline.jsx';
import { EDITION_IDS, getEdition, DEFAULT_EDITION_ID, loadEditionsFromDB } from '../../../state/editions.js';
import ReviewQueueCard from './ReviewQueueCard.jsx';
import FilterRulesManager from './FilterRulesManager.jsx';
import ClassificationFlow from './ClassificationFlow.jsx';
import ClassificationRulesList from './ClassificationRulesList.jsx';

// Editorial Desk shell — per docs/editorial-desk-shell-implementation-plan-v1.md.
// 'aliran' added 2026-08-16, direct response to Izzat's complaint that raw
// RSS-to-Bidang routing was invisible — a live table, not a report.
const DESK_SECTIONS = [
  { id: 'hari-ini', label: 'Hari Ini' },
  { id: 'semakan', label: 'Semakan' },
  { id: 'aliran', label: 'Aliran RSS' },
  { id: 'keputusan', label: 'Keputusan Editorial' },
  { id: 'peraturan', label: 'Peraturan Klasifikasi' },
  { id: 'rekod', label: 'Rekod' },
];

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
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState(null);
  // TEMPORARY DEBUG — REMOVE. Backend Control Plane Phase 3 (2026-08-17):
  // getEditorRole() fails closed and swallows the real Supabase
  // error/response (see db/editor-auth.mjs's own comment on why — a
  // correct, permanent design decision). This state exists ONLY to
  // surface that already-discarded info on the no-access screen for one
  // live debugging session (a real admin account got "Tiada akses admin"
  // despite a verified-correct DB record), since DevTools isn't available
  // on the reporting device. Never sanitizes/logs tokens or full
  // credentials — status/error code/message and row count only.
  const [debugInfo, setDebugInfo] = useState(null);

  // Backend Control Plane Phase 2 (2026-08-17): independent of the
  // auth-session effect below — Admin can be the only page loaded in a
  // browser tab, so this must not assume App.jsx's own
  // loadEditionsFromDB() call has already run in this session.
  useEffect(() => {
    loadEditionsFromDB(adminSupabase)
      .then(() => setTaxonomyReady(true))
      .catch(err => setTaxonomyError(err.message));
  }, []);

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
      // TEMPORARY DEBUG — REMOVE. Same query getEditorRole() runs
      // internally, but captured here WITHOUT the fail-closed swallow, so
      // the real status/error/row-count can be shown on-screen. Does not
      // feed into `role`/`isEditor()` — the actual access decision above
      // is completely unaffected by this block.
      adminSupabase.from('editors').select('role').eq('user_id', userId).then(({ data, error, status }) => {
        if (cancelled) return;
        setDebugInfo({
          status,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
          rowCount: data?.length ?? 0,
          roleValue: data?.[0]?.role ?? null,
        });
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session === undefined, userId]);

  // taxonomyError gates alongside taxonomyReady — a load failure must
  // stop the gate the same way a missing session already does, never
  // rendering a half-ready Admin page against fallback taxonomy.
  if (taxonomyError) {
    return <main className="admin-app"><p className="admin-app__status">Ralat memuatkan taksonomi: {taxonomyError}</p></main>;
  }

  if (!taxonomyReady || session === undefined || (userId && !roleChecked)) {
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
        {/* TEMPORARY DEBUG — REMOVE. See debugInfo state comment above. */}
        {debugInfo && (
          <pre style={{ fontSize: '11px', padding: '8px', background: '#eee', margin: '12px', whiteSpace: 'pre-wrap' }}>
            {'[TEMPORARY DEBUG]\n'}
            {`status: ${debugInfo.status}\n`}
            {`errorCode: ${debugInfo.errorCode}\n`}
            {`errorMessage: ${debugInfo.errorMessage}\n`}
            {`rowCount: ${debugInfo.rowCount}\n`}
            {`roleValue: ${debugInfo.roleValue}`}
          </pre>
        )}
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
  const [activeSection, setActiveSection] = useState('hari-ini');
  const [filterRules, setFilterRules] = useState(null); // null = not loaded yet
  const [filterRulesError, setFilterRulesError] = useState(null);
  const [filterRulesBusy, setFilterRulesBusy] = useState(false);

  const loadFilterRules = useCallback(() => {
    setFilterRulesError(null);
    fetchFilterRules(adminSupabase)
      .then(setFilterRules)
      .catch(err => setFilterRulesError(err.message));
  }, []);

  // Lazy: only queried once the admin actually opens "Keputusan
  // Editorial" — not edition-scoped (V1 is global-only), so no need to
  // re-fetch on editionId changes, unlike the queue/digest above.
  useEffect(() => {
    if (activeSection === 'keputusan' && filterRules === null) loadFilterRules();
  }, [activeSection, filterRules, loadFilterRules]);

  const runFilterRuleAction = async action => {
    setFilterRulesBusy(true);
    try {
      await action();
      loadFilterRules();
    } catch (err) {
      setFilterRulesError(err.message);
    } finally {
      setFilterRulesBusy(false);
    }
  };

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

      <nav className="editorial-desk__nav">
        {DESK_SECTIONS.map(section => (
          <button
            key={section.id}
            type="button"
            className={`editorial-desk__nav-item${section.id === activeSection ? ' editorial-desk__nav-item--active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {activeSection === 'hari-ini' && (
        <section className="editorial-desk__section">
          <AdminDigest
            digest={digest}
            error={digestError}
            onOpenQueue={() => setActiveSection('semakan')}
          />
        </section>
      )}

      {activeSection === 'semakan' && (
        <section className="editorial-desk__section">
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
                onHide={reason => resolve(entry.storyId, () =>
                  submitHideOverride(adminSupabase, { storyId: entry.storyId, editionId, reason, createdBy: userId, role }))}
                onReclassify={(newField, reason) => resolve(entry.storyId, () =>
                  submitReclassifyOverride(adminSupabase, { storyId: entry.storyId, editionId, newField, reason, createdBy: userId, role }))}
              />
            ))}
          </div>
        </section>
      )}

      {activeSection === 'aliran' && (
        <section className="editorial-desk__section">
          <ClassificationFlow supabase={adminSupabase} editionId={editionId} />
        </section>
      )}

      {activeSection === 'keputusan' && (
        <section className="editorial-desk__section editorial-desk__keputusan">
          {/* Editorial Filter Rules V1 — the one REAL, wired-up card here,
              per docs/editorial-filter-rules-design-v1.md and ChatGPT's
              2026-08-16 instruction to build this before dropping *_old. */}
          {filterRulesError && <p className="review-queue__error">{filterRulesError}</p>}
          {filterRules === null && !filterRulesError && (
            <p className="admin-app__status">Memuatkan...</p>
          )}
          {filterRules !== null && (
            <FilterRulesManager
              rules={filterRules}
              busy={filterRulesBusy}
              onAdd={({ ruleType, phrase, reason }) => runFilterRuleAction(() =>
                addFilterRule(adminSupabase, { ruleType, phrase, reason, createdBy: userId, role }))}
              onToggle={(id, active) => runFilterRuleAction(() =>
                setFilterRuleActive(adminSupabase, id, active, role))}
              onDelete={id => runFilterRuleAction(() =>
                deleteFilterRule(adminSupabase, id, role))}
            />
          )}

          {/* Per docs/editorial-desk-shell-implementation-plan-v1.md §4: honest
              "belum tersedia" cards, never a button that looks clickable but
              fails. No interactive control here fires a real request. */}
          <article className="editorial-desk__placeholder-card">
            <h3 className="editorial-desk__placeholder-title">Pin</h3>
            <p className="editorial-desk__placeholder-desc">
              Belum tersedia. Pin akan membenarkan admin meletakkan berita
              tertentu di kedudukan tetap, walaupun sistem pemilihan berjalan
              seperti biasa.
            </p>
          </article>
          <article className="editorial-desk__placeholder-card">
            <h3 className="editorial-desk__placeholder-title">Boost</h3>
            <p className="editorial-desk__placeholder-desc">
              Belum tersedia di sini. Naikkan buat masa ini hanya beroperasi
              untuk bidang yang menggunakan enjin pemarkahan editorial, dan
              akan dipindahkan ke bahagian ini apabila permukaan sebenar dibina.
            </p>
          </article>
        </section>
      )}

      {activeSection === 'peraturan' && (
        <section className="editorial-desk__section">
          {/* Backend Control Plane Phase 3, Admin Read-Only V1. Mounted
              only when this section is active — the component's own
              useEffect fetches on mount, matching the lazy-load
              convention "keputusan" already uses for filterRules (there
              via a load-once flag, here via mount/unmount — same effect). */}
          <ClassificationRulesList supabase={adminSupabase} />
        </section>
      )}

      {activeSection === 'rekod' && (
        <section className="editorial-desk__section">
          <EditorialActivityTimeline editionId={editionId} />
        </section>
      )}
    </div>
  );
}
