@section JS Implementations (Polyfills)
@icon ⚡
@color #eab308
@desc Implement debounce, throttle, Promise.all/race/allSettled, map/filter/reduce/forEach, deepClone, deepEqual, flatten, groupBy, memoize and LRU cache from scratch.

=== Implement debounce
@p 3
@tags debounce, closures, timers
@quick
- Debounce = run the function only **after the calls stop** for `wait` ms (search input, resize, autosave).
- Core: closure holds `timer`; each call → `clearTimeout(timer)` + new `setTimeout`.
- Preserve `this` and arguments: `fn.apply(this, args)` (use a normal `function`, not an arrow, for the returned function).
- Extras: `leading` option, `cancel()`, `flush()`; in React use `useMemo`/`useRef` so it isn't recreated every render.
- Debounce = "wait for silence"; throttle = "at most once per interval".

::: text
**Debouncing** delays running a function until **`wait` ms have passed since the last call**. If it's called again before then, the timer resets.

**Use cases:** search-as-you-type (call the API only after the user stops typing), window resize handlers, form autosave, validation.

### Algorithm
1. Keep a `timer` in a closure.
2. On every call: clear the existing timer and start a new one.
3. When the timer fires, call the original function with the **latest** arguments and the correct `this`.

**Complexity:** O(1) per call.
:::

::: diagram Debounce timeline (wait = 300ms)
sequenceDiagram
  participant U as User typing
  participant D as debounced fn
  participant API as API call
  U->>D: "n" (t=0)
  U->>D: "no" (t=100) resets timer
  U->>D: "nod" (t=200) resets timer
  U->>D: "node" (t=250) resets timer
  Note over D: 300ms of silence
  D->>API: search("node") once at t=550
:::

::: code javascript Solution + tests (click ▶ Run)
function debounce(fn, wait = 300, { leading = false } = {}) {
  let timer = null;
  let lastArgs, lastThis;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    const callNow = leading && timer === null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!leading) fn.apply(lastThis, lastArgs);
    }, wait);
    if (callNow) fn.apply(this, args);
  }

  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  debounced.flush = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; fn.apply(lastThis, lastArgs); }
  };
  return debounced;
}

// ---------- tests ----------
const calls = [];
const search = debounce((q) => calls.push(q), 100);
search('n'); search('no'); search('nod'); search('node');
setTimeout(() => {
  console.log('trailing calls:', calls, calls.length === 1 && calls[0] === 'node' ? '✅' : '❌ FAIL');

  const lead = [];
  const onClick = debounce((x) => lead.push(x), 100, { leading: true });
  onClick(1); onClick(2); onClick(3);
  console.log('leading calls:', lead, lead.length === 1 && lead[0] === 1 ? '✅' : '❌ FAIL');

  // `this` is preserved
  const obj = { name: 'Vivek', greet: debounce(function () { console.log('this.name =', this.name, '✅'); }, 50) };
  obj.greet();
}, 200);
:::

::: code jsx Using it in React (search box)
import { useEffect, useMemo, useState } from 'react';

function SearchBox({ onSearch }) {
  const [text, setText] = useState('');
  // create ONCE — otherwise every render makes a new debounced fn and nothing is debounced
  const debouncedSearch = useMemo(() => debounce((q) => onSearch(q), 300), [onSearch]);
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]); // cleanup on unmount

  return <input value={text} onChange={(e) => { setText(e.target.value); debouncedSearch(e.target.value); }} />;
}
// Alternative: useDebounce(value, delay) hook + useQuery keyed on the debounced value
:::

::: ask
- Clarify: *"Trailing only, or leading edge too? Do you need cancel/flush? Should it return a promise with the result?"*
- Mention race conditions: debouncing reduces API calls, but you still need to **ignore stale responses** (AbortController / React Query keys).
:::

::: links
Debounce vs throttle visualised (CSS-Tricks) | https://css-tricks.com/debouncing-throttling-explained-examples/
lodash debounce source | https://github.com/lodash/lodash/blob/main/src/debounce.ts
:::

=== Implement throttle
@p 3
@tags throttle, timers
@quick
- Throttle = run **at most once every `interval` ms** (scroll, mousemove, resize, button spam, analytics).
- Timestamp version: run if `now - last >= interval` (leading call).
- Timer version adds a **trailing** call so the final state isn't lost.
- Debounce waits for a pause; throttle guarantees **regular execution** during continuous events.
- For animations prefer `requestAnimationFrame` throttling.

::: text
**Throttling** limits how often a function can run: at most once per `interval`, no matter how many times it's triggered.

| | Debounce | Throttle |
|---|---|---|
| Fires | After events **stop** for `wait` ms | At most every `interval` ms **while** events continue |
| Continuous scroll for 2s (interval 200ms) | 1 call (at the end) | ~10 calls |
| Use for | Search input, autosave, resize end | Scroll position, infinite scroll check, drag, rate-limiting clicks |
:::

::: chart bar Calls made during 2s of continuous scrolling (events every 16ms)
Strategy,Function calls
No limiting,125
Throttle 200ms,10
Debounce 200ms,1
:::

::: code javascript Solution (leading + trailing) + tests
function throttle(fn, interval = 200) {
  let last = 0;
  let timer = null;
  let pendingArgs = null, pendingThis = null;

  return function throttled(...args) {
    const now = Date.now();
    const remaining = interval - (now - last);
    if (remaining <= 0) {
      // leading / regular call
      clearTimeout(timer); timer = null;
      last = now;
      fn.apply(this, args);
    } else {
      // remember latest call → trailing execution
      pendingArgs = args; pendingThis = this;
      if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(pendingThis, pendingArgs);
        }, remaining);
      }
    }
  };
}

// ---------- tests ----------
const calls = [];
const onScroll = throttle((y) => calls.push(y), 100);
let y = 0;
const id = setInterval(() => onScroll((y += 10)), 10); // fire every 10ms
setTimeout(() => {
  clearInterval(id);
  setTimeout(() => {
    console.log('events fired: ~50, throttled calls:', calls.length, calls);
    console.log(calls.length >= 4 && calls.length <= 7 ? '✅ throttled' : '❌ FAIL');
    console.log('last value kept (trailing):', calls.at(-1) === y ? '✅' : '❌ FAIL');
  }, 150);
}, 500);
:::

::: ask
- *"Leading, trailing, or both?"* *"Should it be cancellable?"* *"Is this for animation?"* (Then use `requestAnimationFrame`.)
:::

::: links
MDN: requestAnimationFrame | https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
:::

=== Implement Promise.all
@p 3
@tags promises, polyfill
@quick
- Returns a promise that **resolves with an array of results in input order** when all resolve; **rejects immediately** on the first rejection.
- Accepts any **iterable**; non-promise values are wrapped with `Promise.resolve`.
- Track `completed` count; store each result at its **index** (not push, which breaks ordering).
- Empty input → resolves immediately with `[]`.
- Doesn't cancel the other promises on failure (they keep running).

::: code javascript Solution + tests
function promiseAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const results = new Array(items.length);
    let completed = 0;
    if (items.length === 0) return resolve([]);

    items.forEach((item, index) => {
      Promise.resolve(item)            // handle plain values & thenables
        .then((value) => {
          results[index] = value;      // keep ORIGINAL order
          completed += 1;
          if (completed === items.length) resolve(results);
        })
        .catch(reject);                // first rejection wins (later calls are ignored)
    });
  });
}

// ---------- tests ----------
const delay = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));

(async () => {
  const r1 = await promiseAll([delay(300, 'a'), delay(100, 'b'), 42]);
  console.log('order kept:', r1, JSON.stringify(r1) === '["a","b",42]' ? '✅' : '❌ FAIL');

  console.log('empty:', await promiseAll([]), '✅');

  try {
    await promiseAll([delay(200, 'x'), delay(50, 'boom', true)]);
    console.log('❌ FAIL should reject');
  } catch (e) {
    console.log('rejects fast with:', e.message, '✅');
  }

  const t = Date.now();
  await promiseAll([delay(200, 1), delay(200, 2), delay(200, 3)]);
  console.log('runs in parallel (~200ms):', Date.now() - t, 'ms');
})();
:::

::: understand
- Why store by **index**? Promises resolve in any order, but `Promise.all` guarantees **input order**.
- Why `Promise.resolve(item)`? The input may contain plain values or thenables.
- Follow-ups: implement **concurrency-limited** `promisePool(tasks, limit)`, `allSettled`, `any`, `race` (below).
:::

::: code javascript Follow-up: run async tasks with a concurrency limit
async function promisePool(tasks, limit = 2) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const wait = (ms, v) => () => new Promise((r) => setTimeout(() => { console.log('done', v); r(v); }, ms));
promisePool([wait(300, 1), wait(100, 2), wait(200, 3), wait(50, 4)], 2).then((r) => console.log('pool results:', r));
:::

::: ask
- *"Should I handle iterables (Set, generators) or just arrays?"* *"Do you want a concurrency limit?"* (A very common follow-up.)
:::

::: links
MDN: Promise.all | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
:::

=== Implement Promise.race and Promise.any
@p 2
@tags promises, polyfill
@quick
- `race`: settles with the **first settled** promise (resolve **or** reject). Empty input → stays pending forever.
- `any`: resolves with the **first fulfilled**; rejects with **AggregateError** only if **all** reject.
- Implementation: attach `.then(resolve, reject)` to each; the first call wins because promises settle only once.
- Use cases: race → **timeouts**; any → fastest mirror/CDN, fallback servers.

::: code javascript Solutions + tests
function promiseRace(iterable) {
  return new Promise((resolve, reject) => {
    for (const item of iterable) Promise.resolve(item).then(resolve, reject); // first settle wins
  });
}

function promiseAny(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const errors = new Array(items.length);
    let rejected = 0;
    if (!items.length) return reject(new AggregateError([], 'All promises were rejected'));
    items.forEach((item, i) => {
      Promise.resolve(item).then(resolve, (err) => {
        errors[i] = err;
        if (++rejected === items.length) reject(new AggregateError(errors, 'All promises were rejected'));
      });
    });
  });
}

// Practical: timeout helper using race
const withTimeout = (promise, ms) =>
  promiseRace([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${ms}ms`)), ms))]);

// ---------- tests ----------
const delay = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));
(async () => {
  console.log('race:', await promiseRace([delay(200, 'slow'), delay(50, 'fast')]), '✅ expect fast');
  try { await promiseRace([delay(200, 'ok'), delay(20, 'err', true)]); } catch (e) { console.log('race rejects first:', e.message, '✅'); }
  console.log('any:', await promiseAny([delay(20, 'x', true), delay(80, 'first success'), delay(10, 'y', true)]), '✅');
  try { await promiseAny([delay(10, 'a', true), delay(20, 'b', true)]); } catch (e) { console.log('any all failed:', e.constructor.name, e.errors.map((x) => x.message), '✅'); }
  try { await withTimeout(delay(500, 'data'), 100); } catch (e) { console.log(e.message, '✅'); }
})();
:::

::: ask
- *"For a timeout, should the underlying request be cancelled?"* Mention **AbortController**, because `race` doesn't cancel the loser.
:::

::: links
MDN: Promise.race | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
MDN: Promise.any | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
:::

=== Implement Promise.allSettled
@p 2
@tags promises, polyfill
@quick
- Waits for **all** promises to settle; **never rejects**.
- Result per item: `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`, in input order.
- Use when partial failures are OK (dashboard widgets, batch emails, multiple uploads).

::: code javascript Solution + tests
function promiseAllSettled(iterable) {
  const items = Array.from(iterable);
  return promiseAllLike(items.map((item) =>
    Promise.resolve(item).then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason })
    )
  ));
}
// allSettled = Promise.all over promises that never reject
function promiseAllLike(promises) {
  return new Promise((resolve) => {
    const out = []; let done = 0;
    if (!promises.length) resolve(out);
    promises.forEach((p, i) => p.then((r) => { out[i] = r; if (++done === promises.length) resolve(out); }));
  });
}

// ---------- tests ----------
const delay = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));
promiseAllSettled([delay(50, 'profile'), delay(10, 'orders failed', true), 7]).then((results) => {
  console.log(results.map((r) => (r.status === 'fulfilled' ? `✔ ${r.value}` : `✖ ${r.reason.message}`)));
  const ok = results[0].status === 'fulfilled' && results[1].status === 'rejected' && results[2].value === 7;
  console.log(ok ? '✅ all settled, order kept' : '❌ FAIL');
});
:::

::: ask
- *"Should failures be retried or reported?"* Typical pattern: `allSettled`, then show partial data plus error badges.
:::

::: links
MDN: Promise.allSettled | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
:::

=== Implement Array.prototype.map, filter, forEach and reduce
@p 3
@tags arrays, polyfill, prototype
@quick
- Attach to `Array.prototype` with a **regular function** (uses `this` = the array); callback gets `(element, index, array)` + optional `thisArg`.
- **Skip holes** in sparse arrays (`i in this`), like the native ones.
- `map` returns a new array of the same length; `filter` returns the elements where the callback is truthy; `forEach` returns `undefined`.
- `reduce`: with no initial value, use the first element and start at index 1; **empty array without initial value → TypeError**.
- Don't mutate the original array.

::: code javascript Solutions + tests
Array.prototype.myForEach = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  for (let i = 0; i < this.length; i++) {
    if (i in this) callback.call(thisArg, this[i], i, this); // skip holes in sparse arrays
  }
};

Array.prototype.myMap = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  const result = new Array(this.length);
  for (let i = 0; i < this.length; i++) {
    if (i in this) result[i] = callback.call(thisArg, this[i], i, this);
  }
  return result;
};

Array.prototype.myFilter = function (callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this && callback.call(thisArg, this[i], i, this)) result.push(this[i]);
  }
  return result;
};

Array.prototype.myReduce = function (callback, ...rest) {
  if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
  let i = 0;
  let acc;
  if (rest.length > 0) {
    acc = rest[0];
  } else {
    while (i < this.length && !(i in this)) i++;          // find first real element
    if (i >= this.length) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[i++];
  }
  for (; i < this.length; i++) {
    if (i in this) acc = callback(acc, this[i], i, this);
  }
  return acc;
};

// ---------- tests ----------
const nums = [1, 2, 3, 4];
const check = (label, a, b) => console.log(label, JSON.stringify(a) === JSON.stringify(b) ? '✅' : `❌ FAIL ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

check('map     ', nums.myMap((n) => n * 2), nums.map((n) => n * 2));
check('filter  ', nums.myFilter((n) => n % 2 === 0), nums.filter((n) => n % 2 === 0));
check('reduce  ', nums.myReduce((a, n) => a + n, 0), nums.reduce((a, n) => a + n, 0));
check('reduce no init', nums.myReduce((a, n) => a * n), nums.reduce((a, n) => a * n));
check('reduce → object', ['a', 'b', 'a'].myReduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {}), { a: 2, b: 1 });
const seen = []; [10, , 30].myForEach((v, i) => seen.push(i));
check('forEach skips holes', seen, [0, 2]);
check('thisArg ', [1, 2].myMap(function (n) { return n * this.k; }, { k: 10 }), [10, 20]);
try { [].myReduce((a, b) => a + b); console.log('❌ FAIL'); } catch (e) { console.log('empty reduce throws:', e.message, '✅'); }
:::

::: ask
- *"Should I handle sparse arrays and `thisArg`?"* Mentioning them shows attention to detail. Also mention not using arrow functions for prototype methods.
:::

::: links
MDN: Array.prototype.reduce | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce
:::

=== Implement deepClone
@p 3
@tags deep-clone, recursion, objects
@quick
- Shallow copy (`{...obj}`, `Object.assign`) copies only the **top level**; nested objects are shared references.
- Recursive clone: primitives/functions returned as is; handle **Array, Date, RegExp, Map, Set**, plain objects.
- Handle **circular references** with a `WeakMap` (original → clone).
- Modern built-in: **`structuredClone(obj)`** (handles cycles, Date, Map, Set; not functions/DOM nodes/class prototypes).
- `JSON.parse(JSON.stringify())` loses Dates, undefined, functions, Map/Set, Infinity/NaN, and breaks on cycles.

::: code javascript Solution + tests
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;       // primitives & functions
  if (seen.has(value)) return seen.get(value);                         // circular reference

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

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); // keep prototype
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {                          // includes symbol keys
    copy[key] = deepClone(value[key], seen);
  }
  return copy;
}

// ---------- tests ----------
const original = {
  name: 'Vivek',
  born: new Date('1991-12-01'),
  skills: ['react', { name: 'node', years: 4 }],
  meta: new Map([['k', { deep: true }]]),
  tags: new Set(['a', 'b']),
  greet() { return 'hi ' + this.name; },
};
original.self = original; // circular

const copy = deepClone(original);
copy.skills[1].years = 99;
copy.meta.get('k').deep = false;

console.log('nested array object independent:', original.skills[1].years === 4 ? '✅' : '❌ FAIL');
console.log('map values independent:', original.meta.get('k').deep === true ? '✅' : '❌ FAIL');
console.log('date cloned:', copy.born instanceof Date && copy.born !== original.born ? '✅' : '❌ FAIL');
console.log('circular handled:', copy.self === copy ? '✅' : '❌ FAIL');
console.log('method works:', copy.greet());

// Compare with JSON approach
const viaJson = JSON.parse(JSON.stringify({ d: new Date(), u: undefined, n: NaN }));
console.log('JSON clone loses types:', viaJson);
console.log('structuredClone exists:', typeof structuredClone === 'function');
:::

::: ask
- *"Which types must be supported? Functions? Class instances (keep prototype)? Circular refs? Symbols? Getters?"* Asking this is the point of the question.
:::

::: links
MDN: structuredClone | https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
:::

=== Implement deepEqual
@p 2
@tags deep-equal, recursion
@quick
- Same reference / `Object.is` → equal (handles `NaN`).
- Different types or one null → not equal.
- Arrays: same length + every index deepEqual. Objects: same key count + every key deepEqual.
- Special: Date (compare time), RegExp (source+flags), Map/Set; cycles via a WeakMap of pairs.
- Used in memo comparisons, tests (`toEqual`), React dependency checks.

::: code javascript Solution + tests
function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  // cycle protection: if we've compared a with b before, assume equal
  if (seen.get(a) === b) return true;
  seen.set(a, b);

  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  if (a instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), seen)) return false;
    return true;
  }
  if (a instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false; // primitives in sets
    return true;
  }

  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], seen));
}

// ---------- tests ----------
const t = (label, got, expected) => console.log(label.padEnd(28), got === expected ? '✅' : '❌ FAIL');
t('primitives', deepEqual(1, 1), true);
t('NaN', deepEqual(NaN, NaN), true);
t('nested objects', deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
t('different values', deepEqual({ a: 1 }, { a: 2 }), false);
t('extra key', deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
t('array vs object', deepEqual([1], { 0: 1 }), false);
t('dates', deepEqual(new Date(5), new Date(5)), true);
t('maps', deepEqual(new Map([['x', [1]]]), new Map([['x', [1]]])), true);
const c1 = { v: 1 }; c1.self = c1; const c2 = { v: 1 }; c2.self = c2;
t('circular', deepEqual(c1, c2), true);
t('null vs object', deepEqual(null, {}), false);
:::

::: ask
- *"Should key order matter? Should `undefined` properties count? Class instances with the same fields but different prototypes?"*
:::

::: links
Node assert.deepStrictEqual | https://nodejs.org/api/assert.html#assertdeepstrictequalactual-expected-message
:::

=== Implement flattenArray (with depth)
@p 3
@tags arrays, recursion, flatten
@quick
- Recursive: for each item, if it's an array and depth > 0 → flatten(item, depth - 1), else push.
- Iterative with a **stack** avoids call-stack overflow for very deep arrays.
- Built-in: `arr.flat(depth)`, `arr.flat(Infinity)`.
- Also know: flatten a **nested object** into dot keys (`{ 'a.b.c': 1 }`), which is common for forms/query params.

::: code javascript Solutions + tests
// 1) Recursive with depth (like Array.prototype.flat)
function flatten(arr, depth = 1) {
  const result = [];
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) result.push(...flatten(item, depth - 1));
    else result.push(item);
  }
  return result;
}

// 2) Reduce one-liner (infinite depth)
const flattenDeep = (arr) => arr.reduce((acc, x) => acc.concat(Array.isArray(x) ? flattenDeep(x) : x), []);

// 3) Iterative with a stack (no recursion, keeps order)
function flattenIterative(arr) {
  const stack = [...arr];
  const result = [];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);
    else result.push(next);
  }
  return result.reverse();
}

// 4) Bonus: flatten nested OBJECT into dot-notation keys
function flattenObject(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) flattenObject(v, key, out);
    else out[key] = v;
  }
  return out;
}

// ---------- tests ----------
const input = [1, [2, [3, [4, [5]]]], 6];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log('depth 1  :', JSON.stringify(flatten(input)), eq(flatten(input), input.flat()) ? '✅' : '❌ FAIL');
console.log('depth 2  :', JSON.stringify(flatten(input, 2)), eq(flatten(input, 2), input.flat(2)) ? '✅' : '❌ FAIL');
console.log('deep     :', JSON.stringify(flattenDeep(input)), eq(flattenDeep(input), input.flat(Infinity)) ? '✅' : '❌ FAIL');
console.log('iterative:', JSON.stringify(flattenIterative(input)), eq(flattenIterative(input), [1, 2, 3, 4, 5, 6]) ? '✅' : '❌ FAIL');
console.log('object   :', flattenObject({ user: { name: 'V', address: { city: 'Delhi' } }, active: true }));
:::

::: ask
- *"Infinite depth or a given depth? Very deep nesting (stack overflow risk)? Preserve holes?"*
:::

::: links
MDN: Array.prototype.flat | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
:::

=== Implement groupBy
@p 2
@tags arrays, reduce, grouping
@quick
- `groupBy(items, keyFn | 'prop')` → `{ key: [items...] }` using `reduce` or a loop.
- Accept a function **or** a property name.
- Built-in (ES2024): `Object.groupBy(items, fn)` and `Map.groupBy` (Map keeps non-string keys).
- Used for grouping transactions by date, users by city, dashboard aggregations.

::: code javascript Solution + tests
function groupBy(items, keyOrFn) {
  const getKey = typeof keyOrFn === 'function' ? keyOrFn : (item) => item[keyOrFn];
  return items.reduce((groups, item, index) => {
    const key = getKey(item, index);
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

// Map version keeps key types (numbers, objects, dates)
function groupByToMap(items, fn) {
  const map = new Map();
  for (const item of items) {
    const key = fn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// ---------- tests ----------
const users = [
  { name: 'Vivek', city: 'Delhi', age: 32 },
  { name: 'Asha', city: 'Pune', age: 27 },
  { name: 'Rahul', city: 'Delhi', age: 41 },
];
console.log(groupBy(users, 'city'));
console.log(groupBy(users, (u) => (u.age >= 30 ? '30+' : 'under 30')));
console.log(groupBy([1.2, 1.8, 2.1], Math.floor));
console.log(groupByToMap(users, (u) => u.age > 30));
const g = groupBy(users, 'city');
console.log(g.Delhi.length === 2 && g.Pune.length === 1 ? '✅' : '❌ FAIL');
if (typeof Object.groupBy === 'function') console.log('native Object.groupBy:', Object.groupBy(users, (u) => u.city));
:::

::: ask
- *"Return an object or a Map? Should the key function receive the index? Should groups be sorted?"*
:::

::: links
MDN: Object.groupBy | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy
:::

=== Implement memoize
@p 3
@tags memoization, caching, closures
@quick
- Cache results of a **pure** function by its arguments; same args → return cached value.
- Key: `JSON.stringify(args)` or a custom **resolver**; Map for O(1) lookups.
- Preserve `this`; expose `cache.clear()`; consider max size / TTL (unbounded caches leak memory).
- Memoize **async** functions by caching the **promise** (dedupes in-flight calls; delete on rejection).
- React equivalents: `useMemo`, `React.memo`, `useCallback`; libraries: reselect.

::: code javascript Solution + tests
function memoize(fn, { resolver = (...args) => JSON.stringify(args), maxSize = Infinity } = {}) {
  const cache = new Map();
  function memoized(...args) {
    const key = resolver(...args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    if (cache.size > maxSize) cache.delete(cache.keys().next().value); // evict oldest
    // async support: don't cache failures
    if (result && typeof result.then === 'function') result.catch(() => cache.delete(key));
    return result;
  }
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  return memoized;
}

// ---------- tests ----------
let calls = 0;
const slowSquare = (n) => { calls++; for (let i = 0; i < 1e6; i++); return n * n; };
const fastSquare = memoize(slowSquare);
fastSquare(9); fastSquare(9); fastSquare(9);
console.log('computed once:', calls === 1 ? '✅' : '❌ FAIL', 'value', fastSquare(9));

// Classic: memoized fibonacci (exponential → linear)
const fib = memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
console.time('fib(90)'); console.log('fib(90) =', fib(90)); console.timeEnd('fib(90)');

// Async dedupe: two concurrent calls → one "request"
let requests = 0;
const fetchUser = memoize((id) => { requests++; return new Promise((r) => setTimeout(() => r({ id }), 50)); });
Promise.all([fetchUser(1), fetchUser(1)]).then(() => console.log('in-flight dedupe:', requests === 1 ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Is the function pure? How are arguments compared (objects by reference or value)? Cache size limit or TTL?"*
:::

::: links
MDN: Map | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
:::

=== Implement an LRU Cache
@p 3
@tags lru, hashmap, linked-list, design
@quick
- LRU = evict the **Least Recently Used** item when capacity is exceeded; `get` and `put` in **O(1)**.
- Classic: **HashMap (key → node) + Doubly Linked List** (most recent at the head, LRU at the tail).
- JS shortcut: `Map` keeps insertion order → on get: delete + re-set (moves to the end); evict `map.keys().next().value`.
- Interviewers usually want the DLL version to see pointer handling.
- Uses: API/DB caches, browser caches, React Query GC, CDN edge caches.

::: text
### Requirements
- `get(key)` → value or -1; marks the key as **most recently used**.
- `put(key, value)` → insert/update; if over capacity, **evict the least recently used**.
- Both **O(1)**.

### Why HashMap + Doubly Linked List?
- **HashMap** gives O(1) lookup of the node.
- **Doubly linked list** gives O(1) removal from the middle (we have prev/next pointers) and O(1) insertion at the head.
- **Sentinel** head/tail nodes remove edge cases (empty list, single node).
:::

::: diagram
flowchart LR
  subgraph MAP["HashMap: key → node"]
    K1["k=1"]
    K2["k=2"]
    K3["k=3"]
  end
  H["HEAD sentinel"] <--> N3["3: most recent"] <--> N1["1"] <--> N2["2: least recent"] <--> T["TAIL sentinel"]
  K1 -.-> N1
  K2 -.-> N2
  K3 -.-> N3
:::

::: code javascript Solution 1: HashMap + Doubly Linked List (what interviewers want)
class Node {
  constructor(key, value) { this.key = key; this.value = value; this.prev = null; this.next = null; }
}

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = new Node(null, null); // most recent side
    this.tail = new Node(null, null); // least recent side
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }
  #remove(node) { node.prev.next = node.next; node.next.prev = node.prev; }
  #addToFront(node) {
    node.next = this.head.next; node.prev = this.head;
    this.head.next.prev = node; this.head.next = node;
  }
  get(key) {
    const node = this.map.get(key);
    if (!node) return -1;
    this.#remove(node); this.#addToFront(node);    // mark as recently used
    return node.value;
  }
  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value = value;
      this.#remove(node); this.#addToFront(node);
      return;
    }
    const node = new Node(key, value);
    this.map.set(key, node);
    this.#addToFront(node);
    if (this.map.size > this.capacity) {
      const lru = this.tail.prev;                   // least recently used
      this.#remove(lru);
      this.map.delete(lru.key);
    }
  }
  keys() { const out = []; for (let n = this.head.next; n !== this.tail; n = n.next) out.push(n.key); return out; }
}

// ---------- tests (LeetCode 146 example) ----------
const c = new LRUCache(2);
c.put(1, 1); c.put(2, 2);
console.log(c.get(1) === 1 ? '✅' : '❌ FAIL', 'get(1)=1, order', c.keys());
c.put(3, 3); // evicts 2
console.log(c.get(2) === -1 ? '✅' : '❌ FAIL', 'get(2)=-1 (evicted)');
c.put(4, 4); // evicts 1
console.log(c.get(1) === -1 ? '✅' : '❌ FAIL', 'get(1)=-1 (evicted)');
console.log(c.get(3) === 3 && c.get(4) === 4 ? '✅' : '❌ FAIL', 'get(3)=3, get(4)=4, order', c.keys());
:::

::: code javascript Solution 2: using Map insertion order (concise)
class LRU {
  constructor(capacity) { this.capacity = capacity; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return -1;
    const value = this.map.get(key);
    this.map.delete(key); this.map.set(key, value); // move to most-recent end
    return value;
  }
  put(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value); // oldest first
  }
}
const l = new LRU(2); l.put('a', 1); l.put('b', 2); l.get('a'); l.put('c', 3);
console.log([...l.map.keys()], JSON.stringify([...l.map.keys()]) === '["a","c"]' ? '✅ b evicted' : '❌ FAIL');
:::

::: ask
- *"Is Map allowed, or should I implement the linked list?"* *"Thread safety / TTL / size in bytes?"* (Follow-ups: LFU cache, TTL cache.)
:::

::: links
LeetCode 146: LRU Cache | https://leetcode.com/problems/lru-cache/
:::
