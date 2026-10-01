@section Full-Stack Integration
@icon 🔗
@color #7c3aed
@desc React ↔ Node ↔ MongoDB end-to-end, built as ONE tested project (Express 5, Mongoose 9, React 19, React Router 8, TanStack Query 5, S3 presigned uploads, Docker): API layers, auth, errors, pagination, uploads, UI states, performance and production design.

=== How does React communicate with your Node.js backend?
@p 3
@tags react, http, cors, proxy
@quick
- The browser runs React; React sends **HTTP requests** (`fetch`) to the Express **REST API** and gets **JSON** back; server push uses **WebSocket or SSE**.
- Dev: the **Vite proxy** forwards `/api` to `localhost:4000` → same origin, no CORS. Prod: **Nginx/CloudFront** serves the React build and proxies `/api` → still same origin.
- Different origins (`app.example.com` → `api.example.com`) need **CORS**: an allowlist, `credentials: true` for cookies, and **preflight** `OPTIONS` requests for JSON bodies or custom headers.
- One API client (`api/http.js`) owns the base URL, token header, cookies and error format; components never call `fetch` directly.
- This whole section is one working project (`fullstack-app/`); the complete file list is in the last question.

::: text 🧒 In simple words
React lives in the user's browser, the Node API lives on a server, and they talk like **a customer and a shop counter using order slips**. React writes a slip ("GET my orders"), hands it over the internet, and the counter returns a slip with the answer in JSON. The browser has a security guard (the **same-origin policy**): it only lets JavaScript read answers from **the same shop address** it was loaded from, unless that other shop says "I trust you" (CORS). The easiest setup is to put the website and the API **behind one front door** (Nginx or the Vite dev proxy), so the guard never has to check.
:::

::: text 📖 Detailed answer
### The request path in this project
1. A component calls a hook (`useOrders`), which calls the API client: `fetch('/api/v1/orders', { credentials: 'include', headers: { Authorization: 'Bearer …' } })`.
2. In development the browser talks only to **Vite** (`localhost:5173`); Vite's proxy forwards `/api/*` to Express on `localhost:4000`.
3. In production the browser talks only to **Nginx** (or CloudFront): `/` and `/assets/*` are the static React build, `/api/*` is proxied to the Node containers.
4. Express runs middleware (request id, Helmet, CORS if configured, compression, JSON parser, cookies) → router → handler → MongoDB.
5. JSON comes back; TanStack Query caches it; components re-render.

### Same origin vs CORS
| Setup | Origin of page | API URL | CORS needed? |
|---|---|---|---|
| Vite dev proxy | `http://localhost:5173` | `/api/v1/...` (same origin) | No |
| Nginx / CloudFront in front of both | `https://app.example.com` | `/api/v1/...` | No |
| Separate API domain | `https://app.example.com` | `https://api.example.com/v1` | **Yes** |

### When the browser sends a preflight (Fetch standard)
| Request | Preflight `OPTIONS` first? |
|---|---|
| `GET` with no custom headers | No ("simple request") |
| `POST` with `Content-Type: application/json` | **Yes** |
| Any request with `Authorization` header | **Yes** |
| Same request again within `Access-Control-Max-Age` | No (cached) |
So a cross-origin JSON API can cost **two round trips** per call until the preflight is cached (`maxAge: 600` in this project's CORS config). Same-origin setups avoid it entirely.

### Communication options
| Need | Technology |
|---|---|
| CRUD, request/response | REST over HTTPS (or GraphQL/tRPC) |
| Server pushes updates | WebSocket (two-way), **SSE** (one-way, simple, auto-reconnect), long polling |
| File upload | **S3 presigned URL** (browser → S3 directly), or multipart to the API for small files |
:::

::: diagram One front door in dev and prod
flowchart LR
  subgraph Browser
    RC["React components"] --> RQ["TanStack Query hooks"] --> HC["api/http.js: fetch, token, errors"]
  end
  HC -->|"dev: localhost:5173/api"| VITE["Vite dev server proxy"]
  HC -->|"prod: https://app/api"| NG["Nginx or CloudFront"]
  VITE --> EX["Express API :4000"]
  NG -->|"/api/*"| EX
  NG -->|"/ and /assets/*"| ST["React build (static files)"]
  EX --> DB[("MongoDB")]
:::

::: image A customer and a shop counter behind one front door, with the browser's security guard
/images/fullstack-integration/communication.svg
:::

::: text 🪜 Step by step
What happens when the Orders page loads in production (`https://app.example.com/orders`):
1. Nginx serves `index.html` (`Cache-Control: no-cache`) and the hashed JS/CSS from `/assets/` (cached for a year).
2. React Router renders `OrdersPage`; `useOrders()` asks TanStack Query for `['orders','list']`.
3. Nothing cached → `fetch('/api/v1/orders')` with the access token; same origin, so no CORS and no preflight.
4. Nginx adds `X-Request-Id` and `X-Forwarded-*` headers and proxies to `api:4000`.
5. Express authenticates, queries MongoDB (scoped to the user), returns `{ data: [...] }`, gzip-compressed.
6. The response is cached in TanStack Query; the list renders; the request id appears in both Nginx and API logs for tracing.
:::

::: code javascript fullstack-app/web/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the browser only talks to Vite (localhost:5173); Vite forwards /api to the Express API → same origin, no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:4000', changeOrigin: true } },
    fs: { allow: ['..'] },                                           // allow importing ../shared/permissions.mjs
  },
});
:::
::: code nginx fullstack-app/web/nginx.conf
# One origin for everything: the browser talks only to Nginx, so no CORS is needed for the API.
server {
  listen 80;
  root /usr/share/nginx/html;

  location /api/ {
    proxy_pass http://api:4000;                      # the "api" service in docker-compose
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;       # same id in Nginx and API logs
  }

  location /assets/ {                                # hashed file names → cache for a year
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location / {
    add_header Cache-Control "no-cache";             # index.html must always be fresh
    try_files $uri /index.html;                      # SPA fallback for client-side routes
  }

  gzip on;
  gzip_types application/javascript text/css application/json image/svg+xml;
}
:::
::: code javascript fullstack-app/api/src/app.js
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);                                       // behind Nginx/ALB: real client IP and protocol
  app.disable('x-powered-by');

  app.use((req, res, next) => {                                    // request id + one log line per request
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    const start = performance.now();
    res.on('finish', () => { if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${(performance.now() - start).toFixed(1)}ms id=${req.id}`); });
    next();
  });
  app.use(helmet());
  // CORS only matters when the React app is served from a DIFFERENT origin (e.g. app.example.com → api.example.com).
  if (config.corsOrigins.length) {
    app.use(cors({ origin: config.corsOrigins, credentials: true, maxAge: 600, exposedHeaders: ['X-Request-Id', 'Location'] }));
  }
  app.use(compression({ threshold: 1024 }));                       // gzip responses larger than 1 KB
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/users', require('./routes/users'));
  app.use('/api/v1/orders', require('./routes/orders'));
  app.use('/api/v1/uploads', require('./routes/uploads'));
  app.use('/api/v1/dashboard', require('./routes/dashboard').router);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
:::

::: code javascript Browser demo: does this request need a CORS preflight? (runnable)
// Implements the Fetch-standard rules browsers use to decide on a preflight OPTIONS request.
const SIMPLE_METHODS = ['GET', 'HEAD', 'POST'];
const SIMPLE_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const SAFE_HEADERS = ['accept', 'accept-language', 'content-language', 'content-type'];

function needsPreflight({ pageOrigin, url, method = 'GET', headers = {} }) {
  if (new URL(url, pageOrigin).origin === pageOrigin) return false;           // same origin: no CORS at all
  if (!SIMPLE_METHODS.includes(method)) return true;
  for (const [name, value] of Object.entries(headers)) {
    const h = name.toLowerCase();
    if (!SAFE_HEADERS.includes(h)) return true;                               // e.g. Authorization
    if (h === 'content-type' && !SIMPLE_TYPES.includes(value.split(';')[0].trim())) return true;
  }
  return false;
}

const app = 'https://app.example.com';
const cases = [
  ['same origin JSON POST', { pageOrigin: app, url: '/api/v1/orders', method: 'POST', headers: { 'Content-Type': 'application/json' } }, false],
  ['cross-origin plain GET', { pageOrigin: app, url: 'https://api.example.com/v1/health' }, false],
  ['cross-origin JSON POST', { pageOrigin: app, url: 'https://api.example.com/v1/orders', method: 'POST', headers: { 'Content-Type': 'application/json' } }, true],
  ['cross-origin GET with Authorization', { pageOrigin: app, url: 'https://api.example.com/v1/orders', headers: { Authorization: 'Bearer x' } }, true],
  ['cross-origin PATCH', { pageOrigin: app, url: 'https://api.example.com/v1/orders/1', method: 'PATCH' }, true],
];
for (const [label, req, expected] of cases) {
  console.log(`${label}: preflight ${needsPreflight(req) ? 'YES' : 'no'}`, needsPreflight(req) === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- `cors()` with no options (allows every origin) or `origin: '*'` together with cookies (browsers reject it).
- Hard-coding `http://localhost:4000` in components instead of one base URL in the API client.
- Thinking CORS protects the API: it only controls which **browser pages** may read responses; curl and attackers ignore it.
- Forgetting the SPA fallback (`try_files $uri /index.html`) → refreshing `/orders` gives 404.
- Caching `index.html` for a long time → users keep loading old JS after a deploy.
:::

::: understand
- The simplest robust setup is **one origin**: Vite proxy in dev, Nginx/CloudFront in prod.
- CORS is a browser rule; authentication and authorization still protect the API.
- A single API client module is the seam where tokens, errors, retries and base URLs live.
:::

::: ask
- *"Are web and API on the same domain?"* (decides CORS and cookie `SameSite` settings)
- *"Is there a CDN, API gateway or BFF in between?"*
- *"Do we need real-time updates?"* (WebSocket vs SSE vs polling)
:::

::: important ⭐ Say this in the interview
"React runs in the browser and calls the Node API over HTTPS with fetch, getting JSON back; for server push I'd use SSE or WebSockets. I prefer one origin: in development the Vite proxy forwards /api to Express, and in production Nginx or CloudFront serves the static React build and proxies /api to the Node containers, so there's no CORS and no preflight round trips. If the API must live on another domain, I configure CORS with an explicit allowlist, credentials true for the refresh cookie and a preflight max-age, remembering CORS is a browser rule, not API security. All HTTP goes through one client module that adds the token, sends cookies, normalises errors and retries after a token refresh."
:::

::: links
MDN: Cross-Origin Resource Sharing (CORS) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
Vite: server.proxy | https://vite.dev/config/server-options#server-proxy
Express: cors middleware | https://expressjs.com/en/resources/middleware/cors.html
:::

=== How do you structure API calls in React?
@p 3
@tags react-query, api-layer, architecture
@quick
- Layers: **component → hook (`useOrders`) → TanStack Query → endpoint function (`ordersApi.list`) → HTTP client (`api/http.js`)**.
- Components never build URLs or call `fetch`; endpoints live in one module; query keys come from one `keys` object.
- TanStack Query gives **caching, request de-duplication, retries, background refetch, cancellation (`signal`), pagination helpers and optimistic updates**.
- Measured: 5 components needing the same data made **5 requests with `useEffect` + fetch** vs **1 with TanStack Query**.
- Mutations invalidate or update the affected queries (`invalidateQueries`, `setQueryData`).

::: text 🧒 In simple words
Imagine five people in an office all asking the **same question** to a supplier. Without a system, each phones separately: five calls, five answers that may not even match. With a **receptionist** (TanStack Query), everyone asks the receptionist; she makes **one** call, writes the answer on a board, and anyone who asks again gets it from the board until it's "too old", when she quietly calls again. Behind her there's a single **phone book** (the endpoints module) and a single **phone** (the HTTP client) that knows the number, the password and how to report problems.
:::

::: text 📖 Detailed answer
### Layered data architecture (this project)
| Layer | File | Responsibility |
|---|---|---|
| HTTP client | `api/http.js` | Base URL, `credentials`, `Authorization` header, error normalisation (`ApiError`), single-flight token refresh |
| Endpoints | `api/endpoints.js` | One function per endpoint: `ordersApi.list(signal)`, `usersApi.list(params, signal)` |
| Query hooks | `api/hooks.js` | Query keys, `staleTime`, `placeholderData`, prefetch, optimistic updates |
| Query client | `queryClient.js` | Global retry policy, global error toasts |
| Components | `pages/*.jsx` | Render loading/error/empty/success; no URLs, no fetch |

### Why this pays off
- **One place to change** an endpoint, header or error format.
- **Consistent caching**: the same key = the same cache entry everywhere (`['orders','list']`).
- **Testable**: mock `endpoints.js`, or run the real app against a test API (as done for this project with jsdom).
- **Cancellation**: TanStack Query passes an `AbortSignal`; leaving a page or changing filters aborts stale requests.

### Measured: de-duplication (React 19, 5 components mounted together, same data)
| Approach | HTTP requests |
|---|---|
| `useEffect(() => fetch(...))` in each component | 5 |
| `useQuery({ queryKey: ['health'] })` in each component | **1** |
(In development `StrictMode` can double effects, making the `useEffect` version even worse.)
:::

::: diagram Layers between a component and the network
flowchart TD
  C["OrdersPage component"] --> H["useOrders() hook"]
  H --> Q["TanStack Query: cache, dedupe, retry, cancel"]
  Q --> E["ordersApi.list(signal)"]
  E --> HTTP["api/http.js: fetch, token, errors, refresh"]
  HTTP --> S(["Express /api/v1/orders"])
:::

::: chart bar Measured: requests made by 5 components needing the same data
Approach,HTTP requests
useEffect + fetch in each component,5
TanStack Query useQuery,1
:::

::: image A receptionist with a notice board instead of five separate phone calls
/images/fullstack-integration/api-layers.svg
:::

::: text 🪜 Step by step
What happens when `OrdersPage` and a header badge both call `useOrders()`:
1. The first `useQuery(['orders','list'])` finds no cache entry → calls `ordersApi.list(signal)` → `api('/orders')` → `fetch`.
2. The second component subscribes to the **same key** while the request is in flight → no second request.
3. The JSON arrives; TanStack Query stores it with a timestamp; both components re-render.
4. For `staleTime` (10 s) the data is fresh: navigating back shows it instantly with no request.
5. After it's stale, the next mount or window focus triggers a **background refetch**; the old data stays visible meanwhile.
6. A mutation (star an order) updates the cache optimistically, then `invalidateQueries(['orders'])` refetches the truth.
:::

::: code javascript fullstack-app/web/src/api/http.js
// The ONLY place that talks HTTP. Adds the token, normalises errors, refreshes an expired session once.
const BASE = import.meta.env?.VITE_API_URL ?? '/api/v1';            // same origin in dev (Vite proxy) and prod (Nginx)

let accessToken = null;                                              // memory only: not readable by other tabs or XSS-persisted
export const setAccessToken = (token) => { accessToken = token; };
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    Object.assign(this, { name: 'ApiError', status, code, details, requestId });
  }
}

async function rawRequest(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      signal,
      credentials: 'include',                                          // send the httpOnly refresh cookie
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;                        // React Query cancelled it: not an error to show
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network problem. Check your connection and try again.' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      code: data?.error?.code ?? `HTTP_${res.status}`,
      message: data?.error?.message ?? res.statusText,
      details: data?.error?.details,
      requestId: data?.error?.requestId ?? res.headers.get('x-request-id'),
    });
  }
  return data;
}

// Single flight: if 5 requests hit "token expired" together, only ONE refresh call is made; all 5 wait for it.
let refreshing = null;
export function refreshSession() {
  refreshing ??= rawRequest('/auth/refresh', { method: 'POST' })
    .then((data) => { setAccessToken(data.accessToken); return data; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'TOKEN_EXPIRED' && !options.retried) {
      try { await refreshSession(); } catch (refreshErr) { setAccessToken(null); onSessionExpired(); throw refreshErr; }
      return api(path, { ...options, retried: true });               // retry the original request once
    }
    throw err;
  }
}
:::
::: code javascript fullstack-app/web/src/api/endpoints.js
// One function per endpoint. Components and hooks never build URLs themselves.
import { api, refreshSession } from './http';

const query = (params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return qs ? `?${qs}` : '';
};

export const authApi = {
  login: (body) => api('/auth/login', { method: 'POST', body }),
  register: (body) => api('/auth/register', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  restore: () => refreshSession(),                                    // on page load: memory is empty, the cookie isn't
};

export const usersApi = {
  list: ({ page, limit, q }, signal) => api(`/users${query({ page, limit, q })}`, { signal }),
  updateMe: (body) => api('/users/me', { method: 'PATCH', body }).then((r) => r.user),
};

export const ordersApi = {
  list: (signal) => api('/orders', { signal }).then((r) => r.data),
  get: (id, signal) => api(`/orders/${id}`, { signal }).then((r) => r.data),
  create: (items) => api('/orders', { method: 'POST', body: { items } }).then((r) => r.data),
  update: (id, patch) => api(`/orders/${id}`, { method: 'PATCH', body: patch }).then((r) => r.data),
};

export const uploadsApi = {
  presignAvatar: (file) => api('/uploads/avatar/presign', { method: 'POST', body: { contentType: file.type, size: file.size } }),
  confirmAvatar: (key) => api('/uploads/avatar/confirm', { method: 'POST', body: { key } }),
  // Straight to S3 with XMLHttpRequest (fetch has no upload progress). No Authorization header: the URL is the permission.
  putFile: (url, file, headers, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed: network or CORS problem'));
    xhr.send(file);
  }),
};
:::
::: code javascript fullstack-app/web/src/api/hooks.js
// React Query wiring: cache keys, staleness, prefetching and optimistic updates live here, not in components.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, usersApi } from './endpoints';

export const keys = {
  users: (params) => ['users', 'list', params],
  orders: () => ['orders', 'list'],
  order: (id) => ['orders', 'detail', id],
};

export function useUsers(params) {
  return useQuery({
    queryKey: keys.users(params),
    queryFn: ({ signal }) => usersApi.list(params, signal),         // signal: cancelled if params change mid-flight
    placeholderData: keepPreviousData,                              // keep page 2 on screen while page 3 loads
    staleTime: 30_000,
  });
}

export function usePrefetchUsers() {
  const qc = useQueryClient();
  return (params) => qc.prefetchQuery({ queryKey: keys.users(params), queryFn: ({ signal }) => usersApi.list(params, signal), staleTime: 30_000 });
}

export function useOrders() {
  return useQuery({ queryKey: keys.orders(), queryFn: ({ signal }) => ordersApi.list(signal), staleTime: 10_000 });
}

// Optimistic star toggle: update the UI now, roll back if the server says no.
export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }) => ordersApi.update(id, { starred }),
    onMutate: async ({ id, starred }) => {
      await qc.cancelQueries({ queryKey: keys.orders() });          // don't let an older refetch overwrite us
      const previous = qc.getQueryData(keys.orders());
      qc.setQueryData(keys.orders(), (old = []) => old.map((o) => (o.id === id ? { ...o, starred } : o)));
      return { previous };
    },
    onError: (err, vars, context) => qc.setQueryData(keys.orders(), context.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.orders() }),
  });
}

export function useUpdateProfile() {
  return useMutation({ mutationFn: usersApi.updateMe, meta: { handlesOwnErrors: true } });
}
:::

::: code javascript Browser demo: in-flight de-duplication and freshness, the core of a query cache (runnable)
function createQueryCache({ staleTime }) {
  const entries = new Map();
  let networkCalls = 0;
  return {
    async fetch(key, fn) {
      const k = JSON.stringify(key);
      const e = entries.get(k);
      if (e?.promise) return e.promise;                                      // same request already in flight
      if (e && Date.now() - e.updatedAt < staleTime) return e.data;          // fresh enough
      networkCalls += 1;
      const promise = fn().then((data) => { entries.set(k, { data, updatedAt: Date.now() }); return data; });
      entries.set(k, { ...e, promise });
      return promise;
    },
    get networkCalls() { return networkCalls; },
  };
}
const fakeApi = () => new Promise((r) => setTimeout(() => r([{ id: 1, total: 600 }]), 20));
(async () => {
  const cache = createQueryCache({ staleTime: 10_000 });
  const results = await Promise.all(Array.from({ length: 5 }, () => cache.fetch(['orders', 'list'], fakeApi)));
  console.log('5 components got the same data', results.every((r) => r === results[0]) ? '✅' : '❌ FAIL');
  console.log('only 1 network call for 5 subscribers', cache.networkCalls === 1 ? '✅' : '❌ FAIL');
  await cache.fetch(['orders', 'list'], fakeApi);
  console.log('a later mount within staleTime uses the cache', cache.networkCalls === 1 ? '✅' : '❌ FAIL');
  await cache.fetch(['orders', 'detail', 7], fakeApi);
  console.log('a different key is a different request', cache.networkCalls === 2 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `fetch` inside `useEffect` in every component: duplicated requests, race conditions, no caching, no cancellation.
- Copying server data into `useState`/Redux and then keeping two copies in sync.
- Inconsistent query keys (`['orders']` here, `['order-list']` there) → invalidation misses.
- Ignoring the `signal` → slow responses for an old filter overwrite the new one.
- Putting URLs and headers in components, so an API change means editing 30 files.
:::

::: understand
- Server state (data owned by the backend) is a **cache problem**, not a `useState` problem.
- The HTTP client, endpoints and hooks are three small layers that keep components declarative.
- The same architecture works with RTK Query or SWR; the interview point is the layering and the cache semantics.
:::

::: ask
- *"Do we already use TanStack Query, RTK Query or SWR?"*
- *"Is the API described by OpenAPI?"* (generate typed endpoint functions)
- *"How fresh must each screen be?"* (decides `staleTime` per query)
:::

::: important ⭐ Say this in the interview
"I keep three thin layers. One HTTP client module owns fetch, the base URL, credentials, the bearer token, error normalisation and the token refresh. An endpoints module has one function per API call. Hooks wrap TanStack Query with consistent query keys, staleTime, prefetching and optimistic updates, so components only render states. The query cache de-duplicates and caches: five components needing the same data made five requests with useEffect and fetch, but one with useQuery. It also retries, cancels stale requests with the AbortSignal, and refetches in the background; mutations invalidate or update the affected keys."
:::

::: links
TanStack Query: Overview | https://tanstack.com/query/latest/docs/framework/react/overview
TanStack Query: Query cancellation | https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
TkDodo: Effective React Query keys | https://tkdodo.eu/blog/effective-react-query-keys
:::

=== How do you handle authentication between frontend and backend?
@p 3
@tags auth, react, jwt, protected-routes
@quick
- Login → API returns a short-lived **access token** (kept in **memory**) and sets a **refresh token** in an **httpOnly, SameSite** cookie scoped to `/api/v1/auth`.
- On page load memory is empty → `POST /auth/refresh` restores the session; a **ProtectedRoute** waits ("checking"), then renders or redirects to `/login` remembering `from`.
- Expired access token → 401 `TOKEN_EXPIRED` → **one** refresh (single flight) → retry the request; refresh fails → log out everywhere (BroadcastChannel).
- Refresh tokens **rotate** and reuse is detected; measured: 5 parallel expired requests made **5 refresh calls and 2 failures** naively vs **1 refresh call, 0 failures** with single flight.
- Frontend guards are UX; the API checks the token and permissions on **every** request.

::: text 🧒 In simple words
Think of a **festival wristband and a ticket in a locked locker**. The wristband (access token) gets you into tents quickly but expires every 15 minutes. The ticket (refresh token) sits in a locker only the festival office can open (an httpOnly cookie that JavaScript can't read). When your wristband expires, you go to the office **once** and get a new wristband and a new ticket; the old ticket stops working. If five friends sharing your account all ran to the office at the same moment with the same old ticket, the office would think it was stolen and cancel everything, so you send **one** person and the others wait for them.
:::

::: text 📖 Detailed answer
### Token design in this project
| Token | Lifetime | Stored | Sent how |
|---|---|---|---|
| Access JWT (`sub`, `role`) | 15 min | JS memory (module variable) | `Authorization: Bearer …` |
| Refresh JWT (`sub`, `jti`) | 7 days | httpOnly, `SameSite=Lax`, `Secure` (prod) cookie, `Path=/api/v1/auth` | Automatically by the browser, only to auth endpoints |

**Rotation + reuse detection**: each refresh issues a new refresh token with a new `jti` saved on the user; presenting an old one revokes the session (a stolen token can be used at most once).

### Flow
1. **Login** `POST /auth/login` → `{ accessToken, user }` + refresh cookie.
2. **Requests**: the HTTP client adds the bearer token.
3. **Expiry**: API answers 401 `TOKEN_EXPIRED` → client calls `/auth/refresh` once (single flight) → retries.
4. **Reload**: `AuthProvider` calls `/auth/refresh` on mount; status `checking` → `authenticated` or `anonymous`.
5. **Routes**: `ProtectedRoute` shows a placeholder while checking, redirects anonymous users to `/login` with `state.from`, and checks a permission for admin pages.
6. **Logout**: `POST /auth/logout` revokes the refresh token, clears the cookie, clears the query cache, broadcasts to other tabs.

### Measured: 5 parallel requests after the access token expired (real API, rotation on)
| Client strategy | Refresh calls | Failed requests |
|---|---|---|
| Each request refreshes on its own | 5 | 2 (`REFRESH_REUSED`) → user logged out |
| Single-flight refresh (shared promise) | **1** | **0** |

### Why not localStorage?
Any XSS can read localStorage and send the token away; an httpOnly cookie can't be read by scripts. The short-lived access token in memory limits the damage of XSS to the page's lifetime.
:::

::: diagram Session states in the React app
stateDiagram-v2
  [*] --> Checking: app loads
  Checking --> Authenticated: refresh OK
  Checking --> Anonymous: no or invalid refresh cookie
  Anonymous --> Authenticated: login success
  Authenticated --> Authenticated: 401 then one refresh then retry
  Authenticated --> Anonymous: logout, refresh fails, or logout in another tab
:::

::: chart bar Measured: 5 parallel requests with an expired access token
Strategy,Refresh calls,Failed requests
Each request refreshes,5,2
Single-flight refresh,1,0
:::

::: image A wristband for quick entry and a ticket in a locker only the office can open
/images/fullstack-integration/auth.svg
:::

::: text 🪜 Step by step
Tested in jsdom against the real API with `ACCESS_TTL=3s`:
1. The app boots at `/orders` → `AuthProvider` calls `/auth/refresh` (no cookie) → `anonymous` → `ProtectedRoute` redirects to `/login` with `from: '/orders'`.
2. Wrong password → the API's message "Email or password is wrong" is shown (same message whether or not the email exists).
3. Correct login → access token in memory, refresh cookie set → navigate back to `/orders`.
4. Ten seconds later the orders query refetches → `GET /orders 401` → `POST /auth/refresh 200` → `GET /orders 200`, invisible to the user.
5. A normal user opening `/users` sees "You don't have access" (the API would also return 403).
6. Log out → server revokes the refresh token → login form; other tabs get the `logout` broadcast.
:::

::: code javascript fullstack-app/api/src/routes/auth.js
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const { User, toUserDTO } = require('../models');
const { AppError } = require('../middleware/errors');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const REFRESH_COOKIE = 'rt';
const cookieOptions = {
  httpOnly: true,                                    // JavaScript can't read it (XSS can't steal it)
  secure: config.isProd,                             // HTTPS only in production
  sameSite: 'lax',                                   // not sent on cross-site POSTs (CSRF)
  path: '/api/v1/auth',                              // only sent to auth endpoints
  maxAge: config.jwt.refreshTtlDays * 24 * 3600 * 1000,
};

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(72),
}).strict();
const loginSchema = z.object({ email: z.email().transform((e) => e.toLowerCase()), password: z.string().min(1) }).strict();

const signAccess = (user) => jwt.sign({ sub: String(user._id), role: user.role }, config.jwt.accessSecret, { algorithm: 'HS256', expiresIn: config.jwt.accessTtl });

// Every refresh token has a unique id (jti) stored on the user: only the latest one is valid (rotation).
async function issueSession(res, user) {
  const jti = crypto.randomUUID();
  await User.updateOne({ _id: user._id }, { $set: { refreshJti: jti } });
  const refreshToken = jwt.sign({ sub: String(user._id), jti }, config.jwt.refreshSecret, { algorithm: 'HS256', expiresIn: `${config.jwt.refreshTtlDays}d` });
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  return { accessToken: signAccess(user), user: toUserDTO(user) };
}

router.post('/register', async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({ name: body.name, email: body.email, passwordHash });   // duplicate email → 409 via errorHandler
  res.status(201).json(await issueSession(res, user));
});

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);
router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);   // same work whether or not the user exists
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is wrong');
  res.json(await issueSession(res, user));
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE];
  if (!token) throw new AppError(401, 'NO_SESSION', 'Please log in');
  let payload;
  try { payload = jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'] }); } catch {
    res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
    throw new AppError(401, 'NO_SESSION', 'Please log in');
  }
  const user = await User.findById(payload.sub).select('+refreshJti');
  if (!user || user.refreshJti !== payload.jti) {
    // An old (already rotated) token was used: possible theft → revoke the whole session.
    if (user) await User.updateOne({ _id: user._id }, { $unset: { refreshJti: '' } });
    res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
    throw new AppError(401, 'REFRESH_REUSED', 'Session ended, please log in again');
  }
  res.json(await issueSession(res, user));
});

router.post('/logout', async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE];
  const payload = token ? jwt.decode(token) : null;
  if (payload?.sub) await User.updateOne({ _id: payload.sub }, { $unset: { refreshJti: '' } });
  res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account not found');
  res.json({ user: toUserDTO(user) });
});

module.exports = router;
:::
::: code javascript fullstack-app/api/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errors');
const { can } = require('../../../shared/permissions.mjs');

// Who are you? Reads "Authorization: Bearer <access token>" and sets req.user = { id, role }.
function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return next(new AppError(401, expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', expired ? 'Session expired' : 'Invalid token'));
  }
}

// What may you do? Checks a permission from the shared role map.
const requirePermission = (permission) => (req, res, next) =>
  can(req.user, permission) ? next() : next(new AppError(403, 'FORBIDDEN', 'You are not allowed to do this'));

module.exports = { authenticate, requirePermission };
:::
::: code jsx fullstack-app/web/src/auth/AuthProvider.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/endpoints';
import { setAccessToken, setSessionExpiredHandler } from '../api/http';

const AuthContext = createContext(null);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth') : null;   // sync tabs

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });
  const queryClient = useQueryClient();

  const endSession = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();                                             // drop every cached private response
    setState({ status: 'anonymous', user: null });
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(endSession);                            // http.js calls this when refresh fails
    authApi.restore()                                                // page load: the refresh cookie restores the session
      .then(({ accessToken, user }) => { setAccessToken(accessToken); setState({ status: 'authenticated', user }); })
      .catch(() => setState({ status: 'anonymous', user: null }));
    const onMessage = (e) => { if (e.data === 'logout') endSession(); };
    channel?.addEventListener('message', onMessage);
    return () => channel?.removeEventListener('message', onMessage);
  }, [endSession]);

  const value = useMemo(() => ({
    ...state,
    login: async (email, password) => {
      const { accessToken, user } = await authApi.login({ email, password });
      setAccessToken(accessToken);
      setState({ status: 'authenticated', user });
    },
    logout: async () => {
      await authApi.logout().catch(() => {});                        // revoke on the server; log out locally anyway
      endSession();
      channel?.postMessage('logout');
    },
    setUser: (user) => setState((s) => ({ ...s, user })),
  }), [state, endSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
:::
::: code jsx fullstack-app/web/src/auth/guards.jsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { can } from '../../../shared/permissions.mjs';
import { useAuth } from './AuthProvider';

// UX only: hides pages from people who can't use them. The API enforces the same rules on every request.
export function ProtectedRoute({ permission }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <p aria-busy="true">Checking your session…</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (permission && !can(user, permission)) return <p role="alert">You don't have access to this page.</p>;
  return <Outlet />;
}

export function Can({ permission, children }) {
  const { user } = useAuth();
  return can(user, permission) ? children : null;
}
:::
::: code jsx fullstack-app/web/src/pages/LoginPage.jsx
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/orders';               // go back to where the user was heading
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      await login(form.get('email'), form.get('password'));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="Log in">
      <label>Email <input name="email" type="email" autoComplete="username" required /></label>
      <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}
:::

::: code javascript Browser demo: refresh-token rotation with naive vs single-flight clients (runnable)
// A fake auth server that rotates refresh tokens and revokes the session when an old one is reused.
function createAuthServer() {
  let current = 'rt-1', counter = 1, revoked = false;
  return {
    async refresh(token) {
      await new Promise((r) => setTimeout(r, 5));
      if (revoked) throw new Error('NO_SESSION');
      if (token !== current) { revoked = true; throw new Error('REFRESH_REUSED'); }
      current = `rt-${++counter}`;
      return current;
    },
    get revoked() { return revoked; },
  };
}
async function run(strategy) {
  const server = createAuthServer();
  let cookie = 'rt-1', calls = 0, inflight = null;
  const refreshOnce = async () => { calls += 1; cookie = await server.refresh(cookie); };
  const singleFlight = () => (inflight ??= refreshOnce().finally(() => { inflight = null; }));
  const request = async () => {
    try { await (strategy === 'single' ? singleFlight() : refreshOnce()); return 'ok'; } catch (e) { return e.message; }
  };
  const results = await Promise.all(Array.from({ length: 5 }, request));
  return { calls, failed: results.filter((r) => r !== 'ok').length, revoked: server.revoked };
}
(async () => {
  const naive = await run('naive');
  const single = await run('single');
  console.log('naive:', JSON.stringify(naive), '| single flight:', JSON.stringify(single));
  console.log('naive clients reuse the old token and kill the session', naive.failed > 0 && naive.revoked ? '✅ (the bug, reproduced)' : '❌ FAIL');
  console.log('single flight: one refresh, no failures', single.calls === 1 && single.failed === 0 && !single.revoked ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Long-lived JWTs in `localStorage` (readable by any XSS, no way to revoke).
- Every parallel request refreshing on its own (with rotation this logs users out at random).
- Rendering protected pages before the session check finishes (flash of the login page or of private data).
- Hiding admin buttons in React and forgetting to check permissions in the API.
- Not clearing the query cache on logout → the next user on the same browser sees cached private data.
:::

::: understand
- Access tokens are **fast and stateless**; refresh tokens are **revocable and rotated**.
- The browser keeps the refresh token for you (httpOnly cookie); React keeps only what it must (access token in memory, user in context).
- Auth in React is a **state machine** (checking → authenticated/anonymous) plus a robust HTTP client.
:::

::: ask
- *"Is there SSO (Cognito, Okta, Entra ID)?"* → OIDC Authorization Code + PKCE with a library.
- *"Web only, or mobile apps too?"* (cookies vs tokens in secure storage)
- *"How quickly must a revoked user lose access?"* (access-token lifetime, deny lists)
:::

::: important ⭐ Say this in the interview
"On login the API returns a short-lived access token, which React keeps in memory, and sets a refresh token in an httpOnly, SameSite cookie limited to the auth path, so scripts can't read it. On page load an AuthProvider calls refresh to restore the session while a ProtectedRoute shows a checking state, then redirects anonymous users to login remembering where they were going. The HTTP client adds the bearer token, and on a TOKEN_EXPIRED 401 it refreshes once and retries; the refresh is single-flight because refresh tokens rotate with reuse detection. In a test, five parallel requests refreshing independently made five refresh calls and two failed with reuse errors, while single-flight made one call and none failed. Logout revokes the token, clears the query cache and notifies other tabs, and the API checks permissions on every request regardless of the UI."
:::

::: links
OWASP: JSON Web Token cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
Auth0: Refresh token rotation | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
React Router: Navigate | https://reactrouter.com/api/components/Navigate
:::

=== How do you handle API errors? (frontend + backend)
@p 3
@tags errors, react, ux
@quick
- Backend: **one error shape** for everything: `{ error: { code, message, details?, requestId } }` + correct status; Zod → 400, CastError → 400, duplicate key → 409, unknown → 500 with a generic message.
- Frontend: the HTTP client turns every failure (HTTP or network) into an `ApiError` with `status`, `code`, `details`, `requestId`.
- Handle **locally** when the screen knows what to do (field errors from `details`, 404 page, 409 conflict) and **globally** otherwise (toast for 5xx/network, 401 → refresh/login).
- Retry only what can succeed later: measured attempts with this policy: **400/401/404/409 → 1**, **500/503/network → 3**.
- Show the `requestId` so support can find the server log line; render crashes go to an **Error Boundary**.

::: text 🧒 In simple words
When something goes wrong at the shop counter, a good shop gives you a **receipt-style note**: an error code, a plain-language message, which boxes on your form were wrong, and a reference number. The website reads the note and reacts sensibly: it underlines the wrong box on the form, says "this doesn't exist" for missing things, quietly tries again if the shop's phone line dropped, and shows the reference number so a support person can look it up. Things that will never work by retrying (a wrong form) are never retried.
:::

::: text 📖 Detailed answer
### Backend: one error format
| Situation | Status | `code` |
|---|---|---|
| Zod validation failed | 400 | `VALIDATION_ERROR` (+ `details: [{ field, message }]`) |
| Malformed JSON body | 400 | `BAD_JSON` |
| Invalid ObjectId (CastError) | 400 / 404 | `INVALID_ID` / `NOT_FOUND` |
| Not logged in / token expired | 401 | `UNAUTHENTICATED` / `TOKEN_EXPIRED` |
| No permission | 403 | `FORBIDDEN` |
| Unknown or someone else's resource | 404 | `NOT_FOUND` |
| Duplicate unique field (E11000) | 409 | `CONFLICT` |
| Rate limited | 429 + `Retry-After` | `RATE_LIMITED` |
| Bug / dependency down | 500 / 503 | `INTERNAL_ERROR` (message hidden, logged with the request id) |
Express 5 forwards rejected promises from `async` handlers to the error middleware automatically.

### Frontend: where each error is handled
| Error | Handled in | UX |
|---|---|---|
| `VALIDATION_ERROR` | The form's mutation `onError` | Message under each field, `aria-invalid` |
| `TOKEN_EXPIRED` | HTTP client | Refresh once and retry, invisible |
| Refresh failed | `AuthProvider` | Back to login |
| 403 / 404 | The page (`AsyncView`) | Specific message or not-found screen |
| 409 | The mutation | "Already exists / changed by someone else" |
| 5xx / network on first load | The page | Error state + **Try again** |
| 5xx / network on background refetch | Global `QueryCache.onError` | Toast; keep showing old data |
| Exception while rendering | Error Boundary | Fallback UI, report to monitoring |

### Retry policy (measured with TanStack Query against a test server)
| Response | Attempts made |
|---|---|
| 400, 401, 404, 409 | 1 (no retry: it would fail the same way) |
| 500, 503 | 3 (2 retries with exponential backoff) |
| Network error | 3 |
Mutations are **not** retried automatically (a repeated POST may duplicate an order unless the API is idempotent).
:::

::: diagram From a thrown error to the right UI
flowchart LR
  H["route handler throws or rejects"] --> EM["errorHandler: status + code + message + requestId"]
  EM --> HC["http.js: ApiError"]
  HC --> T{"code / status"}
  T -->|"TOKEN_EXPIRED"| RF["refresh once, retry"]
  T -->|"VALIDATION_ERROR"| FF["field messages in the form"]
  T -->|"403, 404, 409"| PG["page or mutation shows it"]
  T -->|"5xx or network"| RT["retry with backoff, then error state or toast"]
:::

::: chart bar Measured: attempts made by the retry policy per error
Error,Attempts
400,1
401,1
404,1
409,1
500,3
503,3
Network error,3
:::

::: image A receipt-style error note: code, message, wrong boxes and a reference number
/images/fullstack-integration/errors.svg
:::

::: text 🪜 Step by step
Saving the profile with the name "A" (tested in jsdom against the real API):
1. `PATCH /api/v1/users/me { name: 'A' }` → Zod rejects it.
2. `errorHandler` turns the `ZodError` into `400 { error: { code: 'VALIDATION_ERROR', details: [{ field: 'name', message: 'Name must have at least 2 characters' }], requestId } }`.
3. `http.js` throws `ApiError` with those fields.
4. The mutation has `meta.handlesOwnErrors`, so the global toast stays quiet; its own `onError` maps `details` to `fieldErrors`.
5. The message appears under the input, the input gets `aria-invalid="true"`, and the message has `role="alert"` for screen readers.
6. Had the API returned 500 instead, the user would see a toast with a generic message; the server log line has the same `requestId`.
:::

::: code javascript fullstack-app/api/src/middleware/errors.js
const { ZodError } = require('zod');

// Throw these from anywhere; the error handler turns them into the standard error shape.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (req, res, next) => next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));

// One response shape for every error: { error: { code, message, details?, requestId } }
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  let details = err.details;

  if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Some fields are invalid';
    details = err.issues.map((i) => ({ field: i.path.join('.') || (i.keys || []).join(','), message: i.message }));
  } else if (err.name === 'CastError') {
    status = 400; code = 'INVALID_ID'; message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409; code = 'CONFLICT'; message = `${Object.keys(err.keyValue || {})[0] || 'Value'} already exists`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'BAD_JSON'; message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
  }

  if (status >= 500) {
    console.error(`[${req.id}]`, err);                          // full details only in server logs
    message = 'Something went wrong';
    details = undefined;
  }
  if (status === 429 && err.retryAfter) res.set('Retry-After', String(err.retryAfter));
  res.status(status).json({ error: { code, message, ...(details && { details }), requestId: req.id } });
}

module.exports = { AppError, notFound, errorHandler };
:::
::: code javascript fullstack-app/web/src/queryClient.js
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from './components/Toaster';

// Retry only what can succeed later: network errors and 5xx. Never 4xx (it will fail the same way again).
export const shouldRetry = (failureCount, error) => (error?.status === 0 || error?.status >= 500) && failureCount < 2;

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      // Background refetch failed but we still show old data → a toast is enough. First-load errors render inline.
      onError: (error, query) => { if (query.state.data !== undefined) toast(`Could not refresh: ${error.message}`); },
    }),
    mutationCache: new MutationCache({
      onError: (error, vars, ctx, mutation) => { if (!mutation.meta?.handlesOwnErrors) toast(error.message); },
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),  // 500 ms, 1 s, 2 s… capped
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },                                    // POST/PATCH aren't always safe to repeat
    },
  });
}
:::
::: code jsx fullstack-app/web/src/components/Toaster.jsx
import { useSyncExternalStore } from 'react';

// A tiny global toast store (no library): toast('message') from anywhere, <Toaster /> renders them.
let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
let nextId = 1;

export function toast(message, ms = 4000) {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, ms);
}

export function Toaster() {
  const items = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => toasts);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => <p key={t.id} className="toast">{t.message}</p>)}
    </div>
  );
}
:::
::: code jsx fullstack-app/web/src/pages/ProfilePage.jsx
import { useState } from 'react';
import { useUpdateProfile } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { AvatarUploader } from '../components/AvatarUploader';
import { toast } from '../components/Toaster';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [fieldErrors, setFieldErrors] = useState({});
  const update = useUpdateProfile();

  function onSubmit(e) {
    e.preventDefault();
    setFieldErrors({});
    update.mutate({ name }, {
      onSuccess: (saved) => { setUser(saved); toast('Profile saved'); },
      onError: (err) => {
        // 400 VALIDATION_ERROR → show each message next to its field; anything else → toast
        if (err.code === 'VALIDATION_ERROR') setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        else toast(err.message);
      },
    });
  }

  return (
    <section>
      <form onSubmit={onSubmit} aria-label="Profile">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'name-error' : undefined} /></label>
        {fieldErrors.name && <p id="name-error" role="alert">{fieldErrors.name}</p>}
        <button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</button>
      </form>
      <AvatarUploader onDone={setUser} />
    </section>
  );
}
:::

::: code javascript Browser demo: classify errors, decide retries and UI (runnable)
const shouldRetry = (failureCount, error) => (error?.status === 0 || error?.status >= 500) && failureCount < 2;
function attemptsFor(status) { let attempts = 1; while (shouldRetry(attempts - 1, { status })) attempts++; return attempts; }
function uiFor(err) {
  if (err.code === 'TOKEN_EXPIRED') return 'refresh-and-retry';
  if (err.code === 'VALIDATION_ERROR') return 'field-errors';
  if ([403, 404, 409].includes(err.status)) return 'inline-message';
  if (err.status === 0 || err.status >= 500) return 'error-state-or-toast';
  return 'inline-message';
}
const expected = { 400: 1, 401: 1, 404: 1, 409: 1, 500: 3, 503: 3, 0: 3 };
for (const [status, n] of Object.entries(expected)) console.log(`status ${status}: ${attemptsFor(Number(status))} attempt(s)`, attemptsFor(Number(status)) === n ? '✅' : '❌ FAIL');
console.log('validation errors go to the form', uiFor({ status: 400, code: 'VALIDATION_ERROR' }) === 'field-errors' ? '✅' : '❌ FAIL');
console.log('expired tokens are refreshed silently', uiFor({ status: 401, code: 'TOKEN_EXPIRED' }) === 'refresh-and-retry' ? '✅' : '❌ FAIL');
console.log('network errors show an error state', uiFor({ status: 0, code: 'NETWORK_ERROR' }) === 'error-state-or-toast' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Different error shapes per endpoint (`{ msg }`, `{ error: 'x' }`, plain text) → fragile frontend code.
- Sending stack traces or database messages to clients in production.
- Retrying 4xx errors or POSTs without idempotency keys.
- A single global "Something went wrong" for everything, including field validation.
- Swallowing errors in `catch {}` so nothing is shown or logged.
:::

::: understand
- Errors are part of the API contract: stable `code`s are for programs, `message`s are for people.
- The request id ties a user's screenshot to the exact server log line.
- Local handling where context exists, global handling as a safety net.
:::

::: ask
- *"Is there an agreed error format or should we define one?"*
- *"Do we report errors to Sentry/Datadog with the request id?"*
- *"Which mutations are safe to retry (idempotent)?"*
:::

::: important ⭐ Say this in the interview
"On the backend every error goes through one error middleware that returns the same shape: a stable code, a human message, optional field details and the request id, with the right status: 400 for validation, 401, 403, 404, 409 for duplicates, and a generic 500 whose details only go to the logs. Express 5 forwards async errors automatically. On the frontend the HTTP client converts every failure, including network errors, into an ApiError. Forms map validation details to fields, pages show 403, 404 and retry states, expired tokens refresh silently, and a global handler toasts background failures. Queries retry only network errors and 5xx: measured, 4xx made one attempt and 5xx three; mutations aren't auto-retried."
:::

::: links
RFC 9457: Problem Details for HTTP APIs | https://www.rfc-editor.org/rfc/rfc9457
TanStack Query: Query retries | https://tanstack.com/query/latest/docs/framework/react/guides/query-retries
Express 5: Error handling | https://expressjs.com/en/guide/error-handling.html
:::

=== How do you implement pagination end-to-end?
@p 3
@tags pagination, react-query, full-stack
@quick
- React keeps `page`, `q` (and filters/sort) in the **URL** → shareable links, back button works.
- `GET /users?page=2&limit=20&q=as` → Zod parses and **caps** values → `find().sort({ createdAt: -1, _id: -1 }).skip().limit()` + `countDocuments` in parallel → `{ data, pagination: { page, limit, total, totalPages, hasNextPage } }`.
- TanStack Query: key includes the params, `placeholderData: keepPreviousData` (no flicker), **prefetch** the next page.
- Measured with a 150 ms network: **Next to a prefetched page 10 ms** vs **an unfetched page 183 ms**.
- Debounce search and reset to page 1; for infinite feeds or very deep pages use **cursor pagination** (see MongoDB Scenarios).

::: text 🧒 In simple words
Pagination is reading a **long catalogue one page at a time**. The page number is written in the address bar, so if you send the link to a friend, they open the same page. While you read page 2, a helper quietly **fetches page 3 in advance**, so when you turn the page it's already there. If you change the search words, you start again from page 1. And the label "Showing 21–40 of 120" always describes the page **actually on screen**.
:::

::: text 📖 Detailed answer
### Contract
`GET /api/v1/users?page=2&limit=20&q=as` →
`{ "data": [...20 users], "pagination": { "page": 2, "limit": 20, "total": 120, "totalPages": 6, "hasNextPage": true } }`

### Backend rules
| Rule | Why |
|---|---|
| Validate and coerce with Zod (`z.coerce.number().int().min(1).max(100)`) | Query strings are text; reject `limit=100000` |
| Cap `page` (500 here) | `skip` cost grows with depth |
| Deterministic sort `{ createdAt: -1, _id: -1 }` + matching index | Stable pages, no duplicates across pages |
| `find` and `countDocuments` in `Promise.all` | Two queries, one wait |
| Search with an **anchored prefix** on a lowercased, indexed field | Uses the index (a contains/`i` regex scans everything) |

### Frontend rules
| Rule | How |
|---|---|
| URL is the source of truth | `useSearchParams()` |
| No flicker | `placeholderData: keepPreviousData`, dim the table while `isPlaceholderData` |
| Instant "Next" | `prefetchQuery` page + 1 once the current page is real data |
| Search | Debounce 300 ms, reset to page 1 |
| Labels | Compute "Showing X–Y" from `data.pagination.page`, not from the URL |
| Edge cases | Disable Previous/Next at ends, empty-state text for "no matches" |

### Measured (jsdom, real API behind a proxy adding 150 ms per request)
| Navigation | Time until the new page is shown |
|---|---|
| Next → page 2 (prefetched) | 10 ms |
| Jump to page 6 (not fetched yet) | 183 ms |

**A bug found while measuring**: the label was computed from the URL's page while `keepPreviousData` still showed the old rows, so it briefly said "Showing 101–120" above page 2's rows. Fixed by labelling from `data.pagination.page`.
:::

::: diagram Next page, end to end
sequenceDiagram
  participant U as User
  participant R as React (URL ?page=2)
  participant Q as TanStack Query cache
  participant A as Express
  participant M as MongoDB
  U->>R: click Next
  R->>Q: useQuery users page 2
  Q-->>R: already prefetched, render now
  R->>Q: prefetch page 3
  Q->>A: GET /users?page=3&limit=20
  A->>M: find.sort.skip(40).limit(20) and countDocuments
  M-->>A: 20 docs and total 120
  A-->>Q: data and pagination
:::

::: chart bar Measured: time to show the next page with 150 ms network latency (ms)
Navigation,Milliseconds
Prefetched page,10
Not prefetched,183
:::

::: image Reading a catalogue: the page number in the address, the next page fetched in advance
/images/fullstack-integration/pagination.svg
:::

::: text 🪜 Step by step
Admin flow tested in jsdom against the seeded API (120 users):
1. `/users` → `useUsers({ page: 1, limit: 20, q: '' })` → table plus "Showing 1–20 of 120".
2. As soon as page 1 is real data, page 2 is prefetched (`GET /users?page=2&limit=20 200` appears before any click).
3. Click Next → URL becomes `?page=2` → page 2 renders from cache with **no new request** → page 3 is prefetched.
4. Type "member 11" → after 300 ms the URL becomes `?q=member+11&page=1` → "Showing 1–7 of 7" (Member 110–116).
5. Previous/Next are disabled at the ends; while a non-prefetched page loads, the old rows are dimmed and Next is disabled.
:::

::: code javascript fullstack-app/api/src/routes/users.js
const express = require('express');
const { z } = require('zod');
const { User, toUserDTO } = require('../models');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),       // deep offsets are slow: cap them
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(50).default(''),
});

// GET /api/v1/users?page=2&limit=20&q=as → { data, pagination }
router.get('/', authenticate, requirePermission('user:read:any'), async (req, res) => {
  const { page, limit, q } = listQuery.parse(req.query);           // Express 5: req.query is read-only, parse a copy
  const filter = q ? { nameLower: { $regex: `^${escapeRegex(q.toLowerCase())}` } } : {};   // anchored prefix → uses the index
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  res.json({ data: rows.map(toUserDTO), pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages } });
});

const profileSchema = z.object({ name: z.string().trim().min(2, 'Name must have at least 2 characters').max(60) }).strict();

router.patch('/me', authenticate, async (req, res) => {
  const body = profileSchema.parse(req.body);
  const user = await User.findById(req.user.id);
  user.name = body.name;                                           // save() runs hooks (nameLower) and validators
  await user.save();
  res.json({ user: toUserDTO(user) });
});

module.exports = router;
:::
::: code jsx fullstack-app/web/src/pages/UsersPage.jsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { usePrefetchUsers, useUsers } from '../api/hooks';

const LIMIT = 20;

export function UsersPage() {
  const [params, setParams] = useSearchParams();                    // page and search live in the URL: shareable, back button works
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const prefetch = usePrefetchUsers();
  const { data, isPending, isError, error, isPlaceholderData, refetch } = useUsers({ page, limit: LIMIT, q });

  useEffect(() => {                                                 // debounce typing; a new search starts at page 1
    if (search === q) return undefined;
    const t = setTimeout(() => setParams(search ? { q: search, page: '1' } : { page: '1' }), 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  useEffect(() => {                                                 // make "Next" instant
    if (data?.pagination.hasNextPage && !isPlaceholderData) prefetch({ page: page + 1, limit: LIMIT, q });
  }, [data, isPlaceholderData, page, q, prefetch]);

  const go = (p) => setParams({ ...(q && { q }), page: String(p) });
  const shown = data?.pagination.page ?? page;

  return (
    <section>
      <input aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" />
      {isPending && <p aria-busy="true">Loading users…</p>}
      {isError && <div role="alert"><p>{error.message}</p><button type="button" onClick={() => refetch()}>Try again</button></div>}
      {data && (
        <>
          {data.data.length === 0 ? <p className="empty">No users match “{q}”.</p> : (
            <table style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
              <tbody>{data.data.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td></tr>)}</tbody>
            </table>
          )}
          <p>
            {/* label from the data actually on screen (while page 3 loads, page 2's rows are still shown) */}
            {data.pagination.total === 0 ? '0 users' : `Showing ${(shown - 1) * LIMIT + 1}–${Math.min(shown * LIMIT, data.pagination.total)} of ${data.pagination.total}`}
          </p>
          <nav aria-label="Pagination">
            <button type="button" disabled={page === 1} onClick={() => go(page - 1)}>Previous</button>
            <span> Page {shown} of {data.pagination.totalPages} </span>
            <button type="button" disabled={!data.pagination.hasNextPage || isPlaceholderData} onClick={() => go(page + 1)}>Next</button>
          </nav>
        </>
      )}
    </section>
  );
}
:::

::: code javascript Browser demo: pagination metadata and the label bug (runnable)
function paginate(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const p = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (p - 1) * limit + 1;
  const to = Math.min(p * limit, total);
  return { page: p, totalPages, hasNextPage: p < totalPages, label: total === 0 ? '0 users' : `Showing ${from}–${to} of ${total}` };
}
console.log(paginate(120, 2, 20).label, paginate(120, 2, 20).label === 'Showing 21–40 of 120' ? '✅' : '❌ FAIL');
console.log('last page has no next', paginate(120, 6, 20).hasNextPage === false ? '✅' : '❌ FAIL');
console.log('partial last page', paginate(7, 1, 20).label === 'Showing 1–7 of 7' ? '✅' : '❌ FAIL');
console.log('page beyond the end is clamped', paginate(120, 99, 20).page === 6 ? '✅' : '❌ FAIL');
console.log('empty result', paginate(0, 1, 20).label === '0 users' ? '✅' : '❌ FAIL');

// The bug: URL says page 6, but the rows on screen are still page 2 (placeholder data)
const urlPage = 6, dataOnScreen = { page: 2, total: 120 };
const wrong = paginate(dataOnScreen.total, urlPage, 20).label;
const right = paginate(dataOnScreen.total, dataOnScreen.page, 20).label;
console.log(`label from URL: "${wrong}" vs from data: "${right}"`, right === 'Showing 21–40 of 120' && wrong !== right ? '✅ (use the data)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Page state in `useState` only (refresh or share loses it, Back doesn't work).
- No `limit` cap → `?limit=1000000` downloads the database.
- Sorting by a non-unique field without `_id` → items repeat or vanish between pages.
- Search not reset to page 1 → "page 5 of 1".
- Labels computed from the requested page while placeholder data is shown.
- Using offset pagination for infinite feeds or very deep pages.
:::

::: understand
- The URL is UI state that users can share; the cache is server state; React glues them together.
- Prefetch + keepPreviousData make offset pagination feel instant for typical page-by-page browsing.
- Offset is fine for admin tables with totals; cursor pagination is for feeds and deep pages.
:::

::: ask
- *"Page numbers with a total, or infinite scroll?"*
- *"Which sorts and filters does the table need?"* (each needs an index)
- *"How large can the collection get?"*
:::

::: important ⭐ Say this in the interview
"The page, search and filters live in the URL, so links are shareable and Back works. The hook passes them in the query key, keeps the previous page visible with keepPreviousData, and prefetches the next page, so Next is instant: with 150 milliseconds of latency, a prefetched page showed in 10 milliseconds versus 183 for an unfetched one. The API validates and caps page and limit with Zod, sorts deterministically by createdAt and _id with a matching index, runs find with skip and limit alongside countDocuments in parallel, and returns data plus page, total, totalPages and hasNextPage. Search is debounced and resets to page one, and for infinite feeds or very deep pages I switch to cursor pagination."
:::

::: links
TanStack Query: Paginated queries | https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
TanStack Query: Prefetching | https://tanstack.com/query/latest/docs/framework/react/guides/prefetching
React Router: useSearchParams | https://reactrouter.com/api/hooks/useSearchParams
:::

=== How do you upload an image from React to S3?
@p 3
@tags s3, presigned-url, upload
@quick
- Use a **presigned URL**: React asks the API for permission → **PUTs the file directly to S3** → tells the API the key → the API verifies with `HeadObject` and saves the key in MongoDB.
- The API validates type and size **before signing**, picks the key (`avatars/<userId>/<uuid>.png`), signs **Content-Type and Content-Length**, and expires the URL in 60 s.
- Measured, 20 uploads of 5 MB: proxying through Node made the API receive **100 MB** and grow to **256 MB RSS**; with presigned URLs the API received **2.5 KB** and stayed at **48 MB**.
- S3 rejected a PUT with a different size or Content-Type (**403**); the API rejected someone else's key (**403**) and a missing upload (**400**).
- Private bucket + **bucket CORS** for the web origin; show images with presigned GETs or CloudFront.

::: text 🧒 In simple words
Instead of carrying a heavy parcel **through the office** (the API) to the warehouse (S3), you ask the office for a **signed delivery slip**: "one PNG, exactly 2,008 bytes, for Asha's avatar, valid for one minute". You then drive the parcel straight to the warehouse yourself. The warehouse checks the slip and refuses anything that doesn't match. Finally you tell the office "delivered, here's the slip number", and the office checks the warehouse before writing it in its records.
:::

::: text 📖 Detailed answer
### Two approaches
| | Proxy through Node (multer → S3) | **Presigned URL** |
|---|---|---|
| Bytes through your API | All of them | ~120 bytes of JSON per upload |
| API memory/CPU | Grows with concurrent uploads | Flat |
| Timeouts, body limits | Your server's | S3's (up to 5 GB per PUT) |
| Credentials | Stay on the server | Stay on the server (URL is a time-limited permission) |
| Extra steps | – | Bucket CORS, confirm step |

### Presigned flow (this project)
1. React validates quickly (type, ≤ 5 MB) → `POST /uploads/avatar/presign { contentType, size }`.
2. API: authenticated? type allowed? size ≤ 5 MB? → key `avatars/<userId>/<uuid>.<ext>` → `PutObjectCommand` with `ContentType` and `ContentLength` → `getSignedUrl(..., { expiresIn: 60, signableHeaders: new Set(['content-type', 'content-length']) })`.
3. React `PUT`s the file to the URL with XHR (upload progress) and exactly that `Content-Type`; no `Authorization` header.
4. React → `POST /uploads/avatar/confirm { key }` → API checks the key is under the user's prefix, `HeadObject` for existence, size and type → saves `avatarKey`.
5. Display: presigned GET (1 hour) or CloudFront with Origin Access Control.

### Measured (SeaweedFS S3 locally, real API)
| Check | Result |
|---|---|
| Happy path: presign → PUT → confirm → presigned GET | 200 / 200 / 200 / 200, image served as `image/png` |
| PUT with a different size than signed | **403** from S3 |
| PUT with a different Content-Type | **403** from S3 |
| Presign 10 MB, or `text/html` | 400 from the API |
| Confirm another user's key | 403 |
| Confirm a key that was never uploaded | 400 |

| 20 concurrent 5 MB uploads | Proxy through Node | Presigned |
|---|---|---|
| Request bytes received by the API | 104,857,600 | 2,500 |
| API process memory (RSS) | 70 → 256 MB | 48 MB |
:::

::: diagram Presigned upload
sequenceDiagram
  participant R as React
  participant N as Node API
  participant S as S3 (private bucket)
  participant M as MongoDB
  R->>N: POST /uploads/avatar/presign (type, size)
  N->>N: auth, allow-list, size, key = avatars/u42/uuid.png
  N-->>R: uploadUrl (60 s, type + length signed) and key
  R->>S: PUT uploadUrl with file bytes (progress bar)
  S-->>R: 200 (403 if type or size differ)
  R->>N: POST /uploads/avatar/confirm (key)
  N->>S: HeadObject(key)
  N->>M: save avatarKey
  N-->>R: user and presigned GET URL
:::

::: chart bar Measured: API memory after 20 concurrent 5 MB uploads (MB)
Approach,API RSS MB
Proxy through Node,256
Presigned URLs,48
:::

::: image A signed delivery slip: drive the parcel straight to the warehouse
/images/fullstack-integration/s3-upload.svg
:::

::: text 🪜 Step by step
What the browser does when the user picks `avatar.png` (2,008 bytes):
1. `onChange` checks `file.type` and `file.size` and shows an instant message if they're wrong.
2. `presignAvatar(file)` → `{ uploadUrl, key, headers: { 'Content-Type': 'image/png' } }`.
3. `putFile(uploadUrl, file, headers, setProgress)` uses XHR so `upload.onprogress` drives a `<progress>` bar.
4. S3 checks the signature: method, path, expiry, Content-Type and Content-Length must all match.
5. `confirmAvatar(key)` → the API verifies with `HeadObject` and saves the key → returns a presigned GET URL.
6. The new avatar renders; `onDone(user)` updates the user in `AuthProvider`.
:::

::: code javascript fullstack-app/api/src/routes/uploads.js
const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config');
const { User, toUserDTO } = require('../models');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errors');

// On AWS: no endpoint, credentials come from the EC2/ECS IAM role. Locally: MinIO/SeaweedFS endpoint + path-style.
const s3Options = { region: config.s3.region, forcePathStyle: Boolean(config.s3.endpoint), requestChecksumCalculation: 'WHEN_REQUIRED' };
const s3 = new S3Client({ ...s3Options, endpoint: config.s3.endpoint });
const signer = new S3Client({ ...s3Options, endpoint: config.s3.publicEndpoint || config.s3.endpoint });   // URLs the browser can reach

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const router = express.Router();
router.use(authenticate);

const presignSchema = z.object({
  contentType: z.enum(Object.keys(ALLOWED)),
  size: z.number().int().min(1).max(MAX_BYTES, 'Max 5 MB'),
}).strict();

// Step 1: the browser asks for permission to upload ONE file of a known type and size.
router.post('/avatar/presign', async (req, res) => {
  const { contentType, size } = presignSchema.parse(req.body);
  const key = `avatars/${req.user.id}/${crypto.randomUUID()}.${ALLOWED[contentType]}`;   // server picks the key
  const command = new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType, ContentLength: size });
  const uploadUrl = await getSignedUrl(signer, command, {
    expiresIn: 60,                                                 // short-lived
    signableHeaders: new Set(['content-type', 'content-length']),  // the browser must send exactly this type and size
  });
  res.json({ uploadUrl, key, headers: { 'Content-Type': contentType } });
});

// Step 3: after the browser PUT the file to S3, it tells us the key; we verify and save it.
router.post('/avatar/confirm', async (req, res) => {
  const { key } = z.object({ key: z.string().max(200) }).strict().parse(req.body);
  if (!key.startsWith(`avatars/${req.user.id}/`)) throw new AppError(403, 'FORBIDDEN', 'Not your upload');  // can't claim others' files
  let head;
  try { head = await s3.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key })); } catch {
    throw new AppError(400, 'UPLOAD_MISSING', 'Upload not found, please try again');
  }
  if (head.ContentLength > MAX_BYTES || !ALLOWED[head.ContentType]) throw new AppError(400, 'BAD_UPLOAD', 'File type or size not allowed');
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { avatarKey: key } }, { returnDocument: 'after' }).lean();
  res.json({ user: toUserDTO(user), avatarUrl: await avatarUrl(key) });
});

// Private bucket: show images through short-lived GET URLs (or CloudFront with OAC in production).
async function avatarUrl(key) {
  return getSignedUrl(signer, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn: 3600 });
}
router.get('/avatar', async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  res.json({ avatarUrl: user?.avatarKey ? await avatarUrl(user.avatarKey) : null });
});

module.exports = router;
:::
::: code jsx fullstack-app/web/src/components/AvatarUploader.jsx
import { useState } from 'react';
import { uploadsApi } from '../api/endpoints';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

// 1) ask the API for a presigned URL  2) PUT the file straight to S3  3) tell the API the key
export function AvatarUploader({ onDone }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  async function onChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                                             // allow picking the same file again
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError('Please choose a JPG, PNG or WEBP image');   // fast feedback; the API re-checks
    if (file.size > MAX) return setError('Images must be 5 MB or smaller');
    setError('');
    setProgress(0);
    try {
      const { uploadUrl, key, headers } = await uploadsApi.presignAvatar(file);
      await uploadsApi.putFile(uploadUrl, file, headers, setProgress);
      const { user, avatarUrl } = await uploadsApi.confirmAvatar(key);
      setPreview(avatarUrl);
      onDone?.(user);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <label>Avatar <input type="file" accept={TYPES.join(',')} onChange={onChange} disabled={progress !== null} /></label>
      {progress !== null && <progress max="100" value={progress} aria-label="Upload progress">{progress}%</progress>}
      {error && <p role="alert">{error}</p>}
      {preview && <img src={preview} alt="Your new avatar" width="96" height="96" />}
    </div>
  );
}
:::
::: code javascript fullstack-app/api/scripts/create-bucket.js
// Local development only: create the bucket and allow browser uploads from the web app (CORS).
// On AWS the bucket is created by Terraform/CDK with the same CORS rules.
const { S3Client, CreateBucketCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const config = require('../src/config');

async function main() {
  const s3 = new S3Client({ region: config.s3.region, endpoint: config.s3.endpoint, forcePathStyle: true });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
    console.log(`created bucket ${config.s3.bucket}`);
  } catch (err) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(err.name)) throw err;
  }
  await s3.send(new PutBucketCorsCommand({
    Bucket: config.s3.bucket,
    CORSConfiguration: { CORSRules: [{
      AllowedOrigins: (process.env.WEB_ORIGINS || 'http://localhost:8080,http://localhost:5173').split(','),
      AllowedMethods: ['PUT', 'GET'],
      AllowedHeaders: ['Content-Type'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3000,
    }] },
  }));
  console.log('bucket CORS configured');
}

main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code javascript Browser demo: client checks and the server's key rule (runnable)
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;
function clientCheck(file) {
  if (!TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WEBP image';
  if (file.size > MAX) return 'Images must be 5 MB or smaller';
  return null;
}
const ownsKey = (userId, key) => key.startsWith(`avatars/${userId}/`) && !key.includes('..');
const makeKey = (userId, type) => `avatars/${userId}/${crypto.randomUUID()}.${{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type]}`;

console.log('PNG of 2 KB accepted', clientCheck(new File([new Uint8Array(2048)], 'a.png', { type: 'image/png' })) === null ? '✅' : '❌ FAIL');
console.log('HTML rejected before any request', clientCheck(new File(['<script>'], 'x.html', { type: 'text/html' })) !== null ? '✅' : '❌ FAIL');
console.log('6 MB rejected', clientCheck({ type: 'image/png', size: 6 * 1024 * 1024 }) === 'Images must be 5 MB or smaller' ? '✅' : '❌ FAIL');
const key = makeKey('u42', 'image/png');
console.log('server-chosen key:', key, /^avatars\/u42\/[0-9a-f-]{36}\.png$/.test(key) ? '✅' : '❌ FAIL');
console.log("cannot confirm another user's key", !ownsKey('u42', 'avatars/u7/x.png') && !ownsKey('u42', 'avatars/u42/../u7/x.png') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Letting the client choose the key (overwriting other users' files) or skipping the confirm/HEAD check.
- Not signing Content-Type/length → a signed URL for an "image" can upload a 2 GB HTML file.
- Public buckets for user uploads; long-lived presigned URLs.
- Forgetting bucket CORS (the browser PUT fails with a CORS error) or sending the API's `Authorization` header to S3.
- Streaming large files through Node "because it's simpler".
:::

::: understand
- The API stays the **gatekeeper** (who, what type, what size, which key); S3 does the heavy lifting.
- A presigned URL is a short-lived, narrowly scoped permission created with the server's IAM role.
- Verify after upload: the browser's word isn't proof that the object exists or is what it claims.
:::

::: ask
- *"Max file size?"* (> 100 MB → multipart upload with presigned part URLs)
- *"Do we need thumbnails or virus scanning?"* (S3 event → Lambda/worker)
- *"Public or private images?"* (CloudFront vs presigned GET)
:::

::: important ⭐ Say this in the interview
"I use presigned URLs so file bytes never pass through Node. The browser asks the API for permission with the content type and size; the API checks auth, an allow-list and a size limit, chooses a key under the user's prefix and returns a 60-second presigned PUT that signs the content type and length. The browser uploads directly to S3 with XHR for a progress bar, then calls confirm; the API checks the key belongs to the user, does a HeadObject and saves the key in MongoDB. The bucket is private with CORS for our origin, and images are shown via presigned GETs or CloudFront. In a test with twenty 5 MB uploads, proxying through Node pushed 100 MB through the API and its memory to 256 MB, while presigned URLs sent 2.5 KB to the API and it stayed at 48 MB; S3 rejected uploads whose size or type didn't match the signature."
:::

::: links
AWS: Uploading objects with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
AWS SDK v3: s3-request-presigner | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/
AWS: Configuring CORS for a bucket | https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html
:::

=== How do you prevent unauthorized users from accessing APIs? (full-stack view)
@p 3
@tags security, authorization, full-stack
@quick
- **Frontend guards are UX only** (hide links, redirect); the **API enforces everything** on every request.
- Each protected route: `authenticate` (valid token) → `requirePermission` (role → permission map) → **ownership-scoped query** (`{ _id, userId: req.user.id }`).
- Never trust ids, roles, owners or totals from the request body; derive the user from the token and compute totals on the server.
- Return **404** for other people's resources (don't reveal they exist), 401 when not logged in, 403 when logged in but not allowed.
- One **shared permission map** (`shared/permissions.mjs`) drives both the API checks and the React `<Can>` component; integration tests prove the rules.

::: text 🧒 In simple words
A hotel can hide the "staff only" door behind a curtain so guests don't wander in (that's the frontend), but the door still needs a **lock and a key card check** (that's the backend). And even with a valid room key, your card must only open **your** room, not room 512 just because you typed 512 into the lift. In apps, the most common real attack is exactly that: changing the id in the URL (`/orders/512`) to read someone else's data. The fix is boring and effective: every query includes "and it belongs to this user".
:::

::: text 📖 Detailed answer
### Defence layers
| Layer | Control |
|---|---|
| React | `ProtectedRoute` (checking/anonymous/forbidden), `<Can permission>` to hide buttons: **UX only** |
| Network | HTTPS, CORS allowlist, WAF, API in private subnets behind a load balancer, rate limits |
| Express | `authenticate` (JWT signature + expiry + algorithm), `requirePermission`, Zod validation with `.strict()` |
| Query | **Ownership/tenant scoping** in every read and write |
| Data | Least-privilege database user; no admin credentials in the app |

### The #1 API bug: BOLA / IDOR
`Order.findById(req.params.id)` returns **any** order. Fix: `Order.findOne({ _id: id, userId: req.user.id })` unless the user has `order:read:any`. The same applies to updates and deletes (`findOneAndUpdate` with the scoped filter), and to **mass assignment**: `.strict()` schemas reject unexpected fields like `role` or `userId` in the body.

### Rules in this project (proved by the integration tests)
| Request | Result |
|---|---|
| No token → `GET /orders` | 401 |
| Ben → `GET /orders/<Asha's id>` | **404** |
| Ben → `PATCH /orders/<Asha's id>` | **404** |
| Support → `GET /orders/<Asha's id>` | 200 (`order:read:any`) |
| Asha → `PATCH` status | 403 (only support can change status) |
| Support → `DELETE /orders/:id` | 403 (only admin) |
| Asha → `GET /orders/not-an-id` | 404 |
| User → `GET /users` | 403 (`user:read:any` needed) |
| Create order with `total: 1` in the body | Rejected by `.strict()`; total is computed from items |
:::

::: diagram Every request passes the same gates
flowchart LR
  R["request"] --> A{"authenticate: valid, unexpired token?"}
  A -->|"no"| E401["401"]
  A -->|"yes"| P{"permission for this action?"}
  P -->|"no"| E403["403"]
  P -->|"yes"| S["query scoped to the user unless the permission is 'any'"]
  S -->|"not found or not yours"| E404["404"]
  S -->|"found"| OK["200 with a DTO (no secrets)"]
:::

::: image A curtain hides the staff door, but the lock and the room-key check are what protect it
/images/fullstack-integration/authorization.svg
:::

::: text 🪜 Step by step
Ben tries to read Asha's order by changing the URL:
1. `GET /api/v1/orders/66f…a1` with Ben's valid token.
2. `authenticate` verifies the JWT (HS256 only, not expired) → `req.user = { id: ben, role: 'user' }`.
3. `scope(req, { _id })` sees Ben lacks `order:read:any` → filter `{ _id: '66f…a1', userId: ben }`.
4. MongoDB finds nothing (the order belongs to Asha) → `404 NOT_FOUND`, the same answer as for an id that never existed.
5. Sam (support) sends the same request → `can(sam, 'order:read:any')` → filter `{ _id }` → 200.
6. In React, Ben never sees a "Change status" button because `<Can permission="order:update:any">` hides it, but if he calls the API directly he gets 403.
:::

::: code javascript fullstack-app/shared/permissions.mjs
// Shared by the API (enforcement) and the React app (hiding buttons). Plain ESM, no dependencies.
// Node 22 loads it from CommonJS with require() (require(esm)); Vite imports it directly.
export const ROLE_PERMISSIONS = {
  user: ['order:read:own', 'order:create', 'order:update:own'],
  support: ['order:read:any', 'order:update:any', 'user:read:any'],
  admin: ['order:read:any', 'order:update:any', 'order:delete:any', 'user:read:any', 'user:manage'],
};

export function can(user, permission) {
  return Boolean(user && ROLE_PERMISSIONS[user.role]?.includes(permission));
}
:::
::: code javascript fullstack-app/api/src/routes/orders.js
const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Order, toOrderDTO } = require('../models');
const { authenticate, requirePermission } = require('../middleware/auth');
const { AppError } = require('../middleware/errors');
const { can } = require('../../../shared/permissions.mjs');

const router = express.Router();
router.use(authenticate);                                          // every order route needs a logged-in user

// The heart of IDOR protection: users only ever query their OWN orders unless they have the "any" permission.
const scope = (req, extra = {}) => (can(req.user, 'order:read:any') ? extra : { ...extra, userId: req.user.id });
const validId = (id) => { if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Order not found'); return id; };

router.get('/', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const rows = await Order.find(scope(req)).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data: rows.map(toOrderDTO) });
});

router.get('/:id', async (req, res) => {
  const order = await Order.findOne(scope(req, { _id: validId(req.params.id) })).lean();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');        // 404, not 403: don't reveal it exists
  res.json({ data: toOrderDTO(order) });
});

const createSchema = z.object({
  items: z.array(z.object({ name: z.string().min(1).max(100), unitPrice: z.number().int().min(0), qty: z.number().int().min(1).max(99) }).strict()).min(1).max(50),
}).strict();

router.post('/', requirePermission('order:create'), async (req, res) => {
  const { items } = createSchema.parse(req.body);
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);     // never trust a total sent by the client
  const order = await Order.create({ userId: req.user.id, items, total });   // owner comes from the token, not the body
  res.status(201).location(`/api/v1/orders/${order._id}`).json({ data: toOrderDTO(order) });
});

// Owners can star their orders; support/admin can change status.
const patchSchema = z.object({ starred: z.boolean().optional(), status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'CANCELLED']).optional() }).strict();
router.patch('/:id', async (req, res) => {
  const body = patchSchema.parse(req.body);
  if (body.status && !can(req.user, 'order:update:any')) throw new AppError(403, 'FORBIDDEN', 'Only support can change status');
  const filter = can(req.user, 'order:update:any') ? { _id: validId(req.params.id) } : { _id: validId(req.params.id), userId: req.user.id };
  const order = await Order.findOneAndUpdate(filter, { $set: body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  res.json({ data: toOrderDTO(order) });
});

router.delete('/:id', requirePermission('order:delete:any'), async (req, res) => {
  const result = await Order.deleteOne({ _id: validId(req.params.id) });
  if (result.deletedCount === 0) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  res.status(204).end();
});

module.exports = router;
:::

::: code javascript Browser demo: permission matrix and ownership scoping (runnable)
const ROLE_PERMISSIONS = {
  user: ['order:read:own', 'order:create', 'order:update:own'],
  support: ['order:read:any', 'order:update:any', 'user:read:any'],
  admin: ['order:read:any', 'order:update:any', 'order:delete:any', 'user:read:any', 'user:manage'],
};
const can = (user, permission) => Boolean(user && ROLE_PERMISSIONS[user.role]?.includes(permission));
const orders = [{ _id: 'o1', userId: 'asha', total: 600 }, { _id: 'o2', userId: 'ben', total: 250 }];
const scope = (user, extra = {}) => (can(user, 'order:read:any') ? extra : { ...extra, userId: user.id });
const findOne = (filter) => orders.find((o) => Object.entries(filter).every(([k, v]) => o[k] === v)) ?? null;

const asha = { id: 'asha', role: 'user' }, ben = { id: 'ben', role: 'user' }, sam = { id: 'sam', role: 'support' };
console.log('Asha reads her order', findOne(scope(asha, { _id: 'o1' }))?.total === 600 ? '✅' : '❌ FAIL');
console.log("Ben can't read Asha's order (IDOR blocked → 404)", findOne(scope(ben, { _id: 'o1' })) === null ? '✅' : '❌ FAIL');
console.log('support can read any order', findOne(scope(sam, { _id: 'o1' })) !== null ? '✅' : '❌ FAIL');
console.log('support cannot delete', !can(sam, 'order:delete:any') ? '✅' : '❌ FAIL');
console.log('unknown role gets nothing', !can({ role: 'hacker' }, 'order:read:own') && !can(null, 'order:create') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `findById(req.params.id)` without an ownership filter (IDOR/BOLA).
- Trusting `userId`, `role` or `total` from the request body (mass assignment, price tampering).
- Relying on hidden buttons or route guards as security.
- Returning 403 for other users' resources (confirms they exist) where 404 is safer.
- Forgetting list endpoints, exports and search when adding scoping (they leak more than detail pages).
:::

::: understand
- Authentication answers "who are you"; authorization answers "may you do this to **this** record".
- Scoping by owner/tenant in the query is what makes authorization reliable.
- Shared permission definitions keep UI and API consistent; tests keep them honest.
:::

::: ask
- *"Is it multi-tenant?"* (every query needs `tenantId`; consider enforcing it in a Mongoose plugin)
- *"Which roles exist, and do they change at runtime?"*
- *"Do support/admin actions need an audit log?"*
:::

::: important ⭐ Say this in the interview
"Frontend guards are only for UX; the API enforces everything. Every protected route authenticates the JWT, checks a permission from a role-to-permission map, and scopes the database query to the owner unless the user has an 'any' permission, so a user changing an id in the URL just gets a 404. I never take the owner, role or price from the body; Zod strict schemas reject extra fields and totals are computed on the server. The same permission map is shared with React to hide buttons, and integration tests assert the matrix: another user's order is a 404, support can read but not delete, and no token is a 401."
:::

::: links
OWASP API Security Top 10: API1 Broken Object Level Authorization | https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
OWASP: Authorization cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
OWASP: Mass assignment cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html
:::

=== How do you handle loading, error and empty states?
@p 2
@tags ux, react, states
@quick
- Every async view has **loading, error, empty and success** states, plus **refreshing** (data shown while refetching).
- First load: a **skeleton** shaped like the content; background refetch: keep data visible with a thin progress bar (`isFetching`).
- Error: a clear message, the `requestId`, and **Try again** (`refetch`); 403/404 get specific text; render crashes go to an Error Boundary.
- Empty: explain and offer the next action ("No orders yet. Start shopping"); "no results for this filter" is different from "nothing yet".
- Mutations: disable buttons while pending; **optimistic updates** with rollback for instant feedback (tested: the star flips before the server answers).

::: text 🧒 In simple words
Think of a **restaurant table**. While the food is coming you see the place settings already laid out (skeleton), not a blank table. If the kitchen has a problem, the waiter tells you what happened and offers to try again (error). If you haven't ordered anything, the waiter hands you the menu (empty state with an action). And when you ask for more water, the glass is filled while the waiter goes to note it down (optimistic update); if the kitchen says no, they politely take it back.
:::

::: text 📖 Detailed answer
| State | TanStack Query flags | UI |
|---|---|---|
| Initial loading | `isPending` | Skeleton matching the layout (no layout shift), `aria-busy` |
| Background refresh | `isFetching && !isPending` | Keep data, thin progress bar |
| Error (no data yet) | `isError` | Message + `requestId` + Try again; 403/404 specific |
| Error (had data) | global `QueryCache.onError` | Toast "Could not refresh", keep showing old data |
| Empty | success and `data.length === 0` | Explanation + call to action |
| Success | `data` | Render |
| Mutation pending | `mutation.isPending` | Disable the button, show progress text |

### Optimistic updates
1. `onMutate`: cancel in-flight refetches, snapshot the cache, write the expected result.
2. `onError`: restore the snapshot.
3. `onSettled`: invalidate to refetch the truth.
Tested in jsdom: the ★ flipped **before** the PATCH response arrived, and the server confirmed it.

### Accessibility
`aria-busy` on loading regions, `role="alert"` for errors, a polite live region for toasts, buttons with `aria-pressed` for toggles, focus kept on the triggering control.
:::

::: diagram States of one screen
stateDiagram-v2
  [*] --> Loading: first mount
  Loading --> Success: data with rows
  Loading --> Empty: data with zero rows
  Loading --> Error: request failed
  Error --> Loading: Try again
  Success --> Refreshing: refetch (focus, invalidate)
  Refreshing --> Success: new data
  Refreshing --> Success: failed, keep old data and toast
:::

::: image A restaurant table: place settings while waiting, a menu when empty, a polite apology on errors
/images/fullstack-integration/ui-states.svg
:::

::: text 🪜 Step by step
The Orders page during a session (tested in jsdom):
1. First mount: `isPending` → three shimmering skeleton rows with `aria-busy="true"`.
2. Data arrives with 6 orders → the list renders; `isFetching` false.
3. Click ☆ on the first order → `onMutate` writes `starred: true` → the button shows ★ with `aria-pressed="true"` immediately.
4. `PATCH /orders/:id` returns 200 → `onSettled` invalidates → a background refetch shows the thin progress bar, then the same data.
5. If the PATCH had failed, `onError` would restore the snapshot and the global mutation handler would toast the message.
6. A new user with no orders sees "No orders yet. Start shopping" instead of an empty list.
:::

::: code jsx fullstack-app/web/src/components/AsyncView.jsx
// Every async screen has the same states: loading, error, empty, success (and refreshing). Handle them once.
export function AsyncView({ query, isEmpty = (d) => !d || (Array.isArray(d) && d.length === 0), loading, empty, children }) {
  const { data, isPending, isError, error, refetch, isFetching } = query;

  if (isPending) return loading ?? <div className="skeleton" aria-busy="true" aria-label="Loading" />;
  if (isError) {
    return (
      <div role="alert" className="error-state">
        <p>{error.status === 403 ? "You don't have access to this." : error.message}</p>
        {error.requestId && <small>Reference: {error.requestId}</small>}
        <button type="button" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }
  if (isEmpty(data)) return empty ?? <p className="empty">Nothing here yet.</p>;
  return (
    <div aria-busy={isFetching}>
      {isFetching && <div className="top-progress" aria-hidden="true" />}
      {children(data)}
    </div>
  );
}
:::
::: code jsx fullstack-app/web/src/pages/OrdersPage.jsx
import { useOrders, useToggleStar } from '../api/hooks';
import { Can } from '../auth/guards';
import { AsyncView } from '../components/AsyncView';

export function OrdersPage() {
  const orders = useOrders();
  const toggleStar = useToggleStar();

  return (
    <AsyncView
      query={orders}
      loading={<ul aria-busy="true" aria-label="Loading orders">{[1, 2, 3].map((i) => <li key={i} className="skeleton-row" />)}</ul>}
      empty={<p className="empty">No orders yet. <a href="/shop">Start shopping</a></p>}
    >
      {(rows) => (
        <ul aria-label="Orders">
          {rows.map((o) => (
            <li key={o.id}>
              <span>{o.items.map((i) => i.name).join(', ')}</span> · <span>₹{o.total}</span> · <span>{o.status}</span>
              <button type="button" aria-pressed={o.starred} aria-label={o.starred ? 'Unstar order' : 'Star order'}
                onClick={() => toggleStar.mutate({ id: o.id, starred: !o.starred })}>
                {o.starred ? '★' : '☆'}
              </button>
              <Can permission="order:update:any"><button type="button">Change status</button></Can>
            </li>
          ))}
        </ul>
      )}
    </AsyncView>
  );
}
:::

::: code javascript Browser demo: derive the view state, and an optimistic update with rollback (runnable)
function viewState(q, isEmpty = (d) => Array.isArray(d) && d.length === 0) {
  if (q.isPending) return 'loading';
  if (q.isError) return 'error';
  if (isEmpty(q.data)) return 'empty';
  return q.isFetching ? 'refreshing' : 'success';
}
const tests = [
  [{ isPending: true }, 'loading'],
  [{ isError: true, error: { message: 'x' } }, 'error'],
  [{ data: [] }, 'empty'],
  [{ data: [1, 2] }, 'success'],
  [{ data: [1, 2], isFetching: true }, 'refreshing'],
];
for (const [q, want] of tests) console.log(`${JSON.stringify(q)} → ${viewState(q)}`, viewState(q) === want ? '✅' : '❌ FAIL');

async function optimisticToggle(cache, id, server) {
  const previous = cache.orders;
  cache.orders = previous.map((o) => (o.id === id ? { ...o, starred: !o.starred } : o));   // instant
  try { await server(id); } catch { cache.orders = previous; return 'rolled back'; }
  return 'confirmed';
}
(async () => {
  const cache = { orders: [{ id: 1, starred: false }] };
  const ok = await optimisticToggle(cache, 1, async () => {});
  console.log('success keeps the optimistic value', ok === 'confirmed' && cache.orders[0].starred ? '✅' : '❌ FAIL');
  const bad = await optimisticToggle(cache, 1, async () => { throw new Error('500'); });
  console.log('failure rolls back', bad === 'rolled back' && cache.orders[0].starred === true ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- A full-page spinner on every refetch (content jumps, focus is lost).
- Treating "empty" as "error" or showing a blank area.
- Errors with no way to retry and no reference for support.
- Optimistic updates without rollback, or without cancelling in-flight refetches (an old response overwrites the new state).
- Double-submitting forms because the button isn't disabled while pending.
:::

::: understand
- Async UI is a small state machine; a reusable `AsyncView` makes every screen handle all states consistently.
- Keep stale data visible while refreshing: users prefer slightly old data to a spinner.
- Optimistic updates are for actions that almost always succeed (toggles, likes), with a rollback path.
:::

::: ask
- *"Does the design system have skeleton, empty-state and toast components?"*
- *"Which actions should feel instant (optimistic) and which must wait for the server (payments)?"*
- *"Where do we report render errors?"*
:::

::: important ⭐ Say this in the interview
"Every async screen handles loading, error, empty and success, plus refreshing. I use skeletons shaped like the content for the first load, keep data visible with a small progress bar during background refetches, show errors with a message, the request id and a Try again button, and give empty states an explanation and an action. A reusable AsyncView component wraps the query flags so every page behaves the same. For mutations I disable the button while pending, and for quick toggles I use optimistic updates: cancel in-flight queries, snapshot, update the cache, roll back on error and invalidate when settled. In a jsdom test the star flipped before the server answered. Render crashes go to an Error Boundary, and everything uses aria-busy, role alert and live regions."
:::

::: links
TanStack Query: Optimistic updates | https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
TanStack Query: Background fetching indicators | https://tanstack.com/query/latest/docs/framework/react/guides/background-fetching-indicators
React: Error boundaries | https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
:::

=== How do you optimize a slow API?
@p 3
@tags performance, caching, optimization
@quick
- **Measure first**: p50/p95/p99 per endpoint, plus where time goes (`Server-Timing`, tracing, DB profiler).
- Fix the biggest cost: DB (index, projection, `lean`, N+1, pagination), **independent calls in parallel** (`Promise.all`), slow dependencies (timeouts, cache, background jobs).
- **Cache-aside** in Redis for hot, rarely-changing data; HTTP caching for static/public data; TanStack Query on the client.
- Measured: dashboard **124 ms (miss) → 1.3 ms (Redis hit)**; a 100-user JSON page **15,609 B → 1,321 B gzip → 750 B brotli**.
- Parallelism helps when calls are slow: locally (1 ms DB calls + 120 ms service) it saved only ~4 ms; with 40/60/120 ms calls it takes **220 ms down to 120 ms**.

::: text 🧒 In simple words
If your breakfast takes too long, first **time each step**. Maybe the toast takes 3 minutes and you only start the eggs after the toast is done: do them **at the same time** (parallel). If you make the same smoothie every morning, prepare a jug and keep it in the fridge for a few days (cache). And if you're sending food to someone, **pack it small** (compression). But only fix what the stopwatch says is slow.
:::

::: text 📖 Detailed answer
### Systematic approach
1. **Measure**: latency percentiles per endpoint; `Server-Timing` headers (visible in DevTools) or OpenTelemetry spans for DB, cache and external calls.
2. **Find the bottleneck**, fix it, measure again.

| Bottleneck | Fixes |
|---|---|
| Database | Indexes (ESR), projection, `lean()`, batch instead of N+1, cursor pagination, precomputed aggregates |
| Sequential awaits | `Promise.all` for **independent** calls |
| Slow external service | Timeouts, caching, circuit breaker, move off the request path |
| Repeated identical reads | **Redis cache-aside** with TTL + invalidation on writes |
| Big responses | Pagination, field selection, gzip/brotli |
| Slow side effects (emails, PDFs) | Return **202 Accepted**, process in a queue |
| CPU-heavy work | Worker threads or a separate worker service |
| Capacity | More instances behind a load balancer, autoscaling, read replicas |

### Measured in this project
| Change | Before | After |
|---|---|---|
| Dashboard, Redis cache-aside (30 s TTL) | 124 ms (miss) | **1.3 ms** (hit) |
| `/users?limit=100` response size | 15,609 B raw | **1,321 B gzip** (750 B brotli) |
| Dashboard sequential → `Promise.all` (local DB ~1 ms, service 120 ms) | 125 ms | 121 ms |
The last row is the honest lesson: parallelism only helps when several calls are slow. With realistic 40/60/120 ms calls (demo below) sequential is ~220 ms and parallel ~120 ms.

### Cache-aside
Read: `GET key` → hit? return. Miss → load from DB → `SET key value EX ttl` → return.
Write: update DB → `DEL key` (or a short TTL if slightly stale data is acceptable). Personal data needs per-user keys and `Cache-Control: private`.
:::

::: diagram Dashboard request with timings and cache-aside
flowchart LR
  REQ["GET /dashboard"] --> C{"Redis: dashboard:userId?"}
  C -->|"hit, 1.3 ms"| RES["JSON + Server-Timing: cache hit"]
  C -->|"miss"| PAR["Promise.all"]
  PAR --> S1["stats aggregate"]
  PAR --> S2["recent orders"]
  PAR --> S3["recommendations service ~120 ms"]
  S1 --> SET["SET with 30 s TTL"]
  S2 --> SET
  S3 --> SET
  SET --> RES
:::

::: chart bar Measured: dashboard response time (ms)
Request,Milliseconds
Cache miss (DB + 120 ms service),124
Redis cache hit,1.3
:::

::: image Time each breakfast step, run them together, keep a jug ready, pack it small
/images/fullstack-integration/optimize.svg
:::

::: text 🪜 Step by step
Reading the dashboard in DevTools → Network → Timing (from the measured run behind Nginx):
1. First request: `Server-Timing: recent;dur=2.4, stats;dur=2.9, recs;dur=122.2, cache;desc="miss"` → the recommendations service is the bottleneck, the DB is fine.
2. Because the three loaders run in `Promise.all`, total ≈ the slowest one (≈ 124 ms), not the sum.
3. The result is stored in Redis for 30 s under `dashboard:<userId>`.
4. Second request: `Server-Timing: cache;desc="hit"` → 1.3 ms.
5. Responses over 1 KB are gzip-compressed by the `compression` middleware (`Content-Encoding: gzip`).
6. Next step if needed: a timeout + fallback for the recommendations service so a slow dependency can't slow the page.
:::

::: code javascript fullstack-app/api/src/routes/dashboard.js
const express = require('express');
const mongoose = require('mongoose');
const { Order, toOrderDTO } = require('../models');
const { authenticate } = require('../middleware/auth');
const cache = require('../lib/cache');

const router = express.Router();

// Three independent data sources for one screen.
const getStats = (userId) => Order.aggregate([
  { $match: { userId: new mongoose.Types.ObjectId(userId) } },                // aggregate() doesn't cast: do it yourself
  { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$total' } } },
]).then(([s]) => ({ orders: s?.orders ?? 0, spent: s?.spent ?? 0 }));
const getRecentOrders = (userId) => Order.find({ userId }).sort({ createdAt: -1 }).limit(5).lean().then((rows) => rows.map(toOrderDTO));
const RECS_LATENCY_MS = Number(process.env.RECS_LATENCY_MS ?? 120);         // stands in for a slow external service
const getRecommendations = () => new Promise((resolve) => setTimeout(() => resolve(['Mug', 'Notebook', 'Desk lamp']), RECS_LATENCY_MS));

async function timed(name, timings, fn) {
  const t = performance.now();
  try { return await fn(); } finally { timings.push(`${name};dur=${(performance.now() - t).toFixed(1)}`); }
}

async function loadDashboard(userId, timings = []) {
  // ✅ independent calls in parallel: total ≈ the slowest one, not the sum
  const [stats, recentOrders, recommendations] = await Promise.all([
    timed('stats', timings, () => getStats(userId)),
    timed('recent', timings, () => getRecentOrders(userId)),
    timed('recs', timings, getRecommendations),
  ]);
  return { stats, recentOrders, recommendations };
}

router.get('/', authenticate, async (req, res) => {
  const timings = [];
  const { value, hit } = await cache.cached(`dashboard:${req.user.id}`, 30, () => loadDashboard(req.user.id, timings));
  res.set('Server-Timing', [...timings, `cache;desc="${hit ? 'hit' : 'miss'}"`].join(', '));   // visible in DevTools → Network → Timing
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');                            // personal data: no shared caches
  res.json({ data: value });
});

module.exports = { router, loadDashboard, getStats, getRecentOrders, getRecommendations };
:::
::: code javascript fullstack-app/api/src/lib/cache.js
// Cache-aside helper. Uses Redis when REDIS_URL is set (shared by all API instances), memory otherwise (dev).
const Redis = require('ioredis');
const config = require('../config');

const redis = config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: 2 }) : null;
const memory = new Map();

async function get(key) {
  if (redis) { const raw = await redis.get(key); return raw === null ? undefined : JSON.parse(raw); }
  const hit = memory.get(key);
  if (!hit || hit.expires < Date.now()) { memory.delete(key); return undefined; }
  return hit.value;
}
async function set(key, value, ttlSeconds) {
  if (redis) await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  else memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}
async function del(key) {
  if (redis) await redis.del(key); else memory.delete(key);
}

// Read: cache hit → return. Miss → load from the source, store with a TTL, return.
async function cached(key, ttlSeconds, loader) {
  const hit = await get(key);
  if (hit !== undefined) return { value: hit, hit: true };
  const value = await loader();
  await set(key, value, ttlSeconds);
  return { value, hit: false };
}

module.exports = { cached, del, close: () => redis?.quit() };
:::

::: code javascript Browser demo: sequential vs parallel with realistic latencies, plus cache-aside (runnable)
const delay = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
const getStats = () => delay(40, { orders: 6 });
const getRecent = () => delay(60, ['o1', 'o2']);
const getRecs = () => delay(120, ['Mug']);
const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { value: hit.value, hit: true };
  const value = await loader();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return { value, hit: false };
}
(async () => {
  let t = performance.now();
  await getStats(); await getRecent(); await getRecs();
  const sequential = performance.now() - t;
  t = performance.now();
  await Promise.all([getStats(), getRecent(), getRecs()]);
  const parallel = performance.now() - t;
  console.log(`sequential ${Math.round(sequential)} ms vs parallel ${Math.round(parallel)} ms`);
  console.log('sequential ≈ sum (≥ 220 ms)', sequential >= 215 ? '✅' : '❌ FAIL');
  console.log('parallel ≈ slowest (< 180 ms)', parallel < 180 ? '✅' : '❌ FAIL');
  const load = () => Promise.all([getStats(), getRecent(), getRecs()]);
  t = performance.now(); const first = await cached('dashboard:u1', 30_000, load); const missMs = performance.now() - t;
  t = performance.now(); const second = await cached('dashboard:u1', 30_000, load); const hitMs = performance.now() - t;
  console.log(`cache miss ${Math.round(missMs)} ms, hit ${hitMs.toFixed(2)} ms`, !first.hit && second.hit && hitMs < 5 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Optimising without measuring (adding Redis to an endpoint whose problem is a missing index).
- `Promise.all` on calls that depend on each other, or on 1,000 calls at once (use a concurrency limit).
- Caching without invalidation, or caching personal data under a shared key.
- No timeouts on external calls: one slow dependency ties up the whole API.
- Compressing tiny responses or already-compressed images (CPU for nothing).
:::

::: understand
- Latency budgets: know what each part of the request costs before changing anything.
- Parallelism cuts waiting, caching removes work, compression cuts transfer, queues move work off the request path.
- The best optimisation is often not doing the work: smaller pages, fewer fields, precomputed results.
:::

::: ask
- *"What's the latency target (SLO) and which percentile is slow?"*
- *"How fresh must this data be?"* (cache TTL and invalidation)
- *"Is the time in our code, the database or a dependency?"*
:::

::: important ⭐ Say this in the interview
"I measure before changing anything: latency percentiles per endpoint and a breakdown per dependency with tracing or Server-Timing headers. Then I fix the biggest cost: database work with indexes, projection, lean and batching; independent calls with Promise.all; slow dependencies with timeouts, caching or moving them to a background job; and large payloads with pagination and compression. In this project the dashboard went from 124 milliseconds on a cache miss to 1.3 on a Redis hit with cache-aside and a 30-second TTL, and gzip shrank a 15.6 KB user page to 1.3 KB. Parallelism only helps when several calls are slow: locally it saved 4 milliseconds, with realistic 40, 60 and 120 millisecond calls it goes from about 220 to 120."
:::

::: links
MDN: Server-Timing | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing
Express: Performance best practices | https://expressjs.com/en/advanced/best-practice-performance.html
Redis: Caching patterns | https://redis.io/solutions/caching/
:::

=== How would you design a production-ready React + Node.js + MongoDB application?
@p 3
@tags architecture, system-design, production
@quick
- **Web**: React build (static files) on **S3 + CloudFront** or Nginx; hashed assets cached for a year, `index.html` never cached; SPA fallback.
- **API**: stateless Express containers (2+ across AZs) behind an **ALB**; layered code, Zod validation, one error format, JWT + rotating refresh cookie, RBAC + ownership checks, rate limits, health checks, graceful shutdown.
- **Data**: MongoDB **Atlas** replica set (backups, point-in-time restore), Redis (cache, rate limits), **S3** (private, presigned URLs), a queue (SQS/BullMQ) for slow work.
- **Ops**: Docker images, CI (lint, test, build, scan) → CD (rolling/blue-green), secrets in **SSM/Secrets Manager**, structured logs with request ids, metrics, tracing, alarms.
- Start as a well-structured **monolith API + managed services**; scale out by adding instances, caching and queues before splitting into services.

::: text 🧒 In simple words
A production app is like a **well-run restaurant chain**. The menu and decorations (the React build) are printed once and sent to every branch (CDN). Several identical kitchens (API containers) cook orders, so if one closes, the others keep going (load balancer + multiple zones). The pantry (database) is professionally managed with daily backups. Slow jobs like baking a cake for tomorrow go to a back room (queue + worker). Keys to the safe are in a locked office, not taped under the counter (secrets manager). And there are cameras and alarms (logs, metrics, alerts) so problems are noticed before customers complain.
:::

::: text 📖 Detailed answer
### Architecture on AWS
Users → Route 53 → **CloudFront** (+ WAF): static files from **S3**, `/api/*` → **ALB** (HTTPS) → **API containers** on ECS Fargate (or EC2) in private subnets across 2+ AZs → **MongoDB Atlas** (VPC peering/PrivateLink), **ElastiCache Redis**, **S3** uploads, **SQS + worker** for emails/reports/images; **CloudWatch** logs, metrics and alarms.

### Checklist by area
| Area | Decisions in this project (or the next step) |
|---|---|
| Web | Vite build, lazy routes, TanStack Query, error boundaries, accessibility, immutable asset caching |
| API | `/api/v1`, layered routes, Zod `.strict()`, one error shape with `requestId`, pagination caps, compression |
| Auth | 15-min access JWT in memory, rotating httpOnly refresh cookie with reuse detection, RBAC + ownership scoping |
| Data | Indexes from access patterns, `syncIndexes` in deploys, transactions only where needed, backups + PITR |
| Files | Private bucket, presigned PUT/GET, bucket CORS, lifecycle rules |
| Performance | Redis cache-aside, CDN, gzip, connection pooling (`maxPoolSize`), async jobs |
| Security | Helmet, CORS allowlist only if cross-origin, secrets manager, least-privilege IAM, WAF, dependency scanning |
| Reliability | Health checks, graceful shutdown (SIGTERM), multi-AZ, retries with backoff, timeouts |
| Observability | One log line per request with request id and duration, `Server-Timing`, tracing, alarms on 5xx rate and p95 |
| Delivery | Dockerfiles, CI on every PR, image scan, rolling deploys, IaC (Terraform/CDK) |
| Testing | Integration tests (node:test + Supertest + real MongoDB), UI tests, E2E (Playwright) for key flows |

### Configuration (12-factor)
All settings come from environment variables; production refuses to start if a secret is missing (`config.js`), and secrets are injected from SSM/Secrets Manager, never committed.

### Scaling path
1. Vertical + indexes + caching. 2. More API instances (stateless: sessions in tokens/Redis, files in S3). 3. Read-heavy → caching/replicas; write-heavy → queues and batching. 4. Split hot domains into services only when team or load requires it.
:::

::: diagram Production architecture on AWS
flowchart TB
  U(["Users"]) --> R53["Route 53"] --> CF["CloudFront + WAF"]
  CF -->|"static files"| S3W[("S3: React build")]
  CF -->|"/api/*"| ALB["Application Load Balancer, HTTPS"]
  subgraph VPC["VPC, private subnets, 2 AZs"]
    ALB --> A1["API container AZ-a"]
    ALB --> A2["API container AZ-b"]
    A1 --> RD[("ElastiCache Redis")]
    A2 --> RD
    A1 --> Q["SQS queue"]
    Q --> W["Worker: emails, reports, thumbnails"]
  end
  A1 --> MDB[("MongoDB Atlas replica set")]
  A2 --> MDB
  A1 --> S3F[("S3: uploads, private")]
  W --> S3F
  A1 -.-> CW["CloudWatch logs, metrics, alarms"]
:::

::: image A restaurant chain: printed menus everywhere, identical kitchens, a managed pantry and alarms
/images/fullstack-integration/production.svg
:::

::: text 🪜 Step by step
A deploy of this project, from commit to traffic:
1. A pull request runs CI: install, lint, `node --test` against a throwaway MongoDB, `vite build`, Docker build, image scan.
2. Merge to main → images are tagged with the commit SHA and pushed to ECR.
3. A migration step runs `syncIndexes()` (after reviewing `diffIndexes()` for drops).
4. ECS starts new API tasks; the ALB health check (`/api/health`) must pass before they receive traffic.
5. Old tasks get SIGTERM → `server.close()` finishes in-flight requests → MongoDB/Redis connections close → exit.
6. The web build is uploaded to S3; CloudFront serves new hashed assets immediately, and `index.html` (no-cache) points to them.
7. Alarms watch the 5xx rate and p95 latency; a bad deploy is rolled back to the previous image tag.
:::

::: code yaml fullstack-app/docker-compose.yml
# Local production-like stack: docker compose up -d --build → http://localhost:8080
# Seed demo data once: docker compose exec api npm run seed   (password: Secret123)
services:
  mongo:
    image: mongo:7
    volumes: [mongo_data:/data/db]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      retries: 20

  redis:
    image: redis:7-alpine

  s3:                                                # SeaweedFS: S3-compatible storage for local development
    image: chrislusf/seaweedfs:latest
    command: server -s3 -dir=/data -s3.config=/etc/seaweedfs/s3-config.json
    ports: ["8333:8333"]                             # the browser uploads here with presigned URLs
    volumes:
      - s3_data:/data
      - ./s3-config.json:/etc/seaweedfs/s3-config.json:ro

  api:
    build: { context: ., dockerfile: api/Dockerfile }
    environment:
      MONGO_URI: mongodb://mongo:27017/fullstack_app
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-local-access-secret-change-me}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-local-refresh-secret-change-me}
      NODE_ENV: development                          # cookies without "Secure" because this runs on plain http
      AWS_REGION: us-east-1
      AWS_ACCESS_KEY_ID: local                       # must match s3-config.json (local only, never real keys)
      AWS_SECRET_ACCESS_KEY: local-secret
      S3_ENDPOINT: http://s3:8333                    # how the API reaches S3 inside Docker
      S3_PUBLIC_ENDPOINT: http://localhost:8333      # how the browser reaches S3
    command: sh -c "node scripts/create-bucket.js && node src/server.js"
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_started }
      s3: { condition: service_started }
    restart: on-failure                              # retries until SeaweedFS accepts connections

  web:
    build: { context: ., dockerfile: web/Dockerfile }
    ports: ["8080:80"]
    depends_on: [api]

volumes:
  mongo_data:
  s3_data:
:::
::: code docker fullstack-app/api/Dockerfile
# Build context: the repository root (so the shared/ folder can be copied too)
FROM node:22-alpine
WORKDIR /app/api
ENV NODE_ENV=production
COPY api/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY shared /app/shared
COPY api/src ./src
COPY api/scripts ./scripts
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]
:::
::: code docker fullstack-app/web/Dockerfile
# Stage 1: build the static files. Stage 2: serve them with Nginx (no Node in production for the web).
FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY shared /app/shared
COPY web ./
RUN npm run build

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
:::
::: code javascript fullstack-app/api/src/server.js
const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const cache = require('./lib/cache');

async function main() {
  await mongoose.connect(config.mongoUri, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.syncIndexes();                         // small app: sync on boot; big apps do it in a deploy step
  const server = createApp().listen(config.port, () => console.log(`API listening on :${config.port}`));

  // Graceful shutdown: stop accepting connections, finish in-flight requests, then close the DB.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => { await mongoose.disconnect(); await cache.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
:::
::: code javascript fullstack-app/api/src/config.js
// All configuration comes from environment variables (12-factor). Fail fast on missing secrets in production.
const isProd = process.env.NODE_ENV === 'production';

function required(name, devDefault) {
  const value = process.env[name] ?? (isProd ? undefined : devDefault);
  if (value === undefined) throw new Error(`Missing required env var ${name}`);
  return value;
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/fullstack_app'),
  redisUrl: process.env.REDIS_URL || null,                         // optional: cache falls back to memory
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS) || 7,
  },
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.S3_BUCKET || 'fullstack-app-uploads',
    endpoint: process.env.S3_ENDPOINT || undefined,                // set for MinIO/SeaweedFS locally; empty on AWS
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,   // the URL browsers use, if different
  },
};
:::

::: code javascript Browser demo: fail-fast configuration like config.js (runnable)
function loadConfig(env) {
  const isProd = env.NODE_ENV === 'production';
  const missing = [];
  const required = (name, devDefault) => {
    const value = env[name] ?? (isProd ? undefined : devDefault);
    if (value === undefined) missing.push(name);
    return value;
  };
  const config = {
    port: Number(env.PORT) || 4000,
    mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/app'),
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-secret'),
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  return config;
}
console.log('development runs with safe defaults', loadConfig({}).mongoUri.startsWith('mongodb://localhost') ? '✅' : '❌ FAIL');
let message = '';
try { loadConfig({ NODE_ENV: 'production', MONGO_URI: 'mongodb+srv://cluster/app' }); } catch (e) { message = e.message; }
console.log('production refuses to start without secrets:', message, message.includes('JWT_ACCESS_SECRET') ? '✅' : '❌ FAIL');
console.log('CORS list parsed', JSON.stringify(loadConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' }).corsOrigins) === '["https://a.com","https://b.com"]' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Starting with microservices, Kubernetes and five databases for an app with 100 users.
- Storing sessions or uploaded files on the API server's disk (breaks horizontal scaling).
- Secrets in the repository or baked into Docker images.
- No health checks or graceful shutdown → dropped requests on every deploy.
- No backups tested by an actual restore; no alarms until users complain.
:::

::: understand
- Production readiness is a checklist across security, reliability, observability and delivery, not one technology.
- Stateless API containers + managed data services is the simplest design that scales a long way.
- Every "-ility" should map to something concrete you can point to in code or infrastructure.
:::

::: ask
- *"Expected users and requests per second? Read- or write-heavy? Real-time needs?"*
- *"Compliance (PII, PCI) and data residency?"*
- *"Team size, budget, managed vs self-hosted preferences?"*
:::

::: important ⭐ Say this in the interview
"I'd start with a well-structured monolith API and managed services. The React build goes to S3 behind CloudFront with immutable hashed assets, and CloudFront routes /api to an ALB in front of stateless Express containers across two availability zones. Data lives in a MongoDB Atlas replica set with backups and point-in-time restore, Redis for caching and rate limits, S3 for uploads with presigned URLs, and SQS with a worker for slow jobs. The API has layered code, Zod validation, a single error format with request ids, short access tokens with rotating refresh cookies, RBAC with ownership checks, health checks and graceful shutdown. Secrets come from a secrets manager, CI runs tests and scans and deploys Docker images with rolling updates, and logs, metrics, tracing and alarms on 5xx and p95 make problems visible. Then it scales by adding instances, caching and queues before any service split."
:::

::: links
AWS Well-Architected Framework | https://aws.amazon.com/architecture/well-architected/
The Twelve-Factor App | https://12factor.net
Docker: Compose file reference | https://docs.docker.com/reference/compose-file/
:::

=== Practice project: build React + Node + Express + MongoDB + S3 end-to-end
@p 3
@tags project, practice, portfolio
@quick
- The code in this section **is** the practice project: `fullstack-app/` with `api/` (Express 5, Mongoose 9, Zod 4), `web/` (React 19, React Router 8, TanStack Query 5, Vite 8), `shared/` and Docker.
- It was tested: **4 API integration tests**, **18 UI checks** in jsdom against the real API, the S3 flow against SeaweedFS, and the full Docker stack (Nginx, API, MongoDB, Redis, S3).
- Features map to interview topics: auth with refresh rotation, RBAC/IDOR, pagination + search, optimistic UI, presigned uploads, caching, error handling, Docker.
- Run it: `docker compose up -d --build` → `docker compose exec api npm run seed` → http://localhost:8080 (password `Secret123`).
- Extend it yourself: cursor pagination, Swagger/OpenAPI, rate limiting, CI workflow, deploy to EC2 or ECS; then practise a 2-minute walkthrough.

::: text 🧒 In simple words
Reading about swimming doesn't teach you to swim. This project is a **small but real swimming pool**: the same pieces a company app has (login, roles, lists, uploads, caching, Docker), small enough to understand completely. Build it, break it, fix it, and in the interview you can say "here's how I did it in my project" instead of reciting definitions.
:::

::: text 📖 Detailed answer
### Project layout
| Path | What it contains |
|---|---|
| `api/src/app.js`, `server.js`, `config.js` | Express app, startup + graceful shutdown, env config |
| `api/src/middleware/` | `auth.js` (JWT, permissions), `errors.js` (one error format) |
| `api/src/routes/` | `auth`, `users`, `orders`, `uploads`, `dashboard` |
| `api/src/models.js`, `lib/cache.js` | Mongoose schemas + DTOs, Redis/memory cache-aside |
| `api/scripts/` | `seed.js` (demo data), `create-bucket.js` (local S3 + CORS) |
| `api/test/api.test.js` | Integration tests with `node:test` + Supertest + real MongoDB |
| `shared/permissions.mjs` | Role → permission map used by API and web |
| `web/src/api/` | `http.js`, `endpoints.js`, `hooks.js` |
| `web/src/auth/`, `components/`, `pages/` | Session, guards, AsyncView, Toaster, uploader, pages |
| `docker-compose.yml`, `*/Dockerfile`, `web/nginx.conf` | Local production-like stack |

### Features → interview topics
| Feature | Topics you can talk about |
|---|---|
| Register / login / refresh / logout | bcrypt, Zod, httpOnly cookies, rotation + reuse detection, single-flight refresh |
| Roles and order ownership | RBAC, IDOR/BOLA, 401 vs 403 vs 404, mass assignment |
| Users table | Offset pagination, URL state, prefetch, anchored-prefix search with an index |
| Orders list | Loading/error/empty states, optimistic updates with rollback |
| Avatar upload | Presigned PUT with signed type + length, bucket CORS, HEAD verification |
| Dashboard | `Promise.all`, Redis cache-aside, `Server-Timing`, compression |
| Errors | Error middleware, `ApiError`, retry policy, request ids |
| Docker | Multi-stage web build, Nginx SPA + proxy, health checks, compose |

### How to run
1. **Docker (everything)**: `docker compose up -d --build`, then `docker compose exec api npm run seed`, open http://localhost:8080 and log in as `asha@example.com`, `support@example.com` or `admin@example.com` with `Secret123`.
2. **Dev mode**: start MongoDB (`docker run -d -p 27017:27017 mongo:7`), then `cd api && npm install && npm run seed && npm run dev`, and `cd web && npm install && npm run dev` → http://localhost:5173.
3. **Tests**: `cd api && MONGO_URI=mongodb://localhost:27017/fullstack_app_test npm test`.

### Next milestones
1. Cursor pagination for orders (see MongoDB Scenarios) and `useInfiniteQuery`.
2. OpenAPI docs (`swagger-ui-express`) and rate limiting on auth routes.
3. GitHub Actions: lint, test with a MongoDB service container, build images.
4. Deploy: EC2 + Docker + Nginx + Certbot, or ECS + ALB; secrets from SSM; real S3 with an IAM role.
:::

::: diagram Project architecture
flowchart TB
  subgraph WEB["web/ (React 19 + TanStack Query)"]
    P["pages"] --> HK["api/hooks.js"] --> HT["api/http.js"]
  end
  HT -->|"/api/v1 via Vite proxy or Nginx"| API["api/ (Express 5)"]
  API --> M[("MongoDB")]
  API --> R[("Redis cache")]
  API -->|"presign + HEAD"| S3[("S3 / SeaweedFS")]
  WEB -->|"PUT file with presigned URL"| S3
  SH["shared/permissions.mjs"] -.-> WEB
  SH -.-> API
:::

::: image A small but real swimming pool: every part of a company app, small enough to understand
/images/fullstack-integration/practice-project.svg
:::

::: text 🪜 Step by step
A 2-minute interview walkthrough of this project:
1. **Problem**: a small shop admin with orders, users and avatars.
2. **Architecture**: React SPA → Nginx → Express API → MongoDB, Redis, S3; one origin so no CORS.
3. **Auth**: access token in memory, rotating httpOnly refresh cookie, single-flight refresh, RBAC + ownership scoping (show the IDOR test).
4. **Interesting challenge**: the pagination label bug found while measuring prefetch, or why uploads use presigned URLs (100 MB vs 2.5 KB through the API).
5. **Quality**: integration tests against a real database, UI tests driving the real app, Docker stack.
6. **Next**: cursor pagination, CI/CD, deploy with IaC.
:::

::: code json fullstack-app/api/package.json
{
  "name": "fullstack-app-api",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "node --watch --env-file-if-exists=.env src/server.js",
    "start": "node src/server.js",
    "seed": "node --env-file-if-exists=.env scripts/seed.js",
    "test": "node --test"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1144.0",
    "@aws-sdk/s3-request-presigner": "^3.1144.0",
    "bcryptjs": "^3.0.3",
    "compression": "^1.8.2",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "helmet": "^8.3.0",
    "ioredis": "^6.0.0",
    "jsonwebtoken": "^9.0.3",
    "mongoose": "^9.10.3",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "supertest": "^7.3.0"
  }
}
:::
::: code json fullstack-app/web/package.json
{
  "name": "fullstack-app-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.104.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router": "^8.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.1",
    "vite": "^8.3.2"
  }
}
:::
::: code javascript fullstack-app/api/src/models.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, minLength: 2, maxLength: 60 },
  nameLower: { type: String, select: false },                     // for index-friendly prefix search
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'support', 'admin'], default: 'user' },
  avatarKey: String,
  refreshJti: { type: String, select: false },                    // current refresh token id (rotation)
}, { timestamps: true });
UserSchema.pre('save', function () { if (this.isModified('name')) this.nameLower = this.name.toLowerCase(); });
UserSchema.index({ createdAt: -1, _id: -1 });
UserSchema.index({ nameLower: 1 });

const OrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ _id: false, name: String, unitPrice: Number, qty: Number }],
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED'], default: 'PENDING' },
  starred: { type: Boolean, default: false },
}, { timestamps: true });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

// API responses use DTOs: never send passwordHash, refreshJti or __v.
const toUserDTO = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, avatarKey: u.avatarKey ?? null, createdAt: u.createdAt });
const toOrderDTO = (o) => ({ id: String(o._id), userId: String(o.userId), items: o.items, total: o.total, status: o.status, starred: o.starred, createdAt: o.createdAt });

module.exports = { User: model('User', UserSchema), Order: model('Order', OrderSchema), toUserDTO, toOrderDTO };
:::
::: code javascript fullstack-app/api/scripts/seed.js
// Creates demo users and orders. Run: npm run seed   (password for everyone: Secret123)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { User, Order } = require('../src/models');

async function main() {
  await mongoose.connect(config.mongoUri);
  await Promise.all([User.deleteMany({}), Order.deleteMany({})]);
  await mongoose.connection.syncIndexes();
  const passwordHash = await bcrypt.hash('Secret123', 10);
  const base = Date.UTC(2026, 0, 1);
  const people = [
    { name: 'Admin', email: 'admin@example.com', role: 'admin' },
    { name: 'Sam Support', email: 'support@example.com', role: 'support' },
    { name: 'Asha', email: 'asha@example.com', role: 'user' },
    { name: 'Ben', email: 'ben@example.com', role: 'user' },
    ...Array.from({ length: 116 }, (_, i) => ({ name: `Member ${String(i + 1).padStart(3, '0')}`, email: `member${i + 1}@example.com`, role: 'user' })),
  ].map((p, i) => ({ ...p, nameLower: p.name.toLowerCase(), passwordHash, createdAt: new Date(base + i * 3600_000) }));
  const users = await User.insertMany(people, { lean: true });
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const orders = [];
  for (const [email, count] of [['asha@example.com', 6], ['ben@example.com', 3]]) {
    for (let i = 0; i < count; i++) {
      const qty = 1 + (i % 3);
      orders.push({ userId: byEmail[email]._id, items: [{ name: `Book ${i + 1}`, unitPrice: 250, qty }], total: 250 * qty, status: i % 2 ? 'PAID' : 'PENDING', createdAt: new Date(base + i * 86_400_000) });
    }
  }
  await Order.insertMany(orders);
  console.log(`seeded ${users.length} users and ${orders.length} orders (password: Secret123)`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
:::
::: code javascript fullstack-app/api/test/api.test.js
// Integration tests: real Express app + real MongoDB (a separate test database).
// Run: MONGO_URI=mongodb://localhost:27017/fullstack_app_test npm test
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ||= 'mongodb://localhost:27017/fullstack_app_test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { User, Order } = require('../src/models');

const app = createApp();
const agent = () => request.agent(app);                            // keeps cookies between requests, like a browser

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User.deleteMany({}), Order.deleteMany({})]);
  await mongoose.connection.syncIndexes();
});
after(() => mongoose.disconnect());

async function register(name, email, role) {
  const a = agent();
  const res = await a.post('/api/v1/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  if (role) {
    await User.updateOne({ email }, { $set: { role } });
    const again = await a.post('/api/v1/auth/login').send({ email, password: 'Secret123' }).expect(200);
    return { agent: a, token: again.body.accessToken };
  }
  return { agent: a, token: res.body.accessToken };
}

test('register → me → validation and duplicate errors use one error shape', async () => {
  const { token } = await register('Asha', 'asha@example.com');
  const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(me.body.user.email, 'asha@example.com');
  assert.equal(me.body.user.passwordHash, undefined);

  const bad = await request(app).post('/api/v1/auth/register').send({ email: 'nope', password: 'x' }).expect(400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  assert.ok(bad.body.error.details.some((d) => d.field === 'email'));
  assert.ok(bad.body.error.requestId);

  const dup = await request(app).post('/api/v1/auth/register').send({ name: 'Copy', email: 'ASHA@example.com', password: 'Secret123' }).expect(409);
  assert.equal(dup.body.error.code, 'CONFLICT');
});

test('refresh rotates the token and detects reuse of an old one', async () => {
  const { agent: a } = await register('Rita', 'rita@example.com');
  const cookieBefore = (await a.post('/api/v1/auth/refresh').expect(200)).headers['set-cookie'][0].split(';')[0];
  await a.post('/api/v1/auth/refresh').expect(200);                // rotates again: cookieBefore is now old
  const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieBefore).expect(401);
  assert.equal(reuse.body.error.code, 'REFRESH_REUSED');
  await a.post('/api/v1/auth/refresh').expect(401);                // whole session revoked after reuse
});

test('users cannot read each other’s orders (IDOR), support can', async () => {
  const asha = await register('Asha Two', 'asha2@example.com');
  const ben = await register('Ben', 'ben@example.com');
  const support = await register('Sam', 'sam@example.com', 'support');
  const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${asha.token}`)
    .send({ items: [{ name: 'Mug', unitPrice: 300, qty: 2 }] }).expect(201);
  assert.equal(created.body.data.total, 600);                      // computed on the server
  const id = created.body.data.id;

  await request(app).get(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${ben.token}`).expect(404);
  await request(app).patch(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${ben.token}`).send({ starred: true }).expect(404);
  await request(app).get(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${support.token}`).expect(200);
  await request(app).patch(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${asha.token}`).send({ status: 'SHIPPED' }).expect(403);
  await request(app).delete(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${support.token}`).expect(403);
  await request(app).get('/api/v1/orders/not-an-id').set('Authorization', `Bearer ${asha.token}`).expect(404);
  await request(app).get('/api/v1/orders').expect(401);
});

test('users list is paginated, searchable and permission-checked', async () => {
  const admin = await register('Admin', 'admin@example.com', 'admin');
  const plain = await register('Plain', 'plain@example.com');
  await request(app).get('/api/v1/users').set('Authorization', `Bearer ${plain.token}`).expect(403);
  const page = await request(app).get('/api/v1/users?page=1&limit=2').set('Authorization', `Bearer ${admin.token}`).expect(200);
  assert.equal(page.body.data.length, 2);
  assert.equal(page.body.pagination.hasNextPage, true);
  const search = await request(app).get('/api/v1/users?q=ash').set('Authorization', `Bearer ${admin.token}`).expect(200);
  assert.deepEqual(search.body.data.map((u) => u.name).sort(), ['Asha', 'Asha Two']);
  await request(app).get('/api/v1/users?limit=1000').set('Authorization', `Bearer ${admin.token}`).expect(400);
});
:::
::: code html fullstack-app/web/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Full-Stack App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::
::: code jsx fullstack-app/web/src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
:::
::: code jsx fullstack-app/web/src/App.jsx
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { createQueryClient } from './queryClient';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/guards';
import { Toaster } from './components/Toaster';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { UsersPage } from './pages/UsersPage';
import { ProfilePage } from './pages/ProfilePage';
import { can } from '../../shared/permissions.mjs';

function Nav() {
  const { status, user, logout } = useAuth();
  if (status !== 'authenticated') return null;
  return (
    <nav aria-label="Main">
      <Link to="/orders">Orders</Link> <Link to="/profile">Profile</Link>
      {can(user, 'user:read:any') && <> <Link to="/users">Users</Link></>}
      <span> {user.name} ({user.role}) </span>
      <button type="button" onClick={logout}>Log out</button>
    </nav>
  );
}

export default function App() {
  const [queryClient] = useState(createQueryClient);                // one client per app instance
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Nav />
          <main>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route element={<ProtectedRoute permission="user:read:any" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/orders" replace />} />
            </Routes>
          </main>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
:::
::: code css fullstack-app/web/src/styles.css
body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 860px; padding: 16px; }
nav { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
form { display: grid; gap: 8px; max-width: 360px; }
.skeleton, .skeleton-row { height: 20px; margin: 6px 0; border-radius: 6px; background: linear-gradient(90deg, #eee, #f6f6f6, #eee); background-size: 200% 100%; animation: shimmer 1.2s infinite; list-style: none; }
@keyframes shimmer { to { background-position: -200% 0; } }
.top-progress { height: 3px; background: #6366f1; animation: shimmer 1s infinite; }
.error-state, [role="alert"] { color: #b91c1c; }
.empty { color: #64748b; }
.toaster { position: fixed; bottom: 16px; right: 16px; display: grid; gap: 8px; }
.toast { background: #1e293b; color: #fff; padding: 8px 12px; border-radius: 8px; margin: 0; }
@media (prefers-color-scheme: dark) { body { background: #0f172a; color: #e2e8f0; } .skeleton, .skeleton-row { background: #1e293b; } }
:::
::: code json fullstack-app/s3-config.json
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
::: code text fullstack-app/.env.example
# Copy to api/.env for local development without Docker (never commit real secrets)
MONGO_URI=mongodb://localhost:27017/fullstack_app
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
# REDIS_URL=redis://localhost:6379
# S3_ENDPOINT=http://localhost:8333
# S3_PUBLIC_ENDPOINT=http://localhost:8333
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=local
# AWS_SECRET_ACCESS_KEY=local-secret
:::
::: code text fullstack-app/.dockerignore
**/node_modules
**/dist
**/.env
:::

::: code javascript Browser demo: track your progress through the project milestones (runnable)
const milestones = [
  { id: 'api-crud', topics: ['REST', 'Zod', 'errors'], done: true },
  { id: 'auth', topics: ['JWT', 'refresh rotation', 'cookies'], done: true },
  { id: 'rbac', topics: ['permissions', 'IDOR'], done: true },
  { id: 'pagination', topics: ['URL state', 'prefetch', 'indexes'], done: true },
  { id: 'uploads', topics: ['S3', 'presigned URLs', 'CORS'], done: false },
  { id: 'deploy', topics: ['Docker', 'Nginx', 'CI/CD'], done: false },
];
const progress = (list) => Math.round((list.filter((m) => m.done).length / list.length) * 100);
const nextUp = (list) => list.find((m) => !m.done)?.id ?? 'all done';
const topicsCovered = (list) => new Set(list.filter((m) => m.done).flatMap((m) => m.topics)).size;
console.log(`progress ${progress(milestones)}%, next: ${nextUp(milestones)}, topics practised: ${topicsCovered(milestones)}`);
console.log('progress is 67% with 4 of 6 done', progress(milestones) === 67 ? '✅' : '❌ FAIL');
console.log('next milestone is uploads', nextUp(milestones) === 'uploads' ? '✅' : '❌ FAIL');
console.log('11 interview topics already practised', topicsCovered(milestones) === 11 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Building a huge project and never finishing; ship a small complete slice first.
- Skipping tests and Docker, which are exactly what interviewers ask about.
- Copying code you can't explain; for each file, be ready to say why it's written that way.
- Committing `.env` files or real AWS keys to GitHub.
:::

::: understand
- A finished small project beats an unfinished big one.
- Every feature should map to an interview topic you can explain with your own code.
- Tests and measurements turn opinions ("it's faster") into evidence ("2 queries instead of 101").
:::

::: ask
- *"Can you walk me through a project you built end to end?"* (prepare the 2-minute version)
- *"What was hard, and what would you do differently?"*
- *"How is it deployed and monitored?"*
:::

::: important ⭐ Say this in the interview
"I built a small full-stack app to practise end to end: React 19 with TanStack Query and React Router, an Express 5 API with Mongoose and Zod, MongoDB, Redis and S3, all running in Docker behind Nginx. It has access tokens in memory with rotating httpOnly refresh cookies and single-flight refresh, role permissions with ownership-scoped queries tested against IDOR, paginated search with URL state and prefetching, optimistic updates, presigned S3 uploads that never pass bytes through Node, and a cached dashboard. It's covered by integration tests against a real database and UI tests that drive the real app. One thing I learned while measuring: my pagination label was computed from the URL instead of the data on screen, which a prefetch test exposed."
:::

::: links
Node.js: Test runner | https://nodejs.org/api/test.html
Supertest | https://github.com/ladjs/supertest
Vite: Getting started | https://vite.dev/guide/
React Router: Installation (v8) | https://reactrouter.com/start/declarative/installation
:::
