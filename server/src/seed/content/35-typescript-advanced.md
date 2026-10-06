@section TypeScript Advanced & React
@icon 🧬
@color #3b82f6
@desc After the fundamentals: generics, utility types, keyof/typeof/mapped types, conditional types and infer, typing React components, satisfies vs as, and structural typing. Every example is compiled with tsc --strict.

=== What are generics, and when do you use them?
@p 3
@tags typescript, generics
@quick
- A **generic** is a **type parameter**: `function first<T>(items: T[]): T | undefined`. `T` is decided per call (usually inferred).
- Generics keep the **link between input and output** types; `any` loses it.
- **Constraints**: `<T extends { id: string }>` requires a shape; `<K extends keyof T>` limits to T's keys.
- **Defaults**: `<T = unknown>`. Generic types: `type ApiResponse<T> = { data: T; error?: string }`.
- Everywhere in practice: `Array<T>`, `Promise<T>`, `useState<T>`, `Map<K, V>`, API clients, reusable components.

::: text 🧒 In simple words
A generic is a **lunchbox with a label slot**. The box works for any food, and when you put in a sandwich, the label says "sandwich", so whoever opens it knows exactly what they'll get. `any` is a box with **no label**: you have no idea what's inside.
:::

::: text 📖 Detailed answer
### Why not any?
`function first(items: any[]): any` accepts everything, but `first([1, 2])` returns `any`, so `.toUpperCase()` on a number compiles. With `first<T>(items: T[]): T | undefined`, `first([1, 2])` returns `number | undefined`.

### The pieces
| Syntax | Meaning |
|---|---|
| `function f<T>(x: T): T` | generic function, `T` inferred from `x` |
| `f<string>('a')` | explicit type argument (rarely needed) |
| `<T extends Base>` | constraint: `T` must have Base's members |
| `<K extends keyof T>` | `K` must be a key of `T` |
| `<T = string>` | default type argument |
| `interface Box<T> { value: T }` | generic interface/type |
| `class Store<T> { items: T[] = [] }` | generic class |

### Typical real uses
- Typed fetch helper: `async function getJson<T>(url: string): Promise<T>` (combine with validation!).
- Reusable components: `<Select<T> options={…} getLabel={…} />`.
- Utilities: `groupBy<T, K extends PropertyKey>(items: T[], key: (t: T) => K): Record<K, T[]>`.
- Repository/service layers: `Repository<User>`.

### Rule of thumb
A type parameter should appear **at least twice** (connect two things). If `T` is used once, you probably don't need a generic.
:::

::: diagram How T is inferred at each call
flowchart LR
  D["first<T>(items: T[]): T | undefined"] --> C1["first([1, 2, 3])"]
  D --> C2["first(['a', 'b'])"]
  C1 -->|"T = number"| R1["number | undefined"]
  C2 -->|"T = string"| R2["string | undefined"]
:::

::: image Generics: types as parameters
/images/typescript/generics.svg
:::

::: text 🪜 Step by step
`getProp(user, 'email')` with `function getProp<T, K extends keyof T>(obj: T, key: K): T[K]`:
1. From `user`, TS infers `T = User`.
2. `keyof User` = `'id' | 'name' | 'email'`; `'email'` fits the constraint, so `K = 'email'`.
3. Return type `T[K]` = `User['email']` = `string`.
4. `getProp(user, 'mail')` → error: not assignable to `keyof User`.
5. The editor autocompletes the key argument from `keyof T`.
:::

::: code typescript Generic functions, constraints, defaults and generic types
function first<T>(items: T[]): T | undefined { return items[0]; }
const n = first([1, 2, 3]);          // number | undefined
const s = first(['a', 'b']);         // string | undefined

function getProp<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
const user = { id: 1, name: 'Asha', email: 'asha@x.com' };
const email = getProp(user, 'email');   // string
// @ts-expect-error: 'mail' is not a key of user
getProp(user, 'mail');

function byId<T extends { id: number }>(items: T[]): Map<number, T> {
  return new Map(items.map((i) => [i.id, i]));
}
byId([{ id: 1, title: 'x' }]);       // Map<number, { id: number; title: string }>
// @ts-expect-error: items need an id
byId([{ title: 'x' }]);

function groupBy<T, K extends PropertyKey>(items: T[], keyOf: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) (out[keyOf(item)] ??= []).push(item);
  return out;
}
const byRole = groupBy([{ name: 'a', role: 'admin' as const }, { name: 'b', role: 'user' as const }], (u) => u.role);
byRole.admin;                         // { name: string; role: 'admin' | 'user' }[]

type ApiResponse<T = unknown> = { data: T; error?: string };
async function getJson<T>(url: string): Promise<ApiResponse<T>> {
  const res = await fetch(url);
  return { data: (await res.json()) as T };   // validate in real code!
}

class Store<T> {
  private items: T[] = [];
  add(item: T) { this.items.push(item); return this; }
  all(): readonly T[] { return this.items; }
}
const store = new Store<string>().add('x');
console.log(n, s, email, byRole, getJson, store.all());
:::

::: code javascript The same groupBy at run time (runnable)
function groupBy(items, keyOf) {
  const out = {};
  for (const item of items) (out[keyOf(item)] ??= []).push(item);
  return out;
}
const users = [{ name: 'Asha', role: 'admin' }, { name: 'Ravi', role: 'user' }, { name: 'Mira', role: 'user' }];
const byRole = groupBy(users, (u) => u.role);
console.log(byRole);
console.log('grouped by the key function', byRole.user.length === 2 && byRole.admin[0].name === 'Asha' ? '✅' : '❌ FAIL');
console.log('works for any item type', groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even')).even.join() === '2,4' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `any` where a generic would keep the types connected.
- Generic parameters used only once (no benefit).
- `getJson<T>()` treated as validation: it's a cast, the data isn't checked.
- Over-constraining (`T extends object` everywhere) or too many type parameters.
:::

::: understand
- Generics = functions over types; they preserve information that `any` throws away.
:::

::: ask
- *"Does the output type depend on the input type?"* That's when a generic helps.
:::

::: important ⭐ Say this in the interview
"Generics are type parameters. A function like first<T> takes an array of T and returns T or undefined, and T is inferred at each call, so the relation between input and output types is preserved, which any would lose. Constraints like T extends an object with an id, or K extends keyof T, restrict what's allowed, and defaults make parameters optional. I use them for reusable utilities, typed API helpers, generic components and data stores, and I remember that a generic fetch helper is only a cast, so the data still needs validating."
:::

::: links
Handbook: Generics | https://www.typescriptlang.org/docs/handbook/2/generics.html
:::

=== Which utility types do you use, and how would you implement them?
@p 3
@tags typescript, utility-types, partial, pick, omit
@quick
- `Partial<T>` / `Required<T>` / `Readonly<T>`: change every property's optionality or mutability.
- `Pick<T, K>` keeps keys, `Omit<T, K>` removes keys, `Record<K, V>` builds an object type from keys.
- `ReturnType<F>`, `Parameters<F>`, `Awaited<T>`, `NonNullable<T>`, `Exclude`/`Extract` for unions.
- They're built from **mapped** and **conditional** types: `type MyPartial<T> = { [K in keyof T]?: T[K] }`.
- Real uses: `Partial<User>` for PATCH bodies, `Omit<User, 'id'>` for create payloads, `ReturnType<typeof useAuth>` for hook results.

::: text 🧒 In simple words
Utility types are **stamps for forms**: "make every field optional" (Partial), "only keep name and email" (Pick), "remove the ID box" (Omit). Instead of drawing a new form each time, you stamp the existing one.
:::

::: text 📖 Detailed answer
| Utility | Result for `User = { id: number; name: string; email: string; age?: number }` | Typical use |
|---|---|---|
| `Partial<User>` | every field optional | update/PATCH payloads, form drafts |
| `Required<User>` | `age` required too | after applying defaults |
| `Readonly<User>` | fields can't be reassigned | state, config |
| `Pick<User, 'id' \| 'name'>` | `{ id; name }` | list rows, DTOs |
| `Omit<User, 'id'>` | everything except `id` | create payloads |
| `Record<'admin' \| 'user', string[]>` | `{ admin: string[]; user: string[] }` | lookup tables, maps |
| `ReturnType<typeof fn>` | what `fn` returns | derive types from code |
| `Parameters<typeof fn>` | tuple of `fn`'s params | wrappers, decorators |
| `Awaited<Promise<User>>` | `User` | async results |
| `NonNullable<T>` | removes `null`/`undefined` | after checks |
| `Exclude<'a' \| 'b', 'a'>` / `Extract` | `'b'` / `'a'` | filtering unions |

### How they're built
- `Partial<T>` = `{ [K in keyof T]?: T[K] }` (mapped type adds `?`).
- `Required<T>` = `{ [K in keyof T]-?: T[K] }` (`-?` removes optionality).
- `Pick<T, K extends keyof T>` = `{ [P in K]: T[P] }`.
- `Omit<T, K>` = `Pick<T, Exclude<keyof T, K>>`.
- `ReturnType<F>` = `F extends (...args: any[]) => infer R ? R : never` (conditional type + infer).

Interviewers often ask you to **implement one**: knowing mapped and conditional types answers all of them.
:::

::: diagram Deriving types instead of duplicating them
flowchart TD
  U["User (one source of truth)"] --> P["Partial<User>: PATCH body"]
  U --> O["Omit<User, 'id'>: create body"]
  U --> K["Pick<User, 'id' | 'name'>: list row"]
  U --> R["Readonly<User>: state"]
:::

::: image Built-in utility types
/images/typescript/utility-types.svg
:::

::: text 🪜 Step by step
How `Omit<User, 'id'>` is computed:
1. `keyof User` = `'id' | 'name' | 'email' | 'age'`.
2. `Exclude<…, 'id'>` removes `'id'` → `'name' | 'email' | 'age'`.
3. `Pick<User, that union>` maps over those keys: `{ name: string; email: string; age?: number }`.
4. Optional modifiers are preserved because `Pick` is a homomorphic mapped type.
5. Changing `User` updates every derived type automatically.
:::

::: code typescript Using and re-implementing utility types
interface User { id: number; name: string; email: string; age?: number }

type UserPatch = Partial<User>;
type NewUser = Omit<User, 'id'>;
type UserRow = Pick<User, 'id' | 'name'>;
type Permissions = Record<'admin' | 'user', string[]>;

function updateUser(id: number, patch: UserPatch) { return { id, ...patch }; }
updateUser(1, { name: 'Ravi' });
const create: NewUser = { name: 'Mira', email: 'm@x.com' };
// @ts-expect-error: id is not part of NewUser
const bad: NewUser = { id: 1, name: 'x', email: 'y' };
const perms: Permissions = { admin: ['*'], user: ['read'] };

// Implementations
type MyPartial<T> = { [K in keyof T]?: T[K] };
type MyRequired<T> = { [K in keyof T]-?: T[K] };
type MyReadonly<T> = { readonly [K in keyof T]: T[K] };
type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
type MyExclude<T, U> = T extends U ? never : T;
type MyOmit<T, K extends PropertyKey> = MyPick<T, MyExclude<keyof T, K>>;
type MyRecord<K extends PropertyKey, V> = { [P in K]: V };
type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;
type MyAwaited<T> = T extends PromiseLike<infer V> ? MyAwaited<V> : T;

const p: MyPartial<User> = {};
const r: MyRequired<User> = { id: 1, name: 'a', email: 'b', age: 3 };
const o: MyOmit<User, 'id'> = create;
const rec: MyRecord<'a' | 'b', number> = { a: 1, b: 2 };
function makeUser() { return { id: 1, roles: ['admin'] }; }
type Made = MyReturnType<typeof makeUser>;      // { id: number; roles: string[] }
const m: Made = makeUser();
type Unwrapped = MyAwaited<Promise<Promise<number>>>;   // number
const u: Unwrapped = 5;
const ro: MyReadonly<UserRow> = { id: 1, name: 'x' };
// @ts-expect-error: readonly
ro.name = 'y';
console.log(perms, bad, p, r, o, rec, m, u);
:::

::: warning ⚠️ Common mistakes
- Copy-pasting interfaces instead of deriving (`Omit`, `Pick`), so they drift apart.
- `Omit` with a typo in the key (it accepts any string): prefer a strict version `K extends keyof T` when that matters.
- `Partial` everywhere, making required data optional by accident.
- Forgetting `Awaited` when using `ReturnType` on async functions (you get `Promise<…>`).
:::

::: understand
- One source of truth, many derived shapes; utilities are just mapped + conditional types.
:::

::: ask
- *"Can this type be derived from an existing one?"*
:::

::: important ⭐ Say this in the interview
"I use utility types to derive shapes from one source of truth: Partial for patch bodies, Omit to drop the id from create payloads, Pick for list rows, Record for lookup tables, and ReturnType, Parameters and Awaited to derive types from existing functions. They're built from mapped types, for example Partial is a mapped type that adds the optional modifier to every key of T, and from conditional types with infer, like ReturnType. Omit itself is Pick of T with the excluded keys."
:::

::: links
Handbook: Utility types | https://www.typescriptlang.org/docs/handbook/utility-types.html
:::

=== keyof, typeof, indexed access and mapped types
@p 2
@tags typescript, keyof, typeof, mapped-types
@quick
- **`typeof value`** (in a type position) turns a **value into a type**: `type Config = typeof config`.
- **`keyof T`** gives the **union of keys**: `keyof { id: number; name: string }` = `'id' | 'name'`.
- **Indexed access** `T[K]`: the type of a property, e.g. `User['email']`, `(typeof arr)[number]`.
- **Mapped types** loop over keys: `{ [K in keyof T]: … }`, with `?`/`readonly` modifiers (`-?` removes) and **key remapping** `as`.
- Template literal types build string types: `` `on${Capitalize<K>}` ``.

::: text 🧒 In simple words
`typeof` **photocopies** a real object into a blueprint. `keyof` reads the **list of field names** from a blueprint. `T[K]` asks "what goes in **this** field?". A mapped type is a **loop** that builds a new blueprint by walking through every field.
:::

::: text 📖 Detailed answer
| Operator | Input | Output |
|---|---|---|
| `typeof config` | a value | its type |
| `keyof User` | a type | `'id' \| 'name' \| …` |
| `User['name']` | a type + key | `string` |
| `User[keyof User]` | | union of all value types |
| `Arr[number]` | array/tuple type | element type |
| `{ [K in Keys]: V }` | union of keys | object type |
| `{ [K in keyof T as NewKey]: … }` | | renamed/filtered keys |

### Where it pays off
- Config objects: write the object once, `type Config = typeof defaultConfig`.
- Event maps: `type Events = { click: MouseEvent; key: KeyboardEvent }` + `on<K extends keyof Events>(name: K, cb: (e: Events[K]) => void)`.
- Form helpers: `type Errors<T> = { [K in keyof T]?: string }`.
- Getters: `{ [K in keyof T as \`get${Capitalize<string & K>}\`]: () => T[K] }`.

### Filtering keys
Remap a key to `never` to drop it: `{ [K in keyof T as T[K] extends Function ? never : K]: T[K] }` keeps only data fields.
:::

::: diagram Value to type to keys to new type
flowchart LR
  V["const config = { port: 3000, debug: false }"] -->|"typeof"| T["{ port: number, debug: boolean }"]
  T -->|"keyof"| K["'port' | 'debug'"]
  K -->|"[K in ...]"| M["{ port?: string, debug?: string } (form errors)"]
:::

::: image typeof, keyof, indexed access and mapped types
/images/typescript/keyof-mapped.svg
:::

::: text 🪜 Step by step
A typed event emitter: `on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void)`:
1. `Events = { login: { userId: string }; logout: undefined }`.
2. `keyof Events` = `'login' | 'logout'`, so only those names are accepted.
3. Calling `on('login', p => p.userId)`: `K = 'login'`.
4. `Events['login']` = `{ userId: string }` → `p` is typed.
5. `on('signup', …)` → compile error; typo-proof events.
:::

::: code typescript typeof, keyof, T[K], mapped types and key remapping
const defaultConfig = { port: 3000, debug: false, host: 'localhost' };
type Config = typeof defaultConfig;                    // { port: number; debug: boolean; host: string }
type ConfigKey = keyof Config;                         // 'port' | 'debug' | 'host'
type Port = Config['port'];                            // number

const ROUTES = ['/', '/about', '/blog'] as const;
type Route = (typeof ROUTES)[number];                  // '/' | '/about' | '/blog'

type FormErrors<T> = { [K in keyof T]?: string };
const errors: FormErrors<Config> = { port: 'must be > 1024' };

type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
type ConfigGetters = Getters<Config>;                  // { getPort: () => number; getDebug: ...; getHost: ... }
const g: ConfigGetters = { getPort: () => 1, getDebug: () => true, getHost: () => 'h' };

type DataOnly<T> = { [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K] };
class Model { id = 1; name = 'x'; save() { return true; } }
const data: DataOnly<Model> = { id: 1, name: 'y' };   // save() removed

type Events = { login: { userId: string }; logout: undefined };
function on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) { return { event, cb }; }
on('login', (p) => p.userId);
// @ts-expect-error: 'signup' is not an event
on('signup', () => {});

function setOption<K extends ConfigKey>(key: K, value: Config[K]): Config { return { ...defaultConfig, [key]: value }; }
setOption('port', 8080);
// @ts-expect-error: port must be a number
setOption('port', '8080');
const r: Route = '/blog'; const p: Port = 1;
console.log(errors, g, data, r, p);
:::

::: warning ⚠️ Common mistakes
- Confusing JS `typeof x === 'string'` (runtime) with TS `typeof x` in a type position.
- `keyof` on objects with index signatures (`string | number`).
- `Object.keys(obj)` returns `string[]`, not `(keyof T)[]` (objects can have extra keys at run time).
- Overusing complex mapped types where a plain interface is clearer.
:::

::: understand
- These operators let types follow your values and each other, so changes propagate automatically.
:::

::: ask
- *"Should the type follow the value (typeof) or the value follow the type?"*
:::

::: important ⭐ Say this in the interview
"typeof in a type position turns a value into its type, keyof gives the union of an object type's keys, and indexed access like User['email'] or an array type indexed by number gives a property or element type. Mapped types loop over keys to build new types, with optional and readonly modifiers and key remapping through as, which is how Partial or getter types are built. I use them for typed config objects, typed event maps and form error types that stay in sync with the data."
:::

::: links
Handbook: keyof | https://www.typescriptlang.org/docs/handbook/2/keyof-types.html
Handbook: Mapped types | https://www.typescriptlang.org/docs/handbook/2/mapped-types.html
Handbook: Template literal types | https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html
:::

=== What are conditional types and infer?
@p 2
@tags typescript, conditional-types, infer
@quick
- `T extends U ? X : Y`: a type-level **if/else**.
- **`infer`** captures part of a type: `T extends Promise<infer V> ? V : T` unwraps a promise.
- **Distributive**: with a naked `T`, unions are processed member by member (`Exclude`, `NonNullable`); wrap in `[T]` to stop it.
- Built-ins made this way: `Exclude`, `Extract`, `NonNullable`, `ReturnType`, `Parameters`, `Awaited`.
- Mostly for library/utility code; in app code prefer simple types.

::: text 🧒 In simple words
A conditional type is a **sorting machine**: "if the parcel is a box of apples, label it 'fruit', otherwise 'other'". `infer` is the machine **opening the box and noting what's inside**, like "this promise contains a User".
:::

::: text 📖 Detailed answer
### Shapes
| Pattern | Meaning |
|---|---|
| `T extends string ? 'text' : 'other'` | branch on assignability |
| `T extends (infer E)[] ? E : T` | element type of an array |
| `T extends Promise<infer V> ? V : T` | unwrap a promise |
| `T extends (...a: infer A) => infer R ? [A, R] : never` | params and return |
| `` T extends `${infer Head}/${infer Rest}` ? … `` | parse string literal types |
| `[T] extends [never] ? … : …` | non-distributive check |

### Distribution
`type ToArray<T> = T extends unknown ? T[] : never`; `ToArray<string | number>` = `string[] | number[]` (each member separately). `type ToArrayND<T> = [T] extends [unknown] ? T[] : never` gives `(string | number)[]`.

### Real example: typed route params
`` type Params<S> = S extends `${string}:${infer P}/${infer Rest}` ? P | Params<`/${Rest}`> : S extends `${string}:${infer P}` ? P : never ``
`Params<'/users/:id/posts/:postId'>` = `'id' | 'postId'`. This is how typed routers (TanStack Router, Next.js typed routes) work.
:::

::: diagram Evaluating a conditional type over a union
flowchart TD
  T["NonNullable<string | null | undefined>"] --> D["distribute over each member"]
  D --> A["string extends null | undefined ? never : string → string"]
  D --> B["null → never"]
  D --> C["undefined → never"]
  A --> R["result: string"]
  B --> R
  C --> R
:::

::: image Conditional types and infer
/images/typescript/conditional-types.svg
:::

::: text 🪜 Step by step
`Params<'/users/:id/posts/:postId'>`:
1. Matches `` `${string}:${infer P}/${infer Rest}` `` with `P = 'id'`, `Rest = 'posts/:postId'`.
2. Result so far: `'id' | Params<'/posts/:postId'>`.
3. The recursive call matches the second branch (no more `/`): `P = 'postId'`.
4. Union: `'id' | 'postId'`.
5. A function `navigate(path, params: Record<Params<typeof path>, string>)` now requires exactly those keys.
:::

::: code typescript Conditional types, infer, distribution and typed route params
type IsString<T> = T extends string ? true : false;
const a: IsString<'x'> = true;
const b: IsString<42> = false;

type ElementType<T> = T extends readonly (infer E)[] ? E : T;
const e: ElementType<number[]> = 1;

type UnwrapPromise<T> = T extends Promise<infer V> ? UnwrapPromise<V> : T;
const v: UnwrapPromise<Promise<Promise<string>>> = 'ok';

type ToArray<T> = T extends unknown ? T[] : never;          // distributive
type ToArrayAll<T> = [T] extends [unknown] ? T[] : never;   // not distributive
const d1: ToArray<string | number> = ['a'];                 // string[] | number[]
const d2: ToArrayAll<string | number> = ['a', 1];           // (string | number)[]
// @ts-expect-error: a mixed array is not string[] | number[]
const d3: ToArray<string | number> = ['a', 1];

type Params<S extends string> =
  S extends `${string}:${infer P}/${infer Rest}` ? P | Params<`/${Rest}`>
  : S extends `${string}:${infer P}` ? P
  : never;

function buildPath<S extends string>(pattern: S, params: Record<Params<S>, string>): string {
  return pattern.replace(/:(\w+)/g, (_, k: string) => (params as Record<string, string>)[k] ?? '');
}
buildPath('/users/:id/posts/:postId', { id: '7', postId: '42' });
// @ts-expect-error: postId is missing
buildPath('/users/:id/posts/:postId', { id: '7' });
console.log(a, b, e, v, d1, d2, d3);
:::

::: code javascript The runtime half of typed routes (runnable)
// The types guarantee the right keys; this function does the actual replacement.
const buildPath = (pattern, params) => pattern.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k] ?? ''));
const path = buildPath('/users/:id/posts/:postId', { id: '7', postId: 'a b' });
console.log(path);
console.log('params replaced and encoded', path === '/users/7/posts/a%20b' ? '✅' : '❌ FAIL');
const keys = [...'/users/:id/posts/:postId'.matchAll(/:(\w+)/g)].map((m) => m[1]);
console.log('the keys the type extracts', keys.join() === 'id,postId' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Not realising conditional types distribute over unions.
- Deeply recursive types that slow the editor or hit "type instantiation is excessively deep".
- Using conditional types in app code where overloads or plain unions are clearer.
:::

::: understand
- Conditional types are type-level `if`; `infer` is pattern matching; together they build most utility types.
:::

::: ask
- *"Is this for a reusable library type or app code?"* Complexity is worth it mainly in libraries.
:::

::: important ⭐ Say this in the interview
"A conditional type is a type-level if: T extends U ? X : Y. With infer I can capture part of a type, like the element type of an array, the value inside a promise or a function's return type, which is exactly how ReturnType and Awaited are built. When T is a naked type parameter the condition distributes over unions, which is how Exclude and NonNullable work, and wrapping it in a tuple disables that. Combined with template literal types they can even parse route strings into typed parameters."
:::

::: links
Handbook: Conditional types | https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
:::

=== How do you type React components with TypeScript?
@p 3
@tags typescript, react, props, hooks, events
@quick
- Props: `type ButtonProps = { variant?: 'primary' | 'ghost' } & React.ComponentPropsWithoutRef<'button'>`; then `function Button({ variant = 'primary', ...rest }: ButtonProps)`.
- `children: React.ReactNode`; avoid `React.FC` for new code (optional; just type the props).
- Hooks: `useState<User | null>(null)`, `useRef<HTMLInputElement>(null)`, `useReducer` with a **discriminated union** of actions.
- Events: `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`, `React.MouseEvent<HTMLButtonElement>`.
- Generic components `function List<T>(props: ListProps<T>)`; React 19: `ref` is a normal prop (no `forwardRef`).

::: text 🧒 In simple words
Typing a component is writing the **instructions printed on the box**: what you can plug in (props), what it can contain (children), and what signals it sends (events). The editor then refuses wrong plugs before you even run the app.
:::

::: text 📖 Detailed answer
### Props
| Need | Type |
|---|---|
| Own props | `type CardProps = { title: string; onClose?: () => void }` |
| Extend a native element | `& React.ComponentPropsWithoutRef<'button'>` (all button attributes) |
| Children | `children: React.ReactNode` (or `PropsWithChildren<P>`) |
| Variants | literal unions `'sm' \| 'md' \| 'lg'` |
| Either/or props | discriminated union: `{ as: 'link'; href: string } \| { as: 'button'; onClick: () => void }` |
| Styles | `React.CSSProperties` |

### Hooks
- `useState(0)` infers `number`; give a type when the initial value is narrower: `useState<User | null>(null)`.
- `useRef<HTMLInputElement>(null)` → `ref.current` is `HTMLInputElement | null`; check before using.
- `useReducer(reducer, initial)` infers from the reducer: type actions as a discriminated union.
- Context: `createContext<AuthContext | null>(null)` + a custom hook that throws if missing.

### Events
`onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}`; inline handlers infer the type automatically.

### Generic components
`function Select<T>({ options, getLabel, onChange }: { options: T[]; getLabel: (o: T) => string; onChange: (o: T) => void })`: `onChange` receives the exact option type.

### React 19
`ref` is a regular prop for function components: `function Input({ ref, ...props }: React.ComponentProps<'input'>)`; `forwardRef` is no longer needed.
:::

::: diagram Where types flow in a component
flowchart LR
  P["ButtonProps (own + native button props)"] --> C["function Button(props)"]
  C --> S["useState<T> and useRef<HTMLElement>"]
  C --> E["event handlers: React.MouseEvent<HTMLButtonElement>"]
  C --> J["JSX: TS checks every prop you pass"]
:::

::: image Typing React components
/images/typescript/react-ts.svg
:::

::: text 🪜 Step by step
Building a typed `<Select>` for users:
1. `function Select<T>(props: { options: T[]; getLabel(o: T): string; onChange(o: T): void })`.
2. `<Select options={users} getLabel={(u) => u.name} onChange={(u) => setUser(u)} />`.
3. From `options={users}`, TS infers `T = User`.
4. `u` in both callbacks is `User`, so `u.email` autocompletes and `u.mail` errors.
5. Reused with `options={countries}`, `T` becomes `Country`. One component, fully typed.
:::

::: code tsx Typed components, hooks, events, context and a generic component
import { createContext, useContext, useReducer, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

type ButtonProps = { variant?: 'primary' | 'ghost'; loading?: boolean } & ComponentPropsWithoutRef<'button'>;
export function Button({ variant = 'primary', loading = false, children, ...rest }: ButtonProps) {
  return <button className={`btn btn-${variant}`} disabled={loading || rest.disabled} {...rest}>{loading ? 'Saving…' : children}</button>;
}

type SelectProps<T> = { options: T[]; getLabel: (o: T) => string; onChange: (o: T) => void };
export function Select<T>({ options, getLabel, onChange }: SelectProps<T>) {
  return (
    <select onChange={(e) => onChange(options[Number(e.target.value)]!)}>
      {options.map((o, i) => <option key={i} value={i}>{getLabel(o)}</option>)}
    </select>
  );
}

type User = { id: number; name: string; email: string };
type Action = { type: 'add'; user: User } | { type: 'remove'; id: number };
function usersReducer(state: User[], action: Action): User[] {
  switch (action.type) {
    case 'add': return [...state, action.user];
    case 'remove': return state.filter((u) => u.id !== action.id);
  }
}

type Auth = { user: User | null; login: (u: User) => void };
const AuthContext = createContext<Auth | null>(null);
export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  return <AuthContext.Provider value={{ user, login: setUser }}>{children}</AuthContext.Provider>;
}

// React 19: ref is a normal prop
export function TextInput({ ref, ...props }: React.ComponentProps<'input'>) {
  return <input ref={ref} {...props} />;
}

export function UserForm() {
  const [users, dispatch] = useReducer(usersReducer, []);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch({ type: 'add', user: { id: Date.now(), name, email: `${name}@x.com` } });
    inputRef.current?.focus();
  };
  return (
    <form onSubmit={onSubmit}>
      <TextInput ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit">Add</Button>
      <Select options={users} getLabel={(u) => u.email} onChange={(u) => dispatch({ type: 'remove', id: u.id })} />
      {/* @ts-expect-error: 'large' is not a valid variant */}
      <Button variant="large">Oops</Button>
    </form>
  );
}
:::

::: warning ⚠️ Common mistakes
- `useState(null)` without a type (stuck as `null`).
- `any` for event handlers instead of `React.ChangeEvent<…>` (or inline inference).
- Re-declaring every native attribute instead of extending `ComponentPropsWithoutRef<'button'>`.
- Context typed as `createContext({} as Auth)` (lies; crashes outside the provider).
- Boolean prop soup instead of discriminated unions for mutually exclusive props.
:::

::: understand
- Type the props and the hooks' initial state; let inference do the rest inside JSX.
:::

::: ask
- *"Which React version?"* React 19 drops `forwardRef` and changes some typings.
:::

::: important ⭐ Say this in the interview
"I type props with a type alias, extending native element props with ComponentPropsWithoutRef so a Button accepts every button attribute, and children as ReactNode. For hooks I give useState an explicit type when the initial value is null, type refs with the element type, and type reducer actions as a discriminated union. Events use React's event types, or I let inline handlers infer them. Reusable components like Select are generic so callbacks get the exact option type, and in React 19 ref is just a prop, so forwardRef isn't needed."
:::

::: links
React: Using TypeScript | https://react.dev/learn/typescript
React TypeScript Cheatsheet | https://react-typescript-cheatsheet.netlify.app/
:::

=== Type assertions vs satisfies vs annotations (and .d.ts files)
@p 2
@tags typescript, satisfies, assertions, declaration-files
@quick
- **Annotation** `const c: Config = {…}` checks the value; the variable's type becomes `Config` (specific literals are lost).
- **`satisfies`** `const c = {…} satisfies Config` checks the value **and keeps the precise inferred type**.
- **Assertion** `as Config` tells TS "trust me": missing fields aren't checked. Use sparingly (DOM lookups, tests).
- **Non-null** `el!` claims "not null": a runtime crash if wrong. Prefer a check.
- **`.d.ts`** files describe JS without types: `@types/*` packages, `declare module 'lib'`, global augmentation.

::: text 🧒 In simple words
An annotation is a **customs check that also relabels your suitcase** with a generic tag. `satisfies` is a customs check that **keeps your detailed packing list**. `as` is **walking past customs** saying "trust me": fine when you're sure, dangerous when you're not.
:::

::: text 📖 Detailed answer
| | Checks the value? | Resulting type | Use |
|---|---|---|---|
| `const x: T = v` | ✅ | `T` | public types, function params |
| `const x = v satisfies T` | ✅ | the precise type of `v` | config objects, route maps, theme tokens |
| `const x = v as T` | ⚠️ only that types overlap | `T` | narrowing you can't express, test fixtures |
| `v!` | ❌ | removes `null`/`undefined` | almost never; check instead |
| `v as unknown as T` | ❌ | `T` | last resort (a smell) |

### Why satisfies is great
`const routes = { home: '/', user: '/users/:id' } satisfies Record<string, string>;`
With an annotation `routes.user` is `string` and `routes.typo` is allowed (index signature). With `satisfies`, keys are exactly `home | user`, values keep their literal types, and wrong values still error.

### Declaration files
- `@types/lodash` provides types for a JS library.
- `declare module 'legacy-widget' { export function mount(el: HTMLElement): void }` when no types exist.
- `declare global { interface Window { analytics: Analytics } }` to augment globals.
- `*.d.ts` for asset imports: `declare module '*.svg' { const src: string; export default src }`.
:::

::: diagram Choosing between annotation, satisfies and as
flowchart TD
  Q{"Do you need the precise inferred type afterwards?"} -->|"yes"| S["satisfies T"]
  Q -->|"no"| A["annotation : T"]
  X{"Can TypeScript not know something you know?"} -->|"yes, and you checked"| AS["as T (rare, document why)"]
  X -->|"no"| N["don't assert: narrow instead"]
:::

::: image Annotation vs satisfies vs as
/images/typescript/assertions.svg
:::

::: text 🪜 Step by step
`const palette = { primary: '#4f46e5', danger: [220, 38, 38] } satisfies Record<string, string | number[]>`:
1. TS checks every value is a `string` or `number[]`: ✅.
2. The variable keeps the **inferred** type: `primary: string`, `danger: number[]`.
3. `palette.danger.map(…)` works without narrowing (with an annotation it'd be `string | number[]`).
4. `palette.secondary` → error (with an annotation + index signature it'd be allowed).
5. A typo in a value (`danger: 'red'` where an array was needed) is still caught by the check... if the type says so.
:::

::: code typescript annotation, satisfies, as and declaration files
export {};
type Theme = Record<string, string | number[]>;

const annotated: Theme = { primary: '#4f46e5', danger: [220, 38, 38] };
// @ts-expect-error: with an annotation, danger is string | number[]
annotated.danger.map((c) => c / 255);

const satisfied = { primary: '#4f46e5', danger: [220, 38, 38] } satisfies Theme;
satisfied.danger.map((c) => c / 255);        // keeps number[]
// @ts-expect-error: unknown key is an error with satisfies
satisfied.secondary;

interface Config { port: number; host: string }
const asserted = { port: 3000 } as Config;   // compiles although host is missing!
// @ts-expect-error: the annotation catches the missing field
const checked: Config = { port: 3000 };

declare const maybeInput: HTMLInputElement | null;
const value = maybeInput?.value ?? '';       // prefer this over maybeInput!.value

// Global augmentation (usually in a .d.ts file inside a module)
declare global {
  interface Window { analytics?: { track(event: string): void } }
}
window.analytics?.track('page_view');
// For an untyped package, a .d.ts file would contain:
// declare module 'legacy-widget' { export function mount(el: HTMLElement): void }
console.log(asserted, checked, value);
:::

::: warning ⚠️ Common mistakes
- `as` to silence errors (hides real bugs, especially missing fields).
- Non-null assertions on DOM lookups (`document.getElementById('x')!`) that crash when the element isn't there.
- Annotating config objects and losing literal types (use `satisfies`).
- Editing types inside `node_modules` instead of augmenting.
:::

::: understand
- Annotation and satisfies **check**; `as` and `!` **trust**. Default to checking.
:::

::: ask
- *"Why can't TypeScript know this?"* before writing `as`.
:::

::: important ⭐ Say this in the interview
"An annotation checks a value against a type and then gives the variable that type, so literal details are lost. satisfies also checks, but keeps the precise inferred type, which is ideal for config objects and theme or route maps. A type assertion with as doesn't check missing fields, it just tells the compiler to trust me, and the non-null assertion is the same idea for null, so I use both rarely and prefer narrowing. For untyped JavaScript I use @types packages or write declaration files, including module and global augmentation."
:::

::: links
TS 4.9: The satisfies operator | https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator
Handbook: Declaration files | https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html
:::

=== What is structural typing? (type compatibility and excess property checks)
@p 2
@tags typescript, structural-typing, compatibility
@quick
- TypeScript is **structurally typed**: a value fits a type if it has the **required members**; names don't matter (Java/C# are nominal).
- A `class Vector { x; y; len() }` can be passed where `interface Point { x; y }` is expected.
- **Excess property checks** apply only to **fresh object literals**: `draw({ x, y, z })` errors, but a variable with extra fields passes.
- Branded types simulate nominal typing: `type UserId = string & { readonly __brand: 'UserId' }`.
- `Object.keys(obj)` returns `string[]` because objects may have extra keys at run time.

::: text 🧒 In simple words
TypeScript checks **what you can do, not who you are**: if a job needs "someone who can drive and has a licence", any person with those two things gets the job, whatever their name is. JavaScript objects work like that (duck typing), so TypeScript does too.
:::

::: text 📖 Detailed answer
### Structural vs nominal
| | Structural (TypeScript) | Nominal (Java, C#) |
|---|---|---|
| Compatible if | the shape matches | the declared type name/inheritance matches |
| Two identical interfaces | interchangeable | different types |
| Plain objects as class instances | allowed if the shape fits | not allowed |

### Excess property checking
Passing `{ x: 1, y: 2, z: 3 }` **directly** to `draw(p: Point)` errors ("Object literal may only specify known properties") because extra properties in a literal are usually typos. Assigning the same object to a variable first and passing the variable is allowed (it's no longer "fresh").

### Consequences
- `Object.keys(user)` is `string[]`, not `(keyof User)[]`: at run time `user` might carry more keys.
- Functions with fewer parameters are assignable to function types with more.
- Private class fields (`#x` or TS `private`) make classes behave nominally.

### Branded types
`type UserId = string & { readonly __brand: 'UserId' }` and a `toUserId(s)` function prevent passing an `OrderId` where a `UserId` is expected, even though both are strings.
:::

::: diagram Is the value assignable?
flowchart TD
  V["value passed to draw(p: Point)"] --> F{"fresh object literal?"}
  F -->|"yes"| X{"extra properties?"}
  X -->|"yes"| E["error: excess property"]
  X -->|"no"| S{"has x: number and y: number?"}
  F -->|"no (variable)"| S
  S -->|"yes"| OK["OK"]
  S -->|"no"| E2["error: missing property"]
:::

::: image Structural typing
/images/typescript/structural.svg
:::

::: text 🪜 Step by step
Preventing an ID mix-up with brands:
1. `type UserId = string & { readonly __brand: 'UserId' }`, same for `OrderId`.
2. `function getUser(id: UserId)`.
3. `getUser('abc')` → error: a plain string is not a `UserId`.
4. `getUser(toUserId('abc'))` → OK (`toUserId` validates and casts once).
5. `getUser(orderId)` → error, although both are strings at run time.
:::

::: code typescript Structural compatibility, excess property checks and brands
interface Point { x: number; y: number }
function draw(p: Point) { return `${p.x},${p.y}`; }

class Vector { constructor(public x: number, public y: number) {} len() { return Math.hypot(this.x, this.y); } }
draw(new Vector(3, 4));                  // OK: has x and y

// @ts-expect-error: excess property check on a fresh literal
draw({ x: 1, y: 2, z: 3 });
const p3 = { x: 1, y: 2, z: 3 };
draw(p3);                                // OK: not fresh

const user = { id: 1, name: 'Asha' };
const keys = Object.keys(user);          // string[], not ('id' | 'name')[]

type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };
const toUserId = (s: string) => s as UserId;
const toOrderId = (s: string) => s as OrderId;
function getUser(id: UserId) { return id; }
getUser(toUserId('u1'));
// @ts-expect-error: plain strings are not UserIds
getUser('u1');
// @ts-expect-error: an OrderId is not a UserId
getUser(toOrderId('o1'));

class A { #secret = 1; get() { return this.#secret; } }
class B { #secret = 1; get() { return this.#secret; } }
// @ts-expect-error: private fields make classes nominal
const a: A = new B();
console.log(keys, a);
:::

::: warning ⚠️ Common mistakes
- Expecting nominal behaviour ("two interfaces with the same fields are different types").
- Assuming excess property checks protect variables too.
- Casting `Object.keys(obj) as (keyof T)[]` without thinking about extra keys.
- Mixing up IDs of different entities (consider branded types).
:::

::: understand
- Compatibility is about shape; freshness triggers extra checks; brands add nominal safety where needed.
:::

::: ask
- *"Do we need to prevent mixing IDs or units?"* That's a branded-type use case.
:::

::: important ⭐ Say this in the interview
"TypeScript is structurally typed: a value is assignable if it has the required members, regardless of the type's name, which matches JavaScript's duck typing. So a class instance with x and y can be passed where a Point interface is expected. Fresh object literals get an extra excess property check to catch typos, but a variable with extra fields is accepted, which is also why Object.keys returns string[]. When I need nominal behaviour, like not mixing user IDs and order IDs, I use branded types."
:::

::: links
Handbook: Type compatibility | https://www.typescriptlang.org/docs/handbook/type-compatibility.html
:::
