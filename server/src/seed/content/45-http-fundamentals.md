@section HTTP Fundamentals
@icon 🌐
@color #0ea5e9
@desc Before building APIs, understand HTTP deeply: requests and responses, headers, cookies and sessions, CORS and preflights, caching with Cache-Control and ETag, keep-alive, HTTP/2/3 and TLS. Measured in Chrome and Node 22.

=== What is inside an HTTP request and response? (methods, headers, body, query vs path params)
@p 3
@tags http, request, response, headers, rest
@quick
- A **request** = request line (`METHOD /path?query HTTP/1.1`) + **headers** + optional **body**. A **response** = status line (`HTTP/1.1 201 Created`) + headers + body.
- **Path params** identify a resource (`/users/42`); **query params** filter, sort or paginate (`?status=active&page=2`); the **body** carries data to create or change.
- `Content-Type` says what the body *is*; `Accept` says what the client *wants back* (content negotiation).
- Status classes: **2xx** success, **3xx** redirect/cache, **4xx** client mistake, **5xx** server failure.
- HTTP is **stateless**: each request must carry everything needed (token, cookie), which is what makes horizontal scaling easy.

::: text 🧒 In simple words
An HTTP request is a **letter**: the envelope has the address (`/api/orders`), the kind of letter (`POST`) and stickers with extra info (headers like "I speak JSON", "here's my ID card"). Inside is the content (the body). The reply is another letter starting with a short verdict: "201 Created" or "404 Not Found".
:::

::: text 📖 Detailed answer
### The parts
| Part | Example | Purpose |
|---|---|---|
| Method | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | what to do |
| Path | `/api/users/42` | which resource (path param `42`) |
| Query | `?role=admin&sort=-createdAt` | filter, sort, paginate, search |
| Headers | `Content-Type`, `Authorization`, `Cookie` | metadata |
| Body | `{"name":"Asha"}` | data for POST/PUT/PATCH |
| Status | `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `500` | outcome |

### Headers you must know
| Header | Direction | Meaning |
|---|---|---|
| `Content-Type: application/json` | both | format of the body |
| `Accept: application/json` | request | formats the client accepts |
| `Authorization: Bearer …` | request | credentials |
| `Cookie` / `Set-Cookie` | request / response | session state |
| `Cache-Control`, `ETag`, `If-None-Match` | both | caching |
| `Content-Encoding: br` / `Accept-Encoding` | both | compression |
| `Location` | response | URL of the created resource (201) or redirect |
| `Origin`, `Access-Control-*` | both | CORS |
| `X-Request-Id` | both | tracing a request through logs |

### Path vs query vs body
- Identity → path (`/orders/981`).
- Optional modifiers of a read → query (`/orders?status=paid`).
- Data to write → body. Never put secrets in the URL: URLs end up in logs, history and Referer headers.
:::

::: diagram One request, one response
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: "POST /api/orders?notify=true with headers and a JSON body"
  S->>S: "parse, authenticate, validate, create"
  S-->>C: "201 Created, Location /api/orders/981, JSON body"
:::

::: image Anatomy of an HTTP request and response
/images/http/anatomy.svg
:::

::: text 🪜 Step by step
What happens when the React app calls `fetch('/api/orders', { method: 'POST', … })`:
1. The browser resolves the host, opens (or reuses) a TCP + TLS connection.
2. It sends the request line, headers (including cookies for that site) and the JSON body.
3. The server parses headers first, then streams the body, validates it and runs the logic.
4. It replies with a status, headers (`Content-Type`, `Location`) and a body.
5. `fetch` resolves as soon as headers arrive; `await res.json()` reads the body. Note: `fetch` only rejects on network errors, so check `res.ok` for 4xx/5xx.
:::

::: code bash Seeing raw HTTP with curl
# -v prints the request (>) and response (<) headers
curl -v -X POST "http://localhost:5050/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"email":"asha@example.com","password":"Secret123"}'

# > POST /api/auth/login HTTP/1.1
# > Host: localhost:5050
# > Content-Type: application/json
# > Content-Length: 52
# < HTTP/1.1 200 OK
# < Content-Type: application/json; charset=utf-8
# < Set-Cookie: refresh=…; Path=/api/auth; HttpOnly; SameSite=Strict
:::

::: code javascript Parsing a raw request (runnable)
// What a server does first: split the request line, headers and body; then read path and query params.
const raw = 'POST /api/orders/981/items?notify=true&qty=2 HTTP/1.1\r\nHost: shop.example\r\nContent-Type: application/json\r\nAuthorization: Bearer abc\r\n\r\n{"productId":42}';
const [head, body] = raw.split('\r\n\r\n');
const [requestLine, ...headerLines] = head.split('\r\n');
const [method, target, version] = requestLine.split(' ');
const headers = Object.fromEntries(headerLines.map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).toLowerCase(), l.slice(i + 1).trim()]; }));
const url = new URL(target, `http://${headers.host}`);
const match = url.pathname.match(/^\/api\/orders\/(\d+)\/items$/);
console.log({ method, version, path: url.pathname, orderId: match?.[1], notify: url.searchParams.get('notify'), contentType: headers['content-type'] });
console.log('method + path param', method === 'POST' && match?.[1] === '981' ? '✅' : '❌ FAIL');
console.log('query params are strings', url.searchParams.get('qty') === '2' ? '✅' : '❌ FAIL');
console.log('header names are case-insensitive (lower-cased)', headers.authorization === 'Bearer abc' ? '✅' : '❌ FAIL');
console.log('body parsed by Content-Type', JSON.parse(body).productId === 42 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Tokens or passwords in query strings (they get logged).
- `GET` requests that change data (crawlers and prefetchers will trigger them).
- Returning `200` with `{ "error": … }` instead of a proper 4xx/5xx status.
- Forgetting `res.ok` checks: `fetch` resolves for 404 and 500.
- Treating header names as case-sensitive.
:::

::: understand
- Method + path say *what*, headers say *how*, body says *with what*, status says *how it went*.
:::

::: ask
- *"Is this identifying a resource (path) or filtering a list (query)?"*
:::

::: important ⭐ Say this in the interview
"An HTTP request has a request line with the method, path, query and version, then headers, then an optional body; the response has a status line, headers and a body. Path parameters identify a resource, query parameters filter, sort and paginate, and the body carries data to create or change. Content-Type describes the body and Accept what the client wants back. Status codes tell the outcome: 2xx success, 3xx redirects or cache revalidation, 4xx client errors and 5xx server errors. HTTP is stateless, so every request carries its own credentials, which is what lets any server instance handle it."
:::

::: links
MDN: An overview of HTTP | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview
MDN: HTTP headers | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers
:::

=== Cookies and sessions: how does a server remember a user?
@p 3
@tags http, cookies, sessions, security
@quick
- A cookie is set by the server with `Set-Cookie` and sent back **automatically** by the browser in `Cookie` on matching requests.
- Security attributes: **HttpOnly** (no JS access → XSS can't read it), **Secure** (HTTPS only), **SameSite** (`Lax` default, `Strict`, `None` + Secure for cross-site).
- **Session**: the cookie holds a random id; the data (`userId`, roles) lives on the server (Redis/DB) → easy logout and revocation.
- Measured in Chrome: a cross-site POST carried **only SameSite=None** cookies; a top-level link click carried Lax + None.
- Sessions need a shared store when you run several instances; JWTs avoid the lookup but are hard to revoke.

::: text 🧒 In simple words
A session cookie is a **cloakroom ticket**. The server keeps your coat (your data) and gives you a numbered ticket. Every time you come back you show the ticket. If you lose it or the server tears up its copy (logout), the ticket is worthless, and nobody can learn anything from the number alone.
:::

::: text 📖 Detailed answer
### Cookie attributes
| Attribute | Effect |
|---|---|
| `HttpOnly` | invisible to `document.cookie` |
| `Secure` | only over HTTPS |
| `SameSite=Lax` | not sent on cross-site subrequests (fetch, POST forms, images); sent on top-level navigation |
| `SameSite=Strict` | never sent cross-site, even on link clicks |
| `SameSite=None; Secure` | always sent (third-party/embedded use) |
| `Domain`, `Path` | which hosts/paths receive it |
| `Max-Age` / `Expires` | persistent; otherwise it's a session cookie |
| `__Host-` prefix | must be Secure, Path=/, no Domain: locked to one host |

### Server-side sessions vs JWT
| | Session id cookie | JWT access token |
|---|---|---|
| Where is the state? | server store (Redis) | inside the token (signed) |
| Revoke / logout | delete the session | hard; wait for expiry or keep a deny-list |
| Lookup per request | yes (fast in Redis) | no |
| Size | ~32 bytes | hundreds of bytes |
| Best for | classic web apps, same site | APIs, mobile, many services (short-lived + refresh) |

### Session security checklist
Regenerate the session id at login (prevents session fixation), expire idle sessions, store them in Redis with a TTL, and use `HttpOnly; Secure; SameSite=Lax` (or Strict).
:::

::: diagram Session login and later requests
sequenceDiagram
  participant B as Browser
  participant A as API
  participant R as Redis session store
  B->>A: "POST /login with email and password"
  A->>R: "SET sess:9f2c userId 42, TTL 1 day"
  A-->>B: "Set-Cookie sid=9f2c HttpOnly Secure SameSite=Lax"
  B->>A: "GET /me with Cookie sid=9f2c"
  A->>R: "GET sess:9f2c"
  A-->>B: "200 user 42"
:::

::: image Cookies and sessions
/images/http/cookies.svg
:::

::: text 🪜 Step by step
Logout with sessions:
1. Browser sends `POST /logout` with the session cookie.
2. Server deletes `sess:9f2c` from Redis.
3. Server responds with `Set-Cookie: sid=; Max-Age=0` to clear the cookie.
4. Any copy of the old cookie (stolen or not) now maps to nothing → 401.
5. With JWT-only auth, step 4 isn't possible until the token expires, which is why access tokens are short-lived.
:::

::: code javascript Express sessions stored in Redis (express-session + connect-redis)
const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

const app = express();
app.set('trust proxy', 1);                       // behind Nginx/ALB, so "secure" works
app.use(express.json());
app.use(session({
  store: new RedisStore({ client: redis, prefix: 'sess:' }),
  name: '__Host-sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
}));

app.post('/login', async (req, res, next) => {
  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  req.session.regenerate((err) => {                // new id at login: prevents session fixation
    if (err) return next(err);
    req.session.userId = user.id;
    res.json({ id: user.id, name: user.name });
  });
});

app.post('/logout', (req, res) => req.session.destroy(() => res.clearCookie('__Host-sid').sendStatus(204)));

async function verifyCredentials(email, password) { return email && password ? { id: 42, name: 'Asha' } : null; }
module.exports = app;
:::

::: code javascript Which cookies does the browser send? (runnable model of SameSite)
// Model of the rules Chrome applied in our measurement.
function sentCookies(cookies, { crossSite, topLevelNavigation, method }) {
  return cookies.filter((c) => {
    if (!crossSite) return true;
    if (c.sameSite === 'None') return c.secure;
    if (c.sameSite === 'Lax') return topLevelNavigation && method === 'GET';
    return false;                                   // Strict
  }).map((c) => c.name);
}
const jar = [{ name: 'strict', sameSite: 'Strict', secure: true }, { name: 'lax', sameSite: 'Lax', secure: true }, { name: 'none', sameSite: 'None', secure: true }];
const post = sentCookies(jar, { crossSite: true, topLevelNavigation: false, method: 'POST' });
const link = sentCookies(jar, { crossSite: true, topLevelNavigation: true, method: 'GET' });
const same = sentCookies(jar, { crossSite: false });
console.log({ crossSitePost: post, linkClick: link, sameSite: same });
console.log('cross-site POST sends only None (measured)', post.join() === 'none' ? '✅' : '❌ FAIL');
console.log('link click sends Lax + None (measured)', link.join() === 'lax,none' ? '✅' : '❌ FAIL');
console.log('same-site sends all', same.length === 3 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Session cookies without `HttpOnly`/`Secure`.
- In-memory session store in production (lost on restart, not shared across instances).
- Not regenerating the session id at login (session fixation).
- `SameSite=None` without `Secure` (rejected by browsers).
- Believing SameSite alone replaces CSRF protection for every case (subdomains are same-site).
:::

::: understand
- The cookie is only a pointer; the session lives on the server, so the server stays in control.
:::

::: ask
- *"Do we need instant revocation?"* Yes → server sessions (or short JWT + refresh with revocation).
:::

::: important ⭐ Say this in the interview
"The server sets a cookie with Set-Cookie and the browser sends it back automatically on matching requests. For a session, the cookie holds only a random id and the data lives in a store like Redis, so logout and revocation are just deleting the record. I mark it HttpOnly so XSS can't read it, Secure for HTTPS only, and SameSite Lax or Strict; I measured in Chrome that a cross-site POST only carried SameSite None cookies. I regenerate the id at login and use a shared store so any instance can serve the user."
:::

::: links
MDN: Using HTTP cookies | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies
OWASP: Session Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
:::

=== What is CORS, and how do preflight requests work?
@p 3
@tags http, cors, preflight, security
@quick
- The **same-origin policy** stops JavaScript on `app.example` from **reading** responses from another origin (scheme + host + port). **CORS** headers let the server relax that.
- **Simple requests** (GET/HEAD/POST with form-like content types, no custom headers) go straight out; others trigger an **OPTIONS preflight** first.
- Measured in Chrome: JSON `POST`, `Authorization` header, `PUT` and `DELETE` all sent `OPTIONS` first; simple GET and form POST did not.
- CORS is **not** server protection: measured, a request whose response lacked CORS headers **still ran on the server**; the browser only hid the result.
- `Access-Control-Max-Age` caches preflights (measured: second PUT had no OPTIONS); with credentials you can't use `*`.

::: text 🧒 In simple words
CORS is a **bouncer working for the browser, not for your server**. Your page asks the browser to fetch from another site; the browser first (sometimes) asks that site "is this page allowed?". If the answer isn't yes, the browser refuses to hand the reply to the page. But the other site already got the request, so the bouncer protects the user's data from the page, not the server from requests.
:::

::: text 📖 Detailed answer
### Origins
`https://app.example:443` ≠ `https://api.example` ≠ `http://app.example` ≠ `https://app.example:8443`. Different origin = CORS rules apply.

### Simple vs preflighted (measured in Chrome)
| Request from `localhost:5610` to `localhost:5611` | Server saw |
|---|---|
| `GET /a` | `GET` only |
| `POST` form-urlencoded | `POST` only |
| `POST` `application/json` | **`OPTIONS`**, then `POST` |
| `GET` with `Authorization` | **`OPTIONS`**, then `GET` |
| `DELETE` | **`OPTIONS`**, then `DELETE` |
| `PUT` json, `Max-Age: 600`, second call | `PUT` only (preflight cached) |
| Response without CORS headers | `GET` ran on the server; `fetch` failed in the page |

### Response headers
| Header | Meaning |
|---|---|
| `Access-Control-Allow-Origin: https://app.example` | this origin may read (add `Vary: Origin`) |
| `Access-Control-Allow-Methods` | methods allowed after a preflight |
| `Access-Control-Allow-Headers` | request headers allowed |
| `Access-Control-Allow-Credentials: true` | cookies allowed (origin must be explicit, not `*`) |
| `Access-Control-Max-Age` | how long to cache the preflight |
| `Access-Control-Expose-Headers` | response headers JS may read |

### Ways to avoid CORS entirely
Serve the SPA and API from the same origin (Nginx proxies `/api` to Node, like this app does). Then no preflights, cookies just work.
:::

::: diagram Is a preflight needed?
flowchart TD
  R["cross-origin fetch"] --> M{"method GET, HEAD or POST?"}
  M -->|"no"| P["preflight OPTIONS"]
  M -->|"yes"| H{"only simple headers and form or text content type?"}
  H -->|"no"| P
  H -->|"yes"| S["sent directly"]
  P --> OK{"server allows it?"}
  OK -->|"yes"| S
  OK -->|"no"| X["blocked, real request never sent"]
:::

::: image CORS and the preflight request (measured in Chrome)
/images/http/cors.svg
:::

::: text 🪜 Step by step
A React app on `app.example` sends `PATCH /api/users/42` with JSON and a bearer token:
1. Not simple (PATCH, JSON, Authorization) → the browser sends `OPTIONS /api/users/42` with `Origin`, `Access-Control-Request-Method: PATCH`, `Access-Control-Request-Headers: authorization, content-type`.
2. The API answers `204` with the allowed origin, methods and headers, plus `Max-Age`.
3. The browser sends the real `PATCH`.
4. The response includes `Access-Control-Allow-Origin: https://app.example` → `fetch` resolves.
5. Within `Max-Age`, further PATCHes skip step 1.
:::

::: code javascript CORS in Express with an allow-list (cors package)
const express = require('express');
const cors = require('cors');

const allowed = new Set((process.env.CORS_ORIGINS ?? 'https://app.example').split(','));
const app = express();

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowed.has(origin)) return cb(null, true);   // no Origin = curl/server-to-server
    cb(null, false);                                               // no CORS headers → browser blocks reading
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,                                               // cookies → origin must be explicit, not *
  maxAge: 600,                                                     // cache preflights for 10 minutes
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));
module.exports = app;
:::

::: code javascript Preflight decision (runnable)
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);
const SIMPLE_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']);
const SAFE_HEADERS = new Set(['accept', 'accept-language', 'content-language', 'content-type']);
function needsPreflight({ method = 'GET', headers = {} }) {
  if (!SIMPLE_METHODS.has(method)) return true;
  for (const [name, value] of Object.entries(headers)) {
    const n = name.toLowerCase();
    if (!SAFE_HEADERS.has(n)) return true;
    if (n === 'content-type' && !SIMPLE_TYPES.has(value.split(';')[0].trim())) return true;
  }
  return false;
}
const cases = [
  ['simple GET', { method: 'GET' }, false],
  ['form POST', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, false],
  ['JSON POST', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, true],
  ['GET + Authorization', { method: 'GET', headers: { Authorization: 'Bearer x' } }, true],
  ['DELETE', { method: 'DELETE' }, true],
];
for (const [label, req, expected] of cases) console.log(label.padEnd(20), needsPreflight(req) ? 'preflight' : 'direct   ', needsPreflight(req) === expected ? '✅ matches Chrome' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking CORS protects the API (use auth, CSRF protection and rate limits for that).
- `Access-Control-Allow-Origin: *` together with credentials (browsers reject it).
- Reflecting any `Origin` back without an allow-list (equivalent to `*` with cookies).
- Forgetting `Vary: Origin` when the header changes per origin (CDN caches the wrong one).
- Error responses (401/500) without CORS headers, so the frontend sees "CORS error" instead of the real status.
:::

::: understand
- Same-origin policy restricts reading; CORS headers are the server's permission slip; preflights ask before risky requests.
:::

::: ask
- *"Can we serve frontend and API from the same origin through a proxy?"* Then CORS disappears.
:::

::: important ⭐ Say this in the interview
"The same-origin policy stops a page from reading responses from another origin, and CORS headers are how a server allows specific origins. Simple requests go directly; anything with JSON, an Authorization header or methods like PUT and DELETE triggers an OPTIONS preflight, which I confirmed in Chrome. CORS isn't server-side protection: a request whose response lacked CORS headers still ran on my test server, the browser only hid the response. I use an explicit allow-list, credentials only with explicit origins, Vary: Origin and Max-Age to cache preflights, or avoid CORS by proxying the API under the same origin."
:::

::: links
MDN: Cross-Origin Resource Sharing (CORS) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
Fetch standard: CORS protocol | https://fetch.spec.whatwg.org/#http-cors-protocol
:::

=== How does HTTP caching work? (Cache-Control, ETag, 304)
@p 3
@tags http, caching, etag, cache-control, performance
@quick
- `Cache-Control: max-age=60` → the response is **fresh** for 60 s; reuses don't hit the server (measured: second fetch never reached it).
- `no-cache` ≠ "don't cache": it means **revalidate every time**; with an `ETag` the server answers **304 Not Modified** without a body (measured: 15,791 bytes → 0 bytes).
- `no-store` = never store (private data); `private` = browser only; `public`/`s-maxage` = CDNs may cache.
- Static assets with hashed names (`app.3f9a1c.js`): `max-age=31536000, immutable`; `index.html`: `no-cache`.
- `Vary` lists request headers that change the response (`Accept-Encoding`, `Origin`), so caches keep separate copies.

::: text 🧒 In simple words
`max-age` is a **"best before" date**: until then you just use what's in your fridge. An `ETag` is a **version sticker**: after the date you phone the shop and say "I have version v1", and if nothing changed the shop says "keep it" (304) instead of sending a new delivery.
:::

::: text 📖 Detailed answer
### Freshness vs validation
| Mechanism | Headers | Network cost |
|---|---|---|
| Fresh (`max-age`) | `Cache-Control: max-age=N` | **none** until it expires |
| Revalidate (ETag) | response `ETag: "v1"` → request `If-None-Match: "v1"` → `304` | one round trip, no body |
| Revalidate (date) | `Last-Modified` → `If-Modified-Since` | same, coarser (1 s) |

### Measured in Chrome (cross-origin API, fetched twice)
| Response headers | 1st request | 2nd request |
|---|---|---|
| `max-age=60` | `GET → 200` | **nothing reached the server** |
| `ETag` + `no-cache` | `GET → 200`, 15,791 B | `GET → 304`, 0 B (browser shows 200 from cache) |

### Directives cheat sheet
| Directive | Use for |
|---|---|
| `public, max-age=31536000, immutable` | hashed JS/CSS/images |
| `no-cache` (+ ETag) | HTML, API data that must be current |
| `private, max-age=60` | per-user API responses (not CDNs) |
| `no-store` | banking data, tokens, PII |
| `s-maxage=300, stale-while-revalidate=60` | CDN caching of public API responses |

### Where it's applied
Browser cache → CDN/proxy cache → (your app cache, Redis) → database. HTTP caching is the cheapest layer: a cached response costs your server nothing.
:::

::: diagram Revalidation with an ETag
sequenceDiagram
  participant B as Browser cache
  participant S as API
  B->>S: "GET /products"
  S-->>B: "200, ETag v1, Cache-Control no-cache, 15791 bytes"
  B->>S: "GET /products, If-None-Match v1"
  S-->>B: "304 Not Modified, 0 bytes"
  Note over B: "reuses the cached body"
:::

::: image HTTP caching: Cache-Control and ETag (measured)
/images/http/caching.svg
:::

::: text 🪜 Step by step
Deploying a new frontend version without stale code:
1. Build outputs `index.html` and hashed files like `app.3f9a1c.js`.
2. Serve hashed files with `max-age=31536000, immutable`: browsers never ask again.
3. Serve `index.html` with `no-cache` (and an ETag): every visit revalidates it, usually a cheap 304.
4. The new build produces `app.8b21d0.js` and a new `index.html` that references it.
5. Users get the new HTML on their next visit, which pulls the new file name; old files can stay on the CDN for users mid-session.
:::

::: code javascript ETag and Cache-Control in Express
const express = require('express');
const crypto = require('node:crypto');
const app = express();

// Express already adds weak ETags to res.send/res.json and answers 304 when If-None-Match matches.
app.set('etag', 'strong');

app.get('/api/products', async (req, res) => {
  const products = await listProducts();
  res.set('Cache-Control', 'no-cache');                      // revalidate every time
  res.json(products);                                         // → ETag; repeat calls → 304 with no body
});

// Manual version for data with a cheap "version" (avoids building the body at all)
app.get('/api/catalog', async (req, res) => {
  const version = await getCatalogVersion();                  // e.g. max(updatedAt)
  const etag = `"${crypto.createHash('sha1').update(String(version)).digest('hex')}"`;
  res.set({ ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' });
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.json(await buildCatalog());
});

app.use('/assets', express.static('dist/assets', { immutable: true, maxAge: '1y' }));

async function listProducts() { return [{ id: 1, name: 'Desk' }]; }
async function getCatalogVersion() { return 17; }
async function buildCatalog() { return { version: 17, items: [] }; }
module.exports = app;
:::

::: code javascript A tiny HTTP cache (runnable)
// Freshness first, then revalidation with ETag: what browsers and CDNs do.
function createCache(origin) {
  const store = new Map(); let now = 0; const stats = { network: 0, bytes: 0 };
  async function get(url) {
    const hit = store.get(url);
    if (hit && now < hit.expires) return { from: 'cache (fresh)', body: hit.body };
    const res = origin(url, hit?.etag); stats.network++; stats.bytes += res.body?.length ?? 0;
    if (res.status === 304) { hit.expires = now + res.maxAge; return { from: 'cache (304)', body: hit.body }; }
    store.set(url, { body: res.body, etag: res.etag, expires: now + res.maxAge });
    return { from: 'network (200)', body: res.body };
  }
  return { get, tick: (s) => (now += s), stats };
}
const body = JSON.stringify({ items: Array.from({ length: 500 }, (_, i) => ({ id: i })) });
const origin = (url, inm) => (inm === '"v1"' ? { status: 304, maxAge: 60 } : { status: 200, body, etag: '"v1"', maxAge: 60 });
const c = createCache(origin);
(async () => {
  const a = await c.get('/products'); c.tick(30); const b = await c.get('/products'); c.tick(40); const d = await c.get('/products');
  console.log(a.from, '|', b.from, '|', d.from, '|', c.stats);
  console.log('within max-age no request', b.from === 'cache (fresh)' ? '✅' : '❌ FAIL');
  console.log('after expiry, 304 costs no body bytes', d.from === 'cache (304)' && c.stats.bytes === body.length ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Reading `no-cache` as "do not cache" (use `no-store` for that).
- Long `max-age` on un-hashed files like `index.html` (users stuck on old versions).
- Caching per-user responses on a CDN (`public` instead of `private`).
- Changing responses by header (`Accept-Encoding`, `Origin`) without `Vary`.
- Computing an expensive body just to hash it for the ETag on every request.
:::

::: understand
- Freshness avoids the request; validation avoids the body.
:::

::: ask
- *"How stale can this data be?"* That number is your `max-age`.
:::

::: important ⭐ Say this in the interview
"HTTP caching has two mechanisms. Freshness: Cache-Control max-age lets the browser or CDN reuse a response without contacting the server at all; in Chrome the second fetch within max-age never reached my server. Validation: with an ETag and no-cache the client sends If-None-Match and the server answers 304 without a body; I measured a 15.8 kilobyte response turning into an empty 304. I use immutable year-long caching for hashed assets, no-cache for HTML and current API data, private for per-user data, no-store for sensitive data, and Vary when responses differ by header."
:::

::: links
MDN: HTTP caching | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
web.dev: Prevent unnecessary network requests with the HTTP Cache | https://web.dev/articles/http-cache
:::

=== Keep-alive, HTTP/1.1 vs HTTP/2 vs HTTP/3, HTTPS and TLS: what does a connection cost?
@p 2
@tags http, tls, https, keep-alive, http2, http3
@quick
- A new HTTPS connection needs **TCP (1 RTT) + TLS 1.3 (1 RTT)** before the request; **keep-alive** reuses the connection and skips both.
- Measured (Node 22, localhost, 200 requests): HTTPS new connection each time **0.999 ms**/request vs keep-alive **0.134 ms**; on a 50 ms network the gap is ~100 ms per request.
- **HTTP/1.1**: one request at a time per connection (browsers open ~6). **HTTP/2**: many streams multiplexed on one connection (measured earlier: 60 images 430 ms → 58 ms). **HTTP/3**: QUIC over UDP, no TCP head-of-line blocking, faster handshake.
- **TLS** gives encryption, integrity and server authentication (certificate chain → trusted CA). **HSTS** forces HTTPS.
- In Node: Node 20+ `http.globalAgent` keeps connections alive; `fetch` (undici) pools connections; reuse clients for DB/HTTP calls.

::: text 🧒 In simple words
Opening a connection is like **dialling a phone call and doing a security check** ("who are you?", "here's my ID"). Keep-alive is **staying on the line** for the next question instead of hanging up and redialling. HTTP/2 lets you ask **many questions at once** on that one call.
:::

::: text 📖 Detailed answer
### Connection costs
| Step | Round trips |
|---|---|
| DNS lookup (if not cached) | 1 |
| TCP handshake | 1 |
| TLS 1.3 handshake (1.2: 2) | 1 |
| HTTP request/response | 1 |
| Keep-alive reuse | **only the last one** |

### Measured (Node 22, localhost, 200 sequential requests)
| Mode | ms per request | connections |
|---|---|---|
| HTTP, new connection | 0.301 | 200 |
| HTTP, keep-alive | 0.056 | 1 |
| HTTPS, new connection | 0.999 | 200 |
| HTTPS, keep-alive | 0.134 | 1 |
On localhost the round trip is ~0, so this is pure CPU (handshake crypto). Over a real 50 ms network each new HTTPS connection adds ~100 ms.

### Protocol versions
| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport | TCP | TCP | QUIC (UDP) |
| Parallel requests | 1 per connection | many streams, 1 connection | many streams |
| Headers | text | HPACK compressed | QPACK compressed |
| Head-of-line blocking | per connection | at TCP level | none between streams |
| Handshake | TCP + TLS | TCP + TLS | combined (1 RTT, 0-RTT resume) |

### TLS in one paragraph
The server presents a certificate for its domain signed by a CA the client trusts; client and server agree on keys (ECDHE) so traffic is encrypted and tamper-proof. Terminate TLS at Nginx/ALB/CDN, keep certificates auto-renewed (Let's Encrypt), enable HSTS, and redirect HTTP → HTTPS.
:::

::: diagram New connection vs keep-alive
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: "TCP SYN"
  S-->>C: "SYN-ACK"
  C->>S: "TLS ClientHello"
  S-->>C: "ServerHello, certificate, finished"
  C->>S: "GET /a"
  S-->>C: "200"
  C->>S: "GET /b on the same connection, no handshakes"
  S-->>C: "200"
:::

::: image Connections: keep-alive, TLS and HTTP/3
/images/http/keepalive-tls.svg
:::

::: chart bar Measured: ms per request, 200 sequential requests on localhost (Node 22)
Mode,ms per request
HTTP new connection,0.301
HTTP keep-alive,0.056
HTTPS new connection,0.999
HTTPS keep-alive,0.134
:::

::: text 🪜 Step by step
Why a Node service calling another service got slow:
1. Each call created a new `https.Agent` → new TCP + TLS every time.
2. With 40 ms between data centres that's ~80 ms extra per call, plus CPU for handshakes.
3. Fix: one shared agent/client with `keepAlive: true` (or `fetch`/undici, which pools by default).
4. Set `maxSockets` and timeouts so a slow upstream can't exhaust connections.
5. Result: handshakes only at startup and after idle timeouts.
:::

::: code javascript Reusing connections for outgoing calls (keep-alive agent and undici)
const https = require('node:https');
const { Agent, setGlobalDispatcher } = require('undici');

// node:https: one shared agent for the whole process
const agent = new https.Agent({ keepAlive: true, maxSockets: 50, timeout: 10_000 });
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

// fetch (undici) pools connections per origin by default; tune it once
setGlobalDispatcher(new Agent({ connections: 50, keepAliveTimeout: 10_000, connectTimeout: 5_000 }));
async function getUser(id) {
  const res = await fetch(`https://users.internal/api/users/${id}`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`users service ${res.status}`);
  return res.json();
}

module.exports = { getJson, getUser };
:::

::: code javascript Round-trip math (runnable)
// Time to first response byte = round trips × RTT (ignoring server time)
const handshakes = { 'HTTP/1.1 + TLS 1.2 (new)': 1 + 2, 'HTTP/2 + TLS 1.3 (new)': 1 + 1, 'HTTP/3 QUIC (new)': 1, 'keep-alive (reused)': 0 };
const rtt = 50;
const result = Object.fromEntries(Object.entries(handshakes).map(([k, rts]) => [k, `${(rts + 1) * rtt} ms`]));
console.log(result);
console.log('reuse saves 2 RTTs vs new TLS 1.3 connection', (2 + 1) * rtt - (0 + 1) * rtt === 100 ? '✅ 100 ms at 50 ms RTT' : '❌ FAIL');
// 60 small images: HTTP/1.1 with 6 connections needs 10 rounds; HTTP/2 multiplexes them on 1 connection
const rounds11 = Math.ceil(60 / 6), rounds2 = 1;
console.log(`HTTP/1.1 rounds: ${rounds11}, HTTP/2 rounds: ${rounds2}`, rounds11 / rounds2 === 10 ? '✅ (measured 430 ms vs 58 ms in Chrome)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Creating a new HTTP client/agent per request in Node.
- No timeouts on outgoing calls (hung sockets pile up).
- Domain sharding and sprite tricks from the HTTP/1.1 era on HTTP/2.
- Terminating TLS in every Node process instead of at the proxy/load balancer.
- Missing HSTS, mixed content, or expired certificates (automate renewal).
:::

::: understand
- Handshakes are the expensive part; reuse connections and let HTTP/2/3 multiplex.
:::

::: ask
- *"What's the RTT between these two services?"* It multiplies every new connection.
:::

::: important ⭐ Say this in the interview
"A new HTTPS connection costs a TCP round trip and a TLS 1.3 round trip before the request, so keep-alive matters a lot: on localhost I measured about one millisecond per request with a new TLS connection each time versus 0.13 with a reused connection, and on a 50 millisecond network the difference is about 100 milliseconds per call. HTTP/2 multiplexes many requests on one connection, HTTP/3 runs over QUIC to avoid TCP head-of-line blocking and combine handshakes. TLS gives encryption, integrity and authentication via certificates; I terminate it at the proxy, enable HSTS and reuse pooled clients in Node."
:::

::: links
MDN: Evolution of HTTP | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
Cloudflare: What happens in a TLS handshake? | https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/
:::
