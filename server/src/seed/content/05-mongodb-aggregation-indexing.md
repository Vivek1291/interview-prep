@section MongoDB Aggregation & Indexing
@icon 📊
@color #059669
@desc Aggregation pipeline ($match, $group, $lookup, $unwind…), indexes, compound/unique/text indexes, cardinality and explain plans.

=== What is the aggregation pipeline? ($match, $group, $project, $sort, $limit, $skip, $count)
@p 3
@tags aggregation, pipeline, analytics
@quick
- Pipeline = array of **stages**; documents flow through each stage, which transforms them (like Unix pipes / JS `filter→map→reduce`).
- `$match` (filter; put it **first** to use indexes) → `$group` (GROUP BY with `$sum/$avg/$max/$push`) → `$project` (shape fields) → `$sort` → `$skip`/`$limit` → `$count`.
- `$facet` = multiple pipelines in one (data + total count for pagination).
- 100 MB memory limit per stage → `allowDiskUse: true`.
- Use for reports, dashboards, analytics, and joins (`$lookup`).

::: text
The **aggregation pipeline** processes documents through an ordered list of **stages**. Each stage's output is the next stage's input.

| Stage | SQL analogy | Purpose |
|---|---|---|
| `$match` | WHERE | Filter documents (use it early → fewer docs + index use) |
| `$group` | GROUP BY | Group by a key and compute accumulators: `$sum`, `$avg`, `$min`, `$max`, `$push`, `$addToSet`, `$first`, `$last` |
| `$project` / `$addFields` / `$set` | SELECT | Include/exclude/compute fields |
| `$sort` | ORDER BY | Sort (uses an index only if near the start) |
| `$skip` / `$limit` | OFFSET / LIMIT | Pagination |
| `$count` | COUNT(*) | Count documents reaching this stage |
| `$lookup` | LEFT OUTER JOIN | Join another collection |
| `$unwind` | (flatten) | One document per array element |
| `$facet` | multiple queries | Run sub-pipelines in parallel on the same input |
| `$bucket` | histogram | Group into ranges |

### Optimisation rules
1. **`$match` and `$sort` first** so indexes are used.
2. **`$project` early** to drop unneeded fields and reduce memory.
3. `$sort` + `$limit` together → the top-k optimisation.
4. Each stage has a **100 MB RAM limit** → pass `{ allowDiskUse: true }` for large sorts/groups.
:::

::: diagram Pipeline: documents flow through stages
flowchart LR
  A[("orders: 1M docs")] --> M["$match: status PAID, 2026"] --> G["$group: by customer, sum total"] --> S["$sort: total desc"] --> L["$limit: 5"] --> P["$project: shape output"] --> R(["Top 5 customers"])
:::

::: code javascript Real-world pipelines (mongosh)
// 1) Revenue per month for 2026 (dashboard chart)
db.orders.aggregate([
  { $match: { status: 'PAID', createdAt: { $gte: ISODate('2026-01-01'), $lt: ISODate('2027-01-01') } } },
  { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$total' }, orders: { $sum: 1 }, avgOrder: { $avg: '$total' } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, month: '$_id', revenue: 1, orders: 1, avgOrder: { $round: ['$avgOrder', 2] } } },
]);

// 2) Top 5 customers by spend
db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $group: { _id: '$userId', spent: { $sum: '$total' }, orderCount: { $sum: 1 } } },
  { $sort: { spent: -1 } },
  { $limit: 5 },
]);

// 3) Count users per city (only cities with 10+ users)
db.users.aggregate([
  { $group: { _id: '$address.city', users: { $sum: 1 } } },
  { $match: { users: { $gte: 10 } } },      // like SQL HAVING
  { $sort: { users: -1 } },
]);

// 4) Paginated list + total count in ONE query with $facet
db.products.aggregate([
  { $match: { category: 'books' } },
  { $sort: { createdAt: -1 } },
  { $facet: {
      data: [{ $skip: 40 }, { $limit: 20 }, { $project: { name: 1, price: 1 } }],
      total: [{ $count: 'count' }],
  } },
]);

// 5) Price histogram
db.products.aggregate([
  { $bucket: { groupBy: '$price', boundaries: [0, 500, 1000, 5000, 100000], default: 'other', output: { count: { $sum: 1 } } } },
]);
:::

::: code javascript Try it: $match → $group → $sort → $limit in plain JS (runs in browser)
const orders = [
  { user: 'asha', status: 'PAID', total: 1200, month: 1 },
  { user: 'vivek', status: 'PAID', total: 800, month: 1 },
  { user: 'asha', status: 'PAID', total: 300, month: 2 },
  { user: 'rahul', status: 'CANCELLED', total: 5000, month: 2 },
  { user: 'vivek', status: 'PAID', total: 2500, month: 3 },
  { user: 'priya', status: 'PAID', total: 100, month: 3 },
];

const pipeline = (docs, ...stages) => stages.reduce((acc, stage) => stage(acc), docs);
const $match = (pred) => (docs) => docs.filter(pred);
const $group = (keyFn, accs) => (docs) => {
  const map = new Map();
  for (const d of docs) {
    const k = keyFn(d);
    if (!map.has(k)) map.set(k, { _id: k, ...Object.fromEntries(Object.keys(accs).map((a) => [a, 0])) });
    const g = map.get(k);
    for (const [name, fn] of Object.entries(accs)) g[name] = fn(g[name], d);
  }
  return [...map.values()];
};
const $sort = (field, dir = -1) => (docs) => [...docs].sort((a, b) => (a[field] - b[field]) * dir);
const $limit = (n) => (docs) => docs.slice(0, n);

const topCustomers = pipeline(
  orders,
  $match((o) => o.status === 'PAID'),
  $group((o) => o.user, { spent: (acc, o) => acc + o.total, orders: (acc) => acc + 1 }),
  $sort('spent'),
  $limit(3)
);
console.log(topCustomers);
:::

::: code javascript Mongoose: aggregation in a service (dashboard stats)
async function getSalesSummary({ from, to }) {
  const [result] = await Order.aggregate([
    { $match: { status: 'PAID', createdAt: { $gte: new Date(from), $lt: new Date(to) } } },
    { $facet: {
        totals: [{ $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }],
        byDay: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' } } },
          { $sort: { _id: 1 } },
        ],
        topProducts: [
          { $unwind: '$items' },
          { $group: { _id: '$items.productId', qty: { $sum: '$items.qty' } } },
          { $sort: { qty: -1 } }, { $limit: 5 },
        ],
    } },
  ]).option({ allowDiskUse: true });
  return result;
}
// ⚠️ Mongoose does NOT cast types in aggregate(): convert ids with new mongoose.Types.ObjectId(id)
:::

::: understand
- Mongoose **doesn't apply schema casting** in `aggregate()`, so pass real `ObjectId`s and `Date`s, or `$match` finds nothing (a very common bug).
- `$group` output `_id` is the group key; use `_id: null` to aggregate the whole collection.
- For heavy analytics on a live database, consider precomputed summaries (a `daily_stats` collection updated by a job), **materialised views** (`$merge`/`$out`), or a data warehouse.
:::

::: ask
- *"How much data is scanned? Is this real-time or can it be precomputed?"* Dashboards over millions of docs → pre-aggregate.
- *"What timezone should grouping by day use?"* (`$dateToString` accepts a `timezone` option: `'Asia/Kolkata'`.) Interviewers love this detail.
:::

::: links
Aggregation pipeline | https://www.mongodb.com/docs/manual/core/aggregation-pipeline/
Aggregation stages reference | https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/
Pipeline optimisation | https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/
:::

=== $lookup and $unwind: how do you join collections?
@p 3
@tags lookup, unwind, joins
@quick
- `$lookup` = **left outer join** → adds an **array** field with matching docs from another collection.
- Simple: `{ from, localField, foreignField, as }`; advanced: `let` + `pipeline` (filter/project joined docs).
- `$unwind` flattens an array → one document per element (`preserveNullAndEmptyArrays: true` keeps docs with no match = LEFT JOIN).
- Index the **foreignField**! Otherwise each lookup scans the other collection.
- Frequent joins on hot paths → consider embedding/denormalising.

::: text
### $lookup
Joins documents from another collection **in the same database**. The result is always an **array** (possibly empty).

- **Equality form**: `{ $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } }`
- **Pipeline form** (conditions, projections, limits on the joined side):
  `{ $lookup: { from: 'orders', let: { uid: '$_id' }, pipeline: [ { $match: { $expr: { $eq: ['$userId', '$$uid'] } } }, { $sort: { createdAt: -1 } }, { $limit: 3 } ], as: 'recentOrders' } }`

### $unwind
Deconstructs an array into multiple documents. `{ items: [a, b, c] }` → three documents, each with `items: a`, `items: b`, `items: c`.
- Needed after `$lookup` to turn `user: [ {...} ]` into `user: {...}`.
- Needed to `$group` by array elements (e.g. sales per product from order items).
- `preserveNullAndEmptyArrays: true` keeps documents whose array is empty/missing.

### Performance
- Make sure `foreignField` is **indexed** (`_id` always is).
- `$match` **before** `$lookup` to join fewer documents.
- Sharded collections have restrictions on the `from` collection.
:::

::: diagram $lookup then $unwind
flowchart LR
  O["order: _id 1, userId u7, items: [A, B]"] --> L["$lookup users"] --> O2["order + user: [ {name Vivek} ]"] --> U["$unwind $user"] --> O3["order + user: {name Vivek}"]
  O3 --> U2["$unwind $items"] --> O4["2 docs: item A / item B"]
:::

::: code javascript Join practice (mongosh)
// Orders with customer name (one-to-one after unwind)
db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'customer' } },
  { $unwind: '$customer' },
  { $project: { total: 1, createdAt: 1, 'customer.name': 1, 'customer.email': 1 } },
]);

// Users with their last 3 orders (pipeline lookup)
db.users.aggregate([
  { $match: { isActive: true } },
  { $lookup: {
      from: 'orders',
      let: { uid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 3 },
        { $project: { total: 1, createdAt: 1 } },
      ],
      as: 'recentOrders',
  } },
]);

// Users who have NEVER ordered (anti-join)
db.users.aggregate([
  { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
  { $match: { orders: { $size: 0 } } },
  { $project: { name: 1, email: 1 } },
]);

// Best-selling products: unwind items, group, then join product names
db.orders.aggregate([
  { $unwind: '$items' },
  { $group: { _id: '$items.productId', unitsSold: { $sum: '$items.qty' } } },
  { $sort: { unitsSold: -1 } },
  { $limit: 10 },
  { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
  { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  { $project: { unitsSold: 1, name: '$product.name' } },
]);

db.orders.createIndex({ userId: 1, createdAt: -1 }); // supports the lookups above
:::

::: code javascript Try it: $lookup + $unwind with plain JS arrays (runs in browser)
const users = [{ _id: 1, name: 'Vivek' }, { _id: 2, name: 'Asha' }, { _id: 3, name: 'Rahul' }];
const orders = [
  { _id: 101, userId: 1, items: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }] },
  { _id: 102, userId: 2, items: [{ sku: 'A', qty: 5 }] },
];

const lookup = (docs, from, localField, foreignField, as) =>
  docs.map((d) => ({ ...d, [as]: from.filter((f) => f[foreignField] === d[localField]) }));
const unwind = (docs, field, preserve = false) =>
  docs.flatMap((d) => (d[field]?.length ? d[field].map((v) => ({ ...d, [field]: v })) : preserve ? [{ ...d, [field]: null }] : []));

const withUser = unwind(lookup(orders, users, 'userId', '_id', 'user'), 'user');
console.log(withUser.map((o) => `${o._id} → ${o.user.name}`));

const usersWithOrders = lookup(users, orders, '_id', 'userId', 'orders');
console.log('never ordered:', usersWithOrders.filter((u) => u.orders.length === 0).map((u) => u.name));

const perItem = unwind(orders, 'items');
console.log('unwound items:', perItem.map((o) => `${o._id}:${o.items.sku}x${o.items.qty}`));
:::

::: ask
- *"How often does this join run and on how many documents?"* If it's on every page load, suggest **embedding / denormalising** the few needed fields instead of `$lookup`.
- Mention that Mongoose `populate()` is **separate queries** in the app, not a DB join. `$lookup` is a server-side join.
:::

::: links
$lookup | https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/
$unwind | https://www.mongodb.com/docs/manual/reference/operator/aggregation/unwind/
:::

=== What is an index and why does it improve query performance?
@p 3
@tags indexes, performance, b-tree
@quick
- Index = a **sorted B-tree** of field values → pointers to documents (like a book's index).
- Without an index → **COLLSCAN** (read every document, O(n)). With one → **IXSCAN** (O(log n) seek + read only matches).
- Also speeds up **sort** (no in-memory sort) and enables **covered queries** (answer from the index alone).
- `_id` has an index automatically. `db.users.createIndex({ email: 1 }, { unique: true })`.
- Check with `explain('executionStats')`: compare `totalDocsExamined` vs `nReturned`.

::: text
An **index** is a separate data structure (a **B-tree**) that stores the values of one or more fields **in sorted order**, each pointing to the document location.

### No index → collection scan
To find `{ email: 'v@x.com' }` in 10M users, MongoDB reads **all 10M documents** (COLLSCAN). That's slow, CPU/IO heavy, and gets worse as data grows.

### With an index → index scan
MongoDB walks the B-tree (like binary search), goes straight to the matching key(s) in **O(log n)**, then fetches only those documents (IXSCAN → FETCH).

### Other benefits
- **Sorting**: an index on `createdAt` returns documents already sorted, so there's no expensive in-memory SORT (which fails beyond 100 MB).
- **Covered query**: if the filter + projection use only indexed fields (and exclude `_id`), MongoDB answers **from the index alone** without touching documents.
- **Uniqueness**: unique indexes enforce constraints (no duplicate emails).
:::

::: diagram Without vs with index
flowchart TB
  subgraph NO["No index"]
    Q1["find email = v@x.com"] --> CS["COLLSCAN: read 10,000,000 docs"] --> R1["1 match, slow"]
  end
  subgraph YES["Index on email"]
    Q2["find email = v@x.com"] --> IX["IXSCAN: B-tree seek, ~23 steps"] --> F["FETCH 1 doc"] --> R2["1 match, fast"]
  end
:::

::: chart bar Documents examined to find 1 user (10M users)
Query,Docs examined
No index (COLLSCAN),10000000
Index on email (IXSCAN),1
:::

::: code javascript Create an index & prove it with explain() (mongosh)
// Seed 200k docs to see the difference
const docs = [];
for (let i = 0; i < 200000; i++) docs.push({ email: `user${i}@x.com`, age: i % 80, city: ['Delhi', 'Pune', 'Mumbai'][i % 3] });
db.perf_users.insertMany(docs);

// BEFORE index
db.perf_users.find({ email: 'user150000@x.com' }).explain('executionStats').executionStats;
// → stage: COLLSCAN, totalDocsExamined: 200000, executionTimeMillis: ~80

db.perf_users.createIndex({ email: 1 }, { unique: true });

// AFTER index
db.perf_users.find({ email: 'user150000@x.com' }).explain('executionStats').executionStats;
// → stage: IXSCAN → FETCH, totalKeysExamined: 1, totalDocsExamined: 1, executionTimeMillis: 0

// Covered query (no FETCH stage at all)
db.perf_users.find({ email: 'user150000@x.com' }, { email: 1, _id: 0 }).explain('executionStats');

db.perf_users.getIndexes();
:::

::: code javascript Try it: linear scan vs binary search on a sorted index (runs in browser)
const N = 1_000_000;
const emails = Array.from({ length: N }, (_, i) => `user${String(i).padStart(7, '0')}@x.com`); // sorted = "index"

function collScan(target) {
  let examined = 0;
  for (const e of emails) { examined++; if (e === target) break; }
  return examined;
}
function indexSeek(target) {
  let lo = 0, hi = emails.length - 1, steps = 0;
  while (lo <= hi) {
    steps++;
    const mid = (lo + hi) >> 1;
    if (emails[mid] === target) return steps;
    emails[mid] < target ? (lo = mid + 1) : (hi = mid - 1);
  }
  return steps;
}
const target = 'user0987654@x.com';
console.time('collscan'); const a = collScan(target); console.timeEnd('collscan');
console.time('index');    const b = indexSeek(target); console.timeEnd('index');
console.log({ docsExaminedWithoutIndex: a, stepsWithIndex: b });
:::

::: ask
- *"What queries run most often, and what are their filters and sorts?"* Indexes are designed **per query pattern**.
- *"What's the read/write ratio?"* Indexes speed reads but slow writes (see the next question).
:::

::: links
Indexes | https://www.mongodb.com/docs/manual/indexes/
Explain results | https://www.mongodb.com/docs/manual/reference/explain-results/
:::

=== What are the downsides of indexes?
@p 3
@tags indexes, trade-offs
@quick
- **Slower writes**: every insert/update/delete must update **every** index on that collection.
- **Memory & disk**: indexes should fit in RAM (WiredTiger cache) for good performance.
- Too many / unused indexes = wasted resources; the planner may even pick a poor one.
- Low-selectivity indexes (e.g. boolean `isActive` alone) give little benefit.
- Building indexes on big collections takes time/IO (do it in low traffic; rolling builds on replica sets).

::: text
Indexes aren't free. Each one is an **extra B-tree** MongoDB must maintain.

| Cost | Why |
|---|---|
| **Write amplification** | An insert into a collection with 8 indexes = 1 document write + 8 index writes. Updates to indexed fields also update the index. |
| **RAM** | The **working set** (hot data + indexes) should fit in memory; otherwise reads hit disk and latency spikes. |
| **Disk** | Indexes can be as large as the data itself. |
| **Planner overhead** | Many overlapping indexes → more candidate plans to evaluate. |
| **Build cost** | Creating an index on 100M docs takes minutes to hours and uses I/O. |

### Hygiene
- Find unused indexes: `db.collection.aggregate([{ $indexStats: {} }])` (check `accesses.ops`).
- Remove redundant ones: `{ a: 1 }` is redundant if `{ a: 1, b: 1 }` exists (prefix rule).
- Use **partial indexes** (only index docs that matter, e.g. `isDeleted: false`) and **TTL indexes** to auto-expire data.
:::

::: chart line Insert throughput vs number of indexes (illustrative)
Indexes,Inserts per second
1,50000
3,38000
5,29000
8,20000
12,13000
:::

::: code javascript Index hygiene commands (mongosh)
// Which indexes are actually used?
db.orders.aggregate([{ $indexStats: {} }, { $project: { name: 1, ops: '$accesses.ops', since: '$accesses.since' } }]);

// Index sizes
db.orders.stats().indexSizes;

// Partial index: only active products → smaller & faster
db.products.createIndex({ category: 1, price: 1 }, { partialFilterExpression: { isDeleted: false } });

// TTL index: auto-delete sessions 24h after createdAt
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Hide an index to test impact before dropping it
db.orders.hideIndex('status_1');
db.orders.unhideIndex('status_1');
db.orders.dropIndex('status_1');
:::

::: ask
- *"Is this collection write-heavy (logs, events, IoT) or read-heavy (catalog)?"* Write-heavy → minimal indexes.
:::

::: links
Indexing strategies | https://www.mongodb.com/docs/manual/applications/indexes/
$indexStats | https://www.mongodb.com/docs/manual/reference/operator/aggregation/indexStats/
:::

=== How would you decide which fields to index? (compound indexes, ESR rule, cardinality)
@p 3
@tags indexes, compound, esr, cardinality
@quick
- Index fields used in **frequent/slow queries**: filters, sorts, joins (`foreignField`), unique constraints.
- **Compound index** field order: **E**quality → **S**ort → **R**ange (ESR rule).
- **Prefix rule**: `{ a:1, b:1, c:1 }` supports queries on `a`, `a+b`, `a+b+c` (not `b` alone).
- Prefer **high-cardinality / selective** fields (email, userId) over low-cardinality (gender, boolean) as leading keys, unless it's an equality filter used in every query.
- Validate with `explain()`, the Atlas Performance Advisor / profiler; monitor slow queries.

::: text
### Process
1. **Collect query patterns**: the slow query log / profiler (`db.setProfilingLevel(1, { slowms: 100 })`), Atlas Performance Advisor, and your API endpoints.
2. For each important query, list its **equality filters**, **sort** and **range filters**.
3. Build a **compound index** using the **ESR rule**:
   - **E**quality fields first (`status: 'PAID'`, `userId: X`)
   - **S**ort fields next (`createdAt: -1`)
   - **R**ange fields last (`total: { $gt: 100 }`, `$in` with many values, `$regex`)
4. Reuse indexes: one compound index can serve many queries via **prefixes**.
5. Verify with **`explain('executionStats')`**. The goal is `totalDocsExamined ≈ nReturned`, and no in-memory `SORT` stage.

### Cardinality & selectivity
- **Cardinality** = number of distinct values. `email` (millions) = high; `isActive` (2) = low.
- **Selective** fields narrow results a lot, which makes them great index keys.
- Low-cardinality fields alone are poor indexes, but fine as **equality prefixes** in a compound index, or as a **partial index** filter.

### Index types to know
| Type | Example | Use |
|---|---|---|
| Single | `{ email: 1 }` | One field |
| **Compound** | `{ userId: 1, createdAt: -1 }` | Multi-field filters + sort |
| **Unique** | `{ email: 1 }, { unique: true }` | Enforce no duplicates |
| Multikey | `{ tags: 1 }` | Automatic for arrays |
| **Text** | `{ title: 'text', body: 'text' }` | Keyword search (`$text`) |
| TTL | `{ createdAt: 1 }, { expireAfterSeconds }` | Auto-expire |
| Partial | `{ ... }, { partialFilterExpression }` | Index a subset |
| Geospatial | `{ location: '2dsphere' }` | Near-me queries |
| Wildcard | `{ 'attributes.$**': 1 }` | Dynamic keys |
:::

::: diagram ESR rule for: find status PAID, total > 1000, sort createdAt desc
flowchart LR
  E["E: status (equality)"] --> S["S: createdAt (sort)"] --> R["R: total (range)"] --> IDX["index: status 1, createdAt -1, total 1"]
:::

::: code javascript Designing indexes for real endpoints (mongosh)
// Endpoint 1: GET /users/:id/orders?status=PAID  (newest first)
db.orders.find({ userId: uid, status: 'PAID' }).sort({ createdAt: -1 }).limit(20);
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1 });   // E, E, S

// Endpoint 2: admin list: status filter + total range + sort by date
db.orders.find({ status: 'PAID', total: { $gte: 1000 } }).sort({ createdAt: -1 });
db.orders.createIndex({ status: 1, createdAt: -1, total: 1 });    // E, S, R  ✅
// If you used { status: 1, total: 1, createdAt: -1 } → MongoDB needs an in-memory SORT ❌

// Unique index: prevent duplicate emails (case-insensitive via collation)
db.users.createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// Text index: search products
db.products.createIndex({ name: 'text', description: 'text' }, { weights: { name: 10, description: 2 } });
db.products.find({ $text: { $search: 'wireless headphones' } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });

// Check it
db.orders.find({ status: 'PAID', total: { $gte: 1000 } }).sort({ createdAt: -1 }).explain('executionStats');
:::

::: code javascript Mongoose: declare indexes in the schema
const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED'] },
  total: Number,
  email: { type: String, unique: true }, // creates a unique index (NOT a validator!)
}, { timestamps: true });

orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1, total: 1 });

// In production disable autoIndex and create indexes via migrations:
// mongoose.set('autoIndex', false);  → then Order.syncIndexes() in a deploy script
:::

::: ask
- *"Can you show me the slowest queries / query patterns?"* Always start from data, not guesses.
- *"Are writes latency-sensitive?"* This limits how many indexes you add.
:::

::: links
ESR (Equality, Sort, Range) rule | https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/
Compound indexes | https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/
Text indexes | https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/
:::

=== How do you read an explain plan?
@p 2
@tags explain, performance, debugging
@quick
- `db.coll.find(q).sort(s).explain('executionStats')`.
- Look at `winningPlan.stage`: **COLLSCAN** ❌, **IXSCAN** ✅, **FETCH**, **SORT** (in-memory sort ❌), **PROJECTION_COVERED** ✅.
- Compare `nReturned` vs `totalKeysExamined` vs `totalDocsExamined`; ideal ratio ≈ 1:1:1.
- `executionTimeMillis` for total time; `rejectedPlans` shows alternatives.
- Mongoose: `Model.find(q).explain('executionStats')`.

::: text
`explain()` shows **how** MongoDB executed (or would execute) a query.

### Verbosity modes
- `'queryPlanner'` (default): the chosen plan, without running it.
- `'executionStats'`: runs it, with real counts and times ✅ (the one to use).
- `'allPlansExecution'`: stats for the rejected plans too.

### What to check
| Field | Good | Bad |
|---|---|---|
| `winningPlan.stage` / `inputStage` | `IXSCAN` → `FETCH` | `COLLSCAN` |
| In-memory `SORT` stage | absent | present (add sort field to index) |
| `totalDocsExamined / nReturned` | ≈ 1 | ≫ 1 (index not selective) |
| `totalKeysExamined / nReturned` | ≈ 1 | ≫ 1 (wrong field order) |
| `executionTimeMillis` | small | large |
:::

::: code json Annotated explain output (trimmed)
{
  "queryPlanner": {
    "winningPlan": {
      "stage": "LIMIT",
      "inputStage": {
        "stage": "FETCH",
        "inputStage": {
          "stage": "IXSCAN",
          "indexName": "status_1_createdAt_-1",
          "direction": "forward"
        }
      }
    },
    "rejectedPlans": []
  },
  "executionStats": {
    "nReturned": 20,
    "executionTimeMillis": 2,
    "totalKeysExamined": 20,
    "totalDocsExamined": 20
  }
}
:::

::: code javascript Enable the profiler to find slow queries (mongosh)
db.setProfilingLevel(1, { slowms: 100 });            // log queries slower than 100ms
db.system.profile.find().sort({ ts: -1 }).limit(5).pretty();
db.system.profile.find({ planSummary: 'COLLSCAN' }); // queries doing full scans
db.setProfilingLevel(0);                               // turn off

// Mongoose debug: print every query
// mongoose.set('debug', true);
:::

::: ask
- Mention you'd test explain on **production-like data volume**, because plans on tiny dev databases can be misleading.
:::

::: links
Explain results | https://www.mongodb.com/docs/manual/reference/explain-results/
Database profiler | https://www.mongodb.com/docs/manual/tutorial/manage-the-database-profiler/
:::
