import { defineConfig } from 'vite';

// Build the SPA (index.html + src/) into ./dist, which wrangler serves as the
// static ASSETS bundle. worker.js handles /api/* and is deployed separately.
export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
