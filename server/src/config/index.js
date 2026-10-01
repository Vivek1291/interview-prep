// Centralised config: read env vars ONCE, validate, and export.
// Interview tip: never hard-code secrets — read them from the environment.
const config = {
  port: Number(process.env.PORT) || 5050,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/interview_prep',
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', '..', 'uploads'),
  nodeEnv: process.env.NODE_ENV || 'development',
};

module.exports = config;
