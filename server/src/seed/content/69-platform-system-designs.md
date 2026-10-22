@section System Design: Platform & Data (Node.js)
@icon 🏢
@color #0ea5e9
@desc Platform-level system designs with measured building blocks: an API gateway (measured hop cost), a multi-tenant SaaS backend (measured tenant indexes and Postgres row-level security), and an analytics / event tracking pipeline with dashboards (measured batched ingest and rollup cardinality).

=== Design an API gateway (routing, quotas, request ids, config, high availability)
@p 2
@tags system-design, api-gateway, nodejs, rate-limiting, routing, platform
@quick
- **Requirements**: one entry point for web, mobile and partner clients; route to many services; check tokens/API keys; per-plan **quotas and rate limits**; request ids and tracing; response caching; hot-reloadable config; very high availability and low added latency.
- **Data plane**: stateless gateway instances behind an L4 load balancer; keep-alive connection pools per upstream; timeouts, retries (idempotent only) and circuit breakers per route.
- **Control plane**: routes, plans, API keys and limits in a config store, validated and versioned, pushed or polled; counters in **Redis**.
- Measured: a small Node gateway hop (route table, request id, keep-alive pool) moved the median from **0.12 ms to 0.19 ms**; the cost is tiny compared with the services behind it.
- Keep it **thin**: no business logic. **Buy before build** (Kong, Envoy, AWS API Gateway, Apigee); build only for special needs.

::: text 🧒 In simple words
A gateway is the **front desk of a big office building**. It checks your badge, tells you which floor to go to, makes sure you don't make 1,000 visits a minute, and stamps a visitor number on you so security can follow your path. It never does the actual work of the departments upstairs.
:::

::: text 📖 Detailed answer
### Responsibilities
| Concern | Gateway does | Not the gateway's job |
|---|---|---|
| routing | path/host/header → service, versions, canary weights | business decisions |
| identity | verify token signature/expiry or API key, pass identity downstream | per-resource permissions |
| traffic | quotas per plan, rate limits, concurrency limits, body size limits | — |
| resilience | timeouts, idempotent retries, breakers per upstream | compensating business actions |
| observability | request id, `traceparent`, access logs, RED metrics per route | — |
| transforms | header rewrites, small response shaping (or a BFF) | aggregating domain logic |

### Architecture
| Part | Design |
|---|---|
| data plane | N stateless instances, autoscaled, behind NLB; config in memory |
| control plane | admin API + config store (Postgres/etcd/S3) with validation and versioning |
| config delivery | instances poll every few seconds or subscribe; atomic swap; keep last good config |
| shared state | Redis for quota counters (fail-open for normal traffic) |
| deploys | canary new gateway versions; config changes canaried too |

### Measured: one gateway hop (Node 22, localhost)
| Path | Median single request | Throughput (20 connections) |
|---|---|---|
| direct to the service | 0.12 ms | 108,864 req/s |
| through the Node gateway | 0.19 ms | 32,111 req/s |
| through Nginx in Docker Desktop | 0.48 ms | 16,119 req/s (Docker VM network in between) |

The gateway needs fewer instances per unit of traffic than the services behind it, but it must be the **most available** component: it sits in front of everything.
:::

::: diagram Gateway data plane and control plane
flowchart LR
  C["clients"] --> NLB["L4 load balancer"]
  NLB --> G1["gateway 1"]
  NLB --> G2["gateway 2"]
  G1 --> SVC1["orders service"]
  G1 --> SVC2["users service"]
  G2 --> SVC1
  G2 --> SVC2
  G1 --> R[("Redis quota counters")]
  G2 --> R
  ADMIN["admin API"] --> CFG[("config store: routes, plans, keys")]
  CFG -->|"poll / push, atomic swap"| G1
  CFG -->|"poll / push, atomic swap"| G2
:::

::: image API gateway design with measured hop cost
/images/system-design/api-gateway.svg
:::

::: text 🪜 Step by step
1. Clarify clients, routes, identity methods, plans and latency budget.
2. Stateless data plane with route table, keep-alive pools, timeouts and breakers per upstream.
3. Identity check and quotas in front of routing (Redis counters, per plan).
4. Add request id + trace propagation, access logs and per-route metrics.
5. Control plane with validated, versioned config and safe hot reload.
6. Discuss HA (multi-AZ, no single Redis dependency for availability), canaries and buy-vs-build.
:::

::: code javascript A minimal Node gateway: route table, request ids, keep-alive pools, timeouts
const http = require('http');
const { randomUUID } = require('crypto');

let config = { routes: [{ prefix: '/api/orders', host: 'orders.internal', port: 3000, timeoutMs: 2000 }, { prefix: '/api/users', host: 'users.internal', port: 3000, timeoutMs: 1000 }] };
const pools = new Map();                                              // one keep-alive pool (bulkhead) per upstream
const poolFor = (r) => pools.get(r.host) ?? pools.set(r.host, new http.Agent({ keepAlive: true, maxSockets: 200 })).get(r.host);

function reloadConfig(next) {                                         // validate, then atomically swap
  if (!Array.isArray(next.routes) || next.routes.some((r) => !r.prefix || !r.host)) throw new Error('invalid config');
  config = next;
}

http.createServer((req, res) => {
  const route = config.routes.filter((r) => req.url.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!route) { res.writeHead(404); return res.end(); }
  const requestId = req.headers['x-request-id'] || randomUUID();
  const upstream = http.request({
    host: route.host, port: route.port, path: req.url, method: req.method, agent: poolFor(route), timeout: route.timeoutMs,
    headers: { ...req.headers, 'x-request-id': requestId, 'x-forwarded-for': req.socket.remoteAddress },
  }, (up) => { res.writeHead(up.statusCode, { ...up.headers, 'x-request-id': requestId }); up.pipe(res); });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => { if (!res.headersSent) { res.writeHead(504, { 'x-request-id': requestId }); } res.end(); });
  req.pipe(upstream);
}).listen(8080);

module.exports = { reloadConfig };
:::

::: code javascript Route matching and per-plan quotas (runnable)
// Longest-prefix routing plus a per-API-key fixed-window quota that depends on the customer's plan.
const routes = [{ prefix: '/api', service: 'monolith' }, { prefix: '/api/orders', service: 'orders' }, { prefix: '/api/orders/export', service: 'exports' }];
const route = (path) => routes.filter((r) => path.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0]?.service ?? null;
const plans = { free: 5, pro: 50 };
const keys = { 'key-free': 'free', 'key-pro': 'pro' };
const counters = new Map();
function admit(apiKey, minute) {
  const plan = keys[apiKey]; if (!plan) return 401;
  const k = `${apiKey}:${minute}`; const n = (counters.get(k) || 0) + 1; counters.set(k, n);
  return n <= plans[plan] ? 200 : 429;
}
console.log(route('/api/orders/7'), route('/api/orders/export/csv'), route('/api/users/1'), route('/health'));
console.log(route('/api/orders/export/csv') === 'exports' && route('/health') === null ? '✅ longest prefix wins, unknown paths 404' : '❌ FAIL');
const free = Array.from({ length: 8 }, () => admit('key-free', 1)), pro = Array.from({ length: 8 }, () => admit('key-pro', 1));
console.log('free plan:', free.join(' '), '| pro plan:', pro.join(' '), '| unknown key:', admit('nope', 1));
console.log(free.filter((s) => s === 429).length === 3 && pro.every((s) => s === 200) ? '✅ quotas follow the plan' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Business logic and data aggregation creeping into the gateway until it's a monolith everyone must deploy.
- A gateway that hard-fails when Redis is unavailable (quota store becomes a single point of failure).
- Retrying non-idempotent requests at the gateway.
- Config changes deployed without validation or rollback ("one typo routed everything to 404").
- No per-route timeouts: one slow service ties up all gateway sockets.
:::

::: understand
- A gateway is a thin, highly available traffic layer: identity, quotas, routing, resilience and observability, configured separately from its code.
:::

::: ask
- *"If the gateway's config store or Redis is down, does traffic keep flowing?"*
:::

::: important ⭐ Say this in the interview
"The gateway is a thin, stateless data plane behind an L4 load balancer: it verifies tokens or API keys, applies per-plan quotas with counters in Redis, routes by longest path prefix to services through keep-alive pools with per-route timeouts and circuit breakers, and adds request ids and trace context. A separate control plane stores routes, plans and keys, validates and versions them, and instances hot-swap config while keeping the last good version. A gateway hop measured well under a millisecond, so the priorities are availability, safe config changes and keeping business logic out. In practice I'd start with Kong, Envoy or a cloud API gateway."
:::

::: links
Envoy proxy: What is Envoy | https://www.envoyproxy.io/docs/envoy/latest/intro/what_is_envoy
microservices.io: API gateway pattern | https://microservices.io/patterns/apigateway.html
:::

=== Design a multi-tenant SaaS backend (tenant isolation, data model, noisy neighbours)
@p 3
@tags system-design, multi-tenant, saas, postgres, row-level-security, isolation
@quick
- **Tenancy models**: shared DB + `tenant_id` on every row (cheapest), schema per tenant, database per tenant (strongest isolation, highest cost). Many SaaS use a **hybrid**: pooled for small tenants, dedicated for the largest.
- Every query must be scoped by tenant: resolve the tenant from the authenticated user, pass it through request context, and back it up with **Postgres row-level security**. Measured: a query that **forgot** the filter still saw **only one tenant's rows**.
- Index with **`tenant_id` first**: "latest 20 events" for a small tenant went from **100 ms** (index on `created_at` only) to **0.37 ms** (`(tenant_id, created_at)`).
- **Noisy neighbours**: per-tenant rate limits, quotas, queue fairness, and moving very large tenants to dedicated resources.
- Tenant id in **logs, metrics, cache keys, object storage paths and background jobs**; plans and feature flags per tenant; per-tenant export/delete.

::: text 🧒 In simple words
A SaaS is an **apartment building**: tenants share the building (servers, database) but each has their own locked flat. Row-level security is the **lock on each door** that works even if someone forgets to check the name on the mailbox. A noisy neighbour is the tenant who throws a party every night; you give them soundproofing limits or, if they're huge, their own house.
:::

::: text 📖 Detailed answer
### Tenancy models
| Model | Isolation | Cost and ops | Good for |
|---|---|---|---|
| shared schema (`tenant_id` column) | logical (code + RLS) | lowest; one migration | many small tenants |
| schema per tenant | medium | migrations × N, catalog bloat at thousands | hundreds of mid-size tenants |
| database per tenant | strong; per-tenant backup/region | highest; fleet management | few large/regulated tenants |
| hybrid | per tier | moderate | most growing SaaS products |

### Measured on Postgres 17 (5M events, 1,000 tenants, skewed sizes)
| Query | Index | Time |
|---|---|---|
| latest 20 for big tenant 1 | `created_at` only | 1.43 ms |
| latest 20 for big tenant 1 | `(tenant_id, created_at desc)` | 0.42 ms |
| latest 20 for small tenant (2,654 rows) | `created_at` only | **100.4 ms** (walks newest rows of all tenants) |
| latest 20 for small tenant | `(tenant_id, created_at desc)` | **0.37 ms** |
| same with RLS policy active | composite + RLS | 0.42 ms |
| query with **no** tenant filter under RLS | RLS | 0.30 ms, **1 tenant, 2,654 rows visible** |

### Scoping every request
1. Authenticate → resolve `tenant_id` (from the token/session, never from a request parameter alone).
2. Store it in request context (AsyncLocalStorage).
3. The repository adds `WHERE tenant_id = $1`; the DB session sets `app.tenant_id` (transaction-local) so RLS enforces it too.
4. Background jobs carry `tenant_id` in their payload and set the same context.

### Noisy neighbours and fairness
| Resource | Control |
|---|---|
| API | per-tenant rate limits and concurrency limits |
| jobs | per-tenant queues or fair scheduling (round-robin across tenants) |
| storage | quotas per plan |
| DB | statement timeouts, move whales to their own DB/shard |
| cost | per-tenant usage metering for billing |
:::

::: diagram Request scoping with defence in depth
flowchart LR
  REQ["request + token"] --> AUTH["auth: resolve tenant_id from the user"]
  AUTH --> CTX["request context (AsyncLocalStorage)"]
  CTX --> REPO["repository: WHERE tenant_id = $1"]
  CTX --> TX["transaction: SET LOCAL app.tenant_id"]
  REPO --> DB[("Postgres with RLS policy")]
  TX --> DB
  CTX --> LOG["logs, metrics, cache keys include tenant_id"]
:::

::: image Multi-tenant SaaS design with measured indexes and RLS
/images/system-design/multi-tenant.svg
:::

::: text 🪜 Step by step
1. Clarify tenant count and size distribution, isolation/compliance needs, regions, plans.
2. Choose the model (usually shared schema + RLS, with an escape hatch for big tenants).
3. Add `tenant_id` to every tenant-owned table, lead indexes and unique constraints with it.
4. Scope requests via context + repository filters + RLS; carry tenant in jobs and events.
5. Add per-tenant limits, fair queues, quotas, metering and feature flags.
6. Support per-tenant export, deletion, backup/restore and moving a tenant to dedicated infrastructure.
:::

::: code sql Shared schema with tenant-first indexes and row-level security
CREATE TABLE projects (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id int NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, name)                         -- names unique per tenant, not globally
);
CREATE INDEX ON projects (tenant_id, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (tenant_id = current_setting('app.tenant_id')::int)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::int);

-- the application connects as a non-owner role (owners bypass RLS unless FORCE is set)
-- per transaction:  BEGIN; SET LOCAL app.tenant_id = '42'; …queries…; COMMIT;
:::

::: code javascript Tenant context with AsyncLocalStorage and a scoped repository
const { AsyncLocalStorage } = require('async_hooks');
const tenantContext = new AsyncLocalStorage();

function tenantMiddleware(req, res, next) {
  const tenantId = req.user?.tenantId;                       // from the verified session/token
  if (!tenantId) return res.status(401).json({ error: 'unauthenticated' });
  tenantContext.run({ tenantId }, next);
}

async function withTenantTx(pool, fn) {
  const { tenantId } = tenantContext.getStore();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);   // transaction-local
    const result = await fn(client, tenantId);
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

const projectsRepo = (pool) => ({
  list: () => withTenantTx(pool, (c, tenantId) => c.query('SELECT id, name FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50', [tenantId]).then((r) => r.rows)),
});
module.exports = { tenantMiddleware, projectsRepo, tenantContext };
:::

::: code javascript Fair scheduling across tenants (runnable)
// One big tenant enqueues 1,000 jobs, two small tenants 5 each. FIFO makes the small ones wait; round-robin per tenant doesn't.
function fifo(jobs) { return jobs.map((j, i) => ({ ...j, position: i })); }
function roundRobin(jobs) {
  const queues = new Map(); jobs.forEach((j) => (queues.get(j.tenant) ?? queues.set(j.tenant, []).get(j.tenant)).push(j));
  const out = []; let active = [...queues.keys()];
  while (active.length) { active = active.filter((t) => { const q = queues.get(t); if (q.length) out.push({ ...q.shift(), position: out.length }); return q.length > 0; }); }
  return out;
}
const jobs = [...Array.from({ length: 1000 }, (_, i) => ({ tenant: 'whale', id: i })), ...Array.from({ length: 5 }, (_, i) => ({ tenant: 'small-a', id: i })), ...Array.from({ length: 5 }, (_, i) => ({ tenant: 'small-b', id: i }))];
const lastPos = (order, tenant) => Math.max(...order.filter((j) => j.tenant === tenant).map((j) => j.position));
const f = fifo(jobs), r = roundRobin(jobs);
console.log(`small-a finishes at position: FIFO ${lastPos(f, 'small-a')}, round-robin ${lastPos(r, 'small-a')}`);
console.log(lastPos(f, 'small-a') > 1000 && lastPos(r, 'small-a') < 20 ? '✅ per-tenant fairness stops one big tenant from starving the others' : '❌ FAIL');
console.log(lastPos(r, 'whale') === 1009 ? '✅ the big tenant still gets all its work done' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Trusting a `tenantId` sent by the client instead of deriving it from the authenticated user.
- One missing `WHERE tenant_id` in a report query leaks another customer's data (RLS is the safety net).
- Indexes that don't start with `tenant_id` (measured 270× slower for small tenants).
- Cache keys without the tenant (`products:list` served to every tenant).
- Global unique constraints that should be per tenant (`UNIQUE (email)` vs `UNIQUE (tenant_id, email)`).
:::

::: understand
- Derive the tenant from identity, scope every layer by it, enforce it in the database too, and keep tenants from hurting each other's performance.
:::

::: ask
- *"Which tenant is the biggest, how big compared to the median, and do any need data residency or a dedicated database?"*
:::

::: important ⭐ Say this in the interview
"I'd usually start with a shared schema where every tenant-owned table has tenant_id, keep the option to move the largest tenants to dedicated databases, and use schema- or database-per-tenant only for strict isolation needs. The tenant comes from the authenticated user, goes into request context, every repository query filters by it and the transaction sets app.tenant_id so Postgres row-level security enforces it too; in a test a query that forgot the filter still saw only one tenant's rows. Indexes and unique constraints lead with tenant_id, which took a small tenant's query from 100 ms to 0.4 ms. Per-tenant rate limits, fair job scheduling, quotas and tenant ids in logs, metrics and cache keys handle noisy neighbours and operations."
:::

::: links
AWS: SaaS tenant isolation strategies | https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html
PostgreSQL: Row security policies | https://www.postgresql.org/docs/current/ddl-rowsecurity.html
:::

=== Design an analytics / event tracking pipeline with dashboards
@p 3
@tags system-design, analytics, event-tracking, rollups, postgres, kafka, nodejs
@quick
- **Requirements**: collect events from web/mobile/backend (page views, clicks, purchases), dashboards with filters over days to months, near-real-time (minutes) freshness, cheap storage of raw events, no data loss on spikes.
- **Ingest**: SDK batches events → ingest API validates and returns **202** fast → **queue/Kafka** buffers spikes → **batch writers**. Measured: **4,418 rows/s** single INSERTs vs **231,705 rows/s** in 1,000-row batches (52×).
- **Storage**: raw events partitioned by time (cheap, replayable) + **rollup tables** for dashboards; at large scale a columnar store (ClickHouse, BigQuery, Druid).
- **Rollup cardinality decides everything**: dashboard query on 5M raw events **337 ms**; rollup by hour × tenant × type × country (4.35M rows) only **150 ms**; rollup by hour × type × country (38,895 rows) **3 ms (112×)**.
- Refresh rollups **incrementally** (last 2 hourly buckets: 115 ms), dedupe by event id, handle late events, and keep raw data so rollups can be rebuilt.

::: text 🧒 In simple words
Raw events are **every single receipt** from a supermarket: you keep them all in boxes. Dashboards don't read every receipt; they read a **summary sheet** ("sales per hour per country"). The trick is choosing the sheet's columns: if you add "per customer", the summary becomes as long as the receipts and saves nothing.
:::

::: text 📖 Detailed answer
### 1. Requirements and estimates
| Item | Assumption | Result |
|---|---|---|
| events | 500M/day from 1,000 tenants | ~6k/s avg, ~30k/s peak |
| size | ~300 B | ~150 GB/day raw → compress, partition, retention |
| dashboards | last 30–90 days, filters by type/country/tenant | must not scan raw data per view |
| freshness | < 5 min | incremental rollups or streaming aggregation |

### 2. Pipeline
| Stage | Design |
|---|---|
| SDK | batch every few seconds or 50 events, retry with backoff, `event_id` (uuid) for dedupe, client timestamp + server timestamp |
| ingest API | validate schema, enrich (tenant, geo), push to queue, return 202; never write to the DB synchronously |
| queue | Kafka/Kinesis/SQS: absorbs spikes, replayable |
| writer | batch 1,000 rows or 1 s; `ON CONFLICT (event_id) DO NOTHING` |
| raw store | time-partitioned table or object storage (Parquet) |
| rollups | per hour/day by the dimensions dashboards filter on |
| serving | dashboard API reads rollups; cache popular queries |

### Measured on Postgres 17
| Operation | Result |
|---|---|
| ingest, one INSERT per event | 4,418 rows/s |
| ingest, 1,000-row multi-row INSERT | 215,656 rows/s |
| ingest, `unnest` arrays, 1,000 per batch | 231,705 rows/s |
| revenue per country per day, last 30 days, raw 5M events | 337 ms |
| same from rollup (hour, tenant, type, country): 4.35M rows | 150 ms |
| same from rollup (hour, type, country): 38,895 rows, built in 1.7 s | **3.0 ms** |
| per-tenant dashboard, largest tenant: raw vs tenant rollup | 141.9 ms vs 6.3 ms |
| incremental refresh of the last 2 hourly buckets | 115 ms |

### Deep dives
- **Late events**: recompute the last N buckets each run; or watermarks in stream processing.
- **Unique counts** (daily active users): HyperLogLog sketches in rollups instead of storing user ids.
- **Scale**: columnar warehouses compress 5–10× and scan billions of rows per second; Postgres works well to tens/hundreds of millions of rows with rollups.
- **Privacy**: minimise personal data, retention limits, per-tenant deletion.
:::

::: diagram Event tracking pipeline
flowchart LR
  SDK["SDKs: web, mobile, backend"] -->|"batches + event_id"| ING["ingest API (validate, 202)"]
  ING --> Q["Kafka / Kinesis / SQS"]
  Q --> WR["batch writers (1,000 rows)"]
  WR --> RAW[("raw events, partitioned by day")]
  RAW --> ROLL["incremental rollup job (every 1–5 min)"]
  ROLL --> AGG[("hourly rollups (low cardinality)")]
  AGG --> API["dashboard API + cache"]
  API --> DASH["dashboards"]
:::

::: image Analytics pipeline design with measured ingest and rollups
/images/system-design/analytics.svg
:::

::: text 🪜 Step by step
1. Clarify events, volume, freshness, dashboard dimensions and retention.
2. SDK batching with event ids; ingest API validates, enriches and enqueues (202).
3. Batch writers insert idempotently into time-partitioned raw storage.
4. Design rollups from the dashboard's filters (low cardinality); refresh incrementally, handle late data.
5. Dashboard API reads rollups with caching; heavy ad-hoc analysis goes to a warehouse.
6. Discuss scale (columnar stores), unique counts (HLL), privacy and backfills.
:::

::: code javascript Ingest endpoint and batch writer (Node.js + Express + pg)
const express = require('express');
const { Pool } = require('pg');
const { z } = require('zod');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

const Event = z.object({ eventId: z.string().uuid(), type: z.string().max(64), ts: z.coerce.date(), props: z.record(z.string(), z.unknown()).optional() });
const Batch = z.object({ events: z.array(Event).min(1).max(500) });

let buffer = [];
const app = express();
app.use(express.json({ limit: '512kb' }));
app.post('/v1/events', (req, res) => {
  const parsed = Batch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid batch' });
  const tenantId = req.tenantId;                                 // set by API-key middleware
  for (const e of parsed.data.events) buffer.push([e.eventId, tenantId, e.type, e.ts, JSON.stringify(e.props ?? {})]);
  if (buffer.length >= 1000) flush().catch(console.error);       // in production: publish to a queue instead of an in-memory buffer
  res.status(202).end();
});

async function flush() {
  if (!buffer.length) return;
  const rows = buffer; buffer = [];
  const col = (i) => rows.map((r) => r[i]);
  await pool.query(
    `INSERT INTO events (event_id, tenant_id, type, created_at, props)
     SELECT * FROM unnest($1::uuid[], $2::int[], $3::text[], $4::timestamptz[], $5::jsonb[])
     ON CONFLICT (event_id, created_at) DO NOTHING`,
    [col(0), col(1), col(2), col(3), col(4)],
  );
}
setInterval(() => flush().catch(console.error), 1000);
app.listen(3000);
:::

::: code sql Incremental rollup: recompute only the latest buckets
-- rollup keyed by the dimensions dashboards filter on (keep cardinality low)
CREATE TABLE events_hourly (
  bucket timestamptz NOT NULL,
  type text NOT NULL,
  country text NOT NULL,
  n bigint NOT NULL,
  amount_cents bigint NOT NULL,
  PRIMARY KEY (bucket, type, country)
);

-- run every few minutes: rebuild the last 2 hours (covers late events), idempotently
BEGIN;
DELETE FROM events_hourly WHERE bucket >= date_trunc('hour', now()) - interval '1 hour';
INSERT INTO events_hourly
SELECT date_trunc('hour', created_at), type, country, count(*), sum(amount_cents)
FROM events
WHERE created_at >= date_trunc('hour', now()) - interval '1 hour'
GROUP BY 1, 2, 3;
COMMIT;
:::

::: code javascript Rollup cardinality: why the choice of dimensions matters (runnable)
// 1,000 tenants × 3 types × 6 countries × 24*90 hours: how many rollup rows could exist, and how many rows does a 30-day query read?
const dims = { tenants: 1000, types: 3, countries: 6, hours: 24 * 90 + 1 };            // 90 days span 2,161 hourly buckets
const fine = dims.tenants * dims.types * dims.countries * dims.hours;            // upper bound
const coarse = dims.types * dims.countries * dims.hours;
const rawEvents = 5_000_000;
console.log(`possible rows: hour×tenant×type×country = ${fine.toLocaleString()}, hour×type×country = ${coarse.toLocaleString()}`);
console.log(`measured: fine rollup had 4,351,088 rows (raw 5,000,000) → ${(4351088 / rawEvents * 100).toFixed(0)}% of raw: barely smaller`);
console.log(`measured: coarse rollup had 38,895 rows → ${(38895 / rawEvents * 100).toFixed(2)}% of raw (${coarse.toLocaleString()} possible)`);
console.log(fine > rawEvents && coarse < rawEvents / 100 ? '✅ a rollup only helps when its key space is much smaller than the event count' : '❌ FAIL');
// HyperLogLog-style idea for unique users: keep a small sketch per bucket instead of every user id (approximation shown with a simple bitmap of hashes)
const users = Array.from({ length: 20000 }, (_, i) => 'u' + (i % 7000));                 // 20k events from 7,000 distinct users
const h = (s) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return x >>> 0; };
const m = 1 << 14; const bits = new Uint8Array(m); users.forEach((u) => { bits[h(u) % m] = 1; });
const zeros = bits.filter((b) => b === 0).length; const estimate = Math.round(-m * Math.log(zeros / m));        // linear counting
console.log(`distinct users: exact 7000, estimated ${estimate} from a ${m / 8 / 1024} KB sketch`);
console.log(Math.abs(estimate - 7000) / 7000 < 0.03 ? '✅ sketches estimate unique counts within a few percent in tiny space' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Writing each event synchronously to the database in the request path.
- Dashboards that aggregate raw events on every page load.
- Rollups keyed by high-cardinality dimensions (user, session, tenant × everything): as big as the raw data.
- No event ids: retries and replays double-count.
- Rollups that can't be rebuilt because raw events were thrown away.
:::

::: understand
- Buffer and batch on the way in, keep raw events, and serve dashboards from low-cardinality, incrementally refreshed rollups.
:::

::: ask
- *"Which filters and time ranges do dashboards actually use, and how fresh must they be?"*
:::

::: important ⭐ Say this in the interview
"SDKs batch events with an event id; an ingest API validates, enriches with tenant and returns 202, and pushes to Kafka or a queue so spikes don't hit the database. Batch writers insert idempotently into time-partitioned raw storage: I measured about 230,000 rows a second with 1,000-row batches versus 4,400 with single inserts. Dashboards read rollups keyed by the dimensions they filter on, refreshed incrementally every few minutes to include late events. Cardinality decides whether that works: a rollup by hour, tenant, type and country was almost as big as the raw data and only 2× faster, while hour, type and country had 39,000 rows and answered in 3 ms instead of 337. At larger scale I'd move to a columnar store like ClickHouse or BigQuery."
:::

::: links
ClickHouse: Why is ClickHouse so fast | https://clickhouse.com/docs/concepts/why-clickhouse-is-so-fast
Segment: Analytics.js event spec | https://segment.com/docs/connections/spec/
:::
