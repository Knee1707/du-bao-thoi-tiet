const { handleChatMessage } = require('../services/aiService');

// POST /api/chat
async function chatController(req, res, next) {
  try {
    const { message, lat, lon } = req.body;
    const result = await handleChatMessage({
      message,
      lat: lat ? Number(lat) : undefined,
      lon: lon ? Number(lon) : undefined
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { chatController };
