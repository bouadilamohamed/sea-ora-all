'use strict';
/* ============================================================
   /m — the media, straight out of PostgreSQL.

   The disk driver gets express.static for free: a conditional request, a
   Range, a long cache. When the bytes live in the database those have to be
   written, and a film is exactly the case that needs them — a browser will not
   scrub through a response that answered 200 to a Range request.

   Filenames are 16 random characters and content at a given name never
   changes, so the cache is immutable and a year long, and the URL itself is
   the capability.
   ============================================================ */
const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

const CACHE = 'public, max-age=31536000, immutable';

function baseHeaders(res, row) {
  res.set('Content-Type', row.mimeType || 'application/octet-stream');
  res.set('Cache-Control', CACHE);
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Accept-Ranges', 'bytes');
  res.set('ETag', `"${row.size}-${new Date(row.createdAt).getTime().toString(36)}"`);
  res.set('Last-Modified', new Date(row.createdAt).toUTCString());
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const span = Number(rawEnd);
    if (!Number.isFinite(span) || span <= 0) return null;
    start = Math.max(0, size - span);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  end = Math.min(end, size - 1);
  if (start > end || start < 0) return { unsatisfiable: true };
  return { start, end };
}

/* Express has already percent-decoded the wildcard, so decoding again would
   corrupt any name that legitimately holds a `%`. The path is not trusted:
   the storage driver refuses anything holding `..`, and answers null — which
   lands on the 404 below, not on an error. */
router.get('/*', async (req, res, next) => {
  const path = req.params[0] || '';
  if (!path || path.startsWith('.')) return res.status(404).end();

  let head;
  try {
    head = await storage.head(path);
  } catch (err) {
    return next(err);
  }
  if (!head) return res.status(404).end();

  baseHeaders(res, head);

  const etag = res.get('ETag');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  if (req.method === 'HEAD') {
    res.set('Content-Length', String(head.size));
    return res.status(200).end();
  }

  const range = req.headers.range ? parseRange(req.headers.range, head.size) : null;
  if (range?.unsatisfiable) {
    res.set('Content-Range', `bytes */${head.size}`);
    return res.status(416).end();
  }

  let row;
  try {
    row = await storage.read(path);
  } catch (err) {
    return next(err);
  }
  if (!row) return res.status(404).end();

  const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);

  if (range) {
    const slice = data.subarray(range.start, range.end + 1);
    res.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`);
    res.set('Content-Length', String(slice.length));
    return res.status(206).end(slice);
  }

  res.set('Content-Length', String(data.length));
  return res.status(200).end(data);
});

module.exports = router;
