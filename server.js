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
const path = require('path'); // <-- 1. ADDED PATH MODULE

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

// helmet config to allow cross-origin resources (like images)
app.use(helmet({
  crossOriginResourcePolicy: false, 
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// <-- 2. ADDED THIS LINE TO SERVE UPLOADED FILES -->
// This makes sure files in 'public/uploads' can be accessed at 'http://localhost:4000/uploads/filename.jpg'
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use(errorHandler);

/* ================= START SERVER ================= */

const startServer = async () => {
  try {
    await connectDB();
    await initRedis();

    console.log('MongoDB Connected');
    console.log('Redis Connected');

    // Create Socket.IO ONCE
    const io = new Server(server, {
      cors: {
        origin: FRONTEND_ORIGIN,
        credentials: true,
      },
    });

    //Redis Adapter (LOCAL REDIS FIX)
    const pubClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));

    socketHandler(io);

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

/* ================= SHUTDOWN ================= */

process.on('SIGINT', async () => {
  console.log('\n Gracefully shutting down...');

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