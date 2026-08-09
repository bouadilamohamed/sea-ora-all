'use strict';
/* ============================================================
   Centralised error handling.

   An HttpError is something a visitor is meant to read. Anything else is a
   bug, and answers with one flat sentence — a stack trace, a Prisma message
   or a filesystem path must never reach the browser.
   ============================================================ */
const { HttpError } = require('../utils/httpError');
const env = require('../config/env');

const PASSTHROUGH = ['draft', 'needsRef', 'remaining', 'gateTitle', 'gateNote'];

function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route introuvable' });
  }
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    for (const key of PASSTHROUGH) if (key in err) body[key] = err[key];
    return res.status(err.status).json(body);
  }

  /* multer reports its own failures as ordinary errors with a code. They are
     the visitor's fault, not the server's, so they are answered as such. */
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux.' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Trop de fichiers d’un coup.' });
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Fichier inattendu.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requête trop volumineuse.' });
  }

  console.error('[seaora]', err);
  const body = { error: 'Erreur serveur' };
  if (!env.isProduction && err && err.message) body.detail = String(err.message);
  res.status(500).json(body);
}

module.exports = { errorHandler, notFoundHandler };
