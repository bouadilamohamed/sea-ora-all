'use strict';
/* ============================================================
   The gate.

   Two rules from the original survive here word for word, because they are
   the whole security of the thing:

   1. The MEDIA IS WITHHELD. Reading a pearl returns the door's wording and
      nothing else — no image URL, no audio URL — until a code has been
      verified server-side. The filenames are 16 random characters, so a URL
      is itself the capability; handing them out before the code is checked
      would make the code decorative.

   2. BOTH HALVES ARE ALWAYS CHECKED. When a pearl was sealed with a
      reference, the code and the reference are verified without a `&&`
      short-circuit, and either failure produces the same message — so
      neither the wording nor the response time tells an attacker which half
      they got right.
   ============================================================ */
const prisma = require('../config/prisma');
const env = require('../config/env');
const { verifySecret, normalizeReference, constantTimeEquals } = require('../utils/crypto');
const { badRequest, unauthorized, notFound, conflict, tooMany } = require('../utils/httpError');
const pearlService = require('./pearl.service');
const sessionService = require('./session.service');

/* ---------- anti-brute-force: per IP, per pearl, per window ---------- */

async function attemptsFor(slug, ip) {
  return prisma.unlockAttempt.count({
    where: { slug, ip, createdAt: { gt: new Date(Date.now() - env.unlock.windowMs) } }
  });
}

const logAttempt = (slug, ip) =>
  prisma.unlockAttempt.create({ data: { slug, ip } }).catch(() => {});

const clearAttempts = (slug, ip) =>
  prisma.unlockAttempt.deleteMany({ where: { slug, ip } }).catch(() => {});

/* ---------- the door's wording, and nothing else ---------- */

async function gate(slug) {
  const pearl = await pearlService.bySlug(slug);
  if (!pearl) throw notFound('Introuvable');

  /* A gift the customer has not finished yet is not a pearl anyone may try to
     open: it holds no code of its own, and its media is still being chosen.
     The gate says so instead of offering a field that cannot work. */
  if (pearl.status === 'DRAFT') {
    throw conflict('Ce cadeau est encore en préparation.', {
      draft: true,
      gateTitle: 'Cadeau en préparation',
      gateNote: 'Cette perle n’a pas encore été scellée par son auteur.'
    });
  }

  pearlService.bumpViews(pearl.slug);

  return {
    ok: true,
    slug: pearl.slug,
    gateTitle: pearl.gateTitle,
    gateNote: pearl.gateNote,
    hint: pearl.passHint || '',
    /* whether to SHOW the field — never the value itself */
    needsRef: !!pearl.refHash,
    autoplay: pearl.autoplay
  };
}

/* ---------- the demo pearl ----------
   Opening the app without a slug lands on the seeded demo. Its passcode is
   PASSCODE from the environment, and it is compared HERE — the browser never
   receives it, in the demo any more than in a real gift. If the demo pearl
   was never seeded, the comparison still happens against PASSCODE and the
   viewer falls back to its own built-in cards, exactly as it always has. */

async function demoGate() {
  const pearl = await pearlService.bySlug(env.demoSlug);
  if (pearl && pearl.status === 'SEALED') return gate(pearl.slug);
  return {
    ok: true,
    slug: null,
    gateTitle: 'Coquillage scellé',
    gateNote: 'Entrez le code secret pour révéler la perle',
    hint: '',
    needsRef: false,
    autoplay: true,
    demo: true
  };
}

/* ---------- unlocking ---------- */

/**
 * Verify a passcode and, on success, release the pearl's memories.
 * @returns {Promise<{pearl:object|null, rows:array, session:object|null, demo:boolean}>}
 */
async function unlock({ slug, password, reference, ip }) {
  const given = String(password ?? '').trim();
  const targetSlug = slug || env.demoSlug;

  const pearl = await pearlService.bySlug(targetSlug);

  /* No such pearl. When a slug was explicitly asked for, that is a 404. When
     it was the implicit demo, fall back to comparing PASSCODE directly so the
     experience still opens on a database that has not been seeded. */
  if (!pearl) {
    if (slug) throw notFound('Introuvable');
    if (!given) throw badRequest('Entrez le code secret.');
    if (!constantTimeEquals(given, env.passcode)) {
      await guardAndReject({ slug: env.demoSlug, ip, needsRef: false });
    }
    return { pearl: null, rows: [], session: null, demo: true };
  }

  if (pearl.status === 'DRAFT') {
    throw conflict('Ce cadeau est encore en préparation.', { draft: true });
  }

  /* The throttle is consulted before anything expensive happens: scrypt is
     deliberately slow, and a locked-out address should not be able to spend
     the server's CPU on it. */
  const tries = await attemptsFor(pearl.slug, ip);
  if (tries >= env.unlock.maxTries) {
    throw tooMany('Trop de tentatives. Réessayez dans quelques minutes.');
  }

  const needsRef = !!pearl.refHash;
  const givenRef = normalizeReference(reference);

  /* An empty body is a malformed request, not a wrong guess — it does not
     burn one of the twelve attempts. */
  if (!given) throw badRequest('Entrez le code secret.');
  if (needsRef && !givenRef) {
    /* needsRef lets a viewer that missed the gate metadata (offline at boot)
       reveal the field rather than fail without explanation. */
    throw badRequest('Entrez la référence.', { needsRef: true });
  }

  /* No short-circuit: both are evaluated whatever the first one says. */
  const passOk = verifySecret(given, pearl.passHash, pearl.passSalt);
  const refOk = needsRef ? verifySecret(givenRef, pearl.refHash, pearl.refSalt) : true;

  if (!passOk || !refOk) {
    await logAttempt(pearl.slug, ip);
    throw unauthorized(needsRef ? 'Référence ou code incorrect' : 'Code incorrect', {
      remaining: Math.max(0, env.unlock.maxTries - tries - 1)
    });
  }

  await clearAttempts(pearl.slug, ip);
  pearlService.bumpUnlocks(pearl.slug);

  const rows = await pearlService.memoriesOf(pearl.id);
  const session = await sessionService.open(pearl, 'VIEW');
  return { pearl, rows, session, demo: false };
}

/* A wrong demo code is throttled exactly like a wrong real one. */
async function guardAndReject({ slug, ip }) {
  const tries = await attemptsFor(slug, ip);
  if (tries >= env.unlock.maxTries) {
    throw tooMany('Trop de tentatives. Réessayez dans quelques minutes.');
  }
  await logAttempt(slug, ip);
  throw unauthorized('Code incorrect', {
    remaining: Math.max(0, env.unlock.maxTries - tries - 1)
  });
}

module.exports = { gate, demoGate, unlock };
