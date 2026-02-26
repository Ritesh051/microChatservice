const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const socketAuth = require('./socketAuth');

const {
  addOnlineUser,
  removeOnlineUser,
  getUserSocketIds,
} = require('../utils/redis-helpers');

module.exports = (io) => {
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    console.log(`${socket.userHandle} connected (${socket.id})`);

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

    /* =====================================================
       SEND MESSAGE
    ===================================================== */
    socket.on('send_message', async ({ receiverId, text }) => {
      try {
        if (!receiverId || !text?.trim()) return;

        const senderId = socket.userId;

        const conversation = await Conversation.findOrCreate(
          senderId,
          receiverId
        );

        const message = await Message.create({
          conversationId: conversation._id,
          senderId,
          receiverId,
          text,
          status: 'sent',
        });

        conversation.lastMessage = message._id;
        conversation.lastMessageTime = message.createdAt;
        await conversation.save();

        const payload = {
          _id: message._id.toString(),
          senderId: senderId.toString(),
          receiverId: receiverId.toString(),
          text: message.text,
          createdAt: message.createdAt,
          status: message.status,
        };

        // Emit to sender sockets
        const senderSockets = await getUserSocketIds(senderId);
        senderSockets.forEach((id) => {
          io.to(id).emit('receive_message', payload);
        });

        console.log("Emitted to sender sockets");

        // Emit to receiver sockets
        const receiverSockets = await getUserSocketIds(receiverId);

        if (receiverSockets.length > 0) {
          receiverSockets.forEach((id) => {
            io.to(id).emit('receive_message', payload);
          });

          console.log("Emitted to receiver sockets");

          message.status = 'delivered';
          await message.save();

          senderSockets.forEach((id) => {
            io.to(id).emit('message_status_updated', {
              messageId: message._id,
              status: 'delivered',
            });
          });

        } else {
          console.log("⏳ Receiver offline");
        }

      } catch (error) {
        console.error('Send message error:', error);
      }
    });

    /* =====================================================
       READ RECEIPT
    ===================================================== */
    socket.on('message_read', async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        message.status = 'read';
        await message.save();

        const senderSockets = await getUserSocketIds(
          message.senderId.toString()
        );

        senderSockets.forEach((id) => {
          io.to(id).emit('message_status_updated', {
            messageId,
            status: 'read',
          });
        });

        console.log("Read receipt sent");

      } catch (error) {
        console.error('Read receipt error:', error);
      }
    });

    /* =====================================================
       DISCONNECT
    ===================================================== */
    socket.on('disconnect', async () => {
      console.log(`${socket.userHandle} disconnected (${socket.id})`);

      try {
        await removeOnlineUser(socket.userId, socket.id);

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

