import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/. Override with BASE_PATH
// (e.g. BASE_PATH=/ for a custom domain or Capacitor builds use './').
const REPO_BASE = '/first-game/';

export default defineConfig(({ command, isPreview }) => ({
  base: process.env.BASE_PATH ?? (command === 'build' || isPreview ? REPO_BASE : '/'),
  build: {
    target: 'es2020',
    // rapier3d-compat inlines its WASM as base64 (~4 MB), so the main chunk is large.
    chunkSizeWarningLimit: 6000,
  },
}));
