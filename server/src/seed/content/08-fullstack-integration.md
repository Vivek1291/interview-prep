@section Full-Stack Integration
@icon 🔗
@color #7c3aed
@desc React ↔ Node ↔ MongoDB end-to-end: API layers, auth, errors, pagination, uploads, UI states, performance and production design.

=== How does React communicate with your Node.js backend?
@p 3
@tags react, http, cors, proxy
@quick
- React (browser) makes **HTTP requests** (fetch/axios) to the Express **REST API** → JSON responses; real-time via **WebSocket/SSE**.
- Dev: Vite/CRA **proxy** `/api` → `localhost:5000` (avoids CORS). Prod: **same origin** via Nginx/CloudFront reverse proxy, or CORS allowlist.
- Base URL from env (`import.meta.env.VITE_API_URL`), one configured **axios instance** with interceptors.
- Auth: Bearer token header or httpOnly cookie (`withCredentials: true`).
- Server state managed with **React Query** (cache, retries, loading/error states).

::: text
### The request path
1. The user action triggers a React Query hook → an API client function.
2. The browser sends `GET https://app.com/api/v1/orders?page=2` with the `Authorization` header or cookies.
3. **Nginx / ALB / CloudFront** routes `/api/*` to the Node service (and serves the React static build for everything else).
4. **Express** → middleware (CORS, auth, validation) → controller → service → MongoDB.
5. A JSON response is cached by React Query, and components re-render.

### CORS in one paragraph
Browsers block cross-origin JS requests unless the server allows them. If React is on `app.com` and the API is on `api.com`, the server must send `Access-Control-Allow-Origin: https://app.com` (and `Allow-Credentials` for cookies). Non-simple requests (JSON body, custom headers) trigger an **OPTIONS preflight**. **Avoid CORS entirely** by serving both from the same origin through a reverse proxy.

### Communication options
| Need | Technology |
|---|---|
| CRUD / request-response | REST (or GraphQL) over HTTPS |
| Server pushes updates | **WebSocket** (Socket.IO, ws), **SSE** (one-way, simple), long polling |
| File upload | multipart/form-data or **S3 presigned URL** |
:::

::: diagram
flowchart LR
  subgraph Browser
    RC["React components"] --> RQ["React Query hooks"] --> AX["axios instance: baseURL, interceptors"]
  end
  AX -->|"HTTPS /api/*"| NG["Nginx / ALB / CloudFront"]
  NG -->|"static files"| ST["React build: index.html, JS, CSS"]
  NG -->|"proxy"| EX["Express API"]
  EX --> DB[("MongoDB")]
  EX -. "WebSocket / SSE" .-> RC
:::

::: code javascript Vite dev proxy + Express CORS config
// vite.config.js — dev only: browser calls /api on :5173, Vite forwards to :5000 (no CORS)
export default {
  server: { proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
};

// Express — only needed when frontend and API are on DIFFERENT origins
const cors = require('cors');
const allowed = (process.env.CORS_ORIGINS || '').split(','); // e.g. https://app.example.com
app.use(cors({
  origin: (origin, cb) => (!origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
  credentials: true,                       // allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
:::

::: code nginx Production: one domain, Nginx serves React + proxies API
server {
  listen 443 ssl;
  server_name app.example.com;
  root /var/www/app/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;   # SPA fallback for React Router
  }
}
:::

::: ask
- *"Are frontend and backend deployed on the same domain?"* This decides between CORS and cookie SameSite settings.
- *"Is there a BFF or API gateway in between?"*
:::

::: links
MDN: CORS | https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
Vite server proxy | https://vite.dev/config/server-options#server-proxy
:::

=== How do you structure API calls in React?
@p 3
@tags react-query, api-layer, architecture
@quick
- Layers: **Component → custom hook (useOrders) → React Query → API functions (ordersApi.list) → axios instance → HTTP**.
- Components never call axios directly; API URLs & shapes live in one place.
- **Query key factory** (`orderKeys.list(filters)`) for consistent caching/invalidation.
- React Query handles caching, dedupe, retries, background refetch, pagination, optimistic updates.
- Cancel requests with `AbortSignal` (React Query passes `signal`).

::: text
### Layered frontend data architecture
| Layer | Responsibility | Example |
|---|---|---|
| **HTTP client** | baseURL, auth header, error normalisation, refresh-on-401 | `api/http.js` (axios instance + interceptors) |
| **API module** | One function per endpoint, typed request/response | `api/orders.js` → `list(params)`, `get(id)`, `create(body)` |
| **Query keys** | Cache identity | `orderKeys.detail(id)` |
| **Custom hooks** | React Query wiring + business-specific options | `useOrders(filters)`, `useCreateOrder()` |
| **Components** | UI only: loading/error/empty/success rendering | `<OrdersTable />` |

### Why?
- **Single source of truth** for endpoints (easy to change `/v1` → `/v2`).
- **Testable** (mock API modules or use MSW).
- **Consistent** loading, error and caching behaviour.
- Components stay small and declarative.
:::

::: diagram
flowchart TD
  C["OrdersPage component"] --> H["useOrders(filters) custom hook"]
  H --> RQ["React Query: cache, retry, dedupe"]
  RQ --> API["ordersApi.list(params, signal)"]
  API --> HTTP["axios instance: interceptors"]
  HTTP --> S(["Express API"])
:::

::: code javascript api/http.js + api/orders.js + hooks/useOrders.js
// ---------- api/http.js ----------
import axios from 'axios';
export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1', timeout: 15000, withCredentials: true });
http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
http.interceptors.response.use(
  (r) => r,
  (err) => Promise.reject({
    status: err.response?.status,
    code: err.response?.data?.code || (err.code === 'ERR_CANCELED' ? 'CANCELED' : 'NETWORK_ERROR'),
    message: err.response?.data?.message || err.message,
    details: err.response?.data?.details,
  })
);

// ---------- api/orders.js ----------
export const ordersApi = {
  list: (params, signal) => http.get('/orders', { params, signal }).then((r) => r.data),
  get: (id, signal) => http.get(`/orders/${id}`, { signal }).then((r) => r.data.data),
  create: (body) => http.post('/orders', body).then((r) => r.data.data),
  updateStatus: (id, status) => http.patch(`/orders/${id}`, { status }).then((r) => r.data.data),
};

// ---------- api/queryKeys.js ----------
export const orderKeys = {
  all: ['orders'],
  lists: () => [...orderKeys.all, 'list'],
  list: (filters) => [...orderKeys.lists(), filters],
  detail: (id) => [...orderKeys.all, 'detail', id],
};

// ---------- hooks/useOrders.js ----------
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
export const useOrders = (filters) =>
  useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: ({ signal }) => ordersApi.list(filters, signal),   // auto-cancel when key changes/unmount
    placeholderData: keepPreviousData,                          // no flicker between pages
    staleTime: 30_000,
  });

export const useUpdateOrderStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => ordersApi.updateStatus(id, status),
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(order.id), order);
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};

// ---------- components/OrdersPage.jsx ----------
// const { data, isPending, isError, error, isPlaceholderData } = useOrders({ page, status });
:::

::: ask
- *"Do you already use React Query / RTK Query / SWR?"* Adapt to their stack, but explain the layering, because it's library-agnostic.
- *"Is the API typed (OpenAPI/tRPC)?"* Generating clients from OpenAPI removes a whole class of bugs.
:::

::: links
TanStack Query | https://tanstack.com/query/latest
Effective React Query keys (TkDodo) | https://tkdodo.eu/blog/effective-react-query-keys
:::

=== How do you handle authentication between frontend and backend?
@p 3
@tags auth, react, jwt, protected-routes
@quick
- Login form → `POST /auth/login` → **access token (memory)** + **refresh token (httpOnly cookie)**.
- **AuthProvider** context holds `user` + status; on app load call `/auth/refresh` or `/me` to restore the session.
- **ProtectedRoute** redirects to `/login` (remember the `from` location); role-based routes for admin.
- Axios interceptor attaches the token; on 401 → refresh once (shared promise) → retry; else logout.
- Backend **always** re-checks permissions; frontend guards are UX only.

::: text
### Flow
1. **Login**: the React form calls `/auth/login`. The server validates credentials and returns `{ accessToken, user }` + sets the refresh cookie.
2. **Store**: the access token goes in memory (AuthContext / module variable) and the user in context.
3. **Requests**: the interceptor adds `Authorization: Bearer …`.
4. **Expiry**: the API returns 401 `TOKEN_EXPIRED` → the interceptor calls `/auth/refresh` (the cookie is sent automatically) → retries the original request.
5. **Page reload**: memory is empty, so on boot call `/auth/refresh`; show a splash/loading until resolved.
6. **Route protection**: `<ProtectedRoute>` checks `status === 'authenticated'` and optionally roles.
7. **Logout**: `POST /auth/logout` (revoke refresh token, clear cookie), clear the React Query cache, navigate to /login.
8. **Multi-tab**: sync logout across tabs with a `BroadcastChannel` or the `storage` event.
:::

::: diagram
stateDiagram-v2
  [*] --> Checking: app loads
  Checking --> Authenticated: refresh OK
  Checking --> Anonymous: no or invalid refresh cookie
  Anonymous --> Authenticated: login success
  Authenticated --> Authenticated: 401 then refresh OK then retry
  Authenticated --> Anonymous: logout or refresh fails
:::

::: code jsx AuthProvider + ProtectedRoute (React Router v6)
import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { http, setAccessToken } from './api/http';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    // restore session on page load
    http.post('/auth/refresh')
      .then(({ data }) => { setAccessToken(data.accessToken); setState({ status: 'authenticated', user: data.user }); })
      .catch(() => setState({ status: 'anonymous', user: null }));
  }, []);

  const login = async (email, password) => {
    const { data } = await http.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setState({ status: 'authenticated', user: data.user });
  };

  const logout = async () => {
    await http.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setState({ status: 'anonymous', user: null });
    queryClient.clear(); // drop cached private data
  };

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function ProtectedRoute({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}

// Routes
// <Route element={<ProtectedRoute />}>            <Route path="/orders" element={<Orders />} /> </Route>
// <Route element={<ProtectedRoute roles={['admin']} />}> <Route path="/admin" element={<Admin />} /> </Route>
:::

::: ask
- *"Is there SSO (Okta, Azure AD, Cognito)?"* Then use the OIDC Authorization Code + PKCE flow with a library (oidc-client-ts, Amplify, Auth0 SDK).
- *"Do different roles see different menus?"*, and remember **the API must still enforce it**.
:::

::: links
React Router: auth example | https://github.com/remix-run/react-router/tree/main/examples/auth
:::

=== How do you handle API errors? (frontend + backend)
@p 3
@tags errors, react, ux
@quick
- Backend: consistent error shape + status codes + `code` (see Express section).
- Frontend: **normalise** errors in the axios interceptor; handle **globally** (401 → login, 500/network → toast) and **locally** (form field errors from `details`).
- React Query: `isError`/`error` per query, `retry` only for network/5xx (not 4xx), `onError` in mutations.
- **Error Boundaries** for render crashes; fallback UI with "Try again".
- Log to Sentry with the requestId for correlation.

::: text
### Categories and handling
| Error | Where | UX |
|---|---|---|
| **Validation (400/422)** | Mutation `onError` | Show messages next to fields (`setError` in React Hook Form) |
| **401** | Interceptor | Refresh token → retry, else redirect to login |
| **403** | Page/query | "You don't have access" page |
| **404** | Query | Not-found state |
| **409** | Mutation | "Already exists / someone else changed this" |
| **429** | Interceptor | "Too many requests, retry in N s" |
| **5xx / network** | Global | Toast + retry button; React Query auto-retries (with backoff) |
| **Render exception** | Error Boundary | Fallback UI, report to Sentry |

### Retry policy
Don't retry 4xx (they won't succeed). Retry network errors and 5xx with **exponential backoff**, and only for **idempotent** requests (or when using idempotency keys).
:::

::: code jsx Global + local error handling with React Query
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error.status >= 500 || error.code === 'NETWORK_ERROR') toast.error(error.message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, vars, ctx, mutation) => {
      if (!mutation.options.onError) toast.error(error.message); // global fallback
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => (error.status >= 500 || error.code === 'NETWORK_ERROR') && failureCount < 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // exponential backoff
    },
  },
});

// Local: map server validation errors to form fields (React Hook Form)
function ProfileForm() {
  const { register, handleSubmit, setError, formState: { errors } } = useForm();
  const mutation = useMutation({
    mutationFn: usersApi.update,
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') err.details.forEach((d) => setError(d.field, { message: d.message }));
      else toast.error(err.message);
    },
  });
  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
      <input {...register('email')} />
      {errors.email && <p className="error">{errors.email.message}</p>}
      <button disabled={mutation.isPending}>Save</button>
    </form>
  );
}

// Error boundary for render errors (react-error-boundary)
// <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => queryClient.resetQueries()}> <App /> </ErrorBoundary>
:::

::: ask
- *"Is there a design for error states (toast vs inline vs full page)?"* *"Do we report errors to Sentry/Datadog?"*
:::

::: links
TanStack Query: retries | https://tanstack.com/query/latest/docs/framework/react/guides/query-retries
react-error-boundary | https://github.com/bvaughn/react-error-boundary
:::

=== How do you implement pagination end-to-end?
@p 3
@tags pagination, react-query, full-stack
@quick
- React: page/limit/filters in **URL search params** → `useQuery({ queryKey: ['users', {page, limit, q}] })` with `placeholderData: keepPreviousData`.
- `GET /users?page=2&limit=20` → Express validates & clamps → service: `find().sort().skip().limit()` + `countDocuments` (or cursor).
- Response: `{ data, pagination: { page, limit, total, totalPages, hasNextPage } }`.
- **Prefetch** the next page; reset to page 1 when filters change; debounce search.
- Infinite scroll → cursor + `useInfiniteQuery` + IntersectionObserver.

::: text
### Flow
**React** → `GET /users?page=2&limit=20` → **Express** route → **Controller** (parse & validate query) → **Service** (business defaults, sorting) → **Repository/MongoDB** (`skip/limit` or cursor + index) → **Response** with metadata → **React Query** caches `['users', { page: 2 }]`.

### UX details that impress interviewers
- Keep state in the **URL** (`?page=2&q=viv`), so it's shareable, and back/forward work.
- `keepPreviousData` prevents the table flickering to a spinner between pages.
- **Prefetch** page + 1 for instant navigation.
- **Reset to page 1** when search/filters change.
- Show "Showing 21–40 of 523".
- Disable Next on the last page, and handle **empty** results.
:::

::: diagram
sequenceDiagram
  participant U as User
  participant R as React (URL ?page=2)
  participant Q as React Query cache
  participant A as Express
  participant M as MongoDB
  U->>R: click Next
  R->>Q: useQuery key users page 2
  Q->>A: GET /users?page=2&limit=20
  A->>M: find.sort.skip(20).limit(20) + count
  M-->>A: 20 docs, total 523
  A-->>Q: data + pagination
  Q-->>R: render rows (previous page kept while loading)
  R->>Q: prefetch page 3
:::

::: code jsx React: paginated users table with URL state + prefetch
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const fetchUsers = ({ page, limit, q }, signal) =>
  http.get('/users', { params: { page, limit, q }, signal }).then((r) => r.data);

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const q = params.get('q') || '';
  const limit = 20;
  const [search, setSearch] = useState(q);
  const qc = useQueryClient();

  // debounce search → URL (resets page to 1)
  useEffect(() => {
    const t = setTimeout(() => setParams(search ? { q: search, page: '1' } : { page: '1' }), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['users', { page, limit, q }],
    queryFn: ({ signal }) => fetchUsers({ page, limit, q }, signal),
    placeholderData: keepPreviousData,
  });

  // prefetch next page
  useEffect(() => {
    if (data?.pagination.hasNextPage) {
      qc.prefetchQuery({ queryKey: ['users', { page: page + 1, limit, q }], queryFn: ({ signal }) => fetchUsers({ page: page + 1, limit, q }, signal) });
    }
  }, [data, page, q]);

  const go = (p) => setParams({ ...(q && { q }), page: String(p) });

  if (isPending) return <TableSkeleton rows={limit} />;
  if (isError) return <ErrorState message={error.message} />;
  const { data: users, pagination } = data;

  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" />
      {users.length === 0 ? <EmptyState text="No users match your search" /> : (
        <table style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td></tr>)}</tbody>
        </table>
      )}
      <p>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}</p>
      <button disabled={page === 1} onClick={() => go(page - 1)}>Prev</button>
      <span> Page {page} / {pagination.totalPages} </span>
      <button disabled={!pagination.hasNextPage || isPlaceholderData} onClick={() => go(page + 1)}>Next</button>
    </>
  );
}
:::

::: code javascript Express side (controller → service → repository)
// controller
exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const q = (req.query.q || '').trim();
  res.json(await userService.list({ page, limit, q }));
});

// service
exports.list = async ({ page, limit, q }) => {
  const filter = q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {};
  const [items, total] = await userRepository.findPage(filter, { skip: (page - 1) * limit, limit, sort: { createdAt: -1, _id: -1 } });
  return {
    data: items.map(toUserDTO),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasNextPage: page * limit < total },
  };
};

// repository
exports.findPage = (filter, { skip, limit, sort }) =>
  Promise.all([User.find(filter).sort(sort).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
:::

::: ask
- *"Client-side or server-side pagination?"* Client-side only for small datasets (< ~1000 rows).
- *"Page numbers or infinite scroll?"* *"Must filters survive refresh / be shareable?"*
:::

::: links
TanStack Query paginated queries | https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
:::

=== How do you upload an image from React to S3?
@p 3
@tags s3, presigned-url, upload
@quick
- Best practice: **presigned URL**. React asks Node for a signed PUT URL → uploads **directly to S3** → tells Node the key to save in MongoDB.
- Node never streams the bytes → scalable, cheap, fast; the AWS secret never reaches the browser.
- Validate type/size before signing; unique key `users/{id}/{uuid}.jpg`; short expiry (e.g. 60 s).
- Bucket **private**; display via presigned GET URL or CloudFront (OAC).
- Needs **S3 CORS** config allowing PUT from your origin.

::: text
### Two approaches
1. **Proxy through Node** (multer): React → Node → S3. Simple, but Node handles every byte (CPU, memory, bandwidth, timeouts).
2. **Presigned URL** ✅: React → Node (small JSON request for permission) → React **PUTs directly to S3** → React → Node (confirm + save metadata).

### Presigned flow step by step
1. React validates the file (type, size) → `POST /api/uploads/presign { fileName, contentType, size }`.
2. Node checks auth + rules → generates a key `avatars/{userId}/{uuid}.png` → creates a **presigned PUT URL** (expires in 60 s) using its IAM role.
3. React does `PUT <url>` with the file body and the `Content-Type` header (use XHR/axios for progress).
4. On success React calls `POST /api/users/me/avatar { key }` → Node verifies the object exists (`HeadObject`) → saves the **key** in MongoDB.
5. To display: Node returns a presigned **GET** URL (or a CloudFront URL).
:::

::: diagram
sequenceDiagram
  participant R as React
  participant N as Node API
  participant S as S3 (private bucket)
  participant M as MongoDB
  R->>N: POST /uploads/presign (fileName, type, size)
  N->>N: auth + validate + key = avatars/u42/uuid.png
  N-->>R: uploadUrl (expires 60s) + key
  R->>S: PUT uploadUrl (file bytes, progress bar)
  S-->>R: 200 OK
  R->>N: POST /users/me/avatar (key)
  N->>S: HeadObject(key) verify
  N->>M: save avatarKey
  N-->>R: 200 avatarUrl (presigned GET / CloudFront)
:::

::: code javascript Node: presign endpoint (AWS SDK v3)
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const s3 = new S3Client({ region: process.env.AWS_REGION }); // creds from EC2/ECS IAM role
const BUCKET = process.env.S3_BUCKET;
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SIZE = 5 * 1024 * 1024;

router.post('/uploads/presign', authenticate, asyncHandler(async (req, res) => {
  const { contentType, size } = req.body;
  if (!ALLOWED[contentType]) throw new AppError(400, 'Only JPG/PNG/WEBP allowed');
  if (size > MAX_SIZE) throw new AppError(400, 'Max 5MB');

  const key = `avatars/${req.user.id}/${crypto.randomUUID()}.${ALLOWED[contentType]}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 60 }
  );
  res.json({ uploadUrl, key });
}));

router.post('/users/me/avatar', authenticate, asyncHandler(async (req, res) => {
  const { key } = req.body;
  if (!key.startsWith(`avatars/${req.user.id}/`)) throw new AppError(403, 'Invalid key'); // can't claim others' files
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));        // exists?
  if (head.ContentLength > MAX_SIZE) throw new AppError(400, 'File too large');
  await User.updateOne({ _id: req.user.id }, { $set: { avatarKey: key } });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
  res.json({ avatarUrl: url });
}));
:::

::: code jsx React: upload with progress
import axios from 'axios';
import { useState } from 'react';

export function AvatarUploader({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Only images');
    if (file.size > 5 * 1024 * 1024) return setError('Max 5MB');
    setError('');
    try {
      const { data } = await http.post('/uploads/presign', { fileName: file.name, contentType: file.type, size: file.size });
      // plain axios (NOT our API instance) → no Authorization header sent to S3
      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': file.type },
        onUploadProgress: (ev) => setProgress(Math.round((ev.loaded / ev.total) * 100)),
      });
      const res = await http.post('/users/me/avatar', { key: data.key });
      onDone(res.data.avatarUrl);
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
  };

  return (
    <div>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
      {progress > 0 && progress < 100 && <progress max="100" value={progress} />}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
:::

::: code json S3 bucket CORS configuration
[
  {
    "AllowedOrigins": ["https://app.example.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
:::

::: ask
- *"Max file size? Large files (> 100 MB)?"* → multipart upload with presigned part URLs.
- *"Do we need thumbnails / virus scanning?"* → S3 event → Lambda.
- *"Public or private images?"* → CloudFront vs presigned GET.
:::

::: links
AWS: presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
AWS SDK v3 presigner | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/
:::

=== How do you prevent unauthorized users from accessing APIs? (full-stack view)
@p 3
@tags security, authorization, full-stack
@quick
- **Frontend guards are UX only**; the **backend enforces everything**.
- Every protected route: `authenticate` → `authorize(role/permission)` → **ownership-scoped queries** (`{ _id, userId: req.user.id }`).
- Never trust ids/roles sent from the client; derive the user from the token.
- Return 401 / 403 / 404 appropriately; don't leak existence.
- Add rate limiting, CORS allowlist, HTTPS, short token expiry, audit logs.

::: text
### Defence layers
| Layer | Control |
|---|---|
| React | Hide buttons/routes the user can't use (`ProtectedRoute`, `<Can permission="order:delete">`), purely for UX |
| Network | HTTPS, CORS allowlist, WAF, API in a private subnet behind a load balancer |
| Express | `authenticate` (valid token), `authorize` (role/permission), validation, rate limiting |
| Service | **Ownership / tenant checks** on every read/write |
| Database | Least-privilege DB user, queries always filtered by `userId`/`tenantId` |

### Most common real bug: IDOR / BOLA
`GET /api/invoices/66f…` returns **any** invoice if the code does `Invoice.findById(id)`. Fix: `Invoice.findOne({ _id: id, userId: req.user.id })`.
:::

::: code javascript Permission-based authorization (RBAC) shared by frontend & backend
// shared/permissions.js
const ROLE_PERMISSIONS = {
  user: ['order:read:own', 'order:create'],
  support: ['order:read:any', 'order:update:any'],
  admin: ['order:read:any', 'order:update:any', 'order:delete:any', 'user:manage'],
};
const can = (user, permission) => !!user && ROLE_PERMISSIONS[user.role]?.includes(permission);

// backend middleware
const requirePermission = (permission) => (req, res, next) =>
  can(req.user, permission) ? next() : res.status(403).json({ code: 'FORBIDDEN', message: 'Not allowed' });

router.get('/orders/:id', authenticate, asyncHandler(async (req, res) => {
  const filter = can(req.user, 'order:read:any') ? { _id: req.params.id } : { _id: req.params.id, userId: req.user.id };
  const order = await Order.findOne(filter).lean();
  if (!order) return res.status(404).json({ code: 'NOT_FOUND' });
  res.json({ data: order });
}));
router.delete('/orders/:id', authenticate, requirePermission('order:delete:any'), deleteOrder);

// frontend component
// const Can = ({ permission, children }) => (can(useAuth().user, permission) ? children : null);
// <Can permission="order:delete:any"><button>Delete</button></Can>
:::

::: ask
- *"Is the app multi-tenant?"* Every query must include `tenantId`; consider enforcing it in a Mongoose plugin/middleware so nobody forgets.
:::

::: links
OWASP: Authorization cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
:::

=== How do you handle loading, error and empty states?
@p 2
@tags ux, react, states
@quick
- Every async view has **4 states**: loading, error, empty, success (+ refreshing/partial).
- **Skeletons** instead of spinners for content; keep previous data during refetch (`isPlaceholderData`, `isFetching`).
- Error state with a clear message + **Retry** button (`refetch`); an Error Boundary for crashes.
- Empty state with guidance/CTA ("No orders yet. Create one").
- Mutations: disable buttons, optimistic updates with rollback, toasts.

::: text
| State | React Query flag | UI |
|---|---|---|
| Initial loading | `isPending` | Skeleton matching the layout (avoids layout shift) |
| Background refresh | `isFetching && !isPending` | Subtle spinner / top progress bar; keep the data visible |
| Error | `isError`, `error` | Message + Retry (`refetch()`); 403/404 get specific screens |
| Empty | success + `data.length === 0` | Illustration, explanation, CTA; different copy for "no results for filter" vs "nothing yet" |
| Success | `data` | Render |
| Mutation pending | `mutation.isPending` | Disable button, inline spinner |

**Accessibility:** announce loading/errors with `aria-live="polite"` / `role="alert"` and `aria-busy` on containers.
:::

::: code jsx Reusable AsyncView component
function AsyncView({ query, isEmpty = (d) => !d || (Array.isArray(d) && d.length === 0), skeleton, empty, children }) {
  const { data, isPending, isError, error, refetch, isFetching } = query;

  if (isPending) return skeleton ?? <div aria-busy="true" className="skeleton" />;
  if (isError) {
    return (
      <div role="alert" className="error-state">
        <p>{error.status === 403 ? "You don't have access to this." : error.message || 'Something went wrong'}</p>
        <button onClick={() => refetch()}>Try again</button>
      </div>
    );
  }
  if (isEmpty(data)) return empty ?? <p className="empty">Nothing here yet.</p>;
  return (
    <div aria-busy={isFetching}>
      {isFetching && <TopProgressBar />}
      {children(data)}
    </div>
  );
}

// usage
const ordersQuery = useOrders(filters);
<AsyncView
  query={ordersQuery}
  isEmpty={(d) => d.data.length === 0}
  skeleton={<TableSkeleton rows={10} />}
  empty={<EmptyState title="No orders yet" action={<Link to="/shop">Start shopping</Link>} />}
>
  {(d) => <OrdersTable rows={d.data} />}
</AsyncView>;
:::

::: code jsx Optimistic update with rollback (toggle favourite)
const useToggleFavourite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fav }) => http.patch(`/products/${id}`, { favourite: fav }),
    onMutate: async ({ id, fav }) => {
      await qc.cancelQueries({ queryKey: ['products'] });
      const previous = qc.getQueryData(['products']);
      qc.setQueryData(['products'], (old) => old.map((p) => (p.id === id ? { ...p, favourite: fav } : p)));
      return { previous };
    },
    onError: (err, vars, ctx) => { qc.setQueryData(['products'], ctx.previous); toast.error('Could not update'); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};
:::

::: ask
- *"Is there a design system with skeleton/empty components?"* *"Should we show stale data while refreshing?"*
:::

::: links
TanStack Query: optimistic updates | https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
:::

=== How do you optimize a slow API?
@p 3
@tags performance, caching, optimization
@quick
- **Measure first** (APM/tracing/logs with durations): find the bottleneck (DB, external API, CPU, payload, network).
- DB: indexes, projection, lean, avoid N+1, pagination, aggregation tuning.
- App: run independent calls **in parallel** (`Promise.all`), avoid blocking CPU work, stream large responses.
- **Caching**: HTTP (`Cache-Control`/ETag/CDN), app cache (**Redis**, cache-aside), React Query client cache.
- Payload: gzip/brotli, smaller JSON, pagination; async jobs (202 + queue) for slow work; scale horizontally.

::: text
### Systematic approach
1. **Measure**: p50/p95/p99 latency per endpoint; tracing (OpenTelemetry/X-Ray) shows time per span (DB, Redis, external HTTP).
2. **Find the bottleneck**, then fix the biggest one first.

| Bottleneck | Fixes |
|---|---|
| Database | Indexes (ESR), projections, `.lean()`, fix N+1, cursor pagination, precomputed aggregates |
| Sequential awaits | `Promise.all` for independent calls |
| External APIs | Timeouts, caching, circuit breaker, parallelise, move to background |
| CPU-heavy work | Worker threads, queue + worker service, precompute |
| Large payloads | Pagination, field selection, compression, streaming |
| Repeated identical reads | **Redis cache-aside**, HTTP caching/CDN, ETag → 304 |
| Slow side effects (email, PDF) | Respond **202 Accepted** + process in a queue (BullMQ/SQS) |
| Capacity | Horizontal scaling (PM2 cluster, more containers), autoscaling, read replicas |

### Cache-aside pattern
Read: check Redis → hit? return : query DB → store in Redis with TTL → return.
Write: update DB → **invalidate** (delete) the cache key.
:::

::: diagram Cache-aside
flowchart LR
  REQ["GET /products/42"] --> R{"Redis hit?"}
  R -->|"yes, ~1ms"| RES["Response"]
  R -->|"no"| DB[("MongoDB ~40ms")] --> SET["SET product:42 with TTL 300s"] --> RES
  UPD["PATCH /products/42"] --> DB2[("update MongoDB")] --> DEL["DEL product:42"]
:::

::: chart bar p95 latency after each optimisation (illustrative)
Step,p95 (ms)
Baseline,2400
Parallel Promise.all,1300
Index + projection,450
Redis cache,60
gzip + pagination,45
:::

::: code javascript Parallelise + cache-aside + compression
const compression = require('compression');
app.use(compression()); // gzip responses

// ❌ Sequential (3 independent calls → sum of latencies)
// const user = await getUser(id); const orders = await getOrders(id); const recs = await getRecs(id);

// ✅ Parallel (max of latencies)
async function getDashboard(userId) {
  const [user, orders, recs] = await Promise.all([getUser(userId), getRecentOrders(userId), getRecommendations(userId)]);
  return { user, orders, recs };
}

// Cache-aside helper
async function cached(key, ttlSec, loader) {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const value = await loader();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  return value;
}

router.get('/products/:id', asyncHandler(async (req, res) => {
  const product = await cached(`product:${req.params.id}`, 300, () =>
    Product.findById(req.params.id).select('name price images stock').lean());
  res.set('Cache-Control', 'public, max-age=60'); // browser/CDN cache too
  res.json({ data: product });
}));

router.patch('/products/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
  await redis.del(`product:${req.params.id}`); // invalidate
  res.json({ data: product });
}));

// Slow work → async job
router.post('/reports', authenticate, asyncHandler(async (req, res) => {
  const job = await reportQueue.add('generate', { userId: req.user.id, range: req.body.range });
  res.status(202).json({ jobId: job.id, statusUrl: `/api/reports/jobs/${job.id}` });
}));
:::

::: code javascript Try it: sequential vs parallel awaits (runs in browser)
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const getUser = () => delay(200, 'user');
const getOrders = () => delay(300, 'orders');
const getRecs = () => delay(250, 'recs');

(async () => {
  let t = performance.now();
  await getUser(); await getOrders(); await getRecs();
  console.log('sequential:', Math.round(performance.now() - t), 'ms');

  t = performance.now();
  await Promise.all([getUser(), getOrders(), getRecs()]);
  console.log('parallel  :', Math.round(performance.now() - t), 'ms');
})();
:::

::: ask
- *"What's the target latency (SLO)? Which percentile is slow? Is it slow for everyone or specific data?"*
- *"How fresh must the data be?"* This decides the cache TTL and invalidation strategy.
:::

::: links
Node.js performance best practices | https://expressjs.com/en/advanced/best-practice-performance.html
Redis caching patterns | https://redis.io/docs/latest/develop/use/client-side-caching/
:::

=== How would you design a production-ready React + Node.js + MongoDB application?
@p 3
@tags architecture, system-design, production
@quick
- **Frontend**: React + Vite + React Query + router + design system; build → **S3 + CloudFront** (or Nginx).
- **Backend**: Express layered (routes/controllers/services/repositories), validation, central errors, auth (JWT+refresh), RBAC, rate limit, logging, health checks, Swagger.
- **Data**: MongoDB Atlas (replica set, backups), indexes; **Redis** for cache/sessions/rate limits; **S3** for files; queue (BullMQ/SQS) for background jobs.
- **Infra**: Docker, CI/CD (GitHub Actions), EC2/ECS behind **ALB** + HTTPS, autoscaling, secrets in SSM/Secrets Manager, CloudWatch monitoring/alerts.
- **Quality**: tests (unit, integration with Supertest, E2E with Playwright), lint, type safety (TypeScript), code review.

::: text
### High-level architecture
**Users** → Route 53 (DNS) → **CloudFront** (CDN: React static files from S3, `/api/*` → ALB) → **ALB** (HTTPS, health checks) → **Node/Express containers** (ECS/EC2, 2+ instances across AZs, autoscaling) → **MongoDB Atlas** (replica set), **Redis** (ElastiCache), **S3** (uploads), **SQS/BullMQ workers** (emails, reports, image processing).

### Checklist by area
| Area | Decisions |
|---|---|
| **Frontend** | Code splitting (lazy routes), React Query caching, error boundaries, accessibility, env-based config, CSP |
| **API** | Versioned REST (`/api/v1`), OpenAPI docs, validation (Zod), consistent errors, pagination, idempotency for payments |
| **Auth** | Short JWT + rotating refresh (httpOnly cookie), RBAC, password hashing, rate-limited login, optional SSO |
| **Data** | Schema design by access patterns, indexes, transactions where needed, backups + point-in-time restore |
| **Performance** | Redis cache, CDN, compression, connection pooling, async jobs |
| **Security** | Helmet, CORS allowlist, secrets manager, least-privilege IAM, private subnets, WAF, dependency scanning |
| **Observability** | Structured logs (pino) with requestId, metrics, tracing, alerts (5xx rate, latency, CPU), uptime checks |
| **Reliability** | Multi-AZ, health checks, graceful shutdown, retries with backoff, circuit breakers |
| **Delivery** | Docker images, GitHub Actions CI (lint, test, build, scan) → CD to ECS/EC2, blue/green or rolling deploys, IaC (Terraform/CDK) |
| **Testing** | Unit (Jest/Vitest), integration (Supertest + mongodb-memory-server), E2E (Playwright), contract tests |
:::

::: diagram Production architecture on AWS
flowchart TB
  U(["Users"]) --> R53["Route 53"] --> CF["CloudFront CDN + WAF"]
  CF -->|"static"| S3W[("S3: React build")]
  CF -->|"/api/*"| ALB["Application Load Balancer, HTTPS"]
  subgraph VPC["VPC"]
    ALB --> A1["Node API container AZ-a"]
    ALB --> A2["Node API container AZ-b"]
    A1 --> RD[("Redis: cache, rate limit")]
    A2 --> RD
    A1 --> Q["SQS / BullMQ"]
    Q --> W["Worker: emails, images, reports"]
  end
  A1 --> MDB[("MongoDB Atlas replica set")]
  A2 --> MDB
  A1 --> S3F[("S3: uploads")]
  W --> S3F
  A1 -.-> CW["CloudWatch logs, metrics, alarms"]
:::

::: code bash Repository layout (monorepo)
.
├── apps/
│   ├── web/                 # React (Vite) — src/{api,components,features,hooks,pages,routes}
│   └── api/                 # Express — src/{config,routes,controllers,services,repositories,models,middleware,validators,jobs}
├── packages/
│   └── shared/              # Zod schemas, types, permission map shared by web & api
├── infra/                   # Terraform / CDK
├── docker-compose.yml       # local: mongo, redis, api, web
├── .github/workflows/ci.yml # lint → test → build → docker push → deploy
└── README.md
:::

::: ask
- Before designing, ask: *"Expected users / requests per second? Read vs write heavy? Real-time needs? Compliance? Team size? Budget / managed vs self-hosted?"*
- Start simple (a monolith API + managed DB), and explain **how it scales** when needed. Over-engineering is a red flag.
:::

::: links
AWS Well-Architected Framework | https://aws.amazon.com/architecture/well-architected/
The Twelve-Factor App | https://12factor.net
:::

=== Practice project: build React + Node + Express + MongoDB + S3 end-to-end
@p 3
@tags project, practice, portfolio
@quick
- Build ONE project that exercises every topic: login/register, JWT, user CRUD, pagination, search/filter/sort, Mongoose, S3 image upload, error middleware, Swagger, Docker, EC2 deploy.
- Architecture: React + React Query → Express API → MongoDB (data) + S3 (images) → deployed on EC2 with Docker + Nginx.
- Being able to explain your own project end-to-end is a stronger interview story than memorised answers.
- Tip: this app's own code (server/src) already follows the layered structure, so use it as a reference.

::: text
### Why build it?
Interviewers love *"walk me through a project you built"*. A project designed around interview questions lets you answer **every** Node/Mongo/AWS question with **your own real code**.

### Feature checklist, mapped to interview topics
| Feature | Topics you practise |
|---|---|
| Login / register | bcrypt, validation (Zod), error handling, rate limiting |
| JWT authentication | Access + refresh tokens, httpOnly cookies, auth middleware, protected routes in React |
| User CRUD | REST design, status codes, PUT vs PATCH, soft delete, RBAC |
| Pagination | skip/limit + cursor, React Query `keepPreviousData`, URL state |
| Search / filter / sort | Query builder with allowlists, indexes (ESR), regex vs text index, debounce |
| MongoDB / Mongoose | Schemas, validation, hooks, populate vs `$lookup`, lean, aggregation for a stats page |
| Image upload to S3 | Presigned URLs, S3 CORS, private bucket, metadata in Mongo |
| Error handling middleware | AppError, asyncHandler, consistent error shape, React error states |
| Swagger documentation | OpenAPI spec (swagger-jsdoc + swagger-ui-express) |
| Docker | Dockerfiles + docker-compose (Mongo, API, web), like **this app** |
| Deploy to EC2 | Nginx reverse proxy, PM2 or Docker, HTTPS (Certbot), env vars from SSM, CI/CD with GitHub Actions |

### Suggested milestones
1. **Week 1**: Express skeleton (layers), Mongo models, user CRUD + validation + error handling, Postman tests.
2. **Week 2**: Auth (register/login/JWT/refresh), React app with protected routes, React Query data layer.
3. **Week 3**: Pagination + search/filter/sort, indexes, aggregation stats dashboard, S3 uploads.
4. **Week 4**: Swagger, tests (Jest + Supertest), Docker, deploy to EC2 with Nginx + HTTPS + GitHub Actions.
:::

::: diagram Project architecture
flowchart TB
  R["React + React Query"] -->|"REST /api/v1"| E["Express API"]
  E --> M[("MongoDB: users, data")]
  E -->|"presigned URLs"| S3[("S3: images, files")]
  R -->|"direct upload"| S3
  subgraph EC2["EC2 instance"]
    N["Nginx: HTTPS, static React build"] --> E
  end
  GH["GitHub Actions"] -->|"build, test, docker, deploy"| EC2
:::

::: code bash Scaffold it in 2 minutes
mkdir fullstack-practice && cd fullstack-practice
npm create vite@latest web -- --template react
mkdir -p api/src/{config,routes,controllers,services,repositories,models,middleware,validators,utils}
cd api && npm init -y
npm i express mongoose zod jsonwebtoken bcrypt cookie-parser cors helmet morgan express-rate-limit @aws-sdk/client-s3 @aws-sdk/s3-request-presigner swagger-ui-express swagger-jsdoc
npm i -D nodemon jest supertest mongodb-memory-server
cd ../web && npm i @tanstack/react-query axios react-router-dom react-hook-form zod @hookform/resolvers
# copy docker-compose.yml from this app as a starting point (mongo + api + web)
:::

::: code javascript Swagger setup (api/src/docs/swagger.js)
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: { title: 'Practice API', version: '1.0.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'], // JSDoc comments below
});

module.exports = (app) => app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users (paginated)
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: q, schema: { type: string } }
 *     responses:
 *       200: { description: Paginated users }
 *       401: { description: Unauthenticated }
 */
:::

::: code javascript Integration test with Supertest + in-memory MongoDB
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');

let mongo;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

test('register → login → access protected route', async () => {
  await request(app).post('/api/v1/auth/register').send({ name: 'Vivek', email: 'v@x.com', password: 'Secret123' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email: 'v@x.com', password: 'Secret123' }).expect(200);
  const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
  expect(me.body.email).toBe('v@x.com');
});

test('validation error returns 400 with details', async () => {
  const res = await request(app).post('/api/v1/auth/register').send({ email: 'bad' }).expect(400);
  expect(res.body.details.length).toBeGreaterThan(0);
});
:::

::: ask
- In the interview, prepare a **2-minute walkthrough**: problem → architecture diagram → one interesting challenge (e.g. pagination performance, S3 security) → what you'd improve next.
- Be ready for deep dives: *"Why cursor pagination here? How do you secure uploads? How is it deployed?"*
:::

::: links
swagger-jsdoc | https://github.com/Surnet/swagger-jsdoc
Supertest | https://github.com/ladjs/supertest
mongodb-memory-server | https://github.com/typegoose/mongodb-memory-server
:::
