'use strict';
/* ============================================================
   Who is allowed to do what.

   Three doors, three keys:
     x-gift-token   a builder session — may edit exactly one pearl
     x-view-token   a viewer session  — may read exactly one pearl
     x-manage-key   the pearl's own management key
     x-admin-key    the instance's administration key
   ============================================================ */
const env = require('../config/env');
const { constantTimeEquals } = require('../utils/crypto');
const { unauthorized, notFound, unavailable } = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const sessionService = require('../services/session.service');
const pearlService = require('../services/pearl.service');

const SESSION_LOST = 'Session expirée. Entrez votre mot de passe à nouveau.';

const tokenFrom = (req, header) =>
  req.get(header) || (req.body && req.body.token) || req.query.token || '';

/* A builder session. The token is bound to one pearl, so a token for another
   gift is as good as no token at all — which is why the slug is compared
   rather than trusted. */
const requireBuilderSession = asyncHandler(async (req, _res, next) => {
  const session = await sessionService.resolve(tokenFrom(req, 'x-gift-token'), 'BUILDER');
  if (!session) throw unauthorized(SESSION_LOST);
  if (req.params.slug && session.pearl.slug !== req.params.slug) throw unauthorized(SESSION_LOST);
  req.session = session;
  req.pearl = session.pearl;
  next();
});

/* A viewer session, minted when the passcode was accepted. It is what lets
   /api/memories answer at all: without it the media stays withheld. */
const requireViewSession = asyncHandler(async (req, _res, next) => {
  const session = await sessionService.resolve(tokenFrom(req, 'x-view-token'), 'VIEW');
  if (!session) throw unauthorized('Session expirée. Entrez le code à nouveau.');
  req.session = session;
  req.pearl = session.pearl;
  next();
});

/* Either will do: the builder reads its own gift through the same endpoints
   the viewer uses, and both are scoped to one pearl. */
const requireAnySession = asyncHandler(async (req, _res, next) => {
  const session =
    await sessionService.resolve(tokenFrom(req, 'x-view-token'), 'VIEW') ||
    await sessionService.resolve(tokenFrom(req, 'x-gift-token'), 'BUILDER');
  if (!session) throw unauthorized('Session expirée. Entrez le code à nouveau.');
  req.session = session;
  req.pearl = session.pearl;
  next();
});

/* The management key. A wrong key answers 404, not 403: whether a given slug
   exists is not something an unauthenticated caller needs to learn. */
const requireManageKey = asyncHandler(async (req, _res, next) => {
  const pearl = await pearlService.bySlug(req.params.slug);
  const key = req.get('x-manage-key') || (req.body && req.body.manageKey) || req.query.key;
  if (!pearl || !key || !constantTimeEquals(key, pearl.manageKey)) throw notFound('Introuvable');
  req.pearl = pearl;
  next();
});

/* The administration key lives in the environment rather than the database,
   so a direct comparison is right — padded to constant time all the same. */
function requireAdmin(req, _res, next) {
  if (!env.adminKey) {
    throw unavailable(
      "L'administration n'est pas configurée. Renseignez ADMIN_KEY dans .env, puis redémarrez."
    );
  }
  if (!constantTimeEquals(req.get('x-admin-key'), env.adminKey)) {
    throw unauthorized('Clé administrateur incorrecte.');
  }
  next();
}

module.exports = {
  requireBuilderSession, requireViewSession, requireAnySession, requireManageKey, requireAdmin
};
