'use strict';
const express = require('express');
const admin = require('../controllers/admin.controller');
const limiters = require('../middleware/rateLimiters');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* No key required: the page asks whether the console can open at all. */
router.get('/status', admin.status);

router.post('/session', limiters.adminKey, express.json({ limit: '2kb' }), admin.session);

router.post('/gifts', limiters.adminWork, requireAdmin, express.json({ limit: '4kb' }), admin.createGift);
router.get('/gifts', limiters.adminWork, requireAdmin, admin.listGifts);

/* The builder QR. Unauthenticated on purpose: it encodes a slug that is
   already 10 random characters, and the customer's phone has no admin key. */
router.get('/gifts/:slug/qr.png', admin.qrPng);
router.get('/gifts/:slug/qr.svg', admin.qrSvg);

module.exports = router;
