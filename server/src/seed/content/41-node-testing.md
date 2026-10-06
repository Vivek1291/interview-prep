@section Node.js & API Testing
@icon 🟢
@color #22c55e
@desc Testing the backend: unit tests with node:test, Vitest or Jest (measured), integration tests for Express APIs with Supertest and a real test database, and mocking modules, time and HTTP in Node. All tests shown ran on Node 22 with MongoDB 7.

=== How do you unit test Node.js code? (node:test vs Vitest vs Jest)
@p 3
@tags testing, nodejs, node-test, vitest, jest, unit
@quick
- Three common runners: **`node:test`** (built into Node, no install), **Vitest** (fast, ESM/TypeScript-native, Jest-compatible API), **Jest** (most widespread in older codebases).
- Measured: the same 50 unit tests took **87 ms** with `node:test`, **426 ms** with Vitest and **451 ms** with Jest (wall time including startup).
- Unit-test **pure logic** (validation, pricing, mapping, utilities) and **services** with injected fake dependencies; keep Express/DB code thin.
- `node:test`: `test()`, `describe()`, `assert` from `node:assert/strict`, `mock`, `--watch`, `--test-coverage`.
- Choose by context: new backend-only project → `node:test` or Vitest; full-stack TypeScript monorepo → Vitest; existing Jest setup → keep Jest.

::: text 🧒 In simple words
Unit testing a backend is **checking each machine in a factory on its own** before connecting the conveyor belts. The test runner is the **inspector**: Node now ships with one built in (`node:test`), and Vitest/Jest are inspectors with extra gadgets.
:::

::: text 📖 Detailed answer
### Measured: 50 identical tests (Node 22, M3 Pro, median of 5 runs, includes process start)
| Runner | Time | Notes |
|---|---|---|
| `node --test` | 87 ms | no dependencies, tiny startup |
| Vitest 5 | 426 ms | Vite transform pipeline, watch mode, UI, coverage |
| Jest 30 | 451 ms | needs Babel/ts-jest for TS and ESM |
In watch mode and large suites, Vitest's parallelism and caching narrow the gap; startup cost matters most for small suites and CI cold starts.

### Comparison
| | `node:test` | Vitest | Jest |
|---|---|---|---|
| Install | nothing (Node 18+, stable in 20+) | `vitest` | `jest` (+ transforms) |
| TypeScript | type stripping (Node 22.6+) or a loader | native | `ts-jest`/Babel/SWC |
| ESM | native | native | experimental/needs config |
| Mocking | `mock.fn`, `mock.method`, `mock.timers`, `mock.module` | `vi.fn`, `vi.mock`, fake timers | `jest.fn`, `jest.mock` |
| Watch / coverage | `--watch`, `--experimental-test-coverage` | yes, plus UI | yes |
| Snapshot | yes (`t.assert.snapshot`) | yes | yes |

### What to unit test in a Node API
- Validation schemas and business rules (`canCancelOrder(order, user)`).
- Services with injected repositories, mailers and clocks.
- Error mapping (`toHttpError(err)`), pagination/cursor helpers.
Routes, middleware wiring and database queries are better covered by **integration tests** (next question).
:::

::: diagram Where unit tests fit in a layered API
flowchart LR
  R["routes and controllers"] --> S["services: business rules"]
  S --> RP["repositories: DB access"]
  U["unit tests"] -->|"fakes for repositories, mailer, clock"| S
  I["integration tests (Supertest + test DB)"] --> R
:::

::: image Test runners for Node.js (measured)
/images/testing/node-runners.svg
:::

::: chart bar Measured: running the same 50 unit tests (ms, wall time incl. startup, Node 22)
Runner,Time (ms)
node:test,87
Vitest 5,426
Jest 30,451
:::

::: text 🪜 Step by step
Unit testing an order-cancellation rule:
1. Extract `canCancel(order, user, now)` from the route handler into `services/orders.js`.
2. Write `orders.test.js` with `test()` cases: owner within 24 h → true; after 24 h → false; admin → always true; shipped → false.
3. Pass `now` explicitly (no real clock).
4. Run `node --test` (or `npx vitest`) in watch mode while coding.
5. The route stays a thin adapter: parse input → call the service → map the result to HTTP.
:::

::: code javascript services/orders.test.js: node:test unit tests (no dependencies)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// services/orders.js (pure business rule)
function canCancel(order, user, now = new Date()) {
  if (order.status === 'shipped') return false;
  if (user.role === 'admin') return true;
  const hours = (now - new Date(order.createdAt)) / 36e5;
  return order.userId === user.id && hours <= 24;
}

describe('canCancel', () => {
  const order = { id: 1, userId: 'u1', status: 'paid', createdAt: '2027-01-15T10:00:00Z' };
  test('the owner can cancel within 24 hours', () => {
    assert.equal(canCancel(order, { id: 'u1', role: 'user' }, new Date('2027-01-16T09:00:00Z')), true);
  });
  test('the owner cannot cancel after 24 hours', () => {
    assert.equal(canCancel(order, { id: 'u1', role: 'user' }, new Date('2027-01-16T11:00:00Z')), false);
  });
  test('another user cannot cancel', () => {
    assert.equal(canCancel(order, { id: 'u2', role: 'user' }, new Date('2027-01-15T11:00:00Z')), false);
  });
  test('admins can always cancel unless shipped', () => {
    assert.equal(canCancel(order, { id: 'a', role: 'admin' }, new Date('2027-03-01')), true);
    assert.equal(canCancel({ ...order, status: 'shipped' }, { id: 'a', role: 'admin' }), false);
  });
});
// run: node --test   (or node --test --watch)
:::

::: code javascript The same rule tested in the browser (runnable)
function canCancel(order, user, now = new Date()) {
  if (order.status === 'shipped') return false;
  if (user.role === 'admin') return true;
  const hours = (now - new Date(order.createdAt)) / 36e5;
  return order.userId === user.id && hours <= 24;
}
const order = { userId: 'u1', status: 'paid', createdAt: '2027-01-15T10:00:00Z' };
const cases = [
  ['owner within 24 h', canCancel(order, { id: 'u1', role: 'user' }, new Date('2027-01-16T09:00:00Z')), true],
  ['owner after 24 h', canCancel(order, { id: 'u1', role: 'user' }, new Date('2027-01-16T11:00:00Z')), false],
  ['other user', canCancel(order, { id: 'u2', role: 'user' }, new Date('2027-01-15T11:00:00Z')), false],
  ['admin, not shipped', canCancel(order, { id: 'a', role: 'admin' }, new Date('2027-03-01')), true],
  ['admin, shipped', canCancel({ ...order, status: 'shipped' }, { id: 'a', role: 'admin' }), false],
];
for (const [name, got, want] of cases) console.log(name.padEnd(20), got === want ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Testing business rules only through HTTP (slow, unclear failures).
- Business logic inside route handlers (hard to unit test).
- Reading `new Date()` / `Math.random()` inside logic instead of injecting them.
- Picking a runner by habit: Jest + ESM + TypeScript often needs extra config that `node:test`/Vitest avoid.
:::

::: understand
- Unit tests for rules and services; the runner matters less than keeping logic testable.
:::

::: ask
- *"Is the project ESM and TypeScript?"* That tilts the choice to `node:test` or Vitest.
:::

::: important ⭐ Say this in the interview
"In Node I unit test pure logic and services, with dependencies like repositories, mailers and the clock injected so tests pass fakes, and keep route handlers as thin adapters. For runners, node:test is built into Node with test, describe, assert and mocking, Vitest gives a fast Jest-compatible API with native TypeScript and ESM, and Jest is common in existing codebases. In a measurement the same fifty tests took 87 milliseconds with node:test, about 430 with Vitest and 450 with Jest, mostly startup. Routes and database queries I cover with integration tests instead."
:::

::: links
Node.js: Test runner | https://nodejs.org/api/test.html
Vitest | https://vitest.dev/
Jest | https://jestjs.io/
:::

=== How do you integration test an Express API? (Supertest and a test database)
@p 3
@tags testing, nodejs, express, supertest, mongodb, integration
@quick
- **Supertest** sends HTTP requests to your Express `app` **without starting a server**: `await request(app).post('/api/users').send({...}).expect(201)`.
- Test the real stack: routing, middleware, validation, error handling, the data layer, ideally against a **real test database** (separate DB name, Docker, CI service, Testcontainers or `mongodb-memory-server`).
- Isolation: connect + `syncIndexes()` in `before`, **clean collections in `beforeEach`**, `dropDatabase()` + disconnect in `after`. **Never** point tests at real data.
- Measured with MongoDB 7: **3–9 ms** per test after a 70 ms warm-up; an in-memory fake took **5.6 ms**. The real DB caught the **unique index (409)** and schema trimming/lowercasing, which a fake wouldn't.
- Export the `app` from a module (`createApp()`), and call `app.listen` only in the entry file.

::: text 🧒 In simple words
An integration test is **ordering at the counter of a test restaurant**: a real kitchen, real fridge (database), real waiter (routes), but **empty before every order** so one test's leftovers never land on another test's plate.
:::

::: text 📖 Detailed answer
### Structure that makes APIs testable
- `app.js` exports `createApp()` (no `listen`).
- `server.js` connects to the DB and calls `createApp().listen(port)`.
- Tests import `createApp` and use `request(app)`.

### Database strategy
| Option | Pros | Cons |
|---|---|---|
| Real DB, separate name (Docker locally, service in CI) | real indexes, queries, transactions | needs infra |
| `mongodb-memory-server` / Testcontainers | real engine, created per run | download/startup time |
| In-memory fake repository | fastest, no infra | misses DB behaviour (indexes, query semantics) |
Use fakes for unit tests of services, a real DB for API integration tests.

### Isolation rules
- One database per test process/worker (e.g. suffix with the worker id) when tests run in parallel.
- Clean state before each test (`deleteMany({})`) or wrap each test in a transaction and roll back (SQL).
- Seed with factories (`createUser({ email: unique() })`).

### What to assert
Status codes, response bodies (`toMatchObject`), headers (auth cookies), side effects in the DB, and error formats (400/401/403/404/409).
:::

::: diagram An integration test request
sequenceDiagram
  participant T as Test (Supertest)
  participant A as Express app
  participant V as Validation and model
  participant D as MongoDB (test DB)
  T->>A: "POST /api/users { name, email }"
  A->>V: "Mongoose schema: trim, lowercase, required"
  V->>D: "insert (unique index on email)"
  D-->>A: "ok, or duplicate key error 11000"
  A-->>T: "201 { data } or 409 { error }"
  T->>T: "assert status, body, then GET to verify"
:::

::: image Integration testing an API with Supertest and a test database
/images/testing/supertest-db.svg
:::

::: chart bar Measured: per-test time for the same API tests (ms, Node 22, MongoDB 7)
Setup,Median ms per test
in-memory fake repository,5.6
real MongoDB (after warm-up),8.7
real MongoDB first test (warm-up),69.9
:::

::: text 🪜 Step by step
`duplicate email → 409 from the unique index`:
1. `before`: `mongoose.connect('mongodb://localhost:27018/users_api_test')` and `User.syncIndexes()`.
2. `beforeEach`: `User.deleteMany({})`.
3. First `POST` with `asha@x.com` → 201.
4. Second `POST` with `ASHA@x.com` → the schema lowercases it, MongoDB rejects the duplicate (code 11000) → the route maps it to **409**.
5. `after`: `dropDatabase()` and `disconnect()`, so nothing is left behind.
:::

::: code javascript app.js and users.int.test.js: Express + Mongoose + Supertest (these tests passed)
// app.js
const express = require('express');
const mongoose = require('mongoose');

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, minlength: 2, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
}, { timestamps: true }));

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/users', async (req, res) => res.json({ data: await User.find().sort({ createdAt: 1 }).lean() }));
  app.post('/api/users', async (req, res) => {
    try {
      const user = await User.create({ name: req.body?.name, email: req.body?.email });
      res.status(201).json({ data: user });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'email already registered' });
      if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
      throw err;
    }
  });
  return app;
}
module.exports = { createApp, User };

// users.int.test.js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/users_api_test';   // never the real database
let app;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await User.syncIndexes();                      // the unique index on email must exist
  app = createApp();
});
beforeEach(async () => { await User.deleteMany({}); });   // every test starts from an empty collection
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('POST then GET returns the stored user', async () => {
  const created = await request(app).post('/api/users').send({ name: '  Asha ', email: 'ASHA@x.com' }).expect(201);
  assert.equal(created.body.data.name, 'Asha');           // trimmed by the schema
  assert.equal(created.body.data.email, 'asha@x.com');    // lowercased by the schema
  const list = await request(app).get('/api/users').expect(200);
  assert.equal(list.body.data.length, 1);
});

test('invalid input → 400 from Mongoose validation', async () => {
  const res = await request(app).post('/api/users').send({ name: 'A', email: 'a@x.com' }).expect(400);
  assert.match(res.body.error, /name/);
});

test('duplicate email → 409 from the unique index', async () => {
  await request(app).post('/api/users').send({ name: 'Asha', email: 'asha@x.com' }).expect(201);
  await request(app).post('/api/users').send({ name: 'Other', email: 'ASHA@x.com' }).expect(409);
});
:::

::: code javascript What Supertest does: call the app like an HTTP client (runnable simulation)
// A tiny "app" (handler) and a "request" helper: the same shape as Express + Supertest, without the network.
function createApp(db) {
  return async ({ method, path, body }) => {
    if (method === 'POST' && path === '/api/users') {
      if (!body?.name || body.name.trim().length < 2) return { status: 400, body: { error: 'name too short' } };
      const email = String(body.email).toLowerCase();
      if (db.some((u) => u.email === email)) return { status: 409, body: { error: 'email already registered' } };
      const user = { id: db.length + 1, name: body.name.trim(), email };
      db.push(user);
      return { status: 201, body: { data: user } };
    }
    if (method === 'GET' && path === '/api/users') return { status: 200, body: { data: db } };
    return { status: 404, body: { error: 'not found' } };
  };
}
const request = (app) => ({ post: (path, body) => app({ method: 'POST', path, body }), get: (path) => app({ method: 'GET', path }) });

(async () => {
  const api = request(createApp([]));                 // fresh "database" per test
  const created = await api.post('/api/users', { name: '  Asha ', email: 'ASHA@x.com' });
  console.log('201 + normalised data', created.status === 201 && created.body.data.email === 'asha@x.com' && created.body.data.name === 'Asha' ? '✅' : '❌ FAIL');
  console.log('400 on invalid input', (await api.post('/api/users', { name: 'A', email: 'a@x.com' })).status === 400 ? '✅' : '❌ FAIL');
  console.log('409 on duplicate email', (await api.post('/api/users', { name: 'Other', email: 'asha@x.com' })).status === 409 ? '✅' : '❌ FAIL');
  console.log('GET lists one user', (await api.get('/api/users')).body.data.length === 1 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Running tests against the development or production database (tests drop data!).
- `app.listen()` inside `app.js` (port conflicts, open handles in tests).
- Not cleaning between tests (order-dependent failures).
- Forgetting `syncIndexes()`, so unique constraints silently don't exist in the test DB.
- Asserting only status codes, not bodies and side effects.
:::

::: understand
- Integration tests prove the wiring: HTTP → middleware → validation → database, each test from a clean slate.
:::

::: ask
- *"How does CI provide the database?"* Service container, memory server or Testcontainers.
:::

::: important ⭐ Say this in the interview
"I export the Express app from a module without calling listen, so Supertest can send requests to it in-process. Integration tests run against a real but separate test database: I connect and sync indexes before the suite, clean collections before each test and drop the database afterwards, and I never point them at real data. That catches things fakes miss: in my example the unique index produced a 409 on a duplicate email and the schema trimmed and lowercased input. Per test it cost only a few milliseconds more than an in-memory fake after warm-up. I assert status codes, bodies and side effects, including error formats."
:::

::: links
Supertest | https://github.com/ladjs/supertest
Mongoose: Testing with Jest | https://mongoosejs.com/docs/jest.html
Testcontainers for Node.js | https://node.testcontainers.org/
:::

=== How do you mock dependencies in Node tests? (modules, time, HTTP)
@p 2
@tags testing, nodejs, mocking, msw, fake-timers
@quick
- Prefer **dependency injection**: `createApp({ db, mailer, clock })` lets tests pass fakes without any mocking library.
- **Method mocks**: `mock.method(mailer, 'send', fake)` (`node:test`) or `vi.spyOn(mailer, 'send')`; restore with `mock.restoreAll()` / `vi.restoreAllMocks()`.
- **Time**: `mock.timers.enable({ apis: ['setTimeout'] })` + `mock.timers.tick(60_000)` or `vi.useFakeTimers()`; never wait in real time.
- **HTTP**: stub `globalThis.fetch`, or intercept any client with **MSW** (`msw/node`) or **nock**.
- **Module mocks** (`vi.mock('./mailer')`, `jest.mock`, `mock.module`) are a last resort: hoisting makes them surprising and they couple tests to file structure.

::: text 🧒 In simple words
Mocking is **swapping real props for stage props** during rehearsal: a fake phone that doesn't call anyone (mailer), a clock you can fast-forward (timers), a pretend bank (HTTP). The easiest stages have **slots for props** built in (dependency injection), so you don't have to sneak them in.
:::

::: text 📖 Detailed answer
### Techniques from cleanest to most magical
| Technique | Example | Notes |
|---|---|---|
| Dependency injection | `createService({ mailer: fakeMailer })` | explicit, no library, works with any runner |
| Method mock / spy | `mock.method(obj, 'send', impl)` | object must be shared; restore after |
| Fake timers | `mock.timers.tick(ms)`, `vi.advanceTimersByTime(ms)` | deterministic retries, debounces, schedulers |
| Global fetch stub | `mock.method(globalThis, 'fetch', async () => new Response(...))` | only for fetch-based code |
| Network interception | MSW `setupServer(http.get(...))`, `nock('https://api…')` | works for any HTTP client |
| Module mock | `vi.mock('./mailer', () => ({ send: vi.fn() }))` | hoisted; replaces for the whole file |

### What to mock in a backend
- Outgoing HTTP (payment, email, third-party APIs).
- Time and randomness (`Date`, `setTimeout`, `crypto.randomUUID` for predictable ids).
- **Not** your database in integration tests (use a test DB); fine to fake it in service unit tests.

### Restoring
Leaked mocks are a top cause of order-dependent failures: `afterEach(() => mock.restoreAll())` (node:test) or `restoreMocks: true` in Vitest config.
:::

::: diagram Choosing a mocking technique
flowchart TD
  D{"Can the dependency be passed in?"} -->|"yes"| DI["dependency injection with a fake"]
  D -->|"no"| O{"Is it a method on a shared object?"}
  O -->|"yes"| MM["mock.method or vi.spyOn"]
  O -->|"no"| H{"Is it outgoing HTTP?"}
  H -->|"yes"| MSW["MSW or nock (any client)"]
  H -->|"no"| MOD["module mock (last resort)"]
:::

::: image Mocking in Node.js tests
/images/testing/node-mocking.svg
:::

::: text 🪜 Step by step
Testing "send a reminder email after 1 minute" without email or waiting:
1. `mock.method(mailer, 'send', async () => ({ id: 'm1' }))`: the real mailer would throw in tests.
2. `mock.timers.enable({ apis: ['setTimeout'] })`.
3. Start `remindLater('asha@x.com', 60_000)`.
4. `mock.timers.tick(60_000)`: the timer fires instantly.
5. Assert the result and `send.mock.calls[0].arguments`, then `mock.restoreAll()` and `mock.timers.reset()`.
:::

::: code javascript mocking.test.js: node:test method mocks, fake timers and a fetch stub (passed)
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const mailer = { async send(to, body) { throw new Error('real email must not be sent in tests'); } };
async function remindLater(to, ms) {
  return new Promise((resolve) => setTimeout(() => resolve(mailer.send(to, 'Reminder!')), ms));
}
async function getRate(currency) {
  const res = await fetch(`https://api.rates.example/latest?base=${currency}`);
  if (!res.ok) throw new Error(`rates API failed: ${res.status}`);
  return (await res.json()).rate;
}

afterEach(() => mock.restoreAll());

test('mock.method replaces a dependency and records calls', async () => {
  const send = mock.method(mailer, 'send', async () => ({ id: 'm1' }));
  mock.timers.enable({ apis: ['setTimeout'] });
  const pending = remindLater('asha@x.com', 60_000);
  mock.timers.tick(60_000);                      // no real minute of waiting
  assert.deepEqual(await pending, { id: 'm1' });
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, ['asha@x.com', 'Reminder!']);
  mock.timers.reset();
});

test('stubbing global fetch: success and failure', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ rate: 83.2 }), { status: 200 }));
  assert.equal(await getRate('USD'), 83.2);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /base=USD/);

  fetchMock.mock.mockImplementation(async () => new Response('down', { status: 503 }));
  await assert.rejects(getRate('USD'), /rates API failed: 503/);
});
:::

::: code javascript Dependency injection: no mocking library needed (runnable)
function createReminderService({ mailer, schedule }) {
  return { remind: (to, ms) => new Promise((resolve) => schedule(() => resolve(mailer.send(to, 'Reminder!')), ms)) };
}
// test doubles
const sent = [];
const fakeMailer = { send: async (to, body) => { sent.push({ to, body }); return { id: `m${sent.length}` }; } };
const scheduled = [];
const fakeSchedule = (fn, ms) => scheduled.push({ fn, ms });     // we decide when time passes

const service = createReminderService({ mailer: fakeMailer, schedule: fakeSchedule });
const pending = service.remind('asha@x.com', 60000);
console.log('nothing sent before time passes', sent.length === 0 && scheduled[0].ms === 60000 ? '✅' : '❌ FAIL');
scheduled[0].fn();                                                // "advance the clock"
pending.then((result) => {
  console.log('sent once after the delay', sent.length === 1 && sent[0].to === 'asha@x.com' && result.id === 'm1' ? '✅' : '❌ FAIL');
});
:::

::: warning ⚠️ Common mistakes
- Not restoring mocks/timers (later tests break mysteriously).
- Module-mocking your own database layer in API integration tests (they then test nothing real).
- Real `setTimeout` waits in tests (slow, flaky).
- Stubbing `fetch` when the code uses axios (or vice versa); MSW avoids this.
- Mocks that return shapes the real service never returns.
:::

::: understand
- Inject dependencies; fake time and the network; restore everything after each test.
:::

::: ask
- *"Which calls leave our process (HTTP, email, queues)?"* Those are what to fake.
:::

::: important ⭐ Say this in the interview
"My first choice is dependency injection: services receive their mailer, repositories and clock, so tests pass fakes without any mocking library. When that isn't possible I use method mocks, mock.method in node:test or vi.spyOn in Vitest, fake timers to fast-forward delays, and for outgoing HTTP either a fetch stub or MSW or nock, which work regardless of the HTTP client. Module mocks are my last resort because of hoisting surprises. I restore all mocks after each test, and I don't mock the database in API integration tests; that's what a test database is for."
:::

::: links
Node.js: Mocking in tests | https://nodejs.org/api/test.html#mocking
Vitest: Mocking | https://vitest.dev/guide/mocking
MSW in Node | https://mswjs.io/docs/integrations/node
:::
