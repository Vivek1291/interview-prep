@section Node.js Concurrency: Workers, Processes & Cluster
@icon 🧵
@color #059669
@desc Using more than one core in Node.js: concurrency vs parallelism, worker threads (measured 3.8× speed-up, 1.2 ms transfers), worker pools (measured 807 → 4,654 req/s), SharedArrayBuffer and Atomics (measured race), child processes (measured spawn/exec/fork) and cluster vs containers for horizontal scaling (measured). Node 22 on an 11-core machine.

=== Concurrency vs parallelism: what does Node.js do well, and when do you need more threads?
@p 3
@tags nodejs, concurrency, parallelism, event-loop, scaling
@quick
- **Concurrency**: many tasks *in progress* at once, interleaved on one thread while they wait (sockets, DB queries, timers). That's Node's event loop.
- **Parallelism**: tasks *running at the same instant* on several cores. Needed for **CPU-bound** work (hashing, image processing, big JSON, compression, ML).
- I/O-bound Node services scale well on one thread; a CPU-bound task blocks **every** request on that process (measured: ping waited **76 ms** while CPU work ran on the main thread).
- Tools for parallelism: **worker_threads** (same process), **child_process** (other programs/processes), **cluster** (N Node processes on one port), **more containers** behind a load balancer.
- Interview rule: "Node is single-threaded for JavaScript, multi-threaded underneath (libuv), and you add threads or processes only for CPU-heavy work."

::: text 🧒 In simple words
Concurrency is **one waiter serving ten tables**: they take an order, and while the kitchen cooks they serve the next table. Parallelism is **hiring more cooks**: needed only when the work is actual cooking (CPU), not waiting for food.
:::

::: text 📖 Detailed answer
| Work type | Examples | One Node process handles it by… | Needs parallelism? |
|---|---|---|---|
| I/O-bound | DB queries, HTTP calls, file reads, queues | starting it and moving on (event loop + libuv) | rarely |
| CPU-bound | bcrypt/scrypt sync, image resize, PDF render, parsing huge JSON, compression | blocking the event loop for the duration | yes |

### Options compared
| Option | Unit | Memory | Shares | Typical use |
|---|---|---|---|---|
| `worker_threads` | thread (V8 isolate) | own heap (MBs) | messages, transferables, SharedArrayBuffer | CPU work inside a service |
| `child_process` | OS process | full process | stdio, IPC | run other programs, isolate crashes |
| `cluster` | Node processes on one port | full process each | nothing (stateless) | use all cores of one machine |
| containers/pods | instances behind a load balancer | full process each | nothing (stateless) | production scaling, the default today |

### Symptoms that you need parallelism
- p99 latency spikes on unrelated endpoints when one heavy endpoint is called.
- High event-loop delay (see Performance) with CPU at 100% on one core.
- A profile showing one synchronous function dominating CPU time.
:::

::: diagram Choosing a parallelism tool
flowchart TD
  Q{"is the slow part waiting or computing?"} -->|"waiting on I/O"| E["event loop is enough: async APIs, more concurrency"]
  Q -->|"computing in JavaScript"| W["worker_threads pool"]
  Q -->|"running another program"| C["child_process: spawn or execFile"]
  Q -->|"whole server needs more cores"| S["more containers, or cluster on one machine"]
:::

::: image Concurrency vs parallelism in Node.js
/images/nodejs/concurrency-parallelism.svg
:::

::: text 🪜 Step by step
An API gets slow whenever users upload avatars:
1. Profiling shows `sharp`-free pure-JS resizing taking 300 ms of CPU per upload on the main thread.
2. During that time every other request waits (event-loop delay p99 jumps).
3. Move resizing into a worker-thread pool (or a queue + worker service for heavy loads).
4. The main thread only receives the upload, hands it off and awaits the result.
5. Latency of other endpoints returns to normal; throughput scales with cores.
:::

::: code javascript Spotting CPU-bound work: event-loop delay before and after
const http = require('node:http');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

http.createServer((req, res) => {
  if (req.url === '/cpu') return res.end(String(fib(32)));            // ~30+ ms of CPU on the main thread
  if (req.url === '/metrics') {
    res.end(JSON.stringify({ eventLoopDelayP99Ms: h.percentile(99) / 1e6, maxMs: h.max / 1e6 }));
    return h.reset();
  }
  res.end('ok');
}).listen(5750);
// load /cpu with autocannon and watch /metrics: p99 delay grows with the CPU work, and so does every request's latency
:::

::: code javascript Concurrency hides waiting, not computing (runnable)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
(async () => {
  let t = Date.now();
  await Promise.all(Array.from({ length: 10 }, () => sleep(50)));                // 10 waits in parallel
  const ioMs = Date.now() - t;
  t = Date.now();
  await Promise.all(Array.from({ length: 10 }, async () => busy(10)));          // 10 computations: serialised
  const cpuMs = Date.now() - t;
  console.log({ tenWaitsOf50msTook: ioMs, tenComputationsOf10msTook: cpuMs });
  console.log('waiting overlaps on one thread', ioMs < 100 ? '✅' : '❌ FAIL');
  console.log('computing does not', cpuMs >= 95 ? '✅ (needs workers or more processes)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- "Node is single-threaded, so it can't handle many users" (it handles I/O concurrency very well).
- Wrapping CPU work in `async`/`Promise` and expecting it to run in parallel.
- Adding worker threads for I/O-bound work (no gain, more complexity).
- Scaling with bigger pools when the bottleneck is one hot synchronous function.
- Forgetting that each process/worker has its own memory and caches.
:::

::: understand
- Concurrency is about waiting efficiently; parallelism is about computing on more cores.
:::

::: ask
- *"Is the CPU busy, or is the request waiting on something?"* Measure before choosing.
:::

::: important ⭐ Say this in the interview
"Concurrency means many tasks in progress at once, interleaved while they wait, and that's what Node's event loop does well for I/O like database queries and HTTP calls. Parallelism means running at the same instant on several cores, which only CPU-bound work needs. Wrapping CPU work in a promise doesn't help: it still blocks the one JavaScript thread, and in my test a ping request waited 76 milliseconds whenever CPU work ran on the main thread. For CPU work I use a worker-thread pool, for other programs child processes, and to use all cores for a server, more containers behind a load balancer or the cluster module."
:::

::: links
Node.js: Don't block the event loop | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
Node.js: Worker threads | https://nodejs.org/api/worker_threads.html
:::

=== How do worker threads work, and what does it cost to use them? (measured)
@p 3
@tags nodejs, worker-threads, parallelism, performance
@quick
- `new Worker(file, { workerData })` starts a **separate V8 isolate** with its own heap and event loop in the same process; it communicates via `postMessage` / `parentPort`.
- Measured: 8 × `fib(35)` took **435 ms** on the main thread vs **115 ms** in 8 workers (**3.8×** on 5 performance cores).
- Starting a worker costs about **12 ms** and several MB, so reuse workers (pools).
- Messages are **copied** (structured clone): a 100 MB `ArrayBuffer` round trip took **72 ms** copied vs **1.2 ms** **transferred** (`postMessage(buf, [buf])`, the sender's buffer becomes 0 bytes).
- Workers can't touch the DOM (none in Node) or share normal objects; only `SharedArrayBuffer` is truly shared.

::: text 🧒 In simple words
A worker thread is **a colleague in another room** with their own desk (memory). You pass them notes (messages); a thick folder takes time to photocopy (structured clone), unless you **hand over the original** (transfer), after which you no longer have it.
:::

::: text 📖 Detailed answer
### Measured (Node 22, 11-core M3 Pro)
| Experiment | Result |
|---|---|
| 8 × fib(35), main thread | 434.9 ms |
| 8 × fib(35), 8 workers | **114.7 ms** (3.8×) |
| Start one worker (median of 10) | **12 ms** |
| 100 MB ArrayBuffer round trip, copied | **71.6 ms** |
| 100 MB ArrayBuffer round trip, transferred | **1.2 ms** (sender buffer → 0 bytes) |
| 10,000 small message round trips | 106 ms (~0.01 ms each) |

### API essentials
| Main thread | Worker |
|---|---|
| `new Worker(path, { workerData })` | `workerData` (initial input) |
| `worker.postMessage(msg, transferList)` | `parentPort.on('message', …)` |
| `worker.on('message' / 'error' / 'exit')` | `parentPort.postMessage(result)` |
| `worker.terminate()` | `process.exit()` ends only the worker |
| `resourceLimits: { maxOldGenerationSizeMb }` | errors crash only the worker (the `error` event fires on the main side) |

### What can be sent
Structured-cloneable values: objects, arrays, Map/Set, Date, typed arrays, ArrayBuffer (copy or transfer), Error. **Not** functions, class instances' prototypes, sockets (except via special handles), or DB connections; each worker opens its own.
:::

::: diagram Main thread and worker
sequenceDiagram
  participant M as Main thread
  participant W as Worker thread
  M->>W: "new Worker(file, workerData), about 12 ms"
  M->>W: "postMessage(task), copied"
  W->>W: "CPU work on another core"
  W-->>M: "postMessage(result)"
  Note over M: "event loop stayed free for HTTP requests"
:::

::: image Worker threads: speed-up and messaging (measured)
/images/nodejs/worker-threads.svg
:::

::: chart bar Measured: 8 CPU tasks, main thread vs 8 workers (ms)
Strategy,ms
main thread,434.9
8 worker threads,114.7
:::

::: text 🪜 Step by step
Generating a PDF report from 50,000 rows without freezing the API:
1. The route queries rows and posts them as a transferable buffer (or just the report id) to a worker.
2. The worker builds the PDF (CPU-heavy) on another core.
3. Meanwhile the main thread keeps answering other requests.
4. The worker posts back the PDF bytes (transferred, not copied).
5. The route streams them to the client; the worker returns to the pool.
:::

::: code javascript A worker for CPU work with transfer and error handling
// main.js
const { Worker } = require('node:worker_threads');
const path = require('node:path');

function runInWorker(numbers) {
  return new Promise((resolve, reject) => {
    const buffer = new Float64Array(numbers).buffer;
    const worker = new Worker(path.join(__dirname, 'stats-worker.js'), { resourceLimits: { maxOldGenerationSizeMb: 256 } });
    worker.once('message', (result) => { resolve(result); worker.terminate(); });
    worker.once('error', reject);                                            // exceptions inside the worker
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`worker stopped with exit code ${code}`)); });
    worker.postMessage(buffer, [buffer]);                                    // transfer: no copy, buffer is now empty here
  });
}

module.exports = { runInWorker };

// stats-worker.js
// const { parentPort } = require('node:worker_threads');
// parentPort.once('message', (buffer) => {
//   const xs = new Float64Array(buffer);
//   let sum = 0, sq = 0;
//   for (const x of xs) { sum += x; sq += x * x; }
//   const mean = sum / xs.length;
//   parentPort.postMessage({ count: xs.length, mean, std: Math.sqrt(sq / xs.length - mean * mean) });
// });
:::

::: code javascript Copy vs transfer semantics (runnable)
// structuredClone shows both behaviours without starting a worker.
const big = new ArrayBuffer(50 * 1024 * 1024);
let t = Date.now();
const copied = structuredClone(big);
const copyMs = Date.now() - t;
t = Date.now();
const moved = structuredClone(big, { transfer: [big] });
const moveMs = Date.now() - t;
console.log({ copyMs, moveMs, copiedBytes: copied.byteLength, movedBytes: moved.byteLength, originalAfterTransfer: big.byteLength });
console.log('copy keeps the original', copied.byteLength === 50 * 1024 * 1024 ? '✅' : '❌ FAIL');
console.log('transfer empties the original (ownership moved)', big.byteLength === 0 && moved.byteLength === 50 * 1024 * 1024 ? '✅ (measured 72 ms copy vs 1.2 ms transfer for 100 MB)' : '❌ FAIL');
try { structuredClone({ fn: () => 1 }); console.log('❌ FAIL'); } catch (e) { console.log('functions cannot be sent to workers:', e.name, '✅'); }
:::

::: warning ⚠️ Common mistakes
- Creating a worker per request (measured slower than doing the work inline).
- Sending huge objects every call (structured clone cost); transfer buffers or send ids.
- Unhandled `error`/`exit` events, so a crashed worker leaves a promise hanging.
- Using workers for I/O (the event loop already overlaps waiting).
- Expecting module-level state (DB pools, caches) to be shared with workers.
:::

::: understand
- Workers give real parallelism inside one process; pay attention to startup and message-copy costs.
:::

::: ask
- *"How much data crosses the boundary per task, and can it be transferred instead of copied?"*
:::

::: important ⭐ Say this in the interview
"worker_threads run JavaScript in separate V8 isolates with their own heap and event loop inside the same process, communicating through messages. In my measurements eight CPU-heavy tasks took 435 milliseconds on the main thread and 115 in eight workers, a 3.8 times speed-up, but starting a worker costs about 12 milliseconds and messages are copied with structured clone: a 100 megabyte buffer round trip took 72 milliseconds copied versus 1.2 transferred. So I keep workers in a pool, transfer buffers instead of copying, handle error and exit events, and use them only for CPU-bound work."
:::

::: links
Node.js: Worker threads | https://nodejs.org/api/worker_threads.html
MDN: Transferable objects | https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
:::

=== Why use a worker pool instead of a worker per request? (measured)
@p 2
@tags nodejs, worker-pool, piscina, performance
@quick
- A **pool** (piscina, workerpool) keeps N warm workers and queues tasks; size ≈ number of cores.
- Measured, endpoint computing `fib(27)` under 32 connections: main thread **807 req/s** (p50 37 ms), **new worker per request 307 req/s** (p50 98 ms), **piscina pool 4,654 req/s** (p50 6 ms).
- While the CPU route was loaded, `/ping` took **76 ms** (p50) with work on the main thread vs **<1 ms** with the pool.
- Pools also cap memory and give back-pressure (`maxQueue`), timeouts/cancellation (`AbortSignal`) and stats.
- For very heavy or long jobs, prefer a **queue + separate worker service** so the API's machine stays responsive.

::: text 🧒 In simple words
Hiring a new temp for every task and training them each time (a worker per request) is slower than **keeping a fixed team on shift** who pick tasks off a board. The team (pool) is always warm, and the board shows when there's too much work.
:::

::: text 📖 Detailed answer
### Measured (Express 5, `GET` computing fib(27), 32 connections, 6 s)
| Strategy | req/s | p50 | p99 |
|---|---|---|---|
| Main thread | 807 | 37 ms | 77 ms |
| `new Worker()` per request | **307** | 98 ms | 177 ms |
| piscina pool (`maxThreads: 8`) | **4,654** | 6 ms | 14 ms |

`/ping` while that endpoint was loaded:
| CPU work runs… | ping p50 | ping p99 |
|---|---|---|
| on the main thread | **76 ms** | 106 ms |
| in the pool | **0 ms** | 1 ms |

### Pool settings
| Option (piscina) | Meaning |
|---|---|
| `maxThreads` | ≈ CPU cores available to the container |
| `minThreads` | keep some warm |
| `maxQueue` | reject (or 503) when too many tasks wait: back-pressure |
| `idleTimeout` | let idle threads exit |
| `run(task, { signal })` | cancel when the client disconnects |

### Container gotcha
`os.cpus().length` shows the host's cores; inside Docker/Kubernetes use `os.availableParallelism()` (respects CPU limits in recent Node) or configure the pool from an env var.
:::

::: diagram Pool with a task queue
flowchart LR
  R["HTTP requests"] --> Q["pool task queue, maxQueue"]
  Q --> W1["worker 1"]
  Q --> W2["worker 2"]
  Q --> W3["worker N, about one per core"]
  W1 --> D["results back to request handlers"]
  Q -->|"queue full"| X["503 Busy, try later"]
:::

::: image Worker pools vs a worker per request (measured)
/images/nodejs/worker-pool.svg
:::

::: chart bar Measured: requests per second for a CPU-heavy endpoint
Strategy,req/s
main thread,807
new Worker per request,307
piscina pool,4654
:::

::: text 🪜 Step by step
Adding a pool to an image-processing endpoint:
1. `const pool = new Piscina({ filename: resize.js, maxThreads: os.availableParallelism() - 1, maxQueue: 100 })` at startup.
2. Route: `const out = await pool.run({ buffer }, { transferList: [buffer.buffer], signal })`.
3. Queue full → 503 with `Retry-After` instead of piling up memory.
4. Client disconnect → abort signal cancels the queued task.
5. On shutdown: `await pool.destroy()` after the HTTP server closes.
:::

::: code javascript Express + piscina pool with back-pressure and cancellation
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Piscina } = require('piscina');

const pool = new Piscina({
  filename: path.resolve(__dirname, 'tasks/score.js'),            // module.exports = ({ text }) => heavyScoring(text)
  maxThreads: Math.max(1, os.availableParallelism() - 1),         // leave a core for the event loop
  maxQueue: 200,
  idleTimeout: 30_000,
});

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/score', async (req, res, next) => {
  if (pool.queueSize >= pool.options.maxQueue) return res.status(503).set('Retry-After', '2').json({ error: { code: 'BUSY' } });
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });  // client went away: drop the queued task (use res: req closes once the JSON body is read)
  try {
    res.json(await pool.run({ text: req.body.text }, { signal: ac.signal }));
  } catch (err) {
    if (err.name === 'AbortError') return;
    next(err);
  }
});

app.get('/api/pool-stats', (req, res) => res.json({ threads: pool.threads.length, queued: pool.queueSize, completed: pool.completed, utilization: pool.utilization }));

module.exports = { app, pool };
:::

::: code javascript A tiny pool scheduler (runnable)
// N workers pull from a shared queue: total time ≈ tasks × cost / N, plus no startup per task.
async function runPool(tasks, workers, costMs, startupMs) {
  const queue = [...tasks]; let started = 0; const t = Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.all(Array.from({ length: workers }, async () => { await sleep(startupMs); while (queue.length) { queue.shift(); started++; await sleep(costMs); } }));
  return { ms: Date.now() - t, started };
}
async function perTask(tasks, costMs, startupMs) { const t = Date.now(); await Promise.all(tasks.map(() => new Promise((r) => setTimeout(r, startupMs + costMs)))); return { ms: Date.now() - t }; }
(async () => {
  const tasks = Array.from({ length: 40 }, (_, i) => i);
  const pool = await runPool(tasks, 4, 10, 12);
  console.log({ poolOf4: pool });
  console.log('pool pays startup once per worker, not per task', pool.started === 40 && pool.ms < 40 * (10 + 12) ? '✅' : '❌ FAIL');
  const memoryPerWorkerMb = 5;
  console.log('40 per-task workers would need ~', 40 * memoryPerWorkerMb, 'MB at once vs', 4 * memoryPerWorkerMb, 'MB for the pool', '✅');
  await perTask(tasks, 10, 12);
})();
:::

::: warning ⚠️ Common mistakes
- `new Worker()` inside a route handler.
- Pool size = `os.cpus().length` inside a CPU-limited container (oversubscription).
- No `maxQueue`: under overload the queue grows until memory runs out.
- Ignoring client disconnects (wasting CPU on answers nobody reads).
- Detecting disconnects with `req.on('close')`: measured in Node 22, `req` emits `close` ~1 ms after its body is read (so a POST handler aborted its own task and never answered). Use `res.on('close')` and check `res.writableEnded`.
- Not destroying the pool on shutdown (process hangs).
:::

::: understand
- Warm, bounded, cancellable: a pool turns worker threads into a reliable resource.
:::

::: ask
- *"How many cores does the container actually get, and what happens when the pool is full?"*
:::

::: important ⭐ Say this in the interview
"I never start a worker per request: on an endpoint computing Fibonacci, a new worker per request managed 307 requests a second, slower than doing it on the main thread at 807, while a piscina pool of eight warm workers reached 4,654 with a 6 millisecond median. The pool also keeps the event loop free: a ping endpoint took 76 milliseconds while the CPU work ran on the main thread and under one with the pool. I size the pool from the container's CPU allowance, set a maximum queue so overload returns 503 instead of eating memory, cancel tasks when clients disconnect and destroy the pool on shutdown."
:::

::: links
Piscina | https://github.com/piscinajs/piscina
Node.js: os.availableParallelism() | https://nodejs.org/api/os.html#osavailableparallelism
:::

=== What are SharedArrayBuffer and Atomics, and when would you use them? (measured)
@p 1
@tags nodejs, worker-threads, shared-memory, atomics
@quick
- Normal messages are **copied**; a `SharedArrayBuffer` is **the same memory** visible to the main thread and workers (through typed arrays).
- Shared memory brings **data races**: measured 4 workers × 1,000,000 `counter[0]++` ended at **1,327,674** instead of 4,000,000.
- `Atomics.add/sub/compareExchange/load/store` make operations indivisible: measured **exactly 4,000,000** (84 ms vs 29 ms unsafe).
- `Atomics.wait/notify` let a worker sleep until a value changes (never `wait` on the main thread).
- Most apps should prefer **message passing**; shared memory is for high-throughput counters, ring buffers and lock-free structures.

::: text 🧒 In simple words
Four people adding marks to **one shared tally sheet** at the same time: two read "41", both write "42", and one mark is lost. `Atomics` is a rule that **only one hand writes on the sheet at a time**, so no marks disappear.
:::

::: text 📖 Detailed answer
### Measured (Node 22, 4 workers, 1,000,000 increments each on one Int32 slot)
| Operation | Final value | Time |
|---|---|---|
| `counter[0]++` | **1,327,674** (2.67M updates lost) | 29 ms |
| `Atomics.add(counter, 0, 1)` | **4,000,000** | 84 ms |

### Why `++` loses updates
`counter[0]++` is read → add → write. Two threads can read the same old value and both write old + 1.

### Atomics API
| Function | Use |
|---|---|
| `Atomics.add / sub / and / or / xor` | atomic read-modify-write |
| `Atomics.load / store` | visible, ordered reads/writes |
| `Atomics.compareExchange` | build locks and lock-free algorithms |
| `Atomics.wait(arr, i, value)` | sleep until notified (workers only) |
| `Atomics.notify(arr, i, count)` | wake waiting workers |

### When it's worth it
- Shared progress counters or statistics updated millions of times.
- Producer/consumer ring buffers (audio, telemetry) without copying.
- Coordinating a pool without message overhead.
For most backends, message passing with transferred buffers is simpler and safer.
:::

::: diagram Lost update with shared memory
sequenceDiagram
  participant A as Worker A
  participant M as Shared memory
  participant B as Worker B
  A->>M: "read 41"
  B->>M: "read 41"
  A->>M: "write 42"
  B->>M: "write 42, one increment lost"
  Note over A,B: "Atomics.add makes read, add and write one step"
:::

::: image SharedArrayBuffer and Atomics (measured race)
/images/nodejs/shared-memory.svg
:::

::: chart bar Measured: final counter after 4 × 1,000,000 increments (expected 4,000,000)
Operation,Final value
counter[0]++,1327674
Atomics.add,4000000
:::

::: text 🪜 Step by step
Tracking progress of a parallel import:
1. Main thread creates `new SharedArrayBuffer(8)` → `Int32Array` with [processed, failed].
2. Passes it to 4 workers in `workerData`.
3. Each worker calls `Atomics.add(stats, 0, 1)` per row (and index 1 on failures).
4. The main thread reads `Atomics.load(stats, 0)` every second for a progress bar, with no messages.
5. When all workers exit, totals are exact.
:::

::: code javascript Shared progress counters across workers (worker_threads + Atomics)
const { Worker, isMainThread, workerData } = require('node:worker_threads');

if (isMainThread) {
  const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const stats = new Int32Array(sab);                                          // [processed, failed]
  const workers = Array.from({ length: 4 }, (_, i) => new Worker(__filename, { workerData: { sab, shard: i, rows: 250_000 } }));
  const timer = setInterval(() => console.log('processed', Atomics.load(stats, 0), 'failed', Atomics.load(stats, 1)), 200);
  Promise.all(workers.map((w) => new Promise((r) => w.on('exit', r)))).then(() => {
    clearInterval(timer);
    console.log('done: processed', Atomics.load(stats, 0), 'failed', Atomics.load(stats, 1));   // exact totals
  });
} else {
  const stats = new Int32Array(workerData.sab);
  for (let i = 0; i < workerData.rows; i++) {
    const ok = (i * 2654435761 + workerData.shard) % 97 !== 0;                  // pretend import of one row
    Atomics.add(stats, ok ? 0 : 1, 1);
  }
}
:::

::: code javascript Why read-modify-write races (runnable simulation)
// Interleave the three steps of ++ from two "threads" and compare with an atomic step.
function simulate(atomic, steps = 1000) {
  const mem = [0]; let seed = 1; const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const threads = [{ left: steps, reg: null }, { left: steps, reg: null }];
  while (threads.some((t) => t.left > 0)) {
    const t = threads[rand() < 0.5 ? 0 : 1]; if (t.left === 0) continue;
    if (atomic) { mem[0] += 1; t.left--; continue; }                     // one indivisible step
    if (t.reg === null) t.reg = mem[0];                                   // read
    else { mem[0] = t.reg + 1; t.reg = null; t.left--; }                  // write (the other thread may have written in between)
  }
  return mem[0];
}
const plain = simulate(false), atomic = simulate(true);
console.log({ expected: 2000, plain, atomic });
console.log('plain ++ loses updates when steps interleave', plain < 2000 ? '✅ (measured 1.33M of 4M)' : '❌ FAIL');
console.log('atomic increments are exact', atomic === 2000 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Plain reads/writes on shared memory from several threads.
- `Atomics.wait` on the main thread (blocks the event loop).
- Using shared memory where messages would be simpler.
- Assuming objects inside a SharedArrayBuffer (only numbers in typed arrays are shared).
- Forgetting that browsers require cross-origin isolation for SharedArrayBuffer (Node doesn't).
:::

::: understand
- Shared memory needs atomic operations; otherwise concurrent updates get lost.
:::

::: ask
- *"Do threads really need to share this data, or can they send results back?"*
:::

::: important ⭐ Say this in the interview
"Messages between workers are copied, but a SharedArrayBuffer is the same memory seen by every thread through typed arrays. That brings data races: four workers each incrementing a shared counter a million times with plus-plus ended at 1.33 million instead of four million in my test, because the read, add and write steps interleave. Atomics.add made it exact. Atomics also offers compareExchange, wait and notify for locks and producer-consumer buffers. I use it for hot shared counters or ring buffers and otherwise prefer message passing with transferred buffers."
:::

::: links
MDN: SharedArrayBuffer | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
MDN: Atomics | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics
:::

=== spawn vs exec vs execFile vs fork: how do child processes work? (measured)
@p 2
@tags nodejs, child-process, ipc, processes
@quick
- **`spawn(cmd, args)`**: starts a process and **streams** stdout/stderr; no shell; best for large or long output.
- **`execFile(file, args)`**: no shell, **buffers** output; good for short commands with arguments.
- **`exec("cmd | pipe")`**: runs through a **shell**, buffers output with `maxBuffer` (1 MB default): measured a 6.6 MB output failed with **`ERR_CHILD_PROCESS_STDIO_MAXBUFFER`**; `spawn` streamed all 6.7 MB.
- **`fork(script)`**: a new **Node** process with an IPC channel (`process.send` / `on('message')`); measured startup **17.5 ms** vs 2.4–3.8 ms for `spawn`/`execFile`/`exec` of `ls`.
- Processes vs threads: separate memory and crash isolation, higher cost; pass arguments as **arrays**, set timeouts, kill children on shutdown.

::: text 🧒 In simple words
A child process is **asking another worker in a different building** to do a job: safer (if they drop something, your building is fine) but slower to arrange than asking a colleague at the next desk (a thread). `spawn` is a phone line where they read results to you as they go; `exec` makes them write everything on one sheet first, and the sheet has a size limit.
:::

::: text 📖 Detailed answer
### Measured (medians of 20 runs, macOS, Node 22)
| API | Example | Time |
|---|---|---|
| `spawn` + stream stdout | `ls -1 /tmp` | **2.4 ms** |
| `execFile` | `ls -1 /tmp` | 3.3 ms |
| `exec` (shell) | `ls -1 /tmp \| wc -l` | 3.8 ms |
| `fork` until the child answers | Node script with IPC | **17.5 ms** |
| `fork` IPC | 10,000 round trips | 142 ms |
| `exec` with 6.6 MB output | `… \| base64` | **ERR_CHILD_PROCESS_STDIO_MAXBUFFER** |
| `spawn` same command | streamed | 6.7 MB received |

### Choosing
| Need | Use |
|---|---|
| Run a tool and stream its output (ffmpeg, git log, tar) | `spawn` |
| Run a short command with arguments and get the output | `execFile` (promisified) |
| Shell features (pipes, globs) with trusted, constant commands | `exec` |
| A Node child with messages, crash isolation | `fork` |
| CPU work in JavaScript | worker_threads (cheaper than fork) |

### Process vs thread
| | Thread (worker_threads) | Process (child_process) |
|---|---|---|
| Memory | separate heap, same process | completely separate |
| Crash impact | can be contained, same process | parent unaffected |
| Startup | ~12 ms | ~17 ms (Node) / a few ms (small binary) |
| Can run | JavaScript | any program |

### Safety and robustness
Pass user values only as **array arguments** to `spawn`/`execFile` (no shell parsing), set `timeout`/`AbortSignal`, handle `error` (binary not found) and non-zero exit codes, and kill children when the parent shuts down.
:::

::: diagram Choosing a child process API
flowchart TD
  Q{"what do you run?"} -->|"another Node script that talks back"| F["fork with IPC"]
  Q -->|"a program"| O{"output size?"}
  O -->|"large or continuous"| S["spawn and stream stdout"]
  O -->|"small"| E{"need shell features?"}
  E -->|"no"| X["execFile with an args array"]
  E -->|"yes, trusted constant command"| SH["exec"]
:::

::: image Child processes: spawn, execFile, exec, fork (measured)
/images/nodejs/child-process.svg
:::

::: chart bar Measured: median ms to run a small command
API,ms
spawn,2.4
execFile,3.3
exec (shell),3.8
fork (Node),17.5
:::

::: text 🪜 Step by step
Generating a video thumbnail with ffmpeg:
1. `spawn('ffmpeg', ['-i', inputPath, '-ss', '1', '-frames:v', '1', '-f', 'image2', 'pipe:1'])`: arguments as an array.
2. Pipe `child.stdout` into the S3 upload stream (no buffering of the whole image).
3. Collect `stderr` (bounded) for error messages.
4. `AbortSignal.timeout(30_000)` kills it if it hangs.
5. Check the exit code; non-zero → throw with the stderr tail; on shutdown kill remaining children.
:::

::: code javascript spawn with streaming, timeout and exit-code handling
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function runTool(command, args, { timeoutMs = 30_000, stdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal: AbortSignal.timeout(timeoutMs) });   // args array: no shell
    let stderr = '';
    if (stdout) child.stdout.pipe(stdout); else child.stdout.resume();
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });         // keep only the tail
    child.on('error', reject);                                                        // ENOENT, AbortError (timeout)
    child.on('close', (code, signal) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code ?? signal}: ${stderr}`))));
  });
}

async function gitLastCommit(repoDir) {
  const { stdout } = await execFileAsync('git', ['-C', repoDir, 'log', '-1', '--format=%H %s'], { timeout: 5000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

module.exports = { runTool, gitLastCommit };
:::

::: code javascript Buffered output limits vs streaming (runnable model)
// exec-style buffering keeps everything in memory up to maxBuffer; spawn-style streaming handles any size.
function buffered(chunks, maxBuffer = 1024 * 1024) {
  let size = 0;
  for (const c of chunks) { size += c; if (size > maxBuffer) return { error: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', atBytes: size }; }
  return { ok: true, size };
}
function streamed(chunks) { let size = 0, peak = 0; for (const c of chunks) { size += c; peak = Math.max(peak, c); } return { ok: true, size, peakInMemory: peak }; }
const output = Array.from({ length: 103 }, () => 64 * 1024);          // ~6.6 MB in 64 KB chunks
console.log({ exec: buffered(output), spawn: streamed(output) });
console.log('exec fails above maxBuffer', buffered(output).error === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? '✅ (measured)' : '❌ FAIL');
console.log('spawn streams with only one chunk in memory', streamed(output).peakInMemory === 65536 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Building shell command strings from user input with `exec`.
- `exec` for big outputs (maxBuffer errors, memory spikes).
- Ignoring the `error` event (missing binary crashes the process).
- No timeout: a hung child keeps resources forever.
- Leaving child processes running after the parent exits (zombies, orphans).
:::

::: understand
- spawn streams, execFile buffers, exec adds a shell, fork adds Node + IPC.
:::

::: ask
- *"Does this need a shell at all, and how big can the output get?"*
:::

::: important ⭐ Say this in the interview
"child_process gives four APIs. spawn starts a program without a shell and streams its output, which suits large or long-running output; execFile also avoids the shell but buffers output; exec runs through a shell and buffers with a one-megabyte maxBuffer, and in my test a 6.6 megabyte output failed with ERR_CHILD_PROCESS_STDIO_MAXBUFFER while spawn streamed it; fork starts another Node process with an IPC channel, about 17 milliseconds versus 2 to 4 for small commands. Processes give crash isolation at a higher cost than threads. I pass arguments as arrays, set timeouts, handle error and exit codes and kill children on shutdown."
:::

::: links
Node.js: Child process | https://nodejs.org/api/child_process.html
:::

=== Cluster module vs multiple containers: how do you use all CPU cores and scale horizontally? (measured)
@p 3
@tags nodejs, cluster, scaling, load-balancing, containers
@quick
- **cluster**: a primary process forks N workers that **share one port**; the primary distributes connections (round-robin on Linux/macOS) and can restart crashed workers.
- Measured (small CPU-ish handler, 100 connections, same machine): 1 process **38,531 req/s**, ×2 **80,698**, ×4 **123,078**, ×8 **111,443** (the load generator competes for cores).
- Modern default: **one Node process per container**, many replicas behind a **load balancer**; the orchestrator restarts, scales and rolls out. Cluster is for single VMs/PM2 setups.
- **Vertical** scaling = bigger machine; **horizontal** = more instances. Horizontal needs **stateless** instances: sessions, caches, rate limits, WebSocket rooms in Redis/DB.
- **Sticky sessions** only when state is local (WebSocket polling fallbacks, legacy in-memory sessions), and they hurt load distribution.

::: text 🧒 In simple words
One Node process is **one cashier**. Cluster opens **more tills in the same shop**; containers open **more shops** in different places behind one signpost (the load balancer). Either way, a customer's basket must not live only at one till, or they can't move to another (stateless).
:::

::: text 📖 Detailed answer
### Measured (Node 22 HTTP server hashing 5 KB + a small loop per request, autocannon 100 connections, 5 s)
| Processes | req/s | p99 |
|---|---|---|
| 1 | 38,531 | 4 ms |
| cluster ×2 | 80,698 | 3 ms |
| cluster ×4 | **123,078** | 2 ms |
| cluster ×8 | 111,443 | 3 ms |
Scaling is near-linear until cores run out; at 8 the benchmark tool and the workers fight over the same cores, so in production measure from separate machines.

### Cluster vs containers
| | `cluster` / PM2 cluster mode | Containers / pods |
|---|---|---|
| Unit | processes on one machine | instances across machines |
| Port sharing | primary hands connections to workers | each container has its own port |
| Restart on crash | primary forks a new worker | orchestrator restarts the container |
| Rolling deploys | PM2 reload | built-in (Kubernetes, ECS) |
| Observability | per process inside one container | per container |
| Recommendation | single VM, simple setups | default for production |

### Horizontal scaling checklist
1. No in-memory state that must survive between requests (use Redis/DB).
2. Uploads go to S3, not the local disk.
3. Cron jobs run once (job schedulers), not per instance.
4. WebSockets use a shared adapter (Redis pub/sub).
5. Health checks and graceful shutdown so instances can come and go.
:::

::: diagram Cluster vs containers
flowchart LR
  subgraph VM["one machine with cluster"]
    P["primary"] --> W1["worker"]
    P --> W2["worker"]
    P --> W3["worker"]
  end
  LB["load balancer"] --> C1["container: 1 Node process"]
  LB --> C2["container: 1 Node process"]
  LB --> C3["container: 1 Node process"]
  C1 --> R["Redis and DB: shared state"]
  C2 --> R
  C3 --> R
:::

::: image Cluster vs containers for using all cores (measured)
/images/nodejs/cluster.svg
:::

::: chart bar Measured: requests per second by number of processes
Processes,req/s
1,38531
2,80698
4,123078
8,111443
:::

::: text 🪜 Step by step
Moving from one VM to containers:
1. Today: PM2 cluster mode with 4 processes on one VM; sessions in memory → sticky sessions needed.
2. Move sessions to Redis (connect-redis) and uploads to S3.
3. Build one Docker image running a single Node process (`node server.js`).
4. Deploy 4+ replicas behind an ALB/Ingress with health checks; autoscale on CPU or request rate.
5. Remove sticky sessions; any replica can serve any request.
:::

::: code javascript cluster with automatic restarts and graceful reload
const cluster = require('node:cluster');
const http = require('node:http');
const os = require('node:os');

if (cluster.isPrimary) {
  const workers = Number(process.env.WEB_CONCURRENCY ?? os.availableParallelism());
  for (let i = 0; i < workers; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (!worker.exitedAfterDisconnect) {                       // crashed, not a planned restart
      console.error(`worker ${worker.process.pid} died (${signal ?? code}), starting a new one`);
      cluster.fork();
    }
  });

  process.on('SIGTERM', () => {                                // graceful: let workers finish requests
    for (const w of Object.values(cluster.workers)) w.disconnect();
  });
} else {
  const server = http.createServer((req, res) => res.end(`handled by ${process.pid}\n`)).listen(3000);
  process.on('disconnect', () => server.close(() => process.exit(0)));
}
:::

::: code javascript Round-robin distribution and the cost of local state (runnable)
// 4 instances behind a round-robin balancer; a session stored in instance memory is missing 3 times out of 4.
const instances = Array.from({ length: 4 }, (_, i) => ({ id: i, localSessions: new Map(), handled: 0 }));
const shared = new Map();                                       // stands in for Redis
let next = 0; const route = () => instances[next++ % instances.length];
route().localSessions.set('sid-1', { userId: 42 }); shared.set('sid-1', { userId: 42 });
let localHits = 0, sharedHits = 0;
for (let i = 0; i < 100; i++) { const inst = route(); inst.handled++; if (inst.localSessions.has('sid-1')) localHits++; if (shared.has('sid-1')) sharedHits++; }
console.log({ perInstance: instances.map((i) => i.handled), localHits, sharedHits });
console.log('round-robin spreads requests evenly', new Set(instances.map((i) => i.handled)).size === 1 ? '✅' : '❌ FAIL');
console.log('in-memory session found on only 1 of 4 instances', localHits === 25 ? '✅ (needs sticky sessions or Redis)' : '❌ FAIL');
console.log('shared store works on every instance', sharedHits === 100 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Running cluster inside Kubernetes pods that are also replicated (double layers, confusing limits).
- In-memory sessions/caches with several instances and no sticky sessions.
- `os.cpus().length` workers in a CPU-limited container.
- Benchmarking with the load generator on the same machine and trusting the numbers.
- Scaling out an app whose bottleneck is the database.
:::

::: understand
- More processes multiply throughput only if instances are stateless and the bottleneck is the app's CPU.
:::

::: ask
- *"Where does state live, and what is the actual bottleneck: app CPU or the database?"*
:::

::: important ⭐ Say this in the interview
"The cluster module forks N Node processes that share one port, with the primary distributing connections and restarting crashed workers. In my test a small CPU-bound server went from 38 thousand requests a second with one process to 81 thousand with two and 123 thousand with four, and fell back with eight because the load generator competed for cores. In production today I usually run one Node process per container and scale replicas behind a load balancer, which gives restarts, rolling deploys and autoscaling from the orchestrator. Either way instances must be stateless, with sessions, caches and WebSocket rooms in Redis, otherwise you need sticky sessions."
:::

::: links
Node.js: Cluster | https://nodejs.org/api/cluster.html
PM2: Cluster mode | https://pm2.keymetrics.io/docs/usage/cluster-mode/
:::
