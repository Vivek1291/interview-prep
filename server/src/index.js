const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');
const connectDB = require('./config/db');
const { loadSecrets } = require('./config/secrets');
const { migrate } = require('./seed/migrate');

async function start() {
  await connectDB();
  await mongoose.connection.syncIndexes();   // create the new indexes (tree, owner, progress)
  await loadSecrets();
  await migrate();                            // fresh install → seed; old flat data → tree
  const server = app.listen(config.port, () => console.log(`🚀 API listening on http://localhost:${config.port}`));

  // Graceful shutdown (docker stop sends SIGTERM)
  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
