@section Message Queues & Event-Driven Architecture
@icon 📨
@color #8b5cf6
@desc Queues and events for Node.js backends: why queues (measured 15 → 11,209 req/s), producers, consumers and acks, delivery guarantees and idempotency (measured double charge), retries, backoff and dead-letter queues (measured), ordering vs parallelism (measured), the transactional outbox (measured), and Kafka vs RabbitMQ vs SQS vs Redis Streams. Measured with BullMQ 6 on Redis 7.4.

=== Why use a message queue? Producers, consumers and acknowledgements (measured)
@p 3
@tags queues, messaging, architecture, bullmq
@quick
- A **producer** puts a **message** (job/event) on a **queue**; **consumers** (workers) take it, process it and **acknowledge** it; unacknowledged messages are redelivered.
- Queues move slow, flaky or non-essential work **out of the request**: measured signup with an inline email **15 req/s, p50 1,222 ms** vs enqueued **11,209 req/s, p50 1 ms**.
- They **absorb bursts** and decouple services (a slow email provider doesn't slow your API), and allow retries and scaling workers independently.
- They don't create capacity: 5 s of traffic queued ~**56,000** emails that drained at the provider's ~17/s. Monitor **queue depth** and **age of the oldest message**.
- Use them for emails/SMS, PDFs/exports, image processing, webhooks, search indexing, and events between services.

::: text 🧒 In simple words
A queue is a **restaurant's order rail**: the waiter (API) pins the ticket and goes back to customers immediately; cooks (workers) take tickets when they're free. If 50 orders arrive at once the rail fills up, but the waiter isn't stuck in the kitchen. Only adding cooks makes the food come out faster.
:::

::: text 📖 Detailed answer
### Vocabulary
| Term | Meaning |
|---|---|
| Producer | code that publishes messages (API, another service) |
| Message / job | the payload, ideally small: ids, not whole objects |
| Queue / topic | where messages wait (point-to-point queue vs publish/subscribe topic) |
| Consumer / worker | processes messages; many workers share a queue |
| Ack / nack | "done" (delete) / "failed" (retry or dead-letter) |
| Visibility timeout / lock | while a worker holds a message, others don't get it; expiry → redelivery |
| Dead-letter queue | where messages go after the last failed attempt |

### Measured (Express 5, `POST /signup` sending a welcome email through SMTP that takes ~300 ms, 20 connections, 5 s)
| Variant | req/s | p50 | p99 |
|---|---|---|---|
| `await transport.sendMail()` in the handler | **15** | 1,222 ms | 1,398 ms |
| `await queue.add('welcome', …)` (BullMQ) | **11,209** | 1 ms | 3 ms |
The worker then sent ~17 emails/s (SMTP pool of 5 × 300 ms); the ~56,000 queued emails were mostly still waiting after 2 minutes.

### When not to queue
- The user needs the result now (login, payment authorisation).
- The work is trivial and reliable (a DB insert).
- You can't make the consumer idempotent and can't tolerate duplicates.
:::

::: diagram Request with background work
sequenceDiagram
  participant U as User
  participant API as API
  participant Q as Queue
  participant W as Worker
  participant P as Email provider
  U->>API: "POST /signup"
  API->>Q: "add welcome email job"
  API-->>U: "201 in about 1 ms"
  W->>Q: "take job"
  W->>P: "send email, about 300 ms"
  W->>Q: "ack: completed"
:::

::: image Why use a queue? (measured)
/images/messaging/why-queues.svg
:::

::: chart bar Measured: signup requests per second
Variant,req/s
email sent inline,15
email enqueued,11209
:::

::: text 🪜 Step by step
Moving PDF invoice generation to a queue:
1. `POST /orders` saves the order and enqueues `invoice.generate { orderId }` (id only).
2. Responds 201; the UI shows "invoice is being prepared".
3. A worker loads the order, renders the PDF, uploads to S3, saves the URL.
4. It notifies the user (WebSocket/email) and acks the job.
5. If S3 is down, the job retries with backoff; after 5 attempts it lands in the failed set and alerts the team.
:::

::: code javascript queue.js: a BullMQ producer in the API and a worker process
// ---- shared connection (BullMQ needs maxRetriesPerRequest: null for blocking commands) ----
const { Queue, Worker } = require('bullmq');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

// ---- API side ----
const emails = new Queue('emails', {
  connection,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 },
});

async function enqueueWelcomeEmail(user) {
  await emails.add('welcome', { userId: user.id, to: user.email }, { jobId: `welcome-${user.id}` });   // jobId dedupes enqueues (BullMQ ids can't contain ':')
}

// ---- worker process (separate deployment: node worker.js) ----
function startEmailWorker(sendMail) {
  const worker = new Worker('emails', async (job) => {
    if (job.name === 'welcome') return sendMail({ to: job.data.to, template: 'welcome', data: { userId: job.data.userId } });
    throw new Error(`unknown job ${job.name}`);
  }, { connection, concurrency: 10 });
  worker.on('failed', (job, err) => console.error(`job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message));
  return worker;
}

module.exports = { emails, enqueueWelcomeEmail, startEmailWorker };
:::

::: code javascript A queue with acks and redelivery in miniature (runnable)
// Messages stay "in flight" until acked; if a worker disappears, its messages return to the queue.
function createQueue() {
  const ready = [], inFlight = new Map(); let nextId = 1;
  return {
    publish: (body) => ready.push({ id: nextId++, body }),
    receive: (worker) => { const m = ready.shift(); if (m) inFlight.set(m.id, { ...m, worker }); return m; },
    ack: (id) => inFlight.delete(id),
    workerDied: (worker) => { for (const [id, m] of inFlight) if (m.worker === worker) { inFlight.delete(id); ready.unshift({ id, body: m.body }); } },
    get depth() { return ready.length; }, get inFlight() { return inFlight.size; },
  };
}
const q = createQueue();
for (let i = 1; i <= 3; i++) q.publish(`email ${i}`);
const m1 = q.receive('w1'); const m2 = q.receive('w2'); q.ack(m2.id);
q.workerDied('w1');                                           // w1 crashed before acking email 1
const again = q.receive('w3');
console.log({ redelivered: again.body, depth: q.depth, inFlight: q.inFlight });
console.log('unacked message is redelivered to another worker', again.body === m1.body ? '✅' : '❌ FAIL');
console.log('acked message is gone for good', q.depth === 1 && again.id !== m2.id ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Doing slow I/O (emails, PDFs, third-party calls) inside request handlers.
- Putting huge payloads in messages instead of ids.
- Not monitoring queue depth/age (backlogs grow silently).
- Running workers inside the API process with the same scaling (CPU-heavy jobs slow the API).
- Assuming "enqueued" means "done" in the UI.
:::

::: understand
- Queues trade "done now" for "accepted now, done soon, reliably": they buy latency and resilience, not throughput.
:::

::: ask
- *"Does the user need the result in this response, or just confirmation that we'll do it?"*
:::

::: important ⭐ Say this in the interview
"A queue lets a producer hand work to consumers asynchronously: the producer publishes a small message, workers take it, process it and acknowledge it, and anything unacknowledged is redelivered. I measured a signup endpoint that sent the welcome email inline at 15 requests a second with a 1.2 second median, versus 11 thousand requests a second at 1 millisecond when it enqueued the email instead. Queues also absorb bursts, decouple services and give retries, but they don't add capacity: that burst queued 56 thousand emails that drained at the provider's speed, so I monitor queue depth and the age of the oldest job and scale workers accordingly."
:::

::: links
BullMQ documentation | https://docs.bullmq.io/
AWS: What is a message queue? | https://aws.amazon.com/message-queue/
:::

=== At-most-once, at-least-once, exactly-once: what delivery guarantees exist? (measured)
@p 3
@tags queues, idempotency, delivery-guarantees, reliability
@quick
- **At-most-once**: ack before processing → a crash loses the message; never duplicated (fine for metrics).
- **At-least-once** (the default almost everywhere): ack after processing → a crash **redelivers** → duplicates are possible.
- **Exactly-once** end-to-end is not something a queue can promise across external systems; you get **effectively once** = at-least-once + an **idempotent consumer**.
- Measured with BullMQ: a worker charged a customer and was killed before completing the job → the job was redelivered → **2 charges**; with an idempotency key per order → **1 charge**, duplicate skipped.
- Best idempotency lives in the side effect: payment provider **Idempotency-Key**, DB unique constraint on `event_id`, upserts, `jobId` dedupe.

::: text 🧒 In simple words
At-least-once is a **courier who rings again if you didn't sign**: you'll always get the parcel, sometimes twice. Idempotency is **a door sign "parcel 981 already received"**: the second delivery is politely refused, so getting it twice does no harm.
:::

::: text 📖 Detailed answer
| Guarantee | Ack timing | On crash | Use for |
|---|---|---|---|
| At-most-once | before work | message lost | metrics, logs, live positions |
| At-least-once | after work | message redelivered (duplicate) | almost everything |
| Effectively once | after work + idempotent effect | duplicate has no extra effect | payments, orders, emails |

### Measured (BullMQ 6, `stalledInterval` 2 s, worker killed with SIGKILL after the side effect)
| Consumer | Job result | Customer charged |
|---|---|---|
| Plain | "charged" (by the replacement worker) | **2 times** |
| Idempotency key `SET done:charge:{orderId} NX` | "already charged" | **1 time** (1 duplicate skipped) |

### Making consumers idempotent
| Technique | Example |
|---|---|
| Natural idempotency | `UPDATE orders SET status = 'paid' WHERE id = $1` (same result twice) |
| Unique constraint | `INSERT INTO processed_events (event_id) …` in the same transaction as the effect |
| Upsert | `INSERT … ON CONFLICT (order_id) DO NOTHING` |
| Provider idempotency | Stripe `Idempotency-Key: order-981` makes the charge itself dedupe |
| Producer dedupe | BullMQ `jobId`, SQS FIFO `MessageDeduplicationId`, Kafka idempotent producer |

A "processed" flag set **before** the side effect (like the measured Redis key) has a gap: a crash between flag and effect means the effect never happens. Prefer recording "processed" **atomically with** the effect (same DB transaction) or delegating to the provider's idempotency.
:::

::: diagram Crash between side effect and ack
sequenceDiagram
  participant Q as Queue
  participant W1 as Worker 1
  participant P as Payment provider
  participant W2 as Worker 2
  Q->>W1: "job charge order 981"
  W1->>P: "charge 49.99"
  Note over W1: "killed before ack"
  Q->>W2: "redeliver after lock expires"
  W2->>P: "charge with Idempotency-Key order-981"
  P-->>W2: "already processed, same result"
:::

::: image Delivery guarantees and idempotency (measured)
/images/messaging/delivery-guarantees.svg
:::

::: chart bar Measured: times the customer was charged after a worker crash
Consumer,Charges
no idempotency key,2
idempotency key,1
:::

::: text 🪜 Step by step
Making "order.paid → send receipt email" safe:
1. The event carries a unique `eventId`.
2. The consumer begins a DB transaction and inserts `eventId` into `processed_events` (unique).
3. Duplicate → unique violation → skip and ack.
4. Otherwise it inserts the email into an outbox/email table in the same transaction and commits.
5. A crash before commit rolls back both, so the redelivery processes it again cleanly.
:::

::: code javascript Idempotent consumer with a processed-events table (pg + BullMQ)
const { Worker } = require('bullmq');
const { pool } = require('./db');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

// CREATE TABLE processed_events (event_id text PRIMARY KEY, processed_at timestamptz DEFAULT now());
const worker = new Worker('order-events', async (job) => {
  const { eventId, orderId } = job.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fresh = await client.query('INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
    if (fresh.rowCount === 0) { await client.query('ROLLBACK'); return 'duplicate ignored'; }
    await client.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending'", [orderId]);
    await client.query("INSERT INTO email_outbox (template, order_id) VALUES ('receipt', $1)", [orderId]);
    await client.query('COMMIT');                                   // effect + "processed" recorded atomically
    return 'processed';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;                                                      // retried by BullMQ
  } finally {
    client.release();
  }
}, { connection, concurrency: 10 });

// For external side effects, pass the event id to the provider:
//   await stripe.paymentIntents.create({ amount, currency: 'eur', customer }, { idempotencyKey: `order-${orderId}` });

module.exports = { worker };
:::

::: code javascript Redelivery with and without an idempotent consumer (runnable)
async function deliverWithCrash(consumer) {
  const effects = [];
  try { await consumer({ eventId: 'evt-981', orderId: 981 }, effects, { crashAfterEffect: true }); } catch { /* worker died before ack */ }
  await consumer({ eventId: 'evt-981', orderId: 981 }, effects, {});                       // redelivery
  return effects;
}
const plain = async (msg, effects, { crashAfterEffect }) => { effects.push(`charge ${msg.orderId}`); if (crashAfterEffect) throw new Error('killed'); };
const processed = new Set();
const idempotent = async (msg, effects, { crashAfterEffect }) => {
  if (processed.has(msg.eventId)) return 'duplicate';
  effects.push(`charge ${msg.orderId}`); processed.add(msg.eventId);                         // effect + mark together (one transaction)
  if (crashAfterEffect) throw new Error('killed');
};
(async () => {
  const a = await deliverWithCrash(plain), b = await deliverWithCrash(idempotent);
  console.log({ plain: a, idempotent: b });
  console.log('at-least-once + plain consumer = double charge', a.length === 2 ? '✅ (measured with BullMQ)' : '❌ FAIL');
  console.log('idempotent consumer = one charge', b.length === 1 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Believing a broker's "exactly-once" covers your database and third-party calls.
- No unique id on messages, so duplicates can't be detected.
- Setting "processed" before the side effect in a separate step.
- Non-idempotent updates (`balance = balance + 10`) without dedupe.
- Acking before the work is durable (silent message loss).
:::

::: understand
- Design for at-least-once delivery and make every consumer safe to run twice.
:::

::: ask
- *"What happens if this message is processed twice? Five times?"*
:::

::: important ⭐ Say this in the interview
"Most queues give at-least-once delivery: the message is acknowledged after processing, so a crash in between means redelivery and a duplicate. At-most-once acks first and can lose messages. True exactly-once across external systems isn't possible, so I aim for effectively once: at-least-once plus idempotent consumers. I reproduced it with BullMQ: a worker charged a customer and was killed before completing the job; the replacement processed it again and the customer was charged twice, while an idempotency key per order kept it to one. In production I record processed event ids in the same transaction as the effect, use unique constraints and pass idempotency keys to providers like Stripe."
:::

::: links
Stripe: Idempotent requests | https://docs.stripe.com/api/idempotent_requests
Microsoft: Idempotent message processing | https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-data-platform#idempotent-message-processing
:::

=== How do retries, exponential backoff and dead-letter queues work? (measured)
@p 3
@tags queues, retries, backoff, dead-letter-queue, reliability
@quick
- Retry **transient** failures (timeouts, 429, 5xx, SMTP 4xx) with **exponential backoff + jitter**; fail fast on **permanent** ones (400, validation, unknown user).
- Measured with BullMQ (`attempts: 5`, exponential 200 ms): a job failing 3 times succeeded on attempt 4; attempts at **8, 302, 720, 1,549 ms** (gaps doubling); an always-failing job went to the **failed set** after 5 attempts (3,216 ms).
- `UnrecoverableError` (permanent) failed **immediately** without wasting retries.
- After the last attempt messages go to a **dead-letter queue** (BullMQ failed set, SQS DLQ, RabbitMQ dead-letter exchange): alert, inspect, fix, **replay** (measured: manual retry re-queued it).
- Poison messages (that always crash the worker) must not block the queue: cap attempts and isolate them.

::: text 🧒 In simple words
If a phone call fails, you wait a minute and try again, then two minutes, then four: you don't redial every second, and you don't keep calling a number that **doesn't exist**. After a few tries, you put the note in a **"needs a human"** tray (dead-letter queue).
:::

::: text 📖 Detailed answer
### Measured (BullMQ 6, attempts 5, backoff exponential with delay 200 ms)
| Job | Attempts at (ms) | Outcome |
|---|---|---|
| flaky (503 three times) | 8, 302, 720, 1,549 | completed on attempt 4 |
| broken (500 always) | 8, 303, 720, 1,549, 3,216 | failed → failed set |
| invalid (400 → `UnrecoverableError`) | 8 | failed immediately |
Gaps ≈ 300 → 420 → 830 → 1,670 ms: each wait doubles (plus scheduling overhead).

### Classifying errors
| Error | Retry? |
|---|---|
| Network timeout, ECONNRESET, 502/503/504 | yes |
| 429 Too Many Requests | yes, honour `Retry-After` |
| SMTP 4xx (451, 421) | yes |
| 400, 401/403 (bad credentials), 404 | no (fix data/config) |
| SMTP 5xx (550 no such user) | no; mark bounced |
| Bug in your code | retries won't help; DLQ + fix + replay |

### Backoff formula
`delay = min(max, base × 2^attempt) × random(0.5, 1)`: exponential growth prevents hammering a struggling dependency; jitter prevents many failed jobs retrying in sync.

### DLQ operations
Alert when the DLQ is non-empty, show failed reason + payload in an admin UI (Bull Board), replay after fixing, and set retention so it doesn't grow forever.
:::

::: diagram Retry and dead-letter flow
flowchart TD
  J["job"] --> P["process"]
  P -->|"success"| D["completed"]
  P -->|"permanent error"| DLQ["dead-letter queue or failed set"]
  P -->|"transient error"| A{"attempts left?"}
  A -->|"yes"| B["wait base x 2 to the attempt, plus jitter"]
  B --> P
  A -->|"no"| DLQ
  DLQ --> R["alert, fix, replay"]
:::

::: image Retries, backoff and dead-letter queues (measured)
/images/messaging/retries-dlq.svg
:::

::: chart line Measured: ms when each attempt started (job failing 3 times)
Attempt,ms since first attempt
1,8
2,302
3,720
4,1549
:::

::: text 🪜 Step by step
A partner's webhook endpoint is down for 20 minutes:
1. Delivery jobs fail with 503; each retries at ~1, 2, 4, 8, 16 minutes (+ jitter).
2. Most jobs succeed once the partner recovers, without anyone intervening.
3. Jobs that exhausted their attempts go to the failed set; an alert fires.
4. After confirming the partner is up, an engineer replays the failed jobs from Bull Board.
5. A circuit breaker could pause sending entirely while the partner is down (resilience batch).
:::

::: code javascript Worker with error classification, Retry-After and dead-letter handling (BullMQ)
const { Queue, Worker, UnrecoverableError, DelayedError } = require('bullmq');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

const webhooks = new Queue('webhooks', { connection, defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false } });

const worker = new Worker('webhooks', async (job, token) => {
  const res = await fetch(job.data.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job.data.payload), signal: AbortSignal.timeout(10_000) });
  if (res.ok) return { status: res.status };
  if (res.status === 429) {                                          // honour the partner's Retry-After
    const wait = Number(res.headers.get('retry-after') ?? 30) * 1000;
    await job.moveToDelayed(Date.now() + wait, token);
    throw new DelayedError();
  }
  if (res.status >= 400 && res.status < 500) throw new UnrecoverableError(`partner rejected payload: ${res.status}`);
  throw new Error(`partner error ${res.status}`);                    // 5xx: retried with backoff
}, { connection, concurrency: 20 });

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    console.error(`dead letter: webhook ${job.id} to ${job.data.url}: ${err.message}`);   // alert / metric here
  }
});

async function replayFailed(limit = 100) {
  const failed = await webhooks.getFailed(0, limit - 1);
  await Promise.all(failed.map((j) => j.retry()));
  return failed.length;
}

module.exports = { webhooks, worker, replayFailed };
:::

::: code javascript Exponential backoff with jitter and error classification (runnable)
const classify = (status) => (status === 429 || status >= 500 || status === 451 ? 'retry' : status >= 400 ? 'permanent' : 'ok');
const backoff = (attempt, base = 200, max = 60_000, rand = Math.random) => Math.round(Math.min(max, base * 2 ** attempt) * (0.5 + rand() / 2));
async function deliver(responses, maxAttempts = 5) {
  const log = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = responses[Math.min(attempt, responses.length - 1)];
    const kind = classify(status); log.push(status);
    if (kind === 'ok') return { result: 'completed', log };
    if (kind === 'permanent') return { result: 'dead-letter (permanent)', log };
  }
  return { result: 'dead-letter (attempts exhausted)', log };
}
(async () => {
  const flaky = await deliver([503, 503, 503, 200]), broken = await deliver([500]), invalid = await deliver([400]);
  console.log({ flaky, broken, invalid });
  console.log('flaky succeeds on attempt 4', flaky.result === 'completed' && flaky.log.length === 4 ? '✅ (measured)' : '❌ FAIL');
  console.log('broken ends in the DLQ after 5 attempts', broken.log.length === 5 && broken.result.startsWith('dead') ? '✅' : '❌ FAIL');
  console.log('400 is not retried', invalid.log.length === 1 ? '✅' : '❌ FAIL');
  const delays = [0, 1, 2, 3].map((a) => backoff(a, 200, 60000, () => 1));
  console.log('delays without jitter double:', delays.join(' → '), delays.join() === '200,400,800,1600' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Retrying permanent errors (wasting attempts, hammering partners).
- Fixed retry delays without jitter (retry storms).
- Infinite retries (poison messages block workers forever).
- No alerting on the DLQ, so failures are discovered by customers.
- Retrying non-idempotent work (duplicates).
:::

::: understand
- Retry what can heal, fail fast on what can't, and give humans a dead-letter queue to fix the rest.
:::

::: ask
- *"Which errors from this dependency are transient, and which are permanent?"*
:::

::: important ⭐ Say this in the interview
"I retry transient errors like timeouts, 429s and 5xx with exponential backoff and jitter, and fail fast on permanent ones like validation errors. In BullMQ with five attempts and a 200 millisecond base, I measured attempts at 8, 302, 720 and 1,549 milliseconds, so the wait doubles; a job that kept failing went to the failed set after the fifth attempt, and one throwing UnrecoverableError failed immediately. Exhausted messages land in a dead-letter queue, which I alert on, inspect, fix and replay. Consumers must be idempotent because retries mean duplicates."
:::

::: links
BullMQ: Retrying failing jobs | https://docs.bullmq.io/guide/retrying-failing-jobs
AWS SQS: Dead-letter queues | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
:::

=== How do you keep messages in order without losing parallelism? (measured)
@p 2
@tags queues, ordering, kafka, partitions, concurrency
@quick
- Parallel consumers break ordering: measured 50 orders × 3 events (created → paid → shipped) with concurrency 10 → **27 of 50** orders ended in the wrong state.
- One consumer at a time keeps order but is slow: **0 wrong, 1,746 ms**.
- **Partition by key** (same order id → same lane): **0 wrong, 347 ms**, keeping most of the parallelism. That's Kafka's model.
- Most systems only guarantee order **per partition / per group / per queue**, never globally.
- Alternative: make consumers **order-independent** with versions or state machines (ignore an event older than the current state).

::: text 🧒 In simple words
Several cashiers serving one long line can't keep everyone in order. Instead, give each family **its own lane**: families' members stay in order within their lane, and many lanes still move at the same time.
:::

::: text 📖 Detailed answer
### Measured (BullMQ, 50 orders × 3 events, random 0–20 ms processing)
| Processing | Orders in the wrong final state | Time |
|---|---|---|
| One queue, concurrency 10 | **27 / 50** | 143 ms |
| One queue, concurrency 1 | 0 / 50 | 1,746 ms |
| 5 queues by `orderId % 5`, concurrency 1 each | **0 / 50** | **347 ms** |

### Ordering guarantees by technology
| System | Ordered within | Parallelism unit |
|---|---|---|
| Kafka | a partition (key → partition) | partitions (consumers in a group ≤ partitions) |
| SQS FIFO | a `MessageGroupId` | message groups |
| RabbitMQ | a queue with a single active consumer | queues / consistent-hash exchange |
| BullMQ | none with concurrency > 1 | queues per partition, or Pro groups |
| Redis Streams | stream order, but consumer groups spread entries | consumers |

### Order-independent consumers
Events carry a `version` (or sequence): `UPDATE orders SET status = $2, version = $3 WHERE id = $1 AND version < $3`. A late "paid" (version 2) after "shipped" (version 3) updates 0 rows. This keeps full parallelism.
:::

::: diagram Partitioning by key
flowchart LR
  P["producer"] --> H{"hash of order id"}
  H -->|"order 1, 6, 11"| Q0["lane 0: one consumer"]
  H -->|"order 2, 7, 12"| Q1["lane 1: one consumer"]
  H -->|"order 5, 10, 15"| Q4["lane 4: one consumer"]
:::

::: image Message ordering vs parallelism (measured)
/images/messaging/ordering.svg
:::

::: chart bar Measured: orders ending in the wrong state (of 50)
Processing,Wrong
parallel concurrency 10,27
serial,0
partitioned by order id,0
:::

::: text 🪜 Step by step
Choosing Kafka partitions for order events:
1. Key every event by `orderId` so all events of one order go to one partition.
2. Pick enough partitions for peak throughput (e.g. 12); a consumer group can use up to 12 consumers.
3. Within a consumer, process each partition's messages sequentially (or by key).
4. Changing the partition count later reshuffles keys, so plan ahead.
5. Consumers still check versions, because retries can reorder within a partition.
:::

::: code javascript Partitioned BullMQ queues: one lane per hash of the key
const { Queue, Worker } = require('bullmq');
const crypto = require('node:crypto');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };
const PARTITIONS = 8;

const lanes = Array.from({ length: PARTITIONS }, (_, i) => new Queue(`order-events-${i}`, { connection }));
const laneOf = (key) => crypto.createHash('md5').update(String(key)).digest().readUInt32BE(0) % PARTITIONS;

async function publishOrderEvent(event) {                       // { orderId, type, version }
  await lanes[laneOf(event.orderId)].add(event.type, event, { jobId: `${event.orderId}-${event.version}` });
}

function startConsumers(handle) {
  return lanes.map((q) => new Worker(q.name, (job) => handle(job.data), { connection, concurrency: 1 }));   // order kept per lane
}

// order-independent handler: ignores events older than what's stored
async function applyEvent(pool, { orderId, type, version }) {
  const { rowCount } = await pool.query('UPDATE orders SET status = $2, version = $3 WHERE id = $1 AND version < $3', [orderId, type, version]);
  return rowCount === 1 ? 'applied' : 'stale event ignored';
}

module.exports = { publishOrderEvent, startConsumers, applyEvent };
:::

::: code javascript Parallel vs partitioned processing (runnable)
async function run(mode) {
  const state = new Map(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const events = []; for (let o = 1; o <= 50; o++) for (const s of ['created', 'paid', 'shipped']) events.push({ o, s });
  const handle = async (e) => { await sleep(rand() * 10); state.set(e.o, e.s); };
  if (mode === 'parallel') { const pool = []; for (const e of events) { pool.push(handle(e)); if (pool.length === 10) { await Promise.race(pool.map((p, i) => p.then(() => pool.splice(i, 1)))); } } await Promise.all(pool); }
  else { const lanes = Array.from({ length: 5 }, () => []); for (const e of events) lanes[e.o % 5].push(e); await Promise.all(lanes.map(async (lane) => { for (const e of lane) await handle(e); })); }
  return [...state.values()].filter((s) => s !== 'shipped').length;
}
(async () => {
  const wrongParallel = await run('parallel'), wrongPartitioned = await run('partitioned');
  console.log({ wrongParallel, wrongPartitioned });
  console.log('parallel consumers break per-order ordering', wrongParallel > 0 ? '✅ (measured 27/50)' : '⚠️ no reordering this run');
  console.log('partitioning by key keeps it', wrongPartitioned === 0 ? '✅ (measured 0/50)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Assuming a queue preserves order with several consumers.
- Expecting global ordering from Kafka (only per partition).
- Hot keys: one huge customer in one partition becomes the bottleneck.
- Retries putting a failed message behind newer ones in the same key.
- Not versioning events, so a late duplicate overwrites newer state.
:::

::: understand
- Order is a per-key property: partition by key for order, or version events so order doesn't matter.
:::

::: ask
- *"Which entity must its events be ordered for, and is global order really needed?"*
:::

::: important ⭐ Say this in the interview
"Parallel consumers break ordering: with three events per order processed at concurrency ten, I measured 27 of 50 orders ending in the wrong state. Processing one at a time fixed it but took twelve times longer. Partitioning by order id, so each order's events go to one lane with a single consumer, kept all orders correct at about a fifth of the serial time; that's Kafka's model, with ordering per partition and keys deciding the partition, and SQS FIFO does the same per message group. Where possible I also make consumers order-independent with version numbers, so stale events are ignored."
:::

::: links
Kafka: Partitions and ordering | https://kafka.apache.org/documentation/#intro_concepts_and_terms
AWS SQS FIFO: Message ordering | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-understanding-logic.html
:::

=== What is the transactional outbox pattern, and why do you need it? (measured)
@p 3
@tags outbox, event-driven, consistency, microservices
@quick
- **Dual-write problem**: saving to the database and publishing to a queue are two systems; one can succeed while the other fails.
- Measured: 100 orders committed, then publishing failed 1 in 10 times → **10 events lost forever** (orders exist, nobody was told).
- **Outbox**: insert the event into an `outbox` table **in the same transaction** as the business data; a **relay** publishes unpublished rows and marks them, retrying on failure. Measured: **0 lost** (4 relay rounds).
- The relay gives **at-least-once** publishing → consumers dedupe by event id (the **inbox** pattern on the other side).
- Relay options: polling with `FOR UPDATE SKIP LOCKED`, LISTEN/NOTIFY, or **CDC** (Debezium reading the WAL into Kafka).

::: text 🧒 In simple words
Instead of **saving the order and then phoning the warehouse** (and sometimes forgetting to phone), you **write the phone message on the order form itself**. A clerk regularly goes through forms with un-sent messages and keeps calling until each one gets through.
:::

::: text 📖 Detailed answer
### The failure
`INSERT order; COMMIT;` → `queue.add('order.created')` fails (network blip, broker restart, process crash). Reversing the order (publish first) is worse: consumers act on an order that might roll back.

### Measured (PostgreSQL 17 + BullMQ, 100 orders, 1 in 10 publishes throws)
| Approach | Events delivered | Lost |
|---|---|---|
| Commit, then publish | 90 | **10, forever** |
| Outbox + relay with retries | **100** | 0 (relay needed 4 rounds) |

### Outbox table and relay
1. `outbox(id, topic, payload, created_at, published_at)`.
2. Business transaction inserts the order **and** the outbox row.
3. Relay loop: `SELECT … WHERE published_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`, publish each (with a stable id), set `published_at`.
4. Clean up old published rows (or partition by day).
5. Consumers dedupe by event id (publish may repeat after a relay crash).

### CDC alternative
Debezium tails PostgreSQL's WAL and streams outbox inserts into Kafka with no polling; used at larger scale and across many services.
:::

::: diagram Outbox flow
sequenceDiagram
  participant API as API
  participant DB as Postgres
  participant R as Relay
  participant Q as Queue
  API->>DB: "BEGIN, INSERT order, INSERT outbox, COMMIT"
  R->>DB: "SELECT unpublished FOR UPDATE SKIP LOCKED"
  R->>Q: "publish order.created with event id"
  R->>DB: "UPDATE outbox SET published_at"
  Note over R,Q: "publish fails: row stays unpublished, retried next round"
:::

::: image The transactional outbox pattern (measured)
/images/messaging/outbox.svg
:::

::: chart bar Measured: events lost out of 100 when 1 in 10 publishes fails
Approach,Lost
dual write,10
outbox,0
:::

::: text 🪜 Step by step
Order service tells inventory and email services about new orders:
1. `POST /orders` → one transaction: insert order, order items and an `order.created` outbox row.
2. The relay publishes it to the `order-events` topic with `eventId = outbox.id`.
3. Inventory reserves stock; email sends the confirmation; each records `eventId` in its inbox table.
4. If the broker is down for 5 minutes, orders still succeed; events go out when it's back.
5. Nothing is lost and nothing is applied twice.
:::

::: code javascript Outbox write + relay with SKIP LOCKED (pg + BullMQ)
const { Queue } = require('bullmq');
const { pool } = require('./db');
const events = new Queue('order-events', { connection: { url: process.env.REDIS_URL, maxRetriesPerRequest: null } });

// CREATE TABLE outbox (id bigserial PRIMARY KEY, topic text NOT NULL, payload jsonb NOT NULL,
//                      created_at timestamptz DEFAULT now(), published_at timestamptz);
// CREATE INDEX outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

async function createOrder(userId, totalCents) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO orders (user_id, status, total_cents, created_at) VALUES ($1, $2, $3, now()) RETURNING id', [userId, 'pending', totalCents]);
    await client.query("INSERT INTO outbox (topic, payload) VALUES ('order.created', $1)", [{ orderId: rows[0].id, userId, totalCents }]);
    await client.query('COMMIT');                                    // order and event: both or neither
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function relayOnce(batch = 50) {
  const client = await pool.connect();
  let published = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, topic, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED', [batch]);
    for (const row of rows) {
      try {
        await events.add(row.topic, { eventId: String(row.id), ...row.payload }, { jobId: `outbox-${row.id}` });   // jobId dedupes re-publishes
        await client.query('UPDATE outbox SET published_at = now() WHERE id = $1', [row.id]);
        published++;
      } catch (err) {
        console.warn(`publish of outbox ${row.id} failed, will retry:`, err.message);
      }
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  return published;
}

async function runRelay(signal) {
  while (!signal?.aborted) {
    const n = await relayOnce().catch(() => 0);
    if (n === 0) await new Promise((r) => setTimeout(r, 500));
  }
}

module.exports = { createOrder, relayOnce, runRelay };
:::

::: code javascript Dual write vs outbox under failures (runnable)
function simulate(useOutbox, failEvery = 10) {
  const db = { orders: [], outbox: [] }; const delivered = new Set(); let attempt = 0;
  const publish = (e) => { if (++attempt % failEvery === 0) throw new Error('broker unavailable'); delivered.add(e.orderId); };
  for (let id = 1; id <= 100; id++) {
    db.orders.push(id);                                              // committed
    if (useOutbox) db.outbox.push({ orderId: id, published: false }); // same transaction
    else { try { publish({ orderId: id }); } catch { /* lost */ } }
  }
  let rounds = 0;
  while (useOutbox && db.outbox.some((r) => !r.published)) {
    rounds++;
    for (const row of db.outbox.filter((r) => !r.published)) { try { publish(row); row.published = true; } catch { /* retried next round */ } }
  }
  return { orders: db.orders.length, delivered: delivered.size, lost: db.orders.length - delivered.size, rounds };
}
const dual = simulate(false), outbox = simulate(true);
console.log({ dual, outbox });
console.log('dual write loses events after commit', dual.lost === 10 ? '✅ (measured 10/100)' : '❌ FAIL');
console.log('outbox delivers every committed order', outbox.lost === 0 ? '✅ (measured 0/100)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Publishing inside the DB transaction (the event goes out even if the transaction rolls back).
- Publishing after commit with no retry (the measured 10% loss).
- Relay without `SKIP LOCKED` (several relay instances block each other or double-publish).
- Consumers that aren't idempotent (the relay can re-publish after a crash).
- Letting the outbox table grow forever.
:::

::: understand
- Make the event part of the same transaction as the data, then deliver it at least once.
:::

::: ask
- *"If the broker is down for ten minutes, what happens to orders and their events?"*
:::

::: important ⭐ Say this in the interview
"Writing to the database and publishing to a broker are two separate systems, so one can succeed while the other fails. I measured it: committing 100 orders and then publishing, with one publish in ten failing, lost ten events for good. The transactional outbox fixes it by inserting the event into an outbox table in the same transaction as the order; a relay publishes unpublished rows with FOR UPDATE SKIP LOCKED, marks them and retries failures, and in my test it delivered all 100. That's at-least-once publishing, so consumers dedupe by event id, and at scale the relay can be change-data-capture with Debezium."
:::

::: links
microservices.io: Transactional outbox | https://microservices.io/patterns/data/transactional-outbox.html
Debezium: Outbox event router | https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
:::

=== Kafka vs RabbitMQ vs SQS vs Redis Streams/BullMQ, and queues vs pub/sub vs event streams
@p 2
@tags kafka, rabbitmq, sqs, redis-streams, event-driven, architecture
@quick
- **Queue** (work distribution): each message goes to **one** consumer (BullMQ, SQS, RabbitMQ queues). **Pub/sub**: each message goes to **every** subscriber (Redis pub/sub, SNS, RabbitMQ fanout). **Event stream/log**: messages are **stored** and many consumer groups read at their own pace and can **replay** (Kafka, Redis Streams, Kinesis).
- **Kafka**: partitioned replicated log, very high throughput, retention and replay, ordering per partition: event streaming, analytics, many consumers.
- **RabbitMQ**: flexible routing (exchanges, bindings), priorities, per-message acks: task queues and RPC-style messaging.
- **SQS**: fully managed, elastic, visibility timeouts, DLQs, FIFO option: AWS-native jobs; **SNS + SQS** for fan-out.
- **BullMQ / Redis Streams**: simplest for Node apps that already run Redis: delayed/repeatable jobs, retries, rate limits, dashboards.

::: text 🧒 In simple words
A **queue** is a to-do pile where each task goes to one worker. **Pub/sub** is a loudspeaker: everyone listening hears it, and if you weren't listening, you missed it. An **event stream** is a **recorded radio show**: everyone can listen, at their own speed, and rewind.
:::

::: text 📖 Detailed answer
### Messaging styles
| Style | Delivery | If a consumer is offline | Examples |
|---|---|---|---|
| Work queue | one consumer per message | message waits | BullMQ, SQS, RabbitMQ queue |
| Pub/sub | every subscriber | missed (unless durable subscriptions) | Redis pub/sub, SNS → SQS, RabbitMQ fanout |
| Event log | every consumer group, stored | reads later, can replay | Kafka, Redis Streams, Kinesis |

### Technology comparison
| | Kafka | RabbitMQ | SQS | Redis Streams / BullMQ |
|---|---|---|---|---|
| Model | partitioned log | broker with exchanges → queues | managed queue | stream / job queue in Redis |
| Retention | time/size, replay | until acked | up to 14 days | until trimmed / removed |
| Ordering | per partition | per queue (single consumer) | FIFO per group | stream order; jobs unordered |
| Throughput | very high | high | high, elastic | high, memory-bound |
| Ops | heavier (or MSK/Confluent) | moderate | none | Redis you already run |
| Best for | event streaming, CDC, analytics | routing, priorities, RPC | AWS jobs, serverless | Node background jobs |

### Event-driven architecture in one paragraph
Services publish **facts** ("order.created") instead of calling each other; other services react. Benefits: loose coupling, independent scaling, easy new consumers. Costs: eventual consistency, harder debugging (use correlation ids and tracing), schema evolution (versioned events), and the need for idempotency and the outbox.
:::

::: diagram Three messaging styles
flowchart LR
  P1["producer"] --> Q["work queue"]
  Q --> W1["one of the workers"]
  P2["publisher"] --> T["pub/sub topic"]
  T --> S1["every current subscriber"]
  P3["producer"] --> L["event log"]
  L --> G1["consumer group A, own offset"]
  L --> G2["consumer group B, can replay"]
:::

::: image Kafka vs RabbitMQ vs SQS vs Redis Streams / BullMQ
/images/messaging/brokers.svg
:::

::: text 🪜 Step by step
Picking messaging for a growing shop:
1. Today (one Node app + Postgres + Redis): BullMQ for emails, PDFs, webhooks; outbox table for events.
2. Several services need `order.created`: publish to SNS → one SQS queue per service (fan-out), or Redis Streams consumer groups.
3. Analytics, search indexing and ML want the full event history and replay: introduce Kafka (or Kinesis), fed by CDC from the outbox.
4. Keep work queues for tasks and the log for facts; don't force one tool to do everything.
5. Standardise event envelopes: `{ eventId, type, version, occurredAt, data }`.
:::

::: code javascript Redis Streams consumer group (ioredis): durable events with acks
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
const STREAM = 'events:orders', GROUP = 'inventory-service';

async function publish(type, data) {
  return redis.xadd(STREAM, 'MAXLEN', '~', 1_000_000, '*', 'type', type, 'data', JSON.stringify(data));   // capped log
}

async function consume(consumerName, handle) {
  await redis.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM').catch(() => {});       // group may already exist
  for (;;) {
    const res = await redis.xreadgroup('GROUP', GROUP, consumerName, 'COUNT', 50, 'BLOCK', 5000, 'STREAMS', STREAM, '>');
    if (!res) continue;
    for (const [, entries] of res) {
      for (const [id, fields] of entries) {
        const msg = { id, type: fields[1], data: JSON.parse(fields[3]) };
        try {
          await handle(msg);                                   // idempotent handler
          await redis.xack(STREAM, GROUP, id);
        } catch (err) {
          console.error('will be re-claimed later', id, err.message);   // stays pending; XAUTOCLAIM after a timeout
        }
      }
    }
  }
}

module.exports = { publish, consume };
:::

::: code javascript Queue vs pub/sub vs log semantics (runnable)
function workQueue(consumers) { let i = 0; const got = Object.fromEntries(consumers.map((c) => [c, []])); return { send: (m) => got[consumers[i++ % consumers.length]].push(m), got }; }
function pubSub(subscribers) { const got = Object.fromEntries(subscribers.map((s) => [s, []])); const online = new Set(subscribers); return { send: (m) => online.forEach((s) => got[s].push(m)), offline: (s) => online.delete(s), online: (s) => online.add(s), got }; }
function eventLog() { const log = []; const offsets = {}; return { send: (m) => log.push(m), read: (group) => { const from = offsets[group] ?? 0; offsets[group] = log.length; return log.slice(from); } }; }
const msgs = ['e1', 'e2', 'e3', 'e4'];
const q = workQueue(['w1', 'w2']); msgs.forEach(q.send);
const ps = pubSub(['email', 'search']); ps.send('e1'); ps.offline('search'); ps.send('e2'); ps.online('search'); ps.send('e3');
const log = eventLog(); msgs.forEach(log.send); const analytics = log.read('analytics'); log.send('e5'); const late = log.read('search');
console.log({ queue: q.got, pubsub: ps.got, logAnalytics: analytics, logSearchJoinsLate: late });
console.log('queue: each message to exactly one worker', q.got.w1.length + q.got.w2.length === 4 ? '✅' : '❌ FAIL');
console.log('pub/sub: offline subscriber missed e2', !ps.got.search.includes('e2') && ps.got.email.includes('e2') ? '✅' : '❌ FAIL');
console.log('log: a new consumer group can read everything from the start', late.length === 5 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using Redis pub/sub for jobs that must not be lost (offline subscribers miss them).
- Adopting Kafka for a handful of background jobs (operational cost without the benefit).
- One giant "events" topic with no schema/versioning.
- Treating events as commands ("send email") instead of facts ("user.signed_up").
- No correlation ids, so a flow across services can't be traced.
:::

::: understand
- Queues distribute work, pub/sub broadcasts now, logs store facts for everyone to read later.
:::

::: ask
- *"Does each message need one handler, every current listener, or every consumer including future ones?"*
:::

::: important ⭐ Say this in the interview
"I separate three styles: work queues where each message goes to one worker, pub/sub where every current subscriber gets a copy and offline ones miss it, and event logs that store messages so each consumer group reads at its own pace and can replay. Kafka is a partitioned replicated log for high-throughput event streaming with ordering per partition; RabbitMQ is a flexible broker with routing and priorities; SQS is a managed queue with dead-letter queues and FIFO groups, combined with SNS for fan-out; and in Node apps that already run Redis, BullMQ or Redis Streams cover background jobs simply. I choose by delivery semantics, retention, ordering needs and operational cost."
:::

::: links
Apache Kafka: Introduction | https://kafka.apache.org/intro
RabbitMQ tutorials | https://www.rabbitmq.com/tutorials
Redis Streams | https://redis.io/docs/latest/develop/data-types/streams/
:::
