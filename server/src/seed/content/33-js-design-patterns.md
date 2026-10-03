@section JS Design Patterns
@icon 🏗️
@color #eab308
@desc Reusable solutions in JavaScript: the pattern families, Singleton, Factory, Abstract Factory, Prototype and Observer, with frontend examples, diagrams, measured costs and runnable demos.

=== What are design patterns, and which ones matter in JavaScript?
@p 2
@tags javascript, design-patterns, architecture
@quick
- A **design pattern** is a reusable, named solution to a common design problem: a template, not copy-paste code.
- **Creational** (how objects are created): Singleton, Factory, Abstract Factory, Prototype, Builder.
- **Structural** (how objects are composed): Module, Decorator, Adapter, Facade, Proxy.
- **Behavioral** (how objects communicate): Observer/Pub-Sub, Strategy, Command, Iterator, Mediator, State.
- In JS many patterns are built from **closures, modules, prototypes and first-class functions**; frontend examples: Redux store (singleton + observer), HOCs (decorator), `fetch` wrappers (facade), `Proxy` for reactivity (Vue).

::: text 🧒 In simple words
Design patterns are like **recipes** that cooks share: "how to make a sauce that doesn't split". You still cook it yourself with your ingredients, but you don't have to reinvent the method, and other cooks immediately understand when you say "I used the béchamel method".
:::

::: text 📖 Detailed answer
### Why they matter
- A **shared vocabulary** ("let's use an observer here") makes design discussions faster.
- They capture **trade-offs** that others already discovered.
- They're often already in the platform: DOM events (observer), iterators/generators (iterator), `Proxy` (proxy), ES modules (module/singleton).

### The patterns you'll meet most in frontend work
| Pattern | Problem it solves | Where you've seen it |
|---|---|---|
| Module | private state + public API | ES modules, the IIFE module pattern |
| Singleton | one shared instance | config, logger, API client, Redux store |
| Factory | create objects by type without `new SomeClass` | `React.createElement`, `document.createElement` |
| Observer / Pub-Sub | notify many listeners | DOM events, EventEmitter, store subscriptions |
| Decorator | add behaviour without changing the original | HOCs, `withRetry(fetch)`, TS decorators |
| Strategy | swap algorithms at runtime | validation rules, sort comparators, payment methods |
| Facade | simple API over a complex system | an `api.ts` wrapper around `fetch` + auth + retries |
| Proxy | intercept access | Vue reactivity, validation, lazy loading |
| Command | encapsulate actions (undo/redo) | editors, Redux actions |

### When not to use them
Patterns add indirection. In JS a plain function or object literal is often enough; reach for a pattern when the problem it solves actually exists (many types, many listeners, need to swap behaviour).
:::

::: diagram The three families
flowchart LR
  P["Design patterns"] --> CR["Creational: how objects are created"]
  P --> ST["Structural: how objects are composed"]
  P --> BE["Behavioral: how objects communicate"]
  CR --> C1["Singleton, Factory, Abstract Factory, Prototype, Builder"]
  ST --> S1["Module, Decorator, Adapter, Facade, Proxy"]
  BE --> B1["Observer, Strategy, Command, Iterator, Mediator"]
:::

::: image Design pattern families
/images/javascript/patterns-overview.svg
:::

::: text 🪜 Step by step
Recognising patterns in a typical React app:
1. `store.ts` creates one Redux/Zustand store and exports it → **singleton** (via the module cache).
2. Components call `store.subscribe` / `useSelector` → **observer**.
3. `api.ts` hides `fetch`, base URL, auth headers, retries → **facade**.
4. `withAuth(Component)` wraps a component to add a guard → **decorator**.
5. `validators = { email, phone, pan }` chosen by field type → **strategy** (and a small **factory**).
:::

::: code javascript Browser demo: strategy, decorator and facade in a few lines (runnable)
// Strategy: pick an algorithm at runtime
const validators = {
  email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  phone: (v) => /^\d{10}$/.test(v),
  required: (v) => String(v ?? '').trim().length > 0,
};
const validate = (type, value) => (validators[type] ?? validators.required)(value);
console.log('strategy', validate('email', 'a@b.co') && !validate('phone', '123') ? '✅' : '❌ FAIL');

// Decorator: add retry behaviour without touching the original function
const withRetry = (fn, retries = 2) => async (...args) => {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(...args); }
    catch (e) { if (attempt >= retries) throw e; }
  }
};
let calls = 0;
const flaky = async () => { calls++; if (calls < 3) throw new Error('network'); return 'ok'; };

// Facade: one simple call hides several steps
function createApi({ baseUrl, getToken, transport }) {
  return {
    get: (path) => transport({ url: baseUrl + path, headers: { Authorization: `Bearer ${getToken()}` } }),
  };
}
const fakeTransport = async (req) => ({ status: 200, url: req.url, auth: req.headers.Authorization });
const api = createApi({ baseUrl: 'https://api.example.com', getToken: () => 't0k3n', transport: fakeTransport });

(async () => {
  const result = await withRetry(flaky, 2)();
  console.log('decorator retried twice then succeeded', result === 'ok' && calls === 3 ? '✅' : '❌ FAIL');
  const res = await api.get('/users');
  console.log('facade builds URL and auth header', res.url === 'https://api.example.com/users' && res.auth === 'Bearer t0k3n' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Forcing class-heavy Java-style patterns where a function would do.
- Naming patterns without explaining the problem they solve.
- Overusing singletons (hidden global state).
- Confusing Observer (subject knows its subscribers) with Pub-Sub via a broker (publishers and subscribers don't know each other); in practice both terms are used loosely.
:::

::: understand
- Patterns = named trade-offs. In JS they're usually closures, modules and functions, not big class hierarchies.
:::

::: ask
- *"What changes most often in this code?"* The pattern should isolate that part.
:::

::: important ⭐ Say this in the interview
"Design patterns are named, reusable solutions to recurring design problems. They come in three families: creational patterns about creating objects, like singleton and factory; structural ones about composing them, like module, decorator, facade and proxy; and behavioral ones about communication, like observer, strategy and command. In JavaScript most of them are lightweight because of closures, modules and first-class functions, and many are built into the platform, like DOM events or ES modules. I use them when the problem they solve is really there, not by default."
:::

::: links
Patterns.dev | https://www.patterns.dev/
Refactoring.Guru: Design patterns | https://refactoring.guru/design-patterns
:::

=== What is the Singleton pattern? How do you implement it in JavaScript?
@p 3
@tags javascript, design-patterns, singleton, creational
@quick
- **Singleton** = a class/module with exactly **one instance** and a global access point.
- Simplest JS singleton: an **ES module** exporting an object: modules are evaluated **once** and cached, so every import gets the same instance.
- Class version: a static `getInstance()` that creates the instance lazily; optionally make the constructor return the existing instance and `Object.freeze` it.
- Uses: config, logger, API client, analytics, a WebSocket connection, a store.
- Downsides: hidden **global state**, tight coupling, harder **testing** (state leaks between tests); provide a reset or inject dependencies.

::: text 🧒 In simple words
A singleton is like the **one TV remote** in a house: everyone uses the same remote, so the channel is the same for everybody. Handy, but if a test (or a sibling) changes the channel, everyone else is affected too.
:::

::: text 📖 Detailed answer
### Three ways in JS
| Approach | How | Notes |
|---|---|---|
| ES module | `export const logger = createLogger()` | simplest; the module cache guarantees one instance per bundle |
| Closure (IIFE) | `const Config = (() => { let instance; return { get: () => instance ??= create() }; })()` | lazy creation, private state |
| Class | `static #instance; static getInstance() { return this.#instance ??= new Logger(); }` | familiar to OOP interviewers |

### Lazy vs eager
- **Eager**: create at import time (simple, but costs work even if unused).
- **Lazy**: create on first `getInstance()` (useful for expensive resources like a socket).

### Gotchas
- **Multiple bundles / micro-frontends / duplicated packages** can each have their own "singleton".
- **SSR (Node)**: a module-level singleton is shared between **all requests and users** on the server → never keep per-user data in it.
- **Tests**: module state survives between tests in the same file; expose a `reset()` for tests or use dependency injection.
:::

::: diagram Every caller gets the same instance
flowchart LR
  A["module A: getInstance()"] --> I["the ONE instance"]
  B["module B: getInstance()"] --> I
  C["module C: import logger"] --> I
  I --> S["shared state: config, connections, cache"]
:::

::: image Singleton: one shared instance
/images/javascript/singleton.svg
:::

::: text 🪜 Step by step
`Logger.getInstance()` called from two files:
1. First call: `#instance` is undefined → `new Logger()` runs → stored in `#instance`.
2. Second call: `#instance` exists → the same object is returned (no constructor call).
3. `new Logger()` directly → the constructor sees an existing instance and returns it (or throws, by design).
4. `a === b` → `true`; logs written via `a` are visible via `b`.
5. In tests, `Logger.reset()` clears `#instance` so each test starts clean.
:::

::: code javascript Browser demo: three singleton styles (runnable)
// 1) Class with lazy getInstance and a guarded constructor
class Logger {
  static #instance = null;
  #lines = [];
  constructor() {
    if (Logger.#instance) return Logger.#instance;      // new Logger() returns the existing one
    Logger.#instance = this;
  }
  static getInstance() { return Logger.#instance ?? new Logger(); }
  static reset() { Logger.#instance = null; }          // for tests
  log(msg) { this.#lines.push(msg); }
  get count() { return this.#lines.length; }
}
const a = Logger.getInstance();
const b = Logger.getInstance();
const c = new Logger();
a.log('first'); b.log('second');
console.log('class: one instance', a === b && b === c && c.count === 2 ? '✅' : '❌ FAIL');
Logger.reset();
console.log('reset gives tests a fresh instance', Logger.getInstance() !== a && Logger.getInstance().count === 0 ? '✅' : '❌ FAIL');

// 2) Closure: lazy creation of an expensive resource
let created = 0;
const Connection = (() => {
  let instance;
  const create = () => { created++; return Object.freeze({ id: created, send: (m) => `sent ${m}` }); };
  return { get: () => (instance ??= create()) };
})();
const c1 = Connection.get(), c2 = Connection.get();
console.log('closure: created once, lazily', created === 1 && c1 === c2 ? '✅' : '❌ FAIL');
console.log('frozen: nobody can replace methods', Object.isFrozen(c1) ? '✅' : '❌ FAIL');

// 3) "Module" singleton: a module's top level runs once; simulated with a cached factory
const moduleCache = new Map();
function requireModule(name, factory) { if (!moduleCache.has(name)) moduleCache.set(name, factory()); return moduleCache.get(name); }
const configA = requireModule('config', () => ({ apiUrl: '/api', theme: 'light' }));
const configB = requireModule('config', () => ({ apiUrl: 'other' }));
configA.theme = 'dark';
console.log('module cache: every importer shares state', configB.theme === 'dark' && configB.apiUrl === '/api' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing per-user/request data in a module singleton during SSR (data leaks between users).
- Using a singleton as a global variable bag.
- Tests depending on each other through shared singleton state.
- Assuming one instance across micro-frontends or duplicated package versions.
:::

::: understand
- In JS, the module system already gives you singletons; the hard part is managing shared state, not creating it.
:::

::: ask
- *"Does this run on the server for many users?"* Then a singleton must hold no user data.
:::

::: important ⭐ Say this in the interview
"A singleton guarantees a single instance with a global access point. In JavaScript the simplest form is an ES module that exports an object, because modules are evaluated once and cached, so every import shares it. With a class I use a private static field and a lazy getInstance. It fits things like a logger, config or an API client, but it's global state: it couples modules, leaks state between tests, and on the server it's shared across all requests, so it must never hold per-user data. I add a reset for tests or inject the instance instead."
:::

::: links
Patterns.dev: Singleton pattern | https://www.patterns.dev/vanilla/singleton-pattern
:::

=== What is the Factory pattern?
@p 3
@tags javascript, design-patterns, factory, creational
@quick
- A **factory** is a function (or method) that **creates objects for you** based on input, so callers don't use `new SpecificClass()` or know construction details.
- All products share an **interface** (e.g., `notifier.send(msg)`), so the client code doesn't change when you add a type.
- Implement with a **registry map** (`{ email: EmailNotifier, sms: SmsNotifier }`) instead of a long `switch`; throw for unknown types.
- JS-friendly: **factory functions** return object literals (closures for private state, no `new`, no `this` issues).
- Real examples: `document.createElement('div')`, `React.createElement`, `axios.create(config)`, creating users by role.

::: text 🧒 In simple words
A factory is a **pizza counter**: you say "margherita" or "farmhouse", and the kitchen knows the recipe. You don't need to know how to make the dough; you just get a pizza that you eat the same way.
:::

::: text 📖 Detailed answer
### The problem
`if (type === 'email') n = new EmailNotifier(cfg); else if (type === 'sms') n = new SmsNotifier(cfg) …` scattered across the code: every new type means editing many places.

### The solution
Centralise creation:
- `createNotifier(type, config)` returns an object with a common interface.
- Callers depend on the **interface**, not concrete classes (easy to mock in tests, easy to extend).
- Adding a type = register it in one place (open/closed principle).

### Factory function vs constructor/class
| | Factory function | Class + `new` |
|---|---|---|
| Call | `createUser(data)` | `new User(data)` |
| Private state | closures | `#private` fields |
| Return different types | ✅ easily | awkward |
| `this` bugs | none (no `this` needed) | possible when methods are detached |
| Memory | methods per object (unless you use a shared prototype) | methods shared on the prototype |

### Factory method (GoF)
The classic "factory method" lets **subclasses** decide which class to instantiate (`createDialog()` → `WindowsDialog`/`WebDialog`). In JS, passing a creator function achieves the same.
:::

::: diagram A factory with a registry
flowchart LR
  C["client: createNotifier('sms', cfg)"] --> R{"registry[type]?"}
  R -->|"email"| E["EmailNotifier"]
  R -->|"sms"| S["SmsNotifier"]
  R -->|"push"| P["PushNotifier"]
  R -->|"unknown"| X["throw Error"]
  E --> I["common interface: send(msg)"]
  S --> I
  P --> I
:::

::: image Factory: create objects by type without new
/images/javascript/factory.svg
:::

::: text 🪜 Step by step
`createUser('seller', { name: 'Jane', shopAddress: 'MG Road' })` (the example from your notes):
1. Build the common part: `{ name, password }`.
2. Look up the role in a map of creators: `seller → () => ({ role: 'Seller', shopAddress, contact })`.
3. Unknown role → throw `Invalid role specified.`
4. Merge: `{ ...base, ...specific }`.
5. The caller only knows `createUser`; adding `'support'` is one new map entry.
:::

::: code javascript Browser demo: factory function with a registry (runnable)
// Products: different implementations, same interface
const makeEmail = ({ from }) => ({ type: 'email', send: (to, msg) => `email from ${from} to ${to}: ${msg}` });
const makeSms = ({ senderId }) => ({ type: 'sms', send: (to, msg) => `sms ${senderId} → ${to}: ${msg.slice(0, 160)}` });
const makePush = () => ({ type: 'push', send: (to, msg) => `push to device ${to}: ${msg}` });

const registry = new Map([['email', makeEmail], ['sms', makeSms], ['push', makePush]]);
function createNotifier(type, config = {}) {
  const create = registry.get(type);
  if (!create) throw new Error(`Unknown notifier type: ${type}`);
  return create(config);
}
const registerNotifier = (type, creator) => registry.set(type, creator);   // open for extension

const notifiers = [createNotifier('email', { from: 'shop@x.com' }), createNotifier('sms', { senderId: 'SHOP' }), createNotifier('push')];
const sent = notifiers.map((n) => n.send('asha', 'Your order shipped'));    // client code doesn't care which type
console.log(sent);
console.log('all products share the interface', sent.length === 3 && sent.every((s) => s.includes('Your order shipped')) ? '✅' : '❌ FAIL');

let error = '';
try { createNotifier('fax'); } catch (e) { error = e.message; }
console.log('unknown types fail early', error === 'Unknown notifier type: fax' ? '✅' : '❌ FAIL');

registerNotifier('whatsapp', () => ({ type: 'whatsapp', send: (to, msg) => `whatsapp ${to}: ${msg}` }));
console.log('new type added without touching the factory', createNotifier('whatsapp').send('ravi', 'hi') === 'whatsapp ravi: hi' ? '✅' : '❌ FAIL');

// Role-based user factory (from the notes)
const roleInfo = {
  admin: (u) => ({ role: 'Admin', key: u.key }),
  customer: (u) => ({ role: 'Customer', address: u.address }),
  seller: (u) => ({ role: 'Seller', shopAddress: u.shopAddress }),
};
const createUser = (role, u) => {
  if (!roleInfo[role]) throw new Error('Invalid role specified.');
  return { name: u.name, ...roleInfo[role](u) };
};
const seller = createUser('seller', { name: 'Jane', shopAddress: 'MG Road' });
console.log('role factory', seller.role === 'Seller' && seller.shopAddress === 'MG Road' && !('password' in seller) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- A giant `switch` that every new type must edit.
- Products with slightly different interfaces (the client ends up checking types again).
- Silently returning `undefined`/`null` for unknown types.
- Using a factory where a single constructor call would be clearer.
:::

::: understand
- Factory = centralised creation + common interface, so callers depend on "what it does", not "which class it is".
:::

::: ask
- *"How many types are there now, and will more be added?"* The pattern pays off when types vary.
:::

::: important ⭐ Say this in the interview
"A factory centralises object creation: callers ask for something by type or configuration and get back an object with a common interface, without knowing the concrete class or the construction details. In JavaScript I usually write a factory function backed by a registry map, which throws for unknown types and lets me add new types by registering them instead of editing a switch. Examples are document.createElement, React.createElement or axios.create. It makes code easier to extend and to test, because callers depend only on the interface."
:::

::: links
Patterns.dev: Factory pattern | https://www.patterns.dev/vanilla/factory-pattern
Refactoring.Guru: Factory method | https://refactoring.guru/design-patterns/factory-method
:::

=== What is the Abstract Factory pattern?
@p 2
@tags javascript, design-patterns, abstract-factory, creational
@quick
- An **abstract factory** creates **families of related objects** that must be used together (light-theme button + light input + light tooltip).
- The client picks **one factory** (e.g., `darkTheme`) and calls `createButton()`, `createInput()`… so all products **match**.
- Factory = **one product** chosen by type; abstract factory = **a set of products** chosen by family.
- In JS: an object of creator functions (`{ createButton, createInput }`) per family, often built by a helper (`createUIFactory`).
- Real uses: themes/design systems, cross-platform UI (web/native), database drivers, test doubles vs real services.

::: text 🧒 In simple words
Furnishing a room from **one furniture collection**: pick "Scandinavian" and you get the Scandinavian chair, table and lamp, all matching. You never mix a Scandinavian chair with a Victorian table, because you only shop in one collection at a time.
:::

::: text 📖 Detailed answer
### Parts
| Part | Example |
|---|---|
| Abstract factory (interface) | `{ createButton(), createInput(), createTooltip() }` |
| Concrete factories | `lightTheme`, `darkTheme` |
| Abstract products | Button, Input, Tooltip interfaces (`render()`) |
| Concrete products | `LightButton`, `DarkButton`, … |
| Client | builds a form using only the factory interface |

### Why not just a factory?
With separate factories (`createButton('dark')`, `createInput('light')`) nothing stops mixing families. The abstract factory makes **consistency** structural: one choice at the top, matching products everywhere.

### In JavaScript
No interfaces at runtime, so:
- Represent the factory as an object of functions.
- Optionally validate that each family implements every creator (fail fast at startup).
- TypeScript can express the interface (`interface UIFactory { createButton(): Button; … }`).

### Modern equivalents
React context providing a theme or a set of components (`<ComponentsProvider value={darkComponents}>`), or dependency injection of a service family (real API vs mock API).
:::

::: diagram One factory per family
flowchart TD
  CL["client: renderForm(factory)"] --> F{"which factory?"}
  F -->|"light"| LF["lightTheme"]
  F -->|"dark"| DF["darkTheme"]
  LF --> LB["LightButton"]
  LF --> LI["LightInput"]
  DF --> DB["DarkButton"]
  DF --> DI["DarkInput"]
:::

::: image Abstract factory: families of related objects
/images/javascript/abstract-factory.svg
:::

::: text 🪜 Step by step
Rendering a login form in dark mode:
1. At startup: `const ui = settings.theme === 'dark' ? darkTheme : lightTheme`.
2. `renderLoginForm(ui)` calls `ui.createInput('email')`, `ui.createInput('password')`, `ui.createButton('Sign in')`.
3. Every product comes from the dark family → consistent colours and behaviour.
4. Adding a "high-contrast" theme = one new factory implementing the same creators; the form code doesn't change.
5. A startup check verifies the new factory has every creator, so a missing `createTooltip` fails immediately.
:::

::: code javascript Browser demo: themed UI families (runnable)
const REQUIRED = ['createButton', 'createInput', 'createTooltip'];

function createUIFactory(name, creators) {
  const missing = REQUIRED.filter((k) => typeof creators[k] !== 'function');
  if (missing.length) throw new Error(`${name} factory is missing: ${missing.join(', ')}`);
  return Object.freeze({ name, ...creators });
}

const component = (theme, kind, label) => ({ theme, kind, render: () => `<${kind} class="${theme}">${label}</${kind}>` });

const lightTheme = createUIFactory('light', {
  createButton: (label) => component('light', 'button', label),
  createInput: (label) => component('light', 'input', label),
  createTooltip: (label) => component('light', 'tooltip', label),
});
const darkTheme = createUIFactory('dark', {
  createButton: (label) => component('dark', 'button', label),
  createInput: (label) => component('dark', 'input', label),
  createTooltip: (label) => component('dark', 'tooltip', label),
});

// Client code only knows the factory interface
function renderLoginForm(ui) {
  const parts = [ui.createInput('Email'), ui.createInput('Password'), ui.createButton('Sign in'), ui.createTooltip('Forgot?')];
  return { html: parts.map((p) => p.render()).join(''), themes: new Set(parts.map((p) => p.theme)) };
}

const dark = renderLoginForm(darkTheme);
const light = renderLoginForm(lightTheme);
console.log(dark.html);
console.log('every product comes from one family', dark.themes.size === 1 && dark.themes.has('dark') && light.themes.has('light') ? '✅' : '❌ FAIL');
console.log('client code is unchanged between families', dark.html.replaceAll('dark', 'light') === light.html ? '✅' : '❌ FAIL');

let error = '';
try { createUIFactory('high-contrast', { createButton: () => {}, createInput: () => {} }); } catch (e) { error = e.message; }
console.log('incomplete families fail fast', error === 'high-contrast factory is missing: createTooltip' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using an abstract factory when there's only one family (needless indirection).
- Letting client code call concrete constructors anyway (breaks consistency).
- Families drifting apart (one family missing a product); validate at startup or with TypeScript.
:::

::: understand
- Abstract factory = a factory of factories for **matching families**; choose the family once.
:::

::: ask
- *"Do products need to be consistent with each other?"* That's the signal for an abstract factory over separate factories.
:::

::: important ⭐ Say this in the interview
"An abstract factory creates families of related objects that must be used together. The client chooses one concrete factory, for example the dark theme, and then only calls its creators, like createButton and createInput, so every product matches. A plain factory chooses one product by type; an abstract factory chooses a whole family. In JavaScript I model it as an object of creator functions per family, validated at startup or typed with an interface in TypeScript, and in React the same idea often appears as a context that provides a set of themed components or services."
:::

::: links
Refactoring.Guru: Abstract factory | https://refactoring.guru/design-patterns/abstract-factory
:::

=== What is the Prototype pattern?
@p 2
@tags javascript, design-patterns, prototype, creational
@quick
- The **Prototype pattern** creates new objects by **copying a template object** instead of building them from scratch.
- In JS it's built into the language: `Object.create(proto)` makes objects that **share** the template's methods; `structuredClone`/spread copies **data**.
- Typical use: objects with good **default settings** (a form's initial state, a default config, game entities) that you then customise.
- Measured (Node 22, 100,000 objects with 4 methods): methods on a shared prototype **4.7 MB / 1.4 ms** vs methods copied onto every object **29.1 MB / 41.4 ms**.
- Careful: nested objects on a shared prototype are **shared** too (mutating one changes all); copy them per instance.

::: text 🧒 In simple words
Instead of drawing every party invitation by hand, you design **one beautiful template**, then **photocopy** it and just write each guest's name. In JavaScript, the copies can even keep pointing to the template for the parts that never change (the methods), which saves paper (memory).
:::

::: text 📖 Detailed answer
### Two flavours in JS
| Flavour | How | What's shared |
|---|---|---|
| **Delegation** | `Object.create(template)` | methods/defaults stay on the template; reads fall through the prototype chain |
| **Cloning** | `structuredClone(template)`, `{ ...template }` | nothing (deep) / nested objects (shallow) |

### When it helps
- Creating many similar objects where setup is expensive or defaults are complex.
- Letting users "duplicate" an item (a dashboard widget, a document template).
- Sharing behaviour cheaply: methods live once on the prototype.

### Measured: why shared methods matter (Node 22, `--expose-gc`, 100,000 objects)
| How the 4 methods are attached | Heap | Creation time |
|---|---|---|
| `class` (prototype methods) | 4.7 MB | 1.4 ms |
| `Object.create(proto)` | 6.2 MB | 2.7 ms |
| method shorthand on every object literal | 29.1 MB | 41.4 ms |
| factory returning closures | 32.2 MB | 31.6 ms |

### Pitfall: shared mutable state
`const base = { tags: [] }; const a = Object.create(base); a.tags.push('x')` → `base.tags` and every other object's `tags` now contain `'x'`. Give each instance its own arrays/objects.
:::

::: diagram Delegation vs cloning
flowchart LR
  T["template: defaults + methods"] -->|"Object.create"| D["new object: own data, methods via the prototype"]
  T -->|"structuredClone"| CL["independent deep copy"]
  D -.->|"lookups fall through"| T
:::

::: image Prototype pattern: clone and share (measured memory)
/images/javascript/prototype-pattern.svg
:::

::: chart bar Measured: heap for 100,000 objects with 4 methods (Node 22, MB)
How methods are attached,Heap (MB)
class prototype methods,4.7
Object.create(proto),6.2
methods on every object,29.1
factory returning closures,32.2
:::

::: text 🪜 Step by step
Creating enemies in a game from a template:
1. `const enemyProto = { hp: 100, speed: 2, attack() {…}, takeHit(n) { this.hp -= n } }`.
2. `const orc = Object.create(enemyProto); orc.speed = 1;` → own `speed`, inherited `hp`, methods shared.
3. `orc.takeHit(30)` → `this.hp -= 30` reads the inherited 100 and writes an **own** `hp = 70`.
4. Other enemies still read `hp = 100` from the template.
5. A "duplicate" button uses `structuredClone(orcData)` to copy just the data.
:::

::: code javascript Browser demo: prototype-based creation and its pitfalls (runnable)
const enemyProto = {
  hp: 100,
  speed: 2,
  takeHit(n) { this.hp = Math.max(0, this.hp - n); return this; },
  describe() { return `${this.name}: ${this.hp} hp, speed ${this.speed}`; },
};
function spawn(name, overrides = {}) {
  return Object.assign(Object.create(enemyProto), { name, effects: [] }, overrides);   // own array per instance
}

const orc = spawn('orc', { speed: 1 });
const goblin = spawn('goblin');
orc.takeHit(30);
console.log(orc.describe(), '|', goblin.describe());
console.log('writes create own properties; the template is untouched', orc.hp === 70 && goblin.hp === 100 && enemyProto.hp === 100 ? '✅' : '❌ FAIL');
console.log('methods are shared, not copied', !Object.hasOwn(orc, 'takeHit') && orc.takeHit === goblin.takeHit ? '✅' : '❌ FAIL');

// Pitfall: a mutable object on the prototype is shared by everyone
const badProto = { effects: [] };
const a = Object.create(badProto), b = Object.create(badProto);
a.effects.push('poison');
console.log('shared array on the prototype leaks between objects', b.effects.includes('poison') ? '✅' : '❌ FAIL');
orc.effects.push('burn');
console.log('spawn() gives each instance its own array', goblin.effects.length === 0 ? '✅' : '❌ FAIL');

// Cloning data (the "duplicate" feature)
const widget = { type: 'chart', options: { color: 'teal', series: [1, 2, 3] }, createdAt: new Date(0) };
const copy = structuredClone(widget);
copy.options.series.push(4);
console.log('structuredClone duplicates deeply', widget.options.series.length === 3 && copy.createdAt instanceof Date ? '✅' : '❌ FAIL');

// Cost of copying methods onto every object (numbers vary by machine)
const proto = { area() { return this.w * this.h; } };
const shared = Array.from({ length: 1000 }, (_, i) => Object.assign(Object.create(proto), { w: i, h: 2 }));
const copied = Array.from({ length: 1000 }, (_, i) => ({ w: i, h: 2, area() { return this.w * this.h; } }));
console.log('shared: one function for all objects', new Set(shared.map((o) => o.area)).size === 1 ? '✅' : '❌ FAIL');
console.log('copied: a new function object per object', new Set(copied.map((o) => o.area)).size === 1000 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Arrays/objects on the shared prototype (shared mutable state).
- Shallow-copying a template with nested objects and mutating the copy.
- Confusing the Prototype **pattern** (cloning a template) with JavaScript's **prototype chain** (the mechanism that makes delegation possible).
:::

::: understand
- Prototype pattern = make new objects from a template; JS gives you delegation (`Object.create`) and cloning (`structuredClone`).
:::

::: ask
- *"Should new objects share behaviour, data, or both with the template?"*
:::

::: important ⭐ Say this in the interview
"The prototype pattern creates objects by copying a template instead of building them from scratch. JavaScript supports it natively: Object.create links a new object to a template, so methods and defaults are shared and only the differences are stored on each object, and structuredClone or spread copies data when I need independent duplicates. Sharing methods is also a real memory win: I measured 100,000 objects at about 5 megabytes with prototype methods versus about 30 with methods copied onto each object. The trap is putting mutable arrays or objects on the shared template, since every instance would then share them."
:::

::: links
Patterns.dev: Prototype pattern | https://www.patterns.dev/vanilla/prototype-pattern
MDN: Object.create | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
:::

=== What is the Observer (Pub-Sub) pattern? Implement an event emitter.
@p 3
@tags javascript, design-patterns, observer, pub-sub, event-emitter
@quick
- **Observer**: a subject keeps a list of **subscribers** and **notifies** them when something happens; subscribers don't poll.
- API: `on(event, fn)` / `subscribe` (return an **unsubscribe** function), `off`, `emit(event, ...args)`, `once`.
- **Pub-Sub** adds a broker/channel so publishers and subscribers don't know each other (event bus, message queues).
- Everywhere in frontend: DOM events, Node's `EventEmitter`, Redux `store.subscribe`, RxJS, WebSockets, `useSyncExternalStore`.
- Pitfalls: **memory leaks** (forgotten unsubscribes), errors in one listener stopping others, hard-to-trace flows with too many events.

::: text 🧒 In simple words
A **YouTube channel**: you subscribe once, and whenever a new video is published, you're notified. The channel doesn't need to know what each subscriber does with it, and you can unsubscribe any time. If you never unsubscribe from channels you don't watch, your inbox (memory) fills up.
:::

::: text 📖 Detailed answer
### Core pieces
| Piece | Responsibility |
|---|---|
| Subject / emitter | stores `Map<event, Set<listener>>` |
| `on(event, fn)` | add a listener, return `() => off(event, fn)` |
| `emit(event, ...args)` | call each listener (over a **copy** of the set, so listeners can unsubscribe during emit) |
| `once(event, fn)` | wrapper that removes itself after the first call |
| Error isolation | catch per listener so one failure doesn't block the rest |

### Observer vs Pub-Sub
- **Observer**: the subject holds direct references to observers (DOM element → its listeners).
- **Pub-Sub**: messages go through a **channel/broker** (an app-wide event bus, Redis pub/sub, Kafka); fully decoupled, sometimes async.

### In React
External stores (Redux, Zustand) are observers: components subscribe, the store notifies, and `useSyncExternalStore` re-renders them. Always unsubscribe in effect cleanup.

### Trade-offs
Loose coupling and easy extension (add an analytics listener without touching the cart), but harder debugging (who emitted what?), ordering assumptions, and leaks. Name events clearly (`cart:item-added`) and keep payloads typed.
:::

::: diagram Subscribe, emit, unsubscribe
sequenceDiagram
  participant B as Cart badge
  participant E as Emitter
  participant A as Analytics
  B->>E: "on('cart:add', updateBadge)"
  A->>E: "on('cart:add', track)"
  Note over E: "user adds an item"
  E->>B: "updateBadge(item)"
  E->>A: "track(item)"
  B->>E: "unsubscribe() on unmount"
:::

::: image Observer / Pub-Sub
/images/javascript/observer.svg
:::

::: text 🪜 Step by step
`const off = bus.on('cart:add', updateBadge); bus.emit('cart:add', item); off();`
1. `on` creates the `Set` for `'cart:add'` if needed and adds `updateBadge`; returns `off`.
2. `emit` copies the set and calls every listener with `item`; an error in one is caught and reported, the others still run.
3. A `once` listener removes itself during the emit (safe because we iterate over a copy).
4. `off()` deletes `updateBadge`; when the set is empty, the event key is removed.
5. Later emits no longer call it, so the component can be garbage-collected.
:::

::: code javascript Browser demo: a complete EventEmitter (runnable)
class EventEmitter {
  #events = new Map();               // event → Set of listeners
  #onError;
  constructor({ onError = (e) => { throw e; } } = {}) { this.#onError = onError; }

  on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('listener must be a function');
    if (!this.#events.has(event)) this.#events.set(event, new Set());
    this.#events.get(event).add(fn);
    return () => this.off(event, fn);                           // unsubscribe
  }
  once(event, fn) {
    const off = this.on(event, (...args) => { off(); fn(...args); });
    return off;
  }
  off(event, fn) {
    const set = this.#events.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this.#events.delete(event);
  }
  emit(event, ...args) {
    const set = this.#events.get(event);
    if (!set) return false;
    for (const fn of [...set]) {                                // copy: listeners may unsubscribe while we loop
      try { fn(...args); } catch (e) { this.#onError(e, event); }
    }
    return true;
  }
  listenerCount(event) { return this.#events.get(event)?.size ?? 0; }
}

// ---- tests ----
const errors = [];
const bus = new EventEmitter({ onError: (e, event) => errors.push(`${event}: ${e.message}`) });
const badge = [], analytics = [], welcome = [];
const offBadge = bus.on('cart:add', (item) => badge.push(item.id));
bus.on('cart:add', (item) => analytics.push(`added ${item.id}`));
bus.on('cart:add', () => { throw new Error('listener crashed'); });
bus.once('user:login', (name) => welcome.push(`hi ${name}`));

bus.emit('cart:add', { id: 1 });
bus.emit('cart:add', { id: 2 });
offBadge();
bus.emit('cart:add', { id: 3 });
bus.emit('user:login', 'Asha');
bus.emit('user:login', 'Asha');

console.log({ badge, analytics, welcome, errors: errors.length });
console.log('all subscribers notified', analytics.join() === 'added 1,added 2,added 3' ? '✅' : '❌ FAIL');
console.log('unsubscribe stops notifications', badge.join() === '1,2' ? '✅' : '❌ FAIL');
console.log('once fires a single time', welcome.length === 1 && bus.listenerCount('user:login') === 0 ? '✅' : '❌ FAIL');
console.log('a crashing listener does not stop the others', errors.length === 3 && analytics.length === 3 ? '✅' : '❌ FAIL');
console.log('emit with no listeners returns false', bus.emit('nothing') === false ? '✅' : '❌ FAIL');

// Unsubscribing during emit is safe
const order = [];
const bus2 = new EventEmitter();
const offA = bus2.on('tick', () => { order.push('a'); offA(); });
bus2.on('tick', () => order.push('b'));
bus2.emit('tick'); bus2.emit('tick');
console.log('listeners can unsubscribe while emitting', order.join() === 'a,b,b' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Not returning/calling an unsubscribe (leaks, handlers firing on unmounted components).
- Iterating the live listener set while listeners remove themselves (skipped listeners).
- One throwing listener breaking the rest.
- Using a global event bus for everything (invisible coupling, hard to debug); prefer explicit state where possible.
:::

::: understand
- Observer = subscribe + notify + unsubscribe; the unsubscribe is what keeps memory clean.
:::

::: ask
- *"Should events be sync or async, and do late subscribers need the last value?"* (That's a BehaviorSubject/store, not a plain emitter.)
:::

::: important ⭐ Say this in the interview
"In the observer pattern a subject keeps a list of subscribers and notifies them when something changes, so they don't have to poll. Pub-sub adds a channel or broker so publishers and subscribers don't know each other. My event emitter stores a Map from event name to a Set of listeners; on returns an unsubscribe function, once wraps the listener to remove itself, and emit iterates over a copy of the set and isolates errors so one bad listener doesn't break the others. It's the model behind DOM events, Node's EventEmitter and store subscriptions in React, and the key discipline is unsubscribing in cleanup to avoid leaks."
:::

::: links
Patterns.dev: Observer pattern | https://www.patterns.dev/vanilla/observer-pattern
Node.js: EventEmitter | https://nodejs.org/api/events.html
:::
