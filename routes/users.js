const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { getOnlineUsers } = require('../utils/redis-helpers');

/**
 * LIST USERS
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const { search, limit = 20 } = req.query;

    const query = { _id: { $ne: req.user._id } };

    if (search) {
      query.$or = [
        { handle: new RegExp(search, 'i') },
        { profession: new RegExp(search, 'i') },
        { bio: new RegExp(search, 'i') },
      ];
    }

    const users = await User.find(query)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
