'use strict';
/* ============================================================
   The workshop's door.

   A draft accepts the temporary password the shop handed out; a sealed gift
   accepts only the password its owner chose. The temporary one is erased at
   sealing, so there is nothing here to fall back to once a gift is finished.
   ============================================================ */
const { verifySecret } = require('../utils/crypto');
const { badRequest, unauthorized } = require('../utils/httpError');
const pearlService = require('./pearl.service');
const memoryService = require('./memory.service');
const sessionService = require('./session.service');

/** What to ask for at the door — no content, only which password. */
const door = pearl => ({
  ok: true,
  slug: pearl.slug,
  sealed: pearl.status === 'SEALED',
  asks: pearl.status === 'SEALED' ? 'owner' : 'temporary'
});

async function openSession(pearl, password) {
  const given = String(password ?? '').trim();
  if (!given) throw badRequest('Entrez votre mot de passe.');

  const ok = pearl.status === 'SEALED'
    ? verifySecret(given, pearl.passHash, pearl.passSalt)
    : (!!pearl.tempHash && verifySecret(given, pearl.tempHash, pearl.tempSalt));

  if (!ok) throw unauthorized('Mot de passe incorrect');

  return sessionService.open(pearl, 'BUILDER');
}

/* ------------------------------------------------------------
   Sealing. The owner's password takes over and the temporary one stops
   existing. Every session open at that moment is dropped, including the
   caller's — who is handed a fresh one so they stay where they are.
   ------------------------------------------------------------ */
async function finish(pearl, { password, confirm }) {
  const pw = String(password ?? '').trim();
  const cf = String(confirm ?? '').trim();

  if (!pw) throw badRequest('Choisissez votre mot de passe.');
  if (pw.length < 4) throw badRequest('Le mot de passe doit faire au moins 4 caractères.');
  if (pw.length > 64) throw badRequest('Le mot de passe est trop long.');
  if (pw !== cf) throw badRequest('Les deux mots de passe ne sont pas identiques.');

  if (await memoryService.isEmpty(pearl.id)) {
    throw badRequest('Ajoutez au moins un souvenir avant de terminer.');
  }

  const sealed = await pearlService.seal(pearl.id, pw);
  const session = await sessionService.open(sealed, 'BUILDER');
  return { pearl: sealed, session };
}

module.exports = { door, openSession, finish };
