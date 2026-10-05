import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/. The native app build
// (`npm run build:app`, mode "app") is served by Capacitor from the root.
// BASE_PATH overrides both (e.g. BASE_PATH=/ for a custom domain).
const REPO_BASE = '/first-game/';

export default defineConfig(({ command, mode, isPreview }) => {
  let base = command === 'build' || isPreview ? REPO_BASE : '/';
  if (mode === 'app') base = '/';
  return {
    base: process.env.BASE_PATH ?? base,
    build: {
      target: 'es2020',
      // rapier3d-compat inlines its WASM as base64 (~4 MB), so the main chunk is large.
      chunkSizeWarningLimit: 6000,
    },
  };
});
