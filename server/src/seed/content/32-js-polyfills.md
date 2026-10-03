@section Array & Function Polyfills
@icon 🛠️
@color #eab308
@desc Write them yourself: call/apply/bind (with new), some/every/find/findIndex/includes, flat/flatMap, slice/splice, Array.from/isArray. Each with tests you can run. (map, filter, forEach, reduce, Promise.all and friends are in "Polyfills & Implementations".)

=== Implement call, apply and bind (including bind with new)
@p 3
@tags javascript, polyfill, call, apply, bind, this
@quick
- **call**: put the function on the context under a unique `Symbol` key, call it as `ctx[key](...args)` so `this = ctx`, then delete the key.
- `null`/`undefined` context → `globalThis` (sloppy-mode behaviour); primitives → wrap with `Object(ctx)`.
- **apply** = call with an array (or array-like) of arguments; `null`/`undefined` args → no arguments.
- **bind** returns a function that calls the original with the bound `this` and **preset + new arguments**.
- Full bind: if the bound function is used with `new`, ignore the bound `this` (check `this instanceof bound`) and link the prototype so `instanceof` works.

::: text 🧒 In simple words
`call` is like **borrowing a friend's phone** to make one call as if you were them: you pick it up, make the call, and give it back immediately. `bind` is like **saving their number in a speed-dial button**: you can press it later, and it always calls as them.
:::

::: text 📖 Detailed answer
### How call sets this
The only way plain JS can choose `this` (without call/apply/bind) is a **method call**: `obj.fn()` gives `this = obj`. So the polyfill temporarily makes the function a method of the context:
1. `const key = Symbol('fn')` (a unique key can't overwrite an existing property).
2. `ctx[key] = this` (inside `myCall`, `this` is the function being called).
3. `const result = ctx[key](...args)`.
4. `delete ctx[key]` (in `finally`, so it's removed even on errors), return the result.

### apply
Same as call but takes `args` as one array: `fn.myApply(ctx, [a, b])`.

### bind (the interview favourite)
| Requirement | How |
|---|---|
| Fix `this` | `fn.apply(ctx, …)` inside the returned function |
| Partial application | `[...preset, ...args]` |
| Works with `new` | if `this instanceof bound`, use `this` instead of `ctx` |
| `instanceof` works | `bound.prototype = Object.create(fn.prototype)` |
| Bound `this` can't be changed later | calling `bound.call(other)` still uses `ctx` |
| Error on non-functions | throw `TypeError` if `typeof this !== 'function'` |

Native extras you can mention: the bound function's `name` is `"bound fn"` and its `length` is `max(0, fn.length - preset.length)`.
:::

::: diagram What happens inside myCall
flowchart LR
  A["greet.myCall(user, 'Hi')"] --> B["key = Symbol()"]
  B --> C["user[key] = greet"]
  C --> D["user[key]('Hi'): this = user"]
  D --> E["delete user[key]"]
  E --> F["return the result"]
:::

::: image How a bind polyfill works
/images/javascript/bind-polyfill.svg
:::

::: image call vs apply vs bind
/images/javascript/call-apply-bind.svg
:::

::: text 🪜 Step by step
`const BoundPoint = Point.myBind({ ignored: true }, 1); const p = new BoundPoint(2);`
1. `myBind` stores `fn = Point`, `ctx`, `preset = [1]` and returns `bound`.
2. `new BoundPoint(2)` creates an object whose prototype is `bound.prototype` (which inherits from `Point.prototype`).
3. Inside `bound`, `this instanceof bound` is **true** → it's a `new` call.
4. So it runs `Point.apply(this, [1, 2])` with the **new object**, not `ctx`.
5. `p.x === 1`, `p.y === 2`, `p instanceof Point` → true.
:::

::: code javascript Browser demo: myCall, myApply and a full myBind (runnable)
Function.prototype.myCall = function (ctx, ...args) {
  if (typeof this !== 'function') throw new TypeError('myCall must be called on a function');
  const target = ctx === null || ctx === undefined ? globalThis : Object(ctx);   // primitives get wrapped
  const key = Symbol('fn');
  target[key] = this;
  try { return target[key](...args); }
  finally { delete target[key]; }
};

Function.prototype.myApply = function (ctx, args) {
  if (args !== null && args !== undefined && typeof args !== 'object') throw new TypeError('args must be an array-like');
  return this.myCall(ctx, ...(args ? Array.from(args) : []));
};

Function.prototype.myBind = function (ctx, ...preset) {
  const fn = this;
  if (typeof fn !== 'function') throw new TypeError('myBind must be called on a function');
  function bound(...args) {
    const isNew = this instanceof bound;                       // called with new?
    return fn.apply(isNew ? this : ctx, [...preset, ...args]);
  }
  if (fn.prototype) bound.prototype = Object.create(fn.prototype);   // keep instanceof working
  return bound;
};

// ---- tests ----
function greet(greeting, mark) { return `${greeting}, ${this.name}${mark}`; }
const user = { name: 'Asha' };
const checks = [
  ['myCall sets this and args', greet.myCall(user, 'Hi', '!') === 'Hi, Asha!'],
  ['myCall leaves no extra keys', Object.getOwnPropertySymbols(user).length === 0],
  ['myCall with a primitive this', function () { return typeof this; }.myCall(5) === 'object'],
  ['myApply takes an array', greet.myApply(user, ['Hello', '?']) === 'Hello, Asha?'],
  ['myApply with array-like arguments', Math.max.myApply(null, { length: 3, 0: 4, 1: 9, 2: 2 }) === 9],
  ['myBind fixes this + partial args', greet.myBind(user, 'Hey')('!!') === 'Hey, Asha!!'],
  ['bound this cannot be overridden', greet.myBind(user, 'Yo').myCall({ name: 'Ravi' }, '.') === 'Yo, Asha.'],
];

function Point(x, y) { this.x = x; this.y = y; }
Point.prototype.sum = function () { return this.x + this.y; };
const BoundPoint = Point.myBind({ ignored: true }, 1);
const p = new BoundPoint(2);
checks.push(['new on a bound function ignores the bound this', p.x === 1 && p.y === 2 && p.ignored === undefined]);
checks.push(['instanceof and prototype methods still work', p instanceof Point && p.sum() === 3]);

let typeError = '';
try { Function.prototype.myCall.call({}, null); } catch (e) { typeError = e.name; }
checks.push(['calling on a non-function throws', typeError === 'TypeError']);

for (const [name, ok] of checks) console.log(name, ok ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using a string key like `ctx.fn = this` (can overwrite a real `fn` property).
- Forgetting to delete the temporary key (or not in `finally`).
- bind polyfill that ignores `new` or loses the prototype.
- Not passing preset arguments **before** the call-time arguments.
- Forgetting that arrow functions ignore all three (no polyfill can change that).
:::

::: understand
- call/apply = "make it a method for one call"; bind = "return a function that does call/apply later", plus the `new` special case.
:::

::: ask
- *"Should the bind polyfill support new?"* It's the follow-up most interviewers ask.
:::

::: important ⭐ Say this in the interview
"For call, I attach the function to the context object under a unique Symbol key, invoke it as a method so this is the context, then delete the key in a finally block; null or undefined becomes globalThis and primitives are wrapped. apply is the same with an array of arguments. bind returns a new function that applies the original with the bound this and the preset arguments followed by the new ones. A complete bind also checks this instanceof bound to detect new, in which case it uses the new instance instead of the bound context, and sets the prototype so instanceof keeps working."
:::

::: links
MDN: Function.prototype.bind | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind
ECMAScript spec: Function.prototype.bind | https://tc39.es/ecma262/#sec-function.prototype.bind
:::

=== Implement some, every, find, findIndex and includes
@p 3
@tags javascript, polyfill, arrays, some, every, find, includes
@quick
- All take `(callback, thisArg)` (except `includes`) and call `callback(value, index, array)`.
- **some**: true at the first truthy callback (short-circuits); `[].some(fn)` → `false`.
- **every**: false at the first falsy callback; `[].every(fn)` → `true` (vacuous truth).
- **find / findIndex**: first matching value / index; not found → `undefined` / `-1`. They visit **holes** too (as `undefined`); some/every skip holes.
- **includes** uses **SameValueZero**: finds `NaN` (unlike `indexOf`), treats `+0` and `-0` as equal; supports a `fromIndex` (negative counts from the end).

::: text 🧒 In simple words
Checking a class register: **some** = "is **anyone** absent?" (stop at the first absent student). **every** = "is **everyone** present?" (stop at the first absent one). **find** = "**who** is the first absent student?". **findIndex** = "**which roll number** is that?". **includes** = "is Asha's name **on the list**?".
:::

::: text 📖 Detailed answer
| Method | Returns | Stops when | Empty array | Holes |
|---|---|---|---|---|
| `some(cb)` | boolean | first truthy | `false` | skipped |
| `every(cb)` | boolean | first falsy | `true` | skipped |
| `find(cb)` | value / `undefined` | first truthy | `undefined` | visited as `undefined` |
| `findIndex(cb)` | index / `-1` | first truthy | `-1` | visited |
| `findLast`, `findLastIndex` | from the end (ES2023) | first truthy from the end | | visited |
| `includes(x, from)` | boolean | first SameValueZero match | `false` | treated as `undefined` |

### Spec details interviewers like
- Throw `TypeError` if the callback isn't a function.
- Read `length` once at the start (items added during the loop aren't visited).
- Use `thisArg` as the callback's `this`.
- `i in O` checks for holes (some/every/forEach/map/filter skip missing indices).
- SameValueZero: like `===` except `NaN` equals `NaN`.
:::

::: diagram How some and every short-circuit
flowchart TD
  S["for i from 0 to length - 1"] --> H{"index exists? (skip holes)"}
  H -->|"no"| S
  H -->|"yes"| CB["r = callback(arr[i], i, arr)"]
  CB --> SO{"some: r truthy? / every: r falsy?"}
  SO -->|"yes"| STOP["return early (true for some, false for every)"]
  SO -->|"no"| S
  S -->|"loop ended"| END["some → false, every → true"]
:::

::: image some, every, find, findIndex, includes
/images/javascript/array-search.svg
:::

::: text 🪜 Step by step
`[4, 9, 15, 23, 8].mySome(x => x > 10)`:
1. i = 0: 4 > 10? no.
2. i = 1: 9 > 10? no.
3. i = 2: 15 > 10? **yes** → return `true` immediately.
4. 23 and 8 are never checked (the callback ran 3 times).
5. `myEvery(x => x > 10)` would return `false` at i = 0 after a single call.
:::

::: code javascript Browser demo: the five polyfills with spec-like edge cases (runnable)
function assertFn(cb, name) { if (typeof cb !== 'function') throw new TypeError(`${name}: callback must be a function`); }

Array.prototype.mySome = function (cb, thisArg) {
  assertFn(cb, 'some');
  const O = Object(this), len = O.length >>> 0;
  for (let i = 0; i < len; i++) if (i in O && cb.call(thisArg, O[i], i, O)) return true;
  return false;
};
Array.prototype.myEvery = function (cb, thisArg) {
  assertFn(cb, 'every');
  const O = Object(this), len = O.length >>> 0;
  for (let i = 0; i < len; i++) if (i in O && !cb.call(thisArg, O[i], i, O)) return false;
  return true;
};
Array.prototype.myFindIndex = function (cb, thisArg) {
  assertFn(cb, 'findIndex');
  const O = Object(this), len = O.length >>> 0;
  for (let i = 0; i < len; i++) if (cb.call(thisArg, O[i], i, O)) return i;    // holes are visited
  return -1;
};
Array.prototype.myFind = function (cb, thisArg) {
  const i = this.myFindIndex(cb, thisArg);
  return i === -1 ? undefined : this[i];
};
const sameValueZero = (a, b) => a === b || (a !== a && b !== b);             // NaN equals NaN
Array.prototype.myIncludes = function (search, fromIndex = 0) {
  const O = Object(this), len = O.length >>> 0;
  let i = Math.trunc(fromIndex) || 0;
  if (i < 0) i = Math.max(len + i, 0);
  for (; i < len; i++) if (sameValueZero(O[i], search)) return true;
  return false;
};

// ---- tests (compared with the native methods) ----
const arr = [4, 9, 15, 23, 8];
let calls = 0;
const big = (x) => { calls++; return x > 10; };
const results = [
  ['some', arr.mySome(big), arr.some(big)],
  ['every', arr.myEvery((x) => x > 3), arr.every((x) => x > 3)],
  ['find', arr.myFind(big), arr.find(big)],
  ['findIndex', arr.myFindIndex(big), arr.findIndex(big)],
  ['not found', arr.myFind((x) => x > 100), arr.find((x) => x > 100)],
  ['empty some/every', [[].mySome(big), [].myEvery(big)].join(), [[].some(big), [].every(big)].join()],
  ['includes NaN', [1, NaN].myIncludes(NaN), [1, NaN].includes(NaN)],
  ['indexOf misses NaN', [1, NaN].indexOf(NaN), -1],
  ['includes fromIndex negative', arr.myIncludes(4, -2), arr.includes(4, -2)],
  ['includes -0 vs +0', [-0].myIncludes(0), [-0].includes(0)],
];
for (const [name, mine, native] of results) console.log(name.padEnd(28), String(mine).padEnd(12), Object.is(mine, native) ? '✅' : '❌ FAIL');

calls = 0; arr.mySome(big);
console.log('some short-circuits after 3 calls', calls === 3 ? '✅' : '❌ FAIL');
const sparse = [1, , 3];                                       // eslint-disable-line no-sparse-arrays
let visits = 0;
sparse.myEvery(() => { visits++; return true; });
const findVisits = []; sparse.myFindIndex((v, i) => { findVisits.push(i); return false; });
console.log('every skips holes, findIndex visits them', visits === 2 && findVisits.join() === '0,1,2' ? '✅' : '❌ FAIL');
const ctx = { min: 10 };
console.log('thisArg is passed to the callback', arr.mySome(function (x) { return x > this.min; }, ctx) ? '✅' : '❌ FAIL');
let err = ''; try { arr.mySome(); } catch (e) { err = e.name; }
console.log('missing callback throws TypeError', err === 'TypeError' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Not short-circuiting (looping through the whole array).
- `[].every()` returning `false` (it's `true`).
- Using `===` in includes (misses `NaN`).
- Ignoring `thisArg`, holes, or reading `length` on every iteration.
- Using arrow functions for the polyfill itself (`this` would not be the array).
:::

::: understand
- Same loop skeleton; the only differences are what's returned and when to stop.
:::

::: ask
- *"Should the polyfill handle sparse arrays and array-likes like the spec?"*
:::

::: important ⭐ Say this in the interview
"They share one loop: convert this to an object, read the length once, and call the callback with value, index and array, using thisArg. some returns true at the first truthy result and false otherwise, every returns false at the first falsy result and true otherwise, so an empty array gives false and true. find and findIndex return the first matching value or index, or undefined and -1, and unlike some and every they also visit holes. includes compares with SameValueZero, so it finds NaN where indexOf can't, and supports a negative fromIndex."
:::

::: links
MDN: Array.prototype.some | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some
MDN: Array.prototype.includes | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
:::

=== Implement flat and flatMap (custom flatten)
@p 3
@tags javascript, polyfill, arrays, flat, recursion
@quick
- `arr.flat(depth = 1)` flattens nested arrays up to `depth` levels; `flat(Infinity)` flattens everything; holes are removed.
- Recursive polyfill: for each item, if it's an array **and** `depth > 0`, flatten it with `depth - 1`, else push it.
- Iterative version with a **stack** avoids call-stack limits on very deep nesting.
- `flatMap(fn)` = `map(fn)` then `flat(1)` (only one level).
- Measured (Node 22, 256,000 numbers): shared-output recursion **1.1 ms**, iterative stack **1.5 ms**, native `flat(Infinity)` **3.0 ms**, `reduce + concat` **34.6 ms**.

::: text 🧒 In simple words
Flattening is **unpacking boxes inside boxes**. You open a box: loose items go on the table; if you find another box, you open that too (recursion). `depth` is how many levels of boxes you're allowed to open.
:::

::: text 📖 Detailed answer
### Behaviour to copy
| Input | Result |
|---|---|
| `[1, [2, [3, [4]]]].flat()` | `[1, 2, [3, [4]]]` |
| `.flat(2)` | `[1, 2, 3, [4]]` |
| `.flat(Infinity)` | `[1, 2, 3, 4]` |
| `[1, , 3].flat()` | `[1, 3]` (holes removed) |
| `[[1, 2], 3].flat(0)` | a shallow copy |
| `['a b', 'c'].flatMap(s => s.split(' '))` | `['a', 'b', 'c']` |

### Three implementations
1. **Recursive with a shared output array** (fast, simple): `function flat(arr, depth, out = [])`.
2. **Iterative with a stack** (no recursion limit): push `[item, depth]` pairs; pop, and expand arrays while depth allows. Reverse at the end, or iterate from the end, to keep order.
3. **reduce + concat** (common in answers, but each `concat` copies the accumulator: slow for big inputs).

Avoid the `toString().split(',')` hack: it turns everything into strings and breaks on values containing commas or objects.

### Measured (Node 22, Apple M3 Pro): flatten 256,000 numbers nested 5 levels, median of 9 runs
| Implementation | Time |
|---|---|
| recursion + shared output | 1.10 ms |
| iterative stack | 1.53 ms |
| native `flat(Infinity)` | 2.96 ms |
| recursion + `push(...spread)` | 3.64 ms |
| `toString().split` hack | 9.32 ms |
| `reduce` + `concat` | 34.56 ms |
:::

::: diagram Recursive flatten with depth
flowchart TD
  F["flat(arr, depth)"] --> L["for each item"]
  L --> Q{"Array and depth > 0?"}
  Q -->|"yes"| R["flat(item, depth - 1) into the same output"]
  Q -->|"no"| P["push item"]
  R --> L
  P --> L
:::

::: image flat and flatMap: depth and measured cost
/images/javascript/flat.svg
:::

::: chart bar Measured: flattening 256,000 nested numbers (Node 22, ms)
Implementation,Time (ms)
recursion shared output,1.1
iterative stack,1.53
native flat(Infinity),2.96
recursion with spread push,3.64
toString split hack,9.32
reduce + concat,34.56
:::

::: text 🪜 Step by step
`myFlat([1, [2, [3]]], 1)`:
1. `1` is not an array → push → `[1]`.
2. `[2, [3]]` is an array and depth 1 > 0 → recurse with depth 0.
3. Inside: `2` → push → `[1, 2]`.
4. `[3]` is an array but depth is 0 → push it as is → `[1, 2, [3]]`.
5. Done: one level flattened, like the native `flat()`.
:::

::: code javascript Browser demo: recursive, iterative and flatMap polyfills (runnable)
Array.prototype.myFlat = function (depth = 1) {
  const d = Number(depth);
  const out = [];
  (function walk(arr, level) {
    for (let i = 0; i < arr.length; i++) {
      if (!(i in arr)) continue;                               // skip holes like native flat
      const item = arr[i];
      if (Array.isArray(item) && level > 0) walk(item, level - 1);
      else out.push(item);
    }
  })(this, Number.isNaN(d) ? 0 : d);
  return out;
};

// Iterative: no recursion, safe for extremely deep nesting
function flatIterative(arr, depth = Infinity) {
  const stack = [];
  for (let i = arr.length - 1; i >= 0; i--) stack.push([arr[i], depth]);      // reversed: pop() gives the first item
  const out = [];
  while (stack.length) {
    const [item, d] = stack.pop();
    if (Array.isArray(item) && d > 0) for (let i = item.length - 1; i >= 0; i--) stack.push([item[i], d - 1]);
    else out.push(item);
  }
  return out;
}
// Children are pushed in reverse too, so they are popped (and output) in their original order.

Array.prototype.myFlatMap = function (fn, thisArg) {
  if (typeof fn !== 'function') throw new TypeError('flatMap: callback must be a function');
  return this.map(fn, thisArg).myFlat(1);
};

// ---- tests vs native ----
const nested = [1, [2, [3, [4, [5]]]], 6];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cases = [
  ['flat()', nested.myFlat(), nested.flat()],
  ['flat(2)', nested.myFlat(2), nested.flat(2)],
  ['flat(Infinity)', nested.myFlat(Infinity), nested.flat(Infinity)],
  ['flat(0) copies', nested.myFlat(0), nested.flat(0)],
  ['holes removed', [1, , [2, , 3]].myFlat(), [1, , [2, , 3]].flat()],          // eslint-disable-line no-sparse-arrays
  ['iterative Infinity', flatIterative(nested), nested.flat(Infinity)],
  ['iterative depth 1', flatIterative(nested, 1), nested.flat(1)],
  ['flatMap', ['a b', 'c d e'].myFlatMap((s) => s.split(' ')), ['a b', 'c d e'].flatMap((s) => s.split(' '))],
  ['flatMap only 1 level', [[1], [2]].myFlatMap((x) => [x]), [[1], [2]].flatMap((x) => [x])],
];
for (const [name, mine, native] of cases) console.log(name.padEnd(22), JSON.stringify(mine), same(mine, native) ? '✅' : '❌ FAIL');

// Deep nesting: 100,000 levels breaks recursion but not the iterative version
let deep = [0];
for (let i = 1; i < 100000; i++) deep = [deep];
let recursionError = 'none';
try { deep.myFlat(Infinity); } catch (e) { recursionError = e.name; }
console.log('recursion overflows on 100,000 levels', recursionError === 'RangeError' ? '✅' : '❌ FAIL');
console.log('iterative handles it', flatIterative(deep).join() === '0' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Ignoring the `depth` parameter (always flattening everything).
- `reduce` + `concat` on big inputs (quadratic copying).
- The `toString().split(',')` trick (turns numbers into strings, breaks objects).
- `flatMap` flattening more than one level.
- Forgetting holes (native `flat` removes them).
:::

::: understand
- Flatten = recursion over "is it an array and may I go deeper?"; the stack version removes the recursion limit.
:::

::: ask
- *"Should I support depth, holes, and very deep nesting?"* Each adds one line or a different approach.
:::

::: important ⭐ Say this in the interview
"flat walks the array and, for every item that is an array while the remaining depth is above zero, flattens it with depth minus one into the same output array; everything else is pushed, and holes are skipped. flat(Infinity) flattens fully, flatMap is map followed by a one-level flat. For extremely deep nesting I switch to an iterative version with an explicit stack to avoid the call-stack limit. I avoid reduce with concat: measured on 256,000 numbers it took 35 milliseconds against about 1 millisecond for the shared-output recursion."
:::

::: links
MDN: Array.prototype.flat | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
MDN: Array.prototype.flatMap | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap
:::

=== Implement slice and splice
@p 2
@tags javascript, polyfill, arrays, slice, splice
@quick
- `slice(start, end)`: returns a **new** array from `start` up to (not including) `end`; never changes the original.
- `splice(start, deleteCount, ...items)`: **mutates**: removes `deleteCount` items at `start`, inserts `items`, returns the **removed** items.
- Negative indexes count from the end (`-1` = last); indexes are clamped to `0…length`.
- splice without `deleteCount` removes everything from `start`; with `deleteCount = 0` it only inserts.
- Immutable alternatives (ES2023): `toSpliced`, `toSorted`, `toReversed`, `with`.

::: text 🧒 In simple words
**slice** is **photocopying some pages** of a book: the book stays the same. **splice** is **cutting pages out** of the book (and maybe gluing new ones in): the book changes, and you're handed the pages you cut out.
:::

::: text 📖 Detailed answer
### Normalising an index (both methods)
`const norm = (i, len) => i < 0 ? Math.max(len + i, 0) : Math.min(i, len)` after converting to an integer (`Math.trunc`, `NaN` → 0). `end` defaults to `length`.

### slice
| Call | Result on `['a','b','c','d','e']` |
|---|---|
| `slice()` | copy of everything |
| `slice(1, 3)` | `['b','c']` |
| `slice(-2)` | `['d','e']` |
| `slice(2, -1)` | `['c','d']` |
| `slice(3, 1)` | `[]` |

### splice
| Call | Array after | Returned |
|---|---|---|
| `splice(1, 2)` | `['a','d','e']` | `['b','c']` |
| `splice(1, 0, 'X')` | `['a','X','b','c','d','e']` | `[]` |
| `splice(1, 2, 'X', 'Y', 'Z')` | `['a','X','Y','Z','d','e']` | `['b','c']` |
| `splice(-1)` | `['a','b','c','d']` | `['e']` |

### Implementing splice in place
1. Normalise `start`; `deleteCount` = all remaining if omitted, clamped to `0…len-start`.
2. Copy the removed items out.
3. Shift the tail **left** (when inserting fewer than deleted) or **right** (when inserting more), iterating in the safe direction so nothing is overwritten.
4. Write the new items, set the new `length`, return the removed items.
:::

::: diagram splice in three steps
flowchart LR
  A["['a','b','c','d','e'].splice(1, 2, 'X')"] --> R["copy out removed: ['b','c']"]
  R --> S["shift the tail: d, e move left by 1"]
  S --> W["write 'X' at index 1, set length = 4"]
  W --> O["array: ['a','X','d','e'], returns ['b','c']"]
:::

::: image slice vs splice
/images/javascript/slice-splice.svg
:::

::: text 🪜 Step by step
`['a','b','c','d','e'].mySplice(1, 1, 'X', 'Y')` (insert more than delete):
1. start = 1, deleteCount = 1 → removed = `['b']`.
2. 2 items inserted − 1 deleted → the tail (`c, d, e`) must move **right by 1**.
3. Move from the **end** backwards (e → index 5, d → 4, c → 3) so nothing is overwritten.
4. Write `X` at 1 and `Y` at 2 → `['a','X','Y','c','d','e']`.
5. Return `['b']`.
:::

::: code javascript Browser demo: slice and an in-place splice (runnable)
function toIndex(value, len, fallback) {
  if (value === undefined) return fallback;
  const n = Math.trunc(Number(value)) || 0;                  // NaN → 0
  return n < 0 ? Math.max(len + n, 0) : Math.min(n, len);
}

Array.prototype.mySlice = function (start, end) {
  const len = this.length >>> 0;
  const from = toIndex(start, len, 0), to = toIndex(end, len, len);
  const out = [];
  for (let i = from; i < to; i++) out.push(this[i]);
  return out;
};

Array.prototype.mySplice = function (start, deleteCount, ...items) {
  const len = this.length >>> 0;
  const from = toIndex(start, len, 0);
  const del = arguments.length === 0 ? 0 : arguments.length === 1 ? len - from : Math.min(Math.max(Math.trunc(deleteCount) || 0, 0), len - from);
  const removed = [];
  for (let i = 0; i < del; i++) removed.push(this[from + i]);
  const shift = items.length - del;
  if (shift < 0) for (let i = from + del; i < len; i++) this[i + shift] = this[i];          // move left
  if (shift > 0) for (let i = len - 1; i >= from + del; i--) this[i + shift] = this[i];     // move right, from the end
  for (let i = 0; i < items.length; i++) this[from + i] = items[i];
  this.length = len + shift;
  return removed;
};

// ---- tests vs native ----
const base = ['a', 'b', 'c', 'd', 'e'];
const sliceCases = [[], [1, 3], [-2], [2, -1], [3, 1], [-10, 2], [1, 100]];
for (const args of sliceCases) {
  const mine = base.mySlice(...args), native = base.slice(...args);
  console.log(`slice(${args.join(', ')})`.padEnd(18), JSON.stringify(mine), JSON.stringify(mine) === JSON.stringify(native) ? '✅' : '❌ FAIL');
}
console.log('slice never mutates', base.join('') === 'abcde' ? '✅' : '❌ FAIL');

const spliceCases = [[1, 2], [1, 0, 'X'], [1, 2, 'X', 'Y', 'Z'], [-1], [2], [0, 10], [1, 1, 'X', 'Y'], []];
for (const args of spliceCases) {
  const a = [...base], b = [...base];
  const mineRemoved = a.mySplice(...args), nativeRemoved = b.splice(...args);
  const ok = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(mineRemoved) === JSON.stringify(nativeRemoved);
  console.log(`splice(${args.join(', ')})`.padEnd(22), JSON.stringify(a), 'removed', JSON.stringify(mineRemoved), ok ? '✅' : '❌ FAIL');
}
const immutable = base.toSpliced ? base.toSpliced(1, 2) : base.mySlice(0, 1).concat(base.mySlice(3));
console.log('toSpliced is the non-mutating version', immutable.join('') === 'ade' && base.join('') === 'abcde' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Mixing them up: `slice` is pure, `splice` mutates.
- Treating `end` as inclusive.
- Shifting elements in the wrong direction and overwriting values.
- Using `splice` on React state arrays (mutation); use `toSpliced` or `filter`/`slice` + spread.
- Forgetting to update `length` after removing items.
:::

::: understand
- Normalise indexes the same way; slice copies, splice moves the tail and edits in place.
:::

::: ask
- *"Should negative and out-of-range indexes behave like the native methods?"*
:::

::: important ⭐ Say this in the interview
"slice returns a new array from start up to but not including end and never changes the original; splice mutates the array, removing deleteCount items at start, inserting the new items, and returning the removed ones. Both normalise indexes the same way: negative values count from the end and everything is clamped to the array bounds. To implement splice in place, I copy out the removed items, shift the tail left or right depending on whether I insert fewer or more items than I delete, iterating from the end when moving right, then write the new items and update length."
:::

::: links
MDN: Array.prototype.slice | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice
MDN: Array.prototype.splice | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
:::

=== Implement Array.from and Array.isArray
@p 2
@tags javascript, polyfill, arrays, iterables
@quick
- `Array.from(source, mapFn?, thisArg?)` builds a real array from an **iterable** (`Symbol.iterator`: strings, Sets, Maps, NodeLists, generators) or an **array-like** (`{ length, 0: … }`, `arguments`).
- Polyfill order: if `source[Symbol.iterator]` exists → iterate; else read `length` and copy indexes `0…length-1`.
- `mapFn(value, index)` is applied while building (no intermediate array); `Array.from({ length: 5 }, (_, i) => i)` creates ranges.
- `Array.isArray(x)` → `Object.prototype.toString.call(x) === '[object Array]'`; it works across iframes, where `instanceof Array` fails.
- `null`/`undefined` sources throw `TypeError`.

::: text 🧒 In simple words
`Array.from` is a **converter plug**: whatever shape of thing you have (a string, a Set, a list of DOM nodes, an object that just has numbered keys and a length), it gives you a **proper array** so you can use `map`, `filter` and friends.
:::

::: text 📖 Detailed answer
### Inputs it accepts
| Source | Example | Result |
|---|---|---|
| String (iterable) | `Array.from('hi')` | `['h', 'i']` (handles emoji correctly, unlike `split('')`) |
| Set / Map | `Array.from(new Set([1, 1, 2]))` | `[1, 2]` / `[[k, v], …]` |
| Array-like | `Array.from({ length: 2, 0: 'a', 1: 'b' })` | `['a', 'b']` |
| Length only | `Array.from({ length: 3 })` | `[undefined, undefined, undefined]` |
| With mapFn | `Array.from({ length: 3 }, (_, i) => i * i)` | `[0, 1, 4]` |
| NodeList / arguments | `Array.from(document.querySelectorAll('a'))` | real array of elements |

### Array.isArray
- `typeof []` is `'object'`, so it can't tell.
- `x instanceof Array` fails for arrays created in another realm (iframe, `vm` context) because they have a different `Array.prototype`.
- `Object.prototype.toString.call(x)` returns `"[object Array]"` for any real array (native `isArray` also sees through Proxies of arrays).

### Related
`Array.of(7)` → `[7]` (unlike `Array(7)` → 7 empty slots). `Array.fromAsync` (ES2024) does the same for async iterables.
:::

::: diagram Array.from decision path
flowchart TD
  S["Array.from(source, mapFn)"] --> N{"source is null or undefined?"}
  N -->|"yes"| E["TypeError"]
  N -->|"no"| I{"has Symbol.iterator?"}
  I -->|"yes"| IT["for...of the iterable"]
  I -->|"no"| AL["read length, copy indexes 0 to length - 1"]
  IT --> M["apply mapFn(value, index) if given"]
  AL --> M
  M --> R["new Array"]
:::

::: image Array.from and Array.isArray
/images/javascript/array-from.svg
:::

::: text 🪜 Step by step
`myFrom({ length: 3, 0: 'a', 2: 'c' }, (v, i) => v ?? i)`:
1. Not null; no `Symbol.iterator` → array-like path.
2. `length` = 3 → loop i = 0, 1, 2.
3. i = 0 → `'a'`; i = 1 → missing → `undefined` → mapFn gives `1`; i = 2 → `'c'`.
4. Result `['a', 1, 'c']` (no holes: `from` always produces dense arrays).
5. Iterables would have used `for…of` instead, e.g., a Set's values in insertion order.
:::

::: code javascript Browser demo: myFrom and myIsArray (runnable)
function myFrom(source, mapFn, thisArg) {
  if (source === null || source === undefined) throw new TypeError('myFrom: source is null or undefined');
  if (mapFn !== undefined && typeof mapFn !== 'function') throw new TypeError('myFrom: mapFn must be a function');
  const out = [];
  const add = (value, i) => out.push(mapFn ? mapFn.call(thisArg, value, i) : value);
  const obj = Object(source);
  if (typeof obj[Symbol.iterator] === 'function') {
    let i = 0;
    for (const value of obj) add(value, i++);
  } else {
    const len = Math.min(Math.max(Math.trunc(Number(obj.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < len; i++) add(obj[i], i);
  }
  return out;
}

const myIsArray = (x) => Object.prototype.toString.call(x) === '[object Array]';

// ---- tests vs native ----
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function args() { return myFrom(arguments); }
const cases = [
  ['string', myFrom('hi'), Array.from('hi')],
  ['emoji string', myFrom('a😀b').length, Array.from('a😀b').length],
  ['Set', myFrom(new Set([1, 1, 2])), Array.from(new Set([1, 1, 2]))],
  ['Map', myFrom(new Map([['k', 1]])), Array.from(new Map([['k', 1]]))],
  ['array-like', myFrom({ length: 3, 0: 'a', 2: 'c' }), Array.from({ length: 3, 0: 'a', 2: 'c' })],
  ['range with mapFn', myFrom({ length: 5 }, (_, i) => i * i), Array.from({ length: 5 }, (_, i) => i * i)],
  ['generator', myFrom((function* () { yield 1; yield 2; })()), [1, 2]],
  ['arguments', args(1, 2, 3), [1, 2, 3]],
  ['number (no length)', myFrom(5), Array.from(5)],
];
for (const [name, mine, native] of cases) console.log(name.padEnd(20), JSON.stringify(mine), same(mine, native) ? '✅' : '❌ FAIL');
console.log("'a😀b'.split('') breaks the emoji", 'a😀b'.split('').length === 4 ? '✅' : '❌ FAIL');

let nullError = '';
try { myFrom(null); } catch (e) { nullError = e.name; }
console.log('null source throws TypeError', nullError === 'TypeError' ? '✅' : '❌ FAIL');

const isArrayCases = [[[], true], [new Array(3), true], [{ length: 0 }, false], ['abc', false], [null, false], [new Proxy([], {}), Array.isArray(new Proxy([], {}))]];
console.log('myIsArray matches Array.isArray', isArrayCases.slice(0, 5).every(([v, expected]) => myIsArray(v) === expected && Array.isArray(v) === expected) ? '✅' : '❌ FAIL');
console.log('typeof cannot tell arrays apart', typeof [] === 'object' && typeof {} === 'object' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Only handling array-likes (Sets and Maps have no `length`).
- `str.split('')` instead of `Array.from(str)` (breaks emoji and other surrogate pairs).
- `instanceof Array` across iframes.
- `Array(n).map(...)` (holes are skipped; use `Array.from({ length: n }, fn)`).
:::

::: understand
- Iterable first, then array-like; isArray via the internal class tag, not typeof or instanceof.
:::

::: ask
- *"Do you need async iterables too?"* That's `Array.fromAsync`.
:::

::: important ⭐ Say this in the interview
"Array.from builds a real array from either an iterable or an array-like. My polyfill throws for null or undefined, then checks for Symbol.iterator and uses for…of, which covers strings, Sets, Maps, NodeLists and generators; otherwise it reads length and copies indexes zero to length minus one. An optional map function is applied as each value is added, which is why Array.from with a length and a mapper is a neat way to build ranges. For isArray I use Object.prototype.toString, because typeof says object and instanceof fails for arrays from another realm like an iframe."
:::

::: links
MDN: Array.from | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from
MDN: Array.isArray | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray
:::
