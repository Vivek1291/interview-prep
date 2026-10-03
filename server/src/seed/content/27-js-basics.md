@section JS Basics
@icon 🔤
@color #eab308
@desc var/let/const, data types, hoisting, type coercion and NaN, how values are passed, and shallow vs deep copies: the questions every JavaScript interview starts with. Based on your notes, with diagrams, runnable demos and measured numbers.

=== What is the difference between var, let and const?
@p 3
@tags javascript, var, let, const, scope, tdz
@quick
- `var`: **function**-scoped, can be re-declared, hoisted as `undefined`.
- `let`: **block**-scoped (`{ }`), can be reassigned, not re-declared; in the **TDZ** until its line runs.
- `const`: block-scoped, must be initialized, **cannot be reassigned** (but an object it points to can still change).
- Classic bug: `for (var i…) setTimeout(() => log(i))` prints the last value 3 times; `let` creates a new `i` per iteration.
- Default to `const`, use `let` when you reassign, avoid `var`.

::: text 🧒 In simple words
Think of variables as labels on boxes. A `var` label is stuck on the **whole house** (the function): you can see it from any room, even before you wrote it (it just says "nothing yet"). A `let` label is stuck **inside one room** (a block). A `const` label is **glued** to its box: you can't move the label to another box, although you can still change what's inside the box.
:::

::: text 📖 Detailed answer
| | `var` | `let` | `const` |
|---|---|---|---|
| Scope | function (or global) | block | block |
| Re-declare in the same scope | ✅ yes | ❌ SyntaxError | ❌ SyntaxError |
| Reassign | ✅ | ✅ | ❌ TypeError |
| Must be initialized | no | no | **yes** |
| Hoisted | yes, as `undefined` | yes, but **uninitialized** (TDZ) | yes, but uninitialized (TDZ) |
| Global `var` creates `window.x` | yes | no | no |

### Temporal Dead Zone (TDZ)
`let`/`const` variables exist from the start of their block, but reading them before their declaration line throws a `ReferenceError`. That protects you from using a value before it's ready (with `var` you silently get `undefined`).

### const is about the binding, not the value
`const user = { name: 'Asha' }; user.name = 'Ravi'` works: the variable still points to the same object. To make the object itself read-only use `Object.freeze(user)` (shallow).

### Loops
`let` in a `for` loop creates a **fresh binding per iteration**, so closures (callbacks, timers) capture the value of that iteration. With `var` there's one shared variable.
:::

::: diagram How each keyword is scoped
flowchart TD
  F["function scope"] --> V["var a: visible in the whole function"]
  F --> B["block: if / for / { }"]
  B --> L["let b: only inside the block"]
  B --> C["const c: only inside the block, no reassignment"]
  B -.->|"var inside a block leaks out"| V
:::

::: image var, let and const: scope and the temporal dead zone
/images/javascript/var-let-const.svg
:::

::: text 🪜 Step by step
What happens in `for (var i = 0; i < 3; i++) setTimeout(() => console.log(i), 0)`:
1. There is **one** `i` for the whole function.
2. The loop runs synchronously and schedules 3 callbacks, all pointing to that same `i`.
3. The loop ends with `i = 3`.
4. The callbacks run later and each reads `i` → `3, 3, 3`.
5. With `let i`, every iteration gets its own `i` (0, 1, 2), and each callback keeps its own → `0, 1, 2`.
:::

::: code javascript Browser demo: scope, TDZ and the loop bug (runnable)
const results = [];

// 1) block scope
if (true) { var v = 'var'; let l = 'let'; }
results.push(typeof v, typeof l);                       // var leaks out of the block, let doesn't

// 2) TDZ
try { console.log(early); } catch (e) { results.push(e.name); }
let early = 1;

// 3) const binding vs value
const user = { name: 'Asha' };
user.name = 'Ravi';                                     // allowed: same object
try { eval('user = {}'); } catch (e) { results.push(e.name); }   // reassigning the binding fails

console.log(results.join(', '));
console.log('var leaks, let does not', results[0] === 'string' && results[1] === 'undefined' ? '✅' : '❌ FAIL');
console.log('reading let before its line → ReferenceError', results[2] === 'ReferenceError' ? '✅' : '❌ FAIL');
console.log('const object can change, binding cannot', user.name === 'Ravi' && results[3] === 'TypeError' ? '✅' : '❌ FAIL');

// 4) the loop bug
const withVar = [], withLet = [];
for (var i = 0; i < 3; i++) setTimeout(() => withVar.push(i), 0);
for (let j = 0; j < 3; j++) setTimeout(() => withLet.push(j), 0);
setTimeout(() => {
  console.log('var:', withVar.join(), '| let:', withLet.join());
  console.log('var shares one i, let has one per iteration', withVar.join() === '3,3,3' && withLet.join() === '0,1,2' ? '✅' : '❌ FAIL');
}, 10);
:::

::: warning ⚠️ Common mistakes
- Saying `const` makes a value immutable: it only prevents **reassigning the variable**.
- Saying `let`/`const` are "not hoisted": they are hoisted, but stay in the TDZ.
- Using `var` in loops with async callbacks.
- Re-declaring a `let` in a `switch` without braces around each `case`.
:::

::: understand
- Scope = where a name is visible; TDZ = when it becomes usable.
- `const` by default communicates "this name won't point elsewhere", which makes code easier to read.
:::

::: ask
- *"Do you mean the binding or the object?"* when someone says "const objects are immutable".
- *"Is this code in a module?"* Top-level `var` in a module doesn't create a global.
:::

::: important ⭐ Say this in the interview
"var is function-scoped, can be re-declared, and is hoisted as undefined. let and const are block-scoped and hoisted but stay in the temporal dead zone until their declaration runs, so using them early throws a ReferenceError. const must be initialized and can't be reassigned, although an object it refers to can still be mutated. The classic difference shows up in loops: with var, async callbacks all see the final value; let gives each iteration its own binding. I use const by default, let when I need to reassign, and avoid var."
:::

::: links
MDN: let | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let
MDN: const | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const
MDN: Temporal dead zone | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#temporal_dead_zone_tdz
:::

=== What are the data types in JavaScript?
@p 3
@tags javascript, data-types, typeof, primitives
@quick
- **7 primitives**: `string`, `number`, `bigint`, `boolean`, `undefined`, `null`, `symbol`. Immutable, copied by value.
- Everything else is an **object** (plain objects, arrays, functions, Date, Map, Set…), held by **reference**.
- `typeof null === "object"` is a historic bug; `typeof function(){} === "function"`; `typeof [] === "object"`.
- Check arrays with `Array.isArray`, null with `=== null`, NaN with `Number.isNaN`.
- BigInt literals end with `n`: `2n ** 64n`; Numbers are 64-bit floats (`0.1 + 0.2 !== 0.3`, safe integers up to 2⁵³−1).

::: text 🧒 In simple words
**Primitives** are like **numbers written on sticky notes**: copy one and you get a separate note; nobody can change the number on your note. **Objects** are like **a shared Google Doc**: variables hold the **link**, and everyone with the link edits the same document.
:::

::: text 📖 Detailed answer
| Type | Example | `typeof` | Notes |
|---|---|---|---|
| string | `'hi'`, `` `Hi ${name}` `` | `"string"` | immutable; methods return new strings |
| number | `42`, `3.14`, `NaN`, `Infinity` | `"number"` | 64-bit float; integers safe up to `Number.MAX_SAFE_INTEGER` |
| bigint | `9007199254740993n` | `"bigint"` | arbitrary-size integers; can't mix with numbers without converting |
| boolean | `true`, `false` | `"boolean"` | |
| undefined | `let x;` | `"undefined"` | "no value yet" (set by the engine) |
| null | `null` | `"object"` ❗ | "no value on purpose" (set by you) |
| symbol | `Symbol('id')` | `"symbol"` | unique keys, e.g. hidden properties |
| object | `{}`, `[]`, `new Date()` | `"object"` | mutable, by reference |
| function | `() => {}` | `"function"` | a callable object |

### Primitive vs object in practice
- `'abc'.toUpperCase()` works because JS temporarily **wraps** the primitive in a `String` object.
- Two objects are equal only if they are the **same** object: `{} === {}` is `false`.
- Numbers are floats: `0.1 + 0.2` is `0.30000000000000004`; compare money in integer cents or use a decimal library.
:::

::: diagram Primitive vs reference types
flowchart LR
  T["A value"] --> P{"typeof is object or function?"}
  P -->|"no"| PR["Primitive: copied by value, immutable"]
  P -->|"yes (or null)"| N{"value === null?"}
  N -->|"yes"| NU["null (a primitive, typeof bug)"]
  N -->|"no"| O["Object: shared by reference, mutable"]
:::

::: image JavaScript data types: 7 primitives and objects
/images/javascript/data-types.svg
:::

::: text 🪜 Step by step
Checking a value's type reliably:
1. `value === null` → null (don't trust `typeof`).
2. `typeof value` → `'string' | 'number' | 'bigint' | 'boolean' | 'undefined' | 'symbol' | 'function' | 'object'`.
3. If `'number'`, `Number.isNaN(value)` tells you whether it's NaN.
4. If `'object'`: `Array.isArray(value)`, `value instanceof Date`, or `Object.prototype.toString.call(value)` → `"[object Map]"` etc.
:::

::: code javascript Browser demo: a reliable typeOf() (runnable)
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t !== 'object') return Number.isNaN(value) ? 'nan' : t;
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();    // "[object Date]" → "date"
}

const cases = [['hi', 'string'], [42, 'number'], [NaN, 'nan'], [10n, 'bigint'], [true, 'boolean'], [undefined, 'undefined'],
  [null, 'null'], [Symbol('id'), 'symbol'], [{}, 'object'], [[1], 'array'], [() => 1, 'function'], [new Date(0), 'date'], [new Map(), 'map']];
for (const [value, expected] of cases) {
  const got = typeOf(value);
  console.log(String(typeof value === 'symbol' ? 'Symbol(id)' : typeof value === 'bigint' ? '10n' : Number.isNaN(value) ? 'NaN' : JSON.stringify(value) ?? value).padEnd(26), '→', got, got === expected ? '✅' : '❌ FAIL');
}
console.log('typeof null is "object" (the famous bug)', typeof null === 'object' ? '✅' : '❌ FAIL');
console.log('0.1 + 0.2 is not exactly 0.3', 0.1 + 0.2 !== 0.3 && Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `typeof x === 'object'` to check for objects (true for `null` and arrays).
- Comparing floats with `===` (`0.1 + 0.2 === 0.3` is false).
- Mixing BigInt and Number: `1n + 1` throws a TypeError.
- Forgetting the `n` on BigInt literals: without it the number is rounded to the nearest float.
:::

::: understand
- The real split is **primitive (by value, immutable)** vs **object (by reference, mutable)**.
- `typeof` has two traps: `null` and arrays.
:::

::: ask
- *"Do we need exact decimals (money)?"* Then integers in cents or a decimal library, not floats.
:::

::: important ⭐ Say this in the interview
"JavaScript has seven primitive types: string, number, bigint, boolean, undefined, null and symbol, which are immutable and copied by value, and then objects, which include arrays, functions, dates, maps and so on and are held by reference. typeof has two classic traps: typeof null is 'object', and arrays are 'object' too, so I use a strict null check and Array.isArray. Numbers are 64-bit floats, so 0.1 + 0.2 isn't exactly 0.3 and big integers need BigInt."
:::

::: links
MDN: JavaScript data types | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures
MDN: typeof | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
:::

=== What is hoisting?
@p 3
@tags javascript, hoisting, execution-context
@quick
- Before running code, the engine sets up every declaration in the scope (the **creation phase**); that's what people call hoisting.
- `function` declarations: fully available before their line. `var`: exists as `undefined`. `let`/`const`/`class`: exist but in the **TDZ**.
- Function **expressions** (`const f = () => …`) follow their variable's rules: calling them early throws.
- Nothing is physically moved; only declarations are registered, **initializations stay where they are**.
- `"use strict"` doesn't disable hoisting; it stops assignments to undeclared variables from creating globals.

::: text 🧒 In simple words
Before a play starts, the stage manager reads the cast list and puts a **name card on every chair**. Some actors (function declarations) are already sitting there, ready. Some chairs have a card saying "empty for now" (`var` = undefined). Some chairs are **taped off** until the actor walks in (`let`/`const`: the TDZ). Then the play runs line by line.
:::

::: text 📖 Detailed answer
When JavaScript enters a scope (the global script, a function or a block) it creates an **execution context** in two phases:

1. **Creation phase**: scans the code for declarations and creates bindings:
   - `function foo() {}` → `foo` = the whole function
   - `var x` → `x` = `undefined`
   - `let y`, `const z`, `class C` → bindings created but **uninitialized** (TDZ)
2. **Execution phase**: runs the code line by line; assignments happen when their line runs.

| Declaration | Before its line | Typical result |
|---|---|---|
| `function f() {}` | callable | works |
| `var x = 1` | `undefined` | silent bug risk |
| `let x = 1` / `const x = 1` | ReferenceError (TDZ) | loud, safer |
| `const f = () => {}` | ReferenceError | (it's a const) |
| `var f = function () {}` | `undefined` → `f()` is a TypeError | "f is not a function" |
| `class A {}` | ReferenceError | |
:::

::: diagram The two phases of an execution context
flowchart LR
  C["Code"] --> CR["Creation phase: register declarations"]
  CR --> FN["function f: whole function"]
  CR --> VR["var x: undefined"]
  CR --> LT["let / const / class: TDZ"]
  CR --> EX["Execution phase: run line by line, assign values"]
:::

::: image Hoisting: the creation phase before execution
/images/javascript/hoisting.svg
:::

::: text 🪜 Step by step
The code: `console.log(a); sayHi(); console.log(b); var a = 1; let b = 2; function sayHi() {}`
1. Creation: `a = undefined`, `b` = uninitialized, `sayHi` = function.
2. `console.log(a)` → `undefined`.
3. `sayHi()` → works.
4. `console.log(b)` → **ReferenceError** (TDZ); execution stops here.
5. If it didn't throw, `a = 1` and `b = 2` would be assigned when their lines run.
:::

::: code javascript Browser demo: what is hoisted, and how (runnable)
const log = [];

log.push(`function: ${typeof declared}`);        // function: available before its line
log.push(`var: ${String(hoistedVar)}`);          // var: undefined
try { log.push(String(tdz)); } catch (e) { log.push(`let: ${e.name}`); }
try { expr(); } catch (e) { log.push(`var + function expression: ${e.name}`); }

function declared() {}
var hoistedVar = 'assigned later';
let tdz = 'ready';
var expr = function () {};

console.log(log.join(' | '));
const expected = ['function: function', 'var: undefined', 'let: ReferenceError', 'var + function expression: TypeError'];
console.log('hoisting rules', JSON.stringify(log) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
console.log('initializations are NOT hoisted: now it is assigned', hoistedVar === 'assigned later' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Saying the engine "moves code to the top".
- Saying `let` and `const` aren't hoisted (they are, into the TDZ).
- Calling a function **expression** before its definition.
- Believing `"use strict"` prevents hoisting (it prevents implicit globals).
:::

::: understand
- Hoisting = consequence of the creation phase of execution contexts.
- The TDZ exists to make "use before ready" an error instead of `undefined`.
:::

::: ask
- *"Is the function a declaration or an expression?"* It changes the answer.
:::

::: important ⭐ Say this in the interview
"Hoisting is what we call the creation phase of an execution context: before running a scope's code, the engine registers its declarations. Function declarations are created fully, so they can be called before their line; var variables exist as undefined; let, const and class bindings exist but are in the temporal dead zone until their declaration runs, so accessing them early throws. Only declarations are hoisted, not initializations, and function expressions follow the rules of the variable that holds them."
:::

::: links
MDN: Hoisting | https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
MDN: Strict mode | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
:::

=== How does type coercion work? (== vs ===, truthy/falsy, NaN)
@p 3
@tags javascript, coercion, equality, nan, truthy
@quick
- **Coercion** = JavaScript converting a value to another type automatically (`"3" + 4` → `"34"`, `"3" - 4` → `-1`).
- `+` with a string concatenates; `- * / %` convert to numbers; `if (x)`, `&&`, `||`, `!` convert to boolean.
- Falsy: `false, 0, -0, 0n, "", null, undefined, NaN`. Everything else (including `[]`, `{}`, `"0"`) is truthy.
- `===` compares without conversion (use it); `==` converts first (`0 == ""` is true). Exception people use: `x == null` checks null **or** undefined.
- `NaN !== NaN`. Use `Number.isNaN(x)` (global `isNaN("hi")` converts first and returns true).

::: text 🧒 In simple words
Coercion is JavaScript being **too helpful**: you give it apples and oranges and it quietly turns one into the other so it can finish the job. Sometimes that's handy (`"Total: " + 5`), sometimes surprising (`[] + {}`). `===` is the strict shopkeeper: "apples only equal apples".
:::

::: text 📖 Detailed answer
### The three conversions
| To | When | Examples |
|---|---|---|
| **String** | `+` when either side is a string, template literals | `"3" + 4` → `"34"`, `` `${[1,2]}` `` → `"1,2"` |
| **Number** | `- * / % **`, unary `+`, `<`/`>` with non-strings, `==` with a number | `"3" - 4` → `-1`, `+"" ` → `0`, `+"12px"` → `NaN`, `true + 1` → `2` |
| **Boolean** | `if`, `while`, `? :`, `!`, `&&`, `\|\|` | `!!"0"` → `true`, `!!0` → `false` |

Objects are first converted to a **primitive** (`valueOf()`, then `toString()`): `[] + {}` → `"" + "[object Object]"`.

### && and || return a value, not just a boolean
`a || b` returns `a` if truthy, else `b`; `a && b` returns `a` if falsy, else `b`. `??` returns the right side only for `null`/`undefined` (`0 ?? 5` → `0`, `0 || 5` → `5`).

### Loose vs strict equality
`===` (strict) compares type and value. `==` (loose) applies coercion rules: `null == undefined` (true), number vs string → both to numbers, boolean → number. That's why `0 == ""`, `"1" == true` and `[] == false` are all true. Use `===`; the only common `==` idiom is `value == null`.

### NaN
"Not a Number" is a **number** that represents an invalid result (`Number("hello")`, `0/0`). It's the only value not equal to itself. `Number.isNaN(x)` checks for NaN exactly; `isNaN(x)` converts first, so `isNaN("hello")` is `true`. `Object.is(NaN, NaN)` is `true`.
:::

::: diagram How == decides
flowchart TD
  S{"Same type?"} -->|"yes"| ST["Compare like ==="]
  S -->|"no"| N{"null with undefined?"}
  N -->|"yes"| T["true"]
  N -->|"no"| B{"A boolean involved?"}
  B -->|"yes"| BN["Boolean → number, compare again"]
  B -->|"no"| NS{"number with string?"}
  NS -->|"yes"| SN["String → number, compare"]
  NS -->|"no"| OP["Object → primitive, compare again"]
:::

::: image Type coercion examples and the falsy values
/images/javascript/coercion.svg
:::

::: text 🪜 Step by step
Why `[] == false` is `true`:
1. Types differ (object vs boolean) and it's not null/undefined.
2. A boolean is involved → `false` becomes `0`: `[] == 0`.
3. Object vs number → convert the array to a primitive: `[].toString()` → `""`: `"" == 0`.
4. String vs number → `""` becomes `0`: `0 == 0` → **true**.
5. Yet `if ([])` runs, because an array is truthy. That's why we avoid `==`.
:::

::: code javascript Browser demo: coercion results you should be able to predict (runnable)
const cases = [
  ['"3" + 4', '3' + 4, '34'],
  ['"3" - 4', '3' - 4, -1],
  ['true + 1', true + 1, 2],
  ['[] + {}', [] + {}, '[object Object]'],
  ['+"12px"', Number.isNaN(+'12px'), true],
  ['0 || 5', 0 || 5, 5],
  ['0 ?? 5', 0 ?? 5, 0],
  ['null == undefined', null == undefined, true],      // eslint-disable-line eqeqeq
  ['0 == ""', 0 == '', true],                            // eslint-disable-line eqeqeq
  ['[] == false', [] == false, true],                    // eslint-disable-line eqeqeq
  ['Boolean([])', Boolean([]), true],
  ['NaN === NaN', NaN === NaN, false],                   // eslint-disable-line no-self-compare
  ['isNaN("hi")', isNaN('hi'), true],                    // converts first!
  ['Number.isNaN("hi")', Number.isNaN('hi'), false],
];
let ok = true;
for (const [label, got, expected] of cases) {
  const pass = Object.is(got, expected);
  ok = ok && pass;
  console.log(label.padEnd(20), '→', JSON.stringify(got), pass ? '✅' : '❌ FAIL');
}
console.log('falsy values', [false, 0, -0, 0n, '', null, undefined, NaN].every((v) => !v) ? '✅' : '❌ FAIL');
console.log('all predictions right', ok ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `==` and getting `0 == ""` or `"1" == true`.
- `if (count)` when 0 is a valid value; use `count !== undefined` or `??`.
- `value || default` when `0` or `""` are valid inputs; use `??`.
- `isNaN(input)` to validate numbers (strings like `"hello"` coerce to NaN).
- Reading form inputs (always strings) and adding them: `"2" + "3"` → `"23"`. Convert with `Number()`.
:::

::: understand
- Three target types: string, number, boolean; objects go through `toPrimitive` first.
- `===`, `??` and `Number.isNaN` remove most surprises.
:::

::: ask
- *"Is 0 or an empty string a valid value here?"* Decides between `||` and `??`.
:::

::: important ⭐ Say this in the interview
"Type coercion is JavaScript converting values automatically: plus with a string concatenates, the other arithmetic operators convert to numbers, and conditions convert to booleans, where only false, 0, -0, 0n, empty string, null, undefined and NaN are falsy. Loose equality converts before comparing, which gives results like zero loosely equal to an empty string, so I use strict equality, with a loose null check as the one idiom for null-or-undefined. NaN is a number that isn't equal to itself; I check it with Number.isNaN, because the global isNaN converts its argument first."
:::

::: links
MDN: Equality comparisons and sameness | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness
MDN: Truthy | https://developer.mozilla.org/en-US/docs/Glossary/Truthy
MDN: Number.isNaN | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN
:::

=== Is JavaScript pass by value or pass by reference?
@p 3
@tags javascript, references, memory, objects
@quick
- JavaScript is **always pass by value**. For objects, the value is a **reference** ("call by sharing").
- Primitives: the function gets a copy; changing it inside doesn't affect the caller.
- Objects: the function gets a copy of the reference → **mutating** the object is visible outside; **reassigning** the parameter is not.
- `const a = {}; const b = a;` → one object, two names. `{} === {}` is false (different objects).
- To avoid surprises: don't mutate arguments; return new objects (`{ ...obj, x: 1 }`).

::: text 🧒 In simple words
Giving a function a number is like giving someone a **photocopy** of a page: whatever they scribble stays on their copy. Giving it an object is like giving them a **photocopy of your house key**: it's a separate key, but it opens **the same house**. If they repaint a room, you see it. If they throw their key away and get a different house (reassign), your house is untouched.
:::

::: text 📖 Detailed answer
### What variables hold
- A primitive variable holds the **value** itself (conceptually on the stack).
- An object variable holds a **reference** (an address) to the object in the **heap**.

### Assignment and function calls copy the variable's value
| Code | Effect |
|---|---|
| `let b = a` (number) | `b` gets its own copy |
| `const copy = user` | both point to the same object |
| `function f(n) { n = 9 }` | caller's number unchanged |
| `function f(o) { o.x = 9 }` | caller's object **changed** |
| `function f(o) { o = { x: 9 } }` | caller's variable **unchanged** (only the local copy of the reference was replaced) |

That's why it's not "pass by reference": in real pass-by-reference (C++ `&`), reassigning the parameter would change the caller's variable.

### Why it matters in React and Redux
State updates compare references: `setUser(user)` after `user.name = 'x'` is the **same** reference → React may skip the update. Always create a new object.
:::

::: diagram Passing an object to a function
flowchart LR
  U["caller: user → object A"] -->|"call f(user): copies the reference"| P["parameter o → object A"]
  P --> M["o.name = 'Ravi': changes object A (caller sees it)"]
  P --> R["o = {}: o now → object B (caller still → A)"]
:::

::: image Primitives are copied, objects are shared
/images/javascript/pass-by-sharing.svg
:::

::: text 🪜 Step by step
The code: `const user = { name: 'Asha' }; function rename(u) { u.name = 'Ravi'; u = { name: 'Zoe' }; } rename(user);`
1. `user` holds reference #1 → `{ name: 'Asha' }`.
2. Calling `rename(user)` copies **reference #1** into `u`.
3. `u.name = 'Ravi'` follows #1 and changes the shared object.
4. `u = { name: 'Zoe' }` creates object #2 and points only `u` at it.
5. After the call, `user.name` is `'Ravi'` (step 3), not `'Zoe'` (step 4).
:::

::: code javascript Browser demo: mutate vs reassign (runnable)
function changeNumber(n) { n = 99; }
function mutate(obj) { obj.name = 'Ravi'; }
function reassign(obj) { obj = { name: 'Zoe' }; }

let count = 1;
changeNumber(count);
const user = { name: 'Asha' };
const alias = user;                         // same object
mutate(user);
reassign(user);

console.log({ count, user, sameObject: alias === user });
console.log('primitive copy: caller unchanged', count === 1 ? '✅' : '❌ FAIL');
console.log('mutating the object: caller sees it', user.name === 'Ravi' ? '✅' : '❌ FAIL');
console.log('reassigning the parameter: caller unaffected (not pass-by-reference)', user.name !== 'Zoe' ? '✅' : '❌ FAIL');
console.log('two literals are different objects', ({}) !== ({}) ? '✅' : '❌ FAIL');

// The safe pattern: return a new object instead of mutating the argument
const renamed = { ...user, name: 'Mira' };
console.log('immutable update keeps the original', user.name === 'Ravi' && renamed.name === 'Mira' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Saying "objects are passed by reference" (reassignment proves they aren't).
- Mutating function arguments or props, causing bugs far away.
- Comparing objects with `===` to check equal content.
- Copying with `const copy = original` and expecting a separate object.
:::

::: understand
- Every assignment copies a value; for objects, that value is an address.
- Mutation is shared, reassignment is local.
:::

::: ask
- *"Should this function mutate its input or return a new value?"* Prefer returning new values.
:::

::: important ⭐ Say this in the interview
"JavaScript always passes by value, but for objects the value is a reference, which is often called call by sharing. A function that receives a primitive gets a copy, so changing it doesn't affect the caller. A function that receives an object gets a copy of the reference: if it mutates the object the caller sees the change, but if it reassigns the parameter to a new object the caller's variable still points to the original. That's why I avoid mutating arguments and create new objects, which is also what React's state comparisons rely on."
:::

::: links
MDN: Functions (passing arguments) | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions#function_parameters
javascript.info: Object references and copying | https://javascript.info/object-copy
:::

=== What is the difference between a shallow and a deep copy?
@p 3
@tags javascript, copy, structuredClone, deepclone
@quick
- **Shallow copy** (`{...obj}`, `Object.assign`, `arr.slice()`, `[...arr]`): new top-level object, nested objects **shared**.
- **Deep copy**: everything copied recursively, nothing shared: `structuredClone(obj)` (modern), a custom recursive clone, or `JSON.parse(JSON.stringify(obj))` (lossy).
- JSON loses `Date` (→ string), `undefined`, functions, `Map`/`Set`, and throws on circular references.
- Measured (10,000 copies of a nested object, Node 22): spread **0.4 ms**, custom deepClone **26 ms**, JSON **45 ms**, `structuredClone` **52 ms**.
- For React state: copy only the path you change (`{ ...user, address: { ...user.address, city } }`).

::: text 🧒 In simple words
A **shallow copy** is photocopying the **first page** of a binder and keeping the same attached folders: if someone edits a folder, both binders show it. A **deep copy** photocopies **every page in every folder**: two completely independent binders.
:::

::: text 📖 Detailed answer
| | Shallow | Deep |
|---|---|---|
| Top-level properties | copied | copied |
| Nested objects / arrays | **shared** (same references) | **new** objects |
| Speed | very fast | slower (visits everything) |
| Typical tools | spread, `Object.assign`, `slice`, `Array.from` | `structuredClone`, custom recursive clone, lodash `cloneDeep` |

### Deep copy options
| Method | Keeps Date / Map / Set | Handles cycles | Functions | Notes |
|---|---|---|---|---|
| `structuredClone(x)` | ✅ | ✅ | ❌ throws | built into browsers and Node 17+ |
| `JSON.parse(JSON.stringify(x))` | ❌ (Date → string, Map → {}) | ❌ throws | dropped | only for plain JSON data |
| custom recursive clone + `WeakMap` | if you handle them | ✅ with the WeakMap | your choice | full control |

### Often you don't need a deep copy
Immutable updates only copy the objects on the path you change; the rest is shared safely because nobody mutates it. That's faster and is what React/Redux expect.
:::

::: diagram What a shallow copy shares
flowchart LR
  O["original"] --> A["address object"]
  S["shallow copy"] --> A
  D["deep copy"] --> A2["new address object"]
:::

::: image Shallow vs deep copy (measured: 0.7 ms vs 26 to 52 ms for 10,000 copies)
/images/javascript/shallow-deep.svg
:::

::: chart bar Measured: copying a nested object 10,000 times (Node 22, Apple M3 Pro, median of 7 runs)
Method,Time (ms)
spread (shallow),0.4
Object.assign (shallow),0.7
custom deepClone (WeakMap),26
JSON.parse(JSON.stringify),45
structuredClone,52
:::

::: text 🪜 Step by step
Your WeakMap deepClone on `const obj = { a: 1 }; obj.self = obj;`:
1. `deepClone(obj)`: it's an object, not seen before → create `result = {}` and remember `map.set(obj, result)` **before** copying children.
2. Copy `a` → `1`.
3. Copy `self` → `deepClone(obj)` again → found in the map → return the **same `result`** instead of recursing forever.
4. `result.self === result` → the cycle is reproduced in the copy.
5. Without the map, step 3 would recurse until "Maximum call stack size exceeded".
:::

::: code javascript Browser demo: shallow vs deep, and a deepClone that handles cycles and Dates (runnable)
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;   // primitives and functions
  if (value instanceof Date) return new Date(value);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [deepClone(k, seen), deepClone(v, seen)]));
  if (value instanceof Set) return new Set([...value].map((v) => deepClone(v, seen)));
  if (seen.has(value)) return seen.get(value);                    // circular reference
  const result = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, result);
  for (const key of Reflect.ownKeys(value)) result[key] = deepClone(value[key], seen);
  return result;
}

const original = { name: 'Vivek', skills: ['JS', 'React'], address: { city: 'Delhi' }, joined: new Date(2020, 0, 1) };
original.self = original;

const shallow = { ...original };
shallow.address.city = 'Mumbai';
console.log('shallow copy shares nested objects', original.address.city === 'Mumbai' ? '✅' : '❌ FAIL');

original.address.city = 'Delhi';
const deep = deepClone(original);
deep.address.city = 'Pune';
deep.skills.push('Node');
console.log('deep copy is independent', original.address.city === 'Delhi' && original.skills.length === 2 ? '✅' : '❌ FAIL');
console.log('Date stays a Date', deep.joined instanceof Date && deep.joined !== original.joined ? '✅' : '❌ FAIL');
console.log('cycle reproduced, not infinite', deep.self === deep ? '✅' : '❌ FAIL');

const viaJson = JSON.parse(JSON.stringify({ d: new Date(0), u: undefined, n: NaN }));
console.log('JSON is lossy: Date → string, undefined dropped, NaN → null', typeof viaJson.d === 'string' && !('u' in viaJson) && viaJson.n === null ? '✅' : '❌ FAIL');
if (typeof structuredClone === 'function') {
  const sc = structuredClone({ d: new Date(0), m: new Map([[1, 'a']]) });
  console.log('structuredClone keeps Date and Map', sc.d instanceof Date && sc.m.get(1) === 'a' ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Thinking spread copies deeply.
- Using JSON cloning on data with Dates, Maps, `undefined` or cycles.
- Deep-cloning big state on every update in React (slow, and breaks memoization for unchanged parts).
- `structuredClone` on objects with functions or DOM nodes: it throws a `DataCloneError`.
:::

::: understand
- Shallow = new container, shared contents; deep = new everything.
- Prefer targeted immutable updates; reach for `structuredClone` when you truly need independence.
:::

::: ask
- *"What's in the data: Dates, Maps, class instances, cycles?"* Picks the cloning method.
:::

::: important ⭐ Say this in the interview
"A shallow copy, like spread or Object.assign, creates a new top-level object but shares the nested objects, so changing a nested property affects both. A deep copy duplicates everything recursively. Today I use structuredClone, which keeps Dates, Maps, Sets and circular references; JSON stringify and parse is lossy and throws on cycles; and a custom recursive clone needs a WeakMap to handle cycles. Deep copies cost far more: in my measurement 10,000 copies took under a millisecond shallow and 26 to 52 milliseconds deep, so for React state I copy just the path I change."
:::

::: links
MDN: structuredClone | https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
MDN: Shallow copy | https://developer.mozilla.org/en-US/docs/Glossary/Shallow_copy
MDN: Deep copy | https://developer.mozilla.org/en-US/docs/Glossary/Deep_copy
:::
