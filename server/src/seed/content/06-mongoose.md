@section Mongoose
@icon 🦫
@color #b91c1c
@desc Schemas, models, validation, hooks, populate, lean, virtuals, timestamps, indexes and transactions.

=== What is Mongoose? Schema vs Model?
@p 3
@tags mongoose, odm, schema, model
@quick
- Mongoose = **ODM** (Object Data Modeling) library for MongoDB + Node: schemas, validation, casting, hooks, populate, query builder.
- **Schema** = blueprint (fields, types, validators, defaults, indexes, hooks, virtuals, methods).
- **Model** = compiled class from a schema bound to a **collection** (`mongoose.model('User', schema)` → `users`); used for CRUD.
- **Document** = an instance of a model (one record) with `save()`, methods, change tracking.
- Trade-off: convenience & safety vs some overhead (use `.lean()` for fast reads).

::: text
**Mongoose** sits between your Node app and the MongoDB driver and adds **structure** to MongoDB's flexible documents:
- Schema definitions with **types, defaults, validation** and **casting** (`"42"` → `42`, string → ObjectId)
- **Middleware (hooks)**: `pre('save')`, `post('findOneAndUpdate')`…
- **populate()** for references
- **Virtuals**, **instance/static methods**, **query helpers**
- `timestamps`, indexes, discriminators (inheritance), plugins

### Schema vs Model vs Document
| | What | Example |
|---|---|---|
| **Schema** | Shape + rules (not connected to the DB) | `new mongoose.Schema({ name: String })` |
| **Model** | Constructor/class compiled from the schema, tied to a collection | `const User = mongoose.model('User', UserSchema)` |
| **Document** | One instance of a model | `const u = new User({ name: 'Vivek' }); await u.save();` |

Model name `'User'` → collection **`users`** (lowercased + pluralised) unless overridden.
:::

::: diagram
flowchart LR
  S["Schema: fields, validators, hooks, virtuals, indexes"] -->|"mongoose.model"| M["Model: User (class)"]
  M -->|"new User / User.create"| D["Document: one user"]
  M -->|"User.find / updateOne"| C[("collection: users")]
  D -->|"save"| C
:::

::: code javascript Complete User model with most Mongoose features
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 50 },
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    password: { type: String, required: true, minlength: 8, select: false }, // never returned by default
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    age: { type: Number, min: 18, max: 120 },
    address: { city: String, pin: String },
    tags: [String],
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,              // createdAt, updatedAt
    toJSON: { virtuals: true, transform: (doc, ret) => { delete ret.password; delete ret.__v; return ret; } },
  }
);

// Virtual (computed, not stored)
UserSchema.virtual('isAdult').get(function () { return this.age >= 18; });

// Instance method
UserSchema.methods.comparePassword = function (plain) { return bcrypt.compare(plain, this.password); };

// Static method
UserSchema.statics.findByEmail = function (email) { return this.findOne({ email: email.toLowerCase() }); };

// Hook: hash password before save
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compound index
UserSchema.index({ role: 1, createdAt: -1 });

const User = mongoose.model('User', UserSchema);

// Usage
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const u = await User.create({ name: 'Vivek', email: 'VIVEK@X.com', password: 'Secret123' });
  const found = await User.findByEmail('vivek@x.com').select('+password');
  console.log(await found.comparePassword('Secret123')); // true
})();
:::

::: ask
- *"Mongoose or the native driver?"* Mongoose adds safety and productivity; the native driver is lighter and faster for high-throughput services. Show you know both.
- *"TypeScript?"* Mongoose supports typed schemas (`InferSchemaType`). Also mention Prisma/Typegoose as alternatives.
:::

::: links
Mongoose docs | https://mongoosejs.com/docs/guide.html
Models | https://mongoosejs.com/docs/models.html
:::

=== What is populate()?
@p 3
@tags populate, references, n+1
@quick
- `populate('field')` replaces an ObjectId **ref** with the referenced document(s).
- Runs **extra queries** (one per populated path, using `$in`), **not** a DB join.
- Select fields: `populate({ path: 'author', select: 'name avatar' })`; nested populate supported.
- Watch for performance: populate on big lists = large `$in`; use `$lookup` or denormalise for hot paths.
- `populate` + `lean()` works.

::: text
When a schema field has `ref: 'User'`, Mongoose can **fetch the referenced documents** and substitute them into the result.

### How it works internally
1. Run the main query → e.g. 20 posts.
2. Collect all `author` ids → **one** extra query: `User.find({ _id: { $in: [ids] } })`.
3. Stitch results in memory.

So it's **1 + (number of populated paths)** queries, not N+1, but it's still application-side joining.

### populate vs $lookup
| | `populate()` | `$lookup` |
|---|---|---|
| Where | In Node (multiple queries) | In MongoDB (one aggregation) |
| Ease | Very easy | More verbose |
| Filter/sort by joined fields | ❌ Hard | ✅ Yes |
| Cross-database | ✅ Possible | ❌ Same DB only |
:::

::: code javascript populate() patterns
const PostSchema = new Schema({
  title: String,
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
}, { timestamps: true });
const Post = mongoose.model('Post', PostSchema);

// Basic
const post = await Post.findById(id).populate('author');

// Select only needed fields (avoid leaking email/password)
const posts = await Post.find()
  .sort('-createdAt')
  .limit(20)
  .populate({ path: 'author', select: 'name avatarUrl' })
  .populate({ path: 'category', select: 'name slug' })
  .lean();

// Nested populate: comments → their authors
const full = await Post.findById(id).populate({
  path: 'comments',
  options: { sort: { createdAt: -1 }, limit: 10 },
  populate: { path: 'author', select: 'name' },
});

// Virtual populate: user.posts WITHOUT storing post ids in the user document
UserSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'author' });
const userWithPosts = await User.findById(uid).populate({ path: 'posts', select: 'title' });

// Enable debug to SEE the extra queries
mongoose.set('debug', true);
:::

::: ask
- *"How many documents are populated per request?"* Large lists → select minimal fields or denormalise.
- *"Do we need to filter by the populated field?"* (e.g. posts where author.country = 'IN') → use `$lookup`, because populate can't do that efficiently.
:::

::: links
Mongoose populate | https://mongoosejs.com/docs/populate.html
:::

=== What is lean()?
@p 3
@tags lean, performance
@quick
- `.lean()` returns **plain JS objects** instead of full Mongoose documents.
- **Faster and less memory** (often 3–5x smaller): no change tracking, getters/setters, or hydration.
- You lose: `save()`, virtuals (unless a plugin), getters, instance methods, default `toJSON` transforms.
- Use for **read-only** endpoints (lists, GET APIs); don't use when you'll modify & `save()`.

::: text
By default Mongoose **hydrates** each result into a Mongoose Document, a heavy object with change tracking, getters/setters, `save()`, virtuals and so on.

`.lean()` skips hydration and returns **POJOs** (plain old JavaScript objects) straight from the driver.

| | Default document | `.lean()` |
|---|---|---|
| Type | `mongoose.Document` | Plain object |
| Memory | High | Low |
| Speed | Slower | Faster ✅ |
| `doc.save()`, methods | ✅ | ❌ |
| Virtuals / getters | ✅ | ❌ (needs `mongoose-lean-virtuals`) |
| Best for | Update flows (find → modify → save) | Read-only API responses ✅ |
:::

::: chart bar Memory for 10,000 user docs (illustrative)
Mode,Memory (MB)
Hydrated documents,48
lean(),11
:::

::: code javascript lean in practice
// ✅ Read-only list endpoint
router.get('/products', async (req, res) => {
  const products = await Product.find({ isActive: true }).select('name price').sort('-createdAt').limit(50).lean();
  res.json(products); // plain objects serialise fast
});

// ❌ Don't use lean when you need save()
const user = await User.findById(id).lean();
user.name = 'New';
// user.save(); → TypeError: user.save is not a function

// ✅ For updates, prefer an atomic update anyway (no read needed)
await User.updateOne({ _id: id }, { $set: { name: 'New' } }, { runValidators: true });

// Measure yourself
console.time('hydrated'); await Product.find().limit(10000); console.timeEnd('hydrated');
console.time('lean');     await Product.find().limit(10000).lean(); console.timeEnd('lean');
:::

::: ask
- Remember that `lean()` results have `_id` as an **ObjectId object**, not a string. Convert it with `String(doc._id)` when comparing.
:::

::: links
Mongoose lean tutorial | https://mongoosejs.com/docs/tutorials/lean.html
:::

=== What is validation in Mongoose?
@p 3
@tags validation, mongoose
@quick
- Built-in validators: `required`, `min/max` (Number/Date), `minlength/maxlength/match/enum` (String).
- Custom: `validate: { validator: fn, message }` (can be async).
- Runs on **`save()` / `create()`** automatically; on **update queries only with `runValidators: true`**.
- `unique: true` is **not a validator**; it creates a unique index (a duplicate throws E11000).
- Errors: `ValidationError` with `err.errors[field].message` → map to 400.

::: text
Mongoose validates documents **before saving** based on the schema.

### Built-in validators
- All types: `required`
- Numbers & dates: `min`, `max`
- Strings: `enum`, `match` (regex), `minlength`, `maxlength`, `trim`/`lowercase` (these are **setters**, not validators)

### Custom validators
`validate: { validator: (v) => boolean | Promise<boolean>, message: 'Error {VALUE}' }`

### ⚠️ The two classic gotchas
1. **Update queries skip validation** by default: `findByIdAndUpdate(id, { age: -5 })` saves invalid data unless you pass `{ runValidators: true }`. Set it globally: `mongoose.set('runValidators', true)`.
2. **`unique` is not validation**. It's an index, so a duplicate insert fails with a MongoServerError **E11000**, not a ValidationError. Handle both in the error middleware.
:::

::: code javascript Validation examples
const ProductSchema = new Schema({
  name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 120 },
  sku: { type: String, required: true, unique: true, match: [/^[A-Z0-9-]{4,20}$/, 'SKU must be A-Z, 0-9, dash'] },
  price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
  salePrice: {
    type: Number,
    validate: {
      validator: function (v) { return v == null || v < this.price; }, // `this` = document (on save)
      message: 'Sale price ({VALUE}) must be lower than price',
    },
  },
  category: { type: String, enum: { values: ['books', 'electronics', 'fashion'], message: '{VALUE} is not a valid category' } },
  images: { type: [String], validate: [(arr) => arr.length <= 8, 'Max 8 images'] },
  vendorEmail: {
    type: String,
    validate: { validator: async (email) => !(await isBlockedDomain(email)), message: 'Vendor domain blocked' }, // async validator
  },
});

mongoose.set('runValidators', true); // validate updates globally

try {
  await Product.create({ name: '', sku: 'bad sku', price: -5 });
} catch (err) {
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    console.log(details);
    // [{ field:'name', message:'Product name is required' }, { field:'sku', ...}, { field:'price', ...}]
  }
}
:::

::: ask
- *"Where should validation live: API layer (Zod) or model (Mongoose)?"* Answer: **both**. Zod gives fast, friendly request errors; Mongoose protects data integrity no matter which code path writes.
:::

::: links
Mongoose validation | https://mongoosejs.com/docs/validation.html
:::

=== What are Mongoose middleware (hooks)?
@p 2
@tags hooks, middleware, pre, post
@quick
- Functions that run **before (`pre`)** or **after (`post`)** operations.
- Types: **document** (`save`, `validate`, `deleteOne` with `{document:true}`), **query** (`find`, `findOne`, `updateOne`, `findOneAndUpdate`, `deleteMany`), **aggregate**, **model** (`insertMany`).
- In document hooks `this` = the document; in query hooks `this` = the query.
- ⚠️ `pre('save')` does **NOT** run for `updateOne`/`findByIdAndUpdate`.
- Uses: hash passwords, set slugs, soft-delete filters, audit logs, cascade deletes.

::: text
Hooks let you run logic around Mongoose operations **automatically**.

| Hook type | Triggered by | `this` refers to |
|---|---|---|
| Document | `save()`, `validate()`, `doc.deleteOne()` | The document |
| Query | `find`, `findOne`, `countDocuments`, `updateOne`, `findOneAndUpdate`, `deleteMany`… | The Query object |
| Aggregate | `Model.aggregate()` | The Aggregate object |
| Model | `insertMany` | The Model |

### Common uses
- `pre('save')`: hash a password, generate a slug, normalise data
- `pre(/^find/)`: automatically exclude soft-deleted docs
- `post('save')`: send a welcome email / emit an event (better: queue a job)
- `pre('findOneAndUpdate')`: update `updatedBy`, re-hash the password if changed
- `post('findOneAndDelete')`: cascade-delete related documents

### Gotchas
- **Update queries bypass save hooks.** If you hash passwords in `pre('save')`, then `findByIdAndUpdate(id, { password })` stores **plain text**! Either use `doc.save()` for password changes or add a `pre('findOneAndUpdate')` hook.
- Use `function () {}`, **not arrow functions**, because arrows don't bind `this`.
- In modern Mongoose, `async` hooks don't need `next()`.
:::

::: code javascript Hook examples
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// 1) pre-save: slug + password hash
PostSchema.pre('save', function () {
  if (this.isModified('title')) this.slug = slugify(this.title);
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// 2) Handle password in update queries too
UserSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate();
  const pwd = update.password || update.$set?.password;
  if (pwd) {
    const hashed = await bcrypt.hash(pwd, 12);
    if (update.password) update.password = hashed; else update.$set.password = hashed;
  }
});

// 3) Soft delete: hide deleted docs from ALL find queries
ProductSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) this.where({ isDeleted: { $ne: true } });
});
// Product.find().setOptions({ withDeleted: true }) → include them

// 4) post-save: side effect (better: enqueue a job)
UserSchema.post('save', function (doc) {
  if (doc.wasNew) emailQueue.add('welcome', { userId: doc.id });
});
UserSchema.pre('save', function () { this.wasNew = this.isNew; });

// 5) Cascade delete comments when a post is deleted
PostSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await Comment.deleteMany({ post: doc._id });
});
:::

::: ask
- *"Do side effects in hooks need to be reliable?"* If so, don't send emails directly in `post('save')`. Use an **outbox pattern** or a queue, because hooks run in-process and failures are easy to lose.
:::

::: links
Mongoose middleware | https://mongoosejs.com/docs/middleware.html
:::

=== What are virtuals?
@p 2
@tags virtuals, computed
@quick
- Virtuals = **computed properties** defined on the schema, **not stored** in MongoDB.
- Getter: `schema.virtual('fullName').get(function () { return this.first + ' ' + this.last })`.
- Include in JSON output with `toJSON: { virtuals: true }`.
- **Virtual populate**: reverse relationship (user.posts) without storing arrays.
- Not queryable (you can't `find({ fullName })`), and not in `lean()` results by default.

::: text
A **virtual** is a property you can get/set on a document but which **isn't persisted**. It's useful for derived values:
- `fullName` from `firstName` + `lastName`
- `isExpired` from `expiresAt`
- `url` from `slug`
- `discountPercent` from `price` and `salePrice`

**Virtual populate** defines a relationship from the "one" side without storing ids, e.g. `user.posts` based on `post.author`. It's great for unbounded one-to-many relationships.
:::

::: code javascript Virtuals & virtual populate
const UserSchema = new Schema(
  { firstName: String, lastName: String, birthDate: Date },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

UserSchema.virtual('fullName')
  .get(function () { return `${this.firstName} ${this.lastName}`; })
  .set(function (v) { [this.firstName, this.lastName] = v.split(' '); });

UserSchema.virtual('age').get(function () {
  if (!this.birthDate) return null;
  return Math.floor((Date.now() - this.birthDate) / (365.25 * 24 * 3600 * 1000));
});

// Virtual populate (no posts array stored on user)
UserSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'author', options: { sort: { createdAt: -1 } } });
UserSchema.virtual('postCount', { ref: 'Post', localField: '_id', foreignField: 'author', count: true });

const u = await User.findById(id).populate('posts').populate('postCount');
console.log(u.fullName, u.age, u.postCount, u.posts.length);
res.json(u); // virtuals included because of toJSON option
:::

::: ask
- *"Do we need to sort or filter by this value?"* If yes, **store it** (maybe as a denormalised field updated in a hook), because virtuals aren't queryable.
:::

::: links
Mongoose virtuals | https://mongoosejs.com/docs/tutorials/virtuals.html
:::

=== How do you handle timestamps?
@p 2
@tags timestamps, dates
@quick
- `{ timestamps: true }` → auto `createdAt` on insert and `updatedAt` on every update (including `updateOne`/`findOneAndUpdate`).
- Rename: `{ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }`.
- MongoDB stores Dates in **UTC**; convert to local time on the frontend (Intl / date-fns / dayjs).
- Skip with `{ timestamps: false }` option on a specific update.
- ObjectId also contains the creation time (`_id.getTimestamp()`).

::: text
Passing `timestamps: true` to the schema adds two Date fields that Mongoose manages:
- `createdAt`: set once on insert
- `updatedAt`: set on insert and bumped on `save()`, `updateOne()`, `updateMany()`, `findOneAndUpdate()`, `replaceOne()`

### Best practices
- **Store UTC** (MongoDB always does) and send **ISO-8601** strings in APIs (`2026-09-30T04:15:00.000Z`).
- Convert to the user's timezone **in the UI** (`Intl.DateTimeFormat`, date-fns-tz).
- For domain events, add explicit fields: `paidAt`, `shippedAt`, `deletedAt`.
- Index `createdAt` if you sort or paginate by it.
:::

::: code javascript Timestamps usage
const OrderSchema = new Schema(
  { total: Number, status: String, paidAt: Date },
  { timestamps: true } // or { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
OrderSchema.index({ createdAt: -1 });

const o = await Order.create({ total: 499, status: 'PENDING' });
console.log(o.createdAt, o.updatedAt);

await Order.updateOne({ _id: o._id }, { $set: { status: 'PAID', paidAt: new Date() } }); // updatedAt bumped automatically
await Order.updateOne({ _id: o._id }, { $inc: { views: 1 } }, { timestamps: false });   // don't touch updatedAt

// Orders created in the last 7 days
await Order.find({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } });
:::

::: code javascript Try it: UTC storage vs local display (runs in browser)
const createdAt = new Date('2026-09-30T04:15:00.000Z'); // what MongoDB stores / API returns
console.log('ISO (UTC):', createdAt.toISOString());
console.log('India   :', new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(createdAt));
console.log('New York:', new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(createdAt));
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
console.log('relative:', rtf.format(-3, 'day'));
:::

::: ask
- *"Which timezone should reports use?"* (e.g. "daily sales" in IST vs UTC). This is a common source of bugs.
:::

::: links
Mongoose timestamps | https://mongoosejs.com/docs/timestamps.html
:::

=== How do you create indexes in Mongoose?
@p 2
@tags indexes, mongoose
@quick
- Field level: `{ email: { type: String, index: true } }` or `unique: true`, `sparse`, `expires` (TTL).
- Schema level (compound): `schema.index({ userId: 1, createdAt: -1 })`, text: `schema.index({ title: 'text' })`.
- `autoIndex` builds indexes on app start: fine in dev, **disable in production** and build via migration/`syncIndexes()`.
- `Model.syncIndexes()` = create missing + drop indexes not in the schema; `Model.listIndexes()`.

::: code javascript Index declarations
const EventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, index: true },                // single
  email: { type: String, unique: true },                                // unique index
  phone: { type: String, unique: true, sparse: true },                  // unique only when present
  type: String,
  title: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // TTL: auto-delete after 30 days
});

EventSchema.index({ userId: 1, type: 1, createdAt: -1 });                   // compound (ESR)
EventSchema.index({ title: 'text' });                                       // text search
EventSchema.index({ type: 1 }, { partialFilterExpression: { type: { $exists: true } } });

const Event = mongoose.model('Event', EventSchema);

// Production: disable auto-building on every boot
mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

// Deploy/migration script
await Event.syncIndexes();      // create new, drop removed (⚠️ drops indexes not in schema!)
console.log(await Event.listIndexes());
:::

::: ask
- *"How big is the collection?"* Building an index on a huge collection in production should be planned. Atlas does **rolling index builds** across replica set members.
:::

::: links
Mongoose indexes | https://mongoosejs.com/docs/guide.html#indexes
:::

=== How do you handle transactions?
@p 2
@tags transactions, acid, session
@quick
- Multi-document ACID transactions need a **replica set** (or sharded cluster); they work in Atlas / `mongo --replSet`.
- Mongoose: `const session = await mongoose.startSession(); await session.withTransaction(async () => { ... { session } })`.
- **Pass `{ session }` to every operation** inside the transaction.
- `withTransaction` auto-retries on `TransientTransactionError` / unknown commit results.
- Keep them short (default 60s limit); prefer single-document atomic updates + good modelling when possible.

::: text
A **single-document** operation in MongoDB is always **atomic**, even if it updates many nested fields and arrays. That's why embedding often avoids the need for transactions.

When you must change **multiple documents atomically** (transfer money between two accounts, create an order **and** decrement stock), use a **transaction**:
- **ACID** across documents/collections (since 4.0; across shards since 4.2)
- Requires a **replica set** (even a single-node replica set in dev)
- Everything inside uses the same **session**
- On error → **abort** (all changes rolled back)

### Costs
Transactions add latency and lock contention, and are limited to ~60 seconds by default. Design with atomic single-document updates first; use transactions for genuinely multi-document invariants.
:::

::: diagram Money transfer transaction
sequenceDiagram
  participant S as Service
  participant DB as MongoDB (replica set)
  S->>DB: startSession + startTransaction
  S->>DB: debit A (balance >= amount) with session
  S->>DB: credit B with session
  S->>DB: insert ledger entry with session
  alt all succeed
    S->>DB: commitTransaction
  else any fails
    S->>DB: abortTransaction (rollback all)
  end
:::

::: code javascript Money transfer + order placement with transactions (Mongoose)
const mongoose = require('mongoose');

async function transfer(fromId, toId, amount) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const debit = await Account.updateOne(
        { _id: fromId, balance: { $gte: amount } },   // guard: sufficient funds
        { $inc: { balance: -amount } },
        { session }
      );
      if (debit.modifiedCount !== 1) throw new AppError(400, 'Insufficient balance');

      await Account.updateOne({ _id: toId }, { $inc: { balance: amount } }, { session });
      await Ledger.create([{ fromId, toId, amount, at: new Date() }], { session }); // create() with session needs an array
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }
}

async function placeOrder(userId, items) {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      for (const { productId, qty } of items) {
        const r = await Product.updateOne({ _id: productId, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { session });
        if (r.modifiedCount === 0) throw new AppError(409, `Out of stock: ${productId}`);
      }
      [order] = await Order.create([{ userId, items, status: 'PENDING' }], { session });
    });
    return order;
  } finally {
    await session.endSession();
  }
}
:::

::: code yaml docker-compose: single-node replica set for local transactions
services:
  mongo:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports: ["27017:27017"]
    healthcheck:
      # initiate the replica set on first start
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}).ok }"]
      interval: 5s
      retries: 20
# connection string: mongodb://mongo:27017/app?replicaSet=rs0
:::

::: ask
- *"Can this be modelled so that one document holds the invariant?"* (e.g. keep stock reservations inside the product doc.) This shows good NoSQL thinking.
- *"What isolation/consistency do we need? What about external side effects (payment API, email)?"* Those aren't rolled back, so use the **outbox/saga** patterns.
:::

::: links
Mongoose transactions | https://mongoosejs.com/docs/transactions.html
MongoDB transactions | https://www.mongodb.com/docs/manual/core/transactions/
:::
