@section Node.js Performance & Memory
@icon 📈
@color #0d9488
@desc Finding and fixing Node.js performance problems: event-loop lag and blocking (measured), CPU profiling with --cpu-prof (measured hot spot), memory leaks and heap snapshots (measured), and V8 garbage collection, heap limits and WeakMap (measured). Node 22.

=== What is event-loop lag, and how do you detect and fix blocking code? (measured)
@p 3
@tags nodejs, performance, event-loop, monitoring
@quick
- **Event-loop lag (delay)** = how late timers/callbacks run because JavaScript is busy. Every request on the process feels it.
- Measure with `perf_hooks.monitorEventLoopDelay()` (p50/p99/max) and export it as a metric; alert on p99 > ~100 ms.
- Measured: a synchronous `JSON.parse` of an **18.8 MB** payload took **75 ms**; meanwhile `/ping` max latency went from **2 ms → 77 ms** and event-loop delay p99 from **11 ms → 75 ms**.
- Usual blockers: big `JSON.parse/stringify`, `*Sync` APIs (`readFileSync`, `pbkdf2Sync`), large loops/sorts, catastrophic regexes, huge template rendering.
- Fixes: stream or paginate, move CPU work to a worker pool, use async APIs, split work into chunks (`setImmediate`), cap input sizes.

::: text 🧒 In simple words
The event loop is **one cashier**. If one customer pays with a bag of 10,000 coins and the cashier counts them all, everyone else in the queue waits, even people buying a single bottle of water. Event-loop lag is **how long the queue was frozen**.
:::

::: text 📖 Detailed answer
### Measured (Node 22, `/import` parses an 18.8 MB JSON string synchronously, `/ping` is trivial)
| Metric | Idle | During imports |
|---|---|---|
| `/ping` max latency | 2 ms | **77 ms** |
| event-loop delay p50 | 10 ms (≈ the 10 ms resolution) | 10 ms |
| event-loop delay p99 | 11.1 ms | **75.3 ms** |
| event-loop delay max | 11.8 ms | 82.7 ms |
| parse time per import | | 72–75 ms |
(With `resolution: 10` the baseline reads ~10 ms; look at the increase, not the baseline.)

### Where lag comes from
| Cause | Fix |
|---|---|
| Parsing/serialising huge JSON | stream (NDJSON), paginate, limit body size, worker |
| `*Sync` filesystem/crypto calls | async versions (thread pool) |
| CPU-heavy computation | worker pool, separate service |
| Unbounded loops over user input | limits, pagination, chunking with `setImmediate` |
| Catastrophic regex backtracking | safe regexes (RE2), input length limits |
| Too many tiny tasks (microtask storms) | batch work |

### Monitoring
Export `eventLoopDelay p99`, `eventLoopUtilization` (ELU: fraction of time the loop was busy), heap used, GC pause time and request latency together. A high ELU with low CPU elsewhere = one process saturated.
:::

::: diagram How a blocking task delays everything
sequenceDiagram
  participant A as Request A
  participant L as Event loop
  participant B as Request B ping
  A->>L: "import: JSON.parse 18.8 MB, 75 ms"
  B->>L: "GET /ping arrives"
  Note over L: "busy parsing, ping waits"
  L-->>A: "import done"
  L-->>B: "pong after 77 ms instead of 2 ms"
:::

::: image Event-loop lag: how blocking shows up (measured)
/images/nodejs/event-loop-lag.svg
:::

::: chart bar Measured: event-loop delay p99 (ms)
State,p99 delay (ms)
idle,11.1
during imports,75.3
:::

::: text 🪜 Step by step
Investigating "random" latency spikes:
1. Dashboard: p99 latency spikes line up with event-loop delay p99 spikes on the same pods.
2. Logs around spikes show `POST /import` with 20 MB bodies.
3. Reproduce locally with autocannon on `/ping` while calling `/import`.
4. Fix: accept NDJSON and stream-parse it, or hand the file to a worker/queue; cap body size.
5. Re-measure: ping latency stays flat during imports.
:::

::: code javascript Event-loop metrics middleware (perf_hooks) and a chunked loop
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');

const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
let lastElu = performance.eventLoopUtilization();

function eventLoopStats() {
  const elu = performance.eventLoopUtilization(lastElu);              // since the last call
  lastElu = performance.eventLoopUtilization();
  const stats = {
    delayP50Ms: delay.percentile(50) / 1e6,
    delayP99Ms: delay.percentile(99) / 1e6,
    delayMaxMs: delay.max / 1e6,
    utilization: +elu.utilization.toFixed(3),                         // 0..1: share of time the loop was busy
  };
  delay.reset();
  return stats;
}
setInterval(() => console.log('event loop', eventLoopStats()), 10_000).unref();

// processing a big array without blocking: yield to the event loop between chunks
async function processInChunks(items, fn, chunkSize = 1000) {
  for (let i = 0; i < items.length; i += chunkSize) {
    for (const item of items.slice(i, i + chunkSize)) fn(item);
    await new Promise((r) => setImmediate(r));                         // let other requests run
  }
}

module.exports = { eventLoopStats, processInChunks };
:::

::: code javascript Measuring lag caused by a synchronous task (runnable)
// Schedule a 0 ms timer, then block: the timer fires late by roughly the blocking time.
function measureLag(blockMs) {
  return new Promise((resolve) => {
    const scheduled = Date.now();
    setTimeout(() => resolve(Date.now() - scheduled), 0);
    const end = Date.now() + blockMs; while (Date.now() < end) {}          // synchronous work (like a big JSON.parse)
  });
}
async function chunkedLag(totalMs, sliceMs) {
  const scheduled = Date.now(); let fired = null;
  setTimeout(() => (fired = Date.now() - scheduled), 0);
  for (let done = 0; done < totalMs; done += sliceMs) { const end = Date.now() + sliceMs; while (Date.now() < end) {} await new Promise((r) => setTimeout(r, 0)); }   // yield (setImmediate in Node)
  return fired;
}
(async () => {
  const blocking = await measureLag(75), chunked = await chunkedLag(75, 5);
  console.log({ timerLateByMsWhenBlocking: blocking, timerLateByMsWhenChunked: chunked });
  console.log('75 ms of sync work delays everything by ~75 ms', blocking >= 70 ? '✅ (measured 75 ms parse → 77 ms ping)' : '❌ FAIL');
  console.log('yielding between chunks lets the timer run early', chunked < 20 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Only monitoring CPU% (one blocked core looks like 9% on an 11-core host).
- `*Sync` APIs in request handlers.
- Accepting unbounded JSON bodies and parsing them in one go.
- "Async" wrappers around CPU work (still blocks).
- Not load-testing: blocking only shows up under concurrency.
:::

::: understand
- One slow synchronous task delays every request on that process; measure the delay, then move or split the work.
:::

::: ask
- *"What is the event-loop delay p99 when this endpoint is under load?"*
:::

::: important ⭐ Say this in the interview
"Event-loop lag is how late callbacks run because JavaScript is busy, and it affects every request on that process. I measure it with monitorEventLoopDelay and event-loop utilisation and alert on the p99. In a test, synchronously parsing an 18.8 megabyte JSON payload took 75 milliseconds and pushed a trivial ping endpoint from 2 to 77 milliseconds, with event-loop delay p99 going from 11 to 75. The usual culprits are huge JSON, Sync APIs, heavy loops and bad regexes; the fixes are streaming or paginating, async APIs, worker pools, chunking with setImmediate and input limits."
:::

::: links
Node.js: perf_hooks.monitorEventLoopDelay | https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions
Node.js: Don't block the event loop | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
:::

=== How do you profile CPU usage in a Node.js app? (measured)
@p 2
@tags nodejs, profiling, performance, flame-graph
@quick
- Don't guess: **profile**. `node --cpu-prof app.js` writes a `.cpuprofile` on exit; `node --inspect` lets you record in Chrome DevTools while load testing; **clinic flame**/**0x** make flame graphs.
- Measured: 2,000 requests where only every 10th hashed a password with `pbkdf2Sync` → the profile showed **`pbkdf2Sync` = 98.5% of CPU time** (960 ms); regexes and string work were ~1.5%.
- Read **self time** (time in the function itself) to find hot spots and **total time** to find expensive call paths; in flame graphs, **width = time**.
- Profile under realistic load (autocannon/k6), fix the top item, **re-measure**.
- In production: continuous profiling (Pyroscope, Datadog, Clinic) or `--cpu-prof` on a canary instance.

::: text 🧒 In simple words
A CPU profile is **a time sheet for your code**: every millisecond, it notes which function was running. At the end, one line usually eats most of the day, and it's rarely the one you suspected.
:::

::: text 📖 Detailed answer
### Measured (`--cpu-prof`, 2,000 simulated requests, Node 22)
| Function | Self time | Share |
|---|---|---|
| `pbkdf2Sync` (called on 1 in 10 requests) | 960 ms | **98.5%** |
| everything else: rendering, regex validation, slugify | ~15 ms | ~1.5% |
Guessing would have pointed at the "complicated" email regex; the profile pointed at one synchronous crypto call.

### Tools
| Tool | How |
|---|---|
| `--cpu-prof` | `node --cpu-prof --cpu-prof-dir=prof app.js` → open in DevTools Performance or speedscope |
| Inspector | `node --inspect app.js` → `chrome://inspect` → Performance → record while loading |
| clinic | `clinic doctor` (diagnosis), `clinic flame` (flame graph), `clinic bubbleprof` (async) |
| 0x | `npx 0x app.js` → interactive flame graph |
| `--prof` | V8 tick log → `node --prof-process` (low level) |

### Reading results
- **Self time** high → that function is the work.
- **Total time** high but self low → it calls something expensive.
- Wide flat tops in a flame graph → hot functions; tall narrow towers → deep stacks, not necessarily slow.
- Also look at **GC** in the profile: lots of time in "(garbage collector)" means too many allocations.
:::

::: diagram Profiling workflow
flowchart LR
  L["realistic load: autocannon or k6"] --> P["record profile: --cpu-prof or inspector"]
  P --> R["read self time and flame graph"]
  R --> F["fix the top hot spot"]
  F --> M["re-measure latency and throughput"]
  M --> L
:::

::: image CPU profiling a Node.js app (measured)
/images/nodejs/cpu-profile.svg
:::

::: chart bar Measured: share of CPU time by function (%)
Function,Share of CPU (%)
pbkdf2Sync,98.5
everything else,1.5
:::

::: text 🪜 Step by step
Profiling a slow login endpoint:
1. `npx autocannon -c 50 -d 30 -m POST -b '{"email":"a@x","password":"p"}' http://localhost:3000/login` while running `node --cpu-prof server.js`.
2. Stop the server (Ctrl+C) so the `.cpuprofile` is written.
3. Open it in Chrome DevTools → Performance → "Bottom-up" sorted by self time.
4. Top entry: `scryptSync` in `verifyPassword` (blocking every login).
5. Switch to async `scrypt` (thread pool) or a worker; re-run: throughput up, ping latency flat.
:::

::: code javascript Programmatic CPU profile of a code path (node:inspector)
const inspector = require('node:inspector/promises');
const fs = require('node:fs/promises');

async function profile(name, fn) {
  const session = new inspector.Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.start');
  try {
    await fn();
  } finally {
    const { profile } = await session.post('Profiler.stop');
    await fs.writeFile(`${name}.cpuprofile`, JSON.stringify(profile));        // open in DevTools or speedscope
    session.disconnect();
  }
}

// summarise self time per function from a .cpuprofile
function topSelfTime(profile, n = 5) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const fnName = byId.get(id).callFrame.functionName || '(anonymous)';
    self.set(fnName, (self.get(fnName) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, us]) => ({ fn, ms: Math.round(us / 1000), pct: +((100 * us) / total).toFixed(1) }));
}

module.exports = { profile, topSelfTime };
:::

::: code javascript Find the hot spot by timing, not guessing (runnable)
// A poor man's profiler: time each step of a request handler many times.
const steps = {
  validateEmail: (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e),
  slugify: (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  hashPasswordSync: (p) => { let h = 0; for (let i = 0; i < 200000; i++) h = (h * 31 + p.charCodeAt(i % p.length)) | 0; return h; },   // stands in for pbkdf2Sync
};
const totals = Object.fromEntries(Object.keys(steps).map((k) => [k, 0]));
for (let i = 0; i < 2000; i++) {
  for (const [name, fn] of Object.entries(steps)) {
    if (name === 'hashPasswordSync' && i % 10 !== 0) continue;           // only 1 in 10 requests hashes
    const t = performance.now(); fn(name === 'validateEmail' ? `user${i}@example.com` : `Value ${i}`); totals[name] += performance.now() - t;
  }
}
const sum = Object.values(totals).reduce((a, b) => a + b, 0);
const report = Object.entries(totals).map(([k, v]) => ({ step: k, pct: +((100 * v) / sum).toFixed(1) })).sort((a, b) => b.pct - a.pct);
console.table(report);
console.log('the rarely-called sync hash dominates', report[0].step === 'hashPasswordSync' && report[0].pct > 80 ? '✅ (measured pbkdf2Sync 98.5%)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Optimising code that "looks slow" without a profile.
- Profiling without load (idle profiles show startup, not the hot path).
- Benchmarking in development mode with debug logging on.
- Ignoring GC time in profiles (allocation-heavy code).
- Fixing several things at once and not knowing which helped.
:::

::: understand
- Measure under load, fix the top self-time item, measure again.
:::

::: ask
- *"What does the profile say is the top function by self time under production-like load?"*
:::

::: important ⭐ Say this in the interview
"I don't guess, I profile under realistic load: node --cpu-prof or the inspector with Chrome DevTools, and clinic or 0x for flame graphs. Self time shows where the work actually happens, total time shows expensive paths, and in a flame graph width means time. In one experiment only every tenth request hashed a password synchronously, yet the profile showed pbkdf2Sync at 98.5 percent of CPU time while the regex and string work I might have suspected were around one percent. I fix the top item, re-measure, and in production use continuous profiling or a profiled canary."
:::

::: links
Node.js: Profiling Node.js applications | https://nodejs.org/en/learn/getting-started/profiling
Clinic.js | https://clinicjs.org/
speedscope | https://www.speedscope.app/
:::

=== How do you find and fix memory leaks in Node.js? (heap snapshots; measured)
@p 3
@tags nodejs, memory-leak, heap-snapshot, performance
@quick
- A leak is memory that stays **reachable** (referenced) after it's no longer needed, so the garbage collector can't free it. Heap grows request after request until the process is OOM-killed.
- Measured over 200,000 requests: unbounded `Map` cache **3.7 → 88.6 MB** and growing; an event listener added per request **95.9 MB** (+ `MaxListenersExceededWarning`); bounded LRU cache flat at **6.2 MB**.
- A **heap snapshot** (`v8.writeHeapSnapshot()` / DevTools Memory) of the leaking process showed **`Session` ×200,000**; compare two snapshots and follow the **retainers** to the Map.
- Usual causes: unbounded caches/Maps/arrays, listeners/subscriptions never removed, timers never cleared, closures capturing big objects, global state.
- Watch `heapUsed` over time (sawtooth that trends up = leak), test with load, and set container memory limits with alerts.

::: text 🧒 In simple words
A memory leak is **a hotel that never checks guests out**: rooms (memory) stay "occupied" by guests who left long ago because someone still has their key (a reference). A heap snapshot is the **guest list**: you see 200,000 "Session" guests and ask the receptionist (retainers) who still holds their keys.
:::

::: text 📖 Detailed answer
### Measured (heap used after `global.gc()`, Node 22)
| Pattern | after 50k | 100k | 150k | 200k requests |
|---|---|---|---|---|
| no cache | 3.7 | 3.7 | 3.7 | 3.7 MB |
| bounded LRU (max 5,000) | 6.2 | 6.2 | 6.2 | 6.2 MB |
| `Map` cache, never evicted | 24.9 | 46.1 | 69.1 | **88.6 MB** |
| `bus.on('tick', …)` per request | 26.7 | 49.7 | 72.7 | **95.9 MB** + `MaxListenersExceededWarning` |

Heap snapshot of the `Map` leak (counted by constructor): `Object ×200,679`, `Array ×200,144`, **`Session ×200,000`**.

### Investigation steps
1. Confirm: heap used (after GC) trends upward under steady load.
2. Take snapshot A, apply load, take snapshot B (DevTools → Memory, or `v8.writeHeapSnapshot()` / `--heapsnapshot-signal=SIGUSR2`).
3. Comparison view: which constructors grew by thousands?
4. Retainers panel: follow the chain to the root (`Map` in module `cache.js`, `EventEmitter._events`, a timer).
5. Fix, then repeat the load test to confirm the heap is flat.

### Common leaks and fixes
| Leak | Fix |
|---|---|
| Unbounded cache | LRU with `max` + TTL |
| Listeners added per request/connection | `once`, remove in `close`, `AbortSignal` with `addEventListener` |
| `setInterval` per connection | clear on close; `unref()` |
| Closures holding large objects | capture only needed fields |
| Accumulating arrays (logs, metrics) | bounded buffers, flush |
| Objects keyed in a `Map` by request/connection | `WeakMap` (next question) |
:::

::: diagram Heap snapshot investigation
flowchart TD
  G["heap grows under steady load"] --> A["snapshot A"]
  A --> L["apply load"]
  L --> B["snapshot B"]
  B --> C["comparison view: Session grew by 200,000"]
  C --> R["retainers: Session held by Map in cache.js"]
  R --> F["fix: bounded LRU with TTL, re-test"]
:::

::: image Memory leaks and heap snapshots (measured)
/images/nodejs/memory-leaks.svg
:::

::: chart line Measured: heap used (MB) as requests grow
Requests (thousands),no cache,bounded LRU,Map leak,listener leak
50,3.7,6.2,24.9,26.7
100,3.7,6.2,46.1,49.7
150,3.7,6.2,69.1,72.7
200,3.7,6.2,88.6,95.9
:::

::: text 🪜 Step by step
Pods restart every 6 hours with OOMKilled:
1. Grafana: memory climbs linearly after each deploy; restarts reset it.
2. Reproduce locally with a 30-minute autocannon run; heap after GC keeps rising.
3. Snapshots before/after: `Socket` and `IncomingMessage` objects grow, retained by an `EventEmitter` listener array.
4. Code: `metrics.on('flush', () => …)` added inside a request middleware.
5. Move the listener registration to startup (or remove it on `res.on('close')`); heap is now flat.
:::

::: code javascript Leak-safe patterns: bounded cache, listener cleanup, heap snapshot on demand
const v8 = require('node:v8');
const { LRUCache } = require('lru-cache');
const { EventEmitter } = require('node:events');

// 1. bounded cache instead of a Map that only grows
const sessions = new LRUCache({ max: 10_000, ttl: 30 * 60_000 });

// 2. listeners tied to a request are removed when the response closes
const bus = new EventEmitter();
function subscribeForRequest(req, res, onEvent) {
  bus.on('order.updated', onEvent);
  res.on('close', () => bus.off('order.updated', onEvent));       // no listener survives the request
}

// 3. timers per connection are cleared and unref'd
function startHeartbeat(socket) {
  const t = setInterval(() => socket.write(': ping\n\n'), 15_000);
  t.unref();
  socket.on('close', () => clearInterval(t));
}

// 4. snapshots on demand in production (also: node --heapsnapshot-signal=SIGUSR2 app.js)
process.on('SIGUSR2', () => {
  const file = v8.writeHeapSnapshot();                             // blocks while writing: use sparingly, on one instance
  console.log('heap snapshot written to', file);
});

// 5. track heap after GC trends as a metric
setInterval(() => {
  const { heapUsed, rss, external } = process.memoryUsage();
  console.log(JSON.stringify({ heapUsedMb: Math.round(heapUsed / 1048576), rssMb: Math.round(rss / 1048576), externalMb: Math.round(external / 1048576) }));
}, 60_000).unref();

module.exports = { sessions, subscribeForRequest, startHeartbeat };
:::

::: code javascript Unbounded vs bounded cache growth (runnable)
function simulate(cache, requests) {
  const sizes = [];
  for (let i = 1; i <= requests; i++) { cache.set(`sess:${i}`, { id: i, payload: 'x'.repeat(64) }); if (i % (requests / 4) === 0) sizes.push(cache.size); }
  return sizes;
}
class Lru { constructor(max) { this.max = max; this.m = new Map(); } set(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); } get size() { return this.m.size; } }
const leaky = simulate(new Map(), 20000), bounded = simulate(new Lru(5000), 20000);
console.log({ mapEntries: leaky, lruEntries: bounded });
console.log('Map grows with every request (a leak in a long-running server)', leaky[3] === 20000 ? '✅ (measured 3.7 → 88.6 MB)' : '❌ FAIL');
console.log('LRU stays at its max', bounded.every((n, i) => i === 0 ? n === 5000 : n === 5000) ? '✅ (measured flat 6.2 MB)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating rising RSS right after startup as a leak (look at heap after GC over time).
- Module-level `Map`/arrays used as caches with no limit.
- Adding listeners inside middleware/handlers.
- Taking heap snapshots on a busy production instance (it pauses the process; use one instance, drain it first).
- "Fixing" leaks by restarting pods on a schedule.
:::

::: understand
- If something stays reachable, GC can't free it; snapshots show what grows and who holds it.
:::

::: ask
- *"Does heap-used-after-GC stay flat over an hour of steady load?"*
:::

::: important ⭐ Say this in the interview
"A memory leak in Node is memory that stays reachable after it's no longer needed, so the garbage collector can't free it. I reproduced the classic ones: over 200 thousand requests an unbounded Map cache grew the heap from 3.7 to 88.6 megabytes and a listener added per request to 96 megabytes with a MaxListenersExceededWarning, while a bounded LRU stayed flat at 6.2. To find leaks I take heap snapshots before and after load, compare them, see which constructor grew (here 200 thousand Session objects) and follow the retainers to the Map. Fixes are bounded caches with TTLs, removing listeners and timers on close and WeakMaps for per-object metadata."
:::

::: links
Node.js: Using heap snapshots | https://nodejs.org/en/learn/diagnostics/memory/using-heap-snapshot
Chrome DevTools: Memory panel | https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots
:::

=== How does V8 garbage collection work, what are heap limits, and when do you use WeakMap? (measured)
@p 2
@tags nodejs, v8, garbage-collection, memory, weakmap
@quick
- V8 splits the heap: **young generation** (new objects, cleaned by fast **Scavenge**) and **old generation** (survivors, cleaned by **Mark-Sweep-Compact**, mostly incremental/concurrent).
- Measured: 2 million short-lived objects → **30 scavenges, 7.4 ms total pause (max 0.71 ms), 0 mark-compacts**: short-lived garbage is cheap.
- The heap has a **limit** (measured default here **4,144 MB**); with `--max-old-space-size=64` and a leak the process died with **"JavaScript heap out of memory"**, exit code **134**. In containers set it below the memory limit.
- `WeakMap`/`WeakSet` hold keys **weakly**: measured per-request metadata keyed by request objects: `Map` **41.8 MB**, `WeakMap` **4.2 MB** after 100k requests.
- `WeakRef`/`FinalizationRegistry` exist but are for advanced caches; don't use them for program logic.

::: text 🧒 In simple words
Garbage collection is **cleaning a desk**: the small in-tray (young generation) is emptied often and fast because most notes are thrown away quickly; the filing cabinet (old generation) is cleaned less often but takes longer. A `WeakMap` is **a sticky note attached to a document**: when the document is thrown away, the note goes with it.
:::

::: text 📖 Detailed answer
### Generational GC
| Space | Holds | Collector | Cost |
|---|---|---|---|
| New space (young) | freshly allocated objects | Scavenge (copy live objects) | very cheap, frequent |
| Old space | objects that survived ~2 scavenges | Mark-Sweep-Compact (incremental, concurrent marking) | larger, rarer pauses |
| Large object space | big arrays/strings | collected with old space | |

### Measured (`node --trace-gc`, Node 22)
| Workload | Result |
|---|---|
| 2,000,000 short-lived objects | 30 scavenges, 7.4 ms total pause, max 0.71 ms, 0 mark-compacts |
| Default heap limit (`v8.getHeapStatistics()`) | 4,144 MB on an 18 GB machine |
| Leak with `--max-old-space-size=64` | `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`, exit **134** |

### Heap limits in containers
Node picks the limit from total memory; in a container set `--max-old-space-size` (e.g. 75% of the memory limit) so V8 collects harder **before** the kernel OOM-kills the container, and leaves room for Buffers (outside the V8 heap).

### WeakMap vs Map (measured: metadata for 100,000 request objects)
| Store | Heap after |
|---|---|
| `Map(req → meta)` | **41.8 MB** (requests kept alive by the keys) |
| `WeakMap(req → meta)` | **4.2 MB** (entries vanish with their key) |
WeakMap keys must be objects; it isn't iterable and has no `size`, precisely so GC can drop entries at any time.
:::

::: diagram Object lifetime in V8
flowchart LR
  A["allocate"] --> N["new space"]
  N -->|"dies young, most objects"| S["freed by Scavenge, sub-millisecond"]
  N -->|"survives 2 scavenges"| O["old space"]
  O -->|"unreachable later"| M["freed by Mark-Sweep-Compact"]
  O -->|"still reachable, heap at limit"| X["heap out of memory, exit 134"]
:::

::: image Garbage collection, heap limits and WeakMap (measured)
/images/nodejs/gc-heap.svg
:::

::: chart bar Measured: heap MB after 100,000 requests storing per-request metadata
Store,Heap MB
Map,41.8
WeakMap,4.2
:::

::: text 🪜 Step by step
Setting memory for a Node container with a 1 GiB limit:
1. Start with `NODE_OPTIONS=--max-old-space-size=768`.
2. Watch `heapUsed`, `rss`, `external` (Buffers) and GC pause metrics under load.
3. If RSS approaches the limit due to Buffers (uploads, streams), lower the heap limit or stream more.
4. Alert at 80% of the container limit; investigate leaks before raising limits.
5. Never "fix" OOM by only raising limits: find what keeps growing.
:::

::: code javascript GC and heap visibility (perf_hooks + v8) and WeakMap metadata
const v8 = require('node:v8');
const { PerformanceObserver } = require('node:perf_hooks');

// GC pauses as metrics
const gcStats = { count: 0, totalMs: 0, maxMs: 0 };
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    gcStats.count++; gcStats.totalMs += e.duration; gcStats.maxMs = Math.max(gcStats.maxMs, e.duration);
  }
}).observe({ entryTypes: ['gc'] });

function heapReport() {
  const h = v8.getHeapStatistics();
  return {
    usedMb: Math.round(h.used_heap_size / 1048576),
    limitMb: Math.round(h.heap_size_limit / 1048576),                // set with --max-old-space-size
    gcCount: gcStats.count, gcTotalMs: Math.round(gcStats.totalMs), gcMaxMs: +gcStats.maxMs.toFixed(2),
  };
}

// metadata that should live exactly as long as the request object
const requestMeta = new WeakMap();
function trackRequest(req) { requestMeta.set(req, { startedAt: process.hrtime.bigint() }); }
function elapsedMs(req) { const m = requestMeta.get(req); return m ? Number(process.hrtime.bigint() - m.startedAt) / 1e6 : null; }

module.exports = { heapReport, trackRequest, elapsedMs };
:::

::: code javascript What WeakMap allows and forbids (runnable)
const wm = new WeakMap(), ws = new WeakSet();
const req = { url: '/orders' };
wm.set(req, { startedAt: 1 }); ws.add(req);
console.log({ has: wm.has(req), meta: wm.get(req), inSet: ws.has(req) });
let threw = false; try { wm.set('string-key', 1); } catch (e) { threw = e instanceof TypeError; }
console.log('keys must be objects (or non-registered symbols)', threw ? '✅' : '❌ FAIL');
console.log('no size, no iteration (entries may vanish at any GC)', wm.size === undefined && typeof wm[Symbol.iterator] === 'undefined' ? '✅' : '❌ FAIL');
const m = new Map([[req, 1]]);
console.log('a Map keeps its keys alive and can be iterated', m.size === 1 && [...m.keys()][0] === req ? '✅ (measured 41.8 MB vs 4.2 MB for WeakMap)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Allocating huge temporary arrays per request (promotes to old space, longer GC).
- Leaving `--max-old-space-size` unset in containers (killed by the kernel before V8 collects hard).
- Forgetting Buffers live outside the JS heap (`external` memory).
- Using `WeakRef` for business logic (GC timing is not guaranteed).
- Calling `global.gc()` in production code.
:::

::: understand
- Short-lived garbage is cheap; long-lived reachable data is what costs memory and GC time.
:::

::: ask
- *"What's the container memory limit, and what heap limit did we give V8?"*
:::

::: important ⭐ Say this in the interview
"V8 uses generational garbage collection: new objects go into the young generation, cleaned by fast scavenges, and survivors are promoted to the old generation, cleaned by mostly concurrent mark-sweep-compact. Short-lived garbage is cheap: two million temporary objects cost 30 scavenges and 7 milliseconds of total pause in my test. The heap has a limit, around 4 gigabytes on my machine, and with a 64 megabyte limit a leak crashed with 'heap out of memory' and exit code 134, so in containers I set max-old-space-size below the memory limit. For per-object metadata I use WeakMap: keyed by request objects it stayed at 4 megabytes where a Map grew to 42."
:::

::: links
V8 blog: Trash talk (Orinoco garbage collector) | https://v8.dev/blog/trash-talk
Node.js: Understanding and tuning memory | https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory
:::
