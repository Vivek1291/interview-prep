// API keys are encrypted at rest (AES-256-GCM). The encryption key comes from AI_ENCRYPTION_KEY,
// or is generated once and stored in MongoDB (like the JWT secrets).
const crypto = require('crypto');
const Meta = require('../models/Meta');

let key = null;

async function loadKey() {
  if (key) return key;
  if (process.env.AI_ENCRYPTION_KEY) {
    key = crypto.createHash('sha256').update(process.env.AI_ENCRYPTION_KEY).digest();
    return key;
  }
  let stored = await Meta.findById('aiEncryptionKey').lean();
  if (!stored) {
    try { await Meta.create({ _id: 'aiEncryptionKey', value: crypto.randomBytes(32).toString('hex') }); } catch (err) { if (err.code !== 11000) throw err; }
    stored = await Meta.findById('aiEncryptionKey').lean();
  }
  key = Buffer.from(stored.value, 'hex');
  return key;
}

async function encrypt(plain) {
  const k = await loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

async function decrypt(enc) {
  if (!enc) return '';
  const [v, iv, tag, data] = String(enc).split(':');
  if (v !== 'v1') return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', await loadKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';                                     // wrong encryption key: the admin has to enter the key again
  }
}

const preview = (plain) => (plain ? `${plain.slice(0, 3)}…${plain.slice(-4)}` : '');

module.exports = { encrypt, decrypt, preview };
