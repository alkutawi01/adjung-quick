import { useEffect, useState, useCallback } from 'react';
import { adminSupabase } from './adminSupabase.js';
import { getEditorRole, isEditor } from '../../../db/editor-auth.mjs';
import { fetchReviewQueue, fetchDigest, fetchClassificationBacklog, fetchOldGenerationStatus, fetchLatestIngestionTime, submitHideOverride, submitReclassifyOverride, submitPinOverride, deactivateOverride, fetchFilterRules, addFilterRule, setFilterRuleActive, deleteFilterRule, fetchEditorialFilterEffect } from './reviewQueueAdapter.js';
import FilterRuleEffect from './FilterRuleEffect.jsx';
import AdminDigest from './AdminDigest.jsx';
import EditorialActivityTimeline from './EditorialActivityTimeline.jsx';
import { EDITION_IDS, getEdition, DEFAULT_EDITION_ID, loadEditionsFromDB } from '../../../state/editions.js';
import ReviewQueueCard from './ReviewQueueCard.jsx';
import FilterRulesManager from './FilterRulesManager.jsx';
import ClassificationFlow from './ClassificationFlow.jsx';
import { fetchEditionRules, addEditionRule, archiveEditionRule, restoreEditionRule } from './editionRulesAdapter.js';
import SourceRegistryPanel from './SourceRegistryPanel.jsx';
import { PemetaanSumberPage, PetunjukRssUrlPage, FeedCampuranPage, SemuaPelarasanPage, PenempatanBeritaPage } from './BidangPanel.jsx';
import NilaiSusunanPanel from './NilaiSusunanPanel.jsx';
import AllStoriesPanel from './AllStoriesPanel.jsx';
import TapisanPanel from './TapisanPanel.jsx';
import AdminShell from './AdminShell.jsx';
import { DEFAULT_PATH, resolvePage, resolveRedirect, navigate as routerNavigate } from './adminRouter.js';

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
  // 2026-08-13 after a real intermittent hang on "Memuatkan…":
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

  // taxonomyError gates alongside taxonomyReady — a load failure must
  // stop the gate the same way a missing session already does, never
  // rendering a half-ready Admin page against fallback taxonomy.
  if (taxonomyError) {
    return <main className="admin-app"><p className="admin-app__status">Ralat memuatkan taksonomi: {taxonomyError}</p></main>;
  }

  if (!taxonomyReady || session === undefined || (userId && !roleChecked)) {
    return <main className="admin-app"><p className="admin-app__status">Memuatkan…</p></main>;
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
      <button type="submit" disabled={busy}>{busy ? 'Log masuk…' : 'Log masuk'}</button>
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
  const [classificationBacklog, setClassificationBacklog] = useState(null);
  const [classificationBacklogError, setClassificationBacklogError] = useState(null);
  const [oldGenerationStatus, setOldGenerationStatus] = useState(null);
  const [oldGenerationStatusError, setOldGenerationStatusError] = useState(null);
  const [latestIngestion, setLatestIngestion] = useState(null);
  const [latestIngestionError, setLatestIngestionError] = useState(null);
  // Polish 4A (2026-08-19): navigasi kini berasaskan URL sebenar (History
  // API, ui/src/admin/adminRouter.js) -- bukan lagi activeGroup/
  // activeSection/nilaiTab tiga lapisan berasingan. `pathname` diselaraskan
  // dengan window.location melalui popstate (juga menangkap Back/Forward
  // pelayar); activePage diselesaikan daripada PAGES, jatuh balik ke
  // DEFAULT_PATH (redirect senyap, replaceState) bila laluan tak dikenali.
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activePage = resolvePage(pathname);

  useEffect(() => {
    if (!activePage) {
      const target = resolveRedirect(pathname) ?? DEFAULT_PATH;
      window.history.replaceState({}, '', target);
      setPathname(target);
    }
  }, [pathname, activePage]);

  const goTo = path => {
    routerNavigate(path);
    setPathname(path);
  };

  const activeGroup = activePage?.group ?? 'berita';
  const activeSection = activePage?.id;

  const [filterRules, setFilterRules] = useState(null); // null = not loaded yet
  const [filterRulesError, setFilterRulesError] = useState(null);
  const [filterRulesBusy, setFilterRulesBusy] = useState(false);
  const [filterEffect, setFilterEffect] = useState(null); // null = not loaded yet
  const [filterEffectError, setFilterEffectError] = useState(null);
  const [editionRules, setEditionRules] = useState(null); // null = not loaded yet
  const [editionRulesError, setEditionRulesError] = useState(null);
  const [editionRulesBusy, setEditionRulesBusy] = useState(false);

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
    if (activeGroup === 'tapisan' && filterRules === null) loadFilterRules();
  }, [activeGroup, filterRules, loadFilterRules]);

  // Real filter impact (Admin Console V2) -- reload whenever filterRules
  // itself reloads (e.g. after add/toggle/delete), so "Kesan semasa" never
  // shows stale counts against the rule list just edited above it.
  useEffect(() => {
    if (activeGroup !== 'tapisan') return;
    setFilterEffect(null);
    setFilterEffectError(null);
    fetchEditorialFilterEffect(adminSupabase)
      .then(setFilterEffect)
      .catch(err => setFilterEffectError(err.message));
  }, [activeGroup, filterRules]);

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

  // Returns the promise (Polish 8E): runEditionRuleAction below must be able
  // to AWAIT the refetch before clearing `busy`, or the form is re-enabled
  // while `editionRules` is still the stale pre-write array.
  const loadEditionRules = useCallback(() => {
    setEditionRulesError(null);
    return fetchEditionRules(adminSupabase, editionId)
      .then(setEditionRules)
      .catch(err => setEditionRulesError(err.message));
  }, [editionId]);

  // Edition-scoped (unlike filterRules) — reloads whenever the admin
  // switches edition while this section is open, not just on first open.
  // Scoped to the one page that actually needs it (Penempatan Berita),
  // not the whole 'kategori' group -- Polish 4A split what used to be one
  // combined "bidang" section into 5 separate pages.
  useEffect(() => {
    if (activeSection === 'penempatan' && editionId === 'ms-MY') loadEditionRules();
  }, [activeSection, editionId, loadEditionRules]);

  const runEditionRuleAction = async action => {
    setEditionRulesBusy(true);
    try {
      await action();
      // AWAITED, not fire-and-forget (Polish 8E). The new rule's priority is
      // computed client-side as max(existing)+1, so re-enabling the form
      // before the refetch lands lets a quick second "+ Tambah" read the
      // stale array and pick the SAME number. A top-priority tie makes the
      // resolver discard both rules and fall back to the built-in default --
      // the exact K2 failure this release fixes, reintroduced by a race.
      await loadEditionRules();
    } catch (err) {
      setEditionRulesError(err.message);
    } finally {
      setEditionRulesBusy(false);
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

  // P0-B backlog warning indicator: fetched ONCE, not per editionId switch
  // — unlike digest, this is a global system-health fact (classify-
  // production.js either ran across every edition or it didn't), not a
  // per-edition number.
  //
  // A fetch FAILURE must never block Ringkasan itself, but adversarial
  // review caught the first version of this treating "still loading" and
  // "permanently failed" as the same state (classificationBacklog staying
  // null forever, swallowed to console.warn only) -- which reproduces the
  // exact shape of the P0 incident THIS indicator exists to catch: a
  // silent gap nobody sees, inside the panel built to surface silent gaps.
  // classificationBacklogError makes the terminal-failure case visible in
  // the UI (AdminDigest.jsx), distinct from the transient-loading case
  // (classificationBacklog still null, error still null).
  useEffect(() => {
    fetchClassificationBacklog(adminSupabase)
      .then(setClassificationBacklog)
      .catch(err => { console.warn('fetchClassificationBacklog:', err.message); setClassificationBacklogError(err.message); });
  }, []);

  // Polish 9D-2: same posture as classificationBacklog above — a global
  // system-health fact (not edition-scoped), fetched once, and a fetch
  // FAILURE must render as its own visible "unverified" state, never
  // silently collapse into "still loading" or "no old generation".
  useEffect(() => {
    fetchOldGenerationStatus(adminSupabase)
      .then(setOldGenerationStatus)
      .catch(err => { console.warn('fetchOldGenerationStatus:', err.message); setOldGenerationStatusError(err.message); });
  }, []);

  // Polish 9D-3: same posture as the two indicators above -- a global
  // fact, fetched once, error state distinct from loading.
  useEffect(() => {
    fetchLatestIngestionTime(adminSupabase)
      .then(setLatestIngestion)
      .catch(err => { console.warn('fetchLatestIngestionTime:', err.message); setLatestIngestionError(err.message); });
  }, []);

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

  // Boost/Pin are promotional, not corrective (same distinction
  // reviewQueueAdapter.js's fetchReviewQueue draws) -- the story stays in
  // Semakan afterwards, so unlike resolve() above this re-fetches the
  // queue to pick up the new/removed override id rather than filtering
  // the entry out. Simpler than hand-patching entry.boostOverrideId/pin
  // locally, and guarantees the card reflects what the database actually
  // has (e.g. the 2-pin-per-field governance limit enforced server-side).
  const applyPromo = async (storyId, action) => {
    setBusyStoryId(storyId);
    try {
      await action();
      load();
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusyStoryId(null);
    }
  };

  const taxonomy = getEdition(editionId).taxonomy;

  const editionSwitcher = (
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
  );

  return (
    <AdminShell
      activePage={activePage}
      onNavigate={goTo}
      editionSwitcher={editionSwitcher}
      onSignOut={() => adminSupabase.auth.signOut()}
    >
      {activeGroup === 'berita' && (
        <>
          {activeSection === 'ringkasan' && (
            <AdminDigest
              digest={digest}
              error={digestError}
              classificationBacklog={classificationBacklog}
              classificationBacklogError={classificationBacklogError}
              oldGenerationStatus={oldGenerationStatus}
              oldGenerationStatusError={oldGenerationStatusError}
              latestIngestion={latestIngestion}
              latestIngestionError={latestIngestionError}
              onOpenQueue={() => goTo('/admin/berita/semakan')}
            />
          )}

          {/* Pusingan 8/15: Perlu Semakan is no longer a separate card
              experience — it opens the SAME AllStoriesPanel table,
              pre-filtered. entries/loadError/busyStoryId/resolve/applyPromo
              and the ReviewQueueCard import below are now orphaned by this
              change (kept, not deleted, per ChatGPT's explicit instruction
              not to refactor/remove aggressively) — `load()` still sets
              `entries` as a side effect of fetching `digest` in the same
              call, and AdminDigest (Ringkasan tab) still depends on that
              digest fetch, so this callback is left exactly as-is. */}
          {activeSection === 'semakan' && (
            <AllStoriesPanel supabase={adminSupabase} editionId={editionId} role={role} userId={userId} taxonomy={taxonomy} presetStatusFilter="Perlu semakan" />
          )}

          {activeSection === 'semua-berita' && (
            <AllStoriesPanel supabase={adminSupabase} editionId={editionId} role={role} userId={userId} taxonomy={taxonomy} presetStatusFilter="all" />
          )}

          {activeSection === 'aliran' && (
            <ClassificationFlow supabase={adminSupabase} editionId={editionId} />
          )}

          {activeSection === 'rekod' && (
            <EditorialActivityTimeline editionId={editionId} />
          )}
        </>
      )}

      {activeGroup === 'sumber' && (
        <SourceRegistryPanel supabase={adminSupabase} role={role} userId={userId} />
      )}

      {activeGroup === 'tapisan' && (
        <div className="editorial-desk__keputusan">
          {/* Pusingan 9/15: TapisanPanel replaces the old side-by-side
              FilterRulesManager + FilterRuleEffect layout with two dense
              tables (peraturan tapisan / pengecualian global), effect
              counts inline on each row. Same adapters, same resolver,
              only the layout changed. FilterRulesManager.jsx/
              FilterRuleEffect.jsx are no longer mounted here — left in
              place (not deleted) since nothing else in this round
              confirmed them fully orphaned. */}
          {filterRulesError && <p className="review-queue__error">{filterRulesError}</p>}
          {filterRules === null && !filterRulesError && (
            <p className="admin-app__status">Memuatkan…</p>
          )}
          {filterRules !== null && (
            <TapisanPanel
              supabase={adminSupabase}
              rules={filterRules}
              effects={filterEffect}
              effectsError={filterEffectError}
              busy={filterRulesBusy}
              onAdd={({ ruleType, phrase, reason }) => runFilterRuleAction(() =>
                addFilterRule(adminSupabase, { ruleType, phrase, reason, createdBy: userId, role }))}
              onToggle={(id, active) => runFilterRuleAction(() =>
                setFilterRuleActive(adminSupabase, id, active, role))}
            />
          )}
        </div>
      )}

      {/* Polish 4A (2026-08-19): "Kategori" (dahulu "bidang") kini 5 page
          berasingan (BidangPanel.jsx eksport 5 komponen laman, bukan satu
          panel gulung) -- setiap satu mount SATU sahaja ikut activeSection,
          bukan kelima-lima serentak dalam satu scroll seperti sebelum ini. */}
      {activeGroup === 'kategori' && activeSection === 'pemetaan-sumber' && (
        <PemetaanSumberPage
          supabase={adminSupabase}
          editionId={editionId}
          taxonomyFieldCodes={getEdition(editionId).taxonomyFieldCodes}
          taxonomyFieldLabels={getEdition(editionId).taxonomy}
          userId={userId}
        />
      )}
      {activeGroup === 'kategori' && activeSection === 'petunjuk-rss-url' && (
        <PetunjukRssUrlPage
          supabase={adminSupabase}
          editionId={editionId}
          taxonomyFieldCodes={getEdition(editionId).taxonomyFieldCodes}
          taxonomyFieldLabels={getEdition(editionId).taxonomy}
          userId={userId}
        />
      )}
      {activeGroup === 'kategori' && activeSection === 'feed-campuran' && (
        <FeedCampuranPage
          supabase={adminSupabase}
          editionId={editionId}
          taxonomyFieldCodes={getEdition(editionId).taxonomyFieldCodes}
          taxonomyFieldLabels={getEdition(editionId).taxonomy}
          userId={userId}
        />
      )}
      {activeGroup === 'kategori' && activeSection === 'pelarasan' && (
        <SemuaPelarasanPage supabase={adminSupabase} />
      )}
      {activeGroup === 'kategori' && activeSection === 'penempatan' && (
        <PenempatanBeritaPage
          supabase={adminSupabase}
          editionId={editionId}
          taxonomyFieldCodes={getEdition(editionId).taxonomyFieldCodes}
          taxonomyFieldLabels={getEdition(editionId).taxonomy}
          editionRules={editionRules}
          editionRulesError={editionRulesError}
          editionRulesBusy={editionRulesBusy}
          onAddEditionRule={({ conditionSubject, conditionGeographyType, conditionGeographyValue, actionFieldCode, priority }) =>
            runEditionRuleAction(() => addEditionRule(adminSupabase, {
              editionId, conditionSubject, conditionGeographyType, conditionGeographyValue, actionFieldCode, priority, createdBy: userId,
            }))}
          onArchiveEditionRule={(id, reason) => runEditionRuleAction(() => archiveEditionRule(adminSupabase, id, reason))}
          onRestoreEditionRule={id => runEditionRuleAction(() => restoreEditionRule(adminSupabase, id))}
        />
      )}

      {activeGroup === 'nilai' && (
        <NilaiSusunanPanel
          supabase={adminSupabase}
          editionId={editionId}
          taxonomyFieldCodes={getEdition(editionId).taxonomyFieldCodes}
          taxonomyFieldLabels={getEdition(editionId).taxonomy}
        />
      )}
    </AdminShell>
  );
}
