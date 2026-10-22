@section Resilience & Rate Limiting
@icon 🛡️
@color #ef4444
@desc Keeping systems up when parts fail or traffic spikes: timeouts and retries with exponential backoff and jitter (measured retry storms), circuit breakers, bulkheads and fallbacks (measured against a hung dependency), load shedding, backpressure and graceful degradation, and rate limiting across a distributed system.

=== How should you use timeouts and retries? (exponential backoff, jitter, retry storms)
@p 3
@tags resilience, retries, timeouts, backoff, jitter, distributed-systems
@quick
- **Every remote call needs a timeout** (connect + overall). Without one, a hung dependency holds sockets, memory and users forever.
- Retry only **transient** failures (timeouts, `503`, `429`, connection resets) and only **idempotent** operations (or with an idempotency key). Never retry `400`/`404`.
- Use **exponential backoff with full jitter**: `delay = random(0, min(cap, base × 2^attempt))`, cap attempts and total time, honour `Retry-After`.
- Measured (300 clients, server down 2 s): immediate retries sent **59 requests per client** and every client gave up; no-jitter backoff came back in **waves (18.5 s)**; full jitter finished in **5.8 s** with **6.3 requests per client**.
- Retry at **one layer**; retries at client, gateway, service and SDK multiply (3 × 3 × 3 = 27 calls).

::: text 🧒 In simple words
If a shop is closed and 300 people keep rattling the door every second, the owner can't even open it. Backoff means "wait longer each time"; **jitter** means everyone waits a *different random* amount, so they don't all come back at the exact same moment.
:::

::: text 📖 Detailed answer
### Measured: 300 clients, server unavailable for 2 s, then 40 concurrent slots (real HTTP, Node 22)
| Strategy | Requests to the server | Per client | All clients done | Gave up |
|---|---|---|---|---|
| immediate retry (no delay, 60 attempts) | 17,768 | 59.2 | never | **300** |
| fixed 100 ms delay | 6,918 | 23.1 | 2.7 s | 0 |
| exponential backoff, no jitter | 1,991 | 6.6 | **18.5 s** (synchronised waves) | 0 |
| exponential backoff + full jitter | 1,892 | **6.3** | **5.8 s** | 0 |

The fixed delay recovered fastest here because the outage was short and capacity was plentiful, but it sent nearly 4× more load; under a real overload that extra load *prolongs* the outage. Jitter gives the best balance of load and recovery time.

### Timeouts
| Timeout | Typical value |
|---|---|
| connect | 1–3 s |
| request (internal service) | slightly above its p99, e.g. 300 ms–2 s |
| overall deadline for the user request | propagate it; don't start a 2 s call with 100 ms left |

### What to retry
| Retry | Don't retry |
|---|---|
| timeouts, `ECONNRESET`, `502/503/504` | `400`, `401`, `403`, `404`, `409`, `422` |
| `429` after `Retry-After` | non-idempotent POSTs without an idempotency key |
| idempotent GET/PUT/DELETE | anything when the overall deadline has passed |

### Retry budgets
Limit retries to a percentage of traffic (e.g. 10%) so a struggling dependency doesn't receive 3× its normal load.
:::

::: diagram Retry decision
flowchart TD
  R["call failed"] --> T{"transient? timeout, 503, 429, reset"}
  T -->|"no"| F["fail fast, return error"]
  T -->|"yes"| I{"idempotent or has idempotency key?"}
  I -->|"no"| F
  I -->|"yes"| B{"attempts and deadline left? retry budget ok?"}
  B -->|"no"| F
  B -->|"yes"| W["wait random(0, min(cap, base × 2^n)) or Retry-After"]
  W --> C["call again"]
:::

::: image Timeouts and retries with backoff and jitter, measured
/images/system-design/retries.svg
:::

::: text 🪜 Step by step
1. Set connect and request timeouts on every HTTP client, DB driver and SDK.
2. Classify errors as retryable or not.
3. Add exponential backoff with full jitter, max attempts (3–5) and a max total time.
4. Honour `Retry-After`; propagate the request deadline downstream.
5. Use idempotency keys for writes you retry.
6. Retry in one layer only and track retry rate as a metric.
:::

::: code javascript fetch with timeout, retries, backoff and jitter
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

async function fetchWithRetry(url, options = {}, { attempts = 4, baseMs = 100, capMs = 2000, timeoutMs = 1000, deadline = Date.now() + 5000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('deadline exceeded');
    let res, error;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)) });
      if (!RETRYABLE_STATUS.has(res.status)) return res;               // success or a non-retryable error
    } catch (err) {
      error = err;                                                    // timeout / connection error
    }
    if (attempt + 1 >= attempts) { if (res) return res; throw error; }
    const retryAfter = Number(res?.headers.get('retry-after')) * 1000;
    const backoff = Math.random() * Math.min(capMs, baseMs * 2 ** attempt);   // full jitter
    await new Promise((r) => setTimeout(r, retryAfter || backoff));
  }
}

module.exports = { fetchWithRetry };
:::

::: code javascript Simulate a retry storm: no jitter vs full jitter (runnable)
// 1,000 clients fail at t=0 and retry with exponential backoff. Count retries in the busiest 10 ms slot.
function peakLoad(jitter, clients = 1000, attempts = 5, base = 100) {
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const buckets = new Map();
  for (let c = 0; c < clients; c++) {
    let t = 0;
    for (let n = 0; n < attempts; n++) {
      const max = base * 2 ** n;
      t += jitter ? rnd() * max : max;
      const b = Math.floor(t / 10); buckets.set(b, (buckets.get(b) || 0) + 1);
    }
  }
  return Math.max(...buckets.values());
}
const noJitter = peakLoad(false), full = peakLoad(true);
console.log(`busiest 10 ms slot: no jitter ${noJitter} retries, full jitter ${full} retries`);
console.log(noJitter === 1000 ? '✅ without jitter every client retries in the same instant (a wave)' : '❌ FAIL');
console.log(full < noJitter / 3 ? '✅ jitter spreads the same retries out in time' : '❌ FAIL');
const layers = [3, 3, 3];
console.log(`retries at 3 layers × 3 attempts = ${layers.reduce((a, b) => a * b)} calls to the bottom service per user request`, layers.reduce((a, b) => a * b) === 27 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No timeout (Node's `fetch`/undici defaults are minutes), so one slow dependency exhausts the service.
- Retrying immediately in a tight loop: turns a blip into an outage.
- Backoff without jitter: synchronised waves.
- Retrying non-idempotent payments without an idempotency key.
- Retries at every layer, multiplying load on the struggling service.
:::

::: understand
- Timeouts bound the damage; retries recover from blips only when they're limited, spread out with jitter, and safe to repeat.
:::

::: ask
- *"If the dependency is down for a minute, how many requests per second will our retries send it?"*
:::

::: important ⭐ Say this in the interview
"Every remote call gets a connect and request timeout, and I propagate the user's deadline. I retry only transient errors like timeouts, 503 and 429, only for idempotent operations or with an idempotency key, with exponential backoff and full jitter, a small attempt cap and Retry-After support, and in one layer only. I measured it with 300 clients hitting a server that was down for two seconds: immediate retries sent 59 requests per client and everyone gave up, backoff without jitter came back in synchronised waves and took 18 seconds, and full jitter finished in under six seconds with about six requests per client."
:::

::: links
AWS Builders' Library: Timeouts, retries and backoff with jitter | https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
AWS Architecture Blog: Exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
:::

=== What are circuit breakers, bulkheads and fallbacks? (protecting a service from a failing dependency)
@p 3
@tags resilience, circuit-breaker, bulkhead, fallback, nodejs
@quick
- A **circuit breaker** watches calls to a dependency: **closed** (normal) → too many failures → **open** (fail fast, no calls) → after a cool-down **half-open** (let a probe through) → closed or open again.
- Measured against a hung dependency (50 connections): **no timeout = 0 req/s** (everything hung); **300 ms timeout + fallback = 158 req/s, p99 375 ms**; **+ circuit breaker = 32,647 req/s, p99 5 ms**, and the dependency got **150 calls instead of 1,000**.
- **Bulkheads** isolate resources per dependency (separate connection pools, concurrency limits, worker pools) so one slow dependency can't starve the others.
- **Fallbacks**: cached/stale data, defaults, partial pages, "try again later" for non-critical features.
- Libraries: `opossum` (Node), resilience4j (Java), or a service mesh (Envoy outlier detection).

::: text 🧒 In simple words
A circuit breaker in your house **cuts the power** when something shorts, so the whole house doesn't burn. In software, when a dependency keeps failing, the breaker **stops calling it for a while** and answers immediately with a fallback, giving the dependency time to recover. Bulkheads are the **watertight compartments** in a ship: one flooded room doesn't sink it.
:::

::: text 📖 Detailed answer
### Measured: product API calling a price service that hangs (Node 22, autocannon, 6 s)
| Protection | Requests/s | p50 | p99 | Calls to the hung service |
|---|---|---|---|---|
| none (no timeout) | **0** (50 client timeouts) | — | — | 100 |
| timeout 300 ms + cached-price fallback | 158 | 302 ms | 375 ms | 1,000 |
| timeout + circuit breaker (5 failures → open for 2 s) | **32,647** | 1 ms | 5 ms | **150** |

The timeout alone keeps the API alive but every request still waits 300 ms and keeps hammering the dependency. The breaker turns those into instant fallbacks and lets the dependency recover. (My simple breaker let all waiting requests probe when half-open, 50 at a time; production breakers allow a single probe.)

### Breaker settings
| Setting | Typical |
|---|---|
| failure threshold | error rate > 50% over ≥ 20 calls in 10 s (not just "5 in a row") |
| timeout counted as failure | yes |
| open duration | 5–30 s |
| half-open probes | 1 (or a few) |
| per | dependency (and per endpoint if they fail independently) |

### Bulkheads in Node.js
- Separate `http.Agent`/undici pools with `maxSockets` per dependency.
- Concurrency limits (`p-limit`, a semaphore) per dependency.
- Separate queues and worker pools for slow jobs.
- In Kubernetes: separate deployments for heavy endpoints.
:::

::: diagram Circuit breaker states
stateDiagram-v2
  [*] --> Closed
  Closed --> Open: failure rate above threshold
  Open --> HalfOpen: cool-down elapsed
  HalfOpen --> Closed: probe succeeds
  HalfOpen --> Open: probe fails
:::

::: image Circuit breakers, bulkheads and fallbacks, measured
/images/system-design/circuit-breaker.svg
:::

::: text 🪜 Step by step
1. Put a timeout on the dependency call.
2. Wrap it in a circuit breaker per dependency with an error-rate threshold.
3. Define the fallback for each feature (stale cache, default, hide the widget, 503 with Retry-After).
4. Give each dependency its own connection pool / concurrency limit (bulkhead).
5. Export breaker state and fallback counts as metrics; alert when a breaker stays open.
6. Test by making the dependency slow in staging (fault injection).
:::

::: code javascript opossum circuit breaker with a fallback (Node.js)
const CircuitBreaker = require('opossum');
const { Agent, request } = require('undici');

const pricingPool = new Agent({ connections: 50 });            // bulkhead: this dependency's own pool
async function getPrice(productId) {
  const res = await request(`http://pricing.internal/prices/${productId}`, { dispatcher: pricingPool, signal: AbortSignal.timeout(300) });
  if (res.statusCode >= 500) throw new Error(`pricing ${res.statusCode}`);
  return res.body.json();
}

const breaker = new CircuitBreaker(getPrice, {
  timeout: 300,                     // counts as a failure
  errorThresholdPercentage: 50,     // open when half the calls in the window fail
  volumeThreshold: 20,              // …but only after 20 calls
  resetTimeout: 10_000,             // try a probe after 10 s
});
const lastKnown = new Map();
breaker.fallback((productId) => lastKnown.get(productId) ?? { productId, price: null, stale: true });
breaker.on('open', () => console.warn('pricing circuit OPEN'));

async function productHandler(req, res) {
  const price = await breaker.fire(req.params.id);
  if (!price.stale) lastKnown.set(req.params.id, price);
  res.json({ id: req.params.id, price });
}
module.exports = { productHandler, breaker };
:::

::: code javascript A circuit breaker against a failing dependency (runnable)
class CircuitBreaker {
  constructor({ threshold = 5, openMs = 1000, now = () => Date.now() } = {}) { Object.assign(this, { threshold, openMs, now, failures: 0, state: 'closed', openedAt: 0, probing: false }); }
  async call(fn, fallback) {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.openMs || this.probing) return fallback('open');
      this.state = 'half-open'; this.probing = true;                       // exactly one probe
    }
    try { const v = await fn(); this.failures = 0; this.state = 'closed'; return v; }
    catch { this.failures++; if (this.state === 'half-open' || this.failures >= this.threshold) { this.state = 'open'; this.openedAt = this.now(); } return fallback('error'); }
    finally { this.probing = false; }
  }
}
let clock = 0, calls = 0, healthy = false;
const dep = async () => { calls++; if (!healthy) throw new Error('down'); return 'fresh price'; };
const cb = new CircuitBreaker({ threshold: 5, openMs: 1000, now: () => clock });
(async () => {
  const results = [];
  for (let i = 0; i < 100; i++) { clock += 10; results.push(await cb.call(dep, (why) => 'fallback:' + why)); }  // 1 s of traffic while down
  console.log(`dependency down: 100 requests → ${calls} calls reached it, state ${cb.state}`);
  healthy = true; clock += 1000;
  const after = await cb.call(dep, (w) => 'fallback:' + w);
  console.log('after recovery, probe result:', after, 'state:', cb.state);
  console.log(calls <= 6 ? '✅ breaker opened after 5 failures and stopped hammering the dependency' : `❌ FAIL (${calls})`);
  console.log(after === 'fresh price' && cb.state === 'closed' ? '✅ half-open probe succeeded and closed the circuit' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- A breaker without a timeout: hung calls never count as failures.
- One global breaker for all dependencies, so one bad service blocks the healthy ones.
- Opening on "5 failures" at low traffic, flapping constantly; use a rate with a minimum volume.
- Fallbacks that call another slow dependency.
- No metrics: nobody notices the breaker has been open for a day.
:::

::: understand
- Timeouts limit each call, breakers stop calling a failing dependency, bulkheads contain the damage, fallbacks keep the user experience acceptable.
:::

::: ask
- *"When this dependency is down, what should the user see instead?"*
:::

::: important ⭐ Say this in the interview
"I put a timeout on every dependency call, wrap each dependency in a circuit breaker that opens on a high error rate, fails fast with a fallback while open, and lets a single probe through when half-open, and I isolate dependencies with separate connection pools and concurrency limits as bulkheads. I measured it against a dependency that hung: with no timeout the API served nothing; a 300 ms timeout with a cached fallback served 158 requests a second at 375 ms p99; adding a breaker served over 32,000 a second at 5 ms p99, and the dependency received 150 calls instead of 1,000, so it could recover."
:::

::: links
Martin Fowler: CircuitBreaker | https://martinfowler.com/bliki/CircuitBreaker.html
opossum (Node.js circuit breaker) | https://github.com/nodeshift/opossum
:::

=== What are load shedding, backpressure and graceful degradation?
@p 2
@tags resilience, load-shedding, backpressure, overload, graceful-degradation
@quick
- Under overload an **unbounded queue** makes every request slower until clients time out and **retry**, adding more load: **goodput collapses** while the server is 100% busy on work nobody waits for.
- **Load shedding** rejects excess work early and cheaply (`503` + `Retry-After`) so accepted requests stay fast and goodput stays near capacity.
- Limit **in-flight requests**, **queue length** or **queue wait time** (drop requests that already waited longer than the client will wait).
- **Prioritise**: checkout over search over recommendations; never shed health checks; keep per-tenant fairness.
- **Graceful degradation**: hide non-essential features, serve stale cache, go read-only. **Backpressure**: slow producers down (stream `pause`, bounded queues, small consumer prefetch).

::: text 🧒 In simple words
A restaurant with 20 tables gets 60 guests. If it seats everyone "eventually", the kitchen drowns, food arrives cold, and people walk out after ordering (wasted work). Better: **tell new guests now** "full, come back in 30 minutes" (shedding), keep serving the seated ones well, and take the complicated dishes off the menu tonight (degradation).
:::

::: text 📖 Detailed answer
### Why queues make overload worse
With arrival rate λ above capacity μ, an unbounded queue grows by (λ - μ) every second. Wait time grows without limit; once it passes the client timeout, every completed request is **wasted**, and client retries raise λ further. This is congestion collapse.

### What to limit
| Limit | Example | Notes |
|---|---|---|
| concurrency (in-flight) | max 100 requests per instance | simple; Little's law: concurrency = rate × latency |
| queue length | max 200 waiting jobs | protects memory |
| queue wait time | drop if waited > 500 ms | best signal: the client may already be gone |
| adaptive (CoDel, gradient) | adjusts to latency | used by Envoy/Netflix concurrency-limits |

### Priorities and fairness
| Priority | Examples |
|---|---|
| critical | checkout, payments, login, health checks |
| normal | browsing, search |
| sheddable | recommendations, analytics beacons, prefetches |

Per-tenant or per-user concurrency limits stop one noisy client from taking everything.

### Degradation ladder
1. Turn off expensive features (recommendations, personalisation).
2. Serve stale cache with longer TTLs.
3. Reduce page size / disable exports.
4. Read-only mode.
5. Static "we're busy" page at the CDN.

Autoscaling adds capacity in **minutes**; shedding protects you in **milliseconds**. You need both.
:::

::: diagram Admission control in front of the work
flowchart LR
  REQ["incoming request"] --> P{"priority and tenant quota ok?"}
  P -->|"no"| R1["429 / 503 + Retry-After"]
  P -->|"yes"| Q{"queue length or wait below limit?"}
  Q -->|"no"| R2["503 + Retry-After (cheap)"]
  Q -->|"yes"| W["queue → worker → response"]
  W --> X{"waited longer than client timeout?"}
  X -->|"yes"| D["drop without doing the work"]
  X -->|"no"| OK["do the work"]
:::

::: image Load shedding, backpressure and graceful degradation
/images/system-design/load-shedding.svg
:::

::: text 🪜 Step by step
1. Measure capacity per instance (load test) and the client timeout.
2. Add a concurrency limit or bounded queue in front of expensive work; reject quickly with `503` + `Retry-After`.
3. Drop queued work whose deadline has passed.
4. Classify endpoints by priority; shed low priority first.
5. Add degradation switches (feature flags) for heavy features.
6. Make clients back off with jitter; autoscale on queue depth or latency.
:::

::: code javascript Overload simulation: unbounded queue vs load shedding (runnable)
// A simulation (not a measurement): capacity 50 req/s, arrivals 100 req/s for 10 s, clients give up after 1 s.
function simulate(maxQueue, { capacity = 50, arrivals = 100, seconds = 10, clientTimeoutMs = 1000 } = {}) {
  const service = 1000 / capacity; let queue = [], busyUntil = 0, ok = 0, late = 0, shed = 0, dropped = 0;
  for (let t = 0; t < seconds * 1000; t += 1000 / arrivals) {
    while (queue.length && busyUntil <= t) {                      // the worker picks the next request
      const r = queue.shift(); const start = Math.max(busyUntil, r.arrived);
      if (maxQueue !== Infinity && start - r.arrived > clientTimeoutMs) { dropped++; continue; }   // deadline passed: skip
      busyUntil = start + service;
      busyUntil - r.arrived <= clientTimeoutMs ? ok++ : late++;
    }
    if (queue.length >= maxQueue) { shed++; continue; }
    queue.push({ arrived: t });
  }
  return { ok, wastedWorkForGoneClients: late, shed503: shed, droppedBeforeWork: dropped, stillQueued: queue.length };
}
const unbounded = simulate(Infinity), bounded = simulate(20);
console.log('unbounded queue:', unbounded);
console.log('queue limit 20 :', bounded);
console.log(bounded.ok > unbounded.ok * 1.5 ? '✅ shedding keeps more requests within the client timeout' : '❌ FAIL');
console.log(unbounded.wastedWorkForGoneClients > 200 && bounded.wastedWorkForGoneClients === 0 ? '✅ without shedding the server burns capacity on requests nobody waits for' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Unbounded in-memory queues "so nothing is lost": memory blows up and latency explodes.
- Shedding health checks, so the orchestrator kills healthy-but-busy instances.
- Rejecting with slow, expensive error pages instead of cheap `503`s.
- Relying only on autoscaling for sudden spikes.
- No priorities: a flood of analytics beacons starves checkout.
:::

::: understand
- When demand exceeds capacity, rejecting some work quickly and doing the rest well beats accepting everything and failing slowly.
:::

::: ask
- *"When we're at 3× capacity, which requests should still succeed?"*
:::

::: important ⭐ Say this in the interview
"Under overload an unbounded queue makes every request slower until clients time out and retry, so the server burns capacity on work nobody is waiting for and goodput collapses. I add admission control: a concurrency limit or a bounded queue, rejecting excess requests cheaply with 503 and Retry-After, and dropping queued requests whose deadline has passed. Low-priority traffic is shed first, health checks never, with per-tenant fairness. Features degrade through flags, like hiding recommendations or serving stale cache, while autoscaling adds capacity over minutes and clients back off with jitter."
:::

::: links
AWS Builders' Library: Using load shedding to avoid overload | https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/
Google SRE book: Handling overload | https://sre.google/sre-book/handling-overload/
:::

=== How do you design rate limiting for a distributed system? (where to limit, shared counters, 429 contract)
@p 3
@tags rate-limiting, api-gateway, redis, distributed-systems, quotas
@quick
- Limit at several layers: **edge/CDN/WAF** (per IP, floods), **API gateway** (per API key/tenant quotas), **service** (per user per endpoint: login, search, exports), and **outgoing clients** (stay under partners' limits).
- Algorithms: **token bucket** (allows bursts, most common), **sliding window** (smooth), **fixed window** (simple, double burst at edges), **leaky bucket** (constant outflow).
- With many instances, counters must be **shared** (Redis) and updated **atomically** (`INCR` + `EXPIRE`, or a Lua script); decide **fail-open vs fail-closed** if Redis is down.
- Respond `429 Too Many Requests` with `Retry-After` and `RateLimit-*` headers; document limits per plan.
- Limit by **cost**, not only count (an export costs more than a GET); combine with concurrency limits.

::: text 🧒 In simple words
A theme park gives each visitor **10 ride tokens per hour** (token bucket). The gate at the entrance turns away busloads of troublemakers (edge limits), each ride has its own queue limit (service limits), and every gate checks the **same central token counter** (Redis), so you can't cheat by going to a different entrance.
:::

::: text 📖 Detailed answer
### Where to limit
| Layer | Key | Protects against |
|---|---|---|
| CDN / WAF | IP, ASN, bot score | floods, scrapers |
| API gateway | API key, tenant, plan | quota abuse, noisy tenants |
| service | user id + endpoint | brute force on login, expensive searches/exports |
| outbound client | partner API | being blocked by a partner, surprise bills |

### Algorithms
| Algorithm | Behaviour | Storage |
|---|---|---|
| fixed window | count per minute; up to 2× burst at window edges | 1 counter |
| sliding window log | exact; stores each timestamp | many entries |
| sliding window counter | weighted current + previous window | 2 counters |
| token bucket | refill r tokens/s up to capacity b; bursts up to b | tokens + timestamp |
| leaky bucket | queue drained at constant rate | queue |

(The Redis section has measured implementations of these.)

### Distributed concerns
| Concern | Approach |
|---|---|
| shared state across instances | Redis with atomic `INCR`/Lua; key per (limit, subject, window) |
| Redis latency per request | local token buckets with periodic sync for very hot paths |
| Redis down | fail open for normal APIs, fail closed for login/brute-force limits |
| multi-region | per-region limits, or approximate global counts |
| fairness | per-tenant limits + global limits |

### The contract with clients
`429` + `Retry-After: 30`, plus `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (IETF draft), consistent JSON error body, and limits documented per plan.
:::

::: diagram Rate limiting at several layers
flowchart LR
  C["client"] --> EDGE["CDN / WAF: per IP"]
  EDGE --> GW["API gateway: per key / tenant quota"]
  GW --> SVC["service: per user per endpoint"]
  GW --> R[("Redis: shared counters")]
  SVC --> R
  SVC --> P["partner API client: outbound limit"]
:::

::: image Rate limiting across a distributed system
/images/system-design/rate-limiting.svg
:::

::: text 🪜 Step by step
1. Decide subjects and limits per layer (IP, API key, tenant, user, endpoint).
2. Pick the algorithm: token bucket for APIs, sliding window where fairness matters.
3. Implement shared, atomic counters in Redis (Lua script) with TTLs.
4. Return `429` with `Retry-After` and rate-limit headers.
5. Decide failure behaviour when Redis is unavailable.
6. Monitor limit hits per subject; adjust plans; alert on unusual spikes.
:::

::: code javascript Token bucket in Redis with an atomic Lua script (Node.js)
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// KEYS[1] bucket key · ARGV: capacity, refill per second, now (ms), cost
redis.defineCommand('takeTokens', {
  numberOfKeys: 1,
  lua: `
    local cap, rate, now, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
    local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
    local tokens = tonumber(b[1]) or cap
    local ts = tonumber(b[2]) or now
    tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)
    local allowed = tokens >= cost
    if allowed then tokens = tokens - cost end
    redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
    redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) + 1000)
    return { allowed and 1 or 0, math.floor(tokens), math.ceil((cost - tokens) / rate) }
  `,
});

function rateLimit({ capacity, perSecond, keyOf, cost = () => 1, failOpen = true }) {
  return async (req, res, next) => {
    try {
      const [allowed, remaining, waitS] = await redis.takeTokens(`rl:${keyOf(req)}`, capacity, perSecond, Date.now(), cost(req));
      res.set({ 'RateLimit-Limit': capacity, 'RateLimit-Remaining': remaining });
      if (allowed) return next();
      res.set('Retry-After', String(Math.max(1, waitS)));
      return res.status(429).json({ error: 'rate_limited', retryAfterSeconds: Math.max(1, waitS) });
    } catch (err) {
      return failOpen ? next() : res.status(503).json({ error: 'rate_limiter_unavailable' });
    }
  };
}
module.exports = { rateLimit };
:::

::: code javascript Shared vs per-instance counters across 4 instances (runnable)
// 4 API instances behind a load balancer, limit 100 requests/minute per user. One user sends 400 requests.
function makeLimiter(limit, store) { return (user) => { const n = (store.get(user) || 0) + 1; store.set(user, n); return n <= limit; }; }
const shared = new Map();
const sharedInstances = [0, 1, 2, 3].map(() => makeLimiter(100, shared));        // all use one store (Redis)
const localInstances = [0, 1, 2, 3].map(() => makeLimiter(100, new Map()));      // each has its own memory
let allowedShared = 0, allowedLocal = 0;
for (let i = 0; i < 400; i++) { if (sharedInstances[i % 4]('user-7')) allowedShared++; if (localInstances[i % 4]('user-7')) allowedLocal++; }
console.log(`limit 100/min: shared counter allowed ${allowedShared}, per-instance counters allowed ${allowedLocal}`);
console.log(allowedShared === 100 ? '✅ a shared store enforces the real limit' : '❌ FAIL');
console.log(allowedLocal === 400 ? '✅ in-memory limits multiply by the number of instances (4×)' : '❌ FAIL');
// cost-based limiting: an export costs 50 tokens, a GET costs 1
let tokens = 100; const costs = { get: 1, export: 50 }; const log = [];
for (const op of ['export', 'get', 'export', 'get']) { if (tokens >= costs[op]) { tokens -= costs[op]; log.push(op + ' ok'); } else log.push(op + ' 429'); }
console.log(log.join(', '), log[2] === 'export 429' ? '✅ expensive operations use up the budget faster' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- In-memory rate limits with N instances: the real limit is N× higher (and changes with autoscaling).
- Non-atomic `GET` then `SET` on Redis: concurrent requests slip through.
- Only per-IP limits: users behind one corporate NAT get blocked together; attackers rotate IPs.
- `429` without `Retry-After`: clients retry immediately.
- Counting all requests equally when some cost 100× more.
:::

::: understand
- Limit at each layer by the right key, keep counters shared and atomic, and tell clients exactly when to come back.
:::

::: ask
- *"What should happen to our login limiter if Redis goes down: let everyone through or block everyone?"*
:::

::: important ⭐ Say this in the interview
"I rate limit at several layers: per IP at the CDN or WAF, per API key and tenant quota at the gateway, per user and endpoint in services for things like login and exports, and on outbound calls to partners. I usually use a token bucket, which allows short bursts, with counters in Redis updated atomically through a Lua script so every instance shares the same limit; in-memory counters would multiply the limit by the number of instances. Expensive operations cost more tokens, rejected requests get 429 with Retry-After and rate-limit headers, and I decide per limiter whether to fail open or closed if Redis is down."
:::

::: links
IETF draft: RateLimit header fields for HTTP | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
Stripe: Scaling your API with rate limiters | https://stripe.com/blog/rate-limiters
:::
