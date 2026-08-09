'use strict';
/* ============================================================
   The media pipeline
   Images are re-encoded, films and voices are stored untouched. The rules
   below are the original service's, to the number:

   · every image becomes two WebP files — a full one (≤1600px, q82) and a
     thumbnail (≤480px, q70). The gallery shows the thumbnail first and swaps
     in the full size once it lands, which is what makes a pearl open instantly
     on 3G.
   · re-encoding strips EXIF, so the GPS coordinates in a holiday photo do not
     travel with the gift — while honouring the orientation flag first, so
     portraits are not laid on their side.
   · videos are stored AS THEY ARE. Transcoding would need ffmpeg, which this
     service deliberately does not depend on; the poster frame is grabbed in
     the sender's browser before upload, which is why a film card is never an
     empty black rectangle.
   ============================================================ */
const sharp = require('sharp');
const storage = require('./storage');
const { randomId } = require('../utils/crypto');

/* Guard against decompression bombs from untrusted uploads. */
sharp.cache(false);
sharp.concurrency(1);
const LIMITS = { limitInputPixels: 40e6 };

const MAX_EDGE = 1600;   // plenty for a full-screen phone view
const THUMB_EDGE = 480;  // what the gallery actually loads first

const AUDIO_EXT = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/ogg': 'ogg', 'audio/opus': 'ogg',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm'
};

const VIDEO_EXT = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/ogg': 'ogv', 'video/3gpp': '3gp'
};

/**
 * Re-encode an uploaded image to WebP at two sizes.
 * @returns {Promise<{mediaUrl:string, thumbnailUrl:string, width:number|null, height:number|null}>}
 */
async function processImage(buffer) {
  const base = randomId(16);
  const meta = await sharp(buffer, LIMITS).rotate().metadata();

  const full = await sharp(buffer, LIMITS).rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const thumb = await sharp(buffer, LIMITS).rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70, effort: 4 })
    .toBuffer();

  const mediaUrl = await storage.save('images', `${base}.webp`, full);
  const thumbnailUrl = await storage.save('images', `${base}_t.webp`, thumb);

  /* metadata() reports the pre-rotation size, so a portrait shot with an EXIF
     orientation of 6 comes back as landscape. Swap it back. */
  const rotated = (meta.orientation || 0) >= 5;
  return {
    mediaUrl,
    thumbnailUrl,
    width: (rotated ? meta.height : meta.width) || null,
    height: (rotated ? meta.width : meta.height) || null
  };
}

/** A poster frame: one WebP, only ever shown small. */
async function processPoster(buffer) {
  const out = await sharp(buffer, LIMITS).rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 74, effort: 4 })
    .toBuffer();
  return storage.save('images', `${randomId(16)}_p.webp`, out);
}

/** Voice notes are stored as-is: every target browser plays what it can record. */
async function saveAudio(buffer, mime) {
  const ext = AUDIO_EXT[mime] || 'webm';
  const mimeType = mime || 'audio/webm';
  const mediaUrl = await storage.save('audio', `${randomId(16)}.${ext}`, buffer, mimeType);
  return { mediaUrl, mimeType };
}

/** Films are stored untouched — no ffmpeg, no transcode, no dependency. */
async function saveVideo(buffer, mime) {
  const ext = VIDEO_EXT[mime] || 'mp4';
  const mimeType = mime || 'video/mp4';
  const mediaUrl = await storage.save('videos', `${randomId(16)}.${ext}`, buffer, mimeType);
  return { mediaUrl, mimeType };
}

/** Best-effort cleanup; a file that was never written is not an error. */
const removeFiles = paths => storage.removeMany(paths);

module.exports = { processImage, processPoster, saveAudio, saveVideo, removeFiles };
