@section PostgreSQL
@icon 🐘
@color #3b82f6
@desc PostgreSQL features interviewers ask about: why Postgres, index types (GIN, partial, expression; measured), JSONB vs columns (measured), MVCC and VACUUM (measured bloat), row locks, SKIP LOCKED job queues and deadlocks (measured), and scaling with PgBouncer, replicas and partitioning. Measured on PostgreSQL 17.

=== Why PostgreSQL? What makes it different? (MVCC, types, extensions, UPSERT)
@p 2
@tags postgresql, database, mvcc, sql
@quick
- Open-source relational database with **MVCC** (readers never block writers), strict ACID and **transactional DDL** (schema changes can be rolled back).
- Rich types: `jsonb`, arrays, `uuid`, `timestamptz`, `numeric`, ranges, enums; one database can cover relational **and** document needs.
- Powerful SQL: CTEs, window functions, `INSERT … ON CONFLICT` (UPSERT), `RETURNING`, `LATERAL`, `FILTER`.
- **Extensions**: PostGIS (geo), `pg_trgm` (fuzzy search), `pgvector` (embeddings), `pg_stat_statements`, TimescaleDB.
- Versus MySQL: richer types/indexes/extensions; versus MongoDB: joins, constraints and transactions by default, with `jsonb` for flexible parts.

::: text 🧒 In simple words
PostgreSQL is a **Swiss Army knife database**: a solid relational blade (tables, joins, transactions) plus extra tools (JSON documents, geo, full-text search, vectors) that fold out when you need them, so many teams never need a second database.
:::

::: text 📖 Detailed answer
| Feature | What it gives you |
|---|---|
| MVCC | each transaction reads a snapshot; writers create new row versions |
| Transactional DDL | `BEGIN; ALTER TABLE …; ROLLBACK;` actually rolls back |
| `jsonb` + GIN | indexed document queries inside SQL |
| UPSERT | `INSERT … ON CONFLICT (key) DO UPDATE` atomically |
| `RETURNING` | get generated ids/values without a second query |
| Window functions | running totals, rank, "latest per group" |
| Extensions | add capabilities without another system |
| Replication | streaming replicas, logical replication, PITR backups |

### PostgreSQL vs MongoDB (interview framing)
| | PostgreSQL | MongoDB |
|---|---|---|
| Model | tables + relations (+ jsonb) | documents |
| Joins | native, optimised | `$lookup` (more limited) |
| Constraints | FK, unique, check | unique, schema validation |
| Transactions | always | multi-document since 4.0 |
| Scale-out | replicas, partitioning, Citus | built-in sharding |
| Best fit | relational, money, inventory, reporting | varied documents, single-aggregate access, very large write scale |
:::

::: diagram Where PostgreSQL fits in a Node.js stack
flowchart LR
  API["Node.js API"] --> PG["PostgreSQL: relational data and jsonb"]
  API --> R["Redis: cache and queues"]
  PG --> REP["read replica: reports"]
  PG --> BK["WAL archive: point-in-time recovery"]
:::

::: image Why PostgreSQL?
/images/postgresql/features.svg
:::

::: text 🪜 Step by step
Counting page views per article with UPSERT:
1. `INSERT INTO article_stats (article_id, views) VALUES ($1, 1)`.
2. `ON CONFLICT (article_id) DO UPDATE SET views = article_stats.views + 1`.
3. `RETURNING views` returns the new count in the same round trip.
4. Concurrent requests are safe: the unique index serialises the conflict handling.
5. No "select then insert or update" race in application code.
:::

::: code sql UPSERT, RETURNING, window functions and transactional DDL
CREATE TABLE article_stats (article_id bigint PRIMARY KEY, views bigint NOT NULL DEFAULT 0);

INSERT INTO article_stats (article_id, views) VALUES (42, 1)
ON CONFLICT (article_id) DO UPDATE SET views = article_stats.views + 1
RETURNING views;                                   -- 1, then 2, 3… on repeated calls

-- latest order per user with a window function
SELECT user_id, id, created_at
  FROM (SELECT user_id, id, created_at,
               row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
          FROM orders WHERE user_id IN (1, 2, 3)) t
 WHERE rn = 1;

-- conditional aggregates in one pass
SELECT count(*) FILTER (WHERE status = 'paid') AS paid,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
  FROM orders;

-- transactional DDL: the column is gone again after ROLLBACK
BEGIN;
ALTER TABLE article_stats ADD COLUMN likes bigint NOT NULL DEFAULT 0;
ROLLBACK;
:::

::: code javascript Why UPSERT beats select-then-write (runnable)
async function run(useUpsert) {
  const table = new Map(); let rows = 0;
  const sleep = () => new Promise((r) => setTimeout(r, Math.random() * 2));
  async function view(id) {
    if (useUpsert) { await sleep(); table.set(id, (table.get(id) ?? 0) + 1); return; }   // single atomic statement
    const current = table.get(id); await sleep();                                          // SELECT … then INSERT/UPDATE
    if (current === undefined) { rows++; table.set(id, 1); } else table.set(id, current + 1);
  }
  await Promise.all(Array.from({ length: 100 }, () => view(42)));
  return { views: table.get(42), insertsAttempted: rows };
}
(async () => {
  const racy = await run(false), upsert = await run(true);
  console.log({ racy, upsert });
  console.log('select-then-write loses counts and double-inserts', racy.views < 100 && racy.insertsAttempted > 1 ? '✅ (would hit duplicate-key errors)' : '⚠️ no overlap this run');
  console.log('UPSERT counts all 100 views', upsert.views === 100 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Using MongoDB or Postgres by habit instead of by data shape.
- Re-implementing UPSERT with select-then-insert in code.
- Ignoring `timestamptz` (storing local times without a zone).
- Running a second database for search/geo/vectors before trying the extension.
- Forgetting that `jsonb` without constraints is schema-less again (validate it).
:::

::: understand
- Relational by default, document-capable when needed, extended rather than replaced.
:::

::: ask
- *"Is this data relational with invariants, or independent documents read as a whole?"*
:::

::: important ⭐ Say this in the interview
"PostgreSQL is a relational database with MVCC, so readers never block writers, strict ACID and even transactional DDL. It has rich types like jsonb, arrays and timestamptz, many index types, advanced SQL such as window functions, UPSERT with ON CONFLICT and RETURNING, and extensions like PostGIS, pg_trgm and pgvector. I pick it for relational data where correctness matters, use jsonb for the flexible parts, and choose MongoDB when the data is naturally independent documents read as a whole or needs built-in sharding."
:::

::: links
PostgreSQL: About | https://www.postgresql.org/about/
PostgreSQL: INSERT … ON CONFLICT | https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
PostgreSQL: Window functions | https://www.postgresql.org/docs/current/tutorial-window.html
:::

=== PostgreSQL index types: B-tree, GIN, partial, expression, covering, BRIN (measured)
@p 3
@tags postgresql, indexes, gin, performance
@quick
- **B-tree** (default): equality, ranges, sorting, prefix `LIKE` (with `text_pattern_ops` under non-C collations).
- **GIN**: "contains" queries on `jsonb`, arrays and full-text: measured `payload @> '{"userId":4242,…}'` **18.2 ms → 0.074 ms**.
- **Partial** (`… WHERE refund_requested`): index only the rows you query: measured **40 kB vs 30 MB** for the full index, same speed (0.011 vs 0.015 ms).
- **Expression** (`lower(email)`): measured **18.2 ms → 0.008 ms**. **Covering** (`INCLUDE (…)`) enables index-only scans. **BRIN**: tiny indexes for huge, naturally ordered (time) tables.
- Build them with `CREATE INDEX CONCURRENTLY` in production.

::: text 🧒 In simple words
Different questions need different lookup tools: a **dictionary** (B-tree) for "words starting with...", a **back-of-book index** (GIN) for "which pages mention X", a **short list of only the urgent files** (partial index), and a **"pages per month" summary** (BRIN) for a giant diary.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, 1M orders, 500k jsonb events, best of 3)
| Index | Query | Without | With | Size |
|---|---|---|---|---|
| GIN `jsonb_path_ops` | `payload @> '{"userId": 4242, "type": "purchase"}'` | 18.2 ms | **0.074 ms** | 9.4 MB |
| Expression `((payload->>'userId')::int)` | `(payload->>'userId')::int = 4242` | 17.6 ms | **0.009 ms** | 4.6 MB |
| Partial `(created_at) WHERE refund_requested` | refund queue (0.1% of rows) | 2.85 ms | **0.011 ms** | **40 kB** |
| Full `(refund_requested, created_at)` | same | 2.85 ms | 0.015 ms | 30 MB |
| Expression `lower(email)` | case-insensitive login | 18.2 ms | **0.008 ms** | |

GIN didn't help `payload @> '{"type": "purchase"}'` (25% of rows, 18 ms either way): indexes pay off for **selective** conditions.

### Cheat sheet
| Type | Use for | Example |
|---|---|---|
| B-tree | `=`, `<`, `ORDER BY`, prefix search | `(user_id, created_at DESC)` |
| GIN | jsonb containment, arrays, full-text | `USING gin (payload jsonb_path_ops)` |
| GiST | geometry, ranges, nearest-neighbour | PostGIS, exclusion constraints |
| BRIN | append-only time series | `USING brin (created_at)` |
| Partial | small "hot" subset | `WHERE status = 'pending'` |
| Expression | function in WHERE | `(lower(email))` |
| Covering | index-only scans | `(user_id) INCLUDE (total_cents)` |
| Unique | constraints | `UNIQUE (tenant_id, email)` |
:::

::: diagram Picking an index type
flowchart TD
  Q["what does the query do?"] --> E{"equality, range or sort?"}
  E -->|"yes"| BT["B-tree, composite if several columns"]
  Q --> C{"contains on jsonb, array or text?"}
  C -->|"yes"| G["GIN"]
  Q --> S{"only a small subset of rows matters?"}
  S -->|"yes"| P["partial index"]
  Q --> F{"function applied to the column?"}
  F -->|"yes"| X["expression index"]
:::

::: image PostgreSQL index types
/images/postgresql/index-types.svg
:::

::: chart bar Measured: index size (MB) for the refund queue, partial vs full index
Index,Size (MB)
partial,0.04
full,30
:::

::: text 🪜 Step by step
A support dashboard lists "orders waiting for refund", 0.1% of 1M rows:
1. Without an index the planner walks the `created_at` index and filters: 2.85 ms and growing with the table.
2. A full index on `(refund_requested, created_at)` is fast but 30 MB, maintained on every order write.
3. `CREATE INDEX CONCURRENTLY … ON orders (created_at) WHERE refund_requested` is 40 kB, 0.011 ms.
4. Writes to normal orders don't touch it at all.
5. The query must repeat the predicate (`WHERE refund_requested`) for the planner to use it.
:::

::: code sql The measured indexes
-- GIN for jsonb containment (jsonb_path_ops: smaller, supports @>)
CREATE INDEX CONCURRENTLY events_payload_gin ON events USING gin (payload jsonb_path_ops);
SELECT id FROM events WHERE payload @> '{"userId": 4242, "type": "purchase"}';

-- expression index on one jsonb field used for equality
CREATE INDEX CONCURRENTLY events_user_idx ON events (((payload ->> 'userId')::int));
SELECT * FROM events WHERE (payload ->> 'userId')::int = 4242;

-- partial index: only the rare rows a worker or dashboard polls
CREATE INDEX CONCURRENTLY orders_refund_partial ON orders (created_at) WHERE refund_requested;
SELECT id FROM orders WHERE refund_requested ORDER BY created_at LIMIT 50;

-- covering index: index-only scan for a per-user total
CREATE INDEX CONCURRENTLY orders_user_total_idx ON orders (user_id) INCLUDE (total_cents);
SELECT sum(total_cents) FROM orders WHERE user_id = 4242;

-- BRIN: very small index for a huge, time-ordered table
CREATE INDEX CONCURRENTLY events_created_brin ON events USING brin (id);
:::

::: code javascript Inverted index: how GIN answers "contains" (runnable)
// GIN maps each key/value to the list of rows containing it; @> intersects those lists.
const events = Array.from({ length: 50000 }, (_, i) => ({ id: i + 1, payload: { type: ['click', 'view', 'purchase', 'signup'][i % 4], userId: i % 5000 } }));
const gin = new Map();
for (const e of events) for (const [k, v] of Object.entries(e.payload)) { const key = `${k}=${v}`; if (!gin.has(key)) gin.set(key, []); gin.get(key).push(e.id); }
function containsScan(filter) { return events.filter((e) => Object.entries(filter).every(([k, v]) => e.payload[k] === v)).map((e) => e.id); }
function containsGin(filter) { const lists = Object.entries(filter).map(([k, v]) => gin.get(`${k}=${v}`) ?? []).sort((a, b) => a.length - b.length); const rest = lists.slice(1).map((l) => new Set(l)); return lists[0].filter((id) => rest.every((s) => s.has(id))); }
const f = { userId: 4242, type: 'purchase' };
const a = containsScan(f), b = containsGin(f);
console.log({ matches: b.length, rowsScanned: events.length, postingListSizes: Object.entries(f).map(([k, v]) => gin.get(`${k}=${v}`).length) });
console.log('GIN gives the same rows', a.join() === b.join() ? '✅' : '❌ FAIL');
console.log('selective key → tiny posting list to check', gin.get('userId=4242').length === 10 ? '✅ (measured 18.2 ms → 0.074 ms)' : '❌ FAIL');
console.log('unselective key → huge list, no win', gin.get('type=purchase').length === 12500 ? '✅ (measured 18 ms either way)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- GIN on everything "because jsonb" (big, slow to update; use it for real containment queries).
- Partial indexes whose predicate the query doesn't repeat exactly.
- Expression index with a different expression than the query (`lower(email)` vs `LOWER(TRIM(email))`).
- `CREATE INDEX` without `CONCURRENTLY` on busy tables.
- Expecting any index to help a condition that matches a quarter of the table.
:::

::: understand
- Match the index type to the operator, and index only rows and expressions you actually query.
:::

::: ask
- *"How selective is this condition, and which operator does the query use?"*
:::

::: important ⭐ Say this in the interview
"B-tree is the default for equality, ranges and sorting. GIN is an inverted index for containment on jsonb, arrays and full-text: a selective jsonb containment query went from 18 milliseconds to 0.07 with GIN, but for a condition matching a quarter of rows it made no difference. Partial indexes cover only the rows you query: my refund-queue index was 40 kilobytes instead of 30 megabytes at the same speed. Expression indexes serve functions like lower(email), covering indexes enable index-only scans and BRIN is tiny for time-ordered tables. In production I always build them CONCURRENTLY."
:::

::: links
PostgreSQL: Index types | https://www.postgresql.org/docs/current/indexes-types.html
PostgreSQL: Partial indexes | https://www.postgresql.org/docs/current/indexes-partial.html
PostgreSQL: GIN indexes for jsonb | https://www.postgresql.org/docs/current/datatype-json.html#JSON-INDEXING
:::

=== JSONB vs normal columns: when should you store JSON in PostgreSQL? (measured)
@p 2
@tags postgresql, jsonb, schema-design
@quick
- Use **columns** for fields you filter, join, sort, constrain or aggregate; use **jsonb** for flexible, sparse or third-party data (settings, webhook payloads, attributes that vary per product).
- `jsonb` is binary (parsed, indexable, duplicate keys removed); `json` keeps raw text (rarely what you want).
- Query operators: `->` (json), `->>` (text), `@>` containment, `?` key exists, `jsonb_path_query`.
- Indexing: GIN for `@>` (measured **18.2 → 0.074 ms**), expression index for one field (**17.6 → 0.009 ms**).
- Costs: no FK/type constraints inside JSON (add `CHECK` or validate in the app), updates rewrite the whole value, statistics are weaker → planner estimates worse.

::: text 🧒 In simple words
Columns are **labelled drawers** in a filing cabinet: easy to sort and check. JSONB is a **folder with loose papers**: perfect for odd documents that differ every time, but you shouldn't put the papers you search every day in there.
:::

::: text 📖 Detailed answer
### Decision table
| Data | Columns | jsonb |
|---|---|---|
| `email`, `status`, `created_at`, `user_id` | ✅ (constraints, indexes, joins) | |
| Product attributes that differ per category | | ✅ |
| User preferences / feature flags | | ✅ |
| Raw webhook payloads (audit) | | ✅ |
| Money, quantities, foreign keys | ✅ | ❌ |
| A field promoted to "we filter on this daily" | move to a column (or generated column) | |

### Measured (PostgreSQL 17, 500k events with jsonb payloads)
| Query | No index | Index | Index size |
|---|---|---|---|
| `payload @> '{"userId":4242,"type":"purchase"}'` | 18.2 ms | 0.074 ms (GIN) | 9.4 MB |
| `(payload->>'userId')::int = 4242` | 17.6 ms | 0.009 ms (expression) | 4.6 MB |
| table size | 70 MB | | |

### Hybrid pattern
Keep core fields as columns and the variable rest in `attributes jsonb`; promote a jsonb field to a **generated column** when it becomes important:
`ALTER TABLE products ADD COLUMN brand text GENERATED ALWAYS AS (attributes->>'brand') STORED;`
:::

::: diagram Hybrid row design
flowchart LR
  P["products row"] --> C["columns: id, sku, price_cents, category_id"]
  P --> J["attributes jsonb: color, size, voltage"]
  J --> G["generated column brand, indexed"]
  J --> GIN["GIN index for contains queries"]
:::

::: image PostgreSQL index types
/images/postgresql/index-types.svg
:::

::: chart bar Measured: ms to find one user's events in 500k jsonb rows
Approach,ms
no index,18.245
GIN @>,0.074
expression index,0.009
:::

::: text 🪜 Step by step
An e-commerce catalogue with different attributes per category:
1. `products(id, sku, name, price_cents, category_id, attributes jsonb)`.
2. Validate `attributes` per category in the API (Zod schema per category) or with a `CHECK (jsonb_typeof(attributes) = 'object')`.
3. Filters like "colour = red" → `attributes @> '{"color":"red"}'` with a GIN index.
4. "brand" becomes a top filter → generated column + B-tree index.
5. Prices, stock and relations stay real columns with constraints.
:::

::: code sql JSONB queries, indexes and a generated column
CREATE TABLE products_catalog (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku         text NOT NULL UNIQUE,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  attributes  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object')
);
INSERT INTO products_catalog (sku, price_cents, attributes) VALUES
  ('TSHIRT-1', 1999, '{"color": "red", "size": "M", "brand": "Acme"}'),
  ('LAMP-1',   4999, '{"color": "black", "voltage": 230, "brand": "Lumo"}');

CREATE INDEX products_attr_gin ON products_catalog USING gin (attributes jsonb_path_ops);

SELECT sku FROM products_catalog WHERE attributes @> '{"color": "red"}';          -- containment (GIN)
SELECT sku, attributes ->> 'size' AS size FROM products_catalog WHERE attributes ? 'size';
UPDATE products_catalog SET attributes = attributes || '{"onSale": true}' WHERE sku = 'LAMP-1';   -- merge keys

-- promote a hot field
ALTER TABLE products_catalog ADD COLUMN brand text GENERATED ALWAYS AS (attributes ->> 'brand') STORED;
CREATE INDEX products_brand_idx ON products_catalog (brand);
SELECT sku FROM products_catalog WHERE brand = 'Acme';
:::

::: code javascript Choosing columns vs jsonb (runnable)
// Rule of thumb from the decision table, applied to candidate fields.
const decide = (f) => (f.foreignKey || f.money || f.filteredDaily || f.unique || f.sortedBy ? 'column' : f.variesPerRow || f.thirdParty || f.sparse ? 'jsonb' : 'column');
const fields = [
  { name: 'user_id', foreignKey: true }, { name: 'price_cents', money: true }, { name: 'email', unique: true },
  { name: 'color/size/voltage', variesPerRow: true }, { name: 'webhook payload', thirdParty: true }, { name: 'ui preferences', sparse: true },
  { name: 'brand', variesPerRow: true, filteredDaily: true },
];
const result = Object.fromEntries(fields.map((f) => [f.name, decide(f)]));
console.log(result);
console.log('relational and money fields are columns', ['user_id', 'price_cents', 'email'].every((n) => result[n] === 'column') ? '✅' : '❌ FAIL');
console.log('variable attributes go to jsonb', result['color/size/voltage'] === 'jsonb' && result['webhook payload'] === 'jsonb' ? '✅' : '❌ FAIL');
console.log('a jsonb field filtered daily gets promoted', result.brand === 'column' ? '✅ (generated column)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Putting everything in one `data jsonb` column ("MongoDB inside Postgres") and losing constraints.
- Foreign keys or money inside JSON.
- `json` instead of `jsonb`.
- Filtering on jsonb fields without an index.
- Frequent small updates to large jsonb documents (whole value rewritten, bloat).
:::

::: understand
- Columns for facts you query and protect; jsonb for the flexible remainder.
:::

::: ask
- *"Will we filter, join, sort or constrain on this field?"* Then it's a column.
:::

::: important ⭐ Say this in the interview
"I store fields I filter, join, sort, constrain or aggregate as real columns, and use jsonb for flexible or sparse data like product attributes, preferences or raw webhook payloads. jsonb is stored parsed and supports containment and key operators; I index it with GIN for containment, which took a selective query from 18 milliseconds to 0.07, or with an expression index on a single field, which got it to 0.009. JSON fields lose foreign keys and types, so I validate them, and when a JSON field becomes important I promote it to a generated column with a normal index."
:::

::: links
PostgreSQL: JSON types | https://www.postgresql.org/docs/current/datatype-json.html
PostgreSQL: Generated columns | https://www.postgresql.org/docs/current/ddl-generated-columns.html
:::

=== How does MVCC work, and why does PostgreSQL need VACUUM? (measured bloat)
@p 2
@tags postgresql, mvcc, vacuum, performance
@quick
- **MVCC**: an `UPDATE` writes a **new row version** and marks the old one dead; each transaction reads the versions visible in its snapshot, so readers and writers don't block each other.
- Dead versions stay on disk until **VACUUM** marks the space reusable; **autovacuum** does this automatically.
- Measured: 10,000 rows, 20 full-table updates (autovacuum off) → table **360 KB → 7,376 KB** with **198,522 dead rows**.
- `VACUUM` cleared dead rows (0) but kept the file size (space reused: 10 more updates didn't grow it); `VACUUM FULL` rewrote it to **360 KB** (with an exclusive lock).
- Long-running transactions block cleanup → bloat; tune autovacuum for hot tables, avoid idle-in-transaction sessions.

::: text 🧒 In simple words
Postgres never erases with a rubber; it **crosses out the old line and writes the new one below**, so anyone reading an older copy can still read it. VACUUM is the cleaner who marks crossed-out lines as free space for new writing. VACUUM FULL is **recopying the whole notebook** neatly: smaller, but nobody can use the notebook while it's being copied.
:::

::: text 📖 Detailed answer
### How a row version works
Each row version stores `xmin` (transaction that created it) and `xmax` (transaction that deleted/replaced it). A snapshot sees a version if `xmin` committed before the snapshot and `xmax` didn't.

### Measured (PostgreSQL 17, autovacuum disabled on the table)
| Step | Table size | Dead rows |
|---|---|---|
| Insert 10,000 rows | 360 KB | 0 |
| 20 × `UPDATE counters SET n = n + 1` | **7,376 KB** | **198,522** |
| `VACUUM` | 7,376 KB | 0 (space reusable) |
| 10 more full updates | 7,376 KB (no growth) | |
| `VACUUM FULL` | **360 KB** | 0 |

### Why it matters
- Bloat makes scans read more pages and indexes grow.
- Transaction ID wraparound protection requires vacuuming (autovacuum handles it; never disable it globally).
- A transaction left open for hours prevents VACUUM from removing any version newer than it.

### Operational knobs
- `autovacuum_vacuum_scale_factor` lower (e.g. 0.05) on large hot tables.
- `idle_in_transaction_session_timeout` to kill forgotten transactions.
- HOT updates (when no indexed column changes) avoid index bloat: don't over-index frequently updated columns.
- `pg_stat_user_tables.n_dead_tup`, `last_autovacuum` for monitoring; `pg_repack` to shrink without long locks.
:::

::: diagram One UPDATE under MVCC
flowchart LR
  V1["version 1: n = 0, visible to old snapshots"] -->|"UPDATE"| V2["version 2: n = 1, visible to new snapshots"]
  V1 --> D["dead once no snapshot needs it"]
  D -->|"VACUUM"| F["space reusable"]
:::

::: image MVCC, dead rows and VACUUM (measured)
/images/postgresql/mvcc-vacuum.svg
:::

::: chart bar Measured: table size (KB) under repeated updates
Step,KB
initial,360
after 20 updates,7376
after VACUUM,7376
after VACUUM FULL,360
:::

::: text 🪜 Step by step
A counters table keeps getting slower:
1. `SELECT n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables` shows millions of dead rows.
2. Check `pg_stat_activity` for long `idle in transaction` sessions: one forgotten transaction blocks cleanup.
3. Kill it and set `idle_in_transaction_session_timeout`.
4. Lower autovacuum thresholds for that table.
5. Optionally rewrite once with `pg_repack` (online) instead of `VACUUM FULL` (locks).
:::

::: code sql Observing MVCC and bloat
CREATE TABLE counters (id int PRIMARY KEY, n int) WITH (autovacuum_enabled = false);
INSERT INTO counters SELECT g, 0 FROM generate_series(1, 10000) g;
SELECT pg_size_pretty(pg_relation_size('counters'));          -- 360 kB

UPDATE counters SET n = n + 1;                                 -- repeated 20 times
SELECT pg_stat_force_next_flush();
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'counters';   -- 10000 | 198522
SELECT pg_size_pretty(pg_relation_size('counters'));          -- 7376 kB

VACUUM counters;                                               -- dead rows → reusable space, file stays 7376 kB
VACUUM FULL counters;                                          -- rewrites the table (ACCESS EXCLUSIVE lock) → 360 kB

-- each row version carries the creating transaction id
SELECT xmin, id, n FROM counters WHERE id = 1;

-- per-table autovacuum tuning for a hot table
ALTER TABLE counters SET (autovacuum_enabled = true, autovacuum_vacuum_scale_factor = 0.02);
:::

::: code javascript Snapshot visibility in miniature (runnable)
// Each version records which transaction created (xmin) and replaced (xmax) it.
let txid = 100; const versions = [{ n: 0, xmin: 100, xmax: null }];
function update(newValue) { const t = ++txid; const live = versions.find((v) => v.xmax === null); live.xmax = t; versions.push({ n: newValue, xmin: t, xmax: null }); return t; }
const visible = (snapshotTx) => versions.find((v) => v.xmin <= snapshotTx && (v.xmax === null || v.xmax > snapshotTx));
const oldReader = txid;                       // a long-running report started here
for (let i = 1; i <= 20; i++) update(i);
console.log('old snapshot sees', visible(oldReader).n, '| new snapshot sees', visible(txid).n, '| versions stored', versions.length);
console.log('readers keep their snapshot while writers continue', visible(oldReader).n === 0 && visible(txid).n === 20 ? '✅' : '❌ FAIL');
const vacuum = (oldestActive) => versions.filter((v) => !(v.xmax !== null && v.xmax <= oldestActive)).length;
console.log('VACUUM while the old reader is open keeps', vacuum(oldReader), 'versions; after it ends keeps', vacuum(txid));
console.log('long transactions block cleanup', vacuum(oldReader) === 21 && vacuum(txid) === 1 ? '✅ (measured 198,522 dead rows)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Disabling autovacuum "for performance".
- Leaving transactions open (ORM sessions, `BEGIN` in a REPL) for hours.
- Running `VACUUM FULL` on a busy production table (exclusive lock).
- Updating a frequently changing counter column that's also indexed (no HOT updates).
- Monitoring disk size without looking at dead tuples.
:::

::: understand
- Updates create versions; VACUUM recycles them; long transactions keep them alive.
:::

::: ask
- *"Are there long-running or idle-in-transaction sessions?"* (`pg_stat_activity`)
:::

::: important ⭐ Say this in the interview
"With MVCC an update writes a new row version and marks the old one dead, and each transaction reads the versions visible in its snapshot, so readers and writers don't block each other. Dead versions stay until VACUUM recycles them. I measured it with autovacuum off: twenty full-table updates on ten thousand rows grew the table from 360 kilobytes to 7.4 megabytes with about 200 thousand dead rows. VACUUM cleared them and made the space reusable without shrinking the file, while VACUUM FULL shrank it back to 360 kilobytes under an exclusive lock. So I keep autovacuum tuned for hot tables and kill idle-in-transaction sessions, because long transactions block cleanup."
:::

::: links
PostgreSQL: Concurrency control (MVCC) | https://www.postgresql.org/docs/current/mvcc-intro.html
PostgreSQL: Routine vacuuming | https://www.postgresql.org/docs/current/routine-vacuuming.html
:::

=== Row locks, SELECT FOR UPDATE SKIP LOCKED and deadlocks in PostgreSQL (measured)
@p 3
@tags postgresql, locking, concurrency, job-queue, deadlock
@quick
- `SELECT … FOR UPDATE` locks the selected rows until the transaction ends; other writers to those rows wait.
- `FOR UPDATE SKIP LOCKED` lets each worker grab **different** rows without waiting: a simple, reliable **job queue** in Postgres.
- Measured, 8 workers × 2,000 jobs of 2 ms: `FOR UPDATE` **312 jobs/s** (workers waited; two did 0 jobs) vs `SKIP LOCKED` **2,205 jobs/s** with ~250 jobs each.
- **Deadlock**: A locks row 1 then wants 2, B locks 2 then wants 1. Measured: after `deadlock_timeout` (**1 s**) Postgres aborted one with **40P01**, the other succeeded.
- Prevent deadlocks by locking in a **consistent order**, keeping transactions short, and retrying 40P01.

::: text 🧒 In simple words
`FOR UPDATE` is **putting your hand on a ticket** on the board so nobody else takes it. Without SKIP LOCKED, every other worker stands behind you waiting for the same ticket; with SKIP LOCKED they simply **take the next free ticket**. A deadlock is two people each holding one door handle and waiting for the other's: the building manager (Postgres) makes one of them let go.
:::

::: text 📖 Detailed answer
### Lock strengths (row level)
| Clause | Blocks |
|---|---|
| `FOR UPDATE` | other `FOR UPDATE`, updates, deletes of those rows |
| `FOR NO KEY UPDATE` | same, but allows FK checks (what `UPDATE` takes by default) |
| `FOR SHARE` | writers, but not other readers with `FOR SHARE` |
| `NOWAIT` | error immediately instead of waiting |
| `SKIP LOCKED` | silently skip locked rows |

### Measured job queue (8 workers, 2,000 jobs × 2 ms work, PostgreSQL 17)
| Claim query | Throughput | Jobs per worker |
|---|---|---|
| `… ORDER BY id LIMIT 1 FOR UPDATE` | **312 jobs/s** | 440, 302, 0, 237, 390, 227, 0, 404 |
| `… FOR UPDATE SKIP LOCKED` | **2,205 jobs/s** | ~250 each |

### Measured deadlock
A: `UPDATE SKU-3`, B: `UPDATE SKU-4`, then A updates SKU-4 and B updates SKU-3 → after 1,006 ms one fails with `40P01 deadlock detected`, the other completes.

### Postgres as a queue: when it's enough
Good for moderate volumes (thousands of jobs/s) when jobs must be transactional with your data (enqueue in the same transaction as the business write = no lost jobs). Libraries: graphile-worker, pg-boss. Beyond that, or for fan-out/streaming, use a broker (RabbitMQ, SQS, Kafka) or Redis (BullMQ).
:::

::: diagram Two workers with SKIP LOCKED
sequenceDiagram
  participant W1 as Worker 1
  participant DB as jobs table
  participant W2 as Worker 2
  W1->>DB: "SELECT … FOR UPDATE SKIP LOCKED: gets job 1"
  W2->>DB: "SELECT … FOR UPDATE SKIP LOCKED: job 1 locked, gets job 2"
  W1->>DB: "UPDATE job 1 done, COMMIT"
  W2->>DB: "UPDATE job 2 done, COMMIT"
:::

::: image Row locks, SKIP LOCKED queues and deadlocks (measured)
/images/postgresql/locking.svg
:::

::: chart bar Measured: jobs per second with 8 workers
Claim query,jobs/s
FOR UPDATE,312
FOR UPDATE SKIP LOCKED,2205
:::

::: text 🪜 Step by step
Sending emails reliably from Postgres:
1. In the signup transaction: `INSERT INTO users …` and `INSERT INTO jobs (type, payload) VALUES ('welcome_email', …)`; `COMMIT` (both or neither).
2. Workers loop: `BEGIN; SELECT … FOR UPDATE SKIP LOCKED LIMIT 10`.
3. Send each email, mark jobs `done` (or increment `attempts` and set `run_at` for retry).
4. `COMMIT` releases the locks; a crashed worker's locks are released automatically and the jobs become visible again.
5. Keep jobs idempotent: a crash after sending but before `COMMIT` means the job runs again.
:::

::: code javascript A Postgres job worker with SKIP LOCKED (pg)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

async function claimAndRun(handlers, batch = 10) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: jobs } = await client.query(
      `SELECT id, type, payload, attempts FROM jobs
        WHERE status = 'queued' AND run_at <= now()
        ORDER BY run_at, id
        LIMIT $1
        FOR UPDATE SKIP LOCKED`, [batch]);
    for (const job of jobs) {
      try {
        await handlers[job.type](job.payload);
        await client.query("UPDATE jobs SET status = 'done', done_at = now() WHERE id = $1", [job.id]);
      } catch (err) {
        const dead = job.attempts + 1 >= 5;
        await client.query(
          `UPDATE jobs SET attempts = attempts + 1, last_error = $2,
                  status = CASE WHEN $3 THEN 'dead' ELSE 'queued' END,
                  run_at = now() + make_interval(secs => power(2, attempts + 1))
            WHERE id = $1`, [job.id, String(err.message).slice(0, 500), dead]);
      }
    }
    await client.query('COMMIT');
    return jobs.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function workLoop(handlers, signal) {
  while (!signal.aborted) {
    const n = await claimAndRun(handlers);
    if (n === 0) await new Promise((r) => setTimeout(r, 500));                  // idle: poll gently (or LISTEN/NOTIFY)
  }
}

module.exports = { claimAndRun, workLoop };
:::

::: code javascript Lock ordering prevents deadlocks (runnable)
// Two transfers locking two accounts: random order can deadlock, sorted order cannot.
function wouldDeadlock(txA, txB) {
  // each tx locks its first row, then requests its second; deadlock if each waits for the other's first row
  return txA[0] !== txB[0] && txA[1] === txB[0] && txB[1] === txA[0];
}
const transferAtoB = ['acct1', 'acct2'], transferBtoA = ['acct2', 'acct1'];
console.log('natural order (from, to):', wouldDeadlock(transferAtoB, transferBtoA) ? 'DEADLOCK (measured: 40P01 after 1 s)' : 'ok');
const sorted = (rows) => [...rows].sort();
console.log('sorted lock order:', wouldDeadlock(sorted(transferAtoB), sorted(transferBtoA)) ? 'DEADLOCK' : 'no deadlock, one waits briefly');
console.log('consistent ordering removes the cycle', wouldDeadlock(transferAtoB, transferBtoA) && !wouldDeadlock(sorted(transferAtoB), sorted(transferBtoA)) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Polling a jobs table with plain `FOR UPDATE` (workers serialise behind each other: 7× slower measured).
- Doing slow work while holding row locks for a long time without batching limits.
- Locking rows in request-dependent order (from/to accounts) → deadlocks.
- No retry for `40P01`/`40001`.
- Building a high-volume event stream on a Postgres table instead of a broker.
:::

::: understand
- Lock what you'll change, in a fixed order, briefly; skip what others already hold.
:::

::: ask
- *"Must the job be enqueued atomically with the business write?"* Then a Postgres queue (or outbox) is a great fit.
:::

::: important ⭐ Say this in the interview
"SELECT FOR UPDATE locks rows until the transaction ends, and adding SKIP LOCKED lets several workers each take different rows without waiting, which makes a solid job queue inside Postgres. I measured eight workers processing two thousand jobs: plain FOR UPDATE managed 312 jobs a second with two workers doing nothing, SKIP LOCKED reached 2,205 with about 250 jobs each. For deadlocks, I reproduced two transactions locking rows in opposite order: after the one-second deadlock timeout Postgres aborted one with 40P01. I prevent that by locking rows in a consistent order, keeping transactions short and retrying."
:::

::: links
PostgreSQL: SELECT locking clause | https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
PostgreSQL: Deadlocks | https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS
pg-boss (Postgres job queue for Node) | https://github.com/timgit/pg-boss
:::

=== How do you scale PostgreSQL? (PgBouncer, read replicas, partitioning, sharding)
@p 2
@tags postgresql, scaling, pgbouncer, replication, partitioning
@quick
- First: **indexes, query fixes and a bigger machine**; most apps never need more.
- **Connections**: each Postgres connection is a process (default `max_connections` 100); many Node instances → **PgBouncer** (transaction pooling) or RDS Proxy.
- **Read replicas** scale reads (reports, search pages) but have **replication lag**: read-your-own-writes from the primary.
- **Partitioning** splits a big table by time/tenant: smaller indexes, faster pruning, and dropping old data is instant (`DROP` a partition).
- **Sharding** (Citus, application-level) only when one primary can't handle the writes; it complicates joins, transactions and operations.

::: text 🧒 In simple words
Scaling a database is like a busy restaurant: first cook smarter (indexes), then buy a bigger stove (vertical scaling), add a **host at the door** so the kitchen isn't swamped (PgBouncer), open a **takeaway counter** for simple orders (read replicas), split the menu into **sections** (partitioning), and only open a **second restaurant** (sharding) when one kitchen truly can't keep up.
:::

::: text 📖 Detailed answer
### The ladder
| Step | Solves | Cost |
|---|---|---|
| Indexes, query rewrites, caching | most "slow DB" issues | low |
| Vertical scaling (CPU/RAM/IOPS) | general load | money |
| PgBouncer / RDS Proxy | too many connections | session features limited in transaction mode |
| Read replicas | read-heavy load, reports | replication lag, routing logic |
| Partitioning | huge tables, retention | partition key in queries, more DDL |
| Sharding (Citus, per-tenant DBs) | write throughput beyond one node | cross-shard queries, ops complexity |

### Replication lag in practice
After `UPDATE profile`, the user reloads and a replica still returns the old value. Fixes: read from the primary for N seconds after a write by that user, route "my data" to the primary, or check replica LSN.

### Partitioning example
`events` partitioned by month: queries with `WHERE created_at >= …` touch only recent partitions; retention is `DROP TABLE events_2025_01` (instant, no bloat) instead of `DELETE` millions of rows.

### Measured facts from this course to connect
- 4 → 30 pods × pool 10 = 300 connections > 100 allowed → PgBouncer.
- CPU-bound queries stopped scaling past the core count (pool sizing question).
:::

::: diagram Scaled PostgreSQL setup
flowchart LR
  N["Node instances"] --> B["PgBouncer"]
  B --> P["primary: writes and fresh reads"]
  P -->|"streaming replication"| R1["replica 1: reports"]
  P -->|"streaming replication"| R2["replica 2: search pages"]
  P --> PT["partitioned tables by month"]
:::

::: image Scaling PostgreSQL
/images/postgresql/scaling.svg
:::

::: text 🪜 Step by step
An analytics endpoint slows down the main app:
1. `pg_stat_statements` shows the dashboard query uses 40% of DB time.
2. Add the missing composite index; still heavy because it scans months of data.
3. Move it to a read replica (lag of a few seconds is fine for analytics).
4. Partition `events` by month so it scans only the selected range.
5. Precompute daily aggregates (materialised view refreshed every 5 minutes) for the dashboard tiles.
:::

::: code sql Declarative partitioning by month
CREATE TABLE events_p (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id   bigint NOT NULL,
  type        text NOT NULL,
  created_at  timestamptz NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, created_at)                       -- the partition key must be part of the primary key
) PARTITION BY RANGE (created_at);

CREATE TABLE events_p_2026_09 PARTITION OF events_p FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE events_p_2026_10 PARTITION OF events_p FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE INDEX ON events_p (tenant_id, created_at);     -- created on every partition

-- partition pruning: only events_p_2026_10 is scanned
EXPLAIN SELECT count(*) FROM events_p WHERE created_at >= '2026-10-01' AND tenant_id = 7;

-- retention: instant, no DELETE, no bloat
DROP TABLE events_p_2026_09;
:::

::: code javascript Routing reads with read-your-writes (runnable)
// After a user writes, send their reads to the primary for a short window to avoid replica lag surprises.
function createRouter({ lagMs, stickyMs }) {
  const lastWrite = new Map(); const primary = new Map(); const replica = new Map(); let now = 0;
  return {
    tick: (ms) => { now += ms; if (now >= lagMs) for (const [k, v] of primary) replica.set(k, v); },
    write(user, key, value) { primary.set(key, value); lastWrite.set(user, now); },
    read(user, key) { const recent = now - (lastWrite.get(user) ?? -Infinity) < stickyMs; return { from: recent ? 'primary' : 'replica', value: (recent ? primary : replica).get(key) }; },
  };
}
const naive = createRouter({ lagMs: 2000, stickyMs: 0 });
naive.write('asha', 'profile:asha', 'new bio'); naive.tick(100);
const sticky = createRouter({ lagMs: 2000, stickyMs: 5000 });
sticky.write('asha', 'profile:asha', 'new bio'); sticky.tick(100);
console.log({ naive: naive.read('asha', 'profile:asha'), sticky: sticky.read('asha', 'profile:asha') });
console.log('replica read right after a write sees stale data', naive.read('asha', 'profile:asha').value === undefined ? '✅ (replication lag)' : '❌ FAIL');
console.log('sticky-to-primary shows the user their own write', sticky.read('asha', 'profile:asha').value === 'new bio' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Sharding before fixing indexes and queries.
- Reading from replicas right after writes (users "lose" their changes).
- Too many direct connections from autoscaled pods or serverless functions.
- Partitioning without the partition key in common queries (no pruning).
- Deleting old rows in bulk instead of dropping partitions.
:::

::: understand
- Climb the ladder one step at a time: queries, hardware, connection pooling, replicas, partitioning, then sharding.
:::

::: ask
- *"Is the bottleneck reads, writes, connections or one huge table?"* Each has a different fix.
:::

::: important ⭐ Say this in the interview
"I scale Postgres step by step. First indexes and query fixes, using pg_stat_statements, then vertical scaling. Each connection is a backend process, so with many Node instances I add PgBouncer in transaction mode or RDS Proxy. Read replicas take reporting and read-heavy traffic, but they lag, so a user's own reads go to the primary right after they write. Very large tables get partitioned by time or tenant, which prunes scans and makes retention a simple DROP of a partition. Sharding with something like Citus comes last, because cross-shard joins and transactions add a lot of complexity."
:::

::: links
PgBouncer | https://www.pgbouncer.org/
PostgreSQL: Table partitioning | https://www.postgresql.org/docs/current/ddl-partitioning.html
PostgreSQL: High availability and replication | https://www.postgresql.org/docs/current/high-availability.html
:::
