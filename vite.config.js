import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phase 2A — Core Reading Shell. Root is ./ui so the app can still import
// the existing state/ and lab/ modules by relative path (../../state/...),
// per ChatGPT's instruction not to duplicate reducer/action logic for the UI.
export default defineConfig({
  root: './ui',
  plugins: [react()],
  server: { port: 5173 },
});
