@section MongoDB Fundamentals & CRUD
@icon 🍃
@color #10b981
@desc Documents, BSON, ObjectId, SQL vs NoSQL, embed vs reference, CRUD methods, operators and query practice.

=== SQL vs MongoDB: when would you choose each?
@p 3
@tags sql, nosql, comparison
@quick
- SQL: **tables/rows, fixed schema, JOINs, strong ACID** across tables → banking, ERP, complex relations/reporting.
- MongoDB: **collections/documents (JSON-like), flexible schema, embed related data**, horizontal scaling (sharding) → catalogs, content, user profiles, events, fast iteration.
- Mongo **has** transactions (4.0+), `$lookup` joins and schema validation, but design for your **access patterns** first.
- Terms: table→collection, row→document, column→field, JOIN→`$lookup`/embedding, PK→`_id`.

::: text
| | SQL (PostgreSQL, MySQL) | MongoDB |
|---|---|---|
| Data model | Tables with rows & columns | Collections of **documents** (BSON / JSON-like) |
| Schema | Fixed, enforced by DDL (`ALTER TABLE` for changes) | **Flexible**, optional JSON-schema validation / Mongoose schemas |
| Relationships | Foreign keys + **JOINs** | **Embedding** or references + `$lookup` |
| Transactions | Mature multi-row/multi-table ACID | Single-document ops are atomic; multi-document ACID since 4.0 (with overhead) |
| Scaling | Mostly vertical; read replicas; sharding is harder | **Horizontal sharding** built in; replica sets |
| Query language | SQL | MQL (JSON filters) + aggregation pipeline |
| Best for | Highly relational data, complex reporting, strict integrity (finance, inventory) | Evolving schemas, hierarchical data, high write throughput, read-heavy apps with known access patterns |

### Terminology mapping
**Database** → database · **Table** → collection · **Row** → document · **Column** → field · **Primary key** → `_id` · **JOIN** → embedding / `$lookup` · **Index** → index · **GROUP BY** → `$group`
:::

::: diagram Same data, two models
flowchart LR
  subgraph SQL["SQL: normalised"]
    U["users: id, name"] --- O["orders: id, user_id, total"]
    O --- I["order_items: order_id, product_id, qty"]
  end
  subgraph Mongo["MongoDB: document"]
    D["order: _id, user: name and id, items: array of product, qty, price, total"]
  end
:::

::: code javascript Same query in SQL and MongoDB
// SQL
// SELECT name, email FROM users WHERE age > 30 AND city = 'Delhi' ORDER BY created_at DESC LIMIT 10;

// MongoDB
db.users
  .find({ age: { $gt: 30 }, city: 'Delhi' }, { name: 1, email: 1, _id: 0 })
  .sort({ createdAt: -1 })
  .limit(10);

// SQL JOIN
// SELECT o.*, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'PAID';

// MongoDB $lookup
db.orders.aggregate([
  { $match: { status: 'PAID' } },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $unwind: '$user' },
  { $project: { total: 1, status: 1, 'user.name': 1 } },
]);
:::

::: understand
- Don't say "MongoDB has no schema". Say **"flexible schema, enforced in the application (Mongoose) or with JSON Schema validation"**.
- Don't say "MongoDB doesn't support transactions". It does (replica set required), but good document design often **avoids needing them**, because single-document writes are atomic.
- The real decision driver is **access patterns and relationships**, not hype.
:::

::: ask
- *"What are the main read/write patterns? How relational is the data? Do we need complex ad-hoc reporting?"* Heavy reporting → SQL or a data warehouse.
- *"What's the team's experience and the existing stack?"*
:::

::: links
MongoDB: SQL to MongoDB mapping chart | https://www.mongodb.com/docs/manual/reference/sql-comparison/
MongoDB vs SQL (official) | https://www.mongodb.com/resources/basics/databases/nosql-explained/nosql-vs-sql
:::

=== Embedded documents vs references: how do you decide?
@p 3
@tags data-modeling, embed, reference
@quick
- **Embed** when data is **read together**, owned by the parent (1:1, 1:few), bounded in size, and rarely updated independently (address, order items).
- **Reference** when data is **large/unbounded** (1:many-thousands), **shared** across documents (many:many), or updated independently (user ↔ orders, products).
- Hard limit: **16 MB per document**; avoid unbounded arrays.
- "Data that is accessed together should be stored together."
- Hybrid: reference + **denormalise a few fields** (e.g. store `productName`, `price` in the order item as a snapshot).

::: text
### Embedding
`{ _id, name, addresses: [{ city, pin }, …] }`
- ✅ **One read** gets everything, no joins; **atomic** updates of the parent + children.
- ❌ Document growth; duplication if shared; the 16 MB limit; large arrays are slow to update and index.

### Referencing
`orders: { _id, userId: ObjectId("…") }`
- ✅ No duplication, unbounded relationships, independent updates.
- ❌ Needs a second query or `$lookup`/`populate`; no single-document atomicity across them.

### Decision guide
| Relationship | Recommendation | Example |
|---|---|---|
| 1 : 1 | Embed | user → profile settings |
| 1 : few (bounded) | Embed | user → addresses (≤ 10) |
| 1 : many (hundreds–thousands) | Reference from the child (child stores the parent id) | user → orders |
| 1 : squillions (unbounded) | Reference from the child; never an array in the parent | server → log entries |
| Many : many | Array of ids on one or both sides / a join collection | students ↔ courses |
| Data needs a historical **snapshot** | Embed a copy | price & product name in an order item |
:::

::: diagram Decision flow
flowchart TD
  A{"Read together most of the time?"} -->|no| R["Reference"]
  A -->|yes| B{"Bounded and small? under hundreds of items"}
  B -->|no| R
  B -->|yes| C{"Shared by many parents or updated independently a lot?"}
  C -->|yes| R2["Reference + denormalise a few fields"]
  C -->|no| E["Embed"]
:::

::: code javascript Schemas: embed vs reference vs hybrid (Mongoose)
const { Schema, model, Types } = require('mongoose');

// EMBED: addresses belong only to the user and are always shown with them
const AddressSchema = new Schema({ label: String, line1: String, city: String, pin: String }, { _id: false });
const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  addresses: { type: [AddressSchema], validate: [(a) => a.length <= 10, 'Max 10 addresses'] },
});

// REFERENCE: users have unbounded orders → child stores parent id
const OrderSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED'] },
  // HYBRID: snapshot of product data at purchase time (price may change later!)
  items: [{
    productId: { type: Types.ObjectId, ref: 'Product' },
    name: String,          // denormalised snapshot
    unitPrice: Number,     // denormalised snapshot
    qty: Number,
  }],
  total: Number,
}, { timestamps: true });

// MANY-TO-MANY: array of references on one side (bounded)
const CourseSchema = new Schema({ title: String, studentIds: [{ type: Types.ObjectId, ref: 'User' }] });

module.exports = { User: model('User', UserSchema), Order: model('Order', OrderSchema), Course: model('Course', CourseSchema) };
:::

::: ask
- Always ask: *"What are the most frequent queries? What's the read/write ratio? How many child items can there be? Do children change independently?"*
- For "should orders be embedded in users?" see the scenario question in *MongoDB Scenarios*. The answer is usually **no** (unbounded growth).
:::

::: links
MongoDB: Data modeling introduction | https://www.mongodb.com/docs/manual/data-modeling/
6 Rules of thumb for schema design | https://www.mongodb.com/blog/post/6-rules-of-thumb-for-mongodb-schema-design
Building with Patterns (subset, extended reference, bucket…) | https://www.mongodb.com/blog/post/building-with-patterns-a-summary
:::

=== CRUD operations: insertOne, find, updateOne, deleteMany… (know them extremely well)
@p 3
@tags crud, mongodb, queries
@quick
- Create: `insertOne(doc)`, `insertMany([docs], { ordered: false })`
- Read: `find(filter, projection).sort().skip().limit()`, `findOne(filter)`, `countDocuments(filter)`
- Update: `updateOne(filter, update, { upsert })`, `updateMany`, `replaceOne`, `findOneAndUpdate(..., { returnDocument: 'after' })`
- Delete: `deleteOne(filter)`, `deleteMany(filter)`; `deleteMany({})` deletes ALL ⚠️
- Updates **must use operators** (`$set`, `$inc`…); without them you replace the document (in replaceOne).

::: text
### Create
- `insertOne(doc)` → `{ acknowledged, insertedId }`. MongoDB adds `_id` if missing.
- `insertMany(docs, { ordered: false })` → continues past errors (e.g. duplicates) when `ordered: false`.

### Read
- `find(filter, projection)` returns a **cursor** (lazy); chain `.sort()`, `.skip()`, `.limit()`.
- `findOne(filter)` → the first matching document or `null`.
- Projection: `{ name: 1, email: 1, _id: 0 }` (include) or `{ password: 0 }` (exclude). Don't mix include and exclude except for `_id`.
- `countDocuments(filter)` (accurate), `estimatedDocumentCount()` (fast, uses metadata).
- `distinct('city')`.

### Update
- `updateOne(filter, update, options)` / `updateMany(...)` → `{ matchedCount, modifiedCount, upsertedId }`.
- `upsert: true` → insert if nothing matches.
- `findOneAndUpdate(filter, update, { returnDocument: 'after' })` → returns the document (Mongoose uses `{ new: true }`).
- `replaceOne(filter, newDoc)` → replace the whole document except `_id`.
- `bulkWrite([...])` → many different operations in one round trip.

### Delete
- `deleteOne(filter)`, `deleteMany(filter)`, `findOneAndDelete(filter)`.
- ⚠️ `deleteMany({})` removes **every** document. Many teams use **soft deletes** (`isDeleted: true, deletedAt`).
:::

::: code javascript mongosh: complete CRUD walkthrough (paste into mongosh / Compass shell)
use shop

// ---------- CREATE ----------
db.users.insertOne({ name: 'Vivek', email: 'vivek@x.com', age: 32, city: 'Delhi', isActive: true, balance: 500, tags: ['react', 'node'], address: { city: 'Delhi', pin: '110001' }, createdAt: new Date() });

db.users.insertMany([
  { name: 'Asha', email: 'asha@x.com', age: 27, city: 'Pune', isActive: true, balance: 1200, tags: ['aws'], address: { city: 'Pune' }, createdAt: new Date('2026-01-10') },
  { name: 'Rahul', email: 'rahul@x.com', age: 41, city: 'Delhi', isActive: false, balance: 0, tags: [], address: { city: 'Delhi' }, createdAt: new Date('2025-11-02') },
], { ordered: false });

// ---------- READ ----------
db.users.find({ city: 'Delhi' });                                  // all from Delhi
db.users.findOne({ email: 'vivek@x.com' });
db.users.find({ age: { $gte: 30 } }, { name: 1, age: 1, _id: 0 }); // projection
db.users.find().sort({ createdAt: -1 }).limit(5);                  // newest 5
db.users.countDocuments({ isActive: true });
db.users.distinct('city');

// ---------- UPDATE ----------
db.users.updateOne({ email: 'vivek@x.com' }, { $set: { city: 'Bengaluru' }, $inc: { balance: 100 } });
db.users.updateMany({ isActive: false }, { $set: { status: 'archived' } });
db.users.updateOne({ email: 'new@x.com' }, { $setOnInsert: { createdAt: new Date() }, $set: { name: 'New' } }, { upsert: true });
db.users.findOneAndUpdate({ email: 'asha@x.com' }, { $push: { tags: 'mongodb' } }, { returnDocument: 'after' });
db.users.replaceOne({ email: 'new@x.com' }, { name: 'Replaced', email: 'new@x.com' });

// ---------- DELETE ----------
db.users.deleteOne({ email: 'new@x.com' });
db.users.deleteMany({ isActive: false, balance: 0 });

// ---------- BULK ----------
db.users.bulkWrite([
  { updateOne: { filter: { email: 'vivek@x.com' }, update: { $inc: { balance: -50 } } } },
  { deleteOne: { filter: { email: 'nobody@x.com' } } },
  { insertOne: { document: { name: 'Bulk', email: 'bulk@x.com' } } },
]);
:::

::: code javascript Same thing with the Node.js MongoDB driver
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27018');
  await client.connect();
  const users = client.db('shop').collection('users');

  const { insertedId } = await users.insertOne({ name: 'Test', email: `t${Date.now()}@x.com`, balance: 0 });
  const user = await users.findOne({ _id: insertedId }, { projection: { name: 1, balance: 1 } });
  const res = await users.updateOne({ _id: new ObjectId(insertedId) }, { $inc: { balance: 250 } });
  console.log(user, res.modifiedCount);
  const list = await users.find({ balance: { $gt: 100 } }).sort({ balance: -1 }).limit(10).toArray();
  console.log(list.length);
  await users.deleteOne({ _id: insertedId });
  await client.close();
}
main().catch(console.error);
:::

::: warning
- Forgetting `$set`: `updateOne({ _id }, { name: 'X' })` throws in modern drivers ("update document requires atomic operators"). Mongoose silently wraps it in `$set`.
- `findOne` inside a loop (N+1 queries). Use `$in` or aggregation instead.
- `find()` without `limit` on large collections.
- Using `deleteMany` with an empty filter by accident.
:::

::: ask
- *"Hard delete or soft delete?"* (audit / undo requirements) *"Do we need upsert semantics?"* *"Should the update return the new document?"*
:::

::: links
MongoDB CRUD operations | https://www.mongodb.com/docs/manual/crud/
Node.js driver usage examples | https://www.mongodb.com/docs/drivers/node/current/usage-examples/
:::

=== Query & update operators: $set, $unset, $inc, $push, $pull, $in, $nin, $gt…, $or, $and
@p 3
@tags operators, queries
@quick
- Comparison: `$eq $ne $gt $gte $lt $lte $in $nin`
- Logical: `$and` (implicit with commas), `$or`, `$nor`, `$not`
- Element/array: `$exists`, `$type`, `$all`, `$elemMatch`, `$size`
- Update: `$set` (set field), `$unset` (remove field), `$inc` (add number), `$push`/`$addToSet` (add to array), `$pull` (remove matching), `$pop`, `$rename`, `$min/$max`, `$currentDate`
- `$push` + `$each` + `$slice` → keep only the last N items.

::: text
### Query operators (in the filter)
| Operator | Example | Meaning |
|---|---|---|
| `$gt $gte $lt $lte` | `{ age: { $gte: 18, $lt: 30 } }` | Range |
| `$ne` | `{ status: { $ne: 'deleted' } }` | Not equal (⚠️ can't use an index efficiently) |
| `$in` | `{ city: { $in: ['Delhi', 'Pune'] } }` | Matches any in the list |
| `$nin` | `{ role: { $nin: ['admin', 'bot'] } }` | None of the list |
| `$and` | `{ $and: [{ age: { $gt: 18 } }, { age: { $lt: 60 } }] }` | Usually implicit: `{ a: 1, b: 2 }` |
| `$or` | `{ $or: [{ city: 'Delhi' }, { balance: { $gt: 1000 } }] }` | Any condition |
| `$exists` | `{ phone: { $exists: true } }` | Field present |
| `$regex` | `{ name: { $regex: '^vi', $options: 'i' } }` | Pattern (anchored prefix can use an index) |
| `$elemMatch` | `{ items: { $elemMatch: { qty: { $gt: 2 }, price: { $lt: 100 } } } }` | **Same** array element matches all conditions |
| `$all` | `{ tags: { $all: ['node', 'react'] } }` | Array contains all |
| `$size` | `{ tags: { $size: 0 } }` | Array length exactly |

### Update operators
| Operator | Example | Effect |
|---|---|---|
| `$set` | `{ $set: { city: 'Pune', 'address.pin': '411001' } }` | Set / add fields (dot notation for nested) |
| `$unset` | `{ $unset: { tempToken: '' } }` | Remove field |
| `$inc` | `{ $inc: { balance: 100, loginCount: 1 } }` | Atomic increment (negative to decrement) |
| `$push` | `{ $push: { tags: 'aws' } }` | Append (allows duplicates) |
| `$addToSet` | `{ $addToSet: { tags: 'aws' } }` | Append only if not present |
| `$push + $each + $slice` | `{ $push: { recent: { $each: [x], $slice: -10 } } }` | Keep the last 10 |
| `$pull` | `{ $pull: { tags: 'old' } }` / `{ $pull: { items: { qty: 0 } } }` | Remove matching elements |
| `$pop` | `{ $pop: { queue: -1 } }` | Remove first (-1) / last (1) |
| `$rename` | `{ $rename: { fullname: 'name' } }` | Rename field |
| `$min / $max` | `{ $max: { highScore: 950 } }` | Update only if lower/higher |
| `$` positional | `updateOne({ 'items.sku': 'A1' }, { $set: { 'items.$.qty': 5 } })` | Update the matched array element |
| `$[]` / `$[el]` | `{ $inc: { 'items.$[].qty': 1 } }` | Update all / filtered elements |
:::

::: code javascript mongosh: operator practice set
// Comparison + logical
db.users.find({ age: { $gte: 25, $lte: 35 }, city: { $in: ['Delhi', 'Pune'] } });
db.users.find({ $or: [{ balance: { $gt: 1000 } }, { tags: 'aws' }] });
db.users.find({ role: { $nin: ['admin'] }, phone: { $exists: false } });

// Arrays
db.users.find({ tags: 'node' });                           // array contains 'node'
db.users.find({ tags: { $all: ['node', 'react'] } });
db.orders.find({ items: { $elemMatch: { sku: 'A1', qty: { $gte: 2 } } } });

// $set / $unset / $inc
db.users.updateOne({ email: 'vivek@x.com' }, { $set: { 'address.pin': '560001' }, $unset: { tempToken: '' }, $inc: { loginCount: 1 } });

// $push / $addToSet / $pull
db.users.updateOne({ email: 'vivek@x.com' }, { $addToSet: { tags: 'docker' } });
db.users.updateOne({ email: 'vivek@x.com' }, { $pull: { tags: { $in: ['old', 'legacy'] } } });
db.users.updateOne({ email: 'vivek@x.com' }, { $push: { recentSearches: { $each: ['s3 presigned'], $slice: -5 } } }); // keep last 5

// Positional updates in arrays
db.orders.updateOne({ _id: ObjectId('...'), 'items.sku': 'A1' }, { $set: { 'items.$.qty': 3 } });
db.orders.updateMany({}, { $mul: { 'items.$[i].price': 0.9 } }, { arrayFilters: [{ 'i.category': 'books' }] }); // 10% off books
:::

::: code javascript Try it: a mini query matcher to understand operators (runs in browser)
const users = [
  { name: 'Vivek', age: 32, city: 'Delhi', tags: ['node', 'react'], balance: 500 },
  { name: 'Asha', age: 27, city: 'Pune', tags: ['aws'], balance: 1200 },
  { name: 'Rahul', age: 41, city: 'Delhi', tags: [], balance: 0 },
];

const ops = {
  $gt: (v, x) => v > x, $gte: (v, x) => v >= x, $lt: (v, x) => v < x, $lte: (v, x) => v <= x,
  $ne: (v, x) => v !== x, $in: (v, x) => x.includes(v), $nin: (v, x) => !x.includes(v),
};
function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$and') return cond.every((f) => matches(doc, f));
    const val = doc[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, x]) => ops[op](val, x));
    }
    return Array.isArray(val) ? val.includes(cond) : val === cond;
  });
}
const find = (filter) => users.filter((u) => matches(u, filter)).map((u) => u.name);

console.log(find({ city: 'Delhi' }));
console.log(find({ age: { $gt: 30 } }));
console.log(find({ city: { $in: ['Pune', 'Mumbai'] } }));
console.log(find({ $or: [{ balance: { $gte: 1000 } }, { tags: 'node' }] }));
console.log(find({ city: 'Delhi', age: { $lt: 40 } })); // implicit $and
:::

::: ask
- *"Should duplicates be allowed in the array?"* → `$push` vs `$addToSet`.
- *"Can arrays grow unbounded?"* → use `$slice` or move the data to a separate collection.
:::

::: links
Query & projection operators | https://www.mongodb.com/docs/manual/reference/operator/query/
Update operators | https://www.mongodb.com/docs/manual/reference/operator/update/
:::

=== MongoDB query practice: write these queries
@p 3
@tags queries, practice
@quick
- Active users: `find({ isActive: true })`
- Older than 30: `find({ age: { $gt: 30 } })`
- Newest first: `find().sort({ createdAt: -1 })`
- Page 3 with 20 records: `find().sort({ _id: 1 }).skip(40).limit(20)`
- Search by name: `find({ name: { $regex: 'viv', $options: 'i' } })` or a text index + `$text`
- Increase balance: `updateOne({ _id }, { $inc: { balance: 100 } })`
- Nested: `find({ 'address.city': 'Delhi' })` (dot notation, quoted)

::: text
These seven queries come straight from real interviews. Practise writing them **without looking**, then check against the solutions below.

1. **Find all active users.**
2. **Find users older than 30.**
3. **Get newest users first.**
4. **Get page 3 with 20 records.**
5. **Search users by name.**
6. **Increase a user's balance.**
7. **Find users whose `address.city` is Delhi.**

Bonus ones interviewers add: count users per city, users with no orders, the top 5 spenders (see the *Aggregation* section).
:::

::: code javascript Solutions (mongosh + Mongoose equivalents)
// 1) Active users
db.users.find({ isActive: true });
// User.find({ isActive: true }).lean();

// 2) Older than 30
db.users.find({ age: { $gt: 30 } });
// User.find({ age: { $gt: 30 } });

// 3) Newest first
db.users.find().sort({ createdAt: -1 });           // or sort({ _id: -1 }) since ObjectId contains a timestamp
// User.find().sort({ createdAt: -1 });

// 4) Page 3, 20 per page → skip (3-1)*20 = 40
db.users.find().sort({ createdAt: -1, _id: -1 }).skip(40).limit(20);
// User.find().sort('-createdAt -_id').skip(40).limit(20);

// 5) Search by name
db.users.find({ name: { $regex: 'viv', $options: 'i' } });   // contains, case-insensitive (can't use index well)
db.users.find({ name: { $regex: '^Viv' } });                 // prefix → CAN use an index on name
db.users.createIndex({ name: 'text', email: 'text' });
db.users.find({ $text: { $search: 'vivek' } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });

// 6) Increase balance (atomic — no read-modify-write race)
db.users.updateOne({ _id: ObjectId('66f1c0a2e4b0a1b2c3d4e5f6') }, { $inc: { balance: 100 } });
// Guard against negative balance when debiting:
db.users.updateOne({ _id: ObjectId('66f1c0a2e4b0a1b2c3d4e5f6'), balance: { $gte: 300 } }, { $inc: { balance: -300 } });

// 7) Nested field — dot notation must be quoted
db.users.find({ 'address.city': 'Delhi' });
// ⚠️ db.users.find({ address: { city: 'Delhi' } }) matches ONLY if address is EXACTLY { city: 'Delhi' } (same fields & order)
:::

::: code javascript Try it: the same queries on a JS array (runs in browser)
const users = Array.from({ length: 75 }, (_, i) => ({
  _id: i + 1,
  name: ['Vivek', 'Asha', 'Rahul', 'Vikram', 'Priya'][i % 5] + ' ' + (i + 1),
  age: 20 + (i % 30),
  isActive: i % 3 !== 0,
  balance: i * 10,
  address: { city: ['Delhi', 'Pune', 'Mumbai'][i % 3] },
  createdAt: new Date(2026, 0, 1 + i),
}));

console.log('1 active:', users.filter((u) => u.isActive).length);
console.log('2 age>30:', users.filter((u) => u.age > 30).length);
console.log('3 newest:', [...users].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map((u) => u.name));
const page = 3, limit = 20;
console.log('4 page 3:', users.slice((page - 1) * limit, page * limit).map((u) => u._id).join(','));
console.log('5 search "vi":', users.filter((u) => /vi/i.test(u.name)).length);
const u = users.find((x) => x._id === 5); u.balance += 100;
console.log('6 balance:', u.balance);
console.log('7 Delhi:', users.filter((x) => x.address.city === 'Delhi').length);
:::

::: ask
- For search: *"Is it contains, prefix or full-text? How big is the collection?"* Regex "contains" can't use an index, so at scale use **Atlas Search / Elasticsearch**.
- For balance: *"Can the balance go negative? Do we need an audit log (a ledger collection)?"*
:::

::: links
MongoDB: query documents | https://www.mongodb.com/docs/manual/tutorial/query-documents/
Query embedded documents | https://www.mongodb.com/docs/manual/tutorial/query-embedded-documents/
:::

=== What is MongoDB?
@p 2
@tags basics
@quick
- Open-source **document-oriented NoSQL** database storing **BSON** documents in collections.
- Flexible schema, rich queries, indexes, aggregation pipeline, transactions.
- **Replica sets** (high availability, automatic failover) + **sharding** (horizontal scale).
- Managed: **MongoDB Atlas** (AWS/GCP/Azure), AWS alternative: DocumentDB (Mongo-compatible).

::: text
**MongoDB** is a general-purpose, **document-oriented NoSQL database**. Data is stored as **documents** (JSON-like, stored in binary **BSON**) inside **collections**.

### Key features
- **Flexible schema**: documents in the same collection can have different fields, which makes the schema easy to evolve.
- **Rich query language**: filters, projections, sorting, geospatial queries, text search, and a powerful **aggregation pipeline**.
- **Indexes**: single, compound, multikey (arrays), text, geospatial, TTL, unique, partial.
- **High availability**: **replica sets**, with one primary and N secondaries plus automatic failover.
- **Horizontal scaling**: **sharding** distributes data across machines by a shard key.
- **ACID transactions**: single-document writes are always atomic; multi-document transactions since 4.0.
- **Change streams**: subscribe to real-time data changes (great for notifications and dashboards).

### Why full-stack JS developers like it
Documents map naturally to **JS objects/JSON**, so the same shape flows from MongoDB → Node → React.
:::

::: diagram Replica set
flowchart LR
  APP["Node app"] -->|"writes and reads"| P[("Primary")]
  P -->|"replication oplog"| S1[("Secondary 1")]
  P -->|"replication oplog"| S2[("Secondary 2")]
  S1 -.->|"election if primary fails"| P
:::

::: ask
- *"Self-hosted, Atlas, or AWS DocumentDB?"* DocumentDB isn't 100% compatible (some aggregation operators differ). Worth mentioning if they use AWS.
:::

::: links
What is MongoDB | https://www.mongodb.com/docs/manual/introduction/
MongoDB University (free courses) | https://learn.mongodb.com
:::

=== Database vs collection vs document
@p 2
@tags basics, structure
@quick
- **Database** = container of collections (e.g. `shop`).
- **Collection** = group of documents (like a table) (e.g. `users`, `orders`); no enforced schema by default.
- **Document** = one record, a BSON object with a unique `_id` (like a row); max **16 MB**.
- Hierarchy: cluster → database → collection → document → fields (can nest objects/arrays).

::: text
| Level | SQL equivalent | Example |
|---|---|---|
| **Cluster / deployment** | Server | Atlas cluster, replica set |
| **Database** | Database / schema | `shop` |
| **Collection** | Table | `users`, `orders`, `products` |
| **Document** | Row | `{ _id: ObjectId(...), name: "Vivek", address: { city: "Delhi" }, tags: ["node"] }` |
| **Field** | Column | `name`, `address.city` |

- Databases and collections are created **lazily** on the first insert.
- Every document **must** have a unique `_id` (auto-generated `ObjectId` if you don't provide one).
- Documents can contain **nested objects and arrays**, which a flat SQL row can't do.
- **Max document size: 16 MB.** For larger files use **GridFS** or (better) **S3** and store only the URL.
:::

::: diagram
flowchart TD
  C["Cluster"] --> D1["DB: shop"]
  C --> D2["DB: analytics"]
  D1 --> C1["collection: users"]
  D1 --> C2["collection: orders"]
  C1 --> DOC1["document: _id, name, address, tags"]
  C1 --> DOC2["document: _id, name, email"]
:::

::: code javascript mongosh navigation
show dbs                     // list databases
use shop                     // switch (created on first write)
show collections
db.createCollection('audit_logs', { capped: true, size: 10485760 }) // explicit, fixed-size (10MB) collection
db.users.insertOne({ name: 'Vivek', address: { city: 'Delhi' }, tags: ['node'] })
db.users.findOne()
db.users.stats().size        // collection size in bytes
db.stats()                   // database stats
:::

::: ask
- It's fine to mention that in Mongoose, the **model name `User`** maps to the **collection `users`** (lowercased + pluralised).
:::

::: links
Databases and collections | https://www.mongodb.com/docs/manual/core/databases-and-collections/
Documents | https://www.mongodb.com/docs/manual/core/document/
:::

=== What is BSON?
@p 2
@tags bson, data-types
@quick
- **BSON = Binary JSON**: MongoDB's binary storage/wire format.
- Faster to traverse (length-prefixed), and supports **extra types**: ObjectId, Date, Decimal128, Int32/Int64, Binary, Regex.
- JSON has no Date/ObjectId/int types; BSON does.
- Use **Decimal128** for money (or integers in minor units), not floating-point doubles.

::: text
**BSON (Binary JSON)** is the binary-encoded serialisation MongoDB uses to **store** documents and **send** them over the network.

### Why not plain JSON?
- **More data types**: `ObjectId`, `Date`, `Decimal128`, `Int32`, `Int64`, `Double`, `Binary` (BinData), `Timestamp`, `Regex`, `MinKey/MaxKey`.
- **Efficient traversal**: fields are length-prefixed, so the database can skip over fields without parsing everything.
- **Typed numbers**: JSON has only one "number" type.

| JSON | BSON |
|---|---|
| Text, human readable | Binary, machine efficient |
| string, number, boolean, null, array, object | + ObjectId, Date, Int32, Int64, Decimal128, Binary, Regex… |
| Sometimes smaller | Sometimes slightly bigger (type + length metadata) |

When your API returns data, **Node converts BSON → JS objects → JSON**. `ObjectId` becomes a string and `Date` becomes an ISO string.
:::

::: code javascript BSON types in practice (mongosh)
db.payments.insertOne({
  _id: ObjectId(),
  amount: NumberDecimal('1999.99'),  // Decimal128 → exact money arithmetic
  quantity: NumberInt(3),            // Int32
  views: NumberLong('9007199254740993'), // Int64 (beyond JS safe integer!)
  paidAt: new Date(),                // Date (UTC milliseconds)
  receipt: BinData(0, 'SGVsbG8='),   // Binary
});

db.payments.find({ amount: { $type: 'decimal' } });
// Why Decimal128? In JS (double): 0.1 + 0.2 = 0.30000000000000004
:::

::: ask
- If they ask about money, say: *"Store amounts as integers in the smallest unit (paise/cents) or as Decimal128, never as floating-point doubles."*
:::

::: links
BSON types | https://www.mongodb.com/docs/manual/reference/bson-types/
bsonspec.org | https://bsonspec.org
:::

=== What is a MongoDB ObjectId?
@p 2
@tags objectid, _id
@quick
- 12-byte default `_id`: **4-byte timestamp (seconds) + 5-byte random (per process) + 3-byte incrementing counter**.
- Globally unique without coordination → generated by the driver/client.
- **Roughly sortable by creation time** → `sort({ _id: -1 })` ≈ newest first; `id.getTimestamp()`.
- Shown as a 24-char hex string; validate with `/^[a-f\d]{24}$/i` or `mongoose.isValidObjectId`.
- Not a secret: ids are guessable-ish, so always do authorization checks.

::: text
`ObjectId` is the default type for `_id`. It's **12 bytes** (24 hex characters), for example `66f1c0a2e4b0a1b2c3d4e5f6`:

| Bytes | Meaning |
|---|---|
| 4 | **Unix timestamp** in seconds (creation time) |
| 5 | Random value unique to the machine + process |
| 3 | Incrementing counter (starts at a random value) |

### Consequences
- Generated **client-side** (by the driver) with no DB round trip and no central counter, so it works across shards.
- **Time-ordered** (at second granularity): sorting by `_id` ≈ sorting by creation time, which is handy for **cursor pagination**.
- You can extract the creation date: `ObjectId(...).getTimestamp()`.
- Casting: an invalid string causes a Mongoose **CastError**, so validate route params (→ 400, not 500).
- You can use your own `_id` (UUID, email, slug) if it's naturally unique and immutable.
:::

::: code javascript Try it: decode an ObjectId (runs in browser)
const id = '66f1c0a2e4b0a1b2c3d4e5f6';
const isValid = /^[a-f\d]{24}$/i.test(id);
const seconds = parseInt(id.slice(0, 8), 16);
console.log('valid:', isValid);
console.log('timestamp part:', id.slice(0, 8), '→', new Date(seconds * 1000).toISOString());
console.log('random part   :', id.slice(8, 18));
console.log('counter part  :', id.slice(18), '→', parseInt(id.slice(18), 16));

// Generate an ObjectId-like value for "now"
const hex = (n, len) => n.toString(16).padStart(len, '0');
const fake = hex(Math.floor(Date.now() / 1000), 8) + hex(Math.floor(Math.random() * 2 ** 40), 10) + hex(1, 6);
console.log('new id:', fake);
:::

::: code javascript Mongoose: validate ids in routes
const mongoose = require('mongoose');

router.get('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id' });
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ ...user, createdAtFromId: user._id.getTimestamp() });
});
:::

::: ask
- *"Should ids be exposed publicly?"* If enumeration is a concern (e.g. invoice URLs), use random UUIDs or slugs in public URLs and always enforce authorization.
:::

::: links
ObjectId docs | https://www.mongodb.com/docs/manual/reference/method/ObjectId/
:::

=== What is schema-less architecture?
@p 2
@tags schema, flexibility, validation
@quick
- "Schema-less" = the **database doesn't force** a fixed structure; documents in a collection can differ.
- Reality: there's always an **implicit schema** in your app, so enforce it with **Mongoose** or MongoDB **JSON Schema validation** (`$jsonSchema`).
- Pros: fast iteration, polymorphic data (product types with different attributes), no migrations for new fields.
- Cons: inconsistent data if undisciplined; need versioning (`schemaVersion` field) + lazy migrations.

::: text
In SQL, every row must match the table definition. In MongoDB, **the collection doesn't enforce a structure by default**, so two documents can have different fields.

**Better phrasing for interviews:** MongoDB has a **flexible schema** (or "schema-on-read"), not *no* schema.

### Benefits
- Add fields without `ALTER TABLE` or downtime.
- **Polymorphic data**: e.g. a `products` collection where laptops have `ram` and books have `isbn`.
- Store nested/hierarchical data naturally.

### Risks & how to manage them
- Typos and inconsistent types (`age: "30"` vs `age: 30`) → **validation** (Mongoose schemas, `$jsonSchema` validator on the collection).
- Evolving structure → a **`schemaVersion` field** + migration scripts or lazy migration on read (the **Schema Versioning pattern**).
:::

::: code javascript Enforce a schema at the DATABASE level with $jsonSchema (mongosh)
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email'],
      properties: {
        name: { bsonType: 'string', minLength: 2 },
        email: { bsonType: 'string', pattern: '^.+@.+$' },
        age: { bsonType: 'int', minimum: 0, maximum: 150 },
        role: { enum: ['user', 'admin'] },
      },
    },
  },
  validationAction: 'error', // or 'warn'
});

db.users.insertOne({ name: 'V', email: 'bad' }); // ❌ Document failed validation

// Polymorphic collection — different shapes, same collection
db.products.insertMany([
  { type: 'laptop', name: 'MacBook', specs: { ram: 16, cpu: 'M3' } },
  { type: 'book', name: 'Node Patterns', isbn: '978-1', author: 'Mario' },
]);
:::

::: ask
- *"Should validation live in the app (Mongoose) or the DB?"* Both is safest when multiple services write to the same database.
:::

::: links
Schema validation | https://www.mongodb.com/docs/manual/core/schema-validation/
Schema versioning pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-schema-versioning-pattern
:::

=== When would you normalize vs denormalize?
@p 2
@tags normalization, denormalization, modeling
@quick
- **Normalise** (references, no duplication) when data changes often, is shared widely, or consistency is critical.
- **Denormalise** (embed/duplicate) when reads vastly outnumber writes and you want **one query per page**.
- Denormalised data needs a **sync strategy**: update fan-out, background jobs, change streams, or accept staleness.
- Snapshot data (order price/name at purchase time) *should* be duplicated.
- MongoDB rule: **model for your queries**, not for theoretical purity.

::: text
- **Normalisation** = store each fact **once** and reference it. Updates are easy and consistent, but reads need joins.
- **Denormalisation** = **duplicate** some data where it's read. Reads are fast (one query), but updates must touch multiple places.

| Choose | When |
|---|---|
| **Normalise** | Data updated frequently (user profile, product price), shared across many documents, strong consistency needed, storage matters |
| **Denormalise** | Read-heavy screens (feeds, dashboards, product listing), data rarely changes (category name), historical snapshots (order line items), avoiding `$lookup` on hot paths |

### Example: blog post showing the author's name
- **Normalised**: `post.authorId` → `$lookup` users on every page view.
- **Denormalised (Extended Reference pattern)**: `post.author = { id, name, avatarUrl }`. One read. When a user renames themselves (rare), run `updateMany({ 'author.id': id }, { $set: { 'author.name': newName } })` in a background job.
:::

::: code javascript Keeping denormalised data in sync (Mongoose post-save hook + job)
// Post stores a copy of author name/avatar (extended reference)
const PostSchema = new Schema({
  title: String,
  author: { id: { type: Types.ObjectId, index: true }, name: String, avatarUrl: String },
});

// When the user profile changes → fan-out update (async, eventually consistent)
UserSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;
  const update = this.getUpdate().$set || {};
  if (update.name || update.avatarUrl) {
    await Post.updateMany({ 'author.id': doc._id }, { $set: { 'author.name': doc.name, 'author.avatarUrl': doc.avatarUrl } });
    // at scale: push a job to a queue (BullMQ/SQS) instead of doing it inline
  }
});
:::

::: ask
- *"How often does the duplicated field change? Is slight staleness acceptable?"* This is the key trade-off question. Asking it shows seniority.
:::

::: links
Extended reference pattern | https://www.mongodb.com/blog/post/building-with-patterns-the-extended-reference-pattern
:::
