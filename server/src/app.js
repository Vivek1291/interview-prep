const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);            // behind Nginx: real client IP (rate limiting) and protocol
app.disable('x-powered-by');

// ---- Application-level middleware (runs for every request, in this order) ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: false }));    // same origin via Nginx; no cross-origin browser access needed
app.use(express.json({ limit: '50mb' })); // big limit so backups can be imported
app.use(cookieParser());
if (config.nodeEnv !== 'test') app.use(morgan('dev'));

// ---- Static uploaded images ----
// Uploaded files are user content: a sandboxing CSP stops an uploaded SVG from running scripts if opened directly.
app.use('/uploads', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(config.uploadDir, { maxAge: '7d' }));

// ---- Routes ----
app.use('/api/v1', routes);
app.use('/api', routes);

// ---- 404 + error handler (always LAST) ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
