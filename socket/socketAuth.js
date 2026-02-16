const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
  try {
    let token = null;

    /* ===============================
       1️⃣ Try reading from HttpOnly cookie
    =============================== */
    const cookieHeader = socket.handshake.headers?.cookie;

    if (cookieHeader) {
      token = cookieHeader
        .split('; ')
        .find(c => c.startsWith('authtoken='))
        ?.split('=')[1];
    }

    /* ===============================
       2️⃣ Fallback: auth.token
    =============================== */
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    /* ===============================
       3️⃣ If still no token
    =============================== */
    if (!token) {
      console.log('❌ No token found in socket handshake');
      return next(new Error('Authentication token required'));
    }

    /* ===============================
       4️⃣ Verify JWT
    =============================== */
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.id || decoded._id || decoded.userId;

    if (!userId) {
      console.log('❌ Invalid token payload:', decoded);
      return next(new Error('Invalid token payload'));
    }

    /* ===============================
       5️⃣ Find user
    =============================== */
    const user = await User.findById(userId).select('-password');

    if (!user) {
      console.log('❌ User not found for ID:', userId);
      return next(new Error('User not found'));
    }

    /* ===============================
       6️⃣ Attach user to socket
    =============================== */
    socket.userId = user._id.toString();
    socket.userHandle = user.handle;
    socket.user = user;

    console.log('✅ Socket authenticated:', user.handle);

    next();

  } catch (error) {
    console.error('❌ Socket auth error:', error.message);
    next(new Error('Invalid or expired token'));
  }
};

module.exports = socketAuth;
