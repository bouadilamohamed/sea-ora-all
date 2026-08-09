'use strict';
/* ============================================================
   Rate limits.
   The numbers are the original service's, and each one answers a different
   question: how expensive is this to serve, and how bad is it if someone
   repeats it forever?
   ============================================================ */
const rateLimit = require('express-rate-limit');

const make = (windowMs, max, message, opts = {}) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  ...opts
});

/* Creating a pearl re-encodes every photograph it is given. Writing is far
   more expensive than reading, so only writing is throttled. */
const createPearl = make(60 * 60e3, 40,
  'Trop de créations depuis cette adresse. Réessayez plus tard.',
  { skip: req => req.method === 'GET' });

/* The gate. A short love-note of a passcode is only safe because guessing it
   is slow — this, plus the per-IP-per-pearl counter in auth.service. */
const passcode = make(15 * 60e3, 60,
  'Trop de tentatives. Réessayez dans quelques minutes.');

/* The builder writes constantly — one request per photo, per rename, per
   drag. It gets a far more generous allowance than pearl creation. */
const builder = make(15 * 60e3, 600,
  'Trop de modifications d’un coup. Patientez quelques instants.',
  { skip: req => req.method === 'GET' });

/* The builder's own door: a password guess, throttled like one. */
const builderPassword = make(15 * 60e3, 15,
  'Trop de tentatives. Réessayez dans quelques minutes.');

/* Guessing the admin key is throttled hard: it is the one credential that
   opens every gift generation on the instance. */
const adminKey = make(15 * 60e3, 30,
  'Trop de tentatives. Réessayez dans quelques minutes.');

/* Routes behind the key are a different matter: whoever reaches them has
   already proved who they are, and a busy afternoon in the shop is a long run
   of generate-then-refresh. Throttling those at the same rate as a password
   guess would lock the shop out of its own console. */
const adminWork = make(15 * 60e3, 300,
  'Trop de requêtes. Patientez quelques instants.');

module.exports = { createPearl, passcode, builder, builderPassword, adminKey, adminWork };
