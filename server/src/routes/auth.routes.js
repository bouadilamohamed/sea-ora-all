'use strict';
const express = require('express');
const limiters = require('../middleware/rateLimiters');
const auth = require('../controllers/auth.controller');

const router = express.Router();

/* The door's wording. Non-secret metadata only: no media URL is ever part of
   this answer, whatever the pearl holds. */
router.get('/gate', auth.gate);

/* The gate itself. Rate-limited here, and counted per IP-and-pearl inside
   auth.service — a short passcode is only safe because guessing is slow. */
router.post('/passcode', limiters.passcode, express.json({ limit: '4kb' }), auth.submit);

module.exports = router;
