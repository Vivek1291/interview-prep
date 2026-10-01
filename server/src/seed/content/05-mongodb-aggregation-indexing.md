@section MongoDB Aggregation & Indexing
@icon 📊
@color #059669
@desc Aggregation pipeline ($match, $group, $lookup, $unwind…), indexes, compound/unique/text indexes, the ESR rule, write costs and explain plans, measured on a 1-million-order collection.

=== What is the aggregation pipeline? ($match, $group, $project, $sort, $limit, $skip, $count)
@p 3
@tags aggregation, pipeline, analytics
@quick
- A pipeline is an **array of stages**; documents flow through them in order, like `filter → map → reduce` in JS or Unix pipes.
- `$match` (WHERE, put it **first** so it can use indexes) → `$group` (GROUP BY with `$sum $avg $max $push`) → `$project`/`$set` (shape) → `$sort` → `$skip`/`$limit` → `$count`.
- `$facet` runs several sub-pipelines on the same input (page of data + total count in one query).
- Each blocking stage (`$group`, `$sort`) may use **100 MB** of RAM; beyond that it spills to disk (`allowDiskUse`, on by default since 6.0).
- Measured (1M orders): revenue per month as a pipeline **317 ms** vs pulling 250k docs into Node and summing there **851 ms**.

::: text 🧒 In simple words
Think of a **factory conveyor belt**. Raw orders go in at one end. The first worker **throws away** everything that isn't paid ($match). The next worker **sorts them into bins** by month and adds up each bin ($group). Another worker **relabels** the boxes ($project), another **lines them up** ($sort), and the last one **keeps only the first five** ($limit). Doing all of this inside the database's factory is much faster than shipping every raw order to your app and sorting them in your own garage.
:::

::: text 📖 Detailed answer
The **aggregation pipeline** processes documents through an ordered list of **stages**; each stage's output is the next stage's input.

| Stage | SQL analogy | Purpose |
|---|---|---|
| `$match` | WHERE | Filter (early → fewer documents and index use) |
| `$group` | GROUP BY | Group by a key; accumulators `$sum $avg $min $max $push $addToSet $first $last` |
| `$project` / `$set` / `$unset` | SELECT | Include, exclude, compute fields |
| `$sort` | ORDER BY | Sort (can use an index only near the start) |
| `$skip` / `$limit` | OFFSET / LIMIT | Pagination |
| `$count` | COUNT(*) | Count documents reaching this stage |
| `$lookup` / `$unwind` | JOIN / flatten | Join another collection; one document per array element |
| `$facet` | several queries | Sub-pipelines on the same input |
| `$bucket` | histogram | Group into ranges |
| `$merge` / `$out` | INSERT … SELECT | Write results to a collection (materialised views) |

### Optimisation rules
1. **`$match` (and `$sort`) first** so indexes are used and later stages see fewer documents.
2. **`$project` early** only when it really drops big fields (the optimiser already avoids loading unused fields in many cases).
3. `$sort` + `$limit` together → **top-k** sort (keeps only k documents in memory).
4. A `$match` *after* `$group` is SQL's **HAVING**: it filters groups, not documents.
5. `$group` and `$sort` use up to **100 MB** each; larger work spills to disk.

### Measured: pipeline vs doing it in the app (MongoDB 7, 1,000,000 orders)
| Approach | Time |
|---|---|
| `aggregate([$match PAID, $group by month])` | **317 ms** |
| `find({ status: 'PAID' })` → 250,000 documents to Node → sum in JS | **851 ms** |
The pipeline sends back 12 small documents; the app approach ships 250,000 documents over the wire and deserialises each one.
:::

::: diagram Pipeline: documents flow through stages
flowchart LR
  A[("orders: 1M docs")] --> M["$match: status PAID"] --> G["$group: by month, sum total"] --> S["$sort: _id asc"] --> P["$project: shape output"] --> R(["12 rows for a chart"])
:::

::: chart bar Measured: revenue per month over 1M orders (ms, lower is better)
Approach,Milliseconds
Aggregation pipeline,317
Fetch 250k docs + sum in Node,851
:::

::: image A factory conveyor belt: filter, bin, relabel, line up, keep the top
/images/mongodb-aggregation-indexing/pipeline.svg
:::

::: text 🪜 Step by step
How "top 3 customers by spend" runs: `[$match PAID] → [$group by userId, sum total] → [$sort spent -1] → [$limit 3]`:
1. `$match` uses an index on `status` (if present) and passes only PAID orders on.
2. `$group` keeps one running bucket per `userId` in memory and adds each order's `total` into its bucket.
3. When the input is exhausted, `$group` emits one document per customer: `{ _id: userId, spent, orders }`.
4. `$sort` + `$limit` are combined into a **top-k sort**: MongoDB keeps only the best 3 while scanning the groups.
5. The 3 documents are returned in one batch; the driver turns them into JS objects.
6. Adding `$lookup` users *after* `$limit` joins names for just 3 documents, not for every order.
:::

::: code javascript Real-world pipelines with seed data (mongosh: run with mongosh --file pipelines.js)
// How to run: mongosh "mongodb://localhost:27017" --file pipelines.js
db = db.getSiblingDB('shop_agg');
db.orders.drop(); db.users.drop(); db.products.drop();
const statuses = ['PAID', 'PAID', 'PENDING', 'CANCELLED'];
db.users.insertMany(Array.from({ length: 30 }, (_, i) => ({ _id: i, name: `User ${i}`, address: { city: ['Delhi', 'Pune', 'Mumbai'][i % 3] } })));
db.orders.insertMany(Array.from({ length: 600 }, (_, i) => ({
  userId: i % 30, status: statuses[i % 4], total: 100 + ((i * 37) % 900),
  createdAt: new Date(Date.UTC(2026, i % 12, 1 + (i % 28))), items: [{ productId: i % 8, qty: 1 + (i % 3) }],
})));
db.products.insertMany(Array.from({ length: 8 }, (_, i) => ({ _id: i, name: `Product ${i}`, category: i % 2 ? 'books' : 'toys', price: 150 * (i + 1), createdAt: new Date(Date.UTC(2026, 0, i + 1)) })));
db.orders.createIndex({ status: 1, createdAt: 1 });

print('1) revenue per month (first 3):');
printjson(db.orders.aggregate([
  { $match: { status: 'PAID', createdAt: { $gte: ISODate('2026-01-01'), $lt: ISODate('2027-01-01') } } },
  { $group: { _id: { $month: { date: '$createdAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 }, avgOrder: { $avg: '$total' } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, month: '$_id', revenue: 1, orders: 1, avgOrder: { $round: ['$avgOrder', 2] } } },
]).toArray().slice(0, 3));

print('2) top 3 customers by spend, names joined after $limit:');
printjson(db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $group: { _id: '$userId', spent: { $sum: '$total' }, orderCount: { $sum: 1 } } },
  { $sort: { spent: -1 } },
  { $limit: 3 },
  { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
  { $project: { _id: 0, name: { $first: '$user.name' }, spent: 1, orderCount: 1 } },
]).toArray());

print('3) cities with 10+ users (HAVING):');
printjson(db.users.aggregate([
  { $group: { _id: '$address.city', users: { $sum: 1 } } },
  { $match: { users: { $gte: 10 } } },
  { $sort: { _id: 1 } },
]).toArray());

print('4) page 2 of books + total in one query ($facet):');
printjson(db.products.aggregate([
  { $match: { category: 'books' } },
  { $sort: { createdAt: -1 } },
  { $facet: { data: [{ $skip: 2 }, { $limit: 2 }, { $project: { _id: 0, name: 1, price: 1 } }], total: [{ $count: 'count' }] } },
]).toArray()[0]);

print('5) price histogram ($bucket):');
printjson(db.products.aggregate([
  { $bucket: { groupBy: '$price', boundaries: [0, 500, 1000, 5000], default: 'other', output: { count: { $sum: 1 } } } },
]).toArray());
:::

::: code javascript Mongoose: dashboard summary in a service, with the casting trap (node sales-summary.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node sales-summary.js
const mongoose = require('mongoose');

const Order = mongoose.model('Order', new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  status: { type: String, enum: ['PENDING', 'PAID'] },
  total: Number,
  items: [{ productId: Number, qty: Number }],
}, { timestamps: true }));

async function getSalesSummary({ from, to, userId }) {
  const match = { status: 'PAID', createdAt: { $gte: new Date(from), $lt: new Date(to) } };
  if (userId) match.userId = new mongoose.Types.ObjectId(userId);     // aggregate() does NOT cast strings
  const [result] = await Order.aggregate([
    { $match: match },
    { $facet: {
      totals: [{ $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }],
      byDay: [
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: '$total' } } },
        { $sort: { _id: 1 } },
      ],
      topProducts: [{ $unwind: '$items' }, { $group: { _id: '$items.productId', qty: { $sum: '$items.qty' } } }, { $sort: { qty: -1 } }, { $limit: 3 }],
    } },
  ]);
  return result;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Order.deleteMany({});
  const buyer = new mongoose.Types.ObjectId();
  await Order.create([
    { userId: buyer, status: 'PAID', total: 500, items: [{ productId: 1, qty: 2 }], createdAt: new Date('2026-09-01T10:00:00Z') },
    { userId: buyer, status: 'PAID', total: 300, items: [{ productId: 2, qty: 5 }], createdAt: new Date('2026-09-02T10:00:00Z') },
    { userId: new mongoose.Types.ObjectId(), status: 'PENDING', total: 900, items: [], createdAt: new Date('2026-09-02T11:00:00Z') },
  ]);
  const summary = await getSalesSummary({ from: '2026-09-01', to: '2026-10-01', userId: buyer.toString() });
  console.log('totals:', summary.totals[0], '| days:', summary.byDay.length, '| top product:', summary.topProducts[0]);
  const raw = await Order.aggregate([{ $match: { userId: buyer.toString() } }]);   // the trap
  console.log('matching a string userId in aggregate() finds', raw.length, 'orders (cast it to ObjectId!)');
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: build $match → $group → $sort → $limit from functions (runnable)
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
  const groups = new Map();
  for (const d of docs) {
    const k = keyFn(d);
    if (!groups.has(k)) groups.set(k, { _id: k, ...Object.fromEntries(Object.keys(accs).map((a) => [a, 0])) });
    const g = groups.get(k);
    for (const [name, fn] of Object.entries(accs)) g[name] = fn(g[name], d);
  }
  return [...groups.values()];
};
const $sort = (field, dir = -1) => (docs) => [...docs].sort((a, b) => (a[field] - b[field]) * dir);
const $limit = (n) => (docs) => docs.slice(0, n);

const top = pipeline(orders,
  $match((o) => o.status === 'PAID'),
  $group((o) => o.user, { spent: (acc, o) => acc + o.total, orders: (acc) => acc + 1 }),
  $sort('spent'),
  $limit(3));
console.log(top.map((t) => `${t._id}: ${t.spent} (${t.orders} orders)`).join(' | '));
console.log('top customer is vivek with 3300', top[0]._id === 'vivek' && top[0].spent === 3300 ? '✅' : '❌ FAIL');
console.log('cancelled order was filtered out first', !top.some((t) => t._id === 'rahul') ? '✅' : '❌ FAIL');
const having = pipeline(top, $match((g) => g.orders >= 2));
console.log('$match after $group acts like HAVING', having.length === 2 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `$match` late in the pipeline (after `$lookup`/`$unwind`) → no index use, far more work.
- Passing strings instead of `ObjectId`/`Date` in Mongoose `aggregate()` (no schema casting) → empty results.
- Grouping by day without a `timezone` → Indian evening orders counted on the wrong day.
- `$lookup` before `$limit` when you only need names for the top few.
- Running heavy analytics pipelines on the primary during peak traffic instead of precomputing or reading from a secondary/analytics node.
:::

::: understand
- The pipeline moves computation **to the data**: fewer bytes over the network and no deserialising of documents you'll throw away.
- Stage order is the main performance lever; `explain()` works on `aggregate()` too.
- For dashboards over millions of documents, precompute with `$merge` into a summary collection on a schedule.
:::

::: ask
- *"Real-time or can it be precomputed every few minutes?"*
- *"Which timezone defines a 'day' for the business?"*
- *"How many documents does each stage process?"* (check with explain).
:::

::: important ⭐ Say this in the interview
"The aggregation pipeline is an array of stages that documents flow through: $match filters, $group groups and computes sums or averages, $project shapes fields, $sort, $skip and $limit order and page, and $count counts; $lookup joins, $unwind flattens arrays and $facet runs several sub-pipelines at once, for example a page plus the total count. I put $match and $sort first so they can use indexes, combine $sort with $limit for top-k, and remember a $match after $group works like HAVING. In Mongoose aggregate doesn't cast types, so I convert ids to ObjectId. Running the work in the database is much faster than pulling documents into Node: on a million orders, revenue per month took about 317 milliseconds as a pipeline versus 850 when fetched and summed in the app."
:::

::: links
MongoDB: Aggregation pipeline | https://www.mongodb.com/docs/manual/core/aggregation-pipeline/
MongoDB: Aggregation stages reference | https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/
MongoDB: Pipeline optimisation | https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/
:::

=== $lookup and $unwind: how do you join collections?
@p 3
@tags lookup, unwind, joins
@quick
- `$lookup` = **left outer join**: adds an **array** field with the matching documents from another collection (same database).
- Simple form `{ from, localField, foreignField, as }`; pipeline form `let` + `pipeline` (filter, sort, limit, project the joined side).
- `$unwind` turns one document with an array into one document **per element**; `preserveNullAndEmptyArrays: true` keeps documents with no match.
- **Index the foreignField**: measured 50 users joined to 1M orders: **10.3 s** without an index on `orders.userId`, **6.4 ms** with it.
- Joins on hot paths → consider embedding a few fields; Mongoose `populate()` is separate queries, not `$lookup`.

::: text 🧒 In simple words
`$lookup` is like **stapling related papers** to each form. For every order form, the clerk goes to the "users" cabinet, finds the matching user card and staples a **copy** to the order (always in a little envelope, an array, even if there's just one card). `$unwind` is **opening the envelope** so each stapled card becomes its own copy of the form. If the users cabinet has an **alphabetical tab system** (an index), the clerk finds each card instantly; without it, the clerk reads the whole cabinet for every single form.
:::

::: text 📖 Detailed answer
### $lookup forms
| Form | Shape | Use |
|---|---|---|
| Equality | `{ from: 'users', localField: 'userId', foreignField: '_id', as: 'user' }` | Simple key match |
| Pipeline | `{ from: 'orders', let: { uid: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$userId', '$$uid'] } } }, { $sort… }, { $limit: 3 }], as: 'recent' }` | Conditions, limits, projections on the joined side |
| Concise (5.0+) | `localField` + `foreignField` **and** `pipeline` | Equality plus extra stages |

The result field is **always an array** (empty when nothing matches): a LEFT OUTER JOIN.

### $unwind
`{ items: [a, b, c] }` → three documents with `items: a`, `items: b`, `items: c`.
- After `$lookup` to turn `user: [{…}]` into `user: {…}` (or use `{ $first: '$user' }` in `$project`).
- Before `$group` to aggregate **array elements** (units sold per product from order items).
- `preserveNullAndEmptyArrays: true` keeps documents whose array is empty or missing (otherwise they disappear, turning a left join into an inner join).

### Performance (measured, MongoDB 7)
| Join | Time |
|---|---|
| 50 users → 1,000,000 orders, **no index** on `orders.userId` | **10,275 ms** (each user scans the orders collection) |
| Same join, **index** on `orders.userId` | **6.4 ms** |

Also: `$match` **before** `$lookup`, `$limit` before `$lookup` when you only need the top N, and project only needed fields of the joined side.

### $lookup vs populate vs embedding
| | Where it runs | Cost |
|---|---|---|
| `$lookup` | In the database, one round trip | Server CPU |
| Mongoose `populate()` | App: a second query with `$in` | Two round trips |
| Embedded copy | No join | Keeping copies in sync |
:::

::: diagram $lookup then $unwind
flowchart LR
  O["order: _id 1, userId u7, items: [A, B]"] --> L["$lookup users"] --> O2["order + user: [ {name Vivek} ]"] --> U["$unwind $user"] --> O3["order + user: {name Vivek}"]
  O3 --> U2["$unwind $items"] --> O4["2 docs: item A, item B"]
:::

::: chart bar Measured: join 50 users to 1M orders (ms, log-worthy difference)
foreignField index,Milliseconds
No index on orders.userId,10275
Index on orders.userId,6.4
:::

::: image Stapling copies of related cards to each form, then opening the envelope
/images/mongodb-aggregation-indexing/lookup-unwind.svg
:::

::: text 🪜 Step by step
`orders.aggregate([{ $match: { status: 'PAID' } }, { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'customer' } }, { $unwind: '$customer' }])`:
1. `$match` selects PAID orders (index on `status`).
2. For **each** order, `$lookup` runs a query on `users` where `_id` equals the order's `userId` (an index seek, `_id` is always indexed).
3. Matches are put into the `customer` array: `[ { name, email } ]`.
4. `$unwind` emits one document per array element: `customer` becomes an object.
5. Orders whose user was deleted have `customer: []` and are **dropped** by `$unwind` unless `preserveNullAndEmptyArrays: true`.
6. A following `$project` keeps just `total` and `customer.name`.
:::

::: code javascript Join practice with seed data (mongosh: run with mongosh --file joins.js)
// How to run: mongosh "mongodb://localhost:27017" --file joins.js
db = db.getSiblingDB('shop_joins');
db.users.drop(); db.orders.drop(); db.products.drop();
db.users.insertMany([
  { _id: 1, name: 'Vivek', email: 'v@x.com', isActive: true },
  { _id: 2, name: 'Asha', email: 'a@x.com', isActive: true },
  { _id: 3, name: 'Rahul', email: 'r@x.com', isActive: true },
]);
db.products.insertMany([{ _id: 'A', name: 'Mug' }, { _id: 'B', name: 'Pen' }]);
db.orders.insertMany([
  { _id: 101, userId: 1, status: 'PAID', total: 700, createdAt: new Date('2026-09-01'), items: [{ productId: 'A', qty: 2 }, { productId: 'B', qty: 1 }] },
  { _id: 102, userId: 2, status: 'PAID', total: 500, createdAt: new Date('2026-09-02'), items: [{ productId: 'A', qty: 5 }] },
  { _id: 103, userId: 1, status: 'PENDING', total: 90, createdAt: new Date('2026-09-03'), items: [{ productId: 'C', qty: 1 }] },
  { _id: 104, userId: 99, status: 'PAID', total: 50, createdAt: new Date('2026-09-04'), items: [] },
]);
db.orders.createIndex({ userId: 1, createdAt: -1 });           // supports the lookups from users

print('orders with customer name (inner join via $unwind):');
printjson(db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'customer' } },
  { $unwind: '$customer' },
  { $project: { _id: 1, total: 1, name: '$customer.name' } },
]).toArray());

print('same, keeping orders whose user is gone (left join):');
print(db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'customer' } },
  { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
]).toArray().map((o) => `${o._id}:${o.customer ? o.customer.name : '(deleted user)'}`).join(', '));

print('users with their latest order (pipeline lookup):');
printjson(db.users.aggregate([
  { $lookup: { from: 'orders', let: { uid: '$_id' }, pipeline: [
    { $match: { $expr: { $eq: ['$userId', '$$uid'] } } }, { $sort: { createdAt: -1 } }, { $limit: 1 }, { $project: { _id: 1, total: 1 } },
  ], as: 'latest' } },
  { $project: { _id: 0, name: 1, latest: { $first: '$latest._id' } } },
]).toArray());

print('users who never ordered (anti-join):', db.users.aggregate([
  { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
  { $match: { orders: { $size: 0 } } },
]).toArray().map((u) => u.name).join(', '));

print('best sellers (unwind items → group → join names):');
printjson(db.orders.aggregate([
  { $unwind: '$items' },
  { $group: { _id: '$items.productId', unitsSold: { $sum: '$items.qty' } } },
  { $sort: { unitsSold: -1, _id: 1 } },
  { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
  { $project: { unitsSold: 1, name: { $ifNull: [{ $first: '$product.name' }, 'unknown product'] } } },
]).toArray());
:::

::: code javascript Browser demo: $lookup + $unwind on arrays, counting lookups with and without an index (runnable)
const users = [{ _id: 1, name: 'Vivek' }, { _id: 2, name: 'Asha' }, { _id: 3, name: 'Rahul' }];
const orders = [
  { _id: 101, userId: 1, items: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }] },
  { _id: 102, userId: 2, items: [{ sku: 'A', qty: 5 }] },
  { _id: 103, userId: 99, items: [] },
];

let scanned = 0;
const lookupScan = (docs, from, localField, foreignField, as) =>
  docs.map((d) => ({ ...d, [as]: from.filter((f) => { scanned += 1; return f[foreignField] === d[localField]; }) }));
const unwind = (docs, field, preserve = false) =>
  docs.flatMap((d) => (d[field]?.length ? d[field].map((v) => ({ ...d, [field]: v })) : preserve ? [{ ...d, [field]: null }] : []));

const inner = unwind(lookupScan(orders, users, 'userId', '_id', 'user'), 'user');
console.log(inner.map((o) => `${o._id} → ${o.user.name}`).join(', '));
console.log('$unwind drops the order with a deleted user (inner join)', inner.length === 2 ? '✅' : '❌ FAIL');
const left = unwind(lookupScan(orders, users, 'userId', '_id', 'user'), 'user', true);
console.log('preserveNullAndEmptyArrays keeps it (left join)', left.length === 3 && left[2].user === null ? '✅' : '❌ FAIL');
console.log('without an index every order scanned every user:', scanned, scanned === 18 ? '✅' : '❌ FAIL');

const index = new Map(users.map((u) => [u._id, u]));                    // like an index on users._id
let seeks = 0;
const indexed = orders.map((o) => { seeks += 1; return { ...o, user: index.get(o.userId) ? [index.get(o.userId)] : [] }; });
console.log('with an index: one seek per order', seeks === 3 && indexed[0].user[0].name === 'Vivek' ? '✅' : '❌ FAIL');
const perItem = unwind(orders, 'items');
console.log('unwinding items gives one row per line item', perItem.length === 3 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No index on `foreignField` (seconds instead of milliseconds as data grows).
- Forgetting the result is an **array** (`order.user.name` is undefined until you `$unwind` or `$first`).
- `$unwind` silently dropping documents with no match.
- `$lookup` on every request for data that could be embedded as an extended reference.
- `$lookup` before `$match`/`$limit`, joining documents you then throw away.
:::

::: understand
- `$lookup` is a nested-loop join: one lookup per input document, which is why the index on the joined field matters so much.
- `$unwind` is how you "explode" arrays for grouping; `$group` with `$push` reverses it.
- Mongoose `populate()` does an extra `$in` query from the app; `$lookup` runs inside the database.
:::

::: ask
- *"How often does this join run and on how many documents?"*
- *"Should orders with deleted users still appear?"* → preserve or not.
- *"Could the few fields we need be copied into the document?"*
:::

::: important ⭐ Say this in the interview
"$lookup is a left outer join to another collection in the same database: the simple form matches localField to foreignField, and the pipeline form lets me filter, sort, limit and project the joined documents. The result is always an array, so I $unwind it, or take $first, and I remember $unwind drops documents without matches unless I set preserveNullAndEmptyArrays. It runs one lookup per input document, so the foreignField must be indexed: joining fifty users to a million orders took about ten seconds without an index on userId and six milliseconds with it. I $match and $limit before the join, and if the same join runs on every page view, I'd rather embed the few fields I need."
:::

::: links
MongoDB: $lookup | https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/
MongoDB: $unwind | https://www.mongodb.com/docs/manual/reference/operator/aggregation/unwind/
Mongoose: populate | https://mongoosejs.com/docs/populate.html
:::

=== What is an index and why does it improve query performance?
@p 3
@tags indexes, performance, b-tree
@quick
- An index is a **sorted B-tree** of field values, each pointing to its document, like the index at the back of a book.
- No index → **COLLSCAN** (read every document, O(n)); with one → **IXSCAN** (O(log n) seek, then FETCH only the matches).
- Also serves **sorts** (no in-memory SORT) and **covered queries** (answer from the index alone, no FETCH).
- `_id` is indexed automatically; `createIndex({ email: 1 }, { unique: true })` also enforces uniqueness.
- Measured (1M orders): find by email **197 ms / 1,000,000 docs examined** without an index vs **0.8 ms / 1 doc** with it.

::: text 🧒 In simple words
Finding "Asha" in a 1,000-page book with no index means **reading every page** until you find her. The index at the back is a list of names **in alphabetical order** with page numbers: you jump to "A", find "Asha → page 742", and open exactly that page. A database index is the same thing for one or more fields: a sorted list of values pointing to where each document lives. Because it's sorted, the database can also hand you results already in order, and sometimes it can answer straight from the index without opening the book at all.
:::

::: text 📖 Detailed answer
An **index** is a separate **B-tree** that stores the values of one or more fields **in sorted order**, each entry pointing to a document's location (a record id).

### Without vs with an index (measured, MongoDB 7, 1,000,000 orders)
| | Plan | Docs examined | Keys examined | Time |
|---|---|---|---|---|
| `find({ email })` no index | COLLSCAN | 1,000,000 | 0 | **197 ms** |
| `find({ email })` index on email | IXSCAN → FETCH | 1 | 1 | **0.8 ms** |

A B-tree with a million keys is only a few levels deep, so the seek touches a handful of pages; the collection scan reads all 143 MB of documents.

### What else indexes give you
| Benefit | How |
|---|---|
| **Sorted results** | Walk the index in order → no in-memory SORT (which is limited to 100 MB before spilling) |
| **Covered queries** | Filter + projection use only indexed fields (and exclude `_id`) → `PROJECTION_COVERED`, no documents read |
| **Uniqueness** | `unique: true` rejects duplicates atomically, even under concurrency |
| **Range queries** | `$gt/$lt` become a contiguous slice of the B-tree |
| **Expiry** | TTL indexes delete old documents automatically |

### Index types (overview)
Single field, **compound**, multikey (arrays, automatic), text, 2dsphere (geo), hashed (sharding), wildcard, plus options: unique, partial, sparse, TTL, collation.
:::

::: diagram Without vs with index
flowchart TB
  subgraph NO["No index"]
    Q1["find email = o987654@x.com"] --> CS["COLLSCAN: read 1,000,000 docs"] --> R1["1 match in 197 ms"]
  end
  subgraph YES["Index on email"]
    Q2["find email = o987654@x.com"] --> IX["IXSCAN: B-tree seek"] --> F["FETCH 1 doc"] --> R2["1 match in 0.8 ms"]
  end
:::

::: chart bar Measured: find one order by email among 1,000,000 (ms)
Plan,Milliseconds
COLLSCAN (no index),197
IXSCAN (index on email),0.8
:::

::: image The index at the back of a book: sorted names with page numbers
/images/mongodb-aggregation-indexing/index-btree.svg
:::

::: text 🪜 Step by step
How `find({ email: 'o987654@x.com' })` uses the index `{ email: 1 }`:
1. The query planner sees an index whose first field is in the filter → candidate plan IXSCAN.
2. It reads the B-tree **root** page and compares the email to the separator keys to pick a child page.
3. It repeats down a few levels (each level narrows the range ~hundreds of times).
4. At the **leaf**, it finds the key `o987654@x.com` with its record id.
5. FETCH reads that one document from the collection and applies any remaining filters.
6. With projection `{ email: 1, _id: 0 }`, step 5 is skipped entirely: a **covered query**.
:::

::: code javascript Create an index and prove it with explain (mongosh: run with mongosh --file index-proof.js)
// How to run: mongosh "mongodb://localhost:27017" --file index-proof.js   (seeds 100,000 docs, ~2 s)
db = db.getSiblingDB('perf_index');
db.users.drop();
const docs = [];
for (let i = 0; i < 100000; i++) docs.push({ email: `user${i}@x.com`, age: i % 80, city: ['Delhi', 'Pune', 'Mumbai'][i % 3] });
db.users.insertMany(docs);

const summary = (explain) => {
  const s = explain.executionStats;
  const stages = JSON.stringify(explain.queryPlanner.winningPlan).match(/"stage":"(\w+)"/g).map((x) => x.slice(9, -1)).join(' ← ');
  return `${stages} | keys ${s.totalKeysExamined} | docs ${s.totalDocsExamined} | returned ${s.nReturned}`;
};

print('before:', summary(db.users.find({ email: 'user75000@x.com' }).explain('executionStats')));
db.users.createIndex({ email: 1 }, { unique: true });
print('after: ', summary(db.users.find({ email: 'user75000@x.com' }).explain('executionStats')));
print('covered:', summary(db.users.find({ email: 'user75000@x.com' }, { email: 1, _id: 0 }).explain('executionStats')));

try { db.users.insertOne({ email: 'user1@x.com' }); } catch (e) { print('unique index rejects duplicates: error', e.code, '(E11000 duplicate key)'); }
print('indexes:', db.users.getIndexes().map((i) => i.name).join(', '));
:::

::: code javascript Browser demo: linear scan vs binary search on a sorted "index" (runnable)
const N = 1_000_000;
const emails = Array.from({ length: N }, (_, i) => `user${String(i).padStart(7, '0')}@x.com`);   // sorted = the index

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
    if (emails[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return steps;
}
const target = 'user0987654@x.com';
let t = performance.now(); const scanned = collScan(target); const scanMs = performance.now() - t;
t = performance.now(); const steps = indexSeek(target); const seekMs = performance.now() - t;
console.log(`scan examined ${scanned.toLocaleString()} entries in ${scanMs.toFixed(2)} ms; seek took ${steps} steps in ${seekMs.toFixed(3)} ms`);
console.log('scan examines almost everything', scanned === 987655 ? '✅' : '❌ FAIL');
console.log('binary search needs about log2(1M) ≈ 20 steps', steps <= 20 ? '✅' : '❌ FAIL');
console.log('the index seek is faster', seekMs < scanMs ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Assuming MongoDB indexes fields automatically (only `_id` is).
- Indexing a field but querying with a different shape (case-insensitive regex, `$ne`, a function on the field) that can't use it.
- Sorting on a field that isn't in the index → in-memory SORT on big results.
- Testing on 100 documents and declaring the query "fast".
:::

::: understand
- Indexes turn O(n) scans into O(log n) seeks plus O(matches) fetches.
- An index is a **sorted copy** of some fields: that's why it helps both filtering and sorting, and why it costs memory and writes (next question).
- `explain('executionStats')` is the proof: `totalDocsExamined` should be close to `nReturned`.
:::

::: ask
- *"Which queries run most often, with which filters and sorts?"*
- *"How big is the collection now, and in a year?"*
- *"Read/write ratio?"* (indexes speed reads, slow writes).
:::

::: important ⭐ Say this in the interview
"An index is a sorted B-tree of field values pointing to documents, like the index of a book. Without one MongoDB does a collection scan and reads every document; with one it seeks through a few B-tree levels and fetches only the matches. On a million orders, finding one by email took about 197 milliseconds examining a million documents without an index, and under a millisecond examining one document with it. Because the index is sorted it also avoids in-memory sorts, it can answer covered queries without reading documents, and a unique index enforces uniqueness. I prove it with explain executionStats: IXSCAN instead of COLLSCAN, and documents examined close to documents returned."
:::

::: links
MongoDB: Indexes | https://www.mongodb.com/docs/manual/indexes/
MongoDB: Explain results | https://www.mongodb.com/docs/manual/reference/explain-results/
MongoDB: Covered queries | https://www.mongodb.com/docs/manual/core/query-optimization/#covered-query
:::

=== What are the downsides of indexes?
@p 3
@tags indexes, trade-offs
@quick
- **Slower writes**: every insert, delete and update of an indexed field also updates **every** index on the collection.
- Measured (100k inserts, batches of 1,000): **242k docs/s with 1 index → 80k docs/s with 8 indexes**.
- **RAM and disk**: indexes compete for the WiredTiger cache; on 1M orders, 6 indexes took **70 MB** next to 143 MB of data.
- Unused, redundant (`{a}` when `{a, b}` exists) or low-selectivity indexes (`isActive` alone) cost without helping.
- Hygiene: `$indexStats` for usage, `hideIndex` before dropping, **partial** and **TTL** indexes, build big indexes off-peak.

::: text 🧒 In simple words
Every index is an **extra filing list** someone must keep up to date. A library with one catalogue (by title) is quick to stock: each new book goes on the shelf and gets one catalogue card. Add catalogues by author, by year, by colour, by publisher… and every new book now needs five cards filed in five places. Finding books gets faster, but **shelving gets slower**, the catalogues take up room, and a catalogue nobody ever uses is pure waste.
:::

::: text 📖 Detailed answer
Indexes aren't free; each one is an extra B-tree MongoDB must maintain and keep in memory.

| Cost | Why |
|---|---|
| **Write amplification** | An insert into a collection with 8 indexes = 1 document write + 8 index inserts. Updates touching indexed fields update those indexes too. |
| **RAM** | The **working set** (hot documents + indexes) should fit in the WiredTiger cache; otherwise reads hit disk and latency jumps. |
| **Disk** | Indexes can approach the data size (strings, compound keys, multikey arrays). |
| **Planner overhead** | Overlapping indexes → more candidate plans to trial; occasionally a poor plan wins. |
| **Build cost** | Building on 100M documents takes long and uses I/O (builds no longer lock the collection, but still compete for resources). |

### Measured: insert throughput vs number of indexes (MongoDB 7, 100,000 docs in batches of 1,000)
| Indexes (incl. `_id`) | Time | Docs/s |
|---|---|---|
| 1 | 413 ms | 242,000 |
| 3 | 642 ms | 156,000 |
| 5 | 882 ms | 113,000 |
| 8 | 1,252 ms | 80,000 |

### Measured: index sizes on 1,000,000 orders (data 143 MB)
| Index | Size |
|---|---|
| `_id` | 9.8 MB |
| `email` (unique strings) | 18.0 MB |
| `status, total, createdAt` | 17.4 MB |
| `status, createdAt, total` | 13.7 MB |
| `userId` | 6.1 MB |
| `status` | 5.1 MB |

### Hygiene
| Task | Command |
|---|---|
| Find unused indexes | `$indexStats` → `accesses.ops` since the last restart |
| Test dropping safely | `hideIndex(name)` → watch latency → `dropIndex` or `unhideIndex` |
| Remove redundant prefixes | `{ a: 1 }` is redundant when `{ a: 1, b: 1 }` exists |
| Index only what matters | **Partial** index: `partialFilterExpression: { isDeleted: false }` |
| Auto-expire data | **TTL** index: `expireAfterSeconds` |
:::

::: diagram One insert, many index updates
flowchart LR
  I["insertOne(order)"] --> D[("collection: write document")]
  I --> X1["_id index"]
  I --> X2["userId index"]
  I --> X3["status, createdAt index"]
  I --> X4["email unique index"]
  I --> X5["… every other index"]
:::

::: chart line Measured: insert throughput vs number of indexes (thousand docs per second)
Indexes,Thousand docs per second
1,242
3,156
5,113
8,80
:::

::: image Every extra catalogue makes searching faster and shelving slower
/images/mongodb-aggregation-indexing/index-costs.svg
:::

::: text 🪜 Step by step
What happens on `insertOne({ userId: 7, status: 'PAID', total: 900, email: 'o1@x.com' })` with 5 indexes:
1. WiredTiger writes the document into the collection's B-tree.
2. For each index, MongoDB builds the key (e.g. `{ status: 'PAID', createdAt: … }`) and inserts it into that index's B-tree.
3. The unique index on `email` first checks the key doesn't exist; if it does, the whole insert fails with E11000.
4. All of this happens inside one storage-engine transaction, so the document and its index entries appear together.
5. The journal records the changes; with `w: 'majority'`, the write also waits for replication.
6. More indexes = more B-tree inserts in steps 2–3 = fewer inserts per second.
:::

::: code javascript Index hygiene with real output (mongosh: run with mongosh --file index-hygiene.js)
// How to run: mongosh "mongodb://localhost:27017" --file index-hygiene.js
db = db.getSiblingDB('perf_hygiene');
db.orders.drop(); db.sessions.drop(); db.products.drop();
db.orders.insertMany(Array.from({ length: 20000 }, (_, i) => ({ userId: i % 500, status: ['PAID', 'PENDING'][i % 2], total: i % 5000, createdAt: new Date(Date.now() - i * 60000) })));
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ status: 1, createdAt: -1 });        // makes { status: 1 } redundant (prefix)
db.orders.createIndex({ userId: 1 });

db.orders.find({ userId: 42 }).toArray();
db.orders.find({ status: 'PAID' }).sort({ createdAt: -1 }).limit(5).toArray();

print('index usage since startup:');
db.orders.aggregate([{ $indexStats: {} }, { $project: { _id: 0, name: 1, ops: '$accesses.ops' } }, { $sort: { name: 1 } }]).forEach((s) => print(`  ${s.name}: ${s.ops} ops`));
print('index sizes (bytes):', JSON.stringify(db.orders.stats().indexSizes));

db.orders.hideIndex('status_1');                             // planner ignores it, index still maintained
print('status_1 hidden:', db.orders.getIndexes().find((i) => i.name === 'status_1').hidden === true);
print('query still uses:', db.orders.find({ status: 'PAID' }).explain().queryPlanner.winningPlan.inputStage.indexName);
db.orders.dropIndex('status_1');

db.products.createIndex({ category: 1, price: 1 }, { partialFilterExpression: { isDeleted: false } });
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });   // deleted ~24 h after createdAt
print('final indexes:', db.orders.getIndexes().map((i) => i.name).join(', '), '| ttl:', db.sessions.getIndexes()[1].expireAfterSeconds, 's');
:::

::: code javascript Browser demo: a write-cost model from the measured numbers (runnable)
// Measured: ~4.1 µs per document with 1 index, each extra index adds roughly 1.2 µs.
const perDocMicros = (indexes) => 4.13 + (indexes - 1) * 1.2;
const throughput = (indexes) => Math.round(1e6 / perDocMicros(indexes));
for (const k of [1, 3, 5, 8]) console.log(`${k} indexes → ~${throughput(k).toLocaleString()} inserts/s`);
console.log('model matches the measured 8-index rate (≈80k/s ±10%)', Math.abs(throughput(8) - 80000) / 80000 < 0.1 ? '✅' : '❌ FAIL');

function redundant(indexes) {
  const keys = indexes.map((ix) => Object.keys(ix).join(','));
  return keys.filter((k, i) => keys.some((other, j) => j !== i && other.startsWith(`${k},`)));
}
const found = redundant([{ status: 1 }, { status: 1, createdAt: -1 }, { userId: 1 }]);
console.log('redundant prefix index detected:', found.join(' '), found.length === 1 && found[0] === 'status' ? '✅' : '❌ FAIL');
const ttlExpired = (createdAt, seconds, now) => now - createdAt >= seconds * 1000;
console.log('TTL: a 25-hour-old session is expired', ttlExpired(Date.now() - 25 * 3600e3, 86400, Date.now()) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Adding an index for every field "just in case" on write-heavy collections (logs, events, IoT).
- Keeping `{ a: 1 }` next to `{ a: 1, b: 1 }`.
- Dropping an index in production without first hiding it and watching latency.
- Indexing low-selectivity booleans alone (`isActive`) instead of using them as a partial-index filter or an equality prefix.
- Building a large index at peak traffic.
:::

::: understand
- Indexes trade **write speed, RAM and disk** for **read speed**: worth it only for queries that actually run.
- The working set (hot data + indexes) fitting in RAM matters more than any single index.
- Partial and TTL indexes keep indexes small by indexing or keeping only what matters.
:::

::: ask
- *"Write-heavy or read-heavy collection? What insert rate do we need?"*
- *"How much RAM does the cluster have vs the total index size?"*
- *"Which indexes have zero usage in `$indexStats`?"*
:::

::: important ⭐ Say this in the interview
"Indexes make reads fast but aren't free. Every insert and delete, and every update of an indexed field, must update each index, so writes slow down: in a test, 100,000 inserts ran at about 240,000 per second with one index and 80,000 with eight. Indexes also take RAM and disk, and the working set should fit in the WiredTiger cache, otherwise reads go to disk. Unused or redundant indexes are pure cost, so I check $indexStats, hide an index before dropping it, remove prefixes covered by a compound index, and use partial and TTL indexes to keep them small. For write-heavy collections I keep indexes to the minimum the queries need."
:::

::: links
MongoDB: Indexing strategies | https://www.mongodb.com/docs/manual/applications/indexes/
MongoDB: $indexStats | https://www.mongodb.com/docs/manual/reference/operator/aggregation/indexStats/
MongoDB: Hidden indexes | https://www.mongodb.com/docs/manual/core/index-hidden/
MongoDB: Partial indexes | https://www.mongodb.com/docs/manual/core/index-partial/
:::

=== How would you decide which fields to index? (compound indexes, ESR rule, cardinality)
@p 3
@tags indexes, compound, esr, cardinality
@quick
- Start from **real query patterns** (profiler, slow-query log, Atlas Performance Advisor), not from the schema.
- Compound order: **E**quality → **S**ort → **R**ange (ESR). Measured: `{ status, createdAt, total }` examined **74 keys in 0.9 ms**; `{ status, total, createdAt }` examined **50,000 keys + an in-memory sort in 18 ms**.
- **Prefix rule**: `{ a, b, c }` serves `a`, `a+b`, `a+b+c`, not `b` alone.
- Prefer **selective** (high-cardinality) fields; low-cardinality fields work as equality prefixes or partial-index filters.
- Unique, text, TTL, partial, geo and wildcard indexes solve specific needs; verify every index with `explain`.

::: text 🧒 In simple words
Imagine a **phone book** sorted by city, then surname, then first name. Finding "Sharma in Delhi" is instant: jump to Delhi, then to Sharma. Finding everyone named "Rahul" anywhere is hopeless: the book isn't sorted by first name first. That's the **prefix rule**. The **ESR rule** is about order: put the exact things first ("city = Delhi"), then the thing you want results **sorted by**, and last the "between X and Y" conditions; then the database can read the answers off the page already in the right order.
:::

::: text 📖 Detailed answer
### Process
1. **Collect query patterns**: profiler (`db.setProfilingLevel(1, { slowms: 100 })`), slow-query logs, Atlas Performance Advisor, and the API endpoints.
2. For each important query list its **equality** filters, **sort**, and **range** filters.
3. Build a compound index with **ESR**:
   - **E**quality fields first (`status: 'PAID'`, `userId: X`).
   - **S**ort fields next (`createdAt: -1`).
   - **R**ange fields last (`total: { $gte: 4000 }`, `$in` with many values, regex).
4. Reuse: one compound index serves several queries through its **prefixes**.
5. Verify with `explain('executionStats')`: `totalKeysExamined ≈ nReturned`, no `SORT` stage.

### Measured: `find({ status: 'PAID', total: { $gte: 4000 } }).sort({ createdAt: -1 }).limit(20)` on 1M orders
| Index | Keys examined | Docs examined | In-memory sort | Time |
|---|---|---|---|---|
| none (COLLSCAN) | 0 | 1,000,000 | yes | 300 ms |
| `{ status: 1 }` | 250,000 | 250,000 | yes | 130 ms |
| `{ status: 1, total: 1, createdAt: -1 }` (E-R-S) | 50,000 | 20 | **yes** | 18 ms |
| `{ status: 1, createdAt: -1, total: 1 }` (**E-S-R**) | **74** | **20** | **no** | **0.9 ms** |

With E-S-R, MongoDB walks PAID orders **newest first**, checks `total` inside the index, and stops after 20 matches. With E-R-S it must collect every PAID order with `total ≥ 4000` and sort them in memory.

### Cardinality and selectivity
- **Cardinality** = number of distinct values (`email`: millions; `isActive`: 2).
- Selective fields make great leading keys; low-cardinality fields are fine as **equality prefixes** used by every query, or as a **partial** filter.

### Index types
| Type | Example | Use |
|---|---|---|
| Compound | `{ userId: 1, createdAt: -1 }` | Filter + sort |
| Unique | `{ email: 1 }, { unique: true }` | No duplicates (with collation for case-insensitive) |
| Multikey | `{ tags: 1 }` | Arrays (automatic) |
| Text | `{ title: 'text', body: 'text' }` | Keyword search (`$text`) |
| TTL | `{ createdAt: 1 }, { expireAfterSeconds }` | Expiring data |
| Partial | `partialFilterExpression` | Index a subset |
| 2dsphere | `{ location: '2dsphere' }` | Near-me queries |
| Wildcard | `{ 'attributes.$**': 1 }` | Dynamic attribute keys |
:::

::: diagram ESR for: status PAID, total >= 4000, sort createdAt desc
flowchart LR
  E["E: status (equality)"] --> S["S: createdAt (sort)"] --> R["R: total (range)"] --> IDX["index: status 1, createdAt -1, total 1"]
  IDX --> OUT["walk newest PAID first, check total in the index, stop at 20"]
:::

::: chart bar Measured: same query, different indexes (ms, 1M orders)
Index,Milliseconds
None (COLLSCAN),300
status only,130
status-total-createdAt (E-R-S),18
status-createdAt-total (E-S-R),0.9
:::

::: image A phone book sorted city → surname → first name: the prefix and ESR rules
/images/mongodb-aggregation-indexing/esr.svg
:::

::: text 🪜 Step by step
Designing indexes for `GET /users/:id/orders?status=PAID&minTotal=500` (newest first, 20 per page):
1. Equality: `userId`, `status` → first two keys.
2. Sort: `createdAt: -1` → third key.
3. Range: `total ≥ 500` → last key. Index: `{ userId: 1, status: 1, createdAt: -1, total: 1 }`.
4. Check prefixes: the same index also serves "all orders of a user" (`userId` alone) and "a user's PAID orders" without the range.
5. `explain('executionStats')`: IXSCAN, no SORT, keys examined close to 20.
6. Declare it in the Mongoose schema and create it in a deploy step (`syncIndexes`), not at app startup in production.
:::

::: code javascript Compare index orders with explain (mongosh: run with mongosh --file esr.js)
// How to run: mongosh "mongodb://localhost:27017" --file esr.js   (seeds 200,000 orders, a few seconds)
db = db.getSiblingDB('perf_esr');
db.orders.drop();
const statuses = ['PAID', 'PENDING', 'CANCELLED', 'SHIPPED'];
for (let b = 0; b < 200000; b += 50000) {
  db.orders.insertMany(Array.from({ length: 50000 }, (_, j) => { const i = b + j; return { userId: i % 2000, status: statuses[i % 4], total: (i * 37) % 5000, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000) }; }));
}
db.orders.createIndex({ status: 1, total: 1, createdAt: -1 }, { name: 'E_R_S' });
db.orders.createIndex({ status: 1, createdAt: -1, total: 1 }, { name: 'E_S_R' });

const query = () => db.orders.find({ status: 'PAID', total: { $gte: 4000 } }).sort({ createdAt: -1 }).limit(20);
for (const name of ['E_R_S', 'E_S_R']) {
  const ex = query().hint(name).explain('executionStats');
  const s = ex.executionStats;
  const sorts = JSON.stringify(ex.queryPlanner.winningPlan).includes('"SORT"');
  print(`${name}: keys ${s.totalKeysExamined}, docs ${s.totalDocsExamined}, returned ${s.nReturned}, in-memory sort ${sorts}, ${s.executionTimeMillis} ms`);
}
print('planner picks on its own:', query().explain().queryPlanner.winningPlan.inputStage.inputStage?.indexName ?? query().explain().queryPlanner.winningPlan.inputStage.indexName);

// Prefix rule: { status, createdAt, total } also serves status-only queries, but not createdAt alone
print('status only →', JSON.stringify(db.orders.find({ status: 'SHIPPED' }).hint('E_S_R').explain().queryPlanner.winningPlan).includes('IXSCAN') ? 'IXSCAN' : 'COLLSCAN');
print('createdAt only →', db.orders.find({ createdAt: { $gte: new Date('2026-03-01') } }).explain().queryPlanner.winningPlan.stage);

// Case-insensitive unique email and a weighted text index
db.users.drop();
db.users.createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
db.users.insertOne({ email: 'Asha@x.com' });
try { db.users.insertOne({ email: 'asha@X.com' }); } catch (e) { print('case-insensitive duplicate rejected:', e.code); }
db.products.drop();
db.products.createIndex({ name: 'text', description: 'text' }, { weights: { name: 10, description: 2 } });
db.products.insertMany([{ name: 'Wireless headphones', description: 'Bluetooth' }, { name: 'Cable', description: 'for wireless chargers' }]);
print('text search ranks name matches first:', db.products.find({ $text: { $search: 'wireless' } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).toArray().map((p) => p.name).join(' > '));
:::

::: code javascript Mongoose: declare indexes in the schema, sync them in a deploy step (node order-indexes.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node order-indexes.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED'], default: 'PENDING' },
  total: Number,
  couponCode: String,
}, { timestamps: true, autoIndex: false });                       // don't build indexes on app start in production

orderSchema.index({ userId: 1, status: 1, createdAt: -1, total: 1 });   // E, E, S, R
orderSchema.index({ status: 1, createdAt: -1, total: 1 });              // admin list: E, S, R
orderSchema.index({ couponCode: 1 }, { unique: true, partialFilterExpression: { couponCode: { $type: 'string' } } });  // unique only when present

const Order = mongoose.model('IndexedOrder', orderSchema);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Order.collection.drop().catch(() => {});
  await Order.createCollection();
  const dropped = await Order.syncIndexes();                       // run this in a migration / deploy script
  console.log('indexes:', (await Order.listIndexes()).map((i) => i.name).join(' | '), '| dropped:', dropped.length);
  const uid = new mongoose.Types.ObjectId();
  await Order.create([{ userId: uid, status: 'PAID', total: 900 }, { userId: uid, status: 'PAID', total: 100 }, { userId: uid, status: 'PENDING', total: 50 }]);
  const plan = await Order.find({ userId: uid, status: 'PAID', total: { $gte: 500 } }).sort({ createdAt: -1 }).explain('executionStats');
  const stats = plan.executionStats;
  console.log('IXSCAN used:', JSON.stringify(plan.queryPlanner.winningPlan).includes('IXSCAN'), '| in-memory SORT:', JSON.stringify(plan.queryPlanner.winningPlan).includes('"SORT"'), '| returned', stats.nReturned);
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: count keys examined for E-S-R vs E-R-S (runnable)
// Build two sorted "indexes" over 100,000 fake orders and run the same query against each.
const statuses = ['PAID', 'PENDING', 'CANCELLED', 'SHIPPED'];
const rows = Array.from({ length: 100000 }, (_, i) => ({ id: i, status: statuses[i % 4], total: (i * 37) % 5000, createdAt: i }));
const cmp = (fields) => (a, b) => { for (const [f, dir] of fields) { if (a[f] !== b[f]) return (a[f] < b[f] ? -1 : 1) * dir; } return 0; };
const ESR = [...rows].sort(cmp([['status', 1], ['createdAt', -1], ['total', 1]]));
const ERS = [...rows].sort(cmp([['status', 1], ['total', 1], ['createdAt', -1]]));

function runESR() {                // walk PAID newest-first, filter total inside the index, stop at 20
  let keys = 0; const out = [];
  for (const r of ESR) { if (r.status !== 'PAID') continue; keys++; if (r.total >= 4000) out.push(r); if (out.length === 20) break; }
  return { keys, out };
}
function runERS() {                // collect every PAID with total >= 4000, then sort in memory
  let keys = 0; const hits = [];
  for (const r of ERS) { if (r.status !== 'PAID' || r.total < 4000) continue; keys++; hits.push(r); }
  return { keys, out: hits.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20) };
}
const a = runESR(), b = runERS();
console.log(`E-S-R examined ${a.keys} keys, E-R-S examined ${b.keys} keys (+ an in-memory sort)`);
console.log('both return the same 20 orders', JSON.stringify(a.out.map((r) => r.id)) === JSON.stringify(b.out.map((r) => r.id)) ? '✅' : '❌ FAIL');
console.log('E-S-R examines far fewer keys', a.keys * 10 < b.keys ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Range field before the sort field (E-R-S) → in-memory SORT and many keys examined.
- Creating one single-field index per field and hoping MongoDB combines them (index intersection is rarely chosen).
- Leading with a field that queries don't always filter on (breaks the prefix rule).
- `unique: true` in Mongoose treated as a validator (it's an index; it fails with E11000 if duplicates already exist).
- Letting `autoIndex` build big indexes when the app starts in production.
:::

::: understand
- Indexes are designed for **query shapes**: equality + sort + range, in that order.
- One well-designed compound index often replaces several single-field indexes.
- Measure with `explain` on production-sized data; the planner's choice on 100 documents tells you nothing.
:::

::: ask
- *"Can you show me the slowest queries or the profiler output?"*
- *"Which sorts does the UI offer?"* Each sort may need its own index.
- *"Are writes latency-sensitive?"* (limits how many indexes we can afford).
:::

::: important ⭐ Say this in the interview
"I start from the real query patterns, using the profiler or Performance Advisor, and design compound indexes per query shape with the ESR rule: equality fields first, then the sort field, then range fields. On a million orders, a PAID orders with total at least 4,000, newest first, query examined 74 keys in under a millisecond with status, createdAt, total, but 50,000 keys plus an in-memory sort with status, total, createdAt. The prefix rule means one compound index serves several queries. I prefer selective fields, use low-cardinality ones as equality prefixes or partial-index filters, and add unique, TTL, text or partial indexes where needed, verifying each with explain."
:::

::: links
MongoDB: The ESR (Equality, Sort, Range) rule | https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/
MongoDB: Compound indexes | https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/
MongoDB: Text indexes | https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/
Mongoose: Indexes | https://mongoosejs.com/docs/guide.html#indexes
:::

=== How do you read an explain plan?
@p 2
@tags explain, performance, debugging
@quick
- `find(q).sort(s).explain('executionStats')` (or `aggregate(…).explain(…)`; Mongoose: `.explain('executionStats')`).
- Read the **winningPlan** stages bottom-up: **COLLSCAN** ❌, **IXSCAN** ✅ → **FETCH**, in-memory **SORT** ❌, **PROJECTION_COVERED** ✅.
- Compare `nReturned` vs `totalKeysExamined` vs `totalDocsExamined`: ideal ≈ 1 : 1 : 1.
- Measured examples (20 results): COLLSCAN examined **1,000,000** docs; `{status}` index **250,000**; ESR index **74 keys / 20 docs**.
- Find slow queries first with the **profiler** (`setProfilingLevel(1, { slowms: 100 })`) or the slow-query log.

::: text 🧒 In simple words
`explain()` is the database's **receipt for a search**: it tells you which path it took (read every page, or use the index), how many index entries and documents it **looked at**, how many it **gave back**, and how long it took. A good receipt says "looked at 20, returned 20". A bad one says "looked at a million, returned 20": that's your slow query and the clue to which index is missing.
:::

::: text 📖 Detailed answer
`explain()` shows **how** MongoDB runs (or would run) a query.

### Verbosity modes
| Mode | What you get |
|---|---|
| `'queryPlanner'` (default) | The chosen plan and rejected plans, without running the query |
| `'executionStats'` | Runs the winning plan: real counts and time ✅ |
| `'allPlansExecution'` | Also partial stats of rejected plans |

### Stages you'll see (read from the innermost `inputStage` outwards)
| Stage | Meaning |
|---|---|
| `COLLSCAN` | Reads every document ❌ (on big collections) |
| `IXSCAN` | Walks an index (shows `indexName`, `keyPattern`, `indexBounds`) |
| `FETCH` | Loads documents for index entries |
| `SORT` | **In-memory** sort ❌: add the sort field to the index |
| `LIMIT` / `SKIP` | Paging |
| `PROJECTION_COVERED` | Answered from the index only ✅ |
| `EXPRESS_IXSCAN` / `IDHACK` | Fast paths for `_id` or single-key equality lookups |

### The numbers
| Field | Good | Bad |
|---|---|---|
| `totalDocsExamined / nReturned` | ≈ 1 | ≫ 1 (index not selective enough) |
| `totalKeysExamined / nReturned` | ≈ 1 | ≫ 1 (wrong field order, ranges before sort) |
| `executionTimeMillis` | small | large |
| `rejectedPlans` | – | shows alternatives the planner considered |

### Measured on 1M orders (query returns 20)
| Plan | Keys examined | Docs examined |
|---|---|---|
| COLLSCAN | 0 | 1,000,000 |
| IXSCAN `{ status }` + SORT | 250,000 | 250,000 |
| IXSCAN E-R-S + SORT | 50,000 | 20 |
| IXSCAN E-S-R | 74 | 20 |
:::

::: diagram Reading a plan bottom-up
flowchart BT
  IX["IXSCAN status_1_createdAt_-1_total_1: keys 74"] --> F["FETCH: docs 20"] --> L["LIMIT 20"] --> OUT(["nReturned 20, 1 ms"])
:::

::: chart bar Measured: documents examined to return 20 orders (1M orders)
Plan,Documents examined
COLLSCAN,1000000
Index on status + SORT,250000
E-R-S index + SORT,20
E-S-R index,20
:::

::: image The receipt for a search: path taken, entries looked at, results returned
/images/mongodb-aggregation-indexing/explain.svg
:::

::: text 🪜 Step by step
Debugging a slow endpoint with explain:
1. Find the query: profiler (`db.system.profile` where `millis > 100`) or the slow-query log line with `planSummary: COLLSCAN`.
2. Re-run it with `.explain('executionStats')` on production-like data.
3. Read the innermost stage: COLLSCAN? → you need an index. IXSCAN with a SORT above it? → the sort field is missing or in the wrong place.
4. Compare keys/docs examined with `nReturned`: a big ratio means the index isn't selective or the field order is wrong (apply ESR).
5. Create the improved index (hide the old one), run explain again: the ratio should drop to ≈ 1.
6. Keep the profiler at a slow threshold, or use Atlas Query Insights, to catch regressions.
:::

::: code javascript Turn explain output into a one-line verdict (mongosh: run with mongosh --file explain.js)
// How to run: mongosh "mongodb://localhost:27017" --file explain.js
db = db.getSiblingDB('perf_explain');
db.orders.drop();
db.orders.insertMany(Array.from({ length: 50000 }, (_, i) => ({ status: ['PAID', 'PENDING'][i % 2], total: i % 5000, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000) })));

function verdict(cursor) {
  const ex = cursor.explain('executionStats');
  const s = ex.executionStats;
  const stages = [];
  for (let st = ex.queryPlanner.winningPlan; st; st = st.inputStage) stages.push(st.stage + (st.indexName ? `(${st.indexName})` : ''));
  const ratio = s.nReturned ? (Math.max(s.totalKeysExamined, s.totalDocsExamined) / s.nReturned).toFixed(0) : '∞';
  const problems = [];
  if (stages.some((x) => x.startsWith('COLLSCAN'))) problems.push('collection scan');
  if (stages.includes('SORT')) problems.push('in-memory sort');
  if (Number(ratio) > 10) problems.push(`examined ${ratio}× more than returned`);
  return `${stages.reverse().join(' → ')} | keys ${s.totalKeysExamined} docs ${s.totalDocsExamined} returned ${s.nReturned} | ${problems.length ? '❌ ' + problems.join(', ') : '✅ looks good'}`;
}

const q = () => db.orders.find({ status: 'PAID' }).sort({ createdAt: -1 }).limit(20);
print('no index:     ', verdict(q()));
db.orders.createIndex({ status: 1 });
print('status only:  ', verdict(q()));
db.orders.createIndex({ status: 1, createdAt: -1 });
print('status+sort:  ', verdict(q()));
print('covered:      ', verdict(db.orders.find({ status: 'PAID' }, { _id: 0, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(5)));

db.setProfilingLevel(1, { slowms: 0 });                           // capture everything for the demo
db.orders.find({ total: 4999 }).toArray();
const slow = db.system.profile.find({ ns: 'perf_explain.orders', planSummary: 'COLLSCAN' }).sort({ ts: -1 }).limit(1).toArray()[0];
print('profiler caught:', slow.planSummary, 'docsExamined', slow.docsExamined, 'filter', JSON.stringify(slow.command.filter));
db.setProfilingLevel(0);
:::

::: code json Annotated explain output (trimmed, from the E-S-R index)
{
  "queryPlanner": {
    "winningPlan": {
      "stage": "LIMIT",
      "limitAmount": 20,
      "inputStage": {
        "stage": "FETCH",
        "inputStage": {
          "stage": "IXSCAN",
          "indexName": "status_1_createdAt_-1_total_1",
          "indexBounds": {
            "status": ["[\"PAID\", \"PAID\"]"],
            "createdAt": ["[MaxKey, MinKey]"],
            "total": ["[4000, inf.0]"]
          }
        }
      }
    },
    "rejectedPlans": []
  },
  "executionStats": {
    "nReturned": 20,
    "executionTimeMillis": 1,
    "totalKeysExamined": 74,
    "totalDocsExamined": 20
  }
}
:::

::: code javascript Browser demo: grade explain outputs (runnable)
function grade(plan) {
  const stages = [];
  for (let st = plan.queryPlanner.winningPlan; st; st = st.inputStage) stages.push(st.stage);
  const s = plan.executionStats;
  const ratio = Math.max(s.totalKeysExamined, s.totalDocsExamined) / Math.max(s.nReturned, 1);
  if (stages.includes('COLLSCAN')) return 'add an index';
  if (stages.includes('SORT')) return 'put the sort field in the index (ESR)';
  if (ratio > 10) return 'index not selective / wrong order';
  return 'good';
}
const make = (stages, keys, docs, returned) => ({
  queryPlanner: { winningPlan: stages.reduceRight((inner, stage) => ({ stage, inputStage: inner }), undefined) },
  executionStats: { totalKeysExamined: keys, totalDocsExamined: docs, nReturned: returned },
});
console.log('COLLSCAN →', grade(make(['LIMIT', 'SORT', 'COLLSCAN'], 0, 1000000, 20)), grade(make(['LIMIT', 'SORT', 'COLLSCAN'], 0, 1000000, 20)) === 'add an index' ? '✅' : '❌ FAIL');
console.log('status-only index →', grade(make(['LIMIT', 'SORT', 'FETCH', 'IXSCAN'], 250000, 250000, 20)), grade(make(['LIMIT', 'SORT', 'FETCH', 'IXSCAN'], 250000, 250000, 20)).includes('ESR') ? '✅' : '❌ FAIL');
console.log('ESR index →', grade(make(['LIMIT', 'FETCH', 'IXSCAN'], 74, 20, 20)), grade(make(['LIMIT', 'FETCH', 'IXSCAN'], 74, 20, 20)) === 'good' ? '✅' : '❌ FAIL');
console.log('unselective index →', grade(make(['FETCH', 'IXSCAN'], 5000, 5000, 3)), grade(make(['FETCH', 'IXSCAN'], 5000, 5000, 3)).startsWith('index not') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using the default `queryPlanner` mode and missing the real counts (use `executionStats`).
- Reading only `executionTimeMillis` on a tiny dev database.
- Ignoring the `SORT` stage because there's an IXSCAN somewhere in the plan.
- Leaving the profiler at `slowms: 0` in production (overhead and a filling `system.profile`).
:::

::: understand
- explain answers three questions: **which path**, **how much work**, **how much result**.
- The ratio of examined to returned is the single best health number for a query.
- Plans are cached per query shape; after adding an index, re-check that the planner actually picks it.
:::

::: ask
- *"Can I run explain on production-like data?"*
- *"Is the profiler or Atlas Query Profiler enabled, and at which threshold?"*
- *"Which endpoints have the worst p95 latency?"* → their queries first.
:::

::: important ⭐ Say this in the interview
"I run the query with explain executionStats and read the winning plan from the innermost stage: COLLSCAN means no usable index, IXSCAN then FETCH is normal, a SORT stage means an in-memory sort so the sort field belongs in the index, and PROJECTION_COVERED means the index alone answered it. Then I compare nReturned with totalKeysExamined and totalDocsExamined: ideally about one to one. For example, returning 20 orders examined a million documents with no index, 250,000 with an index on status alone, and 74 keys and 20 documents with an ESR compound index. I find the candidates with the profiler or slow-query log, and test on production-sized data."
:::

::: links
MongoDB: Explain results | https://www.mongodb.com/docs/manual/reference/explain-results/
MongoDB: Analyze query performance | https://www.mongodb.com/docs/manual/tutorial/analyze-query-plan/
MongoDB: Database profiler | https://www.mongodb.com/docs/manual/tutorial/manage-the-database-profiler/
:::
