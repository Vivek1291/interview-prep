@section Express.js
@icon 🚂
@color #f59e0b
@desc Middleware, error handling, project structure, auth, validation, pagination, uploads and versioning.

=== What is middleware in Express?
@p 3
@tags middleware, express
@quick
- Middleware = function `(req, res, next)` that runs **between request and response**.
- It can **modify req/res**, **end the response**, or call `next()` to pass control on.
- Uses: logging, auth, body parsing, CORS, validation, rate limiting, error handling.
- Forget `next()` and don't send a response → the request **hangs**.
- Error middleware has **4 args**: `(err, req, res, next)`.

::: text
**Middleware** is a function with access to the **request** (`req`), the **response** (`res`), and the **next** middleware in the chain (`next`). Express is essentially **a pipeline of middleware functions**. Even route handlers are middleware.

A middleware can:
1. **Execute any code** (log, measure time).
2. **Modify** `req` / `res` (e.g. attach `req.user` after verifying a token).
3. **End the request–response cycle** (`res.json(...)`, `res.status(401)...`).
4. **Call `next()`** to hand control to the next middleware, or `next(err)` to jump to the error handler.

### Types of middleware
| Type | Example |
|---|---|
| Application-level | `app.use(express.json())` |
| Router-level | `router.use(authenticate)` |
| Built-in | `express.json()`, `express.urlencoded()`, `express.static()` |
| Third-party | `cors`, `helmet`, `morgan`, `multer`, `express-rate-limit` |
| Error-handling | `app.use((err, req, res, next) => {...})` |
:::

::: diagram Middleware pipeline
flowchart LR
  REQ(["HTTP Request"]) --> M1["helmet / cors"] --> M2["express.json"] --> M3["logger"] --> M4["authenticate"] --> M5["validate"] --> H["route handler"] --> RES(["HTTP Response"])
  M4 -.->|"no token: 401"| RES
  H -.->|"next(err)"| E["error middleware"] --> RES
:::

::: code javascript Writing your own middleware (node app.js)
const express = require('express');
const app = express();

// 1) Logger middleware — runs for every request
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next(); // IMPORTANT: pass control on
}

// 2) Request ID middleware — modifies req and res
const crypto = require('crypto');
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

// 3) Configurable middleware (factory) — returns a middleware
const requireHeader = (name) => (req, res, next) => {
  if (!req.headers[name]) return res.status(400).json({ message: `Missing header ${name}` }); // ends the cycle
  next();
};

app.use(express.json());
app.use(requestId);
app.use(requestLogger);

app.get('/public', (req, res) => res.json({ ok: true, requestId: req.id }));
app.get('/partner', requireHeader('x-api-key'), (req, res) => res.json({ partner: true }));

app.listen(3000, () => console.log('http://localhost:3000'));
:::

::: understand
- **Order matters.** Middleware runs in the order it's registered. `express.json()` must come **before** routes that read `req.body`.
- Every middleware must either **send a response** or **call `next()`**. Otherwise the request hangs until it times out.
- Don't call `next()` **after** sending a response. You'll get *"Cannot set headers after they are sent"*.
- The same concept exists in Redux (middleware), Axios (interceptors) and Next.js (middleware.ts). Mention this as a full-stack developer.
:::

::: ask
- If asked to write one, clarify: *"Should it apply globally, to a router, or to a single route?"*
- For auth middleware: *"Where does the token come from: header, cookie or query? What should happen for expired tokens?"*
:::

::: links
Express: Using middleware | https://expressjs.com/en/guide/using-middleware.html
Express: Writing middleware | https://expressjs.com/en/guide/writing-middleware.html
:::

=== How does Express middleware execute? (order & next)
@p 3
@tags middleware, next, order
@quick
- Middleware runs **top to bottom in registration order**, only if the **path & method match**.
- `next()` → next matching middleware · `next('route')` → skip the rest of this route's handlers · `next(err)` → jump to error middleware.
- Code **after** `next()` runs when the downstream middleware returns (synchronously), but don't rely on it for async work.
- 404 handler goes **after all routes**, error handler **last**.

::: text
Express keeps an internal **stack** of layers. For each request it walks the stack **in order** and runs each layer whose **path prefix and HTTP method match**.

### Control flow
- `next()`: go to the next matching layer.
- `next('route')`: skip the remaining callbacks of the **current route**, go to the next route (only in `app.METHOD`/`router.METHOD`).
- `next('router')`: exit the current router.
- `next(err)` (any non-string argument): **skip all normal middleware** and go to the **error-handling middleware** (4 arguments).
- Sending a response (`res.send/json/end`) ends the cycle, and later middleware doesn't run.

### Typical order in app.js
1. Security & parsing: `helmet`, `cors`, `express.json`, `cookieParser`
2. Logging / request id
3. Rate limiting
4. Routes (with route-specific auth / validation)
5. **404 handler** (no route matched)
6. **Error handler** (last)
:::

::: code javascript Trace the execution order (node order.js, then curl localhost:3000/users/1)
const express = require('express');
const app = express();

app.use((req, res, next) => {
  console.log('1. global middleware — before');
  next();
  console.log('6. global middleware — after next() returned');
});

app.use('/users', (req, res, next) => {
  console.log('2. /users prefix middleware');
  next();
});

app.get(
  '/users/:id',
  (req, res, next) => {
    console.log('3. route callback #1');
    if (req.params.id === 'skip') return next('route'); // jump to next matching route
    next();
  },
  (req, res) => {
    console.log('4. route callback #2 → sends response');
    res.json({ id: req.params.id });
  }
);

app.get('/users/:id', (req, res) => {
  console.log('4b. second route definition (reached only via next("route"))');
  res.json({ skipped: true });
});

app.use((req, res) => res.status(404).json({ message: 'Not Found' })); // 404
app.use((err, req, res, next) => res.status(500).json({ message: err.message })); // error

app.listen(3000);
:::

::: ask
- A common trick question is *"What happens if a middleware neither calls next nor sends a response?"* Answer: the request **hangs** until the client or server times out.
- *"Can middleware be async?"* Yes, but in Express 4 you must catch errors and call `next(err)`. Express 5 forwards rejected promises automatically.
:::

::: links
Express routing guide | https://expressjs.com/en/guide/routing.html
:::

=== How do you create error-handling middleware? (handle errors in Express)
@p 3
@tags errors, middleware, async
@quick
- Error middleware = **4 params** `(err, req, res, next)`, registered **after all routes**.
- Sync errors are caught automatically; **async errors need `next(err)`** in Express 4 (use an `asyncHandler` wrapper). Express 5 catches rejected promises.
- Create a custom `AppError(statusCode, message)`; map Mongoose/JWT/validation errors to 4xx.
- Never leak stack traces in production; log them with a request id.
- Consistent shape: `{ success: false, message, code, details }`.

::: text
Express recognises error-handling middleware by its **four arguments**: `(err, req, res, next)`. Register it **after** all routes and other middleware.

### How errors reach it
- **Synchronous** `throw` inside a handler: Express catches it automatically.
- **Asynchronous** errors (rejected promise, error in a callback): in **Express 4** you must pass them yourself with `next(err)`. Wrap async handlers with an `asyncHandler` or use the `express-async-errors` package. **Express 5** forwards rejected promises from handlers automatically.

### Production-grade approach
1. A custom **`AppError`** class with `statusCode` and `isOperational`.
2. An **`asyncHandler`** wrapper so controllers can simply `throw`.
3. A central **error handler** that maps known errors (Mongoose `ValidationError` / `CastError`, duplicate key `11000`, JWT errors, Zod errors) to proper **4xx** codes, uses **500** for everything else, and hides internals in production.
4. A **404 handler** before it.
:::

::: diagram
flowchart TD
  A["Controller throws / rejects"] --> B{"Express 4 async?"}
  B -->|"asyncHandler catches"| C["next(err)"]
  B -->|"Express 5 / sync throw"| C
  C --> D["errorHandler(err, req, res, next)"]
  D --> E{"Known error type?"}
  E -->|"ValidationError, CastError, 11000, JWT"| F["4xx with a clear message"]
  E -->|"unknown"| G["log stack + 500 generic message"]
:::

::: code javascript Complete error-handling setup (errors.js + app.js)
// ---------- utils/AppError.js ----------
class AppError extends Error {
  constructor(statusCode, message, code = 'ERROR', details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // expected error (bad input, not found) vs programming bug
  }
}

// ---------- utils/asyncHandler.js ----------
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- middleware/errorHandler.js ----------
function notFound(req, res, next) {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';

  if (err.name === 'ValidationError') { status = 400; code = 'VALIDATION_ERROR'; }          // Mongoose
  if (err.name === 'CastError') { status = 400; message = `Invalid ${err.path}`; code = 'INVALID_ID'; }
  if (err.code === 11000) { status = 409; message = `Duplicate value for ${Object.keys(err.keyValue)}`; code = 'DUPLICATE'; }
  if (err.name === 'JsonWebTokenError') { status = 401; message = 'Invalid token'; code = 'INVALID_TOKEN'; }
  if (err.name === 'TokenExpiredError') { status = 401; message = 'Token expired'; code = 'TOKEN_EXPIRED'; }

  if (status >= 500) console.error(`[${req.id}]`, err); // log full error server-side

  res.status(status).json({
    success: false,
    code,
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Something went wrong' : message,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

// ---------- app.js ----------
const express = require('express');
const app = express();
app.use(express.json());

app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = null; // await User.findById(req.params.id)
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  res.json({ success: true, data: user });
}));

app.use(notFound);     // after all routes
app.use(errorHandler); // LAST
app.listen(3000);
:::

::: warning
- Registering the error handler **before** routes means it never runs.
- Using only 3 params `(err, req, res)`: Express won't treat it as an error handler. Keep `next` even if unused.
- Calling `res.json` in the error handler when headers were already sent. Check `if (res.headersSent) return next(err);`.
- Returning 200 with `{ error: ... }`. Use proper HTTP status codes.
:::

::: ask
- Ask: *"Which Express version?"* Express 5 handles async errors natively, so no wrapper is needed.
- Ask whether errors should be **logged/monitored** (Sentry, CloudWatch) and whether clients need **machine-readable error codes** (useful for frontend i18n).
:::

::: links
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
Express 5 migration (async errors) | https://expressjs.com/en/guide/migrating-5.html
:::

=== How would you structure a production Node.js / Express application?
@p 3
@tags architecture, layers, clean-code
@quick
- Layers: **Route → Controller → Service → Repository → Model/DB**.
- Route = URL + middleware · Controller = HTTP in/out · Service = business logic · Repository = DB queries.
- Why: **separation of concerns, testability** (mock the repository), reuse (a service is callable from cron/queue), easier DB swaps.
- Plus: `config/` (env), `middleware/`, `validators/`, `utils/`, central error handler, `app.js` vs `server.js`.
- Feature-based folders (`modules/users/...`) scale better for large apps.

::: text
Keep each layer focused on **one responsibility**. The goal is code that's **easy to test, change and reason about**.

### Folder structure (layer-based)
- `src/config/`: env variables, DB connection, constants
- `src/routes/`: URL → middleware → controller mapping
- `src/controllers/`: read `req`, call a service, send `res` (**no business logic, no DB**)
- `src/services/`: **business logic** (pricing rules, permissions, orchestrating multiple repositories, sending emails). Knows nothing about HTTP.
- `src/repositories/`: **all DB access** (Mongoose queries). Knows nothing about business rules.
- `src/models/`: Mongoose schemas
- `src/middleware/`: auth, validation, error handler, rate limit
- `src/validators/`: Joi/Zod schemas
- `src/utils/`: AppError, asyncHandler, logger
- `src/app.js`: builds the Express app (exported, so tests can use it with Supertest)
- `src/server.js`: connects the DB and calls `app.listen` (+ graceful shutdown)

### Why separate Route → Controller → Service → Repository?
| Benefit | Explanation |
|---|---|
| **Testability** | Unit test services by mocking repositories; no HTTP or DB needed |
| **Reusability** | The same `userService.create()` can be used by the REST API, a GraphQL resolver, a CLI script or a queue worker |
| **Maintainability** | Change the DB (Mongo → Postgres) by rewriting only repositories |
| **Readability** | New developers know exactly where to look |

**For large apps**, prefer **feature/module-based** folders (`src/modules/users/{user.routes, user.controller, user.service, user.repository, user.model, user.validator}.js`) so everything for a feature lives together.

💡 *This app itself uses this exact structure. Open `server/src` in the project to see a real example.*
:::

::: diagram Request flow through the layers
flowchart LR
  C(["Client"]) --> R["Route: /api/v1/users"]
  R --> MW["Middleware: auth, validate"]
  MW --> CT["Controller: parse req, send res"]
  CT --> S["Service: business rules"]
  S --> RP["Repository: DB queries"]
  RP --> DB[("MongoDB")]
  S --> EXT["Other: email, S3, cache"]
:::

::: code javascript Full vertical slice: users module
// ---------- models/user.model.js ----------
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema(
  { name: { type: String, required: true }, email: { type: String, required: true, unique: true, lowercase: true }, password: { type: String, required: true, select: false }, role: { type: String, enum: ['user', 'admin'], default: 'user' } },
  { timestamps: true }
);
const User = mongoose.model('User', userSchema);

// ---------- repositories/user.repository.js ----------
const userRepository = {
  findByEmail: (email) => User.findOne({ email }).lean(),
  findById: (id) => User.findById(id).lean(),
  create: (data) => User.create(data),
  list: ({ filter, skip, limit, sort }) => Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]),
};

// ---------- services/user.service.js ----------
const bcrypt = require('bcrypt');
const userService = {
  async register({ name, email, password }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) throw new AppError(409, 'Email already registered');
    const hash = await bcrypt.hash(password, 12);
    const user = await userRepository.create({ name, email, password: hash });
    // await emailService.sendWelcome(user)  ← business logic lives here
    return { id: user._id, name: user.name, email: user.email };
  },
  async list({ page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const [items, total] = await userRepository.list({ filter: {}, skip, limit, sort: { createdAt: -1 } });
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },
};

// ---------- controllers/user.controller.js ----------
const userController = {
  register: asyncHandler(async (req, res) => {
    const user = await userService.register(req.body);
    res.status(201).json({ success: true, data: user });
  }),
  list: asyncHandler(async (req, res) => {
    const result = await userService.list({ page: Number(req.query.page) || 1, limit: Math.min(Number(req.query.limit) || 20, 100) });
    res.json({ success: true, ...result });
  }),
};

// ---------- routes/user.routes.js ----------
const router = require('express').Router();
router.post('/', validate(registerSchema), userController.register);
router.get('/', authenticate, authorize('admin'), userController.list);
module.exports = router;

// ---------- app.js ----------
// app.use('/api/v1/users', userRoutes); app.use(notFound); app.use(errorHandler); module.exports = app;

// ---------- server.js ----------
// await mongoose.connect(process.env.MONGO_URI); const server = app.listen(PORT);
// process.on('SIGTERM', () => server.close(() => mongoose.connection.close()));
:::

::: understand
- **Controllers must not contain business logic**, and **services must not touch `req`/`res`**. Interviewers look for this.
- Separate `app.js` (app definition) from `server.js` (listen). This makes integration tests with **Supertest** easy.
- Add production concerns: **config validation** at startup, **structured logging** (pino/winston), **graceful shutdown**, **health check** endpoint, **helmet**, **rate limiting**, **API docs** (Swagger/OpenAPI).
:::

::: ask
- Ask about team size & app size. For a small API, 3 layers (route/controller/service with Mongoose directly in the service) can be enough; *"I'd add the repository layer when the app grows or needs to be DB-agnostic."* This shows pragmatism.
- Ask: *"Monolith or microservices?"* and *"Is there a background worker?"* Services can then be shared between API and workers.
:::

::: links
Node.js best practices: project structure | https://github.com/goldbergyoni/nodebestpractices#1-project-architecture-practices
Express production best practices | https://expressjs.com/en/advanced/best-practice-performance.html
:::

=== How do you handle authentication middleware? (JWT)
@p 3
@tags auth, jwt, middleware, rbac
@quick
- Read token from `Authorization: Bearer <token>` (or an httpOnly cookie) → `jwt.verify` → attach `req.user` → `next()`.
- Missing/invalid → **401 Unauthorized**; valid but wrong role → **403 Forbidden**.
- Authorization middleware factory: `authorize('admin')` checks `req.user.role`.
- Short-lived **access token** (15 min) + long-lived **refresh token** (httpOnly cookie, rotated).
- Secret in env vars, never in code; specify `algorithms: ['HS256']` on verify.

::: text
**Authentication** = *who are you?* **Authorization** = *what are you allowed to do?*

### Flow
1. The user logs in with email + password → the server verifies the password with **bcrypt** → signs a **JWT** containing `{ sub: userId, role }`.
2. The client sends the token on each request: `Authorization: Bearer <token>`, or the browser sends it automatically as an **httpOnly cookie**.
3. **`authenticate` middleware** verifies the signature and expiry → attaches `req.user` → `next()`.
4. **`authorize(...roles)` middleware** checks permissions → **403** if not allowed.

### Status codes
- **401 Unauthorized**: not authenticated (no, invalid or expired token).
- **403 Forbidden**: authenticated but not permitted.
:::

::: diagram
sequenceDiagram
  participant R as React
  participant A as Express API
  participant M as authenticate middleware
  participant DB as MongoDB
  R->>A: POST /auth/login (email, password)
  A->>DB: find user, bcrypt.compare
  A-->>R: 200 accessToken (+ refresh cookie)
  R->>M: GET /orders (Authorization: Bearer token)
  M->>M: jwt.verify(token, secret)
  alt valid
    M->>A: req.user = payload, next()
    A-->>R: 200 orders
  else invalid or expired
    M-->>R: 401 Unauthorized
  end
:::

::: code javascript auth.middleware.js + usage
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; // from env / AWS Secrets Manager — never hard-coded

// ----- Authentication -----
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, bearerToken] = header.split(' ');
  const token = scheme === 'Bearer' ? bearerToken : req.cookies?.accessToken; // support header or cookie

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ message, code: err.name });
  }
}

// ----- Authorization (RBAC) -----
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

// ----- Resource ownership check (user can only edit their own order) -----
const ownsResource = (getOwnerId) => async (req, res, next) => {
  const ownerId = await getOwnerId(req);
  if (req.user.role !== 'admin' && String(ownerId) !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
  next();
};

// ----- Login: issue tokens -----
async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid email or password' }); // don't reveal which one
  }
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/refresh', maxAge: 7 * 864e5 });
  res.json({ accessToken });
}

// ----- Routes -----
router.post('/auth/login', login);
router.get('/me', authenticate, (req, res) => res.json(req.user));
router.get('/admin/users', authenticate, authorize('admin'), listUsers);
router.patch('/orders/:id', authenticate, ownsResource((req) => Order.findById(req.params.id).then((o) => o?.userId)), updateOrder);
:::

::: understand
- A JWT is **signed, not encrypted**. Anyone can base64-decode the payload, so **never put secrets or PII in it**.
- JWTs are **stateless**: you can't revoke one before it expires unless you keep a **denylist** (Redis) or use **short expiry + refresh tokens**.
- Refresh-token **rotation**: every refresh issues a new refresh token and invalidates the old one, which helps detect token theft.
- Hash passwords with **bcrypt/argon2** (slow, salted), never SHA-256/MD5.
:::

::: ask
- *"Is this a browser SPA, a mobile app, or service-to-service?"* That decides between cookies, headers and API keys.
- *"Do we need instant logout / revocation?"* If yes → sessions or a token denylist.
- *"Single role, or permission-based (RBAC/ABAC)? Multi-tenant?"*
- *"Should we support SSO / OAuth (Google, Okta)?"*
:::

::: links
jwt.io: introduction to JWT | https://jwt.io/introduction
OWASP: Authentication cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
jsonwebtoken package | https://github.com/auth0/node-jsonwebtoken
:::

=== How do you implement pagination in Node.js + MongoDB? (skip/limit and cursor)
@p 3
@tags pagination, mongodb, performance
@quick
- **Offset**: `find().sort().skip((page-1)*limit).limit(limit)` + `countDocuments` → simple, supports "jump to page 7", but **slow for large skips** (the DB still walks skipped docs).
- **Cursor/keyset**: `find({ _id: { $lt: lastId } }).sort({ _id: -1 }).limit(limit)` → fast and consistent at any depth; no page numbers.
- Always **sort** by a **unique, indexed** field (add `_id` as a tiebreaker).
- Cap the limit (`Math.min(limit, 100)`), and return metadata (`total`, `hasNextPage`, `nextCursor`).
- Infinite scroll / feeds → cursor. Admin tables with page numbers → offset.

::: text
### 1. Offset pagination (skip / limit)
`GET /users?page=3&limit=20` → `skip = (3-1)*20 = 40`.
- ✅ Easy, supports **page numbers** and "jump to page N", and shows a total count.
- ❌ `skip(1_000_000)` is **slow**, because MongoDB must scan and discard a million index entries.
- ❌ **Inconsistent** when data changes: new inserts shift items, so users see duplicates or miss items between pages.
- ❌ `countDocuments` on huge collections is expensive (cache it or use `estimatedDocumentCount`).

### 2. Cursor (keyset) pagination
`GET /users?limit=20&cursor=<lastSeenId>` → `find({ _id: { $lt: cursor } }).sort({ _id: -1 }).limit(21)`.
- ✅ **Constant speed** at any depth (index seek, no skipping).
- ✅ **Stable** results even with concurrent inserts.
- ❌ No random page access (next/prev only). This is perfect for **infinite scroll**.
- For a non-unique sort field (e.g. `createdAt`), use a **compound cursor** `(createdAt, _id)`.

**Trick:** fetch `limit + 1` documents. If you got more than `limit`, then `hasNextPage = true`.
:::

::: chart line Query time vs page depth (illustrative, 10M docs)
Page,Offset skip/limit (ms),Cursor (ms)
1,3,3
100,12,3
1000,85,3
10000,780,4
100000,7400,4
:::

::: diagram End-to-end
flowchart LR
  R["React / React Query"] -->|"GET /users?page=2&limit=20"| E["Express route"]
  E --> C["Controller: parse & clamp query"]
  C --> S["Service"]
  S --> M[("MongoDB: sort + skip + limit, uses index")]
  M --> S --> C -->|"items, page, total, hasNext"| R
:::

::: code javascript Offset pagination (controller + service)
// GET /api/v1/users?page=2&limit=20
async function listUsers(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100); // clamp!
  const skip = (page - 1) * limit;
  const filter = { isActive: true };

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).select('name email createdAt').lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    data: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 },
  });
}
// Index to support it: db.users.createIndex({ isActive: 1, createdAt: -1, _id: -1 })
:::

::: code javascript Cursor pagination with compound cursor (createdAt + _id)
// GET /api/v1/posts?limit=20&cursor=eyJjcmVhdGVkQXQiOi4uLn0
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const decode = (str) => JSON.parse(Buffer.from(str, 'base64url').toString());

async function listPosts(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const filter = {};

  if (req.query.cursor) {
    const { createdAt, id } = decode(req.query.cursor);
    // "older than the last item" — tie-break on _id when createdAt is equal
    filter.$or = [
      { createdAt: { $lt: new Date(createdAt) } },
      { createdAt: new Date(createdAt), _id: { $lt: new mongoose.Types.ObjectId(id) } },
    ];
  }

  const docs = await Post.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasNextPage = docs.length > limit;
  const items = hasNextPage ? docs.slice(0, limit) : docs;
  const last = items[items.length - 1];

  res.json({
    data: items,
    pagination: { hasNextPage, nextCursor: hasNextPage ? encode({ createdAt: last.createdAt, id: last._id }) : null },
  });
}
// Index: db.posts.createIndex({ createdAt: -1, _id: -1 })
:::

::: code javascript Try the logic: offset vs cursor on an in-memory array
const posts = Array.from({ length: 53 }, (_, i) => ({ id: 53 - i, title: `Post ${53 - i}` })); // sorted desc by id

function offsetPage(page, limit) {
  const skip = (page - 1) * limit;
  return { items: posts.slice(skip, skip + limit).map((p) => p.id), total: posts.length, totalPages: Math.ceil(posts.length / limit) };
}

function cursorPage(cursor, limit) {
  const filtered = cursor ? posts.filter((p) => p.id < cursor) : posts; // WHERE id < cursor
  const docs = filtered.slice(0, limit + 1);                             // LIMIT limit+1
  const hasNext = docs.length > limit;
  const items = docs.slice(0, limit);
  return { items: items.map((p) => p.id), nextCursor: hasNext ? items[items.length - 1].id : null };
}

console.log('offset page 3:', offsetPage(3, 10));
let c = null, pageNo = 1;
do {
  const r = cursorPage(c, 20);
  console.log(`cursor page ${pageNo++}:`, r.items.join(','), '→ next', r.nextCursor);
  c = r.nextCursor;
} while (c);
:::

::: ask
- *"Does the UI need page numbers / total count, or infinite scroll?"* → offset vs cursor.
- *"How big is the collection and how fast does it change?"* A large, fast-changing collection → cursor.
- *"What's the default sort? Can users sort by any column?"* Every sortable column needs a supporting index plus the `_id` tiebreaker.
- *"Is an exact total count required?"* Counting is expensive at scale, so consider an estimated count or "1,000+".
:::

::: links
MongoDB: cursor.skip() performance note | https://www.mongodb.com/docs/manual/reference/method/cursor.skip/
Mongoose pagination patterns | https://mongoosejs.com/docs/queries.html
:::

=== How do you validate request data?
@p 3
@tags validation, zod, joi, security
@quick
- **Never trust the client**: validate body, params, query and headers on the server (frontend validation is only for UX).
- Use a schema library: **Zod / Joi / express-validator**, applied as a reusable `validate(schema)` middleware.
- Return **400** (or 422) with field-level errors: `[{ path: 'email', message: 'Invalid email' }]`.
- Strip unknown fields (prevents **mass assignment**, e.g. `role: 'admin'`).
- Second line of defence: Mongoose schema validation + DB unique indexes.

::: text
Validation guarantees the data entering your system has the **right shape, type and constraints**, and blocks malicious input.

### Layers of validation
1. **Frontend** (React Hook Form + Zod) → quick user feedback. **Not security.**
2. **API layer** (Zod/Joi middleware) → the **real gatekeeper**: types, required fields, formats, ranges, unknown-field stripping.
3. **Business rules** (service) → e.g. "email must not already exist", "stock must be ≥ quantity".
4. **Database** → Mongoose schema validators, **unique indexes** (the last line of defence against race conditions).

### What to validate
- `req.body` (payload), `req.params` (e.g. a valid ObjectId), `req.query` (page/limit numbers, allowed sort fields), and sometimes headers.
- **Sanitise**: trim strings, lowercase emails, coerce numbers, strip unknown keys.
- **Security**: prevent **NoSQL injection** (`{ "email": { "$gt": "" } }`) by ensuring fields are primitives; use `express-mongo-sanitize`.
:::

::: code javascript Reusable Zod validation middleware
const { z } = require('zod');

// ---- schemas ----
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a number'),
    age: z.coerce.number().int().min(18).optional(),
  }).strict(), // ❗ reject unknown fields like "role"
});

const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('-createdAt'),
    status: z.enum(['active', 'inactive']).optional(),
  }),
});

const getUserSchema = z.object({ params: z.object({ id: objectId }) });

// ---- middleware ----
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.issues.map((i) => ({ field: i.path.slice(1).join('.'), message: i.message })),
    });
  }
  // replace with parsed (coerced, defaulted, stripped) values
  Object.assign(req, { validated: result.data });
  next();
};

// ---- routes ----
router.post('/users', validate(createUserSchema), (req, res) => userController.create(req.validated.body));
router.get('/users', validate(listUsersSchema), (req, res) => userController.list(req.validated.query));
router.get('/users/:id', validate(getUserSchema), (req, res) => userController.get(req.validated.params.id));
:::

::: code javascript Try it: a tiny validator without libraries
const rules = {
  name: (v) => (typeof v === 'string' && v.trim().length >= 2) || 'name must be at least 2 chars',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'email is invalid',
  age: (v) => v === undefined || (Number.isInteger(v) && v >= 18) || 'age must be an integer ≥ 18',
};

function validate(body, schema) {
  const errors = [];
  for (const key of Object.keys(body)) if (!schema[key]) errors.push({ field: key, message: 'unknown field' });
  for (const [field, rule] of Object.entries(schema)) {
    const res = rule(body[field]);
    if (res !== true) errors.push({ field, message: res });
  }
  return errors;
}

console.log(validate({ name: 'Vivek', email: 'v@x.com', age: 30 }, rules)); // []
console.log(validate({ name: 'V', email: 'nope', role: 'admin' }, rules));
:::

::: ask
- *"What should the error format look like? Is there an existing API error contract?"*
- *"400 or 422 for validation errors?"* Both are common, so follow the team's convention.
- Mention sharing **Zod schemas between React and Node** in a monorepo, which gives one source of truth and TypeScript types.
:::

::: links
Zod docs | https://zod.dev
OWASP input validation cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
:::

=== How do you handle file uploads in Express?
@p 3
@tags uploads, multer, s3
@quick
- Files arrive as **multipart/form-data**; parse with **multer** (busboy under the hood).
- Storage: `diskStorage` (local), `memoryStorage` (buffer → S3), or **stream directly to S3** (`multer-s3`).
- **Best for scale: presigned S3 URL** → the browser uploads directly to S3 and the server only signs.
- Validate **mimetype + extension + size** (`limits.fileSize`); rename files (never trust the original name).
- Store **metadata/URL in MongoDB**, not the file itself.

::: text
Browsers send files with `Content-Type: multipart/form-data`. `express.json()` **can't** parse this, so you need **multer**.

### Options, from simplest to most scalable
| Approach | Flow | When |
|---|---|---|
| **Disk storage** | Browser → Node → local disk | Dev / small apps (❌ doesn't work across multiple servers / containers) |
| **Memory → S3** | Browser → Node (buffer in RAM) → S3 | Small files; beware of RAM usage |
| **Stream → S3** (`multer-s3` / `@aws-sdk/lib-storage`) | Browser → Node (streaming) → S3 | Medium files, needs server-side processing |
| **Presigned URL** ✅ | Browser → S3 directly (Node only signs) | Large files, best scalability; the server never touches the bytes |

### Security checklist
- Limit **file size** and **number of files**.
- Validate the **MIME type and extension** (and ideally the magic bytes with `file-type`).
- **Generate your own file name** (UUID) to prevent path traversal and overwrites.
- Store in **private** S3 buckets; serve through **presigned GET URLs** or CloudFront.
- Scan for malware if users share files with each other.
:::

::: code javascript Multer: disk + memory→S3 upload (Express)
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const s3 = new S3Client({ region: process.env.AWS_REGION }); // credentials from IAM role / env

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const fileFilter = (req, file, cb) =>
  ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPEG/PNG/WEBP allowed'));

// Option A: save to disk
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter,
});

app.post('/api/avatar', diskUpload.single('avatar'), (req, res) => {
  res.status(201).json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
});

// Option B: keep in memory, push to S3
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

app.post('/api/products/:id/images', memUpload.array('images', 5), async (req, res, next) => {
  try {
    const urls = await Promise.all(req.files.map(async (file) => {
      const key = `products/${req.params.id}/${crypto.randomUUID()}${path.extname(file.originalname)}`;
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }));
      return key; // store the KEY in MongoDB, generate URLs when reading
    }));
    // await Product.updateOne({ _id: req.params.id }, { $push: { images: { $each: urls } } });
    res.status(201).json({ keys: urls });
  } catch (err) { next(err); }
});

// Multer errors (file too large etc.) → 400
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message, code: err.code });
  res.status(400).json({ message: err.message });
});
:::

::: code jsx React side: upload with progress
import axios from 'axios';
import { useState } from 'react';

export function AvatarUpload() {
  const [progress, setProgress] = useState(0);
  const onChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('Max 5MB');
    const form = new FormData();
    form.append('avatar', file); // field name must match multer .single('avatar')
    const { data } = await axios.post('/api/avatar', form, {
      onUploadProgress: (e) => setProgress(Math.round((e.loaded * 100) / e.total)),
    });
    console.log('uploaded', data.url);
  };
  return (
    <div>
      <input type="file" accept="image/*" onChange={onChange} />
      {progress > 0 && <progress value={progress} max="100" />}
    </div>
  );
}
:::

::: ask
- *"What file types and max size? How many files? Do we need image resizing / thumbnails?"*
- *"Public or private files? Who can download them?"* → presigned GET URLs.
- *"Expected volume?"* At scale → **presigned URLs** (see AWS S3 section) + S3 event → Lambda for processing.
:::

::: links
multer | https://github.com/expressjs/multer
AWS SDK v3 S3 client | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
:::

=== How do you implement filtering and sorting?
@p 2
@tags filtering, sorting, query, security
@quick
- Query params: `GET /products?category=books&minPrice=10&maxPrice=50&sort=-price,name&search=node`.
- Build the Mongo filter from an **allowlist** of fields; never pass `req.query` straight into `find()` (NoSQL injection).
- Map `sort=-price` → `{ price: -1 }`; allow only indexed fields.
- Text search: `$regex` (escape user input!) for small data, **text index** or **Atlas Search** for large data.
- Add **compound indexes** matching common filter + sort combinations.

::: text
### Conventions
- **Equality**: `?status=active&category=books`
- **Ranges**: `?minPrice=10&maxPrice=50` or `?price[gte]=10&price[lte]=50`
- **Multiple values**: `?tags=node,react` → `$in`
- **Sorting**: `?sort=-createdAt,name` (a `-` prefix means descending)
- **Search**: `?q=phone`
- **Field selection**: `?fields=name,price`

### Security ⚠️
Passing `req.query` directly into `Model.find(req.query)` allows **NoSQL injection**. For example, `?password[$ne]=x` becomes `{ password: { $ne: 'x' } }`. Always **build the filter from an allowlist** and cast values.

### Performance
Filtering and sorting on large collections need **indexes** that match the query shape. Follow the **ESR rule** for compound indexes: **E**quality fields first, then **S**ort fields, then **R**ange fields.
:::

::: code javascript Safe query builder (Express + Mongoose)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTABLE = ['price', 'name', 'createdAt', 'rating'];

function buildProductQuery(query) {
  const filter = { isDeleted: false };

  if (query.category) filter.category = String(query.category);
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  if (query.tags) filter.tags = { $all: String(query.tags).split(',') };

  const min = Number(query.minPrice), max = Number(query.maxPrice);
  if (!Number.isNaN(min) || !Number.isNaN(max)) {
    filter.price = {};
    if (!Number.isNaN(min)) filter.price.$gte = min;
    if (!Number.isNaN(max)) filter.price.$lte = max;
  }

  if (query.q) filter.name = { $regex: escapeRegex(String(query.q)), $options: 'i' };

  const sort = {};
  String(query.sort || '-createdAt').split(',').forEach((token) => {
    const field = token.replace(/^-/, '');
    if (SORTABLE.includes(field)) sort[field] = token.startsWith('-') ? -1 : 1;
  });
  sort._id = sort._id || -1; // stable tiebreaker

  return { filter, sort };
}

// GET /api/v1/products?category=books&minPrice=10&sort=-price&q=node&page=1&limit=20
router.get('/products', asyncHandler(async (req, res) => {
  const { filter, sort } = buildProductQuery(req.query);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ data: items, pagination: { page, limit, total } });
}));

// Supporting index (Equality → Sort → Range):
// productSchema.index({ isDeleted: 1, category: 1, price: -1 })
:::

::: code javascript Try it: query-string → Mongo filter (runs in browser)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function build(qs) {
  const q = Object.fromEntries(new URLSearchParams(qs));
  const filter = {};
  if (q.category) filter.category = q.category;
  if (q.minPrice || q.maxPrice) filter.price = { ...(q.minPrice && { $gte: +q.minPrice }), ...(q.maxPrice && { $lte: +q.maxPrice }) };
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: 'i' };
  const sort = Object.fromEntries((q.sort || '-createdAt').split(',').map((t) => [t.replace('-', ''), t.startsWith('-') ? -1 : 1]));
  return { filter, sort };
}
console.log(JSON.stringify(build('category=books&minPrice=10&maxPrice=50&sort=-price,name&q=c++'), null, 2));
:::

::: ask
- *"Which fields are filterable/sortable? Is search full-text or prefix?"* This decides regex vs text index vs Atlas Search/Elasticsearch.
- *"Should filters be reflected in the URL?"* (Yes for shareable links, e.g. React Router search params.)
- Mention **debouncing** the search input on the frontend.
:::

::: links
MongoDB ESR rule for compound indexes | https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/
:::

=== How do you handle API errors consistently?
@p 2
@tags errors, api-design
@quick
- One **error shape** everywhere: `{ success: false, code: 'USER_NOT_FOUND', message, details?, requestId }`.
- Correct **HTTP status** codes (400/401/403/404/409/422/429/500).
- A central error middleware plus custom error classes; controllers just `throw`.
- Machine-readable `code` for the frontend; human `message` for display.
- Log with a **request id**; never expose stack traces/DB errors in production.

::: text
Consistency means **every** error, whether from validation, auth, not found, DB, or an unexpected bug, reaches the client in the **same format** with the **right status code**. The frontend can then handle errors in one place (e.g. an Axios interceptor).

### Recommended error body (inspired by RFC 9457 Problem Details)
| Field | Purpose |
|---|---|
| `success: false` | Easy check for clients |
| `code` | Stable machine-readable string (`VALIDATION_ERROR`, `TOKEN_EXPIRED`) |
| `message` | Human-readable summary |
| `details` | Field errors: `[{ field, message }]` |
| `requestId` | Correlates with server logs |

### Status-code cheat sheet
- **400** Bad Request (malformed / invalid input) · **401** Unauthenticated · **403** Forbidden · **404** Not Found · **409** Conflict (duplicate) · **422** Unprocessable (semantic validation) · **429** Too Many Requests · **500** Server error · **503** Service unavailable (DB down / maintenance)
:::

::: code javascript Error classes + handler + frontend interceptor
// ---------- errors.js ----------
class AppError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
class NotFoundError extends AppError { constructor(what = 'Resource') { super(404, 'NOT_FOUND', `${what} not found`); } }
class ValidationError extends AppError { constructor(details) { super(400, 'VALIDATION_ERROR', 'Validation failed', details); } }
class UnauthorizedError extends AppError { constructor(msg = 'Authentication required') { super(401, 'UNAUTHORIZED', msg); } }
class ForbiddenError extends AppError { constructor() { super(403, 'FORBIDDEN', 'You do not have permission'); } }
class ConflictError extends AppError { constructor(msg) { super(409, 'CONFLICT', msg); } }

// ---------- errorHandler.js ----------
function errorHandler(err, req, res, next) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  if (!isApp) req.log?.error({ err, requestId: req.id }, 'Unhandled error');
  res.status(status).json({
    success: false,
    code: isApp ? err.code : 'INTERNAL_ERROR',
    message: isApp ? err.message : 'Something went wrong',
    ...(err.details && { details: err.details }),
    requestId: req.id,
  });
}

// ---------- React: axios interceptor (one place for all API errors) ----------
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const { status, data } = error.response || {};
    if (status === 401 && data?.code === 'TOKEN_EXPIRED') return refreshAndRetry(error.config);
    if (status === 401) window.location.assign('/login');
    const normalized = { status, code: data?.code || 'NETWORK_ERROR', message: data?.message || 'Network error', details: data?.details };
    return Promise.reject(normalized);
  }
);
:::

::: ask
- *"Is there an existing error contract or API style guide?"* Follow it.
- *"Should error messages be localised?"* If so, the frontend maps `code` → a translated message.
:::

::: links
RFC 9457 Problem Details for HTTP APIs | https://www.rfc-editor.org/rfc/rfc9457.html
MDN: HTTP status codes | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
:::

=== How do you version APIs?
@p 2
@tags versioning, api-design
@quick
- **URI versioning** `/api/v1/users` (most common, explicit, cache-friendly).
- Other options: header (`Accept: application/vnd.app.v2+json`), query (`?version=2`).
- Version only on **breaking changes** (removed/renamed fields, changed types/behaviour); additive changes don't need a new version.
- Run v1 and v2 side by side, announce deprecation (`Deprecation`/`Sunset` headers), then remove.
- Share services between versions; only controllers/serializers differ.

::: text
APIs are contracts. Mobile apps and third parties can't all upgrade at the same time, so **breaking changes need a new version** while the old one keeps working.

| Strategy | Example | Pros | Cons |
|---|---|---|---|
| **URI path** ✅ | `/api/v1/users` | Explicit, easy to route & cache, visible in logs | "Not pure REST" (the resource URL changes) |
| Header | `Accept: application/vnd.myapp.v2+json` | Clean URLs | Harder to test in a browser, easy to miss |
| Query param | `/users?version=2` | Easy | Messy, caching issues |

### Breaking vs non-breaking
- **Non-breaking** (no new version): adding an optional field, adding a new endpoint, adding an optional query param.
- **Breaking** (new version): removing or renaming a field, changing a type (`price: "10"` → `price: 10`), changing auth, changing error formats, changing default behaviour.

### Lifecycle
Release v2 → mark v1 **deprecated** (`Deprecation: true`, `Sunset: <date>` headers, docs, emails) → monitor v1 traffic → remove v1.
:::

::: code javascript URI versioning in Express
const express = require('express');
const app = express();

// v1 & v2 routers reuse the same service; only the response shape differs
const v1 = express.Router();
const v2 = express.Router();

v1.get('/users/:id', async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.set('Deprecation', 'true').set('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  res.json({ id: user.id, name: `${user.firstName} ${user.lastName}` }); // old shape
});

v2.get('/users/:id', async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json({ id: user.id, firstName: user.firstName, lastName: user.lastName }); // new shape
});

app.use('/api/v1', v1);
app.use('/api/v2', v2);
:::

::: ask
- *"Who consumes the API: only our React app (deploy together, versioning less critical) or mobile / third parties (strict versioning)?"*
- *"How long must old versions be supported?"*
:::

::: links
Microsoft REST API guidelines: versioning | https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#api-versioning
:::

=== Difference between application-level and router-level middleware
@p 2
@tags middleware, router
@quick
- **Application-level**: `app.use()` / `app.get()`; applies to the whole app (or a path prefix).
- **Router-level**: `router.use()` on an `express.Router()` instance; applies only to routes in that router.
- Routers = **mini-apps** for modular code: `app.use('/api/admin', adminRouter)`.
- Use router-level for feature-specific concerns (e.g. `authorize('admin')` on all admin routes).

::: text
Both work the same way. The difference is **scope**.

| | Application-level | Router-level |
|---|---|---|
| Bound to | `app` (the Express instance) | an `express.Router()` instance |
| Scope | Every request (or a path prefix) | Only requests routed into that router |
| Typical use | `helmet`, `cors`, `express.json`, logging, global rate limit, error handler | auth for `/admin`, validation for a module, module-specific logging |

A **Router** is a *mini-application* with its own middleware and routes. It keeps code modular: each feature exports a router, and `app.js` mounts it at a prefix.
:::

::: code javascript App-level vs router-level
const express = require('express');
const app = express();

// ---- Application-level ----
app.use(express.json());                    // every request
app.use('/api', (req, res, next) => {       // every /api/* request
  req.startedAt = Date.now();
  next();
});

// ---- Router-level ----
const adminRouter = express.Router();
adminRouter.use(authenticate);              // only admin routes
adminRouter.use(authorize('admin'));
adminRouter.get('/stats', (req, res) => res.json({ users: 120 }));
adminRouter.delete('/users/:id', (req, res) => res.status(204).end());

const publicRouter = express.Router();
publicRouter.get('/products', (req, res) => res.json([]));  // no auth here

app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// Router with mergeParams to access parent params: /api/users/:userId/orders
const ordersRouter = express.Router({ mergeParams: true });
ordersRouter.get('/', (req, res) => res.json({ userId: req.params.userId }));
app.use('/api/users/:userId/orders', ordersRouter);
:::

::: ask
- A follow-up might be *"How would you apply auth to everything except login/register?"* Answer: mount the public auth router **before** a global `authenticate`, or apply `authenticate` at router level only on protected routers.
:::

::: links
Express Router docs | https://expressjs.com/en/4x/api.html#router
:::

=== What is Express.js?
@p 2
@tags express, basics
@quick
- Minimal, unopinionated **web framework for Node.js**: routing, middleware, request/response helpers.
- Built on top of Node's `http` module.
- Core ideas: **app, routes, middleware, req/res, error handler**.
- Alternatives: **Fastify** (faster, schema-based), **NestJS** (opinionated, TypeScript, DI), Koa, Hono.

::: text
**Express** is a **minimal and flexible** Node.js web framework. It wraps Node's low-level `http` module and adds:
- **Routing**: `app.get('/users/:id', handler)` with params, query and route chaining
- **Middleware pipeline**: composable functions for cross-cutting concerns
- **Helpers**: `res.json()`, `res.status()`, `req.params`, `req.query`, `res.cookie()`, `express.static()`
- **Huge ecosystem**: cors, helmet, multer, passport, express-rate-limit and more

It's **unopinionated**: no fixed folder structure, ORM or DI. That's flexible, but the team has to define the architecture itself (see *"How would you structure a production app"*).

| Framework | Why pick it |
|---|---|
| **Express** | Most popular, simple, huge ecosystem |
| **Fastify** | ~2–3× faster, built-in JSON-schema validation, good TypeScript support |
| **NestJS** | Angular-like structure, DI, decorators; great for big teams |
:::

::: code javascript Minimal REST API in Express
const express = require('express');
const app = express();
app.use(express.json());

let todos = [{ id: 1, title: 'Learn event loop', done: false }];

app.get('/api/todos', (req, res) => res.json(todos));
app.get('/api/todos/:id', (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ message: 'Not found' });
  res.json(todo);
});
app.post('/api/todos', (req, res) => {
  const todo = { id: Date.now(), title: req.body.title, done: false };
  todos.push(todo);
  res.status(201).location(`/api/todos/${todo.id}`).json(todo);
});
app.patch('/api/todos/:id', (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ message: 'Not found' });
  Object.assign(todo, req.body);
  res.json(todo);
});
app.delete('/api/todos/:id', (req, res) => {
  todos = todos.filter((t) => t.id !== Number(req.params.id));
  res.status(204).end();
});

app.listen(3000, () => console.log('API on http://localhost:3000'));
:::

::: ask
- If they use **NestJS** or **Fastify** at the company, say you'd adapt quickly because the concepts (middleware/guards, controllers, services, DI) transfer.
:::

::: links
Express official site | https://expressjs.com
Fastify | https://fastify.dev
NestJS | https://nestjs.com
:::
