@section REST APIs & Authentication
@icon 🌐
@color #0ea5e9
@desc REST design, HTTP methods and status codes, idempotency, sessions vs JWT, token storage, end-to-end auth, API security, rate limiting, duplicate prevention and response design, with measured numbers and complete runnable Express 5 code.

=== What makes an API RESTful?
@p 3
@tags rest, api-design
@quick
- REST is an **architectural style**: **resources** identified by **URLs**, manipulated with **HTTP methods**, transferred as **representations** (usually JSON).
- Constraints: **client–server, stateless, cacheable, uniform interface, layered system** (+ optional code on demand).
- URLs are **nouns** (`/orders/42`), methods are the **verbs**; plural collections; nesting max ~2 levels; filters in the query string.
- **Stateless** = every request carries what's needed (token, ids); no per-client memory on the server between requests → easy horizontal scaling.
- Most real APIs are Richardson **Level 2** (resources + verbs + status codes); full HATEOAS (Level 3) is rare.

::: text 🧒 In simple words
Think of a **library**. Every book has a fixed shelf address (the URL: `/books/42`). You don't invent new words for every action ("pleaseGiveMeBook42"); you use a small set of standard actions that work for every book: **look at it** (GET), **add a new one** (POST), **replace it** (PUT), **fix a page** (PATCH), **remove it** (DELETE). The librarian doesn't need to remember you between visits: you show your library card every time (stateless). Because the rules are the same everywhere, anyone who knows one library can use any other. That predictability is what REST is about.
:::

::: text 📖 Detailed answer
**REST (Representational State Transfer)** was described by Roy Fielding in 2000. An API is RESTful when it respects these constraints:

| Constraint | Meaning | Practical effect |
|---|---|---|
| **Client–server** | UI and data/logic are separated | React app and API evolve and deploy independently |
| **Stateless** | Each request contains everything needed; no session memory on the server between requests | Any server can handle any request → load balancing and autoscaling are easy |
| **Cacheable** | Responses say whether/how long they can be cached | `Cache-Control`, `ETag`, CDN caching of GETs |
| **Uniform interface** | Resources have URIs; you act on them via representations and standard methods; messages are self-descriptive | Predictable API: learn one resource, know them all |
| **Layered system** | The client can't tell if it talks to the server, a CDN, a gateway or a load balancer | Add Nginx, API Gateway, CloudFront without client changes |
| Code on demand (optional) | Server may send code to run | Rarely used in APIs |

### Resource design rules
| Rule | ✅ Good | ❌ Bad |
|---|---|---|
| Nouns, not verbs | `POST /orders` | `POST /createOrder` |
| Plural collections | `/users`, `/users/42` | `/user/42` |
| Relationships by nesting (shallow) | `/users/42/orders` | `/users/42/orders/7/items/3/notes` |
| Filters/sort/paging in the query | `/orders?status=paid&sort=-createdAt&page=2` | `/paidOrdersSortedByDate` |
| Non-CRUD actions as sub-resources | `POST /orders/42/cancel` | `GET /orders/42?action=cancel` |
| Consistent casing | kebab-case URLs, camelCase JSON | mixed styles |

### Richardson Maturity Model
| Level | What it adds | Example |
|---|---|---|
| 0 | One endpoint, RPC over HTTP | `POST /api` with `{ "action": "getUser" }` |
| 1 | Resources | `/users/42` |
| **2** | **HTTP verbs + status codes** | `GET`, `DELETE`, `201`, `404` (most APIs) |
| 3 | Hypermedia (HATEOAS) | Responses include `links` to next actions |

### REST vs alternatives
**GraphQL** (one endpoint, the client chooses fields; good for complex UIs), **gRPC** (binary, fast, typed; service-to-service), **tRPC** (TypeScript end-to-end in one repo).
:::

::: diagram Resource-oriented URL design
flowchart LR
  A["GET /orders"] --- B["list (filter, sort, page)"]
  C["POST /orders"] --- D["create → 201 + Location"]
  E["GET /orders/42"] --- F["read one"]
  G["PATCH /orders/42"] --- H["partial update"]
  I["DELETE /orders/42"] --- J["delete → 204"]
  K["POST /orders/42/cancel"] --- L["action as a sub-resource"]
  M["GET /users/7/orders"] --- N["relationship"]
:::

::: image REST like a library: every resource has an address, and the same few verbs work everywhere
/images/rest-auth/restful.svg
:::

::: text 🪜 Step by step
Designing the orders API below from scratch:
1. **Find the resources** (nouns): orders, a user's orders.
2. **Give each an address**: collection `/orders`, item `/orders/:id`, relationship `/users/:userId/orders`.
3. **Map operations to methods**: list/create on the collection, read/replace/update/delete on the item.
4. **Map non-CRUD actions** to sub-resources: `POST /orders/:id/cancel` (it changes state, so not GET).
5. **Choose status codes and headers**: `201 + Location` on create, `204` on delete, `404` for unknown ids, `409` when cancelling an already-shipped order.
6. **Keep it stateless**: the client sends its identity (here an `x-user-id` header standing in for a token) on every request.
:::

::: code javascript RESTful orders API, complete and runnable (node rest-orders.js)
// How to run: npm install express && node rest-orders.js
// Then try:
//   curl -i -X POST localhost:3000/api/v1/orders -H 'x-user-id: 7' -H 'Content-Type: application/json' -d '{"items":[{"sku":"MUG","qty":2}]}'
//   curl -s "localhost:3000/api/v1/orders?status=pending&sort=-createdAt" -H 'x-user-id: 7'
//   curl -i -X POST localhost:3000/api/v1/orders/1/cancel -H 'x-user-id: 7'
const express = require('express');

const app = express();
app.use(express.json());

const orders = new Map();
let nextId = 1;

// Stateless identity: every request says who it is (a real API verifies a token here)
app.use('/api', (req, res, next) => {
  req.userId = Number(req.get('x-user-id'));
  if (!req.userId) return res.status(401).json({ error: 'x-user-id header required' });
  return next();
});

const findOwned = (req, res) => {
  const order = orders.get(Number(req.params.id));
  if (!order || order.userId !== req.userId) { res.status(404).json({ error: 'Order not found' }); return null; }
  return order;
};

const v1 = express.Router();

v1.get('/orders', (req, res) => {                                   // list + filter + sort
  let list = [...orders.values()].filter((o) => o.userId === req.userId);
  if (req.query.status) list = list.filter((o) => o.status === req.query.status);
  const desc = req.query.sort === '-createdAt';
  list.sort((a, b) => (desc ? -1 : 1) * a.createdAt.localeCompare(b.createdAt));
  res.json({ data: list });
});

v1.post('/orders', (req, res) => {                                  // create
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'items must be a non-empty array' });
  const order = { id: nextId++, userId: req.userId, items, status: 'pending', createdAt: new Date().toISOString() };
  orders.set(order.id, order);
  return res.status(201).location(`/api/v1/orders/${order.id}`).json({ data: order });
});

v1.get('/orders/:id', (req, res) => {                               // read one
  const order = findOwned(req, res);
  if (order) res.json({ data: order });
});

v1.patch('/orders/:id', (req, res) => {                             // partial update (only allowed fields)
  const order = findOwned(req, res);
  if (!order) return undefined;
  if (order.status !== 'pending') return res.status(409).json({ error: `Cannot edit a ${order.status} order` });
  if (Array.isArray(req.body?.items) && req.body.items.length) order.items = req.body.items;
  return res.json({ data: order });
});

v1.delete('/orders/:id', (req, res) => {                            // delete
  const order = findOwned(req, res);
  if (!order) return;
  orders.delete(order.id);
  res.status(204).end();
});

v1.post('/orders/:id/cancel', (req, res) => {                       // action as a sub-resource
  const order = findOwned(req, res);
  if (!order) return undefined;
  if (order.status === 'cancelled') return res.json({ data: order });           // already done: same result
  if (order.status !== 'pending') return res.status(409).json({ error: `Cannot cancel a ${order.status} order` });
  order.status = 'cancelled';
  return res.json({ data: order });
});

v1.get('/users/:userId/orders', (req, res) => {                     // relationship
  if (Number(req.params.userId) !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  return res.json({ data: [...orders.values()].filter((o) => o.userId === req.userId) });
});

app.use('/api/v1', v1);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/api/v1`));
:::

::: code javascript Browser demo: lint URLs against REST naming rules (runnable)
// A tiny "API design review": flag verbs in paths, singular collections and deep nesting.
const VERBS = ['get', 'create', 'update', 'delete', 'make', 'do', 'fetch', 'remove', 'add'];
function reviewEndpoint(method, path) {
  const problems = [];
  const segments = path.split('/').filter(Boolean).filter((s) => !s.startsWith(':') && !/^v\d+$/.test(s) && s !== 'api');
  const hasVerb = segments.some((s) => VERBS.some((v) => s.toLowerCase().startsWith(v)));
  if (hasVerb) problems.push('verb in path (use the HTTP method)');
  if (method === 'GET' && /cancel|delete|update/i.test(path)) problems.push('state change via GET');
  if ((path.match(/:/g) || []).length > 2) problems.push('nesting deeper than 2 levels');
  if (!hasVerb && segments[0] && !segments[0].endsWith('s')) problems.push('collection should be plural');
  return problems;
}

const checks = [
  ['POST', '/api/v1/orders', 0],
  ['POST', '/api/v1/createOrder', 1],
  ['GET', '/api/v1/orders/:id/cancel', 1],
  ['GET', '/api/v1/user/:id', 1],
  ['GET', '/api/v1/users/:id/orders/:orderId/items/:itemId', 1],
  ['POST', '/api/v1/orders/:id/cancel', 0],
];
for (const [method, path, expectedProblems] of checks) {
  const problems = reviewEndpoint(method, path);
  console.log(`${method} ${path} → ${problems.join('; ') || 'looks RESTful'}`, problems.length === expectedProblems ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Verbs in URLs (`/getUsers`, `/deleteOrder`) instead of methods on resources.
- Changing state with GET (crawlers, link previews and prefetching will trigger it).
- Server-side session state that pins users to one instance (breaks horizontal scaling).
- Returning `200` for everything with `{ success: false }` in the body.
- Deeply nested URLs that mirror database joins instead of what clients need.
:::

::: understand
- "Stateless" doesn't mean "no database"; it means no **per-client conversation state in server memory** between requests.
- REST's value is **predictability** plus the HTTP ecosystem (caches, proxies, status codes, tooling) for free.
- Be honest in interviews: most APIs are Level 2; that's fine.
:::

::: ask
- *"Public API, partner API, or internal for our frontend?"* (Internal APIs may be a BFF tailored to screens.)
- *"Do clients need flexible field selection across many entities?"* → GraphQL might fit better.
- *"Service-to-service with strict performance needs?"* → gRPC.
:::

::: important ⭐ Say this in the interview
"REST is an architectural style where everything is a resource with a URL and you act on it with standard HTTP methods, exchanging representations like JSON. The key constraints are client-server separation, statelessness so each request carries its own credentials and context, cacheable responses, a uniform interface and a layered system, which together make APIs predictable and easy to scale behind load balancers and CDNs. In practice I use plural nouns like /orders/42, methods as verbs, query strings for filtering and paging, sub-resources like POST /orders/42/cancel for actions, and correct status codes. Most real APIs are Richardson level 2; full hypermedia is rare."
:::

::: links
Roy Fielding's dissertation, chapter 5 (REST) | https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
Martin Fowler: Richardson Maturity Model | https://martinfowler.com/articles/richardsonMaturityModel.html
Microsoft: Web API design best practices | https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
:::

=== GET vs POST vs PUT vs PATCH vs DELETE
@p 3
@tags http, methods
@quick
- **GET** read (safe, idempotent, cacheable) · **POST** create/action (not idempotent) · **PUT** replace (idempotent) · **PATCH** partial update (not guaranteed idempotent) · **DELETE** remove (idempotent).
- **Safe** = no state change (GET, HEAD, OPTIONS). **Idempotent** = repeating it has the same effect as doing it once.
- Typical success codes: GET 200 · POST 201 + `Location` (or 202 for async) · PUT/PATCH 200 or 204 · DELETE 204.
- Never change data with GET; browsers, crawlers and link previews call GETs freely.
- `OPTIONS` is what browsers send as a **CORS preflight**; `HEAD` is GET without the body.

::: text 🧒 In simple words
Think of a **notebook shared by a team**. **GET** is *reading* a page (do it a hundred times, nothing changes). **POST** is *adding a new page* (do it twice, you get two pages). **PUT** is *rewriting a page completely* (rewrite it twice with the same text, same result). **PATCH** is *correcting a few words* on a page. **DELETE** is *tearing a page out* (tearing it out again changes nothing more). Knowing which actions are safe to repeat matters because the internet sometimes repeats your request when a connection hiccups.
:::

::: text 📖 Detailed answer
| Method | Purpose | Body | Safe | Idempotent | Cacheable | Typical success |
|---|---|---|---|---|---|---|
| **GET** | Read a resource or collection | No | ✅ | ✅ | ✅ | 200 (304 if unchanged) |
| **POST** | Create, or trigger an action/process | Yes | ❌ | ❌ | Rarely | 201 + `Location`, 200, 202 |
| **PUT** | Replace the whole resource (or create at a known URL) | Full resource | ❌ | ✅ | ❌ | 200 / 204 (201 if created) |
| **PATCH** | Partial update | Changes only | ❌ | ⚠️ depends | ❌ | 200 / 204 |
| **DELETE** | Remove | Usually none | ❌ | ✅ | ❌ | 204 (or 200 with a body) |
| HEAD | Headers only (size, ETag, existence) | No | ✅ | ✅ | ✅ | 200 |
| OPTIONS | Allowed methods; **CORS preflight** | No | ✅ | ✅ | ❌ | 204 |

### Definitions that interviewers check
- **Safe**: the client doesn't request any state change (logging/metrics are fine).
- **Idempotent**: N identical requests leave the server in the same state as one. The *response* may differ (DELETE → 204 then 404).
- **Cacheable**: responses may be stored and reused (GET, HEAD; POST only with explicit freshness info).

### Choosing between POST and PUT for creation
- `POST /files` → the server chooses the id (not idempotent: two calls = two files).
- `PUT /files/3f2a…` → the **client** chooses the id (idempotent: the second call just rewrites the same file).
:::

::: diagram Which methods are safe and idempotent
flowchart TB
  M["HTTP methods"] --> SAFE["Safe: GET, HEAD, OPTIONS"]
  M --> UNSAFE["Change state: POST, PUT, PATCH, DELETE"]
  SAFE --> I1["also idempotent + cacheable"]
  UNSAFE --> IDEM["Idempotent: PUT, DELETE"]
  UNSAFE --> NOT["Not guaranteed: POST, PATCH"]
  NOT --> FIX["make retries safe: Idempotency-Key"]
:::

::: image A shared notebook: reading, adding, rewriting, correcting and tearing out pages
/images/rest-auth/http-methods.svg
:::

::: text 🪜 Step by step
Run the server below and follow one resource through every method:
1. `POST /notes` with `{"text":"hello"}` → **201** with `Location: /notes/1`. Send it again → a second note (POST isn't idempotent).
2. `GET /notes/1` → **200**; repeat it as often as you like, nothing changes (safe).
3. `PUT /notes/1` with `{"text":"rewritten","tags":["x"]}` → **200**; sending it 3 times gives the same stored note (idempotent).
4. `PATCH /notes/1` with `{"tags":["y"]}` → only `tags` changes.
5. `HEAD /notes/1` → same headers as GET (including `ETag` and `Content-Length`) but no body.
6. `DELETE /notes/1` → **204**; again → **404**, but the state (note gone) is the same: idempotent.
7. `OPTIONS /notes/1` → **204** with `Allow: GET, HEAD, PUT, PATCH, DELETE, OPTIONS`.
:::

::: code javascript Every method on one resource (node methods.js)
// How to run: npm install express && node methods.js
// Then follow the 7 steps above with curl, e.g.:
//   curl -i -X POST localhost:3000/notes -H 'Content-Type: application/json' -d '{"text":"hello"}'
//   curl -I localhost:3000/notes/1        curl -i -X OPTIONS localhost:3000/notes/1
const express = require('express');
const app = express();
app.use(express.json());

const notes = new Map();
let nextId = 1;
const ALLOW = 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS';

app.post('/notes', (req, res) => {
  const note = { id: nextId++, text: String(req.body?.text || ''), tags: [] };
  notes.set(note.id, note);
  res.status(201).location(`/notes/${note.id}`).json(note);
});

// Express answers HEAD with the GET handler automatically (headers only)
app.get('/notes/:id', (req, res) => {
  const note = notes.get(Number(req.params.id));
  return note ? res.json(note) : res.status(404).json({ error: 'Not found' });
});

app.put('/notes/:id', (req, res) => {                     // replace: missing fields are reset
  const id = Number(req.params.id);
  const existed = notes.has(id);
  const note = { id, text: String(req.body?.text || ''), tags: Array.isArray(req.body?.tags) ? req.body.tags : [] };
  notes.set(id, note);
  res.status(existed ? 200 : 201).json(note);             // PUT to a client-chosen id may create
});

app.patch('/notes/:id', (req, res) => {                   // partial: only sent fields change
  const note = notes.get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body?.text === 'string') note.text = req.body.text;
  if (Array.isArray(req.body?.tags)) note.tags = req.body.tags;
  return res.json(note);
});

app.delete('/notes/:id', (req, res) => {
  const deleted = notes.delete(Number(req.params.id));
  res.status(deleted ? 204 : 404).end();
});

app.options('/notes/:id', (req, res) => res.set('Allow', ALLOW).status(204).end());

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/notes`));
:::

::: code javascript Browser demo: prove which methods are idempotent (runnable)
// Apply each operation once and three times; idempotent = same final state.
const fresh = () => ({ notes: { 1: { id: 1, text: 'a', views: 0 } }, nextId: 2 });
const ops = {
  GET: (db) => db.notes[1],
  POST: (db) => { db.notes[db.nextId] = { id: db.nextId, text: 'new' }; db.nextId += 1; },
  PUT: (db) => { db.notes[1] = { id: 1, text: 'replaced', views: 0 }; },
  'PATCH (set)': (db) => { if (db.notes[1]) db.notes[1].text = 'patched'; },
  'PATCH (increment)': (db) => { if (db.notes[1]) db.notes[1].views += 1; },
  DELETE: (db) => { delete db.notes[1]; },
};
const expected = { GET: true, POST: false, PUT: true, 'PATCH (set)': true, 'PATCH (increment)': false, DELETE: true };

for (const [name, op] of Object.entries(ops)) {
  const once = fresh(); op(once);
  const thrice = fresh(); op(thrice); op(thrice); op(thrice);
  const idempotent = JSON.stringify(once) === JSON.stringify(thrice);
  console.log(`${name.padEnd(18)} idempotent: ${idempotent}`, idempotent === expected[name] ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- `GET /orders/42/delete` or any GET that changes data.
- Using POST for everything ("RPC over HTTP") and losing caching and retry semantics.
- Calling PATCH idempotent without qualification (increments and appends are not).
- Sending bodies with GET (many proxies drop them); use `POST /search` for complex queries.
- Forgetting that browsers send `OPTIONS` preflights for cross-origin requests with custom headers.
:::

::: understand
- Safety and idempotency are **promises to the network**: proxies, browsers and SDKs rely on them to retry or cache automatically.
- Choosing the method is choosing the **retry and caching behaviour** of your endpoint.
- Non-idempotent operations that must be retried (payments) need an **Idempotency-Key**.
:::

::: ask
- *"Should creating an item with a client-generated id use PUT?"* Yes: `PUT /files/{uuid}` is idempotent and can create.
- *"Can GET have a body?"* Allowed by the spec, ignored by many servers/proxies; don't rely on it.
- *"Is the operation async?"* → `202 Accepted` with a status URL.
:::

::: important ⭐ Say this in the interview
"GET reads and is safe, idempotent and cacheable, so it must never change data. POST creates a resource or triggers an action; it's not idempotent, so two calls create two orders, and on success I return 201 with a Location header, or 202 for async work. PUT replaces the whole resource and is idempotent; PATCH applies a partial update and is idempotent only for set-style changes, not increments. DELETE removes and is idempotent: the second call may return 404 but the state is the same. HEAD is GET without a body and OPTIONS is used for CORS preflights. These properties matter because clients and proxies retry, and non-idempotent operations like payments need idempotency keys."
:::

::: links
MDN: HTTP request methods | https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
RFC 9110: Method definitions | https://www.rfc-editor.org/rfc/rfc9110.html#name-method-definitions
MDN: Idempotent | https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
:::

=== PUT vs PATCH
@p 3
@tags http, put, patch
@quick
- **PUT** = replace the **entire** resource; fields you don't send are **removed or reset**. Always idempotent.
- **PATCH** = change **only** the fields you send. Idempotent for "set" changes, not for increments/appends.
- PATCH formats: **JSON Merge Patch** (RFC 7396, a partial object; `null` deletes a field) or **JSON Patch** (RFC 6902, a list of operations).
- MongoDB: PUT → `replaceOne` / `findOneAndReplace`; PATCH → `updateOne` with `$set`/`$unset` (allow-listed fields).
- Edit forms usually use PATCH; add optimistic locking (`version` or `If-Match` ETag) for concurrent edits.

::: text 🧒 In simple words
Your contact card in a phone book says: name *Asha*, email *asha@x.com*, city *Delhi*. **PUT** is handing the phone company a **brand-new card**: whatever you write is the whole card, so if you forget the city, the city is gone. **PATCH** is sending a **correction note**: "change the email to asha@new.com", and everything else stays as it was. Most edit screens send correction notes; PUT is for when the client really owns the whole document.
:::

::: text 📖 Detailed answer
Stored user: `{ name: "Asha", email: "asha@x.com", city: "Delhi", role: "user" }`

| Request | Body | Result |
|---|---|---|
| `PUT /users/1` | `{ "name": "Asha R", "email": "asha@x.com" }` | `{ name: "Asha R", email: "asha@x.com" }` (city and role **gone/reset**) |
| `PATCH /users/1` (merge patch) | `{ "name": "Asha R" }` | `{ name: "Asha R", email, city, role }` (only name changed) |
| `PATCH /users/1` (merge patch) | `{ "city": null }` | city **removed** |
| `PATCH /users/1` (JSON Patch) | `[{ "op": "replace", "path": "/city", "value": "Pune" }]` | city = Pune |

| | PUT | PATCH |
|---|---|---|
| Semantics | Replace | Modify |
| Body | The complete representation | Only changes (merge patch) or operations (JSON Patch) |
| Idempotent | ✅ always | ⚠️ depends on the change |
| Validation | Validate the **full** schema | Validate **each** provided field |
| MongoDB | `replaceOne`, `findOneAndReplace` | `updateOne` with `$set`, `$unset`, `$inc`, `$push` |
| Content-Type | `application/json` | `application/merge-patch+json` or `application/json-patch+json` |

### Protecting fields
Both must **allow-list** writable fields, so a client can't send `role: "admin"`. PUT should keep server-owned fields (`role`, `createdAt`, `_id`) from the stored document.

### Concurrent edits
Return an `ETag` (or `version`). Clients send `If-Match: <etag>`; if someone else changed the resource first, respond **412 Precondition Failed** (or 409 with a version field) instead of silently overwriting.
:::

::: diagram PUT replaces, PATCH merges
flowchart LR
  S["stored: name Asha, email, city Delhi, role user"] --> P1["PUT name Asha R + email"]
  P1 --> R1["name Asha R, email, role user (server-owned kept), city gone"]
  S --> P2["PATCH name Asha R"]
  P2 --> R2["name Asha R, email, city Delhi, role user"]
:::

::: image A brand-new card vs a correction note: PUT replaces the whole resource, PATCH changes only what you send
/images/rest-auth/put-vs-patch.svg
:::

::: text 🪜 Step by step
`PATCH /users/1` with `{"city": null, "name": "Asha R", "role": "admin"}` and an `If-Match` header, in the code below:
1. The handler loads the user and compares `If-Match` with the current ETag (`"v3"`); a mismatch → **412**.
2. It walks the body keys: `role` isn't in `EDITABLE` → ignored (mass-assignment protection).
3. `name: "Asha R"` → goes into `$set`; `city: null` → goes into `$unset` (merge-patch rule: null deletes).
4. MongoDB runs `findOneAndUpdate({ _id, version: 3 }, { $set, $unset, $inc: { version: 1 } })`: an atomic check-and-update.
5. If no document matched (someone saved first), respond **412**; otherwise return the new document with `ETag: "v4"`.
6. `PUT` instead builds a whole new document from the allowed fields, keeps `role`/`createdAt`, and uses `findOneAndReplace`.
:::

::: code javascript PUT and PATCH with MongoDB, field allow-list and If-Match (node put-patch.js)
// How to run: npm install express mongodb && MONGO_URI=mongodb://localhost:27017/putpatch node put-patch.js
// Then:
//   curl -s localhost:3000/users/1 -i | grep -i etag
//   curl -s -X PATCH localhost:3000/users/1 -H 'If-Match: "v1"' -H 'Content-Type: application/merge-patch+json' -d '{"name":"Asha R","city":null,"role":"admin"}'
//   curl -s -X PUT localhost:3000/users/1 -H 'Content-Type: application/json' -d '{"name":"Asha Rao","email":"asha@x.com"}'
const express = require('express');
const { MongoClient } = require('mongodb');

const EDITABLE = ['name', 'email', 'city'];                          // never role, version, createdAt

async function main() {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/putpatch');
  const users = client.db().collection('users');
  await users.deleteMany({});
  await users.insertOne({ _id: 1, name: 'Asha', email: 'asha@x.com', city: 'Delhi', role: 'user', version: 1, createdAt: new Date() });

  const app = express();
  app.use(express.json({ type: ['application/json', 'application/merge-patch+json'] }));
  const etag = (doc) => `"v${doc.version}"`;
  const send = (res, doc) => res.set('ETag', etag(doc)).json(doc);

  app.get('/users/:id', async (req, res) => {
    const doc = await users.findOne({ _id: Number(req.params.id) });
    return doc ? send(res, doc) : res.status(404).json({ error: 'Not found' });
  });

  // PATCH (JSON Merge Patch): only provided fields change; null removes a field
  app.patch('/users/:id', async (req, res) => {
    const _id = Number(req.params.id);
    const current = await users.findOne({ _id });
    if (!current) return res.status(404).json({ error: 'Not found' });
    if (req.get('if-match') && req.get('if-match') !== etag(current)) return res.status(412).json({ error: 'Resource changed, reload first' });
    const $set = {};
    const $unset = {};
    for (const [key, value] of Object.entries(req.body || {})) {
      if (!EDITABLE.includes(key)) continue;                         // mass-assignment protection
      if (value === null) $unset[key] = '';
      else $set[key] = String(value);
    }
    const update = { $inc: { version: 1 }, ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
    const doc = await users.findOneAndUpdate({ _id, version: current.version }, update, { returnDocument: 'after' });
    return doc ? send(res, doc) : res.status(412).json({ error: 'Resource changed, reload first' });
  });

  // PUT: full replacement of the client-owned fields; server-owned fields are kept
  app.put('/users/:id', async (req, res) => {
    const _id = Number(req.params.id);
    const current = await users.findOne({ _id });
    if (!current) return res.status(404).json({ error: 'Not found' });
    const body = req.body || {};
    if (typeof body.name !== 'string' || typeof body.email !== 'string') return res.status(400).json({ error: 'PUT needs the full resource: name and email' });
    const replacement = { name: body.name, email: body.email, ...(typeof body.city === 'string' && { city: body.city }), role: current.role, createdAt: current.createdAt, version: current.version + 1 };
    const doc = await users.findOneAndReplace({ _id, version: current.version }, replacement, { returnDocument: 'after' });
    return doc ? send(res, doc) : res.status(412).json({ error: 'Resource changed, reload first' });
  });

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}/users/1`));
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: PUT vs PATCH vs JSON Patch on one object (runnable)
const start = () => ({ name: 'Asha', email: 'asha@x.com', city: 'Delhi', role: 'user' });
const SERVER_OWNED = ['role'];
const EDITABLE = ['name', 'email', 'city'];

const put = (doc, body) => ({ ...Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]])), ...Object.fromEntries(SERVER_OWNED.map((k) => [k, doc[k]])) });
function mergePatch(doc, body) {
  const next = { ...doc };
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.includes(k)) continue;
    if (v === null) delete next[k]; else next[k] = v;
  }
  return next;
}
function jsonPatch(doc, ops) {
  const next = { ...doc };
  for (const op of ops) {
    const key = op.path.slice(1);
    if (!EDITABLE.includes(key)) continue;
    if (op.op === 'replace' || op.op === 'add') next[key] = op.value;
    if (op.op === 'remove') delete next[key];
  }
  return next;
}

const afterPut = put(start(), { name: 'Asha R', email: 'asha@x.com', role: 'admin' });
const afterPatch = mergePatch(start(), { name: 'Asha R', city: null, role: 'admin' });
const afterJsonPatch = jsonPatch(start(), [{ op: 'replace', path: '/city', value: 'Pune' }]);
console.log('PUT   →', JSON.stringify(afterPut));
console.log('PATCH →', JSON.stringify(afterPatch));
console.log('PUT dropped the city it was not given', !('city' in afterPut) ? '✅' : '❌ FAIL');
console.log('PUT kept server-owned role (ignored "admin")', afterPut.role === 'user' ? '✅' : '❌ FAIL');
console.log('merge patch: null removed city, email untouched', !('city' in afterPatch) && afterPatch.email === 'asha@x.com' ? '✅' : '❌ FAIL');
console.log('JSON Patch replaced only the city', afterJsonPatch.city === 'Pune' && afterJsonPatch.name === 'Asha' ? '✅' : '❌ FAIL');
console.log('repeating the same PUT gives the same result', JSON.stringify(put(afterPut, { name: 'Asha R', email: 'asha@x.com' })) === JSON.stringify(afterPut) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Implementing PUT as a merge (it's then really a PATCH) or PATCH as a replace (data loss).
- `Model.findByIdAndUpdate(id, req.body)` → mass assignment of `role`, `isAdmin`, `balance`.
- Forgetting server-owned fields in PUT (wiping `createdAt` or `role`).
- No concurrency control: two editors overwrite each other's changes ("last write wins" silently).
- Treating `null` and "missing" the same in PATCH (merge patch: `null` means delete).
:::

::: understand
- PUT transfers a **whole representation**; PATCH transfers a **description of changes**.
- Idempotency follows from that: replacing with the same thing twice changes nothing more; "add 10" twice does.
- Real APIs mostly expose PATCH for edits and reserve PUT for documents the client fully owns (settings, files at a known id).
:::

::: ask
- *"Which fields are client-editable?"* → allow-list.
- *"Can two people edit the same record?"* → ETag/`If-Match` or a version field.
- *"Do we need JSON Patch operations (arrays, moves) or is merge patch enough?"*
:::

::: important ⭐ Say this in the interview
"PUT replaces the entire resource with the representation I send, so any field I leave out is removed or reset, and it's always idempotent. PATCH sends only the changes; with JSON Merge Patch that's a partial object where null deletes a field, and with JSON Patch it's a list of operations. PATCH is idempotent for set-style changes but not for increments. In MongoDB PUT maps to findOneAndReplace and PATCH to updateOne with $set and $unset. In both cases I allow-list editable fields so nobody can send role admin, keep server-owned fields, and use an ETag with If-Match or a version field so concurrent edits get a 412 instead of silently overwriting."
:::

::: links
RFC 7396: JSON Merge Patch | https://www.rfc-editor.org/rfc/rfc7396
RFC 6902: JSON Patch | https://www.rfc-editor.org/rfc/rfc6902
MDN: PATCH | https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PATCH
MDN: If-Match | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match
:::

=== What are HTTP status codes? (the ones you must know)
@p 3
@tags http, status-codes
@quick
- **2xx success**: 200 OK · 201 Created (+ `Location`) · 202 Accepted (async) · 204 No Content.
- **3xx redirect/cache**: 301/308 permanent · 302/307 temporary · **304 Not Modified** (ETag/`If-None-Match`).
- **4xx client errors**: 400 bad input · **401 not authenticated** · **403 not allowed** · 404 · 409 conflict · 412 precondition failed · 413 too large · 415 wrong type · 422 · 429 (+ `Retry-After`).
- **5xx server errors**: 500 bug · 502 bad gateway (app down behind a proxy) · 503 unavailable · 504 gateway timeout (app too slow).
- Retry rules: retry **429/503** (respect `Retry-After`) and network errors; don't retry other 4xx.

::: text 🧒 In simple words
A status code is the **first word of the reply**, before any details. Codes starting with **2** mean "done", **3** mean "look elsewhere" (or "you already have the latest copy"), **4** mean "**you** (the client) need to fix something", and **5** mean "**we** (the server) messed up". The most famous pair: **401** means "I don't know who you are, please log in", **403** means "I know who you are, but you're not allowed in".
:::

::: text 📖 Detailed answer
| Code | Name | Use it when |
|---|---|---|
| **200** | OK | Successful GET, or PUT/PATCH returning the resource |
| **201** | Created | POST (or PUT) created a resource → add `Location` |
| **202** | Accepted | Work queued (report generation, video processing) → return a status URL |
| **204** | No Content | Success with no body (DELETE, some updates) |
| **301 / 308** | Moved Permanently | URL changed for good (308 keeps the method) |
| **302 / 307** | Found / Temporary Redirect | Temporary move (307 keeps the method) |
| **304** | Not Modified | Client's cached copy is still valid (`If-None-Match` matched the `ETag`) |
| **400** | Bad Request | Malformed JSON, invalid parameters |
| **401** | Unauthorized | Missing, invalid or expired credentials (really "unauthenticated") |
| **403** | Forbidden | Authenticated but not permitted |
| **404** | Not Found | Doesn't exist (or hidden from this user) |
| **405** | Method Not Allowed | Method not supported on this resource (+ `Allow`) |
| **409** | Conflict | Duplicate email, invalid state transition |
| **412** | Precondition Failed | `If-Match` didn't match (someone edited first) |
| **413** | Content Too Large | Upload/body over the limit |
| **415** | Unsupported Media Type | Wrong `Content-Type` |
| **422** | Unprocessable Content | Well-formed but semantically invalid (some APIs use this for validation) |
| **429** | Too Many Requests | Rate limited (+ `Retry-After`) |
| **500** | Internal Server Error | Unhandled exception (a bug) |
| **502** | Bad Gateway | Proxy/ALB got no valid response: Node crashed or isn't listening |
| **503** | Service Unavailable | Overloaded, maintenance, dependency down (+ `Retry-After`) |
| **504** | Gateway Timeout | Proxy gave up waiting: the app is too slow |

### Debugging tip from production
Behind Nginx or an AWS ALB, **502** usually means the Node process crashed or the target is unhealthy; **504** means it's alive but too slow (slow query, missing index, downstream timeout).

### Which errors to retry
| Status | Retry? |
|---|---|
| Network error / timeout | Yes, with backoff (only for idempotent requests or with an idempotency key) |
| 429, 503 | Yes, after `Retry-After` |
| 502, 504 | Usually yes, with backoff |
| 400, 401, 403, 404, 409, 422 | No (fix the request, refresh the token, or show an error) |
:::

::: diagram Pick a status code
flowchart TD
  A{"Request handled successfully?"} -->|"yes"| B{"Created something?"}
  B -->|"yes"| C["201 + Location"]
  B -->|"queued for later"| D["202"]
  B -->|"no body"| E["204"]
  B -->|"otherwise"| F["200"]
  A -->|"client problem"| G{"Who are you?"}
  G -->|"unknown or expired"| H["401"]
  G -->|"known but not allowed"| I["403"]
  G -->|"fine"| J["400 / 404 / 409 / 422 / 429"]
  A -->|"server problem"| K["500 / 502 / 503 / 504"]
:::

::: image The first word of every reply: 2 done, 3 look elsewhere, 4 your mistake, 5 our mistake
/images/rest-auth/status-codes.svg
:::

::: text 🪜 Step by step
How a client should react to each response from the server below:
1. `POST /reports` → **202** with `Location: /reports/1`: poll that URL until `status` is `done`.
2. `GET /articles/1` → **200** with `ETag: "a1"`; repeat with `If-None-Match: "a1"` → **304**, no body: use the cached copy.
3. `GET /private` without a token → **401**: send the user to login (or refresh the token).
4. `GET /private` with a user token on an admin route → **403**: show "you don't have access", don't log out.
5. `POST /articles` with `Content-Type: text/plain` → **415**: the client is sending the wrong format.
6. More than 3 requests in 10 s to `/limited` → **429** with `Retry-After`: wait, then retry.
:::

::: code javascript A server that returns the codes you must know (node status-codes.js)
// How to run: npm install express && node status-codes.js
// Then: curl -i -X POST localhost:3000/reports   curl -i localhost:3000/articles/1
//       curl -i localhost:3000/articles/1 -H 'If-None-Match: "a1"'   curl -i localhost:3000/private
const express = require('express');
const app = express();

// 202 Accepted: async job + a URL to poll
const reports = new Map();
app.post('/reports', (req, res) => {
  const id = reports.size + 1;
  reports.set(id, { id, status: 'processing' });
  setTimeout(() => { reports.get(id).status = 'done'; }, 2000);   // pretend work
  res.status(202).location(`/reports/${id}`).json(reports.get(id));
});
app.get('/reports/:id', (req, res) => {
  const r = reports.get(Number(req.params.id));
  return r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});

// 200 + ETag, 304 when the client already has this version
const article = { id: 1, title: 'Status codes', version: 'a1' };
app.get('/articles/1', (req, res) => {
  const etag = `"${article.version}"`;
  if (req.get('if-none-match') === etag) return res.status(304).end();
  return res.set('ETag', etag).json(article);
});

// 415 for the wrong Content-Type, 400 for bad input, 201 on success
app.post('/articles', express.json(), (req, res) => {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Send application/json' });
  if (!req.body?.title) return res.status(400).json({ error: 'title is required' });
  return res.status(201).location('/articles/2').json({ id: 2, title: req.body.title });
});

// 401 vs 403
const tokens = { 'user-token': 'user', 'admin-token': 'admin' };
app.get('/private', (req, res) => {
  const role = tokens[(req.get('authorization') || '').replace('Bearer ', '')];
  if (!role) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Log in first' });
  if (role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  return res.json({ secret: 42 });
});

// 405 with Allow, 409 conflict, 429 with Retry-After
app.delete('/articles/1', (req, res) => res.status(405).set('Allow', 'GET').json({ error: 'Articles cannot be deleted' }));
const emails = new Set(['taken@x.com']);
app.post('/signup', express.json(), (req, res) => (emails.has(req.body?.email) ? res.status(409).json({ error: 'Email already registered' }) : res.status(201).json({ ok: true })));
const hits = [];
app.get('/limited', (req, res) => {
  const now = Date.now();
  while (hits.length && hits[0] < now - 10000) hits.shift();
  if (hits.length >= 3) return res.status(429).set('Retry-After', '10').json({ error: 'Too many requests' });
  hits.push(now);
  return res.json({ ok: true });
});

// 500: an unexpected bug (generic message, details only in logs)
app.get('/bug', () => { throw new Error('database password is wrong'); });
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error(err.message); res.status(500).json({ error: 'Internal server error' }); });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: what should the client do for each status? (runnable)
function clientAction(status) {
  if (status >= 200 && status < 300) return status === 202 ? 'poll the Location URL' : 'success';
  if (status === 304) return 'use cached copy';
  if (status === 401) return 'refresh token or go to login';
  if (status === 403) return 'show no-access message';
  if (status === 429 || status === 503) return 'wait Retry-After, then retry';
  if (status === 502 || status === 504) return 'retry with backoff';
  if (status >= 400 && status < 500) return 'show error, do not retry';
  return 'show generic error + report';
}
const table = { 201: 'success', 202: 'poll the Location URL', 304: 'use cached copy', 401: 'refresh token or go to login', 403: 'show no-access message', 409: 'show error, do not retry', 429: 'wait Retry-After, then retry', 500: 'show generic error + report', 504: 'retry with backoff' };
for (const [status, expected] of Object.entries(table)) {
  const action = clientAction(Number(status));
  console.log(`${status} → ${action}`, action === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- 401 for "not allowed" or 403 for "not logged in" (swapped meanings).
- `200 OK` with an error in the body → monitoring, caches and clients think it worked.
- 500 for validation errors (that's a client problem: 400/422).
- Retrying 4xx errors (they won't succeed) or retrying POSTs without idempotency keys.
- 404 vs 403 for other users' resources: 404 avoids leaking that the resource exists.
:::

::: understand
- Status codes are machine-readable **intent**; clients, proxies, CDNs and monitoring react to them automatically.
- The class (2/3/4/5) tells **who** must act; the exact code tells **how**.
- 502 vs 504 is a great signal in incidents: crashed vs slow.
:::

::: ask
- *"Does the team use 400 or 422 for validation errors?"*
- *"Should accessing another user's resource return 403 or 404?"* (404 hides existence.)
- *"Is there a gateway/load balancer in front?"* (explains 502/504 behaviour).
:::

::: important ⭐ Say this in the interview
"Two hundreds mean success: 200 OK, 201 Created with a Location header, 202 Accepted for queued work and 204 No Content. Three hundreds are redirects, and 304 tells the client its cached copy, matched by ETag, is still valid. Four hundreds are client problems: 400 bad input, 401 not authenticated, 403 authenticated but not allowed, 404 not found, 409 conflict like a duplicate email, 412 when an If-Match check fails, 422 for semantic validation if the team uses it, and 429 for rate limiting with Retry-After. Five hundreds are server problems: 500 is a bug, and behind a load balancer 502 usually means the app crashed while 504 means it was too slow. Clients retry 429, 503 and gateway errors with backoff, but not other 4xx."
:::

::: links
MDN: HTTP response status codes | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
RFC 9110: Status codes | https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes
AWS: Troubleshoot ALB 502 and 504 errors | https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html
:::

=== What is idempotency?
@p 3
@tags idempotency, reliability, payments
@quick
- **Idempotent** = doing it **once or N times** leaves the server in the **same state** (responses may differ: DELETE → 204, then 404).
- By definition GET, HEAD, OPTIONS, PUT, DELETE are idempotent; **POST is not**; PATCH depends on the change.
- It matters because timeouts are ambiguous and **everything retries** (users, SDKs, proxies, queues) → duplicate orders/charges.
- Make POST safe to retry with an **Idempotency-Key** header: claim the key atomically, store the response, replay it for repeats.
- Back it with **unique indexes** and idempotent consumers (SQS/Kafka deliver at least once).

::: text 🧒 In simple words
Pressing a **lift button** is idempotent: press it once or ten times, one lift comes. Pressing **"buy" in a shop** is not: press it twice and you might pay twice. On the internet, "did my click go through?" is often unclear (the page froze, the Wi-Fi blinked), so apps press the button again automatically. Idempotency is the trick that makes the "buy" button behave like the lift button: every click carries a **ticket number**, and if the shop sees the same ticket again, it just shows you the receipt from the first time instead of charging you again.
:::

::: text 📖 Detailed answer
An operation is **idempotent** if repeating it has the same effect on server state as doing it once.

| Request | Idempotent? | Why |
|---|---|---|
| `GET /orders/5` | ✅ | Reads only |
| `PUT /users/1 {"name":"A"}` | ✅ | Always ends as name = A |
| `DELETE /orders/5` | ✅ | Order is gone either way (204 then 404) |
| `POST /orders` | ❌ | Each call creates a new order |
| `PATCH /account {"$inc":{"balance":100}}` | ❌ | Each call adds 100 |
| `PATCH /users/1 {"city":"Pune"}` | ✅ | Set-style change |

### Why it matters
A timeout doesn't tell you whether the server processed the request. Browsers, mobile SDKs, load balancers, API gateways and message queues **retry**. Without idempotency, retries create **duplicate payments, orders, emails**.

### The Idempotency-Key pattern (Stripe, PayPal, AWS)
1. The client generates a **UUID per logical operation** (e.g. when the checkout form opens) and sends `Idempotency-Key: <uuid>` on every attempt.
2. The server **atomically claims** `user + key` (Redis `SET NX`, or a unique index): only one request can own it.
3. First request: run the operation, **store the status + response** with the key (TTL e.g. 24 h).
4. Same key again: **replay** the stored response (`Idempotent-Replayed: true`) without running anything.
5. Same key while still processing: **409** ("in progress", client retries later).
6. Same key with a **different body**: **422** (key reuse is a client bug); detect it with a hash of the body.
7. Server errors (5xx): delete the key so a retry can try again.

### Simulated with retries
| Scenario | Card charges |
|---|---|
| Client retries 3× without a key | **3** |
| Client retries 3× with the same key | **1** |
:::

::: diagram Idempotency key: first call, lost response, retry
sequenceDiagram
  participant C as Client
  participant S as API
  participant R as Key store (Redis / DB)
  C->>S: POST /payments (Idempotency-Key: abc)
  S->>R: SET user:abc processing NX
  R-->>S: OK (claimed)
  S->>S: charge card once
  S->>R: save 201 + body for user:abc (24 h)
  S--xC: 201 lost (network timeout)
  C->>S: retry POST /payments (Idempotency-Key: abc)
  S->>R: GET user:abc
  R-->>S: done, 201 + body
  S-->>C: 201 same payment, Idempotent-Replayed true
:::

::: chart bar Simulated: card charges when a client retries a payment 3 times
Scenario,Charges
No idempotency key,3
Same Idempotency-Key,1
:::

::: image The lift button vs the buy button: a ticket number turns retries into replays
/images/rest-auth/idempotency.svg
:::

::: text 🪜 Step by step
Two identical `POST /payments` with key `abc` arriving 1 ms apart (double click), using the middleware below:
1. Request A runs `SET idem:u1:abc {status: processing, bodyHash} NX EX 86400` → **OK**: A owns the key.
2. Request B runs the same `SET … NX` → **null**: someone owns it. B reads the record: `processing` → responds **409**.
3. A charges the card, responds `201 { paymentId }`; the patched `res.json` stores `{status: done, statusCode: 201, body}`.
4. The client retries B's request later → the record is `done` and the body hash matches → **201** replayed, no second charge.
5. A request with key `abc` but a different amount → body hash differs → **422** "key reused with a different payload".
6. If A had crashed with a 5xx, the key is deleted → the next retry can execute.
:::

::: code javascript Idempotency-Key middleware with Redis or memory (node idempotency.js)
// How to run: npm install express ioredis && node idempotency.js        (memory store)
//             REDIS_URL=redis://localhost:6379 node idempotency.js     (shared store for many servers)
// Then run this twice:  curl -s -X POST localhost:3000/payments -H 'x-user-id: u1' -H 'Idempotency-Key: abc' -H 'Content-Type: application/json' -d '{"amount":500}'
const express = require('express');
const crypto = require('crypto');

// ---- key store: Redis when configured, otherwise an in-process Map with TTL ----
function createStore() {
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    return {
      claim: async (key, value, ttl) => (await redis.set(key, JSON.stringify(value), 'EX', ttl, 'NX')) === 'OK',
      get: async (key) => JSON.parse((await redis.get(key)) || 'null'),
      set: (key, value, ttl) => redis.set(key, JSON.stringify(value), 'EX', ttl),
      del: (key) => redis.del(key),
    };
  }
  const map = new Map();
  const alive = (key) => { const e = map.get(key); if (e && e.expires < Date.now()) map.delete(key); return map.get(key); };
  return {
    claim: async (key, value, ttl) => { if (alive(key)) return false; map.set(key, { value, expires: Date.now() + ttl * 1000 }); return true; },
    get: async (key) => alive(key)?.value || null,
    set: async (key, value, ttl) => { map.set(key, { value, expires: Date.now() + ttl * 1000 }); },
    del: async (key) => { map.delete(key); },
  };
}
const store = createStore();

function idempotency({ ttlSeconds = 86400 } = {}) {
  return async (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key || key.length > 100) return res.status(400).json({ error: 'Idempotency-Key header (max 100 chars) is required' });
    const storeKey = `idem:${req.userId}:${req.method}:${req.path}:${key}`;          // scoped per user + endpoint
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');

    if (!(await store.claim(storeKey, { status: 'processing', bodyHash }, ttlSeconds))) {
      const saved = await store.get(storeKey);
      if (saved.bodyHash !== bodyHash) return res.status(422).json({ error: 'Idempotency-Key reused with a different payload' });
      if (saved.status === 'processing') return res.status(409).json({ error: 'A request with this key is still in progress' });
      return res.status(saved.statusCode).set('Idempotent-Replayed', 'true').json(saved.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const done = res.statusCode >= 500
        ? store.del(storeKey)                                                   // let the client retry server errors
        : store.set(storeKey, { status: 'done', bodyHash, statusCode: res.statusCode, body }, ttlSeconds);
      Promise.resolve(done).catch((err) => console.error('idempotency store failed', err));
      return originalJson(body);
    };
    return next();
  };
}

// ---- app ----
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = req.get('x-user-id') || 'anonymous'; next(); });

let charges = 0;
app.post('/payments', idempotency(), async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive integer (cents)' });
  await new Promise((r) => setTimeout(r, 300));                                  // talk to the payment provider
  charges += 1;
  return res.status(201).json({ paymentId: `pay_${charges}`, amount });
});
app.get('/stats', (req, res) => res.json({ charges }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT} (store: ${process.env.REDIS_URL ? 'redis' : 'memory'})`));
:::

::: code javascript Browser demo: retries with and without an idempotency key (runnable)
function createApi() {
  const store = new Map();
  let charges = 0;
  return {
    async postPayment(body, key) {
      if (key && store.has(key)) {
        const saved = store.get(key);
        if (saved.status === 'processing') return { status: 409 };
        return { ...saved.response, replayed: true };
      }
      if (key) store.set(key, { status: 'processing' });
      await new Promise((r) => setTimeout(r, 10));                 // payment provider call
      charges += 1;
      const response = { status: 201, paymentId: `pay_${charges}`, amount: body.amount };
      if (key) store.set(key, { status: 'done', response });
      return response;
    },
    get charges() { return charges; },
  };
}

(async () => {
  const noKey = createApi();
  for (let attempt = 0; attempt < 3; attempt++) await noKey.postPayment({ amount: 500 });
  console.log('3 retries without a key → charges:', noKey.charges, noKey.charges === 3 ? '✅' : '❌ FAIL');

  const withKey = createApi();
  const key = crypto.randomUUID();                                  // created once per checkout, reused for retries
  const replies = [];
  for (let attempt = 0; attempt < 3; attempt++) replies.push(await withKey.postPayment({ amount: 500 }, key));
  console.log('3 retries with one key → charges:', withKey.charges, withKey.charges === 1 ? '✅' : '❌ FAIL');
  console.log('retries got the same payment id', replies.every((r) => r.paymentId === 'pay_1') && replies[2].replayed ? '✅' : '❌ FAIL');

  const race = createApi();
  const [a, b] = await Promise.all([race.postPayment({ amount: 500 }, 'k2'), race.postPayment({ amount: 500 }, 'k2')]);
  console.log('double click: one 201, one 409 →', a.status, b.status, race.charges === 1 && [a.status, b.status].sort().join() === '201,409' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Generating a **new** key on every retry (then it protects nothing): create it once per user intent.
- Check-then-insert without an atomic claim → two concurrent requests both execute.
- Storing keys forever (memory leak) or for too short a time (retries after expiry double-charge).
- Replaying a stored error from a 5xx (the client can never succeed); delete the key instead.
- Forgetting message consumers: SQS/Kafka redeliver, so consumers need idempotency too.
:::

::: understand
- Idempotency is about **state**, not responses; it's what makes "retry on timeout" safe.
- Exactly-once delivery doesn't exist on networks; you get **at-least-once + idempotent processing**.
- The key store is a tiny cache of results; the unique index is the last safety net.
:::

::: ask
- *"Key scope: per user, per endpoint? TTL?"* (Stripe keeps keys for 24 hours.)
- *"What if the same key arrives with a different body?"* → 422.
- *"Which operations need it?"* Payments, orders, transfers, emails; not likes or views.
:::

::: important ⭐ Say this in the interview
"An operation is idempotent when doing it once or many times leaves the server in the same state; GET, PUT and DELETE are idempotent by definition, POST is not, and PATCH depends on the change. It matters because timeouts are ambiguous and clients, gateways and queues retry, so without protection a payment can be charged twice. For POST endpoints like payments I use an Idempotency-Key: the client creates one UUID per user action and reuses it for retries; the server atomically claims the key per user with Redis SET NX, executes once, stores the status and response for 24 hours and replays it for repeats, returns 409 while the first is still running, 422 if the same key comes with a different body, and frees the key on 5xx errors. A unique index and idempotent queue consumers complete the picture."
:::

::: links
Stripe: Idempotent requests | https://docs.stripe.com/api/idempotent_requests
IETF draft: The Idempotency-Key HTTP header | https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
MDN: Idempotent | https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
:::

=== How do you design a good API response?
@p 2
@tags api-design, response
@quick
- **Consistent shapes**: success `{ data, meta? }`, list `{ data: [...], pagination }`, error `{ error: { code, message, details?, requestId } }`.
- Correct **status codes** and useful **headers**: `Location` (201), `ETag` + `Cache-Control`, `RateLimit-*`, `X-Request-Id`.
- Safe, stable types: ISO-8601 **UTC** dates, ids as strings, **money in minor units** (cents/paise) + currency, enums as documented strings.
- Return only what clients need through **DTOs** (never `passwordHash`, `__v`, internal flags); optional `fields=` selection.
- Document it with **OpenAPI** and generate client types from it.

::: text 🧒 In simple words
A good API response is like a **well-designed receipt**: the total is in the same place every time, amounts are exact (no "about 19.99"), the date is unambiguous, there's a reference number for complaints, and it never prints the store's internal notes. Because every receipt follows the same layout, the customer (the frontend) can read any of them without special instructions.
:::

::: text 📖 Detailed answer
### Shapes
| Case | Example |
|---|---|
| Single resource | `{ "data": { "id": "66f1…", "name": "Asha", "createdAt": "2026-09-30T04:00:00.000Z" } }` |
| List | `{ "data": [ … ], "pagination": { "page": 2, "limit": 20, "total": 523, "hasNextPage": true } }` (or `nextCursor`) |
| Error | `{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [ { "field": "email", "message": "Invalid email" } ], "requestId": "a1b2…" } }` |
| No body | `204 No Content` (DELETE) |

### Field conventions
| Concern | Recommendation | Why |
|---|---|---|
| Dates | ISO-8601 in **UTC** (`2026-09-30T04:00:00.000Z`) | No time-zone guessing; sortable |
| Ids | Strings | 64-bit numbers lose precision in JavaScript |
| Money | Integer minor units + currency (`{ "amount": 49900, "currency": "INR" }`) | `0.1 + 0.2 !== 0.3` |
| Enums | Documented strings (`"PAID"`) | Readable, extensible |
| Booleans | `isActive`, `hasNextPage` | Self-explanatory |
| Missing vs null | Pick a rule and keep it | Clients handle one case |
| Casing | camelCase JSON | Matches JavaScript |

### Headers that make responses better
`Location` on 201 · `ETag` + `Cache-Control` for caching and 304s · `X-Request-Id` for support · `RateLimit-*` · `Content-Type: application/json; charset=utf-8`.

### Envelope or not?
Some APIs return raw resources and put pagination in headers (GitHub's `Link`). Either is fine; **consistency** is what matters. Document it with **OpenAPI** and generate TypeScript types for the frontend.
:::

::: diagram From database document to response
flowchart LR
  DB[("document: _id, passwordHash, __v, priceRupees float, createdAt Date")] --> DTO["DTO mapper: allow-list fields"]
  DTO --> T["types: id string, price in paise + currency, ISO UTC dates"]
  T --> ENV["envelope: data + pagination"]
  ENV --> H["headers: ETag, Cache-Control, X-Request-Id, Location"]
  H --> C["client: one parser for every endpoint"]
:::

::: image A well-designed receipt: same layout every time, exact amounts, clear dates, no internal notes
/images/rest-auth/api-response.svg
:::

::: text 🪜 Step by step
`GET /api/products?page=1&limit=2` in the server below:
1. The handler loads the page of products and the total.
2. Each document goes through `toProductDTO`: `_id` → string `id`, price stays in **paise** with a `currency`, `createdAt` → ISO UTC, internal fields (`costPrice`, `__v`) are dropped.
3. The list is wrapped as `{ data, pagination: { page, limit, total, hasNextPage } }`.
4. The response gets `X-Request-Id` and, for the single-product endpoint, an `ETag` so `If-None-Match` can return **304**.
5. `POST /api/products` returns **201** with `Location: /api/products/<id>` and the new DTO.
6. Every error uses the same `{ error: { code, message, requestId } }` shape.
:::

::: code javascript Response helpers, DTOs, ETag and consistent errors (node responses.js)
// How to run: npm install express && node responses.js
// Then: curl -s "localhost:3000/api/products?page=1&limit=2"   curl -si localhost:3000/api/products/p1 | grep -i etag
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.id = crypto.randomUUID(); res.set('X-Request-Id', req.id); next(); });

// "database" documents: note the internal fields and a raw Date
const products = [
  { _id: 'p1', name: 'Mug', pricePaise: 49900, currency: 'INR', costPrice: 120.5, __v: 0, createdAt: new Date('2026-09-01T10:00:00Z') },
  { _id: 'p2', name: 'Pen', pricePaise: 9900, currency: 'INR', costPrice: 20, __v: 0, createdAt: new Date('2026-09-05T08:30:00Z') },
  { _id: 'p3', name: 'Lamp', pricePaise: 189900, currency: 'INR', costPrice: 900, __v: 3, createdAt: new Date('2026-09-10T15:45:00Z') },
];

// DTO: an explicit allow-list of what clients may see, with safe types
const toProductDTO = (p) => ({
  id: String(p._id),
  name: p.name,
  price: { amount: p.pricePaise, currency: p.currency },          // integer minor units, never floats
  createdAt: p.createdAt.toISOString(),                            // UTC ISO-8601
});

const sendError = (res, req, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }), requestId: req.id } });

app.get('/api/products', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const items = products.slice((page - 1) * limit, page * limit);
  res.json({ data: items.map(toProductDTO), pagination: { page, limit, total: products.length, hasNextPage: page * limit < products.length } });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find((p) => p._id === req.params.id);
  if (!product) return sendError(res, req, 404, 'PRODUCT_NOT_FOUND', 'Product not found');
  const body = { data: toProductDTO(product) };
  const etag = `"${crypto.createHash('sha1').update(JSON.stringify(body)).digest('base64url')}"`;
  res.set({ ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' });
  if (req.get('if-none-match') === etag) return res.status(304).end();
  return res.json(body);
});

app.post('/api/products', (req, res) => {
  const { name, price } = req.body || {};
  const details = [];
  if (typeof name !== 'string' || name.trim().length < 2) details.push({ field: 'name', message: 'At least 2 characters' });
  if (!Number.isInteger(price?.amount) || price.amount < 0) details.push({ field: 'price.amount', message: 'Integer in minor units (paise)' });
  if (details.length) return sendError(res, req, 400, 'VALIDATION_ERROR', 'Validation failed', details);
  const doc = { _id: `p${products.length + 1}`, name: name.trim(), pricePaise: price.amount, currency: price.currency || 'INR', costPrice: 0, __v: 0, createdAt: new Date() };
  products.push(doc);
  return res.status(201).location(`/api/products/${doc._id}`).json({ data: toProductDTO(doc) });
});

app.use((req, res) => sendError(res, req, 404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/api/products`));
:::

::: code javascript Browser demo: why money is integers and ids are strings (runnable)
const floatTotal = 0.1 + 0.2;
console.log('0.1 + 0.2 =', floatTotal, floatTotal !== 0.3 ? '✅ floats are inexact' : '❌ FAIL');
const paiseTotal = 10 + 20;                                        // ₹0.10 + ₹0.20 in paise
console.log('10 + 20 paise =', paiseTotal, '→ ₹' + (paiseTotal / 100).toFixed(2), paiseTotal === 30 ? '✅' : '❌ FAIL');

const bigId = '9007199254740993';                                  // a 64-bit id (e.g. from Twitter/Snowflake)
console.log('as a JSON number it becomes', JSON.parse(bigId), String(JSON.parse(bigId)) !== bigId ? '✅ precision lost' : '❌ FAIL');
console.log('as a string it survives', JSON.parse(`"${bigId}"`) === bigId ? '✅' : '❌ FAIL');

const toDTO = (doc) => ({ id: String(doc._id), name: doc.name, createdAt: new Date(doc.createdAt).toISOString() });
const dto = toDTO({ _id: 42, name: 'Asha', passwordHash: 'x', __v: 0, createdAt: Date.UTC(2026, 8, 30, 4) });
console.log('DTO →', JSON.stringify(dto), !('passwordHash' in dto) && dto.createdAt === '2026-09-30T04:00:00.000Z' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Different shapes per endpoint (`users` vs `data` vs raw arrays) → special cases in every client.
- Returning raw database documents (leaking `passwordHash`, `__v`, internal costs).
- Floats for money, local-time dates without offsets, numeric 64-bit ids.
- `200` with `{ success: false }` instead of real status codes.
- No `Location` on create, no request id on errors, no documentation.
:::

::: understand
- The response format is a **contract**; consistency lets the frontend write one API client.
- DTOs separate the **storage model** from the **public model**, so schema changes don't leak.
- Small type decisions (money, dates, ids) prevent whole classes of bugs.
:::

::: ask
- *"Is there an existing API style guide or envelope?"*
- *"Do clients need partial responses (`fields=`) or embedded related data (`include=`)?"*
- *"Should we generate clients from OpenAPI?"*
:::

::: important ⭐ Say this in the interview
"I keep response shapes consistent: a data field for single resources, data plus pagination for lists, and one error shape with a code, message, details and request id, all with correct status codes. Responses go through DTOs so only intended fields leave the server, with ids as strings, dates as ISO-8601 in UTC and money as integers in minor units with a currency, because floats and big numeric ids break in JavaScript. I add useful headers: Location on 201, ETag and Cache-Control so clients get 304s, a request id and rate-limit headers. And I document everything with OpenAPI and generate TypeScript types for the frontend."
:::

::: links
OpenAPI Specification | https://spec.openapis.org/oas/latest.html
Google JSON style guide | https://google.github.io/styleguide/jsoncstyleguide.xml
RFC 9457: Problem Details for HTTP APIs | https://www.rfc-editor.org/rfc/rfc9457.html
:::

=== How do you handle authentication? (end-to-end overview)
@p 3
@tags auth, bcrypt, oauth
@quick
- **Register**: validate → check duplicates → **hash** the password (bcrypt cost 12 or argon2/scrypt) → save (unique email index).
- **Login**: find user → compare hash (constant time) → issue a **session** or **access + refresh tokens**; generic error on failure.
- **Every request**: `authenticate` (who) → `authorize` (roles/permissions + **ownership**).
- **Lifecycle**: logout/revoke, password reset with a **hashed, single-use, 15-minute** token, email verification, MFA, lockout + rate limits.
- Measured bcrypt: cost 10 ≈ **64 ms**, 11 ≈ 119 ms, **12 ≈ 233 ms**, 13 ≈ 469 ms; slow on purpose, so brute force is expensive.

::: text 🧒 In simple words
Running authentication is like running a **members-only club**. **Sign-up**: check the form and store a fingerprint of the password, never the password itself. **Entrance**: compare fingerprints and hand out a wristband. **Inside**: guards check the wristband at every door and also whether this member may enter *this* room. **Lost card**: send a one-time link that expires quickly. **Security**: lock the door after too many wrong guesses, and offer a second check (MFA) for important members. Or hire a professional security company (Cognito, Auth0) to do all of it.
:::

::: text 📖 Detailed answer
### Building blocks
| Step | What to do | Pitfalls |
|---|---|---|
| **Register** | Validate, normalise email, check duplicates (and rely on a **unique index**), hash with bcrypt (cost ≥ 12) / argon2id / scrypt | Plain SHA-256 (too fast), returning the hash in responses |
| **Login** | Find by email, compare hash, issue credentials | Different errors for "no user" vs "wrong password" (account enumeration) |
| **Request auth** | Middleware verifies the session/JWT → `req.user` | Trusting the role in an old token after it changed |
| **Authorization** | Roles/permissions + **ownership checks** in queries | Only hiding buttons in the UI |
| **Logout** | Destroy session / revoke refresh token | Only deleting the token in the browser |
| **Password reset** | Random token, store its **SHA-256 hash**, 15-min expiry, single use, invalidate sessions after reset | Storing raw tokens, long expiry, revealing whether an email exists |
| **Hardening** | Rate-limit login, lockout/backoff, MFA (TOTP/WebAuthn), audit logs, HTTPS | Unlimited guesses |

### Password hashing cost (measured, Node 22)
| bcrypt cost | Time per hash |
|---|---|
| 10 | 64 ms |
| 11 | 119 ms |
| **12** | **233 ms** |
| 13 | 469 ms |
Each +1 doubles the work for attackers too. Choose the highest cost your login latency budget allows (~250 ms is common). Note: bcrypt only uses the first **72 bytes** of a password.

### Third-party identity
**OAuth 2.0 / OpenID Connect**: "Log in with Google/Microsoft", enterprise SSO (Okta, Entra ID, Cognito). SPAs use **Authorization Code + PKCE**; the API verifies the provider's JWTs with its **JWKS** public keys. Managed services (Cognito, Auth0, Clerk, Firebase Auth) handle MFA, resets and breach detection for you.
:::

::: diagram End-to-end authentication
flowchart LR
  REG["Register"] --> V["validate"] --> H["bcrypt hash cost 12"] --> DB[("users: unique email")]
  LOGIN["Login"] --> RL["rate limit + lockout"] --> CMP["compare hash"] --> TOK["session or access + refresh"]
  TOK --> REQ["Requests"] --> AN["authenticate"] --> AZ["authorize: role + owner"] --> C["controller"]
  RESET["Forgot password"] --> RT["random token, store SHA-256, 15 min"] --> MAIL["email link"]
:::

::: chart bar Measured: bcrypt hash time by cost factor (Node 22, ms)
Cost,Milliseconds
10,64
11,119
12,233
13,469
:::

::: image A members-only club: sign-up, entrance, guards at every door and a lost-card procedure
/images/rest-auth/auth-overview.svg
:::

::: text 🪜 Step by step
The password-reset flow in the service below:
1. `POST /auth/forgot { email }` always answers **204** (never reveals whether the email exists).
2. If the user exists: create 32 random bytes → the **raw token** goes only into the email link; the database stores **SHA-256(token)** and an expiry 15 minutes ahead.
3. The user clicks the link → `POST /auth/reset { token, newPassword }`.
4. The server hashes the presented token and looks up a user with that hash and an expiry in the future.
5. Found → hash the new password with bcrypt, **clear** the reset token (single use) and bump `tokenVersion` so old sessions/tokens die.
6. Not found or expired → **400** "Invalid or expired token". A leaked database doesn't contain usable reset tokens because only hashes are stored.
:::

::: code javascript Auth service: register, login, lockout, password reset (node auth-service.js)
// How to run: npm install express bcrypt jsonwebtoken && node auth-service.js
// Then: curl -s -X POST localhost:3000/auth/register -H 'Content-Type: application/json' -d '{"email":"asha@x.com","password":"correct horse 1"}'
//       curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"asha@x.com","password":"correct horse 1"}'
//       curl -s -i -X POST localhost:3000/auth/forgot -H 'Content-Type: application/json' -d '{"email":"asha@x.com"}'   (the reset link is printed in the server log)
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const BCRYPT_COST = 12;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const users = new Map();                                              // email → user (a real app: Mongo with a unique index)
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_COST);  // compared when the email is unknown

class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }

const authService = {
  async register({ email, password }) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AuthError(400, 'Valid email required');
    if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password) > 72) throw new AuthError(400, 'Password: 10-72 bytes');
    if (users.has(normalized)) throw new AuthError(409, 'Email already registered');
    const user = { id: crypto.randomUUID(), email: normalized, role: 'user', tokenVersion: 0, failures: 0, lockedUntil: 0, passwordHash: await bcrypt.hash(password, BCRYPT_COST) };
    users.set(normalized, user);
    return { id: user.id, email: user.email };
  },

  async login({ email, password }) {
    const user = users.get(String(email || '').trim().toLowerCase());
    if (user && user.lockedUntil > Date.now()) throw new AuthError(423, 'Account temporarily locked, try again later');
    // compare against a dummy hash for unknown emails → same response time either way
    const ok = await bcrypt.compare(String(password || ''), user ? user.passwordHash : DUMMY_HASH) && Boolean(user);
    if (!ok) {
      if (user && ++user.failures >= MAX_FAILURES) { user.lockedUntil = Date.now() + LOCK_MS; user.failures = 0; }
      throw new AuthError(401, 'Invalid email or password');          // generic: no account enumeration
    }
    user.failures = 0;
    return { accessToken: jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, JWT_SECRET, { expiresIn: '15m' }) };
  },

  async requestPasswordReset(email) {
    const user = users.get(String(email || '').trim().toLowerCase());
    if (!user) return;                                                // same response whether or not the email exists
    const rawToken = crypto.randomBytes(32).toString('base64url');
    user.resetTokenHash = sha256(rawToken);                           // store only the hash
    user.resetExpires = Date.now() + 15 * 60 * 1000;
    console.log(`(email) reset link: http://localhost:3000/reset?token=${rawToken}`);
  },

  async resetPassword({ token, newPassword }) {
    const hash = sha256(String(token || ''));
    const user = [...users.values()].find((u) => u.resetTokenHash === hash && u.resetExpires > Date.now());
    if (!user) throw new AuthError(400, 'Invalid or expired token');
    if (typeof newPassword !== 'string' || newPassword.length < 10) throw new AuthError(400, 'Password: at least 10 characters');
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    user.resetTokenHash = undefined;                                  // single use
    user.resetExpires = undefined;
    user.tokenVersion += 1;                                           // old tokens stop working
  },
};

const app = express();
app.use(express.json());
const route = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req.body || {});
    return result === undefined ? res.status(204).end() : res.status(status).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal error' });
  }
};
app.post('/auth/register', route((b) => authService.register(b), 201));
app.post('/auth/login', route((b) => authService.login(b)));
app.post('/auth/forgot', route((b) => authService.requestPasswordReset(b.email)));
app.post('/auth/reset', route((b) => authService.resetPassword(b)));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: hashed, expiring, single-use reset tokens (runnable)
const sha256 = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
const store = { user: { email: 'asha@x.com', resetTokenHash: null, resetExpires: 0 } };

async function requestReset(now) {
  const raw = crypto.randomUUID() + crypto.randomUUID();           // goes ONLY into the email
  store.user.resetTokenHash = await sha256(raw);
  store.user.resetExpires = now + 15 * 60 * 1000;
  return raw;
}
async function reset(raw, now) {
  const ok = store.user.resetTokenHash === await sha256(raw) && store.user.resetExpires > now;
  if (ok) { store.user.resetTokenHash = null; store.user.resetExpires = 0; }
  return ok;
}

(async () => {
  const t0 = Date.now();
  const raw = await requestReset(t0);
  console.log('database stores a hash, not the token', store.user.resetTokenHash !== raw && store.user.resetTokenHash.length === 64 ? '✅' : '❌ FAIL');
  console.log('valid link works', await reset(raw, t0 + 60_000) ? '✅' : '❌ FAIL');
  console.log('second use rejected (single use)', !(await reset(raw, t0 + 61_000)) ? '✅' : '❌ FAIL');
  const raw2 = await requestReset(t0);
  console.log('expired after 15 minutes', !(await reset(raw2, t0 + 16 * 60_000)) ? '✅' : '❌ FAIL');
  console.log('a guessed token fails', !(await reset('guess', t0)) ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Fast hashes (MD5/SHA-256) or low bcrypt cost for passwords; unsalted hashes.
- Different messages or timings for "unknown email" vs "wrong password" (account enumeration).
- Reset tokens stored in plain text, valid for days, or reusable.
- No rate limiting/lockout on login → credential stuffing works.
- Building everything yourself when SSO/MFA/compliance requirements point to a managed provider.
:::

::: understand
- Authentication is a **lifecycle**, not a login form: register, login, request checks, refresh, logout, reset, MFA, revocation.
- Slowness is a feature for password hashing; tokens and sessions keep everyday requests fast.
- Hash anything that works like a password: passwords, reset tokens, API keys.
:::

::: ask
- *"Build our own or use a provider (Cognito, Auth0, Okta)?"*
- *"Do we need SSO, social login, MFA, multi-tenancy?"*
- *"What are the compliance requirements (PCI, SOC 2, HIPAA)?"*
:::

::: important ⭐ Say this in the interview
"Registration validates input, normalises the email and stores a slow, salted hash, bcrypt with cost 12 or argon2, with a unique index on email; in a quick test cost 12 took about 230 milliseconds, which is fine for login and expensive for attackers. Login compares the hash, returns the same generic error for unknown emails and wrong passwords, rate-limits and locks out repeated failures, and issues a session or a short access token plus a rotated refresh token. Every request goes through authenticate and then authorization, including ownership checks in queries. Password reset uses a random single-use token, of which I store only a SHA-256 hash, valid for 15 minutes, and a reset revokes existing tokens. For SSO and MFA I'd lean on OpenID Connect with a provider like Cognito or Auth0."
:::

::: links
OWASP: Password storage cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
OWASP: Forgot password cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
OAuth 2.0 for browser-based apps (PKCE) | https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
bcrypt (npm) | https://github.com/kelektiv/node.bcrypt.js
:::

=== JWT vs session-based authentication
@p 3
@tags auth, jwt, session
@quick
- **Session**: the server stores session data (Redis/DB); the browser holds only an opaque **session id cookie**. Revocation is instant; needs a shared store.
- **JWT**: a signed token carries claims; any server with the key **verifies without a lookup**. Stateless and easy across services, but **hard to revoke**.
- Measured: `jwt.verify` ≈ **22 µs** vs a local Redis session lookup ≈ **125 µs**; both are tiny next to a DB query, so choose on revocation and architecture, not speed.
- Common hybrid: **short JWT access token** + **server-stored, rotated refresh token** in an httpOnly cookie.
- Both need HTTPS; cookie-based auth needs `HttpOnly`, `Secure`, `SameSite` and CSRF thinking.

::: text 🧒 In simple words
A **session** is like a **coat check**: you get a small numbered ticket, and the cloakroom keeps your coat (your data). Every time, the attendant looks up the number. If you lose the ticket, they can cancel it instantly. A **JWT** is like a **signed festival wristband**: all the information is printed on it and protected by a tamper-proof stamp, so any gate can check it without calling the office. That's fast and works at every gate, but if someone steals a wristband, it keeps working until it expires.
:::

::: text 📖 Detailed answer
### Session-based
1. Login → the server creates a session `{ userId, role }` in **Redis/DB** and sends `Set-Cookie: sid=<random>; HttpOnly; Secure; SameSite=Lax`.
2. The browser sends the cookie automatically; the server **looks up** the session on each request.
3. Logout or "ban user" → **delete the session**: revoked instantly.

### JWT-based
1. Login → the server signs `header.payload.signature` (HS256 secret or RS256/ES256 private key).
2. The client sends `Authorization: Bearer <jwt>` (or a cookie).
3. Any server verifies the **signature, algorithm and `exp`** without a database lookup.
4. Logout → the token stays valid until `exp` unless you keep a **denylist** or a per-user `tokenVersion`.

| | Session | JWT |
|---|---|---|
| Where state lives | Server (Redis/DB) | In the token |
| Per-request cost | Store lookup (~125 µs local Redis) | Signature check (~22 µs HS256) |
| Scaling | Shared store across instances | Any instance with the key |
| Revocation | ✅ Instant (delete session) | ❌ Wait for `exp`, or denylist/tokenVersion |
| Size on every request | Tiny cookie | Larger (claims + signature) |
| Mobile / cross-domain / microservices | Harder | ✅ Natural |
| Main browser risks | CSRF (cookie auto-sent) | XSS theft if stored in `localStorage`; long-lived tokens |

### When to choose
- **Sessions**: server-rendered apps, admin panels, banking (instant revocation), same-site SPAs.
- **JWT**: many services verifying identity, mobile clients, third-party APIs, identity providers (Cognito, Auth0 issue JWTs).
- **Hybrid** (common in SPAs): access JWT for 5–15 minutes in memory + refresh token stored server-side and rotated → stateless checks with real logout.
:::

::: diagram Coat check vs wristband
flowchart TB
  subgraph Session["Session-based"]
    B1["Browser cookie sid=abc"] --> S1["Any server"] --> R1[("Redis: abc = user 42, role")]
  end
  subgraph JWT["JWT-based"]
    B2["Client: Bearer header.payload.signature"] --> S2["Any server: verify signature + exp"]
    S2 -.->|"no lookup"| X["req.user from claims"]
  end
:::

::: chart bar Measured: cost per request to check identity (microseconds, local)
Check,Microseconds
jwt.verify (HS256),22
Redis session GET,125
:::

::: image A coat-check ticket (session) vs a signed wristband (JWT)
/images/rest-auth/session-vs-jwt.svg
:::

::: text 🪜 Step by step
The same "who is this?" check in both servers below:
1. **Session login**: verify the password → `req.session.regenerate()` (new id, prevents session fixation) → store `{ userId, role }` → the session middleware sets the `sid` cookie.
2. **Session request**: the cookie arrives → `express-session` loads the session from the store → `req.session.user` exists → allowed.
3. **Session logout**: `req.session.destroy()` deletes it from the store → the same cookie is now useless (instant revocation).
4. **JWT login**: verify the password → `jwt.sign({ sub, role, tv: tokenVersion }, secret, { expiresIn: '15m' })`.
5. **JWT request**: `jwt.verify` checks signature/alg/exp; we also compare `tv` with the user's current `tokenVersion`.
6. **JWT "log out everywhere"**: increment `tokenVersion` → every older token fails step 5 even before it expires (one cheap lookup reintroduced on purpose).
:::

::: code javascript Session auth with express-session (+ Redis when configured) (node session-auth.js)
// How to run: npm install express express-session connect-redis redis && node session-auth.js
//             REDIS_URL=redis://localhost:6379 node session-auth.js   (shared store for several servers)
// Then: curl -s -c jar -X POST localhost:3000/login -H 'Content-Type: application/json' -d '{"email":"asha@x.com","password":"secret123"}'
//       curl -s -b jar localhost:3000/me     curl -s -b jar -X POST localhost:3000/logout     curl -s -b jar localhost:3000/me
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');

async function createSessionStore() {
  if (!process.env.REDIS_URL) return undefined;                       // MemoryStore: dev only, single process
  const { RedisStore } = require('connect-redis');
  const { createClient } = require('redis');
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return new RedisStore({ client, prefix: 'sess:' });
}

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const users = [{ id: 'u1', email: 'asha@x.com', role: 'user', salt: 's1', passwordHash: hash('secret123', 's1') }];

async function main() {
  const app = express();
  app.set('trust proxy', 1);                                          // behind a load balancer: correct "secure" detection
  app.use(express.json());
  app.use(session({
    store: await createSessionStore(),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    name: 'sid',
    resave: false,
    saveUninitialized: false,                                         // no cookie until login
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  }));

  app.post('/login', (req, res, next) => {
    const user = users.find((u) => u.email === String(req.body?.email || '').toLowerCase());
    if (!user || hash(String(req.body?.password || ''), user.salt) !== user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' });
    return req.session.regenerate((err) => {                          // new session id → prevents session fixation
      if (err) return next(err);
      req.session.user = { id: user.id, role: user.role };
      return res.json({ ok: true });
    });
  });

  const requireLogin = (req, res, next) => (req.session.user ? next() : res.status(401).json({ error: 'Login required' }));
  app.get('/me', requireLogin, (req, res) => res.json(req.session.user));

  app.post('/logout', (req, res, next) => req.session.destroy((err) => {
    if (err) return next(err);
    return res.clearCookie('sid').status(204).end();                  // revoked immediately on the server
  }));

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT} (session store: ${process.env.REDIS_URL ? 'redis' : 'memory'})`));
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript JWT auth with "log out everywhere" via tokenVersion (node jwt-auth.js)
// How to run: npm install express jsonwebtoken && node jwt-auth.js
// Then: TOKEN=$(curl -s -X POST localhost:3000/login -H 'Content-Type: application/json' -d '{"email":"asha@x.com","password":"secret123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
//       curl -s localhost:3000/me -H "Authorization: Bearer $TOKEN"
//       curl -s -X POST localhost:3000/logout-everywhere -H "Authorization: Bearer $TOKEN"   (then /me again → 401)
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const users = [{ id: 'u1', email: 'asha@x.com', role: 'user', tokenVersion: 0, salt: 's1', passwordHash: hash('secret123', 's1') }];

const app = express();
app.use(express.json());

app.post('/login', (req, res) => {
  const user = users.find((u) => u.email === String(req.body?.email || '').toLowerCase());
  if (!user || hash(String(req.body?.password || ''), user.salt) !== user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' });
  const accessToken = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, SECRET, { algorithm: 'HS256', expiresIn: '15m' });
  return res.json({ accessToken, expiresIn: 900 });
});

function authenticate(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });   // signature + alg + exp
    const user = users.find((u) => u.id === payload.sub);
    if (!user || user.tokenVersion !== payload.tv) return res.status(401).json({ error: 'Token revoked' });
    req.user = { id: user.id, role: user.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' });
  }
}

app.get('/me', authenticate, (req, res) => res.json(req.user));
app.post('/logout-everywhere', authenticate, (req, res) => {
  users.find((u) => u.id === req.user.id).tokenVersion += 1;             // every older token now fails
  res.status(204).end();
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: revocation in a session store vs a stateless token (runnable)
// Sessions: delete the record and the id stops working. JWT: the token keeps working until it expires.
const sessions = new Map();
const loginSession = (userId) => { const sid = crypto.randomUUID(); sessions.set(sid, { userId }); return sid; };
const checkSession = (sid) => sessions.has(sid);

const now = () => Math.floor(Date.now() / 1000);
const issueToken = (userId, ttl, tv = 0) => ({ sub: userId, exp: now() + ttl, tv });     // pretend it's signed
const checkToken = (t, currentTv = null) => t.exp > now() && (currentTv === null || t.tv === currentTv);

const sid = loginSession('u1');
sessions.delete(sid);                                                    // logout / ban
console.log('session revoked instantly', checkSession(sid) === false ? '✅' : '❌ FAIL');

const token = issueToken('u1', 900);
console.log('plain JWT still valid after "logout" (until exp)', checkToken(token) === true ? '✅' : '❌ FAIL');

let tokenVersion = 0;
const versioned = issueToken('u1', 900, tokenVersion);
tokenVersion += 1;                                                       // "log out everywhere"
console.log('tokenVersion check revokes old tokens', checkToken(versioned, tokenVersion) === false ? '✅' : '❌ FAIL');
console.log('expired token rejected', checkToken(issueToken('u1', -1)) === false ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- "JWT is stateless, so it's always better": revocation, size and XSS storage are real costs.
- Long-lived JWTs (days) with no revocation strategy.
- Session store in process memory with several servers (users get logged out randomly) → use Redis.
- Not regenerating the session id at login (session fixation).
- Cookie-based auth without `SameSite`/CSRF protection on state-changing routes.
:::

::: understand
- The real trade-off is **where the truth lives**: in a store you control (sessions) or inside a token you can't recall (JWT).
- Speed rarely decides it: 22 µs vs 125 µs is noise next to a 5 ms database query.
- Identity providers (Cognito, Auth0, Okta) give you JWTs; you still need a revocation and refresh story.
:::

::: ask
- *"Browser-only, mobile, or third-party clients?"*
- *"Do we need instant revocation (banking, admin, account takeover response)?"*
- *"Do several services need to verify identity independently?"* → JWT (RS256 + JWKS).
:::

::: important ⭐ Say this in the interview
"With sessions, the server keeps the session data in a store like Redis and the browser only holds an opaque, httpOnly session cookie, so logout or banning a user is instant, but every request needs a store lookup and all instances need the shared store. With JWTs, the claims are inside a signed token that any service can verify without a lookup, which suits mobile clients and microservices, but a stolen token stays valid until it expires. In a quick local test a JWT verification took about 22 microseconds and a Redis session lookup about 125, so performance rarely decides; revocation and architecture do. For SPAs I often combine them: a short-lived access JWT in memory plus a server-stored, rotated refresh token in an httpOnly cookie, and a token version per user for log out everywhere."
:::

::: links
OWASP: Session management cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
OWASP: JSON Web Token cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
express-session | https://github.com/expressjs/session
jwt.io: Introduction | https://jwt.io/introduction
:::

=== Where should JWTs be stored?
@p 3
@tags jwt, security, xss, csrf
@quick
- `localStorage`/`sessionStorage`: simple, but **any injected script (XSS) can read and steal it**.
- **httpOnly + Secure + SameSite cookie**: JavaScript can't read it (XSS can't exfiltrate it), but it's sent automatically → think about **CSRF** (`SameSite`, narrow `Path`, CSRF token if cross-site).
- Recommended for SPAs: **access token in memory** (lost on reload) + **refresh token in an httpOnly cookie** scoped to the refresh endpoint, **rotated** with reuse detection.
- On reload, call `POST /auth/refresh` to get a new access token; share **one** refresh between parallel 401s.
- No storage survives a live XSS attack completely, so also prevent XSS (CSP, output escaping, no unsafe HTML).

::: text 🧒 In simple words
Where do you keep your house key? **Under the doormat** (localStorage) is convenient, but anyone who gets onto your porch (a malicious script on your page) finds it immediately. A **locker that only the building manager can open** (httpOnly cookie) can't be reached by the porch visitor, but the manager hands it over whenever someone *asks in your name*, so you must check that the request really comes from you (CSRF protection). The safest everyday setup: carry a **short-lived day pass in your pocket** (access token in memory) and keep the long-term key in the manager's locker (refresh cookie).
:::

::: text 📖 Detailed answer
| Storage | Readable by injected JS (XSS)? | Sent automatically (CSRF risk)? | Survives reload | Verdict |
|---|---|---|---|---|
| `localStorage` / `sessionStorage` | **Yes**: any script can read and send it away | No | Yes | Avoid for long-lived tokens |
| **Memory** (JS variable, React context) | Only while the attack runs in the open tab | No | **No** (refresh on load) | ✅ Access token |
| **httpOnly cookie** | **No** | Yes → `SameSite` + narrow `Path` (+ CSRF token if cross-site) | Yes | ✅ Refresh token |
| Non-httpOnly cookie | Yes | Yes | Yes | ❌ Worst of both |

### Recommended SPA pattern
1. Login → API returns the **access token (≈15 min)** in JSON and sets the **refresh token** cookie: `HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800`.
2. The SPA keeps the access token **in memory** and attaches `Authorization: Bearer …` through one API client.
3. Page reload → memory is empty → `POST /auth/refresh` (cookie sent automatically) → new access token.
4. `401 TOKEN_EXPIRED` → **one shared** refresh call for all parallel requests, then retry each once.
5. **Rotation**: every refresh returns a new refresh token; reusing an old one means theft → revoke the whole token family.
6. Logout → server revokes the refresh token and clears the cookie.

### CSRF in one paragraph
Cookies are sent automatically, so another site could trigger a request with your cookie. `SameSite=Lax/Strict` stops cross-site sending for most cases; a narrow `Path` limits where the refresh cookie goes; for APIs on another site (`SameSite=None`) add a CSRF token or require a custom header (forms can't set those cross-site).

### Mobile apps
No browser cookie jar: store refresh tokens in the **Keychain (iOS) / Keystore (Android)**.
:::

::: diagram Silent refresh in a React SPA
sequenceDiagram
  participant R as React (access token in memory)
  participant A as API
  R->>A: GET /orders (Bearer access)
  A-->>R: 401 TOKEN_EXPIRED
  R->>A: POST /auth/refresh (httpOnly cookie sent automatically)
  A->>A: verify, rotate refresh token, detect reuse
  A-->>R: new access token + Set-Cookie new refresh
  R->>A: retry GET /orders (new Bearer)
  A-->>R: 200 orders
:::

::: image Where to keep the key: doormat (localStorage), manager's locker (httpOnly cookie), pocket (memory)
/images/rest-auth/token-storage.svg
:::

::: text 🪜 Step by step
Refresh-token rotation with reuse detection, as implemented in the server below:
1. Login creates a refresh token with a random `jti` and a `family` id; the server stores `{ jti, family, userId, used: false }`.
2. A refresh request presents token A: it's valid and unused → mark A **used**, issue B (same family), return a new access token.
3. An attacker who stole A replays it: A is already **used** → this is reuse → **revoke every token in the family** and return 401.
4. The legitimate user's next refresh with B now fails too → they must log in again (safe outcome after theft).
5. Logout deletes the family and clears the cookie.
:::

::: code javascript Refresh endpoint with rotation and reuse detection (node refresh-rotation.js)
// How to run: npm install express jsonwebtoken cookie-parser && node refresh-rotation.js
// Then: curl -s -c jar -X POST localhost:3000/auth/login            (sets the refresh cookie)
//       cp jar stolen; curl -s -b jar -c jar -X POST localhost:3000/auth/refresh   (rotates)
//       curl -s -b stolen -X POST localhost:3000/auth/refresh        (reuse → whole family revoked)
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const refreshTokens = new Map();                                       // jti → { family, userId, used, expiresAt }

function issueRefresh(res, userId, family = crypto.randomUUID()) {
  const jti = crypto.randomBytes(32).toString('base64url');           // opaque, unguessable
  refreshTokens.set(jti, { family, userId, used: false, expiresAt: Date.now() + REFRESH_TTL_MS });
  res.cookie('rt', jti, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/auth', maxAge: REFRESH_TTL_MS });
}
const accessFor = (userId) => jwt.sign({ sub: userId }, ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
const revokeFamily = (family) => { for (const [jti, t] of refreshTokens) if (t.family === family) refreshTokens.delete(jti); };

const app = express();
app.use(cookieParser());

app.post('/auth/login', (req, res) => {                                // demo login: the full password check is shown in the auth question
  issueRefresh(res, 'u1');
  res.json({ accessToken: accessFor('u1') });
});

app.post('/auth/refresh', (req, res) => {
  const record = refreshTokens.get(req.cookies.rt);
  if (!record || record.expiresAt < Date.now()) return res.status(401).json({ error: 'SESSION_EXPIRED' });
  if (record.used) {                                                   // a used token came back → stolen
    revokeFamily(record.family);
    return res.status(401).json({ error: 'REFRESH_REUSED_ALL_SESSIONS_REVOKED' });
  }
  record.used = true;                                                  // rotation
  issueRefresh(res, record.userId, record.family);
  return res.json({ accessToken: accessFor(record.userId) });
});

app.post('/auth/logout', (req, res) => {
  const record = refreshTokens.get(req.cookies.rt);
  if (record) revokeFamily(record.family);
  res.clearCookie('rt', { path: '/auth' }).status(204).end();
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser API client: token in memory + one shared refresh for parallel 401s (api-client.js)
// Frontend module (React, Vue, anything). The refresh cookie travels automatically; JS never sees it.
let accessToken = null;
let refreshPromise = null;                       // shared by every request that hits a 401 at the same time

export const setAccessToken = (token) => { accessToken = token; };

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Session expired');
        accessToken = (await res.json()).accessToken;
        return accessToken;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function api(path, options = {}, retried = false) {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { ...(options.headers || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    await refreshAccessToken();                  // throws → caller shows the login screen
    return api(path, options, true);             // retry once with the new token
  }
  return res;
}
:::

::: code javascript Browser demo: what an injected script can reach (runnable)
// Simulate an XSS payload running on your page and check what it can read.
const fakeLocalStorage = new Map([['token', 'eyJ.long-lived-refresh-token']]);
const cookieJar = [
  { name: 'rt', value: 'opaque-refresh', httpOnly: true },
  { name: 'theme', value: 'dark', httpOnly: false },
];
let inMemoryAccessToken = 'eyJ.short-access-token';                    // lives in a JS variable

function xssPayload() {
  return {
    fromLocalStorage: fakeLocalStorage.get('token') || null,
    fromCookies: cookieJar.filter((c) => !c.httpOnly).map((c) => c.name),   // the browser's cookie API hides httpOnly ones
    fromMemory: inMemoryAccessToken,                                        // reachable while the page is open
  };
}

const stolen = xssPayload();
console.log('localStorage token stolen →', stolen.fromLocalStorage, stolen.fromLocalStorage ? '✅ (this is the danger)' : '❌ FAIL');
console.log('httpOnly refresh cookie hidden from JS', !stolen.fromCookies.includes('rt') ? '✅' : '❌ FAIL');
console.log('memory token reachable only during the attack', stolen.fromMemory === 'eyJ.short-access-token' ? '✅' : '❌ FAIL');
inMemoryAccessToken = null;                                            // page reload / tab closed
console.log('after reload the memory token is gone', xssPayload().fromMemory === null ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Long-lived tokens in `localStorage` ("but everyone does it") for apps handling money or personal data.
- Refresh cookies without `HttpOnly`, `Secure`, `SameSite` or with `Path=/` (sent to every route).
- Every parallel request triggering its own refresh → rotation invalidates all but one → random logouts.
- Rotating refresh tokens without reuse detection (theft goes unnoticed).
- Thinking httpOnly cookies fix XSS: an attacker can still *use* the session while the page is compromised; prevent XSS too.
:::

::: understand
- Storage choice limits **what an attacker can steal**; it doesn't make XSS harmless.
- Cookies trade XSS-theft risk for CSRF risk, and `SameSite` mostly fixes CSRF for same-site apps.
- Rotation + reuse detection turns a stolen refresh token into a detectable event.
:::

::: ask
- *"Are the SPA and the API on the same site?"* Cross-site cookies need `SameSite=None; Secure`, CORS with credentials, and CSRF tokens.
- *"Web only, or mobile too?"* (Keychain/Keystore for mobile).
- Don't be dogmatic: *"localStorage is a trade-off; for sensitive apps I prefer memory + httpOnly refresh cookie."*
:::

::: important ⭐ Say this in the interview
"I avoid keeping long-lived tokens in localStorage because any XSS can read and exfiltrate them. For SPAs I keep a short-lived access token only in memory, and the refresh token in an httpOnly, Secure, SameSite cookie scoped to the refresh path, so JavaScript can't read it. On page load or on a 401 the client calls the refresh endpoint once, shared across parallel requests, and retries. Refresh tokens are rotated on every use, and if an already-used one comes back I treat it as theft and revoke the whole token family. Cookies bring CSRF considerations, which SameSite and a narrow path handle for same-site apps, and of course I still prevent XSS with CSP and escaping."
:::

::: links
OWASP: HTML5 security cheat sheet (local storage) | https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage
OWASP: CSRF prevention cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
Auth0: Refresh token rotation | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
MDN: Set-Cookie (HttpOnly, SameSite) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
:::

=== How do you protect APIs from unauthorized access?
@p 3
@tags security, owasp, api-security
@quick
- **Default deny**: every route needs authentication unless explicitly public; then **authorization** per function (roles) **and per object** (owner checks).
- **BOLA/IDOR** (#1 in the OWASP API Top 10): always scope queries by the caller: `findOne({ _id, ownerId: req.user.id })`, answer **404** for others' objects.
- Allow-list writable fields (no mass assignment) and never return sensitive fields (`passwordHash`, internal flags).
- Baseline: HTTPS, `helmet`, strict **CORS** allow-list, body size limits, input validation + NoSQL-operator stripping, rate limits, no stack traces.
- Note: `express-mongo-sanitize` **crashes on Express 5** (`req.query` is read-only), so use your own sanitizer or validate types with Zod.

::: text 🧒 In simple words
Protecting an API is like protecting an **office building**. There's a **guard at the entrance** (authentication: are you an employee?), **badge readers on certain floors** (authorization by role: only HR enters the HR floor), and **personal lockers** (object-level checks: your badge opens *your* locker, not your colleague's, even though you're both employees). The most common real-world break-in isn't climbing the wall; it's an employee trying locker number 43 instead of 42 and finding it unlocked. That's why every request for "locker 43" must check whose locker it is.
:::

::: text 📖 Detailed answer
Think in **layers** (defence in depth) and use the **OWASP API Security Top 10 (2023)** as the checklist:

| # | Risk | What it looks like | Mitigation |
|---|---|---|---|
| API1 | **Broken Object Level Authorization (BOLA/IDOR)** | `GET /orders/43` returns someone else's order | Scope every query by owner/tenant; 404 for others |
| API2 | Broken authentication | Weak passwords, no lockout, long-lived tokens | Slow hashes, rate limits, MFA, short tokens |
| API3 | Broken object property level authorization | Client sets `role: admin`, or response leaks `passwordHash` | Allow-list input fields; DTOs for output |
| API4 | Unrestricted resource consumption | `?limit=1000000`, 50 MB JSON, no rate limit | Caps, body limits, timeouts, rate limits |
| API5 | Broken function level authorization | A normal user calls `DELETE /admin/users/1` | `requireRole('admin')` on admin routes |
| API6 | Unrestricted access to sensitive business flows | Bots buy all tickets / create accounts | Bot detection, CAPTCHA, per-account limits |
| API7 | Server-side request forgery (SSRF) | `?imageUrl=http://169.254.169.254/` | Allow-list outbound hosts; block private IPs |
| API8 | Security misconfiguration | Stack traces, permissive CORS, default creds | `helmet`, strict CORS, generic errors |
| API9 | Improper inventory management | Old `/v1` still live and unpatched | Inventory, retire versions |
| API10 | Unsafe consumption of APIs | Trusting third-party responses blindly | Validate external data too |

### Express 5 note: NoSQL operator stripping
`express-mongo-sanitize` reassigns `req.query`, which is a **read-only getter in Express 5** → every request fails with "Cannot set property query … which has only a getter". Strip `$`-keys from `req.body` and `req.params` yourself (as below) and validate types with a schema (a string field can't hold `{ "$ne": "" }`).

### CORS is not authentication
CORS only tells **browsers** which origins may read responses. `curl`, scripts and servers ignore it. Real protection is authentication and authorization on the server.
:::

::: diagram Defence in depth
flowchart LR
  C(["Client"]) --> WAF["CloudFront / WAF"] --> LB["ALB + HTTPS"] --> APP["Express: helmet, CORS, limits, rate limit"]
  APP --> AN["authenticate (default deny)"] --> AZ["authorize role"] --> OBJ["object check: ownerId = req.user.id"]
  OBJ --> DB[("MongoDB: least-privilege user, private subnet")]
:::

::: image An office building: entrance guard, floor badges and personal lockers (BOLA is trying locker 43)
/images/rest-auth/api-security.svg
:::

::: text 🪜 Step by step
User A (id `u1`) requests `GET /api/orders/2`, which belongs to user B, against the server below:
1. `helmet`, CORS, the body limit and the rate limiter run first (cheap rejections happen early).
2. `authenticate` verifies the token → `req.user = { id: 'u1', role: 'user' }`.
3. The handler queries with the **owner in the filter**: `{ id: '2', ownerId: 'u1' }` (admins skip the owner condition).
4. No match → **404 Not Found**, exactly as if the order didn't exist, so attackers can't even learn which ids are valid.
5. `PATCH /api/orders/1` with `{ "status": "refunded", "total": 0 }` → only allow-listed fields (`note`) are applied.
6. A JSON body containing `{ "ownerId": { "$ne": null } }` has its `$` keys stripped before any handler sees it.
:::

::: code javascript Security baseline for an Express 5 API, with BOLA-safe queries (node secure-api.js)
// How to run: npm install express helmet cors express-rate-limit && node secure-api.js
// Then: curl -s localhost:3000/api/orders/1 -H 'Authorization: Bearer token-u1'    (own order → 200)
//       curl -s localhost:3000/api/orders/2 -H 'Authorization: Bearer token-u1'    (someone else's → 404)
//       curl -s localhost:3000/api/admin/orders -H 'Authorization: Bearer token-u1' (not admin → 403)
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                                         // behind ALB/Nginx: real client IP for rate limiting
app.use(helmet());                                                 // CSP, HSTS, noSniff, frameguard…
app.use(cors({ origin: ['https://app.example.com'], credentials: true }));   // browsers only; not auth!
app.use(express.json({ limit: '100kb' }));

// Strip MongoDB operators ($gt, $ne…) and dotted keys from bodies/params (Express 5-safe: no req.query write)
function stripOperators(value) {
  if (Array.isArray(value)) return value.map(stripOperators);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('$') && !k.includes('.')).map(([k, v]) => [k, stripOperators(v)]));
  }
  return value;
}
app.use((req, res, next) => { if (req.body) req.body = stripOperators(req.body); next(); });

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

// ---- auth (tokens stand in for verified JWTs) ----
const TOKENS = { 'token-u1': { id: 'u1', role: 'user' }, 'token-u2': { id: 'u2', role: 'user' }, 'token-admin': { id: 'a1', role: 'admin' } };
const authenticate = (req, res, next) => {
  req.user = TOKENS[(req.get('authorization') || '').replace('Bearer ', '')];
  return req.user ? next() : res.status(401).json({ error: 'Authentication required' });
};
const requireRole = (role) => (req, res, next) => (req.user.role === role ? next() : res.status(403).json({ error: 'Forbidden' }));

// ---- data ----
const orders = [
  { id: '1', ownerId: 'u1', total: 42, status: 'paid', note: '', internalRiskScore: 0.1 },
  { id: '2', ownerId: 'u2', total: 99, status: 'paid', note: '', internalRiskScore: 0.7 },
];
const toPublicOrder = ({ internalRiskScore, ...rest }) => rest;    // never leak internal fields
const ownedFilter = (req) => (o) => o.id === req.params.id && (req.user.role === 'admin' || o.ownerId === req.user.id);

app.use('/api', authenticate);                                     // default deny for everything under /api

app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(ownedFilter(req));
  return order ? res.json(toPublicOrder(order)) : res.status(404).json({ error: 'Order not found' });  // 404, not 403
});

const EDITABLE = ['note'];                                         // status/total/ownerId are server-controlled
app.patch('/api/orders/:id', (req, res) => {
  const order = orders.find(ownedFilter(req));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  for (const key of EDITABLE) if (typeof req.body?.[key] === 'string') order[key] = req.body[key].slice(0, 500);
  return res.json(toPublicOrder(order));
});

app.get('/api/admin/orders', requireRole('admin'), (req, res) => res.json(orders.map(toPublicOrder)));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal error' }));  // no stack traces

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: BOLA check, field allow-list and operator stripping (runnable)
const orders = [{ id: '1', ownerId: 'u1', total: 42, note: '' }, { id: '2', ownerId: 'u2', total: 99, note: '' }];
const findOrder = (id, user) => orders.find((o) => o.id === id && (user.role === 'admin' || o.ownerId === user.id)) || null;
const applyPatch = (order, body, editable) => { for (const k of editable) if (k in body) order[k] = body[k]; return order; };
const stripOperators = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, stripOperators(x)]))
  : v);

const u1 = { id: 'u1', role: 'user' }, admin = { id: 'a1', role: 'admin' };
console.log('own order visible', findOrder('1', u1)?.id === '1' ? '✅' : '❌ FAIL');
console.log("someone else's order → not found (BOLA blocked)", findOrder('2', u1) === null ? '✅' : '❌ FAIL');
console.log('admin can see any order', findOrder('2', admin)?.id === '2' ? '✅' : '❌ FAIL');
const patched = applyPatch({ ...orders[0] }, { note: 'leave at door', total: 0, ownerId: 'u9' }, ['note']);
console.log('only allow-listed field changed', patched.note === 'leave at door' && patched.total === 42 && patched.ownerId === 'u1' ? '✅' : '❌ FAIL');
const cleaned = stripOperators({ email: 'a@x.com', password: { $ne: '' }, nested: { $where: '1' } });
console.log('operators stripped →', JSON.stringify(cleaned), JSON.stringify(cleaned) === '{"email":"a@x.com","password":{},"nested":{}}' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Checking authentication but not **ownership** (`findById(req.params.id)` for any logged-in user).
- Returning 403 for other users' objects (leaks existence) or full documents with internal fields.
- Treating CORS as security, or `origin: '*'` with credentials.
- Using `express-mongo-sanitize` on Express 5 (every request 500s) or skipping type validation entirely.
- Secrets in code, admin routes protected only by "nobody knows the URL".
:::

::: understand
- Authorization has **three levels**: function (route/role), object (this record), property (these fields).
- Most real API breaches are BOLA and broken auth, not exotic exploits.
- Security middleware is a baseline; the critical checks live in **queries and services**.
:::

::: ask
- *"Public, partner or internal API?"* Partner → API keys/OAuth client credentials; internal → network isolation + service identity.
- *"Multi-tenant?"* → tenant id in every query and index.
- *"Compliance (PCI, HIPAA, GDPR)?"* → logging, encryption, retention rules.
:::

::: important ⭐ Say this in the interview
"I protect APIs in layers. At the edge: HTTPS, a WAF, rate limits, body size limits, helmet headers and a strict CORS allow-list, keeping in mind that CORS isn't authentication. Every route is authenticated by default, then authorized per function with roles and, most importantly, per object: queries include the owner or tenant, so asking for someone else's order returns 404, which prevents BOLA, the top OWASP API risk. Writes allow-list fields to stop mass assignment and responses go through DTOs so internal fields never leak. Input is validated with a schema, and on Express 5 I strip MongoDB operators myself because express-mongo-sanitize breaks on the read-only req.query. Plus secrets in a secrets manager, least-privilege database users and monitoring."
:::

::: links
OWASP API Security Top 10 (2023) | https://owasp.org/API-Security/editions/2023/en/0x11-t10/
helmet | https://helmetjs.github.io/
OWASP: Authorization cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
Express 5: req.query is a getter | https://expressjs.com/en/guide/migrating-5.html#req.query
:::

=== How do you implement rate limiting?
@p 3
@tags rate-limiting, redis, security
@quick
- Count requests per **key** (user id, API key, IP) per **time window**; over the limit → **429** + `Retry-After` and `RateLimit-*` headers.
- Algorithms: **fixed window** (simple, allows bursts at boundaries), **sliding window log/counter** (smooth), **token bucket** (controlled bursts), leaky bucket (constant outflow).
- Simulated boundary burst (limit 5/s): fixed window allowed **10 of 20** requests within 200 ms; token bucket allowed **5**.
- Several servers → shared counters in **Redis** with atomic operations (`MULTI`/Lua); behind a proxy set `trust proxy`.
- Layer it: CloudFront/WAF, API Gateway, Nginx `limit_req`, app-level per-user limits; stricter on login/OTP/signup.

::: text 🧒 In simple words
A rate limit is a **turnstile at a stadium** that only lets a certain number of people through per minute. Without it, a crowd (or a bot) can push in all at once and crush the gates for everyone. Different turnstiles behave differently: one resets its counter on the minute (fixed window), which lets two crowds through right around the minute change; another hands out **tokens** that refill steadily (token bucket), so short bursts are fine but nobody can rush in continuously. When you're turned away, you're told **when to come back** (`Retry-After`).
:::

::: text 📖 Detailed answer
Rate limiting protects against **brute force, credential stuffing, scraping, abuse, noisy neighbours and cost explosions**.

### Algorithms
| Algorithm | How it works | Memory | Behaviour |
|---|---|---|---|
| **Fixed window** | Counter per key per window (`ip:12:05`) | 1 counter | Simple; up to **2× limit** across a window boundary |
| **Sliding window log** | Timestamps of each request; count those in the last N s | 1 entry per request | Exact; memory-heavy for high limits |
| **Sliding window counter** | Weighted current + previous window counts | 2 counters | Close to exact, cheap ✅ |
| **Token bucket** | Bucket of N tokens refilling at R/s; each request takes one | 2 numbers | Allows bursts up to N, steady rate R ✅ (AWS API Gateway) |
| **Leaky bucket** | Queue drained at a fixed rate | Queue | Smooth output; adds latency |

### Simulated boundary burst (limit 5 per second; 10 requests at 900–990 ms, 10 at 1,000–1,090 ms)
| Algorithm | Allowed of 20 |
|---|---|
| Fixed window | **10** (5 before the boundary + 5 after) |
| Token bucket (capacity 5, 5/s) | **5** (the burst capacity; only 0.95 tokens refill in 190 ms) |

### What to key on
| Key | Good for | Caveat |
|---|---|---|
| IP | Anonymous traffic, login | NAT/offices share IPs; IPv6 rotation |
| User id | Logged-in usage | Not available before login |
| API key / plan | Partner APIs, pricing tiers | Must be authenticated |
| IP + email | Login brute force | Stops one attacker from locking everyone |

### Response contract
`429 Too Many Requests` with `Retry-After: <seconds>`, plus the IETF `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (or the combined `RateLimit`/`RateLimit-Policy` draft headers).
:::

::: diagram Token bucket
flowchart LR
  REF["refill R tokens per second"] --> B[("bucket, capacity N")]
  REQ["request"] --> CHK{"token available?"}
  B --> CHK
  CHK -->|"yes: take 1"| OK["allow"]
  CHK -->|"no"| NO["429 + Retry-After"]
:::

::: chart bar Simulated boundary burst: requests allowed out of 20 (limit 5 per second)
Algorithm,Allowed requests
Fixed window,10
Token bucket,5
:::

::: image Turnstiles: a counter that resets each minute vs a bucket of tokens that refills steadily
/images/rest-auth/rate-limiting.svg
:::

::: text 🪜 Step by step
A request to `/api/search` with the Redis sliding-window limiter below (limit 5 per 10 s for the demo):
1. Build the key from the user id (or IP if anonymous): `rl:search:u1`.
2. In one `MULTI`: remove timestamps older than 10 s (`ZREMRANGEBYSCORE`), add this request (`ZADD`), count (`ZCARD`), set an expiry (`PEXPIRE`).
3. Because the transaction is atomic, two servers incrementing at the same time can't both see "4".
4. Count ≤ 5 → set `RateLimit-*` headers and continue.
5. Count > 5 → find the oldest timestamp, compute when it leaves the window → `Retry-After`, respond **429**.
6. Without `REDIS_URL` the same limiter uses an in-process map (fine for one instance, wrong for several).
:::

::: code javascript express-rate-limit + a Redis sliding-window limiter (node rate-limit.js)
// How to run: npm install express express-rate-limit ioredis && node rate-limit.js
//             REDIS_URL=redis://localhost:6379 node rate-limit.js      (shared across several servers)
// Then: for i in $(seq 7); do curl -s -o /dev/null -w "%{http_code} " localhost:3000/api/search -H 'x-user-id: u1'; done
const express = require('express');
const { rateLimit } = require('express-rate-limit');

// ---- Sliding window log in Redis (or memory) ----
function createWindowStore() {
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    return {
      async hit(key, now, windowMs) {
        const [, , [, count], , [, oldest]] = await redis.multi()
          .zremrangebyscore(key, 0, now - windowMs)           // forget old requests
          .zadd(key, now, `${now}-${Math.random()}`)          // record this one
          .zcard(key)                                          // how many in the window?
          .pexpire(key, windowMs)
          .zrange(key, 0, 0, 'WITHSCORES')                     // oldest (for Retry-After)
          .exec();
        return { count, oldest: Number(oldest[1]) };
      },
    };
  }
  const map = new Map();
  return {
    async hit(key, now, windowMs) {
      const list = (map.get(key) || []).filter((t) => t > now - windowMs);
      list.push(now);
      map.set(key, list);
      return { count: list.length, oldest: list[0] };
    },
  };
}

function slidingWindowLimiter({ name, limit, windowMs, keyFn }) {
  const store = createWindowStore();
  return async (req, res, next) => {
    const now = Date.now();
    const { count, oldest } = await store.hit(`rl:${name}:${keyFn(req)}`, now, windowMs);
    const resetSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    res.set({ 'RateLimit-Limit': String(limit), 'RateLimit-Remaining': String(Math.max(0, limit - count)), 'RateLimit-Reset': String(resetSeconds) });
    if (count > limit) {
      res.set('Retry-After', String(resetSeconds));
      return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: resetSeconds });
    }
    return next();
  };
}

const app = express();
app.set('trust proxy', 1);                                       // otherwise every client looks like the proxy's IP
app.use(express.json());

// 1) Library limiter for the whole API (fixed window, in memory by default)
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));

// 2) Custom per-user sliding window on an expensive endpoint
app.get('/api/search', slidingWindowLimiter({ name: 'search', limit: 5, windowMs: 10_000, keyFn: (req) => req.get('x-user-id') || req.ip }),
  (req, res) => res.json({ results: ['a', 'b'] }));

// 3) Strict limiter for login, keyed by IP + email (slows brute force without locking everyone out)
app.post('/api/login', slidingWindowLimiter({ name: 'login', limit: 3, windowMs: 60_000, keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}` }),
  (req, res) => res.status(401).json({ error: 'Invalid email or password' }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT} (store: ${process.env.REDIS_URL ? 'redis' : 'memory'})`));
:::

::: code javascript Browser demo: fixed window vs token bucket at a window boundary (runnable)
function fixedWindow(limit, windowMs) {
  const counters = new Map();
  return (key, now) => {
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    const count = (counters.get(windowKey) || 0) + 1;
    counters.set(windowKey, count);
    return count <= limit;
  };
}
function tokenBucket(capacity, refillPerSec) {
  const buckets = new Map();
  return (key, now) => {
    const b = buckets.get(key) || { tokens: capacity, last: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
    b.last = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    buckets.set(key, b);
    return allowed;
  };
}

// 10 requests at 900..990 ms and 10 at 1000..1090 ms: a burst right across the 1-second boundary
const times = [...Array(10)].map((_, i) => 900 + i * 10).concat([...Array(10)].map((_, i) => 1000 + i * 10));
const fw = fixedWindow(5, 1000);
const tb = tokenBucket(5, 5);
const fixedAllowed = times.filter((t) => fw('ip1', t)).length;
const bucketAllowed = times.filter((t) => tb('ip1', t)).length;
console.log(`fixed window allowed ${fixedAllowed}/20 in 200 ms (2x the limit at the boundary)`, fixedAllowed === 10 ? '✅' : '❌ FAIL');
console.log(`token bucket allowed ${bucketAllowed}/20 (burst capacity 5; refill too slow for a 6th)`, bucketAllowed === 5 ? '✅' : '❌ FAIL');
const later = tokenBucket(5, 5);
[0, 0, 0, 0, 0].forEach((t) => later('k', t));
console.log('bucket refills over time: allowed again after 1 s', later('k', 1000) === true ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- In-memory counters with several instances → the real limit is `limit × instances`.
- Missing `trust proxy` behind a load balancer → everyone shares one IP and one limit.
- Only IP-based limits (offices/NAT share IPs) or only per-email limits on login (attacker locks out victims).
- Returning 429 without `Retry-After`, so clients hammer immediately.
- Non-atomic "read count, then increment" in Redis → races let extra requests through.
:::

::: understand
- Rate limiting is **capacity management + abuse prevention**; the algorithm decides how bursts feel to users.
- Limits belong at several layers; the app layer knows *who* the user is and *how expensive* an endpoint is.
- Clients should treat 429 as normal: back off and retry after the indicated time.
:::

::: ask
- *"Limit per IP, per user or per API key? Different plans?"*
- *"One instance or many?"* → Redis or the gateway.
- *"Are we behind a proxy/CDN?"* → `trust proxy`, real client IP headers.
:::

::: important ⭐ Say this in the interview
"Rate limiting counts requests per key, such as user id, API key or IP, per time window and returns 429 with Retry-After and RateLimit headers when the limit is exceeded. Fixed windows are simple but let roughly double the limit through around a window boundary; in a small simulation with a limit of five per second, a fixed window allowed ten of twenty requests sent around a window boundary, while a token bucket allowed five. Sliding windows are smooth and token buckets allow controlled bursts. With several instances the counters must live in Redis using atomic operations, and behind a load balancer I set trust proxy so the real client IP is used. I layer limits at the CDN or gateway and in the app, with much stricter limits on login, OTP and signup, keyed by IP plus email."
:::

::: links
express-rate-limit | https://github.com/express-rate-limit/express-rate-limit
IETF draft: RateLimit header fields | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
Cloudflare: How we built rate limiting | https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
MDN: 429 Too Many Requests | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429
:::

=== How do you prevent duplicate requests?
@p 2
@tags idempotency, double-submit, locking
@quick
- Duplicates come from double clicks, retries after timeouts, refresh/back, and at-least-once queues.
- **Frontend (UX)**: disable the button while pending, one idempotency key per user action, abort stale requests.
- **Backend (guarantee)**: Idempotency-Key + stored response, **unique indexes**, **atomic conditional updates**, distributed locks for multi-step sections.
- Measured on MongoDB: 20 concurrent "pay" requests → **19.6 charges** with read-then-write vs **exactly 1** with `findOneAndUpdate({ status: 'PENDING' })`.
- Message queues: idempotent consumers + dedupe ids (SQS FIFO deduplication).

::: text 🧒 In simple words
Imagine **twenty cashiers** all looking at the same unpaid bill at the same moment. Each one checks "is it unpaid? yes!" and then charges the customer: twenty charges for one bill. The fix is to make "check and mark as paid" **one single motion** that only one cashier can win, like grabbing the only pen. In databases that single motion is an **atomic conditional update**: "set status to PAID **only if** it's still PENDING". Everyone else's attempt simply finds nothing to update.
:::

::: text 📖 Detailed answer
### Where duplicates come from
| Source | Example |
|---|---|
| Double click / impatient user | Two "Place order" clicks |
| Client/SDK retry after timeout | The first request actually succeeded |
| Browser refresh / back after POST | Form resubmission |
| Load balancer / gateway retries | Upstream timeout |
| Queues (SQS, Kafka) | At-least-once delivery |

### Backend techniques (the real guarantees)
| Technique | Stops | Example |
|---|---|---|
| **Idempotency-Key** | Retries of the same action | Stored response replayed (see the idempotency question) |
| **Unique index** | Duplicate inserts, even under races | `{ userId: 1, clientRequestId: 1 }` unique → `E11000` → return the existing record |
| **Atomic conditional update** | Concurrent state transitions | `findOneAndUpdate({ _id, status: 'PENDING' }, { $set: { status: 'PROCESSING' } })` |
| **Distributed lock** | Multi-step critical sections across servers | Redis `SET lock:order:42 <token> NX PX 10000` + safe release |
| **Optimistic concurrency** | Lost updates | `version` field / `If-Match` |

### Measured: the race (MongoDB 7, 20 concurrent requests, 5 runs)
| Approach | Average successful "charges" |
|---|---|
| `findOne` → check status → `updateOne` (read-then-write) | **19.6** |
| `findOneAndUpdate({ status: 'PENDING' }, …)` (atomic claim) | **1** |
:::

::: diagram Read-then-write race vs atomic claim
sequenceDiagram
  participant A as Request A
  participant B as Request B
  participant DB as MongoDB
  A->>DB: findOne order 42
  B->>DB: findOne order 42
  DB-->>A: PENDING
  DB-->>B: PENDING
  A->>DB: charge + set PAID
  B->>DB: charge + set PAID (double charge)
  Note over A,DB: Atomic version
  A->>DB: findOneAndUpdate status PENDING to PROCESSING
  B->>DB: findOneAndUpdate status PENDING to PROCESSING
  DB-->>A: document (A wins)
  DB-->>B: null (409, nothing to do)
:::

::: chart bar Measured: charges from 20 concurrent pay requests (MongoDB 7, average of 5 runs)
Approach,Charges
Read-then-write,19.6
Atomic conditional update,1
:::

::: image Twenty cashiers and one bill: only an atomic check-and-mark lets exactly one win
/images/rest-auth/duplicate-requests.svg
:::

::: text 🪜 Step by step
What the server below does for 20 concurrent `POST /orders/:id/pay-safe` requests:
1. Every request runs `findOneAndUpdate({ _id, status: 'PENDING' }, { $set: { status: 'PROCESSING' } })`.
2. MongoDB applies updates to a single document **atomically**: the first one to run changes the status; the other 19 find no document matching `status: 'PENDING'` and get `null`.
3. The winner calls the payment provider, then sets `status: 'PAID'` and increments `charges`.
4. The 19 losers respond **409** "Order already being processed or paid".
5. `POST /orders` with the same `clientRequestId` twice: the second insert fails with `E11000` from the unique index → the handler returns the **existing** order (200) instead of creating another.
6. `/pay-unsafe` shows the bug: 20 parallel reads all see `PENDING` and all "charge".
:::

::: code javascript Unique index + atomic claim + Redis lock, measured against the unsafe version (node duplicates.js)
// How to run: npm install express mongodb ioredis && MONGO_URI=mongodb://localhost:27017/dupes node duplicates.js
// Then: curl -s -X POST localhost:3000/demo/race      (runs 20 parallel payments both ways and reports charges)
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dupes');
  const orders = client.db().collection('orders');
  await orders.createIndex({ userId: 1, clientRequestId: 1 }, { unique: true });   // duplicate inserts are impossible

  const app = express();
  app.use(express.json());

  // 1) Create once per clientRequestId (generated by the frontend per checkout)
  app.post('/orders', async (req, res) => {
    const doc = { userId: 'u1', clientRequestId: String(req.body?.clientRequestId || ''), total: 50, status: 'PENDING', charges: 0 };
    if (!doc.clientRequestId) return res.status(400).json({ error: 'clientRequestId required' });
    try {
      const { insertedId } = await orders.insertOne(doc);
      return res.status(201).json({ ...doc, _id: insertedId });
    } catch (err) {
      if (err.code !== 11000) throw err;
      return res.status(200).json(await orders.findOne({ userId: 'u1', clientRequestId: doc.clientRequestId }));   // the original
    }
  });

  // 2a) UNSAFE: read, check, then write → every concurrent request passes the check
  app.post('/orders/:id/pay-unsafe', async (req, res) => {
    const _id = new ObjectId(req.params.id);
    const order = await orders.findOne({ _id });
    if (order.status !== 'PENDING') return res.status(409).json({ error: 'Already paid' });
    await sleep(5);                                                                 // payment provider call
    await orders.updateOne({ _id }, { $set: { status: 'PAID' }, $inc: { charges: 1 } });
    return res.json({ ok: true });
  });

  // 2b) SAFE: claim the state transition atomically; only one request can win
  app.post('/orders/:id/pay-safe', async (req, res) => {
    const _id = new ObjectId(req.params.id);
    const claimed = await orders.findOneAndUpdate({ _id, status: 'PENDING' }, { $set: { status: 'PROCESSING' } });
    if (!claimed) return res.status(409).json({ error: 'Order already being processed or paid' });
    await sleep(5);
    await orders.updateOne({ _id }, { $set: { status: 'PAID' }, $inc: { charges: 1 } });
    return res.json({ ok: true });
  });

  // 3) Demo endpoint: fire 20 parallel requests at each version
  app.post('/demo/race', async (req, res) => {
    const port = server.address().port;
    const result = {};
    for (const mode of ['pay-unsafe', 'pay-safe']) {
      const { insertedId } = await orders.insertOne({ userId: 'u1', clientRequestId: `race-${mode}-${Date.now()}`, status: 'PENDING', charges: 0 });
      await Promise.all(Array.from({ length: 20 }, () => fetch(`http://127.0.0.1:${port}/orders/${insertedId}/${mode}`, { method: 'POST' })));
      result[mode] = (await orders.findOne({ _id: insertedId })).charges;
    }
    res.json({ chargesFor20ParallelRequests: result });
  });

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}

// Distributed lock for multi-step sections across servers (Redis SET NX PX + safe release)
async function withLock(redis, key, ttlMs, fn) {
  const token = require('crypto').randomUUID();
  if ((await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX')) !== 'OK') throw Object.assign(new Error('Busy'), { status: 409 });
  try {
    return await fn();
  } finally {
    // delete only if we still own the lock (atomic check-and-delete in Lua)
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `lock:${key}`, token);
  }
}
module.exports = { withLock };

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code jsx Frontend: disable while pending + one key per checkout (CheckoutButton.jsx)
import { useMemo, useState } from 'react';

export function CheckoutButton({ cartId }) {
  const clientRequestId = useMemo(() => crypto.randomUUID(), [cartId]);   // same id for every retry of this checkout
  const [state, setState] = useState('idle');

  const placeOrder = async () => {
    if (state === 'pending') return;                                      // ignore double clicks
    setState('pending');
    try {
      const res = await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({ cartId, clientRequestId }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');                                                  // safe to retry: same key
    }
  };

  return (
    <button type="button" onClick={placeOrder} disabled={state === 'pending' || state === 'done'}>
      {state === 'pending' ? 'Placing order…' : state === 'done' ? 'Order placed ✓' : 'Place order'}
    </button>
  );
}
:::

::: code javascript Browser demo: the race, simulated with real concurrency (runnable)
// Shared "database" with async reads/writes, then 20 concurrent payment attempts.
function createShop() {
  const order = { status: 'PENDING', charges: 0 };
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  return {
    order,
    async read() { await tick(); return { ...order }; },
    async write(patch) { await tick(); Object.assign(order, patch); },
    async claim(from, to) { await tick(); if (order.status !== from) return false; order.status = to; return true; },   // atomic in the DB
  };
}

async function payUnsafe(shop) {
  const o = await shop.read();
  if (o.status !== 'PENDING') return false;
  await shop.write({ status: 'PAID', charges: shop.order.charges + 1 });
  return true;
}
async function paySafe(shop) {
  if (!(await shop.claim('PENDING', 'PROCESSING'))) return false;
  await shop.write({ status: 'PAID', charges: shop.order.charges + 1 });
  return true;
}

(async () => {
  const unsafeShop = createShop();
  const unsafeWins = (await Promise.all(Array.from({ length: 20 }, () => payUnsafe(unsafeShop)))).filter(Boolean).length;
  const safeShop = createShop();
  const safeWins = (await Promise.all(Array.from({ length: 20 }, () => paySafe(safeShop)))).filter(Boolean).length;
  console.log(`read-then-write: ${unsafeWins} requests "charged"`, unsafeWins > 1 ? '✅ (bug reproduced)' : '❌ FAIL');
  console.log(`atomic claim: ${safeWins} request charged`, safeWins === 1 && safeShop.order.status === 'PAID' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Relying only on disabling the button (retries, refreshes and scripts bypass it).
- "Check if exists, then insert" without a unique index (races still create duplicates).
- Read-then-write status changes instead of a conditional atomic update.
- Redis locks without expiry (deadlock) or released without checking ownership (deleting someone else's lock).
- Non-idempotent queue consumers ("send email" twice on redelivery).
:::

::: understand
- The database is the only place that sees all concurrent requests in order, so the **final guarantee belongs in the database** (unique indexes, conditional updates).
- Frontend measures improve UX; backend measures provide correctness.
- Prefer atomic single-document operations; reach for distributed locks only for multi-step work across resources.
:::

::: ask
- *"What's the cost of a duplicate?"* Payments → strict; likes/views → dedupe loosely.
- *"How long is the dedupe window?"* (key TTL, index lifetime).
- *"Are there queues or webhooks?"* → idempotent consumers keyed by event id.
:::

::: important ⭐ Say this in the interview
"Duplicates come from double clicks, retries after timeouts, refreshes and at-least-once queues, so I handle them on both sides. The frontend disables the button while pending and sends one idempotency key per user action. The real guarantees are in the backend: an idempotency key with a stored response for retries, unique indexes so a duplicate insert fails and I return the original, and atomic conditional updates for state changes. In a test with twenty concurrent pay requests against MongoDB, a read-then-write check charged the order almost twenty times, while findOneAndUpdate with status PENDING in the filter let exactly one through. For multi-step sections across services I use a Redis lock with an expiry and a safe, ownership-checked release, and queue consumers are idempotent by event id."
:::

::: links
MongoDB: Atomicity and transactions | https://www.mongodb.com/docs/manual/core/write-operations-atomicity/
MongoDB: Unique indexes | https://www.mongodb.com/docs/manual/core/index-unique/
Redis: Distributed locks | https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
:::
