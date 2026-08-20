// adminRouter.js — Polish 4A (2026-08-19), arahan ChatGPT + kelulusan
// Izzat: setiap submodul Admin patut ada URL sebenar (refresh/bookmark/
// back-forward berfungsi), TANPA tambah React Router (~15-20 laluan
// statik sahaja -- pustaka penuh tak wajar). History API + peta
// pathname->page terus, corak sama seperti nasihat ChatGPT.

export const GROUP_ORDER = ['berita', 'sumber', 'tapisan', 'kategori', 'nilai'];

export const GROUP_LABELS = {
  berita: 'Berita',
  sumber: 'Sumber',
  tapisan: 'Tapisan',
  kategori: 'Kategori',
  nilai: 'Nilai & Susunan',
};

// Setiap entri: laluan URL sebenar + label paparan. `group` tanpa
// submenu (Sumber/Tapisan) guna satu page sahaja, path = /admin/<group>.
export const PAGES = [
  { group: 'berita', id: 'ringkasan', path: '/admin/berita/ringkasan', label: 'Ringkasan' },
  { group: 'berita', id: 'semakan', path: '/admin/berita/semakan', label: 'Perlu Semakan' },
  { group: 'berita', id: 'semua-berita', path: '/admin/berita/semua-berita', label: 'Semua Berita' },
  { group: 'berita', id: 'aliran', path: '/admin/berita/aliran', label: 'Aliran Klasifikasi' },
  { group: 'berita', id: 'rekod', path: '/admin/berita/rekod', label: 'Rekod' },
  { group: 'sumber', id: 'sumber', path: '/admin/sumber', label: 'Sumber' },
  { group: 'tapisan', id: 'tapisan', path: '/admin/tapisan', label: 'Tapisan' },
  { group: 'kategori', id: 'pemetaan-sumber', path: '/admin/kategori/pemetaan-sumber', label: 'Pemetaan Sumber' },
  { group: 'kategori', id: 'petunjuk-rss-url', path: '/admin/kategori/petunjuk-rss-url', label: 'Petunjuk RSS/URL' },
  { group: 'kategori', id: 'feed-campuran', path: '/admin/kategori/feed-campuran', label: 'Feed Campuran' },
  { group: 'kategori', id: 'pelarasan', path: '/admin/kategori/pelarasan', label: 'Semua Pelarasan' },
  { group: 'kategori', id: 'penempatan', path: '/admin/kategori/penempatan', label: 'Penempatan Berita' },
  { group: 'nilai', id: 'nilai', path: '/admin/nilai', label: 'Nilai & Susunan' },
];

export const DEFAULT_PATH = '/admin/berita/ringkasan';

// Polish 8C (docs/polish-8-selection-audit-v1.md): "Nilai & Susunan" was
// four separate pages (Data Sebenar / Kaedah Nilai / Pemilihan 10 /
// Susunan Akhir), unified into one (/admin/nilai). Old bookmarks/back-
// forward history pointing at the four retired URLs still resolve
// somewhere sensible instead of falling through to the unrelated global
// DEFAULT_PATH -- a small alias map, per ChatGPT's explicit instruction
// not to add React Router for this.
const LEGACY_REDIRECTS = {
  '/admin/nilai/data-sebenar': '/admin/nilai',
  '/admin/nilai/kaedah': '/admin/nilai',
  '/admin/nilai/pemilihan': '/admin/nilai',
  '/admin/nilai/susunan-akhir': '/admin/nilai',
};

export function resolvePage(pathname) {
  return PAGES.find(p => p.path === pathname) ?? null;
}

export function resolveRedirect(pathname) {
  return LEGACY_REDIRECTS[pathname] ?? null;
}

export function pagesForGroup(groupId) {
  return PAGES.filter(p => p.group === groupId);
}

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
