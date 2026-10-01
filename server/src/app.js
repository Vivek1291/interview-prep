const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ---- Application-level middleware (runs for every request, in this order) ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '50mb' })); // big limit so backups can be imported
app.use(morgan('dev'));

// ---- Static uploaded images ----
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

// ---- Routes ----
app.use('/api/v1', routes);
app.use('/api', routes);

// ---- 404 + error handler (always LAST) ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
