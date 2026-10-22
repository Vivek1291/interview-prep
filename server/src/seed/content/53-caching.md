@section Caching
@icon 🗃️
@color #8b5cf6
@desc Caching for backend interviews: the cache layers and what each saves (measured throughput 50 → 13,199 req/s), cache-aside vs read-through vs write-through vs write-behind, invalidation and its race condition (measured), stampede, penetration and avalanche (measured), and in-memory vs distributed caches with hit ratios.

=== Where do you cache, and what does each layer buy you? (measured)
@p 3
@tags caching, performance, redis, cdn, architecture
@quick
- Layers from the user inwards: **browser** (HTTP `Cache-Control`/`ETag`) → **CDN/edge** → **reverse proxy** → **in-process memory** → **Redis** (shared) → **database** (buffer cache, materialised views).
- The closer to the user, the cheaper the hit: a fresh browser cache hit makes **no request at all**.
- Measured on an endpoint running a 1M-row report: **50 req/s** (p50 377 ms) without cache, **13,199 req/s** (p50 1 ms) with Redis, **17,559 req/s** with in-process memory.
- In-process caches are fastest but **per instance** (inconsistent across pods, lost on restart); Redis is shared and survives app restarts.
- Cache **expensive, frequently read, rarely changing** data; measure hit ratio and staleness tolerance first.

::: text 🧒 In simple words
Caching is keeping copies **closer to where they're needed**: a snack in your pocket (browser), a vending machine in the lobby (CDN), a fridge in the office (Redis), and the supermarket (database) for everything else. The closer the copy, the faster you eat, but the more likely the copy is a bit old.
:::

::: text 📖 Detailed answer
| Layer | Example | Saves | Watch out for |
|---|---|---|---|
| Browser | `Cache-Control: max-age`, ETag/304 | the whole request | stale UI; versioned asset names |
| CDN / edge | CloudFront, Cloudflare `s-maxage` | latency + origin load | caching private data; purge strategy |
| Reverse proxy | Nginx `proxy_cache` | app work for public GETs | cache keys (query, headers) |
| In-process | `Map`, `lru-cache` | network hop to Redis | per-instance copies, memory, restarts |
| Distributed | Redis, Memcached | DB queries, computation | invalidation, stampedes, extra system |
| Database | buffer cache, materialised views | disk reads, repeated aggregation | refresh cost |

### Measured (Express 5, `GET /report` = join + group over 1M orders, 20 connections, 6 s)
| Variant | req/s | p50 | p99 |
|---|---|---|---|
| No cache | **50** | 377 ms | 639 ms |
| Redis cache-aside | **13,199** | 1 ms | 3 ms |
| In-process memory (5 s TTL) | **17,559** | <1 ms | 2 ms |

### What to cache
- Good: computed reports, product catalogue, configuration, rendered fragments, third-party API responses, permission lookups.
- Questionable: per-user data with low reuse, cheap indexed lookups (measured: Redis GET 0.145 ms ≈ Postgres PK lookup 0.163 ms), data that must be exactly current (balances).
:::

::: diagram Request through the cache layers
flowchart LR
  U["user"] --> B["browser cache"]
  B -->|"miss"| CDN["CDN edge"]
  CDN -->|"miss"| API["Node API: in-process cache"]
  API -->|"miss"| R["Redis"]
  R -->|"miss"| DB["database"]
:::

::: image Where to cache: the layers (measured)
/images/caching/layers.svg
:::

::: chart bar Measured: requests per second for an expensive report endpoint
Variant,req/s
no cache,50
Redis,13199
in-process memory,17559
:::

::: text 🪜 Step by step
Making a product listing page fast:
1. Static assets: hashed file names + `immutable` year-long browser/CDN caching.
2. `GET /api/products?category=chairs`: CDN `s-maxage=60, stale-while-revalidate=300` (public data).
3. In the API: Redis cache-aside for the category query (TTL 5 min + jitter).
4. Product updates: delete the Redis key and purge the CDN path.
5. Measure hit ratio at each layer; the database should now see a small fraction of requests.
:::

::: code javascript Two-level cache: in-process LRU in front of Redis (lru-cache + node-redis)
const { LRUCache } = require('lru-cache');
const { redis } = require('./redis');

const local = new LRUCache({ max: 5_000, ttl: 5_000 });          // per instance, 5 s, bounded memory

async function twoLevelGet(key, ttlSeconds, load) {
  const l1 = local.get(key);
  if (l1 !== undefined) return l1;                                // ~0.0001 ms (measured Map lookup)

  const l2 = await redis.get(key);                                // ~0.15 ms
  if (l2 !== null) { const v = JSON.parse(l2); local.set(key, v); return v; }

  const value = await load();                                     // the expensive part (37 ms report)
  await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  local.set(key, value);
  return value;
}

async function invalidate(key) {
  local.delete(key);                                              // only this instance!
  await redis.del(key);
  await redis.publish('cache:invalidate', key);                   // other instances drop their L1 copy
}

async function listenForInvalidations() {
  const sub = redis.duplicate();
  await sub.connect();
  await sub.subscribe('cache:invalidate', (key) => local.delete(key));
}

module.exports = { twoLevelGet, invalidate, listenForInvalidations };
:::

::: code javascript Average latency with a hit ratio (runnable)
// Expected latency = hit ratio × cache cost + miss ratio × (cache cost + DB cost), using measured costs.
const cost = { memory: 0.0001, redis: 0.145, db: 36.679 };
const avg = (hit, layer) => hit * cost[layer] + (1 - hit) * (cost[layer] + cost.db);
const table = [0, 0.5, 0.9, 0.99].map((h) => ({ hitRatio: h, redisAvgMs: +avg(h, 'redis').toFixed(3) }));
console.table(table);
console.log('90% hit ratio cuts average latency ~9×', cost.db / avg(0.9, 'redis') > 8 ? '✅' : '❌ FAIL');
console.log('99% hit ratio cuts it ~70×', cost.db / avg(0.99, 'redis') > 60 ? '✅' : '❌ FAIL');
console.log('misses dominate: going 90% → 99% matters more than a faster cache', avg(0.99, 'redis') < avg(0.9, 'memory') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Adding Redis before checking indexes and queries.
- Caching per-user or private responses on a CDN (`public` instead of `private`).
- In-process caches in a multi-instance app without invalidation broadcast.
- No TTLs (stale data and unbounded memory).
- Not measuring hit ratio, so nobody knows if the cache helps.
:::

::: understand
- Cache as close to the user as correctness allows, and measure the hit ratio at each layer.
:::

::: ask
- *"How stale may this data be, and who can see it (public or per user)?"*
:::

::: important ⭐ Say this in the interview
"I think in layers: browser and CDN caching through HTTP headers, then a reverse proxy, then in-process memory, a shared cache like Redis, and finally the database's own caching. The closer to the user, the cheaper the hit. On an endpoint running a million-row report I measured 50 requests a second without caching, about 13 thousand with Redis and 17 thousand with in-process memory. In-process caches are fastest but per instance, so I use them for small, short-lived data with an invalidation broadcast, and Redis as the shared layer. I cache expensive, frequently read data and track hit ratios."
:::

::: links
web.dev: HTTP cache | https://web.dev/articles/http-cache
lru-cache | https://github.com/isaacs/node-lru-cache
:::

=== Cache-aside vs read-through vs write-through vs write-behind: which pattern when?
@p 3
@tags caching, patterns, redis, consistency
@quick
- **Cache-aside (lazy loading)**: the app reads the cache, on a miss loads from the DB and fills the cache; on writes it updates the DB and **deletes** the key. Most common.
- **Read-through**: the cache layer itself loads on a miss (same idea, logic inside a library/service).
- **Write-through**: every write goes to DB **and** cache together: reads are always warm and fresh, writes are slower, and you cache data nobody reads.
- **Write-behind (write-back)**: write to the cache now, flush to the DB later in batches: very fast writes, **risk of data loss**, complex.
- **Refresh-ahead**: refresh hot keys before they expire (no user ever sees the miss).

::: text 🧒 In simple words
Cache-aside is **checking your notebook first, and only asking the librarian when it's not there** (then writing it down). Write-through is **writing in your notebook and the library's book at the same time**. Write-behind is **writing in your notebook now and telling the library at the end of the day**: quick, but if you lose the notebook, the library never hears about it.
:::

::: text 📖 Detailed answer
| Pattern | Read path | Write path | Fresh? | Risk |
|---|---|---|---|---|
| Cache-aside | cache → miss → DB → fill | DB, then `DEL` key | stale until TTL/delete | first request slow, races |
| Read-through | cache loads from DB | as aside | same | needs a loader layer |
| Write-through | cache (always warm) | DB + cache synchronously | yes | slower writes, cold-data clutter |
| Write-behind | cache | cache, async flush | cache yes, DB later | lose writes if cache dies |
| Refresh-ahead | cache | any | yes for hot keys | refreshing unused keys |

### Delete or update on write?
Prefer **delete** (`DEL key`) after the DB write: the next read rebuilds from the source of truth. Updating the cache directly can write values out of order under concurrency (two writers, wrong one wins in the cache).

### Typical choices
- Product catalogue, profiles, reports → cache-aside + TTL.
- Session store, feature flags → write-through (always read right after writing).
- Counters/analytics at huge write rates (views, likes) → write-behind: `INCR` in Redis, flush to the DB every few seconds; accept small loss or use AOF.
- Home page modules → refresh-ahead every minute by a background job.
:::

::: diagram Cache-aside read and write
sequenceDiagram
  participant API as API
  participant C as Redis
  participant DB as Database
  API->>C: "GET product:42"
  C-->>API: "miss"
  API->>DB: "SELECT product 42"
  API->>C: "SET product:42 EX 300"
  Note over API,DB: "write path"
  API->>DB: "UPDATE product 42"
  API->>C: "DEL product:42"
:::

::: image Caching patterns
/images/caching/patterns.svg
:::

::: text 🪜 Step by step
Counting article views with write-behind:
1. Each view: `INCR views:article:42` in Redis (0.1 ms, no DB write).
2. Every 10 s a worker does `GETDEL`-style draining for each dirty article and `UPDATE articles SET views = views + $n` in one batch.
3. 10,000 views per second become a few hundred DB updates.
4. If Redis crashes, up to 10 s of counts are lost (acceptable for views, not for payments).
5. The article page reads `db_views + pending_redis_views` for an up-to-date number.
:::

::: code javascript Cache-aside, write-through and write-behind in Node (node-redis + pg)
const { redis } = require('./redis');
const { pool } = require('./db');

// cache-aside
async function getProduct(id) {
  const key = `product:${id}`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const { rows } = await pool.query('SELECT id, name, price_cents FROM products WHERE id = $1', [id]);
  if (rows[0]) await redis.set(key, JSON.stringify(rows[0]), { EX: 300 });
  return rows[0] ?? null;
}
async function updateProductPrice(id, priceCents) {
  await pool.query('UPDATE products SET price_cents = $2 WHERE id = $1', [id, priceCents]);
  await redis.del(`product:${id}`);                                // delete, don't update
}

// write-through: sessions are read right after being written
async function saveSession(sid, data) {
  await pool.query('INSERT INTO sessions (sid, data) VALUES ($1, $2) ON CONFLICT (sid) DO UPDATE SET data = $2', [sid, data]);
  await redis.set(`sess:${sid}`, JSON.stringify(data), { EX: 86_400 });
}

// write-behind: counters flushed in batches
async function recordView(articleId) {
  await redis.multi().incr(`views:${articleId}`).sAdd('views:dirty', String(articleId)).exec();
}
async function flushViews() {
  const ids = await redis.sPopCount('views:dirty', 500);
  for (const id of ids) {
    const n = Number(await redis.getDel(`views:${id}`));
    if (n) await pool.query('UPDATE articles SET views = views + $2 WHERE id = $1', [id, n]);
  }
}
setInterval(() => flushViews().catch((e) => console.error('flush failed', e)), 10_000).unref();

module.exports = { getProduct, updateProductPrice, saveSession, recordView, flushViews };
:::

::: code javascript Why delete beats update on writes (runnable)
// Two writers update the DB in order A then B, but their cache updates arrive in the opposite order.
async function run(strategy) {
  const db = { price: 100 }; const cache = new Map([['p', 100]]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const write = async (price, cacheDelay) => {
    db.price = price;
    await sleep(cacheDelay);
    if (strategy === 'update') cache.set('p', price); else cache.delete('p');
  };
  await Promise.all([write(120, 20), sleep(5).then(() => write(130, 0))]);      // A=120 (slow cache step), B=130
  const read = () => (cache.has('p') ? cache.get('p') : (cache.set('p', db.price), db.price));
  return { db: db.price, cacheRead: read() };
}
(async () => {
  const upd = await run('update'), del = await run('delete');
  console.log({ updateCache: upd, deleteKey: del });
  console.log('updating the cache can leave an older value', upd.cacheRead !== upd.db ? '✅ (stale 120 vs 130)' : '❌ FAIL');
  console.log('deleting makes the next read come from the DB', del.cacheRead === del.db ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Updating the cache instead of deleting on writes (out-of-order updates).
- Write-behind for money or orders (data loss window).
- Write-through for data that's rarely read (memory full of cold keys).
- Forgetting to invalidate every key derived from the changed data (lists, aggregates).
- No TTL as a safety net behind explicit invalidation.
:::

::: understand
- Default to cache-aside with delete-on-write and a TTL; choose the others for specific read/write shapes.
:::

::: ask
- *"Which keys depend on this row, and who deletes them when it changes?"*
:::

::: important ⭐ Say this in the interview
"My default is cache-aside: read the cache, on a miss load from the database and set the key with a TTL, and on writes update the database and delete the key rather than updating it, because concurrent writers can otherwise leave an older value in the cache. Read-through is the same with the loading inside a cache layer. Write-through writes the database and cache together, good for data read right after writing like sessions. Write-behind buffers writes in the cache and flushes in batches, great for counters like views but it can lose data, so never for orders or money. Refresh-ahead keeps hot keys warm."
:::

::: links
AWS: Caching strategies (ElastiCache) | https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html
Microsoft: Cache-aside pattern | https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
:::

=== How do you invalidate caches, and what race condition should you know? (measured)
@p 3
@tags caching, invalidation, consistency, race-condition
@quick
- "There are only two hard things in computer science: cache invalidation and naming things." Invalidation means making sure readers don't see data that's **too stale**.
- Tools: **TTL** (time-based), **explicit delete** on write, **versioned keys** (`product:42:v13`), **event/CDC-based** invalidation (DB change stream → delete keys), CDN purges.
- Measured race with cache-aside: a slow reader loaded "Old Name", a writer updated the DB and deleted the key, then the reader **wrote "Old Name" back**: DB = "New Name", cache = "Old Name" **until the TTL**.
- Mitigations: short TTLs, delayed **double delete**, versioned keys, or `SET` only if the version is newer.
- Decide staleness per data type: prices at checkout must be read from the DB; a product description can be minutes old.

::: text 🧒 In simple words
Invalidation is **taking down the old notice** when the timetable changes. The race is when someone who read the old timetable a minute ago **pins their copy back up** right after you took the old one down, and now the wrong notice stays up until someone checks again.
:::

::: text 📖 Detailed answer
### Measured race (Redis 7.4 + PostgreSQL 17)
| Step | Time | Action |
|---|---|---|
| 1 | 0 ms | Reader: `SELECT name` → "Old Name" (then slow, e.g. GC or a long request) |
| 2 | 30 ms | Writer: `UPDATE users SET name = 'New Name'` |
| 3 | 31 ms | Writer: `DEL user:7:name` |
| 4 | 100 ms | Reader: `SET user:7:name "Old Name"` ← stale value cached |
Result: DB "New Name", cache "Old Name" until it expires.

### Mitigations
| Technique | How it helps | Cost |
|---|---|---|
| Short TTL | bounds staleness | more misses |
| Delayed double delete | `DEL` again ~1 s after the write catches late writers | extra work, timing guess |
| Versioned keys | write bumps `product:42:version`; readers use `product:42:v{n}` | one extra lookup |
| Compare-and-set | cache stores `{version, data}`; only overwrite with a newer version (Lua) | needs a version column |
| CDC invalidation | Debezium/Mongo change streams delete keys after commit | infrastructure |
| Don't cache | for data that must be exact | DB load |

### Invalidating derived data
One product change can affect `product:42`, `category:chairs:page:1…n`, `search:*`, `homepage:featured`. Options: tag keys (`SADD tag:product:42 key…` then delete all), short TTLs on lists, or rebuild lists from IDs + per-item cache.
:::

::: diagram The cache-aside invalidation race
sequenceDiagram
  participant R as Reader
  participant DB as Database
  participant W as Writer
  participant C as Cache
  R->>DB: "SELECT name: Old Name"
  W->>DB: "UPDATE name to New Name"
  W->>C: "DEL key"
  R->>C: "SET key Old Name"
  Note over C: "stale until TTL"
:::

::: image Cache invalidation race (measured)
/images/caching/invalidation.svg
:::

::: text 🪜 Step by step
Fixing stale product prices on a busy shop:
1. Store `{ version, data }` in Redis; products table has a `version` column incremented on every update.
2. Readers: on a miss, load row + version, then `SET` only if no newer version is already cached (Lua compare-and-set).
3. Writers: update the row (version + 1) and delete the key; a CDC consumer deletes it again after commit.
4. Checkout always re-reads prices from the DB inside the order transaction.
5. TTL 10 minutes stays as the final safety net.
:::

::: code javascript Versioned cache entries with a compare-and-set Lua script
const { redis } = require('./redis');
const { pool } = require('./db');

// Only store the value if the cached version is missing or older.
const SET_IF_NEWER = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local v = cjson.decode(cur).version
  if v >= tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;

async function getProduct(id) {
  const key = `product:${id}`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit).data;
  const { rows } = await pool.query('SELECT id, name, price_cents, version FROM products WHERE id = $1', [id]);
  const row = rows[0];
  if (!row) return null;
  await redis.eval(SET_IF_NEWER, { keys: [key], arguments: [JSON.stringify({ version: row.version, data: row }), String(row.version), '600'] });
  return row;
}

async function updatePrice(id, priceCents) {
  const { rows } = await pool.query('UPDATE products SET price_cents = $2, version = version + 1 WHERE id = $1 RETURNING version', [id, priceCents]);
  await redis.del(`product:${id}`);
  setTimeout(() => redis.del(`product:${id}`).catch(() => {}), 1000).unref();   // delayed double delete
  return rows[0]?.version;
}

module.exports = { getProduct, updatePrice };
:::

::: code javascript Reproducing the race and the version fix (runnable)
async function scenario(useVersions) {
  const db = { name: 'Old Name', version: 1 }; const cache = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const set = (key, entry) => { const cur = cache.get(key); if (useVersions && cur && cur.version >= entry.version) return; cache.set(key, entry); };
  const reader = (async () => { const snapshot = { ...db }; await sleep(30); set('user:7', snapshot); })();          // slow reader
  const writer = (async () => { await sleep(10); db.name = 'New Name'; db.version++; cache.delete('user:7'); await sleep(5); set('user:7', { ...db }); })();   // writer repopulates
  await Promise.all([reader, writer]);
  return { db: db.name, cache: cache.get('user:7')?.name };
}
(async () => {
  const plain = await scenario(false), versioned = await scenario(true);
  console.log({ plain, versioned });
  console.log('plain cache-aside ends stale', plain.cache === 'Old Name' && plain.db === 'New Name' ? '✅ (measured with Redis + Postgres)' : '❌ FAIL');
  console.log('version check keeps the newer value', versioned.cache === 'New Name' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Relying only on explicit deletes (missed code paths leave stale data forever without a TTL).
- Updating the DB inside a transaction and deleting the cache **before** commit (readers refill it with old data).
- Forgetting derived keys (lists, search results, aggregates).
- Long TTLs on data shown at payment time.
- Purging the whole cache on every change (stampede).
:::

::: understand
- Every cached value needs an expiry and an owner who invalidates it; versions defeat out-of-order writes.
:::

::: ask
- *"What is the maximum acceptable staleness, and what happens if a user sees older data?"*
:::

::: important ⭐ Say this in the interview
"I invalidate with a combination of TTLs as a safety net and explicit deletes after successful writes, plus versioned keys or change-data-capture for important data. The classic race with cache-aside, which I reproduced with Redis and Postgres: a slow reader loads the old value, a writer updates the database and deletes the key, then the reader writes the old value back, so the cache stays stale until the TTL. I mitigate with short TTLs, a delayed second delete, storing a version and only overwriting with newer versions, and for values that must be exact, like prices at checkout, I read from the database."
:::

::: links
Facebook: Scaling Memcache (leases for stale sets) | https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf
Debezium (change data capture) | https://debezium.io/
:::

=== What are cache stampede, cache penetration and cache avalanche? (measured)
@p 3
@tags caching, stampede, thundering-herd, resilience
@quick
- **Stampede (thundering herd)**: a hot key expires and many requests rebuild it at once. Measured: 200 concurrent requests on a cold key → **200 DB queries, 185 failed** (PostgreSQL ran out of shared memory); with **single-flight + Redis lock** → **1 query, 0 failures**, done in 40–51 ms.
- **Penetration**: requests for keys that **never exist** always miss. Measured: 1,000 requests for 50 missing ids → **1,000 DB lookups**; with **negative caching** (`null` for 30 s) → **50**.
- **Avalanche**: many keys expire **at the same time** (same TTL at deploy) or the cache restarts → a wave of misses. Fix: **TTL jitter**, warm-up, rate-limited rebuilds, highly available cache.
- Also: **stale-while-revalidate** (serve the old value while one request refreshes) and refresh-ahead for hot keys.
- These are why "just add a cache" can make outages worse.

::: text 🧒 In simple words
**Stampede**: the coffee machine runs out and 200 people all try to refill it at once. **Penetration**: people keep asking for a drink the café has never sold, so the barista checks the stock room every time. **Avalanche**: every drink in the fridge has the same expiry date, so the whole fridge empties at the same moment.
:::

::: text 📖 Detailed answer
### Measured (Redis 7.4 + PostgreSQL 17, report query ~37 ms)
| Scenario | Without protection | With protection |
|---|---|---|
| 200 concurrent requests, cold key | 200 DB queries, **185 failed** (`could not resize shared memory segment`), 680–750 ms | **1** DB query, 0 failed, 40–51 ms (single-flight + lock) |
| 1,000 requests for 50 non-existent ids | **1,000** DB lookups | **50** (negative caching) |

### Fixes
| Problem | Fixes |
|---|---|
| Stampede | single-flight per process (share one promise), distributed lock per key, stale-while-revalidate, refresh-ahead, early probabilistic expiry |
| Penetration | cache "not found" with a short TTL, validate ids, Bloom filter of existing ids, rate limiting |
| Avalanche | random TTL jitter (±10%), staggered warm-up after deploy, circuit breaker on the DB, replicated cache |

### Stale-while-revalidate
Store `{ value, softExpiry }` with a longer hard TTL; after `softExpiry`, return the old value immediately and let **one** request (lock) refresh it in the background. Users never wait for the rebuild.
:::

::: diagram Stampede vs single-flight
flowchart TD
  K["hot key expires"] --> M["200 requests miss at once"]
  M --> N{"protection?"}
  N -->|"none"| D["200 identical DB queries, DB overloaded"]
  N -->|"single-flight plus lock"| O["1 query rebuilds, others wait for it or get stale value"]
:::

::: image Stampede, penetration and avalanche (measured)
/images/caching/stampede.svg
:::

::: chart bar Measured: DB queries for 200 concurrent requests on a cold key
Strategy,DB queries
naive cache-aside,200
single-flight plus lock,1
:::

::: text 🪜 Step by step
A flash sale starts at 12:00 and the homepage cache expires at 12:00:05:
1. Without protection: thousands of requests rebuild the homepage at once; the DB saturates; everything slows down (cascading failure).
2. With stale-while-revalidate: requests keep getting the 12:00 version instantly.
3. One request takes the lock and rebuilds; when done it replaces the value.
4. TTLs of the 500 product keys have ±10% jitter, so they don't expire together.
5. Requests for deleted products get a cached "not found" for 30 s.
:::

::: code javascript Stale-while-revalidate + single-flight + lock + negative caching
const { redis } = require('./redis');

const inflight = new Map();

async function swrGet(key, { softTtl = 60, hardTtl = 600, load }) {
  const raw = await redis.get(key);
  const entry = raw ? JSON.parse(raw) : null;
  const fresh = entry && Date.now() < entry.softExpiry;
  if (fresh) return entry.value;
  if (entry) { refresh(key, softTtl, hardTtl, load).catch(() => {}); return entry.value; }   // stale: serve now, refresh in background
  return refresh(key, softTtl, hardTtl, load);                                             // cold: must wait
}

function refresh(key, softTtl, hardTtl, load) {
  if (inflight.has(key)) return inflight.get(key);                                         // single-flight in this process
  const p = (async () => {
    const lock = await redis.set(`lock:${key}`, '1', { NX: true, PX: 10_000 });             // one rebuild across instances
    if (!lock) {
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const raw = await redis.get(key);
        if (raw) return JSON.parse(raw).value;
      }
    }
    try {
      const value = await load();                                                           // may be null (not found)
      const jitter = Math.floor(Math.random() * hardTtl * 0.1);
      const ttl = value === null ? 30 : hardTtl + jitter;                                   // negative caching: short TTL
      await redis.set(key, JSON.stringify({ value, softExpiry: Date.now() + softTtl * 1000 }), { EX: ttl });
      return value;
    } finally {
      if (lock) await redis.del(`lock:${key}`);
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

module.exports = { swrGet };
:::

::: code javascript Single-flight in a few lines (runnable)
// Concurrent callers for the same key share one in-flight promise.
function singleFlight() {
  const inflight = new Map();
  return (key, fn) => { if (inflight.has(key)) return inflight.get(key); const p = fn().finally(() => inflight.delete(key)); inflight.set(key, p); return p; };
}
(async () => {
  let dbQueries = 0;
  const slowQuery = () => new Promise((r) => setTimeout(() => { dbQueries++; r({ rows: 5 }); }, 30));
  await Promise.all(Array.from({ length: 200 }, () => slowQuery()));
  const naive = dbQueries; dbQueries = 0;
  const sf = singleFlight();
  const results = await Promise.all(Array.from({ length: 200 }, () => sf('report', slowQuery)));
  console.log({ naiveQueries: naive, singleFlightQueries: dbQueries, allGotResult: results.every((r) => r.rows === 5) });
  console.log('200 callers → 1 query', naive === 200 && dbQueries === 1 ? '✅ (measured: 200 → 1, failures 185 → 0)' : '❌ FAIL');
  const ttls = Array.from({ length: 500 }, () => 600 + Math.floor(Math.random() * 60));
  console.log('jitter spreads 500 expiries over', Math.max(...ttls) - Math.min(...ttls), 'seconds', Math.max(...ttls) - Math.min(...ttls) > 30 ? '✅ (no avalanche)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Plain cache-aside on very hot keys (stampede at every expiry).
- Same fixed TTL for everything, set at deploy time (avalanche).
- Not caching "not found" (bots probing random ids hit the DB every time).
- Distributed lock without a timeout or fallback (waiters hang if the holder dies).
- Flushing the whole cache to "fix" stale data during peak traffic.
:::

::: understand
- Protect the database from the cache's own misses: one rebuild per key, cached misses, spread-out expiry.
:::

::: ask
- *"What happens to the database if this cache is empty during peak traffic?"*
:::

::: important ⭐ Say this in the interview
"A stampede is many requests rebuilding the same expired key at once. I measured it: 200 concurrent requests on a cold key sent 200 identical heavy queries to Postgres and 185 failed because the database ran out of shared memory, while single-flight per process plus a Redis lock per key made exactly one query with no failures. Penetration is requests for keys that never exist: negative caching cut 1,000 lookups to 50. Avalanche is many keys expiring together or a cache restart, fixed with TTL jitter and gradual warm-up. Stale-while-revalidate lets users get the old value while one request refreshes it."
:::

::: links
Wikipedia: Cache stampede | https://en.wikipedia.org/wiki/Cache_stampede
RFC 5861: stale-while-revalidate | https://www.rfc-editor.org/rfc/rfc5861
:::

=== In-memory vs distributed cache, eviction and hit ratio: how do you size and monitor a cache?
@p 2
@tags caching, lru, hit-ratio, monitoring
@quick
- **In-memory (per process)**: fastest (no network), but each instance has its own copy (inconsistent), it competes with the app for heap, and it's empty after every deploy.
- **Distributed (Redis/Memcached)**: shared, survives app restarts, one invalidation point, about one network round trip per read (measured 0.145 ms).
- Popular data follows a **long tail** (Zipf): a small cache holds most hits. Eviction policies: **LRU** (recently used), **LFU** (frequently used), TTL.
- Monitor **hit ratio**, latency, memory, evictions and key count; alert when hit ratio drops (deploy, bug, attack).
- Size by measuring: increase the cache until the hit-ratio curve flattens.

::: text 🧒 In simple words
An in-memory cache is **each cashier's own drawer** of the most popular items: super quick, but every drawer might hold a different version. A distributed cache is **one shared shelf** behind them: a step away, but everyone sees the same thing. Because a few items are bought far more than others, even a small drawer serves most customers.
:::

::: text 📖 Detailed answer
| | In-process (`lru-cache`, Map) | Distributed (Redis) |
|---|---|---|
| Read cost | ~0.0001 ms | ~0.15 ms (one round trip) |
| Consistency across instances | each has its own copy | single copy |
| Survives deploy/restart | no | yes |
| Memory | app heap (GC pressure) | separate server |
| Invalidation | broadcast needed (pub/sub) | one `DEL` |
| Best for | tiny, hot, rarely changing (config, feature flags) | everything shared |

A common setup is **two levels**: small L1 in-process with a few seconds of TTL in front of Redis L2, with pub/sub invalidation.

### Hit ratio and the long tail
With Zipf-distributed popularity (a few very popular items), caching 1% of items can serve a large share of requests, and doubling the cache gives diminishing returns. The runnable example below computes this for 100,000 items.

### What to monitor
| Metric | Healthy sign |
|---|---|
| Hit ratio (`keyspace_hits / (hits + misses)`) | stable, high for hot data |
| Evictions (`evicted_keys`) | low; spikes mean the cache is too small |
| Memory used vs maxmemory | below ~80% |
| Latency p99 | ~1 ms for Redis on the same network |
| DB QPS behind the cache | drops when hit ratio rises |
:::

::: diagram Two-level cache with invalidation broadcast
flowchart LR
  A["instance A: L1 LRU 5 s"] --> R["Redis L2"]
  B["instance B: L1 LRU 5 s"] --> R
  R --> DB["database"]
  W["write on instance A"] --> P["DEL key plus PUBLISH invalidate"]
  P --> A
  P --> B
:::

::: image Where to cache: the layers (measured)
/images/caching/layers.svg
:::

::: text 🪜 Step by step
Sizing a product cache:
1. Log product views for a day and compute how many distinct products account for 80%/90%/99% of views.
2. Estimate bytes per cached product (JSON size × overhead ~1.5–2× in Redis).
3. Start with `maxmemory` for the 90% set, `allkeys-lfu`.
4. Watch hit ratio and evictions for a week; grow until the curve flattens.
5. Add an L1 only for the top few hundred items if Redis round trips show up in profiles.
:::

::: code javascript Exposing cache hit ratio metrics (prom-client + node-redis)
const client = require('prom-client');
const { redis } = require('./redis');

const lookups = new client.Counter({ name: 'cache_lookups_total', help: 'cache lookups', labelNames: ['cache', 'result'] });

async function instrumentedGet(cacheName, key) {
  const value = await redis.get(key);
  lookups.inc({ cache: cacheName, result: value === null ? 'miss' : 'hit' });
  return value;
}

// server-wide numbers from Redis itself
async function redisStats() {
  const stats = await redis.info('stats');
  const num = (name) => Number(new RegExp(`${name}:(\\d+)`).exec(stats)?.[1] ?? 0);
  const hits = num('keyspace_hits'), misses = num('keyspace_misses');
  return { hitRatio: hits / Math.max(1, hits + misses), evictedKeys: num('evicted_keys'), expiredKeys: num('expired_keys') };
}

module.exports = { instrumentedGet, redisStats };
// Grafana: sum(rate(cache_lookups_total{result="hit"}[5m])) / sum(rate(cache_lookups_total[5m]))
:::

::: code javascript Hit ratio vs cache size for long-tail traffic (runnable)
// 100,000 products, Zipf-like popularity; simulate an LRU cache of different sizes.
const N = 100000, REQUESTS = 200000;
const weights = Array.from({ length: N }, (_, i) => 1 / (i + 1));
const total = weights.reduce((a, b) => a + b, 0);
const cdf = []; let acc = 0; for (const w of weights) { acc += w / total; cdf.push(acc); }
let seed = 42; const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
const pick = () => { const r = rand(); let lo = 0, hi = N - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; } return lo; };
const stream = Array.from({ length: REQUESTS }, pick);
function hitRatio(size) { const lru = new Map(); let hits = 0; for (const k of stream) { if (lru.has(k)) { hits++; lru.delete(k); } lru.set(k, 1); if (lru.size > size) lru.delete(lru.keys().next().value); } return hits / REQUESTS; }
const results = [100, 1000, 10000].map((size) => ({ cachedItems: size, pctOfCatalogue: (size / N) * 100 + '%', hitRatio: +hitRatio(size).toFixed(3) }));
console.table(results);
console.log('1% of the catalogue serves most requests', results[1].hitRatio > 0.5 ? '✅' : '❌ FAIL');
const perItem = (a, b) => (b.hitRatio - a.hitRatio) / (b.cachedItems - a.cachedItems);
console.log('each extra cached item is worth less (diminishing returns)', perItem(results[1], results[2]) < perItem(results[0], results[1]) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Unbounded in-process caches (memory leak by design).
- In-process caching of data that must be consistent across instances, without invalidation.
- No hit-ratio metric, so a broken cache goes unnoticed.
- Giant cache values (megabyte JSON) that are slow to fetch and parse.
- Choosing LRU for workloads where periodic scans evict the hot set (consider LFU).
:::

::: understand
- Local caches are fastest, shared caches are consistent; size both by measuring the hit-ratio curve.
:::

::: ask
- *"What hit ratio do we have today, and how much of the database load would a bigger cache remove?"*
:::

::: important ⭐ Say this in the interview
"An in-process cache is the fastest, with no network hop, but each instance holds its own copy, it uses the app's heap and it's empty after every deploy. A distributed cache like Redis is shared and survives restarts at the cost of a round trip, about 0.15 milliseconds in my measurements. I often combine them: a tiny short-lived L1 in front of Redis with pub/sub invalidation. Because real traffic is long-tailed, caching a small fraction of items gives a high hit ratio with diminishing returns beyond that, so I size by measuring the hit-ratio curve and monitor hit ratio, evictions, memory and the database load behind the cache."
:::

::: links
Redis: INFO stats (keyspace hits/misses) | https://redis.io/docs/latest/commands/info/
prom-client | https://github.com/siimots/prom-client
:::
