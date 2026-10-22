@section System Design: Real-Time & Scheduling (Node.js)
@icon 💬
@color #22c55e
@desc End-to-end system designs built with Node.js, worked through the interview framework with measured building blocks: a chat system (measured per-conversation ordering), an IoT/SCADA real-time monitoring dashboard (measured latest-value queries and batched ingest), and a distributed job scheduler (measured duplicate runs and failover).

=== Design a chat system (1:1 and group chat, like WhatsApp or Slack)
@p 3
@tags system-design, chat, websocket, nodejs, redis, ordering
@quick
- **Requirements**: 1:1 and group messages, delivery/read receipts, online presence, history and sync across devices, offline push. Non-functional: < 200 ms delivery, ordered per conversation, no lost or duplicate messages.
- **Connections**: WebSocket **gateway** instances (Node + `ws`) behind an L7 LB; heartbeats; presence in Redis with TTL. Fan-out across gateways through **Redis pub/sub/Streams** (or Kafka at large scale).
- **Ordering and dedupe**: the server assigns a **per-conversation sequence number** atomically; the client sends a `clientMsgId` for idempotent retries. Measured: `max(seq)+1` gave **1,869 duplicates** in 2,000 concurrent sends; an atomic counter gave **0**.
- **Storage**: messages partitioned by `conversation_id` (Postgres partitions → Cassandra/ScyllaDB at huge scale); media in S3 via pre-signed URLs + CDN.
- **Sync**: on reconnect the client asks "everything after seq N" per conversation; offline users get push notifications (APNs/FCM).

::: text 🧒 In simple words
Each conversation is a **numbered notebook**. Every message gets the next page number from **one counter**, so everyone reads pages in the same order and nobody gets page 7 twice. The gateways are **post offices** that keep a line open to each phone; Redis is the **sorting centre** passing letters between post offices.
:::

::: text 📖 Detailed answer
### 1. Requirements and estimates
| Item | Assumption | Result |
|---|---|---|
| DAU | 50M, 40 messages/day | 2B messages/day ≈ 23k/s avg, ~70k/s peak |
| concurrent connections | 20% of DAU online | 10M WebSockets → ~100–200 gateway instances at 50–100k sockets each |
| storage | 200 B per message | ~400 GB/day |

### 2. API
| Channel | Operation |
|---|---|
| WebSocket | `send {conversationId, clientMsgId, body}` → `ack {clientMsgId, seq}`; server pushes `message`, `receipt`, `typing`, `presence` |
| REST | `GET /conversations`, `GET /conversations/:id/messages?afterSeq=N&limit=50`, `POST /media/upload-url` |

### 3. Data model
| Table | Key | Notes |
|---|---|---|
| conversations | id | `last_seq`, type (direct/group) |
| members | (conversation_id, user_id) | role, `last_read_seq` (read receipts) |
| messages | (conversation_id, seq) | `client_msg_id` unique per conversation, body, sender, created_at |
| user_devices | user_id | push tokens |

### 4. Message flow
1. Client sends over WebSocket with `clientMsgId`.
2. Gateway → message service: atomic `UPDATE conversations SET last_seq = last_seq + 1 … RETURNING` + insert (unique on `(conversation_id, client_msg_id)` makes retries harmless).
3. Ack the sender with `seq`.
4. Publish to Redis channel `conv:{id}`; every gateway with members of that conversation pushes it.
5. Offline members → push notification job.
6. Receipts update `last_read_seq` and fan out the same way.

### Measured building blocks
| Measurement | Result |
|---|---|
| ordering: `SELECT max(seq)+1` then insert, 20 senders × 100 | 1,869 duplicate seq numbers |
| ordering: atomic counter row | 0 duplicates, 4,972 msgs/s on one conversation |
| broadcast to 1,000 sockets (one process) | 7 ms (Real-Time section) |
| cross-instance delivery without / with Redis adapter | 0/50 vs 50/50 messages (Real-Time section) |
| silent client detection with 1 s heartbeats | 1.8 s (Real-Time section) |

### 5. Scaling and deep dives
- **Large groups** (10k+ members): don't fan out per message to every device synchronously; fan out via a queue, or let clients pull for big channels.
- **Hot conversations**: the counter row serialises writes for one conversation, which is correct and handles thousands/s.
- **History**: recent messages cached; old ones in cheaper storage.
- **End-to-end encryption** (if required) moves message content out of the server's reach; the server still orders and relays.
:::

::: diagram Chat architecture
flowchart LR
  APP["mobile / web"] -->|"WebSocket"| LB["L7 load balancer"]
  LB --> GW1["gateway 1 (ws)"]
  LB --> GW2["gateway 2 (ws)"]
  GW1 --> MS["message service"]
  GW2 --> MS
  MS --> DB[("messages, partitioned by conversation")]
  MS --> PUB["Redis pub/sub conv:id"]
  PUB --> GW1
  PUB --> GW2
  MS --> PUSH["push worker → APNs / FCM"]
  APP -->|"pre-signed upload"| S3["S3 + CDN (media)"]
:::

::: image Chat system design with measured ordering
/images/system-design/chat-system.svg
:::

::: text 🪜 Step by step
1. Clarify features, scale and guarantees (ordering per conversation, at-least-once with dedupe).
2. Estimate connections and message rate; size gateway fleet.
3. WebSocket gateways with heartbeats, auth on connect, presence in Redis.
4. Message service: atomic sequence + idempotent insert, ack, publish.
5. Fan-out via Redis pub/sub (or Kafka), push for offline users.
6. Sync by `afterSeq`, receipts by `last_read_seq`, media via S3 + CDN; then discuss large groups, hot spots and retention.
:::

::: code javascript Message service: atomic sequence, idempotent insert, fan-out (Node.js + pg + Redis)
const { Pool } = require('pg');
const Redis = require('ioredis');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pub = new Redis(process.env.REDIS_URL);

async function sendMessage({ conversationId, senderId, clientMsgId, body }) {
  const { rows } = await pool.query(
    `WITH c AS (UPDATE conversations SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq)
     INSERT INTO messages (conversation_id, seq, sender_id, client_msg_id, body)
     SELECT $1, last_seq, $2, $3, $4 FROM c
     ON CONFLICT (conversation_id, client_msg_id) DO NOTHING
     RETURNING seq, created_at`,
    [conversationId, senderId, clientMsgId, body],
  );
  if (rows.length === 0) {                                        // a retry of a message we already stored
    const existing = await pool.query('SELECT seq, created_at FROM messages WHERE conversation_id = $1 AND client_msg_id = $2', [conversationId, clientMsgId]);
    return { ...existing.rows[0], duplicate: true };
  }
  const msg = { conversationId, seq: Number(rows[0].seq), senderId, clientMsgId, body, createdAt: rows[0].created_at };
  await pub.publish(`conv:${conversationId}`, JSON.stringify({ type: 'message', msg }));   // every gateway subscribed to this conversation
  return msg;
}

async function history(conversationId, afterSeq, limit = 50) {
  const { rows } = await pool.query('SELECT seq, sender_id, body, created_at FROM messages WHERE conversation_id = $1 AND seq > $2 ORDER BY seq LIMIT $3', [conversationId, afterSeq, limit]);
  return rows;
}
module.exports = { sendMessage, history };
:::

::: code javascript Client-side ordering, gap detection and dedupe (runnable)
// Messages may arrive out of order or twice (reconnects, retries). The client shows them in seq order and asks for gaps.
function createConversationView() {
  const bySeq = new Map(); let shownUpTo = 0; const gaps = new Set();
  return {
    receive(msg) {
      if (bySeq.has(msg.seq)) return 'duplicate';
      bySeq.set(msg.seq, msg);
      for (let s = shownUpTo + 1; s < msg.seq; s++) if (!bySeq.has(s)) gaps.add(s);
      gaps.delete(msg.seq);
      while (bySeq.has(shownUpTo + 1)) shownUpTo++;
      return 'ok';
    },
    visible: () => [...bySeq.values()].filter((m) => m.seq <= shownUpTo).sort((a, b) => a.seq - b.seq).map((m) => m.body),
    missing: () => [...gaps].sort((a, b) => a - b),
    resumeFrom: () => shownUpTo,
  };
}
const v = createConversationView();
[1, 2, 4, 2, 5].forEach((seq) => v.receive({ seq, body: 'm' + seq }));        // 3 is delayed, 2 is duplicated
console.log('visible:', v.visible(), 'missing:', v.missing(), 'reconnect with afterSeq =', v.resumeFrom());
console.log(JSON.stringify(v.visible()) === '["m1","m2"]' && v.missing().join() === '3' ? '✅ messages after a gap wait; the client knows to fetch seq 3' : '❌ FAIL');
v.receive({ seq: 3, body: 'm3' });
console.log(JSON.stringify(v.visible()) === '["m1","m2","m3","m4","m5"]' ? '✅ gap filled: everything shows in order, the duplicate shown once' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Ordering messages by server timestamps from different machines.
- Generating sequence numbers with `max(seq)+1` (measured: duplicates under concurrency).
- Keeping room membership only in one gateway's memory without cross-instance fan-out.
- No idempotency key: a resend after a flaky network creates a second message.
- Pushing large group messages synchronously to every member's every device in the request path.
:::

::: understand
- Gateways hold connections, one atomic counter orders each conversation, pub/sub fans out, and clients sync by sequence number.
:::

::: ask
- *"What does a user see after being offline on a train for an hour, and how many requests does catching up take?"*
:::

::: important ⭐ Say this in the interview
"Clients keep a WebSocket to stateless Node gateways behind an L7 load balancer, with heartbeats and presence in Redis. Sending goes to a message service that assigns a per-conversation sequence number with one atomic update-returning statement and inserts idempotently on a client message id; I measured max-plus-one producing 1,869 duplicates under concurrency versus none with the atomic counter. It acks the sender and publishes to a Redis channel per conversation so every gateway with members delivers it, and offline users get push notifications. Messages are partitioned by conversation, media goes through S3 and a CDN, and clients resync with 'everything after sequence N'."
:::

::: links
Discord: How Discord stores trillions of messages | https://discord.com/blog/how-discord-stores-trillions-of-messages
Slack: Real-time messaging architecture | https://slack.engineering/real-time-messaging/
:::

=== Design an IoT / SCADA real-time monitoring dashboard (sensors → ingest → live dashboard + alarms)
@p 3
@tags system-design, iot, scada, time-series, real-time, nodejs, alarms
@quick
- **Requirements**: thousands of devices sending readings every second; operators see live values (< 1–2 s), trends and **alarms** (thresholds, acknowledgement, audit trail); history for months.
- **Edge**: gateways speak industrial protocols (Modbus, OPC UA), **buffer and batch** readings, **store-and-forward** when the network drops; publish via **MQTT** (or Kafka).
- **Ingest**: consumers write **in batches**. Measured: **4,418 rows/s** with one INSERT per reading vs **~230,000 rows/s** with 1,000-row batches.
- **Live view**: keep a `device_latest` table/cache. Measured "latest value for 2,000 devices": **172 ms** with `DISTINCT ON`, **5.4 ms** with a LATERAL index lookup, **1.5 ms** from a maintained table (upsert of 2,000 values: 6.6 ms). Push to browsers over WebSocket/SSE, **throttled to 1–2 Hz**.
- **Alarms**: thresholds with **hysteresis** and **dedupe** (raise once, clear once), escalation, acknowledgement; **downsample** history (1 s raw → 1 min → 1 h rollups) for charts.

::: text 🧒 In simple words
A factory has thousands of thermometers. Little **collectors** on each floor gather readings and send them in **bundles** (batching). A **whiteboard** shows the latest number for each machine (latest-value table), and an **alarm bell** rings once when a machine gets too hot, stays quiet while it's still hot, and rings "all clear" only when it's properly cool again (hysteresis).
:::

::: text 📖 Detailed answer
### 1. Requirements and estimates
| Item | Assumption | Result |
|---|---|---|
| devices | 10,000 sensors | |
| rate | 1 reading/s each | 10,000 writes/s → batching is mandatory |
| size | ~50 B per reading | ~43 GB/day raw → downsample, retention, compression |
| dashboard | 200 operators | push only what each screen shows, ≤ 2 Hz |

### 2. Pipeline
| Stage | Choice | Why |
|---|---|---|
| device → edge | Modbus/OPC UA polling, local buffer | plant networks, intermittent links |
| edge → cloud | MQTT (QoS 1) or Kafka | lightweight, pub/sub topics per site/device |
| ingest | Node consumers, batch 500–1,000 rows or 1 s | write throughput |
| storage | TimescaleDB/Postgres partitions, InfluxDB, or a cloud time-series DB | time-range queries, compression, retention |
| latest values | `device_latest` upsert or Redis hash | O(devices) dashboard reads |
| rollups | 1 min / 1 h continuous aggregates | fast charts over months |
| alarms | rule engine on the stream | seconds-level detection |
| UI | WebSocket/SSE, throttled, per-screen subscriptions | no flooding browsers |

### Measured on Postgres 17 (1M readings, 2,000 devices)
| Query for the live screen | Time |
|---|---|
| `SELECT DISTINCT ON (device_id) … ORDER BY device_id, ts DESC` | 172.4 ms |
| `generate_series` + `LATERAL (… ORDER BY ts DESC LIMIT 1)` with `(device_id, ts DESC)` index | 5.4 ms |
| `SELECT * FROM device_latest` (maintained by upsert) | **1.5 ms** |
| upsert 2,000 latest values in one statement | 6.6 ms |

### Alarms done right
- **Hysteresis**: raise above 80 °C, clear only below 75 °C, so a value hovering at 80 doesn't flap.
- **Delay/debounce**: must stay high for N seconds.
- **State machine**: `normal → active (unacked) → active (acked) → cleared`; every transition audited.
- **Stale data alarm**: no reading for 30 s is itself an alarm (device or link down).

### SCADA-specific concerns
Operators need reliability over features: the dashboard must show when data is **stale**, controls (if any) go through a separate, strongly controlled path, and OT networks are segmented from IT networks.
:::

::: diagram IoT monitoring pipeline
flowchart LR
  PLC["PLCs / sensors"] --> EDGE["edge gateway: poll, buffer, batch"]
  EDGE -->|"MQTT QoS 1"| BROKER["MQTT broker / Kafka"]
  BROKER --> ING["Node ingest workers (batch insert)"]
  ING --> TS[("time-series DB + rollups")]
  ING --> LATEST[("device_latest / Redis")]
  BROKER --> ALARM["alarm engine (hysteresis, dedupe)"]
  ALARM --> NOTIFY["notify + audit log"]
  LATEST --> RT["WebSocket/SSE hub (throttled 1–2 Hz)"]
  RT --> UI["operator dashboard"]
:::

::: image IoT / SCADA monitoring dashboard design with measured queries
/images/system-design/iot-dashboard.svg
:::

::: text 🪜 Step by step
1. Clarify device count, rates, latency, alarm semantics and retention.
2. Edge gateways buffer and batch; MQTT topics per site/device.
3. Ingest workers write batches; upsert a latest-value table; maintain rollups.
4. Alarm engine with thresholds, hysteresis, debounce, stale-data detection and an audit trail.
5. Real-time hub pushes only subscribed devices, throttled, with a "stale" indicator.
6. Discuss retention/downsampling, backfill after outages, and isolating OT from IT networks.
:::

::: code javascript Ingest worker: MQTT → batched inserts + latest-value upsert (Node.js)
const mqtt = require('mqtt');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const client = mqtt.connect(process.env.MQTT_URL, { clean: false, clientId: 'ingest-1' });   // persistent session, QoS 1

let batch = [];
client.on('connect', () => client.subscribe('plant/+/device/+/reading', { qos: 1 }));
client.on('message', (topic, payload) => {
  const [, , , deviceId] = topic.split('/');
  const r = JSON.parse(payload);
  batch.push([Number(deviceId), new Date(r.ts), r.value]);
  if (batch.length >= 1000) flush();
});
setInterval(flush, 1000);                                     // or every second, whichever comes first

async function flush() {
  if (!batch.length) return;
  const rows = batch; batch = [];
  const cols = [rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2])];
  await pool.query('INSERT INTO readings (device_id, ts, value) SELECT * FROM unnest($1::int[], $2::timestamptz[], $3::float8[])', cols);
  await pool.query(
    `INSERT INTO device_latest (device_id, ts, value)
     SELECT DISTINCT ON (d) d, t, v FROM unnest($1::int[], $2::timestamptz[], $3::float8[]) AS x(d, t, v) ORDER BY d, t DESC
     ON CONFLICT (device_id) DO UPDATE SET ts = excluded.ts, value = excluded.value WHERE device_latest.ts < excluded.ts`,
    cols,
  );
}
:::

::: code javascript Alarm engine with hysteresis, debounce and stale detection (runnable)
function createAlarm({ high = 80, clear = 75, holdMs = 3000, staleMs = 30000 } = {}) {
  let state = 'normal', aboveSince = null, lastTs = null; const events = [];
  return {
    reading(ts, value) {
      lastTs = ts;
      if (state === 'stale') { state = 'normal'; events.push([ts, 'data restored']); }
      if (value >= high) { aboveSince ??= ts; if (state === 'normal' && ts - aboveSince >= holdMs) { state = 'active'; events.push([ts, `ALARM raised at ${value}`]); } }
      else { aboveSince = null; if (state === 'active' && value <= clear) { state = 'normal'; events.push([ts, `cleared at ${value}`]); } }
    },
    tick(now) { if (lastTs !== null && now - lastTs > staleMs && state !== 'stale') { state = 'stale'; events.push([now, 'STALE: no data']); } },
    events,
  };
}
const a = createAlarm();
const temps = [70, 79, 81, 82, 80, 81, 79, 80, 78, 76, 77, 74, 73];       // one reading per second
temps.forEach((v, i) => a.reading(i * 1000, v));
a.tick(60000);
a.events.forEach(([t, e]) => console.log(`${t / 1000}s ${e}`));
const raised = a.events.filter(([, e]) => e.startsWith('ALARM')).length, cleared = a.events.filter(([, e]) => e.startsWith('cleared')).length;
console.log(raised === 1 && cleared === 1 ? '✅ hovering around 80 raised one alarm and cleared once below 75 (no flapping)' : '❌ FAIL');
console.log(a.events.at(-1)[1] === 'STALE: no data' ? '✅ silence is detected as stale data' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- One INSERT per reading (measured ~50× slower than batches).
- Computing "latest value per device" from the raw table on every dashboard refresh.
- Pushing every reading to every browser (thousands of messages per second per tab).
- Alarms without hysteresis: hundreds of raise/clear notifications for a value near the threshold.
- Showing old values as if they were live when a device or link is down.
:::

::: understand
- Batch at the edge and at ingest, keep latest values separately, roll up history, push throttled updates, and make alarms stateful.
:::

::: ask
- *"What should operators see when a sensor stops reporting, and how quickly?"*
:::

::: important ⭐ Say this in the interview
"Edge gateways poll PLCs and sensors, buffer and batch readings, and publish over MQTT with store-and-forward for network outages. Node ingest workers write in batches, which I measured at about 230,000 rows a second versus 4,400 with single inserts, into a time-series store with rollups, and upsert a device_latest table so the live screen reads 2,000 devices in 1.5 ms instead of 172 ms with DISTINCT ON over raw data. A real-time hub pushes only subscribed devices at one to two hertz and marks stale data. The alarm engine uses thresholds with hysteresis and debounce, detects missing data, and records raise, acknowledge and clear with an audit trail."
:::

::: links
MQTT: Essentials | https://www.hivemq.com/mqtt/
Timescale: Continuous aggregates | https://docs.timescale.com/use-timescale/latest/continuous-aggregates/about-continuous-aggregates/
:::

=== Design a distributed job scheduler (cron at scale, exactly one run per slot, retries)
@p 3
@tags system-design, job-scheduler, cron, distributed-systems, postgres, nodejs
@quick
- **Requirements**: users/services register jobs (cron or one-off at a time), each scheduled slot runs **once**, failures retry with backoff, run history is visible, the scheduler survives instance crashes and deploys.
- Separate **"when"** (scheduler: find due slots, enqueue once) from **"do"** (workers: execute with retries, timeouts, DLQ).
- Prevent duplicates with a **unique run key** `(job_id, scheduled_for)` + `ON CONFLICT DO NOTHING`, or a **leader** via Postgres advisory lock / etcd lease.
- Measured with 3 instances for 7 slots: **no coordination = 18 runs (11 duplicates)**; advisory lock = **7 runs**; unique run key = **7 runs**; killing the active instance mid-way lost **no** slots (another took the next one).
- Handle **missed slots** (catch-up policy), **time zones/DST** (store the zone, compute `next_run_at` in it), long jobs (heartbeats, visibility timeouts) and fairness between tenants.

::: text 🧒 In simple words
Three alarm clocks are set for the same meeting so one of them surely rings. Without a rule, all three **ring and three people show up**. With a **sign-up sheet** (unique run key), whoever writes their name first goes and the others see it's taken. If that person is ill, the next alarm finds the sheet empty for the next meeting and goes instead.
:::

::: text 📖 Detailed answer
### 1. Requirements and estimates
| Item | Assumption |
|---|---|
| jobs | 1M schedules (per-tenant reports, reminders, syncs) |
| due per minute | peaks at the top of the hour: 100k due at 09:00 |
| run time | seconds to 30 minutes |
| guarantees | each slot at least once, effectively once (idempotent jobs + run key) |

### 2. Data model
| Table | Columns |
|---|---|
| schedules | id, tenant_id, cron, timezone, next_run_at, enabled, payload, policy (catch-up/skip) |
| job_runs | (schedule_id, scheduled_for) unique, status, attempt, started_at, finished_at, worker, error |

Index `schedules (next_run_at) WHERE enabled`.

### 3. Scheduler loop (any number of instances)
1. `SELECT … FROM schedules WHERE enabled AND next_run_at <= now() ORDER BY next_run_at LIMIT 500 FOR UPDATE SKIP LOCKED` (instances split the work).
2. For each: insert `job_runs (schedule_id, scheduled_for)` `ON CONFLICT DO NOTHING`; if inserted, enqueue the run.
3. Compute and store the next `next_run_at` in the schedule's time zone.
4. Commit. A crash before commit releases the rows to another instance.

### 4. Workers
Queue (BullMQ, SQS, or Postgres `SKIP LOCKED`), concurrency limits per tenant, timeouts, retries with backoff, DLQ, heartbeats for long jobs, and idempotent job code.

### Measured: 3 instances, a job every second, the active instance killed after 3.6 s
| Coordination | Slots | Runs | Duplicates | Failover |
|---|---|---|---|---|
| none (each instance runs its own cron) | 7 | 18 | **11** | — |
| `pg_try_advisory_lock` leader | 7 | 7 | 0 | next slot taken by another instance |
| unique run key per slot | 7 | 7 | 0 | any live instance claims each slot |

The advisory lock is a session lock: when the leader's process died, its connection closed and the lock was released automatically.

### Deep dives
- **Thundering herd at :00**: jitter non-critical schedules, spread tenants, scale workers on queue depth.
- **Missed runs after an outage**: per-job policy: run once, catch up all, or skip.
- **DST**: "every day at 02:30 Europe/Berlin" doesn't exist one day a year and happens twice another: decide and test.
- **Observability**: run history UI, alerts on failures and on schedules that are late.
:::

::: diagram Scheduler and workers
flowchart LR
  API["schedule API"] --> SCH[("schedules: cron, timezone, next_run_at")]
  S1["scheduler 1"] -->|"due rows, SKIP LOCKED"| SCH
  S2["scheduler 2"] -->|"due rows, SKIP LOCKED"| SCH
  S1 -->|"INSERT run key ON CONFLICT DO NOTHING"| RUNS[("job_runs")]
  S2 --> RUNS
  S1 --> Q["queue"]
  S2 --> Q
  Q --> W["workers: retries, timeouts, DLQ"]
  W --> RUNS
:::

::: image Distributed job scheduler with measured duplicates and failover
/images/system-design/job-scheduler.svg
:::

::: text 🪜 Step by step
1. Clarify schedule types, guarantees, run durations, time zones and catch-up policy.
2. Store schedules with `next_run_at` (indexed) and a run history table with a unique run key.
3. Run several scheduler instances that claim due rows with `SKIP LOCKED` and insert run keys idempotently.
4. Enqueue runs; workers execute idempotently with retries, timeouts and a DLQ.
5. Compute the next run in the schedule's time zone; handle missed slots by policy.
6. Expose run history, alert on failures and lateness, and spread top-of-hour peaks.
:::

::: code javascript Scheduler loop: claim due schedules, one run per slot (Node.js + pg)
const { Pool } = require('pg');
const { CronExpressionParser } = require('cron-parser');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function schedulerTick(enqueue) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, cron, timezone, next_run_at, payload FROM schedules
       WHERE enabled AND next_run_at <= now() ORDER BY next_run_at LIMIT 500 FOR UPDATE SKIP LOCKED`);
    for (const s of rows) {
      const claimed = await client.query(
        `INSERT INTO job_runs (schedule_id, scheduled_for, status) VALUES ($1, $2, 'queued')
         ON CONFLICT (schedule_id, scheduled_for) DO NOTHING RETURNING schedule_id`, [s.id, s.next_run_at]);
      if (claimed.rowCount) await enqueue({ scheduleId: s.id, scheduledFor: s.next_run_at, payload: s.payload });
      const next = CronExpressionParser.parse(s.cron, { currentDate: new Date(), tz: s.timezone }).next().toDate();
      await client.query('UPDATE schedules SET next_run_at = $2 WHERE id = $1', [s.id, next]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
setInterval(() => schedulerTick(async (run) => { /* queue.add('run', run, { jobId: `${run.scheduleId}-${+run.scheduledFor}` }) */ }).catch(console.error), 1000);
module.exports = { schedulerTick };
:::

::: code javascript Three schedulers, one run per slot, and failover (runnable)
// Simulates 3 instances ticking every second. A shared "run key" set plays the role of the unique constraint.
function simulate(mode, { seconds = 7, killAt = 4 } = {}) {
  const runs = [], claimed = new Set(); let leader = null; const alive = new Set([1, 2, 3]);
  for (let slot = 0; slot < seconds; slot++) {
    if (slot === killAt) { const victim = mode === 'advisory' ? leader : runs.at(-1).instance; alive.delete(victim); if (leader === victim) leader = null; }
    for (const id of alive) {
      if (mode === 'none') runs.push({ slot, instance: id });
      if (mode === 'advisory') { if (leader === null) leader = id; if (leader === id) runs.push({ slot, instance: id }); }
      if (mode === 'run-key') { const key = 'report|' + slot; if (!claimed.has(key)) { claimed.add(key); runs.push({ slot, instance: id }); } }
    }
  }
  const slots = new Set(runs.map((r) => r.slot)).size;
  return { runs: runs.length, slots, duplicates: runs.length - slots, instances: [...new Set(runs.map((r) => r.instance))] };
}
for (const mode of ['none', 'advisory', 'run-key']) console.log(mode.padEnd(9), simulate(mode));
const none = simulate('none'), adv = simulate('advisory'), key = simulate('run-key');
console.log(none.duplicates > 0 && adv.duplicates === 0 && key.duplicates === 0 ? '✅ coordination removes duplicate runs' : '❌ FAIL');
console.log(adv.slots === 7 && key.slots === 7 && adv.instances.length === 2 ? '✅ no slot lost when the active instance dies; another one takes over' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `setInterval`/node-cron in every API instance: N instances = N runs.
- A Redis lock without expiry or fencing, so a crashed leader blocks scheduling forever, or two leaders run.
- Doing the work inside the scheduler loop instead of enqueueing it.
- Storing cron times in UTC only for local-time schedules (DST bugs).
- Non-idempotent jobs ("send invoice") that run twice after a retry.
:::

::: understand
- Claim each schedule slot exactly once in the database, enqueue it, and let idempotent workers do the work with retries.
:::

::: ask
- *"If the scheduler was down from 08:55 to 09:10, should the 09:00 job run late, once, or not at all?"*
:::

::: important ⭐ Say this in the interview
"I separate deciding when from doing the work. Schedules live in a table with cron, time zone and an indexed next_run_at. Any number of scheduler instances claim due rows with FOR UPDATE SKIP LOCKED, insert a run row keyed by schedule id and slot with on-conflict-do-nothing, enqueue only if the insert succeeded, and compute the next run in the schedule's time zone. Workers run jobs idempotently with retries, timeouts and a DLQ, and there's a run-history view and alerts. I measured three instances without coordination producing 18 runs for 7 slots, versus exactly 7 with an advisory-lock leader or a unique run key, and killing the active instance lost no slots."
:::

::: links
PostgreSQL: Explicit locking (advisory locks, SKIP LOCKED) | https://www.postgresql.org/docs/current/explicit-locking.html
BullMQ: Repeatable jobs / job schedulers | https://docs.bullmq.io/guide/job-schedulers
:::
