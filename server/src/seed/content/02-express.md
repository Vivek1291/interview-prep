@section Express.js
@icon 🚂
@color #f59e0b
@desc Middleware, routing order, error handling, project structure, JWT auth, validation, pagination, uploads, filtering, error contracts and versioning, explained simply, measured, and with complete runnable Express 5 code.

=== What is middleware in Express?
@p 3
@tags middleware, express
@quick
- Middleware = a function `(req, res, next)` that runs **between the request arriving and the response leaving**.
- It can run code, **change `req`/`res`**, **end the response**, or call `next()` (continue) / `next(err)` (jump to error handling).
- Typical uses: security headers, CORS, body parsing, logging, request ids, auth, validation, rate limiting, errors.
- Every middleware must **either respond or call `next()`**; otherwise the request hangs.
- Error middleware is recognised by **four parameters**: `(err, req, res, next)`.

::: text 🧒 In simple words
Think of an **airport**. Before you reach your plane (the route handler), you pass a series of checkpoints: check-in, security scan, passport control, boarding gate. Each checkpoint can **let you continue** (`next()`), **add a stamp to your passport** (put data on `req`, like `req.user`), or **stop you** ("no boarding pass", responding with 401). Middleware is exactly that: a line of small checkpoints every request walks through, in a fixed order, before it gets an answer.
:::

::: text 📖 Detailed answer
Middleware is any function with access to the request object, the response object and `next`. Express is essentially **a pipeline of middleware**; even route handlers are middleware that happen to send the response.

### What a middleware can do
| Action | Example |
|---|---|
| Run code | Start a timer, log the request |
| Modify `req` / `res` | `req.user = payload`, `res.setHeader('X-Request-Id', id)` |
| End the cycle | `res.status(401).json({ error: 'Login required' })` |
| Continue | `next()` |
| Report an error | `next(err)` → skips normal middleware, goes to error middleware |

### Kinds of middleware
| Kind | Registered with | Example |
|---|---|---|
| Application-level | `app.use()` / `app.METHOD()` | `app.use(express.json())` |
| Router-level | `router.use()` | `adminRouter.use(requireAdmin)` |
| Built-in | `express.json`, `express.urlencoded`, `express.static` | Body parsing, static files |
| Third-party | npm packages | `helmet`, `cors`, `express-rate-limit`, `multer` |
| Error-handling | 4 arguments | `app.use((err, req, res, next) => …)` |

### Writing good middleware
- Keep each one **small and single-purpose** (auth ≠ logging ≠ validation).
- Make configurable ones **factories**: `requireRole('admin')` returns a middleware.
- Use `res.on('finish')` to run code after the response (logging duration).
- In Express 5, an `async` middleware that rejects automatically goes to error handling; in Express 4 you must call `next(err)`.
:::

::: diagram Middleware pipeline
flowchart LR
  REQ(["HTTP request"]) --> M1["helmet + cors"] --> M2["express.json"] --> M3["requestId + logger"] --> M4["authenticate"] --> M5["validate"] --> H["route handler"] --> RES(["HTTP response"])
  M4 -.->|"no token: 401"| RES
  H -.->|"next(err) or rejected promise"| E["error middleware"] --> RES
:::

::: image Middleware as airport checkpoints: continue, stamp the passport, or stop the passenger
/images/express/middleware.svg
:::

::: text 🪜 Step by step
What happens for `GET /partner` with the code below and no `x-api-key` header:
1. Express receives the request and starts at the **first registered** layer: `express.json()` (nothing to parse for a GET) → `next()`.
2. `requestId` reads or creates an id, puts it on `req.id` and the `X-Request-Id` header → `next()`.
3. `requestLogger` registers a `finish` listener and calls `next()`.
4. The route `/partner` matches; its first callback, `requireHeader('x-api-key')`, finds no header and **responds 400** without calling `next()`.
5. The route handler never runs; the response is sent; the `finish` event fires and the logger prints `GET /partner → 400 (1ms)`.
:::

::: code javascript Write your own middleware (node middleware.js)
// How to run: npm install express && node middleware.js
// Then: curl -i localhost:3000/public   and   curl -i localhost:3000/partner   and   curl -i -H "x-api-key: k1" localhost:3000/partner
const express = require('express');
const crypto = require('crypto');

const app = express();

// 1) Request id: modifies req and res, then continues
function requestId(req, res, next) {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

// 2) Logger: runs code AFTER the response is finished
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(1)}ms) id=${req.id}`);
  });
  next();
}

// 3) Factory: configurable middleware that can END the request
const requireHeader = (name) => (req, res, next) => {
  if (!req.get(name)) return res.status(400).json({ error: `Missing header ${name}` });
  return next();
};

app.use(express.json());               // parse JSON bodies before any route reads req.body
app.use(requestId);
app.use(requestLogger);

app.get('/public', (req, res) => res.json({ ok: true, requestId: req.id }));
app.get('/partner', requireHeader('x-api-key'), (req, res) => res.json({ partner: true }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: build a middleware pipeline from scratch (runnable)
// A tiny version of Express's dispatch loop: run middleware in order, stop when one responds.
function runPipeline(middlewares, req) {
  const reply = { status: 200, body: null, sent: false, send(code, body) { this.status = code; this.body = body; this.sent = true; } };
  let i = 0;
  const next = (err) => {
    if (reply.sent) return;
    const mw = middlewares[i++];
    if (!mw) return reply.send(404, 'Not found');
    if (err) return next(err);                         // simplification: skip normal middleware on error
    try { mw(req, reply, next); } catch (e) { reply.send(500, e.message); }
  };
  next();
  return reply;
}

const trace = [];
const logger = (req, reply, next) => { trace.push('logger'); next(); };
const auth = (req, reply, next) => { trace.push('auth'); if (!req.token) return reply.send(401, 'Login required'); req.user = 'asha'; return next(); };
const handler = (req, reply) => { trace.push('handler'); reply.send(200, `hello ${req.user}`); };

const ok = runPipeline([logger, auth, handler], { token: 't' });
console.log('with token →', ok.status, ok.body, ok.status === 200 && ok.body === 'hello asha' ? '✅' : '❌ FAIL');
trace.length = 0;
const denied = runPipeline([logger, auth, handler], {});
console.log('without token →', denied.status, trace.join(' > '), denied.status === 401 && !trace.includes('handler') ? '✅' : '❌ FAIL');
const hang = runPipeline([(req, reply, next) => { /* forgot next() and never responded */ }], {});
console.log('forgot next() → never sent (request would hang)', hang.sent === false ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Forgetting `next()` **and** not sending a response → the request hangs until a timeout.
- Calling `next()` after sending a response → "Cannot set headers after they are sent".
- Registering `express.json()` **after** routes that read `req.body` (it's `undefined`).
- Writing an error handler with 3 parameters: Express treats it as normal middleware.
- Doing heavy synchronous work in middleware that runs for every request.
:::

::: understand
- **Order is the program**: middleware runs in registration order, so security and parsing go first, error handling last.
- Middleware is how Express does **cross-cutting concerns** without repeating code in every route.
- The same idea exists elsewhere: Axios interceptors, Redux middleware, Next.js `middleware.ts`, NestJS guards/interceptors.
:::

::: ask
- *"Should it apply globally, to one router or to a single route?"* (app vs router vs route-level).
- For auth middleware: *"Where does the token come from: header or cookie? What happens on expiry?"*
- Trap: middleware that does async work in Express 4 must catch errors and call `next(err)`.
:::

::: important ⭐ Say this in the interview
"Middleware in Express is a function with request, response and next that runs between the request arriving and the response being sent. It can run code, modify the request or response, for example attaching req.user after verifying a token, end the request by responding, or call next to pass control on, or next with an error to jump to the error handler. Express runs middleware in registration order, so I register security headers, CORS and body parsing first, then logging and auth, then routes, then a 404 handler and the error handler with four parameters last. Every middleware must either respond or call next, otherwise the request hangs."
:::

::: links
Express: Using middleware | https://expressjs.com/en/guide/using-middleware.html
Express: Writing middleware | https://expressjs.com/en/guide/writing-middleware.html
Express 5: Migration guide | https://expressjs.com/en/guide/migrating-5.html
:::

=== How does Express middleware execute? (order & next)
@p 3
@tags middleware, next, order
@quick
- Express walks its **stack of layers top to bottom** and runs each one whose **path and method match**.
- `next()` → next matching layer · `next('route')` → skip the rest of this route's callbacks · `next('router')` → leave the router · `next(err)` → error middleware.
- Sending a response ends the cycle; later layers don't run.
- Code written after `next()` runs once the downstream **synchronous** work returns; don't rely on it for async work (use `res.on('finish')`).
- Typical order: security/parsing → logging → rate limit → routes → **404** → **error handler**.

::: text 🧒 In simple words
Imagine a **queue of doors in a corridor**, each with a sign saying which visitors it's for ("anyone", "only /users", "only GET /users/:id"). A visitor walks down the corridor and only stops at doors whose sign matches. At each door, the person inside can wave them on to the next matching door (`next()`), send them home with an answer (respond), say "skip the rest of this office, try the next office" (`next('route')`), or press the **red emergency button** (`next(err)`) that sends them straight to the complaints desk at the end of the corridor (the error handler).
:::

::: text 📖 Detailed answer
Internally Express keeps a **stack of layers** (middleware and routes) in the order you registered them. For every request it walks this stack:

### Matching rules
| Registered with | Matches when |
|---|---|
| `app.use(fn)` | Every request |
| `app.use('/users', fn)` | Path **starts with** `/users` (prefix match; `req.url` is shortened inside) |
| `app.get('/users/:id', fn)` | Method is GET **and** the path matches exactly (with params) |
| `app.all('/x', fn)` | Any method on `/x` |
| `app.use((err, req, res, next) => …)` | Only when an error is being passed along |

### Control flow
| Call | Effect |
|---|---|
| `next()` | Continue to the next matching layer |
| `next('route')` | Skip remaining callbacks of the current `app.METHOD` route, try the next matching route |
| `next('router')` | Leave the current router entirely |
| `next(err)` | Skip all normal layers; run the next **error** middleware |
| `res.json()` / `send()` / `end()` | Response sent; the walk stops |
| `throw` or rejected `async` handler | Express 5: same as `next(err)`; Express 4: only sync throws are caught |

### Recommended order in `app.js`
1. `helmet`, `cors`, `express.json({ limit })`, cookie parser
2. Request id + logger
3. Rate limiting
4. Routers (with route-specific auth/validation)
5. 404 handler (no route matched)
6. Error handler (4 arguments), **last**
:::

::: diagram How Express walks its layer stack
flowchart TD
  R(["GET /users/skip"]) --> L1["app.use: global middleware"]
  L1 -->|"next()"| L2["app.use /users prefix"]
  L2 -->|"next()"| L3["GET /users/:id callback 1"]
  L3 -->|"next('route')"| L5["second GET /users/:id route"]
  L3 -.->|"next()"| L4["GET /users/:id callback 2"]
  L5 --> RES(["response sent, walk stops"])
  L4 --> RES
  L3 -.->|"next(err)"| E["error middleware (4 args)"]
  E --> RES
:::

::: image Express's layer stack: matching layers run in order; next, next('route') and next(err) choose the jump
/images/express/execution-order.svg
:::

::: text 🪜 Step by step
Trace `curl localhost:3000/users/skip` against the server below:
1. Layer 1 `app.use(globalLogger)` matches everything → prints `1 global before` → calls `next()`.
2. Layer 2 `app.use('/users', …)` matches the prefix → prints `2 /users prefix` → `next()`.
3. Layer 3 is the first `GET /users/:id` route: callback #1 prints `3 route callback 1`; because `id === 'skip'` it calls `next('route')`.
4. Callback #2 of that route is **skipped**; Express looks for the next matching route: the second `GET /users/:id` prints `4b second route` and responds.
5. Control returns up the synchronous call chain: layer 1's code after `next()` prints `6 global after next()`.
6. The 404 and error handlers never run because a response was sent.
:::

::: code javascript Trace the execution order (node order.js)
// How to run: npm install express && node order.js
// Then try: curl localhost:3000/users/1   curl localhost:3000/users/skip   curl localhost:3000/users/boom   curl localhost:3000/nope
const express = require('express');
const app = express();

app.use((req, res, next) => {
  console.log('\n1 global before');
  next();
  console.log('6 global after next() returned (sync work only!)');
});

app.use('/users', (req, res, next) => {
  console.log('2 /users prefix, req.url inside is', req.url);
  next();
});

app.get(
  '/users/:id',
  (req, res, next) => {
    console.log('3 route callback 1');
    if (req.params.id === 'skip') return next('route');            // jump to the next matching ROUTE
    if (req.params.id === 'boom') return next(new Error('Boom!'));  // jump to the error handler
    return next();
  },
  (req, res) => {
    console.log('4 route callback 2 → responds');
    res.json({ id: req.params.id });
  },
);

app.get('/users/:id', (req, res) => {
  console.log('4b second route (only reached via next("route"))');
  res.json({ skipped: true });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));    // after all routes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {                                     // last, 4 parameters
  console.log('5 error handler:', err.message);
  res.status(500).json({ error: err.message });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: next(), next('route') and next(err) in a mini router (runnable)
// Each layer: { path test, routeId (for app.get routes), isError, fn }. Mimics Express's dispatch rules.
function dispatch(layers, req) {
  const log = [];
  let idx = 0;
  let response = null;
  const send = (body) => { response = body; };
  const next = (signal) => {
    const skipRoute = signal === 'route' ? layers[idx - 1].routeId : null;   // route we are leaving
    const err = signal instanceof Error ? signal : null;
    while (!response && idx < layers.length) {
      const layer = layers[idx++];
      if (skipRoute && layer.routeId === skipRoute) continue;              // skip the rest of that route
      if (Boolean(err) !== Boolean(layer.isError)) continue;              // errors only visit error layers
      if (!layer.matches(req.path)) continue;
      return err ? layer.fn(err, req, send, next, log) : layer.fn(req, send, next, log);
    }
    if (!response) response = err ? `500 ${err.message}` : '404';
    return undefined;
  };
  next();
  return { response, log };
}

const any = () => true;
const users = (p) => p.startsWith('/users/');
const layers = [
  { matches: any, fn: (req, send, next, log) => { log.push('global'); next(); } },
  { matches: users, routeId: 'A', fn: (req, send, next, log) => {
    log.push('A1');
    if (req.path === '/users/skip') return next('route');
    if (req.path === '/users/boom') return next(new Error('Boom'));
    return next();
  } },
  { matches: users, routeId: 'A', fn: (req, send, next, log) => { log.push('A2'); send('user'); } },
  { matches: users, routeId: 'B', fn: (req, send, next, log) => { log.push('B'); send('skipped'); } },
  { matches: any, isError: true, fn: (err, req, send, next, log) => { log.push('error'); send(`500 ${err.message}`); } },
];

const a = dispatch(layers, { path: '/users/1' });
const b = dispatch(layers, { path: '/users/skip' });
const c = dispatch(layers, { path: '/users/boom' });
const d = dispatch(layers, { path: '/other' });
console.log('normal →', a.log.join(' > '), a.response === 'user' && a.log.join() === 'global,A1,A2' ? '✅' : '❌ FAIL');
console.log("next('route') →", b.log.join(' > '), b.response === 'skipped' && !b.log.includes('A2') ? '✅' : '❌ FAIL');
console.log('next(err) →', c.log.join(' > '), c.response === '500 Boom' && !c.log.includes('B') ? '✅' : '❌ FAIL');
console.log('no route matched → 404', d.response === '404' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Putting the 404 handler **before** routes (everything becomes 404) or the error handler first (never runs).
- Expecting `app.use('/users', fn)` to see the full path in `req.url` (it's stripped: use `req.originalUrl`).
- Relying on code after `next()` to measure async work: it runs as soon as the downstream code *returns*, not when the response is sent.
- Using `next('route')` inside `app.use` (only works in `app.METHOD`/`router.METHOD` routes).
- Calling `next()` twice (e.g. once in a callback and once outside) → double responses.
:::

::: understand
- Express is a **linear dispatcher over an ordered stack**; nearly every Express bug is an ordering bug.
- `next(err)` is a **separate lane** that only error middleware travels.
- Express 5 makes async handlers safe by forwarding rejected promises to that lane automatically.
:::

::: ask
- *"What happens if middleware neither calls next nor responds?"* → the request hangs until a client/server timeout.
- *"Which Express version?"* Async error forwarding differs between 4 and 5.
- *"Should this apply to every route or just some?"* (global, prefix, router or route-level placement).
:::

::: important ⭐ Say this in the interview
"Express keeps an ordered stack of layers and, for each request, walks it top to bottom, running each layer whose path and method match. A middleware calls next to continue, next with 'route' to skip the remaining callbacks of the current route, or next with an error to skip all normal layers and go to error-handling middleware, which has four parameters. Sending a response stops the walk. Because order is everything, I register security and parsing first, then logging and rate limiting, then routes, then a 404 handler, and the error handler last. In Express 5 a rejected async handler is forwarded to the error handler automatically; in Express 4 I wrap handlers so errors reach next."
:::

::: links
Express: Routing guide | https://expressjs.com/en/guide/routing.html
Express: Writing middleware (next) | https://expressjs.com/en/guide/writing-middleware.html
Express 5: Migration guide (async errors) | https://expressjs.com/en/guide/migrating-5.html
:::

=== How do you create error-handling middleware? (handle errors in Express)
@p 3
@tags errors, middleware, async
@quick
- Error middleware has **4 parameters** `(err, req, res, next)` and is registered **after all routes** (plus a 404 handler before it).
- Express 5 forwards **rejected promises** from async handlers automatically; Express 4 needs an `asyncHandler` wrapper (or `next(err)`).
- Throw your own `AppError(status, code, message)`; map library errors (Mongoose `ValidationError`/`CastError`, duplicate key `11000`, JWT, Zod) to 4xx.
- Log 5xx with a **request id**; never send stack traces or DB messages to clients in production.
- If headers were already sent, delegate: `if (res.headersSent) return next(err)`.

::: text 🧒 In simple words
A restaurant can have problems anywhere: the kitchen runs out of an ingredient, a waiter drops a plate, a customer orders something not on the menu. Instead of every waiter improvising an apology, the restaurant has **one manager** who handles all complaints the same professional way: says what went wrong in simple terms, writes the details in the logbook, and never shows customers the messy kitchen. Express error middleware is that **manager at the end of the pipeline**: every error from every route is sent there, turned into a clean response with the right status code, and logged once.
:::

::: text 📖 Detailed answer
Express identifies error-handling middleware by its **arity of 4**: `(err, req, res, next)`. When any layer calls `next(err)` (or throws), Express skips every normal layer and runs the next error middleware.

### How errors reach it
| Source | Express 4 | Express 5 |
|---|---|---|
| Synchronous `throw` in a handler | ✅ caught | ✅ caught |
| `next(err)` | ✅ | ✅ |
| Rejected promise / `await` failure in an `async` handler | ❌ request hangs (unless wrapped) | ✅ forwarded automatically |
| Error in a callback (`fs.readFile(..., (err) => …)`) | Must call `next(err)` | Must call `next(err)` |

### A production-grade setup
1. **`AppError`** class: `status`, machine-readable `code`, `message`, optional `details`, `isOperational = true`.
2. Throw it from services/controllers (`throw new AppError(404, 'USER_NOT_FOUND', 'User not found')`).
3. A **404 handler** after all routes creates an `AppError(404)`.
4. A **central error handler**:
   - normalises known library errors into `AppError`s,
   - logs unexpected (5xx) errors with request id and stack,
   - responds with one JSON shape, hiding internals in production.

### Mapping common errors
| Error | Status | Code |
|---|---|---|
| Zod validation failure | 400 | `VALIDATION_ERROR` |
| Mongoose `ValidationError` | 400 | `VALIDATION_ERROR` |
| Mongoose `CastError` (bad ObjectId) | 400 | `INVALID_ID` |
| MongoDB duplicate key (`code 11000`) | 409 | `DUPLICATE` |
| `JsonWebTokenError` / `TokenExpiredError` | 401 | `INVALID_TOKEN` / `TOKEN_EXPIRED` |
| Body too large (`entity.too.large`) / bad JSON (`entity.parse.failed`) | 413 / 400 | `PAYLOAD_TOO_LARGE` / `INVALID_JSON` |
| Anything else | 500 | `INTERNAL_ERROR` (generic message) |
:::

::: diagram From throw to JSON response
flowchart TD
  A["handler throws or rejects"] --> B{"Express 5 or asyncHandler?"}
  B -->|"yes"| C["next(err)"]
  B -->|"Express 4 without wrapper"| H["request hangs"]
  C --> D["errorHandler(err, req, res, next)"]
  D --> E{"known error type?"}
  E -->|"AppError, Zod, Mongoose, JWT, 11000"| F["4xx + code + message"]
  E -->|"unknown"| G["log stack with request id, 500 generic"]
:::

::: image One manager for all complaints: errors from any layer converge on a single error handler
/images/express/error-middleware.svg
:::

::: text 🪜 Step by step
`GET /users/abc` with the app below:
1. The route handler is `async`; it calls `findUser('abc')`, which throws `new AppError(400, 'INVALID_ID', 'id must be a number')`.
2. The returned promise rejects. Express 5 catches the rejection and calls `next(err)`.
3. Express skips the 404 handler (a normal middleware) and reaches `errorHandler`.
4. `errorHandler` sees `err instanceof AppError` → status 400, keeps the code and message; no stack logging because it's not a 5xx.
5. It responds `400 { "error": { "code": "INVALID_ID", "message": "id must be a number", "requestId": "…" } }`.
6. For `GET /crash`, a `TypeError` is thrown: the handler logs the full stack with the request id and responds `500 { code: "INTERNAL_ERROR", message: "Something went wrong" }`.
:::

::: code javascript Complete error-handling setup (node errors.js)
// How to run: npm install express && node errors.js
// Then: curl -i localhost:3000/users/1  /users/abc  /users/99  /crash  /nope
//       curl -i -X POST localhost:3000/echo -H "Content-Type: application/json" -d '{bad json'
const express = require('express');
const crypto = require('crypto');

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;                 // expected problem (bad input), not a bug
  }
}

// Express 4 needs this wrapper for async handlers; Express 5 forwards rejections by itself (harmless there)
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const users = new Map([[1, { id: 1, name: 'Asha' }]]);
async function findUser(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'id must be a number');
  const user = users.get(id);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}

const app = express();
app.use((req, res, next) => { req.id = crypto.randomUUID(); next(); });
app.use(express.json({ limit: '10kb' }));

app.get('/users/:id', asyncHandler(async (req, res) => res.json(await findUser(req.params.id))));
app.get('/crash', () => { const config = undefined; return config.port; });   // a real bug → 500
app.post('/echo', (req, res) => res.json(req.body));

// 404: after all routes
app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`)));

// Error handler: LAST, four parameters
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);                       // let Express close the connection
  let e = err;
  if (err.type === 'entity.parse.failed') e = new AppError(400, 'INVALID_JSON', 'Body is not valid JSON');
  else if (err.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Body too large');
  else if (err.name === 'ValidationError') e = new AppError(400, 'VALIDATION_ERROR', err.message);   // Mongoose
  else if (err.name === 'CastError') e = new AppError(400, 'INVALID_ID', `Invalid ${err.path}`);
  else if (err.code === 11000) e = new AppError(409, 'DUPLICATE', 'Duplicate value', err.keyValue);
  else if (err.name === 'TokenExpiredError') e = new AppError(401, 'TOKEN_EXPIRED', 'Token expired');
  else if (err.name === 'JsonWebTokenError') e = new AppError(401, 'INVALID_TOKEN', 'Invalid token');

  const known = e instanceof AppError;
  const status = known ? e.status : 500;
  if (!known) console.error(`[${req.id}]`, err.stack);           // log real bugs with their stack
  return res.status(status).json({
    error: {
      code: known ? e.code : 'INTERNAL_ERROR',
      message: known ? e.message : 'Something went wrong',      // never leak internals
      ...(known && e.details ? { details: e.details } : {}),
      requestId: req.id,
    },
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: map any error to one response shape (runnable)
class AppError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
function toResponse(err, { production = true } = {}) {
  let e = err;
  if (err.name === 'CastError') e = new AppError(400, 'INVALID_ID', `Invalid ${err.path}`);
  if (err.code === 11000) e = new AppError(409, 'DUPLICATE', 'Duplicate value');
  if (err.name === 'TokenExpiredError') e = new AppError(401, 'TOKEN_EXPIRED', 'Token expired');
  const known = e instanceof AppError;
  return {
    status: known ? e.status : 500,
    body: { code: known ? e.code : 'INTERNAL_ERROR', message: known || !production ? e.message : 'Something went wrong' },
  };
}

const cases = [
  [new AppError(404, 'USER_NOT_FOUND', 'User not found'), 404, 'USER_NOT_FOUND'],
  [Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError', path: '_id' }), 400, 'INVALID_ID'],
  [Object.assign(new Error('E11000 duplicate key'), { code: 11000 }), 409, 'DUPLICATE'],
  [Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }), 401, 'TOKEN_EXPIRED'],
  [new TypeError("Cannot read properties of undefined (reading 'port')"), 500, 'INTERNAL_ERROR'],
];
for (const [err, status, code] of cases) {
  const r = toResponse(err);
  console.log(`${err.name}: ${r.status} ${r.body.code}`, r.status === status && r.body.code === code ? '✅' : '❌ FAIL');
}
console.log('bug message hidden in production', toResponse(new TypeError('secret path /etc/x')).body.message === 'Something went wrong' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Registering the error handler before routes, or with only 3 parameters (Express won't treat it as an error handler).
- Async handlers in Express 4 without a wrapper → unhandled rejection and a hanging request.
- Sending stack traces, SQL/Mongo messages or file paths to clients.
- Returning `200 { error: … }` instead of a real status code.
- Responding again when headers were already sent (streaming responses): delegate with `next(err)`.
:::

::: understand
- Central error handling turns many failure types into **one contract** that the frontend can rely on.
- Separate **operational** errors (expected, 4xx, no alert) from **programmer** errors (bugs, 5xx, log and alert).
- Error codes (`USER_NOT_FOUND`) are for machines and translations; messages are for people.
:::

::: ask
- *"Express 4 or 5?"* (decides whether you need `asyncHandler`).
- *"Is there an existing error format the clients depend on?"*
- *"Where are errors monitored?"* (Sentry, CloudWatch, Datadog) and should 4xx be logged at all?
:::

::: important ⭐ Say this in the interview
"I create one error-handling middleware with four parameters, registered after all routes and after a 404 handler. Controllers and services just throw an AppError with a status, a machine-readable code and a message. In Express 5 rejected promises from async handlers reach the error handler automatically; in Express 4 I wrap handlers with an asyncHandler that forwards to next. The handler maps known library errors to 4xx, for example a duplicate key to 409, an invalid ObjectId to 400 and expired tokens to 401, logs unexpected errors with the request id and stack, and returns a generic 500 message so internals never leak. Every error has the same JSON shape, which keeps the frontend simple."
:::

::: links
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
Express 5: Migration guide (rejected promises) | https://expressjs.com/en/guide/migrating-5.html#rejected-promises
Node.js best practices: error handling | https://github.com/goldbergyoni/nodebestpractices#2-error-handling-practices
:::

=== How would you structure a production Node.js / Express application?
@p 3
@tags architecture, layers, clean-code
@quick
- Layers: **Route → Controller → Service → Repository → DB**; each knows only the layer below it.
- Route = URL + middleware · Controller = HTTP in/out (no business rules) · Service = business rules (no `req`/`res`) · Repository = data access.
- Benefits: testability (swap the repository for an in-memory one), reuse (call services from jobs/CLIs), replaceable DB, clear ownership.
- Production extras: config validated at startup, `app.js` separate from `server.js`, central errors, structured logs, health check, graceful shutdown.
- Feature folders (`modules/users/*`) scale better than one folder per layer in big apps.

::: text 🧒 In simple words
A well-run restaurant separates jobs. The **host** (route) decides which table you go to. The **waiter** (controller) takes your order and brings the food, but doesn't cook. The **chef** (service) knows the recipes and the rules ("no peanuts for table 4"). The **storeroom keeper** (repository) fetches ingredients from the fridge (database) and doesn't care what's being cooked. If you replace the fridge with a new one, only the storeroom keeper has to learn it; if a recipe changes, only the chef changes. Code organised this way is easier to test, change and hand over to new people.
:::

::: text 📖 Detailed answer
### Responsibilities
| Layer | Does | Must not |
|---|---|---|
| **Route** | Map method + path → middleware → controller | Contain logic |
| **Middleware** | Auth, validation, rate limits, request ids | Know business rules of a feature |
| **Controller** | Read `req` (params, query, body), call a service, choose status code, send `res` | Talk to the DB, contain business rules |
| **Service** | Business rules, orchestration (DB + email + cache), transactions | Use `req`/`res` or HTTP status codes directly |
| **Repository** | Queries (Mongoose/SQL), mapping DB documents to plain objects | Contain business rules |
| **Model / schema** | Data shape, indexes | — |

### Why separate them
| Benefit | Example |
|---|---|
| Testability | Unit-test `userService.register` with an in-memory repository; API-test the app with Supertest without a real DB |
| Reuse | The same service powers REST, a queue worker, a cron job and a CLI script |
| Replaceability | Moving from MongoDB to Postgres touches only repositories |
| Readability | Every developer knows where code lives |

### Folder structure (feature-based)
| Path | Contents |
|---|---|
| `src/config.js` | Reads and **validates** env vars once at startup |
| `src/app.js` | Builds and exports the Express app (no `listen`) → importable by tests |
| `src/server.js` | Creates dependencies, calls `listen`, graceful shutdown |
| `src/modules/users/` | `user.routes.js`, `user.controller.js`, `user.service.js`, `user.repository.memory.js`, `user.repository.mongoose.js`, `user.validator.js` |
| `src/middleware/` | `errorHandler.js` (plus auth, rate limit…) |
| `src/utils/` | `AppError.js` |
| `test/` | API tests with `node:test` + Supertest |

### Production checklist
Config validation · structured logging (pino) with request ids · `helmet`, CORS, rate limiting · health endpoint · graceful shutdown on `SIGTERM` · central error handler · API docs (OpenAPI) · tests in CI.
:::

::: diagram Request flow through the layers
flowchart LR
  C(["Client"]) --> R["Route: POST /api/v1/users"]
  R --> MW["Middleware: validate body"]
  MW --> CT["Controller: read req, send 201"]
  CT --> S["Service: email unique? hash password"]
  S --> RP["Repository: insert user"]
  RP --> DB[("MongoDB or in-memory Map")]
  S --> EXT["Other services: email, cache, S3"]
:::

::: image Restaurant roles: host, waiter, chef and storeroom = route, controller, service and repository
/images/express/layers.svg
:::

::: text 🪜 Step by step
`POST /api/v1/users` with `{ "name": "Asha", "email": "ASHA@x.com", "password": "secret123" }`:
1. **Route** (`user.routes.js`) matches and runs `validate(registerSchema)`, then `controller.register`.
2. **Validator** trims and lowercases the email, checks lengths; invalid input → `AppError(400)` → error handler.
3. **Controller** calls `userService.register(req.body)` and, when it resolves, responds `201` with a `Location` header.
4. **Service** asks the repository whether the email exists (→ `409` if yes), hashes the password with scrypt, saves through the repository, and returns a **public** user object without the hash.
5. **Repository** inserts into the Map (or MongoDB via Mongoose) and returns a plain object.
6. Any thrown `AppError` travels to the central **error handler**, which formats the JSON response.
:::

::: code json express-layers/package.json
{
  "name": "express-layers",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^5.1.0",
    "mongoose": "^8.6.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
:::

::: code javascript express-layers/src/config.js
// Read and validate configuration ONCE at startup; fail fast with a clear message.
function loadConfig(env = process.env) {
  const config = {
    port: Number(env.PORT) || 3000,
    mongoUri: env.MONGO_URI || '',            // empty → in-memory repository
    nodeEnv: env.NODE_ENV || 'development',
  };
  if (!Number.isInteger(config.port) || config.port <= 0) throw new Error('PORT must be a positive integer');
  return config;
}

module.exports = { loadConfig };
:::

::: code javascript express-layers/src/utils/AppError.js
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { AppError };
:::

::: code javascript express-layers/src/middleware/errorHandler.js
const { AppError } = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = err instanceof AppError;
  if (!known) console.error(err);                              // real bug: log the stack
  res.status(known ? err.status : 500).json({
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Something went wrong',
      ...(known && err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
:::

::: code javascript express-layers/src/modules/users/user.validator.js
const { AppError } = require('../../utils/AppError');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a middleware that validates and normalises req.body for registration. */
function validateRegister(req, res, next) {
  const body = req.body || {};
  const details = {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (name.length < 2) details.name = 'At least 2 characters';
  if (!EMAIL.test(email)) details.email = 'Must be a valid email';
  if (typeof body.password !== 'string' || body.password.length < 8) details.password = 'At least 8 characters';
  if (Object.keys(details).length) return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid input', details));
  req.body = { name, email, password: body.password };        // only allowed fields continue (no "role")
  return next();
}

module.exports = { validateRegister };
:::

::: code javascript express-layers/src/modules/users/user.repository.memory.js
// In-memory repository: used by tests and when no MONGO_URI is set. Same interface as the Mongoose one.
const crypto = require('crypto');

function createMemoryUserRepository() {
  const users = new Map();
  return {
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email) || null;
    },
    async create(data) {
      const user = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
      users.set(user.id, user);
      return { ...user };
    },
    async list({ skip, limit }) {
      const all = [...users.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: all.slice(skip, skip + limit).map((u) => ({ ...u })), total: all.length };
    },
  };
}

module.exports = { createMemoryUserRepository };
:::

::: code javascript express-layers/src/modules/users/user.repository.mongoose.js
// MongoDB repository with Mongoose: SAME methods as the in-memory one, so the service doesn't change.
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);
const User = mongoose.models.User || mongoose.model('User', userSchema);

const toPlain = (doc) => doc && ({ id: String(doc._id), name: doc.name, email: doc.email, createdAt: doc.createdAt });

function createMongooseUserRepository() {
  return {
    async findByEmail(email) {
      return toPlain(await User.findOne({ email }).lean());
    },
    async create(data) {
      return toPlain(await User.create(data));
    },
    async list({ skip, limit }) {
      const [items, total] = await Promise.all([
        User.find().sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(),
      ]);
      return { items: items.map(toPlain), total };
    },
  };
}

module.exports = { createMongooseUserRepository, User };
:::

::: code javascript express-layers/src/modules/users/user.service.js
// Business rules only: no req/res, no HTTP knowledge beyond AppError.
const crypto = require('crypto');
const { promisify } = require('util');
const { AppError } = require('../../utils/AppError');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);               // slow on purpose, runs on the thread pool
  return `${salt}:${hash.toString('hex')}`;
}

const toPublic = ({ id, name, email, createdAt }) => ({ id, name, email, createdAt });

function createUserService({ userRepository }) {
  return {
    async register({ name, email, password }) {
      if (await userRepository.findByEmail(email)) throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
      const user = await userRepository.create({ name, email, passwordHash: await hashPassword(password) });
      return toPublic(user);
    },
    async list({ page, limit }) {
      const { items, total } = await userRepository.list({ skip: (page - 1) * limit, limit });
      return { items: items.map(toPublic), page, limit, total, totalPages: Math.ceil(total / limit) };
    },
  };
}

module.exports = { createUserService };
:::

::: code javascript express-layers/src/modules/users/user.controller.js
// HTTP in, HTTP out. Reads req, calls the service, picks the status code.
function createUserController({ userService }) {
  return {
    async register(req, res) {
      const user = await userService.register(req.body);
      res.status(201).location(`/api/v1/users/${user.id}`).json({ data: user });
    },
    async list(req, res) {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
      res.json(await userService.list({ page, limit }));
    },
  };
}

module.exports = { createUserController };
:::

::: code javascript express-layers/src/modules/users/user.routes.js
const express = require('express');
const { validateRegister } = require('./user.validator');

// Express 5 forwards rejected promises from these async handlers to the error handler.
function createUserRouter({ userController }) {
  const router = express.Router();
  router.post('/', validateRegister, userController.register);
  router.get('/', userController.list);
  return router;
}

module.exports = { createUserRouter };
:::

::: code javascript express-layers/src/app.js
// Builds the app from injected dependencies. No listen() here, so tests can import it.
const express = require('express');
const { createUserService } = require('./modules/users/user.service');
const { createUserController } = require('./modules/users/user.controller');
const { createUserRouter } = require('./modules/users/user.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp({ userRepository }) {
  const userService = createUserService({ userRepository });
  const userController = createUserController({ userService });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/users', createUserRouter({ userController }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
:::

::: code javascript express-layers/src/server.js
// Composition root: choose real dependencies, start listening, shut down gracefully.
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createMemoryUserRepository } = require('./modules/users/user.repository.memory');
const { createMongooseUserRepository } = require('./modules/users/user.repository.mongoose');

async function main() {
  const config = loadConfig();
  let userRepository;
  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    userRepository = createMongooseUserRepository();
    console.log('Using MongoDB');
  } else {
    userRepository = createMemoryUserRepository();
    console.log('Using in-memory storage (set MONGO_URI to use MongoDB)');
  }

  const server = createApp({ userRepository }).listen(config.port, () => console.log(`API on http://localhost:${config.port}`));

  const shutdown = () => {
    console.log('Shutting down…');
    server.close(async () => {                     // stop accepting connections, finish in-flight requests
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
:::

::: code javascript express-layers/test/users.test.js
// Run: npm test   (uses the in-memory repository: no database needed)
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createMemoryUserRepository } = require('../src/modules/users/user.repository.memory');

test('register, reject duplicates, validate input, list', async () => {
  const app = createApp({ userRepository: createMemoryUserRepository() });

  const created = await request(app).post('/api/v1/users').send({ name: ' Asha ', email: 'ASHA@x.com', password: 'secret123', role: 'admin' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.email, 'asha@x.com');
  assert.equal(created.body.data.passwordHash, undefined);         // never leaked
  assert.equal(created.body.data.role, undefined);                 // mass assignment blocked

  const dup = await request(app).post('/api/v1/users').send({ name: 'Asha', email: 'asha@x.com', password: 'secret123' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'EMAIL_TAKEN');

  const bad = await request(app).post('/api/v1/users').send({ name: 'A', email: 'nope', password: '1' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.error.details).sort(), ['email', 'name', 'password']);

  const list = await request(app).get('/api/v1/users?page=1&limit=10');
  assert.equal(list.body.total, 1);

  const missing = await request(app).get('/nope');
  assert.equal(missing.status, 404);
});
:::

::: code javascript Browser demo: swap the repository, keep the service (runnable)
// The service depends on an interface (findByEmail, create), so tests can inject a fake.
class AppError extends Error { constructor(status, code) { super(code); Object.assign(this, { status, code }); } }

function createUserService({ userRepository, hash }) {
  return {
    async register({ name, email, password }) {
      if (await userRepository.findByEmail(email)) throw new AppError(409, 'EMAIL_TAKEN');
      const user = await userRepository.create({ name, email, passwordHash: await hash(password) });
      return { id: user.id, name: user.name, email: user.email };        // public shape only
    },
  };
}

const memoryRepo = () => {
  const rows = [];
  return {
    findByEmail: async (email) => rows.find((r) => r.email === email) || null,
    create: async (data) => { const row = { id: rows.length + 1, ...data }; rows.push(row); return row; },
    rows,
  };
};

(async () => {
  const repo = memoryRepo();
  const service = createUserService({ userRepository: repo, hash: async (p) => `hashed(${p.length})` });
  const user = await service.register({ name: 'Asha', email: 'asha@x.com', password: 'secret123' });
  console.log('registered →', JSON.stringify(user), user.id === 1 && !('passwordHash' in user) ? '✅' : '❌ FAIL');
  console.log('repository stored the hash, not the password', repo.rows[0].passwordHash === 'hashed(9)' ? '✅' : '❌ FAIL');
  let code = '';
  try { await service.register({ name: 'X', email: 'asha@x.com', password: 'another1' }); } catch (e) { code = e.code; }
  console.log('duplicate email → 409 EMAIL_TAKEN', code === 'EMAIL_TAKEN' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Business logic in controllers ("fat controllers") or `req`/`res` passed into services.
- Repositories that make business decisions (e.g. checking permissions inside queries).
- Calling `listen()` in `app.js` → tests can't import the app without opening a port.
- Reading `process.env` everywhere instead of one validated config module.
- Over-engineering a tiny API with five layers; add a repository layer when it pays off.
:::

::: understand
- Layering is about **dependencies pointing inward**: controllers depend on services, services on repository *interfaces*.
- **Dependency injection** (passing `userRepository` into `createUserService`) is what makes swapping and testing easy, no framework required.
- Interviewers look for: controller without logic, service without HTTP, repository without rules, and tests.
:::

::: ask
- *"How big is the team and the app?"* A small API can merge service and repository; add layers as it grows.
- *"Monolith or microservices? Are there background workers?"* Services are then shared between API and workers.
- Trap: "Clean architecture" with dozens of folders for a 3-endpoint app; show pragmatism.
:::

::: important ⭐ Say this in the interview
"I structure Express apps in layers by feature. Routes map URLs to middleware and a controller; the controller only reads the request, calls a service and chooses the status code; the service holds the business rules, such as checking that an email is unique and hashing the password, and knows nothing about HTTP; the repository does the database queries. Dependencies are injected, so in tests I pass an in-memory repository and test the whole API with Supertest without a database, and swapping MongoDB for something else only touches the repository. app.js builds the app without listening, server.js wires real dependencies and handles graceful shutdown, config is validated at startup, and one error handler formats every error."
:::

::: links
Node.js best practices: project architecture | https://github.com/goldbergyoni/nodebestpractices#1-project-architecture-practices
Express: Production best practices | https://expressjs.com/en/advanced/best-practice-performance.html
Supertest | https://github.com/ladjs/supertest
Node.js: Test runner | https://nodejs.org/api/test.html
:::

=== How do you handle authentication middleware? (JWT)
@p 3
@tags auth, jwt, middleware, rbac
@quick
- `authenticate`: read `Authorization: Bearer <token>` → `jwt.verify(token, secret, { algorithms: ['HS256'] })` → `req.user` → `next()`; missing/invalid/expired → **401**.
- `authorize(...roles)` / ownership checks → **403** when logged in but not allowed.
- Short-lived **access token** (~15 min) in memory + long-lived **refresh token** in an **httpOnly, Secure, SameSite** cookie, **rotated** on every refresh.
- A JWT is **signed, not encrypted**: anyone can read the payload, so no secrets or PII in it.
- Secrets from env/Secrets Manager; hash passwords with scrypt/bcrypt/argon2, never plain SHA.

::: text 🧒 In simple words
A JWT is like a **festival wristband** printed by the ticket office. It says who you are and which areas you may enter, and it has a **tamper-proof stamp** (the signature). Guards (middleware) don't phone the ticket office for every person: they just check that the stamp is genuine and the wristband hasn't expired. Anyone can *read* the wristband, so you'd never write your bank PIN on it. Because a wristband can't be taken back easily, it's short-lived; when it expires, you show your **locker key** (refresh cookie) at the office to get a fresh one.
:::

::: text 📖 Detailed answer
**Authentication** answers *who are you?*; **authorization** answers *what may you do?*

### The flow
1. **Login**: verify email + password (hash comparison) → sign an **access token** `{ sub: userId, role }` with a short expiry, and a **refresh token** (long expiry) set as an httpOnly cookie.
2. **Each request**: the client sends `Authorization: Bearer <access token>`.
3. **`authenticate`** verifies signature, algorithm and expiry → sets `req.user`.
4. **`authorize('admin')`** or an ownership check decides → `403` if not allowed.
5. **Refresh**: when the access token expires (401), the client calls `/auth/refresh`; the cookie is sent automatically; the server **rotates** the refresh token and returns a new access token.

### 401 vs 403
| Status | Meaning | Example |
|---|---|---|
| 401 Unauthorized | Not authenticated: no/invalid/expired token | Missing header, bad signature |
| 403 Forbidden | Authenticated but not permitted | A `user` calling an admin route |

### Where to keep tokens (browser)
| Storage | XSS can steal it? | CSRF risk? | Verdict |
|---|---|---|---|
| `localStorage` | Yes | No | Avoid for long-lived tokens |
| Memory (JS variable) | Only while the page is compromised | No | ✅ access token |
| httpOnly + Secure + SameSite cookie | No (JS can't read it) | Mitigated by SameSite | ✅ refresh token |

### JWT trade-offs
- **Stateless**: no DB lookup per request, works across services.
- **Hard to revoke** before expiry → keep access tokens short; keep a **denylist** (Redis) or check a `tokenVersion` for "log out everywhere".
:::

::: diagram Login, authenticated request and refresh
sequenceDiagram
  participant B as Browser
  participant A as Express API
  participant M as authenticate middleware
  B->>A: POST /auth/login (email, password)
  A->>A: verify password hash
  A-->>B: 200 accessToken + Set-Cookie refreshToken (httpOnly)
  B->>M: GET /orders (Bearer accessToken)
  M->>M: jwt.verify: signature, alg HS256, exp
  alt valid
    M->>A: req.user, next()
    A-->>B: 200 orders
  else expired
    M-->>B: 401 TOKEN_EXPIRED
    B->>A: POST /auth/refresh (cookie sent automatically)
    A-->>B: new accessToken + rotated cookie
  end
:::

::: image The JWT wristband: header.payload.signature, readable by anyone, trustworthy only through the signature
/images/express/jwt-auth.svg
:::

::: text 🪜 Step by step
What `authenticate` does for `Authorization: Bearer eyJhbGciOi…`:
1. Splits the header; anything other than `Bearer <token>` → `401 AUTH_REQUIRED`.
2. `jwt.verify` base64url-decodes the header and payload, **recomputes** the HMAC-SHA256 signature with the server secret and compares it.
3. It checks the algorithm is in the allow-list (`HS256`), preventing "alg: none" and algorithm-confusion attacks.
4. It checks `exp` against the current time → `TokenExpiredError` → `401 TOKEN_EXPIRED` (the client should refresh).
5. On success, `req.user = { id: payload.sub, role: payload.role }` and `next()` runs.
6. `authorize('admin')` then compares `req.user.role`; `requireOwner` compares the resource owner with `req.user.id`.
:::

::: code javascript Complete JWT auth: login, refresh rotation, authenticate, authorize, ownership (node auth.js)
// How to run: npm install express jsonwebtoken cookie-parser && node auth.js
// Then:
//   curl -s -c jar -X POST localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"asha@x.com","password":"secret123"}'
//   curl -s localhost:3000/orders/1 -H "Authorization: Bearer <accessToken>"
//   curl -s -b jar -c jar -X POST localhost:3000/auth/refresh
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');   // from env in real apps
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---- demo data: password hashed with scrypt ----
const hash = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const users = [
  { id: 'u1', email: 'asha@x.com', role: 'user', salt: 's1', passwordHash: hash('secret123', 's1') },
  { id: 'u2', email: 'admin@x.com', role: 'admin', salt: 's2', passwordHash: hash('admin1234', 's2') },
];
const orders = [{ id: '1', ownerId: 'u1', total: 42 }, { id: '2', ownerId: 'u2', total: 99 }];
const refreshTokens = new Map();                                     // token → { userId, expiresAt }

// ---- middleware ----
function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const payload = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' });
  }
}

const authorize = (...roles) => (req, res, next) =>
  (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'FORBIDDEN' }));

const requireOrderOwner = (req, res, next) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
  if (req.user.role !== 'admin' && order.ownerId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
  req.order = order;
  return next();
};

// ---- token helpers ----
const signAccess = (user) => jwt.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
function issueRefresh(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');        // opaque random token, stored server-side
  refreshTokens.set(token, { userId, expiresAt: Date.now() + REFRESH_TTL_MS });
  res.cookie('refreshToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/auth', maxAge: REFRESH_TTL_MS });
}

// ---- routes ----
const app = express();
app.use(express.json());
app.use(cookieParser());

app.post('/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = users.find((u) => u.email === String(email).toLowerCase());
  const ok = user && crypto.timingSafeEqual(Buffer.from(hash(String(password), user.salt), 'hex'), Buffer.from(user.passwordHash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });   // same message for both cases
  issueRefresh(res, user.id);
  return res.json({ accessToken: signAccess(user), expiresIn: 900 });
});

app.post('/auth/refresh', (req, res) => {
  const record = refreshTokens.get(req.cookies.refreshToken);
  if (!record || record.expiresAt < Date.now()) return res.status(401).json({ error: 'SESSION_EXPIRED' });
  refreshTokens.delete(req.cookies.refreshToken);                    // rotation: old token can't be reused
  issueRefresh(res, record.userId);
  return res.json({ accessToken: signAccess(users.find((u) => u.id === record.userId)), expiresIn: 900 });
});

app.post('/auth/logout', (req, res) => {
  refreshTokens.delete(req.cookies.refreshToken);
  res.clearCookie('refreshToken', { path: '/auth' });
  res.status(204).end();
});

app.get('/me', authenticate, (req, res) => res.json(req.user));
app.get('/orders/:id', authenticate, requireOrderOwner, (req, res) => res.json(req.order));
app.get('/admin/stats', authenticate, authorize('admin'), (req, res) => res.json({ users: users.length, orders: orders.length }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: a JWT is readable by anyone, trustworthy only via its signature (runnable)
// Build and verify an HS256 JWT with Web Crypto (what jsonwebtoken does on the server).
const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj) => b64url(enc.encode(JSON.stringify(obj)));
const decodePart = (part) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function sign(payload, secret) {
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson(payload);
  return `${head}.${body}.${await hmac(secret, `${head}.${body}`)}`;
}
async function verify(token, secret, now = Math.floor(Date.now() / 1000)) {
  const [head, body, sig] = token.split('.');
  if (decodePart(head).alg !== 'HS256') return 'BAD_ALG';
  if (sig !== await hmac(secret, `${head}.${body}`)) return 'BAD_SIGNATURE';
  return decodePart(body).exp < now ? 'EXPIRED' : 'OK';
}

(async () => {
  const secret = 'server-only-secret';
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ sub: 'u1', role: 'user', exp: now + 900 }, secret);
  console.log('payload is readable without the secret →', JSON.stringify(decodePart(token.split('.')[1])), decodePart(token.split('.')[1]).role === 'user' ? '✅' : '❌ FAIL');
  console.log('valid token', await verify(token, secret) === 'OK' ? '✅' : '❌ FAIL');
  const [h, , s] = token.split('.');
  const forged = `${h}.${b64urlJson({ sub: 'u1', role: 'admin', exp: now + 900 })}.${s}`;     // attacker edits role
  console.log('edited payload is rejected', await verify(forged, secret) === 'BAD_SIGNATURE' ? '✅' : '❌ FAIL');
  const noneAlg = `${b64urlJson({ alg: 'none' })}.${b64urlJson({ sub: 'u1', role: 'admin' })}.`;
  console.log('"alg: none" token is rejected', await verify(noneAlg, secret) === 'BAD_ALG' ? '✅' : '❌ FAIL');
  const old = await sign({ sub: 'u1', role: 'user', exp: now - 1 }, secret);
  console.log('expired token is rejected', await verify(old, secret) === 'EXPIRED' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Putting passwords, emails or other PII in the JWT payload (it's only base64url-encoded).
- Not pinning `algorithms` in `jwt.verify` (algorithm-confusion and `alg: none` attacks).
- Long-lived access tokens in `localStorage` (XSS = stolen sessions) with no way to revoke them.
- Returning 403 for a missing token (should be 401) or 401 for a permission problem (should be 403).
- Revealing which part of the login failed ("user not found" vs "wrong password").
:::

::: understand
- JWT = **stateless proof** of identity; the cost is **revocation**, which is why access tokens are short and refresh tokens are server-side and rotated.
- Authentication (middleware) and authorization (roles + ownership) are separate concerns and separate middleware.
- Cookies for refresh tokens need **CSRF thinking**: `SameSite=Strict/Lax`, path-scoped, POST-only refresh.
:::

::: ask
- *"Browser SPA, mobile app or service-to-service?"* Decides cookies vs headers vs API keys/mTLS.
- *"Do we need instant logout or 'log out of all devices'?"* → server-side sessions, denylist or token versioning.
- *"Is there an identity provider (Cognito, Auth0, Okta)?"* Then verify their JWTs with JWKS (RS256) instead of a shared secret.
:::

::: important ⭐ Say this in the interview
"On login I verify the password hash and issue a short-lived access token, a JWT with the user id and role, signed with HS256 or RS256, plus a long-lived refresh token in an httpOnly, Secure, SameSite cookie that's rotated on every refresh. An authenticate middleware reads the Bearer token, verifies the signature, the allowed algorithm and the expiry, and attaches req.user; missing or invalid tokens get 401. Separate authorize and ownership middleware return 403 when a logged-in user isn't allowed. JWTs are signed but not encrypted, so I never put secrets in them, and because they're hard to revoke I keep them short and handle logout through the server-side refresh token or a denylist."
:::

::: links
jwt.io: Introduction to JSON Web Tokens | https://jwt.io/introduction
OWASP: JSON Web Token cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
OWASP: Authentication cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
jsonwebtoken package | https://github.com/auth0/node-jsonwebtoken
:::

=== How do you implement pagination in Node.js + MongoDB? (skip/limit and cursor)
@p 3
@tags pagination, mongodb, performance
@quick
- **Offset**: `sort().skip((page-1)*limit).limit(limit)` + `countDocuments` → page numbers and totals, but **slow for deep pages** (MongoDB still walks every skipped key).
- **Cursor (keyset)**: `find({ $or: [{ createdAt: { $lt: c } }, { createdAt: c, _id: { $lt: id } }] }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1)` → constant speed, stable under inserts.
- Measured on 1M docs: page 50,000 took **240 ms** with skip vs **0.5 ms** with a cursor (skip examined **1,000,000** index keys).
- Always sort by a **unique, indexed** combination (`createdAt` + `_id` tie-breaker) and clamp `limit`.
- Infinite scroll/feeds/exports → cursor; admin tables with "page 7 of 120" → offset.

::: text 🧒 In simple words
Imagine a **very long book**. **Offset pagination** is like saying "go to page 50,000": you have to flip through 49,999 pages first, every single time. **Cursor pagination** is like using a **bookmark**: "continue right after the last line I read", so you open the book exactly there, no flipping. Bookmarks also behave better when someone adds new pages at the front: with page numbers, everything shifts and you see some lines twice; with a bookmark, you continue from the same line.
:::

::: text 📖 Detailed answer
### 1. Offset pagination
`GET /posts?page=3&limit=20` → `skip = (3 - 1) × 20 = 40`.
| ✅ | ❌ |
|---|---|
| Simple; page numbers; "jump to page N"; total count | `skip(n)` walks and discards `n` index entries → slow for deep pages |
| Works with any sort | New inserts shift items → duplicates or gaps between pages |
| | `countDocuments` on huge collections is expensive |

### 2. Cursor (keyset) pagination
`GET /posts?limit=20&cursor=<opaque>` where the cursor encodes the **last item's sort values** (`createdAt` + `_id`).
| ✅ | ❌ |
|---|---|
| Constant speed at any depth (index seek) | No random access to "page 7" |
| Stable while data changes | Cursor depends on the sort; changing the sort resets it |
| Natural for infinite scroll and exports | Slightly more code |

### Measured on this machine (MongoDB 7, 1,000,000 posts, index `{ createdAt: -1, _id: -1 }`, 20 per page, median of 5)
| Page | Offset (skip) | Cursor |
|---|---|---|
| 1 | 0.7 ms | 0.6 ms |
| 1,000 | 5.0 ms | 0.5 ms |
| 10,000 | 47.4 ms | 0.4 ms |
| 49,999 | **240.4 ms** | **0.5 ms** |

`explain()` for the last page with skip: **1,000,000 keys examined** to return 20 documents.

### Rules that make both correct
- Sort by a **total order**: add `_id` as a tie-breaker when the main field isn't unique.
- Create the index that matches **filter + sort** (e.g. `{ status: 1, createdAt: -1, _id: -1 }`).
- **Clamp** `limit` (e.g. 1–100); fetch `limit + 1` to know whether there's a next page.
- Make cursors **opaque** (base64url JSON) so clients don't build them.
:::

::: chart line Measured: time per page vs page depth on 1M documents (ms)
Page,Offset skip/limit (ms),Cursor (ms)
1,0.7,0.6
100,1.0,0.6
1000,5.0,0.5
10000,47.4,0.4
49999,240.4,0.5
:::

::: diagram Offset vs cursor: what MongoDB does
flowchart LR
  subgraph O["Offset: page 50,000"]
    O1["index seek to the start"] --> O2["walk and discard 999,980 keys"] --> O3["return 20 docs"]
  end
  subgraph K["Cursor: after (createdAt, _id)"]
    K1["index seek straight to the cursor position"] --> K2["read next 21 keys"] --> K3["return 20 docs + nextCursor"]
  end
:::

::: image Page numbers vs a bookmark: skip walks every earlier entry, a cursor jumps straight to the bookmark
/images/express/pagination.svg
:::

::: text 🪜 Step by step
Cursor pagination for `GET /posts?limit=20&cursor=eyJ…`:
1. Clamp `limit` to 1–100; decode the cursor into `{ createdAt, id }` (reject it with 400 if it's malformed).
2. Build the "after" filter: `createdAt < c.createdAt` **or** (`createdAt == c.createdAt` **and** `_id < c.id`).
3. Query with `sort({ createdAt: -1, _id: -1 }).limit(21)`: MongoDB seeks straight to the position in the index.
4. If 21 documents came back, there's a next page: drop the extra one and build `nextCursor` from the 20th.
5. Return `{ data, pagination: { hasNextPage, nextCursor } }`; the client sends `nextCursor` to get the following page.
6. Offset mode instead computes `skip = (page - 1) × limit` and runs `countDocuments(filter)` in parallel for `total`.
:::

::: code javascript Offset + cursor endpoints with Mongoose (node pagination.js)
// How to run: npm install express mongoose && MONGO_URI=mongodb://localhost:27017/pagination_demo node pagination.js
// Then: curl "localhost:3000/posts/offset?page=2&limit=5"
//       curl "localhost:3000/posts/cursor?limit=5"   then pass ?cursor=<nextCursor>
const express = require('express');
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({ title: String, createdAt: Date });
postSchema.index({ createdAt: -1, _id: -1 });                    // declare indexes BEFORE compiling the model
const Post = mongoose.model('Post', postSchema);

const encodeCursor = (doc) => Buffer.from(JSON.stringify({ t: doc.createdAt.toISOString(), id: String(doc._id) })).toString('base64url');
function decodeCursor(raw) {
  try {
    const { t, id } = JSON.parse(Buffer.from(String(raw), 'base64url').toString());
    if (!mongoose.isValidObjectId(id) || Number.isNaN(Date.parse(t))) throw new Error('shape');
    return { createdAt: new Date(t), id: new mongoose.Types.ObjectId(id) };
  } catch {
    return null;
  }
}
const clampLimit = (v) => Math.min(100, Math.max(1, Number.parseInt(v, 10) || 20));
const SORT = { createdAt: -1, _id: -1 };

const app = express();

// Offset: page numbers + total
app.get('/posts/offset', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = clampLimit(req.query.limit);
  const [data, total] = await Promise.all([
    Post.find().sort(SORT).skip((page - 1) * limit).limit(limit).lean(),
    Post.countDocuments(),
  ]);
  res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total } });
});

// Cursor: constant speed, stable under inserts
app.get('/posts/cursor', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const filter = {};
  if (req.query.cursor) {
    const c = decodeCursor(req.query.cursor);
    if (!c) return res.status(400).json({ error: 'Invalid cursor' });
    filter.$or = [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }];
  }
  const docs = await Post.find(filter).sort(SORT).limit(limit + 1).lean();    // one extra → is there more?
  const hasNextPage = docs.length > limit;
  const data = docs.slice(0, limit);
  return res.json({ data, pagination: { hasNextPage, nextCursor: hasNextPage ? encodeCursor(data[data.length - 1]) : null } });
});

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/pagination_demo');
  if ((await Post.estimatedDocumentCount()) === 0) {
    const base = Date.now();
    await Post.insertMany(Array.from({ length: 53 }, (_, i) => ({ title: `Post ${i + 1}`, createdAt: new Date(base - i * 1000) })));
    console.log('seeded 53 posts');
  }
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: offset duplicates vs a stable cursor when new items arrive (runnable)
// Newest-first feed. Between page 1 and page 2, two new posts are inserted at the top.
let posts = Array.from({ length: 10 }, (_, i) => ({ id: 100 - i }));          // ids 100..91, newest first

const offsetPage = (page, limit) => posts.slice((page - 1) * limit, page * limit).map((p) => p.id);
function cursorPage(afterId, limit) {
  const rows = posts.filter((p) => afterId === null || p.id < afterId).slice(0, limit + 1);
  const items = rows.slice(0, limit).map((p) => p.id);
  return { items, next: rows.length > limit ? items[items.length - 1] : null };
}

const off1 = offsetPage(1, 4);
const cur1 = cursorPage(null, 4);
posts = [{ id: 102 }, { id: 101 }, ...posts];                                // new posts arrive
const off2 = offsetPage(2, 4);
const cur2 = cursorPage(cur1.next, 4);

console.log('offset pages:', off1.join(','), '|', off2.join(','));
console.log('cursor pages:', cur1.items.join(','), '|', cur2.items.join(','));
const dupes = off2.filter((id) => off1.includes(id));
console.log(`offset showed ${dupes.length} duplicates after the insert`, dupes.length === 2 ? '✅' : '❌ FAIL');
console.log('cursor continued exactly after the bookmark', cur2.items.join(',') === '96,95,94,93' ? '✅' : '❌ FAIL');
console.log('limit + 1 trick detects the next page', cur2.next === 93 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Sorting by a non-unique field without an `_id` tie-breaker → items repeat or disappear between pages.
- No index matching the sort → MongoDB sorts in memory (and fails above the 100 MB sort limit without `allowDiskUse`).
- Unbounded `limit` (`?limit=1000000`) → one request dumps the collection.
- Running `countDocuments` on every request for a 100M-row collection (cache it or use `estimatedDocumentCount`).
- Exposing raw cursors as `?after=<_id>&createdAt=…` and trusting them without validation.
:::

::: understand
- Offset asks the database to **count its way** to page N; a cursor asks it to **seek**: that's the whole performance story.
- Pagination is an **API contract**: response shape, limits, sort stability and cursor opacity matter as much as the query.
- The same logic applies to SQL (`WHERE (created_at, id) < ($1, $2) ORDER BY … LIMIT …`).
:::

::: ask
- *"Does the UI need page numbers and totals, or infinite scroll?"* → offset vs cursor.
- *"How large is the collection and how often does it change?"*
- *"Which columns can users sort by?"* Each sortable column needs an index plus the tie-breaker.
- *"Is an exact total required?"* Totals are expensive at scale; "10,000+" is often fine.
:::

::: important ⭐ Say this in the interview
"There are two approaches. Offset pagination uses skip and limit with a page number; it's simple and supports totals and jumping to a page, but MongoDB still walks every skipped index entry, so deep pages get slow and inserts shift items between pages. In a test on a million documents, page fifty thousand took about 240 milliseconds with skip and half a millisecond with a cursor. Cursor or keyset pagination encodes the last item's sort values, for example createdAt plus _id as a tie-breaker, and queries for items after that position with an index seek, fetching limit plus one to know if there's a next page. I use offset for admin tables with page numbers and cursors for feeds, infinite scroll and exports, always with a matching index and a clamped limit."
:::

::: links
MongoDB: cursor.skip() | https://www.mongodb.com/docs/manual/reference/method/cursor.skip/
MongoDB: Use indexes to sort query results | https://www.mongodb.com/docs/manual/tutorial/sort-results-with-indexes/
Slack Engineering: Evolving API pagination | https://slack.engineering/evolving-api-pagination-at-slack/
:::

=== How do you validate request data?
@p 3
@tags validation, zod, joi, security
@quick
- **Never trust the client**: validate `body`, `params`, `query` (and some headers) on the server; frontend validation is only UX.
- Use a schema library (**Zod**, Joi, express-validator) in one reusable `validate(schema)` middleware.
- Reject or strip **unknown fields** (stops mass assignment like `"role": "admin"`), **coerce** query strings to numbers, **normalise** (trim, lowercase).
- Respond **400** with field-level details: `[{ field: 'email', message: 'Invalid email' }]`.
- Defence in depth: service rules (email unique) + DB constraints (unique index, schema validators).

::: text 🧒 In simple words
Validation is the **security check at a building entrance**. Before anyone goes in, a guard checks the visitor's form: is the name filled in, is the email real-looking, is the age a number, and is the visitor trying to sneak in an extra line like "I am the manager"? Forms that don't pass are handed back with notes next to each mistake. The receptionist inside (your business logic) can then trust that every form it receives is complete and in the right format.
:::

::: text 📖 Detailed answer
Validation guarantees that data entering your system has the **right shape, types and limits**, and it blocks malicious input before it reaches your database.

### Layers of validation
| Layer | Tool | Purpose |
|---|---|---|
| Browser | HTML attributes, React Hook Form + Zod | Fast feedback (**not** security) |
| **API boundary** | Zod / Joi middleware | The real gate: types, required fields, formats, ranges, unknown fields |
| Service | Code | Business rules: "email not taken", "stock ≥ quantity" |
| Database | Mongoose validators, **unique indexes**, JSON schema | Last line of defence, also against race conditions |

### What to check
| Part | Example rule |
|---|---|
| `req.body` | name 2–50 chars, valid email, password ≥ 8 with a number, no unknown keys |
| `req.params` | `id` is a valid ObjectId / UUID / positive integer |
| `req.query` | `page`, `limit` coerced to integers with bounds; `sort` from an allow-list |
| Headers | `Content-Type`, idempotency keys, API versions |

### Security wins
- **Mass assignment**: `.strict()` (or stripping) prevents clients from setting `role`, `isVerified`, `balance`.
- **NoSQL injection**: `{ "email": { "$ne": "" } }` fails because `email` must be a **string**.
- **DoS**: limit string lengths, array sizes and body size (`express.json({ limit: '100kb' })`).

### 400 or 422?
Both are common: **400** for malformed or invalid input is the most widespread; some APIs use **422** for well-formed but semantically invalid data. Pick one and be consistent.
:::

::: diagram Validation layers
flowchart LR
  B["Browser form (UX only)"] --> M["validate(schema) middleware: shape, types, unknown fields"]
  M -->|"invalid"| E400["400 with field errors"]
  M -->|"valid, normalised"| S["Service: business rules (email unique?)"]
  S -->|"conflict"| E409["409"]
  S --> DB[("DB: unique index + schema validators")]
:::

::: image Validation as a building entrance: the guard checks the form, rejects extra lines, and hands back notes
/images/express/validation.svg
:::

::: text 🪜 Step by step
`POST /users` with `{"name":" Asha ","email":"ASHA@X.COM","password":"secret123","role":"admin"}` and the code below:
1. `validate(createUserSchema)` builds `{ body, query, params }` and calls `schema.safeParse(...)`.
2. Zod trims `name` → `"Asha"`, trims + lowercases the email, checks the password rules.
3. `.strict()` finds an unknown key `role` → an `unrecognized_keys` issue → the request is **rejected** with `400`.
4. Without `role`, parsing succeeds; the middleware stores the **parsed, normalised** data on `req.valid` and calls `next()`.
5. The handler uses `req.valid.body` (never the raw `req.body`), so it only ever sees clean data.
6. For `GET /users?page=2&limit=500`, `limit` is coerced from `"500"` to a number and fails `max(100)` → `400` with `field: "limit"`.
:::

::: code javascript Reusable Zod validation middleware (node validate.js)
// How to run: npm install express zod && node validate.js
// Then: curl -s -X POST localhost:3000/users -H 'Content-Type: application/json' -d '{"name":" Asha ","email":"ASHA@X.COM","password":"secret123"}'
//       (try adding "role":"admin", a bad email, or curl "localhost:3000/users?limit=500")
const express = require('express');
const { z } = require('zod');

// ---------- schemas ----------
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a 24-character hex id');

const createUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72).regex(/\d/, 'Needs at least one number'),
    age: z.coerce.number().int().min(13).optional(),
  }).strict(),                                       // unknown keys (e.g. "role") are an error
});

const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('-createdAt'),
  }),
});

const getUserSchema = z.object({ params: z.object({ id: objectId }) });

// ---------- middleware ----------
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    const errors = result.error.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => ({ field: key, message: 'Unknown field' }))
        : [{ field: issue.path.slice(1).join('.'), message: issue.message }]);
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors } });
  }
  req.valid = result.data;                           // parsed, coerced, defaulted values
  return next();
};

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '100kb' }));

app.post('/users', validate(createUserSchema), (req, res) => res.status(201).json({ created: req.valid.body }));
app.get('/users', validate(listUsersSchema), (req, res) => res.json({ query: req.valid.query }));
app.get('/users/:id', validate(getUserSchema), (req, res) => res.json({ id: req.valid.params.id }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: a tiny schema validator that blocks mass assignment and injection (runnable)
const rules = {
  name: (v) => (typeof v === 'string' && v.trim().length >= 2) || 'name: at least 2 characters',
  email: (v) => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || 'email: must be a valid email string',
  age: (v) => v === undefined || (Number.isInteger(v) && v >= 13) || 'age: integer ≥ 13',
};

function validate(body, schema) {
  const errors = [];
  for (const key of Object.keys(body)) if (!schema[key]) errors.push(`${key}: unknown field`);
  for (const [field, rule] of Object.entries(schema)) {
    const result = rule(body[field]);
    if (result !== true) errors.push(result);
  }
  return errors;
}

const good = validate({ name: 'Asha', email: 'asha@x.com', age: 30 }, rules);
const massAssign = validate({ name: 'Asha', email: 'asha@x.com', role: 'admin' }, rules);
const injection = validate({ name: 'Asha', email: { $ne: '' } }, rules);   // NoSQL injection attempt
const many = validate({ name: 'A', email: 'nope', age: 9 }, rules);

console.log('valid body → no errors', good.length === 0 ? '✅' : '❌ FAIL');
console.log('mass assignment blocked →', massAssign.join('; '), massAssign.includes('role: unknown field') ? '✅' : '❌ FAIL');
console.log('object instead of string rejected →', injection.join('; '), injection.length === 1 ? '✅' : '❌ FAIL');
console.log('all problems reported at once →', many.length, many.length === 3 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Trusting frontend validation, or validating only `body` and forgetting `params`/`query`.
- Passing `req.body` straight to `Model.create(req.body)` (mass assignment) or `req.query` straight to `find()` (NoSQL injection).
- Using the raw `req.body` after validation instead of the **parsed** result (coercion and trimming are lost).
- Returning only the first error, or a generic "Bad request" without field details.
- No size limits → a 50 MB JSON body or a 10,000-item array slips through.
:::

::: understand
- Validation turns "anything" into a **known type** at the boundary; everything inside can then be simpler and safer.
- Schemas are **documentation and code at once**; with Zod you can share them between React and Node and infer TypeScript types.
- DB constraints still matter: two concurrent requests can both pass "email not taken" checks; only a unique index stops the second.
:::

::: ask
- *"Is there an existing error format for validation errors?"* (field/message pairs, 400 vs 422).
- *"Strip unknown fields silently or reject them?"* Rejecting surfaces client bugs; stripping is more forgiving.
- *"Can we share schemas with the frontend (monorepo)?"*
:::

::: important ⭐ Say this in the interview
"I never trust client input, so every route validates body, params and query on the server with a schema library like Zod through one reusable validate middleware. The schema normalises data, trimming strings, lowercasing emails and coercing query strings to numbers with bounds, and it rejects unknown fields, which prevents mass assignment like a client sending role admin. Because fields must be strings or numbers, operator objects used for NoSQL injection fail too. Invalid requests get a 400 with field-level errors, and handlers only use the parsed result. Business rules like unique emails live in the service, and a unique index in the database is the final guard against race conditions."
:::

::: links
Zod documentation | https://zod.dev
OWASP: Input validation cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
OWASP: Mass assignment cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
:::

=== How do you handle file uploads in Express?
@p 3
@tags uploads, multer, s3
@quick
- Browsers send files as **`multipart/form-data`**; `express.json()` can't parse it → use **multer** (v2) or busboy.
- Storage choices: **disk** (temp files), **memory** (a Buffer per file, RAM-heavy), **stream to S3**, or best at scale: **presigned URLs** (browser → S3 directly).
- Always set `limits` (`fileSize`, `files`, `fields`), validate **type by content** (magic bytes), and **generate your own file names**.
- Measured: three concurrent 50 MB uploads peaked at **~363 MB RAM** with `memoryStorage` vs **~112 MB** with disk storage.
- Store files in S3 and only the **metadata/key** in MongoDB; serve private files through short-lived presigned GET URLs.

::: text 🧒 In simple words
Uploading a file is like **receiving a parcel** at an office. You need a **mailroom** (multer) because parcels don't fit in the normal letter slot (JSON). You decide where parcels go: the mailroom shelf (disk), the receptionist's desk (memory, which fills up fast), or a direct delivery to the **warehouse** (S3). The best offices give couriers a **one-time pass to the warehouse** (presigned URL) so parcels never pass through the office at all. And the mailroom always checks size, opens the box to see what's really inside, and puts its own label on it.
:::

::: text 📖 Detailed answer
### How a file reaches the server
The browser builds a `FormData` with the file and sends `Content-Type: multipart/form-data; boundary=…`. The body contains each field and file separated by the boundary. Multer parses this stream (using busboy) and exposes `req.file`/`req.files` and text fields in `req.body`.

### Storage options
| Approach | Flow | RAM use | When |
|---|---|---|---|
| `diskStorage` / `dest` | Browser → Node → temp file | Low (streams to disk) | Single server, processing before S3 |
| `memoryStorage` | Browser → Node → **Buffer in RAM** | **Whole file per request** | Small files only (avatars < 2 MB) |
| Stream to S3 (`@aws-sdk/lib-storage`) | Browser → Node → S3 (multipart) | Low | Medium files needing server checks |
| **Presigned URL** | Browser → **S3 directly** (Node signs only) | ~0 | Large files, scale, best default |

### Measured on this machine (Express 5 + multer 2, three concurrent 50 MB uploads)
| Storage | Peak RSS |
|---|---|
| `memoryStorage` | **~363 MB** |
| disk (`dest`) | **~112 MB** |

### Security checklist
- `limits: { fileSize, files, fields, fieldSize }` → oversized uploads abort early with `LIMIT_FILE_SIZE`.
- Check the **real type** from the first bytes (magic numbers), not just `file.mimetype` (it comes from the client).
- **Never use the original file name** as a path → UUID names, no path traversal or overwrites.
- Keep buckets **private**; scan for malware if users share files; serve user files with `Content-Disposition: attachment` when unsure.
:::

::: diagram Where the bytes go
flowchart LR
  B["Browser FormData"] -->|"multipart"| M{"multer storage"}
  M -->|"memoryStorage"| RAM["Buffer in RAM (whole file)"]
  M -->|"diskStorage"| DISK["temp file on disk"]
  RAM --> S3[("S3")]
  DISK --> S3
  B -.->|"presigned PUT URL: Node never sees the bytes"| S3
  S3 --> DB[("MongoDB stores key + metadata")]
:::

::: chart bar Measured: peak memory for 3 concurrent 50 MB uploads (Express 5 + multer 2, MB)
Storage,Peak RSS (MB)
memoryStorage,363
diskStorage,112
:::

::: image The mailroom: multer parses parcels, checks size and contents, and stores them on disk, in memory or in S3
/images/express/file-upload.svg
:::

::: text 🪜 Step by step
`POST /api/avatar` with a 300 KB PNG using the code below:
1. Multer sees `multipart/form-data`, starts streaming the body and finds the file field `avatar`.
2. `fileFilter` runs with the client's claimed mimetype; non-images are rejected immediately (cheap check).
3. Bytes stream to a temp file; if they exceed `limits.fileSize` (2 MB), multer aborts with `LIMIT_FILE_SIZE` → our error handler returns `413`.
4. The route reads the **first 12 bytes** of the temp file and checks the PNG/JPEG/WebP signature (the real type).
5. It moves the file to `uploads/<uuid>.png` (our own name), deletes the temp file on any failure and responds `201` with the key.
6. In production, step 5 would upload to S3 and store `{ key, size, type, ownerId }` in MongoDB.
:::

::: code javascript Multer 2: limits, magic-byte check, own file names, error mapping (node upload.js)
// How to run: npm install express multer && node upload.js
// Then: curl -s -F "avatar=@photo.png" localhost:3000/api/avatar
//       curl -s -F "avatar=@notes.txt;type=image/png" localhost:3000/api/avatar   → rejected by magic bytes
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SIGNATURES = [                                     // first bytes of real image files
  { type: 'image/png', ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/webp', ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: [8, [0x57, 0x45, 0x42, 0x50]] },
];
const detectType = (head) => SIGNATURES.find((s) => s.bytes.every((b, i) => head[i] === b) && (!s.extra || s.extra[1].every((b, i) => head[s.extra[0] + i] === b)));

const upload = multer({
  dest: os.tmpdir(),                                     // stream to a temp file (low memory)
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => (file.mimetype.startsWith('image/') ? cb(null, true) : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))),
});

const app = express();

app.post('/api/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Field "avatar" with an image is required' });
  try {
    const handle = await fs.open(req.file.path, 'r');
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);   // read only the first 12 bytes
    await handle.close();
    const real = detectType(buffer);
    if (!real) return res.status(415).json({ error: 'File content is not a PNG, JPEG or WebP image' });
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const key = `${crypto.randomUUID()}${real.ext}`;                     // never trust originalname
    await fs.rename(req.file.path, path.join(UPLOAD_DIR, key));
    return res.status(201).json({ key, type: real.type, size: req.file.size });
  } finally {
    await fs.rm(req.file.path, { force: true });                         // temp file is gone in every case
  }
});

// Multer errors → clear 4xx responses
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Upload failed' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code jsx React: upload with progress (AvatarUpload.jsx)
import { useState } from 'react';

// XHR (not fetch) because it reports upload progress
export function AvatarUpload() {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const onChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage('Max 2 MB'); return; }   // UX check; the server checks again
    const form = new FormData();
    form.append('avatar', file);                                           // must match upload.single('avatar')
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/avatar');
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => setMessage(xhr.status === 201 ? 'Uploaded ✅' : `Failed: ${JSON.parse(xhr.responseText).error}`);
    xhr.onerror = () => setMessage('Network error');
    xhr.send(form);
  };

  return (
    <div>
      <label htmlFor="avatar">Profile photo</label>
      <input id="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} />
      {progress > 0 && <progress value={progress} max="100" aria-label="Upload progress" />}
      <p role="status">{message}</p>
    </div>
  );
}
:::

::: code javascript Browser demo: check the real file type from its first bytes (runnable)
// The client can lie about mimetype; the first bytes ("magic numbers") can't be faked as easily.
const SIGNATURES = { png: [0x89, 0x50, 0x4e, 0x47], jpeg: [0xff, 0xd8, 0xff], pdf: [0x25, 0x50, 0x44, 0x46] };
const detect = (bytes) => Object.keys(SIGNATURES).find((k) => SIGNATURES[k].every((b, i) => bytes[i] === b)) || 'unknown';
const safeName = (original) => {
  const ext = (original.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
};

const realPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const textClaimingPng = new TextEncoder().encode('hello, I am not an image');
console.log('real PNG detected', detect(realPng) === 'png' ? '✅' : '❌ FAIL');
console.log('text file with type=image/png detected as', detect(textClaimingPng), detect(textClaimingPng) === 'unknown' ? '✅' : '❌ FAIL');
const name = safeName('../../etc/passwd.png');
console.log('own file name →', name, /^[0-9a-f-]{36}\.png$/.test(name) && !name.includes('/') ? '✅' : '❌ FAIL');
const limit = 2 * 1024 * 1024;
console.log('size limit check', [1_000_000, 3_000_000].map((s) => s <= limit).join(','), (1_000_000 <= limit) && !(3_000_000 <= limit) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `memoryStorage` for large files → each concurrent upload holds the whole file in RAM.
- Trusting `file.mimetype` or the extension (both come from the client) instead of checking content.
- Saving with `file.originalname` → overwrites and path traversal (`../../`).
- Saving uploads to the container's local disk on multiple servers (files exist on one instance only, lost on redeploy).
- No `limits` → a 5 GB upload fills the disk or memory.
:::

::: understand
- The best upload server is **no upload server**: presigned URLs let S3 handle bandwidth and scale (see the AWS S3 and Full-Stack LLD sections).
- Multer is a stream parser; choosing storage is choosing where the bytes live while you validate them.
- Uploads are untrusted input like any other: limit, verify, rename, isolate.
:::

::: ask
- *"Which file types, how big, how many per request?"*
- *"Public or private files? Do we need thumbnails, virus scanning?"*
- *"How many concurrent uploads?"* At scale → presigned URLs + async processing from S3 events.
:::

::: important ⭐ Say this in the interview
"Files arrive as multipart form data, so I use multer, now version 2, with explicit limits on file size, file count and fields. I prefer disk or streaming storage over memory storage: in a quick test, three concurrent 50 megabyte uploads peaked at about 360 megabytes of RAM with memory storage and about 110 with disk. I check the real type from the file's first bytes rather than trusting the mimetype, generate my own UUID file names, delete temp files on failure, and map multer errors like file too large to 413. Files go to a private S3 bucket and MongoDB stores only the key and metadata. For large files or high volume I skip the server entirely with presigned S3 URLs."
:::

::: links
multer (Express) | https://github.com/expressjs/multer
MDN: Using FormData objects | https://developer.mozilla.org/en-US/docs/Web/API/FormData/Using_FormData_Objects
OWASP: File upload cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
:::

=== How do you implement filtering and sorting?
@p 2
@tags filtering, sorting, query, security
@quick
- Query string → MongoDB filter: `GET /products?category=books&minPrice=10&maxPrice=50&sort=-price,name&q=node`.
- Build the filter from an **allow-list** with **casting**; never `Model.find(req.query)` (`?password[$ne]=x` = NoSQL injection).
- Sort only by allowed (indexed) fields; map `-price` → `{ price: -1 }`; add `_id` as a tie-breaker.
- Escape user input before using it in `$regex`; use a text index or Atlas Search for real search.
- Index with the **ESR rule** (Equality → Sort → Range). Measured: **107.6 ms / 500,000 docs examined** without an index vs **1.5 ms / 20 docs** with `{ isDeleted: 1, category: 1, price: -1 }`.

::: text 🧒 In simple words
Filtering and sorting is like asking a **librarian**: "show me only cookbooks, between $10 and $50, most expensive first". A good librarian only accepts questions from a **printed form** (allow-list), so nobody can sneak in "and also unlock the staff room" (injection). And a smart library keeps **index cards sorted exactly the way people usually ask** (by section, then price), so the librarian can walk straight to the right shelf instead of checking every book in the building.
:::

::: text 📖 Detailed answer
### Query-string conventions
| Need | Example | MongoDB |
|---|---|---|
| Equality | `?category=books` | `{ category: 'books' }` |
| Range | `?minPrice=10&maxPrice=50` | `{ price: { $gte: 10, $lte: 50 } }` |
| Multiple values | `?status=active,pending` | `{ status: { $in: [...] } }` |
| Boolean | `?inStock=true` | `{ inStock: true }` |
| Search | `?q=phone` | escaped `$regex` / `$text` |
| Sort | `?sort=-price,name` | `{ price: -1, name: 1, _id: -1 }` |
| Fields | `?fields=name,price` | `.select('name price')` |

### Security
`Model.find(req.query)` (or a JSON body passed straight into a query) lets a client send **operators**. With Express 4's default `qs` parser, `?password[$ne]=x` becomes `{ password: { $ne: 'x' } }` and matches every user; Express 5 defaults to the simple parser (nested keys stay plain strings), but a JSON body like `{"email": {"$ne": ""}}` still carries operators. Always:
- pick only **known** fields,
- **cast** values (`String()`, `Number()`, booleans from `'true'`),
- **escape** regex input (`a.c` should match a literal dot, and `(a+)+` shouldn't cause catastrophic backtracking).

### Performance: the ESR rule for compound indexes
Put **E**quality fields first, then the **S**ort field, then **R**ange fields. For "category = books, price between 100 and 200, sorted by price desc":
| Setup | Time | Docs examined |
|---|---|---|
| No index (COLLSCAN + in-memory SORT) | **107.6 ms** | 500,000 |
| `{ isDeleted: 1, category: 1, price: -1 }` | **1.5 ms** | 20 |

(Measured on MongoDB 7 with 500,000 products, `limit(20)`, median of 5 runs.)
:::

::: diagram Query string to safe MongoDB query
flowchart LR
  Q["?category=books&minPrice=10&sort=-price&q=c++"] --> P["parse + allow-list fields"]
  P --> C["cast: String, Number, Boolean"]
  C --> X["escape regex input"]
  X --> F["filter: category, price range, name regex"]
  P --> S["sort: allowed fields + _id tie-breaker"]
  F --> DB[("MongoDB: ESR index category, price")]
  S --> DB
:::

::: chart bar Measured: products query with and without an ESR index (500k docs, ms)
Setup,Query time (ms)
No index (COLLSCAN + SORT),107.6
ESR index,1.5
:::

::: image The librarian's form: only allowed questions, cast to the right types, answered from a matching index
/images/express/filter-sort.svg
:::

::: text 🪜 Step by step
`GET /products?category=books&minPrice=10&maxPrice=50&sort=-price&q=c%2B%2B&password[$ne]=x`:
1. Express parses the query string (Express 4's `qs` parser would even turn `password[$ne]=x` into an object `{ $ne: 'x' }`).
2. `buildProductQuery` ignores `password` entirely (not in the allow-list), whatever shape it has.
3. `category` → `String('books')`; `minPrice`/`maxPrice` → numbers; NaN values are skipped.
4. `q = 'c++'` is escaped to `c\+\+` before going into `$regex` (otherwise `+` means "one or more").
5. `sort=-price` → `{ price: -1 }`; `_id: -1` is added as a tie-breaker; unknown sort fields are dropped.
6. MongoDB uses the `{ isDeleted, category, price }` index: equality on the first two, ordered by price, range on price → reads only what it returns.
:::

::: code javascript Safe filter + sort + pagination with Mongoose (node products.js)
// How to run: npm install express mongoose && MONGO_URI=mongodb://localhost:27017/shop node products.js
// Then: curl "localhost:3000/products?category=books&minPrice=10&maxPrice=50&sort=-price&q=node"
const express = require('express');
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: String, category: String, price: Number, tags: [String], inStock: Boolean, isDeleted: { type: Boolean, default: false },
});
productSchema.index({ isDeleted: 1, category: 1, price: -1 });          // ESR: equality, equality, sort/range
const Product = mongoose.model('Product', productSchema);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTABLE = ['price', 'name', 'createdAt'];

function buildProductQuery(query) {
  const filter = { isDeleted: false };
  if (typeof query.category === 'string') filter.category = query.category;
  if (typeof query.tags === 'string') filter.tags = { $all: query.tags.split(',').slice(0, 10) };
  if (query.inStock === 'true' || query.inStock === 'false') filter.inStock = query.inStock === 'true';
  const min = Number(query.minPrice);
  const max = Number(query.maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.price = {};
    if (Number.isFinite(min)) filter.price.$gte = min;
    if (Number.isFinite(max)) filter.price.$lte = max;
  }
  if (typeof query.q === 'string' && query.q.trim()) filter.name = { $regex: escapeRegex(query.q.trim().slice(0, 50)), $options: 'i' };

  const sort = {};
  String(query.sort || '-price').split(',').forEach((token) => {
    const field = token.replace(/^-/, '');
    if (SORTABLE.includes(field)) sort[field] = token.startsWith('-') ? -1 : 1;
  });
  sort._id = -1;                                                         // stable order between pages
  return { filter, sort };
}

const app = express();
app.get('/products', async (req, res) => {
  const { filter, sort } = buildProductQuery(req.query);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [data, total] = await Promise.all([
    Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).select('name category price inStock').lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ data, pagination: { page, limit, total }, appliedFilter: filter });
});

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shop');
  if ((await Product.estimatedDocumentCount()) === 0) {
    const cats = ['books', 'shoes', 'phones'];
    await Product.insertMany(Array.from({ length: 60 }, (_, i) => ({
      name: i % 7 === 0 ? `Node.js Guide ${i}` : `Item ${i}`, category: cats[i % 3], price: 5 + (i * 37) % 95, tags: i % 2 ? ['new'] : ['sale'], inStock: i % 4 !== 0,
    })));
    console.log('seeded 60 products');
  }
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: query string → safe filter, with injection attempts (runnable)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTABLE = ['price', 'name'];

function build(qs) {
  const q = Object.fromEntries(new URLSearchParams(qs));
  const filter = {};
  if (q.category) filter.category = String(q.category);
  const min = Number(q.minPrice), max = Number(q.maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) filter.price = { ...(Number.isFinite(min) && { $gte: min }), ...(Number.isFinite(max) && { $lte: max }) };
  if (q.q) filter.name = { $regex: escapeRegex(q.q) };
  const sort = {};
  (q.sort || '-price').split(',').forEach((t) => { const f = t.replace(/^-/, ''); if (SORTABLE.includes(f)) sort[f] = t.startsWith('-') ? -1 : 1; });
  sort._id = -1;
  return { filter, sort };
}

// "+" in a query string means a SPACE, so the client must encode it: encodeURIComponent('c++') === 'c%2B%2B'
console.log('raw q=c++ decodes to', JSON.stringify(new URLSearchParams('q=c++').get('q')), new URLSearchParams('q=c++').get('q') === 'c  ' ? '✅' : '❌ FAIL');
const a = build(`category=books&minPrice=10&maxPrice=50&sort=-price,name&q=${encodeURIComponent('c++')}`);
console.log(JSON.stringify(a));
console.log('range cast to numbers', a.filter.price.$gte === 10 && a.filter.price.$lte === 50 ? '✅' : '❌ FAIL');
console.log('regex input escaped →', a.filter.name.$regex, a.filter.name.$regex === 'c\\+\\+' ? '✅' : '❌ FAIL');
console.log('sort with tie-breaker', JSON.stringify(a.sort) === '{"price":-1,"name":1,"_id":-1}' ? '✅' : '❌ FAIL');
const b = build('password[$ne]=x&sort=secretField&minPrice=abc');
console.log('unknown fields and operators ignored →', JSON.stringify(b.filter), JSON.stringify(b.filter) === '{}' ? '✅' : '❌ FAIL');
console.log('unknown sort field dropped', JSON.stringify(b.sort) === '{"_id":-1}' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `Model.find(req.query)` or spreading `req.query` into a filter → NoSQL injection.
- Unescaped `$regex` from user input (wrong matches, ReDoS) or regex search on huge collections without an index.
- Sorting by any field the client names (no index → in-memory sort, 100 MB limit errors).
- Indexes in the wrong order (range before sort) → MongoDB can't use the index for sorting.
- Filters only in React state → links can't be shared and Back loses them (put them in the URL).
- Building query strings by hand: `+` means a space and `&` splits parameters, so always use `URLSearchParams`/`encodeURIComponent` on the client.
:::

::: understand
- The API should express **what** the client may ask; the allow-list is that contract.
- Index design follows real query shapes; check with `explain('executionStats')`: compare `totalDocsExamined` to returned docs.
- Search beyond simple prefixes belongs in a search engine (Atlas Search, OpenSearch, Algolia).
:::

::: ask
- *"Which fields can be filtered and sorted? Which combinations are common?"* (drives indexes).
- *"Prefix search or full-text with typo tolerance?"* → regex vs text index vs search engine.
- *"Should filters live in the URL?"* (shareable, back button).
:::

::: important ⭐ Say this in the interview
"I map query parameters to a MongoDB filter through an allow-list: only known fields, cast to the right type, ranges like minPrice and maxPrice become $gte and $lte, and search text is escaped before it goes into a regex. I never pass req.query directly to find, because an operator like password[$ne] would turn into a NoSQL injection. Sorting accepts only allowed fields, maps a leading minus to descending and adds _id as a tie-breaker. Then I create compound indexes following the equality, sort, range rule; in a test with 500,000 products, the right index took a filtered, sorted query from about 108 milliseconds and half a million documents examined down to 1.5 milliseconds and 20 documents."
:::

::: links
MongoDB: The ESR (Equality, Sort, Range) rule | https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/
OWASP: NoSQL injection testing | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05.6-Testing_for_NoSQL_Injection
MongoDB: explain results | https://www.mongodb.com/docs/manual/reference/explain-results/
:::

=== How do you handle API errors consistently?
@p 2
@tags errors, api-design
@quick
- One **error shape** for every failure, e.g. `{ error: { code, message, details?, requestId } }` (or RFC 9457 `application/problem+json`).
- Correct **status codes**: 400 / 401 / 403 / 404 / 409 / 422 / 429 / 500 / 503.
- Error **classes** (`NotFoundError`, `ConflictError`…) thrown anywhere → **one** error middleware formats them.
- Stable machine-readable `code` for the frontend (and translations); human `message` for people.
- Log 5xx with a **request id** and return that id to the client; never expose stack traces or DB messages.

::: text 🧒 In simple words
Imagine an airline where every desk reports problems differently: one writes "ERR!!", another says "sorry, can't", a third shows you an internal computer screen. Confusing! A good airline uses **one standard form** for every problem: a short code ("FLIGHT_FULL"), a clear sentence, the details, and a reference number you can quote to customer service. Consistent API errors are that standard form: the frontend can handle every failure in one place, and support can find the exact log line from the reference number.
:::

::: text 📖 Detailed answer
### Why consistency matters
- The frontend can handle errors **in one interceptor** (show field errors, redirect to login, retry later).
- Error **codes** stay stable even if messages change or are translated.
- A **request id** links what the user saw to the server logs.

### Recommended body
| Field | Example | Purpose |
|---|---|---|
| `code` | `"USER_NOT_FOUND"` | Stable, machine-readable |
| `message` | `"User not found"` | Human-readable summary |
| `details` | `[{ "field": "email", "message": "Invalid email" }]` | Field errors / extra context |
| `requestId` | `"8f1c…"` | Correlate with logs |

(RFC 9457 "Problem Details" is the standard alternative: `type`, `title`, `status`, `detail`, `instance` with `Content-Type: application/problem+json`.)

### Status-code cheat sheet
| Status | Use for |
|---|---|
| 400 | Malformed or invalid input |
| 401 | Not authenticated (missing/invalid/expired token) |
| 403 | Authenticated but not allowed |
| 404 | Resource doesn't exist (or is hidden from this user) |
| 409 | Conflict: duplicate, version mismatch |
| 422 | Well-formed but semantically invalid (some teams use instead of 400) |
| 429 | Rate limited (send `Retry-After`) |
| 500 | Unexpected server bug |
| 503 | Dependency down / maintenance (send `Retry-After`) |
:::

::: diagram One error contract from server to UI
flowchart LR
  T["throw NotFoundError / ConflictError / ValidationError"] --> EH["error middleware"]
  U["unknown error (bug)"] --> EH
  EH -->|"log 5xx with requestId"| L[("logs / Sentry")]
  EH -->|"status + code + message + requestId"| C["client"]
  C --> I["one interceptor: field errors, 401 → login, 429/503 → retry"]
:::

::: image One standard form for every problem: code, message, details and a reference number
/images/express/api-errors.svg
:::

::: text 🪜 Step by step
`POST /api/users` with an email that already exists:
1. The service checks the repository and throws `new ConflictError('Email already registered')` (status 409, code `EMAIL_TAKEN`).
2. Express 5 forwards the rejected promise to the error middleware.
3. The middleware sees an `AppError` subclass → uses its status, code and message; no stack logging for a 4xx.
4. It adds the request id from the `requestId` middleware and responds `409 { error: { code, message, requestId } }`.
5. On the frontend, the API client turns the response into a typed error; the form shows "Email already registered" under the email field.
6. For a bug (`TypeError`), the middleware logs the stack with the same request id and returns `500 INTERNAL_ERROR` with a generic message.
:::

::: code javascript Error classes + middleware + a client that understands them (node api-errors.js)
// How to run: npm install express && node api-errors.js
// Then: curl -i -X POST localhost:3000/api/users -H 'Content-Type: application/json' -d '{"email":"taken@x.com"}'
const express = require('express');
const crypto = require('crypto');

// ---------- error classes ----------
class AppError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
class ValidationError extends AppError { constructor(details) { super(400, 'VALIDATION_ERROR', 'Validation failed', details); } }
class UnauthorizedError extends AppError { constructor(message = 'Authentication required') { super(401, 'UNAUTHORIZED', message); } }
class ForbiddenError extends AppError { constructor() { super(403, 'FORBIDDEN', 'You do not have permission'); } }
class NotFoundError extends AppError { constructor(what = 'Resource') { super(404, `${what.toUpperCase()}_NOT_FOUND`, `${what} not found`); } }
class ConflictError extends AppError { constructor(code, message) { super(409, code, message); } }

// ---------- app ----------
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.id = req.get('x-request-id') || crypto.randomUUID(); res.set('X-Request-Id', req.id); next(); });

const emails = new Set(['taken@x.com']);
app.post('/api/users', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase();
  if (!email.includes('@')) throw new ValidationError([{ field: 'email', message: 'Invalid email' }]);
  if (emails.has(email)) throw new ConflictError('EMAIL_TAKEN', 'Email already registered');
  emails.add(email);
  res.status(201).json({ data: { email } });
});
app.get('/api/users/:id', () => { throw new NotFoundError('User'); });
app.get('/api/admin', () => { throw new ForbiddenError(); });
app.get('/api/me', () => { throw new UnauthorizedError(); });
app.get('/api/bug', () => JSON.parse('{oops'));                  // a real bug → 500

app.use((req, res, next) => next(new NotFoundError('Route')));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const known = err instanceof AppError;
  if (!known) console.error(`[${req.id}]`, err);
  res.status(known ? err.status : 500).json({
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Something went wrong',
      ...(known && err.details ? { details: err.details } : {}),
      requestId: req.id,
    },
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: one client-side handler for every API error (runnable)
// What a frontend API client does with a consistent error contract.
class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Network error');
    this.status = status;
    this.code = body?.error?.code || 'NETWORK_ERROR';
    this.details = body?.error?.details || [];
    this.requestId = body?.error?.requestId;
  }
}
function decideUiAction(err) {
  if (err.status === 401) return 'redirect-to-login';
  if (err.status === 403) return 'show-permission-message';
  if (err.status === 400 || err.status === 422) return `field-errors:${err.details.map((d) => d.field).join(',')}`;
  if (err.status === 409) return `inline:${err.message}`;
  if (err.status === 429 || err.status === 503) return 'retry-later';
  return `toast:Something went wrong (ref ${err.requestId})`;
}

const cases = [
  [401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 'redirect-to-login'],
  [400, { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'email' }, { field: 'name' }] } }, 'field-errors:email,name'],
  [409, { error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } }, 'inline:Email already registered'],
  [503, { error: { code: 'DB_UNAVAILABLE', message: 'Try again' } }, 'retry-later'],
  [500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: 'abc-123' } }, 'toast:Something went wrong (ref abc-123)'],
];
for (const [status, body, expected] of cases) {
  const action = decideUiAction(new ApiError(status, body));
  console.log(`${status} ${body.error.code} → ${action}`, action === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Different shapes per route (`{ msg }`, `{ error }`, plain text) → frontend special cases everywhere.
- `200 OK` with `{ success: false }` → caches, monitoring and clients all think it worked.
- Leaking stack traces, SQL/Mongo messages or internal hostnames in production.
- Changing error `code` strings casually (they're part of the API contract).
- No request id → impossible to connect a user's screenshot to the server log.
:::

::: understand
- Errors are part of the **API contract**, just like successful responses; document them (OpenAPI).
- Classes + one middleware = **one place** to change formatting, logging and mapping.
- Consistency on the server enables **one interceptor** on the client.
:::

::: ask
- *"Is there an existing error standard (RFC 9457, company style guide)?"*
- *"Do messages need translating?"* → frontend maps `code` to translated text.
- *"Which errors should alert someone?"* Usually 5xx and unusual 4xx spikes, not every 404.
:::

::: important ⭐ Say this in the interview
"Every error the API returns has the same shape: a correct HTTP status plus a body with a stable machine-readable code, a human message, optional field details and a request id. In code, services throw error classes like NotFoundError or ConflictError, and a single error middleware turns them into that shape, logs unexpected 5xx errors with the request id and stack, and hides internals in production. Because the contract is consistent, the frontend handles errors in one interceptor: 401 goes to login, validation errors map to fields, 429 or 503 retry later, and anything else shows a message with the reference id support can look up."
:::

::: links
RFC 9457: Problem Details for HTTP APIs | https://www.rfc-editor.org/rfc/rfc9457.html
MDN: HTTP response status codes | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
:::

=== How do you version APIs?
@p 2
@tags versioning, api-design
@quick
- Version only for **breaking changes** (removed/renamed fields, changed types, changed behaviour); additive changes don't need a new version.
- **URI versioning** `/api/v1/...` is the most common: explicit, easy to route, cache and log.
- Alternatives: a header (`Accept: application/vnd.app.v2+json` or `API-Version: 2`) or a query param.
- Run v1 and v2 side by side; mark v1 with `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers; watch its traffic; remove it.
- Reuse services across versions; only controllers/serializers (response shapes) differ.

::: text 🧒 In simple words
An API is like a **power socket standard**. Millions of devices (mobile apps, partner systems) are already plugged in. If you change the socket shape overnight, everyone's devices stop working. So when you need a new shape, you install **new sockets next to the old ones** (v2), label the old ones "will be removed on 31 Dec" and give people time to switch. Small improvements that don't change the shape (an extra USB port) don't need a new socket.
:::

::: text 📖 Detailed answer
### Breaking vs non-breaking
| Change | Breaking? |
|---|---|
| Add a new endpoint | No |
| Add an **optional** field or query param | No |
| Add a field to a response | Usually no (clients should ignore unknown fields) |
| Remove or rename a field | **Yes** |
| Change a type (`"price": "10"` → `10`) | **Yes** |
| Make an optional input required | **Yes** |
| Change error format, auth scheme, default sort/pagination | **Yes** |

### Strategies
| Strategy | Example | Pros | Cons |
|---|---|---|---|
| **URI path** | `/api/v1/users` | Visible, easy routing, cache-friendly, easy to test in a browser | Resource URLs change between versions |
| Header | `API-Version: 2` or `Accept: application/vnd.app.v2+json` | Clean URLs | Easy to forget, harder to test, caches need `Vary` |
| Query | `/users?version=2` | Simple | Messy, often lost, caching issues |

### Lifecycle
1. Ship v2 alongside v1 (shared services; different response mappers).
2. Mark v1: `Deprecation: @<unix seconds>` (when it was deprecated, RFC 9745), `Sunset: <HTTP date>` (when it will stop working, RFC 8594) and a `Link` to the migration guide.
3. Measure v1 traffic per client; contact the remaining users.
4. After the sunset date, return `410 Gone` (or remove) v1.

### When you might not need versions
If the only client is your own web app deployed together with the API, you can often evolve in place with additive changes. Public APIs and mobile apps (old versions live for months) need explicit versioning.
:::

::: diagram Two versions, one service
flowchart LR
  OLD["old mobile app"] -->|"/api/v1/users/7"| V1["v1 router: legacy shape + Deprecation and Sunset headers"]
  NEW["new web app"] -->|"/api/v2/users/7"| V2["v2 router: new shape"]
  V1 --> S["userService.getById (shared)"]
  V2 --> S
  S --> DB[("database")]
:::

::: image New sockets next to the old ones: v1 and v2 side by side, with a sunset date on v1
/images/express/api-versioning.svg
:::

::: text 🪜 Step by step
A request to `GET /api/v1/users/7` while v2 exists:
1. `app.use('/api/v1', v1Router)` matches the prefix; inside the router the path is `/users/7`.
2. The v1 handler calls the **shared** `userService.getById(7)` → `{ id, firstName, lastName, email }`.
3. The v1 **mapper** produces the old shape `{ id, name: "Asha Rao" }`.
4. It sets `Deprecation: @1782777600` (deprecated since 30 Jun 2026), `Sunset: Thu, 31 Dec 2026 23:59:59 GMT` and a `Link` to the migration guide.
5. The same request to `/api/v2/users/7` uses the v2 mapper → `{ id, firstName, lastName, email }` without deprecation headers.
6. Logs record the version per request so you can see who still uses v1.
:::

::: code javascript URI versioning with shared services and deprecation headers (node versions.js)
// How to run: npm install express && node versions.js
// Then: curl -i localhost:3000/api/v1/users/7   and   curl -i localhost:3000/api/v2/users/7
const express = require('express');

// ---------- shared service (one source of truth) ----------
const users = new Map([[7, { id: 7, firstName: 'Asha', lastName: 'Rao', email: 'asha@x.com' }]]);
const userService = {
  async getById(id) {
    const user = users.get(id);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    return user;
  },
};

// ---------- version-specific response shapes ----------
const toV1 = (u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` });          // legacy shape
const toV2 = (u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email });

const deprecated = ({ since, sunset, guide }) => (req, res, next) => {
  res.set('Deprecation', `@${Math.floor(Date.parse(since) / 1000)}`);   // RFC 9745: a date, as unix seconds
  res.set('Sunset', new Date(sunset).toUTCString());                     // RFC 8594: an HTTP date
  res.set('Link', `<${guide}>; rel="deprecation"`);
  next();
};

const v1 = express.Router();
v1.use(deprecated({ since: '2026-06-30T00:00:00Z', sunset: '2026-12-31T23:59:59Z', guide: 'https://docs.example.com/migrate-to-v2' }));
v1.get('/users/:id', async (req, res) => res.json(toV1(await userService.getById(Number(req.params.id)))));

const v2 = express.Router();
v2.get('/users/:id', async (req, res) => res.json(toV2(await userService.getById(Number(req.params.id)))));

const app = express();
app.use((req, res, next) => { res.on('finish', () => console.log(`${req.originalUrl.split('/')[2]} ${req.method} ${req.originalUrl} ${res.statusCode}`)); next(); });
app.use('/api/v1', v1);
app.use('/api/v2', v2);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: is this change breaking? (runnable)
// Compare an old and a new response schema the way a contract test would.
function breakingChanges(oldSchema, newSchema) {
  const problems = [];
  for (const [field, type] of Object.entries(oldSchema)) {
    if (!(field in newSchema)) problems.push(`removed field "${field}"`);
    else if (newSchema[field] !== type) problems.push(`"${field}" changed ${type} → ${newSchema[field]}`);
  }
  return problems;
}

const v1 = { id: 'number', name: 'string', price: 'string' };
const additive = { id: 'number', name: 'string', price: 'string', currency: 'string' };
const breaking = { id: 'number', firstName: 'string', price: 'number' };

const a = breakingChanges(v1, additive);
const b = breakingChanges(v1, breaking);
console.log('adding a field is safe', a.length === 0 ? '✅' : '❌ FAIL');
console.log('breaking changes found →', b.join('; '), b.length === 2 ? '✅' : '❌ FAIL');
const sunset = new Date('2026-12-31T23:59:59Z').toUTCString();
console.log('Sunset header value →', sunset, sunset === 'Thu, 31 Dec 2026 23:59:59 GMT' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Creating a new version for every small change (version sprawl) instead of making additive changes.
- Copy-pasting whole services per version → bugs fixed in one version but not the other.
- Breaking changes without notice, or removing v1 without measuring who still uses it.
- Header versioning without `Vary: API-Version` → caches serve the wrong version.
- Versioning the internal API used only by your own, co-deployed frontend (often unnecessary).
:::

::: understand
- Versioning is a **promise to clients**; the technique matters less than the deprecation process.
- Keep business logic version-agnostic; versions are mostly **different serializations**.
- Contract tests (OpenAPI diff, Pact) catch accidental breaking changes in CI.
:::

::: ask
- *"Who consumes the API: our own web app, mobile apps, third parties?"*
- *"How long must old versions be supported?"* (mobile app update cycles, partner contracts).
- *"Is there an API gateway?"* (can route versions and add headers).
:::

::: important ⭐ Say this in the interview
"I only create a new API version for breaking changes, such as removing or renaming fields, changing types or behaviour; adding optional fields or new endpoints is backwards compatible. I usually use URI versioning like /api/v1 and /api/v2 because it's explicit and easy to route, log and cache. Both versions share the same services and differ only in controllers and response mappers. When v2 ships, v1 gets Deprecation and Sunset headers plus a link to a migration guide, we watch v1 traffic per client, and remove it after the sunset date. For an internal frontend deployed with the API, additive changes are often enough without versioning."
:::

::: links
RFC 8594: The Sunset HTTP header | https://www.rfc-editor.org/rfc/rfc8594.html
RFC 9745: The Deprecation HTTP header | https://www.rfc-editor.org/rfc/rfc9745.html
Microsoft REST API guidelines: versioning | https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#api-versioning
:::

=== Difference between application-level and router-level middleware
@p 2
@tags middleware, router
@quick
- **Application-level**: bound to `app` with `app.use()` / `app.METHOD()`; runs for every request (or a path prefix).
- **Router-level**: bound to an `express.Router()` instance with `router.use()`; runs only for requests that enter that router.
- A Router is a **mini-app** with its own middleware and routes → modular features: `app.use('/api/admin', adminRouter)`.
- Use app-level for cross-cutting concerns (helmet, CORS, JSON parsing, logging, errors); router-level for feature concerns (admin auth, module validation).
- `express.Router({ mergeParams: true })` lets nested routers read parent params like `:userId`.

::: text 🧒 In simple words
A shopping mall has **security at the main entrance** (application-level): everyone passes through it. Inside, some shops have **their own door staff** (router-level): the jewellery store checks bags, the cinema checks tickets, but only for people going into that shop. Express works the same way: `app.use` is the mall entrance, a `Router` is a shop with its own rules, and you mount each shop at an address (`/api/admin`).
:::

::: text 📖 Detailed answer
Both are the same kind of function `(req, res, next)`; the difference is **where they're attached** and therefore their **scope**.

| | Application-level | Router-level |
|---|---|---|
| Attached to | `app` (the Express instance) | an `express.Router()` instance |
| Registered with | `app.use(fn)`, `app.use('/path', fn)`, `app.get(...)` | `router.use(fn)`, `router.get(...)` |
| Runs for | Every request (or every request under a prefix) | Only requests routed into that router |
| Typical use | `helmet`, `cors`, `express.json`, request id, logging, global rate limit, 404, error handler | Auth for `/admin`, per-module validation, module logging, nested resources |

### Routers as mini-apps
- Each feature exports a router (`users.routes.js`, `orders.routes.js`) with its own middleware.
- `app.use('/api/users', usersRouter)` mounts it; inside, paths are **relative** (`router.get('/:id')`).
- Routers can be nested (`/api/users/:userId/orders`); use `mergeParams: true` to read `req.params.userId` in the child.

### Common pattern: protect everything except a few routes
Mount the **public** router first (`/api/auth`), then a router-level `authenticate` on the protected routers, so login and register stay public.
:::

::: diagram Mall entrance vs shop doors
flowchart TD
  R(["request"]) --> A["app.use: helmet, cors, json, logger (everyone)"]
  A --> P{"path?"}
  P -->|"/api/products"| PUB["publicRouter: no auth"]
  P -->|"/api/admin"| ADM["adminRouter.use: authenticate + requireAdmin"]
  P -->|"/api/users/:userId/orders"| ORD["ordersRouter (mergeParams)"]
  ADM --> AR["admin routes"]
:::

::: image The mall entrance (app-level) checks everyone; each shop (router) has its own door staff
/images/express/app-vs-router.svg
:::

::: text 🪜 Step by step
`DELETE /api/admin/users/9` with a non-admin token, using the code below:
1. App-level `express.json()` and the logger run (they run for everyone).
2. The request doesn't match `/api/products` (public router), but matches the `/api/admin` mount.
3. Inside `adminRouter`, the router-level `authenticate` reads the token → `req.user = { role: 'user' }` → `next()`.
4. Router-level `requireAdmin` sees `role !== 'admin'` → responds **403**; the route handler never runs.
5. A request to `/api/products` never touches `authenticate` or `requireAdmin` at all.
6. `GET /api/users/5/orders` enters `ordersRouter`; thanks to `mergeParams`, it can read `req.params.userId === '5'`.
:::

::: code javascript App-level vs router-level, nested routers (node routers.js)
// How to run: npm install express && node routers.js
// Then: curl localhost:3000/api/products
//       curl -i -X DELETE localhost:3000/api/admin/users/9 -H "x-token: user-token"
//       curl -i -X DELETE localhost:3000/api/admin/users/9 -H "x-token: admin-token"
//       curl localhost:3000/api/users/5/orders
const express = require('express');
const app = express();

// ---------- application-level: everyone passes here ----------
app.use(express.json());
app.use((req, res, next) => { console.log(`[app] ${req.method} ${req.originalUrl}`); next(); });

// ---------- router-level: only for routes inside each router ----------
const tokens = { 'user-token': { id: 1, role: 'user' }, 'admin-token': { id: 2, role: 'admin' } };
const authenticate = (req, res, next) => {
  req.user = tokens[req.get('x-token')];
  return req.user ? next() : res.status(401).json({ error: 'AUTH_REQUIRED' });
};
const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'FORBIDDEN' }));

const publicRouter = express.Router();
publicRouter.get('/products', (req, res) => res.json([{ id: 1, name: 'Mug' }]));

const adminRouter = express.Router();
adminRouter.use(authenticate, requireAdmin);                 // only for /api/admin/*
adminRouter.get('/stats', (req, res) => res.json({ users: 2 }));
adminRouter.delete('/users/:id', (req, res) => res.json({ deleted: Number(req.params.id) }));

const ordersRouter = express.Router({ mergeParams: true });  // can read :userId from the parent path
ordersRouter.get('/', (req, res) => res.json({ userId: req.params.userId, orders: ['o-1', 'o-2'] }));

app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users/:userId/orders', ordersRouter);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
:::

::: code javascript Browser demo: which middleware runs for which path? (runnable)
// Model the stack: app-level entries apply to everything, router entries only under their mount path.
const stack = [
  { scope: 'app', mount: '/', name: 'json' },
  { scope: 'app', mount: '/', name: 'logger' },
  { scope: 'router', mount: '/api/admin', name: 'authenticate' },
  { scope: 'router', mount: '/api/admin', name: 'requireAdmin' },
  { scope: 'router', mount: '/api/users/:userId/orders', name: 'ordersRoutes' },
];
const matches = (mount, path) => {
  const pattern = new RegExp(`^${mount.replace(/:[^/]+/g, '[^/]+')}(/|$)`);
  return mount === '/' || pattern.test(path);
};
const runFor = (path) => stack.filter((m) => matches(m.mount, path)).map((m) => m.name);

const products = runFor('/api/products');
const admin = runFor('/api/admin/users/9');
const orders = runFor('/api/users/5/orders');
console.log('/api/products →', products.join(' > '), products.join() === 'json,logger' ? '✅' : '❌ FAIL');
console.log('/api/admin/users/9 →', admin.join(' > '), admin.join() === 'json,logger,authenticate,requireAdmin' ? '✅' : '❌ FAIL');
console.log('/api/users/5/orders →', orders.join(' > '), orders.includes('ordersRoutes') && !orders.includes('authenticate') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Putting `authenticate` at app level **before** the login route → nobody can log in.
- Forgetting `mergeParams: true` in nested routers → `req.params.userId` is `undefined`.
- Registering the same middleware at app and router level → it runs twice.
- Mounting the 404 handler before routers.
- Using absolute paths inside a router (`router.get('/api/admin/stats')`) when it's mounted at `/api/admin`.
:::

::: understand
- Router-level middleware is how you keep **feature rules next to the feature** instead of one giant `app.js`.
- Scope is decided by **where you mount**, not by the middleware itself.
- The same function can be reused at either level (`authenticate` globally or per router).
:::

::: ask
- *"How would you apply auth to everything except login and register?"* → mount the public auth router first, then protect routers with router-level `authenticate`.
- *"Do nested resources need parent params?"* → `mergeParams`.
- Trap: order still matters inside each router.
:::

::: important ⭐ Say this in the interview
"Both are normal middleware functions; the difference is scope. Application-level middleware is attached to the app with app.use or app.METHOD and runs for every request, or every request under a path prefix, so I use it for cross-cutting things like helmet, CORS, JSON parsing, request ids, logging, the 404 and the error handler. Router-level middleware is attached to an express.Router and only runs for requests that enter that router, which is perfect for feature rules like admin authentication. Routers act as mini-apps I mount at a prefix; for nested resources like users/:userId/orders I use mergeParams so the child router can read the parent's parameters."
:::

::: links
Express: Router API | https://expressjs.com/en/5x/api.html#router
Express: Using middleware (router-level) | https://expressjs.com/en/guide/using-middleware.html#middleware.router
:::

=== What is Express.js?
@p 2
@tags express, basics
@quick
- Express is a **minimal, unopinionated web framework** on top of Node's `http` module: routing, middleware, request/response helpers.
- Current major version: **Express 5** (`npm install express` installs 5.x): async errors forwarded, stricter path syntax, Node 18+.
- It gives you building blocks, not an architecture: you choose structure, validation, ORM, auth.
- Measured hello-world JSON throughput (one process): Node `http` ~55k req/s, Fastify ~50k, Express 4 ~19.5k, **Express 5 ~17.5k**; real apps are usually DB-bound, not framework-bound.
- Alternatives: **Fastify** (speed, JSON-schema validation), **NestJS** (structure, DI, TypeScript), Koa, Hono.

::: text 🧒 In simple words
Node's `http` module is like a **bare kitchen**: a stove and a sink. You can cook anything, but you have to build every shelf and system yourself. Express is a **set of practical kitchen tools**: a recipe book that matches orders to dishes (routing), a conveyor belt of prep stations (middleware) and handy utensils (`res.json`, `req.params`). It doesn't force a cooking style on you, which is great for flexibility but means the team must agree on how to organise the kitchen.
:::

::: text 📖 Detailed answer
**Express** is the most widely used Node.js web framework. It wraps the low-level `http` server and adds:
| Feature | What you get |
|---|---|
| **Routing** | `app.get('/users/:id', handler)`, route params, query parsing, routers |
| **Middleware pipeline** | Compose cross-cutting concerns (auth, logging, validation) |
| **Request/response helpers** | `req.params`, `req.query`, `req.get()`, `res.status().json()`, `res.cookie()`, `res.redirect()` |
| **Static files** | `express.static('public')` |
| **Ecosystem** | helmet, cors, multer, passport, express-rate-limit, morgan… |

### Express 5 (current) vs Express 4
| | Express 4 | Express 5 |
|---|---|---|
| Rejected promise in a handler | Request hangs unless you call `next(err)` | Forwarded to error middleware automatically |
| Wildcard routes | `app.get('*')` | Named wildcards: `app.get('/*splat')` |
| `req.query` | Writable, `qs` parser by default | Read-only getter, simple parser by default |
| Removed | — | `req.param()`, `res.sendfile()` (use `sendFile`), `app.del()`… |
| Node.js | 0.10+ | **18+** |

### Measured throughput (hello-world JSON, 50 connections, one process, Node 22)
| Server | Requests/s |
|---|---|
| Node `http` | ~55,000 |
| Fastify 5 | ~50,000 |
| Express 4 | ~19,500 |
| Express 5 | ~17,500 |

These numbers matter for tiny endpoints; most real APIs spend their time in the database and network, so team familiarity and ecosystem often matter more.

### When to choose what
| Framework | Pick it when |
|---|---|
| **Express** | You want the biggest ecosystem and maximum flexibility |
| **Fastify** | You want high throughput and built-in schema validation/serialization |
| **NestJS** | A large team wants enforced structure, DI, decorators, TypeScript-first |
:::

::: diagram What Express adds on top of Node's http module
flowchart TB
  HTTP["Node http.createServer: raw req, res"] --> EXP["Express app"]
  EXP --> RT["Router: method + path → handlers, params"]
  EXP --> MW["Middleware pipeline: json, cors, auth, logging"]
  EXP --> HL["Helpers: res.json, res.status, req.params, req.query"]
  EXP --> ER["Error handling: next(err), 4-arg middleware"]
  RT --> YOU["Your handlers and services"]
:::

::: chart bar Measured: hello-world JSON throughput, one process (requests/second)
Server,Requests per second
Node http,55000
Fastify 5,50000
Express 4,19500
Express 5,17500
:::

::: image Bare kitchen vs a set of tools: Express adds routing, middleware and helpers to Node's http server
/images/express/what-is-express.svg
:::

::: text 🪜 Step by step
What happens with `POST /api/todos` and body `{"title":"Learn Express"}` in the API below:
1. Node's `http` server receives the request and hands it to the Express app function.
2. `express.json()` (app-level middleware) reads the body stream and sets `req.body = { title: 'Learn Express' }`.
3. The router matches `POST /api/todos` and runs the handler.
4. The handler validates the title, creates the todo, and calls `res.status(201).location(...).json(todo)`.
5. `res.json` serialises the object, sets `Content-Type: application/json` and ends the response.
6. Unknown routes fall through to the 404 handler; thrown errors go to the error middleware.
:::

::: code javascript A complete small REST API in Express 5 (node todos.js)
// How to run: npm install express && node todos.js
// Then: curl -s -X POST localhost:3000/api/todos -H 'Content-Type: application/json' -d '{"title":"Learn Express"}'
//       curl -s localhost:3000/api/todos     curl -s -X PATCH localhost:3000/api/todos/1 -H 'Content-Type: application/json' -d '{"done":true}'
const express = require('express');

const app = express();
app.use(express.json());

let nextId = 1;
const todos = new Map();

const findTodo = (req, res) => {
  const todo = todos.get(Number(req.params.id));
  if (!todo) res.status(404).json({ error: 'Todo not found' });
  return todo;
};

app.get('/api/todos', (req, res) => res.json([...todos.values()]));

app.get('/api/todos/:id', (req, res) => {
  const todo = findTodo(req, res);
  if (todo) res.json(todo);
});

app.post('/api/todos', (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'title is required' });
  const todo = { id: nextId++, title, done: false };
  todos.set(todo.id, todo);
  return res.status(201).location(`/api/todos/${todo.id}`).json(todo);
});

app.patch('/api/todos/:id', (req, res) => {
  const todo = findTodo(req, res);
  if (!todo) return undefined;
  if (typeof req.body?.done === 'boolean') todo.done = req.body.done;      // only allowed fields
  if (typeof req.body?.title === 'string' && req.body.title.trim()) todo.title = req.body.title.trim();
  return res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
  todos.delete(Number(req.params.id));
  res.status(204).end();
});

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
:::

::: code javascript Browser demo: the core of a router in 15 lines (runnable)
// Express's job, simplified: match method + path pattern, extract params, call the handler.
function createApp() {
  const routes = [];
  const add = (method) => (path, handler) => {
    const keys = [];
    const regex = new RegExp(`^${path.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, regex, keys, handler });
  };
  return {
    get: add('GET'), post: add('POST'),
    handle(method, url) {
      for (const r of routes) {
        const m = r.method === method && url.match(r.regex);
        if (m) return r.handler({ params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])) });
      }
      return { status: 404 };
    },
  };
}

const mini = createApp();
mini.get('/users/:id', (req) => ({ status: 200, body: `user ${req.params.id}` }));
mini.get('/users/:id/orders/:orderId', (req) => ({ status: 200, body: `order ${req.params.orderId} of ${req.params.id}` }));

const a = mini.handle('GET', '/users/42');
const b = mini.handle('GET', '/users/42/orders/7');
const c = mini.handle('POST', '/users/42');
console.log(a.body, a.body === 'user 42' ? '✅' : '❌ FAIL');
console.log(b.body, b.body === 'order 7 of 42' ? '✅' : '❌ FAIL');
console.log('wrong method → 404', c.status === 404 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating Express as an architecture: without agreed structure, apps become one huge `app.js`.
- Copying Express 4 snippets into Express 5 (`app.get('*')`, writing to `req.query`) and getting errors.
- Choosing a framework by hello-world benchmarks alone; the DB is usually the bottleneck.
- Forgetting security basics Express doesn't add by default: `helmet`, rate limiting, body size limits, CORS rules.
:::

::: understand
- Express = **routing + middleware + helpers** over Node's `http`; everything else is your choice.
- Express 5 removes the biggest Express 4 trap (unhandled async errors); know both because many codebases still run 4.
- Concepts transfer: Nest guards/interceptors and Fastify hooks are middleware with more structure.
:::

::: ask
- *"Which framework does the team use, and which Express version?"*
- *"Is raw throughput a real requirement?"* (e.g. a high-traffic proxy) → Fastify may be worth it.
- *"Do we want enforced structure for a big team?"* → NestJS.
:::

::: important ⭐ Say this in the interview
"Express is a minimal, unopinionated web framework on top of Node's http module. It gives me routing with path parameters, a middleware pipeline for things like JSON parsing, auth and logging, and helpers such as res.json and res.status, plus a huge ecosystem. The current major version is Express 5, which forwards rejected promises from async handlers to the error middleware and has stricter route path syntax. It's not the fastest: in a quick hello-world benchmark Fastify handled roughly two and a half times more requests, but real APIs are usually limited by the database. Because Express doesn't impose structure, I organise apps in layers, add helmet, rate limiting and validation, and would pick NestJS when a large team needs enforced conventions."
:::

::: links
Express official site | https://expressjs.com
Express 5: Migration guide | https://expressjs.com/en/guide/migrating-5.html
Fastify | https://fastify.dev
NestJS | https://nestjs.com
:::
