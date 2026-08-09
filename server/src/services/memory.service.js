'use strict';
/* ============================================================
   Memories — add, replace, rename, reorder, remove.

   Every kind of memory goes through the same four verbs; only the media
   handling differs, and that lives in media.service.

   There is ONE order per gift. `position` used to be numbered inside each
   type — photographs 0,1,2 and voices also 0,1,2 — and the album read the
   four groups one after another. That threw away the only ordering the author
   ever actually expressed: the order they added things in. A gift built as
   photo, voice, photo, note came back as photo, photo, voice, note.

   `position` is now the pearl's whole sequence. The order is the author's.
   ============================================================ */
const prisma = require('../config/prisma');
const env = require('../config/env');
const media = require('./media.service');
const { clean, multiline, toSeconds } = require('../utils/text');
const { badRequest, notFound } = require('../utils/httpError');

const ORDER = [{ position: 'asc' }, { id: 'asc' }];

const LIMIT_OF = {
  PHOTO: () => env.limits.images,
  VIDEO: () => env.limits.videos,
  VOICE: () => env.limits.audios,
  NOTE: () => env.limits.notes
};

const NOUN = { PHOTO: 'photos', VIDEO: 'vidéos', VOICE: 'messages vocaux', NOTE: 'souvenirs écrits' };

/** Every memory of one gift, in the author's order. */
const listAll = pearlId => prisma.memory.findMany({ where: { pearlId }, orderBy: ORDER });

const listOf = (pearlId, type) =>
  prisma.memory.findMany({ where: { pearlId, type }, orderBy: ORDER });

const countOf = (pearlId, type) => prisma.memory.count({ where: { pearlId, type } });

async function byIdOrFail(pearlId, id, type) {
  const row = await prisma.memory.findFirst({ where: { id: Number(id), pearlId } });
  if (!row) throw notFound('Souvenir introuvable');
  if (type && row.type !== type) throw notFound('Souvenir introuvable');
  return row;
}

/** The next free slot in the WHOLE gift, so anything added lands at the end. */
async function nextPosition(pearlId) {
  const last = await prisma.memory.findFirst({
    where: { pearlId },
    orderBy: { position: 'desc' },
    select: { position: true }
  });
  return last ? last.position + 1 : 0;
}

/* The limits stay per kind: they exist because twenty-four photographs and
   six films cost very different amounts to store and to send. */
async function assertRoom(pearlId, type, incoming = 1) {
  const max = LIMIT_OF[type]();
  const already = await countOf(pearlId, type);
  if (already + incoming > max) {
    throw badRequest(`Vous pouvez garder ${max} ${NOUN[type]} au maximum.`);
  }
}

/** Every storage path a set of rows owns — what has to be deleted with them. */
const filesOf = rows =>
  rows.flatMap(r => [r.mediaUrl, r.thumbnailUrl, r.posterUrl]).filter(Boolean);

/* ------------------------------------------------------------
   photographs
   ------------------------------------------------------------ */
async function addPhotos(pearl, files) {
  if (!files.length) throw badRequest('Aucune photo reçue.');
  await assertRoom(pearl.id, 'PHOTO', files.length);

  const written = [];
  try {
    const processed = [];
    for (const f of files) {
      const out = await media.processImage(f.buffer);
      written.push(out.mediaUrl, out.thumbnailUrl);
      processed.push(out);
    }
    /* Several photographs chosen at once keep the order they were chosen in,
       one after another at the end of the album. */
    let position = await nextPosition(pearl.id);
    await prisma.$transaction(processed.map(p => prisma.memory.create({
      data: {
        pearlId: pearl.id,
        type: 'PHOTO',
        mediaUrl: p.mediaUrl,
        thumbnailUrl: p.thumbnailUrl,
        width: p.width,
        height: p.height,
        position: position++
      }
    })));
  } catch (err) {
    await media.removeFiles(written);   // don't leave orphan files behind
    throw err;
  }
}

/* Replacing keeps the memory in place: same row, same position in the pile,
   only the picture behind it changes — so the stack does not jump. */
async function replacePhoto(pearl, id, file) {
  const row = await byIdOrFail(pearl.id, id, 'PHOTO');
  if (!file) throw badRequest('Aucune photo reçue.');

  const written = [];
  try {
    const out = await media.processImage(file.buffer);
    written.push(out.mediaUrl, out.thumbnailUrl);
    await prisma.memory.update({
      where: { id: row.id },
      data: {
        mediaUrl: out.mediaUrl,
        thumbnailUrl: out.thumbnailUrl,
        width: out.width,
        height: out.height
      }
    });
    await media.removeFiles([row.mediaUrl, row.thumbnailUrl]);
  } catch (err) {
    await media.removeFiles(written);
    throw err;
  }
}

/* ------------------------------------------------------------
   voices
   ------------------------------------------------------------ */
async function addVoice(pearl, file, { label, seconds }) {
  if (!file) throw badRequest('Aucun enregistrement reçu.');
  await assertRoom(pearl.id, 'VOICE');

  const written = [];
  try {
    const out = await media.saveAudio(file.buffer, file.mimetype);
    written.push(out.mediaUrl);
    await prisma.memory.create({
      data: {
        pearlId: pearl.id,
        type: 'VOICE',
        title: clean(label, 60),
        mediaUrl: out.mediaUrl,
        mimeType: out.mimeType,
        duration: toSeconds(seconds),
        position: await nextPosition(pearl.id)
      }
    });
  } catch (err) {
    await media.removeFiles(written);
    throw err;
  }
}

async function replaceVoice(pearl, id, file, { seconds }) {
  const row = await byIdOrFail(pearl.id, id, 'VOICE');
  if (!file) throw badRequest('Aucun enregistrement reçu.');

  const written = [];
  try {
    const out = await media.saveAudio(file.buffer, file.mimetype);
    written.push(out.mediaUrl);
    await prisma.memory.update({
      where: { id: row.id },
      data: { mediaUrl: out.mediaUrl, mimeType: out.mimeType, duration: toSeconds(seconds) }
    });
    await media.removeFiles([row.mediaUrl]);
  } catch (err) {
    await media.removeFiles(written);
    throw err;
  }
}

/* ------------------------------------------------------------
   films
   The poster is grabbed in the sender's browser before the upload: without
   ffmpeg the server cannot pull a frame, and a video card with nothing on it
   would break the pile the moment it lands.
   ------------------------------------------------------------ */
async function addVideo(pearl, videoFile, posterFile, { label, seconds }) {
  if (!videoFile) throw badRequest('Aucune vidéo reçue.');
  await assertRoom(pearl.id, 'VIDEO');

  const written = [];
  try {
    const out = await media.saveVideo(videoFile.buffer, videoFile.mimetype);
    written.push(out.mediaUrl);
    let posterUrl = null;
    if (posterFile) {
      posterUrl = await media.processPoster(posterFile.buffer);
      written.push(posterUrl);
    }
    await prisma.memory.create({
      data: {
        pearlId: pearl.id,
        type: 'VIDEO',
        title: clean(label, 60),
        mediaUrl: out.mediaUrl,
        mimeType: out.mimeType,
        posterUrl,
        duration: toSeconds(seconds),
        position: await nextPosition(pearl.id)
      }
    });
  } catch (err) {
    await media.removeFiles(written);
    throw err;
  }
}

async function replaceVideo(pearl, id, videoFile, posterFile, { seconds }) {
  const row = await byIdOrFail(pearl.id, id, 'VIDEO');
  if (!videoFile) throw badRequest('Aucune vidéo reçue.');

  const written = [];
  try {
    const out = await media.saveVideo(videoFile.buffer, videoFile.mimetype);
    written.push(out.mediaUrl);
    let posterUrl = null;
    if (posterFile) {
      posterUrl = await media.processPoster(posterFile.buffer);
      written.push(posterUrl);
    }
    await prisma.memory.update({
      where: { id: row.id },
      data: {
        mediaUrl: out.mediaUrl,
        mimeType: out.mimeType,
        posterUrl: posterUrl || row.posterUrl,
        duration: toSeconds(seconds)
      }
    });
    await media.removeFiles(posterUrl ? [row.mediaUrl, row.posterUrl] : [row.mediaUrl]);
  } catch (err) {
    await media.removeFiles(written);
    throw err;
  }
}

/* ------------------------------------------------------------
   written pages
   ------------------------------------------------------------ */
function readNote(body, previous) {
  const title = 'title' in body ? clean(body.title, 80) : (previous ? previous.title : '');
  const description = 'body' in body ? multiline(body.body, 1200)
    : 'description' in body ? multiline(body.description, 1200)
      : (previous ? previous.description : '');
  const date = 'day' in body ? clean(body.day, 60)
    : 'date' in body ? clean(body.date, 60)
      : (previous ? previous.date : '');
  if (!title.trim() && !description.trim()) {
    throw badRequest('Écrivez au moins un titre ou quelques mots.');
  }
  return { title, description, date };
}

async function addNote(pearl, body) {
  await assertRoom(pearl.id, 'NOTE');
  const note = readNote(body, null);
  await prisma.memory.create({
    data: { pearlId: pearl.id, type: 'NOTE', ...note, position: await nextPosition(pearl.id) }
  });
}

async function updateNote(pearl, id, body) {
  const row = await byIdOrFail(pearl.id, id, 'NOTE');
  await prisma.memory.update({ where: { id: row.id }, data: readNote(body, row) });
}

/* ------------------------------------------------------------
   the words on a card, and throwing one away
   ------------------------------------------------------------ */
async function rename(pearl, id, value) {
  const row = await byIdOrFail(pearl.id, id);
  const max = row.type === 'PHOTO' ? 140 : row.type === 'NOTE' ? 80 : 60;
  await prisma.memory.update({ where: { id: row.id }, data: { title: clean(value, max) } });
}

async function remove(pearl, id) {
  const row = await byIdOrFail(pearl.id, id);
  await prisma.memory.delete({ where: { id: row.id } });
  await media.removeFiles(filesOf([row]));
}

/* ------------------------------------------------------------
   the order of the album — sent as the full list of ids after a drag

   One list, all kinds together, because there is one pile. A photograph can
   be dragged in between two voices.
   ------------------------------------------------------------ */
async function reorder(pearl, ids) {
  const own = await listAll(pearl.id);
  const valid = new Set(own.map(r => r.id));

  /* Only ids that belong to this gift are honoured, and anything the client
     forgot keeps its place at the end — a stale list can never delete a
     memory by omission. */
  const wanted = (Array.isArray(ids) ? ids : []).map(Number).filter(id => valid.has(id));
  const seen = new Set(wanted);
  const rest = own.map(r => r.id).filter(id => !seen.has(id));

  const finalOrder = [...new Set([...wanted, ...rest])];
  await prisma.$transaction(finalOrder.map((id, i) =>
    prisma.memory.update({ where: { id }, data: { position: i } })
  ));
}

/** Is there anything at all in this gift? Sealing an empty one is refused. */
const isEmpty = async pearlId => (await prisma.memory.count({ where: { pearlId } })) === 0;

module.exports = {
  listAll, listOf, countOf, byIdOrFail, filesOf, isEmpty,
  addPhotos, replacePhoto,
  addVoice, replaceVoice,
  addVideo, replaceVideo,
  addNote, updateNote,
  rename, remove, reorder
};
