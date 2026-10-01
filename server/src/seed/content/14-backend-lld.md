@section Backend LLD
@icon ⚙️
@color #475569
@desc Classes, modules, services, data models and APIs: URL shortener, rate limiter, notifications, job queue, orders, payments, auth, file storage, logging, HTTP client.

=== Design a URL Shortener
@p 3
@tags lld, url-shortener, base62, mongodb
@quick
- APIs: `POST /urls { longUrl, customAlias?, expiresAt? } → { shortCode, shortUrl }`, `GET /:shortCode → 301/302 redirect`.
- Model: `{ shortCode (unique index), longUrl, userId, clicks, expiresAt (TTL index), createdAt }`.
- Code generation: **random base62** (7 chars ≈ 3.5 trillion) + retry on collision (unique index → E11000), or **counter → base62** (no collisions; predictable), or a hash of the URL (dedupe).
- Layers: Controller → Service (generate, validate, collision retry) → Repository → MongoDB; **Redis cache** for hot redirects.
- 301 (cacheable, less analytics) vs **302** (every hit reaches you → click analytics); validate URLs (http/https only), rate-limit creation, abuse checks.

::: text
### Requirements (clarify)
- Functional: shorten, redirect, optional custom alias, expiry, click count.
- Non-functional: **read-heavy** (100:1 redirects vs creates), low redirect latency, unique codes, high availability.

### Short-code strategies
| Strategy | Pros | Cons |
|---|---|---|
| **Random base62 (7 chars)** | Unpredictable, simple | Collisions possible → retry on duplicate key |
| Counter (auto-increment / Redis INCR) → base62 | No collisions, short | Predictable/enumerable; needs a distributed counter |
| Hash(longUrl) truncated | Same URL → same code (dedupe) | Collisions on truncation; can't have two codes per URL |

62⁷ = **3.5 trillion** combinations. With 100M URLs the collision probability per insert is ~0.003%, so a retry loop is fine.

### Classes / modules
`UrlController` → `UrlService` (`createShortUrl`, `resolve`, `generateCode`) → `UrlRepository` (`insert`, `findByCode`, `incrementClicks`) → MongoDB `urls`; plus `CacheService` (Redis).
:::

::: diagram
sequenceDiagram
  participant C as Client
  participant API as UrlController
  participant S as UrlService
  participant R as Redis
  participant DB as MongoDB
  C->>API: POST /urls (longUrl)
  API->>S: createShortUrl
  S->>DB: insert code (unique index), retry on E11000
  S-->>C: 201 short url
  C->>API: GET /aZ3kP9x
  API->>R: GET url:aZ3kP9x
  alt cache hit
    R-->>API: longUrl
  else miss
    API->>DB: findByCode
    API->>R: SET with TTL
  end
  API-->>C: 302 Location longUrl
  API--)DB: async clicks +1
:::

::: code javascript Try it: base62 encoding + random codes (runs in browser)
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase62(num) {
  if (num === 0) return '0';
  let s = '';
  while (num > 0) { s = ALPHABET[num % 62] + s; num = Math.floor(num / 62); }
  return s;
}
function fromBase62(str) { return [...str].reduce((n, ch) => n * 62 + ALPHABET.indexOf(ch), 0); }
function randomCode(len = 7) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHABET[b % 62]).join('');
}

console.log('counter 125 →', toBase62(125), '→ back', fromBase62(toBase62(125)));
console.log('counter 1e9 →', toBase62(1e9), '(6 chars)');
console.log('random codes:', randomCode(), randomCode(), randomCode());
console.log('7-char space:', (62 ** 7).toLocaleString(), 'combinations');

// Simulated service with collision retry
const db = new Map();
function createShortUrl(longUrl, tries = 5) {
  if (!/^https?:\/\//.test(longUrl)) throw new Error('Invalid URL');
  for (let i = 0; i < tries; i++) {
    const code = randomCode();
    if (!db.has(code)) { db.set(code, { longUrl, clicks: 0 }); return code; } // unique index in real DB
  }
  throw new Error('Could not generate unique code');
}
const code = createShortUrl('https://nodejs.org/en/learn');
db.get(code).clicks++;
console.log('created', code, db.get(code));
:::

::: code javascript Express + Mongoose implementation
const UrlSchema = new Schema({
  shortCode: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, index: true },
  clicks: { type: Number, default: 0 },
  expiresAt: { type: Date },
}, { timestamps: true });
UrlSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: auto-delete expired
const Url = model('Url', UrlSchema);

const urlService = {
  async create({ longUrl, customAlias, expiresAt, userId }) {
    const u = new URL(longUrl);                                         // throws if invalid
    if (!['http:', 'https:'].includes(u.protocol)) throw new AppError(400, 'Only http(s) URLs');
    if (customAlias) {
      if (!/^[a-zA-Z0-9_-]{4,30}$/.test(customAlias)) throw new AppError(400, 'Invalid alias');
      try { return await Url.create({ shortCode: customAlias, longUrl, expiresAt, userId }); }
      catch (e) { if (e.code === 11000) throw new AppError(409, 'Alias taken'); throw e; }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await Url.create({ shortCode: randomCode(7), longUrl, expiresAt, userId }); }
      catch (e) { if (e.code !== 11000) throw e; }                       // collision → retry
    }
    throw new AppError(500, 'Could not allocate code');
  },
  async resolve(code) {
    const cached = await redis.get(`url:${code}`);
    if (cached) return cached;
    const doc = await Url.findOne({ shortCode: code }).lean();
    if (!doc || (doc.expiresAt && doc.expiresAt < new Date())) return null;
    await redis.set(`url:${code}`, doc.longUrl, 'EX', 3600);
    return doc.longUrl;
  },
};

router.post('/urls', authenticate, rateLimit({ limit: 20, windowSec: 60 }), asyncHandler(async (req, res) => {
  const doc = await urlService.create({ ...req.body, userId: req.user.id });
  res.status(201).json({ shortCode: doc.shortCode, shortUrl: `${process.env.BASE_URL}/${doc.shortCode}` });
}));

router.get('/:code', asyncHandler(async (req, res) => {
  const longUrl = await urlService.resolve(req.params.code);
  if (!longUrl) return res.status(404).send('Link not found or expired');
  Url.updateOne({ shortCode: req.params.code }, { $inc: { clicks: 1 } }).catch(() => {}); // fire-and-forget (or queue)
  res.redirect(302, longUrl);
}));
:::

::: ask
- *"Expected scale (URLs/day, redirects/sec)? Custom aliases? Expiry? Analytics detail (geo, referrer)? Must codes be unguessable?"*
- *"301 or 302?"* 301 is cached by browsers, which is faster but you lose analytics; 302/307 keeps the analytics.
:::

::: links
System design: URL shortener (ByteByteGo) | https://bytebytego.com/courses/system-design-interview/design-a-url-shortener
:::

=== Design a Rate Limiter
@p 3
@tags lld, rate-limiter, redis, token-bucket
@quick
- Interface: `RateLimiter.isAllowed(key) → { allowed, remaining, retryAfter }`; used as middleware; key = userId / API key / IP.
- Algorithms: **fixed window** (INCR + EXPIRE), **sliding window log/counter**, **token bucket** (bursts), leaky bucket.
- Distributed: **Redis** with atomic ops / **Lua script**; fail-open vs fail-closed if Redis is down.
- Return **429** + `Retry-After` + `RateLimit-*` headers; per-route/per-plan configs.
- Strategy pattern: `RateLimiter` interface with `FixedWindowLimiter`, `TokenBucketLimiter` implementations.

::: text
### Design
- **Interface** `RateLimiter { isAllowed(key): Promise<Decision> }` with pluggable strategies (Strategy pattern).
- **Store** interface: `MemoryStore` (single instance / tests) and `RedisStore` (distributed).
- **Middleware**: builds the key (`user:42` / `ip:1.2.3.4` / `apikey:abc`), calls the limiter, sets headers, returns 429.
- **Config**: rules per route & plan: `{ '/api/auth/login': { limit: 5, window: 60 }, default: { limit: 300, window: 60 } }`.

| Algorithm | Memory | Accuracy | Bursts |
|---|---|---|---|
| Fixed window | O(1) per key | Boundary spikes (2×) | Allowed at edges |
| Sliding log | O(requests) | Exact | Controlled |
| Sliding counter | O(1) | Approximate, good | Smooth |
| **Token bucket** | O(1) | Good | Configurable burst ✅ |
:::

::: diagram
flowchart LR
  REQ["Request"] --> MW["rateLimit middleware: key = user or ip"]
  MW --> L{"RateLimiter.isAllowed(key)"}
  L --> ST[("Redis: atomic Lua script")]
  L -->|"allowed"| NEXT["next(): controller"]
  L -->|"rejected"| R429["429 Too Many Requests + Retry-After"]
:::

::: code javascript Token bucket limiter with pluggable store (runs in browser with MemoryStore)
class MemoryStore {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async set(key, val) { this.map.set(key, val); }
}

class TokenBucketLimiter {
  constructor({ capacity, refillPerSec, store = new MemoryStore(), now = () => Date.now() }) {
    Object.assign(this, { capacity, refillPerSec, store, now });
  }
  async isAllowed(key) {
    const t = this.now();
    const b = (await this.store.get(key)) || { tokens: this.capacity, ts: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.ts) / 1000) * this.refillPerSec); // refill
    b.ts = t;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    await this.store.set(key, b);
    return { allowed, remaining: Math.floor(b.tokens), retryAfter: allowed ? 0 : Math.ceil((1 - b.tokens) / this.refillPerSec) };
  }
}

// ---- simulate: capacity 5, refill 1/sec ----
let fakeNow = 0;
const limiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1, now: () => fakeNow });
(async () => {
  const burst = [];
  for (let i = 0; i < 8; i++) burst.push((await limiter.isAllowed('user:42')).allowed);
  console.log('burst of 8 at t=0:', burst.map((a) => (a ? '✔' : '✖')).join(' '));
  fakeNow = 3000;
  const later = [];
  for (let i = 0; i < 4; i++) later.push((await limiter.isAllowed('user:42')).allowed);
  console.log('after 3s (3 tokens refilled):', later.map((a) => (a ? '✔' : '✖')).join(' '));
  console.log((await limiter.isAllowed('user:99')).allowed ? '✅ keys are independent' : '❌ FAIL');
})();
:::

::: code javascript Redis fixed-window limiter with an atomic Lua script (production)
const LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }`;

class RedisFixedWindowLimiter {
  constructor(redis, { limit, windowMs }) { Object.assign(this, { redis, limit, windowMs }); }
  async isAllowed(key) {
    try {
      const [count, ttl] = await this.redis.eval(LUA, 1, `rl:${key}`, this.windowMs);
      return { allowed: count <= this.limit, remaining: Math.max(0, this.limit - count), retryAfter: Math.ceil(ttl / 1000) };
    } catch (err) {
      console.error('rate limiter store down', err);
      return { allowed: true, remaining: 0, retryAfter: 0 }; // fail-OPEN (availability) — choose fail-closed for login/OTP
    }
  }
}
// Express middleware factory (works with ANY limiter implementing isAllowed)
const rateLimit = (limiter, keyFn = (req) => req.user?.id || req.ip) => async (req, res, next) => {
  const d = await limiter.isAllowed(keyFn(req));
  res.set('RateLimit-Remaining', String(d.remaining));
  if (!d.allowed) return res.status(429).set('Retry-After', String(d.retryAfter)).json({ message: 'Too many requests' });
  next();
};

app.use('/api', rateLimit(new RedisFixedWindowLimiter(redis, { limit: 300, windowMs: 60_000 })));
app.use('/api/auth/login', rateLimit(new RedisFixedWindowLimiter(redis, { limit: 5, windowMs: 60_000 }), (req) => `login:${req.ip}`));
:::

::: ask
- *"Per user, IP or API key? Hard or soft limits? Distributed? Different tiers? What if Redis is down: fail open or closed?"*
:::

::: links
Rate limiting algorithms (Cloudflare) | https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
Redis rate limiter pattern | https://redis.io/learn/howtos/ratelimiting
:::

=== Design a Notification System (email, SMS, push)
@p 3
@tags lld, notifications, queue, strategy-pattern
@quick
- Event (OrderPlaced) → **NotificationService** → checks **user preferences** → renders **templates** → enqueues per channel → **channel workers** (Email/SMS/Push providers).
- **Queue** decouples & absorbs spikes; **retries** with exponential backoff; **DLQ** for permanent failures.
- **Strategy pattern**: `Channel { send(to, message) }` → EmailChannel (SES), SmsChannel (SNS/Twilio), PushChannel (FCM).
- Idempotency (dedupe key per event+user+channel), rate limits per user, quiet hours, **notification log** for status (queued/sent/failed/delivered).
- In-app notifications stored in MongoDB + WebSocket push; unread counts.

::: diagram
flowchart LR
  EV["Event: order placed"] --> NS["NotificationService"]
  NS --> PREF[("User preferences")]
  NS --> TPL["TemplateRenderer"]
  NS --> Q1["email queue"]
  NS --> Q2["sms queue"]
  NS --> Q3["push queue"]
  Q1 --> W1["EmailWorker: SES"]
  Q2 --> W2["SmsWorker: Twilio / SNS"]
  Q3 --> W3["PushWorker: FCM / APNs"]
  W1 -->|"retry with backoff"| Q1
  W1 -->|"max attempts"| DLQ["Dead-letter queue"]
  W1 --> LOG[("notification_logs")]
:::

::: code javascript Notification service with channels, preferences, templates, retries (runs in browser)
// ---- Channels (Strategy pattern) ----
class EmailChannel { name = 'email'; async send(user, msg) { if (Math.random() < 0.3) throw new Error('SES throttled'); return `email→${user.email}: ${msg.subject}`; } }
class SmsChannel { name = 'sms'; async send(user, msg) { return `sms→${user.phone}: ${msg.text}`; } }
class PushChannel { name = 'push'; async send(user, msg) { return `push→device(${user.id}): ${msg.title}`; } }

// ---- Templates ----
const templates = {
  ORDER_PLACED: {
    email: (d) => ({ subject: `Order #${d.orderId} confirmed`, body: `Hi ${d.name}, total ₹${d.total}` }),
    sms: (d) => ({ text: `Order #${d.orderId} placed. Total ₹${d.total}` }),
    push: (d) => ({ title: 'Order confirmed 🎉', body: `#${d.orderId}` }),
  },
};

// ---- Tiny in-memory queue with retry + DLQ (BullMQ/SQS in production) ----
class Queue {
  constructor(handler, { maxAttempts = 3, baseDelay = 50 } = {}) { Object.assign(this, { handler, maxAttempts, baseDelay, dlq: [] }); }
  add(job) { this.#run({ ...job, attempts: 0 }); }
  async #run(job) {
    try { console.log('✔', await this.handler(job)); }
    catch (err) {
      job.attempts++;
      if (job.attempts >= this.maxAttempts) { this.dlq.push({ ...job, error: err.message }); return console.log('☠ DLQ', job.channel, err.message); }
      const delay = this.baseDelay * 2 ** job.attempts;              // exponential backoff
      console.log(`↻ retry ${job.attempts} in ${delay}ms (${err.message})`);
      setTimeout(() => this.#run(job), delay);
    }
  }
}

class NotificationService {
  constructor(channels, prefsRepo) {
    this.channels = new Map(channels.map((c) => [c.name, c]));
    this.prefsRepo = prefsRepo;
    this.sent = new Set(); // idempotency keys
    this.queue = new Queue(async ({ channel, user, message }) => this.channels.get(channel).send(user, message));
  }
  async notify(user, type, data, eventId) {
    const prefs = this.prefsRepo(user.id);                          // e.g. { email: true, sms: false, push: true }
    for (const [channel, enabled] of Object.entries(prefs)) {
      if (!enabled || !templates[type][channel]) continue;
      const key = `${eventId}:${user.id}:${channel}`;
      if (this.sent.has(key)) continue;                             // dedupe
      this.sent.add(key);
      this.queue.add({ channel, user, message: templates[type][channel](data) });
    }
  }
}

const service = new NotificationService([new EmailChannel(), new SmsChannel(), new PushChannel()], () => ({ email: true, sms: false, push: true }));
const user = { id: 'u42', email: 'vivek@x.com', phone: '+91…' };
service.notify(user, 'ORDER_PLACED', { orderId: 1001, name: 'Vivek', total: 2499 }, 'evt-1');
service.notify(user, 'ORDER_PLACED', { orderId: 1001, name: 'Vivek', total: 2499 }, 'evt-1'); // duplicate event → ignored
:::

::: ask
- *"Which channels? Transactional vs marketing (unsubscribe/consent rules)? Volume/peaks? Delivery tracking? User preferences and quiet hours? Localisation?"*
:::

::: links
AWS SES | https://docs.aws.amazon.com/ses/latest/dg/Welcome.html
Firebase Cloud Messaging | https://firebase.google.com/docs/cloud-messaging
:::

=== Design a Job Queue (Producer → Queue → Worker)
@p 3
@tags lld, queue, bullmq, workers
@quick
- **Producer** adds jobs `{ name, data, opts: { attempts, backoff, delay, priority, jobId } }` → **Queue** (Redis/BullMQ, SQS) → **Workers** process with a **concurrency** limit.
- Job states: **waiting → active → completed | failed → (retry) → dead-letter**; delayed & repeatable (cron) jobs.
- **Retries** with exponential backoff; **DLQ** after max attempts; **idempotent** handlers (at-least-once delivery!).
- Visibility timeout / stalled-job detection; graceful shutdown (finish the active job); progress reporting; monitoring (Bull Board).
- Use for emails, PDFs, image processing, webhooks, reports: anything slow → the API returns **202**.

::: diagram Job lifecycle
stateDiagram-v2
  [*] --> Waiting: add()
  Waiting --> Delayed: delay or backoff
  Delayed --> Waiting
  Waiting --> Active: worker picks
  Active --> Completed: success
  Active --> Failed: throws
  Failed --> Delayed: attempts left
  Failed --> DeadLetter: max attempts
  Completed --> [*]
:::

::: code javascript In-memory job queue with concurrency, retries, backoff, DLQ, idempotency (runs in browser)
class JobQueue {
  constructor({ concurrency = 2, maxAttempts = 3, backoffMs = 100 } = {}) {
    Object.assign(this, { concurrency, maxAttempts, backoffMs });
    this.waiting = []; this.active = 0; this.handlers = new Map();
    this.completed = []; this.dead = []; this.seenIds = new Set();
  }
  process(name, handler) { this.handlers.set(name, handler); }
  add(name, data, { jobId } = {}) {
    if (jobId && this.seenIds.has(jobId)) return;          // idempotent enqueue (dedupe)
    if (jobId) this.seenIds.add(jobId);
    this.waiting.push({ id: jobId || Math.random().toString(36).slice(2, 8), name, data, attempts: 0 });
    this.#tick();
  }
  #tick() {
    while (this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      this.active++;
      this.#run(job).finally(() => { this.active--; this.#tick(); });
    }
  }
  async #run(job) {
    try {
      const result = await this.handlers.get(job.name)(job);
      this.completed.push(job.id);
      console.log(`✔ ${job.name}#${job.id}`, result ?? '');
    } catch (err) {
      job.attempts++;
      if (job.attempts >= this.maxAttempts) { this.dead.push({ ...job, error: err.message }); console.log(`☠ ${job.name}#${job.id} → DLQ (${err.message})`); return; }
      const delay = this.backoffMs * 2 ** (job.attempts - 1);
      console.log(`↻ ${job.name}#${job.id} attempt ${job.attempts} failed, retry in ${delay}ms`);
      setTimeout(() => { this.waiting.push(job); this.#tick(); }, delay);
    }
  }
}

const q = new JobQueue({ concurrency: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
q.process('sendEmail', async (job) => { await sleep(50); return `to ${job.data.to}`; });
q.process('flakyWebhook', async (job) => { await sleep(20); if (job.attempts < 2) throw new Error('503 from partner'); return 'delivered'; });
q.process('brokenReport', async () => { throw new Error('template missing'); });

q.add('sendEmail', { to: 'a@x.com' }, { jobId: 'welcome-u1' });
q.add('sendEmail', { to: 'a@x.com' }, { jobId: 'welcome-u1' }); // duplicate → ignored
q.add('flakyWebhook', { url: 'https://partner' });
q.add('brokenReport', {});
q.add('sendEmail', { to: 'b@x.com' });
setTimeout(() => console.log('completed:', q.completed.length, 'dead:', q.dead.length), 1500);
:::

::: code javascript Production: BullMQ producer + worker
const { Queue, Worker, QueueEvents } = require('bullmq');
const connection = { host: process.env.REDIS_HOST, port: 6379 };

// Producer (API)
const reportQueue = new Queue('reports', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
router.post('/reports', authenticate, asyncHandler(async (req, res) => {
  const job = await reportQueue.add('monthly', { userId: req.user.id, month: req.body.month }, { jobId: `monthly:${req.user.id}:${req.body.month}` }); // idempotent
  res.status(202).json({ jobId: job.id });
}));
router.get('/reports/:jobId', asyncHandler(async (req, res) => {
  const job = await reportQueue.getJob(req.params.jobId);
  res.json({ state: await job.getState(), progress: job.progress, result: job.returnvalue });
}));

// Worker (separate process/container)
const worker = new Worker('reports', async (job) => {
  await job.updateProgress(10);
  const key = await generatePdfAndUploadToS3(job.data); // must be idempotent (same key per jobId)
  await job.updateProgress(100);
  return { key };
}, { connection, concurrency: 4 });
worker.on('failed', (job, err) => console.error(`job ${job.id} failed (${job.attemptsMade})`, err.message));
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); }); // finish active jobs
:::

::: ask
- *"Throughput and job duration? Ordering required? Exactly-once needed?"* (Realistically at-least-once + idempotency.) *"Priorities / delayed / cron jobs?"* *"Redis (BullMQ) or managed (SQS)?"*
:::

::: links
BullMQ docs | https://docs.bullmq.io
Amazon SQS dead-letter queues | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
:::

=== Design a Payment System
@p 3
@tags lld, payments, idempotency, webhooks, state-machine
@quick
- Payment **state machine**: `INITIATED → PROCESSING → SUCCESS | FAILED` (+ REFUNDED); only allow valid transitions (atomic conditional updates).
- **Idempotency key** on create/charge → no double charges on retries.
- Provider flow (Stripe/Razorpay): create an intent/order server-side → the client completes → the provider sends a **webhook** → **verify the signature** → update status (webhooks can be **duplicated/out of order** → idempotent handler).
- **Never trust the client** for amount/status; amounts in minor units (paise); store a **transaction ledger** (append-only).
- Reconciliation job for stuck PROCESSING payments; retries with backoff; audit logs; PCI: never store card data (use provider tokens).

::: diagram State machine
stateDiagram-v2
  [*] --> INITIATED: create payment (idempotency key)
  INITIATED --> PROCESSING: provider intent created
  PROCESSING --> SUCCESS: webhook payment succeeded
  PROCESSING --> FAILED: webhook failed / timeout
  FAILED --> PROCESSING: user retries
  SUCCESS --> REFUNDED: refund
  SUCCESS --> [*]
:::

::: diagram End-to-end flow with webhook
sequenceDiagram
  participant C as React
  participant A as Payment API
  participant P as Provider (Stripe/Razorpay)
  participant DB as MongoDB
  C->>A: POST /payments (orderId, Idempotency-Key)
  A->>DB: create payment INITIATED (unique idempotencyKey)
  A->>P: create PaymentIntent (amount from DB order)
  A->>DB: status PROCESSING, providerRef
  A-->>C: clientSecret
  C->>P: confirm card (3DS)
  P->>A: webhook payment_intent.succeeded (signed)
  A->>A: verify signature, dedupe event id
  A->>DB: PROCESSING → SUCCESS (conditional update), ledger entry, order PAID
  A-->>P: 200 OK
:::

::: code javascript Try it: payment state machine with guarded transitions + idempotent webhook (runs in browser)
const TRANSITIONS = {
  INITIATED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['SUCCESS', 'FAILED'],
  FAILED: ['PROCESSING'],
  SUCCESS: ['REFUNDED'],
  REFUNDED: [],
};

class PaymentService {
  constructor() { this.payments = new Map(); this.byIdemKey = new Map(); this.processedEvents = new Set(); this.ledger = []; }

  create({ orderId, amount, idempotencyKey }) {
    if (this.byIdemKey.has(idempotencyKey)) return this.payments.get(this.byIdemKey.get(idempotencyKey)); // replay
    const p = { id: `pay_${this.payments.size + 1}`, orderId, amount, status: 'INITIATED', history: ['INITIATED'] };
    this.payments.set(p.id, p);
    this.byIdemKey.set(idempotencyKey, p.id);
    return p;
  }

  transition(id, to) {
    const p = this.payments.get(id);
    if (!TRANSITIONS[p.status].includes(to)) throw new Error(`Invalid transition ${p.status} → ${to}`);
    p.status = to; p.history.push(to);                 // in Mongo: updateOne({ _id, status: from }, { $set: { status: to } })
    if (to === 'SUCCESS') this.ledger.push({ paymentId: id, type: 'CREDIT', amount: p.amount, at: Date.now() });
    return p;
  }

  handleWebhook(event) {
    if (this.processedEvents.has(event.id)) return 'duplicate ignored';   // webhooks can repeat
    this.processedEvents.add(event.id);
    const to = event.type === 'payment.succeeded' ? 'SUCCESS' : 'FAILED';
    try { this.transition(event.paymentId, to); return `→ ${to}`; }
    catch (e) { return `ignored (${e.message})`; }                        // out-of-order event
  }
}

const svc = new PaymentService();
const p1 = svc.create({ orderId: 'o1', amount: 49900, idempotencyKey: 'k-123' });
const p1Again = svc.create({ orderId: 'o1', amount: 49900, idempotencyKey: 'k-123' });
console.log('idempotent create:', p1 === p1Again ? '✅ same payment' : '❌ FAIL');
svc.transition(p1.id, 'PROCESSING');
console.log('webhook 1:', svc.handleWebhook({ id: 'evt_1', type: 'payment.succeeded', paymentId: p1.id }));
console.log('webhook 1 again:', svc.handleWebhook({ id: 'evt_1', type: 'payment.succeeded', paymentId: p1.id }));
console.log('late failed webhook:', svc.handleWebhook({ id: 'evt_2', type: 'payment.failed', paymentId: p1.id }));
console.log('history:', p1.history.join(' → '), '| ledger entries:', svc.ledger.length, svc.ledger.length === 1 ? '✅' : '❌ FAIL');
:::

::: code javascript Webhook endpoint (Stripe): raw body + signature verification + idempotency
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ⚠️ raw body required for signature verification → register BEFORE express.json()
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Invalid signature: ${err.message}`);
  }

  // dedupe: unique index on processedEvents.eventId
  const firstTime = await ProcessedEvent.updateOne({ eventId: event.id }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  if (!firstTime.upsertedCount) return res.json({ received: true, duplicate: true });

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const r = await Payment.updateOne({ providerRef: intent.id, status: 'PROCESSING' }, { $set: { status: 'SUCCESS', paidAt: new Date() } }, { session });
      if (r.modifiedCount) {
        await Ledger.create([{ providerRef: intent.id, type: 'CREDIT', amount: intent.amount }], { session });
        await Order.updateOne({ paymentRef: intent.id }, { $set: { status: 'PAID' } }, { session });
      }
    });
    session.endSession();
  }
  res.json({ received: true }); // respond quickly (< a few seconds) — do heavy work in a queue
});
:::

::: ask
- *"Which provider? One-time vs subscriptions? Refunds/partial refunds? Multi-currency? Reconciliation requirements? What happens if the webhook never arrives?"* (Poll the provider in a reconciliation job.)
:::

::: links
Stripe: webhooks best practices | https://docs.stripe.com/webhooks
Stripe: idempotent requests | https://docs.stripe.com/api/idempotent_requests
Razorpay payment flow | https://razorpay.com/docs/payments/payment-gateway/how-it-works/
:::

=== Design an E-commerce Order System
@p 2
@tags lld, ecommerce, orders, inventory
@quick
- Entities: **User, Product, Cart (items), Order (line-item snapshots, status), Payment, Inventory (stock, reserved)**.
- Flow: **Cart → Order (PENDING, reserve stock) → Payment → confirm (PAID, commit stock) → fulfilment (SHIPPED/DELIVERED)**; cancel/timeout → release the reservation.
- Prevent overselling: **atomic conditional decrement** `updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })` (+ transactions for multiple items).
- Price & name are **snapshotted** into the order; totals computed **server-side** (tax, discounts, shipping).
- Order status state machine + events (OrderPlaced → email, analytics) via a queue; idempotent order creation.

::: diagram
flowchart LR
  CART["Cart"] -->|"checkout"| ORD["Order: PENDING, snapshot prices"]
  ORD -->|"reserve stock atomically"| INV[("Inventory")]
  ORD --> PAY["Payment"]
  PAY -->|"success webhook"| CONF["Order PAID → commit stock"]
  PAY -->|"fail or 15-min timeout"| REL["Release reservation → CANCELLED"]
  CONF --> SHIP["SHIPPED → DELIVERED"]
  CONF --> EVT["Event: OrderPlaced → email, analytics"]
:::

::: code javascript Try it: classes for Cart → Order → Inventory with reservation (runs in browser)
class Inventory {
  constructor(stock) { this.stock = new Map(Object.entries(stock)); this.reserved = new Map(); }
  available(sku) { return (this.stock.get(sku) || 0) - (this.reserved.get(sku) || 0); }
  reserve(items) {                                   // all-or-nothing
    for (const { sku, qty } of items) if (this.available(sku) < qty) throw new Error(`Out of stock: ${sku}`);
    items.forEach(({ sku, qty }) => this.reserved.set(sku, (this.reserved.get(sku) || 0) + qty));
  }
  release(items) { items.forEach(({ sku, qty }) => this.reserved.set(sku, this.reserved.get(sku) - qty)); }
  commit(items) { items.forEach(({ sku, qty }) => { this.reserved.set(sku, this.reserved.get(sku) - qty); this.stock.set(sku, this.stock.get(sku) - qty); }); }
}

class Cart {
  constructor(userId) { this.userId = userId; this.items = new Map(); }
  add(product, qty = 1) { const cur = this.items.get(product.sku); this.items.set(product.sku, { product, qty: (cur?.qty || 0) + qty }); }
  lines() { return [...this.items.values()]; }
}

class OrderService {
  constructor(inventory) { this.inventory = inventory; this.orders = []; }
  checkout(cart) {
    const items = cart.lines().map(({ product, qty }) => ({ sku: product.sku, name: product.name, unitPrice: product.price, qty })); // snapshot
    this.inventory.reserve(items);
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const order = { id: `ord_${this.orders.length + 1}`, userId: cart.userId, items, subtotal, tax: Math.round(subtotal * 0.18), status: 'PENDING' };
    order.total = order.subtotal + order.tax;
    this.orders.push(order);
    return order;
  }
  paymentSucceeded(order) { this.inventory.commit(order.items); order.status = 'PAID'; }
  paymentFailed(order) { this.inventory.release(order.items); order.status = 'CANCELLED'; }
}

const inv = new Inventory({ BOOK: 2, PEN: 10 });
const svc = new OrderService(inv);
const book = { sku: 'BOOK', name: 'Node Patterns', price: 49900 };
const pen = { sku: 'PEN', name: 'Pen', price: 2000 };

const c1 = new Cart('u1'); c1.add(book, 2); c1.add(pen, 3);
const o1 = svc.checkout(c1);
console.log(o1.id, o1.status, 'total', o1.total, '| BOOK available:', inv.available('BOOK'));

const c2 = new Cart('u2'); c2.add(book, 1);
try { svc.checkout(c2); } catch (e) { console.log('u2:', e.message, '✅ oversell prevented'); }

svc.paymentFailed(o1);
console.log('after failure → BOOK available again:', inv.available('BOOK'));
const o2 = svc.checkout(c2); svc.paymentSucceeded(o2);
console.log(o2.id, o2.status, '| BOOK stock:', inv.stock.get('BOOK'));
:::

::: ask
- *"Flash sales / high contention on the same SKU?"* (Redis counters, a queue, or a reservation service.) *"Multiple warehouses? Partial fulfilment? Returns?"*
:::

::: links
Saga pattern (microservices.io) | https://microservices.io/patterns/data/saga.html
:::

=== Design an Authentication Service (backend)
@p 2
@tags lld, auth, rbac, jwt
@quick
- Layers: **AuthController → AuthService → UserRepository / TokenRepository → MongoDB (+ Redis)**.
- Features: register, login, **password hashing (bcrypt/argon2)**, **JWT access + rotating refresh tokens** (stored hashed), logout (revoke), sessions list, **RBAC**, password reset, email verification, **rate limiting + lockout**, MFA.
- Refresh-token **reuse detection** → revoke the whole token family.
- Middleware: `authenticate`, `authorize(...roles)` / `requirePermission('order:delete')`.
- Security: generic error messages, audit log, secrets in a vault, short token TTLs.

::: diagram Class diagram
classDiagram
  class AuthController {
    +register(req, res)
    +login(req, res)
    +refresh(req, res)
    +logout(req, res)
  }
  class AuthService {
    +register(dto)
    +login(email, password, meta)
    +refresh(refreshToken)
    +logout(refreshToken)
    -issueTokens(user)
  }
  class UserRepository {
    +findByEmail(email)
    +create(data)
  }
  class TokenRepository {
    +save(tokenHash, userId, familyId, expiresAt)
    +findByHash(hash)
    +revokeFamily(familyId)
  }
  class PasswordHasher {
    +hash(plain)
    +compare(plain, hash)
  }
  AuthController --> AuthService
  AuthService --> UserRepository
  AuthService --> TokenRepository
  AuthService --> PasswordHasher
:::

::: code javascript AuthService with refresh-token rotation & reuse detection
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

class AuthService {
  constructor({ users, tokens, hasher, config }) { Object.assign(this, { users, tokens, hasher, config }); }

  async register({ name, email, password }) {
    if (await this.users.findByEmail(email)) throw new AppError(409, 'Email already registered');
    const user = await this.users.create({ name, email, passwordHash: await this.hasher.hash(password), role: 'user' });
    return this.#issueTokens(user, crypto.randomUUID());
  }

  async login(email, password) {
    const user = await this.users.findByEmail(email, { withPassword: true });
    if (!user || !(await this.hasher.compare(password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
    return this.#issueTokens(user, crypto.randomUUID()); // new token family per login/device
  }

  async refresh(rawRefreshToken) {
    const stored = await this.tokens.findByHash(sha256(rawRefreshToken));
    if (!stored || stored.expiresAt < new Date()) throw new AppError(401, 'Invalid refresh token');
    if (stored.revoked) {                                 // token REUSE → likely theft
      await this.tokens.revokeFamily(stored.familyId);
      throw new AppError(401, 'Refresh token reuse detected');
    }
    await this.tokens.revoke(stored._id);                 // rotate
    const user = await this.users.findById(stored.userId);
    return this.#issueTokens(user, stored.familyId);
  }

  async logout(rawRefreshToken) {
    const stored = await this.tokens.findByHash(sha256(rawRefreshToken));
    if (stored) await this.tokens.revokeFamily(stored.familyId);
  }

  async #issueTokens(user, familyId) {
    const accessToken = jwt.sign({ sub: String(user._id), role: user.role }, this.config.jwtSecret, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(48).toString('base64url');       // opaque, stored hashed
    await this.tokens.save({ tokenHash: sha256(refreshToken), userId: user._id, familyId, expiresAt: new Date(Date.now() + 7 * 864e5) });
    return { accessToken, refreshToken, user: { id: user._id, name: user.name, role: user.role } };
  }
}
module.exports = AuthService;
:::

::: ask
- *"Build in-house or use Cognito/Auth0/Keycloak? SSO/OAuth? MFA? Multi-tenant roles? Session listing/revocation per device?"*
:::

::: links
OWASP Authentication cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
Refresh token rotation (Auth0) | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
:::

=== Design a File Storage Service (S3)
@p 2
@tags lld, s3, files, permissions
@quick
- API: `POST /files/presign` (upload intent) → client PUTs to S3 → `POST /files/:id/complete`; `GET /files/:id/download` (presigned GET); `DELETE /files/:id`; `GET /files?folder=`.
- Layers: **FileController → FileService (validation, permissions, metadata) → S3Service (SDK wrapper) + FileRepository (MongoDB metadata)**.
- Metadata: `{ ownerId, key, name, size, mime, status: pending|ready|deleted, checksum, sharedWith[], createdAt }`.
- **Validation**: type/size before signing + HeadObject after upload; **permissions**: owner / shared / role; soft delete + S3 lifecycle.
- Cleanup: pending uploads never completed → job/lifecycle; virus scan via S3 event → Lambda.

::: diagram
sequenceDiagram
  participant C as Client
  participant FC as FileController
  participant FS as FileService
  participant S3 as S3Service
  participant DB as FileRepository
  C->>FC: POST /files/presign (name, size, mime)
  FC->>FS: createUploadIntent(user, meta)
  FS->>FS: validate type and size, quota
  FS->>DB: insert status pending
  FS->>S3: presignPut(key)
  FC-->>C: fileId + uploadUrl
  C->>S3: PUT bytes
  C->>FC: POST /files/id/complete
  FS->>S3: headObject(key) verify size
  FS->>DB: status ready
:::

::: code javascript FileService (validation, permissions, metadata) + S3Service wrapper
class S3Service {
  constructor(client, bucket) { Object.assign(this, { client, bucket }); }
  presignPut(Key, ContentType, expiresIn = 300) { return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key, ContentType }), { expiresIn }); }
  presignGet(Key, fileName, expiresIn = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key, ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"` }), { expiresIn });
  }
  head(Key) { return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key })); }
  delete(Key) { return this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key })); }
}

const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/csv']);
const MAX_BYTES = 50 * 1024 * 1024;

class FileService {
  constructor({ files, s3 }) { Object.assign(this, { files, s3 }); }

  async createUploadIntent(user, { name, size, mime, folder = 'root' }) {
    if (!ALLOWED.has(mime)) throw new AppError(400, 'File type not allowed');
    if (size > MAX_BYTES) throw new AppError(400, 'File too large');
    const usage = await this.files.totalSize(user.id);
    if (usage + size > user.quotaBytes) throw new AppError(403, 'Storage quota exceeded');
    const key = `users/${user.id}/${crypto.randomUUID()}`;
    const file = await this.files.create({ ownerId: user.id, key, name, size, mime, folder, status: 'pending' });
    return { fileId: file._id, uploadUrl: await this.s3.presignPut(key, mime) };
  }

  async complete(user, fileId) {
    const file = await this.#getAuthorized(user, fileId, 'write');
    const head = await this.s3.head(file.key);                      // really uploaded?
    if (head.ContentLength !== file.size) throw new AppError(400, 'Size mismatch');
    return this.files.update(fileId, { status: 'ready' });
  }

  async downloadUrl(user, fileId) {
    const file = await this.#getAuthorized(user, fileId, 'read');
    return this.s3.presignGet(file.key, file.name);
  }

  async remove(user, fileId) {
    const file = await this.#getAuthorized(user, fileId, 'write');
    await this.files.update(fileId, { status: 'deleted', deletedAt: new Date() }); // soft delete
    await this.s3.delete(file.key);                                               // or lifecycle after 30 days
  }

  async #getAuthorized(user, fileId, mode) {
    const file = await this.files.findById(fileId);
    if (!file || file.status === 'deleted') throw new AppError(404, 'File not found');
    const isOwner = String(file.ownerId) === String(user.id);
    const shared = file.sharedWith?.find((s) => String(s.userId) === String(user.id));
    const allowed = isOwner || user.role === 'admin' || (shared && (mode === 'read' || shared.permission === 'write'));
    if (!allowed) throw new AppError(404, 'File not found'); // hide existence
    return file;
  }
}
:::

::: ask
- *"Max file size? Sharing/permissions model? Versioning? Quotas? Virus scanning? Public links with expiry?"*
:::

::: links
S3 presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
:::

=== Design a Logging System
@p 2
@tags lld, logging, observability
@quick
- `Application → Logger → Transports (Console, File, External service: CloudWatch/Datadog/ELK)`.
- **Log levels**: error > warn > info > http > debug > trace; configurable per env.
- **Structured JSON** logs with a timestamp, level, message, **requestId** (AsyncLocalStorage), userId, service, and duration.
- **Redact sensitive data** (passwords, tokens, cards, PII); don't log request bodies blindly.
- Non-blocking writes / batching; error logging with stack + context; sampling for high-volume debug logs; child loggers.

::: diagram
flowchart LR
  APP["Application code"] --> L["Logger: level filter, redact, enrich with requestId"]
  L --> T1["ConsoleTransport: dev pretty"]
  L --> T2["FileTransport: rotated"]
  L --> T3["HttpTransport: batched → CloudWatch / Datadog"]
  CTX["AsyncLocalStorage: requestId, userId"] -.-> L
:::

::: code javascript Logger with levels, transports, redaction, child loggers (runs in browser)
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|card/i;

function redact(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1)]));
}

class ConsoleTransport { write(entry) { console.log(JSON.stringify(entry)); } }
class MemoryBatchTransport {                       // stands in for an HTTP transport that batches
  constructor(flushSize = 3) { this.buffer = []; this.flushSize = flushSize; this.sentBatches = 0; }
  write(entry) { this.buffer.push(entry); if (this.buffer.length >= this.flushSize) this.flush(); }
  flush() { if (!this.buffer.length) return; this.sentBatches++; console.log(`[batch ${this.sentBatches}] shipped ${this.buffer.length} logs`); this.buffer = []; }
}

class Logger {
  constructor({ level = 'info', transports = [], context = {} } = {}) { Object.assign(this, { level, transports, context }); }
  child(ctx) { return new Logger({ level: this.level, transports: this.transports, context: { ...this.context, ...ctx } }); }
  log(level, message, meta = {}) {
    if (LEVELS[level] > LEVELS[this.level]) return;             // level filter
    const entry = { ts: new Date().toISOString(), level, message, ...this.context, ...redact(meta) };
    if (meta.err instanceof Error) entry.err = { name: meta.err.name, message: meta.err.message, stack: meta.err.stack?.split('\n').slice(0, 3).join(' | ') };
    this.transports.forEach((t) => t.write(entry));
  }
  error(m, meta) { this.log('error', m, meta); } warn(m, meta) { this.log('warn', m, meta); }
  info(m, meta) { this.log('info', m, meta); } debug(m, meta) { this.log('debug', m, meta); }
}

const batch = new MemoryBatchTransport(3);
const logger = new Logger({ level: 'info', transports: [new ConsoleTransport(), batch], context: { service: 'orders-api', env: 'prod' } });
const reqLog = logger.child({ requestId: 'req-7f3a', userId: 'u42' });   // per-request child logger

reqLog.info('Order created', { orderId: 1001, total: 49900 });
reqLog.debug('this is filtered out at info level');
reqLog.warn('Login attempt', { email: 'v@x.com', password: 'hunter2', headers: { authorization: 'Bearer abc' } });
reqLog.error('Payment failed', { err: new Error('Gateway timeout'), orderId: 1001 });
batch.flush();
:::

::: code javascript Production: pino + AsyncLocalStorage request context
const pino = require('pino');
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

const base = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'], censor: '[REDACTED]' },
  mixin: () => als.getStore() || {},               // auto-attach requestId/userId to EVERY log line
});

app.use((req, res, next) => {
  const ctx = { requestId: req.headers['x-request-id'] || crypto.randomUUID() };
  res.setHeader('X-Request-Id', ctx.requestId);
  als.run(ctx, () => next());
});
app.use((req, res, next) => { if (req.user) als.getStore().userId = req.user.id; next(); });

// anywhere deep in services — no need to pass req around:
base.info({ orderId }, 'order placed');
:::

::: ask
- *"Volume of logs? Retention/compliance? Centralised platform? Correlation across microservices (trace ids)?"*
:::

::: links
pino | https://getpino.io
OWASP Logging cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
:::

=== Design an API Client / HTTP Client (Node)
@p 2
@tags lld, http-client, retry, timeout
@quick
- `HttpClient` with `get/post/put/delete`, a base URL, default headers, JSON handling.
- **Timeout** (AbortController), **retry** with exponential backoff + jitter for network errors/5xx/429 (respect `Retry-After`); only retry **idempotent** methods (or with an idempotency key).
- Typed **errors** (`HttpError { status, body }`, `TimeoutError`), interceptors/hooks (auth, logging), **circuit breaker** for failing dependencies.
- Connection reuse (keep-alive agent), request ids, metrics per call.

::: diagram
classDiagram
  class HttpClient {
    -baseUrl
    -timeoutMs
    -retries
    +get(path, opts)
    +post(path, body, opts)
    +put(path, body, opts)
    +delete(path, opts)
    -request(method, path, opts)
    -shouldRetry(err, method, attempt)
  }
  class HttpError {
    +status
    +body
  }
  class TimeoutError
  HttpClient ..> HttpError
  HttpClient ..> TimeoutError
:::

::: code javascript HttpClient with timeout, retries, backoff+jitter, typed errors (runs in browser against a fake fetch)
class HttpError extends Error { constructor(status, body) { super(`HTTP ${status}`); this.status = status; this.body = body; } }
class TimeoutError extends Error { constructor(ms) { super(`Timed out after ${ms}ms`); } }

class HttpClient {
  constructor({ baseUrl = '', timeoutMs = 5000, retries = 3, headers = {}, fetchImpl = fetch, onRequest } = {}) {
    Object.assign(this, { baseUrl, timeoutMs, retries, headers, fetchImpl, onRequest });
  }
  get(p, o) { return this.request('GET', p, o); }
  post(p, body, o) { return this.request('POST', p, { ...o, body }); }
  put(p, body, o) { return this.request('PUT', p, { ...o, body }); }
  delete(p, o) { return this.request('DELETE', p, o); }

  async request(method, path, { body, headers = {}, idempotencyKey } = {}) {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.onRequest?.({ method, path, attempt });
        const response = await this.fetchImpl(this.baseUrl + path, {
          method,
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...this.headers, ...headers, ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new HttpError(response.status, data);
        return data;
      } catch (err) {
        const error = err.name === 'AbortError' ? new TimeoutError(this.timeoutMs) : err;
        if (!this.#shouldRetry(error, method, attempt, idempotencyKey)) throw error;
        const backoff = Math.min(1000 * 2 ** attempt, 10000) * 0.1;    // scaled down for the demo
        const jitter = Math.random() * backoff;                          // avoid thundering herd
        await new Promise((r) => setTimeout(r, backoff + jitter));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  #shouldRetry(err, method, attempt, idempotencyKey) {
    if (attempt >= this.retries) return false;
    const idempotent = ['GET', 'PUT', 'DELETE', 'HEAD'].includes(method) || !!idempotencyKey;
    if (!idempotent) return false;                                     // never blindly retry POST
    if (err instanceof TimeoutError || err instanceof TypeError) return true; // network error
    return err instanceof HttpError && (err.status >= 500 || err.status === 429);
  }
}

// ---- fake server: fails twice with 503, then succeeds ----
let calls = 0;
const fakeFetch = async (url, opts) => {
  calls++;
  if (url.endsWith('/flaky') && calls < 3) return { ok: false, status: 503, json: async () => ({ message: 'unavailable' }) };
  if (url.endsWith('/missing')) return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  return { ok: true, status: 200, json: async () => ({ url, method: opts.method }) };
};

const client = new HttpClient({ baseUrl: 'https://api.partner.com', fetchImpl: fakeFetch, onRequest: (r) => console.log('→', r.method, r.path, 'attempt', r.attempt) });
(async () => {
  console.log('result:', await client.get('/flaky'), calls === 3 ? '✅ retried twice' : '❌ FAIL');
  try { await client.get('/missing'); } catch (e) { console.log('404 not retried:', e.message, e instanceof HttpError ? '✅' : '❌ FAIL'); }
  calls = 0;
  try { await client.post('/flaky', { a: 1 }); } catch (e) { console.log('POST without idempotency key not retried:', e.message, calls === 1 ? '✅' : '❌ FAIL'); }
})();
:::

::: ask
- *"Which failures are retryable? Is the downstream idempotent? Timeouts per call? Do we need a circuit breaker (e.g. opossum) and caching?"*
:::

::: links
AWS: timeouts, retries and backoff with jitter | https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
Circuit breaker (Martin Fowler) | https://martinfowler.com/bliki/CircuitBreaker.html
:::
