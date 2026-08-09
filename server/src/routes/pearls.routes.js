'use strict';
const express = require('express');
const pearls = require('../controllers/pearls.controller');
const uploads = require('../middleware/uploads');
const limiters = require('../middleware/rateLimiters');
const { requireManageKey } = require('../middleware/auth');

const router = express.Router();

/* Writing is far more expensive than reading — throttle creation specifically. */
router.post('/', limiters.createPearl, uploads.pearlCreate, pearls.create);

/* Gate metadata only. 409 while a gift is still in preparation. */
router.get('/:slug', pearls.gate);

router.post('/:slug/unlock', limiters.passcode, express.json({ limit: '4kb' }), pearls.unlock);

router.get('/:slug/qr.png', pearls.qrPng);
router.get('/:slug/qr.svg', pearls.qrSvg);

/* Guarded by the management key. A wrong key answers 404, not 403. */
router.get('/:slug/manage', requireManageKey, pearls.manage);
router.patch('/:slug', express.json({ limit: '16kb' }), requireManageKey, pearls.update);
router.delete('/:slug', express.json({ limit: '4kb' }), requireManageKey, pearls.destroy);

module.exports = router;
