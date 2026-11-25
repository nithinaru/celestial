import { defineConfig } from 'vite';

// In dev, mirror the Vercel functions in api/ so the client uses one URL everywhere.
export default defineConfig({
  // satellite.js v7 re-exports a WASM build whose worker uses top-level await; we only use the JS API.
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api/fireball': {
        target: 'https://ssd-api.jpl.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fireball/, '/fireball.api'),
      },
      '/api/iss': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: () => '/NORAD/elements/gp.php?CATNR=25544&FORMAT=json',
      },
    },
  },
});
