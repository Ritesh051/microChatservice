const { getRedisClient } = require('../config/redis');

const ONLINE_USERS_KEY = 'online_users';
const USER_SOCKET_PREFIX = 'user_socket:';

/**
 * Add user to online users set in Redis
 * @param {string} userId - User's MongoDB _id
 * @param {string} socketId - Socket.io socket ID
 */
const addOnlineUser = async (userId, socketId) => {
  try {
    const redis = getRedisClient();
    
    // Add to online users set
    await redis.sAdd(ONLINE_USERS_KEY, userId);
    
    // Store socket ID mapping
    await redis.set(`${USER_SOCKET_PREFIX}${userId}`, socketId, {
      EX: 86400, // Expire in 24 hours
    });
    
    return true;
  } catch (error) {
    console.error('Redis addOnlineUser error:', error);
    return false;
  }
};

/**
 * Remove user from online users set in Redis
 * @param {string} userId - User's MongoDB _id
 */
const removeOnlineUser = async (userId) => {
  try {
    const redis = getRedisClient();
    
    // Remove from online users set
    await redis.sRem(ONLINE_USERS_KEY, userId);
    
    // Remove socket ID mapping
    await redis.del(`${USER_SOCKET_PREFIX}${userId}`);
    
    return true;
  } catch (error) {
    console.error('Redis removeOnlineUser error:', error);
    return false;
  }
};

/**
 * Get all online user IDs
 * @returns {Array<string>} Array of user IDs
 */
const getOnlineUsers = async () => {
  try {
    const redis = getRedisClient();
    const userIds = await redis.sMembers(ONLINE_USERS_KEY);
    return userIds;
  } catch (error) {
    console.error('Redis getOnlineUsers error:', error);
    return [];
  }
};

/**
 * Check if a user is online
 * @param {string} userId - User's MongoDB _id
 * @returns {boolean}
 */
const isUserOnline = async (userId) => {
  try {
    const redis = getRedisClient();
    const isMember = await redis.sIsMember(ONLINE_USERS_KEY, userId);
    return isMember;
  } catch (error) {
    console.error('Redis isUserOnline error:', error);
    return false;
  }
};

/**
 * Get socket ID for a user
 * @param {string} userId - User's MongoDB _id
 * @returns {string|null} Socket ID or null
 */
const getUserSocketId = async (userId) => {
  try {
    const redis = getRedisClient();
    const socketId = await redis.get(`${USER_SOCKET_PREFIX}${userId}`);
    return socketId;
  } catch (error) {
    console.error('Redis getUserSocketId error:', error);
    return null;
  }
};

/**
 * Cache user data temporarily
 * @param {string} userId - User's MongoDB _id
 * @param {object} userData - User data to cache
 * @param {number} ttl - Time to live in seconds
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
 * @param {string} userId - User's MongoDB _id
 * @returns {object|null} Cached user data or null
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
  getUserSocketId,
  cacheUserData,
  getCachedUserData,
};