'use strict';
/* ============================================================
   Upload validation.
   Type, size and count are all bounded before a byte reaches sharp — an
   unbounded decode of an untrusted file is the one thing this service must
   never do.
   ============================================================ */
const multer = require('multer');
const env = require('../config/env');

const IMAGE_MIME = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i;
const AUDIO_MIME = /^audio\//i;
const VIDEO_MIME = /^video\//i;

const bytes = mb => mb * 1024 * 1024;

/* MediaRecorder labels its audio "video/webm" on several browsers, so an
   audio-only clip must be allowed through under that name too. */
const looksLikeAudio = mimetype => AUDIO_MIME.test(mimetype) || mimetype === 'video/webm';

const filter = test => (_req, file, cb) => {
  const ok = test(file);
  cb(ok ? null : new Error(`Type de fichier non supporté : ${file.mimetype}`), ok);
};

const photos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: bytes(env.limits.imageMb), files: env.limits.images },
  fileFilter: filter(f => IMAGE_MIME.test(f.mimetype))
}).array('images', env.limits.images);

const voice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: bytes(env.limits.audioMb), files: 1 },
  fileFilter: filter(f => looksLikeAudio(f.mimetype))
}).single('audio');

const video = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: bytes(env.limits.videoMb), files: 2 },
  fileFilter: filter(f => f.fieldname === 'poster'
    ? IMAGE_MIME.test(f.mimetype)
    : VIDEO_MIME.test(f.mimetype))
}).fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]);

/* The creation panel posts everything at once. */
const pearlCreate = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: bytes(Math.max(env.limits.imageMb, env.limits.audioMb)),
    files: env.limits.images + env.limits.audios
  },
  fileFilter: filter(f => f.fieldname === 'images'
    ? IMAGE_MIME.test(f.mimetype)
    : looksLikeAudio(f.mimetype))
}).fields([
  { name: 'images', maxCount: env.limits.images },
  { name: 'audio', maxCount: env.limits.audios }
]);

/* The generic /api/memories endpoint takes any of the three kinds under one
   field name, plus an optional poster for a film. The per-kind limits are
   still enforced — by memory.service, which knows which kind it was told to
   make; this only bounds what may arrive at all. */
const anyMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: bytes(Math.max(env.limits.imageMb, env.limits.audioMb, env.limits.videoMb)),
    files: env.limits.images + 1
  },
  fileFilter: filter(f => f.fieldname === 'poster'
    ? IMAGE_MIME.test(f.mimetype)
    : IMAGE_MIME.test(f.mimetype) || looksLikeAudio(f.mimetype) || VIDEO_MIME.test(f.mimetype))
}).fields([
  { name: 'media', maxCount: env.limits.images },
  { name: 'poster', maxCount: 1 }
]);

/* multer reports failures by calling back with an error rather than throwing,
   so every upload route funnels through this and answers in one voice. */
function run(handler, limitMb) {
  return (req, res, next) => handler(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Fichier trop volumineux (max ${limitMb} Mo).` });
    }
    res.status(400).json({ error: err.message || 'Envoi impossible.' });
  });
}

module.exports = {
  photos: run(photos, env.limits.imageMb),
  voice: run(voice, env.limits.audioMb),
  video: run(video, env.limits.videoMb),
  anyMedia: run(anyMedia, Math.max(env.limits.imageMb, env.limits.audioMb, env.limits.videoMb)),
  pearlCreate: run(pearlCreate, Math.max(env.limits.imageMb, env.limits.audioMb))
};
