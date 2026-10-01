@section Backend LLD
@icon ⚙️
@color #475569
@desc Backend low-level design with COMPLETE runnable Express projects: URL shortener, rate limiter, notifications, job queue, payments, orders, auth, file storage, logging and an HTTP client. Every design: requirements, class + sequence diagrams, every file in full, a run guide with curl examples, a browser simulation with tests, and trade-offs.

=== Design a URL Shortener
@p 2
@tags lld, url-shortener, base62, mongodb
@quick
- API: `POST /api/urls` → short code; `GET /:code` → **302 redirect**; `GET /api/urls/:code/stats` → clicks.
- Short code = **random base62** (7 chars ≈ 3.5 × 10¹² codes) + **retry on collision** (unique index), or a counter encoded in base62.
- Layers: route → controller (HTTP) → service (rules) → repository (storage). Swap memory ↔ MongoDB by changing only the repository.
- Validate URLs (`new URL`, http/https only), custom alias rules, expiry → **410 Gone**.
- Reads ≫ writes: cache code → URL (Redis/CDN); count clicks asynchronously.

::: text 🧒 In simple words
A URL shortener turns a long link like `https://shop.example.com/products/2024/summer-sale?utm=newsletter` into `http://sho.rt/aZ3kQ9x`. When someone opens the short link, the server looks up the code and **redirects** the browser to the long URL. Think of it as a **cloakroom ticket**: you hand over a big coat (the long URL) and get a tiny numbered ticket (the code); later, anyone with the ticket gets the coat back. Bitly and TinyURL are real-world examples; companies also use them for QR codes and tracking clicks.
:::

::: text 📋 Requirements
### Functional
- Create a short URL for a long URL (optionally with a **custom alias** and an **expiry**).
- Redirect `GET /:code` to the long URL with an HTTP redirect.
- Count clicks and show basic stats.
- The same code must never point to two different URLs.

### Non-functional
- Redirects are **fast** (p99 < 50 ms) and highly available: reads are ~100× more frequent than writes.
- Codes are short (7 characters) and hard to guess (not sequential, so people can't enumerate all links).
- Malicious URLs (e.g. `javascript:`) are rejected.

### Assumptions (for this design)
- Single region, ~1,000 new URLs/day and ~100,000 redirects/day to start.
- No user accounts (anyone can create links); links can expire.
- In-memory storage for the runnable version; MongoDB with a unique index in production.
:::

::: ask
- *"How many URLs per day and how many redirects?"* (Read/write ratio drives caching.)
- *"Do we need custom aliases? Expiry? Analytics (per country, per day)?"*
- *"Should the same long URL always return the same code?"*
- *"301 (permanent, cached by browsers) or 302 (temporary, every click hits us so we can count it)?"*
- *"Can links be deleted or edited? Do users own links?"*
:::

::: diagram High-level architecture
flowchart LR
  C["Browser / API client"] --> R["Express routes"]
  R --> CT["UrlController (HTTP in/out)"]
  CT --> S["UrlService (rules: validate, generate code, expiry)"]
  S --> B["base62 / random code generator"]
  S --> REPO["UrlRepository (interface)"]
  REPO --> MEM["MemoryUrlRepository (default)"]
  REPO --> MONGO["MongoUrlRepository (MONGO_URI set)"]
  MONGO --> DB[("MongoDB: urls, unique index on code")]
:::

::: diagram Class diagram
classDiagram
  class UrlController {
    +create(req, res)
    +redirect(req, res)
    +stats(req, res)
  }
  class UrlService {
    -repo
    -baseUrl
    +shorten(input) Url
    +resolve(code) string
    +getStats(code) Url
    -generateUniqueCode() string
  }
  class MemoryUrlRepository {
    -byCode Map
    +insert(url) Url
    +findByCode(code) Url
    +existsByCode(code) boolean
    +incrementClicks(code) void
  }
  class MongoUrlRepository {
    +insert(url) Url
    +findByCode(code) Url
    +existsByCode(code) boolean
    +incrementClicks(code) void
  }
  class Url {
    +code string
    +longUrl string
    +clicks number
    +createdAt Date
    +expiresAt Date
  }
  UrlController --> UrlService
  UrlService --> MemoryUrlRepository
  UrlService --> MongoUrlRepository
  MemoryUrlRepository --> Url
  MongoUrlRepository --> Url
:::

::: diagram Sequence: create a short URL, then open it
sequenceDiagram
  participant U as User
  participant API as Express API
  participant SV as UrlService
  participant DB as Repository
  U->>API: POST /api/urls { url }
  API->>SV: shorten({ url })
  SV->>SV: validate URL, generate random base62 code
  SV->>DB: existsByCode(code)?
  DB-->>SV: false
  SV->>DB: insert({ code, longUrl })
  SV-->>API: { code, shortUrl }
  API-->>U: 201 Created
  U->>API: GET /aZ3kQ9x
  API->>SV: resolve("aZ3kQ9x")
  SV->>DB: findByCode, incrementClicks
  SV-->>API: longUrl
  API-->>U: 302 Location: longUrl
:::

::: image URL Shortener architecture: client, Express layers, code generator and storage
/images/backend-lld/url-shortener.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `routes/url.routes.js` | Maps HTTP paths to controller methods |
| `controllers/url.controller.js` | Reads `req`, calls the service, writes the response/status code. No business rules. |
| `services/url.service.js` | Validation, code generation with collision retry, custom alias rules, expiry, click counting |
| `repositories/*.js` | The **only** place that knows how data is stored (Map or MongoDB) |
| `utils/base62.js` | Random and counter-based base62 codes |
| `middleware/errorHandler.js` | Turns thrown `ApiError`s into consistent JSON responses |

### Data model
`Url { code (unique), longUrl, clicks, createdAt, expiresAt | null }`
MongoDB index: `{ code: 1 }` **unique** (the database guarantees no duplicates even with two servers).

### API contract
| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| POST | `/api/urls` | `{ "url": "https://…", "customAlias"?: "summer", "expiresInDays"?: 7 }` | **201** `{ code, shortUrl, longUrl, expiresAt }` | 400 invalid URL/alias, 409 alias taken |
| GET | `/:code` | – | **302** `Location: longUrl` | 404 unknown, 410 expired |
| GET | `/api/urls/:code/stats` | – | **200** `{ code, longUrl, clicks, createdAt, expiresAt }` | 404 |
| GET | `/health` | – | **200** `{ status: "ok" }` | – |

### Short-code strategy
- **Random base62, 7 chars**: 62⁷ ≈ 3.5 trillion codes; collisions are rare and handled by checking/retrying (and by the unique index).
- **Counter + base62** (alternative): no collisions, but codes are guessable and need a shared counter across servers.
- **Hash (MD5/SHA) of the URL, first 7 chars**: same URL → same code, but collisions must still be handled.
:::

::: text 📁 Folder structure
`url-shortener/`
↳ `package.json`
↳ `src/index.js` (starts the server)
↳ `src/app.js` (builds the Express app)
↳ `src/config.js`
↳ `src/routes/url.routes.js`
↳ `src/controllers/url.controller.js`
↳ `src/services/url.service.js`
↳ `src/repositories/memory.url.repository.js`
↳ `src/repositories/mongo.url.repository.js` (used only when `MONGO_URI` is set)
↳ `src/repositories/index.js` (picks the repository)
↳ `src/models/url.model.js` (Mongoose schema)
↳ `src/validators/url.validator.js`
↳ `src/utils/base62.js`, `src/utils/ApiError.js`, `src/utils/asyncHandler.js`
↳ `src/middleware/errorHandler.js`
:::

::: code json url-shortener/package.json
{
  "name": "url-shortener",
  "version": "1.0.0",
  "private": true,
  "description": "URL shortener LLD: Express + in-memory or MongoDB repository",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "express": "^4.19.2",
    "mongoose": "^8.5.1"
  }
}
:::

::: code javascript url-shortener/src/index.js
// Entry point: create the app and start listening.
// Run: npm install && npm start   (optional: MONGO_URI=mongodb://localhost:27017/shortener npm start)
const { createApp } = require('./app');
const config = require('./config');

async function main() {
  const app = await createApp();
  app.listen(config.port, () => {
    console.log(`URL shortener listening on ${config.baseUrl} (storage: ${config.mongoUri ? 'mongodb' : 'memory'})`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
:::

::: code javascript url-shortener/src/config.js
// All configuration in one place, read from environment variables with safe defaults.
const port = Number(process.env.PORT) || 3001;

module.exports = {
  port,
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`, // used to build shortUrl
  mongoUri: process.env.MONGO_URI || '',                        // empty → in-memory storage
  codeLength: Number(process.env.CODE_LENGTH) || 7,
};
:::

::: code javascript url-shortener/src/app.js
// Builds the Express application (no listen here → easy to test).
const express = require('express');
const { buildUrlRoutes, buildRedirectRoute } = require('./routes/url.routes');
const { UrlController } = require('./controllers/url.controller');
const { UrlService } = require('./services/url.service');
const { createUrlRepository } = require('./repositories');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const config = require('./config');

async function createApp() {
  const repo = await createUrlRepository(config);                 // memory or MongoDB
  const service = new UrlService({ repo, baseUrl: config.baseUrl, codeLength: config.codeLength });
  const controller = new UrlController(service);

  const app = express();
  app.use(express.json({ limit: '10kb' }));                      // parse JSON bodies, reject huge ones
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/urls', buildUrlRoutes(controller));              // API routes first
  app.use('/', buildRedirectRoute(controller));                  // then the catch-all /:code
  app.use(notFound);                                             // unknown routes → 404 JSON
  app.use(errorHandler);                                         // every thrown error → JSON
  return app;
}

module.exports = { createApp };
:::

::: code javascript url-shortener/src/routes/url.routes.js
// Route table: path + HTTP method → controller method.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildUrlRoutes(controller) {
  const router = express.Router();
  router.post('/', asyncHandler((req, res) => controller.create(req, res)));
  router.get('/:code/stats', asyncHandler((req, res) => controller.stats(req, res)));
  return router;
}

function buildRedirectRoute(controller) {
  const router = express.Router();
  // Catch-all short code route (the controller rejects implausible codes like favicon.ico)
  router.get('/:code', asyncHandler((req, res) => controller.redirect(req, res)));
  return router;
}

module.exports = { buildUrlRoutes, buildRedirectRoute };
:::

::: code javascript url-shortener/src/controllers/url.controller.js
// Controller: HTTP in → service call → HTTP out. No business rules here.
const { validateCreateUrl } = require('../validators/url.validator');
const ApiError = require('../utils/ApiError');

const CODE_RE = /^[0-9A-Za-z_-]{3,32}$/; // same characters as random codes and custom aliases

class UrlController {
  constructor(service) {
    this.service = service;
  }

  async create(req, res) {
    const input = validateCreateUrl(req.body);        // throws ApiError(400) on bad input
    const url = await this.service.shorten(input);
    res.status(201).json(url);                         // 201 Created
  }

  async redirect(req, res) {
    const { code } = req.params;
    if (!CODE_RE.test(code)) throw ApiError.notFound('Short URL not found'); // cheap check before the DB
    const longUrl = await this.service.resolve(code);
    res.redirect(302, longUrl);                         // 302 so every click reaches us (counting)
  }

  async stats(req, res) {
    const stats = await this.service.getStats(req.params.code);
    res.json(stats);
  }
}

module.exports = { UrlController };
:::

::: code javascript url-shortener/src/validators/url.validator.js
// Input validation for POST /api/urls. Returns a clean object or throws ApiError(400).
const ApiError = require('../utils/ApiError');

const ALIAS_RE = /^[0-9A-Za-z_-]{3,32}$/;
const RESERVED = new Set(['api', 'health', 'admin', 'login']); // aliases that would clash with routes

function validateCreateUrl(body) {
  if (!body || typeof body.url !== 'string') throw ApiError.badRequest('"url" (string) is required');

  let parsed;
  try {
    parsed = new URL(body.url.trim());                 // throws for invalid URLs
  } catch {
    throw ApiError.badRequest('"url" is not a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw ApiError.badRequest('Only http and https URLs are allowed'); // blocks javascript:, data:, file:
  }

  const out = { url: parsed.toString(), customAlias: null, expiresInDays: null };

  if (body.customAlias !== undefined) {
    if (typeof body.customAlias !== 'string' || !ALIAS_RE.test(body.customAlias)) {
      throw ApiError.badRequest('"customAlias" must be 3-32 chars: letters, digits, _ or -');
    }
    if (RESERVED.has(body.customAlias.toLowerCase())) throw ApiError.badRequest('This alias is reserved');
    out.customAlias = body.customAlias;
  }

  if (body.expiresInDays !== undefined) {
    const days = Number(body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw ApiError.badRequest('"expiresInDays" must be an integer between 1 and 3650');
    }
    out.expiresInDays = days;
  }
  return out;
}

module.exports = { validateCreateUrl };
:::

::: code javascript url-shortener/src/services/url.service.js
// Business rules: code generation, collisions, aliases, expiry and click counting.
const ApiError = require('../utils/ApiError');
const { randomBase62 } = require('../utils/base62');

const MAX_ATTEMPTS = 5;            // collision retries (with 62^7 codes, >1 retry is extremely rare)
const DAY_MS = 24 * 60 * 60 * 1000;

class UrlService {
  constructor({ repo, baseUrl, codeLength = 7, now = () => new Date() }) {
    this.repo = repo;
    this.baseUrl = baseUrl;
    this.codeLength = codeLength;
    this.now = now;                // injectable clock → easy to test expiry
  }

  async shorten({ url, customAlias = null, expiresInDays = null }) {
    let code;
    if (customAlias) {
      if (await this.repo.existsByCode(customAlias)) throw ApiError.conflict('Alias already in use');
      code = customAlias;
    } else {
      code = await this.#generateUniqueCode();
    }
    const createdAt = this.now();
    const expiresAt = expiresInDays ? new Date(createdAt.getTime() + expiresInDays * DAY_MS) : null;
    const saved = await this.repo.insert({ code, longUrl: url, clicks: 0, createdAt, expiresAt });
    return this.#toDto(saved);
  }

  async resolve(code) {
    const url = await this.repo.findByCode(code);
    if (!url) throw ApiError.notFound('Short URL not found');
    if (url.expiresAt && url.expiresAt <= this.now()) throw new ApiError(410, 'Short URL has expired'); // 410 Gone
    await this.repo.incrementClicks(code);   // in production: async (queue) so redirects stay fast
    return url.longUrl;
  }

  async getStats(code) {
    const url = await this.repo.findByCode(code);
    if (!url) throw ApiError.notFound('Short URL not found');
    return { ...this.#toDto(url), clicks: url.clicks };
  }

  async #generateUniqueCode() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = randomBase62(this.codeLength);
      if (!(await this.repo.existsByCode(code))) return code;  // free → use it
    }
    throw new ApiError(503, 'Could not generate a unique code, try again');
  }

  #toDto(url) {
    return {
      code: url.code,
      shortUrl: `${this.baseUrl}/${url.code}`,
      longUrl: url.longUrl,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
    };
  }
}

module.exports = { UrlService };
:::

::: code javascript url-shortener/src/utils/base62.js
// Base62 helpers: digits + lowercase + uppercase = 62 URL-safe characters.
const crypto = require('crypto');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Random code using a cryptographically secure source (hard to guess). */
function randomBase62(length = 7) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 62]; // tiny modulo bias is fine for codes
  return out;
}

/** Encode a non-negative integer (e.g. a counter) in base62. */
function encodeBase62(num) {
  if (num === 0) return ALPHABET[0];
  let out = '';
  while (num > 0) {
    out = ALPHABET[num % 62] + out;
    num = Math.floor(num / 62);
  }
  return out;
}

module.exports = { ALPHABET, randomBase62, encodeBase62 };
:::

::: code javascript url-shortener/src/repositories/index.js
// Chooses the storage implementation. The service never knows which one it got.
async function createUrlRepository(config) {
  if (config.mongoUri) {
    const { MongoUrlRepository } = require('./mongo.url.repository');
    const repo = new MongoUrlRepository();
    await repo.connect(config.mongoUri);
    return repo;
  }
  const { MemoryUrlRepository } = require('./memory.url.repository');
  return new MemoryUrlRepository();
}

module.exports = { createUrlRepository };
:::

::: code javascript url-shortener/src/repositories/memory.url.repository.js
// In-memory storage (a Map). Perfect for learning and tests; data is lost on restart.
class MemoryUrlRepository {
  constructor() {
    this.byCode = new Map(); // code → url document
  }
  async insert(url) {
    if (this.byCode.has(url.code)) {
      const err = new Error('Duplicate code');
      err.code = 11000;                       // same error code MongoDB uses for duplicates
      throw err;
    }
    this.byCode.set(url.code, { ...url });
    return { ...url };
  }
  async findByCode(code) {
    const url = this.byCode.get(code);
    return url ? { ...url } : null;           // return a copy so callers can't mutate storage
  }
  async existsByCode(code) {
    return this.byCode.has(code);
  }
  async incrementClicks(code) {
    const url = this.byCode.get(code);
    if (url) url.clicks += 1;
  }
}

module.exports = { MemoryUrlRepository };
:::

::: code javascript url-shortener/src/models/url.model.js
// Mongoose schema (used only by the MongoDB repository).
const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // unique index = no duplicate codes
    longUrl: { type: String, required: true },
    clicks: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.Url || mongoose.model('Url', urlSchema);
:::

::: code javascript url-shortener/src/repositories/mongo.url.repository.js
// MongoDB storage with the same methods as the memory repository.
const mongoose = require('mongoose');
const UrlModel = require('../models/url.model');

const toPlain = (doc) =>
  doc && { code: doc.code, longUrl: doc.longUrl, clicks: doc.clicks, createdAt: doc.createdAt, expiresAt: doc.expiresAt };

class MongoUrlRepository {
  async connect(uri) {
    await mongoose.connect(uri);
    await UrlModel.syncIndexes();             // make sure the unique index exists
  }
  async insert(url) {
    const doc = await UrlModel.create(url);   // throws error.code 11000 on a duplicate code
    return toPlain(doc);
  }
  async findByCode(code) {
    return toPlain(await UrlModel.findOne({ code }).lean());
  }
  async existsByCode(code) {
    return (await UrlModel.exists({ code })) !== null;
  }
  async incrementClicks(code) {
    await UrlModel.updateOne({ code }, { $inc: { clicks: 1 } }); // atomic, safe with many servers
  }
}

module.exports = { MongoUrlRepository };
:::

::: code javascript url-shortener/src/utils/ApiError.js
// An Error that carries an HTTP status code. Thrown anywhere, rendered by errorHandler.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, message, details); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript url-shortener/src/utils/asyncHandler.js
// Wraps an async route handler so rejected promises reach Express's error handler (Express 4).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript url-shortener/src/middleware/errorHandler.js
// 404 for unknown routes + one place that turns errors into JSON responses.
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && err.code === 11000) err = ApiError.conflict('Duplicate code, please retry'); // Mongo duplicate key
  if (err.type === 'entity.parse.failed') err = ApiError.badRequest('Invalid JSON body');
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err);                 // log unexpected errors with the stack
  res.status(status).json({
    error: { message: status >= 500 ? 'Internal Server Error' : err.message, details: err.details },
  });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: code generation, collisions, expiry and clicks (runnable)
// The service logic with an in-memory repository and a fake random generator, so we can
// force collisions and control time. No Node modules needed.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function encodeBase62(num) { if (num === 0) return '0'; let s = ''; while (num > 0) { s = ALPHABET[num % 62] + s; num = Math.floor(num / 62); } return s; }

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

class MemoryRepo {
  constructor() { this.byCode = new Map(); }
  async insert(u) { this.byCode.set(u.code, { ...u }); return { ...u }; }
  async findByCode(c) { const u = this.byCode.get(c); return u ? { ...u } : null; }
  async existsByCode(c) { return this.byCode.has(c); }
  async incrementClicks(c) { this.byCode.get(c).clicks++; }
}

class UrlService {
  constructor({ repo, nextCode, now }) { this.repo = repo; this.nextCode = nextCode; this.now = now; }
  async shorten({ url, customAlias, expiresInDays }) {
    const parsed = new URL(url);                                    // throws on invalid URLs
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new HttpError(400, 'bad protocol');
    let code = customAlias;
    if (code) { if (await this.repo.existsByCode(code)) throw new HttpError(409, 'alias taken'); }
    else {
      for (let i = 0; i < 5 && !code; i++) { const c = this.nextCode(); if (!(await this.repo.existsByCode(c))) code = c; }
      if (!code) throw new HttpError(503, 'no unique code');
    }
    const createdAt = this.now();
    const expiresAt = expiresInDays ? new Date(createdAt.getTime() + expiresInDays * 864e5) : null;
    return this.repo.insert({ code, longUrl: parsed.toString(), clicks: 0, createdAt, expiresAt });
  }
  async resolve(code) {
    const u = await this.repo.findByCode(code);
    if (!u) throw new HttpError(404, 'not found');
    if (u.expiresAt && u.expiresAt <= this.now()) throw new HttpError(410, 'expired');
    await this.repo.incrementClicks(code);
    return u.longUrl;
  }
}

// ---------- tests ----------
(async () => {
  let clock = new Date('2026-01-01T00:00:00Z');
  const codes = ['abc1234', 'abc1234', 'xyz9876'];                  // 2nd code collides with the 1st
  const service = new UrlService({ repo: new MemoryRepo(), nextCode: () => codes.shift(), now: () => clock });
  const expectError = async (fn, status, label) => {
    try { await fn(); console.log('❌ FAIL', label, 'did not throw'); }
    catch (e) { console.log(label, '→', e.status, e.status === status ? '✅' : '❌ FAIL'); }
  };

  const a = await service.shorten({ url: 'https://example.com/a?x=1' });
  console.log('first code', a.code, a.code === 'abc1234' ? '✅' : '❌ FAIL');
  const b = await service.shorten({ url: 'https://example.com/b' });
  console.log('collision retried → second code', b.code, b.code === 'xyz9876' ? '✅' : '❌ FAIL');
  console.log('redirect target', await service.resolve('abc1234'), (await service.resolve('abc1234')) === 'https://example.com/a?x=1' ? '✅' : '❌ FAIL');
  console.log('clicks counted', (await service.repo.findByCode('abc1234')).clicks === 2 ? '✅' : '❌ FAIL');

  await service.shorten({ url: 'https://example.com/sale', customAlias: 'summer', expiresInDays: 7 });
  await expectError(() => service.shorten({ url: 'https://x.com', customAlias: 'summer' }), 409, 'alias taken');
  await expectError(() => service.shorten({ url: 'javascript:alert(1)' }), 400, 'javascript: URL rejected');
  await expectError(() => service.resolve('nope123'), 404, 'unknown code');
  clock = new Date('2026-01-09T00:00:00Z');                         // 8 days later
  await expectError(() => service.resolve('summer'), 410, 'expired link → 410 Gone');
  console.log('counter-based base62: 125 →', encodeBase62(125), encodeBase62(125) === '21' ? '✅' : '❌ FAIL');
  console.log('62^7 possible codes =', (62 ** 7).toLocaleString(), '✅');
})();
:::

::: text 🧪 How to run & test
1. Create the folder and every file above (same paths), then install and start:
`mkdir url-shortener && cd url-shortener`
`npm install`
`npm start` → prints `URL shortener listening on http://localhost:3001 (storage: memory)`
2. **Create a short URL**
`curl -s -X POST http://localhost:3001/api/urls -H "Content-Type: application/json" -d '{"url":"https://nodejs.org/en/learn"}'`
Expected (code is random): `{"code":"aZ3kQ9x","shortUrl":"http://localhost:3001/aZ3kQ9x","longUrl":"https://nodejs.org/en/learn","createdAt":"…","expiresAt":null}` with status **201**.
3. **Follow it** (`-i` shows headers): `curl -i http://localhost:3001/aZ3kQ9x` → `HTTP/1.1 302 Found` and `Location: https://nodejs.org/en/learn`.
4. **Stats**: `curl -s http://localhost:3001/api/urls/aZ3kQ9x/stats` → `{…,"clicks":1}`.
5. **Custom alias + expiry**: `curl -s -X POST http://localhost:3001/api/urls -H "Content-Type: application/json" -d '{"url":"https://example.com","customAlias":"summer","expiresInDays":7}'` → `"code":"summer"`; repeating it → **409** `{"error":{"message":"Alias already in use"}}`.
6. **Bad input**: `-d '{"url":"javascript:alert(1)"}'` → **400** `Only http and https URLs are allowed`.
7. **With MongoDB** (e.g. the Docker mongo of this app on port 27018): `MONGO_URI=mongodb://localhost:27018/shortener npm start` → `storage: mongodb`; data now survives restarts.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Code generation | **Random base62 + retry**: unguessable, stateless | Counter + base62: no collisions, but guessable and needs a global counter | Random for public links; counter (with an ID service) at huge scale |
| Same URL → same code? | Yes (store hash → code): saves space | No: each request gets a new code (per-campaign stats) | Ask; default "no" |
| Redirect status | **302**: every click hits us (analytics) | 301: browsers cache it, less load, no repeat counting | 302 when analytics matter |
| Click counting | Synchronous `$inc` | **Async** via a queue / batched counters | Async at scale so redirects stay fast |
| Storage | **MongoDB** (unique index, flexible) | Key-value store (DynamoDB/Redis) | Any store with a unique key and fast get by key |
| Expiry | Check on read (**410**) | TTL index deletes documents | Both: check on read + TTL cleanup |
:::

::: text 📈 Scaling & edge cases
- **10× load**: add a **cache** (Redis or in-process LRU) for code → longUrl; redirects become memory lookups. Put a CDN in front for the hottest links.
- **100× load**: run many stateless API servers behind a load balancer; shard the URL collection by code; count clicks through a queue (Kafka/SQS) and aggregate in batches.
- **Collisions across servers**: the database **unique index** is the final guard; on a duplicate-key error, retry with a new code.
- **Security**: only http/https; optionally check URLs against a malware list (Google Safe Browsing); rate-limit creation per IP; never redirect to your own `/api` paths.
- **Edge cases**: very long URLs (limit body size), Unicode/IDN domains (`new URL` normalises them), trailing slashes, expired aliases being re-used.
:::

::: warning ⚠️ Common mistakes
- Using sequential IDs as codes → anyone can enumerate every link.
- Checking "code exists?" without a **unique index**: two servers can still insert the same code at the same time.
- Redirecting to `javascript:` or `data:` URLs (XSS / phishing).
- Counting clicks synchronously in the hot path at high traffic.
- Putting business rules in the controller (hard to test and reuse).
:::

::: understand
- The **layered design** (route → controller → service → repository) is the point of the exercise: the service is testable without HTTP, and the storage can change (memory → MongoDB) without touching business rules.
- Short codes are a **key-value lookup** problem; the design is mostly about generating unique keys and making reads fast.
:::

::: important ⭐ How to present this design in 5 minutes
> "First I'd clarify scale and features: custom aliases, expiry, analytics, 301 vs 302. The API is POST /api/urls to create, GET /:code to redirect, and a stats endpoint. Codes are 7 random base62 characters, about 3.5 trillion possibilities, so they're unguessable; I check for a collision and retry, and a unique index in MongoDB guarantees correctness across servers. The code is layered: controller for HTTP, service for rules like URL validation, alias conflicts and expiry returning 410, and a repository that I can swap between memory and MongoDB. Reads dominate, so at scale I'd cache code-to-URL in Redis, count clicks asynchronously, and keep API servers stateless behind a load balancer."
:::

::: links
MDN: URL API | https://developer.mozilla.org/en-US/docs/Web/API/URL
MDN: HTTP redirections (301 vs 302) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
MongoDB: unique indexes | https://www.mongodb.com/docs/manual/core/index-unique/
Express: routing guide | https://expressjs.com/en/guide/routing.html
:::

=== Design a Rate Limiter
@p 3
@tags lld, rate-limiter, redis, token-bucket
@quick
- Limit how many requests a **client** (API key / user / IP) can make: e.g. 5 requests per 10 s → extra requests get **429 Too Many Requests** + `Retry-After`.
- Algorithms: **fixed window** (simple, bursty at edges), **sliding window log** (exact, more memory), **token bucket** (allows short bursts, smooth average).
- Strategy pattern: one `RateLimiter` interface, pluggable algorithms; a **store** (memory or **Redis**) so all servers share counters.
- Redis fixed window: `INCR key` + `EXPIRE` on the first hit (atomic per key). Fail **open** or **closed** if Redis is down: decide.

::: text 🧒 In simple words
A rate limiter is the **bouncer at a club door** who lets in at most N people per minute. It protects your API from abuse (bots, brute-force logins, a buggy client in an infinite loop) and keeps things fair between customers. GitHub, Stripe and every public API use one: when you exceed the limit you get HTTP **429** and a `Retry-After` header telling you when to try again.
:::

::: text 📋 Requirements
### Functional
- Limit requests per client key (API key header, or IP if missing).
- Configurable rules per route, e.g. `POST /login`: 5 per minute; general API: 100 per minute.
- Respond **429** with `Retry-After` and `RateLimit-*` headers when the limit is exceeded.
- Pluggable algorithms: fixed window, sliding window log, token bucket.

### Non-functional
- Adds < 1 ms per request (in-memory) / one Redis round trip (distributed).
- Works across many API servers (shared store).
- No memory leak: old keys expire.

### Assumptions
- Node.js + Express; in-memory store for the runnable version, Redis store when `REDIS_URL` is set.
- Time-based rules (requests per window), not concurrency limits.
:::

::: ask
- *"Limit per what: user, API key, IP, endpoint?"*
- *"Hard limit or allow short bursts?"* (Bursts → token bucket.)
- *"One server or many?"* (Many → shared store like Redis.)
- *"If the limiter's store is down, should we let traffic through (fail open) or block it (fail closed)?"*
- *"Do we need different tiers (free vs paid plans)?"*
:::

::: diagram High-level architecture
flowchart LR
  C["Client"] --> MW["rateLimit middleware"]
  MW --> K["keyGenerator: API key or IP"]
  MW --> L["RateLimiter (strategy)"]
  L --> FW["FixedWindowLimiter"]
  L --> SW["SlidingLogLimiter"]
  L --> TB["TokenBucketLimiter"]
  FW --> ST["Store"]
  SW --> ST
  TB --> ST
  ST --> M["MemoryStore (default)"]
  ST --> RD[("Redis (REDIS_URL set)")]
  MW -->|"allowed"| H["route handler"]
  MW -->|"blocked"| X["429 + Retry-After"]
:::

::: diagram Class diagram
classDiagram
  class RateLimiter {
    <<interface>>
    +consume(key) Decision
  }
  class FixedWindowLimiter {
    -limit
    -windowMs
    -store
    +consume(key) Decision
  }
  class SlidingLogLimiter {
    -limit
    -windowMs
    -logs Map
    +consume(key) Decision
  }
  class TokenBucketLimiter {
    -capacity
    -refillPerSec
    -buckets Map
    +consume(key) Decision
  }
  class MemoryStore {
    +increment(key, windowMs) Counter
  }
  class RedisStore {
    +increment(key, windowMs) Counter
  }
  class Decision {
    +allowed boolean
    +remaining number
    +retryAfterMs number
    +limit number
  }
  RateLimiter <|.. FixedWindowLimiter
  RateLimiter <|.. SlidingLogLimiter
  RateLimiter <|.. TokenBucketLimiter
  FixedWindowLimiter --> MemoryStore
  FixedWindowLimiter --> RedisStore
:::

::: diagram Sequence: a request over the limit
sequenceDiagram
  participant C as Client
  participant MW as rateLimit middleware
  participant L as Limiter
  participant S as Store
  C->>MW: GET /api/data (x-api-key: k1)
  MW->>L: consume("k1:/api/data")
  L->>S: increment(key, windowMs)
  S-->>L: count = 6, resetAt
  L-->>MW: allowed false, retryAfterMs 4200
  MW-->>C: 429 Too Many Requests, Retry-After: 5
:::

::: image Rate limiter: middleware, three algorithms and a shared store
/images/backend-lld/rate-limiter.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `middleware/rateLimit.js` | Builds the key, asks the limiter, sets headers, returns 429 or calls `next()` |
| `limiters/fixedWindow.js` | Counts requests in the current window using a **store** (memory or Redis) |
| `limiters/slidingLog.js` | Keeps timestamps per key; exact, more memory |
| `limiters/tokenBucket.js` | Refills tokens over time; allows bursts up to capacity |
| `stores/memoryStore.js` / `stores/redisStore.js` | `increment(key, windowMs)` → `{ count, resetAt }`, with expiry |

### The Decision object
`{ allowed, limit, remaining, retryAfterMs }`: every algorithm returns the same shape, so the middleware doesn't care which algorithm runs (**strategy pattern**).

### API contract (demo app)
| Method | Path | Limit | 200 response | 429 response |
|---|---|---|---|---|
| GET | `/api/data` | 5 per 10 s per key (fixed window) | `{ data, remaining }` | `{ error, retryAfterSeconds }` + `Retry-After` |
| POST | `/api/login` | 3 per 60 s per IP (sliding log) | `{ ok: true }` | 429 |
| GET | `/api/burst` | bucket of 5 tokens, +1 per second (token bucket) | `{ ok: true }` | 429 |

Headers on every limited response: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds).
:::

::: text 📁 Folder structure
`rate-limiter/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/middleware/rateLimit.js`
↳ `src/limiters/fixedWindow.js`, `src/limiters/slidingLog.js`, `src/limiters/tokenBucket.js`
↳ `src/stores/memoryStore.js`, `src/stores/redisStore.js`, `src/stores/index.js`
↳ `src/routes/demo.routes.js`
:::

::: code json rate-limiter/package.json
{
  "name": "rate-limiter",
  "version": "1.0.0",
  "private": true,
  "description": "Rate limiter LLD: fixed window, sliding log and token bucket as Express middleware",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "express": "^4.19.2",
    "ioredis": "^5.4.1"
  }
}
:::

::: code javascript rate-limiter/src/index.js
// Entry point. Run: npm install && npm start   (optional shared store: REDIS_URL=redis://localhost:6379 npm start)
const { createApp } = require('./app');
const config = require('./config');

createApp()
  .then((app) => app.listen(config.port, () => console.log(`Rate limiter demo on http://localhost:${config.port} (store: ${config.redisUrl ? 'redis' : 'memory'})`)))
  .catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript rate-limiter/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 3002,
  redisUrl: process.env.REDIS_URL || '',   // empty → in-memory store (single server only)
  trustProxy: process.env.TRUST_PROXY === '1', // set when running behind a load balancer (real client IP)
};
:::

::: code javascript rate-limiter/src/app.js
const express = require('express');
const config = require('./config');
const { createStore } = require('./stores');
const { buildDemoRoutes } = require('./routes/demo.routes');

async function createApp() {
  const store = await createStore(config);
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1); // so req.ip is the client, not the load balancer
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', buildDemoRoutes(store));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  return app;
}

module.exports = { createApp };
:::

::: code javascript rate-limiter/src/routes/demo.routes.js
// Three routes, each protected by a different algorithm.
const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { FixedWindowLimiter } = require('../limiters/fixedWindow');
const { SlidingLogLimiter } = require('../limiters/slidingLog');
const { TokenBucketLimiter } = require('../limiters/tokenBucket');

function buildDemoRoutes(store) {
  const router = express.Router();

  const apiLimiter = new FixedWindowLimiter({ limit: 5, windowMs: 10_000, store });
  router.get('/data', rateLimit({ limiter: apiLimiter }), (req, res) => {
    res.json({ data: 'here is your data', remaining: res.getHeader('RateLimit-Remaining') });
  });

  const loginLimiter = new SlidingLogLimiter({ limit: 3, windowMs: 60_000 });
  router.post('/login', rateLimit({ limiter: loginLimiter, keyGenerator: (req) => `login:${req.ip}` }), (req, res) => {
    res.json({ ok: true, message: 'pretend we checked the password' });
  });

  const burstLimiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
  router.get('/burst', rateLimit({ limiter: burstLimiter }), (req, res) => res.json({ ok: true }));

  return router;
}

module.exports = { buildDemoRoutes };
:::

::: code javascript rate-limiter/src/middleware/rateLimit.js
// Express middleware: works with ANY limiter that has consume(key) → Decision.
function defaultKey(req) {
  const apiKey = req.get('x-api-key');
  return `${apiKey ? `key:${apiKey}` : `ip:${req.ip}`}:${req.baseUrl}${req.path}`; // per client AND per route
}

function rateLimit({ limiter, keyGenerator = defaultKey, failOpen = true }) {
  return async function rateLimitMiddleware(req, res, next) {
    let decision;
    try {
      decision = await limiter.consume(keyGenerator(req));
    } catch (err) {
      console.error('rate limiter store error:', err.message);
      if (failOpen) return next();                       // store down → let traffic through (availability)
      return res.status(503).json({ error: 'Rate limiter unavailable' });
    }
    res.setHeader('RateLimit-Limit', decision.limit);
    res.setHeader('RateLimit-Remaining', Math.max(0, decision.remaining));
    res.setHeader('RateLimit-Reset', Math.ceil(decision.retryAfterMs / 1000));
    if (decision.allowed) return next();

    const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    res.setHeader('Retry-After', retryAfterSeconds);    // standard header clients can obey
    return res.status(429).json({ error: 'Too Many Requests', retryAfterSeconds });
  };
}

module.exports = { rateLimit };
:::

::: code javascript rate-limiter/src/limiters/fixedWindow.js
// Fixed window: count requests per key per window (e.g. per 10-second block).
class FixedWindowLimiter {
  constructor({ limit, windowMs, store }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.store = store;            // memory or Redis: both expose increment(key, windowMs)
  }

  async consume(key) {
    const { count, resetAt } = await this.store.increment(`fw:${key}`, this.windowMs);
    const now = Date.now();
    return {
      allowed: count <= this.limit,
      limit: this.limit,
      remaining: this.limit - count,
      retryAfterMs: Math.max(0, resetAt - now), // when the window resets
    };
  }
}

module.exports = { FixedWindowLimiter };
:::

::: code javascript rate-limiter/src/limiters/slidingLog.js
// Sliding window log: remember the timestamp of each request; count those inside the last windowMs.
// Exact (no edge bursts) but stores up to `limit` timestamps per key. In-memory only in this demo.
class SlidingLogLimiter {
  constructor({ limit, windowMs, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.logs = new Map();         // key → array of timestamps (oldest first)
  }

  async consume(key) {
    const now = this.now();
    const log = this.logs.get(key) || [];
    while (log.length && log[0] <= now - this.windowMs) log.shift(); // drop timestamps outside the window
    let allowed = false;
    if (log.length < this.limit) {
      log.push(now);
      allowed = true;
    }
    this.logs.set(key, log);
    const retryAfterMs = allowed ? 0 : log[0] + this.windowMs - now; // when the oldest one leaves the window
    return { allowed, limit: this.limit, remaining: this.limit - log.length, retryAfterMs };
  }
}

module.exports = { SlidingLogLimiter };
:::

::: code javascript rate-limiter/src/limiters/tokenBucket.js
// Token bucket: each key has a bucket of `capacity` tokens that refills at `refillPerSec`.
// Each request takes 1 token. Allows short bursts up to capacity, average rate = refillPerSec.
class TokenBucketLimiter {
  constructor({ capacity, refillPerSec, now = () => Date.now() }) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.now = now;
    this.buckets = new Map();      // key → { tokens, lastRefill }
  }

  async consume(key) {
    const now = this.now();
    const bucket = this.buckets.get(key) || { tokens: this.capacity, lastRefill: now };
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec); // refill lazily
    bucket.lastRefill = now;

    let allowed = false;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      allowed = true;
    }
    this.buckets.set(key, bucket);
    const retryAfterMs = allowed ? 0 : Math.ceil(((1 - bucket.tokens) / this.refillPerSec) * 1000);
    return { allowed, limit: this.capacity, remaining: Math.floor(bucket.tokens), retryAfterMs };
  }
}

module.exports = { TokenBucketLimiter };
:::

::: code javascript rate-limiter/src/stores/index.js
// Picks the counter store for fixed-window limiting.
async function createStore(config) {
  if (config.redisUrl) {
    const { RedisStore } = require('./redisStore');
    const store = new RedisStore(config.redisUrl);
    await store.ping();                    // fail fast at startup if Redis is unreachable
    return store;
  }
  const { MemoryStore } = require('./memoryStore');
  return new MemoryStore();
}

module.exports = { createStore };
:::

::: code javascript rate-limiter/src/stores/memoryStore.js
// Window counters in a Map. Only correct for ONE server process.
class MemoryStore {
  constructor() {
    this.counters = new Map();              // key → { count, resetAt }
    // Clean up expired keys every minute so memory doesn't grow forever
    this.cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.counters) if (value.resetAt <= now) this.counters.delete(key);
    }, 60_000);
    this.cleanup.unref();                   // don't keep the process alive just for this timer
  }

  async increment(key, windowMs) {
    const now = Date.now();
    let entry = this.counters.get(key);
    if (!entry || entry.resetAt <= now) {   // first request or window over → new window
      entry = { count: 0, resetAt: now + windowMs };
      this.counters.set(key, entry);
    }
    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }
}

module.exports = { MemoryStore };
:::

::: code javascript rate-limiter/src/stores/redisStore.js
// Window counters in Redis, shared by every API server.
// INCR is atomic; PEXPIRE is set only when the key is new (count === 1) via a MULTI transaction.
const Redis = require('ioredis');

class RedisStore {
  constructor(url) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  }

  async ping() {
    await this.redis.ping();
  }

  async increment(key, windowMs) {
    // Lua script = atomic on the Redis server: no race between INCR and PEXPIRE
    const script = `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      local ttl = redis.call('PTTL', KEYS[1])
      return { count, ttl }
    `;
    const [count, ttlMs] = await this.redis.eval(script, 1, `rl:${key}`, windowMs);
    return { count: Number(count), resetAt: Date.now() + Math.max(0, Number(ttlMs)) };
  }
}

module.exports = { RedisStore };
:::

::: code javascript Browser simulation: the three algorithms with a fake clock (runnable)
// Same algorithms as the files above, with an injectable clock so we can test time precisely.
let now = 0;
const clock = () => now;

// Clock-aligned windows (0-999, 1000-1999 …): the textbook version. The server code starts a key's window
// at its first request instead; both share the same weakness: bursts at the window edge.
class FixedWindow {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.c = new Map(); }
  consume(key) {
    const start = Math.floor(now / this.windowMs) * this.windowMs;
    let e = this.c.get(key);
    if (!e || e.start !== start) { e = { count: 0, start, resetAt: start + this.windowMs }; this.c.set(key, e); }
    e.count++;
    return { allowed: e.count <= this.limit, retryAfterMs: e.resetAt - now };
  }
}
class SlidingLog {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.logs = new Map(); }
  consume(key) {
    const log = this.logs.get(key) || [];
    while (log.length && log[0] <= now - this.windowMs) log.shift();
    const allowed = log.length < this.limit;
    if (allowed) log.push(now);
    this.logs.set(key, log);
    return { allowed, retryAfterMs: allowed ? 0 : log[0] + this.windowMs - now };
  }
}
class TokenBucket {
  constructor(capacity, refillPerSec) { this.capacity = capacity; this.rate = refillPerSec; this.b = new Map(); }
  consume(key) {
    const b = this.b.get(key) || { tokens: this.capacity, last: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.last) / 1000) * this.rate);
    b.last = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.b.set(key, b);
    return { allowed, retryAfterMs: allowed ? 0 : Math.ceil(((1 - b.tokens) / this.rate) * 1000) };
  }
}
const run = (limiter, times) => times.map((t) => { now = t; return limiter.consume('k').allowed ? 'Y' : 'n'; }).join('');

// ---------- tests ----------
// Fixed window 3 per 1000 ms: 4th request in the same window is blocked; a new window resets.
console.log('fixed window   ', run(new FixedWindow(3, 1000), [0, 100, 200, 300, 1000, 1100]), run(new FixedWindow(3, 1000), [0, 100, 200, 300, 1000, 1100]) === 'YYYnYY' ? '✅' : '❌ FAIL');
// The fixed-window EDGE problem: 3 at the end of window 1 + 3 at the start of window 2 = 6 in 200 ms
console.log('edge burst     ', run(new FixedWindow(3, 1000), [900, 950, 999, 1000, 1050, 1100]), run(new FixedWindow(3, 1000), [900, 950, 999, 1000, 1050, 1100]) === 'YYYYYY' ? '✅ (6 allowed in 200 ms: the known weakness)' : '❌ FAIL');
// Sliding log fixes it: only 3 in ANY 1000 ms period
console.log('sliding log    ', run(new SlidingLog(3, 1000), [900, 950, 999, 1000, 1050, 1100]), run(new SlidingLog(3, 1000), [900, 950, 999, 1000, 1050, 1100]) === 'YYYnnn' ? '✅' : '❌ FAIL');
// Token bucket: burst of 3, then 1 token per second
console.log('token bucket   ', run(new TokenBucket(3, 1), [0, 0, 0, 0, 1000, 1500, 2000]), run(new TokenBucket(3, 1), [0, 0, 0, 0, 1000, 1500, 2000]) === 'YYYnYnY' ? '✅' : '❌ FAIL');
now = 0; const tb = new TokenBucket(1, 2); tb.consume('k'); const d = tb.consume('k');
console.log('retry-after when empty (2 tokens/s) →', d.retryAfterMs, 'ms', d.retryAfterMs === 500 ? '✅' : '❌ FAIL');
now = 0; const fw = new FixedWindow(1, 10000); fw.consume('a'); const other = fw.consume('b');
console.log('keys are independent →', other.allowed ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then:
`cd rate-limiter && npm install && npm start` → `Rate limiter demo on http://localhost:3002 (store: memory)`
2. **Fixed window (5 per 10 s)**: send 7 requests quickly:
`for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w "%{http_code} " -H "x-api-key: k1" http://localhost:3002/api/data; done; echo`
Expected: `200 200 200 200 200 429 429`
3. **Headers**: `curl -i -H "x-api-key: k1" http://localhost:3002/api/data` (while blocked) → `HTTP/1.1 429 Too Many Requests`, `RateLimit-Limit: 5`, `RateLimit-Remaining: 0`, `Retry-After: 10` (seconds until the window resets, counting down), body `{"error":"Too Many Requests","retryAfterSeconds":10}`.
4. **Another key is independent**: `curl -s -H "x-api-key: k2" http://localhost:3002/api/data` → `{"data":"here is your data","remaining":4}`.
5. **Login (3 per minute per IP, sliding log)**: `for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3002/api/login; done` → `200 200 200 429`.
6. **Token bucket**: `for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3002/api/burst; done` → five 200s then 429s; wait a second and one more request succeeds.
7. **Shared counters across servers (Redis)**: `docker run -d -p 6379:6379 redis:7` then run two servers: `REDIS_URL=redis://localhost:6379 PORT=3002 npm start` and `REDIS_URL=redis://localhost:6379 PORT=3003 npm start`; requests to both ports share the same 5-per-10 s budget.
:::

::: text ⚖️ Trade-offs & alternatives
| Algorithm | Memory per key | Accuracy | Bursts | Pros | Cons |
|---|---|---|---|---|---|
| **Fixed window** | 1 counter | Approximate | Up to 2× limit at window edges | Simplest, 1 Redis `INCR` | Edge bursts |
| **Sliding window log** | Up to `limit` timestamps | Exact | None | Precise | Memory grows with the limit |
| Sliding window counter | 2 counters | Very close | Small | Accurate + cheap (weighted previous window) | Slightly more math |
| **Token bucket** | 2 numbers | Good | Allowed up to capacity | Smooth average, friendly to bursty clients | Two parameters to tune |
| Leaky bucket (queue) | Queue | Good | Smoothed (queued) | Constant output rate | Adds latency |

| Store | Pros | Cons |
|---|---|---|
| In-memory | Fastest, no dependency | Each server counts separately; lost on restart |
| **Redis** | Shared by all servers, atomic ops, TTL | Extra network hop; must decide fail-open/closed |
| API gateway (Nginx, Kong, AWS API Gateway) | No app code | Less flexible per-user logic |
:::

::: text 📈 Scaling & edge cases
- **Many servers**: in-memory counters let each server allow the full limit (N servers → N× limit). Use Redis (or a gateway) so the count is shared.
- **Hot keys**: one huge customer hammers one Redis key; shard by key or use local pre-aggregation with periodic sync.
- **Clock skew**: let Redis own the time (TTL) instead of trusting each server's clock.
- **Behind a load balancer**: `req.ip` is the balancer's IP unless `trust proxy` is set; never trust `X-Forwarded-For` from the open internet without a known proxy.
- **Failure mode**: fail open for normal APIs (availability), fail closed for sensitive ones (login, payments).
- **Fairness**: different limits per plan; separate limits for expensive endpoints.
:::

::: warning ⚠️ Common mistakes
- Using in-memory counters with multiple servers and thinking the limit holds globally.
- `INCR` then `EXPIRE` as two separate commands without atomicity: a crash between them leaves a key that never expires.
- Rate limiting by IP only: users behind one office NAT share a limit; attackers rotate IPs. Prefer user/API key when available.
- Forgetting `Retry-After`, so clients retry immediately in a tight loop.
- Growing maps forever (no cleanup of old keys).
:::

::: understand
- All algorithms answer the same question, "is this request within budget?", with different accuracy/memory trade-offs. Coding them behind one interface (strategy pattern) lets you swap them per route.
- Rate limiting is also a **security** control (brute force, credential stuffing) and a **cost** control (expensive endpoints, LLM calls).
:::

::: important ⭐ How to present this design in 5 minutes
> "I'd clarify the key (user, API key or IP), the limits, whether bursts are OK, and how many servers. The limiter is Express middleware: it builds a key, calls limiter.consume, sets RateLimit headers, and returns 429 with Retry-After when the budget is used up. Algorithms sit behind one interface: fixed window is a single counter but allows double bursts at window edges; a sliding log is exact but stores timestamps; a token bucket allows short bursts with a smooth average, which is what I'd pick for APIs. With several servers the counters must live in Redis, using an atomic INCR plus expiry in a Lua script, and I'd decide fail-open for normal endpoints and fail-closed for login."
:::

::: links
MDN: 429 Too Many Requests | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429
IETF draft: RateLimit header fields | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
Redis: INCR rate limiter pattern | https://redis.io/docs/latest/commands/incr/
Stripe: rate limiters explained | https://stripe.com/blog/rate-limiters
:::

=== Design a Notification System (email, SMS, push)
@p 3
@tags lld, notifications, queue, strategy-pattern
@quick
- Flow: **event** → `NotificationService` (preferences + templates) → **one job per channel** on a **queue** → worker → channel provider (email/SMS/push).
- Return **202 Accepted** immediately; deliver asynchronously so a slow SMS provider never slows the API.
- **Retry with exponential backoff** (+ jitter); after `maxAttempts` → **dead-letter queue** for inspection/replay.
- **Strategy pattern** for channels (same `send()` interface), **templates** per event × channel, **user preferences** (opt-out, quiet hours).
- Idempotency: a `dedupeKey` per event so retries/replays don't send twice.

::: text 🧒 In simple words
When something happens in your app ("order shipped", "password changed"), users should hear about it on the right channels: an email, an SMS, a phone push notification. A notification system is the app's **post office**: you drop off a message once, and it figures out **who wants it on which channel**, writes it in the right format, and keeps trying if the delivery service (SendGrid, Twilio, Firebase) is temporarily down. Amazon, Uber and banks all have one.
:::

::: text 📋 Requirements
### Functional
- Accept an event (`ORDER_SHIPPED`, `PASSWORD_CHANGED`…) for a user and send it on the user's enabled channels.
- Users can enable/disable each channel (preferences).
- Templates per event and channel (an SMS is shorter than an email).
- Track the status of every delivery: `queued → sent` or `failed → retrying → dead`.
- Retry failed deliveries; keep permanently failed ones in a dead-letter list.

### Non-functional
- The API responds fast (< 50 ms): sending happens in the background.
- At-least-once delivery, with de-duplication so users don't get the same message twice.
- One failing channel (e.g. SMS) must not block the others.

### Assumptions
- Single Node process, in-memory queue and storage for the runnable version (BullMQ/SQS + a database in production).
- Providers are fakes that log to the console; the SMS fake can be told to fail sometimes to show retries.
:::

::: ask
- *"Which channels, and which events?"*
- *"Can users opt out per channel/per event? Quiet hours?"*
- *"Is it OK to send a message twice (at-least-once) or must it be exactly once?"*
- *"How many notifications per second at peak?"* (Queue size, provider rate limits.)
- *"Do we need scheduling (send at 9 am local time) or digests (one daily email)?"*
:::

::: diagram High-level architecture
flowchart LR
  P["Producer: order service, auth service"] --> API["POST /api/notifications"]
  API --> NS["NotificationService"]
  NS --> PR["PreferenceRepository"]
  NS --> TS["TemplateService"]
  NS --> Q["Queue: one job per channel"]
  Q --> W["DeliveryWorker (retry + backoff)"]
  W --> CH{"channel?"}
  CH -->|"email"| E["EmailChannel (SendGrid/SES)"]
  CH -->|"sms"| S["SmsChannel (Twilio)"]
  CH -->|"push"| PU["PushChannel (FCM/APNs)"]
  W -->|"maxAttempts reached"| DLQ["Dead-letter queue"]
  W --> NR["NotificationRepository (status)"]
:::

::: diagram Class diagram
classDiagram
  class NotificationService {
    +notify(event) Notification
    +getStatus(id) Notification
  }
  class TemplateService {
    +render(event, channel, data) Message
  }
  class InMemoryQueue {
    +add(job, delayMs) void
    +process(handler) void
    +deadLetters() Job[]
  }
  class DeliveryWorker {
    +handle(job) void
    -backoff(attempt) number
  }
  class Channel {
    <<interface>>
    +send(user, message) Promise
  }
  class EmailChannel
  class SmsChannel
  class PushChannel
  NotificationService --> TemplateService
  NotificationService --> InMemoryQueue
  DeliveryWorker --> Channel
  Channel <|.. EmailChannel
  Channel <|.. SmsChannel
  Channel <|.. PushChannel
:::

::: diagram Sequence: an event with a flaky SMS provider
sequenceDiagram
  participant O as Order service
  participant API as Notification API
  participant Q as Queue
  participant W as Worker
  participant SMS as SMS provider
  O->>API: POST /api/notifications (ORDER_SHIPPED, user 1)
  API->>Q: add email job + sms job
  API-->>O: 202 Accepted (id, status queued)
  Q->>W: sms job (attempt 1)
  W->>SMS: send
  SMS-->>W: error 503
  W->>Q: re-add with delay 200 ms (attempt 2)
  Q->>W: sms job (attempt 2)
  W->>SMS: send
  SMS-->>W: ok
  W->>W: mark sms delivery as sent
:::

::: image Notification system: event, service, queue, worker, channel strategies and a dead-letter queue
/images/backend-lld/notification-system.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `NotificationService` | Validate the event, load preferences, render a message per channel, create the notification record, enqueue one job per channel |
| `TemplateService` | `{{placeholders}}` per event × channel; missing template → clear error |
| `InMemoryQueue` | FIFO jobs with optional delay, concurrency, and a dead-letter list |
| `DeliveryWorker` | Calls the channel, updates delivery status, retries with exponential backoff, moves to DLQ after `maxAttempts` |
| `channels/*` | One class per provider with the same `send(user, message)` method (**strategy pattern**) |
| Repositories | Users, preferences, notifications (statuses) |

### Data model
`Notification { id, userId, event, dedupeKey, createdAt, deliveries: [{ channel, status, attempts, lastError, sentAt }] }`
`Preference { userId, email: bool, sms: bool, push: bool }`

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/notifications` | `{ userId, event, data, dedupeKey? }` | **202** `{ id, deliveries: [{ channel, status: "queued" }] }`; **200** with the existing notification if `dedupeKey` was seen; 400/404 |
| GET | `/api/notifications/:id` | – | **200** notification with per-channel status |
| PUT | `/api/users/:userId/preferences` | `{ email?, sms?, push? }` | **200** preferences |
| GET | `/api/dead-letters` | – | **200** failed jobs |
:::

::: text 📁 Folder structure
`notification-system/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/notification.routes.js`
↳ `src/controllers/notification.controller.js`
↳ `src/services/notification.service.js`, `src/services/template.service.js`
↳ `src/queue/inMemoryQueue.js`
↳ `src/workers/delivery.worker.js`
↳ `src/channels/index.js`, `src/channels/email.channel.js`, `src/channels/sms.channel.js`, `src/channels/push.channel.js`
↳ `src/repositories/user.repository.js`, `src/repositories/preference.repository.js`, `src/repositories/notification.repository.js`
↳ `src/utils/ApiError.js`, `src/utils/asyncHandler.js`, `src/middleware/errorHandler.js`
:::

::: code json notification-system/package.json
{
  "name": "notification-system",
  "version": "1.0.0",
  "private": true,
  "description": "Notification system LLD: preferences, templates, queue, retries, dead-letter queue",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": { "express": "^4.19.2" }
}
:::

::: code javascript notification-system/src/index.js
// Run: npm install && npm start      (make the fake SMS provider flaky: SMS_FAIL_RATE=0.7 npm start)
const { createApp } = require('./app');
const config = require('./config');

const { app } = createApp();
app.listen(config.port, () => console.log(`Notification service on http://localhost:${config.port}`));
:::

::: code javascript notification-system/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 3003,
  maxAttempts: Number(process.env.MAX_ATTEMPTS) || 4,     // 1 try + 3 retries
  baseBackoffMs: Number(process.env.BACKOFF_MS) || 200,    // 200, 400, 800 ms… (+ jitter)
  workerConcurrency: Number(process.env.CONCURRENCY) || 5,
  smsFailRate: Number(process.env.SMS_FAIL_RATE) || 0,     // 0..1, simulates a flaky provider
};
:::

::: code javascript notification-system/src/app.js
// Wires everything together (manual dependency injection).
const express = require('express');
const config = require('./config');
const { UserRepository } = require('./repositories/user.repository');
const { PreferenceRepository } = require('./repositories/preference.repository');
const { NotificationRepository } = require('./repositories/notification.repository');
const { TemplateService } = require('./services/template.service');
const { NotificationService } = require('./services/notification.service');
const { InMemoryQueue } = require('./queue/inMemoryQueue');
const { createChannels } = require('./channels');
const { DeliveryWorker } = require('./workers/delivery.worker');
const { NotificationController } = require('./controllers/notification.controller');
const { buildRoutes } = require('./routes/notification.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp(overrides = {}) {
  const users = new UserRepository();
  const preferences = new PreferenceRepository();
  const notifications = new NotificationRepository();
  const queue = new InMemoryQueue({ concurrency: config.workerConcurrency });
  const channels = overrides.channels || createChannels(config);
  const service = new NotificationService({ users, preferences, notifications, templates: new TemplateService(), queue });
  const worker = new DeliveryWorker({ queue, channels, users, notifications, maxAttempts: config.maxAttempts, baseBackoffMs: config.baseBackoffMs });
  queue.process((job) => worker.handle(job));          // start consuming jobs

  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', buildRoutes(new NotificationController({ service, preferences, users, queue })));
  app.use(notFound);
  app.use(errorHandler);
  return { app, service, queue };
}

module.exports = { createApp };
:::

::: code javascript notification-system/src/routes/notification.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildRoutes(controller) {
  const router = express.Router();
  router.post('/notifications', asyncHandler((req, res) => controller.send(req, res)));
  router.get('/notifications/:id', asyncHandler((req, res) => controller.get(req, res)));
  router.put('/users/:userId/preferences', asyncHandler((req, res) => controller.updatePreferences(req, res)));
  router.get('/dead-letters', asyncHandler((req, res) => controller.deadLetters(req, res)));
  return router;
}

module.exports = { buildRoutes };
:::

::: code javascript notification-system/src/controllers/notification.controller.js
const ApiError = require('../utils/ApiError');

class NotificationController {
  constructor({ service, preferences, users, queue }) {
    this.service = service;
    this.preferences = preferences;
    this.users = users;
    this.queue = queue;
  }

  async send(req, res) {
    const { userId, event, data = {}, dedupeKey } = req.body || {};
    if (!userId || typeof event !== 'string') throw ApiError.badRequest('"userId" and "event" are required');
    const { notification, duplicate } = await this.service.notify({ userId: String(userId), event, data, dedupeKey });
    res.status(duplicate ? 200 : 202).json(notification); // 202 = accepted, processing in the background
  }

  async get(req, res) {
    res.json(await this.service.getStatus(req.params.id));
  }

  async updatePreferences(req, res) {
    const { userId } = req.params;
    if (!(await this.users.findById(userId))) throw ApiError.notFound('User not found');
    const allowed = {};
    for (const channel of ['email', 'sms', 'push']) {
      if (req.body && req.body[channel] !== undefined) {
        if (typeof req.body[channel] !== 'boolean') throw ApiError.badRequest(`"${channel}" must be true or false`);
        allowed[channel] = req.body[channel];
      }
    }
    res.json(await this.preferences.update(userId, allowed));
  }

  async deadLetters(req, res) {
    res.json(this.queue.deadLetters());
  }
}

module.exports = { NotificationController };
:::

::: code javascript notification-system/src/services/notification.service.js
// Turns one event into one delivery job per enabled channel.
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const CHANNELS = ['email', 'sms', 'push'];

class NotificationService {
  constructor({ users, preferences, notifications, templates, queue }) {
    Object.assign(this, { users, preferences, notifications, templates, queue });
  }

  async notify({ userId, event, data, dedupeKey }) {
    const user = await this.users.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    if (!this.templates.hasEvent(event)) throw ApiError.badRequest(`Unknown event "${event}"`);

    if (dedupeKey) {                                          // idempotency: same key → same notification
      const existing = await this.notifications.findByDedupeKey(dedupeKey);
      if (existing) return { notification: existing, duplicate: true };
    }

    const prefs = await this.preferences.get(userId);
    const channels = CHANNELS.filter((c) => prefs[c] && user.contacts[c]); // enabled AND we have an address
    const notification = await this.notifications.create({
      id: crypto.randomUUID(),
      userId,
      event,
      dedupeKey: dedupeKey || null,
      createdAt: new Date().toISOString(),
      deliveries: channels.map((channel) => ({ channel, status: 'queued', attempts: 0, lastError: null, sentAt: null })),
    });

    for (const channel of channels) {
      const message = this.templates.render(event, channel, { ...data, name: user.name });
      this.queue.add({ notificationId: notification.id, userId, channel, message, attempt: 1 });
    }
    return { notification, duplicate: false };
  }

  async getStatus(id) {
    const n = await this.notifications.findById(id);
    if (!n) throw ApiError.notFound('Notification not found');
    return n;
  }
}

module.exports = { NotificationService };
:::

::: code javascript notification-system/src/services/template.service.js
// Templates per event and channel. {{name}} placeholders are filled from data.
const TEMPLATES = {
  ORDER_SHIPPED: {
    email: { subject: 'Your order {{orderId}} has shipped', body: 'Hi {{name}}, your order {{orderId}} is on its way. ETA: {{eta}}.' },
    sms: { body: 'Order {{orderId}} shipped, ETA {{eta}}.' },
    push: { title: 'Order shipped 📦', body: '{{orderId}} arrives {{eta}}' },
  },
  PASSWORD_CHANGED: {
    email: { subject: 'Your password was changed', body: 'Hi {{name}}, your password was changed. Not you? Reset it now.' },
    sms: { body: 'Your password was changed. Not you? Contact support.' },
    push: { title: 'Security alert', body: 'Your password was changed' },
  },
};

class TemplateService {
  hasEvent(event) {
    return Boolean(TEMPLATES[event]);
  }

  render(event, channel, data) {
    const template = TEMPLATES[event] && TEMPLATES[event][channel];
    if (!template) throw new Error(`No template for ${event}/${channel}`);
    const fill = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => (data[key] !== undefined ? String(data[key]) : `{{${key}}}`));
    const out = {};
    for (const [field, text] of Object.entries(template)) out[field] = fill(text);
    return out;
  }
}

module.exports = { TemplateService, TEMPLATES };
:::

::: code javascript notification-system/src/queue/inMemoryQueue.js
// Tiny job queue: FIFO, optional delay, limited concurrency, dead-letter list.
// Production: BullMQ (Redis) or SQS give persistence, multiple workers and visibility timeouts.
class InMemoryQueue {
  constructor({ concurrency = 5 } = {}) {
    this.concurrency = concurrency;
    this.waiting = [];          // jobs ready to run
    this.active = 0;            // jobs currently running
    this.dead = [];             // jobs that failed permanently
    this.handler = null;
  }

  add(job, delayMs = 0) {
    if (delayMs > 0) {
      setTimeout(() => this.add(job), delayMs);   // delayed jobs join the queue later
      return;
    }
    this.waiting.push(job);
    this.#drain();
  }

  process(handler) {
    this.handler = handler;
    this.#drain();
  }

  moveToDeadLetter(job, error) {
    this.dead.push({ ...job, failedAt: new Date().toISOString(), error: error.message });
  }

  deadLetters() {
    return [...this.dead];
  }

  #drain() {
    while (this.handler && this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      this.active++;
      Promise.resolve()
        .then(() => this.handler(job))
        .catch((err) => console.error('worker crashed on job', job, err))
        .finally(() => { this.active--; this.#drain(); });  // pick up the next job
    }
  }
}

module.exports = { InMemoryQueue };
:::

::: code javascript notification-system/src/workers/delivery.worker.js
// Delivers one job; on failure re-queues it with exponential backoff, or moves it to the DLQ.
class DeliveryWorker {
  constructor({ queue, channels, users, notifications, maxAttempts, baseBackoffMs }) {
    Object.assign(this, { queue, channels, users, notifications, maxAttempts, baseBackoffMs });
  }

  backoff(attempt) {
    const exp = this.baseBackoffMs * 2 ** (attempt - 1);       // 200, 400, 800, 1600…
    const jitter = Math.random() * this.baseBackoffMs;         // spread retries so they don't stampede
    return Math.round(exp + jitter);
  }

  async handle(job) {
    const user = await this.users.findById(job.userId);
    const channel = this.channels[job.channel];
    try {
      await channel.send(user, job.message);
      await this.notifications.updateDelivery(job.notificationId, job.channel, {
        status: 'sent', attempts: job.attempt, sentAt: new Date().toISOString(), lastError: null,
      });
    } catch (err) {
      if (job.attempt >= this.maxAttempts) {
        this.queue.moveToDeadLetter(job, err);                  // give up: keep it for inspection / replay
        await this.notifications.updateDelivery(job.notificationId, job.channel, { status: 'dead', attempts: job.attempt, lastError: err.message });
        return;
      }
      await this.notifications.updateDelivery(job.notificationId, job.channel, { status: 'retrying', attempts: job.attempt, lastError: err.message });
      this.queue.add({ ...job, attempt: job.attempt + 1 }, this.backoff(job.attempt));
    }
  }
}

module.exports = { DeliveryWorker };
:::

::: code javascript notification-system/src/channels/index.js
// Registry of channel strategies: the worker only knows `channels[name].send(user, message)`.
const { EmailChannel } = require('./email.channel');
const { SmsChannel } = require('./sms.channel');
const { PushChannel } = require('./push.channel');

function createChannels(config) {
  return {
    email: new EmailChannel(),
    sms: new SmsChannel({ failRate: config.smsFailRate }),
    push: new PushChannel(),
  };
}

module.exports = { createChannels };
:::

::: code javascript notification-system/src/channels/email.channel.js
// Fake email provider. Replace the body of send() with SES/SendGrid/Nodemailer in production.
class EmailChannel {
  async send(user, message) {
    if (!user.contacts.email) throw new Error('User has no email address');
    await new Promise((r) => setTimeout(r, 30));               // pretend network latency
    console.log(`📧 email → ${user.contacts.email}: [${message.subject}] ${message.body}`);
    return { providerId: `email_${Date.now()}` };
  }
}

module.exports = { EmailChannel };
:::

::: code javascript notification-system/src/channels/sms.channel.js
// Fake SMS provider that can fail randomly (failRate 0..1) to demonstrate retries.
class SmsChannel {
  constructor({ failRate = 0 } = {}) {
    this.failRate = failRate;
  }

  async send(user, message) {
    if (!user.contacts.sms) throw new Error('User has no phone number');
    await new Promise((r) => setTimeout(r, 20));
    if (Math.random() < this.failRate) throw new Error('SMS provider 503 Service Unavailable');
    console.log(`📱 sms → ${user.contacts.sms}: ${message.body}`);
    return { providerId: `sms_${Date.now()}` };
  }
}

module.exports = { SmsChannel };
:::

::: code javascript notification-system/src/channels/push.channel.js
// Fake push provider (FCM/APNs in production, using the device token).
class PushChannel {
  async send(user, message) {
    if (!user.contacts.push) throw new Error('User has no device token');
    await new Promise((r) => setTimeout(r, 10));
    console.log(`🔔 push → device ${user.contacts.push}: ${message.title}: ${message.body}`);
    return { providerId: `push_${Date.now()}` };
  }
}

module.exports = { PushChannel };
:::

::: code javascript notification-system/src/repositories/user.repository.js
// Seeded users with their contact addresses (a database table in production).
const USERS = [
  { id: '1', name: 'Asha', contacts: { email: 'asha@example.com', sms: '+911111111111', push: 'device-token-asha' } },
  { id: '2', name: 'Ben', contacts: { email: 'ben@example.com', sms: null, push: null } },
];

class UserRepository {
  async findById(id) {
    return USERS.find((u) => u.id === String(id)) || null;
  }
}

module.exports = { UserRepository };
:::

::: code javascript notification-system/src/repositories/preference.repository.js
// Per-user channel preferences; everything enabled by default.
class PreferenceRepository {
  constructor() {
    this.prefs = new Map();
  }
  async get(userId) {
    return { email: true, sms: true, push: true, ...(this.prefs.get(userId) || {}) };
  }
  async update(userId, changes) {
    const next = { ...(await this.get(userId)), ...changes };
    this.prefs.set(userId, next);
    return { userId, ...next };
  }
}

module.exports = { PreferenceRepository };
:::

::: code javascript notification-system/src/repositories/notification.repository.js
// Stores notifications and per-channel delivery statuses.
class NotificationRepository {
  constructor() {
    this.byId = new Map();
    this.byDedupeKey = new Map();
  }
  async create(n) {
    this.byId.set(n.id, n);
    if (n.dedupeKey) this.byDedupeKey.set(n.dedupeKey, n.id);
    return structuredClone(n);
  }
  async findById(id) {
    const n = this.byId.get(id);
    return n ? structuredClone(n) : null;
  }
  async findByDedupeKey(key) {
    const id = this.byDedupeKey.get(key);
    return id ? this.findById(id) : null;
  }
  async updateDelivery(id, channel, changes) {
    const n = this.byId.get(id);
    const delivery = n && n.deliveries.find((d) => d.channel === channel);
    if (delivery) Object.assign(delivery, changes);
  }
}

module.exports = { NotificationRepository };
:::

::: code javascript notification-system/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, message, details); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
}

module.exports = ApiError;
:::

::: code javascript notification-system/src/utils/asyncHandler.js
// Forwards errors from async handlers to Express's error middleware.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript notification-system/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message } });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: fan-out, preferences, retries with backoff and the dead-letter queue (runnable)
// A compact version of the service + queue + worker with fake channels and fast timers.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const users = { 1: { name: 'Asha', contacts: { email: 'a@x', sms: '+91', push: 'tok' } } };
const prefs = { 1: { email: true, sms: true, push: false } };       // push disabled by the user
let smsFailuresLeft = 2;                                              // SMS fails twice, then works
const channels = {
  email: { send: async () => log.push('email sent') },
  sms: { send: async () => { if (smsFailuresLeft-- > 0) throw new Error('503'); log.push('sms sent'); } },
  push: { send: async () => log.push('push sent') },
  broken: { send: async () => { throw new Error('always down'); } },
};
const dead = [];
const status = {};

function enqueue(job, delay = 0) { setTimeout(() => work(job), delay); }
async function work(job) {
  try {
    await channels[job.channel].send(users[job.userId], job.message);
    status[job.channel] = { status: 'sent', attempts: job.attempt };
  } catch (e) {
    if (job.attempt >= 4) { dead.push(job); status[job.channel] = { status: 'dead', attempts: job.attempt }; return; }
    status[job.channel] = { status: 'retrying', attempts: job.attempt };
    enqueue({ ...job, attempt: job.attempt + 1 }, 10 * 2 ** (job.attempt - 1)); // 10, 20, 40 ms backoff
  }
}
function notify(userId, event, extraChannels = []) {
  const p = prefs[userId];
  const chosen = ['email', 'sms', 'push'].filter((c) => p[c]).concat(extraChannels);
  chosen.forEach((channel) => enqueue({ userId, channel, message: { body: event }, attempt: 1 }));
  return chosen;
}

// ---------- tests ----------
(async () => {
  const chosen = notify('1', 'ORDER_SHIPPED');
  console.log('channels chosen (push disabled) →', JSON.stringify(chosen), JSON.stringify(chosen) === '["email","sms"]' ? '✅' : '❌ FAIL');
  await sleep(150);
  console.log('email delivered on the first try →', JSON.stringify(status.email), status.email.attempts === 1 ? '✅' : '❌ FAIL');
  console.log('sms delivered after 2 retries →', JSON.stringify(status.sms), status.sms.status === 'sent' && status.sms.attempts === 3 ? '✅' : '❌ FAIL');
  notify('1', 'PASSWORD_CHANGED', ['broken']);
  await sleep(200);
  console.log('always-failing channel ends in the DLQ →', JSON.stringify(status.broken), status.broken.status === 'dead' && dead.length === 1 ? '✅' : '❌ FAIL');
  console.log('backoff schedule (ms):', [1, 2, 3].map((a) => 10 * 2 ** (a - 1)).join(', '), '✅');
})();
:::

::: text 🧪 How to run & test
1. Create the files, then: `cd notification-system && npm install && SMS_FAIL_RATE=0.6 npm start`
2. **Send an event** (user 1 has email, SMS and push):
`curl -s -X POST http://localhost:3003/api/notifications -H "Content-Type: application/json" -d '{"userId":"1","event":"ORDER_SHIPPED","data":{"orderId":"A-1001","eta":"tomorrow"},"dedupeKey":"order-A-1001-shipped"}'`
Expected: **202** `{"id":"…","userId":"1","event":"ORDER_SHIPPED",…,"deliveries":[{"channel":"email","status":"queued",…},{"channel":"sms",…},{"channel":"push",…}]}`. The server console prints `📧 email → asha@example.com: [Your order A-1001 has shipped] …` and, after a few retries, `📱 sms → …`.
3. **Check the status** (use the id from step 2): `curl -s http://localhost:3003/api/notifications/<id>` → each delivery shows `sent` (with `attempts`), or `retrying`/`dead` with `lastError`.
4. **Same dedupeKey again** → **200** with the same notification, nothing new is sent.
5. **Preferences**: `curl -s -X PUT http://localhost:3003/api/users/1/preferences -H "Content-Type: application/json" -d '{"sms":false}'` → `{"userId":"1","email":true,"sms":false,"push":true}`; the next event skips SMS.
6. **Dead letters**: start with `SMS_FAIL_RATE=1 npm start`, send an event, wait ~3 s, then `curl -s http://localhost:3003/api/dead-letters` → the SMS job with `"error":"SMS provider 503 Service Unavailable"`.
7. **Errors**: unknown user → **404**; unknown event → **400** `Unknown event "…"`.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Sending | Synchronous inside the API request | **Queue + workers** | Queue: fast API, retries, isolation of slow providers |
| Queue technology | In-memory (demo) | **BullMQ (Redis), SQS, RabbitMQ, Kafka** | Persistent queue in production (jobs survive restarts) |
| Delivery guarantee | At-most-once (never duplicate, may lose) | **At-least-once + dedupe** | At-least-once with idempotency keys |
| Retry timing | Fixed delay | **Exponential backoff + jitter** | Backoff avoids hammering a struggling provider |
| One job per | Notification (all channels together) | **Channel** | Per channel: SMS failures don't re-send the email |
| Templates | In code (demo) | Database / CMS with versions | DB/CMS when non-developers edit copy |
:::

::: text 📈 Scaling & edge cases
- **10×**: move to a persistent queue (BullMQ/SQS) and run several worker processes; keep the API stateless.
- **100×**: separate queues per channel and priority (security alerts before marketing), respect provider rate limits with a limiter per provider, batch emails.
- **Provider outage**: circuit breaker per provider, failover to a second provider (e.g. SES → SendGrid).
- **Duplicates**: dedupe at the API (`dedupeKey`) and at the worker (store provider message ids) because queues may deliver a job twice.
- **User experience**: quiet hours and time zones, digests (combine many events into one email), unsubscribe links (legally required for marketing email).
- **Edge cases**: user without a phone number, invalid device token (remove it), template variables missing, very large fan-out (one event to 1M users → batch jobs).
:::

::: warning ⚠️ Common mistakes
- Calling the email/SMS provider **inside** the HTTP request: the API gets slow and fails when the provider fails.
- Retrying immediately in a tight loop (no backoff) → you DDoS the provider and get rate-limited.
- One job for all channels → a failing SMS causes the email to be sent again on retry.
- No dead-letter queue → failed messages silently disappear.
- Ignoring user preferences/opt-outs (users complain; legal issues for marketing).
:::

::: understand
- This design is about **decoupling with a queue**: producers say *what happened*, the notification service decides *who/how*, workers do the slow, unreliable part with retries.
- The **strategy pattern** (same `send()` for every channel) makes adding WhatsApp or Slack a new class, not a rewrite.
:::

::: important ⭐ How to present this design in 5 minutes
> "Producers send an event like ORDER_SHIPPED to POST /api/notifications. The NotificationService validates it, checks a dedupe key, loads the user's preferences, renders a template per channel, stores a notification record and enqueues one job per channel, then returns 202 immediately. Workers pull jobs and call the channel strategy, email, SMS or push, all with the same send interface. On failure they retry with exponential backoff and jitter; after max attempts the job goes to a dead-letter queue for inspection. Status per channel is visible through GET. In production the queue is BullMQ or SQS, with separate queues per channel and priority, provider rate limits, circuit breakers and quiet hours."
:::

::: links
BullMQ documentation | https://docs.bullmq.io/
AWS: Exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
Refactoring Guru: Strategy pattern | https://refactoring.guru/design-patterns/strategy
MDN: 202 Accepted | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/202
:::

=== Design a Job Queue (Producer → Queue → Worker)
@p 3
@tags lld, queue, bullmq, workers
@quick
- **Producer** adds jobs (API returns 202 + job id) → **queue** stores them → **workers** process them in the background with limited **concurrency**.
- Job lifecycle: `waiting / delayed → active → completed` or `failed → (retry with backoff) → dead`.
- **Retries + exponential backoff**, per-job **timeout**, **dead-letter queue** with manual retry.
- **Idempotency**: an `idempotencyKey` returns the existing job; handlers must be safe to run twice (at-least-once).
- Production: **BullMQ** (Redis) or SQS; graceful shutdown waits for active jobs.

::: text 🧒 In simple words
Some work is too slow or unreliable to do while a user waits for an HTTP response: resizing images, generating PDFs, sending 10,000 emails, calling a slow partner API. A job queue is a **restaurant kitchen ticket system**: the waiter (API) writes an order ticket and immediately tells the customer "it's coming"; cooks (workers) pick tickets from the rail, a few at a time; if a dish fails, they try again; if it keeps failing, the ticket goes to the manager (dead-letter queue).
:::

::: text 📋 Requirements
### Functional
- `POST /api/jobs` adds a job `{ type, payload, priority?, delayMs?, maxAttempts?, idempotencyKey? }`.
- Workers run jobs by **type** using registered handlers, with a configurable concurrency.
- Jobs can be **delayed** and have **priorities** (lower number = more urgent).
- Failed jobs are retried with exponential backoff; after `maxAttempts` they go to the **dead-letter** list and can be retried manually.
- Anyone can query a job's status and the queue's statistics.

### Non-functional
- The API never blocks on job execution.
- A hanging job can't block a worker forever (**timeout**).
- On shutdown (`Ctrl+C` / deploy), stop taking new jobs and let active ones finish.

### Assumptions
- One Node process, everything in memory for the runnable version. BullMQ + Redis version shown separately for production.
:::

::: ask
- *"What kinds of jobs, how long do they take, how many per minute?"*
- *"Is it OK if a job runs twice?"* (Almost every queue is at-least-once.)
- *"Do jobs need priorities, delays, scheduling (cron)?"*
- *"Must jobs survive a server restart?"* (Then a persistent queue: Redis/SQS/DB.)
- *"Who looks at failed jobs, and how are they replayed?"*
:::

::: diagram High-level architecture
flowchart LR
  P["Producer (API or other service)"] --> API["POST /api/jobs"]
  API --> JS["JobService (validate, idempotency)"]
  JS --> Q["JobQueue: priority heap + delayed set"]
  Q --> W["Worker pool (concurrency N)"]
  W --> H["Handlers registry: send-email, resize-image, flaky"]
  W -->|"success"| DONE["completed (result)"]
  W -->|"error, attempts left"| RETRY["delayed (backoff)"]
  RETRY --> Q
  W -->|"error, no attempts left"| DLQ["dead-letter list"]
  DLQ -->|"POST /jobs/:id/retry"| Q
:::

::: diagram Class diagram
classDiagram
  class JobService {
    +enqueue(input) Job
    +get(id) Job
    +retryDead(id) Job
    +stats() object
  }
  class JobQueue {
    -ready PriorityQueue
    -delayed Map
    +add(job) void
    +takeNext() Job
    +schedule(job, delayMs) void
  }
  class PriorityQueue {
    +push(item) void
    +pop() item
    +size() number
  }
  class Worker {
    -concurrency
    -handlers
    +start() void
    +stop() Promise
    -run(job) void
  }
  class JobRepository {
    +save(job) void
    +findById(id) Job
    +findByIdempotencyKey(key) Job
    +countByStatus() object
  }
  JobService --> JobQueue
  JobService --> JobRepository
  JobQueue --> PriorityQueue
  Worker --> JobQueue
  Worker --> JobRepository
:::

::: diagram Sequence: a job that fails once, then succeeds
sequenceDiagram
  participant C as Client
  participant API as Jobs API
  participant Q as JobQueue
  participant W as Worker
  participant H as Handler
  C->>API: POST /api/jobs (type flaky)
  API->>Q: add(job, status waiting)
  API-->>C: 202 (id)
  W->>Q: takeNext()
  Q-->>W: job (attempt 1, status active)
  W->>H: run(payload) with timeout
  H-->>W: throws Error
  W->>Q: schedule(job, backoff 500 ms, status delayed)
  W->>Q: takeNext() after the delay
  W->>H: run (attempt 2)
  H-->>W: result
  W->>W: status completed
  C->>API: GET /api/jobs/:id
  API-->>C: completed, attempts 2, result
:::

::: image Job queue: producer, priority queue with delayed jobs, worker pool, handlers and the dead-letter list
/images/backend-lld/job-queue.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `JobService` | Validates input, applies defaults, idempotency key lookup, creates the job record, adds it to the queue |
| `JobQueue` | Holds **ready** jobs in a priority heap (priority, then FIFO) and **delayed** jobs in timers; `takeNext()` |
| `PriorityQueue` | Binary min-heap: O(log n) push/pop |
| `Worker` | Polls the queue while below `concurrency`, runs the handler with a **timeout**, updates status, retries with backoff or moves to DLQ; graceful `stop()` |
| `handlers` | Business code per job type: `send-email`, `resize-image`, `flaky` |
| `JobRepository` | Stores job records (status, attempts, result, error, timestamps) |

### Job record
`{ id, type, payload, priority, status, attempts, maxAttempts, idempotencyKey, result, error, createdAt, updatedAt, runAt }`
Statuses: `waiting`, `delayed`, `active`, `completed`, `dead` (failed after the last attempt).

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/jobs` | `{ type, payload, priority?, delayMs?, maxAttempts?, idempotencyKey? }` | **202** job; **200** existing job for a known idempotency key; 400 unknown type |
| GET | `/api/jobs/:id` | – | **200** job / 404 |
| POST | `/api/jobs/:id/retry` | – | **202** job (only for `dead` jobs, else 409) |
| GET | `/api/queue/stats` | – | **200** `{ waiting, delayed, active, completed, dead }` |
:::

::: text 📁 Folder structure
`job-queue/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/job.routes.js`, `src/controllers/job.controller.js`
↳ `src/services/job.service.js`
↳ `src/queue/priorityQueue.js`, `src/queue/jobQueue.js`
↳ `src/worker/worker.js`, `src/jobs/handlers.js`
↳ `src/repositories/job.repository.js`
↳ `src/utils/ApiError.js`, `src/utils/asyncHandler.js`, `src/middleware/errorHandler.js`

`job-queue-bullmq/` (the same idea with BullMQ + Redis): `package.json`, `producer.js`, `worker.js`
:::

::: code json job-queue/package.json
{
  "name": "job-queue",
  "version": "1.0.0",
  "private": true,
  "description": "Job queue LLD: priorities, delays, concurrency, retries with backoff, dead-letter queue",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": { "express": "^4.19.2" }
}
:::

::: code javascript job-queue/src/index.js
// Run: npm install && npm start      Stop with Ctrl+C to see the graceful shutdown.
const { createApp } = require('./app');
const config = require('./config');

const { app, worker } = createApp();
const server = app.listen(config.port, () => console.log(`Job queue API on http://localhost:${config.port} (concurrency ${config.concurrency})`));

async function shutdown(signal) {
  console.log(`${signal} received: no new jobs, waiting for active ones…`);
  server.close();                       // stop accepting HTTP requests
  await worker.stop();                  // let running jobs finish (up to the timeout)
  console.log('Bye 👋');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
:::

::: code javascript job-queue/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 3004,
  concurrency: Number(process.env.CONCURRENCY) || 2,      // jobs running at the same time
  defaultMaxAttempts: Number(process.env.MAX_ATTEMPTS) || 3,
  baseBackoffMs: Number(process.env.BACKOFF_MS) || 500,   // 500, 1000, 2000 ms…
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS) || 5000,
};
:::

::: code javascript job-queue/src/app.js
const express = require('express');
const config = require('./config');
const { JobRepository } = require('./repositories/job.repository');
const { JobQueue } = require('./queue/jobQueue');
const { JobService } = require('./services/job.service');
const { Worker } = require('./worker/worker');
const { handlers } = require('./jobs/handlers');
const { JobController } = require('./controllers/job.controller');
const { buildJobRoutes } = require('./routes/job.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const repo = new JobRepository();
  const queue = new JobQueue({ repo });
  const service = new JobService({ repo, queue, handlerTypes: Object.keys(handlers), defaultMaxAttempts: config.defaultMaxAttempts });
  const worker = new Worker({ queue, repo, handlers, concurrency: config.concurrency, baseBackoffMs: config.baseBackoffMs, timeoutMs: config.jobTimeoutMs });
  worker.start();

  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', buildJobRoutes(new JobController(service)));
  app.use(notFound);
  app.use(errorHandler);
  return { app, worker, service };
}

module.exports = { createApp };
:::

::: code javascript job-queue/src/routes/job.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildJobRoutes(controller) {
  const router = express.Router();
  router.post('/jobs', asyncHandler((req, res) => controller.create(req, res)));
  router.get('/jobs/:id', asyncHandler((req, res) => controller.get(req, res)));
  router.post('/jobs/:id/retry', asyncHandler((req, res) => controller.retry(req, res)));
  router.get('/queue/stats', asyncHandler((req, res) => controller.stats(req, res)));
  return router;
}

module.exports = { buildJobRoutes };
:::

::: code javascript job-queue/src/controllers/job.controller.js
class JobController {
  constructor(service) {
    this.service = service;
  }
  async create(req, res) {
    const { job, existing } = await this.service.enqueue(req.body || {});
    res.status(existing ? 200 : 202).json(job);
  }
  async get(req, res) {
    res.json(await this.service.get(req.params.id));
  }
  async retry(req, res) {
    res.status(202).json(await this.service.retryDead(req.params.id));
  }
  async stats(req, res) {
    res.json(await this.service.stats());
  }
}

module.exports = { JobController };
:::

::: code javascript job-queue/src/services/job.service.js
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

class JobService {
  constructor({ repo, queue, handlerTypes, defaultMaxAttempts }) {
    Object.assign(this, { repo, queue, handlerTypes, defaultMaxAttempts });
  }

  async enqueue({ type, payload = {}, priority = 5, delayMs = 0, maxAttempts, idempotencyKey }) {
    if (!this.handlerTypes.includes(type)) throw ApiError.badRequest(`Unknown job type "${type}". Known: ${this.handlerTypes.join(', ')}`);
    if (!Number.isInteger(priority) || priority < 1 || priority > 10) throw ApiError.badRequest('"priority" must be an integer 1 (urgent) to 10');
    if (!Number.isInteger(delayMs) || delayMs < 0) throw ApiError.badRequest('"delayMs" must be a non-negative integer');

    if (idempotencyKey) {
      const existing = await this.repo.findByIdempotencyKey(idempotencyKey);
      if (existing) return { job: existing, existing: true };        // same request twice → same job
    }
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(),
      type,
      payload,
      priority,
      status: 'waiting',
      attempts: 0,
      maxAttempts: maxAttempts || this.defaultMaxAttempts,
      idempotencyKey: idempotencyKey || null,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(job);
    if (delayMs > 0) this.queue.schedule(job, delayMs);
    else this.queue.add(job);
    return { job: await this.repo.findById(job.id), existing: false };
  }

  async get(id) {
    const job = await this.repo.findById(id);
    if (!job) throw ApiError.notFound('Job not found');
    return job;
  }

  async retryDead(id) {
    const job = await this.get(id);
    if (job.status !== 'dead') throw ApiError.conflict(`Only dead jobs can be retried (status is ${job.status})`);
    job.attempts = 0;
    job.error = null;
    await this.repo.save(job);
    this.queue.add(job);
    return this.repo.findById(id);
  }

  async stats() {
    return this.repo.countByStatus();
  }
}

module.exports = { JobService };
:::

::: code javascript job-queue/src/queue/priorityQueue.js
// Binary min-heap ordered by (priority, sequence): lower priority number first, FIFO among equals.
class PriorityQueue {
  constructor() {
    this.heap = [];
    this.seq = 0;                         // insertion counter for FIFO tie-breaking
  }
  size() {
    return this.heap.length;
  }
  #less(a, b) {
    return a.priority !== b.priority ? a.priority < b.priority : a.seq < b.seq;
  }
  push(item) {
    const node = { ...item, seq: this.seq++ };
    const h = this.heap;
    h.push(node);
    let i = h.length - 1;
    while (i > 0) {                       // bubble up
      const p = (i - 1) >> 1;
      if (!this.#less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  pop() {
    const h = this.heap;
    if (!h.length) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {                          // sift down
        const l = 2 * i + 1, r = l + 1;
        let best = i;
        if (l < h.length && this.#less(h[l], h[best])) best = l;
        if (r < h.length && this.#less(h[r], h[best])) best = r;
        if (best === i) break;
        [h[i], h[best]] = [h[best], h[i]];
        i = best;
      }
    }
    return top;
  }
}

module.exports = { PriorityQueue };
:::

::: code javascript job-queue/src/queue/jobQueue.js
// Ready jobs live in a priority heap; delayed jobs wait in timers and then join the heap.
const { PriorityQueue } = require('./priorityQueue');

class JobQueue {
  constructor({ repo }) {
    this.repo = repo;
    this.ready = new PriorityQueue();
    this.timers = new Map();              // jobId → timeout handle (delayed jobs)
    this.listeners = new Set();           // called when a job becomes ready (wakes the worker)
  }

  add(job) {
    job.status = 'waiting';
    job.updatedAt = new Date().toISOString();
    this.repo.save(job);
    this.ready.push({ id: job.id, priority: job.priority });
    this.listeners.forEach((fn) => fn());
  }

  schedule(job, delayMs) {
    job.status = 'delayed';
    job.runAt = new Date(Date.now() + delayMs).toISOString();
    this.repo.save(job);
    const handle = setTimeout(() => {
      this.timers.delete(job.id);
      this.add(job);
    }, delayMs);
    this.timers.set(job.id, handle);
  }

  async takeNext() {
    const item = this.ready.pop();
    return item ? this.repo.findById(item.id) : null;
  }

  onReady(fn) {
    this.listeners.add(fn);
  }

  clearTimers() {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }
}

module.exports = { JobQueue };
:::

::: code javascript job-queue/src/worker/worker.js
// Pulls jobs while below the concurrency limit, runs handlers with a timeout, retries or dead-letters.
class Worker {
  constructor({ queue, repo, handlers, concurrency, baseBackoffMs, timeoutMs }) {
    Object.assign(this, { queue, repo, handlers, concurrency, baseBackoffMs, timeoutMs });
    this.active = 0;
    this.running = false;
    this.idleResolvers = [];
  }

  start() {
    this.running = true;
    this.queue.onReady(() => this.#pump());   // wake up when jobs arrive
    this.#pump();
  }

  async stop() {
    this.running = false;                     // take no new jobs
    this.queue.clearTimers();
    if (this.active === 0) return;
    await new Promise((resolve) => this.idleResolvers.push(resolve)); // wait for active jobs
  }

  async #pump() {
    while (this.running && this.active < this.concurrency) {
      const job = await this.queue.takeNext();
      if (!job) return;
      this.active++;
      this.#run(job).finally(() => {
        this.active--;
        if (!this.running && this.active === 0) this.idleResolvers.splice(0).forEach((r) => r());
        this.#pump();                         // a slot is free → take another job
      });
    }
  }

  #withTimeout(promise) {
    let handle;
    const timeout = new Promise((_, reject) => {
      handle = setTimeout(() => reject(new Error(`Job timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(handle));
  }

  async #run(job) {
    job.status = 'active';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    await this.repo.save(job);
    try {
      const handler = this.handlers[job.type];
      job.result = await this.#withTimeout(Promise.resolve().then(() => handler(job.payload, job)));
      job.status = 'completed';
      job.error = null;
    } catch (err) {
      job.error = err.message;
      if (job.attempts >= job.maxAttempts) {
        job.status = 'dead';                                        // DLQ: needs a human or a manual retry
      } else {
        const delay = this.baseBackoffMs * 2 ** (job.attempts - 1); // exponential backoff
        this.queue.schedule(job, delay);
        return;
      }
    }
    job.updatedAt = new Date().toISOString();
    await this.repo.save(job);
  }
}

module.exports = { Worker };
:::

::: code javascript job-queue/src/jobs/handlers.js
// Job handlers by type. Each receives the payload and returns a result (or throws).
// Handlers must be IDEMPOTENT: running them twice must not cause double effects.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const handlers = {
  'send-email': async ({ to, subject }) => {
    if (!to) throw new Error('"to" is required');
    await sleep(300);                                   // pretend to call an email provider
    return { delivered: true, to, subject: subject || '(no subject)' };
  },

  'resize-image': async ({ url, width = 200 }) => {
    if (!url) throw new Error('"url" is required');
    await sleep(800);                                   // pretend CPU work / S3 upload
    return { thumbnailUrl: `${url}?w=${width}` };
  },

  flaky: async ({ failTimes = 1 }, job) => {
    await sleep(100);
    if (job.attempts <= failTimes) throw new Error(`Simulated failure on attempt ${job.attempts}`);
    return { ok: true, succeededOnAttempt: job.attempts };
  },
};

module.exports = { handlers };
:::

::: code javascript job-queue/src/repositories/job.repository.js
// Job records in memory (a database table or Redis hash in production).
class JobRepository {
  constructor() {
    this.jobs = new Map();
    this.byKey = new Map();
  }
  async save(job) {
    this.jobs.set(job.id, job);
    if (job.idempotencyKey) this.byKey.set(job.idempotencyKey, job.id);
  }
  async findById(id) {
    return this.jobs.get(id) || null;
  }
  async findByIdempotencyKey(key) {
    const id = this.byKey.get(key);
    return id ? this.jobs.get(id) : null;
  }
  async countByStatus() {
    const counts = { waiting: 0, delayed: 0, active: 0, completed: 0, dead: 0 };
    for (const job of this.jobs.values()) counts[job.status] = (counts[job.status] || 0) + 1;
    return counts;
  }
}

module.exports = { JobRepository };
:::

::: code javascript job-queue/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
  static badRequest(message) { return new ApiError(400, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript job-queue/src/utils/asyncHandler.js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript job-queue/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message } });
}

module.exports = { notFound, errorHandler };
:::

::: code json job-queue-bullmq/package.json
{
  "name": "job-queue-bullmq",
  "version": "1.0.0",
  "private": true,
  "description": "The same job queue idea with BullMQ + Redis (persistent, multi-process)",
  "scripts": {
    "producer": "node producer.js",
    "worker": "node worker.js"
  },
  "dependencies": { "bullmq": "^5.12.0" }
}
:::

::: code javascript job-queue-bullmq/producer.js
// Adds jobs to a Redis-backed BullMQ queue.
// Run Redis first: docker run -d -p 6379:6379 redis:7     then: npm install && npm run producer
const { Queue } = require('bullmq');

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
const emailQueue = new Queue('emails', { connection });

async function main() {
  const job = await emailQueue.add(
    'send-email',
    { to: 'asha@example.com', subject: 'Welcome!' },
    {
      jobId: 'welcome-asha',                       // idempotency: the same jobId is added only once
      attempts: 3,                                 // retries
      backoff: { type: 'exponential', delay: 500 }, // 500, 1000, 2000 ms
      priority: 1,
      removeOnComplete: 1000,                      // keep only the last 1000 completed jobs
    }
  );
  console.log('added job', job.id);
  await emailQueue.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript job-queue-bullmq/worker.js
// Processes jobs from the "emails" queue with concurrency 5. Run several copies to scale out.
const { Worker } = require('bullmq');

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };

const worker = new Worker(
  'emails',
  async (job) => {
    console.log(`processing ${job.name} #${job.id} attempt ${job.attemptsMade + 1}`, job.data);
    await new Promise((r) => setTimeout(r, 300));  // pretend to send an email
    return { delivered: true };
  },
  { connection, concurrency: 5 }
);

worker.on('completed', (job, result) => console.log(`completed #${job.id}`, result));
worker.on('failed', (job, err) => console.log(`failed #${job && job.id}: ${err.message}`));

async function shutdown() {
  await worker.close();                            // finishes active jobs, then stops
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
:::

::: code javascript Browser simulation: priorities, concurrency, retries with backoff and the DLQ (runnable)
// Compact queue + worker with the same rules, using short delays so it finishes quickly.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jobs = new Map();
const ready = [];                                   // kept sorted by (priority, seq); fine for a demo
let seq = 0, active = 0, maxSeenActive = 0;
const order = [];
const CONCURRENCY = 2;

function add(job) { job.status = 'waiting'; ready.push({ id: job.id, priority: job.priority, seq: seq++ }); ready.sort((a, b) => a.priority - b.priority || a.seq - b.seq); pump(); }
function schedule(job, ms) { job.status = 'delayed'; setTimeout(() => add(job), ms); }
const handlers = {
  ok: async () => { await sleep(20); return 'done'; },
  flakyTwice: async (job) => { await sleep(5); if (job.attempts <= 2) throw new Error('boom'); return 'third time lucky'; },
  alwaysFails: async () => { throw new Error('permanent'); },
};
function pump() {
  while (active < CONCURRENCY && ready.length) {
    const job = jobs.get(ready.shift().id);
    active++; maxSeenActive = Math.max(maxSeenActive, active);
    run(job).finally(() => { active--; pump(); });
  }
}
async function run(job) {
  job.status = 'active'; job.attempts++; order.push(job.id);
  try { job.result = await handlers[job.type](job); job.status = 'completed'; }
  catch (e) { job.error = e.message; if (job.attempts >= job.maxAttempts) job.status = 'dead'; else schedule(job, 10 * 2 ** (job.attempts - 1)); }
}
function enqueue(id, type, priority = 5) { const job = { id, type, priority, attempts: 0, maxAttempts: 3 }; jobs.set(id, job); add(job); return job; }

// ---------- tests ----------
(async () => {
  // fill the 2 worker slots first, then add jobs with different priorities
  enqueue('slot1', 'ok'); enqueue('slot2', 'ok');
  enqueue('low', 'ok', 9); enqueue('urgent', 'ok', 1); enqueue('normal', 'ok', 5);
  await sleep(100);
  const after = order.slice(2, 5).join(',');
  console.log('priority order after the slots free up →', after, after === 'urgent,normal,low' ? '✅' : '❌ FAIL');
  console.log('never more than 2 at once →', maxSeenActive, maxSeenActive === 2 ? '✅' : '❌ FAIL');
  const f = enqueue('flaky', 'flakyTwice');
  const d = enqueue('doomed', 'alwaysFails');
  await sleep(150);
  console.log('flaky job completes on attempt 3 →', f.status, f.attempts, f.status === 'completed' && f.attempts === 3 ? '✅' : '❌ FAIL');
  console.log('always-failing job ends dead after 3 attempts →', d.status, d.attempts, d.status === 'dead' && d.attempts === 3 ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
1. Create the files, then `cd job-queue && npm install && npm start` → `Job queue API on http://localhost:3004 (concurrency 2)`
2. **Add a job**: `curl -s -X POST http://localhost:3004/api/jobs -H "Content-Type: application/json" -d '{"type":"send-email","payload":{"to":"asha@example.com","subject":"Hi"},"idempotencyKey":"welcome-asha"}'` → **202** with `"status":"waiting"` and an `id`.
3. **Check it** a second later: `curl -s http://localhost:3004/api/jobs/<id>` → `"status":"completed","attempts":1,"result":{"delivered":true,…}`.
4. **Idempotency**: repeat step 2 → **200** with the same `id`.
5. **Retries**: `curl -s -X POST http://localhost:3004/api/jobs -H "Content-Type: application/json" -d '{"type":"flaky","payload":{"failTimes":2}}'` → after ~2 s the job shows `"status":"completed","attempts":3`.
6. **Dead letter + manual retry**: `-d '{"type":"flaky","payload":{"failTimes":10},"maxAttempts":2}'` → after ~1 s `"status":"dead","error":"Simulated failure on attempt 2"`; then `curl -s -X POST http://localhost:3004/api/jobs/<id>/retry` → **202** and it's queued again.
7. **Priorities & delay**: `-d '{"type":"resize-image","payload":{"url":"https://img/x.png"},"priority":1,"delayMs":3000}'` → `"status":"delayed"` for 3 s, then runs before lower-priority waiting jobs.
8. **Stats**: `curl -s http://localhost:3004/api/queue/stats` → `{"waiting":0,"delayed":0,"active":0,"completed":3,"dead":0}`.
9. **Graceful shutdown**: add a few `resize-image` jobs and press `Ctrl+C`: the log shows `SIGINT received… waiting for active ones…` then `Bye 👋`.
10. **BullMQ version**: `docker run -d -p 6379:6379 redis:7`, then in `job-queue-bullmq/`: `npm install`, `npm run worker` in one terminal and `npm run producer` in another.
:::

::: text ⚖️ Trade-offs & alternatives
| Option | Persistence | Multi-server | Features | Choose when |
|---|---|---|---|---|
| In-memory queue (this demo) | ❌ lost on restart | ❌ | Simple | Learning, tests, non-critical work |
| **BullMQ (Redis)** | ✅ | ✅ | Retries, backoff, priorities, delays, cron, rate limits, dashboard | Node.js backends (default choice) |
| AWS SQS (+ Lambda) | ✅ | ✅ | Managed, DLQ built in, visibility timeout | AWS-native, no Redis to run |
| RabbitMQ | ✅ | ✅ | Routing, acks, exchanges | Complex routing between services |
| Kafka | ✅ (log) | ✅ | Huge throughput, replayable event log | Event streaming, analytics pipelines |
| Database table + polling | ✅ | ✅ (with row locks) | No new infrastructure | Small volumes, transactional "outbox" |

| Retry strategy | Behaviour |
|---|---|
| Immediate | Hammers a failing dependency |
| Fixed delay | Better, but retries arrive in waves |
| **Exponential backoff + jitter** | Spreads load, gives dependencies time to recover |
:::

::: text 📈 Scaling & edge cases
- **Scale out**: run more worker processes/containers; with BullMQ each competes for jobs safely (Redis locks).
- **Long jobs**: report progress; use a timeout; for very long work split into smaller jobs.
- **Poison messages**: a job that always crashes must end in the DLQ, not loop forever.
- **At-least-once**: a worker may crash after doing the work but before acking → the job runs again. Make handlers idempotent (check "already sent?", use idempotency keys with external APIs).
- **Backpressure**: if producers are faster than workers, the queue grows; monitor queue length and add workers or rate-limit producers.
- **Ordering**: queues don't guarantee global order with multiple workers; if order matters per entity, route all jobs of that entity to one partition/group.
:::

::: warning ⚠️ Common mistakes
- Doing slow work inside the HTTP request "because it's simpler".
- Unlimited concurrency → hundreds of parallel jobs overload the database or the partner API.
- No timeout → one hung job blocks a worker slot forever.
- Retrying without backoff, or retrying non-retryable errors (bad input) forever.
- Killing the process during deploys without graceful shutdown → jobs half-done.
:::

::: understand
- Queues **decouple** "accepting work" from "doing work": the API stays fast and reliable even when the work is slow or flaky. The same pattern powers the Notification System design above, video processing, and order pipelines.
- Know BullMQ's vocabulary: queue, job, worker, attempts, backoff, concurrency, delayed, completed/failed, repeatable jobs.
:::

::: important ⭐ How to present this design in 5 minutes
> "Producers add jobs through POST /api/jobs and get 202 with a job id; an idempotency key returns the existing job. The queue keeps ready jobs in a priority heap and delayed jobs in timers. A worker pool pulls jobs while below its concurrency limit, runs the handler for the job type with a timeout, and on failure re-schedules it with exponential backoff; after max attempts the job becomes dead and lands in the dead-letter list, where it can be retried manually. Status and stats are queryable. Because delivery is at-least-once, handlers must be idempotent. In production I'd use BullMQ on Redis, scale workers horizontally, monitor queue depth, and shut down gracefully on deploys."
:::

::: links
BullMQ: guide | https://docs.bullmq.io/guide/introduction
BullMQ: retrying failing jobs | https://docs.bullmq.io/guide/retrying-failing-jobs
AWS SQS: dead-letter queues | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
AWS: exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
:::

=== Design a Payment System
@p 2
@tags lld, payments, idempotency, webhooks, state-machine
@quick
- **State machine**: `INITIATED → PROCESSING → SUCCEEDED | FAILED`, `SUCCEEDED → REFUNDED`; reject every other transition.
- **Idempotency-Key** header: the same key returns the **same response** (no double charge); same key + different body → **422**.
- The gateway reports the final result via a **webhook**: verify the **HMAC signature**, ignore **duplicate events**, and treat webhooks as the source of truth.
- **Reconciliation** job: ask the gateway about payments stuck in `PROCESSING`.
- Money as **integers in minor units** (cents/paise), never floats; keep an append-only **audit log**.

::: text 🧒 In simple words
When you click "Pay", your app doesn't move money itself: it asks a **payment gateway** (Stripe, Razorpay, Adyen) to charge the card. The hard parts are the **unreliable edges**: the user double-clicks, the network times out after the card was charged, the gateway tells you the result minutes later through a webhook, or sends that webhook twice. A payment system is like a careful **bank teller with a receipt book**: every request has a receipt number (idempotency key), every status change is written down, and nothing is ever done twice.
:::

::: text 📋 Requirements
### Functional
- Create a payment for an order (`amount` in minor units, `currency`, a card token).
- Never charge twice for the same request, even with retries or double clicks.
- Receive the gateway's asynchronous result via a webhook; update the status.
- Refund a successful payment.
- Reconcile payments whose webhook never arrived.

### Non-functional
- **Correctness over speed**: no double charges, no lost updates; every change auditable.
- Webhooks must be authenticated (signature) and processed exactly once.
- Card data never touches our servers (PCI): we only see the gateway's **token**.

### Assumptions
- A fake gateway (same process) decides the outcome from the token: `tok_success`, `tok_decline`, `tok_no_webhook` (simulates a lost webhook).
- In-memory storage; in production a relational DB with transactions (Postgres) or MongoDB transactions.
:::

::: ask
- *"Which gateway, which payment methods (cards, UPI, wallets)?"*
- *"Synchronous result or async (webhooks)? 3-D Secure / redirects?"*
- *"Partial refunds? Multiple currencies?"*
- *"What's the source of truth when our DB and the gateway disagree?"* (The gateway, via reconciliation.)
- *"Compliance requirements (PCI, audit retention)?"*
:::

::: diagram High-level architecture
flowchart LR
  C["Checkout (frontend)"] -->|"POST /api/payments + Idempotency-Key"| IDM["idempotency middleware"]
  IDM --> PS["PaymentService"]
  PS --> SM["PaymentStateMachine"]
  PS --> DB[("payments + audit log")]
  PS -->|"charge(token, amount)"| GW["Payment gateway (fake)"]
  GW -->|"webhook: payment.succeeded (signed)"| WH["POST /api/webhooks/gateway"]
  WH --> VS["verify HMAC signature + dedupe event id"]
  VS --> PS
  REC["Reconciliation job"] -->|"getCharge(id)"| GW
  REC --> PS
:::

::: diagram Payment state machine
stateDiagram-v2
  [*] --> INITIATED
  INITIATED --> PROCESSING: sent to gateway
  INITIATED --> FAILED: gateway rejected the request
  PROCESSING --> SUCCEEDED: webhook / reconciliation
  PROCESSING --> FAILED: webhook / reconciliation
  SUCCEEDED --> REFUNDED: refund
  FAILED --> [*]
  REFUNDED --> [*]
:::

::: diagram Sequence: pay, double click, webhook
sequenceDiagram
  participant U as User
  participant API as Payments API
  participant GW as Gateway
  U->>API: POST /payments (Idempotency-Key k1)
  API->>API: store payment INITIATED
  API->>GW: charge(tok_success, 4999)
  GW-->>API: accepted (chargeId)
  API->>API: status PROCESSING, save response for k1
  API-->>U: 202 (PROCESSING)
  U->>API: POST /payments (same key k1, double click)
  API-->>U: 202 replayed response (no second charge)
  GW->>API: webhook payment.succeeded (signature, eventId)
  API->>API: verify signature, event not seen before
  API->>API: PROCESSING to SUCCEEDED, audit log
  API-->>GW: 200 OK
:::

::: image Payment system: idempotent API, state machine, gateway, signed webhooks and reconciliation
/images/backend-lld/payment-system.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `middleware/idempotency.js` | Requires `Idempotency-Key` on POST; replays the stored response for a repeated key; 422 if the body differs; 409 while the first request is still running |
| `services/payment.service.js` | Creates payments, calls the gateway, applies transitions through the state machine, refunds, reconciliation |
| `domain/paymentStateMachine.js` | The only place that knows which transitions are legal |
| `gateway/fakeGateway.js` | Simulates Stripe-like behaviour: async result, signed webhook, `getCharge()` for reconciliation |
| `controllers/webhook.controller.js` | Verifies the HMAC signature on the **raw body**, de-duplicates by `eventId`, applies the result |
| `repositories/*` | Payments, idempotency records, processed webhook events, audit log |

### Data model
`Payment { id, orderId, amount (integer minor units), currency, status, gatewayChargeId, failureReason, createdAt, updatedAt }`
`IdempotencyRecord { key, requestHash, status: in_progress | done, responseStatus, responseBody }`
`AuditEntry { paymentId, from, to, reason, at }` (append-only)

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/payments` | header `Idempotency-Key`; `{ orderId, amount, currency, cardToken }` | **202** payment (`PROCESSING`) or **402** (`FAILED`, declined); replay → same status/body |
| GET | `/api/payments/:id` | – | **200** payment + audit trail |
| POST | `/api/payments/:id/refund` | header `Idempotency-Key` | **200** payment (`REFUNDED`); 409 if not `SUCCEEDED` |
| POST | `/api/webhooks/gateway` | gateway event + `x-signature`, `x-timestamp` | **200** processed/duplicate; **400** bad signature |
| POST | `/api/admin/reconcile` | – | **200** `{ checked, updated }` |
:::

::: text 📁 Folder structure
`payment-system/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/payment.routes.js`, `src/routes/webhook.routes.js`
↳ `src/controllers/payment.controller.js`, `src/controllers/webhook.controller.js`
↳ `src/services/payment.service.js`
↳ `src/domain/paymentStateMachine.js`
↳ `src/gateway/fakeGateway.js`
↳ `src/middleware/idempotency.js`, `src/middleware/errorHandler.js`
↳ `src/repositories/payment.repository.js`, `src/repositories/idempotency.repository.js`, `src/repositories/event.repository.js`
↳ `src/utils/signature.js`, `src/utils/ApiError.js`, `src/utils/asyncHandler.js`
:::

::: code json payment-system/package.json
{
  "name": "payment-system",
  "version": "1.0.0",
  "private": true,
  "description": "Payment system LLD: state machine, idempotency keys, signed webhooks, reconciliation",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": { "express": "^4.19.2" }
}
:::

::: code javascript payment-system/src/index.js
// Run: npm install && npm start
const { createApp } = require('./app');
const config = require('./config');

const { app } = createApp();
app.listen(config.port, () => console.log(`Payments API on http://localhost:${config.port}`));
:::

::: code javascript payment-system/src/config.js
const port = Number(process.env.PORT) || 3005;

module.exports = {
  port,
  webhookUrl: process.env.WEBHOOK_URL || `http://localhost:${port}/api/webhooks/gateway`, // where the fake gateway calls us
  webhookSecret: process.env.WEBHOOK_SECRET || 'whsec_dev_only_change_me',               // shared secret for HMAC
  webhookDelayMs: Number(process.env.WEBHOOK_DELAY_MS) || 1500,                          // gateway "thinking" time
  webhookToleranceSec: 300,                                                              // reject old (replayed) webhooks
};
:::

::: code javascript payment-system/src/app.js
const express = require('express');
const config = require('./config');
const { PaymentRepository } = require('./repositories/payment.repository');
const { IdempotencyRepository } = require('./repositories/idempotency.repository');
const { EventRepository } = require('./repositories/event.repository');
const { FakeGateway } = require('./gateway/fakeGateway');
const { PaymentService } = require('./services/payment.service');
const { PaymentController } = require('./controllers/payment.controller');
const { WebhookController } = require('./controllers/webhook.controller');
const { buildPaymentRoutes } = require('./routes/payment.routes');
const { buildWebhookRoutes } = require('./routes/webhook.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const payments = new PaymentRepository();
  const idempotency = new IdempotencyRepository();
  const events = new EventRepository();
  const gateway = new FakeGateway({ webhookUrl: config.webhookUrl, secret: config.webhookSecret, delayMs: config.webhookDelayMs });
  const service = new PaymentService({ payments, events, gateway });

  const app = express();
  // Keep the raw body: webhook signatures are computed over the exact bytes received
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', buildPaymentRoutes(new PaymentController(service), idempotency));
  app.use('/api/webhooks', buildWebhookRoutes(new WebhookController({ service, events, secret: config.webhookSecret, toleranceSec: config.webhookToleranceSec })));
  app.use(notFound);
  app.use(errorHandler);
  return { app, service };
}

module.exports = { createApp };
:::

::: code javascript payment-system/src/routes/payment.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { idempotency } = require('../middleware/idempotency');

function buildPaymentRoutes(controller, idempotencyRepo) {
  const router = express.Router();
  const idem = idempotency(idempotencyRepo);
  router.post('/payments', idem, asyncHandler((req, res) => controller.create(req, res)));
  router.get('/payments/:id', asyncHandler((req, res) => controller.get(req, res)));
  router.post('/payments/:id/refund', idem, asyncHandler((req, res) => controller.refund(req, res)));
  router.post('/admin/reconcile', asyncHandler((req, res) => controller.reconcile(req, res)));
  return router;
}

module.exports = { buildPaymentRoutes };
:::

::: code javascript payment-system/src/routes/webhook.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildWebhookRoutes(controller) {
  const router = express.Router();
  router.post('/gateway', asyncHandler((req, res) => controller.handle(req, res)));
  return router;
}

module.exports = { buildWebhookRoutes };
:::

::: code javascript payment-system/src/middleware/idempotency.js
// Idempotency-Key handling (like Stripe): same key → same stored response, never a second charge.
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

function idempotency(repo) {
  return async function idempotencyMiddleware(req, res, next) {
    try {
      const key = req.get('Idempotency-Key');
      if (!key) throw ApiError.badRequest('Idempotency-Key header is required');
      const scope = `${req.method} ${req.baseUrl}${req.path}:${key}`;          // keys are scoped per endpoint
      const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');

      const existing = await repo.get(scope);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ApiError(422, 'Idempotency-Key was already used with a different request body');
        }
        if (existing.status === 'in_progress') throw ApiError.conflict('A request with this Idempotency-Key is still in progress');
        res.set('Idempotent-Replayed', 'true');
        return res.status(existing.responseStatus).json(existing.responseBody);   // replay, do NOT run again
      }

      await repo.start(scope, requestHash);                                       // lock the key
      const originalJson = res.json.bind(res);
      res.json = (body) => {                                                      // capture the response
        if (res.statusCode < 500) repo.finish(scope, res.statusCode, body);       // store successes AND 4xx
        else repo.remove(scope);                                                  // 5xx → allow a retry
        return originalJson(body);
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { idempotency };
:::

::: code javascript payment-system/src/controllers/payment.controller.js
const ApiError = require('../utils/ApiError');

const CURRENCIES = new Set(['INR', 'USD', 'EUR']);

class PaymentController {
  constructor(service) {
    this.service = service;
  }

  async create(req, res) {
    const { orderId, amount, currency, cardToken } = req.body || {};
    if (!orderId || typeof orderId !== 'string') throw ApiError.badRequest('"orderId" is required');
    if (!Number.isInteger(amount) || amount <= 0) throw ApiError.badRequest('"amount" must be a positive integer in minor units (e.g. 4999 = 49.99)');
    if (!CURRENCIES.has(currency)) throw ApiError.badRequest(`"currency" must be one of ${[...CURRENCIES].join(', ')}`);
    if (!cardToken || typeof cardToken !== 'string') throw ApiError.badRequest('"cardToken" is required (we never accept raw card numbers)');
    const payment = await this.service.createPayment({ orderId, amount, currency, cardToken });
    res.status(payment.status === 'FAILED' ? 402 : 202).json(payment); // 402 Payment Required for declines
  }

  async get(req, res) {
    res.json(await this.service.getWithAudit(req.params.id));
  }

  async refund(req, res) {
    res.json(await this.service.refund(req.params.id));
  }

  async reconcile(req, res) {
    res.json(await this.service.reconcile());
  }
}

module.exports = { PaymentController };
:::

::: code javascript payment-system/src/controllers/webhook.controller.js
// Gateway → us. Verify the signature, ignore duplicates, apply the result.
const ApiError = require('../utils/ApiError');
const { verifySignature } = require('../utils/signature');

class WebhookController {
  constructor({ service, events, secret, toleranceSec }) {
    Object.assign(this, { service, events, secret, toleranceSec });
  }

  async handle(req, res) {
    const ok = verifySignature({
      payload: req.rawBody || '',
      timestamp: req.get('x-timestamp'),
      signature: req.get('x-signature'),
      secret: this.secret,
      toleranceSec: this.toleranceSec,
    });
    if (!ok) throw ApiError.badRequest('Invalid webhook signature');   // could be an attacker

    const event = req.body;
    if (await this.events.isProcessed(event.id)) {
      return res.json({ received: true, duplicate: true });            // gateways retry webhooks: be idempotent
    }
    await this.service.applyGatewayEvent(event);
    await this.events.markProcessed(event.id);
    res.json({ received: true });                                      // 2xx tells the gateway "stop retrying"
  }
}

module.exports = { WebhookController };
:::

::: code javascript payment-system/src/services/payment.service.js
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { assertTransition } = require('../domain/paymentStateMachine');

class PaymentService {
  constructor({ payments, events, gateway }) {
    Object.assign(this, { payments, events, gateway });
  }

  async createPayment({ orderId, amount, currency, cardToken }) {
    const now = new Date().toISOString();
    const payment = await this.payments.insert({
      id: `pay_${crypto.randomUUID().slice(0, 8)}`,
      orderId, amount, currency,
      status: 'INITIATED',
      gatewayChargeId: null, failureReason: null,
      createdAt: now, updatedAt: now,
    });
    await this.events.audit(payment.id, null, 'INITIATED', 'created');

    try {
      const charge = await this.gateway.charge({ paymentId: payment.id, amount, currency, cardToken });
      await this.payments.update(payment.id, { gatewayChargeId: charge.id });
      return this.#transition(payment.id, 'PROCESSING', 'accepted by gateway');
    } catch (err) {
      // the gateway rejected the request outright (e.g. invalid token): it's final
      return this.#transition(payment.id, 'FAILED', err.message, { failureReason: err.message });
    }
  }

  async applyGatewayEvent(event) {
    const payment = await this.payments.findById(event.data.paymentId);
    if (!payment) throw ApiError.notFound('Unknown payment in webhook');
    if (event.type === 'payment.succeeded') return this.#transition(payment.id, 'SUCCEEDED', `webhook ${event.id}`);
    if (event.type === 'payment.failed') return this.#transition(payment.id, 'FAILED', `webhook ${event.id}`, { failureReason: event.data.reason });
    return payment;                                    // unknown event types are ignored (but acknowledged)
  }

  async refund(id) {
    const payment = await this.#get(id);
    if (payment.status !== 'SUCCEEDED') throw ApiError.conflict(`Only SUCCEEDED payments can be refunded (status is ${payment.status})`);
    await this.gateway.refund({ chargeId: payment.gatewayChargeId, amount: payment.amount });
    return this.#transition(id, 'REFUNDED', 'refund requested');
  }

  /** For payments stuck in PROCESSING (lost webhook), ask the gateway directly. */
  async reconcile() {
    const stuck = await this.payments.findByStatus('PROCESSING');
    let updated = 0;
    for (const p of stuck) {
      const charge = await this.gateway.getCharge(p.gatewayChargeId);
      if (charge.status === 'succeeded') { await this.#transition(p.id, 'SUCCEEDED', 'reconciliation'); updated++; }
      if (charge.status === 'failed') { await this.#transition(p.id, 'FAILED', 'reconciliation', { failureReason: charge.reason }); updated++; }
    }
    return { checked: stuck.length, updated };
  }

  async getWithAudit(id) {
    const payment = await this.#get(id);
    return { ...payment, audit: await this.events.auditTrail(id) };
  }

  async #get(id) {
    const payment = await this.payments.findById(id);
    if (!payment) throw ApiError.notFound('Payment not found');
    return payment;
  }

  async #transition(id, to, reason, extra = {}) {
    const payment = await this.#get(id);
    if (payment.status === to) return payment;              // already there (late duplicate) → no-op
    assertTransition(payment.status, to);                   // throws 409 on illegal moves
    const updated = await this.payments.update(id, { ...extra, status: to, updatedAt: new Date().toISOString() });
    await this.events.audit(id, payment.status, to, reason);
    return updated;
  }
}

module.exports = { PaymentService };
:::

::: code javascript payment-system/src/domain/paymentStateMachine.js
// All legal status changes in one table. Anything else is a bug or an attack.
const ApiError = require('../utils/ApiError');

const TRANSITIONS = {
  INITIATED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  REFUNDED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) throw ApiError.conflict(`Illegal payment transition ${from} → ${to}`);
}

module.exports = { TRANSITIONS, canTransition, assertTransition };
:::

::: code javascript payment-system/src/gateway/fakeGateway.js
// Simulates a Stripe-like gateway: accepts a charge, decides later, calls our webhook with a signature.
const crypto = require('crypto');
const { sign } = require('../utils/signature');

class FakeGateway {
  constructor({ webhookUrl, secret, delayMs }) {
    Object.assign(this, { webhookUrl, secret, delayMs });
    this.charges = new Map();                        // chargeId → { status, reason, paymentId }
  }

  async charge({ paymentId, amount, cardToken }) {
    if (!cardToken.startsWith('tok_')) throw new Error('Invalid card token');
    const id = `ch_${crypto.randomUUID().slice(0, 8)}`;
    const outcome = cardToken === 'tok_decline' ? { status: 'failed', reason: 'card_declined' } : { status: 'succeeded', reason: null };
    this.charges.set(id, { ...outcome, paymentId, amount, settled: false });

    setTimeout(() => {                               // the decision arrives later, asynchronously
      const charge = this.charges.get(id);
      charge.settled = true;
      if (cardToken === 'tok_no_webhook') return;    // simulate a webhook that never arrives
      const event = {
        id: `evt_${crypto.randomUUID().slice(0, 8)}`,
        type: outcome.status === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
        data: { paymentId, chargeId: id, reason: outcome.reason },
      };
      this.#sendWebhook(event);
      if (cardToken === 'tok_duplicate_webhook') setTimeout(() => this.#sendWebhook(event), 200); // gateways DO resend
    }, this.delayMs);

    return { id, status: 'pending' };
  }

  async getCharge(chargeId) {
    const charge = this.charges.get(chargeId);
    if (!charge || !charge.settled) return { id: chargeId, status: 'pending' };
    return { id: chargeId, status: charge.status, reason: charge.reason };
  }

  async refund({ chargeId }) {
    const charge = this.charges.get(chargeId);
    if (!charge || charge.status !== 'succeeded') throw new Error('Charge cannot be refunded');
    charge.status = 'refunded';
    return { id: `re_${crypto.randomUUID().slice(0, 8)}`, chargeId };
  }

  async #sendWebhook(event) {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-timestamp': timestamp, 'x-signature': sign(body, timestamp, this.secret) },
        body,
      });
      console.log(`gateway → webhook ${event.type} ${event.id}: ${res.status}`);
    } catch (err) {
      console.error('webhook delivery failed (a real gateway would retry):', err.message);
    }
  }
}

module.exports = { FakeGateway };
:::

::: code javascript payment-system/src/utils/signature.js
// HMAC-SHA256 webhook signatures: signature = hmac(secret, `${timestamp}.${body}`).
const crypto = require('crypto');

function sign(body, timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function verifySignature({ payload, timestamp, signature, secret, toleranceSec = 300 }) {
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;          // too old → possible replay attack
  const expected = Buffer.from(sign(payload, timestamp, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received); // constant-time compare
}

module.exports = { sign, verifySignature };
:::

::: code javascript payment-system/src/repositories/payment.repository.js
class PaymentRepository {
  constructor() {
    this.byId = new Map();
  }
  async insert(payment) {
    this.byId.set(payment.id, { ...payment });
    return { ...payment };
  }
  async findById(id) {
    const p = this.byId.get(id);
    return p ? { ...p } : null;
  }
  async findByStatus(status) {
    return [...this.byId.values()].filter((p) => p.status === status).map((p) => ({ ...p }));
  }
  async update(id, changes) {
    const p = this.byId.get(id);
    Object.assign(p, changes);
    return { ...p };
  }
}

module.exports = { PaymentRepository };
:::

::: code javascript payment-system/src/repositories/idempotency.repository.js
// Stores the outcome of each idempotent request (production: a DB table with a unique key + TTL ~24 h).
class IdempotencyRepository {
  constructor() {
    this.records = new Map();
  }
  async get(key) {
    return this.records.get(key) || null;
  }
  async start(key, requestHash) {
    this.records.set(key, { key, requestHash, status: 'in_progress', createdAt: Date.now() });
  }
  async finish(key, responseStatus, responseBody) {
    const rec = this.records.get(key);
    if (rec) Object.assign(rec, { status: 'done', responseStatus, responseBody });
  }
  async remove(key) {
    this.records.delete(key);
  }
}

module.exports = { IdempotencyRepository };
:::

::: code javascript payment-system/src/repositories/event.repository.js
// Processed webhook ids (dedupe) + the append-only audit log of status changes.
class EventRepository {
  constructor() {
    this.processed = new Set();
    this.auditLog = [];
  }
  async isProcessed(eventId) {
    return this.processed.has(eventId);
  }
  async markProcessed(eventId) {
    this.processed.add(eventId);
  }
  async audit(paymentId, from, to, reason) {
    this.auditLog.push({ paymentId, from, to, reason, at: new Date().toISOString() });
  }
  async auditTrail(paymentId) {
    return this.auditLog.filter((e) => e.paymentId === paymentId);
  }
}

module.exports = { EventRepository };
:::

::: code javascript payment-system/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
  static badRequest(message) { return new ApiError(400, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript payment-system/src/utils/asyncHandler.js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript payment-system/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message } });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: idempotency, state machine and duplicate webhooks (runnable)
// Core rules without HTTP: an idempotency store, the transition table and webhook de-duplication.
const TRANSITIONS = { INITIATED: ['PROCESSING', 'FAILED'], PROCESSING: ['SUCCEEDED', 'FAILED'], SUCCEEDED: ['REFUNDED'], FAILED: [], REFUNDED: [] };
const payments = new Map(), idem = new Map(), seenEvents = new Set();
let charges = 0, nextId = 1;

function transition(id, to) {
  const p = payments.get(id);
  if (p.status === to) return p;                               // duplicate → no-op
  if (!TRANSITIONS[p.status].includes(to)) throw new Error(`Illegal ${p.status} → ${to}`);
  p.status = to;
  return p;
}
function createPayment(key, body) {
  const hash = JSON.stringify(body);
  const prev = idem.get(key);
  if (prev) { if (prev.hash !== hash) return { status: 422 }; return { ...prev.response, replayed: true }; }
  const id = 'pay_' + nextId++;
  payments.set(id, { id, ...body, status: 'INITIATED' });
  charges++;                                                   // the gateway is called exactly once
  transition(id, 'PROCESSING');
  const response = { status: 202, id };
  idem.set(key, { hash, response });
  return response;
}
function webhook(event) {
  if (seenEvents.has(event.id)) return 'duplicate';
  seenEvents.add(event.id);
  transition(event.paymentId, event.type === 'payment.succeeded' ? 'SUCCEEDED' : 'FAILED');
  return 'processed';
}

// ---------- tests ----------
const body = { orderId: 'o1', amount: 4999, currency: 'INR' };
const first = createPayment('key-1', body);
const second = createPayment('key-1', body);                   // double click
console.log('double click → one charge, same id →', charges, second.id, charges === 1 && second.id === first.id && second.replayed ? '✅' : '❌ FAIL');
console.log('same key, different body → 422 →', createPayment('key-1', { ...body, amount: 1 }).status === 422 ? '✅' : '❌ FAIL');
const evt = { id: 'evt_1', type: 'payment.succeeded', paymentId: first.id };
console.log('webhook →', webhook(evt), payments.get(first.id).status === 'SUCCEEDED' ? '✅' : '❌ FAIL');
console.log('same webhook again →', webhook(evt), '✅ ignored');
try { transition(first.id, 'FAILED'); console.log('❌ FAIL'); } catch (e) { console.log('SUCCEEDED → FAILED rejected:', e.message, '✅'); }
console.log('refund →', transition(first.id, 'REFUNDED').status === 'REFUNDED' ? '✅' : '❌ FAIL');
console.log('money as integers: 0.1 + 0.2 =', 0.1 + 0.2, 'vs 10 + 20 =', 10 + 20, 'paise ✅');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd payment-system && npm install && npm start` → `Payments API on http://localhost:3005`
2. **Pay** (successful card token):
`curl -s -X POST http://localhost:3005/api/payments -H "Content-Type: application/json" -H "Idempotency-Key: order-1001-attempt-1" -d '{"orderId":"1001","amount":4999,"currency":"INR","cardToken":"tok_success"}'`
→ **202** `{"id":"pay_ab12cd34","status":"PROCESSING",…}`. About 1.5 s later the server logs `gateway → webhook payment.succeeded evt_…: 200`.
3. **Double click** (same command again) → the same body with header `Idempotent-Replayed: true`, and no second charge.
4. **Same key, different amount** → **422** `Idempotency-Key was already used with a different request body`.
5. **Status + audit trail**: `curl -s http://localhost:3005/api/payments/<id>` → `"status":"SUCCEEDED","audit":[INITIATED, PROCESSING, SUCCEEDED…]`.
6. **Declined card**: `cardToken":"tok_decline"` with a new key → **202 PROCESSING**, then the webhook makes it `FAILED` with `"failureReason":"card_declined"`.
7. **Refund**: `curl -s -X POST http://localhost:3005/api/payments/<id>/refund -H "Idempotency-Key: refund-<id>"` → `"status":"REFUNDED"`; refunding a FAILED payment → **409**.
8. **Lost webhook + reconciliation**: pay with `tok_no_webhook`, wait 2 s (status stays `PROCESSING`), then `curl -s -X POST http://localhost:3005/api/admin/reconcile` → `{"checked":1,"updated":1}` and the payment is `SUCCEEDED`.
9. **Duplicate webhook**: pay with `tok_duplicate_webhook` → the log shows two webhook calls, the second returns `{"received":true,"duplicate":true}`.
10. **Forged webhook**: `curl -s -X POST http://localhost:3005/api/webhooks/gateway -H "Content-Type: application/json" -d '{"id":"evt_x","type":"payment.succeeded","data":{"paymentId":"pay_x"}}'` → **400** `Invalid webhook signature`.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Result delivery | Synchronous response from the gateway | **Webhooks (async)** + reconciliation | Webhooks: 3-D Secure, UPI and bank transfers are async anyway |
| Duplicate protection | Disable the button in the UI | **Idempotency keys on the server** | Both; the server is the real guarantee |
| Where to store idempotency | Memory (demo) | DB table with unique key + TTL | DB, in the same transaction as the payment if possible |
| Source of truth | Our database | **The gateway** | Gateway; reconcile our DB against it |
| Amounts | Float (`49.99`) | **Integer minor units (`4999`)** | Integers (floats can't represent 0.1 exactly) |
| Webhook auth | IP allow-list | **HMAC signature + timestamp** | Signature (+ allow-list as defence in depth) |
:::

::: text 📈 Scaling & edge cases
- **Exactly-once effects**: store the payment, the idempotency record and the audit entry in **one DB transaction**; use the **outbox pattern** to publish "payment succeeded" events to other services reliably.
- **Timeouts**: if the gateway call times out you don't know if the card was charged: mark `PROCESSING` and let the webhook/reconciliation decide. Never blindly retry a charge without the same idempotency key at the gateway.
- **Concurrency**: two webhooks for the same payment at once → use optimistic locking (`version` field) or row locks.
- **Fraud & limits**: velocity checks, 3-D Secure, amount limits per user.
- **Compliance**: never log card data or full tokens; PCI scope is minimised by using gateway-hosted fields.
- **Partial refunds / multi-currency**: refunds as separate records; store currency with every amount.
:::

::: warning ⚠️ Common mistakes
- Treating the HTTP response from the gateway as final, and ignoring webhooks.
- No idempotency → double clicks or client retries charge twice.
- Not verifying webhook signatures → anyone can mark orders as paid.
- Updating status without a state machine (e.g. `REFUNDED → SUCCEEDED` after a late webhook).
- Floats for money; missing currency.
:::

::: understand
- Payments are a lesson in **unreliable distributed systems**: retries, duplicates, timeouts and late messages. The tools are idempotency keys, state machines, signatures, dedupe tables and reconciliation.
- The same patterns apply to any external side effect: sending SMS, creating shipments, booking tickets.
:::

::: important ⭐ How to present this design in 5 minutes
> "The client calls POST /payments with an Idempotency-Key; a middleware stores the first response for that key and replays it for retries, and rejects the same key with a different body. The service records the payment as INITIATED, calls the gateway with a card token (never raw card data), and moves to PROCESSING. The final result arrives through a webhook, which I authenticate with an HMAC signature and timestamp, de-duplicate by event id, and apply through a state machine that only allows legal transitions like PROCESSING to SUCCEEDED or SUCCEEDED to REFUNDED. Amounts are integers in minor units, every change goes to an audit log, and a reconciliation job asks the gateway about payments stuck in PROCESSING because webhooks can be lost."
:::

::: links
Stripe: idempotent requests | https://docs.stripe.com/api/idempotent_requests
Stripe: verify webhook signatures | https://docs.stripe.com/webhooks#verify-events
Martin Fowler: Money pattern (integers) | https://martinfowler.com/eaaCatalog/money.html
microservices.io: transactional outbox | https://microservices.io/patterns/data/transactional-outbox.html
:::

=== Design an E-commerce Order System
@p 2
@tags lld, ecommerce, orders, inventory
@quick
- Modules: **Product**, **Cart**, **Inventory**, **Order**, **Payment**; flow: cart → checkout → **reserve stock** → pay → confirm (or release stock).
- Order **state machine**: `PENDING_PAYMENT → CONFIRMED → SHIPPED → DELIVERED`, cancel allowed before shipping.
- **Snapshot prices** into order items (later price changes don't affect old orders); money in integer minor units.
- Prevent overselling with an **atomic conditional decrement** (`stock >= qty`) or reservations; **compensate** (release stock) if payment fails: a mini **saga**.
- Idempotent checkout (Idempotency-Key) so a double click doesn't create two orders.

::: text 🧒 In simple words
An order system is what happens behind the "Place order" button on Amazon or Flipkart. Your cart holds what you want; at checkout the shop must make sure the items are **really in stock**, **hold them for you** while you pay, take the payment, and only then confirm the order. If payment fails, the held items go back on the shelf. It's like a **restaurant reserving your table**: the table is held for a while; if you don't show up (don't pay), it's released for someone else.
:::

::: text 📋 Requirements
### Functional
- Browse products; add/remove cart items; view the cart total.
- Checkout: validate the cart, reserve stock, charge the payment, create an order.
- Order lifecycle: confirm, ship, deliver, cancel (before shipping, with stock returned).
- Never sell more items than are in stock.

### Non-functional
- Correct under concurrency: two buyers can't both get the last item.
- Checkout is idempotent (double clicks, retries).
- Order history is immutable: prices and names are copied into the order.

### Assumptions
- The user is identified by an `x-user-id` header (auth is covered in the Authentication design).
- In-memory repositories; a fake payment service decides by token (`tok_success` / `tok_decline`).
- Single currency (INR), amounts in paise.
:::

::: ask
- *"How many products and orders per day? Flash sales?"* (Contention on hot items.)
- *"Reserve stock when added to cart, or only at checkout?"*
- *"Guest checkout? Multiple sellers/warehouses?"*
- *"Partial shipments, returns, refunds?"*
- *"Payment synchronous or async (webhooks)?"* (See the Payment System design.)
:::

::: diagram High-level architecture
flowchart LR
  U["Shopper"] --> API["Express API"]
  API --> CS["CartService"]
  API --> OS["OrderService (checkout saga)"]
  OS --> INV["InventoryService (reserve / release / commit)"]
  OS --> PAY["PaymentService (fake gateway)"]
  OS --> SM["OrderStateMachine"]
  CS --> CR[("carts")]
  INV --> PR[("products + stock")]
  OS --> OR[("orders")]
:::

::: diagram Class diagram
classDiagram
  class Product {
    +id string
    +name string
    +price number
    +stock number
  }
  class Cart {
    +userId string
    +items CartItem[]
  }
  class Order {
    +id string
    +userId string
    +items OrderItem[]
    +total number
    +status string
  }
  class CartService {
    +getCart(userId) Cart
    +addItem(userId, productId, qty) Cart
    +removeItem(userId, productId) Cart
  }
  class InventoryService {
    +reserve(items) void
    +release(items) void
  }
  class OrderService {
    +checkout(userId, paymentToken) Order
    +cancel(userId, orderId) Order
    +ship(orderId) Order
  }
  class PaymentService {
    +charge(amount, token) Charge
    +refund(chargeId) void
  }
  CartService --> Cart
  OrderService --> CartService
  OrderService --> InventoryService
  OrderService --> PaymentService
  OrderService --> Order
  InventoryService --> Product
:::

::: diagram Sequence: checkout with a declined payment (compensation)
sequenceDiagram
  participant U as Shopper
  participant OS as OrderService
  participant INV as Inventory
  participant PAY as Payment
  U->>OS: POST /orders/checkout (tok_decline)
  OS->>OS: load cart, snapshot prices, total
  OS->>INV: reserve(items)
  INV-->>OS: ok (stock decremented)
  OS->>OS: order PENDING_PAYMENT
  OS->>PAY: charge(total, token)
  PAY-->>OS: declined
  OS->>INV: release(items) (compensation)
  OS->>OS: order CANCELLED
  OS-->>U: 402 Payment declined (cart kept)
:::

::: image E-commerce order system: cart, checkout saga with stock reservation, payment and order states
/images/backend-lld/ecommerce-order.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `CartService` | Add/remove items, validate product and quantity, compute totals from current prices |
| `InventoryService` | `reserve(items)`: all-or-nothing conditional decrement; `release(items)`: put stock back |
| `PaymentService` | Fake gateway: `charge` and `refund` |
| `OrderService` | Checkout saga (snapshot → reserve → create order → pay → confirm or compensate), cancel, ship, deliver |
| `orderStateMachine` | Legal transitions only |
| `currentUser` middleware | Reads `x-user-id` (stand-in for real authentication) |

### Data model
`Product { id, name, price, stock }` · `Cart { userId, items: [{ productId, qty }] }`
`Order { id, userId, items: [{ productId, name, unitPrice, qty, lineTotal }], total, status, chargeId, createdAt, history: [{ status, at }] }`

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/products` | – | **200** products |
| GET | `/api/cart` | – | **200** `{ items, total }` |
| POST | `/api/cart/items` | `{ productId, qty }` | **200** cart; 400 bad qty; 404 product |
| DELETE | `/api/cart/items/:productId` | – | **200** cart |
| POST | `/api/orders/checkout` | `{ paymentToken }` + optional `Idempotency-Key` | **201** order `CONFIRMED`; **402** declined; **409** out of stock; 400 empty cart |
| GET | `/api/orders/:id` | – | **200** order (own orders only) |
| POST | `/api/orders/:id/cancel` | – | **200** `CANCELLED` (refund + stock back); 409 if shipped |
| POST | `/api/orders/:id/ship` | – | **200** `SHIPPED` |
:::

::: text 📁 Folder structure
`ecommerce-orders/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/shop.routes.js`, `src/routes/order.routes.js`
↳ `src/controllers/shop.controller.js`, `src/controllers/order.controller.js`
↳ `src/services/cart.service.js`, `src/services/inventory.service.js`, `src/services/order.service.js`, `src/services/payment.service.js`
↳ `src/domain/orderStateMachine.js`
↳ `src/repositories/product.repository.js`, `src/repositories/cart.repository.js`, `src/repositories/order.repository.js`
↳ `src/middleware/currentUser.js`, `src/middleware/errorHandler.js`
↳ `src/utils/ApiError.js`, `src/utils/asyncHandler.js`
:::

::: code json ecommerce-orders/package.json
{
  "name": "ecommerce-orders",
  "version": "1.0.0",
  "private": true,
  "description": "E-commerce order system LLD: cart, stock reservation, checkout saga, order state machine",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": { "express": "^4.19.2" }
}
:::

::: code javascript ecommerce-orders/src/index.js
// Run: npm install && npm start
const { createApp } = require('./app');
const config = require('./config');

const { app } = createApp();
app.listen(config.port, () => console.log(`Shop API on http://localhost:${config.port}`));
:::

::: code javascript ecommerce-orders/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 3006,
  maxQtyPerItem: 10,           // business rule: at most 10 of one product per order
};
:::

::: code javascript ecommerce-orders/src/app.js
const express = require('express');
const config = require('./config');
const { ProductRepository } = require('./repositories/product.repository');
const { CartRepository } = require('./repositories/cart.repository');
const { OrderRepository } = require('./repositories/order.repository');
const { CartService } = require('./services/cart.service');
const { InventoryService } = require('./services/inventory.service');
const { PaymentService } = require('./services/payment.service');
const { OrderService } = require('./services/order.service');
const { ShopController } = require('./controllers/shop.controller');
const { OrderController } = require('./controllers/order.controller');
const { buildShopRoutes } = require('./routes/shop.routes');
const { buildOrderRoutes } = require('./routes/order.routes');
const { currentUser } = require('./middleware/currentUser');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const products = new ProductRepository();
  const carts = new CartRepository();
  const orders = new OrderRepository();
  const cartService = new CartService({ carts, products, maxQtyPerItem: config.maxQtyPerItem });
  const inventory = new InventoryService({ products });
  const payments = new PaymentService();
  const orderService = new OrderService({ cartService, inventory, payments, orders, products });

  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', currentUser, buildShopRoutes(new ShopController({ products, cartService })));
  app.use('/api/orders', currentUser, buildOrderRoutes(new OrderController(orderService)));
  app.use(notFound);
  app.use(errorHandler);
  return { app, orderService };
}

module.exports = { createApp };
:::

::: code javascript ecommerce-orders/src/middleware/currentUser.js
// Stand-in for authentication: the user id comes from a header. (See the Authentication Service design.)
const ApiError = require('../utils/ApiError');

function currentUser(req, res, next) {
  if (req.path === '/products') return next();          // browsing products is public
  const userId = req.get('x-user-id');
  if (!userId) return next(new ApiError(401, 'x-user-id header is required'));
  req.userId = userId;
  next();
}

module.exports = { currentUser };
:::

::: code javascript ecommerce-orders/src/routes/shop.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildShopRoutes(controller) {
  const router = express.Router();
  router.get('/products', asyncHandler((req, res) => controller.listProducts(req, res)));
  router.get('/cart', asyncHandler((req, res) => controller.getCart(req, res)));
  router.post('/cart/items', asyncHandler((req, res) => controller.addItem(req, res)));
  router.delete('/cart/items/:productId', asyncHandler((req, res) => controller.removeItem(req, res)));
  return router;
}

module.exports = { buildShopRoutes };
:::

::: code javascript ecommerce-orders/src/routes/order.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildOrderRoutes(controller) {
  const router = express.Router();
  router.post('/checkout', asyncHandler((req, res) => controller.checkout(req, res)));
  router.get('/:id', asyncHandler((req, res) => controller.get(req, res)));
  router.post('/:id/cancel', asyncHandler((req, res) => controller.cancel(req, res)));
  router.post('/:id/ship', asyncHandler((req, res) => controller.ship(req, res)));
  router.post('/:id/deliver', asyncHandler((req, res) => controller.deliver(req, res)));
  return router;
}

module.exports = { buildOrderRoutes };
:::

::: code javascript ecommerce-orders/src/controllers/shop.controller.js
const ApiError = require('../utils/ApiError');

class ShopController {
  constructor({ products, cartService }) {
    this.products = products;
    this.cartService = cartService;
  }
  async listProducts(req, res) {
    res.json(await this.products.findAll());
  }
  async getCart(req, res) {
    res.json(await this.cartService.getCart(req.userId));
  }
  async addItem(req, res) {
    const { productId, qty } = req.body || {};
    if (!productId || !Number.isInteger(qty) || qty < 1) throw ApiError.badRequest('"productId" and an integer "qty" ≥ 1 are required');
    res.json(await this.cartService.addItem(req.userId, productId, qty));
  }
  async removeItem(req, res) {
    res.json(await this.cartService.removeItem(req.userId, req.params.productId));
  }
}

module.exports = { ShopController };
:::

::: code javascript ecommerce-orders/src/controllers/order.controller.js
const ApiError = require('../utils/ApiError');

class OrderController {
  constructor(orderService) {
    this.orderService = orderService;
  }
  async checkout(req, res) {
    const { paymentToken } = req.body || {};
    if (!paymentToken) throw ApiError.badRequest('"paymentToken" is required');
    const order = await this.orderService.checkout(req.userId, paymentToken, req.get('Idempotency-Key'));
    res.status(201).json(order);
  }
  async get(req, res) {
    res.json(await this.orderService.getForUser(req.userId, req.params.id));
  }
  async cancel(req, res) {
    res.json(await this.orderService.cancel(req.userId, req.params.id));
  }
  async ship(req, res) {
    res.json(await this.orderService.advance(req.params.id, 'SHIPPED'));   // in real life: admin/warehouse only
  }
  async deliver(req, res) {
    res.json(await this.orderService.advance(req.params.id, 'DELIVERED'));
  }
}

module.exports = { OrderController };
:::

::: code javascript ecommerce-orders/src/services/cart.service.js
const ApiError = require('../utils/ApiError');

class CartService {
  constructor({ carts, products, maxQtyPerItem }) {
    Object.assign(this, { carts, products, maxQtyPerItem });
  }

  async getCart(userId) {
    const cart = await this.carts.get(userId);
    const lines = [];
    for (const item of cart.items) {
      const p = await this.products.findById(item.productId);
      if (p) lines.push({ productId: p.id, name: p.name, unitPrice: p.price, qty: item.qty, lineTotal: p.price * item.qty });
    }
    return { userId, items: lines, total: lines.reduce((sum, l) => sum + l.lineTotal, 0) }; // integer paise
  }

  async addItem(userId, productId, qty) {
    const product = await this.products.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');
    const cart = await this.carts.get(userId);
    const line = cart.items.find((i) => i.productId === productId);
    const newQty = (line ? line.qty : 0) + qty;
    if (newQty > this.maxQtyPerItem) throw ApiError.badRequest(`At most ${this.maxQtyPerItem} of one product`);
    if (line) line.qty = newQty;
    else cart.items.push({ productId, qty });
    await this.carts.save(cart);
    return this.getCart(userId);
  }

  async removeItem(userId, productId) {
    const cart = await this.carts.get(userId);
    cart.items = cart.items.filter((i) => i.productId !== productId);
    await this.carts.save(cart);
    return this.getCart(userId);
  }

  async clear(userId) {
    await this.carts.save({ userId, items: [] });
  }
}

module.exports = { CartService };
:::

::: code javascript ecommerce-orders/src/services/inventory.service.js
// All-or-nothing stock reservation. In MongoDB each line is an atomic conditional update:
// products.updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } }) and you check modifiedCount.
const ApiError = require('../utils/ApiError');

class InventoryService {
  constructor({ products }) {
    this.products = products;
  }

  async reserve(items) {
    const done = [];
    for (const item of items) {
      const ok = await this.products.decrementIfAvailable(item.productId, item.qty); // atomic check-and-decrement
      if (!ok) {
        await this.release(done);                       // undo what we already reserved
        const p = await this.products.findById(item.productId);
        throw ApiError.conflict(`Not enough stock for "${p ? p.name : item.productId}"`);
      }
      done.push(item);
    }
  }

  async release(items) {
    for (const item of items) await this.products.increment(item.productId, item.qty);
  }
}

module.exports = { InventoryService };
:::

::: code javascript ecommerce-orders/src/services/payment.service.js
// Fake payment gateway (see the Payment System design for webhooks and idempotency at the gateway).
const crypto = require('crypto');

class PaymentService {
  async charge(amount, token) {
    await new Promise((r) => setTimeout(r, 50));            // network latency
    if (token === 'tok_decline') return { ok: false, reason: 'card_declined' };
    return { ok: true, chargeId: `ch_${crypto.randomUUID().slice(0, 8)}`, amount };
  }
  async refund(chargeId) {
    return { refunded: true, chargeId };
  }
}

module.exports = { PaymentService };
:::

::: code javascript ecommerce-orders/src/services/order.service.js
// The checkout "saga": each step has a compensating action if a later step fails.
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { assertTransition } = require('../domain/orderStateMachine');

class OrderService {
  constructor({ cartService, inventory, payments, orders }) {
    Object.assign(this, { cartService, inventory, payments, orders });
  }

  async checkout(userId, paymentToken, idempotencyKey) {
    if (idempotencyKey) {
      const existing = await this.orders.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return existing;                                  // double click → same order
    }
    const cart = await this.cartService.getCart(userId);
    if (!cart.items.length) throw ApiError.badRequest('Cart is empty');

    // 1) Snapshot: copy names and prices so later price changes don't alter this order
    const items = cart.items.map(({ productId, name, unitPrice, qty, lineTotal }) => ({ productId, name, unitPrice, qty, lineTotal }));

    // 2) Reserve stock (throws 409 if any item is short; nothing stays reserved)
    await this.inventory.reserve(items);

    // 3) Create the order in PENDING_PAYMENT
    const now = new Date().toISOString();
    let order = await this.orders.insert({
      id: `ord_${crypto.randomUUID().slice(0, 8)}`,
      userId, items, total: cart.total, status: 'PENDING_PAYMENT', chargeId: null,
      idempotencyKey: idempotencyKey || null, createdAt: now, history: [{ status: 'PENDING_PAYMENT', at: now }],
    });

    // 4) Pay; on failure compensate (release stock) and cancel
    const charge = await this.payments.charge(order.total, paymentToken);
    if (!charge.ok) {
      await this.inventory.release(items);
      order = await this.#move(order.id, 'CANCELLED', { cancelReason: charge.reason });
      throw new ApiError(402, `Payment declined (${charge.reason}). Your cart was kept.`, { orderId: order.id });
    }

    // 5) Confirm and empty the cart
    order = await this.#move(order.id, 'CONFIRMED', { chargeId: charge.chargeId });
    await this.cartService.clear(userId);
    return order;
  }

  async getForUser(userId, id) {
    const order = await this.orders.findById(id);
    if (!order || order.userId !== userId) throw ApiError.notFound('Order not found'); // don't leak other users' orders
    return order;
  }

  async cancel(userId, id) {
    const order = await this.getForUser(userId, id);
    assertTransition(order.status, 'CANCELLED');                     // 409 if already shipped
    if (order.chargeId) await this.payments.refund(order.chargeId);
    await this.inventory.release(order.items);                       // stock goes back on the shelf
    return this.#move(id, 'CANCELLED', { cancelReason: 'cancelled_by_user' });
  }

  async advance(id, to) {
    const order = await this.orders.findById(id);
    if (!order) throw ApiError.notFound('Order not found');
    return this.#move(id, to);
  }

  async #move(id, to, extra = {}) {
    const order = await this.orders.findById(id);
    assertTransition(order.status, to);
    const history = [...order.history, { status: to, at: new Date().toISOString() }];
    return this.orders.update(id, { ...extra, status: to, history });
  }
}

module.exports = { OrderService };
:::

::: code javascript ecommerce-orders/src/domain/orderStateMachine.js
const ApiError = require('../utils/ApiError');

const TRANSITIONS = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(from, to) {
  if (!(TRANSITIONS[from] || []).includes(to)) throw ApiError.conflict(`Cannot move order from ${from} to ${to}`);
}

module.exports = { TRANSITIONS, assertTransition };
:::

::: code javascript ecommerce-orders/src/repositories/product.repository.js
// Seeded catalogue. Prices in paise (₹499.00 = 49900).
class ProductRepository {
  constructor() {
    this.products = new Map(
      [
        { id: 'p1', name: 'Mechanical keyboard', price: 349900, stock: 5 },
        { id: 'p2', name: 'USB-C cable', price: 49900, stock: 100 },
        { id: 'p3', name: 'Limited edition mug', price: 89900, stock: 1 },
      ].map((p) => [p.id, p])
    );
  }
  async findAll() {
    return [...this.products.values()].map((p) => ({ ...p }));
  }
  async findById(id) {
    const p = this.products.get(id);
    return p ? { ...p } : null;
  }
  // check + decrement in one synchronous step: no other request can run in between (single Node thread)
  async decrementIfAvailable(id, qty) {
    const p = this.products.get(id);
    if (!p || p.stock < qty) return false;
    p.stock -= qty;
    return true;
  }
  async increment(id, qty) {
    const p = this.products.get(id);
    if (p) p.stock += qty;
  }
}

module.exports = { ProductRepository };
:::

::: code javascript ecommerce-orders/src/repositories/cart.repository.js
class CartRepository {
  constructor() {
    this.carts = new Map();
  }
  async get(userId) {
    const cart = this.carts.get(userId) || { userId, items: [] };
    return { userId, items: cart.items.map((i) => ({ ...i })) };
  }
  async save(cart) {
    this.carts.set(cart.userId, { userId: cart.userId, items: cart.items.map((i) => ({ ...i })) });
  }
}

module.exports = { CartRepository };
:::

::: code javascript ecommerce-orders/src/repositories/order.repository.js
class OrderRepository {
  constructor() {
    this.orders = new Map();
  }
  async insert(order) {
    this.orders.set(order.id, structuredClone(order));
    return structuredClone(order);
  }
  async findById(id) {
    const o = this.orders.get(id);
    return o ? structuredClone(o) : null;
  }
  async findByIdempotencyKey(userId, key) {
    for (const o of this.orders.values()) if (o.userId === userId && o.idempotencyKey === key && o.status !== 'CANCELLED') return structuredClone(o);
    return null;
  }
  async update(id, changes) {
    const o = this.orders.get(id);
    Object.assign(o, structuredClone(changes));
    return structuredClone(o);
  }
}

module.exports = { OrderRepository };
:::

::: code javascript ecommerce-orders/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
  static badRequest(message) { return new ApiError(400, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript ecommerce-orders/src/utils/asyncHandler.js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript ecommerce-orders/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message, details: err.details } });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: last item race, compensation and state machine (runnable)
// Inventory + checkout saga in plain JS. Two shoppers race for the last mug.
const stock = { mug: 1, cable: 10 };
const TRANSITIONS = { PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
function reserve(items) {
  const done = [];
  for (const it of items) {
    if (stock[it.id] < it.qty) { done.forEach((d) => (stock[d.id] += d.qty)); return false; } // all-or-nothing
    stock[it.id] -= it.qty; done.push(it);
  }
  return true;
}
const release = (items) => items.forEach((it) => (stock[it.id] += it.qty));
const move = (order, to) => { if (!TRANSITIONS[order.status].includes(to)) throw new Error(`${order.status} → ${to}`); order.status = to; return order; };
async function checkout(items, token) {
  if (!reserve(items)) return { status: 409 };
  const order = { status: 'PENDING_PAYMENT', items };
  await new Promise((r) => setTimeout(r, 10));                      // payment takes time
  if (token === 'tok_decline') { release(items); move(order, 'CANCELLED'); return { status: 402, order }; }
  return { status: 201, order: move(order, 'CONFIRMED') };
}

// ---------- tests ----------
(async () => {
  const [a, b] = await Promise.all([checkout([{ id: 'mug', qty: 1 }], 'tok_success'), checkout([{ id: 'mug', qty: 1 }], 'tok_success')]);
  console.log('two buyers, one mug →', a.status, b.status, [a.status, b.status].sort().join() === '201,409' && stock.mug === 0 ? '✅ no overselling' : '❌ FAIL');
  const declined = await checkout([{ id: 'cable', qty: 3 }], 'tok_decline');
  console.log('declined payment →', declined.status, declined.order.status, 'stock back to', stock.cable, declined.status === 402 && stock.cable === 10 ? '✅' : '❌ FAIL');
  const partial = await checkout([{ id: 'cable', qty: 2 }, { id: 'mug', qty: 1 }], 'tok_success');
  console.log('mug sold out → whole order rejected, cable not held →', partial.status, stock.cable, partial.status === 409 && stock.cable === 10 ? '✅' : '❌ FAIL');
  const o = (await checkout([{ id: 'cable', qty: 1 }], 'tok_success')).order;
  move(o, 'SHIPPED');
  try { move(o, 'CANCELLED'); console.log('❌ FAIL'); } catch (e) { console.log('cannot cancel after shipping:', e.message, '✅'); }
})();
:::

::: text 🧪 How to run & test
1. Create the files, then `cd ecommerce-orders && npm install && npm start` → `Shop API on http://localhost:3006`
2. **Products**: `curl -s http://localhost:3006/api/products` → three products with prices in paise and stock.
3. **Add to cart**: `curl -s -X POST http://localhost:3006/api/cart/items -H "x-user-id: u1" -H "Content-Type: application/json" -d '{"productId":"p2","qty":2}'` → `{"userId":"u1","items":[{"productId":"p2","name":"USB-C cable","unitPrice":49900,"qty":2,"lineTotal":99800}],"total":99800}`
4. **Checkout**: `curl -s -X POST http://localhost:3006/api/orders/checkout -H "x-user-id: u1" -H "Idempotency-Key: chk-1" -H "Content-Type: application/json" -d '{"paymentToken":"tok_success"}'` → **201** `"status":"CONFIRMED"`, the cart is now empty and `p2` stock is 98.
5. **Declined payment**: add an item again, then checkout with `"paymentToken":"tok_decline"` → **402** `Payment declined (card_declined). Your cart was kept.` and the stock is unchanged.
6. **Last item race**: user u1 and u2 both add `p3` (stock 1); the first checkout → 201, the second → **409** `Not enough stock for "Limited edition mug"`.
7. **Cancel**: `curl -s -X POST http://localhost:3006/api/orders/<id>/cancel -H "x-user-id: u1"` → `"status":"CANCELLED"` and the stock goes back. After `/ship`, cancelling → **409** `Cannot move order from SHIPPED to CANCELLED`.
8. **Privacy**: `curl -s http://localhost:3006/api/orders/<u1's id> -H "x-user-id: u2"` → **404**.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| When to reserve stock | When added to cart | **At checkout** (with a payment time limit) | Checkout; carts are often abandoned |
| Preventing oversell | Read stock, then write (race!) | **Atomic conditional update** (`stock >= qty`) / DB transaction | Atomic update |
| Payment failure | Leave stock reserved | **Compensate: release stock**, cancel order | Saga with compensations |
| Order prices | Look up the current price later | **Snapshot into the order** | Snapshot (orders are legal records) |
| Consistency across services | Distributed transaction (2PC) | **Saga** (local transactions + compensations, events) | Saga in microservices |
| Flash sale on one hot item | Normal DB row | Pre-allocated stock in Redis / queue-based checkout | Redis/queue when contention is extreme |
:::

::: text 📈 Scaling & edge cases
- **Concurrency**: in MongoDB use `updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`; with several items use a transaction or the reserve/release saga shown here.
- **Abandoned reservations**: if payment is async, reserve with an expiry (e.g. 15 min) and release expired reservations with a scheduled job.
- **Microservices**: Order, Inventory and Payment become services that talk through events (OrderCreated → StockReserved → PaymentCompleted); use the outbox pattern so events aren't lost.
- **Read scale**: product catalogue cached/CDN; search in Elasticsearch.
- **Edge cases**: price changed between cart and checkout (show the new total), product deleted while in a cart, quantity limits, coupons and taxes, partial shipments and returns.
:::

::: warning ⚠️ Common mistakes
- "Check stock, then decrement" as two separate operations → two buyers both get the last item.
- Charging the card **before** reserving stock → you take money for items you can't ship.
- Forgetting to release stock when payment fails or the order is cancelled.
- Referencing live product prices from old orders.
- No idempotency on checkout → duplicate orders on double click.
:::

::: understand
- E-commerce checkout is the classic **saga**: a sequence of steps across resources where each step has an undo (compensation), because one big transaction across inventory, payments and shipping isn't practical.
- State machines keep the order lifecycle honest; snapshots keep history immutable.
:::

::: important ⭐ How to present this design in 5 minutes
> "I'd split it into Product, Cart, Inventory, Order and Payment modules. Checkout loads the cart and snapshots names and prices into order items, reserves stock all-or-nothing with an atomic conditional decrement so two buyers can't take the last item, creates the order as PENDING_PAYMENT, and charges the payment. If payment fails I compensate: release the stock and cancel the order, keeping the cart. If it succeeds I confirm and clear the cart. A state machine controls PENDING_PAYMENT to CONFIRMED, SHIPPED, DELIVERED or CANCELLED, and cancelling refunds and returns stock. Checkout takes an Idempotency-Key. At scale, Inventory and Payment become services connected by events in a saga, with reservation expiry for async payments."
:::

::: links
microservices.io: Saga pattern | https://microservices.io/patterns/data/saga.html
MongoDB: transactions | https://www.mongodb.com/docs/manual/core/transactions/
MongoDB: atomic updates with $inc | https://www.mongodb.com/docs/manual/reference/operator/update/inc/
:::

=== Design an Authentication Service (backend)
@p 3
@tags lld, auth, rbac, jwt
@quick
- Layers: `AuthController → AuthService → UserRepository / RefreshTokenRepository`, plus `PasswordService` and `TokenService`.
- Passwords: **slow salted hash** (scrypt / bcrypt / argon2), never plain or fast hashes; constant-time compare.
- **Short access token** (JWT, ~15 min, in memory) + **long refresh token** (random, stored **hashed**, httpOnly cookie) with **rotation + reuse detection**.
- **RBAC**: `authenticate` middleware → `requireRole('admin')`; 401 = not logged in, 403 = not allowed.
- Login **rate limiting / lockout**, generic error messages ("invalid email or password").

::: text 🧒 In simple words
Authentication answers **"who are you?"** and authorisation answers **"what are you allowed to do?"**. Think of a **concert**: at the entrance you show your ID once (login) and get a **wristband** (access token) that staff can check quickly all evening; it expires at midnight. You also get a **ticket stub** kept in a safe pocket (refresh token) that lets you get a new wristband without showing your ID again. VIP wristbands open backstage doors (roles). Every app with login (Gmail, Swiggy, your company dashboard) has this service.
:::

::: text 📋 Requirements
### Functional
- Register with email + password; log in; log out; get the current user (`/me`).
- Keep users logged in without asking for the password every 15 minutes (refresh tokens).
- Roles: `user` and `admin`; admin-only endpoints.

### Non-functional
- Passwords stored so that a database leak doesn't reveal them.
- Stolen access tokens are only useful for a short time; stolen refresh tokens are detected when reused.
- Brute-force protection on login.
- Stateless verification of access tokens (no DB call per request).

### Assumptions
- Node.js + Express, `jsonwebtoken` for JWTs, Node's built-in `crypto.scrypt` for hashing.
- In-memory repositories; one seeded admin (`admin@example.com` / `Admin#12345`).
- The SPA keeps the access token in memory and the refresh token in an **httpOnly** cookie.
:::

::: ask
- *"Web SPA, mobile app, or server-rendered pages?"* (Cookies vs tokens.)
- *"Social login / SSO (Google, OAuth2, OIDC)? MFA?"*
- *"How long should users stay logged in? 'Log out of all devices'?"*
- *"Which roles/permissions, and are they per organisation (multi-tenant)?"*
- *"Password rules, email verification, password reset?"*
:::

::: diagram High-level architecture
flowchart LR
  SPA["React SPA"] -->|"POST /auth/login"| AC["AuthController"]
  AC --> AS["AuthService"]
  AS --> PW["PasswordService (scrypt)"]
  AS --> TS["TokenService (JWT access + random refresh)"]
  AS --> UR[("users")]
  AS --> RR[("refresh tokens (hashed, family, revoked)")]
  SPA -->|"Authorization: Bearer access"| MW["authenticate middleware"]
  MW --> RB["requireRole('admin')"]
  RB --> H["protected route"]
:::

::: diagram Class diagram
classDiagram
  class AuthService {
    +register(email, password) User
    +login(email, password) Tokens
    +refresh(refreshToken) Tokens
    +logout(refreshToken) void
  }
  class PasswordService {
    +hash(password) string
    +verify(password, stored) boolean
  }
  class TokenService {
    +signAccess(user) string
    +verifyAccess(token) Claims
    +newRefreshToken() string
    +hashRefresh(token) string
  }
  class UserRepository {
    +findByEmail(email) User
    +findById(id) User
    +insert(user) User
  }
  class RefreshTokenRepository {
    +save(record) void
    +findByHash(hash) Record
    +revokeFamily(familyId) void
  }
  AuthService --> PasswordService
  AuthService --> TokenService
  AuthService --> UserRepository
  AuthService --> RefreshTokenRepository
:::

::: diagram Sequence: login, call an API, refresh with rotation
sequenceDiagram
  participant B as Browser (SPA)
  participant A as Auth API
  participant API as Protected API
  B->>A: POST /auth/login (email, password)
  A->>A: scrypt verify, create token family
  A-->>B: accessToken (JSON) + Set-Cookie refreshToken (httpOnly)
  B->>API: GET /me (Bearer accessToken)
  API-->>B: 200 user
  Note over B,API: 15 minutes later the access token expires
  B->>API: GET /me (expired token)
  API-->>B: 401 token expired
  B->>A: POST /auth/refresh (cookie)
  A->>A: hash matches, not used before: mark used, issue new pair
  A-->>B: new accessToken + new refresh cookie
:::

::: image Authentication service: login, access and refresh tokens, rotation and role checks
/images/backend-lld/auth-service.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `PasswordService` | `scrypt` with a random 16-byte salt per user; `timingSafeEqual` compare; format `scrypt$salt$hash` |
| `TokenService` | Signs/verifies **access JWTs** (`sub`, `role`, 15 min, HS256 secret); creates random refresh tokens and their SHA-256 hash |
| `AuthService` | Register, login, refresh with **rotation and reuse detection** (reuse → revoke the whole family), logout |
| `authenticate` | Reads `Authorization: Bearer`, verifies the JWT, sets `req.user` (401 otherwise) |
| `requireRole(...roles)` | 403 unless `req.user.role` is allowed |
| `loginRateLimit` | Locks an email+IP after 5 failures for 15 minutes |

### Data model
`User { id, email (unique, lowercase), passwordHash, role, createdAt }`
`RefreshToken { tokenHash, userId, familyId, expiresAt, usedAt, revokedAt }`; **never store the raw refresh token**.

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` | **201** `{ id, email, role }`; 409 email taken; 400 weak password |
| POST | `/api/auth/login` | `{ email, password }` | **200** `{ accessToken, expiresIn, user }` + `Set-Cookie: refreshToken` ; 401; 429 locked |
| POST | `/api/auth/refresh` | cookie `refreshToken` | **200** new `accessToken` + rotated cookie; 401 invalid / reused |
| POST | `/api/auth/logout` | cookie | **204**, cookie cleared, family revoked |
| GET | `/api/me` | `Authorization: Bearer` | **200** user; 401 |
| GET | `/api/admin/users` | Bearer (admin) | **200** users; 403 for non-admins |
:::

::: text 📁 Folder structure
`auth-service/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/auth.routes.js`, `src/routes/user.routes.js`
↳ `src/controllers/auth.controller.js`
↳ `src/services/auth.service.js`, `src/services/password.service.js`, `src/services/token.service.js`
↳ `src/repositories/user.repository.js`, `src/repositories/refreshToken.repository.js`
↳ `src/middleware/authenticate.js`, `src/middleware/requireRole.js`, `src/middleware/loginRateLimit.js`, `src/middleware/errorHandler.js`
↳ `src/validators/auth.validator.js`
↳ `src/utils/cookies.js`, `src/utils/ApiError.js`, `src/utils/asyncHandler.js`
:::

::: code json auth-service/package.json
{
  "name": "auth-service",
  "version": "1.0.0",
  "private": true,
  "description": "Authentication service LLD: scrypt passwords, JWT access tokens, rotating refresh tokens, RBAC",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}
:::

::: code javascript auth-service/src/index.js
// Run: npm install && JWT_SECRET=change-me-to-a-long-random-string npm start
const { createApp } = require('./app');
const config = require('./config');

createApp()
  .then((app) => app.listen(config.port, () => console.log(`Auth service on http://localhost:${config.port}`)))
  .catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript auth-service/src/config.js
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');

module.exports = {
  port: Number(process.env.PORT) || 3007,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me', // NEVER hard-code real secrets
  accessTokenTtlSec: 15 * 60,                    // 15 minutes
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,    // 7 days
  cookieSecure: isProd,                          // HTTPS-only cookies in production
  maxLoginFailures: 5,
  lockoutMs: 15 * 60 * 1000,
};
:::

::: code javascript auth-service/src/app.js
const express = require('express');
const config = require('./config');
const { UserRepository } = require('./repositories/user.repository');
const { RefreshTokenRepository } = require('./repositories/refreshToken.repository');
const { PasswordService } = require('./services/password.service');
const { TokenService } = require('./services/token.service');
const { AuthService } = require('./services/auth.service');
const { AuthController } = require('./controllers/auth.controller');
const { buildAuthRoutes } = require('./routes/auth.routes');
const { buildUserRoutes } = require('./routes/user.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

async function createApp() {
  const users = new UserRepository();
  const refreshTokens = new RefreshTokenRepository();
  const passwords = new PasswordService();
  const tokens = new TokenService({ secret: config.jwtSecret, accessTtlSec: config.accessTokenTtlSec });
  const auth = new AuthService({ users, refreshTokens, passwords, tokens, refreshTtlMs: config.refreshTokenTtlMs });

  // Seed one admin so RBAC can be tried immediately
  await auth.register('admin@example.com', 'Admin#12345', 'admin');

  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', buildAuthRoutes(new AuthController({ auth, config })));
  app.use('/api', buildUserRoutes({ tokens, users }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
:::

::: code javascript auth-service/src/routes/auth.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { loginRateLimit } = require('../middleware/loginRateLimit');
const config = require('../config');

function buildAuthRoutes(controller) {
  const router = express.Router();
  const limiter = loginRateLimit({ maxFailures: config.maxLoginFailures, lockoutMs: config.lockoutMs });
  router.post('/register', asyncHandler((req, res) => controller.register(req, res)));
  router.post('/login', limiter, asyncHandler((req, res) => controller.login(req, res)));
  router.post('/refresh', asyncHandler((req, res) => controller.refresh(req, res)));
  router.post('/logout', asyncHandler((req, res) => controller.logout(req, res)));
  return router;
}

module.exports = { buildAuthRoutes };
:::

::: code javascript auth-service/src/routes/user.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');

function buildUserRoutes({ tokens, users }) {
  const router = express.Router();
  const auth = authenticate(tokens);

  router.get('/me', auth, asyncHandler(async (req, res) => {
    const user = await users.findById(req.user.id);
    res.json(users.toPublic(user));
  }));

  router.get('/admin/users', auth, requireRole('admin'), asyncHandler(async (req, res) => {
    res.json((await users.findAll()).map((u) => users.toPublic(u)));
  }));

  return router;
}

module.exports = { buildUserRoutes };
:::

::: code javascript auth-service/src/controllers/auth.controller.js
// HTTP layer: validation, cookies, status codes. Business rules live in AuthService.
const { validateCredentials } = require('../validators/auth.validator');
const { parseCookies } = require('../utils/cookies');

const COOKIE = 'refreshToken';

class AuthController {
  constructor({ auth, config }) {
    this.auth = auth;
    this.config = config;
  }

  #setRefreshCookie(res, token) {
    res.cookie(COOKIE, token, {
      httpOnly: true,                       // JavaScript can't read it → safe from XSS token theft
      secure: this.config.cookieSecure,     // only over HTTPS in production
      sameSite: 'strict',                   // not sent on cross-site requests → CSRF protection
      path: '/api/auth',                    // only sent to the auth endpoints
      maxAge: this.config.refreshTokenTtlMs,
    });
  }

  async register(req, res) {
    const { email, password } = validateCredentials(req.body, { strict: true });
    const user = await this.auth.register(email, password);
    res.status(201).json(user);
  }

  async login(req, res) {
    const { email, password } = validateCredentials(req.body, { strict: false });
    try {
      const result = await this.auth.login(email, password);
      req.loginSucceeded();                                   // reset the failure counter
      this.#setRefreshCookie(res, result.refreshToken);
      res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
    } catch (err) {
      if (err.statusCode === 401) req.loginFailed();          // count the failure for lockout
      throw err;
    }
  }

  async refresh(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const result = await this.auth.refresh(token);
    this.#setRefreshCookie(res, result.refreshToken);         // rotation: a NEW refresh token every time
    res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
  }

  async logout(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    await this.auth.logout(token);
    res.clearCookie(COOKIE, { path: '/api/auth' });
    res.status(204).end();
  }
}

module.exports = { AuthController };
:::

::: code javascript auth-service/src/services/auth.service.js
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

class AuthService {
  constructor({ users, refreshTokens, passwords, tokens, refreshTtlMs }) {
    Object.assign(this, { users, refreshTokens, passwords, tokens, refreshTtlMs });
    this.dummyHashPromise = passwords.hash('dummy-password-for-timing');
  }

  async register(email, password, role = 'user') {
    if (await this.users.findByEmail(email)) throw ApiError.conflict('Email is already registered');
    const user = await this.users.insert({
      id: crypto.randomUUID(),
      email,
      passwordHash: await this.passwords.hash(password),
      role,
      createdAt: new Date().toISOString(),
    });
    return this.users.toPublic(user);
  }

  async login(email, password) {
    const user = await this.users.findByEmail(email);
    // Always run a hash comparison so "unknown email" and "wrong password" take the same time
    const stored = user ? user.passwordHash : await this.dummyHashPromise;
    const ok = await this.passwords.verify(password, stored);
    if (!user || !ok) throw new ApiError(401, 'Invalid email or password'); // never say which one was wrong
    return this.#issueTokens(user, crypto.randomUUID());                    // new login = new token family
  }

  async refresh(rawToken) {
    if (!rawToken) throw new ApiError(401, 'Missing refresh token');
    const record = await this.refreshTokens.findByHash(this.tokens.hashRefresh(rawToken));
    if (!record || record.revokedAt) throw new ApiError(401, 'Invalid refresh token');
    if (record.usedAt) {
      // A refresh token can be used ONCE. Seeing it again means it was stolen (or replayed):
      // revoke the whole family so both the thief and the user must log in again.
      await this.refreshTokens.revokeFamily(record.familyId);
      throw new ApiError(401, 'Refresh token reuse detected, please log in again');
    }
    if (new Date(record.expiresAt) <= new Date()) throw new ApiError(401, 'Refresh token expired');
    await this.refreshTokens.markUsed(record.tokenHash);
    const user = await this.users.findById(record.userId);
    if (!user) throw new ApiError(401, 'User no longer exists');
    return this.#issueTokens(user, record.familyId);                        // same family, new token
  }

  async logout(rawToken) {
    if (!rawToken) return;
    const record = await this.refreshTokens.findByHash(this.tokens.hashRefresh(rawToken));
    if (record) await this.refreshTokens.revokeFamily(record.familyId);
  }

  async #issueTokens(user, familyId) {
    const refreshToken = this.tokens.newRefreshToken();
    await this.refreshTokens.save({
      tokenHash: this.tokens.hashRefresh(refreshToken),   // store only the hash
      userId: user.id,
      familyId,
      expiresAt: new Date(Date.now() + this.refreshTtlMs).toISOString(),
      usedAt: null,
      revokedAt: null,
    });
    return {
      accessToken: this.tokens.signAccess(user),
      expiresIn: this.tokens.accessTtlSec,
      refreshToken,
      user: this.users.toPublic(user),
    };
  }
}

module.exports = { AuthService };
:::

::: code javascript auth-service/src/services/password.service.js
// Password hashing with scrypt (memory-hard, built into Node). bcrypt / argon2 are fine alternatives.
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

class PasswordService {
  async hash(password) {
    const salt = crypto.randomBytes(16);                        // unique salt → same password, different hash
    const derived = await scrypt(password, salt, KEY_LENGTH);   // deliberately slow to make guessing expensive
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  async verify(password, stored) {
    const [algorithm, saltHex, hashHex] = String(stored).split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(derived, expected);           // constant-time comparison
  }
}

module.exports = { PasswordService };
:::

::: code javascript auth-service/src/services/token.service.js
// Access tokens = signed JWTs (stateless). Refresh tokens = random strings stored as SHA-256 hashes.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class TokenService {
  constructor({ secret, accessTtlSec }) {
    this.secret = secret;
    this.accessTtlSec = accessTtlSec;
  }

  signAccess(user) {
    return jwt.sign({ sub: user.id, role: user.role }, this.secret, {
      algorithm: 'HS256',
      expiresIn: this.accessTtlSec,
      issuer: 'auth-service',
    });
  }

  verifyAccess(token) {
    // Pin the algorithm: never let the token choose ("alg: none" attacks)
    return jwt.verify(token, this.secret, { algorithms: ['HS256'], issuer: 'auth-service' });
  }

  newRefreshToken() {
    return crypto.randomBytes(32).toString('base64url');         // 256 bits of randomness, unguessable
  }

  hashRefresh(token) {
    return crypto.createHash('sha256').update(token).digest('hex'); // fast hash is fine: the token is random
  }
}

module.exports = { TokenService };
:::

::: code javascript auth-service/src/repositories/user.repository.js
class UserRepository {
  constructor() {
    this.byId = new Map();
  }
  async insert(user) {
    this.byId.set(user.id, { ...user });
    return { ...user };
  }
  async findByEmail(email) {
    const e = String(email).toLowerCase();
    for (const u of this.byId.values()) if (u.email === e) return { ...u };
    return null;
  }
  async findById(id) {
    const u = this.byId.get(id);
    return u ? { ...u } : null;
  }
  async findAll() {
    return [...this.byId.values()].map((u) => ({ ...u }));
  }
  toPublic(user) {
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt }; // never expose passwordHash
  }
}

module.exports = { UserRepository };
:::

::: code javascript auth-service/src/repositories/refreshToken.repository.js
// Refresh token records (hashes only). Production: a table/collection with a TTL index on expiresAt.
class RefreshTokenRepository {
  constructor() {
    this.byHash = new Map();
  }
  async save(record) {
    this.byHash.set(record.tokenHash, { ...record });
  }
  async findByHash(hash) {
    const r = this.byHash.get(hash);
    return r ? { ...r } : null;
  }
  async markUsed(hash) {
    const r = this.byHash.get(hash);
    if (r) r.usedAt = new Date().toISOString();
  }
  async revokeFamily(familyId) {
    const now = new Date().toISOString();
    for (const r of this.byHash.values()) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = now;
  }
}

module.exports = { RefreshTokenRepository };
:::

::: code javascript auth-service/src/middleware/authenticate.js
// Verifies "Authorization: Bearer <jwt>" and puts { id, role } on req.user.
const ApiError = require('../utils/ApiError');

function authenticate(tokens) {
  return function authenticateMiddleware(req, res, next) {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new ApiError(401, 'Missing Bearer token'));
    try {
      const claims = tokens.verifyAccess(token);
      req.user = { id: claims.sub, role: claims.role };
      next();
    } catch (err) {
      next(new ApiError(401, err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token'));
    }
  };
}

module.exports = { authenticate };
:::

::: code javascript auth-service/src/middleware/requireRole.js
// RBAC: 403 when the logged-in user's role isn't allowed. Use after authenticate.
const ApiError = require('../utils/ApiError');

function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Forbidden: insufficient role'));
    next();
  };
}

module.exports = { requireRole };
:::

::: code javascript auth-service/src/middleware/loginRateLimit.js
// Locks an (email, IP) pair after too many failed logins. Production: Redis-backed (shared by servers).
const ApiError = require('../utils/ApiError');

function loginRateLimit({ maxFailures, lockoutMs }) {
  const failures = new Map(); // key → { count, lockedUntil }

  return function loginRateLimitMiddleware(req, res, next) {
    const email = String((req.body && req.body.email) || '').toLowerCase();
    const key = `${email}|${req.ip}`;
    const entry = failures.get(key) || { count: 0, lockedUntil: 0 };
    if (entry.lockedUntil > Date.now()) {
      res.set('Retry-After', Math.ceil((entry.lockedUntil - Date.now()) / 1000));
      return next(new ApiError(429, 'Too many failed attempts, try again later'));
    }
    req.loginFailed = () => {
      entry.count += 1;
      if (entry.count >= maxFailures) { entry.lockedUntil = Date.now() + lockoutMs; entry.count = 0; }
      failures.set(key, entry);
    };
    req.loginSucceeded = () => failures.delete(key);
    next();
  };
}

module.exports = { loginRateLimit };
:::

::: code javascript auth-service/src/validators/auth.validator.js
const ApiError = require('../utils/ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body, { strict }) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('A valid "email" is required');
  if (!password) throw ApiError.badRequest('"password" is required');
  if (strict) {
    // registration rules (login doesn't reveal them)
    if (password.length < 10) throw ApiError.badRequest('Password must be at least 10 characters');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw ApiError.badRequest('Password needs letters and digits');
  }
  if (password.length > 200) throw ApiError.badRequest('Password is too long');
  return { email, password };
}

module.exports = { validateCredentials };
:::

::: code javascript auth-service/src/utils/cookies.js
// Minimal Cookie header parser (avoids an extra dependency). "a=1; b=2" → { a: '1', b: '2' }
function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name) out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

module.exports = { parseCookies };
:::

::: code javascript auth-service/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
  static badRequest(message) { return new ApiError(400, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript auth-service/src/utils/asyncHandler.js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript auth-service/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message } });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: refresh-token rotation and reuse detection + RBAC (runnable)
// The token bookkeeping without crypto libraries: random ids stand in for tokens.
const store = new Map();                       // tokenHash → { userId, familyId, used, revoked }
let counter = 0;
const newToken = () => 'rt_' + (++counter) + '_' + Math.random().toString(36).slice(2);
const hash = (t) => 'h(' + t + ')';            // stands in for SHA-256
function issue(userId, familyId) { const t = newToken(); store.set(hash(t), { userId, familyId, used: false, revoked: false }); return t; }
function refresh(token) {
  const r = store.get(hash(token));
  if (!r || r.revoked) return { status: 401, error: 'invalid' };
  if (r.used) { for (const x of store.values()) if (x.familyId === r.familyId) x.revoked = true; return { status: 401, error: 'reuse detected' }; }
  r.used = true;
  return { status: 200, refreshToken: issue(r.userId, r.familyId) };
}
const requireRole = (...roles) => (user) => (!user ? 401 : roles.includes(user.role) ? 200 : 403);

// ---------- tests ----------
const t1 = issue('u1', 'fam-1');                          // login
const r1 = refresh(t1);
console.log('first refresh works →', r1.status, r1.status === 200 ? '✅' : '❌ FAIL');
const r2 = refresh(r1.refreshToken);
console.log('rotated token works →', r2.status, r2.status === 200 ? '✅' : '❌ FAIL');
const stolen = refresh(t1);                               // attacker replays the OLD token
console.log('old token reused →', stolen.status, stolen.error, stolen.error === 'reuse detected' ? '✅' : '❌ FAIL');
const victim = refresh(r2.refreshToken);                  // even the latest token is now dead
console.log('whole family revoked →', victim.status, victim.status === 401 ? '✅' : '❌ FAIL');
const other = issue('u2', 'fam-2');
console.log('other users unaffected →', refresh(other).status === 200 ? '✅' : '❌ FAIL');
const adminOnly = requireRole('admin');
console.log('RBAC: no user 401, user 403, admin 200 →', adminOnly(null), adminOnly({ role: 'user' }), adminOnly({ role: 'admin' }),
  adminOnly(null) === 401 && adminOnly({ role: 'user' }) === 403 && adminOnly({ role: 'admin' }) === 200 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd auth-service && npm install && JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") npm start` → `Auth service on http://localhost:3007`
2. **Register**: `curl -s -X POST http://localhost:3007/api/auth/register -H "Content-Type: application/json" -d '{"email":"asha@example.com","password":"supersecret1"}'` → **201** `{"id":"…","email":"asha@example.com","role":"user",…}`. Weak password → **400**; same email → **409**.
3. **Login** (save cookies in a jar): `curl -s -c jar.txt -X POST http://localhost:3007/api/auth/login -H "Content-Type: application/json" -d '{"email":"asha@example.com","password":"supersecret1"}'` → `{"accessToken":"eyJ…","expiresIn":900,"user":{…}}`; `jar.txt` now has an httpOnly `refreshToken`.
4. **Call a protected route**: `curl -s http://localhost:3007/api/me -H "Authorization: Bearer <accessToken>"` → your user. Without the header → **401** `Missing Bearer token`.
5. **RBAC**: `curl -s http://localhost:3007/api/admin/users -H "Authorization: Bearer <asha's token>"` → **403**; log in as `admin@example.com` / `Admin#12345` and the same call → **200** list of users.
6. **Refresh with rotation**: `cp jar.txt old.txt; curl -s -b jar.txt -c jar.txt -X POST http://localhost:3007/api/auth/refresh` → a new access token and a new cookie.
7. **Reuse detection**: `curl -s -b old.txt -X POST http://localhost:3007/api/auth/refresh` → **401** `Refresh token reuse detected…`; now even `jar.txt` fails → log in again.
8. **Lockout**: 5 wrong passwords for the same email → the 6th attempt gets **429** with `Retry-After`.
9. **Logout**: `curl -s -i -b jar.txt -X POST http://localhost:3007/api/auth/logout` → **204** and the cookie is cleared.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Session state | **Server sessions** (session id cookie, store in Redis): easy revocation | **JWT access tokens**: stateless, no lookup per request | Sessions for classic web apps; short JWT + refresh for SPAs/mobile/microservices |
| Where the SPA keeps tokens | localStorage (readable by any XSS) | **Access token in memory, refresh token in httpOnly SameSite cookie** | Memory + httpOnly cookie |
| Password hash | bcrypt (widely used) | **scrypt / argon2id** (memory-hard) | Any slow, salted hash; never MD5/SHA for passwords |
| Refresh tokens | Long-lived, reusable | **Rotating, one-time use, reuse detection** | Rotation |
| JWT signing | HS256 (one shared secret) | RS256/ES256 (private key signs, public key verifies) | RS256 when many services verify tokens |
| Revoking access tokens | Wait until expiry (≤15 min) | Deny-list of token ids (`jti`) in Redis | Short TTL; deny-list only for emergencies |
| Identity | Build it yourself | Managed: Auth0, Cognito, Clerk, Keycloak | Managed for SSO/MFA/compliance-heavy products |
:::

::: text 📈 Scaling & edge cases
- **Many servers**: JWT verification needs only the secret/public key → no shared session store for access tokens; refresh-token records and lockout counters go to Redis/DB.
- **Microservices**: an API gateway verifies JWTs; services trust the `sub`/`role` claims; use RS256 and a JWKS endpoint for key rotation.
- **Security extras**: email verification, password reset with single-use expiring tokens, MFA (TOTP/WebAuthn), breached-password checks, audit log of logins.
- **CSRF**: refresh cookie is `SameSite=strict` and path-limited; state-changing APIs use the Bearer header (not cookies), so classic CSRF doesn't apply to them.
- **Edge cases**: email case ("Asha@x.com" vs "asha@x.com"), role changes while a token is valid (short TTL limits the window), deleted users with valid tokens, clock skew between servers (`clockTolerance`).
:::

::: warning ⚠️ Common mistakes
- Storing plain or SHA-256-hashed passwords (fast hashes are brute-forced on GPUs).
- Long-lived JWTs in localStorage (XSS steals them; you can't revoke them).
- Different errors for "no such email" and "wrong password" (user enumeration).
- Not pinning the JWT algorithm; putting secrets or personal data in the JWT payload (it's only base64, not encrypted).
- Returning `passwordHash` in API responses.
:::

::: understand
- Two separate questions: **authentication** (login, tokens) and **authorisation** (roles/permissions). Keep them in separate middleware.
- The access/refresh split balances **performance** (stateless checks) with **control** (revocable, rotating refresh tokens).
:::

::: important ⭐ How to present this design in 5 minutes
> "The auth service has a controller, an AuthService, and Password and Token services over user and refresh-token repositories. Passwords are hashed with a slow, salted algorithm like scrypt or bcrypt and compared in constant time; login errors are generic and failed attempts are rate-limited. A successful login returns a short-lived JWT access token, about 15 minutes, which the SPA keeps in memory, and sets a random refresh token in an httpOnly, SameSite cookie. We store only a hash of the refresh token. Every refresh rotates it; if an old token is used again we treat it as stolen and revoke the whole token family. Protected routes use an authenticate middleware, and requireRole adds RBAC: 401 when not logged in, 403 when not allowed. At scale refresh tokens and lockouts live in Redis, and services verify RS256 tokens via a public key."
:::

::: links
OWASP: Password Storage Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
OWASP: Authentication Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
Auth0: refresh token rotation | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
jwt.io: introduction to JWT | https://jwt.io/introduction
:::

=== Design a File Storage Service (S3)
@p 3
@tags lld, s3, files, permissions
@quick
- **Presigned URLs**: the API validates and signs; the **client uploads/downloads directly** to storage (S3), so big files never pass through Node.
- Flow: `POST /files` (metadata + validation) → `PUT` to the presigned URL → `POST /files/:id/complete` (verify the object exists, size/type match) → `GET /files/:id/download-url`.
- **Metadata in the DB** (owner, key, type, size, status), **bytes in object storage**; keys are random (`users/<id>/<uuid>`), never user-chosen paths.
- Permissions checked **before** signing; URLs expire quickly (minutes); buckets stay **private**.
- Provider interface (`LocalStorageProvider` / `S3StorageProvider`): swap storage without touching the service.

::: text 🧒 In simple words
A file storage service lets users upload profile photos, invoices or documents and download them later, safely. The trick used by Dropbox, Google Drive and almost every app on AWS: your server doesn't carry the heavy boxes itself. It's like a **warehouse with a reception desk**: the receptionist (your API) checks who you are and what you're bringing, then gives you a **one-time, time-limited door pass** (presigned URL); you carry the box straight into the warehouse (S3). To pick something up, the receptionist checks you're allowed and gives you another short-lived pass.
:::

::: text 📋 Requirements
### Functional
- Upload a file (images and PDFs, ≤ 10 MB); list my files; download; delete.
- Only the owner can download or delete (optionally share/public later).
- Uploads and downloads go directly to storage.

### Non-functional
- API servers don't buffer file bytes (memory/CPU stay low; uploads scale independently).
- Links can't be guessed or reused forever (random keys, expiring signed URLs).
- Storage provider can change (local disk in dev, S3 in production).

### Assumptions
- The user id comes from `x-user-id` (auth is the Authentication design).
- Default provider: **local disk with HMAC-signed URLs that behave like S3 presigned URLs**, so it runs without an AWS account. Set `S3_BUCKET` + AWS credentials to use real S3.
:::

::: ask
- *"Which file types and maximum size? Virus scanning?"*
- *"Private only, or sharing / public links?"*
- *"Do we need image thumbnails or other processing after upload?"*
- *"Expected volume and file sizes?"* (Multipart uploads for > 100 MB.)
- *"Retention / deletion requirements (GDPR)?"*
:::

::: diagram High-level architecture
flowchart LR
  C["React client"] -->|"1. POST /api/files (name, type, size)"| API["File API (Express)"]
  API --> FS["FileService (validate, permissions)"]
  FS --> DB[("files metadata")]
  FS --> SP["StorageProvider (Local or S3)"]
  SP -->|"presigned PUT URL"| API
  API -->|"2. uploadUrl"| C
  C -->|"3. PUT bytes directly"| ST[("Object storage: S3 / local disk")]
  C -->|"4. POST /api/files/:id/complete"| API
  C -->|"5. GET /api/files/:id/download-url"| API
  C -->|"6. GET signed URL"| ST
:::

::: diagram Class diagram
classDiagram
  class FileService {
    +requestUpload(userId, meta) UploadTicket
    +completeUpload(userId, id) File
    +getDownloadUrl(userId, id) string
    +list(userId) File[]
    +remove(userId, id) void
  }
  class StorageProvider {
    <<interface>>
    +createUploadUrl(key, contentType, size) string
    +createDownloadUrl(key, fileName) string
    +head(key) ObjectInfo
    +delete(key) void
  }
  class LocalStorageProvider
  class S3StorageProvider
  class FileRepository {
    +insert(file) File
    +findById(id) File
    +findByOwner(userId) File[]
    +update(id, changes) File
    +delete(id) void
  }
  FileService --> StorageProvider
  FileService --> FileRepository
  StorageProvider <|.. LocalStorageProvider
  StorageProvider <|.. S3StorageProvider
:::

::: diagram Sequence: upload and download with presigned URLs
sequenceDiagram
  participant C as Client
  participant API as File API
  participant S as Storage (S3)
  C->>API: POST /api/files (photo.png, image/png, 120 KB)
  API->>API: validate type and size, create record (pending)
  API-->>C: 201 (fileId, uploadUrl valid 5 min)
  C->>S: PUT uploadUrl (bytes, Content-Type image/png)
  S-->>C: 200
  C->>API: POST /api/files/:id/complete
  API->>S: HEAD object (exists? size?)
  API-->>C: 200 status ready
  C->>API: GET /api/files/:id/download-url
  API->>API: owner check
  API-->>C: url valid 60 s
  C->>S: GET url
  S-->>C: file bytes
:::

::: image File storage: the API signs, the client moves bytes directly to storage
/images/backend-lld/file-storage.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `FileService` | Validation (type allow-list, size limit, safe file name), random keys, status `pending → ready`, owner checks, signing via the provider |
| `StorageProvider` | `createUploadUrl`, `createDownloadUrl`, `head`, `delete`: the only code that knows S3 or the disk |
| `LocalStorageProvider` | Stores files under `./data/`; signed URLs = `HMAC(secret, method + key + expires + contentType)`, served by `local-storage.routes.js` |
| `S3StorageProvider` | Uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| `FileRepository` | Metadata records |

### Data model
`File { id, ownerId, key, originalName, contentType, size, status: pending | ready, createdAt }`

### API contract
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/files` | `{ fileName, contentType, size }` | **201** `{ file, uploadUrl, method: "PUT", headers, expiresIn }`; 400 type/size |
| POST | `/api/files/:id/complete` | – | **200** file `ready`; 409 object missing or size differs |
| GET | `/api/files` | – | **200** my files |
| GET | `/api/files/:id/download-url` | – | **200** `{ url, expiresIn }`; 404 if not mine / not ready |
| DELETE | `/api/files/:id` | – | **204** |
:::

::: text 📁 Folder structure
`file-storage/`
↳ `package.json`
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/routes/file.routes.js`, `src/routes/local-storage.routes.js`
↳ `src/controllers/file.controller.js`
↳ `src/services/file.service.js`
↳ `src/storage/index.js`, `src/storage/local.provider.js`, `src/storage/s3.provider.js`
↳ `src/repositories/file.repository.js`
↳ `src/validators/file.validator.js`
↳ `src/middleware/currentUser.js`, `src/middleware/errorHandler.js`
↳ `src/utils/ApiError.js`, `src/utils/asyncHandler.js`
:::

::: code json file-storage/package.json
{
  "name": "file-storage",
  "version": "1.0.0",
  "private": true,
  "description": "File storage LLD: presigned upload/download URLs, local or S3 provider, owner permissions",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.620.0",
    "@aws-sdk/s3-request-presigner": "^3.620.0",
    "express": "^4.19.2"
  }
}
:::

::: code javascript file-storage/src/index.js
// Run locally: npm install && npm start
// Use real S3: S3_BUCKET=my-bucket AWS_REGION=ap-south-1 npm start   (credentials from env/~/.aws or an IAM role)
const { createApp } = require('./app');
const config = require('./config');

const { app } = createApp();
app.listen(config.port, () => console.log(`File storage API on ${config.publicBaseUrl} (provider: ${config.s3Bucket ? 's3' : 'local'})`));
:::

::: code javascript file-storage/src/config.js
const port = Number(process.env.PORT) || 3008;

module.exports = {
  port,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`, // used in local signed URLs
  s3Bucket: process.env.S3_BUCKET || '',                                    // empty → local provider
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  localDir: process.env.LOCAL_STORAGE_DIR || './data',
  signingSecret: process.env.SIGNING_SECRET || 'dev-only-signing-secret',   // local provider only
  uploadUrlTtlSec: 300,       // 5 minutes to start the upload
  downloadUrlTtlSec: 60,      // 1 minute to start the download
  maxSizeBytes: 10 * 1024 * 1024,
  allowedTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
};
:::

::: code javascript file-storage/src/app.js
const express = require('express');
const config = require('./config');
const { createStorageProvider } = require('./storage');
const { FileRepository } = require('./repositories/file.repository');
const { FileService } = require('./services/file.service');
const { FileController } = require('./controllers/file.controller');
const { buildFileRoutes } = require('./routes/file.routes');
const { buildLocalStorageRoutes } = require('./routes/local-storage.routes');
const { currentUser } = require('./middleware/currentUser');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const storage = createStorageProvider(config);
  const files = new FileRepository();
  const service = new FileService({ storage, files, config });

  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  // The "object storage" endpoints exist only for the local provider (S3 serves its own URLs)
  if (!config.s3Bucket) app.use('/local-storage', buildLocalStorageRoutes({ storage, config }));
  app.use('/api/files', express.json(), currentUser, buildFileRoutes(new FileController(service)));
  app.use(notFound);
  app.use(errorHandler);
  return { app, service };
}

module.exports = { createApp };
:::

::: code javascript file-storage/src/routes/file.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');

function buildFileRoutes(controller) {
  const router = express.Router();
  router.post('/', asyncHandler((req, res) => controller.requestUpload(req, res)));
  router.get('/', asyncHandler((req, res) => controller.list(req, res)));
  router.post('/:id/complete', asyncHandler((req, res) => controller.complete(req, res)));
  router.get('/:id/download-url', asyncHandler((req, res) => controller.downloadUrl(req, res)));
  router.delete('/:id', asyncHandler((req, res) => controller.remove(req, res)));
  return router;
}

module.exports = { buildFileRoutes };
:::

::: code javascript file-storage/src/routes/local-storage.routes.js
// Plays the role of S3 for the local provider: accepts PUT/GET only with a valid, unexpired signature.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

function buildLocalStorageRoutes({ storage, config }) {
  const router = express.Router();

  router.put(
    '/*',
    express.raw({ type: () => true, limit: config.maxSizeBytes }),   // raw bytes, any content type
    asyncHandler(async (req, res) => {
      const key = req.params[0];
      const { expires, contentType, size, signature } = req.query;
      const ok = storage.verify({ method: 'PUT', key, expires, contentType, size, signature });
      if (!ok) throw new ApiError(403, 'Invalid or expired upload URL');
      if (req.get('Content-Type') !== contentType) throw new ApiError(403, 'Content-Type does not match the signed URL');
      if (req.body.length !== Number(size)) throw new ApiError(403, 'Body size does not match the signed size');
      await storage.writeObject(key, req.body, contentType);
      res.status(200).json({ stored: key });
    })
  );

  router.get(
    '/*',
    asyncHandler(async (req, res) => {
      const key = req.params[0];
      const { expires, fileName, signature } = req.query;
      if (!storage.verify({ method: 'GET', key, expires, fileName, signature })) throw new ApiError(403, 'Invalid or expired download URL');
      const { data, contentType } = await storage.readObject(key);
      res.set('Content-Type', contentType);
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`); // download, don't render
      res.send(data);
    })
  );

  return router;
}

module.exports = { buildLocalStorageRoutes };
:::

::: code javascript file-storage/src/controllers/file.controller.js
const { validateUploadRequest } = require('../validators/file.validator');
const config = require('../config');

class FileController {
  constructor(service) {
    this.service = service;
  }
  async requestUpload(req, res) {
    const meta = validateUploadRequest(req.body, config);
    res.status(201).json(await this.service.requestUpload(req.userId, meta));
  }
  async complete(req, res) {
    res.json(await this.service.completeUpload(req.userId, req.params.id));
  }
  async list(req, res) {
    res.json(await this.service.list(req.userId));
  }
  async downloadUrl(req, res) {
    res.json(await this.service.getDownloadUrl(req.userId, req.params.id));
  }
  async remove(req, res) {
    await this.service.remove(req.userId, req.params.id);
    res.status(204).end();
  }
}

module.exports = { FileController };
:::

::: code javascript file-storage/src/validators/file.validator.js
const ApiError = require('../utils/ApiError');

function validateUploadRequest(body, config) {
  const { fileName, contentType, size } = body || {};
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 200) throw ApiError.badRequest('"fileName" is required (max 200 chars)');
  if (!config.allowedTypes.includes(contentType)) throw ApiError.badRequest(`"contentType" must be one of ${config.allowedTypes.join(', ')}`);
  if (!Number.isInteger(size) || size <= 0) throw ApiError.badRequest('"size" must be a positive integer (bytes)');
  if (size > config.maxSizeBytes) throw ApiError.badRequest(`File too large (max ${config.maxSizeBytes / 1024 / 1024} MB)`);
  // keep only safe characters for display; the storage key is generated by us, never from the name
  const safeName = fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 200);
  return { fileName: safeName, contentType, size };
}

module.exports = { validateUploadRequest };
:::

::: code javascript file-storage/src/services/file.service.js
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

class FileService {
  constructor({ storage, files, config }) {
    Object.assign(this, { storage, files, config });
  }

  async requestUpload(userId, { fileName, contentType, size }) {
    const id = crypto.randomUUID();
    const key = `users/${userId}/${id}.${EXT[contentType]}`;     // random, server-chosen key (no path tricks)
    const file = await this.files.insert({
      id, ownerId: userId, key, originalName: fileName, contentType, size, status: 'pending', createdAt: new Date().toISOString(),
    });
    const uploadUrl = await this.storage.createUploadUrl({ key, contentType, size, expiresIn: this.config.uploadUrlTtlSec });
    return {
      file,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType },                    // the client must send exactly this
      expiresIn: this.config.uploadUrlTtlSec,
    };
  }

  async completeUpload(userId, id) {
    const file = await this.#getOwned(userId, id);
    if (file.status === 'ready') return file;                        // idempotent
    const info = await this.storage.head(file.key);
    if (!info) throw ApiError.conflict('Upload not found in storage yet');
    if (info.size !== file.size) throw ApiError.conflict(`Uploaded size ${info.size} does not match declared size ${file.size}`);
    return this.files.update(id, { status: 'ready', uploadedAt: new Date().toISOString() });
  }

  async getDownloadUrl(userId, id) {
    const file = await this.#getOwned(userId, id);
    if (file.status !== 'ready') throw ApiError.conflict('File upload is not complete');
    const url = await this.storage.createDownloadUrl({ key: file.key, fileName: file.originalName, expiresIn: this.config.downloadUrlTtlSec });
    return { url, expiresIn: this.config.downloadUrlTtlSec };
  }

  async list(userId) {
    return this.files.findByOwner(userId);
  }

  async remove(userId, id) {
    const file = await this.#getOwned(userId, id);
    await this.storage.delete(file.key);                            // delete bytes first…
    await this.files.delete(id);                                    // …then metadata
  }

  async #getOwned(userId, id) {
    const file = await this.files.findById(id);
    if (!file || file.ownerId !== userId) throw ApiError.notFound('File not found'); // 404, not 403: don't reveal it exists
    return file;
  }
}

module.exports = { FileService };
:::

::: code javascript file-storage/src/storage/index.js
// Chooses the storage provider. FileService only sees the common interface.
function createStorageProvider(config) {
  if (config.s3Bucket) {
    const { S3StorageProvider } = require('./s3.provider');
    return new S3StorageProvider({ bucket: config.s3Bucket, region: config.awsRegion });
  }
  const { LocalStorageProvider } = require('./local.provider');
  return new LocalStorageProvider({ dir: config.localDir, baseUrl: config.publicBaseUrl, secret: config.signingSecret });
}

module.exports = { createStorageProvider };
:::

::: code javascript file-storage/src/storage/local.provider.js
// Local disk "object storage" with HMAC-signed, expiring URLs (the same idea as S3 presigned URLs).
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

class LocalStorageProvider {
  constructor({ dir, baseUrl, secret }) {
    this.dir = path.resolve(dir);
    this.baseUrl = baseUrl;
    this.secret = secret;
  }

  #sign(parts) {
    return crypto.createHmac('sha256', this.secret).update(parts.join('\n')).digest('hex');
  }

  #pathFor(key) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(this.dir + path.sep)) throw new Error('Invalid key');   // block ../ path traversal
    return full;
  }

  async createUploadUrl({ key, contentType, size, expiresIn }) {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const signature = this.#sign(['PUT', key, expires, contentType, size]);
    const q = new URLSearchParams({ expires, contentType, size, signature });
    return `${this.baseUrl}/local-storage/${key}?${q}`;
  }

  async createDownloadUrl({ key, fileName, expiresIn }) {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const signature = this.#sign(['GET', key, expires, fileName]);
    const q = new URLSearchParams({ expires, fileName, signature });
    return `${this.baseUrl}/local-storage/${key}?${q}`;
  }

  verify({ method, key, expires, contentType, size, fileName, signature }) {
    if (!signature || !expires || Number(expires) < Math.floor(Date.now() / 1000)) return false; // expired
    const parts = method === 'PUT' ? ['PUT', key, expires, contentType, size] : ['GET', key, expires, fileName];
    const expected = Buffer.from(this.#sign(parts), 'hex');
    const given = Buffer.from(String(signature), 'hex');
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  async writeObject(key, data, contentType) {
    const file = this.#pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    await fs.writeFile(`${file}.meta.json`, JSON.stringify({ contentType, size: data.length }));
  }

  async readObject(key) {
    const file = this.#pathFor(key);
    const meta = JSON.parse(await fs.readFile(`${file}.meta.json`, 'utf8'));
    return { data: await fs.readFile(file), contentType: meta.contentType };
  }

  async head(key) {
    try {
      const meta = JSON.parse(await fs.readFile(`${this.#pathFor(key)}.meta.json`, 'utf8'));
      return { size: meta.size, contentType: meta.contentType };
    } catch {
      return null;                                                 // not uploaded (yet)
    }
  }

  async delete(key) {
    const file = this.#pathFor(key);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.meta.json`, { force: true });
  }
}

module.exports = { LocalStorageProvider };
:::

::: code javascript file-storage/src/storage/s3.provider.js
// Real S3 implementation of the same interface (AWS SDK v3).
// The bucket stays PRIVATE; access happens only through short-lived presigned URLs.
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3StorageProvider {
  constructor({ bucket, region }) {
    this.bucket = bucket;
    this.s3 = new S3Client({ region }); // credentials: env vars, ~/.aws, or the EC2/ECS IAM role (best)
  }

  async createUploadUrl({ key, contentType, size, expiresIn }) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size });
    return getSignedUrl(this.s3, command, { expiresIn });          // the client must send the same Content-Type
  }

  async createDownloadUrl({ key, fileName, expiresIn }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async head(key) {
    try {
      const out = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength, contentType: out.ContentType };
    } catch (err) {
      if (err.name === 'NotFound' || (err.$metadata && err.$metadata.httpStatusCode === 404)) return null;
      throw err;
    }
  }

  async delete(key) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

module.exports = { S3StorageProvider };
:::

::: code javascript file-storage/src/repositories/file.repository.js
class FileRepository {
  constructor() {
    this.byId = new Map();
  }
  async insert(file) {
    this.byId.set(file.id, { ...file });
    return { ...file };
  }
  async findById(id) {
    const f = this.byId.get(id);
    return f ? { ...f } : null;
  }
  async findByOwner(ownerId) {
    return [...this.byId.values()].filter((f) => f.ownerId === ownerId).map((f) => ({ ...f }));
  }
  async update(id, changes) {
    const f = this.byId.get(id);
    Object.assign(f, changes);
    return { ...f };
  }
  async delete(id) {
    this.byId.delete(id);
  }
}

module.exports = { FileRepository };
:::

::: code javascript file-storage/src/middleware/currentUser.js
const ApiError = require('../utils/ApiError');

// Stand-in for real authentication (see the Authentication Service design)
function currentUser(req, res, next) {
  const userId = req.get('x-user-id');
  if (!userId || !/^[\w-]{1,64}$/.test(userId)) return next(new ApiError(401, 'x-user-id header is required'));
  req.userId = userId;
  next();
}

module.exports = { currentUser };
:::

::: code javascript file-storage/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
  static badRequest(message) { return new ApiError(400, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
}

module.exports = ApiError;
:::

::: code javascript file-storage/src/utils/asyncHandler.js
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
:::

::: code javascript file-storage/src/middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  if (err.type === 'entity.parse.failed') status = 400;
  if (err.type === 'entity.too.large') status = 413;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal Server Error' : err.message } });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript Browser simulation: signed URLs, expiry, tampering and ownership (runnable)
// A tiny HMAC stand-in (NOT secure, just deterministic) so the signing logic can run in the browser.
const secret = 'demo-secret';
const fakeHmac = (text) => { let h = 2166136261; for (const ch of secret + '|' + text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
let nowSec = 1000;
function sign(method, key, expires, extra) { return fakeHmac([method, key, expires, extra].join('\n')); }
function createUploadUrl(key, contentType, ttl) { const expires = nowSec + ttl; return { key, expires, contentType, signature: sign('PUT', key, expires, contentType) }; }
function verifyUpload(u) { return u.expires >= nowSec && sign('PUT', u.key, u.expires, u.contentType) === u.signature; }

const files = new Map();
function requestUpload(userId, name, type, size) {
  if (!['image/png', 'application/pdf'].includes(type)) return { status: 400 };
  if (size > 10 * 1024 * 1024) return { status: 400 };
  const id = 'f' + (files.size + 1);
  files.set(id, { id, ownerId: userId, key: `users/${userId}/${id}`, status: 'pending' });
  return { status: 201, id, url: createUploadUrl(`users/${userId}/${id}`, type, 300) };
}
const download = (userId, id) => { const f = files.get(id); return !f || f.ownerId !== userId ? 404 : 200; };

// ---------- tests ----------
const ok = requestUpload('u1', 'photo.png', 'image/png', 120000);
console.log('valid request → 201 + signed URL →', ok.status, verifyUpload(ok.url) ? '✅' : '❌ FAIL');
console.log('wrong type → 400 →', requestUpload('u1', 'x.exe', 'application/x-msdownload', 10).status === 400 ? '✅' : '❌ FAIL');
console.log('too big → 400 →', requestUpload('u1', 'big.png', 'image/png', 50 * 1024 * 1024).status === 400 ? '✅' : '❌ FAIL');
console.log('tampered key rejected →', !verifyUpload({ ...ok.url, key: 'users/u2/f1' }) ? '✅' : '❌ FAIL');
console.log('tampered content type rejected →', !verifyUpload({ ...ok.url, contentType: 'text/html' }) ? '✅' : '❌ FAIL');
nowSec += 301;
console.log('expired URL rejected after 5 min →', !verifyUpload(ok.url) ? '✅' : '❌ FAIL');
console.log('owner can download, others get 404 →', download('u1', ok.id), download('u2', ok.id), download('u1', ok.id) === 200 && download('u2', ok.id) === 404 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd file-storage && npm install && npm start` → `File storage API on http://localhost:3008 (provider: local)`
2. Make a test file: `node -e "require('fs').writeFileSync('photo.png', Buffer.alloc(1234, 1))"` (1,234 bytes).
3. **Ask for an upload URL**: `curl -s -X POST http://localhost:3008/api/files -H "x-user-id: u1" -H "Content-Type: application/json" -d '{"fileName":"photo.png","contentType":"image/png","size":1234}'` → **201** `{"file":{"id":"…","status":"pending",…},"uploadUrl":"http://localhost:3008/local-storage/users/u1/<id>.png?expires=…&signature=…","method":"PUT","headers":{"Content-Type":"image/png"},"expiresIn":300}`
4. **Upload the bytes directly**: `curl -s -X PUT "<uploadUrl>" -H "Content-Type: image/png" --data-binary @photo.png` → `{"stored":"users/u1/<id>.png"}`. With a different Content-Type or a changed URL → **403**.
5. **Confirm**: `curl -s -X POST http://localhost:3008/api/files/<id>/complete -H "x-user-id: u1"` → `"status":"ready"`.
6. **Download**: `curl -s http://localhost:3008/api/files/<id>/download-url -H "x-user-id: u1"` → `{"url":"…","expiresIn":60}`; then `curl -s -o copy.png "<url>"` and `cmp photo.png copy.png` prints nothing (identical).
7. **Permissions**: the same download-url call with `-H "x-user-id: u2"` → **404** `File not found`.
8. **Validation**: `"contentType":"text/html"` → **400**; `"size":20000000` → **400** `File too large (max 10 MB)`.
9. **Delete**: `curl -s -i -X DELETE http://localhost:3008/api/files/<id> -H "x-user-id: u1"` → **204**.
10. **Real S3**: create a private bucket, set CORS to allow `PUT` from your frontend origin, then `S3_BUCKET=<bucket> AWS_REGION=<region> npm start`; the same flow now uses real presigned URLs.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Upload path | Client → Node (multer) → S3 | **Client → S3 via presigned URL** | Presigned for anything big; via Node only for tiny files or when you must inspect bytes first |
| Download | Stream through Node | **Presigned GET / CloudFront signed URL** | Presigned (no load on Node) |
| Public assets | Public bucket | **Private bucket + CloudFront (OAC)** | Private bucket; public only via CDN |
| Large files (> 100 MB) | Single PUT | **Multipart upload** (presigned parts) | Multipart: resumable, parallel |
| Confirming uploads | Trust the client | **`complete` + HEAD check**, or an S3 event → Lambda | Verify (HEAD or S3 event notification) |
| Store files in MongoDB? | GridFS / Buffer fields | **S3 + metadata in Mongo** | S3: cheaper, CDN-friendly, keeps the DB small (16 MB document limit) |
:::

::: text 📈 Scaling & edge cases
- **Throughput** scales with S3, not your API: the API only signs small requests.
- **Abandoned uploads**: `pending` records whose object never arrived → clean up with a scheduled job; S3 lifecycle rules delete incomplete multipart uploads.
- **Processing**: S3 event → queue → worker for thumbnails/virus scanning (see the Job Queue design); mark the file `ready` only after scanning.
- **Security**: content-type allow-list *and* checking magic bytes after upload, `Content-Disposition: attachment` for downloads, never use user input as the key, short URL lifetimes, least-privilege IAM role (only `s3:PutObject/GetObject/DeleteObject` on `users/*`).
- **Sharing**: add an ACL table (`fileId, userId, permission`) or signed public links with expiry.
- **Edge cases**: duplicate file names (random keys avoid clashes), Unicode names (`encodeURIComponent`), the client uploading a different size than declared (rejected by the signature/HEAD check).
:::

::: warning ⚠️ Common mistakes
- Streaming every upload through the Node server (memory spikes, slow, expensive).
- Public buckets "to make it easy" → data leaks.
- Using the user's file name as the S3 key (`../../`, overwrites, guessable paths).
- Long-lived presigned URLs (hours/days) that get shared around.
- Forgetting S3 CORS for browser uploads, or mismatched `Content-Type` between signing and uploading (signature errors).
:::

::: understand
- Separate **control plane** (your API: who may do what, metadata) from **data plane** (S3: the bytes). Presigned URLs connect them securely.
- The provider interface is the repository pattern for files: local disk in development, S3 in production, no service changes.
:::

::: important ⭐ How to present this design in 5 minutes
> "The API never carries the file bytes. The client asks POST /files with name, type and size; the service validates against an allow-list and a size limit, creates a pending metadata record with a random server-generated key, and returns a presigned PUT URL valid for a few minutes. The client uploads directly to a private S3 bucket, then calls complete; the service does a HEAD on the object to check it exists with the declared size and marks it ready. Downloads go through an owner check and a 60-second presigned GET. Metadata lives in the database, bytes in S3. Storage sits behind a provider interface, so locally it's disk with HMAC-signed URLs and in production S3. At scale I'd add multipart uploads, S3 events for virus scanning and thumbnails, CloudFront for delivery, and cleanup of abandoned uploads."
:::

::: links
AWS: presigned URLs for S3 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
AWS SDK v3: s3-request-presigner | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/
AWS: S3 multipart upload | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
OWASP: File Upload Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
:::

=== Design a Logging System
@p 2
@tags lld, logging, observability
@quick
- `Application → Logger → Transports (console, file, external service)`; each transport can have its own **minimum level**.
- **Levels**: `debug < info < warn < error`; production usually logs `info` and above.
- **Structured JSON logs** (`{ time, level, msg, requestId, … }`) so tools can search/filter, instead of plain strings.
- **Request ids** (header `x-request-id` + AsyncLocalStorage) tie every log line of one request together; **child loggers** add context.
- **Redact sensitive data** (passwords, tokens, card numbers); log errors with stacks; never let logging crash or block the app (buffer + batch + drop).

::: text 🧒 In simple words
Logs are the app's **flight recorder** (black box). When something goes wrong at 3 a.m., logs tell you what happened: which request, which user, which error. A good logging system writes each event as a structured record (like a form, not a diary sentence), labels how important it is (level), stamps it with a request id so you can follow one request's whole story, hides secrets, and sends copies to several places: your terminal, a file, and a central log service (Datadog, ELK, CloudWatch). Libraries like **pino** and **winston** do this; here we build a small one to understand the parts.
:::

::: text 📋 Requirements
### Functional
- `logger.debug/info/warn/error(message, fields)`; a minimum level from config.
- JSON output with timestamp, level, message, service name, request id and extra fields.
- Multiple transports: console (pretty in dev, JSON in prod), file (with size-based rotation), HTTP (batched to a collector).
- Child loggers that add fixed fields (`logger.child({ module: 'payments' })`).
- Automatic request id per HTTP request, request/response logging with duration.
- Redaction of sensitive keys at any depth.

### Non-functional
- Logging must not slow requests noticeably or crash the app if a transport fails.
- Bounded memory: if the collector is down, drop the oldest logs instead of growing forever.

### Assumptions
- Node.js + Express; no logging library (to learn the internals); the "external service" is a tiny collector included below.
:::

::: ask
- *"Where do logs go: stdout (containers), files, a managed service?"*
- *"What must never be logged?"* (PII, passwords, tokens, card data.)
- *"Retention period and volume per day?"* (Cost!)
- *"Do we also need metrics and traces (OpenTelemetry), or just logs?"*
- *"Can we drop logs under pressure, or must audit logs be guaranteed?"*
:::

::: diagram High-level architecture
flowchart LR
  R["HTTP request"] --> RID["requestId middleware (AsyncLocalStorage)"]
  RID --> H["Route handlers"]
  H --> L["Logger (levels, child bindings)"]
  RID --> RL["requestLogger (method, path, status, ms)"]
  RL --> L
  L --> RED["redact sensitive fields"]
  RED --> CT["ConsoleTransport"]
  RED --> FT["FileTransport (rotation)"]
  RED --> HT["HttpTransport (buffer, batch, retry)"]
  HT --> COL["Log collector (ELK / Datadog / demo collector)"]
:::

::: diagram Class diagram
classDiagram
  class Logger {
    -level
    -bindings
    -transports
    +debug(msg, fields) void
    +info(msg, fields) void
    +warn(msg, fields) void
    +error(msg, fields) void
    +child(bindings) Logger
  }
  class Transport {
    <<interface>>
    +minLevel
    +write(record) void
    +flush() Promise
  }
  class ConsoleTransport
  class FileTransport {
    -maxBytes
    +rotate() void
  }
  class HttpTransport {
    -buffer
    -batchSize
    +flush() Promise
  }
  Logger --> Transport
  Transport <|.. ConsoleTransport
  Transport <|.. FileTransport
  Transport <|.. HttpTransport
:::

::: diagram Sequence: one request through the logger
sequenceDiagram
  participant C as Client
  participant MW as requestId + requestLogger
  participant H as Handler
  participant LG as Logger
  participant T as Transports
  C->>MW: POST /api/login (x-request-id optional)
  MW->>MW: reuse or create requestId, start timer
  MW->>H: next()
  H->>LG: info "login attempt" (email, password)
  LG->>LG: add time, level, requestId, redact password
  LG->>T: write(record)
  H-->>MW: response 200
  MW->>LG: info "request completed" (status 200, durationMs 12)
  MW-->>C: 200 + x-request-id header
:::

::: image Logging system: logger with levels and redaction fanning out to console, file and HTTP transports
/images/backend-lld/logging-system.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `Logger` | Level filtering, building the record, merging child bindings + request context, redaction, fan-out to transports (errors in a transport are swallowed) |
| `context.js` | `AsyncLocalStorage` holding `{ requestId }` for the current request |
| `redact.js` | Deep copy with sensitive keys replaced by `"[REDACTED]"` |
| `ConsoleTransport` | Pretty, coloured lines in development, one JSON line per record in production |
| `FileTransport` | Appends JSON lines; rotates `app.log → app.log.1 …` when the file exceeds `maxBytes` |
| `HttpTransport` | Buffers records, sends batches every N ms or N records, retries once, drops the oldest when the buffer is full |
| `requestId` / `requestLogger` middleware | Assign/propagate `x-request-id`; log every request with status and duration |

### Log record
`{ time, level, msg, service, requestId, ...bindings, ...fields, err?: { name, message, stack } }`

### Demo API
| Method | Path | What it logs |
|---|---|---|
| GET | `/api/hello` | info + request log |
| POST | `/api/login` | info with the body (password/token redacted) |
| GET | `/api/slow` | warn when slower than 500 ms |
| GET | `/api/boom` | error with stack (500 response with the request id) |
:::

::: text 📁 Folder structure
`logging-system/`
↳ `package.json`
↳ `collector.js` (demo log collector)
↳ `src/index.js`, `src/app.js`, `src/config.js`
↳ `src/logger/index.js`, `src/logger/Logger.js`, `src/logger/levels.js`, `src/logger/redact.js`, `src/logger/context.js`
↳ `src/logger/transports/console.transport.js`, `src/logger/transports/file.transport.js`, `src/logger/transports/http.transport.js`
↳ `src/middleware/requestId.js`, `src/middleware/requestLogger.js`, `src/middleware/errorHandler.js`
↳ `src/routes/demo.routes.js`
:::

::: code json logging-system/package.json
{
  "name": "logging-system",
  "version": "1.0.0",
  "private": true,
  "description": "Logging system LLD: levels, structured JSON, transports, request ids, redaction",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "collector": "node collector.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": { "express": "^4.19.2" }
}
:::

::: code javascript logging-system/collector.js
// A tiny "external log service": receives batches and prints them. Run: npm run collector
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.post('/logs', (req, res) => {
  const batch = Array.isArray(req.body) ? req.body : [];
  console.log(`📥 received ${batch.length} log records`);
  for (const record of batch) console.log(`   [${record.level}] ${record.msg} (requestId ${record.requestId || '-'})`);
  res.status(202).json({ accepted: batch.length });
});
app.listen(Number(process.env.COLLECTOR_PORT) || 3099, () => console.log('Log collector on http://localhost:3099/logs'));
:::

::: code javascript logging-system/src/index.js
// Run: npm install && npm start
// Production-style JSON + collector: npm run collector (other terminal) then
//   NODE_ENV=production LOG_HTTP_URL=http://localhost:3099/logs npm start
const { createApp } = require('./app');
const { logger, shutdownLogger } = require('./logger');
const config = require('./config');

const app = createApp();
const server = app.listen(config.port, () => logger.info('server started', { port: config.port, env: config.env }));

async function shutdown(signal) {
  logger.info('shutting down', { signal });
  server.close();
  await shutdownLogger();          // flush buffered logs before exiting
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', { err: reason }));
:::

::: code javascript logging-system/src/config.js
const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  port: Number(process.env.PORT) || 3009,
  service: process.env.SERVICE_NAME || 'demo-api',
  level: process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'),
  pretty: env !== 'production',                         // human-friendly console in dev, JSON in prod
  logFile: process.env.LOG_FILE || './logs/app.log',
  logFileMaxBytes: Number(process.env.LOG_FILE_MAX_BYTES) || 1024 * 1024, // rotate at 1 MB
  logFileKeep: 3,                                        // app.log.1 … app.log.3
  httpUrl: process.env.LOG_HTTP_URL || '',               // empty → no HTTP transport
  redactKeys: ['password', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'cardnumber', 'cvv', 'secret'],
};
:::

::: code javascript logging-system/src/app.js
const express = require('express');
const { logger } = require('./logger');
const { requestId } = require('./middleware/requestId');
const { requestLogger } = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { buildDemoRoutes } = require('./routes/demo.routes');

function createApp() {
  const app = express();
  app.use(requestId());                       // first: everything after it knows the request id
  app.use(requestLogger(logger));
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', buildDemoRoutes(logger.child({ module: 'demo-routes' })));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}

module.exports = { createApp };
:::

::: code javascript logging-system/src/logger/levels.js
// Numeric order makes "is this level enabled?" a simple comparison.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function isEnabled(level, minLevel) {
  return LEVELS[level] >= LEVELS[minLevel];
}

module.exports = { LEVELS, isEnabled };
:::

::: code javascript logging-system/src/logger/context.js
// AsyncLocalStorage keeps data per async "flow" (per request) without passing it through every function.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

module.exports = {
  runWithContext: (context, fn) => storage.run(context, fn),
  getContext: () => storage.getStore() || {},
};
:::

::: code javascript logging-system/src/logger/redact.js
// Returns a deep copy where sensitive keys (case-insensitive) are replaced. Handles arrays and cycles.
function createRedactor(keys) {
  const sensitive = new Set(keys.map((k) => k.toLowerCase()));

  return function redact(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((v) => redact(v, seen));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sensitive.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, seen);
    }
    return out;
  };
}

module.exports = { createRedactor };
:::

::: code javascript logging-system/src/logger/Logger.js
const { isEnabled } = require('./levels');
const { getContext } = require('./context');

class Logger {
  constructor({ level, service, transports, redact, bindings = {} }) {
    Object.assign(this, { level, service, transports, redact, bindings });
  }

  debug(msg, fields) { this.#log('debug', msg, fields); }
  info(msg, fields) { this.#log('info', msg, fields); }
  warn(msg, fields) { this.#log('warn', msg, fields); }
  error(msg, fields) { this.#log('error', msg, fields); }

  /** A logger that adds fixed fields to every record (e.g. { module: 'payments' }). */
  child(bindings) {
    return new Logger({ ...this, bindings: { ...this.bindings, ...bindings } });
  }

  #log(level, msg, fields = {}) {
    if (!isEnabled(level, this.level)) return;                 // cheap early exit for disabled levels
    const record = this.redact({
      time: new Date().toISOString(),
      level,
      msg,
      service: this.service,
      ...getContext(),                                          // requestId of the current request
      ...this.bindings,
      ...fields,
    });
    for (const transport of this.transports) {
      if (!isEnabled(level, transport.minLevel)) continue;
      try {
        transport.write(record);
      } catch (err) {
        // A broken transport must never crash the app (or recurse into the logger)
        process.stderr.write(`logger transport failed: ${err.message}\n`);
      }
    }
  }

  async flush() {
    await Promise.all(this.transports.map((t) => (t.flush ? t.flush() : undefined)));
  }
}

module.exports = { Logger };
:::

::: code javascript logging-system/src/logger/transports/console.transport.js
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

class ConsoleTransport {
  constructor({ minLevel = 'debug', pretty = true } = {}) {
    this.minLevel = minLevel;
    this.pretty = pretty;
  }

  write(record) {
    if (!this.pretty) {
      process.stdout.write(JSON.stringify(record) + '\n');   // one JSON object per line (log shippers love this)
      return;
    }
    const { time, level, msg, requestId, service, err, ...rest } = record;
    const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    const rid = requestId ? ` [${requestId.slice(0, 8)}]` : '';
    process.stdout.write(`${time.slice(11, 23)} ${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}${rid} ${msg}${extra}\n`);
    if (err && err.stack) process.stdout.write(`${err.stack}\n`);
  }
}

module.exports = { ConsoleTransport };
:::

::: code javascript logging-system/src/logger/transports/file.transport.js
// JSON lines in a file with simple size-based rotation: app.log → app.log.1 → app.log.2 …
const fs = require('fs');
const path = require('path');

class FileTransport {
  constructor({ file, minLevel = 'info', maxBytes = 1024 * 1024, keep = 3 }) {
    Object.assign(this, { file, minLevel, maxBytes, keep });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  }

  write(record) {
    const line = JSON.stringify(record) + '\n';
    if (this.size + Buffer.byteLength(line) > this.maxBytes) this.rotate();
    fs.appendFileSync(this.file, line);   // sync = simple and ordered; pino uses a worker thread for speed
    this.size += Buffer.byteLength(line);
  }

  rotate() {
    for (let i = this.keep - 1; i >= 1; i--) {
      if (fs.existsSync(`${this.file}.${i}`)) fs.renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`);
    }
    if (fs.existsSync(this.file)) fs.renameSync(this.file, `${this.file}.1`);
    this.size = 0;
  }
}

module.exports = { FileTransport };
:::

::: code javascript logging-system/src/logger/transports/http.transport.js
// Sends logs to an external collector in batches. Never blocks the request; bounded buffer.
class HttpTransport {
  constructor({ url, minLevel = 'info', batchSize = 20, flushIntervalMs = 2000, maxBuffer = 1000 }) {
    Object.assign(this, { url, minLevel, batchSize, maxBuffer });
    this.buffer = [];
    this.dropped = 0;
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    this.timer.unref();                                    // don't keep the process alive for this timer
  }

  write(record) {
    if (this.buffer.length >= this.maxBuffer) {           // collector down for long → drop the oldest
      this.buffer.shift();
      this.dropped++;
    }
    this.buffer.push(record);
    if (this.buffer.length >= this.batchSize) this.flush();
  }

  async flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    if (this.dropped) {
      batch.push({ time: new Date().toISOString(), level: 'warn', msg: 'log records dropped', count: this.dropped });
      this.dropped = 0;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) });
        if (res.ok) return;
      } catch {
        // network error → retry once below
      }
    }
    this.buffer.unshift(...batch.slice(-this.maxBuffer));  // give up for now; keep for the next flush
    process.stderr.write(`HttpTransport: collector unreachable, ${batch.length} records kept\n`);
  }
}

module.exports = { HttpTransport };
:::

::: code javascript logging-system/src/logger/index.js
// Builds the root logger from config. Import { logger } anywhere.
const config = require('../config');
const { Logger } = require('./Logger');
const { createRedactor } = require('./redact');
const { ConsoleTransport } = require('./transports/console.transport');
const { FileTransport } = require('./transports/file.transport');
const { HttpTransport } = require('./transports/http.transport');

const transports = [
  new ConsoleTransport({ minLevel: config.level, pretty: config.pretty }),
  new FileTransport({ file: config.logFile, minLevel: 'info', maxBytes: config.logFileMaxBytes, keep: config.logFileKeep }),
];
if (config.httpUrl) transports.push(new HttpTransport({ url: config.httpUrl, minLevel: 'info' }));

const logger = new Logger({ level: config.level, service: config.service, transports, redact: createRedactor(config.redactKeys) });

module.exports = { logger, shutdownLogger: () => logger.flush() };
:::

::: code javascript logging-system/src/middleware/requestId.js
// Reuse the caller's x-request-id (useful across microservices) or create one; store it in the async context.
const crypto = require('crypto');
const { runWithContext } = require('../logger/context');

function requestId() {
  return function requestIdMiddleware(req, res, next) {
    const incoming = req.get('x-request-id');
    const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    req.id = id;
    res.set('x-request-id', id);                   // the client can quote it in a bug report
    runWithContext({ requestId: id }, next);       // every log inside this request gets requestId
  };
}

module.exports = { requestId };
:::

::: code javascript logging-system/src/middleware/requestLogger.js
// One log line per request with status and duration ("access log").
function requestLogger(logger) {
  return function requestLoggerMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('request completed', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ip: req.ip,
      });
    });
    next();
  };
}

module.exports = { requestLogger };
:::

::: code javascript logging-system/src/middleware/errorHandler.js
function notFound(req, res) {
  res.status(404).json({ error: { message: 'Not found', requestId: req.id } });
}

function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandlerMiddleware(err, req, res, next) {
    const status = err.statusCode || 500;
    if (status >= 500) logger.error('unhandled error', { err, path: req.originalUrl }); // full stack in the logs
    res.status(status).json({
      error: { message: status >= 500 ? 'Internal Server Error' : err.message, requestId: req.id }, // no stack to clients
    });
  };
}

module.exports = { notFound, errorHandler };
:::

::: code javascript logging-system/src/routes/demo.routes.js
const express = require('express');

function buildDemoRoutes(log) {
  const router = express.Router();

  router.get('/hello', (req, res) => {
    log.debug('building greeting');                                 // hidden when LOG_LEVEL=info
    res.json({ message: 'hello', requestId: req.id });
  });

  router.post('/login', (req, res) => {
    log.info('login attempt', { body: req.body, headers: { authorization: req.get('authorization') } }); // secrets get redacted
    res.json({ ok: true });
  });

  router.get('/slow', async (req, res) => {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 600));
    const ms = Date.now() - start;
    if (ms > 500) log.warn('slow operation', { operation: 'fake-report', ms });
    res.json({ ms });
  });

  // Synchronous throw: Express 4 passes it to the error handler (async errors need asyncHandler / next(err))
  router.get('/boom', (req, res) => {
    const order = { id: 'o-1', items: null };
    res.json({ count: order.items.length });                         // TypeError → error handler → error log
  });

  return router;
}

module.exports = { buildDemoRoutes };
:::

::: code javascript Browser simulation: levels, child loggers, redaction and request ids (runnable)
// A miniature logger with an in-memory transport so we can assert on the records.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = new Set(['password', 'token', 'authorization', 'cardnumber']);
function redact(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(redact);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SENSITIVE.has(k.toLowerCase()) ? '[REDACTED]' : redact(x)]));
}
let currentContext = {};                                // stands in for AsyncLocalStorage
const records = [];
const memoryTransport = { minLevel: 'debug', write: (r) => records.push(r) };
function makeLogger(level, bindings = {}) {
  const log = (lvl) => (msg, fields = {}) => {
    if (LEVELS[lvl] < LEVELS[level]) return;
    memoryTransport.write(redact({ level: lvl, msg, ...currentContext, ...bindings, ...fields }));
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), child: (b) => makeLogger(level, { ...bindings, ...b }) };
}

// ---------- tests ----------
const logger = makeLogger('info');
logger.debug('hidden');
logger.info('visible');
console.log('level filter: debug dropped, info kept →', records.map((r) => r.msg).join(), records.length === 1 ? '✅' : '❌ FAIL');
const payments = logger.child({ module: 'payments' });
payments.info('charged', { amount: 4999 });
console.log('child adds module →', records[1].module, records[1].module === 'payments' ? '✅' : '❌ FAIL');
logger.info('login', { user: { email: 'a@x.com', password: 'hunter2', Authorization: 'Bearer abc' }, cards: [{ cardNumber: '4242' }] });
const r = records[2];
console.log('redacted →', JSON.stringify(r.user), JSON.stringify(r.cards));
console.log('secrets hidden at any depth →', r.user.password === '[REDACTED]' && r.user.Authorization === '[REDACTED]' && r.cards[0].cardNumber === '[REDACTED]' && r.user.email === 'a@x.com' ? '✅' : '❌ FAIL');
currentContext = { requestId: 'req-123' };
logger.warn('slow query', { ms: 900 });
console.log('request id attached automatically →', records[3].requestId === 'req-123' ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd logging-system && npm install && npm start` → a coloured line `INFO  server started {"port":3009,"env":"development"}`.
2. `curl -s http://localhost:3009/api/hello` → `{"message":"hello","requestId":"…"}`; the console shows `DEBUG [abcd1234] building greeting` and `INFO [abcd1234] request completed {"method":"GET","path":"/api/hello","status":200,"durationMs":1.2,…}`: same request id on both lines.
3. **Your own request id**: `curl -s -i http://localhost:3009/api/hello -H "x-request-id: trace-abc-123"` → response header `x-request-id: trace-abc-123`, used in the logs too.
4. **Redaction**: `curl -s -X POST http://localhost:3009/api/login -H "Content-Type: application/json" -H "Authorization: Bearer secret" -d '{"email":"a@x.com","password":"hunter2"}'` → the log shows `"password":"[REDACTED]"` and `"authorization":"[REDACTED]"`.
5. **Warnings and errors**: `curl -s http://localhost:3009/api/slow` → `WARN slow operation {"ms":601}`; `curl -s http://localhost:3009/api/boom` → **500** `{"error":{"message":"Internal Server Error","requestId":"…"}}` and an `ERROR unhandled error` log with the full stack.
6. **File**: `tail -n 3 logs/app.log` → JSON lines (info and above).
7. **Production mode + collector**: terminal 1 `npm run collector`; terminal 2 `NODE_ENV=production LOG_HTTP_URL=http://localhost:3099/logs npm start` → the console prints JSON lines, and within 2 s the collector prints `📥 received N log records`. Stop the collector and keep sending requests: the app keeps working and buffers.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Format | Plain text lines | **Structured JSON** | JSON in production (searchable); pretty text locally |
| Library | Build your own (this demo) | **pino** (fastest), winston (flexible transports) | pino in real Node services |
| Where logs go | Files on each server | **stdout → log shipper/agent** (Fluent Bit, CloudWatch agent) → central store | stdout in containers; the platform ships them |
| Delivery | Synchronous writes | **Async/batched** with a bounded buffer | Batched; never block requests on the network |
| Correlation | None | **Request id / trace id** (OpenTelemetry) | Always; propagate across services |
| Volume control | Log everything | Levels + **sampling** of noisy logs | Levels, sampling, and retention policies (cost) |
:::

::: text 📈 Scaling & edge cases
- **Many services**: propagate `x-request-id` (or W3C `traceparent`) on outgoing calls so one user action can be followed across services; add OpenTelemetry tracing.
- **Volume and cost**: log at `info` in production, sample repetitive logs, set retention (e.g. 14 days hot, 1 year archived), avoid logging whole request/response bodies.
- **Performance**: `JSON.stringify` and sync file writes cost CPU; pino moves formatting/IO to a worker thread.
- **Reliability**: when the collector is down, buffer with a limit and drop the oldest; audit logs (who changed what) go to a durable store instead.
- **Security/privacy**: redaction allow-lists, no PII in logs where possible (GDPR), restrict who can read logs, and make logs tamper-evident for audits.
:::

::: warning ⚠️ Common mistakes
- `console.log` strings scattered everywhere: no levels, no request ids, unsearchable.
- Logging passwords, tokens, full card numbers or entire request bodies.
- Logging inside hot loops (huge volume, slow app, big bills).
- Letting a failing log transport throw and crash requests.
- Returning stack traces to API clients instead of logging them server-side.
:::

::: understand
- Logs are one of the **three pillars of observability**: logs (what happened), metrics (how much / how often), traces (where time went across services).
- The design is a **pipeline**: produce structured events, enrich them (time, level, request id), protect them (redaction), and fan them out to sinks (transports) without hurting the main application.
:::

::: important ⭐ How to present this design in 5 minutes
> "The application calls a Logger with levels debug, info, warn and error. The logger drops disabled levels early, builds a structured JSON record with time, level, message and service, enriches it with the request id from AsyncLocalStorage and child-logger bindings like module, redacts sensitive keys at any depth, and fans the record out to transports, each with its own minimum level: console, pretty in dev and JSON in prod; a rotating file; and an HTTP transport that batches records to a collector with a bounded buffer so a down collector can't crash or slow the app. Middleware assigns or propagates x-request-id and writes one access log per request with status and duration; the error handler logs stacks but returns only the request id to clients. In production I'd use pino, write to stdout and let the platform ship logs, and add tracing."
:::

::: links
pino logger | https://getpino.io/
Node.js: AsyncLocalStorage | https://nodejs.org/api/async_context.html#class-asynclocalstorage
OWASP: Logging Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
OpenTelemetry for JavaScript | https://opentelemetry.io/docs/languages/js/
:::

=== Design an API Client / HTTP Client (Node)
@p 2
@tags lld, http-client, retry, timeout
@quick
- `HttpClient` wraps `fetch`: `baseURL`, default headers, JSON in/out, query params, `get/post/put/patch/delete`.
- **Timeout** with `AbortController` (fetch has none by default!); combine with the caller's own abort signal.
- **Retry** only what's safe: network errors, 408/429/5xx, for **idempotent** methods (GET, PUT, DELETE) or POST with an `Idempotency-Key`; **exponential backoff + jitter**, honour **Retry-After**.
- Throw a typed **`HttpError`** (status, url, body) for non-2xx; **interceptors** for auth headers and logging.
- **Circuit breaker**: after N consecutive failures, fail fast for a cooldown instead of hammering a dead service.

::: text 🧒 In simple words
Your backend constantly calls other services: a payment gateway, a shipping API, another microservice. The network is unreliable: requests hang, servers return 503, rate limits kick in. An HTTP client is a **careful courier**: it knows the address book (base URL), puts the right ID card on every parcel (auth header), gives up on a delivery that takes too long (timeout), tries again a little later if the door was temporarily closed (retry with backoff), and stops visiting an address that's clearly shut down for a while (circuit breaker). Libraries like **axios**, **ky** and **got** do this; here we build one on top of Node's built-in `fetch`.
:::

::: text 📋 Requirements
### Functional
- Methods `get/post/put/patch/delete` relative to a `baseURL`; query params; JSON request and response bodies.
- Default headers + request interceptors (e.g. add `Authorization`) + response interceptors (e.g. logging).
- Per-request timeout and cancellation.
- Automatic retries with backoff for retryable failures; respect `Retry-After`.
- Non-2xx → `HttpError` with status, URL, method and the parsed body.

### Non-functional
- Never retry unsafe requests blindly (a POST could charge a card twice).
- Bounded total time (max attempts × timeout + delays).
- No dependencies (Node ≥ 18 has `fetch` and `AbortController`).

### Assumptions
- A demo server with flaky, slow, rate-limited and down endpoints is included to test the client.
:::

::: ask
- *"Which services, what latency/SLA do they have?"* (Sets timeouts.)
- *"Which operations are idempotent? Do the APIs support idempotency keys?"*
- *"Auth: API keys, OAuth tokens that expire (refresh on 401)?"*
- *"Should failures fall back to a cache or default value?"*
- *"Do we need metrics per dependency (latency, error rate)?"*
:::

::: diagram High-level architecture
flowchart LR
  APP["Service code"] --> HC["HttpClient.request()"]
  HC --> CB{"CircuitBreaker open?"}
  CB -->|"yes"| FF["fail fast: CircuitOpenError"]
  CB -->|"no"| RI["request interceptors (auth, request id)"]
  RI --> F["fetch + AbortController timeout"]
  F --> D{"ok?"}
  D -->|"2xx"| RES["parse JSON, response interceptors"]
  D -->|"retryable (network, 408, 429, 5xx) and safe"| BO["wait backoff + jitter or Retry-After"]
  BO --> F
  D -->|"other 4xx or no retries left"| ERR["throw HttpError"]
:::

::: diagram Class diagram
classDiagram
  class HttpClient {
    -baseURL
    -defaultHeaders
    -timeoutMs
    -retry
    -breaker
    +get(path, options) Promise
    +post(path, body, options) Promise
    +put(path, body, options) Promise
    +delete(path, options) Promise
    +request(method, path, options) Promise
    +useRequest(fn) void
    +useResponse(fn) void
  }
  class HttpError {
    +status number
    +url string
    +method string
    +body any
  }
  class CircuitBreaker {
    -failureThreshold
    -cooldownMs
    -state
    +canRequest() boolean
    +onSuccess() void
    +onFailure() void
  }
  class RetryPolicy {
    +isRetryable(errorOrResponse, method, headers) boolean
    +delayMs(attempt, retryAfter) number
  }
  HttpClient --> CircuitBreaker
  HttpClient --> RetryPolicy
  HttpClient --> HttpError
:::

::: diagram Sequence: a 503, a retry, then success
sequenceDiagram
  participant S as Service code
  participant C as HttpClient
  participant API as Remote API
  S->>C: get("/flaky")
  C->>API: GET /flaky (attempt 1, timeout 2 s)
  API-->>C: 503 Service Unavailable
  C->>C: retryable and GET is idempotent, wait about 200 ms
  C->>API: GET /flaky (attempt 2)
  API-->>C: 200 data
  C->>C: breaker.onSuccess(), parse JSON
  C-->>S: data
:::

::: image HTTP client: interceptors, timeout, retry with backoff, circuit breaker and typed errors
/images/backend-lld/http-client.svg
:::

::: text 🧱 Design
### Responsibilities
| Module | Responsibility |
|---|---|
| `HttpClient` | Builds URL + headers, runs interceptors, applies timeout, loops over attempts, parses bodies, throws `HttpError` |
| `retry.js` | Which errors/statuses/methods are retryable; backoff delay with full jitter; `Retry-After` parsing |
| `CircuitBreaker` | `closed → open` after N consecutive failures; `half-open` after the cooldown lets one trial request through |
| `HttpError` / `TimeoutError` / `CircuitOpenError` | Typed errors so callers can react (e.g. 404 → null, 401 → refresh token) |

### Retry rules
| Situation | Retry? |
|---|---|
| Network error (DNS, connection reset) | Yes, if the method is safe |
| Timeout | Yes, if the method is safe |
| 408, 429, 500, 502, 503, 504 | Yes, if the method is safe (429 → wait `Retry-After`) |
| 400, 401, 403, 404, 409, 422 | **No**: retrying won't change the answer |
| POST / PATCH | Only with an `Idempotency-Key` header |

### Public API
`const api = new HttpClient({ baseURL, timeoutMs: 2000, retries: 3, headers })`
`await api.get('/users', { query: { page: 2 } })` · `await api.post('/orders', body, { headers: { 'Idempotency-Key': key } })`
`api.useRequest((req) => ({ ...req, headers: { ...req.headers, Authorization: 'Bearer …' } }))`
:::

::: text 📁 Folder structure
`http-client/`
↳ `package.json`
↳ `src/index.js` (exports)
↳ `src/HttpClient.js`
↳ `src/errors.js`
↳ `src/retry.js`
↳ `src/CircuitBreaker.js`
↳ `demo-server.js` (flaky test server)
↳ `example.js` (uses the client against the demo server)
:::

::: code json http-client/package.json
{
  "name": "http-client",
  "version": "1.0.0",
  "private": true,
  "description": "HTTP client LLD on top of fetch: timeouts, retries with backoff, Retry-After, circuit breaker",
  "main": "src/index.js",
  "scripts": {
    "server": "node demo-server.js",
    "example": "node example.js"
  },
  "engines": { "node": ">=18" }
}
:::

::: code javascript http-client/src/index.js
// Public entry point of the package.
const { HttpClient } = require('./HttpClient');
const { HttpError, TimeoutError, CircuitOpenError } = require('./errors');
const { CircuitBreaker } = require('./CircuitBreaker');

module.exports = { HttpClient, HttpError, TimeoutError, CircuitOpenError, CircuitBreaker };
:::

::: code javascript http-client/src/errors.js
// Typed errors let callers react precisely (err instanceof HttpError && err.status === 404).
class HttpError extends Error {
  constructor({ status, method, url, body }) {
    super(`${method} ${url} failed with ${status}`);
    this.name = 'HttpError';
    Object.assign(this, { status, method, url, body });
  }
}

class TimeoutError extends Error {
  constructor({ method, url, timeoutMs }) {
    super(`${method} ${url} timed out after ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

class CircuitOpenError extends Error {
  constructor(name, retryInMs) {
    super(`Circuit "${name}" is open, failing fast (retry in ${retryInMs} ms)`);
    this.name = 'CircuitOpenError';
  }
}

module.exports = { HttpError, TimeoutError, CircuitOpenError };
:::

::: code javascript http-client/src/retry.js
// Retry policy: what to retry and how long to wait.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/** Is it safe to send this request again? */
function isSafeToRetry(method, headers = {}) {
  if (IDEMPOTENT_METHODS.has(method)) return true;
  return Object.keys(headers).some((h) => h.toLowerCase() === 'idempotency-key'); // POST/PATCH with a key
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status);
}

/** Exponential backoff with "full jitter": random between 0 and base·2^(attempt-1), capped. */
function backoffMs(attempt, { baseMs = 200, maxMs = 5000, random = Math.random } = {}) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.round(random() * ceiling);
}

/** Retry-After can be seconds ("2") or an HTTP date. Returns ms or null. */
function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

module.exports = { isSafeToRetry, isRetryableStatus, backoffMs, parseRetryAfter };
:::

::: code javascript http-client/src/CircuitBreaker.js
// closed: requests flow; open: fail fast; half-open: one trial request decides.
class CircuitBreaker {
  constructor({ name = 'default', failureThreshold = 5, cooldownMs = 10_000, now = () => Date.now() } = {}) {
    Object.assign(this, { name, failureThreshold, cooldownMs, now });
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
  }

  canRequest() {
    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half-open';                 // let ONE request test the waters
        return true;
      }
      return false;
    }
    return true;
  }

  retryInMs() {
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  onFailure() {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}

module.exports = { CircuitBreaker };
:::

::: code javascript http-client/src/HttpClient.js
const { HttpError, TimeoutError, CircuitOpenError } = require('./errors');
const { isSafeToRetry, isRetryableStatus, backoffMs, parseRetryAfter } = require('./retry');
const { CircuitBreaker } = require('./CircuitBreaker');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpClient {
  constructor({ baseURL = '', headers = {}, timeoutMs = 5000, retries = 2, baseBackoffMs = 200, breaker, fetchImpl = globalThis.fetch } = {}) {
    Object.assign(this, { baseURL, timeoutMs, retries, baseBackoffMs, fetchImpl });
    this.defaultHeaders = { Accept: 'application/json', ...headers };
    this.breaker = breaker || new CircuitBreaker({ name: baseURL || 'http' });
    this.requestInterceptors = [];
    this.responseInterceptors = [];
  }

  useRequest(fn) { this.requestInterceptors.push(fn); }    // (req) => req   e.g. add auth header
  useResponse(fn) { this.responseInterceptors.push(fn); }  // (res, req) => void   e.g. logging

  get(path, options) { return this.request('GET', path, options); }
  delete(path, options) { return this.request('DELETE', path, options); }
  post(path, body, options) { return this.request('POST', path, { ...options, body }); }
  put(path, body, options) { return this.request('PUT', path, { ...options, body }); }
  patch(path, body, options) { return this.request('PATCH', path, { ...options, body }); }

  async request(method, path, { query, body, headers = {}, timeoutMs = this.timeoutMs, retries = this.retries, signal } = {}) {
    // 1) build the request description and let interceptors change it
    const url = new URL(path, this.baseURL || undefined);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    let req = { method, url: url.toString(), headers: { ...this.defaultHeaders, ...headers }, body };
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') {
      req.headers['Content-Type'] = 'application/json';
      req.body = JSON.stringify(body);
    }
    for (const fn of this.requestInterceptors) req = (await fn(req)) || req;

    const canRetry = isSafeToRetry(method, req.headers);
    const maxAttempts = 1 + (canRetry ? retries : 0);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this.breaker.canRequest()) throw new CircuitOpenError(this.breaker.name, this.breaker.retryInMs());
      let response;
      try {
        response = await this.#fetchWithTimeout(req, timeoutMs, signal);
      } catch (err) {
        if (signal && signal.aborted) throw err;                  // the CALLER cancelled → never retry
        this.breaker.onFailure();
        if (attempt < maxAttempts) { await sleep(backoffMs(attempt, { baseMs: this.baseBackoffMs })); continue; }
        throw err;                                               // network error or TimeoutError
      }

      if (response.ok) {
        this.breaker.onSuccess();
        const data = await this.#parse(response);
        for (const fn of this.responseInterceptors) await fn({ status: response.status, data, attempt }, req);
        return data;
      }

      const data = await this.#parse(response);
      if (isRetryableStatus(response.status)) {
        this.breaker.onFailure();                                // 5xx/429 count against the dependency
        if (attempt < maxAttempts) {
          const wait = parseRetryAfter(response.headers.get('retry-after')) ?? backoffMs(attempt, { baseMs: this.baseBackoffMs });
          await sleep(Math.min(wait, 10_000));                   // never wait forever
          continue;
        }
      } else {
        this.breaker.onSuccess();                                // a 404 means the service is healthy
      }
      for (const fn of this.responseInterceptors) await fn({ status: response.status, data, attempt }, req);
      throw new HttpError({ status: response.status, method, url: req.url, body: data });
    }
  }

  async #fetchWithTimeout(req, timeoutMs, outerSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new TimeoutError({ method: req.method, url: req.url, timeoutMs })), timeoutMs);
    const onOuterAbort = () => controller.abort(outerSignal.reason);
    if (outerSignal) outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    try {
      return await this.fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason instanceof TimeoutError) throw controller.signal.reason;
      throw err;
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
    }
  }

  async #parse(response) {
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!text) return null;
    return type.includes('application/json') ? JSON.parse(text) : text;
  }
}

module.exports = { HttpClient };
:::

::: code javascript http-client/demo-server.js
// A deliberately unreliable server to test the client. Run: npm run server   (no dependencies)
const http = require('http');

let flakyCalls = 0;
let limitedCalls = 0;

const server = http.createServer((req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/users') return send(200, [{ id: 1, name: 'Asha' }, { id: 2, name: 'Ben' }], { 'x-page': url.searchParams.get('page') || '1' });
  if (url.pathname === '/flaky') {
    flakyCalls++;
    return flakyCalls % 3 === 0 ? send(200, { ok: true, calls: flakyCalls }) : send(503, { error: 'temporarily unavailable' });
  }
  if (url.pathname === '/rate-limited') {
    limitedCalls++;
    return limitedCalls % 2 === 1 ? send(429, { error: 'slow down' }, { 'Retry-After': '1' }) : send(200, { ok: true });
  }
  if (url.pathname === '/slow') return setTimeout(() => send(200, { ok: true }), 3000);
  if (url.pathname === '/down') return send(503, { error: 'down' });
  if (url.pathname === '/orders' && req.method === 'POST') return send(201, { id: 'ord_1', idempotencyKey: req.headers['idempotency-key'] || null });
  return send(404, { error: 'not found' });
});

server.listen(Number(process.env.DEMO_PORT) || 3010, () => console.log('Demo server on http://localhost:3010'));
:::

::: code javascript http-client/example.js
// Uses the client against demo-server.js. Run the server first, then: npm run example
const { HttpClient, HttpError, TimeoutError, CircuitOpenError, CircuitBreaker } = require('./src');

const api = new HttpClient({
  baseURL: process.env.API_URL || 'http://localhost:3010',
  timeoutMs: 1000,
  retries: 3,
  breaker: new CircuitBreaker({ name: 'demo', failureThreshold: 4, cooldownMs: 2000 }),
});
api.useRequest((req) => ({ ...req, headers: { ...req.headers, Authorization: 'Bearer demo-token', 'x-request-id': `req-${Date.now()}` } }));
api.useResponse(({ status, attempt }, req) => console.log(`  ↳ ${req.method} ${new URL(req.url).pathname} → ${status} (attempt ${attempt})`));

async function show(label, fn) {
  const start = Date.now();
  try {
    const data = await fn();
    console.log(`✔ ${label}:`, JSON.stringify(data), `${Date.now() - start} ms`);
  } catch (err) {
    const kind = err instanceof HttpError ? `HttpError ${err.status}` : err instanceof TimeoutError ? 'TimeoutError' : err instanceof CircuitOpenError ? 'CircuitOpenError' : err.name;
    console.log(`✘ ${label}: ${kind}: ${err.message} (${Date.now() - start} ms)`);
  }
}

async function main() {
  await show('GET /users?page=2', () => api.get('/users', { query: { page: 2 } }));
  await show('GET /flaky (503, 503, then 200)', () => api.get('/flaky'));
  await show('GET /rate-limited (429 + Retry-After 1)', () => api.get('/rate-limited'));
  await show('GET /slow (3 s, timeout 1 s, no retries)', () => api.get('/slow', { retries: 0 }));
  await show('POST /orders with Idempotency-Key', () => api.post('/orders', { item: 'book' }, { headers: { 'Idempotency-Key': 'order-42' } }));
  await show('GET /missing (404 is not retried)', () => api.get('/missing'));
  await show('GET /down (opens the circuit)', () => api.get('/down'));
  await show('GET /users while the circuit is open', () => api.get('/users'));
  await new Promise((r) => setTimeout(r, 2100));
  await show('GET /users after the cooldown (half-open → closed)', () => api.get('/users'));
}

main();
:::

::: code javascript Browser simulation: retries, Retry-After, safe methods and the circuit breaker (runnable)
// The client's decision logic with a fake fetch, so it runs instantly in the browser.
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const SAFE = new Set(['GET', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);
const waits = [];
function makeClient(responses, { retries = 3 } = {}) {
  let calls = 0;
  const breaker = { failures: 0, open: false, onFailure() { if (++this.failures >= 3) this.open = true; }, onSuccess() { this.failures = 0; } };
  async function request(method, headers = {}) {
    const safe = SAFE.has(method) || 'Idempotency-Key' in headers;
    const max = 1 + (safe ? retries : 0);
    for (let attempt = 1; attempt <= max; attempt++) {
      if (breaker.open) throw new Error('circuit open');
      calls++;
      const res = responses.shift() || { status: 200 };
      if (res.status < 300) { breaker.onSuccess(); return { status: res.status, attempt }; }
      if (RETRYABLE.has(res.status)) {
        breaker.onFailure();
        if (attempt < max) { waits.push(res.retryAfter ? res.retryAfter * 1000 : 200 * 2 ** (attempt - 1)); continue; }
      }
      throw Object.assign(new Error('HttpError ' + res.status), { status: res.status, attempt });
    }
  }
  return { request, calls: () => calls, breaker };
}

// ---------- tests ----------
(async () => {
  const a = makeClient([{ status: 503 }, { status: 503 }, { status: 200 }]);
  const r = await a.request('GET');
  console.log('GET retried through two 503s →', r.attempt, r.attempt === 3 ? '✅' : '❌ FAIL');
  const b = makeClient([{ status: 503 }, { status: 200 }]);
  try { await b.request('POST'); console.log('❌ FAIL'); } catch (e) { console.log('POST without a key is NOT retried →', e.message, b.calls() === 1 ? '✅' : '❌ FAIL'); }
  const c = makeClient([{ status: 503 }, { status: 201 }]);
  console.log('POST with Idempotency-Key retried →', (await c.request('POST', { 'Idempotency-Key': 'k' })).status === 201 ? '✅' : '❌ FAIL');
  const d = makeClient([{ status: 404 }]);
  try { await d.request('GET'); } catch (e) { console.log('404 not retried →', e.status, d.calls() === 1 ? '✅' : '❌ FAIL'); }
  waits.length = 0;
  const e = makeClient([{ status: 429, retryAfter: 2 }, { status: 200 }]);
  await e.request('GET');
  console.log('Retry-After honoured →', waits[0], 'ms', waits[0] === 2000 ? '✅' : '❌ FAIL');
  const f = makeClient([{ status: 503 }, { status: 503 }, { status: 503 }, { status: 200 }], { retries: 5 });
  try { await f.request('GET'); console.log('❌ FAIL'); } catch (err) { console.log('3 failures open the circuit → fail fast:', err.message, f.calls() === 3 ? '✅' : '❌ FAIL'); }
})();
:::

::: text 🧪 How to run & test
1. Create the files (no `npm install` needed: zero dependencies). Terminal 1: `cd http-client && npm run server` → `Demo server on http://localhost:3010`
2. Terminal 2: `npm run example`. Expected output (timings vary):
`↳ GET /users → 200 (attempt 1)` and `✔ GET /users?page=2: [{"id":1,"name":"Asha"},{"id":2,"name":"Ben"}]`
`↳ GET /flaky → 200 (attempt 3)` and `✔ GET /flaky (503, 503, then 200): {"ok":true,"calls":3}`: two retries with backoff
`✔ GET /rate-limited …: {"ok":true}` after ~1000 ms (it waited for `Retry-After: 1`)
`✘ GET /slow …: TimeoutError: GET http://localhost:3010/slow timed out after 1000 ms`
`✔ POST /orders with Idempotency-Key: {"id":"ord_1","idempotencyKey":"order-42"}`
`✘ GET /missing (404 is not retried): HttpError 404 … (a few ms)`
`✘ GET /down (opens the circuit): HttpError 503` after 4 attempts
`✘ GET /users while the circuit is open: CircuitOpenError …` (instant)
`✔ GET /users after the cooldown …`: the circuit closed again.
3. Use it in your own code: `const { HttpClient } = require('./src'); const api = new HttpClient({ baseURL: 'https://api.github.com' }); api.get('/repos/nodejs/node').then((r) => console.log(r.stargazers_count));`
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Library | **Own wrapper on fetch** (this) | axios / ky / got / undici | A library in production unless you need tight control; know the concepts either way |
| Timeout | None (fetch default: can hang for minutes) | **Per-request AbortController timeout** | Always set one (shorter than your own SLA) |
| Retries | Retry everything | **Only safe methods/keys and retryable statuses** | Selective |
| Backoff | Fixed delay | **Exponential + full jitter, Retry-After** | Jitter avoids synchronised retry storms |
| Failing dependency | Keep calling | **Circuit breaker + fallback** (cache/default) | Breaker for critical dependencies |
| Retry location | Every layer retries (multiplies!) | **One layer** (usually the client nearest the call) | One layer, with a total time budget |
:::

::: text 📈 Scaling & edge cases
- **Retry amplification**: if 3 layers each retry 3×, one user request can become 27 calls. Retry in one place and set a total deadline.
- **Connection reuse**: keep-alive agents (undici's pool) cut latency; set max sockets per host.
- **Observability**: log/measure every attempt (status, duration, retries) per dependency; propagate `x-request-id`/trace headers.
- **Auth refresh**: a response interceptor can catch 401, refresh the token once, and replay the request.
- **Big bodies/streams**: don't JSON-parse downloads; stream them. Retrying a consumed stream body isn't possible.
- **Edge cases**: `Retry-After` as an HTTP date, empty 204 bodies, non-JSON error pages (HTML 502 from a proxy), the caller aborting (never retry user-cancelled requests).
:::

::: warning ⚠️ Common mistakes
- No timeout: one slow dependency ties up all your server's connections.
- Retrying POSTs without idempotency keys → duplicate orders/charges.
- Retrying 4xx errors (they won't succeed) or retrying without delay.
- Treating any non-2xx as "network down" (a 404 means the service is fine).
- Swallowing errors and returning `undefined`, so callers can't tell what happened.
:::

::: understand
- Resilience patterns for calling other services: **timeout**, **retry with backoff + jitter**, **circuit breaker**, **bulkhead** (limit concurrent calls), **fallback**. They're the client-side partner of the server-side [Rate Limiter](https://stripe.com/blog/rate-limiters) and idempotency keys.
- The same design works in the browser (React data layer) with `fetch`; there, React Query adds caching and retries on top.
:::

::: important ⭐ How to present this design in 5 minutes
> "The HttpClient wraps fetch with a base URL, default headers, JSON handling and request/response interceptors for auth and logging. Every request gets a timeout through an AbortController, because fetch has none. Failures are classified: network errors, timeouts and 408/429/5xx are retryable, but only for idempotent methods or POSTs carrying an Idempotency-Key; 4xx errors are thrown immediately as a typed HttpError with status and body. Retries use exponential backoff with full jitter and honour Retry-After. A circuit breaker counts consecutive failures and fails fast during a cooldown, then lets one trial request through. In a larger system I'd retry in only one layer, set a total deadline, reuse connections and record metrics per dependency."
:::

::: links
MDN: AbortController | https://developer.mozilla.org/en-US/docs/Web/API/AbortController
MDN: Retry-After header | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
Martin Fowler: Circuit Breaker | https://martinfowler.com/bliki/CircuitBreaker.html
AWS: timeouts, retries and backoff with jitter | https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
:::
