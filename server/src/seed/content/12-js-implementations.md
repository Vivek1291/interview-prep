@section JS Implementations (Polyfills)
@icon ⚡
@color #eab308
@desc Implement debounce, throttle, Promise.all/race/any/allSettled, map/filter/forEach/reduce, deepClone, deepEqual, flatten, groupBy, memoize and an LRU cache from scratch: with timelines, dry runs, tests, trade-offs and interview scripts.

=== Implement debounce
@p 3
@tags debounce, closures, timers
@quick
- **debounce(fn, wait)**: run `fn` only after `wait` ms of **silence**; every new call **cancels** the pending timer.
- Closure keeps `timer`, the last `args` and `this`; use `fn.apply(lastThis, lastArgs)`.
- Options: **leading** (run on the first call), **cancel()**, **flush()**.
- Use for: search-as-you-type, window resize, autosave. In React, create it **once** (`useMemo`/`useRef`) and cancel on unmount.

::: text 🧾 Problem
Write `debounce(fn, wait)` that returns a new function. When the new function is called many times in a row, `fn` should run **only once**, `wait` milliseconds after the **last** call, with the **last** arguments and the correct `this`.

**Example:** typing "n", "no", "nod", "node" within 300 ms with `debounce(search, 300)` → `search("node")` runs **once**, 300 ms after the last key.

**Requirements:** keep `this` and arguments; support `cancel()`; bonus: `leading` option and `flush()`.

*A **closure** is a function that remembers the variables from where it was created: the debounced function remembers its own `timer` between calls.*
:::

::: text 🧒 Intuition
An **elevator door**: it waits a few seconds before closing. If someone else walks in, the countdown **restarts**. The door only closes once nobody has come for the whole waiting time. Debounce is that door for function calls: the function "closes the door" (runs) only after the calls stop.
:::

::: text 🐢 Brute force
**Naive idea:** call `fn` on every event, or schedule a `setTimeout` for every call **without cancelling** the previous one.

`return (...args) => setTimeout(() => fn(...args), wait)`

**Result:** typing 20 characters still triggers **20 API calls**, just 300 ms later, and responses can arrive out of order (an old result overwriting a newer one). For a search box with 10,000 users typing ~5 keys/second, that's 50,000 requests/second instead of a few thousand.
:::

::: text 💡 Key insight
Keep **one** timer in a closure. Each call clears the previous timer and starts a new one, so only the call followed by `wait` ms of silence survives. Store the latest arguments and `this` so the final run uses them.

**Pattern name: Closure + timer (rate limiting on the client).**
:::

::: diagram What happens on each call
flowchart TD
  A["debounced(...args) called"] --> B["remember lastArgs and lastThis"]
  B --> C{"leading and no timer running?"}
  C -->|"yes"| D["run fn now"]
  C -->|"no"| E["(wait)"]
  D --> F["clearTimeout(timer), timer = setTimeout(..., wait)"]
  E --> F
  F --> G{"wait ms pass without a new call?"}
  G -->|"yes"| H["timer = null, run fn(lastArgs) unless leading already ran it"]
  G -->|"no: new call"| A
:::

::: image debounce: a burst of keystrokes produces one call 300 ms after the last keystroke
/images/js-implementations/debounce.svg
:::

::: text 🔍 Dry run: wait = 300, calls at 0, 80, 160, 240 ms
| Time | event | timer action | fn runs? |
|---|---|---|---|
| 0 ms | call("n") | start timer → fires at 300 | no |
| 80 ms | call("no") | clear, restart → fires at 380 | no |
| 160 ms | call("nod") | clear, restart → fires at 460 | no |
| 240 ms | call("node") | clear, restart → fires at 540 | no |
| 540 ms | timer fires | timer = null | **fn("node")** once |
:::

::: code javascript Implementation + tests (runnable, ~0.5 s)
/**
 * debounce(fn, wait, { leading }) → debounced function with .cancel() and .flush().
 */
function debounce(fn, wait = 300, { leading = false } = {}) {
  let timer = null;                 // the ONE pending timer (kept alive by the closure)
  let lastArgs, lastThis;           // the most recent call's arguments and `this`

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;                              // preserves `this` for methods
    const callNow = leading && timer === null;    // leading edge: first call of a burst
    clearTimeout(timer);                          // cancel the previous countdown
    timer = setTimeout(() => {
      timer = null;                               // burst is over
      if (!leading) fn.apply(lastThis, lastArgs); // trailing edge: run with the LAST args
    }, wait);
    if (callNow) fn.apply(this, args);
  }

  debounced.cancel = () => { clearTimeout(timer); timer = null; };     // e.g. on unmount
  debounced.flush = () => {                                           // run the pending call now
    if (timer !== null) { clearTimeout(timer); timer = null; fn.apply(lastThis, lastArgs); }
  };
  return debounced;
}

// ---------- tests ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const calls = [];
  const search = debounce((q) => calls.push(q), 100);
  search('n'); search('no'); search('nod'); search('node');   // a quick burst
  await sleep(150);
  console.log('trailing: one call with the last args →', JSON.stringify(calls), JSON.stringify(calls) === '["node"]' ? '✅' : '❌ FAIL');

  const lead = [];
  const onClick = debounce((x) => lead.push(x), 100, { leading: true });
  onClick(1); onClick(2); onClick(3);
  await sleep(150);
  console.log('leading: runs on the first call only →', JSON.stringify(lead), JSON.stringify(lead) === '[1]' ? '✅' : '❌ FAIL');

  const cancelled = [];
  const c = debounce(() => cancelled.push('ran'), 50);
  c(); c.cancel();
  await sleep(80);
  console.log('cancel() stops the pending call →', cancelled.length === 0 ? '✅' : '❌ FAIL');

  const flushed = [];
  const f = debounce((x) => flushed.push(x), 1000);
  f('now'); f.flush();
  console.log('flush() runs immediately →', JSON.stringify(flushed), JSON.stringify(flushed) === '["now"]' ? '✅' : '❌ FAIL');

  const obj = { name: 'Vivek', seen: null, greet: debounce(function () { this.seen = this.name; }, 30) };
  obj.greet();
  await sleep(60);
  console.log('`this` is preserved →', obj.seen, obj.seen === 'Vivek' ? '✅' : '❌ FAIL');
})();
:::

::: code jsx Using it in React (search box)
import { useEffect, useMemo, useState } from 'react';

// `debounce` is the function implemented above (put it in utils/debounce.js and import it)
export function SearchBox({ onSearch }) {
  const [text, setText] = useState('');
  // Create the debounced function ONCE: a new one on every render would never debounce anything
  const debouncedSearch = useMemo(() => debounce((q) => onSearch(q), 300), [onSearch]);
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]); // cancel on unmount

  return (
    <input
      value={text}
      placeholder="Search…"
      onChange={(e) => {
        setText(e.target.value);         // the input stays responsive
        debouncedSearch(e.target.value); // the API call waits for a pause
      }}
    />
  );
}
:::

::: chart bar API calls while typing a 20-letter query (illustrative, ~5 keys/s with 2 pauses)
Approach,API calls
No debounce,20
setTimeout without cancel,20
debounce 300 ms,3
:::

::: text ⚖️ Trade-offs
| Approach | Calls | Pros | Cons | Choose when |
|---|---|---|---|---|
| Call on every event | n | Instant | Floods the API, out-of-order results | Cheap local work only |
| **Debounce (trailing)** | 1 per burst | Fewest calls, waits for intent | Adds `wait` ms of delay | Search box, resize, autosave |
| Debounce (leading) | 1 per burst | Instant first reaction | Ignores what happened at the end | Prevent double-clicks on "Submit" |
| Throttle | 1 per interval | Steady updates during activity | More calls than debounce | Scroll, drag, progress |
| lodash `debounce` | – | Battle-tested, `maxWait` option | Dependency | Production code |
:::

::: warning ⚠️ Common mistakes / edge cases
- Creating the debounced function **inside the render / event handler** → a new timer every time, nothing is debounced.
- Using an arrow function for `debounced` → `this` is lost for object methods.
- Forgetting `cancel()` on unmount → the callback runs after the component is gone ("state update on unmounted component").
- Not passing the **latest** arguments (using the first call's args).
- Debouncing doesn't fix out-of-order responses on its own: also cancel stale fetches (`AbortController`).
:::

::: understand
- Debounce = "wait for silence". It relies on **closures** (state between calls) and the **event loop** (timers). Related: [Implement throttle](https://www.greatfrontend.com/questions/javascript/throttle), [LeetCode 2627: Debounce](https://leetcode.com/problems/debounce/), lodash's `debounce` with `maxWait`.
- Server-side, the same idea is "coalescing" requests or a rate limiter.
:::

::: ask
- *"Trailing, leading, or both?"*
- *"Do you need cancel/flush? A maxWait?"*
- *"Must it preserve `this` and the latest arguments? Return a value or a Promise?"*
:::

::: important ⭐ How to explain it in the interview
> "Debounce returns a wrapper that keeps one timer in a closure. Every call clears the previous timer and starts a new one, storing the latest arguments and this, so fn only runs after wait milliseconds without another call, with the last arguments. I add a leading option that runs on the first call of a burst, plus cancel and flush. In React I create it once with useMemo and cancel it on unmount. It's ideal for search boxes: 20 keystrokes become one or two requests."
:::

::: links
MDN: setTimeout / clearTimeout | https://developer.mozilla.org/en-US/docs/Web/API/setTimeout
LeetCode 2627: Debounce | https://leetcode.com/problems/debounce/
CSS-Tricks: debouncing and throttling explained | https://css-tricks.com/debouncing-throttling-explained-examples/
:::

=== Implement throttle
@p 3
@tags throttle, timers
@quick
- **throttle(fn, wait)**: run `fn` **at most once per `wait` ms**, no matter how often it's called.
- Timestamp version: run if `now − last >= wait` (leading). Add a trailing timer to also run the **last** call of a burst.
- Use for: scroll, mousemove, drag, resize, progress updates (steady rhythm while active).
- Debounce waits for silence; throttle guarantees regular updates.

::: text 🧾 Problem
Write `throttle(fn, wait)` that returns a function which calls `fn` **at most once every `wait` ms**. The first call runs immediately (leading). Bonus: also run once at the end with the latest arguments (trailing), so the final state isn't lost.

**Example:** scroll events every 50 ms for 1 second with `throttle(update, 300)` → `update` runs about **4 times** (at 0, 300, 600, 900 ms) instead of 20.
:::

::: text 🧒 Intuition
A **water tap with a timer**: no matter how many times you press the button, water comes out at most once every 3 seconds. Pressing faster doesn't give you more water. That's different from the elevator door (debounce), which waits until people **stop** coming.
:::

::: text 🐢 Brute force
**Naive idea:** handle every scroll event directly, or use debounce for scrolling.

**Result:** scroll fires 60+ times per second; running heavy work (layout reads, state updates) on each event causes jank. Debounce on scroll is also wrong for a "sticky header" or progress bar: nothing updates **while** the user scrolls, only after they stop.
:::

::: text 💡 Key insight
Remember **when `fn` last ran**. A call runs only if at least `wait` ms have passed; otherwise it's dropped (or saved as the trailing call). This caps the rate to `1000 / wait` calls per second regardless of the event frequency.

**Pattern name: Closure + timestamp (rate limiting on the client).**
:::

::: diagram Leading + trailing throttle
flowchart TD
  A["throttled(...args)"] --> B["remaining = wait - (now - lastRun)"]
  B --> C{"remaining <= 0?"}
  C -->|"yes"| D["clear trailing timer, lastRun = now, run fn(args)"]
  C -->|"no"| E["save args as the pending call"]
  E --> F{"trailing timer already set?"}
  F -->|"no"| G["setTimeout(run pending call, remaining)"]
  F -->|"yes"| H["do nothing (timer will use the newest args)"]
:::

::: image throttle: many scroll events but the function runs at 0, 300, 600 and 900 ms
/images/js-implementations/throttle.svg
:::

::: text 🔍 Dry run: wait = 300, events every 100 ms from 0 to 500 (leading + trailing)
| Time | now − lastRun | action |
|---|---|---|
| 0 | ∞ | **run** (lastRun = 0) |
| 100 | 100 | pending = args@100, timer → fires at 300 |
| 200 | 200 | pending = args@200 (timer already set) |
| 300 | timer fires | **run args@200** (lastRun = 300) |
| 400 | 100 | pending = args@400, timer → 600 |
| 500 | 200 | pending = args@500 |
| 600 | timer fires | **run args@500** (the trailing call) |

6 events → 3 runs, and the final state (args@500) is not lost.
:::

::: code javascript Implementation + tests (runnable, ~1 s)
/**
 * throttle(fn, wait): at most one call per `wait` ms, leading + trailing.
 */
function throttle(fn, wait = 300) {
  let lastRun = 0;          // timestamp of the last time fn actually ran
  let timer = null;         // trailing timer
  let pendingArgs = null, pendingThis = null;

  function run(ctx, args) {
    lastRun = Date.now();
    fn.apply(ctx, args);
  }

  function throttled(...args) {
    const remaining = wait - (Date.now() - lastRun);
    if (remaining <= 0) {               // enough time has passed → run now (leading edge)
      clearTimeout(timer);
      timer = null;
      pendingArgs = null;
      run(this, args);
    } else {                            // too soon → remember the newest call for the trailing edge
      pendingArgs = args;
      pendingThis = this;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pendingArgs) { run(pendingThis, pendingArgs); pendingArgs = null; }
        }, remaining);
      }
    }
  }
  throttled.cancel = () => { clearTimeout(timer); timer = null; pendingArgs = null; lastRun = 0; };
  return throttled;
}

// ---------- tests ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const runs = [];
  const t0 = Date.now();
  const onScroll = throttle((y) => runs.push({ y, at: Date.now() - t0 }), 200);
  for (let i = 0; i <= 10; i++) { onScroll(i * 10); await sleep(50); }  // 11 events over ~550 ms
  await sleep(250);                                                     // let the trailing call fire
  console.log('runs:', JSON.stringify(runs.map((r) => r.y)));
  console.log('far fewer runs than events →', runs.length, runs.length >= 3 && runs.length <= 5 ? '✅' : '❌ FAIL');
  const gapsOk = runs.every((r, i) => i === 0 || r.at - runs[i - 1].at >= 190);
  console.log('runs are ≥ 200 ms apart →', gapsOk ? '✅' : '❌ FAIL');
  console.log('first event ran immediately (leading) →', runs[0].y === 0 ? '✅' : '❌ FAIL');
  console.log('last event delivered (trailing) →', runs[runs.length - 1].y === 100 ? '✅' : '❌ FAIL');
})();
:::

::: code jsx Using it in React (scroll progress bar)
import { useEffect, useMemo, useState } from 'react';

// `throttle` is the function implemented above (utils/throttle.js)
export function ScrollProgress() {
  const [percent, setPercent] = useState(0);
  const onScroll = useMemo(
    () =>
      throttle(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setPercent(max > 0 ? Math.round((window.scrollY / max) * 100) : 0);
      }, 100), // at most 10 updates per second
    []
  );
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); onScroll.cancel(); };
  }, [onScroll]);
  return <div className="progress" style={{ width: percent + '%' }} />;
}
:::

::: chart bar Function runs during 1 s of scrolling (scroll fires every 16 ms ≈ 62 events)
Approach,Runs
No throttle,62
throttle 100 ms,10
throttle 300 ms,4
debounce 300 ms (until scrolling stops),0
:::

::: text ⚖️ Trade-offs
| Approach | Runs during activity | Pros | Cons | Choose when |
|---|---|---|---|---|
| No limiting | Every event | Most responsive | Jank, wasted work | Trivial handlers |
| **Throttle (leading + trailing)** | ≤ 1 per wait | Steady updates + correct final state | Slight lag | Scroll, drag, resize, analytics |
| Debounce | 0 until the end | Fewest calls | No feedback while active | Search input, autosave |
| `requestAnimationFrame` | ≤ 1 per frame | Synced with rendering | Only for visual updates | Animations, scroll-linked UI |
| `IntersectionObserver` | Event-driven | No scroll listener at all | Only for visibility questions | Lazy loading, infinite scroll |
:::

::: warning ⚠️ Common mistakes / edge cases
- No trailing call → the final scroll position / last drag update is lost.
- Creating the throttled function inside render (new state every time).
- Using a boolean "locked" flag with `setTimeout` but forgetting the latest arguments.
- Forgetting to remove the event listener and cancel the timer on unmount.
:::

::: understand
- Both throttle and debounce are **client-side rate limiters**. On the server the same ideas appear as token buckets and rate limiting middleware. Related: [LeetCode 2676: Throttle](https://leetcode.com/problems/throttle/), [Implement debounce](https://leetcode.com/problems/debounce/).
:::

::: ask
- *"Leading, trailing, or both?"*
- *"Should calls during the wait be dropped or delivered at the end?"*
- *"Is this for visual updates?"* (Then `requestAnimationFrame` may be better.)
:::

::: important ⭐ How to explain it in the interview
> "Throttle limits a function to at most one run per interval. I store the timestamp of the last run in a closure. If enough time has passed, I run immediately; otherwise I store the latest arguments and schedule a trailing timer for the remaining time, so the final state isn't lost. That turns 60 scroll events per second into, say, 10 updates. Debounce is different: it waits until events stop, which suits search boxes rather than scrolling."
:::

::: links
MDN: Scroll event performance | https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event
LeetCode 2676: Throttle | https://leetcode.com/problems/throttle/
CSS-Tricks: debouncing and throttling explained | https://css-tricks.com/debouncing-throttling-explained-examples/
:::

=== Implement Promise.all
@p 3
@tags promises, polyfill
@quick
- Return a new Promise; resolve with an array of results in **input order**, when **all** fulfil.
- **Reject immediately** on the first rejection (fail fast).
- Track `remaining`; store `results[i] = value` by index; wrap items with `Promise.resolve()` (non-promises allowed).
- Empty input → resolves `[]` immediately.

::: text 🧾 Problem
Implement `promiseAll(iterable)` that behaves like `Promise.all`:
- resolves with an array of all values, **in the same order as the input** (not the order they finished),
- rejects as soon as **any** input rejects, with that reason,
- accepts plain values too (treated as already resolved),
- resolves `[]` for an empty input.

**Example:** `promiseAll([delay(30, 'A'), delay(10, 'B'), 'C'])` → `['A', 'B', 'C']` after ~30 ms.
:::

::: text 🧒 Intuition
A **group dinner order**: the waiter brings the food only when **every** dish is ready, and each plate goes to the person who ordered it (input order), no matter which dish the kitchen finished first. If one dish can't be made, the waiter tells you **right away** instead of waiting for the others.
:::

::: text 🐢 Brute force
**Naive idea:** `await` each promise one after another in a loop.

`for (const p of promises) results.push(await p)`

**Result:** correct values, but if one rejects early you still wait for the earlier ones first, and if you **create** the async work inside the loop it runs **sequentially**: 3 requests of 1 s each take 3 s instead of 1 s. Another naive mistake: `results.push(value)` in `.then` callbacks puts results in **finishing** order.
:::

::: text 💡 Key insight
Subscribe to **all** promises at once (they already run in parallel), write each result into `results[index]` so order is kept, and count how many are still pending; resolve when the counter reaches 0. The first rejection calls `reject`; later calls to resolve/reject are ignored by the Promise automatically.

**Pattern name: Counting completions + index-based results.**
:::

::: diagram Promise.all flow
flowchart TD
  A["new Promise((resolve, reject))"] --> B{"input empty?"}
  B -->|"yes"| R0["resolve([])"]
  B -->|"no"| C["for each item i: Promise.resolve(item).then(...)"]
  C --> D["on value: results[i] = value, remaining--"]
  D --> E{"remaining === 0?"}
  E -->|"yes"| R["resolve(results)"]
  C --> F["on error: reject(error) (first one wins)"]
:::

::: image Promise.all: three promises finish at different times; results stay in input order
/images/js-implementations/promise-all.svg
:::

::: text 🔍 Dry run: [delay(30,'A'), delay(10,'B'), 'C']
| Time | event | results | remaining |
|---|---|---|---|
| 0 ms | subscribe to all 3 | [ , , ] | 3 |
| ~0 ms (microtask) | 'C' (plain value) fulfils | [ , , 'C'] | 2 |
| 10 ms | B fulfils | [ , 'B', 'C'] | 1 |
| 30 ms | A fulfils | ['A', 'B', 'C'] | 0 → **resolve** |
:::

::: code javascript Implementation + tests (runnable)
/**
 * Promise.all polyfill.
 */
function promiseAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);       // accept any iterable (arrays, Sets…)
    const results = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) { resolve([]); return; } // nothing to wait for

    items.forEach((item, i) => {
      Promise.resolve(item)                   // plain values become resolved promises
        .then((value) => {
          results[i] = value;                 // keep the INPUT order, not the finishing order
          remaining--;
          if (remaining === 0) resolve(results);
        })
        .catch(reject);                       // first rejection rejects the whole thing
    });
  });
}

// ---------- tests ----------
const delay = (ms, value, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms));
(async () => {
  const r = await promiseAll([delay(30, 'A'), delay(10, 'B'), 'C']);
  console.log('order kept →', JSON.stringify(r), JSON.stringify(r) === '["A","B","C"]' ? '✅' : '❌ FAIL');

  console.log('empty input →', JSON.stringify(await promiseAll([])), JSON.stringify(await promiseAll([])) === '[]' ? '✅' : '❌ FAIL');

  const t0 = Date.now();
  try {
    await promiseAll([delay(200, 'slow'), delay(20, 'boom', true)]);
    console.log('❌ FAIL should have rejected');
  } catch (e) {
    const ms = Date.now() - t0;
    console.log('fail fast →', e.message, 'after', ms, 'ms', e.message === 'boom' && ms < 150 ? '✅' : '❌ FAIL');
  }

  const t1 = Date.now();
  await promiseAll([delay(100, 1), delay(100, 2), delay(100, 3)]);
  const parallel = Date.now() - t1;
  console.log('runs in parallel (~100 ms, not 300) →', parallel, 'ms', parallel < 200 ? '✅' : '❌ FAIL');

  const same = await promiseAll(new Set([1, Promise.resolve(2)]));
  const real = await Promise.all(new Set([1, Promise.resolve(2)]));
  console.log('matches the built-in on a Set →', JSON.stringify(same), JSON.stringify(same) === JSON.stringify(real) ? '✅' : '❌ FAIL');
})();
:::

::: chart bar Total time for 3 requests of 1 s, 2 s and 1.5 s (seconds)
Approach,Seconds
await one by one (sequential),4.5
Promise.all (parallel),2
:::

::: text ⚖️ Trade-offs
| Method | Resolves when | Rejects when | Result | Use when |
|---|---|---|---|---|
| **Promise.all** | all fulfil | **first** rejection | values in input order | All results are required (page needs every piece) |
| Promise.allSettled | all settle | never | `{status, value / reason}` per item | Partial success is OK |
| Promise.race | first settles | first settles with an error | one value | Timeouts |
| Promise.any | first fulfils | **all** reject (AggregateError) | one value | Fastest mirror / fallback servers |
| Sequential `await` loop | one after another | first error | values | Requests depend on each other or must be rate-limited |
:::

::: warning ⚠️ Common mistakes / edge cases
- Pushing results in **finishing** order (`results.push`) instead of `results[i]`.
- Resolving when `results.length === n` (a sparse array can have length n early).
- Forgetting `Promise.resolve(item)` (plain values / thenables).
- Hanging forever on an empty array.
- Expecting `Promise.all` to **cancel** the other operations on failure: it doesn't; they keep running.
:::

::: understand
- Promises start running when **created**, not when awaited; `Promise.all` only waits. Related: [Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled), [Promise.race / any](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any), [LeetCode 2721: Execute Asynchronous Functions in Parallel](https://leetcode.com/problems/execute-asynchronous-functions-in-parallel/).
- For many requests, limit concurrency (a pool of N at a time) instead of firing thousands at once.
:::

::: ask
- *"Should it accept non-promise values and any iterable?"*
- *"Fail fast, or collect all errors?"* (Then allSettled.)
- *"Is there a concurrency limit?"*
:::

::: important ⭐ How to explain it in the interview
> "I return a new Promise. I convert each input with Promise.resolve so plain values work, subscribe to all of them at once so they run in parallel, and store each value at its index so the output keeps the input order. A counter of pending items reaches zero when everything has fulfilled, and then I resolve with the array. The first rejection calls reject; later settlements are ignored automatically. An empty input resolves immediately with an empty array."
:::

::: links
MDN: Promise.all | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
LeetCode 2721: Execute Async Functions in Parallel | https://leetcode.com/problems/execute-asynchronous-functions-in-parallel/
javascript.info: Promise API | https://javascript.info/promise-api
:::

=== Implement Promise.race and Promise.any
@p 2
@tags promises, polyfill
@quick
- **race**: settles like the **first** promise to settle (fulfil **or** reject).
- **any**: fulfils with the **first fulfilment**; rejects only if **all** reject, with an `AggregateError` of all reasons.
- Implementation: subscribe to all; race passes `resolve, reject` straight through; any counts rejections.
- Classic use: race → timeouts; any → fastest successful mirror.

::: text 🧾 Problem
Implement `promiseRace(iterable)` and `promiseAny(iterable)`:
- **race** resolves or rejects with the result of whichever input settles **first**.
- **any** resolves with the first input that **fulfils**; if every input rejects, it rejects with an `AggregateError` containing all reasons (in input order).

**Example:** `p0` rejects at 30 ms, `p1` fulfils "B" at 50 ms, `p2` fulfils "C" at 80 ms → race **rejects** (p0 was first), any **resolves "B"**.
:::

::: text 🧒 Intuition
- **race** is a **sprint**: whoever crosses the line first decides the result, even if they crossed it by tripping (rejecting).
- **any** is **asking several friends for a lift**: you take the first friend who says **yes**; you only give up if **everyone** says no.
:::

::: text 🐢 Brute force
**Naive idea:** `await` the promises one by one and return the first success.

**Result:** you wait for slow early promises even when a later one finished long ago: with mirrors answering in 900 ms, 50 ms and 300 ms, a sequential loop takes 900 ms to get an answer that was available after 50 ms. Polling `Promise` state isn't possible in JS (no synchronous status check).
:::

::: text 💡 Key insight
A Promise can only settle **once**; later `resolve`/`reject` calls are ignored. So for race, simply attach `resolve` and `reject` to every input: the first to settle wins. For any, attach `resolve` to each and **count** rejections; reject with all reasons when the count equals the number of inputs.

**Pattern name: First-settlement wins (settle-once semantics).**
:::

::: diagram race vs any
flowchart LR
  subgraph RACE["race"]
    R1["each input: .then(resolve, reject)"] --> R2["first settle decides"]
  end
  subgraph ANY["any"]
    A1["each input: .then(resolve)"] --> A2["first fulfil decides"]
    A3["each rejection: errors[i] = reason, count++"] --> A4{"count === n?"}
    A4 -->|"yes"| A5["reject(new AggregateError(errors))"]
  end
:::

::: image Promise.race vs Promise.any: p0 rejects first so race rejects; p1 fulfils first so any resolves B
/images/js-implementations/promise-race-any.svg
:::

::: text 🔍 Dry run: p0 rejects @30, p1 "B" @50, p2 "C" @80
| Time | event | race | any |
|---|---|---|---|
| 30 ms | p0 rejects | **rejects** (settled) | errors[0] = reason, count 1/3 |
| 50 ms | p1 fulfils "B" | ignored | **resolves "B"** |
| 80 ms | p2 fulfils "C" | ignored | ignored |
:::

::: code javascript Implementations + tests (runnable)
/** Promise.race polyfill: first to settle wins. */
function promiseRace(iterable) {
  return new Promise((resolve, reject) => {
    for (const item of iterable) {
      Promise.resolve(item).then(resolve, reject); // a Promise settles only once → the first call wins
    }
    // Note: an empty iterable leaves the promise pending forever (same as the built-in)
  });
}

/** Promise.any polyfill: first FULFILMENT wins; all rejected → AggregateError. */
function promiseAny(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const errors = new Array(items.length);
    let rejected = 0;
    if (items.length === 0) { reject(new AggregateError([], 'All promises were rejected')); return; }
    items.forEach((item, i) => {
      Promise.resolve(item).then(resolve, (reason) => {
        errors[i] = reason;                     // keep reasons in input order
        rejected++;
        if (rejected === items.length) reject(new AggregateError(errors, 'All promises were rejected'));
      });
    });
  });
}

/** Practical use of race: add a timeout to any promise. */
const withTimeout = (promise, ms) =>
  promiseRace([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after ' + ms + ' ms')), ms))]);

// ---------- tests ----------
const delay = (ms, value, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms));
(async () => {
  const mk = () => [delay(30, 'p0 failed', true), delay(50, 'B'), delay(80, 'C')];
  try { await promiseRace(mk()); console.log('❌ FAIL race should reject'); }
  catch (e) { console.log('race → rejects with', e.message, e.message === 'p0 failed' ? '✅' : '❌ FAIL'); }

  const a = await promiseAny(mk());
  console.log('any → resolves', a, a === 'B' ? '✅' : '❌ FAIL');

  try { await promiseAny([delay(10, 'x', true), delay(20, 'y', true)]); console.log('❌ FAIL any should reject'); }
  catch (e) { console.log('any, all rejected →', e.constructor.name, JSON.stringify(e.errors.map((x) => x.message)), e instanceof AggregateError && e.errors[1].message === 'y' ? '✅' : '❌ FAIL'); }

  console.log('race with a plain value →', await promiseRace([delay(50, 'slow'), 'instant']), '✅');

  try { await withTimeout(delay(300, 'too slow'), 50); console.log('❌ FAIL'); }
  catch (e) { console.log('timeout helper →', e.message, e.message.startsWith('timeout') ? '✅' : '❌ FAIL'); }
})();
:::

::: chart bar Time to get an answer from 3 mirrors answering in 900, 50 and 300 ms (ms)
Approach,Milliseconds
Sequential await until success,900
Promise.any,50
:::

::: text ⚖️ Trade-offs
| Method | Settles with | Rejects when | Typical use |
|---|---|---|---|
| **race** | the first settlement (success or error) | the first input rejects first | Timeouts, "whichever happens first" (user cancel vs. response) |
| **any** | the first success | every input rejected (AggregateError) | Redundant mirrors/CDNs, fallbacks |
| all | all values | first rejection | Need every result |
| allSettled | every outcome | never | Report partial success |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using race for "first success": a fast **failure** wins the race.
- Expecting the losers to be cancelled: they keep running (use `AbortController` to really cancel fetches).
- `promiseRace([])` stays pending forever (that's the spec), while `any([])` rejects immediately.
- Losing the order of reasons in `AggregateError`.
:::

::: understand
- "A promise settles only once" is the key fact that makes these polyfills tiny. Pairing `race` with `AbortController` gives real timeouts for `fetch`. Related: [LeetCode 2637: Promise Time Limit](https://leetcode.com/problems/promise-time-limit/).
:::

::: ask
- *"First settlement or first success?"*
- *"What should happen with an empty input?"*
- *"Should the slower operations be cancelled?"*
:::

::: important ⭐ How to explain it in the interview
> "Both subscribe to every input at once. For race I pass resolve and reject directly to each input's then; because a promise can only settle once, the first one to settle decides the result. For any I pass resolve for successes, but for failures I store the reason at its index and count; only when every input has rejected do I reject with an AggregateError of all the reasons. Race is great for timeouts, any for picking the fastest healthy mirror."
:::

::: links
MDN: Promise.race | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
MDN: Promise.any | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
LeetCode 2637: Promise Time Limit | https://leetcode.com/problems/promise-time-limit/
:::

=== Implement Promise.allSettled
@p 2
@tags promises, polyfill
@quick
- Waits for **every** input; **never rejects**.
- Result per item: `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`, in **input order**.
- Implementation = Promise.all over inputs mapped with `.then(ok, fail)` that both return objects.
- Use when partial success is acceptable (dashboards, batch uploads).

::: text 🧾 Problem
Implement `promiseAllSettled(iterable)`: resolve (never reject) with an array describing the outcome of each input, in input order:
`{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`.

**Example:** `[resolve(42), reject(Error('timeout')), 'ok']` → `[{fulfilled, 42}, {rejected, Error}, {fulfilled, 'ok'}]`.
:::

::: text 🧒 Intuition
A **school report card**: every subject gets a line, whether you passed or failed. The report is only handed out when **all** subjects are graded, and one failed subject doesn't stop the others from being reported.
:::

::: text 🐢 Brute force
**Naive idea:** wrap each await in try/catch inside a sequential loop.

`for (const p of ps) { try { out.push({ status: 'fulfilled', value: await p }) } catch (e) { out.push({ status: 'rejected', reason: e }) } }`

**Result:** correct, but if the work starts inside the loop it runs **one after another**: 3 widgets loading for 1 s each take 3 s instead of 1 s. Using `Promise.all` directly fails as soon as **one** widget fails, hiding all the good results.
:::

::: text 💡 Key insight
Turn every input into a promise that **always fulfils** with a status object (`.then(value → fulfilled object, reason → rejected object)`). Then `Promise.all` over those can never reject, keeps input order, and runs everything in parallel.

**Pattern name: Normalise outcomes, then Promise.all.**
:::

::: diagram Normalise each outcome
flowchart LR
  A["input i"] --> B["Promise.resolve(input)"]
  B -->|"fulfils"| C["{ status: 'fulfilled', value }"]
  B -->|"rejects"| D["{ status: 'rejected', reason }"]
  C --> E["Promise.all(all normalised) → never rejects"]
  D --> E
:::

::: image Promise.allSettled: each promise becomes a status object
/images/js-implementations/promise-allsettled.svg
:::

::: text 🔍 Dry run: [delay(20, 42), reject @10 'timeout', 'ok']
| Time | event | normalised result |
|---|---|---|
| ~0 ms | 'ok' (plain value) | [2] = { fulfilled, 'ok' } |
| 10 ms | input 1 rejects | [1] = { rejected, Error('timeout') } |
| 20 ms | input 0 fulfils 42 | [0] = { fulfilled, 42 } → all done, **resolve** |
:::

::: code javascript Implementation + tests (runnable)
/** Promise.allSettled polyfill: never rejects. */
function promiseAllSettled(iterable) {
  const normalised = Array.from(iterable, (item) =>
    Promise.resolve(item).then(
      (value) => ({ status: 'fulfilled', value }),   // success → status object
      (reason) => ({ status: 'rejected', reason })   // failure → status object (no throw!)
    )
  );
  return Promise.all(normalised);                   // these can't reject → neither can this
}

/** Same thing without Promise.all, using a counter (shows the mechanics). */
function promiseAllSettledManual(iterable) {
  return new Promise((resolve) => {
    const items = Array.from(iterable), out = new Array(items.length);
    let left = items.length;
    if (!left) return resolve([]);
    items.forEach((item, i) => {
      Promise.resolve(item)
        .then((value) => { out[i] = { status: 'fulfilled', value }; }, (reason) => { out[i] = { status: 'rejected', reason }; })
        .then(() => { if (--left === 0) resolve(out); });
    });
  });
}

// ---------- tests ----------
const delay = (ms, value, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms));
(async () => {
  const inputs = () => [delay(20, 42), delay(10, 'timeout', true), 'ok'];
  const r = await promiseAllSettled(inputs());
  const pretty = (arr) => JSON.stringify(arr.map((x) => (x.status === 'fulfilled' ? ['fulfilled', x.value] : ['rejected', x.reason.message])));
  console.log(pretty(r));
  console.log('statuses in input order →', pretty(r) === '[["fulfilled",42],["rejected","timeout"],["fulfilled","ok"]]' ? '✅' : '❌ FAIL');
  console.log('manual version agrees →', pretty(await promiseAllSettledManual(inputs())) === pretty(r) ? '✅' : '❌ FAIL');
  console.log('matches the built-in →', pretty(await Promise.allSettled(inputs())) === pretty(r) ? '✅' : '❌ FAIL');
  console.log('empty input →', JSON.stringify(await promiseAllSettled([])), (await promiseAllSettled([])).length === 0 ? '✅' : '❌ FAIL');
})();
:::

::: chart bar Widgets shown when 1 of 5 widget requests fails
Approach,Widgets shown
Promise.all (rejects),0
Promise.allSettled,4
:::

::: text ⚖️ Trade-offs
| Approach | Rejects? | Parallel? | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Promise.all | yes, first error | yes | Simple when everything is required | One failure hides all results | All-or-nothing |
| **Promise.allSettled** | never | yes | Shows partial success | Must check each status | Independent widgets, batch jobs |
| try/catch in a sequential loop | never | **no** | Easy to read | Slow | Requests must run in order |
| `Promise.all` + `.catch` on each input | never | yes | Custom fallback values per item | More code | Need a default value per failure |
:::

::: warning ⚠️ Common mistakes / edge cases
- Expecting `allSettled` to reject or throw: you must inspect `status`.
- Using `value` on rejected entries (it's `reason`).
- Swallowing errors silently: log or display the rejected ones.
- Forgetting that it still waits for the **slowest** input (add timeouts if needed).
:::

::: understand
- "Normalise outcomes into data" is a common technique for error handling in batches: the result of a batch upload, a health check of many services, or loading several dashboard widgets. Related: [Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all), [Promise.any](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any).
:::

::: ask
- *"Should one failure stop everything, or do we want partial results?"*
- *"Should failed items be retried?"*
- *"Is there a timeout per item?"*
:::

::: important ⭐ How to explain it in the interview
> "allSettled waits for every input and never rejects. I map each input through Promise.resolve and then attach both a success and a failure handler that return a status object: fulfilled with the value, or rejected with the reason. Since those wrapped promises can't reject, Promise.all over them resolves with all outcomes in input order, and everything still runs in parallel. It's what I use when partial success is fine, like loading independent dashboard widgets."
:::

::: links
MDN: Promise.allSettled | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
javascript.info: Promise API | https://javascript.info/promise-api
:::

=== Implement Array.prototype.map, filter, forEach and reduce
@p 3
@tags arrays, polyfill, prototype
@quick
- Callback signature `(element, index, array)`; respect `thisArg` (map/filter/forEach).
- **Skip holes** in sparse arrays (`i in this`); `map` keeps holes, `filter` drops them.
- `reduce` without an initial value uses the **first element** and starts at index 1; empty array without initial → `TypeError`.
- Put them on a test name (`myMap`) rather than overwriting built-ins.

::: text 🧾 Problem
Implement `myMap`, `myFilter`, `myForEach` and `myReduce` on `Array.prototype` that behave like the built-ins:
- `map(cb, thisArg)` → new array of `cb(el, i, arr)` results (same length),
- `filter(cb, thisArg)` → new array of elements where `cb` is truthy,
- `forEach(cb, thisArg)` → calls `cb` for side effects, returns `undefined`,
- `reduce(cb, initial)` → accumulates `cb(acc, el, i, arr)` into one value.

**Example:** `[1,2,3,4].myMap(x => x * 2) → [2,4,6,8]`, `.myReduce((a, x) => a + x, 0) → 10`.
:::

::: text 🧒 Intuition
An **assembly line** of items:
- **map** puts every item through a machine and keeps **every** result (same number of items out).
- **filter** is a **quality check**: only items that pass go through.
- **forEach** is a worker who **does something** with each item (stamps it, logs it) but produces nothing new.
- **reduce** is the **cash register**: it combines all items into one total.
:::

::: text 🐢 Brute force
**Naive versions** often get the details wrong rather than being slow:
- using `for...of` or `this.length` without checking `i in this` → callbacks run for **holes** in sparse arrays (`[1, , 3]`),
- arrow functions as the method → `this` is not the array,
- reduce that always starts at index 0 with `acc = undefined` → wrong results when no initial value is given.

All correct versions are **O(n)**; the interview tests whether you know the **spec details**.
:::

::: text 💡 Key insight
All four are **one loop over indices** with a callback; the differences are only in **what is collected**: every result (map), some elements (filter), nothing (forEach), or one accumulated value (reduce). Getting `this`, `thisArg`, holes and reduce's initial value right is the whole exercise.

**Pattern name: Higher-order functions / polyfills on the prototype.**
:::

::: diagram One loop, four collectors
flowchart LR
  L["for i = 0 .. length-1, skip holes"] --> M["map: out[i] = cb(el, i, arr)"]
  L --> F["filter: if cb(el, i, arr) → out.push(el)"]
  L --> E["forEach: cb(el, i, arr)"]
  L --> R["reduce: acc = cb(acc, el, i, arr)"]
:::

::: image map, filter and reduce: map doubles, filter keeps the even numbers, reduce sums
/images/js-implementations/array-methods.svg
:::

::: text 🔍 Dry run: [1, 2, 3, 4].myReduce((acc, x) => acc + x) (no initial value)
| Step | i | acc before | x | acc after |
|---|---|---|---|---|
| start | 0 | – | – | acc = arr[0] = 1, start at i = 1 |
| 1 | 1 | 1 | 2 | 3 |
| 2 | 2 | 3 | 3 | 6 |
| 3 | 3 | 6 | 4 | **10** |
:::

::: code javascript Implementations + tests (runnable)
// NOTE: we add NEW names (myMap…) instead of overwriting the built-ins.
/* eslint-disable no-extend-native */
Array.prototype.myMap = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  const arr = this, out = new Array(arr.length);            // same length (holes stay holes)
  for (let i = 0; i < arr.length; i++) {
    if (i in arr) out[i] = callback.call(thisArg, arr[i], i, arr); // skip holes like the built-in
  }
  return out;
};

Array.prototype.myFilter = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  const arr = this, out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i in arr && callback.call(thisArg, arr[i], i, arr)) out.push(arr[i]); // keep if truthy
  }
  return out;
};

Array.prototype.myForEach = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  for (let i = 0; i < this.length; i++) {
    if (i in this) callback.call(thisArg, this[i], i, this);
  }
  // returns undefined, like the built-in
};

Array.prototype.myReduce = function (callback, ...rest) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  const arr = this;
  let i = 0, acc;
  if (rest.length > 0) {
    acc = rest[0];                                   // initial value given (even if it's undefined)
  } else {
    while (i < arr.length && !(i in arr)) i++;       // find the first real element
    if (i >= arr.length) throw new TypeError('Reduce of empty array with no initial value');
    acc = arr[i++];                                  // use it as the start, continue after it
  }
  for (; i < arr.length; i++) {
    if (i in arr) acc = callback(acc, arr[i], i, arr);
  }
  return acc;
};

// ---------- tests ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nums = [1, 2, 3, 4];
const check = (label, got, expected) => console.log(label, '→', JSON.stringify(got), same(got, expected) ? '✅' : '❌ FAIL');
check('map ×2', nums.myMap((x) => x * 2), nums.map((x) => x * 2));
check('map with index', nums.myMap((x, i) => x + i), [1, 3, 5, 7]);
check('filter even', nums.myFilter((x) => x % 2 === 0), [2, 4]);
check('reduce sum (initial 0)', nums.myReduce((a, x) => a + x, 0), 10);
check('reduce sum (no initial)', nums.myReduce((a, x) => a + x), 10);
check('reduce to object', ['a', 'b', 'a'].myReduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {}), { a: 2, b: 1 });
let seen = [];
const ret = nums.myForEach((x) => seen.push(x));
console.log('forEach visits all, returns undefined →', same(seen, nums) && ret === undefined ? '✅' : '❌ FAIL');
const ctx = { factor: 10 };
check('thisArg is respected', nums.myMap(function (x) { return x * this.factor; }, ctx), [10, 20, 30, 40]);
const sparse = [1, , 3];                                   // index 1 is a hole
let visits = 0; sparse.myForEach(() => visits++);
console.log('holes are skipped →', visits, visits === 2 && sparse.myMap((x) => x * 2).length === 3 && !(1 in sparse.myMap((x) => x * 2)) ? '✅' : '❌ FAIL');
try { [].myReduce((a, b) => a + b); console.log('❌ FAIL should throw'); }
catch (e) { console.log('empty reduce without initial throws →', e instanceof TypeError ? '✅' : '❌ FAIL'); }
:::

::: chart bar Callback calls for an array of 1,000 elements where 500 are holes (sparse)
Implementation,Callback calls
Naive loop (no hole check),1000
Spec-correct (skips holes),500
:::

::: text ⚖️ Trade-offs
| Method | Returns | Can stop early? | Mutates? | Use when |
|---|---|---|---|---|
| **map** | new array, same length | no | no | Transform every element |
| **filter** | new array, ≤ length | no | no | Keep some elements |
| **forEach** | undefined | no (only by throwing) | no (but cb may) | Side effects (logging, DOM) |
| **reduce** | any single value | no | no | Sum, group, build objects |
| for loop / `for...of` | – | **yes** (`break`) | – | Need early exit or max speed |
| some / every / find | boolean / element | **yes** | no | Search with early exit |
:::

::: warning ⚠️ Common mistakes / edge cases
- Writing the polyfill as an **arrow function** → `this` isn't the array.
- Ignoring `thisArg`.
- Running callbacks on **holes**.
- reduce: treating "no initial value" the same as `initial = undefined` (use `arguments.length` / rest params).
- Overwriting the real built-ins in shared code (breaks libraries).
:::

::: understand
- These are **higher-order functions** (functions that take functions). Knowing their exact behaviour helps with React (`items.map` to render lists, `reduce` to build lookup objects). Related: [LeetCode 2635: Apply Transform Over Each Element](https://leetcode.com/problems/apply-transform-over-each-element-in-array/), [LeetCode 2634: Filter Elements from Array](https://leetcode.com/problems/filter-elements-from-array/), [LeetCode 2626: Array Reduce Transformation](https://leetcode.com/problems/array-reduce-transformation/).
:::

::: ask
- *"Should I handle sparse arrays and thisArg like the spec?"*
- *"Attach to the prototype, or write standalone functions?"*
- *"Should reduce throw on an empty array without an initial value?"*
:::

::: important ⭐ How to explain it in the interview
> "All four are a single loop over the indices that calls the callback with element, index and the array, using call with thisArg so this works. I skip holes with an 'in' check, like the spec. map stores each result at the same index, filter pushes elements whose callback is truthy, forEach returns undefined, and reduce starts from the initial value, or, if none is passed, from the first element and index 1, throwing a TypeError for an empty array. They're regular functions, not arrows, so this refers to the array."
:::

::: links
MDN: Array.prototype.map | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
MDN: Array.prototype.reduce | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce
LeetCode 2626: Array Reduce Transformation | https://leetcode.com/problems/array-reduce-transformation/
:::

=== Implement deepClone
@p 3
@tags deep-clone, recursion, objects
@quick
- Recursively copy objects and arrays; primitives and functions are returned as is.
- A **WeakMap original → copy** handles **cycles** and **shared references** (copied once).
- Special cases: `Date`, `RegExp`, `Map`, `Set`; keep the prototype with `Object.create(Object.getPrototypeOf(obj))`.
- Built-in today: `structuredClone(obj)` (but it can't clone functions or DOM nodes). `JSON.parse(JSON.stringify())` loses Dates, undefined, Maps and crashes on cycles.

::: text 🧾 Problem
Write `deepClone(value)` that returns a **deep copy**: changing anything inside the copy (at any depth) must not change the original. Handle nested objects/arrays, `Date`, `Map`, `Set`, `RegExp`, and **circular references**.

**Example:** `const b = deepClone(a); b.address.city = 'Pune'` → `a.address.city` is unchanged.
:::

::: text 🧒 Intuition
**Photocopying a folder of documents**: a *shallow* copy is a new folder that still holds the **same** papers (scribble on one, it's scribbled in both). A *deep* copy photocopies every paper, including papers inside sub-folders. If a paper says "see the folder you're in" (a cycle), you keep a **list of what you've already copied** so you don't copy forever.
:::

::: text 🐢 Brute force
**Naive approaches:**
- `{ ...obj }` / `Object.assign` → **shallow**: nested objects are shared.
- `JSON.parse(JSON.stringify(obj))` → turns `Date` into a string, drops `undefined` and functions, turns `Map`/`Set` into `{}`, `NaN`/`Infinity` into `null`, and **throws** on circular references.
- A recursive copy **without** a "seen" map → infinite recursion on cycles, and shared objects get duplicated (two copies where the original had one).
:::

::: text 💡 Key insight
Recurse through the structure, and before copying an object check a `WeakMap` of **already copied objects**. Register the new copy **before** copying its children, so a child that points back to the parent finds the copy instead of recursing forever. Special objects (Date, Map, Set, RegExp) need their own constructors.

**Pattern name: Recursive traversal + memo (visited map), like Clone Graph.**
:::

::: diagram deepClone(value, seen)
flowchart TD
  A["deepClone(value)"] --> B{"primitive or function?"}
  B -->|"yes"| R1["return value"]
  B -->|"no"| C{"seen.has(value)?"}
  C -->|"yes"| R2["return seen.get(value) (cycle / shared)"]
  C -->|"no"| D{"Date, RegExp, Map, Set?"}
  D -->|"yes"| E["build with its constructor, copy entries recursively"]
  D -->|"no"| F["copy = new array or Object.create(proto)"]
  F --> G["seen.set(value, copy) BEFORE recursing"]
  G --> H["copy[key] = deepClone(value[key]) for every own key"]
:::

::: image deepClone: nested address and tags plus a self cycle are copied into new objects via a WeakMap
/images/js-implementations/deep-clone.svg
:::

::: text 🔍 Dry run: a = { n: 1, address: { city: 'Delhi' } }, a.self = a
| Call | value | seen before | action |
|---|---|---|---|
| 1 | a | {} | new copy c, seen = {a → c} |
| 2 | a.n = 1 | | primitive → 1 |
| 3 | a.address | {a} | new copy d, seen += {address → d}; copy city |
| 4 | a.self (= a) | {a, address} | **found → return c** (no infinite loop) |

Result: `c.address !== a.address` and `c.self === c`.
:::

::: code javascript Implementation + tests (runnable)
/**
 * deepClone with cycle support. Time O(n) over all reachable values, Space O(n).
 */
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value; // primitives & functions: as is
  if (seen.has(value)) return seen.get(value);                   // already copied (cycle / shared ref)

  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const m = new Map();
    seen.set(value, m);
    value.forEach((v, k) => m.set(deepClone(k, seen), deepClone(v, seen)));
    return m;
  }
  if (value instanceof Set) {
    const s = new Set();
    seen.set(value, s);
    value.forEach((v) => s.add(deepClone(v, seen)));
    return s;
  }

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); // keep class prototype
  seen.set(value, copy);                                         // register BEFORE recursing
  for (const key of Reflect.ownKeys(value)) {                    // own string AND symbol keys
    copy[key] = deepClone(value[key], seen);
  }
  return copy;
}

// ---------- tests ----------
const original = {
  name: 'Vivek',
  born: new Date('1991-12-01'),
  tags: ['js', 'react'],
  address: { city: 'Delhi', geo: { lat: 28.6 } },
  skills: new Map([['node', 3]]),
  seenIds: new Set([1, 2]),
  greet() { return 'hi ' + this.name; },
};
original.self = original;                       // a cycle
original.shared1 = original.address;            // shared reference
const copy = deepClone(original);
copy.address.city = 'Pune';
copy.tags.push('node');
copy.skills.set('node', 5);
const checks = [
  ['nested object is a new object', copy.address !== original.address],
  ['original unchanged after editing the copy', original.address.city === 'Delhi' && original.tags.length === 2 && original.skills.get('node') === 3],
  ['Date copied as a Date', copy.born instanceof Date && copy.born.getTime() === original.born.getTime() && copy.born !== original.born],
  ['Map and Set copied', copy.skills instanceof Map && copy.seenIds instanceof Set && copy.seenIds.has(2)],
  ['cycle preserved (copy.self === copy)', copy.self === copy],
  ['shared reference stays shared in the copy', copy.shared1 === copy.address],
  ['methods still work', copy.greet() === 'hi Vivek'],
];
for (const [label, ok] of checks) console.log(label, ok ? '✅' : '❌ FAIL');
try { JSON.parse(JSON.stringify(original)); console.log('❌ FAIL JSON should throw on cycles'); }
catch (e) { console.log('JSON.stringify throws on the cycle (why we need our own) ✅'); }
:::

::: chart bar Features preserved by each approach (out of 6: nesting, Date, Map/Set, undefined, cycles, shared refs)
Approach,Features preserved
Spread / Object.assign,0
JSON round-trip,1
Recursive without seen map,4
deepClone with WeakMap,6
:::

::: text ⚖️ Trade-offs
| Approach | Deep? | Cycles | Dates / Map / Set | Functions | Choose when |
|---|---|---|---|---|---|
| `{ ...obj }`, `Object.assign` | no | – | shared | kept | Updating top-level fields (React state) |
| `JSON.parse(JSON.stringify())` | yes | **throws** | lost / broken | dropped | Plain JSON data only |
| `structuredClone(obj)` | yes | yes | yes | **throws** | Modern runtimes, plain data |
| **Custom deepClone + WeakMap** | yes | yes | yes (handled) | kept by reference | Interview / special needs |
| lodash `cloneDeep` | yes | yes | yes | kept | Production with lodash |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting the **seen** map → stack overflow on cycles.
- Registering the copy **after** copying children (the cycle check comes too late).
- `typeof null === 'object'`: check null first.
- Copying a `Date` as a plain object (loses its methods).
- Only copying string keys (`Object.keys`) and losing Symbol keys.
:::

::: understand
- Deep clone = graph traversal with a visited map, exactly like [Clone Graph](https://leetcode.com/problems/clone-graph/) and [Copy List with Random Pointer](https://leetcode.com/problems/copy-list-with-random-pointer/).
- In React you rarely need deep clones: update immutably along the changed path (`{ ...state, address: { ...state.address, city } }`).
:::

::: ask
- *"Which types must be supported: Date, Map, Set, class instances, functions?"*
- *"Can there be cycles?"*
- *"Can I use structuredClone?"*
:::

::: important ⭐ How to explain it in the interview
> "Primitives and functions are returned as is. For objects I first check a WeakMap of already-copied objects, which handles cycles and keeps shared references shared. Dates, RegExps, Maps and Sets get their own constructors; arrays and plain objects get a new container with the same prototype, which I register in the WeakMap before recursing into each own key. JSON round-tripping fails on cycles and loses Dates and Maps; in modern code structuredClone covers most cases except functions."
:::

::: links
MDN: structuredClone | https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
MDN: WeakMap | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap
javascript.info: object copying | https://javascript.info/object-copy
:::

=== Implement deepEqual
@p 2
@tags deep-equal, recursion
@quick
- Same reference or `Object.is(a, b)` (handles `NaN`) → true.
- Different types / one is null → false. Arrays vs objects must match.
- Compare **key counts**, then every key recursively.
- Dates by time, RegExps by source + flags; track visited pairs for cycles.

::: text 🧾 Problem
Write `deepEqual(a, b)` that returns `true` when two values are **structurally equal**: same primitive values, or objects/arrays with the same keys whose values are deeply equal (at every depth).

**Examples:** `deepEqual({ x: 1, y: [2, 3] }, { x: 1, y: [2, 3] }) → true`; `{ x: 1, y: [2, 3] }` vs `{ x: 1, y: [2, 4] }` → false; `NaN` vs `NaN` → true.
:::

::: text 🧒 Intuition
**Spot the difference** between two pictures: you compare them section by section, and each section piece by piece. As soon as one piece differs, the pictures are different. If every piece in every section matches (and neither picture has extra pieces), they're the same.
:::

::: text 🐢 Brute force
**Naive approaches:**
- `a === b` → only true for the **same object reference**.
- `JSON.stringify(a) === JSON.stringify(b)` → key **order** matters (`{a:1,b:2}` vs `{b:2,a:1}` → false), `undefined` values vanish, `NaN` becomes `null` (so `[NaN]` equals `[null]`!), Dates become strings, and cycles throw.
:::

::: text 💡 Key insight
Walk both structures **in parallel**: at each level check type, then key count, then recurse into each key. Exit early on the first difference. Use `Object.is` for primitives so `NaN` equals `NaN`.

**Pattern name: Parallel recursion over two structures (like Same Tree).**
:::

::: diagram deepEqual(a, b)
flowchart TD
  A["deepEqual(a, b)"] --> B{"Object.is(a, b)?"}
  B -->|"yes"| T["true"]
  B -->|"no"| C{"both non-null objects of the same kind?"}
  C -->|"no"| F["false"]
  C -->|"yes"| D{"Date / RegExp?"}
  D -->|"yes"| E["compare time / source + flags"]
  D -->|"no"| G{"same number of own keys?"}
  G -->|"no"| F
  G -->|"yes"| H["every key: b has it and deepEqual(a[key], b[key])"]
:::

::: image deepEqual: two object trees compared node by node; the leaves 3 and 4 differ
/images/js-implementations/deep-equal.svg
:::

::: text 🔍 Dry run: { x: 1, y: [2, 3] } vs { x: 1, y: [2, 4] }
| Step | comparing | result |
|---|---|---|
| 1 | two objects, 2 keys each | continue |
| 2 | key x: 1 vs 1 | equal |
| 3 | key y: two arrays, length 2 | continue |
| 4 | y[0]: 2 vs 2 | equal |
| 5 | y[1]: 3 vs 4 | **different → false** (stop) |
:::

::: code javascript Implementation + tests (runnable)
/**
 * deepEqual with NaN, Dates, RegExps, arrays vs objects, and cycles.
 * Time O(n) over all compared values.
 */
function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;                    // same reference, same primitive, NaN === NaN
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false; // [] vs {}
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;

  if (seen.get(a) === b) return true;                  // already comparing this pair (cycle)
  seen.set(a, b);

  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;     // extra or missing keys
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], seen)) return false; // first difference → stop
  }
  return true;
}

// ---------- tests ----------
const cycA = { v: 1 }; cycA.me = cycA;
const cycB = { v: 1 }; cycB.me = cycB;
const cases = [
  [{ x: 1, y: [2, 3] }, { x: 1, y: [2, 3] }, true],
  [{ x: 1, y: [2, 3] }, { x: 1, y: [2, 4] }, false],
  [{ a: 1, b: 2 }, { b: 2, a: 1 }, true],        // key order doesn't matter
  [NaN, NaN, true],
  [[NaN], [null], false],                         // JSON.stringify would say equal!
  [{ a: undefined }, {}, false],                  // key exists vs missing
  [[], {}, false],
  [new Date(0), new Date(0), true],
  [null, {}, false],
  [cycA, cycB, true],                             // cycles
  [1, '1', false],
];
const label = (v) => { try { return String(JSON.stringify(v) ?? v).slice(0, 25); } catch { return '(circular)'; } };
for (const [a, b, expected] of cases) {
  const got = deepEqual(a, b);
  console.log(label(a), 'vs', label(b), '→', got, got === expected ? '✅' : '❌ FAIL');
}
console.log('JSON trap: [NaN] vs [null] via stringify →', JSON.stringify([NaN]) === JSON.stringify([null]), '(wrong!) ✅ shown');
:::

::: chart bar Edge cases handled correctly (out of 6: key order, NaN, undefined keys, Dates, arrays vs objects, cycles)
Approach,Correct
a === b,0
JSON.stringify compare,2
deepEqual,6
:::

::: text ⚖️ Trade-offs
| Approach | Correct for nested data? | Handles key order | NaN / Dates / cycles | Choose when |
|---|---|---|---|---|
| `===` | only same reference | – | – | Identity checks (React memo) |
| `JSON.stringify` compare | sometimes | **no** | no / no / throws | Never for real comparisons |
| Shallow equal (1 level) | no | yes | partly | React `memo` / `PureComponent` props |
| **deepEqual** | yes | yes | yes | Tests, change detection |
| lodash `isEqual` / Node `assert.deepStrictEqual` | yes | yes | yes | Production / tests |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing key **counts** only one way (extra keys in b go unnoticed).
- Using `===` for primitives (`NaN !== NaN`).
- Treating `[]` and `{}` as equal (both are objects with 0 keys).
- `{ a: undefined }` vs `{}`: same `JSON.stringify`, but different keys.
- Infinite recursion on cycles.
:::

::: understand
- Parallel recursion over two structures is the same idea as [Same Tree](https://leetcode.com/problems/same-tree/). React relies on **shallow** equality for performance (`memo`, dependency arrays), which is why immutable updates matter.
:::

::: ask
- *"Should key order matter? Should NaN equal NaN?"*
- *"Compare prototypes/classes too, or only data?"*
- *"Can there be cycles? Maps and Sets?"*
:::

::: important ⭐ How to explain it in the interview
> "I start with Object.is, which covers same references, equal primitives and NaN. If either value isn't a non-null object, they're not equal. Then arrays must match arrays, prototypes must match, Dates compare by time. For plain objects I compare the number of own keys, then recurse into every key, returning false at the first difference. A WeakMap of pairs already being compared handles cycles. JSON.stringify isn't safe: key order, undefined and NaN all break it."
:::

::: links
MDN: Object.is | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
Node.js: assert.deepStrictEqual | https://nodejs.org/api/assert.html#assertdeepstrictequalactual-expected-message
:::

=== Implement flattenArray (with depth)
@p 3
@tags arrays, recursion, flatten
@quick
- Recursive: for each item, if it's an array **and depth > 0**, flatten it with `depth − 1`; else push it.
- `depth = Infinity` flattens everything; default depth **1** (like `Array.prototype.flat`).
- Iterative version with a **stack** avoids deep recursion.
- **O(n)** over all elements (n = total number of items at every level).

::: text 🧾 Problem
Implement `flatten(arr, depth = 1)` that behaves like `Array.prototype.flat(depth)`: nested arrays are unwrapped up to `depth` levels.

**Example:** `flatten([1, [2, [3, [4]], 5]])` → `[1, 2, [3, [4]], 5]`; with `Infinity` → `[1, 2, 3, 4, 5]`.
:::

::: text 🧒 Intuition
**Russian nesting dolls (matryoshka)**: you open a doll and put whatever is inside on the table. If you're told "open up to 2 levels", you open the outer doll and the dolls directly inside it, but leave deeper dolls closed.
:::

::: text 🐢 Brute force
**Naive idea:** repeatedly concatenate until nothing changes: `while (arr.some(Array.isArray)) arr = [].concat(...arr)`.

**Complexity:** each pass copies the whole array and only removes one level → O(n · d) for depth d; spreading a huge array into `concat(...)` can also exceed the argument limit (~65k–500k arguments depending on the engine). Using `toString().split(',')` is a hack that turns numbers into strings and breaks on strings containing commas.
:::

::: text 💡 Key insight
Treat it as a tree walk: each nested array is a subtree. Visiting each element **once** and only descending while `depth > 0` gives O(n). An explicit stack of `[item, depth]` pairs avoids recursion limits for very deep nesting.

**Pattern name: Recursion / DFS over nested structures.**
:::

::: diagram Flatten with depth
flowchart TD
  A["flatten(arr, depth)"] --> B["for each item"]
  B --> C{"Array.isArray(item) and depth > 0?"}
  C -->|"yes"| D["flatten(item, depth - 1) and append its items"]
  C -->|"no"| E["push item as is"]
  D --> B
  E --> B
:::

::: image flattenArray: nested array shown level by level; full flatten gives 1 2 3 4 5
/images/js-implementations/flatten.svg
:::

::: text 🔍 Dry run: flatten([1, [2, [3]]], 1)
| Item | is array? | depth | action | out |
|---|---|---|---|---|
| 1 | no | 1 | push | [1] |
| [2, [3]] | yes | 1 > 0 | recurse with depth 0 | |
| ↳ 2 | no | 0 | push | [1, 2] |
| ↳ [3] | yes | 0 → stop | push as is | [1, 2, [3]] |
:::

::: code javascript Recursive + iterative implementations, with tests (runnable)
/** Recursive flatten (like Array.prototype.flat). Time O(n), Space O(depth) recursion. */
function flatten(arr, depth = 1) {
  const out = [];
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) {
      out.push(...flatten(item, depth - 1));   // open one more level
    } else {
      out.push(item);                          // keep as is (a value, or an array we may not open)
    }
  }
  return out;
}

/** Iterative flatten with a stack: no recursion limit, keeps order. */
function flattenIterative(arr, depth = 1) {
  const stack = arr.map((item) => [item, depth]).reverse(); // reversed so we pop in order
  const out = [];
  while (stack.length) {
    const [item, d] = stack.pop();
    if (Array.isArray(item) && d > 0) {
      for (let i = item.length - 1; i >= 0; i--) stack.push([item[i], d - 1]); // children, in order
    } else {
      out.push(item);
    }
  }
  return out;
}

// ---------- tests ----------
const nested = [1, [2, [3, [4]], 5]];
const cases = [
  [nested, 1, [1, 2, [3, [4]], 5]],
  [nested, 2, [1, 2, 3, [4], 5]],
  [nested, Infinity, [1, 2, 3, 4, 5]],
  [nested, 0, nested],
  [[], 1, []],
  [[[['a']], 'b'], Infinity, ['a', 'b']],
];
for (const [arr, depth, expected] of cases) {
  const a = flatten(arr, depth), b = flattenIterative(arr, depth), builtin = arr.flat(depth);
  const ok = JSON.stringify(a) === JSON.stringify(expected) && JSON.stringify(b) === JSON.stringify(expected) && JSON.stringify(builtin) === JSON.stringify(expected);
  console.log(JSON.stringify(arr), 'depth', depth, '→', JSON.stringify(a), ok ? '✅' : '❌ FAIL');
}
// very deep nesting: 20,000 levels → recursion may overflow, the iterative version doesn't
let deep = [0];
for (let i = 1; i < 20000; i++) deep = [deep];
console.log('20,000 levels (iterative) →', flattenIterative(deep, Infinity).length === 1 ? '✅' : '❌ FAIL');
:::

::: chart line Element copies to fully flatten n elements nested d = 10 levels: concat per level vs one pass
n,Concat per level n·d,One pass n
100,1000,100
1000,10000,1000
10000,100000,10000
100000,1000000,100000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| `arr.flat(depth)` | O(n) | O(n) | Built in | – | Real code |
| Repeated `concat(...arr)` | O(n · d) | O(n) | Short | Slow, argument-count limits | Never |
| `toString().split(',')` | O(n) | O(n) | Tiny | Converts to strings, breaks on commas | Never |
| **Recursive with depth** | **O(n)** | O(d) stack | Clear | Stack overflow for very deep nesting | Interview answer |
| **Iterative stack** | **O(n)** | O(n) | No recursion limit | Slightly longer | Huge or unknown depth |
| `reduce` + recursion | O(n) | O(d) | Functional style | Creates many intermediate arrays if using concat | Style preference |
:::

::: warning ⚠️ Common mistakes / edge cases
- Ignoring `depth` (always flattening everything).
- Mutating the input array.
- `out.push(...hugeArray)` can hit argument limits for arrays with hundreds of thousands of items (push in a loop instead).
- Holes in sparse arrays: `flat` removes them; `for...of` turns them into `undefined` (ask if it matters).
:::

::: understand
- Nested arrays are trees; flattening is a DFS. Same idea: [Flatten Nested List Iterator](https://leetcode.com/problems/flatten-nested-list-iterator/), [Nested List Weight Sum](https://leetcode.com/problems/nested-list-weight-sum/), [LeetCode 2625: Flatten Deeply Nested Array](https://leetcode.com/problems/flatten-deeply-nested-array/).
:::

::: ask
- *"Default depth 1 like `flat`, or fully flatten?"*
- *"Can I use the built-in?"*
- *"How deep can the nesting get?"* (Recursion vs stack.)
:::

::: important ⭐ How to explain it in the interview
> "I loop over the items; if an item is an array and the remaining depth is above zero, I flatten it recursively with depth minus one and append its items, otherwise I push the item as is. Every element is visited once, so it's O(n). Infinity as depth flattens everything. For very deep nesting I'd use an explicit stack of item and depth pairs to avoid a stack overflow. In production I'd just use Array.prototype.flat."
:::

::: links
MDN: Array.prototype.flat | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
LeetCode 2625: Flatten Deeply Nested Array | https://leetcode.com/problems/flatten-deeply-nested-array/
:::

=== Implement groupBy
@p 2
@tags arrays, reduce, grouping
@quick
- One pass: `key = keyFn(item)`; `(result[key] ??= []).push(item)`.
- Return an object with a **null prototype** (or a `Map` when keys aren't strings).
- **O(n)** time, O(n) space.
- Built-ins now exist: `Object.groupBy(items, fn)` and `Map.groupBy(items, fn)`.

::: text 🧾 Problem
Implement `groupBy(items, keyFn)` that returns an object whose keys are `keyFn(item)` and whose values are arrays of the items with that key, in their original order. `keyFn` may also be a property name string.

**Example:** `groupBy(people, p => p.role)` → `{ dev: [Ana, Cy], design: [Bo, Ed], pm: [Di] }`.
:::

::: text 🧒 Intuition
**Sorting mail into pigeonholes**: read the label on each letter (the key), and drop the letter into the matching pigeonhole, creating a new pigeonhole the first time you see a new label. One walk through the pile is enough.
:::

::: text 🐢 Brute force
**Naive idea:** first collect the unique keys, then for each key `filter` the whole array.

`const keys = [...new Set(items.map(keyFn))]; keys.forEach(k => out[k] = items.filter(i => keyFn(i) === k))`

**Complexity:** O(n · k) for k distinct keys: with 100,000 orders and 10,000 customers that's 10⁹ `keyFn` calls instead of 100,000.
:::

::: text 💡 Key insight
A hash map (object or Map) lets you jump straight to the right bucket in O(1), so a **single pass** is enough: compute the key, create the bucket if missing, push.

**Pattern name: Hash map grouping (one pass).**
:::

::: diagram One pass into buckets
flowchart LR
  A["for each item"] --> B["key = keyFn(item)"]
  B --> C{"bucket exists?"}
  C -->|"no"| D["result[key] = []"]
  C -->|"yes"| E["result[key].push(item)"]
  D --> E
  E --> A
:::

::: image groupBy: five people grouped by role into dev, design and pm buckets
/images/js-implementations/group-by.svg
:::

::: text 🔍 Dry run: [Ana·dev, Bo·design, Cy·dev, Di·pm, Ed·design], key = role
| Item | key | new bucket? | result after |
|---|---|---|---|
| Ana | dev | yes | dev: [Ana] |
| Bo | design | yes | dev: [Ana], design: [Bo] |
| Cy | dev | no | dev: [Ana, Cy], design: [Bo] |
| Di | pm | yes | …, pm: [Di] |
| Ed | design | no | design: [Bo, Ed] |
:::

::: code javascript Implementation + tests (runnable)
/**
 * groupBy(items, keyFn | propertyName) → { key: items[] }. Time O(n), Space O(n).
 */
function groupBy(items, keyFn) {
  const getKey = typeof keyFn === 'function' ? keyFn : (item) => item[keyFn]; // allow 'role' shorthand
  const result = Object.create(null);           // no prototype → keys like "constructor" are safe
  for (const item of items) {
    const key = getKey(item);
    (result[key] ??= []).push(item);            // create the bucket on first use, then push
  }
  return result;
}

/** Map version: keeps non-string keys (objects, numbers) as they are. */
function groupByMap(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// ---------- tests ----------
const people = [
  { name: 'Ana', role: 'dev' }, { name: 'Bo', role: 'design' }, { name: 'Cy', role: 'dev' },
  { name: 'Di', role: 'pm' }, { name: 'Ed', role: 'design' },
];
const byRole = groupBy(people, (p) => p.role);
const names = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((p) => p.name)]));
console.log(JSON.stringify(names(byRole)));
console.log('groups and order →', JSON.stringify(names(byRole)) === '{"dev":["Ana","Cy"],"design":["Bo","Ed"],"pm":["Di"]}' ? '✅' : '❌ FAIL');
console.log('property-name shorthand →', JSON.stringify(names(groupBy(people, 'role'))) === JSON.stringify(names(byRole)) ? '✅' : '❌ FAIL');
const byParity = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? 'odd' : 'even'));
console.log('numbers by parity →', JSON.stringify(byParity), JSON.stringify(byParity) === '{"odd":[1,3,5],"even":[2,4]}' ? '✅' : '❌ FAIL');
const tricky = groupBy(['a'], () => 'constructor');
console.log('"constructor" key is safe →', Array.isArray(tricky.constructor) ? '✅' : '❌ FAIL');
const m = groupByMap([1.1, 1.9, 2.5], Math.floor);
console.log('Map version keeps number keys →', m.get(1).length === 2 && m.get(2)[0] === 2.5 ? '✅' : '❌ FAIL');
if (typeof Object.groupBy === 'function') console.log('matches Object.groupBy →', JSON.stringify(names(Object.groupBy(people, (p) => p.role))) === JSON.stringify(names(byRole)) ? '✅' : '❌ FAIL');
:::

::: chart line keyFn calls for n items with k = n/10 distinct keys: filter per key vs one pass
n,Filter per key n·k,One pass n
100,1000,100
1000,100000,1000
10000,10000000,10000
100000,1000000000,100000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Pros | Cons | Choose when |
|---|---|---|---|---|
| Filter per distinct key | O(n · k) | Readable | Slow with many keys | Never for big data |
| `reduce` building an object | O(n) | Functional style | Easy to accidentally copy objects each step (O(n²)) | Small data, if written carefully |
| **Loop + object (null prototype)** | **O(n)** | Fast, safe keys | Keys become strings | String keys |
| Loop + Map | O(n) | Any key type, keeps insertion order | Map instead of plain object | Object/number keys |
| `Object.groupBy` / `Map.groupBy` | O(n) | Built in (ES2024) | Needs a modern runtime | Production in modern environments |
:::

::: warning ⚠️ Common mistakes / edge cases
- `reduce((acc, x) => ({ ...acc, [k]: [...(acc[k] || []), x] }), {})` copies the accumulator every step → **O(n²)**.
- Using `{}` and a key like `"__proto__"` or `"constructor"` (prototype keys).
- Object keys are always strings: `1` and `"1"` merge (use a Map if that matters).
- Changing the order of items within a group.
:::

::: understand
- Grouping with a hash map is the same as [Group Anagrams](https://leetcode.com/problems/group-anagrams/) (key = sorted letters). In SQL it's `GROUP BY`, in MongoDB `$group`.
:::

::: ask
- *"Return an object or a Map? What types can keys be?"*
- *"Should keyFn also accept a property name?"*
- *"Must the order within groups be preserved?"*
:::

::: important ⭐ How to explain it in the interview
> "One pass with a hash map: for each item I compute the key, create an empty array for that key the first time, and push the item, which keeps the original order inside each group. That's O(n). I use an object with a null prototype so keys like 'constructor' are safe, or a Map when keys aren't strings. I'd avoid a reduce that spreads the accumulator every step because that's O(n²). Modern runtimes also have Object.groupBy and Map.groupBy."
:::

::: links
MDN: Object.groupBy | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy
LeetCode 2631: Group By | https://leetcode.com/problems/group-by/
:::

=== Implement memoize
@p 3
@tags memoization, caching, closures
@quick
- Cache results in a closure `Map` keyed by the arguments; return the cached value on a hit.
- Key: `args[0]` for one primitive argument, `JSON.stringify(args)` (or a custom resolver) for several.
- Only for **pure** functions; bound the cache (LRU / TTL) in long-running apps.
- Memoizing a recursive function only helps if the recursion calls the **memoized** version.

::: text 🧾 Problem
Write `memoize(fn, resolver?)` that returns a function which caches results: calling it again with the same arguments returns the stored result **without** calling `fn`. Support multiple arguments and an optional `resolver(...args)` that builds the cache key.

**Example:** `const slowSquare = memoize(n => { /* expensive */ return n * n })` → the second `slowSquare(9)` is instant and `fn` ran once.
:::

::: text 🧒 Intuition
A **student's homework notebook**: the first time a question comes up, they work it out and write the answer down. When the same question comes up again, they just **read the answer** from the notebook. It only works if the answer never changes for the same question (a pure function).
:::

::: text 🐢 Brute force
**Without memoization:** every call recomputes. For recursive functions with overlapping subproblems this is exponential: naive `fib(40)` makes **331,160,281** calls.

**A buggy memo:** a cache keyed with `String(args)` → `f(1, 2)` and `f('1,2')` collide; a cache stored **inside** the function body is recreated on every call and never hits.
:::

::: text 💡 Key insight
Keep the cache **in the closure** (created once, shared by all calls). Build a stable key from the arguments, check the cache first, and store the result after computing. For recursive functions, the recursive calls must go through the memoized wrapper so each subproblem is computed once: fib(40) needs 41 computations.

**Pattern name: Closure + hash map cache (memoization, the top-down DP tool).**
:::

::: diagram Cache hit or miss
flowchart TD
  A["memoized(...args)"] --> B["key = resolver(...args) or a default key"]
  B --> C{"cache.has(key)?"}
  C -->|"yes: hit"| D["return cache.get(key)"]
  C -->|"no: miss"| E["value = fn.apply(this, args)"]
  E --> F["cache.set(key, value)"]
  F --> G["return value"]
:::

::: image memoize: a call checks the cache by key; a hit returns the stored value, a miss computes and stores it
/images/js-implementations/memoize.svg
:::

::: text 🔍 Dry run: memoFib(5) where memoFib = memoize(n => n < 2 ? n : memoFib(n − 1) + memoFib(n − 2))
| Call | key | hit? | result stored |
|---|---|---|---|
| memoFib(5) | 5 | miss | needs 4 and 3 |
| memoFib(4) | 4 | miss | needs 3 and 2 |
| memoFib(3) | 3 | miss | needs 2 and 1 |
| memoFib(2) | 2 | miss | needs 1, 0 → 1 |
| memoFib(1), memoFib(0) | 1, 0 | miss | 1, 0 |
| memoFib(1) (from 3) | 1 | **hit** | – |
| memoFib(2) (from 4) | 2 | **hit** | – |
| memoFib(3) (from 5) | 3 | **hit** | → **5** |

6 computations instead of 15 calls; for n = 40: 41 vs 331 million.
:::

::: code javascript Implementation + tests (runnable)
/**
 * memoize(fn, resolver?) → cached version of fn. Each distinct key computes once.
 */
function memoize(fn, resolver) {
  const cache = new Map();                                   // lives in the closure, shared by all calls
  function memoized(...args) {
    const key = resolver
      ? resolver.apply(this, args)                           // custom key builder
      : args.length === 1 && (typeof args[0] !== 'object' || args[0] === null)
        ? args[0]                                            // fast path: one primitive argument
        : JSON.stringify(args);                              // several args / plain-data args
    if (cache.has(key)) return cache.get(key);               // hit (works even if the value is undefined)
    const value = fn.apply(this, args);                      // miss: compute once
    cache.set(key, value);
    return value;
  }
  memoized.cache = cache;                                    // expose for clearing / inspection
  return memoized;
}

// ---------- tests ----------
let computed = 0;
const slowSquare = memoize((n) => { computed++; return n * n; });
slowSquare(9); slowSquare(9); slowSquare(3);
console.log('fn runs once per distinct input →', computed, computed === 2 ? '✅' : '❌ FAIL');

let adds = 0;
const add = memoize((a, b) => { adds++; return a + b; });
add(1, 2); add(1, 2); add(2, 1);
console.log('multiple arguments →', adds, adds === 2 && add(1, 2) === 3 ? '✅' : '❌ FAIL');

let fibCalls = 0;
const memoFib = memoize((n) => { fibCalls++; return n < 2 ? n : memoFib(n - 1) + memoFib(n - 2); }); // recursion uses the memoized version
console.log('fib(40) =', memoFib(40), 'computed', fibCalls, 'times', memoFib(40) === 102334155 && fibCalls === 41 ? '✅' : '❌ FAIL');

const byId = memoize((user) => user.name.toUpperCase(), (user) => user.id); // resolver: key by id only
byId({ id: 1, name: 'ana' });
console.log('resolver uses a custom key →', byId({ id: 1, name: 'IGNORED' }), byId({ id: 1, name: 'x' }) === 'ANA' ? '✅' : '❌ FAIL');

let undefCalls = 0;
const maybe = memoize(() => { undefCalls++; return undefined; });
maybe('a'); maybe('a');
console.log('caches undefined results too →', undefCalls === 1 ? '✅' : '❌ FAIL');
:::

::: chart line Calls to compute fib(n): plain recursion vs memoized
n,Plain recursion,Memoized
10,177,11
20,21891,21
30,2692537,31
40,331160281,41
:::

::: text ⚖️ Trade-offs
| Approach | Pros | Cons | Choose when |
|---|---|---|---|
| No cache | Always fresh, no memory | Recomputes everything | Cheap or impure functions |
| **Unbounded Map cache** | Simple, fastest hits | Memory grows forever | Small key spaces, short-lived pages |
| LRU-bounded cache | Memory stays bounded | Evictions, more code | Long-running apps, many keys |
| WeakMap cache (object keys) | Entries vanish with the object | Only object keys | Caching per DOM node / object |
| React `useMemo` / `memo` | Built into React | Per component, last value only | Expensive render calculations |
:::

::: warning ⚠️ Common mistakes / edge cases
- Memoizing **impure** functions (random, time, network): returns stale data.
- Creating the cache inside the returned function (a new cache per call).
- Checking `if (cache.get(key))` → falsy results (0, '', undefined) are never cached.
- `JSON.stringify` keys: argument order matters, functions/undefined vanish, objects with different key order give different keys.
- Recursion that calls the **original** function instead of the memoized one.
:::

::: understand
- Memoization **is** top-down dynamic programming: see [Climbing Stairs](https://leetcode.com/problems/climbing-stairs/) and [Coin Change](https://leetcode.com/problems/coin-change/). Combine it with an [LRU Cache](https://leetcode.com/problems/lru-cache/) to bound memory. Related: [LeetCode 2623: Memoize](https://leetcode.com/problems/memoize/).
:::

::: ask
- *"Is the function pure? How many distinct inputs?"*
- *"Single or multiple arguments? Objects as arguments?"*
- *"Should the cache expire or be bounded?"*
:::

::: important ⭐ How to explain it in the interview
> "memoize returns a wrapper with a Map in its closure. Each call builds a key from the arguments, using the argument itself for a single primitive, JSON or a custom resolver otherwise. If the cache has the key it returns the stored value, otherwise it calls the original function, stores the result and returns it. It only makes sense for pure functions. For recursive functions the recursion must call the memoized version, which turns fib(40) from 331 million calls into 41. In long-running apps I'd bound the cache with LRU eviction."
:::

::: links
LeetCode 2623: Memoize | https://leetcode.com/problems/memoize/
MDN: Map | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
React: useMemo | https://react.dev/reference/react/useMemo
:::

=== Implement an LRU Cache
@p 3
@tags lru, hashmap, linked-list, design
@quick
- **Least Recently Used** cache: `get` and `put` in **O(1)**; when full, evict the entry unused for the longest time.
- Classic design: **HashMap key → node** + **doubly linked list** ordered by recency (head = newest, tail = oldest).
- JS shortcut: a `Map` keeps insertion order → on access `delete` + `set` moves a key to the end; evict `map.keys().next().value`.
- Used for API response caches, image caches, browser caches, DB buffer pools.

::: text 🧾 Problem
Design `LRUCache(capacity)` with:
- `get(key)` → the value or `-1`; marks the key as recently used,
- `put(key, value)` → insert or update; if the cache exceeds `capacity`, evict the **least recently used** key.

Both must run in **O(1)** average time.

**Example:** capacity 2: `put(1,1), put(2,2), get(1) → 1, put(3,3)` (evicts 2), `get(2) → -1`, `put(4,4)` (evicts 1), `get(1) → -1, get(3) → 3, get(4) → 4`.
:::

::: text 🧒 Intuition
A **small desk with room for 3 books**. Every time you use a book you put it on **top of the pile**. When you need space for a new book, you remove the one at the **bottom**, the book you haven't touched for the longest time. The hash map is your memory of *where* each book is in the pile, so you can pull it out instantly.
:::

::: text 🐢 Brute force
**Idea:** store entries in an array ordered by recency; on `get`, find the key (`findIndex`, O(n)), `splice` it out and push it to the end; evict with `shift()`.

**Complexity:** O(n) per operation (`findIndex`, `splice`, `shift` all shift or scan). With a cache of 10,000 entries and 10⁶ operations that's ~10¹⁰ steps. Storing timestamps and scanning for the oldest on eviction is also O(n).
:::

::: text 💡 Key insight
Two structures, each doing what it's fast at:
- a **hash map** finds a key's node in O(1),
- a **doubly linked list** moves a node to the front or removes the tail in O(1) (each node knows its prev and next, so no scanning).

Sentinel `head`/`tail` nodes remove all empty-list special cases.

**Pattern name: Hash map + doubly linked list (O(1) ordered cache).**
:::

::: diagram get and put
flowchart TD
  G["get(key)"] --> G1{"map has key?"}
  G1 -->|"no"| G2["return -1"]
  G1 -->|"yes"| G3["move node to the front, return node.value"]
  P["put(key, value)"] --> P1{"map has key?"}
  P1 -->|"yes"| P2["update value, move to the front"]
  P1 -->|"no"| P3["new node at the front, map.set(key, node)"]
  P3 --> P4{"size > capacity?"}
  P4 -->|"yes"| P5["remove the node before tail, map.delete(its key)"]
:::

::: image LRU Cache: map from keys to nodes and a doubly linked list from most to least recently used
/images/js-implementations/lru-cache.svg
:::

::: text 🔍 Dry run: capacity 2
| Operation | list (newest → oldest) | result |
|---|---|---|
| put(1, 1) | 1 | |
| put(2, 2) | 2, 1 | |
| get(1) | 1, 2 | 1 |
| put(3, 3) | 3, 1 (evict 2) | |
| get(2) | 3, 1 | −1 |
| put(4, 4) | 4, 3 (evict 1) | |
| get(1) | 4, 3 | −1 |
| get(3) | 3, 4 | 3 |
| get(4) | 4, 3 | 4 |
:::

::: code javascript Map + doubly linked list, and the JS Map shortcut, with tests (runnable)
/** Doubly linked list node. */
class Node {
  constructor(key, value) { this.key = key; this.value = value; this.prev = null; this.next = null; }
}

/**
 * LRU Cache with a hash map + doubly linked list. get/put O(1).
 */
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();                 // key → node
    this.head = new Node(null, null);     // sentinel: head.next is the MOST recent
    this.tail = new Node(null, null);     // sentinel: tail.prev is the LEAST recent
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }
  #remove(node) {                         // unlink a node in O(1)
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }
  #addToFront(node) {                     // insert right after head in O(1)
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }
  get(key) {
    const node = this.map.get(key);
    if (!node) return -1;
    this.#remove(node);                   // mark as most recently used
    this.#addToFront(node);
    return node.value;
  }
  put(key, value) {
    if (this.map.has(key)) {              // update existing key
      const node = this.map.get(key);
      node.value = value;
      this.#remove(node);
      this.#addToFront(node);
      return;
    }
    const node = new Node(key, value);
    this.map.set(key, node);
    this.#addToFront(node);
    if (this.map.size > this.capacity) {  // over capacity → evict the least recent
      const lru = this.tail.prev;
      this.#remove(lru);
      this.map.delete(lru.key);
    }
  }
  keys() {                                // newest → oldest (for tests / debugging)
    const out = [];
    for (let n = this.head.next; n !== this.tail; n = n.next) out.push(n.key);
    return out;
  }
}

/** JS shortcut: Map remembers insertion order, so delete + set = "move to newest". */
class LRUCacheMap {
  constructor(capacity) { this.capacity = capacity; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return -1;
    const value = this.map.get(key);
    this.map.delete(key); this.map.set(key, value);   // move to the end (newest)
    return value;
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value); // first key = oldest
  }
}

// ---------- tests ----------
for (const Impl of [LRUCache, LRUCacheMap]) {
  const c = new Impl(2);
  const out = [];
  c.put(1, 1); c.put(2, 2); out.push(c.get(1));
  c.put(3, 3); out.push(c.get(2));
  c.put(4, 4); out.push(c.get(1), c.get(3), c.get(4));
  console.log(Impl.name, 'sequence →', JSON.stringify(out), JSON.stringify(out) === '[1,-1,-1,3,4]' ? '✅' : '❌ FAIL');
  const u = new Impl(2);
  u.put('a', 1); u.put('b', 2); u.put('a', 10); u.put('c', 3); // updating 'a' makes 'b' the oldest
  console.log(Impl.name, 'update refreshes recency →', u.get('a') === 10 && u.get('b') === -1 ? '✅' : '❌ FAIL');
}
const big = new LRUCache(1000);
const t0 = Date.now();
for (let i = 0; i < 200000; i++) { big.put(i % 5000, i); big.get((i * 7) % 5000); }
console.log('400,000 operations in', Date.now() - t0, 'ms, size stays at capacity →', big.map.size === 1000 && big.keys().length === 1000 ? '✅' : '❌ FAIL');
:::

::: chart line Steps for 10,000 operations: array (find + splice, O(n)) vs map + linked list (O(1)), by capacity
capacity,Array based ~ops × capacity/2,Map + list ~ops
10,50000,10000
100,500000,10000
1000,5000000,10000
10000,50000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | get | put | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Array ordered by recency | O(n) | O(n) | Simple | Slow for big caches | Tiny caches |
| Timestamps + scan on eviction | O(1) | O(n) | Simple get | Eviction scans everything | Rare evictions |
| **Map + doubly linked list** | **O(1)** | **O(1)** | Language-independent design | More code | Interview "design it" answer |
| **JS Map insertion order** | **O(1)** | **O(1)** | Very short | Relies on JS Map ordering | JavaScript solutions / production JS |
| `lru-cache` npm package | O(1) | O(1) | TTL, size by bytes, battle-tested | Dependency | Production |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting to move a key to the front on **get** (it's a "use") or on **update**.
- Evicting before inserting when the key already exists (an update shouldn't evict).
- Singly linked list → removing a node is O(n) (you need `prev`).
- Not storing the **key** in the node (you can't delete it from the map on eviction).
- Capacity 0 / 1 edge cases.
:::

::: understand
- This is the standard "combine two data structures" design pattern. Related: [LFU Cache](https://leetcode.com/problems/lfu-cache/), [Design Browser History](https://leetcode.com/problems/design-browser-history/), [All O'one Data Structure](https://leetcode.com/problems/all-oone-data-structure/). Real systems: Redis `allkeys-lru` eviction, CDN caches, the OS page cache.
:::

::: ask
- *"What should get return for a missing key?"*
- *"Does updating a value count as a use?"*
- *"Should entries also expire after a time (TTL)?"*
- *"Thread safety / concurrent access?"* (Not an issue in single-threaded JS.)
:::

::: important ⭐ How to explain it in the interview
> "I need O(1) lookup and O(1) reordering, so I combine a hash map from key to node with a doubly linked list ordered by recency, using sentinel head and tail nodes. get finds the node in the map, unlinks it and re-inserts it after the head. put updates and moves an existing node, or inserts a new one at the front and, if the size exceeds capacity, removes the node before the tail and deletes its key from the map. Every step is pointer updates, so both operations are O(1). In JavaScript I can also exploit Map's insertion order: delete and re-set to move a key, and evict the first key."
:::

::: links
LeetCode 146: LRU Cache | https://leetcode.com/problems/lru-cache/
NeetCode video: LRU Cache | https://www.youtube.com/results?search_query=neetcode+lru+cache
npm: lru-cache | https://www.npmjs.com/package/lru-cache
:::
