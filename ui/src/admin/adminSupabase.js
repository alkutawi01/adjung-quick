// adminSupabase.js — Fasa 3.6.2. A SEPARATE Supabase client instance from
// ui/src/adapter/productionAdapter.js's reader client.
//
// The reader client deliberately uses persistSession:false — an anonymous
// reading session has nothing worth persisting. The admin surface is the
// opposite: a signed-in editor's session must survive a page reload, or
// every reload would force a fresh sign-in. Two different auth postures,
// two different client instances — not a shared singleton with a runtime
// flag flip.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? 'http://localhost';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Distinct storageKey (2026-08-13, found live): main.jsx statically
  // imports BOTH App.jsx (-> productionAdapter.js's reader client) and
  // AdminApp.jsx on every page load — ES imports run at module-eval time
  // regardless of which route actually renders — so both Supabase clients
  // always exist together in one browser context. Without separate keys
  // they'd both default to the same "sb-<project-ref>-auth-token" storage
  // key, which is exactly the collision GoTrueClient warns about.
  auth: { persistSession: true, storageKey: 'adjung-quick-admin-auth' },
});
