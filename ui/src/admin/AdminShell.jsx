// AdminShell.jsx — Polish 4A (2026-08-19). Layout sahaja: header + sidebar
// kiri (nav utama + submenu) + satu ruang kandungan. Tidak fetch/mutate
// apa-apa data sendiri -- itu kekal di ReviewQueue (AdminApp.jsx), yang
// pass activePage + children ke sini. Reka bentuk per arahan ChatGPT
// (disahkan Izzat): sidebar kekal kelihatan di desktop, jadi drawer
// (butang togol) pada skrin sempit -- JANGAN paksa sidebar ambil ruang
// tetap pada telefon.
import { useState } from 'react';
import { GROUP_ORDER, GROUP_LABELS, pagesForGroup } from './adminRouter.js';

export default function AdminShell({ activePage, onNavigate, editionSwitcher, onSignOut, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (
    <nav className="admin-shell__nav">
      {GROUP_ORDER.map(groupId => {
        const pages = pagesForGroup(groupId);
        const isSinglePage = pages.length === 1;
        return (
          <div key={groupId} className="admin-shell__nav-group">
            {isSinglePage ? (
              <button
                type="button"
                className={`admin-shell__nav-item admin-shell__nav-item--top${activePage?.group === groupId ? ' admin-shell__nav-item--active' : ''}`}
                onClick={() => { onNavigate(pages[0].path); setDrawerOpen(false); }}
              >
                {GROUP_LABELS[groupId]}
              </button>
            ) : (
              <>
                <span className="admin-shell__nav-group-label">{GROUP_LABELS[groupId]}</span>
                {pages.map(page => (
                  <button
                    key={page.id}
                    type="button"
                    className={`admin-shell__nav-item${activePage?.path === page.path ? ' admin-shell__nav-item--active' : ''}`}
                    onClick={() => { onNavigate(page.path); setDrawerOpen(false); }}
                  >
                    {page.label}
                  </button>
                ))}
              </>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-shell">
      <div className="admin-shell__header">
        <button
          type="button"
          className="admin-shell__drawer-toggle"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Buka menu"
        >
          ☰
        </button>
        <span className="admin-app__masthead-title">Adjung Quick</span>
        {editionSwitcher}
        <button type="button" className="admin-app__signout" onClick={onSignOut}>
          Log keluar
        </button>
      </div>

      <div className="admin-shell__body">
        <aside className={`admin-shell__sidebar${drawerOpen ? ' admin-shell__sidebar--open' : ''}`}>
          {nav}
        </aside>
        {drawerOpen && (
          <div className="admin-shell__drawer-backdrop" onClick={() => setDrawerOpen(false)} />
        )}

        <main className="admin-shell__main">
          {activePage && (
            <div className="admin-shell__breadcrumb">
              {GROUP_LABELS[activePage.group]}
              {pagesForGroup(activePage.group).length > 1 && <> &rsaquo; {activePage.label}</>}
            </div>
          )}
          {activePage && pagesForGroup(activePage.group).length > 1 && (
            <h2 className="admin-shell__page-title">{activePage.label}</h2>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
