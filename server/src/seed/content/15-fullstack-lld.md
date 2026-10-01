@section Full-Stack LLD
@icon 🧩
@color #9333ea
@desc End-to-end feature design with COMPLETE runnable projects (Express API + React client + Docker Compose): user management with RBAC, product catalog, file upload to S3 with presigned URLs, real-time notifications and a large-scale dashboard. Every design: requirements, architecture + ER + sequence diagrams, every file in full, a run guide with curl, a browser simulation with tests, trade-offs and scaling.

=== Design a User Management System (RBAC, admin UI)
@p 3
@tags lld, full-stack, crud, rbac
@quick
- Backend layers: **route → controller → service → repository**; the service owns business rules (RBAC, "can't demote yourself", unique email), repositories are swappable (memory / MongoDB).
- **RBAC** = roles map to **permissions** (`users:read`, `users:write`, `users:delete`, `audit:read`); routes check permissions, services check *ownership/hierarchy* rules.
- **Optimistic concurrency**: every user has a `version`; `PATCH` sends it back; mismatch → **409 Conflict** (no lost updates when two admins edit at once).
- **Soft delete** (`status: 'deactivated'`) + **audit log** of who changed what; list API with search, filters, pagination, sort.
- Frontend: login, users table (debounced search, filters, pagination), create form, inline role/status edits, permission-aware UI (`can('users:write')`), 409 handling. Server enforces everything; the UI only hides what you can't do.

::: text 🧒 In simple words
Every SaaS product (Slack, Jira, AWS) has an **admin page for people**: invite a colleague, make someone a manager, disable an account when they leave, see who changed what. We'll build that end to end: an Express API that decides **who may do what** (roles and permissions), stores users safely (hashed passwords, unique emails), records every change in an audit log, and a React admin screen that only shows the buttons you're allowed to use, like a building where your key card only opens the doors meant for you.
:::

::: text 📋 Requirements
### Functional
- Login with email + password; `GET /me`.
- Roles: **admin** (everything), **manager** (view users, create/edit regular users), **user** (only their own profile).
- Users list with search (name/email), filter by role and status, pagination, sort.
- Create user, change role/status, deactivate (soft delete), reactivate.
- Business rules: unique email; nobody changes their own role or deactivates themselves; managers only manage regular users and can't grant manager/admin.
- Audit log: actor, action, target, changes, time (admins only).

### Non-functional
- Passwords hashed (scrypt + salt); tokens signed and short-lived; consistent JSON errors.
- Concurrent edits don't silently overwrite each other (optimistic locking).
- Runs with zero setup (in-memory) **or** with MongoDB via Docker Compose.

### Assumptions
- Express 4 (CommonJS) API on port 4300; React 18 + Vite client (dev server proxies `/api`); in production the API also serves the built client.
- Demo accounts are seeded: `admin@example.com / Admin123!`, `manager@example.com / Manager123!`, `user@example.com / User1234!`.
:::

::: ask
- *"How many users and admins? Multi-tenant (organisations)?"* (Tenant id on every query.)
- *"Fixed roles or custom roles with editable permissions?"*
- *"Invite by email with a set-password link, or admin sets a temporary password?"*
- *"SSO (SAML/OIDC) or SCIM provisioning needed?"*
- *"Hard delete for GDPR, or soft delete + anonymisation?"*
:::

::: diagram Architecture and classes
flowchart LR
  subgraph Client["React client"]
    LP["LoginPage"] --> AC["AuthContext (token in memory)"]
    UP["UsersPage: table, filters, pagination"] --> API["api.js fetch wrapper"]
    UF["UserForm"] --> API
    AL["AuditLog"] --> API
  end
  API -->|"/api"| R["routes/index.js"]
  subgraph Server["Express API"]
    R --> MW["requireAuth + requirePermission"]
    MW --> UC["UserController"]
    UC --> US["UserService (RBAC rules, versioning, audit)"]
    US --> UR["UserRepository"]
    US --> AR["AuditRepository"]
    UR --> MEM["memory"]
    UR --> MDB["MongoDB"]
  end
:::

::: diagram ER model
erDiagram
  USER ||--o{ AUDIT_ENTRY : "acts in"
  USER ||--o{ AUDIT_ENTRY : "is target of"
  USER {
    string id PK
    string email UK
    string name
    string role "admin, manager, user"
    string status "active, deactivated"
    string passwordHash
    int version
    date createdAt
    date updatedAt
  }
  AUDIT_ENTRY {
    string id PK
    string actorId FK
    string action
    string targetId FK
    json changes
    date at
  }
:::

::: diagram Sequence: two admins edit the same user
sequenceDiagram
  participant A as Admin A
  participant B as Admin B
  participant API as Express API
  participant S as UserService
  participant DB as Repository
  A->>API: GET /api/users/42 (version 3)
  B->>API: GET /api/users/42 (version 3)
  A->>API: PATCH /api/users/42 role manager, version 3
  API->>S: update (checks permission + hierarchy)
  S->>DB: update where id 42 and version 3, set version 4
  DB-->>S: updated
  S->>DB: audit "user.update"
  API-->>A: 200 (version 4)
  B->>API: PATCH /api/users/42 status deactivated, version 3
  S->>DB: update where id 42 and version 3
  DB-->>S: no match
  API-->>B: 409 Conflict, reload and retry
:::

::: image User management: React admin, Express layers with RBAC and versioning, swappable repositories, audit log
/images/fullstack-lld/user-management.svg
:::

::: text 🧱 Design
### Roles → permissions (`server/src/auth/permissions.js`)
| Role | Permissions |
|---|---|
| admin | `users:read`, `users:write`, `users:delete`, `audit:read` |
| manager | `users:read`, `users:write` (only for role `user`) |
| user | none on other users (only `/me`) |

### API contract
| Method | Path | Permission | Body / query | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | `{ email, password }` | 200 `{ token, user }` | 400, 401, 403 (deactivated) |
| GET | `/api/auth/me` | logged in | | 200 `{ user }` | 401 |
| GET | `/api/users` | `users:read` | `search, role, status, page, limit, sort=field:dir` | 200 `{ items, total, page, limit }` | 400, 403 |
| POST | `/api/users` | `users:write` | `{ email, name, role, password }` | 201 `{ user }` | 400, 403, 409 email |
| GET | `/api/users/:id` | `users:read` | | 200 | 404 |
| PATCH | `/api/users/:id` | `users:write` | `{ name?, role?, status?, version }` | 200 `{ user }` | 400, 403, 404, **409 version** |
| DELETE | `/api/users/:id` | `users:delete` | | 204 (soft delete) | 403, 404 |
| GET | `/api/audit` | `audit:read` | `limit` | 200 `{ items }` | 403 |

Errors are always `{ "error": { "code", "message", "details"? } }`.

### Module responsibilities
| Module | Responsibility |
|---|---|
| `utils/password.js`, `utils/token.js` | scrypt hashing; HMAC-signed tokens with expiry |
| `middleware/auth.js` | `requireAuth` (token → `req.user`, re-checks the user is active), `requirePermission(p)` |
| `validation/user.validation.js` | Shape/format checks → 400 with field details |
| `services/user.service.js` | RBAC hierarchy rules, uniqueness, versioning, audit entries |
| `repositories/*.js` | Same interface for memory and MongoDB: `findById`, `findByEmail`, `list`, `create`, `update(id, patch, version)`, `count`; audit `add`, `list` |
:::

::: text 📁 Folder structure
`user-management/`
↳ `docker-compose.yml`, `Dockerfile`
↳ `server/package.json`
↳ `server/src/index.js`, `server/src/app.js`, `server/src/config.js`
↳ `server/src/utils/errors.js`, `server/src/utils/password.js`, `server/src/utils/token.js`
↳ `server/src/auth/permissions.js`, `server/src/middleware/auth.js`, `server/src/validation/user.validation.js`
↳ `server/src/repositories/memory.repository.js`, `server/src/repositories/mongo.repository.js`
↳ `server/src/services/auth.service.js`, `server/src/services/user.service.js`
↳ `server/src/controllers/auth.controller.js`, `server/src/controllers/user.controller.js`, `server/src/routes/index.js`
↳ `client/package.json`, `client/vite.config.js`, `client/index.html`
↳ `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`, `client/src/AuthContext.jsx`, `client/src/useDebounce.js`, `client/src/styles.css`
↳ `client/src/pages/LoginPage.jsx`, `client/src/pages/UsersPage.jsx`, `client/src/components/UserForm.jsx`, `client/src/components/AuditLog.jsx`
:::

::: code json user-management/server/package.json
{
  "name": "user-management-api",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongodb": "^6.8.0"
  }
}
:::

::: code javascript user-management/server/src/config.js
const crypto = require('crypto');

const config = {
  port: Number(process.env.PORT) || 4300,
  mongoUrl: process.env.MONGO_URL || '',               // empty → in-memory repositories
  tokenSecret: process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex'),
  tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS) || 60 * 60,
  seedUsers: process.env.SEED_USERS !== 'false',
};

if (!process.env.TOKEN_SECRET) {
  console.warn('⚠️  TOKEN_SECRET not set: using a random secret (tokens become invalid after a restart)');
}

module.exports = config;
:::

::: code javascript user-management/server/src/utils/errors.js
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, 'BAD_REQUEST', message, details); }
  static unauthorized(message = 'Login required') { return new ApiError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'You are not allowed to do this') { return new ApiError(403, 'FORBIDDEN', message); }
  static notFound(message = 'Not found') { return new ApiError(404, 'NOT_FOUND', message); }
  static conflict(message, details) { return new ApiError(409, 'CONFLICT', message, details); }
}

// Express 4 doesn't catch async errors: wrap every async handler
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') err = ApiError.badRequest('Invalid JSON body');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL',
      message: status >= 500 ? 'Something went wrong' : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { ApiError, asyncHandler, notFoundHandler, errorHandler };
:::

::: code javascript user-management/server/src/utils/password.js
const crypto = require('crypto');

const KEY_LENGTH = 64;

/** Returns "salt:hash" (both hex). scrypt is slow on purpose → brute force is expensive. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

module.exports = { hashPassword, verifyPassword };
:::

::: code javascript user-management/server/src/utils/token.js
// Minimal signed token (same idea as a JWT with HS256): base64url(payload).base64url(hmac)
const crypto = require('crypto');

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signToken(payload, secret, ttlSeconds) {
  const body = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Returns the payload or null if the signature is wrong or the token expired. */
function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  return payload.exp > Date.now() / 1000 ? payload : null;
}

module.exports = { signToken, verifyToken };
:::

::: code javascript user-management/server/src/auth/permissions.js
const ROLES = ['admin', 'manager', 'user'];

const ROLE_PERMISSIONS = {
  admin: ['users:read', 'users:write', 'users:delete', 'audit:read'],
  manager: ['users:read', 'users:write'],
  user: [],
};

// Higher number = more powerful. Used for "you can't manage someone above you".
const ROLE_RANK = { user: 1, manager: 2, admin: 3 };

const can = (role, permission) => (ROLE_PERMISSIONS[role] || []).includes(permission);

module.exports = { ROLES, ROLE_PERMISSIONS, ROLE_RANK, can };
:::

::: code javascript user-management/server/src/middleware/auth.js
const { ApiError } = require('../utils/errors');
const { verifyToken } = require('../utils/token');
const { can } = require('../auth/permissions');

function requireAuth({ userRepo, config }) {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = verifyToken(token, config.tokenSecret);
      if (!payload) throw ApiError.unauthorized('Invalid or expired token');
      // Load the CURRENT user: a role change or deactivation takes effect immediately
      const user = await userRepo.findById(payload.sub);
      if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not active');
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

const requirePermission = (permission) => (req, res, next) =>
  can(req.user.role, permission) ? next() : next(ApiError.forbidden(`Missing permission ${permission}`));

module.exports = { requireAuth, requirePermission };
:::

::: code javascript user-management/server/src/validation/user.validation.js
const { ApiError } = require('../utils/errors');
const { ROLES } = require('../auth/permissions');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['active', 'deactivated'];
const SORT_FIELDS = ['name', 'email', 'role', 'status', 'createdAt'];

function fail(details) {
  if (Object.keys(details).length) throw ApiError.badRequest('Validation failed', details);
}

function validateCreate(body = {}) {
  const d = {};
  const email = String(body.email || '').trim().toLowerCase();    // normalise BEFORE validating
  if (!EMAIL.test(email)) d.email = 'Valid email is required';
  if (!body.name || String(body.name).trim().length < 2) d.name = 'Name must be at least 2 characters';
  if (!ROLES.includes(body.role)) d.role = `Role must be one of ${ROLES.join(', ')}`;
  if (!body.password || String(body.password).length < 8) d.password = 'Password must be at least 8 characters';
  fail(d);
  return { email, name: body.name.trim(), role: body.role, password: String(body.password) };
}

function validateUpdate(body = {}) {
  const d = {};
  const patch = {};
  if (body.name !== undefined) {
    if (String(body.name).trim().length < 2) d.name = 'Name must be at least 2 characters';
    else patch.name = String(body.name).trim();
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) d.role = `Role must be one of ${ROLES.join(', ')}`;
    else patch.role = body.role;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) d.status = `Status must be one of ${STATUSES.join(', ')}`;
    else patch.status = body.status;
  }
  if (!Number.isInteger(body.version)) d.version = 'version (integer) is required for updates';
  if (!Object.keys(patch).length && !Object.keys(d).length) d.body = 'Nothing to update';
  fail(d);
  return { patch, version: body.version };
}

function validateListQuery(q = {}) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 10));
  const [sortField = 'createdAt', sortDir = 'desc'] = String(q.sort || 'createdAt:desc').split(':');
  const d = {};
  if (!SORT_FIELDS.includes(sortField)) d.sort = `Sort by one of ${SORT_FIELDS.join(', ')}`;
  if (q.role && !ROLES.includes(q.role)) d.role = 'Unknown role';
  if (q.status && !STATUSES.includes(q.status)) d.status = 'Unknown status';
  fail(d);
  return {
    search: String(q.search || '').trim().slice(0, 100),
    role: q.role || '',
    status: q.status || '',
    page,
    limit,
    sort: { field: sortField, dir: sortDir === 'asc' ? 1 : -1 },
  };
}

module.exports = { validateCreate, validateUpdate, validateListQuery };
:::

::: code javascript user-management/server/src/repositories/memory.repository.js
// In-memory repositories: same interface as the Mongo ones (great for tests and demos).
const crypto = require('crypto');

const clone = (x) => (x ? structuredClone(x) : null);

function createMemoryUserRepository() {
  const users = new Map();

  return {
    async findById(id) { return clone(users.get(id)); },
    async findByEmail(email) { return clone([...users.values()].find((u) => u.email === email)); },
    async count() { return users.size; },

    async list({ search, role, status, page, limit, sort }) {
      const q = search.toLowerCase();
      let rows = [...users.values()].filter((u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)) &&
        (!role || u.role === role) &&
        (!status || u.status === status));
      rows.sort((a, b) => (a[sort.field] > b[sort.field] ? 1 : a[sort.field] < b[sort.field] ? -1 : 0) * sort.dir);
      const total = rows.length;
      rows = rows.slice((page - 1) * limit, page * limit);
      return { items: rows.map(clone), total };
    },

    async create(data) {
      if ([...users.values()].some((u) => u.email === data.email)) {
        const err = new Error('duplicate email');
        err.code = 'DUPLICATE';
        throw err;
      }
      const now = new Date().toISOString();
      const user = { id: crypto.randomUUID(), status: 'active', version: 1, createdAt: now, updatedAt: now, ...data };
      users.set(user.id, user);
      return clone(user);
    },

    /** Updates only if the stored version matches (optimistic locking). Returns null on mismatch. */
    async update(id, patch, expectedVersion) {
      const user = users.get(id);
      if (!user || user.version !== expectedVersion) return null;
      Object.assign(user, patch, { version: user.version + 1, updatedAt: new Date().toISOString() });
      return clone(user);
    },
  };
}

function createMemoryAuditRepository() {
  const entries = [];
  return {
    async add(entry) { entries.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry }); },
    async list({ limit = 50 } = {}) { return entries.slice(-limit).reverse(); },
  };
}

module.exports = { createMemoryUserRepository, createMemoryAuditRepository };
:::

::: code javascript user-management/server/src/repositories/mongo.repository.js
// MongoDB repositories with the SAME interface as memory.repository.js.
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strip = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;            // keep our own string id, hide Mongo's _id
  return rest;
};

async function createMongoRepositories(url) {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const usersCol = db.collection('users');
  const auditCol = db.collection('audit');
  await usersCol.createIndex({ id: 1 }, { unique: true });
  await usersCol.createIndex({ email: 1 }, { unique: true });       // the DB enforces uniqueness (race-safe)
  await usersCol.createIndex({ role: 1, status: 1, createdAt: -1 });
  await auditCol.createIndex({ at: -1 });

  const userRepo = {
    async findById(id) { return strip(await usersCol.findOne({ id })); },
    async findByEmail(email) { return strip(await usersCol.findOne({ email })); },
    async count() { return usersCol.countDocuments(); },

    async list({ search, role, status, page, limit, sort }) {
      const filter = {};
      if (search) {
        const rx = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: rx }, { email: rx }];
      }
      if (role) filter.role = role;
      if (status) filter.status = status;
      const [items, total] = await Promise.all([
        usersCol.find(filter).sort({ [sort.field]: sort.dir, id: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
        usersCol.countDocuments(filter),
      ]);
      return { items: items.map(strip), total };
    },

    async create(data) {
      const now = new Date().toISOString();
      const user = { id: crypto.randomUUID(), status: 'active', version: 1, createdAt: now, updatedAt: now, ...data };
      try {
        await usersCol.insertOne({ ...user });
      } catch (err) {
        if (err.code === 11000) {                                     // duplicate key
          const dup = new Error('duplicate email');
          dup.code = 'DUPLICATE';
          throw dup;
        }
        throw err;
      }
      return user;
    },

    async update(id, patch, expectedVersion) {
      const doc = await usersCol.findOneAndUpdate(
        { id, version: expectedVersion },                             // matches only the version we read
        { $set: { ...patch, updatedAt: new Date().toISOString() }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return strip(doc);
    },
  };

  const auditRepo = {
    async add(entry) { await auditCol.insertOne({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry }); },
    async list({ limit = 50 } = {}) { return (await auditCol.find().sort({ at: -1 }).limit(limit).toArray()).map(strip); },
  };

  return { userRepo, auditRepo, close: () => client.close() };
}

module.exports = { createMongoRepositories };
:::

::: code javascript user-management/server/src/services/auth.service.js
const { ApiError } = require('../utils/errors');
const { verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/token');
const { ROLE_PERMISSIONS } = require('../auth/permissions');

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
  version: u.version, createdAt: u.createdAt, updatedAt: u.updatedAt,
  permissions: ROLE_PERMISSIONS[u.role] || [],
});

function createAuthService({ userRepo, config }) {
  return {
    async login(email, password) {
      if (!email || !password) throw ApiError.badRequest('Email and password are required');
      const user = await userRepo.findByEmail(String(email).trim().toLowerCase());
      // Same message for "no such user" and "wrong password" → no account enumeration
      if (!user || !verifyPassword(String(password), user.passwordHash)) throw ApiError.unauthorized('Invalid email or password');
      if (user.status !== 'active') throw ApiError.forbidden('This account has been deactivated');
      const token = signToken({ sub: user.id, role: user.role }, config.tokenSecret, config.tokenTtlSeconds);
      return { token, user: publicUser(user) };
    },
  };
}

module.exports = { createAuthService, publicUser };
:::

::: code javascript user-management/server/src/services/user.service.js
const { ApiError } = require('../utils/errors');
const { hashPassword } = require('../utils/password');
const { ROLE_RANK, can } = require('../auth/permissions');
const { publicUser } = require('./auth.service');

function createUserService({ userRepo, auditRepo }) {
  /** Hierarchy rules that a simple permission check can't express. */
  function assertCanManage(actor, target, patch = {}) {
    // non-admins may only manage people BELOW them (a manager can't edit another manager)
    if (target && actor.role !== 'admin' && ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
      throw ApiError.forbidden('You can only manage users with a lower role');
    }
    if (patch.role && ROLE_RANK[patch.role] >= ROLE_RANK[actor.role] && actor.role !== 'admin') {
      throw ApiError.forbidden(`Only admins can assign the ${patch.role} role`);
    }
    if (target && target.id === actor.id && (patch.role || patch.status)) {
      throw ApiError.forbidden('You cannot change your own role or status');
    }
  }

  async function getOr404(id) {
    const user = await userRepo.findById(id);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  return {
    async list(query) {
      const { items, total } = await userRepo.list(query);
      return { items: items.map(publicUser), total, page: query.page, limit: query.limit };
    },

    async get(id) {
      return publicUser(await getOr404(id));
    },

    async create(actor, data) {
      assertCanManage(actor, null, { role: data.role });
      try {
        const user = await userRepo.create({ email: data.email, name: data.name, role: data.role, passwordHash: hashPassword(data.password) });
        await auditRepo.add({ actorId: actor.id, actorEmail: actor.email, action: 'user.create', targetId: user.id, changes: { email: user.email, role: user.role } });
        return publicUser(user);
      } catch (err) {
        if (err.code === 'DUPLICATE') throw ApiError.conflict('A user with this email already exists', { email: 'Already in use' });
        throw err;
      }
    },

    async update(actor, id, { patch, version }) {
      const target = await getOr404(id);
      assertCanManage(actor, target, patch);
      const updated = await userRepo.update(id, patch, version);
      if (!updated) {
        const current = await userRepo.findById(id);
        throw ApiError.conflict('This user was changed by someone else. Reload and try again.', { currentVersion: current?.version });
      }
      const changes = Object.fromEntries(Object.keys(patch).map((k) => [k, { from: target[k], to: updated[k] }]));
      await auditRepo.add({ actorId: actor.id, actorEmail: actor.email, action: 'user.update', targetId: id, changes });
      return publicUser(updated);
    },

    async deactivate(actor, id) {
      const target = await getOr404(id);
      if (!can(actor.role, 'users:delete')) throw ApiError.forbidden();
      assertCanManage(actor, target, { status: 'deactivated' });
      if (target.status === 'deactivated') return;
      await userRepo.update(id, { status: 'deactivated' }, target.version);
      await auditRepo.add({ actorId: actor.id, actorEmail: actor.email, action: 'user.deactivate', targetId: id, changes: { status: { from: target.status, to: 'deactivated' } } });
    },

    async audit(limit) {
      return auditRepo.list({ limit });
    },

    /** Creates demo accounts on an empty database. */
    async seed() {
      if ((await userRepo.count()) > 0) return false;
      const demo = [
        { email: 'admin@example.com', name: 'Ada Admin', role: 'admin', password: 'Admin123!' },
        { email: 'manager@example.com', name: 'Max Manager', role: 'manager', password: 'Manager123!' },
        { email: 'user@example.com', name: 'Uma User', role: 'user', password: 'User1234!' },
      ];
      for (let i = 1; i <= 22; i++) demo.push({ email: `member${i}@example.com`, name: `Member ${String(i).padStart(2, '0')}`, role: i % 5 === 0 ? 'manager' : 'user', password: 'Member123!' });
      for (const u of demo) await userRepo.create({ email: u.email, name: u.name, role: u.role, passwordHash: hashPassword(u.password) });
      return true;
    },
  };
}

module.exports = { createUserService };
:::

::: code javascript user-management/server/src/controllers/auth.controller.js
const { asyncHandler } = require('../utils/errors');
const { publicUser } = require('../services/auth.service');

function createAuthController({ authService }) {
  return {
    login: asyncHandler(async (req, res) => {
      const { email, password } = req.body || {};
      res.json(await authService.login(email, password));
    }),
    me: (req, res) => res.json({ user: publicUser(req.user) }),
  };
}

module.exports = { createAuthController };
:::

::: code javascript user-management/server/src/controllers/user.controller.js
const { asyncHandler } = require('../utils/errors');
const { validateCreate, validateUpdate, validateListQuery } = require('../validation/user.validation');

function createUserController({ userService }) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(await userService.list(validateListQuery(req.query)));
    }),
    get: asyncHandler(async (req, res) => {
      res.json({ user: await userService.get(req.params.id) });
    }),
    create: asyncHandler(async (req, res) => {
      const user = await userService.create(req.user, validateCreate(req.body));
      res.status(201).location(`/api/users/${user.id}`).json({ user });
    }),
    update: asyncHandler(async (req, res) => {
      res.json({ user: await userService.update(req.user, req.params.id, validateUpdate(req.body)) });
    }),
    remove: asyncHandler(async (req, res) => {
      await userService.deactivate(req.user, req.params.id);
      res.status(204).end();
    }),
    audit: asyncHandler(async (req, res) => {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      res.json({ items: await userService.audit(limit) });
    }),
  };
}

module.exports = { createUserController };
:::

::: code javascript user-management/server/src/routes/index.js
const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');

function createRouter({ authController, userController, userRepo, config }) {
  const router = express.Router();
  const auth = requireAuth({ userRepo, config });

  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.post('/auth/login', authController.login);
  router.get('/auth/me', auth, authController.me);

  router.get('/users', auth, requirePermission('users:read'), userController.list);
  router.post('/users', auth, requirePermission('users:write'), userController.create);
  router.get('/users/:id', auth, requirePermission('users:read'), userController.get);
  router.patch('/users/:id', auth, requirePermission('users:write'), userController.update);
  router.delete('/users/:id', auth, requirePermission('users:delete'), userController.remove);
  router.get('/audit', auth, requirePermission('audit:read'), userController.audit);

  return router;
}

module.exports = { createRouter };
:::

::: code javascript user-management/server/src/app.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createAuthService } = require('./services/auth.service');
const { createUserService } = require('./services/user.service');
const { createAuthController } = require('./controllers/auth.controller');
const { createUserController } = require('./controllers/user.controller');
const { createRouter } = require('./routes');
const { notFoundHandler, errorHandler } = require('./utils/errors');

/** Builds the app from injected repositories (memory in tests, Mongo in production). */
function createApp({ userRepo, auditRepo, config }) {
  const userService = createUserService({ userRepo, auditRepo });
  const authService = createAuthService({ userRepo, config });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createRouter({
    authController: createAuthController({ authService }),
    userController: createUserController({ userService }),
    userRepo,
    config,
  }));
  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin
  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return { app, userService };
}

module.exports = { createApp };
:::

::: code javascript user-management/server/src/index.js
const config = require('./config');
const { createApp } = require('./app');
const { createMemoryUserRepository, createMemoryAuditRepository } = require('./repositories/memory.repository');
const { createMongoRepositories } = require('./repositories/mongo.repository');

async function main() {
  let repos;
  if (config.mongoUrl) {
    repos = await createMongoRepositories(config.mongoUrl);
    console.log('🗄️  Using MongoDB');
  } else {
    repos = { userRepo: createMemoryUserRepository(), auditRepo: createMemoryAuditRepository() };
    console.log('🧠 Using in-memory storage (set MONGO_URL to use MongoDB)');
  }

  const { app, userService } = createApp({ ...repos, config });
  if (config.seedUsers && (await userService.seed())) console.log('🌱 Seeded demo users (admin@example.com / Admin123!)');

  const server = app.listen(config.port, () => console.log(`🚀 API on http://localhost:${config.port}`));
  const shutdown = () => server.close(async () => { await repos.close?.(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
:::

::: code json user-management/client/package.json
{
  "name": "user-management-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript user-management/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4300' } },
});
:::

::: code html user-management/client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>User Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript user-management/client/src/api.js
// fetch wrapper: JSON, Bearer token, one error shape.
let token = null;
export const setToken = (t) => { token = t; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined))}` : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
:::

::: code jsx user-management/client/src/AuthContext.jsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);                    // memory only: a reload logs you out (see trade-offs)
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    login,
    logout,
    can: (permission) => Boolean(user?.permissions.includes(permission)),
  }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
:::

::: code javascript user-management/client/src/useDebounce.js
import { useEffect, useState } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
:::

::: code jsx user-management/client/src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>Admin login</h1>
      <p className="muted">Demo: admin@example.com / Admin123!, manager@example.com / Manager123!, user@example.com / User1234!</p>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
:::

::: code jsx user-management/client/src/components/UserForm.jsx
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export function UserForm({ onCreated, onCancel }) {
  const { user: me } = useAuth();
  const roles = me.role === 'admin' ? ['user', 'manager', 'admin'] : ['user'];   // UI mirrors the server rule
  const [form, setForm] = useState({ name: '', email: '', role: 'user', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { user } = await api('/users', { method: 'POST', body: form });
      onCreated(user);
    } catch (err) {
      setErrors(err.details || { form: err.message });     // server validation → field errors
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, type = 'text') => (
    <div className="field">
      <label htmlFor={`new-${key}`}>{label}</label>
      <input id={`new-${key}`} type={type} value={form[key]} onChange={set(key)} aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `new-${key}-err` : undefined} />
      {errors[key] && <span id={`new-${key}-err`} className="error">{errors[key]}</span>}
    </div>
  );

  return (
    <form className="card user-form" onSubmit={onSubmit} aria-label="Create user">
      <h2>New user</h2>
      {field('name', 'Name')}
      {field('email', 'Email', 'email')}
      <div className="field">
        <label htmlFor="new-role">Role</label>
        <select id="new-role" value={form.role} onChange={set('role')}>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {field('password', 'Temporary password', 'password')}
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
      <div className="row">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
      </div>
    </form>
  );
}
:::

::: code jsx user-management/client/src/components/AuditLog.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function AuditLog({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/audit', { query: { limit: 15 } }).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, [refreshKey]);

  return (
    <section className="card">
      <h2>Audit log</h2>
      {error && <p className="error">{error}</p>}
      <ol className="audit">
        {items.map((a) => (
          <li key={a.id}>
            <time>{new Date(a.at).toLocaleTimeString()}</time> <strong>{a.actorEmail}</strong> {a.action}{' '}
            <code>{JSON.stringify(a.changes)}</code>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No changes yet</li>}
      </ol>
    </section>
  );
}
:::

::: code jsx user-management/client/src/pages/UsersPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useDebounce } from '../useDebounce.js';
import { UserForm } from '../components/UserForm.jsx';
import { AuditLog } from '../components/AuditLog.jsx';

const RANK = { user: 1, manager: 2, admin: 3 };

export function UsersPage() {
  const { user: me, can } = useAuth();
  const [query, setQuery] = useState({ search: '', role: '', status: '', page: 1, limit: 10, sort: 'createdAt:desc' });
  const search = useDebounce(query.search, 300);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);       // { type: 'error' | 'ok', text }
  const [showForm, setShowForm] = useState(false);
  const [auditKey, setAuditKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api('/users', { query: { ...query, search } }));
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [query.role, query.status, query.page, query.limit, query.sort, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const setFilter = (key) => (e) => setQuery((q) => ({ ...q, [key]: e.target.value, page: 1 }));
  const pages = Math.max(1, Math.ceil(data.total / query.limit));

  // Mirrors the server rules so we don't show buttons that would fail with 403
  const canEdit = (u) => can('users:write') && u.id !== me.id && (me.role === 'admin' || RANK[u.role] < RANK[me.role]);

  const update = async (u, patch) => {
    setMessage(null);
    try {
      const { user } = await api(`/users/${u.id}`, { method: 'PATCH', body: { ...patch, version: u.version } });
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === user.id ? user : x)) }));
      setMessage({ type: 'ok', text: `Updated ${user.email}` });
      setAuditKey((k) => k + 1);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      if (err.status === 409) load();                  // someone else changed it → show fresh data
    }
  };

  const deactivate = async (u) => {
    if (!window.confirm(`Deactivate ${u.email}?`)) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      setMessage({ type: 'ok', text: `Deactivated ${u.email}` });
      setAuditKey((k) => k + 1);
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="layout">
      <section className="card">
        <div className="toolbar">
          <input type="search" aria-label="Search users" placeholder="Search name or email…" value={query.search} onChange={setFilter('search')} />
          <select aria-label="Filter by role" value={query.role} onChange={setFilter('role')}>
            <option value="">All roles</option><option value="admin">admin</option><option value="manager">manager</option><option value="user">user</option>
          </select>
          <select aria-label="Filter by status" value={query.status} onChange={setFilter('status')}>
            <option value="">Any status</option><option value="active">active</option><option value="deactivated">deactivated</option>
          </select>
          <select aria-label="Sort" value={query.sort} onChange={setFilter('sort')}>
            <option value="createdAt:desc">Newest</option><option value="name:asc">Name A→Z</option><option value="email:asc">Email A→Z</option>
          </select>
          {can('users:write') && <button type="button" className="primary" onClick={() => setShowForm(true)}>+ Add user</button>}
        </div>

        {message && <p className={message.type === 'error' ? 'error' : 'ok'} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        {showForm && (
          <UserForm
            onCancel={() => setShowForm(false)}
            onCreated={(u) => { setShowForm(false); setMessage({ type: 'ok', text: `Created ${u.email}` }); setAuditKey((k) => k + 1); load(); }}
          />
        )}

        <table aria-busy={loading}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me.id && ' (you)'}</td>
                <td>{u.email}</td>
                <td>
                  {canEdit(u) ? (
                    <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                      {(me.role === 'admin' ? ['user', 'manager', 'admin'] : ['user']).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : u.role}
                </td>
                <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                <td>
                  {canEdit(u) && u.status === 'deactivated' && <button type="button" onClick={() => update(u, { status: 'active' })}>Reactivate</button>}
                  {can('users:delete') && u.id !== me.id && u.status === 'active' && <button type="button" className="danger" onClick={() => deactivate(u)}>Deactivate</button>}
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && <tr><td colSpan={5} className="muted">No users match</td></tr>}
          </tbody>
        </table>

        <div className="pager">
          <button type="button" disabled={query.page <= 1} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>‹ Prev</button>
          <span>Page {query.page} of {pages} · {data.total} users</span>
          <button type="button" disabled={query.page >= pages} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>Next ›</button>
        </div>
      </section>
      {can('audit:read') && <AuditLog refreshKey={auditKey} />}
    </div>
  );
}
:::

::: code jsx user-management/client/src/App.jsx
import { useAuth } from './AuthContext.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';

export default function App() {
  const { user, logout, can } = useAuth();
  if (!user) return <main className="page"><LoginPage /></main>;
  return (
    <main className="page">
      <header className="top">
        <h1>User management</h1>
        <span>{user.name} · <strong>{user.role}</strong></span>
        <button type="button" onClick={logout}>Log out</button>
      </header>
      {can('users:read') ? (
        <UsersPage />
      ) : (
        <section className="card">
          <h2>My profile</h2>
          <p>{user.name} ({user.email})</p>
          <p className="muted">Your role ({user.role}) cannot manage other users.</p>
        </section>
      )}
    </main>
  );
}
:::

::: code jsx user-management/client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
:::

::: code css user-management/client/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.top { display: flex; gap: 16px; align-items: center; }
.top h1 { flex: 1; margin: 0; font-size: 22px; }
.layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; margin-top: 16px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 16px; }
.login { max-width: 380px; margin: 60px auto; display: flex; flex-direction: column; gap: 8px; }
.toolbar, .row, .pager { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pager { justify-content: flex-end; margin-top: 12px; }
input, select, button { font: inherit; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; }
button { cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.danger { background: #fff; border-color: #dc2626; color: #b91c1c; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; }
table[aria-busy='true'] tbody { opacity: 0.5; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.badge.active { background: #d1fae5; color: #065f46; }
.badge.deactivated { background: #fee2e2; color: #991b1b; }
.user-form { margin-top: 12px; display: grid; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.error { color: #b91c1c; font-size: 14px; }
.ok { color: #047857; font-size: 14px; }
.muted { color: #64748b; font-size: 14px; }
.audit { padding-left: 18px; font-size: 13px; display: grid; gap: 6px; }
.audit code { font-size: 11px; word-break: break-all; }
@media (prefers-color-scheme: dark) {
  body { background: #0b1020; color: #e2e8f0; }
  .card, input, select, button { background: #111827; border-color: #273449; }
  th, td { border-color: #273449; }
}
:::

::: code dockerfile user-management/Dockerfile
# 1) Build the React client
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2) Run the API, which also serves client/dist
FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4300
EXPOSE 4300
USER node
CMD ["node", "src/index.js"]
:::

::: code yaml user-management/docker-compose.yml
# docker compose up -d --build   →   http://localhost:4300
services:
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      retries: 20

  app:
    build: .
    ports:
      - "4300:4300"
    environment:
      MONGO_URL: mongodb://mongo:27017/user_management
      TOKEN_SECRET: ${TOKEN_SECRET:-dev-only-change-me}   # set a long random value in production
    depends_on:
      mongo:
        condition: service_healthy

volumes:
  mongo_data:
:::

::: code javascript Browser simulation: RBAC rules and optimistic locking (runnable)
// The UserService rules + a versioned in-memory store, tested without Express.
const RANK = { user: 1, manager: 2, admin: 3 };
const PERMS = { admin: ['users:read', 'users:write', 'users:delete', 'audit:read'], manager: ['users:read', 'users:write'], user: [] };
const can = (role, p) => PERMS[role].includes(p);
function assertCanManage(actor, target, patch = {}) {
  if (target && actor.role !== 'admin' && RANK[target.role] >= RANK[actor.role]) throw new Error('403 lower roles only');
  if (patch.role && RANK[patch.role] >= RANK[actor.role] && actor.role !== 'admin') throw new Error(`403 only admins assign ${patch.role}`);
  if (target && target.id === actor.id && (patch.role || patch.status)) throw new Error('403 own role/status');
}
const db = new Map();
const update = (id, patch, version) => { const u = db.get(id); if (u.version !== version) return null; Object.assign(u, patch, { version: u.version + 1 }); return { ...u }; };
const tryIt = (fn) => { try { fn(); return 'allowed'; } catch (e) { return e.message; } };

// ---------- tests ----------
const admin = { id: 'a', role: 'admin' }, manager = { id: 'm', role: 'manager' }, bob = { id: 'b', role: 'user' };
[admin, manager, bob].forEach((u) => db.set(u.id, { ...u, version: 1 }));
console.log('manager has users:write, not users:delete →', can('manager', 'users:write') && !can('manager', 'users:delete') ? '✅' : '❌ FAIL');
console.log('manager edits a user →', tryIt(() => assertCanManage(manager, bob, { status: 'deactivated' })), tryIt(() => assertCanManage(manager, bob, { status: 'deactivated' })) === 'allowed' ? '✅' : '❌ FAIL');
console.log('manager promotes to manager →', tryIt(() => assertCanManage(manager, bob, { role: 'manager' })), tryIt(() => assertCanManage(manager, bob, { role: 'manager' })).startsWith('403') ? '✅' : '❌ FAIL');
console.log('manager edits another manager →', tryIt(() => assertCanManage(manager, { id: 'm2', role: 'manager' }, { name: 'x' })), tryIt(() => assertCanManage(manager, { id: 'm2', role: 'manager' }, {})).startsWith('403') ? '✅' : '❌ FAIL');
console.log('manager edits an admin →', tryIt(() => assertCanManage(manager, admin, { name: 'x' })), tryIt(() => assertCanManage(manager, admin, {})).startsWith('403') ? '✅' : '❌ FAIL');
console.log('admin demotes self →', tryIt(() => assertCanManage(admin, admin, { role: 'user' })), tryIt(() => assertCanManage(admin, admin, { role: 'user' })).startsWith('403') ? '✅' : '❌ FAIL');
const seenByA = db.get('b').version, seenByB = db.get('b').version;      // both admins loaded version 1
const first = update('b', { role: 'manager' }, seenByA);
const second = update('b', { status: 'deactivated' }, seenByB);
console.log('first PATCH wins (version 2) →', first && first.version === 2 ? '✅' : '❌ FAIL');
console.log('second PATCH with stale version → 409 (null) →', second === null && db.get('b').status === undefined ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
**Option A: local, no database (in-memory)**
1. `cd user-management/server && npm install && npm run dev` → "🧠 Using in-memory storage", "🌱 Seeded demo users", "🚀 API on http://localhost:4300".
2. In a second terminal: `cd user-management/client && npm install && npm run dev` → open `http://localhost:5173` and sign in as admin.

**Option B: Docker Compose with MongoDB (production-like)**
`cd user-management && docker compose up -d --build` → open `http://localhost:4300` (the API serves the built React app).

**API with curl** (Option A or B):
`TOKEN=$(curl -s -X POST localhost:4300/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"Admin123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")`
`curl -s "localhost:4300/api/users?search=member&role=manager&limit=2" -H "Authorization: Bearer $TOKEN"` → `{"items":[…2 managers…],"total":4,"page":1,"limit":2}`
`curl -s -X POST localhost:4300/api/users -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"email":"new@example.com","name":"New Person","role":"user","password":"Welcome123"}'` → **201** `{"user":{"id":"…","version":1,…}}`
Same request again → **409** `{"error":{"code":"CONFLICT","message":"A user with this email already exists","details":{"email":"Already in use"}}}`
`curl -s -X PATCH localhost:4300/api/users/<id> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"role":"manager","version":1}'` → 200 with `"version":2`; repeat with `"version":1` → **409** "changed by someone else".
Log in as `manager@example.com` and `DELETE /api/users/<id>` → **403** `Missing permission users:delete`.
`curl -s localhost:4300/api/audit -H "Authorization: Bearer $TOKEN"` → the create and update entries with `from`/`to` changes.

**In the UI**: search "member" (debounced), filter by role, page through 25 users; as admin change a role inline (audit log updates); open two tabs, change the same user in both → the second shows the 409 message and reloads fresh data; sign in as manager → no Deactivate buttons, role dropdown only offers `user`; sign in as user → "cannot manage other users".
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Authorization model | **RBAC** (roles → permissions) | ABAC / policies (attributes: department, owner, time) | RBAC + a few explicit rules in the service; policy engine (OPA, Cedar, Casbin) when rules explode |
| Concurrency | Last write wins | **Optimistic locking** (`version`, 409) | Optimistic for admin UIs (rare conflicts); pessimistic locks only for long workflows |
| Delete | Hard delete | **Soft delete** + audit | Soft delete; hard delete/anonymise for GDPR requests |
| Pagination | **Offset** (`page`) | Cursor (`after=id`) | Offset for admin tables with page numbers; cursor for huge or live lists |
| Token storage (client) | **Memory** (this demo: reload = login) | httpOnly refresh cookie (see Auth frontend design) | Memory + refresh cookie in production |
| Identity | Own users table | **IdP** (Auth0, Cognito, Okta) + SCIM | IdP for enterprise customers (SSO, MFA, provisioning) |
:::

::: text 📈 Scaling & edge cases
- **10×–100× users**: indexes on `email` (unique) and `role,status,createdAt`; text index or a search engine for name search; cursor pagination; cache permission lookups.
- **Multi-tenant**: `tenantId` on every document and in every query (enforced in the repository), per-tenant admins, row-level security.
- **Security**: rate-limit login, lockout/MFA, re-check the user on every request (done: deactivation is immediate), audit log append-only and shipped to a separate store, never return `passwordHash`.
- **Edge cases**: last admin can't be demoted/deactivated (add a count check), email case/whitespace (normalised), concurrent creates of the same email (unique index decides), deactivated user with an unexpired token (rejected by `requireAuth`).
:::

::: warning ⚠️ Common mistakes
- Checking permissions only in the UI (hidden button ≠ security).
- Trusting the role inside the token after it changed; always load the current user/role.
- Lost updates when two admins edit the same record (no version check).
- Returning `passwordHash` or internal Mongo `_id` fields in API responses.
- Hard-deleting users and breaking references in orders, audit logs and comments.
:::

::: understand
- **Permissions** answer "can this role do this action?"; **business rules** answer "can *this* actor do it to *this* target?" (hierarchy, self-protection). Put the first in middleware and the second in the service.
- The repository interface lets you run the same service with memory (tests, demos) or MongoDB (production): dependency injection without a framework.
:::

::: important ⭐ How to present this design in 5 minutes
> "I'd clarify scale, tenancy and role flexibility first. The backend is layered: routes with requireAuth and requirePermission middleware, controllers that validate input, a UserService with the business rules, and repositories with one interface for memory and MongoDB. Roles map to permissions like users:read and users:delete; the service adds hierarchy rules: managers only manage regular users and can't grant elevated roles, and nobody changes their own role. Every user has a version; PATCH must send it and the repository updates where id and version match, otherwise 409, so concurrent admin edits don't overwrite each other. Deletes are soft, every change writes an audit entry with from/to values. The list endpoint supports search, filters, sort and pagination backed by indexes. The React admin uses a permission-aware UI, debounced search, inline edits and handles 409 by reloading. It ships as one Docker image serving API and client, with MongoDB in Compose."
:::

::: links
OWASP: Authorization Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
OWASP: Password Storage Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
MongoDB: Unique indexes | https://www.mongodb.com/docs/manual/core/index-unique/
MDN: HTTP 409 Conflict | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409
:::

=== Design a Product Management System (catalog + admin)
@p 3
@tags lld, full-stack, products, catalog
@quick
- Money as **integer cents** (`priceCents`), never floats; **SKU** and **slug** unique (DB indexes decide races).
- Listing API: search + filters (category, price range, in stock) + sort + **cursor pagination** (`nextCursor` = last sort value + id) → stable "Load more" even while products are added.
- **Atomic stock updates**: `update where stock >= qty, $inc -qty` → no overselling without locks; insufficient stock → 409.
- **Caching**: `ETag` on product detail (`304 Not Modified`), category counts via aggregation; CDN/Redis at scale.
- Frontend: filters synced to the **URL** (shareable, back button works), product grid with "Load more", admin form (price entered in dollars → cents), stock +/- and archive.

::: text 🧒 In simple words
This is the **back office and shop window of an online store** (think Shopify admin + storefront). Shop staff add products with a price, SKU, category and stock; customers browse, filter by category and price, sort and load more. The interesting engineering is in the details: prices must never become 19.990000001, two customers buying the last item at the same moment must not both succeed, and "Load more" must not skip or repeat products when new ones are added.
:::

::: text 📋 Requirements
### Functional
- Public catalog: search by name/SKU, filter by category, price range and in-stock, sort (newest, price ↑/↓, name), "Load more".
- Product detail by id or slug.
- Admin (API key): create, edit, archive products; adjust stock with a reason; see drafts/archived.
- Category list with product counts.

### Non-functional
- No overselling under concurrent stock changes; no lost updates on edits (version check).
- Fast listing with indexes; detail responses cacheable (ETag).
- Runs in-memory with zero setup, or with MongoDB through Docker Compose.

### Assumptions
- Admin auth is a simple API key header (`x-api-key`) to keep the focus on catalog design (see the User Management design for real login + RBAC).
- Express 4 API on port 4400, React + Vite client; 40 demo products are seeded.
:::

::: ask
- *"How many products and how many variants (size/colour) per product?"* (Variants → separate SKU table.)
- *"Multi-currency or price lists per customer?"*
- *"Search quality: typo tolerance, facets?"* (Elasticsearch/Algolia/Atlas Search.)
- *"Is stock reserved at add-to-cart or at payment?"*
- *"Who edits products: one admin or many staff in parallel?"*
:::

::: diagram Architecture and classes
flowchart LR
  subgraph Client["React client"]
    CP["CatalogPage (URL state)"] --> F["Filters"]
    CP --> PC["ProductCard grid + Load more"]
    AP["AdminPage"] --> PF["ProductForm"]
    CP --> API["api.js"]
    AP --> API
  end
  API -->|"/api"| R["routes"]
  subgraph Server["Express API"]
    R --> AK["requireAdminKey (writes)"]
    R --> PCtl["ProductController"]
    AK --> PCtl
    PCtl --> PS["ProductService (slug, cursor, stock, versions)"]
    PS --> PR["ProductRepository"]
    PR --> MEM["memory"]
    PR --> MDB["MongoDB (indexes, aggregation)"]
  end
:::

::: diagram ER model
erDiagram
  CATEGORY ||--o{ PRODUCT : "groups"
  PRODUCT ||--o{ STOCK_MOVEMENT : "has"
  PRODUCT {
    string id PK
    string sku UK
    string slug UK
    string name
    string description
    string category FK
    int priceCents
    int stock
    string status "draft, active, archived"
    int version
    date createdAt
  }
  STOCK_MOVEMENT {
    string id PK
    string productId FK
    int delta
    string reason
    int stockAfter
    date at
  }
  CATEGORY {
    string name PK
  }
:::

::: diagram Sequence: two buyers race for the last unit
sequenceDiagram
  participant A as Checkout A
  participant B as Checkout B
  participant API as Express API
  participant DB as Repository
  Note over DB: stock = 1
  A->>API: POST /products/p1/stock delta -1
  B->>API: POST /products/p1/stock delta -1
  API->>DB: update where id p1 and stock >= 1, inc stock -1
  DB-->>API: matched, stock 0
  API-->>A: 200 stock 0
  API->>DB: update where id p1 and stock >= 1, inc stock -1
  DB-->>API: no match
  API-->>B: 409 Insufficient stock
:::

::: image Product management: URL-driven catalog, admin form, service with cursor pagination and atomic stock
/images/fullstack-lld/product-management.svg
:::

::: text 🧱 Design
### API contract
| Method | Path | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/products` | public | `search, category, minPrice, maxPrice (dollars), inStock=true, sort=newest\|price_asc\|price_desc\|name_asc, limit, cursor, status` | 200 `{ items, nextCursor }` | 400 bad cursor/filter |
| GET | `/api/products/:idOrSlug` | public | `If-None-Match` | 200 + `ETag` / **304** | 404 |
| GET | `/api/categories` | public | | 200 `[{ category, count }]` | |
| POST | `/api/products` | `x-api-key` | `{ name, sku, category, priceCents, stock, description?, status? }` | 201 | 400, 401, 409 SKU |
| PATCH | `/api/products/:id` | `x-api-key` | partial fields + `version` | 200 | 400, 404, **409 version** |
| POST | `/api/products/:id/stock` | `x-api-key` | `{ delta, reason }` | 200 `{ product, movement }` | **409 insufficient** |
| DELETE | `/api/products/:id` | `x-api-key` | | 204 (archived) | 404 |

(`status` other than `active` in listings needs the API key.)

### Cursor pagination
Sort `price_asc` → order by `(priceCents ASC, id ASC)`. The response's `nextCursor` = base64url of `{ v: lastItem.priceCents, id: lastItem.id }`. The next page asks for rows **after** that pair: `priceCents > v OR (priceCents = v AND id > lastId)`. The `id` tie-breaker makes the order total, so no item is skipped or repeated.

### Module responsibilities
| Module | Responsibility |
|---|---|
| `utils/cursor.js` | encode/decode cursors; build the "after" comparison |
| `utils/slug.js` | `"Red Shoes!"` → `red-shoes` |
| `services/product.service.js` | validation results → repository calls; unique slug; versioned updates; stock movements; ETag value |
| `repositories/*.js` | `list(filters, sort, cursor, limit)`, `findByIdOrSlug`, `create`, `update(id, patch, version)`, `adjustStock(id, delta)` (atomic), `categoryCounts()`, `addMovement` |
:::

::: text 📁 Folder structure
`product-management/`
↳ `docker-compose.yml`, `Dockerfile`
↳ `server/package.json`, `server/src/index.js`, `server/src/app.js`, `server/src/config.js`, `server/src/seed.js`
↳ `server/src/utils/errors.js`, `server/src/utils/cursor.js`, `server/src/utils/slug.js`
↳ `server/src/middleware/adminKey.js`, `server/src/validation/product.validation.js`
↳ `server/src/repositories/memory.repository.js`, `server/src/repositories/mongo.repository.js`
↳ `server/src/services/product.service.js`, `server/src/controllers/product.controller.js`, `server/src/routes/index.js`
↳ `client/package.json`, `client/vite.config.js`, `client/index.html`
↳ `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`, `client/src/money.js`, `client/src/useUrlState.js`, `client/src/styles.css`
↳ `client/src/components/Filters.jsx`, `client/src/components/ProductCard.jsx`, `client/src/components/ProductForm.jsx`
↳ `client/src/pages/CatalogPage.jsx`, `client/src/pages/AdminPage.jsx`
:::

::: code json product-management/server/package.json
{
  "name": "product-management-api",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongodb": "^6.8.0"
  }
}
:::

::: code javascript product-management/server/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 4400,
  mongoUrl: process.env.MONGO_URL || '',                       // empty → in-memory
  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',   // set a strong value in production
  seed: process.env.SEED !== 'false',
};
:::

::: code javascript product-management/server/src/utils/errors.js
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, 'BAD_REQUEST', message, details); }
  static unauthorized(message = 'Admin API key required') { return new ApiError(401, 'UNAUTHORIZED', message); }
  static notFound(message = 'Not found') { return new ApiError(404, 'NOT_FOUND', message); }
  static conflict(message, details) { return new ApiError(409, 'CONFLICT', message, details); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') err = ApiError.badRequest('Invalid JSON body');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Something went wrong' : err.message, ...(err.details ? { details: err.details } : {}) },
  });
}

module.exports = { ApiError, asyncHandler, notFoundHandler, errorHandler };
:::

::: code javascript product-management/server/src/utils/cursor.js
// Opaque cursors: base64url(JSON { v: lastSortValue, id: lastId }).
const { ApiError } = require('./errors');

const SORTS = {
  newest: { field: 'createdAt', dir: -1 },
  price_asc: { field: 'priceCents', dir: 1 },
  price_desc: { field: 'priceCents', dir: -1 },
  name_asc: { field: 'name', dir: 1 },
};

const encodeCursor = (item, sort) => Buffer.from(JSON.stringify({ v: item[sort.field], id: item.id })).toString('base64url');

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString());
    if (!value || typeof value.id !== 'string' || !('v' in value)) throw new Error('shape');
    return value;
  } catch {
    throw ApiError.badRequest('Invalid cursor');
  }
}

/** True if `item` comes AFTER the cursor in (field dir, id dir) order. Used by the memory repo. */
function isAfter(item, cursor, sort) {
  const a = item[sort.field];
  if (a !== cursor.v) return sort.dir === 1 ? a > cursor.v : a < cursor.v;
  return sort.dir === 1 ? item.id > cursor.id : item.id < cursor.id;        // tie-breaker on id
}

module.exports = { SORTS, encodeCursor, decodeCursor, isAfter };
:::

::: code javascript product-management/server/src/utils/slug.js
/** "Red Running Shoes (2024)!" → "red-running-shoes-2024" */
function slugify(text) {
  return String(text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product';
}

module.exports = { slugify };
:::

::: code javascript product-management/server/src/middleware/adminKey.js
const crypto = require('crypto');
const { ApiError } = require('../utils/errors');

function isAdmin(req, config) {
  const key = String(req.headers['x-api-key'] || '');
  const expected = config.adminApiKey;
  return key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}

const requireAdminKey = (config) => (req, res, next) => (isAdmin(req, config) ? next() : next(ApiError.unauthorized()));

module.exports = { isAdmin, requireAdminKey };
:::

::: code javascript product-management/server/src/validation/product.validation.js
const { ApiError } = require('../utils/errors');
const { SORTS } = require('../utils/cursor');

const STATUSES = ['draft', 'active', 'archived'];
const SKU = /^[A-Z0-9-]{3,32}$/;
const isInt = (v) => Number.isInteger(v);

function fail(details) {
  if (Object.keys(details).length) throw ApiError.badRequest('Validation failed', details);
}

function checkFields(body, d, { partial }) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) {
    if (!body.name || String(body.name).trim().length < 2) d.name = 'Name must be at least 2 characters';
    else out.name = String(body.name).trim().slice(0, 120);
  }
  if (!partial || has('sku')) {
    const sku = String(body.sku || '').trim().toUpperCase();
    if (!SKU.test(sku)) d.sku = 'SKU: 3-32 letters, digits or dashes';
    else out.sku = sku;
  }
  if (!partial || has('category')) {
    if (!body.category || String(body.category).trim().length < 2) d.category = 'Category is required';
    else out.category = String(body.category).trim().toLowerCase();
  }
  if (!partial || has('priceCents')) {
    if (!isInt(body.priceCents) || body.priceCents < 0 || body.priceCents > 100000000) d.priceCents = 'priceCents must be an integer between 0 and 100000000';
    else out.priceCents = body.priceCents;
  }
  if (!partial || has('stock')) {
    if (!isInt(body.stock) || body.stock < 0) d.stock = 'stock must be a non-negative integer';
    else out.stock = body.stock;
  }
  if (has('description')) out.description = String(body.description).slice(0, 2000);
  if (has('status')) {
    if (!STATUSES.includes(body.status)) d.status = `status must be one of ${STATUSES.join(', ')}`;
    else out.status = body.status;
  }
  return out;
}

function validateCreate(body = {}) {
  const d = {};
  const data = checkFields(body, d, { partial: false });
  fail(d);
  return { description: '', status: 'active', ...data };
}

function validateUpdate(body = {}) {
  const d = {};
  const patch = checkFields(body, d, { partial: true });
  delete patch.stock;                                  // stock only changes through /stock (with a movement record)
  if (!isInt(body.version)) d.version = 'version (integer) is required';
  if (!Object.keys(patch).length && !d.version) d.body = 'Nothing to update';
  fail(d);
  return { patch, version: body.version };
}

function validateList(q = {}, { admin }) {
  const d = {};
  const toCents = (v) => (v === undefined || v === '' ? undefined : Math.round(Number(v) * 100));
  const minPrice = toCents(q.minPrice);
  const maxPrice = toCents(q.maxPrice);
  if (minPrice !== undefined && !(minPrice >= 0)) d.minPrice = 'minPrice must be a number';
  if (maxPrice !== undefined && !(maxPrice >= 0)) d.maxPrice = 'maxPrice must be a number';
  const sortKey = q.sort || 'newest';
  if (!SORTS[sortKey]) d.sort = `sort must be one of ${Object.keys(SORTS).join(', ')}`;
  let status = q.status || 'active';
  if (status !== 'active' && !admin) d.status = 'Only admins can list non-active products';
  if (status !== 'all' && !STATUSES.includes(status)) d.status = 'Unknown status';
  fail(d);
  if (status === 'all') status = '';
  return {
    filters: {
      search: String(q.search || '').trim().slice(0, 100),
      category: q.category ? String(q.category).toLowerCase() : '',
      minPrice, maxPrice,
      inStock: q.inStock === 'true',
      status,
    },
    sort: SORTS[sortKey],
    limit: Math.min(50, Math.max(1, parseInt(q.limit, 10) || 12)),
    cursor: q.cursor || '',
  };
}

function validateStock(body = {}) {
  const d = {};
  if (!isInt(body.delta) || body.delta === 0) d.delta = 'delta must be a non-zero integer';
  if (!body.reason || String(body.reason).trim().length < 3) d.reason = 'reason is required (e.g. "restock", "order #123")';
  fail(d);
  return { delta: body.delta, reason: String(body.reason).trim().slice(0, 200) };
}

module.exports = { validateCreate, validateUpdate, validateList, validateStock };
:::

::: code javascript product-management/server/src/repositories/memory.repository.js
const crypto = require('crypto');
const { isAfter } = require('../utils/cursor');

const clone = (x) => (x ? structuredClone(x) : null);
const duplicate = (field) => Object.assign(new Error(`duplicate ${field}`), { code: 'DUPLICATE', field });

function matches(p, f) {
  const q = f.search.toLowerCase();
  return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
    (!f.category || p.category === f.category) &&
    (f.minPrice === undefined || p.priceCents >= f.minPrice) &&
    (f.maxPrice === undefined || p.priceCents <= f.maxPrice) &&
    (!f.inStock || p.stock > 0) &&
    (!f.status || p.status === f.status);
}

function createMemoryProductRepository() {
  const products = new Map();
  const movements = [];

  const compare = (sort) => (a, b) => {
    const x = a[sort.field], y = b[sort.field];
    if (x !== y) return (x > y ? 1 : -1) * sort.dir;
    return (a.id > b.id ? 1 : -1) * sort.dir;                         // same tie-breaker as the cursor
  };

  return {
    async count() { return products.size; },

    async list({ filters, sort, cursor, limit }) {
      let rows = [...products.values()].filter((p) => matches(p, filters)).sort(compare(sort));
      if (cursor) rows = rows.filter((p) => isAfter(p, cursor, sort));
      return rows.slice(0, limit + 1).map(clone);                       // one extra → "is there a next page?"
    },

    async findByIdOrSlug(key) {
      return clone(products.get(key) || [...products.values()].find((p) => p.slug === key));
    },

    async slugExists(slug) { return [...products.values()].some((p) => p.slug === slug); },

    async create(data) {
      const all = [...products.values()];
      if (all.some((p) => p.sku === data.sku)) throw duplicate('sku');
      if (all.some((p) => p.slug === data.slug)) throw duplicate('slug');
      const now = new Date().toISOString();
      const product = { id: crypto.randomUUID(), version: 1, createdAt: now, updatedAt: now, ...data };
      products.set(product.id, product);
      return clone(product);
    },

    async update(id, patch, version) {
      const p = products.get(id);
      if (!p || p.version !== version) return null;
      if (patch.sku && [...products.values()].some((o) => o.id !== id && o.sku === patch.sku)) throw duplicate('sku');
      Object.assign(p, patch, { version: p.version + 1, updatedAt: new Date().toISOString() });
      return clone(p);
    },

    /** Atomic in Node's single thread: check and change happen in one synchronous step. */
    async adjustStock(id, delta) {
      const p = products.get(id);
      if (!p || p.stock + delta < 0) return null;
      p.stock += delta;
      p.version += 1;
      p.updatedAt = new Date().toISOString();
      return clone(p);
    },

    async addMovement(m) {
      const movement = { id: crypto.randomUUID(), at: new Date().toISOString(), ...m };
      movements.push(movement);
      return movement;
    },

    async categoryCounts() {
      const counts = {};
      for (const p of products.values()) if (p.status === 'active') counts[p.category] = (counts[p.category] || 0) + 1;
      return Object.entries(counts).map(([category, count]) => ({ category, count })).sort((a, b) => a.category.localeCompare(b.category));
    },
  };
}

module.exports = { createMemoryProductRepository };
:::

::: code javascript product-management/server/src/repositories/mongo.repository.js
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strip = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
};

async function createMongoProductRepository(url) {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const col = db.collection('products');
  const movementsCol = db.collection('stock_movements');

  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ sku: 1 }, { unique: true });
  await col.createIndex({ slug: 1 }, { unique: true });
  // compound indexes that match "filter by status/category, sort by X, then id"
  await col.createIndex({ status: 1, category: 1, createdAt: -1, id: -1 });
  await col.createIndex({ status: 1, priceCents: 1, id: 1 });
  await col.createIndex({ status: 1, name: 1, id: 1 });
  await movementsCol.createIndex({ productId: 1, at: -1 });

  function buildFilter(f) {
    const filter = {};
    if (f.search) {
      const rx = new RegExp(escapeRegex(f.search), 'i');
      filter.$or = [{ name: rx }, { sku: rx }];
    }
    if (f.category) filter.category = f.category;
    if (f.status) filter.status = f.status;
    if (f.inStock) filter.stock = { $gt: 0 };
    if (f.minPrice !== undefined || f.maxPrice !== undefined) {
      filter.priceCents = {};
      if (f.minPrice !== undefined) filter.priceCents.$gte = f.minPrice;
      if (f.maxPrice !== undefined) filter.priceCents.$lte = f.maxPrice;
    }
    return filter;
  }

  const wrapDuplicate = (err) => {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return Object.assign(new Error(`duplicate ${field}`), { code: 'DUPLICATE', field });
    }
    return err;
  };

  return {
    async count() { return col.countDocuments(); },

    async list({ filters, sort, cursor, limit }) {
      const filter = buildFilter(filters);
      if (cursor) {
        const op = sort.dir === 1 ? '$gt' : '$lt';
        const after = { $or: [{ [sort.field]: { [op]: cursor.v } }, { [sort.field]: cursor.v, id: { [op]: cursor.id } }] };
        Object.assign(filter, filter.$or ? { $and: [{ $or: filter.$or }, after] } : after);
        if (filter.$and) delete filter.$or;
      }
      const docs = await col.find(filter).sort({ [sort.field]: sort.dir, id: sort.dir }).limit(limit + 1).toArray();
      return docs.map(strip);
    },

    async findByIdOrSlug(key) { return strip(await col.findOne({ $or: [{ id: key }, { slug: key }] })); },
    async slugExists(slug) { return (await col.countDocuments({ slug }, { limit: 1 })) > 0; },

    async create(data) {
      const now = new Date().toISOString();
      const product = { id: crypto.randomUUID(), version: 1, createdAt: now, updatedAt: now, ...data };
      try {
        await col.insertOne({ ...product });
      } catch (err) {
        throw wrapDuplicate(err);
      }
      return product;
    },

    async update(id, patch, version) {
      try {
        return strip(await col.findOneAndUpdate(
          { id, version },
          { $set: { ...patch, updatedAt: new Date().toISOString() }, $inc: { version: 1 } },
          { returnDocument: 'after' },
        ));
      } catch (err) {
        throw wrapDuplicate(err);
      }
    },

    async adjustStock(id, delta) {
      // The condition and the change are ONE atomic operation in MongoDB → no overselling
      return strip(await col.findOneAndUpdate(
        { id, stock: { $gte: Math.max(0, -delta) } },
        { $inc: { stock: delta, version: 1 }, $set: { updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      ));
    },

    async addMovement(m) {
      const movement = { id: crypto.randomUUID(), at: new Date().toISOString(), ...m };
      await movementsCol.insertOne({ ...movement });
      return movement;
    },

    async categoryCounts() {
      const rows = await col.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray();
      return rows.map((r) => ({ category: r._id, count: r.count }));
    },

    close: () => client.close(),
  };
}

module.exports = { createMongoProductRepository };
:::

::: code javascript product-management/server/src/services/product.service.js
const { ApiError } = require('../utils/errors');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const { slugify } = require('../utils/slug');

function createProductService({ repo }) {
  async function uniqueSlug(name) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; await repo.slugExists(slug); n++) slug = `${base}-${n}`;   // red-shoes, red-shoes-2, …
    return slug;
  }

  const conflictFromDuplicate = (err) => (err.code === 'DUPLICATE'
    ? ApiError.conflict(`A product with this ${err.field} already exists`, { [err.field]: 'Already in use' })
    : err);

  return {
    async list({ filters, sort, limit, cursor }) {
      const rows = await repo.list({ filters, sort, limit, cursor: decodeCursor(cursor) });
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1], sort) : null };
    },

    async get(idOrSlug, { admin }) {
      const product = await repo.findByIdOrSlug(idOrSlug);
      if (!product || (product.status !== 'active' && !admin)) throw ApiError.notFound('Product not found');
      return product;
    },

    etag: (product) => `W/"${product.id}-${product.version}"`,

    async create(data) {
      try {
        return await repo.create({ ...data, slug: await uniqueSlug(data.name) });
      } catch (err) {
        throw conflictFromDuplicate(err);
      }
    },

    async update(id, { patch, version }) {
      const current = await repo.findByIdOrSlug(id);
      if (!current || current.id !== id) throw ApiError.notFound('Product not found');
      if (patch.name && patch.name !== current.name) patch.slug = await uniqueSlug(patch.name);
      let updated;
      try {
        updated = await repo.update(id, patch, version);
      } catch (err) {
        throw conflictFromDuplicate(err);
      }
      if (!updated) throw ApiError.conflict('Product was changed by someone else. Reload and try again.', { currentVersion: current.version });
      return updated;
    },

    async adjustStock(id, { delta, reason }) {
      const updated = await repo.adjustStock(id, delta);
      if (!updated) {
        const current = await repo.findByIdOrSlug(id);
        if (!current || current.id !== id) throw ApiError.notFound('Product not found');
        throw ApiError.conflict('Insufficient stock', { available: current.stock, requested: -delta });
      }
      const movement = await repo.addMovement({ productId: id, delta, reason, stockAfter: updated.stock });
      return { product: updated, movement };
    },

    async archive(id) {
      const current = await repo.findByIdOrSlug(id);
      if (!current || current.id !== id) throw ApiError.notFound('Product not found');
      if (current.status !== 'archived') await repo.update(id, { status: 'archived' }, current.version);
    },

    categories: () => repo.categoryCounts(),
  };
}

module.exports = { createProductService };
:::

::: code javascript product-management/server/src/controllers/product.controller.js
const { asyncHandler } = require('../utils/errors');
const { isAdmin } = require('../middleware/adminKey');
const v = require('../validation/product.validation');

function createProductController({ service, config }) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(await service.list(v.validateList(req.query, { admin: isAdmin(req, config) })));
    }),

    get: asyncHandler(async (req, res) => {
      const admin = isAdmin(req, config);
      const product = await service.get(req.params.idOrSlug, { admin });
      const etag = service.etag(product);
      res.set('ETag', etag);
      res.set('Cache-Control', admin ? 'no-store' : 'public, max-age=0, must-revalidate');
      if (req.headers['if-none-match'] === etag) return res.status(304).end();   // client copy is still fresh
      return res.json({ product });
    }),

    categories: asyncHandler(async (req, res) => res.json(await service.categories())),

    create: asyncHandler(async (req, res) => {
      const product = await service.create(v.validateCreate(req.body));
      res.status(201).location(`/api/products/${product.id}`).json({ product });
    }),

    update: asyncHandler(async (req, res) => {
      res.json({ product: await service.update(req.params.idOrSlug, v.validateUpdate(req.body)) });
    }),

    stock: asyncHandler(async (req, res) => {
      res.json(await service.adjustStock(req.params.idOrSlug, v.validateStock(req.body)));
    }),

    archive: asyncHandler(async (req, res) => {
      await service.archive(req.params.idOrSlug);
      res.status(204).end();
    }),
  };
}

module.exports = { createProductController };
:::

::: code javascript product-management/server/src/routes/index.js
const express = require('express');
const { requireAdminKey } = require('../middleware/adminKey');

function createRouter({ controller, config }) {
  const router = express.Router();
  const admin = requireAdminKey(config);

  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.get('/categories', controller.categories);
  router.get('/products', controller.list);
  router.get('/products/:idOrSlug', controller.get);
  router.post('/products', admin, controller.create);
  router.patch('/products/:idOrSlug', admin, controller.update);
  router.post('/products/:idOrSlug/stock', admin, controller.stock);
  router.delete('/products/:idOrSlug', admin, controller.archive);
  return router;
}

module.exports = { createRouter };
:::

::: code javascript product-management/server/src/seed.js
// 40 demo products across 4 categories (only when the store is empty).
const NAMES = {
  shoes: ['Trail Runner', 'City Sneaker', 'Hiking Boot', 'Court Classic', 'Slip-On Loafer', 'Rain Boot', 'Sport Sandal', 'Racing Flat', 'Winter Boot', 'Canvas Low'],
  shirts: ['Oxford Shirt', 'Linen Tee', 'Flannel Check', 'Polo Pique', 'Henley Long', 'Graphic Tee', 'Denim Shirt', 'Merino Base', 'Cuban Collar', 'Sport Jersey'],
  bags: ['Daypack 20L', 'Weekender', 'Laptop Sleeve', 'Tote Classic', 'Sling Bag', 'Duffel 40L', 'Messenger', 'Camera Bag', 'Roll-Top', 'Belt Bag'],
  watches: ['Field Watch', 'Dive Watch', 'Chronograph', 'Smart Band', 'Dress Watch', 'Pilot Watch', 'GMT Traveller', 'Digital Retro', 'Solar Sport', 'Minimalist'],
};

async function seedProducts(service, repo) {
  if ((await repo.count()) > 0) return false;
  let i = 0;
  for (const [category, names] of Object.entries(NAMES)) {
    for (const name of names) {
      i += 1;
      await service.create({
        name,
        sku: `${category.slice(0, 3).toUpperCase()}-${String(i).padStart(3, '0')}`,
        category,
        priceCents: 1500 + ((i * 3779) % 18000),        // deterministic "random" prices $15–$195
        stock: i % 7 === 0 ? 0 : (i * 13) % 40,
        description: `${name}: demo product number ${i}.`,
        status: i % 13 === 0 ? 'draft' : 'active',
      });
    }
  }
  return true;
}

module.exports = { seedProducts };
:::

::: code javascript product-management/server/src/app.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createProductService } = require('./services/product.service');
const { createProductController } = require('./controllers/product.controller');
const { createRouter } = require('./routes');
const { notFoundHandler, errorHandler } = require('./utils/errors');

function createApp({ repo, config }) {
  const service = createProductService({ repo });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createRouter({ controller: createProductController({ service, config }), config }));
  app.use('/api', notFoundHandler);

  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return { app, service };
}

module.exports = { createApp };
:::

::: code javascript product-management/server/src/index.js
const config = require('./config');
const { createApp } = require('./app');
const { createMemoryProductRepository } = require('./repositories/memory.repository');
const { createMongoProductRepository } = require('./repositories/mongo.repository');
const { seedProducts } = require('./seed');

async function main() {
  const repo = config.mongoUrl ? await createMongoProductRepository(config.mongoUrl) : createMemoryProductRepository();
  console.log(config.mongoUrl ? '🗄️  Using MongoDB' : '🧠 Using in-memory storage (set MONGO_URL to use MongoDB)');
  const { app, service } = createApp({ repo, config });
  if (config.seed && (await seedProducts(service, repo))) console.log('🌱 Seeded 40 demo products');
  const server = app.listen(config.port, () => console.log(`🚀 API on http://localhost:${config.port}`));
  const shutdown = () => server.close(async () => { await repo.close?.(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
:::

::: code json product-management/client/package.json
{
  "name": "product-management-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript product-management/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4400' } },
});
:::

::: code html product-management/client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Product Catalog</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript product-management/client/src/api.js
let adminKey = '';
export const setAdminKey = (key) => { adminKey = key; };
export const hasAdminKey = () => Boolean(adminKey);

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.details = body?.error?.details;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const params = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false)) : null;
  const res = await fetch(`/api${path}${params && [...params].length ? `?${params}` : ''}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminKey ? { 'x-api-key': adminKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
:::

::: code javascript product-management/client/src/money.js
// Money is stored as integer cents; convert only at the edges (input and display).
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatCents = (cents) => formatter.format(cents / 100);

/** "19.99" → 1999; returns NaN for invalid input. Avoids 19.99 * 100 = 1998.9999999999998 */
export function parseDollarsToCents(text) {
  const match = String(text).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return NaN;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
:::

::: code javascript product-management/client/src/useUrlState.js
// Filters live in the URL query string: shareable links + back/forward buttons work.
import { useCallback, useEffect, useState } from 'react';

const read = (defaults) => {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, params.get(k) ?? v]));
};

export function useUrlState(defaults) {
  const [state, setState] = useState(() => read(defaults));

  useEffect(() => {
    const onPop = () => setState(read(defaults));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const params = new URLSearchParams(Object.entries(next).filter(([k, v]) => v !== '' && v !== defaults[k]));
      const qs = params.toString();
      window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [state, update];
}
:::

::: code jsx product-management/client/src/components/Filters.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function Filters({ value, onChange }) {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(value.search);

  useEffect(() => { api('/categories').then(setCategories).catch(() => {}); }, []);
  useEffect(() => {                                                // debounce typing → URL
    const t = setTimeout(() => { if (search !== value.search) onChange({ search }); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="filters" aria-label="Filters">
      <label htmlFor="f-search">Search</label>
      <input id="f-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" />

      <fieldset>
        <legend>Category</legend>
        <label><input type="radio" name="cat" checked={!value.category} onChange={() => onChange({ category: '' })} /> All</label>
        {categories.map((c) => (
          <label key={c.category}>
            <input type="radio" name="cat" checked={value.category === c.category} onChange={() => onChange({ category: c.category })} /> {c.category} ({c.count})
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Price ($)</legend>
        <div className="row">
          <input aria-label="Minimum price" inputMode="decimal" value={value.minPrice} onChange={(e) => onChange({ minPrice: e.target.value })} placeholder="min" />
          <input aria-label="Maximum price" inputMode="decimal" value={value.maxPrice} onChange={(e) => onChange({ maxPrice: e.target.value })} placeholder="max" />
        </div>
      </fieldset>

      <label><input type="checkbox" checked={value.inStock === 'true'} onChange={(e) => onChange({ inStock: e.target.checked ? 'true' : '' })} /> In stock only</label>

      <label htmlFor="f-sort">Sort by</label>
      <select id="f-sort" value={value.sort} onChange={(e) => onChange({ sort: e.target.value })}>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="name_asc">Name</option>
      </select>
    </aside>
  );
}
:::

::: code jsx product-management/client/src/components/ProductCard.jsx
import { formatCents } from '../money.js';

export function ProductCard({ product, admin, onStock, onEdit, onArchive }) {
  return (
    <article className="product" aria-label={product.name}>
      <div className="thumb" aria-hidden="true">{product.name.slice(0, 1)}</div>
      <h3>{product.name}</h3>
      <p className="muted">{product.category} · {product.sku}</p>
      <p className="price">{formatCents(product.priceCents)}</p>
      <p className={product.stock > 0 ? 'stock' : 'stock out'}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</p>
      {product.status !== 'active' && <span className="badge">{product.status}</span>}
      {admin && (
        <div className="row">
          <button type="button" onClick={() => onStock(product, 1)} aria-label={`Add one ${product.name}`}>+1</button>
          <button type="button" onClick={() => onStock(product, -1)} aria-label={`Remove one ${product.name}`} disabled={product.stock === 0}>−1</button>
          <button type="button" onClick={() => onEdit(product)}>Edit</button>
          {product.status !== 'archived' && <button type="button" className="danger" onClick={() => onArchive(product)}>Archive</button>}
        </div>
      )}
    </article>
  );
}
:::

::: code jsx product-management/client/src/components/ProductForm.jsx
import { useState } from 'react';
import { api } from '../api.js';
import { parseDollarsToCents } from '../money.js';

/** Create (no product) or edit (product given, sends its version). */
export function ProductForm({ product, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    category: product?.category || '',
    price: product ? (product.priceCents / 100).toFixed(2) : '',
    stock: product ? String(product.stock) : '0',
    status: product?.status || 'active',
    description: product?.description || '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const priceCents = parseDollarsToCents(form.price);
    if (Number.isNaN(priceCents)) return setErrors({ priceCents: 'Enter a price like 19.99' });
    const body = { name: form.name, sku: form.sku, category: form.category, priceCents, status: form.status, description: form.description };
    try {
      const result = product
        ? await api(`/products/${product.id}`, { method: 'PATCH', body: { ...body, version: product.version } })
        : await api('/products', { method: 'POST', body: { ...body, stock: Number(form.stock) } });
      onSaved(result.product);
    } catch (err) {
      setErrors(err.details || { form: err.message });
    }
    return undefined;
  };

  const input = (key, label, errorKey = key, props = {}) => (
    <div className="field">
      <label htmlFor={`pf-${key}`}>{label}</label>
      <input id={`pf-${key}`} value={form[key]} onChange={set(key)} aria-invalid={errors[errorKey] ? true : undefined} {...props} />
      {errors[errorKey] && <span className="error">{errors[errorKey]}</span>}
    </div>
  );

  return (
    <form className="card form" onSubmit={onSubmit} aria-label={product ? 'Edit product' : 'New product'}>
      <h2>{product ? `Edit ${product.name}` : 'New product'}</h2>
      {input('name', 'Name')}
      {input('sku', 'SKU')}
      {input('category', 'Category')}
      {input('price', 'Price ($)', 'priceCents', { inputMode: 'decimal' })}
      {!product && input('stock', 'Initial stock', 'stock', { type: 'number', min: 0 })}
      <div className="field">
        <label htmlFor="pf-status">Status</label>
        <select id="pf-status" value={form.status} onChange={set('status')}>
          <option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option>
        </select>
      </div>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
      <div className="row">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary">Save</button>
      </div>
    </form>
  );
}
:::

::: code jsx product-management/client/src/pages/CatalogPage.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useUrlState } from '../useUrlState.js';
import { Filters } from '../components/Filters.jsx';
import { ProductCard } from '../components/ProductCard.jsx';
import { ProductForm } from '../components/ProductForm.jsx';

const DEFAULTS = { search: '', category: '', minPrice: '', maxPrice: '', inStock: '', sort: 'newest', status: 'active' };

export function CatalogPage({ admin }) {
  const [filters, setFilters] = useUrlState(DEFAULTS);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);           // null | 'new' | product
  const requestId = useRef(0);

  const load = useCallback(async (cursor) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await api('/products', { query: { ...filters, limit: 12, cursor } });
      if (id !== requestId.current) return;                // a newer filter change won
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
      setMessage('');
    } catch (err) {
      if (id === requestId.current) setMessage(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(null); }, [load]);                 // filters changed → first page

  const replace = (p) => setItems((list) => list.map((x) => (x.id === p.id ? p : x)));

  const onStock = async (product, delta) => {
    try {
      const { product: updated } = await api(`/products/${product.id}/stock`, { method: 'POST', body: { delta, reason: delta > 0 ? 'manual restock' : 'manual correction' } });
      replace(updated);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onArchive = async (product) => {
    await api(`/products/${product.id}`, { method: 'DELETE' });
    setMessage(`Archived ${product.name}`);
    load(null);
  };

  return (
    <div className="catalog">
      <Filters value={filters} onChange={(patch) => setFilters(patch)} />
      <section aria-label="Products" aria-busy={loading}>
        {admin && (
          <div className="row admin-bar">
            <button type="button" className="primary" onClick={() => setEditing('new')}>+ New product</button>
            <label>Show <select aria-label="Status filter" value={filters.status} onChange={(e) => setFilters({ status: e.target.value })}>
              <option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option><option value="all">all</option>
            </select></label>
          </div>
        )}
        {editing && (
          <ProductForm
            product={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(p) => { setEditing(null); setMessage(`Saved ${p.name}`); load(null); }}
          />
        )}
        {message && <p className="notice" role="status">{message}</p>}
        <div className="grid">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} admin={admin} onStock={onStock} onEdit={setEditing} onArchive={onArchive} />
          ))}
        </div>
        {!loading && items.length === 0 && <p className="muted">No products match these filters.</p>}
        {nextCursor && (
          <button type="button" className="more" onClick={() => load(nextCursor)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </div>
  );
}
:::

::: code jsx product-management/client/src/pages/AdminPage.jsx
import { useState } from 'react';
import { setAdminKey } from '../api.js';

/** Unlocks admin mode by keeping the API key in memory (demo-only auth). */
export function AdminPage({ onUnlocked }) {
  const [key, setKey] = useState('dev-admin-key');
  return (
    <form className="card admin-login" onSubmit={(e) => { e.preventDefault(); setAdminKey(key); onUnlocked(); }}>
      <label htmlFor="admin-key">Admin API key</label>
      <input id="admin-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
      <button type="submit" className="primary">Enter admin mode</button>
    </form>
  );
}
:::

::: code jsx product-management/client/src/App.jsx
import { useState } from 'react';
import { CatalogPage } from './pages/CatalogPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { setAdminKey } from './api.js';

export default function App() {
  const [admin, setAdmin] = useState(false);
  const [askKey, setAskKey] = useState(false);
  return (
    <main className="page">
      <header className="top">
        <h1>🛍️ Catalog</h1>
        {admin ? (
          <button type="button" onClick={() => { setAdminKey(''); setAdmin(false); }}>Exit admin</button>
        ) : (
          <button type="button" onClick={() => setAskKey((v) => !v)}>Admin</button>
        )}
      </header>
      {askKey && !admin && <AdminPage onUnlocked={() => { setAdmin(true); setAskKey(false); }} />}
      <CatalogPage key={admin ? 'admin' : 'public'} admin={admin} />
    </main>
  );
}
:::

::: code jsx product-management/client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code css product-management/client/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 1200px; margin: 0 auto; padding: 20px 16px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.catalog { display: grid; grid-template-columns: 240px 1fr; gap: 20px; }
@media (max-width: 760px) { .catalog { grid-template-columns: 1fr; } }
.filters { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 14px; align-self: start; }
.filters fieldset { border: 0; padding: 0; margin: 6px 0; display: flex; flex-direction: column; gap: 4px; }
.filters legend { font-weight: 600; margin-bottom: 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.product { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.product h3 { margin: 6px 0 0; font-size: 16px; }
.thumb { height: 90px; border-radius: 8px; background: linear-gradient(135deg, #e0e7ff, #fce7f3); display: grid; place-items: center; font-size: 36px; color: #6366f1; font-weight: 700; }
.price { font-weight: 700; font-size: 18px; margin: 0; }
.stock { color: #047857; margin: 0; font-size: 13px; }
.stock.out { color: #b91c1c; }
.badge { align-self: start; background: #fef3c7; color: #92400e; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.form, .admin-login { display: grid; gap: 8px; max-width: 420px; }
.field { display: flex; flex-direction: column; gap: 4px; }
input, select, button { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; }
button { cursor: pointer; }
button:disabled { opacity: 0.5; }
.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.danger { color: #b91c1c; border-color: #fca5a5; }
.more { display: block; margin: 18px auto; }
.admin-bar { margin-bottom: 12px; }
.notice { background: #eef2ff; padding: 8px 12px; border-radius: 8px; }
.error { color: #b91c1c; font-size: 13px; }
.muted { color: #64748b; font-size: 13px; margin: 0; }
@media (prefers-color-scheme: dark) {
  body { background: #0b1020; color: #e2e8f0; }
  .filters, .product, .card, input, select, button { background: #111827; border-color: #273449; }
  .notice { background: #1e1b4b; }
}
:::

::: code dockerfile product-management/Dockerfile
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4400
EXPOSE 4400
USER node
CMD ["node", "src/index.js"]
:::

::: code yaml product-management/docker-compose.yml
# docker compose up -d --build   →   http://localhost:4400
services:
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      retries: 20

  app:
    build: .
    ports:
      - "4400:4400"
    environment:
      MONGO_URL: mongodb://mongo:27017/catalog
      ADMIN_API_KEY: ${ADMIN_API_KEY:-dev-admin-key}   # set a long random value in production
    depends_on:
      mongo:
        condition: service_healthy

volumes:
  mongo_data:
:::

::: code javascript Browser simulation: cursor pagination, money and atomic stock (runnable)
// The cursor rule from utils/cursor.js, the cents parser from money.js and the stock rule.
const sort = { field: 'priceCents', dir: 1 };
const isAfter = (item, c) => (item.priceCents !== c.v ? item.priceCents > c.v : item.id > c.id);
const compare = (a, b) => (a.priceCents - b.priceCents) || (a.id > b.id ? 1 : -1);
function page(all, cursor, limit) {
  const rows = all.slice().sort(compare).filter((p) => !cursor || isAfter(p, cursor)).slice(0, limit + 1);
  const items = rows.slice(0, limit);
  return { items, next: rows.length > limit ? { v: items.at(-1).priceCents, id: items.at(-1).id } : null };
}
function parseDollarsToCents(text) { const m = String(text).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/); return m ? Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0')) : NaN; }
let stock = 1;
const adjust = (delta) => (stock + delta < 0 ? null : (stock += delta));    // check + change in one step

// ---------- tests ----------
const products = [['a', 500], ['b', 500], ['c', 500], ['d', 900], ['e', 100]].map(([id, priceCents]) => ({ id, priceCents }));
const p1 = page(products, null, 2);
products.push({ id: 'aa', priceCents: 50 });                                 // inserted before page 2 is requested
const p2 = page(products, p1.next, 2);
const p3 = page(products, p2.next, 2);
const seen = [...p1.items, ...p2.items, ...p3.items].map((p) => p.id).join(',');
console.log('pages with equal prices + insert in between →', seen, seen === 'e,a,b,c,d' && p3.next === null ? '✅' : '❌ FAIL');
console.log('19.99 * 100 in floating point =', 19.99 * 100, '| parse "19.99" →', parseDollarsToCents('19.99'), parseDollarsToCents('19.99') === 1999 ? '✅' : '❌ FAIL');
console.log('"5.5" → 550 and "1.234" rejected', parseDollarsToCents('5.5') === 550 && Number.isNaN(parseDollarsToCents('1.234')) ? '✅' : '❌ FAIL');
const buyerA = adjust(-1), buyerB = adjust(-1);
console.log('last unit: A gets it, B gets 409 →', buyerA, buyerB, buyerA === 0 && buyerB === null && stock === 0 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
**Local (in-memory):** `cd product-management/server && npm install && npm run dev`, then `cd product-management/client && npm install && npm run dev` → `http://localhost:5173`.
**Docker + MongoDB:** `cd product-management && docker compose up -d --build` → `http://localhost:4400`.

**curl**
`curl -s "localhost:4400/api/categories"` → `[{"category":"bags","count":9},{"category":"shirts","count":9},{"category":"shoes","count":10},{"category":"watches","count":9}]` (3 drafts excluded)
`curl -s "localhost:4400/api/products?category=shoes&sort=price_asc&limit=3"` → 3 items + `"nextCursor":"eyJ2Ijo…"`; pass it back with `&cursor=<value>` for the next 3.
`curl -s "localhost:4400/api/products?cursor=garbage"` → **400** `Invalid cursor`.
`curl -si localhost:4400/api/products/trail-runner | grep -i etag` → `ETag: W/"<id>-1"`; repeat with `-H 'If-None-Match: W/"<id>-1"'` → **304 Not Modified**.
`curl -s -X POST localhost:4400/api/products -H 'x-api-key: dev-admin-key' -H 'Content-Type: application/json' -d '{"name":"Trail Runner","sku":"SHO-900","category":"shoes","priceCents":12999,"stock":1}'` → **201** with `"slug":"trail-runner-2"` (slug made unique).
Same SKU again → **409** `A product with this sku already exists`. Without the key → **401**.
Two quick buys of the last unit: `curl -s -X POST localhost:4400/api/products/<id>/stock -H 'x-api-key: dev-admin-key' -H 'Content-Type: application/json' -d '{"delta":-1,"reason":"order 1"}'` → stock 0; again → **409** `{"error":{"code":"CONFLICT","message":"Insufficient stock","details":{"available":0,"requested":1}}}`.

**In the UI:** pick a category and a price range → the URL becomes `?category=bags&minPrice=50`; copy it into a new tab → same results; browser Back restores the previous filters. "Load more" appends the next 12. Click **Admin** (key `dev-admin-key`) → +1/−1 stock, Edit (price typed as `19.99` → stored 1999), Archive, and a status selector for drafts/archived.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Pagination | Offset (`skip`) | **Cursor** (`after` sort value + id) | Cursor for catalogs/feeds (stable, fast at depth); offset when users jump to page N |
| Money | Float dollars | **Integer cents** (or Decimal128) | Integer minor units + currency code |
| Stock | Read-check-write in code | **Atomic conditional update** / DB transaction | Atomic update; reservations with expiry for carts |
| Search | Regex / `$text` | **Search engine** (Atlas Search, Elasticsearch, Algolia) | Regex for small catalogs; engine for typo tolerance, facets, ranking |
| Variants | Columns on product | **Product + SKU/variant table** | Variants table once size/colour exists |
| Caching | None | **ETag + CDN**, Redis for listings | ETag for detail; CDN + short TTL for public listings, purge on update |
:::

::: text 📈 Scaling & edge cases
- **Read-heavy**: CDN caching of public listings and images, Redis cache keyed by the normalised query, read replicas; invalidate on product update events.
- **Indexes** match filter + sort + tie-breaker (done above); watch with `explain()`; avoid unanchored regex on huge collections.
- **Inventory at scale**: per-warehouse stock, reservations (`reserved` vs `available`) with TTL, event-sourced stock movements (we keep a movement log).
- **Edge cases**: price changes while a cart is open (snapshot price in the order), archived product in old orders (soft archive), slug change breaks links (keep old slugs → 301), concurrent edits (version → 409), cursor from a different sort (encode the sort in the cursor or reject).
:::

::: warning ⚠️ Common mistakes
- Storing prices as floats (`19.99 * 3` rounding bugs) or converting with `* 100` on a float.
- `skip(100000)` pagination on big collections (slow) and duplicates/misses when data changes.
- Checking stock with a read, then updating: two requests both see 1 and both succeed.
- Sorting by a non-unique field without a tie-breaker (random order between pages).
- Filters kept only in component state → links can't be shared and Back loses them.
:::

::: understand
- The catalog is a **read-optimised** system with a few **correctness-critical writes** (stock, price). Optimise reads with indexes, cursors and caching; protect writes with atomic updates and versions.
- A cursor is just "where I stopped" in a **total order** (sort field + unique id).
:::

::: important ⭐ How to present this design in 5 minutes
> "Products have a unique SKU and slug, a category, price in integer cents, stock, status and a version. The public listing supports search, category, price range and in-stock filters, four sorts and cursor pagination: the cursor encodes the last sort value and id, and the next page asks for rows after that pair, so it's stable while products change; compound indexes match status, category, sort field and id. Product detail returns an ETag so clients and CDNs get 304s. Admin writes need a key here; edits send the version and get 409 on conflicts. Stock changes go through one endpoint that does an atomic conditional update, stock greater or equal to quantity with an increment, so two buyers can't both take the last unit, and every change writes a stock movement. The React client keeps filters in the URL, debounces search, loads more with the cursor and converts dollars to cents safely."
:::

::: links
MongoDB: findOneAndUpdate | https://www.mongodb.com/docs/manual/reference/method/db.collection.findOneAndUpdate/
Use the Index to Sort Query Results | https://www.mongodb.com/docs/manual/tutorial/sort-results-with-indexes/
Slack Engineering: Evolving API pagination | https://slack.engineering/evolving-api-pagination-at-slack/
MDN: ETag | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag
:::

=== Design a File Upload System (React → API → presigned URL → S3)
@p 3
@tags lld, full-stack, s3, upload
@quick
- The API **never streams file bytes**: it validates metadata, creates a `pending` record and returns a **presigned PUT URL** (5 min, bound to key + Content-Type); the browser uploads **directly to S3**.
- After the upload the client calls **`/complete`**; the API does a **`HEAD`** on the object to verify it exists, its size and type → `ready` (or deletes it → `rejected`).
- Object keys are generated by the server (`uploads/<user>/<yyyy>/<mm>/<uuid>-<safe-name>`): no path traversal, no overwrites, easy lifecycle rules.
- Downloads use **short-lived presigned GET URLs**; the bucket stays **private** (Block Public Access); a cleanup job removes stale `pending` uploads.
- Same code for **AWS S3** and S3-compatible local storage (SeaweedFS in Docker); a zero-setup **local signed-URL provider** for development.

::: text 🧒 In simple words
Think of a **storage warehouse with a reception desk**. You don't carry your boxes through the receptionist's office (our API server); you ask the receptionist for a **one-time, 5-minute door pass** for a specific shelf, then drive straight to the loading dock (S3). Afterwards you tell reception "done", and they check the shelf before marking it as yours. The API stays small and fast, the warehouse handles the heavy lifting, and nobody can wander into other people's shelves.
:::

::: text 📋 Requirements
### Functional
- Users upload images, PDFs and videos (multiple files, progress bar per file), see their files, open/download them, delete them.
- Max 50 MB per file; allowed types: PNG, JPEG, WebP, GIF, PDF, MP4.
- Each user only sees their own files.

### Non-functional
- Upload bandwidth must not go through the API servers; bucket is private; links expire.
- Verify what was actually uploaded (size/type), clean up abandoned uploads.
- Runs locally without AWS (local signed URLs **or** SeaweedFS S3 in Docker Compose) and in production on AWS S3 by changing env vars only.

### Assumptions
- Identity comes from an `x-user-id` header to keep the focus on uploads (plug in the User Management design's auth for real use).
- Express 4 API on port 4500, React + Vite client; file records are kept in memory (a `files` table/collection in production).
:::

::: ask
- *"File sizes? Do we need resumable uploads for multi-GB videos?"* (S3 multipart with presigned part URLs.)
- *"Public files (avatars via CDN) or private documents?"*
- *"Do we need virus scanning, image thumbnails or video transcoding?"* (Async processing after upload.)
- *"Retention: delete after N days? Versioning?"*
- *"Which regions / data residency rules?"*
:::

::: diagram Architecture and classes
flowchart LR
  subgraph Browser["React client"]
    UP["Uploader: pick/drop, XHR progress"] --> API1["api.js"]
    FL["FileList: open, delete"] --> API1
  end
  API1 -->|"1 POST /api/uploads"| R["routes"]
  UP -->|"2 PUT bytes (presigned URL)"| S3[("S3 / SeaweedFS / local storage")]
  API1 -->|"3 POST /complete"| R
  subgraph Server["Express API"]
    R --> UC["UploadController"]
    UC --> US["UploadService (validate, keys, verify, cleanup)"]
    US --> FR["FileRepository (records)"]
    US --> ST["Storage interface: presignPut, presignGet, head, delete"]
  end
  ST -->|"HEAD / DELETE"| S3
:::

::: diagram ER model
erDiagram
  USER ||--o{ FILE : owns
  FILE {
    string id PK
    string ownerId FK
    string key UK "uploads/owner/yyyy/mm/uuid-name"
    string originalName
    string contentType
    int declaredSize
    int size "from HEAD"
    string status "pending, ready, rejected"
    date createdAt
    date uploadedAt
  }
  USER {
    string id PK
  }
:::

::: diagram Sequence: direct-to-S3 upload with verification
sequenceDiagram
  participant B as Browser
  participant API as Express API
  participant S as S3
  B->>API: POST /api/uploads (name, type, size)
  API->>API: validate type and size, build key, save record pending
  API-->>B: 201 uploadUrl (PUT, 5 min, Content-Type bound), fileId
  B->>S: PUT bytes with Content-Type (progress events)
  S-->>B: 200
  B->>API: POST /api/uploads/fileId/complete
  API->>S: HEAD key
  S-->>API: size, content type
  API->>API: matches? status ready, else delete object and reject
  API-->>B: 200 file ready
  B->>API: GET /api/files/fileId/url
  API-->>B: presigned GET (60 s)
:::

::: image File upload: API issues presigned URLs, browser uploads straight to S3, API verifies with HEAD
/images/fullstack-lld/file-upload-s3.svg
:::

::: text 🧱 Design
### API contract (all routes need `x-user-id`)
| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| POST | `/api/uploads` | `{ fileName, contentType, size }` | 201 `{ fileId, uploadUrl, method: "PUT", headers, expiresIn }` | 400, 413 too large, 415 type |
| POST | `/api/uploads/:id/complete` | | 200 `{ file }` | 404, 409 object missing, 422 size/type mismatch |
| GET | `/api/files` | | 200 `{ items }` (ready only) | |
| GET | `/api/files/:id/url` | | 200 `{ url, expiresIn }` | 404 |
| DELETE | `/api/files/:id` | | 204 | 404 |
| PUT/GET | `/storage/*` | local provider only: signed `?expires&sig` | 200 / 403 / 413 | |

### Storage interface (`storage/*.js`)
| Method | S3 implementation | Local implementation |
|---|---|---|
| `presignPut(key, contentType, seconds)` | `getSignedUrl(PutObjectCommand, { signableHeaders: content-type })` with the **public** endpoint | HMAC of `PUT\nkey\ntype\nexpires` |
| `presignGet(key, fileName, seconds)` | `GetObjectCommand` + `ResponseContentDisposition` | HMAC of `GET\nkey\nexpires` |
| `head(key)` | `HeadObjectCommand` → `{ size, contentType }` or `null` | `fs.stat` + metadata file |
| `delete(key)` | `DeleteObjectCommand` | `fs.rm` |

### Why two S3 endpoints?
Inside Docker the API reaches storage at `http://s3:8333`, but the **browser** must use `http://localhost:8333`. A presigned URL's signature covers the host, so URLs are signed with a client configured for `S3_PUBLIC_ENDPOINT`, while `HEAD`/`DELETE` use `S3_ENDPOINT`. On AWS both are simply the regional endpoint (leave them empty).
:::

::: text 📁 Folder structure
`file-upload-s3/`
↳ `docker-compose.yml`, `Dockerfile`, `s3-config.json` (local S3 credentials)
↳ `server/package.json`, `server/src/index.js`, `server/src/app.js`, `server/src/config.js`
↳ `server/src/utils/errors.js`, `server/src/utils/keys.js`
↳ `server/src/storage/s3Storage.js`, `server/src/storage/localStorage.js`
↳ `server/src/repositories/fileRepository.js`, `server/src/services/upload.service.js`
↳ `server/src/controllers/upload.controller.js`, `server/src/routes/index.js`
↳ `client/package.json`, `client/vite.config.js`, `client/index.html`
↳ `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`, `client/src/uploadFile.js`, `client/src/styles.css`
↳ `client/src/components/Uploader.jsx`, `client/src/components/FileList.jsx`
:::

::: code json file-upload-s3/server/package.json
{
  "name": "file-upload-s3-api",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "express": "^4.19.2"
  }
}
:::

::: code javascript file-upload-s3/server/src/config.js
const crypto = require('crypto');
const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 4500,
  storage: process.env.STORAGE || 'local',                     // 'local' | 's3'
  maxFileBytes: (Number(process.env.MAX_FILE_MB) || 50) * 1024 * 1024,
  allowedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4'],
  uploadUrlTtl: 300,                                           // seconds a PUT URL is valid
  downloadUrlTtl: 60,
  pendingMaxAgeMs: 60 * 60 * 1000,                             // abandoned uploads are removed after 1 h
  local: {
    dir: process.env.LOCAL_STORAGE_DIR || path.resolve('storage-data'),
    secret: process.env.LOCAL_SIGNING_SECRET || crypto.randomBytes(32).toString('hex'),
  },
  s3: {
    bucket: process.env.S3_BUCKET || 'uploads',
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,            // empty on AWS
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    createBucket: process.env.S3_CREATE_BUCKET === 'true',     // local S3 only; on AWS create it with IaC
  },
};
:::

::: code javascript file-upload-s3/server/src/utils/errors.js
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') err = new ApiError(400, 'BAD_REQUEST', 'Invalid JSON body');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Something went wrong' : err.message, ...(err.details ? { details: err.details } : {}) } });
}

module.exports = { ApiError, asyncHandler, notFoundHandler, errorHandler };
:::

::: code javascript file-upload-s3/server/src/utils/keys.js
const crypto = require('crypto');

/** "../../My Photo (1).PNG" → "my-photo-1.png" (no paths, safe characters only) */
function safeFileName(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : '';
  return ext ? `${stem}.${ext}` : stem;
}

/** Server-generated, unique, partitioned by owner and month (good for lifecycle rules and listing). */
function buildObjectKey(ownerId, fileName, now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${ownerId}/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

module.exports = { safeFileName, buildObjectKey };
:::

::: code javascript file-upload-s3/server/src/storage/s3Storage.js
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function createS3Storage({ bucket, region, endpoint, publicEndpoint, forcePathStyle, createBucket }) {
  const base = {
    region,
    forcePathStyle,
    // Newer SDKs add CRC32 checksum params to presigned URLs by default; S3-compatible stores
    // (and browsers that don't send the checksum header) can reject them. Only add when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  // Credentials come from the default chain: env vars locally, IAM role on EC2/ECS/Lambda.
  const s3 = new S3Client({ ...base, endpoint });                         // server → storage
  const signer = new S3Client({ ...base, endpoint: publicEndpoint });     // URLs the BROWSER will call

  return {
    async init() {
      if (!createBucket) return;
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`🪣 Created bucket ${bucket}`);
      }
    },

    presignPut(key, contentType, expiresIn) {
      // SDK v3 signs only "host" by default. signableHeaders puts Content-Type INTO the signature,
      // so the browser must send exactly this type (anything else → 403 SignatureDoesNotMatch).
      return getSignedUrl(signer, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
        expiresIn,
        signableHeaders: new Set(['content-type']),
      });
    },

    presignGet(key, fileName, expiresIn, inline) {
      const disposition = `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/"/g, '')}"`;
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }), { expiresIn });
    },

    async head(key) {
      try {
        const out = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: out.ContentLength, contentType: out.ContentType };
      } catch (err) {
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return null;
        throw err;
      }
    },

    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    router: null,                                                          // S3 serves the bytes itself
  };
}

module.exports = { createS3Storage };
:::

::: code javascript file-upload-s3/server/src/storage/localStorage.js
// Development storage that behaves like S3 presigned URLs: HMAC-signed, expiring URLs served by Express.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

function createLocalStorage({ dir, secret, maxFileBytes }) {
  fs.mkdirSync(dir, { recursive: true });
  const sign = (...parts) => crypto.createHmac('sha256', secret).update(parts.join('\n')).digest('base64url');
  const filePath = (key) => {
    const full = path.resolve(dir, key);
    if (!full.startsWith(path.resolve(dir) + path.sep)) throw new Error('Invalid key');   // no ../ escapes
    return full;
  };
  const metaPath = (key) => `${filePath(key)}.meta.json`;
  const validSig = (given, expected) => typeof given === 'string' && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));

  const router = express.Router();

  // PUT /storage/<key>?expires=…&sig=…   (the browser uploads here, like a presigned S3 PUT)
  router.put('/*', (req, res) => {
    const key = req.params[0];
    const { expires, sig } = req.query;
    const contentType = req.headers['content-type'] || '';
    if (Number(expires) < Date.now() / 1000) return res.status(403).send('URL expired');
    if (!validSig(sig, sign('PUT', key, contentType, expires))) return res.status(403).send('Bad signature or Content-Type');
    const target = filePath(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let size = 0;
    const out = fs.createWriteStream(target);
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxFileBytes) {                                          // enforce while streaming
        req.unpipe(out);
        out.destroy();
        fs.rmSync(target, { force: true });
        res.status(413).send('Too large');
        req.destroy();
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      fs.writeFileSync(metaPath(key), JSON.stringify({ contentType, size }));
      res.status(200).end();
    });
    return undefined;
  });

  // GET /storage/<key>?expires=…&sig=…&name=…&inline=1
  router.get('/*', (req, res) => {
    const key = req.params[0];
    const { expires, sig, name = 'download', inline } = req.query;
    if (Number(expires) < Date.now() / 1000) return res.status(403).send('URL expired');
    if (!validSig(sig, sign('GET', key, expires, name, inline || ''))) return res.status(403).send('Bad signature');
    if (!fs.existsSync(filePath(key))) return res.status(404).send('Not found');
    const meta = JSON.parse(fs.readFileSync(metaPath(key), 'utf8'));
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${String(name).replace(/"/g, '')}"`);
    return fs.createReadStream(filePath(key)).pipe(res);
  });

  return {
    async init() {},
    async presignPut(key, contentType, expiresIn) {
      const expires = Math.floor(Date.now() / 1000) + expiresIn;
      return `/storage/${key}?expires=${expires}&sig=${sign('PUT', key, contentType, expires)}`;
    },
    async presignGet(key, fileName, expiresIn, inline) {
      const expires = Math.floor(Date.now() / 1000) + expiresIn;
      const flag = inline ? '1' : '';
      return `/storage/${key}?expires=${expires}&name=${encodeURIComponent(fileName)}&inline=${flag}&sig=${sign('GET', key, expires, fileName, flag)}`;
    },
    async head(key) {
      if (!fs.existsSync(metaPath(key))) return null;
      return JSON.parse(fs.readFileSync(metaPath(key), 'utf8'));
    },
    async delete(key) {
      fs.rmSync(filePath(key), { force: true });
      fs.rmSync(metaPath(key), { force: true });
    },
    router,
  };
}

module.exports = { createLocalStorage };
:::

::: code javascript file-upload-s3/server/src/repositories/fileRepository.js
// File records (in a real system: a "files" table/collection with an index on ownerId + status).
const crypto = require('crypto');

function createFileRepository() {
  const files = new Map();
  const copy = (f) => (f ? { ...f } : null);
  return {
    async create(data) {
      const file = { id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...data };
      files.set(file.id, file);
      return copy(file);
    },
    async findOwned(id, ownerId) {
      const f = files.get(id);
      return f && f.ownerId === ownerId ? copy(f) : null;              // other users' files look like 404
    },
    async update(id, patch) {
      const f = files.get(id);
      if (!f) return null;
      Object.assign(f, patch);
      return copy(f);
    },
    async listReady(ownerId) {
      return [...files.values()].filter((f) => f.ownerId === ownerId && f.status === 'ready').sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(copy);
    },
    async listStalePending(olderThanIso) {
      return [...files.values()].filter((f) => f.status === 'pending' && f.createdAt < olderThanIso).map(copy);
    },
    async remove(id) { files.delete(id); },
  };
}

module.exports = { createFileRepository };
:::

::: code javascript file-upload-s3/server/src/services/upload.service.js
const { ApiError } = require('../utils/errors');
const { buildObjectKey, safeFileName } = require('../utils/keys');

const publicFile = ({ id, originalName, contentType, size, status, createdAt, uploadedAt }) => ({ id, originalName, contentType, size, status, createdAt, uploadedAt });

function createUploadService({ storage, repo, config }) {
  return {
    async createUpload(ownerId, { fileName, contentType, size }) {
      if (!fileName || typeof fileName !== 'string') throw new ApiError(400, 'BAD_REQUEST', 'fileName is required');
      if (!Number.isInteger(size) || size <= 0) throw new ApiError(400, 'BAD_REQUEST', 'size must be a positive integer (bytes)');
      if (!config.allowedTypes.includes(contentType)) {
        throw new ApiError(415, 'UNSUPPORTED_TYPE', `Type ${contentType || 'unknown'} not allowed`, { allowed: config.allowedTypes });
      }
      if (size > config.maxFileBytes) throw new ApiError(413, 'TOO_LARGE', `Max ${config.maxFileBytes / 1024 / 1024} MB`);

      const key = buildObjectKey(ownerId, fileName);
      const file = await repo.create({ ownerId, key, originalName: safeFileName(fileName), contentType, declaredSize: size });
      const uploadUrl = await storage.presignPut(key, contentType, config.uploadUrlTtl);
      return { fileId: file.id, uploadUrl, method: 'PUT', headers: { 'Content-Type': contentType }, expiresIn: config.uploadUrlTtl };
    },

    async completeUpload(ownerId, id) {
      const file = await repo.findOwned(id, ownerId);
      if (!file) throw new ApiError(404, 'NOT_FOUND', 'Upload not found');
      if (file.status === 'ready') return publicFile(file);                  // idempotent
      const head = await storage.head(file.key);                             // trust storage, not the client
      if (!head) throw new ApiError(409, 'NOT_UPLOADED', 'The file has not been uploaded yet');
      const problems = {};
      if (head.size > config.maxFileBytes) problems.size = `Uploaded ${head.size} bytes, max ${config.maxFileBytes}`;
      if (head.size !== file.declaredSize) problems.size = `Declared ${file.declaredSize} bytes, uploaded ${head.size}`;
      if (head.contentType !== file.contentType) problems.contentType = `Expected ${file.contentType}, got ${head.contentType}`;
      if (Object.keys(problems).length) {
        await storage.delete(file.key);
        await repo.update(id, { status: 'rejected' });
        throw new ApiError(422, 'VERIFICATION_FAILED', 'Uploaded object does not match the request', problems);
      }
      return publicFile(await repo.update(id, { status: 'ready', size: head.size, uploadedAt: new Date().toISOString() }));
    },

    async list(ownerId) {
      return (await repo.listReady(ownerId)).map(publicFile);
    },

    async downloadUrl(ownerId, id) {
      const file = await repo.findOwned(id, ownerId);
      if (!file || file.status !== 'ready') throw new ApiError(404, 'NOT_FOUND', 'File not found');
      const inline = file.contentType.startsWith('image/') || file.contentType === 'application/pdf';
      return { url: await storage.presignGet(file.key, file.originalName, config.downloadUrlTtl, inline), expiresIn: config.downloadUrlTtl };
    },

    async remove(ownerId, id) {
      const file = await repo.findOwned(id, ownerId);
      if (!file) throw new ApiError(404, 'NOT_FOUND', 'File not found');
      await storage.delete(file.key);
      await repo.remove(id);
    },

    /** Deletes uploads that never completed (also configure an S3 lifecycle rule as a safety net). */
    async cleanupStale(now = Date.now()) {
      const stale = await repo.listStalePending(new Date(now - config.pendingMaxAgeMs).toISOString());
      for (const f of stale) {
        await storage.delete(f.key).catch(() => {});
        await repo.remove(f.id);
      }
      return stale.length;
    },
  };
}

module.exports = { createUploadService };
:::

::: code javascript file-upload-s3/server/src/controllers/upload.controller.js
const { asyncHandler, ApiError } = require('../utils/errors');

// Demo identity: replace with real auth (req.user.id from a verified token)
function ownerOf(req) {
  const id = String(req.headers['x-user-id'] || '');
  if (!/^[a-z0-9_-]{2,32}$/i.test(id)) throw new ApiError(401, 'UNAUTHORIZED', 'x-user-id header required (2-32 letters/digits)');
  return id.toLowerCase();
}

function createUploadController({ service }) {
  return {
    create: asyncHandler(async (req, res) => {
      res.status(201).json(await service.createUpload(ownerOf(req), req.body || {}));
    }),
    complete: asyncHandler(async (req, res) => {
      res.json({ file: await service.completeUpload(ownerOf(req), req.params.id) });
    }),
    list: asyncHandler(async (req, res) => {
      res.json({ items: await service.list(ownerOf(req)) });
    }),
    url: asyncHandler(async (req, res) => {
      res.json(await service.downloadUrl(ownerOf(req), req.params.id));
    }),
    remove: asyncHandler(async (req, res) => {
      await service.remove(ownerOf(req), req.params.id);
      res.status(204).end();
    }),
  };
}

module.exports = { createUploadController };
:::

::: code javascript file-upload-s3/server/src/routes/index.js
const express = require('express');

function createRouter({ controller }) {
  const router = express.Router();
  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.post('/uploads', controller.create);
  router.post('/uploads/:id/complete', controller.complete);
  router.get('/files', controller.list);
  router.get('/files/:id/url', controller.url);
  router.delete('/files/:id', controller.remove);
  return router;
}

module.exports = { createRouter };
:::

::: code javascript file-upload-s3/server/src/app.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createUploadService } = require('./services/upload.service');
const { createUploadController } = require('./controllers/upload.controller');
const { createRouter } = require('./routes');
const { notFoundHandler, errorHandler } = require('./utils/errors');

function createApp({ storage, repo, config }) {
  const service = createUploadService({ storage, repo, config });
  const app = express();
  app.disable('x-powered-by');
  if (storage.router) app.use('/storage', storage.router);           // local provider only (before json parser)
  app.use(express.json({ limit: '20kb' }));                           // only metadata goes through the API
  app.use('/api', createRouter({ controller: createUploadController({ service }) }));
  app.use('/api', notFoundHandler);

  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return { app, service };
}

module.exports = { createApp };
:::

::: code javascript file-upload-s3/server/src/index.js
const config = require('./config');
const { createApp } = require('./app');
const { createS3Storage } = require('./storage/s3Storage');
const { createLocalStorage } = require('./storage/localStorage');
const { createFileRepository } = require('./repositories/fileRepository');

async function main() {
  const storage = config.storage === 's3'
    ? createS3Storage(config.s3)
    : createLocalStorage({ ...config.local, maxFileBytes: config.maxFileBytes });
  await storage.init();
  console.log(config.storage === 's3' ? `☁️  S3 storage: bucket ${config.s3.bucket}` : `💾 Local signed-URL storage in ${config.local.dir}`);

  const { app, service } = createApp({ storage, repo: createFileRepository(), config });
  setInterval(() => service.cleanupStale().then((n) => n && console.log(`🧹 Removed ${n} stale uploads`)), 10 * 60 * 1000).unref();
  app.listen(config.port, () => console.log(`🚀 API on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
:::

::: code json file-upload-s3/client/package.json
{
  "name": "file-upload-s3-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript file-upload-s3/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4500', '/storage': 'http://localhost:4500' } },
});
:::

::: code html file-upload-s3/client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Uploads</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript file-upload-s3/client/src/api.js
let userId = 'alice';
export const setUser = (id) => { userId = id; };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'x-user-id': userId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${res.status}`), { status: res.status, details: data?.error?.details });
  return data;
}
:::

::: code javascript file-upload-s3/client/src/uploadFile.js
// 1) ask the API for a presigned URL  2) PUT the bytes straight to storage  3) tell the API it's done
import { api } from './api.js';

function putWithProgress(url, file, headers, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));  // must match the signed Content-Type
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export async function uploadFile(file, { onProgress = () => {}, signal } = {}) {
  const ticket = await api('/uploads', { method: 'POST', body: { fileName: file.name, contentType: file.type, size: file.size } });
  await putWithProgress(ticket.uploadUrl, file, ticket.headers, onProgress, signal);
  const { file: saved } = await api(`/uploads/${ticket.fileId}/complete`, { method: 'POST' });
  return saved;
}
:::

::: code jsx file-upload-s3/client/src/components/Uploader.jsx
import { useRef, useState } from 'react';
import { uploadFile } from '../uploadFile.js';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4';

export function Uploader({ onUploaded }) {
  const [jobs, setJobs] = useState([]);                 // { id, name, progress, status, error }
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const controllers = useRef(new Map());

  const patch = (id, p) => setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const start = (fileList) => {
    [...fileList].forEach((file) => {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      setJobs((list) => [...list, { id, name: file.name, progress: 0, status: 'uploading', error: '' }]);
      uploadFile(file, { onProgress: (p) => patch(id, { progress: p }), signal: controller.signal })
        .then((saved) => { patch(id, { status: 'done', progress: 1 }); onUploaded(saved); })
        .catch((err) => patch(id, { status: err.name === 'AbortError' ? 'cancelled' : 'error', error: err.message }));
    });
  };

  return (
    <section className="card">
      <div
        className={`drop${dragging ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); start(e.dataTransfer.files); }}
      >
        <p>Drop images, PDFs or MP4s here (max 50 MB) or</p>
        <button type="button" className="primary" onClick={() => inputRef.current.click()}>Choose files</button>
        <input ref={inputRef} type="file" multiple hidden accept={ACCEPT} aria-label="Choose files" onChange={(e) => { start(e.target.files); e.target.value = ''; }} />
      </div>
      <ul className="jobs">
        {jobs.map((j) => (
          <li key={j.id} className={`job ${j.status}`}>
            <span className="name">{j.name}</span>
            <progress max="1" value={j.progress} aria-label={`Upload progress for ${j.name}`} />
            <span className="state">{j.status === 'uploading' ? `${Math.round(j.progress * 100)}%` : j.status}</span>
            {j.status === 'uploading' && <button type="button" onClick={() => controllers.current.get(j.id)?.abort()}>Cancel</button>}
            {j.error && <span className="error">{j.error}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
:::

::: code jsx file-upload-s3/client/src/components/FileList.jsx
import { api } from '../api.js';

const formatBytes = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function FileList({ files, onDeleted, onError }) {
  const open = async (file) => {
    try {
      const { url } = await api(`/files/${file.id}/url`);    // short-lived presigned GET
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      onError(err.message);
    }
  };
  const remove = async (file) => {
    try {
      await api(`/files/${file.id}`, { method: 'DELETE' });
      onDeleted(file.id);
    } catch (err) {
      onError(err.message);
    }
  };

  if (files.length === 0) return <p className="muted">No files yet.</p>;
  return (
    <table className="files">
      <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Uploaded</th><th /></tr></thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.id}>
            <td>{f.originalName}</td>
            <td>{f.contentType}</td>
            <td>{formatBytes(f.size)}</td>
            <td>{new Date(f.uploadedAt).toLocaleString()}</td>
            <td>
              <button type="button" onClick={() => open(f)}>Open</button>{' '}
              <button type="button" className="danger" onClick={() => remove(f)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
:::

::: code jsx file-upload-s3/client/src/App.jsx
import { useCallback, useEffect, useState } from 'react';
import { api, setUser } from './api.js';
import { Uploader } from './components/Uploader.jsx';
import { FileList } from './components/FileList.jsx';

export default function App() {
  const [user, setUserState] = useState('alice');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => api('/files').then((d) => setFiles(d.items)).catch((e) => setError(e.message)), []);
  useEffect(() => { setUser(user); load(); }, [user, load]);

  return (
    <main className="page">
      <header className="top">
        <h1>📁 My files</h1>
        <label>Signed in as{' '}
          <select value={user} onChange={(e) => setUserState(e.target.value)} aria-label="Demo user">
            <option value="alice">alice</option>
            <option value="bob">bob</option>
          </select>
        </label>
      </header>
      <Uploader onUploaded={(f) => setFiles((list) => [f, ...list])} />
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card">
        <h2>Files ({files.length})</h2>
        <FileList files={files} onDeleted={(id) => setFiles((list) => list.filter((f) => f.id !== id))} onError={setError} />
      </section>
    </main>
  );
}
:::

::: code jsx file-upload-s3/client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code css file-upload-s3/client/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 900px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 16px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.top h1 { margin: 0; }
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 16px; }
.drop { border: 2px dashed #94a3b8; border-radius: 12px; padding: 24px; text-align: center; }
.drop.over { background: #eef2ff; border-color: #6366f1; }
.jobs { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; }
.job { display: grid; grid-template-columns: 1fr 160px 80px auto; gap: 8px; align-items: center; font-size: 14px; }
.job .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job.done .state { color: #047857; }
.job.error .state, .error { color: #b91c1c; font-size: 13px; }
.files { width: 100%; border-collapse: collapse; font-size: 14px; }
.files th, .files td { text-align: left; padding: 6px; border-bottom: 1px solid #e2e8f0; }
button, select { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; cursor: pointer; }
.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.danger { color: #b91c1c; border-color: #fca5a5; }
.muted { color: #64748b; }
@media (prefers-color-scheme: dark) {
  body { background: #0b1020; color: #e2e8f0; }
  .card, button, select { background: #111827; border-color: #273449; }
  .files th, .files td { border-color: #273449; }
  .drop.over { background: #1e1b4b; }
}
:::

::: code dockerfile file-upload-s3/Dockerfile
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4500
EXPOSE 4500
USER node
CMD ["node", "src/index.js"]
:::

::: code yaml file-upload-s3/docker-compose.yml
# docker compose up -d --build   →   http://localhost:4500
# "s3" is SeaweedFS, an S3-compatible server, so you can test presigned URLs without an AWS account.
services:
  s3:
    image: chrislusf/seaweedfs:latest
    command: server -s3 -dir=/data -s3.config=/etc/seaweedfs/s3-config.json
    ports:
      - "8333:8333"            # the browser uploads here directly (presigned URLs)
    volumes:
      - s3_data:/data
      - ./s3-config.json:/etc/seaweedfs/s3-config.json:ro   # credentials → signatures are verified like on AWS

  app:
    build: .
    ports:
      - "4500:4500"
    environment:
      STORAGE: s3
      S3_BUCKET: uploads
      S3_ENDPOINT: http://s3:8333               # API → storage (inside Docker)
      S3_PUBLIC_ENDPOINT: http://localhost:8333 # URLs signed for the browser
      S3_FORCE_PATH_STYLE: "true"
      S3_CREATE_BUCKET: "true"
      AWS_REGION: us-east-1
      AWS_ACCESS_KEY_ID: local                  # must match s3-config.json (local dev only)
      AWS_SECRET_ACCESS_KEY: local-secret
    depends_on:
      - s3
    restart: on-failure                          # retries until SeaweedFS is ready

volumes:
  s3_data:
:::

::: code json file-upload-s3/s3-config.json
{
  "identities": [
    {
      "name": "app",
      "credentials": [{ "accessKey": "local", "secretKey": "local-secret" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
:::

::: code javascript Browser simulation: validation, safe keys and signed URLs (runnable)
// The service's validation, key builder and an HMAC-signed URL check (Web Crypto) without a server.
const MAX = 50 * 1024 * 1024, TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'video/mp4'];
function validate({ contentType, size }) { if (!TYPES.includes(contentType)) return 415; if (!Number.isInteger(size) || size <= 0) return 400; if (size > MAX) return 413; return 201; }
function safeFileName(name) {
  const base = String(name).split(/[\\/]/).pop(); const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return ext ? `${stem}.${ext}` : stem;
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))));
}
const verify = (head, record) => (head.size === record.declaredSize && head.contentType === record.contentType ? 'ready' : 'rejected');

// ---------- tests ----------
(async () => {
  console.log('PNG 2 MB → 201', validate({ contentType: 'image/png', size: 2e6 }) === 201 ? '✅' : '❌ FAIL');
  console.log('EXE → 415, 80 MB video → 413', validate({ contentType: 'application/x-msdownload', size: 10 }) === 415 && validate({ contentType: 'video/mp4', size: 80 * 1024 * 1024 }) === 413 ? '✅' : '❌ FAIL');
  const safe = safeFileName('../../etc/My Photo (1).PNG');
  console.log('path traversal removed →', safe, safe === 'my-photo-1.png' ? '✅' : '❌ FAIL');
  const secret = 'server-only-secret', expires = 1900000000;
  const sig = await hmac(secret, ['PUT', 'uploads/alice/a.png', 'image/png', expires].join('\n'));
  const sameType = await hmac(secret, ['PUT', 'uploads/alice/a.png', 'image/png', expires].join('\n'));
  const otherType = await hmac(secret, ['PUT', 'uploads/alice/a.png', 'text/html', expires].join('\n'));
  console.log('signature valid for the signed Content-Type', sig === sameType ? '✅' : '❌ FAIL');
  console.log('changing Content-Type to text/html breaks the signature', sig !== otherType ? '✅' : '❌ FAIL');
  console.log('HEAD shows a different size than declared → rejected', verify({ size: 999, contentType: 'image/png' }, { declaredSize: 1000, contentType: 'image/png' }) === 'rejected' ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
**Option A: local signed URLs (no S3 at all)**
`cd file-upload-s3/server && npm install && npm run dev` → "💾 Local signed-URL storage", then `cd file-upload-s3/client && npm install && npm run dev` → `http://localhost:5173`.
**Option B: real S3 protocol with SeaweedFS (Docker)**
`cd file-upload-s3 && docker compose up -d --build` → `http://localhost:4500` (the API logs "☁️ S3 storage: bucket uploads").
**Option C: AWS S3**: create a private bucket with a CORS rule allowing `PUT` from your site, give the server an IAM role with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/uploads/*`, and run with `STORAGE=s3 S3_BUCKET=<bucket> AWS_REGION=<region>` (no endpoints).

**curl (Option A or B)**
`printf 'hello pdf' > note.pdf`
`curl -s -X POST localhost:4500/api/uploads -H 'x-user-id: alice' -H 'Content-Type: application/json' -d '{"fileName":"note.pdf","contentType":"application/pdf","size":9}'`
→ **201** `{"fileId":"…","uploadUrl":"/storage/uploads/alice/2026/10/…-note.pdf?expires=…&sig=…","method":"PUT","headers":{"Content-Type":"application/pdf"},"expiresIn":300}` (Option B returns an `http://localhost:8333/uploads/…?X-Amz-Signature=…` URL)
`curl -s -X PUT "<uploadUrl>" -H 'Content-Type: application/pdf' --data-binary @note.pdf -w '%{http_code}\n'` (prefix `http://localhost:4500` for Option A) → `200`
`curl -s -X POST localhost:4500/api/uploads/<fileId>/complete -H 'x-user-id: alice'` → `{"file":{"id":"…","originalName":"note.pdf","contentType":"application/pdf","size":9,"status":"ready",…}}`
Upload with `-H 'Content-Type: text/html'` instead → **403** (Option A: "Bad signature or Content-Type", Option B and AWS: `SignatureDoesNotMatch`): the type is part of the signature.
Declare `"size":100` but upload 9 bytes → `/complete` returns **422** `VERIFICATION_FAILED` and the object is deleted.
`curl -s localhost:4500/api/files -H 'x-user-id: bob'` → `{"items":[]}` (Bob can't see Alice's files). `.exe` → **415**; `"size":104857600` → **413**.

**In the UI**: drop a few images and a PDF → progress bars, then the files table; **Open** gets a 60-second link; switch the user to bob → empty list; Network tab: the big `PUT` goes to `/storage/…` or `localhost:8333`, **not** to `/api`.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Data path | Upload through the API (multer → S3) | **Presigned URL, browser → S3** | Presigned: no API bandwidth/memory, scales with S3 |
| Presign type | **PUT** (simple, Content-Type bound) | POST policy (can enforce `content-length-range`) | PUT + verify size with HEAD; POST policy when size must be enforced *by S3* |
| Large files | Single PUT (≤ 5 GB) | **Multipart upload** with presigned part URLs (resumable, parallel) | Multipart above ~100 MB |
| Verification | Trust the client | **HEAD on complete** (+ S3 event → Lambda for scanning) | HEAD for size/type; S3 events for async scanning/thumbnails |
| Downloads | Public bucket / CDN | **Presigned GET** (private) or CloudFront signed URLs | Private + presigned; CloudFront for heavy traffic |
| Local dev | Real AWS | **SeaweedFS / LocalStack** or local signed URLs | S3-compatible container + same code path |
:::

::: text 📈 Scaling & edge cases
- **Scale**: S3 handles the bytes; the API only does tiny JSON calls → a few small instances serve thousands of uploads. Use key prefixes per user/date; S3 scales per prefix automatically.
- **Processing**: S3 `ObjectCreated` event → SQS → workers (virus scan, thumbnails, transcoding); file status `processing → ready`.
- **Cost & cleanup**: lifecycle rules (abort incomplete multipart uploads after 1 day, move old files to Infrequent Access/Glacier), our cleanup job for `pending` records.
- **Security**: private bucket + Block Public Access, least-privilege IAM role (not access keys) on the server, short URL lifetimes, server-generated keys, `Content-Disposition: attachment` for untrusted types, validate type by content (magic bytes) in processing.
- **Edge cases**: URL expires mid-upload (request a new one), user closes the tab before `/complete` (cleanup), duplicate `/complete` (idempotent), browser CORS errors (bucket CORS rule must allow the origin, `PUT` and `Content-Type`).
:::

::: warning ⚠️ Common mistakes
- Streaming uploads through the API server (memory spikes, timeouts, double bandwidth cost).
- Letting the client choose the S3 key (overwrites, path traversal, access to other users' prefixes).
- Making the bucket public "so downloads work".
- Marking the file as uploaded without checking S3 (client can lie or fail).
- Forgetting the bucket CORS rule, or signing with the internal Docker hostname so the browser can't reach the URL.
- Assuming `ContentType` in `PutObjectCommand` is enforced: AWS SDK v3 presigned URLs sign only `host` unless you pass `signableHeaders` (check `X-Amz-SignedHeaders` in the URL).
:::

::: understand
- A presigned URL is **delegated, time-limited permission** for one operation on one object, created with the server's credentials but used by the browser. The signature covers method, key, expiry and signed headers (like Content-Type).
- The API's job shrinks to **policy** (who, what type, how big, which key) and **bookkeeping** (records, verification, cleanup).
:::

::: important ⭐ How to present this design in 5 minutes
> "The browser never sends file bytes to our API. It calls POST /uploads with name, type and size; the API checks the allow-list and size limit, builds a server-side key under the user's prefix, saves a pending record and returns a presigned PUT URL valid for five minutes with the Content-Type in the signature. The browser PUTs directly to S3 with XHR for progress, then calls complete; the API does a HEAD on the object, compares size and type with the request and marks it ready, or deletes it and returns 422. Downloads are 60-second presigned GETs, the bucket is private, and a cleanup job plus S3 lifecycle rules remove abandoned uploads. Locally the same code runs against SeaweedFS's S3 API, signing URLs with the public endpoint so the browser can reach them. For big files I'd switch to multipart uploads with presigned part URLs, and process files asynchronously from S3 events."
:::

::: links
AWS: Uploading objects with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
AWS SDK v3: s3-request-presigner | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/
AWS: Configuring CORS on a bucket | https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html
SeaweedFS: Amazon S3 API | https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API
:::

=== Design a Real-Time Notification System (in-app bell, WebSocket, multi-instance)
@p 3
@tags lld, websocket, real-time, notifications
@quick
- **Persist first, then push**: every notification is saved (source of truth) with a per-user increasing `seq`; the WebSocket push is just a fast hint.
- **WebSocket gateway** authenticates with a token in the URL (`/ws?token=…`), keeps `userId → Set<socket>` (many tabs/devices), heartbeats dead connections.
- **Multiple API instances**: publish events on a **bus** (Redis pub/sub); every instance delivers to *its* sockets → a user on instance A gets events created on instance B.
- **Catch-up after reconnect**: the client asks `GET /notifications?after=<lastSeq>` → nothing lost while offline; dedupe by id.
- Unread count, mark read / all read (synced to other tabs via the bus), cursor "load older", per-type **preferences** (mute), accessible bell (`aria-live`, badge label).

::: text 🧒 In simple words
The **bell icon** in GitHub, LinkedIn or Jira: "Asha commented on your post", "Your order shipped". When something happens, the server writes a note into your personal mailbox (database) and then taps you on the shoulder through an always-open line (WebSocket) so the bell updates instantly, in every tab you have open. If your Wi-Fi drops, you don't miss anything: when you reconnect, you simply ask "what arrived after note #42?". And when the company runs many servers, they shout new notes into a shared hallway (Redis) so whichever server you're connected to can pass it on.
:::

::: text 📋 Requirements
### Functional
- Producers (other features) create notifications for a user: `comment`, `mention`, `order`.
- The user sees a bell with unread count; a dropdown list with newest first, "load older"; click marks as read; "mark all read".
- New notifications appear in real time in **all** the user's tabs; reading in one tab updates the others.
- Users can mute types (preferences); muted types are not created.

### Non-functional
- No lost notifications (offline, reconnect, server restart); no duplicates in the UI.
- Horizontal scaling: several API instances behind a load balancer.
- Latency under a second for online users.

### Assumptions
- Demo login: pick a user name, the API returns a signed token (see User Management for real auth).
- Express 4 + `ws` on port 4600; storage in memory or MongoDB; bus in memory or Redis. Docker Compose runs **two app instances** + MongoDB + Redis to prove cross-instance delivery.
:::

::: ask
- *"Which channels: in-app only, or also email/push/SMS?"* (Then a delivery pipeline with queues; see the backend Notification design.)
- *"How many concurrent connected users? Messages per second?"*
- *"Do notifications need grouping ('5 people liked your post') or digests?"*
- *"Retention: how long do we keep them?"* (TTL index.)
- *"Mobile apps too?"* (APNs/FCM when the app is closed.)
:::

::: diagram Architecture: two instances, one bus
flowchart LR
  P["Producers: comments, orders, mentions"] -->|"notify(userId, ...)"| S1
  subgraph I1["API instance A"]
    S1["NotificationService"] --> GW1["WS gateway A"]
  end
  subgraph I2["API instance B"]
    S2["NotificationService"] --> GW2["WS gateway B"]
  end
  S1 -->|"save"| DB[("MongoDB notifications")]
  S2 -->|"save"| DB
  S1 -->|"publish"| BUS[("Redis pub/sub")]
  S2 -->|"publish"| BUS
  BUS --> GW1
  BUS --> GW2
  GW1 -->|"push"| T1["Alice tab 1"]
  GW2 -->|"push"| T2["Alice tab 2"]
  T1 -->|"REST: list, read, catch-up"| I1
:::

::: diagram ER model
erDiagram
  USER ||--o{ NOTIFICATION : receives
  USER ||--|| PREFERENCES : has
  NOTIFICATION {
    string id PK
    string userId FK
    int seq "per-user increasing"
    string type "comment, mention, order"
    string title
    string body
    string link
    bool read
    date createdAt
  }
  PREFERENCES {
    string userId PK
    json muted "types"
  }
:::

::: diagram Sequence: event on instance B reaches Alice on instance A, then reconnect catch-up
sequenceDiagram
  participant A as Alice browser
  participant GA as Instance A (WS)
  participant BUS as Redis pub/sub
  participant B as Instance B
  participant DB as MongoDB
  A->>GA: WS connect ?token, hello (unread 2)
  B->>DB: save notification seq 43 for alice
  B->>BUS: publish notification alice seq 43
  BUS-->>GA: message
  GA-->>A: push seq 43, unread 3
  Note over A,GA: network drops, seq 44 and 45 are created meanwhile
  A->>GA: reconnect (backoff)
  A->>GA: GET /api/notifications?after=43
  GA->>DB: seq greater than 43
  GA-->>A: seq 44, 45 (merged, deduped)
:::

::: image Notifications: persist then publish on a bus, every instance pushes to its own sockets, clients catch up by seq
/images/fullstack-lld/realtime-notifications.svg
:::

::: text 🧱 Design
### REST API (Bearer token)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/login` | `{ name }` | `{ token, user }` |
| GET | `/api/notifications` | `before=<seq>` (older page) or `after=<seq>` (catch-up), `limit` | `{ items, unread, hasMore }` |
| POST | `/api/notifications/read` | `{ ids: [] }` | `{ unread }` |
| POST | `/api/notifications/read-all` | | `{ unread: 0 }` |
| GET / PUT | `/api/preferences` | `{ muted: ["order"] }` | `{ muted }` |
| POST | `/api/demo/events` | `{ to, type, from }` | 202 (simulates another feature calling `notify`) |

### WebSocket messages (server → client)
| `type` | Payload | Client action |
|---|---|---|
| `hello` | `{ unread }` | Set badge, start catch-up |
| `notification` | `{ notification, unread }` | Prepend if new id, update badge, announce |
| `read` | `{ ids \| all, unread }` | Mark items read (other tab did it) |

### Components
| Piece | Responsibility |
|---|---|
| `NotificationService` | Check preferences → save with next `seq` → publish to bus; read operations publish `read` events |
| `Bus` (memory / Redis) | `publish(event)`, `subscribe(handler)`; Redis uses a pub/sub channel `notifications` |
| `WsGateway` | Auth on upgrade, `userId → sockets`, deliver bus events to local sockets, heartbeat |
| Repository (memory / Mongo) | `nextSeq(userId)`, `insert`, `list({ before, after, limit })`, `unreadCount`, `markRead`, `markAllRead`, preferences |
| `useNotifications` (client) | REST load, WS connect + backoff, catch-up by `seq`, merge/dedupe, optimistic read |
:::

::: text 📁 Folder structure
`realtime-notifications/`
↳ `docker-compose.yml`, `Dockerfile`
↳ `server/package.json`, `server/src/index.js`, `server/src/app.js`, `server/src/config.js`
↳ `server/src/utils/errors.js`, `server/src/utils/token.js`
↳ `server/src/bus/memoryBus.js`, `server/src/bus/redisBus.js`
↳ `server/src/repositories/memory.repository.js`, `server/src/repositories/mongo.repository.js`
↳ `server/src/services/notification.service.js`, `server/src/realtime/wsGateway.js`, `server/src/routes/index.js`
↳ `client/package.json`, `client/vite.config.js`, `client/index.html`
↳ `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`, `client/src/useNotifications.js`, `client/src/styles.css`
↳ `client/src/components/NotificationBell.jsx`, `client/src/components/Preferences.jsx`, `client/src/components/DemoPanel.jsx`
:::

::: code json realtime-notifications/server/package.json
{
  "name": "realtime-notifications-api",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "ioredis": "^5.4.1",
    "mongodb": "^6.8.0",
    "ws": "^8.18.0"
  }
}
:::

::: code javascript realtime-notifications/server/src/config.js
const crypto = require('crypto');

module.exports = {
  port: Number(process.env.PORT) || 4600,
  instanceName: process.env.INSTANCE_NAME || `api-${process.pid}`,
  mongoUrl: process.env.MONGO_URL || '',       // empty → in-memory store (single instance only)
  redisUrl: process.env.REDIS_URL || '',       // empty → in-memory bus (single instance only)
  tokenSecret: process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex'),
  types: ['comment', 'mention', 'order'],
};
:::

::: code javascript realtime-notifications/server/src/utils/errors.js
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') err = new ApiError(400, 'Invalid JSON body');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong' : err.message } });
}

module.exports = { ApiError, asyncHandler, errorHandler };
:::

::: code javascript realtime-notifications/server/src/utils/token.js
const crypto = require('crypto');

function signToken(payload, secret, ttlSeconds = 8 * 3600) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  return payload.exp > Date.now() / 1000 ? payload : null;
}

module.exports = { signToken, verifyToken };
:::

::: code javascript realtime-notifications/server/src/bus/memoryBus.js
// Single-process bus: fine for one instance and for tests.
const { EventEmitter } = require('events');

function createMemoryBus() {
  const emitter = new EventEmitter();
  return {
    async publish(event) { emitter.emit('event', event); },
    async subscribe(handler) { emitter.on('event', handler); },
    async close() { emitter.removeAllListeners(); },
  };
}

module.exports = { createMemoryBus };
:::

::: code javascript realtime-notifications/server/src/bus/redisBus.js
// Redis pub/sub: every instance receives every event and delivers it to ITS connected sockets.
const Redis = require('ioredis');

const CHANNEL = 'notifications';

function createRedisBus(url, { instanceName }) {
  const pub = new Redis(url);
  const sub = new Redis(url);              // a subscribed connection can't publish → two connections
  return {
    async publish(event) {
      await pub.publish(CHANNEL, JSON.stringify({ ...event, origin: instanceName }));
    },
    async subscribe(handler) {
      await sub.subscribe(CHANNEL);
      sub.on('message', (channel, raw) => {
        if (channel === CHANNEL) handler(JSON.parse(raw));
      });
    },
    async close() {
      await Promise.all([pub.quit(), sub.quit()]);
    },
  };
}

module.exports = { createRedisBus };
:::

::: code javascript realtime-notifications/server/src/repositories/memory.repository.js
const crypto = require('crypto');

function createMemoryRepository() {
  const items = [];                        // all notifications
  const seqs = new Map();                  // userId → last seq
  const prefs = new Map();                 // userId → { muted: [] }

  const forUser = (userId) => items.filter((n) => n.userId === userId);

  return {
    async nextSeq(userId) {
      const seq = (seqs.get(userId) || 0) + 1;
      seqs.set(userId, seq);
      return seq;
    },
    async insert(n) {
      const doc = { id: crypto.randomUUID(), read: false, createdAt: new Date().toISOString(), ...n };
      items.push(doc);
      return { ...doc };
    },
    /** Newest first. before → older page; after → catch-up (everything newer than `after`). */
    async list(userId, { before, after, limit }) {
      let rows = forUser(userId).sort((a, b) => b.seq - a.seq);
      if (before) rows = rows.filter((n) => n.seq < before);
      if (after !== undefined) rows = rows.filter((n) => n.seq > after);
      return rows.slice(0, limit + 1).map((n) => ({ ...n }));
    },
    async unreadCount(userId) { return forUser(userId).filter((n) => !n.read).length; },
    async markRead(userId, ids) {
      forUser(userId).forEach((n) => { if (ids.includes(n.id)) n.read = true; });
    },
    async markAllRead(userId) { forUser(userId).forEach((n) => { n.read = true; }); },
    async getPreferences(userId) { return prefs.get(userId) || { muted: [] }; },
    async setPreferences(userId, value) { prefs.set(userId, value); return value; },
    async close() {},
  };
}

module.exports = { createMemoryRepository };
:::

::: code javascript realtime-notifications/server/src/repositories/mongo.repository.js
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const strip = (d) => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return rest;
};

async function createMongoRepository(url) {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const col = db.collection('notifications');
  const counters = db.collection('notification_counters');
  const prefs = db.collection('notification_preferences');
  await col.createIndex({ userId: 1, seq: -1 }, { unique: true });          // list + catch-up
  await col.createIndex({ userId: 1, read: 1 });                            // unread count
  await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // keep 90 days

  return {
    async nextSeq(userId) {
      // atomic per-user counter: safe even with many instances writing at once
      const doc = await counters.findOneAndUpdate({ _id: userId }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
      return doc.seq;
    },
    async insert(n) {
      const doc = { id: crypto.randomUUID(), read: false, createdAt: new Date(), ...n };
      await col.insertOne({ ...doc });
      return { ...doc, createdAt: doc.createdAt.toISOString() };
    },
    async list(userId, { before, after, limit }) {
      const filter = { userId };
      if (before) filter.seq = { $lt: before };
      if (after !== undefined) filter.seq = { ...(filter.seq || {}), $gt: after };
      const docs = await col.find(filter).sort({ seq: -1 }).limit(limit + 1).toArray();
      return docs.map((d) => ({ ...strip(d), createdAt: d.createdAt.toISOString() }));
    },
    async unreadCount(userId) { return col.countDocuments({ userId, read: false }); },
    async markRead(userId, ids) { await col.updateMany({ userId, id: { $in: ids } }, { $set: { read: true } }); },
    async markAllRead(userId) { await col.updateMany({ userId, read: false }, { $set: { read: true } }); },
    async getPreferences(userId) {
      const doc = await prefs.findOne({ _id: userId });
      return { muted: doc?.muted || [] };
    },
    async setPreferences(userId, value) {
      await prefs.updateOne({ _id: userId }, { $set: { muted: value.muted } }, { upsert: true });
      return value;
    },
    close: () => client.close(),
  };
}

module.exports = { createMongoRepository };
:::

::: code javascript realtime-notifications/server/src/services/notification.service.js
const { ApiError } = require('../utils/errors');

function createNotificationService({ repo, bus, config }) {
  return {
    /** Called by other features. Persist FIRST (source of truth), then publish (fast hint). */
    async notify(userId, { type, title, body = '', link = '' }) {
      if (!config.types.includes(type)) throw new ApiError(400, `Unknown type ${type}`);
      const prefs = await repo.getPreferences(userId);
      if (prefs.muted.includes(type)) return null;                              // user muted this type
      const seq = await repo.nextSeq(userId);
      const notification = await repo.insert({ userId, seq, type, title: String(title).slice(0, 140), body: String(body).slice(0, 500), link });
      const unread = await repo.unreadCount(userId);
      await bus.publish({ kind: 'notification', userId, notification, unread });
      return notification;
    },

    async list(userId, { before, after, limit = 10 }) {
      const rows = await repo.list(userId, { before, after, limit });
      return { items: rows.slice(0, limit), hasMore: rows.length > limit, unread: await repo.unreadCount(userId) };
    },

    async markRead(userId, ids) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) throw new ApiError(400, 'ids must be a non-empty array (max 100)');
      await repo.markRead(userId, ids);
      const unread = await repo.unreadCount(userId);
      await bus.publish({ kind: 'read', userId, ids, unread });                  // other tabs update too
      return { unread };
    },

    async markAllRead(userId) {
      await repo.markAllRead(userId);
      await bus.publish({ kind: 'read', userId, all: true, unread: 0 });
      return { unread: 0 };
    },

    getPreferences: (userId) => repo.getPreferences(userId),

    async setPreferences(userId, { muted }) {
      if (!Array.isArray(muted) || muted.some((t) => !config.types.includes(t))) throw new ApiError(400, `muted must be a subset of ${config.types.join(', ')}`);
      return repo.setPreferences(userId, { muted });
    },

    unreadCount: (userId) => repo.unreadCount(userId),
  };
}

module.exports = { createNotificationService };
:::

::: code javascript realtime-notifications/server/src/realtime/wsGateway.js
// Accepts WebSocket connections, keeps userId → sockets, and delivers bus events to local sockets.
const { WebSocketServer } = require('ws');
const { verifyToken } = require('../utils/token');

function createWsGateway({ server, bus, service, config }) {
  const wss = new WebSocketServer({ noServer: true });
  const socketsByUser = new Map();

  // Authenticate during the HTTP upgrade (browsers can't send headers on WebSocket → token in the URL)
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    const payload = verifyToken(url.searchParams.get('token'), config.tokenSecret);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    return wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, payload.sub));
  });

  wss.on('connection', async (ws, userId) => {
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsByUser.get(userId).add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
      const set = socketsByUser.get(userId);
      set?.delete(ws);
      if (set && set.size === 0) socketsByUser.delete(userId);
    });
    ws.send(JSON.stringify({ type: 'hello', unread: await service.unreadCount(userId), instance: config.instanceName }));
  });

  // Every instance receives every bus event; it only delivers to users connected HERE
  bus.subscribe((event) => {
    const sockets = socketsByUser.get(event.userId);
    if (!sockets) return;
    const message = event.kind === 'notification'
      ? { type: 'notification', notification: event.notification, unread: event.unread, via: config.instanceName }
      : { type: 'read', ids: event.ids, all: Boolean(event.all), unread: event.unread };
    const data = JSON.stringify(message);
    sockets.forEach((ws) => ws.readyState === ws.OPEN && ws.send(data));
  });

  // Heartbeat: terminate connections that stopped answering pings (laptop closed, network gone)
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      return ws.ping();
    });
  }, 30000);
  heartbeat.unref();

  return {
    connectedUsers: () => socketsByUser.size,
    close: () => { clearInterval(heartbeat); wss.close(); },
  };
}

module.exports = { createWsGateway };
:::

::: code javascript realtime-notifications/server/src/routes/index.js
const express = require('express');
const { ApiError, asyncHandler } = require('../utils/errors');
const { signToken, verifyToken } = require('../utils/token');

const DEMO_TITLES = {
  comment: (from) => `${from} commented on your post`,
  mention: (from) => `${from} mentioned you in a discussion`,
  order: () => 'Your order has shipped 📦',
};

function createRouter({ service, config }) {
  const router = express.Router();

  const auth = (req, res, next) => {
    const payload = verifyToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), config.tokenSecret);
    if (!payload) return next(new ApiError(401, 'Login required'));
    req.userId = payload.sub;
    return next();
  };
  const toInt = (v) => (v === undefined || v === '' ? undefined : Number.parseInt(v, 10));

  router.get('/health', (req, res) => res.json({ status: 'ok', instance: config.instanceName }));

  router.post('/login', (req, res, next) => {
    const name = String(req.body?.name || '').trim().toLowerCase();
    if (!/^[a-z]{2,20}$/.test(name)) return next(new ApiError(400, 'name: 2-20 letters'));
    return res.json({ token: signToken({ sub: name }, config.tokenSecret), user: { id: name } });
  });

  router.get('/notifications', auth, asyncHandler(async (req, res) => {
    const limit = Math.min(50, toInt(req.query.limit) || 10);
    res.json(await service.list(req.userId, { before: toInt(req.query.before), after: toInt(req.query.after), limit }));
  }));
  router.post('/notifications/read', auth, asyncHandler(async (req, res) => res.json(await service.markRead(req.userId, req.body?.ids))));
  router.post('/notifications/read-all', auth, asyncHandler(async (req, res) => res.json(await service.markAllRead(req.userId))));
  router.get('/preferences', auth, asyncHandler(async (req, res) => res.json(await service.getPreferences(req.userId))));
  router.put('/preferences', auth, asyncHandler(async (req, res) => res.json(await service.setPreferences(req.userId, req.body || {}))));

  // Simulates other features (comments, orders) calling service.notify()
  router.post('/demo/events', auth, asyncHandler(async (req, res) => {
    const { to, type } = req.body || {};
    if (!/^[a-z]{2,20}$/.test(String(to))) throw new ApiError(400, 'to: user name');
    const n = await service.notify(to, { type, title: (DEMO_TITLES[type] || DEMO_TITLES.comment)(req.userId), body: `Sent by ${req.userId} via ${config.instanceName}`, link: '/posts/42' });
    res.status(202).json({ created: Boolean(n), muted: !n, notification: n });
  }));

  return router;
}

module.exports = { createRouter };
:::

::: code javascript realtime-notifications/server/src/app.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createRouter } = require('./routes');
const { errorHandler } = require('./utils/errors');

function createApp({ service, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  app.use('/api', createRouter({ service, config }));
  app.use('/api', (req, res) => res.status(404).json({ error: { message: 'Not found' } }));

  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
:::

::: code javascript realtime-notifications/server/src/index.js
const http = require('http');
const config = require('./config');
const { createApp } = require('./app');
const { createMemoryBus } = require('./bus/memoryBus');
const { createRedisBus } = require('./bus/redisBus');
const { createMemoryRepository } = require('./repositories/memory.repository');
const { createMongoRepository } = require('./repositories/mongo.repository');
const { createNotificationService } = require('./services/notification.service');
const { createWsGateway } = require('./realtime/wsGateway');

async function main() {
  const repo = config.mongoUrl ? await createMongoRepository(config.mongoUrl) : createMemoryRepository();
  const bus = config.redisUrl ? createRedisBus(config.redisUrl, config) : createMemoryBus();
  console.log(`${config.instanceName}: store=${config.mongoUrl ? 'mongo' : 'memory'} bus=${config.redisUrl ? 'redis' : 'memory'}`);

  const service = createNotificationService({ repo, bus, config });
  const server = http.createServer(createApp({ service, config }));
  const gateway = createWsGateway({ server, bus, service, config });
  server.listen(config.port, () => console.log(`🚀 ${config.instanceName} on http://localhost:${config.port} (ws /ws)`));

  const shutdown = async () => {
    gateway.close();
    server.close();
    await Promise.allSettled([bus.close(), repo.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
:::

::: code json realtime-notifications/client/package.json
{
  "name": "realtime-notifications-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript realtime-notifications/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4600',
      '/ws': { target: 'ws://localhost:4600', ws: true },
    },
  },
});
:::

::: code html realtime-notifications/client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Notifications</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript realtime-notifications/client/src/api.js
let token = null;
export const setToken = (t) => { token = t; };
export const getToken = () => token;

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null))}` : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}
:::

::: code javascript realtime-notifications/client/src/useNotifications.js
// REST for history + WebSocket for live updates + catch-up by seq after every (re)connect.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken } from './api.js';

/** Merge by id, newest (highest seq) first. Duplicates from push + catch-up collapse here. */
export function mergeNotifications(current, incoming) {
  const byId = new Map(current.map((n) => [n.id, n]));
  incoming.forEach((n) => byId.set(n.id, { ...byId.get(n.id), ...n }));
  return [...byId.values()].sort((a, b) => b.seq - a.seq);
}

export function useNotifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [latest, setLatest] = useState(null);          // for the live announcement
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const catchUp = useCallback(async () => {
    const lastSeq = itemsRef.current[0]?.seq;
    const data = await api('/notifications', { query: lastSeq ? { after: lastSeq, limit: 50 } : { limit: 10 } });
    setItems((cur) => mergeNotifications(cur, data.items));
    if (!lastSeq) setHasMore(data.hasMore);
    setUnread(data.unread);
  }, []);

  useEffect(() => {
    let ws;
    let attempt = 0;
    let timer;
    let closed = false;
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(getToken())}`);
      ws.onopen = () => {
        attempt = 0;
        setStatus('live');
        catchUp().catch(() => {});                      // anything created while we were offline
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'hello') setUnread(msg.unread);
        if (msg.type === 'notification') {
          setItems((cur) => mergeNotifications(cur, [msg.notification]));
          setUnread(msg.unread);
          setLatest(msg.notification);
        }
        if (msg.type === 'read') {
          setItems((cur) => cur.map((n) => (msg.all || msg.ids.includes(n.id) ? { ...n, read: true } : n)));
          setUnread(msg.unread);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        const delay = Math.min(15000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2);
        attempt += 1;
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [catchUp]);

  const loadOlder = useCallback(async () => {
    const oldest = itemsRef.current[itemsRef.current.length - 1];
    if (!oldest) return;
    const data = await api('/notifications', { query: { before: oldest.seq, limit: 10 } });
    setItems((cur) => mergeNotifications(cur, data.items));
    setHasMore(data.hasMore);
  }, []);

  const markRead = useCallback(async (ids) => {
    setItems((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));   // optimistic
    const data = await api('/notifications/read', { method: 'POST', body: { ids } });
    setUnread(data.unread);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await api('/notifications/read-all', { method: 'POST' });
  }, []);

  return { items, unread, hasMore, status, latest, loadOlder, markRead, markAllRead };
}
:::

::: code jsx realtime-notifications/client/src/components/NotificationBell.jsx
import { useEffect, useRef, useState } from 'react';

const ICON = { comment: '💬', mention: '@', order: '📦' };

export function NotificationBell({ n }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onClick = (e) => !panelRef.current?.parentElement.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return (
    <div className="bell-wrap">
      <button
        type="button"
        className="bell"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Notifications, ${n.unread} unread`}
        onClick={() => setOpen((o) => !o)}
      >
        🔔{n.unread > 0 && <span className="count" aria-hidden="true">{n.unread > 99 ? '99+' : n.unread}</span>}
      </button>
      <span className={`dot ${n.status}`} title={`Connection: ${n.status}`} />

      {open && (
        <div className="panel" ref={panelRef} role="region" aria-label="Notifications list">
          <div className="panel-head">
            <strong>Notifications</strong>
            <button type="button" onClick={n.markAllRead} disabled={n.unread === 0}>Mark all read</button>
          </div>
          <ul>
            {n.items.map((item) => (
              <li key={item.id} className={item.read ? 'read' : 'unread'}>
                <button type="button" onClick={() => !item.read && n.markRead([item.id])}>
                  <span className="icon" aria-hidden="true">{ICON[item.type]}</span>
                  <span className="text">
                    <span className="title">{item.title}</span>
                    <span className="meta">#{item.seq} · {new Date(item.createdAt).toLocaleTimeString()}{item.read ? '' : ' · unread'}</span>
                  </span>
                </button>
              </li>
            ))}
            {n.items.length === 0 && <li className="empty">You're all caught up 🎉</li>}
          </ul>
          {n.hasMore && <button type="button" className="older" onClick={n.loadOlder}>Load older</button>}
        </div>
      )}
      {/* Screen readers hear new notifications without moving focus */}
      <div className="sr-only" aria-live="polite">{n.latest ? `New notification: ${n.latest.title}` : ''}</div>
    </div>
  );
}
:::

::: code jsx realtime-notifications/client/src/components/Preferences.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPES = [['comment', 'Comments'], ['mention', 'Mentions'], ['order', 'Order updates']];

export function Preferences() {
  const [muted, setMuted] = useState([]);
  useEffect(() => { api('/preferences').then((p) => setMuted(p.muted)).catch(() => {}); }, []);

  const toggle = async (type) => {
    const next = muted.includes(type) ? muted.filter((t) => t !== type) : [...muted, type];
    setMuted(next);
    await api('/preferences', { method: 'PUT', body: { muted: next } });
  };

  return (
    <fieldset className="card">
      <legend>Notify me about</legend>
      {TYPES.map(([type, label]) => (
        <label key={type}>
          <input type="checkbox" checked={!muted.includes(type)} onChange={() => toggle(type)} /> {label}
        </label>
      ))}
    </fieldset>
  );
}
:::

::: code jsx realtime-notifications/client/src/components/DemoPanel.jsx
import { useState } from 'react';
import { api } from '../api.js';

/** Plays the role of "other features" that create notifications. */
export function DemoPanel({ me }) {
  const [to, setTo] = useState(me);
  const [log, setLog] = useState('');
  const send = async (type) => {
    const r = await api('/demo/events', { method: 'POST', body: { to, type } });
    setLog(r.muted ? `${to} muted "${type}": nothing created` : `Created #${r.notification.seq} for ${to}`);
  };
  return (
    <section className="card">
      <h2>Simulate events</h2>
      <label>Send to <input value={to} onChange={(e) => setTo(e.target.value.toLowerCase())} aria-label="Recipient" /></label>
      <div className="row">
        <button type="button" onClick={() => send('comment')}>💬 Comment</button>
        <button type="button" onClick={() => send('mention')}>@ Mention</button>
        <button type="button" onClick={() => send('order')}>📦 Order shipped</button>
      </div>
      <p className="muted" role="status">{log}</p>
    </section>
  );
}
:::

::: code jsx realtime-notifications/client/src/App.jsx
import { useState } from 'react';
import { api, setToken } from './api.js';
import { useNotifications } from './useNotifications.js';
import { NotificationBell } from './components/NotificationBell.jsx';
import { Preferences } from './components/Preferences.jsx';
import { DemoPanel } from './components/DemoPanel.jsx';

function Home({ user }) {
  const n = useNotifications();
  return (
    <>
      <header className="top">
        <h1>Hi {user} 👋</h1>
        <NotificationBell n={n} />
      </header>
      <div className="grid">
        <DemoPanel me={user} />
        <Preferences />
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('alice');
  if (!user) {
    return (
      <main className="page">
        <form className="card login" onSubmit={async (e) => {
          e.preventDefault();
          const r = await api('/login', { method: 'POST', body: { name } });
          setToken(r.token);
          setUser(r.user.id);
        }}>
          <h1>Sign in (demo)</h1>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Continue</button>
        </form>
      </main>
    );
  }
  return <main className="page"><Home user={user} /></main>;
}
:::

::: code jsx realtime-notifications/client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code css realtime-notifications/client/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
@media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.login { max-width: 320px; margin: 60px auto; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
button, input { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; cursor: pointer; }
.bell-wrap { position: relative; display: flex; align-items: center; gap: 6px; }
.bell { font-size: 22px; position: relative; padding: 6px 10px; }
.count { position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border-radius: 999px; font-size: 12px; padding: 1px 6px; font-weight: 700; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #f59e0b; }
.dot.live { background: #10b981; }
.panel { position: absolute; right: 0; top: 48px; width: 340px; max-height: 420px; overflow: auto; background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15); z-index: 10; }
.panel-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
.panel ul { list-style: none; margin: 0; padding: 0; }
.panel li button { all: unset; box-sizing: border-box; display: flex; gap: 10px; width: 100%; padding: 10px 12px; cursor: pointer; }
.panel li button:focus-visible { outline: 2px solid #6366f1; outline-offset: -2px; }
.panel li.unread { background: #eef2ff; }
.panel .text { display: flex; flex-direction: column; }
.panel .meta { font-size: 12px; color: #64748b; }
.panel .empty { padding: 16px; color: #64748b; }
.older { width: 100%; border: 0; border-top: 1px solid #e2e8f0; border-radius: 0; }
.muted { color: #64748b; font-size: 14px; margin: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-color-scheme: dark) {
  body { background: #0b1020; color: #e2e8f0; }
  .card, .panel, button, input { background: #111827; border-color: #273449; }
  .panel li.unread { background: #1e1b4b; }
}
:::

::: code dockerfile realtime-notifications/Dockerfile
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4600
EXPOSE 4600
USER node
CMD ["node", "src/index.js"]
:::

::: code yaml realtime-notifications/docker-compose.yml
# docker compose up -d --build
# Two app instances share MongoDB (data) and Redis (events):
#   http://localhost:4601  and  http://localhost:4602
services:
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      retries: 20

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 20

  app-a:
    build: .
    ports: ["4601:4600"]
    environment: &app_env
      MONGO_URL: mongodb://mongo:27017/notifications
      REDIS_URL: redis://redis:6379
      TOKEN_SECRET: ${TOKEN_SECRET:-dev-only-change-me}   # same secret on all instances
      INSTANCE_NAME: app-a
    depends_on: &app_deps
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }

  app-b:
    build: .
    ports: ["4602:4600"]
    environment:
      <<: *app_env
      INSTANCE_NAME: app-b
    depends_on: *app_deps

volumes:
  mongo_data:
:::

::: code javascript Browser simulation: persist-then-publish, fan-out and catch-up (runnable)
// Two "instances" share a store and a bus; sockets are plain callbacks.
function createBus() { const subs = []; return { publish: (e) => subs.forEach((h) => h(e)), subscribe: (h) => subs.push(h) }; }
function createStore() {
  const rows = [], seqs = {};
  return {
    save(userId, title) { const seq = (seqs[userId] = (seqs[userId] || 0) + 1); const n = { id: `${userId}-${seq}`, userId, seq, title, read: false }; rows.push(n); return n; },
    after: (userId, seq) => rows.filter((n) => n.userId === userId && n.seq > seq).sort((a, b) => b.seq - a.seq),
  };
}
function createInstance(name, store, bus) {
  const sockets = new Map();
  bus.subscribe((e) => (sockets.get(e.userId) || []).forEach((send) => send(e.notification)));
  return {
    connect(userId, send) { sockets.set(userId, [...(sockets.get(userId) || []), send]); },
    disconnect(userId) { sockets.delete(userId); },
    notify(userId, title) { const n = store.save(userId, title); bus.publish({ userId, notification: n }); return n; },
  };
}
const merge = (cur, inc) => { const m = new Map(cur.map((n) => [n.id, n])); inc.forEach((n) => m.set(n.id, n)); return [...m.values()].sort((a, b) => b.seq - a.seq); };

// ---------- tests ----------
const store = createStore(), bus = createBus();
const A = createInstance('A', store, bus), B = createInstance('B', store, bus);
let tab1 = [], tab2 = [];
A.connect('alice', (n) => (tab1 = merge(tab1, [n])));          // Alice tab 1 on instance A
B.connect('alice', (n) => (tab2 = merge(tab2, [n])));          // Alice tab 2 on instance B
B.notify('alice', 'Ben commented');
console.log('created on B → both tabs got it', tab1.length === 1 && tab2.length === 1 ? '✅' : '❌ FAIL');
B.notify('bob', 'for bob');
console.log('other users\' events not delivered to alice', tab1.length === 1 ? '✅' : '❌ FAIL');
A.disconnect('alice');                                          // tab 1 goes offline
B.notify('alice', 'Order shipped'); B.notify('alice', 'Asha mentioned you');
console.log('offline tab missed pushes →', tab1.length, tab1.length === 1 ? '✅' : '❌ FAIL');
tab1 = merge(tab1, store.after('alice', tab1[0].seq));          // reconnect: GET ?after=lastSeq
console.log('catch-up after seq', 1, '→ seqs', tab1.map((n) => n.seq).join(','), tab1.map((n) => n.seq).join(',') === '3,2,1' ? '✅' : '❌ FAIL');
tab1 = merge(tab1, store.after('alice', 1));                    // overlapping catch-up / duplicate push
console.log('duplicates collapse by id →', tab1.length, tab1.length === 3 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
**Local, single instance:** `cd realtime-notifications/server && npm install && npm run dev` ("store=memory bus=memory"), then `cd ../client && npm install && npm run dev` → open `http://localhost:5173` in **two tabs**, sign in as `alice` in both.
**Docker, two instances + MongoDB + Redis:** `cd realtime-notifications && docker compose up -d --build` → open `http://localhost:4601` and `http://localhost:4602`, sign in as `alice` in both.

**What to try**
1. In tab 1 click **💬 Comment** (to alice) → the bell in **both** tabs shows 1 instantly; with Docker, a notification created through app-a (body "Sent by alice via app-a") is pushed to the tab connected to app-b (`"via":"app-b"` in its WebSocket frame, DevTools → Network → WS).
2. Open the bell in tab 2 and click the item → it becomes read; tab 1's badge drops too (`read` event over the bus).
3. Uncheck **Order updates**, send 📦 → "alice muted order: nothing created".
4. Offline catch-up: DevTools → Network → Offline in tab 1, create 2 notifications from tab 2, go Online → after reconnect tab 1 shows them (request `GET /api/notifications?after=<seq>`).
5. Create 15+ notifications → **Load older** pages with `before=<seq>`.

**curl** (port 4600 locally, 4601/4602 with Docker)
`TOKEN=$(curl -s -X POST localhost:4600/api/login -H 'Content-Type: application/json' -d '{"name":"alice"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")`
`curl -s -X POST localhost:4600/api/demo/events -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"to":"alice","type":"comment"}'` → **202** `{"created":true,"muted":false,"notification":{"seq":1,…}}`
`curl -s "localhost:4600/api/notifications?after=0" -H "Authorization: Bearer $TOKEN"` → `{"items":[{"seq":1,…}],"hasMore":false,"unread":1}`
`curl -s -X POST localhost:4600/api/notifications/read-all -H "Authorization: Bearer $TOKEN"` → `{"unread":0}`
WebSocket without a token: `curl -si -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGVzdA==' localhost:4600/ws` → `HTTP/1.1 401 Unauthorized`.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Transport | Polling every N s | **WebSocket** / SSE | WebSocket (two-way, also for read sync); SSE is simpler for one-way + works through more proxies; polling as a fallback |
| Delivery truth | Push only | **Persist + push + catch-up by seq** | Persist first: pushes can be lost, the DB can't |
| Cross-instance | Sticky sessions only | **Pub/sub bus** (Redis, NATS) | Bus; Redis pub/sub is fire-and-forget (fine because of catch-up); Redis Streams/Kafka for durable fan-out |
| Ordering id | Timestamps | **Per-user sequence** (atomic counter) | Sequence: gap-free order, easy `after=` queries |
| Fan-out | On write (copy per follower) | On read (compute on open) | On write for personal notifications; on read for huge audiences (celebrity posts) |
| Managed | Own gateway (this) | Pusher, Ably, AWS API Gateway WebSockets, AppSync | Managed when connection counts are huge or the team is small |
:::

::: text 📈 Scaling & edge cases
- **Connections**: one Node process holds ~10k–50k idle sockets; scale out instances behind a load balancer with WebSocket support (ALB), raise file-descriptor limits, keep the gateway stateless except for the socket map.
- **Bus**: Redis pub/sub delivers each event to every instance (N× fan-out); at very large scale partition channels by user hash or use a presence registry (`user → instance`) to route directly.
- **Storage**: index `(userId, seq)`, TTL index for retention, archive old notifications; aggregate/group ("Asha and 4 others liked…") at write time.
- **Offline users**: email/push digests via a queue (see the backend Notification design); don't push to muted types.
- **Edge cases**: token expiry while connected (server closes with 4401 → client re-authenticates), many tabs (one socket per tab, or a SharedWorker / BroadcastChannel leader tab), clock skew (sort by seq, not time), duplicate push + catch-up (merge by id), mark-read races (idempotent updates).
:::

::: warning ⚠️ Common mistakes
- Pushing over the socket **without persisting** → refresh or offline = lost notifications.
- Storing sockets in memory and assuming one server; events created on another instance never arrive.
- Authenticating the WebSocket *after* it's open (anyone can connect) or putting long-lived tokens in URLs that get logged (use short-lived tokens).
- Reconnecting in a tight loop after a deploy (no backoff + jitter) → thundering herd.
- Unread counts computed on the client only (drift between tabs/devices).
:::

::: understand
- Real-time systems are **"durable store + best-effort fast path"**. The WebSocket makes it feel instant; the database plus `after=<seq>` catch-up makes it correct.
- The bus decouples *where an event happens* from *where the user is connected*, which is the core problem of horizontally scaled real-time apps.
:::

::: important ⭐ How to present this design in 5 minutes
> "When any feature calls notify, the service checks the user's preferences, takes the next per-user sequence number from an atomic counter, saves the notification, and only then publishes an event on a Redis pub/sub bus. Each API instance runs a WebSocket gateway that authenticates the token during the upgrade and keeps a map from user id to that user's sockets; every instance receives every bus event and delivers it to its own sockets, so all tabs and devices update regardless of which server they're on. The client loads history over REST, connects with exponential backoff, and after every connect asks for notifications after the last seq it has, merging by id, so nothing is lost while offline and duplicates collapse. Mark-read updates the database and publishes a read event so other tabs sync their badge. Preferences mute types at creation time. For scale: TTL and compound indexes, more gateway instances behind an ALB, and partitioned channels or a presence registry if fan-out gets expensive."
:::

::: links
MDN: WebSockets API | https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
ws: Node.js WebSocket library (auth on upgrade) | https://github.com/websockets/ws#client-authentication
Redis: Pub/Sub | https://redis.io/docs/latest/develop/interact/pubsub/
AWS: Exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
:::

=== Design a Large-Scale Dashboard (charts, tables, filters, widgets, live data)
@p 3
@tags lld, dashboard, aggregation, caching, real-time
@quick
- Never aggregate millions of raw rows per page view: maintain **pre-aggregated rollups** (day × region × channel × category) updated on every write; KPIs and charts read rollups.
- **Caching by freshness**: historical ranges are immutable → cache for minutes; ranges that include *today* → seconds. Cache key = normalised query.
- **Live data with SSE** (`EventSource`): server pushes new orders; the client **throttles** KPI refreshes (e.g. every 5 s) instead of refetching per event.
- Frontend: filters in the **URL**, every widget fetches **independently** (own loading/error/retry, abort on filter change), raw-orders table with **cursor pagination**.
- Charts are lightweight SVG with `role="img"`, titles and a **data-table fallback**; KPI cards compare against the **previous period**.

::: text 🧒 In simple words
An e-commerce **control room**: big numbers at the top (revenue, orders, average order value), a line chart of the last 30 days, a bar chart by region, and a table of the latest orders that keeps ticking as new orders arrive. The challenge is speed: if every page view added up millions of orders from scratch, the database would melt. Instead we keep **running totals per day** (like a shop that writes the day's takings in a ledger every evening), cache answers that can't change anymore (last month), and only stream the *new* orders to the screen.
:::

::: text 📋 Requirements
### Functional
- Filters: date range (7 / 30 / 90 days), region, channel; shareable via URL.
- KPI cards: revenue, orders, average order value, refund rate, each with % change vs the previous period.
- Revenue time series (daily or weekly), breakdown bar chart (by region, channel or category), recent orders table with "Load more".
- Live mode: new orders appear in a ticker within ~2 s and KPIs refresh while watching "today".

### Non-functional
- Dashboard API p95 < 200 ms with tens of millions of orders (read rollups, cache).
- Widgets fail independently (one broken chart doesn't blank the page); accessible charts.

### Assumptions
- Express 4 API on port 4700 with 90 days of synthetic orders (~37,000); a generator creates a new order every 2 s. Memory store by default, MongoDB via Compose. React + Vite client, charts in plain SVG (no chart library).
:::

::: ask
- *"How fresh must numbers be: real-time, 1 minute, hourly?"* (Drives rollups vs streaming.)
- *"How many rows and events per second?"*
- *"Which dimensions and how many values?"* (Cardinality decides rollup size.)
- *"Time zones: whose 'day'?"* (We use UTC; real dashboards use the business time zone.)
- *"Who uses it: 5 executives or 5,000 merchants (multi-tenant)?"*
:::

::: diagram Architecture
flowchart LR
  GEN["Order writes (checkout / generator)"] --> SVC["DashboardService.recordOrder"]
  SVC --> RAW[("orders (raw)")]
  SVC --> ROLL[("daily rollups: day x region x channel x category")]
  SVC --> HUB["SSE hub"]
  subgraph API["Express API"]
    Q["/kpis /timeseries /breakdown"] --> CACHE["TTL cache (key = normalised query)"]
    CACHE -->|"miss"| ROLL
    OT["/orders (cursor)"] --> RAW
    HUB --> ST["/stream (EventSource)"]
  end
  subgraph UI["React dashboard"]
    F["Filters (URL)"] --> W1["KPI cards"]
    F --> W2["LineChart"]
    F --> W3["BarChart"]
    F --> W4["OrdersTable"]
    LT["LiveTicker"]
  end
  W1 --> Q
  W2 --> Q
  W3 --> Q
  W4 --> OT
  ST --> LT
  LT -->|"throttled refresh"| W1
:::

::: diagram ER model
erDiagram
  ORDER }o--|| DAILY_ROLLUP : "adds to"
  ORDER {
    string id PK
    date createdAt
    string day "YYYY-MM-DD"
    string region
    string channel
    string category
    int amountCents
    string status "paid, refunded"
  }
  DAILY_ROLLUP {
    string id PK "day|region|channel|category"
    string day
    string region
    string channel
    string category
    int revenueCents
    int orders
    int refunds
  }
:::

::: diagram Sequence: a new order while the dashboard is open
sequenceDiagram
  participant G as Order write
  participant S as DashboardService
  participant DB as Store
  participant H as SSE hub
  participant UI as Dashboard
  G->>S: recordOrder(order)
  S->>DB: insert raw order
  S->>DB: rollup day|region|channel|category inc revenue, orders
  S->>S: invalidate "today" cache entries
  S->>H: publish order
  H-->>UI: event order (EventSource)
  UI->>UI: prepend to ticker, schedule KPI refresh (max 1 per 5 s)
  UI->>S: GET /kpis?from..today (cache miss, short TTL)
  S->>DB: sum ~5,000 rollup rows, not ~37,000 orders
  S-->>UI: KPIs + previous-period delta
:::

::: image Dashboard: writes update raw orders and rollups, reads hit a freshness-aware cache, SSE pushes live orders
/images/fullstack-lld/dashboard.svg
:::

::: text 🧱 Design
### API contract (all GET; common query: `from`, `to` = `YYYY-MM-DD` UTC, `region`, `channel`)
| Path | Extra params | Response |
|---|---|---|
| `/api/dashboard/kpis` | | `{ current: { revenueCents, orders, avgOrderCents, refundRate }, previous: {...}, change: { revenue: 0.12, … } }` |
| `/api/dashboard/timeseries` | `interval=day\|week` | `{ points: [{ bucket, revenueCents, orders }] }` (missing days filled with 0) |
| `/api/dashboard/breakdown` | `dimension=region\|channel\|category` | `{ rows: [{ key, revenueCents, orders }] }` sorted by revenue |
| `/api/orders` | `limit`, `cursor` | `{ items, nextCursor }` newest first |
| `/api/stream` | | `text/event-stream`: `event: order` with the order JSON |
| `/api/meta` | | `{ regions, channels, categories, today }` |

### Freshness-aware cache
`ttl = range includes today ? 3 s : 10 min`; key = path + sorted query; on a new order, entries whose range includes that day are deleted. Responses also carry `Cache-Control: private, max-age=<ttl>`.

### Frontend structure
| Piece | Responsibility |
|---|---|
| `useUrlFilters` | Filters ↔ query string (shareable, Back works) |
| `useApi(path, params)` | Fetch with AbortController, `{ data, error, loading, reload }`, keeps previous data while reloading |
| `useEventSource('/api/stream')` | Live events with automatic browser reconnect |
| `Widget` | Card with title, skeleton, error + Retry; each widget is isolated |
| `LineChart` / `BarChart` | Responsive SVG (`viewBox`), axis labels, `<title>`, hidden `<table>` with the same data |
:::

::: text 📁 Folder structure
`dashboard/`
↳ `docker-compose.yml`, `Dockerfile`
↳ `server/package.json`, `server/src/index.js`, `server/src/app.js`, `server/src/config.js`
↳ `server/src/utils/errors.js`, `server/src/utils/dates.js`, `server/src/utils/ttlCache.js`
↳ `server/src/data/seed.js`, `server/src/data/generator.js`
↳ `server/src/repositories/memory.repository.js`, `server/src/repositories/mongo.repository.js`
↳ `server/src/services/dashboard.service.js`, `server/src/realtime/sseHub.js`, `server/src/routes/index.js`
↳ `client/package.json`, `client/vite.config.js`, `client/index.html`
↳ `client/src/main.jsx`, `client/src/App.jsx`, `client/src/format.js`, `client/src/styles.css`
↳ `client/src/hooks/useUrlFilters.js`, `client/src/hooks/useApi.js`, `client/src/hooks/useEventSource.js`
↳ `client/src/components/Filters.jsx`, `client/src/components/Widget.jsx`, `client/src/components/KpiCards.jsx`, `client/src/components/LineChart.jsx`, `client/src/components/BarChart.jsx`, `client/src/components/OrdersTable.jsx`, `client/src/components/LiveTicker.jsx`
:::

::: code json dashboard/server/package.json
{
  "name": "dashboard-api",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongodb": "^6.8.0"
  }
}
:::

::: code javascript dashboard/server/src/config.js
module.exports = {
  port: Number(process.env.PORT) || 4700,
  mongoUrl: process.env.MONGO_URL || '',
  seedDays: Number(process.env.SEED_DAYS) || 90,
  liveOrders: process.env.LIVE_ORDERS !== 'false',
  liveIntervalMs: Number(process.env.LIVE_INTERVAL_MS) || 2000,
  dims: {
    region: ['north', 'south', 'east', 'west'],
    channel: ['web', 'app', 'store'],
    category: ['shoes', 'shirts', 'bags', 'watches', 'toys'],
  },
};
:::

::: code javascript dashboard/server/src/utils/errors.js
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong' : err.message } });
}

module.exports = { ApiError, asyncHandler, errorHandler };
:::

::: code javascript dashboard/server/src/utils/dates.js
// All dates are UTC days "YYYY-MM-DD" (string comparison = chronological comparison).
const DAY_MS = 24 * 60 * 60 * 1000;

const toDay = (date) => new Date(date).toISOString().slice(0, 10);
const today = () => toDay(Date.now());
const addDays = (day, n) => toDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** Monday of the ISO week, e.g. 2026-10-01 (Thu) → 2026-09-28 */
function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

module.exports = { DAY_MS, toDay, today, addDays, daysBetween, weekStart, eachDay };
:::

::: code javascript dashboard/server/src/utils/ttlCache.js
// Tiny TTL cache with "invalidate where" (used to drop entries whose range includes a changed day).
function createTtlCache({ maxEntries = 500 } = {}) {
  const map = new Map();                           // key → { value, expiresAt, meta }
  let hits = 0;
  let misses = 0;

  return {
    async getOrSet(key, ttlMs, meta, compute) {
      const hit = map.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        hits += 1;
        return { value: hit.value, cached: true };
      }
      misses += 1;
      const value = await compute();
      map.set(key, { value, expiresAt: Date.now() + ttlMs, meta });
      if (map.size > maxEntries) map.delete(map.keys().next().value);   // drop the oldest entry
      return { value, cached: false };
    },
    invalidateWhere(predicate) {
      for (const [key, entry] of map) if (predicate(entry.meta)) map.delete(key);
    },
    stats: () => ({ size: map.size, hits, misses }),
  };
}

module.exports = { createTtlCache };
:::

::: code javascript dashboard/server/src/data/generator.js
const crypto = require('crypto');

// Deterministic pseudo-random numbers (same seed → same data) so demos and tests are repeatable.
function createRandom(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeOrder(rand, dims, createdAt) {
  const pick = (list, weights) => {
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= weights[i]) < 0) return list[i];
    return list[list.length - 1];
  };
  const category = pick(dims.category, [3, 4, 2, 1, 2]);
  const base = { shoes: 8000, shirts: 3500, bags: 6000, watches: 15000, toys: 2500 }[category];
  return {
    id: crypto.randomUUID(),
    createdAt: new Date(createdAt).toISOString(),
    day: new Date(createdAt).toISOString().slice(0, 10),
    region: pick(dims.region, [4, 3, 2, 3]),
    channel: pick(dims.channel, [5, 4, 1]),
    category,
    amountCents: Math.round(base * (0.5 + rand())),
    status: rand() < 0.04 ? 'refunded' : 'paid',
  };
}

module.exports = { createRandom, makeOrder };
:::

::: code javascript dashboard/server/src/data/seed.js
const { createRandom, makeOrder } = require('./generator');
const { DAY_MS } = require('../utils/dates');

/** ~400 orders/day with weekly seasonality and slow growth. Returns orders oldest first. */
function generateHistory({ days, dims, now = Date.now() }) {
  const rand = createRandom(7);
  const orders = [];
  const start = now - days * DAY_MS;
  for (let d = 0; d < days; d++) {
    const dayStart = Math.floor((start + d * DAY_MS) / DAY_MS) * DAY_MS;
    const weekday = new Date(dayStart).getUTCDay();
    const count = Math.round(320 * (1 + d / days * 0.4) * (weekday === 0 || weekday === 6 ? 1.3 : 1));
    for (let i = 0; i < count; i++) orders.push(makeOrder(rand, dims, dayStart + Math.floor(rand() * DAY_MS)));
  }
  return orders.filter((o) => Date.parse(o.createdAt) <= now).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

module.exports = { generateHistory };
:::

::: code javascript dashboard/server/src/repositories/memory.repository.js
// Raw orders + rollups in memory. The service only talks to this interface.
const rollupKey = (o) => `${o.day}|${o.region}|${o.channel}|${o.category}`;

function createMemoryRepository() {
  const orders = [];                       // newest LAST (append-only)
  const rollups = new Map();

  const matches = (r, f) => r.day >= f.from && r.day <= f.to && (!f.region || r.region === f.region) && (!f.channel || r.channel === f.channel);

  return {
    async count() { return orders.length; },

    async insertOrders(list) {
      for (const o of list) {
        orders.push(o);
        const key = rollupKey(o);
        const r = rollups.get(key) || { id: key, day: o.day, region: o.region, channel: o.channel, category: o.category, revenueCents: 0, orders: 0, refunds: 0 };
        r.orders += 1;
        if (o.status === 'refunded') r.refunds += 1;
        else r.revenueCents += o.amountCents;
        rollups.set(key, r);
      }
    },

    /** Sum rollups grouped by a field ('day', 'region', …) or everything when groupBy is null. */
    async aggregate(filters, groupBy) {
      const groups = new Map();
      for (const r of rollups.values()) {
        if (!matches(r, filters)) continue;
        const key = groupBy ? r[groupBy] : 'all';
        const g = groups.get(key) || { key, revenueCents: 0, orders: 0, refunds: 0 };
        g.revenueCents += r.revenueCents;
        g.orders += r.orders;
        g.refunds += r.refunds;
        groups.set(key, g);
      }
      return [...groups.values()];
    },

    async rollupCount() { return rollups.size; },

    /** Newest first, cursor = { createdAt, id } of the last item seen. */
    async listOrders(filters, { cursor, limit }) {
      const out = [];
      for (let i = orders.length - 1; i >= 0 && out.length <= limit; i--) {
        const o = orders[i];
        if (!matches(o, filters)) continue;
        if (cursor && (o.createdAt > cursor.createdAt || (o.createdAt === cursor.createdAt && o.id >= cursor.id))) continue;
        out.push(o);
      }
      return out;
    },

    async close() {},
  };
}

module.exports = { createMemoryRepository };
:::

::: code javascript dashboard/server/src/repositories/mongo.repository.js
const { MongoClient } = require('mongodb');

async function createMongoRepository(url) {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const orders = db.collection('orders');
  const rollups = db.collection('daily_rollups');
  await orders.createIndex({ createdAt: -1, id: -1 });
  await orders.createIndex({ region: 1, channel: 1, createdAt: -1 });
  await rollups.createIndex({ day: 1, region: 1, channel: 1 });

  const match = (f) => ({
    day: { $gte: f.from, $lte: f.to },
    ...(f.region ? { region: f.region } : {}),
    ...(f.channel ? { channel: f.channel } : {}),
  });
  const strip = ({ _id, ...rest }) => rest;

  return {
    async count() { return orders.estimatedDocumentCount(); },

    async insertOrders(list) {
      if (!list.length) return;
      await orders.insertMany(list.map((o) => ({ ...o })), { ordered: false });
      // One $inc upsert per rollup bucket (bulk): atomic and safe with many writers
      const inc = new Map();
      for (const o of list) {
        const key = `${o.day}|${o.region}|${o.channel}|${o.category}`;
        const v = inc.get(key) || { o, revenueCents: 0, orders: 0, refunds: 0 };
        v.orders += 1;
        if (o.status === 'refunded') v.refunds += 1;
        else v.revenueCents += o.amountCents;
        inc.set(key, v);
      }
      await rollups.bulkWrite([...inc].map(([key, v]) => ({
        updateOne: {
          filter: { _id: key },
          update: {
            $setOnInsert: { day: v.o.day, region: v.o.region, channel: v.o.channel, category: v.o.category },
            $inc: { revenueCents: v.revenueCents, orders: v.orders, refunds: v.refunds },
          },
          upsert: true,
        },
      })), { ordered: false });
    },

    async aggregate(filters, groupBy) {
      const rows = await rollups.aggregate([
        { $match: match(filters) },
        { $group: { _id: groupBy ? `$${groupBy}` : 'all', revenueCents: { $sum: '$revenueCents' }, orders: { $sum: '$orders' }, refunds: { $sum: '$refunds' } } },
      ]).toArray();
      return rows.map((r) => ({ key: r._id, revenueCents: r.revenueCents, orders: r.orders, refunds: r.refunds }));
    },

    async rollupCount() { return rollups.estimatedDocumentCount(); },

    async listOrders(filters, { cursor, limit }) {
      const q = match(filters);
      if (cursor) q.$or = [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { $lt: cursor.id } }];
      return (await orders.find(q).sort({ createdAt: -1, id: -1 }).limit(limit + 1).toArray()).map(strip);
    },

    close: () => client.close(),
  };
}

module.exports = { createMongoRepository };
:::

::: code javascript dashboard/server/src/realtime/sseHub.js
// Server-Sent Events: one long HTTP response per client, the server writes "event/data" frames.
function createSseHub() {
  const clients = new Set();

  const keepAlive = setInterval(() => {
    clients.forEach((res) => res.write(': ping\n\n'));          // comment frame keeps proxies from closing it
  }, 15000);
  keepAlive.unref();

  return {
    handler(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',                                // disable buffering in nginx
      });
      res.write('retry: 3000\n\n');                               // browser reconnect delay
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    publish(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      clients.forEach((res) => res.write(frame));
    },
    size: () => clients.size,
  };
}

module.exports = { createSseHub };
:::

::: code javascript dashboard/server/src/services/dashboard.service.js
const { ApiError } = require('../utils/errors');
const { today, addDays, daysBetween, weekStart, eachDay } = require('../utils/dates');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function createDashboardService({ repo, cache, hub, config }) {
  function parseFilters(q) {
    const to = q.to || today();
    const from = q.from || addDays(to, -29);
    if (!DAY.test(from) || !DAY.test(to) || from > to) throw new ApiError(400, 'from/to must be YYYY-MM-DD and from <= to');
    if (daysBetween(from, to) > 366) throw new ApiError(400, 'Range too large (max 366 days)');
    for (const dim of ['region', 'channel']) {
      if (q[dim] && !config.dims[dim].includes(q[dim])) throw new ApiError(400, `Unknown ${dim}`);
    }
    return { from, to, region: q.region || '', channel: q.channel || '' };
  }

  // Ranges that include today can still change → short TTL; history is immutable → long TTL
  const ttlFor = (f) => (f.to >= today() ? 3000 : 10 * 60 * 1000);
  const cached = (name, f, extra, compute) => {
    const key = JSON.stringify([name, f.from, f.to, f.region, f.channel, extra]);
    return cache.getOrSet(key, ttlFor(f), { from: f.from, to: f.to }, compute);
  };

  const totals = (row = { revenueCents: 0, orders: 0, refunds: 0 }) => ({
    revenueCents: row.revenueCents,
    orders: row.orders,
    avgOrderCents: row.orders - row.refunds > 0 ? Math.round(row.revenueCents / (row.orders - row.refunds)) : 0,
    refundRate: row.orders ? row.refunds / row.orders : 0,
  });
  const change = (cur, prev) => (prev ? (cur - prev) / prev : null);

  return {
    parseFilters,
    ttlFor,

    kpis(f) {
      return cached('kpis', f, null, async () => {
        const len = daysBetween(f.from, f.to);
        const prevF = { ...f, from: addDays(f.from, -len), to: addDays(f.from, -1) };   // same length, just before
        const [[cur], [prev]] = await Promise.all([repo.aggregate(f, null), repo.aggregate(prevF, null)]);
        const current = totals(cur);
        const previous = totals(prev);
        return {
          current,
          previous,
          change: {
            revenue: change(current.revenueCents, previous.revenueCents),
            orders: change(current.orders, previous.orders),
            avgOrder: change(current.avgOrderCents, previous.avgOrderCents),
            refundRate: change(current.refundRate, previous.refundRate),
          },
        };
      });
    },

    timeseries(f, interval = 'day') {
      if (!['day', 'week'].includes(interval)) throw new ApiError(400, 'interval must be day or week');
      return cached('timeseries', f, interval, async () => {
        const rows = await repo.aggregate(f, 'day');
        const byDay = new Map(rows.map((r) => [r.key, r]));
        const buckets = new Map();
        for (const day of eachDay(f.from, f.to)) {                    // fill missing days with zeros
          const bucket = interval === 'week' ? weekStart(day) : day;
          const b = buckets.get(bucket) || { bucket, revenueCents: 0, orders: 0 };
          const r = byDay.get(day);
          if (r) { b.revenueCents += r.revenueCents; b.orders += r.orders; }
          buckets.set(bucket, b);
        }
        return { points: [...buckets.values()] };
      });
    },

    breakdown(f, dimension) {
      if (!['region', 'channel', 'category'].includes(dimension)) throw new ApiError(400, 'dimension must be region, channel or category');
      return cached('breakdown', f, dimension, async () => {
        const rows = await repo.aggregate(f, dimension);
        return { rows: rows.map(({ key, revenueCents, orders }) => ({ key, revenueCents, orders })).sort((a, b) => b.revenueCents - a.revenueCents) };
      });
    },

    async orders(f, { cursor, limit }) {
      let decoded = null;
      if (cursor) {
        try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new ApiError(400, 'Invalid cursor'); }
      }
      const rows = await repo.listOrders(f, { cursor: decoded, limit });
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = rows.length > limit ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null;
      return { items, nextCursor };
    },

    /** The write path: raw insert + rollup increment + cache invalidation + live push. */
    async recordOrder(order) {
      await repo.insertOrders([order]);
      cache.invalidateWhere((meta) => meta && meta.from <= order.day && meta.to >= order.day);
      hub.publish('order', order);
    },
  };
}

module.exports = { createDashboardService };
:::

::: code javascript dashboard/server/src/routes/index.js
const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { today } = require('../utils/dates');

function createRouter({ service, hub, cache, repo, config }) {
  const router = express.Router();

  const send = (res, { value, cached }, f) => {
    res.set('Cache-Control', `private, max-age=${Math.floor(service.ttlFor(f) / 1000)}`);
    res.set('X-Cache', cached ? 'HIT' : 'MISS');
    res.json(value);
  };

  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.get('/meta', asyncHandler(async (req, res) => {
    res.json({ ...config.dims, today: today(), orders: await repo.count(), rollups: await repo.rollupCount(), cache: cache.stats(), liveClients: hub.size() });
  }));

  router.get('/dashboard/kpis', asyncHandler(async (req, res) => {
    const f = service.parseFilters(req.query);
    send(res, await service.kpis(f), f);
  }));
  router.get('/dashboard/timeseries', asyncHandler(async (req, res) => {
    const f = service.parseFilters(req.query);
    send(res, await service.timeseries(f, req.query.interval || 'day'), f);
  }));
  router.get('/dashboard/breakdown', asyncHandler(async (req, res) => {
    const f = service.parseFilters(req.query);
    send(res, await service.breakdown(f, req.query.dimension || 'region'), f);
  }));
  router.get('/orders', asyncHandler(async (req, res) => {
    const f = service.parseFilters(req.query);
    const limit = Math.min(100, Number.parseInt(req.query.limit, 10) || 20);
    res.json(await service.orders(f, { cursor: req.query.cursor, limit }));
  }));
  router.get('/stream', (req, res) => hub.handler(req, res));

  return router;
}

module.exports = { createRouter };
:::

::: code javascript dashboard/server/src/app.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createRouter } = require('./routes');
const { errorHandler } = require('./utils/errors');

function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', createRouter(deps));
  app.use('/api', (req, res) => res.status(404).json({ error: { message: 'Not found' } }));

  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
:::

::: code javascript dashboard/server/src/index.js
const config = require('./config');
const { createApp } = require('./app');
const { createMemoryRepository } = require('./repositories/memory.repository');
const { createMongoRepository } = require('./repositories/mongo.repository');
const { createDashboardService } = require('./services/dashboard.service');
const { createSseHub } = require('./realtime/sseHub');
const { createTtlCache } = require('./utils/ttlCache');
const { generateHistory } = require('./data/seed');
const { createRandom, makeOrder } = require('./data/generator');

async function main() {
  const repo = config.mongoUrl ? await createMongoRepository(config.mongoUrl) : createMemoryRepository();
  if ((await repo.count()) === 0) {
    const history = generateHistory({ days: config.seedDays, dims: config.dims });
    for (let i = 0; i < history.length; i += 5000) await repo.insertOrders(history.slice(i, i + 5000));
    console.log(`🌱 Seeded ${history.length} orders → ${await repo.rollupCount()} rollup rows`);
  }

  const hub = createSseHub();
  const cache = createTtlCache();
  const service = createDashboardService({ repo, cache, hub, config });
  const app = createApp({ service, hub, cache, repo, config });

  if (config.liveOrders) {
    const rand = createRandom(Date.now() % 100000);
    setInterval(() => service.recordOrder(makeOrder(rand, config.dims, Date.now())).catch(console.error), config.liveIntervalMs).unref();
  }

  const server = app.listen(config.port, () => console.log(`🚀 Dashboard API on http://localhost:${config.port} (store=${config.mongoUrl ? 'mongo' : 'memory'})`));
  const shutdown = () => server.close(async () => { await repo.close(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
:::

::: code json dashboard/client/package.json
{
  "name": "dashboard-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript dashboard/client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4700' } },   // SSE works through the proxy too
});
:::

::: code html dashboard/client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sales Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript dashboard/client/src/format.js
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const formatMoney = (cents) => money.format(cents / 100);
export const formatCompactMoney = (cents) => `$${compact.format(cents / 100)}`;
export const formatNumber = (n) => compact.format(n);
export const formatPercent = (x) => `${(x * 100).toFixed(1)}%`;
export const formatChange = (x) => (x === null || x === undefined ? 'n/a' : `${x >= 0 ? '▲' : '▼'} ${Math.abs(x * 100).toFixed(1)}%`);
:::

::: code javascript dashboard/client/src/hooks/useUrlFilters.js
import { useCallback, useEffect, useState } from 'react';

const DEFAULTS = { days: '30', region: '', channel: '' };
const read = () => {
  const p = new URLSearchParams(window.location.search);
  return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, p.get(k) ?? v]));
};

/** Filters live in the URL: shareable links, Back button works. */
export function useUrlFilters() {
  const [filters, setFilters] = useState(read);
  useEffect(() => {
    const onPop = () => setFilters(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const update = useCallback((patch) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      const qs = new URLSearchParams(Object.entries(next).filter(([k, v]) => v !== DEFAULTS[k] && v !== '')).toString();
      window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      return next;
    });
  }, []);
  return [filters, update];
}

/** UI filters → API query (from/to computed from "last N days", UTC like the server). */
export function toQuery({ days, region, channel }) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to, region, channel };
}
:::

::: code javascript dashboard/client/src/hooks/useApi.js
import { useCallback, useEffect, useState } from 'react';

/** GET with abort on change; keeps the previous data while reloading (no flicker). */
export function useApi(path, params) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)).toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ data: s.data, error: null, loading: true }));        // keep old data visible while loading
    fetch(`/api${path}?${qs}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
        setState({ data: body, error: null, loading: false });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState((s) => ({ ...s, error: err.message, loading: false }));
      });
    return () => controller.abort();                 // filters changed → cancel the old request
  }, [path, qs, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
:::

::: code javascript dashboard/client/src/hooks/useEventSource.js
import { useEffect, useRef } from 'react';

/** Subscribes to an SSE endpoint; the browser reconnects automatically (server sends "retry: 3000"). */
export function useEventSource(url, eventName, onEvent, enabled = true) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!enabled) return undefined;
    const source = new EventSource(url);
    const listener = (e) => handler.current(JSON.parse(e.data));
    source.addEventListener(eventName, listener);
    return () => {
      source.removeEventListener(eventName, listener);
      source.close();
    };
  }, [url, eventName, enabled]);
}
:::

::: code jsx dashboard/client/src/components/Widget.jsx
/** Card shell: every widget loads and fails on its own. */
export function Widget({ title, loading, error, onRetry, children, className = '' }) {
  return (
    <section className={`widget ${className}`} aria-busy={loading} aria-label={title}>
      <header><h2>{title}</h2>{loading && <span className="spinner" aria-hidden="true" />}</header>
      {error ? (
        <div className="widget-error" role="alert">
          Couldn't load: {error} <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : children}
    </section>
  );
}
:::

::: code jsx dashboard/client/src/components/Filters.jsx
export function Filters({ value, onChange, meta }) {
  return (
    <form className="filters" aria-label="Dashboard filters" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Range</legend>
        {['7', '30', '90'].map((d) => (
          <label key={d} className={value.days === d ? 'chip active' : 'chip'}>
            <input type="radio" name="days" value={d} checked={value.days === d} onChange={() => onChange({ days: d })} /> {d} days
          </label>
        ))}
      </fieldset>
      <label>Region{' '}
        <select value={value.region} onChange={(e) => onChange({ region: e.target.value })}>
          <option value="">All</option>
          {meta?.region.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label>Channel{' '}
        <select value={value.channel} onChange={(e) => onChange({ channel: e.target.value })}>
          <option value="">All</option>
          {meta?.channel.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </form>
  );
}
:::

::: code jsx dashboard/client/src/components/KpiCards.jsx
import { formatChange, formatMoney, formatNumber, formatPercent } from '../format.js';

export function KpiCards({ data }) {
  if (!data) return <div className="kpis skeleton" />;
  const { current, change } = data;
  const cards = [
    ['Revenue', formatMoney(current.revenueCents), change.revenue, false],
    ['Orders', formatNumber(current.orders), change.orders, false],
    ['Avg order', formatMoney(current.avgOrderCents), change.avgOrder, false],
    ['Refund rate', formatPercent(current.refundRate), change.refundRate, true],     // lower is better
  ];
  return (
    <div className="kpis">
      {cards.map(([label, value, delta, lowerIsBetter]) => {
        const good = delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;
        return (
          <div key={label} className="kpi">
            <span className="kpi-label">{label}</span>
            <strong className="kpi-value">{value}</strong>
            <span className={`kpi-delta ${good === null ? '' : good ? 'up' : 'down'}`} aria-label={`${formatChange(delta)} versus previous period`}>
              {formatChange(delta)} <span className="muted">vs prev.</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
:::

::: code jsx dashboard/client/src/components/LineChart.jsx
import { formatCompactMoney, formatMoney } from '../format.js';

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

/** Responsive SVG line chart (viewBox scales to the container). */
export function LineChart({ points, label }) {
  if (!points?.length) return <div className="chart skeleton" />;
  const max = Math.max(...points.map((p) => p.revenueCents), 1);
  const x = (i) => PAD.left + (i / Math.max(1, points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.revenueCents).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const every = Math.ceil(points.length / 6);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="line-title">
        <title id="line-title">{label}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="axis">{formatCompactMoney(v)}</text>
          </g>
        ))}
        <path d={`${path} L${x(points.length - 1)},${H - PAD.bottom} L${x(0)},${H - PAD.bottom} Z`} className="area" />
        <path d={path} className="line" />
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <text key={p.bucket} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{p.bucket.slice(5)}</text>
        ))}
      </svg>
      {/* Same data for screen readers and keyboard users */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Date</th><th>Revenue</th><th>Orders</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.bucket}><td>{p.bucket}</td><td>{formatMoney(p.revenueCents)}</td><td>{p.orders}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
:::

::: code jsx dashboard/client/src/components/BarChart.jsx
import { formatCompactMoney, formatMoney } from '../format.js';

export function BarChart({ rows, label }) {
  if (!rows?.length) return <div className="chart skeleton" />;
  const max = Math.max(...rows.map((r) => r.revenueCents), 1);
  const rowH = 30;
  const H = rows.length * rowH + 8;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 400 ${H}`} role="img" aria-labelledby="bar-title">
        <title id="bar-title">{label}</title>
        {rows.map((r, i) => {
          const w = (r.revenueCents / max) * 250;
          return (
            <g key={r.key} transform={`translate(0 ${i * rowH + 4})`}>
              <text x="72" y="17" textAnchor="end" className="axis">{r.key}</text>
              <rect x="80" y="4" width={Math.max(2, w)} height="18" rx="4" className="bar" />
              <text x={86 + w} y="17" className="axis">{formatCompactMoney(r.revenueCents)}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Group</th><th>Revenue</th><th>Orders</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td>{formatMoney(r.revenueCents)}</td><td>{r.orders}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
:::

::: code jsx dashboard/client/src/components/OrdersTable.jsx
import { useEffect, useState } from 'react';
import { formatMoney } from '../format.js';

/** Raw orders with cursor pagination (independent of the charts). */
export function OrdersTable({ query }) {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();

  const load = async (after) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders?${qs}&limit=15${after ? `&cursor=${after}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error.message);
      setRows((prev) => (after ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(null); }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <table className="orders">
        <thead><tr><th>Time (UTC)</th><th>Region</th><th>Channel</th><th>Category</th><th className="num">Amount</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>{o.createdAt.slice(5, 16).replace('T', ' ')}</td><td>{o.region}</td><td>{o.channel}</td><td>{o.category}</td>
              <td className="num">{formatMoney(o.amountCents)}</td><td><span className={`status ${o.status}`}>{o.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="widget-error" role="alert">{error} <button type="button" onClick={() => load(null)}>Retry</button></p>}
      {cursor && <button type="button" className="more" disabled={loading} onClick={() => load(cursor)}>{loading ? 'Loading…' : 'Load more'}</button>}
    </div>
  );
}
:::

::: code jsx dashboard/client/src/components/LiveTicker.jsx
import { formatMoney } from '../format.js';

export function LiveTicker({ orders, live, onToggle }) {
  return (
    <div className="ticker">
      <div className="ticker-head">
        <span className={`dot ${live ? 'on' : ''}`} aria-hidden="true" />
        <strong>Live orders</strong>
        <button type="button" onClick={onToggle} aria-pressed={live}>{live ? 'Pause' : 'Resume'}</button>
      </div>
      <ol aria-live="off">
        {orders.map((o) => (
          <li key={o.id}>{o.createdAt.slice(11, 19)} · {o.region}/{o.channel} · {o.category} · <strong>{formatMoney(o.amountCents)}</strong></li>
        ))}
        {orders.length === 0 && <li className="muted">{live ? 'Waiting for new orders…' : 'Paused'}</li>}
      </ol>
    </div>
  );
}
:::

::: code jsx dashboard/client/src/App.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlFilters, toQuery } from './hooks/useUrlFilters.js';
import { useApi } from './hooks/useApi.js';
import { useEventSource } from './hooks/useEventSource.js';
import { Filters } from './components/Filters.jsx';
import { Widget } from './components/Widget.jsx';
import { KpiCards } from './components/KpiCards.jsx';
import { LineChart } from './components/LineChart.jsx';
import { BarChart } from './components/BarChart.jsx';
import { OrdersTable } from './components/OrdersTable.jsx';
import { LiveTicker } from './components/LiveTicker.jsx';

export default function App() {
  const [filters, setFilters] = useUrlFilters();
  const query = useMemo(() => toQuery(filters), [filters]);
  const [dimension, setDimension] = useState('region');
  const [granularity, setGranularity] = useState('day');   // don't shadow window.setInterval
  const [live, setLive] = useState(true);
  const [liveOrders, setLiveOrders] = useState([]);

  const meta = useApi('/meta', {});
  const kpis = useApi('/dashboard/kpis', query);
  const series = useApi('/dashboard/timeseries', { ...query, interval: granularity });
  const breakdown = useApi('/dashboard/breakdown', { ...query, dimension });

  // Throttle: many live events → at most one KPI refresh every 5 s
  const lastRefresh = useRef(0);
  const pending = useRef(null);
  const scheduleRefresh = useCallback(() => {
    if (pending.current) return;
    const wait = Math.max(0, 5000 - (Date.now() - lastRefresh.current));
    pending.current = setTimeout(() => {
      pending.current = null;
      lastRefresh.current = Date.now();
      kpis.reload();
      series.reload();
    }, wait);
  }, [kpis.reload, series.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(pending.current), []);

  useEventSource('/api/stream', 'order', (order) => {
    const matches = (!filters.region || order.region === filters.region) && (!filters.channel || order.channel === filters.channel);
    if (!matches) return;
    setLiveOrders((list) => [order, ...list].slice(0, 8));
    scheduleRefresh();
  }, live);

  return (
    <main className="page">
      <header className="top">
        <h1>📊 Sales dashboard</h1>
        <Filters value={filters} onChange={setFilters} meta={meta.data} />
      </header>

      <Widget title="Key metrics" loading={kpis.loading} error={kpis.error} onRetry={kpis.reload} className="span-2">
        <KpiCards data={kpis.data} />
      </Widget>

      <div className="grid">
        <Widget title="Revenue over time" loading={series.loading} error={series.error} onRetry={series.reload}>
          <div className="toggle" role="group" aria-label="Interval">
            {['day', 'week'].map((i) => <button key={i} type="button" aria-pressed={granularity === i} onClick={() => setGranularity(i)}>{i}</button>)}
          </div>
          <LineChart points={series.data?.points} label={`Revenue per ${granularity}, last ${filters.days} days`} />
        </Widget>

        <Widget title="Breakdown" loading={breakdown.loading} error={breakdown.error} onRetry={breakdown.reload}>
          <div className="toggle" role="group" aria-label="Group by">
            {['region', 'channel', 'category'].map((d) => <button key={d} type="button" aria-pressed={dimension === d} onClick={() => setDimension(d)}>{d}</button>)}
          </div>
          <BarChart rows={breakdown.data?.rows} label={`Revenue by ${dimension}`} />
        </Widget>
      </div>

      <div className="grid">
        <Widget title="Recent orders" loading={false} error={null}>
          <OrdersTable query={query} />
        </Widget>
        <Widget title="Live" loading={false} error={null}>
          <LiveTicker orders={liveOrders} live={live} onToggle={() => setLive((v) => !v)} />
        </Widget>
      </div>
    </main>
  );
}
:::

::: code jsx dashboard/client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code css dashboard/client/src/styles.css
:root { --bg: #f5f6fa; --card: #fff; --border: #dbe1ea; --text: #0f172a; --muted: #64748b; --accent: #6366f1; --accent-soft: rgba(99, 102, 241, 0.15); }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1020; --card: #111827; --border: #273449; --text: #e2e8f0; --muted: #94a3b8; --accent: #818cf8; --accent-soft: rgba(129, 140, 248, 0.18); } }
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--text); }
.page { max-width: 1200px; margin: 0 auto; padding: 20px 16px; display: grid; gap: 16px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.top h1 { margin: 0; font-size: 22px; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.filters fieldset { border: 0; padding: 0; margin: 0; display: flex; gap: 6px; }
.filters legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.chip { border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; cursor: pointer; background: var(--card); }
.chip input { position: absolute; opacity: 0; }
.chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.chip:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
.widget { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; min-width: 0; }
.widget header { display: flex; justify-content: space-between; align-items: center; }
.widget h2 { margin: 0 0 8px; font-size: 15px; color: var(--muted); font-weight: 600; }
.widget-error { color: #b91c1c; }
.spinner { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
.kpi { display: flex; flex-direction: column; gap: 4px; }
.kpi-label { color: var(--muted); font-size: 13px; }
.kpi-value { font-size: 24px; }
.kpi-delta { font-size: 13px; }
.kpi-delta.up { color: #059669; }
.kpi-delta.down { color: #dc2626; }
.chart { margin: 0; }
.chart svg { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--border); stroke-dasharray: 4 4; }
.chart .axis { fill: var(--muted); font-size: 11px; }
.chart .line { fill: none; stroke: var(--accent); stroke-width: 2.5; }
.chart .area { fill: var(--accent-soft); }
.chart .bar { fill: var(--accent); }
.skeleton { min-height: 160px; border-radius: 8px; background: linear-gradient(90deg, var(--border), transparent, var(--border)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton, .spinner { animation: none; } }
.toggle { display: flex; gap: 6px; margin-bottom: 8px; }
.toggle button, select, .more, .ticker button, .widget-error button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; }
.toggle button[aria-pressed='true'] { background: var(--accent); color: #fff; border-color: var(--accent); }
.orders { width: 100%; border-collapse: collapse; font-size: 13px; }
.orders th, .orders td { padding: 6px; border-bottom: 1px solid var(--border); text-align: left; }
.orders .num { text-align: right; }
.status.refunded { color: #dc2626; }
.more { margin-top: 10px; }
.ticker-head { display: flex; align-items: center; gap: 8px; }
.ticker-head button { margin-left: auto; }
.ticker ol { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 6px; font-size: 13px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.dot.on { background: #10b981; }
.muted { color: var(--muted); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
:::

::: code dockerfile dashboard/Dockerfile
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4700
EXPOSE 4700
USER node
CMD ["node", "src/index.js"]
:::

::: code yaml dashboard/docker-compose.yml
# docker compose up -d --build   →   http://localhost:4700
services:
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      retries: 20

  app:
    build: .
    ports:
      - "4700:4700"
    environment:
      MONGO_URL: mongodb://mongo:27017/dashboard
      LIVE_ORDERS: "true"
    depends_on:
      mongo:
        condition: service_healthy

volumes:
  mongo_data:
:::

::: code javascript Browser simulation: rollups, freshness-aware cache and throttled refresh (runnable)
// Proves why rollups + cache work: same answers as raw scans, far fewer rows read, correct invalidation.
const orders = [];
const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 4000; i++) orders.push({ day: days[i % 4], region: ['north', 'south'][Math.floor(i / 4) % 2], amountCents: 1000 + Math.floor(rnd() * 9000) });
const rollups = new Map();
for (const o of orders) { const k = `${o.day}|${o.region}`; const r = rollups.get(k) || { day: o.day, region: o.region, revenueCents: 0, orders: 0 }; r.revenueCents += o.amountCents; r.orders += 1; rollups.set(k, r); }
const sumRaw = (from, to) => orders.filter((o) => o.day >= from && o.day <= to).reduce((s, o) => s + o.amountCents, 0);
const sumRoll = (from, to) => [...rollups.values()].filter((r) => r.day >= from && r.day <= to).reduce((s, r) => s + r.revenueCents, 0);

const cache = new Map();
let computes = 0;
function cachedSum(from, to, today) {
  const key = `${from}|${to}`, hit = cache.get(key);
  if (hit) return hit.value;
  computes++;
  const value = sumRoll(from, to);
  cache.set(key, { value, from, to, ttl: to >= today ? 3000 : 600000 });
  return value;
}
const invalidate = (day) => { for (const [k, e] of cache) if (e.from <= day && e.to >= day) cache.delete(k); };
function makeThrottle(waitMs) { let last = -Infinity, calls = 0; return { hit(now) { if (now - last >= waitMs) { last = now; calls++; } }, get calls() { return calls; } }; }

// ---------- tests ----------
console.log('rollups give the same revenue as scanning raw orders', sumRaw('2026-09-29', '2026-10-01') === sumRoll('2026-09-29', '2026-10-01') ? '✅' : '❌ FAIL');
console.log('rows read: raw', orders.length, 'vs rollups', rollups.size, rollups.size === 8 ? '✅' : '❌ FAIL');
const today = '2026-10-01';
cachedSum('2026-09-28', '2026-09-30', today); cachedSum('2026-09-28', '2026-10-01', today);
cachedSum('2026-09-28', '2026-09-30', today); cachedSum('2026-09-28', '2026-10-01', today);
console.log('4 requests, 2 distinct ranges → computes:', computes, computes === 2 ? '✅' : '❌ FAIL');
console.log('history range gets a long TTL, today range a short one', cache.get('2026-09-28|2026-09-30').ttl === 600000 && cache.get('2026-09-28|2026-10-01').ttl === 3000 ? '✅' : '❌ FAIL');
invalidate(today);                                         // a new order arrives today
console.log('new order today → only the range containing today is dropped', cache.has('2026-09-28|2026-09-30') && !cache.has('2026-09-28|2026-10-01') ? '✅' : '❌ FAIL');
const t = makeThrottle(5000);
for (let ms = 0; ms < 20000; ms += 500) t.hit(ms);          // 40 live events in 20 s
console.log('40 live events in 20 s → KPI refreshes:', t.calls, t.calls === 4 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
**Local (in-memory):** `cd dashboard/server && npm install && npm run dev` → "🌱 Seeded ~37,000 orders → ~5,000 rollup rows", then `cd dashboard/client && npm install && npm run dev` → `http://localhost:5173`.
**Docker + MongoDB:** `cd dashboard && docker compose up -d --build` → `http://localhost:4700`.

**curl**
`curl -s localhost:4700/api/meta` → `{"region":[…],"channel":[…],"category":[…],"today":"…","orders":37xxx,"rollups":5xxx,…}`
`curl -si "localhost:4700/api/dashboard/kpis?from=2026-08-01&to=2026-08-31" | grep -i 'x-cache\|cache-control'` → `X-Cache: MISS`, `Cache-Control: private, max-age=600`; run it again → `X-Cache: HIT`.
The same for a range ending today → `max-age=3`, and new live orders invalidate it.
`curl -s "localhost:4700/api/dashboard/timeseries?interval=week&region=north"` → weekly buckets starting on Mondays, missing days filled with 0.
`curl -s "localhost:4700/api/dashboard/breakdown?dimension=category"` → categories sorted by revenue.
`curl -s "localhost:4700/api/orders?limit=3"` → newest 3 orders + `nextCursor`; `&cursor=<value>` → the next 3.
`curl -N localhost:4700/api/stream` → `event: order` frames every ~2 s (Ctrl+C to stop).
`curl -s "localhost:4700/api/dashboard/kpis?from=2026-09-30&to=2026-09-01"` → **400** `from/to must be YYYY-MM-DD and from <= to`.

**In the UI:** switch 7/30/90 days and region → URL changes, all widgets reload independently (each shows its own spinner); stop the server → widgets show "Couldn't load … Retry"; restart → Retry works and the live ticker reconnects by itself. Watch the KPI numbers move every ~5 s while orders stream in (throttled), not on every event.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Aggregation | Aggregate raw orders per request | **Rollups updated on write** (or materialized views / scheduled batch) | Rollups for dashboards; raw queries only for drill-down |
| Analytics store | Same OLTP database (this) | **OLAP**: ClickHouse, BigQuery, Druid, Timescale | OLAP when data or dimensions grow; stream via CDC/Kafka |
| Live updates | Polling every N s | **SSE** (one-way, auto-reconnect, plain HTTP) / WebSocket | SSE for dashboards; WebSocket if the client also sends |
| Refresh strategy | Refetch per event | **Throttle / debounce** + push deltas | Throttle; push small deltas when many viewers |
| Charts | Chart library (Recharts, ECharts, Chart.js) | **Hand-made SVG** (this) | Library for rich interactions (zoom, tooltips); SVG for small, fast, accessible widgets |
| Caching | No cache | **TTL by freshness + invalidation on write** | Long TTL for history, short for "today"; CDN cannot cache private data |
:::

::: text 📈 Scaling & edge cases
- **Millions of orders/day**: write orders to a queue (Kafka/Kinesis) and let a stream processor update rollups (minute + day granularity); dashboards read the OLAP store; backfill rollups with batch jobs when logic changes.
- **High cardinality** (e.g. per-product rollups): keep top-N tables, approximate counts (HyperLogLog), or query OLAP directly.
- **Many viewers**: share the cache across instances (Redis), fan-out SSE through a pub/sub, send one snapshot per N seconds instead of per order.
- **Front-end performance**: lazy-load below-the-fold widgets (IntersectionObserver), virtualize long tables, avoid re-rendering charts on every live event (memoise), downsample long series (90 days → weekly).
- **Edge cases**: time zones and DST (bucket by the business time zone), late or refunded orders changing past days (invalidate that day's cache), empty ranges (fill zeros), division by zero in % change (show "n/a"), clock skew between servers (use server timestamps).
:::

::: warning ⚠️ Common mistakes
- Running `$group` over the full orders collection on every page load.
- One giant endpoint for the whole dashboard → one slow query blocks every widget.
- Refetching everything on every live event (self-inflicted DDoS).
- Caching "today" for 10 minutes (stale numbers) or caching nothing (slow history).
- Charts that are pure canvas/SVG with no labels or data table → inaccessible.
:::

::: understand
- Dashboards are **read-heavy, write-continuous** systems. Move work from read time to write time (rollups), and cache according to **how often the answer can change**.
- The client mirrors this: independent widgets, filters in the URL, push for "something changed" plus throttled pull for "the new numbers".
:::

::: important ⭐ How to present this design in 5 minutes
> "Every order write inserts the raw order and increments a daily rollup keyed by day, region, channel and category, so KPI, time-series and breakdown endpoints aggregate a few thousand rollup rows instead of millions of orders; in production that write path would be a stream processor feeding an OLAP store. Read endpoints share a cache keyed by the normalised query with TTL based on freshness: ranges that include today live seconds, history lives minutes, and a new order invalidates only cache entries whose range contains that day. KPIs compare with the previous period of the same length. New orders are pushed over Server-Sent Events; the client prepends them to a live ticker and throttles KPI refreshes to one every five seconds. On the frontend, filters live in the URL, each widget fetches independently with abort, skeleton, error and retry, charts are responsive SVG with a hidden data table for accessibility, and the raw orders table uses cursor pagination."
:::

::: links
MDN: Using server-sent events | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
MongoDB: Aggregation pipeline | https://www.mongodb.com/docs/manual/core/aggregation-pipeline/
ClickHouse: Materialized views | https://clickhouse.com/docs/en/materialized-view
W3C WAI: Complex images (charts) | https://www.w3.org/WAI/tutorials/images/complex/
:::
