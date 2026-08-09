'use strict';
/* ============================================================
   /api/gifts — the customer's workshop.

   Each memory is added, replaced, renamed, reordered or removed on its own:
   the builder shows the gift as it will actually look, so it edits the gift
   itself rather than posting a whole form at the end.

   Every write answers with THE WHOLE GIFT — the workshop never has to guess
   what changed, it redraws from one truth.
   ============================================================ */
const asyncHandler = require('../utils/asyncHandler');
const pearlService = require('../services/pearl.service');
const memoryService = require('../services/memory.service');
const giftService = require('../services/gift.service');
const serialize = require('../services/serialize.service');
const { viewerUrl, publicBase } = require('../utils/urls');

async function contentOf(pearl, req) {
  const fresh = await pearlService.bySlugOrFail(pearl.slug);
  const rows = await pearlService.memoriesOf(fresh.id);
  return serialize.giftContent(fresh, rows, {
    limits: pearlService.limits(),
    viewerUrl: viewerUrl(req, fresh.slug)
  });
}

const reply = async (res, pearl, req, status = 200) =>
  res.status(status).json({ content: await contentOf(pearl, req) });

/* ---------- the door ---------- */

const door = asyncHandler(async (req, res) => {
  res.json(giftService.door(await pearlService.bySlugOrFail(req.params.slug)));
});

const session = asyncHandler(async (req, res) => {
  const pearl = await pearlService.bySlugOrFail(req.params.slug);
  const s = await giftService.openSession(pearl, req.body && req.body.password);
  res.json({ token: s.token, expiresAt: s.expiresAt, content: await contentOf(pearl, req) });
});

const content = asyncHandler(async (req, res) => reply(res, req.pearl, req));

/* ---------- photographs ---------- */

const addPhotos = asyncHandler(async (req, res) => {
  await memoryService.addPhotos(req.pearl, req.files || []);
  await pearlService.touch(req.pearl.id);
  return reply(res, req.pearl, req, 201);
});

const replacePhoto = asyncHandler(async (req, res) => {
  await memoryService.replacePhoto(req.pearl, req.params.id, (req.files || [])[0]);
  return reply(res, req.pearl, req);
});

/* ---------- voices ---------- */

const addVoice = asyncHandler(async (req, res) => {
  await memoryService.addVoice(req.pearl, req.file, {
    label: req.body.label, seconds: req.body.seconds
  });
  await pearlService.touch(req.pearl.id);
  return reply(res, req.pearl, req, 201);
});

const replaceVoice = asyncHandler(async (req, res) => {
  await memoryService.replaceVoice(req.pearl, req.params.id, req.file, { seconds: req.body.seconds });
  return reply(res, req.pearl, req);
});

/* ---------- films ---------- */

const addVideo = asyncHandler(async (req, res) => {
  await memoryService.addVideo(
    req.pearl,
    ((req.files || {}).video || [])[0],
    ((req.files || {}).poster || [])[0],
    { label: req.body.label, seconds: req.body.seconds }
  );
  await pearlService.touch(req.pearl.id);
  return reply(res, req.pearl, req, 201);
});

const replaceVideo = asyncHandler(async (req, res) => {
  await memoryService.replaceVideo(
    req.pearl,
    req.params.id,
    ((req.files || {}).video || [])[0],
    ((req.files || {}).poster || [])[0],
    { seconds: req.body.seconds }
  );
  return reply(res, req.pearl, req);
});

/* ---------- written pages ---------- */

const addNote = asyncHandler(async (req, res) => {
  await memoryService.addNote(req.pearl, req.body);
  await pearlService.touch(req.pearl.id);
  return reply(res, req.pearl, req, 201);
});

const editNote = asyncHandler(async (req, res) => {
  await memoryService.updateNote(req.pearl, req.params.id, req.body);
  return reply(res, req.pearl, req);
});

/* ---------- shared verbs ---------- */

const rename = asyncHandler(async (req, res) => {
  await memoryService.rename(req.pearl, req.params.id,
    req.body.caption ?? req.body.label ?? req.body.title);
  return reply(res, req.pearl, req);
});

const remove = asyncHandler(async (req, res) => {
  await memoryService.remove(req.pearl, req.params.id);
  return reply(res, req.pearl, req);
});

/* One order for the whole album, sent as the full list of ids after a drag.
   `kind` used to come with it, back when each type numbered its own pile; it
   is accepted and ignored, so an older tab left open cannot 400. */
const reorder = asyncHandler(async (req, res) => {
  await memoryService.reorder(req.pearl, req.body.ids);
  return reply(res, req.pearl, req);
});

/* the one block of prose above the pile */
const setMessage = asyncHandler(async (req, res) => {
  await pearlService.setMessage(req.pearl.id, req.body.message);
  return reply(res, req.pearl, req);
});

/* ---------- sealing ---------- */

const finish = asyncHandler(async (req, res) => {
  const { pearl, session: s } = await giftService.finish(req.pearl, req.body || {});
  const base = publicBase(req);
  res.json({
    ok: true,
    token: s.token,
    expiresAt: s.expiresAt,
    viewerUrl: viewerUrl(req, pearl.slug),
    qr: `${base}/api/pearls/${pearl.slug}/qr.png`,
    content: await contentOf(pearl, req)
  });
});

module.exports = {
  door, session, content,
  addPhotos, replacePhoto,
  addVoice, replaceVoice,
  addVideo, replaceVideo,
  addNote, editNote,
  rename, remove, reorder, setMessage, finish
};
