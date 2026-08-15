import { defineConfig } from 'vite';

// Build the SPA (index.html + src/) into ./dist, which wrangler serves as the
// static ASSETS bundle. worker.js handles /api/* and is deployed separately.
export default defineConfig({
  root: '.',
  // Ship static social assets and the direct-install browser extension packages.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  plugins: [{
    name: 'saveto-landing-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = `/landing.html${req.url.slice(1)}`;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = `/landing.html${req.url.slice(1)}`;
        next();
      });
    },
  }],
});
