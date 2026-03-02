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
          isDeleted: { $ne: true } 
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

 // MONGODB SIDEBAR FETCH
 
router.get('/sidebar/conversations', protect, async (req, res, next) => {
  try {
    const currentUserId = req.user._id.toString();
    const messages = await Message.find({
      $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
      isDeleted: { $ne: true }
    })
    .sort({ createdAt: -1 })
    .lean();

    const otherUserIds = new Set();
    messages.forEach(msg => {
      const sId = msg.senderId.toString();
      const rId = msg.receiverId.toString();
      if (sId === currentUserId) otherUserIds.add(rId);
      if (rId === currentUserId) otherUserIds.add(sId);
    });

    if (otherUserIds.size === 0) return res.json([]);

    const db = mongoose.connection.db;
    const objectIds = Array.from(otherUserIds).map(id => new mongoose.Types.ObjectId(id));
    
    const users = await db.collection('users').find({ _id: { $in: objectIds } }).toArray();

    const daplinkObjectIds = users.map(u => {
      if (!u.daplinkID) return null;
      try {
        return typeof u.daplinkID === 'string' ? new mongoose.Types.ObjectId(u.daplinkID) : u.daplinkID;
      } catch(e) { return null; }
    }).filter(Boolean);
    const daplinkMap = {};
    if (daplinkObjectIds.length > 0) {
      const daplinksData = await db.collection('links').find({ _id: { $in: daplinkObjectIds } }).toArray();
      daplinksData.forEach(d => {
        daplinkMap[d._id.toString()] = d;
      });
    }
    const userMap = {};
    users.forEach(u => {
      if (u.daplinkID && daplinkMap[u.daplinkID.toString()]) {
        u.daplinkID = daplinkMap[u.daplinkID.toString()];
      }
      userMap[u._id.toString()] = u;
    });
    const uniqueConversations = new Map();
    messages.forEach(msg => {
      const sId = msg.senderId.toString();
      const rId = msg.receiverId.toString();
      const otherUserId = sId === currentUserId ? rId : sId;

      if (!uniqueConversations.has(otherUserId)) {
        uniqueConversations.set(otherUserId, {
          user: userMap[otherUserId] || { _id: otherUserId, handle: 'Unknown' },
          lastMessage: { text: msg.text },
          lastMessageTime: msg.createdAt
        });
      }
    });

    res.json(Array.from(uniqueConversations.values()));
  } catch (error) {
    console.error("🔥 Sidebar Fetch Error:", error);
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