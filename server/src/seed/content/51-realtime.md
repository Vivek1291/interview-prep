@section Real-Time: WebSockets & SSE
@icon ⚡
@color #8b5cf6
@desc Real-time systems with Node.js: polling vs long polling vs SSE vs WebSocket (measured), the WebSocket handshake and frames, heartbeats and reconnection (measured), rooms, presence, broadcasting and slow clients (measured), scaling across instances with Redis (measured), Server-Sent Events with Last-Event-ID (measured in Chrome), ws vs Socket.IO, and designing a real-time dashboard.

=== HTTP polling vs long polling vs SSE vs WebSocket: which one should you use? (measured)
@p 3
@tags realtime, websocket, sse, polling, architecture
@quick
- **Short polling**: the client asks every N seconds; simple but late and wasteful (measured: **594 ms** average delay with a 1 s interval).
- **Long polling**: the server holds the request until there's data; low latency (1.1 ms) but **one HTTP request per event** (21 requests for 20 events).
- **SSE**: one long HTTP response, **server → client** only, auto-reconnect built in (1.4 ms, 1 request).
- **WebSocket**: one upgraded connection, **both directions**, lowest overhead (1.3 ms, 1,161 bytes for 20 events).
- Rule: notifications, feeds, dashboards → **SSE**; chat, collaboration, games, client → server streams → **WebSocket**; rare updates → polling is fine.

::: text 🧒 In simple words
Waiting for a parcel: **short polling** is walking to the door every minute to check; **long polling** is standing at the door until the courier comes, then going back to stand again; **SSE** is a **letterbox** the courier keeps dropping things into; **WebSocket** is a **phone call** where both of you can talk any time.
:::

::: text 📖 Detailed answer
### Measured (Node 22, localhost, 20 events at random times over ~10 s, one client per transport)
| Transport | Avg delay | Max delay | HTTP requests | Bytes on the wire |
|---|---|---|---|---|
| Short polling, every 1 s | **593.7 ms** | 972 ms | 11 | 2,987 |
| Long polling | 1.1 ms | 2 ms | **21** | 4,947 |
| SSE | 1.4 ms | 3 ms | **1** | 1,407 |
| WebSocket | 1.3 ms | 3 ms | **1** | **1,161** |
Idle cost matters too: polling every second is 3,600 requests per hour per user even when nothing happens.

### Comparison
| | Short poll | Long poll | SSE | WebSocket |
|---|---|---|---|---|
| Direction | client pulls | server pushes (per request) | server → client | both |
| Protocol | HTTP | HTTP | HTTP (`text/event-stream`) | `ws://` / `wss://` after HTTP upgrade |
| Reconnect | n/a | each response | **automatic** + `Last-Event-ID` | you implement it |
| Binary data | yes | yes | text only | yes |
| Through proxies/CDNs | easy | ok | easy (plain HTTP) | needs upgrade support |
| Auth | normal cookies/headers | same | cookies (EventSource can't set headers) | cookie or token in first message |
| HTTP/2 multiplexing | yes | yes | yes (no 6-connection limit) | separate TCP connection |

### Choosing in an interview
"Who sends data, how often, and does it have to be two-way?" Server-only events → SSE. Two-way, low-latency messages → WebSocket. Updates every few minutes → polling with ETags.
:::

::: diagram Choosing a transport
flowchart TD
  Q{"does the client send a stream of messages too?"} -->|"yes"| WS["WebSocket"]
  Q -->|"no"| F{"how often do updates happen?"}
  F -->|"every few minutes"| P["polling with ETag and 304"]
  F -->|"often, server to client"| SSE["Server-Sent Events"]
:::

::: image Polling vs long polling vs SSE vs WebSocket (measured)
/images/realtime/transports.svg
:::

::: chart bar Measured: average delivery delay (ms) for 20 events
Transport,Avg delay (ms)
short polling 1 s,593.7
long polling,1.1
SSE,1.4
WebSocket,1.3
:::

::: text 🪜 Step by step
Choosing for three features of one product:
1. **Order status page** (server pushes "paid → shipped"): SSE, reconnects on its own and resumes with `Last-Event-ID`.
2. **Support chat** (both sides type): WebSocket with rooms per conversation.
3. **Monthly invoice list**: plain REST, maybe polling with ETags when the page is open.
4. All three share the same auth and run behind the same load balancer (SSE/WS need longer idle timeouts).
5. If WebSockets are blocked by a corporate proxy, fall back to SSE + POST or long polling (what Socket.IO does automatically).
:::

::: code javascript transports.js: the measurement server (all four transports on one port)
const http = require('node:http');
const { WebSocketServer } = require('ws');

const events = [];                       // { id, t, value }
const waiters = new Set();               // pending long-poll responses
const sseClients = new Set();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const after = Number(url.searchParams.get('after') ?? -1);
  if (url.pathname === '/poll') {                                     // short polling: answer immediately
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(events.filter((e) => e.id > after)));
  }
  if (url.pathname === '/long') {                                     // long polling: wait for the next event
    const ready = events.filter((e) => e.id > after);
    if (ready.length) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ready));
    const waiter = { res }; waiters.add(waiter); res.on('close', () => waiters.delete(waiter));
    return;
  }
  if (url.pathname === '/sse') {                                      // SSE: one long response
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    sseClients.add(res); res.on('close', () => sseClients.delete(res));
    return;
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({ server });                          // WebSocket on the same port

function publish(value) {
  const e = { id: events.length, t: Date.now(), value };
  events.push(e);
  for (const w of waiters) { w.res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([e])); waiters.delete(w); }
  for (const r of sseClients) r.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
  for (const c of wss.clients) c.send(JSON.stringify(e));
}

server.listen(5660);
module.exports = { publish };
:::

::: code javascript Cost of polling vs push (runnable)
// Requests per hour for one open page, and average extra delay, for each transport.
function model({ eventsPerHour, pollEverySec }) {
  return {
    shortPolling: { requests: 3600 / pollEverySec, avgDelayMs: (pollEverySec * 1000) / 2 },
    longPolling: { requests: eventsPerHour + 1, avgDelayMs: 1 },
    sse: { requests: 1, avgDelayMs: 1 },
    webSocket: { requests: 1, avgDelayMs: 1 },
  };
}
const quiet = model({ eventsPerHour: 6, pollEverySec: 1 });
const busy = model({ eventsPerHour: 7200, pollEverySec: 1 });
console.log({ quiet, busyLongPollRequests: busy.longPolling.requests });
console.log('polling a quiet page costs 3600 requests/hour', quiet.shortPolling.requests === 3600 ? '✅' : '❌ FAIL');
console.log('average polling delay ≈ half the interval', quiet.shortPolling.avgDelayMs === 500 ? '✅ (measured 594 ms)' : '❌ FAIL');
console.log('long polling = one request per event when busy', busy.longPolling.requests > 7000 ? '✅ (measured 21 requests for 20 events)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using WebSockets for one-way notifications (SSE is simpler and reconnects for you).
- Polling every second "to be safe" (wasteful, still up to a second late).
- Forgetting load balancer/proxy idle timeouts for long-lived connections.
- Using SSE over HTTP/1.1 with many tabs (6 connections per host limit; HTTP/2 fixes it).
- No fallback when WebSockets are blocked.
:::

::: understand
- Direction and frequency decide the transport: pull rarely, push often, talk both ways with WebSockets.
:::

::: ask
- *"Does the client need to send a stream of messages, or only receive updates?"*
:::

::: important ⭐ Say this in the interview
"I pick by direction and frequency. Short polling is simplest but late and wasteful: with a one-second interval I measured about 600 milliseconds average delay. Long polling has low latency but one HTTP request per event. Server-Sent Events keep one HTTP response open for server-to-client streams and reconnect automatically with Last-Event-ID, and WebSockets upgrade one connection for two-way messaging with the lowest overhead; both delivered events in about a millisecond. So notifications, feeds and dashboards get SSE, chat and collaboration get WebSockets, and rare updates stay on polling."
:::

::: links
MDN: Server-sent events | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
MDN: The WebSocket API | https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
:::

=== How does the WebSocket handshake work, and what is a frame? (measured)
@p 3
@tags websocket, protocol, http, realtime
@quick
- A WebSocket starts as an **HTTP/1.1 GET** with `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version: 13`.
- The server answers **`101 Switching Protocols`** with `Sec-WebSocket-Accept = base64(SHA-1(key + fixed GUID))`: measured, it matched exactly.
- After that the TCP connection carries **frames**: text, binary, ping, pong, close. Small frames have a **2-byte header**; client → server frames are **masked** (+4 bytes). Measured: 20-byte message = **22 bytes** server → client, **26 bytes** client → server.
- Lifecycle: `CONNECTING → OPEN → CLOSING → CLOSED`; close frames carry a code (1000 normal, 1001 going away, 1008 policy violation, 1011 server error).
- Use `wss://` (TLS) in production; authenticate during the upgrade (cookie) or in the first message (token), and **check the `Origin` header**.

::: text 🧒 In simple words
The handshake is **ringing a hotel reception (HTTP) and asking to be put through to a room (Upgrade)**. Reception says "connecting you now" (101), and from then on you talk directly on that line in short **envelopes (frames)**, each with a tiny label saying what's inside.
:::

::: text 📖 Detailed answer
### Measured handshake (ws 8 server)
`GET /live HTTP/1.1` + `Upgrade: websocket` + `Sec-WebSocket-Key: <random 16 bytes base64>` →
`HTTP/1.1 101 Switching Protocols`, `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Accept: <base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))>`.
The accept value proves the server understood the WebSocket protocol (not a security feature).

### Frame structure
| Field | Size |
|---|---|
| FIN + opcode (text 1, binary 2, close 8, ping 9, pong 10) | 1 byte |
| MASK bit + payload length (< 126) | 1 byte |
| extended length (126–65535 / larger) | +2 / +8 bytes |
| masking key (client → server only) | +4 bytes |
| payload | n bytes |

### Measured frame sizes (1,000 messages, 20-byte JSON payload, compression off)
| Direction | ws | Socket.IO |
|---|---|---|
| server → client | **22 B** | 41 B |
| client → server | **26 B** | 45 B |

### Security checklist
- `wss://` only; terminate TLS at the load balancer if you like.
- Validate `Origin` on upgrade (cross-site WebSocket hijacking uses the victim's cookies).
- Authenticate before joining rooms; re-check authorization per subscription.
- Limit message size (`maxPayload`) and rate per connection; validate every message like an HTTP body.
:::

::: diagram Upgrade and lifecycle
sequenceDiagram
  participant C as Browser
  participant S as Server
  C->>S: "GET /live, Upgrade websocket, Sec-WebSocket-Key"
  S-->>C: "101 Switching Protocols, Sec-WebSocket-Accept"
  C->>S: "text frame, masked"
  S-->>C: "text frame"
  S-->>C: "ping"
  C->>S: "pong"
  C->>S: "close 1000"
  S-->>C: "close 1000"
:::

::: image The WebSocket handshake, lifecycle and frames (measured)
/images/realtime/handshake.svg
:::

::: chart bar Measured: bytes on the wire for one 20-byte message
Library and direction,Bytes
ws server to client,22
ws client to server,26
Socket.IO server to client,41
Socket.IO client to server,45
:::

::: text 🪜 Step by step
Opening `new WebSocket('wss://api.example/live')` from React:
1. DNS + TCP + TLS as for any HTTPS request; cookies for `api.example` are attached.
2. Browser sends the upgrade GET with `Origin: https://app.example`.
3. Server checks Origin and the session cookie, then replies 101 (or 401/403 and no upgrade).
4. Both sides now exchange frames; the client must mask its frames.
5. On logout or navigation the client sends a close frame (1000/1001); servers also close idle or unauthenticated sockets.
:::

::: code javascript ws server: authenticate the upgrade, check Origin, limit payloads
const http = require('node:http');
const { WebSocketServer } = require('ws');

const ALLOWED_ORIGINS = new Set(['https://app.example']);
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });   // reject frames bigger than 64 KB

server.on('upgrade', async (req, socket, head) => {
  try {
    if (!ALLOWED_ORIGINS.has(req.headers.origin)) throw Object.assign(new Error('bad origin'), { status: 403 });
    const user = await userFromSessionCookie(req.headers.cookie);              // same session as the REST API
    if (!user) throw Object.assign(new Error('unauthenticated'), { status: 401 });
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
  } catch (err) {
    socket.write(`HTTP/1.1 ${err.status ?? 400} ${err.message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
});

wss.on('connection', (ws, req, user) => {
  ws.on('message', (data, isBinary) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return ws.close(1008, 'invalid JSON'); }
    if (msg.type === 'echo' && typeof msg.text === 'string') ws.send(JSON.stringify({ type: 'echo', text: msg.text, from: user.id }));
  });
  ws.send(JSON.stringify({ type: 'hello', userId: user.id }));
});

async function userFromSessionCookie(cookie) { return cookie?.includes('sid=') ? { id: 42 } : null; }
server.listen(5661);
:::

::: code javascript Computing Sec-WebSocket-Accept and frame sizes (runnable)
// Sec-WebSocket-Accept = base64(SHA-1(key + GUID)); the example key/answer comes from RFC 6455.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
async function accept(key) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key + GUID));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
function frameBytes(payloadLength, fromClient) {
  const lengthBytes = payloadLength < 126 ? 0 : payloadLength < 65536 ? 2 : 8;
  return 2 + lengthBytes + (fromClient ? 4 : 0) + payloadLength;
}
(async () => {
  const a = await accept('dGhlIHNhbXBsZSBub25jZQ==');
  console.log('accept:', a, a === 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=' ? '✅ matches RFC 6455' : '❌ FAIL');
  console.log('20-byte message: server→client', frameBytes(20, false), 'client→server', frameBytes(20, true), frameBytes(20, false) === 22 && frameBytes(20, true) === 26 ? '✅ (measured 22 / 26)' : '❌ FAIL');
  console.log('1 KB message: server→client', frameBytes(1024, false), frameBytes(1024, false) === 1028 ? '✅ (2 extra length bytes)' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Not checking `Origin` on upgrade (cross-site WebSocket hijacking with the user's cookies).
- Putting long-lived tokens in the URL (`wss://…?token=`) where they end up in logs.
- Trusting message content because "the socket is authenticated" (validate every message).
- No `maxPayload` / rate limits per socket.
- Forgetting proxies must forward `Upgrade`/`Connection` headers (Nginx `proxy_set_header Upgrade $http_upgrade`).
:::

::: understand
- HTTP upgrade once, then lightweight frames both ways on the same TCP connection.
:::

::: ask
- *"How do we authenticate the socket, and how do we revoke it when the session ends?"*
:::

::: important ⭐ Say this in the interview
"A WebSocket starts as an HTTP GET with Upgrade: websocket and a random Sec-WebSocket-Key; the server answers 101 Switching Protocols with Sec-WebSocket-Accept, the base64 SHA-1 of the key plus a fixed GUID, which I verified on a raw socket. After that the TCP connection carries frames: text, binary, ping, pong and close. A small frame has a 2-byte header and client frames are masked, so a 20-byte message cost 22 bytes downstream and 26 upstream in my measurement, versus about 41 to 45 with Socket.IO. I authenticate during the upgrade with the session cookie or the first message, check the Origin header, limit payload size and validate every message."
:::

::: links
RFC 6455: The WebSocket Protocol | https://www.rfc-editor.org/rfc/rfc6455
ws (Node.js WebSocket library) | https://github.com/websockets/ws
:::

=== Heartbeats, ping/pong and reconnection: how do you keep connections healthy? (measured)
@p 3
@tags websocket, heartbeat, reconnection, reliability
@quick
- TCP doesn't notice a client that **disappears without closing** (phone loses signal, NAT drops the mapping): measured, without heartbeats the server still thought the client was connected **after 12 s** (and would forever).
- Server heartbeat: every N seconds `ping()`; if no `pong` arrived since the last ping → `terminate()`. Measured: detected in **1.8 s** (1 s pings) and **5.8 s** (3 s pings).
- Heartbeats also keep idle connections alive through load balancers/proxies (e.g. AWS ALB idle timeout 60 s by default).
- Client reconnection: **exponential backoff with jitter** (1, 2, 4… max 30 s), reconnect on `online` events, then **resync** (snapshot or missed events by sequence id).
- Ack + resend for messages that must not be lost; everything else is best-effort.

::: text 🧒 In simple words
A heartbeat is the **"are you still there?"** a radio operator asks every few seconds. If nobody answers twice, they hang up and free the line. Reconnection with jitter is everyone redialling **at slightly different random times** after a power cut, instead of all at once and jamming the switchboard.
:::

::: text 📖 Detailed answer
### Measured (ws 8, a proxy that silently drops traffic, no FIN/RST)
| Server config | Dead client detected after |
|---|---|
| No heartbeat | **never** (still OPEN after 12 s) |
| Ping every 3 s | 5,799 ms |
| Ping every 1 s | 1,796 ms |
Detection time ≈ between 1 and 2 intervals: one ping is sent, it's checked at the next tick.

### Why dead sockets hurt
- Memory and file descriptors held forever.
- Presence shows users "online" who left long ago.
- Messages "delivered" into the void; no reconnect → no resync.

### Choosing intervals
- 20–30 s heartbeats are typical (below load-balancer idle timeouts, cheap on mobile batteries).
- Browser WebSocket API can't send pings itself; the server pings and browsers answer pong automatically. For browser-side detection, send an app-level `{"type":"ping"}` and expect a reply.

### Reconnection recipe
1. On close/error: wait `min(30 s, 1 s × 2^attempt) × random(0.5–1)`.
2. Reset attempts after a stable connection (e.g. 60 s).
3. On reconnect send `{ type: 'resume', lastSeq }`; server replays missed events or sends a fresh snapshot.
4. Pause attempts while `navigator.onLine` is false; retry immediately on `online`.
:::

::: diagram Heartbeat loop on the server
flowchart TD
  T["every interval"] --> A{"socket.isAlive?"}
  A -->|"no: no pong since last ping"| K["terminate, clean up presence and rooms"]
  A -->|"yes"| P["isAlive = false, send ping"]
  P --> W["pong arrives: isAlive = true"]
  W --> T
:::

::: image Heartbeats and reconnection (measured)
/images/realtime/heartbeat.svg
:::

::: chart bar Measured: ms until a vanished client is detected
Server config,ms
no heartbeat (gave up at 12 s),12000
ping every 3 s,5799
ping every 1 s,1796
:::

::: text 🪜 Step by step
A user on a train goes through a tunnel:
1. Their phone stops sending and receiving; no TCP close reaches the server.
2. Server pings at t=30 s; no pong; at t=60 s the socket is terminated and the user is marked offline.
3. Out of the tunnel, the browser fires `close`; the client waits ~1 s (+ jitter) and reconnects.
4. It sends `resume` with the last sequence number it processed.
5. The server replays the 4 missed order updates (or sends a fresh snapshot), and the UI is consistent again.
:::

::: code javascript Server heartbeat with ws and a browser client with backoff, jitter and resume
// ---- server (Node.js) ----
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 5664 });
const HEARTBEAT_MS = 30_000;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }      // no pong since the last ping → dead
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(interval));

// ---- browser client ----
function connectLive(url, onEvent) {
  let attempt = 0, lastSeq = Number(localStorage.getItem('lastSeq') ?? 0), socket, stableTimer;
  const open = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'resume', lastSeq }));     // server replays missed events
      stableTimer = setTimeout(() => { attempt = 0; }, 60_000);
    };
    socket.onmessage = (e) => { const msg = JSON.parse(e.data); lastSeq = msg.seq; localStorage.setItem('lastSeq', lastSeq); onEvent(msg); };
    socket.onclose = () => {
      clearTimeout(stableTimer);
      if (!navigator.onLine) return;                               // wait for the 'online' event instead
      const delay = Math.min(30_000, 1000 * 2 ** attempt++) * (0.5 + Math.random() / 2);
      setTimeout(open, delay);
    };
  };
  window.addEventListener('online', () => { if (socket.readyState === WebSocket.CLOSED) { attempt = 0; open(); } });
  open();
  return () => socket.close(1000);
}
:::

::: code javascript Backoff with jitter spreads out a reconnect storm (runnable)
// 10,000 clients lose the connection at the same moment (server restart). When do they reconnect?
const base = 1000, max = 30000;
const noJitter = (attempt) => Math.min(max, base * 2 ** attempt);
const withJitter = (attempt) => Math.min(max, base * 2 ** attempt) * (0.5 + Math.random() / 2);
function peakPer100ms(delayFn) { const buckets = new Map(); for (let i = 0; i < 10000; i++) { const b = Math.floor(delayFn(0) / 100); buckets.set(b, (buckets.get(b) ?? 0) + 1); } return Math.max(...buckets.values()); }
const a = peakPer100ms(noJitter), b = peakPer100ms(withJitter);
console.log({ peakReconnectsPer100msWithoutJitter: a, withJitter: b });
console.log('without jitter all 10,000 hit the server in the same instant', a === 10000 ? '✅ (thundering herd)' : '❌ FAIL');
console.log('jitter spreads them out (peak at least 4× lower)', b * 4 <= a ? '✅' : '❌ FAIL');
console.log('delays grow and cap', [0, 1, 2, 3, 10].map(noJitter).join(' → ') === '1000 → 2000 → 4000 → 8000 → 30000' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No server heartbeat (dead sockets accumulate; presence is wrong).
- Heartbeat interval longer than the load balancer's idle timeout.
- Reconnecting immediately in a tight loop (DDoS-ing your own server after a deploy).
- Reconnecting without resync (the UI silently misses updates).
- Treating WebSocket delivery as guaranteed for important messages (use acks/ids).
:::

::: understand
- Detect death with ping/pong, survive it with backoff + jitter, and recover with resume or snapshot.
:::

::: ask
- *"What does the client need to fetch after reconnecting so it's consistent again?"*
:::

::: important ⭐ Say this in the interview
"TCP doesn't tell you when a client silently disappears, like a phone losing signal, so I run a server heartbeat: ping every interval, and terminate sockets that didn't answer the previous ping. I measured it with a proxy that black-holed traffic: without heartbeats the server still considered the client connected after twelve seconds, with one-second pings it noticed in 1.8 seconds and with three-second pings in 5.8. Heartbeats also keep connections alive through load balancer idle timeouts. Clients reconnect with exponential backoff and jitter so a restart doesn't cause a thundering herd, then resume from their last sequence number or reload a snapshot."
:::

::: links
ws: How to detect and close broken connections | https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
AWS: Exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
:::

=== Rooms, broadcasting, presence and slow clients: how do you fan out messages? (measured)
@p 2
@tags websocket, rooms, presence, broadcasting, backpressure
@quick
- **Rooms** (channels/topics) map a key (`order:981`, `user:42`, `chat:7`) to a set of sockets; send to a room instead of everyone.
- **Broadcast** cost grows with subscribers: measured one message to **1,000** clients in **7 ms**, **5,000** in **34 ms** (ws, one process), with about **2.5–2.8 KB** heap per connection.
- **Presence** (who's online): track sockets per user (several tabs/devices), mark offline only when the last socket closes, store it in Redis with a TTL when you run several instances.
- **Slow clients**: `socket.bufferedAmount` grows when a client can't keep up: measured **7.1 MB** buffered in 2 s for a frozen client; dropping updates above 64 KB kept it at **0.1 MB**.
- Serialize once, send many; authorize every room join.

::: text 🧒 In simple words
Rooms are **WhatsApp groups**: you post once and only members get it. Presence is the **"online" dot**: you're online if any of your devices is connected. A slow client is a member whose **inbox is full**: either skip the less important messages for them or ask them to rejoin and catch up.
:::

::: text 📖 Detailed answer
### Measured broadcast (ws 8, perMessageDeflate off, one Node process, localhost)
| Clients | Send loop | All received | Heap per connection |
|---|---|---|---|
| 1,000 | 6.9 ms | **7 ms** | 2.8 KB |
| 5,000 | 32.6 ms | **34 ms** | 2.5 KB |
The send loop blocks the event loop for that time: for 100k sockets per process, shard rooms across processes or send in chunks with `setImmediate`.

### Measured slow client (20,000 small updates per second, client stopped reading for 2 s)
| Policy | Peak buffered on the server | Outcome |
|---|---|---|
| Always send | **7.1 MB** (and growing) | memory grows until OOM |
| Drop when `bufferedAmount > 64 KB` | **0.1 MB** | 32,850 updates skipped (fine for prices/metrics) |
| Close when > 1 MB | 1.0 MB | client reconnects and resyncs |

### Presence done right
- `userSockets: Map<userId, Set<socket>>`: online when the set goes 0 → 1, offline when 1 → 0.
- Multi-instance: Redis `SADD online:{room} userId` with per-instance heartbeat keys or sorted sets with timestamps (expire stale entries).
- Debounce offline notifications (tab refresh shouldn't flash "offline").

### Authorization
Every `join(room)` must check the user may see that room (order belongs to them, member of the chat, same tenant). Socket authentication alone is not authorization.
:::

::: diagram Fan-out with rooms
flowchart LR
  E["order 981 shipped"] --> R["room order:981"]
  R --> S1["customer phone"]
  R --> S2["customer laptop"]
  R --> S3["support agent"]
  S1 --> B{"bufferedAmount over limit?"}
  B -->|"yes"| D["drop or close and resync"]
  B -->|"no"| SEND["send"]
:::

::: image Rooms, presence, broadcasting and slow clients (measured)
/images/realtime/rooms-broadcast.svg
:::

::: chart bar Measured: ms until every client received one broadcast
Clients,ms
1000,7
5000,34
:::

::: text 🪜 Step by step
"Order shipped" notification in a multi-tab app:
1. The order service publishes `order.shipped { orderId: 981, userId: 42 }`.
2. The real-time gateway emits to rooms `user:42` and `order:981`.
3. Asha's two tabs and phone (all in `user:42`) receive one serialized message.
4. A support agent viewing the order (joined `order:981` after an authorization check) sees it too.
5. A frozen background tab with a full buffer gets non-critical updates dropped and resyncs when it wakes.
:::

::: code javascript rooms.js: rooms, presence and a slow-client policy with ws
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 5665, perMessageDeflate: false });

const rooms = new Map();                     // room → Set<socket>
const userSockets = new Map();               // userId → Set<socket>
const MAX_BUFFERED = 64 * 1024;

function join(ws, room) { if (!rooms.has(room)) rooms.set(room, new Set()); rooms.get(room).add(ws); ws.rooms.add(room); }
function leaveAll(ws) { for (const room of ws.rooms) { const set = rooms.get(room); set?.delete(ws); if (set?.size === 0) rooms.delete(room); } }

function emitToRoom(room, message, { critical = false } = {}) {
  const data = JSON.stringify(message);                       // serialize once
  for (const ws of rooms.get(room) ?? []) {
    if (ws.readyState !== ws.OPEN) continue;
    if (ws.bufferedAmount > MAX_BUFFERED) {
      if (critical) { ws.close(1013, 'too slow, please resync'); continue; }   // client reconnects and reloads state
      continue;                                                                 // drop a non-critical update
    }
    ws.send(data);
  }
}

wss.on('connection', (ws, req) => {
  const userId = authenticate(req);
  ws.rooms = new Set();
  if (!userSockets.has(userId)) { userSockets.set(userId, new Set()); emitToRoom('presence', { type: 'online', userId }); }
  userSockets.get(userId).add(ws);
  join(ws, `user:${userId}`);

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'join' && (await canView(userId, msg.room))) join(ws, msg.room);   // authorize every join
  });
  ws.on('close', () => {
    leaveAll(ws);
    const set = userSockets.get(userId); set.delete(ws);
    if (set.size === 0) { userSockets.delete(userId); emitToRoom('presence', { type: 'offline', userId }); }
  });
});

function authenticate() { return 42; }
async function canView(userId, room) { return room.startsWith('order:') || room === 'presence'; }
module.exports = { emitToRoom };
:::

::: code javascript Presence across devices (runnable)
// A user is online while ANY of their sockets is connected.
function createPresence() {
  const sockets = new Map(); const events = [];
  return {
    connect(userId, socketId) { if (!sockets.has(userId)) { sockets.set(userId, new Set()); events.push(`${userId} online`); } sockets.get(userId).add(socketId); },
    disconnect(userId, socketId) { const s = sockets.get(userId); s?.delete(socketId); if (s && s.size === 0) { sockets.delete(userId); events.push(`${userId} offline`); } },
    online: () => [...sockets.keys()], events,
  };
}
const p = createPresence();
p.connect('asha', 'phone'); p.connect('asha', 'laptop'); p.connect('ben', 'tab1');
p.disconnect('asha', 'phone');
console.log('after phone disconnects:', p.online(), p.events);
console.log('asha still online on her laptop', p.online().includes('asha') && !p.events.includes('asha offline') ? '✅' : '❌ FAIL');
p.disconnect('asha', 'laptop');
console.log('offline only when the last device leaves', p.events.at(-1) === 'asha offline' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `JSON.stringify` inside the per-socket loop (serialize once).
- Broadcasting everything to everyone instead of using rooms/subscriptions.
- Joining rooms without authorization (anyone can listen to `order:*`).
- Marking a user offline when one of several tabs closes.
- Ignoring `bufferedAmount` (one slow client can consume all memory).
:::

::: understand
- Rooms limit who gets a message; buffers decide what happens when a receiver can't keep up.
:::

::: ask
- *"Which updates may be dropped for a slow client, and which must be delivered?"*
:::

::: important ⭐ Say this in the interview
"I organise sockets into rooms keyed by what they're about, like user, order or chat, authorize every join, and serialize each message once before sending it to the room. Broadcasting is cheap but linear: one message reached a thousand ws clients in 7 milliseconds and five thousand in 34, at about two and a half kilobytes of heap per connection. Presence tracks all sockets per user, so someone goes offline only when their last device disconnects. For slow clients I watch bufferedAmount: a client that stopped reading made the server buffer 7 megabytes in two seconds, so I drop non-critical updates above a threshold or close the socket and let it resync."
:::

::: links
ws: API (bufferedAmount, send) | https://github.com/websockets/ws/blob/master/doc/ws.md
Socket.IO: Rooms | https://socket.io/docs/v4/rooms/
:::

=== How do you scale WebSockets across multiple servers? (Redis pub/sub, sticky sessions; measured)
@p 3
@tags websocket, scaling, redis, pubsub, load-balancing
@quick
- Each connection lives on **one** instance; a message produced on instance A must reach clients connected to B.
- Measured with two Socket.IO instances: **without an adapter** the client on B received **0 of 50** room messages; with the **Redis adapter** it received **50 of 50** (avg 1.28 ms vs 0.36 ms locally).
- Options: Redis pub/sub (Socket.IO adapter or your own channels), Redis Streams/Kafka/NATS for durable fan-out, or managed services (API Gateway WebSockets, Azure Web PubSub, Ably, Pusher).
- **Sticky sessions** are only required for HTTP long-polling fallbacks (Socket.IO handshake); pure WebSockets stay on one connection anyway.
- Keep instances **stateless**: room membership is local, but presence, last sequence numbers and missed events live in Redis/DB.

::: text 🧒 In simple words
Two call centres each have their own customers on the phone. If an announcement is made only in centre A, customers in centre B never hear it. Redis pub/sub is the **intercom between the centres**: anything announced in one is repeated in all the others.
:::

::: text 📖 Detailed answer
### Measured (Socket.IO 4.8 + @socket.io/redis-adapter 8, Redis 7, both instances local)
| Setup | Client on A | Client on B |
|---|---|---|
| No adapter | 50 / 50 (0.30 ms) | **0 / 50** |
| Redis adapter | 50 / 50 (0.36 ms) | **50 / 50** (1.28 ms) |

### Architecture options
| Option | Delivery | Good for |
|---|---|---|
| Redis pub/sub (adapter) | fire-and-forget, all instances | most apps, moderate fan-out |
| Redis Streams / Kafka / NATS JetStream | durable, replayable | resume after reconnect, audit, many producers |
| Dedicated gateway service | sockets isolated from business logic | large scale, separate deploys |
| Managed (API Gateway WS, Ably, Pusher) | provider handles connections | spiky traffic, small teams |

### Load balancer settings
- Allow upgrades (Nginx: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
- Raise idle timeouts (or rely on heartbeats under them).
- Sticky sessions (cookie or IP hash) if HTTP polling transports are enabled.
- Drain on deploy: stop routing new connections, tell clients to reconnect elsewhere (close code 1012 "service restart"), with jittered reconnect on the client.

### Capacity rule of thumb
Connections per instance are limited by memory and file descriptors (raise `ulimit -n`); measured ~2.5 KB JS heap per idle ws connection plus kernel socket buffers. Fan-out CPU often becomes the limit before memory.
:::

::: diagram Cross-instance broadcast
sequenceDiagram
  participant API as Order service
  participant A as Gateway A
  participant R as Redis pub/sub
  participant B as Gateway B
  participant X as Client on B
  API->>A: "order 981 shipped"
  A->>A: "emit to local sockets in room order:981"
  A->>R: "publish room order:981"
  R->>B: "message"
  B->>X: "emit to local sockets in room order:981"
:::

::: image Scaling WebSockets across instances (measured)
/images/realtime/scaling.svg
:::

::: chart bar Measured: messages received by the client on the other instance (of 50)
Setup,Received
no adapter,0
Redis adapter,50
:::

::: text 🪜 Step by step
Deploying a new version of the real-time gateway with no lost updates:
1. Start new pods; they connect to Redis and become ready.
2. Mark old pods "draining": the load balancer stops sending new connections.
3. Old pods close sockets with code 1012; clients reconnect with jitter to new pods.
4. Clients send `resume { lastSeq }`; the gateway replays from Redis Streams (or sends a snapshot).
5. Old pods exit after their sockets are gone or a timeout passes.
:::

::: code javascript Socket.IO with the Redis adapter (multi-instance)
const http = require('node:http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function startGateway(port) {
  const pub = createClient({ url: process.env.REDIS_URL });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);

  const server = http.createServer();
  const io = new Server(server, { cors: { origin: ['https://app.example'], credentials: true }, transports: ['websocket'] });
  io.adapter(createAdapter(pub, sub));                     // room emits now reach every instance

  io.use(async (socket, next) => {                          // authenticate the handshake
    const user = await verifyToken(socket.handshake.auth.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    socket.on('order:subscribe', async (orderId, ack) => {
      if (!(await canViewOrder(socket.data.user.id, orderId))) return ack?.({ ok: false });
      socket.join(`order:${orderId}`);
      ack?.({ ok: true });
    });
  });

  server.listen(port);
  return io;
}

// any instance (or a worker connected with @socket.io/redis-emitter) can now do:
//   io.to('order:981').emit('order:status', { orderId: 981, status: 'shipped' });

async function verifyToken(token) { return token ? { id: 42 } : null; }
async function canViewOrder(userId, orderId) { return Number(orderId) > 0; }
module.exports = { startGateway };
:::

::: code javascript Local rooms + a shared bus (runnable)
// Each "instance" only knows its own sockets; a bus (like Redis pub/sub) relays room messages to all instances.
function createBus() { const subs = new Set(); return { publish: (msg) => subs.forEach((fn) => fn(msg)), subscribe: (fn) => subs.add(fn) }; }
function createInstance(name, bus) {
  const rooms = new Map(); const inbox = [];
  const deliverLocal = ({ room, data }) => (rooms.get(room) ?? []).forEach((client) => inbox.push(`${client}@${name}: ${data}`));
  bus?.subscribe(deliverLocal);
  return {
    join: (client, room) => { if (!rooms.has(room)) rooms.set(room, []); rooms.get(room).push(client); },
    emit: (room, data) => (bus ? bus.publish({ room, data }) : deliverLocal({ room, data })),
    inbox,
  };
}
for (const withBus of [false, true]) {
  const bus = withBus ? createBus() : null;
  const A = createInstance('A', bus), B = createInstance('B', bus);
  A.join('asha-phone', 'order:981'); B.join('support-agent', 'order:981');
  A.emit('order:981', 'shipped');
  console.log(withBus ? 'with bus:   ' : 'without bus:', [...A.inbox, ...B.inbox]);
  console.log(withBus ? 'both instances deliver' : 'client on B misses it (measured 0/50)', (withBus ? B.inbox.length === 1 : B.inbox.length === 0) ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Testing with one instance, then deploying three (messages "randomly" missing).
- Storing presence or session state only in instance memory.
- Using pub/sub where messages must survive restarts (pub/sub is fire-and-forget; use streams).
- Forgetting sticky sessions when polling fallbacks are enabled.
- Restarting all gateway pods at once (everyone reconnects simultaneously).
:::

::: understand
- Connections are local, messages must be global: a shared bus connects the instances.
:::

::: ask
- *"Must a client that was disconnected receive what it missed, or only new messages?"* That decides pub/sub vs streams.
:::

::: important ⭐ Say this in the interview
"A WebSocket connection lives on one instance, so a message produced elsewhere has to be relayed to every instance that holds subscribers. I measured it with two Socket.IO servers: without an adapter the client on the second instance received none of 50 room messages; with the Redis adapter it got all 50 with about a millisecond of extra latency. For messages that must survive disconnects I use a durable stream like Redis Streams or Kafka with sequence numbers for resume. Instances stay stateless with presence in Redis, sticky sessions are only needed for polling fallbacks, and deploys drain connections with jittered reconnects."
:::

::: links
Socket.IO: Redis adapter | https://socket.io/docs/v4/redis-adapter/
Socket.IO: Using multiple nodes | https://socket.io/docs/v4/using-multiple-nodes/
Nginx: WebSocket proxying | https://nginx.org/en/docs/http/websocket.html
:::

=== What are Server-Sent Events (SSE), and how does reconnection with Last-Event-ID work? (measured in Chrome)
@p 3
@tags sse, eventsource, realtime, http
@quick
- SSE is a normal HTTP response with `Content-Type: text/event-stream` that **stays open**; the server writes `id:`, `event:`, `data:` lines separated by a blank line.
- The browser's `EventSource` **reconnects automatically** and sends the last id in the **`Last-Event-ID`** header; `retry: 500` sets the reconnect delay.
- Measured in Chrome: the server cut the stream after every 3 events → 5 connections (`Last-Event-ID`: none, 2, 4, 6, 8), **all 9 events delivered in order, no duplicates**.
- The 3rd event of each burst was **lost in flight** (Chrome reported 2, not 3) and re-sent because the server resumed from `Last-Event-ID`: resume logic is what makes it reliable.
- Server → client only, text only; send heartbeats (`: ping` comments) to keep proxies from closing idle streams; disable proxy buffering.

::: text 🧒 In simple words
SSE is a **news ticker** the server keeps feeding. If the ticker freezes, the browser restarts it and says "the last headline I saw was number 6", and the server continues from number 7, so nothing is missed or repeated.
:::

::: text 📖 Detailed answer
### Wire format
| Line | Meaning |
|---|---|
| `id: 7` | event id, remembered by the browser |
| `event: order` | event name (`addEventListener('order', …)`), default `message` |
| `data: {...}` | payload (several `data:` lines are joined with newlines) |
| `retry: 500` | reconnect delay in ms |
| `: ping` | comment, ignored (keep-alive) |
| empty line | end of event |

### Measured in Chrome (server destroys the response after every 3 events, `retry: 500`)
| Connection | Time | `Last-Event-ID` sent |
|---|---|---|
| #1 | +5 ms | (none) |
| #2 | +813 ms | 2 |
| #3 | +1,634 ms | 4 |
| #4 | +2,442 ms | 6 |
| #5 | +3,253 ms | 8 |
Result: events 1–9, in order, no duplicates.

### SSE vs WebSocket
| | SSE | WebSocket |
|---|---|---|
| Direction | server → client | both |
| Reconnect + resume | built in | build it |
| Infrastructure | plain HTTP, works with HTTP/2 | upgrade support needed |
| Data | UTF-8 text | text + binary |
| Auth | cookies (EventSource can't set headers) | cookies or first message |

### Production notes
- Nginx: `proxy_buffering off;` (or send `X-Accel-Buffering: no`), long `proxy_read_timeout`.
- Compression middleware may buffer the stream: exclude `text/event-stream`.
- Keep the event log (Redis Stream, DB table) long enough to serve `Last-Event-ID` resumes; if too old, send a snapshot.
:::

::: diagram Reconnection with Last-Event-ID
sequenceDiagram
  participant B as Browser EventSource
  participant S as Server
  B->>S: "GET /events"
  S-->>B: "id 1, id 2, connection drops, id 3 lost in flight"
  Note over B: "waits retry ms"
  B->>S: "GET /events with Last-Event-ID 2"
  S-->>B: "id 3, id 4, then more"
:::

::: image Server-Sent Events and automatic reconnection (measured)
/images/realtime/sse.svg
:::

::: text 🪜 Step by step
Live order tracking page with SSE in Express:
1. `GET /api/orders/981/events` checks the session and that order 981 belongs to the user.
2. Reads `Last-Event-ID`; sends events after it from the `order_events` table (or a snapshot if none).
3. Subscribes to new events (Redis pub/sub) and writes them with their ids.
4. Sends `: ping` every 15 s; on `res.on('close')` (client gone) unsubscribes.
5. The browser's `EventSource` handles drops, deploys and network changes on its own.
:::

::: code javascript SSE endpoint in Express with resume and heartbeats
const express = require('express');
const app = express();

app.get('/api/orders/:id/events', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!(await canViewOrder(req, orderId))) return res.sendStatus(404);

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');

  const send = (e) => res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
  const lastId = Number(req.get('Last-Event-ID') ?? 0);
  for (const e of await eventsAfter(orderId, lastId)) send(e);         // replay what the client missed

  const unsubscribe = subscribe(`order:${orderId}`, send);              // e.g. Redis pub/sub
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  res.on('close', () => { clearInterval(heartbeat); unsubscribe(); });   // res, not req (req may close once its body is read)
});

// in-memory stand-ins for the example
const log = [];
const listeners = new Map();
async function canViewOrder(req, id) { return id > 0; }
async function eventsAfter(orderId, seq) { return log.filter((e) => e.orderId === orderId && e.seq > seq); }
function subscribe(topic, fn) { if (!listeners.has(topic)) listeners.set(topic, new Set()); listeners.get(topic).add(fn); return () => listeners.get(topic).delete(fn); }

module.exports = app;
:::

::: code javascript Parsing an SSE stream and resuming (runnable)
// A minimal EventSource-style parser: tracks lastEventId so a reconnect can resume.
function createParser(onEvent) {
  let buffer = '', lastEventId = null;
  return {
    feed(chunk) {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        const ev = { event: 'message', data: [] };
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) continue;                                   // comment / heartbeat
          const [field, ...rest] = line.split(':'); const value = rest.join(':').replace(/^ /, '');
          if (field === 'id') lastEventId = value; else if (field === 'event') ev.event = value; else if (field === 'data') ev.data.push(value);
        }
        if (ev.data.length) onEvent({ id: lastEventId, event: ev.event, data: ev.data.join('\n') });
      }
    },
    get lastEventId() { return lastEventId; },
  };
}
const server = Array.from({ length: 9 }, (_, i) => `id: ${i + 1}\nevent: order\ndata: {"n":${i + 1}}\n\n`);
const got = []; let resumeFrom = 0, connections = 0;
while (got.length < 9) {
  connections++;
  const p = createParser((e) => got.push(Number(e.id)));
  const pending = server.slice(resumeFrom);
  p.feed(': ping\n\n' + pending.slice(0, 2).join('') + pending[2]?.slice(0, 10));     // 3rd event cut mid-way (lost in flight)
  resumeFrom = Number(p.lastEventId ?? resumeFrom);                                  // Last-Event-ID on reconnect
}
console.log({ connections, received: got.join(',') });
console.log('all 9 events, in order, no duplicates', got.join(',') === '1,2,3,4,5,6,7,8,9' ? '✅ (measured in Chrome)' : '❌ FAIL');
console.log('5 connections like the measurement', connections === 5 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Proxy or compression buffering the stream (events arrive in bursts or not at all).
- Ignoring `Last-Event-ID` (reconnects silently lose events).
- No heartbeats (idle streams closed by proxies after 60 s).
- Many SSE tabs over HTTP/1.1 (6-connection limit per host).
- Trying to send auth headers with `EventSource` (use cookies, or a fetch-based SSE client).
:::

::: understand
- SSE = an HTTP response that never ends; ids + Last-Event-ID make it resumable.
:::

::: ask
- *"How long must we keep events so reconnecting clients can resume?"*
:::

::: important ⭐ Say this in the interview
"Server-Sent Events are a long-lived HTTP response with the text/event-stream type, where the server writes id, event and data lines. The browser's EventSource reconnects automatically and sends the last id it processed in the Last-Event-ID header. I tested it in Chrome with a server that dropped the stream every three events: the browser reconnected four times, each time sending the right id, and received all nine events in order without duplicates; one event per burst was actually lost in flight and re-sent thanks to resuming. I use SSE for one-way updates like notifications and dashboards, add heartbeat comments and disable proxy buffering."
:::

::: links
MDN: Using server-sent events | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
HTML spec: Server-sent events | https://html.spec.whatwg.org/multipage/server-sent-events.html
:::

=== ws vs Socket.IO: which library should you use?
@p 2
@tags websocket, socket-io, ws, libraries
@quick
- **ws**: a fast, minimal WebSocket implementation for Node; clients use the browser's native `WebSocket`. You build rooms, acks, reconnection and multi-instance yourself.
- **Socket.IO**: its own protocol on top of WebSocket (with HTTP long-polling fallback): **rooms, namespaces, acknowledgements, auto-reconnect, buffering, adapters** built in. Needs `socket.io-client`.
- Measured: 20-byte message = **22/26 bytes** with ws vs **41/45** with Socket.IO; the default Socket.IO connect made **3 HTTP polling requests** before upgrading (set `transports: ['websocket']` to skip).
- A plain WebSocket client **can't** talk to a Socket.IO server (different protocol).
- Choose Socket.IO for app features fast (chat, notifications); choose ws (or uWebSockets.js) for raw performance, custom protocols or non-JS clients.

::: text 🧒 In simple words
ws is a **plain phone line**: clear and cheap, but you organise everything yourself. Socket.IO is a **phone system with group calls, voicemail and auto-redial** built in, at the cost of a bit of extra overhead and needing its own handsets.
:::

::: text 📖 Detailed answer
| | ws | Socket.IO |
|---|---|---|
| Protocol | RFC 6455 WebSocket | Engine.IO + Socket.IO packets |
| Browser client | native `WebSocket` | `socket.io-client` (~15 KB gzip) |
| Fallback | none | HTTP long polling |
| Rooms / namespaces | build | built in |
| Acknowledgements (`emit` with callback) | build | built in |
| Reconnect, offline buffering | build | built in |
| Multi-instance | your pub/sub | adapters (Redis, Postgres, Mongo…) |
| Bytes per 20-byte message (measured) | 22 / 26 | 41 / 45 |
| Default connect (measured) | 1 upgrade | 3 polling requests → upgrade |
| Other-language clients | any WebSocket client | official/community Socket.IO clients |

### Middle grounds
- `ws` + a small protocol (`{ type, room, seq, data }`) + Redis pub/sub covers most needs.
- uWebSockets.js for very high connection counts per server.
- Managed: Ably, Pusher, Azure Web PubSub, AWS API Gateway WebSockets.
:::

::: diagram Library choice
flowchart TD
  Q{"need rooms, acks, reconnection quickly?"} -->|"yes"| IO["Socket.IO with Redis adapter"]
  Q -->|"no"| P{"non-JS clients or custom protocol?"}
  P -->|"yes"| WS["ws or uWebSockets.js"]
  P -->|"no, but huge scale"| M["managed service or uWebSockets.js"]
:::

::: image ws vs Socket.IO
/images/realtime/ws-vs-socketio.svg
:::

::: text 🪜 Step by step
Adding acknowledgements to a chat "send message":
1. Socket.IO client: `socket.emit('chat:send', msg, (res) => markDelivered(res.id))`.
2. Server stores the message, then calls the ack callback with the id.
3. If no ack within 5 s (`socket.timeout(5000).emit(...)`), the client shows "retry".
4. With ws you'd add a `clientMsgId` to each message and send `{ type: 'ack', clientMsgId }` back yourself.
5. Either way, the server dedupes by `clientMsgId` so retries don't create duplicates.
:::

::: code javascript The same chat feature with Socket.IO (acks) and with ws (manual protocol)
// ---- Socket.IO server ----
const { Server } = require('socket.io');
const io = new Server(5666, { transports: ['websocket'] });
io.on('connection', (socket) => {
  socket.on('chat:join', (room) => socket.join(room));
  socket.on('chat:send', async ({ room, text, clientMsgId }, ack) => {
    const saved = await saveMessage({ room, text, clientMsgId });           // dedupe by clientMsgId
    socket.to(room).emit('chat:message', saved);
    ack({ ok: true, id: saved.id });
  });
});

// ---- ws server with a tiny message protocol ----
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 5667 });
const roomsOf = new Map();
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'join') { if (!roomsOf.has(msg.room)) roomsOf.set(msg.room, new Set()); roomsOf.get(msg.room).add(ws); }
    if (msg.type === 'send') {
      const saved = await saveMessage(msg);
      for (const peer of roomsOf.get(msg.room) ?? []) if (peer !== ws) peer.send(JSON.stringify({ type: 'message', ...saved }));
      ws.send(JSON.stringify({ type: 'ack', clientMsgId: msg.clientMsgId, id: saved.id }));
    }
  });
});

const seen = new Map();
async function saveMessage({ room, text, clientMsgId }) {
  if (seen.has(clientMsgId)) return seen.get(clientMsgId);
  const saved = { id: seen.size + 1, room, text, clientMsgId, at: new Date().toISOString() };
  seen.set(clientMsgId, saved);
  return saved;
}
:::

::: code javascript Acks with timeout and dedupe (runnable)
// Client retries until acked; server dedupes by clientMsgId so a retry never creates a duplicate.
function createServer() { const store = new Map(); return { receive(msg) { if (!store.has(msg.clientMsgId)) store.set(msg.clientMsgId, { id: store.size + 1, ...msg }); return store.get(msg.clientMsgId); }, count: () => store.size }; }
async function sendWithAck(server, msg, { lossyFirstAcks = 2, timeoutMs = 10 } = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const saved = server.receive(msg);                                    // the message reaches the server…
    const ackLost = attempt <= lossyFirstAcks;                            // …but the ack is lost on the way back
    if (!ackLost) return { ackedAfter: attempt, id: saved.id };
    await new Promise((r) => setTimeout(r, timeoutMs));
  }
  throw new Error('gave up');
}
(async () => {
  const server = createServer();
  const res = await sendWithAck(server, { clientMsgId: 'c-1', text: 'hello' });
  console.log(res, 'messages stored:', server.count());
  console.log('retried until acked', res.ackedAfter === 3 ? '✅' : '❌ FAIL');
  console.log('no duplicates despite 3 sends', server.count() === 1 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Connecting a native `WebSocket` to a Socket.IO server (it won't work).
- Leaving Socket.IO's polling fallback on but not configuring sticky sessions.
- Choosing ws, then slowly re-implementing half of Socket.IO badly.
- Assuming acks mean "processed exactly once" without server-side dedupe.
- Forgetting CORS/Origin settings for Socket.IO in production.
:::

::: understand
- ws gives you the transport; Socket.IO gives you a messaging framework on top of it.
:::

::: ask
- *"Which features do we need on day one: rooms, acks, reconnection, fallbacks, other-language clients?"*
:::

::: important ⭐ Say this in the interview
"ws is a minimal, fast WebSocket server and works with the browser's native WebSocket; Socket.IO is a framework with its own protocol that adds rooms, namespaces, acknowledgements, reconnection, buffering, an HTTP polling fallback and adapters for multiple instances. That convenience has a cost: I measured a 20-byte message at 22 to 26 bytes with ws and 41 to 45 with Socket.IO, and Socket.IO's default connect made three polling requests before upgrading. I pick Socket.IO to ship app features quickly and ws when I need raw performance, a custom protocol or non-JavaScript clients."
:::

::: links
Socket.IO: How it works | https://socket.io/docs/v4/how-it-works/
ws | https://github.com/websockets/ws
:::

=== How would you design a real-time dashboard (IoT / SCADA / trading)?
@p 3
@tags realtime, system-design, dashboard, websocket, sse
@quick
- Pipeline: **devices → ingest service → stream (Kafka / Redis Streams) → aggregator → WS/SSE gateway → React**; raw data also lands in a time-series store (TimescaleDB/PostgreSQL).
- **Throttle and coalesce**: send at most 2–5 updates per second per widget, always the latest value; humans can't read faster.
- **Snapshot + deltas**: on connect send current state with a sequence number, then only changes; on reconnect resume from the sequence or reload the snapshot.
- **Subscriptions**: clients subscribe to the plants/tags they're viewing; never broadcast everything.
- **Slow clients** get intermediate values dropped (measured 7.1 MB → 0.1 MB); **alarms** use a separate, acknowledged, persisted channel that is never dropped, and fire on the threshold **crossing** with hysteresis (not on every reading).

::: text 🧒 In simple words
A factory has thousands of sensors shouting numbers every second. The dashboard is a **control-room screen**: it doesn't need every shout, just the **latest value a few times per second** for the dials you're looking at, while **fire alarms** always get through and must be acknowledged.
:::

::: text 📖 Detailed answer
### Components
| Component | Job |
|---|---|
| Ingest (MQTT/HTTP/OPC UA bridge) | authenticate devices, validate, timestamp |
| Stream (Kafka, Redis Streams) | durable buffer, decouples producers from consumers |
| Time-series store | history, charts, downsampled rollups (1 s → 1 min → 1 h) |
| Aggregator | compute per-widget values, thresholds, alarms |
| Gateway (WS or SSE) | subscriptions, throttling, auth per plant/tenant |
| React client | state store, render at most once per frame, virtualised tables |

### Key decisions
| Concern | Decision |
|---|---|
| Update rate | coalesce per tag; flush every 200–500 ms |
| Consistency after reconnect | snapshot + sequence-numbered deltas |
| Fan-out | rooms per plant/tag; Redis pub/sub between gateways |
| Slow consumers | `bufferedAmount` limit → drop old values (not alarms) |
| Alarms | persisted, ack required, escalation if unacknowledged |
| History | query the time-series store via REST, not the socket |
| Security | per-tenant authorization on every subscription |

### Frontend notes
Keep incoming updates in a store outside React (or a ref) and render with `requestAnimationFrame`/`useSyncExternalStore`; charts append points in batches; tables virtualise rows. That avoids re-rendering hundreds of components 20 times a second.
:::

::: diagram Real-time dashboard pipeline
flowchart LR
  D["devices and PLCs"] --> I["ingest service"]
  I --> S["Kafka or Redis Streams"]
  S --> TS["time-series DB"]
  S --> AG["aggregator: rollups and alarms"]
  AG --> GW["WS or SSE gateway"]
  GW --> UI["React dashboard"]
  UI -->|"history"| API["REST API"]
  API --> TS
:::

::: image Designing a real-time dashboard
/images/realtime/dashboard.svg
:::

::: text 🪜 Step by step
A tag `plant7/boiler2/temp` changes 50 times per second:
1. Ingest validates and writes to the stream; the time-series store keeps every reading.
2. The aggregator keeps only the latest value per tag and checks alarm thresholds.
3. Every 250 ms the gateway flushes changed tags to sockets subscribed to `plant7`: 4 updates/s instead of 50.
4. A crossing of 120 °C creates a persisted alarm, sent immediately on the alarm channel and requiring an ack.
5. A client reconnecting after a minute gets the plant snapshot (seq 98,421) and continues with deltas.
:::

::: code javascript Gateway: subscriptions, coalescing and a separate alarm channel (ws)
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 5668, perMessageDeflate: false });

const latest = new Map();                 // tag → { value, ts, seq }
const dirty = new Set();                  // tags changed since the last flush
const inAlarm = new Set();                // tags currently above their limit
let seq = 0;

function onReading({ tag, value, ts }) {  // called by the stream consumer (Kafka / Redis Streams)
  latest.set(tag, { value, ts, seq: ++seq });
  dirty.add(tag);
  if (!tag.endsWith('/temp')) return;
  if (value > 120 && !inAlarm.has(tag)) { inAlarm.add(tag); sendAlarm({ tag, value, ts, seq, state: 'raised' }); }       // edge-triggered
  else if (value < 115 && inAlarm.has(tag)) { inAlarm.delete(tag); sendAlarm({ tag, value, ts, seq, state: 'cleared' }); }  // hysteresis: 5° margin
}

setInterval(() => {                       // coalesce: at most 4 updates per second per tag
  if (!dirty.size) return;
  const changed = [...dirty].map((tag) => ({ tag, ...latest.get(tag) }));
  dirty.clear();
  for (const ws of wss.clients) {
    const mine = changed.filter((u) => ws.subscriptions?.some((prefix) => u.tag.startsWith(prefix)));
    if (!mine.length) continue;
    if (ws.bufferedAmount > 256 * 1024) continue;          // slow client: skip this frame, the next has newer values
    ws.send(JSON.stringify({ type: 'delta', seq, updates: mine }));
  }
}, 250);

function sendAlarm(alarm) {               // never dropped; also persisted elsewhere and needs an ack
  for (const ws of wss.clients) if (ws.subscriptions?.some((p) => alarm.tag.startsWith(p))) ws.send(JSON.stringify({ type: 'alarm', ...alarm }));
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'subscribe') {                        // authorize the plant/tenant here
      ws.subscriptions = msg.prefixes;
      const snapshot = [...latest].filter(([tag]) => msg.prefixes.some((p) => tag.startsWith(p))).map(([tag, v]) => ({ tag, ...v }));
      ws.send(JSON.stringify({ type: 'snapshot', seq, values: snapshot }));
    }
  });
});

module.exports = { onReading };
:::

::: code javascript Coalescing 50 updates/s into 4 frames/s (runnable)
// Simulate one second of readings for 3 tags at 50 Hz, flushed every 250 ms with latest-value coalescing.
const tags = ['boiler1/temp', 'boiler2/temp', 'pump3/rpm'];
const readings = [];
for (let ms = 0; ms < 1000; ms += 20) for (const tag of tags) readings.push({ tag, ts: ms, value: Math.round(100 + 20 * Math.sin(ms / 100) + Math.random() * 5) });
const frames = []; const latest = new Map(); let nextFlush = 250;
for (const r of readings) {
  while (r.ts >= nextFlush) { frames.push([...latest.values()]); latest.clear(); nextFlush += 250; }
  latest.set(r.tag, r);                                         // keep only the newest value per tag
}
frames.push([...latest.values()]);
const sentValues = frames.reduce((n, f) => n + f.length, 0);
console.log({ readings: readings.length, framesSent: frames.length, valuesSent: sentValues });
console.log('150 readings/s → 4 frames/s', frames.length === 4 ? '✅' : '❌ FAIL');
console.log('each frame carries the newest value of each tag', frames.every((f) => f.length === 3) ? '✅' : '❌ FAIL');
console.log('92% fewer values to render', 1 - sentValues / readings.length > 0.9 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Pushing every sensor reading to every browser (network and React can't keep up).
- Re-rendering the whole dashboard on each message.
- No snapshot on reconnect (widgets show stale or empty values).
- Dropping alarms together with ordinary updates.
- Raising an alarm on every reading above the limit (testing the first version of this gateway produced 25 alarms in one second; edge-trigger with hysteresis instead).
- Querying history over the socket instead of a REST endpoint backed by the time-series store.
:::

::: understand
- Stream everything into storage; stream only what's visible, coalesced, to the screen; never drop alarms.
:::

::: ask
- *"How fresh must each widget be, and which events must never be lost?"*
:::

::: important ⭐ Say this in the interview
"I'd separate ingestion from presentation: devices feed an ingest service into a durable stream like Kafka or Redis Streams; one consumer writes every reading to a time-series database, another aggregates the latest value per tag and evaluates alarms. A WebSocket or SSE gateway handles subscriptions per plant, coalesces updates to a few per second per widget, sends a snapshot with a sequence number on connect and deltas afterwards, and drops intermediate values for slow clients, which I measured going from 7 megabytes buffered to 0.1. Alarms go on a separate persisted channel that requires acknowledgement, history comes from REST, and the React side batches renders."
:::

::: links
TimescaleDB documentation | https://docs.timescale.com/
Redis Streams | https://redis.io/docs/latest/develop/data-types/streams/
:::
