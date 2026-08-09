'use strict';
const env = require('../config/env');

/* Where the app lives, as far as a printed QR code is concerned.

   PUBLIC_URL wins when it is set — behind a proxy or a tunnel it is the only
   address that is actually reachable. Without it we fall back to the host the
   request arrived on, which is right on a laptop and wrong on a phone; the
   boot banner warns about exactly that. */
function publicBase(req) {
  if (env.publicUrl) return env.publicUrl;
  return `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
}

/* Media URLs are RELATIVE when no public origin is declared.

   In development the client runs on Vite's origin and proxies /m to this
   server, so a relative URL resolves correctly on both. In production the
   server also serves the built client, so it still resolves. An absolute URL
   is emitted only when PUBLIC_URL says what that absolute origin is — which
   is the case that actually needs one (a phone opening a QR code). */
function mediaUrl(storagePath) {
  if (!storagePath) return null;
  const clean = String(storagePath).replace(/^\/+/, '');
  return env.publicUrl ? `${env.publicUrl}/m/${clean}` : `/m/${clean}`;
}

const viewerUrl = (req, slug) => `${publicBase(req)}/p/${slug}`;
const builderUrl = (req, slug) => `${publicBase(req)}/build/${slug}`;

module.exports = { publicBase, mediaUrl, viewerUrl, builderUrl };
