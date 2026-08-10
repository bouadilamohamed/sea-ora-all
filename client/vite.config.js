import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/* client/ is a standalone deployment (Netlify) with its own .env — it does
   not read the server's config. In dev, the API proxy target defaults to
   the server's default port; override with VITE_DEV_API_PORT if needed. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = `http://localhost:${env.VITE_DEV_API_PORT || 5000}`;

  return {
    envDir: process.cwd(),
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), 'src') }
    },
    server: {
      port: 5173,
      /* Bind every interface, not just loopback, so a phone on the same
         network can open the dev server at http://<lan-ip>:5173. The proxy
         below still runs on this machine, so its localhost target holds. */
      host: true,
      /* Both halves are proxied, so the app talks to one origin in
         development exactly as it will in production: /api for the API and
         /m for the media, which is why media URLs can stay relative. */
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/m': { target: apiTarget, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          /* three.js is most of the bundle and only the viewer needs it;
             splitting it keeps the admin and the panel light. */
          manualChunks: { three: ['three'] }
        }
      }
    }
  };
});
