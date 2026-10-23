@section Nginx & Deploying Frontend + Backend
@icon 🚦
@color #16a34a
@desc Nginx and deployment from an interview angle: what Nginx is and why it sits in front of Node.js (measured static serving and compression), configuring it as a reverse proxy (measured upstream keep-alive, body-size limits, headers, WebSockets and streaming), serving a React SPA (measured deep-link fallback, cache headers and gzip/brotli on this app's own bundle), load balancing and zero-downtime deploys (measured reloads, restarts and instance failures under load), and the main ways to deploy a React frontend and Node backend.

=== What is Nginx, and why do we put it in front of a Node.js app?
@p 3
@tags nginx, reverse-proxy, deployment, nodejs, web-server
@quick
- **Nginx** is an event-driven **web server and reverse proxy**: a few worker processes handle many thousands of connections. It serves files, terminates TLS, and forwards (proxies) requests to apps like Node.
- In front of Node it gives: **one public entry on 80/443 with HTTPS**, **static files and compression** (the React build), **routing** of paths/domains to different apps, **load balancing** with retries, **limits** (body size, timeouts, rate limits), **caching**, buffering and **access logs**.
- Raw speed isn't the main reason. Measured: index.html at **12,501 req/s** from Node reading from disk vs **11,276 req/s** from Nginx; a 690 KB bundle was bandwidth-bound (~300 req/s each) until **pre-compressed gzip** doubled it to **634 req/s**.
- Node stays focused on application logic; Nginx handles the generic HTTP edge work and stays up while you restart or redeploy Node.
- Alternatives that play the same role: Caddy (automatic HTTPS), HAProxy, Traefik, Envoy, or a cloud load balancer + CDN.

::: text 🧒 In simple words
Nginx is the **reception desk of an office building**. Visitors (browsers) only ever talk to reception: it checks the door is secure (HTTPS), hands out leaflets itself (static files), and sends each visitor to the right office (Node API, admin app). The offices can be renovated (redeployed) while reception keeps the queue calm.
:::

::: text 📖 Detailed answer
### What Nginx does
| Job | Example directive | Why not in Node |
|---|---|---|
| HTTPS / TLS termination, HTTP/2 | `listen 443 ssl; http2 on;` | certificates and TLS tuning in one place for every app |
| static files | `root /var/www/app; try_files …` | no Node process involved for JS/CSS/images |
| compression | `gzip on; gzip_static on;` | done once, not per request in app code |
| reverse proxy | `proxy_pass http://api;` | one public port, many internal apps |
| load balancing | `upstream api { server …; server …; }` | spreads load, retries a failed instance |
| limits | `client_max_body_size`, `limit_req`, timeouts | rejects bad requests before they reach Node |
| caching | `proxy_cache` | cache API responses at the edge |
| logs | `access_log` | one log of every request with status and timing |

### Measured (Docker, Node 22, Nginx 1.27, 20 connections)
| What | Requests/s | Note |
|---|---|---|
| Node, index.html from pre-loaded memory | 21,400 | not realistic for real static serving |
| Node, index.html from disk per request (like `express.static`) | 12,501 | |
| Nginx, index.html | 11,276 | |
| Node, 690 KB JS from disk | 301 | limited by bandwidth through Docker Desktop |
| Nginx, 690 KB JS | 319 | same |
| Nginx, gzip on the fly | 543 | 184 KB on the wire |
| Nginx, `gzip_static` (pre-compressed) | **634** | 154 KB on the wire, no CPU per request |

So the honest answer is **responsibility and operations, not raw speed**. Classic Nginx benefit "buffering slow clients" matters most for thread-per-request servers; Node is non-blocking and the kernel's socket buffers absorbed slow downloads in my test either way.

### How Nginx works
A master process reads the config and manages **worker processes** (usually one per CPU core). Each worker runs an event loop with epoll/kqueue, much like Node, so it handles many connections without a thread per connection.
:::

::: diagram Request path with Nginx in front
flowchart LR
  B["browser"] -->|"HTTPS :443"| NX["Nginx: TLS, gzip, static, routing, limits"]
  NX -->|"/ and /assets → files on disk"| FS["React build (dist/)"]
  NX -->|"/api/* proxy, keep-alive"| N1["Node API instance 1"]
  NX -->|"/api/* proxy, keep-alive"| N2["Node API instance 2"]
  N1 --> DB[("database")]
  N2 --> DB
:::

::: image What Nginx does in front of Node.js, with measurements
/images/nginx/nginx-role.svg
:::

::: text 🪜 Step by step
1. Install Nginx (`apt install nginx`) or use the `nginx` Docker image.
2. Build the frontend (`npm run build`) and copy `dist/` to the server root.
3. Run Node on a private port (3000), never exposed publicly.
4. Write a `server` block: listen on 80/443, `root` for the build, `location /api/` proxying to Node.
5. Get a certificate (Let's Encrypt / Certbot) and redirect HTTP to HTTPS.
6. `nginx -t` to test the config, then `nginx -s reload` (or `systemctl reload nginx`).
:::

::: code nginx A complete server block: HTTPS, React build, API proxy
upstream api {
  server 127.0.0.1:3000;
  server 127.0.0.1:3001;               # a second Node process (PM2 or a container)
  keepalive 32;                         # reuse connections to Node
}

server {
  listen 80;
  server_name app.example.com;
  return 301 https://$host$request_uri; # force HTTPS
}

server {
  listen 443 ssl;
  http2 on;
  server_name app.example.com;
  ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

  root /var/www/app/dist;               # the React build
  gzip on;
  gzip_static on;                       # serve pre-built .gz files when present
  gzip_types text/css application/javascript application/json image/svg+xml;
  client_max_body_size 10m;

  location /api/ {
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    add_header Cache-Control "no-cache";
    try_files $uri $uri/ /index.html;    # SPA fallback for React Router
  }
}
:::

::: code javascript Which requests should Nginx answer itself vs proxy to Node? (runnable)
// A tiny model of Nginx location matching for a typical React + API deployment.
function route(path, files) {
  if (path.startsWith('/api/')) return 'proxy → Node';
  if (files.has(path)) return 'file from disk' + (path.startsWith('/assets/') ? ' (cached 1 year)' : '');
  if (path.startsWith('/assets/')) return '404 (missing asset)';
  return 'index.html (SPA fallback, React Router decides)';
}
const files = new Set(['/index.html', '/favicon.svg', '/assets/index-Dq8RLsTi.js', '/assets/index-a1b2.css']);
const requests = ['/', '/assets/index-Dq8RLsTi.js', '/api/orders/7', '/dashboard/settings', '/assets/old-123.js', '/favicon.svg'];
const results = requests.map((p) => [p, route(p === '/' ? '/index.html' : p, files)]);
results.forEach(([p, r]) => console.log(p.padEnd(28), '→', r));
const toNode = results.filter(([, r]) => r.startsWith('proxy')).length;
console.log(toNode === 1 ? '✅ only the API call reaches Node; Nginx answers the rest itself' : '❌ FAIL');
console.log(results.find(([p]) => p === '/assets/old-123.js')[1].startsWith('404') ? '✅ a missing asset is a real 404, not index.html (avoids "Unexpected token <" errors)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Exposing Node's port (3000) publicly alongside Nginx.
- Saying "Nginx is used because Node is slow at static files" (measured: similar speed; the reasons are TLS, routing, compression, limits, operations).
- Forgetting `nginx -t` before reloading: one typo and the reload fails.
- Running Node as root to bind port 80 instead of letting Nginx own 80/443.
- Serving `index.html` for missing `/assets/*` files: the browser gets HTML where it expected JS.
:::

::: understand
- Nginx is the HTTP edge: HTTPS, files, compression, routing, balancing and limits; Node is the application behind it.
:::

::: ask
- *"What does our app look like from the internet: which ports are open and what answers on them?"*
:::

::: important ⭐ Say this in the interview
"Nginx is an event-driven web server and reverse proxy. I put it in front of Node so there's one public entry on ports 80 and 443 that terminates HTTPS, serves the React build with compression and cache headers, routes /api to Node instances over keep-alive connections with load balancing and retries, enforces body-size and timeout limits, and logs every request, while Node only runs application logic on a private port. In my measurements raw static speed was about the same as Node reading from disk, so the benefit is operational, plus pre-compressed assets doubled throughput for the large bundle."
:::

::: links
NGINX: Beginner's guide | https://nginx.org/en/docs/beginners_guide.html
NGINX: Inside NGINX, how we designed for performance and scale | https://blog.nginx.org/blog/inside-nginx-how-we-designed-for-performance-scale
:::

=== How do you configure Nginx as a reverse proxy for a Node.js API? (headers, keep-alive, timeouts, WebSockets, streaming)
@p 3
@tags nginx, reverse-proxy, nodejs, websockets, keep-alive, configuration
@quick
- `proxy_pass http://upstream;` forwards the request. Add **`proxy_http_version 1.1`** + **`proxy_set_header Connection ""`** + **`keepalive N`** in the upstream to reuse connections. Measured: **10,764 → 16,814 req/s**, and **64,596 → 124** new TCP connections to Node.
- Forward client info: `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`; in Express set **`app.set('trust proxy', 1)`** so `req.ip` and `req.protocol` are correct.
- **Defaults to know**: `client_max_body_size 1m` (measured: a 2 MB POST got **413** through Nginx, 200 directly), `proxy_read_timeout 60s` (slow endpoints get **504**).
- **WebSockets** need `Upgrade`/`Connection: upgrade` headers and a long read timeout; **SSE/streaming** needs `proxy_buffering off`.
- Per-route overrides: this app raises the body limit to 64m for imports and turns buffering off for streamed AI answers.

::: text 🧒 In simple words
A reverse proxy is a **switchboard operator**. When you call, the operator connects you to the right extension, tells them who's calling (forwarded headers), keeps a few lines permanently open to busy extensions so they don't redial each time (keep-alive), and refuses parcels bigger than the mailroom allows (body size).
:::

::: text 📖 Detailed answer
### Measured: Nginx → Node, 20 client connections, 6 s
| Upstream config | Requests/s | p99 | New TCP connections to Node |
|---|---|---|---|
| plain `proxy_pass` (HTTP/1.0, no keep-alive) | 10,764 | 10 ms | 64,596 for 64,576 requests |
| `keepalive 32` + HTTP/1.1 + `Connection ""` | **16,814** | 12 ms | **124** for 100,876 requests |

Without keep-alive Nginx opens and closes a TCP connection to Node for **every request**: extra latency, CPU and `TIME_WAIT` sockets.

### Headers and what Node sees
| Header | Set with | Used for |
|---|---|---|
| `Host` | `proxy_set_header Host $host` | virtual hosts, absolute URLs |
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` | real client IP (rate limits, logs) |
| `X-Forwarded-Proto` | `$scheme` | knowing the request was HTTPS (secure cookies, redirects) |
| `X-Request-Id` | `$request_id` | correlating Nginx and app logs |

Express only trusts these when `trust proxy` is set, and only for the number of proxies you configure (otherwise clients could spoof them).

### Defaults that surprise people
| Directive | Default | Symptom | Fix |
|---|---|---|---|
| `client_max_body_size` | 1m | `413` on uploads (measured with 2 MB) | raise per location |
| `proxy_read_timeout` | 60s | `504` on long reports/exports | raise per location, or make it async (job + polling) |
| `proxy_buffering` | on | SSE/streamed responses arrive all at once at the end | `proxy_buffering off` for those routes |
| `proxy_http_version` | 1.0 | no keep-alive, no WebSockets | `1.1` |

### WebSockets
The HTTP `Upgrade` handshake must be passed through explicitly, and idle sockets need a long `proxy_read_timeout` (or app-level pings under the timeout).
:::

::: diagram What happens to a proxied request
sequenceDiagram
  participant C as "client 203.0.113.7"
  participant NX as "Nginx"
  participant N as "Node (trust proxy)"
  C->>NX: POST /api/orders (HTTPS)
  NX->>NX: body ≤ client_max_body_size? else 413
  NX->>N: reuse keep-alive connection, X-Forwarded-For 203.0.113.7, X-Forwarded-Proto https
  N-->>NX: 201 Created (within proxy_read_timeout, else 504)
  NX-->>C: 201 Created + access log line
:::

::: image Nginx as a reverse proxy for Node, measured
/images/nginx/reverse-proxy.svg
:::

::: text 🪜 Step by step
1. Define an `upstream` with your Node instances and `keepalive`.
2. In `location /api/`: `proxy_pass`, `proxy_http_version 1.1`, `Connection ""`, forwarded headers.
3. In Express: `app.set('trust proxy', 1)` (one proxy hop).
4. Set `client_max_body_size` and timeouts per route that needs more.
5. Add a WebSocket location with upgrade headers and long timeouts; turn buffering off for SSE/streaming.
6. `nginx -t && nginx -s reload`; check the access log and Node's `req.ip`.
:::

::: code nginx Reverse proxy for an API, WebSockets and SSE
upstream api {
  server 127.0.0.1:3000;
  keepalive 32;
}

map $http_upgrade $connection_upgrade {    # "upgrade" for WebSockets, "" (keep-alive) otherwise
  default upgrade;
  ''      '';
}

server {
  listen 443 ssl;
  server_name app.example.com;
  # ssl_certificate … (see the HTTPS block in the previous question)

  location /api/ {
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
    client_max_body_size 10m;
    proxy_connect_timeout 2s;
    proxy_read_timeout 30s;
  }

  location /ws/ {                           # WebSockets
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_read_timeout 1h;                  # idle sockets: app pings every 30 s anyway
  }

  location /api/events {                    # Server-Sent Events / streaming
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;                    # send each chunk immediately
    proxy_cache off;
    proxy_read_timeout 1h;
  }
}
:::

::: code javascript Express behind Nginx: trust proxy and the real client IP
const express = require('express');
const app = express();

app.set('trust proxy', 1);                  // exactly one proxy (Nginx) in front; don't use `true` blindly

app.get('/api/whoami', (req, res) => {
  res.json({
    ip: req.ip,                             // client IP from X-Forwarded-For (not 127.0.0.1)
    protocol: req.protocol,                 // "https" from X-Forwarded-Proto
    secure: req.secure,                     // true → secure cookies are allowed
    requestId: req.get('x-request-id'),     // same id as in the Nginx access log
  });
});

app.listen(3000, '127.0.0.1');              // only reachable through Nginx
:::

::: code javascript How X-Forwarded-For and trust proxy pick the client IP (runnable)
// Each proxy appends the address it received the request from. With N trusted proxies, the client is N entries from the right.
function clientIp(remoteAddress, xff, trustedHops) {
  const chain = (xff ? xff.split(',').map((s) => s.trim()) : []).concat(remoteAddress);
  return chain[Math.max(0, chain.length - 1 - trustedHops)];
}
// The browser 203.0.113.7 → Nginx (on the same host, 127.0.0.1) → Node
const honest = clientIp('127.0.0.1', '203.0.113.7', 1);
// A client sends its own fake X-Forwarded-For; Nginx appends the real address
const spoofed = clientIp('127.0.0.1', '1.2.3.4, 203.0.113.7', 1);
const trustAll = clientIp('127.0.0.1', '1.2.3.4, 203.0.113.7', Infinity);
const noTrust = clientIp('127.0.0.1', '203.0.113.7', 0);
console.log({ honest, spoofed, trustAll, noTrust });
console.log(honest === '203.0.113.7' && spoofed === '203.0.113.7' ? '✅ trusting exactly 1 hop gives the real client, even with a faked header' : '❌ FAIL');
console.log(trustAll === '1.2.3.4' ? '✅ trusting every hop lets the client choose its own IP (bad for rate limits and logs)' : '❌ FAIL');
console.log(noTrust === '127.0.0.1' ? '✅ without trust proxy every request looks like it came from Nginx' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No upstream keep-alive (measured 64,596 new connections for 64,576 requests).
- `trust proxy: true` with one proxy: clients can spoof their IP through `X-Forwarded-For`.
- Uploads failing with 413 or long exports with 504 because of defaults.
- WebSocket connections failing with 400/426 because Upgrade headers weren't forwarded.
- SSE events arriving in bursts because `proxy_buffering` is on.
:::

::: understand
- Proxy with keep-alive and correct forwarded headers, tell Express how many proxies to trust, and tune body size, timeouts, upgrades and buffering per route.
:::

::: ask
- *"Which of our routes stream, upload large files or take longer than 60 seconds?"* Those need their own location settings.
:::

::: important ⭐ Say this in the interview
"I define an upstream with the Node instances and keepalive, and proxy with HTTP 1.1 and an empty Connection header so connections are reused: in a measurement that took throughput from about 10,800 to 16,800 requests a second and Node saw 124 connections instead of one per request. I forward Host, X-Forwarded-For and X-Forwarded-Proto and set trust proxy to exactly one hop in Express so req.ip and secure cookies work without spoofing. I know the defaults: a 1 MB body limit gave a 413 on a 2 MB upload and the read timeout is 60 seconds, so I raise them per route, forward Upgrade headers for WebSockets and turn buffering off for SSE."
:::

::: links
NGINX: ngx_http_proxy_module | https://nginx.org/en/docs/http/ngx_http_proxy_module.html
NGINX: WebSocket proxying | https://nginx.org/en/docs/http/websocket.html
:::

=== How do you serve a React single-page app with Nginx? (try_files, caching, compression)
@p 3
@tags nginx, react, spa, caching, gzip, brotli, frontend-deployment
@quick
- A React build is **static files**: `index.html` + hashed `assets/*.js|css`. Nginx serves them from `root`.
- **Deep links** (`/dashboard/settings`) don't exist as files: `try_files $uri $uri/ /index.html;` returns `index.html` and React Router renders the route. Measured: **404 without it, 200 with it**.
- **Caching**: hashed assets `Cache-Control: public, max-age=31536000, immutable`; `index.html` `no-cache` so users pick up new deploys.
- **Compression** of this app's largest bundle (691 KB): gzip on the fly **184 KB**, pre-compressed gzip **154 KB**, brotli **125 KB** (but brotli q11 took 721 ms, so build it ahead of time).
- Gotcha found while testing: `expires 1y;` + `add_header Cache-Control …` sent **two** Cache-Control headers. Also `add_header` inside a `location` replaces, not merges, the server-level ones.

::: text 🧒 In simple words
A React app is a **single menu card** (`index.html`) plus **ingredient boxes** with dates printed on them (hashed files). If a guest asks for "page 7", there is no page 7 file: you hand them the menu card and the app opens page 7 itself. Dated boxes can be kept for a year; the menu card is checked every time so new dishes appear.
:::

::: text 📖 Detailed answer
### Why `try_files`
Client-side routes only exist in JavaScript. Without a fallback, a refresh on `/dashboard/settings` asks Nginx for a file that doesn't exist:

| Config | `GET /dashboard/settings` (measured) |
|---|---|
| plain `root` | **404** |
| `try_files $uri $uri/ /index.html` | **200** (index.html; React Router shows the page) |

Keep missing **assets** as real 404s (separate `location /assets/` without the fallback); otherwise a stale `old-123.js` returns HTML and the browser errors with "Unexpected token <".

### Caching strategy
| File | Header | Why |
|---|---|---|
| `assets/index-Dq8RLsTi.js` (content hash in name) | `public, max-age=31536000, immutable` | the name changes when the content changes |
| `index.html` | `no-cache` (revalidate every time; ETag makes it cheap) | it points to the newest hashed files |
| `favicon`, `robots.txt` | short max-age | rarely change, not hashed |

### Compression, measured on this app's largest bundle
| Method | Bytes on the wire | Cost |
|---|---|---|
| none | 690,855 | — |
| gzip on the fly (Nginx default level 1) | 184,469 | CPU on every request |
| `gzip_static` with `.gz` built at level 9 | **153,780** | built once at deploy |
| brotli q11 (pre-built; needs the brotli module or a CDN) | 125,433 | 721 ms to compress, so never on the fly at q11 |

Throughput for that bundle went from 319 req/s uncompressed to 543 req/s (gzip on the fly) and **634 req/s** (`gzip_static`) in the same setup.

### This app's own config
`client/nginx.conf` caches `/assets/` for a year, uses `try_files … /index.html` for React Router, and proxies `/api/` to the Express container, so the browser talks to one origin (no CORS).
:::

::: diagram How Nginx answers SPA requests
flowchart TD
  R["GET path"] --> A{"starts with /api/?"}
  A -->|"yes"| P["proxy to Node"]
  A -->|"no"| F{"file exists?"}
  F -->|"yes, /assets/*"| H["serve file, cache 1 year, immutable"]
  F -->|"yes, index.html"| I["serve, Cache-Control no-cache"]
  F -->|"no, under /assets/"| X["real 404"]
  F -->|"no, app route"| FB["serve index.html → React Router renders it"]
:::

::: image Serving a React SPA with Nginx, measured
/images/nginx/spa.svg
:::

::: text 🪜 Step by step
1. `npm run build` → `dist/` with hashed asset names (Vite/CRA/Next export do this).
2. Optionally pre-compress: `gzip -9 -k` (and brotli) every JS/CSS/SVG file in the pipeline.
3. Copy `dist/` to the server or bake it into an `nginx:alpine` image (multi-stage Dockerfile).
4. `location /assets/` with the long cache header; `location /` with `no-cache` and `try_files … /index.html`.
5. Turn on `gzip_static` (and `gzip` for anything not pre-compressed).
6. Verify with `curl -I`: one Cache-Control header, `Content-Encoding: gzip`, deep links return 200.
:::

::: code nginx SPA server block
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_static on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  location /assets/ {
    # one header with the full value (not "expires 1y" + add_header: that sends two)
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;                 # missing assets are real 404s
  }

  location = /index.html {
    add_header Cache-Control "no-cache";
  }

  location / {
    try_files $uri $uri/ /index.html;    # React Router deep links
  }
}
:::

::: code docker Build the React app and serve it with Nginx (multi-stage)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' \) -exec gzip -9 -k {} \;

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
:::

::: code javascript Check deploy headers: hashed assets vs index.html (runnable)
// Given a deploy's files and the headers Nginx returns, flag caching mistakes.
function audit(responses) {
  const problems = [];
  for (const r of responses) {
    const cc = r.headers.filter(([k]) => k.toLowerCase() === 'cache-control').map(([, v]) => v);
    const hashed = /\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(r.path);
    if (cc.length > 1) problems.push(`${r.path}: ${cc.length} Cache-Control headers (${cc.join(' | ')})`);
    if (hashed && !cc.join().includes('immutable')) problems.push(`${r.path}: hashed asset not cached long-term`);
    if (r.path.endsWith('index.html') && /max-age=[1-9]/.test(cc.join())) problems.push(`${r.path}: index.html cached, users won't see new deploys`);
    if (r.path.endsWith('.js') && r.size > 100000 && !r.headers.some(([k, v]) => k.toLowerCase() === 'content-encoding' && /gzip|br/.test(v))) problems.push(`${r.path}: ${Math.round(r.size / 1024)} KB sent uncompressed`);
  }
  return problems;
}
const before = [
  { path: '/assets/index-Dq8RLsTi.js', size: 690855, headers: [['Cache-Control', 'max-age=31536000'], ['Cache-Control', 'public, immutable']] },
  { path: '/index.html', size: 586, headers: [['Cache-Control', 'max-age=3600']] },
];
const after = [
  { path: '/assets/index-Dq8RLsTi.js', size: 153780, headers: [['Cache-Control', 'public, max-age=31536000, immutable'], ['Content-Encoding', 'gzip']] },
  { path: '/index.html', size: 586, headers: [['Cache-Control', 'no-cache']] },
];
audit(before).forEach((p) => console.log('🚧', p));
console.log(audit(before).length === 3 ? '✅ found the duplicate header, the cached index.html and the uncompressed bundle' : '❌ FAIL');
console.log(audit(after).length === 0 ? '✅ fixed config passes' : '❌ FAIL ' + audit(after).join('; '));
:::

::: warning ⚠️ Common mistakes
- No `try_files` fallback: refreshing any route except `/` gives 404.
- Falling back to `index.html` for missing JS files ("Unexpected token <").
- Caching `index.html` for hours: users keep loading old bundles after a deploy.
- Two Cache-Control headers from `expires` + `add_header` (found while measuring).
- Compressing with brotli q11 on the fly (721 ms per file); pre-compress at build time instead.
:::

::: understand
- Serve the build as static files, fall back to index.html for app routes, cache hashed files forever and index.html never, and compress ahead of time.
:::

::: ask
- *"After we deploy, how long until every user runs the new frontend?"*
:::

::: important ⭐ Say this in the interview
"A React build is static files, so Nginx serves them from its root. Client-side routes don't exist as files, so try_files falls back to index.html, which I measured turning a 404 on a deep link into a 200, while missing assets stay real 404s. Hashed assets get a one-year immutable cache and index.html gets no-cache so new deploys are picked up immediately. I pre-compress at build time and enable gzip_static: this app's 691 KB bundle went to 154 KB on the wire. One gotcha I hit: combining expires with add_header Cache-Control sends two Cache-Control headers, so I use a single add_header."
:::

::: links
NGINX: try_files | https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files
Vite: Deploying a static site | https://vite.dev/guide/static-deploy
:::

=== How do you load balance and deploy without downtime using Nginx?
@p 3
@tags nginx, load-balancing, zero-downtime, deployment, reload, upstream
@quick
- `upstream api { server a; server b; }` balances with **round-robin** by default; `least_conn` for uneven request costs; `ip_hash`/`hash` for stickiness; `weight`, `max_fails`, `fail_timeout`, `backup`.
- **`nginx -s reload`** applies new config **without dropping connections**: new workers start, old ones finish their requests. Measured under load: **0 failed of 136,529** requests.
- Restarting the **only** backend under load: **2,786 failed requests (502)**. With **two** backends, a graceful stop or even `kill -9` of one gave **0 failures**: `proxy_next_upstream error timeout` (default) retried on the other.
- Retries only happen for **idempotent** methods by default (not POST), and only before a response was sent.
- Zero-downtime recipe: start new → health check → add to upstream / switch → `nginx -t && nginx -s reload` → SIGTERM old (it drains) → keep the old build for rollback.

::: text 🧒 In simple words
Imagine a ticket office with two windows. If one clerk goes on a break, the queue just moves to the other window (load balancing with retries). Changing the signs above the windows (reloading config) happens while everyone keeps queueing. Closing the only window, though, sends everyone away (2,786 failed requests).
:::

::: text 📖 Detailed answer
### Measured: 20 connections on `/api/ping` through Nginx for 8 s, action at 2.5 s
| Action | Requests | Failed |
|---|---|---|
| `nginx -s reload` | 136,529 | **0** |
| restart the only backend (`docker restart`) | 119,775 | **2,786** (502 Bad Gateway) |
| 2 backends, graceful stop of one (SIGTERM, drains) | 119,438 | **0** |
| 2 backends, `kill -9` of one | 148,539 | **0** (retried on the other) |

### Upstream options
| Option | Use |
|---|---|
| (default) round-robin | equal instances, similar requests |
| `least_conn` | uneven request durations (see the load-balancing measurements in System Design) |
| `ip_hash` / `hash $cookie_x consistent` | sticky clients (avoid if the app is stateless) |
| `weight=3` | bigger instance gets more traffic |
| `max_fails=3 fail_timeout=10s` | passive health checks: skip an instance after failures |
| `backup` | only used when the others are down |
| `keepalive 32` | reuse connections |

Open-source Nginx has **passive** health checks (it notices failures on real traffic); active checks need NGINX Plus, a sidecar, or the orchestrator removing unhealthy instances.

### Deploy strategies with Nginx
| Strategy | How |
|---|---|
| rolling | update instances one by one; each drains on SIGTERM while the others serve |
| blue-green | run green on new ports, switch the upstream include file to green, reload; keep blue for rollback |
| canary | `server green weight=1; server blue weight=9;` then shift weights |

On Kubernetes the Ingress controller (ingress-nginx) does this for you from the Deployment's readiness probes.
:::

::: diagram Blue-green switch with an Nginx reload
sequenceDiagram
  participant D as "deploy script"
  participant G as "green (new) :3001"
  participant NX as "Nginx"
  participant B as "blue (old) :3000"
  D->>G: start new version
  D->>G: GET /readyz until 200
  D->>NX: point upstream at :3001, nginx -t
  D->>NX: nginx -s reload (old workers finish, new ones use green)
  D->>B: SIGTERM after drain period (keep the build for rollback)
:::

::: image Zero-downtime reloads and deploys with Nginx, measured
/images/nginx/zero-downtime.svg
:::

::: text 🪜 Step by step
1. Run at least two Node instances (PM2 cluster, two containers) behind one `upstream`.
2. Make Node shut down gracefully on SIGTERM (stop accepting, finish in-flight, close pools).
3. Deploy: start the new version, wait for `/readyz`, switch or add it in the upstream.
4. `nginx -t && nginx -s reload`.
5. Stop the old version with SIGTERM after a drain period.
6. Roll back by switching the upstream back and reloading.
:::

::: code bash Blue-green deploy script on one server
#!/usr/bin/env bash
set -euo pipefail
NEW_PORT=$([ "$(cat /etc/nginx/active_port)" = 3000 ] && echo 3001 || echo 3000)
OLD_PORT=$(cat /etc/nginx/active_port)

docker run -d --name "api-$NEW_PORT" -p "127.0.0.1:$NEW_PORT:3000" --env-file /etc/app/.env "ghcr.io/acme/api:$GIT_SHA"
for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$NEW_PORT/readyz" && break; sleep 1; done
curl -fs "http://127.0.0.1:$NEW_PORT/readyz"                  # fail the deploy if it never became ready

echo "server 127.0.0.1:$NEW_PORT; keepalive 32;" > /etc/nginx/upstream_api.conf   # nginx.conf: upstream api { include /etc/nginx/upstream_api.conf; }
nginx -t && nginx -s reload
echo "$NEW_PORT" > /etc/nginx/active_port

sleep 15                                                       # let in-flight requests on the old version finish
docker stop -t 30 "api-$OLD_PORT" && docker rm "api-$OLD_PORT"   # SIGTERM → graceful shutdown
:::

::: code javascript Round-robin with passive health checks and retries (runnable)
// Models Nginx's upstream: round-robin, mark a server down after max_fails, retry the next server for idempotent requests.
function makeUpstream(servers, { maxFails = 1, failTimeout = 10000 } = {}) {
  let i = 0; const state = new Map(servers.map((s) => [s, { fails: 0, downUntil: 0 }]));
  return async function proxy(req, now, send) {
    const tries = req.method === 'GET' ? servers.length : 1;            // non-idempotent: no retry
    for (let t = 0; t < tries; t++) {
      let s, guard = 0;
      do { s = servers[i++ % servers.length]; } while (state.get(s).downUntil > now && ++guard < servers.length);
      try { return { status: 200, by: s, body: await send(s) }; }
      catch { const st = state.get(s); if (++st.fails >= maxFails) { st.downUntil = now + failTimeout; st.fails = 0; } }
    }
    return { status: 502 };
  };
}
const alive = new Set(['a', 'b']);
const send = async (s) => { if (!alive.has(s)) throw new Error('connection refused'); return 'pong from ' + s; };
const proxy = makeUpstream(['a', 'b']);
(async () => {
  const out = [];
  for (let n = 0; n < 6; n++) { if (n === 2) alive.delete('a'); out.push(await proxy({ method: 'GET' }, n * 100, send)); }   // 'a' dies after 2 requests
  console.log(out.map((r) => `${r.status} ${r.by ?? ''}`).join(' | '));
  console.log(out.every((r) => r.status === 200) ? '✅ GETs were retried on b: no errors after a died' : '❌ FAIL');
  alive.add('a'); alive.delete('b');
  const post = await makeUpstream(['b', 'a'])({ method: 'POST' }, 0, send);
  console.log('POST when the chosen server is down:', post.status, post.status === 502 ? '✅ not retried (it might have been processed)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- One backend instance: every deploy or crash is visible to users (measured 2,786 failures).
- `systemctl restart nginx` instead of `reload`: drops connections.
- Reloading without `nginx -t`.
- Killing the old version immediately instead of letting it drain (SIGTERM + grace period).
- Expecting Nginx to retry POSTs safely: by default it won't, and you'd need idempotency keys if you enable it.
:::

::: understand
- Two or more instances + reload instead of restart + graceful shutdown = deploys and crashes users don't notice.
:::

::: ask
- *"If one of our servers dies right now, how many user requests fail?"*
:::

::: important ⭐ Say this in the interview
"I run at least two Node instances in an upstream; round-robin by default or least_conn when request costs vary, with max_fails as passive health checks. Config changes use nginx -t and then a reload, which starts new workers while old ones finish, and I measured zero failed requests across 136,000 during a reload. Restarting the only backend under load cost about 2,800 502s, while with two backends stopping or even kill -9 on one cost nothing because Nginx retries idempotent requests on the next server. Deploys start the new version, wait for readiness, switch the upstream, reload, then SIGTERM the old one so it drains, keeping it for rollback."
:::

::: links
NGINX: HTTP load balancing | https://nginx.org/en/docs/http/load_balancing.html
NGINX: Controlling nginx (reload, signals) | https://nginx.org/en/docs/control.html
:::

=== How do you deploy a full-stack app (React frontend + Node backend)? Which architecture would you choose?
@p 3
@tags deployment, fullstack, react, nodejs, architecture, devops
@quick
- **One VM**: Nginx (TLS, React build, `/api` proxy) + Node via PM2 cluster or `docker compose`. Cheapest and simple; you patch the OS, and the VM is a single point of failure.
- **Containers + managed load balancer**: images on ECS/Kubernetes behind an ALB/Ingress; autoscaling, rolling deploys, health checks; more moving parts.
- **CDN + separate API**: React build on S3 + CloudFront, Vercel or Netlify; API on containers, a PaaS or Lambda. Fast global frontend, independent deploys; needs CORS or a shared domain path.
- **PaaS** (Render, Railway, Fly.io): git push → build → deploy; least operations, less control, can cost more at scale.
- Whatever you pick: HTTPS, config and secrets outside the code, health checks, logs/metrics, backups, zero-downtime deploys and **rollback to the previous build**.

::: text 🧒 In simple words
Opening a shop: you can **rent one building** and do everything yourself (one VM), **rent units in a mall** that handles security and cleaning (containers + managed load balancer), put your **leaflets in every newsagent** while the shop stays central (CDN + API), or **franchise** and let someone else run the building entirely (PaaS).
:::

::: text 📖 Detailed answer
### Options compared
| | One VM | Containers + LB | CDN + API | PaaS |
|---|---|---|---|---|
| Frontend | Nginx serves `dist/` | Nginx container or CDN | S3/CloudFront, Vercel, Netlify | platform static hosting |
| Backend | PM2 cluster or compose | ECS/Kubernetes pods | containers / PaaS / Lambda | platform service |
| Scaling | vertical, manual | autoscaling | CDN global + API autoscaling | slider/automatic |
| Availability | single VM | multi-AZ | CDN + multi-AZ API | platform-managed |
| Ops effort | you patch everything | cluster + pipelines | two pipelines | lowest |
| Cost at small scale | lowest | higher | low | low to medium |
| Good for | side projects, internal tools | growing products, many services | public apps, global users | small teams, MVPs |

### Same-origin vs cross-origin
- **Same origin** (`app.com` serves the UI, `app.com/api` is proxied): no CORS, cookies just work. That's how this Learning Hub runs (`web` Nginx container proxying `/api` to `api`).
- **Separate origins** (`app.com` on a CDN, `api.app.com`): CORS configuration and cookie domain settings needed; or put both behind one CDN with a path rule (`/api/*` → API origin).

### Deployment checklist
| Area | What to have |
|---|---|
| build | one artifact per commit (image tag = git SHA, `dist/` versioned) |
| config | env vars per environment; secrets from a secret store, not in git or the frontend bundle |
| HTTPS | certificates (Let's Encrypt/ACM), HTTP → HTTPS redirect |
| health | `/healthz`, `/readyz`, graceful shutdown |
| releases | zero-downtime (rolling/blue-green), DB migrations expand → contract |
| rollback | previous image/build kept; one command to switch back |
| observability | logs, metrics, alerts, uptime checks |
| data | automated backups and a tested restore |

### Frontend–backend compatibility
Deploy the backend first with backward-compatible API changes, then the frontend. Users with an old tab open still call the old API shape for a while.
:::

::: diagram Choosing a deployment architecture
flowchart TD
  Q1{"team wants zero infrastructure?"} -->|"yes"| PAAS["PaaS (Render, Railway, Fly.io) or Vercel + PaaS API"]
  Q1 -->|"no"| Q2{"one small app, low traffic, budget first?"}
  Q2 -->|"yes"| VM["one VM: Nginx + PM2 / docker compose"]
  Q2 -->|"no"| Q3{"global users or heavy static traffic?"}
  Q3 -->|"yes"| CDN["React on CDN + API on containers/serverless"]
  Q3 -->|"no"| K8S["containers behind a managed LB (ECS/Kubernetes)"]
:::

::: image Ways to deploy a React frontend and Node backend
/images/nginx/deploy-architectures.svg
:::

::: text 🪜 Step by step
1. Pick the architecture from team size, traffic, budget and availability needs.
2. Make the build reproducible: frontend `dist/`, backend Docker image, both tagged with the commit.
3. Set up environments (staging, production) with their own config and secrets.
4. Automate deploys in CI/CD: backend first (compatible API), then frontend.
5. Add HTTPS, health checks, graceful shutdown, logs, metrics and alerts.
6. Rehearse rollback and backup restore before you need them.
:::

::: code yaml docker-compose.prod.yml: one VM running Nginx + API + DB
services:
  web:
    image: ghcr.io/acme/web:${GIT_SHA}          # nginx:alpine with the React build and nginx.conf
    ports: ["80:80", "443:443"]
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on: [api]
    restart: unless-stopped
  api:
    image: ghcr.io/acme/api:${GIT_SHA}
    env_file: /etc/app/api.env                   # secrets live on the server, not in git
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      replicas: 2                                # two instances behind Nginx's upstream
  db:
    image: postgres:17
    volumes: ["pgdata:/var/lib/postgresql/data"]
    env_file: /etc/app/db.env
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 20
    restart: unless-stopped
volumes:
  pgdata:
:::

::: code javascript Score deployment options against requirements (runnable)
// A helper for the interview conversation: the answer changes with the constraints.
const options = {
  'one VM (Nginx + PM2/compose)': { cost: 3, ops: 1, availability: 1, global: 1, scale: 1 },
  'containers + managed LB': { cost: 1, ops: 2, availability: 3, global: 2, scale: 3 },
  'CDN frontend + API service': { cost: 2, ops: 2, availability: 3, global: 3, scale: 3 },
  'PaaS': { cost: 2, ops: 3, availability: 2, global: 2, scale: 2 },
};
function choose(weights) {
  return Object.entries(options).map(([name, s]) => [name, Object.entries(weights).reduce((sum, [k, w]) => sum + w * s[k], 0)]).sort((a, b) => b[1] - a[1]);
}
const sideProject = choose({ cost: 3, ops: 1 });
const startup = choose({ ops: 3, cost: 1, availability: 1 });
const globalProduct = choose({ availability: 3, global: 3, scale: 2, cost: 1 });
console.log('side project   →', sideProject[0][0]);
console.log('small startup  →', startup[0][0]);
console.log('global product →', globalProduct[0][0]);
console.log(sideProject[0][0].startsWith('one VM') && startup[0][0] === 'PaaS' && globalProduct[0][0].startsWith('CDN') ? '✅ different constraints → different architecture' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Deploying frontend and backend in lock-step with breaking API changes (old tabs break).
- Secrets in the frontend bundle or in git.
- A single VM with no backups and no way to rebuild it.
- Rebuilding for each environment instead of promoting the same artifact.
- No rollback path: "we'll fix forward" at 2 a.m.
:::

::: understand
- Pick the simplest architecture that meets availability, scale and team constraints, and give every option the same basics: HTTPS, config, health, observability, zero-downtime deploys and rollback.
:::

::: ask
- *"Who will be woken up when this breaks, and how much infrastructure do they want to own?"*
:::

::: important ⭐ Say this in the interview
"It depends on constraints. For a small app the simplest is one VM with Nginx terminating HTTPS, serving the React build and proxying /api to two Node processes under PM2 or docker compose. A growing product moves to containers on ECS or Kubernetes behind a managed load balancer with autoscaling and rolling deploys, and for global users I'd serve the React build from a CDN like CloudFront or Vercel and deploy the API separately. A PaaS fits teams that want minimal operations. In every case I build one artifact per commit, keep secrets outside the code, use health checks and graceful shutdown for zero-downtime deploys, deploy backward-compatible backend changes before the frontend, and keep the previous build for instant rollback."
:::

::: links
The Twelve-Factor App | https://12factor.net/
AWS: Deploy a React app with S3 and CloudFront | https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/deploy-a-react-based-single-page-application-to-amazon-s3-and-cloudfront.html
:::
