@section Logging, Monitoring & Observability
@icon 📈
@color #f97316
@desc Running Node.js services you can understand in production: logs vs metrics vs traces and what to measure (RED, USE, golden signals), structured logging with pino (measured vs console.log and winston), Prometheus metrics (measured overhead), distributed tracing with OpenTelemetry (a measured trace across two services and Postgres in Jaeger), and SLOs, error budgets, alerting and debugging a slow API.

=== What is observability? Logs vs metrics vs traces, and what should you monitor?
@p 3
@tags observability, monitoring, logging, metrics, tracing, red, use
@quick
- **Logs**: timestamped events with detail ("payment failed for order 7"). **Metrics**: numbers over time (requests/s, error %, p99 latency), cheap to store, good for dashboards and alerts. **Traces**: the path and timing of one request across services.
- **Monitoring** answers known questions (dashboards, alerts). **Observability** lets you answer **new** questions from the telemetry you already emit.
- **RED** for every service: **R**ate, **E**rrors, **D**uration. **USE** for every resource: **U**tilisation, **S**aturation, **E**rrors. Google's **golden signals**: latency, traffic, errors, saturation.
- Node.js extras: **event-loop delay**, heap used, GC pauses, DB pool waiting count, queue depth.
- Link the three: put the **trace id** in every log line and use **exemplars** to jump from a metric spike to a trace.

::: text 🧒 In simple words
Running a service is like flying a plane. **Metrics** are the cockpit gauges (speed, fuel). **Logs** are the flight diary ("engine 2 warning at 10:42"). **Traces** are a replay of one passenger's journey through every airport. Observability means that when something strange happens, you can work out *why* without adding new instruments first.
:::

::: text 📖 Detailed answer
### The three signals
| | Logs | Metrics | Traces |
|---|---|---|---|
| Shape | events with fields | numeric time series with labels | tree of timed spans per request |
| Answers | what exactly happened? | how much, how often, is it getting worse? | where did the time go, which service failed? |
| Cost | high (volume) | low (aggregated) | medium (sample) |
| Tools | Loki, ELK/OpenSearch, CloudWatch Logs | Prometheus + Grafana, CloudWatch, Datadog | OpenTelemetry → Jaeger, Tempo, X-Ray, Honeycomb |

### What to monitor
| Method | Applies to | Signals |
|---|---|---|
| RED | request-driven services | requests/s, errors/s or %, latency p50/p95/p99 |
| USE | resources (CPU, memory, disk, pools) | utilisation %, saturation (queue/wait), errors |
| Golden signals | user-facing systems | latency, traffic, errors, saturation |
| Business | the product | orders/min, signups, payment success rate |

### Why percentiles, not averages
An average of 50 ms can hide 1% of requests taking 3 s. Report **p50, p95, p99**, and compute them from histograms (you can't average percentiles across instances).

### Node.js specifics
- `perf_hooks.monitorEventLoopDelay()`: event-loop delay p99 is the "is something blocking?" signal.
- Heap used vs heap limit, GC pause time, `process.resourceUsage()`.
- `pg` pool `waitingCount`, Redis command latency, queue depth and job age.
:::

::: diagram From signals to answers
flowchart LR
  APP["Node service"] -->|"JSON logs (stdout)"| LOGS["log store"]
  APP -->|"/metrics scrape"| PROM["Prometheus"]
  APP -->|"OTLP spans"| TR["trace store"]
  PROM --> ALERT["alerts → on-call"]
  PROM --> DASH["Grafana dashboards"]
  LOGS -->|"traceId"| TR
  DASH -->|"exemplar"| TR
:::

::: image Logs, metrics and traces, plus RED, USE and golden signals
/images/observability/pillars.svg
:::

::: text 🪜 Step by step
1. Emit structured JSON logs with request id / trace id to stdout.
2. Expose `/metrics`: RED per route, plus Node runtime metrics.
3. Add OpenTelemetry tracing (auto-instrumentation for HTTP, Express, pg, Redis).
4. Build one dashboard per service: RED on top, resources (USE) below, dependencies last.
5. Define SLOs and alert on symptoms (error rate, latency), not causes.
6. During incidents: metric shows *that* → trace shows *where* → logs show *why*.
:::

::: code javascript Compute RED metrics and percentiles from request records (runnable)
// What a metrics backend does with raw request data: rate, error ratio, latency percentiles.
function red(records, windowSeconds) {
  const lat = records.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.ceil((p / 100) * lat.length) - 1)];
  const errors = records.filter((r) => r.status >= 500).length;
  const avg = lat.reduce((s, x) => s + x, 0) / lat.length;
  return { ratePerSec: +(records.length / windowSeconds).toFixed(1), errorPct: +((errors / records.length) * 100).toFixed(2), avg: Math.round(avg), p50: pct(50), p95: pct(95), p99: pct(99) };
}
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const records = Array.from({ length: 6000 }, (_, i) => ({ ms: i % 50 === 0 ? 2500 + Math.round(rnd() * 500) : 20 + Math.round(rnd() * 40), status: i % 250 === 0 ? 503 : 200 }));
const m = red(records, 60);
console.log(m);
console.log(m.p99 > 10 * m.p50 ? `✅ average ${m.avg} ms hides a p99 of ${m.p99} ms: report percentiles` : '❌ FAIL');
console.log(m.errorPct === 0.4 && m.ratePerSec === 100 ? '✅ 100 req/s with 0.4% errors' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Only logs, no metrics: you find out about problems from users.
- Averages instead of percentiles.
- Dashboards with 80 graphs and no clear "is it healthy?" panel.
- No correlation id: you can't connect a user's error to the logs of three services.
- Monitoring CPU and memory but not the event-loop delay of a Node service.
:::

::: understand
- Metrics tell you *that* something is wrong, traces tell you *where*, logs tell you *why*; connect them with a trace id.
:::

::: ask
- *"If p99 latency doubled right now, how many clicks would it take us to find the slow dependency?"*
:::

::: important ⭐ Say this in the interview
"Observability is being able to explain new problems from the telemetry a system emits. Logs are detailed events, metrics are cheap numeric time series for dashboards and alerts, and traces show one request's path and timing across services. For each service I track RED, rate, errors and duration percentiles, and USE for resources, plus Node-specific signals like event-loop delay, heap and pool waits. I report p95 and p99 from histograms instead of averages, put the trace id in every log line, and debug by going from a metric spike to a trace to the logs."
:::

::: links
Google SRE book: Monitoring distributed systems | https://sre.google/sre-book/monitoring-distributed-systems/
OpenTelemetry: Observability primer | https://opentelemetry.io/docs/concepts/observability-primer/
:::

=== How do you do structured logging in Node.js? (pino, levels, request ids, redaction)
@p 3
@tags logging, pino, nodejs, structured-logging, observability
@quick
- Log **JSON, one event per line, to stdout**; the platform ships it (CloudWatch, Loki, Datadog). Don't write log files inside containers.
- Use **pino** (fast, JSON by default) or winston. Measured 100k lines: `console.log(JSON)` to a file **410,841/s**, **pino 733,456/s**, winston 419,993/s; a disabled `debug` call cost almost nothing (77 M calls/s).
- **Levels**: `fatal`, `error`, `warn`, `info`, `debug`, `trace`; production usually `info`, change it without redeploying.
- Every request gets a **child logger** with `requestId`/`traceId`, `userId`, route; log `err` objects (with stack), not `err.message`.
- **Redact** secrets and personal data (`authorization`, `password`, card numbers) with pino's `redact` paths.

::: text 🧒 In simple words
Unstructured logs are a **diary written in sentences**: hard to search. Structured logs are a **spreadsheet**: every line has the same named columns (time, level, requestId, userId), so you can filter "all errors for request r-42" in one query.
:::

::: text 📖 Detailed answer
### Measured: 100,000 structured log lines (Node 22)
| Logger | Destination | Lines per second |
|---|---|---|
| `console.log(JSON.stringify(…))` | file | 410,841 |
| `console.log(JSON.stringify(…))` | pipe | 732,895 |
| pino | file | **733,456** |
| pino | pipe | 770,797 |
| winston (JSON format) | stream | 419,993 |
| `pino.debug()` while level is `info` | none | 77 million (skipped) |

`console.log` is synchronous when writing to files and terminals, so heavy logging blocks the event loop; pino serialises faster and can write asynchronously. Either way, **log less in hot paths**.

### A good log line
`{"level":"error","time":1730000000000,"msg":"payment failed","requestId":"r-42","traceId":"2966…","userId":17,"orderId":7,"err":{"type":"CardDeclined","message":"…","stack":"…"}}`

### Levels guide
| Level | Use |
|---|---|
| error | a request or job failed and needs attention |
| warn | unexpected but handled (retry succeeded, fallback used) |
| info | business events and one line per request |
| debug | details for troubleshooting, off in production |

### Never log
Passwords, tokens, session cookies, full card numbers, full request bodies with personal data. Use `redact`, and log ids instead of whole objects.
:::

::: diagram Request-scoped logging
sequenceDiagram
  participant C as "client"
  participant MW as "pino-http middleware"
  participant H as "route handler"
  participant ST as "stdout → log shipper"
  C->>MW: GET /api/orders/7 (x-request-id r-42)
  MW->>H: req.log = logger.child({ requestId: "r-42" })
  H->>ST: info "order loaded" requestId r-42 orderId 7
  MW->>ST: info "request completed" status 200 responseTime 12 ms
:::

::: image Structured logging in Node.js, measured
/images/observability/logging.svg
:::

::: text 🪜 Step by step
1. Create one base logger (`pino({ level: process.env.LOG_LEVEL ?? 'info', redact: [...] })`).
2. Add `pino-http` (or a middleware) that reuses an incoming `x-request-id` or generates one, and sets `req.log`.
3. Use `req.log` (or AsyncLocalStorage) everywhere in the request so every line carries the id.
4. Log errors once, in the error middleware, with the `err` object.
5. In development pipe through `pino-pretty`; in production keep raw JSON.
6. Ship stdout to your log store and build queries/dashboards on fields.
:::

::: code javascript pino + pino-http with request ids and redaction
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('node:crypto');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.cardNumber'], censor: '[redacted]' },
  base: { service: 'orders-api', version: process.env.GIT_SHA },
});

const app = express();
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => { const id = req.headers['x-request-id'] || randomUUID(); res.setHeader('x-request-id', id); return id; },
  customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
}));

app.get('/api/orders/:id', async (req, res) => {
  req.log.info({ orderId: req.params.id }, 'loading order');           // carries reqId automatically
  res.json({ id: req.params.id });
});

app.use((err, req, res, next) => {
  req.log.error({ err }, 'request failed');                            // full error with stack, logged once
  res.status(err.status || 500).json({ error: 'Internal error', requestId: req.id });
});

app.listen(3000, () => logger.info({ port: 3000 }, 'listening'));
:::

::: code javascript A tiny structured logger: levels, child bindings, redaction (runnable)
function createLogger({ level = 'info', bindings = {}, redact = [], sink = [] } = {}) {
  const levels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };
  const scrub = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => (redact.includes(k) ? '[redacted]' : v instanceof Error ? { type: v.name, message: v.message } : v)));
  const log = (lvl) => (fields, msg) => {
    if (levels[lvl] < levels[level]) return;                       // disabled levels cost one comparison
    sink.push(JSON.stringify({ level: lvl, time: 1730000000000, ...bindings, ...scrub(fields), msg }));
  };
  return { ...Object.fromEntries(Object.keys(levels).map((l) => [l, log(l)])), child: (b) => createLogger({ level, bindings: { ...bindings, ...b }, redact, sink }), sink };
}
const root = createLogger({ bindings: { service: 'orders-api' }, redact: ['password', 'authorization'] });
const reqLog = root.child({ requestId: 'r-42', userId: 17 });
reqLog.info({ route: '/api/login', body: { email: 'a@example.com', password: 'hunter2' } }, 'login attempt');
reqLog.debug({ sql: 'SELECT …' }, 'query');                         // dropped at info level
reqLog.error({ err: new Error('card declined'), orderId: 7 }, 'payment failed');
root.sink.forEach((l) => console.log(l));
console.log(root.sink.length === 2 ? '✅ debug line dropped at level info' : '❌ FAIL');
console.log(root.sink.every((l) => l.includes('"requestId":"r-42"')) && !root.sink.join().includes('hunter2') ? '✅ every line has the request id, and the password is redacted' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `console.log('user ' + id + ' failed')`: unsearchable text.
- Logging `err.message` only: the stack and type are lost.
- Logging the same error in every layer (5 lines for one failure).
- Logging tokens, cookies or request bodies with personal data.
- `debug` level on in production, or one `info` line per loop iteration.
:::

::: understand
- JSON to stdout, a request/trace id on every line, the right level, errors logged once with stacks, secrets redacted.
:::

::: ask
- *"Given only a request id from a customer, can we find every log line for it across services?"*
:::

::: important ⭐ Say this in the interview
"I log structured JSON, one event per line, to stdout and let the platform ship it. I use pino because it's fast: in a measurement it wrote about 733 thousand lines a second versus 411 thousand for console.log to a file, and disabled debug calls are nearly free. Each request gets a child logger with the request id or trace id, user id and route, errors are logged once in the error middleware with the full error object, levels are configurable at runtime, and redact paths remove authorization headers, passwords and other sensitive fields."
:::

::: links
pino documentation | https://getpino.io/
OWASP Logging Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
:::

=== How do you expose metrics from a Node.js service with Prometheus? (counters, gauges, histograms, labels)
@p 3
@tags metrics, prometheus, grafana, prom-client, nodejs, histogram
@quick
- Prometheus **scrapes** `GET /metrics` (pull model) every 15–30 s; Grafana graphs it and Alertmanager alerts on it.
- Types: **counter** (only up: `http_requests_total`), **gauge** (up and down: queue depth, heap), **histogram** (bucketed durations → p95/p99 with `histogram_quantile`).
- **Labels** add dimensions (`method`, `route`, `status`). Keep **cardinality** low: use the route pattern `/api/orders/:id`, never the raw URL, user id or email.
- `prom-client`'s `collectDefaultMetrics()` adds event-loop lag, heap, GC, CPU, open handles (28 metric families here).
- Measured overhead of a histogram on every request: **20,395 → 19,499 req/s (-4%)**, p99 unchanged at 4 ms.

::: text 🧒 In simple words
Metrics are **tally counters and stopwatches** clipped onto your app. Prometheus walks by every 15 seconds and writes down what they say. Labels are the **columns on the tally sheet** ("which route, which status"); if you add a column per user, the sheet becomes millions of columns and nobody can read it.
:::

::: text 📖 Detailed answer
### Metric types
| Type | Behaviour | Example | Query |
|---|---|---|---|
| Counter | only increases (resets on restart) | `http_requests_total{route,status}` | `rate(http_requests_total[5m])` |
| Gauge | any value | `queue_depth`, `db_pool_waiting` | `max_over_time(queue_depth[10m])` |
| Histogram | counts per bucket + sum + count | `http_request_duration_seconds` | `histogram_quantile(0.99, sum by (le) (rate(…_bucket[5m])))` |
| Summary | client-side quantiles | rarely used | can't be aggregated across instances |

### Measured (Express 5, autocannon 50 connections, 5 s)
| Setup | Requests/s | p99 |
|---|---|---|
| no metrics | 20,395 | 4 ms |
| histogram middleware with 3 labels | 19,499 | 4 ms |

A scrape returned lines like `http_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/orders/:id",status="200"} 97540`, plus `nodejs_eventloop_lag_p99_seconds`, `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`.

### Cardinality
Every unique label combination is a separate time series. `route × method × status` ≈ 50 × 4 × 8 = 1,600 series: fine. Adding `userId` with 1 M users: 1.6 billion series, which takes Prometheus down. Put high-cardinality data in logs and traces instead.

### Push vs pull
Prometheus pulls; short-lived jobs push to a Pushgateway, or use OpenTelemetry metrics with an OTLP collector. CloudWatch/Datadog agents work in a push style.
:::

::: diagram Metrics pipeline
flowchart LR
  N1["api pod 1 /metrics"] --> P["Prometheus (scrape every 15 s)"]
  N2["api pod 2 /metrics"] --> P
  P --> G["Grafana dashboards"]
  P --> AM["Alertmanager"]
  AM --> PD["pager / Slack"]
:::

::: image Prometheus metrics in Node.js with measured overhead
/images/observability/metrics.svg
:::

::: text 🪜 Step by step
1. `npm i prom-client`; create a `Registry` and call `collectDefaultMetrics`.
2. Add a histogram `http_request_duration_seconds` with `method`, `route`, `status` labels and sensible buckets.
3. Observe in a middleware on `res.on('finish')`, using `req.route?.path` (the pattern) as the label.
4. Add business counters and gauges (orders created, queue depth, pool waiting).
5. Expose `GET /metrics` (on an internal port or protected).
6. Write PromQL for RED panels and alerts.
:::

::: code javascript prom-client: default metrics, RED histogram, business counter
const express = require('express');
const client = require('prom-client');

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });           // event loop lag, heap, GC, CPU…

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});
const ordersCreated = new client.Counter({ name: 'orders_created_total', help: 'Orders created', labelNames: ['payment_method'], registers: [registry] });

const app = express();
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path ?? 'unmatched', status: res.statusCode }));
  next();
});
app.post('/api/orders', (req, res) => { ordersCreated.inc({ payment_method: 'card' }); res.status(201).json({ id: 1 }); });
app.get('/metrics', async (req, res) => res.type(registry.contentType).send(await registry.metrics()));
app.listen(3000);
:::

::: code text PromQL for RED panels and alerts
# rate: requests per second per route
sum by (route) (rate(http_request_duration_seconds_count[5m]))
# errors: share of 5xx responses
sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
# duration: p99 per route
histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
# Node: event-loop delay p99 above 100 ms
nodejs_eventloop_lag_p99_seconds > 0.1
:::

::: code javascript Histogram buckets → p99, the way histogram_quantile estimates it (runnable)
// Prometheus stores cumulative bucket counts; quantiles are estimated by linear interpolation inside a bucket.
function makeHistogram(bounds) { return { bounds, counts: new Array(bounds.length + 1).fill(0), sum: 0, n: 0 }; }
function observe(h, v) { const i = h.bounds.findIndex((b) => v <= b); h.counts[i === -1 ? h.bounds.length : i]++; h.sum += v; h.n++; }
function quantile(h, q) {
  const rank = q * h.n; let cum = 0;
  for (let i = 0; i < h.bounds.length; i++) {
    const prev = cum; cum += h.counts[i];
    if (cum >= rank) { const lo = i ? h.bounds[i - 1] : 0; return lo + (h.bounds[i] - lo) * ((rank - prev) / h.counts[i]); }
  }
  return Infinity;                                              // above the largest bucket: +Inf
}
const h = makeHistogram([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]);
let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const exact = [];
for (let i = 0; i < 20000; i++) { const v = i % 50 === 0 ? 0.3 + rnd() * 0.15 : 0.004 + rnd() * 0.03; exact.push(v); observe(h, v); }
exact.sort((a, b) => a - b);
const est = quantile(h, 0.99), real = exact[Math.ceil(0.99 * exact.length) - 1];
console.log(`p99 estimated from buckets: ${(est * 1000).toFixed(0)} ms, exact: ${(real * 1000).toFixed(0)} ms, avg: ${((h.sum / h.n) * 1000).toFixed(0)} ms`);
console.log(Math.abs(est - real) < 0.1 ? '✅ bucket estimate is in the right bucket (accuracy depends on bucket bounds)' : '❌ FAIL');
const series = (routes, methods, statuses, extra = 1) => routes * methods * statuses * extra;
console.log(`series: route×method×status = ${series(50, 4, 8)}, add userId (1M) = ${series(50, 4, 8, 1e6).toLocaleString()}`);
console.log(series(50, 4, 8) < 10000 ? '✅ keep labels low-cardinality' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `req.originalUrl` as a label: every order id becomes a new time series.
- Averaging p99s from several instances (aggregate buckets, then compute the quantile).
- Buckets that don't cover your SLO threshold (e.g. no bucket near 300 ms).
- `rate()` on a gauge, or a gauge for something that should be a counter.
- A public `/metrics` endpoint exposing internals.
:::

::: understand
- Counters for events, gauges for levels, histograms for latency; low-cardinality labels; query RED with PromQL.
:::

::: ask
- *"How many time series does this label set create, and is any label unbounded?"*
:::

::: important ⭐ Say this in the interview
"I expose a /metrics endpoint with prom-client that Prometheus scrapes. Default metrics give event-loop lag, heap, GC and CPU; I add a request duration histogram labelled by method, route pattern and status, which gives rate, errors and p99 per route via histogram_quantile, plus business counters and gauges like queue depth. Labels must be low-cardinality, so the route pattern, never the URL or user id. In a measurement the histogram middleware cost about 4 percent throughput with no change to p99, which is a cheap price."
:::

::: links
Prometheus: Metric types | https://prometheus.io/docs/concepts/metric_types/
prom-client | https://github.com/siimon/prom-client
:::

=== How does distributed tracing work? (OpenTelemetry, spans, trace context)
@p 3
@tags tracing, opentelemetry, distributed-tracing, jaeger, nodejs, microservices
@quick
- A **trace** is one request's journey; it's a tree of **spans** (operation name, start, duration, attributes, status) sharing one **trace id**.
- **Context propagation**: the W3C `traceparent` header (`00-<trace id>-<parent span id>-<flags>`) is added to outgoing calls so the next service continues the same trace.
- **OpenTelemetry** is the vendor-neutral standard: SDK + auto-instrumentation (HTTP, Express, pg, Redis, fetch) → OTLP → Jaeger, Tempo, X-Ray, Datadog, Honeycomb.
- Measured trace (2 Node services + Postgres): **105.6 ms** total, of which **28.9 ms** was opening a new DB connection, **14.8 ms** the query, **46.4 ms** the call to the inventory service (16 spans).
- **Sample** in production (e.g. 10%, plus all errors via tail sampling) and put the trace id in logs.

::: text 🧒 In simple words
A trace is a **parcel tracking page**: one tracking number (trace id), and every stop (span) records when the parcel arrived and left. When a delivery is late, you see exactly which warehouse held it up. The `traceparent` header is the **tracking label** that each service sticks on the parcel before passing it on.
:::

::: text 📖 Detailed answer
### Measured: one request in Jaeger
| Span | Service | Start | Duration |
|---|---|---|---|
| GET /api/orders/:id | orders-api | 0 ms | 105.6 ms |
| pg-pool.connect | orders-api | +2 ms | 28.9 ms |
| tcp.connect + dns.lookup | orders-api | +3 ms | 6.5 ms |
| pg.query SELECT | orders-api | +31 ms | 14.8 ms |
| GET (fetch to inventory) | orders-api | +55 ms | 46.4 ms |
| GET /api/stock/:id | inventory | +63 ms | 36.7 ms |

Without changing application code, auto-instrumentation showed that the first request paid for opening a DB connection, and that a third of the time was the downstream service. The inventory service received `traceparent: 00-2966136124f5fe63668cc4d638074ef4-95df8269404d197a-01`.

### Vocabulary
| Term | Meaning |
|---|---|
| trace id | 16 bytes, shared by all spans of a request |
| span id | 8 bytes, one operation |
| parent span | the caller; builds the tree |
| attributes | `http.route`, `db.statement`, `user.id` (careful) |
| span status / events | error, exceptions, annotations |
| sampler | head (decide at start, e.g. 10%) or tail (decide after, keep slow/error traces) |
| baggage | key-values propagated to downstream services |

### In Node.js
Context follows async calls through **AsyncLocalStorage**, so spans created in callbacks/promises attach to the right parent. Load the SDK **before** other modules (`node --require ./tracing.js`) so it can patch `http`, `pg`, etc.
:::

::: diagram Trace context propagation
sequenceDiagram
  participant B as "browser"
  participant A as "orders-api"
  participant DB as "Postgres"
  participant I as "inventory"
  B->>A: GET /api/orders/42
  Note over A: root span, trace id 2966…
  A->>DB: SELECT (child span)
  A->>I: GET /api/stock/7 + traceparent 00-2966…-95df…-01
  Note over I: continues trace 2966…
  I-->>A: 200 (36.7 ms)
  A-->>B: 200 (105.6 ms)
:::

::: image Distributed tracing with OpenTelemetry, measured waterfall
/images/observability/tracing.svg
:::

::: text 🪜 Step by step
1. `npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http`.
2. Create `tracing.js` that starts the `NodeSDK` with a service name and an OTLP exporter.
3. Start the app with `node --require ./tracing.js server.js` (or `--import` for ESM).
4. Run a collector or backend (Jaeger, Tempo, a vendor) and point the exporter at it.
5. Add manual spans around important business steps; record errors on spans.
6. Add the trace id to logs (pino instrumentation does it) and configure sampling.
:::

::: code javascript tracing.js: OpenTelemetry for a Node service (the setup that was measured)
// Loaded first: node --require ./tracing.js server.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'orders-api',
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
});
sdk.start();
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));   // flush spans on shutdown
:::

::: code javascript A manual span around business logic
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const tracer = trace.getTracer('orders');

async function placeOrder(userId, items, deps) {
  return tracer.startActiveSpan('placeOrder', async (span) => {
    span.setAttribute('order.items', items.length);
    try {
      const total = await deps.pricing.total(items);           // auto-instrumented calls become child spans
      const id = await deps.orders.insert(userId, total);
      span.setAttribute('order.id', id);
      return id;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
module.exports = { placeOrder };
:::

::: code javascript traceparent: create, parse, continue a trace (runnable)
// W3C Trace Context: version-traceid-parentid-flags. Each hop keeps the trace id and sets itself as the parent.
const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
function parse(header) {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header || '');
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;          // invalid → start a new trace
  return { traceId: m[1], parentId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 };
}
function startSpan(name, incoming, spans) {
  const ctx = parse(incoming);
  const span = { name, traceId: ctx ? ctx.traceId : hex(16), spanId: hex(8), parentId: ctx ? ctx.parentId : null, sampled: ctx ? ctx.sampled : true };
  spans.push(span);
  return { span, outgoing: `00-${span.traceId}-${span.spanId}-${span.sampled ? '01' : '00'}` };
}
const spans = [];
const api = startSpan('GET /api/orders/:id', undefined, spans);                     // browser sent nothing
const query = startSpan('pg.query SELECT', api.outgoing, spans);
const inv = startSpan('GET /api/stock/:id', api.outgoing, spans);                    // header crossed the network
spans.forEach((s) => console.log(`${s.name.padEnd(22)} trace ${s.traceId.slice(0, 8)}… span ${s.spanId} parent ${s.parentId ?? '(root)'}`));
console.log(spans.every((s) => s.traceId === api.span.traceId) ? '✅ one trace id across services' : '❌ FAIL');
console.log(inv.span.parentId === api.span.spanId && query.span.parentId === api.span.spanId ? '✅ children point at the API span' : '❌ FAIL');
console.log(parse('00-00000000000000000000000000000000-95df8269404d197a-01') === null ? '✅ all-zero trace id rejected' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Loading the tracing SDK after `express`/`pg` are required: nothing gets instrumented.
- Dropping the `traceparent` header in a proxy or custom HTTP client: traces break into pieces.
- 100% sampling of high-traffic services: huge cost; sample, and keep errors/slow traces.
- Putting personal data or full SQL with values into span attributes.
- Not flushing on shutdown: the last spans before a deploy are lost.
:::

::: understand
- A trace is a tree of timed spans sharing one id; `traceparent` carries it between services; OpenTelemetry instruments Node for you.
:::

::: ask
- *"For our slowest endpoint, which span takes most of the time?"* A trace answers it in one screen.
:::

::: important ⭐ Say this in the interview
"Distributed tracing records one request as a tree of spans that share a trace id, and the W3C traceparent header propagates that context across HTTP calls and queues. In Node I use OpenTelemetry: load the SDK first with auto-instrumentation for HTTP, Express, pg and Redis, and export over OTLP to Jaeger, Tempo or a vendor. In a real trace across two services and Postgres, I could see 29 ms spent opening a new database connection and 46 ms in the downstream inventory call out of 106 ms. In production I sample, keep error and slow traces, and put the trace id into logs."
:::

::: links
OpenTelemetry JavaScript: Getting started (Node.js) | https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
W3C Trace Context | https://www.w3.org/TR/trace-context/
:::

=== How do you set SLOs and alerts, and how do you debug "the API is slow" in production?
@p 3
@tags slo, sla, error-budget, alerting, incident, debugging, production
@quick
- **SLI** = what you measure ("requests under 300 ms and not 5xx"), **SLO** = the target ("99.9% over 30 days"), **SLA** = the contract with penalties (looser than the SLO).
- **Error budget** = 100% - SLO: 99.9% allows **43.2 minutes** of failure per 30 days (99% = 7.2 h, 99.99% = 4.3 min). Budget left → ship; budget spent → focus on reliability.
- **Alert on symptoms** users feel (SLO **burn rate**, error rate, latency), not every CPU spike. Every page must be actionable and link a runbook.
- Debugging a slow API: **scope** (all routes or one? all instances? since when, which deploy?) → **RED dashboard** → **traces** of slow requests → **logs** → resources (DB, pool waits, event loop, GC).
- Typical Node causes: slow query/missing index, N+1, pool exhaustion, a blocked event loop (big JSON, sync crypto), a slow downstream without timeouts, memory pressure/GC.

::: text 🧒 In simple words
An SLO is a **promise to yourself**: "the shop is open 99.9% of the time". The error budget is the **43 minutes a month you're allowed to be closed**. If you've used it up, you stop renovating (new features) and fix the doors. When the shop gets slow, you don't guess: you check the queue, follow a customer through, then read the notes.
:::

::: text 📖 Detailed answer
### SLI, SLO, SLA
| Term | Example | Owner |
|---|---|---|
| SLI | proportion of `GET /api/*` under 300 ms and not 5xx | engineering |
| SLO | 99.9% over a rolling 30 days | engineering + product |
| SLA | 99.5% monthly, otherwise credits | business/legal |

### Burn-rate alerting
Burn rate = error ratio ÷ (1 - SLO). A burn rate of 1 spends the budget in exactly 30 days. Common multi-window alerts:
| Severity | Condition | Spends |
|---|---|---|
| page | burn rate > 14.4 over 1 h (and over 5 m) | 2% of the monthly budget in an hour |
| page | burn rate > 6 over 6 h | 5% in 6 hours |
| ticket | burn rate > 1 over 3 days | on track to miss the SLO |

### Debugging "the API is slow"
| Step | Question | Tool |
|---|---|---|
| 1. Scope | which routes, instances, regions, users? since when? | RED dashboard, deploy markers |
| 2. Change | did a deploy, config or traffic change line up? | deploy history, feature flags |
| 3. Where | which span is slow: DB, downstream, our code? | traces of p99 requests |
| 4. Why | errors, timeouts, retries, slow query text | logs by trace id, `pg_stat_statements` |
| 5. Resources | CPU throttled? event-loop delay? GC? pool waiting? | Node metrics, `docker stats` |
| 6. Mitigate | roll back, scale out, disable a flag, shed load | runbook |
| 7. Learn | blameless postmortem, action items | incident doc |

Mitigate first (roll back the deploy), find the root cause after.
:::

::: diagram Slow API investigation
flowchart TD
  A["alert: p99 above SLO"] --> S{"one route or all?"}
  S -->|"all routes"| R{"recent deploy?"}
  R -->|"yes"| RB["roll back, then investigate"]
  R -->|"no"| RES["resources: event loop delay, CPU, GC, pool waiting"]
  S -->|"one route"| T["open slow traces for that route"]
  T --> DB["DB span slow → EXPLAIN, index, N+1"]
  T --> DS["downstream slow → timeouts, circuit breaker, cache"]
  T --> CPU["own code slow → profile, move CPU work off the loop"]
:::

::: image SLIs, SLOs, error budgets and alerting
/images/observability/slo.svg
:::

::: text 🪜 Step by step
1. Pick 1–3 SLIs per user journey (availability and latency of the API).
2. Set an SLO from current performance and user needs; compute the error budget.
3. Alert on fast and slow burn rates; route pages to on-call with a runbook link.
4. On an alert: scope → recent changes → traces → logs → resources.
5. Mitigate (roll back, scale, feature flag off), then find the root cause.
6. Write a blameless postmortem; add the missing metric, alert or test.
:::

::: code yaml Prometheus alerting rules: SLO burn rate and event-loop delay
groups:
  - name: orders-api-slo
    rules:
      - record: job:http_errors:ratio_rate5m
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
      - record: job:http_errors:ratio_rate1h
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[1h])) / sum(rate(http_request_duration_seconds_count[1h]))
      - alert: ErrorBudgetFastBurn
        expr: job:http_errors:ratio_rate1h > (14.4 * 0.001) and job:http_errors:ratio_rate5m > (14.4 * 0.001)
        labels: { severity: page }
        annotations:
          summary: "orders-api is burning its 99.9% error budget 14x too fast"
          runbook: "https://runbooks.example.com/orders-api/error-budget"
      - alert: EventLoopBlocked
        expr: max(nodejs_eventloop_lag_p99_seconds) > 0.2
        for: 5m
        labels: { severity: ticket }
:::

::: code javascript Error budget and burn-rate alert decisions (runnable)
function budgetMinutes(slo, days = 30) { return +((1 - slo) * days * 24 * 60).toFixed(2); }
function burnRate(errorRatio, slo) { return errorRatio / (1 - slo); }
function alertFor(slo, windows) {
  const fast = burnRate(windows['1h'], slo) > 14.4 && burnRate(windows['5m'], slo) > 14.4;
  const slow = burnRate(windows['6h'], slo) > 6 && burnRate(windows['30m'], slo) > 6;
  return fast ? 'PAGE (fast burn)' : slow ? 'PAGE (slow burn)' : burnRate(windows['3d'], slo) > 1 ? 'TICKET' : 'ok';
}
for (const slo of [0.99, 0.999, 0.9999]) console.log(`${(slo * 100).toFixed(2)}% → ${budgetMinutes(slo)} min of failure per 30 days`);
const slo = 0.999;
const incidents = {
  'deploy broke checkout (3% errors)': { '5m': 0.03, '1h': 0.025, '30m': 0.03, '6h': 0.005, '3d': 0.0012 },
  'one blip 5 minutes ago, recovered': { '5m': 0.0005, '1h': 0.004, '30m': 0.001, '6h': 0.0008, '3d': 0.0004 },
  'slow leak of errors (0.15%)': { '5m': 0.0015, '1h': 0.0015, '30m': 0.0015, '6h': 0.0015, '3d': 0.0015 },
};
const results = Object.fromEntries(Object.entries(incidents).map(([k, w]) => [k, alertFor(slo, w)]));
console.log(results);
console.log(budgetMinutes(0.999) === 43.2 ? '✅ 99.9% = 43.2 minutes per 30 days' : '❌ FAIL');
console.log(Object.values(results).join() === 'PAGE (fast burn),ok,TICKET' ? '✅ page for real outages, no page for a recovered blip, ticket for a slow leak' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- 100% as the target: no room to ship, and users can't tell 99.99% from 100%.
- Alerting on CPU > 80% at 3 a.m. when users are fine.
- Pages without a runbook or owner; alert fatigue makes people ignore real ones.
- Debugging by guessing and restarting pods instead of following metrics → traces → logs.
- Finding the root cause before mitigating while users are still affected.
:::

::: understand
- Define what "good" means (SLO), alert when you're burning the budget, and debug top-down: scope, change, trace, logs, resources.
:::

::: ask
- *"How much of this month's error budget have we spent, and should we be shipping features or fixing reliability?"*
:::

::: important ⭐ Say this in the interview
"I define SLIs for user journeys, such as the share of API requests under 300 milliseconds and not 5xx, and set an SLO like 99.9 percent over 30 days, which gives an error budget of 43 minutes. Alerts are multi-window burn-rate alerts on that SLO, so a real outage pages within minutes while a recovered blip doesn't, and every page links a runbook. When the API is slow I scope it by route, instance and time, check recent deploys and roll back first if one lines up, open slow traces to see whether the database, a downstream service or our own code is the problem, then use logs and Node metrics like event-loop delay and pool waits to find the cause, and finish with a blameless postmortem."
:::

::: links
Google SRE workbook: Alerting on SLOs | https://sre.google/workbook/alerting-on-slos/
Google SRE book: Service Level Objectives | https://sre.google/sre-book/service-level-objectives/
:::
