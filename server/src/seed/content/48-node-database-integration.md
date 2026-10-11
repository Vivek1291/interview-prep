@section Node.js Database Integration
@icon 🔌
@color #0284c7
@desc How Node.js talks to databases: drivers and connection pools (measured), pool sizing, raw SQL vs query builders vs ORMs (Prisma, Sequelize, TypeORM, Knex, Mongoose), the N+1 problem (measured), transactions and race conditions in Node (measured) and zero-downtime migrations. Measured on PostgreSQL 17.

=== How does a Node.js app talk to a database? (drivers, connection pools)
@p 3
@tags database, nodejs, driver, connection-pool, postgresql
@quick
- A **driver** (`pg`, `mysql2`, `mongodb`) speaks the database's wire protocol over TCP, sends parameterised queries and converts types; ORMs and query builders sit on top of it.
- Opening a connection is expensive (TCP + TLS + auth + a server process): measured **6.53 ms** per query with a new connection vs **0.24 ms** pooled.
- A **pool** keeps N connections open and lends one per query; create it **once per process** at startup and close it on shutdown.
- Always use **parameters** (`$1`, `?`), never string concatenation (SQL injection).
- Node's single thread isn't a problem: queries are async I/O, so one process keeps many queries in flight across the pool's connections.

::: text 🧒 In simple words
Each database connection is a **phone line** to the database. Dialling takes time (6.5 ms here), so a pool is like an **office with 10 lines that stay connected**: whoever needs to talk picks up a free line, uses it, and hangs it back on the hook without disconnecting.
:::

::: text 📖 Detailed answer
### The layers
| Layer | Examples | Job |
|---|---|---|
| Your code | services, repositories | business logic |
| ORM / query builder | Prisma, Sequelize, TypeORM, Knex, Kysely, Mongoose | models, SQL generation, migrations |
| Driver | `pg`, `mysql2`, `mongodb` | protocol, parameters, type parsing |
| Pool | `pg.Pool`, built into most drivers | reuse connections, limit concurrency |
| Database | PostgreSQL, MySQL, MongoDB | storage, queries, transactions |

### Measured (Node 22 → PostgreSQL 17 in Docker, 300 primary-key lookups)
| Strategy | Per query |
|---|---|
| `new Client()` → connect → query → end | **6.53 ms** |
| `pool.query()` | **0.238 ms** |
Over a real network with TLS, the new-connection cost is tens of milliseconds, and the database also pays for a new backend process each time.

### Pool essentials (`pg`)
- `max`: connections per process (default 10).
- `idleTimeoutMillis`: close idle connections.
- `connectionTimeoutMillis`: fail fast when the pool is exhausted (measured: 2-connection pool, 5 slow queries → 3 × "timeout exceeded when trying to connect").
- `pool.on('error')`: log errors on idle clients (otherwise they crash the process).
- One pool per process; reuse it through a module (the module cache makes it a singleton).
:::

::: diagram From code to database
flowchart TD
  S["service code"] --> O["ORM or query builder"]
  O --> D["driver: protocol, parameters, types"]
  D --> P["pool of open connections"]
  P --> DB["database server"]
:::

::: image How Node.js talks to a database
/images/nodejs/db-layers.svg
:::

::: chart bar Measured: ms per query, new connection vs pool (PostgreSQL 17)
Strategy,ms per query
new connection each time,6.53
pooled,0.238
:::

::: text 🪜 Step by step
`await pool.query('SELECT * FROM users WHERE id = $1', [42])`:
1. The pool hands out an idle connection (or opens one, up to `max`; otherwise the request waits in a queue).
2. The driver sends the SQL and the parameter separately (extended protocol): no injection possible through `$1`.
3. Node's event loop is free while PostgreSQL works.
4. The response rows are parsed into JS values (`bigint` columns arrive as strings by default!).
5. The connection goes back to the pool for the next query.
:::

::: code javascript db.js: one pool per process, parameterised queries, clean shutdown
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => Number(v));          // int8/bigint → number (only if ids stay below 2^53)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,                    // fail fast instead of waiting forever when exhausted
  statement_timeout: 5_000,                          // server cancels queries running longer than 5 s
  application_name: 'orders-api',
});

pool.on('error', (err) => console.error('idle client error', err));   // e.g. DB restarted

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] ?? null;
}

async function closeDb() { await pool.end(); }       // call from graceful shutdown

module.exports = { pool, findUserByEmail, closeDb };
:::

::: code javascript A tiny connection pool (runnable)
// What a pool does: reuse a fixed number of "connections" and queue callers when all are busy.
function createPool({ max, connectCostMs }) {
  const idle = [], waiting = []; let created = 0, connects = 0;
  async function acquire() {
    if (idle.length) return idle.pop();
    if (created < max) { const conn = { id: ++created }; connects++; await new Promise((r) => setTimeout(r, connectCostMs)); return conn; }
    return new Promise((resolve) => waiting.push(resolve));
  }
  function release(conn) { const next = waiting.shift(); next ? next(conn) : idle.push(conn); }
  async function query(work) { const c = await acquire(); try { return await work(c); } finally { release(c); } }
  return { query, stats: () => ({ created, connects }) };
}
(async () => {
  const pool = createPool({ max: 3, connectCostMs: 5 });
  const used = new Set();
  await Promise.all(Array.from({ length: 30 }, (_, i) => pool.query(async (c) => { used.add(c.id); await new Promise((r) => setTimeout(r, 2)); return i; })));
  console.log(pool.stats(), 'distinct connections used:', used.size);
  console.log('30 queries reuse 3 connections', pool.stats().connects === 3 && used.size === 3 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Creating a new client/pool per request (or per module import in serverless without reuse).
- Building SQL with template strings (`WHERE email = '${email}'`).
- No `connectionTimeoutMillis`/`statement_timeout`: requests hang when the DB is slow.
- Forgetting `bigint` comes back as a string in `pg`.
- Not closing the pool on shutdown (tests hang, connections linger).
:::

::: understand
- Driver = protocol; pool = reuse + concurrency limit; ORM = convenience on top.
:::

::: ask
- *"How many processes/instances will connect, and what's the database's max_connections?"*
:::

::: important ⭐ Say this in the interview
"Node talks to a database through a driver like pg or the MongoDB driver, which speaks the wire protocol and sends parameterised queries; ORMs and query builders sit on top. Connections are expensive, so I create one pool per process at startup: I measured 6.5 milliseconds per query when opening a new connection each time versus 0.24 with a pool. I configure the pool size, a connection timeout so an exhausted pool fails fast, a statement timeout, an error listener for idle clients, and I close the pool during graceful shutdown. Because queries are async I/O, one Node process keeps many queries in flight."
:::

::: links
node-postgres: Pooling | https://node-postgres.com/features/pooling
node-postgres: Queries (parameters) | https://node-postgres.com/features/queries
:::

=== How do you size a connection pool? (measured)
@p 2
@tags database, connection-pool, performance, scaling
@quick
- Pool size limits how many queries run **at once** per process; extra requests **queue** in the pool.
- For queries that mostly **wait** (locks, I/O, slow upstream), more connections help: measured 200 × 20 ms queries → 4,729 ms with max 1, **100 ms** with max 50.
- For **CPU-bound** queries the database's cores are the limit: measured 64 full scans on an 11-core DB → max 16 **330 ms**, max 32 **325 ms** but a **worse median** (240 vs 200 ms).
- Budget: `instances × pool max ≤ max_connections − headroom` (default `max_connections` = 100). 20 instances × 10 = 200 → too many → use **PgBouncer**.
- Start small (≈ 2–4× DB cores in total), measure pool wait time and DB CPU, then adjust.

::: text 🧒 In simple words
A pool is the number of **checkout counters** in a shop. More counters help when customers spend most of the time waiting for something (a card reader), but if the bottleneck is the **one stock room behind the counters** (database CPU), opening more counters just makes everyone crowd the stock room.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17 with 11 cores, Node 22)
**Waiting queries** (`pg_sleep(0.02)`, 200 of them):
| Pool max | Total |
|---|---|
| 1 | 4,729 ms |
| 5 | 950 ms |
| 10 | 480 ms |
| 20 | 230 ms |
| 50 | 100 ms |

**CPU-bound queries** (64 full scans of 1M rows, parallel workers off):
| Pool max | Total | p50 | p99 |
|---|---|---|---|
| 4 | 697 ms | 381 ms | 696 ms |
| 8 | 480 ms | 287 ms | 480 ms |
| 16 | 330 ms | 200 ms | 330 ms |
| 32 | 325 ms | 240 ms | 324 ms |

### How to size
1. Total connections across all instances must fit `max_connections` (each PostgreSQL connection is a process, ~5–10 MB).
2. Per instance: enough to keep the event loop busy, not more than the DB can execute concurrently.
3. Watch metrics: pool `waitingCount`, query latency, DB CPU, active connections.
4. Many instances or serverless → **PgBouncer** in transaction mode (or RDS Proxy) multiplexes many clients over few server connections.
5. Slow queries are usually better fixed with indexes than with bigger pools.
:::

::: diagram Connection budget
flowchart LR
  I["instances x pool max"] --> C{"fits max_connections minus headroom?"}
  C -->|"yes"| OK["direct connections"]
  C -->|"no"| B["PgBouncer or RDS Proxy"]
  B --> DB["PostgreSQL"]
  OK --> DB
:::

::: image Connection pool sizing (measured)
/images/nodejs/pool-sizing.svg
:::

::: chart line Measured: total ms for 64 CPU-bound queries by pool size
Pool max,Total ms,Median ms
4,697,381
8,480,287
16,330,200
32,325,240
:::

::: text 🪜 Step by step
Kubernetes scales an API from 4 to 30 pods during a sale:
1. Each pod has `max: 10` → 300 potential connections; Postgres allows 100.
2. New pods fail with "sorry, too many clients already" and requests error.
3. Fix: put PgBouncer (transaction pooling) between pods and Postgres with ~40 server connections.
4. Lower per-pod `max` to 5; set `connectionTimeoutMillis` so overload fails fast and is visible.
5. Alert on pool wait time and DB CPU rather than guessing sizes.
:::

::: code javascript Exposing pool metrics (pg)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000 });

// pg exposes live counters: totalCount, idleCount, waitingCount
function poolMetrics() {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max };
}

// time spent waiting for a connection = early warning that the pool or DB is saturated
async function timedQuery(sql, params) {
  const start = process.hrtime.bigint();
  const client = await pool.connect();
  const waitedMs = Number(process.hrtime.bigint() - start) / 1e6;
  try {
    return { result: await client.query(sql, params), waitedMs };
  } finally {
    client.release();
  }
}

setInterval(() => console.log('db pool', poolMetrics()), 10_000).unref();
module.exports = { pool, poolMetrics, timedQuery };
:::

::: code javascript Connection budget calculator (runnable)
function budget({ instances, poolMax, maxConnections = 100, reserved = 10 }) {
  const wanted = instances * poolMax, available = maxConnections - reserved;
  return { wanted, available, ok: wanted <= available, maxPerInstance: Math.floor(available / instances) };
}
const before = budget({ instances: 4, poolMax: 10 });
const sale = budget({ instances: 30, poolMax: 10 });
console.log({ before, sale });
console.log('4 pods × 10 fits', before.ok ? '✅' : '❌ FAIL');
console.log('30 pods × 10 does not fit → PgBouncer or smaller pools', !sale.ok && sale.maxPerInstance === 3 ? '✅' : '❌ FAIL');
// measured data: going from 16 to 32 connections didn't help CPU-bound work
const measured = { 16: { total: 330, p50: 200 }, 32: { total: 325, p50: 240 } };
console.log('CPU-bound: doubling the pool barely changes total time', Math.abs(measured[32].total - measured[16].total) < 10 && measured[32].p50 > measured[16].p50 ? '✅ and the median got worse' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- "Bigger pool = faster" (it moves the queue into the database).
- Ignoring `instances × max` when autoscaling.
- No PgBouncer/RDS Proxy for serverless functions.
- Session-level features (prepared statements, `SET`, advisory locks) through transaction-mode PgBouncer without care.
- Masking slow queries with more connections instead of indexes.
:::

::: understand
- Waiting work scales with connections; CPU work scales with database cores.
:::

::: ask
- *"Where is the time going: waiting for a connection, or executing in the DB?"*
:::

::: important ⭐ Say this in the interview
"Pool size is the number of queries a process can run at once, so the right number depends on what the queries do. When queries mostly wait, more connections help: I measured 200 queries that each wait 20 milliseconds taking 4.7 seconds with one connection and 100 milliseconds with fifty. When they're CPU-bound, the database cores are the limit: on an 11-core Postgres, going from 16 to 32 connections didn't reduce total time and made the median worse. I keep instances times pool size within max_connections, add PgBouncer when there are many instances, and size from metrics like pool wait time and DB CPU."
:::

::: links
PostgreSQL wiki: Number of database connections | https://wiki.postgresql.org/wiki/Number_Of_Database_Connections
PgBouncer: Features and pooling modes | https://www.pgbouncer.org/features.html
:::

=== Raw SQL vs query builder vs ORM: Prisma, Sequelize, TypeORM, Knex, Mongoose
@p 3
@tags database, orm, prisma, sequelize, knex, typeorm, mongoose
@quick
- **Raw driver** (`pg`): full control and speed, manual mapping. **Query builder** (Knex, Kysely): composable SQL in JS, still close to SQL. **ORM** (Prisma, Sequelize, TypeORM): models, relations, migrations. **ODM** (Mongoose): the same for MongoDB.
- Understand what the ORM generates: log the SQL, read `EXPLAIN`, watch for N+1 and `SELECT *`.
- Measured fetching 5,000 rows: pg **5.9 ms**, Knex **5.6 ms**, Sequelize model instances **12.3 ms**, Sequelize `raw: true` **7.1 ms**: hydrating model objects costs more than SQL generation.
- Prisma: schema-first, generated typed client, migrations; TypeORM: decorators/classes; Sequelize: mature JS ORM; Kysely: type-safe query builder.
- Mix freely: ORM for CRUD, raw SQL for reports and hot paths.

::: text 🧒 In simple words
Raw SQL is **cooking from scratch**: total control, but you do everything. A query builder is **pre-cut ingredients**. An ORM is a **meal kit with a recipe card**: fast and consistent, but if you never look at what's in the box you'll be surprised by the bill (slow generated queries).
:::

::: text 📖 Detailed answer
| | Raw driver | Query builder | ORM | ODM |
|---|---|---|---|---|
| Examples | `pg`, `mysql2` | Knex, Kysely | Prisma, Sequelize, TypeORM, MikroORM | Mongoose |
| You write | SQL strings | JS method chains | models + method calls | schemas + methods |
| Types (TS) | manual | Kysely: inferred | Prisma: generated | inferred/declared |
| Relations | JOINs by hand | JOINs | `include`/`relations` | `populate` |
| Migrations | separate tool | built in (Knex) | built in | n/a (schema-less) |
| Risk | boilerplate | complex queries get verbose | hidden N+1, inefficient SQL | populate N+1, large docs |

### Measured (PostgreSQL 17, 5,000 rows, best of 10)
| Library | ms |
|---|---|
| `pg` | 5.9 |
| Knex | 5.58 |
| Sequelize (model instances) | 12.27 |
| Sequelize `raw: true` | 7.13 |
The SQL is the same; the cost is turning rows into rich model objects. For read-heavy list endpoints use `raw`/`lean()`/plain selects.

### What an ORM does underneath
1. Builds SQL from your call (`findAll({ where, include })` → `SELECT … LEFT JOIN …`).
2. Sends it through the driver with parameters.
3. Maps rows to objects/models, tracking changes for `save()`.
4. Manages transactions and migrations.
Knowing this lets you debug: turn on query logging (`logging: console.log`, Prisma `log: ['query']`) and run the SQL with `EXPLAIN ANALYZE`.

### Choosing
- New TypeScript service, mostly CRUD → Prisma or Kysely (+ raw SQL for reports).
- Existing JS codebase → Sequelize/Knex as already used.
- MongoDB → Mongoose (or the driver for hot paths).
:::

::: diagram What an ORM call becomes
flowchart LR
  C["Order.findAll with include User"] --> G["generated SQL with LEFT JOIN"]
  G --> D["driver sends SQL plus parameters"]
  D --> R["rows"]
  R --> H["hydrate model instances"]
:::

::: image Raw driver vs query builder vs ORM
/images/nodejs/orm-vs-builder.svg
:::

::: chart bar Measured: ms to fetch 5,000 rows (PostgreSQL 17)
Library,ms
pg,5.9
knex,5.58
sequelize instances,12.27
sequelize raw,7.13
:::

::: text 🪜 Step by step
Debugging a slow ORM endpoint:
1. Enable query logging for the request and count queries (N+1?).
2. Copy the slowest SQL and run `EXPLAIN (ANALYZE, BUFFERS)` in psql.
3. Missing index → add it in a migration; `SELECT *` of wide columns → select only needed fields.
4. Heavy hydration → `raw: true` / `lean()` / a plain query for that endpoint.
5. Complex report → write it in SQL (view or raw query) and keep the ORM for CRUD.
:::

::: code javascript The same query in pg, Knex, Sequelize, Prisma and TypeORM
const { Pool } = require('pg');
const knex = require('knex')({ client: 'pg', connection: process.env.DATABASE_URL });
const { Sequelize, DataTypes } = require('sequelize');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
const User = sequelize.define('User', { email: DataTypes.TEXT, name: DataTypes.TEXT }, { tableName: 'users', timestamps: false });
const Order = sequelize.define('Order', { status: DataTypes.TEXT, total_cents: DataTypes.INTEGER, created_at: DataTypes.DATE }, { tableName: 'orders', timestamps: false });
Order.belongsTo(User, { foreignKey: 'user_id' });

// 1. raw driver
const latestOrdersSql = (limit) => pool.query(
  `SELECT o.id, o.total_cents, u.email FROM orders o JOIN users u ON u.id = o.user_id
   WHERE o.status = $1 ORDER BY o.created_at DESC LIMIT $2`, ['paid', limit]);

// 2. query builder
const latestOrdersKnex = (limit) => knex('orders as o').join('users as u', 'u.id', 'o.user_id')
  .where('o.status', 'paid').orderBy('o.created_at', 'desc').limit(limit).select('o.id', 'o.total_cents', 'u.email');

// 3. ORM (one query with a JOIN thanks to include)
const latestOrdersSequelize = (limit) => Order.findAll({
  where: { status: 'paid' }, include: [{ model: User, attributes: ['email'] }],
  attributes: ['id', 'total_cents'], order: [['created_at', 'DESC']], limit, raw: true, nest: true,
});

// 4. Prisma (schema.prisma defines models; the client is generated)
//    prisma.order.findMany({ where: { status: 'paid' }, select: { id: true, totalCents: true, user: { select: { email: true } } },
//                            orderBy: { createdAt: 'desc' }, take: limit })
// 5. TypeORM
//    dataSource.getRepository(Order).find({ where: { status: 'paid' }, relations: { user: true }, order: { createdAt: 'DESC' }, take: limit })

module.exports = { latestOrdersSql, latestOrdersKnex, latestOrdersSequelize };
:::

::: code javascript A mini query builder (runnable)
// Query builders compose SQL + parameters; this is the core idea behind Knex/Kysely.
function table(name) {
  const state = { name, wheres: [], params: [], order: null, limit: null, cols: ['*'] };
  const api = {
    select: (...cols) => ((state.cols = cols), api),
    where: (col, val) => (state.params.push(val), state.wheres.push(`${col} = $${state.params.length}`), api),
    orderBy: (col, dir = 'asc') => ((state.order = `${col} ${dir.toUpperCase()}`), api),
    limit: (n) => (state.params.push(n), (state.limit = `$${state.params.length}`), api),
    toSQL: () => ({
      sql: [`SELECT ${state.cols.join(', ')} FROM ${state.name}`, state.wheres.length && `WHERE ${state.wheres.join(' AND ')}`, state.order && `ORDER BY ${state.order}`, state.limit && `LIMIT ${state.limit}`].filter(Boolean).join(' '),
      params: state.params,
    }),
  };
  return api;
}
const q = table('orders').select('id', 'total_cents').where('status', 'paid').where('user_id', 42).orderBy('created_at', 'desc').limit(20).toSQL();
console.log(q);
console.log('values are parameters, not concatenated', q.sql === 'SELECT id, total_cents FROM orders WHERE status = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3' && q.params.join() === 'paid,42,20' ? '✅' : '❌ FAIL');
const evil = table('users').where('email', "x' OR '1'='1").toSQL();
console.log('injection attempt stays a value', !evil.sql.includes("OR '1'") ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Never looking at the SQL an ORM generates.
- Lazy-loading relations in loops (N+1, next question).
- Hydrating thousands of model instances for read-only lists (`raw`/`lean`).
- `sequelize.query()` / `$queryRawUnsafe` with string interpolation (injection).
- Choosing an ORM to avoid learning SQL: you still need SQL to debug it.
:::

::: understand
- All of them end up as SQL through a driver; the difference is how much they write and hide for you.
:::

::: ask
- *"What SQL does this generate, and how many queries per request?"*
:::

::: important ⭐ Say this in the interview
"A raw driver gives full control, a query builder like Knex or Kysely composes parameterised SQL in JavaScript, and an ORM like Prisma, Sequelize or TypeORM adds models, relations and migrations; Mongoose is the equivalent for MongoDB. They all end up sending SQL through a driver, so I log the generated queries and check them with EXPLAIN. Fetching 5,000 rows I measured pg and Knex at about 6 milliseconds and Sequelize model instances at 12, mostly hydration cost, so for read-heavy lists I use raw or lean results. My default is an ORM or typed builder for CRUD and plain SQL for reports and hot paths."
:::

::: links
Prisma ORM docs | https://www.prisma.io/docs/orm
Knex.js | https://knexjs.org/
Sequelize | https://sequelize.org/docs/v6/
:::

=== What is the N+1 query problem, and how do you fix it? (measured)
@p 3
@tags database, performance, orm, n-plus-one
@quick
- N+1 = one query for a list, then **one more query per item** for related data (`for (const o of orders) o.user = await getUser(o.user_id)`).
- Measured, 100 orders with their users: N+1 **20.7 ms / 101 queries** (Sequelize lazy loading **29 ms**) vs **one JOIN 0.53 ms** or **batched IN 0.64 ms / 2 queries**.
- On a real network every query adds a round trip: 100 extra queries × 1 ms = +100 ms per request.
- Fixes: `JOIN` / ORM `include` / Mongoose `populate`, or batch with `WHERE id = ANY($1)`; **DataLoader** in GraphQL.
- Detect it: count queries per request in logs or APM, and add tests that assert a query count.

::: text 🧒 In simple words
N+1 is going to the shop **once for the list, then once for every item on it**: 101 trips. A JOIN or batch is taking the list and buying **everything in one trip** (or two).
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, 100 latest orders + their user, indexed tables, average of 20 runs)
| Approach | Time | Queries |
|---|---|---|
| N+1 with `pg` | **20.68 ms** | 101 |
| N+1 with Sequelize `getUser()` | **29.01 ms** | 101 |
| Batched `WHERE id = ANY($1)` | 0.64 ms | 2 |
| `JOIN` with `pg` | **0.53 ms** | 1 |
| Knex JOIN | 0.68 ms | 1 |
| Sequelize `include` | 1.66 ms | 1 |
This was on localhost; with 1 ms network latency per round trip, N+1 grows by another ~100 ms.

### Where it hides
- ORM lazy loading (`order.getUser()`, TypeORM lazy relations, accessing a relation in a template).
- Mongoose: looping `findById` instead of `populate` or `$in`.
- GraphQL resolvers (each `Order.user` resolver queries separately) → DataLoader batches per tick.
- Microservices: calling a user service per row → batch endpoint `GET /users?ids=…`.

### JOIN vs batched IN
- JOIN: one round trip; duplicates parent data for one-to-many (100 orders × items).
- Batched IN: two simple queries, no duplication, works across databases/services.
:::

::: diagram N+1 vs batch
sequenceDiagram
  participant A as API
  participant DB as Database
  A->>DB: "SELECT 100 orders"
  loop "N+1: once per order"
    A->>DB: "SELECT user WHERE id = ?"
  end
  Note over A,DB: "batched: one SELECT users WHERE id = ANY of 100 ids"
:::

::: image The N+1 query problem (measured)
/images/nodejs/n-plus-one.svg
:::

::: chart bar Measured: ms to load 100 orders with their users (PostgreSQL 17)
Approach,ms
N+1 pg,20.68
N+1 Sequelize,29.01
batched IN,0.64
JOIN,0.53
Sequelize include,1.66
:::

::: text 🪜 Step by step
Fixing a slow `GET /orders` page:
1. APM shows 101 queries for one request; the log repeats `SELECT … FROM users WHERE id = $1`.
2. Replace the loop with `include: [User]` (JOIN) or a second query with `ANY($1)` and a Map.
3. Select only needed columns.
4. Add a test asserting ≤ 2 queries for this endpoint.
5. Measured result for this shape: ~21 ms → under 1 ms.
:::

::: code javascript N+1 and its two fixes with pg
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ❌ N+1: 1 + 100 queries
async function latestOrdersNPlusOne(limit = 100) {
  const { rows: orders } = await pool.query('SELECT id, user_id, total_cents FROM orders ORDER BY created_at DESC LIMIT $1', [limit]);
  for (const o of orders) o.user = (await pool.query('SELECT id, email, name FROM users WHERE id = $1', [o.user_id])).rows[0];
  return orders;
}

// ✅ batched: 2 queries
async function latestOrdersBatched(limit = 100) {
  const { rows: orders } = await pool.query('SELECT id, user_id, total_cents FROM orders ORDER BY created_at DESC LIMIT $1', [limit]);
  const ids = [...new Set(orders.map((o) => o.user_id))];
  const { rows: users } = await pool.query('SELECT id, email, name FROM users WHERE id = ANY($1)', [ids]);
  const byId = new Map(users.map((u) => [u.id, u]));
  return orders.map((o) => ({ ...o, user: byId.get(o.user_id) }));
}

// ✅ JOIN: 1 query
async function latestOrdersJoin(limit = 100) {
  const { rows } = await pool.query(
    `SELECT o.id, o.total_cents, u.id AS user_id, u.email, u.name
       FROM orders o JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT $1`, [limit]);
  return rows;
}

module.exports = { latestOrdersNPlusOne, latestOrdersBatched, latestOrdersJoin };
:::

::: code javascript A DataLoader-style batcher (runnable)
// Collect every load(id) made in the same tick, then fetch them with ONE query.
function createLoader(batchFn) {
  let queue = [];
  return {
    load(id) {
      return new Promise((resolve) => {
        queue.push({ id, resolve });
        if (queue.length === 1) queueMicrotask(async () => {
          const batch = queue; queue = [];
          const results = await batchFn([...new Set(batch.map((b) => b.id))]);
          for (const b of batch) b.resolve(results.get(b.id));
        });
      });
    },
  };
}
let dbQueries = 0;
const usersTable = new Map(Array.from({ length: 50 }, (_, i) => [i + 1, { id: i + 1, name: `User ${i + 1}` }]));
const userLoader = createLoader(async (ids) => { dbQueries++; return new Map(ids.map((id) => [id, usersTable.get(id)])); });
(async () => {
  const orders = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, userId: (i % 50) + 1 }));
  const withUsers = await Promise.all(orders.map(async (o) => ({ ...o, user: await userLoader.load(o.userId) })));
  console.log('orders:', withUsers.length, '| user queries:', dbQueries);
  console.log('100 loads → 1 batched query', dbQueries === 1 && withUsers[99].user.name === 'User 50' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `await` inside a `for` loop over query results.
- Lazy-loaded ORM relations accessed in serializers/templates.
- Fixing N+1 with a huge JOIN that multiplies rows (one-to-many-to-many).
- `populate` everything "just in case".
- Only testing with 3 rows in development (the problem appears with 100+).
:::

::: understand
- Count queries per request; anything that grows with the number of rows is a bug.
:::

::: ask
- *"How many queries does this endpoint run for 10 rows vs 100 rows?"*
:::

::: important ⭐ Say this in the interview
"N+1 is loading a list with one query and then running one more query per row for related data. I measured it on Postgres: 100 orders with their users took 21 milliseconds and 101 queries with a loop, 29 with Sequelize lazy loading, but half a millisecond with one JOIN or two queries using WHERE id = ANY. On a real network each extra query is another round trip, so it gets much worse. I fix it with JOINs or ORM includes, batched IN queries, or DataLoader in GraphQL, and I catch it by counting queries per request in logs, APM or tests."
:::

::: links
DataLoader | https://github.com/graphql/dataloader
Sequelize: Eager loading | https://sequelize.org/docs/v6/advanced-association-concepts/eager-loading/
:::

=== How do you use transactions correctly in Node.js? (and avoid race conditions)
@p 3
@tags database, transactions, concurrency, postgresql
@quick
- A transaction must run on **one connection**: `const client = await pool.connect()` → `BEGIN` … `COMMIT`/`ROLLBACK` → `client.release()` in `finally`.
- Measured bug: `pool.query('BEGIN')` and `pool.query('UPDATE')` ran on **different connections** (pids 836 vs 837), so `ROLLBACK` did nothing (stock 49, expected 50).
- Read-then-write is a race: measured 50 concurrent "buy 1" requests on stock 10 **sold 15** and left stock 8.
- Fixes: **atomic conditional update** (`SET stock = stock - 1 WHERE stock > 0`, check `rowCount`) or `SELECT … FOR UPDATE` inside a transaction (both measured: exactly 10 sold).
- Keep transactions short (no HTTP calls inside), and retry on serialization (`40001`) and deadlock (`40P01`) errors.

::: text 🧒 In simple words
A transaction is **one cashier handling your whole basket**. If you split the basket across several cashiers (pool.query), "cancel my purchase" only reaches one of them. A race condition is **two cashiers both seeing "1 left" on the shelf** and both selling it; the fix is to check and take the item in **one move**, or put a hand on the item (a lock) while you check.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, pg 8)
| Pattern | Result |
|---|---|
| `pool.query('BEGIN')`, `pool.query('UPDATE')`, `pool.query('ROLLBACK')` | different connections; update **kept** (49 instead of 50) |
| `client` from `pool.connect()` with `BEGIN`/`ROLLBACK` | rolled back (50) |
| 50 parallel requests, `SELECT stock` then `UPDATE stock = $1` | **15 sold** from 10; stock 8 (lost updates) |
| 50 parallel `UPDATE … SET stock = stock - 1 WHERE stock > 0` | 10 sold, stock 0 |
| 50 parallel `BEGIN; SELECT … FOR UPDATE; UPDATE; COMMIT` | 10 sold, stock 0 |

### Choosing a concurrency fix
| Technique | When |
|---|---|
| Atomic conditional `UPDATE` | single-row counters, stock, balances |
| `SELECT … FOR UPDATE` | read, decide in code, then write the same rows |
| Unique constraint + catch duplicate | "only one per user" rules |
| Optimistic locking (`version` column) | low-contention edits by users (409 on conflict) |
| `SERIALIZABLE` + retry | complex invariants across rows |
| Advisory locks / Redis locks | coordinating work outside a single row |

### Rules
- Never do slow external calls (payment API, email) inside an open transaction: locks stay held. Use the outbox pattern.
- Release the client in `finally`, even on errors (otherwise the pool leaks).
- ORMs: `sequelize.transaction(async (t) => …)`, `prisma.$transaction(async (tx) => …)`, Mongoose `session.withTransaction()`.
:::

::: diagram Lost update vs atomic update
sequenceDiagram
  participant A as Request A
  participant B as Request B
  participant DB as Database
  A->>DB: "SELECT stock: 1"
  B->>DB: "SELECT stock: 1"
  A->>DB: "UPDATE stock = 0"
  B->>DB: "UPDATE stock = 0, item sold twice"
  Note over A,DB: "fix: UPDATE SET stock = stock - 1 WHERE stock > 0 returns rowCount 0 for the loser"
:::

::: image Transactions and race conditions in Node.js (measured)
/images/nodejs/transactions-node.svg
:::

::: chart bar Measured: items sold by 50 concurrent requests with stock 10
Pattern,Items sold
read then write,15
atomic UPDATE,10
SELECT FOR UPDATE,10
:::

::: text 🪜 Step by step
Placing an order safely:
1. `client = await pool.connect(); await client.query('BEGIN')`.
2. `UPDATE products SET stock = stock - $qty WHERE id = $1 AND stock >= $qty` → `rowCount === 0` → `ROLLBACK`, 409 "out of stock".
3. `INSERT INTO orders …` and `INSERT INTO order_items …`.
4. `INSERT INTO outbox (event) VALUES ('order.created')` in the same transaction; `COMMIT`.
5. A worker reads the outbox and calls the payment/email services: no network calls while holding locks.
:::

::: code javascript withTransaction helper, retries and an order placement
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RETRYABLE = new Set(['40001', '40P01']);      // serialization failure, deadlock

async function withTransaction(fn, { isolation = 'READ COMMITTED', retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (RETRYABLE.has(err.code) && attempt < retries) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}

async function placeOrder(userId, productId, qty) {
  return withTransaction(async (tx) => {
    const stock = await tx.query('UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING price_cents', [productId, qty]);
    if (stock.rowCount === 0) throw Object.assign(new Error('Out of stock'), { status: 409 });
    const total = stock.rows[0].price_cents * qty;
    const { rows } = await tx.query("INSERT INTO orders (user_id, status, total_cents, created_at) VALUES ($1, 'pending', $2, now()) RETURNING id", [userId, total]);
    await tx.query('INSERT INTO order_items (order_id, product_id, qty) VALUES ($1, $2, $3)', [rows[0].id, productId, qty]);
    await tx.query("INSERT INTO outbox (topic, payload) VALUES ('order.created', $1)", [{ orderId: rows[0].id, userId, total }]);
    return { orderId: rows[0].id, total };
  });
}

module.exports = { withTransaction, placeOrder };
:::

::: code javascript Race condition simulation (runnable)
// Interleaved requests: each awaits between reading and writing, exactly like real I/O.
async function run(strategy) {
  const db = { stock: 10 }; let sold = 0;
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const buyReadThenWrite = async () => { const s = db.stock; await tick(); if (s > 0) { db.stock = s - 1; sold++; } };
  const buyAtomic = async () => { await tick(); if (db.stock > 0) { db.stock -= 1; sold++; } };       // check + write in one step (like UPDATE … WHERE stock > 0)
  await Promise.all(Array.from({ length: 50 }, strategy === 'race' ? buyReadThenWrite : buyAtomic));
  return { sold, stock: db.stock };
}
(async () => {
  const race = await run('race'), atomic = await run('atomic');
  console.log({ race, atomic });
  console.log('read-then-write oversells', race.sold > 10 ? `✅ sold ${race.sold} of 10 (measured in Postgres: 15)` : '⚠️ no overlap this run');
  console.log('atomic update sells exactly the stock', atomic.sold === 10 && atomic.stock === 0 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `pool.query('BEGIN')` (measured: the rollback silently does nothing).
- Forgetting `client.release()` on error paths → pool exhaustion.
- Read-modify-write without locks or atomic updates.
- HTTP calls, emails or file uploads inside a transaction.
- No retry for `40001`/`40P01` when using stricter isolation.
:::

::: understand
- One connection per transaction; check-and-write atomically; keep it short; retry on serialization errors.
:::

::: ask
- *"What happens if two users do this at the same moment?"*
:::

::: important ⭐ Say this in the interview
"A transaction has to run on a single connection, so I check out a client from the pool, run BEGIN, my statements and COMMIT, roll back on error and release the client in finally. I verified the classic bug: BEGIN and UPDATE through pool.query ran on different connections and the rollback did nothing. For races, read-then-write is unsafe: 50 concurrent purchases sold 15 items from a stock of 10. An atomic conditional UPDATE checking rowCount, or SELECT FOR UPDATE inside the transaction, sold exactly 10. I keep transactions short, put external calls behind an outbox, and retry serialization and deadlock errors."
:::

::: links
node-postgres: Transactions | https://node-postgres.com/features/transactions
PostgreSQL: Explicit locking | https://www.postgresql.org/docs/current/explicit-locking.html
:::

=== How do you manage schema migrations without downtime? (measured)
@p 2
@tags database, migrations, deployment, postgresql
@quick
- Migrations are **versioned scripts** in git (Knex, Prisma Migrate, TypeORM, node-pg-migrate, Flyway) applied in CI/CD before or during deploy; never hand-edit production.
- Old and new app versions run **at the same time** during a rolling deploy, so every migration must be **backward compatible**: **expand → migrate → contract**.
- Measured on 1M rows: `ADD COLUMN … NOT NULL DEFAULT 0` took **3 ms** (metadata only since PG 11); a single `UPDATE` backfill took **10.7 s** → backfill in batches.
- `CREATE INDEX` blocked writes for **177 ms** on 1M rows (minutes on big tables); `CREATE INDEX CONCURRENTLY`: longest write **2 ms**.
- Renames are breaking: add the new column, dual-write, backfill, switch reads, drop the old one later.

::: text 🧒 In simple words
Changing a database schema in production is **renovating a restaurant while it's open**. You don't knock down the kitchen at lunchtime: you build the new kitchen next to it, move cooks over gradually, and only then remove the old one.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, 1M-row `orders`, writes running continuously)
| Operation | Time | Effect on writes |
|---|---|---|
| `ADD COLUMN note text` | 1 ms | none |
| `ADD COLUMN score int NOT NULL DEFAULT 0` | 3 ms | none (PG 11+) |
| `UPDATE orders SET score = 1` (all rows) | 10,714 ms | row locks on every row, huge WAL, bloat |
| `CREATE INDEX` | 183 ms | writes **blocked** up to 177 ms |
| `CREATE INDEX CONCURRENTLY` | 268 ms | longest write 2 ms |

### Expand / contract for renaming `name` → `full_name`
1. **Expand**: add `full_name` (nullable).
2. Deploy app v2: writes both columns, reads `full_name ?? name`.
3. **Backfill** in batches of ~5,000 rows with short transactions.
4. Add `NOT NULL` (via `CHECK … NOT VALID` then `VALIDATE`), deploy v3 reading only `full_name`.
5. **Contract**: drop `name` in a later release.

### Dangerous operations
| Operation | Safer alternative |
|---|---|
| Rename/drop column used by running code | expand/contract |
| `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` (outside a transaction) |
| Add `NOT NULL` to a big table | `CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` |
| Add FK on a big table | `NOT VALID` then `VALIDATE CONSTRAINT` |
| Change column type | new column + backfill |
Also set `lock_timeout` for migrations so a blocked DDL fails instead of queuing every query behind it.
:::

::: diagram Expand and contract across deploys
flowchart LR
  E["expand: add new column"] --> D["deploy: dual write, read new with fallback"]
  D --> B["backfill in batches"]
  B --> S["switch reads, add constraints"]
  S --> C["contract: drop old column later"]
:::

::: image Zero-downtime schema migrations (measured)
/images/nodejs/migrations.svg
:::

::: chart bar Measured: longest blocked write (ms) while creating an index on 1M rows
Method,Longest write (ms)
CREATE INDEX,177
CREATE INDEX CONCURRENTLY,2
:::

::: text 🪜 Step by step
CI/CD pipeline for a migration:
1. Developer adds `migrations/20261011_add_full_name.js` with `up` and `down`.
2. CI runs migrations on a fresh test database, then the tests.
3. Deploy job runs `knex migrate:latest` (with `lock_timeout`) before rolling out new pods.
4. Old pods keep working because the change is additive.
5. The backfill runs as a background job in batches; the contract migration ships in a later release.
:::

::: code javascript Knex migrations: expand, batched backfill, concurrent index
// migrations/20261011120000_add_full_name.js
exports.up = async (knex) => {
  await knex.raw("SET lock_timeout = '3s'");
  await knex.schema.alterTable('users', (t) => t.text('full_name'));        // expand: nullable, instant
};
exports.down = (knex) => knex.schema.alterTable('users', (t) => t.dropColumn('full_name'));

// migrations/20261011120500_index_full_name.js
exports.config = { transaction: false };                                      // CONCURRENTLY can't run in a transaction
exports.up = (knex) => knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS users_full_name_idx ON users (full_name)');
exports.down = (knex) => knex.raw('DROP INDEX CONCURRENTLY IF EXISTS users_full_name_idx');

// jobs/backfill-full-name.js: small batches, short transactions, resumable
async function backfillFullName(knex, batchSize = 5000) {
  let total = 0;
  for (;;) {
    const { rowCount } = await knex.raw(
      `UPDATE users SET full_name = name
        WHERE id IN (SELECT id FROM users WHERE full_name IS NULL ORDER BY id LIMIT ?)`, [batchSize]);
    total += rowCount;
    if (rowCount < batchSize) return total;
    await new Promise((r) => setTimeout(r, 50));                                // let other traffic breathe
  }
}
module.exports = { backfillFullName };
:::

::: code javascript Is this migration safe during a rolling deploy? (runnable)
// Old and new app versions run together: a change is safe only if the OLD code still works afterwards.
const rules = [
  { test: /ADD COLUMN \w+ \w+(\s+DEFAULT [^ ]+)?$/i, safe: true, why: 'additive, nullable or with a default (instant since PG 11)' },
  { test: /DROP COLUMN|RENAME COLUMN|ALTER COLUMN \w+ TYPE/i, safe: false, why: 'old code still uses the column: expand/contract' },
  { test: /CREATE INDEX CONCURRENTLY/i, safe: true, why: 'does not block writes (measured 2 ms)' },
  { test: /CREATE (UNIQUE )?INDEX/i, safe: false, why: 'blocks writes for the whole build (measured 177 ms on 1M rows)' },
  { test: /SET NOT NULL/i, safe: false, why: 'full scan under lock: use CHECK … NOT VALID + VALIDATE' },
];
const check = (sql) => rules.find((r) => r.test.test(sql)) ?? { safe: false, why: 'unknown: review manually' };
const cases = [['ALTER TABLE users ADD COLUMN full_name text', true], ['ALTER TABLE users RENAME COLUMN name TO full_name', false], ['CREATE INDEX CONCURRENTLY users_x ON users (x)', true], ['CREATE INDEX users_x ON users (x)', false], ['ALTER TABLE users ALTER COLUMN full_name SET NOT NULL', false]];
for (const [sql, expected] of cases) { const r = check(sql); console.log(r.safe ? 'SAFE  ' : 'UNSAFE', sql.padEnd(56), '→', r.why, r.safe === expected ? '✅' : '❌ FAIL'); }
:::

::: warning ⚠️ Common mistakes
- Renaming or dropping a column in the same release that stops using it.
- One giant `UPDATE` to backfill millions of rows.
- `CREATE INDEX` without `CONCURRENTLY` on a busy table.
- Running migrations by hand, or only on app start in many pods at once (use one job/lock).
- No `lock_timeout`: a DDL waiting for a lock blocks every query queued behind it.
:::

::: understand
- Every migration must work with both the old and the new code: expand first, contract later.
:::

::: ask
- *"Will the currently deployed version still work after this migration runs?"*
:::

::: important ⭐ Say this in the interview
"Migrations are versioned scripts in git, run by the pipeline with a tool like Knex or Prisma Migrate. During a rolling deploy old and new code run together, so every migration must be backward compatible, which means expand and contract: add the new column, dual-write, backfill in batches, switch reads, and drop the old column in a later release. I measured why: adding a column with a default took 3 milliseconds on a million rows, but a single backfill UPDATE took 10.7 seconds, and a plain CREATE INDEX blocked writes for the whole build while CONCURRENTLY never held a write longer than 2 milliseconds. I also set lock_timeout so a blocked migration fails instead of stalling traffic."
:::

::: links
PostgreSQL: ALTER TABLE | https://www.postgresql.org/docs/current/sql-altertable.html
PostgreSQL: Building indexes concurrently | https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY
Knex: Migrations | https://knexjs.org/guide/migrations.html
:::
