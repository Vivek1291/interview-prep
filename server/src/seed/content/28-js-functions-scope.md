@section JS Functions & Scope
@icon 🧠
@color #eab308
@desc Scope chain, closures, this, call/apply/bind, arrow functions, IIFE, higher-order functions, currying and memoization: how functions really work, with diagrams and runnable demos.

=== What is scope and the scope chain? (lexical scope)
@p 3
@tags javascript, scope, scope-chain, lexical
@quick
- **Scope** = where a variable can be used. Kinds: **global**, **function**, **block** (`let`/`const` in `{ }`), and **module**.
- **Scope chain**: lookup starts in the current scope, then goes **outward** one level at a time up to global; not found → `ReferenceError`.
- **Lexical** scope: the chain is decided by where code is **written**, not where a function is called.
- Inner scopes can read outer variables; outer scopes can't read inner ones.
- **Shadowing**: an inner variable with the same name hides the outer one.

::: text 🧒 In simple words
Imagine you're in your **bedroom** looking for a charger. First you search your room; if it isn't there you check the **living room** of your flat; then the **building's lobby**. You never search your neighbour's bedroom. Each room is a scope, and that inside-out search path is the scope chain.
:::

::: text 📖 Detailed answer
### Types of scope
| Scope | Created by | Example |
|---|---|---|
| Global | top level of a classic script | `var site = 'hub'` (also `window.site`) |
| Module | top level of an ES module | each file is its own scope |
| Function | every function call | parameters and `var` inside |
| Block | `{ }` with `let`/`const`/`class` | `if`, `for`, `try`, plain blocks |

### Lexical scope
When a function is **created**, it stores a link to the scope it was **written** in. Calling it from somewhere else doesn't change what it can see. That's why this prints `'outer'`:
- `const x = 'outer'; function show() { return x; } function run() { const x = 'run'; return show(); }`

`show` was written next to the outer `x`, so the `x` inside `run` is invisible to it.

### Execution context and environment records
Each call creates an **execution context** whose **lexical environment** has (1) a record of local variables and (2) a pointer to the **outer** environment. Following those pointers is the scope chain. The same pointer is what makes **closures** possible.
:::

::: diagram Variable lookup walks outward
flowchart LR
  I["inner scope: count"] -->|"not found? go out"| O["outer scope: user"]
  O -->|"not found? go out"| G["global scope: app"]
  G -->|"not found"| E["ReferenceError"]
:::

::: image Scope chain: looking up a variable
/images/javascript/scope-chain.svg
:::

::: text 🪜 Step by step
Looking up `user` inside `inner()` (written inside `outer()`):
1. Check `inner`'s own environment record: no `user`.
2. Follow the outer pointer to `outer`'s record: `user` found → use it.
3. For `app`: inner → outer → global → found.
4. For `missing`: inner → outer → global → **end of chain** → `ReferenceError: missing is not defined`.
5. Assigning to an undeclared name in sloppy mode creates a global instead (strict mode throws). One more reason for `'use strict'` / modules.
:::

::: code javascript Browser demo: lexical scope, shadowing and the chain (runnable)
const app = 'Hub';

function outer() {
  const user = 'Asha';
  function inner() {
    const count = 1;
    return `${count} ${user} ${app}`;            // found in inner, outer, global
  }
  return inner();
}
console.log(outer());
console.log('lookup walks outward', outer() === '1 Asha Hub' ? '✅' : '❌ FAIL');

// Lexical, not dynamic: show() sees the x where it was WRITTEN
const x = 'outer';
function show() { return x; }
function run() { const x = 'run'; return show(); }
console.log('lexical scope', run() === 'outer' ? '✅' : '❌ FAIL');

// Shadowing
const name = 'global';
function shadow() { const name = 'local'; return name; }
console.log('inner name shadows outer', shadow() === 'local' && name === 'global' ? '✅' : '❌ FAIL');

// End of the chain
try { (function () { return notDefinedAnywhere; })(); } catch (e) { console.log('end of the chain →', e.name, e.name === 'ReferenceError' ? '✅' : '❌ FAIL'); }
:::

::: warning ⚠️ Common mistakes
- Thinking a function sees the variables of whoever **calls** it (that's dynamic scope; JS is lexical).
- Accidental globals by assigning without `let`/`const` in sloppy mode.
- Shadowing an outer variable by mistake and wondering why it "didn't change".
- Putting everything in global scope in classic scripts (collisions between files).
:::

::: understand
- Scope = visibility; scope chain = the outward lookup path, fixed when code is written.
- Closures are just functions that keep their scope chain alive.
:::

::: ask
- *"Classic script or ES module?"* Top-level declarations differ (global vs module scope).
:::

::: important ⭐ Say this in the interview
"Scope decides where a variable is visible: global, module, function and block scope with let and const. JavaScript is lexically scoped, so each function remembers the scope it was written in, and every lookup walks outward from the current scope through the enclosing ones up to global. That path is the scope chain; if the name isn't found anywhere, we get a ReferenceError. Inner scopes can read outer variables but not the reverse, and an inner declaration with the same name shadows the outer one."
:::

::: links
MDN: Scope | https://developer.mozilla.org/en-US/docs/Glossary/Scope
javascript.info: Variable scope, closure | https://javascript.info/closure
:::

=== What is a closure? (with real use cases)
@p 3
@tags javascript, closures, scope, memory
@quick
- A **closure** = a function **plus** the variables from the scope where it was created, kept alive even after that outer function returns.
- Every function in JS is a closure; it matters when the function **outlives** its outer scope (returned, stored, used as a callback).
- Uses: **private state** (counters, module pattern), factories, `debounce`/`throttle` timers, memoization caches, event handlers, React hooks.
- Each call of the outer function creates a **new** environment → independent closures.
- Pitfalls: **stale closures** (React effects), memory kept alive by forgotten listeners/timers.

::: text 🧒 In simple words
When a function leaves the place it was born, it carries a **backpack** with the variables it needs from home. Even after the house (the outer function) is gone, the backpack is still there and the function can open it any time. That backpack is the closure.
:::

::: text 📖 Detailed answer
### How it works
1. Calling `makeCounter()` creates an environment `{ count: 0 }`.
2. The returned arrow function stores a hidden reference (`[[Environment]]`) to that environment.
3. `makeCounter` returns, but the environment **can't be garbage-collected** because the returned function still references it, so it stays in the heap.
4. Each `next()` call reads and updates that same `count`.

### Real use cases
| Use | How the closure helps |
|---|---|
| Private state | `count` can only be changed through the functions you return |
| Function factories | `makeMultiplier(2)` / `makeMultiplier(10)` each remember their factor |
| `debounce` / `throttle` | the `timer` variable survives between calls |
| `memoize` | the `cache` Map lives in the closure |
| Event handlers / callbacks | access to the data from when the handler was created |
| React hooks | handlers and effects close over the props/state of **that render** |

### Memory
A closure keeps the whole environment it needs alive. A handler attached to `window` that closes over a large array keeps that array in memory until you remove the listener. Engines (V8) only keep variables the inner functions actually use, but a shared environment is kept for all inner functions of that scope.

### Stale closures
A callback created in an older render keeps the **old** values: `setInterval(() => setCount(count + 1), 1000)` inside `useEffect(…, [])` always sees `count = 0`. Fix with the updater form `setCount(c => c + 1)` or correct dependencies.
:::

::: diagram A closure keeps its environment alive
flowchart LR
  MC["makeCounter() runs"] --> ENV["environment: count = 0 (heap)"]
  MC --> FN["returns next()"]
  FN -->|"[[Environment]] reference"| ENV
  CALL["next() called later"] --> FN
  FN -->|"count++"| ENV
:::

::: image Closure: a function plus the variables it remembers
/images/javascript/closure.svg
:::

::: text 🪜 Step by step
`const a = makeCounter(); const b = makeCounter(); a(); a(); b();`
1. First `makeCounter()` → environment **E1** `{count: 0}`; `a` closes over E1.
2. Second call → a **separate** environment **E2** `{count: 0}`; `b` closes over E2.
3. `a()` → E1.count = 1. `a()` → E1.count = 2.
4. `b()` → E2.count = 1 (independent).
5. Nobody outside can touch `count` directly: it's truly private.
:::

::: code javascript Browser demo: private state, factories and the loop fix (runnable)
function makeCounter() {
  let count = 0;                                   // private
  return { next: () => ++count, reset: () => { count = 0; }, get value() { return count; } };
}
const a = makeCounter();
const b = makeCounter();
a.next(); a.next(); b.next();
console.log({ a: a.value, b: b.value, direct: a.count });
console.log('each call gets its own environment', a.value === 2 && b.value === 1 ? '✅' : '❌ FAIL');
console.log('count is private', a.count === undefined ? '✅' : '❌ FAIL');

// Factory: each function remembers its own factor
const makeMultiplier = (factor) => (n) => n * factor;
const double = makeMultiplier(2), tenX = makeMultiplier(10);
console.log('factories', double(5) === 10 && tenX(5) === 50 ? '✅' : '❌ FAIL');

// once(): a closure remembers whether it already ran
function once(fn) {
  let done = false, result;
  return (...args) => (done ? result : ((done = true), (result = fn(...args))));
}
let runs = 0;
const init = once(() => ++runs);
init(); init(); init();
console.log('once() runs a single time', runs === 1 ? '✅' : '❌ FAIL');

// Stale value demo: the callback captured the value at creation time
let price = 100;
const captured = ((p) => () => p)(price);          // closes over the parameter p
price = 200;
console.log('captured copy is stale on purpose', captured() === 100 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Defining closure as "a function inside a function" (the key is **remembering the outer variables after the outer function returned**).
- Loops with `var` + async callbacks (all share one variable).
- Stale closures in React `useEffect`/`setInterval`.
- Leaking memory via listeners/timers that close over big objects and are never removed.
:::

::: understand
- Closure = function + its lexical environment, kept alive by reference.
- It's the basis of data privacy, factories, debounce/throttle, memoize and hooks.
:::

::: ask
- *"Does this callback need the latest value or the value at creation time?"* Decides refs/updaters vs plain closures.
:::

::: important ⭐ Say this in the interview
"A closure is a function together with the variables of the scope it was created in. Because functions keep a reference to their lexical environment, those variables stay alive after the outer function returns. I use closures for private state, like a counter only changeable through returned methods, for function factories, and in utilities like debounce, throttle, once and memoize, where the timer or cache lives in the closure. The two pitfalls are stale closures, for example a React effect that captured old state, and memory leaks when a long-lived listener closes over large data."
:::

::: links
MDN: Closures | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures
javascript.info: Closure | https://javascript.info/closure
:::

=== How does "this" work in JavaScript?
@p 3
@tags javascript, this, binding
@quick
- `this` is decided by **how a function is called**, not where it's written (except arrow functions).
- Order: `new` → the new object; `call/apply/bind` → the given object; `obj.method()` → `obj`; plain `fn()` → `undefined` in strict mode (global object in sloppy mode).
- **Arrow functions** have no own `this`: they use the `this` of the surrounding scope.
- Losing `this`: `const f = obj.method; f()` or passing `obj.method` as a callback → it's a plain call.
- Fixes: `obj.method.bind(obj)`, an arrow wrapper `() => obj.method()`, or class field arrows.

::: text 🧒 In simple words
`this` is like the word **"me"** in a sentence: who "me" is depends on **who is speaking right now**. `asha.greet()` → Asha is speaking. If you copy the greeting into a note and someone else reads it out, "me" is no longer Asha. Arrow functions are like a quote that always refers to the person who **wrote** it.
:::

::: text 📖 Detailed answer
| Call style | `this` | Example |
|---|---|---|
| `new Fn()` | the newly created object | constructors, classes |
| `fn.call(obj)`, `fn.apply(obj)`, `fn.bind(obj)()` | `obj` | explicit binding |
| `obj.fn()` | `obj` (the object before the dot) | method call |
| `fn()` | `undefined` (strict / modules / classes), `globalThis` (sloppy) | plain call |
| arrow `() => this` | the `this` of the enclosing scope | callbacks inside methods |
| DOM: `el.addEventListener('click', function () {})` | `el` | regular function listeners |

### Losing this
A method is just a function stored on an object. Taking it out (`const f = user.greet`) or passing it (`setTimeout(user.greet)`, `onClick={this.handle}`) calls it **without** the dot, so `this` is lost.

### Arrow functions and this
Inside a method, an arrow callback keeps the method's `this`: `this.items.forEach(item => this.render(item))`. But an arrow used **as** the method (`greet: () => this.name`) takes `this` from the module/global scope, not the object.

### Classes
Class bodies are strict, so a detached method gets `undefined`. Class field arrows (`handle = () => { … }`) bind `this` per instance.
:::

::: diagram Deciding this
flowchart TD
  A{"Arrow function?"} -->|"yes"| L["this of the enclosing scope"]
  A -->|"no"| N{"Called with new?"}
  N -->|"yes"| NO["the new object"]
  N -->|"no"| E{"call / apply / bind?"}
  E -->|"yes"| EO["the given object"]
  E -->|"no"| D{"obj.method() call?"}
  D -->|"yes"| DO["obj"]
  D -->|"no"| U["undefined (strict) or globalThis"]
:::

::: image What is this? Decided at call time
/images/javascript/this-rules.svg
:::

::: text 🪜 Step by step
`const user = { name: 'Asha', greet() { return this?.name; } };`
1. `user.greet()` → called with a dot → `this = user` → `'Asha'`.
2. `const g = user.greet; g()` → plain call → `this = undefined` (strict) → `undefined`.
3. `g.call({ name: 'Ravi' })` → explicit → `'Ravi'`.
4. `const bound = user.greet.bind(user); bound()` → always `'Asha'`, even as a callback.
5. `new` beats `bind`: `new (Person.bind(obj))()` still creates a fresh object.
:::

::: code javascript Browser demo: the binding rules (runnable)
'use strict';
const user = {
  name: 'Asha',
  greet() { return this?.name; },
  arrowGreet: () => typeof this,                       // arrow: this from the outer scope, not user
  later() { return [1, 2].map(() => this.name); },     // arrow callback keeps the method's this
};

const detached = user.greet;
const results = {
  method: user.greet(),
  detached: detached(),
  call: user.greet.call({ name: 'Ravi' }),
  bound: user.greet.bind(user)(),
  arrowCallback: user.later().join(),
};
console.log(results);
console.log('obj.method() → obj', results.method === 'Asha' ? '✅' : '❌ FAIL');
console.log('detached call loses this', results.detached === undefined ? '✅' : '❌ FAIL');
console.log('call() sets this explicitly', results.call === 'Ravi' ? '✅' : '❌ FAIL');
console.log('bind() fixes this', results.bound === 'Asha' ? '✅' : '❌ FAIL');
console.log('arrow callbacks keep the method this', results.arrowCallback === 'Asha,Asha' ? '✅' : '❌ FAIL');

function Person(name) { this.name = name; }
const BoundPerson = Person.bind({ name: 'ignored' });
const p = new BoundPerson('Mira');
console.log('new beats bind', p.name === 'Mira' && p instanceof Person ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Arrow functions as object methods (`this` isn't the object).
- Passing `obj.method` as a callback (`setTimeout(obj.method)`) and losing `this`.
- Assuming `this` inside a nested regular function is the outer method's `this`.
- Calling `bind` inside render on every call when a stable function is needed (new function each time).
:::

::: understand
- Ask "how is this function called?" and apply the rules in order: new, explicit, method, plain.
- Arrows opt out of the rules and use the outer `this`.
:::

::: ask
- *"Strict mode or not?"* A plain call gives `undefined` in strict mode and the global object otherwise.
:::

::: important ⭐ Say this in the interview
"this is determined at call time by how the function is called. With new it's the new object, with call, apply or bind it's the object passed in, with obj.method() it's the object before the dot, and with a plain call it's undefined in strict mode or the global object in sloppy mode. Arrow functions don't have their own this, they use the surrounding scope's this, which is ideal for callbacks inside methods but wrong for the methods themselves. The classic bug is passing a method as a callback, which loses this; I fix that with bind or an arrow wrapper."
:::

::: links
MDN: this | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this
javascript.info: Object methods, this | https://javascript.info/object-methods
:::

=== What is the difference between call, apply and bind?
@p 3
@tags javascript, call, apply, bind, this
@quick
- All three set `this` for a function.
- `fn.call(obj, a, b)`: calls **now**, arguments **comma**-separated.
- `fn.apply(obj, [a, b])`: calls **now**, arguments as an **array** (handy before spread existed: `Math.max.apply(null, arr)`).
- `fn.bind(obj, a)`: returns a **new function** with `this` (and optionally the first args) fixed; call it later.
- Memory aid: **C**all = **C**omma, **A**pply = **A**rray, **B**ind = **B**e called later. Polyfills are in the Array & Function Polyfills section.

::: text 🧒 In simple words
You have a speech (`greet`) and you choose who gives it. `call` = "Asha, give the speech **now**, here are the words one by one". `apply` = the same, but you hand the words **in an envelope** (an array). `bind` = you **record a video** of Asha giving it, and can play it whenever you want.
:::

::: text 📖 Detailed answer
| | `call` | `apply` | `bind` |
|---|---|---|---|
| Runs the function | immediately | immediately | **no**, returns a new function |
| Arguments | `fn.call(ctx, a, b)` | `fn.apply(ctx, [a, b])` | `fn.bind(ctx, a)(b)` (partial application) |
| Returns | the function's result | the function's result | a bound function |
| Typical use | borrowing a method | spreading an array into args | callbacks, event handlers, partial application |

### Method borrowing
`Array.prototype.slice.call(arguments)` turns array-likes into arrays; `Object.prototype.hasOwnProperty.call(obj, 'key')` is safe even if `obj` overrides `hasOwnProperty`.

### bind details
- A bound function's `this` can't be changed again (another `bind` or `call` won't override it), **except** by `new`.
- Pre-filled arguments come first: `const add5 = add.bind(null, 5)`.
- Arrow functions ignore the `this` argument of all three.

### How call works internally (polyfill idea)
Temporarily put the function on the object (with a unique Symbol key), call it as a method (`obj[key](...args)`) so `this` becomes `obj`, then delete the key. `bind` returns a function that calls `fn.apply(ctx, [...preset, ...args])`.
:::

::: diagram call, apply and bind
flowchart LR
  F["greet(greeting, mark)"] --> C["call(user, 'Hi', '!'): runs now"]
  F --> A["apply(user, ['Hi', '!']): runs now"]
  F --> B["bind(user, 'Hi'): new function"]
  B --> L["later: g('!')"]
:::

::: image call vs apply vs bind
/images/javascript/call-apply-bind.svg
:::

::: text 🪜 Step by step
How a `myCall` polyfill sets `this`:
1. `greet.myCall(user, 'Hi')` → inside `myCall`, `this` is `greet` (it was called with a dot).
2. Create a unique key: `const key = Symbol()`.
3. Attach: `user[key] = greet`.
4. Call it as a method: `user[key]('Hi')` → now `this` inside greet is `user`.
5. Delete `user[key]` and return the result.
:::

::: code javascript Browser demo: call, apply, bind and tiny polyfills (runnable)
function greet(greeting, mark) { return `${greeting}, ${this.name}${mark}`; }
const user = { name: 'Asha' };

console.log(greet.call(user, 'Hi', '!'));
console.log(greet.apply(user, ['Hello', '?']));
const later = greet.bind(user, 'Hey');
console.log(later('!!'));

console.log('call', greet.call(user, 'Hi', '!') === 'Hi, Asha!' ? '✅' : '❌ FAIL');
console.log('apply', greet.apply(user, ['Hello', '?']) === 'Hello, Asha?' ? '✅' : '❌ FAIL');
console.log('bind + partial args', later('!!') === 'Hey, Asha!!' ? '✅' : '❌ FAIL');
console.log('bound this cannot be re-bound', later.call({ name: 'Ravi' }, '.') === 'Hey, Asha.' ? '✅' : '❌ FAIL');
console.log('apply spreads arrays', Math.max.apply(null, [3, 9, 4]) === 9 ? '✅' : '❌ FAIL');

// Polyfills (simplified)
Function.prototype.myCall = function (ctx, ...args) {
  const key = Symbol('fn');
  const target = ctx ?? globalThis;
  target[key] = this;                       // this = the function myCall was called on
  try { return target[key](...args); } finally { delete target[key]; }
};
Function.prototype.myApply = function (ctx, args = []) { return this.myCall(ctx, ...args); };
Function.prototype.myBind = function (ctx, ...preset) {
  const fn = this;
  return function (...args) { return fn.myApply(ctx, [...preset, ...args]); };
};
console.log('myCall', greet.myCall(user, 'Hi', '!') === 'Hi, Asha!' ? '✅' : '❌ FAIL');
console.log('myApply', greet.myApply(user, ['Yo', '.']) === 'Yo, Asha.' ? '✅' : '❌ FAIL');
console.log('myBind', greet.myBind(user, 'Hey')('!') === 'Hey, Asha!' ? '✅' : '❌ FAIL');
console.log('no key left behind', Object.getOwnPropertySymbols(user).length === 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Mixing up the argument styles of call and apply.
- Expecting `bind` to run the function.
- Trying to re-bind a bound function or bind an arrow function.
- `onClick={this.handle.bind(this)}` in render creates a new function every render (breaks memoized children).
:::

::: understand
- Same goal (set `this`), different timing and argument style.
- `bind` also does partial application.
:::

::: ask
- *"Do you want the polyfill to support `new` on the bound function?"* That's the hard part of a full `bind` polyfill.
:::

::: important ⭐ Say this in the interview
"All three let me choose this. call and apply invoke the function immediately: call takes the arguments one by one and apply takes them as an array. bind doesn't call anything; it returns a new function with this, and optionally the first arguments, fixed, which I use for callbacks and partial application. A bound function can't be re-bound, only new overrides it, and arrow functions ignore all three. Internally, call can be polyfilled by attaching the function to the object under a Symbol key and calling it as a method."
:::

::: links
MDN: Function.prototype.call | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call
MDN: Function.prototype.apply | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
MDN: Function.prototype.bind | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind
:::

=== Arrow functions vs regular functions
@p 3
@tags javascript, arrow-functions, this, es6
@quick
- Arrow functions have **no own `this`, `arguments`, `super` or `new.target`**: they use the outer scope's.
- They **can't be constructors** (`new` throws) and have no `.prototype`.
- `call/apply/bind` can't change an arrow's `this`.
- Short syntax: `x => x * 2`; returning an object needs parentheses: `() => ({ id: 1 })`.
- Use arrows for callbacks and closures; use regular functions/methods for object methods, constructors, and when you need `arguments`.

::: text 🧒 In simple words
A regular function is like an **employee who asks "who's my boss today?"** every time they're called. An arrow function **never asks**: it uses whoever was the boss of the place where it was **written**. That's perfect for small helpers (callbacks), bad for methods that need to know their own object.
:::

::: text 📖 Detailed answer
| Feature | Regular function | Arrow function |
|---|---|---|
| `this` | set by the call | lexical (outer scope) |
| `arguments` | ✅ | ❌ (use `...args`) |
| `new` | ✅ constructor | ❌ TypeError |
| `prototype` | ✅ | ❌ |
| Hoisting | declarations are hoisted | it's a variable: follows `const`/`let` rules |
| Duplicate params / `yield` | allowed in sloppy mode / generators | ❌ / ❌ (no arrow generators) |

### The mental model
An arrow function is a closure over the outer `this`. Conceptually `const f = () => this.x` behaves like `const self = this; const f = function () { return self.x; }`, the old `var self = this` trick.

### Where arrows shine
- Array callbacks: `items.map(i => i.price)`.
- Callbacks inside methods that need the method's `this`: `setTimeout(() => this.save(), 100)`.
- Class fields for handlers: `handleClick = () => this.setState(…)`.

### Where they bite
- Object methods: `{ name: 'A', greet: () => this.name }` → `this` isn't the object.
- Prototype methods and constructors.
- DOM listeners when you want `this` to be the element (use `event.currentTarget` instead).
:::

::: diagram Where arrow functions get this
flowchart LR
  M["method greet() called as user.greet()"] --> T["this = user"]
  T --> AR["arrow callback inside greet: uses this = user"]
  T --> RF["regular callback inside greet: this = undefined"]
:::

::: image Arrow functions vs regular functions
/images/javascript/arrow-vs-regular.svg
:::

::: text 🪜 Step by step
`const timer = { seconds: 0, start() { setInterval(() => this.seconds++, 1000); } }; timer.start();`
1. `timer.start()` is a method call → `this = timer` inside `start`.
2. The arrow callback is created inside `start` and captures that `this`.
3. `setInterval` later calls the callback as a plain function, but arrows ignore how they're called.
4. `this.seconds++` updates `timer.seconds`. ✔
5. With `function () { this.seconds++ }` the callback would get `undefined`/the global object and fail.
:::

::: code javascript Browser demo: the differences, tested (runnable)
const counter = {
  count: 0,
  incLater() { return [1, 2, 3].map(() => ++this.count); },          // arrow keeps this = counter
  incBroken() { return [1].map(function () { return this; }); },      // regular callback: this is undefined (strict) or globalThis
  arrowMethod: () => typeof this,                                     // NOT the object
};
counter.incLater();
console.log('arrow callback uses the method this', counter.count === 3 ? '✅' : '❌ FAIL');
console.log('regular callback has its own this', counter.incBroken()[0] !== counter ? '✅' : '❌ FAIL');

const arrow = () => {};
function Regular() {}
let newError = '';
try { new arrow(); } catch (e) { newError = e.name; }
console.log('arrows cannot be constructors', newError === 'TypeError' ? '✅' : '❌ FAIL');
console.log('arrows have no prototype', arrow.prototype === undefined && typeof Regular.prototype === 'object' ? '✅' : '❌ FAIL');

function sumRegular() { return Array.from(arguments).reduce((a, b) => a + b, 0); }
const sumArrow = (...args) => args.reduce((a, b) => a + b, 0);
console.log('arguments vs rest params', sumRegular(1, 2, 3) === 6 && sumArrow(1, 2, 3) === 6 ? '✅' : '❌ FAIL');

const makeUser = () => ({ id: 1 });                                   // parentheses to return an object
console.log('returning an object literal', makeUser().id === 1 ? '✅' : '❌ FAIL');
const bound = arrow.bind({ x: 1 });
console.log('bind cannot change an arrow this', typeof bound === 'function' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Arrow functions as object or prototype methods.
- `() => { id: 1 }` returns `undefined` (the braces are a function body); write `() => ({ id: 1 })`.
- Using `arguments` inside an arrow (you get the outer function's `arguments`, or an error).
- Assuming arrows are "just shorter syntax".
:::

::: understand
- Arrows = lexical `this` + no constructor features. Choose by need, not by style.
:::

::: ask
- *"Will this function be used as a method or a constructor?"* If yes, don't use an arrow.
:::

::: important ⭐ Say this in the interview
"Arrow functions are not just shorter syntax. They don't have their own this, arguments, super or new.target; they take this from the surrounding scope, and call, apply and bind can't change it. They also can't be used with new and have no prototype. That makes them ideal for callbacks inside methods and for class-field event handlers, and wrong for object methods or constructors, where a regular function gets this from the call."
:::

::: links
MDN: Arrow function expressions | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
javascript.info: Arrow functions revisited | https://javascript.info/arrow-functions
:::

=== What is an IIFE, and what is the module pattern?
@p 2
@tags javascript, iife, module-pattern, scope
@quick
- **IIFE** = Immediately Invoked Function Expression: `(function () { … })();` or `(() => { … })();`.
- The first `()` turns the function into an **expression**; the second `()` calls it immediately.
- Purpose: a **private scope** that runs once, so its variables don't leak into the global scope.
- **Module pattern** = IIFE that returns a public API and keeps the rest private through closures (how jQuery-era libraries worked).
- Today ES modules and block scope cover most uses; IIFEs remain for top-level `await` workarounds, one-off setup, and UMD bundles.

::: text 🧒 In simple words
An IIFE is like a **pop-up kitchen**: it opens, cooks one meal, and closes, leaving nothing on the street (the global scope). The module pattern is a kitchen with a **serving window**: you can order through the window (the public API), but you can't walk into the kitchen (the private variables).
:::

::: text 📖 Detailed answer
### Why the parentheses?
`function () {}` at the start of a statement is parsed as a **declaration**, which needs a name, so `function () {}()` is a SyntaxError. Wrapping it in `( )` (or using `!`, `void`, `+`) makes the parser treat it as an **expression**, which can be called right away.

### What it gives you
| Benefit | Example |
|---|---|
| No global pollution | variables inside stay private |
| Run-once setup | read config, register handlers |
| Private state + public API | the module pattern |
| Capture a value per iteration (pre-`let`) | `(function (i) { setTimeout(() => log(i)) })(i)` |
| Async setup without top-level await | `(async () => { await init(); })()` |

### The module pattern
`const Cart = (function () { const items = []; return { add(x) { items.push(x); }, count: () => items.length }; })();`
`items` is private; only `add` and `count` are public.

### Modern replacements
ES modules (`import`/`export`) give every file its own scope; `let`/`const` give block scope. IIFEs still appear in bundler output (UMD/IIFE formats) and for one-off async setup.
:::

::: diagram Module pattern: private inside, API outside
flowchart LR
  I["IIFE runs once"] --> P["private: items, total()"]
  I --> R["returns public API"]
  R --> A["Cart.add()"]
  R --> C["Cart.count()"]
  A -->|"closure"| P
  C -->|"closure"| P
:::

::: image Closure: how the returned API keeps private state alive
/images/javascript/closure.svg
:::

::: text 🪜 Step by step
`const Cart = (function () { const items = []; return { add, count }; })();`
1. The parser sees `(` so `function () {…}` is an **expression**.
2. The trailing `()` calls it immediately; a new scope with `items` is created.
3. It returns an object with `add` and `count`, both closures over `items`.
4. The IIFE is finished, but `items` lives on through those closures.
5. Outside code can only use `Cart.add` / `Cart.count`; `Cart.items` is `undefined`.
:::

::: code javascript Browser demo: IIFE and the module pattern (runnable)
const Cart = (function () {
  const items = [];                                  // private
  const total = () => items.reduce((sum, i) => sum + i.price, 0);
  return {
    add(name, price) { items.push({ name, price }); return this; },
    count: () => items.length,
    total,
  };
})();

Cart.add('Book', 300).add('Pen', 20);
console.log({ count: Cart.count(), total: Cart.total(), items: Cart.items });
console.log('public API works', Cart.count() === 2 && Cart.total() === 320 ? '✅' : '❌ FAIL');
console.log('private state is hidden', Cart.items === undefined ? '✅' : '❌ FAIL');

// IIFE keeps its variables out of the outer scope
(function () { var secret = 'inside'; })();
console.log('no leak', typeof secret === 'undefined' ? '✅' : '❌ FAIL');

// Pre-let trick: capture each loop value with an IIFE
const fns = [];
for (var i = 0; i < 3; i++) (function (j) { fns.push(() => j); })(i);
console.log('IIFE captures each value', fns.map((f) => f()).join() === '0,1,2' ? '✅' : '❌ FAIL');

// Async IIFE
(async () => {
  const value = await Promise.resolve(42);
  console.log('async IIFE', value === 42 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Forgetting the semicolon before an IIFE when the previous line has none: `a = b\n(function(){})()` calls `b`.
- Writing `function () {}()` without wrapping parentheses (SyntaxError).
- Using IIFEs for privacy in modern code where a module or block would do.
:::

::: understand
- IIFE = instant private scope; module pattern = IIFE + closure-based public API.
:::

::: ask
- *"Is this an ES module?"* Then the file scope already gives you privacy.
:::

::: important ⭐ Say this in the interview
"An IIFE is a function expression that's called immediately: the wrapping parentheses make it an expression, the trailing parentheses call it. It creates a private scope that runs once, so nothing leaks into the global scope. Combined with closures it gives the module pattern: the IIFE returns a public API, and the variables inside stay private. Today ES modules and block scope cover most of that, but IIFEs still appear in bundle formats and for async setup code."
:::

::: links
MDN: IIFE | https://developer.mozilla.org/en-US/docs/Glossary/IIFE
:::

=== What are higher-order functions and currying?
@p 3
@tags javascript, higher-order-functions, currying, functional
@quick
- A **higher-order function** takes a function as an argument and/or **returns** a function (`map`, `filter`, `setTimeout`, `debounce`, `memoize`).
- **Currying** turns `f(a, b, c)` into `f(a)(b)(c)`: each call takes one argument and returns the next function until all arguments arrive.
- **Partial application** pre-fills some arguments (`bind`, or a curried function called with fewer args).
- Generic `curry(fn)`: collect args until `args.length >= fn.length`, then call `fn`.
- Uses: reusable configured functions (`logger('error')`), composition (`pipe(trim, toLower)`), React HOCs/hooks factories.

::: text 🧒 In simple words
A **higher-order function** is a **machine that works with other machines**: you give it a small machine (a function) and it uses it (map), or it builds you a new machine (debounce). **Currying** is like ordering a sandwich at a counter: first you choose the bread, then the filling, then the sauce; at each step the counter remembers what you picked and waits for the next choice.
:::

::: text 📖 Detailed answer
### Higher-order functions
Functions are **first-class values**: you can store them, pass them and return them. A function that does either with another function is higher-order.

| Higher-order function | Takes | Returns |
|---|---|---|
| `arr.map(fn)` | a function | an array |
| `setTimeout(fn, ms)` | a function | a timer id |
| `debounce(fn, ms)` | a function | a new function |
| `makeMultiplier(2)` | a number | a function |

### Currying
`const add = (a) => (b) => (c) => a + b + c` → `add(1)(2)(3)` is `6`. Each arrow is a closure remembering the previous arguments.

A generic curry works with any function by checking `fn.length` (the number of declared parameters):
- If enough arguments arrived, call the function.
- Otherwise return a function that collects more.

### Currying vs partial application
Currying is a **transformation** (one argument per call). Partial application **fixes some arguments** of an existing function (`const double = multiply.bind(null, 2)`). A curried function makes partial application natural.

### Composition
`pipe(f, g, h)(x)` = `h(g(f(x)))`. Curried, single-argument functions plug into pipelines easily.
:::

::: diagram How a generic curry collects arguments
flowchart LR
  C["curried(1)"] --> Q1{"args >= fn.length?"}
  Q1 -->|"no: return a collector"| C2["(2)"]
  C2 --> Q2{"args >= fn.length?"}
  Q2 -->|"no"| C3["(3)"]
  C3 --> Q3{"args >= fn.length?"}
  Q3 -->|"yes"| R["fn(1, 2, 3) → 6"]
:::

::: image Currying: one argument at a time
/images/javascript/currying.svg
:::

::: text 🪜 Step by step
`curry(add3)(1)(2, 3)` where `add3 = (a, b, c) => a + b + c`:
1. `curry(add3)` returns `curried`.
2. `curried(1)`: 1 argument < 3 → return a function remembering `[1]`.
3. `(2, 3)`: combined `[1, 2, 3]`, length 3 ≥ 3 → call `add3(1, 2, 3)`.
4. Result `6`.
5. Mixed groupings like `(1, 2)(3)` or `(1)(2)(3)` give the same result.
:::

::: code javascript Browser demo: HOFs, curry, partial application and pipe (runnable)
// Higher-order: takes a function, returns a function
const withLogging = (fn) => (...args) => { const r = fn(...args); calls.push(`${fn.name}(${args}) = ${r}`); return r; };
const calls = [];
const square = (n) => n * n;
const loggedSquare = withLogging(square);
loggedSquare(4);
console.log(calls[0], calls[0] === 'square(4) = 16' ? '✅' : '❌ FAIL');

// Generic curry
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...more) => curried.apply(this, [...args, ...more]);
  };
}
const add3 = (a, b, c) => a + b + c;
const cAdd = curry(add3);
console.log('curry: all groupings', cAdd(1)(2)(3) === 6 && cAdd(1, 2)(3) === 6 && cAdd(1)(2, 3) === 6 && cAdd(1, 2, 3) === 6 ? '✅' : '❌ FAIL');

// Partial application: configured, reusable functions
const log = curry((level, scope, msg) => `[${level}] ${scope}: ${msg}`);
const errorIn = log('error');
const apiError = errorIn('api');
console.log(apiError('timeout'), apiError('timeout') === '[error] api: timeout' ? '✅' : '❌ FAIL');

// Composition
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);
const slug = pipe((s) => s.trim(), (s) => s.toLowerCase(), (s) => s.replace(/\s+/g, '-'));
console.log(slug('  Hello Big World '), slug('  Hello Big World ') === 'hello-big-world' ? '✅' : '❌ FAIL');

// Infinite currying: sum(1)(2)(3)() → 6
const sum = (a) => (b) => (b === undefined ? a : sum(a + b));
console.log('sum(1)(2)(3)()', sum(1)(2)(3)() === 6 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Relying on `fn.length` with default or rest parameters (they don't count), so a generic curry never calls the function.
- Confusing currying with partial application.
- Over-currying simple code and hurting readability.
- Forgetting `this` when currying methods (use `fn.apply(this, args)`).
:::

::: understand
- Functions are values; HOFs pass or return them. Currying = one-arg chain built from closures.
:::

::: ask
- *"Should `sum(1)(2)(3)` end with an empty call or with `valueOf`?"* Clarify the infinite-curry variant.
:::

::: important ⭐ Say this in the interview
"A higher-order function takes a function as an argument or returns one, like map, setTimeout or debounce; it's possible because functions are first-class values. Currying transforms a function of several arguments into a chain of single-argument functions, each a closure remembering what it received. A generic curry collects arguments until it has fn.length of them and then calls the original. It enables partial application, like creating a configured logger, and composition with pipe."
:::

::: links
MDN: First-class function | https://developer.mozilla.org/en-US/docs/Glossary/First-class_Function
javascript.info: Currying | https://javascript.info/currying-partials
:::

=== What is memoization?
@p 3
@tags javascript, memoization, caching, performance
@quick
- **Memoization** = caching a function's result **per input**, so the same input is computed only once.
- Works for **pure** functions (same input → same output, no side effects).
- Implementation: a closure holding a `Map`; key from the arguments (`JSON.stringify(args)` or a custom key).
- Measured (Node 22): naive `fib(35)` = **29.8 million calls, 65 ms**; memoized = **36 computations, 0.007 ms**.
- Costs: memory grows with distinct inputs → add a size limit (LRU) or `WeakMap` for object keys. React: `useMemo`, `React.memo`.

::: text 🧒 In simple words
Memoization is like writing answers in a **notebook**. The first time someone asks "what's 37 × 49?", you calculate and write it down. Next time, you just **read the notebook**. It's only safe if the answer never changes for the same question.
:::

::: text 📖 Detailed answer
### How it works
1. Build a key from the arguments.
2. If the cache has the key → return the stored result (cache **hit**).
3. Otherwise compute, store, return (cache **miss**).

### When it helps
- Expensive pure calculations called repeatedly with the same inputs (formatting, parsing, derived data).
- **Overlapping sub-problems** in recursion (Fibonacci, grid paths): turns exponential time into linear. That's top-down dynamic programming.

### When it doesn't
- Cheap functions (the cache lookup costs more than the work).
- Impure functions (time, random, network, mutation).
- Inputs that never repeat (the cache only grows).

### Keys
- Single primitive argument → use it directly.
- Several arguments → `JSON.stringify(args)` (simple, slow for big inputs, fails for functions/cycles) or a nested Map.
- Object arguments by identity → `WeakMap` (entries are garbage-collected with the object).

### In React
`useMemo(fn, deps)` caches one value per component and recomputes when deps change; `React.memo` skips re-rendering for the same props; React Compiler adds these automatically.
:::

::: diagram A memoized call
flowchart LR
  C["memoFn(args)"] --> K["key = toKey(args)"]
  K --> H{"cache.has(key)?"}
  H -->|"yes: hit"| R["return cache.get(key)"]
  H -->|"no: miss"| F["result = fn(args)"]
  F --> S["cache.set(key, result)"]
  S --> R2["return result"]
:::

::: image Memoization measured: fib(n) calls, plain vs memoized
/images/javascript/memoization.svg
:::

::: chart bar Measured: function calls to compute fib(n) (Node 22, Apple M3 Pro)
n,Plain recursion (calls),Memoized (computations)
10,177,11
20,21891,21
25,242785,26
30,2692537,31
:::

::: text 🪜 Step by step
Memoized `fib(5)` with a fresh cache:
1. `fib(5)` misses → needs `fib(4)` and `fib(3)`.
2. `fib(4)` misses → needs `fib(3)`, `fib(2)` … down to `fib(1)`, `fib(0)`, each computed once and stored.
3. Back in `fib(5)`, `fib(3)` is now a **hit** → returned instantly.
4. Total: 6 computations (n + 1) instead of 15 plain calls.
5. For `fib(35)`: 36 computations vs 29,860,703 calls.
:::

::: code javascript Browser demo: a generic memoize with hit counting (runnable)
function memoize(fn, toKey = (...args) => (args.length === 1 ? args[0] : JSON.stringify(args))) {
  const cache = new Map();
  const memo = function (...args) {
    const key = toKey(...args);
    if (cache.has(key)) { memo.hits++; return cache.get(key); }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
  memo.hits = 0;
  memo.cache = cache;
  return memo;
}

let plainCalls = 0;
const plainFib = (n) => { plainCalls++; return n < 2 ? n : plainFib(n - 1) + plainFib(n - 2); };
let memoCalls = 0;
const fib = memoize((n) => { memoCalls++; return n < 2 ? n : fib(n - 1) + fib(n - 2); });

console.log(plainFib(25), fib(25), { plainCalls, memoCalls, hits: fib.hits });
console.log('same result', plainFib(25) === fib(25) ? '✅' : '❌ FAIL');
console.log('memoized computes each n once (n + 1 values)', memoCalls === 26 ? '✅' : '❌ FAIL');
console.log('plain recursion repeats work', plainCalls > 200000 ? '✅' : '❌ FAIL');

// Multi-argument keys
let slowCalls = 0;
const area = memoize((w, h) => { slowCalls++; return w * h; });
area(2, 3); area(2, 3); area(3, 2);
console.log('multi-arg cache', slowCalls === 2 && area.hits === 1 ? '✅' : '❌ FAIL');

// Bounded cache (simple LRU) to stop unbounded memory growth
function memoizeLimited(fn, max = 2) {
  const cache = new Map();
  return (key) => {
    if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
    const v = fn(key);
    cache.set(key, v);
    if (cache.size > max) cache.delete(cache.keys().next().value);   // evict the least recently used
    return v;
  };
}
let computed = 0;
const lim = memoizeLimited((k) => { computed++; return k * 2; }, 2);
lim(1); lim(2); lim(1); lim(3); lim(2);                                // 2 was evicted by 3
console.log('LRU eviction', computed === 4 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Memoizing impure functions (stale results).
- Unbounded caches in long-running apps (memory leak).
- `JSON.stringify` keys for objects with different key order or non-serializable values.
- Wrapping recursion incorrectly: recursive calls must go through the **memoized** function, otherwise only the outer call is cached.
:::

::: understand
- Memoization = trade memory for time on repeated pure calls; it's top-down DP for recursion.
:::

::: ask
- *"How many distinct inputs, and do they repeat?"* Decides whether caching pays off and how big it may grow.
:::

::: important ⭐ Say this in the interview
"Memoization caches a pure function's result per input, so repeated calls return the stored value. I implement it with a closure holding a Map keyed by the arguments, and make sure recursive calls go through the memoized version. It turns overlapping recursion from exponential to linear: in my measurement fib(35) needed almost 30 million calls and 65 milliseconds plainly, and 36 computations memoized. The trade-off is memory, so for long-lived caches I bound them with an LRU or use a WeakMap for object keys; in React the same idea is useMemo and React.memo."
:::

::: links
MDN: Memoization (glossary) | https://developer.mozilla.org/en-US/docs/Glossary/Memoization
React: useMemo | https://react.dev/reference/react/useMemo
:::
