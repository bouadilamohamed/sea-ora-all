'use strict';
/* ============================================================
   Sessions
   A bearer token bound to exactly one pearl and one capability. A VIEW token
   may read a gift's memories; a BUILDER token may edit them. A token minted
   for one pearl is worth nothing against another, which is why the pearl id
   is checked on every use rather than trusted from the token.
   ============================================================ */
const prisma = require('../config/prisma');
const env = require('../config/env');
const { randomId } = require('../utils/crypto');

async function open(pearl, kind) {
  const token = randomId(32);
  const ms = kind === 'VIEW' ? env.viewSessionMs : env.builderSessionMs;
  const expiresAt = new Date(Date.now() + ms);
  await prisma.session.create({ data: { token, pearlId: pearl.id, kind, expiresAt } });
  return { token, expiresAt: expiresAt.getTime() };
}

/** The session behind a token, or null — expired ones never resolve. */
async function resolve(token, kind) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token: String(token) },
    include: { pearl: true }
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (kind && session.kind !== kind) return null;
  return session;
}

const revokeAll = pearlId => prisma.session.deleteMany({ where: { pearlId } });

/** Housekeeping: drop dead sessions and stale attempt records. */
async function prune() {
  const now = new Date();
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.unlockAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 86400e3) } }
  });
}

module.exports = { open, resolve, revokeAll, prune };
