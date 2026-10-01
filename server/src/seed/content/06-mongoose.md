@section Mongoose
@icon 🦫
@color #b91c1c
@desc Mongoose 9: schemas, models, validation, hooks, populate, lean, virtuals, timestamps, indexes and transactions, with measured costs and examples tested against MongoDB 7.

=== What is Mongoose? Schema vs Model?
@p 3
@tags mongoose, odm, schema, model
@quick
- Mongoose is an **ODM** (Object Data Modeling) library on top of the MongoDB driver: schemas, casting, validation, hooks, populate, a query builder.
- **Schema** = the blueprint (fields, types, validators, defaults, indexes, hooks, virtuals, methods); not connected to the database.
- **Model** = a class compiled from a schema and bound to a **collection** (`model('User', schema)` → `users`); you query through it.
- **Document** = one instance of a model, with change tracking, `save()`, methods and virtuals.
- Cost measured (Mongoose 9): reading 10k docs **37 ms hydrated vs 25 ms lean vs 27 ms raw driver**; `Model.create` of 5k docs **530 ms** vs `insertMany` **82 ms**.

::: text 🧒 In simple words
MongoDB will happily store anything you give it, like a **warehouse with no rules**. Mongoose is the **receiving desk** in front of it. The **schema** is the checklist on the wall ("every parcel needs a name, an email, an age over 18"). The **model** is the clerk who uses that checklist to accept, look up and change parcels in one particular storeroom (the `users` collection). Each **document** is one parcel the clerk is holding, which knows what changed since it was fetched and can save itself back.
:::

::: text 📖 Detailed answer
**Mongoose** sits between your Node app and the MongoDB driver and adds structure to flexible documents.

| Feature | What it gives you |
|---|---|
| Schemas with types | Casting (`"42"` → `42`, string → ObjectId), defaults, `trim`, `lowercase` |
| Validation | `required`, `min/max`, `enum`, `match`, custom and async validators |
| Middleware (hooks) | `pre('save')`, `pre(/^find/)`, `post('findOneAndDelete')`… |
| Relationships | `ref` + `populate()`, virtual populate |
| Computed and behaviour | Virtuals, instance methods, statics, query helpers |
| Housekeeping | `timestamps`, index declarations, discriminators (inheritance), plugins |

### Schema vs Model vs Document
| | What | Example |
|---|---|---|
| **Schema** | Shape + rules | `new Schema({ name: String })` |
| **Model** | Class compiled from a schema, tied to a collection | `const User = model('User', UserSchema)` |
| **Document** | One instance of a model | `const u = new User({ name: 'Vivek' }); await u.save()` |

Model `'User'` → collection **`users`** (lowercased, pluralised) unless you pass `{ collection: 'people' }`.

### Mongoose vs the native driver (measured, Mongoose 9.10, MongoDB 7, local)
| Operation | Mongoose | Native driver |
|---|---|---|
| Read 10,000 posts | 37 ms hydrated · 25 ms `.lean()` | 27 ms |
| Insert 5,000 posts | 530 ms `Model.create` · 82 ms `insertMany` · 27 ms `insertMany({ lean: true })` | 30 ms |
Mongoose's overhead is document **hydration** and per-document validation; `lean()` and batch inserts bring it close to the driver.

### Mongoose 9 notes
Node 20.19+; pre hooks no longer receive `next()` (use `async` functions); `findOneAndUpdate` uses `returnDocument: 'after'` (`new: true` is deprecated); update pipelines need `updatePipeline: true`.
:::

::: diagram Schema → Model → Document → collection
flowchart LR
  S["Schema: fields, validators, hooks, virtuals, indexes"] -->|"model('User', schema)"| M["Model: User (class)"]
  M -->|"new User / User.create"| D["Document: one user"]
  M -->|"User.find / updateOne"| C[("collection: users")]
  D -->|"save()"| C
:::

::: chart bar Measured: Mongoose 9 vs native driver (ms, local MongoDB 7)
Operation,Mongoose default,Mongoose fast path,Native driver
Read 10k posts,37.2,25.2,27
Insert 5k posts,530,26.7,29.8
:::

::: image A receiving desk in front of a rule-free warehouse: checklist (schema), clerk (model), parcel (document)
/images/mongoose/schema-model.svg
:::

::: text 🪜 Step by step
What happens on `await User.create({ name: ' Vivek ', email: 'VIVEK@X.com', password: 'Secret123', age: '32' })`:
1. Mongoose builds a **document** from the model: casts `age` "32" → 32, applies setters (`trim`, `lowercase`) and defaults (`role: 'user'`).
2. It runs **validation** (required, minlength, match, enum, custom validators); failure → `ValidationError`, nothing is written.
3. It runs `pre('save')` hooks: here bcrypt hashes the password.
4. It sends one `insertOne` through the driver (adding `createdAt`/`updatedAt` because of `timestamps`).
5. MongoDB enforces the **unique index** on email; a duplicate → error code 11000.
6. `post('save')` hooks run, and you get back the document; `toJSON` hides `password` and `__v` when you send it as JSON.
:::

::: code javascript A complete User model with the main Mongoose features (node user-model.js)
// How to run: npm install mongoose bcryptjs && MONGO_URI=mongodb://localhost:27017/shop node user-model.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    password: { type: String, required: true, minlength: 8, select: false },     // never returned unless asked
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    age: { type: Number, min: 18, max: 120 },
    address: { city: String, pin: String },
    tags: [String],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (doc, ret) => { delete ret.password; delete ret.__v; return ret; } },
  },
);

UserSchema.virtual('isAdult').get(function () { return this.age >= 18; });                   // computed, not stored
UserSchema.methods.comparePassword = function (plain) { return bcrypt.compare(plain, this.password); };
UserSchema.statics.findByEmail = function (email) { return this.findOne({ email: email.toLowerCase().trim() }); };
UserSchema.pre('save', async function () {                                                    // Mongoose 9: no next()
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});
UserSchema.index({ role: 1, createdAt: -1 });

const User = model('User', UserSchema);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await User.deleteMany({});
  await User.init();                                                                          // wait for the unique index

  const u = await User.create({ name: ' Vivek ', email: 'VIVEK@X.com', password: 'Secret123', age: '32' });
  console.log('cast + trimmed:', JSON.stringify({ name: u.name, email: u.email, age: u.age, role: u.role }));
  console.log('collection name:', User.collection.collectionName);
  console.log('JSON hides the password:', !('password' in u.toJSON()), '| virtual isAdult:', u.toJSON().isAdult);

  const found = await User.findByEmail(' vivek@x.com ').select('+password');
  console.log('password stored hashed:', found.password.startsWith('$2'), '| compare:', await found.comparePassword('Secret123'));

  try { await User.create({ name: 'V', email: 'not-an-email', password: 'short' }); } catch (err) {
    console.log('validation errors:', Object.keys(err.errors).sort().join(', '));
  }
  try { await User.create({ name: 'Copy', email: 'vivek@x.com', password: 'Secret123' }); } catch (err) {
    console.log('duplicate email → code', err.code);
  }
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: a tiny schema → model → document (runnable)
// A miniature of what Mongoose does: cast, apply defaults and setters, validate, then store.
function createSchema(fields) { return { fields }; }
function compileModel(name, schema) {
  const collection = [];
  class Doc {
    constructor(input) {
      for (const [key, rule] of Object.entries(schema.fields)) {
        let v = input[key] ?? rule.default;
        if (v !== undefined && rule.type === Number) v = Number(v);
        if (typeof v === 'string' && rule.trim) v = v.trim();
        if (typeof v === 'string' && rule.lowercase) v = v.toLowerCase();
        this[key] = v;
      }
    }
    validate() {
      const errors = {};
      for (const [key, rule] of Object.entries(schema.fields)) {
        const v = this[key];
        if (rule.required && (v === undefined || v === '')) errors[key] = `${key} is required`;
        else if (rule.min !== undefined && v < rule.min) errors[key] = `${key} must be >= ${rule.min}`;
        else if (rule.enum && v !== undefined && !rule.enum.includes(v)) errors[key] = `${v} is not allowed`;
      }
      return errors;
    }
    save() { const errors = this.validate(); if (Object.keys(errors).length) throw Object.assign(new Error('ValidationError'), { errors }); collection.push({ ...this }); return this; }
  }
  Doc.collectionName = `${name.toLowerCase()}s`;
  Doc.find = (pred = () => true) => collection.filter(pred);
  return Doc;
}

const userSchema = createSchema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  age: { type: Number, min: 18 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});
const Account = compileModel('Account', userSchema);
const doc = new Account({ name: ' Vivek ', email: 'VIVEK@X.com', age: '32' }).save();
console.log('model → collection', Account.collectionName, Account.collectionName === 'accounts' ? '✅' : '❌ FAIL');
console.log('cast "32" → 32, trim, lowercase, default role', doc.age === 32 && doc.name === 'Vivek' && doc.email === 'vivek@x.com' && doc.role === 'user' ? '✅' : '❌ FAIL');
let errors = {};
try { new Account({ name: '', email: 'a@b.c', age: 15, role: 'boss' }).save(); } catch (e) { errors = e.errors; }
console.log('validation stops bad documents', Object.keys(errors).length === 3 && Account.find().length === 1 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking the schema lives in MongoDB: it lives in **your app**; other writers (scripts, other services) bypass it.
- Using `Model.create` in a loop or with thousands of documents (per-document validation and hooks) instead of `insertMany`.
- Treating `unique: true` as validation (it's an index; duplicates fail with E11000).
- Old tutorials: `next()` in pre hooks and `{ new: true }` are gone or deprecated in Mongoose 9.
- Returning full documents to clients without `select: false` / `toJSON` transforms (leaking password hashes).
:::

::: understand
- Mongoose = **safety and productivity** (casting, validation, hooks, populate) at the cost of some overhead.
- Hydrated documents are for **write flows**; `lean()` and batch operations are for **read and bulk** paths.
- Native driver for very high-throughput services; Mongoose for typical CRUD apps; Prisma or Typegoose are alternatives in TypeScript stacks.
:::

::: ask
- *"Mongoose or the native driver?"* Depends on throughput needs and how much structure the team wants.
- *"TypeScript?"* → `InferSchemaType`, or Typegoose/Prisma.
- *"Which Mongoose version?"* (9 changed hooks and some options).
:::

::: important ⭐ Say this in the interview
"Mongoose is an ODM for MongoDB in Node. A schema is the blueprint: fields, types, defaults, validators, indexes, hooks, virtuals and methods. A model is the class compiled from a schema and bound to a collection, so model User maps to the users collection and I query through it. A document is one instance, with change tracking and save. Mongoose casts and validates data, hashes passwords in pre-save hooks, hides fields with select false and toJSON, and populates references. The cost is hydration and per-document work: in a test, Model.create of 5,000 documents took 530 milliseconds versus 82 with insertMany, and lean reads were close to the raw driver. In Mongoose 9 hooks are async without next, and findOneAndUpdate uses returnDocument after."
:::

::: links
Mongoose: Schemas | https://mongoosejs.com/docs/guide.html
Mongoose: Models | https://mongoosejs.com/docs/models.html
Mongoose: Migrating to 9 | https://mongoosejs.com/docs/migrating_to_9.html
:::

=== What is populate()?
@p 3
@tags populate, references, n+1
@quick
- `populate('author')` replaces an ObjectId field that has `ref: 'User'` with the referenced document(s).
- It runs **one extra query per populated path** using `$in`, then stitches results in Node: **not** a database join.
- Measured, 100 posts: `populate` **2 queries, 1.7 ms**; a findById loop (N+1) **101 queries, 29 ms**; `$lookup` **1 query, 2.1 ms**.
- Always `select` the fields you need (`populate({ path: 'author', select: 'name avatarUrl' })`); nested and virtual populate exist.
- Can't filter or sort the parent by populated fields → use `$lookup` (or denormalise).

::: text 🧒 In simple words
Your list of 100 blog posts only has the **author's id number** on each. To show names, you could phone the users office **once per post** (100 calls: the N+1 problem). `populate()` is smarter: it collects all the id numbers, makes **one** call ("send me users 4, 9, 17…") and writes each name onto the right post itself. `$lookup` is asking the database to do the matching **inside** its own office and send back finished posts.
:::

::: text 📖 Detailed answer
When a field has `ref: 'User'`, Mongoose can fetch the referenced documents and substitute them into the result.

### How it works
1. Run the main query → e.g. 100 posts.
2. Collect the distinct `author` ids → **one** query: `users.find({ _id: { $in: ids } })` (with your `select`).
3. Match results to posts in memory; missing ones become `null`.
So it's **1 + (number of populated paths)** queries, regardless of how many posts.

### Measured (Mongoose 9, 10,000 posts / 1,000 users, 100 posts per request)
| Approach | Queries | Time |
|---|---|---|
| `find().limit(100).populate('author', 'name')` | 2 | **1.7 ms** |
| `find()` then `User.findById` in a loop (N+1) | 101 | **29 ms** |
| `aggregate([$limit, $lookup, $unwind])` | 1 | **2.1 ms** |
Over a real network (≈1 ms per round trip) the N+1 version gets ~100 ms slower; populate and `$lookup` stay similar.

### populate vs $lookup
| | `populate()` | `$lookup` |
|---|---|---|
| Runs | In Node, extra queries | Inside MongoDB, one aggregation |
| Ease | Very easy, uses schema refs | More verbose |
| Filter/sort parents by joined fields | ❌ (populate `match` only filters the joined docs) | ✅ |
| Hydrated documents, getters, virtuals | ✅ | ❌ plain objects |
| Cross-database/connection | ✅ possible | ❌ same database |

### Variants
`populate({ path, select, match, options: { sort, limit }, populate: {...} })` for nested population; **virtual populate** for one-to-many without storing arrays (`user.posts` from `post.author`).
:::

::: diagram populate = 2 queries + stitching in Node
sequenceDiagram
  participant App as Node (Mongoose)
  participant DB as MongoDB
  App->>DB: posts.find().limit(100)
  DB-->>App: 100 posts with author ids
  App->>DB: users.find({ _id: { $in: [distinct ids] } }, { name: 1 })
  DB-->>App: matching users
  App->>App: replace each author id with its user
:::

::: chart bar Measured: show 100 posts with author names (ms, Mongoose 9, local)
Approach,Milliseconds
populate (2 queries),1.7
$lookup (1 aggregation),2.1
findById loop (101 queries),29
:::

::: image One phone call with a list of ids instead of a hundred separate calls
/images/mongoose/populate.svg
:::

::: text 🪜 Step by step
`Post.find().sort('-createdAt').limit(20).populate({ path: 'author', select: 'name avatarUrl' }).lean()`:
1. Mongoose sends the posts query and receives 20 posts, each with `author: ObjectId`.
2. It reads the schema: `author` has `ref: 'User'` → model `User`.
3. It collects the distinct author ids (maybe 12 different authors).
4. It sends `users.find({ _id: { $in: [12 ids] } }, { name: 1, avatarUrl: 1 })`.
5. It builds a map id → user and replaces each post's `author` with the matching object (or `null` if the user was deleted).
6. With `.lean()`, both the posts and the populated users stay plain objects (fast to serialise).
:::

::: code javascript populate patterns, counting the queries (node populate.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/blog node populate.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({ name: String, email: String, avatarUrl: String }, { toJSON: { virtuals: true } });
UserSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'author' });          // virtual populate
UserSchema.virtual('postCount', { ref: 'Post', localField: '_id', foreignField: 'author', count: true });
const User = model('User', UserSchema);
const Comment = model('Comment', new Schema({ text: String, author: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true }));
const Post = model('Post', new Schema({
  title: String,
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
}, { timestamps: true }));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/blog');
  await Promise.all([User.deleteMany({}), Post.deleteMany({}), Comment.deleteMany({})]);
  const [asha, ben] = await User.create([{ name: 'Asha', email: 'asha@x.com' }, { name: 'Ben', email: 'ben@x.com' }]);
  const c1 = await Comment.create({ text: 'Great post', author: ben._id });
  await Post.create([{ title: 'Hello', author: asha._id, comments: [c1._id] }, { title: 'Second', author: asha._id }, { title: 'Ben here', author: ben._id }]);

  let queries = 0;
  mongoose.set('debug', () => { queries += 1; });

  queries = 0;
  const posts = await Post.find().sort('-createdAt').populate({ path: 'author', select: 'name' }).lean();
  console.log('populated', posts.length, 'posts in', queries, 'queries:', posts.map((p) => `${p.title}/${p.author.name}`).join(', '));
  console.log('email not leaked:', posts.every((p) => p.author.email === undefined));

  queries = 0;
  const full = await Post.findOne({ title: 'Hello' }).populate({ path: 'comments', populate: { path: 'author', select: 'name' } }).lean();
  console.log('nested populate:', full.comments[0].text, 'by', full.comments[0].author.name, `(${queries} queries)`);

  const user = await User.findById(asha._id).populate({ path: 'posts', select: 'title -_id' }).populate('postCount');
  console.log('virtual populate:', user.posts.map((p) => p.title).join(', '), '| count:', user.postCount);

  // populate's match filters the JOINED docs, not the parents:
  const onlyBen = await Post.find().populate({ path: 'author', match: { name: 'Ben' }, select: 'name' }).lean();
  console.log('match keeps parents, nulls the rest:', onlyBen.map((p) => p.author?.name ?? 'null').join(', '));
  mongoose.set('debug', false);
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: N+1 vs batched $in (runnable)
const users = Array.from({ length: 50 }, (_, i) => ({ _id: `u${i}`, name: `User ${i}` }));
const posts = Array.from({ length: 100 }, (_, i) => ({ _id: `p${i}`, title: `Post ${i}`, author: `u${i % 50}` }));

function fakeCollection(docs) {
  let calls = 0;
  return {
    findById(id) { calls += 1; return docs.find((d) => d._id === id) || null; },
    findIn(ids) { calls += 1; const set = new Set(ids); return docs.filter((d) => set.has(d._id)); },
    get calls() { return calls; },
  };
}

const slow = fakeCollection(users);
const n1 = posts.map((p) => ({ ...p, author: slow.findById(p.author) }));

const fast = fakeCollection(users);
const ids = [...new Set(posts.map((p) => p.author))];
const byId = new Map(fast.findIn(ids).map((u) => [u._id, u]));
const populated = posts.map((p) => ({ ...p, author: byId.get(p.author) ?? null }));

console.log(`N+1: ${slow.calls} user queries · populate-style: ${fast.calls} query for ${ids.length} distinct authors`);
console.log('same result', JSON.stringify(n1) === JSON.stringify(populated) ? '✅' : '❌ FAIL');
console.log('N+1 makes one query per post', slow.calls === 100 ? '✅' : '❌ FAIL');
console.log('batched $in makes exactly one', fast.calls === 1 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Looping `findById` per item (N+1) instead of populate or `$in`.
- Populating whole user documents (emails, password hashes) instead of `select`ing a few fields.
- Using populate `match` expecting it to filter the parent list (it only nulls non-matching joined docs).
- Populating deep chains on every list request instead of storing a few display fields (extended reference).
- Forgetting the index on the reference field for virtual populate (`post.author`).
:::

::: understand
- populate is an **application-side join**: predictable 1 + paths queries, easy, hydrated results.
- `$lookup` is the **server-side join**: needed for filtering/sorting by joined data.
- On hot paths, a copied `author: { _id, name }` avoids the join entirely.
:::

::: ask
- *"How many documents get populated per request, and which fields does the UI need?"*
- *"Do we need to filter by the joined field?"* → `$lookup`.
- *"How often does the referenced data change?"* → maybe denormalise.
:::

::: important ⭐ Say this in the interview
"populate replaces an ObjectId that has a ref with the referenced document. It isn't a database join: Mongoose runs the main query, collects the distinct ids, runs one extra query with $in per populated path, and stitches results in Node, so it avoids N+1. In a test showing 100 posts with author names, populate took two queries and 1.7 milliseconds, a findById loop took 101 queries and 29 milliseconds, and $lookup took one query and about 2 milliseconds. I always select only the fields the UI needs, use nested or virtual populate when helpful, and switch to $lookup when I need to filter or sort parents by the joined data, or denormalise on hot paths."
:::

::: links
Mongoose: populate | https://mongoosejs.com/docs/populate.html
Mongoose: Virtual populate | https://mongoosejs.com/docs/populate.html#populate-virtuals
:::

=== What is lean()?
@p 3
@tags lean, performance
@quick
- `.lean()` returns **plain JS objects** straight from the driver instead of hydrated Mongoose documents.
- Measured, 10,000 posts: **25 ms / 7.5 MB lean** vs **37 ms / 11.6 MB hydrated** (≈1.5× faster and smaller; the gap grows with nested documents).
- You lose `save()`, instance methods, change tracking, getters/setters, virtuals and `toJSON` transforms (plugins can add virtuals back).
- Use it for **read-only** paths (lists, GET endpoints, exports); use hydrated docs (or atomic updates) for writes.
- Lean results keep BSON types: `_id` is an **ObjectId**, so compare with `String(id)` or `.equals()`.

::: text 🧒 In simple words
A hydrated Mongoose document is like a **parcel with a full-time assistant attached**: the assistant remembers every change you make, checks rules and can carry it back to the warehouse (`save()`). Very handy if you're going to edit it. But if you're just **reading a list to show on screen**, you don't need 10,000 assistants; `lean()` hands you the **plain parcels** only. Lighter, faster, but nobody will carry them back for you.
:::

::: text 📖 Detailed answer
By default Mongoose **hydrates** each result into a Document (prototype chain, internal state, change tracking, getters/setters). `.lean()` skips that and returns **POJOs** from the driver.

| | Hydrated document | `.lean()` |
|---|---|---|
| Type | `mongoose.Document` | Plain object |
| `save()`, `isModified()`, methods | ✅ | ❌ |
| Getters, virtuals, `toJSON` transforms | ✅ | ❌ (`mongoose-lean-virtuals` / `-getters` plugins) |
| Casting of the **query filter** | ✅ | ✅ (still applied) |
| Defaults applied to the result | ✅ | ❌ (missing fields stay missing) |
| Best for | find → modify → save flows | Read-only API responses |

### Measured (Mongoose 9.10, 10,000 posts with ~300-byte bodies, local MongoDB 7)
| Mode | Time | Retained heap |
|---|---|---|
| Hydrated `find()` | 37.2 ms | 11.6 MB |
| `find().lean()` | 25.2 ms | 7.5 MB |
| Native driver `find().toArray()` | 27.0 ms | – |
Lean is essentially the driver's speed. Old blog posts claim 3–5×; on modern Mongoose the gap is smaller for flat documents and larger for deeply nested ones. Measure your own data.

### Don't forget
- `toJSON` transforms (hiding `password`, `__v`) don't run on lean results: use `select` to exclude fields instead.
- Prefer **atomic updates** (`updateOne` with `$set`) over read → modify → save when you don't need hooks.
:::

::: diagram Hydrated vs lean results
flowchart LR
  Q["Post.find()"] --> DRV["driver returns BSON → JS objects"]
  DRV -->|"default"| H["hydrate: wrap each in a Document (tracking, getters, save)"]
  DRV -->|".lean()"| L["return the plain objects as they are"]
  H --> W["modify + save() flows"]
  L --> R["res.json() for read-only endpoints"]
:::

::: chart bar Measured: reading 10,000 posts (Mongoose 9)
Mode,Milliseconds,Heap MB
Hydrated documents,37.2,11.6
lean(),25.2,7.5
:::

::: image Parcels with an assistant each (hydrated) vs plain parcels (lean)
/images/mongoose/lean.svg
:::

::: text 🪜 Step by step
`GET /products` with `Product.find({ isActive: true }).select('name price').sort('-createdAt').limit(50).lean()`:
1. Mongoose casts the filter using the schema (e.g. `"true"` → `true`).
2. The driver runs the query and returns 50 plain objects.
3. Because of `.lean()`, Mongoose returns them directly: no Document wrapping.
4. `res.json(products)` serialises them; `_id` ObjectIds become strings in JSON.
5. For `PATCH /products/:id`, use `updateOne({ _id }, { $set }, { runValidators: true })` or `findById` (hydrated) + `save()` if hooks must run.
:::

::: code javascript lean in practice: speed, missing methods and id comparison (node lean.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node lean.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const ProductSchema = new Schema({
  name: String,
  price: Number,
  isActive: { type: Boolean, default: true },
  secretCost: { type: Number, select: false },
}, { timestamps: true, toJSON: { virtuals: true } });
ProductSchema.virtual('label').get(function () { return `${this.name} (₹${this.price})`; });
const Product = model('Product', ProductSchema);

async function timeIt(fn, runs = 5) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) { const t = performance.now(); await fn(); best = Math.min(best, performance.now() - t); }
  return best.toFixed(1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Product.deleteMany({});
  await Product.insertMany(Array.from({ length: 10000 }, (_, i) => ({ name: `Product ${i}`, price: 100 + (i % 900), secretCost: 50 })));

  console.log(`10k reads → hydrated ${await timeIt(() => Product.find())} ms | lean ${await timeIt(() => Product.find().lean())} ms`);

  const hydrated = await Product.findOne({ name: 'Product 1' });
  const plain = await Product.findOne({ name: 'Product 1' }).lean();
  console.log('hydrated has save():', typeof hydrated.save === 'function', '| lean has save():', typeof plain.save === 'function');
  console.log('virtual on hydrated:', hydrated.label, '| on lean:', plain.label);
  console.log('lean _id is an ObjectId:', plain._id instanceof mongoose.Types.ObjectId, '| === string?', plain._id === String(hydrated._id), '| String() compare:', String(plain._id) === hydrated.id);

  // Read-only list endpoint shape
  const list = await Product.find({ isActive: 'true' }).select('name price').sort('-createdAt').limit(3).lean();   // filter still cast
  console.log('list for res.json():', JSON.stringify(list.map(({ name, price }) => ({ name, price }))));

  // Writes: atomic update instead of lean + save
  const res = await Product.updateOne({ _id: plain._id }, { $set: { price: 999 } }, { runValidators: true });
  console.log('atomic update modified:', res.modifiedCount);
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: wrapping objects costs time and memory (runnable)
// Simulate hydration: wrap each plain object in a tracked "document" with change tracking.
const raw = Array.from({ length: 50000 }, (_, i) => ({ _id: `id${i}`, name: `Product ${i}`, price: i % 900 }));

function hydrate(obj) {
  const original = { ...obj };
  const doc = { _doc: { ...obj }, $modified: new Set() };
  for (const key of Object.keys(obj)) {
    Object.defineProperty(doc, key, {
      get() { return doc._doc[key]; },
      set(v) { doc._doc[key] = v; if (v !== original[key]) doc.$modified.add(key); },
      enumerable: true,
    });
  }
  doc.isModified = (k) => doc.$modified.has(k);
  doc.save = () => `updateOne({ _id: ${doc._id} }, { $set: ${JSON.stringify(Object.fromEntries([...doc.$modified].map((k) => [k, doc._doc[k]])))} })`;
  return doc;
}

let t = performance.now(); const docs = raw.map(hydrate); const hydrateMs = performance.now() - t;
t = performance.now(); const lean = raw.map((o) => o); const leanMs = performance.now() - t;
console.log(`hydrating 50k objects: ${hydrateMs.toFixed(1)} ms · lean: ${leanMs.toFixed(2)} ms`);
console.log('lean is cheaper', leanMs < hydrateMs ? '✅' : '❌ FAIL');
docs[0].price = 5;
console.log('hydrated doc tracks changes and builds a minimal update', docs[0].isModified('price') && docs[0].save().includes('"price":5') ? '✅' : '❌ FAIL');
console.log('lean object has no save()', typeof lean[0].save === 'undefined' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `lean()` then calling `doc.save()` → `TypeError: save is not a function`.
- Expecting virtuals, getters or `toJSON` transforms (hiding fields) on lean results.
- Comparing `doc._id === req.params.id` (ObjectId vs string) → always false.
- Assuming defaults appear on lean results for old documents that never stored the field.
- Never using lean on big list endpoints and paying hydration for nothing.
:::

::: understand
- `lean()` = "give me data, not behaviour".
- Hydration costs grow with the number and depth of documents; lists and exports benefit most.
- Combine `lean()` with `select()` and pagination for fast, safe read endpoints.
:::

::: ask
- *"Will this code modify and save the documents?"* → hydrated; otherwise lean.
- *"Do responses rely on virtuals or toJSON transforms?"*
- *"How many documents per request?"*
:::

::: important ⭐ Say this in the interview
"lean returns plain JavaScript objects straight from the driver instead of hydrating full Mongoose documents, so there's no change tracking, getters, virtuals, toJSON transforms or save method. That makes it faster and lighter: on ten thousand posts it took 25 milliseconds and 7.5 megabytes versus 37 milliseconds and 11.6 megabytes hydrated, basically driver speed. I use it for read-only endpoints like lists and GET by id, with select to exclude sensitive fields, and I use hydrated documents or atomic updates for writes. One gotcha: _id stays an ObjectId, so I compare ids as strings or with equals."
:::

::: links
Mongoose: Faster queries with lean | https://mongoosejs.com/docs/tutorials/lean.html
mongoose-lean-virtuals | https://github.com/mongoosejs/mongoose-lean-virtuals
:::

=== What is validation in Mongoose?
@p 3
@tags validation, mongoose
@quick
- Built-in validators: `required`; `min/max` (numbers, dates); `enum`, `match`, `minLength/maxLength` (strings). `trim`/`lowercase` are **setters**, not validators.
- Custom: `validate: { validator: (v) => boolean | Promise<boolean>, message: '… {VALUE}' }`.
- Runs automatically on **`save()` / `create()` / `insertMany()`**; on update queries **only with `runValidators: true`** (or `mongoose.set('runValidators', true)`).
- `unique: true` is **not a validator**: it creates a unique index, and duplicates fail with **E11000**, not `ValidationError`.
- Map `ValidationError` → **400** with per-field messages, E11000 → **409**; validate requests with Zod at the API edge too.

::: text 🧒 In simple words
Validation is the **checklist the receiving clerk ticks before accepting a parcel**: has a name? price not negative? category one of the allowed ones? If anything fails, the parcel is refused with a note saying exactly which box wasn't ticked. The catch: the clerk only checks **new parcels and parcels brought back through the front desk** (`save`). If someone sneaks a change in through the side door (`updateOne`) the clerk doesn't look, unless you've told them to check that door too (`runValidators`).
:::

::: text 📖 Detailed answer
### Built-in validators
| Type | Validators |
|---|---|
| All | `required` (with a custom message: `[true, 'Name is required']`) |
| Number, Date | `min`, `max` |
| String | `enum`, `match` (regex), `minLength`, `maxLength` |
| Arrays | custom `validate` (e.g. max 8 images) |

`trim`, `lowercase`, `uppercase` and custom `set` are **setters**: they transform values before validation.

### Custom and async validators
`validate: { validator(v) { return v == null || v < this.price; }, message: 'Sale price ({VALUE}) must be lower than price' }`. On `save()`, `this` is the document; in update validators, `this` is the **query** (so cross-field checks need `this.getUpdate()`).

### When validation runs
| Operation | Validates? |
|---|---|
| `doc.save()`, `Model.create()` | ✅ |
| `Model.insertMany()` | ✅ (per document) |
| `updateOne`, `findOneAndUpdate`, `updateMany` | ❌ unless `runValidators: true` |
| `bulkWrite`, native driver calls | ❌ |

Update validators only check fields **in the update**, and `required` only fails when you explicitly `$unset` the field.

### Errors to handle
| Error | When | HTTP |
|---|---|---|
| `ValidationError` (`err.errors[path].message`) | Validator failed | 400 |
| `CastError` | `"abc"` for a Number/ObjectId | 400 |
| `MongoServerError` code **11000** | Unique index violated | 409 |

### Where validation belongs
**Both layers**: Zod/Joi at the API boundary gives fast, friendly errors and strips unknown fields; Mongoose (and optionally `$jsonSchema`) protects data integrity for every code path that writes.
:::

::: diagram Which writes get validated
flowchart LR
  W["write"] --> T{"which API?"}
  T -->|"save / create / insertMany"| V["schema validators run"]
  T -->|"updateOne / findOneAndUpdate"| R{"runValidators: true?"}
  R -->|"yes"| V
  R -->|"no"| X["written without checks ❌"]
  V -->|"ok"| DB[("MongoDB: unique index check")]
  DB -->|"duplicate"| E["E11000 → 409"]
  V -->|"fail"| VE["ValidationError → 400"]
:::

::: image The receiving clerk checks the front desk; the side door needs runValidators
/images/mongoose/validation.svg
:::

::: text 🪜 Step by step
`await Product.create({ name: '', sku: 'bad sku', price: -5, category: 'toys' })`:
1. Setters run: `name` trimmed to `''`.
2. Validators run for every path: `name` required ❌, `sku` match ❌, `price` min ❌, `category` enum ❌.
3. Mongoose collects all failures into one `ValidationError` with `err.errors.name`, `.sku`, `.price`, `.category`.
4. Nothing is sent to MongoDB.
5. The error middleware maps it to `400 { errors: [{ field, message }] }`.
6. A valid product with an existing SKU passes validation but MongoDB rejects it: code 11000 → 409.
:::

::: code javascript Validation, update validators and error mapping (node validation.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node validation.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const blockedDomains = new Set(['spam.test']);
const isBlockedDomain = async (email) => blockedDomains.has(email.split('@')[1]);

const ProductSchema = new Schema({
  name: { type: String, required: [true, 'Product name is required'], trim: true, maxLength: 120 },
  sku: { type: String, required: true, unique: true, match: [/^[A-Z0-9-]{4,20}$/, 'SKU must be A-Z, 0-9 or dash (4-20)'] },
  price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
  salePrice: {
    type: Number,
    validate: { validator(v) { return v == null || v < this.price; }, message: 'Sale price ({VALUE}) must be lower than price' },
  },
  category: { type: String, enum: { values: ['books', 'electronics', 'fashion'], message: '{VALUE} is not a valid category' } },
  images: { type: [String], validate: [(arr) => arr.length <= 8, 'Max 8 images'] },
  vendorEmail: { type: String, validate: { validator: async (e) => !(await isBlockedDomain(e)), message: 'Vendor domain blocked' } },
});
const Product = model('Product', ProductSchema);

function toHttpError(err) {                                   // what an Express error middleware would do
  if (err.name === 'ValidationError') return { status: 400, errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })) };
  if (err.name === 'CastError') return { status: 400, errors: [{ field: err.path, message: `Invalid ${err.kind}` }] };
  if (err.code === 11000) return { status: 409, errors: [{ field: Object.keys(err.keyValue)[0], message: 'Already exists' }] };
  return { status: 500, errors: [{ message: 'Internal error' }] };
}

async function attempt(label, fn) {
  try { await fn(); console.log(`${label}: ok`); } catch (err) { console.log(`${label}:`, JSON.stringify(toHttpError(err))); }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Product.deleteMany({});
  await Product.init();

  await attempt('create invalid', () => Product.create({ name: ' ', sku: 'bad sku', price: -5, category: 'toys', vendorEmail: 'x@spam.test' }));
  await attempt('create valid', () => Product.create({ name: 'Node Book', sku: 'BOOK-1', price: 500, salePrice: 400, category: 'books' }));
  await attempt('duplicate sku', () => Product.create({ name: 'Copy', sku: 'BOOK-1', price: 10 }));
  await attempt('cast error', () => Product.create({ name: 'X', sku: 'CAST-1', price: 'abc' }));

  await Product.updateOne({ sku: 'BOOK-1' }, { $set: { price: -100 } });                       // side door: no checks
  console.log('updateOne without runValidators saved price =', (await Product.findOne({ sku: 'BOOK-1' }).lean()).price);
  await attempt('updateOne with runValidators', () => Product.updateOne({ sku: 'BOOK-1' }, { $set: { price: -100 } }, { runValidators: true }));
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: a validator engine that collects all errors (runnable)
const rules = {
  name: [(v) => (v && v.trim() ? null : 'Product name is required')],
  sku: [(v) => (/^[A-Z0-9-]{4,20}$/.test(v ?? '') ? null : 'SKU must be A-Z, 0-9 or dash')],
  price: [(v) => (typeof v === 'number' ? null : 'Price must be a number'), (v) => (v >= 0 ? null : 'Price cannot be negative')],
  salePrice: [(v, doc) => (v == null || v < doc.price ? null : `Sale price (${v}) must be lower than price`)],
  category: [(v) => (v == null || ['books', 'electronics', 'fashion'].includes(v) ? null : `${v} is not a valid category`)],
};
function validate(doc, { onlyPaths } = {}) {
  const errors = {};
  for (const [path, checks] of Object.entries(rules)) {
    if (onlyPaths && !onlyPaths.includes(path)) continue;                 // update validators: only touched paths
    for (const check of checks) { const msg = check(doc[path], doc); if (msg) { errors[path] = msg; break; } }
  }
  return errors;
}

const bad = validate({ name: ' ', sku: 'bad sku', price: -5, category: 'toys' });
console.log(JSON.stringify(bad));
console.log('all failing fields reported at once', Object.keys(bad).length === 4 ? '✅' : '❌ FAIL');
console.log('cross-field check uses the document', validate({ name: 'A', sku: 'ABCD', price: 100, salePrice: 150 }).salePrice ? '✅' : '❌ FAIL');
console.log('valid product passes', Object.keys(validate({ name: 'Book', sku: 'BOOK-1', price: 500, salePrice: 400, category: 'books' })).length === 0 ? '✅' : '❌ FAIL');
const updateErrors = validate({ price: -100 }, { onlyPaths: ['price'] });
console.log('update validators check only the updated path', Object.keys(updateErrors).join() === 'price' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Relying on schema validation while updating with `findByIdAndUpdate` without `runValidators`.
- Expecting `unique: true` to produce a friendly validation message (it's E11000 from the index), or adding it to a collection that already has duplicates (index build fails).
- Arrow functions in validators that need `this` (the document).
- Returning raw Mongoose error objects to clients (they leak internals); map them to a consistent 400/409 format.
- Validating only in the frontend.
:::

::: understand
- Validation lives in your **app**; MongoDB only enforces indexes and optional `$jsonSchema` rules.
- The front-door/side-door distinction (`save` vs update queries) is the most asked Mongoose gotcha.
- Two layers: request validation (shape, unknown fields) and model validation (data integrity).
:::

::: ask
- *"Are there writes that bypass Mongoose (scripts, other services)?"* → `$jsonSchema` too.
- *"Should we enable runValidators globally?"*
- *"What error format does the frontend expect?"*
:::

::: important ⭐ Say this in the interview
"Mongoose validates against the schema before writing: required, min and max, enum, match and length validators, plus custom and async validators. It runs automatically on save, create and insertMany, but update queries like findOneAndUpdate skip it unless I pass runValidators true, which I usually enable globally. unique isn't a validator, it's an index, so duplicates come back as error 11000. In the error middleware I map ValidationError and CastError to 400 with per-field messages and 11000 to 409. And I validate requests with Zod at the API edge as well, because Mongoose only protects the paths that go through it."
:::

::: links
Mongoose: Validation | https://mongoosejs.com/docs/validation.html
Mongoose: Update validators | https://mongoosejs.com/docs/validation.html#update-validators
:::

=== What are Mongoose middleware (hooks)?
@p 2
@tags hooks, middleware, pre, post
@quick
- Functions that run **before (`pre`)** or **after (`post`)** an operation: document (`save`, `validate`, `deleteOne`), query (`find*`, `updateOne`, `findOneAndUpdate`, `deleteMany`…), aggregate, model (`insertMany`).
- In document hooks `this` = the document; in query hooks `this` = the **Query** → use `function () {}`, not arrows.
- Mongoose 9: pre hooks get **no `next()`**; write them `async` (throw to abort).
- ⚠️ `pre('save')` does **not** run for `updateOne`/`findByIdAndUpdate`: a password hashed only in `pre('save')` is stored in **plain text** by an update.
- Uses: hashing, slugs, soft-delete filters, audit fields, cascades; reliable side effects (emails) belong in a queue/outbox.

::: text 🧒 In simple words
Hooks are **automatic routines at a door**. "Before any parcel goes into storage, stamp it" (pre-save). "After a customer is deleted, also throw away their old notes" (post-delete). "Whenever anyone searches, hide parcels marked as binned" (pre-find). The catch is that each routine is tied to **a specific door**: a routine on the front door (save) doesn't run when someone uses the side door (updateOne). So you either use one door for sensitive changes, or put the same routine on both doors.
:::

::: text 📖 Detailed answer
| Hook type | Triggered by | `this` |
|---|---|---|
| Document | `save()`, `validate()`, `doc.deleteOne()`, `doc.updateOne()` | The document |
| Query | `find`, `findOne`, `countDocuments`, `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`… | The Query |
| Aggregate | `Model.aggregate()` | The Aggregate (`this.pipeline()`) |
| Model | `insertMany` | The Model |

### Common uses
| Hook | Purpose |
|---|---|
| `pre('save')` | Hash password if modified, generate slug, normalise data |
| `pre('findOneAndUpdate')` | Hash password in updates, set `updatedBy` |
| `pre(/^find/)` + `pre('countDocuments')` | Hide soft-deleted documents automatically |
| `pre('aggregate')` | Add the same soft-delete `$match` to pipelines |
| `post('findOneAndDelete')` | Cascade delete (comments of a post) |
| `post('save')` | Emit an event / enqueue a job |

### Gotchas
- **Update queries bypass save hooks**, and save hooks don't see `updateOne`.
- `this.isNew` is only true **before** saving: capture it in `pre('save')` if `post('save')` needs it.
- Errors thrown in a pre hook abort the operation; errors in post hooks surface to the caller after the write already happened.
- Side effects in hooks are in-process and easy to lose (crash after write, before email). For reliability use the **outbox pattern** or a job queue.
- Mongoose 9 removed `next()` from pre hooks: `async function () {}` or return a promise.
:::

::: diagram Hooks around save vs around an update query
flowchart LR
  subgraph SAVE["doc.save()"]
    PV["pre validate"] --> V["validate"] --> PS["pre save: hash password"] --> W1[("insert / update")] --> POS["post save"]
  end
  subgraph UPD["findOneAndUpdate()"]
    PQ["pre findOneAndUpdate: hash password in getUpdate()"] --> W2[("update")] --> POQ["post findOneAndUpdate"]
  end
:::

::: image Routines at each door: front door (save) and side door (update queries)
/images/mongoose/hooks.svg
:::

::: text 🪜 Step by step
A user changes their password through `User.findOneAndUpdate({ _id }, { $set: { password: 'NewSecret1' } })`:
1. Mongoose builds the Query and runs `pre('findOneAndUpdate')` hooks with `this` = Query.
2. The hook reads `this.getUpdate()`, finds `$set.password`, hashes it with bcrypt and writes the hash back into the update.
3. Without that hook, step 2 wouldn't happen: `pre('save')` is never called for this query → plain text stored.
4. The update runs; `post('findOneAndUpdate')` receives the resulting document.
5. A `pre(/^find/)` hook on another model adds `{ isDeleted: { $ne: true } }` to every find automatically unless `withDeleted` is set.
:::

::: code javascript Hooks: hashing on both doors, slugs, soft delete and cascade (node hooks.js)
// How to run: npm install mongoose bcryptjs && MONGO_URI=mongodb://localhost:27017/blog node hooks.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema, model } = mongoose;

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const outbox = [];                                                     // stand-in for a jobs/outbox collection

// ---------- User: hash on save AND on findOneAndUpdate ----------
const UserSchema = new Schema({ email: String, password: { type: String, select: false } });
UserSchema.pre('save', async function () {
  this.$locals.wasNew = this.isNew;                                    // remember for post('save')
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});
UserSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate();
  const plain = update.password ?? update.$set?.password;
  if (!plain) return;
  const hashed = await bcrypt.hash(plain, 10);
  if (update.password) update.password = hashed; else update.$set.password = hashed;
});
UserSchema.post('save', function (doc) { if (doc.$locals.wasNew) outbox.push({ type: 'welcome-email', userId: String(doc._id) }); });
const User = model('User', UserSchema);

// ---------- Post: slug + soft delete + cascade ----------
const PostSchema = new Schema({ title: String, slug: String, isDeleted: { type: Boolean, default: false } });
PostSchema.pre('save', function () { if (this.isModified('title')) this.slug = slugify(this.title); });
PostSchema.pre(/^find/, function () { if (!this.getOptions().withDeleted) this.where({ isDeleted: { $ne: true } }); });
PostSchema.pre('countDocuments', function () { this.where({ isDeleted: { $ne: true } }); });
PostSchema.post('findOneAndDelete', async function (doc) { if (doc) await Comment.deleteMany({ post: doc._id }); });
const Post = model('Post', PostSchema);
const Comment = model('Comment', new Schema({ post: Schema.Types.ObjectId, text: String }));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/blog');
  await Promise.all([User.deleteMany({}), Post.deleteMany({}), Comment.deleteMany({})]);

  const u = await User.create({ email: 'a@x.com', password: 'Secret123' });
  console.log('outbox after signup:', outbox.map((j) => j.type).join(', '));
  await User.findOneAndUpdate({ _id: u._id }, { $set: { password: 'NewSecret1' } });
  const stored = (await User.findById(u._id).select('+password').lean()).password;
  console.log('password hashed on update too:', stored.startsWith('$2'), '| matches:', await bcrypt.compare('NewSecret1', stored));
  await User.updateOne({ _id: u._id }, { $set: { password: 'PlainOops1' } });          // no hook for updateOne!
  console.log('updateOne without a hook stores plain text:', (await User.findById(u._id).select('+password').lean()).password);

  const p1 = await Post.create({ title: 'Hello World: Node Hooks!' });
  await Post.create({ title: 'Old post', isDeleted: true });
  await Comment.create([{ post: p1._id, text: 'nice' }, { post: p1._id, text: 'thanks' }]);
  console.log('slug:', p1.slug);
  console.log('visible posts:', await Post.countDocuments(), '| with deleted:', (await Post.find().setOptions({ withDeleted: true })).length);
  await Post.findOneAndDelete({ _id: p1._id });
  console.log('comments after cascade delete:', await Comment.countDocuments({ post: p1._id }));
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: hooks registered per operation (runnable)
// A tiny hook runner: pre hooks run before the operation, post hooks after, each per operation name.
function createHooks() {
  const pre = {}, post = {};
  return {
    pre(op, fn) { (pre[op] ??= []).push(fn); },
    post(op, fn) { (post[op] ??= []).push(fn); },
    async exec(op, ctx, action) {
      for (const fn of pre[op] ?? []) await fn.call(ctx);               // `this` = document or query
      const result = await action(ctx);
      for (const fn of post[op] ?? []) await fn.call(ctx, result);
      return result;
    },
  };
}
const hash = (s) => `hashed(${s})`;
const hooks = createHooks();
const stored = [];
hooks.pre('save', function () { this.password = hash(this.password); });

(async () => {
  await hooks.exec('save', { email: 'a@x.com', password: 'Secret123' }, (doc) => stored.push({ ...doc }));
  console.log('save hook hashed the password', stored[0].password === 'hashed(Secret123)' ? '✅' : '❌ FAIL');

  await hooks.exec('updateOne', { update: { password: 'Plain1' } }, (q) => { stored[0].password = q.update.password; });
  console.log('updateOne skipped the save hook → plain text', stored[0].password === 'Plain1' ? '✅ (the gotcha, reproduced)' : '❌ FAIL');

  hooks.pre('updateOne', function () { this.update.password = hash(this.update.password); });
  await hooks.exec('updateOne', { update: { password: 'Plain2' } }, (q) => { stored[0].password = q.update.password; });
  console.log('adding a query hook fixes it', stored[0].password === 'hashed(Plain2)' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Hashing only in `pre('save')` and updating passwords with `findByIdAndUpdate`.
- Arrow functions as hooks (`this` is not the document/query).
- Calling `next()` in Mongoose 9 pre hooks (it's no longer passed).
- Sending emails or charging cards directly in `post('save')` and losing them on crashes.
- Soft-delete filter on `find` but not on `countDocuments`/`aggregate` → counts include deleted items.
:::

::: understand
- Hooks are tied to **operation names**; document and query middleware are separate worlds.
- Keep hooks small and deterministic; move slow or unreliable side effects to queues.
- Plugins are reusable bundles of hooks and fields (soft delete, audit, timestamps by user).
:::

::: ask
- *"Which code paths change this field?"* (save vs update queries).
- *"Must the side effect happen exactly once even if the process crashes?"* → outbox.
- *"Should soft-deleted items appear in admin views?"*
:::

::: important ⭐ Say this in the interview
"Mongoose middleware are pre and post functions around operations. Document middleware like pre save has this as the document; query middleware like pre findOneAndUpdate or pre find has this as the query. I use them for hashing passwords, generating slugs, adding a soft-delete filter to every find, and cascading deletes. The classic trap is that update queries don't run save hooks, so a password hashed only in pre save gets stored in plain text by findByIdAndUpdate; I either change passwords through save or add an update hook. In Mongoose 9 pre hooks are async functions without next. For reliable side effects like emails, I write an outbox record or enqueue a job rather than doing it directly in a post hook."
:::

::: links
Mongoose: Middleware | https://mongoosejs.com/docs/middleware.html
Mongoose: Plugins | https://mongoosejs.com/docs/plugins.html
:::

=== What are virtuals?
@p 2
@tags virtuals, computed
@quick
- Virtuals are **computed properties** defined on the schema and **not stored** in MongoDB (`fullName`, `isExpired`, `url`).
- `schema.virtual('fullName').get(fn).set(fn)`; use `function` so `this` is the document.
- Included in JSON only with `toJSON: { virtuals: true }`; **not** present on `lean()` results (plugin available).
- **Not queryable or sortable**: if you need to filter/sort by it, store it (computed field updated in a hook).
- **Virtual populate** gives one-to-many relations (`user.posts`, `postCount`) without storing id arrays.

::: text 🧒 In simple words
A virtual is like the **"age" shown on your profile**: the database only stores your birth date, and your age is **worked out each time** someone looks. That keeps the data from going stale (no need to update everyone's age on their birthday). But because age isn't actually written down anywhere, the database can't search "everyone aged 30" by looking at a stored column; for that you'd store something it can search (like birth date ranges).
:::

::: text 📖 Detailed answer
A **virtual** is a property you can get (and optionally set) on a document that **isn't persisted**.

| Example | Getter |
|---|---|
| `fullName` | `${this.firstName} ${this.lastName}` |
| `age` | from `birthDate` |
| `isExpired` | `this.expiresAt < Date.now()` |
| `url` | `/products/${this.slug}` |
| `discountPercent` | from `price` and `salePrice` |

### Behaviour
| Situation | Virtual available? |
|---|---|
| `doc.fullName` on a hydrated document | ✅ |
| `res.json(doc)` | Only with `toJSON: { virtuals: true }` |
| `.lean()` results | ❌ (use `mongoose-lean-virtuals`) |
| `find({ fullName: … })` / `sort({ age: 1 })` | ❌ (not in the database) |
| `id` | Built-in virtual: `_id` as a string |

### Setters
`virtual('fullName').set(function (v) { [this.firstName, this.lastName] = v.split(' '); })` lets clients send one field that fills two.

### Virtual populate
`UserSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'author' })` gives `user.posts` from the posts collection without storing an array of ids on the user (great for unbounded one-to-many). Add `count: true` for a count, `options: { sort, limit }` for the latest N. Index `posts.author`.

### Virtual vs stored computed field
| | Virtual | Stored (computed pattern) |
|---|---|---|
| Always fresh | ✅ | Needs updating |
| Query/sort/index | ❌ | ✅ |
| Cost | Computed on every read | Computed on write |
:::

::: diagram Virtuals are computed on read, not stored
flowchart LR
  DB[("stored: firstName, lastName, birthDate")] --> DOC["hydrated document"]
  DOC --> V1["fullName (getter)"]
  DOC --> V2["age (getter)"]
  DOC --> V3["posts (virtual populate from posts.author)"]
  DOC -->|"toJSON virtuals: true"| JSON["API response includes fullName, age"]
  DB -.->|"find by fullName"| NO["impossible: not stored"]
:::

::: image Age is worked out from the stored birth date each time someone looks
/images/mongoose/virtuals.svg
:::

::: text 🪜 Step by step
`res.json(await User.findById(id).populate('posts').populate('postCount'))` with virtuals `fullName`, `age`, `posts`, `postCount`:
1. The query loads the stored fields (`firstName`, `lastName`, `birthDate`).
2. populate runs `posts.find({ author: id })` and a count query, attaching results to the virtual paths.
3. `res.json` calls `toJSON()`; because `virtuals: true`, Mongoose calls each getter.
4. The JSON contains `fullName`, `age`, `posts` and `postCount`, none of which are stored on the user.
5. If someone asks for "users sorted by age", you sort by `birthDate` instead (stored and indexable).
:::

::: code javascript Virtuals, setters and virtual populate (node virtuals.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/blog node virtuals.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema(
  { firstName: String, lastName: String, birthDate: Date },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
UserSchema.virtual('fullName')
  .get(function () { return `${this.firstName} ${this.lastName}`; })
  .set(function (v) { [this.firstName, this.lastName] = v.split(' '); });
UserSchema.virtual('age').get(function () {
  if (!this.birthDate) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - this.birthDate.getUTCFullYear();
  if (now < new Date(Date.UTC(now.getUTCFullYear(), this.birthDate.getUTCMonth(), this.birthDate.getUTCDate()))) age -= 1;
  return age;
});
UserSchema.virtual('posts', { ref: 'Post', localField: '_id', foreignField: 'author', options: { sort: { createdAt: -1 } } });
UserSchema.virtual('postCount', { ref: 'Post', localField: '_id', foreignField: 'author', count: true });
const User = model('User', UserSchema);
const Post = model('Post', new Schema({ title: String, author: { type: Schema.Types.ObjectId, index: true } }, { timestamps: true }));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/blog');
  await Promise.all([User.deleteMany({}), Post.deleteMany({})]);

  const u = new User({ birthDate: new Date('1994-03-15') });
  u.fullName = 'Asha Rao';                                              // virtual setter fills two fields
  await u.save();
  await Post.create([{ title: 'First', author: u._id }, { title: 'Second', author: u._id }]);

  const loaded = await User.findById(u._id).populate('posts').populate('postCount');
  const json = JSON.parse(JSON.stringify(loaded));
  console.log('stored fields:', JSON.stringify(await User.findById(u._id).select('-_id -__v').lean()));
  console.log('JSON has virtuals:', json.fullName, '| age', json.age, '| posts', json.posts.map((p) => p.title).join(', '), '| count', json.postCount);
  console.log('lean has no virtuals:', (await User.findById(u._id).lean()).fullName);
  console.log('querying a virtual finds nothing:', await User.countDocuments({ fullName: 'Asha Rao' }));
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: getters and setters like Mongoose virtuals (runnable)
function withVirtuals(stored) {
  const doc = { _doc: { ...stored } };
  Object.defineProperty(doc, 'fullName', {
    get() { return `${doc._doc.firstName} ${doc._doc.lastName}`; },
    set(v) { [doc._doc.firstName, doc._doc.lastName] = v.split(' '); },
  });
  Object.defineProperty(doc, 'age', {
    get() {
      const b = new Date(doc._doc.birthDate), now = new Date('2026-10-01T00:00:00Z');
      let age = now.getUTCFullYear() - b.getUTCFullYear();
      if (now < new Date(Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))) age -= 1;
      return age;
    },
  });
  doc.toJSON = () => ({ ...doc._doc, fullName: doc.fullName, age: doc.age });
  return doc;
}

const user = withVirtuals({ firstName: 'Asha', lastName: 'Rao', birthDate: '1994-12-15' });
console.log('getter builds fullName', user.fullName === 'Asha Rao' ? '✅' : '❌ FAIL');
console.log('age respects the birthday not yet reached (31 on 2026-10-01)', user.age === 31 ? '✅' : '❌ FAIL');
user.fullName = 'Asha Sharma';
console.log('setter updates stored fields', user._doc.lastName === 'Sharma' ? '✅' : '❌ FAIL');
console.log('virtuals are not stored', !('fullName' in user._doc) && JSON.stringify(user).includes('"fullName"') ? '✅ (only in JSON output)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Expecting virtuals in API responses without `toJSON: { virtuals: true }`, or on `lean()` results.
- Filtering or sorting by a virtual.
- Arrow functions as getters (`this` is wrong).
- Expensive getters (heavy computation or I/O) run for every document in big lists.
- Virtual populate without an index on the foreign field.
:::

::: understand
- Virtuals keep derived data **fresh by computing it on read**.
- Store a computed value instead when you must query, sort or index it.
- Virtual populate models unbounded one-to-many from the "one" side cleanly.
:::

::: ask
- *"Do we need to sort or filter by this value?"* → store it.
- *"Is this value needed in list responses (lean)?"*
- *"Is the relationship bounded?"* → embed ids vs virtual populate.
:::

::: important ⭐ Say this in the interview
"Virtuals are computed properties defined on the schema that aren't stored, like fullName from first and last name, age from birthDate, or a URL from a slug. They can have setters too, so a client can send fullName and Mongoose fills both fields. They only appear in JSON if toJSON virtuals is enabled, they're missing from lean results, and they can't be queried or sorted because they don't exist in the database; if I need that, I store a computed field instead. Virtual populate is useful for one-to-many relations like user.posts based on post.author, without keeping an ever-growing array of ids on the user."
:::

::: links
Mongoose: Virtuals | https://mongoosejs.com/docs/tutorials/virtuals.html
Mongoose: Populate virtuals | https://mongoosejs.com/docs/populate.html#populate-virtuals
:::

=== How do you handle timestamps?
@p 2
@tags timestamps, dates
@quick
- `{ timestamps: true }` → Mongoose sets `createdAt` on insert and `updatedAt` on insert, `save()` and update queries (`updateOne`, `findOneAndUpdate`, `updateMany`, `replaceOne`).
- Rename: `{ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }`; skip one write: `{ timestamps: false }` option.
- MongoDB stores Dates as **UTC milliseconds**; APIs send **ISO-8601** (`2026-09-30T04:15:00.000Z`); the UI converts to the user's timezone.
- Business events get explicit fields: `paidAt`, `shippedAt`, `deletedAt`.
- Group "per day" with a **timezone** (`$dateToString` with `timezone: 'Asia/Kolkata'`), or evening orders land on the wrong day.

::: text 🧒 In simple words
Timestamps are the **"received" and "last changed" stamps** a clerk puts on every form automatically. The stamps are always in **one world clock (UTC)**, so a form stamped in Delhi and one stamped in New York can be compared fairly. When you show the stamp to a person, you translate it into **their local time**, the same way an airline ticket shows departure in local time but the airline's systems use one clock underneath.
:::

::: text 📖 Detailed answer
`timestamps: true` adds two Date fields managed by Mongoose:

| Field | Set on |
|---|---|
| `createdAt` | Insert only (`save` of a new doc, `create`, `insertMany`, upsert inserts via `$setOnInsert`) |
| `updatedAt` | Insert and every `save()`, `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne` |

Options: rename fields, use only one (`{ createdAt: true, updatedAt: false }`), custom clock (`currentTime: () => …`), or skip per operation with `{ timestamps: false }` (e.g. incrementing a view counter shouldn't count as an "update").

### Time-zone rules
| Layer | Rule |
|---|---|
| Database | Store UTC `Date` (MongoDB always does) |
| API | ISO-8601 strings with `Z` |
| UI | Convert with `Intl.DateTimeFormat` / date-fns-tz to the viewer's zone |
| Reports | Decide the **business timezone** and pass it to date operators |

### Other tips
- Index `createdAt` (usually compound, e.g. `{ userId: 1, createdAt: -1 }`) for "latest first" lists.
- `_id.getTimestamp()` also tells creation time (to the second).
- Timestamps record **when** something changed; for **who/what** keep an audit log.
- `timestamps` are not applied by `bulkWrite` or the native driver; set them yourself there.
:::

::: diagram One clock in storage, local clocks on screen
flowchart LR
  W["save / updateOne"] -->|"Mongoose sets createdAt, updatedAt"| DB[("UTC Date: 2026-09-30T04:15:00Z")]
  DB -->|"API: ISO string"| UI["browser"]
  UI --> IN["India: 30 Sept, 9:45 am"]
  UI --> NY["New York: 30 Sept, 12:15 am"]
:::

::: image Received and last-changed stamps in one world clock, shown in local time
/images/mongoose/timestamps.svg
:::

::: text 🪜 Step by step
An order's lifecycle with `timestamps: true`:
1. `Order.create({ total: 499 })` at 04:15 UTC → `createdAt = updatedAt = 04:15Z`.
2. Payment at 04:20 → `updateOne({ _id }, { $set: { status: 'PAID', paidAt: new Date() } })` → `updatedAt = 04:20Z`, `createdAt` unchanged.
3. A view counter `updateOne({ _id }, { $inc: { views: 1 } }, { timestamps: false })` leaves `updatedAt` alone.
4. The API returns `"createdAt": "2026-09-30T04:15:00.000Z"`.
5. The UI shows "30 Sept 2026, 9:45 am" for an Indian user.
6. The daily sales report groups by `$dateToString` with `timezone: 'Asia/Kolkata'`, so an order at 20:00 UTC counts for the next Indian day.
:::

::: code javascript Timestamps in practice (node timestamps.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node timestamps.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const OrderSchema = new Schema({ total: Number, status: { type: String, default: 'PENDING' }, paidAt: Date, views: { type: Number, default: 0 } }, { timestamps: true });
OrderSchema.index({ createdAt: -1 });
const Order = model('Order', OrderSchema);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Order.deleteMany({});

  const o = await Order.create({ total: 499 });
  console.log('created:', o.createdAt.toISOString(), '| updatedAt equal:', o.createdAt.getTime() === o.updatedAt.getTime());

  await sleep(20);
  await Order.updateOne({ _id: o._id }, { $set: { status: 'PAID', paidAt: new Date() } });
  const paid = await Order.findById(o._id).lean();
  console.log('updatedAt moved on update:', paid.updatedAt > paid.createdAt, '| createdAt unchanged:', paid.createdAt.getTime() === o.createdAt.getTime());

  await sleep(20);
  await Order.updateOne({ _id: o._id }, { $inc: { views: 1 } }, { timestamps: false });
  const viewed = await Order.findById(o._id).lean();
  console.log('view counter skipped updatedAt:', viewed.updatedAt.getTime() === paid.updatedAt.getTime(), '| views', viewed.views);

  // Daily report in the business timezone: 20:00 UTC on 30 Sept is 1 Oct in India
  await Order.insertMany([{ total: 100, createdAt: new Date('2026-09-30T20:00:00Z') }, { total: 200, createdAt: new Date('2026-09-30T10:00:00Z') }]);
  const day = (tz) => Order.aggregate([
    { $match: { total: { $in: [100, 200] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, sales: { $sum: '$total' } } },
    { $sort: { _id: 1 } },
  ]);
  console.log('per day UTC:', JSON.stringify(await day('UTC')), '| per day IST:', JSON.stringify(await day('Asia/Kolkata')));
  console.log('API JSON:', JSON.stringify({ createdAt: o.createdAt }));
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: UTC storage, local display and day boundaries (runnable)
const createdAt = new Date('2026-09-30T04:15:00.000Z');                 // what MongoDB stores / the API returns
const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(createdAt);
console.log('UTC     :', createdAt.toISOString());
console.log('India   :', fmt('Asia/Kolkata'));
console.log('New York:', fmt('America/New_York'));
console.log('India shows 09:45', fmt('Asia/Kolkata').includes('09:45') ? '✅' : '❌ FAIL');
console.log('New York shows 00:15 the same day', fmt('America/New_York').includes('00:15') ? '✅' : '❌ FAIL');

const dayIn = (date, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);   // YYYY-MM-DD
const lateOrder = new Date('2026-09-30T20:00:00Z');
console.log(`20:00 UTC is ${dayIn(lateOrder, 'UTC')} in UTC but ${dayIn(lateOrder, 'Asia/Kolkata')} in India`, dayIn(lateOrder, 'Asia/Kolkata') === '2026-10-01' ? '✅' : '❌ FAIL');
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
console.log('relative label:', rtf.format(-1, 'day'), rtf.format(-1, 'day') === 'yesterday' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing dates as strings or in local time ("30/09/2026 9:45").
- Grouping by day without a timezone → reports off by one day for evening orders.
- Using `updatedAt` as "last meaningful change" while view counters keep bumping it.
- Expecting `bulkWrite` or raw driver inserts to set timestamps.
- Formatting dates on the server in the server's timezone.
:::

::: understand
- One clock (UTC) for storage and APIs; many clocks for people.
- `createdAt`/`updatedAt` are technical; domain events deserve their own named fields.
- Timezone is a **business decision** for reports: ask which one.
:::

::: ask
- *"Which timezone defines a business day for reports?"*
- *"Do we need who changed it, not just when?"* → audit log.
- *"Should background counters bump updatedAt?"*
:::

::: important ⭐ Say this in the interview
"I enable timestamps true on the schema, so Mongoose sets createdAt on insert and updatedAt on every save and update query; I can rename them or skip them per operation, for example for a view counter. MongoDB stores dates in UTC, the API returns ISO-8601 strings, and the frontend formats them in the user's timezone with Intl. For business events I add explicit fields like paidAt and shippedAt. And for reports I always pass the business timezone to date operators: an order at 8 pm UTC on 30 September is already 1 October in India."
:::

::: links
Mongoose: Timestamps | https://mongoosejs.com/docs/timestamps.html
MDN: Intl.DateTimeFormat | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
MongoDB: $dateToString | https://www.mongodb.com/docs/manual/reference/operator/aggregation/dateToString/
:::

=== How do you create indexes in Mongoose?
@p 2
@tags indexes, mongoose
@quick
- Field level: `index: true`, `unique: true`, `sparse: true`, `expires: '30d'` (TTL on a Date).
- Schema level: `schema.index({ userId: 1, createdAt: -1 })`, text `schema.index({ title: 'text' })`, partial via `partialFilterExpression`.
- `autoIndex` builds missing indexes when the model is first used: fine in dev, **turn it off in production** and run `Model.syncIndexes()` / `createIndexes()` in a deploy step.
- `syncIndexes()` **creates missing and drops indexes not in the schema**; `diffIndexes()` previews; `listIndexes()` shows them.
- `unique` on a field that already has duplicates → index build fails; clean data first.

::: text 🧒 In simple words
Declaring indexes in the schema is like **writing on the blueprint** "this storeroom needs a catalogue by customer and date". Mongoose can build those catalogues for you the moment the storeroom opens (autoIndex). That's convenient on a small test store, but in a giant real store, building a new catalogue while customers are shopping is disruptive, so you schedule it as a **planned job** during a deploy, and you check first what will be added and what will be removed.
:::

::: text 📖 Detailed answer
### Declaring indexes
| Where | Example | Creates |
|---|---|---|
| Field | `email: { type: String, unique: true }` | Unique index `email_1` |
| Field | `userId: { type: ObjectId, index: true }` | `userId_1` |
| Field | `phone: { type: String, unique: true, sparse: true }` | Unique only where `phone` exists |
| Field | `createdAt: { type: Date, expires: '30d' }` | TTL index (deleted ~30 days after) |
| Schema | `schema.index({ userId: 1, type: 1, createdAt: -1 })` | Compound (ESR) |
| Schema | `schema.index({ title: 'text', body: 'text' }, { weights: { title: 5 } })` | Text |
| Schema | `schema.index({ sku: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } })` | Unique among live docs |

### Building them
| API | Does |
|---|---|
| `autoIndex` (default on) | `createIndexes()` on first model use |
| `Model.init()` | Promise that resolves when auto-indexing finishes (tests) |
| `Model.createIndexes()` | Create declared indexes (never drops) |
| `Model.diffIndexes()` | `{ toDrop, toCreate }` preview |
| `Model.syncIndexes()` | Create missing **and drop** undeclared ones ⚠️ |
| `Model.listIndexes()` | What exists in MongoDB |

### Production practice
1. `autoIndex: false` (schema option or `mongoose.set('autoIndex', false)`).
2. A migration/deploy script runs `diffIndexes()` → review → `syncIndexes()` or `createIndexes()`.
3. Big collections: build during low traffic (Atlas does rolling builds); watch replication lag.
4. Before adding `unique`, find duplicates with an aggregation (`$group` + `count > 1`).
:::

::: diagram From schema declarations to MongoDB indexes
flowchart LR
  SCH["schema: index true, unique, schema.index(...)"] --> DEV{"environment"}
  DEV -->|"dev: autoIndex"| AUTO["createIndexes on first use"]
  DEV -->|"prod: autoIndex false"| MIG["deploy script: diffIndexes → syncIndexes"]
  AUTO --> IDX[("indexes in MongoDB")]
  MIG --> IDX
:::

::: image Writing catalogues on the blueprint, building them as a planned job
/images/mongoose/indexes.svg
:::

::: text 🪜 Step by step
Adding a compound index safely to an existing `events` collection:
1. Add `EventSchema.index({ userId: 1, type: 1, createdAt: -1 })` in code.
2. In the deploy script, `await Event.diffIndexes()` → `{ toCreate: [userId_1_type_1_createdAt_-1], toDrop: [] }`.
3. Confirm `toDrop` doesn't contain an index created manually by someone else (syncIndexes would remove it).
4. Run `await Event.syncIndexes()` (or `createIndexes()` to never drop).
5. Check with `listIndexes()` and verify the target query's explain uses it.
:::

::: code javascript Declaring, diffing and syncing indexes (node mongoose-indexes.js)
// How to run: npm install mongoose && MONGO_URI=mongodb://localhost:27017/shop node mongoose-indexes.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const EventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, index: true },
  email: { type: String, unique: true },
  phone: { type: String, unique: true, sparse: true },                   // unique only when present
  type: String,
  title: String,
  createdAt: { type: Date, default: Date.now, expires: '30d' },          // TTL index
}, { autoIndex: false });                                                // production style
EventSchema.index({ userId: 1, type: 1, createdAt: -1 });
EventSchema.index({ title: 'text' });

const Event = model('Event', EventSchema);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  await Event.collection.drop().catch(() => {});
  await Event.createCollection();
  await Event.collection.createIndex({ legacyField: 1 });                // someone created this by hand

  const diff = await Event.diffIndexes();
  console.log('to create:', diff.toCreate.map((k) => Object.keys(k).join('+')).join(' | '));
  console.log('to drop:', diff.toDrop.join(', '));
  await Event.syncIndexes();                                             // creates missing, drops legacyField_1
  console.log('now:', (await Event.listIndexes()).map((i) => i.name + (i.expireAfterSeconds ? ` (TTL ${i.expireAfterSeconds}s)` : '')).join(' | '));

  await Event.create([{ email: 'a@x.com' }, { email: 'b@x.com' }]);      // two docs without phone: sparse allows it
  try { await Event.create({ email: 'a@x.com' }); } catch (err) { console.log('duplicate email rejected:', err.code); }
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: what syncIndexes would do (runnable)
function diffIndexes(declared, existing) {
  const key = (ix) => JSON.stringify(ix);
  const declaredKeys = new Set(declared.map(key));
  const existingKeys = new Set(existing.map(key));
  return {
    toCreate: declared.filter((ix) => !existingKeys.has(key(ix))),
    toDrop: existing.filter((ix) => key(ix) !== '{"_id":1}' && !declaredKeys.has(key(ix))),
  };
}
const declared = [{ userId: 1 }, { email: 1 }, { userId: 1, type: 1, createdAt: -1 }];
const existing = [{ _id: 1 }, { userId: 1 }, { legacyField: 1 }];
const diff = diffIndexes(declared, existing);
console.log('to create:', JSON.stringify(diff.toCreate), '| to drop:', JSON.stringify(diff.toDrop));
console.log('missing indexes are created', diff.toCreate.length === 2 ? '✅' : '❌ FAIL');
console.log('undeclared legacy index would be DROPPED ⚠️', diff.toDrop.length === 1 && diff.toDrop[0].legacyField === 1 ? '✅' : '❌ FAIL');
console.log('_id index is never dropped', !diff.toDrop.some((ix) => '_id' in ix) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Leaving `autoIndex` on in production with huge collections (surprise index builds on deploy).
- Running `syncIndexes()` blindly and dropping an index someone added manually for a hot query.
- Adding `unique: true` to a field that already contains duplicates (build fails; app may not notice).
- Declaring both `index: true` on a field and a compound index starting with it (redundant prefix).
- Thinking `expires` deletes exactly on time (the TTL monitor runs about every 60 seconds).
:::

::: understand
- Index **definitions** live in code (reviewed, versioned); index **builds** are an operational step.
- `diffIndexes` + `syncIndexes` make index management repeatable like migrations.
- Each declared index must be justified by a real query (see the ESR rule).
:::

::: ask
- *"How large is the collection, and is there a low-traffic window?"*
- *"Were any indexes created manually in production?"*
- *"Does the data already satisfy the new unique constraint?"*
:::

::: important ⭐ Say this in the interview
"I declare indexes in the schema: index, unique, sparse and expires at field level, and schema.index for compound, text and partial indexes, following ESR for compound ones. Mongoose's autoIndex builds them when the model is first used, which is fine in development, but in production I turn it off and build them in a deploy step: diffIndexes to preview, then syncIndexes or createIndexes. syncIndexes also drops indexes that aren't declared, so I check the diff first. Before adding a unique index I clean up duplicates, otherwise the build fails."
:::

::: links
Mongoose: Indexes | https://mongoosejs.com/docs/guide.html#indexes
Mongoose: Model.syncIndexes | https://mongoosejs.com/docs/api/model.html#Model.syncIndexes()
MongoDB: TTL indexes | https://www.mongodb.com/docs/manual/core/index-ttl/
:::

=== How do you handle transactions?
@p 2
@tags transactions, acid, session
@quick
- Single-document writes are **always atomic**; multi-document ACID transactions need a **replica set** (or sharded cluster), e.g. Atlas or `mongod --replSet`.
- Mongoose: `await connection.transaction(async (session) => { …, { session } })` (or `session.withTransaction`); pass **`{ session }` to every operation**.
- The helper **retries** on `TransientTransactionError` and unknown commit results; throw to **abort** (everything rolls back).
- Measured crash after the debit step: total money **70 without a transaction, 100 with one** (all-or-nothing). A local transfer cost **2.2 ms** with a transaction vs **2.4 ms** without.
- Keep transactions short (60 s default limit); design documents so most invariants fit in **one document**; external side effects need outbox/saga.

::: text 🧒 In simple words
Moving ₹30 from Asha to Ben is two steps: take ₹30 from Asha, give ₹30 to Ben. If the power goes out **between** the steps, ₹30 vanishes. A transaction is like doing both steps **inside a sealed envelope**: either the whole envelope is posted (both steps happen) or it's torn up (neither happens). Nobody outside ever sees the half-done state. Envelopes cost a little extra effort, so if you can keep everything that must change together **in one document**, you don't need one at all.
:::

::: text 📖 Detailed answer
### When do you need one?
| Situation | Need a transaction? |
|---|---|
| Update many fields/arrays in **one** document | No: single-document writes are atomic |
| Transfer money between two account documents | Yes |
| Create an order **and** decrement stock in products | Yes (or reserve stock inside the product doc) |
| Write to MongoDB **and** call a payment API | A transaction can't roll back the API → outbox/saga |

### Requirements and rules
- **Replica set** or sharded cluster (a single-node replica set works for development).
- All operations in the transaction use the **same session** (`{ session }`); `Model.create` with a session takes an **array**.
- Default **60 s** lifetime; keep them short and avoid user think-time inside.
- `readConcern: 'snapshot'`, `writeConcern: { w: 'majority' }` for strong guarantees.
- Write conflicts on the same documents → one transaction aborts with a `TransientTransactionError`; the helper retries it.

### Measured (Mongoose 9, single-node replica set, local)
| | Result |
|---|---|
| Crash after the debit, **no** transaction | Total money 100 → **70** (₹30 lost) |
| Same crash **inside** a transaction | Total stays **100** (debit rolled back) |
| 500 transfers (2 updates each), plain | 2.37 ms average |
| 500 transfers in transactions | 2.18 ms average |
Locally the overhead was within noise; on real multi-node clusters with `w: 'majority'` every commit waits for replication, and contention causes retries, so expect more.

### Alternatives
Model the invariant in **one document** (stock reservations inside the product, ledger entries appended to an account), use **conditional updates** (`balance: { $gte: amount }`), and for cross-service work use the **outbox** pattern or **sagas** with compensating actions.
:::

::: diagram Money transfer transaction
sequenceDiagram
  participant S as Service
  participant DB as MongoDB (replica set)
  S->>DB: startSession + startTransaction
  S->>DB: debit A where balance >= amount (session)
  S->>DB: credit B (session)
  S->>DB: insert ledger entry (session)
  alt all succeed
    S->>DB: commitTransaction
  else any step throws
    S->>DB: abortTransaction (all rolled back)
  end
:::

::: chart bar Measured: total money after a crash between debit and credit (expected 100)
Approach,Total money
Without a transaction,70
With a transaction,100
:::

::: image Two steps sealed in one envelope: posted together or torn up together
/images/mongoose/transactions.svg
:::

::: text 🪜 Step by step
`placeOrder(userId, [{ productId, qty: 2 }])` inside `connection.transaction(async (session) => …)`:
1. Mongoose starts a session and a transaction.
2. For each item: `updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { session })`; `modifiedCount === 0` → throw "Out of stock".
3. `Order.create([{ userId, items }], { session })` inserts the order (array form required with a session).
4. If any step throws, the helper aborts: stock changes made in step 2 are undone, no order exists.
5. If all succeed, it commits; other clients now see the new stock and order at the same moment.
6. If the commit result is unknown (network blip), the helper retries the commit safely.
:::

::: code javascript Transfer and order placement with transactions (node transactions.js)
// How to run: needs a replica set, e.g. docker run -d -p 27017:27017 mongo:7 --replSet rs0
//   then: docker exec <id> mongosh --eval "rs.initiate()"
//   npm install mongoose && MONGO_URI="mongodb://localhost:27017/bank?directConnection=true" node transactions.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function main() {
  const conn = await mongoose.createConnection(process.env.MONGO_URI || 'mongodb://localhost:27017/bank?directConnection=true').asPromise();
  const Account = conn.model('Account', new Schema({ owner: String, balance: { type: Number, min: 0 } }));
  const Ledger = conn.model('Ledger', new Schema({ from: Schema.Types.ObjectId, to: Schema.Types.ObjectId, amount: Number }, { timestamps: true }));
  const Product = conn.model('Product', new Schema({ name: String, stock: Number }));
  const Order = conn.model('Order', new Schema({ userId: String, items: [{ productId: Schema.Types.ObjectId, qty: Number }], status: String }));
  await Promise.all([Account, Ledger, Product, Order].map((M) => M.deleteMany({})));
  await Promise.all([Account, Ledger, Product, Order].map((M) => M.createCollection().catch(() => {})));   // collections exist before transactions

  async function transfer(fromId, toId, amount) {
    await conn.transaction(async (session) => {
      const debit = await Account.updateOne({ _id: fromId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { session });
      if (debit.modifiedCount !== 1) throw new AppError(400, 'Insufficient balance');
      await Account.updateOne({ _id: toId }, { $inc: { balance: amount } }, { session });
      await Ledger.create([{ from: fromId, to: toId, amount }], { session });
    });
  }

  async function placeOrder(userId, items) {
    let order;
    await conn.transaction(async (session) => {
      for (const { productId, qty } of items) {
        const r = await Product.updateOne({ _id: productId, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { session });
        if (r.modifiedCount === 0) throw new AppError(409, `Out of stock: ${productId}`);
      }
      [order] = await Order.create([{ userId, items, status: 'PENDING' }], { session });
    });
    return order;
  }

  const [asha, ben] = await Account.create([{ owner: 'Asha', balance: 100 }, { owner: 'Ben', balance: 0 }]);
  const total = async () => (await Account.find().lean()).reduce((s, a) => s + a.balance, 0);

  await transfer(asha._id, ben._id, 30);
  console.log('after transfer:', (await Account.find().lean()).map((a) => `${a.owner}=${a.balance}`).join(' '), '| ledger entries:', await Ledger.countDocuments());
  try { await transfer(asha._id, ben._id, 500); } catch (err) { console.log('rejected:', err.status, err.message, '| total still', await total()); }

  try {
    await conn.transaction(async (session) => {
      await Account.updateOne({ _id: asha._id }, { $inc: { balance: -30 } }, { session });
      throw new Error('process crashed before the credit');
    });
  } catch (err) { console.log('crash inside transaction →', err.message, '| total still', await total()); }

  const [mug, pen] = await Product.create([{ name: 'Mug', stock: 5 }, { name: 'Pen', stock: 1 }]);
  const order = await placeOrder('u1', [{ productId: mug._id, qty: 2 }]);
  console.log('order placed:', order.status, '| mug stock:', (await Product.findById(mug._id).lean()).stock);
  try { await placeOrder('u1', [{ productId: mug._id, qty: 1 }, { productId: pen._id, qty: 2 }]); } catch (err) {
    console.log('rolled back:', err.message.split(':')[0], '| mug stock still', (await Product.findById(mug._id).lean()).stock, '| orders', await Order.countDocuments());
  }
  await conn.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code yaml docker-compose: single-node replica set for local transactions
services:
  mongo:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports: ["27017:27017"]
    healthcheck:
      # initiate the replica set on first start (the health check runs until it succeeds)
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}).ok }"]
      interval: 5s
      retries: 20
# connection string from other containers: mongodb://mongo:27017/app?replicaSet=rs0
:::

::: code javascript Browser demo: all-or-nothing with a write log (runnable)
// Apply steps to a copy and only swap it in on commit: the essence of atomicity.
function createStore(initial) {
  let data = structuredClone(initial);
  return {
    get: () => structuredClone(data),
    run(steps) {                                  // no transaction: steps hit the real data one by one
      for (const step of steps) step(data);
    },
    transaction(steps) {
      const draft = structuredClone(data);        // isolated snapshot
      for (const step of steps) step(draft);      // a throw here abandons the draft
      data = draft;                               // commit: everything becomes visible at once
    },
  };
}
const debit = (d) => { if (d.asha < 30) throw new Error('Insufficient'); d.asha -= 30; };
const crash = () => { throw new Error('crash before credit'); };
const credit = (d) => { d.ben += 30; };
const total = (s) => s.get().asha + s.get().ben;

const plain = createStore({ asha: 100, ben: 0 });
try { plain.run([debit, crash, credit]); } catch {}
console.log(`without a transaction total = ${total(plain)}`, total(plain) === 70 ? '✅ (₹30 lost, as measured)' : '❌ FAIL');

const safe = createStore({ asha: 100, ben: 0 });
try { safe.transaction([debit, crash, credit]); } catch {}
console.log(`with a transaction total = ${total(safe)}`, total(safe) === 100 ? '✅' : '❌ FAIL');
safe.transaction([debit, credit]);
console.log('successful transaction moves the money', safe.get().asha === 70 && safe.get().ben === 30 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Forgetting `{ session }` on one operation: it runs **outside** the transaction and won't roll back.
- Running transactions against a standalone server (error: "Transaction numbers are only allowed on a replica set member or mongos").
- Calling external APIs or sending emails inside the transaction and expecting rollback.
- Long transactions holding many documents → conflicts, retries, 60 s timeouts.
- Using transactions for things one atomic update could do (`$inc` with a `$gte` guard).
:::

::: understand
- Prefer **document design** and **conditional atomic updates** first; transactions for real multi-document invariants.
- The helpers (`connection.transaction`, `withTransaction`) handle retries; your callback must be safe to run more than once.
- Database transactions stop at the database boundary: outbox and sagas handle the rest.
:::

::: ask
- *"Can one document hold this invariant?"*
- *"Which external side effects happen, and how do we compensate if they fail?"*
- *"What consistency do readers need: snapshot, majority?"*
:::

::: important ⭐ Say this in the interview
"Single-document operations in MongoDB are always atomic, so I first try to model invariants inside one document or use conditional updates like $inc with a balance check. When several documents must change together, like a money transfer or creating an order and decrementing stock, I use a multi-document transaction, which needs a replica set. In Mongoose I use connection.transaction or session.withTransaction, pass the session to every operation, and throw to abort; the helper retries transient errors. In a test, crashing between debit and credit lost 30 rupees without a transaction and nothing with one. I keep transactions short, and for external side effects like payments or emails I use the outbox pattern or a saga, because a database transaction can't roll those back."
:::

::: links
Mongoose: Transactions | https://mongoosejs.com/docs/transactions.html
MongoDB: Transactions | https://www.mongodb.com/docs/manual/core/transactions/
MongoDB: Production considerations for transactions | https://www.mongodb.com/docs/manual/core/transactions-production-consideration/
:::
