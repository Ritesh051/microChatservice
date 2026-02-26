const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
  try {
    let token = null;
    const cookieHeader = socket.handshake.headers?.cookie;

    if (cookieHeader) {
      token = cookieHeader
        .split('; ')
        .find(c => c.startsWith('authtoken='))
        ?.split('=')[1];
    }
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }
    if (!token) {
      console.log(' No token found in socket handshake');
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.id || decoded._id || decoded.userId;

    if (!userId) {
      console.log('Invalid token payload:', decoded);
      return next(new Error('Invalid token payload'));
    }
    const user = await User.findById(userId).select('-password');

    if (!user) {
      console.log('User not found for ID:', userId);
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.userHandle = user.handle || "User";
    socket.user = user;

    console.log('Socket authenticated:', socket.userHandle);

    next();

  } catch (error) {
    console.error(' Socket auth error:', error.message);
    next(new Error('Invalid or expired token'));
  }
};

module.exports = socketAuth;
