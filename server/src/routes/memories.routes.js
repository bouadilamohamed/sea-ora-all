'use strict';
/* ============================================================
   /api/memories
   Reading needs a session of either kind; writing needs a builder session.
   ============================================================ */
const express = require('express');
const memories = require('../controllers/memories.controller');
const limiters = require('../middleware/rateLimiters');
const { requireAnySession, requireBuilderSession } = require('../middleware/auth');

const router = express.Router();

const json = express.json({ limit: '32kb' });

router.get('/', requireAnySession, memories.list);
router.get('/:id', requireAnySession, memories.getOne);

router.post('/reorder', limiters.builder, requireBuilderSession, json, memories.reorder);

router.post('/', limiters.builder, requireBuilderSession, memories.maybeUpload, json, memories.create);
router.patch('/:id', limiters.builder, requireBuilderSession, json, memories.update);
router.delete('/:id', limiters.builder, requireBuilderSession, memories.destroy);

module.exports = router;
