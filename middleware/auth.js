const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token = null;

    /* =========================
       Try HttpOnly cookie
    ========================= */
    if (req.cookies?.authtoken) {
      token = req.cookies.authtoken;
    }

    /* =========================
      Fallback: Authorization header
    ========================= */
    if (
      !token &&
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    console.log('Extracted Token:', token);
    console.log("Cookies:", req.cookies);
console.log("Raw cookie header:", req.headers.cookie);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. No token provided.',
      });
    }

    /* =========================
      Verify token
    ========================= */
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.id || decoded._id || decoded.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.',
      });
    }

    /* =========================
      Find user
    ========================= */
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    req.user = user;
    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized. Token invalid or expired.',
    });
  }
};

module.exports = { protect };
