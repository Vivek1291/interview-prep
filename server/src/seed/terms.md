=== libuv
@aliases libuv library
@summary The C library inside Node.js that runs the **event loop**, talks to the operating system for non-blocking network I/O, and keeps a small **thread pool** (4 threads) for file, DNS, crypto and zlib work.
::: text 🧒 In simple words
JavaScript in Node runs on **one thread**, like a single waiter in a restaurant. **libuv is the kitchen staff**: the waiter hands them slow jobs (read a file, wait for a network reply, hash a password) and keeps serving other tables. When a job is done, libuv puts a note on the counter (a **callback queue**) and the waiter picks it up as soon as his hands are free. That "check the counter" routine is the **event loop**, and libuv runs it.
:::

::: text 📖 What it is and how it works
**libuv** is a cross-platform C library that Node.js is built on (it was written for Node, and is now also used by other projects). It gives Node three things:

| Part | What it does | Used by |
|---|---|---|
| **Event loop** | Runs callbacks in phases: timers → pending → poll (I/O) → check (`setImmediate`) → close | every async callback |
| **OS async I/O** | Uses the kernel's own non-blocking APIs: **epoll** (Linux), **kqueue** (macOS), **IOCP** (Windows). No extra threads needed | TCP/HTTP sockets, pipes, DNS `resolve*` |
| **Thread pool** | 4 worker threads by default (`UV_THREADPOOL_SIZE`, max 1024) for work the OS can't do asynchronously | `fs.*`, `dns.lookup`, `crypto.pbkdf2/scrypt/randomBytes`, `zlib` |

### What happens when you call `fs.readFile`
1. Your JS calls `fs.readFile(path, cb)`; Node's C++ binding asks libuv to do it and **returns immediately**.
2. libuv gives the job to a **thread-pool thread**, which does the blocking `read()` system calls.
3. When the thread finishes, libuv puts your callback in the **poll** phase queue.
4. When the JS call stack is empty, the **event loop** runs `cb(err, data)`.

### What happens with an HTTP request (network)
Sockets are **not** handled by the thread pool: libuv registers them with **epoll/kqueue/IOCP** and the OS tells libuv when data arrives. That's why one Node process can hold **thousands of connections** with only a few threads.
:::

::: image libuv inside Node.js: event loop, OS async I/O for sockets, thread pool for files and crypto
/images/terms/libuv.svg
:::

::: diagram How a call travels through libuv
flowchart LR
  JS["Your JS: fs.readFile(cb)"] --> N["Node C++ binding"]
  N --> U["libuv"]
  U -->|"files, dns.lookup, crypto, zlib"| TP["Thread pool (4)"]
  U -->|"sockets"| OS["OS: epoll, kqueue, IOCP"]
  TP --> Q["Callback queue"]
  OS --> Q
  Q --> EL["Event loop: run cb when the stack is empty"]
  EL --> JS
:::

::: chart bar Measured: 8 × crypto.pbkdf2 (200k iterations) by thread-pool size, ms (Node 22, Apple M3 Pro)
UV_THREADPOOL_SIZE,Total time (ms)
1 thread,292
2 threads,155
4 threads (default),80
8 threads,51
:::

::: code javascript Watch the thread pool work (node pool.js)
// How to run: node pool.js        then try: UV_THREADPOOL_SIZE=1 node pool.js
const crypto = require('crypto');

const start = Date.now();
for (let i = 1; i <= 8; i++) {
  crypto.pbkdf2('secret', 'salt', 200000, 64, 'sha512', () => {
    console.log(`hash ${i} done after ${Date.now() - start} ms`);
  });
}
// With 4 threads you see the hashes finish in groups of 4: the first 4 together, then the next 4.
// With UV_THREADPOOL_SIZE=1 they finish one by one.
:::

::: tip 💡 Remember
- **"Node is single-threaded"** means *your JavaScript* runs on one thread; libuv uses more threads under the hood.
- Too many slow `fs`/`crypto` calls at once can **queue up behind 4 threads**: raise `UV_THREADPOOL_SIZE` (set it before Node starts) or move CPU work to Worker Threads.
- Network I/O doesn't use the pool, so it scales with connections, not threads.
:::

::: links
libuv design overview | https://docs.libuv.org/en/v1.x/design.html
Node.js: Don't block the event loop (thread pool section) | https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
Node.js: UV_THREADPOOL_SIZE | https://nodejs.org/api/cli.html#uv_threadpool_sizesize
:::

=== V8
@aliases V8 engine
@summary Google's JavaScript engine (used by Chrome and Node.js). It parses your code, compiles it to machine code with a JIT, manages the heap and runs the garbage collector.
::: text 📖 What it is
V8 turns JavaScript into machine code and runs it.
- **Ignition** (interpreter) starts running bytecode quickly.
- **Sparkplug / Maglev / TurboFan** (compilers) re-compile *hot* functions into faster machine code, using the types they have seen ("hidden classes" and inline caches).
- **Heap + garbage collector (Orinoco)**: objects live on the heap; a generational GC frees unreachable ones (young generation often, old generation rarely).

V8 knows nothing about files, sockets or timers: those come from the **host** (the browser, or Node via **libuv**).
:::

::: diagram From source to machine code
flowchart LR
  S["JS source"] --> P["Parser: AST"]
  P --> I["Ignition: bytecode"]
  I -->|"hot function"| T["Optimizing compilers: machine code"]
  T -->|"types changed: deopt"| I
:::

::: tip 💡 Remember
- Keep object shapes stable (same properties, same order) so V8 can optimize.
- Memory leaks in Node are V8 heap leaks: inspect with heap snapshots (`--inspect`, Chrome DevTools).
:::

::: links
V8 blog | https://v8.dev/blog
:::

=== Event loop
@aliases event-loop
@summary The routine that runs queued callbacks one at a time whenever the JavaScript call stack is empty, so one thread can handle many waiting operations.
::: text 📖 What it is
- Your code runs on a **call stack**. Async work (timers, I/O, network) finishes elsewhere and leaves a **callback** in a queue.
- When the stack is empty, the event loop takes the **next callback** and runs it.
- After every callback, all **microtasks** (Promise `.then`, `queueMicrotask`; in Node first `process.nextTick`) run before the next callback.
- In Node the loop has **phases** (timers → poll → check → close) and is implemented by **libuv**; in the browser it also schedules **rendering**.
:::

::: diagram One turn of the loop
flowchart LR
  S["Call stack empty?"] -->|"yes"| M["Run all microtasks"]
  M --> N["Take next callback (macrotask)"]
  N --> R["Run it on the stack"]
  R --> S
:::

::: code javascript Microtasks before macrotasks (runnable)
const order = [];
setTimeout(() => order.push('timeout'), 0);
Promise.resolve().then(() => order.push('promise'));
order.push('sync');
setTimeout(() => {
  console.log(order.join(' → '));
  console.log('sync → promise → timeout', order.join() === 'sync,promise,timeout' ? '✅' : '❌ FAIL');
}, 10);
:::

=== Thread pool
@aliases libuv thread pool, UV_THREADPOOL_SIZE
@summary libuv's 4 worker threads (by default) that run blocking work for Node: file system calls, dns.lookup, crypto (pbkdf2, scrypt, randomBytes) and zlib.
::: text 📖 What it is
Some operations have no non-blocking OS API (for example reading a file on most systems), so **libuv** runs them on a small pool of threads and queues the callback when they finish.
- Default size **4**; change with the `UV_THREADPOOL_SIZE` environment variable (set before Node starts).
- All pool users **share** the 4 threads: many slow `crypto.pbkdf2` calls can delay unrelated `fs.readFile` calls.
- Network sockets do **not** use the pool (they use epoll/kqueue/IOCP).
:::

::: tip 💡 Remember
For CPU-heavy JavaScript (not Node APIs) use **Worker Threads**: the libuv pool only runs Node's own C++ work.
:::

=== Microtask
@aliases microtasks, microtask queue
@summary A tiny job (Promise `.then`/`await` continuation, `queueMicrotask`, and in Node `process.nextTick`) that runs right after the current code, before the next timer, I/O callback or render.
::: text 📖 What it is
- **Macrotasks**: timers, I/O callbacks, `setImmediate`, UI events. One runs per loop turn.
- **Microtasks**: run **all at once** after the current macrotask (and after each callback in Node).
- Order in Node: `process.nextTick` queue first, then the Promise microtask queue.
- Danger: a microtask that keeps scheduling microtasks **starves** the event loop (no I/O, no rendering).
:::

=== Non-blocking I/O
@aliases non blocking I/O, asynchronous I/O
@summary Starting an input/output operation (file, network, database) and continuing with other work instead of waiting; the result arrives later through a callback, promise or event.
::: text 📖 What it is
Blocking: the thread **waits** until the disk or network answers. Non-blocking: the thread **starts** the operation, moves on, and is told when it's done. Node uses non-blocking I/O everywhere (through **libuv**), which is why one thread can serve thousands of requests: most of a web request's time is spent *waiting*, not computing.
:::

=== Stream
@aliases streams, Node.js stream
@summary An object that processes data piece by piece (chunks) instead of loading it all into memory: Readable, Writable, Duplex and Transform streams, connected with `pipeline()`.
::: text 📖 What it is
- **Readable** (file read, HTTP request body), **Writable** (file write, HTTP response), **Duplex** (TCP socket), **Transform** (gzip).
- Memory stays small and constant even for huge files, and the first bytes arrive sooner.
- Use `stream.pipeline(a, b, c, cb)` (or `stream/promises`) so errors and cleanup are handled, and **backpressure** works.
:::

=== Backpressure
@aliases back-pressure
@summary The signal that a consumer can't keep up, so the producer must pause: in Node, `write()` returns false and you wait for the 'drain' event (`pipeline()` does this for you).
::: text 📖 What it is
If a fast source (a file) writes into a slow destination (a slow network client), data piles up in memory. Streams solve this with **backpressure**: `writable.write()` returns `false` when its buffer is above `highWaterMark`; the readable pauses until the writable emits **'drain'**. `pipe()`/`pipeline()` handle it automatically; hand-written `on('data')` loops usually forget it and leak memory.
:::

=== CORS
@aliases cross-origin resource sharing
@summary A browser rule: a page from one origin may read a response from another origin only if that server allows it with `Access-Control-Allow-*` headers (with a preflight OPTIONS request for non-simple requests).
::: text 📖 What it is
- **Origin** = scheme + host + port (`https://app.com` and `https://api.app.com` are different).
- The browser sends the request, but **hides the response** from JavaScript unless the server answers with `Access-Control-Allow-Origin` matching the page (and `Access-Control-Allow-Credentials: true` for cookies).
- "Non-simple" requests (JSON body, custom headers, PUT/DELETE) first send a **preflight** `OPTIONS` request.
- CORS protects **users' browsers**, not your server: curl and Postman ignore it.
:::

::: diagram Preflight then the real request
sequenceDiagram
  participant B as Browser (app.com)
  participant A as API (api.app.com)
  B->>A: OPTIONS /orders (Origin, method, headers)
  A-->>B: 204 Allow-Origin: app.com, Allow-Methods: POST
  B->>A: POST /orders
  A-->>B: 201 + Allow-Origin: app.com
:::

=== Idempotent
@aliases idempotency, idempotent request
@summary An operation you can repeat any number of times with the same effect as doing it once (GET, PUT, DELETE are idempotent; POST usually is not, unless you add an idempotency key).
::: text 📖 What it is
Networks fail and clients retry. If a retried request is **idempotent**, retrying is safe.
| Method | Idempotent? | Why |
|---|---|---|
| GET | yes | only reads |
| PUT | yes | "set the resource to this" twice = same result |
| DELETE | yes | the second delete finds nothing to delete |
| POST | no | "create an order" twice = two orders |
Make POST safe with an **Idempotency-Key** header: the server stores the key with the first result and returns the same result for repeats.
:::

=== JWT
@aliases JSON Web Token, JSON web tokens
@summary A signed token `header.payload.signature` (Base64URL) that carries claims like the user id and expiry; the server verifies the signature instead of looking up a session. Signed, not encrypted.
::: text 📖 What it is
- **Header**: algorithm (e.g. HS256). **Payload**: claims (`sub`, `role`, `exp`). **Signature**: proves nobody changed the first two parts.
- Anyone can **read** the payload (Base64URL), so never put secrets in it.
- Hard to revoke before it expires: keep **access tokens short** (minutes) and use a **refresh token** (httpOnly cookie, rotated) for new ones, the way this app does.
:::

=== CSRF
@aliases cross-site request forgery
@summary An attack where another website makes the user's browser send a request to your site with the user's cookies attached; prevented with SameSite cookies, CSRF tokens or by not using cookies for auth.
::: text 📖 What it is
Browsers attach cookies automatically, even when the request starts from `evil.com`. If your API trusts cookies alone, `evil.com` can submit a form that transfers money as the logged-in user.
Defenses: `SameSite=Lax/Strict` cookies, a **CSRF token** the attacker can't read, checking `Origin`, or sending auth in an `Authorization` header (which other sites can't add).
:::

=== Database index
@aliases index, DB index, indexes
@summary A sorted lookup structure (usually a B-tree) on one or more fields that lets the database find matching documents/rows without scanning the whole collection/table, at the cost of extra writes and storage.
::: text 📖 What it is
Without an index, a query on `email` reads **every** document (COLLSCAN). With an index, the database walks a B-tree to the matching entries (IXSCAN) in O(log n).
- Compound index order matters: **Equality, Sort, Range** (ESR rule).
- Every index slows down inserts/updates a little and uses RAM.
- Check with `explain('executionStats')`: compare `totalDocsExamined` to `nReturned`.
:::

=== ACID
@aliases ACID transactions
@summary The four guarantees of a database transaction: Atomicity (all or nothing), Consistency (rules stay valid), Isolation (concurrent transactions don't see each other's half-done work) and Durability (committed data survives crashes).
::: text 📖 What it is
| Letter | Means | Example |
|---|---|---|
| **A**tomicity | all steps happen or none | debit and credit both, or neither |
| **C**onsistency | constraints hold before and after | balance never negative |
| **I**solation | concurrent transactions don't interfere | two transfers don't read a half-updated balance |
| **D**urability | committed = saved | survives a power cut (write-ahead log) |
MongoDB gives single-document atomicity always, and multi-document ACID transactions on replica sets.
:::

=== JSX
@aliases JSX syntax
@summary HTML-like syntax for describing React UI inside JavaScript; a compiler turns `<Button size="lg">Hi</Button>` into a function call that creates a React element object.
::: text 📖 What it is
JSX is **not** HTML and not a string: since React 17 the compiler turns it into `jsx(Button, { size: 'lg', children: 'Hi' })` (older: `React.createElement`). Curly braces hold any JS **expression**; `className` instead of `class`; `htmlFor` instead of `for`; one parent element (or a Fragment `<>…</>`).
:::

::: code jsx What the compiler produces
// You write:
const el = <Button size="lg" onClick={save}>Save</Button>;

// The compiler (automatic runtime) produces roughly:
// import { jsx } from 'react/jsx-runtime';
// const el = jsx(Button, { size: 'lg', onClick: save, children: 'Save' });
// …which returns a plain object: { type: Button, props: { size: 'lg', onClick: save, children: 'Save' }, key: null }
:::

=== Virtual DOM
@aliases VDOM, virtual-dom
@summary The tree of plain React element objects your components return; React compares the new tree with the previous one and changes only the parts of the real DOM that differ.
::: text 📖 What it is
Creating JS objects is cheap; touching the real DOM (layout, paint) is expensive. On every render React builds a new element tree, **diffs** it against the last one (**reconciliation**) and applies the minimal set of DOM changes in the **commit** phase. The real benefit is the *programming model* (describe the UI for any state, React works out the updates), not raw speed.
:::

=== Reconciliation
@aliases diffing, React diffing
@summary React's process of comparing the new element tree with the previous one to decide which components to keep, update or remount, using two rules: a different type means a new subtree, and keys identify list items.
::: text 📖 What it is
Two heuristics make diffing O(n) instead of O(n³):
1. **Different element type** (`<div>` → `<span>`, `<A>` → `<B>`) → throw away the old subtree (state is lost) and build a new one.
2. **Same type** → keep the DOM node / component instance (state kept) and update its props.
3. In lists, **keys** tell React which item is which; with index keys, reordering mixes up state.
:::

=== React Fiber
@aliases Fiber, fiber architecture
@summary React's internal engine (since React 16): every component instance is a "fiber" node, and rendering is split into small units of work that can be paused, prioritised and resumed (the basis of concurrent features like transitions and Suspense).
::: text 📖 What it is
Before Fiber, rendering was one uninterruptible recursive call. Fiber turns the tree into a linked list of work units so React can:
- **pause** rendering to handle a keystroke (urgent) and continue later,
- give updates **priorities** (lanes): user input before transitions,
- keep two trees (current and work-in-progress) and **commit** only when a render is complete.
The **render phase** can be interrupted; the **commit phase** (DOM changes, effects) never is.
:::

=== Hydration
@aliases hydrate, hydrateRoot
@summary Making server-rendered HTML interactive in the browser: React renders the same components, matches them to the existing DOM and attaches event handlers instead of re-creating the DOM.
::: text 📖 What it is
SSR sends ready HTML (fast first paint), but buttons don't work until JavaScript loads and React **hydrates** with `hydrateRoot`. The client render must produce the **same output** as the server, otherwise you get a hydration mismatch (e.g. using `Date.now()` or `window` during render). With Suspense, React 18+ hydrates parts **selectively**, starting with what the user clicks.
:::

=== React transition
@aliases startTransition, useTransition, React transitions
@summary A non-urgent state update (wrapped in `startTransition`) that React may interrupt and render in the background, so urgent updates like typing stay responsive.
::: text 📖 What it is
Typing in an input must update instantly; re-rendering a 5,000-row filtered list doesn't. Mark the second as a transition:
`startTransition(() => setQuery(value))`. React renders it at lower priority, can **abandon** it if a newer update arrives, and `useTransition` gives you `isPending` to show a subtle loading state. In React 19, async functions in transitions are called **Actions**.
:::

=== Memoization
@aliases memoisation, memoize
@summary Caching a function's result for given inputs so repeated calls are free; in React, `React.memo`, `useMemo` and `useCallback` (or the React Compiler) skip re-renders and recalculations when inputs didn't change.
::: text 📖 What it is
- **Pure function memo**: `fib(40)` computed once, then read from a Map.
- **React**: `React.memo(Component)` skips re-rendering when props are shallow-equal; `useMemo` caches a value; `useCallback` caches a function identity so memoized children don't re-render.
- It costs memory and comparisons: memoize expensive work or things passed to memoized children, not everything. React Compiler 1.0 does it automatically.
:::

=== React Server Components
@aliases RSC, Server Components, server component
@summary Components that run only on the server (or at build time): they can read databases and files directly, send zero JavaScript to the browser, and pass data to interactive Client Components marked with `'use client'`.
::: text 📖 What it is
- Default in frameworks like Next.js App Router. Can be `async` and `await` data directly.
- Their code never ships to the browser; the client receives a serialized result (the RSC payload).
- Cannot use state, effects or browser APIs: put those in a **Client Component** (`'use client'` at the top of the file).
- **Server Functions** (`'use server'`) let the client call server code (e.g. a form action).
:::

=== Closure
@aliases closures
@summary A function together with the variables of the scope where it was created; it keeps access to them even after the outer function has returned.
::: code javascript A counter that remembers its count (runnable)
function makeCounter() {
  let count = 0;                         // lives on after makeCounter returns
  return () => ++count;
}
const next = makeCounter();
next(); next();
console.log('closure remembers count', next() === 3 ? '✅' : '❌ FAIL');
:::

=== Hoisting
@aliases hoisted
@summary JavaScript registers declarations before running the code: `function` declarations are fully available early, `var` exists as `undefined`, and `let`/`const`/`class` exist but throw if used before their line (temporal dead zone).
::: code javascript What is hoisted (runnable)
const results = [];
results.push(typeof hoistedFn);          // 'function': fully hoisted
results.push(typeof v);                  // 'undefined': var is hoisted without its value
try { results.push(l); } catch (e) { results.push(e.name); }   // ReferenceError: TDZ
function hoistedFn() {}
var v = 1;
let l = 2;
console.log(results.join(', '));
console.log('function, undefined, ReferenceError', results.join() === 'function,undefined,ReferenceError' ? '✅' : '❌ FAIL');
:::

=== Debounce
@aliases debouncing, debounced
@summary Run a function only after calls have **stopped** for N ms (e.g. search after the user stops typing); every new call restarts the timer.
::: code javascript Debounce in 6 lines (runnable)
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
let calls = 0;
const search = debounce(() => calls++, 30);
search(); search(); search();            // typing fast
setTimeout(() => console.log('3 quick calls → 1 run', calls === 1 ? '✅' : '❌ FAIL'), 80);
:::

=== Throttle
@aliases throttling, throttled
@summary Run a function **at most once every N ms** while calls keep coming (e.g. a scroll or resize handler), instead of on every event.
::: code javascript Throttle (runnable)
function throttle(fn, ms) {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
}
let runs = 0;
const onScroll = throttle(() => runs++, 50);
for (let i = 0; i < 100; i++) onScroll();   // 100 events in ~0 ms
console.log('100 events → 1 run', runs === 1 ? '✅' : '❌ FAIL');
:::

=== Temporal dead zone
@aliases TDZ, temporal dead zone (TDZ)
@summary The time between entering a scope and the line where a `let`, `const` or `class` is declared: the variable already exists but reading or writing it throws a `ReferenceError`.
::: code javascript Reading a let before its line (runnable)
let error = '';
try { console.log(total); } catch (e) { error = e.name; }
let total = 10;
console.log('TDZ → ReferenceError', error === 'ReferenceError' && total === 10 ? '✅' : '❌ FAIL');
:::

=== Prototype chain
@aliases prototypal inheritance, [[Prototype]]
@summary The linked list of objects JavaScript follows when a property isn't found on an object: object → its prototype → that prototype's prototype … → `Object.prototype` → `null`.
::: code javascript Lookup walks the chain (runnable)
const animal = { eat() { return 'eating'; } };
const dog = Object.create(animal);
dog.bark = () => 'woof';
console.log('own, inherited, missing', dog.bark() === 'woof' && dog.eat() === 'eating' && dog.fly === undefined ? '✅' : '❌ FAIL');
console.log('chain ends at null', Object.getPrototypeOf(Object.getPrototypeOf(animal)) === null ? '✅' : '❌ FAIL');
:::

=== Type coercion
@aliases implicit conversion, coercion
@summary JavaScript automatically converting a value to another type: `+` with a string makes strings (`"3" + 4` → `"34"`), other maths makes numbers (`"3" - 4` → `-1`), and conditions make booleans (truthy/falsy).
::: code javascript Coercion in one line each (runnable)
console.log('"3" + 4 = "34"', '3' + 4 === '34' ? '✅' : '❌ FAIL');
console.log('"3" - 4 = -1', '3' - 4 === -1 ? '✅' : '❌ FAIL');
console.log('[] is truthy', Boolean([]) ? '✅' : '❌ FAIL');
:::

=== Currying
@aliases curry, curried function
@summary Turning `f(a, b, c)` into `f(a)(b)(c)`: each call takes one argument and returns a function waiting for the next, until all arguments have arrived.
::: code javascript Curried add (runnable)
const add = (a) => (b) => (c) => a + b + c;
const add10 = add(10);                     // partial application
console.log('add(1)(2)(3) = 6', add(1)(2)(3) === 6 && add10(1)(2) === 13 ? '✅' : '❌ FAIL');
:::

=== IIFE
@aliases immediately invoked function expression
@summary A function expression that runs as soon as it's defined, `(function () { … })()`, giving code a private scope that doesn't leak variables into the global scope.
::: code javascript Private scope (runnable)
const counter = (() => { let n = 0; return { inc: () => ++n }; })();
counter.inc();
console.log('state is private', counter.inc() === 2 && counter.n === undefined ? '✅' : '❌ FAIL');
:::

=== Polyfill
@aliases polyfills, shim
@summary Code that implements a newer built-in feature (like `Array.prototype.flat` or `Promise.allSettled`) for environments that don't have it, usually by checking first: `if (!Array.prototype.flat) { … }`.
::: code javascript Add a method only when it's missing (runnable)
if (!Array.prototype.myLast) {
  Object.defineProperty(Array.prototype, 'myLast', { value() { return this[this.length - 1]; }, writable: true, configurable: true });
}
console.log('polyfilled method works and is not enumerable', [1, 2, 3].myLast() === 3 && !Object.keys([]).includes('myLast') ? '✅' : '❌ FAIL');
:::

=== Critical rendering path
@aliases CRP, rendering pipeline
@summary The browser's steps from bytes to pixels: HTML → DOM, CSS → CSSOM, render tree, layout, paint, composite. CSS blocks rendering and a classic `<script>` blocks parsing.
::: diagram Bytes to pixels
flowchart LR
  H["HTML → DOM"] --> R["Render tree"]
  C["CSS → CSSOM"] --> R
  R --> L["Layout"]
  L --> P["Paint"]
  P --> CO["Composite"]
:::

=== Reflow
@aliases reflow and repaint, layout thrashing
@summary Recalculating the size and position of elements after a geometry change (width, font-size, adding nodes). Reading layout values like `offsetWidth` right after a write forces a synchronous reflow; doing that in a loop is **layout thrashing**.
::: text 📖 Cheapest to most expensive
- `transform`, `opacity` → composite only.
- `color`, `background` → repaint.
- `width`, `top`, DOM changes → reflow + repaint.
- Batch reads first, then writes, to avoid thrashing (measured 106 ms → 1.8 ms on 1,000 elements).
:::

=== Event delegation
@aliases delegated events, event bubbling
@summary Handling events for many child elements with one listener on a parent, using bubbling and `event.target.closest(selector)`; it also works for elements added later.
::: code javascript Find the clicked item from the parent (runnable)
const tree = { name: 'li', parent: { name: 'ul', parent: null } };
const icon = { name: 'svg', parent: tree };
const closest = (node, name) => { for (let n = node; n; n = n.parent) if (n.name === name) return n; return null; };
console.log('click on an icon resolves to its li', closest(icon, 'li') === tree ? '✅' : '❌ FAIL');
:::

=== Garbage collection
@aliases GC, garbage collector, mark and sweep
@summary The engine automatically frees heap memory that is no longer **reachable** from the roots (globals, the call stack). Anything still referenced, such as a forgotten listener or cache entry, stays in memory: that's a leak.
::: text 📖 Remember
- V8 uses generational **mark-and-sweep**: mark everything reachable, free the rest; cycles are fine.
- Leaks = accidental references: listeners, intervals, growing Maps, detached DOM nodes, closures over big data.
- Use `WeakMap` for per-object metadata, and remove listeners in cleanup.
:::

=== Web Vitals
@aliases Core Web Vitals, LCP, INP, CLS
@summary Google's user-experience metrics: **LCP** (loading, good ≤ 2.5 s), **INP** (responsiveness, good ≤ 200 ms) and **CLS** (visual stability, good ≤ 0.1), measured at the 75th percentile of real users.
::: text 📖 Quick fixes
- LCP: fast server, preload + `fetchpriority="high"` for the hero image, no render-blocking resources.
- INP: break up long tasks, less JavaScript per interaction.
- CLS: set width/height on images, reserve space for dynamic content.
:::

=== Generics
@aliases generic type, type parameter
@summary TypeScript type parameters like `<T>` that let one function, type or component work with many types while keeping the link between input and output: `first<T>(items: T[]): T | undefined`.
::: code javascript The runtime half of a generic helper (runnable)
const first = (items) => items[0];          // in TS: function first<T>(items: T[]): T | undefined
console.log('works for any element type', first([1, 2]) === 1 && first(['a']) === 'a' && first([]) === undefined ? '✅' : '❌ FAIL');
:::

=== Type guard
@aliases type predicate, narrowing
@summary A check that tells TypeScript which member of a union a value is (`typeof`, `instanceof`, `in`, a discriminant, or a custom `isUser(v): v is User` function), so the code after it can safely use that type.
::: code javascript A custom guard (runnable)
const isUser = (v) => typeof v === 'object' && v !== null && typeof v.email === 'string';
console.log('accepts users, rejects other values', isUser({ email: 'a@b.c' }) && !isUser(null) && !isUser('x') ? '✅' : '❌ FAIL');
:::

=== Server Actions
@aliases server action, Server Functions, use server
@summary Async functions marked `'use server'` that run on the server and can be called from forms and Client Components in Next.js/React, for mutations without writing an API route. Each one is a public endpoint, so validate input and check permissions inside it.
::: text 📖 Remember
- `<form action={createTodo}>` works even before JavaScript loads.
- Client helpers: `useActionState`, `useFormStatus`, `useOptimistic`.
- After writing data, call `updateTag`/`revalidatePath` so the UI shows fresh data.
:::

=== Partial Prerendering
@aliases PPR, partial prerender, Cache Components
@summary Next.js rendering where a static shell (everything cached or synchronous) is served instantly and the dynamic parts, wrapped in `<Suspense>`, stream in during the same request. In Next.js 16 it comes with Cache Components (`cacheComponents: true`, `'use cache'`).
::: text 📖 Measured
- Static shell (with the loading fallback) first byte: 5.1 ms.
- The 400 ms dynamic part arrived at 416 ms in the same response.
:::

=== Test double
@aliases test doubles, stub
@summary Anything that stands in for a real dependency in a test: a stub returns canned answers, a spy records calls, a mock verifies expected interactions, a fake is a working lightweight implementation (in-memory DB, MSW server, fake timers).
::: code javascript A hand-made spy (runnable)
const spy = (impl) => { const f = (...a) => { f.calls.push(a); return impl(...a); }; f.calls = []; return f; };
const send = spy(() => 'ok');
send('asha@x.com');
console.log('the spy recorded the call', send.calls.length === 1 && send.calls[0][0] === 'asha@x.com' ? '✅' : '❌ FAIL');
:::

=== Flaky test
@aliases flaky tests, flakiness
@summary A test that sometimes passes and sometimes fails without any code change, usually because it guesses timing (fixed sleeps), shares state with other tests, depends on order, real time or a real network service.
::: text 📖 Fix the cause
- Wait for conditions (`findBy`, Playwright web-first assertions), not for time: a fixed 200 ms wait failed 10/10 runs, an auto-waiting assertion passed 10/10.
- Unique data per test, fake time, mock third parties.
- Retries are for collecting traces, not for hiding the problem.
:::

=== XSS
@aliases cross-site scripting, cross site scripting
@summary Cross-site scripting: attacker-controlled JavaScript running on your origin (via `innerHTML`, `dangerouslySetInnerHTML`, unsafe URLs or third-party scripts). React escapes `{value}` by default; sanitize HTML with DOMPurify and add a CSP.
::: code javascript Escaping turns markup into text (runnable)
const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));
console.log('payload becomes harmless text', escape('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;' ? '✅' : '❌ FAIL');
:::

=== Content Security Policy
@aliases CSP, Content-Security-Policy
@summary An HTTP response header listing which sources of scripts, styles, images, frames and connections a page may use; a strict nonce-based policy blocks injected inline scripts and event handlers even when an XSS bug exists.
::: text 📖 Measured
- Without CSP an `innerHTML` XSS payload executed in Chrome; with `script-src 'self' 'nonce-…'` it was blocked (1 violation event) while the page's own nonce script ran.
- Roll out with `Content-Security-Policy-Report-Only` first.
:::

=== Clickjacking
@aliases UI redressing, frame-ancestors
@summary Tricking users into clicking your page loaded in an invisible iframe on another site. Prevent it with `Content-Security-Policy: frame-ancestors 'none'` (or an allow-list) and `X-Frame-Options: DENY`.
::: text 📖 Measured
- Without headers the page loaded inside the attacker's iframe with its buttons; with `frame-ancestors 'none'` Chrome refused to render it.
:::

=== Compositing
@aliases compositor, compositor thread, rasterization
@summary The last rendering step: rasterized layers (pixel tiles) are combined into the frame on the GPU by the compositor thread. Animating `transform`/`opacity` on a layer skips layout and paint (measured: 1 layout vs 62 for `left` in a 1 s animation).
::: text 📖 Pipeline
- Style → Layout (where) → Paint (what) → Rasterize (pixels) → Composite (layers → screen).
:::

=== HMAC
@aliases createHmac, keyed hash
@summary Hash-based message authentication code: a hash computed with a secret key, so only someone who knows the key can produce it. Used for webhook signatures and signed cookies; compare it with `crypto.timingSafeEqual`.
::: code javascript A naive comparison leaks progress (runnable)
const naiveSteps = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
console.log('more correct leading characters → more work → measurable time', naiveSteps('9f86d081', '9f86d000') > naiveSteps('9f86d081', '00000000') ? '✅' : '❌ FAIL');
:::

=== Semver
@aliases semantic versioning, caret range, tilde range
@summary Versions written as MAJOR.MINOR.PATCH: major = breaking change, minor = new feature, patch = bug fix. In package.json, `^5.1.0` allows 5.x updates and `~5.1.0` only 5.1.x; the lockfile pins what was actually installed.
::: text 📖 Ranges
- `^5.1.0` → `>=5.1.0 <6.0.0` (for `0.x` the caret only allows patches).
- `~5.1.0` → `>=5.1.0 <5.2.0`.
- `5.1.0` → exactly that version.
:::

=== Path traversal
@aliases directory traversal, dot-dot-slash
@summary An attack where user input like `../../etc/passwd` makes the server read or write files outside the intended folder. Resolve the full path and only allow it if it starts with the base folder plus the path separator.
::: text 📖 Defence
- Prefer ids mapped to stored file names over user-supplied names.
- `path.resolve(BASE, name)` then check `startsWith(BASE + path.sep)`.
- `res.sendFile(name, { root })` and `express.static` do this check for you.
:::

=== ETag
@aliases entity tag, If-None-Match, 304 Not Modified
@summary A version identifier the server sends with a response. The client sends it back in `If-None-Match`; if nothing changed the server answers `304 Not Modified` with no body (measured: 15,791 bytes → 0 bytes).
::: text 📖 How it works
- Response: `ETag: "v1"` plus `Cache-Control: no-cache` (revalidate every time).
- Next request: `If-None-Match: "v1"` → `304` if still current, otherwise `200` with the new body and a new ETag.
- Express adds ETags to `res.json`/`res.send` automatically.
:::

=== Mass assignment
@aliases over-posting, auto-binding
@summary Copying a request body straight into a model so attackers can set fields they shouldn't (`role`, `isAdmin`, `ownerId`). Prevent it with allow-list schemas per operation and by only using the validated output.
::: text 📖 Example
- `User.updateOne({ _id }, req.body)` with `{ "role": "admin" }` → privilege escalation.
- Zod strips unknown keys by default (`.strict()` rejects them); Joi rejects them; Ajv rejects them with `additionalProperties: false`.
:::

=== Keep-alive
@aliases HTTP keep-alive, persistent connection, connection reuse
@summary Reusing one TCP/TLS connection for many HTTP requests instead of opening a new one each time, which skips the TCP and TLS handshakes (measured on localhost: 0.999 ms per HTTPS request with new connections vs 0.134 ms reused).
::: text 📖 In Node.js
- Use one shared `http.Agent({ keepAlive: true })` or `fetch` (undici pools connections by default).
- Over a 50 ms network, each avoided handshake saves about 100 ms.
:::

=== N+1 query problem
@aliases N+1, N+1 queries, N plus 1
@summary Loading a list with one query and then running one more query per row for related data. Measured on PostgreSQL: 100 orders with their users took 20.7 ms and 101 queries, vs 0.53 ms with one JOIN.
::: text 📖 Fixes
- JOIN, ORM `include`/`populate`, or a second batched query `WHERE id = ANY($1)`.
- DataLoader batches loads made in the same tick (GraphQL).
- Detect it by counting queries per request.
:::

=== Connection pool
@aliases connection pooling, pool size, PgBouncer
@summary A set of open database connections reused across queries, so each query skips the connection handshake (measured: 0.24 ms pooled vs 6.53 ms with a new connection) and concurrency is capped.
::: text 📖 Sizing
- `instances × pool max` must fit the database's `max_connections`; use PgBouncer or RDS Proxy when it doesn't.
- CPU-bound queries stop scaling around the database's core count.
:::

=== MVCC
@aliases multi-version concurrency control, row versions, VACUUM
@summary Multi-version concurrency control: updates write new row versions instead of overwriting, so each transaction reads a consistent snapshot and readers don't block writers. Old versions are cleaned up by VACUUM (measured: 20 updates grew a 360 KB table to 7.4 MB until vacuumed).
::: text 📖 Remember
- PostgreSQL and MongoDB (WiredTiger) both use MVCC-style snapshots.
- Long-running transactions keep old versions alive → bloat.
:::

=== Isolation level
@aliases transaction isolation, read committed, repeatable read, serializable
@summary How much concurrent transactions can see of each other. PostgreSQL defaults to READ COMMITTED; REPEATABLE READ uses one snapshot; SERIALIZABLE behaves as if transactions ran one at a time and aborts conflicting ones with error 40001 (retry them).
::: text 📖 Measured anomalies
- READ COMMITTED: read 50 then 45 within one transaction and overwrote a concurrent change.
- REPEATABLE READ allowed write skew; SERIALIZABLE prevented it.
:::

=== WebSocket
@aliases WebSockets, ws, wss
@summary A protocol that upgrades one HTTP connection (`101 Switching Protocols`) into a persistent, two-way channel of small frames. Measured: a 20-byte message costs 22 bytes server → client and 26 bytes client → server.
::: text 📖 Remember
- Authenticate during the upgrade and check `Origin`.
- Heartbeats (ping/pong) detect clients that vanished; reconnect with backoff + jitter.
- Several instances need a shared bus (Redis pub/sub) for broadcasts.
:::

=== Server-Sent Events
@aliases SSE, EventSource, text/event-stream
@summary A long-lived HTTP response (`text/event-stream`) the server keeps writing events to; the browser's `EventSource` reconnects automatically and resumes with `Last-Event-ID`. Ideal for one-way updates like notifications and dashboards.
::: text 📖 Measured
- In Chrome, after the server cut the stream every 3 events, EventSource reconnected 4 times and received all 9 events in order without duplicates.
:::

=== Pub/sub
@aliases publish-subscribe, publish/subscribe, Redis pub/sub
@summary Publishers send messages to a channel without knowing who listens; every current subscriber receives a copy. Fire-and-forget: subscribers that are offline miss messages (use streams or queues when delivery must be durable).
::: text 📖 Example
- Two WebSocket instances with the Redis adapter: a room message emitted on instance A reached the client on instance B (50/50 vs 0/50 without it).
:::

=== Cache-aside
@aliases lazy loading cache, cache aside
@summary The most common caching pattern: read the cache; on a miss load from the database and store the result with a TTL; on writes update the database and delete the key. Measured: an expensive report endpoint went from 50 to 13,199 requests per second.
::: text 📖 Remember
- Delete (don't update) the key on writes.
- A slow reader can write an old value back after the delete: keep TTLs or use versions.
:::

=== Cache stampede
@aliases thundering herd, dog-pile effect
@summary Many requests rebuilding the same expired cache key at once. Measured: 200 concurrent requests on a cold key sent 200 heavy queries and 185 failed; single-flight plus a Redis lock made it 1 query.
::: text 📖 Fixes
- Single-flight per process, a lock per key, stale-while-revalidate, refresh-ahead, TTL jitter.
:::

=== Distributed lock
@aliases Redis lock, SET NX, Redlock
@summary A lock shared by several processes, usually `SET key token NX PX ttl` in Redis with a token-checked release. Good for avoiding duplicate work (measured: 20 instances → 1 job run); for correctness add database constraints or fencing tokens.
::: text 📖 Remember
- Never release with a blind `DEL`: it can delete another holder's lock after yours expired.
:::

=== Token bucket
@aliases token bucket algorithm, leaky bucket
@summary A rate-limiting algorithm: a bucket holds up to N tokens that refill at a fixed rate; each request takes one token. Allows short bursts but enforces the average rate (measured: 10 of 20 requests allowed across a window boundary, vs 20 of 20 with a fixed window).
::: text 📖 In Redis
- Implemented as a small Lua script so the check-and-update is atomic across instances.
:::

=== Transactional outbox
@aliases outbox pattern, outbox
@summary Writing an event into an outbox table in the same database transaction as the business change, then publishing it from a relay with retries. Solves the dual-write problem (measured: commit-then-publish lost 10 of 100 events; the outbox lost none).
::: text 📖 Remember
- Publishing is at-least-once, so consumers dedupe by event id.
- Relays: polling with `FOR UPDATE SKIP LOCKED`, LISTEN/NOTIFY, or CDC (Debezium).
:::

=== Dead-letter queue
@aliases DLQ, dead letter queue, failed set
@summary Where messages go after their last failed attempt (BullMQ failed set, SQS DLQ, RabbitMQ dead-letter exchange), so poison messages don't block the queue and humans can inspect, fix and replay them.
::: text 📖 Remember
- Alert when it is non-empty; fail permanent errors there immediately instead of retrying.
:::

=== At-least-once delivery
@aliases at least once, at-most-once, exactly-once
@summary The usual queue guarantee: a message is acknowledged only after processing, so a crash leads to redelivery and possible duplicates. Measured: a worker killed after charging a customer caused a second charge unless the consumer was idempotent.
::: text 📖 Remember
- At-most-once acks first and may lose messages; "exactly once" in practice means at-least-once plus idempotent consumers.
:::

=== Worker threads
@aliases worker_threads, worker pool, piscina
@summary Separate V8 isolates inside one Node process that run JavaScript in parallel on other cores. Use them (in a pool) for CPU-heavy work; measured 8 CPU tasks at 435 ms on the main thread vs 115 ms in 8 workers, and a pool raised a CPU endpoint from 807 to 4,654 req/s.
::: text 📖 Remember
- Messages are copied; transfer ArrayBuffers to avoid copies (100 MB: 72 ms copied vs 1.2 ms transferred).
- Don't start a worker per request (about 12 ms each).
:::

=== Memory leak
@aliases memory leaks, heap snapshot, leak
@summary Memory that stays reachable after it's no longer needed, so garbage collection can't free it and the heap grows until the process crashes. Measured: an unbounded Map cache grew from 3.7 to 88.6 MB over 200,000 requests; a bounded LRU stayed at 6.2 MB.
::: text 📖 Finding it
- Compare heap snapshots before and after load; follow the retainers of the objects that grew.
- Usual causes: unbounded caches, listeners and timers never removed, closures holding large objects.
:::

=== AsyncLocalStorage
@aliases async local storage, request context, async_hooks
@summary A Node.js API that keeps a value (like a request id) for the whole async call chain of one request, so loggers deep in services can read it without passing it around. Measured overhead on a trivial route: about 10%.
::: text 📖 Use for
- Request/correlation ids, user and tenant ids, trace context (pino mixins, OpenTelemetry).
:::

=== Graceful shutdown
@aliases graceful termination, SIGTERM handling, draining
@summary Handling SIGTERM by failing readiness, stopping new connections, finishing in-flight work, closing pools and connections, then exiting. Measured: idle keep-alive sockets made server.close() take 7.3 s until idle connections were closed after each response (1.3 s).
::: text 📖 Remember
- Fail readiness before closing the listener so the load balancer stops routing first.
- The grace period must exceed the drain time; jobs must still be idempotent.
:::

=== Docker image
@aliases container image, Docker images
@summary An immutable, layered package of OS files, the runtime, dependencies, app code and the start command. Containers are running instances of it. Measured: the same Node API image went from 1.86 GB to 231 MB with a multi-stage build on a small base.
::: text 📖 Remember
- Build once in CI, tag with the git SHA, promote the same image through every environment.
- Layer order decides the cache: package files and npm ci before the source.
:::

=== Multi-stage build
@aliases multi-stage Dockerfile, multi-stage builds
@summary A Dockerfile with several FROM stages: a build stage with dev dependencies and compilers, and a small runtime stage that copies only the compiled output and production dependencies.
::: text 📖 Remember
- Use COPY --from=build to move only dist/ into the runtime stage.
- Compilers, dev dependencies and caches never reach production.
:::

=== Continuous integration
@aliases CI pipeline, CI/CD
@summary Automatically installing, linting, testing and building every push and pull request so problems surface within minutes. Continuous delivery keeps main always deployable; continuous deployment ships every green build automatically.
::: text 📖 Remember
- Cheapest checks first, independent jobs in parallel, dependencies cached (measured npm ci 10.8 s → 2.1 s).
- Build the artifact once and promote it; rollback = redeploy the previous tag.
:::

=== Blue-green deployment
@aliases blue/green deployment
@summary Running a full new copy of the system next to the current one and switching all traffic at once, keeping the old copy for an instant rollback.
::: text 📖 Remember
- Costs double capacity during the switch.
- The database is shared, so schema changes must work for both versions (expand and contract).
:::

=== Canary release
@aliases canary deployment, canary rollout
@summary Sending a small percentage of traffic to a new version, comparing its error rate and latency with the stable version, then promoting it step by step or rolling back automatically.
::: text 📖 Remember
- Needs metrics split by version.
- Limits the blast radius of a bad release to a few percent of users.
:::

=== Feature flag
@aliases feature toggle, feature flags
@summary A runtime switch that turns code paths on or off per user, percentage or environment, separating deploying code from releasing a feature.
::: text 📖 Remember
- Hash user id + flag name so a user always gets the same answer.
- Remove flags after rollout to avoid dead code and untested combinations.
:::

=== Service level objective
@aliases SLO, SLOs, SLI, error budget
@summary A reliability target for a measured indicator, such as 99.9% of requests under 300 ms and not 5xx over 30 days. The error budget is what's left: 99.9% allows 43.2 minutes of failure per 30 days.
::: text 📖 Remember
- Alert on burn rate of the error budget, not on every CPU spike.
- SLA = the contract with penalties, set looser than the SLO.
:::

=== OpenTelemetry
@aliases OTel, OTLP
@summary The vendor-neutral standard and SDKs for traces, metrics and logs. In Node, auto-instrumentation patches http, Express, pg and Redis and exports spans over OTLP to Jaeger, Tempo or a vendor.
::: text 📖 Remember
- Load the SDK before other modules (node --require ./tracing.js).
- The W3C traceparent header carries the trace id between services.
:::

=== Cold start
@aliases cold starts, Lambda cold start
@summary The extra latency when a serverless platform creates a new execution environment: download code, start the runtime and run init code before the handler. Warm invocations reuse the environment.
::: text 📖 Remember
- Keep init small: bundle, trim dependencies, lazy-load (measured 87 ms → 54 ms locally).
- Bursts create many environments at once; provisioned concurrency pre-warms them.
:::

=== Infrastructure as Code
@aliases IaC, Terraform, AWS CDK
@summary Defining cloud resources in version-controlled code (Terraform, AWS CDK, CloudFormation) so they're reviewed in pull requests, planned/diffed in CI and applied by the pipeline identically to every environment.
::: text 📖 Remember
- Always read the plan: a replace on a database deletes data.
- Remote state with locking; no clicking resources together in the console.
:::

=== CAP theorem
@aliases CAP, PACELC
@summary During a network partition a distributed data store must choose between consistency (refusing some requests) and availability (answering with possibly stale data). PACELC adds that without partitions you still trade latency for consistency.
::: text 📖 Remember
- Partitions are not optional, so the real choice is C or A during failures.
- Choose per feature: balances need strong consistency, like counts can be eventual.
:::

=== Consistent hashing
@aliases hash ring, virtual nodes
@summary Placing keys and nodes on a hash ring so adding or removing a node only moves about 1/N of the keys. Measured 4 → 5 shards: modulo moved 80% of keys, a ring with 100 virtual nodes moved 24.4% with even load.
::: text 📖 Remember
- Virtual nodes balance the load.
- Used by sharded caches, Cassandra/DynamoDB-style stores and load balancers with stickiness.
:::

=== Saga pattern
@aliases saga orchestration, compensating transaction
@summary A multi-service workflow made of local transactions, each with a compensating action that undoes it if a later step fails (release stock, refund, cancel). Gives eventual consistency without distributed locks.
::: text 📖 Remember
- Orchestration (one coordinator) is easier to follow than choreography (services react to events).
- Steps and compensations must be idempotent; publish events through an outbox.
:::

=== Circuit breaker
@aliases circuit breakers, bulkhead
@summary A wrapper around calls to a dependency that stops calling it after repeated failures (open), fails fast with a fallback, and lets a probe through after a cool-down (half-open). Measured against a hung dependency: 158 req/s with a timeout alone, 32,647 req/s with a breaker.
::: text 📖 Remember
- Needs a timeout to count hung calls as failures.
- Bulkheads (separate pools per dependency) contain the damage further.
:::

=== Exponential backoff
@aliases backoff with jitter, full jitter, retry storm
@summary Waiting longer after each failed attempt (base × 2^attempt, capped), with random jitter so clients don't retry in synchronised waves. Measured: immediate retries made every client give up; full jitter recovered in 5.8 s with 6.3 requests per client.
::: text 📖 Remember
- Retry only transient errors and idempotent operations; honour Retry-After.
- Retry in one layer only; retries at several layers multiply.
:::

=== Load shedding
@aliases admission control, shed load
@summary Rejecting excess requests early and cheaply (503 + Retry-After) when demand exceeds capacity, so accepted requests stay fast instead of everything slowing down until clients time out.
::: text 📖 Remember
- Limit concurrency, queue length or queue wait time; drop work whose deadline passed.
- Shed low-priority traffic first, never health checks.
:::

=== Strangler fig pattern
@aliases strangler fig, strangler pattern
@summary Migrating away from a monolith gradually: a router sends one capability at a time to a new service until the old code can be removed.
::: text 📖 Remember
- Move one well-understood bounded context at a time.
- The new service gets its own data; sync with events during the transition.
:::

=== Row-level security
@aliases RLS, row level security
@summary A Postgres feature that applies a policy (e.g. tenant_id = current_setting('app.tenant_id')) to every query on a table. Measured: a query that forgot its tenant filter still saw only one tenant's rows, with no measurable overhead.
::: text 📖 Remember
- Set the tenant per transaction (set_config(..., true)) from the authenticated user.
- Table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set; the app should use another role.
:::

=== Fencing token
@aliases fencing tokens
@summary An increasing number handed out with each lock or leader lease; storage rejects writes carrying an older token, so a paused former leader can't overwrite newer data.
::: text 📖 Remember
- Leases expire, but a paused process doesn't know that.
- Pair locks used for correctness with fencing; plain Redis locks don't provide it.
:::

=== Consumer-driven contract testing
@aliases contract testing, contract tests, Pact
@summary Consumers publish the fields and interactions they rely on, and the provider's CI verifies them against the real provider before deploying, replacing most cross-service end-to-end tests.
::: text 📖 Remember
- Additive changes pass; renames and removals are caught before release.
- Gate deploys on verification results (can-i-deploy).
:::
