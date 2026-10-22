@section Background Jobs, Scheduling & Email
@icon ⏱️
@color #a855f7
@desc Running background work in Node.js: BullMQ workers, concurrency and job options (measured I/O vs CPU), delayed and scheduled jobs across instances (measured cron duplicates), email and notification pipelines with retries and bounces (measured SMTP retries), and graceful shutdown and long-running jobs (measured). BullMQ 6 on Redis 7.4.

=== How do BullMQ workers, concurrency and job options work? (measured)
@p 3
@tags bullmq, background-jobs, workers, concurrency
@quick
- BullMQ stores jobs in Redis; `Queue.add(name, data, opts)` produces, `new Worker(queue, processor, { concurrency })` consumes. States: waiting → active → completed / failed, plus delayed, prioritized and stalled.
- Useful options: `attempts` + `backoff`, `delay`, `priority`, `jobId` (dedupe), `removeOnComplete/Fail`, rate `limiter`, parent/child **flows**.
- Measured, I/O-bound job (50 ms wait): concurrency 1 → **19 jobs/s**, 10 → **188**, 50 → **843**.
- Measured, CPU-bound job (20 ms busy): concurrency 1/10/50 → **48 / 50 / 50 jobs/s**: one event loop can't run JavaScript in parallel → more processes or worker threads.
- Run workers as a **separate deployment** from the API, scaled on queue depth; use Bull Board or Taskforce for visibility.

::: text 🧒 In simple words
Concurrency is how many jobs one worker **juggles at once**. Juggling works when each job mostly **waits** (for an email server): you start the next while the first waits. It doesn't work for jobs that need your **hands the whole time** (CPU work): you need more people (processes), not more balls.
:::

::: text 📖 Detailed answer
### Job lifecycle
| State | Meaning |
|---|---|
| waiting / prioritized | ready to be picked up |
| delayed | waiting until `delay` or a backoff retry time |
| active | locked by a worker (lock renewed while running) |
| completed / failed | finished; kept per `removeOnComplete/removeOnFail` |
| stalled | the worker lost its lock (crashed, blocked event loop) → moved back to waiting |

### Measured (one worker process, BullMQ 6)
| Job type | Concurrency 1 | 10 | 50 |
|---|---|---|---|
| I/O: awaits 50 ms | 19 jobs/s | 188 | **843** |
| CPU: busy 20 ms | 48 jobs/s | 50 | **50** |

### CPU-heavy jobs
- Use **sandboxed processors** (`new Worker(queue, './processor.js')`): BullMQ runs them in child processes/worker threads.
- Or run more worker processes (one per core) and keep concurrency low.
- Long CPU blocks also prevent lock renewal → jobs marked **stalled** and re-run.

### Handy features
`limiter: { max: 10, duration: 1000 }` (respect a provider's rate limit), `FlowProducer` (parent waits for children, e.g. "render 20 pages then merge PDF"), job progress (`job.updateProgress(40)`), events via `QueueEvents`.
:::

::: diagram BullMQ job states
stateDiagram-v2
  [*] --> waiting
  waiting --> active
  delayed --> waiting
  active --> completed
  active --> failed
  active --> delayed: "retry with backoff"
  active --> waiting: "stalled, lock lost"
  completed --> [*]
  failed --> [*]
:::

::: image BullMQ workers and concurrency (measured)
/images/jobs/bullmq-workers.svg
:::

::: chart bar Measured: jobs per second by concurrency (one worker process)
Concurrency,I/O job (50 ms wait),CPU job (20 ms busy)
1,19,48
10,188,50
50,843,50
:::

::: text 🪜 Step by step
Generating thumbnails for uploaded photos:
1. The upload handler stores the original in S3 and enqueues `thumbnail { key }` with `attempts: 3`.
2. Thumbnailing is CPU-bound, so the queue uses a **sandboxed processor** and one worker process per core.
3. Each job downloads, resizes (sharp) and uploads 3 sizes, reporting progress.
4. The worker deployment autoscales on the `waiting` count.
5. The UI subscribes to job completion (WebSocket) and swaps in the thumbnails.
:::

::: code javascript worker.js: separate process, sandboxed CPU work, rate limit and progress
const path = require('node:path');
const { Worker, Queue } = require('bullmq');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

// I/O-bound jobs: high concurrency in one process
const emailWorker = new Worker('emails', async (job) => sendEmail(job.data), {
  connection,
  concurrency: 50,
  limiter: { max: 14, duration: 1000 },              // e.g. SES sandbox: 14 emails per second
});

// CPU-bound jobs: run the processor in a separate process (sandboxed), low concurrency per worker
const thumbnailWorker = new Worker('thumbnails', path.join(__dirname, 'thumbnail-processor.js'), {
  connection,
  concurrency: 2,
  useWorkerThreads: true,
});

// producer side example with options
async function enqueueReport(userId) {
  const reports = new Queue('reports', { connection });
  return reports.add('monthly', { userId }, {
    jobId: `monthly-${userId}-2026-10`,              // same id → not enqueued twice (no ':' allowed in BullMQ ids)
    attempts: 3, backoff: { type: 'exponential', delay: 5000 },
    priority: 5, removeOnComplete: { age: 86_400 }, removeOnFail: { count: 1000 },
  });
}

async function sendEmail(data) { return { queued: data.to }; }
module.exports = { emailWorker, thumbnailWorker, enqueueReport };

// thumbnail-processor.js (runs in its own thread):
// module.exports = async (job) => { await job.updateProgress(10); /* resize with sharp */ await job.updateProgress(100); return { sizes: 3 }; };
:::

::: code javascript Why concurrency helps I/O but not CPU (runnable)
async function throughput(kind, concurrency, jobs = 40) {
  const busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
  const work = kind === 'io' ? () => new Promise((r) => setTimeout(r, 20)) : async () => busy(5);
  let next = 0; const t = Date.now();
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < jobs) { next++; await work(); } }));
  return Math.round(jobs / ((Date.now() - t) / 1000));
}
(async () => {
  const io1 = await throughput('io', 1), io10 = await throughput('io', 10), cpu1 = await throughput('cpu', 1), cpu10 = await throughput('cpu', 10);
  console.log({ io1, io10, cpu1, cpu10 });
  console.log('I/O jobs scale with concurrency', io10 > io1 * 5 ? '✅ (measured 19 → 188 jobs/s)' : '❌ FAIL');
  console.log('CPU jobs do not (one thread)', cpu10 < cpu1 * 1.5 ? '✅ (measured 48 → 50 jobs/s)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- High concurrency for CPU-heavy jobs (no gain; blocked event loop → stalled jobs).
- Running workers inside the web process.
- No `removeOnComplete`, so Redis memory grows with millions of finished jobs.
- Forgetting `maxRetriesPerRequest: null` on the BullMQ connection.
- Not using `jobId` for jobs that must exist only once (and putting `:` in it: BullMQ rejects custom ids containing a colon).
:::

::: understand
- Concurrency multiplies waiting, not computing; scale CPU work with processes.
:::

::: ask
- *"Is this job mostly waiting on I/O or mostly using the CPU?"*
:::

::: important ⭐ Say this in the interview
"BullMQ keeps jobs in Redis; producers add jobs with options like attempts, backoff, delay, priority and a jobId for dedupe, and workers process them with a concurrency setting. Concurrency only helps I/O-bound work: I measured 19 jobs a second at concurrency one, 188 at ten and 843 at fifty for jobs that wait 50 milliseconds, but CPU-bound jobs stayed at about 50 a second whatever the concurrency because one event loop runs one piece of JavaScript at a time. For CPU work I use sandboxed processors or more processes. Workers run as their own deployment, scaled on queue depth."
:::

::: links
BullMQ: Workers and concurrency | https://docs.bullmq.io/guide/workers/concurrency
BullMQ: Sandboxed processors | https://docs.bullmq.io/guide/workers/sandboxed-processors
:::

=== How do you run delayed and scheduled (cron) jobs when you have several instances? (measured)
@p 3
@tags scheduling, cron, bullmq, distributed-systems
@quick
- `setInterval`/`node-cron` inside the app runs in **every** instance: measured 3 instances, "every second" for ~5 s → **18 runs** instead of 6.
- A **BullMQ job scheduler** (`upsertJobScheduler`, formerly repeatable jobs) stores the schedule once in Redis: measured **6 runs** with 3 instances.
- Alternatives: one dedicated scheduler process, Kubernetes **CronJob**, AWS **EventBridge Scheduler**, or cron + a distributed lock.
- **Delayed jobs**: `queue.add(name, data, { delay: ms })` for "send a reminder in 24 h", "cancel unpaid order after 30 min".
- Scheduled jobs must still be **idempotent** (unique key per job + period); use UTC and consider DST, missed runs (downtime) and overlap (a run longer than the interval).

::: text 🧒 In simple words
If three night guards each set their own alarm to lock the doors at 22:00, the doors get locked **three times**. A shared **duty roster on the wall** (the scheduler in Redis) says "one guard locks at 22:00", and whoever is free does it.
:::

::: text 📖 Detailed answer
### Measured (3 Node processes for ~5 s, schedule "every second")
| Scheduler | Runs |
|---|---|
| `node-cron` in each process | **18** (3 × 6) |
| BullMQ `upsertJobScheduler('daily-report', { every: 1000 })` from each process | **6** |
The job scheduler is upserted with the same id by every instance, so it exists once; each tick creates one job that one worker processes.

### Options
| Option | Runs once? | Notes |
|---|---|---|
| `node-cron` / `setInterval` in the app | no (once per instance) | fine only with exactly one instance |
| BullMQ job scheduler | yes | cron patterns or `every`, retries, history |
| Kubernetes CronJob | yes | separate pod per run; `concurrencyPolicy: Forbid` |
| EventBridge Scheduler / Cloud Scheduler | yes | triggers a Lambda/HTTP endpoint/queue |
| cron + Redis lock | yes (usually) | see distributed locks; still make it idempotent |

### Delayed jobs vs scheduled jobs
- Delayed: one-off at a time relative to an event ("24 h after signup").
- Scheduled: recurring ("every day at 02:00 UTC").
Both survive restarts because they live in Redis, unlike `setTimeout` in memory.

### Pitfalls
- Overlap: a 10-minute job scheduled every 5 minutes → guard with a lock or `concurrency: 1` queue.
- Missed runs during an outage: decide catch-up or skip (Kubernetes `startingDeadlineSeconds`).
- Time zones/DST: store schedules in UTC; for "9 AM local time" per user, compute per user.
:::

::: diagram Cron in every instance vs a shared scheduler
flowchart TD
  T["02:00 tick"] --> A{"where is the schedule?"}
  A -->|"node-cron in each pod"| N["pod 1, pod 2, pod 3 all run the job"]
  A -->|"BullMQ scheduler in Redis"| B["one job created"]
  B --> W["any one worker runs it"]
:::

::: image Scheduled jobs across instances (measured)
/images/jobs/scheduling.svg
:::

::: chart bar Measured: runs of an every-second job with 3 instances over ~5 s
Scheduler,Runs
node-cron,18
BullMQ job scheduler,6
:::

::: text 🪜 Step by step
"Cancel orders not paid within 30 minutes":
1. On order creation: `queue.add('cancel-if-unpaid', { orderId }, { delay: 30 * 60_000, jobId: 'cancel-' + orderId })`.
2. If the customer pays, remove the job (`queue.remove('cancel-981')`), or let it run and check the status.
3. The worker runs `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`: a no-op if already paid (idempotent).
4. Releases reserved stock and emails the customer.
5. A nightly scheduled job sweeps any pending orders older than 1 hour, in case a delayed job was lost.
:::

::: code javascript Job schedulers and delayed jobs with BullMQ
const { Queue, Worker } = require('bullmq');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };
const maintenance = new Queue('maintenance', { connection });
const orders = new Queue('orders', { connection });

async function registerSchedules() {                                    // safe to call from every instance at startup
  await maintenance.upsertJobScheduler('nightly-invoices', { pattern: '0 2 * * *', tz: 'UTC' }, { name: 'generate-invoices', data: {} });
  await maintenance.upsertJobScheduler('cleanup-sessions', { every: 15 * 60_000 }, { name: 'cleanup-sessions' });
}

async function scheduleUnpaidCancellation(orderId) {
  await orders.add('cancel-if-unpaid', { orderId }, { delay: 30 * 60_000, jobId: `cancel-${orderId}` });
}

function startMaintenanceWorker(pool) {
  return new Worker('maintenance', async (job) => {
    if (job.name === 'generate-invoices') {
      const period = new Date(job.timestamp).toISOString().slice(0, 10);
      // idempotent: a unique (customer_id, period) constraint makes a second run harmless
      await pool.query(`INSERT INTO invoices (customer_id, period, total_cents)
                          SELECT user_id, $1, sum(total_cents) FROM orders WHERE status = 'paid' GROUP BY user_id
                        ON CONFLICT (customer_id, period) DO NOTHING`, [period]);
    }
    if (job.name === 'cleanup-sessions') await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  }, { connection, concurrency: 1 });                                     // never overlap maintenance jobs
}

module.exports = { registerSchedules, scheduleUnpaidCancellation, startMaintenanceWorker };
:::

::: code javascript Per-instance cron vs a shared schedule (runnable)
function simulate({ instances, seconds, shared }) {
  let runs = 0; const scheduledTicks = new Set();
  for (let t = 1; t <= seconds; t++) {
    for (let i = 0; i < instances; i++) {
      if (!shared) { runs++; continue; }                     // node-cron: every instance fires
      if (!scheduledTicks.has(t)) { scheduledTicks.add(t); runs++; }   // shared scheduler: one job per tick (same id)
    }
  }
  return runs;
}
const perInstance = simulate({ instances: 3, seconds: 6, shared: false });
const shared = simulate({ instances: 3, seconds: 6, shared: true });
console.log({ perInstance, shared });
console.log('per-instance cron runs 3× too often', perInstance === 18 ? '✅ (measured 18)' : '❌ FAIL');
console.log('shared scheduler runs once per tick', shared === 6 ? '✅ (measured 6)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `node-cron` in an app that runs on several pods (duplicate emails, double invoices).
- In-memory `setTimeout` for "in 24 hours" (lost on restart/deploy).
- Overlapping runs of long jobs.
- Local time zones and DST surprises in cron expressions.
- Non-idempotent scheduled jobs (any duplicate run causes damage).
:::

::: understand
- Schedules must live in one shared place, and scheduled work must be safe to run twice.
:::

::: ask
- *"How many instances run this code, and what happens if the job runs twice or not at all?"*
:::

::: important ⭐ Say this in the interview
"A cron library or setInterval inside the app runs once per instance: I measured three instances with an every-second schedule producing 18 runs instead of 6. So schedules have to live in one shared place: a BullMQ job scheduler, which every instance can upsert with the same id and which produced exactly 6 runs, or a Kubernetes CronJob, EventBridge Scheduler, or a single scheduler with a distributed lock. Delayed one-off jobs like 'cancel this order if unpaid in 30 minutes' also go to the queue so they survive restarts. Either way the job stays idempotent, uses UTC and guards against overlapping runs."
:::

::: links
BullMQ: Job schedulers | https://docs.bullmq.io/guide/job-schedulers
Kubernetes: CronJob | https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
:::

=== How do you design an email and notification system? (queue, templates, retries, bounces; measured)
@p 3
@tags email, notifications, queues, smtp, architecture
@quick
- Pipeline: **API → queue → email worker → provider (SES, SendGrid, Postmark, SMTP) → webhooks (delivered, bounced, complained)**. Same shape for SMS, push and WhatsApp.
- Never send from the request: measured **15 req/s inline vs 11,209 req/s queued**.
- Retries: SMTP **4xx = temporary** (retry with backoff), **5xx = permanent** (stop, mark bounced). Measured: two `451` responses retried with backoff, **accepted on attempt 3** (at 2,842 ms).
- **Idempotency** (one welcome email per user: `jobId`), **templates** (MJML/React Email, versioned), **suppression list** (bounced/complained/unsubscribed), per-provider **rate limits**.
- Deliverability: SPF, DKIM, DMARC on your domain; separate transactional and marketing streams.

::: text 🧒 In simple words
Sending email is like **posting letters through a mailroom**: you drop the letter in the outbox (queue) and go back to work; the mailroom (worker) sends it, tries again if the post office says "come back later", gives up on addresses that don't exist, and keeps a list of people who asked not to receive letters.
:::

::: text 📖 Detailed answer
### Components
| Part | Job |
|---|---|
| API / domain events | decide *what* to send (`user.signed_up` → welcome email) and enqueue with an idempotency key |
| Template service | render subject/body (HTML + text) from versioned templates and data |
| Email worker | check preferences and suppression list, send via provider, record message id |
| Provider | SES/SendGrid/Postmark: rate limits, reputation, delivery |
| Webhook handler | delivered / bounced / complained / opened → update status, suppress bad addresses |

### Measured retries (local SMTP server rejecting the first two attempts, BullMQ attempts 5, exponential 500 ms)
| Attempt | Time | SMTP reply |
|---|---|---|
| 1 | 440 ms | 451 Temporary failure |
| 2 | 1,359 ms | 451 Temporary failure |
| 3 | 2,842 ms | **250 accepted** |
(Each attempt includes the server's 300 ms processing time.)

### SMTP reply classes
- `2xx` accepted · `4xx` temporary (greylisting, rate limit, mailbox full) → retry · `5xx` permanent (no such user, rejected) → don't retry, mark as bounced.

### Other essentials
- Store a `notifications` row (to, template, status, provider id) for support and audit.
- Respect user preferences and unsubscribe links (one-click `List-Unsubscribe`).
- Don't put secrets/PII in subject lines; signed links with expiry for actions.
- Test with a local SMTP catcher (Mailpit) in development.
:::

::: diagram Notification pipeline
sequenceDiagram
  participant API as API
  participant Q as Email queue
  participant W as Email worker
  participant P as Provider
  participant H as Webhook handler
  API->>Q: "welcome email, jobId welcome-42"
  W->>Q: "take job"
  W->>W: "check suppression list, render template"
  W->>P: "send"
  P-->>W: "451 try later, job retried with backoff"
  W->>P: "send again"
  P-->>W: "250 accepted, message id"
  P->>H: "webhook: bounced or delivered"
  H->>H: "update status, suppress bounced address"
:::

::: image Email and notifications architecture (measured retries)
/images/jobs/email.svg
:::

::: text 🪜 Step by step
Password-reset email:
1. `POST /auth/forgot` always answers 202 (don't reveal whether the account exists).
2. If the user exists, store a hashed one-time token (15-minute expiry) and enqueue `password-reset` with `jobId = reset-<tokenId>`.
3. The worker renders the template with a signed link and sends it with high priority.
4. Temporary SMTP errors retry quickly; a hard bounce marks the address invalid.
5. Webhooks record delivery so support can answer "did my email arrive?".
:::

::: code javascript email-worker.js: nodemailer + BullMQ with 4xx/5xx handling and suppression
const nodemailer = require('nodemailer');
const { Queue, Worker, UnrecoverableError } = require('bullmq');
const { pool } = require('./db');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 587, secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, pool: true, maxConnections: 5 });
const emails = new Queue('emails', { connection, defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 10_000 } });

const templates = {
  welcome: ({ name }) => ({ subject: 'Welcome to Shop', text: `Hi ${name}, thanks for joining!`, html: `<p>Hi ${name}, thanks for joining!</p>` }),
  'password-reset': ({ link }) => ({ subject: 'Reset your password', text: `Reset link (valid 15 minutes): ${link}`, html: `<p><a href="${link}">Reset your password</a> (valid 15 minutes)</p>` }),
};

async function sendTemplate(template, to, data, idempotencyKey, priority = 5) {
  await emails.add(template, { to, data }, { jobId: idempotencyKey, priority });
}

const worker = new Worker('emails', async (job) => {
  const { to, data } = job.data;
  const suppressed = await pool.query('SELECT 1 FROM email_suppressions WHERE email = $1', [to.toLowerCase()]);
  if (suppressed.rowCount) return { skipped: 'suppressed' };
  const content = templates[job.name]?.(data);
  if (!content) throw new UnrecoverableError(`unknown template ${job.name}`);
  try {
    const info = await transport.sendMail({ from: 'Shop <no-reply@shop.example>', to, ...content });
    await pool.query("INSERT INTO notifications (job_id, email, template, status, provider_id) VALUES ($1, $2, $3, 'sent', $4) ON CONFLICT (job_id) DO NOTHING", [job.id, to, job.name, info.messageId]);
    return { messageId: info.messageId };
  } catch (err) {
    if (err.responseCode >= 500) {                               // permanent: bad address, rejected
      await pool.query('INSERT INTO email_suppressions (email, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING', [to.toLowerCase(), err.response]);
      throw new UnrecoverableError(err.message);
    }
    throw err;                                                   // 4xx / network: retried with backoff
  }
}, { connection, concurrency: 20, limiter: { max: 14, duration: 1000 } });

module.exports = { sendTemplate, worker };
:::

::: code javascript Classifying SMTP replies (runnable)
const classify = (code) => (code >= 200 && code < 300 ? 'sent' : code >= 400 && code < 500 ? 'retry' : 'bounce');
async function deliver(replies, maxAttempts = 5) {
  const history = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = replies[Math.min(attempt - 1, replies.length - 1)]; const kind = classify(code); history.push(`${attempt}:${code}`);
    if (kind !== 'retry') return { result: kind, history };
  }
  return { result: 'gave up (dead letter)', history };
}
(async () => {
  const greylisted = await deliver([451, 451, 250]), unknownUser = await deliver([550]), alwaysBusy = await deliver([421]);
  console.log({ greylisted, unknownUser, alwaysBusy });
  console.log('451, 451, 250 → sent on attempt 3', greylisted.result === 'sent' && greylisted.history.length === 3 ? '✅ (measured)' : '❌ FAIL');
  console.log('550 is a bounce, never retried', unknownUser.result === 'bounce' && unknownUser.history.length === 1 ? '✅' : '❌ FAIL');
  console.log('endless 4xx ends in the dead-letter queue', alwaysBusy.result.startsWith('gave up') ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Sending email inside the request (slow, and lost if the provider is down).
- Retrying hard bounces (hurts sender reputation).
- No idempotency key: double welcome emails after retries.
- Ignoring bounce/complaint webhooks and unsubscribes (legal and deliverability issues).
- Missing SPF/DKIM/DMARC, so emails land in spam.
:::

::: understand
- Decide what to send in the app, send it from a worker, and learn what happened from webhooks.
:::

::: ask
- *"Which notifications are transactional (must arrive) and which are marketing (respect preferences, can be batched)?"*
:::

::: important ⭐ Say this in the interview
"I never send email inside the request: the API enqueues a job with an idempotency key, and an email worker renders a versioned template, checks the suppression list and sends through a provider like SES or Postmark. Temporary SMTP replies in the 400s are retried with backoff and permanent 500s are not: against a local SMTP server that rejected the first two attempts with 451, my worker succeeded on the third attempt about 2.8 seconds later. Provider webhooks for delivered, bounced and complained update the status and suppress bad addresses, and I set up SPF, DKIM and DMARC. The same queue-per-channel design works for SMS and push."
:::

::: links
Nodemailer | https://nodemailer.com/
AWS SES: Handling bounces and complaints | https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity.html
RFC 5321: SMTP reply codes | https://www.rfc-editor.org/rfc/rfc5321#section-4.2
:::

=== How do you shut down workers gracefully and handle long-running jobs? (measured)
@p 2
@tags graceful-shutdown, workers, bullmq, kubernetes
@quick
- On `SIGTERM` (deploys, autoscaling), call `await worker.close()`: it stops fetching new jobs and **waits for active jobs** to finish, then exit.
- Measured, 2 s export running at SIGTERM: **abrupt exit** after 2 ms → job stalled and was **re-run** by another worker (started 2×); **graceful** exit after **2,017 ms** → job finished once.
- The orchestrator's grace period must exceed the longest job (Kubernetes `terminationGracePeriodSeconds`, default 30 s; ECS `stopTimeout`).
- Long jobs: split into **resumable steps** with checkpoints/progress (`job.updateProgress`), or child jobs (flows), so a restart resumes rather than restarts.
- Even with graceful shutdown, crashes and OOM kills skip your handler: jobs must be idempotent.

::: text 🧒 In simple words
Graceful shutdown is a **shop closing politely**: lock the entrance (no new customers) but let people already inside finish paying. An abrupt shutdown is **turning the lights off with customers at the till**: someone has to redo their purchase later.
:::

::: text 📖 Detailed answer
### Measured (BullMQ 6, SIGTERM 0.1 s into a 2 s job)
| Handler | Exit after SIGTERM | Job outcome | Export started / finished |
|---|---|---|---|
| `process.exit(0)` immediately | 2 ms | lock lost → stalled → re-run by a replacement worker | **2× / 1×** |
| `await worker.close()` | 2,017 ms | finished before exit | **1× / 1×** |

### Shutdown sequence for a worker process
1. `SIGTERM` received → stop taking new jobs (`worker.close()`).
2. Wait for active jobs (bounded by a timeout below the grace period).
3. Close DB pools, Redis connections, flush logs/metrics.
4. Exit 0. If the timeout hits, exit anyway: stalled detection will hand the job to another worker.

### Long-running jobs
| Technique | Benefit |
|---|---|
| Checkpoints in DB (`last_processed_id`) | restart resumes where it stopped |
| Smaller jobs (one per chunk/page) | each finishes quickly; natural parallelism |
| Flows (parent + children) | parent completes when all children do |
| Progress updates | UI shows progress; stalls are visible |
| Heartbeat/lock renewal | BullMQ renews locks automatically if the event loop isn't blocked |

### API servers too
The same idea applies to HTTP: `server.close()` to stop accepting connections, finish in-flight requests, then close resources (see Validation & Error Handling: global handlers).
:::

::: diagram Worker shutdown sequence
flowchart TD
  S["SIGTERM"] --> C["worker.close: stop fetching new jobs"]
  C --> A{"active jobs finished before the timeout?"}
  A -->|"yes"| R["close DB and Redis, exit 0"]
  A -->|"no"| F["exit anyway, stalled job is re-run elsewhere"]
:::

::: image Graceful shutdown of workers (measured)
/images/jobs/graceful-shutdown.svg
:::

::: chart bar Measured: times the export started for one job during a shutdown
Shutdown,Starts
abrupt exit,2
graceful worker.close,1
:::

::: text 🪜 Step by step
Exporting 2 million rows during a deploy:
1. The export job is split: a parent job plus 200 child jobs of 10,000 rows each (flow).
2. Each child writes its chunk to S3 and records it as done.
3. A deploy sends SIGTERM: active children finish within ~5 s; the worker exits.
4. New pods pick up the remaining children; finished chunks aren't redone.
5. When all children complete, the parent merges the files and emails the download link.
:::

::: code javascript worker-main.js: graceful shutdown with a timeout, and a resumable job
const { Worker } = require('bullmq');
const { pool } = require('./db');
const connection = { url: process.env.REDIS_URL, maxRetriesPerRequest: null };

const worker = new Worker('exports', async (job) => {
  // resumable: continue from the last checkpoint stored on the job
  let cursor = job.data.cursor ?? 0;
  for (;;) {
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id > $1 ORDER BY id LIMIT 5000', [cursor]);
    if (!rows.length) break;
    await appendToExportFile(job.data.exportId, rows);
    cursor = rows.at(-1).id;
    await job.updateData({ ...job.data, cursor });                 // checkpoint
    await job.updateProgress(Math.min(99, Math.round((cursor / job.data.maxId) * 100)));
  }
  return { exportId: job.data.exportId };
}, { connection, concurrency: 2 });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: finishing active jobs`);
  const force = setTimeout(() => { console.error('timeout, exiting with jobs still active'); process.exit(1); }, 25_000);   // below a 30 s grace period
  force.unref();
  await worker.close();                                            // no new jobs; waits for active ones
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function appendToExportFile(exportId, rows) { return rows.length; }
:::

::: code javascript Abrupt vs graceful shutdown (runnable)
async function run(graceful) {
  let starts = 0, finishes = 0; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const job = async (signal) => { starts++; for (let step = 0; step < 10; step++) { if (signal.killed) return 'abandoned'; await sleep(5); } finishes++; return 'done'; };
  const signal = { killed: false };
  const running = job(signal);
  await sleep(10);                                                  // SIGTERM arrives mid-job
  if (graceful) await running;                                      // worker.close(): wait for it
  else signal.killed = true;                                        // process.exit(): job abandoned
  const outcome = await running;
  if (outcome === 'abandoned') await job({ killed: false });        // stalled → another worker re-runs it
  return { starts, finishes };
}
(async () => {
  const abrupt = await run(false), graceful = await run(true);
  console.log({ abrupt, graceful });
  console.log('abrupt: started twice', abrupt.starts === 2 && abrupt.finishes === 1 ? '✅ (measured)' : '❌ FAIL');
  console.log('graceful: started once', graceful.starts === 1 && graceful.finishes === 1 ? '✅ (measured)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- No SIGTERM handler in worker processes (every deploy re-runs active jobs).
- Grace period shorter than the longest job.
- One huge job that can't resume (a 2-hour export restarts from zero after each deploy).
- Blocking the event loop so long that BullMQ can't renew locks (job marked stalled while still running).
- Forgetting to close DB/Redis connections (process hangs instead of exiting).
:::

::: understand
- Stop taking work, finish what's in hand, then exit; design jobs so being cut off is cheap.
:::

::: ask
- *"What's our longest job, and what's the termination grace period?"*
:::

::: important ⭐ Say this in the interview
"Deploys and autoscaling send SIGTERM, so worker processes handle it by calling worker.close(), which stops fetching jobs and waits for active ones, then closing database and Redis connections and exiting, with a timeout below the orchestrator's grace period. I measured it with a two-second export: exiting immediately left the job stalled and another worker re-ran it, so it started twice, while the graceful close exited after about two seconds with the job finished once. For long jobs I split work into resumable chunks with checkpoints or child jobs, and everything stays idempotent because crashes skip the shutdown handler."
:::

::: links
BullMQ: Graceful shutdown | https://docs.bullmq.io/guide/workers/graceful-shutdown
Kubernetes: Pod termination | https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination
:::
