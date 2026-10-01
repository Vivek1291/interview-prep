@section Node.js Core
@icon 🟢
@color #22c55e
@desc Event loop, async patterns, streams, buffers, EventEmitter: the foundations every Node interview starts with.

=== How does the Node.js event loop work? (explain with an example)
@p 3
@tags event-loop, libuv, async
@quick
- JS runs on **one thread** (call stack). Slow I/O is handed to **libuv / OS**; callbacks come back through **queues**.
- Event loop = "when the call stack is empty, take the next callback from the queues and run it".
- Order: **sync code → process.nextTick → Promise microtasks → timers → I/O → setImmediate (check) → close**
- Microtasks (nextTick + Promises) are drained **after every macrotask / phase**.
- Never block the loop: CPU-heavy work → Worker Threads / queue / child process.

::: text
The **event loop** is the mechanism that lets Node.js do **non-blocking I/O on a single JavaScript thread**.

Your JavaScript runs on **one call stack**. When you call something slow such as reading a file, querying MongoDB or making an HTTP request, Node doesn't wait. It hands the work to **libuv**, the C library underneath Node. libuv uses the OS's async APIs (epoll/kqueue/IOCP) or its **thread pool** (default 4 threads, used for `fs`, `crypto`, `zlib` and `dns.lookup`). When the work finishes, its **callback is queued**. The event loop keeps checking: *"Is the call stack empty? Then run the next callback from the queue."*

### The flow you should be able to draw
- **JavaScript** code runs on the **Call Stack**
- It starts an **async operation** (fs, db, http, timer)
- **OS / libuv** does the work in the background
- On completion, the callback goes into a **callback queue**
- The **Event Loop** moves it onto the **Call Stack** once the stack is empty

### The 6 phases (each has its own FIFO queue)
| Phase | What runs there |
|---|---|
| **timers** | callbacks from `setTimeout` / `setInterval` whose time has elapsed |
| **pending callbacks** | some deferred system I/O callbacks (e.g. TCP errors) |
| **idle, prepare** | internal use only |
| **poll** | retrieve new I/O events and run I/O callbacks (most of your code); may **block/wait** here if nothing else is scheduled |
| **check** | `setImmediate` callbacks |
| **close callbacks** | e.g. `socket.on('close')` |

Between **every** callback (Node 11+), Node drains the **microtask queues**: first `process.nextTick`, then **Promise** callbacks (`.then`, `await` continuations).
:::

::: diagram Event loop: the big picture
flowchart LR
  A["Your JS code"] --> B["Call Stack"]
  B -->|"async call: fs, db, http, timer"| C["libuv / OS / Thread pool"]
  C -->|"work done"| D["Callback Queues"]
  D --> E{"Event Loop: is stack empty?"}
  E -->|"yes: push next callback"| B
  M["Microtasks: nextTick, Promises"] -.->|"drained after every callback"| B
:::

::: diagram The phases in order
flowchart TD
  T["1. timers: setTimeout, setInterval"] --> P["2. pending callbacks"]
  P --> I["3. idle / prepare"]
  I --> PO["4. poll: I/O callbacks, waits for I/O"]
  PO --> CH["5. check: setImmediate"]
  CH --> CL["6. close callbacks"]
  CL --> T
:::

::: code javascript Classic interview example: predict the output
console.log('1: script start');

setTimeout(() => console.log('5: setTimeout (macrotask - timers phase)'), 0);

Promise.resolve().then(() => console.log('4: promise.then (microtask)'));

queueMicrotask(() => console.log('4b: queueMicrotask (microtask)'));

(async () => {
  console.log('2: inside async fn (sync until first await)');
  await null;
  console.log('4c: after await (microtask)');
})();

console.log('3: script end');

// Output:
// 1: script start
// 2: inside async fn (sync until first await)
// 3: script end
// 4: promise.then (microtask)
// 4b: queueMicrotask (microtask)
// 4c: after await (microtask)
// 5: setTimeout (macrotask - timers phase)
:::

::: code javascript Node-only example with nextTick + setImmediate (run with: node file.js)
const fs = require('fs');

console.log('A: sync');

setTimeout(() => console.log('E/F: timeout'), 0);
setImmediate(() => console.log('E/F: immediate'));

process.nextTick(() => console.log('B: nextTick'));
Promise.resolve().then(() => console.log('C: promise'));

fs.readFile(__filename, () => {
  // Inside an I/O callback we are in the POLL phase,
  // so CHECK (setImmediate) always comes before the next TIMERS phase.
  setTimeout(() => console.log('H: timeout inside I/O'), 0);
  setImmediate(() => console.log('G: immediate inside I/O  <- always first here'));
});

console.log('D: sync end');
// A, D, B, C, then timeout/immediate (order NOT guaranteed in main module), then G, H
:::

::: code javascript Blocking the event loop (what NOT to do)
const start = Date.now();
setTimeout(() => console.log(`timer fired after ${Date.now() - start} ms (expected ~10ms)`), 10);

// CPU-heavy synchronous loop blocks the ONLY JS thread
let sum = 0;
for (let i = 0; i < 3e8; i++) sum += i;
console.log('heavy work done');
// The timer can only fire AFTER the loop finishes → much later than 10ms.
// In a server this means ALL requests are stuck while one request computes.
:::

::: understand
- Node is **single-threaded for JavaScript** but **multi-threaded underneath** (libuv thread pool + OS).
- `setTimeout(fn, 0)` means **"at least 0ms"**, not "immediately". It waits for the stack to clear **and** for the timers phase.
- **Microtasks run before the next macrotask.** A recursive `process.nextTick` or promise chain can **starve** the event loop, so I/O never runs.
- Main module: `setTimeout 0` vs `setImmediate` order is **non-deterministic**. Inside an I/O callback, `setImmediate` **always** runs first.
- Browser event loop ≈ same idea (macrotask + microtask queues) but **no phases, no nextTick, no setImmediate**.
:::

::: ask
- Ask: *"Do you want the browser event loop or the Node.js (libuv) event loop?"* They differ.
- Ask which **Node version**. Since **Node 11**, microtasks run between each `setTimeout` callback. Older versions ran the whole timers queue first.
- If they give a code snippet, **say your reasoning out loud** (stack → microtasks → timers → check). Interviewers care about the reasoning more than the final order.
- Be careful claiming "Node is single-threaded" without qualifying it. Say **"JS execution is single-threaded; I/O is handled by libuv's thread pool and the OS."**
:::

::: important
"Node runs my JavaScript on a single thread with an event loop. Async operations are offloaded to libuv, which uses the OS kernel or a thread pool. When they complete, their callbacks are queued, and the event loop picks them up in phases (timers, poll, check, close) whenever the call stack is empty. Between callbacks it drains microtasks: nextTick first, then promises. That's why Node handles thousands of concurrent connections cheaply, and also why CPU-heavy code must never run on the main thread."
:::

::: links
Node.js docs: The Event Loop | https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
Don't block the event loop | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
Loupe: visualise the call stack (Philip Roberts) | http://latentflip.com/loupe/
Talk: What the heck is the event loop anyway? | https://www.youtube.com/watch?v=8aGhZQkoFbQ
:::

=== What is Node.js and why is it used?
@p 3
@tags basics, v8, runtime
@quick
- Node.js = **JavaScript runtime** built on **V8** (Chrome's engine) + **libuv** (event loop, async I/O).
- Best for **I/O-heavy** apps: REST APIs, real-time (WebSockets), streaming, BFFs, microservices.
- Not ideal for **CPU-heavy** work (video encoding, ML) unless you use worker threads.
- Pros: one language for front and back end, npm ecosystem, fast I/O, huge community.

::: text
**Node.js** is an open-source, cross-platform **JavaScript runtime** that lets you run JavaScript **outside the browser**, typically on servers.

### What it's made of
- **V8**: Google's JS engine, which compiles JS to machine code (JIT).
- **libuv**: C library that provides the **event loop**, **async I/O** and a **thread pool**.
- **Node core APIs**: `fs`, `http`, `crypto`, `stream`, `events`, `path`, `os`, and more.
- **npm**: the largest package ecosystem in the world.

### Why companies use it
- **Non-blocking, event-driven I/O**: one process can handle **thousands of concurrent connections** with little memory, because it doesn't create one thread per request.
- **Same language everywhere**: share types, validation and utilities between React and the API. Full-stack teams move faster.
- **Great for**: REST/GraphQL APIs, real-time apps (chat, notifications, dashboards), streaming, API gateways / BFF (Backend-for-Frontend), serverless functions, CLIs and tooling (Vite, ESLint, Webpack all run on Node).

### When NOT to use it
- **CPU-bound** workloads (image/video processing, heavy computation, ML training) block the event loop. Use **worker_threads**, a job queue, or another language/service.
:::

::: chart bar Concurrency model: memory per 10k idle connections (illustrative)
Model,Memory (MB)
Thread-per-request (e.g. classic Java/Apache),2000
Node.js event loop,150
:::

::: code javascript A complete HTTP server with zero dependencies (node server.js)
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
});

server.listen(3000, () => console.log('Listening on http://localhost:3000'));
:::

::: understand
- Node is a **runtime**, not a language and not a framework. Express is the framework.
- "Fast" in Node means **high throughput for I/O**. It doesn't mean faster CPU computation than Go, Java or Rust.
- Be ready to explain **why** the event loop makes it scalable: no thread per connection, so no context-switch or memory overhead.
:::

::: ask
- Clarify whether they want a **high-level answer** (why use Node) or **internals** (V8, libuv, event loop), then offer to go deeper.
- Relate it to your experience: *"In my project, Node served our React app's API and a WebSocket channel for live updates…"*
:::

::: links
Introduction to Node.js | https://nodejs.org/en/learn/getting-started/introduction-to-nodejs
libuv design overview | https://docs.libuv.org/en/v1.x/design.html
:::

=== What is non-blocking I/O?
@p 3
@tags io, async
@quick
- **Blocking**: the thread waits until I/O finishes (`fs.readFileSync`).
- **Non-blocking**: start the I/O, continue running other code, get a **callback/promise** when done.
- Node's whole design = non-blocking I/O + event loop, so one thread serves many requests.
- Never use `*Sync` APIs inside request handlers.

::: text
**I/O** = anything that talks to the outside world: disk, network, database, other services.

- **Blocking I/O**: the calling thread **stops and waits** until the operation completes. Nothing else can run on that thread in the meantime.
- **Non-blocking I/O**: the call **returns immediately**, the OS/libuv does the work, and your code is **notified later** (callback, Promise, event).

In Node there is only **one JS thread**, so a single blocking call (e.g. `fs.readFileSync` on a big file inside a route) **freezes every other request**.

### Restaurant analogy 🍽️
- **Blocking waiter**: takes your order, stands in the kitchen until it's cooked, *then* serves the next table.
- **Non-blocking waiter (Node)**: takes your order, gives it to the kitchen (libuv), serves other tables, and brings your food when the kitchen rings the bell (callback).
:::

::: diagram Blocking vs non-blocking timeline
sequenceDiagram
  participant C1 as Request 1
  participant N as Node thread
  participant D as Disk/DB (libuv)
  participant C2 as Request 2
  C1->>N: GET /file
  N->>D: readFile (non-blocking)
  C2->>N: GET /users
  N-->>C2: respond immediately
  D-->>N: data ready (callback)
  N-->>C1: respond with file
:::

::: code javascript Blocking vs non-blocking (node file.js)
const fs = require('fs');

// ❌ BLOCKING — thread waits here
console.time('sync');
const data = fs.readFileSync(__filename, 'utf8');
console.log('sync read', data.length, 'chars');
console.timeEnd('sync');
console.log('this line waited for the file');

// ✅ NON-BLOCKING (callback)
fs.readFile(__filename, 'utf8', (err, content) => {
  if (err) return console.error(err);
  console.log('callback read', content.length, 'chars');
});

// ✅ NON-BLOCKING (promise / async-await) — preferred today
const fsp = require('fs/promises');
(async () => {
  const content = await fsp.readFile(__filename, 'utf8');
  console.log('await read', content.length, 'chars');
})();

console.log('this line runs BEFORE the async reads finish');
:::

::: warning
- Using `readFileSync`, `bcrypt.hashSync`, `JSON.parse` on huge payloads, or big synchronous loops **inside route handlers**.
- Thinking `async` makes CPU work non-blocking. Wrapping a heavy loop in an `async` function **still blocks**; async only helps for I/O.
:::

::: ask
- It's fine to say that `*Sync` APIs are OK at **startup** (e.g. loading config once) but never inside request paths.
- If asked "how do you make CPU work non-blocking?", answer: **worker_threads**, child processes, or offload to a queue/worker service.
:::

::: links
Overview of blocking vs non-blocking | https://nodejs.org/en/learn/asynchronous-work/overview-of-blocking-vs-non-blocking
:::

=== Node.js is single-threaded: what does that actually mean?
@p 3
@tags threads, libuv, worker-threads
@quick
- **Your JS** runs on **one main thread** (one call stack).
- Node itself is **not** single-threaded: libuv thread pool (default **4**, `UV_THREADPOOL_SIZE`) + OS async I/O.
- Thread pool is used for: **fs, crypto (pbkdf2, bcrypt), zlib, dns.lookup**. Network I/O uses the OS (epoll/kqueue).
- For CPU work: **worker_threads**; to use all CPU cores: **cluster / PM2 cluster mode**.

::: text
"Single-threaded" refers **only to JavaScript execution**: there's one call stack, and one piece of JS runs at a time. That's why you don't need locks or mutexes for normal JS variables.

But the **Node process has many threads**:
- **Main thread**: runs V8 + the event loop + your JS.
- **libuv thread pool**: default **4 threads**, configurable via `UV_THREADPOOL_SIZE` (max 1024). Used for `fs.*`, `crypto.pbkdf2/scrypt/randomBytes`, `zlib`, `dns.lookup`.
- **OS-level async**: network sockets don't use the thread pool. They use epoll (Linux), kqueue (macOS) or IOCP (Windows).
- **V8 background threads**: garbage collection and compilation.

### Using multiple cores
| Tool | What it does | Use for |
|---|---|---|
| `worker_threads` | Real threads with their own V8 isolate; communicate via messages / SharedArrayBuffer | CPU-heavy tasks (image resize, parsing, hashing) |
| `cluster` module / **PM2 cluster mode** | Forks N processes sharing one port | Using all CPU cores for an HTTP server |
| `child_process` | Spawn separate programs | Running scripts / other binaries |
:::

::: diagram Inside a Node process
flowchart TB
  subgraph Process["Node.js process"]
    M["Main thread: V8 + Event loop + YOUR JS"]
    subgraph Pool["libuv thread pool (4)"]
      T1["fs"]
      T2["crypto"]
      T3["zlib"]
      T4["dns.lookup"]
    end
    OS["OS async sockets: epoll / kqueue / IOCP"]
  end
  M --> Pool
  M --> OS
:::

::: code javascript Offload CPU work to a worker thread (node main.js)
// main.js
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: { n: 42 } });
  worker.on('message', (result) => console.log('fib result:', result));
  worker.on('error', console.error);
  console.log('main thread is free to handle other requests…');
} else {
  const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)); // CPU heavy
  parentPort.postMessage(fib(workerData.n));
}
:::

::: code javascript Use all CPU cores with cluster (node server.js)
const cluster = require('cluster');
const http = require('http');
const os = require('os');

if (cluster.isPrimary) {
  const cpus = os.cpus().length;
  console.log(`Primary ${process.pid} forking ${cpus} workers`);
  for (let i = 0; i < cpus; i++) cluster.fork();
  cluster.on('exit', (w) => {
    console.log(`worker ${w.process.pid} died, restarting`);
    cluster.fork();
  });
} else {
  http.createServer((req, res) => res.end(`handled by ${process.pid}\n`)).listen(3000);
}
:::

::: understand
- Thread-pool saturation: if 4 slow `crypto.pbkdf2` calls are running, the **5th fs call waits**. This is a real production bottleneck, and you can tune it with `UV_THREADPOOL_SIZE`.
- Worker threads **don't share** JS objects (except SharedArrayBuffer). Data is **copied** via structured clone.
- In production we usually run **one Node process per core** (PM2 cluster / multiple containers behind a load balancer).
:::

::: ask
- Clarify: *"Do you mean the JavaScript execution model or the whole runtime?"* This shows you know the difference.
- If they ask about scaling: talk about **horizontal scaling** (multiple processes/containers + load balancer) and keep **state out of memory** (Redis for sessions/cache).
:::

::: links
Worker threads docs | https://nodejs.org/api/worker_threads.html
Cluster docs | https://nodejs.org/api/cluster.html
UV_THREADPOOL_SIZE | https://nodejs.org/api/cli.html#uv_threadpool_sizesize
:::

=== What are the event loop phases?
@p 2
@tags event-loop, phases
@quick
- **timers → pending callbacks → idle/prepare → poll → check → close callbacks**
- timers = setTimeout/setInterval · poll = I/O callbacks · check = setImmediate · close = 'close' events
- Microtasks (nextTick, then Promises) run **between every callback**.
- Loop exits when there's nothing left to do (no timers, no handles, no pending I/O).

::: text
Each loop iteration is called a **tick**. The loop goes through these phases **in order**, and each phase has a FIFO queue of callbacks:

1. **Timers**: runs `setTimeout` and `setInterval` callbacks whose threshold has passed.
2. **Pending callbacks**: I/O callbacks deferred from the previous iteration (e.g. some TCP errors).
3. **Idle / prepare**: internal only.
4. **Poll**: the most important phase. It fetches new I/O events and runs their callbacks (file read done, DB response, incoming HTTP request). If the queue is empty it **waits** for I/O, unless `setImmediate` callbacks or expiring timers exist.
5. **Check**: runs `setImmediate` callbacks, right after poll.
6. **Close callbacks**: e.g. `socket.on('close', …)`.

**Between each callback**, Node drains:
1. the `process.nextTick` queue, then
2. the **Promise microtask** queue.

The process **exits** when the loop has no more pending timers, I/O handles or requests. That's why a server keeps running (its listening socket is an active handle) and a script ends.
:::

::: diagram
flowchart LR
  A(("start tick")) --> T["timers"] --> PC["pending callbacks"] --> IP["idle, prepare"] --> P["poll (I/O)"] --> C["check (setImmediate)"] --> CL["close callbacks"] --> A
:::

::: code javascript Seeing phases in action (node phases.js)
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('poll phase: file read callback');
  setTimeout(() => console.log('timers phase (next tick of loop)'), 0);
  setImmediate(() => console.log('check phase (same tick, right after poll)'));
  process.nextTick(() => console.log('nextTick: runs right after this callback'));
});
// Output:
// poll phase: file read callback
// nextTick: runs right after this callback
// check phase (same tick, right after poll)
// timers phase (next tick of loop)
:::

::: ask
- Most interviewers are happy with **timers → poll → check** plus the microtask rule. Don't over-explain the internal phases unless asked.
- Mention you know **Node 11+ behaviour** (microtasks between each callback).
:::

::: links
Event loop, timers and nextTick (official) | https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
:::

=== Difference between synchronous and asynchronous code
@p 3
@tags async, basics
@quick
- **Sync**: runs line by line, each line waits for the previous one to finish.
- **Async**: starts a task and continues; the result arrives later via callback/Promise/await.
- `await` pauses only the **current async function**, not the whole thread.
- Run independent async tasks in **parallel** with `Promise.all`.

::: text
**Synchronous** code executes **in order**, and each statement **blocks** until it finishes.
**Asynchronous** code **starts** an operation and **moves on**. The result is handled **later**, when the operation completes.

| | Synchronous | Asynchronous |
|---|---|---|
| Execution | Line by line, waits | Starts a task, continues, handles the result later |
| Blocks thread? | Yes | No (for I/O) |
| Error handling | `try/catch` | callback `err`, `.catch()`, or `try/catch` with `await` |
| Examples | math, loops, `JSON.parse`, `readFileSync` | `fetch`, DB queries, `fs.readFile`, timers |

**Key insight:** `await` only pauses **the async function it's in**. The event loop keeps serving other requests.
:::

::: code javascript Sequential vs parallel async: a very common interview trap
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function sequential() {
  console.time('sequential');
  const a = await wait(300, 'user');
  const b = await wait(300, 'orders'); // waits for a first — unnecessary!
  console.timeEnd('sequential'); // ~600ms
  return [a, b];
}

async function parallel() {
  console.time('parallel');
  const [a, b] = await Promise.all([wait(300, 'user'), wait(300, 'orders')]);
  console.timeEnd('parallel'); // ~300ms
  return [a, b];
}

(async () => {
  console.log(await sequential());
  console.log(await parallel());
})();
:::

::: tip
Use **sequential** awaits only when step B **depends on** step A's result (e.g. get the user, then get *their* orders). Otherwise, use `Promise.all` (or `Promise.allSettled` if partial failure is OK).
:::

::: ask
- If asked to "make this faster", check whether the awaits are **independent**. That's usually the expected answer.
- Mention **error behaviour**: `Promise.all` rejects fast on the first failure; `allSettled` waits for all of them.
:::

=== What are callbacks, Promises and async/await?
@p 3
@tags promises, async-await, callbacks
@quick
- **Callback**: function passed to be called later; Node style `(err, data)`. Problem: **callback hell**, inversion of control.
- **Promise**: object for a future value with states **pending → fulfilled/rejected**; chain with `.then/.catch/.finally`.
- **async/await**: syntax sugar over Promises; reads like sync code; errors via `try/catch`.
- Combinators: `Promise.all`, `allSettled`, `race`, `any`.
- `util.promisify` converts callback APIs into Promise APIs.

::: text
These are three generations of handling async results in JavaScript.

### 1. Callbacks
A function passed as an argument and called when the work is done. Node convention: **error-first** `(err, result)`.
Problems: **callback hell** (pyramid of doom), **inversion of control** (you trust the library to call it exactly once), and error handling is repeated at every level.

### 2. Promises (ES2015)
A **Promise** is an object representing a value that will be available **later**.
- States: **pending** → **fulfilled** (resolved with a value) or **rejected** (with a reason). Once settled, it's **immutable**.
- `.then()` returns a **new promise**, which enables **chaining**. One `.catch()` at the end handles errors from the whole chain.

### 3. async / await (ES2017)
Syntax on top of Promises. An `async` function **always returns a Promise**. `await` pauses that function until the promise settles, so code reads top to bottom and errors use normal `try/catch`.
:::

::: diagram Promise states
stateDiagram-v2
  [*] --> Pending
  Pending --> Fulfilled: resolve(value)
  Pending --> Rejected: reject(error) / throw
  Fulfilled --> [*]
  Rejected --> [*]
:::

::: code javascript Same task in all three styles
// Simulated async functions
const getUser = (id, cb) => setTimeout(() => cb(null, { id, name: 'Vivek' }), 100);
const getOrders = (user, cb) => setTimeout(() => cb(null, ['order1', 'order2']), 100);

// 1) Callbacks — nesting grows with every step
getUser(1, (err, user) => {
  if (err) return console.error(err);
  getOrders(user, (err2, orders) => {
    if (err2) return console.error(err2);
    console.log('callbacks:', user.name, orders);
  });
});

// Promisify helper (Node has util.promisify)
const promisify = (fn) => (...args) =>
  new Promise((resolve, reject) => fn(...args, (err, data) => (err ? reject(err) : resolve(data))));
const getUserP = promisify(getUser);
const getOrdersP = promisify(getOrders);

// 2) Promises — flat chain, single catch
getUserP(1)
  .then((user) => getOrdersP(user).then((orders) => ({ user, orders })))
  .then(({ user, orders }) => console.log('promises:', user.name, orders))
  .catch(console.error)
  .finally(() => console.log('promise chain finished'));

// 3) async/await — reads like synchronous code
async function main() {
  try {
    const user = await getUserP(1);
    const orders = await getOrdersP(user);
    console.log('async/await:', user.name, orders);
  } catch (err) {
    console.error(err);
  }
}
main();
:::

::: code javascript Promise combinators cheat-sheet
const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, e) => new Promise((_, j) => setTimeout(() => j(new Error(e)), ms));

(async () => {
  console.log('all:', await Promise.all([ok(100, 'a'), ok(50, 'b')])); // ['a','b'] — rejects on first failure

  console.log('allSettled:', await Promise.allSettled([ok(10, 'a'), fail(20, 'boom')]));
  // [{status:'fulfilled',value:'a'},{status:'rejected',reason:Error}]

  console.log('race:', await Promise.race([ok(100, 'slow'), ok(10, 'fast')])); // 'fast' — first SETTLED (even a rejection)

  console.log('any:', await Promise.any([fail(10, 'x'), ok(50, 'first success')])); // first FULFILLED

  // Timeout pattern with race
  const withTimeout = (p, ms) => Promise.race([p, fail(ms, `Timed out after ${ms}ms`)]);
  try { await withTimeout(ok(500, 'data'), 100); } catch (e) { console.log('timeout:', e.message); }
})();
:::

::: understand
- `.then` callbacks run as **microtasks**, never synchronously, even when the promise is already resolved.
- An `async` function returning a value = `Promise.resolve(value)`. Throwing inside it = a rejected promise.
- `await` in a `for` loop runs tasks **sequentially**. Use `Promise.all(items.map(...))` for parallel work, but consider **concurrency limits** for thousands of items.
- Forgetting `return` inside `.then()` breaks the chain, and the next `.then` gets `undefined`.
:::

::: ask
- Ask if they want you to **implement a Promise** or `Promise.all` from scratch. It's a common follow-up; see the *JS Implementations* section.
- Mention unhandled rejections: in Node 15+ an **unhandled promise rejection crashes the process** by default.
:::

::: links
MDN: Using promises | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
MDN: async function | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
javascript.info: Promises, async/await | https://javascript.info/async
:::

=== How does error handling work with async/await?
@p 3
@tags errors, async-await
@quick
- Wrap `await` in **try/catch/finally**, or attach `.catch()` to the returned promise.
- Unhandled rejections **crash Node 15+**, so always handle them. Add `process.on('unhandledRejection')` as a last-resort log.
- `Promise.all` rejects on first error; use `allSettled` for partial results.
- In Express 4, async errors must be passed to `next(err)` (asyncHandler); Express 5 does it automatically.

::: text
With async/await, a **rejected promise becomes a thrown exception** at the `await` line, so you use regular **try / catch / finally**.

### Patterns
1. **try/catch around awaits**: the most common approach.
2. **`.catch()` on the call**: `await doThing().catch(handle)` for a local fallback.
3. **Go-style tuple helper**: `const [err, data] = await to(promise)` avoids nested try blocks.
4. **Centralised handling**: in Express, let errors bubble to **error-handling middleware** (see the Express section).
5. **Last resort**: `process.on('unhandledRejection')` and `process.on('uncaughtException')`. Log, then **exit and let PM2/Docker restart** the process, because its state may be corrupted.

### Gotchas
- `try/catch` **does not** catch errors from a promise you **didn't await**.
- `forEach` with an async callback **doesn't wait** and its errors escape. Use `for…of` or `Promise.all`.
- **Rethrow** errors you can't handle. Swallowing them hides bugs.
:::

::: code javascript Error handling patterns
const fetchUser = async (id) => {
  if (id <= 0) throw new Error('Invalid id');
  return { id, name: 'Vivek' };
};

// 1) try / catch / finally
async function one() {
  try {
    const user = await fetchUser(-1);
    console.log(user);
  } catch (err) {
    console.log('caught:', err.message);
  } finally {
    console.log('cleanup (close connection, stop spinner…)');
  }
}

// 2) Tuple helper
const to = (promise) => promise.then((data) => [null, data]).catch((err) => [err, null]);
async function two() {
  const [err, user] = await to(fetchUser(5));
  if (err) return console.log('error', err.message);
  console.log('user', user);
}

// 3) The classic bug: missing await → try/catch cannot catch it
async function bug() {
  try {
    // ❌ no await → the rejection escapes try/catch (would be an UNHANDLED rejection → crash in Node 15+)
    fetchUser(-1).catch((e) => console.log('only a .catch on the promise itself sees it:', e.message));
  } catch (e) {
    console.log('never runs');
  }
}

// 4) forEach does not await!
async function loops() {
  const ids = [1, 2, 3];
  for (const id of ids) console.log('for-of sequential', await fetchUser(id));
  const all = await Promise.all(ids.map(fetchUser)); // parallel
  console.log('parallel', all.length);
}

(async () => {
  await one();
  await two();
  await loops();
  await bug();
})();
:::

::: code javascript Global safety net in a Node server (index.js)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  // log to monitoring (Sentry/CloudWatch) then crash & let PM2/Docker restart
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
:::

::: ask
- Clarify the context: **Express route**, **background job**, or a **frontend fetch**? The error strategy differs: respond with a status code, retry, or show a UI error state.
- Talk about **operational vs programmer errors**: operational errors (DB down, invalid input) are handled and returned to the client; programmer errors (bugs) are logged and the process crashes and restarts.
:::

::: links
Node.js error handling best practices (goldbergyoni) | https://github.com/goldbergyoni/nodebestpractices#2-error-handling-practices
:::

=== Difference between process.nextTick(), setImmediate() and setTimeout()
@p 3
@tags event-loop, nextTick, setImmediate
@quick
- `process.nextTick` → runs **right after the current operation**, before promises and before the loop continues (highest priority).
- Promise `.then` → microtask, after the nextTick queue.
- `setImmediate` → **check phase**, after poll (after I/O).
- `setTimeout(fn, 0)` → **timers phase**, minimum ~1ms.
- Inside an I/O callback, `setImmediate` **always** beats `setTimeout 0`.

::: text
| API | Queue | When it runs | Typical use |
|---|---|---|---|
| `process.nextTick(fn)` | nextTick queue (microtask, highest priority) | Immediately after the current JS operation, **before** promises and **before** the event loop continues | Emit events after the constructor returns; ensure a callback is always async |
| `Promise.then` / `queueMicrotask` | microtask queue | After the nextTick queue is empty | Normal async code |
| `setImmediate(fn)` | check phase | After the **poll** phase of the current loop iteration | Run code **after I/O callbacks** without delay |
| `setTimeout(fn, 0)` | timers phase | Next timers phase, after ≥1ms | Delays, debouncing |

⚠️ Recursive `process.nextTick` can **starve I/O**, because the loop never gets to the poll phase. Node docs recommend `setImmediate` in most cases.

**Naming is confusing:** `nextTick` fires *more immediately* than `setImmediate`. A good line for interviews: *"their names should be swapped"*.
:::

::: code javascript Predict the output (node order.js)
setTimeout(() => console.log('4 or 5: setTimeout'), 0);
setImmediate(() => console.log('4 or 5: setImmediate'));
Promise.resolve().then(() => console.log('3: promise'));
process.nextTick(() => console.log('2: nextTick'));
console.log('1: sync');

// 1: sync
// 2: nextTick
// 3: promise
// then setTimeout / setImmediate — order depends on process performance in the MAIN module
:::

::: code javascript Starvation demo — why nextTick recursion is dangerous (node starve.js)
let count = 0;
setTimeout(() => console.log('timer finally ran after', count, 'nextTicks'), 0);

function spin() {
  if (++count < 1e6) process.nextTick(spin); // blocks the loop from progressing
}
spin();
// With setImmediate(spin) instead, the timer would get a chance to run between iterations.
:::

::: ask
- If you're given a puzzle, ask *"Is this code in the main module or inside an I/O callback?"*, because the timeout/immediate order depends on it. This impresses interviewers.
:::

::: links
Understanding process.nextTick | https://nodejs.org/en/learn/asynchronous-work/understanding-processnexttick
Understanding setImmediate | https://nodejs.org/en/learn/asynchronous-work/understanding-setimmediate
:::

=== What are streams in Node.js?
@p 3
@tags streams, performance, backpressure
@quick
- Streams process data **chunk by chunk** instead of loading it all into memory.
- 4 types: **Readable, Writable, Duplex (TCP socket), Transform (zlib, crypto)**.
- Use `stream.pipeline()` (handles errors + cleanup), not bare `.pipe()`.
- **Backpressure**: when the writer is slow, `write()` returns false, so pause reading until the `'drain'` event.
- Examples: file download/upload, CSV export, video, S3 uploads, HTTP req/res are streams.

::: text
A **stream** is an abstraction for working with data **piece by piece (chunks)** as it arrives, instead of waiting for all of it and holding it in memory.

**Why it matters:** reading a 2 GB file with `fs.readFile` puts 2 GB into RAM (and may crash). With streams, memory stays at around **64 KB** (the default `highWaterMark` for fs streams) regardless of file size, and the first bytes are processed sooner.

### 4 types
| Type | Description | Examples |
|---|---|---|
| **Readable** | Source you read from | `fs.createReadStream`, HTTP **request** (server side), `process.stdin` |
| **Writable** | Destination you write to | `fs.createWriteStream`, HTTP **response**, `process.stdout` |
| **Duplex** | Both readable and writable (independent) | TCP `net.Socket`, WebSocket |
| **Transform** | Duplex that **modifies** data passing through | `zlib.createGzip()`, `crypto.createCipheriv`, CSV parsers |

### Backpressure
If you read faster than you can write, data piles up in memory. `writable.write()` returns **false** when its buffer is full. You should **pause** reading and resume on `'drain'`. `pipe()` and `pipeline()` do this **automatically**.
:::

::: diagram Stream pipeline
flowchart LR
  R["Readable: big.csv"] -->|"64KB chunks"| T1["Transform: parse CSV"]
  T1 --> T2["Transform: gzip"]
  T2 --> W["Writable: HTTP response / S3"]
  W -.->|"backpressure: slow down!"| R
:::

::: chart line Memory usage while processing a 1 GB file (illustrative)
Seconds,readFile (MB),Stream (MB)
0,50,50
1,400,52
2,800,53
3,1100,52
4,1100,53
:::

::: code javascript Stream a large file as a download (Express)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const express = require('express');
const app = express();

app.get('/download/report', async (req, res, next) => {
  const file = path.join(__dirname, 'big-report.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
  try {
    // pipeline = pipe + proper error handling + cleanup of all streams
    await pipeline(fs.createReadStream(file), zlib.createGzip(), res);
  } catch (err) {
    next(err);
  }
});

app.listen(3000);
:::

::: code javascript Custom Transform stream: uppercase each chunk (node upper.js)
const { Transform, pipeline } = require('stream');

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  },
});

// echo "hello streams" | node upper.js
pipeline(process.stdin, upperCase, process.stdout, (err) => {
  if (err) console.error('Pipeline failed', err);
});
:::

::: code javascript Reading a stream with for-await (modern & simple)
const fs = require('fs');
const readline = require('readline');

async function countLines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lines = 0;
  for await (const line of rl) {
    if (line.trim()) lines++;
  }
  return lines;
}
countLines(__filename).then((n) => console.log('non-empty lines:', n));
:::

::: understand
- `req` and `res` in Express **are streams**. That's how file uploads (multer/busboy) and downloads work.
- `pipe()` doesn't forward errors or destroy the other streams on failure. **`pipeline()` does.**
- Streams connect directly to AWS: `s3.upload({ Body: readStream })` / `@aws-sdk/lib-storage` `Upload` for multipart uploads.
:::

::: ask
- Ask about **data size** and whether the client needs the result **progressively**. Streams are worth it for large or unbounded data, not for small JSON responses.
- For exports: *"Should I stream the CSV directly from a MongoDB cursor?"* → `Model.find().cursor()` piped through a transform to the response.
:::

::: links
Node.js Stream docs | https://nodejs.org/api/stream.html
Backpressuring in streams | https://nodejs.org/en/learn/modules/backpressuring-in-streams
:::

=== What are Buffers?
@p 2
@tags buffer, binary
@quick
- Buffer = fixed-size chunk of **raw binary memory** (bytes), allocated outside the V8 heap.
- Used for files, network packets, images, crypto; stream chunks are Buffers.
- `Buffer.from('hi')`, `Buffer.alloc(10)`, `buf.toString('base64')`.
- Buffer is a subclass of `Uint8Array`.
- Prefer `Buffer.alloc` over `allocUnsafe` (which may contain old memory data).

::: text
JavaScript strings are UTF-16 text. Servers deal with **binary data**: files, images, TCP packets, encryption. A **Buffer** is Node's way to represent a fixed-length sequence of **bytes** (0–255).

- Lives in memory **outside the V8 heap** (efficient for large binary data).
- It's a subclass of **`Uint8Array`**, so typed-array methods work.
- **Encodings** when converting to/from strings: `utf8` (default), `base64`, `hex`, `latin1`, `ascii`.

### Common operations
| Code | Meaning |
|---|---|
| `Buffer.from('Hello')` | string → bytes |
| `Buffer.alloc(10)` | 10 zero-filled bytes (safe) |
| `Buffer.allocUnsafe(10)` | faster but **may contain old data** |
| `buf.toString('base64')` | encode as base64 (e.g. image data URLs, basic auth) |
| `Buffer.concat([a, b])` | join buffers (e.g. collecting stream chunks) |
| `buf.length` | number of **bytes** (not characters!) |
:::

::: code javascript Buffer basics (node buffer.js)
const buf = Buffer.from('Hello, नमस्ते');
console.log(buf);                       // <Buffer 48 65 6c 6c 6f ...>
console.log('chars:', 'Hello, नमस्ते'.length, 'bytes:', buf.length); // bytes > chars for non-ASCII

console.log(buf.toString('base64'));
console.log(buf.toString('hex'));
console.log(Buffer.from('SGVsbG8=', 'base64').toString()); // Hello

// Basic auth header
const token = Buffer.from('user:password').toString('base64');
console.log('Authorization: Basic ' + token);

// Collect a stream into one buffer
const { Readable } = require('stream');
const chunks = [];
Readable.from(['a', 'b', 'c']).on('data', (c) => chunks.push(Buffer.from(c)))
  .on('end', () => console.log('joined:', Buffer.concat(chunks).toString()));
:::

::: ask
- If they ask *"why not just use strings?"*, answer that binary data isn't valid UTF-8 text, and conversions corrupt it and waste memory.
- Mention that **Base64 inflates size by ~33%**, which is why we upload files to S3 as binary/streams instead of base64 in JSON.
:::

::: links
Buffer docs | https://nodejs.org/api/buffer.html
:::

=== What is EventEmitter?
@p 2
@tags events, observer-pattern
@quick
- `EventEmitter` = Node's **pub/sub (observer)** implementation: `on`, `once`, `emit`, `off`.
- Listeners run **synchronously**, in registration order, when `emit` is called.
- Streams, HTTP server, sockets and `process` all extend EventEmitter.
- Always handle the `'error'` event, or an emitted error **crashes** the process.
- Watch out for memory leaks (default max 10 listeners warning).

::: text
`EventEmitter` (from the `events` module) implements the **Observer / Publish–Subscribe pattern**. Objects **emit named events**, and **listeners** subscribed to those events are called.

It's the backbone of Node: `http.Server` emits `'request'`, streams emit `'data'`/`'end'`/`'error'`, and `process` emits `'exit'`.

### Key API
- `emitter.on(event, listener)` / `addListener`: subscribe
- `emitter.once(event, listener)`: fire only once
- `emitter.emit(event, ...args)`: publish (returns true if there were listeners)
- `emitter.off(event, listener)` / `removeListener`: unsubscribe
- `emitter.setMaxListeners(n)`: default warning at **10** listeners, which usually signals a leak

### Important behaviour
- `emit` calls listeners **synchronously**, one after another. A slow listener blocks the emitter.
- If `'error'` is emitted with **no listener**, Node **throws** it and the process crashes.
:::

::: code javascript Build an order-events system with EventEmitter (node events.js)
const EventEmitter = require('events');

class OrderService extends EventEmitter {
  placeOrder(order) {
    // ...save to DB
    this.emit('order:placed', order); // decoupled: service doesn't know who listens
    return order;
  }
}

const orders = new OrderService();

orders.on('order:placed', (o) => console.log(`📧 email sent for order ${o.id}`));
orders.on('order:placed', (o) => console.log(`📦 inventory reserved for ${o.items.length} items`));
orders.once('order:placed', () => console.log('🎉 first order ever!'));
orders.on('error', (err) => console.error('handled error:', err.message));

orders.placeOrder({ id: 1, items: ['book', 'pen'] });
orders.placeOrder({ id: 2, items: ['laptop'] });
orders.emit('error', new Error('payment gateway down'));
:::

::: code javascript Mini EventEmitter from scratch (common interview task)
class MyEmitter {
  constructor() { this.events = new Map(); }
  on(name, fn) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
    return () => this.off(name, fn); // return an unsubscribe function
  }
  once(name, fn) {
    const wrapper = (...args) => { this.off(name, wrapper); fn(...args); };
    return this.on(name, wrapper);
  }
  off(name, fn) {
    const list = this.events.get(name) || [];
    this.events.set(name, list.filter((l) => l !== fn));
  }
  emit(name, ...args) {
    const list = [...(this.events.get(name) || [])]; // copy: listeners may unsubscribe while emitting
    list.forEach((fn) => fn(...args));
    return list.length > 0;
  }
}

const e = new MyEmitter();
const unsub = e.on('greet', (n) => console.log('hello', n));
e.once('greet', (n) => console.log('only once for', n));
e.emit('greet', 'Vivek');
e.emit('greet', 'again');
unsub();
console.log('after unsubscribe, had listeners?', e.emit('greet', 'nobody'));
:::

::: understand
- EventEmitter is **in-process only**. To communicate across servers, use Redis pub/sub, Kafka, SQS/SNS or RabbitMQ.
- Remove listeners in cleanup (the same idea as removing `addEventListener` in a React `useEffect` cleanup) to avoid **memory leaks**.
:::

::: ask
- If asked to implement one, clarify: *"Should `emit` be sync or async? Should `on` return an unsubscribe function? Do we need `once` and wildcard events?"*
:::

::: links
Events docs | https://nodejs.org/api/events.html
:::
