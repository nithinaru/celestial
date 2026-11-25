import { defineConfig } from 'vite';

// In dev, mirror the Vercel function at api/fireball.ts so the client uses one URL everywhere.
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
    },
  },
});
