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
  { group: 'nilai', id: 'data-sebenar', path: '/admin/nilai/data-sebenar', label: 'Data Sebenar' },
  { group: 'nilai', id: 'kaedah', path: '/admin/nilai/kaedah', label: 'Kaedah Nilai' },
  { group: 'nilai', id: 'pemilihan', path: '/admin/nilai/pemilihan', label: 'Pemilihan 10' },
  { group: 'nilai', id: 'susunan-akhir', path: '/admin/nilai/susunan-akhir', label: 'Susunan Akhir' },
];

export const DEFAULT_PATH = '/admin/berita/ringkasan';

export function resolvePage(pathname) {
  return PAGES.find(p => p.path === pathname) ?? null;
}

export function pagesForGroup(groupId) {
  return PAGES.filter(p => p.group === groupId);
}

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
