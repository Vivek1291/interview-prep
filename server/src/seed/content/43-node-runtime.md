@section Node.js Runtime & Modules
@icon 🧱
@color #22c55e
@desc Phase 1 of your Node.js roadmap: engine vs runtime, Node.js architecture (V8, libuv, bindings), the libuv thread pool, the process object, npm and package.json, CommonJS vs ES Modules, and module caching. Measured on Node 22.

=== JavaScript engine vs runtime: how is Node.js different from browser JavaScript?
@p 3
@tags nodejs, v8, runtime, browser
@quick
- The **engine** (V8) only executes JavaScript: parsing, JIT compilation, call stack, heap, garbage collection, built-ins like `Array`, `Promise`, `JSON`.
- A **runtime** = engine + host APIs. **Browser**: DOM, `window`, `fetch`, `localStorage`, rendering. **Node.js**: `process`, `fs`, `http`, `crypto`, `Buffer`, streams, `setImmediate`, full OS access.
- Node.js has **no DOM** and no `window`; the global object is `globalThis` (`global`), and modules have their own scope.
- Both now share many web standards: `fetch`, `URL`, `AbortController`, Web Streams, `structuredClone`, `crypto.subtle`, timers.
- Same language, different job: the browser renders UIs in a sandbox; Node.js runs servers, CLIs and build tools on the machine.

::: text 🧒 In simple words
V8 is a **car engine**. On its own it can't take you anywhere. Put it in a **car body with wheels and seats** (the browser) and it can show web pages; put it in a **truck with a crane** (Node.js) and it can read files, talk to databases and serve thousands of requests. Same engine, different vehicle.
:::

::: text 📖 Detailed answer
### Who provides what
| Capability | Engine (V8) | Browser | Node.js |
|---|---|---|---|
| Run JS, objects, promises, JSON | ✅ | ✅ | ✅ |
| Timers (`setTimeout`) | ❌ | ✅ | ✅ (+ `setImmediate`) |
| DOM, `window`, `document` | ❌ | ✅ | ❌ |
| Files, processes, sockets | ❌ | ❌ (sandbox) | ✅ |
| `fetch`, `URL`, `AbortController` | ❌ | ✅ | ✅ |
| Storage | ❌ | localStorage, IndexedDB | files, databases |
| Module system | — | ES modules | CommonJS + ES modules |
| Event loop | — | HTML spec loop (+ rendering) | libuv loop with phases |

### Key differences that bite
- `this` at the top of a CommonJS module is `module.exports`, not `window`.
- Event loop details differ: Node has phases and `process.nextTick` (see Node.js Core).
- Security model: browser code is sandboxed; Node code can delete your disk, so dependency trust matters more.
- Globals: `__dirname`, `require` exist only in CommonJS; ES modules use `import.meta`.

### Why Node.js exists
Ryan Dahl (2009) combined V8 with an event loop and non-blocking I/O, so one process can handle many concurrent connections without a thread per request, and frontend developers can use one language on both sides.
:::

::: diagram Same engine, different hosts
flowchart TD
  V["V8 engine: runs JavaScript"] --> B["Browser runtime: DOM, fetch, storage, rendering"]
  V --> N["Node.js runtime: fs, http, crypto, process, Buffer"]
  N --> L["libuv: event loop, thread pool, OS async I/O"]
:::

::: image JavaScript engine vs runtime (browser vs Node.js)
/images/nodejs/engine-runtime.svg
:::

::: text 🪜 Step by step
Running `node app.js`:
1. Node starts V8 and creates the global environment (`globalThis`, `process`, `Buffer`, timers).
2. It loads `app.js` as a CommonJS or ES module (wrapped in its own scope).
3. V8 compiles and runs the top-level code synchronously.
4. Async operations (files, sockets, timers) are handed to libuv.
5. When nothing is pending (no timers, sockets or handles), the process exits.
:::

::: code javascript Detecting the runtime and using shared web APIs (runnable)
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
const isWorker = typeof self !== 'undefined' && typeof importScripts === 'function';
console.log({ isBrowser, isNode, isWorker });

// APIs that exist in BOTH browsers and modern Node.js
const url = new URL('https://shop.example/products?page=2&sort=price');
console.log('URL', url.searchParams.get('page') === '2' ? '✅' : '❌ FAIL');
const controller = new AbortController();
controller.abort();
console.log('AbortController', controller.signal.aborted ? '✅' : '❌ FAIL');
console.log('structuredClone', structuredClone({ d: new Date(0) }).d instanceof Date ? '✅' : '❌ FAIL');
console.log('globalThis is the global object everywhere', typeof globalThis === 'object' ? '✅' : '❌ FAIL');
console.log('fetch exists in both', typeof fetch === 'function' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Saying "Node.js is a language" or "a framework" (it's a runtime).
- Using browser-only globals (`window`, `document`, `localStorage`) in server code or SSR.
- Assuming the Node event loop is identical to the browser's.
- Treating npm packages as harmless (they run with full OS permissions).
:::

::: understand
- Engine = executes JS; runtime = engine + APIs for a host environment.
:::

::: ask
- *"Will this code run on the server, in the browser, or both (SSR)?"* It decides which APIs are allowed.
:::

::: important ⭐ Say this in the interview
"V8 is the engine: it parses, compiles and executes JavaScript and manages the heap and garbage collection, but it has no timers, files or network. A runtime wraps the engine with host APIs: the browser adds the DOM, storage and rendering inside a sandbox, while Node.js adds libuv's event loop and thread pool plus modules like fs, http, crypto, Buffer and process with full OS access. Both now share web standards like fetch, URL and AbortController, but Node has no DOM, has its own module systems and an event loop with phases."
:::

::: links
Node.js: Introduction | https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
Node.js vs the browser | https://nodejs.org/en/learn/getting-started/differences-between-nodejs-and-the-browser
:::

=== What is the Node.js architecture? (V8, libuv, bindings, core modules)
@p 3
@tags nodejs, architecture, v8, libuv, internals
@quick
- Layers: **your JS** → **core modules** (`lib/*.js`: fs, http, stream…) → **C++ bindings** + **V8** → **libuv** (event loop, thread pool, OS async APIs) → **operating system**.
- **V8** runs JavaScript (JIT, heap, GC). **libuv** is a C library providing the **event loop** and **asynchronous I/O** across platforms.
- Network I/O uses the OS's async mechanisms (**epoll** on Linux, **kqueue** on macOS, **IOCP** on Windows); file system, DNS lookup, some crypto and zlib use libuv's **thread pool**.
- Your JavaScript runs on **one main thread**; Node as a process uses several threads (thread pool, V8 GC/compiler threads).
- "Single-threaded" means **your JS code** runs on one thread at a time, not that Node only has one thread.

::: text 🧒 In simple words
Node.js is a **restaurant with one head chef** (your JavaScript on the main thread). The chef never waits: deliveries (network) are handled by the doorbell system (the OS), and slow chores like peeling potatoes (file reads, hashing) go to **four kitchen assistants** (the thread pool). When a task is done, a note is put on the chef's board (the event loop queue).
:::

::: text 📖 Detailed answer
### The pieces
| Layer | What it is | Examples |
|---|---|---|
| Application | your code + npm packages | Express routes, services |
| Core modules | JavaScript APIs shipped with Node | `fs`, `http`, `net`, `crypto`, `stream`, `events` |
| Bindings | C++ glue between JS and C libraries | `internalBinding('fs')` |
| V8 | JavaScript engine | JIT (Ignition, Sparkplug, Maglev, TurboFan), GC (Orinoco) |
| libuv | event loop + async I/O + thread pool | timers, poll phase, `uv_fs_*` work |
| Other C libraries | OpenSSL, zlib, llhttp, c-ares, ICU | TLS, compression, HTTP parsing, DNS |
| OS | kernel facilities | epoll/kqueue/IOCP, threads, file descriptors |

### Following one call: `fs.readFile('a.txt', cb)`
1. JS calls the fs core module, which calls the C++ binding.
2. The binding asks libuv to read the file; libuv sends the job to a **thread-pool** thread.
3. The main thread continues running other JavaScript immediately (non-blocking).
4. The worker thread does the blocking `read()` system calls.
5. When done, libuv queues the completion; in the **poll** phase the event loop runs `cb` on the main thread.

### And a socket: `http` request
No thread pool: libuv registers the socket with **epoll/kqueue**; the OS notifies when data arrives; the poll phase runs the callback. That's why Node handles thousands of idle connections cheaply.
:::

::: diagram Layers of Node.js
flowchart TD
  A["your JavaScript"] --> M["core modules: fs, http, crypto, stream"]
  M --> BND["C++ bindings"]
  BND --> V8["V8: executes JS, heap, GC"]
  BND --> UV["libuv: event loop and thread pool"]
  UV --> OS["OS: epoll, kqueue, IOCP, files, sockets"]
  BND --> LIBS["OpenSSL, zlib, llhttp, c-ares"]
:::

::: image Node.js architecture
/images/nodejs/architecture.svg
:::

::: text 🪜 Step by step
A request to an Express route that reads a file:
1. The OS reports a new connection on the listening socket (kqueue/epoll) → poll phase → `http` parses it with llhttp.
2. Express middleware runs on the main thread (your JS).
3. The route calls `fs.promises.readFile` → libuv thread pool does the read.
4. Meanwhile the main thread serves other requests.
5. Completion → promise resolves → your code continues and writes the response through the socket (OS async again).
:::

::: code javascript Seeing the threads and versions inside a Node process
const os = require('node:os');
const { execSync } = require('node:child_process');

console.log('versions:', process.versions.node, 'V8', process.versions.v8, 'libuv', process.versions.uv, 'OpenSSL', process.versions.openssl);
console.log('CPU cores:', os.availableParallelism());

// start some thread-pool work so its threads exist
require('node:crypto').pbkdf2('x', 'y', 100000, 32, 'sha256', () => {});
require('node:fs').readFile(__filename, () => {});

setTimeout(() => {
  // macOS: count this process's threads (Linux: ls /proc/<pid>/task | wc -l)
  const threads = execSync(`ps -M ${process.pid} | tail -n +2 | wc -l`).toString().trim();
  console.log(`threads in this "single-threaded" process: ${threads}`);   // main + 4 pool + V8 helpers…
}, 200);
:::

::: warning ⚠️ Common mistakes
- "Node.js is single-threaded, so it can only do one thing at a time" (I/O happens concurrently; only your JS is single-threaded).
- Thinking all async work uses the thread pool (network I/O doesn't).
- Calling V8 "the event loop" (the loop is libuv's).
- Ignoring that CPU-heavy JavaScript still blocks the one main thread.
:::

::: understand
- JS on one thread + async I/O via libuv and the OS = high concurrency for I/O-bound servers.
:::

::: ask
- *"Is this workload I/O-bound or CPU-bound?"* Node excels at the first; the second needs workers.
:::

::: important ⭐ Say this in the interview
"Node.js is layered: my JavaScript and npm packages call core modules like fs and http, which go through C++ bindings to V8, which executes the JavaScript, and to libuv, which provides the event loop, a thread pool and cross-platform async I/O, plus libraries like OpenSSL and zlib. Network I/O uses the OS's async mechanisms such as epoll or kqueue, while file system work, DNS lookups and some crypto run on the libuv thread pool. My JavaScript runs on a single main thread, but the process itself has several threads, so single-threaded really describes the JavaScript execution, not the runtime."
:::

::: links
Node.js: About Node.js | https://nodejs.org/en/about
libuv design overview | https://docs.libuv.org/en/v1.x/design.html
:::

=== What is the libuv thread pool, and when does UV_THREADPOOL_SIZE matter?
@p 3
@tags nodejs, libuv, thread-pool, performance
@quick
- libuv keeps a **thread pool (default 4 threads)** for work that can't be done with OS async APIs: **fs.\***, **dns.lookup**, **crypto** (`pbkdf2`, `scrypt`, async `randomBytes`), **zlib** async, some user addons.
- Network sockets, timers and your JavaScript do **not** use it.
- Measured: 8 parallel `pbkdf2` calls (37 ms each): pool 1 → **300 ms**, 2 → **153 ms**, 4 → **83 ms** (two batches), 8 → **53 ms**.
- Tune with `UV_THREADPOOL_SIZE` (max 1024) set **before** the pool is first used (env var or at the very top of the entry file).
- A saturated pool makes unrelated `fs`/`dns` calls wait: e.g. heavy password hashing slows file reads.

::: text 🧒 In simple words
The thread pool is a **team of 4 helpers** in the back room. If 8 slow jobs arrive at once, 4 start immediately and the other 4 **queue at the door**. Hire more helpers (bigger pool) and more jobs run at the same time, as long as you have enough CPU cores for them to actually work in parallel.
:::

::: text 📖 Detailed answer
### What uses the pool
| Uses the thread pool | Doesn't |
|---|---|
| `fs` (except `fs.watch` and sync APIs, which block the main thread) | TCP/UDP sockets, HTTP |
| `dns.lookup` (used by `http.get('hostname')`) | `dns.resolve*` (c-ares, async network) |
| `crypto.pbkdf2`, `scrypt`, `randomBytes`/`randomFill` async, `generateKeyPair` | timers, `setImmediate` |
| `zlib` async APIs | your JavaScript (main thread) |

### Measured (Node 22, 11-core M3 Pro, 8 × `pbkdf2(200k iterations, sha512)`)
| `UV_THREADPOOL_SIZE` | Completion times (ms) |
|---|---|
| 1 | 40, 78, 115, 152, 189, 226, 263, **300** |
| 2 | 39, 39, 76, 77, 114, 115, 152, **153** |
| 4 (default) | 42, 42, 42, 42, 82, 83, 83, **83** |
| 8 | 45, 45, 46, 49, 50, 51, 52, **53** |
With 4 threads you can see two "batches"; with 8 all ran in parallel.

### Sizing
- Increase it if you do lots of concurrent fs/crypto/dns work and have spare cores (e.g. 8–16).
- More threads than cores doesn't make CPU work faster; it just adds contention.
- For CPU-heavy **JavaScript**, the pool doesn't help: use `worker_threads`.
- Watch out for `dns.lookup` contention: many outgoing HTTP calls to hostnames share the pool with fs and crypto.
:::

::: diagram Jobs queuing for 4 pool threads
flowchart LR
  J["8 pbkdf2 jobs"] --> Q["libuv work queue"]
  Q --> T1["thread 1"]
  Q --> T2["thread 2"]
  Q --> T3["thread 3"]
  Q --> T4["thread 4"]
  T1 --> D["done → callbacks queued for the event loop (jobs 5 to 8 waited)"]
  T4 --> D
:::

::: image The libuv thread pool (measured)
/images/nodejs/thread-pool.svg
:::

::: chart bar Measured: time until 8 parallel pbkdf2 calls finish, by thread pool size (ms)
UV_THREADPOOL_SIZE,All done (ms)
1,300
2,153
4 (default),83
8,53
:::

::: text 🪜 Step by step
Login endpoint slows down file uploads:
1. Each login runs `crypto.scrypt` (≈ 22 ms on the pool).
2. A login spike queues 20 scrypt jobs; with 4 threads the queue is 5 batches deep.
3. A file upload's `fs.write` joins the **same** queue and waits behind them.
4. Uploads look slow although the disk is idle.
5. Fix: raise `UV_THREADPOOL_SIZE` to match cores, rate-limit logins, or move hashing to dedicated workers/services.
:::

::: code javascript pool.js: reproduce the measurement (run with different UV_THREADPOOL_SIZE values)
// UV_THREADPOOL_SIZE=1 node pool.js   →   all done at ~300 ms
// UV_THREADPOOL_SIZE=8 node pool.js   →   all done at ~53 ms
const crypto = require('node:crypto');

const N = 8;
const start = Date.now();
const finished = [];
for (let i = 0; i < N; i++) {
  crypto.pbkdf2('secret', 'salt', 200_000, 64, 'sha512', () => {
    finished.push(Date.now() - start);
    if (finished.length === N) {
      console.log(`pool size ${process.env.UV_THREADPOOL_SIZE || 4}: finished at`, finished.join(', '), 'ms');
    }
  });
}
:::

::: code javascript Simulating a fixed-size pool (runnable)
function simulatePool(jobs, jobMs, poolSize) {
  const free = Array(poolSize).fill(0);
  return Array.from({ length: jobs }, () => {
    free.sort((a, b) => a - b);
    free[0] += jobMs;                      // next job starts when a thread is free
    return free[0];
  }).sort((a, b) => a - b);
}
for (const size of [1, 2, 4, 8]) console.log(`pool ${size}:`, simulatePool(8, 37, size).join(', '));
console.log('default pool: two batches of 4', simulatePool(8, 37, 4).join() === '37,37,37,37,74,74,74,74' ? '✅ (measured 42 then 83 ms)' : '❌ FAIL');
console.log('8 threads: one batch', Math.max(...simulatePool(8, 37, 8)) === 37 ? '✅ (measured 53 ms)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Setting `process.env.UV_THREADPOOL_SIZE` after the pool already started (no effect).
- Believing the pool makes CPU-heavy JavaScript parallel.
- Huge pool sizes on small containers (2 vCPUs don't run 64 threads in parallel).
- Synchronous APIs (`readFileSync`, `pbkdf2Sync`) in request handlers: they block the main thread instead.
:::

::: understand
- The pool is the hidden queue behind fs, dns.lookup, crypto and zlib; size it to the work and the cores.
:::

::: ask
- *"How many cores does the container get?"* Pool size beyond that won't speed up CPU-bound pool work.
:::

::: important ⭐ Say this in the interview
"libuv has a thread pool, four threads by default, for operations without good OS-level async APIs: file system calls, dns.lookup, crypto functions like pbkdf2 and scrypt, and asynchronous zlib. Network sockets and timers don't use it, and my JavaScript never runs on it. If more jobs arrive than threads, they queue: I measured eight parallel pbkdf2 calls finishing at 300 milliseconds with one thread, 83 with the default four, in two visible batches, and 53 with eight. I can raise UV_THREADPOOL_SIZE before the pool starts, but for CPU-heavy JavaScript I use worker threads instead."
:::

::: links
Node.js: Don't block the event loop (worker pool) | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
libuv: Thread pool work scheduling | https://docs.libuv.org/en/v1.x/threadpool.html
:::

=== What is the process object? (env, argv, exit codes, signals)
@p 2
@tags nodejs, process, env, signals
@quick
- `process` is a global describing the **running Node process**: `argv`, `env`, `pid`, `platform`, `cwd()`, `memoryUsage()`, `uptime()`, `exitCode`, `nextTick`.
- `process.env` values are **strings** (or undefined): parse and validate config at startup (`Number(process.env.PORT ?? 3000)`).
- **Exit codes**: `0` success, non-zero failure; set `process.exitCode = 1` and let the process end naturally rather than `process.exit()` mid-work.
- **Signals**: `SIGTERM` (Docker/Kubernetes stop) and `SIGINT` (Ctrl+C) → graceful shutdown.
- `uncaughtException`/`unhandledRejection` handlers are for **logging and exiting**, not for continuing (Node 15+ crashes on unhandled rejections by default).

::: text 🧒 In simple words
`process` is your program's **ID card and phone**: who you are (pid, platform), what you were told when started (arguments, environment settings), how to report back (exit code), and the phone that rings when the operating system says "please stop now" (signals).
:::

::: text 📖 Detailed answer
| API | Use |
|---|---|
| `process.argv` | `['/usr/bin/node', '/app/cli.js', '--port=3000']` (use `util.parseArgs`) |
| `process.env.X` | configuration (12-factor); strings only |
| `process.exitCode = 1` | mark failure without cutting off pending writes |
| `process.exit(code)` | stop immediately (pending async work is lost) |
| `process.on('SIGTERM', fn)` | graceful shutdown |
| `process.on('uncaughtException')` | last-resort logging, then exit |
| `process.memoryUsage()` | `rss`, `heapUsed`, `heapTotal`, `external` |
| `process.nextTick(fn)` | run before promise microtasks |
| `process.hrtime.bigint()` | high-resolution timing |
| `process.stdout/stderr/stdin` | streams |

### Config pattern
Read and validate all env vars **once** at startup (with zod or similar) and export a typed `config` object; fail fast with a clear error if something is missing.

### Exit codes matter
CI, Docker restart policies and Kubernetes use exit codes: `0` = finished OK, `1` = error. A crashing process should exit non-zero so the orchestrator restarts it.
:::

::: diagram Lifecycle of a Node process
flowchart LR
  S["node app.js with argv and env"] --> C["validate config"]
  C -->|"invalid"| X1["exit 1 with a clear message"]
  C --> R["run: serve requests"]
  R --> SIG["SIGTERM or SIGINT"]
  SIG --> G["graceful shutdown"]
  G --> X0["exit 0"]
  R --> U["uncaught error"]
  U --> L["log it, exit 1, let the orchestrator restart"]
:::

::: image The process object
/images/nodejs/process.svg
:::

::: text 🪜 Step by step
`docker stop` on a Node container:
1. Docker sends **SIGTERM** to PID 1 in the container.
2. If Node is PID 1 without a handler, the signal may be ignored → after 10 s Docker sends **SIGKILL** (requests cut off).
3. With `process.on('SIGTERM', shutdown)` (or `node --init`/tini as PID 1), Node stops accepting connections, finishes in-flight requests and closes DB pools.
4. It sets `process.exitCode = 0` and exits naturally.
5. Docker records a clean stop.
:::

::: code javascript config.js: validated configuration from process.env
const { parseArgs } = require('node:util');

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name}`);
  return value;
}

function loadConfig() {
  const { values } = parseArgs({ options: { port: { type: 'string' }, verbose: { type: 'boolean', default: false } } });
  const port = Number(values.port ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${values.port ?? process.env.PORT}`);
  return Object.freeze({
    env: process.env.NODE_ENV ?? 'development',
    port,
    databaseUrl: required('DATABASE_URL'),
    verbose: values.verbose,
  });
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exitCode = 1;                      // fail fast, but let stderr flush
}
module.exports = { config };
:::

::: code javascript Parsing env strings safely (runnable)
// process.env only contains strings: convert and validate explicitly.
const env = { PORT: '8080', DEBUG: 'false', MAX_UPLOAD_MB: '10', TIMEOUT_MS: 'abc' };
const toInt = (v, fallback) => { const n = Number(v); return v === undefined ? fallback : Number.isInteger(n) ? n : NaN; };
const toBool = (v) => v === 'true' || v === '1';
const config = { port: toInt(env.PORT, 3000), debug: toBool(env.DEBUG), maxUploadMb: toInt(env.MAX_UPLOAD_MB, 5), timeoutMs: toInt(env.TIMEOUT_MS, 5000) };
console.log(config);
console.log("'false' is a truthy string, so parse it", Boolean(env.DEBUG) === true && config.debug === false ? '✅' : '❌ FAIL');
const invalid = Object.entries(config).filter(([, v]) => Number.isNaN(v)).map(([k]) => k);
console.log('invalid values are caught at startup', invalid.join() === 'timeoutMs' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `if (process.env.DEBUG)` when it's `'false'` (any non-empty string is truthy).
- Reading `process.env` all over the code instead of one validated config module.
- `process.exit()` right after `console.log`/writes (output may be lost).
- Keeping the process alive after `uncaughtException` (state may be corrupt).
- Node as PID 1 in Docker ignoring SIGTERM.
:::

::: understand
- `process` connects your program to the OS: inputs (argv, env), outputs (exit codes, streams) and events (signals).
:::

::: ask
- *"How is the app stopped in production (Docker, Kubernetes, PM2)?"* That defines the signals to handle.
:::

::: important ⭐ Say this in the interview
"process represents the running Node process: argv for command-line arguments, env for configuration, pid, cwd, memoryUsage, nextTick and exit codes. Environment variables are always strings, so I parse and validate them once at startup and fail fast with exit code one if something's missing. I handle SIGTERM and SIGINT for graceful shutdown, since that's how Docker and Kubernetes stop containers, and I treat uncaughtException and unhandledRejection as last-resort logging before exiting, letting the orchestrator restart a clean process."
:::

::: links
Node.js: process | https://nodejs.org/api/process.html
Node.js: util.parseArgs | https://nodejs.org/api/util.html#utilparseargsconfig
:::

=== npm, package.json, package-lock.json, npx and semver
@p 2
@tags nodejs, npm, package-json, semver, dependencies
@quick
- `package.json`: name, scripts, `dependencies` (runtime) vs `devDependencies` (build/test), `"type": "module"`, `"engines"`, `"exports"`.
- **Semver** `MAJOR.MINOR.PATCH`: `^5.1.0` → `>=5.1.0 <6.0.0`; `~4.1.2` → `>=4.1.2 <4.2.0`; `5.1.0` → exact.
- **`package-lock.json`** records the exact version (and integrity hash) of **every** installed package, including transitive ones: commit it.
- `npm ci` installs exactly the lockfile (clean, fast, for CI/Docker); `npm install` may update it.
- `npx tool` runs a package binary without a global install; `npm audit` checks known vulnerabilities; pin Node with `.nvmrc`/`engines`.

::: text 🧒 In simple words
`package.json` is your **shopping list** ("milk, any brand from version 5"), and `package-lock.json` is the **receipt** with the exact product and batch number you actually bought. Committing the receipt means every teammate and the server get exactly the same groceries.
:::

::: text 📖 Detailed answer
### Semver ranges
| Range | Means | Example matches |
|---|---|---|
| `^5.1.0` | compatible with 5.x (no breaking major) | 5.1.0, 5.4.2 (not 6.0.0) |
| `^0.3.1` | for 0.x, caret only allows patches | 0.3.9 (not 0.4.0) |
| `~4.1.2` | patch updates only | 4.1.9 (not 4.2.0) |
| `4.1.2` | exactly | 4.1.2 |
| `>=18` | any version at least 18 | `engines` field |

### Lockfile and installs
- `npm install`: resolves ranges, may update the lockfile.
- `npm ci`: deletes `node_modules`, installs exactly what the lockfile says, fails if `package.json` and the lockfile disagree. Use it in CI and Dockerfiles.
- Supply-chain hygiene: review new dependencies, `npm audit`, Dependabot/Renovate, avoid running unknown install scripts (`--ignore-scripts` where possible).

### Useful fields
`"scripts"` (`npm run dev`), `"type": "module"`, `"exports"` (public entry points), `"engines": { "node": ">=22" }`, `"files"` (what gets published), `"workspaces"` (monorepos).

### npx
Runs the binary from local `node_modules/.bin` or downloads it temporarily: `npx prisma migrate dev`, `npx create-next-app`.
:::

::: diagram From package.json to node_modules
flowchart LR
  P["package.json: ranges like ^5.1.0"] --> I{"npm install or npm ci?"}
  I -->|"npm install"| R["resolve ranges, update package-lock.json"]
  I -->|"npm ci"| L["exact versions from package-lock.json"]
  R --> N["node_modules"]
  L --> N
:::

::: image npm, package.json, lockfiles and semver
/images/nodejs/npm.svg
:::

::: text 🪜 Step by step
Why "works on my machine" happens without a lockfile:
1. `package.json` says `"lib": "^2.3.0"`.
2. You installed in March and got 2.3.4.
3. In May, 2.4.0 is released with a subtle bug.
4. CI installs fresh and gets 2.4.0 → tests fail only in CI.
5. With a committed `package-lock.json` and `npm ci`, CI gets 2.3.4, exactly like you; upgrades become deliberate PRs.
:::

::: code json package.json for a Node.js API
{
  "name": "orders-api",
  "version": "1.4.0",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test",
    "lint": "eslint .",
    "audit": "npm audit --omit=dev"
  },
  "dependencies": {
    "express": "^5.1.0",
    "pino": "^9.6.0",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "eslint": "^9.20.0",
    "supertest": "^7.1.0"
  }
}
:::

::: code javascript A tiny semver range checker (runnable)
const parse = (v) => v.split('.').map(Number);
function satisfies(version, range) {
  const [M, m, p] = parse(version);
  if (range.startsWith('^')) {
    const [RM, Rm, Rp] = parse(range.slice(1));
    if (RM === 0) return M === 0 && m === Rm && p >= Rp;           // ^0.x only allows patches
    return M === RM && (m > Rm || (m === Rm && p >= Rp));
  }
  if (range.startsWith('~')) { const [RM, Rm, Rp] = parse(range.slice(1)); return M === RM && m === Rm && p >= Rp; }
  return version === range;
}
const cases = [['5.4.2', '^5.1.0', true], ['6.0.0', '^5.1.0', false], ['4.1.9', '~4.1.2', true], ['4.2.0', '~4.1.2', false], ['0.3.9', '^0.3.1', true], ['0.4.0', '^0.3.1', false], ['9.6.0', '9.6.0', true]];
for (const [v, r, expected] of cases) console.log(`${v} satisfies ${r}?`.padEnd(26), satisfies(v, r), satisfies(v, r) === expected ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Not committing `package-lock.json` (non-reproducible installs).
- `npm install` in CI/Docker instead of `npm ci`.
- Putting build/test tools in `dependencies` (bigger production images).
- Global installs of project tools instead of `npx`/local devDependencies.
- Blindly running `npm audit fix --force` (can jump major versions).
:::

::: understand
- Ranges express intent; the lockfile freezes reality; `npm ci` reproduces it.
:::

::: ask
- *"How are dependency updates handled (Renovate/Dependabot, review)?"*
:::

::: important ⭐ Say this in the interview
"package.json declares scripts and dependency ranges using semver: caret allows minor and patch updates within the same major, tilde only patches, and an exact version pins. The package-lock.json records the exact resolved version and integrity hash of every package including transitive ones, so I commit it and use npm ci in CI and Docker for reproducible installs. devDependencies hold build and test tools, npx runs binaries without global installs, and I keep the supply chain healthy with audit, automated update PRs and reviewing new dependencies."
:::

::: links
npm: package.json | https://docs.npmjs.com/cli/configuring-npm/package-json
npm: package-lock.json | https://docs.npmjs.com/cli/configuring-npm/package-lock-json
semver calculator | https://semver.npmjs.com/
:::

=== CommonJS vs ES Modules in Node.js
@p 3
@tags nodejs, modules, commonjs, esm
@quick
- **CommonJS**: `require()` / `module.exports`, loaded **synchronously** at run time; `__dirname`, `__filename` available. Default for `.js` without `"type": "module"`, and for `.cjs`.
- **ES Modules**: `import`/`export`, **static** graph analysed before running, async loading, **top-level await**, tree-shakable; `.mjs` or `.js` with `"type": "module"`; use `import.meta.dirname`/`import.meta.url`.
- Interop: ESM can `import` CommonJS (as a default export, plus detectable named exports); modern Node can `require()` ESM **unless it uses top-level await** (measured: `ERR_REQUIRE_ASYNC_MODULE`).
- Dynamic `import()` works in both and returns a promise (lazy loading).
- New projects: ESM; existing CommonJS codebases are fine; don't mix within one package without reason.

::: text 🧒 In simple words
CommonJS is **ordering food dish by dish while you eat**: each `require` fetches a module right when that line runs. ES modules are **the whole menu planned before the meal starts**: Node reads every `import` first, builds the full plan, then serves, which makes it possible to skip dishes nobody ordered (tree-shaking).
:::

::: text 📖 Detailed answer
| | CommonJS | ES Modules |
|---|---|---|
| Syntax | `const x = require('x')`, `module.exports = …` | `import x from 'x'`, `export …` |
| When resolved | at run time, synchronously | before execution (static) |
| Conditional/dynamic loading | `require` anywhere | `await import()` |
| Top-level `await` | ❌ | ✅ |
| `this` at top level | `module.exports` | `undefined` |
| File path globals | `__dirname`, `__filename` | `import.meta.dirname`, `import.meta.filename` |
| JSON | `require('./data.json')` | `import data from './data.json' with { type: 'json' }` |
| Bindings | copy of `module.exports` value | **live bindings** (exports update) |
| Tree-shaking | hard | yes |

### Which one is used?
1. `.cjs` → CommonJS; `.mjs` → ESM.
2. `.js` → the nearest `package.json` `"type"` field (`"module"` or default `"commonjs"`); newer Node versions also detect ESM syntax.

### Interop (measured on Node 22)
- `import cjs from './counter.js'` in an `.mjs` file → the CommonJS `module.exports` object.
- `createRequire(import.meta.url)` gives ESM code a `require` function.
- `require('./esm.mjs')` → works for synchronous ESM; with top-level await it throws `ERR_REQUIRE_ASYNC_MODULE`.
:::

::: diagram How Node decides the module system
flowchart TD
  F["file to load"] --> E{"extension"}
  E -->|".cjs"| C["CommonJS"]
  E -->|".mjs"| M["ES module"]
  E -->|".js"| T{"nearest package.json type"}
  T -->|"module"| M
  T -->|"commonjs or missing"| C
:::

::: image CommonJS vs ES Modules
/images/nodejs/cjs-esm.svg
:::

::: text 🪜 Step by step
Loading `import { createUser } from './users.js'` in an ESM project:
1. Parse `app.js`, find every `import`, without running anything.
2. Resolve and fetch `./users.js` (the extension is required in ESM) and its imports, recursively → module graph.
3. Link: connect each import to the exporting module's binding (live).
4. Evaluate modules in dependency order (deepest first); top-level `await` can pause evaluation.
5. CommonJS instead runs `app.js` top to bottom and loads `users.js` only when the `require` line executes.
:::

::: code javascript The same module in CommonJS and ESM, plus interop (ran on Node 22)
// ---- users.cjs (CommonJS) ----
const crypto = require('node:crypto');
function createUser(name) { return { id: crypto.randomUUID(), name }; }
module.exports = { createUser };

// ---- users.mjs (ES module) ----
// import { randomUUID } from 'node:crypto';
// export function createUser(name) { return { id: randomUUID(), name }; }
// export const loadedAt = new Date();                     // live binding
// const config = await import('./config.mjs');           // top-level await / dynamic import
// console.log(import.meta.dirname);                      // instead of __dirname

// ---- app.mjs: interop ----
// import users from './users.cjs';                        // CJS module.exports as the default import
// import { createRequire } from 'node:module';
// const require = createRequire(import.meta.url);        // require() inside ESM
// const legacy = require('./legacy.cjs');
:::

::: code javascript Live bindings vs copied values (runnable model)
// CommonJS copies the exported VALUE at require time; ESM imports are live bindings to the variable.
function commonjsModule() { let count = 0; return { exports: { count, inc() { count++; } }, read: () => count }; }
const cjs = commonjsModule();
const { count, inc } = cjs.exports;     // destructured copy, like const { count } = require('./m')
inc(); inc();
console.log('CommonJS-style copy still sees', count, '| real value', cjs.read());
console.log('copied value does not update', count === 0 && cjs.read() === 2 ? '✅' : '❌ FAIL');

// A live binding behaves like a getter on the module's variable
function esmModule() { let count = 0; return { get count() { return count; }, inc() { count++; } }; }
const esm = esmModule();
esm.inc(); esm.inc();
console.log('ESM-style live binding sees', esm.count, esm.count === 2 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Omitting file extensions in ESM relative imports (`./users` must be `./users.js`).
- Using `__dirname` in ESM (use `import.meta.dirname`/`import.meta.url`).
- `require()`ing an ESM package that uses top-level await.
- Mixing `module.exports` and `export` in one file.
- Assuming named imports from CommonJS always work (only statically detectable exports).
:::

::: understand
- CommonJS = runtime, synchronous, copies; ESM = static graph, async, live bindings, top-level await.
:::

::: ask
- *"Is the package published for both (dual package) or ESM-only?"* It affects consumers.
:::

::: important ⭐ Say this in the interview
"CommonJS uses require and module.exports and loads modules synchronously at run time, which is why require can appear anywhere; ES modules use import and export, Node builds the whole module graph before running anything, which enables top-level await, live bindings and tree-shaking. Node picks the system by extension, .cjs or .mjs, or by the type field in package.json for .js files. ESM can import CommonJS as a default export and use createRequire, and modern Node can require ESM unless it uses top-level await: I measured that error, ERR_REQUIRE_ASYNC_MODULE. For new code I use ESM."
:::

::: links
Node.js: Modules (ESM) | https://nodejs.org/api/esm.html
Node.js: CommonJS modules | https://nodejs.org/api/modules.html
Node.js: Determining the module system | https://nodejs.org/api/packages.html#determining-module-system
:::

=== How do module caching, resolution and circular dependencies work?
@p 2
@tags nodejs, modules, require-cache, circular-dependencies
@quick
- Modules are **evaluated once** and **cached** (`require.cache` / the ESM module map): every `require('./counter')` returns the **same instance** (measured: evaluated once, `c1 === c2`).
- That makes a module a natural **singleton** (shared config, DB pool), but also shares mutable state.
- `require('x')` resolution: core module → relative/absolute path (with `.js`, `.json`, `.node`, `dir/index.js`) → `node_modules` folders walking up → `package.json` `"exports"`/`"main"`.
- **Circular dependencies**: `a` requires `b` which requires `a` → `b` gets a **partially loaded** `a` (measured: `a.done === false` inside `b`).
- Fix cycles by extracting shared code into a third module, using dependency injection, or requiring lazily inside the function.

::: text 🧒 In simple words
The module cache is a **library desk that lends the same book** to everyone who asks: it's printed once. A circular dependency is two people who each **need the other's finished homework to finish their own**: one of them has to hand over a half-done copy.
:::

::: text 📖 Detailed answer
### Caching
- The first `require` runs the module and stores `module.exports` in `require.cache[resolvedPath]`.
- Later `require`s return the cached exports without re-running the file.
- Different resolved paths (e.g. two copies in different `node_modules`) are **different** instances: a source of "two Reacts" or duplicate singletons.
- Deleting from `require.cache` forces a reload (useful in tests, rarely in apps).

### Resolution of `require('lodash')` from `/app/src/services/x.js`
1. Is it a core module (`fs`, `node:fs`)? → load it.
2. Starts with `./`, `../`, `/`? → try the file, then `.js`, `.json`, `.node`, then `dir/package.json` main / `dir/index.js`.
3. Otherwise search `node_modules/lodash` in `/app/src/services`, `/app/src`, `/app`, `/` → use its `package.json` `"exports"` (or `"main"`).

### Circular dependencies (measured)
`a.js` sets `exports.done = false`, requires `b`; `b.js` requires `a` → gets the **partial** exports (`done: false`), finishes; back in `a`, `b.done` is `true`. Code in `b` that uses `a`'s functions at load time fails mysteriously (`a.fn is not a function`).

### ESM
Same idea (module map keyed by URL); cycles behave better thanks to live bindings, but accessing a binding before it's initialised throws a `ReferenceError` (TDZ).
:::

::: diagram A circular require
sequenceDiagram
  participant A as a.js
  participant B as b.js
  A->>A: "exports.done = false"
  A->>B: "require('./b')"
  B->>A: "require('./a') returns the PARTIAL exports"
  Note over B: "a.done is false here"
  B-->>A: "b finishes: exports.done = true"
  A->>A: "continues: b.done is true, exports.done = true"
:::

::: image Module caching, resolution and circular dependencies
/images/nodejs/modules-cache.svg
:::

::: text 🪜 Step by step
A shared database pool through the module cache:
1. `db.js` creates `const pool = new Pool(config)` and exports it.
2. `users.js` and `orders.js` both `require('./db')`.
3. `db.js` runs once → one pool with 10 connections for the whole app (not 10 per file).
4. In tests, the same cached pool is reused across test files in one process; close it in an `after` hook.
5. If a library is installed twice (different versions), each copy has its own cache entry and state.
:::

::: code javascript The measured demo: cache and circular dependency (ran on Node 22)
// ---- counter.js ----
let count = 0;
console.log('counter.js evaluated');
module.exports = { inc: () => ++count };

// ---- a.js ----
// exports.done = false;
// const b = require('./b');
// console.log('in a, b.done =', b.done);          // true
// exports.done = true;

// ---- b.js ----
// exports.done = false;
// const a = require('./a');
// console.log('in b, a.done =', a.done);          // false: a is only partially loaded
// exports.done = true;

// ---- main.js ----
// const c1 = require('./counter');                // prints "counter.js evaluated" once
// const c2 = require('./counter');                // from require.cache
// c1.inc(); console.log(c1 === c2, c2.inc());     // true 2
// require('./a');
:::

::: code javascript A tiny require with a cache and cycle handling (runnable)
// Simplified version of Node's CommonJS loader.
const sources = {
  counter: (module) => { let count = 0; module.exports = { inc: () => ++count }; },
  a: (module, require) => { module.exports.done = false; const b = require('b'); module.exports.sawB = b.done; module.exports.done = true; },
  b: (module, require) => { module.exports.done = false; const a = require('a'); module.exports.sawA = a.done; module.exports.done = true; },
};
const cache = {};
let evaluations = 0;
function require(name) {
  if (cache[name]) return cache[name].exports;               // cached (even if still loading!)
  const module = { exports: {} };
  cache[name] = module;                                      // cached BEFORE running: this is what makes cycles "work"
  evaluations++;
  sources[name](module, require);
  return module.exports;
}
const c1 = require('counter'), c2 = require('counter');
c1.inc();
console.log('same instance, evaluated once', c1 === c2 && c2.inc() === 2 && evaluations === 1 ? '✅' : '❌ FAIL');
const a = require('a');
console.log('b saw a partially loaded a', require('b').sawA === false && a.sawB === true ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Assuming each `require` creates a fresh instance.
- Mutable module-level state leaking between tests or requests.
- Circular dependencies between services/models (half-initialised exports).
- Duplicate packages in `node_modules` breaking singletons (`npm ls pkg` to check).
- Relying on `index.js` barrels that import everything (cycles and slow startup).
:::

::: understand
- One evaluation per resolved path; cycles see whatever was exported so far.
:::

::: ask
- *"Do these two modules really need each other, or is there a missing third module?"*
:::

::: important ⭐ Say this in the interview
"Node evaluates each module once and caches it by its resolved path, so every require of the same file returns the same instance; I measured a counter module being evaluated once and two requires sharing state. That's why a module works as a singleton for a database pool, but also why mutable module state is shared. Resolution checks core modules, then relative paths with extensions and index files, then node_modules folders walking up, honouring package.json exports. With a circular dependency, the second module receives the first one's partially filled exports, so I break cycles by extracting shared code, injecting dependencies or requiring lazily."
:::

::: links
Node.js: Modules (caching, cycles) | https://nodejs.org/api/modules.html#caching
Node.js: All together (resolution algorithm) | https://nodejs.org/api/modules.html#all-together
:::
