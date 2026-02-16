const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const socketAuth = require('./socketAuth');
const {
  addOnlineUser,
  removeOnlineUser,
  getUserSocketId,
} = require('../utils/redis-helpers');


module.exports = (io) => {
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    console.log(`🔌 ${socket.userHandle} connected`);

    try {
      await addOnlineUser(socket.userId, socket.id);

      await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date(),
      });

      io.emit('user_online', {
        userId: socket.userId,
        handle: socket.userHandle,
      });
    } catch (err) {
      console.error('Connection setup error:', err);
    }

    /**
     * SEND MESSAGE
     */
    socket.on('send_message', async ({ receiverId, text }) => {
      console.log("📩 Received message:", text);

      try {
        if (!receiverId || !text?.trim()) return;

        const senderId = socket.userId;

        // 🔹 Find or create conversation
        const conversation = await Conversation.findOrCreate(
          senderId,
          receiverId
        );

        // 🔹 Create message (CORRECT FIELD NAME)
        const message = await Message.create({
          conversationId: conversation._id,
          senderId,
          receiverId,
          text,   // ✅ CORRECT FIELD
          status: 'sent',
        });


        // 🔹 Update conversation
        conversation.lastMessage = message._id;
        conversation.lastMessageTime = message.createdAt;
        await conversation.save();
        
        const payload = {
          _id: message._id,
          senderId,
          receiverId,
          text: message.text,
          createdAt: message.createdAt,
          status: message.status,
        };
        const receiverSocketId = await getUserSocketId(receiverId);


        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receive_message', payload);
          message.status = 'delivered';
          await message.save();
          socket.emit('message_status_updated', {
            messageId: message._id,
            status: 'delivered',
          });
        }
        socket.emit('receive_message', payload);

      } catch (error) {
        console.error('Send message error:', error);
      }
    });

    /**
     * READ RECEIPT
     */
    socket.on('message_read', async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        message.status = 'read';
        await message.save();

        const senderSocketId = await getUserSocketId(
          message.senderId.toString()
        );

        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_updated', {
            messageId,
            status: 'read',
          });
        }
      } catch (error) {
        console.error('Read receipt error:', error);
      }
    });

    /**
     * TYPING INDICATOR
     */
    socket.on('typing', async ({ receiverId, isTyping }) => {
      const receiverSocketId = await getSocketIdByUserId(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user_typing', {
          userId: socket.userId,
          handle: socket.userHandle,
          isTyping,
        });
      }
    });

    /**
     * DISCONNECT
     */
    socket.on('disconnect', async () => {
      console.log(`❌ ${socket.userHandle} disconnected`);

      try {
        await removeOnlineUser(socket.userId);

        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
        });

        io.emit('user_offline', {
          userId: socket.userId,
          handle: socket.userHandle,
        });
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });
};
