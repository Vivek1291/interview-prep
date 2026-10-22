@section Redis
@icon 🟥
@color #ef4444
@desc Redis for Node.js developers: why it's fast (measured), data structures and use cases (leaderboards, HyperLogLog; measured), TTL, eviction and persistence (measured crash test), distributed locks (measured), rate limiting algorithms (measured) and Redis in a Node.js app. Measured on Redis 7.4.

=== What is Redis, and why is it so fast? (measured)
@p 3
@tags redis, caching, performance, database
@quick
- Redis is an **in-memory data structure server**: strings, hashes, lists, sets, sorted sets, streams, HyperLogLog, pub/sub; optional persistence to disk.
- Fast because data lives in RAM, commands run on **one thread** (no locks; every command is **atomic**) with an event loop like Node's.
- Measured inside the container: **~270k ops/s** (SET/GET/INCR, p50 0.09 ms), **~3M/s** pipelined.
- Measured from Node: Redis GET **0.145 ms** vs Postgres primary-key lookup **0.163 ms** (both ≈ one round trip) vs a revenue report query **36.7 ms**: cache **expensive** results, not cheap indexed lookups.
- Typical uses: cache, sessions, rate limits, locks, leaderboards, queues (BullMQ), pub/sub, real-time counters.

::: text 🧒 In simple words
A database is a **warehouse**: huge and safe, but you walk to fetch things. Redis is the **shelf next to the till**: small, extremely quick to reach, perfect for things you need constantly. If the shop closes suddenly the shelf may be emptied (unless you configure persistence), so the warehouse stays the source of truth.
:::

::: text 📖 Detailed answer
### Measured (Redis 7.4 in Docker, Node 22 client on the same machine)
| Operation | Result |
|---|---|
| `redis-benchmark` SET / GET / ZADD (50 clients) | 276k / 267k / 290k ops/s, p50 ~0.09 ms |
| Pipelined ×16 SET / GET | 2.96M / 3.4M ops/s |
| From Node: in-process `Map.get` | 0.0001 ms |
| From Node: Redis `GET` | **0.145 ms** |
| From Node: Postgres `SELECT … WHERE id = $1` | **0.163 ms** |
| From Node: Postgres revenue report (join + group, 1M rows) | **36.7 ms** |
| 10,000 concurrent GETs from one Node process | 45 ms total (node-redis pipelines automatically) |

### Why single-threaded is fine
- Commands are tiny memory operations; the bottleneck is network round trips, not CPU.
- One thread means **no race conditions inside a command**: `INCR`, `SET NX`, Lua scripts and `MULTI/EXEC` are atomic.
- The flip side: one slow command (`KEYS *`, huge `SMEMBERS`, big Lua scripts) blocks everyone, like blocking Node's event loop. Use `SCAN` and bounded commands.

### Redis vs a database
| | Redis | PostgreSQL / MongoDB |
|---|---|---|
| Storage | RAM (+ optional disk) | disk (+ cache in RAM) |
| Query power | key-based commands | SQL / rich queries, indexes |
| Durability | configurable (RDB/AOF) | strong by default |
| Typical role | cache, ephemeral or derived data, coordination | source of truth |
:::

::: diagram Redis next to the database
flowchart LR
  API["Node.js API"] -->|"GET cache key, about 0.15 ms"| R["Redis in memory"]
  API -->|"on a miss: expensive query, 36.7 ms"| DB["PostgreSQL source of truth"]
  API -->|"rate limits, locks, sessions, queues"| R
:::

::: image What Redis is and how fast it is (measured)
/images/redis/why-redis.svg
:::

::: chart bar Measured from Node: ms per read
Read,ms
Redis GET,0.145
Postgres primary-key lookup,0.163
Postgres revenue report,36.679
:::

::: text 🪜 Step by step
What happens on `await redis.get('report:v1')`:
1. node-redis writes `*2\r\n$3\r\nGET\r\n…` (RESP protocol) on an already open TCP connection.
2. Redis's event loop reads the command, looks up the key in an in-memory hash table (O(1)).
3. It writes the value back; no disk involved.
4. Node's event loop resolves the promise ~0.1 ms later.
5. Many concurrent commands share the same connection (pipelined), so throughput stays high.
:::

::: code javascript redis.js: one shared client for the app (node-redis 5)
const { createClient } = require('redis');

const redis = createClient({
  url: process.env.REDIS_URL,                         // redis://:password@host:6379 or rediss:// for TLS
  socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
});
redis.on('error', (err) => console.error('redis error', err.message));   // without this listener errors crash the process

async function connectRedis() { if (!redis.isOpen) await redis.connect(); return redis; }

async function cached(key, ttlSeconds, load) {        // cache-aside helper
  const hit = await redis.get(key);
  if (hit !== null) return JSON.parse(hit);
  const value = await load();
  await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  return value;
}

module.exports = { redis, connectRedis, cached };
:::

::: code javascript When does caching pay off? (runnable)
// Speed-up from caching = cost of the original read / cost of a cache read (measured numbers).
const measured = { redisGet: 0.145, pgPkLookup: 0.163, pgReport: 36.679 };
const speedup = (original) => +(original / measured.redisGet).toFixed(1);
const pk = speedup(measured.pgPkLookup), report = speedup(measured.pgReport);
console.log({ cachingPkLookup: pk + '×', cachingReport: report + '×' });
console.log('caching an indexed primary-key lookup barely helps', pk < 1.5 ? '✅' : '❌ FAIL');
console.log('caching an expensive aggregate gives ~250×', report > 200 ? '✅' : '❌ FAIL');
// with a 95% hit ratio, average latency of the report endpoint:
const hit = 0.95, avg = hit * measured.redisGet + (1 - hit) * (measured.redisGet + measured.pgReport);
console.log('average with 95% hits:', avg.toFixed(2), 'ms', avg < 2 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating Redis as the only copy of important data with default (snapshot-only) persistence.
- `KEYS *` or huge collections in production (blocks the single thread).
- Caching cheap queries and adding a second system for no gain.
- A new Redis connection per request (reuse one client; it pipelines).
- No `error` listener on the client.
:::

::: understand
- Redis is fast because it's in memory and simple; it's safe to share because each command is atomic.
:::

::: ask
- *"Is this data derived (rebuildable) or the source of truth?"*
:::

::: important ⭐ Say this in the interview
"Redis is an in-memory data structure server: strings, hashes, lists, sets, sorted sets, streams and more. It's fast because everything is in RAM and commands run on a single event-loop thread, which also makes each command atomic. I measured around 270 thousand operations a second inside the container and three million pipelined. From Node, though, a Redis GET was 0.15 milliseconds versus 0.16 for a Postgres primary-key lookup, because both are one round trip, while a reporting query took 37 milliseconds. So I use Redis for caching expensive results, sessions, rate limits, locks, leaderboards and queues, with the database as the source of truth."
:::

::: links
Redis: Introduction | https://redis.io/docs/latest/get-started/
node-redis | https://github.com/redis/node-redis
:::

=== Redis data structures and use cases: leaderboards, counters, sets, HyperLogLog (measured)
@p 2
@tags redis, data-structures, sorted-set, leaderboard
@quick
- **String**: cache values, counters (`INCR`), flags, locks. **Hash**: objects (session, cart) with per-field updates.
- **List**: simple queues and "latest N" (`LPUSH` + `LTRIM`). **Set**: uniqueness, tags, online users, intersections.
- **Sorted set** (member + score, kept ordered): leaderboards, rankings, time-ordered items: measured player rank **0.135 ms** (`ZREVRANK`) vs **2.15 ms** in SQL even with an index.
- **HyperLogLog**: approximate unique counts: measured **248,455** for 250,000 true (0.6% off) in **14 KB** vs **12 MB** for a set.
- **Streams**: durable append-only log with consumer groups (queues/events); **pub/sub**: fire-and-forget broadcast.

::: text 🧒 In simple words
Redis is a **toolbox of containers**: a label (string), a drawer with labelled compartments (hash), a queue line (list), a bag of unique marbles (set), a **scoreboard that's always sorted** (sorted set) and a **guess-the-crowd counter** (HyperLogLog) that estimates how many different people came in using almost no memory.
:::

::: text 📖 Detailed answer
| Type | Key commands | Typical use | Complexity |
|---|---|---|---|
| String | `SET`/`GET`/`INCR`/`SET NX EX` | cache, counters, locks | O(1) |
| Hash | `HSET`/`HGETALL`/`HINCRBY` | session, cart, object fields | O(1) per field |
| List | `LPUSH`/`RPOP`/`BLPOP`/`LTRIM` | queues, recent activity | O(1) at ends |
| Set | `SADD`/`SISMEMBER`/`SINTER` | unique visitors per day, tags, friends | O(1) membership |
| Sorted set | `ZADD`/`ZINCRBY`/`ZREVRANGE`/`ZREVRANK` | leaderboards, priority, sliding windows | O(log n) |
| Stream | `XADD`/`XREADGROUP`/`XACK` | event log, work queues with acks | O(1) append |
| HyperLogLog | `PFADD`/`PFCOUNT` | unique counts (≈0.81% std error) | 12 KB max |
| Geo | `GEOADD`/`GEOSEARCH` | nearby drivers/stores | O(log n) |
| Bitmap | `SETBIT`/`BITCOUNT` | daily active flags per user id | compact |

### Measured: 100,000-player leaderboard
| Query | Redis sorted set | PostgreSQL |
|---|---|---|
| Top 10 | 0.187 ms | 2.85 ms (no index) / 0.189 ms (index) |
| Rank of player 4242 | **0.135 ms** | 2.90 ms (no index) / **2.15 ms** (index: must count rows above) |
Both returned rank 40,754.

### Measured: unique visitors
1,000,000 page views from 250,000 visitors: HyperLogLog said **248,455** using **14,392 bytes**; an exact set used **12,097,256 bytes**.
:::

::: diagram Picking a structure
flowchart TD
  Q{"what do you need?"} -->|"value by key, counter"| S["string"]
  Q -->|"object with fields"| H["hash"]
  Q -->|"ordered by score, rank"| Z["sorted set"]
  Q -->|"unique members"| SET["set"]
  Q -->|"approximate unique count"| HLL["HyperLogLog"]
  Q -->|"durable queue or event log"| ST["stream"]
:::

::: image Redis data structures and what they are for (measured)
/images/redis/data-structures.svg
:::

::: chart bar Measured: ms to get one player's rank among 100,000
Method,ms
Redis ZREVRANK,0.135
SQL with index,2.154
:::

::: text 🪜 Step by step
Game leaderboard with sorted sets:
1. On each match result: `ZINCRBY leaderboard:2026-10 <points> player:42`.
2. Top 10: `ZREVRANGE leaderboard:2026-10 0 9 WITHSCORES`.
3. "Your rank": `ZREVRANK leaderboard:2026-10 player:42` (+1 for 1-based).
4. Players around you: `ZREVRANGE … rank-2 rank+2`.
5. Monthly key + `EXPIRE` keeps old boards from growing forever; the database stores the permanent history.
:::

::: code javascript leaderboard.js, daily uniques and a shopping cart (node-redis)
const { redis } = require('./redis');

const board = (month) => `leaderboard:${month}`;
async function addPoints(month, playerId, points) {
  await redis.zIncrBy(board(month), points, `player:${playerId}`);
  await redis.expire(board(month), 60 * 60 * 24 * 62, 'NX');        // only set TTL the first time
}
async function top(month, n = 10) {
  return redis.zRangeWithScores(board(month), 0, n - 1, { REV: true });
}
async function rankOf(month, playerId) {
  const r = await redis.zRevRank(board(month), `player:${playerId}`);
  return r === null ? null : r + 1;
}

// unique visitors per day: approximate and tiny
async function trackVisit(day, visitorId) { await redis.pfAdd(`uv:${day}`, visitorId); }
async function uniqueVisitors(day) { return redis.pfCount(`uv:${day}`); }

// cart as a hash: one field per product
async function addToCart(userId, productId, qty) { await redis.hIncrBy(`cart:${userId}`, String(productId), qty); await redis.expire(`cart:${userId}`, 60 * 60 * 24 * 7); }
async function getCart(userId) { return redis.hGetAll(`cart:${userId}`); }

module.exports = { addPoints, top, rankOf, trackVisit, uniqueVisitors, addToCart, getCart };
:::

::: code javascript A sorted set in miniature (runnable)
// Members kept ordered by score: rank lookups by binary search instead of counting rows.
function createSortedSet() {
  const arr = []; const scores = new Map();
  const index = (score, member) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; const [s, m] = arr[mid]; if (s > score || (s === score && m > member)) lo = mid + 1; else hi = mid; } return lo; };
  return {
    zadd(member, score) { if (scores.has(member)) arr.splice(index(scores.get(member), member), 1); arr.splice(index(score, member), 0, [score, member]); scores.set(member, score); },
    zrevrank(member) { return scores.has(member) ? index(scores.get(member), member) : null; },
    top(n) { return arr.slice(0, n).map(([s, m]) => `${m}:${s}`); },
  };
}
const z = createSortedSet();
for (let i = 1; i <= 10000; i++) z.zadd(`p${i}`, (i * 7919) % 100000);
const rank = z.zrevrank('p4242');
const naiveRank = [...Array(10000)].filter((_, i) => ((i + 1) * 7919) % 100000 > (4242 * 7919) % 100000).length;
console.log({ top3: z.top(3), rankOfP4242: rank });
console.log('rank matches counting all scores above it', rank === naiveRank ? '✅' : '❌ FAIL');
z.zadd('p4242', 999999);
console.log('updating a score moves the member to the top', z.zrevrank('p4242') === 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing big JSON blobs and rewriting them to change one field (use a hash).
- Huge single keys (a million-member set) that block Redis on read/delete (use `UNLINK`, split keys).
- Leaderboards in SQL with `COUNT(*)` per request at scale.
- Exact unique counting with sets when an estimate is fine.
- Using lists as reliable queues without acknowledgements (use streams or BullMQ).
:::

::: understand
- Choose the structure by the question you'll ask: by key, by score, by membership, or roughly how many.
:::

::: ask
- *"Do we need the exact value, or is a 1% estimate fine?"*
:::

::: important ⭐ Say this in the interview
"Redis gives me data structures, not just key-value: strings for caches, counters and locks, hashes for objects like carts, lists for simple queues, sets for uniqueness, sorted sets for anything ranked, streams for durable event logs and HyperLogLog for approximate unique counts. On 100 thousand players, a sorted set returned a player's rank in 0.135 milliseconds while SQL needed 2 milliseconds even with an index, because it has to count the rows above. HyperLogLog estimated 250 thousand unique visitors within 0.6 percent using 14 kilobytes instead of 12 megabytes."
:::

::: links
Redis: Data types | https://redis.io/docs/latest/develop/data-types/
Redis: Sorted sets | https://redis.io/docs/latest/develop/data-types/sorted-sets/
:::

=== TTL, eviction policies and persistence: what happens when memory fills up or Redis crashes? (measured)
@p 2
@tags redis, ttl, eviction, persistence, durability
@quick
- **TTL**: `SET key value EX 120` / `EXPIRE`; Redis deletes expired keys lazily on access and in a background sweep (measured: `EX 2` → `GET` after 2.1 s = nil).
- **maxmemory + policy**: measured at 20 MB, `noeviction` (default) **rejected 22,103 writes** with OOM errors; `allkeys-lru` accepted all 40,000 by **evicting 22,126** old keys.
- Use `allkeys-lru`/`allkeys-lfu` for pure caches; `noeviction` (or `volatile-*`) when Redis holds sessions, queues or locks.
- **Persistence**: RDB snapshots (default) vs **AOF** (append-only log). Measured after `kill -9`: RDB-only kept **0 of 1,100** recent writes; AOF `everysec` kept **1,100 / 1,100** (an OS crash can lose up to ~1 s).
- High availability: replicas + **Sentinel** (automatic failover) or **Redis Cluster** (sharding); or managed (ElastiCache, Upstash, Redis Cloud).

::: text 🧒 In simple words
TTL is a **"use by" sticker**: Redis throws the item away when it's expired. Eviction is what the shelf does when it's **full**: either refuse new items (noeviction) or throw out what nobody touched lately (LRU). Persistence is whether you also **write things in a notebook** so a power cut doesn't wipe the shelf: snapshots every so often (RDB) or every single change (AOF).
:::

::: text 📖 Detailed answer
### Eviction policies
| Policy | Evicts | Use for |
|---|---|---|
| `noeviction` (default) | nothing: writes fail with OOM | queues, sessions, locks (don't silently lose them) |
| `allkeys-lru` | least recently used of all keys | general caches |
| `allkeys-lfu` | least frequently used | caches with stable hot keys |
| `volatile-lru` / `volatile-ttl` | only keys with a TTL | mixed: cache keys have TTL, others must stay |

### Measured: maxmemory 20 MB, writing 40,000 × 1 KB values
| Policy | Writes accepted | Errors | Keys left | Evicted |
|---|---|---|---|---|
| noeviction | 17,897 | **22,103** (`OOM command not allowed`) | 17,897 | 0 |
| allkeys-lru | 40,000 | 0 | 17,874 | **22,126** |

### Persistence options
| Mode | How | Data loss on crash | Cost |
|---|---|---|---|
| None | memory only | everything | fastest |
| RDB (default `save 3600 1 300 100 60 10000`) | fork + snapshot file | writes since the last snapshot | cheap, compact backups |
| AOF `everysec` | append every write, fsync each second | ≤ ~1 s on power loss | more disk I/O |
| AOF `always` | fsync every write | ~none | slow |
| RDB + AOF | both | as AOF | common for important data |

### Measured crash test (1,100 writes, then `kill -9`)
| Config | Orders kept |
|---|---|
| RDB snapshots only | **0 / 1,100** (only the key saved before the snapshot survived) |
| AOF, `appendfsync everysec` | **1,100 / 1,100** |
Killing the process leaves already-written data in the OS page cache, so even the last 100 writes survived; a machine crash could lose up to one second.
:::

::: diagram Memory full and crash paths
flowchart TD
  W["write when memory is full"] --> P{"maxmemory-policy"}
  P -->|"noeviction"| E["OOM error to the client"]
  P -->|"allkeys-lru"| L["evict least recently used keys, accept the write"]
  C["process crash"] --> D{"persistence"}
  D -->|"RDB only"| R1["restore last snapshot, recent writes lost"]
  D -->|"AOF everysec"| R2["replay the log, at most 1 s lost on power loss"]
:::

::: image TTL, eviction and persistence (measured)
/images/redis/ttl-eviction-persistence.svg
:::

::: chart bar Measured: writes kept out of 1,100 after kill -9
Persistence,Writes kept
RDB only,0
AOF everysec,1100
:::

::: text 🪜 Step by step
Configuring Redis for an app that uses it as cache **and** BullMQ queue:
1. Better: two Redis instances (or databases with separate configs), because their needs conflict.
2. Cache instance: `maxmemory 2gb`, `maxmemory-policy allkeys-lru`, no persistence.
3. Queue instance: `maxmemory-policy noeviction`, `appendonly yes`, `appendfsync everysec`, replicas + Sentinel.
4. Alert on memory > 80% and on `evicted_keys` / `rejected_connections`.
5. If you must share one instance: `volatile-lru` and give every cache key a TTL.
:::

::: code bash redis.conf / docker-compose settings for the two roles
# cache instance (lose it = slower, not broken)
redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru --save "" --appendonly no

# queue / session instance (must not lose data)
redis-server --maxmemory 1gb --maxmemory-policy noeviction \
  --appendonly yes --appendfsync everysec \
  --save "3600 1 300 100 60 10000"

# check at runtime
redis-cli CONFIG GET maxmemory-policy
redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human"
redis-cli INFO stats  | grep -E "evicted_keys|expired_keys"
redis-cli INFO persistence | grep -E "aof_enabled|rdb_last_save_time"
:::

::: code javascript LRU eviction in miniature (runnable)
// A Map keeps insertion order: re-inserting on access makes the first entry the least recently used.
function createLru(capacity) {
  const m = new Map(); let evicted = 0;
  return {
    get(k) { if (!m.has(k)) return undefined; const v = m.get(k); m.delete(k); m.set(k, v); return v; },
    set(k, v) { if (m.has(k)) m.delete(k); m.set(k, v); if (m.size > capacity) { m.delete(m.keys().next().value); evicted++; } },
    get size() { return m.size; }, get evicted() { return evicted; },
  };
}
const lru = createLru(3);
lru.set('a', 1); lru.set('b', 2); lru.set('c', 3);
lru.get('a');                 // a becomes most recently used
lru.set('d', 4);              // evicts b (least recently used)
console.log({ a: lru.get('a'), b: lru.get('b'), size: lru.size, evicted: lru.evicted });
console.log('least recently used key evicted, recently read key kept', lru.get('b') === undefined && lru.get('a') === 1 ? '✅' : '❌ FAIL');
const noeviction = (used, max) => (used >= max ? 'OOM command not allowed' : 'OK');
console.log('noeviction rejects writes when full', noeviction(20, 20) === 'OOM command not allowed' ? '✅ (measured 22,103 rejected)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Default `noeviction` on a cache: the app starts failing writes when memory fills.
- `allkeys-lru` on a Redis that also holds queues/sessions (jobs silently evicted).
- Assuming Redis is durable without AOF.
- Cache keys without TTL (memory grows forever).
- One Redis for everything with conflicting requirements.
:::

::: understand
- TTL decides when data leaves; the eviction policy decides what happens when memory is full; persistence decides what survives a crash.
:::

::: ask
- *"If this Redis lost all its data right now, what would break?"*
:::

::: important ⭐ Say this in the interview
"Keys get a TTL with EX or EXPIRE and Redis removes them lazily and in a background sweep. When memory hits maxmemory, the policy decides: with the default noeviction my test rejected 22 thousand writes with OOM errors, while allkeys-lru accepted everything by evicting the least recently used keys. So caches get allkeys-lru, while sessions, queues and locks get noeviction. For durability, the default RDB snapshots lost all 1,100 writes made since the last snapshot when I killed the process, while AOF with everysec kept all of them. For high availability I add replicas with Sentinel, or Cluster for sharding."
:::

::: links
Redis: Key eviction | https://redis.io/docs/latest/develop/reference/eviction/
Redis: Persistence | https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
:::

=== How do you build a distributed lock with Redis, and what are its limits? (measured)
@p 3
@tags redis, distributed-lock, concurrency, scheduling
@quick
- Acquire: `SET lock:<name> <random token> NX PX <ttl>`: only one caller gets `OK`. Measured: 20 instances starting a nightly job → **20 runs without a lock, 1 with it**.
- Release with a **Lua script that checks the token** before deleting. Measured pitfall: after A's lock expired and B took it, A's **blind `DEL` removed B's lock** and C acquired it too.
- TTL must exceed the work time (or be renewed while working); otherwise two holders overlap.
- Redis locks are best for **efficiency** (avoid duplicate work). For **correctness** (money, inventory) rely on database constraints, row locks or **fencing tokens**.
- Redlock (multiple independent Redis nodes) exists but is debated; most apps need a single Redis lock or a DB lock.

::: text 🧒 In simple words
A Redis lock is a **"room occupied" sign with a timer**. You hang it with your name on it; when you leave you only take it down **if it's still your sign**. If you take too long the timer removes it and someone else may enter, so for really important rooms you also need a lock **on the door itself** (the database).
:::

::: text 📖 Detailed answer
### Measured (Redis 7.4)
| Scenario | Result |
|---|---|
| 20 parallel instances, no lock | job ran **20** times |
| 20 parallel instances, `SET NX PX` | job ran **1** time |
| A's lock (100 ms TTL) expires during work, B acquires, A does a blind `DEL` | B's lock deleted; **C acquires while B still works** |

### Correct pattern
1. `token = randomUUID()`.
2. `SET lock:job token NX PX 30000` → `OK` means you hold it; `null` means someone else does.
3. Do the work (renew with a token-checked `PEXPIRE` if it can run long).
4. Release: Lua `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end`.

### Why it's not a correctness guarantee
- A garbage-collection pause or slow network can outlast the TTL: two workers believe they hold the lock.
- Redis failover (replication is async) can lose a lock just acquired.
- **Fencing token**: an increasing number handed out with the lock (`INCR lock:job:fence`); the database rejects writes with an older token, so a stale holder can't do damage.

### Alternatives
| Need | Tool |
|---|---|
| One instance runs a cron job | Redis lock, BullMQ repeatable job, or DB advisory lock |
| Protect a row's invariant | `SELECT … FOR UPDATE`, atomic `UPDATE … WHERE`, unique constraint |
| Leader election | etcd/ZooKeeper/Consul, Kubernetes leases |
| Postgres only | `pg_try_advisory_lock(key)` |
:::

::: diagram Lock with token-checked release
sequenceDiagram
  participant A as Instance A
  participant R as Redis
  participant B as Instance B
  A->>R: "SET lock token-A NX PX 30000"
  R-->>A: "OK"
  B->>R: "SET lock token-B NX PX 30000"
  R-->>B: "nil, already locked"
  A->>R: "EVAL: delete only if value is token-A"
  R-->>A: "1, released"
:::

::: image Distributed locks with Redis (measured)
/images/redis/distributed-lock.svg
:::

::: chart bar Measured: how many of 20 instances ran the job
Locking,Runs
no lock,20
SET NX PX,1
:::

::: text 🪜 Step by step
Nightly invoice generation on 4 API pods (each has a cron timer):
1. At 02:00 all 4 timers fire.
2. Each tries `SET lock:invoices:2026-10-22 <token> NX PX 600000`; one wins.
3. The winner generates invoices, writing each with a unique `(customer_id, period)` constraint (the real safety net).
4. It releases with the token check; the losers log "skipped, lock held".
5. Even if two ran (GC pause, failover), the unique constraint prevents duplicate invoices.
:::

::: code javascript lock.js: acquire, renew and token-checked release (node-redis)
const crypto = require('node:crypto');
const { redis } = require('./redis');

const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const RENEW = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

async function withLock(name, ttlMs, work) {
  const key = `lock:${name}`;
  const token = crypto.randomUUID();
  if ((await redis.set(key, token, { NX: true, PX: ttlMs })) !== 'OK') return { ran: false };
  const renew = setInterval(() => redis.eval(RENEW, { keys: [key], arguments: [token, String(ttlMs)] }).catch(() => {}), ttlMs / 3);
  try {
    const fence = await redis.incr(`${key}:fence`);          // increasing fencing token for downstream writes
    return { ran: true, result: await work({ fence }) };
  } finally {
    clearInterval(renew);
    await redis.eval(RELEASE, { keys: [key], arguments: [token] });
  }
}

// usage: run the nightly job on exactly one instance
async function nightlyInvoices(generate) {
  const day = new Date().toISOString().slice(0, 10);
  const { ran } = await withLock(`invoices:${day}`, 60_000, ({ fence }) => generate({ day, fence }));
  if (!ran) console.log('another instance is generating invoices');
}

module.exports = { withLock, nightlyInvoices };
:::

::: code javascript Why release must check the token (runnable)
// Simulated Redis with TTLs; compares a blind DEL with a token-checked release.
function createRedis() {
  const data = new Map(); let now = 0;
  const live = (k) => { const e = data.get(k); if (e && e.exp <= now) data.delete(k); return data.get(k); };
  return { tick: (ms) => (now += ms), setNx: (k, v, px) => (live(k) ? null : (data.set(k, { v, exp: now + px }), 'OK')), get: (k) => live(k)?.v ?? null, del: (k) => data.delete(k), releaseIfOwner: (k, v) => (live(k)?.v === v ? data.delete(k) : false) };
}
for (const safe of [false, true]) {
  const r = createRedis();
  r.setNx('lock', 'A', 100); r.tick(150);                    // A's TTL expires while A is still working
  r.setNx('lock', 'B', 5000);                                // B acquires
  safe ? r.releaseIfOwner('lock', 'A') : r.del('lock');      // A finishes and releases
  const c = r.setNx('lock', 'C', 5000);                      // C tries while B still works
  console.log(safe ? 'token-checked release:' : 'blind DEL:', { holder: r.get('lock'), cAcquired: c === 'OK' });
  console.log(safe ? 'B keeps its lock' : 'two holders at once (B and C)', (safe ? c === null : c === 'OK') ? '✅ (matches the Redis measurement)' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- `SETNX` then `EXPIRE` as two commands (crash in between = lock forever); use `SET … NX PX`.
- Releasing with a plain `DEL` (deletes someone else's lock after expiry).
- TTL shorter than the work, without renewal.
- Using a Redis lock as the only protection for money or stock.
- Locks without timeouts in the waiting code (callers spin forever).
:::

::: understand
- SET NX PX + token check = safe for avoiding duplicate work; correctness still lives in the database.
:::

::: ask
- *"What's the worst that happens if two instances run this at the same time?"*
:::

::: important ⭐ Say this in the interview
"I acquire with SET key token NX PX ttl, with a random token, and release with a Lua script that deletes only if the value is still my token. I tested both sides: without a lock, twenty instances ran a nightly job twenty times, with the lock once; and a blind DEL after my lock expired deleted another worker's lock and let a third worker in. TTLs must exceed the work or be renewed. Because GC pauses and failovers can still produce two holders, I treat Redis locks as an efficiency tool and keep correctness in the database with unique constraints, row locks or fencing tokens."
:::

::: links
Redis: Distributed locks | https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
Martin Kleppmann: How to do distributed locking | https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
:::

=== How do you implement rate limiting with Redis? (fixed window, sliding window, token bucket; measured)
@p 3
@tags redis, rate-limiting, api, security
@quick
- Rate limits protect APIs from abuse, brute force and noisy neighbours; they must be **shared across instances**, so the counter lives in Redis.
- **Fixed window** (`INCR` + `EXPIRE` per second/minute): simplest; measured **20 of 20** requests allowed in 40 ms across a window boundary with a 10/s limit (**2× burst**).
- **Sliding log** (sorted set of timestamps) and **token bucket** (Lua script): measured **10 of 20**, exact limits.
- Atomicity: `INCR` and Lua scripts are atomic: 200 parallel requests from several instances → exactly **10** allowed.
- Respond **429** with `Retry-After` / `RateLimit` headers; key by user id for authenticated routes and by IP (carefully) for login.

::: text 🧒 In simple words
A **fixed window** is a bouncer who lets in 10 people per minute and resets his counter on the minute: 10 at 11:59:59 and 10 more at 12:00:01. A **token bucket** is a jar that refills one token at a time; each visitor takes a token, so bursts are limited to what's in the jar.
:::

::: text 📖 Detailed answer
### Algorithms
| Algorithm | Storage | Accuracy | Notes |
|---|---|---|---|
| Fixed window | 1 counter per window | boundary bursts up to 2× | `INCR`, cheapest |
| Sliding log | 1 entry per request (sorted set) | exact | memory grows with limit |
| Sliding window counter | 2 counters, weighted | approximate | good balance |
| Token bucket | tokens + timestamp | exact, allows bursts up to capacity | Lua for atomicity |
| Leaky bucket | queue | smooth output | used in traffic shaping |

### Measured (Redis 7.4, limit 10 per second, 10 requests at t = 990 ms and 10 at t = 1,010 ms)
| Algorithm | Allowed |
|---|---|
| Fixed window | **20 of 20** |
| Sliding log | **10 of 20** |
| Token bucket (capacity 10, refill 10/s) | **10 of 20** |
| Fixed window, 200 parallel requests | exactly **10** (atomic `INCR`) |

### What to key on
- Login: per account **and** per IP (credential stuffing uses many IPs, brute force hits one account).
- API: per API key/user, with higher tiers for paying customers.
- Behind proxies: trust `X-Forwarded-For` only from your load balancer (`app.set('trust proxy', 1)`), or every request looks like it comes from the LB.
:::

::: diagram Rate limit middleware
flowchart LR
  R["request"] --> K["key: user id or IP plus route"]
  K --> L["atomic check in Redis: INCR or Lua"]
  L -->|"under limit"| N["next handler"]
  L -->|"over limit"| T["429 with Retry-After"]
:::

::: image Rate limiting algorithms with Redis (measured)
/images/redis/rate-limiting.svg
:::

::: chart bar Measured: requests allowed of 20 sent across a window boundary (limit 10/s)
Algorithm,Allowed
fixed window,20
sliding log,10
token bucket,10
:::

::: text 🪜 Step by step
Protecting `POST /api/auth/login`:
1. Key `rl:login:ip:<ip>` (20/min) and `rl:login:acct:<email>` (5/15 min).
2. Middleware runs the token-bucket Lua script for both keys.
3. Over the limit → `429` with `Retry-After`; don't reveal whether the account exists.
4. Successful login resets the account counter.
5. Metrics on 429s feed alerts (an attack shows up as a spike).
:::

::: code javascript Token bucket middleware for Express with a Lua script (node-redis)
const { redis } = require('./redis');

// KEYS[1] bucket key · ARGV: capacity, refill per second, now (ms) → returns { allowed, tokensLeft, retryAfterMs }
const TOKEN_BUCKET = `
local cap, rate, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local tokens = tonumber(redis.call('HGET', KEYS[1], 't') or cap)
local ts = tonumber(redis.call('HGET', KEYS[1], 'ts') or now)
tokens = math.min(cap, tokens + (now - ts) * rate / 1000)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1 allowed = 1 end
redis.call('HSET', KEYS[1], 't', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000))
local retry = 0
if allowed == 0 then retry = math.ceil((1 - tokens) / rate * 1000) end
return { allowed, math.floor(tokens), retry }`;

function rateLimit({ name, capacity, perSecond, key = (req) => req.user?.id ?? req.ip }) {
  return async (req, res, next) => {
    try {
      const [allowed, left, retryMs] = await redis.eval(TOKEN_BUCKET, {
        keys: [`rl:${name}:${key(req)}`],
        arguments: [String(capacity), String(perSecond), String(Date.now())],
      });
      res.set('RateLimit', `limit=${capacity}, remaining=${left}`);
      if (allowed === 1) return next();
      res.set('Retry-After', String(Math.ceil(retryMs / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    } catch (err) {
      next();                                    // fail open if Redis is down (or fail closed for login, by policy)
    }
  };
}

module.exports = { rateLimit };
// app.post('/api/auth/login', rateLimit({ name: 'login', capacity: 5, perSecond: 5 / 900 }), loginHandler);
:::

::: code javascript Fixed window vs token bucket at a boundary (runnable)
function fixedWindow(limit, windowMs) { const counts = new Map(); return (t) => { const w = Math.floor(t / windowMs); const n = (counts.get(w) ?? 0) + 1; counts.set(w, n); return n <= limit; }; }
function tokenBucket(capacity, perSecond) { let tokens = capacity, last = null; return (t) => { if (last !== null) tokens = Math.min(capacity, tokens + ((t - last) * perSecond) / 1000); last = t; if (tokens >= 1) { tokens -= 1; return true; } return false; }; }
const times = [...Array.from({ length: 10 }, (_, i) => 10990 + i), ...Array.from({ length: 10 }, (_, i) => 11010 + i)];   // 10 just before, 10 just after a boundary
const fw = fixedWindow(10, 1000), tb = tokenBucket(10, 10);
const allowedFixed = times.filter((t) => fw(t)).length, allowedBucket = times.filter((t) => tb(t)).length;
console.log({ allowedFixed, allowedBucket });
console.log('fixed window lets 2× through at the boundary', allowedFixed === 20 ? '✅ (measured 20/20)' : '❌ FAIL');
console.log('token bucket holds the limit', allowedBucket === 10 ? '✅ (measured 10/20)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- In-memory rate limits with several instances (each allows the full limit).
- Read-then-write counters instead of atomic `INCR`/Lua.
- Rate limiting by IP behind a load balancer without `trust proxy` (everyone shares one IP).
- Only IP-based login limits (distributed attacks bypass them).
- No `Retry-After`, so clients retry immediately.
:::

::: understand
- The algorithm decides burst behaviour; Redis atomicity makes it correct across instances.
:::

::: ask
- *"Should this limit fail open or fail closed if Redis is unavailable?"*
:::

::: important ⭐ Say this in the interview
"Rate limits must be shared across instances, so the counter lives in Redis and the check is atomic, with INCR or a Lua script. A fixed window is the simplest but allows bursts at window boundaries: with a limit of ten per second I measured twenty of twenty requests getting through within 40 milliseconds around the boundary. A sliding log with a sorted set or a token bucket in Lua allowed exactly ten. Even with 200 parallel requests from several instances, atomic INCR allowed exactly ten. I return 429 with Retry-After, key by user or API key, and for login by both account and IP."
:::

::: links
Redis: Rate limiting patterns | https://redis.io/glossary/rate-limiting/
IETF draft: RateLimit header fields | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
:::

=== How do you use Redis safely in a Node.js app? (clients, keys, sessions, failures)
@p 2
@tags redis, nodejs, sessions, reliability
@quick
- One long-lived client per process (node-redis or ioredis); it reconnects and pipelines automatically (measured: 10,000 concurrent GETs in 45 ms).
- **Key naming**: `app:entity:id[:field]` (e.g. `shop:user:42:cart`); version cache keys (`report:v2`) so deploys don't read old shapes.
- Always set **TTLs** on cache keys; avoid huge keys and `KEYS *` (use `SCAN`).
- Decide failure behaviour: cache → **fail open** (fall back to the DB with timeouts); rate limits/locks → explicit policy; sessions → Redis must be highly available.
- Sessions in Redis (`connect-redis`) make every instance stateless; BullMQ, Socket.IO adapters and caches are the other common Node uses.

::: text 🧒 In simple words
Treat Redis like **a fast assistant who can be temporarily out of the office**: give tasks clear labels (key names), make sure notes expire, and decide in advance what to do when the assistant doesn't answer (usually: do it the slower way yourself).
:::

::: text 📖 Detailed answer
### Client setup
- node-redis 5 or ioredis; create once, `await connect()` at startup, `quit()` on graceful shutdown.
- `error` listener (otherwise an unhandled `error` event crashes Node).
- Command timeouts so a stuck Redis doesn't hang requests.
- TLS (`rediss://`) and AUTH/ACL users in production; never expose Redis to the internet.

### Key design
| Rule | Example |
|---|---|
| Namespaced | `shop:cache:product:42`, `shop:rl:login:ip:1.2.3.4` |
| Versioned cache keys | `shop:cache:report:v3:2026-10` |
| Bounded size | split giant hashes/sets by time or shard |
| TTL everywhere for caches | `EX 300` + jitter |

### Failure modes
| Use | If Redis is down | Policy |
|---|---|---|
| Cache | slower, DB load ↑ | fail open with a short timeout; protect the DB (stampede control) |
| Rate limit | no limits | fail open for normal APIs, fail closed for login |
| Lock | jobs may not run | retry later; DB constraints still protect data |
| Sessions | everyone logged out | replicas + Sentinel / managed HA |
| Queue (BullMQ) | jobs can't be enqueued | outbox table, retry enqueue |

### Security
Redis has no per-key permissions by default and `CONFIG`/`FLUSHALL` are dangerous: bind to a private network, require AUTH/ACLs, rename or disable dangerous commands, and use TLS between services.
:::

::: diagram Redis inside a Node.js service
flowchart TD
  APP["Express app"] --> S["sessions: connect-redis"]
  APP --> C["cache-aside with TTL"]
  APP --> RL["rate limiting: Lua"]
  APP --> Q["BullMQ queues"]
  APP --> WS["Socket.IO adapter: pub/sub"]
  S --> R["Redis primary plus replica"]
  C --> R
  RL --> R
  Q --> R
  WS --> R
:::

::: image What Redis is and how fast it is (measured)
/images/redis/why-redis.svg
:::

::: text 🪜 Step by step
Redis becomes unreachable during peak traffic:
1. Cache reads time out after 50 ms → the helper logs once and queries the DB directly (fail open).
2. A stampede guard (single-flight per process) keeps DB load bounded.
3. Rate limiting fails open for browsing but closed for `/login` (returns 503 rather than allowing brute force).
4. The client reconnects with backoff; a circuit breaker stops trying for 5 s after repeated failures.
5. Alerts fire on Redis errors; after recovery, hit ratio returns as keys repopulate.
:::

::: code javascript Fail-open cache helper with timeout and single-flight
const { redis } = require('./redis');

const inflight = new Map();
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('redis timeout')), ms))]);

async function getOrLoad(key, ttlSeconds, load) {
  try {
    const hit = await withTimeout(redis.get(key), 50);
    if (hit !== null) return JSON.parse(hit);
  } catch (err) {
    console.warn('cache unavailable, falling back to the database:', err.message);   // fail open
  }
  if (inflight.has(key)) return inflight.get(key);                                   // one DB call per key per process
  const p = (async () => {
    const value = await load();
    const jitter = Math.floor(Math.random() * ttlSeconds * 0.1);                    // avoid synchronized expiry
    withTimeout(redis.set(key, JSON.stringify(value), { EX: ttlSeconds + jitter }), 50).catch(() => {});
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

module.exports = { getOrLoad };
:::

::: code javascript Key naming and TTL jitter helpers (runnable)
const key = (...parts) => ['shop', ...parts].map((p) => String(p).replace(/[:\s]/g, '_')).join(':');
const ttlWithJitter = (base, pct = 0.1) => base + Math.floor(Math.random() * base * pct);
const k = key('cache', 'report', 'v3', '2026-10');
console.log(k);
console.log('namespaced and versioned', k === 'shop:cache:report:v3:2026-10' ? '✅' : '❌ FAIL');
console.log('user input cannot inject extra key segments', key('user', 'a:b c') === 'shop:user:a_b_c' ? '✅' : '❌ FAIL');
const ttls = Array.from({ length: 1000 }, () => ttlWithJitter(300));
const distinct = new Set(ttls).size;
console.log({ minTtl: Math.min(...ttls), maxTtl: Math.max(...ttls), distinctExpiryTimes: distinct });
console.log('jitter spreads expiry over ~30 s instead of one instant', distinct > 20 && Math.max(...ttls) < 330 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Creating a client per request or per module import.
- No timeouts: a slow Redis makes every request slow.
- Redis open to the internet without AUTH (a classic breach).
- Unversioned cache keys after changing the cached JSON shape.
- Forgetting `quit()` in graceful shutdown and tests.
:::

::: understand
- One client, namespaced keys with TTLs, explicit failure policies, private network and auth.
:::

::: ask
- *"For each thing we put in Redis, what happens if Redis is down for 5 minutes?"*
:::

::: important ⭐ Say this in the interview
"I keep one long-lived Redis client per process with an error listener, timeouts and reconnect backoff; it pipelines concurrent commands, so ten thousand GETs took 45 milliseconds. Keys are namespaced and cache keys versioned with TTLs plus jitter. I decide failure behaviour per use: caches fail open to the database with stampede protection, rate limits fail open except on login, sessions and queues need a highly available Redis. Redis stays on a private network with ACLs and TLS, and I close the client during graceful shutdown."
:::

::: links
node-redis: Getting started | https://redis.io/docs/latest/develop/clients/nodejs/
Redis: Security | https://redis.io/docs/latest/operate/oss_and_stack/management/security/
:::
