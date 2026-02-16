const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');

/**
 * GET MESSAGES WITH USER
 */
router.get('/:userId', protect, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const conversation = await Conversation.findOrCreate(
      currentUserId,
      userId
    );

    const messages = await Message.find({
      conversationId: conversation._id,
    }).sort({ createdAt: 1 });

    res.json(messages); // 👈 IMPORTANT: return array only (frontend expects this)
  } catch (error) {
    next(error);
  }
});

/**
 * SEND MESSAGE
 */
router.post('/', protect, async (req, res, next) => {
  try {
    const { receiverId, text } = req.body; // 👈 FIXED (text not messageText)
    const senderId = req.user._id;

    if (!receiverId || !text?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID and text are required',
      });
    }

    const conversation = await Conversation.findOrCreate(
      senderId,
      receiverId
    );

    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      text, // 👈 MATCHES FRONTEND
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageTime = message.createdAt;
    await conversation.save();

    res.status(201).json(message); // 👈 return message directly
  } catch (error) {
    next(error);
  }
});

module.exports = router;
