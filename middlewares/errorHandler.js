const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    logger.warn('Application error', { path: req.originalUrl, error: err.message, errorCode: err.errorCode });
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.errorCode
    });
  }

  logger.error('Unhandled error', { path: req.originalUrl, error: err.message, stack: err.stack });

  return res.status(500).json({
    success: false,
    message: 'Unexpected server error.',
    error: 'INTERNAL_SERVER_ERROR'
  });
}

module.exports = {
  errorHandler
};
