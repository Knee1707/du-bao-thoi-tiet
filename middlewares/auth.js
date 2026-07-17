const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new AppError('Authentication token is required.', 401, 'UNAUTHORIZED');
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error.message });
    next(new AppError('Invalid or expired token.', 401, 'UNAUTHORIZED'));
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  authenticate
};
