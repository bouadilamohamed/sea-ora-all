'use strict';
/* ============================================================
   /api/admin — one screen, one job.
   An order comes in, an empty gift goes out: the administrator types the
   reference engraved on the object and a temporary password, and receives a
   QR code to hand to the customer. Nothing else happens here — the gift
   itself is built by the customer.
   ============================================================ */
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const pearlService = require('../services/pearl.service');
const qr = require('../services/qr.service');
const { normalizeReference, constantTimeEquals } = require('../utils/crypto');
const { badRequest, notFound, unauthorized, unavailable } = require('../utils/httpError');
const { publicBase, builderUrl, viewerUrl } = require('../utils/urls');

/* Whether the console can be used at all. The page asks before showing its
   form, so a missing ADMIN_KEY produces an explanation instead of a 401 loop. */
const status = (_req, res) => res.json({ configured: !!env.adminKey });

const session = (req, res) => {
  if (!env.adminKey) {
    throw unavailable(
      "L'administration n'est pas configurée. Renseignez ADMIN_KEY dans .env, puis redémarrez."
    );
  }
  if (!constantTimeEquals(req.body && req.body.key, env.adminKey)) {
    throw unauthorized('Clé administrateur incorrecte.');
  }
  res.json({ ok: true });
};

/* ------------------------------------------------------------
   POST /api/admin/gifts — generate an empty gift.
   The pearl is born a draft: the viewer refuses to open it until the customer
   seals it, and its unopenable code is 48 random characters nobody has seen.
   ------------------------------------------------------------ */
const createGift = asyncHandler(async (req, res) => {
  const reference = normalizeReference(req.body && req.body.reference);
  const temp = String((req.body && req.body.tempPassword) || '').trim();

  if (!reference) throw badRequest('Indiquez la référence de la commande.');
  if (reference.length < 2) throw badRequest('La référence doit faire au moins 2 caractères.');
  if (reference.length > 64) throw badRequest('La référence est trop longue.');
  if (!temp) throw badRequest('Choisissez un mot de passe temporaire.');
  if (temp.length < 4) throw badRequest('Le mot de passe temporaire doit faire au moins 4 caractères.');
  if (temp.length > 64) throw badRequest('Le mot de passe temporaire est trop long.');

  const pearl = await pearlService.createDraft({ reference, tempPassword: temp });
  const base = publicBase(req);

  res.status(201).json({
    slug: pearl.slug,
    reference,
    manageKey: pearl.manageKey,
    builderUrl: builderUrl(req, pearl.slug),
    viewerUrl: viewerUrl(req, pearl.slug),
    qr: `${base}/api/admin/gifts/${pearl.slug}/qr.png`,
    qrSvg: `${base}/api/admin/gifts/${pearl.slug}/qr.svg`,
    createdAt: pearl.createdAt.getTime()
  });
});

/* A short list of what has been generated recently, so the administrator can
   find a QR code again without keeping the tab open. References are hashed
   and never come back — a gift is identified by its id and its date. */
const listGifts = asyncHandler(async (req, res) => {
  const base = publicBase(req);
  const rows = await pearlService.recent(40);
  res.json({
    gifts: rows.map(r => ({
      slug: r.slug,
      status: r.status,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      counts: r.counts,
      builderUrl: builderUrl(req, r.slug),
      viewerUrl: viewerUrl(req, r.slug),
      qr: `${base}/api/admin/gifts/${r.slug}/qr.png`
    }))
  });
});

/* The QR the CUSTOMER scans. It points at the builder, not the viewer — this
   code is what turns an order into a gift the customer can fill. */
const qrPng = asyncHandler(async (req, res) => {
  const pearl = await pearlService.bySlug(req.params.slug);
  if (!pearl) throw notFound('Introuvable');
  const png = await qr.png(builderUrl(req, pearl.slug), { size: req.query.size });
  res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
});

const qrSvg = asyncHandler(async (req, res) => {
  const pearl = await pearlService.bySlug(req.params.slug);
  if (!pearl) throw notFound('Introuvable');
  res.type('svg').set('Cache-Control', 'public, max-age=86400')
    .send(await qr.svg(builderUrl(req, pearl.slug)));
});

module.exports = { status, session, createGift, listGifts, qrPng, qrSvg };
