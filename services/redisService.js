const { createClient } = require('redis');
const logger = require('../config/logger');

let client = null;
let redisDisabled = false;

async function connectRedis() {
  if (redisDisabled) return null;
  if (client) return client;

  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 1500, // Timeout after 1.5s
        reconnectStrategy: false // Do not retry connection on failure
      }
    });

    client.on('error', (err) => {
      logger.warn(`Redis client error: ${err.message}. Disabling Redis cache.`);
      redisDisabled = true;
      client = null;
    });

    await client.connect();
    logger.info('Redis connected');
    return client;
  } catch (error) {
    logger.warn(`Redis connection failed: ${error.message}. Disabling Redis cache.`);
    redisDisabled = true;
    client = null;
    return null;
  }
}

async function getCached(key) {
  const redis = await connectRedis();
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.warn(`Failed to get cache for key ${key}: ${error.message}`);
    return null;
  }
}

async function setCached(key, value, ttlSeconds = 300) {
  const redis = await connectRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    logger.warn(`Failed to set cache for key ${key}: ${error.message}`);
  }
}

module.exports = {
  connectRedis,
  getCached,
  setCached
};

