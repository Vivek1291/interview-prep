// JWT signing secrets. Env vars win; otherwise random secrets are generated on first start and stored
// in MongoDB, so a self-hosted install is secure with zero configuration and sessions survive restarts.
const crypto = require('crypto');
const config = require('./index');
const Meta = require('../models/Meta');

let cached = null;

async function loadSecrets() {
  if (cached) return cached;
  let stored = await Meta.findById('jwtSecrets').lean();
  if (!stored) {
    const value = { access: crypto.randomBytes(48).toString('hex'), refresh: crypto.randomBytes(48).toString('hex') };
    try {
      await Meta.create({ _id: 'jwtSecrets', value });
    } catch (err) {
      if (err.code !== 11000) throw err;           // another instance created it first: use theirs
    }
    stored = await Meta.findById('jwtSecrets').lean();
  }
  cached = {
    access: config.jwtAccessSecret || stored.value.access,
    refresh: config.jwtRefreshSecret || stored.value.refresh,
  };
  return cached;
}

function secrets() {
  if (!cached) throw new Error('Secrets not loaded: call loadSecrets() at startup');
  return cached;
}

module.exports = { loadSecrets, secrets };
