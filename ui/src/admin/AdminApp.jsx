import { useEffect, useState, useCallback } from 'react';
import { adminSupabase } from './adminSupabase.js';
import { getEditorRole, isEditor } from '../../../db/editor-auth.mjs';
import { fetchReviewQueue, fetchDigest, submitHideOverride, submitReclassifyOverride, submitBoostOverride, submitPinOverride, deactivateOverride, fetchFilterRules, addFilterRule, setFilterRuleActive, deleteFilterRule, fetchEditorialFilterEffect } from './reviewQueueAdapter.js';
import FilterRuleEffect from './FilterRuleEffect.jsx';
import AdminDigest from './AdminDigest.jsx';
import EditorialActivityTimeline from './EditorialActivityTimeline.jsx';
import { EDITION_IDS, getEdition, DEFAULT_EDITION_ID, loadEditionsFromDB } from '../../../state/editions.js';
import ReviewQueueCard from './ReviewQueueCard.jsx';
import FilterRulesManager from './FilterRulesManager.jsx';
import ClassificationFlow from './ClassificationFlow.jsx';
import { fetchEditionRules, addEditionRule, archiveEditionRule, restoreEditionRule } from './editionRulesAdapter.js';
import SourceRegistryPanel from './SourceRegistryPanel.jsx';
import BidangPanel from './BidangPanel.jsx';
import ValueRankingPanel from './ValueRankingPanel.jsx';

// Berita sub-sections — per docs/editorial-desk-shell-implementation-plan-v1.md.
// 'aliran' added 2026-08-16, direct response to Izzat's complaint that raw
// RSS-to-Bidang routing was invisible — a live table, not a report.
const BERITA_SECTIONS = [
  { id: 'hari-ini', label: 'Ringkasan' },
  { id: 'semakan', label: 'Perlu Semakan' },
  { id: 'aliran', label: 'Semua Berita' },
  { id: 'rekod', label: 'Rekod' },
];

// Admin Console V2 — 6 menu berasaskan kerja editor, bukan nama modul
// backend (docs/prototypes/admin-console-overnight-handoff-20260819.md).
// classification_rules/edition_rules/filter_rules kekal berasingan di
// backend; UI menyatukannya di sini. Setiap group's `sections` (jika ada)
// ialah id activeSection sedia ada yang dikumpul di bawahnya — logik/fetch
// sedia ada TIDAK diubah, hanya lapisan navigasi.
const GROUPS = [
  { id: 'berita', label: 'Berita', sections: ['hari-ini', 'semakan', 'aliran', 'rekod'] },
  { id: 'sumber', label: 'Sumber', sections: [] },
  { id: 'tapisan', label: 'Tapisan', sections: ['keputusan'] },
  { id: 'bidang', label: 'Bidang', sections: ['peraturan', 'susunan-edisi'] },
  { id: 'nilai', label: 'Nilai & Susunan', sections: [] },
  { id: 'tetapan', label: 'Tetapan', sections: [] },
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
  const [activeGroup, setActiveGroup] = useState('berita');

  // Switching group resets activeSection to that group's first
  // sub-section (only 'berita' has real sub-sections today) -- keeps the
  // existing activeSection-keyed effects below working unchanged.
  const selectGroup = groupId => {
    setActiveGroup(groupId);
    const group = GROUPS.find(g => g.id === groupId);
    if (group?.sections.length) setActiveSection(group.sections[0]);
  };
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

  const loadEditionRules = useCallback(() => {
    setEditionRulesError(null);
    fetchEditionRules(adminSupabase, editionId)
      .then(setEditionRules)
      .catch(err => setEditionRulesError(err.message));
  }, [editionId]);

  // Edition-scoped (unlike filterRules) — reloads whenever the admin
  // switches edition while this section is open, not just on first open.
  useEffect(() => {
    if (activeGroup === 'bidang' && editionId === 'ms-MY') loadEditionRules();
  }, [activeGroup, editionId, loadEditionRules]);

  const runEditionRuleAction = async action => {
    setEditionRulesBusy(true);
    try {
      await action();
      loadEditionRules();
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
        {GROUPS.map(group => (
          <button
            key={group.id}
            type="button"
            className={`editorial-desk__nav-item${group.id === activeGroup ? ' editorial-desk__nav-item--active' : ''}`}
            onClick={() => selectGroup(group.id)}
          >
            {group.label}
          </button>
        ))}
      </nav>

      {activeGroup === 'berita' && (
        <>
          <nav className="editorial-desk__subnav">
            {BERITA_SECTIONS.map(section => (
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
                    onBoost={reason => applyPromo(entry.storyId, () =>
                      submitBoostOverride(adminSupabase, { storyId: entry.storyId, editionId, reason, createdBy: userId, role }))}
                    onUnboost={overrideId => applyPromo(entry.storyId, () => deactivateOverride(adminSupabase, overrideId))}
                    onPin={(newField, reason) => applyPromo(entry.storyId, () =>
                      submitPinOverride(adminSupabase, { storyId: entry.storyId, editionId, newField, reason, createdBy: userId, role }))}
                    onUnpin={overrideId => applyPromo(entry.storyId, () => deactivateOverride(adminSupabase, overrideId))}
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

          {activeSection === 'rekod' && (
            <section className="editorial-desk__section">
              <EditorialActivityTimeline editionId={editionId} />
            </section>
          )}
        </>
      )}

      {activeGroup === 'sumber' && (
        <section className="editorial-desk__section">
          <SourceRegistryPanel supabase={adminSupabase} />
        </section>
      )}

      {activeGroup === 'tapisan' && (
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

          <h3 className="bidang-panel__section-title">Kesan sebenar</h3>
          <FilterRuleEffect effects={filterEffect} error={filterEffectError} />
        </section>
      )}

      {activeGroup === 'bidang' && (
        <section className="editorial-desk__section">
          {/* Backend Control Plane Phase 3, Admin Read-Only V1 (Peraturan
              Klasifikasi) + Fasa 4 (Susunan Edisi) grouped under one human
              menu, per docs/prototypes/source-feed-type-audit-v2-correction.md. */}
          <BidangPanel
            supabase={adminSupabase}
            editionId={editionId}
            editionLabel={getEdition(editionId).label}
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
        </section>
      )}

      {activeGroup === 'nilai' && (
        <section className="editorial-desk__section">
          <ValueRankingPanel />
        </section>
      )}

      {activeGroup === 'tetapan' && (
        <section className="editorial-desk__section">
          <p className="admin-app__status">
            Tetapan am akan ditambah di sini apabila diperlukan. Penukar edisi dan log keluar
            sedia ada di bahagian atas halaman ini.
          </p>
        </section>
      )}
    </div>
  );
}
