const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    isConnected = true;

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB Error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB Disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB Reconnected');
    });

  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
