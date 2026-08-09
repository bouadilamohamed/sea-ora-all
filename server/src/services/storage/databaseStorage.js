'use strict';
/* ============================================================
   Database storage
   The bytes live in PostgreSQL, in `media_blobs`, keyed by the same relative
   path the Memory rows already carry ("images/ab12.webp"). Nothing above this
   file changes: the interface is the same four methods, and the column still
   holds a path rather than a host.

   One backup takes the gift with its photographs, its films and its voices.
   ============================================================ */
const prisma = require('../../config/prisma');

const FOLDERS = { images: 'images', videos: 'videos', audio: 'audio' };

const MIME_BY_EXT = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', ogv: 'video/ogg', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg',
  wav: 'audio/wav', oga: 'audio/ogg'
};

function normalise(storagePath) {
  const rel = String(storagePath || '').replace(/^\/+/, '');
  if (!rel || rel.includes('..') || rel.includes('\\')) {
    throw new Error(`Refusing a malformed storage path: ${storagePath}`);
  }
  return rel;
}

/* `.webm` and `.ogg` are both a film and a recording, so the folder decides:
   a voice note saved as video/webm is one a phone refuses to play. */
function mimeOf(rel, folder) {
  const ext = rel.split('.').pop().toLowerCase();
  if (folder === 'audio') {
    if (ext === 'webm') return 'audio/webm';
    if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
  }
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

const databaseStorage = {
  name: 'database',

  async save(folder, filename, buffer, mimeType) {
    const dir = FOLDERS[folder];
    if (!dir) throw new Error(`Unknown storage folder: ${folder}`);
    const rel = normalise(`${dir}/${filename}`);
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const row = { mimeType: mimeType || mimeOf(rel, folder), size: data.length, data };
    await prisma.mediaBlob.upsert({
      where: { path: rel },
      create: { path: rel, ...row },
      update: row
    });
    return rel;
  },

  async remove(storagePath) {
    if (!storagePath) return;
    try {
      await prisma.mediaBlob.delete({ where: { path: normalise(storagePath) } });
    } catch (_) {
      /* already gone, or never written */
    }
  },

  async removeMany(paths) {
    const list = (paths || []).filter(Boolean).map(p => {
      try { return normalise(p); } catch (_) { return null; }
    }).filter(Boolean);
    if (!list.length) return;
    await prisma.mediaBlob.deleteMany({ where: { path: { in: list } } });
  },

  async exists(storagePath) {
    if (!storagePath) return false;
    try {
      const found = await prisma.mediaBlob.findUnique({
        where: { path: normalise(storagePath) },
        select: { path: true }
      });
      return !!found;
    } catch (_) {
      return false;
    }
  },

  /* What /m needs and a filesystem gives away for free: the metadata without
     the bytes, so a HEAD or a 304 never pulls a hundred megabytes out of the
     database to answer with nothing. */
  async head(storagePath) {
    try {
      return await prisma.mediaBlob.findUnique({
        where: { path: normalise(storagePath) },
        select: { path: true, mimeType: true, size: true, createdAt: true }
      });
    } catch (_) {
      return null;
    }
  },

  async read(storagePath) {
    try {
      return await prisma.mediaBlob.findUnique({ where: { path: normalise(storagePath) } });
    } catch (_) {
      return null;
    }
  },

  /* There is no folder to hand to express.static — app.js reads that as "this
     driver serves itself" and mounts the handler below instead. */
  servePath() {
    return null;
  }
};

module.exports = databaseStorage;
