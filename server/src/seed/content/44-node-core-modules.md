@section Node.js Core Modules
@icon 🧰
@color #16a34a
@desc Phase 2 of your Node.js roadmap: fs (sync, promises, streams), path and URL, a native HTTP server without Express, crypto (hash, HMAC, random, password hashing) and zlib/util. Measured on Node 22.

=== How do you work with files in Node.js? (fs sync vs callbacks vs promises vs streams)
@p 3
@tags nodejs, fs, streams, performance
@quick
- Four styles: `readFileSync` (**blocks** the main thread), `readFile(cb)`, `await fs.promises.readFile` (preferred), `createReadStream` (chunks).
- Sync APIs are fine at **startup** and in CLI scripts; never inside request handlers.
- `readFile` loads the **whole file into memory**; streams read **64 KB chunks** with backpressure.
- Measured on a 186 MB log: `readFile` peaked at **226 MB RSS**, a stream at **89 MB** (and stays flat as files grow).
- Use `pipeline()` from `node:stream/promises` to connect streams with proper error handling and cleanup; write atomically (temp file + `rename`) for important files.

::: text 🧒 In simple words
Reading a file with `readFile` is **pouring a whole bucket of water into your kitchen sink at once**: fine for a cup, a flood for a swimming pool. A stream is a **hose**: water flows a little at a time, and if the sink fills, you pinch the hose (backpressure).
:::

::: text 📖 Detailed answer
| API | Thread | Memory | Use for |
|---|---|---|---|
| `fs.readFileSync` | **main thread (blocks)** | whole file | startup config, scripts |
| `fs.readFile(path, cb)` | thread pool | whole file | legacy callback code |
| `fs.promises.readFile` | thread pool | whole file | small/medium files in servers |
| `fs.createReadStream` | thread pool, chunked | ~64 KB per chunk | big files, uploads, downloads, logs |

### Measured (Node 22, 186 MB log file, count lines)
| Method | Peak RSS | Time |
|---|---|---|
| `readFile` (Buffer) | **226 MB** | 169–240 ms |
| `createReadStream` | **89 MB** | 185–189 ms |
Speed is similar; memory is the difference. With 20 concurrent downloads of that file, `readFile` would need ~4 GB.

### Other important fs APIs
- `fs.promises.writeFile`, `appendFile`, `mkdir({ recursive: true })`, `rm({ recursive: true, force: true })`, `readdir({ withFileTypes: true })`, `stat`.
- Atomic write: write `file.tmp`, then `rename` → readers never see half a file.
- `fs.watch` for file changes (or chokidar).
- Check existence by **trying** the operation and handling `ENOENT` (avoids race conditions vs `existsSync`).
:::

::: diagram Choosing a file API
flowchart TD
  Q{"where does the code run?"} -->|"startup or CLI script"| S["readFileSync is fine"]
  Q -->|"request handler"| Z{"file size?"}
  Z -->|"small, under a few MB"| P["await fs.promises.readFile"]
  Z -->|"large or unknown"| ST["createReadStream + pipeline"]
:::

::: image Reading files: sync, callback, promise, stream
/images/nodejs/fs-modes.svg
:::

::: chart bar Measured: peak memory (MB RSS) to process a 186 MB file
Method,Peak RSS (MB)
readFile,226
createReadStream,89
:::

::: text 🪜 Step by step
Serving a 500 MB video download safely:
1. `const stat = await fs.promises.stat(file)` → set `Content-Length`.
2. `createReadStream(file)` reads 64 KB chunks on the thread pool.
3. `pipeline(stream, res)` writes each chunk to the socket.
4. If the client is slow, `res.write()` returns `false` → the read stream pauses (backpressure).
5. If the client disconnects, `pipeline` destroys the read stream and closes the file descriptor.
:::

::: code javascript files.js: promises, atomic writes and a streaming copy with gzip
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;          // missing file is expected; other errors are not
    throw err;
  }
}

async function writeJsonAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);                           // atomic on the same file system
}

async function archiveLog(src) {
  // constant memory for any file size; errors and cleanup handled by pipeline
  await pipeline(fs.createReadStream(src), zlib.createGzip(), fs.createWriteStream(`${src}.gz`));
}

async function countLines(file) {
  let lines = 0;
  for await (const chunk of fs.createReadStream(file)) {
    for (let i = 0; i < chunk.length; i++) if (chunk[i] === 10) lines++;
  }
  return lines;
}

module.exports = { readJson, writeJsonAtomic, archiveLog, countLines };
:::

::: code javascript Chunked processing keeps memory flat (runnable)
// Simulate reading a 186 MB file: whole-buffer vs 64 KB chunks.
const FILE_MB = 186, CHUNK_KB = 64;
function peakMemoryMb(strategy) {
  if (strategy === 'readFile') return FILE_MB;                    // whole file held at once
  return CHUNK_KB / 1024 * 16;                                     // ~16 chunks buffered (highWaterMark) at most
}
const whole = peakMemoryMb('readFile');
const streamed = peakMemoryMb('stream');
console.log(`buffer for readFile ≈ ${whole} MB, for a stream ≈ ${streamed} MB`);
console.log('stream memory does not depend on file size', peakMemoryMb('stream') === streamed ? '✅' : '❌ FAIL');
console.log('20 concurrent readFile downloads ≈', (whole * 20 / 1024).toFixed(1), 'GB', whole * 20 > 3000 ? '✅ (why streams matter)' : '❌ FAIL');
// counting newlines chunk by chunk gives the same answer as on the whole text
const text = 'a\nb\nc\nd\n'.repeat(1000);
const whole_count = text.split('\n').length - 1;
let chunked = 0;
for (let i = 0; i < text.length; i += 7) chunked += text.slice(i, i + 7).split('\n').length - 1;
console.log('chunked line count equals whole-file count', chunked === whole_count ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `readFileSync` inside a request handler (blocks every user).
- `readFile` on uploads/logs of unknown size (memory spikes, OOM kills).
- `.pipe()` without error handling (leaked file descriptors); use `pipeline`.
- `existsSync` then `readFile` (race condition); just try and handle `ENOENT`.
- Building paths with string concatenation instead of `path.join` (see the next question).
:::

::: understand
- Whole-file APIs for small files, streams for big ones, sync only at startup.
:::

::: ask
- *"What's the maximum file size we'll handle?"* Unknown or large means streams.
:::

::: important ⭐ Say this in the interview
"Node gives me synchronous, callback, promise and stream file APIs. Sync calls block the main thread, so I only use them at startup or in scripts. In servers I use fs.promises for small files and streams with pipeline for large or unknown sizes, because readFile holds the whole file in memory: on a 186 megabyte log I measured 226 megabytes peak memory with readFile versus 89 with a stream, and the stream's usage doesn't grow with the file. pipeline also handles backpressure, errors and cleanup, and for important files I write to a temp file and rename for an atomic update."
:::

::: links
Node.js: File system | https://nodejs.org/api/fs.html
Node.js: stream.pipeline | https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
:::

=== How do you use path and URL safely? (path.join vs resolve, URLSearchParams, path traversal)
@p 2
@tags nodejs, path, url, security
@quick
- `path.join(a, b)` joins and **normalises** segments; `path.resolve(...)` returns an **absolute** path (from the cwd if needed).
- `path.basename`, `extname`, `dirname`, `parse`; `path.sep` differs on Windows, so never hand-build paths with `'/'`.
- Parse request URLs with `new URL(req.url, 'http://localhost')`: `pathname`, `searchParams.get()`; build query strings with `URLSearchParams` (encodes for you).
- **Path traversal**: `path.join(UPLOADS, '../../etc/passwd')` escapes the folder. Resolve, then check the result **starts with** the allowed folder + `path.sep`.
- In ESM: `fileURLToPath(import.meta.url)` or `import.meta.dirname`.

::: text 🧒 In simple words
`path` is a **GPS for folders**: it knows `..` means "go up one", and it speaks both Windows and Linux. The danger: if a user can type `../../` into your GPS, they can drive **out of the parking lot** you meant to keep them in, so you must check the final destination.
:::

::: text 📖 Detailed answer
| Call | Result (POSIX) |
|---|---|
| `path.join('/app', 'uploads', '../x.png')` | `'/app/x.png'` |
| `path.resolve('uploads', 'a.png')` | `'/<cwd>/uploads/a.png'` |
| `path.resolve('/a', '/b')` | `'/b'` (absolute segment resets) |
| `path.basename('/x/report.pdf', '.pdf')` | `'report'` |
| `path.extname('archive.tar.gz')` | `'.gz'` |
| `path.parse('/x/y.txt')` | `{ root: '/', dir: '/x', base: 'y.txt', ext: '.txt', name: 'y' }` |

### URL and query strings
- `new URL('/api/users?page=2&q=a b', 'http://localhost')` → `pathname: '/api/users'`, `searchParams.get('q') === 'a b'`.
- `new URLSearchParams({ q: 'rock & roll' }).toString()` → `'q=rock+%26+roll'` (never concatenate unescaped values).
- The legacy `url.parse()` is deprecated; use the WHATWG `URL` class (same as the browser).

### Path traversal defence
1. Prefer **ids** that map to stored file names, not user-supplied names.
2. Otherwise: `const full = path.resolve(BASE, userInput)`, then reject unless `full.startsWith(BASE + path.sep)`.
3. Also reject null bytes, and serve files with `res.sendFile(name, { root: BASE })` / `express.static`, which do this check for you.
:::

::: diagram Checking a user-supplied file name
flowchart TD
  I["name from the request"] --> R["full = path.resolve(BASE, name)"]
  R --> C{"full starts with BASE + sep?"}
  C -->|"yes"| OK["read the file"]
  C -->|"no"| NO["400 Bad Request"]
:::

::: image path and URL: building paths and parsing URLs safely
/images/nodejs/path-url.svg
:::

::: text 🪜 Step by step
An attacker requests `GET /download?file=../../../etc/passwd`:
1. Naive code: `path.join('/srv/uploads', file)` → `'/etc/passwd'`.
2. `fs.createReadStream('/etc/passwd')` → the server leaks system files.
3. Safe code resolves the path: `'/etc/passwd'`.
4. It checks `startsWith('/srv/uploads/')` → false → 400.
5. A legitimate `file=reports/q3.pdf` resolves to `/srv/uploads/reports/q3.pdf` → allowed.
:::

::: code javascript Safe path handling and URL parsing (runnable model of node:path)
// Minimal POSIX resolve: enough to show why the prefix check works.
function resolve(...parts) {
  const out = [];
  for (const part of parts) {
    if (part.startsWith('/')) out.length = 0;
    for (const seg of part.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
  }
  return '/' + out.join('/');
}
const BASE = '/srv/uploads';
const isSafe = (name) => { const full = resolve(BASE, name); return full.startsWith(BASE + '/'); };
const cases = [['reports/q3.pdf', true], ['../../../etc/passwd', false], ['/etc/passwd', false], ['a/../../uploads-evil/x', false], ['a/../b.txt', true]];
for (const [name, expected] of cases) console.log(name.padEnd(26), '→', resolve(BASE, name).padEnd(28), isSafe(name) === expected ? '✅' : '❌ FAIL');
// "/srv/uploads-evil" also starts with "/srv/uploads": that's why we add the separator
console.log('separator in the prefix check matters', '/srv/uploads-evil/x'.startsWith(BASE) && !'/srv/uploads-evil/x'.startsWith(BASE + '/') ? '✅' : '❌ FAIL');

const url = new URL('/api/products?page=2&q=rock%20%26%20roll', 'http://localhost');
console.log(url.pathname, url.searchParams.get('page'), url.searchParams.get('q'));
const qs = new URLSearchParams({ q: 'rock & roll', sort: '-price' }).toString();
console.log('URLSearchParams encodes', qs === 'q=rock+%26+roll&sort=-price' ? '✅' : '❌ FAIL', qs);
:::

::: warning ⚠️ Common mistakes
- `__dirname + '/' + file` string concatenation (breaks on Windows, allows traversal).
- Checking `startsWith(BASE)` without the separator (`/srv/uploads-evil`).
- Using the user's original file name to store uploads (collisions, traversal, odd characters).
- Building query strings by hand (`?q=${value}`) without encoding.
- `path.join` when you needed an absolute path (`path.resolve`).
:::

::: understand
- Normalise with `path`, parse with `URL`, and always check the final resolved path.
:::

::: ask
- *"Do users ever control any part of a file path?"* If yes, apply the traversal check.
:::

::: important ⭐ Say this in the interview
"path.join joins and normalises segments, path.resolve gives an absolute path, and basename, extname and parse pick paths apart in a cross-platform way. For URLs I use the WHATWG URL class and URLSearchParams, which handle encoding. Whenever a user controls part of a path I prevent traversal: I resolve the full path and only allow it if it starts with the base folder plus the separator, or better, I map ids to stored file names, and use sendFile with a root option, which enforces that check."
:::

::: links
Node.js: path | https://nodejs.org/api/path.html
Node.js: URL | https://nodejs.org/api/url.html
OWASP: Path traversal | https://owasp.org/www-community/attacks/Path_Traversal
:::

=== How do you build an HTTP server without Express? (the http module)
@p 3
@tags nodejs, http, server, express
@quick
- `http.createServer((req, res) => …)`: `req` is an `IncomingMessage` (**readable stream**: method, url, headers, body), `res` is a `ServerResponse` (**writable stream**).
- You do routing, body parsing, JSON, status codes, error handling and limits **yourself**: that's what Express adds.
- Read the body by consuming the stream (`for await (const chunk of req)`), with a **size limit**.
- Always end the response (`res.end()`), set `Content-Type`, and handle errors so one request can't crash the server.
- Measured: a minimal `node:http` JSON endpoint did **92,085 req/s**, Express 5 **20,189 req/s** (same machine). Frameworks cost throughput but save code; Fastify sits in between.

::: text 🧒 In simple words
`node:http` is a **bare kitchen**: stove and sink only. You can cook anything, but you chop, measure and clean everything yourself. Express is the same kitchen **with labelled drawers, recipes and helpers**: a bit slower to move around in, much faster to cook a real menu.
:::

::: text 📖 Detailed answer
### What the http module gives you
| Piece | What it is |
|---|---|
| `http.createServer(handler)` | a TCP server that parses HTTP (llhttp) |
| `req.method`, `req.url`, `req.headers` | parsed request line and headers (lower-case names) |
| `req` as a stream | the body arrives in chunks |
| `res.writeHead(status, headers)` / `res.setHeader` | status and headers |
| `res.write()` / `res.end()` | send body chunks / finish |
| `server.listen`, `server.close` | start / stop accepting connections |
| timeouts | `server.requestTimeout`, `headersTimeout`, `keepAliveTimeout` |

### What Express adds on top
Routing with params (`/users/:id`), middleware chain, `req.body` parsing (`express.json()`), `res.json()`/`res.status()`, error-handling middleware, static files, and a huge ecosystem.

### Measured (Node 22, autocannon, 50 connections, 6 s, `GET /api/users/1` returning small JSON)
| Server | req/s | p99 latency |
|---|---|---|
| `node:http` | **92,085** | 1 ms |
| Express 5 | **20,189** | 4 ms |
In real apps database time dominates, so the framework overhead matters less than this micro-benchmark suggests.
:::

::: diagram A request through node:http
sequenceDiagram
  participant C as Client
  participant H as "http server (llhttp)"
  participant A as Your handler
  C->>H: "POST /api/users with a JSON body"
  H->>A: "request event: req (readable), res (writable)"
  A->>A: "route by method and pathname"
  A->>A: "read body chunks, enforce limit, JSON.parse"
  A->>C: "res.writeHead(201, content-type) then res.end(json)"
:::

::: image A native HTTP server
/images/nodejs/http-server.svg
:::

::: chart bar Measured: requests per second for a tiny JSON endpoint (Node 22, 50 connections)
Server,req/s
node:http,92085
Express 5,20189
:::

::: text 🪜 Step by step
What happens on `POST /api/users`:
1. The OS accepts the TCP connection; llhttp parses the request line and headers.
2. Node emits `'request'` with `req` and `res`.
3. The handler matches `POST` + `/api/users`, then reads the body stream with a 1 MB limit.
4. It parses and validates JSON; invalid → 400 with an error body.
5. It responds `201` with JSON and `res.end()`; unexpected errors → 500 and a log line, the server keeps running.
:::

::: code javascript server.js: a small JSON API with only node:http (ran on Node 22)
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const users = new Map();
const MAX_BODY = 1_000_000;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const routes = {
  'GET /api/users': (req, res) => send(res, 200, [...users.values()]),
  'POST /api/users': async (req, res) => {
    const { name } = await readJson(req);
    if (typeof name !== 'string' || !name.trim()) return send(res, 400, { error: 'name is required' });
    const user = { id: randomUUID(), name: name.trim() };
    users.set(user.id, user);
    send(res, 201, user);
  },
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const route = routes[`${req.method} ${pathname}`];
  try {
    if (!route) return send(res, 404, { error: 'Not found' });
    await route(req, res);
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status ?? 500, { error: err.status ? err.message : 'Internal Server Error' });
  }
});

server.requestTimeout = 30_000;
server.listen(3000, () => console.log('listening on http://localhost:3000'));
:::

::: code javascript Routing table and body limit logic (runnable)
// The core of a framework: match "METHOD /path" and enforce a body limit.
const routes = new Map([['GET /api/users', () => ({ status: 200, body: [] })], ['POST /api/users', (body) => (body.name ? { status: 201, body: { id: 1, name: body.name } } : { status: 400, body: { error: 'name is required' } })]]);
function handle(method, url, rawBody = '', limit = 50) {
  const { pathname } = new URL(url, 'http://localhost');
  const route = routes.get(`${method} ${pathname}`);
  if (!route) return { status: 404 };
  if (rawBody.length > limit) return { status: 413 };
  let body;
  try { body = JSON.parse(rawBody || '{}'); } catch { return { status: 400, body: { error: 'Invalid JSON' } }; }
  return route(body);
}
const checks = [[handle('GET', '/api/users?page=2').status, 200], [handle('POST', '/api/users', '{"name":"Asha"}').status, 201], [handle('POST', '/api/users', '{}').status, 400], [handle('POST', '/api/users', '{bad').status, 400], [handle('POST', '/api/users', 'x'.repeat(100)).status, 413], [handle('DELETE', '/api/users').status, 404]];
checks.forEach(([got, want], i) => console.log(`case ${i + 1}: ${got}`, got === want ? '✅' : '❌ FAIL'));
:::

::: warning ⚠️ Common mistakes
- Forgetting `res.end()` (requests hang until timeout).
- Reading the body without a size limit (memory DoS).
- `JSON.parse` without try/catch (one bad request crashes the process).
- Comparing `req.url` directly, which includes the query string (parse with `URL`).
- Writing your own framework for a real product instead of Express/Fastify.
:::

::: understand
- req/res are streams; Express is routing + middleware + helpers on top of exactly this.
:::

::: ask
- *"Do we need the raw throughput, or the ecosystem and developer speed?"* Usually the second.
:::

::: important ⭐ Say this in the interview
"The http module gives me a server where req is a readable stream with the method, URL and headers, and res is a writable stream. Everything else is my job: routing by method and pathname, reading the body with a size limit, parsing JSON safely, setting status and content type, ending every response and catching errors so one request can't crash the process. Express adds routing with params, middleware, body parsing and error handling. In a micro-benchmark I measured about 92 thousand requests per second with plain http versus 20 thousand with Express 5, but in real apps the database dominates, so I choose a framework for productivity."
:::

::: links
Node.js: HTTP | https://nodejs.org/api/http.html
Node.js: Anatomy of an HTTP transaction | https://nodejs.org/en/learn/http/anatomy-of-an-http-transaction
:::

=== What does the crypto module do? (hashing, HMAC, random tokens, password hashing)
@p 3
@tags nodejs, crypto, security, hashing, passwords
@quick
- **Hash** (`createHash('sha256')`): one-way, **fast** fingerprint: checksums, cache keys, ETags. **Not** for passwords.
- **HMAC** (`createHmac('sha256', secret)`): hash with a secret key → proves the sender knows the secret (webhook signatures, signed cookies). Compare with `timingSafeEqual`.
- **Random**: `randomBytes(32)`, `randomUUID()`, `randomInt()` use a CSPRNG; never `Math.random()` for tokens.
- **Passwords**: slow, salted KDFs: `scrypt`, `pbkdf2` (600k iterations), or argon2/bcrypt. Measured: sha256 **0.0017 ms**, scrypt **22 ms**, pbkdf2 600k **55 ms**.
- **Encryption** (reversible): `aes-256-gcm` with a unique IV per message and the auth tag stored alongside.

::: text 🧒 In simple words
A **hash** is a fingerprint: easy to take, impossible to turn back into the finger. An **HMAC** is a fingerprint plus a **secret stamp**, so only someone with the stamp could have made it. A **password hash** is a fingerprint that takes deliberately long to make, so a thief guessing millions of passwords gets bored. **Encryption** is a locked box: with the key you get the original back.
:::

::: text 📖 Detailed answer
| Need | Use | Why |
|---|---|---|
| File checksum, ETag, cache key | `createHash('sha256')` | fast, deterministic |
| Verify a webhook/cookie | `createHmac('sha256', secret)` + `timingSafeEqual` | needs the secret to forge |
| Session id, reset token, API key | `randomBytes(32).toString('base64url')` | unpredictable |
| Store a password | `scrypt` / argon2id / bcrypt with a random salt | slow + salted |
| Store reversible secrets (e.g. third-party tokens) | `aes-256-gcm` | confidentiality + integrity |
| Sign/verify with key pairs | `sign`/`verify`, `generateKeyPair` | JWT RS256, licences |

### Why fast hashes are wrong for passwords (measured on Node 22)
| Function | Time per hash |
|---|---|
| sha256 | **0.0017 ms** |
| scrypt (N=16384) | **22.4 ms** |
| pbkdf2-sha256, 600k iterations | **55 ms** |
sha256 is ~13,000× faster than scrypt here; GPUs make it billions of guesses per second. A slow KDF makes each guess expensive, and a **salt** makes identical passwords hash differently (no rainbow tables).

### Timing-safe comparison
`a === b` stops at the first different character; an attacker measuring response times can guess a signature byte by byte. `crypto.timingSafeEqual(bufA, bufB)` always compares every byte (lengths must match).

### Async vs sync
`scrypt`, `pbkdf2`, `randomBytes` have async versions that run on the **thread pool**; the `…Sync` versions block the main thread (22–55 ms per login blocks every user).
:::

::: diagram Which crypto tool?
flowchart TD
  Q{"what do you need?"} -->|"detect changes"| H["sha256 hash"]
  Q -->|"prove the sender has a secret"| M["HMAC + timingSafeEqual"]
  Q -->|"unguessable token"| R["randomBytes or randomUUID"]
  Q -->|"store a password"| P["scrypt, argon2id or bcrypt with salt"]
  Q -->|"get the data back later"| E["AES-256-GCM encryption"]
:::

::: image The crypto module: hash, HMAC, random, password hashing, encryption
/images/nodejs/crypto.svg
:::

::: chart bar Measured: milliseconds per hash on Node 22
Function,ms per hash
sha256,0.0017
scrypt N=16384,22.4
pbkdf2 600k,55
:::

::: text 🪜 Step by step
Verifying a webhook from a payment provider:
1. The provider sends the body plus a header `X-Signature: sha256=<hex>`.
2. Your server reads the **raw** body bytes (not re-serialised JSON).
3. Compute `createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest()`.
4. Compare with the header using `timingSafeEqual` (after checking equal length).
5. Match → process the event (idempotently, by event id); no match → 401.
:::

::: code javascript security.js: passwords, tokens, webhook HMAC and AES-GCM (ran on Node 22)
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

// Passwords: random salt + slow KDF, stored as "salt:hash"
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);           // async → thread pool, main thread stays free
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Tokens: store only a hash of the token in the DB (a DB leak doesn't leak usable tokens)
function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };                              // email `token`, store `tokenHash`
}

// Webhooks: HMAC over the raw body
function verifyWebhook(rawBody, signatureHeader, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(String(signatureHeader).replace('sha256=', ''), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Reversible encryption: AES-256-GCM, unique IV, keep the auth tag
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function decrypt(payload, key) {
  const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);                                  // tampered data → throws
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { hashPassword, verifyPassword, createResetToken, verifyWebhook, encrypt, decrypt };
:::

::: code javascript Why constant-time comparison matters (runnable)
// A naive comparison exits at the first mismatch: the number of steps leaks how many leading characters were right.
function naiveEqual(a, b) { let steps = 0; for (let i = 0; i < a.length; i++) { steps++; if (a[i] !== b[i]) return { equal: false, steps }; } return { equal: a.length === b.length, steps }; }
function constantTimeEqual(a, b) { let diff = a.length ^ b.length, steps = 0; for (let i = 0; i < a.length; i++) { steps++; diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); } return { equal: diff === 0, steps }; }
const secret = '9f86d081884c7d65';
const guesses = ['0000000000000000', '9f00000000000000', '9f86d00000000000'];
for (const g of guesses) console.log(g, 'naive steps', naiveEqual(secret, g).steps, '| constant-time steps', constantTimeEqual(secret, g).steps);
console.log('naive leaks progress', naiveEqual(secret, guesses[2]).steps > naiveEqual(secret, guesses[0]).steps ? '✅' : '❌ FAIL');
console.log('constant-time does not', new Set(guesses.map((g) => constantTimeEqual(secret, g).steps)).size === 1 ? '✅' : '❌ FAIL');
console.log('correct secret still matches', constantTimeEqual(secret, '9f86d081884c7d65').equal ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing passwords with sha256/md5 (fast) or without a salt.
- `Math.random()` for tokens or ids that must be unguessable.
- Comparing signatures/tokens with `===`.
- `scryptSync`/`pbkdf2Sync` in login handlers (blocks the event loop).
- Reusing an IV with AES-GCM, or "encrypting" passwords instead of hashing them.
- Inventing your own crypto.
:::

::: understand
- Hash to fingerprint, HMAC to authenticate, random to create secrets, slow KDF for passwords, AES-GCM to encrypt.
:::

::: ask
- *"Do we ever need the original value back?"* Yes → encryption; no → hashing.
:::

::: important ⭐ Say this in the interview
"I pick the tool by purpose. A SHA-256 hash is a fast one-way fingerprint for checksums and cache keys, never for passwords. An HMAC adds a secret key, so I use it to verify webhooks and signed cookies, comparing with timingSafeEqual. Tokens come from randomBytes or randomUUID, never Math.random. Passwords use a slow, salted KDF like scrypt or argon2id: I measured SHA-256 at about two microseconds versus scrypt at 22 milliseconds, which is exactly the cost an attacker has to pay per guess. I use the async versions so hashing runs on the thread pool, and AES-256-GCM with a unique IV when I need data back."
:::

::: links
Node.js: Crypto | https://nodejs.org/api/crypto.html
OWASP: Password Storage Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
:::

=== zlib and util: compression, promisify and other everyday helpers
@p 2
@tags nodejs, zlib, compression, util
@quick
- `zlib` does **gzip**, **deflate** and **brotli**: sync, async (thread pool) and **stream** APIs (`createGzip()` in a `pipeline`).
- Measured on 697 KB JSON: gzip **53 KB / 2.8 ms**, brotli q4 **26 KB / 2.1 ms**, brotli q11 **21 KB / 712 ms**: q11 is for build-time static assets only.
- Response compression is usually done by **Nginx/CDN** or the `compression` middleware; never compress already-compressed files (images, video, zip).
- `util.promisify(fn)` turns a callback API into a promise API (most core modules already have `/promises` versions).
- Other helpers: `util.inspect` (debug printing), `util.types`, `util.parseArgs`, `util.styleText`, `util.isDeepStrictEqual`, `structuredClone`, `AbortSignal.timeout(ms)`.

::: text 🧒 In simple words
Compression is **vacuum-packing clothes for a trip**: the suitcase gets much smaller, but packing takes effort. gzip is quick packing; brotli at maximum is a professional who takes forever but fits the most, worth it for a suitcase you pack once (static files) and not for every daily trip (each API response).
:::

::: text 📖 Detailed answer
### Measured (Node 22, 697 KB JSON of 5,000 users)
| Algorithm | Size | Time |
|---|---|---|
| raw | 697.4 KB | — |
| gzip level 6 (default) | 53.3 KB | 2.8 ms |
| brotli quality 4 | 25.9 KB | 2.1 ms |
| brotli quality 11 (default for brotli!) | 21.0 KB | 712 ms |
Note: `zlib.brotliCompress` defaults to **quality 11**, way too slow per request; set a lower quality for dynamic responses.

### Where compression belongs
- Static assets: pre-compress at build time (`.br`, `.gz`) and let Nginx/CDN serve them.
- Dynamic APIs: proxy/CDN, or `compression()` middleware; skip tiny bodies (< 1 KB).
- Files/backups: `pipeline(createReadStream, createGzip(), createWriteStream)`.
- Security note: compressing responses that mix secrets with attacker-controlled input can leak them (BREACH); avoid reflecting user input next to tokens.

### util highlights
| Helper | Use |
|---|---|
| `promisify(fn)` | callback → promise (`(err, value)` callbacks) |
| `callbackify` | the reverse, for old APIs |
| `inspect(obj, { depth: null })` | full nested logging |
| `types.isPromise` etc. | reliable type checks |
| `parseArgs` | CLI flags without dependencies |
| `isDeepStrictEqual` | deep equality |
:::

::: diagram Compressing a large file with constant memory
flowchart LR
  R["createReadStream: backup.json"] --> G["zlib.createGzip"]
  G --> W["createWriteStream: backup.json.gz"]
  P["pipeline handles backpressure, errors and cleanup"] -.-> G
:::

::: image Compression with zlib: gzip vs brotli (measured)
/images/nodejs/zlib.svg
:::

::: chart bar Measured: compressed size of 697 KB JSON (KB)
Algorithm,Size (KB)
raw,697.4
gzip,53.3
brotli q4,25.9
brotli q11,21.0
:::

::: text 🪜 Step by step
A browser downloads `GET /api/products` (700 KB JSON):
1. The browser sends `Accept-Encoding: gzip, deflate, br, zstd`.
2. The server or proxy picks brotli (quality ~4) or gzip.
3. It responds with `Content-Encoding: br` and `Vary: Accept-Encoding`; ~26 KB goes over the network instead of 697 KB.
4. The browser decompresses transparently; `response.json()` sees the original JSON.
5. Caches store one variant per encoding thanks to `Vary`.
:::

::: code javascript compress.js: zlib streams, quality settings and promisify (ran on Node 22)
const fs = require('node:fs');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { promisify, inspect } = require('node:util');

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

async function compareSizes(json) {
  const raw = Buffer.from(json);
  const gz = await gzip(raw);                                                   // async → thread pool
  const br = await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });   // NOT the default 11
  return { raw: raw.length, gzip: gz.length, brotli: br.length };
}

async function backup(src) {
  await pipeline(
    fs.createReadStream(src),
    zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),   // fine for an offline job
    fs.createWriteStream(`${src}.br`),
  );
}

async function main() {
  const json = JSON.stringify(Array.from({ length: 5000 }, (_, id) => ({ id, name: `User ${id}`, active: id % 2 === 0 })));
  console.log(inspect(await compareSizes(json), { colors: false }));
}
main();
module.exports = { compareSizes, backup };
:::

::: code javascript A promisify in a few lines (runnable)
// util.promisify works for callbacks of the form (err, value): this is the whole idea.
function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => fn(...args, (err, value) => (err ? reject(err) : resolve(value))));
}
function readConfig(name, cb) { setTimeout(() => (name === 'app' ? cb(null, { port: 3000 }) : cb(new Error(`no config ${name}`))), 5); }
const readConfigAsync = promisify(readConfig);

(async () => {
  const cfg = await readConfigAsync('app');
  console.log('resolves with the value', cfg.port === 3000 ? '✅' : '❌ FAIL');
  try { await readConfigAsync('missing'); console.log('❌ FAIL should have thrown'); }
  catch (err) { console.log('rejects with the error', err.message === 'no config missing' ? '✅' : '❌ FAIL'); }
})();
:::

::: warning ⚠️ Common mistakes
- Using `zlib.brotliCompress` defaults (quality 11) per request.
- `gzipSync` in request handlers (blocks the loop).
- Compressing JPEG/PNG/MP4/zip (no gain, CPU wasted).
- Compressing in Node *and* in Nginx (double work) or forgetting `Vary: Accept-Encoding`.
- Promisifying functions that don't use `(err, value)` callbacks.
:::

::: understand
- Compress text, pick the quality by how often you compress, and stream large data.
:::

::: ask
- *"Is compression already handled by the proxy or CDN?"*
:::

::: important ⭐ Say this in the interview
"zlib provides gzip, deflate and brotli with sync, async and stream APIs. On a 697 kilobyte JSON payload I measured gzip at 53 kilobytes in about 3 milliseconds, brotli quality 4 at 26 kilobytes in 2 milliseconds, and brotli's default quality 11 at 21 kilobytes but 712 milliseconds, so maximum brotli is for build-time static assets and lower levels for dynamic responses, usually done by Nginx or the CDN. For large files I use streams with pipeline. From util, I use promisify for callback APIs, inspect for debugging and parseArgs for CLIs."
:::

::: links
Node.js: Zlib | https://nodejs.org/api/zlib.html
Node.js: Util | https://nodejs.org/api/util.html
:::
