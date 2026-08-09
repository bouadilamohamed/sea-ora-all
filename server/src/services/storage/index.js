'use strict';
/* ============================================================
   The storage seam.

   Everything above this line speaks in storage paths — "images/ab12.webp" —
   and never in filesystems, buckets or hosts. Adding an S3 driver means
   writing one module with the same four methods and naming it in
   STORAGE_DRIVER; no controller, service or database row changes.

   Interface:
     save(folder, filename, buffer) → Promise<storagePath>
     remove(storagePath)            → Promise<void>
     removeMany(storagePath[])      → Promise<void>
     exists(storagePath)            → Promise<boolean>

   Two drivers ship. `database` keeps the bytes in PostgreSQL, so one backup
   takes the gift whole; `local` keeps them under UPLOAD_DIR. The drivers are
   required lazily — the disk one creates its folders on load, and a
   deployment that never touches the disk should not have them appear.
   ============================================================ */
const env = require('../../config/env');

const drivers = {
  database: () => require('./databaseStorage'),
  local: () => require('./localDiskStorage')
};

const load = drivers[env.storageDriver];
if (!load) {
  throw new Error(
    `Unknown STORAGE_DRIVER "${env.storageDriver}". Known drivers: ${Object.keys(drivers).join(', ')}.`
  );
}

module.exports = load();
