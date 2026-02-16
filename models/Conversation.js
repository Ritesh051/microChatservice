const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageTime: {
      type: Date,
      default: Date.now,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

/* =========================================
   ✅ ENSURE EXACTLY 2 USERS (NO next())
========================================= */

conversationSchema.pre('save', function () {
  if (this.participants.length !== 2) {
    throw new Error('Conversation must have exactly 2 participants');
  }
});

/* =========================================
   ✅ SAFE FIND OR CREATE
========================================= */

conversationSchema.statics.findOrCreate = async function (
  userId1,
  userId2
) {
  const id1 = userId1.toString();
  const id2 = userId2.toString();

  const participants = [id1, id2].sort();

  let convo = await this.findOne({
    participants: { $all: participants },
  });

  if (!convo) {
    convo = await this.create({
      participants,
      unreadCount: {
        [id1]: 0,
        [id2]: 0,
      },
    });
  }

  return convo;
};

/* =========================================
   ✅ UNREAD MANAGEMENT
========================================= */

conversationSchema.methods.incrementUnread = async function (
  userId
) {
  const key = userId.toString();
  const current = this.unreadCount.get(key) || 0;
  this.unreadCount.set(key, current + 1);
  await this.save();
};

conversationSchema.methods.resetUnread = async function (
  userId
) {
  this.unreadCount.set(userId.toString(), 0);
  await this.save();
};

module.exports = mongoose.model(
  'Conversation',
  conversationSchema
);
