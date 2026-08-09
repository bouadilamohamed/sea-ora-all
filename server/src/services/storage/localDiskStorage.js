'use strict';
/* ============================================================
   Local disk storage
   The default driver. Files land under UPLOAD_DIR in one of three folders,
   and only their RELATIVE path ("images/ab12.webp") is ever stored — so the
   same rows keep working if the folder moves, and so swapping this driver for
   an S3-compatible one changes nothing outside this file.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const env = require('../../config/env');

const FOLDERS = { images: 'images', videos: 'videos', audio: 'audio' };

for (const folder of Object.values(FOLDERS)) {
  fs.mkdirSync(path.join(env.uploadDir, folder), { recursive: true });
}

/* A stored path is data from the database, but it is also a filename: it must
   never be able to climb out of the upload folder. */
function resolveSafe(storagePath) {
  const rel = String(storagePath || '').replace(/^\/+/, '');
  const full = path.resolve(env.uploadDir, rel);
  const root = path.resolve(env.uploadDir);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing to touch a path outside the upload directory: ${storagePath}`);
  }
  return full;
}

const localDiskStorage = {
  name: 'local',
  root: env.uploadDir,

  /** @returns {Promise<string>} the storage path to keep in the database */
  async save(folder, filename, buffer) {
    const dir = FOLDERS[folder];
    if (!dir) throw new Error(`Unknown storage folder: ${folder}`);
    const rel = `${dir}/${filename}`;
    await fs.promises.writeFile(resolveSafe(rel), buffer);
    return rel;
  },

  async remove(storagePath) {
    if (!storagePath) return;
    try {
      await fs.promises.unlink(resolveSafe(storagePath));
    } catch (_) {
      /* already gone, or never written — nothing to undo */
    }
  },

  async removeMany(paths) {
    await Promise.all((paths || []).filter(Boolean).map(p => this.remove(p)));
  },

  async exists(storagePath) {
    try {
      await fs.promises.access(resolveSafe(storagePath));
      return true;
    } catch (_) {
      return false;
    }
  },

  /** Express serves this folder at /m — see app.js. */
  servePath() {
    return env.uploadDir;
  }
};

module.exports = localDiskStorage;
