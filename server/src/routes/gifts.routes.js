'use strict';
/* ============================================================
   /api/gifts/:slug — the workshop.
   Everything below the door is guarded by a builder session token bound to
   that one pearl.
   ============================================================ */
const express = require('express');
const gifts = require('../controllers/gifts.controller');
const uploads = require('../middleware/uploads');
const limiters = require('../middleware/rateLimiters');
const { requireBuilderSession } = require('../middleware/auth');

const router = express.Router();

const json = express.json({ limit: '16kb' });
const guard = requireBuilderSession;

/* ---------- the door ---------- */
router.get('/:slug', gifts.door);
router.post('/:slug/session', limiters.builderPassword, express.json({ limit: '2kb' }), gifts.session);
router.get('/:slug/content', guard, gifts.content);

/* ---------- photographs ---------- */
router.post('/:slug/photos', guard, uploads.photos, gifts.addPhotos);
router.post('/:slug/photos/:id/replace', guard, uploads.photos, gifts.replacePhoto);
router.patch('/:slug/photos/:id', guard, json, gifts.rename);
router.delete('/:slug/photos/:id', guard, gifts.remove);

/* ---------- voices ---------- */
router.post('/:slug/voices', guard, uploads.voice, gifts.addVoice);
router.post('/:slug/voices/:id/replace', guard, uploads.voice, gifts.replaceVoice);
router.patch('/:slug/voices/:id', guard, json, gifts.rename);
router.delete('/:slug/voices/:id', guard, gifts.remove);

/* ---------- films ---------- */
router.post('/:slug/videos', guard, uploads.video, gifts.addVideo);
router.post('/:slug/videos/:id/replace', guard, uploads.video, gifts.replaceVideo);
router.patch('/:slug/videos/:id', guard, json, gifts.rename);
router.delete('/:slug/videos/:id', guard, gifts.remove);

/* ---------- written pages ---------- */
router.post('/:slug/notes', guard, json, gifts.addNote);
router.patch('/:slug/notes/:id', guard, json, gifts.editNote);
router.delete('/:slug/notes/:id', guard, gifts.remove);

/* ---------- order, prose, sealing ---------- */
router.post('/:slug/order', guard, express.json({ limit: '8kb' }), gifts.reorder);
router.patch('/:slug/message', guard, express.json({ limit: '8kb' }), gifts.setMessage);
router.post('/:slug/finish', guard, express.json({ limit: '2kb' }), gifts.finish);

module.exports = router;
