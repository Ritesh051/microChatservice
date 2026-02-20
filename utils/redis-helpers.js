const { getRedisClient } = require('../config/redis');

const ONLINE_USERS_KEY = 'online_users';
const USER_SOCKET_PREFIX = 'user_sockets:'; // changed (plural)

/**
 * Add user socket
 * Supports multiple sockets per user
 */
const addOnlineUser = async (userId, socketId) => {
  try {
    const redis = getRedisClient();

    // Add user to online users set
    await redis.sAdd(ONLINE_USERS_KEY, userId);

    // Add socketId to user's socket set
    await redis.sAdd(`${USER_SOCKET_PREFIX}${userId}`, socketId);

    return true;
  } catch (error) {
    console.error('Redis addOnlineUser error:', error);
    return false;
  }
};

/**
 * Remove a specific socket for a user
 * Only mark user offline if no sockets remain
 */
const removeOnlineUser = async (userId, socketId) => {
  try {
    const redis = getRedisClient();

    // Remove this socket from user's socket set
    await redis.sRem(`${USER_SOCKET_PREFIX}${userId}`, socketId);

    // Check if user still has active sockets
    const remainingSockets = await redis.sCard(
      `${USER_SOCKET_PREFIX}${userId}`
    );

    if (remainingSockets === 0) {
      // Remove user from online users
      await redis.sRem(ONLINE_USERS_KEY, userId);
      await redis.del(`${USER_SOCKET_PREFIX}${userId}`);
    }

    return true;
  } catch (error) {
    console.error('Redis removeOnlineUser error:', error);
    return false;
  }
};

/**
 * Get all online users
 */
const getOnlineUsers = async () => {
  try {
    const redis = getRedisClient();
    return await redis.sMembers(ONLINE_USERS_KEY);
  } catch (error) {
    console.error('Redis getOnlineUsers error:', error);
    return [];
  }
};

/**
 * Check if user is online
 */
const isUserOnline = async (userId) => {
  try {
    const redis = getRedisClient();
    return await redis.sIsMember(ONLINE_USERS_KEY, userId);
  } catch (error) {
    console.error('Redis isUserOnline error:', error);
    return false;
  }
};

/**
 * Get ALL socket IDs for a user
 * Returns array of socket IDs
 */
const getUserSocketIds = async (userId) => {
  try {
    const redis = getRedisClient();
    return await redis.sMembers(`${USER_SOCKET_PREFIX}${userId}`);
  } catch (error) {
    console.error('Redis getUserSocketIds error:', error);
    return [];
  }
};

/**
 * Cache user data
 */
const cacheUserData = async (userId, userData, ttl = 3600) => {
  try {
    const redis = getRedisClient();
    await redis.set(
      `user_cache:${userId}`,
      JSON.stringify(userData),
      { EX: ttl }
    );
    return true;
  } catch (error) {
    console.error('Redis cacheUserData error:', error);
    return false;
  }
};

/**
 * Get cached user data
 */
const getCachedUserData = async (userId) => {
  try {
    const redis = getRedisClient();
    const data = await redis.get(`user_cache:${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getCachedUserData error:', error);
    return null;
  }
};

module.exports = {
  addOnlineUser,
  removeOnlineUser,
  getOnlineUsers,
  isUserOnline,
  getUserSocketIds, // renamed
  cacheUserData,
  getCachedUserData,
};
