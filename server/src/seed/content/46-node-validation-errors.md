@section Validation & Error Handling
@icon 🧯
@color #f59e0b
@desc Where validation belongs in the request pipeline, Zod vs Joi vs Yup vs Ajv (measured), unknown fields and response validation, operational vs programmer errors, custom error classes, async errors in Express 4 vs 5 (measured) and process-level handlers.

=== Where does validation belong in the request pipeline?
@p 3
@tags validation, express, architecture, security
@quick
- Typical order: **parse** (size limit) → **authenticate** (401) → **validate** input (400/422) → **authorize** (403/404) → **business rules** (409/422) → **database constraints**.
- Your roadmap lists validation before authentication: cheap *shape* checks can run first, but most teams authenticate first so anonymous callers learn nothing about your schemas and do no work.
- Validate **every** input: body, params, query, headers, cookies, files, webhooks, messages from queues, even data from other internal services.
- Validation (is it well-formed?) ≠ authorization (may *this user* do it?) ≠ business rules (is it allowed *now*?).
- The database still needs constraints (unique, foreign keys, NOT NULL): validation in the app can be bypassed by bugs and races.

::: text 🧒 In simple words
Think of an **airport**: first the ticket scan (are you a passenger? authentication), then the bag scanner (is what you carry allowed? validation), then the gate check (is this *your* flight? authorization), then the pilot's rules (is the plane ready? business logic). Each check is cheaper and earlier than the next, and none trusts the previous one completely.
:::

::: text 📖 Detailed answer
| Stage | Question | Typical failure |
|---|---|---|
| Parse | Is the body readable and small enough? | 400 bad JSON, 413 too large |
| Authenticate | Who is calling? | 401 |
| Validate | Right types, formats, ranges, no unknown fields? | 400 / 422 with field errors |
| Authorize | May this user act on this resource? | 403 (or 404 to hide existence) |
| Business rules | Allowed in the current state? | 409 conflict, 422 |
| Database | Unique, foreign keys, NOT NULL, checks | 409 on duplicate key |

### What to validate
- **Shape**: required fields, types, string lengths, array sizes, enums.
- **Format**: email, UUID/ObjectId, ISO dates, URLs (with allowed protocols).
- **Ranges**: `qty` 1–100, `page` ≥ 1, `limit` ≤ 100.
- **Unknown fields**: strip or reject (see mass assignment).
- **Normalisation**: trim, lower-case emails, coerce query strings to numbers.

### Where the code lives
A `validate(schema)` middleware per route keeps controllers clean: after it runs, `req.body` is the parsed, typed, trusted value.
:::

::: diagram Request stages and their status codes
flowchart LR
  P["parse: 400 or 413"] --> AU["authenticate: 401"]
  AU --> V["validate: 400 or 422"]
  V --> AZ["authorize: 403 or 404"]
  AZ --> B["business rules: 409 or 422"]
  B --> D["database constraints"]
:::

::: image The request pipeline: where validation and checks happen
/images/nodejs/request-pipeline.svg
:::

::: text 🪜 Step by step
`PATCH /api/orders/981` with `{ "status": "shipped" }` from a customer:
1. Body parsed (≤ 100 KB).
2. Token verified → user 42 (customer).
3. Schema: `status` must be one of `cancelled` for customers → passes shape check.
4. Authorization: order 981 belongs to user 7, not 42 → **404** (don't reveal it exists).
5. Had it been their order: business rule "only pending orders can be cancelled" → 409 if already shipped.
:::

::: code javascript A reusable validate() middleware with Zod
const express = require('express');
const { z } = require('zod');

const validate = (schemas) => (req, res, next) => {
  const errors = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (result.success) {
      if (part === 'query') Object.defineProperty(req, 'query', { value: result.data });   // Express 5: req.query is a getter
      else req[part] = result.data;
    } else errors.push(...result.error.issues.map((i) => ({ in: part, path: i.path.join('.'), message: i.message })));
  }
  if (errors.length) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', details: errors } });
  next();
};

const orderParams = z.object({ id: z.string().regex(/^\d+$/) });
const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const updateBody = z.object({ status: z.enum(['cancelled']) }).strict();

const router = express.Router();
router.get('/orders', authenticate, validate({ query: listQuery }), (req, res) => res.json({ page: req.query.page, limit: req.query.limit }));
router.patch('/orders/:id', authenticate, validate({ params: orderParams, body: updateBody }), async (req, res) => {
  const order = await findOrder(req.params.id);
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  if (order.status !== 'pending') return res.status(409).json({ error: { code: 'NOT_CANCELLABLE' } });
  res.json({ ...order, status: req.body.status });
});

function authenticate(req, res, next) { req.user = { id: 42 }; next(); }
async function findOrder(id) { return { id, userId: 42, status: 'pending' }; }
module.exports = router;
:::

::: code javascript The pipeline as plain functions (runnable)
const users = { t1: { id: 42, role: 'customer' } };
const orders = { 981: { id: 981, userId: 7, status: 'pending' }, 982: { id: 982, userId: 42, status: 'shipped' }, 983: { id: 983, userId: 42, status: 'pending' } };
function handle({ token, id, body }) {
  const user = users[token];
  if (!user) return 401;
  if (!/^\d+$/.test(String(id)) || typeof body !== 'object' || body.status !== 'cancelled' || Object.keys(body).length !== 1) return 400;
  const order = orders[id];
  if (!order || order.userId !== user.id) return 404;              // authorization hides others' orders
  if (order.status !== 'pending') return 409;                     // business rule
  return 200;
}
const cases = [[{ id: 983, body: { status: 'cancelled' } }, 401], [{ token: 't1', id: 'abc', body: { status: 'cancelled' } }, 400], [{ token: 't1', id: 983, body: { status: 'cancelled', role: 'admin' } }, 400], [{ token: 't1', id: 981, body: { status: 'cancelled' } }, 404], [{ token: 't1', id: 982, body: { status: 'cancelled' } }, 409], [{ token: 't1', id: 983, body: { status: 'cancelled' } }, 200]];
for (const [req, want] of cases) console.log(JSON.stringify(req).padEnd(70), handle(req), handle(req) === want ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Validating only `req.body` (query, params and headers are user input too).
- Validation inside services/controllers scattered everywhere (inconsistent errors).
- Using validation as authorization ("the role field must be user" doesn't stop IDOR).
- Trusting frontend validation (it's UX, not security).
- No DB constraints because "the app already validates" (races create duplicates).
:::

::: understand
- Each layer answers a different question; together they form defence in depth.
:::

::: ask
- *"What should a caller who isn't logged in be able to learn from our error messages?"*
:::

::: important ⭐ Say this in the interview
"I treat the request as a pipeline: parse with a size limit, authenticate, validate every input against a schema, authorize the user against the specific resource, apply business rules and keep database constraints as the last line of defence. Cheap structural checks can run very early, but I usually authenticate first so anonymous callers learn nothing. Validation answers whether the input is well-formed, authorization whether this user may do it, business rules whether it's allowed now, and each maps to its own status code. A validate middleware per route replaces req.body with the parsed value, so controllers only see trusted data."
:::

::: links
OWASP: Input Validation Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
Zod documentation | https://zod.dev/
:::

=== Zod vs Joi vs Yup vs Ajv: which validation library should a Node.js API use?
@p 2
@tags validation, zod, joi, ajv, yup, performance
@quick
- **Zod**: TypeScript-first, infers types from schemas (`z.infer`), great DX; measured **2.7 M** validations/s.
- **Ajv**: compiles **JSON Schema** into code; fastest (measured **13.4 M**/s); schemas are language-neutral and reused by OpenAPI and Fastify.
- **Joi**: mature, expressive (from hapi), JavaScript-first; measured **437 k**/s.
- **Yup**: popular in forms (Formik), async-friendly; slowest here (**185 k**/s).
- All four caught the same invalid object; pick by ecosystem: Zod for TS apps, Ajv/JSON Schema for OpenAPI-first or high throughput.

::: text 🧒 In simple words
They're four brands of **metal detector**. All of them find the knife. Zod also prints a matching **packing list** for TypeScript; Ajv is the **fastest conveyor belt** because it builds a custom machine from your rules in advance; Joi and Yup are reliable older models.
:::

::: text 📖 Detailed answer
### Measured (Node 22, same 5-field object, 200,000 validations of a valid object)
| Library | Valid objects per second | Errors reported for the bad object |
|---|---|---|
| Ajv 8 (compiled) | **13,395,137** | 5 |
| Zod 4 | **2,719,405** | 5 |
| Joi 18 | **436,997** | 5 |
| Yup 1 | **184,563** | 6 |
Even Yup handles ~185k requests/s per core, so validation is rarely the bottleneck; choose by ergonomics unless you're validating huge payloads or event streams.

### Comparison
| | Zod | Ajv | Joi | Yup |
|---|---|---|---|---|
| Schema language | TS/JS code | JSON Schema | JS code | JS code |
| Static types | inferred | via JSON Schema → TS tools | manual | `InferType` |
| Unknown keys default | **stripped** | allowed unless `additionalProperties: false` | **rejected** | allowed |
| Coercion | `z.coerce.*` | `coerceTypes` option | `convert` (default on) | casts by default |
| Sharing with frontend | yes (same TS) | yes (JSON) | possible | yes (forms) |
| OpenAPI | zod-to-openapi | native | joi-to-swagger | limited |

### My default
TypeScript + Express → Zod (one schema = runtime validation + types). Fastify or contract-first OpenAPI → JSON Schema with Ajv.
:::

::: diagram Choosing a validator
flowchart TD
  Q{"how is the API defined?"} -->|"TypeScript code first"| Z["Zod: schema plus inferred types"]
  Q -->|"OpenAPI or JSON Schema first"| A["Ajv: compiled JSON Schema"]
  Q -->|"existing JavaScript codebase"| J["Joi"]
  Q -->|"React forms"| Y["Yup or Zod with a form library"]
:::

::: image The request pipeline: where validation and checks happen
/images/nodejs/request-pipeline.svg
:::

::: chart bar Measured: valid objects validated per second (Node 22, millions)
Library,Millions per second
Ajv,13.40
Zod,2.72
Joi,0.44
Yup,0.18
:::

::: text 🪜 Step by step
Sharing one Zod schema between React and Node:
1. Put `createUserSchema` in a shared package (`packages/contracts`).
2. The API uses it in `validate({ body: createUserSchema })`.
3. React Hook Form uses `zodResolver(createUserSchema)` for instant field errors.
4. `type CreateUser = z.infer<typeof createUserSchema>` types the API client.
5. A schema change breaks compilation in both places, so they can't drift.
:::

::: code javascript The same rules in all four libraries (measured file)
const { z } = require('zod');
const Joi = require('joi');
const yup = require('yup');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const zodUser = z.object({ name: z.string().min(1).max(100), email: z.email(), age: z.number().int().min(0).max(150), role: z.enum(['user', 'editor']), tags: z.array(z.string()).max(10) });

const joiUser = Joi.object({ name: Joi.string().min(1).max(100).required(), email: Joi.string().email().required(), age: Joi.number().integer().min(0).max(150).required(), role: Joi.string().valid('user', 'editor').required(), tags: Joi.array().items(Joi.string()).max(10).required() });

const yupUser = yup.object({ name: yup.string().min(1).max(100).required(), email: yup.string().email().required(), age: yup.number().integer().min(0).max(150).required(), role: yup.string().oneOf(['user', 'editor']).required(), tags: yup.array(yup.string()).max(10).required() }).strict();

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const ajvUser = ajv.compile({
  type: 'object', additionalProperties: false, required: ['name', 'email', 'age', 'role', 'tags'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, email: { type: 'string', format: 'email' }, age: { type: 'integer', minimum: 0, maximum: 150 }, role: { enum: ['user', 'editor'] }, tags: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
});

const bad = { name: '', email: 'not-an-email', age: -3, role: 'admin', tags: 'x' };
console.log('zod', zodUser.safeParse(bad).error.issues.length, 'errors');
console.log('joi', joiUser.validate(bad, { abortEarly: false }).error.details.length, 'errors');
console.log('ajv', ajvUser(bad) ? 0 : ajvUser.errors.length, 'errors');
yupUser.validate(bad, { abortEarly: false }).catch((e) => console.log('yup', e.errors.length, 'errors'));
:::

::: code javascript What a compiled validator looks like (runnable)
// Ajv's speed comes from turning a schema into straight-line code once, instead of interpreting it per call.
const schema = { required: ['name', 'age'], properties: { name: { type: 'string', minLength: 1 }, age: { type: 'integer', minimum: 0 } } };
function interpret(s, d) { const errs = []; for (const k of s.required) if (!(k in d)) errs.push(`${k} required`); for (const [k, r] of Object.entries(s.properties)) { const v = d[k]; if (v === undefined) continue; if (r.type === 'string' && (typeof v !== 'string' || v.length < r.minLength)) errs.push(k); if (r.type === 'integer' && (!Number.isInteger(v) || v < r.minimum)) errs.push(k); } return errs; }
function compile(s) {
  const lines = s.required.map((k) => `if (!(${JSON.stringify(k)} in d)) e.push(${JSON.stringify(k + ' required')});`);
  for (const [k, r] of Object.entries(s.properties)) {
    const v = `d[${JSON.stringify(k)}]`;
    if (r.type === 'string') lines.push(`if (${v} !== undefined && (typeof ${v} !== 'string' || ${v}.length < ${r.minLength})) e.push(${JSON.stringify(k)});`);
    if (r.type === 'integer') lines.push(`if (${v} !== undefined && (!Number.isInteger(${v}) || ${v} < ${r.minimum})) e.push(${JSON.stringify(k)});`);
  }
  return new Function('d', `const e = []; ${lines.join(' ')} return e;`);
}
const fast = compile(schema);
const good = { name: 'Asha', age: 31 }, bad = { name: '', age: -1 };
console.log('same results', JSON.stringify(fast(bad)) === JSON.stringify(interpret(schema, bad)) && fast(good).length === 0 ? '✅' : '❌ FAIL');
const time = (f) => { const t = Date.now(); for (let i = 0; i < 300000; i++) f(good); return Date.now() - t; };
const ti = time((d) => interpret(schema, d)), tc = time(fast);
console.log(`interpreted ${ti} ms vs compiled ${tc} ms for 300k validations`, tc <= ti ? '✅ compiled is faster' : '⚠️ timing noise');
:::

::: warning ⚠️ Common mistakes
- Picking a library by benchmark when validation is 0.001% of request time.
- Two schema sources (TS types + separate validation) that drift apart.
- Not knowing your library's unknown-key default (Zod strips, Joi rejects, Ajv allows).
- Compiling Ajv schemas inside the request handler (compile once at startup).
- Returning raw library error objects to clients (map them to a stable format).
:::

::: understand
- All validators check the same rules; they differ in types, schema format, defaults and speed.
:::

::: ask
- *"Is the contract owned by TypeScript code or by an OpenAPI/JSON Schema document?"*
:::

::: important ⭐ Say this in the interview
"I benchmarked them on the same schema: compiled Ajv validated about 13 million objects a second, Zod 2.7 million, Joi 440 thousand and Yup 185 thousand, and all caught the same invalid object. So speed rarely decides; the ecosystem does. In TypeScript APIs I use Zod because one schema gives runtime validation and inferred types, and I can share it with React forms. For OpenAPI-first or very high-throughput services I use JSON Schema with Ajv, compiled once at startup. I also check each library's defaults for unknown keys and coercion."
:::

::: links
Zod | https://zod.dev/
Ajv JSON schema validator | https://ajv.js.org/
Joi | https://joi.dev/
:::

=== How do you handle unknown fields, coercion and response validation? (mass assignment)
@p 3
@tags validation, security, mass-assignment, api
@quick
- **Mass assignment**: copying `req.body` into a model lets attackers set fields like `role`, `isAdmin`, `balance`, `ownerId`.
- Fix: validate with an **allow-list schema** and use **only the parsed output**; strip (Zod default) or reject (`.strict()`, Joi default, Ajv `additionalProperties: false`) unknown keys. Measured: all four approaches removed or rejected `isAdmin`.
- Query strings are always strings: **coerce** explicitly (`z.coerce.number()`), set defaults and maximums (`limit ≤ 100`).
- **Response validation/serialization**: send DTOs built from an allow-list so `passwordHash`, internal ids and tokens never leak.
- Different schemas per operation: `createUser` ≠ `updateUser` (partial) ≠ `adminUpdateUser`.

::: text 🧒 In simple words
Mass assignment is a **form where you can write extra lines** at the bottom ("salary: 1,000,000") and the clerk copies everything into the system. An allow-list schema is a clerk who only copies the boxes printed on the form and ignores anything scribbled elsewhere.
:::

::: text 📖 Detailed answer
### The vulnerability
`await User.updateOne({ _id: req.user.id }, req.body)` with body `{ "name": "Asha", "role": "admin" }` → privilege escalation. Real incidents (GitHub 2012) came from exactly this.

### Measured behaviour with `{ ...validUser, isAdmin: true }`
| Approach | Result |
|---|---|
| Zod `z.object()` | `isAdmin` **stripped** from the output |
| Zod `.strict()` | **rejected** |
| Joi (default) | **rejected** (`"isAdmin" is not allowed`) |
| Ajv `additionalProperties: false` | **rejected** |

Strip is friendlier for evolving clients; reject surfaces client bugs early. Either works if you **use the parsed value**, not `req.body`.

### Per-operation schemas
- Create: required fields.
- Update: `.partial()` of the editable subset (never `role`, `ownerId`, `createdAt`).
- Admin update: separate schema, separate route, separate authorization.

### Responses
Build responses through a `toUserDto(user)` function or a response schema. Mongoose `select: false` / `toJSON` transforms help, but an explicit DTO is the clearest contract (and documents the API).
:::

::: diagram Data flowing through allow-lists both ways
flowchart LR
  R["req.body with extra fields"] --> S["input schema: allow-list"]
  S --> D["service and database"]
  D --> M["DB document with secrets"]
  M --> O["output DTO: allow-list"]
  O --> C["client sees only public fields"]
:::

::: image Operational vs programmer errors
/images/nodejs/error-types.svg
:::

::: text 🪜 Step by step
A safe profile update:
1. `updateProfileSchema = z.object({ name, bio, avatarUrl }).partial().strict()`.
2. Body `{ "bio": "hi", "role": "admin" }` → 400 (strict) or role dropped (strip).
3. Service updates only parsed keys: `$set: parsed`.
4. Response passes through `toUserDto` → `{ id, name, bio, avatarUrl }`.
5. A test asserts that `role` can't change and `passwordHash` never appears in any response.
:::

::: code javascript Per-operation schemas and response DTOs (Zod + Mongoose)
const { z } = require('zod');

const userCreate = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(12).max(200),
});
const userUpdate = userCreate.pick({ name: true }).extend({ bio: z.string().max(500), avatarUrl: z.url({ protocol: /^https$/ }) }).partial().strict();
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('-createdAt'),
});

const toUserDto = (u) => ({ id: String(u._id), name: u.name, email: u.email, bio: u.bio ?? '', avatarUrl: u.avatarUrl ?? null, createdAt: u.createdAt });

async function updateProfile(User, userId, body) {
  const changes = userUpdate.parse(body);                     // throws ZodError → 400 in the error middleware
  const user = await User.findByIdAndUpdate(userId, { $set: changes }, { new: true, runValidators: true }).lean();
  return toUserDto(user);
}

module.exports = { userCreate, userUpdate, listQuery, toUserDto, updateProfile };
:::

::: code javascript Strip vs reject, and DTOs (runnable)
const allowed = ['name', 'bio', 'avatarUrl'];
const strip = (body) => Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
const reject = (body) => { const extra = Object.keys(body).filter((k) => !allowed.includes(k)); if (extra.length) throw new Error(`Unknown fields: ${extra.join(', ')}`); return body; };
const attack = { bio: 'hello', role: 'admin', isAdmin: true };

const user = { _id: 42, name: 'Asha', role: 'user', passwordHash: '$scrypt$…', bio: '' };
const unsafe = { ...user, ...attack };                                   // what `Object.assign(user, req.body)` does
const safe = { ...user, ...strip(attack) };
console.log('unsafe copy escalates privileges', unsafe.role === 'admin' ? '🚨 role is now admin (this is the bug)' : 'ok');
console.log('strip keeps role', safe.role === 'user' && safe.bio === 'hello' ? '✅' : '❌ FAIL');
try { reject(attack); console.log('❌ FAIL should reject'); } catch (e) { console.log('reject:', e.message, '✅'); }
const toDto = (u) => ({ id: u._id, name: u.name, bio: u.bio });
console.log('DTO never leaks the hash', !JSON.stringify(toDto(safe)).includes('passwordHash') ? '✅' : '❌ FAIL');
// coercion: query strings are strings
const query = new URLSearchParams('page=2&limit=500');
const limit = Math.min(Number(query.get('limit')), 100);
console.log('limit coerced and capped', typeof limit === 'number' && limit === 100 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `Model.create(req.body)` or `Object.assign(user, req.body)`.
- One schema for create, update and admin update.
- Validating, then using `req.body` instead of the parsed result.
- Returning Mongoose documents directly (`passwordHash`, `__v`, internal fields).
- Unbounded `limit`/`pageSize` from the query string.
:::

::: understand
- Allow-list on the way in, allow-list on the way out.
:::

::: ask
- *"Which fields may this role change through this endpoint?"* That list *is* the schema.
:::

::: important ⭐ Say this in the interview
"Mass assignment happens when request bodies are copied straight into models, letting attackers set fields like role or ownerId. I validate with allow-list schemas per operation and only ever use the parsed output; unknown keys are stripped or rejected. I tested this: Zod strips them by default and rejects with strict, Joi rejects by default, and Ajv rejects with additionalProperties false. Query strings are coerced and capped, for example limit at most 100. On the way out I map documents to DTOs, so password hashes and internal fields can never leak."
:::

::: links
OWASP: Mass Assignment Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
OWASP API Security: Broken Object Property Level Authorization | https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/
:::

=== Operational vs programmer errors: how do you design error handling? (custom error classes)
@p 3
@tags error-handling, express, architecture
@quick
- **Operational errors** are expected failures of a correct program: invalid input, not found, conflicts, timeouts, a 503 from a dependency → handle them (response, retry, fallback).
- **Programmer errors** are bugs: `undefined is not a function`, wrong types, a forgotten `await` → don't "handle"; log, return 500, and let the process **crash and restart** if state may be corrupt.
- Custom classes (`AppError` → `NotFoundError`, `ValidationError`, `ConflictError`…) carry `status`, `code` and `details`.
- One **central error middleware** maps errors to a stable JSON format; unknown errors become **500 without internal details**, logged with stack and request id.
- Throw in services, don't send responses from deep layers; translate driver errors (Mongo `11000` → `ConflictError`).

::: text 🧒 In simple words
An operational error is **rain on the day of a picnic**: annoying but expected, so you bring an umbrella (a retry, a nice message). A programmer error is **a hole in the picnic basket**: no umbrella helps; you fix the basket. Error handling is mostly about telling these two apart.
:::

::: text 📖 Detailed answer
| | Operational | Programmer |
|---|---|---|
| Examples | 404, validation, duplicate key, DB timeout, ECONNRESET, payment declined | TypeError, null access, bad arguments, unhandled promise |
| Expected? | yes | no |
| Response | 4xx/5xx with a clear code | 500 "Internal Server Error" |
| Action | retry, fallback, inform user | fix code; crash if state is unknown |
| Log level | info/warn | error + alert |

### Error format (stable contract)
`{ "error": { "code": "ORDER_NOT_FOUND", "message": "Order 981 not found", "details": [...], "requestId": "…" } }`: clients switch on `code`, never on `message`.

### Layer responsibilities
- **Repository**: translate driver errors (duplicate key → `ConflictError`).
- **Service**: throw domain errors (`OutOfStockError`).
- **Controller**: nothing special: `await service.x()`; errors flow to the middleware.
- **Error middleware**: map, log, respond. Only place that formats errors.
:::

::: diagram Where errors go
flowchart TD
  R["repository: duplicate key"] --> T["ConflictError 409"]
  S["service: out of stock"] --> O["AppError 409 OUT_OF_STOCK"]
  B["bug: TypeError"] --> U["unknown error"]
  T --> M["central error middleware"]
  O --> M
  U --> M
  M -->|"AppError"| J["status + code + message"]
  M -->|"unknown"| F["500 generic message, log stack, alert"]
:::

::: image Operational vs programmer errors
/images/nodejs/error-types.svg
:::

::: text 🪜 Step by step
`POST /api/users` with an email that already exists:
1. Validation passes.
2. `userRepository.create()` → MongoDB throws `E11000 duplicate key`.
3. Repository catches it and throws `new ConflictError('EMAIL_TAKEN', 'Email already registered')`.
4. The controller doesn't catch it; Express forwards it to the error middleware.
5. Middleware responds `409 { error: { code: 'EMAIL_TAKEN', … } }` and logs at `info` (expected), not `error`.
:::

::: code javascript errors.js + error middleware (Express 5)
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
class ValidationError extends AppError { constructor(details) { super(400, 'VALIDATION_FAILED', 'Invalid request', details); } }
class UnauthorizedError extends AppError { constructor() { super(401, 'UNAUTHENTICATED', 'Please log in'); } }
class ForbiddenError extends AppError { constructor() { super(403, 'FORBIDDEN', 'Not allowed'); } }
class NotFoundError extends AppError { constructor(what) { super(404, 'NOT_FOUND', `${what} not found`); } }
class ConflictError extends AppError { constructor(code, message) { super(409, code, message); } }

// Repository: translate driver errors
async function createUser(User, data) {
  try {
    return await User.create(data);
  } catch (err) {
    if (err.code === 11000) throw new ConflictError('EMAIL_TAKEN', 'Email already registered');
    throw err;
  }
}

// Last middleware: the only place that formats errors
function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.name === 'ZodError') err = new ValidationError(err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    if (err.type === 'entity.too.large') err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    if (err.isOperational) {
      logger.info({ err: { code: err.code }, requestId: req.id }, 'request failed');
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
    }
    logger.error({ err, requestId: req.id }, 'unexpected error');      // programmer error: full stack in logs
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal Server Error', requestId: req.id } });
  };
}

module.exports = { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, createUser, errorHandler };
:::

::: code javascript Mapping errors to responses (runnable)
class AppError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; this.isOperational = true; } }
class NotFoundError extends AppError { constructor(what) { super(404, 'NOT_FOUND', `${what} not found`); } }
const logs = [];
function toResponse(err, requestId) {
  if (err.code === 11000) err = new AppError(409, 'EMAIL_TAKEN', 'Email already registered');      // driver → domain
  if (err.isOperational) { logs.push(['info', err.code]); return { status: err.status, body: { error: { code: err.code, message: err.message, requestId } } }; }
  logs.push(['error', err.stack.split('\n')[0]]);
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Internal Server Error', requestId } } };
}
const nf = toResponse(new NotFoundError('Order 981'), 'r1');
const dup = toResponse(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }), 'r2');
let bug; try { null.total; } catch (e) { bug = toResponse(e, 'r3'); }
console.log(nf.status, dup.status, bug.status, JSON.stringify(bug.body));
console.log('404 for missing order', nf.status === 404 ? '✅' : '❌ FAIL');
console.log('duplicate key → 409 EMAIL_TAKEN', dup.status === 409 && dup.body.error.code === 'EMAIL_TAKEN' ? '✅' : '❌ FAIL');
console.log('bug → 500 without leaking the message', bug.status === 500 && !JSON.stringify(bug.body).includes('null') ? '✅' : '❌ FAIL');
console.log('bugs logged at error level', logs.some(([lvl]) => lvl === 'error') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `catch (e) { res.status(500).send(e.message) }` everywhere (leaks internals, inconsistent).
- Swallowing errors (`catch {}`) so failures disappear.
- Throwing strings or plain objects (no stack, no `instanceof`).
- Logging operational errors as `error` (alert fatigue) and bugs as `info`.
- Trying to keep running after an unknown programmer error with possibly corrupted state.
:::

::: understand
- Handle what you expect, crash on what you don't, and format errors in exactly one place.
:::

::: ask
- *"Which error codes does the frontend need to react to differently?"* Those become stable codes.
:::

::: important ⭐ Say this in the interview
"I separate operational errors, which are expected failures like invalid input, not found, conflicts or a dependency timing out, from programmer errors, which are bugs. Operational errors are custom classes extending an AppError with a status, a stable code and details; repositories translate driver errors, for example a duplicate key into a 409, and services throw domain errors. One error middleware maps them to a consistent JSON format with a request id. Anything unknown becomes a generic 500, is logged with its stack and alerts, and if state might be corrupted the process exits and the orchestrator restarts it."
:::

::: links
Node.js best practices: error handling | https://github.com/goldbergyoni/nodebestpractices#2-error-handling-practices
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
:::

=== How are async errors handled in Express 4 vs Express 5? (sync errors, rejected promises)
@p 3
@tags error-handling, express, async, promises
@quick
- Express catches **synchronous** throws in handlers in both versions.
- **Express 4** does **not** catch rejected promises: measured, an `async` handler that threw left the request **hanging** (client timed out after 1.5 s) and fired `unhandledRejection`.
- **Express 5** forwards rejected promises to `next(err)`: measured, the same handler returned **500 JSON from the error middleware**.
- In Express 4 use a wrapper (`asyncHandler(fn)`) or `express-async-errors`; errors in callbacks/timers/event emitters still need `next(err)` manually.
- Error middleware has **4 arguments** `(err, req, res, next)` and goes **last**.

::: text 🧒 In simple words
Express 4 was a **receptionist who only listens when you speak right now**: if you promise to answer later and then fail, nobody hears and the visitor waits forever. Express 5 **waits for your promise** and, if it breaks, sends the visitor to the complaints desk (the error middleware).
:::

::: text 📖 Detailed answer
### Measured (same route, Node 22)
`app.get('/boom', async () => { await null; throw new Error('db down'); })`
| Version | What happened |
|---|---|
| Express 4.22 | `unhandledRejection: db down`; client got **no response** (timed out after 1.5 s) |
| Express 5.2 | **500** `{"error":"db down","handledBy":"error middleware"}` |

### Where errors can come from
| Source | Express 4 | Express 5 |
|---|---|---|
| `throw` in a sync handler | caught | caught |
| rejected promise from an `async` handler | **not caught** | caught |
| `throw` inside `setTimeout`/callback | crashes process | crashes process |
| `stream.on('error')` | must call `next(err)` | must call `next(err)` |

### Patterns
- Express 5: write `async` handlers freely.
- Express 4: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`.
- Callback APIs: promisify them so errors become rejections.
- Always `await` (or `return`) promises inside handlers; a floating promise's rejection escapes both versions.
:::

::: diagram Async error paths
flowchart TD
  H["async route handler throws"] --> V{"Express version"}
  V -->|"4"| U["promise rejection not observed: request hangs, unhandledRejection"]
  V -->|"5"| N["next err: error middleware sends 500"]
  W["asyncHandler wrapper in Express 4"] --> N
:::

::: image Operational vs programmer errors
/images/nodejs/error-types.svg
:::

::: text 🪜 Step by step
Upgrading an Express 4 app to 5:
1. Remove `express-async-errors` / manual wrappers (or keep them; they're harmless).
2. Replace removed APIs (`req.param()`, `res.send(status)`; path syntax `*` → `/*splat`).
3. `req.query` is now a getter: don't assign to it.
4. Run the test suite, including tests that assert 500 responses for thrown async errors.
5. Remove `process.on('unhandledRejection')` workarounds that were hiding missed errors.
:::

::: code javascript asyncerr.js: the experiment (node asyncerr.js express4 | express)
const which = process.argv[2];                       // 'express4' (npm:express@4) or 'express' (v5)
const express = require(which);
const app = express();

app.get('/boom', async (req, res) => {
  await null;
  throw new Error('db down');
});
app.use((err, req, res, next) => res.status(500).json({ error: err.message, handledBy: 'error middleware' }));

process.on('unhandledRejection', (e) => console.log(`[${which}] unhandledRejection: ${e.message} (request left hanging)`));

const server = app.listen(0, async () => {
  try {
    const r = await fetch(`http://localhost:${server.address().port}/boom`, { signal: AbortSignal.timeout(1500) });
    console.log(`[${which}] response ${r.status}`, await r.text());
  } catch (e) {
    console.log(`[${which}] client: ${e.name} after 1.5 s`);
  }
  process.exit(0);
});
// Express 4 → unhandledRejection + TimeoutError · Express 5 → 500 {"error":"db down",…}
:::

::: code javascript Why a wrapper fixes Express 4 (runnable)
// A tiny router that, like Express 4, only catches synchronous throws.
const escaped = [];                                         // rejections nobody handled (Node would report unhandledRejection)
function dispatch(handler, version) {
  return new Promise((resolve) => {
    const res = { send: (s) => resolve(s) };
    const next = (err) => resolve(`500 via error middleware: ${err.message}`);
    try {
      const out = handler({}, res, next);
      if (out && typeof out.then === 'function') {
        if (version === 5) out.catch(next);                 // what Express 5 adds
        else out.catch((e) => escaped.push(e.message));     // Express 4 ignores the promise
      }
    } catch (err) { next(err); }
    setTimeout(() => resolve('no response (hung)'), 50);
  });
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const failing = async () => { await null; throw new Error('db down'); };
(async () => {
  const v4 = await dispatch(failing, 4);
  const v4wrapped = await dispatch(asyncHandler(failing), 4);
  const v5 = await dispatch(failing, 5);
  console.log({ v4, v4wrapped, v5, escaped });
  console.log('Express 4 hangs on async throw', v4 === 'no response (hung)' && escaped[0] === 'db down' ? '✅ (measured)' : '❌ FAIL');
  console.log('wrapper forwards to next()', v4wrapped.startsWith('500') ? '✅' : '❌ FAIL');
  console.log('Express 5 forwards to next()', v5.startsWith('500') ? '✅ (measured)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `async` handlers in Express 4 without a wrapper.
- Floating promises (`service.doThing()` without `await`) in any version.
- Throwing inside callbacks/timers (no framework can catch those).
- Error middleware with 3 parameters (Express treats it as normal middleware).
- Registering the error middleware before the routes.
:::

::: understand
- Express 5 catches rejected promises; Express 4 needs a wrapper; callbacks always need `next(err)`.
:::

::: ask
- *"Which Express version is this, and are handlers async?"*
:::

::: important ⭐ Say this in the interview
"Express catches synchronous throws, but Express 4 ignores rejected promises from async handlers: I tested it, and the request simply hung until the client timed out while Node reported an unhandled rejection. Express 5 forwards rejections to next, so the same handler returned a 500 from my error middleware. On Express 4 I wrap handlers with an asyncHandler that catches and calls next, and in both versions I await every promise and promisify callbacks, because errors thrown in timers or callbacks escape any framework."
:::

::: links
Express 5 migration guide | https://expressjs.com/en/guide/migrating-5.html
Express: Error handling | https://expressjs.com/en/guide/error-handling.html
:::

=== What should happen on uncaughtException and unhandledRejection? (global handlers)
@p 2
@tags error-handling, process, reliability, graceful-shutdown
@quick
- Since Node 15 an **unhandled promise rejection crashes** the process, like an uncaught exception. Measured: both exit with **code 1**.
- Global handlers are a **last resort**: log the error (with context), flush logs, stop accepting traffic, then **exit(1)** and let the orchestrator restart a clean process.
- Don't keep running after `uncaughtException`: the docs call it unsafe because state (open transactions, half-written data) is unknown.
- Crash-only design needs **multiple instances**, **health checks** and **graceful shutdown** so a restart doesn't drop requests.
- Prevent rather than catch: `await` everything, lint `no-floating-promises`, handle `'error'` on every emitter/stream.

::: text 🧒 In simple words
A global error handler is the **fire alarm**, not the fire extinguisher. When it rings you don't keep cooking; you note what happened, get everyone out calmly, and let a fresh kitchen (a new process) take over.
:::

::: text 📖 Detailed answer
### Default behaviour (measured, Node 22)
| Situation | Exit code |
|---|---|
| `Promise.reject(new Error())` with no handler | **1** (crash) |
| `throw` inside `setTimeout` | **1** (crash) |

### Recommended handlers
1. `process.on('unhandledRejection', (reason) => { throw reason; })`, turning it into an uncaught exception (one path).
2. `process.on('uncaughtException', (err) => { logger.fatal(err); shutdown(1); })`.
3. `shutdown` stops the server accepting connections, waits a short time for in-flight requests, closes DB/Redis, then `process.exit(code)` with a hard timeout.

### Why not just continue?
An exception can interrupt code halfway through: a lock never released, a transaction never committed, a counter half-updated. Restarting is cheap with 2+ instances behind a load balancer; debugging silent corruption is not.

### Other sources of crashes
- `'error'` events without listeners on streams, sockets, EventEmitters → thrown.
- Out-of-memory (heap limit) → process killed; see memory management.
:::

::: diagram Last-resort crash handling
flowchart LR
  E["uncaught exception or unhandled rejection"] --> L["log fatal with stack and request id"]
  L --> S["stop accepting traffic"]
  S --> D["finish or abort in-flight requests within a timeout"]
  D --> C["close DB and Redis"]
  C --> X["exit 1"]
  X --> R["orchestrator restarts a clean process"]
:::

::: image Operational vs programmer errors
/images/nodejs/error-types.svg
:::

::: text 🪜 Step by step
A bug throws inside a `setTimeout` in production:
1. The exception reaches `uncaughtException`.
2. The handler logs `fatal` with the stack; the log shipper/alerting fires.
3. `server.close()`; readiness probe now fails, so the load balancer stops sending traffic.
4. After up to 10 s (or when idle), DB pool and Redis are closed; `process.exit(1)`.
5. Kubernetes/PM2/Docker restarts the container; other replicas served traffic meanwhile.
:::

::: code javascript process-handlers.js: fatal error handling with graceful shutdown
function installProcessHandlers({ server, logger, closeResources, timeoutMs = 10_000 }) {
  let shuttingDown = false;

  async function shutdown(code, reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');
    const force = setTimeout(() => { logger.error('forced exit after timeout'); process.exit(code || 1); }, timeoutMs);
    force.unref();
    server.close(async () => {
      try { await closeResources(); } catch (err) { logger.error({ err }, 'error while closing resources'); }
      process.exit(code);
    });
    server.closeIdleConnections();
  }

  process.on('unhandledRejection', (reason) => { throw reason; });     // one path for both kinds of fatal errors
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdown(1, 'uncaughtException');
  });
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  return shutdown;
}

module.exports = { installProcessHandlers };
:::

::: code javascript Floating promises vs awaited ones (runnable)
// The bug behind most unhandled rejections: a promise nobody awaits.
const caught = [], floating = [];
async function saveAudit() { await null; throw new Error('audit DB down'); }
async function handlerWithBug() { floating.push(saveAudit()); return 'ok'; }       // not awaited!
async function handlerFixed() { try { await saveAudit(); } catch (e) { caught.push(e.message); } return 'ok'; }
(async () => {
  const response = await handlerWithBug();
  // In a real app nobody would look at floating[0]; Node reports it as unhandledRejection and exits with code 1.
  const lost = await floating[0].then(() => null, (e) => e.message);
  await handlerFixed();
  console.log({ responseFromBuggyHandler: response, errorNobodyHandled: lost, caughtByFixedHandler: caught });
  console.log('buggy handler answered "ok" although the audit failed', response === 'ok' && lost === 'audit DB down' ? '✅ (this is the danger)' : '❌ FAIL');
  console.log('awaited version catches it', caught[0] === 'audit DB down' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `process.on('uncaughtException', log)` and carrying on.
- `--unhandled-rejections=warn` to "fix" crashes.
- `process.exit()` immediately, without flushing logs or finishing requests.
- A single instance, so every crash is downtime.
- Missing `'error'` listeners on streams and sockets.
:::

::: understand
- Prevent with `await` and error listeners; when something unknown slips through, log and restart cleanly.
:::

::: ask
- *"How many instances run, and what restarts a crashed one?"*
:::

::: important ⭐ Say this in the interview
"In modern Node both an uncaught exception and an unhandled rejection crash the process; I checked that both exit with code one. I treat global handlers as a last resort: log the error with context, stop accepting traffic, give in-flight requests a few seconds, close the database and Redis, and exit non-zero so the orchestrator starts a clean process, because after an unknown exception the in-memory state can't be trusted. That only works with several instances, health checks and graceful shutdown, and the real fix is preventing floating promises and missing error listeners."
:::

::: links
Node.js: process 'uncaughtException' | https://nodejs.org/api/process.html#event-uncaughtexception
Node.js: process 'unhandledRejection' | https://nodejs.org/api/process.html#event-unhandledrejection
:::
