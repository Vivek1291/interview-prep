@section Microservices Architecture
@icon 🧩
@color #14b8a6
@desc Microservices from an interview angle: monolith vs modular monolith vs microservices and when to split, how services communicate (REST, gRPC, events, API gateway, BFF, service discovery; measured gateway hop), data ownership with database-per-service, outbox and CQRS, and how to test, version, deploy and observe many services.

=== Monolith, modular monolith or microservices: how do you choose?
@p 3
@tags microservices, monolith, modular-monolith, architecture, trade-offs
@quick
- **Monolith**: one deployable and one database. Fastest to build, easy transactions and refactors; coupling grows and teams start blocking each other.
- **Modular monolith**: one deployable with **strict module boundaries** (own folders, public interfaces, no reaching into other modules' tables). Often the best default; you can split later along the modules.
- **Microservices**: independently deployable services, each owning its data. You gain team autonomy, independent scaling and fault isolation, and pay with network failures, eventual consistency, distributed debugging and platform work.
- Split when **organisational** pain (teams blocking each other) or very different **scaling/tech** needs justify the operational cost, and you already have CI/CD, observability and on-call.
- Avoid the **distributed monolith**: services sharing a database, lock-step deploys, long synchronous call chains.

::: text 🧒 In simple words
A **monolith** is one big house where the whole family shares every room: simple, but busy. A **modular monolith** is the same house with **separate rooms and doors**. **Microservices** are **separate houses** on a street: everyone has privacy and their own schedule, but now you need roads, phones and a postman to coordinate.
:::

::: text 📖 Detailed answer
| | Monolith | Modular monolith | Microservices |
|---|---|---|---|
| Deploy | one unit | one unit | many units, independent |
| Data | one DB, joins everywhere | one DB, schema per module | DB per service |
| Transactions | ACID | ACID | sagas, eventual consistency |
| Team scaling | hard beyond ~2–3 teams | better (module owners) | best (service owners) |
| Failure isolation | one bug can take all down | same | per service (if designed for it) |
| Operational cost | low | low | high: CI/CD per service, tracing, service discovery, on-call |
| Refactoring boundaries | easy | easy | expensive (APIs, data migration) |

### Good reasons to split a service out
- A team needs to deploy independently and often.
- A part has very different load (image processing, search) or tech needs (Python ML).
- A bounded context is stable and its interface is clear.
- Compliance isolation (payments, PII).

### Bad reasons
- "Netflix does it."
- Splitting by technical layer (an "auth-db-service").
- Splitting before you understand the domain (boundaries will be wrong).

### Migration path: strangler fig
Put a gateway/router in front of the monolith, move one capability at a time to a new service, route its traffic there, delete it from the monolith.
:::

::: diagram Strangler fig migration
flowchart LR
  C["clients"] --> GW["gateway / router"]
  GW -->|"/api/orders (moved)"| ORD["orders service + its DB"]
  GW -->|"everything else"| MONO["monolith"]
  MONO -.->|"events"| ORD
:::

::: image Monolith, modular monolith or microservices
/images/system-design/monolith-vs-microservices.svg
:::

::: text 🪜 Step by step
1. Start with a modular monolith: modules per business domain with clear interfaces.
2. Enforce boundaries (lint rules, no cross-module table access, module-level tests).
3. Measure the pain: deploy conflicts, scaling hotspots, team ownership.
4. Build the platform first: CI/CD templates, tracing, logging, service discovery.
5. Extract one well-understood module with the strangler fig pattern.
6. Give the new service its own data, API/events and on-call owner.
:::

::: code javascript Detect boundary violations in a modular monolith (runnable)
// Each module may only import other modules through their public index. This flags deep imports and table access across modules.
const files = {
  'modules/orders/orders.service.js': ["import { reserve } from '../inventory/index.js'", "db.query('SELECT * FROM orders')"],
  'modules/orders/orders.report.js': ["import { stockTable } from '../inventory/inventory.repository.js'", "db.query('SELECT * FROM inventory_items')"],
  'modules/inventory/inventory.service.js': ["db.query('UPDATE inventory_items SET qty = qty - 1')"],
};
const tablesOf = { orders: ['orders'], inventory: ['inventory_items'] };
function violations(files) {
  const out = [];
  for (const [path, lines] of Object.entries(files)) {
    const mod = path.split('/')[1];
    for (const line of lines) {
      const imp = line.match(/from '\.\.\/(\w+)\/([\w.]+)'/);
      if (imp && imp[2] !== 'index.js') out.push(`${path}: deep import into ${imp[1]} (${imp[2]})`);
      for (const [owner, tables] of Object.entries(tablesOf)) if (owner !== mod && tables.some((t) => line.includes(t))) out.push(`${path}: reads ${owner}'s table directly`);
    }
  }
  return out;
}
const v = violations(files);
v.forEach((x) => console.log('🚧', x));
console.log(v.length === 2 && v.every((x) => x.includes('orders.report.js')) ? '✅ the report bypasses the inventory module twice; the service uses its public API' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Starting a new product with 15 microservices and one team.
- Services that share one database ("distributed monolith").
- Synchronous chains of 5+ services for one user request.
- Splitting before the platform (CI/CD, tracing, alerting) exists.
- Ignoring Conway's law: service boundaries that don't match team boundaries.
:::

::: understand
- Microservices solve organisational and scaling problems at an operational cost; a modular monolith gets most benefits until that cost is worth paying.
:::

::: ask
- *"How many teams will work on this, and how often do they need to deploy independently?"*
:::

::: important ⭐ Say this in the interview
"I'd usually start with a modular monolith: one deployable with strict module boundaries per business domain, which keeps transactions and refactoring simple. Microservices pay off when several teams block each other on deploys or parts need very different scaling or technology, and only once we have CI/CD, tracing and on-call in place, because we're trading in-process calls for network failures and eventual consistency. When we split, we follow domain boundaries, give each service its own data, and migrate gradually with the strangler fig pattern, avoiding a distributed monolith with a shared database or lock-step deploys."
:::

::: links
Martin Fowler: Monolith first | https://martinfowler.com/bliki/MonolithFirst.html
microservices.io: Microservice architecture pattern | https://microservices.io/patterns/microservices.html
:::

=== How do microservices communicate? (REST vs gRPC vs events, API gateway, BFF, service discovery)
@p 3
@tags microservices, grpc, rest, events, api-gateway, service-discovery
@quick
- **Synchronous** (REST/JSON, gRPC/protobuf): the caller waits. Simple and immediate, but creates **temporal coupling** (callee down = caller fails) and latency adds up along chains.
- **Asynchronous** (events/messages via Kafka, SNS/SQS, RabbitMQ): publish `OrderPlaced`, others react. Decoupled and absorbs spikes; needs idempotent consumers, DLQs and accepting eventual consistency.
- **gRPC** suits internal service-to-service calls (typed contracts, HTTP/2, streaming); **REST** suits public and browser APIs.
- **API gateway** = one entry point (routing, auth checks, rate limits, request ids); **BFF** = a gateway per client type shaping responses. Measured hop through a small Node gateway: **0.12 ms → 0.19 ms** median.
- **Service discovery** (Kubernetes Services/DNS, Consul, cloud load balancers) lets callers find healthy instances without hard-coded IPs.

::: text 🧒 In simple words
A **phone call** (sync) gets an immediate answer, but only if the other person picks up. A **letter or group message** (async) can be read later by everyone who cares, and nobody waits by the phone. The **receptionist** (API gateway) takes all outside calls and puts them through to the right department.
:::

::: text 📖 Detailed answer
### Sync vs async
| | Synchronous | Asynchronous |
|---|---|---|
| Examples | REST, gRPC, GraphQL | Kafka, SNS+SQS, RabbitMQ, EventBridge |
| Caller | waits for the result | continues after publishing |
| Availability | product of all services in the chain | producer works even if consumers are down |
| Consistency | immediate | eventual |
| Good for | queries, commands needing an answer now | notifications, projections, workflows, integrations |
| Needs | timeouts, retries, circuit breakers | idempotency, ordering keys, DLQs, schema evolution |

### REST vs gRPC
| | REST + JSON | gRPC + protobuf |
|---|---|---|
| Contract | OpenAPI (optional) | `.proto` (required, typed) |
| Transport | HTTP/1.1 or 2 | HTTP/2, streaming |
| Payload | text, larger | binary, smaller, faster to parse |
| Browsers | native | needs gRPC-Web/proxy |
| Use | public APIs, browsers | internal high-volume calls |

### Measured: cost of a gateway hop (Node 22, localhost)
| Path | Median single request | Throughput (20 connections) |
|---|---|---|
| direct to the service | 0.12 ms | 108,864 req/s |
| through a Node gateway (route table, request id, keep-alive pool) | 0.19 ms | 32,111 req/s |
| through Nginx in Docker Desktop | 0.48 ms | 16,119 req/s (crosses the Docker VM network, not comparable) |

The hop costs well under a millisecond; what hurts is **chains**: 5 sequential calls at 20 ms each is 100 ms before any work. Prefer fewer, coarser calls, parallel fan-out, or async events.

### Gateway, BFF, discovery
- Gateway: TLS, auth token checks, quotas, routing, request ids, aggregation.
- BFF: web and mobile get tailored endpoints, reducing chatty calls from clients.
- Discovery: in Kubernetes call `http://orders.default.svc`; health checks keep only ready pods behind it.
:::

::: diagram Sync for queries, async for side effects
sequenceDiagram
  participant W as "web (BFF)"
  participant O as "orders"
  participant P as "pricing"
  participant B as "event bus"
  participant E as "email"
  W->>O: POST /orders
  O->>P: gRPC GetPrice (sync, timeout 300 ms)
  P-->>O: price
  O->>B: publish OrderPlaced (via outbox)
  O-->>W: 201 Created
  B-->>E: OrderPlaced → send confirmation (async)
:::

::: image How services talk: sync, async, gateways (measured hop)
/images/system-design/service-communication.svg
:::

::: text 🪜 Step by step
1. Default to async events for side effects (emails, projections, analytics, other domains reacting).
2. Use sync calls only when the caller needs the answer now; add timeouts, retries and breakers.
3. Choose REST for public/browser APIs, gRPC for heavy internal traffic.
4. Put a gateway (or BFFs) in front of clients; keep it free of business logic.
5. Use platform service discovery; never hard-code instance addresses.
6. Trace every call and event with one trace id.
:::

::: code text orders.proto: a gRPC contract
syntax = "proto3";
package shop.pricing.v1;

service Pricing {
  rpc GetPrice (GetPriceRequest) returns (GetPriceResponse);
  rpc StreamPriceChanges (StreamRequest) returns (stream PriceChanged);
}

message GetPriceRequest { string product_id = 1; string currency = 2; }
message GetPriceResponse { string product_id = 1; int64 amount_minor = 2; string currency = 3; }
message StreamRequest { repeated string product_ids = 1; }
message PriceChanged { string product_id = 1; int64 amount_minor = 2; int64 changed_at_ms = 3; }
:::

::: code javascript Latency and availability of a sync chain vs parallel calls vs events (runnable)
const chain = [{ name: 'auth', ms: 15, av: 0.999 }, { name: 'orders', ms: 25, av: 0.999 }, { name: 'pricing', ms: 20, av: 0.999 }, { name: 'inventory', ms: 30, av: 0.999 }, { name: 'shipping', ms: 40, av: 0.999 }];
const sequential = { ms: chain.reduce((s, c) => s + c.ms, 0), av: chain.reduce((p, c) => p * c.av, 1) };
const parallelTail = { ms: 15 + 25 + Math.max(20, 30, 40), av: sequential.av };                     // pricing, inventory, shipping fan out in parallel
const asyncTail = { ms: 15 + 25 + 2, av: 0.999 * 0.999 * 0.9999 };                                 // publish an event instead (bus 99.99%)
const fmt = (x) => `${x.ms} ms, availability ${(x.av * 100).toFixed(2)}%`;
console.log('5 sequential sync calls     :', fmt(sequential));
console.log('last 3 calls in parallel    :', fmt(parallelTail));
console.log('last 3 as async events      :', fmt(asyncTail));
console.log(parallelTail.ms < sequential.ms && asyncTail.av > sequential.av ? '✅ parallel fan-out cuts latency; async events also cut the availability chain' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Long synchronous chains for one user request (latency and failure multiply).
- Business logic in the API gateway.
- Events used for queries that need an immediate answer ("request/response over Kafka").
- Breaking changes to event schemas without versioning.
- Hard-coded hostnames instead of service discovery.
:::

::: understand
- Use sync calls for answers you need now and events for everything that can happen afterwards; keep the gateway thin and the chains short.
:::

::: ask
- *"Does the user need this result in the response, or can it happen a second later?"*
:::

::: important ⭐ Say this in the interview
"Services talk synchronously over REST or gRPC when the caller needs an answer now, with timeouts, retries and circuit breakers, and asynchronously through events for side effects like emails, projections or other domains reacting, which decouples availability and absorbs spikes but needs idempotent consumers and DLQs. I use REST for public and browser APIs and gRPC internally for typed, efficient calls. Clients go through an API gateway or per-client BFF for routing, auth checks and rate limits; a gateway hop measured about 0.07 ms, so the real cost is long synchronous chains, which I avoid with parallel fan-out or events. Service discovery comes from Kubernetes DNS or the load balancer."
:::

::: links
gRPC: Introduction | https://grpc.io/docs/what-is-grpc/introduction/
microservices.io: API gateway / Backends for frontends | https://microservices.io/patterns/apigateway.html
:::

=== How do you manage data in microservices? (database per service, outbox, CQRS, eventual consistency)
@p 3
@tags microservices, database-per-service, outbox, cqrs, event-driven
@quick
- **Database per service**: only the owning service reads and writes its tables; others use its **API** or consume its **events**. This is what makes independent deploys and schema changes possible.
- Data other services need is **replicated** via events into their own read models (search keeps its own product copy).
- **Transactional outbox**: write the business row and an `outbox` row in **one local transaction**; a relay publishes it. No "saved but never published" or "published but rolled back".
- **CQRS**: separate the write model (normalised, transactional) from read models (denormalised views, search indexes, caches) fed by events.
- Cross-service workflows use **sagas**; queries across services use **API composition** or a **read model**, not cross-database joins.

::: text 🧒 In simple words
Each department keeps **its own filing cabinet** and nobody else opens it. If the warehouse needs to know about new orders, the orders team **sends a memo** (event); the warehouse files its own copy. The outbox is the **out-tray on the desk**: the memo is written in the same moment the order is filed, so it can't be forgotten.
:::

::: text 📖 Detailed answer
### Why not a shared database?
| Shared DB | Database per service |
|---|---|
| any service can join any table | data accessed only through the owner |
| one schema change can break five services | owner changes schema freely behind its API |
| one hot query slows everyone | load isolated |
| easy cross-entity transactions | sagas instead |

### Getting data to other services
| Need | Pattern |
|---|---|
| a single entity now | call the owner's API (with caching) |
| a list combining several services | API composition in a gateway/BFF |
| frequent queries across domains | a read model built from events (CQRS) |
| a workflow across services | saga |

### Outbox in practice
1. `BEGIN; INSERT INTO orders …; INSERT INTO outbox (topic, payload) …; COMMIT;`
2. A relay polls `outbox` (or uses CDC like Debezium) and publishes to Kafka/SNS.
3. It marks rows as sent; consumers dedupe by event id (inbox table).

### CQRS read models
- Built by consuming events; can be rebuilt by replaying them.
- Eventually consistent: show "updating…" or read your own writes from the write side.
- Typical stores: Elasticsearch/OpenSearch for search, Redis for counters, a denormalised Postgres table for dashboards.
:::

::: diagram Outbox → events → read models
flowchart LR
  API["orders API"] -->|"one transaction"| DB[("orders + outbox tables")]
  DB --> RELAY["outbox relay / CDC"]
  RELAY --> BUS["event bus"]
  BUS --> INV["inventory: reserve stock"]
  BUS --> SEARCH["search: update read model"]
  BUS --> MAIL["email: send confirmation"]
:::

::: image Data in microservices: ownership, outbox and CQRS
/images/system-design/data-ownership.svg
:::

::: text 🪜 Step by step
1. Assign every table to exactly one service; remove cross-service joins.
2. Expose what others need through an API and domain events.
3. Publish events through an outbox in the same transaction as the change.
4. Build read models in consumers that need cross-domain queries; make them idempotent and rebuildable.
5. Use sagas for multi-service workflows.
6. Version event schemas (additive changes, schema registry).
:::

::: code sql Transactional outbox (Postgres)
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_id text NOT NULL,           -- ordering key (e.g. order id)
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;

-- in the request handler: business change + event in ONE transaction
BEGIN;
INSERT INTO orders (id, user_id, status, total_cents) VALUES ($1, $2, 'PENDING', $3);
INSERT INTO outbox (topic, aggregate_id, payload) VALUES ('orders.placed', $1, jsonb_build_object('orderId', $1, 'userId', $2, 'totalCents', $3));
COMMIT;

-- relay (several instances can run safely)
WITH batch AS (
  SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
)
UPDATE outbox o SET published_at = now() FROM batch WHERE o.id = batch.id RETURNING o.topic, o.aggregate_id, o.payload;
:::

::: code javascript A CQRS read model built from events, rebuildable by replay (runnable)
// Write side emits events; the read side projects them into a denormalised view. Duplicates are ignored by event id.
function project(events) {
  const view = new Map(), seen = new Set();
  for (const e of events) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (e.type === 'ProductCreated') view.set(e.productId, { name: e.name, price: e.price, stock: 0, reviews: 0 });
    if (e.type === 'PriceChanged') view.get(e.productId).price = e.price;
    if (e.type === 'StockAdjusted') view.get(e.productId).stock += e.delta;
    if (e.type === 'ReviewAdded') view.get(e.productId).reviews += 1;
  }
  return view;
}
const log = [
  { id: 'e1', type: 'ProductCreated', productId: 'p1', name: 'Desk', price: 19900 },
  { id: 'e2', type: 'StockAdjusted', productId: 'p1', delta: 10 },
  { id: 'e3', type: 'PriceChanged', productId: 'p1', price: 17900 },
  { id: 'e3', type: 'PriceChanged', productId: 'p1', price: 17900 },     // redelivered
  { id: 'e4', type: 'ReviewAdded', productId: 'p1' },
  { id: 'e5', type: 'StockAdjusted', productId: 'p1', delta: -1 },
];
const view = project(log);
console.log('search/product page read model:', view.get('p1'));
const rebuilt = project(log);
console.log(JSON.stringify(view.get('p1')) === JSON.stringify({ name: 'Desk', price: 17900, stock: 9, reviews: 1 }) ? '✅ view combines price, stock and reviews from three domains' : '❌ FAIL');
console.log(JSON.stringify([...rebuilt]) === JSON.stringify([...view]) ? '✅ replaying the event log rebuilds the same view (and the duplicate was ignored)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Services reading each other's tables "just for this report".
- Publishing an event after `COMMIT` without an outbox (crash in between loses it).
- Read models that can't be rebuilt (no event history, non-idempotent projections).
- Distributed joins at request time across five services for a list page.
- Treating eventual consistency as a bug instead of designing the UX for it.
:::

::: understand
- Each service owns its data; others learn about changes through reliable events and keep their own read models.
:::

::: ask
- *"Which service is the source of truth for this field, and who else keeps a copy?"*
:::

::: important ⭐ Say this in the interview
"Each service owns its database and nobody else touches its tables, which is what lets teams change schemas and deploy independently. Other services get data through the owner's API or its events, and keep their own read models, for example search keeps a denormalised product copy. Events are published through a transactional outbox, written in the same local transaction as the business change and relayed to the bus, and consumers are idempotent. For cross-domain queries I use API composition or a CQRS read model that can be rebuilt by replaying events, and multi-service workflows are sagas."
:::

::: links
microservices.io: Database per service | https://microservices.io/patterns/data/database-per-service.html
microservices.io: Transactional outbox | https://microservices.io/patterns/data/transactional-outbox.html
:::

=== How do you test, version, deploy and observe microservices?
@p 2
@tags microservices, contract-testing, versioning, observability, deployment
@quick
- **Testing pyramid per service**: unit and component tests (service + real DB in a container) plus **consumer-driven contract tests** (Pact) instead of a large, flaky end-to-end suite.
- **Versioning**: only **additive** changes (new optional fields), keep old fields until consumers migrate, version event schemas (registry), never break a published contract in place.
- **Deploying**: one pipeline per service, independent releases, canary/rolling, no lock-step deploys; feature flags for cross-service features.
- **Observing**: one **trace id** through every hop and event (OpenTelemetry), RED dashboards and SLOs per service, a service map from traces.
- Cross-cutting concerns via thin shared libraries or a **service mesh** (mTLS, retries, metrics), and golden-path templates for new services.

::: text 🧒 In simple words
With many houses on a street, you can't test the whole town every time someone paints a door. Each house checks itself, and neighbours sign **agreements** ("my letterbox stays at this height") that are checked automatically (contract tests). Every house can renovate on its own schedule, and a **street camera** (tracing) shows where a delivery got stuck.
:::

::: text 📖 Detailed answer
### Testing
| Level | What | Tooling |
|---|---|---|
| unit | business logic | Vitest/Jest, node:test |
| component | one service with real DB/queue in containers | Testcontainers, docker compose |
| contract | consumer expectations verified against the provider | Pact, schema-based contract tests |
| end-to-end | a few critical journeys | Playwright against staging |

Contract flow: the consumer's tests produce a pact ("GET /orders/7 returns id, status"); the provider's CI replays it against the real provider; `can-i-deploy` blocks releases that would break a consumer.

### Versioning rules
| Change | Safe? |
|---|---|
| add an optional field | yes |
| add an endpoint/event type | yes |
| make a field required, rename, change type | no: add a new field, migrate consumers, then remove |
| remove a field | only after no consumer uses it (check traces/contracts) |
| event schema change | backward-compatible; registry enforces it |

### Deploying
- Independent pipelines; the image tag is the commit SHA.
- Canary per service with automatic rollback on SLO burn.
- Expand/contract for APIs and databases so old and new versions coexist.

### Observing
- Propagate `traceparent` through HTTP, gRPC and message headers.
- Per service: RED metrics, SLOs, owned alerts and runbooks.
- Correlate logs by trace id; build a dependency map from traces.
:::

::: diagram Consumer-driven contract testing
flowchart LR
  CT["web BFF tests (consumer)"] -->|"produce pact"| BROKER["pact broker"]
  BROKER -->|"verify in provider CI"| PV["orders service (provider)"]
  PV -->|"results"| BROKER
  BROKER -->|"can-i-deploy?"| DEP["deploy pipeline of either side"]
:::

::: image Testing, versioning, deploying and observing microservices
/images/system-design/ms-operations.svg
:::

::: text 🪜 Step by step
1. Give each service unit + component tests with real dependencies in containers.
2. Add contract tests for every consumer-provider pair; gate deploys on them.
3. Adopt additive-only API and event changes; use a schema registry for events.
4. One pipeline per service with canary releases and automatic rollback.
5. Instrument with OpenTelemetry, including message headers.
6. Provide a golden-path template (logging, metrics, health checks, Dockerfile, pipeline) for new services.
:::

::: code javascript A tiny consumer-driven contract check (runnable)
// The consumer declares which fields and types it relies on; the provider's CI checks its real response against every consumer contract.
const contracts = {
  'web-bff': { 'GET /orders/:id': { id: 'string', status: 'string', totalCents: 'number' } },
  'email-service': { 'GET /orders/:id': { id: 'string', customerEmail: 'string' } },
};
function verify(providerResponse, contracts) {
  const failures = [];
  for (const [consumer, endpoints] of Object.entries(contracts))
    for (const [endpoint, fields] of Object.entries(endpoints))
      for (const [field, type] of Object.entries(fields))
        if (typeof providerResponse[endpoint]?.[field] !== type) failures.push(`${consumer} needs ${endpoint}.${field}: ${type}`);
  return failures;
}
const v1 = { 'GET /orders/:id': { id: 'o7', status: 'paid', totalCents: 1999, customerEmail: 'a@example.com' } };
const v2Additive = { 'GET /orders/:id': { ...v1['GET /orders/:id'], currency: 'EUR' } };
const v2Breaking = { 'GET /orders/:id': { id: 'o7', status: 'paid', total: { cents: 1999 }, email: 'a@example.com' } };
console.log('additive change:', verify(v2Additive, contracts));
console.log('rename change  :', verify(v2Breaking, contracts));
console.log(verify(v2Additive, contracts).length === 0 ? '✅ adding a field breaks no consumer' : '❌ FAIL');
console.log(verify(v2Breaking, contracts).length === 2 ? '✅ renames are caught before deploy (2 consumers would break)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- A giant end-to-end suite across 20 services as the only safety net (slow and flaky).
- Breaking API or event changes deployed "at the same time" as consumers.
- No trace propagation through queues: traces end at the first event.
- Every team inventing its own logging, metrics and health-check conventions.
- Shared libraries so heavy that every service must upgrade in lock-step.
:::

::: understand
- Contracts replace most end-to-end tests, additive changes allow independent deploys, and traces tie the whole system together.
:::

::: ask
- *"How do we know, before deploying, that this change won't break another team's service?"*
:::

::: important ⭐ Say this in the interview
"Each service has unit and component tests against real dependencies in containers, and consumer-driven contract tests replace most end-to-end tests: consumers publish the fields they rely on and the provider's CI verifies them, blocking deploys that would break someone. APIs and event schemas only change additively, with a registry for events, so services deploy independently through their own pipelines with canaries. For observability every hop, including messages, carries the trace id through OpenTelemetry, each service has RED dashboards and SLOs it owns, and a golden-path template gives new services logging, metrics, health checks and pipelines from day one."
:::

::: links
Pact: Consumer-driven contract testing | https://docs.pact.io/
Martin Fowler: Consumer-Driven Contracts | https://martinfowler.com/articles/consumerDrivenContracts.html
:::
