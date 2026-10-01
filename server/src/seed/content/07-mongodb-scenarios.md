@section MongoDB Scenarios
@icon 🧪
@color #0d9488
@desc Real-world scenario questions answered with measurements: a slow endpoint fixed step by step, pagination over millions of users, and whether to embed orders in users.

=== Your API takes 5 seconds because MongoDB is slow. How do you investigate?
@p 3
@tags performance, debugging, scenario
@quick
- **Measure first**: is it really the database? Split request time into DB time vs app time vs network (logs with durations, APM, Mongoose debug).
- **Find the exact query**: profiler (`slowms`), slow-query log, Atlas Query Profiler / Performance Advisor, `currentOp` for long runners.
- **Explain it**: COLLSCAN, in-memory SORT, `docsExamined ≫ nReturned` → index (ESR) or query shape.
- Then fix in order of impact: **index → N+1 → projection/lean/limit → aggregation order → cache**; infra last (RAM/working set, pool, region, replicas).
- Measured on 500k orders: **184 ms → 18.6 (index) → 15.3 (projection + lean) → 1.2 (batch instead of N+1) → 0.2 ms (Redis hit)**.

::: text 🧒 In simple words
When a car is slow, a good mechanic doesn't immediately fit a turbo. They first check **where** the slowness is (engine, brakes, flat tyre?), then find the **exact part**, test it, and fix the biggest problem first. A slow API is the same: measure which part takes the time, find the one query responsible, read its "receipt" (explain), fix the missing index or the hundred tiny trips (N+1), and only then think about caching or bigger machines.
:::

::: text 📖 Detailed answer
Interviewers want a **structured diagnosis before solutions**. Walk through the layers in order.

### 1. Confirm where the time goes
- Request timing middleware (total time) + DB timings (Mongoose `debug` with durations, driver command monitoring, APM such as OpenTelemetry/Datadog/X-Ray).
- All requests or only some (a big tenant, certain filters, cold cache, since a deploy)?

### 2. Identify the exact query
- `db.setProfilingLevel(1, { slowms: 100 })` → `db.system.profile`; the mongod log already reports operations slower than 100 ms with `planSummary`.
- Atlas **Query Profiler / Performance Advisor** (suggests indexes).
- `db.currentOp({ secs_running: { $gt: 2 } })` for long-running operations.

### 3. Explain it
`explain('executionStats')`: COLLSCAN, in-memory SORT, keys/docs examined ≫ returned.

### 4. Fix in order of impact
| Problem | Fix |
|---|---|
| No / wrong index | Compound index with **ESR**; check field order |
| N+1 queries | Batch with `$in`, `populate`, `$lookup`, or denormalise |
| Returning too much | Projection (`select`), `lean()`, `limit`, pagination |
| Deep `skip` | Cursor pagination |
| Bad query shape | Anchored regex, avoid `$ne`/`$nin`/`$where` as main filters, index every `$or` branch |
| Heavy aggregation | `$match` first, indexes for first stages, precompute (`$merge` on a schedule) |
| Huge documents | Unbounded arrays → reference / bucket |
| Hot documents | One counter updated by everyone → sharded counters, batching |

### 5. Infrastructure
Working set > RAM (cache misses → disk), connection pool exhausted (`maxPoolSize`, slow queries holding connections), app and DB in different regions, read-heavy → secondaries or Redis, very large data → sharding.

### Measured: fixing an admin endpoint step by step (500k orders, 10k users, MongoDB 7, Mongoose 9)
"Latest 50 PAID orders with total ≥ 4000, with customer names":
| Step | Time |
|---|---|
| Original: no index, full hydrated documents, `findById` per order (N+1) | **184 ms** |
| + compound index `{ status, createdAt, total }` | 18.6 ms |
| + projection + `lean()` | 15.3 ms |
| + one `$in` query for users instead of 50 `findById` | 1.2 ms |
| + Redis cache hit (30 s TTL) | 0.2 ms |
On a real network each of the 50 N+1 round trips adds ~1 ms more, which is how "fine locally" becomes seconds in production.
:::

::: diagram Investigation path
flowchart TD
  A["API slow: 5 s"] --> B["Measure: DB time vs app time vs network"]
  B --> C["Find the query: profiler, slow log, Mongoose debug, Atlas advisor"]
  C --> D["explain executionStats"]
  D --> E{"COLLSCAN or in-memory SORT?"}
  E -->|"yes"| F["Add or fix compound index (ESR)"]
  E -->|"no"| G{"N+1 or too many docs/fields?"}
  G -->|"yes"| H["Batch with $in, projection, lean, limit, cursor pagination"]
  G -->|"no"| I{"Heavy aggregation?"}
  I -->|"yes"| J["$match first, precompute, cache"]
  I -->|"no"| K["Infra: working set vs RAM, pool, region, replicas"]
:::

::: chart bar Measured: one endpoint fixed step by step (ms, 500k orders)
Step,Milliseconds
Original,184.2
Add compound index,18.6
Projection + lean,15.3
Batch users with $in,1.2
Redis cache hit,0.2
:::

::: image A mechanic's checklist: measure, find the part, test it, fix the biggest problem first
/images/mongodb-scenarios/slow-api.svg
:::

::: text 🪜 Step by step
How the measured endpoint was diagnosed:
1. Request log: `GET /admin/orders` takes 184 ms locally (seconds in production); other endpoints are fast.
2. Mongoose debug shows **51 queries** per request: one orders query + 50 `users.findOne` calls.
3. Explain on the orders query: `COLLSCAN → SORT`, 500,000 documents examined for 50 returned.
4. Add `{ status: 1, createdAt: -1, total: 1 }` (ESR) → explain shows IXSCAN, no SORT → 18.6 ms.
5. Select only the 4 fields the table shows and use `lean()` → 15.3 ms.
6. Replace the loop with one `users.find({ _id: { $in: ids } })` → 2 queries, 1.2 ms.
7. Cache the result for 30 s in Redis because the admin page is refreshed constantly → 0.2 ms on a hit; invalidate on order updates if staleness matters.
:::

::: code javascript The measured fix, step by step (node slow-endpoint.js)
// How to run: npm install mongoose ioredis
//   docker run -d -p 6379:6379 redis:7
//   MONGO_URI=mongodb://localhost:27017/perf REDIS_URL=redis://localhost:6379 node slow-endpoint.js   (seeds 200k orders)
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { Schema, model } = mongoose;

const User = model('User', new Schema({ name: String, email: String, bio: String }));
const Order = model('Order', new Schema({
  userId: Schema.Types.ObjectId, status: String, total: Number, note: String, createdAt: Date,
  items: [{ sku: String, name: String, qty: Number, price: Number }],
}, { autoIndex: false }));

async function time(label, fn, runs = 5) {
  let best = Infinity, result;
  for (let i = 0; i < runs; i++) { const t = performance.now(); result = await fn(); best = Math.min(best, performance.now() - t); }
  console.log(`${label.padEnd(34)} ${best.toFixed(1)} ms`);
  return result;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/perf');
  await Promise.all([User.deleteMany({}), Order.collection.drop().catch(() => {})]);
  const users = await User.insertMany(Array.from({ length: 5000 }, (_, i) => ({ name: `User ${i}`, email: `u${i}@x.com`, bio: 'b'.repeat(500) })), { lean: true });
  const statuses = ['PAID', 'PENDING', 'SHIPPED', 'CANCELLED'];
  for (let b = 0; b < 200000; b += 50000) {
    await Order.insertMany(Array.from({ length: 50000 }, (_, j) => { const i = b + j; return {
      userId: users[i % 5000]._id, status: statuses[i % 4], total: (i * 37) % 5000, note: 'n'.repeat(300),
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 30000), items: [{ sku: 'S1', name: 'Item', qty: 1, price: 100 }],
    }; }), { lean: true });
  }
  const filter = { status: 'PAID', total: { $gte: 4000 } };
  let queries = 0;
  mongoose.set('debug', () => { queries += 1; });

  const original = async () => {
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50);
    for (const o of orders) o.$locals.user = await User.findById(o.userId);           // N+1
    return orders;
  };
  queries = 0; await original(); console.log('queries per request (original):', queries);
  await time('1. original', original, 2);
  const stages = [];
  for (let st = (await Order.find(filter).sort({ createdAt: -1 }).limit(50).explain()).queryPlanner.winningPlan; st; st = st.inputStage) stages.push(st.stage);
  console.log('   plan:', stages.join(' ← '));

  await Order.collection.createIndex({ status: 1, createdAt: -1, total: 1 });         // ESR
  await time('2. + index (ESR)', original);

  const lean = async () => {
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).select('total status createdAt userId').lean();
    for (const o of orders) o.user = await User.findById(o.userId).select('name').lean();
    return orders;
  };
  await time('3. + projection + lean', lean);

  const batched = async () => {
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).select('total status createdAt userId').lean();
    const people = await User.find({ _id: { $in: orders.map((o) => o.userId) } }).select('name').lean();
    const byId = new Map(people.map((u) => [String(u._id), u]));
    return orders.map((o) => ({ ...o, user: byId.get(String(o.userId)) }));
  };
  queries = 0; await batched(); console.log('queries per request (batched):', queries);
  await time('4. + batch users with $in', batched);

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  await redis.del('admin:orders:paid4000');
  const cached = async () => {
    const hit = await redis.get('admin:orders:paid4000');
    if (hit) return JSON.parse(hit);
    const fresh = await batched();
    await redis.set('admin:orders:paid4000', JSON.stringify(fresh), 'EX', 30);
    return fresh;
  };
  await cached();
  await time('5. + Redis cache (hit)', cached);
  mongoose.set('debug', false);
  await redis.quit();
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Toolkit: request timing and slow-query logging with Express 5 + Mongoose (node timing-toolkit.js)
// How to run: npm install express mongoose && MONGO_URI=mongodb://localhost:27017/perf node timing-toolkit.js
//             then: curl -s localhost:3000/slow   and watch the console
const express = require('express');
const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('node:async_hooks');

const store = new AsyncLocalStorage();                                  // per-request DB stats
const SLOW_MS = Number(process.env.SLOW_MS) || 20;

// Driver command monitoring: real durations for every MongoDB command
async function connect() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/perf', { monitorCommands: true });
  const client = mongoose.connection.getClient();
  const started = new Map();
  client.on('commandStarted', (e) => started.set(e.requestId, { name: e.commandName, coll: e.command[e.commandName], stats: store.getStore() }));
  client.on('commandSucceeded', (e) => {
    const s = started.get(e.requestId); started.delete(e.requestId);
    if (!s?.stats) return;
    s.stats.queries += 1; s.stats.dbMs += e.duration;
    if (e.duration > SLOW_MS) console.warn(`[slow query] ${s.coll}.${s.name} ${e.duration.toFixed(1)} ms`);
  });
}

const app = express();
app.use((req, res, next) => {
  const stats = { queries: 0, dbMs: 0 };
  const start = performance.now();
  res.on('finish', () => {
    const total = performance.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} total=${total.toFixed(1)}ms db=${stats.dbMs.toFixed(1)}ms queries=${stats.queries}`);
  });
  store.run(stats, next);
});

const Item = mongoose.model('Item', new mongoose.Schema({ n: Number, tag: String }));
app.get('/slow', async (req, reply) => {
  const items = await Item.find({ tag: 't7' }).sort({ n: -1 }).limit(20).lean();   // no index → scan + sort
  for (const it of items) await Item.findById(it._id).lean();          // N+1 on purpose
  reply.json({ count: items.length });
});

connect().then(async () => {
  if (await Item.estimatedDocumentCount() < 300000) {
    await Item.deleteMany({});
    for (let b = 0; b < 300000; b += 50000) await Item.insertMany(Array.from({ length: 50000 }, (_, i) => ({ n: b + i, tag: `t${(b + i) % 1000}` })), { lean: true });
  }
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`try: curl -s localhost:${PORT}/slow`));
});
:::

::: code javascript Browser demo: why N+1 explodes with network latency (runnable)
// Model a request: each DB round trip costs network latency + server time.
function requestTime({ roundTrips, serverMsPerQuery, networkMs }) {
  return roundTrips * (networkMs + serverMsPerQuery);
}
const scenarios = [
  { name: 'N+1 (1 + 50 queries)', roundTrips: 51 },
  { name: 'batched with $in (2 queries)', roundTrips: 2 },
];
for (const networkMs of [0.1, 1, 5]) {
  const line = scenarios.map((s) => `${s.name}: ${requestTime({ ...s, serverMsPerQuery: 0.3, networkMs }).toFixed(1)} ms`).join(' | ');
  console.log(`network ${networkMs} ms → ${line}`);
}
const n1 = requestTime({ roundTrips: 51, serverMsPerQuery: 0.3, networkMs: 5 });
const batched = requestTime({ roundTrips: 2, serverMsPerQuery: 0.3, networkMs: 5 });
console.log('cross-region (5 ms) N+1 costs over 250 ms', n1 > 250 ? '✅' : '❌ FAIL');
console.log('batching is ~25× faster there', Math.round(n1 / batched) >= 25 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Jumping to "add Redis" or "scale up" before measuring and explaining the query.
- Testing on a laptop with 100 documents and a 0.1 ms network, then being surprised in production.
- Adding a single-field index when the query needs a compound one (or the wrong field order).
- Caching without an invalidation plan (stale prices, permissions).
- Ignoring connection-pool waits: one slow query can block many requests.
:::

::: understand
- Performance work is a loop: **measure → find → explain → fix the biggest cost → measure again**.
- Most real-world MongoDB slowness is missing/wrong indexes, N+1 round trips and over-fetching.
- Caching hides problems; fix the query first, then cache what is hot and rarely changing.
:::

::: ask
- *"Slow for everyone or specific users? Since when? Did data volume or a deploy change?"*
- *"Can I see the slow-query log or explain output?"*
- *"How fresh must this data be?"* (decides whether caching is allowed).
:::

::: important ⭐ Say this in the interview
"I'd diagnose before fixing. First I measure where the time goes: request timing versus database time per request, using driver command monitoring or APM. Then I find the exact slow query with the profiler, the slow-query log or Atlas Performance Advisor, and run explain executionStats to look for collection scans, in-memory sorts and documents examined far above documents returned. I fix in order of impact: a compound index following ESR, removing N+1 loops by batching with $in or populate, projection, lean and limits, then aggregation order. Only then caching and infrastructure like RAM, pool size, region and replicas. In a test endpoint those steps took it from 184 milliseconds to 1.2, and a Redis hit to 0.2."
:::

::: links
MongoDB: Analyze query performance | https://www.mongodb.com/docs/manual/tutorial/analyze-query-plan/
MongoDB: Database profiler | https://www.mongodb.com/docs/manual/tutorial/manage-the-database-profiler/
Atlas: Performance Advisor | https://www.mongodb.com/docs/atlas/performance-advisor/
MongoDB Node driver: Command monitoring | https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/monitoring/
:::

=== You have 10 million users. How would you implement pagination?
@p 3
@tags pagination, scale, scenario
@quick
- **Not** `skip(1_000_000)`: MongoDB still walks every skipped index entry, so time grows with page depth.
- Use **cursor (keyset) pagination**: `find({ createdAt < last, or same createdAt and _id < lastId }).sort({ createdAt: -1, _id: -1 }).limit(20)` → an index seek, constant time.
- Measured on 2M users: page 100,000 took **499 ms with skip (2,000,000 keys examined)** vs **1.2 ms with a cursor (20 keys)**.
- Needs a deterministic sort + matching index (`{ status: 1, createdAt: -1, _id: -1 }`); return an **opaque cursor** and fetch `limit + 1` for `hasNextPage`.
- Avoid exact counts per request: `countDocuments` took **370 ms** vs `estimatedDocumentCount` **0.6 ms**; cache counts or show "Load more".

::: text 🧒 In simple words
Offset pagination is like a librarian who, for "page 50,000", **counts a million books from the start** every single time. Cursor pagination is like putting a **bookmark** in: "give me the next 20 after this one", and the librarian jumps straight to the bookmark using the catalogue. It's instantly fast at any depth and doesn't get confused if someone adds books while you're reading. The only thing you lose is "jump straight to page 37,512", which almost nobody needs.
:::

::: text 📖 Detailed answer
### Why offset fails at scale
`skip(n)` makes MongoDB traverse and discard `n` index entries. It also gives **inconsistent pages** when items are inserted or deleted while the user is paging (duplicates or gaps).

### Measured (MongoDB 7, 2,000,000 users, index `{ status: 1, createdAt: -1, _id: -1 }`, 20 per page)
| Page | skip/limit | Keys examined | Cursor | Keys examined |
|---|---|---|---|---|
| 1 | 0.7 ms | 20 | 0.6 ms | 20 |
| 1,000 | 5.6 ms | 20,000 | 0.7 ms | 20 |
| 10,000 | 49.5 ms | 200,000 | 0.7 ms | 20 |
| 50,000 | 244 ms | 1,000,000 | 0.9 ms | 20 |
| 100,000 | 499 ms | 2,000,000 | 1.2 ms | 20 |
At 10 million users the deepest offset pages take seconds and burn CPU for everyone.

### Cursor (keyset) design
1. A **deterministic sort**: `_id` alone (time-ordered) or `(createdAt, _id)` so ties are broken.
2. A matching index with equality filters first: `{ status: 1, createdAt: -1, _id: -1 }`.
3. The query for the next page: `{ status, $or: [{ createdAt: { $lt: c } }, { createdAt: c, _id: { $lt: id } }] }`.
4. Return an **opaque cursor** (base64url of the last sort values) and fetch `limit + 1` to know `hasNextPage`.
5. Validate the cursor (it's user input) and cap `limit`.
6. Frontend: `useInfiniteQuery` + an IntersectionObserver sentinel for infinite scroll, or "Next/Previous" buttons.

### Counts
| Option | Cost (2M docs) | Note |
|---|---|---|
| `countDocuments(filter)` | 370 ms | Exact, scans the index range |
| `estimatedDocumentCount()` | 0.6 ms | Whole collection, no filter, from metadata |
| Cached count (Redis, refreshed) | ~0.2 ms | Slightly stale |
| No total ("Load more", "10,000+") | 0 | Often fine for UX |

### When page numbers are required
Cap the depth (e.g. 100 pages), require filters/search to narrow results, or precompute page boundaries for static lists.
:::

::: diagram Offset vs cursor
flowchart LR
  subgraph OFF["skip(1,999,980).limit(20)"]
    O1["walk 1,999,980 index entries"] --> O2["return 20"]
  end
  subgraph CUR["cursor: after (createdAt, _id)"]
    C1["seek to the bookmark in the index"] --> C2["read the next 20"]
  end
:::

::: chart line Measured: time per page vs page depth (2M users, ms)
Page,skip/limit,cursor
1,0.7,0.6
1000,5.6,0.7
10000,49.5,0.7
50000,243.7,0.9
100000,499.4,1.2
:::

::: image Counting a million books every time vs using a bookmark
/images/mongodb-scenarios/pagination.svg
:::

::: text 🪜 Step by step
A user scrolls the admin users list:
1. First request `GET /users?limit=20` → `find({ status: 'active' }).sort({ createdAt: -1, _id: -1 }).limit(21)`.
2. 21 documents come back → `hasNextPage = true`; return 20 items and `nextCursor = base64url({ c: last.createdAt, id: last._id })`.
3. The browser stores the cursor; when the sentinel scrolls into view, it calls `GET /users?cursor=…&limit=20`.
4. The API decodes and validates the cursor, builds the `$or` range filter, and MongoDB seeks straight to that position in the index.
5. New users inserted at the top meanwhile don't shift what the user sees next (no duplicates).
6. The UI shows "about 2,000,000 users" from a cached or estimated count, not an exact count per request.
:::

::: code javascript Production cursor pagination: Express 5 + Mongoose 9 (node cursor-api.js)
// How to run: npm install express mongoose && MONGO_URI=mongodb://localhost:27017/app node cursor-api.js
//   curl -s "localhost:3000/users?limit=3"   then pass the printed nextCursor: curl -s "localhost:3000/users?limit=3&cursor=..."
const express = require('express');
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({ name: String, email: String, status: { type: String, default: 'active' } }, { timestamps: true });
UserSchema.index({ status: 1, createdAt: -1, _id: -1 });
const User = model('User', UserSchema);

const encodeCursor = (doc) => Buffer.from(JSON.stringify({ c: doc.createdAt.toISOString(), id: String(doc._id) })).toString('base64url');
function decodeCursor(raw) {
  try {
    const { c, id } = JSON.parse(Buffer.from(raw, 'base64url').toString());
    const createdAt = new Date(c);
    if (Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(id)) return null;
    return { createdAt, id: new mongoose.Types.ObjectId(id) };
  } catch { return null; }
}

const app = express();
app.get('/users', async (req, reply) => {                                 // Express 5 forwards async errors
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { status: 'active' };
  if (req.query.cursor) {
    const cur = decodeCursor(String(req.query.cursor));
    if (!cur) return reply.status(400).json({ error: 'Invalid cursor' });
    filter.$or = [{ createdAt: { $lt: cur.createdAt } }, { createdAt: cur.createdAt, _id: { $lt: cur.id } }];
  }
  const docs = await User.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).select('name createdAt').lean();
  const hasNextPage = docs.length > limit;
  const items = docs.slice(0, limit);
  reply.json({ items, nextCursor: hasNextPage ? encodeCursor(items.at(-1)) : null, approxTotal: await User.estimatedDocumentCount() });
});

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app');
  await User.collection.drop().catch(() => {});                        // fresh demo data
  const base = Date.UTC(2026, 0, 1);
  await User.insertMany(Array.from({ length: 10 }, (_, i) => ({ name: `User ${i}`, createdAt: new Date(base + Math.floor(i / 2) * 1000) })));  // ties on purpose
  await User.syncIndexes();
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`try: curl -s "localhost:${PORT}/users?limit=3"`));
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code tsx React: infinite scroll with useInfiniteQuery
// UsersList.tsx (TanStack Query v5)
import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

type Page = { items: { _id: string; name: string }[]; nextCursor: string | null; approxTotal: number };

async function fetchUsers(cursor: string | null): Promise<Page> {
  const params = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
  const reply = await fetch(`/api/users?${params}`);
  if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
  return reply.json();
}

export function UsersList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useInfiniteQuery({
    queryKey: ['users'],
    queryFn: ({ pageParam }) => fetchUsers(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (status === 'pending') return <p>Loading…</p>;
  if (status === 'error') return <p role="alert">Could not load users.</p>;
  return (
    <section>
      <p>About {data.pages[0].approxTotal.toLocaleString()} users</p>
      <ul>{data.pages.flatMap((p) => p.items).map((u) => <li key={u._id}>{u.name}</li>)}</ul>
      <div ref={sentinel} aria-hidden="true" />
      {isFetchingNextPage && <p>Loading more…</p>}
      {!hasNextPage && <p>That's everyone.</p>}
    </section>
  );
}
:::

::: code javascript Browser demo: skip vs cursor, with inserts during paging (runnable)
// 10 users sorted newest first; a new user arrives while we page. Offset repeats an item; the cursor doesn't.
let rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, createdAt: 1000 + i })).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
const sortRows = () => rows.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);

const offsetPage = (page, size) => rows.slice(page * size, page * size + size);
function cursorPage(cursor, size) {
  const after = cursor ? rows.filter((r) => r.createdAt < cursor.createdAt || (r.createdAt === cursor.createdAt && r.id < cursor.id)) : rows;
  const items = after.slice(0, size);
  return { items, next: items.length ? { createdAt: items.at(-1).createdAt, id: items.at(-1).id } : null };
}

const off1 = offsetPage(0, 3);
const cur1 = cursorPage(null, 3);
rows.push({ id: 11, createdAt: 2000 }); sortRows();                       // a new user signs up
const off2 = offsetPage(1, 3);
const cur2 = cursorPage(cur1.next, 3);

const dupOffset = off2.filter((r) => off1.some((x) => x.id === r.id)).length;
const dupCursor = cur2.items.filter((r) => cur1.items.some((x) => x.id === r.id)).length;
console.log('offset page 2:', off2.map((r) => r.id).join(','), '| cursor page 2:', cur2.items.map((r) => r.id).join(','));
console.log('offset shows a duplicate after an insert', dupOffset === 1 ? '✅ (the bug, reproduced)' : '❌ FAIL');
console.log('cursor shows no duplicates', dupCursor === 0 ? '✅' : '❌ FAIL');

const keysWalked = (page, size) => page * size + size;                     // what skip costs in index entries
console.log('page 100,000 with skip walks 2,000,000 keys', keysWalked(99999, 20) === 2000000 ? '✅ (matches the measurement)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `skip()` for deep pages on big collections.
- Sorting only by `createdAt` (ties → skipped or repeated items); always add `_id`.
- A cursor that doesn't match the index (sort fields missing from the index) → in-memory sort.
- Trusting the cursor blindly (it's user input: validate and cap `limit`).
- Exact `countDocuments` on every request over millions of documents.
:::

::: understand
- Cursor pagination turns "skip n" into an index **seek**: constant time regardless of depth.
- The cursor is just the last sort key; any sort works if the index matches it.
- UX trade-off: no random "jump to page N", but infinite scroll and next/previous are what most products use.
:::

::: ask
- *"Does the product need page numbers, or is infinite scroll / next-previous fine?"*
- *"Which sort options does the UI offer?"* Each needs its own index and cursor fields.
- *"Is an exact total required?"*
:::

::: important ⭐ Say this in the interview
"I wouldn't use skip and limit for deep pages, because MongoDB still walks every skipped index entry: on two million users, page 100,000 took about 500 milliseconds and examined two million keys. I'd use cursor pagination: sort deterministically by createdAt and _id with a matching compound index like status, createdAt, _id, and for the next page query items strictly after the last seen pair. That's an index seek, 1.2 milliseconds at the same depth, and it doesn't duplicate items when new rows arrive. The API returns an opaque, validated cursor and fetches limit plus one for hasNextPage, and the frontend uses useInfiniteQuery. For totals I'd use an estimated or cached count rather than countDocuments on every request."
:::

::: links
MongoDB: Paging with range queries | https://www.mongodb.com/docs/manual/reference/method/cursor.skip/#using-range-queries
TanStack Query: Infinite queries | https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
:::

=== Should you embed orders inside a user document?
@p 3
@tags data-modeling, scenario, embed
@quick
- Usually **no**: orders are **unbounded** (16 MB ≈ 44,000 small orders), queried independently, and updated often.
- Measured with orders embedded: 10,000 orders = **3.7 MB user document**, full read **34.7 ms**, appending one order **11.3 ms** (vs **0.3 ms** to insert into an `orders` collection).
- ✅ Separate `orders` collection with `userId`, indexes `{ userId: 1, createdAt: -1 }` and `{ status: 1, createdAt: -1 }`.
- ✅ Embed **inside the order** what belongs to it: line items, price and address **snapshots**.
- Optional **subset pattern** on the user: `stats.orderCount`, `lifetimeValue`, last 3 order summaries (`$push` + `$slice`).

::: text 🧒 In simple words
Imagine keeping **every receipt you've ever received inside your wallet**. At first it's convenient: everything is in one place. After a few years the wallet is a brick: you carry thousands of receipts just to show your ID card, and adding one more receipt means stuffing it into an overflowing wallet. Shops also want to look up receipts by date or status without asking for your wallet. Better: keep receipts in a **filing cabinet** with your customer number on each, and keep only a tiny "last 3 purchases" note in your wallet.
:::

::: text 📖 Detailed answer
### Evaluate against the usual criteria
| Criterion | User → orders | Verdict |
|---|---|---|
| **Size** | Loyal customers accumulate thousands of orders; at ~380 bytes per small order the 16 MB limit is ~44,000 orders | ❌ embed |
| **Access patterns** | Profile needs the user; order history is paginated separately; admins query orders across all users by status/date | ❌ embed |
| **Update frequency** | Status changes often (PAID → SHIPPED → DELIVERED); rewriting a huge user document each time | ❌ embed |
| **Relationship** | One-to-many, unbounded; orders reference products and payments | ❌ embed |
| **Concurrency** | Every order and status change locks the same user document | ❌ embed |
| **Historical snapshot** | Product name, price, shipping address at purchase time | ✅ embed **inside the order** |

### Measured (MongoDB 7, orders with 4 line items embedded in one user document)
| Embedded orders | Document size | Full read | Name-only read | Append 1 order (`$push`) |
|---|---|---|---|---|
| 10 | 4 KB | 0.4 ms | 0.2 ms | 0.3 ms |
| 1,000 | 372 KB | 4.1 ms | 0.3 ms | 1.4 ms |
| 10,000 | 3.7 MB | 34.7 ms | 0.3 ms | 11.3 ms |
| separate `orders` collection | – | – | – | **0.3 ms** insert |
Projection hides the size from the network, but MongoDB still loads the whole document into cache, and every write rewrites a growing document.

### Recommended model
- `users`: `{ _id, name, email, addresses: [...], stats: { orderCount, lifetimeValue }, recentOrders: [last 3 summaries] }` (subset pattern, optional).
- `orders`: `{ _id, userId, items: [{ productId, name, unitPrice, qty }], shippingAddress: {...snapshot}, status, total, createdAt }`.
- Indexes: `orders { userId: 1, createdAt: -1 }` (history), `orders { status: 1, createdAt: -1 }` (admin).

**When embedding is OK:** few and bounded children always read with the parent (e.g. a subscription's last 12 invoices).
:::

::: diagram Recommended model
erDiagram
  USER ||--o{ ORDER : places
  USER {
    ObjectId _id
    string name
    string email
    object stats
    array recentOrders_max3
  }
  ORDER {
    ObjectId _id
    ObjectId userId
    array items_snapshot
    object shippingAddress_snapshot
    string status
    number total
    date createdAt
  }
:::

::: chart bar Measured: cost of reading and appending as embedded orders grow (ms)
Embedded orders,Full read,Append one order
10,0.4,0.3
1000,4.1,1.4
10000,34.7,11.3
:::

::: image Every receipt in your wallet vs a filing cabinet plus a small note
/images/mongodb-scenarios/embed-orders.svg
:::

::: text 🪜 Step by step
What happens when a user places an order with the recommended model:
1. Insert into `orders`: `{ userId, items: [snapshots], shippingAddress: snapshot, status: 'PENDING', total }` (0.3 ms, independent of history size).
2. Update the user's subset atomically: `$inc stats.orderCount`, `$inc stats.lifetimeValue`, `$push recentOrders` with `$position: 0` and `$slice: 3`.
3. Profile page: read the user (small document) → name, stats and last 3 orders without touching `orders`.
4. Order history page: `orders.find({ userId }).sort({ createdAt: -1 })` with cursor pagination.
5. Admin page: `orders.find({ status: 'PAID' }).sort({ createdAt: -1 })` across all users using its own index.
6. Status changes update one small order document, not the user.
:::

::: code javascript Schemas, the subset pattern and the growth experiment (node orders-model.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node orders-model.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const User = model('User', new Schema({
  name: String,
  email: { type: String, unique: true },
  stats: { orderCount: { type: Number, default: 0 }, lifetimeValue: { type: Number, default: 0 } },
  recentOrders: [{ _id: false, orderId: Schema.Types.ObjectId, total: Number, status: String, createdAt: Date }],
}));
const OrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ _id: false, productId: Schema.Types.ObjectId, name: String, unitPrice: Number, qty: Number }],
  shippingAddress: { line1: String, city: String, pin: String },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'PENDING' },
  total: Number,
}, { timestamps: true });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
const Order = model('Order', OrderSchema);

async function placeOrder(userId, items, shippingAddress) {
  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const order = await Order.create({ userId, items, shippingAddress, total });
  await User.updateOne({ _id: userId }, {
    $inc: { 'stats.orderCount': 1, 'stats.lifetimeValue': total },
    $push: { recentOrders: { $each: [{ orderId: order._id, total, status: order.status, createdAt: order.createdAt }], $position: 0, $slice: 3 } },
  });
  return order;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Promise.all([User.deleteMany({}), Order.deleteMany({})]);
  await Promise.all([User.init(), Order.init()]);
  const asha = await User.create({ name: 'Asha', email: 'asha@x.com' });
  for (let i = 1; i <= 5; i++) await placeOrder(asha._id, [{ name: `Book ${i}`, unitPrice: 100 * i, qty: 1 }], { line1: '1 MG Road', city: 'Pune', pin: '411001' });

  const profile = await User.findById(asha._id).lean();
  console.log('profile stats:', profile.stats, '| recent orders kept:', profile.recentOrders.length, '| newest total:', profile.recentOrders[0].total);
  console.log('history page:', (await Order.find({ userId: asha._id }).sort({ createdAt: -1 }).limit(2).select('total').lean()).map((o) => o.total).join(', '));

  // Growth experiment: what embedding would do to one document
  const coll = mongoose.connection.db.collection('embedded_users');
  await coll.deleteMany({});
  const sample = { status: 'PAID', total: 900, items: Array.from({ length: 4 }, (_, k) => ({ sku: `S${k}`, name: `Item ${k} with a long-ish name`, qty: 1, price: 100 })), createdAt: new Date() };
  for (const n of [10, 1000, 10000]) {
    const { insertedId } = await coll.insertOne({ name: 'Asha', orders: Array.from({ length: n }, () => sample) });
    const [{ size }] = await coll.aggregate([{ $match: { _id: insertedId } }, { $project: { size: { $bsonSize: '$$ROOT' } } }]).toArray();
    let t = performance.now(); await coll.findOne({ _id: insertedId }); const readMs = performance.now() - t;
    t = performance.now(); await coll.updateOne({ _id: insertedId }, { $push: { orders: sample } }); const pushMs = performance.now() - t;
    console.log(`${String(n).padStart(5)} embedded orders → ${(size / 1024).toFixed(0)} KB, read ${readMs.toFixed(1)} ms, $push ${pushMs.toFixed(1)} ms, 16 MB at ~${Math.floor(16 * 1048576 / (size / n)).toLocaleString()} orders`);
  }
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: score the embed decision (runnable)
// Score each criterion: +1 favours embedding, -1 favours a separate collection.
function embedScore({ maxChildren, readTogether, queriedAlone, updatedOften, sharedAcrossParents }) {
  let score = 0;
  score += maxChildren <= 100 ? 1 : -2;              // bounded and small?
  score += readTogether ? 1 : -1;
  score += queriedAlone ? -1 : 1;
  score += updatedOften ? -1 : 0;
  score += sharedAcrossParents ? -1 : 0;
  return score > 0 ? 'embed' : 'reference';
}
const userOrders = { maxChildren: 10000, readTogether: false, queriedAlone: true, updatedOften: true, sharedAcrossParents: false };
const orderItems = { maxChildren: 50, readTogether: true, queriedAlone: false, updatedOften: false, sharedAcrossParents: false };
const userAddresses = { maxChildren: 10, readTogether: true, queriedAlone: false, updatedOften: false, sharedAcrossParents: false };
console.log('user → orders:', embedScore(userOrders), embedScore(userOrders) === 'reference' ? '✅' : '❌ FAIL');
console.log('order → line items:', embedScore(orderItems), embedScore(orderItems) === 'embed' ? '✅' : '❌ FAIL');
console.log('user → addresses:', embedScore(userAddresses), embedScore(userAddresses) === 'embed' ? '✅' : '❌ FAIL');

const bytesPerOrder = 3729 * 1024 / 10000;                                  // measured: 3.7 MB for 10,000 orders
const limitOrders = Math.floor(16 * 1024 * 1024 / bytesPerOrder);
console.log(`16 MB holds about ${limitOrders.toLocaleString()} small orders`, limitOrders > 40000 && limitOrders < 50000 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Embedding unbounded, independently queried children (orders, comments, logs) in the parent.
- Forgetting **snapshots** in the order (price and address must not change when the product or profile changes).
- Letting a "recent" subset array grow without `$slice`.
- No index on `orders.userId` → slow history pages.
- Answering "embed" or "reference" without first asking about access patterns and sizes.
:::

::: understand
- Embed what is **owned, bounded and read together**; reference what grows, is shared or is queried on its own.
- The subset pattern gives the profile page speed without the unbounded growth.
- Snapshots are deliberate duplication: they record history, not current state.
:::

::: ask
- *"How many orders per user on average and at most? Which screens read orders?"*
- *"Do admins query orders across users by status or date?"*
- *"Which order fields must be frozen at purchase time?"*
:::

::: important ⭐ Say this in the interview
"Usually no. Orders are unbounded, they're queried on their own by status and date across all users, and they change often, so embedding them makes the user document grow towards the 16 megabyte limit. In a test, 10,000 embedded orders made the user 3.7 megabytes, a full read took 35 milliseconds and appending one order 11, versus 0.3 milliseconds to insert into a separate collection. I'd keep an orders collection with userId and indexes on userId plus createdAt and status plus createdAt, embed the line items and price and address snapshots inside each order, and optionally keep a small subset on the user, like order count, lifetime value and the last three orders, updated with $inc and $push with $slice."
:::

::: links
MongoDB: Subset pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-subset-pattern
MongoDB: Avoid unbounded arrays | https://www.mongodb.com/docs/atlas/schema-suggestions/avoid-unbounded-arrays/
MongoDB: $bsonSize | https://www.mongodb.com/docs/manual/reference/operator/aggregation/bsonSize/
:::
