const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); 
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');

/**
 * GET UNREAD MESSAGE COUNTS
 */
router.get('/unread/counts', protect, async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const unreadData = await Message.aggregate([
      {
        $match: {
          receiverId: new mongoose.Types.ObjectId(currentUserId),
          status: { $ne: 'read' },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$senderId', 
          count: { $sum: 1 } 
        }
      }
    ]);
    const counts = {};
    unreadData.forEach(item => {
      counts[item._id.toString()] = item.count;
    });

    res.json(counts);
  } catch (error) {
    next(error);
  }
});

/**
 * MARK MESSAGES FROM A SPECIFIC USER AS READ
 */
router.put('/mark-read/:senderId', protect, async (req, res, next) => {
  try {
    const { senderId } = req.params;
    const currentUserId = req.user._id;

    await Message.updateMany(
      {
        senderId: senderId,
        receiverId: currentUserId,
        status: { $ne: 'read' }
      },
      {
        $set: { status: 'read' }
      }
    );

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    next(error);
  }
});

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
    await Message.updateMany(
      {
        conversationId: conversation._id,
        senderId: userId,
        receiverId: currentUserId,
        status: { $ne: 'read' }
      },
      { $set: { status: 'read' } }
    );

    const messages = await Message.find({
      conversationId: conversation._id,
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    next(error);
  }
});

/**
 * SEND MESSAGE
 */
router.post('/', protect, async (req, res, next) => {
  try {
    const { receiverId, text } = req.body;
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
      text,
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageTime = message.createdAt;
    await conversation.save();

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

module.exports = router;