'use strict';
/* ============================================================
   /api/pearls — the public face of a gift.
   Create it, look at its door, unlock it, print its QR code, manage it.
   ============================================================ */
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const pearlService = require('../services/pearl.service');
const authService = require('../services/auth.service');
const mediaService = require('../services/media.service');
const serialize = require('../services/serialize.service');
const qr = require('../services/qr.service');
const { normalizeReference } = require('../utils/crypto');
const { clean, toSeconds } = require('../utils/text');
const { badRequest, notFound } = require('../utils/httpError');
const { publicBase, viewerUrl, mediaUrl } = require('../utils/urls');

/* ------------------------------------------------------------
   POST /api/pearls — create a sealed pearl in one shot.
   ------------------------------------------------------------ */
const create = asyncHandler(async (req, res) => {
  const images = (req.files && req.files.images) || [];
  const audioFiles = (req.files && req.files.audio) || [];
  const password = String(req.body.password || '').trim();
  const reference = normalizeReference(req.body.reference);   // '' = opens on the code alone

  if (!password) throw badRequest('Choisissez un code secret.');
  if (password.length < 3) throw badRequest('Le code doit faire au moins 3 caractères.');
  if (password.length > 64) throw badRequest('Le code est trop long.');
  if (reference && reference.length < 2) throw badRequest('La référence doit faire au moins 2 caractères.');
  if (reference.length > 64) throw badRequest('La référence est trop longue.');
  if (!images.length) throw badRequest('Ajoutez au moins une image.');

  const captions = [].concat(req.body.captions || []);
  const audioLabels = [].concat(req.body.audioLabels || []);
  const audioSeconds = [].concat(req.body.audioSeconds || []);

  const written = [];
  try {
    const photos = [];
    for (let i = 0; i < images.length; i++) {
      const out = await mediaService.processImage(images[i].buffer);
      written.push(out.mediaUrl, out.thumbnailUrl);
      photos.push({ ...out, caption: clean(captions[i], 140) });
    }

    const voices = [];
    const wanted = audioFiles.slice(0, env.limits.audios);
    for (let i = 0; i < wanted.length; i++) {
      const out = await mediaService.saveAudio(wanted[i].buffer, wanted[i].mimetype);
      written.push(out.mediaUrl);
      voices.push({ ...out, label: clean(audioLabels[i], 60), duration: toSeconds(audioSeconds[i]) });
    }

    const pearl = await pearlService.createSealed({
      password,
      reference,
      message: req.body.message,
      autoplay: req.body.autoplay !== 'false',
      photos,
      voices
    });

    const base = publicBase(req);
    res.status(201).json({
      slug: pearl.slug,
      manageKey: pearl.manageKey,
      url: `${base}/p/${pearl.slug}`,
      qr: `${base}/api/pearls/${pearl.slug}/qr.png`,
      images: photos.length,
      audios: voices.length,
      reference: reference || null,     // echoed back so the panel can show and store it
      needsRef: !!reference
    });
  } catch (err) {
    await mediaService.removeFiles(written);   // don't leave orphan files behind
    throw err;
  }
});

/* ------------------------------------------------------------
   GET /api/pearls/:slug — gate metadata ONLY, never the media.
   ------------------------------------------------------------ */
const gate = asyncHandler(async (req, res) => {
  res.json(await authService.gate(req.params.slug));
});

/* ------------------------------------------------------------
   POST /api/pearls/:slug/unlock — media is released only on success.
   ------------------------------------------------------------ */
const unlock = asyncHandler(async (req, res) => {
  const result = await authService.unlock({
    slug: req.params.slug,
    password: req.body && req.body.password,
    reference: req.body && req.body.reference,
    ip: req.ip || '0.0.0.0'
  });
  res.json({
    ...serialize.viewerContent(result.pearl, result.rows),
    token: result.session.token,
    expiresAt: result.session.expiresAt
  });
});

/* ------------------------------------------------------------
   QR codes of the PUBLIC viewer link.
   ------------------------------------------------------------ */
const qrPng = asyncHandler(async (req, res) => {
  const pearl = await pearlService.bySlug(req.params.slug);
  if (!pearl) throw notFound('Introuvable');
  const png = await qr.png(viewerUrl(req, pearl.slug), {
    size: req.query.size, dark: req.query.dark, light: req.query.light
  });
  res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
});

const qrSvg = asyncHandler(async (req, res) => {
  const pearl = await pearlService.bySlug(req.params.slug);
  if (!pearl) throw notFound('Introuvable');
  res.type('svg').set('Cache-Control', 'public, max-age=86400')
    .send(await qr.svg(viewerUrl(req, pearl.slug)));
});

/* ------------------------------------------------------------
   Manage endpoints — guarded by the manage key (see middleware/auth).
   ------------------------------------------------------------ */
const manage = asyncHandler(async (req, res) => {
  const pearl = req.pearl;
  const rows = await pearlService.memoriesOf(pearl.id);
  const base = publicBase(req);
  res.json({
    slug: pearl.slug,
    title: pearl.title,
    subtitle: pearl.subtitle,
    message: pearl.message || '',
    gateTitle: pearl.gateTitle,
    gateNote: pearl.gateNote,
    hint: pearl.passHint || '',
    autoplay: pearl.autoplay,
    audios: rows.filter(r => r.type === 'VOICE').length,
    needsRef: !!pearl.refHash,
    views: pearl.views,
    unlocks: pearl.unlocks,
    createdAt: pearl.createdAt.getTime(),
    url: `${base}/p/${pearl.slug}`,
    qr: `${base}/api/pearls/${pearl.slug}/qr.png`,
    images: rows.filter(r => r.type === 'PHOTO')
      .map(r => ({ thumb: mediaUrl(r.thumbnailUrl || r.mediaUrl) }))
  });
});

const update = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (body.password && String(body.password).trim().length < 3) {
    throw badRequest('Code trop court.');
  }
  if ('reference' in body) {
    const rf = normalizeReference(body.reference);
    if (rf && rf.length < 2) throw badRequest('Référence trop courte.');
    if (rf.length > 64) throw badRequest('Référence trop longue.');
  }

  await pearlService.updateMeta(req.pearl, body);
  res.json({ ok: true });
});

const destroy = asyncHandler(async (req, res) => {
  await pearlService.destroy(req.pearl);
  res.json({ ok: true });
});

module.exports = { create, gate, unlock, qrPng, qrSvg, manage, update, destroy };
