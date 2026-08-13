import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
import './style.css';

// No router dependency (per docs/review-queue-ui-implementation-plan-v1.md
// §5) — Adjung Quick has exactly one admin route; a single path check is
// the smallest correct mechanism for that, not a reason to add a library.
const isAdminRoute = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminRoute ? <AdminApp /> : <App />}
  </StrictMode>
);
