'use strict';
const crypto = require('crypto');

/* url-safe, unambiguous alphabet (no 0/O/1/l) so codes are easy to read
   aloud and to copy off an engraving without a mistake */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

function randomId(len = 12) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/* scrypt — deliberately slow, so a stolen database cannot be brute-forced
   quickly. The passcodes here are short love-notes ("perle"), so the key
   derivation function is what actually protects them. */
const SCRYPT = { N: 16384, r: 8, p: 1 };

function hashSecret(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(plain), salt, 32, SCRYPT).toString('hex');
  return { hash, salt };
}

function verifySecret(plain, hash, salt) {
  try {
    if (!hash || !salt) return false;
    const test = crypto.scryptSync(String(plain), salt, 32, SCRYPT);
    const real = Buffer.from(hash, 'hex');
    return real.length === test.length && crypto.timingSafeEqual(real, test);
  } catch (_) {
    return false;
  }
}

/* The reference is read off an object — an engraving, a card, an order slip —
   and typed back by someone who did not choose it, so casing and stray spaces
   must not lock them out. Dashes stay significant: "SEA-4821" ≠ "SEA4821"
   would be a surprise the other way round. Creation and unlock share this
   function, which is what makes the two comparisons agree. */
function normalizeReference(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/* ------------------------------------------------------------
   The reference's blind index.

   A reference has to be UNIQUE — it is engraved on one physical object and it
   identifies that object — and a scrypt hash cannot answer "does this already
   exist?": every row carries its own salt, so the same reference hashes to a
   different value each time. Uniqueness needs a value that is the same for
   the same input, every time, across every row.

   So each pearl carries two derivations of its reference:

     refHash + refSalt   scrypt, per-row salt — what VERIFIES a visitor's
                         answer at the gate. Unchanged, still slow on purpose.
     refKey              HMAC-SHA-256 of the normalised reference under one
                         server-side pepper — what the unique index is built
                         on, and what a duplicate is detected with.

   The pepper is why this is an HMAC and not a bare digest. A reference is
   short and drawn from a small alphabet; a plain SHA-256 of it would be
   trivially reversed from a stolen database by trying every candidate. With a
   pepper that lives only in the environment, a database on its own says
   nothing — two rows can be seen to share a reference, and that is all.

   REFERENCE_PEPPER is therefore load-bearing: changing it makes every
   existing refKey unmatchable, so duplicate detection silently stops working
   on old rows. It is set once and left alone.
   ------------------------------------------------------------ */
function referenceKey(reference, pepper) {
  const normalised = normalizeReference(reference);
  if (!normalised) return null;
  return crypto.createHmac('sha256', String(pepper || '')).update(normalised).digest('hex');
}

/* A flat comparison for a secret that lives in the environment rather than in
   the database, where a KDF would buy nothing. */
function constantTimeEquals(given, expected) {
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  randomId, hashSecret, verifySecret,
  normalizeReference, referenceKey, constantTimeEquals
};
