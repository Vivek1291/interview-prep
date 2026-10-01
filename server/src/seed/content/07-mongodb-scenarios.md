@section MongoDB Scenarios
@icon 🧪
@color #0d9488
@desc Real-world scenario questions: slow queries, 10M-row pagination, embed vs reference decisions.

=== Your API takes 5 seconds because MongoDB is slow. How do you investigate?
@p 3
@tags performance, debugging, scenario
@quick
- **Measure first**: is it really the DB? Add timing logs / APM (request → DB time vs app time vs network).
- Find the query: Mongoose `debug`, profiler (`slowms`), Atlas Performance Advisor.
- `explain('executionStats')` → COLLSCAN? in-memory SORT? docsExamined ≫ nReturned?
- Fix: **index (ESR)**, **query shape** (anchored regex, avoid `$ne`/`$nin` as main filters), **projection + lean + limit**, fix **N+1** (populate/loops), optimise the **aggregation** ($match first).
- Then: caching (Redis), pagination, connection pool, working set vs RAM, network/region, read replicas.

::: text
A structured answer is what interviewers are looking for. Walk through the layers **in order**.

### 1. Confirm where the time goes
- Add timings: total request time vs DB query time (`mongoose.set('debug', true)`, pino logs with durations, APM like Datadog/New Relic/X-Ray).
- Is it every request or only some (specific filters, big tenants, cold cache)?

### 2. Identify the exact query
- `db.setProfilingLevel(1, { slowms: 100 })` → `db.system.profile`
- Atlas **Query Profiler / Performance Advisor** (suggests indexes)
- `db.currentOp({ secs_running: { $gt: 2 } })` for long-running operations

### 3. Explain the query
`explain('executionStats')` → look for **COLLSCAN**, an in-memory **SORT**, and `totalDocsExamined` ≫ `nReturned`.

### 4. Fix in order of impact
| Problem | Fix |
|---|---|
| No / wrong index | Add a compound index following **ESR**; check field order |
| Bad query shape | Anchored regex `^abc`, avoid unindexable `$ne/$nin/$where`, avoid `$or` without an index on each branch |
| Returning too much | **Projection** (`select`), `.lean()`, **pagination / limit** |
| Big `skip` | Cursor pagination |
| **N+1 queries** | Batch with `$in`, `populate`, `$lookup`, or denormalise |
| Heavy aggregation | `$match`/`$project` early, indexes for the first stages, precompute (materialised view / cron job) |
| Large documents | Unbounded arrays → restructure (bucket / reference) |
| Lock / contention | Hot documents (a counter updated by everyone) → shard counters, batch |

### 5. Infrastructure
- **Working set > RAM** → disk reads (check the WiredTiger cache hit ratio) → scale up / archive old data.
- **Connection pool** exhausted (`maxPoolSize`), slow network, app and DB in **different regions**.
- Read-heavy → **read replicas** (`readPreference: secondaryPreferred`) or **Redis cache** for hot data.
- Very large data → **sharding**.
:::

::: diagram Investigation path
flowchart TD
  A["API slow: 5s"] --> B["Measure: DB time vs app time vs network"]
  B --> C["Find the query: profiler, Mongoose debug, Atlas advisor"]
  C --> D["explain executionStats"]
  D --> E{"COLLSCAN or in-memory SORT?"}
  E -->|"yes"| F["Add or fix compound index, ESR"]
  E -->|"no"| G{"Too many docs returned or N+1?"}
  G -->|"yes"| H["Projection, lean, limit, pagination, batch queries"]
  G -->|"no"| I{"Aggregation heavy?"}
  I -->|"yes"| J["$match first, precompute, cache"]
  I -->|"no"| K["Infra: RAM / working set, pool, network, replicas, cache"]
:::

::: chart bar Example: fixing a slow orders endpoint step by step
Step,Response time (ms)
Original,5000
Add compound index,420
Projection + lean,260
Remove N+1 (populate),120
Redis cache for hot page,15
:::

::: code javascript Toolkit: timings, debug, explain, N+1 fix
// 1) Log slow Mongoose queries with duration
mongoose.set('debug', (coll, method, query, doc, options) => {
  console.log(`[mongo] ${coll}.${method}`, JSON.stringify(query), options ? JSON.stringify(options) : '');
});

// 2) Middleware timing per request
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms > 500) console.warn(`SLOW ${req.method} ${req.originalUrl} ${ms.toFixed(0)}ms`);
  });
  next();
});

// 3) Explain from Mongoose
const plan = await Order.find({ status: 'PAID', userId }).sort({ createdAt: -1 }).limit(20).explain('executionStats');
console.log(plan.executionStats ?? plan[0].executionStats);

// 4) ❌ N+1: one query per order
const orders = await Order.find({ status: 'PAID' }).limit(100);
for (const o of orders) o.user = await User.findById(o.userId); // 101 queries!

// ✅ Batch: 2 queries total
const users = await User.find({ _id: { $in: orders.map((o) => o.userId) } }).select('name').lean();
const byId = new Map(users.map((u) => [String(u._id), u]));
const result = orders.map((o) => ({ ...o.toObject(), user: byId.get(String(o.userId)) }));

// 5) Cache hot, rarely-changing data
async function getCategoryTree() {
  const cached = await redis.get('categories:tree');
  if (cached) return JSON.parse(cached);
  const tree = await Category.find().lean();
  await redis.set('categories:tree', JSON.stringify(tree), 'EX', 300);
  return tree;
}
:::

::: ask
- *"Is it slow for all users or specific ones? Since when? Did data volume or a deploy change?"* Correlate with the change.
- *"What's the collection size and the query? Can I see the explain output?"*
- Don't jump straight to "add Redis". Interviewers want **diagnosis before solutions**.
:::

::: links
MongoDB: analyze query performance | https://www.mongodb.com/docs/manual/tutorial/analyze-query-plan/
Atlas Performance Advisor | https://www.mongodb.com/docs/atlas/performance-advisor/
:::

=== You have 10 million users. How would you implement pagination?
@p 3
@tags pagination, scale, scenario
@quick
- **Don't** say `skip(1000000)`: the DB still walks 1M index entries → gets slower with depth.
- Use **cursor (keyset) pagination**: `find({ _id: { $lt: lastId } }).sort({ _id: -1 }).limit(20)` → constant time via index seek.
- Custom sort → compound cursor `(createdAt, _id)` + matching compound index.
- Avoid exact `countDocuments` on every request: cache the count / `estimatedDocumentCount` / show "10,000+".
- If page numbers are required: limit max depth, or combine search filters to reduce the result set.

::: text
### Why offset fails at scale
`skip(n)` isn't free. MongoDB must traverse and discard `n` index keys/documents. Page 50,000 × 20 = skip 1,000,000 → hundreds of ms to seconds, plus high CPU. It also gives **inconsistent pages** when rows are inserted/deleted while the user paginates.

### Cursor/keyset pagination
- The client sends the **last seen value(s)** instead of a page number.
- The query uses an index **range seek**: `{ _id: { $lt: lastId } }`, so it's **O(log n + limit)** no matter how deep.
- Stable with concurrent writes.

### Designing it
1. Choose a **deterministic sort**: `_id` alone (time-ordered) or `(createdAt, _id)` for ties.
2. Create a matching index: `{ createdAt: -1, _id: -1 }` (+ equality filter fields first: `{ status: 1, createdAt: -1, _id: -1 }`).
3. Return an **opaque cursor** (base64 of the last sort values) + `hasNextPage` (fetch `limit + 1`).
4. React: `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`.

### Total count
`countDocuments` on 10M docs with filters is expensive. Options: `estimatedDocumentCount()` (metadata, no filter), a cached count (Redis, refreshed periodically), or just "Load more" without totals.
:::

::: chart line Response time vs page number (10M users, illustrative)
Page,skip/limit (ms),cursor (ms)
1,2,2
1000,40,2
10000,380,2
50000,1900,3
100000,3800,3
:::

::: code javascript Production cursor pagination (Express + Mongoose + React Query)
// ---------- API ----------
const encodeCursor = (doc) => Buffer.from(JSON.stringify({ c: doc.createdAt, id: String(doc._id) })).toString('base64url');
const decodeCursor = (s) => { const { c, id } = JSON.parse(Buffer.from(s, 'base64url').toString()); return { c: new Date(c), id: new mongoose.Types.ObjectId(id) }; };

router.get('/users', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const filter = { status: 'active' };
  if (req.query.cursor) {
    const { c, id } = decodeCursor(req.query.cursor);
    filter.$or = [{ createdAt: { $lt: c } }, { createdAt: c, _id: { $lt: id } }];
  }
  const docs = await User.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).select('name email createdAt').lean();
  const hasNextPage = docs.length > limit;
  const items = docs.slice(0, limit);
  res.json({ items, nextCursor: hasNextPage ? encodeCursor(items.at(-1)) : null });
}));
// Index: userSchema.index({ status: 1, createdAt: -1, _id: -1 })

// ---------- React ----------
// const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
//   queryKey: ['users'],
//   queryFn: ({ pageParam }) => api.get('/users', { params: { cursor: pageParam, limit: 20 } }).then((r) => r.data),
//   initialPageParam: null,
//   getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
// });
// + IntersectionObserver on a sentinel div to call fetchNextPage() → infinite scroll
:::

::: ask
- *"Does the product need page numbers / jump to page, or is infinite scroll/next-prev fine?"*
- *"Is the list filtered/sorted by user choice?"* Each sort option needs its own index + cursor fields.
- *"Is an exact total needed?"*
:::

::: links
MongoDB: paging with range queries | https://www.mongodb.com/docs/manual/reference/method/cursor.skip/#using-range-queries
TanStack Query infinite queries | https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
:::

=== Should you embed orders inside a user document?
@p 3
@tags data-modeling, scenario, embed
@quick
- Usually **NO**: orders are **unbounded** (grow forever → 16 MB limit, slow updates, huge reads).
- Orders are queried **independently** (by status/date/admin reports), have their own lifecycle and are updated often.
- ✅ Separate `orders` collection with `userId` (indexed `{ userId: 1, createdAt: -1 }`).
- ✅ Embed **inside the order** what belongs to it: line items, shipping address snapshot, price snapshot.
- Optional: keep a small **subset** in the user (last 3 orders summary, orderCount) = Subset pattern.

::: text
Evaluate against the criteria the interviewer listed:

| Criterion | Analysis for user → orders | Verdict |
|---|---|---|
| **Data size** | Each order has line items; a loyal customer may have thousands of orders → risk of the 16 MB limit | ❌ embed |
| **Access patterns** | Profile page needs user info; order history is paginated separately; admins query orders across all users by status/date | ❌ embed |
| **Update frequency** | Order status changes often (PAID → SHIPPED → DELIVERED); rewriting a huge user doc each time is costly | ❌ embed |
| **Relationships** | One-to-many (unbounded), and orders reference products and payments | ❌ embed |
| **Document size** | Grows forever → slower reads of the user doc (even when you only need the name) | ❌ embed |
| **Duplication** | Orders *should* duplicate product name/price at purchase time (a historical snapshot) | ✅ embed snapshot **inside the order** |

### Recommended model
- `users`: `{ _id, name, email, addresses: [...], stats: { orderCount, lifetimeValue }, recentOrders: [ last 3 summaries ] }` (the **subset pattern**, optional)
- `orders`: `{ _id, userId, items: [{ productId, name, unitPrice, qty }], shippingAddress: {...snapshot}, status, total, createdAt }`
- Index: `orders { userId: 1, createdAt: -1 }`, `orders { status: 1, createdAt: -1 }`

**When embedding would be OK:** a small app where orders are few, bounded (e.g. a subscription with ≤ 12 monthly invoices) and always read with the user.
:::

::: diagram Recommended model
erDiagram
  USER ||--o{ ORDER : places
  USER {
    ObjectId _id
    string name
    string email
    array addresses
    object stats
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

::: code javascript Schemas + keeping the subset in sync
const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  stats: { orderCount: { type: Number, default: 0 }, lifetimeValue: { type: Number, default: 0 } },
  recentOrders: [{ _id: false, orderId: Schema.Types.ObjectId, total: Number, status: String, createdAt: Date }], // max 3
});

const OrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ _id: false, productId: Schema.Types.ObjectId, name: String, unitPrice: Number, qty: Number }],
  shippingAddress: { line1: String, city: String, pin: String },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'PENDING' },
  total: Number,
}, { timestamps: true });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

async function onOrderPlaced(order) {
  await User.updateOne({ _id: order.userId }, {
    $inc: { 'stats.orderCount': 1, 'stats.lifetimeValue': order.total },
    $push: { recentOrders: { $each: [{ orderId: order._id, total: order.total, status: order.status, createdAt: order.createdAt }], $position: 0, $slice: 3 } },
  });
}
:::

::: ask
- *"How many orders per user on average and at the maximum? Which screens read orders? Do admins query orders across users?"* Asking about access patterns **before** answering is exactly what they want to see.
:::

::: links
Subset pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-subset-pattern
Avoid unbounded arrays | https://www.mongodb.com/docs/atlas/schema-suggestions/avoid-unbounded-arrays/
:::
