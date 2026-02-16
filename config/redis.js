const redis = require('redis');

let redisClient = null;

const initRedis = async () => {
  try {
    if (redisClient) return redisClient;

    // ✅ Prefer REDIS_URL if provided (Production)
    if (process.env.REDIS_URL) {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
      });
    } else {
      // ✅ Fallback for local development
      redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: process.env.REDIS_PORT
            ? Number(process.env.REDIS_PORT)
            : 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
    }

    redisClient.on('error', (err) => {
      console.error('❌ Redis Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('🔌 Redis Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Connected');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis Reconnecting...');
    });

    redisClient.on('end', () => {
      console.warn('⚠️ Redis Connection Closed');
    });

    await redisClient.connect();

    await redisClient.ping();
    console.log('🏓 Redis PING Successful');

    return redisClient;

  } catch (error) {
    console.error(`❌ Redis connection failed: ${error.message}`);
    console.warn(
      '⚠️ Running without Redis (real-time features may be limited)'
    );
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log('🔒 Redis connection closed');
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  closeRedis,
};
