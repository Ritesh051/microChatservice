const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { protect } = require('../middleware/auth');

/**
 * REGISTER
 */
router.post(
  '/register',
  [
    body('handle')
      .trim()
      .isLength({ min: 3, max: 30 })
      .customSanitizer(v => v.toLowerCase()),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { handle, email, password, bio, profession } = req.body;

      const existingUser = await User.findOne({
        $or: [{ email }, { handle }],
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message:
            existingUser.email === email
              ? 'Email already registered'
              : 'Handle already taken',
        });
      }

      const user = await User.create({
        handle,
        email,
        password,
        bio: bio || '',
        profession: profession || 'Creator',
      });

      const token = generateToken({ id: user._id });

      res.status(201).json({
        success: true,
        token,
        user: user.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * LOGIN
 */
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+password');

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }

      const token = generateToken({ id: user._id });

      res.json({
        success: true,
        token,
        user: user.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET CURRENT USER
 */
router.get('/me', protect, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
