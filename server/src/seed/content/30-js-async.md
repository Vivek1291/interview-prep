@section JS Async & Event Loop
@icon ⏳
@color #eab308
@desc The browser event loop, microtasks vs macrotasks, promises, a Promise polyfill, async/await and its generator polyfill, and JavaScript memory (stack, heap, garbage collection). Numbers measured in Chrome 154 and Node 22.

=== How does the event loop work in the browser?
@p 3
@tags javascript, event-loop, async, browser
@quick
- JavaScript runs on **one main thread** with **one call stack**: one piece of code at a time.
- Slow work (timers, network, events) is done by the **browser** (Web APIs) in parallel; when it's done, a **callback is queued**.
- Each loop turn: run **one task** (macrotask) → **drain all microtasks** → **render** if a frame is due (rAF, style, layout, paint) → repeat.
- A long task blocks everything: measured in Chrome 154, a 200 ms loop delayed a `setTimeout(fn, 0)` to **200.2 ms** (and no clicks or paints happened meanwhile).
- `setTimeout(fn, 0)` means "**at least** 0 ms, after the current task and microtasks", not "now".

::: text 🧒 In simple words
Think of a **restaurant with one chef** (the call stack). Waiters (Web APIs) take orders, wait for the oven, fetch drinks, all in parallel. When something is ready they put a ticket on the **counter** (the queue). The chef finishes the current dish, then handles the **VIP tickets first** (microtasks), then takes **one normal ticket** (a task), and every so often **plates the food** for the customers (rendering). If the chef spends 10 minutes on one dish, everyone waits.
:::

::: text 📖 Detailed answer
### The pieces
| Piece | What it does |
|---|---|
| **Call stack** | runs the current JavaScript, one frame at a time |
| **Web APIs** (browser) / libuv (Node) | timers, network, file system, DOM events, done outside the JS thread |
| **Task queue** (macrotasks) | `setTimeout`, `setInterval`, UI events, `MessageChannel`, network callbacks |
| **Microtask queue** | promise reactions (`then`/`catch`/`finally`, code after `await`), `queueMicrotask`, `MutationObserver` |
| **Rendering steps** | `requestAnimationFrame` callbacks → style → layout → paint, roughly every 16.7 ms at 60 Hz |

### One turn of the loop
1. Take the **oldest task** from a task queue and run it to completion (the stack becomes empty).
2. Run **all microtasks**, including ones queued by microtasks, until the queue is empty.
3. If it's time for a frame: run `requestAnimationFrame` callbacks, recalculate styles and layout, paint.
4. Go back to 1.

### Why it matters
- **Never block the main thread**: long loops freeze input and animations. Split work (`setTimeout`/`scheduler.yield()`), use Web Workers, or move it to the server.
- Microtasks run **before** rendering, so an endless chain of microtasks freezes the page just like a `while (true)`.
- Nested timers are **clamped**: after 5 nested levels, browsers enforce at least 4 ms. Measured in Chrome 154: delays of 0.6, 0.1, 0, 0, 0, 0, then **4.6, 4.3, 4.7, 4.7 ms**.

### Browser vs Node
Same idea, different queues: Node's libuv loop has phases (timers, poll, check for `setImmediate`, close) and runs `process.nextTick` callbacks before promise microtasks. See the Node.js section for the phases.
:::

::: diagram One turn of the event loop
flowchart TD
  T["Take ONE task (timer, event, message)"] --> R["Run it until the call stack is empty"]
  R --> M{"Microtasks waiting?"}
  M -->|"yes"| RM["Run one microtask (may queue more)"]
  RM --> M
  M -->|"no"| F{"Time to render a frame?"}
  F -->|"yes"| P["rAF callbacks → style → layout → paint"]
  F -->|"no"| T
  P --> T
:::

::: image The browser event loop
/images/javascript/event-loop-browser.svg
:::

::: chart bar Measured: delay of nested setTimeout(fn, 0) in Chrome 154 (ms, clamped after 5 levels)
Nesting level,Delay (ms)
1,0.6
2,0.1
3,0
4,0
5,0
6,0
7,4.6
8,4.3
9,4.7
10,4.7
:::

::: text 🪜 Step by step
A user clicks a button while this runs: `btn.onclick = () => { fetch(url).then(show); setTimeout(log, 0); heavyLoop(200ms); }`
1. The click is a **task**; its handler runs on the call stack.
2. `fetch` is handed to the browser's network layer (parallel). `setTimeout` registers a timer that expires almost immediately and queues `log` as a **task**.
3. `heavyLoop` blocks the stack for 200 ms: no paints, no other clicks processed.
4. The handler ends → microtasks run (none yet, the fetch isn't back) → a frame is painted.
5. Next turn: the `log` task runs (≈200 ms after it was scheduled). Later, when the response arrives, `show` runs as a promise **microtask** after its task.
:::

::: code javascript Browser demo: blocking the loop and the order of queues (runnable)
const order = [];
const start = Date.now();

setTimeout(() => {
  order.push('timeout');
  const waited = Date.now() - start;
  console.log(order.join(' → '));
  console.log(`0 ms timer actually fired after ${waited} ms (blocked by the 100 ms loop)`, waited >= 100 ? '✅' : '❌ FAIL');
  console.log('order: sync, then microtasks, then the timer task', order.join() === 'sync start,sync end,promise,microtask,timeout' ? '✅' : '❌ FAIL');
}, 0);

Promise.resolve().then(() => order.push('promise'));
queueMicrotask(() => order.push('microtask'));

order.push('sync start');
while (Date.now() - start < 100) { /* a long task: nothing else can run */ }
order.push('sync end');
:::

::: warning ⚠️ Common mistakes
- Thinking `setTimeout(fn, 0)` runs immediately or after exactly 0 ms.
- Believing async code runs on another thread (callbacks still run on the single main thread).
- Long synchronous loops or JSON parsing on the main thread (frozen UI, bad INP).
- Infinite microtask loops (`function loop() { Promise.resolve().then(loop) }`) that starve rendering.
:::

::: understand
- One thread, one stack; the browser does the waiting; queues decide **what runs next**.
- Priority per turn: current task → all microtasks → render → next task.
:::

::: ask
- *"Browser or Node?"* The queues and phases differ (`process.nextTick`, `setImmediate`).
:::

::: important ⭐ Say this in the interview
"JavaScript runs on a single thread with one call stack. Asynchronous work like timers, network requests and events is handled by the browser, and when it completes, a callback is queued. The event loop takes one task from the task queue, runs it to completion, then drains the whole microtask queue, which holds promise callbacks and queueMicrotask, and then lets the browser render a frame if one is due before taking the next task. So a long synchronous task blocks everything: in Chrome I measured a 200 millisecond loop delaying a zero-millisecond timer to 200 milliseconds. That's why heavy work should be split up or moved to a worker."
:::

::: links
MDN: The event loop | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop
Jake Archibald: In The Loop (talk) | https://www.youtube.com/watch?v=cCOL7MC4Pl0
HTML spec: event loops | https://html.spec.whatwg.org/multipage/webappapis.html#event-loops
:::

=== Microtasks vs macrotasks: predict the output
@p 3
@tags javascript, event-loop, microtasks, promises, output-questions
@quick
- **Microtasks**: promise `then/catch/finally`, code after `await`, `queueMicrotask`, `MutationObserver`. **All** run right after the current task.
- **Macrotasks (tasks)**: `setTimeout`, `setInterval`, events, `MessageChannel`, I/O. **One** per loop turn.
- Rule for output questions: **sync code → all microtasks → one timer → its microtasks → next timer…**
- Code **before** the first `await` in an async function runs synchronously; code after it is a microtask.
- Measured in Chrome 154: 1,000 promise callbacks **0.1 ms**; 1,000 `setTimeout(0)` **6.2 ms**; 1,000 **chained** `setTimeout(0)` **4,503 ms** (4 ms clamping).

::: text 🧒 In simple words
At a bank there's a **priority line** (microtasks) and a **normal line** (tasks). After serving one normal customer, the clerk serves **everyone** in the priority line, including people who join it meanwhile, before calling the next normal customer.
:::

::: text 📖 Detailed answer
### The two queues
| | Microtasks | Macrotasks (tasks) |
|---|---|---|
| Sources | `Promise.then/catch/finally`, `await` continuation, `queueMicrotask`, `MutationObserver` | `setTimeout`, `setInterval`, DOM events, `postMessage`/`MessageChannel`, network/IO callbacks |
| When | after the current task, before rendering | one per event-loop turn |
| How many per turn | **all** (until empty) | **one** |
| Risk | starving rendering if they keep adding more | being delayed by long tasks, timer clamping |

### async/await in the queues
`async function f() { console.log('A'); await x; console.log('B'); }`
- `'A'` runs **synchronously** when `f()` is called.
- Everything after `await` is scheduled as a **microtask** when `x` settles (even if `x` isn't a promise).

### Where does requestAnimationFrame go?
It's neither: rAF callbacks run in the **rendering** step, before the next paint. Usually after a 0 ms timeout, but the relative order of `setTimeout` and rAF isn't guaranteed.

### Node extras
`process.nextTick` runs before promise microtasks; `setImmediate` runs in the check phase (after I/O).
:::

::: diagram Order of execution
flowchart LR
  S["sync code"] --> MI["ALL microtasks"]
  MI --> T1["one task (timer 1)"]
  T1 --> MI2["ALL microtasks it queued"]
  MI2 --> RF["render: rAF, paint"]
  RF --> T2["next task (timer 2)"]
:::

::: image Output order: sync, then microtasks, then a task, then a frame
/images/javascript/micro-macro.svg
:::

::: chart bar Measured in Chrome 154: time to run 1,000 callbacks (ms)
Kind,Time (ms)
1000 promise callbacks,0.1
1000 setTimeout(0) at once,6.2
:::

::: text 🪜 Step by step
Predicting: `log(1); setTimeout(() => { log(2); Promise.resolve().then(() => log(3)); }); Promise.resolve().then(() => { log(4); setTimeout(() => log(5)); }); log(6);`
1. Sync: **1**, register timer A, queue microtask M1, **6**.
2. Drain microtasks: M1 → **4**, registers timer B.
3. Task: timer A → **2**, queues microtask M2.
4. Drain microtasks: M2 → **3**.
5. Task: timer B → **5**. Output: `1 6 4 2 3 5`.
:::

::: code javascript Browser demo: classic output questions, checked (runnable)
const out = [];
const log = (x) => out.push(x);

// Puzzle 1
log(1);
setTimeout(() => { log(2); Promise.resolve().then(() => log(3)); }, 0);
Promise.resolve().then(() => { log(4); setTimeout(() => log(5), 0); });
log(6);

// Puzzle 2: async/await
async function task() {
  log('a');                   // runs synchronously
  await null;
  log('b');                   // microtask
}
setTimeout(() => {
  out.length = 0;
  log('start');
  task();
  Promise.resolve().then(() => log('c'));
  log('end');
  setTimeout(() => {
    console.log('puzzle 2:', out.join(' '));
    console.log('code before await is sync, after await is a microtask', out.join(' ') === 'start a end b c' ? '✅' : '❌ FAIL');
  }, 0);
}, 20);

setTimeout(() => {
  console.log('puzzle 1:', out.join(' '));
  console.log('sync → microtasks → task → its microtasks → next task', out.join(' ') === '1 6 4 2 3 5' ? '✅' : '❌ FAIL');
}, 10);

// Microtasks drain completely, even when they add more
let chain = 0;
const add = () => { if (++chain < 1000) queueMicrotask(add); };
queueMicrotask(add);
setTimeout(() => console.log('1,000 chained microtasks ran before the first timer', chain === 1000 ? '✅' : '❌ FAIL'), 0);
:::

::: warning ⚠️ Common mistakes
- Putting `setTimeout` callbacks before promise callbacks in output questions.
- Forgetting that the code before the first `await` runs synchronously.
- Assuming the promise **executor** (`new Promise(fn)`) is async: `fn` runs synchronously.
- Recursive microtasks freezing the page.
:::

::: understand
- After every task the microtask queue is emptied completely; that's the whole trick of output questions.
:::

::: ask
- *"Is this Node? Is there a `process.nextTick` or `setImmediate`?"* They change the answer.
:::

::: important ⭐ Say this in the interview
"Microtasks are promise callbacks, the code after await, queueMicrotask and MutationObserver; macrotasks are timers, events and messages. After each task the engine drains the entire microtask queue before rendering or taking the next task. So the order is: synchronous code, then all microtasks, then one timer, then the microtasks it created, and so on. The promise executor and the code before the first await are synchronous. Measured in Chrome, a thousand promise callbacks take about a tenth of a millisecond, while a thousand chained zero-millisecond timers take four and a half seconds because nested timers are clamped to 4 milliseconds."
:::

::: links
Jake Archibald: Tasks, microtasks, queues and schedules | https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/
MDN: Using microtasks | https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
:::

=== What is a Promise? (states, chaining, error handling, combinators)
@p 3
@tags javascript, promises, async
@quick
- A **Promise** is an object for a value that will be available **later**: `pending` → `fulfilled` (value) or `rejected` (reason). It settles **once**.
- `.then(onOk, onErr)`, `.catch(onErr)`, `.finally(fn)` each return a **new promise** → chains; returning a promise inside `then` waits for it.
- Errors **propagate** down the chain to the next `catch`; a thrown error inside `then` becomes a rejection.
- Combinators: `all` (all succeed, fail fast), `allSettled` (wait for all, never rejects), `race` (first to settle), `any` (first to **succeed**, `AggregateError` if all fail).
- The executor runs **synchronously**; callbacks always run **asynchronously** (microtasks).

::: text 🧒 In simple words
A promise is like the **buzzer** a café gives you after ordering. Right now it's just a buzzer (pending). Later it either buzzes "your coffee is ready" (fulfilled) or "sorry, we're out of milk" (rejected), and it can only do that once. `.then` is what you plan to do when it buzzes.
:::

::: text 📖 Detailed answer
### Creating
`new Promise((resolve, reject) => { … })`: call `resolve(value)` or `reject(error)` once; later calls are ignored. Shortcuts: `Promise.resolve(x)`, `Promise.reject(e)`.

### Chaining rules
| Inside `then` you… | The returned promise… |
|---|---|
| return a value | fulfils with that value |
| return a promise/thenable | **follows** it (waits) |
| throw | rejects with the error |
| return nothing | fulfils with `undefined` |

A `catch` that returns normally **recovers** the chain; rethrow to keep it rejected. `finally` doesn't receive or change the value (unless it throws).

### Combinators
| Method | Resolves when | Rejects when | Use for |
|---|---|---|---|
| `Promise.all` | all fulfil (array in input order) | **first** rejection | parallel requests that all must succeed |
| `Promise.allSettled` | all settle (`{status, value/reason}`) | never | dashboards: show what succeeded |
| `Promise.race` | first settles (either way) | first settles with rejection | timeouts |
| `Promise.any` | first **fulfils** | all reject (`AggregateError`) | fastest mirror/CDN |
| `Promise.withResolvers()` | gives `{ promise, resolve, reject }` | | resolving from outside |

### Callbacks vs promises
Promises fix "callback hell" (nesting), give one error path, guarantee async + single-call callbacks, and compose (`all`, chains, `async/await`).
:::

::: diagram A promise chain with an error
flowchart LR
  F["fetchUser()"] -->|"fulfilled"| T1["then: getOrders(user)"]
  T1 -->|"throws"| T2["then: render (skipped)"]
  T2 --> C["catch: show error, return []"]
  C -->|"recovered"| T3["then: runs with []"]
  T3 --> FI["finally: hide spinner"]
:::

::: image Promise states
/images/javascript/promise-states.svg
:::

::: text 🪜 Step by step
`fetchUser().then(getOrders).then(render).catch(showError).finally(hideSpinner)`
1. `fetchUser()` returns a pending promise P1.
2. P1 fulfils with `user` → `getOrders(user)` returns promise P2 → the chain waits for P2.
3. P2 **rejects** (network error) → `render` is skipped; the rejection travels to `catch`.
4. `showError` handles it and returns normally → the chain is fulfilled again.
5. `finally` runs either way → spinner hidden.
:::

::: code javascript Browser demo: chaining, error propagation and combinators (runnable)
const delay = (ms, value, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms));
const results = {};

const executorOrder = [];
new Promise(() => executorOrder.push('executor'));
executorOrder.push('after');
console.log('the executor runs synchronously', executorOrder.join() === 'executor,after' ? '✅' : '❌ FAIL');

const settledOnce = new Promise((resolve, reject) => { resolve('first'); resolve('second'); reject(new Error('ignored')); });

Promise.resolve(2)
  .then((x) => x * 10)                                // value → next then
  .then((x) => delay(10, x + 1))                      // promise → chain waits
  .then((x) => { results.chain = x; throw new Error('boom'); })
  .then(() => { results.skipped = false; })           // skipped
  .catch((e) => { results.caught = e.message; return 'recovered'; })
  .then((v) => { results.after = v; })
  .finally(() => { results.finally = true; })
  .then(async () => {
    results.once = await settledOnce;
    results.all = await Promise.all([delay(20, 'a'), delay(5, 'b')]);                 // input order kept
    results.allFails = await Promise.all([delay(5, 'x'), delay(10, 'bad', true)]).catch((e) => e.message);
    results.settled = (await Promise.allSettled([delay(5, 'ok'), delay(5, 'no', true)])).map((r) => r.status);
    results.race = await Promise.race([delay(30, 'slow'), delay(5, 'fast')]);
    results.any = await Promise.any([delay(5, 'x', true), delay(15, 'second ok')]);
    results.anyAllFail = await Promise.any([delay(5, 'e1', true)]).catch((e) => e.constructor.name);
    console.log(results);
    const ok = results.chain === 21 && results.skipped === undefined && results.caught === 'boom' && results.after === 'recovered' && results.finally;
    console.log('chain: values, waiting, throw → catch → recover', ok ? '✅' : '❌ FAIL');
    console.log('a promise settles only once', results.once === 'first' ? '✅' : '❌ FAIL');
    console.log('all keeps input order / fails fast', results.all.join() === 'a,b' && results.allFails === 'bad' ? '✅' : '❌ FAIL');
    console.log('allSettled never rejects', results.settled.join() === 'fulfilled,rejected' ? '✅' : '❌ FAIL');
    console.log('race = first settled, any = first fulfilled', results.race === 'fast' && results.any === 'second ok' && results.anyAllFail === 'AggregateError' ? '✅' : '❌ FAIL');
  });
:::

::: warning ⚠️ Common mistakes
- Forgetting to **return** inside `then` (the next step doesn't wait).
- Nesting `then` inside `then` (promise hell) instead of chaining.
- No `catch` at the end (unhandled rejection).
- Using `Promise.all` when partial results are fine (use `allSettled`).
- Wrapping an existing promise in `new Promise` (the "explicit construction anti-pattern").
:::

::: understand
- A promise is a one-time container for a future result; `then` returns a new promise, which is what makes chains and async/await work.
:::

::: ask
- *"If one request fails, should the whole thing fail?"* Picks `all` vs `allSettled`.
:::

::: important ⭐ Say this in the interview
"A promise represents a value that will be available later. It starts pending and settles exactly once, either fulfilled with a value or rejected with a reason. then, catch and finally register callbacks, which always run asynchronously as microtasks, and each returns a new promise, so returning a value passes it on, returning a promise waits for it, and throwing rejects. Errors skip down to the next catch, which can recover. For several promises I pick the combinator by failure semantics: all fails fast, allSettled waits for everything, race takes the first to settle, and any takes the first success."
:::

::: links
MDN: Using promises | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
MDN: Promise | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
:::

=== Implement a Promise polyfill (MyPromise)
@p 3
@tags javascript, promises, polyfill, implementation
@quick
- State: `status` (`pending`/`fulfilled`/`rejected`), `value`, and **lists of handlers** waiting for the result.
- `resolve`/`reject` change state **once** and run the queued handlers **asynchronously** (`queueMicrotask`).
- `then(onOk, onErr)` returns a **new MyPromise**; it runs the right callback and resolves the new promise with its result (or rejects if it throws). Missing callbacks pass the value/error through.
- `resolve(x)` where `x` is a promise/thenable must **adopt** its state (call `x.then`).
- Then build `catch`, `finally`, `MyPromise.resolve/reject/all` on top of `then`.

::: text 🧒 In simple words
You build the café buzzer yourself: a **status light**, a **slot for the result**, and a **list of people waiting**. When the coffee is ready you set the light once, put the coffee in the slot and call everyone on the list. If someone asks after it's ready, you just tell them right away (but politely, a moment later, never in the middle of their sentence).
:::

::: text 📖 Detailed answer
### The core pieces
| Piece | Job |
|---|---|
| `#state`, `#value` | pending/fulfilled/rejected + the result |
| `#handlers` | callbacks registered while pending |
| `#settle(state, value)` | change state once, flush handlers |
| `resolve(x)` | if `x` is a thenable → follow it; else fulfil |
| `then(onOk, onErr)` | return a **new** promise and connect it to the callback's result |
| `#run(handler)` | schedule via `queueMicrotask`, call the right callback, resolve/reject the child |

### The tricky rules interviewers check
1. **Settle once**: later `resolve`/`reject` calls are ignored.
2. **Always async**: callbacks run in a microtask even if already settled.
3. **Chaining**: `then` returns a new promise resolved with the callback's return value.
4. **Pass-through**: `then()` without callbacks forwards value/error (`catch` = `then(undefined, onErr)`).
5. **Thenable adoption**: returning a promise from `then` makes the chain wait for it.
6. **Executor errors**: `new MyPromise(() => { throw e })` → rejected.
7. **finally**: runs the callback, then passes the **original** value/error through.

### Statics
`resolve(x)` (return `x` if it's already a MyPromise), `reject(e)`, and `all(iterable)` (count fulfilments, keep the input order, reject on the first error, resolve `[]` for an empty input).
:::

::: diagram How then() connects two promises
flowchart LR
  P["parent promise"] -->|"settles"| Q["queueMicrotask"]
  Q --> CB{"callback for this state?"}
  CB -->|"none"| PASS["pass value or error through"]
  CB -->|"yes"| RUN["run callback"]
  RUN -->|"returns x"| RES["child.resolve(x): adopts thenables"]
  RUN -->|"throws e"| REJ["child.reject(e)"]
  PASS --> CHILD["child promise (returned by then)"]
  RES --> CHILD
  REJ --> CHILD
:::

::: image Promise states (what the polyfill must model)
/images/javascript/promise-states.svg
:::

::: text 🪜 Step by step
`new MyPromise(r => setTimeout(() => r(2), 10)).then(x => x * 3).then(console.log)`
1. The executor runs now and starts a timer; state is `pending`.
2. The first `then` creates child C1 and stores a handler (the parent is pending).
3. The second `then` on C1 creates C2 and stores a handler on C1.
4. After 10 ms `r(2)` → parent fulfilled → microtask: run `x * 3` → `C1.resolve(6)`.
5. C1 fulfilled → microtask: `console.log(6)` → C2 resolved with `undefined`.
:::

::: code javascript Browser demo: MyPromise with then, catch, finally, resolve, reject and all (runnable)
class MyPromise {
  #state = 'pending';
  #value;
  #handlers = [];

  constructor(executor) {
    let called = false;                                       // resolve/reject only once
    const resolve = (v) => { if (!called) { called = true; this.#resolve(v); } };
    const reject = (e) => { if (!called) { called = true; this.#settle('rejected', e); } };
    try { executor(resolve, reject); } catch (e) { reject(e); }
  }

  #resolve(x) {
    if (x === this) return this.#settle('rejected', new TypeError('cannot resolve a promise with itself'));
    if (x !== null && (typeof x === 'object' || typeof x === 'function')) {
      let then;
      try { then = x.then; } catch (e) { return this.#settle('rejected', e); }
      if (typeof then === 'function') {                       // adopt thenables
        let done = false;
        try {
          then.call(x, (v) => { if (!done) { done = true; this.#resolve(v); } }, (e) => { if (!done) { done = true; this.#settle('rejected', e); } });
        } catch (e) { if (!done) { done = true; this.#settle('rejected', e); } }
        return;
      }
    }
    this.#settle('fulfilled', x);
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return;
    this.#state = state;
    this.#value = value;
    this.#handlers.forEach((h) => this.#run(h));
    this.#handlers = [];
  }

  #run({ onFulfilled, onRejected, resolve, reject }) {
    queueMicrotask(() => {                                     // always async
      const cb = this.#state === 'fulfilled' ? onFulfilled : onRejected;
      if (typeof cb !== 'function') return this.#state === 'fulfilled' ? resolve(this.#value) : reject(this.#value);
      try { resolve(cb(this.#value)); } catch (e) { reject(e); }
    });
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const h = { onFulfilled, onRejected, resolve, reject };
      this.#state === 'pending' ? this.#handlers.push(h) : this.#run(h);
    });
  }
  catch(onRejected) { return this.then(undefined, onRejected); }
  finally(fn) {
    return this.then(
      (v) => MyPromise.resolve(fn()).then(() => v),
      (e) => MyPromise.resolve(fn()).then(() => { throw e; }),
    );
  }
  static resolve(v) { return v instanceof MyPromise ? v : new MyPromise((r) => r(v)); }
  static reject(e) { return new MyPromise((_, r) => r(e)); }
  static all(items) {
    return new MyPromise((resolve, reject) => {
      const list = [...items], out = new Array(list.length);
      let left = list.length;
      if (left === 0) return resolve(out);
      list.forEach((item, i) => MyPromise.resolve(item).then((v) => { out[i] = v; if (--left === 0) resolve(out); }, reject));
    });
  }
}

// Tests
const checks = [];
const check = (name, ok) => checks.push([name, ok]);
const sync = [];
MyPromise.resolve(1).then(() => sync.push('callback'));
sync.push('after then');
check('callbacks are async', sync.join() === 'after then');

new MyPromise((r) => setTimeout(() => r(2), 5))
  .then((x) => x * 3)
  .then((x) => new MyPromise((r) => setTimeout(() => r(x + 1), 5)))          // adopts a promise
  .then((x) => { check('chaining + adoption', x === 7); throw new Error('boom'); })
  .then(() => check('skipped on error', false))
  .catch((e) => { check('catch receives the error', e.message === 'boom'); return 'ok'; })
  .finally(() => 'ignored')
  .then((v) => check('finally passes the value through', v === 'ok'))
  .then(() => new MyPromise(() => { throw new Error('executor'); }))
  .catch((e) => check('executor throw → rejection', e.message === 'executor'))
  .then(() => MyPromise.all([1, MyPromise.resolve(2), new MyPromise((r) => setTimeout(() => r(3), 5)), Promise.resolve(4)]))
  .then((all) => check('all keeps order + accepts native promises', all.join() === '1,2,3,4'))
  .then(() => MyPromise.all([MyPromise.resolve(1), MyPromise.reject(new Error('fail'))]))
  .catch((e) => check('all rejects on first failure', e.message === 'fail'))
  .then(() => MyPromise.all([]))
  .then((empty) => check('all([]) resolves to []', Array.isArray(empty) && empty.length === 0))
  .then(async () => {
    const value = await new MyPromise((r) => { r('first'); r('second'); });       // works with await (thenable)
    check('settles once + usable with await', value === 'first');
    for (const [name, ok] of checks) console.log(name, ok ? '✅' : '❌ FAIL');
  });
:::

::: warning ⚠️ Common mistakes
- Running callbacks synchronously when the promise is already settled.
- `then` returning `this` instead of a **new** promise.
- Not adopting returned promises (the chain doesn't wait).
- Letting `resolve` and `reject` both take effect.
- `finally` replacing the value with its callback's return value.
:::

::: understand
- Everything is built on `then`: state + handler queue + "new promise per then" + thenable adoption + microtasks.
:::

::: ask
- *"Do you want full Promises/A+ compliance or the core behaviour?"* Thenable edge cases add most of the code.
:::

::: important ⭐ Say this in the interview
"My polyfill keeps a state, a value and a list of handlers. resolve and reject settle it only once and then flush the handlers, always asynchronously with queueMicrotask. then returns a new promise: when the parent settles, it runs the matching callback, resolves the child with the callback's return value or rejects it if the callback throws, and if a callback is missing it passes the value or error through. resolve also adopts thenables, which is what makes returning a promise from then wait. catch and finally are built on then, and all counts fulfilments while keeping the input order and rejects on the first error."
:::

::: links
Promises/A+ specification | https://promisesaplus.com/
MDN: Promise | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
:::

=== How does async/await work? (sequential vs parallel)
@p 3
@tags javascript, async-await, promises
@quick
- `async function` **always returns a promise**; `return x` resolves it, `throw` rejects it.
- `await p` pauses **only that function** (not the thread) until `p` settles; the rest runs later as a **microtask**.
- Errors: wrap `await` in `try/catch` (or `.catch` on the call).
- **Sequential** awaits add up; **independent** work should start together: measured in Chrome 154, three 100 ms requests took **303.8 ms** sequentially vs **101.2 ms** with `Promise.all`.
- `await` in `for…of` is sequential; `forEach(async …)` does **not** wait at all.

::: text 🧒 In simple words
`await` is like saying "I'll **wait for my food** before eating", but only **you** wait: the restaurant keeps serving everyone else. And if you need three dishes from three different kitchens, order **all three at once** and wait once, instead of ordering the next only after the previous arrives.
:::

::: text 📖 Detailed answer
### What the keywords do
| Code | Meaning |
|---|---|
| `async function f() { return 1 }` | `f()` returns `Promise<1>` |
| `const x = await p` | pause `f`, resume with the fulfilled value (or throw the rejection) |
| `await 5` | works too (wrapped with `Promise.resolve`), still yields to the microtask queue |
| top-level `await` | allowed in ES modules |

### It's promises underneath
`async/await` = promises + a **state machine** (like a generator) that resumes the function when each awaited promise settles. That's why it can be polyfilled with generators (see the next question).

### Sequential vs parallel
- Sequential: `const a = await getA(); const b = await getB();` → time = A + B. Only right when B **needs** A's result.
- Parallel: `const [a, b] = await Promise.all([getA(), getB()]);` → time = max(A, B).
- Start early, await late: `const pa = getA(); const pb = getB(); const a = await pa; const b = await pb;` (careful: if `pb` rejects before you await it, you get an unhandled-rejection warning; `Promise.all` is safer).

### Loops
- `for (const id of ids) await save(id)` → one at a time (good for rate limits).
- `await Promise.all(ids.map(save))` → all at once.
- `ids.forEach(async (id) => await save(id))` → nothing waits for these; errors are unhandled.
- Limited concurrency: process in batches or use a pool (e.g., 5 at a time).
:::

::: diagram Sequential vs parallel awaits
flowchart LR
  subgraph SEQ["sequential: about 300 ms"]
    A1["await a()"] --> B1["await b()"] --> C1["await c()"]
  end
  subgraph PAR["parallel: about 100 ms"]
    A2["a()"] --> J["await Promise.all"]
    B2["b()"] --> J
    C2["c()"] --> J
  end
:::

::: image async/await: sequential vs parallel (measured 303.8 ms vs 101.2 ms)
/images/javascript/await-parallel.svg
:::

::: chart bar Measured in Chrome 154: three independent 100 ms operations (ms)
Pattern,Time (ms)
sequential awaits,303.8
Promise.all,101.2
:::

::: text 🪜 Step by step
`async function load() { console.log('A'); const user = await getUser(); console.log('B', user); return user.id; }`
1. `load()` is called → runs synchronously until the first `await`: logs **A**.
2. `getUser()` returns a pending promise; `await` suspends `load` and returns a pending promise to the caller.
3. The caller keeps running; the event loop handles other work.
4. `getUser`'s promise fulfils → a microtask resumes `load` with `user` → logs **B**.
5. `return user.id` fulfils the promise returned by `load()`.
:::

::: code javascript Browser demo: return values, errors, sequential vs parallel, loops (runnable)
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

async function main() {
  const p = (async () => 1)();
  console.log('async functions return promises', p instanceof Promise && (await p) === 1 ? '✅' : '❌ FAIL');

  try { await (async () => { throw new Error('nope'); })(); }
  catch (e) { console.log('throw → rejection → catch', e.message === 'nope' ? '✅' : '❌ FAIL'); }

  let t = Date.now();
  await wait(50); await wait(50); await wait(50);
  const sequential = Date.now() - t;
  t = Date.now();
  await Promise.all([wait(50), wait(50), wait(50)]);
  const parallel = Date.now() - t;
  console.log({ sequential, parallel });
  console.log('independent work in parallel is ~3× faster', sequential >= 145 && parallel < 100 ? '✅' : '❌ FAIL');

  // forEach does not wait
  const saved = [];
  [1, 2, 3].forEach(async (id) => { await wait(10); saved.push(id); });
  console.log('forEach(async) does not wait', saved.length === 0 ? '✅' : '❌ FAIL');

  // for...of waits, one at a time, in order
  const inOrder = [];
  for (const id of [30, 10, 20]) inOrder.push(await wait(id, id));
  console.log('for...of + await is sequential and ordered', inOrder.join() === '30,10,20' ? '✅' : '❌ FAIL');

  // limited concurrency: at most 2 at a time
  let running = 0, peak = 0;
  const job = async (ms) => { running++; peak = Math.max(peak, running); await wait(ms); running--; return ms; };
  async function pool(items, limit, fn) {
    const results = []; let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i]); } };
    await Promise.all(Array.from({ length: limit }, worker));
    return results;
  }
  const pooled = await pool([20, 10, 30, 10, 5], 2, job);
  console.log('pool keeps order and limits concurrency', pooled.join() === '20,10,30,10,5' && peak === 2 ? '✅' : '❌ FAIL');
}
main();
:::

::: warning ⚠️ Common mistakes
- Awaiting independent requests one after another (slow pages).
- `forEach` with async callbacks (nothing waits, errors are lost).
- Forgetting `await` (you get a promise, and errors become unhandled rejections).
- `try/catch` without `await` inside it: `try { return fetchX() }` doesn't catch the rejection; use `return await` inside `try`.
- Thinking `await` blocks the whole page.
:::

::: understand
- async/await is promise syntax: pause the function, not the thread. Parallelize what doesn't depend on each other.
:::

::: ask
- *"Does the second call depend on the first one's result? Any rate limit?"* Decides sequential, all, or a pool.
:::

::: important ⭐ Say this in the interview
"An async function always returns a promise, and await pauses only that function until the awaited promise settles, resuming it as a microtask, so the thread stays free. Rejections become exceptions I can catch with try/catch. The common performance mistake is awaiting independent work sequentially: in Chrome I measured three 100 millisecond requests at about 300 milliseconds in sequence versus 100 with Promise.all. In loops, for…of with await is sequential, Promise.all with map is parallel, forEach doesn't wait at all, and for rate limits I use a small concurrency pool."
:::

::: links
MDN: async function | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
MDN: await | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await
:::

=== Implement async/await with generators (async/await polyfill)
@p 2
@tags javascript, async-await, generators, polyfill, implementation
@quick
- Idea: `async function` ≈ **generator function** + an automatic **runner**; `await x` ≈ `yield x`.
- The runner calls `it.next(value)`; when the generator yields a promise, it waits for it and resumes with the result (`next(result)`) or throws it back in (`it.throw(error)`).
- When the generator returns (`done: true`), the runner resolves its own promise with the value.
- Errors thrown inside the generator (or an uncaught rejection) reject the runner's promise.
- This is how Babel/TypeScript compiled async/await for old browsers (regenerator + `asyncToGenerator`).

::: text 🧒 In simple words
A generator is a recipe you can **pause** at each "wait for the oven" step. The runner is a **kitchen helper** who watches the oven: when it dings, the helper presses "continue" on the recipe and hands over the baked dish. If the oven breaks, the helper tells the recipe "there's a problem" so it can handle it.
:::

::: text 📖 Detailed answer
### Mapping
| async/await | generator version |
|---|---|
| `async function f() {…}` | `const f = asyncPolyfill(function* () {…})` |
| `await promise` | `yield promise` |
| value of `await` | value passed to `it.next(value)` |
| rejected `await` throws | runner calls `it.throw(error)` |
| `return x` | `{ value: x, done: true }` → resolve |

### The runner algorithm
1. Create the iterator: `const it = genFn.apply(this, args)`.
2. Return a new Promise; inside, define `step(method, arg)`:
   - `let result; try { result = it[method](arg) } catch (e) { return reject(e) }`.
   - If `result.done` → `resolve(result.value)`.
   - Else `Promise.resolve(result.value).then(v => step('next', v), e => step('throw', e))`.
3. Start with `step('next')`.

### Why generators fit
Generators can **pause** (yield) and be **resumed with a value** or **with an error**: exactly what `await` needs. Native async functions do the same internally, without exposing the iterator.
:::

::: diagram The runner loop
flowchart TD
  S["step('next', value)"] --> N["result = it.next(value)"]
  N --> D{"result.done?"}
  D -->|"yes"| R["resolve(result.value)"]
  D -->|"no"| W["Promise.resolve(result.value)"]
  W -->|"fulfilled v"| S
  W -->|"rejected e"| TH["step('throw', e): it.throw(e)"]
  TH --> D
  N -->|"generator throws"| RJ["reject(error)"]
:::

::: image Generators: functions that pause and resume (the base of the polyfill)
/images/javascript/generator.svg
:::

::: text 🪜 Step by step
`asyncPolyfill(function* () { const a = yield wait(10, 2); const b = yield wait(10, 3); return a * b; })()`
1. Runner creates the iterator and calls `next()` → the generator runs until the first `yield`, giving a promise.
2. The runner waits for it → 2 → calls `next(2)` → `a = 2`, runs to the second `yield`.
3. Waits → 3 → `next(3)` → `b = 3` → `return 6` → `{ value: 6, done: true }`.
4. The runner resolves its promise with 6.
5. If a yielded promise rejects, `it.throw(err)` makes the `yield` line throw, so a `try/catch` inside the generator can handle it.
:::

::: code javascript Browser demo: asyncPolyfill vs native async (runnable)
function asyncPolyfill(generatorFn) {
  return function (...args) {
    const it = generatorFn.apply(this, args);
    return new Promise((resolve, reject) => {
      function step(method, arg) {
        let result;
        try { result = it[method](arg); }                 // resume with a value or an error
        catch (error) { return reject(error); }           // uncaught inside the generator
        if (result.done) return resolve(result.value);
        Promise.resolve(result.value).then((v) => step('next', v), (e) => step('throw', e));
      }
      step('next');
    });
  };
}

const wait = (ms, value, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms));

const multiply = asyncPolyfill(function* (factor) {
  const a = yield wait(10, 2);
  const b = yield wait(10, 3);
  const c = yield 4;                                  // plain values work too
  return a * b * c * factor;
});

const recovers = asyncPolyfill(function* () {
  try { yield wait(5, 'network down', true); }
  catch (e) { return `handled: ${e.message}`; }
});

const fails = asyncPolyfill(function* () { yield wait(5, 'x'); throw new Error('inside'); });

const counter = { count: 5, inc: asyncPolyfill(function* () { yield wait(1); return ++this.count; }) };

async function nativeVersion(factor) { const a = await wait(10, 2); const b = await wait(10, 3); const c = await 4; return a * b * c * factor; }

Promise.all([multiply(10), nativeVersion(10), recovers(), fails().catch((e) => `rejected: ${e.message}`), counter.inc()])
  .then(([poly, native, handled, rejected, count]) => {
    console.log({ poly, native, handled, rejected, count });
    console.log('same result as native async/await', poly === 240 && poly === native ? '✅' : '❌ FAIL');
    console.log('rejection is thrown into the generator (try/catch works)', handled === 'handled: network down' ? '✅' : '❌ FAIL');
    console.log('throw inside → returned promise rejects', rejected === 'rejected: inside' ? '✅' : '❌ FAIL');
    console.log('this is preserved', count === 6 ? '✅' : '❌ FAIL');
  });
:::

::: warning ⚠️ Common mistakes
- Forgetting `it.throw` for rejections (errors silently disappear or the generator hangs).
- Not wrapping `it.next()` in `try/catch` (synchronous throws inside the generator escape).
- Not using `Promise.resolve(value)` (yielding plain values or thenables breaks).
- Losing `this` and arguments (use `generatorFn.apply(this, args)`).
:::

::: understand
- await = yield + a runner that resumes with the result or throws the error back in.
:::

::: ask
- *"Should yielded non-promises be awaited too?"* (Native await accepts any value.)
:::

::: important ⭐ Say this in the interview
"async/await is a generator plus a runner. Each await becomes a yield of a promise. The runner starts the generator, and whenever it yields, waits for the value with Promise.resolve: on success it resumes the generator with next(value), on failure it calls throw(error) so the yield line throws and try/catch inside works. When the generator returns, the runner resolves its own promise with the return value, and if the generator throws, it rejects. That's how Babel compiled async functions before browsers supported them."
:::

::: links
MDN: Generator.prototype.throw | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/throw
Babel: transform-async-to-generator | https://babeljs.io/docs/babel-plugin-transform-async-to-generator
:::

=== How is memory managed in JavaScript? (stack, heap, garbage collection, leaks)
@p 3
@tags javascript, memory, garbage-collection, heap, performance
@quick
- **Stack**: call frames (local primitives and references), fast, freed when a function returns. Too deep recursion → `RangeError: Maximum call stack size exceeded`.
- **Heap**: objects, arrays, functions, closures. Freed by the **garbage collector** when **unreachable** from the roots (globals, the stack).
- V8 uses **mark-and-sweep** with generations: a fast young generation (most objects die young) and an old generation.
- Leaks = things that stay **reachable** by accident: forgotten listeners/timers, growing caches/Maps, detached DOM nodes, closures over big data, globals.
- Measured (Node 22): a Map kept **80.7 MB** after its keys were dropped; a WeakMap fell to **3.6 MB**; 100 handlers closing over big arrays kept **76.3 MB** until removed.

::: text 🧒 In simple words
The **stack** is your **desk**: small, tidy, cleared when each task is done. The **heap** is the **storeroom** for big things. The **cleaner** (garbage collector) throws away anything in the storeroom that **nobody has a note pointing to**. A memory leak is when you keep an old note in your pocket by mistake, so the cleaner never throws that box away.
:::

::: text 📖 Detailed answer
### Stack vs heap
| | Stack | Heap |
|---|---|---|
| Holds | call frames: arguments, local primitives, references | objects, arrays, functions, closures, strings |
| Lifetime | until the function returns | until unreachable |
| Size | small (about 1 MB; ~10k frames) | large (hundreds of MB to GBs) |
| Managed by | function calls/returns | garbage collector |

(Engines optimize: small values can live in registers, and objects that don't escape can be optimized away, but the model above is what interviews expect.)

### Garbage collection: reachability
The GC starts from **roots** (global object, current stack frames, active handles), **marks** everything reachable by following references, and **sweeps** (frees) the rest. Cycles are fine: two objects that only reference each other are unreachable and get collected. V8's **generational** GC copies surviving young objects quickly (Scavenger) and collects the old generation with incremental/concurrent mark-and-sweep to keep pauses short.

### Common leaks and fixes
| Leak | Fix |
|---|---|
| Event listeners never removed (on `window`, `document`) | `removeEventListener`, `AbortController` signal, effect cleanup |
| `setInterval` never cleared | `clearInterval` in cleanup |
| Ever-growing caches / Maps keyed by objects | LRU limit, or `WeakMap` |
| Detached DOM nodes still referenced from JS | null the references |
| Closures holding big data | keep only what you need in the closure |
| Accidental globals | strict mode, modules |

### Finding them
Chrome DevTools → Memory → **heap snapshots**: take a baseline, do the action several times, take another, compare; look at **retainers** of objects that should have been freed (see the heap snapshots question in Browser & DOM).
:::

::: diagram Mark and sweep
flowchart LR
  R["Roots: globals, stack"] --> A["user object"]
  A --> B["profile object"]
  B --> A
  C["old array: no references"]
  D["cycle X ⇄ Y: unreachable"]
  A -.->|"marked: kept"| K["survives"]
  C -.->|"not marked"| G["freed"]
  D -.->|"not marked"| G
:::

::: image JavaScript memory: stack and heap
/images/javascript/stack-heap.svg
:::

::: image What keeps memory alive (measured with node --expose-gc)
/images/javascript/memory-retention.svg
:::

::: chart bar Measured (Node 22): heap in MB after forced GC
Scenario,Heap used (MB)
Map after keys dropped,80.7
WeakMap after keys dropped,3.6
100 closures over big arrays,76.3
after removing the closures,0.1
:::

::: text 🪜 Step by step
A classic React leak: `useEffect(() => { window.addEventListener('resize', onResize); }, [])` with no cleanup:
1. The component mounts; `window` (a root) now references `onResize`.
2. `onResize` is a closure over the component's props/state (maybe large data).
3. The component unmounts, but `window` still holds the listener → the closure → the data: all **reachable**.
4. Mount/unmount 50 times → 50 listeners and 50 copies retained (and they keep firing).
5. Fix: `return () => window.removeEventListener('resize', onResize)`, after which everything becomes unreachable and is collected.
:::

::: code javascript Browser demo: stack depth, reachability and leak patterns (runnable)
// 1) The stack has a limit
let depth = 0;
function recurse() { depth++; recurse(); }
try { recurse(); } catch (e) { console.log(`stack overflow after ${depth.toLocaleString()} frames:`, e.name, e.name === 'RangeError' ? '✅' : '❌ FAIL'); }

// 2) Objects are shared by reference in the heap
const user = { name: 'Asha' };
const team = { lead: user };
user.name = 'Ravi';
console.log('two references, one heap object', team.lead.name === 'Ravi' ? '✅' : '❌ FAIL');

// 3) A leak pattern: listeners that are never removed
class Emitter {
  #listeners = new Set();
  on(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }   // return an unsubscribe
  get count() { return this.#listeners.size; }
}
const appEvents = new Emitter();                          // long-lived, like window
function mountLeaky() { const bigData = new Array(10000).fill('x'); appEvents.on(() => bigData.length); }
function mountClean() { const bigData = new Array(10000).fill('x'); return appEvents.on(() => bigData.length); }

for (let i = 0; i < 50; i++) mountLeaky();               // 50 closures (and their arrays) stay reachable
console.log('leaky: listeners kept alive', appEvents.count === 50 ? '✅' : '❌ FAIL');
const unsubscribes = Array.from({ length: 50 }, mountClean);
unsubscribes.forEach((off) => off());                     // cleanup on unmount
console.log('clean: cleanup removed its 50 listeners', appEvents.count === 50 ? '✅' : '❌ FAIL');

// 4) Bounded cache instead of an ever-growing one
const cache = new Map();
function cachedSquare(n, max = 100) {
  if (cache.has(n)) return cache.get(n);
  const v = n * n;
  cache.set(n, v);
  if (cache.size > max) cache.delete(cache.keys().next().value);
  return v;
}
for (let i = 0; i < 1000; i++) cachedSquare(i);
console.log('bounded cache stays at its limit', cache.size === 100 ? '✅' : '❌ FAIL');

// 5) WeakMap: metadata that does not keep its key alive
const meta = new WeakMap();
let node = { id: 'div#1' };
meta.set(node, { clicks: 3 });
console.log('WeakMap lookup while the key is alive', meta.get(node).clicks === 3 ? '✅' : '❌ FAIL');
node = null;                                               // now collectable together with its metadata
:::

::: warning ⚠️ Common mistakes
- "JS has garbage collection, so leaks can't happen" (anything **reachable** is kept).
- Saying primitives always live on the stack and objects always on the heap as an absolute rule (engines optimize; it's a mental model).
- Unbounded caches/Maps keyed by objects.
- Missing cleanup for listeners, intervals, subscriptions and observers.
- Deep recursion on big inputs (use iteration or an explicit stack).
:::

::: understand
- Memory is freed by **reachability**, not by "not using it anymore". Leaks are accidental references.
:::

::: ask
- *"Does memory grow with each repeat of an action?"* That's the signal to compare heap snapshots.
:::

::: important ⭐ Say this in the interview
"The call stack holds function frames with local primitives and references, and is freed as functions return; objects, arrays and closures live on the heap and are freed by the garbage collector. V8 uses generational mark-and-sweep: starting from roots like globals and the stack, it marks everything reachable and frees the rest, so cycles are fine. A leak is something that stays reachable by accident: listeners or intervals without cleanup, growing caches, detached DOM nodes, or closures over large data. In a measurement, a Map still held 80 megabytes after its keys were dropped while a WeakMap released them. I find leaks by comparing heap snapshots and checking retainers."
:::

::: links
MDN: Memory management | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_management
V8 blog: Trash talk (the Orinoco GC) | https://v8.dev/blog/trash-talk
Chrome DevTools: Fix memory problems | https://developer.chrome.com/docs/devtools/memory-problems
:::
