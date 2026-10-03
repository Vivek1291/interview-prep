// AI settings: stored in MongoDB (Meta "aiSettings", edited in Settings → AI) plus providers from the environment.
//
// Environment (optional, handy with Docker):
//   AI_ENABLED=true
//   ANTHROPIC_API_KEY=…   [ANTHROPIC_MODEL=claude-sonnet-5]
//   OPENAI_API_KEY=…      OPENAI_MODEL=<model id>
//   GEMINI_API_KEY=…      GEMINI_MODEL=<model id>
//   AI_PROVIDERS='[{"name":"Groq","type":"openai-compatible","baseUrl":"https://api.groq.com/openai/v1","model":"…","apiKeyEnv":"GROQ_API_KEY"}]'
const crypto = require('crypto');
const Meta = require('../models/Meta');
const { adapters } = require('./adapters');
const { encrypt, decrypt, preview } = require('./keys');

const DEFAULTS = { enabled: false, allow: 'all', limitPerHour: 30, maxTokens: 2500, defaultProvider: null, providers: [] };

function envProviders() {
  const list = [];
  const add = (p) => list.push({ maxTokens: null, temperature: null, ...p, source: 'env' });
  if (process.env.ANTHROPIC_API_KEY) add({ id: 'env-anthropic', name: 'Claude', type: 'anthropic', baseUrl: adapters.anthropic.defaults.baseUrl, model: process.env.ANTHROPIC_MODEL || adapters.anthropic.defaults.model, apiKey: process.env.ANTHROPIC_API_KEY });
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) add({ id: 'env-openai', name: 'OpenAI', type: 'openai', baseUrl: adapters.openai.defaults.baseUrl, model: process.env.OPENAI_MODEL, apiKey: process.env.OPENAI_API_KEY });
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL) add({ id: 'env-gemini', name: 'Gemini', type: 'gemini', baseUrl: adapters.gemini.defaults.baseUrl, model: process.env.GEMINI_MODEL, apiKey: process.env.GEMINI_API_KEY });
  if (process.env.AI_PROVIDERS) {
    let extra = [];
    try { extra = JSON.parse(process.env.AI_PROVIDERS); } catch { console.warn('⚠️ AI_PROVIDERS is not valid JSON: ignored'); }
    extra.forEach((p, i) => {
      if (!adapters[p.type]) { console.warn(`⚠️ AI_PROVIDERS[${i}]: unknown type "${p.type}"`); return; }
      add({ id: `env-${i}`, name: p.name || p.type, type: p.type, baseUrl: p.baseUrl || adapters[p.type].defaults.baseUrl, model: p.model, apiKey: p.apiKeyEnv ? process.env[p.apiKeyEnv] : p.apiKey, maxTokens: p.maxTokens ?? null, temperature: p.temperature ?? null });
    });
  }
  return list;
}

async function readStored() {
  const doc = await Meta.findById('aiSettings').lean();
  return { ...DEFAULTS, ...(doc?.value || {}) };
}

/** Full settings with decrypted keys: for the server only, never sent to a browser. */
async function load() {
  const stored = await readStored();
  const own = await Promise.all(stored.providers.map(async (p) => ({ ...p, apiKey: await decrypt(p.keyEnc), source: 'settings' })));
  const providers = [...envProviders(), ...own];
  const enabled = stored.enabled || process.env.AI_ENABLED === 'true';
  const defaultProvider = providers.some((p) => p.id === stored.defaultProvider) ? stored.defaultProvider : providers[0]?.id || null;
  return { ...stored, enabled, defaultProvider, providers };
}

/** Settings as shown in the admin UI: keys masked. */
async function forAdmin() {
  const s = await load();
  return {
    enabled: s.enabled, allow: s.allow, limitPerHour: s.limitPerHour, maxTokens: s.maxTokens, defaultProvider: s.defaultProvider,
    providers: s.providers.map(({ apiKey, keyEnc, ...p }) => ({ ...p, hasKey: !!apiKey, keyPreview: preview(apiKey) })),
    adapterTypes: Object.values(adapters).map(({ type, label, needsKey, defaults, modelHint, presets }) => ({ type, label, needsKey, defaults, modelHint, presets: presets || [] })),
  };
}

/** Save the admin's changes. A provider without `apiKey` keeps its stored key (unless clearKey). */
async function save(input) {
  const stored = await readStored();
  // a partial update (e.g. only "allow") keeps the providers as they are
  let providers = input.providers === undefined ? stored.providers : [];
  for (const p of input.providers || []) {
    const old = stored.providers.find((o) => o.id === p.id);
    let keyEnc = old?.keyEnc || '';
    if (p.clearKey) keyEnc = '';
    if (p.apiKey) keyEnc = await encrypt(p.apiKey);
    providers.push({
      id: old?.id || p.id || crypto.randomUUID(),
      name: p.name, type: p.type, model: p.model,
      baseUrl: p.baseUrl || adapters[p.type].defaults.baseUrl,
      maxTokens: p.maxTokens ?? null, temperature: p.temperature ?? null,
      keyEnc,
    });
  }
  const value = {
    enabled: input.enabled ?? stored.enabled,
    allow: input.allow ?? stored.allow,
    limitPerHour: input.limitPerHour ?? stored.limitPerHour,
    maxTokens: input.maxTokens ?? stored.maxTokens,
    defaultProvider: input.defaultProvider ?? stored.defaultProvider,
    providers,
  };
  await Meta.updateOne({ _id: 'aiSettings' }, { $set: { value } }, { upsert: true });
  return forAdmin();
}

module.exports = { load, forAdmin, save, envProviders };
