@section MongoDB Fundamentals & CRUD
@icon 🍃
@color #10b981
@desc Documents, BSON, ObjectId, SQL vs NoSQL, embedding vs references, CRUD, operators and query practice, with measured numbers from a real MongoDB 7 instance and scripts you can run in mongosh or Node.

=== SQL vs MongoDB: when would you choose each?
@p 3
@tags sql, nosql, comparison
@quick
- **SQL**: tables with a fixed schema, JOINs, mature multi-table ACID → finance, ERP, heavily relational data, ad-hoc reporting.
- **MongoDB**: collections of JSON-like **documents**, flexible schema, **embed** related data, built-in replication and **sharding** → catalogs, content, profiles, events, fast-changing products.
- MongoDB **does** have multi-document transactions (4.0+), `$lookup` joins and JSON Schema validation; SQL databases have JSON columns too.
- The real decision driver: **access patterns, relationships, consistency needs and team skills**, not hype.
- Mapping: table → collection, row → document, column → field, JOIN → embedding/`$lookup`, primary key → `_id`.

::: text 🧒 In simple words
A SQL database is like a **set of perfectly organised spreadsheets**: customers in one sheet, orders in another, order lines in a third, all linked by id numbers; to see a full order you combine the sheets. MongoDB is like a **folder of complete forms**: each order form already contains the customer's name and every line item, so one glance gives you everything. Spreadsheets shine when data is shared and cross-checked a lot (bank accounts); complete forms shine when you usually read one thing as a whole (a product page, a user profile).
:::

::: text 📖 Detailed answer
| | SQL (PostgreSQL, MySQL) | MongoDB |
|---|---|---|
| Data model | Tables, rows, columns | Collections of **documents** (BSON, JSON-like, nested objects and arrays) |
| Schema | Fixed, enforced by DDL; changes via migrations | **Flexible**; enforced by the app (Mongoose/Zod) and optional `$jsonSchema` validators |
| Relationships | Foreign keys + JOINs | **Embedding** or references + `$lookup` |
| Transactions | Mature multi-row, multi-table ACID | Single-document writes atomic; multi-document ACID since 4.0 (replica set; extra cost) |
| Scaling | Vertical first; read replicas; sharding via extensions | Replica sets + **built-in sharding** |
| Query language | SQL | MQL (JSON filters) + aggregation pipeline |
| Strong at | Integrity, complex joins, ad-hoc analytics | Evolving schemas, hierarchical data, high write volume, known access patterns |

### Terminology
| SQL | MongoDB |
|---|---|
| Database | Database |
| Table | Collection |
| Row | Document |
| Column | Field |
| Primary key | `_id` |
| JOIN | Embedding / `$lookup` |
| GROUP BY | `$group` |
| Index | Index (single, compound, multikey, text, TTL…) |

### How to decide
| Situation | Lean towards |
|---|---|
| Money movements across many accounts, strict constraints | SQL |
| Lots of reports joining many tables in unpredictable ways | SQL (or a warehouse) |
| Product catalog with different attributes per category | MongoDB |
| "Read the whole thing at once" screens (profile, order details, CMS page) | MongoDB |
| Very high write throughput, horizontal scale | MongoDB (or a specialised store) |
| Team knows one of them well and the data fits | The one the team knows |
:::

::: diagram Same order, two models
flowchart LR
  subgraph SQL["SQL: normalised tables"]
    U["users: id, name"] --- O["orders: id, user_id, total"]
    O --- I["order_items: order_id, sku, qty, price"]
  end
  subgraph Mongo["MongoDB: one document"]
    D["order: _id, user: id and name, items: array of sku, qty, price, total"]
  end
:::

::: image Spreadsheets linked by ids (SQL) vs complete forms (MongoDB documents)
/images/mongodb-fundamentals/sql-vs-mongo.svg
:::

::: text 🪜 Step by step
Answering "show order 42 with the customer's name and its items" in each model:
1. **SQL**: the database reads `orders` row 42, uses the `user_id` index to find the user row, uses the `order_id` index to find 3 item rows, and **joins** them into one result set.
2. **MongoDB (embedded)**: the database reads **one document** by `_id`; the user name and items are already inside.
3. **MongoDB (referenced)**: either 3 queries from the app (order → user, items) or one `$lookup` pipeline doing the "join" on the server.
4. **Writing**: in SQL, a new order is inserts into 2 tables inside a transaction; in MongoDB, one document insert, atomic by itself.
5. **Changing the product price later**: SQL updates one `products` row; the embedded order keeps its historical price snapshot, which is what you want for receipts.
:::

::: code javascript Same questions in SQL and MongoDB (mongosh: run with mongosh --file sql-vs-mongo.js)
// How to run: mongosh "mongodb://localhost:27017/shop" --file sql-vs-mongo.js
db = db.getSiblingDB('shop_sql_vs_mongo');
db.users.drop(); db.orders.drop();
db.users.insertMany([
  { _id: 1, name: 'Asha', city: 'Delhi', age: 34, createdAt: new Date('2026-01-10') },
  { _id: 2, name: 'Ben', city: 'Pune', age: 28, createdAt: new Date('2026-02-11') },
  { _id: 3, name: 'Chen', city: 'Delhi', age: 41, createdAt: new Date('2026-03-12') },
]);
db.orders.insertMany([
  { _id: 42, userId: 1, status: 'PAID', total: 900, items: [{ sku: 'MUG', qty: 2, price: 300 }, { sku: 'PEN', qty: 3, price: 100 }] },
  { _id: 43, userId: 3, status: 'PENDING', total: 250, items: [{ sku: 'BAG', qty: 1, price: 250 }] },
]);

// SQL: SELECT name, city FROM users WHERE age > 30 AND city = 'Delhi' ORDER BY created_at DESC LIMIT 10;
printjson(db.users.find({ age: { $gt: 30 }, city: 'Delhi' }, { name: 1, city: 1, _id: 0 }).sort({ createdAt: -1 }).limit(10).toArray());

// SQL: SELECT o.id, o.total, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'PAID';
printjson(db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $unwind: '$user' },
  { $project: { total: 1, 'user.name': 1 } },
]).toArray());

// SQL: SELECT city, COUNT(*) FROM users GROUP BY city;
printjson(db.users.aggregate([{ $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray());
:::

::: code javascript Browser demo: join tables vs read one document (runnable)
// The same order stored relationally and as a document; count the lookups each needs.
const sql = {
  users: [{ id: 1, name: 'Asha' }],
  orders: [{ id: 42, userId: 1, total: 900 }],
  orderItems: [{ orderId: 42, sku: 'MUG', qty: 2 }, { orderId: 42, sku: 'PEN', qty: 3 }],
};
const mongo = { orders: [{ _id: 42, user: { id: 1, name: 'Asha' }, total: 900, items: [{ sku: 'MUG', qty: 2 }, { sku: 'PEN', qty: 3 }] }] };

let sqlLookups = 0;
const lookup = (rows, pred) => { sqlLookups += 1; return rows.filter(pred); };
const order = lookup(sql.orders, (o) => o.id === 42)[0];
const user = lookup(sql.users, (u) => u.id === order.userId)[0];
const items = lookup(sql.orderItems, (i) => i.orderId === 42);
const joined = { id: order.id, userName: user.name, items: items.map((i) => i.sku) };

const doc = mongo.orders.find((o) => o._id === 42);
const fromDoc = { id: doc._id, userName: doc.user.name, items: doc.items.map((i) => i.sku) };

console.log('same answer from both models', JSON.stringify(joined) === JSON.stringify(fromDoc) ? '✅' : '❌ FAIL');
console.log(`relational needed ${sqlLookups} lookups, the document needed 1`, sqlLookups === 3 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- "MongoDB has no schema" → say *flexible schema*, enforced in the app or with JSON Schema.
- "MongoDB has no transactions" → it does; good document design just needs them less often.
- Designing MongoDB like SQL (one collection per table, `$lookup` everywhere) and getting the worst of both.
- Picking MongoDB for heavy ad-hoc relational reporting, or SQL for wildly varying document shapes, without discussing trade-offs.
:::

::: understand
- MongoDB optimises for **reading and writing whole aggregates**; SQL optimises for **combining normalised facts** flexibly.
- Both are general-purpose today; the best choice follows the **access patterns** and the team.
- Many companies use both: SQL for money/ledger, MongoDB for catalog/content/events.
:::

::: ask
- *"What are the main reads and writes? How relational is the data? Do we need ad-hoc reporting?"*
- *"How strict are the consistency requirements across entities?"*
- *"What does the team already run and operate well?"*
:::

::: important ⭐ Say this in the interview
"SQL databases store data in normalised tables with a fixed schema and join them, with mature multi-table transactions, which makes them great for financial data, strict integrity and ad-hoc reporting. MongoDB stores JSON-like documents with a flexible schema, so related data that's read together can live in one document, and it has replication and sharding built in, which suits catalogs, content, user profiles and fast-evolving products. MongoDB does support multi-document transactions and $lookup, and Postgres has JSON columns, so the real decision is about access patterns, relationships, consistency needs and the team's experience. Often I'd keep money in SQL and use MongoDB for document-shaped data."
:::

::: links
MongoDB: SQL to MongoDB mapping chart | https://www.mongodb.com/docs/manual/reference/sql-comparison/
MongoDB: NoSQL vs SQL databases | https://www.mongodb.com/resources/basics/databases/nosql-explained/nosql-vs-sql
PostgreSQL: JSON types | https://www.postgresql.org/docs/current/datatype-json.html
:::

=== Embedded documents vs references: how do you decide?
@p 3
@tags data-modeling, embed, reference
@quick
- **Embed** when data is **read together**, owned by the parent, **bounded** in size and rarely updated on its own (addresses, order items, settings).
- **Reference** when data is **large or unbounded** (1:many-thousands), **shared** (many:many), or updated independently (users ↔ orders, products).
- Hard limit: **16 MB per document**; never let arrays grow without bound.
- **Hybrid** (extended reference): store the id **plus a few fields** you always show (name, price snapshot).
- Measured locally (200 reads): embedded order **0.29 ms**, `$lookup` **0.32 ms**, 3 separate queries **0.47 ms** per order; over a real network each extra round trip adds ~1 ms or more.

::: text 🧒 In simple words
Think of a **passport**. Your photo, name and visa stamps are **inside** the passport because you always need them together and they belong only to you (embed). But you don't glue your **whole bank statement** into it: it grows every day, it's shared with your spouse's account and it changes independently, so the passport just says "account number 123" and the bank keeps the details (reference). The rule of thumb: what you read together and what belongs together goes together; what grows forever or is shared lives separately.
:::

::: text 📖 Detailed answer
### Embedding: `{ _id, name, addresses: [{ city, pin }] }`
| ✅ | ❌ |
|---|---|
| One read gets everything | Document grows; 16 MB limit |
| Atomic update of parent + children | Duplication if the data is shared |
| No joins | Large arrays are slow to update and index |

### Referencing: `orders: { _id, userId }`
| ✅ | ❌ |
|---|---|
| No duplication; unbounded relationships | Extra query or `$lookup` |
| Children updated independently | No single-document atomicity across them |
| Small parent documents | More round trips if you're not careful |

### Decision guide
| Relationship | Recommendation | Example |
|---|---|---|
| 1 : 1 | Embed | user → preferences |
| 1 : few (bounded, < ~100) | Embed | user → addresses |
| 1 : many (hundreds–thousands) | Child stores the parent id | user → orders |
| 1 : squillions (unbounded) | Child stores the parent id; **never** an array in the parent | device → readings, server → logs |
| Many : many | Array of ids on the smaller side, or a join collection | students ↔ courses |
| Historical snapshot needed | Embed a **copy** | name + price in an order line |

### Measured (MongoDB 7 on this machine; 50,000 orders, 3 items each; average per order over 200 reads)
| Model | Time per read |
|---|---|
| Embedded (1 query) | 0.285 ms |
| Referenced with `$lookup` (1 aggregation) | 0.315 ms |
| Referenced with 3 queries from the app | 0.470 ms |
Locally the differences are small; in production each extra **network round trip** (often 0.5–2 ms) multiplies them, and `$lookup` on large result sets costs CPU on the database.
:::

::: diagram Decision flow
flowchart TD
  A{"Read together most of the time?"} -->|"no"| R["Reference"]
  A -->|"yes"| B{"Bounded and small?"}
  B -->|"no, can grow forever"| R
  B -->|"yes"| C{"Shared by many parents or updated on its own?"}
  C -->|"yes"| R2["Reference + copy a few display fields"]
  C -->|"no"| E["Embed"]
:::

::: chart bar Measured: average time to read one order with its user and items (ms, local MongoDB 7)
Model,Milliseconds per order
Embedded (1 query),0.285
$lookup (1 aggregation),0.315
3 separate queries,0.47
:::

::: image A passport: photo and stamps inside (embed), the bank statement referenced by account number
/images/mongodb-fundamentals/embed-vs-reference.svg
:::

::: text 🪜 Step by step
Modelling an online shop with the guide:
1. **User → addresses**: read with the user, max ~10, owned → **embed** an `addresses` array (validated to 10).
2. **User → orders**: grows forever, queried separately (order history page) → **reference**: each order stores `userId` (indexed).
3. **Order → items**: always read with the order, bounded, and must keep the **price at purchase time** → **embed** with a snapshot of `name` and `unitPrice`.
4. **Product → reviews**: unbounded → separate `reviews` collection with `productId`; keep `reviewCount` and `avgRating` on the product (computed fields).
5. **Students ↔ courses**: many:many → `courseIds` array on the student (bounded) or an `enrollments` collection if you need enrollment metadata (date, grade).
:::

::: code javascript Mongoose schemas: embed, reference, hybrid and many-to-many (node shop-models.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node shop-models.js
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

// EMBED: addresses belong only to the user and are always shown with them (bounded to 10)
const AddressSchema = new Schema({ label: String, line1: String, city: String, pin: String }, { _id: false });
const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  addresses: { type: [AddressSchema], validate: [(a) => a.length <= 10, 'At most 10 addresses'] },
});

// REFERENCE: a user's orders are unbounded → the CHILD stores the parent id
// HYBRID: each item keeps a snapshot of name + price at purchase time
const OrderSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED'], default: 'PENDING' },
  items: [{ productId: { type: Types.ObjectId, ref: 'Product' }, name: String, unitPrice: Number, qty: Number }],
  total: Number,
}, { timestamps: true });

// MANY-TO-MANY with metadata: a join collection
const EnrollmentSchema = new Schema({ studentId: { type: Types.ObjectId, index: true }, courseId: { type: Types.ObjectId, index: true }, grade: String });
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

const User = mongoose.model('User', UserSchema);
const Order = mongoose.model('Order', OrderSchema);
const Product = mongoose.model('Product', new Schema({ name: String, price: Number }));
const Enrollment = mongoose.model('Enrollment', EnrollmentSchema);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Promise.all([User.deleteMany({}), Order.deleteMany({}), Product.deleteMany({}), Enrollment.deleteMany({})]);
  await Promise.all([User.init(), Order.init(), Enrollment.init()]);                 // build indexes

  const user = await User.create({ name: 'Asha', email: 'ASHA@x.com', addresses: [{ label: 'home', city: 'Delhi', pin: '110001' }] });
  const mug = await Product.create({ name: 'Mug', price: 300 });
  await Order.create({ userId: user._id, items: [{ productId: mug._id, name: mug.name, unitPrice: mug.price, qty: 2 }], total: 600 });
  await Product.updateOne({ _id: mug._id }, { $set: { price: 350 } });             // price changes later…

  const order = await Order.findOne({ userId: user._id }).populate('userId', 'name').lean();
  console.log('order item keeps the snapshot price:', order.items[0].unitPrice, '(product now costs 350)');
  console.log('populated user name:', order.userId.name, '| embedded address city:', (await User.findById(user._id).lean()).addresses[0].city);

  const tooMany = new User({ name: 'X', email: 'x@x.com', addresses: Array.from({ length: 11 }, () => ({ city: 'Pune' })) });
  console.log('11 addresses rejected:', (tooMany.validateSync()?.errors.addresses?.message) || 'no error');
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: will this embedded array hit the 16 MB limit? (runnable)
// Estimate document growth: an embedded array that grows every day eventually breaks the 16 MB limit.
const LIMIT = 16 * 1024 * 1024;
function daysUntilLimit(baseBytes, itemBytes, itemsPerDay) {
  return Math.floor((LIMIT - baseBytes) / (itemBytes * itemsPerDay));
}
const addresses = { name: 'user.addresses', base: 400, item: 120, perDay: 0 };          // bounded: doesn't grow
const orderHistory = { name: 'user.orders (embedded)', base: 400, item: 600, perDay: 5 };
const sensorReadings = { name: 'device.readings (embedded)', base: 300, item: 100, perDay: 1440 };

const ordersDays = daysUntilLimit(orderHistory.base, orderHistory.item, orderHistory.perDay);
const readingDays = daysUntilLimit(sensorReadings.base, sensorReadings.item, sensorReadings.perDay);
console.log(`${orderHistory.name}: full after ~${ordersDays} days (${(ordersDays / 365).toFixed(1)} years)`);
console.log(`${sensorReadings.name}: full after ~${readingDays} days`);
console.log('bounded arrays never hit the limit', addresses.perDay === 0 ? '✅' : '❌ FAIL');
console.log('per-minute readings break the limit in under 6 months → reference them', readingDays < 183 ? '✅' : '❌ FAIL');
console.log('even 5 orders a day break it eventually → reference orders', Number.isFinite(ordersDays) && ordersDays > 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Embedding unbounded arrays (orders, comments, logs) inside the parent → slow updates and, eventually, the 16 MB limit.
- Referencing everything like SQL tables and then `$lookup`-ing on every request.
- Embedding shared, frequently-changing data (product price in 10,000 carts) without a sync plan.
- Forgetting the index on the child's foreign key (`orders.userId`).
- Not snapshotting data that must stay historical (order prices, shipping address used).
:::

::: understand
- MongoDB's rule: **"data that is accessed together should be stored together"**, as long as it stays bounded.
- Choosing embed vs reference is choosing which reads are cheap and which writes are complex.
- Patterns help: **extended reference**, **subset** (embed the latest 10, reference the rest), **bucket** (group time-series), **computed** (store counts/averages).
:::

::: ask
- *"What are the most frequent queries? Read/write ratio?"*
- *"How many children per parent, at most, in five years?"*
- *"Do children change independently or get shared?"*
:::

::: important ⭐ Say this in the interview
"I start from the access patterns. If data is read together, belongs to the parent, is bounded and isn't updated independently, like addresses or order line items, I embed it, which gives one read and atomic updates. If it's large or unbounded, shared, or changes on its own, like a user's orders or product reviews, I reference it, usually by storing the parent id on the child with an index, because arrays that grow forever eventually hit the 16 megabyte document limit. Often the best answer is a hybrid: reference plus a snapshot of the fields I always display, like product name and price in an order. In a local test, reading an embedded order was a bit faster than $lookup and clearly faster than three separate queries, and in production every extra round trip adds network latency."
:::

::: links
MongoDB: Data modeling | https://www.mongodb.com/docs/manual/data-modeling/
MongoDB blog: 6 rules of thumb for schema design | https://www.mongodb.com/blog/post/6-rules-of-thumb-for-mongodb-schema-design
MongoDB: Building with patterns (summary) | https://www.mongodb.com/blog/post/building-with-patterns-a-summary
:::

=== CRUD operations: insertOne, find, updateOne, deleteMany… (know them extremely well)
@p 3
@tags crud, mongodb, queries
@quick
- **Create**: `insertOne(doc)`, `insertMany(docs, { ordered: false })`, `bulkWrite([...])`.
- **Read**: `find(filter, { projection }).sort().skip().limit()` (a lazy cursor), `findOne`, `countDocuments`, `distinct`.
- **Update**: `updateOne/updateMany(filter, { $set… }, { upsert })`, `replaceOne`, `findOneAndUpdate(…, { returnDocument: 'after' })`.
- **Delete**: `deleteOne`, `deleteMany` (`deleteMany({})` deletes **everything**), `findOneAndDelete`; many apps soft-delete.
- Measured: inserting 10,000 docs took **~1,600 ms** with an `insertOne` loop vs **~23 ms** with `insertMany` (≈ 70× faster).

::: text 🧒 In simple words
CRUD is the four things you do with a **filing cabinet**: put new files in (**C**reate), look files up (**R**ead), change something written in a file (**U**pdate), and throw files away (**D**elete). MongoDB gives you a method for each, plus "many" versions that handle a whole stack at once, which is much faster than walking to the cabinet once per file.
:::

::: text 📖 Detailed answer
### Create
| Method | Returns | Notes |
|---|---|---|
| `insertOne(doc)` | `{ acknowledged, insertedId }` | Adds `_id` (ObjectId) if missing |
| `insertMany(docs, { ordered })` | `{ insertedCount, insertedIds }` | `ordered: false` continues past errors (e.g. duplicates) |
| `bulkWrite(ops)` | Counts per op type | Mix inserts/updates/deletes in one round trip |

### Read
| Method | Notes |
|---|---|
| `find(filter, { projection })` | Returns a **cursor** (lazy); chain `.sort()`, `.skip()`, `.limit()`; `toArray()` to load |
| `findOne(filter)` | First match or `null` |
| Projection | `{ name: 1, email: 1, _id: 0 }` (include) or `{ passwordHash: 0 }` (exclude); don't mix except `_id` |
| `countDocuments(filter)` | Exact count |
| `estimatedDocumentCount()` | Fast, from metadata |
| `distinct('city', filter)` | Unique values |

### Update
| Method | Notes |
|---|---|
| `updateOne` / `updateMany(filter, update, opts)` | `update` **must** use operators (`$set`, `$inc`…) |
| `upsert: true` | Insert when nothing matches (use `$setOnInsert` for insert-only fields) |
| `replaceOne(filter, doc)` | Replace everything except `_id` |
| `findOneAndUpdate(filter, update, { returnDocument: 'after' })` | Returns the document (same in Mongoose 9; the old `{ new: true }` is deprecated) |

### Delete
`deleteOne`, `deleteMany`, `findOneAndDelete`. `deleteMany({})` empties the collection; many teams use **soft deletes** (`deletedAt`) for undo and audit.

### Measured: 10,000 inserts (MongoDB 7, local, warm)
| Method | Time |
|---|---|
| `insertOne` in a loop | ~1,600 ms |
| `insertMany` | ~23 ms |
| `bulkWrite` | ~25 ms |
The loop pays one network round trip per document; batches send thousands per round trip.
:::

::: diagram CRUD methods at a glance
flowchart LR
  C["Create: insertOne, insertMany, bulkWrite"] --> COL[("collection")]
  R["Read: find (cursor), findOne, countDocuments, distinct"] --> COL
  U["Update: updateOne, updateMany, replaceOne, findOneAndUpdate, upsert"] --> COL
  D["Delete: deleteOne, deleteMany, findOneAndDelete"] --> COL
:::

::: chart bar Measured: time to insert 10,000 documents (MongoDB 7, local, ms)
Method,Milliseconds
insertOne in a loop,1600
insertMany,23
bulkWrite,25
:::

::: image A filing cabinet: put in, look up, change and throw away, one by one or by the stack
/images/mongodb-fundamentals/crud.svg
:::

::: text 🪜 Step by step
What happens in `users.find({ city: 'Delhi' }, { projection: { name: 1 } }).sort({ createdAt: -1 }).limit(5).toArray()`:
1. The driver builds a **cursor** object; nothing is sent yet (lazy).
2. `toArray()` sends one `find` command with the filter, projection, sort and limit.
3. The server picks a plan (an index on `{ city: 1, createdAt: -1 }` would serve both the filter and the sort).
4. It returns up to 5 documents with only `_id` and `name`.
5. For large results without `limit`, the driver fetches **batches** (`getMore`) as you iterate.
6. `updateOne(filter, { $inc: { balance: 100 } })` returns `{ matchedCount, modifiedCount }`: check them to know if anything changed.
:::

::: code javascript Complete CRUD walkthrough (mongosh: run with mongosh --file crud.js)
// How to run: mongosh "mongodb://localhost:27017" --file crud.js     (prints every result)
db = db.getSiblingDB('shop_crud');
db.users.drop();

// ---------- CREATE ----------
printjson(db.users.insertOne({ name: 'Vivek', email: 'vivek@x.com', age: 32, city: 'Delhi', isActive: true, balance: 500, tags: ['react', 'node'], address: { city: 'Delhi', pin: '110001' }, createdAt: new Date() }));
printjson(db.users.insertMany([
  { name: 'Asha', email: 'asha@x.com', age: 27, city: 'Pune', isActive: true, balance: 1200, tags: ['aws'], address: { city: 'Pune' }, createdAt: new Date('2026-01-10') },
  { name: 'Rahul', email: 'rahul@x.com', age: 41, city: 'Delhi', isActive: false, balance: 0, tags: [], address: { city: 'Delhi' }, createdAt: new Date('2025-11-02') },
], { ordered: false }));
db.users.createIndex({ email: 1 }, { unique: true });

// ---------- READ ----------
printjson(db.users.find({ city: 'Delhi' }, { name: 1, _id: 0 }).toArray());
printjson(db.users.findOne({ email: 'vivek@x.com' }, { name: 1, balance: 1 }));
printjson(db.users.find({ age: { $gte: 30 } }).sort({ createdAt: -1 }).limit(5).toArray().map((u) => u.name));
print('active users:', db.users.countDocuments({ isActive: true }), '| cities:', db.users.distinct('city'));

// ---------- UPDATE ----------
printjson(db.users.updateOne({ email: 'vivek@x.com' }, { $set: { city: 'Bengaluru' }, $inc: { balance: 100 } }));
printjson(db.users.updateMany({ isActive: false }, { $set: { status: 'archived' } }));
printjson(db.users.updateOne({ email: 'new@x.com' }, { $set: { name: 'New' }, $setOnInsert: { createdAt: new Date() } }, { upsert: true }));
printjson(db.users.findOneAndUpdate({ email: 'asha@x.com' }, { $push: { tags: 'mongodb' } }, { returnDocument: 'after', projection: { tags: 1 } }));
printjson(db.users.replaceOne({ email: 'new@x.com' }, { name: 'Replaced', email: 'new@x.com' }));

// ---------- DELETE ----------
printjson(db.users.deleteOne({ email: 'new@x.com' }));
printjson(db.users.deleteMany({ isActive: false, balance: 0 }));

// ---------- BULK ----------
printjson(db.users.bulkWrite([
  { updateOne: { filter: { email: 'vivek@x.com' }, update: { $inc: { balance: -50 } } } },
  { deleteOne: { filter: { email: 'nobody@x.com' } } },
  { insertOne: { document: { name: 'Bulk', email: 'bulk@x.com' } } },
]));
print('final balances:', JSON.stringify(db.users.find({}, { _id: 0, name: 1, balance: 1 }).toArray()));
:::

::: code javascript The same with the Node.js driver, plus a batch-vs-loop timing (node crud-driver.js)
// How to run: npm install mongodb && MONGO_URI=mongodb://localhost:27017 node crud-driver.js
const { MongoClient } = require('mongodb');

async function main() {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const users = client.db('shop_crud_driver').collection('users');
  await users.deleteMany({});

  const { insertedId } = await users.insertOne({ name: 'Test', email: 't@x.com', balance: 0 });
  const res = await users.updateOne({ _id: insertedId }, { $inc: { balance: 250 } });
  console.log('matched/modified:', res.matchedCount, res.modifiedCount);
  console.log('read back:', await users.findOne({ _id: insertedId }, { projection: { _id: 0, name: 1, balance: 1 } }));

  const docs = () => Array.from({ length: 2000 }, (_, i) => ({ name: `user ${i}`, balance: i }));
  let t = Date.now();
  for (const d of docs()) await users.insertOne(d);                     // one round trip per document
  const loopMs = Date.now() - t;
  await users.deleteMany({ name: /^user / });
  t = Date.now();
  await users.insertMany(docs());                                        // thousands per round trip
  console.log(`2,000 inserts: loop ${loopMs} ms vs insertMany ${Date.now() - t} ms`);

  const page = await users.find({ balance: { $gt: 100 } }).sort({ balance: -1 }).limit(3).project({ _id: 0, name: 1 }).toArray();
  console.log('top 3:', page.map((u) => u.name));
  console.log('deleted:', (await users.deleteMany({})).deletedCount);
  await client.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: a mini collection with Mongo-style CRUD (runnable)
function createCollection() {
  const docs = [];
  let seq = 0;
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v);
  return {
    insertOne(doc) { const d = { _id: ++seq, ...doc }; docs.push(d); return { insertedId: d._id }; },
    insertMany(list) { return { insertedCount: list.map((d) => this.insertOne(d)).length }; },
    find(filter = {}) { return docs.filter((d) => matches(d, filter)).map((d) => ({ ...d })); },
    updateOne(filter, update, { upsert = false } = {}) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) { if (upsert) { this.insertOne({ ...filter, ...update.$set }); return { matchedCount: 0, modifiedCount: 0, upserted: true }; } return { matchedCount: 0, modifiedCount: 0 }; }
      if (!update.$set && !update.$inc) throw new Error('update document requires atomic operators');
      Object.assign(doc, update.$set || {});
      for (const [k, by] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + by;
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteMany(filter) { const before = docs.length; for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], filter)) docs.splice(i, 1); return { deletedCount: before - docs.length }; },
  };
}

const users = createCollection();
users.insertMany([{ name: 'Asha', city: 'Delhi', balance: 100 }, { name: 'Ben', city: 'Pune', balance: 0 }]);
console.log('find city Delhi', users.find({ city: 'Delhi' }).length === 1 ? '✅' : '❌ FAIL');
console.log('$inc updates the balance', users.updateOne({ name: 'Asha' }, { $inc: { balance: 50 } }).modifiedCount === 1 && users.find({ name: 'Asha' })[0].balance === 150 ? '✅' : '❌ FAIL');
let threw = false;
try { users.updateOne({ name: 'Ben' }, { balance: 5 }); } catch (e) { threw = e.message.includes('atomic operators'); }
console.log('update without operators is rejected', threw ? '✅' : '❌ FAIL');
console.log('upsert inserts when nothing matches', users.updateOne({ name: 'Chen' }, { $set: { city: 'Mumbai' } }, { upsert: true }).upserted && users.find({ name: 'Chen' }).length === 1 ? '✅' : '❌ FAIL');
console.log('deleteMany({}) removes everything ⚠️', users.deleteMany({}).deletedCount === 3 && users.find().length === 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Update documents without operators (`updateOne(f, { name: 'X' })`): the driver throws; Mongoose silently wraps it in `$set`.
- `insertOne` or `findOne` in loops (N round trips) instead of `insertMany`/`bulkWrite`/`$in`.
- `find()` without `limit` or projection on big collections.
- `deleteMany({})` by accident (empty filter from a missing variable).
- Ignoring `matchedCount`/`modifiedCount` and assuming an update worked.
:::

::: understand
- Most performance problems in CRUD code are **round trips** and **missing indexes**, not the methods themselves.
- `find` returns a cursor: it's lazy and streams in batches, which is how large exports work.
- Operator-based updates are **atomic per document**: the basis for safe counters and state changes.
:::

::: ask
- *"Hard or soft delete? Do we need an audit trail?"*
- *"Should updates return the new document?"* (`findOneAndUpdate` with `returnDocument: 'after'`).
- *"How many documents per write?"* → batching strategy.
:::

::: important ⭐ Say this in the interview
"Create uses insertOne, insertMany or bulkWrite; read uses find, which returns a lazy cursor I chain with sort, skip, limit and a projection, plus findOne, countDocuments and distinct; update uses updateOne, updateMany or replaceOne with operators like $set and $inc, upsert to insert when nothing matches, and findOneAndUpdate with returnDocument after when I need the new document; delete uses deleteOne, deleteMany or findOneAndDelete, often replaced by soft deletes. Batching matters a lot: inserting ten thousand documents took about 1.6 seconds in an insertOne loop and about 23 milliseconds with insertMany. And single-document updates are atomic, which is what makes $inc counters safe."
:::

::: links
MongoDB: CRUD operations | https://www.mongodb.com/docs/manual/crud/
MongoDB Node.js driver: CRUD | https://www.mongodb.com/docs/drivers/node/current/crud/
mongosh: Write scripts | https://www.mongodb.com/docs/mongodb-shell/write-scripts/
:::

=== Query & update operators: $set, $unset, $inc, $push, $pull, $in, $nin, $gt…, $or, $and
@p 3
@tags operators, queries
@quick
- Comparison: `$eq $ne $gt $gte $lt $lte $in $nin`; logical: `$and` (implicit with commas), `$or`, `$nor`, `$not`.
- Element/array: `$exists`, `$type`, `$all`, `$elemMatch` (**same** element matches every condition), `$size`.
- Update: `$set`, `$unset`, `$inc`, `$push`/`$addToSet`, `$pull`, `$pop`, `$rename`, `$min`/`$max`, `$currentDate`, positional `$`, `$[]`, `$[id]` + `arrayFilters`.
- `$push` with `$each` + `$slice: -N` keeps only the last N items (bounded arrays).
- Measured: 200 concurrent "+1" with read-modify-write left the counter at **1**; with `$inc` it reached **200**.

::: text 🧒 In simple words
Operators are the **words you use to ask questions and give instructions** to the database. For questions: "older **than** 30", "city **in** Delhi or Pune", "has **all** these tags". For instructions: "**set** the city", "**increase** the balance by 100", "**add** this tag unless it's already there", "**remove** tags that are old". Using the right instruction matters: "increase by 1" done by the database itself is safe even when 200 people do it at once; reading the number, adding one in your app and writing it back loses almost all of them.
:::

::: text 📖 Detailed answer
### Query operators (in the filter)
| Operator | Example | Meaning |
|---|---|---|
| `$gt $gte $lt $lte` | `{ age: { $gte: 18, $lt: 30 } }` | Range |
| `$ne` | `{ status: { $ne: 'deleted' } }` | Not equal (also matches missing fields; index-unfriendly) |
| `$in` / `$nin` | `{ city: { $in: ['Delhi', 'Pune'] } }` | Any of / none of |
| implicit AND | `{ city: 'Delhi', age: { $gt: 30 } }` | All conditions |
| `$or` | `{ $or: [{ city: 'Delhi' }, { balance: { $gt: 1000 } }] }` | Any condition |
| `$exists` | `{ phone: { $exists: true } }` | Field present |
| `$regex` | `{ name: { $regex: '^Vi' } }` | Pattern (an anchored, case-sensitive prefix can use an index) |
| `$elemMatch` | `{ items: { $elemMatch: { sku: 'A1', qty: { $gte: 2 } } } }` | One array element matches **all** conditions |
| `$all` | `{ tags: { $all: ['node', 'react'] } }` | Array contains all |
| `$size` | `{ tags: { $size: 0 } }` | Exact array length |

### Update operators
| Operator | Example | Effect |
|---|---|---|
| `$set` | `{ $set: { city: 'Pune', 'address.pin': '411001' } }` | Set fields (dot notation for nested) |
| `$unset` | `{ $unset: { tempToken: '' } }` | Remove a field |
| `$inc` | `{ $inc: { balance: 100, logins: 1 } }` | **Atomic** add (negative to subtract) |
| `$push` | `{ $push: { tags: 'aws' } }` | Append (duplicates allowed) |
| `$addToSet` | `{ $addToSet: { tags: 'aws' } }` | Append if absent |
| `$push` + `$each` + `$slice` | `{ $push: { recent: { $each: ['q'], $slice: -5 } } }` | Keep the last 5 |
| `$pull` | `{ $pull: { tags: { $in: ['old'] } } }` | Remove matching elements |
| `$pop` | `{ $pop: { queue: -1 } }` | Remove first (-1) / last (1) |
| `$rename` | `{ $rename: { fullname: 'name' } }` | Rename a field |
| `$min` / `$max` | `{ $max: { highScore: 950 } }` | Only if lower / higher |
| `$` positional | `updateOne({ 'items.sku': 'A1' }, { $set: { 'items.$.qty': 5 } })` | First matched element |
| `$[]` / `$[x]` + `arrayFilters` | `{ $mul: { 'items.$[b].price': 0.9 } }, { arrayFilters: [{ 'b.category': 'books' }] }` | All / filtered elements |

### Why `$inc` instead of read-modify-write (measured, MongoDB 7, 200 concurrent requests)
| Approach | Final counter (expected 200) |
|---|---|
| `findOne` → `+1` in Node → `$set` | **1** (199 lost updates) |
| `updateOne({ _id }, { $inc: { balance: 1 } })` | **200** |
:::

::: diagram Choosing an operator
flowchart TD
  Q{"Reading or writing?"} -->|"read: filter"| F{"what kind of condition?"}
  F -->|"range / equality"| F1["$gt $gte $lt $lte $in $ne"]
  F -->|"several conditions"| F2["implicit AND, $or, $nor"]
  F -->|"arrays"| F3["$all, $elemMatch, $size"]
  Q -->|"write: update"| U{"what change?"}
  U -->|"set or remove fields"| U1["$set, $unset, $rename"]
  U -->|"numbers"| U2["$inc, $min, $max (atomic)"]
  U -->|"arrays"| U3["$push $each $slice, $addToSet, $pull, positional $"]
:::

::: chart bar Measured: final value after 200 concurrent +1 updates (expected 200)
Approach,Final counter
Read-modify-write,1
$inc,200
:::

::: image Question words and instruction words: operators for filters and for updates
/images/mongodb-fundamentals/operators.svg
:::

::: text 🪜 Step by step
`db.orders.updateOne({ _id: 1, 'items.sku': 'A1' }, { $inc: { 'items.$.qty': 1 } })` on `{ _id: 1, items: [{ sku: 'B2', qty: 1 }, { sku: 'A1', qty: 2 }] }`:
1. The filter matches document 1, and while matching `items.sku`, MongoDB remembers **which array index** matched (index 1).
2. The positional `$` in `items.$.qty` is replaced by that index → the update targets `items.1.qty`.
3. `$inc` adds 1 atomically → `qty` becomes 3; other elements are untouched.
4. With `$[]` instead of `$`, every element's `qty` would be incremented; with `$[a]` + `arrayFilters: [{ 'a.sku': 'B2' }]`, only matching elements.
5. The whole update is atomic for that one document: no other writer can see a half-applied change.
:::

::: code javascript Operator practice set with results (mongosh: run with mongosh --file operators.js)
// How to run: mongosh "mongodb://localhost:27017" --file operators.js
db = db.getSiblingDB('shop_operators');
db.users.drop(); db.orders.drop();
db.users.insertMany([
  { name: 'Vivek', age: 32, city: 'Delhi', tags: ['node', 'react'], balance: 500, email: 'vivek@x.com' },
  { name: 'Asha', age: 27, city: 'Pune', tags: ['aws'], balance: 1200, phone: '999' },
  { name: 'Rahul', age: 41, city: 'Delhi', tags: [], balance: 0, role: 'admin' },
]);
db.orders.insertOne({ _id: 1, items: [{ sku: 'B2', qty: 1, price: 100, category: 'books' }, { sku: 'A1', qty: 2, price: 50, category: 'toys' }] });
const names = (cursor) => cursor.toArray().map((u) => u.name).join(', ');

// Comparison + logical
print('25-35 in Delhi/Pune:', names(db.users.find({ age: { $gte: 25, $lte: 35 }, city: { $in: ['Delhi', 'Pune'] } })));
print('rich OR aws:', names(db.users.find({ $or: [{ balance: { $gt: 1000 } }, { tags: 'aws' }] })));
print('not admin, no phone:', names(db.users.find({ role: { $nin: ['admin'] }, phone: { $exists: false } })));

// Arrays
print('has node:', names(db.users.find({ tags: 'node' })));
print('has node AND react:', names(db.users.find({ tags: { $all: ['node', 'react'] } })));
print('no tags:', names(db.users.find({ tags: { $size: 0 } })));
print('order with A1 qty >= 2:', db.orders.countDocuments({ items: { $elemMatch: { sku: 'A1', qty: { $gte: 2 } } } }));

// $set / $unset / $inc / $addToSet / $pull / $push + $slice
db.users.updateOne({ name: 'Vivek' }, { $set: { 'address.pin': '560001' }, $unset: { email: '' }, $inc: { balance: 100 } });
db.users.updateOne({ name: 'Vivek' }, { $addToSet: { tags: 'docker' } });
db.users.updateOne({ name: 'Vivek' }, { $addToSet: { tags: 'docker' } });                 // no duplicate
db.users.updateOne({ name: 'Vivek' }, { $pull: { tags: { $in: ['react'] } } });
db.users.updateOne({ name: 'Vivek' }, { $push: { recent: { $each: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], $slice: -5 } } });
printjson(db.users.findOne({ name: 'Vivek' }, { _id: 0, tags: 1, balance: 1, address: 1, email: 1, recent: 1 }));

// Positional updates
db.orders.updateOne({ _id: 1, 'items.sku': 'A1' }, { $inc: { 'items.$.qty': 1 } });
db.orders.updateOne({ _id: 1 }, { $mul: { 'items.$[b].price': 0.9 } }, { arrayFilters: [{ 'b.category': 'books' }] });
printjson(db.orders.findOne({ _id: 1 }).items);
:::

::: code javascript Browser demo: lost updates vs atomic increments (runnable)
// Simulate 200 concurrent "+1" requests against a store with async reads/writes.
function createStore() {
  let balance = 0;
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 2));
  return {
    async read() { await tick(); return balance; },
    async write(value) { await tick(); balance = value; },
    async inc(by) { await tick(); balance += by; },       // what $inc does: read + add + write inside the database
    get balance() { return balance; },
  };
}

(async () => {
  const rmw = createStore();
  await Promise.all(Array.from({ length: 200 }, async () => { const b = await rmw.read(); await rmw.write(b + 1); }));
  const atomic = createStore();
  await Promise.all(Array.from({ length: 200 }, () => atomic.inc(1)));
  console.log(`read-modify-write ended at ${rmw.balance} (expected 200)`, rmw.balance < 200 ? '✅ (lost updates reproduced)' : '❌ FAIL');
  console.log(`atomic increment ended at ${atomic.balance}`, atomic.balance === 200 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Read-modify-write in application code for counters/balances (lost updates) instead of `$inc`.
- `{ items: { sku: 'A1', qty: 2 } }` (exact sub-document match) when you meant `$elemMatch`.
- Two separate conditions on an array field (`'items.sku': 'A1', 'items.qty': { $gte: 2 }`) can match **different** elements.
- `$push` on arrays that grow forever (no `$slice`) or `$push` when duplicates must be avoided (`$addToSet`).
- `$ne`/`$nin` on large collections expecting index speed.
:::

::: understand
- Operators make updates **server-side and atomic per document**, which is MongoDB's main tool for consistency without transactions.
- Array operators are powerful; know `$elemMatch` vs dot notation and positional updates, since interviews love them.
- Bounded arrays (`$slice`) keep documents healthy.
:::

::: ask
- *"Can the array grow without limit?"* → `$slice` or a separate collection.
- *"Should duplicates be allowed?"* → `$push` vs `$addToSet`.
- *"Is the value updated concurrently?"* → atomic operators or conditional updates.
:::

::: important ⭐ Say this in the interview
"Query operators go in the filter: comparisons like $gt and $in, logical $or with implicit AND between fields, $exists and $type, and array operators like $all, $size and $elemMatch, where $elemMatch is needed when one array element must satisfy several conditions. Update operators change documents atomically on the server: $set and $unset for fields, $inc for counters, $push with $each and $slice to keep arrays bounded, $addToSet to avoid duplicates, $pull to remove matches, and the positional $, $[] and arrayFilters for array elements. I always use $inc instead of read-modify-write: in a test with 200 concurrent increments, read-modify-write ended at 1 while $inc reached 200."
:::

::: links
MongoDB: Query and projection operators | https://www.mongodb.com/docs/manual/reference/operator/query/
MongoDB: Update operators | https://www.mongodb.com/docs/manual/reference/operator/update/
MongoDB: Query an array of embedded documents | https://www.mongodb.com/docs/manual/tutorial/query-array-of-documents/
:::

=== MongoDB query practice: write these queries
@p 3
@tags queries, practice
@quick
- Active users: `find({ isActive: true })` · older than 30: `find({ age: { $gt: 30 } })` · newest first: `find().sort({ createdAt: -1 })`.
- Page 3 of 20: `find().sort({ createdAt: -1, _id: -1 }).skip(40).limit(20)` (or a cursor for deep pages).
- Search: prefix `{ name: { $regex: '^Viv' } }` can use an index; "contains" + case-insensitive can't → text index or Atlas Search.
- Increase balance: `updateOne({ _id }, { $inc: { balance: 100 } })`; safe debit: add `balance: { $gte: amount }` to the filter.
- Nested field: `find({ 'address.city': 'Delhi' })` (quoted dot notation), **not** `{ address: { city: 'Delhi' } }` (exact match).

::: text 🧒 In simple words
These seven queries are the **"times tables" of MongoDB**: interviewers ask them because every real app needs them: show active users, filter by age, newest first, page through results, search by name, change a balance safely, and look inside nested data. Practise writing them from memory, then check your answers and run them yourself against the sample data below.
:::

::: text 📖 Detailed answer
### The seven classic questions
| # | Task | Query |
|---|---|---|
| 1 | Active users | `db.users.find({ isActive: true })` |
| 2 | Older than 30 | `db.users.find({ age: { $gt: 30 } })` |
| 3 | Newest first | `db.users.find().sort({ createdAt: -1 })` (or `{ _id: -1 }`: ObjectIds grow with time) |
| 4 | Page 3, 20 per page | `.sort({ createdAt: -1, _id: -1 }).skip(40).limit(20)` |
| 5 | Search by name | prefix `{ name: { $regex: '^Viv' } }` · contains `{ name: { $regex: 'viv', $options: 'i' } }` · full text `$text` / Atlas Search |
| 6 | Increase balance | `updateOne({ _id }, { $inc: { balance: 100 } })` |
| 7 | Nested city | `find({ 'address.city': 'Delhi' })` |

### Search performance: prefix vs "contains" (measured)
300,000 users with an index on `name`, MongoDB 7:
| Query | Time | Index keys examined |
|---|---|---|
| `{ name: { $regex: '^Vivek 1234' } }` (anchored, case-sensitive) | **0.6 ms** | 23 |
| `{ name: { $regex: 'vivek 1234', $options: 'i' } }` (contains, case-insensitive) | **84.3 ms** | 300,000 |
An anchored, case-sensitive prefix becomes an index **range scan**; anything else has to check every index entry (or every document).

### Two traps interviewers love
- `{ address: { city: 'Delhi' } }` matches only documents whose `address` is **exactly** `{ city: 'Delhi' }` (same fields, same order). Use dot notation.
- A debit must not go negative under concurrency: put the condition **in the filter** (`balance: { $gte: 300 }`) together with `$inc: { balance: -300 }`; check `modifiedCount`.
:::

::: diagram From question to query shape
flowchart LR
  Q1["active users"] --> F1["equality filter"]
  Q2["older than 30"] --> F2["range: $gt"]
  Q3["newest first"] --> F3["sort createdAt -1"]
  Q4["page 3 of 20"] --> F4["sort + skip 40 + limit 20"]
  Q5["search by name"] --> F5["anchored regex, text index or Atlas Search"]
  Q6["increase balance"] --> F6["$inc (atomic)"]
  Q7["nested city"] --> F7["'address.city' dot notation"]
:::

::: chart bar Measured: name search on 300,000 users with an index on name (ms)
Query,Milliseconds
Anchored prefix regex,0.6
Contains + case-insensitive regex,84.3
:::

::: image Seven everyday questions and the query shape that answers each
/images/mongodb-fundamentals/query-practice.svg
:::

::: text 🪜 Step by step
How MongoDB runs query 4 (`sort({ createdAt: -1, _id: -1 }).skip(40).limit(20)`) with an index `{ createdAt: -1, _id: -1 }`:
1. The planner sees the sort matches the index order → no in-memory sort needed.
2. It walks the index from the newest entry.
3. It **skips** the first 40 entries (that's the cost of deep pages: they're still walked).
4. It returns entries 41–60, fetching each document (or covering them from the index with a projection).
5. Without that index, MongoDB would read all matching documents and sort them in memory (limited to 100 MB unless `allowDiskUse`).
6. For page 5,000, switch to a cursor: `find({ createdAt: { $lt: lastSeen } })` (see Express → pagination).
:::

::: code javascript Solutions you can run (mongosh: run with mongosh --file practice.js)
// How to run: mongosh "mongodb://localhost:27017" --file practice.js
db = db.getSiblingDB('shop_practice');
db.users.drop();
const firstNames = ['Vivek', 'Asha', 'Rahul', 'Vikram', 'Priya'];
db.users.insertMany(Array.from({ length: 75 }, (_, i) => ({
  name: `${firstNames[i % 5]} ${i + 1}`,
  age: 20 + (i % 30),
  isActive: i % 3 !== 0,
  balance: i * 10,
  address: { city: ['Delhi', 'Pune', 'Mumbai'][i % 3], pin: String(110000 + i) },
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
})));
db.users.createIndex({ createdAt: -1, _id: -1 });
db.users.createIndex({ name: 1 });

print('1 active:', db.users.countDocuments({ isActive: true }));
print('2 older than 30:', db.users.countDocuments({ age: { $gt: 30 } }));
print('3 newest:', db.users.find({}, { name: 1 }).sort({ createdAt: -1 }).limit(3).toArray().map((u) => u.name).join(', '));
print('4 page 3:', db.users.find({}, { name: 1 }).sort({ createdAt: -1, _id: -1 }).skip(40).limit(20).toArray().map((u) => u.name).slice(0, 3).join(', '), '…');
print('5a prefix ^Viv:', db.users.countDocuments({ name: { $regex: '^Viv' } }));
print('5b contains "sha" (case-insensitive):', db.users.countDocuments({ name: { $regex: 'sha', $options: 'i' } }));
const someone = db.users.findOne({ name: 'Asha 2' });
db.users.updateOne({ _id: someone._id }, { $inc: { balance: 100 } });
print('6 balance after +100:', db.users.findOne({ _id: someone._id }).balance);
const debit = db.users.updateOne({ _id: someone._id, balance: { $gte: 1000 } }, { $inc: { balance: -1000 } });
print('6b safe debit of 1000 applied?', debit.modifiedCount === 1, '(balance was too low)');
print('7 Delhi (dot notation):', db.users.countDocuments({ 'address.city': 'Delhi' }));
print('7 trap (exact sub-document):', db.users.countDocuments({ address: { city: 'Delhi' } }));
print('plan for prefix search:', db.users.find({ name: { $regex: '^Viv' } }).explain('executionStats').queryPlanner.winningPlan.inputStage.stage);
:::

::: code javascript Browser demo: the same seven queries on an array (runnable)
const firstNames = ['Vivek', 'Asha', 'Rahul', 'Vikram', 'Priya'];
const users = Array.from({ length: 75 }, (_, i) => ({
  _id: i + 1, name: `${firstNames[i % 5]} ${i + 1}`, age: 20 + (i % 30), isActive: i % 3 !== 0, balance: i * 10,
  address: { city: ['Delhi', 'Pune', 'Mumbai'][i % 3] }, createdAt: Date.UTC(2026, 0, 1 + i),
}));

const active = users.filter((u) => u.isActive).length;
const older = users.filter((u) => u.age > 30).length;
const newest = [...users].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map((u) => u.name);
const page3 = [...users].sort((a, b) => b.createdAt - a.createdAt).slice(40, 60);
const prefix = users.filter((u) => /^Vi/.test(u.name)).length;
const delhi = users.filter((u) => u.address.city === 'Delhi').length;
const exactTrap = users.filter((u) => JSON.stringify(u.address) === JSON.stringify({ city: 'Delhi' })).length;

console.log('1 active users', active === 50 ? '✅' : '❌ FAIL');
console.log('2 older than 30', older === 42 ? '✅' : '❌ FAIL');
console.log('3 newest →', newest.join(', '), newest[0] === 'Priya 75' ? '✅' : '❌ FAIL');
console.log('4 page 3 has 20 users starting at #35', page3.length === 20 && page3[0]._id === 35 ? '✅' : '❌ FAIL');
console.log('5 prefix "Vi" matches Vivek and Vikram', prefix === 30 ? '✅' : '❌ FAIL');
console.log('7 Delhi via dot notation', delhi === 25 ? '✅' : '❌ FAIL');
console.log('7 trap: exact sub-document match also finds 25 here (only because address has just one field)', exactTrap === 25 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `{ address: { city: 'Delhi' } }` instead of `{ 'address.city': 'Delhi' }` (exact sub-document match).
- Case-insensitive "contains" regex on big collections and expecting index speed.
- Sorting by `createdAt` alone (ties) for pagination → add `_id`.
- Read-modify-write for balances; debits without a `$gte` guard in the filter.
- `skip()` for page 50,000 (use a cursor).
:::

::: understand
- Every query has a **shape** (filter, sort, projection); indexes are built for shapes, not for fields in isolation.
- `explain('executionStats')` tells the truth: compare `totalKeysExamined`/`totalDocsExamined` with `nReturned`.
- Real search (typos, relevance, partial words) belongs in a text index, Atlas Search or OpenSearch.
:::

::: ask
- *"Is search prefix, contains or full-text with typos?"*
- *"How large is the collection? Which sorts are common?"*
- *"Can a balance go negative? Do we need a ledger of changes?"*
:::

::: important ⭐ Say this in the interview
"Active users is an equality filter, older than thirty is $gt, newest first is sort createdAt descending, and page three of twenty is sort, skip forty, limit twenty, with _id as a tie-breaker and a matching index; for deep pages I'd switch to cursor pagination. For search, an anchored case-sensitive prefix regex can use the index: in a test on 300,000 users it took 0.6 milliseconds, while a case-insensitive contains regex took 84 and scanned every index key, so real search goes to a text index or Atlas Search. Increasing a balance is $inc, and a debit puts balance greater-or-equal the amount in the filter. Nested fields use quoted dot notation, because matching a whole sub-document requires an exact match."
:::

::: links
MongoDB: Query documents | https://www.mongodb.com/docs/manual/tutorial/query-documents/
MongoDB: Query on embedded documents | https://www.mongodb.com/docs/manual/tutorial/query-embedded-documents/
MongoDB: $regex and index use | https://www.mongodb.com/docs/manual/reference/operator/query/regex/#index-use
:::

=== What is MongoDB?
@p 2
@tags basics
@quick
- An open-source, **document-oriented NoSQL database**: JSON-like documents stored as **BSON** in collections.
- Rich queries, many index types, the **aggregation pipeline**, **change streams**, and ACID transactions (single-document always; multi-document since 4.0).
- **Replica sets** give high availability (automatic failover in seconds); **sharding** gives horizontal scale.
- Managed: **MongoDB Atlas** (AWS/GCP/Azure); on AWS there's also **DocumentDB** (Mongo-compatible, not identical).
- Natural fit for JavaScript stacks: documents map directly to JS objects and JSON.

::: text 🧒 In simple words
MongoDB is a database that stores data as **documents that look like the JavaScript objects** you already use: `{ name: "Asha", address: { city: "Delhi" }, tags: ["node"] }`. Instead of splitting things across many tables, a document can hold a whole "thing" in one place. To stay available, it keeps **copies** of your data on several servers (a replica set), and when one server dies, another takes over within seconds. When data gets huge, it can **split** it across many machines (sharding).
:::

::: text 📖 Detailed answer
**MongoDB** is a general-purpose, document-oriented NoSQL database.

### Core features
| Feature | What it gives you |
|---|---|
| **Documents (BSON)** | Nested objects and arrays, typed values (Date, ObjectId, Decimal128) |
| **Flexible schema** | Add fields without migrations; enforce rules with Mongoose or `$jsonSchema` |
| **Query language + aggregation** | Filters, projections, sorting, geospatial, text search, multi-stage pipelines |
| **Indexes** | Single, compound, multikey (arrays), text, geospatial, hashed, TTL, unique, partial, wildcard |
| **Replica sets** | 1 primary + N secondaries; automatic election on failure; read scaling options |
| **Sharding** | Splits a collection across shards by a shard key; scales writes and storage |
| **Transactions** | Single-document atomic writes; multi-document ACID across collections (and shards) |
| **Change streams** | Subscribe to inserts/updates/deletes in real time |
| **Atlas** | Managed clusters, backups, Atlas Search, Vector Search, monitoring |

### Replica set in one paragraph
All writes go to the **primary**, which records them in the **oplog**; secondaries copy and apply the oplog. If the primary stops responding, the remaining members **elect** a new primary (typically within ~10–12 seconds by default). Drivers discover the new primary automatically. `writeConcern: { w: 'majority' }` waits until a majority has the write, so it survives a failover.

### MongoDB vs DocumentDB (AWS)
DocumentDB speaks the MongoDB wire protocol but is a different engine; some operators, aggregation stages and behaviours differ. Check compatibility before choosing it.
:::

::: diagram Replica set with automatic failover
flowchart LR
  APP["Node app (driver)"] -->|"writes + reads"| P[("Primary")]
  P -->|"oplog replication"| S1[("Secondary 1")]
  P -->|"oplog replication"| S2[("Secondary 2")]
  S1 -.->|"election if the primary fails"| NP["new Primary"]
  APP -.->|"driver finds the new primary"| NP
:::

::: image MongoDB at a glance: documents, replica set copies for availability, shards for scale
/images/mongodb-fundamentals/what-is-mongodb.svg
:::

::: text 🪜 Step by step
What happens when your app writes `{ w: 'majority' }` to a 3-member replica set:
1. The driver sends the insert to the **primary** (it discovered the topology at connect time).
2. The primary applies the write and appends it to its **oplog**.
3. Secondaries are tailing the oplog; they copy and apply the entry.
4. As soon as **2 of 3** members have it, the primary acknowledges the write to your app.
5. If the primary crashes afterwards, the write survives because a majority has it; an election promotes a secondary.
6. The driver notices the new primary and retries the operation if `retryWrites=true` (the default in modern drivers).
:::

::: code javascript Connect, inspect the deployment and use change streams (node what-is-mongodb.js)
// How to run: npm install mongodb && MONGO_URI=mongodb://localhost:27017 node what-is-mongodb.js
const { MongoClient } = require('mongodb');

async function main() {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const admin = client.db().admin();

  const info = await admin.command({ buildInfo: 1 });
  const hello = await admin.command({ hello: 1 });
  console.log('MongoDB version:', info.version);
  console.log('deployment:', hello.setName ? `replica set "${hello.setName}" (primary: ${hello.primary})` : 'standalone server');

  const db = client.db('what_is_mongodb');
  const users = db.collection('users');
  await users.deleteMany({});
  await users.insertOne({ name: 'Asha', address: { city: 'Delhi' }, tags: ['node'], createdAt: new Date() });
  console.log('a document is just an object:', await users.findOne({}, { projection: { _id: 0 } }));

  if (hello.setName) {
    // Change streams need a replica set: react to changes in real time
    const stream = users.watch([{ $match: { operationType: 'insert' } }]);
    await stream.tryNext();                              // opens the cursor NOW (watch() is lazy) so the next insert isn't missed
    await users.insertOne({ name: 'Ben' });
    const change = await stream.next();                  // waits for the event
    console.log('change stream saw:', change.operationType, change.fullDocument.name);
    await stream.close();                                // close the stream before the client
  } else {
    console.log('(change streams require a replica set; start mongod with --replSet to try them)');
  }
  await client.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: majority writes survive a primary failure (runnable)
// Simulate a 3-member replica set: a write acknowledged with w:1 can be lost on failover, w:"majority" cannot.
function replicaSet() {
  const members = [{ name: 'A', log: [] }, { name: 'B', log: [] }, { name: 'C', log: [] }];
  let primary = members[0];
  return {
    write(value, w) {
      primary.log.push(value);                                   // applied on the primary
      if (w === 'majority') members.filter((m) => m !== primary)[0].log.push(value);   // wait for one more copy
      return 'acknowledged';
    },
    failover() {
      const survivors = members.filter((m) => m !== primary);
      primary = survivors.sort((x, y) => y.log.length - x.log.length)[0];             // most up-to-date wins
      return primary.name;
    },
    has: (value) => primary.log.includes(value),
  };
}

const rs1 = replicaSet();
rs1.write('order-1 (w:1)', 1);
rs1.failover();
console.log('w:1 write lost after the primary died', !rs1.has('order-1 (w:1)') ? '✅' : '❌ FAIL');

const rs2 = replicaSet();
rs2.write('order-2 (w:majority)', 'majority');
const newPrimary = rs2.failover();
console.log(`w:majority write survived; new primary is ${newPrimary}`, rs2.has('order-2 (w:majority)') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Calling MongoDB "schemaless and transactionless": both are outdated half-truths.
- Running a single standalone server in production (no failover, no change streams, no transactions).
- Assuming DocumentDB behaves exactly like MongoDB.
- Using `w: 1` for critical writes and losing data on failover.
:::

::: understand
- MongoDB = **documents + indexes + aggregation** for development speed, **replica sets** for availability, **sharding** for scale.
- Durability and consistency are tunable per operation (write concern, read concern, read preference).
- Atlas adds search, vector search and operations tooling on top.
:::

::: ask
- *"Self-hosted, Atlas, or AWS DocumentDB?"*
- *"What availability target? Single region or multi-region?"*
- *"Do we need search or vector search?"* (Atlas Search / Vector Search).
:::

::: important ⭐ Say this in the interview
"MongoDB is a document-oriented NoSQL database that stores JSON-like BSON documents in collections, so related data can be nested in one document and maps naturally to JavaScript objects. It has a rich query language, many index types, the aggregation pipeline, change streams and ACID transactions, with single-document writes always atomic. For availability it runs as a replica set: writes go to the primary, secondaries replicate the oplog, and if the primary fails a secondary is elected automatically; with a majority write concern acknowledged writes survive that failover. For scale it shards collections across machines by a shard key. In the cloud I'd usually use Atlas, and I'd check compatibility carefully before choosing DocumentDB."
:::

::: links
MongoDB: Introduction | https://www.mongodb.com/docs/manual/introduction/
MongoDB: Replication | https://www.mongodb.com/docs/manual/replication/
MongoDB: Write concern | https://www.mongodb.com/docs/manual/reference/write-concern/
MongoDB University (free courses) | https://learn.mongodb.com
:::

=== Database vs collection vs document
@p 3
@tags basics, structure
@quick
- **Database** = a namespace that groups collections (`shop`); **collection** = a group of documents (like a table: `users`); **document** = one record (like a row) with a unique `_id`.
- Hierarchy: cluster → database → collection → document → fields (fields can hold nested objects and arrays).
- Databases and collections are created **lazily** on the first insert; documents in one collection may differ in shape.
- Limits: **16 MB per document**; large files go to S3 (or GridFS) with only a reference stored.
- Mongoose maps model `User` → collection **`users`** (lowercased, pluralised).

::: text 🧒 In simple words
Think of a **library**. The library building is the **cluster**. Each **floor** is a database (children's books, science). On each floor, books are grouped on **shelves**: those are collections (all the "users", all the "orders"). Each **book** is a document: it has a unique catalogue number (`_id`), and inside it has chapters and pages (fields, nested objects, lists). Books on the same shelf usually look alike, but MongoDB doesn't force every book to have exactly the same chapters.
:::

::: text 📖 Detailed answer
| Level | SQL equivalent | Example | Notes |
|---|---|---|---|
| **Cluster / deployment** | Server | Atlas cluster, replica set | Holds many databases |
| **Database** | Database / schema | `shop` | Own collections, users/roles can be scoped to it |
| **Collection** | Table | `users`, `orders` | No fixed schema by default; indexes live here |
| **Document** | Row | `{ _id, name, address: { city }, tags: [...] }` | Unique `_id`; max 16 MB |
| **Field** | Column | `name`, `address.city` | Can be nested objects or arrays |

### Facts worth saying
- **Lazy creation**: `use shop` + an insert creates the database and the collection.
- **Explicit creation** when you need options: capped collections, validators (`$jsonSchema`), time-series collections, collation.
- **`_id`** is mandatory and unique per collection; the driver generates an `ObjectId` if you don't.
- **16 MB limit** per document: store files in S3 and keep the key/URL (GridFS exists for files > 16 MB inside MongoDB).
- **Naming**: collection names are plural nouns; Mongoose pluralises model names automatically.

### Special collection types
| Type | Use for |
|---|---|
| Capped collection | Fixed-size, insertion-ordered logs (oldest entries overwritten) |
| Time-series collection | Measurements over time (IoT, metrics), stored compactly |
| Collection with a TTL index | Data that should expire (sessions, OTPs) |
| View | Read-only result of an aggregation pipeline |
:::

::: diagram From cluster to field
flowchart TD
  C["Cluster"] --> D1["database: shop"]
  C --> D2["database: analytics"]
  D1 --> C1["collection: users"]
  D1 --> C2["collection: orders"]
  C1 --> DOC1["document: _id, name, address: {city}, tags: []"]
  C1 --> DOC2["document: _id, name, email"]
  DOC1 --> F1["field: address.city"]
:::

::: image A library: building (cluster), floors (databases), shelves (collections) and books (documents)
/images/mongodb-fundamentals/db-collection-document.svg
:::

::: text 🪜 Step by step
What happens on the very first `db.getSiblingDB('shop').users.insertOne({ name: 'Asha' })`:
1. MongoDB notices the database `shop` doesn't exist and creates it (lazily).
2. It creates the collection `users` with default options and the mandatory index on `_id`.
3. The driver had already added `_id: ObjectId(...)` to the document.
4. The document is stored; `show dbs` / `listDatabases` now lists `shop`.
5. Creating `audit_logs` explicitly as a **capped** 10 MB collection gives you a rolling log that never grows past its size.
6. A `$jsonSchema` validator on a collection makes the database reject documents that break the rules.
:::

::: code javascript Navigate and inspect the hierarchy (mongosh: run with mongosh --file hierarchy.js)
// How to run: mongosh "mongodb://localhost:27017" --file hierarchy.js
// (In the interactive shell you can also type: show dbs, use shop, show collections)
db = db.getSiblingDB('shop_hierarchy');
db.dropDatabase();

db.users.insertOne({ name: 'Vivek', address: { city: 'Delhi' }, tags: ['node'] });   // creates DB + collection
print('databases include shop_hierarchy:', db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map((d) => d.name).includes('shop_hierarchy'));
print('collections:', db.getCollectionNames().join(', '));

db.createCollection('audit_logs', { capped: true, size: 10 * 1024 * 1024, max: 3 });  // fixed size, max 3 docs
['login', 'view', 'logout', 'login-again'].forEach((event) => db.audit_logs.insertOne({ event, at: new Date() }));
print('capped keeps only the newest 3:', db.audit_logs.find().toArray().map((d) => d.event).join(', '));

printjson(db.users.findOne({}, { _id: 0 }));
const stats = db.runCommand({ collStats: 'users' });
print('users: count', stats.count, '| data size', stats.size, 'bytes | indexes', stats.nindexes);
print('_id was added automatically:', db.users.findOne()._id instanceof ObjectId);
:::

::: code javascript Browser demo: a nested model of cluster → db → collection → document (runnable)
const cluster = {
  shop: { users: [], orders: [] },
};
let counter = 0;
function insertOne(dbName, collName, doc) {
  cluster[dbName] ??= {};                                  // lazy database creation
  cluster[dbName][collName] ??= [];                        // lazy collection creation
  const withId = { _id: doc._id ?? `id-${++counter}`, ...doc };
  if (JSON.stringify(withId).length > 16 * 1024 * 1024) throw new Error('Document exceeds 16 MB');
  cluster[dbName][collName].push(withId);
  return withId._id;
}

insertOne('shop', 'users', { name: 'Asha', address: { city: 'Delhi' }, tags: ['node'] });
insertOne('analytics', 'events', { type: 'signup' });
console.log('databases:', Object.keys(cluster).join(', '), Object.keys(cluster).includes('analytics') ? '✅ created lazily' : '❌ FAIL');
console.log('collections in shop:', Object.keys(cluster.shop).join(', '), Object.keys(cluster.shop).length === 2 ? '✅' : '❌ FAIL');
const asha = cluster.shop.users[0];
console.log('document got an _id', asha._id === 'id-1' ? '✅' : '❌ FAIL');
console.log('nested field address.city →', asha.address.city, asha.address.city === 'Delhi' ? '✅' : '❌ FAIL');
const modelToCollection = (model) => `${model.toLowerCase()}s`;
console.log('Mongoose model User → collection', modelToCollection('User'), modelToCollection('User') === 'users' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Typos in collection names (`db.user` vs `db.users`) silently create a new empty collection on insert.
- Storing images or PDFs inside documents (16 MB limit, bloated working set) instead of S3 references.
- One collection per customer/tenant (thousands of collections) instead of a `tenantId` field.
- Forgetting that Mongoose pluralises (`Person` → `people`), then querying the wrong collection in mongosh.
:::

::: understand
- The hierarchy maps to SQL (database → table → row) but documents can **nest**, which changes modelling.
- Collections are the unit for **indexes, validation rules and sharding**.
- Lazy creation is convenient and dangerous: validate names in code, and use validators for important collections.
:::

::: ask
- *"Is this multi-tenant?"* → shared collections with `tenantId` vs database per tenant.
- *"Do we need special collections (capped, time-series, TTL)?"*
- *"Where do files live?"* → S3 + reference.
:::

::: important ⭐ Say this in the interview
"A MongoDB deployment holds databases, a database groups collections, and a collection holds documents. A collection is roughly a table and a document roughly a row, except that documents are BSON objects that can nest objects and arrays, don't all need the same fields, and each has a unique _id. Databases and collections are created lazily on the first insert, while special cases like capped, time-series or validated collections are created explicitly. A document can be at most 16 megabytes, so files go to S3 with a reference in the document. In Mongoose the model User maps to the users collection."
:::

::: links
MongoDB: Databases and collections | https://www.mongodb.com/docs/manual/core/databases-and-collections/
MongoDB: Documents | https://www.mongodb.com/docs/manual/core/document/
MongoDB: Capped collections | https://www.mongodb.com/docs/manual/core/capped-collections/
MongoDB: Time series collections | https://www.mongodb.com/docs/manual/core/timeseries-collections/
:::

=== What is BSON?
@p 2
@tags bson, data-types
@quick
- **BSON = Binary JSON**: the binary format MongoDB uses to **store** documents and send them over the network.
- Adds **types** JSON lacks: `ObjectId`, `Date`, `Int32`, `Int64`, `Double`, **`Decimal128`**, `Binary`, `Regex`, `Timestamp`.
- Length-prefixed fields → fast to scan and skip; size is about the same as JSON (measured: **157 B** BSON vs **161 B** JSON for a typical document).
- Money: use **Decimal128** or integers in minor units: summing doubles gives `0.30000000000000004`, Decimal128 gives exactly `0.3`.
- APIs convert BSON → JS objects → JSON (ObjectId → string, Date → ISO string); EJSON keeps type info when needed.

::: text 🧒 In simple words
JSON is like writing a note in **plain handwriting**: easy for people to read, but the computer has to read every letter to understand it, and it only knows "text", "number", "true/false" and lists. BSON is the same note written in a **compact code with labels**: every value says what type it is (this is a date, this is money, this is a 64-bit number) and how long it is, so the database can jump straight to the field it needs. It's a format for machines, used inside MongoDB; your API still sends normal JSON to the browser.
:::

::: text 📖 Detailed answer
**BSON (Binary JSON)** is a binary-encoded serialisation of JSON-like documents.

### Why MongoDB doesn't just store JSON
| Need | JSON | BSON |
|---|---|---|
| Dates | Strings (ambiguous formats) | Native `Date` (UTC milliseconds) |
| Exact money | Only floating-point numbers | `Decimal128` |
| Big integers | Lose precision above 2^53 in JS | `Int64` |
| Binary data | Base64 strings (+33%) | `Binary` subtype |
| Unique ids | Strings | `ObjectId` (12 bytes) |
| Fast field access | Parse everything | Length-prefixed: skip fields without parsing |

### Size
BSON stores type bytes and lengths, so it's sometimes slightly larger and sometimes smaller than JSON. For a typical user document (strings, numbers, a date, an array, a nested object) we measured **157 bytes** of BSON vs **161 bytes** of JSON text: about the same. Speed, not size, is the point.

### Types you should know
| BSON type | mongosh / driver | Use |
|---|---|---|
| ObjectId | `ObjectId()` | Default `_id` |
| Date | `new Date()` | Timestamps (stored as UTC) |
| Int32 / Int64 | `NumberInt(3)`, `NumberLong('9007199254740993')` | Counters, big ids |
| Double | `1.5` | Measurements (not money) |
| Decimal128 | `NumberDecimal('19.99')` / `Decimal128.fromString` | Money, exact decimals |
| Binary | `BinData(0, 'SGVsbG8=')` | Small binary blobs, UUIDs |

### Money, measured
Summing `0.1` and `0.2` stored as doubles in an aggregation gives `0.30000000000000004`; the same values stored as `Decimal128` sum to exactly `0.3`.
:::

::: diagram A document's journey through BSON
flowchart LR
  JS["JS object in Node"] -->|"driver serializes"| B["BSON bytes (typed, length-prefixed)"]
  B -->|"wire protocol"| M[("MongoDB stores BSON")]
  M -->|"query result"| B2["BSON bytes"]
  B2 -->|"driver deserializes"| JS2["JS object: ObjectId, Date, Decimal128"]
  JS2 -->|"res.json()"| J["JSON text to the browser"]
:::

::: chart bar Measured: the same user document as JSON text vs BSON (bytes)
Format,Bytes
JSON text,161
BSON,157
:::

::: image Plain handwriting vs a labelled code: BSON stores the type and length of every value
/images/mongodb-fundamentals/bson.svg
:::

::: text 🪜 Step by step
How `{ a: 1 }` becomes BSON bytes (`0c 00 00 00 10 61 00 01 00 00 00 00`):
1. `0c 00 00 00`: total document length = 12 bytes (int32, little-endian).
2. `10`: element type **0x10 = Int32**.
3. `61 00`: the field name `"a"` as a C string (null-terminated).
4. `01 00 00 00`: the value 1 as a 4-byte int32.
5. `00`: end of document.
6. Reading `{ a, b, c }` for field `c`, MongoDB can jump over `a` and `b` using their known sizes instead of parsing text.
:::

::: code javascript BSON types, sizes and exact money (node bson-types.js)
// How to run: npm install mongodb && MONGO_URI=mongodb://localhost:27017 node bson-types.js
const { MongoClient, BSON, Decimal128, Long, ObjectId } = require('mongodb');

async function main() {
  const tiny = BSON.serialize({ a: 1 });
  console.log('{ a: 1 } as BSON bytes:', Buffer.from(tiny).toString('hex').match(/../g).join(' '));

  const doc = { name: 'Vivek', age: 32, balance: 1500.5, tags: ['node', 'react'], address: { city: 'Delhi', pin: '110001' }, createdAt: new Date('2026-09-30T04:00:00Z'), active: true };
  console.log('JSON bytes:', Buffer.byteLength(JSON.stringify(doc)), '| BSON bytes:', BSON.serialize(doc).length);

  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const payments = client.db('bson_demo').collection('payments');
  await payments.deleteMany({});
  await payments.insertMany([
    { _id: new ObjectId(), asDouble: 0.1, asDecimal: Decimal128.fromString('0.1'), bigId: Long.fromString('9007199254740993'), paidAt: new Date() },
    { _id: new ObjectId(), asDouble: 0.2, asDecimal: Decimal128.fromString('0.2'), bigId: Long.fromString('9007199254740995'), paidAt: new Date() },
  ]);
  const [sum] = await payments.aggregate([{ $group: { _id: null, doubles: { $sum: '$asDouble' }, decimals: { $sum: '$asDecimal' } } }]).toArray();
  console.log('sum of doubles:', sum.doubles, '| sum of Decimal128:', sum.decimals.toString());
  console.log('types stored:', await payments.aggregate([{ $limit: 1 }, { $project: { _id: 0, id: { $type: '$_id' }, money: { $type: '$asDecimal' }, big: { $type: '$bigId' }, when: { $type: '$paidAt' } } }]).next());

  const fetched = await payments.findOne({}, { promoteLongs: false });
  console.log('Int64 kept exact:', fetched.bigId.toString(), '| as a JS number it would be', Number(fetched.bigId.toString()));
  console.log('sent to a browser as JSON:', JSON.stringify({ id: fetched._id, paidAt: fetched.paidAt }));
  await client.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: encode { a: 1 } as BSON by hand and see why money needs Decimal128 (runnable)
// Minimal BSON encoder for int32 fields only: shows the length-prefixed, typed layout.
function encodeInt32Doc(obj) {
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    const name = new TextEncoder().encode(key);
    const el = new Uint8Array(1 + name.length + 1 + 4);
    el[0] = 0x10;                                           // type: int32
    el.set(name, 1);                                        // field name
    el[1 + name.length] = 0;                                // C-string terminator
    new DataView(el.buffer).setInt32(2 + name.length, value, true);   // little-endian value
    parts.push(el);
  }
  const bodyLen = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(4 + bodyLen + 1);
  new DataView(out.buffer).setInt32(0, out.length, true);  // total length first
  let offset = 4;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  out[offset] = 0;                                          // end of document
  return out;
}
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join(' ');
const bytes = encodeInt32Doc({ a: 1 });
console.log('{ a: 1 } →', hex(bytes), hex(bytes) === '0c 00 00 00 10 61 00 01 00 00 00 00' ? '✅ matches real BSON' : '❌ FAIL');

console.log('doubles: 0.1 + 0.2 =', 0.1 + 0.2, 0.1 + 0.2 !== 0.3 ? '✅ inexact' : '❌ FAIL');
const cents = 10 + 20;                                      // integers in minor units are exact too
console.log('as integer cents: 10 + 20 =', cents, '→', (cents / 100).toFixed(2), cents === 30 ? '✅' : '❌ FAIL');
console.log('2^53 + 1 as a JS number:', 2 ** 53 + 1, 2 ** 53 + 1 === 2 ** 53 ? '✅ precision lost (why Int64 exists)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing money as doubles (rounding errors in totals and taxes).
- Storing dates as strings (`"30/09/2026"`) → wrong sorting, no date operators, time-zone confusion.
- Assuming JSON from the API preserves types: ObjectId and Date become strings; Int64 may lose precision.
- Comparing an ObjectId to its string form (`doc._id === '66f…'` is false): convert first.
:::

::: understand
- BSON is about **types and traversal speed**, not compression.
- Choose types deliberately: Date for time, Decimal128 or integer cents for money, Int64 for big counters.
- The API boundary converts types; document how ids and dates are represented in JSON.
:::

::: ask
- *"How do we store money: Decimal128 or minor units?"*
- *"Do any ids exceed 2^53?"* → send them as strings.
- *"Do other services read this data (Java, Python)?"* → consistent types matter even more.
:::

::: important ⭐ Say this in the interview
"BSON is binary JSON: MongoDB's storage and wire format. Every value carries a type and a length, so the database can skip fields without parsing text, and it adds types JSON lacks: ObjectId, real Dates, 32 and 64-bit integers, Decimal128 and binary. Size is about the same as JSON; in a quick test a typical document was 157 bytes in BSON and 161 as JSON. The types matter most for money: summing 0.1 and 0.2 as doubles gives 0.30000000000000004, while Decimal128 gives exactly 0.3, so I store money as Decimal128 or as integers in minor units. At the API boundary BSON becomes JSON, so ObjectIds and dates turn into strings."
:::

::: links
MongoDB: BSON types | https://www.mongodb.com/docs/manual/reference/bson-types/
bsonspec.org: BSON specification | https://bsonspec.org/spec.html
MongoDB: Model monetary data | https://www.mongodb.com/docs/manual/tutorial/model-monetary-data/
:::

=== What is a MongoDB ObjectId?
@p 2
@tags objectid, _id
@quick
- The default `_id`: **12 bytes** = **4-byte timestamp** (seconds) + **5-byte random** value (per process) + **3-byte counter**.
- Generated by the **driver** without asking the database → unique across machines, no central sequence.
- **Roughly time-ordered**: `sort({ _id: -1 })` ≈ newest first; `ObjectId(...).getTimestamp()` gives the creation time.
- Shown as 24 hex characters; validate route params (`/^[a-f\d]{24}$/i`, `mongoose.isValidObjectId`) → **400** instead of a 500 CastError.
- Not a secret and partly predictable: never use "knowing the id" as authorization.

::: text 🧒 In simple words
An ObjectId is like a **ticket number printed by a machine at the entrance**. The first part is the **time** the ticket was printed, the middle part identifies **which machine** printed it, and the last part is a **counter** that goes up with every ticket. Because each machine has its own identity and its own counter, thousands of machines can print tickets at the same time without ever printing the same number, and you can tell roughly when a ticket was printed just by looking at it.
:::

::: text 📖 Detailed answer
`ObjectId` is the default type for `_id`: 12 bytes, shown as 24 hexadecimal characters, e.g. `66f1c0a2e4b0a1b2c3d4e5f6`.

| Bytes | Hex chars | Meaning |
|---|---|---|
| 0–3 | `66f1c0a2` | Unix timestamp in **seconds** (creation time) |
| 4–8 | `e4b0a1b2c3` | Random value, unique per machine + process |
| 9–11 | `d4e5f6` | Counter, starting at a random value, incremented per id |

### Consequences
| Property | Why it matters |
|---|---|
| Generated client-side | No database round trip; works across shards and offline |
| Time-ordered (to the second) | `sort({ _id: -1 })` ≈ newest first; cursor pagination by `_id` |
| Contains its creation time | `getTimestamp()`; you may not need a separate `createdAt` |
| Not strictly ordered within a second across processes | Don't rely on `_id` for exact ordering of concurrent events |
| Predictable-ish | Authorization must not depend on ids being secret |

### Validating ids in APIs
A route like `GET /users/:id` with `id = "abc"` makes Mongoose throw a **CastError** (a 500 if unhandled). Validate first and return **400**, or map `CastError` to 400 in the error handler. For public, unguessable references (invoices, share links) use random UUIDs or slugs.

### Custom `_id`
You can use any unique, immutable value: a UUID, an email, a SKU, or a compound object. Changing `_id` later isn't possible (you'd insert a new document).
:::

::: diagram Anatomy of an ObjectId
flowchart LR
  OID["66f1c0a2 e4b0a1b2c3 d4e5f6"] --> T["4 bytes: timestamp (seconds)"]
  OID --> R["5 bytes: random per process"]
  OID --> C["3 bytes: counter"]
  T --> USE1["sort by _id ≈ by creation time"]
  T --> USE2["getTimestamp()"]
  R --> USE3["unique across machines without coordination"]
:::

::: image A ticket from the entrance machine: time printed, machine identity, and a counter
/images/mongodb-fundamentals/objectid.svg
:::

::: text 🪜 Step by step
What the driver does when you `insertOne({ name: 'Asha' })` without an `_id`:
1. Reads the current Unix time in seconds → `0x66f1c0a2` (4 bytes).
2. Uses the 5-byte random value created once when the process started.
3. Takes the next value of its 3-byte counter (wrapping around after 16,777,215).
4. Concatenates them into 12 bytes, puts the `ObjectId` on the document, and sends it.
5. Later, `doc._id.getTimestamp()` reads the first 4 bytes back as a `Date`.
6. In an API, `GET /users/xyz` should fail validation (not 24 hex chars) → 400 before any query runs.
:::

::: code javascript Generate, decode, sort and validate ObjectIds (node objectid.js)
// How to run: npm install mongodb express && MONGO_URI=mongodb://localhost:27017 node objectid.js
//             then: curl -s localhost:3000/users/abc   (400)   and the printed valid URL (200)
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');

async function main() {
  const id = new ObjectId();
  const hex = id.toHexString();
  console.log('new id:', hex, '| created at:', id.getTimestamp().toISOString());
  console.log('parts → time:', hex.slice(0, 8), 'random:', hex.slice(8, 18), 'counter:', hex.slice(18));
  console.log('valid?', ObjectId.isValid(hex), '| "abc" valid?', /^[a-f\d]{24}$/i.test('abc'));

  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const users = client.db('objectid_demo').collection('users');
  await users.deleteMany({});
  for (const name of ['first', 'second', 'third']) {
    await users.insertOne({ name });
    await new Promise((r) => setTimeout(r, 1100));               // ObjectId time has 1-second resolution
  }
  console.log('newest first by _id:', (await users.find().sort({ _id: -1 }).toArray()).map((u) => u.name).join(', '));
  const since = ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 2);   // "created in the last 2 seconds"
  console.log('created recently:', (await users.find({ _id: { $gte: since } }).toArray()).map((u) => u.name).join(', '));

  const app = express();
  app.get('/users/:id', async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });   // not a 500
    const user = await users.findOne({ _id: new ObjectId(req.params.id) });
    return user ? res.json({ ...user, createdAt: user._id.getTimestamp() }) : res.status(404).json({ error: 'Not found' });
  });
  const anyUser = await users.findOne();
  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, () => console.log(`try: curl -s localhost:${PORT}/users/${anyUser._id}`));
  setTimeout(async () => { server.close(); await client.close(); }, 15000).unref();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: decode and generate ObjectId-like ids (runnable)
const id = '66f1c0a2e4b0a1b2c3d4e5f6';
const isValid = (s) => /^[a-f\d]{24}$/i.test(s);
const timestampOf = (s) => new Date(parseInt(s.slice(0, 8), 16) * 1000);

console.log('valid id', isValid(id) ? '✅' : '❌ FAIL');
console.log('created at', timestampOf(id).toISOString(), timestampOf(id).getUTCFullYear() === 2024 ? '✅' : '❌ FAIL');
console.log('"abc" rejected before querying', !isValid('abc') && !isValid('66f1c0a2e4b0a1b2c3d4e5fZ') ? '✅' : '❌ FAIL');

// A tiny ObjectId generator: time + per-process random + counter
const processRandom = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
let counter = Math.floor(Math.random() * 0xffffff);
function objectId(seconds = Math.floor(Date.now() / 1000)) {
  counter = (counter + 1) % 0x1000000;
  return seconds.toString(16).padStart(8, '0') + processRandom + counter.toString(16).padStart(6, '0');
}
const ids = Array.from({ length: 1000 }, () => objectId());
console.log('1,000 ids in the same second are all unique', new Set(ids).size === 1000 ? '✅' : '❌ FAIL');
const older = objectId(1700000000), newer = objectId(1800000000);
console.log('later timestamps sort later', [newer, older].sort()[1] === newer ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Passing unvalidated strings into `new ObjectId()` / `findById` → CastError → 500.
- Comparing an ObjectId with `===` to a string (`doc._id === req.params.id` is always false); use `.equals()` or compare strings.
- Treating ids as secrets ("you can only see the invoice if you know its id").
- Expecting exact ordering by `_id` for events created in the same second on different servers.
:::

::: understand
- ObjectId = **decentralised uniqueness + embedded time**, designed for distributed inserts.
- It's a good default; choose a natural or random key when the domain gives you one.
- Time-ordered ids make `_id` a free index for "newest first" and cursor pagination.
:::

::: ask
- *"Will ids appear in public URLs?"* → UUIDs/slugs if enumeration matters, always with authorization.
- *"Do we need exact event ordering?"* → a sequence or timestamps with tie-breakers, not ObjectId alone.
- *"Do other systems need the same id?"* → client-generated ids (ObjectId or UUID) help with idempotent inserts.
:::

::: important ⭐ Say this in the interview
"An ObjectId is MongoDB's default _id: twelve bytes made of a four-byte timestamp in seconds, a five-byte random value unique to the process and a three-byte incrementing counter. Because the driver generates it without a central sequence, it's unique across machines and shards, and because it starts with the time, sorting by _id roughly sorts by creation time and getTimestamp gives the creation date. In APIs I validate that a parameter is 24 hex characters and return 400 instead of letting a CastError become a 500. And ids aren't secrets, so authorization never depends on someone not knowing an id."
:::

::: links
MongoDB: ObjectId | https://www.mongodb.com/docs/manual/reference/method/ObjectId/
MongoDB: The _id field | https://www.mongodb.com/docs/manual/core/document/#the-_id-field
:::

=== What is schema-less architecture?
@p 2
@tags schema, flexibility, validation
@quick
- "Schema-less" = the database **doesn't force** one structure: documents in a collection can have different fields.
- Better wording: **flexible schema** (schema-on-read). Your app always has an **implicit schema**; make it explicit.
- Enforce it with **Mongoose/Zod** in the app and **`$jsonSchema` validators** in the database (especially when several services write).
- Benefits: no migrations for new optional fields, **polymorphic** documents (laptop vs book attributes), nested data.
- Evolve safely with a `schemaVersion` field + lazy or batch migrations (the **Schema Versioning pattern**).

::: text 🧒 In simple words
Imagine a **school register**. A strict register (SQL) has fixed columns; adding "favourite sport" means redrawing every page. A flexible notebook (MongoDB) lets you add a line for one student without touching the others. That's convenient, but if nobody agrees what to write, one teacher writes "age: 15", another "age: fifteen", and a third forgets the age entirely. So good teams use a flexible notebook **with a printed checklist** (validation), and when the checklist changes they write the version number at the top of each page.
:::

::: text 📖 Detailed answer
In SQL, every row must match the table definition. In MongoDB, a collection accepts documents of any shape **unless you add validation**.

| | Schema-on-write (SQL) | Flexible schema (MongoDB) |
|---|---|---|
| Where rules live | Table DDL | App code (Mongoose/Zod) and optional `$jsonSchema` |
| Adding a field | `ALTER TABLE` / migration | Just write it (old documents lack it) |
| Different shapes per row | No (nullable columns, EAV tables) | Yes (polymorphic documents) |
| Risk | Slower changes | Inconsistent data if undisciplined |

### Enforcement layers
1. **App**: Mongoose schemas (types, required, enums, custom validators), or Zod at the API boundary.
2. **Database**: `$jsonSchema` validator with `validationLevel: 'strict' | 'moderate'` and `validationAction: 'error' | 'warn'`.
3. **Indexes**: unique and partial indexes enforce invariants concurrently.

### Evolving the schema
- Add a `schemaVersion` field.
- **Lazy migration**: when reading v1, convert to v2 in code and write it back.
- **Batch migration**: a script updates all documents (`updateMany` with an aggregation pipeline update).
- Keep readers tolerant of both versions during the transition.

### Good uses of flexibility
Product catalogs (different attributes per category), CMS blocks, event payloads, user preferences, integrations storing third-party data.
:::

::: diagram Flexible schema with guard rails
flowchart LR
  API["API request"] --> Z["Zod / Mongoose: app-level schema"]
  Z --> DBV{"$jsonSchema validator in MongoDB"}
  DBV -->|"valid"| C[("products: laptops and books in one collection")]
  DBV -->|"invalid"| E["write rejected: Document failed validation"]
  C --> R["readers handle schemaVersion 1 and 2"]
:::

::: image A flexible notebook with a printed checklist and a version number on every page
/images/mongodb-fundamentals/schema-less.svg
:::

::: text 🪜 Step by step
What the `$jsonSchema` validator below does with three inserts:
1. `{ name: 'MacBook', type: 'laptop', price: 1999, specs: { ram: 16 } }` → passes: required fields present, `price` is a number ≥ 0, `type` in the enum.
2. `{ name: 'Node Patterns', type: 'book', price: 35, isbn: '978-1' }` → passes: different fields, same collection (polymorphism).
3. `{ name: 'X', type: 'toaster', price: -5 }` → rejected with "Document failed validation" (enum + minimum).
4. With `validationAction: 'warn'` it would be stored and a warning logged instead (useful when introducing rules to old data).
5. A lazy migration reads a `schemaVersion: 1` document with `price` as a string, converts it, and writes it back as version 2.
:::

::: code javascript $jsonSchema validation, polymorphic documents and a migration (mongosh: run with mongosh --file schema.js)
// How to run: mongosh "mongodb://localhost:27017" --file schema.js
db = db.getSiblingDB('shop_schema');
db.products.drop();

db.createCollection('products', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'type', 'price'],
      properties: {
        name: { bsonType: 'string', minLength: 2 },
        type: { enum: ['laptop', 'book'] },
        price: { bsonType: ['double', 'int', 'decimal'], minimum: 0 },
        schemaVersion: { bsonType: 'int' },
      },
    },
  },
  validationAction: 'error',
});

db.products.insertMany([
  { name: 'MacBook', type: 'laptop', price: 1999, specs: { ram: 16, cpu: 'M4' }, schemaVersion: 2 },
  { name: 'Node Patterns', type: 'book', price: 35, isbn: '978-1', author: 'Mario', schemaVersion: 2 },
]);
print('polymorphic documents stored:', db.products.countDocuments());

try {
  db.products.insertOne({ name: 'X', type: 'toaster', price: -5 });
} catch (e) {
  print('rejected:', e.message.split('\n')[0]);
}

// An old v1 document (price stored as a string) inserted while validation is relaxed
db.runCommand({ collMod: 'products', validationAction: 'warn' });
db.products.insertOne({ name: 'Old Mouse', type: 'laptop', price: '25.50', schemaVersion: 1 });
db.runCommand({ collMod: 'products', validationAction: 'error' });

// Batch migration with an aggregation-pipeline update: v1 → v2
const res = db.products.updateMany({ schemaVersion: 1 }, [{ $set: { price: { $toDouble: '$price' }, schemaVersion: 2 } }]);
print('migrated:', res.modifiedCount, '| price now:', db.products.findOne({ name: 'Old Mouse' }).price);
print('all v2 now:', db.products.countDocuments({ schemaVersion: { $ne: 2 } }) === 0);
:::

::: code javascript Browser demo: lazy migration of mixed document versions (runnable)
// Readers must handle old and new shapes while a migration is in progress.
const docs = [
  { _id: 1, schemaVersion: 1, name: 'Mouse', price: '25.50' },                     // v1: price as a string
  { _id: 2, schemaVersion: 2, name: 'Keyboard', price: { amount: 4999, currency: 'INR' } },
  { _id: 3, name: 'Cable', price: 3 },                                             // no version: treat as v1
];
function toV2(doc) {
  if (doc.schemaVersion === 2) return doc;
  const amount = Math.round(Number(doc.price) * 100);                               // v1 stored rupees as text/number
  return { _id: doc._id, schemaVersion: 2, name: doc.name, price: { amount, currency: 'INR' } };
}
const migrated = docs.map(toV2);
console.log('every document is v2 after reading', migrated.every((d) => d.schemaVersion === 2) ? '✅' : '❌ FAIL');
console.log('string price converted to paise', migrated[0].price.amount === 2550 ? '✅' : '❌ FAIL');
console.log('v2 documents untouched', migrated[1] === docs[1] ? '✅' : '❌ FAIL');

const validate = (d) => typeof d.name === 'string' && d.name.length >= 2 && Number.isInteger(d.price?.amount) && d.price.amount >= 0;
console.log('all migrated documents pass validation', migrated.every(validate) ? '✅' : '❌ FAIL');
console.log('a bad document is caught', !validate({ name: 'X', price: { amount: -5 } }) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Saying "MongoDB has no schema" and skipping validation → `age: "30"` next to `age: 30`.
- Relying only on Mongoose when other services or scripts write to the same collection.
- Changing field meanings without a version marker or migration plan.
- Using flexibility to dump unrelated data into one collection ("everything" collection).
:::

::: understand
- Flexible schema moves the schema from the **database's rules** to **your discipline**; tools (Mongoose, Zod, `$jsonSchema`) make that discipline explicit.
- Polymorphism is the main benefit: one collection, many shapes, one query.
- Schema evolution is a process: version, migrate (lazily or in batches), then tighten validation.
:::

::: ask
- *"How many services write to this collection?"* → database-level validation.
- *"Which fields vary by type and which are common?"* → polymorphic design.
- *"How do we migrate existing documents?"*
:::

::: important ⭐ Say this in the interview
"Schema-less really means flexible schema: MongoDB doesn't force every document in a collection to have the same fields, which helps with evolving products and polymorphic data like a catalog where laptops and books have different attributes. But the application always has an implicit schema, so I make it explicit with Mongoose or Zod in the app, and with a $jsonSchema validator in the database when several services write to the same collection. When the shape changes I add a schemaVersion field and migrate, either lazily when documents are read or with a batch update, keeping readers compatible with both versions until the migration finishes."
:::

::: links
MongoDB: Schema validation | https://www.mongodb.com/docs/manual/core/schema-validation/
MongoDB: Schema versioning pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-schema-versioning-pattern
MongoDB: Polymorphic pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-polymorphic-pattern
:::

=== When would you normalize vs denormalize?
@p 2
@tags normalization, denormalization, modeling
@quick
- **Normalise** (store once, reference) when data changes often, is shared widely, or strict consistency matters.
- **Denormalise** (copy where it's read) for read-heavy screens and **historical snapshots** (order prices).
- Every copy needs a **sync plan**: fan-out updates, a queue job, change streams, or accepted staleness.
- Measured: a 20-post feed took **0.66 ms** with `$lookup` vs **0.36 ms** with an embedded author copy; renaming the author cost **1.4 ms** normalised vs **45 ms** to fan out to 5,045 posts.
- MongoDB rule of thumb: **model for your queries**, duplicating small, rarely-changing fields.

::: text 🧒 In simple words
Normalising is keeping **one master copy** of a fact, like one contact card for your friend, and everyone looks it up when needed. Denormalising is writing your friend's name **on every photo** of them: looking at a photo is instant, but if your friend changes their name, you must re-label every photo. Copy things that are read all the time and rarely change (a name on a post), keep one copy of things that change a lot (a stock price), and deliberately freeze copies that must never change (the price printed on an old receipt).
:::

::: text 📖 Detailed answer
| | Normalise (reference) | Denormalise (duplicate) |
|---|---|---|
| Reads | Need joins/`$lookup` or extra queries | One query |
| Writes | Update one place | Update every copy (fan-out) |
| Consistency | Always consistent | Eventually consistent copies |
| Storage | Smaller | Larger |
| Best for | Frequently changing, widely shared data | Read-heavy views, rarely changing fields, snapshots |

### Measured (MongoDB 7, 50,000 posts, 1,000 authors)
| Operation | Time |
|---|---|
| Feed of 20 posts with author name via `$lookup` (normalised) | 0.66 ms |
| Same feed with an embedded author copy (extended reference) | 0.36 ms |
| Rename an author: 1 `updateOne` on `users` (normalised) | 1.4 ms |
| Rename fan-out to 45 posts | 2.4 ms |
| Rename fan-out to 5,045 posts (a prolific author) | 45.3 ms |
Reads happen thousands of times per rename, so copying the name usually wins; prolific authors make fan-out a **background job**.

### Strategies to keep copies in sync
| Strategy | When |
|---|---|
| Synchronous `updateMany` in the same request | Few copies, rare changes |
| Queue job (BullMQ/SQS) | Many copies; accept seconds of staleness |
| Change streams on the source collection | Several services own different copies |
| Never sync (snapshot) | Historical facts: order line price, shipping address used |

### Patterns
**Extended reference** (`author: { id, name, avatarUrl }`), **computed** fields (`commentCount`, `avgRating`), **subset** (embed the latest 10 reviews, reference the rest).
:::

::: diagram Read path vs write path
flowchart LR
  subgraph N["Normalised"]
    NR["feed read"] --> NL["$lookup users for 20 posts"]
    NW["rename author"] --> NU["update 1 user document"]
  end
  subgraph D["Denormalised (extended reference)"]
    DR["feed read"] --> DO["read 20 posts, author name inside"]
    DW["rename author"] --> DQ["queue job: updateMany posts where author.id"]
  end
:::

::: chart bar Measured: cost of each approach (MongoDB 7, ms)
Operation,Milliseconds
Feed via $lookup,0.66
Feed with embedded copy,0.36
Rename (normalised),1.4
Rename fan-out 45 posts,2.4
Rename fan-out 5045 posts,45.3
:::

::: image One master contact card vs a name written on every photo
/images/mongodb-fundamentals/normalize-denormalize.svg
:::

::: text 🪜 Step by step
A user renames themselves in a blog platform using the extended-reference design below:
1. `PATCH /users/:id { name }` updates the **source of truth** (`users`), synchronously.
2. The service publishes a job "author renamed: id, newName" (here an in-process queue; in production BullMQ/SQS).
3. The API responds immediately; the feed may show the old name for a moment (accepted staleness).
4. The worker runs `updateMany({ 'author.id': id }, { $set: { 'author.name': newName } })` in batches.
5. Feeds keep reading posts with the author's name inside, without any `$lookup`.
6. Order line items are **never** re-synced: their name/price are snapshots by design.
:::

::: code javascript Extended reference with background fan-out (node denormalize.js)
// How to run: npm install mongodb && MONGO_URI=mongodb://localhost:27017 node denormalize.js
const { MongoClient } = require('mongodb');

async function main() {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const db = client.db('denormalize_demo');
  const users = db.collection('users');
  const posts = db.collection('posts');
  await Promise.all([users.deleteMany({}), posts.deleteMany({})]);
  await posts.createIndex({ 'author.id': 1 });

  await users.insertOne({ _id: 7, name: 'Asha', avatarUrl: '/a/7.png' });
  await posts.insertMany(Array.from({ length: 300 }, (_, i) => ({
    title: `Post ${i}`, author: { id: 7, name: 'Asha', avatarUrl: '/a/7.png' }, createdAt: new Date(Date.now() - i * 1000),
  })));

  // A tiny in-process job queue (production: BullMQ / SQS + a worker)
  const jobs = [];
  const enqueue = (job) => jobs.push(job);
  async function worker() {
    while (jobs.length) {
      const { userId, name } = jobs.shift();
      const res = await posts.updateMany({ 'author.id': userId, 'author.name': { $ne: name } }, { $set: { 'author.name': name } });
      console.log(`worker: fan-out updated ${res.modifiedCount} posts`);
    }
  }

  async function renameUser(userId, name) {
    await users.updateOne({ _id: userId }, { $set: { name } });   // source of truth first
    enqueue({ userId, name });                                     // copies later (eventually consistent)
  }

  const feed = () => posts.find({}, { projection: { _id: 0, title: 1, 'author.name': 1 } }).sort({ createdAt: -1 }).limit(2).toArray();
  await renameUser(7, 'Asha Rao');
  console.log('feed right after the rename (stale for a moment):', (await feed()).map((p) => p.author.name).join(', '));
  await worker();
  console.log('feed after the worker ran:', (await feed()).map((p) => p.author.name).join(', '));
  console.log('stale copies left:', await posts.countDocuments({ 'author.id': 7, 'author.name': { $ne: 'Asha Rao' } }));
  await client.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: read cost vs write cost as the read/write ratio changes (runnable)
// Using the measured numbers: which design costs less in total for a given workload?
const cost = {
  normalised: { read: 0.66, rename: 1.4 },
  denormalised: { read: 0.36, rename: (copies) => 1.4 + copies * 0.0087 },   // fan-out ≈ 45 ms per 5,045 copies
};
function totalMs(design, reads, renames, copies) {
  const c = cost[design];
  return reads * c.read + renames * (typeof c.rename === 'function' ? c.rename(copies) : c.rename);
}
const scenarios = [
  { name: 'blog feed (1M reads, 100 renames, 50 posts each)', reads: 1e6, renames: 100, copies: 50 },
  { name: 'rarely read, often renamed (1k reads, 10k renames, 5k copies)', reads: 1e3, renames: 1e4, copies: 5000 },
];
for (const s of scenarios) {
  const n = totalMs('normalised', s.reads, s.renames, s.copies);
  const d = totalMs('denormalised', s.reads, s.renames, s.copies);
  console.log(`${s.name}: normalised ${Math.round(n)} ms vs denormalised ${Math.round(d)} ms → ${d < n ? 'denormalise' : 'normalise'}`);
}
console.log('read-heavy workload favours copying', totalMs('denormalised', 1e6, 100, 50) < totalMs('normalised', 1e6, 100, 50) ? '✅' : '❌ FAIL');
console.log('write-heavy workload favours references', totalMs('normalised', 1e3, 1e4, 5000) < totalMs('denormalised', 1e3, 1e4, 5000) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Copying fast-changing data (stock levels, prices for checkout) into many documents.
- Denormalising without a sync plan → permanently stale copies.
- Normalising everything SQL-style and paying `$lookup` on every page view.
- Re-syncing historical snapshots (old orders suddenly showing new prices).
- Synchronous fan-out to thousands of documents inside a user request.
:::

::: understand
- It's a **read cost vs write cost** trade-off weighted by how often each happens.
- Duplicate small, stable, display-only fields; reference large, volatile, shared data.
- Staleness is a product decision: ask whether "a few seconds old" is acceptable.
:::

::: ask
- *"How often does the copied field change, and how many copies are there?"*
- *"Is slight staleness acceptable on this screen?"*
- *"Is this a historical fact that must never change?"* → snapshot.
:::

::: important ⭐ Say this in the interview
"Normalising stores each fact once and references it, which keeps writes simple and data consistent but costs joins on reads; denormalising copies a few fields where they're read, which makes reads one query but means updating copies when the source changes. In MongoDB I model for the queries: for a feed I'd store the author's id, name and avatar on each post, an extended reference. In a test the feed was about twice as fast that way, while a rename that fans out to five thousand posts took 45 milliseconds, so I'd run the fan-out as a background job and accept a few seconds of staleness. I keep volatile, shared data like stock referenced, and some copies, like prices on past orders, are snapshots that must never be re-synced."
:::

::: links
MongoDB: Extended reference pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-extended-reference-pattern
MongoDB: Computed pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-computed-pattern
MongoDB: Data modeling | https://www.mongodb.com/docs/manual/data-modeling/
:::
