'use strict';
/* ============================================================
   The Express application.
   Security headers, CORS, compression, the API, the media, and — in
   production — the built React client.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const env = require('./config/env');
const routes = require('./routes');
const storage = require('./services/storage');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

/* correct req.ip behind a reverse proxy — the unlock throttle counts on it */
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

/* Helmet's CSP carries `upgrade-insecure-requests` by default, which tells the
   browser to re-request every asset over https. On localhost the directive is
   ignored — the origin is already trusted. Reached over a LAN address it is
   applied in full, every asset is retried against a TLS port that is not
   listening, and the page arrives with no CSS and no JavaScript. So it is
   dropped exactly when the site is declared to be served over plain http, and
   kept in every other case. */
const PLAIN_HTTP = /^http:\/\//i.test(env.publicUrl);

/* When PUBLIC_URL is set, media URLs are emitted as absolute against it — that
   is what makes a QR code work on a phone. But "self" in a CSP means the origin
   the PAGE was served from, and those two part company the moment the same
   server is reached by another name: open http://localhost:5000 while
   PUBLIC_URL says http://192.168.1.15:5000 and every photograph, film and voice
   is blocked, with nothing on screen to say why. Naming the declared public
   origin alongside 'self' costs nothing — it is this same server — and makes
   the deployment survive being reached by either name. */
const MEDIA_ORIGINS = env.publicUrl ? [env.publicUrl] : [];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      /* Vite inlines a small module preload script; the fonts come from
         Google. Everything else — three.js, the spring solver — is bundled,
         so no CDN is trusted at runtime any more. */
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', ...MEDIA_ORIGINS],
      // blob: — the builder previews a recording or a film before it is uploaded
      mediaSrc: ["'self'", 'blob:', 'data:', ...MEDIA_ORIGINS],
      connectSrc: ["'self'", ...MEDIA_ORIGINS],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // null removes a directive helmet would otherwise add — see PLAIN_HTTP
      ...(PLAIN_HTTP ? { upgradeInsecureRequests: null } : {})
    }
  },
  /* HSTS over plain http is ignored by browsers, and promising TLS we do not
     serve is a claim worth not making at all. */
  hsts: !PLAIN_HTTP,
  crossOriginOpenerPolicy: !PLAIN_HTTP,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

/* In development the client lives on Vite's origin. In production it is
   served from this one, so the allow-list is empty and same-origin wins. */
app.use(cors({
  origin: env.isProduction ? [env.publicUrl].filter(Boolean) : [env.clientUrl, 'http://localhost:5173'],
  credentials: false,
  allowedHeaders: ['Content-Type', 'x-gift-token', 'x-view-token', 'x-manage-key', 'x-admin-key'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
}));

app.use(compression());

app.use('/api', routes);

/* Media. Filenames are 16 random characters, so the URL itself is the
   capability; content at a given name never changes, hence the long cache.

   A driver that keeps its bytes on disk hands express.static a folder. One
   that keeps them in the database returns null and serves itself, because a
   conditional request and a Range have to be written by hand there — and a
   film cannot be scrubbed without them. */
const MEDIA_ROOT = storage.servePath();

app.use('/m', MEDIA_ROOT
  ? express.static(MEDIA_ROOT, {
    immutable: true,
    maxAge: '365d',
    index: false,
    dotfiles: 'deny',
    setHeaders: res => res.set('Cross-Origin-Resource-Policy', 'cross-origin')
  })
  : require('./routes/media.routes'));

/* Unknown /api/* paths answer JSON rather than falling through to the SPA. */
app.use(notFoundHandler);

/* ------------------------------------------------------------
   The built client, when there is one. Every non-API path serves index.html
   so /p/:slug, /build/:slug, /admin and /panel are handled by the router in
   the browser — the experience must never reload between memories.
   ------------------------------------------------------------ */
const CLIENT_DIST = path.resolve(env.paths.projectRoot, 'client', 'dist');

if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h', etag: true }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(404).json({
    error: "Le client n'est pas construit. Lancez `npm run dev` (développement) ou `npm run build` (production)."
  }));
}

app.use(errorHandler);

module.exports = app;
