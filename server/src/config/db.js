const mongoose = require('mongoose');
const config = require('./index');

// Retry the connection a few times — in Docker the DB container may still be starting.
async function connectDB(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongoUri);
      console.log(`✅ MongoDB connected (${mongoose.connection.host})`);
      return;
    } catch (err) {
      console.error(`MongoDB connection failed (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

module.exports = connectDB;
