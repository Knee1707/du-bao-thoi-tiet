const logger = require('../config/logger');

function requestLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration
    });
  });

  next();
}

module.exports = {
  requestLogger
};
