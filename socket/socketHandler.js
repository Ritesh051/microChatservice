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

    socket.on('send_message', async ({ receiverId, text }) => {
      console.log("📨 Received message:", text);
      console.log("   From:", socket.userId);
      console.log("   To:", receiverId);

      try {
        if (!receiverId || !text?.trim()) {
          console.warn("⚠️  Empty message or no receiver");
          return;
        }

        const senderId = socket.userId;
        
        // Step 1: Create/find conversation
        const conversation = await Conversation.findOrCreate(
          senderId,
          receiverId
        );
        console.log("✅ Conversation found/created:", conversation._id);

        // Step 2: Create message
        const message = await Message.create({
          conversationId: conversation._id,
          senderId,
          receiverId,
          text,
          status: 'sent',
        });
        console.log("✅ Message saved to DB:", message._id);

        // Step 3: Update conversation
        conversation.lastMessage = message._id;
        conversation.lastMessageTime = message.createdAt;
        await conversation.save();

        // Step 4: Create payload to send
        const payload = {
          _id: message._id.toString(),
          senderId: senderId.toString(),
          receiverId: receiverId.toString(),
          text: message.text,
          createdAt: message.createdAt,
          status: message.status,
        };

        // Step 5: Emit to SENDER FIRST (so message appears immediately in their chat)
        socket.emit('receive_message', payload);
        console.log("📤 Emitted to sender");

        // Step 6: Check if receiver is online and emit to them
        const receiverSocketId = await getUserSocketId(receiverId);

        if (receiverSocketId) {
          // Receiver is online
          io.to(receiverSocketId).emit('receive_message', payload);
          console.log("📤 Emitted to receiver (online)");
          
          // Update message status to delivered
          message.status = 'delivered';
          await message.save();
          
          // Notify sender that message was delivered
          socket.emit('message_status_updated', {
            messageId: message._id,
            status: 'delivered',
          });
          console.log("✅ Message status updated to delivered");
        } else {
          // Receiver is offline - message stays as 'sent'
          console.log("⏳ Receiver is offline, message status: sent");
        }

      } catch (error) {
        console.error('❌ Send message error:', error);
        socket.emit('message_error', {
          error: error.message,
        });
      }
    });

    socket.on('message_read', async ({ messageId }) => {
      console.log("📌 Message read:", messageId);
      
      try {
        const message = await Message.findById(messageId);
        if (!message) {
          console.warn("⚠️  Message not found:", messageId);
          return;
        }

        message.status = 'read';
        await message.save();
        console.log("✅ Message marked as read");

        const senderSocketId = await getUserSocketId(
          message.senderId.toString()
        );

        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_updated', {
            messageId,
            status: 'read',
          });
          console.log("📤 Sent read status to sender");
        }
      } catch (error) {
        console.error('❌ Read receipt error:', error);
      }
    });

    socket.on('typing', async ({ receiverId, isTyping }) => {
      console.log("⌨️  User typing:", { userId: socket.userId, isTyping });
      
      try {
        const receiverSocketId = await getUserSocketId(receiverId);

        if (receiverSocketId) {
          io.to(receiverSocketId).emit('user_typing', {
            userId: socket.userId,
            handle: socket.userHandle,
            isTyping,
          });
          console.log("📤 Sent typing status to receiver");
        }
      } catch (error) {
        console.error('❌ Typing error:', error);
      }
    });

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
        console.error('❌ Disconnect error:', error);
      }
    });
  });
};