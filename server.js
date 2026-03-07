require('dotenv').config();

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const connectDB = require('./config/db');
const { initRedis, closeRedis } = require('./config/redis');

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');

const errorHandler = require('./middleware/errorHandler');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;

const FRONTEND_ORIGIN =
  process.env.FRONTEND_URL || 'http://localhost:3000';

/* ================= SECURITY & MIDDLEWARE ================= */

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(compression());

app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  FRONTEND_ORIGIN,
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

/* ================= STATIC FILES ================= */

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public/uploads'))
);

/* ================= ROUTES ================= */

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

/* ================= 404 ================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

/* ================= ERROR HANDLER ================= */

app.use(errorHandler);

/* ================= START SERVER ================= */

const startServer = async () => {
  try {
    /* ---- DATABASE ---- */

    await connectDB();
    console.log('MongoDB Connected');

    /* ---- REDIS ---- */

    await initRedis();
    console.log('Redis Initialized');

    /* ---- SOCKET.IO ---- */

    const io = new Server(server, {
      cors: {
        origin: FRONTEND_ORIGIN,
        credentials: true,
      },
    });

    /* ---- REDIS ADAPTER FOR SOCKET.IO ---- */

    const pubClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) =>
          Math.min(retries * 50, 500),
      },
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) =>
      console.error('Redis Adapter Error:', err)
    );

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));

    console.log('Socket Redis Adapter Connected');

    socketHandler(io);

    /* ---- SERVER START ---- */

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Socket.io ready');
    });

  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
};

startServer();

/* ================= GRACEFUL SHUTDOWN ================= */

process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');

  try {
    await mongoose.connection.close();
    await closeRedis();

    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
});