@section JS Objects & Prototypes
@icon 🧬
@color #eab308
@desc Prototypes and inheritance, constructor functions vs classes, abstract classes, rest/spread, generators and iterators, Map/Set/WeakMap, and error types, with diagrams and runnable demos.

=== What is a prototype, and how does prototypal inheritance work?
@p 3
@tags javascript, prototype, inheritance, oop
@quick
- Every object has a hidden link `[[Prototype]]` to another object (or `null`); read it with `Object.getPrototypeOf(obj)`.
- Reading a missing property walks the **prototype chain** until it's found or `null` is reached (→ `undefined`).
- **Writing** a property always creates/updates an **own** property (it never changes the prototype).
- Functions have a `.prototype` object; `new Fn()` links the new object to `Fn.prototype`. Classes use the same mechanism.
- Inherit with `Object.create(proto)`, `class B extends A`, or `Object.setPrototypeOf` (slow, avoid). Don't use `__proto__` in new code.

::: text 🧒 In simple words
Imagine asking your **parent** for something you don't have. If they don't have it, they ask **their parent**, and so on up the family. Objects work the same way: when an object doesn't have a property, it asks its prototype, then the prototype's prototype, until someone has it or the family tree ends.
:::

::: text 📖 Detailed answer
### Own properties vs inherited properties
`const rex = new Dog('Rex')`: `name` is an **own** property; `bark()` lives on `Dog.prototype`; `eat()` on `Animal.prototype`; `toString()` on `Object.prototype`. All dogs **share** the methods on the prototype (memory efficient), while each dog has its own `name`.

### The lookup rules
| Operation | What happens |
|---|---|
| `rex.bark()` | not own → found on `Dog.prototype` |
| `rex.eat()` | → `Dog.prototype` → `Animal.prototype` ✓ |
| `rex.fly` | … → `Object.prototype` → `null` → `undefined` |
| `rex.bark = fn` | creates an own `bark` that **shadows** the prototype's |
| `'eat' in rex` | true (checks the chain) |
| `Object.hasOwn(rex, 'eat')` | false (own only) |

### .prototype vs [[Prototype]]
- `Fn.prototype`: a normal property on **functions**, the object that instances will link to.
- `obj.[[Prototype]]` (`Object.getPrototypeOf(obj)`): the actual link every object has.
- So `Object.getPrototypeOf(rex) === Dog.prototype`, and `Dog.prototype.constructor === Dog`.

### Ways to set up inheritance
- `Object.create(proto)`: a new object whose prototype is `proto` (pure prototypal style).
- `class Dog extends Animal`: sets up both `Dog.prototype → Animal.prototype` and `Dog → Animal` (for static methods).
- Old style: `Dog.prototype = Object.create(Animal.prototype); Dog.prototype.constructor = Dog;` plus `Animal.call(this, name)` in the constructor.
:::

::: diagram Following the chain
flowchart LR
  R["rex: name"] -->|"[[Prototype]]"| D["Dog.prototype: bark()"]
  D -->|"[[Prototype]]"| A["Animal.prototype: eat()"]
  A -->|"[[Prototype]]"| O["Object.prototype: toString()"]
  O --> N["null"]
:::

::: image The prototype chain
/images/javascript/prototype-chain.svg
:::

::: text 🪜 Step by step
`rex.eat()`:
1. Look at rex's own properties: `name` only → not found.
2. Follow `[[Prototype]]` to `Dog.prototype`: has `bark`, not `eat`.
3. Follow to `Animal.prototype`: `eat` found.
4. Call it with `this = rex` (method call through the chain still uses the object before the dot).
5. Had it not been found, the walk would continue to `Object.prototype` and then `null` → `undefined` → calling it throws `TypeError: rex.eat is not a function`.
:::

::: code javascript Browser demo: prototype chain, shadowing and inheritance styles (runnable)
// 1) Constructor functions + prototypes (the old way)
function Animal(name) { this.name = name; }
Animal.prototype.eat = function () { return `${this.name} eats`; };

function Dog(name) { Animal.call(this, name); }                // inherit own props
Dog.prototype = Object.create(Animal.prototype);               // inherit methods
Dog.prototype.constructor = Dog;
Dog.prototype.bark = function () { return `${this.name} barks`; };

const rex = new Dog('Rex');
console.log(rex.eat(), '|', rex.bark());
console.log('chain: rex → Dog.prototype → Animal.prototype', Object.getPrototypeOf(rex) === Dog.prototype && Object.getPrototypeOf(Dog.prototype) === Animal.prototype ? '✅' : '❌ FAIL');
console.log('methods are shared, not copied', Object.hasOwn(rex, 'name') && !Object.hasOwn(rex, 'eat') && 'eat' in rex ? '✅' : '❌ FAIL');
console.log('instanceof walks the chain', rex instanceof Dog && rex instanceof Animal && rex instanceof Object ? '✅' : '❌ FAIL');

// 2) Writing creates an own property that shadows the prototype
const fido = new Dog('Fido');
fido.bark = () => 'Fido whispers';
console.log('shadowing', fido.bark() === 'Fido whispers' && rex.bark() === 'Rex barks' ? '✅' : '❌ FAIL');

// 3) Pure prototypal style with Object.create
const animal = { eat() { return `${this.name} eats`; } };
const cat = Object.create(animal, { name: { value: 'Tom', enumerable: true } });
console.log('Object.create links directly', cat.eat() === 'Tom eats' && Object.getPrototypeOf(cat) === animal ? '✅' : '❌ FAIL');

// 4) Adding to a prototype affects all existing instances
Animal.prototype.sleep = function () { return `${this.name} sleeps`; };
console.log('late-added methods reach old instances', rex.sleep() === 'Rex sleeps' ? '✅' : '❌ FAIL');

// 5) End of the chain
console.log('chain ends at null', Object.getPrototypeOf(Object.prototype) === null ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Confusing `Fn.prototype` with an object's `[[Prototype]]`.
- Forgetting to reset `Dog.prototype.constructor` after `Object.create` (old style).
- Putting arrays/objects on the prototype (`Dog.prototype.tricks = []`): every instance shares and mutates the same array.
- Extending built-in prototypes (`Array.prototype.myThing`) in application code (collisions with future standards).
- Using `for…in` without `Object.hasOwn` (it also lists inherited enumerable properties).
:::

::: understand
- Inheritance in JS = **delegation**: objects forward missing lookups to their prototype.
- `class` doesn't change this model; it's nicer syntax for it.
:::

::: ask
- *"Do you want classical-style (class/extends) or composition?"* Many teams prefer composition over deep chains.
:::

::: important ⭐ Say this in the interview
"Every JavaScript object has an internal link to a prototype object. When I read a property that isn't on the object itself, the engine follows that link up the prototype chain until it finds it or reaches null, which gives undefined. Writes always create own properties, which can shadow inherited ones. Functions have a prototype property, and new links each instance to it, so methods are shared across instances. ES6 classes and extends use exactly this mechanism; they're syntax over prototypal delegation."
:::

::: links
MDN: Inheritance and the prototype chain | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain
javascript.info: Prototypal inheritance | https://javascript.info/prototype-inheritance
:::

=== Constructor functions vs classes (and what does new do?)
@p 3
@tags javascript, classes, constructor, new, oop
@quick
- `new Fn(args)`: (1) create `{}`, (2) link it to `Fn.prototype`, (3) run `Fn` with `this` = the object, (4) return it (unless `Fn` returns another object).
- `class` is **syntax over constructor functions + prototypes**, with extras: strict mode, must be called with `new`, non-enumerable methods, `extends`/`super`, `static`, **`#private`** fields.
- Class declarations are hoisted into the TDZ (not usable before the line), unlike function declarations.
- `super(...)` must be called before using `this` in a derived constructor.
- Prefer methods on the prototype (shared) over functions created in the constructor (one per instance).

::: text 🧒 In simple words
A constructor function or class is a **cookie cutter**: `new` presses it into dough to make a new cookie. Each cookie has its own decorations (own properties), but all cookies share the same **recipe book** of what they can do (methods on the prototype).
:::

::: text 📖 Detailed answer
### What new does, in 4 steps
1. Creates an empty object.
2. Sets its `[[Prototype]]` to `Constructor.prototype`.
3. Calls the constructor with `this` bound to the new object.
4. Returns the object (if the constructor returns a different **object**, that is returned instead; primitives are ignored).

### Constructor function vs class
| | Constructor function | `class` |
|---|---|---|
| Call without `new` | allowed (bugs: `this` is undefined/global) | **TypeError** |
| Strict mode | only if you add it | always |
| Methods | `Fn.prototype.m = function () {}` (enumerable) | in the body (non-enumerable) |
| Inheritance | `Object.create` + `Parent.call(this)` | `extends` + `super()` |
| Private state | closures | `#field`, `#method()` |
| Static members | `Fn.helper = …` | `static helper()` |
| Hoisting | callable before the line | TDZ |

### Class features worth knowing
- **Public fields**: `count = 0` (per instance).
- **Private fields**: `#balance` (truly private, checked by the engine; `#balance in obj` tests presence).
- **Static blocks**: `static { … }` for one-time setup.
- **Getters/setters**: `get total() {}`.
- Arrow **class fields** (`handle = () => {}`) bind `this` but create a new function per instance (not on the prototype).
:::

::: diagram new Person('Asha')
flowchart LR
  N["new Person('Asha')"] --> S1["1 create empty object"]
  S1 --> S2["2 link to Person.prototype"]
  S2 --> S3["3 run constructor with this = object"]
  S3 --> S4["4 return the object"]
:::

::: image What new does, and how classes map to prototypes
/images/javascript/new-keyword.svg
:::

::: text 🪜 Step by step
Writing your own `myNew(Person, 'Asha')`:
1. `const obj = Object.create(Person.prototype)` → steps 1 and 2 in one go.
2. `const result = Person.apply(obj, ['Asha'])` → step 3.
3. If `result` is a non-null object or function → return `result`.
4. Otherwise return `obj` → step 4.
5. `myNew(Person, 'Asha') instanceof Person` → `true`.
:::

::: code javascript Browser demo: myNew, classes, private fields and extends (runnable)
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype);
  const result = Constructor.apply(obj, args);
  return result !== null && (typeof result === 'object' || typeof result === 'function') ? result : obj;
}
function Person(name) { this.name = name; }
Person.prototype.greet = function () { return `Hi, I am ${this.name}`; };
const asha = myNew(Person, 'Asha');
console.log(asha.greet(), asha instanceof Person ? '✅' : '❌ FAIL');

class Account {
  #balance = 0;                                  // truly private
  static count = 0;
  constructor(owner) { this.owner = owner; Account.count++; }
  deposit(amount) { if (amount <= 0) throw new RangeError('amount must be positive'); this.#balance += amount; return this; }
  get balance() { return this.#balance; }
}
class Savings extends Account {
  constructor(owner, rate) { super(owner); this.rate = rate; }   // super() before this
  addInterest() { return this.deposit(this.balance * this.rate); }
}
const s = new Savings('Ravi', 0.1).deposit(1000).addInterest();
console.log({ owner: s.owner, balance: s.balance, accounts: Account.count });
console.log('extends + super', s.balance === 1100 && s instanceof Account ? '✅' : '❌ FAIL');
console.log('private field is hidden', s['#balance'] === undefined && Object.keys(s).join() === 'owner,rate' ? '✅' : '❌ FAIL');
console.log('class methods live on the prototype', Object.hasOwn(Account.prototype, 'deposit') ? '✅' : '❌ FAIL');
let err = '';
try { Account('x'); } catch (e) { err = e.name; }
console.log('classes require new', err === 'TypeError' ? '✅' : '❌ FAIL');
console.log('class is still a function', typeof Account === 'function' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Calling a constructor function without `new` (properties end up on `undefined`/global).
- Using `this` before `super()` in a derived class (ReferenceError).
- Defining methods inside the constructor (`this.greet = function…`), creating a copy per instance.
- Thinking `#private` and TypeScript `private` are the same (TS `private` is compile-time only).
:::

::: understand
- `new` = create + link + run + return. `class` = the same, safer and with private fields.
:::

::: ask
- *"Do we need inheritance at all?"* Often composition or plain functions are simpler.
:::

::: important ⭐ Say this in the interview
"new does four things: creates an empty object, links its prototype to the constructor's prototype, runs the constructor with this bound to the object, and returns it unless the constructor returns another object. Classes are syntax over that same model, but they add safety and features: they always run in strict mode, can't be called without new, define non-enumerable prototype methods, support extends and super, static members and real #private fields. In a derived class I must call super before touching this."
:::

::: links
MDN: new operator | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new
MDN: Classes | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
MDN: Private properties | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_properties
:::

=== How do you create an abstract class in JavaScript?
@p 2
@tags javascript, classes, abstract, oop, new.target
@quick
- JavaScript has **no `abstract` keyword** (TypeScript does). You simulate it.
- Block direct instantiation: in the constructor, `if (new.target === Shape) throw new TypeError('abstract')`.
- Force subclasses to implement methods: define them on the base class to `throw new Error('not implemented')`, or check in the constructor that `this.area !== Shape.prototype.area`.
- Shared behaviour goes in the base class (template method pattern), specifics in subclasses.
- Prototype-based version: a base object with "abstract" methods that throw, and `Object.create(base)` for concrete objects.

::: text 🧒 In simple words
An abstract class is a **template form**: it says "every vehicle must have a `drive()` method", but you can't buy a plain "vehicle", only a car or a bike that fills in the blanks.
:::

::: text 📖 Detailed answer
### What an abstract class is
A base class that **can't be instantiated** and that **declares methods subclasses must implement**, while possibly providing shared logic.

### How to simulate it
| Requirement | Technique |
|---|---|
| Can't do `new Shape()` | `if (new.target === Shape) throw new TypeError(…)` (`new.target` is the class actually being constructed) |
| Subclass must implement `area()` | base `area() { throw new Error('area() must be implemented') }`, or check in the base constructor |
| Shared logic | normal methods in the base class (`describe()` calls `this.area()`) |
| Prototype-only style | `const Shape = { area() { throw … }, describe() { … } }`, then `Object.create(Shape)` |

### Template method pattern
The base class defines the **algorithm** (`describe()`), and subclasses provide the **steps** (`area()`, `name`). This is the main real use of abstract classes.

### In TypeScript
`abstract class Shape { abstract area(): number }` is checked at **compile time**; the emitted JS is a normal class, so runtime checks still need `new.target` if you want them.
:::

::: diagram Abstract base, concrete subclasses
classDiagram
  class Shape {
    +describe()
    +area()* abstract
  }
  class Circle {
    +radius
    +area()
  }
  class Square {
    +side
    +area()
  }
  Shape <|-- Circle
  Shape <|-- Square
:::

::: image How classes map to prototypes (the base for abstract classes)
/images/javascript/new-keyword.svg
:::

::: text 🪜 Step by step
`new Circle(2)` with an abstract `Shape`:
1. `Circle`'s constructor calls `super()` → `Shape`'s constructor runs with `new.target === Circle`.
2. `new.target !== Shape` → allowed.
3. The base checks `this.area !== Shape.prototype.area` → Circle overrides it → OK.
4. `circle.describe()` (inherited) calls `this.area()` → Circle's version.
5. `new Shape()` → `new.target === Shape` → TypeError.
:::

::: code javascript Browser demo: abstract base class with runtime checks (runnable)
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError('Shape is abstract: create a Circle or Square');
    if (this.area === Shape.prototype.area) throw new TypeError(`${new.target.name} must implement area()`);
    this.name = name;
  }
  area() { throw new Error('not implemented'); }                       // "abstract" method
  describe() { return `${this.name} with area ${this.area().toFixed(2)}`; }   // template method
}
class Circle extends Shape {
  constructor(r) { super('Circle'); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}
class Square extends Shape {
  constructor(side) { super('Square'); this.side = side; }
  area() { return this.side ** 2; }
}
class Broken extends Shape { constructor() { super('Broken'); } }

console.log(new Circle(1).describe(), '|', new Square(3).describe());
const errors = [];
try { new Shape('x'); } catch (e) { errors.push(e.message); }
try { new Broken(); } catch (e) { errors.push(e.message); }
console.log(errors);
console.log('abstract class cannot be instantiated', errors[0].includes('abstract') ? '✅' : '❌ FAIL');
console.log('subclass must implement area()', errors[1] === 'Broken must implement area()' ? '✅' : '❌ FAIL');
console.log('template method uses the subclass step', new Square(3).describe() === 'Square with area 9.00' ? '✅' : '❌ FAIL');

// Prototype-based version
const ShapeProto = {
  area() { throw new Error('not implemented'); },
  describe() { return `${this.name}: ${this.area()}`; },
};
const square = Object.assign(Object.create(ShapeProto), { name: 'sq', side: 2, area() { return this.side ** 2; } });
console.log('prototype-based abstract object', square.describe() === 'sq: 4' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Checking `this.constructor === Shape` (works, but `new.target` is the intended tool and also works for `Reflect.construct`).
- Calling overridden methods in the base constructor that rely on subclass fields (they aren't initialized yet).
- Deep abstract hierarchies where composition would be simpler.
:::

::: understand
- No language support; simulate with `new.target` + throwing methods. TypeScript adds compile-time `abstract`.
:::

::: ask
- *"Do we need runtime enforcement or is TypeScript's compile-time check enough?"*
:::

::: important ⭐ Say this in the interview
"JavaScript has no abstract keyword, so I simulate it. In the base constructor I check new.target: if it equals the base class I throw, which prevents direct instantiation. Methods that subclasses must provide throw a 'not implemented' error in the base, and I can also verify in the constructor that the subclass overrode them. The base class holds shared logic as a template method that calls the subclass's implementation. In TypeScript the abstract keyword gives the same guarantees at compile time."
:::

::: links
MDN: new.target | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new.target
TypeScript: Abstract classes | https://www.typescriptlang.org/docs/handbook/2/classes.html#abstract-classes-and-members
:::

=== What are the rest and spread operators?
@p 3
@tags javascript, rest, spread, destructuring, es6
@quick
- Same `...` syntax, opposite jobs: **spread expands** an iterable/object into values; **rest collects** remaining values into an array/object.
- Spread: `fn(...args)`, `[...a, ...b]`, `{ ...obj, x: 1 }` (later keys win).
- Rest: `function f(...args)`, `const [first, ...others] = arr`, `const { id, ...rest } = obj`. Rest must be **last**.
- Both copies are **shallow**.
- Array spread needs an **iterable** (arrays, strings, Sets, Maps); object spread copies own enumerable properties (getters are invoked).

::: text 🧒 In simple words
**Spread** = opening a box of chocolates and **spilling them out** onto the table. **Rest** = **sweeping the leftover** chocolates on the table back into a box.
:::

::: text 📖 Detailed answer
### Spread (expands)
| Where | Example | Result |
|---|---|---|
| Function call | `Math.max(...[3, 9, 4])` | `9` |
| Array literal | `[...a, 4, ...b]` | merged array |
| Object literal | `{ ...defaults, ...options }` | merged object, later wins |
| Strings / Sets | `[...'hi']`, `[...new Set(arr)]` | `['h','i']`, deduplicated array |

### Rest (collects)
| Where | Example |
|---|---|
| Parameters | `function log(level, ...messages) {}` (real array, unlike `arguments`) |
| Array destructuring | `const [head, ...tail] = list` |
| Object destructuring | `const { password, ...safeUser } = user` (omit a key) |

### Shallow copies
`const copy = { ...user }` copies top-level properties; nested objects are shared. For React state you spread at each level you change: `{ ...state, user: { ...state.user, name } }`.

### Gotchas
- `{ ...null }` and `{ ...undefined }` are fine (`{}`), but `[...null]` throws (not iterable).
- Object spread ignores the prototype and non-enumerable properties (class instances lose their methods).
- Spreading huge arrays into function arguments can hit engine argument limits (`Math.max(...hugeArray)` → RangeError); use `reduce`.
:::

::: diagram Spread vs rest
flowchart LR
  A["[1, 2, 3]"] -->|"spread ...: expand"| V["1, 2, 3"]
  V -->|"rest ...: collect"| B["[1, 2, 3]"]
:::

::: image Rest vs spread
/images/javascript/rest-spread.svg
:::

::: text 🪜 Step by step
`const { password, ...safeUser } = { id: 1, name: 'Asha', password: 'x' }`:
1. Destructuring pulls `password` out into its own variable.
2. `...safeUser` (rest) **collects every remaining own property** into a new object.
3. `safeUser` = `{ id: 1, name: 'Asha' }`.
4. The original object is untouched.
5. Perfect for removing secrets before sending a user object to the client.
:::

::: code javascript Browser demo: spread and rest in practice (runnable)
// Spread
const nums = [3, 9, 4];
const merged = [...nums, ...[1, 2]];
const defaults = { theme: 'light', size: 'm' };
const settings = { ...defaults, theme: 'dark' };          // later keys win
const unique = [...new Set([1, 1, 2, 3, 3])];
console.log({ max: Math.max(...nums), merged, settings, unique, chars: [...'hey'] });
console.log('spread into a call', Math.max(...nums) === 9 ? '✅' : '❌ FAIL');
console.log('later keys win', settings.theme === 'dark' && settings.size === 'm' ? '✅' : '❌ FAIL');
console.log('dedupe with Set + spread', unique.join() === '1,2,3' ? '✅' : '❌ FAIL');

// Rest
function log(level, ...messages) { return `[${level}] ${messages.join(' ')}`; }
const [first, ...others] = [10, 20, 30];
const { password, ...safeUser } = { id: 1, name: 'Asha', password: 'secret' };
console.log(log('info', 'server', 'started'), first, others, safeUser);
console.log('rest params are a real array', log('a', 'b', 'c') === '[a] b c' ? '✅' : '❌ FAIL');
console.log('array rest', first === 10 && others.join() === '20,30' ? '✅' : '❌ FAIL');
console.log('object rest omits a key', !('password' in safeUser) && safeUser.name === 'Asha' && password === 'secret' ? '✅' : '❌ FAIL');

// Shallow!
const user = { name: 'Asha', address: { city: 'Delhi' } };
const copy = { ...user };
copy.address.city = 'Pune';
console.log('spread is shallow', user.address.city === 'Pune' ? '✅' : '❌ FAIL');
console.log('spreading null into an object is fine', Object.keys({ ...null }).length === 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Assuming spread makes a deep copy.
- Rest not in the last position (`const [...a, b] = arr` is a SyntaxError).
- Spreading class instances into plain objects and losing methods/getters.
- `Math.max(...hugeArray)` with hundreds of thousands of items.
:::

::: understand
- Position decides: in a value position `...` spreads, in a binding position it collects.
:::

::: ask
- *"Is the data nested?"* Then a spread alone won't isolate it.
:::

::: important ⭐ Say this in the interview
"Both use three dots, and the position decides. Spread expands an iterable or object into individual values: in function calls, array literals and object literals, where later keys override earlier ones. Rest does the opposite in parameters and destructuring: it collects the remaining values into an array or object, and must be last. Both produce shallow copies. I use spread for immutable updates and merging options, and rest for variadic functions and omitting fields like a password from an object."
:::

::: links
MDN: Spread syntax | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax
MDN: Rest parameters | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters
:::

=== What are generators and iterators?
@p 2
@tags javascript, generators, iterators, yield, es6
@quick
- An **iterator** is an object with `next()` returning `{ value, done }`. An **iterable** has a `[Symbol.iterator]()` method returning an iterator (arrays, strings, Maps, Sets). `for…of` and spread use it.
- A **generator** (`function*`) returns an iterator; `yield` **pauses** it and keeps local state; `next()` resumes it.
- `gen.next(value)` sends a value **into** the generator (the result of the paused `yield`); `gen.return()` stops; `gen.throw()` injects an error.
- Uses: **lazy / infinite** sequences, custom iteration, pagination, redux-saga, and async/await was built on the same idea (generator + promise runner).
- `async function*` + `for await…of` iterate async data (streams, paginated APIs).

::: text 🧒 In simple words
A normal function is like a **movie**: once it starts, it plays to the end. A generator is like a **TV series**: each `next()` plays **one episode** and pauses, remembering exactly where the story was until you press play again.
:::

::: text 📖 Detailed answer
### The iteration protocol
- **Iterator**: `{ next() { return { value, done } } }`.
- **Iterable**: has `[Symbol.iterator]()` that returns an iterator.
- Consumers: `for…of`, `[...x]`, `Array.from(x)`, destructuring, `Promise.all(x)`, `new Map(x)`.

### Generators
`function* range(start, end) { for (let i = start; i < end; i++) yield i; }`
- Calling `range(0, 3)` runs **nothing** yet; it returns a generator object (both iterator and iterable).
- Each `next()` runs until the next `yield`, returns `{ value, done: false }`, and pauses.
- When the function ends, `next()` returns `{ value: returnValue, done: true }`.

### Two-way communication
`const x = yield 1` → the caller's `next(42)` makes `x` equal 42. That's how async/await can be built: yield a promise, the runner waits for it and sends the result back with `next(result)`.

### Lazy evaluation
Generators compute values **on demand**, so infinite sequences (`function* naturals()`) and huge datasets are fine as long as the consumer stops (`take(5)`).

### yield*
Delegates to another iterable: `yield* [1, 2]`, `yield* otherGenerator()` (great for recursive tree traversal).
:::

::: diagram Generator lifecycle
stateDiagram-v2
  [*] --> SuspendedStart: "gen = idGen()"
  SuspendedStart --> Running: "next()"
  Running --> SuspendedYield: "yield value"
  SuspendedYield --> Running: "next(input)"
  Running --> Completed: "return or end"
  SuspendedYield --> Completed: "gen.return()"
  Completed --> [*]
:::

::: image Generators: functions that pause and resume
/images/javascript/generator.svg
:::

::: text 🪜 Step by step
`const gen = idGen(); gen.next(); gen.next(); gen.next(true);` with `const reset = yield id++`:
1. `idGen()` creates the generator; no code runs.
2. First `next()`: runs to `yield id++` → yields 1, pauses (`id` is now 2).
3. Second `next()`: the paused yield returns `undefined` → `reset` is falsy → loops → yields 2.
4. `next(true)`: the paused yield returns `true` → `reset` → `id = 1` → yields 1.
5. `gen.return(0)` → `{ value: 0, done: true }`; further `next()` calls return `done: true`.
:::

::: code javascript Browser demo: iterators, generators, lazy pipelines and a tiny async runner (runnable)
// 1) A custom iterable without generators
const countdown = {
  from: 3,
  [Symbol.iterator]() {
    let n = this.from;
    return { next: () => (n > 0 ? { value: n--, done: false } : { value: undefined, done: true }) };
  },
};
console.log('custom iterable', [...countdown].join() === '3,2,1' ? '✅' : '❌ FAIL');

// 2) Two-way generator
function* idGen() {
  let id = 1;
  while (true) {
    const reset = yield id++;
    if (reset) id = 1;
  }
}
const gen = idGen();
const seq = [gen.next().value, gen.next().value, gen.next(true).value, gen.return(0)];
console.log(seq);
console.log('yield pauses and next(value) resumes', seq[0] === 1 && seq[1] === 2 && seq[2] === 1 && seq[3].done === true ? '✅' : '❌ FAIL');

// 3) Lazy infinite pipeline
function* naturals() { let n = 1; while (true) yield n++; }
function* map(it, fn) { for (const x of it) yield fn(x); }
function* filter(it, fn) { for (const x of it) if (fn(x)) yield x; }
function* take(it, n) { if (n <= 0) return; for (const x of it) { yield x; if (--n === 0) return; } }
const firstSquaresOfEvens = [...take(map(filter(naturals(), (n) => n % 2 === 0), (n) => n * n), 4)];
console.log(firstSquaresOfEvens);
console.log('lazy evaluation over an infinite sequence', firstSquaresOfEvens.join() === '4,16,36,64' ? '✅' : '❌ FAIL');

// 4) yield* for recursion: flatten a tree
const tree = { v: 1, children: [{ v: 2, children: [{ v: 4, children: [] }] }, { v: 3, children: [] }] };
function* walk(node) { yield node.v; for (const c of node.children) yield* walk(c); }
console.log('yield* delegates (depth-first)', [...walk(tree)].join() === '1,2,4,3' ? '✅' : '❌ FAIL');

// 5) How async/await works: a generator + promise runner
function run(genFn) {
  return new Promise((resolve, reject) => {
    const it = genFn();
    const step = (method, arg) => {
      let r;
      try { r = it[method](arg); } catch (e) { return reject(e); }
      if (r.done) return resolve(r.value);
      Promise.resolve(r.value).then((v) => step('next', v), (e) => step('throw', e));
    };
    step('next');
  });
}
run(function* () {
  const a = yield Promise.resolve(20);
  const b = yield new Promise((res) => setTimeout(() => res(22), 5));
  return a + b;
}).then((sum) => console.log('generator runner behaves like async/await', sum === 42 ? '✅' : '❌ FAIL'));
:::

::: warning ⚠️ Common mistakes
- Expecting a generator function to run when called (it only creates the generator).
- Spreading an infinite generator (`[...naturals()]` never ends).
- Reusing an exhausted generator (create a new one each time).
- Forgetting the first `next()` can't send a value (nothing is paused yet).
:::

::: understand
- Iterable/iterator is the protocol; generators are the easy way to implement it, with pause/resume.
:::

::: ask
- *"Is the data large or unbounded?"* Lazy generators avoid building huge arrays.
:::

::: important ⭐ Say this in the interview
"An iterator is an object with a next method returning value and done; an iterable exposes one through Symbol.iterator, which is what for…of and spread use. A generator function returns such an iterator: each yield pauses the function and keeps its local state, and next resumes it, optionally sending a value back in. That makes lazy and infinite sequences easy, and it's the mechanism async/await was modelled on: a runner yields promises and resumes the generator with their results."
:::

::: links
MDN: Iteration protocols | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols
MDN: function* | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
:::

=== Map, Set, WeakMap and WeakSet: when to use which?
@p 3
@tags javascript, map, set, weakmap, collections
@quick
- **Map**: key-value pairs with **any** key type (objects too), insertion order, `.size`, fast frequent adds/deletes, no prototype key collisions.
- **Set**: unique values; `set.has(x)` is O(1). Measured: 10,000 lookups in 10,000 items → `array.includes` **10.5 ms**, `set.has` **0.2 ms**.
- **WeakMap / WeakSet**: keys must be **objects**, held **weakly** (don't prevent garbage collection), not iterable, no `.size`.
- Use WeakMap for **metadata/caches attached to objects** (DOM nodes, request objects) without leaking memory.
- Plain objects stay best for fixed-shape records and JSON.

::: text 🧒 In simple words
A **Map** is a **labelled locker room** where any item can be the label. A **Set** is a **guest list**: each name appears once and checking "is she invited?" is instant. A **WeakMap** is a **sticky note on someone else's object**: when the object is thrown away, the note disappears with it.
:::

::: text 📖 Detailed answer
| | Object | Map | Set | WeakMap / WeakSet |
|---|---|---|---|---|
| Keys | strings, symbols (numbers become strings) | any value | values only | **objects only** |
| Order | mostly insertion (integer keys first) | insertion | insertion | not iterable |
| Size | `Object.keys(o).length` | `.size` | `.size` | none |
| Iterate | `Object.entries` | `for…of`, `.forEach` | `for…of` | ❌ |
| Default keys | inherits from the prototype (`'toString' in {}`) | none | none | none |
| Keeps keys alive | yes | yes | yes | **no** |
| JSON | native | convert (`Object.fromEntries`) | `[...set]` | ❌ |

### Measured in Node 22 (Apple M3 Pro)
- 10,000 lookups: `array.includes` on 100 / 1,000 / 10,000 items → **0.9 / 1.4 / 10.5 ms**; `Set.has` → **0.4 / 0.1 / 0.2 ms** (constant).
- Adding then deleting 200,000 string keys: object **58 ms**, Map **39 ms**.

### Why WeakMap exists
`cache.set(domNode, data)` with a Map keeps every node alive forever, even after it's removed from the page. A WeakMap lets the garbage collector remove the entry together with the node. That's also why WeakMaps can't be iterated or sized: entries can vanish at any time.

### Related
- `WeakRef` and `FinalizationRegistry`: weak references to single objects (advanced, rarely needed).
- New Set methods (2024+): `union`, `intersection`, `difference`, `isSubsetOf`.
:::

::: diagram Choosing a collection
flowchart TD
  Q{"Need key → value?"} -->|"no, just unique values"| S{"Values are objects with their own lifetime?"}
  S -->|"yes"| WS["WeakSet"]
  S -->|"no"| SET["Set"]
  Q -->|"yes"| K{"Keys are objects that may be garbage-collected?"}
  K -->|"yes"| WM["WeakMap"]
  K -->|"no"| D{"Dynamic keys or frequent add/delete?"}
  D -->|"yes"| MAP["Map"]
  D -->|"no, fixed record or JSON"| OBJ["Object"]
:::

::: image Object vs Map vs Set vs WeakMap, with a measured lookup comparison
/images/javascript/map-set-weak.svg
:::

::: chart bar Measured: 10,000 lookups (ms) by collection size (Node 22, Apple M3 Pro)
Items,array.includes,Set.has
100,0.9,0.43
1000,1.39,0.12
10000,10.51,0.2
:::

::: text 🪜 Step by step
Caching computed data per DOM node with a WeakMap:
1. `const meta = new WeakMap()`.
2. `meta.set(node, { clicks: 0 })` when the node first appears.
3. On clicks: `meta.get(node).clicks++`.
4. The node is removed from the page and nothing else references it.
5. The garbage collector frees the node **and** its entry: no manual cleanup, no leak.
:::

::: code javascript Browser demo: Map, Set and WeakMap behaviours (runnable)
// Map: any key, ordered, sized
const objKey = { id: 1 };
const map = new Map([[objKey, 'object as key'], ['1', 'string one'], [1, 'number one']]);
console.log('Map keeps key types apart', map.get(1) === 'number one' && map.get('1') === 'string one' && map.get(objKey) === 'object as key' ? '✅' : '❌ FAIL');
const asObject = { 1: 'a' };
console.log('object keys become strings', Object.keys(asObject)[0] === '1' && typeof Object.keys(asObject)[0] === 'string' ? '✅' : '❌ FAIL');
console.log('Map has no inherited keys', !map.has('toString') && 'toString' in {} ? '✅' : '❌ FAIL');
console.log('Map ↔ object', JSON.stringify(Object.fromEntries(new Map([['a', 1]]))) === '{"a":1}' ? '✅' : '❌ FAIL');

// Word frequency with a Map
const words = 'the cat and the hat and the bat'.split(' ');
const freq = new Map();
for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
console.log([...freq], [...freq][0][1] === 3 ? '✅' : '❌ FAIL');

// Set: uniqueness and fast membership
const seen = new Set();
const firstDuplicate = [3, 1, 4, 1, 5].find((n) => (seen.has(n) ? true : (seen.add(n), false)));
console.log('first duplicate with a Set', firstDuplicate === 1 ? '✅' : '❌ FAIL');
const a = new Set([1, 2, 3]), b = new Set([2, 3, 4]);
const intersection = [...a].filter((x) => b.has(x));
console.log('intersection', intersection.join() === '2,3' ? '✅' : '❌ FAIL');

// Timing: includes vs has (numbers vary by machine)
const arr = Array.from({ length: 10000 }, (_, i) => i), set = new Set(arr);
let t = Date.now(), hits = 0;
for (let i = 0; i < 20000; i++) if (arr.includes(i)) hits++;
const arrMs = Date.now() - t;
t = Date.now();
for (let i = 0; i < 20000; i++) if (set.has(i)) hits++;
const setMs = Date.now() - t;
console.log(`20,000 lookups: array ${arrMs} ms, set ${setMs} ms`, setMs <= arrMs ? '✅' : '❌ FAIL');

// WeakMap: private data per object, keys must be objects
const privateData = new WeakMap();
class User { constructor(name) { privateData.set(this, { name, logins: 0 }); } login() { privateData.get(this).logins++; return privateData.get(this).logins; } }
const u = new User('Asha');
u.login();
console.log('WeakMap stores per-object data', u.login() === 2 && Object.keys(u).length === 0 ? '✅' : '❌ FAIL');
let weakErr = '';
try { new WeakMap().set('string key', 1); } catch (e) { weakErr = e.name; }
console.log('WeakMap keys must be objects', weakErr === 'TypeError' ? '✅' : '❌ FAIL');
console.log('WeakMap is not iterable and has no size', typeof privateData[Symbol.iterator] === 'undefined' && privateData.size === undefined ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using objects as dictionaries with user-provided keys (`__proto__`, `constructor` collisions).
- `map[key] = value` on a Map (sets a property, not an entry; use `.set`).
- Checking membership in big arrays inside loops (O(n²)); build a Set first.
- Expecting to list or count WeakMap entries.
- `JSON.stringify(map)` gives `{}`: convert first.
:::

::: understand
- Map/Set = proper collections; Weak versions = associate data with objects without owning them.
:::

::: ask
- *"Who owns the lifetime of these keys?"* If someone else (DOM, request), use a WeakMap.
:::

::: important ⭐ Say this in the interview
"A Map is a key-value collection where keys can be any type, including objects, with insertion order, a size property and no prototype keys, so it's better than an object for dynamic dictionaries. A Set stores unique values with constant-time has; in my measurement 10,000 lookups in 10,000 items took 10 milliseconds with array.includes and 0.2 with a Set. WeakMap and WeakSet only accept objects and hold them weakly, so entries disappear when the object is garbage-collected; that's ideal for metadata or caches attached to DOM nodes, and it's why they aren't iterable."
:::

::: links
MDN: Map | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
MDN: Set | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
MDN: WeakMap | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap
:::

=== What are the error types in JavaScript, and how do you handle errors?
@p 2
@tags javascript, errors, try-catch, exceptions
@quick
- Built-ins: **SyntaxError** (can't parse), **ReferenceError** (unknown name / TDZ), **TypeError** (wrong type: `null.x`, calling a non-function, assigning to `const`), **RangeError** (out of range, too much recursion), **URIError**, **EvalError**, **AggregateError** (several errors, e.g. `Promise.any`).
- `try { } catch (e) { } finally { }`: `finally` always runs (even after `return`).
- `throw` anything, but throw **Error objects** (they have `name`, `message`, `stack`, and `cause`: `new Error('msg', { cause: err })`).
- Custom errors: `class NotFoundError extends Error { name = 'NotFoundError' }`, then branch with `instanceof`.
- Async: `try/catch` around `await`, `.catch()` on promises; global safety nets: `window.onerror`, `unhandledrejection`.

::: text 🧒 In simple words
Errors are **alarm types** in a building: a fire alarm, a flood alarm, a break-in alarm. Each kind tells you **what** went wrong so the right person responds. `try/catch` is the security desk that listens for alarms in one area and decides what to do instead of letting the whole building shut down.
:::

::: text 📖 Detailed answer
| Type | When | Example |
|---|---|---|
| `SyntaxError` | parsing fails | `JSON.parse('{bad}')`, `eval('if (')` |
| `ReferenceError` | variable doesn't exist / TDZ | `notDeclared + 1` |
| `TypeError` | operation on the wrong type | `null.length`, `undefined()`, `const x = 1; x = 2` |
| `RangeError` | number out of allowed range | `new Array(-1)`, `(1).toFixed(200)`, infinite recursion |
| `URIError` | malformed URI | `decodeURIComponent('%')` |
| `AggregateError` | many errors together | `Promise.any` when all reject |

A SyntaxError in your **source file** stops the whole script before it runs, so it can't be caught by code in the same file; one from `JSON.parse`/`eval` happens at runtime and can be caught.

### Handling patterns
- **Catch where you can do something** (retry, fallback, user message); otherwise let it bubble.
- **Rethrow** unknown errors: `catch (e) { if (e instanceof ValidationError) … else throw e; }`.
- **Wrap with cause** to keep context: `throw new Error('Failed to load user', { cause: e })`.
- **finally** for cleanup (close spinners, release locks).
- **Async**: `await` inside `try`; every promise chain ends with `.catch`; React uses Error Boundaries for render errors.
:::

::: diagram How an error travels
flowchart TD
  T["throw new TypeError()"] --> C{"Inside a try block?"}
  C -->|"yes"| H["catch (e): handle, or rethrow"]
  H --> F["finally: always runs"]
  C -->|"no"| U["bubble up the call stack"]
  U --> G{"Caught higher up?"}
  G -->|"no"| GL["uncaught: window.onerror / process crash"]
  G -->|"yes"| H
:::

::: image Built-in error types
/images/javascript/error-types.svg
:::

::: text 🪜 Step by step
`function load() { try { return JSON.parse(text); } catch (e) { throw new ParseError('bad config', { cause: e }); } finally { done = true; } }`
1. `JSON.parse` throws a `SyntaxError`.
2. `catch` receives it as `e` and throws a **custom** `ParseError` with `cause: e`.
3. Before leaving the function, `finally` runs → `done = true`.
4. The caller catches `ParseError` and checks `err instanceof ParseError`.
5. `err.cause` still holds the original SyntaxError for logging.
:::

::: code javascript Browser demo: error types, custom errors, cause and finally (runnable)
const caught = {};
const attempt = (label, fn) => { try { fn(); } catch (e) { caught[label] = e.name; } };
attempt('syntax', () => JSON.parse('{bad}'));
attempt('reference', () => notDeclaredAnywhere + 1);       // eslint-disable-line no-undef
attempt('type', () => null.length);
attempt('range', () => new Array(-1));
attempt('uri', () => decodeURIComponent('%'));
console.log(caught);
console.log('error names', JSON.stringify(Object.values(caught)) === JSON.stringify(['SyntaxError', 'ReferenceError', 'TypeError', 'RangeError', 'URIError']) ? '✅' : '❌ FAIL');

class ValidationError extends Error {
  constructor(message, field, options) { super(message, options); this.name = 'ValidationError'; this.field = field; }
}
function parseAge(input) {
  const age = Number(input);
  if (!Number.isInteger(age) || age < 0) throw new ValidationError(`invalid age: ${input}`, 'age');
  return age;
}
let cleanup = 0;
function handle(input) {
  try { return parseAge(input); }
  catch (e) {
    if (e instanceof ValidationError) return `field ${e.field}: ${e.message}`;
    throw e;                                                // unknown errors bubble up
  } finally { cleanup++; }                                   // always runs, even after return
}
console.log(handle('31'), '|', handle('abc'));
console.log('custom error + instanceof', handle('abc') === 'field age: invalid age: abc' ? '✅' : '❌ FAIL');
console.log('finally always runs', cleanup === 3 ? '✅' : '❌ FAIL');

const wrapped = (() => { try { JSON.parse('{'); } catch (e) { return new Error('config failed', { cause: e }); } })();
console.log('error cause keeps context', wrapped.cause instanceof SyntaxError ? '✅' : '❌ FAIL');

Promise.any([Promise.reject(new Error('a')), Promise.reject(new Error('b'))])
  .catch((e) => console.log('AggregateError from Promise.any', e.name === 'AggregateError' && e.errors.length === 2 ? '✅' : '❌ FAIL'));

(async () => {
  try { await Promise.reject(new TypeError('async boom')); }
  catch (e) { console.log('try/catch works with await', e.message === 'async boom' ? '✅' : '❌ FAIL'); }
})();
:::

::: warning ⚠️ Common mistakes
- `throw 'message'` (strings have no stack trace).
- Empty `catch {}` blocks that swallow errors silently.
- Catching everything and continuing as if nothing happened.
- `try/catch` around code that **schedules** async work (`setTimeout`, un-awaited promises): it won't catch the later error.
- Forgetting `this.name` in custom error classes (logs show `Error`).
:::

::: understand
- Error type = what went wrong; handling = catch where you can act, rethrow otherwise, keep the cause.
:::

::: ask
- *"Should this error reach the user, be retried, or be logged and rethrown?"*
:::

::: important ⭐ Say this in the interview
"The built-in errors are SyntaxError for code that can't be parsed, ReferenceError for unknown names, TypeError for operations on the wrong type, RangeError for out-of-range values or too-deep recursion, URIError, and AggregateError for several errors together, like Promise.any. I handle errors where I can actually do something, rethrow the rest, always throw Error objects, use custom classes extending Error so I can branch with instanceof, and wrap lower-level errors with the cause option. For async code I use try/catch around await, and global handlers as a last safety net."
:::

::: links
MDN: Error | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
MDN: try...catch | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
MDN: Error cause | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
:::
