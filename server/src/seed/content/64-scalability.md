@section Scalability & Production Architecture
@icon 📐
@color #6366f1
@desc The foundations of system design interviews: a step-by-step framework, back-of-the-envelope estimation, horizontal scaling with stateless services and load balancing (measured round-robin vs least-connections), scaling the database with replicas, partitions and shards (measured consistent hashing), and availability through redundancy, multi-AZ and multi-region.

=== How do you approach a system design interview? (a step-by-step framework)
@p 3
@tags system-design, interview, framework, requirements, trade-offs
@quick
- Don't jump to boxes. **Clarify requirements** first: functional (what it does) and non-functional (scale, latency, availability, consistency, cost).
- **Estimate** the numbers that shape the design: users, peak QPS, read:write ratio, storage per day, bandwidth.
- Define the **API** and the **data model** (access patterns first, then SQL vs NoSQL, keys and indexes).
- Draw a **simple high-level design** that works, then **deep dive** into the parts that break at scale: hot spots, failure modes, consistency, caching, queues.
- Narrate **trade-offs** ("I choose X because Y; it costs Z") and keep checking in with the interviewer.

::: text 🧒 In simple words
Designing a system is like planning a wedding. First you ask **what kind of wedding** and **how many guests** (requirements, estimates). Then you choose the venue and menu (API, data). You sketch the day (high-level design) and only then worry about rain, late caterers and the uncle who brings 20 extra people (deep dives).
:::

::: text 📖 Detailed answer
### The six steps
| Step | Questions to ask / things to write | Output |
|---|---|---|
| 1. Requirements | Who uses it? Core features (3–5)? Out of scope? Latency, availability, consistency needs? Read- or write-heavy? | a short list on the board |
| 2. Estimates | DAU, actions per user, peak factor, object sizes, retention | QPS, storage, bandwidth (orders of magnitude) |
| 3. API | REST/GraphQL/WebSocket/events, request and response shapes, pagination, idempotency keys | 4–6 endpoints |
| 4. Data model | entities, relationships, primary/partition keys, indexes, hot rows | tables or collections |
| 5. High level | client → CDN → LB → stateless services → cache → DB; queues for slow work; object storage for files | one diagram |
| 6. Deep dives | the bottleneck, failure modes, scaling each tier, consistency, monitoring | 2–3 detailed areas |

### A 45-minute time box
5 min requirements, 5 estimates, 5 API and data, 10 high level, 15 deep dives, 5 wrap-up (what you'd do next, what you'd monitor).

### What interviewers score
- Asking good questions instead of assuming.
- A working simple design before an over-engineered one.
- Knowing *why* each component is there and what it costs.
- Handling failures and growth.
- Communication: thinking out loud, structuring the board.
:::

::: diagram The default high-level shape
flowchart LR
  C["clients"] --> CDN["CDN (static, media)"]
  C --> LB["load balancer"]
  LB --> S1["stateless service × N"]
  S1 --> CACHE[("cache")]
  S1 --> DB[("primary DB + replicas")]
  S1 --> Q["queue"]
  Q --> W["workers"]
  S1 --> OBJ["object storage"]
:::

::: image A framework for system design interviews
/images/system-design/sd-framework.svg
:::

::: text 🪜 Step by step
1. Repeat the problem in your own words and ask 3–5 clarifying questions.
2. Write functional and non-functional requirements; agree on what's out of scope.
3. Do quick estimates and say which numbers matter ("60k writes/s means one DB primary won't do").
4. Sketch the API and data model.
5. Draw the simple design end to end and walk one request through it.
6. Pick the riskiest parts and deep dive; end with monitoring, failure handling and next steps.
:::

::: code javascript A requirements checklist that flags missing decisions (runnable)
// Use it while practising: what did you forget to ask?
const checklist = {
  functional: ['core features', 'out of scope'],
  scale: ['daily active users', 'peak QPS', 'read:write ratio', 'data size / retention'],
  quality: ['latency target', 'availability target', 'consistency needs'],
  constraints: ['budget / team size', 'existing stack', 'regions / compliance'],
};
function review(answers) {
  const missing = Object.entries(checklist).flatMap(([group, items]) => items.filter((i) => !(i in answers)).map((i) => `${group}: ${i}`));
  return { asked: Object.keys(answers).length, missing };
}
const myPractice = { 'core features': 'send/receive messages, groups', 'daily active users': '50M', 'peak QPS': '60k writes/s', 'latency target': '< 200 ms delivery', 'consistency needs': 'ordered per conversation' };
const r = review(myPractice);
console.log(`asked ${r.asked}, still missing:`); r.missing.forEach((m) => console.log('  -', m));
console.log(r.missing.includes('scale: read:write ratio') ? '✅ the checklist catches what you forgot to ask' : '❌ FAIL');
console.log(r.missing.length === 7 ? '✅ 7 open questions to raise with the interviewer' : `❌ FAIL (${r.missing.length})`);
:::

::: warning ⚠️ Common mistakes
- Drawing Kafka, Kubernetes and 12 microservices in minute two.
- Skipping estimates, then designing for the wrong scale (or no scale).
- Not asking about consistency: "Can a user see a stale balance?" changes everything.
- Going silent while thinking; the interviewer can't score what they can't hear.
- Spending the whole time on one component and never finishing the end-to-end flow.
:::

::: understand
- Requirements and numbers decide the design; a simple working design comes first, then you scale what breaks, explaining trade-offs.
:::

::: ask
- *"What matters more for this product: never showing stale data, or always answering quickly?"*
:::

::: important ⭐ Say this in the interview
"I start by clarifying functional and non-functional requirements and agreeing on scope, then I estimate users, peak QPS, read-to-write ratio and storage so the numbers drive the design. I sketch the API and data model from the access patterns, draw a simple end-to-end design with stateless services behind a load balancer, a cache, a database and queues for slow work, and walk a request through it. Then I deep dive into the bottlenecks and failure modes, and I state each trade-off and what I'd monitor."
:::

::: links
System Design Primer | https://github.com/donnemartin/system-design-primer
AWS Well-Architected Framework | https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html
:::

=== How do you do back-of-the-envelope estimation in system design?
@p 3
@tags system-design, estimation, capacity-planning, qps, storage
@quick
- **QPS** = daily actions ÷ 86,400 (≈ 10^5 s). Peak ≈ **2–5× average**.
- **Storage** = items per day × size × retention (+ replicas, + indexes ≈ ×2–3).
- **Bandwidth** = QPS × payload size. **Memory for cache** ≈ hot fraction (e.g. 20%) × daily data.
- Know rough latencies: RAM ~100 ns, SSD ~100 µs, same-DC round trip ~0.5 ms, Redis ~0.2–1 ms, cross-region ~100 ms.
- Round to **powers of 10**; the goal is the order of magnitude that decides the design (one DB vs sharding, cache vs not).

::: text 🧒 In simple words
Estimation is guessing **how many plates** you need before a party. You don't count every guest exactly; "about 200 people, each uses 3 plates, so ~600" tells you whether to rent a dishwasher. Same with servers: "about 60,000 writes a second" tells you one database won't cope.
:::

::: text 📖 Detailed answer
### Formulas
| Quantity | Formula | Example (chat app) |
|---|---|---|
| Daily writes | DAU × actions per user | 50M × 40 = 2×10^9 |
| Average write QPS | daily ÷ 10^5 | ≈ 20,000/s |
| Peak write QPS | average × 3 | ≈ 60,000/s |
| Read QPS | writes × read ratio | 5× → ≈ 300,000/s at peak |
| Storage per day | writes × size | 2×10^9 × 200 B = 400 GB |
| Storage per year | × 365 (× replicas) | ≈ 146 TB (× 3 replicas ≈ 440 TB) |
| Bandwidth | QPS × size | 300k × 1 KB = 300 MB/s egress |

### Latency and capacity numbers to remember
| Thing | Rough value |
|---|---|
| RAM read | ~100 ns |
| SSD random read | ~100 µs |
| same datacenter round trip | ~0.5 ms |
| Redis GET over the network | ~0.2–1 ms |
| indexed DB query | ~1 ms |
| cross-region round trip | 70–150 ms |
| one Node instance, simple JSON API | thousands to ~10k+ req/s |
| one Postgres primary | thousands of simple writes/s; batching goes much higher |

### What the numbers decide
- < ~1k writes/s: a single primary DB is fine.
- Tens of thousands of writes/s: batching, partitioning or sharding, a log like Kafka.
- Huge read ratio: caching and read replicas, CDN for static/media.
- Large objects: object storage + CDN, never in the DB.
:::

::: diagram From requirements to design decisions
flowchart LR
  DAU["50M DAU × 40 msgs"] --> W["2B writes/day ≈ 20k/s avg, 60k/s peak"]
  W --> D1["shard/partition by conversation"]
  W --> S["400 GB/day → 146 TB/yr"]
  S --> D2["tiered storage, retention policy"]
  W --> R["300k reads/s peak"]
  R --> D3["cache recent messages, replicas"]
:::

::: image Back-of-the-envelope estimation numbers and a worked example
/images/system-design/estimation.svg
:::

::: text 🪜 Step by step
1. Write down DAU, actions per user per day, object size, retention, read:write ratio (ask or assume and say so).
2. Compute average QPS (÷ 10^5) and peak QPS (× 2–5).
3. Compute storage per day and per year (with replication).
4. Compute bandwidth for reads and writes.
5. Compare against the capacity of one machine/DB to see what must scale out.
6. State the decision each number drives.
:::

::: code javascript An estimation calculator (runnable)
function estimate({ dau, actionsPerUser, peakFactor = 3, bytesPerItem, readRatio, retentionDays, replicas = 3 }) {
  const perDay = dau * actionsPerUser;
  const avgWrite = perDay / 86400;
  const peakWrite = avgWrite * peakFactor;
  const storagePerDayGB = (perDay * bytesPerItem) / 1e9;
  const storageTotalTB = (storagePerDayGB * retentionDays * replicas) / 1e3;
  return { perDay, avgWrite: Math.round(avgWrite), peakWrite: Math.round(peakWrite), peakRead: Math.round(peakWrite * readRatio), storagePerDayGB: Math.round(storagePerDayGB), storageTotalTB: Math.round(storageTotalTB) };
}
const chat = estimate({ dau: 50e6, actionsPerUser: 40, bytesPerItem: 200, readRatio: 5, retentionDays: 365 });
console.log(chat);
const decisions = [];
if (chat.peakWrite > 10000) decisions.push('writes: partition/shard + batching or a log (Kafka)');
if (chat.peakRead > 100000) decisions.push('reads: cache recent conversations + replicas');
if (chat.storageTotalTB > 100) decisions.push('storage: tiering + retention policy, cheap cold storage');
decisions.forEach((d) => console.log(' →', d));
console.log(chat.avgWrite === 23148 && chat.storagePerDayGB === 400 ? '✅ ≈ 20k writes/s average and 400 GB/day' : '❌ FAIL');
console.log(decisions.length === 3 ? '✅ every number drove a design decision' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Spending 10 minutes on exact arithmetic; round to powers of 10.
- Using average QPS for capacity; design for peak.
- Forgetting replication, indexes and growth in storage.
- Estimating and then never using the numbers to justify a choice.
- Mixing bits and bytes, or per-second and per-day.
:::

::: understand
- Estimates are rough orders of magnitude whose only job is to tell you which parts must scale and how.
:::

::: ask
- *"What's the peak-to-average ratio, and how much history must we keep?"*
:::

::: important ⭐ Say this in the interview
"I estimate quickly with powers of ten: a day is about 10^5 seconds, so 2 billion messages a day is roughly 20,000 writes per second on average and maybe 60,000 at peak. At 200 bytes that's 400 GB a day, about 146 TB a year before replication. Those numbers tell me a single primary won't handle the writes, so I'd partition by conversation, cache recent reads and put a retention and tiering policy on storage."
:::

::: links
Latency numbers every programmer should know | https://gist.github.com/jboner/2841832
ByteByteGo: Back-of-the-envelope estimation | https://bytebytego.com/courses/system-design-interview/back-of-the-envelope-estimation
:::

=== How do you scale a web application horizontally? (stateless services, load balancing algorithms)
@p 3
@tags scalability, load-balancing, stateless, horizontal-scaling, nodejs
@quick
- **Vertical scaling** = a bigger machine (simple, has a ceiling and is a single point of failure). **Horizontal scaling** = more machines behind a **load balancer** (no ceiling, needs stateless instances).
- **Stateless**: any instance can serve any request. Sessions, caches, rate-limit counters, uploads and WebSocket rooms live in Redis/DB/S3, not in process memory.
- LB algorithms: round-robin, random, **least-connections**, weighted, consistent hashing (stickiness). Measured with 10% slow requests: **least-connections 601 req/s, p99 193 ms vs round-robin 516 req/s, p99 400 ms**.
- With one **degraded instance** (3× slower): round-robin dropped to **194 req/s, p99 1,174 ms**; least-connections kept **444 req/s, p99 378 ms** by sending it only 13% of traffic.
- **L4** LBs (TCP, NLB) are fast and protocol-agnostic; **L7** (HTTP: ALB, Nginx, Envoy) route by path/header, terminate TLS, retry. Health checks remove bad instances.

::: text 🧒 In simple words
One cashier can only go so fast. **Vertical scaling** is hiring a faster cashier; **horizontal scaling** is opening more tills. A good queue manager (load balancer) sends you to the till with the **shortest line**, not just the next one in order, especially when one cashier is slow today.
:::

::: text 📖 Detailed answer
### Measured: 3 Node backends behind a Node load balancer (CPU work, 10% slow requests)
| Backends | Algorithm | Requests/s | p50 | p99 | Traffic share |
|---|---|---|---|---|---|
| 3 equal | round-robin | 516 | 39 ms | 400 ms | 33/33/33% |
| 3 equal | random | 497 | 44 ms | 264 ms | 34/33/34% |
| 3 equal | least-connections | **601** | 48 ms | **193 ms** | 38/28/34% |
| 1 is 3× slower | round-robin | 194 | 24 ms | 1,174 ms | 33/33/33% |
| 1 is 3× slower | random | 189 | 28 ms | 980 ms | 33/33/34% |
| 1 is 3× slower | least-connections | **444** | 48 ms | **378 ms** | 43/45/13% |

Round-robin keeps sending a third of traffic to a struggling instance; least-connections notices it's busy.

### Algorithms
| Algorithm | Good for |
|---|---|
| round-robin / weighted | identical, short requests |
| least-connections / least-outstanding-requests | uneven request cost, mixed instance health (AWS ALB supports "least outstanding requests") |
| power of two random choices | large fleets: pick 2 at random, use the less loaded |
| consistent hashing on a key | cache locality, sticky sessions (use sparingly) |

### Making instances stateless
| State | Where it goes |
|---|---|
| sessions | signed cookies/JWT or Redis |
| cache | Redis/Memcached |
| rate-limit counters | Redis |
| uploaded files | S3 (pre-signed URLs) |
| WebSocket rooms | local, plus Redis pub/sub between instances |
| scheduled jobs | a queue or one elected scheduler |

### Autoscaling
Scale on CPU, request count per target or queue depth; keep a minimum of 2+ instances across availability zones; warm-up time and connection draining matter.
:::

::: diagram Stateless services behind a load balancer
flowchart LR
  U["users"] --> LB["L7 load balancer (health checks)"]
  LB --> A["api 1"]
  LB --> B["api 2"]
  LB --> C["api 3 (degraded: fewer requests)"]
  A --> R[("Redis: sessions, rate limits")]
  B --> R
  C --> R
  A --> DB[("database")]
  B --> DB
  C --> DB
:::

::: image Horizontal scaling and load balancing algorithms, measured
/images/system-design/load-balancing.svg
:::

::: text 🪜 Step by step
1. Find in-process state (memory sessions, local files, timers, in-memory caches) and move it out.
2. Put 2+ instances behind a load balancer with a health check (`/readyz`).
3. Prefer least-outstanding-requests when request costs vary.
4. Add autoscaling on a meaningful signal (CPU, RPS per instance, queue depth).
5. Enable connection draining so deploys and scale-in don't drop requests.
6. Load test and watch per-instance latency, not only averages.
:::

::: code javascript Load balancer algorithms compared in a simulation (runnable)
// Discrete-time simulation: 3 servers, one degraded. Requests cost 1 or 40 units; each server works 1 unit per tick (×1/3 when degraded).
function simulate(algorithm, speeds, ticks = 20000) {
  let seed = 42; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const queues = speeds.map(() => []); let rr = 0; const latencies = [];
  for (let t = 0; t < ticks; t++) {
    if (rnd() < 0.15) {                                                   // a request arrives
      const cost = rnd() < 0.1 ? 40 : 1;
      const i = algorithm === 'round-robin' ? rr++ % 3 : algorithm === 'random' ? Math.floor(rnd() * 3) : queues.map((q) => q.length).indexOf(Math.min(...queues.map((q) => q.length)));
      queues[i].push({ left: cost, start: t });
    }
    queues.forEach((q, i) => { if (q.length && (q[0].left -= speeds[i]) <= 0) latencies.push(t - q.shift().start); });
  }
  latencies.sort((a, b) => a - b);
  return { done: latencies.length, p50: latencies[Math.floor(latencies.length * 0.5)], p99: latencies[Math.floor(latencies.length * 0.99)] };
}
const res = {};
for (const algo of ['round-robin', 'random', 'least-connections']) { res[algo] = simulate(algo, [1, 1, 1 / 3]); console.log(algo.padEnd(18), res[algo]); }
console.log(res['least-connections'].p99 < res['round-robin'].p99 / 2 ? '✅ least-connections avoids the degraded server (same finding as the real measurement)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Keeping sessions in memory and "fixing" it with sticky sessions: uneven load and lost sessions on deploys.
- Health checks that always return 200 even when the instance can't reach its database.
- Round-robin with very uneven request costs (exports next to cheap reads).
- Scaling the app tier while the database is the real bottleneck.
- Autoscaling on CPU for an I/O-bound Node service (scale on latency, RPS or queue depth).
:::

::: understand
- Make instances stateless, then add more behind a load balancer that routes by load and health, not blindly in turn.
:::

::: ask
- *"What happens to a user's request if the instance that served their last request disappears?"*
:::

::: important ⭐ Say this in the interview
"I scale horizontally by making services stateless, moving sessions, caches, rate limits and files to Redis, the database and S3, and putting two or more instances behind a load balancer with health checks and autoscaling. The algorithm matters: in a measurement with uneven request costs, least-connections served 601 requests a second with a p99 of 193 ms versus 516 and 400 for round-robin, and with one degraded instance round-robin fell to 194 requests a second with a one-second p99 while least-connections kept 444 by routing around it."
:::

::: links
AWS: Application Load Balancer routing algorithms | https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html#modify-routing-algorithm
NGINX: HTTP load balancing | https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/
:::

=== How do you scale the database? (read replicas, partitioning, sharding, consistent hashing)
@p 3
@tags database, scalability, sharding, replication, partitioning, consistent-hashing
@quick
- Order: **query tuning and indexes → caching → read replicas → partitioning → bigger machine → sharding**. Sharding is the last resort.
- **Read replicas** scale reads; replication is usually async, so a user may not see their own write: route read-your-writes to the primary.
- **Partitioning** splits a big table inside one database (by month, by tenant): smaller indexes, instant `DROP` of old partitions.
- **Sharding** splits data across databases by a **shard key**. Pick it from the main access pattern; cross-shard joins and transactions become hard; watch **hot keys**.
- **Consistent hashing** limits data movement when adding nodes. Measured 4 → 5 shards: modulo moved **80%** of keys, a hash ring with 100 virtual nodes moved **24.4%** (ideal 20%) with even load.

::: text 🧒 In simple words
A library gets too busy. First you **organise the shelves** (indexes). Then you hand out **photocopies** of popular books (replicas). Then you split the archive **by year** in the same building (partitions). Finally you open **branch libraries** and decide which branch keeps which books (sharding). Consistent hashing means opening a new branch only moves a fair share of books, not almost all of them.
:::

::: text 📖 Detailed answer
### Techniques
| Technique | Scales | Cost |
|---|---|---|
| indexes, query fixes | everything | almost free |
| cache (Redis) | reads | invalidation, staleness |
| read replicas | reads | replication lag, routing |
| partitioning | big tables, maintenance | partition key in queries |
| vertical scaling | everything, up to a limit | price, single point |
| sharding | writes and storage | cross-shard queries, rebalancing, operations |

### Choosing a shard key
| Key | Good | Bad |
|---|---|---|
| user_id / tenant_id | per-user queries hit one shard | huge tenants become hot shards |
| conversation_id | chat history on one shard | — |
| created_at | — | all new writes hit one shard |
| hash(id) | even spread | range queries hit every shard |

### Measured: moving from 4 to 5 shards (100,000 keys)
| Placement | Keys moved | Load per node (min…max) |
|---|---|---|
| `hash(key) % N` | **80.0%** | even |
| hash ring, 1 point per node | 35.4% | 2,351…35,389 (very uneven) |
| hash ring, 100 virtual nodes | **24.4%** | 17,018…24,385 |

### Replication lag in practice
Write to the primary, then read from a replica 5 ms later → old value. Fixes: read from the primary for a short time after a write, use session tokens/LSNs, or accept staleness for non-critical reads.
:::

::: diagram Consistent hashing ring
flowchart LR
  K1["key user:42 → hash 0x3A"] --> RING["hash ring: 100 virtual points per node A, B, C, D"]
  RING -->|"next point clockwise"| NB["node B"]
  NEW["add node E (100 virtual points)"] --> RING
  RING -->|"only keys just before E's points move"| NE["≈ 1/5 of keys move to E"]
:::

::: image Scaling the database: replicas, partitions, shards, and measured key movement
/images/system-design/db-scaling.svg
:::

::: text 🪜 Step by step
1. Measure: slow query log, `EXPLAIN ANALYZE`, `pg_stat_statements`; fix indexes and N+1s.
2. Cache hot reads; add read replicas for read-heavy traffic, with read-your-writes routing.
3. Partition very large tables by time or tenant.
4. Scale the primary vertically while that's still cheap.
5. Shard only when writes or storage exceed one primary: pick the shard key from the main access pattern, use a directory or consistent hashing, plan rebalancing.
6. Handle hot keys separately (split counters, dedicated shards, caches).
:::

::: code sql Postgres declarative partitioning by month
CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id int NOT NULL,
  type text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_10 PARTITION OF events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE events_2026_11 PARTITION OF events FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE INDEX ON events (tenant_id, created_at);       -- created on every partition

-- queries with a created_at filter only touch matching partitions (partition pruning)
-- retention: drop a whole month instantly instead of DELETE + VACUUM
DROP TABLE events_2026_10;
:::

::: code javascript Consistent hashing with virtual nodes vs modulo (runnable)
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; }
function ring(nodes, vnodes) { const pts = []; for (const n of nodes) for (let v = 0; v < vnodes; v++) pts.push([hash(n + '#' + v), n]); return pts.sort((a, b) => a[0] - b[0]); }
function lookup(r, key) { const h = hash(key); let lo = 0, hi = r.length; while (lo < hi) { const m = (lo + hi) >> 1; if (r[m][0] < h) lo = m + 1; else hi = m; } return r[lo % r.length][1]; }
const keys = Array.from({ length: 100000 }, (_, i) => 'user:' + i);
const four = ['A', 'B', 'C', 'D'], five = [...four, 'E'];
const movedModulo = keys.filter((k) => hash(k) % 4 !== hash(k) % 5).length / keys.length;
const r4 = ring(four, 100), r5 = ring(five, 100);
const movedRing = keys.filter((k) => lookup(r4, k) !== lookup(r5, k)).length / keys.length;
const load = {}; keys.forEach((k) => { const n = lookup(r5, k); load[n] = (load[n] || 0) + 1; });
console.log(`modulo 4→5: ${(movedModulo * 100).toFixed(1)}% of keys moved`);
console.log(`ring with 100 vnodes 4→5: ${(movedRing * 100).toFixed(1)}% moved, load`, load);
console.log(movedModulo > 0.75 && movedRing < 0.3 ? '✅ consistent hashing moves ~1/N of keys instead of almost all' : '❌ FAIL');
console.log(Math.max(...Object.values(load)) / Math.min(...Object.values(load)) < 1.6 ? '✅ virtual nodes keep the load balanced' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Sharding first, before indexes, caching and replicas.
- A shard key that sends all new writes to one shard (timestamps, auto-increment ranges).
- Reading from a replica right after writing and showing the user stale data.
- `hash % N` placement: adding one node reshuffles almost everything.
- Ignoring the cost of cross-shard queries and transactions in the design.
:::

::: understand
- Scale reads with caches and replicas, big tables with partitions, and writes/storage with sharding on a key that matches the main access pattern.
:::

::: ask
- *"Which query runs most often, and which single key does it filter by?"* That's your shard key candidate.
:::

::: important ⭐ Say this in the interview
"I scale a database in steps: fix queries and indexes, cache hot reads, add read replicas while routing read-your-writes to the primary because replication is async, partition big tables by time or tenant, scale the primary vertically, and only then shard. The shard key comes from the main access pattern, like conversation id for chat, and I avoid keys that concentrate new writes. For placement I use consistent hashing with virtual nodes: in a test with 100,000 keys, going from four to five shards moved 80 percent of keys with modulo and about 24 percent with a ring, with balanced load."
:::

::: links
PostgreSQL: Table partitioning | https://www.postgresql.org/docs/current/ddl-partitioning.html
Consistent hashing (Karger et al., original paper) | https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf
:::

=== How do you design for high availability? (redundancy, single points of failure, multi-AZ, multi-region, RTO/RPO)
@p 2
@tags availability, reliability, redundancy, multi-region, disaster-recovery
@quick
- Availability **multiplies in series**: LB 99.99% × API 99.9% × DB 99.95% = **99.84%**. Every hard dependency lowers it.
- **Redundancy** raises it: two independent 99% instances = 1 - 0.01² = **99.99%**.
- Remove **single points of failure**: ≥2 instances in different AZs, managed LB, DB with automatic failover, replicated queues/caches.
- **Multi-AZ** is the default for production; **multi-region** is for surviving a whole region outage or serving global users, at real cost and complexity.
- Define **RTO** (time to recover) and **RPO** (data you may lose); test backups and failovers regularly.

::: text 🧒 In simple words
A chain is only as strong as its weakest link, and every extra link is another chance to break (**series**). Having two ropes side by side means one can snap and you still hang on (**parallel**). High availability is about having two ropes everywhere it matters, and practising what happens when one snaps.
:::

::: text 📖 Detailed answer
### The maths
| Setup | Availability | Downtime per 30 days |
|---|---|---|
| one component at 99.9% | 99.9% | 43 min |
| three in series (99.99, 99.9, 99.95) | 99.84% | ~70 min |
| two in parallel at 99% | 99.99% | ~4 min |

So: make dependencies **optional** where possible (degrade instead of fail), and **duplicate** the ones you can't avoid.

### Levels of redundancy
| Level | Survives | Typical setup |
|---|---|---|
| multiple instances | process/VM crash | 2+ app instances, autoscaling |
| multi-AZ | datacenter loss | instances in 2–3 AZs, RDS Multi-AZ, ElastiCache replicas |
| multi-region active-passive | region loss | async replica + infrastructure ready; failover in minutes; RPO > 0 |
| multi-region active-active | region loss with no failover | data partitioned or conflict-resolved; hardest |

### RTO and RPO
| Term | Question | Example target |
|---|---|---|
| RTO | how long until we're back? | 15 minutes |
| RPO | how much recent data can we lose? | 5 minutes (point-in-time recovery) |

### Practices
- Health checks + automatic replacement; graceful shutdown for deploys.
- Timeouts, retries with jitter, circuit breakers so one dependency can't take everything down.
- Backups with **restore tests**; infrastructure as code so you can rebuild.
- Game days / chaos experiments: kill an instance, fail over the DB, block a dependency.
:::

::: diagram Multi-AZ deployment
flowchart TB
  LB["managed load balancer (spans AZs)"] --> A1["api AZ-a"]
  LB --> A2["api AZ-b"]
  A1 --> P[("DB primary AZ-a")]
  A2 --> P
  P -->|"sync replication"| S[("DB standby AZ-b")]
  S -.->|"automatic failover"| P
:::

::: image Availability: series vs parallel, multi-AZ, multi-region, RTO and RPO
/images/system-design/availability.svg
:::

::: text 🪜 Step by step
1. Draw the request path and list every component it depends on.
2. Multiply their availabilities; find single points of failure.
3. Duplicate critical components across AZs; make non-critical dependencies optional with fallbacks.
4. Set RTO/RPO with the business; choose backups, replicas and regions accordingly.
5. Automate failover and recovery; write runbooks.
6. Test it: restore a backup, kill an AZ in staging, run game days.
:::

::: code javascript Availability calculator: series, parallel, and the effect of a fallback (runnable)
const series = (...a) => a.reduce((x, y) => x * y, 1);
const parallel = (...a) => 1 - a.reduce((x, y) => x * (1 - y), 1);
const minutesDown = (av, days = 30) => +((1 - av) * days * 24 * 60).toFixed(1);
const path = series(0.9999, 0.999, 0.9995);
const redundantApi = series(0.9999, parallel(0.999, 0.999), 0.9995);
const withRecs = series(path, 0.995);                     // product page hard-depends on recommendations
const recsOptional = path;                                 // recommendations fail → page renders without them
console.log(`LB × API × DB: ${(path * 100).toFixed(3)}% (${minutesDown(path)} min/30 days)`);
console.log(`two API instances: ${(redundantApi * 100).toFixed(3)}% (${minutesDown(redundantApi)} min)`);
console.log(`+ hard dependency on recommendations (99.5%): ${(withRecs * 100).toFixed(3)}% (${minutesDown(withRecs)} min)`);
console.log(Math.abs(path - 0.9984) < 0.0001 ? '✅ series: 99.84%' : '❌ FAIL');
console.log(minutesDown(withRecs) > 3 * minutesDown(recsOptional) ? '✅ making a non-critical dependency optional removes most of the downtime it would add' : '❌ FAIL');
console.log(parallel(0.99, 0.99) > 0.9998 ? '✅ two 99% instances in parallel ≈ 99.99%' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- One NAT gateway, one Redis node or one cron server quietly becoming a single point of failure.
- Backups that were never restored.
- Multi-region on the slide, but data replication, DNS failover and runbooks never tested.
- Treating every dependency as critical instead of degrading gracefully.
- Health checks that report healthy while the app can't serve.
:::

::: understand
- Every dependency in the path multiplies risk; redundancy, optional dependencies and tested recovery raise availability.
:::

::: ask
- *"Which single component, if it disappeared right now, would take the whole product down?"*
:::

::: important ⭐ Say this in the interview
"Availability multiplies along the request path: a 99.99 percent load balancer, a 99.9 percent API and a 99.95 percent database give about 99.84 percent, around 70 minutes of downtime a month, while two independent 99 percent instances in parallel give 99.99. So I remove single points of failure with multiple instances across availability zones, a database with automatic failover and replicated caches and queues, make non-critical dependencies optional with fallbacks, agree RTO and RPO with the business, and regularly test backups and failovers. Multi-region is for when the business needs to survive a region loss."
:::

::: links
AWS Well-Architected: Reliability pillar | https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html
Google SRE book: Embracing risk | https://sre.google/sre-book/embracing-risk/
:::
