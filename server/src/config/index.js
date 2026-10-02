// Centralised config: read env vars ONCE, validate, and export.
// Interview tip: never hard-code secrets — read them from the environment.
const config = {
  port: Number(process.env.PORT) || 5050,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/interview_prep',
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', '..', 'uploads'),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Auth. Secrets are optional: if unset, random ones are generated once and stored in MongoDB (see secrets.js).
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  accessTtl: process.env.ACCESS_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS) || 30,
  // Set COOKIE_SECURE=true when the app is served over HTTPS (the browser then only sends the cookie over TLS).
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  rateLimit: process.env.AUTH_RATE_LIMIT !== 'off',
};

module.exports = config;
