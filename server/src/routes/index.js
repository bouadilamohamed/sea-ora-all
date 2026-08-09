'use strict';
const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/memories', require('./memories.routes'));
router.use('/pearls', require('./pearls.routes'));
router.use('/gifts', require('./gifts.routes'));
router.use('/admin', require('./admin.routes'));

router.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

module.exports = router;
