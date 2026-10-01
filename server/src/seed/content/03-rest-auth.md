@section REST APIs & Authentication
@icon 🌐
@color #0ea5e9
@desc REST principles, HTTP methods & status codes, idempotency, JWT vs sessions, token storage, API security, rate limiting.

=== What makes an API RESTful?
@p 3
@tags rest, api-design
@quick
- REST = architectural style: **resources** identified by **URLs**, manipulated with **HTTP methods**, returning **representations** (JSON).
- 6 constraints: **client–server, stateless, cacheable, uniform interface, layered system, (code on demand)**.
- Nouns in URLs (`/users/42/orders`), verbs are HTTP methods; plural resource names.
- **Stateless**: every request carries everything needed (e.g. a token); the server keeps no session memory.
- Use proper status codes, filtering via query params, versioning, and HATEOAS (rarely used in practice).

::: text
**REST (Representational State Transfer)** is an architectural style defined by Roy Fielding (2000). An API is RESTful when it follows these constraints:

| Constraint | Meaning | Practical impact |
|---|---|---|
| **Client–server** | UI and data storage are separated | React and Node evolve independently |
| **Stateless** | Each request contains all the info needed; the server stores no client context between requests | Easy **horizontal scaling** (any server can handle any request) |
| **Cacheable** | Responses declare whether they're cacheable | `Cache-Control`, `ETag` → CDN/browser caching |
| **Uniform interface** | Resources identified by URIs, manipulated via representations, self-descriptive messages, HATEOAS | Predictable API: `GET /users/1`, `DELETE /users/1` |
| **Layered system** | Client doesn't know if it talks to the server, a load balancer or a CDN | Nginx, API gateway, CDN can be inserted |
| **Code on demand** (optional) | Server can send executable code | Rarely used |

### Resource design rules
- Use **nouns, not verbs**: `POST /orders` ✅, not `POST /createOrder` ❌
- **Plural** collections: `/users`, `/users/{id}`
- **Nesting** for relationships (max ~2 levels): `/users/{id}/orders`
- **Query params** for filtering, sorting and pagination: `/orders?status=paid&sort=-createdAt&page=2`
- Actions that don't map to CRUD → a sub-resource: `POST /orders/{id}/cancel` or `POST /payments/{id}/refunds`
- Use **kebab-case** in URLs, **camelCase** in JSON (be consistent)
:::

::: diagram Resource-oriented URL design
flowchart LR
  A["GET /users"] --- B["list"]
  C["POST /users"] --- D["create"]
  E["GET /users/42"] --- F["read one"]
  G["PATCH /users/42"] --- H["partial update"]
  I["DELETE /users/42"] --- J["delete"]
  K["GET /users/42/orders?status=paid"] --- L["nested + filter"]
:::

::: code javascript RESTful routes for an orders resource (Express)
const router = require('express').Router();

router.get('/orders', listOrders);                 // 200 + paginated list
router.post('/orders', createOrder);               // 201 + Location header
router.get('/orders/:id', getOrder);               // 200 | 404
router.put('/orders/:id', replaceOrder);           // 200 | 404  (full replace)
router.patch('/orders/:id', updateOrder);          // 200 | 404  (partial)
router.delete('/orders/:id', deleteOrder);         // 204 | 404
router.post('/orders/:id/cancel', cancelOrder);    // action as sub-resource → 200 | 409 if already shipped
router.get('/users/:userId/orders', listUserOrders); // relationship

async function createOrder(req, res) {
  const order = await orderService.create(req.user.id, req.body);
  res.status(201).location(`/api/v1/orders/${order.id}`).json({ data: order });
}
:::

::: understand
- "Stateless" doesn't mean "no database". It means **no per-client session state in server memory** between requests.
- Most real APIs are "REST-ish" (Level 2 of the Richardson Maturity Model: resources + HTTP verbs + status codes). Full HATEOAS (Level 3) is rare. Say this honestly.
- Know the alternatives: **GraphQL** (client chooses fields, one endpoint, avoids over/under-fetching) and **gRPC** (binary, fast, service-to-service).
:::

::: ask
- *"Is this a public API or internal for our frontend?"* Internal APIs may use a BFF pattern tailored to the UI.
- *"Do we need GraphQL-style flexible querying, or is REST fine?"*
:::

::: links
Richardson Maturity Model (Martin Fowler) | https://martinfowler.com/articles/richardsonMaturityModel.html
Microsoft REST API design best practices | https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
:::

=== GET vs POST vs PUT vs PATCH vs DELETE
@p 3
@tags http, methods
@quick
- **GET** read (safe, idempotent, cacheable, no body) · **POST** create/action (not idempotent) · **PUT** replace whole resource (idempotent) · **PATCH** partial update (not guaranteed idempotent) · **DELETE** remove (idempotent).
- Safe = no side effects (GET, HEAD, OPTIONS).
- POST success → **201 Created** + `Location`; DELETE success → **204 No Content**.
- Never change data with GET (crawlers/prefetch will trigger it).

::: text
| Method | Purpose | Request body | Safe | Idempotent | Cacheable | Typical success code |
|---|---|---|---|---|---|---|
| **GET** | Read a resource / collection | No | ✅ | ✅ | ✅ | 200 |
| **POST** | Create a resource or trigger an action | Yes | ❌ | ❌ | rarely | 201 (created) / 200 / 202 |
| **PUT** | **Replace** the whole resource (or create at a known URL) | Yes (full) | ❌ | ✅ | ❌ | 200 / 204 (201 if created) |
| **PATCH** | **Partially** update | Yes (partial) | ❌ | ⚠️ not guaranteed | ❌ | 200 / 204 |
| **DELETE** | Remove | Usually no | ❌ | ✅ | ❌ | 204 / 200 |
| HEAD | Like GET, headers only | No | ✅ | ✅ | ✅ | 200 |
| OPTIONS | Supported methods / **CORS preflight** | No | ✅ | ✅ | ❌ | 204 |

- **Safe** = doesn't modify server state.
- **Idempotent** = making the same request N times has the **same effect** as making it once.
:::

::: code bash Try the full CRUD with curl
# Create
curl -X POST http://localhost:3000/api/v1/users -H "Content-Type: application/json" -d '{"name":"Vivek","email":"v@x.com"}'
# Read
curl http://localhost:3000/api/v1/users/66f1c0...
# Full replace
curl -X PUT http://localhost:3000/api/v1/users/66f1c0... -H "Content-Type: application/json" -d '{"name":"Vivek S","email":"v@x.com","role":"user"}'
# Partial update
curl -X PATCH http://localhost:3000/api/v1/users/66f1c0... -H "Content-Type: application/json" -d '{"name":"Vivek Singh"}'
# Delete
curl -i -X DELETE http://localhost:3000/api/v1/users/66f1c0...   # → HTTP/1.1 204 No Content
:::

::: ask
- *"Should creating an item with a client-generated id use PUT?"* Yes, PUT to a known URL (`PUT /files/{uuid}`) is idempotent and can create.
- *"Can GET have a body?"* Technically allowed but ignored by many servers/proxies. Don't rely on it; use POST `/search` for complex queries.
:::

::: links
MDN: HTTP request methods | https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
:::

=== PUT vs PATCH
@p 3
@tags http, put, patch
@quick
- **PUT** = replace the **entire** resource; missing fields get removed/defaulted. **Idempotent.**
- **PATCH** = apply **partial** changes; only the sent fields change.
- PATCH is not guaranteed idempotent (e.g. `{ "op": "increment" }`), but a "set field" PATCH is.
- In Mongo: PUT → `replaceOne` / `findOneAndReplace`; PATCH → `updateOne` with `$set`.
- Most apps use PATCH for edit forms.

::: text
Imagine the stored user: `{ name: "Vivek", email: "v@x.com", city: "Delhi" }`

- `PUT /users/1` with `{ name: "Vivek S", email: "v@x.com" }` → the result is `{ name: "Vivek S", email: "v@x.com" }`. **City is gone**, because PUT replaces the whole representation.
- `PATCH /users/1` with `{ name: "Vivek S" }` → the result is `{ name: "Vivek S", email: "v@x.com", city: "Delhi" }`. Only the name changed.

| | PUT | PATCH |
|---|---|---|
| Semantics | Replace | Modify |
| Body | Full resource | Only changed fields (or JSON Patch ops) |
| Idempotent | ✅ Always | ⚠️ Depends on the operation |
| Mongo | `replaceOne()` | `updateOne({ $set })`, `$inc`, `$push` |

**Formats for PATCH:** JSON Merge Patch (RFC 7396, the simple partial object; the most common) or JSON Patch (RFC 6902, a list of operations: `[{ "op": "replace", "path": "/name", "value": "X" }]`).
:::

::: code javascript Try it: PUT vs PATCH on an object
const db = { 1: { name: 'Vivek', email: 'v@x.com', city: 'Delhi', balance: 100 } };

const put = (id, body) => (db[id] = { ...body });              // replace
const patch = (id, body) => (db[id] = { ...db[id], ...body });  // merge

patch(1, { name: 'Vivek S' });
console.log('after PATCH:', db[1]);

put(1, { name: 'Vivek Singh', email: 'v@x.com' });
console.log('after PUT  :', db[1], '← city & balance removed');

// Non-idempotent PATCH (operation-style)
const incBalance = (id, amt) => (db[id].balance = (db[id].balance || 0) + amt);
console.log('1st increment →', incBalance(1, 50));
console.log('2nd increment →', incBalance(1, 50), '(state changes on every call = NOT idempotent)');
:::

::: code javascript Express + Mongoose implementation
// PUT: full replace (validate the FULL body)
router.put('/users/:id', validate(fullUserSchema), async (req, res) => {
  const user = await User.findOneAndReplace({ _id: req.params.id }, req.body, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// PATCH: partial update (allowlist fields → prevents mass assignment)
const EDITABLE = ['name', 'city', 'avatarUrl'];
router.patch('/users/:id', async (req, res) => {
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => EDITABLE.includes(k)));
  const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});
:::

::: ask
- *"Which fields can the client update?"* Always allowlist, so a user can't PATCH `{ role: 'admin' }`.
- *"Do we need optimistic concurrency?"* Use `If-Match: <ETag>` or a `version` field → 409/412 if another user changed it first.
:::

::: links
RFC 7396 JSON Merge Patch | https://www.rfc-editor.org/rfc/rfc7396
RFC 6902 JSON Patch | https://www.rfc-editor.org/rfc/rfc6902
:::

=== What are HTTP status codes? (the ones you must know)
@p 3
@tags http, status-codes
@quick
- **2xx success**: 200 OK · 201 Created · 202 Accepted (async job) · 204 No Content
- **3xx redirect**: 301 permanent · 302/307 temporary · 304 Not Modified (cache)
- **4xx client error**: 400 bad input · 401 not authenticated · 403 not allowed · 404 not found · 409 conflict · 422 validation · 429 rate limited
- **5xx server error**: 500 bug · 502 bad gateway (upstream down) · 503 unavailable · 504 gateway timeout
- **401 = who are you? 403 = I know you, but no.**

::: text
| Code | Name | When to use |
|---|---|---|
| **200** | OK | Successful GET, PUT, PATCH |
| **201** | Created | Successful POST that created a resource (+ `Location` header) |
| **202** | Accepted | Request queued for async processing (e.g. video transcoding, report generation) |
| **204** | No Content | Successful DELETE / update with no body |
| **301 / 308** | Moved Permanently | URL changed forever (SEO) |
| **302 / 307** | Found / Temporary Redirect | Temporary redirect (307 keeps the method) |
| **304** | Not Modified | Client cache still valid (`ETag` / `If-None-Match`) |
| **400** | Bad Request | Malformed JSON, invalid params |
| **401** | Unauthorized | Missing/invalid/expired credentials (really "unauthenticated") |
| **403** | Forbidden | Authenticated but lacks permission |
| **404** | Not Found | Resource doesn't exist (also used to hide a resource's existence) |
| **405** | Method Not Allowed | e.g. DELETE on a read-only endpoint |
| **409** | Conflict | Duplicate email, version conflict, invalid state transition |
| **413** | Payload Too Large | Upload exceeds the limit |
| **415** | Unsupported Media Type | Wrong `Content-Type` |
| **422** | Unprocessable Entity | Well-formed but semantically invalid |
| **429** | Too Many Requests | Rate limit exceeded (+ `Retry-After`) |
| **500** | Internal Server Error | Unhandled exception / bug |
| **502** | Bad Gateway | Nginx/ALB got an invalid response from Node (app crashed) |
| **503** | Service Unavailable | Overloaded / maintenance / DB down |
| **504** | Gateway Timeout | Upstream (Node) too slow for the proxy |
:::

::: chart bar Where each class of error comes from (who should fix it)
Class,Client should fix,Server should fix
2xx,0,0
4xx,10,0
5xx,0,10
:::

::: tip
Debugging in production: **502** from Nginx/ALB usually means **the Node process crashed or isn't listening**. **504** means **it's too slow** (increase the timeout or optimise the query). Mentioning this shows real experience.
:::

::: ask
- *"Does the team use 400 or 422 for validation errors?"*
- *"Should a user accessing another user's resource get 403 or 404?"* 404 hides the resource's existence, which is more secure.
:::

::: links
MDN: HTTP response status codes | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
http.cat (fun visual cheat sheet) | https://http.cat
:::

=== What is idempotency?
@p 3
@tags idempotency, reliability, payments
@quick
- **Idempotent** = doing it **once or N times** leaves the server in the **same state**.
- GET, PUT, DELETE, HEAD, OPTIONS are idempotent; **POST is not**; PATCH depends.
- Matters because networks fail → clients/proxies **retry** → a non-idempotent retry = **double charge / duplicate order**.
- Make POST idempotent with an **Idempotency-Key** header stored with the result (Stripe pattern) + unique DB index.
- Idempotent ≠ same response (DELETE twice → 204 then 404, but the state is the same).

::: text
An operation is **idempotent** if performing it multiple times has the **same effect on server state** as performing it once.

- `DELETE /orders/5` → the first call deletes it; the second returns 404. The **state** is the same (order gone), so it's ✅ idempotent.
- `PUT /users/1 { name: "A" }` → the result is always name = A ✅
- `POST /orders` → every call creates a **new** order ❌
- `PATCH /account { $inc: balance 100 }` → each call adds 100 ❌

### Why interviewers care
Timeouts are ambiguous: *did the server process my payment or not?* Clients, SDKs, load balancers and message queues **retry**. Without idempotency, retries cause **duplicate payments, orders and emails**.

### How to make POST idempotent: the Idempotency Key pattern
1. The client generates a unique key (UUID) **per logical operation** and sends `Idempotency-Key: <uuid>`.
2. The server checks the store (Redis/Mongo) for that key:
   - **Not seen** → mark it "processing", execute, save the **response** with the key (TTL e.g. 24h).
   - **Seen & completed** → return the **saved response** without executing again.
   - **Seen & processing** → return **409** (a concurrent duplicate).
3. Add a **unique index** as a safety net (e.g. on `orders.idempotencyKey`).
:::

::: diagram Idempotency key flow
sequenceDiagram
  participant C as Client
  participant S as API
  participant R as Redis / DB
  C->>S: POST /payments (Idempotency-Key: abc)
  S->>R: SET abc "processing" NX
  R-->>S: OK (first time)
  S->>S: charge card
  S->>R: save response for abc
  S--xC: 201 (response lost: network timeout)
  C->>S: RETRY POST /payments (Idempotency-Key: abc)
  S->>R: GET abc
  R-->>S: stored response
  S-->>C: 201 same payment (no double charge)
:::

::: code javascript Idempotency middleware (Express + Redis)
const redis = require('./redisClient'); // ioredis

function idempotency({ ttlSeconds = 86400 } = {}) {
  return async (req, res, next) => {
    const key = req.header('Idempotency-Key');
    if (!key) return res.status(400).json({ message: 'Idempotency-Key header required' });
    const redisKey = `idem:${req.user.id}:${key}`; // scope per user

    // NX = only set if not exists → atomic "claim"
    const claimed = await redis.set(redisKey, JSON.stringify({ status: 'processing' }), 'EX', ttlSeconds, 'NX');
    if (!claimed) {
      const saved = JSON.parse(await redis.get(redisKey));
      if (saved.status === 'processing') return res.status(409).json({ message: 'Request already in progress' });
      return res.status(saved.statusCode).set('Idempotent-Replayed', 'true').json(saved.body);
    }

    // capture the response to store it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const record = res.statusCode < 500
        ? redis.set(redisKey, JSON.stringify({ status: 'done', statusCode: res.statusCode, body }), 'EX', ttlSeconds)
        : redis.del(redisKey); // allow retry after server errors
      record.catch(console.error);
      return originalJson(body);
    };
    next();
  };
}

router.post('/payments', authenticate, idempotency(), createPayment);
:::

::: code javascript Try it: simulate retries with and without an idempotency key
const store = new Map();
let charges = 0;

function chargeCard(amount) { charges++; return { paymentId: `pay_${charges}`, amount }; }

function postPayment(body, idemKey) {
  if (idemKey && store.has(idemKey)) return { replayed: true, ...store.get(idemKey) };
  const result = chargeCard(body.amount);
  if (idemKey) store.set(idemKey, result);
  return result;
}

// Client retries 3 times because of timeouts
for (let i = 0; i < 3; i++) postPayment({ amount: 500 });
console.log('without key → charges:', charges);

charges = 0;
const key = 'uuid-123';
for (let i = 0; i < 3; i++) console.log(postPayment({ amount: 500 }, key));
console.log('with key → charges:', charges);
:::

::: ask
- *"What's the scope of a key: per user? per endpoint?"* *"How long do we keep keys?"* (Stripe keeps them 24h.)
- *"What if the same key comes with a different body?"* Return **422**, since the key was reused incorrectly. Store a hash of the body.
- Mention **message queues**: consumers should also be idempotent, because SQS/Kafka deliver **at least once**.
:::

::: links
Stripe: Idempotent requests | https://docs.stripe.com/api/idempotent_requests
MDN: Idempotent | https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
:::

=== JWT vs session-based authentication
@p 3
@tags auth, jwt, session
@quick
- **Session**: server stores session data (Redis/DB), client holds only an opaque **session id cookie**. Easy revoke, stateful.
- **JWT**: signed token contains claims; server **verifies the signature** with no lookup. Stateless, scales easily, **hard to revoke**.
- JWT best practice: short access token (5–15 min) + rotating refresh token in an **httpOnly cookie**.
- Sessions: great for classic web apps / same domain. JWT: SPAs + mobile + microservices / multiple APIs.
- Both need HTTPS; cookies need `HttpOnly`, `Secure`, `SameSite` + CSRF protection.

::: text
### Session-based
1. Login → the server creates a session `{ userId, role }` in **Redis / DB** and sends `Set-Cookie: sid=abc123; HttpOnly; Secure`.
2. The browser sends the cookie automatically → the server **looks up** the session each request.
3. Logout → **delete the session**, and it's revoked instantly.

### JWT-based
1. Login → the server signs a token `header.payload.signature` with its secret/private key.
2. The client sends `Authorization: Bearer <jwt>` (or a cookie).
3. The server **verifies the signature + `exp`**, with no DB lookup, so it's **stateless**.
4. Logout → the token stays valid until expiry unless you maintain a **denylist**.

| | Session | JWT |
|---|---|---|
| State | Stored on server | In the token (stateless) |
| Scalability | Needs a shared store (Redis) across servers | Any server with the key can verify |
| Revocation | ✅ Instant (delete session) | ❌ Hard (short expiry / denylist / token version) |
| Size | Tiny cookie | Larger (claims + signature) on every request |
| Cross-domain / mobile / microservices | Harder | ✅ Easy |
| Main risk | CSRF (cookie auto-sent) | XSS if stored in localStorage; token theft |

**A common production hybrid:** a short-lived **JWT access token** (in memory) plus a **refresh token** in an httpOnly cookie that's stored and rotated on the server. This gets stateless verification **and** revocation.
:::

::: diagram
flowchart TB
  subgraph Session["Session-based"]
    B1["Browser: cookie sid=abc"] --> S1["Server"] --> R1[("Redis: abc = user 42")]
  end
  subgraph JWT["JWT-based"]
    B2["Client: Bearer eyJ..."] --> S2["Server: verify signature + exp"]
    S2 -.->|"no DB lookup"| X["req.user = payload"]
  end
:::

::: code javascript Decode a JWT yourself (shows it is NOT encrypted)
// header.payload.signature  — each part is base64url
const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiI0MiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwOTAwfQ.' +
  'signature-here';

const decodePart = (part) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
const [header, payload] = token.split('.').slice(0, 2).map(decodePart);
console.log('header :', header);
console.log('payload:', payload);
console.log('expires:', new Date(payload.exp * 1000).toISOString());
console.log('Anyone can read this → never put passwords/PII in a JWT. The SIGNATURE only prevents tampering.');
:::

::: code javascript Session auth with express-session + Redis
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

app.post('/login', async (req, res) => {
  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  req.session.regenerate(() => {          // prevent session fixation
    req.session.user = { id: user.id, role: user.role };
    res.json({ ok: true });
  });
});

app.post('/logout', (req, res) => req.session.destroy(() => res.clearCookie('sid').status(204).end()));

const requireLogin = (req, res, next) => (req.session.user ? next() : res.status(401).json({ message: 'Login required' }));
:::

::: ask
- *"Who are the clients: browser only, mobile, third-party?"* *"Do we need instant revocation (banking, admin)?"* *"Multiple services verifying tokens?"*
- If they say "JWT is stateless so it's better", challenge politely: **revocation and XSS storage** are real trade-offs.
:::

::: links
OWASP Session management cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
OWASP JWT cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
jwt.io debugger | https://jwt.io
:::

=== Where should JWTs be stored?
@p 3
@tags jwt, security, xss, csrf
@quick
- **localStorage**: easy, but readable by any JS → **XSS steals it**. ❌ for sensitive apps.
- **httpOnly + Secure + SameSite cookie**: JS can't read it (XSS-safe) but auto-sent → needs **CSRF protection** (SameSite, CSRF token).
- **Recommended**: access token **in memory** (React state/closure), refresh token in an **httpOnly cookie** scoped to `/auth/refresh`; on page reload call refresh.
- Short expiry + refresh token rotation limit the damage of theft.
- XSS defeats every storage option to some degree, so prevent XSS (CSP, escaping, no `dangerouslySetInnerHTML` with user input).

::: text
| Storage | XSS risk | CSRF risk | Survives reload | Verdict |
|---|---|---|---|---|
| `localStorage` / `sessionStorage` | ❌ **High**: any injected script can read it | ✅ None (not auto-sent) | ✅ | Avoid for sensitive apps |
| **httpOnly cookie** | ✅ JS can't read it | ⚠️ Auto-sent, so mitigate with `SameSite=Lax/Strict` + CSRF token | ✅ | ✅ Good |
| **In-memory** (JS variable) | Lower (not persistent; still usable by XSS while the page is open) | ✅ None | ❌ (use refresh) | ✅ Good for access token |

### Recommended pattern for a React SPA
1. Login → the server returns an **access token (15 min)** in the JSON body and sets a **refresh token** cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh`.
2. React keeps the access token **in memory** (context / Zustand / an axios closure), never in localStorage.
3. An Axios interceptor attaches `Authorization: Bearer <access>`.
4. On a **401 TOKEN_EXPIRED** or page reload → call `POST /api/auth/refresh` (the cookie is sent automatically) → get a new access token (and a **rotated** refresh token).
5. Logout → the server revokes the refresh token and clears the cookie.

**Cookie flags:** `HttpOnly` (no JS access), `Secure` (HTTPS only), `SameSite=Strict|Lax` (CSRF protection), a narrow `Path`, and `Max-Age`.
:::

::: diagram Refresh flow in a React SPA
sequenceDiagram
  participant R as React (token in memory)
  participant A as API
  R->>A: GET /orders (Bearer access)
  A-->>R: 401 TOKEN_EXPIRED
  R->>A: POST /auth/refresh (httpOnly cookie auto-sent)
  A->>A: verify + rotate refresh token
  A-->>R: new access token (+ new refresh cookie)
  R->>A: retry GET /orders (new Bearer)
  A-->>R: 200 orders
:::

::: code javascript React: axios instance with in-memory token + refresh-on-401 (handles concurrent requests)
import axios from 'axios';

let accessToken = null;                     // in memory only
export const setAccessToken = (t) => { accessToken = t; };

export const api = axios.create({ baseURL: '/api', withCredentials: true }); // send cookies

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null; // share ONE refresh between parallel 401s
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.includes('/auth/refresh')) {
      original._retry = true;
      try {
        refreshPromise ??= api.post('/auth/refresh').finally(() => { refreshPromise = null; });
        const { data } = await refreshPromise;
        setAccessToken(data.accessToken);
        return api(original); // retry with new token
      } catch (e) {
        setAccessToken(null);
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);
:::

::: code javascript Express: refresh endpoint with rotation
router.post('/auth/refresh', async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ code: 'NO_REFRESH' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET); }
  catch { return res.status(401).json({ code: 'INVALID_REFRESH' }); }

  const stored = await RefreshToken.findOne({ jti: payload.jti, userId: payload.sub });
  if (!stored || stored.revoked) {
    await RefreshToken.updateMany({ userId: payload.sub }, { revoked: true }); // reuse detected → revoke all sessions
    return res.status(401).json({ code: 'REFRESH_REUSED' });
  }
  stored.revoked = true; await stored.save();                                  // rotate

  const jti = crypto.randomUUID();
  await RefreshToken.create({ jti, userId: payload.sub, expiresAt: Date.now() + 7 * 864e5 });
  const newRefresh = jwt.sign({ sub: payload.sub, jti }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  const access = jwt.sign({ sub: payload.sub, role: payload.role }, process.env.JWT_SECRET, { expiresIn: '15m' });

  res.cookie('refreshToken', newRefresh, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/refresh', maxAge: 7 * 864e5 });
  res.json({ accessToken: access });
});
:::

::: ask
- *"Are the frontend and API on the same site/domain?"* Cross-site cookies need `SameSite=None; Secure` and CORS `credentials: true`, which weakens CSRF protection.
- *"Is this a mobile app?"* Mobile uses secure storage (Keychain / Keystore), not cookies.
- Don't say *"localStorage is always wrong"*. Say *"it's a trade-off; for sensitive apps I prefer httpOnly cookies + in-memory access tokens"*.
:::

::: links
OWASP: HTML5 security (localStorage) | https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage
OWASP CSRF prevention | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
:::

=== How do you handle authentication? (end-to-end overview)
@p 3
@tags auth, bcrypt, oauth
@quick
- Register: validate → **hash password (bcrypt/argon2)** → save user (unique email index).
- Login: find user → `bcrypt.compare` → issue **session or JWT** (+ refresh token).
- Every request: **authenticate middleware** verifies the token → `req.user`; **authorize** checks roles/ownership.
- Extras: rate-limit login, account lockout, email verification, password reset via one-time token, MFA, OAuth/SSO (Google, Okta via OpenID Connect).
- Never reveal whether the email or the password was wrong.

::: text
### Building blocks
1. **Registration**: validate input, check for duplicates, **hash** the password with **bcrypt (cost 10–12) or argon2**, store the user, and optionally send a verification email.
2. **Login**: look up the user by email, compare the hash, and on success issue credentials (**session cookie** or **JWT access + refresh**). Return a generic error on failure.
3. **Request authentication**: middleware verifies the credential and loads `req.user`.
4. **Authorization**: RBAC (`role: admin`), permissions, **ownership checks** (users only access their own data).
5. **Logout**: destroy the session / revoke the refresh token.
6. **Password reset**: a random token (hashed in the DB, 15-min expiry, single use) is emailed as a link.
7. **Hardening**: rate-limit `/login`, lock out after N failures, MFA (TOTP), audit logs, HTTPS everywhere.

### Third-party auth
**OAuth 2.0 / OpenID Connect**: "Login with Google", enterprise SSO (Okta, Azure AD, Cognito). Use the **Authorization Code + PKCE** flow for SPAs. Managed options include **AWS Cognito**, Auth0, Clerk and Firebase Auth.
:::

::: diagram
flowchart LR
  REG["Register"] --> H["bcrypt hash"] --> DB[("users")]
  LOGIN["Login"] --> CMP["bcrypt.compare"] --> TOK["issue JWT / session"]
  TOK --> REQ["Requests with token"] --> AUTHN["authenticate"] --> AUTHZ["authorize role / owner"] --> CTRL["controller"]
:::

::: code javascript Auth service: register, login, password reset
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const authService = {
  async register({ name, email, password }) {
    if (await User.exists({ email })) throw new AppError(409, 'Email already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    return { id: user.id, name, email };
  },

  async login({ email, password }) {
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new AppError(401, 'Invalid email or password'); // generic on purpose
    const accessToken = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    return { accessToken, user: { id: user.id, name: user.name, role: user.role } };
  },

  async requestPasswordReset(email) {
    const user = await User.findOne({ email });
    if (!user) return; // don't reveal whether the email exists
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetTokenExpires = Date.now() + 15 * 60 * 1000;
    await user.save();
    // await mailer.send(email, `https://app.com/reset?token=${rawToken}`);
  },

  async resetPassword(rawToken, newPassword) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await User.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: Date.now() } });
    if (!user) throw new AppError(400, 'Invalid or expired token');
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetTokenHash = undefined; user.resetTokenExpires = undefined;
    await user.save();
  },
};
:::

::: ask
- *"Build our own auth or use a provider (Cognito/Auth0)?"* For most companies, a managed provider reduces risk.
- *"Do we need SSO, MFA, social login, multi-tenancy?"*
:::

::: links
OWASP Password storage cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
OAuth 2.0 simplified | https://www.oauth.com
:::

=== How do you protect APIs from unauthorized access?
@p 3
@tags security, owasp, api-security
@quick
- **AuthN + AuthZ** on every route (default deny), including **object-level checks** (BOLA/IDOR: user A can't read `/orders/<B's id>`).
- HTTPS, **helmet** security headers, strict **CORS** allowlist.
- **Validate input** (Zod), sanitise against NoSQL injection, limit body size.
- **Rate limiting** + account lockout; API keys for server-to-server.
- Secrets in env/Secrets Manager; least-privilege DB user; log & monitor; keep dependencies patched (`npm audit`).

::: text
Think in **layers (defence in depth)**. The **OWASP API Security Top 10** is the checklist interviewers expect:

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Broken Object Level Authorization (BOLA/IDOR)** | Always scope queries by owner: `Order.findOne({ _id, userId: req.user.id })` |
| 2 | Broken authentication | Strong hashing, short-lived tokens, rate-limit login, MFA |
| 3 | Broken object **property** level authorization | Allowlist writable fields (no mass assignment); don't return sensitive fields (`select: false`) |
| 4 | Unrestricted resource consumption | Rate limits, pagination caps, body size limits, timeouts |
| 5 | Broken function level authorization | `authorize('admin')` on admin routes |
| 6 | Unrestricted access to sensitive business flows | Bot protection, captcha on signup/checkout |
| 7 | SSRF | Validate/allowlist URLs the server fetches |
| 8 | Security misconfiguration | helmet, CORS allowlist, no stack traces, disable `x-powered-by` |
| 9 | Improper inventory | Retire old API versions, document endpoints |
| 10 | Unsafe consumption of third-party APIs | Validate their responses too |
:::

::: diagram Defence in depth
flowchart LR
  C(["Client"]) --> WAF["WAF / CloudFront"] --> LB["ALB + HTTPS"] --> NG["Nginx: rate limit, body size"] --> APP["Express: helmet, CORS, auth, validation"] --> SVC["Service: ownership checks"] --> DB[("MongoDB: least privilege user, private subnet")]
:::

::: code javascript Security baseline for an Express app
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                                   // behind ALB/Nginx → correct client IP
app.use(helmet());                                           // security headers (CSP, HSTS, noSniff…)
app.use(cors({ origin: ['https://app.example.com'], credentials: true }));
app.use(express.json({ limit: '100kb' }));                   // body size limit
app.use(mongoSanitize());                                    // strips $ and . keys → NoSQL injection
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }));

// BOLA-safe controller: ALWAYS scope by the authenticated user
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, userId: req.user.id };
  const order = await Order.findOne(filter).lean();
  if (!order) return res.status(404).json({ message: 'Order not found' }); // 404, not 403 → don't leak existence
  res.json(order);
});
:::

::: ask
- *"Is the API public, partner-only or internal?"* Partner → API keys/OAuth client credentials; internal → network isolation (VPC, security groups) + service auth.
- *"Any compliance requirements (PCI, HIPAA, GDPR)?"* These affect logging, encryption and data retention.
:::

::: links
OWASP API Security Top 10 (2023) | https://owasp.org/API-Security/editions/2023/en/0x11-t10/
helmet | https://helmetjs.github.io
:::

=== How do you implement rate limiting?
@p 3
@tags rate-limiting, redis, security
@quick
- Limit requests per **client key** (IP, user id, API key) per **time window** → **429** + `Retry-After`.
- Algorithms: **fixed window** (simple, burst at edges), **sliding window log/counter** (smoother), **token bucket** (allows bursts, smooth average), leaky bucket.
- Multiple servers → store counters in **Redis** (atomic `INCR` + `EXPIRE` or Lua script).
- Layers: API Gateway / CloudFront WAF / Nginx `limit_req` / app-level `express-rate-limit`.
- Stricter limits on login, OTP, signup and expensive endpoints.

::: text
Rate limiting protects against **abuse, brute force, scraping, DDoS and noisy neighbours**, and controls costs.

### Algorithms
| Algorithm | How it works | Pros / cons |
|---|---|---|
| **Fixed window** | Counter per key per minute (`key:12:05`) | Simple; allows **2× burst** at window boundaries |
| **Sliding window log** | Store the timestamp of each request, count those in the last N seconds | Accurate; memory-heavy |
| **Sliding window counter** | Weighted mix of the current and previous window counts | Accurate enough, cheap ✅ |
| **Token bucket** | Bucket of N tokens refilled at rate R; each request takes 1 token | Allows controlled **bursts** ✅ (used by AWS API Gateway) |
| **Leaky bucket** | Queue processed at a constant rate | Smooth output; adds latency |

### Response
`429 Too Many Requests` with headers `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
:::

::: diagram Token bucket
flowchart LR
  REF["Refill: R tokens per second"] --> B[("Bucket, capacity N")]
  REQ["Request"] --> CHK{"token available?"}
  B --> CHK
  CHK -->|"yes: take 1"| OK["Allow"]
  CHK -->|"no"| NO["429 Too Many Requests"]
:::

::: code javascript Try it: fixed window vs token bucket (runs in browser)
// Fixed window
function fixedWindow(limit, windowMs) {
  const counters = new Map();
  return (key, now) => {
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    const count = (counters.get(windowKey) || 0) + 1;
    counters.set(windowKey, count);
    return count <= limit;
  };
}

// Token bucket
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

const fw = fixedWindow(5, 1000);
const tb = tokenBucket(5, 5);
// 10 requests at t=900..990ms, then 10 at t=1000..1090ms (boundary burst)
const times = [...Array(10)].map((_, i) => 900 + i * 10).concat([...Array(10)].map((_, i) => 1000 + i * 10));
console.log('fixed window allowed:', times.filter((t) => fw('ip1', t)).length, 'of 20 in ~200ms  ← boundary burst (2x)');
console.log('token bucket allowed:', times.filter((t) => tb('ip1', t)).length, 'of 20 in ~200ms  ← smoother');
:::

::: code javascript Distributed rate limiter with Redis (sliding window using sorted set)
const redis = require('./redis'); // ioredis

function rateLimiter({ limit = 100, windowSec = 60, keyFn = (req) => req.user?.id || req.ip } = {}) {
  return async (req, res, next) => {
    const key = `rl:${keyFn(req)}`;
    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    const results = await redis
      .multi()
      .zremrangebyscore(key, 0, windowStart)          // drop old requests
      .zadd(key, now, `${now}-${Math.random()}`)      // add this request
      .zcard(key)                                     // count in window
      .expire(key, windowSec)
      .exec();

    const count = results[2][1];
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      res.set('Retry-After', String(windowSec));
      return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
    }
    next();
  };
}

app.use('/api', rateLimiter({ limit: 300, windowSec: 60 }));
app.use('/api/auth/login', rateLimiter({ limit: 5, windowSec: 60, keyFn: (req) => `${req.ip}:${req.body.email}` }));
:::

::: ask
- *"Limit per IP, per user, or per API key?"* IPs are shared behind NAT/corporate proxies, so prefer the user/API key when authenticated.
- *"Single instance or multiple?"* In-memory counters break with multiple instances, so use Redis.
- *"Behind a proxy?"* Set `app.set('trust proxy', 1)` or every request has the proxy's IP.
- *"Should limits differ by plan (free vs paid)?"*
:::

::: links
express-rate-limit | https://github.com/express-rate-limit/express-rate-limit
Cloudflare: rate limiting algorithms | https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
:::

=== How do you prevent duplicate requests?
@p 2
@tags idempotency, double-submit, locking
@quick
- **Frontend**: disable the submit button while pending, debounce, React Query `isPending`, abort previous requests.
- **Backend**: **Idempotency-Key** header + stored result; **unique indexes** (e.g. `orderNumber`, `{userId, cartId}`).
- **Distributed lock** (Redis `SET key NX EX`) for critical sections.
- **Atomic DB operations** (`findOneAndUpdate` with a condition) instead of read-then-write.
- Queues: idempotent consumers + dedupe ids (SQS FIFO dedup).

::: text
Duplicates come from **double clicks, retries after timeouts, network glitches, browser back/refresh, and at-least-once message delivery**. Defend on **both** sides:

### Frontend (UX layer, not sufficient alone)
- Disable the button + show a spinner while the mutation is pending.
- Generate an **idempotency key when the form opens** and reuse it for retries.
- Debounce/throttle rapid actions; `AbortController` cancels outdated requests.

### Backend (the real guarantee)
1. **Idempotency keys** (see the *Idempotency* question).
2. **Unique constraints**: `db.orders.createIndex({ idempotencyKey: 1 }, { unique: true })` → the second insert fails with `E11000` → return the existing order.
3. **Conditional atomic updates**: `updateOne({ _id, status: 'pending' }, { $set: { status: 'paid' } })`. Only one request wins.
4. **Distributed locks** with Redis `SET lock:order:42 <token> NX PX 10000` for multi-step critical sections (release safely with a token check).
5. **Optimistic concurrency**: a version field (`__v`) → reject stale writes.
:::

::: code javascript Backend: unique index + conditional update + Redis lock
// 1) Unique index as a safety net
orderSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true });

async function createOrder(userId, body, clientRequestId) {
  try {
    return await Order.create({ userId, clientRequestId, ...body });
  } catch (err) {
    if (err.code === 11000) return Order.findOne({ userId, clientRequestId }); // duplicate → return the original
    throw err;
  }
}

// 2) Atomic state transition — only ONE concurrent request succeeds
async function payOrder(orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'PENDING' },           // condition
    { $set: { status: 'PROCESSING' } },
    { new: true }
  );
  if (!order) throw new AppError(409, 'Order already processed');
  // ... charge, then set PAID
}

// 3) Redis lock for a critical section
async function withLock(key, ttlMs, fn) {
  const token = crypto.randomUUID();
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (!ok) throw new AppError(409, 'Operation in progress');
  try { return await fn(); }
  finally {
    // release only if we still own it (Lua script = atomic check-and-delete)
    await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, `lock:${key}`, token);
  }
}
:::

::: code jsx Frontend: disable while pending + stable idempotency key (React Query)
import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';

function CheckoutButton({ cart }) {
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [cart.id]); // same key for retries
  const mutation = useMutation({
    mutationFn: () => api.post('/orders', { cartId: cart.id }, { headers: { 'Idempotency-Key': idempotencyKey } }),
    retry: 2, // safe to retry because the server is idempotent
  });
  return (
    <button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? 'Placing order…' : 'Place order'}
    </button>
  );
}
:::

::: ask
- *"What's the business impact of a duplicate?"* Payments/orders → strict idempotency; likes/views → just dedupe or ignore.
- *"How long is the dedup window?"*
:::

::: links
Redis distributed locks | https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
:::

=== How do you design a good API response?
@p 2
@tags api-design, response
@quick
- **Consistent envelope**: `{ success, data, meta/pagination }` and `{ success: false, code, message, details }` for errors.
- Correct status codes + headers (`Location`, `ETag`, `Cache-Control`, `RateLimit-*`).
- Consistent naming (camelCase), ISO-8601 UTC dates, ids as strings, money in minor units (paise/cents) or decimal strings.
- Return only needed fields (no password hashes/internal fields); support `fields=` selection.
- Pagination metadata; documented with **OpenAPI/Swagger**.

::: text
### Success
- Single: `{ "success": true, "data": { "id": "66f…", "name": "Vivek", "createdAt": "2026-09-30T04:00:00Z" } }`
- List: `{ "success": true, "data": [ … ], "pagination": { "page": 2, "limit": 20, "total": 523, "totalPages": 27, "hasNextPage": true } }`

### Error
- `{ "success": false, "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "field": "email", "message": "Invalid email" }], "requestId": "a1b2…" }`

### Checklist
- **Predictable**: the same envelope on every endpoint (the frontend writes one handler).
- **Minimal & safe**: use DTOs/serialisers to strip `password`, `__v` and internal flags.
- **Types**: dates as ISO strings in **UTC**; money as integers in minor units (`amountInPaise: 49900`) or decimal strings, never floats.
- **Enums** as UPPER_SNAKE or lowercase strings, consistently.
- **Null vs missing**: be consistent.
- **Headers**: `Location` on 201, `ETag`/`Cache-Control` for caching, `X-Request-Id`.
- **Documentation**: OpenAPI spec + Swagger UI; generate TypeScript types for React from it.
:::

::: code javascript Response helpers + DTO mapper
const ok = (res, data, meta) => res.status(200).json({ success: true, data, ...(meta && meta) });
const created = (res, data, location) => res.status(201).location(location).json({ success: true, data });
const noContent = (res) => res.status(204).end();

// DTO: never leak internal fields
const toUserDTO = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: new Date(u.createdAt).toISOString(),
});

router.get('/users', async (req, res) => {
  const { items, page, limit, total } = await userService.list(req.query);
  ok(res, items.map(toUserDTO), { pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total } });
});
:::

::: ask
- *"Is there an existing API style guide / envelope?"* *"Do clients prefer an envelope or raw data?"* (Some teams use raw arrays + pagination in headers, like GitHub's `Link` header.)
:::

::: links
Swagger / OpenAPI | https://swagger.io/specification/
Google JSON style guide | https://google.github.io/styleguide/jsoncstyleguide.xml
:::
