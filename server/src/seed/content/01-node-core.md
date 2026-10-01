@section Node.js Core
@icon 🟢
@color #22c55e
@desc Event loop, async patterns, threads, streams, buffers and EventEmitter: the foundations every Node interview starts with. Every answer has simple words, a detailed explanation, diagrams, measured charts, runnable code and a model interview answer.

=== How does the Node.js event loop work? (explain with an example)
@p 3
@tags event-loop, libuv, async
@quick
- Your JS runs on **one call stack**; slow I/O is handed to **libuv / the OS**; finished work comes back as **callbacks in queues**.
- Event loop = "when the call stack is empty, take the next callback from the queues and run it".
- Order to remember: **sync code → `process.nextTick` → Promise microtasks → timers → I/O (poll) → `setImmediate` (check) → close**.
- Microtasks (nextTick, then Promises) are drained **after every single callback** (Node 11+).
- Never block the loop: CPU-heavy work → Worker Threads, a job queue or another service.

::: text 🧒 In simple words
Imagine a restaurant with **one very fast waiter** (the JavaScript thread). He never stands in the kitchen waiting for food. He takes an order, passes it to the kitchen (the operating system and libuv), and immediately serves the next table. When a dish is ready, the kitchen rings a bell and puts the plate on the counter (a **queue**). Whenever the waiter's hands are free, he picks up the next plate from the counter. That "check the counter whenever my hands are free" routine is the **event loop**. One waiter can serve hundreds of tables because most of the time is spent *waiting for the kitchen*, not carrying plates.
:::

::: text 📖 Detailed answer
The **event loop** is the mechanism that lets Node.js perform **non-blocking I/O on a single JavaScript thread**.

### The moving parts
| Part | What it is | Example |
|---|---|---|
| **Call stack** | Where your JS functions execute, one at a time | `handler()` → `validate()` → `JSON.parse()` |
| **libuv** | C library under Node: event loop + async I/O + thread pool | Reads files, DNS lookups, timers |
| **OS async APIs** | epoll (Linux), kqueue (macOS), IOCP (Windows) for sockets | Thousands of open HTTP connections |
| **Thread pool** | 4 threads by default (`UV_THREADPOOL_SIZE`) | `fs`, `crypto.pbkdf2`, `zlib`, `dns.lookup` |
| **Macrotask queues** | One FIFO queue per loop phase | timers, poll (I/O), check (`setImmediate`), close |
| **Microtask queues** | `process.nextTick` queue, then the Promise queue | `.then`, `await` continuations, `queueMicrotask` |

### What happens when you call something slow
- Your code calls `fs.readFile`, `fetch`, a MongoDB query or `setTimeout`.
- Node registers the work with libuv and **returns immediately**; your function keeps running and finishes.
- The OS or a pool thread does the work in the background.
- When it completes, libuv puts the **callback** into the right phase queue.
- When the call stack is empty, the loop runs that callback; after **each** callback it empties the microtask queues.

### The six phases of one loop iteration ("tick")
| Phase | Runs |
|---|---|
| **timers** | `setTimeout` / `setInterval` callbacks whose time has passed |
| **pending callbacks** | some deferred system errors (e.g. TCP `ECONNREFUSED`) |
| **idle, prepare** | internal |
| **poll** | new I/O events and their callbacks (most of your code); waits here when idle |
| **check** | `setImmediate` callbacks |
| **close callbacks** | `socket.on('close')` and similar |

### Browser vs Node
Both have a call stack, a macrotask queue and a microtask queue. Node adds **phases**, `process.nextTick` and `setImmediate`; the browser adds **rendering** steps (requestAnimationFrame, paint) between tasks.
:::

::: diagram Event loop: the big picture
flowchart LR
  A["Your JS code"] --> B["Call Stack"]
  B -->|"async call: fs, db, http, timer"| C["libuv: OS async I/O + thread pool"]
  C -->|"work done"| D["Callback queues (per phase)"]
  D --> E{"Event loop: is the stack empty?"}
  E -->|"yes: run next callback"| B
  M["Microtasks: nextTick, then Promises"] -.->|"drained after every callback"| B
:::

::: diagram The phases of one loop iteration
flowchart TD
  T["1 timers: setTimeout, setInterval"] --> P["2 pending callbacks"]
  P --> I["3 idle / prepare"]
  I --> PO["4 poll: I/O callbacks, waits for I/O"]
  PO --> CH["5 check: setImmediate"]
  CH --> CL["6 close callbacks"]
  CL --> T
:::

::: image The event loop: call stack, libuv, phase queues and microtasks between every callback
/images/node-core/event-loop.svg
:::

::: text 🪜 Step by step
Walk through the classic snippet below exactly like the engine does:
1. Run the whole script **synchronously**: print `1`, schedule a timer (timers queue), queue a `.then` (microtask), queue a `queueMicrotask` (microtask), call the async function which prints `2` synchronously and pauses at `await` (its continuation is a microtask), print `3`.
2. The script ends → **call stack empty**.
3. Drain **microtasks** in FIFO order: `4: promise.then`, `4b: queueMicrotask`, `4c: after await`.
4. The loop enters the **timers** phase: the 0 ms timer is due → print `5`.
5. Nothing else is scheduled → in a script, the process exits; in a server, the loop **waits in poll** for the next request.
:::

::: code javascript Browser demo: predict the order, then verify it (runnable)
// Runs in the browser and in Node. We record the order instead of guessing it.
const order = [];
const log = (label) => order.push(label);

log('1 sync start');
setTimeout(() => log('5 setTimeout (macrotask)'), 0);
Promise.resolve().then(() => log('4 promise.then (microtask)'));
queueMicrotask(() => log('4b queueMicrotask (microtask)'));
(async () => {
  log('2 async fn body runs synchronously');
  await null;                                  // everything after this is a microtask
  log('4c after await (microtask)');
})();
log('3 sync end');

setTimeout(() => {
  const expected = ['1 sync start', '2 async fn body runs synchronously', '3 sync end',
    '4 promise.then (microtask)', '4b queueMicrotask (microtask)', '4c after await (microtask)', '5 setTimeout (macrotask)'];
  order.forEach((l) => console.log(l));
  console.log('order matches the event-loop rules', JSON.stringify(order) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
  console.log('all microtasks ran before the timer', order.indexOf('5 setTimeout (macrotask)') === 6 ? '✅' : '❌ FAIL');
}, 20);
:::

::: code javascript Node-only: nextTick, setImmediate and I/O (node event-loop.js)
// How to run: save as event-loop.js, then: node event-loop.js
const fs = require('fs');

console.log('A: sync');
setTimeout(() => console.log('E/F: timeout 0 (main module: order vs immediate not guaranteed)'), 0);
setImmediate(() => console.log('E/F: immediate'));
process.nextTick(() => console.log('B: nextTick (before promises)'));
Promise.resolve().then(() => console.log('C: promise'));

fs.readFile(__filename, () => {
  // We are now in the POLL phase → CHECK (setImmediate) always comes before the next TIMERS phase
  setTimeout(() => console.log('H: timeout inside I/O callback'), 0);
  setImmediate(() => console.log('G: immediate inside I/O callback (always first here)'));
});

console.log('D: sync end');
// Output: A, D, B, C, then E/F in either order, then G, H
:::

::: code javascript Blocking the event loop: a timer that fires late (node block.js)
// How to run: node block.js
const start = Date.now();
setTimeout(() => console.log(`timer asked for 10 ms, fired after ${Date.now() - start} ms`), 10);

let sum = 0;
for (let i = 0; i < 3e8; i++) sum += i;          // ~300 ms of pure CPU on the ONLY JS thread
console.log('heavy loop done', sum > 0);
// The timer can only run after the loop finishes. In a server, every request waits like this timer.
:::

::: warning ⚠️ Common mistakes
- Saying "Node is single-threaded" without qualifying it: **JS execution** is single-threaded; libuv and the OS use other threads.
- Believing `setTimeout(fn, 0)` runs "immediately": it runs **after** the current code, all microtasks and the next timers phase (at least ~1 ms).
- Putting CPU-heavy work (big loops, `JSON.parse` of huge payloads, sync crypto) in a request handler: it blocks **every** user.
- Recursive `process.nextTick` or endless promise chains: microtasks run before I/O, so they can **starve** the loop.
- Assuming the main-module order of `setTimeout(0)` vs `setImmediate` is fixed (it isn't; inside an I/O callback it is).
:::

::: understand
- The loop exists so one thread can **wait on thousands of I/O operations at once**; waiting costs almost nothing, computing blocks everyone.
- **Microtasks before macrotasks** is the rule that explains almost every "predict the output" question.
- In production, event-loop health is a metric: monitor **event loop lag/utilisation** (`perf_hooks.monitorEventLoopDelay`).
:::

::: ask
- *"Do you mean the browser event loop or Node's libuv event loop?"* They differ (phases, `nextTick`, `setImmediate`).
- *"Which Node version?"* Since **Node 11**, microtasks run between each timer callback; older versions ran the whole timers queue first.
- For a puzzle: *"Is this in the main module or inside an I/O callback?"* (decides timeout vs immediate order).
- Trap: don't promise exact timer precision; timers are "not earlier than", never "exactly at".
:::

::: important ⭐ Say this in the interview
"Node runs my JavaScript on a single thread with an event loop. When I start I/O such as a file read, a database query or an HTTP call, Node hands it to libuv, which uses the operating system's async APIs or a small thread pool, and my code continues. When the work finishes, its callback is queued. The event loop runs queued callbacks in phases (timers, poll for I/O, check for setImmediate, close) whenever the call stack is empty, and after each callback it drains microtasks: process.nextTick first, then promises. That's why one Node process handles thousands of concurrent connections cheaply, and why CPU-heavy code must go to worker threads or another service instead of the main thread."
:::

::: links
Node.js docs: The event loop, timers and nextTick | https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
Node.js docs: Don't block the event loop | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
libuv design overview | https://docs.libuv.org/en/v1.x/design.html
Talk: What the heck is the event loop anyway? (Philip Roberts) | https://www.youtube.com/watch?v=8aGhZQkoFbQ
:::

=== What is Node.js and why is it used?
@p 3
@tags basics, v8, runtime
@quick
- Node.js = a **JavaScript runtime**: **V8** (runs JS) + **libuv** (event loop, async I/O, thread pool) + core modules (`http`, `fs`, `crypto`, `stream`…).
- Best for **I/O-heavy** work: REST/GraphQL APIs, real-time apps (WebSockets), streaming, BFFs, serverless, tooling.
- Weak spot: **CPU-heavy** work on the main thread (video encoding, ML, big reports) unless moved to worker threads or other services.
- Why teams pick it: one language front + back, npm ecosystem, high I/O concurrency with little memory, fast iteration.
- It's a runtime, not a framework (Express/Nest/Fastify are frameworks) and not a language.

::: text 🧒 In simple words
JavaScript was born inside the browser. **Node.js takes the browser's JavaScript engine out of the browser** and gives it superpowers that a server needs: reading files, opening network ports, talking to databases. Think of the engine (V8) as a **car engine** and Node as the **whole car** built around it: wheels (file system, network), a dashboard (process info) and a smart gearbox (the event loop) that lets one engine drive many passengers at once. Companies use it because the same language runs in the browser and on the server, and because it's very good at juggling thousands of waiting network requests.
:::

::: text 📖 Detailed answer
**Node.js** is an open-source, cross-platform **JavaScript runtime environment** for running JavaScript outside the browser, usually on servers.

### What it's made of
| Layer | Role |
|---|---|
| **V8** | Google's JS engine: parses and JIT-compiles JS to machine code, manages the heap and garbage collection |
| **libuv** | Event loop, non-blocking I/O for files/network/timers, a thread pool for blocking system work |
| **Bindings** | C++ glue that exposes OS features to JS (`fs`, `net`, `crypto`) |
| **Core modules** | `http`, `fs`, `path`, `events`, `stream`, `crypto`, `worker_threads`, `cluster`… |
| **npm** | Package manager and the largest package registry |

### Why it's used
- **Concurrency through non-blocking I/O**: one process handles many simultaneous connections without one thread per request, which keeps memory low.
- **Full-stack JavaScript/TypeScript**: share types, validation (Zod), utilities between React and the API; one hiring pool.
- **Ecosystem**: Express, NestJS, Fastify, Prisma/Mongoose, Socket.IO, AWS SDK.
- **Great fits**: REST and GraphQL APIs, real-time (chat, notifications, live dashboards), streaming uploads/downloads, API gateways and Backend-for-Frontend, serverless functions (AWS Lambda), CLIs and build tools (Vite, ESLint, TypeScript compiler).

### When not to use it (or how to compensate)
| Workload | Why it's a problem | Option |
|---|---|---|
| CPU-heavy (image/video processing, ML, crypto loops) | Blocks the single JS thread | `worker_threads`, a job queue with workers, or Go/Rust/Python services |
| Heavy numeric computing | JS numbers and GC aren't ideal | Native addons, WebAssembly, another language |
| Simple CRUD with heavy relational logic | Works, but other ecosystems may be more batteries-included | Choose by team skill |
:::

::: diagram Node.js architecture
flowchart TB
  APP["Your app: Express routes, services"] --> CORE["Node core modules: http, fs, crypto, stream"]
  CORE --> BIND["C++ bindings"]
  BIND --> V8["V8 engine: JIT compiler, heap, GC"]
  BIND --> UV["libuv: event loop, async I/O, thread pool"]
  UV --> OS["Operating system: epoll / kqueue / IOCP, files, sockets"]
:::

::: image Node.js = V8 + libuv + core modules; one event loop multiplexes many connections
/images/node-core/node-architecture.svg
:::

::: chart bar Memory to hold 10,000 idle connections (illustrative, typical defaults)
Model,Memory (MB)
Thread per connection (1 MB stack each),10000
Node.js event loop (~2-10 KB per socket),100
:::

::: text 🪜 Step by step
What happens when you run `node server.js` with the server below:
1. Node starts **V8** and **libuv**, loads your file as a CommonJS module and runs it top to bottom.
2. `http.createServer(handler)` creates a server object; `listen(3000)` asks the OS for a listening socket (a libuv **handle**). Because a handle is active, the process **stays alive**.
3. The event loop enters the **poll** phase and waits for socket events.
4. A browser connects; the OS signals libuv; Node parses the HTTP request and calls your **handler** with `req` and `res`.
5. Your handler writes JSON and calls `res.end()`; the bytes are written asynchronously; the loop goes back to waiting.
6. `Ctrl+C` sends `SIGINT`; the process exits (in production, handle `SIGTERM` to close the server gracefully).
:::

::: code javascript A complete HTTP server with zero dependencies (node server.js)
// How to run: node server.js   then: curl localhost:3000/health   and   curl localhost:3000/nope
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), pid: process.pid }));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = Number(process.env.PORT) || 3000;               // configurable: PORT=4000 node server.js
server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));

// Graceful shutdown: stop accepting new connections, finish in-flight ones, then exit
process.on('SIGTERM', () => server.close(() => process.exit(0)));
:::

::: code javascript Browser demo: why one thread can serve many "requests" (runnable)
// Simulates 100 requests that each wait 100 ms for a "database". With non-blocking waits,
// total time ≈ 100 ms, not 100 × 100 ms, because the single thread never sits idle waiting.
const fakeDbQuery = (id) => new Promise((resolve) => setTimeout(() => resolve({ id, ok: true }), 100));

const start = Date.now();
Promise.all(Array.from({ length: 100 }, (_, i) => fakeDbQuery(i))).then((results) => {
  const elapsed = Date.now() - start;
  console.log(`100 concurrent waits finished in ${elapsed} ms`);
  console.log('all 100 answered', results.length === 100 && results.every((r) => r.ok) ? '✅' : '❌ FAIL');
  console.log('took far less than 100 × 100 ms', elapsed < 1000 ? '✅' : '❌ FAIL');
});
:::

::: warning ⚠️ Common mistakes
- Calling Node a **language** or a **framework**: it's a runtime; Express/Nest are frameworks.
- Claiming Node is "faster than Java/Go" in general: it's efficient for **I/O concurrency**, not raw CPU computation.
- Doing CPU-bound work in request handlers and then blaming Node for being slow.
- Forgetting that one process uses **one CPU core** for JS: production runs several processes/containers.
:::

::: understand
- Node's selling point is **cheap waiting**: no thread per connection, so no per-thread memory and no context-switch storms.
- V8 gives fast JS execution; libuv gives the async I/O; Node core and npm give everything else.
- The right answer to "when would you not use Node?" shows judgement: CPU-heavy workloads or teams with other expertise.
:::

::: ask
- *"Do you want a high-level answer or the internals (V8, libuv, event loop)?"* Then offer to go deeper.
- Tie it to experience: *"In my last project Node served the React app's REST API and a WebSocket channel for live updates."*
- Trap: if asked "is Node good for everything?", give the CPU-bound caveat and the mitigation (worker threads, queues, separate services).
:::

::: important ⭐ Say this in the interview
"Node.js is a JavaScript runtime built on Chrome's V8 engine and libuv. V8 executes the JavaScript, and libuv provides the event loop and non-blocking I/O, with a small thread pool for things like file system and crypto work. Because I/O doesn't block, a single Node process can handle thousands of concurrent connections with little memory, which makes it ideal for APIs, real-time apps, streaming and serverless functions. Teams also like using one language across front end and back end. The main limitation is CPU-heavy work, which I'd move to worker threads, a job queue or a separate service so the event loop stays free."
:::

::: links
Node.js: Introduction to Node.js | https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
V8 documentation | https://v8.dev/docs
libuv design overview | https://docs.libuv.org/en/v1.x/design.html
:::

=== What is non-blocking I/O?
@p 3
@tags io, async
@quick
- **I/O** = disk, network, database, other services. **Blocking**: the thread waits for it. **Non-blocking**: start it, keep working, get notified later.
- Node is built around non-blocking I/O, so **one thread serves many requests**.
- Never use `*Sync` APIs (`readFileSync`, `pbkdf2Sync`) inside request handlers; they're fine at startup.
- `async` doesn't make CPU work non-blocking; only I/O (or work moved to other threads) is non-blocking.
- Measured: `/health` answered in **~3 ms** next to async hashing vs **~345 ms** next to sync hashing.

::: text 🧒 In simple words
**Blocking** is like standing at the microwave for three minutes watching your food spin: you can't do anything else. **Non-blocking** is pressing start, walking away to set the table, and coming back when it beeps. Computers spend a lot of time waiting for disks, networks and databases. With non-blocking I/O the program says "start reading this, tell me when you're done" and continues with other work, so a single worker can keep many tasks moving at once.
:::

::: text 📖 Detailed answer
**I/O (input/output)** is any communication with the outside world: reading files, network sockets, HTTP calls, database queries.

| | Blocking I/O | Non-blocking I/O |
|---|---|---|
| What the thread does | Stops and waits until the data arrives | Continues immediately; result comes later |
| Node examples | `fs.readFileSync`, `crypto.pbkdf2Sync`, `child_process.execSync` | `fs.promises.readFile`, `fetch`, DB drivers, `crypto.pbkdf2` with a callback |
| Result delivery | Return value | Callback, Promise (`await`), event |
| Effect in a Node server | **Every** request waits (one JS thread) | Other requests keep being served |
| Where it's OK | Startup scripts, CLIs, config loading | Everywhere, especially request paths |

### How Node achieves it
- **Network I/O** uses the OS's readiness notifications (epoll/kqueue/IOCP): one thread can watch thousands of sockets.
- **File system, DNS lookups, some crypto and compression** have no good async OS API everywhere, so libuv runs them on its **thread pool** and notifies the loop when done.
- Your JS only runs the **callbacks**; it never sits waiting.

### Measured on this machine (Node 22)
A server received four "heavy" requests that each hash a password (600,000 PBKDF2 iterations) and then one `/health` request:
- Handler uses `pbkdf2Sync` (blocking): `/health` waited **~345 ms**.
- Handler uses `pbkdf2` with a callback (non-blocking, runs on the thread pool): `/health` answered in **~3 ms**.
:::

::: diagram Blocking vs non-blocking server timeline
sequenceDiagram
  participant C1 as Request 1 (report)
  participant N as Node JS thread
  participant D as Disk / DB (libuv)
  participant C2 as Request 2 (health)
  C1->>N: GET /report
  N->>D: readFile (non-blocking)
  C2->>N: GET /health
  N-->>C2: 200 immediately
  D-->>N: data ready (callback)
  N-->>C1: 200 with the report
:::

::: chart bar Measured: /health latency while 4 heavy hashing requests run (Node 22, ms)
Handler style,Health latency (ms)
pbkdf2Sync (blocking),345
pbkdf2 callback (non-blocking),3
:::

::: image Blocking vs non-blocking: the waiter who waits in the kitchen vs the one who keeps serving
/images/node-core/non-blocking-io.svg
:::

::: text 🪜 Step by step
What happens inside `fs.readFile('report.csv', cb)`:
1. Your JS calls `fs.readFile`; Node validates arguments and asks libuv to read the file.
2. libuv hands the read to a **thread-pool** thread (files) and returns immediately; your function finishes.
3. The event loop keeps running other callbacks (other requests, timers).
4. The pool thread finishes reading and signals completion.
5. In the **poll** phase the loop runs `cb(null, data)` on the JS thread.
6. For network I/O (an HTTP call), step 2 uses an OS readiness notification instead of a pool thread; the rest is identical.
:::

::: code javascript Blocking vs non-blocking reads (node io.js)
// How to run: node io.js
const fs = require('fs');
const fsp = require('fs/promises');

console.time('sync read');
const data = fs.readFileSync(__filename, 'utf8');           // ❌ thread waits here
console.timeEnd('sync read');
console.log('sync read', data.length, 'chars, and only now does the next line run');

fs.readFile(__filename, 'utf8', (err, content) => {          // ✅ callback style
  if (err) return console.error(err);
  return console.log('callback read', content.length, 'chars');
});

(async () => {                                                // ✅ promise style (preferred today)
  const content = await fsp.readFile(__filename, 'utf8');
  console.log('await read', content.length, 'chars');
})();

console.log('this line runs BEFORE the two async reads finish');
:::

::: code javascript Measure it yourself: health latency next to heavy requests (node block-vs-async.js)
// How to run: node block-vs-async.js sync    and    node block-vs-async.js async
const http = require('http');
const crypto = require('crypto');
const mode = process.argv[2] || 'async';

const server = http.createServer((req, res) => {
  if (req.url === '/heavy') {
    if (mode === 'sync') {
      crypto.pbkdf2Sync('pw', 'salt', 600000, 64, 'sha512');           // blocks the JS thread
      return res.end('ok');
    }
    return crypto.pbkdf2('pw', 'salt', 600000, 64, 'sha512', () => res.end('ok')); // thread pool
  }
  return res.end('health');
}).listen(0, async () => {
  const { port } = server.address();
  // 127.0.0.1 (not "localhost") so DNS lookups don't need the busy thread pool
  const get = (path) => new Promise((resolve) => {
    const t = Date.now();
    http.get({ host: '127.0.0.1', port, path }, (res) => { res.resume(); res.on('end', () => resolve(Date.now() - t)); });
  });
  const heavy = Array.from({ length: 4 }, () => get('/heavy'));
  await new Promise((r) => setTimeout(r, 20));
  console.log(`${mode}: /health answered in ${await get('/health')} ms`);
  await Promise.all(heavy);
  server.close();
});
:::

::: code javascript Browser demo: blocking vs non-blocking waits (runnable)
// A "busy wait" blocks the only thread; a promise-based wait doesn't.
const blockFor = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* spinning */ } };
const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function measure(label, work) {
  const start = Date.now();
  let tickerRuns = 0;
  const ticker = setInterval(() => tickerRuns++, 10);        // other "requests" wanting the thread
  await work();
  clearInterval(ticker);
  console.log(`${label}: ${Date.now() - start} ms, other tasks ran ${tickerRuns} times`);
  return tickerRuns;
}

(async () => {
  const blocked = await measure('blocking 200 ms', async () => blockFor(200));
  const free = await measure('non-blocking 200 ms', () => waitFor(200));
  console.log('blocking starved the other tasks', blocked === 0 ? '✅' : '❌ FAIL');
  console.log('non-blocking let them run', free >= 10 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `fs.readFileSync`, `bcrypt.hashSync`, `pbkdf2Sync`, `execSync` or `JSON.parse` of a 50 MB body **inside a route**.
- Thinking `async function` makes a CPU loop non-blocking: the loop still runs on the main thread.
- Forgetting the **thread pool limit** (4): many concurrent `fs`/`crypto` calls queue up behind each other.
- Using `localhost` everywhere under heavy pool load: `dns.lookup` also needs the pool (measured: 105 ms vs 3 ms with `127.0.0.1`).
:::

::: understand
- Non-blocking I/O is about **not waiting on the JS thread**; the work still happens somewhere (OS or pool threads).
- Node's scalability comes from overlapping many waits; it doesn't make individual operations faster.
- Fix CPU-bound work with **worker_threads**, a **queue + workers**, or a separate service, never with `async`.
:::

::: ask
- *"Is this code on a hot request path or a one-off script?"* Sync APIs are fine for CLIs and startup.
- If asked how to make CPU work non-blocking: *"Offload it: worker threads, child processes or a job queue."*
- Trap: "non-blocking" ≠ "parallel JavaScript". Only one callback runs at a time.
:::

::: important ⭐ Say this in the interview
"I/O means talking to disks, networks or databases. Blocking I/O makes the thread wait for the result, which in Node would freeze every request because there's one JavaScript thread. Non-blocking I/O starts the operation and returns immediately; libuv uses the operating system's async APIs or its thread pool, and the callback or promise runs when the data is ready. That's why I never use sync APIs like readFileSync or pbkdf2Sync in request handlers: in a quick test, a health check next to synchronous hashing took about 350 milliseconds, and with the async version about 3. For CPU-heavy work I use worker threads or a queue, because async alone doesn't help there."
:::

::: links
Node.js: Overview of blocking vs non-blocking | https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking
Node.js: Don't block the event loop | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
libuv: Design overview (thread pool) | https://docs.libuv.org/en/v1.x/design.html
:::

=== Node.js is single-threaded: what does that actually mean?
@p 3
@tags threads, libuv, worker-threads
@quick
- **Your JavaScript** runs on one main thread (one call stack): no locks needed for normal variables.
- The **Node process** has more threads: libuv **thread pool** (default **4**, `UV_THREADPOOL_SIZE`, max 1024), V8 GC/compiler threads, OS async I/O.
- Pool users: `fs`, `crypto.pbkdf2/scrypt/randomBytes`, `zlib`, **`dns.lookup`**; network sockets use epoll/kqueue/IOCP (no pool).
- Measured: 8 parallel `pbkdf2` took **372 ms** with 1 pool thread, **88 ms** with 4, **55 ms** with 8.
- CPU work → **worker_threads**; use all cores for a server → **cluster / PM2 / several containers**.

::: text 🧒 In simple words
Think of a **chef** (your JavaScript) who is the only one allowed to cook. But the restaurant also has **4 kitchen helpers** (the thread pool) who fetch things from the store room and do slow chores, plus a **delivery service** (the operating system) that handles the phones. The chef never does two dishes at the same instant, which keeps the kitchen simple, but the helpers work in parallel. If all 4 helpers are busy, the next chore has to wait. And if you need serious extra cooking power, you open more kitchens (worker threads or more processes).
:::

::: text 📖 Detailed answer
"Single-threaded" describes **JavaScript execution only**: one call stack, one piece of JS at a time, run-to-completion. That's why you never need mutexes for ordinary variables in Node.

### Threads inside a typical Node process
| Thread(s) | Job |
|---|---|
| **Main thread** | V8 executing your JS + the event loop |
| **libuv thread pool** (4 by default) | `fs.*`, `crypto.pbkdf2/scrypt/randomBytes/randomFill`, `zlib`, `dns.lookup`, some user addons |
| **OS async I/O** | TCP/UDP sockets via epoll / kqueue / IOCP: no extra thread per socket |
| **V8 background threads** | Garbage collection, JIT compilation |

### Measured: thread-pool size vs 8 parallel `pbkdf2` hashes (200k iterations, Node 22, 11-core Mac)
| `UV_THREADPOOL_SIZE` | Total time |
|---|---|
| 1 | 372 ms |
| 2 | 170 ms |
| 4 (default) | 88 ms |
| 8 | 55 ms |

### The hidden trap: `dns.lookup` also uses the pool
When all 4 pool threads were busy hashing, an HTTP request to `localhost` took **~105 ms** just to resolve the name; with `127.0.0.1` (no lookup) or `UV_THREADPOOL_SIZE=8`, it took **~3 ms**.

### Using more cores
| Tool | What it gives you | Use it for |
|---|---|---|
| `worker_threads` | Real threads, each with its own V8 isolate and event loop; message passing or `SharedArrayBuffer` | CPU-heavy tasks: image resize, PDF/CSV generation, hashing, parsing |
| `cluster` / PM2 cluster mode | N processes sharing one port | Using all CPU cores for an HTTP server |
| Several containers + load balancer | Horizontal scaling across machines | Production scaling (ECS, Kubernetes) |
| `child_process` | Run another program | ffmpeg, Python scripts, shell tools |
:::

::: diagram Inside a Node process
flowchart TB
  subgraph Process["Node.js process"]
    M["Main thread: V8 + event loop + YOUR JS"]
    subgraph Pool["libuv thread pool (default 4)"]
      T1["fs"]
      T2["crypto pbkdf2 / scrypt"]
      T3["zlib"]
      T4["dns.lookup"]
    end
    OS["OS async sockets: epoll / kqueue / IOCP"]
    GC["V8 GC + compiler threads"]
  end
  M --> Pool
  M --> OS
  M -.-> GC
:::

::: chart bar Measured: 8 parallel pbkdf2 hashes by thread-pool size (ms, lower is better)
UV_THREADPOOL_SIZE,Total time (ms)
1,372
2,170
4,88
8,55
:::

::: image One JS thread, a 4-thread libuv pool, OS sockets, and worker threads for CPU work
/images/node-core/threads.svg
:::

::: text 🪜 Step by step
What happens when 8 requests each call `crypto.pbkdf2` at the same time (default pool of 4):
1. The JS thread runs handler 1, which calls `pbkdf2`; libuv queues the job and the handler returns. Same for handlers 2–8 (microseconds each).
2. The 4 pool threads pick jobs 1–4; jobs 5–8 **wait in libuv's queue**.
3. Meanwhile the JS thread is free: it can answer `/health` requests that don't need the pool.
4. As each pool thread finishes, it signals the loop (callback queued) and picks the next waiting job.
5. Callbacks run one by one on the JS thread and send the responses.
6. Total time ≈ 2 "rounds" of hashing (8 jobs / 4 threads), which matches the measured 88 ms vs 372 ms with one thread.
:::

::: code javascript Offload CPU work to a worker thread (node worker.js)
// How to run: node worker.js
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  const started = Date.now();
  const worker = new Worker(__filename, { workerData: { n: 40 } });          // same file, worker branch
  const ticker = setInterval(() => console.log('main thread still responsive…'), 200);
  worker.on('message', (result) => {
    clearInterval(ticker);
    console.log(`fib(40) = ${result} computed in a worker in ${Date.now() - started} ms`);
  });
  worker.on('error', (err) => { clearInterval(ticker); console.error(err); });
} else {
  const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));                   // deliberately CPU-heavy
  parentPort.postMessage(fib(workerData.n));
}
:::

::: code javascript Measure the thread pool yourself (node pool.js)
// How to run:  UV_THREADPOOL_SIZE=1 node pool.js   then   UV_THREADPOOL_SIZE=8 node pool.js
const crypto = require('crypto');

const start = Date.now();
let done = 0;
for (let i = 0; i < 8; i++) {
  crypto.pbkdf2('secret', 'salt', 200000, 64, 'sha512', () => {
    done += 1;
    if (done === 8) console.log(`pool size ${process.env.UV_THREADPOOL_SIZE || 4}: 8 hashes in ${Date.now() - start} ms`);
  });
}
:::

::: code javascript Use all CPU cores with cluster (node cluster.js)
// How to run: node cluster.js   then: curl localhost:3000 a few times (different pids answer)
const cluster = require('cluster');
const http = require('http');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;

if (cluster.isPrimary) {
  const workers = Math.min(4, os.availableParallelism());
  console.log(`primary ${process.pid} starting ${workers} workers on port ${PORT}`);
  for (let i = 0; i < workers; i++) cluster.fork();

  // Restart crashed workers, but stop if they keep crashing (e.g. port in use) instead of looping forever
  const recentCrashes = [];
  cluster.on('exit', (worker, code) => {
    if (worker.exitedAfterDisconnect) return;                          // intentional shutdown
    recentCrashes.push(Date.now());
    while (recentCrashes[0] < Date.now() - 10000) recentCrashes.shift();
    if (recentCrashes.length > 5) {
      console.error('workers keep crashing (5+ in 10 s): giving up, check the logs');
      Object.values(cluster.workers).forEach((w) => w.kill());
      process.exitCode = 1;
      return;
    }
    console.log(`worker ${worker.process.pid} exited with code ${code}, starting a new one`);
    cluster.fork();
  });
} else {
  http.createServer((req, res) => res.end(`handled by worker ${process.pid}\n`))
    .listen(PORT)
    .on('error', (err) => { console.error(`worker ${process.pid}: ${err.message}`); process.exit(1); });
}
:::

::: code javascript Browser demo: a pool of N workers finishing 8 jobs (runnable)
// Simulates libuv's pool: each job takes 40 ms; with more workers, total time drops.
const job = () => new Promise((resolve) => setTimeout(resolve, 40));

async function runWithPool(jobs, size) {
  const start = Date.now();
  let next = 0;
  const worker = async () => { while (next < jobs) { next += 1; await job(); } };
  await Promise.all(Array.from({ length: size }, worker));
  return Date.now() - start;
}

(async () => {
  const t1 = await runWithPool(8, 1);
  const t4 = await runWithPool(8, 4);
  const t8 = await runWithPool(8, 8);
  console.log(`8 jobs → pool 1: ${t1} ms, pool 4: ${t4} ms, pool 8: ${t8} ms`);
  console.log('pool of 1 ≈ 8 rounds', t1 >= 300 ? '✅' : '❌ FAIL');
  console.log('pool of 4 ≈ 2 rounds', t4 >= 75 && t4 < 200 ? '✅' : '❌ FAIL');
  console.log('pool of 8 ≈ 1 round', t8 < t4 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- "Node is single-threaded, so it can't use multiple cores": it can, with worker threads, cluster or multiple processes.
- Ignoring **pool saturation**: heavy `crypto`/`zlib`/`fs` usage makes unrelated `fs` calls and `localhost` DNS lookups wait.
- Setting `UV_THREADPOOL_SIZE` **after** the pool started (set it via env var before Node starts).
- Using worker threads for I/O (pointless: I/O is already async) or sharing big objects (they're **copied**, not shared).
- Keeping session state in process memory and then running 4 processes: users land on different processes.
:::

::: understand
- One JS thread = **simplicity** (no data races) + **responsibility** (never block it).
- The pool is small on purpose; tune it when you see many concurrent `fs`/crypto operations.
- Production scaling is usually **one process per core** across several containers, with shared state in Redis/DB.
:::

::: ask
- *"Do you mean JavaScript execution or the whole runtime?"* Shows you know the difference.
- *"Is the workload CPU-bound or I/O-bound?"* Decides worker threads vs simply more instances.
- Trap: worker threads don't magically speed up database queries.
:::

::: important ⭐ Say this in the interview
"JavaScript in Node runs on a single main thread, so only one piece of my code runs at a time and I don't need locks. But the runtime isn't single-threaded: libuv has a thread pool, four threads by default, for file system work, crypto like pbkdf2, compression and dns.lookup, and network I/O uses the operating system's async APIs. That pool can become a bottleneck: in a test, eight parallel hashes took 88 milliseconds with four threads and 370 with one, and even DNS lookups queue behind it. For CPU-heavy work I use worker threads, and to use all cores I run one process per core with cluster, PM2 or multiple containers, keeping shared state in Redis or the database."
:::

::: links
Node.js: Worker threads | https://nodejs.org/api/worker_threads.html
Node.js: Cluster | https://nodejs.org/api/cluster.html
Node.js CLI: UV_THREADPOOL_SIZE | https://nodejs.org/api/cli.html#uv_threadpool_sizesize
Node.js: Don't block the event loop (worker pool section) | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
:::

=== What are the event loop phases?
@p 2
@tags event-loop, phases
@quick
- **timers → pending callbacks → idle/prepare → poll → check → close callbacks**, then repeat.
- timers = `setTimeout`/`setInterval` · poll = I/O callbacks (and waiting) · check = `setImmediate` · close = `'close'` events.
- Microtasks (`nextTick`, then Promises) run **between every callback**, in every phase.
- The process exits when no timers, handles (servers, sockets) or pending requests remain.
- Inside an I/O callback, `setImmediate` always runs before a 0 ms `setTimeout`.

::: text 🧒 In simple words
Picture a **security guard doing rounds** in a building with six rooms, always in the same order. In room 1 he checks alarm clocks that have gone off (timers). In room 4 he collects all the parcels that arrived (I/O). In room 5 he handles notes marked "do right after the parcels" (`setImmediate`). In room 6 he locks doors that were closed. Between handling *any* two items, he first reads his urgent sticky notes (microtasks). When there's nothing in any room and nobody is expected, he goes home (the process exits).
:::

::: text 📖 Detailed answer
Each iteration of the event loop is a **tick**. libuv visits the phases in a fixed order; each phase has a FIFO queue and runs its callbacks until the queue is empty (or a limit is reached).

| # | Phase | What runs | Example |
|---|---|---|---|
| 1 | **timers** | Expired `setTimeout` / `setInterval` callbacks | Debounce timer, retry delay |
| 2 | **pending callbacks** | Some system I/O callbacks deferred from the previous tick | TCP `ECONNREFUSED` reporting |
| 3 | **idle, prepare** | Internal libuv housekeeping | — |
| 4 | **poll** | New I/O events and their callbacks; **blocks waiting** for I/O if nothing else is scheduled | File read done, DB response, incoming request |
| 5 | **check** | `setImmediate` callbacks | Work to do right after current I/O |
| 6 | **close callbacks** | `'close'` events | `socket.on('close')` |

### Microtasks between callbacks
After **every** callback in any phase, Node runs the `process.nextTick` queue completely, then the Promise microtask queue completely, then continues the phase.

### How the poll phase decides how long to wait
- If `setImmediate` callbacks are queued → don't wait, go to **check**.
- Else if timers are scheduled → wait at most until the nearest timer is due.
- Else → wait for I/O indefinitely (a server idles here).

### When does the process exit?
When there are no active **handles** (listening servers, open sockets, active timers) and no pending **requests**. `timer.unref()` tells Node "don't keep the process alive just for this timer".
:::

::: diagram One tick of the event loop
flowchart LR
  A(("tick start")) --> T["timers"] --> PC["pending callbacks"] --> IP["idle, prepare"] --> P["poll: I/O"] --> C["check: setImmediate"] --> CL["close callbacks"] --> Q{"anything left?"}
  Q -->|"yes"| A
  Q -->|"no"| X(("process exits"))
:::

::: image The six phases as a loop, with the microtask checkpoint after every callback
/images/node-core/loop-phases.svg
:::

::: text 🪜 Step by step
Trace the `phases.js` example below:
1. The main script schedules `fs.readFile` and ends; the call stack is empty.
2. The loop runs **timers** (none), **pending** (none) and arrives at **poll**, where it waits for the file read.
3. The read completes → the callback runs **in the poll phase**: it prints, schedules a timer, a `setImmediate` and a `nextTick`.
4. Callback done → **microtask checkpoint**: the `nextTick` prints immediately.
5. Poll is empty and a `setImmediate` is queued → move to **check**: the immediate prints.
6. Next tick → **timers**: the 0 ms timer is due and prints. Nothing remains → the process exits.
:::

::: code javascript Seeing the phases in action (node phases.js)
// How to run: node phases.js
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('1 poll phase: file read callback');
  setTimeout(() => console.log('4 timers phase (next loop iteration)'), 0);
  setImmediate(() => console.log('3 check phase (same iteration, right after poll)'));
  process.nextTick(() => console.log('2 nextTick: right after this callback'));
});
// Always prints 1, 2, 3, 4 in that order
:::

::: code javascript Keeping or releasing the process (node handles.js)
// How to run: node handles.js   (exits after ~1 s, not after 1 hour)
const keepAlive = setTimeout(() => console.log('never printed'), 60 * 60 * 1000);
keepAlive.unref();                        // this timer no longer keeps the process alive

const t = setInterval(() => console.log('tick'), 300);
setTimeout(() => {
  clearInterval(t);                       // last active handle removed → loop has nothing left
  console.log('no more handles: the process will exit now');
}, 1000);
:::

::: code javascript Browser demo: simulate one loop iteration with phase queues (runnable)
// A tiny model of libuv's phases: run every phase in order, drain microtasks after each callback.
function createLoop() {
  const queues = { timers: [], poll: [], check: [], close: [] };
  const micro = [];
  const out = [];
  const drainMicro = () => { while (micro.length) micro.shift()(); };
  return {
    queues, micro, out,
    tick() {
      for (const phase of ['timers', 'poll', 'check', 'close']) {
        const q = queues[phase].splice(0);                 // callbacks queued during this phase wait for the next tick
        for (const cb of q) { cb(); drainMicro(); }
      }
    },
  };
}

const loop = createLoop();
loop.queues.poll.push(() => {
  loop.out.push('poll: file read');
  loop.queues.timers.push(() => loop.out.push('timers: setTimeout 0'));
  loop.queues.check.push(() => loop.out.push('check: setImmediate'));
  loop.micro.push(() => loop.out.push('micro: nextTick'));
});
loop.tick();
loop.tick();
console.log(loop.out.join(' → '));
console.log('same order as real Node', loop.out.join('|') === 'poll: file read|micro: nextTick|check: setImmediate|timers: setTimeout 0' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Listing phases but forgetting the **microtask checkpoint** after every callback.
- Thinking `setImmediate` means "before everything": it's the **check** phase, after poll.
- Expecting the main-module order of `setTimeout(0)` vs `setImmediate` to be stable (it depends on how fast the loop starts).
- Wondering why a script never exits: an open server, socket, interval or DB connection is an **active handle**.
:::

::: understand
- For interviews, **timers → poll → check** plus "microtasks between callbacks" covers 95% of questions.
- The poll phase is where a server spends its life; that's why idle Node processes use almost no CPU.
- `unref()` and closing connections are how you let scripts and tests exit cleanly.
:::

::: ask
- *"Should I go into libuv internals or is the high-level order enough?"* Most interviewers want timers/poll/check + microtasks.
- Mention you know the **Node 11+** change (microtasks between individual timer callbacks).
- Trap: browser and Node differ; there's no `setImmediate` in browsers.
:::

::: important ⭐ Say this in the interview
"Each loop iteration goes through phases in order: timers for setTimeout and setInterval, pending callbacks for some deferred system errors, an internal idle/prepare phase, poll where I/O callbacks run and where the loop waits for new events, check for setImmediate, and close callbacks. After every single callback, Node drains process.nextTick and then the promise microtasks. That's why inside an I/O callback setImmediate always runs before a zero-millisecond timeout. The process exits once there are no active handles like servers, sockets or timers left."
:::

::: links
Node.js: The event loop, timers and nextTick | https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
libuv: The I/O loop | https://docs.libuv.org/en/v1.x/design.html#the-i-o-loop
Node.js: timers (ref/unref) | https://nodejs.org/api/timers.html#timeoutunref
:::

=== Difference between synchronous and asynchronous code
@p 3
@tags async, basics
@quick
- **Sync**: each line waits for the previous one; easy to read, but slow operations block the thread.
- **Async**: start a task, continue, handle the result later (callback, Promise, `await`).
- `await` pauses only **the current async function**, not the whole program.
- Independent async tasks → run them in **parallel** with `Promise.all` (measured: 3 × 200 ms waits took **604 ms** sequentially vs **211 ms** in parallel).
- Use sequential awaits only when step B **needs** step A's result.

::: text 🧒 In simple words
**Synchronous** is cooking one dish at a time: boil the pasta, wait, then start the sauce, wait, then make the salad. **Asynchronous** is putting the pasta on, starting the sauce while it boils, and chopping the salad meanwhile; dinner is ready in a third of the time. In code, async lets you start slow things (network, disk, database) and do other work until they're done. The trap: even with async tools, if you wait for each dish before starting the next, you're still cooking synchronously.
:::

::: text 📖 Detailed answer
**Synchronous** code runs statement by statement; each statement finishes before the next starts. **Asynchronous** code starts an operation and continues; the result is handled later.

| | Synchronous | Asynchronous |
|---|---|---|
| Execution | Line by line, waits | Starts work, continues, result later |
| Blocks the thread? | Yes (for its whole duration) | No (for I/O) |
| Getting the result | Return value | Callback, Promise `.then`, `await` |
| Error handling | `try/catch` | `.catch()`, or `try/catch` around `await` |
| Examples | Math, loops, `JSON.parse`, `readFileSync` | `fetch`, DB queries, `fs.promises`, timers |

### Sequential vs parallel async (the most common real bug)
| Pattern | Code | Time for 3 × 200 ms calls (measured) |
|---|---|---|
| Sequential awaits | `await a(); await b(); await c();` | **604 ms** |
| Parallel | `await Promise.all([a(), b(), c()])` | **211 ms** |

Use sequential only when there's a **dependency** ("get the user, then *their* orders"). For many items, use parallelism **with a concurrency limit** so you don't open 10,000 DB queries at once.

### `await` doesn't block Node
`await` suspends only the async function it's in; the event loop keeps serving other requests and callbacks.
:::

::: diagram Sequential vs parallel awaits
sequenceDiagram
  participant F as Your function
  participant U as Users API
  participant O as Orders API
  Note over F,O: Sequential: about 400 ms
  F->>U: getUser (200 ms)
  U-->>F: user
  F->>O: getOrders (200 ms)
  O-->>F: orders
  Note over F,O: Parallel with Promise.all: about 200 ms
  F->>U: getUser
  F->>O: getOrders
  U-->>F: user
  O-->>F: orders
:::

::: chart bar Measured: 3 independent 200 ms calls (Node 22, ms)
Pattern,Total time (ms)
Sequential awaits,604
Promise.all,211
:::

::: image Sync vs async timelines: blocking, sequential awaits and parallel awaits
/images/node-core/sync-vs-async.svg
:::

::: text 🪜 Step by step
What happens in `sequential()` vs `parallel()` below:
1. `sequential` calls `wait(200)` and hits `await`: the function pauses, the event loop is free.
2. After 200 ms the timer fires, the function resumes and **only now** starts the second wait.
3. Three waits back to back → ~600 ms.
4. `parallel` calls all three `wait(200)` **before** awaiting: all timers start at the same moment.
5. `Promise.all` resolves when the last one finishes → ~200 ms.
6. If one of them rejects, `Promise.all` rejects immediately; `Promise.allSettled` would wait for all and report each result.
:::

::: code javascript Browser demo: sequential vs parallel awaits (runnable)
// Same three 100 ms tasks; the only difference is WHEN they start.
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function sequential() {
  const start = Date.now();
  const a = await wait(100, 'user');
  const b = await wait(100, 'orders');      // starts only after a finished
  const c = await wait(100, 'reviews');
  return { result: [a, b, c], ms: Date.now() - start };
}

async function parallel() {
  const start = Date.now();
  const result = await Promise.all([wait(100, 'user'), wait(100, 'orders'), wait(100, 'reviews')]);
  return { result, ms: Date.now() - start };
}

(async () => {
  const s = await sequential();
  const p = await parallel();
  console.log(`sequential ${s.ms} ms, parallel ${p.ms} ms`);
  console.log('same results', JSON.stringify(s.result) === JSON.stringify(p.result) ? '✅' : '❌ FAIL');
  console.log('sequential ≈ 3 × 100 ms', s.ms >= 290 ? '✅' : '❌ FAIL');
  console.log('parallel ≈ 100 ms', p.ms < 200 ? '✅' : '❌ FAIL');
})();
:::

::: code javascript Dependent steps + parallel steps + concurrency limit (node orders.js)
// How to run: node orders.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getUser = async (id) => { await wait(100); return { id, name: 'Asha' }; };
const getOrders = async (userId) => { await wait(100); return [`order-${userId}-1`, `order-${userId}-2`]; };
const getRecommendations = async () => { await wait(100); return ['shoes']; };

/** Runs fn over items with at most `limit` promises in flight. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  console.time('dashboard');
  const user = await getUser(7);                                     // dependency: we need the user first
  const [orders, recs] = await Promise.all([getOrders(user.id), getRecommendations()]); // independent → parallel
  console.timeEnd('dashboard');                                      // ~200 ms, not ~300 ms
  console.log(user.name, orders, recs);

  console.time('100 users, 10 at a time');
  const users = await mapLimit(Array.from({ length: 100 }, (_, i) => i), 10, getUser);
  console.timeEnd('100 users, 10 at a time');                        // ~1000 ms (10 rounds), DB never sees 100 at once
  console.log('loaded', users.length, 'users');
})();
:::

::: warning ⚠️ Common mistakes
- Awaiting independent calls one after another (the "async waterfall").
- `items.forEach(async (x) => await save(x))`: `forEach` doesn't wait, errors escape, order is lost.
- `Promise.all` over 10,000 items: floods the database or API; use a concurrency limit.
- Thinking `await` blocks the server: it only pauses that function.
- Mixing sync heavy work into async functions and expecting them to become non-blocking.
:::

::: understand
- Async is about **not wasting waiting time**; parallelism comes from starting operations before awaiting them.
- `Promise.all` = fail fast; `allSettled` = collect everything; `race`/`any` = first wins.
- Concurrency limits protect downstream systems (DB pool size, API rate limits).
:::

::: ask
- When asked to "make this faster": *"Are these calls independent?"* If yes, parallelise.
- *"Is partial failure acceptable?"* → `Promise.all` vs `Promise.allSettled`.
- *"How many items?"* → add a concurrency limit for large lists.
:::

::: important ⭐ Say this in the interview
"Synchronous code runs line by line and blocks until each step finishes. Asynchronous code starts an operation like a database query and continues, handling the result later through a callback, a promise or await. Await only pauses the current async function, not the event loop. The common mistake is awaiting independent calls one after another: three 200 millisecond calls take about 600 milliseconds sequentially but about 200 with Promise.all. I keep sequential awaits for dependent steps, use Promise.all or allSettled for independent ones, and add a concurrency limit when processing large lists."
:::

::: links
MDN: Asynchronous JavaScript | https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous
MDN: Promise.all | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
javascript.info: Async/await | https://javascript.info/async-await
:::

=== What are callbacks, Promises and async/await?
@p 3
@tags promises, async-await, callbacks
@quick
- **Callback**: a function called later; Node style is error-first `(err, data)`. Problems: nesting ("callback hell") and inversion of control.
- **Promise**: an object for a future value: **pending → fulfilled | rejected**, settled once; chain with `.then/.catch/.finally`.
- **async/await**: syntax over Promises; `async` functions always return a Promise; `await` unwraps it; errors use `try/catch`.
- Combinators: `all` (all or fail fast), `allSettled` (every result), `race` (first settled), `any` (first fulfilled).
- `util.promisify` / `fs.promises` turn callback APIs into Promise APIs.

::: text 🧒 In simple words
Ordering food three ways. **Callback**: you give the restaurant your phone number and they call you when it's ready; if you need three things, you end up with "when they call, order the next thing, and when *that* calls…" (nested calls). **Promise**: you get a **buzzer**; it will either light up green (food ready) or red (sold out), and you can say "when it buzzes, do this, then that". **async/await**: you hold the buzzer and simply "wait at the table" in your story (`await buzzer`), which reads like normal step-by-step instructions, while the restaurant keeps serving everyone else.
:::

::: text 📖 Detailed answer
These are three generations of handling asynchronous results in JavaScript.

| | Callbacks | Promises | async/await |
|---|---|---|---|
| Introduced | Since the beginning | ES2015 | ES2017 |
| Shape | `fn(args, (err, data) => {})` | `fn(args).then(…).catch(…)` | `const data = await fn(args)` |
| Composition | Nesting | Chaining + combinators | Plain code + `Promise.all` |
| Errors | Check `err` at every level | One `.catch` for the chain | `try/catch/finally` |
| Pitfalls | Callback hell, called twice/never | Forgotten `return`, unhandled rejections | Accidental sequential awaits, missing `await` |

### Promises in detail
- A Promise is **pending** until it's **fulfilled** with a value or **rejected** with a reason; after that it never changes.
- `.then()` always returns a **new** Promise; returning a value passes it on, returning a Promise waits for it, throwing rejects.
- `.then` callbacks always run as **microtasks**, even if the Promise is already resolved.

### async/await in detail
- `async function f() { return 1 }` returns `Promise.resolve(1)`; throwing inside it returns a rejected Promise.
- `await p` pauses the function until `p` settles, then gives the value or throws the reason.
- Top-level `await` works in ES modules (`.mjs` or `"type": "module"`).

### Combinators
| Method | Resolves with | Rejects when |
|---|---|---|
| `Promise.all(ps)` | Array of all values (same order) | **First** rejection (fail fast) |
| `Promise.allSettled(ps)` | Array of `{ status, value / reason }` | Never |
| `Promise.race(ps)` | First **settled** (value or error) | If the first settled one rejected |
| `Promise.any(ps)` | First **fulfilled** value | All rejected (`AggregateError`) |
:::

::: diagram Promise states
stateDiagram-v2
  [*] --> Pending
  Pending --> Fulfilled: resolve(value)
  Pending --> Rejected: reject(error) or throw
  Fulfilled --> [*]
  Rejected --> [*]
:::

::: image From callback pyramid to promise chain to async/await
/images/node-core/async-evolution.svg
:::

::: text 🪜 Step by step
How `const orders = await getOrdersP(user)` executes:
1. `getOrdersP(user)` runs synchronously until it starts the async work and returns a **pending** Promise.
2. `await` registers a continuation on that Promise and **suspends** the async function; control returns to the caller (and the event loop).
3. Later the underlying callback fires and calls `resolve(orders)` (or `reject(err)`).
4. The continuation is queued as a **microtask**.
5. The microtask runs: the function resumes with `orders` as the value of the `await` expression (or the error is **thrown** at that line).
6. When the function finishes, the Promise it returned resolves with its return value.
:::

::: code javascript Browser demo: the same task in all three styles + combinators (runnable)
// Simulated callback APIs (Node error-first style)
const getUser = (id, cb) => setTimeout(() => (id > 0 ? cb(null, { id, name: 'Vivek' }) : cb(new Error('bad id'))), 20);
const getOrders = (user, cb) => setTimeout(() => cb(null, [`${user.name}-order-1`, `${user.name}-order-2`]), 20);

// promisify: callback API → Promise API (what util.promisify does)
const promisify = (fn) => (...args) => new Promise((resolve, reject) =>
  fn(...args, (err, data) => (err ? reject(err) : resolve(data))));
const getUserP = promisify(getUser);
const getOrdersP = promisify(getOrders);

const results = {};

// 1) Callbacks: nesting grows with every step
getUser(1, (err, user) => {
  if (err) return;
  getOrders(user, (err2, orders) => { if (!err2) results.callbacks = orders.length; });
});

// 2) Promises: flat chain, one catch
getUserP(1).then((user) => getOrdersP(user)).then((orders) => { results.promises = orders.length; }).catch(() => {});

// 3) async/await: reads top to bottom
(async () => {
  const user = await getUserP(1);
  results.asyncAwait = (await getOrdersP(user)).length;

  const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
  const fail = (ms, e) => new Promise((_, j) => setTimeout(() => j(new Error(e)), ms));
  const all = await Promise.all([ok(30, 'a'), ok(10, 'b')]);
  const settled = await Promise.allSettled([ok(10, 'a'), fail(5, 'boom')]);
  const race = await Promise.race([ok(30, 'slow'), ok(5, 'fast')]);
  const any = await Promise.any([fail(5, 'x'), ok(20, 'first success')]);
  let caught = '';
  try { await getUserP(-1); } catch (e) { caught = e.message; }

  setTimeout(() => {
    console.log('results', JSON.stringify(results));
    console.log('all three styles give 2 orders', results.callbacks === 2 && results.promises === 2 && results.asyncAwait === 2 ? '✅' : '❌ FAIL');
    console.log('all keeps input order →', all.join(','), all.join(',') === 'a,b' ? '✅' : '❌ FAIL');
    console.log('allSettled reports both', settled.map((s) => s.status).join(','), settled[1].status === 'rejected' ? '✅' : '❌ FAIL');
    console.log('race = first settled →', race, race === 'fast' ? '✅' : '❌ FAIL');
    console.log('any = first fulfilled →', any, any === 'first success' ? '✅' : '❌ FAIL');
    console.log('rejection becomes a catchable throw →', caught, caught === 'bad id' ? '✅' : '❌ FAIL');
  }, 100);
})();
:::

::: code javascript Node: promisify built-in callback APIs (node promisify.js)
// How to run: node promisify.js
const fs = require('fs');
const util = require('util');
const fsp = require('fs/promises');

const stat = util.promisify(fs.stat);                 // any (err, data) API → Promise

(async () => {
  const s = await stat(__filename);
  console.log('size via promisify:', s.size);
  const text = await fsp.readFile(__filename, 'utf8'); // most core modules already have a promise version
  console.log('lines via fs/promises:', text.split('\n').length);
  const { setTimeout: sleep } = require('timers/promises');
  await sleep(100);                                     // promise-based timer
  console.log('slept 100 ms');
})();
:::

::: warning ⚠️ Common mistakes
- Forgetting `return` inside `.then()` → the next `.then` gets `undefined` and errors escape the chain.
- Mixing styles: `async` callback passed to an API that expects a callback with `(err, data)`.
- Wrapping an existing Promise in `new Promise(...)` (the "explicit construction anti-pattern").
- Using `Promise.race` for timeouts without cancelling the slow operation (use `AbortController`).
- Unhandled rejections: since Node 15 they **crash** the process by default.
:::

::: understand
- async/await **is** Promises; you can always mix `await` with `.then`, `Promise.all`, etc.
- Promise callbacks are microtasks → they run before timers and I/O callbacks.
- Choosing the right combinator is a design decision about **failure semantics**.
:::

::: ask
- *"Should I implement `Promise.all` or a Promise from scratch?"* (common follow-up; see JS Implementations).
- *"Can partial results be returned?"* → `allSettled`.
- Trap: `Promise.race` doesn't cancel the losers.
:::

::: important ⭐ Say this in the interview
"Callbacks were the original pattern: you pass a function that Node calls with an error first and then the result, but nesting them gets hard to read and error handling repeats at every level. A Promise is an object representing a future value; it's pending and then settles once as fulfilled or rejected, and then chains flatten the code with a single catch. async/await is syntax over promises: an async function always returns a promise, and await pauses only that function until the promise settles, so I can use normal try/catch. For several operations I pick the combinator by failure semantics: Promise.all to fail fast, allSettled for partial results, race for the first settled and any for the first success."
:::

::: links
MDN: Using promises | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
MDN: async function | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
Node.js: util.promisify | https://nodejs.org/api/util.html#utilpromisifyoriginal
javascript.info: Promises, async/await | https://javascript.info/async
:::

=== How does error handling work with async/await?
@p 3
@tags errors, async-await
@quick
- With `await`, a **rejected Promise becomes a thrown error** at that line → use `try/catch/finally`.
- `try/catch` only catches promises you **await**; a missing `await` = unhandled rejection (crash in Node 15+).
- `forEach(async …)` doesn't wait and leaks errors; use `for…of` or `Promise.all`.
- Express 4: pass async errors to `next(err)` (asyncHandler); Express 5 does it automatically.
- Last resort: `process.on('unhandledRejection' | 'uncaughtException')` → log, then exit and let PM2/Docker restart.

::: text 🧒 In simple words
Think of each `await` as **opening a parcel**. If the parcel contains a "sorry, failed" note, opening it is like someone throwing that note at you, so you hold up a `try/catch` glove to catch it. If you **forget to open the parcel** (no `await`), the note flies off somewhere and nobody catches it; Node treats that as a serious accident and stops the program. Good error handling means: catch what you can fix (retry, show a message), clean up in `finally`, and let truly unexpected errors reach one central handler.
:::

::: text 📖 Detailed answer
### The core rule
`await promise` either returns the value or **throws** the rejection reason, so normal `try/catch/finally` works.

### Patterns
| Pattern | Code | When |
|---|---|---|
| try/catch/finally | `try { await a() } catch (e) {…} finally {…}` | Default; `finally` for cleanup |
| Local fallback | `const data = await load().catch(() => cached)` | One call with a default |
| Tuple helper | `const [err, data] = await to(load())` | Avoid nested try blocks |
| Centralised (Express) | `next(err)` → error middleware | APIs: one place maps errors to HTTP |
| Process safety net | `process.on('unhandledRejection')` | Log + exit; never "keep going" |

### Gotchas
| Code | Problem | Fix |
|---|---|---|
| `try { fetchUser() } catch {}` | Missing `await`: the rejection escapes | `await fetchUser()` |
| `ids.forEach(async (id) => await save(id))` | Not awaited; errors unhandled | `for (const id of ids) await save(id)` or `await Promise.all(ids.map(save))` |
| `catch (e) {}` | Swallowed error hides bugs | Log + rethrow or handle meaningfully |
| `new Promise(async (resolve) => …)` | Errors inside the async executor are lost | Don't use async executors |

### Operational vs programmer errors
- **Operational** (expected): invalid input, DB timeout, 404 from another API → handle, return a proper status, retry.
- **Programmer** (bugs): `undefined is not a function` → log, crash, restart (state may be corrupt).
:::

::: diagram How an error travels in an async Express request
flowchart LR
  R["route handler (async)"] -->|"await service()"| S["service"]
  S -->|"await repo()"| D["repository"]
  D -->|"rejects: DB timeout"| S
  S -->|"rethrow or wrap"| R
  R -->|"next(err) / asyncHandler"| E["error middleware"]
  E -->|"maps to status"| C["client: 503 JSON"]
  X["missing await"] -.->|"escapes"| U["unhandledRejection → crash"]
:::

::: image Where async errors go: caught by try/catch, passed to next(), or escaping as unhandled rejections
/images/node-core/error-flow.svg
:::

::: text 🪜 Step by step
What happens when the database rejects inside `GET /users/:id`:
1. The repository's `await collection.findOne()` rejects with a timeout error → it's **thrown** inside the repository function.
2. The repository doesn't catch it → its own returned Promise rejects.
3. The service `await`s the repository → the error is thrown there; it may wrap it (`new ServiceUnavailable('users DB', { cause: err })`) and rethrow.
4. The async route handler is wrapped by `asyncHandler` (Express 4) or Express 5 → the rejection is passed to `next(err)`.
5. The error middleware logs it with the request id and responds `503 { error: … }`.
6. If any step forgot `await`, step 3 never sees the error: Node emits `unhandledRejection` and (by default) exits.
:::

::: code javascript Browser demo: the main patterns and the classic bugs (runnable)
const fetchUser = async (id) => {
  if (id <= 0) throw new Error('Invalid id');
  return { id, name: 'Vivek' };
};
const checks = [];

// 1) try / catch / finally
async function one() {
  let cleaned = false;
  try {
    await fetchUser(-1);
  } catch (err) {
    checks.push(['try/catch catches the rejection', err.message === 'Invalid id']);
  } finally {
    cleaned = true;
  }
  checks.push(['finally always runs', cleaned]);
}

// 2) Tuple helper (Go style)
const to = (promise) => promise.then((data) => [null, data]).catch((err) => [err, null]);
async function two() {
  const [err, user] = await to(fetchUser(5));
  checks.push(['tuple helper returns data without try/catch', !err && user.name === 'Vivek']);
}

// 3) Missing await: try/catch can't see the error
async function three() {
  let caughtHere = false;
  let caughtByPromise = false;
  try {
    fetchUser(-1).catch(() => { caughtByPromise = true; });   // no await!
  } catch (e) {
    caughtHere = true;
  }
  await new Promise((r) => setTimeout(r, 10));
  checks.push(['missing await escapes try/catch', !caughtHere && caughtByPromise]);
}

// 4) forEach doesn't await; for...of does
async function four() {
  const done = [];
  [1, 2, 3].forEach(async (id) => { await fetchUser(id); done.push(id); });
  const afterForEach = done.length;                              // still 0: forEach returned immediately
  for (const id of [4, 5]) { await fetchUser(id); done.push(id); }
  checks.push(['forEach did not wait', afterForEach === 0]);
}

(async () => {
  await one(); await two(); await three(); await four();
  checks.forEach(([label, ok]) => console.log(label, ok ? '✅' : '❌ FAIL'));
})();
:::

::: code javascript Express 4: asyncHandler + error middleware (node app.js)
// How to run: npm install express && node app.js   then: curl -i localhost:3000/users/0
const express = require('express');
const app = express();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const findUser = async (id) => {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id must be a positive integer');
  if (id > 100) throw new HttpError(404, 'User not found');
  return { id, name: 'Vivek' };
};

app.get('/users/:id', asyncHandler(async (req, res) => {
  res.json(await findUser(Number(req.params.id)));               // any rejection → next(err)
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);                           // log unexpected errors only
  res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
});

process.on('unhandledRejection', (reason) => {                    // last-resort safety net
  console.error('Unhandled rejection', reason);
  process.exit(1);                                                 // let PM2/Docker restart a clean process
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/users/1`));
:::

::: warning ⚠️ Common mistakes
- Missing `await` inside `try` → the error escapes (and crashes Node 15+).
- `async` callbacks in `forEach`, `map` without `Promise.all`, or event emitters → unhandled errors.
- Empty `catch {}` blocks that hide failures.
- Express 4 async route without `asyncHandler`/`next(err)` → the request hangs forever.
- Continuing to run after `uncaughtException` (the process may be in an inconsistent state).
:::

::: understand
- `await` converts async failure into **synchronous-looking** exceptions; that's the whole trick.
- Handle errors at the level that can **do something** about them; elsewhere, let them propagate.
- Error **classification** (operational vs programmer) drives status codes, retries and alerting.
:::

::: ask
- *"Where does this code run: an Express route, a background job or the browser?"* Strategy differs (status code, retry, UI message).
- *"Which Express version?"* Express 5 forwards rejected promises automatically.
- Trap: "just wrap everything in try/catch" isn't a strategy; mention central error middleware and logging.
:::

::: important ⭐ Say this in the interview
"With async/await, a rejected promise is thrown at the await line, so I use try/catch, and finally for cleanup. The classic bugs are a missing await, so the rejection escapes the try block and becomes an unhandled rejection that crashes Node 15 and later, and async callbacks inside forEach, which nobody awaits. In Express 4 I wrap async routes with an asyncHandler that forwards errors to next, and one error middleware maps them to status codes and logs unexpected ones; Express 5 does the forwarding automatically. As a last resort I listen for unhandledRejection and uncaughtException, log, and exit so the process manager restarts a clean process."
:::

::: links
MDN: try...catch | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
Node.js: process 'unhandledRejection' | https://nodejs.org/api/process.html#event-unhandledrejection
Node.js best practices: error handling | https://github.com/goldbergyoni/nodebestpractices#2-error-handling-practices
:::

=== Difference between process.nextTick(), setImmediate() and setTimeout()
@p 3
@tags event-loop, nextTick, setImmediate
@quick
- `process.nextTick(fn)` → right after the current operation, **before Promises** and before the loop continues (highest priority).
- Promise `.then` / `queueMicrotask` → microtask queue, right after the nextTick queue.
- `setImmediate(fn)` → **check** phase, after the poll (I/O) phase.
- `setTimeout(fn, 0)` → **timers** phase, at least ~1 ms later.
- Inside an I/O callback `setImmediate` always beats `setTimeout(0)`; recursive `nextTick` can **starve** I/O.

::: text 🧒 In simple words
Imagine a doctor's clinic. `process.nextTick` is the doctor saying **"one more thing before you leave the room"**: it happens before anyone else is seen. A Promise callback is the **nurse's quick follow-up** right after that. `setImmediate` is **"I'll see you right after this round of patients"**, and `setTimeout(fn, 0)` is **"come back at the next scheduled appointment slot"**. If the doctor keeps saying "one more thing" forever (recursive `nextTick`), the waiting room never moves.
:::

::: text 📖 Detailed answer
| API | Queue | Runs | Typical use |
|---|---|---|---|
| `process.nextTick(fn)` | nextTick queue (microtask, highest priority) | Immediately after the current JS operation, before Promises and before the loop moves on | Emit events after a constructor returns; make an API consistently async |
| `Promise.then` / `queueMicrotask` | Promise microtask queue | After the nextTick queue is empty | Normal async code |
| `setImmediate(fn)` | **check** phase | After the poll phase of the current iteration | Yield after I/O; split long work into chunks |
| `setTimeout(fn, 0)` | **timers** phase | Next timers phase, ≥ 1 ms | Delays, debouncing, retries |

### Ordering rules
- Main module: `nextTick` → Promise → then `setTimeout(0)` and `setImmediate` in **either order** (depends on process start-up timing).
- Inside an I/O callback (poll phase): `setImmediate` **always** runs before `setTimeout(0)`.
- The naming is confusing: `nextTick` fires "more immediately" than `setImmediate`. The Node docs themselves say the names should have been swapped.

### Starvation
Microtasks are drained completely before the loop continues. A function that keeps scheduling itself with `process.nextTick` (or an endless promise chain) prevents timers and I/O from ever running. `setImmediate` yields to the loop between iterations, so it can't starve I/O.
:::

::: diagram Priority after the current operation
flowchart LR
  S["current sync code"] --> NT["process.nextTick queue (all)"]
  NT --> PR["Promise microtasks (all)"]
  PR --> L{"event loop continues"}
  L --> TM["timers: setTimeout 0"]
  L --> PO["poll: I/O callbacks"]
  PO --> CK["check: setImmediate"]
:::

::: image Who runs first: nextTick, promises, setImmediate and setTimeout on a priority ladder
/images/node-core/tick-priority.svg
:::

::: text 🪜 Step by step
Execution of `order.js` (below):
1. All five lines run synchronously: they only **schedule** callbacks, except `console.log('1: sync')`, which prints.
2. Script finished → Node drains the **nextTick** queue: `2: nextTick`.
3. Then the **Promise** microtasks: `3: promise`.
4. The loop starts. Whether the 1 ms timer is already due when **timers** is checked depends on start-up time → `setTimeout` and `setImmediate` can come in either order.
5. In `io-order.js`, the same two calls are made **inside a `readFile` callback** (poll phase): the loop goes poll → **check** (`setImmediate`) → next iteration **timers** (`setTimeout`), so the order is fixed.
:::

::: code javascript Predict the output in the main module (node order.js)
// How to run: node order.js
setTimeout(() => console.log('4 or 5: setTimeout 0'), 0);
setImmediate(() => console.log('4 or 5: setImmediate'));
Promise.resolve().then(() => console.log('3: promise'));
process.nextTick(() => console.log('2: nextTick'));
console.log('1: sync');
// 1, 2, 3 always; then timeout/immediate in either order (main module)
:::

::: code javascript Fixed order inside an I/O callback (node io-order.js)
// How to run: node io-order.js   (run it many times: always immediate first)
const fs = require('fs');
fs.readFile(__filename, () => {
  setTimeout(() => console.log('2: setTimeout 0 (next iteration, timers phase)'), 0);
  setImmediate(() => console.log('1: setImmediate (check phase, same iteration)'));
});
:::

::: code javascript Starvation: nextTick recursion vs setImmediate (node starve.js)
// How to run: node starve.js
let ticks = 0;
const start = Date.now();
setTimeout(() => console.log(`timer ran after ${Date.now() - start} ms and ${ticks} nextTicks`), 0);

function spin() {
  ticks += 1;
  if (ticks < 1e6) process.nextTick(spin);   // the loop can't reach the timers phase until this ends
}
spin();
// Replace process.nextTick(spin) with setImmediate(spin): the timer fires after a few iterations instead.
:::

::: code javascript Browser demo: microtasks vs macrotasks priority (runnable)
// Browsers have no nextTick/setImmediate, but the same microtask-before-macrotask rule applies.
const order = [];
let chainedWhenTimerRan = -1;
setTimeout(() => { order.push('macrotask: setTimeout 0'); chainedWhenTimerRan = chained; }, 0);
Promise.resolve().then(() => order.push('microtask: promise'));
queueMicrotask(() => order.push('microtask: queueMicrotask'));
order.push('sync');

// A self-scheduling microtask chain delays the timer, like recursive nextTick does in Node
let chained = 0;
const chain = () => { chained += 1; if (chained < 1000) queueMicrotask(chain); };
queueMicrotask(chain);

setTimeout(() => {
  console.log(order.join(' → '));
  console.log('sync first, then microtasks, then the timer', order.join('|') === 'sync|microtask: promise|microtask: queueMicrotask|macrotask: setTimeout 0' ? '✅' : '❌ FAIL');
  console.log(`chained microtasks done when the 0 ms timer ran: ${chainedWhenTimerRan}`, chainedWhenTimerRan === 1000 ? '✅' : '❌ FAIL');
}, 20);
:::

::: warning ⚠️ Common mistakes
- Believing `setImmediate` runs "immediately": it waits for the check phase.
- Using `process.nextTick` for "run later" in loops: it can starve I/O; prefer `setImmediate`.
- Asserting a fixed order for `setTimeout(0)` vs `setImmediate` in the main module.
- Using `setTimeout(fn, 0)` to "fix" race conditions instead of awaiting the real event.
:::

::: understand
- Two levels: **microtasks** (nextTick, then promises) run between every callback; **macrotasks** run in loop phases.
- `setImmediate` is the polite way to **yield** during long work (let I/O breathe between chunks).
- These questions test whether you can reason about the loop, not memorise trivia.
:::

::: ask
- *"Is this code in the main module or inside an I/O callback?"* Decides the timeout/immediate order.
- *"Which Node version?"* (Node 11+ runs microtasks between each timer callback.)
- Trap: browsers don't have `setImmediate` or `nextTick`.
:::

::: important ⭐ Say this in the interview
"process.nextTick runs right after the current operation, before promise callbacks and before the event loop continues, so it has the highest priority; promise callbacks run next as microtasks. setImmediate runs in the check phase right after I/O polling, and setTimeout with zero delay runs in the next timers phase, at least a millisecond later. In the main module the order of setTimeout zero and setImmediate isn't guaranteed, but inside an I/O callback setImmediate always runs first. I avoid recursive nextTick because it can starve I/O, and use setImmediate to yield between chunks of long work."
:::

::: links
Node.js: Understanding process.nextTick() | https://nodejs.org/en/learn/asynchronous-work/understanding-processnexttick
Node.js: Understanding setImmediate() | https://nodejs.org/en/learn/asynchronous-work/understanding-setimmediate
Node.js: The event loop, timers and nextTick | https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
:::

=== What are streams in Node.js?
@p 3
@tags streams, performance, backpressure
@quick
- Streams process data **chunk by chunk** (64 KB for files by default) instead of loading everything into memory.
- 4 types: **Readable**, **Writable**, **Duplex** (TCP socket), **Transform** (gzip, encryption, CSV parsing).
- Use `pipeline()` (from `stream/promises`): it propagates errors and destroys every stream on failure; bare `.pipe()` doesn't.
- **Backpressure**: when the destination is slow, `write()` returns `false` → pause until `'drain'` (pipe/pipeline do it for you).
- Measured: hashing a 300 MB file peaked at **337 MB RAM** with `readFile` vs **~110 MB** with a stream.

::: text 🧒 In simple words
Moving water from a lake to a field: you could try to carry the **whole lake in one giant tank** (load the full file into memory), or lay down a **garden hose** and let water flow through it a little at a time (a stream). The hose works for any lake size, and the field starts getting water immediately. If the field can't absorb water fast enough, you **turn the tap down** for a moment (backpressure) so it doesn't flood. HTTP requests, file reads, uploads to S3 and video playback all work like hoses.
:::

::: text 📖 Detailed answer
A **stream** is an abstraction for data that arrives or leaves **over time, in chunks**. Each chunk is a `Buffer` (or a string/object in object mode).

### Why streams
- **Constant memory**: a 10 GB file uses about the same RAM as a 10 MB one.
- **Time to first byte**: start sending/processing before everything is read.
- **Composability**: connect small steps like Unix pipes (`read | gunzip | parse | write`).

### The four types
| Type | Description | Examples |
|---|---|---|
| **Readable** | A source you read from | `fs.createReadStream`, HTTP **request** on the server, `process.stdin`, a MongoDB cursor stream |
| **Writable** | A destination you write to | `fs.createWriteStream`, HTTP **response**, `process.stdout`, S3 multipart upload body |
| **Duplex** | Readable and writable, independent sides | TCP `net.Socket`, WebSocket |
| **Transform** | Duplex that changes data passing through | `zlib.createGzip()`, `crypto.createCipheriv`, CSV parser |

### Backpressure
If you read faster than you can write, chunks pile up in memory. `writable.write(chunk)` returns `false` once its internal buffer passes `highWaterMark`; the producer should **pause** and resume on `'drain'`. `pipe()`/`pipeline()` implement this automatically.

### `pipe()` vs `pipeline()`
| | `a.pipe(b)` | `pipeline(a, b, c)` |
|---|---|---|
| Backpressure | ✅ | ✅ |
| Error from any stream | Not forwarded; others may leak | Forwarded to one callback / rejected Promise |
| Cleanup on failure | Manual | Destroys all streams |
| Async/await | No | `await pipeline(...)` from `stream/promises` |

### Measured on this machine (Node 22): SHA-256 of a 300 MB file
| Approach | Peak RSS |
|---|---|
| `fs.readFile` (whole file in memory) | **337 MB** |
| `fs.createReadStream` (64 KB chunks) | **~110 MB** (mostly baseline + GC slack) |
:::

::: diagram Stream pipeline with backpressure
flowchart LR
  R["Readable: big.csv"] -->|"64 KB chunks"| T1["Transform: parse CSV"]
  T1 --> T2["Transform: gzip"]
  T2 --> W["Writable: HTTP response / S3"]
  W -.->|"write() returns false: pause until drain"| R
:::

::: chart bar Measured: peak memory hashing a 300 MB file (Node 22, MB)
Approach,Peak RSS (MB)
fs.readFile (whole file),337
fs.createReadStream (chunks),110
:::

::: image A stream as a hose: chunks flow through transforms, and backpressure turns down the tap
/images/node-core/streams.svg
:::

::: text 🪜 Step by step
What `await pipeline(fs.createReadStream(file), zlib.createGzip(), res)` does for a download:
1. The read stream asks the thread pool to read the first 64 KB chunk.
2. The chunk is pushed into gzip, which compresses it and pushes compressed bytes to `res`.
3. `res.write()` sends them over the socket. If the client is slow and the socket buffer fills, `write()` returns `false`.
4. `pipeline` pauses the upstream streams until `res` emits `'drain'`, so memory stays bounded.
5. At end of file, the read stream ends → gzip flushes → `res.end()` → the Promise resolves.
6. If anything fails (file missing, client disconnects), every stream is destroyed and the Promise rejects → handle it with `next(err)`.
:::

::: code javascript Stream a large file as a gzip download (node download.js)
// How to run: npm install express && node download.js
//             then: curl -s localhost:3000/download --compressed | wc -c
const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const express = require('express');

const app = express();
const file = __filename;                                    // any big file works

app.get('/download', async (req, res, next) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="download.txt"');
  try {
    await pipeline(fs.createReadStream(file), zlib.createGzip(), res); // backpressure + cleanup built in
  } catch (err) {
    if (!res.headersSent) next(err);                       // e.g. file missing
    else res.destroy(err);                                  // client gone mid-stream
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/download`));
:::

::: code javascript Custom Transform + measure memory yourself (node transform.js)
// How to run: node transform.js
const { Transform, Readable } = require('stream');
const { pipeline } = require('stream/promises');

// Transform: uppercase text and count bytes as they pass through
let bytes = 0;
const upper = new Transform({
  transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(null, chunk.toString().toUpperCase());
  },
});

// A readable that produces 50 MB in 64 KB chunks without ever holding it all
function* chunks() { for (let i = 0; i < 800; i++) yield 'x'.repeat(64 * 1024); }
let maxRss = 0;
const sink = new (require('stream').Writable)({
  write(chunk, enc, cb) { maxRss = Math.max(maxRss, process.memoryUsage().rss); cb(); },
});

(async () => {
  await pipeline(Readable.from(chunks()), upper, sink);
  console.log(`processed ${(bytes / 1048576).toFixed(0)} MB, peak RSS ${(maxRss / 1048576).toFixed(0)} MB`);
})();
:::

::: code javascript Browser demo: backpressure with a slow consumer (runnable)
// A producer writes 20 chunks into a buffer with a highWaterMark of 4.
// When the buffer is full, write() returns false and the producer waits for "drain".
function createSlowWritable(highWaterMark, msPerChunk) {
  const buffer = [];
  let drainResolvers = [];
  let maxBuffered = 0;
  const consume = () => {
    if (!buffer.length) return;
    setTimeout(() => {
      buffer.shift();
      if (buffer.length < highWaterMark) { drainResolvers.forEach((r) => r()); drainResolvers = []; }
      consume();
    }, msPerChunk);
  };
  return {
    write(chunk) {
      buffer.push(chunk);
      maxBuffered = Math.max(maxBuffered, buffer.length);
      if (buffer.length === 1) consume();
      return buffer.length < highWaterMark;                  // false = "please pause"
    },
    drain: () => new Promise((r) => drainResolvers.push(r)),
    get maxBuffered() { return maxBuffered; },
  };
}

(async () => {
  const sink = createSlowWritable(4, 5);
  let pauses = 0;
  for (let i = 0; i < 20; i++) {
    if (!sink.write(`chunk-${i}`)) { pauses += 1; await sink.drain(); }   // respect backpressure
  }
  console.log(`paused ${pauses} times, max chunks buffered: ${sink.maxBuffered}`);
  console.log('memory stayed bounded by the highWaterMark', sink.maxBuffered <= 4 ? '✅' : '❌ FAIL');
  console.log('producer actually paused', pauses > 0 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `fs.readFile` / `res.json(hugeArray)` for big data instead of streaming.
- Using `.pipe()` without error handling: one failing stream leaves others open (file descriptor leaks).
- Ignoring the return value of `write()` in a manual loop → unbounded memory growth.
- Converting every chunk to a string with multi-byte characters split across chunks (use `setEncoding('utf8')` or `StringDecoder`).
- Mixing `'data'` listeners and `pipe()` on the same stream.
:::

::: understand
- `req` and `res` in Express **are streams**: that's how uploads (busboy/multer) and downloads work.
- Streams trade a little complexity for **bounded memory** and earlier first bytes.
- Pair with AWS: stream uploads to S3 with `@aws-sdk/lib-storage` `Upload`, stream DB cursors into CSV exports.
:::

::: ask
- *"How big can the data get, and does the client need it progressively?"* Streams pay off for large or unbounded data.
- For exports: *"Can I stream rows from a MongoDB cursor straight into the response?"*
- Trap: streams don't make CPU work cheaper; a slow transform still blocks per chunk.
:::

::: important ⭐ Say this in the interview
"Streams let Node process data in chunks instead of loading it all into memory. There are readable, writable, duplex and transform streams, and HTTP requests and responses are streams too. I connect them with pipeline from stream/promises, because it handles backpressure, forwards errors and cleans up every stream, which plain pipe doesn't. Backpressure means that when the destination is slow, write returns false and the source pauses until drain, so memory stays bounded. In a quick test, hashing a 300 megabyte file used about 337 megabytes of RAM with readFile and around 110 with a stream; I use streams for file downloads, uploads to S3 and large CSV exports from database cursors."
:::

::: links
Node.js: Stream API | https://nodejs.org/api/stream.html
Node.js: Backpressuring in streams | https://nodejs.org/en/learn/modules/backpressuring-in-streams
Node.js: stream.pipeline | https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
:::

=== What are Buffers?
@p 2
@tags buffer, binary
@quick
- A **Buffer** is a fixed-length sequence of **bytes** (0–255), Node's type for binary data; it's a subclass of `Uint8Array`.
- Used for files, network packets, images, crypto, compression; stream chunks are Buffers.
- `buf.length` counts **bytes**, not characters: `'न'` is 3 bytes in UTF-8, an emoji is 4.
- Encodings: `utf8` (default), `base64`, `base64url`, `hex`, `latin1`; base64 makes data **~33% bigger**.
- Use `Buffer.alloc` (zero-filled) rather than `allocUnsafe` (may contain old memory) unless you overwrite it fully.

::: text 🧒 In simple words
Computers store everything as **numbers from 0 to 255** (bytes). Text, photos and music are just long rows of these numbers. A JavaScript string is text meant for people; a **Buffer is the raw row of numbers** meant for machines. When Node reads a photo or receives data from the network, it gets a Buffer. To show text you **decode** the bytes (UTF-8), and to send binary inside text formats like JSON you **encode** it (base64), which makes it about a third bigger, like packing fragile items with extra bubble wrap.
:::

::: text 📖 Detailed answer
JavaScript strings are sequences of UTF-16 code units, which is great for text but wrong for binary data. A **Buffer** is a fixed-size chunk of memory holding raw bytes.

- Implemented as a subclass of **`Uint8Array`**: indexes, `slice`/`subarray`, typed-array methods all work.
- Memory for large Buffers is allocated **outside the V8 heap**, which is efficient for big binary data.
- Small allocations come from a shared pool (`Buffer.poolSize` = 8 KB), which is why `allocUnsafe` can expose old bytes.

### Common operations
| Code | Meaning |
|---|---|
| `Buffer.from('Hello')` | string → bytes (UTF-8 by default) |
| `Buffer.from('SGVsbG8=', 'base64')` | base64 text → bytes |
| `Buffer.alloc(10)` | 10 zero-filled bytes (safe) |
| `Buffer.allocUnsafe(10)` | 10 bytes, **not** cleared (faster, may leak old data) |
| `buf.toString('hex' / 'base64' / 'utf8')` | bytes → text |
| `Buffer.concat([a, b])` | join chunks (e.g. collecting a stream) |
| `Buffer.byteLength(str)` | how many bytes a string needs |
| `buf.equals(other)` / `crypto.timingSafeEqual(a, b)` | compare (timing-safe for secrets) |

### Bytes vs characters (UTF-8)
| Character | `str.length` | Bytes |
|---|---|---|
| `A` | 1 | 1 |
| `é` | 1 | 2 |
| `न` | 1 | 3 |
| `😀` | 2 | 4 |

### base64 overhead
Every 3 bytes become 4 characters: 1 MB (1,048,576 bytes) → **1,398,104** base64 characters (+33%). That's why files go to S3 as binary streams, not as base64 inside JSON.
:::

::: diagram From text to bytes and back
flowchart LR
  S["string 'Hi न'"] -->|"Buffer.from(str, 'utf8')"| B["Buffer: 48 69 20 e0 a4 a8"]
  B -->|"toString('utf8')"| S
  B -->|"toString('base64')"| E["'SGkg4KSo' (text-safe)"]
  E -->|"Buffer.from(x, 'base64')"| B
  B -->|"toString('hex')"| H["'486920e0a4a8'"]
:::

::: chart bar UTF-8 bytes needed per character (exact)
Character,Bytes
A (ASCII),1
é (Latin),2
न (Devanagari),3
😀 (emoji),4
:::

::: image A Buffer is a row of bytes: how "Hi न" is stored in UTF-8 and how base64 regroups it
/images/node-core/buffer-bytes.svg
:::

::: text 🪜 Step by step
What happens in `Buffer.from('Hi न').toString('base64')`:
1. Node encodes each character with UTF-8: `H` → `0x48`, `i` → `0x69`, space → `0x20`, `न` (U+0928) → three bytes `0xE0 0xA4 0xA8`.
2. It allocates a 6-byte Buffer and copies those bytes in.
3. `toString('base64')` takes the bytes **3 at a time** (24 bits) and splits them into four 6-bit groups.
4. Each 6-bit value (0–63) maps to a character in `A–Z a–z 0–9 + /` → `SGkg4KSo`.
5. If the byte count isn't a multiple of 3, `=` padding is added (`base64url` drops it and uses `-` `_`).
6. Decoding reverses the steps; decoding with the **wrong** encoding (e.g. `latin1`) produces garbled text.
:::

::: code javascript Buffer basics (node buffer.js)
// How to run: node buffer.js
const text = 'Hello, नमस्ते';
const buf = Buffer.from(text);                                   // UTF-8 by default
console.log(buf);                                                // <Buffer 48 65 6c 6c 6f 2c 20 e0 a4 a8 ...>
console.log('characters:', text.length, 'bytes:', buf.length);   // bytes > characters for non-ASCII

console.log('base64:', buf.toString('base64'));
console.log('hex:', buf.toString('hex'));
console.log('decoded:', Buffer.from('SGVsbG8=', 'base64').toString());   // Hello

const basicAuth = 'Basic ' + Buffer.from('user:password').toString('base64');
console.log('Authorization header:', basicAuth);

// Collect stream chunks, then decode once (avoids splitting multi-byte characters)
const { Readable } = require('stream');
const chunks = [];
Readable.from([Buffer.from([0xe0, 0xa4]), Buffer.from([0xa8])])  // "न" split across two chunks!
  .on('data', (c) => chunks.push(c))
  .on('end', () => console.log('joined correctly:', Buffer.concat(chunks).toString()));

// Comparing secrets: constant-time
const crypto = require('crypto');
const a = Buffer.from('token-123'), b = Buffer.from('token-123');
console.log('timing-safe equal:', a.length === b.length && crypto.timingSafeEqual(a, b));
:::

::: code javascript Browser demo: bytes, UTF-8 and base64 with Uint8Array (runnable)
// Browsers have no Buffer, but TextEncoder + Uint8Array show the same ideas.
const bytes = new TextEncoder().encode('Hi न');
console.log('bytes:', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' '));
console.log('6 bytes for 4 characters', bytes.length === 6 && 'Hi न'.length === 4 ? '✅' : '❌ FAIL');
console.log('न is e0 a4 a8 in UTF-8', bytes[3] === 0xe0 && bytes[4] === 0xa4 && bytes[5] === 0xa8 ? '✅' : '❌ FAIL');

const toBase64 = (u8) => btoa(String.fromCharCode(...u8));
const b64 = toBase64(bytes);
console.log('base64:', b64, b64 === 'SGkg4KSo' ? '✅' : '❌ FAIL');

const back = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
console.log('round trip →', back, back === 'Hi न' ? '✅' : '❌ FAIL');

const overhead = (n) => 4 * Math.ceil(n / 3);
console.log('1 MB as base64 =', overhead(1048576), 'chars (+33%)', overhead(1048576) === 1398104 ? '✅' : '❌ FAIL');
console.log('emoji: 2 UTF-16 units, 4 bytes', '😀'.length === 2 && new TextEncoder().encode('😀').length === 4 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `str.length` as a byte size (e.g. `Content-Length`): use `Buffer.byteLength(str)`.
- Decoding each stream chunk separately → broken multi-byte characters at chunk borders.
- `Buffer.allocUnsafe` without overwriting every byte → may expose old memory (secrets).
- Sending files as base64 in JSON (33% bigger, more memory, slower) instead of binary/multipart/streams.
- Comparing secrets with `===` or `buf.equals` instead of `crypto.timingSafeEqual`.
:::

::: understand
- Text is an **interpretation** of bytes; the encoding is the dictionary. Wrong dictionary → garbage.
- Buffers are how Node speaks to files, sockets and crypto; streams move Buffers in chunks.
- base64 is for putting bytes **into text channels** (JSON, headers, data URLs), not for storage efficiency.
:::

::: ask
- *"Why not just use strings?"* Binary data isn't valid UTF-8; converting corrupts it and wastes memory.
- *"Where does the data go next: S3, a DB, the browser?"* Decides binary vs base64.
- Trap: `Buffer` vs `ArrayBuffer`/`Uint8Array` in browsers; Node's Buffer *is* a `Uint8Array`.
:::

::: important ⭐ Say this in the interview
"A Buffer is Node's representation of raw binary data: a fixed-length sequence of bytes, implemented as a Uint8Array. Files, network packets, images and crypto all work with Buffers, and stream chunks are Buffers. Converting between text and bytes needs an encoding: UTF-8 by default, where a Hindi character takes three bytes and an emoji four, so string length is not byte length. base64 turns bytes into text-safe characters but makes them about a third bigger, so I upload files as binary streams rather than base64 in JSON. I prefer Buffer.alloc over allocUnsafe, collect chunks with Buffer.concat before decoding, and compare secrets with timingSafeEqual."
:::

::: links
Node.js: Buffer | https://nodejs.org/api/buffer.html
MDN: TextEncoder | https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder
MDN: Base64 | https://developer.mozilla.org/en-US/docs/Glossary/Base64
:::

=== What is EventEmitter?
@p 2
@tags events, observer-pattern
@quick
- `EventEmitter` (module `events`) is Node's **observer / pub-sub** implementation: `on`, `once`, `emit`, `off`.
- `emit` calls listeners **synchronously**, in registration order; a slow listener delays the emitter.
- HTTP servers, streams, sockets and `process` all extend EventEmitter.
- An `'error'` event with **no listener throws** and crashes the process; always listen for `'error'`.
- Remove listeners you no longer need; the "MaxListenersExceededWarning" (default 10) usually means a leak.

::: text 🧒 In simple words
EventEmitter is a **school notice board with subscriptions**. Students sign up for topics ("sports", "exams"). When the teacher pins a notice about "sports" (`emit`), every student who subscribed to sports gets it, one after another, right away. The teacher doesn't need to know who's listening, which keeps things decoupled: the order system just announces "order placed", and the email, inventory and analytics modules react on their own. If someone announces an "error" and nobody is listening for errors, the school alarm goes off (the process crashes).
:::

::: text 📖 Detailed answer
`EventEmitter` implements the **Observer pattern**: an object emits **named events**, and **listeners** subscribed to those names are called with the event's arguments.

### API
| Method | Purpose |
|---|---|
| `on(name, fn)` / `addListener` | Subscribe |
| `once(name, fn)` | Subscribe for one call only |
| `emit(name, ...args)` | Call all listeners synchronously; returns `true` if any existed |
| `off(name, fn)` / `removeListener` | Unsubscribe that exact function |
| `prependListener(name, fn)` | Subscribe at the front |
| `listenerCount(name)` | How many listeners |
| `setMaxListeners(n)` | Change the leak warning threshold (default 10) |
| `events.once(emitter, name)` | Promise that resolves on the next event (`await` it) |
| `events.on(emitter, name)` | Async iterator over events |

### Behaviour that matters
- **Synchronous**: `emit` runs every listener before returning. Use `setImmediate`/queues inside listeners for slow work.
- **Error event**: `emit('error', err)` without a listener **throws** `err`.
- **Ordering**: listeners run in the order they were added.
- **Scope**: in-process only. Across servers use Redis pub/sub, SNS/SQS, Kafka or RabbitMQ.

### Where you see it
| Object | Events |
|---|---|
| `http.Server` | `'request'`, `'connection'`, `'close'` |
| Streams | `'data'`, `'end'`, `'error'`, `'drain'`, `'finish'` |
| `process` | `'exit'`, `'SIGTERM'`, `'unhandledRejection'` |
| Mongoose connection | `'connected'`, `'error'`, `'disconnected'` |
:::

::: diagram Emit calls every subscriber synchronously
sequenceDiagram
  participant OS as OrderService
  participant EM as EventEmitter
  participant E as Email listener
  participant I as Inventory listener
  OS->>EM: emit order:placed (order 42)
  EM->>E: listener 1 (sync)
  E-->>EM: done
  EM->>I: listener 2 (sync)
  I-->>EM: done
  EM-->>OS: emit returns true
:::

::: image Publish/subscribe with EventEmitter: one emitter, many decoupled listeners, and the error rule
/images/node-core/event-emitter.svg
:::

::: text 🪜 Step by step
What `orders.emit('order:placed', order)` does:
1. Looks up the array of listeners for `'order:placed'` (copying it, so changes during emit don't affect this call).
2. Calls listener 1 with `order` and waits for it to return (synchronously).
3. Calls listener 2, then 3… in registration order; `once` listeners remove themselves before running.
4. Returns `true` because at least one listener existed.
5. For `emit('error', err)`: if no `'error'` listener exists, Node throws `err`, which crashes the process unless caught.
6. Async listeners (`async (o) => …`) start, return a Promise that `emit` **ignores**, so handle their errors inside them.
:::

::: code javascript Order events with EventEmitter (node events.js)
// How to run: node events.js
const EventEmitter = require('events');
const { once } = require('events');

class OrderService extends EventEmitter {
  placeOrder(order) {
    // ...save to the database here
    this.emit('order:placed', order);          // the service doesn't know who is listening
    return order;
  }
}

const orders = new OrderService();
orders.on('order:placed', (o) => console.log(`📧 email queued for order ${o.id}`));
orders.on('order:placed', (o) => console.log(`📦 reserved ${o.items.length} items`));
orders.once('order:placed', () => console.log('🎉 first order ever!'));
orders.on('error', (err) => console.error('handled error:', err.message));   // never leave 'error' unhandled

orders.placeOrder({ id: 1, items: ['book', 'pen'] });
orders.placeOrder({ id: 2, items: ['laptop'] });
orders.emit('error', new Error('payment gateway down'));

(async () => {
  setTimeout(() => orders.placeOrder({ id: 3, items: ['mug'] }), 50);
  const [next] = await once(orders, 'order:placed');                      // await the next event
  console.log('awaited order', next.id, '| listeners now:', orders.listenerCount('order:placed'));
})();
:::

::: code javascript Browser demo: build a mini EventEmitter and test it (runnable)
class MyEmitter {
  constructor() { this.events = new Map(); }
  on(name, fn) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
    return () => this.off(name, fn);                       // return an unsubscribe function
  }
  once(name, fn) {
    const wrapper = (...args) => { this.off(name, wrapper); fn(...args); };
    return this.on(name, wrapper);
  }
  off(name, fn) {
    this.events.set(name, (this.events.get(name) || []).filter((l) => l !== fn));
  }
  emit(name, ...args) {
    const list = [...(this.events.get(name) || [])];      // copy: listeners may unsubscribe while we emit
    if (name === 'error' && list.length === 0) throw args[0];
    list.forEach((fn) => fn(...args));
    return list.length > 0;
  }
}

const e = new MyEmitter();
const calls = [];
const unsub = e.on('greet', (n) => calls.push(`hello ${n}`));
e.once('greet', (n) => calls.push(`once ${n}`));
e.emit('greet', 'A');
e.emit('greet', 'B');
unsub();
const hadListeners = e.emit('greet', 'C');

console.log(calls.join(' | '));
console.log('listeners run in order, once only once', calls.join('|') === 'hello A|once A|hello B' ? '✅' : '❌ FAIL');
console.log('unsubscribe works', hadListeners === false ? '✅' : '❌ FAIL');
let threw = false;
try { e.emit('error', new Error('boom')); } catch (err) { threw = err.message === 'boom'; }
console.log('unhandled "error" event throws', threw ? '✅' : '❌ FAIL');
let order = '';
e.on('sync', () => { order += 'listener '; });
e.emit('sync');
order += 'after-emit';
console.log('emit is synchronous', order === 'listener after-emit' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No `'error'` listener → one emitted error crashes the server.
- Adding listeners inside a request handler and never removing them → memory leak and MaxListeners warning.
- Expecting `emit` to wait for `async` listeners (it ignores their Promises, and their errors become unhandled).
- Using EventEmitter for cross-service messaging: it only works inside one process.
- Removing a listener with a different function reference (e.g. a new arrow function) → nothing is removed.
:::

::: understand
- EventEmitter is the backbone of Node's own APIs (streams, servers, `process`).
- It's great for **decoupling modules in one process**; for durability or multiple servers, use a queue or pub/sub system.
- Synchronous emit = predictable order, but listeners must be fast.
:::

::: ask
- If asked to implement one: *"Should `emit` be sync or async? Should `on` return an unsubscribe? Do we need `once` and wildcards?"*
- *"Does this need to survive restarts or work across instances?"* → a message broker instead.
- Trap: async listeners and error handling.
:::

::: important ⭐ Say this in the interview
"EventEmitter is Node's implementation of the observer pattern: objects emit named events and listeners registered with on or once are called with the event data. Node's own HTTP servers, streams and the process object are emitters. Emit is synchronous, listeners run in registration order, and if an error event is emitted with no listener, Node throws and the process crashes, so I always handle error. I use it to decouple modules inside a process, like an order service announcing order placed while email and inventory listeners react, and I remove listeners to avoid leaks. For communication across instances or durable events I'd use Redis pub/sub, SNS/SQS or Kafka instead."
:::

::: links
Node.js: Events | https://nodejs.org/api/events.html
Node.js: events.once | https://nodejs.org/api/events.html#eventsonceemitter-name-options
Refactoring Guru: Observer pattern | https://refactoring.guru/design-patterns/observer
:::
