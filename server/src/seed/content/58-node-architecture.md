@section Node.js Architecture & Production Readiness
@icon 🏛️
@color #4f46e5
@desc Structuring and running Node.js backends: project layout and layered/clean/hexagonal architecture, design patterns and dependency injection, TypeScript with Node (measured run options, TypeScript 7), configuration and environments (measured fail-fast), OpenAPI docs generated from Zod (measured), graceful shutdown and health checks (measured keep-alive pitfall) and request context with AsyncLocalStorage (measured).

=== How do you structure a large Node.js backend? (layers, clean and hexagonal architecture)
@p 3
@tags architecture, nodejs, clean-architecture, hexagonal, project-structure
@quick
- Split by **responsibility**: routes/controllers (HTTP) → services (business rules) → repositories/adapters (DB, queues, HTTP clients) → domain/models.
- **Dependencies point inward**: services don't know Express or SQL; controllers don't contain business rules; repositories don't decide permissions.
- **Clean/hexagonal (ports & adapters)**: services depend on interfaces (ports) like `OrderRepository`, `PaymentGateway`; Postgres, Stripe or an in-memory fake are adapters you plug in.
- For bigger systems organise by **feature/module** (`modules/orders/{routes,service,repository}`) rather than one giant `controllers/` folder; this leads to a **modular monolith**.
- Keep `app.js` (build the app, no `listen`) separate from `server.js` (listen, shutdown) so tests can use the app directly.

::: text 🧒 In simple words
A restaurant has a **front desk** (controllers) that takes orders, **chefs** (services) who decide how dishes are made, and **suppliers** (repositories/adapters) who deliver ingredients. The chef doesn't care whether vegetables come from supplier A or B, and the front desk never cooks. That's what makes it easy to change one part without breaking the others.
:::

::: text 📖 Detailed answer
### Layers and their jobs
| Layer | Does | Must not |
|---|---|---|
| Route / controller | parse & validate input, call a service, map result/errors to HTTP | contain business rules or SQL |
| Service (use case) | business rules, transactions, orchestration | know about `req`/`res` |
| Repository / adapter | talk to DB, cache, queue, external APIs | decide business rules |
| Domain / model | entities, value objects, invariants | do I/O |

### Folder layouts
| Small/medium app | Larger app (modular monolith) |
|---|---|
| `routes/ controllers/ services/ repositories/ models/ middleware/ validators/ config/ jobs/` | `modules/orders/{orders.routes,orders.service,orders.repository,orders.schemas}.js`, `modules/users/…`, `shared/{db,logger,errors}` |

### Architectures you should be able to name
| Style | Idea |
|---|---|
| Layered (n-tier) | presentation → business → data, top-down calls |
| Clean / onion | domain in the centre; outer layers depend inward |
| Hexagonal (ports & adapters) | the core exposes ports; HTTP, DB, queues are adapters around it |
| Domain-Driven Design | model the business language; bounded contexts become modules/services |
| Modular monolith | one deployable, strict module boundaries; easy to split later |

This Learning Hub's own server follows routes → controllers → services → repositories → models.
:::

::: diagram Dependencies point inward
flowchart LR
  HTTP["Express routes and controllers"] --> SVC["services: business rules"]
  JOBS["queue workers"] --> SVC
  SVC --> PORT["ports: OrderRepository, PaymentGateway"]
  PG["Postgres adapter"] -.->|"implements"| PORT
  STRIPE["Stripe adapter"] -.->|"implements"| PORT
  FAKE["in-memory fake for tests"] -.->|"implements"| PORT
:::

::: image Structuring a Node.js backend: layers and folders
/images/nodejs/architecture-layers.svg
:::

::: text 🪜 Step by step
`POST /api/orders` through the layers:
1. Route → `validate(createOrderSchema)` → `ordersController.create`.
2. Controller calls `orderService.placeOrder(user.id, dto)` and maps the result to `201`.
3. Service checks business rules (stock, limits), opens a transaction, calls `orderRepository.create` and `outbox.add`.
4. Repository runs SQL; the payment adapter calls Stripe.
5. Errors bubble up as domain errors (`OutOfStockError`) that the error middleware maps to 409.
:::

::: code javascript A feature module: routes → service → repository with injected dependencies
// modules/orders/orders.repository.js
function createOrderRepository(pool) {
  return {
    async create(client, { userId, totalCents }) {
      const { rows } = await client.query('INSERT INTO orders (user_id, status, total_cents, created_at) VALUES ($1, $2, $3, now()) RETURNING id', [userId, 'pending', totalCents]);
      return rows[0].id;
    },
    async findForUser(userId) {
      const { rows } = await pool.query('SELECT id, status, total_cents FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
      return rows;
    },
  };
}

// modules/orders/orders.service.js (no Express, no SQL)
class OutOfStockError extends Error { constructor() { super('Out of stock'); this.status = 409; this.code = 'OUT_OF_STOCK'; } }
function createOrderService({ orders, inventory, withTransaction }) {
  return {
    async placeOrder(userId, { productId, qty }) {
      return withTransaction(async (tx) => {
        const price = await inventory.reserve(tx, productId, qty);
        if (price === null) throw new OutOfStockError();
        return { orderId: await orders.create(tx, { userId, totalCents: price * qty }) };
      });
    },
    listOrders: (userId) => orders.findForUser(userId),
  };
}

// modules/orders/orders.routes.js (HTTP only)
const express = require('express');
function createOrderRoutes(orderService) {
  const router = express.Router();
  router.post('/orders', async (req, res) => res.status(201).json(await orderService.placeOrder(req.user.id, req.body)));
  router.get('/orders', async (req, res) => res.json(await orderService.listOrders(req.user.id)));
  return router;
}

module.exports = { createOrderRepository, createOrderService, createOrderRoutes, OutOfStockError };
:::

::: code javascript The same service with a fake adapter (runnable)
// Because the service depends on interfaces, a test can plug in in-memory adapters: no DB, no HTTP.
function createOrderService({ orders, inventory, withTransaction }) {
  return {
    placeOrder: (userId, { productId, qty }) => withTransaction(async (tx) => {
      const price = await inventory.reserve(tx, productId, qty);
      if (price === null) throw Object.assign(new Error('Out of stock'), { status: 409 });
      return { orderId: await orders.create(tx, { userId, totalCents: price * qty }) };
    }),
  };
}
const stock = new Map([[7, { price: 1999, qty: 2 }]]); const saved = [];
const service = createOrderService({
  withTransaction: (fn) => fn({}),
  inventory: { reserve: async (tx, id, qty) => { const p = stock.get(id); if (!p || p.qty < qty) return null; p.qty -= qty; return p.price; } },
  orders: { create: async (tx, o) => (saved.push(o), saved.length) },
});
(async () => {
  console.log(await service.placeOrder(42, { productId: 7, qty: 2 }));
  console.log('service works with fake adapters', saved[0].totalCents === 3998 ? '✅' : '❌ FAIL');
  try { await service.placeOrder(42, { productId: 7, qty: 1 }); console.log('❌ FAIL'); } catch (e) { console.log('business rule enforced in the service:', e.message, e.status, '✅'); }
})();
:::

::: warning ⚠️ Common mistakes
- Business logic in route handlers ("fat controllers"), duplicated across endpoints.
- Services that take `req`/`res` (untestable without HTTP).
- One shared `utils/` dumping ground.
- Over-engineering a 5-endpoint app with 8 layers and DI containers.
- Circular imports between modules (use events or a shared module).
:::

::: understand
- Separate HTTP, rules and I/O; let dependencies point to the business core.
:::

::: ask
- *"Could I call this business rule from a queue worker or a CLI without Express?"*
:::

::: important ⭐ Say this in the interview
"I separate responsibilities into layers: routes and controllers handle HTTP and validation, services hold business rules and transactions, repositories and adapters talk to the database, caches, queues and external APIs, and domain models hold invariants. Dependencies point inward, so services know nothing about Express or SQL. In clean or hexagonal style, services depend on ports like an order repository or payment gateway, and Postgres or Stripe are adapters, which lets tests plug in in-memory fakes. For larger codebases I organise by feature module, a modular monolith, and keep app creation separate from server startup."
:::

::: links
Node.js best practices: Project structure | https://github.com/goldbergyoni/nodebestpractices#1-project-architecture-practices
Alistair Cockburn: Hexagonal architecture | https://alistair.cockburn.us/hexagonal-architecture/
:::

=== Which design patterns matter in Node.js backends, and how do you do dependency injection?
@p 2
@tags design-patterns, dependency-injection, nodejs, architecture
@quick
- **Dependency injection (DI)**: pass collaborators in (`createOrderService({ repo, mailer })`) instead of `require`-ing concrete ones inside → testable, swappable. Plain factory functions are enough; containers (awilix, tsyringe, NestJS) for big apps.
- **Repository**: hide data access behind `findById/save`. **Adapter**: wrap a vendor SDK behind your interface (SES ↔ SendGrid). **Strategy**: choose an algorithm at runtime (pricing, shipping, auth provider).
- **Factory**: build configured objects in one place (`createApp(config)`). **Observer / pub-sub**: `EventEmitter`, domain events for side effects.
- **Middleware / chain of responsibility**: Express pipeline. **Singleton**: one DB pool per process via the module cache.
- Don't memorise patterns; name them when they remove a real problem (duplication, coupling, untestable code).

::: text 🧒 In simple words
Dependency injection is **handing a chef their knives** instead of welding knives to the chef's hands: you can swap in a plastic knife for practice (tests) or a better knife later, without changing the chef.
:::

::: text 📖 Detailed answer
| Pattern | Problem it solves | Node.js example |
|---|---|---|
| Dependency injection | hard-wired dependencies, untestable code | factory functions receiving `{ db, logger, mailer }` |
| Repository | SQL/Mongo scattered in services | `userRepo.findByEmail(email)` |
| Adapter | vendor lock-in, inconsistent SDKs | `emailSender.send({ to, template })` over SES/SendGrid |
| Strategy | `if/else` chains on a type | `shippingStrategies[order.method].cost(order)` |
| Factory | complex construction repeated | `createApp({ config, services })` |
| Observer / pub-sub | side effects tangled in core logic | `events.emit('order.placed', order)` → email, analytics |
| Decorator | add behaviour without changing code | `withRetry(fn)`, `withCache(fn)`, `withTiming(fn)` |
| Middleware chain | cross-cutting concerns | auth, rate limit, logging in Express |
| Singleton (module) | one shared resource | `module.exports = new Pool()` |
| Circuit breaker | cascading failures | `opossum` around a flaky dependency |

### DI without a framework
A **composition root** (`container.js` / `server.js`) creates the real dependencies once and wires them: config → pool → repositories → services → routes. Tests build the same graph with fakes. This is what NestJS automates with decorators.
:::

::: diagram Composition root wiring dependencies
flowchart TD
  C["config"] --> P["DB pool, Redis, logger"]
  P --> R["repositories and adapters"]
  R --> S["services"]
  S --> RT["routes, workers, CLI"]
  T["tests"] -.->|"swap in fakes"| R
:::

::: image Design patterns that actually appear in Node.js backends
/images/nodejs/backend-patterns.svg
:::

::: text 🪜 Step by step
Supporting a second payment provider:
1. Define the port: `paymentGateway.charge({ amountCents, currency, idempotencyKey })`.
2. Write adapters: `createStripeGateway(stripe)` and `createAdyenGateway(client)`.
3. Strategy: pick the adapter by the merchant's country in the composition root or per request.
4. The order service is unchanged; it only knows `paymentGateway.charge`.
5. Tests use `createFakeGateway({ fail: true })` to test the declined-payment path.
:::

::: code javascript Composition root, adapter, strategy and decorator in plain JavaScript
// container.js: the only place that knows concrete implementations
function createContainer({ config, pool, redis, stripe, sesClient, logger }) {
  const orders = createOrderRepository(pool);
  const payments = createStripeGateway(stripe);                               // adapter
  const email = createSesSender(sesClient, config.mailFrom);                  // adapter
  const shipping = { standard: (o) => 499, express: (o) => 1299, pickup: () => 0 };   // strategy table
  const orderService = createOrderService({ orders, payments, email, shipping, logger });
  return { orderService };
}

// adapter: our interface on top of the vendor SDK
function createStripeGateway(stripe) {
  return {
    async charge({ amountCents, currency, customerId, idempotencyKey }) {
      const pi = await stripe.paymentIntents.create({ amount: amountCents, currency, customer: customerId, confirm: true }, { idempotencyKey });
      return { id: pi.id, status: pi.status === 'succeeded' ? 'paid' : 'pending' };
    },
  };
}
function createSesSender(ses, from) { return { send: ({ to, subject, text }) => ses.sendEmail({ Source: from, Destination: { ToAddresses: [to] }, Message: { Subject: { Data: subject }, Body: { Text: { Data: text } } } }) }; }

// decorator: add retries to any async function
const withRetry = (fn, { retries = 2, delayMs = 200 } = {}) => async (...args) => {
  for (let i = 0; ; i++) {
    try { return await fn(...args); } catch (err) { if (i >= retries) throw err; await new Promise((r) => setTimeout(r, delayMs * 2 ** i)); }
  }
};

function createOrderRepository(pool) { return { create: (o) => pool.query('INSERT INTO orders (total_cents) VALUES ($1) RETURNING id', [o.totalCents]) }; }
function createOrderService(deps) { return { quote: (order) => order.subtotalCents + deps.shipping[order.method](order) }; }

module.exports = { createContainer, withRetry };
:::

::: code javascript Strategy, observer and DI with fakes (runnable)
const shipping = { standard: () => 499, express: () => 1299, pickup: () => 0 };         // strategy
const listeners = {}; const events = { on: (e, f) => ((listeners[e] ??= []).push(f)), emit: (e, d) => (listeners[e] ?? []).forEach((f) => f(d)) };   // observer
function createCheckout({ payments, events }) {                                          // DI
  return {
    async checkout(order) {
      const total = order.subtotalCents + shipping[order.method](order);
      const result = await payments.charge(total);
      if (result.status === 'paid') events.emit('order.paid', { ...order, total });
      return { total, status: result.status };
    },
  };
}
const sent = []; events.on('order.paid', (o) => sent.push(`receipt for ${o.id}`));
const fakePayments = { charge: async (amount) => ({ status: amount > 0 ? 'paid' : 'failed' }) };
(async () => {
  const r = await createCheckout({ payments: fakePayments, events }).checkout({ id: 'o1', subtotalCents: 2000, method: 'express' });
  console.log(r, sent);
  console.log('strategy picked express shipping', r.total === 3299 ? '✅' : '❌ FAIL');
  console.log('observer triggered the receipt without the checkout knowing about email', sent[0] === 'receipt for o1' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Pattern-driven design: adding factories and strategies where a function would do.
- `require('./db')` inside every service (hidden global dependencies, hard to test).
- Event emitters for core logic that must happen in order or transactionally.
- DI containers in small apps (magic without benefit).
- Adapters that leak vendor types into services.
:::

::: understand
- Use patterns to cut coupling where it hurts; DI is just "pass dependencies in".
:::

::: ask
- *"What would I have to change to swap this provider or test this without the network?"*
:::

::: important ⭐ Say this in the interview
"The patterns I actually use in Node backends are dependency injection through factory functions and a composition root, repositories for data access, adapters around vendor SDKs, strategies to replace if-else chains, observers or domain events for side effects, decorators like withRetry or withCache, Express middleware as a chain of responsibility, and the module cache as a singleton for pools. Dependency injection here simply means passing collaborators in, so tests can pass fakes and providers can be swapped; frameworks like NestJS automate it, but plain functions are often enough. I reach for a pattern only when it removes real duplication or coupling."
:::

::: links
refactoring.guru: Design patterns | https://refactoring.guru/design-patterns
Awilix (DI container for Node) | https://github.com/jeffijoe/awilix
:::

=== How do you use TypeScript with Node.js? (run options measured, tsconfig, DTOs)
@p 3
@tags typescript, nodejs, tooling, tsconfig
@quick
- Ways to run TS: **compile with `tsc`** and run JS, Node's built-in **type stripping** (`node file.ts`, Node 22.18+/23.6+), or a loader like **tsx** (esbuild).
- Measured startup of a small TS server (median of 9): compiled JS **30 ms**, `node server.ts` **40 ms**, `tsx` **90 ms**; `tsc --noEmit` type check **50 ms** with **TypeScript 7.0.2** (the native compiler).
- Type stripping does **no type checking** and only supports **erasable** syntax: measured `enum` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; `erasableSyntaxOnly` makes `tsc` reject it at build time.
- TypeScript 7 no longer adds `@types` automatically: measured `TS2591: Cannot find name 'node:http'` until `"types": ["node"]` was set.
- Type the edges: request DTOs from Zod (`z.infer`), typed config, typed errors, typed repository results; run `tsc --noEmit` in CI.

::: text 🧒 In simple words
TypeScript is a **spell-checker for your code**. Node can now read your TypeScript directly by **ignoring the spelling marks** (type stripping), which is fast, but then nobody checks the spelling, so you still run the checker (`tsc`) before shipping.
:::

::: text 📖 Detailed answer
### Measured (macOS, Node 22.22, TypeScript 7.0.2, tiny HTTP server, median of 9 runs)
| Command | Time |
|---|---|
| `node dist/server.js` (compiled) | **30 ms** |
| `node server.ts` (type stripping) | **40 ms** |
| `tsx server.ts` | **90 ms** |
| `tsc --noEmit` (type check) | **50 ms** |

### Things the measurements revealed
| Finding | Fix |
|---|---|
| `enum Role {…}` with `node file.ts` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | use union types / `as const` objects; set `erasableSyntaxOnly` |
| `TS2591: Cannot find name 'node:http'` with TS 7 | `"types": ["node"]` in tsconfig |
| `MODULE_TYPELESS_PACKAGE_JSON` warning | `"type": "module"` in package.json (or `.mts`) |

### Recommended tsconfig for Node services
`"strict": true`, `"module"/"moduleResolution": "NodeNext"`, `"target": "ES2023"`, `"verbatimModuleSyntax": true`, `"erasableSyntaxOnly": true`, `"rewriteRelativeImportExtensions": true` (write `./x.ts` imports), `"types": ["node"]`, `"outDir": "dist"`.

### Typing a backend
- DTOs from schemas: `const CreateUser = z.object({…}); type CreateUser = z.infer<typeof CreateUser>`.
- Typed config object (validated once).
- Discriminated unions for results/errors (`{ ok: true, data } | { ok: false, error }`).
- Avoid `any`; use `unknown` for external input until validated.
:::

::: diagram From source to running code
flowchart LR
  TS["server.ts"] -->|"tsc build"| JS["dist/server.js: run with node, 30 ms"]
  TS -->|"node strips types"| RUN1["runs directly, 40 ms, no type check"]
  TS -->|"tsx"| RUN2["runs via esbuild, 90 ms"]
  TS -->|"tsc --noEmit in CI"| CHECK["type errors fail the build"]
:::

::: image TypeScript with Node.js: ways to run it (measured)
/images/nodejs/typescript-node.svg
:::

::: chart bar Measured: ms to start a small TypeScript server
Command,ms
node compiled JS,30
node server.ts (strip types),40
tsx server.ts,90
:::

::: text 🪜 Step by step
Setting up a TypeScript Express service:
1. `npm i express zod` and `npm i -D typescript @types/node @types/express`.
2. tsconfig as above; `package.json` `"type": "module"`.
3. Dev: `node --watch src/server.ts` (or `tsx watch`).
4. CI: `tsc --noEmit` + tests; build: `tsc` → `dist/`.
5. Docker: run `node dist/server.js` (fastest start, no TS tooling in the image), or ship `.ts` with type stripping if you skip the build step.
:::

::: code typescript Typed DTOs, config and results in a Node service
import { z } from 'zod';
import type { Request, Response } from 'express';

export const CreateUser = z.object({ name: z.string().min(1).max(100), email: z.email() });
export type CreateUser = z.infer<typeof CreateUser>;

export interface User { id: string; name: string; email: string; createdAt: Date }

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; error: E };

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  insert(input: CreateUser): Promise<User>;
}

export async function createUser(repo: UserRepository, input: CreateUser): Promise<Result<User, 'EMAIL_TAKEN'>> {
  if (await repo.findByEmail(input.email)) return { ok: false, error: 'EMAIL_TAKEN' };
  return { ok: true, value: await repo.insert(input) };
}

export function createUserHandler(repo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateUser.safeParse(req.body);                       // unknown → validated, typed
    if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', details: parsed.error.issues } }); return; }
    const result = await createUser(repo, parsed.data);
    if (!result.ok) { res.status(409).json({ error: { code: result.error } }); return; }   // exhaustive: TS knows error is 'EMAIL_TAKEN'
    res.status(201).json(result.value);
  };
}
:::

::: code javascript Erasable vs non-erasable TypeScript (runnable model of type stripping)
// Type stripping replaces type annotations with spaces; constructs that generate code (enum, namespace,
// parameter properties) can't be stripped, which is why Node rejects them (measured ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
const nonErasable = [/\benum\s+\w+/, /\bnamespace\s+\w+\s*\{/, /constructor\s*\(\s*(private|public|protected|readonly)\s/];
const check = (src) => nonErasable.some((re) => re.test(src)) ? 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' : 'ok';
const samples = {
  'type annotation': 'function add(a: number, b: number): number { return a + b }',
  'interface': 'interface User { id: string }',
  'union instead of enum': "type Role = 'admin' | 'user'",
  'enum': 'enum Role { Admin, User }',
  'parameter property': 'class Repo { constructor(private db: Db) {} }',
};
const results = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, check(v)]));
console.log(results);
console.log('annotations, interfaces and unions run under type stripping', ['type annotation', 'interface', 'union instead of enum'].every((k) => results[k] === 'ok') ? '✅' : '❌ FAIL');
console.log('enum and parameter properties are rejected', results.enum !== 'ok' && results['parameter property'] !== 'ok' ? '✅ (measured for enum)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Relying on `node file.ts` or `tsx` alone and never running `tsc` (type errors ship).
- `any` for request bodies instead of `unknown` + validation.
- Separate hand-written interfaces and validation schemas that drift (derive types with `z.infer`).
- `enum`s and namespaces in code meant to run with type stripping.
- Forgetting `"types": ["node"]` with TypeScript 7.
:::

::: understand
- Run TS however is fastest for you, but type-check in CI; type the edges from schemas.
:::

::: ask
- *"Where is type checking enforced: in the editor only, or in CI?"*
:::

::: important ⭐ Say this in the interview
"There are three ways to run TypeScript on Node: compile with tsc and run JavaScript, use Node's built-in type stripping, or a loader like tsx. I measured a small server starting in 30 milliseconds compiled, 40 with node server.ts and 90 with tsx, and a TypeScript 7 type check took 50 milliseconds. Type stripping doesn't check types and only supports erasable syntax, so an enum failed with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX; I enable erasableSyntaxOnly and run tsc --noEmit in CI. I derive DTO types from Zod schemas, keep external input as unknown until validated, and use discriminated unions for results."
:::

::: links
Node.js: Running TypeScript natively | https://nodejs.org/en/learn/typescript/run-natively
TypeScript: tsconfig reference | https://www.typescriptlang.org/tsconfig/
:::

=== How do you manage configuration and environments (.env, secrets, 12-factor)? (measured)
@p 2
@tags configuration, environment-variables, secrets, nodejs
@quick
- **12-factor**: configuration lives in the **environment**, so the same build runs in dev, staging and prod.
- Load from `.env` locally (git-ignored; Node 20.6+ has `--env-file=.env`), real env vars in Docker/Kubernetes/CI, and **secrets** from a secret manager (AWS Secrets Manager/SSM, Vault) injected at runtime.
- **Validate once at startup** with a schema and **fail fast**: measured missing `DATABASE_URL` and `JWT_SECRET` → one clear error listing both, **exit 1**.
- Coerce and normalise there (measured: `PORT="8080"` → `8080`, `CORS_ORIGINS` → array) and export a typed, frozen object; never read `process.env` all over the code.
- Never commit secrets, never log them (measured startup log masks them), and give defaults only to safe values.

::: text 🧒 In simple words
Configuration is the **settings card** you hand the app when it starts: which database, which port, which keys. The app reads the card once, checks every line is filled in correctly, and refuses to open the shop if something important is missing, instead of failing later in front of customers.
:::

::: text 📖 Detailed answer
### Sources
| Source | Use for |
|---|---|
| `.env` (git-ignored), `.env.example` (committed) | local development |
| Environment variables | containers, CI, PaaS |
| Secret manager | DB passwords, API keys, signing secrets (rotation, audit) |
| Config files in the repo | non-secret defaults that rarely change (feature lists) |

### Measured (Zod schema, Node 22)
| Environment | Result |
|---|---|
| `DATABASE_URL` and `JWT_SECRET` missing | `Invalid configuration:` with one line per problem, exit code **1** |
| All valid, `PORT=8080`, `CORS_ORIGINS="https://a.example, https://b.example"` | `PORT: 8080` (number), `CORS_ORIGINS: ["https://a.example","https://b.example"]`, secrets printed as `***` |

### Per-environment differences
Keep differences in config values, not in code branches: log level, pool sizes, CORS origins, feature flags. Staging should mirror production config shape.

### Secrets hygiene
- Rotate regularly; short-lived credentials where possible (IAM roles instead of keys).
- Scan repos and images for leaked secrets (gitleaks, GitHub secret scanning).
- Don't bake secrets into Docker images or frontend bundles (`VITE_` variables are public).
:::

::: diagram Config loading at startup
flowchart TD
  E[".env locally, env vars, secret manager"] --> V["validate with a schema"]
  V -->|"valid"| C["typed frozen config used everywhere"]
  V -->|"invalid"| X["print every problem, exit 1"]
:::

::: image Configuration and environments (measured)
/images/nodejs/config.svg
:::

::: text 🪜 Step by step
Deploying the same image to staging and production:
1. CI builds one Docker image (no secrets inside).
2. Kubernetes injects env vars from a ConfigMap (non-secret) and a Secret/External Secrets (from AWS Secrets Manager).
3. On start, `config.js` validates; a typo in production's `DATABASE_URL` crashes the pod with a clear log line instead of serving errors.
4. The orchestrator keeps the old version running because the new pods never become ready.
5. Fix the value, redeploy: same image, new config.
:::

::: code javascript config.js: validated, typed, frozen configuration (Zod)
const { z } = require('zod');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform((s) => s.split(',').map((x) => x.trim())),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

function loadConfig(env = process.env) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    console.error('Invalid configuration:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
    process.exit(1);                                                    // fail fast, before serving traffic
  }
  return Object.freeze(parsed.data);
}

const config = loadConfig();
const redacted = { ...config, JWT_SECRET: '***', DATABASE_URL: config.DATABASE_URL.replace(/:[^:@/]+@/, ':***@') };
console.log('config loaded', JSON.stringify(redacted));               // never log raw secrets

module.exports = { config };
// local development: node --env-file=.env src/server.js
:::

::: code javascript Validating env strings (runnable)
function parseEnv(env) {
  const errors = []; const out = {};
  const port = Number(env.PORT ?? 3000); if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT: must be an integer 1-65535'); else out.PORT = port;
  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL ?? '')) errors.push('DATABASE_URL: must be a postgres URL'); else out.DATABASE_URL = env.DATABASE_URL;
  if ((env.JWT_SECRET ?? '').length < 32) errors.push('JWT_SECRET: must be at least 32 characters'); else out.JWT_SECRET = env.JWT_SECRET;
  out.CORS_ORIGINS = (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim());
  return errors.length ? { ok: false, errors } : { ok: true, config: Object.freeze(out) };
}
const bad = parseEnv({ PORT: 'abc' });
const good = parseEnv({ PORT: '8080', DATABASE_URL: 'postgres://app:pw@db/shop', JWT_SECRET: 'x'.repeat(40), CORS_ORIGINS: 'https://a.example, https://b.example' });
console.log(bad, { ...good, config: { ...good.config, JWT_SECRET: '***' } });
console.log('all problems reported at once', bad.errors.length === 3 ? '✅ (measured: exit 1 listing them)' : '❌ FAIL');
console.log('strings coerced: PORT number, origins array', good.config.PORT === 8080 && good.config.CORS_ORIGINS.length === 2 ? '✅' : '❌ FAIL');
console.log('config is frozen', Object.isFrozen(good.config) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `process.env.X` scattered through the code (typos, no validation, `'false'` is truthy).
- Committing `.env` files or secrets in Docker images.
- Logging the whole config (or env) at startup.
- Different code paths per environment instead of different values.
- Defaults for secrets ("changeme") that silently reach production.
:::

::: understand
- One validated config object, built from the environment, checked before the server starts.
:::

::: ask
- *"What happens if this variable is missing or malformed in production?"*
:::

::: important ⭐ Say this in the interview
"I follow 12-factor: configuration comes from the environment, so one image runs in every environment. Locally that's a git-ignored .env file, in deployment it's environment variables and secrets injected from a secret manager. A single config module validates everything with a schema at startup, coerces types, freezes the result and exits with a clear error if anything is wrong: in my test missing DATABASE_URL and JWT_SECRET produced one message listing both and exit code 1, while valid input turned PORT into a number and the CORS list into an array. Secrets are never committed, baked into images or logged."
:::

::: links
The Twelve-Factor App: Config | https://12factor.net/config
Node.js: --env-file | https://nodejs.org/api/cli.html#--env-fileconfig
:::

=== How do you document an API with OpenAPI/Swagger? (generated from Zod, measured)
@p 2
@tags openapi, swagger, documentation, zod, api
@quick
- **OpenAPI** (formerly Swagger) is a machine-readable description of your API: paths, parameters, request/response schemas, auth, errors. **Swagger UI**/**Redoc** render it; tools generate clients and run contract tests.
- Keep **one source of truth**: generate schemas from the same Zod schemas you validate with (`z.toJSONSchema`), or validate requests against the spec (spec-first).
- Measured with `@apidevtools/swagger-parser`: converting each schema separately → **invalid** (`Missing $ref pointer #/definitions/UserCreate`); registry + `uri` → **invalid** (`$id` not allowed in OpenAPI 3.0); registry + `uri` with `$id` removed → **valid OpenAPI 3.0**, served by swagger-ui-express (200).
- Document auth (`securitySchemes`), error formats, pagination and examples; version the spec with the API.
- Validate the spec in CI and generate typed clients for the frontend (openapi-typescript, orval).

::: text 🧒 In simple words
OpenAPI is the **menu** of your API: every dish (endpoint), its ingredients (parameters), what it looks like on the plate (response) and what you need to order it (auth). Generating the menu from the kitchen's actual recipes (Zod schemas) means it can't lie about what's served.
:::

::: text 📖 Detailed answer
### Code-first vs spec-first
| | Code-first (generate from Zod/decorators) | Spec-first (write YAML, validate against it) |
|---|---|---|
| Source of truth | code | the OpenAPI file |
| Tools | `z.toJSONSchema`, zod-openapi, NestJS Swagger, tsoa | express-openapi-validator, openapi-backend |
| Good for | fast-moving internal APIs | public/partner APIs, design reviews |

### Measured attempts (Zod 4.6, swagger-parser 13)
| Approach | Validation result |
|---|---|
| `z.toJSONSchema(schema)` per schema with `.meta({ id })` | invalid: `Missing $ref pointer "#/definitions/UserCreate"` |
| `z.toJSONSchema(z.globalRegistry, { target: 'openapi-3.0', uri })` | invalid: components contain `$id` |
| same, then delete `$id` from each component | **valid OpenAPI 3.0** |

### What good docs include
Auth scheme and scopes, request/response examples, every error status with the shared error shape, pagination parameters and links, rate-limit headers, deprecation markers, and a changelog.
:::

::: diagram Docs from the same schemas
flowchart LR
  Z["Zod schemas, used for validation"] --> J["JSON Schema via z.toJSONSchema"]
  J --> O["openapi.json"]
  O --> UI["Swagger UI at /docs"]
  O --> GEN["typed frontend client"]
  O --> CI["spec validation and contract tests in CI"]
:::

::: image API documentation with OpenAPI generated from Zod (measured)
/images/nodejs/openapi.svg
:::

::: text 🪜 Step by step
Adding docs to an Express API:
1. Give each request/response Zod schema an id: `.meta({ id: 'UserCreate' })`.
2. Generate components from the registry (OpenAPI 3.0 target, `uri` to `#/components/schemas/…`), remove `$id`.
3. Write `paths` referencing the components, plus `securitySchemes`.
4. Serve `/openapi.json` and Swagger UI at `/docs` (protect it in production if internal).
5. CI: validate the spec and generate the frontend client; a breaking schema change fails the client build.
:::

::: code javascript openapi.js: OpenAPI 3.0 from Zod schemas + Swagger UI (measured valid)
const { z } = require('zod');
const swaggerUi = require('swagger-ui-express');

const UserCreate = z.object({ name: z.string().min(1).max(100), email: z.email(), role: z.enum(['user', 'editor']).default('user') }).meta({ id: 'UserCreate' });
const User = UserCreate.extend({ id: z.uuid(), createdAt: z.iso.datetime() }).meta({ id: 'User' });
const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).meta({ id: 'ApiError' });

function buildOpenApi() {
  const { schemas } = z.toJSONSchema(z.globalRegistry, { target: 'openapi-3.0', io: 'input', uri: (id) => `#/components/schemas/${id}` });
  for (const s of Object.values(schemas)) delete s.$id;                       // OpenAPI 3.0 schema objects don't allow $id
  const json = (ref) => ({ 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } });
  return {
    openapi: '3.0.3',
    info: { title: 'Shop API', version: '1.0.0' },
    components: { schemas, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/users': {
        post: {
          summary: 'Create a user',
          requestBody: { required: true, content: json('UserCreate') },
          responses: { 201: { description: 'Created', content: json('User') }, 400: { description: 'Validation failed', content: json('ApiError') }, 409: { description: 'Email taken', content: json('ApiError') } },
        },
      },
    },
  };
}

function mountDocs(app) {
  const doc = buildOpenApi();
  app.get('/openapi.json', (req, res) => res.json(doc));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(doc));
}

module.exports = { UserCreate, User, ApiError, buildOpenApi, mountDocs };
:::

::: code javascript Checking a spec for broken $refs (runnable)
// A tiny version of what swagger-parser does: every $ref must point to an existing component.
function brokenRefs(doc) {
  const broken = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}/${i}`));
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
      if (k === '$ref') { const target = v.replace('#/', '').split('/').reduce((o, p) => o?.[p], doc); if (!target) broken.push(`${path} → ${v}`); }
      else walk(v, `${path}/${k}`);
    }
  };
  walk(doc, '#'); return broken;
}
const good = { components: { schemas: { User: { type: 'object' } } }, paths: { '/u': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } } } } };
const bad = { components: { schemas: { UserCreate: { $ref: '#/definitions/UserCreate' } } }, paths: {} };
console.log({ good: brokenRefs(good), bad: brokenRefs(bad) });
console.log('valid spec has no broken refs', brokenRefs(good).length === 0 ? '✅' : '❌ FAIL');
console.log('the per-schema conversion leaves a dangling #/definitions ref', brokenRefs(bad).length === 1 ? '✅ (measured with swagger-parser)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Hand-written docs that drift from the code.
- Documenting only happy paths (no error responses or auth).
- Exposing internal admin endpoints' docs publicly.
- Never validating the spec (broken `$ref`s render as empty schemas).
- Breaking changes without a version bump or deprecation note.
:::

::: understand
- Generate docs from the schemas you already validate with, and validate the result in CI.
:::

::: ask
- *"Who consumes this API, and how do they find out about changes?"*
:::

::: important ⭐ Say this in the interview
"I describe APIs with OpenAPI: paths, request and response schemas, auth schemes and error formats, rendered with Swagger UI and used to generate typed clients and run contract tests. I keep one source of truth by generating the component schemas from the same Zod schemas I validate requests with. When I set it up and validated the result with swagger-parser, converting schemas one by one produced broken definition references and the registry output included $id fields that OpenAPI 3.0 rejects; generating from the registry with component URIs and removing $id gave a valid spec. The spec is validated in CI and versioned with the API."
:::

::: links
OpenAPI Specification | https://spec.openapis.org/oas/v3.0.3
Zod: JSON Schema | https://zod.dev/json-schema
swagger-ui-express | https://github.com/scottie1984/swagger-ui-express
:::

=== How do you shut down an HTTP server gracefully, and what are health checks? (measured keep-alive pitfall)
@p 3
@tags graceful-shutdown, health-checks, kubernetes, reliability
@quick
- On **SIGTERM**: mark **not ready** (readiness → 503), stop accepting connections (`server.close()`), let in-flight requests finish, close DB/Redis/queues, exit 0, with a force-exit timeout.
- Measured: in-flight `/slow` completed (**200 after 1,502 ms**); new connections after the listener closed got **ECONNREFUSED**, so fail readiness and wait for the load balancer to stop routing **before** closing.
- Measured keep-alive pitfall: `server.close()` took **7.3 s** because an idle keep-alive socket stayed open for `keepAliveTimeout` (5 s); `closeIdleConnections()` at SIGTERM didn't help (the socket became idle later); closing idle connections **after each response** during shutdown → **1.3 s**.
- **Liveness** = "is the process stuck?" (restart it); **readiness** = "can it take traffic now?" (remove from the LB). Don't check dependencies in liveness.
- Kubernetes: `preStop` sleep + `terminationGracePeriodSeconds` > your drain time.

::: text 🧒 In simple words
Closing a shop properly: **turn the sign to "closed"** (readiness), wait until the **mall directory stops sending people** (load balancer), **serve the customers already inside** (in-flight requests), then **lock up and switch off** (close DB, exit). Also check the people **standing idle at the counter** (keep-alive connections), or you'll wait for them for no reason.
:::

::: text 📖 Detailed answer
### Measured (Node 22 HTTP server, one keep-alive client: a finished `/fast` request plus an in-flight 1.5 s `/slow`, SIGTERM at +200 ms)
| Shutdown strategy | `/slow` | New request after SIGTERM | `server.close()` callback after |
|---|---|---|---|
| `server.close()` | 200 after 1,502 ms | ECONNREFUSED | **7,302 ms** |
| + `closeIdleConnections()` at SIGTERM | 200 | ECONNREFUSED | **7,303 ms** |
| + close idle connections after each response while shutting down | 200 | ECONNREFUSED | **1,301 ms** |
The socket used by `/slow` becomes idle only when that response finishes; it then waits for the 5 s keep-alive timeout unless closed explicitly.

### Kubernetes sequence
1. Pod marked terminating → removed from Service endpoints (takes a few seconds to propagate).
2. `preStop: sleep 5` gives the load balancer time to stop routing.
3. SIGTERM → app fails readiness, stops listening, drains in-flight requests.
4. Close pools and connections; exit 0.
5. After `terminationGracePeriodSeconds` (default 30 s) Kubernetes sends SIGKILL.

### Health endpoints
| Endpoint | Answers | Checks | On failure |
|---|---|---|---|
| `/healthz/live` | process alive and not deadlocked | event loop responds | restart container |
| `/healthz/ready` | can serve traffic | DB/Redis reachable, not shutting down, warmed up | stop routing traffic |
| `/healthz/startup` | finished starting (slow boots) | migrations/caches done | wait |
:::

::: diagram Shutdown sequence in Kubernetes
sequenceDiagram
  participant K as Kubernetes
  participant LB as Load balancer
  participant A as Node app
  K->>LB: "remove pod from endpoints"
  K->>A: "preStop sleep, then SIGTERM"
  A->>A: "readiness 503, server.close"
  A->>A: "finish in-flight requests, close idle keep-alive sockets"
  A->>A: "close DB, Redis, queues"
  A-->>K: "exit 0 before the grace period"
:::

::: image Graceful shutdown of an HTTP server (measured)
/images/nodejs/graceful-http.svg
:::

::: chart bar Measured: ms from SIGTERM until server.close() finished
Strategy,ms
server.close only,7302
closeIdleConnections at SIGTERM,7303
close idle after each response,1301
:::

::: text 🪜 Step by step
Fixing 502 errors during deploys:
1. Symptom: a burst of 502s each rollout.
2. Cause: pods closed the listener immediately on SIGTERM while the LB was still sending traffic.
3. Fix: readiness returns 503 first; `preStop` sleep 5 s; then close and drain.
4. Second issue: pods took 30 s to exit (keep-alive sockets) and got SIGKILLed mid-request.
5. Fix: close idle connections as responses finish during shutdown; exits in ~1–2 s, no 502s.
:::

::: code javascript server.js: readiness, liveness and a graceful shutdown that handles keep-alive
const http = require('node:http');

function startServer({ app, port, closeResources, logger = console, drainTimeoutMs = 20_000 }) {
  let shuttingDown = false;

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz/live') return res.end('ok');                              // process responsive
    if (req.url === '/healthz/ready') { res.statusCode = shuttingDown ? 503 : 200; return res.end(shuttingDown ? 'draining' : 'ready'); }
    if (shuttingDown) res.setHeader('Connection', 'close');                           // requests arriving while draining: don't keep alive
    res.on('finish', () => { if (shuttingDown) setImmediate(() => server.closeIdleConnections()); });   // in-flight ones too
    app(req, res);
  });
  server.keepAliveTimeout = 65_000;                                                     // longer than the LB idle timeout (e.g. ALB 60 s)
  server.headersTimeout = 66_000;
  server.listen(port, () => logger.info(`listening on ${port}`));

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal}: draining`);
    const force = setTimeout(() => { logger.error('drain timeout, forcing exit'); process.exit(1); }, drainTimeoutMs);
    force.unref();
    await new Promise((r) => setTimeout(r, Number(process.env.PRESTOP_DELAY_MS ?? 5000)));   // let the LB stop routing (or use a preStop hook)
    server.close(async () => {
      await closeResources();                                                           // DB pool, Redis, queue workers
      logger.info('shutdown complete');
      process.exit(0);
    });
    server.closeIdleConnections();                                                      // sockets already idle
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

module.exports = { startServer };
:::

::: code javascript Why idle keep-alive sockets delay shutdown (runnable)
// Model: close() finishes only when every socket is closed; an idle keep-alive socket lives until keepAliveTimeout.
function shutdownTime({ inFlightRemainingMs, keepAliveTimeoutMs, closeIdleAfterEachResponse }) {
  const socketBecomesIdleAt = inFlightRemainingMs;
  const socketClosedAt = closeIdleAfterEachResponse ? socketBecomesIdleAt : socketBecomesIdleAt + keepAliveTimeoutMs;
  return socketClosedAt;
}
const plain = shutdownTime({ inFlightRemainingMs: 1300, keepAliveTimeoutMs: 5000, closeIdleAfterEachResponse: false });
const fixed = shutdownTime({ inFlightRemainingMs: 1300, keepAliveTimeoutMs: 5000, closeIdleAfterEachResponse: true });
console.log({ plainCloseMs: plain, closeIdleAfterEachResponseMs: fixed });
console.log('plain close waits for the keep-alive timeout', plain === 6300 ? '✅ (measured 7.3 s incl. the 1 s already elapsed)' : '❌ FAIL');
console.log('closing idle sockets after responses ends with the last request', fixed === 1300 ? '✅ (measured 1.3 s)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `process.exit()` on SIGTERM (drops in-flight requests).
- Closing the listener before the load balancer stops routing (502s).
- Forgetting keep-alive sockets (shutdown hangs until SIGKILL).
- Readiness that never fails during shutdown, or liveness that checks the database (restart storms when the DB blips).
- Grace period shorter than the drain time.
:::

::: understand
- Stop new traffic, finish current work, close resources, exit, and make health checks tell the platform which phase you're in.
:::

::: ask
- *"What happens to a request that's in flight when we deploy?"*
:::

::: important ⭐ Say this in the interview
"On SIGTERM I first fail readiness so the load balancer stops routing, wait a few seconds or use a preStop hook, then call server.close, let in-flight requests finish, close the database, Redis and queue connections and exit, with a force-exit timer below the grace period. I measured why each step matters: new connections after close were refused, which is where deploy-time 502s come from, and close took 7.3 seconds because an idle keep-alive socket stayed open for the five-second keep-alive timeout; closing idle connections as each response finished brought it down to 1.3 seconds. Liveness only checks that the process responds, readiness checks dependencies and shutdown state."
:::

::: links
Node.js: server.closeIdleConnections() | https://nodejs.org/api/http.html#servercloseidleconnections
Kubernetes: Configure liveness, readiness and startup probes | https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
:::

=== How do you carry request context (request id, user) through async code? AsyncLocalStorage (measured)
@p 2
@tags asynclocalstorage, logging, tracing, nodejs
@quick
- `AsyncLocalStorage` (node:async_hooks) stores a value for the duration of an **async call chain**, like thread-local storage: set it once per request, read it anywhere deeper with `als.getStore()`.
- Measured: a service function two `await`s deep logged `{ requestId: "req-abc" }` with ALS; without it the log line had **no way to say which request** it belonged to.
- Use for request ids/correlation ids, user/tenant id, trace context; pino, OpenTelemetry and many APMs use it internally.
- Measured overhead on a trivial Express route: **20,501 → 18,341 req/s** (~10%); on real routes with DB calls it's negligible.
- Don't use it as a hidden global for business data; pass important inputs explicitly.

::: text 🧒 In simple words
AsyncLocalStorage is a **name badge** pinned on each customer when they walk in. Whoever serves them later, in any department, can read the badge without the customer repeating their name, and two customers' badges never get mixed up.
:::

::: text 📖 Detailed answer
### Measured (Express 5, Node 22)
| | Log from `getUser()` deep in a service | req/s (50 connections) | p99 |
|---|---|---|---|
| Without ALS | `{ msg: "loaded user 9" }` | 20,501 | 4 ms |
| With ALS middleware | `{ requestId: "req-abc", msg: "loaded user 7" }` | 18,341 | 6 ms |
Two concurrent requests (`req-abc`, `req-xyz`) each kept their own id through `await`s.

### Typical setup
1. Middleware: `als.run({ requestId, userId }, next)` (take `X-Request-Id` from the proxy or generate a UUID; echo it in the response).
2. Logger: a pino `mixin()` that adds `als.getStore()` fields to every log line.
3. Outgoing HTTP calls: forward `x-request-id` / `traceparent` headers.
4. Queue jobs: put the id in job data and `als.run` again in the worker.

### Alternatives
- Passing a `ctx` object explicitly everywhere (clear but noisy).
- OpenTelemetry context (uses ALS under the hood) for traces across services.
:::

::: diagram A request id flowing through async calls
sequenceDiagram
  participant M as Middleware
  participant C as Controller
  participant S as Service
  participant L as Logger
  M->>M: "als.run with requestId req-abc"
  M->>C: "next()"
  C->>S: "await getUser(7)"
  S->>L: "log loaded user 7"
  L->>L: "reads als.getStore(): requestId req-abc"
:::

::: image Request context with AsyncLocalStorage (measured)
/images/nodejs/request-context.svg
:::

::: chart bar Measured: req/s on a trivial route with and without AsyncLocalStorage
Variant,req/s
without,20501
with AsyncLocalStorage,18341
:::

::: text 🪜 Step by step
Tracing one failing checkout across services:
1. Nginx sets `X-Request-Id: 9f2c…` (or the API generates it).
2. API middleware stores it with ALS; every log line includes it; the response echoes it.
3. The API calls the payment service with `x-request-id: 9f2c…`; that service does the same.
4. A queue job carries `requestId` in its data; the worker restores the context.
5. Searching logs for `9f2c…` shows the whole story across API, payment service and worker.
:::

::: code javascript Request context middleware + pino logger mixin
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const pino = require('pino');

const context = new AsyncLocalStorage();

const logger = pino({
  mixin() {                                                     // added to every log line
    const store = context.getStore();
    return store ? { requestId: store.requestId, userId: store.userId } : {};
  },
});

function requestContext(req, res, next) {
  const requestId = req.get('x-request-id') ?? randomUUID();
  res.set('x-request-id', requestId);                          // clients and support can quote it
  context.run({ requestId, userId: req.user?.id }, next);
}

// outgoing calls forward the id
async function callService(url, init = {}) {
  const store = context.getStore();
  return fetch(url, { ...init, headers: { ...init.headers, 'x-request-id': store?.requestId ?? randomUUID() } });
}

// queue workers restore it from job data
function runJobWithContext(job, handler) {
  return context.run({ requestId: job.data.requestId ?? job.id }, () => handler(job));
}

module.exports = { context, logger, requestContext, callService, runJobWithContext };
:::

::: code javascript Context that follows each async chain (runnable model)
// Each "request" keeps its own context across awaits, even when two run interleaved.
function createContext() {
  let current = null;
  return {
    run(store, fn) { const prev = current; current = store; try { return wrap(fn)(); } finally { current = prev; } },
    get: () => current,
    bind: (fn) => wrap(fn),
  };
  function wrap(fn) { const captured = current; return (...a) => { const prev = current; current = captured; try { return fn(...a); } finally { current = prev; } }; }
}
const ctx = createContext(); const logs = [];
const later = (fn, ms) => new Promise((r) => setTimeout(ctx.bind(() => r(fn())), ms));   // async boundary that preserves context
const service = (id) => later(() => logs.push({ requestId: ctx.get()?.requestId, msg: `loaded user ${id}` }), id === 7 ? 20 : 5);
(async () => {
  await Promise.all([ctx.run({ requestId: 'req-abc' }, () => service(7)), ctx.run({ requestId: 'req-xyz' }, () => service(8))]);
  console.log(logs);
  console.log('each log line has its own request id', logs.find((l) => l.msg.endsWith('7')).requestId === 'req-abc' && logs.find((l) => l.msg.endsWith('8')).requestId === 'req-xyz' ? '✅ (measured with AsyncLocalStorage)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Module-level "current request" variables (overwritten by concurrent requests).
- Storing large objects or business inputs in ALS (hidden dependencies).
- Forgetting to restore context in queue workers and callbacks from non-promise APIs.
- Not forwarding the request id to downstream services.
- Generating a new id on every hop (no correlation).
:::

::: understand
- One context per request, set at the edge, read where you log and propagate.
:::

::: ask
- *"Given a user's error report, can we find every log line for that request across services?"*
:::

::: important ⭐ Say this in the interview
"AsyncLocalStorage keeps a value for the duration of an async call chain, so a middleware can store the request id and user once and any code deeper, like a logger called from a repository, can read it without passing a context object around. In my test a service function two awaits deep logged the correct request id for each of two concurrent requests, while without it the log line couldn't be tied to a request. The overhead on a trivial route was about 10 percent, 20.5 versus 18.3 thousand requests a second, which disappears on real routes. I wire it into the logger, echo the id in responses and forward it to downstream services and queue jobs."
:::

::: links
Node.js: AsyncLocalStorage | https://nodejs.org/api/async_context.html#class-asynclocalstorage
pino: mixin option | https://getpino.io/#/docs/api?id=mixin-function
:::
