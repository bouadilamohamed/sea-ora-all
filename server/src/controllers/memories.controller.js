'use strict';
/* ============================================================
   /api/memories — the flat CRUD over a pearl's memories.

   Reading needs a session (a view token from the gate, or a builder token);
   writing needs a builder token. That is the same rule the experience has
   always had, said once instead of four times: nothing about a pearl's
   contents is reachable without having passed a door.
   ============================================================ */
const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/prisma');
const memoryService = require('../services/memory.service');
const pearlService = require('../services/pearl.service');
const serialize = require('../services/serialize.service');
const uploads = require('../middleware/uploads');
const { badRequest, notFound } = require('../utils/httpError');
const { TYPE_FROM_PUBLIC } = require('../services/serialize.service');

const typeParam = value => {
  if (!value) return null;
  const type = TYPE_FROM_PUBLIC[String(value).toLowerCase()];
  if (!type) throw badRequest('Type de souvenir inconnu. Attendu : photo, video, voice ou note.');
  return type;
};

/** GET /api/memories?type= — every memory of the session's pearl, in order. */
const list = asyncHandler(async (req, res) => {
  const type = typeParam(req.query.type);
  const rows = await prisma.memory.findMany({
    where: { pearlId: req.pearl.id, ...(type ? { type } : {}) },
    orderBy: [{ type: 'asc' }, { position: 'asc' }, { id: 'asc' }]
  });
  res.json({ memories: serialize.memories(rows) });
});

/** GET /api/memories/:id */
const getOne = asyncHandler(async (req, res) => {
  const row = await prisma.memory.findFirst({
    where: { id: Number(req.params.id), pearlId: req.pearl.id }
  });
  if (!row) throw notFound('Souvenir introuvable');
  res.json({ memory: serialize.memory(row) });
});

/* ------------------------------------------------------------
   POST /api/memories
   One endpoint, four kinds. A written page arrives as JSON; the other three
   arrive as multipart, because they carry a file.
   ------------------------------------------------------------ */
const create = asyncHandler(async (req, res) => {
  const type = typeParam(req.body.type);
  if (!type) throw badRequest('Indiquez le type du souvenir.');
  const pearl = req.pearl;

  if (type === 'NOTE') {
    await memoryService.addNote(pearl, req.body);
  } else if (type === 'PHOTO') {
    await memoryService.addPhotos(pearl, req.files?.media || []);
  } else if (type === 'VOICE') {
    await memoryService.addVoice(pearl, (req.files?.media || [])[0], {
      label: req.body.title,
      seconds: req.body.duration
    });
  } else {
    await memoryService.addVideo(pearl, (req.files?.media || [])[0], (req.files?.poster || [])[0], {
      label: req.body.title,
      seconds: req.body.duration
    });
  }

  await pearlService.touch(pearl.id);
  res.status(201).json(await payload(pearl));
});

/* ------------------------------------------------------------
   PATCH /api/memories/:id — the words on a card, or a whole written page.
   ------------------------------------------------------------ */
const update = asyncHandler(async (req, res) => {
  const row = await memoryService.byIdOrFail(req.pearl.id, req.params.id);

  if (row.type === 'NOTE') {
    await memoryService.updateNote(req.pearl, row.id, req.body);
  } else if ('title' in req.body || 'caption' in req.body || 'label' in req.body) {
    await memoryService.rename(req.pearl, row.id, req.body.title ?? req.body.caption ?? req.body.label);
  }

  await pearlService.touch(req.pearl.id);
  res.json(await payload(req.pearl));
});

/** DELETE /api/memories/:id — the files go with the row. */
const destroy = asyncHandler(async (req, res) => {
  await memoryService.remove(req.pearl, req.params.id);
  await pearlService.touch(req.pearl.id);
  res.json(await payload(req.pearl));
});

/** POST /api/memories/reorder — { ids[] } after a drag.
    One order for the whole album; `type` is accepted and ignored. */
const reorder = asyncHandler(async (req, res) => {
  await memoryService.reorder(req.pearl, req.body.ids);
  await pearlService.touch(req.pearl.id);
  res.json(await payload(req.pearl));
});

/* Every write answers with the whole list, so a client never has to guess
   what changed: it redraws from one truth. */
async function payload(pearl) {
  const rows = await pearlService.memoriesOf(pearl.id);
  return { memories: serialize.memories(rows) };
}

/* A create carries either JSON (a written page) or multipart (everything with
   a file). Sniffing the content type here keeps one route able to accept both
   without the client having to pick a different URL for a note. */
const maybeUpload = (req, res, next) =>
  String(req.get('content-type') || '').includes('multipart/form-data')
    ? uploads.anyMedia(req, res, next)
    : next();

module.exports = { list, getOne, create, update, destroy, reorder, maybeUpload };
