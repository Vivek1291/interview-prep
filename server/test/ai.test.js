// The AI assistant against a FAKE AI server that speaks each provider's real streaming protocol
// (Anthropic SSE, OpenAI SSE, Gemini SSE, Ollama NDJSON). No real API is called.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
process.env.MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_ai_test');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate } = require('../src/seed/migrate');
const Meta = require('../src/models/Meta');
const aiService = require('../src/services/aiService');

// ---------------- fake AI server ----------------
const seen = {};
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {};
    const path = req.url;
    seen[path.split('/')[1]] = { headers: req.headers, body: json, url: path };
    const sse = (events) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const e of events) res.write(e); res.end(); };
    if (path === '/anthropic/v1/messages') {
      if (req.headers['x-api-key'] !== 'sk-ant-test') { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { message: 'invalid x-api-key' } })); return; }
      return sse([
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"## Debounce\\n\\nIt "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"waits.\\n\\n```js\\nconst x = 1;\\n```"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    }
    if (path === '/openai/chat/completions' || path === '/compat/chat/completions') {
      return sse([
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello from ' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: path.startsWith('/openai') ? 'OpenAI' : 'a compatible API' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ]);
    }
    if (path.startsWith('/gemini/v1beta/models/gem-model:streamGenerateContent')) {
      return sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini ' }] } }] })}\n\n`, `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'says hi' }] } }] })}\n\n`]);
    }
    if (path === '/ollama/api/chat') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ message: { content: 'Local ' }, done: false })}\n`);
      res.write(`${JSON.stringify({ message: { content: 'model' }, done: false })}\n${JSON.stringify({ done: true })}\n`);
      return res.end();
    }
    res.writeHead(404); res.end('not found');
  });
});

async function signUp(name, email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  const call = (method, url) => agent[method](url).set('Authorization', `Bearer ${res.body.accessToken}`);
  return { user: res.body.user, get: (u) => call('get', u), post: (u) => call('post', u), put: (u) => call('put', u) };
}
/** POST /api/ai/ask and collect the SSE events */
async function ask(who, body, status = 200) {
  const res = await who.post('/api/ai/ask').send(body).buffer(true)
    .parse((r, cb) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => cb(null, d)); })
    .expect(status);
  if (status !== 200) return { status: res.status, body: JSON.parse(res.body) };
  const events = String(res.body).split('\n\n').filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, '')));
  return { events, text: events.filter((e) => e.type === 'text').map((e) => e.text).join(''), error: events.find((e) => e.type === 'error')?.message };
}

let admin;
let learner;
let base;
let page;
let ids;

before(async () => {
  await new Promise((r) => fake.listen(0, r));
  base = `http://127.0.0.1:${fake.address().port}`;
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
  admin = await signUp('Admin', 'admin@example.com');
  learner = await signUp('Lee', 'lee@example.com');
  page = (await learner.get('/api/sections').expect(200)).body.data.pages.find((p) => p.title === 'Implement debounce');
});
after(async () => { await mongoose.disconnect(); fake.close(); });

test('not set up: status says disabled and asking explains how to enable it', async () => {
  assert.equal((await learner.get('/api/ai/status').expect(200)).body.data.enabled, false);
  const r = await ask(learner, { question: 'Explain more' }, 400);
  assert.match(r.body.message, /Settings → AI/);
  await learner.get('/api/admin/ai').expect(403);
});

test('admin configures providers: keys are encrypted and never sent back', async () => {
  const res = await admin.put('/api/admin/ai').send({
    enabled: true, allow: 'all', limitPerHour: 0,
    providers: [
      { name: 'Claude', type: 'anthropic', model: 'claude-sonnet-5', baseUrl: `${base}/anthropic`, apiKey: 'sk-ant-test' },
      { name: 'OpenAI', type: 'openai', model: 'gpt-x', baseUrl: `${base}/openai`, apiKey: 'sk-openai-test' },
      { name: 'Groq', type: 'openai-compatible', model: 'llama-x', baseUrl: `${base}/compat` },
      { name: 'Gemini', type: 'gemini', model: 'gem-model', baseUrl: `${base}/gemini`, apiKey: 'g-key' },
      { name: 'Ollama', type: 'ollama', model: 'qwen', baseUrl: `${base}/ollama` },
    ],
  }).expect(200);
  const s = res.body.data;
  ids = Object.fromEntries(s.providers.map((p) => [p.name, p.id]));
  assert.equal(s.providers.length, 5);
  assert.equal(s.defaultProvider, ids.Claude, 'first provider is the default');
  assert.ok(!JSON.stringify(s).includes('sk-ant-test'), 'API key not in the response');
  assert.equal(s.providers[0].keyPreview, 'sk-…test');
  assert.ok(s.adapterTypes.some((t) => t.type === 'openai-compatible' && t.presets.some((p) => p.name === 'OpenRouter')));
  const stored = JSON.stringify((await Meta.findById('aiSettings').lean()).value);
  assert.ok(!stored.includes('sk-ant-test') && stored.includes('v1:'), 'stored encrypted');

  // saving again without apiKey keeps the key; clearKey removes it
  const again = (await admin.put('/api/admin/ai').send({ providers: s.providers }).expect(200)).body.data;
  assert.equal(again.providers.find((p) => p.name === 'Claude').hasKey, true);
  await admin.put('/api/admin/ai').send({ providers: [{ name: 'x', type: 'nope', model: 'm' }] }).expect(400);
  await admin.put('/api/admin/ai').send({ providers: [{ name: 'x', type: 'openai', model: 'm', baseUrl: 'file:///etc/passwd' }] }).expect(400);

  const status = (await learner.get('/api/ai/status').expect(200)).body.data;
  assert.equal(status.enabled, true);
  assert.deepEqual(status.providers.map((p) => p.name), ['Claude', 'OpenAI', 'Groq', 'Gemini', 'Ollama']);
  assert.ok(!JSON.stringify(status).includes('Key') && !JSON.stringify(status).includes('sk-'), 'no key info for users');
});

test('every adapter streams text through /api/ai/ask', async () => {
  const claude = await ask(learner, { question: 'Explain with an example', pageId: page._id, selection: 'clearTimeout' });
  assert.equal(claude.events[0].type, 'start');
  assert.equal(claude.text, '## Debounce\n\nIt waits.\n\n```js\nconst x = 1;\n```');
  assert.equal(claude.events.at(-1).type, 'done');
  const sent = seen.anthropic;
  assert.equal(sent.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent.body.model, 'claude-sonnet-5');
  assert.equal(sent.body.stream, true);
  assert.match(sent.body.system, /interview/);
  assert.match(sent.body.messages[0].content, /Topic: Implement debounce/, 'the page is sent as context');
  assert.match(sent.body.messages[0].content, /clearTimeout/, 'the selection is sent');
  assert.match(sent.body.messages[0].content, /My request: Explain with an example/);

  assert.equal((await ask(learner, { question: 'q', providerId: ids.OpenAI })).text, 'Hello from OpenAI');
  assert.equal(seen.openai.headers.authorization, 'Bearer sk-openai-test');
  assert.equal(seen.openai.body.messages[0].role, 'system');
  assert.ok(seen.openai.body.max_completion_tokens > 0);
  assert.equal((await ask(learner, { question: 'q', providerId: ids.Groq })).text, 'Hello from a compatible API');
  assert.equal(seen.compat.headers.authorization, undefined, 'no key → no auth header');
  assert.ok(seen.compat.body.max_tokens > 0);
  assert.equal((await ask(learner, { question: 'q', providerId: ids.Gemini })).text, 'Gemini says hi');
  assert.equal(seen.gemini.headers['x-goog-api-key'], 'g-key');
  assert.equal(seen.gemini.body.systemInstruction.parts[0].text.length > 50, true);
  assert.equal((await ask(learner, { question: 'q', providerId: ids.Ollama })).text, 'Local model');
  assert.equal(seen.ollama.body.stream, true);
});

test('provider errors are explained; admins can test a provider', async () => {
  const s = (await admin.get('/api/admin/ai').expect(200)).body.data;
  const bad = s.providers.map((p) => (p.name === 'Claude' ? { ...p, apiKey: 'wrong-key' } : p));
  await admin.put('/api/admin/ai').send({ providers: bad }).expect(200);
  const r = await ask(learner, { question: 'q' });
  assert.match(r.error, /Anthropic answered 401 \(check the API key\): invalid x-api-key/);
  const t = (await admin.post(`/api/admin/ai/providers/${ids.Claude}/test`).expect(200)).body.data;
  assert.equal(t.ok, false);
  const ok = (await admin.post(`/api/admin/ai/providers/${ids.OpenAI}/test`).expect(200)).body.data;
  assert.equal(ok.ok, true);
  assert.equal(ok.sample, 'Hello from OpenAI');
  await learner.post(`/api/admin/ai/providers/${ids.OpenAI}/test`).expect(403);
  await admin.put('/api/admin/ai').send({ providers: s.providers.map((p) => (p.name === 'Claude' ? { ...p, apiKey: 'sk-ant-test' } : p)) }).expect(200);
});

test('admins-only mode and the hourly limit', async () => {
  await admin.put('/api/admin/ai').send({ allow: 'admins' }).expect(200);
  assert.equal((await learner.get('/api/ai/status').expect(200)).body.data.enabled, false);
  await ask(learner, { question: 'q' }, 403);
  assert.equal((await ask(admin, { question: 'q' })).error, undefined);

  await admin.put('/api/admin/ai').send({ allow: 'all', limitPerHour: 2 }).expect(200);
  aiService._resetUsage();
  await ask(learner, { question: '1' });
  await ask(learner, { question: '2' });
  const limited = await ask(learner, { question: '3' }, 429);
  assert.equal(limited.body.code, 'AI_LIMIT');
  await ask(admin, { question: 'admins are not limited' });
  await admin.put('/api/admin/ai').send({ limitPerHour: 0 }).expect(200);
});

test('preview and save an answer as a private sub-page (shared when an admin saves)', async () => {
  const markdown = (await ask(learner, { question: 'q', pageId: page._id })).text + '\n\n```mermaid\nflowchart LR\n  A["keystroke"] --> B["timer reset"]\n```';
  const blocks = (await learner.post('/api/ai/preview').send({ markdown }).expect(200)).body.data;
  assert.deepEqual(blocks.map((b) => b.type), ['text', 'code', 'diagram']);

  const saved = (await learner.post('/api/ai/save').send({ title: 'Debounce: more detail', markdown, parent: page._id, provider: { id: ids.Claude, name: 'Claude', model: 'claude-sonnet-5' } }).expect(201)).body.data;
  assert.equal(String(saved.parent), String(page._id), 'saved where the user chose: as a sub-page');
  assert.equal(String(saved.owner), String(learner.user._id), 'private');
  assert.deepEqual(saved.tags, ['ai']);
  assert.deepEqual(saved.blocks.map((b) => b.type), ['callout', 'text', 'code', 'diagram']);
  assert.match(saved.blocks[0].content, /Claude \(claude-sonnet-5\)/);
  assert.ok(!(await admin.get('/api/sections').expect(200)).body.data.pages.some((p) => p._id === saved._id), 'admin cannot see it');

  const cat = (await learner.get('/api/sections').expect(200)).body.data.nodes.find((n) => n.key === 'frontend/javascript');
  const sharedSave = (await admin.post('/api/ai/save').send({ title: 'Shared AI page', markdown, section: cat._id }).expect(201)).body.data;
  assert.equal(sharedSave.owner, null, 'admin saves for everyone');
  await learner.post('/api/ai/save').send({ title: 'x', markdown }).expect(400);       // no location
});
