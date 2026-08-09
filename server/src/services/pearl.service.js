'use strict';
/* ============================================================
   Pearls — the gift itself: its door, its secrets, its letter.
   Controllers never touch Prisma; everything a pearl can do lives here.
   ============================================================ */
const prisma = require('../config/prisma');
const env = require('../config/env');
const { randomId, hashSecret, normalizeReference, referenceKey } = require('../utils/crypto');
const { clean, multiline } = require('../utils/text');
const { badRequest, notFound } = require('../utils/httpError');
const memoryService = require('./memory.service');
const mediaService = require('./media.service');

const ORDER = [{ position: 'asc' }, { id: 'asc' }];

const bySlug = slug => prisma.pearl.findUnique({ where: { slug: String(slug || '') } });

async function bySlugOrFail(slug) {
  const pearl = await bySlug(slug);
  if (!pearl) throw notFound('Introuvable');
  return pearl;
}

/* ------------------------------------------------------------
   The reference, which is unique.

   It is engraved on ONE object, so it names one gift. Everything that sets a
   reference goes through here: the digest that the unique index is built on,
   and the check that says so in French before PostgreSQL says it in SQL.

   The index is still the real guarantee — two administrators creating the
   same reference in the same second will get past this check, and one of the
   two inserts will fail. `refuseDuplicateReference` below turns that failure
   into the same sentence rather than a 500.
   ------------------------------------------------------------ */
async function referenceFields(reference, { exceptId } = {}) {
  const normalised = normalizeReference(reference);
  if (!normalised) return { refHash: null, refSalt: null, refKey: null };

  const refKey = referenceKey(normalised, env.referencePepper);
  const clash = await prisma.pearl.findUnique({
    where: { refKey },
    select: { id: true, slug: true }
  });
  if (clash && clash.id !== exceptId) {
    throw badRequest(`Cette référence est déjà utilisée par un autre cadeau (${clash.slug}).`);
  }

  const { hash, salt } = hashSecret(normalised);
  return { refHash: hash, refSalt: salt, refKey };
}

/** The unique index firing is the same problem, so it gets the same words. */
function refuseDuplicateReference(err) {
  const target = err?.meta?.target;
  const onRefKey = Array.isArray(target) ? target.includes('ref_key') : String(target || '').includes('ref_key');
  if (err?.code === 'P2002' && onRefKey) {
    throw badRequest('Cette référence est déjà utilisée par un autre cadeau.');
  }
  throw err;
}

/** Every memory of a pearl, in one query, already in pile order. */
/* One album, in ONE order.

   These rows used to come back grouped by `type` — every photograph, then
   every film, then the voices, then the written pages — because the viewer
   showed four separate piles and each kind numbered its own. There is one
   pile now, and `position` is the pearl's whole sequence, so a gift is read
   back in exactly the order its author built it: a photograph, then a voice,
   then another photograph, then a note, if that is how they added them. */
const memoriesOf = pearlId => prisma.memory.findMany({
  where: { pearlId },
  orderBy: ORDER
});

/* ------------------------------------------------------------
   Creating a full pearl in one shot — the creation panel's route.
   Either the pearl and all of its media land, or nothing does.
   ------------------------------------------------------------ */
async function createSealed({ password, reference, message, autoplay, photos, voices }) {
  const { hash, salt } = hashSecret(password);
  /* The reference is a second secret AND a unique name: hashed for the gate,
     digested for the index, refused if another gift already carries it. */
  const ref = await referenceFields(reference);

  const pearl = await prisma.pearl.create({
    data: {
      slug: randomId(10),
      manageKey: randomId(24),
      status: 'SEALED',
      passHash: hash,
      passSalt: salt,
      ...ref,
      title: 'Pour toi',
      subtitle: '',
      message: multiline(message, 600),
      autoplay: autoplay !== false,
      /* One sequence across both kinds. Numbering the photographs 0,1,2 and
         the voices 0,1,2 as well used to be harmless, because the album read
         the two groups separately; now `position` IS the album's order and
         two memories may not share a place. The panel posts photographs and
         then voices, so that is the order they take. */
      memories: {
        create: [
          ...photos.map((p, i) => ({
            type: 'PHOTO',
            title: clean(p.caption, 140),
            mediaUrl: p.mediaUrl,
            thumbnailUrl: p.thumbnailUrl,
            width: p.width,
            height: p.height,
            position: i
          })),
          ...voices.map((a, i) => ({
            type: 'VOICE',
            title: clean(a.label, 60),
            mediaUrl: a.mediaUrl,
            mimeType: a.mimeType,
            duration: a.duration ?? null,
            position: photos.length + i
          }))
        ]
      }
    }
  }).catch(refuseDuplicateReference);

  return pearl;
}

/* ------------------------------------------------------------
   An empty gift, generated by an administrator.
   ------------------------------------------------------------ */
async function createDraft({ reference, tempPassword }) {
  const ref = await referenceFields(reference);
  const tmp = hashSecret(tempPassword);

  /* The owner's code does not exist yet, and passHash may not be null. A hash
     of 48 random characters nobody has ever seen is stored instead: the gate
     is mathematically unopenable until the customer seals the gift. */
  const unusable = hashSecret(randomId(48));

  return prisma.pearl.create({
    data: {
      slug: randomId(10),
      manageKey: randomId(24),
      status: 'DRAFT',
      passHash: unusable.hash,
      passSalt: unusable.salt,
      ...ref,
      tempHash: tmp.hash,
      tempSalt: tmp.salt
    }
  }).catch(refuseDuplicateReference);
}

/* ------------------------------------------------------------
   Sealing. The owner's code replaces the unusable one, the temporary
   password is wiped in the SAME transaction, and every session opened with
   the old password is revoked — including the caller's, who is handed a new
   one immediately. There is no instant in which both passwords work.
   ------------------------------------------------------------ */
async function seal(pearlId, password) {
  const { hash, salt } = hashSecret(password);
  return prisma.$transaction(async tx => {
    const pearl = await tx.pearl.update({
      where: { id: pearlId },
      data: {
        passHash: hash,
        passSalt: salt,
        tempHash: null,
        tempSalt: null,
        status: 'SEALED'
      }
    });
    await tx.session.deleteMany({ where: { pearlId } });
    return pearl;
  });
}

const setMessage = (pearlId, message) =>
  prisma.pearl.update({ where: { id: pearlId }, data: { message: multiline(message, 600) } });

const touch = pearlId =>
  prisma.pearl.update({ where: { id: pearlId }, data: { updatedAt: new Date() } });

const bumpViews = slug =>
  prisma.pearl.update({ where: { slug }, data: { views: { increment: 1 } } }).catch(() => {});

const bumpUnlocks = slug =>
  prisma.pearl.update({ where: { slug }, data: { unlocks: { increment: 1 } } }).catch(() => {});

/* ------------------------------------------------------------
   Manage endpoints — guarded by the manage key.
   ------------------------------------------------------------ */
async function updateMeta(pearl, body) {
  const data = {
    title: clean(body.title, 60, pearl.title),
    subtitle: clean(body.subtitle, 120, pearl.subtitle),
    gateTitle: clean(body.gateTitle, 60, pearl.gateTitle),
    gateNote: clean(body.gateNote, 140, pearl.gateNote),
    passHint: clean(body.hint, 80) || null,
    autoplay: body.autoplay !== false
  };
  if ('message' in body) data.message = multiline(body.message, 600);

  if (body.password) {
    const { hash, salt } = hashSecret(String(body.password).trim());
    data.passHash = hash;
    data.passSalt = salt;
  }

  /* reference: absent from the body → untouched; empty string or null →
     removed, so a pearl can go back to opening on the code alone. Setting one
     that another gift already carries is refused — `exceptId` is what lets a
     pearl keep its own. */
  if ('reference' in body) {
    Object.assign(data, await referenceFields(body.reference, { exceptId: pearl.id }));
  }

  return prisma.pearl.update({ where: { id: pearl.id }, data })
    .catch(refuseDuplicateReference);
}

/** Delete a pearl and everything it owns — rows cascade, files do not. */
async function destroy(pearl) {
  const rows = await memoriesOf(pearl.id);
  await prisma.pearl.delete({ where: { id: pearl.id } });
  await mediaService.removeFiles(memoryService.filesOf(rows));
}

/** The forty most recent gifts, with their counts — the admin list. */
async function recent(limit = 40) {
  const pearls = await prisma.pearl.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { slug: true, status: true, createdAt: true, updatedAt: true }
  });
  if (!pearls.length) return [];

  const grouped = await prisma.memory.groupBy({
    by: ['pearlId', 'type'],
    _count: { _all: true },
    where: { pearl: { slug: { in: pearls.map(p => p.slug) } } }
  });
  const bySlugId = await prisma.pearl.findMany({
    where: { slug: { in: pearls.map(p => p.slug) } },
    select: { id: true, slug: true }
  });
  const slugOf = new Map(bySlugId.map(p => [p.id, p.slug]));

  const counts = new Map();
  for (const g of grouped) {
    const slug = slugOf.get(g.pearlId);
    if (!slug) continue;
    const entry = counts.get(slug) || { images: 0, videos: 0, audios: 0, notes: 0 };
    if (g.type === 'PHOTO') entry.images = g._count._all;
    if (g.type === 'VIDEO') entry.videos = g._count._all;
    if (g.type === 'VOICE') entry.audios = g._count._all;
    if (g.type === 'NOTE') entry.notes = g._count._all;
    counts.set(slug, entry);
  }

  return pearls.map(p => ({
    ...p,
    counts: counts.get(p.slug) || { images: 0, videos: 0, audios: 0, notes: 0 }
  }));
}

const limits = () => ({
  images: env.limits.images,
  audios: env.limits.audios,
  videos: env.limits.videos,
  notes: env.limits.notes,
  imageMb: env.limits.imageMb,
  audioMb: env.limits.audioMb,
  videoMb: env.limits.videoMb
});

module.exports = {
  bySlug, bySlugOrFail, memoriesOf,
  createSealed, createDraft, seal, setMessage, touch,
  bumpViews, bumpUnlocks, updateMeta, destroy, recent, limits
};
