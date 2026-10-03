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
