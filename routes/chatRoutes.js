const express = require('express');
const { chatController } = require('../controllers/chatController');

const router = express.Router();

// POST /api/chat
router.post('/', chatController);

module.exports = router;
