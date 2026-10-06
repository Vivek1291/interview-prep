@section TypeScript Fundamentals
@icon 🔷
@color #3b82f6
@desc Start here: what TypeScript is, the basic types, interface vs type, unions and narrowing, any/unknown/never, typing functions, enums vs unions and tsconfig. Every TypeScript example is compiled with tsc --strict.

=== What is TypeScript, and why use it?
@p 3
@tags typescript, basics, tooling
@quick
- TypeScript = **JavaScript + static types**. It's checked at **build time** and the types are **erased**: browsers and Node run plain JS.
- Catches bugs before running (typos, `undefined` access, wrong arguments), and powers autocomplete, safe refactoring and self-documenting APIs.
- Types don't exist at run time: you still need runtime validation (zod, valibot) for API input and JSON.
- Measured on 500 files: `tsc` type-check **809 ms**, esbuild transpile-only **226 ms**, Node's type stripping **103 ms**. Bundlers strip types fast and `tsc --noEmit` checks in CI.
- Adopt gradually: `allowJs`, `checkJs`, `// @ts-check`, then rename files to `.ts`.

::: text 🧒 In simple words
TypeScript is a **spell-checker for your code**. While you write, it underlines mistakes like "this might be empty" or "you passed a number where a name was expected". When you publish, the red underlines (types) are removed, and what's left is ordinary JavaScript.
:::

::: text 📖 Detailed answer
### What it adds
| Without TS | With TS |
|---|---|
| `user.nmae` fails at run time (or silently gives `undefined`) | compile error: *Property 'nmae' does not exist. Did you mean 'name'?* |
| You read the code to know what a function expects | the signature tells you, and the editor autocompletes |
| Renaming a field means searching the codebase | rename symbol updates every usage safely |
| `null` crashes in production | `strictNullChecks` forces you to handle it |

### How it runs
1. You write `.ts` / `.tsx`.
2. **Type-check**: `tsc --noEmit` (or your editor) reports errors.
3. **Transpile**: a fast tool (esbuild, swc, Babel, Vite, Next.js, or Node's built-in `--experimental-strip-types`) **removes the types**, producing JS.
4. The JS runs. No type information remains at run time.

That's why `function f(x: number)` doesn't stop someone from calling `f("5")` from untyped JS or with data from an API: **validate external data at run time**.

### Why companies use it
- Fewer production bugs in large codebases, especially around `null`/`undefined` and API shapes.
- Faster onboarding: types are always-up-to-date documentation.
- Safe refactors across hundreds of files.
- Costs: a build step, learning curve, and occasionally complex type gymnastics.
:::

::: diagram From .ts to running JavaScript
flowchart LR
  TS["app.ts with types"] --> CHK["tsc --noEmit: type errors"]
  TS --> STRIP["esbuild / swc / Node: remove types"]
  STRIP --> JS["app.js (plain JavaScript)"]
  JS --> RUN["browser / Node runs it"]
  CHK -.->|"CI fails on errors"| RUN
:::

::: image TypeScript: checked at build time, erased at run time (measured compile times)
/images/typescript/ts-pipeline.svg
:::

::: chart bar Measured: processing 500 TypeScript files (wall time incl. process start, Node 22, M3 Pro)
Tool,Time (ms)
tsc --noEmit (type-check),809
esbuild (transpile only),226
Node stripTypeScriptTypes,103
:::

::: text 🪜 Step by step
What happens to `function total(items: Item[]): number { return items.reduce((s, i) => s + i.price, 0); }`:
1. In the editor, TS knows `items` is an array of `Item`, so `i.price` autocompletes and `i.prise` is an error.
2. `tsc --noEmit` in CI checks every file; any error fails the build.
3. Vite/esbuild strips `: Item[]` and `: number` → `function total(items) { return … }`.
4. The browser runs that JS. If an API returns `price: "12"` (a string), TS can't know: validate with zod at the boundary.
5. Result: most mistakes are caught before running; the remaining runtime risks are at the edges of your app.
:::

::: code typescript Types catch bugs before the code runs
interface Item { name: string; price: number; qty: number }

function total(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

const cart: Item[] = [{ name: 'Book', price: 300, qty: 2 }];
total(cart);

// @ts-expect-error: typo in a property name is caught
cart[0].prise;

// @ts-expect-error: wrong argument type
total('cart');

// strictNullChecks: find() may return undefined
const book = cart.find((i) => i.name === 'Book');
// @ts-expect-error: 'book' is possibly 'undefined'
book.price;
if (book) book.price;            // OK after the check
:::

::: code javascript The same code at run time: types are gone, so validate external data (runnable)
// This is what the TypeScript above becomes after type stripping.
function total(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}
const fromApi = JSON.parse('[{"name":"Book","price":"300","qty":2}]');    // price is a STRING
console.log('no types at run time: "300" * 2 still "works"', total(fromApi) === 600 ? '✅' : '❌ FAIL');

// A tiny runtime validator (what zod/valibot do for you)
function parseItems(data) {
  if (!Array.isArray(data)) throw new TypeError('expected an array');
  return data.map((d, i) => {
    if (typeof d.name !== 'string' || typeof d.price !== 'number' || !Number.isInteger(d.qty)) {
      throw new TypeError(`item ${i} is invalid: ${JSON.stringify(d)}`);
    }
    return d;
  });
}
let error = '';
try { parseItems(fromApi); } catch (e) { error = e.message; }
console.log('runtime validation catches what types cannot', error.startsWith('item 0 is invalid') ? '✅' : '❌ FAIL');
console.log('valid data passes', parseItems([{ name: 'Pen', price: 20, qty: 1 }]).length === 1 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking TypeScript validates data at run time.
- Using `any` to silence errors (you lose the benefit).
- Running only the bundler: Vite/esbuild **don't type-check**; add `tsc --noEmit` to CI.
- Over-engineering types that nobody can read.
:::

::: understand
- TS = compile-time safety + tooling; JS = what actually runs. Validate at the edges.
:::

::: ask
- *"Is strict mode on, and is type-checking part of CI?"*
:::

::: important ⭐ Say this in the interview
"TypeScript is JavaScript with static types. The types are checked at build time and then erased, so browsers and Node run plain JavaScript. That catches a whole class of bugs early, like typos, wrong arguments and unhandled null, and it gives autocomplete, safe refactoring and self-documenting APIs. Because types disappear at run time, I still validate external data like API responses with something like zod. In practice the bundler strips types quickly and tsc --noEmit runs in CI to actually check them."
:::

::: links
TypeScript handbook | https://www.typescriptlang.org/docs/handbook/intro.html
TypeScript for JavaScript programmers | https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html
Node.js: running TypeScript natively | https://nodejs.org/api/typescript.html
:::

=== How does the TypeScript compiler work? (scanner, parser, AST, checker, emitter)
@p 2
@tags typescript, compiler, ast, tooling
@quick
- `tsc` pipeline: **scanner** (text → tokens) → **parser** (tokens → **AST**) → **binder** (symbols, scopes) → **checker** (types, errors) → **emitter** (JS + `.d.ts` + source maps).
- The **AST** (abstract syntax tree) is the code as a tree of nodes: `VariableDeclaration` → `Identifier`, type annotation, initializer…
- Measured on 563 files: parse **0.12 s**, bind **0.06 s**, **check 0.38 s** (64% of the time), emit 0 s (`--noEmit`). Type-checking is the expensive part.
- Emitting = removing type nodes (+ downleveling if `target` is old); that's why esbuild/swc/Node can **strip types without checking**, much faster.
- TypeScript is a **superset** of JavaScript: every valid JS file is (syntactically) valid TS; types never change runtime behaviour.

::: text 🧒 In simple words
The compiler is a **translator and proofreader**. It first splits your sentences into words (tokens), draws a **grammar tree** of each sentence (AST), works out who each name refers to (binder), checks the meaning makes sense (checker), and finally writes the translation without the notes in the margin (types).
:::

::: text 📖 Detailed answer
### The phases
| Phase | Input → output | Example |
|---|---|---|
| Scanner | `const total: number = …` → tokens | `ConstKeyword`, `Identifier(total)`, `ColonToken`, `NumberKeyword` … |
| Parser | tokens → AST | `VariableStatement` → `VariableDeclaration` → … |
| Binder | AST → symbols and scopes | links `total` to its declaration |
| Checker | AST + symbols → types + diagnostics | "Type 'string' is not assignable to type 'number'" |
| Emitter | AST → `.js`, `.d.ts`, `.map` | drops `: number` |

### Real AST (from `ts.createSourceFile`)
For `const total: number = items.reduce((s, i) => s + i.price, 0);`:
`SourceFile → VariableStatement → VariableDeclarationList → VariableDeclaration → Identifier(total), NumberKeyword, CallExpression → PropertyAccessExpression(items.reduce), ArrowFunction(Parameter s, Parameter i, …)`.
Emitted JS: `const total = items.reduce((s, i) => s + i.price, 0);` (the `NumberKeyword` node is gone).

### Measured (`tsc --extendedDiagnostics`, 500 generated files + lib, M3 Pro)
| Phase | Time |
|---|---|
| Parse | 0.12 s |
| Bind | 0.06 s |
| Check | 0.38 s |
| Emit | 0 s (noEmit) |
| Total | 0.59 s |

### Why this matters
- **Type-checking is the slow part**, so dev servers transpile with esbuild/swc and run `tsc --noEmit` separately (CI, editor).
- `isolatedModules` exists because single-file transpilers can't see other files' types.
- ASTs power the whole ecosystem: ESLint rules, Prettier, codemods, Babel plugins, the React Compiler.
- The TypeScript team is porting the compiler to Go (TypeScript 7, "Corsa") for ~10× faster checking.
:::

::: diagram The tsc pipeline
flowchart LR
  T["source text"] --> S["scanner: tokens"]
  S --> P["parser: AST"]
  P --> B["binder: symbols and scopes"]
  B --> C["checker: types and errors"]
  P --> E["emitter: .js, .d.ts, .map"]
  C -.->|"errors do not block emit unless noEmitOnError"| E
:::

::: image How the TypeScript compiler works (measured phases)
/images/typescript/compiler.svg
:::

::: chart bar Measured: tsc phases on 563 files (seconds)
Phase,Seconds
Parse,0.12
Bind,0.06
Check,0.38
Emit (noEmit),0
:::

::: text 🪜 Step by step
What happens to `const n: number = 'five';`:
1. Scanner: `const`, `n`, `:`, `number`, `=`, `'five'`, `;`.
2. Parser: a `VariableDeclaration` with name `n`, type `NumberKeyword`, initializer `StringLiteral`.
3. Binder: creates a symbol `n` in the current scope.
4. Checker: type of the initializer is `string`, declared type is `number` → error TS2322.
5. Emitter (unless `noEmitOnError`): still writes `const n = 'five';`, because types don't change runtime code.
:::

::: code typescript Using the compiler API: print an AST and transpile (checked with tsc)
import ts from 'typescript';

const source = 'const total: number = items.reduce((s, i) => s + i.price, 0);';
const file = ts.createSourceFile('example.ts', source, ts.ScriptTarget.ES2022, true);

function printTree(node: ts.Node, depth = 0): string[] {
  const label = ts.SyntaxKind[node.kind] + (ts.isIdentifier(node) ? ` (${node.text})` : '');
  const lines = ['  '.repeat(depth) + label];
  node.forEachChild((child) => { lines.push(...printTree(child, depth + 1)); });
  return lines;
}
console.log(printTree(file).slice(0, 8).join('\n'));

const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
console.log(js.trim());   // const total = items.reduce((s, i) => s + i.price, 0);
:::

::: code javascript A tiny tokenizer: the first phase of every compiler (runnable)
function tokenize(src) {
  const rules = [['ws', /^\s+/], ['keyword', /^(const|let|number|string)\b/], ['ident', /^[A-Za-z_]\w*/], ['number', /^\d+/], ['string', /^'[^']*'/], ['punct', /^[:=;().,+]/]];
  const tokens = [];
  while (src.length) {
    const [type, re] = rules.find(([, r]) => r.test(src)) ?? [];
    if (!type) throw new SyntaxError(`Unexpected "${src[0]}"`);
    const [text] = src.match(re);
    if (type !== 'ws') tokens.push(`${type}:${text}`);
    src = src.slice(text.length);
  }
  return tokens;
}
const tokens = tokenize("const n: number = 'five';");
console.log(tokens.join('  '));
console.log('scanner output', tokens.join(' ') === "keyword:const ident:n punct:: keyword:number punct:= string:'five' punct:;" ? '✅' : '❌ FAIL');
// "Type stripping" = dropping the ": number" tokens
const stripped = tokens.filter((t, i) => !(t === 'punct::' || (tokens[i - 1] === 'punct::' && t.startsWith('keyword')))).map((t) => t.split(/:(.*)/s)[1]).join(' ');
console.log(stripped, stripped === "const n = 'five' ;" ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking types are checked at run time or change the emitted logic.
- Expecting the bundler (esbuild/swc/Vite) to report type errors.
- Saying TypeScript "is interpreted": it's compiled (transpiled) to JS, then the JS engine runs it.
- Ignoring `noEmitOnError` when you need a failed type-check to block the build.
:::

::: understand
- Parse → bind → check → emit; checking is the expensive step, emitting is mostly deletion.
:::

::: ask
- *"Is type-checking part of the build or a separate CI step?"*
:::

::: important ⭐ Say this in the interview
"The TypeScript compiler scans the source into tokens, parses them into an abstract syntax tree, binds names to symbols and scopes, type-checks the tree to produce diagnostics, and emits JavaScript, declaration files and source maps. Emitting is mostly removing type nodes, which is why tools like esbuild, swc or Node can strip types very quickly without checking, while tsc --noEmit does the actual checking. I measured the phases on about 560 files: parsing took 0.12 seconds, binding 0.06 and checking 0.38, so checking dominates. ASTs are also what ESLint, Prettier and codemods work on."
:::

::: links
TypeScript compiler API | https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
TypeScript AST viewer | https://ts-ast-viewer.com/
TypeScript native port (Go) | https://devblogs.microsoft.com/typescript/typescript-native-port/
:::

=== Basic types, type inference and annotations
@p 3
@tags typescript, types, inference
@quick
- Primitives: `string`, `number`, `boolean`, `bigint`, `symbol`, `null`, `undefined`. Arrays: `number[]` / `Array<number>`. Tuples: `[string, number]`.
- Object types: `{ id: number; name?: string; readonly createdAt: Date }` (`?` optional, `readonly` can't be reassigned).
- **Inference**: `let x = 5` is `number`; `const y = 'GET'` is the literal `'GET'`. Annotate **parameters** and public APIs, let TS infer locals and return types.
- **Literal types**: `'GET' | 'POST'`, `as const` keeps values literal and readonly.
- Index signatures / `Record<string, number>` for dictionaries.

::: text 🧒 In simple words
Types are **labels on boxes**: "only numbers in here", "a list of names", "a pair of name and age". Most of the time TypeScript **reads the label itself** from what you put in (inference), so you only write labels where it can't guess, like function inputs.
:::

::: text 📖 Detailed answer
| Type | Example | Notes |
|---|---|---|
| `string`, `number`, `boolean` | `let n: number = 5` | lowercase (not `String`) |
| arrays | `string[]`, `Array<string>` | same thing |
| tuple | `[string, number]` | fixed length and positions (e.g. `useState` returns one) |
| object type | `{ id: number; name?: string }` | `?` = may be missing |
| `readonly` | `readonly string[]`, `readonly id: number` | compile-time only |
| literal | `'GET'`, `42`, `true` | exact values |
| union of literals | `'sm' \| 'md' \| 'lg'` | the type-safe "enum" |
| `Record<K, V>` | `Record<string, number>` | dictionary |
| `Date`, `Map<K, V>`, `Promise<T>` | built-in classes/generics | |

### Inference rules worth knowing
- `let` widens (`let s = 'a'` → `string`), `const` keeps literals (`const s = 'a'` → `'a'`).
- Object literal properties widen: `const o = { method: 'GET' }` → `method: string`. Use `as const` to keep `'GET'`.
- Function **return types** are inferred; **parameters are not** (without annotations they're implicitly `any`, an error under `strict`).
- Empty arrays need a type: `const ids: number[] = []`.
- Contextual typing: in `arr.map(x => …)` the callback parameter is inferred from the array.
:::

::: diagram How TypeScript decides a type
flowchart TD
  V["a value or variable"] --> A{"explicitly annotated?"}
  A -->|"yes"| U["use the annotation, check the value against it"]
  A -->|"no"| C{"const or let?"}
  C -->|"const primitive"| L["literal type, e.g. 'GET'"]
  C -->|"let or object property"| W["widened type, e.g. string"]
  V --> X{"function parameter?"}
  X -->|"no annotation"| E["implicit any: error under strict"]
:::

::: image TypeScript basic types
/images/typescript/ts-types.svg
:::

::: text 🪜 Step by step
`const req = { method: 'GET', retries: 3 }; send(req)` where `send(r: { method: 'GET' | 'POST'; retries: number })`:
1. `req.method` is inferred as **`string`** (object properties widen).
2. `send(req)` → error: `string` is not assignable to `'GET' | 'POST'`.
3. Fix A: `const req = { method: 'GET', retries: 3 } as const` → `method: 'GET'` (and readonly).
4. Fix B: annotate `const req: Request = { … }`.
5. Fix C: inline the object in the call (contextual typing infers the literal).
:::

::: code typescript Annotations, inference, tuples, readonly and as const
let count = 0;                       // inferred: number
const method = 'GET';                // inferred: 'GET' (literal)
const ids: number[] = [];            // empty array needs a type
const point: [number, number] = [10, 20];   // tuple
const scores: Record<string, number> = { asha: 9, ravi: 7 };

interface User {
  readonly id: number;
  name: string;
  email?: string;                    // optional
}
const u: User = { id: 1, name: 'Asha' };
// @ts-expect-error: id is readonly
u.id = 2;

type Method = 'GET' | 'POST';
function send(r: { method: Method; retries: number }) { return r.method; }

const req1 = { method: 'GET', retries: 3 };
// @ts-expect-error: method was widened to string
send(req1);
const req2 = { method: 'GET', retries: 3 } as const;
send(req2);                          // OK: method is 'GET'

const sizes = ['sm', 'md', 'lg'] as const;
type Size = (typeof sizes)[number];  // 'sm' | 'md' | 'lg'
const s: Size = 'md';

function add(a: number, b: number) { return a + b; }   // return type inferred: number
const total: number = add(1, 2);
count += total + ids.length + point[0] + (scores.asha ?? 0) + s.length;
:::

::: warning ⚠️ Common mistakes
- Using `String`, `Number`, `Object` (wrapper types) instead of `string`, `number`, `object`.
- Annotating everything (noise); annotate params and exports, infer the rest.
- `const arr = []` without a type (becomes `any[]` / `never[]` problems).
- Forgetting that `readonly` and `as const` are compile-time only (`Object.freeze` for runtime).
:::

::: understand
- Inference does most of the work; annotations define contracts at boundaries.
:::

::: ask
- *"Should this value be a specific literal or any string?"* Decides `as const` / literal unions.
:::

::: important ⭐ Say this in the interview
"The basic types are the JavaScript primitives plus arrays, tuples, object types with optional and readonly properties, and literal types. TypeScript infers most types: let widens to string or number while const keeps literal types, and object properties widen unless I use as const. Function parameters aren't inferred, so I annotate parameters and public APIs and let return types and locals be inferred. Unions of string literals give me type-safe options like 'sm' | 'md' | 'lg'."
:::

::: links
Handbook: Everyday types | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
Handbook: Type inference | https://www.typescriptlang.org/docs/handbook/type-inference.html
:::

=== interface vs type: what's the difference?
@p 3
@tags typescript, interface, type-alias
@quick
- Both describe **object shapes**, and for that they're almost interchangeable.
- Only `type` can name **unions, tuples, primitives, mapped and conditional types**: `type Status = 'idle' | 'loading'`.
- Only `interface` supports **declaration merging** (two `interface Window` declarations combine; used to augment libraries).
- Extending: `interface B extends A` vs `type B = A & { … }`; `extends` reports conflicts more clearly.
- Common convention: `interface` for object/class contracts, `type` for unions, utilities and props; just be consistent.

::: text 🧒 In simple words
An `interface` is a **form template** that others can add fields to later (merging). A `type` is a **label you can put on anything**: a form, a choice between options, a pair of values. For a plain form, both work.
:::

::: text 📖 Detailed answer
| Feature | `interface` | `type` |
|---|---|---|
| Object shapes | ✅ | ✅ |
| Union / tuple / primitive alias | ❌ | ✅ |
| Mapped / conditional types | ❌ | ✅ |
| Extend | `extends A, B` | `A & B` |
| Implemented by classes | ✅ | ✅ (if it's an object type) |
| Declaration merging | ✅ | ❌ (duplicate identifier) |
| Error messages | shows the interface name | can show the expanded shape |

### Declaration merging, the real difference
`interface Window { analytics: Analytics }   // adds to the DOM's Window`
Libraries rely on this for **module augmentation** (adding fields to Express's `Request`, theme types, etc.).

### extends vs intersection
`interface B extends A { id: string }` errors if `A.id` is `number` (incompatible override). `type B = A & { id: string }` silently makes `id: never`. Prefer `extends` for object hierarchies.
:::

::: diagram Choosing between interface and type
flowchart TD
  Q{"What are you describing?"} -->|"union, tuple, primitive, mapped or conditional"| T["type"]
  Q -->|"object shape"| M{"Must others extend or merge it (library, global)?"}
  M -->|"yes"| I["interface"]
  M -->|"no"| E["either: follow the team convention"]
:::

::: image interface vs type
/images/typescript/interface-vs-type.svg
:::

::: text 🪜 Step by step
Adding a `user` field to Express's `Request` (augmentation):
1. Create `types/express.d.ts`.
2. `declare global { namespace Express { interface Request { user?: { id: string } } } }`.
3. Because `Request` is an **interface**, your declaration **merges** with Express's.
4. Now `req.user?.id` type-checks in every route.
5. With a `type` alias this would be a "duplicate identifier" error.
:::

::: code typescript interface and type side by side
interface Animal { name: string }
interface Dog extends Animal { bark(): string }           // extends

type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number };   // union: type only
type Pair = [string, number];                              // tuple: type only
type Nullable<T> = T | null;                               // generic alias

// Declaration merging: only interfaces
interface Settings { theme: 'light' | 'dark' }
interface Settings { fontSize: number }
const settings: Settings = { theme: 'dark', fontSize: 14 };   // both fields required

// extends reports incompatible overrides, & silently creates never
interface Base { id: number }
// @ts-expect-error: Interface 'Bad' incorrectly extends interface 'Base'
interface Bad extends Base { id: string }
type Weird = Base & { id: string };
const w = {} as Weird;
const impossible: never = w.id;                             // id is number & string = never

class Labrador implements Dog { name = 'Rex'; bark() { return 'woof'; } }
const shapes: Shape[] = [{ kind: 'circle', r: 1 }];
const p: Pair = ['a', 1];
const maybe: Nullable<string> = null;
console.log(settings, new Labrador().bark(), shapes, p, maybe, impossible);
:::

::: warning ⚠️ Common mistakes
- Claiming interfaces are "faster" or types "can't be extended" (both can, differently).
- Accidentally merging two interfaces with the same name in one scope.
- Using intersections to "override" properties (produces `never`).
- Mixing both styles randomly in one codebase.
:::

::: understand
- Real differences: unions/mapped types (type only) and declaration merging (interface only).
:::

::: ask
- *"Does the team have a lint rule (consistent-type-definitions)?"*
:::

::: important ⭐ Say this in the interview
"For object shapes interface and type are nearly interchangeable. The real differences are that only type aliases can represent unions, tuples, primitives, mapped and conditional types, and only interfaces support declaration merging, which is how you augment library types like Express's Request or the global Window. Interfaces also give clearer errors when extending incompatibly, whereas an intersection silently produces never. I use interfaces for object contracts and types for unions and utilities, and keep it consistent across the codebase."
:::

::: links
Handbook: Differences between type aliases and interfaces | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces
Handbook: Declaration merging | https://www.typescriptlang.org/docs/handbook/declaration-merging.html
:::

=== Union types, narrowing and type guards (discriminated unions)
@p 3
@tags typescript, unions, narrowing, type-guards
@quick
- A **union** `A | B` means "one of these"; you can only use what's common until you **narrow**.
- Narrowing tools: `typeof`, `instanceof`, `in`, equality checks, truthiness, `Array.isArray`, and **custom guards** `function isUser(x): x is User`.
- **Discriminated union**: every member has a literal tag (`kind: 'circle' | 'square'`); `switch (shape.kind)` narrows each case. The #1 pattern for state, actions and API results.
- **Exhaustiveness**: `const _: never = shape` in `default` makes the compiler flag unhandled cases.
- Intersections `A & B` = "both at once" (combine object types).

::: text 🧒 In simple words
A union is a **parcel that could contain a book or a phone**. You can't read it or call with it until you **open the box and check** what's inside. Type guards are those checks, and after each one TypeScript knows exactly what you're holding.
:::

::: text 📖 Detailed answer
### Narrowing techniques
| Check | Narrows | Example |
|---|---|---|
| `typeof x === 'string'` | primitives | `string \| number` → `string` |
| `x instanceof Date` | classes | `Date \| string` → `Date` |
| `'email' in x` | object members | `User \| Guest` → `User` |
| `x === null`, truthiness | null/undefined | `T \| null` → `T` |
| `Array.isArray(x)` | arrays | `T \| T[]` → `T[]` |
| `x.kind === 'circle'` | discriminated unions | → the matching member |
| `isUser(x): x is User` | anything you can check at run time | custom guard |
| `assertIsUser(x): asserts x is User` | after the call | assertion function |

### Discriminated unions for UI state
`type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: User[] }`
Each status has exactly the fields that make sense, so `state.data` only exists when `status === 'success'`. No more `isLoading && !error && data` combinations that can't happen.

### Exhaustiveness checking
In the `default` branch, assign the narrowed value to `never`. If someone adds `{ status: 'empty' }`, every switch that forgot it stops compiling.
:::

::: diagram Narrowing a discriminated union
flowchart TD
  S["state: State"] --> K{"state.status"}
  K -->|"'loading'"| L["show spinner"]
  K -->|"'error'"| E["state.error is a string"]
  K -->|"'success'"| D["state.data is User[]"]
  K -->|"anything else"| N["const _: never = state (compile error if a case is missing)"]
:::

::: image Narrowing a union with type guards
/images/typescript/narrowing.svg
:::

::: text 🪜 Step by step
`function area(s: Shape)` with `type Shape = Circle | Square`:
1. `s.r` directly → error: `r` doesn't exist on `Square`.
2. `switch (s.kind)` → in `case 'circle'` TS narrows `s` to `Circle`, so `s.r` is fine.
3. `case 'square'` → `s.side`.
4. `default: const _exhaustive: never = s` compiles because nothing is left.
5. Add `Triangle` to `Shape` → `default` now receives `Triangle`, which isn't `never` → compile error until you handle it.
:::

::: code typescript Guards, discriminated unions and exhaustiveness
interface User { id: number; email: string }
interface Guest { sessionId: string }

function label(x: string | number | Date | User | Guest | null): string {
  if (x === null) return 'nothing';
  if (typeof x === 'string') return x.toUpperCase();
  if (typeof x === 'number') return x.toFixed(2);
  if (x instanceof Date) return x.toISOString();
  if ('email' in x) return x.email;            // User
  return x.sessionId;                            // Guest
}

function isUser(v: unknown): v is User {         // custom type guard
  return typeof v === 'object' && v !== null && 'email' in v && typeof (v as User).email === 'string';
}

type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'square'; side: number }
  | { kind: 'rect'; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'square': return s.side ** 2;
    case 'rect': return s.w * s.h;
    default: {
      const exhaustive: never = s;              // fails to compile if a kind is not handled
      return exhaustive;
    }
  }
}

type Loadable<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: T };
function render(state: Loadable<User[]>): string {
  if (state.status === 'success') return `${state.data.length} users`;
  // @ts-expect-error: data only exists on the success member
  state.data;
  return state.status === 'error' ? state.error : 'Loading…';
}
console.log(label(null), isUser({ email: 'a@b.c' }), area({ kind: 'rect', w: 2, h: 3 }), render({ status: 'loading' }));
:::

::: code javascript The same discriminated-union reducer at run time (runnable)
// A reducer over a discriminated union: the "kind/type" tag decides what data exists.
function reducer(state, action) {
  switch (action.type) {
    case 'fetch': return { status: 'loading' };
    case 'resolve': return { status: 'success', data: action.data };
    case 'reject': return { status: 'error', error: action.error };
    default: throw new Error(`Unhandled action: ${action.type}`);    // TS would make this a compile error
  }
}
let state = { status: 'idle' };
state = reducer(state, { type: 'fetch' });
console.log('loading has no data field', state.status === 'loading' && !('data' in state) ? '✅' : '❌ FAIL');
state = reducer(state, { type: 'resolve', data: ['asha'] });
console.log('success carries data', state.status === 'success' && state.data[0] === 'asha' ? '✅' : '❌ FAIL');
let err = '';
try { reducer(state, { type: 'oops' }); } catch (e) { err = e.message; }
console.log('unknown tags fail loudly', err === 'Unhandled action: oops' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Modelling state with several booleans (`isLoading`, `isError`) that allow impossible combinations.
- Custom guards that lie (`return true`): TS trusts them blindly.
- Using `as User` instead of narrowing (no check happens).
- Forgetting the exhaustiveness check, so new union members slip through.
:::

::: understand
- Unions + narrowing = model reality precisely; discriminated unions are the workhorse pattern.
:::

::: ask
- *"Can these states really co-exist?"* If not, make them a discriminated union.
:::

::: important ⭐ Say this in the interview
"A union means a value is one of several types, and TypeScript only lets me use what they have in common until I narrow it with typeof, instanceof, the in operator, equality checks, or a custom type predicate. My favourite pattern is the discriminated union: each member has a literal tag like status or kind, so a switch on the tag narrows to exactly the right shape, which is perfect for UI state and reducer actions. I add a never check in the default branch so adding a new member forces every switch to handle it."
:::

::: links
Handbook: Narrowing | https://www.typescriptlang.org/docs/handbook/2/narrowing.html
Handbook: Discriminated unions | https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
:::

=== Union vs intersection types: why do some intersections become never?
@p 2
@tags typescript, unions, intersections, never, assignability
@quick
- **Union** `A | B`: a value is **either** A or B; you may only use what both have in common until you narrow.
- **Intersection** `A & B`: a value is **both** A and B at once.
- For **object types**, `&` behaves like a merge: `{ id: number } & { name: string }` needs both properties.
- For **literal/primitive types** with no overlap, `&` is **`never`**: `('loading' | 'success') & ('Done' | 'Failed')` → `never`; `string & number` → `never`.
- Assignability: `'a'` → `'a' | 'b'` ✅ (narrow to wide); `string | number` → `string` ❌ (the number part may not fit).

::: text 🧒 In simple words
Think of **two clubs**. A union is "member of the chess club **or** the football club": a big group. An intersection is "member of **both** clubs": only the overlap. If nobody is in both clubs, the intersection is an **empty room** (`never`).
:::

::: text 📖 Detailed answer
### Sets of values
| Type | Values it contains |
|---|---|
| `'loading' \| 'success' \| 'error'` | 3 strings |
| `'Done' \| 'Failed'` | 2 strings |
| `Status \| Done` | all 5 |
| `Status & Done` | none in common → `never` |
| `string & 'GET'` | `'GET'` (overlap) |
| `{ id: number } & { name: string }` | objects having both properties |
| `{ id: number } & { id: string }` | `id: never` (conflicting property) |

### Why object intersections "add" properties
A value of `A & B` must be assignable to A **and** to B, so it needs every property of both. That looks like a merge but it's still "the overlap of two sets of values".

### Assignability in one sentence
`X` is assignable to `Y` if **every** possible value of X is also a value of Y.
- `'GET'` → `'GET' | 'POST'` ✅
- `string | number` → `string` ❌ (a number isn't a string)
- In conditional types, `[T] extends [string]` asks exactly this question for the whole union (`[string | number] extends [string]` → false).

### Practical uses
- Union: props that accept several shapes, API results (`Success | Failure`).
- Intersection: mixing in shared fields (`type WithTimestamps<T> = T & { createdAt: Date }`), combining props.
:::

::: diagram Union and intersection as sets
flowchart LR
  S["Status: loading, success, error"] --> U["Status | Done: 5 strings"]
  D["Done: Done, Failed"] --> U
  S --> I["Status & Done: no common value"]
  D --> I
  I --> N["never"]
:::

::: image Union (|) vs intersection (&)
/images/typescript/union-intersection.svg
:::

::: text 🪜 Step by step
Why `type Complete = Status & Done` is `never`:
1. `Status` = {`'loading'`, `'success'`, `'error'`}.
2. `Done` = {`'Done'`, `'Failed'`}.
3. `&` keeps only values that are in **both** sets.
4. No string is in both → the empty set → `never`.
5. Any variable of type `Complete` can't be assigned anything (`const c: Complete = 'Done'` errors). You probably wanted `Status | Done`.
:::

::: code typescript Unions, intersections and assignability (checked with tsc --strict)
type Status = 'loading' | 'success' | 'error';
type Done = 'Done' | 'Failed';

type Either = Status | Done;            // 5 possible strings
type Complete = Status & Done;          // never
const e: Either = 'Failed';
// @ts-expect-error: nothing is assignable to never
const c: Complete = 'Done';

type WithId = { id: number };
type WithName = { name: string };
type Entity = WithId & WithName;        // needs both properties
const ok: Entity = { id: 1, name: 'Asha' };
// @ts-expect-error: name is missing
const missing: Entity = { id: 1 };

type Conflict = { id: number } & { id: string };
declare const conflict: Conflict;
const impossible: never = conflict.id;  // number & string = never

declare const wide: string | number;          // could be either
// @ts-expect-error: string | number is not assignable to string
const narrow: string = wide;
let assigned: string | number = 'x';
const fine: string = assigned;                // OK: TS narrowed `assigned` to string after the assignment
assigned = 5;
const literal: 'GET' = 'GET';
const method: 'GET' | 'POST' = literal; // narrow → wide is fine

type IsStringOnly<T> = [T] extends [string] ? true : false;
const a: IsStringOnly<string> = true;
const b: IsStringOnly<string | number> = false;   // the whole union is not assignable to string
console.log(e, c, ok, missing, impossible, narrow, fine, assigned, method, a, b);
:::

::: code javascript Unions and intersections as sets of values (runnable)
const Status = new Set(['loading', 'success', 'error']);
const Done = new Set(['Done', 'Failed']);
const union = new Set([...Status, ...Done]);
const intersection = [...Status].filter((v) => Done.has(v));
console.log({ union: [...union], intersection });
console.log('Status | Done has 5 values', union.size === 5 ? '✅' : '❌ FAIL');
console.log('Status & Done is empty (never)', intersection.length === 0 ? '✅' : '❌ FAIL');

// "X assignable to Y" = every value of X is also in Y
const assignable = (x, y) => [...x].every((v) => y.has(v));
console.log("'GET' → 'GET' | 'POST'", assignable(new Set(['GET']), new Set(['GET', 'POST'])) ? '✅' : '❌ FAIL');
console.log("'a' | 'b' → 'a' is not allowed", !assignable(new Set(['a', 'b']), new Set(['a'])) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `&` to "combine" two string unions (you get `never`; you meant `|`).
- Intersecting object types with conflicting property types (the property becomes `never`).
- Expecting to use a property that only some union members have, without narrowing.
- Thinking `A & B` is "bigger" than `A` (it accepts fewer values, but each value has more properties).
:::

::: understand
- Types are sets of values: `|` = either set, `&` = only the overlap; assignability = subset.
:::

::: ask
- *"Do you want a value that can be either, or one that must be both?"*
:::

::: important ⭐ Say this in the interview
"A union means a value is one of several types, so it's the bigger set and I can only use common members until I narrow. An intersection means the value must satisfy all types at once, the overlap. For object types that looks like a merge because the value needs every property, but for literal types without overlap, like two different string unions, the intersection is never. Assignability is a subset check: a literal fits a union that contains it, but string or number doesn't fit string."
:::

::: links
Handbook: Union types | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types
Handbook: Intersection types | https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types
:::

=== any vs unknown vs never
@p 3
@tags typescript, any, unknown, never
@quick
- **`any`**: switches type checking **off** for that value; it spreads silently. Avoid (lint: `no-explicit-any`).
- **`unknown`**: "could be anything, **check before use**". The safe type for JSON, API responses, `catch (e)` errors.
- **`never`**: a value that can't exist: functions that always throw, impossible union branches, exhaustiveness checks.
- Assignability: everything → `unknown`; `unknown` → only `unknown`/`any`; `never` → everything; nothing → `never`.
- `void` = "returns nothing useful" (different from `never`, which never returns).

::: text 🧒 In simple words
`any` is a **master key** that opens every door, including the ones that lead off a cliff. `unknown` is a **sealed parcel**: you must check what's inside before using it. `never` is an **empty room that can't exist**: if the code ever gets there, something is wrong.
:::

::: text 📖 Detailed answer
| | `any` | `unknown` | `never` |
|---|---|---|---|
| Can hold | anything | anything | nothing |
| Use without checks | ✅ (dangerous) | ❌ must narrow | n/a |
| Assign it to `string` | ✅ | ❌ | ✅ |
| Typical source | old JS, lazy typing | `JSON.parse` result, `fetch().json()`, `catch (e)` | `throw`, infinite loops, exhausted unions |

### Why any is dangerous
`any` is **contagious**: `const data: any = await res.json(); const name = data.user.name;` → `name` is `any` too, and a typo or API change crashes at run time without a single compile error.

### unknown in practice
1. Receive: `const data: unknown = await res.json()`.
2. Validate: a type guard or a schema (`UserSchema.parse(data)`), which returns a properly typed value.
3. Use safely.

With `useUnknownInCatchVariables` (part of `strict`), `catch (e)` gives `e: unknown`: check `e instanceof Error` before reading `e.message`.

### never in practice
- `function fail(msg: string): never { throw new Error(msg) }`.
- Exhaustive switches (`const x: never = value`).
- Filtering in conditional types (`Exclude<T, U>` returns `never` for removed members).
:::

::: diagram Where each type sits
flowchart TD
  U["unknown: top type, accepts everything, safe"] --> S["string, number, User, ..."]
  A["any: escape hatch, opts out of checking"] -.-> S
  S --> N["never: bottom type, no values"]
:::

::: image any vs unknown vs never
/images/typescript/any-unknown-never.svg
:::

::: text 🪜 Step by step
Handling `catch (e)` correctly under `strict`:
1. `try { await save() } catch (e) { … }` → `e` is `unknown` (anything can be thrown, even a string).
2. `e.message` → compile error.
3. `if (e instanceof Error) toast(e.message)` → narrowed to `Error`.
4. `else toast(String(e))` handles non-Error throws.
5. With `any` the code compiles even when `e` is a string, and crashes reading `undefined`.
:::

::: code typescript unknown forces checks, any hides bugs, never marks the impossible
interface User { id: number; name: string }

function isUser(v: unknown): v is User {
  return typeof v === 'object' && v !== null
    && typeof (v as Record<string, unknown>).id === 'number'
    && typeof (v as Record<string, unknown>).name === 'string';
}

async function loadUser(res: Response): Promise<User> {
  const data: unknown = await res.json();
  // @ts-expect-error: 'data' is of type 'unknown'
  data.name;
  if (!isUser(data)) throw new Error('Unexpected API response');
  return data;                                  // narrowed to User
}

function risky(raw: string) {
  const data: any = JSON.parse(raw);
  return data.usr.name.toUpperCase();           // typo 'usr' compiles: any hides it
}

function fail(message: string): never { throw new Error(message); }

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const anything: unknown = 5;
// @ts-expect-error: unknown is not assignable to number
const n: number = anything;
console.log(loadUser, risky, fail, errorMessage(new Error('x')), n);
:::

::: code javascript Why checking unknown data matters (runnable)
const responses = ['{"id":1,"name":"Asha"}', '{"id":"1","name":null}', '"just a string"'];
const isUser = (v) => typeof v === 'object' && v !== null && typeof v.id === 'number' && typeof v.name === 'string';

const results = responses.map((raw) => {
  const data = JSON.parse(raw);                 // in TS: unknown
  return isUser(data) ? `ok: ${data.name}` : 'rejected';
});
console.log(results);
console.log('only valid users pass the guard', results.join() === 'ok: Asha,rejected,rejected' ? '✅' : '❌ FAIL');

// What "any" would do: crash at run time
let crash = '';
try { JSON.parse(responses[1]).name.toUpperCase(); } catch (e) { crash = e.name; }
console.log('unchecked access crashes on bad data', crash === 'TypeError' ? '✅' : '❌ FAIL');

// Anything can be thrown: catch (e) really is unknown
const message = (e) => (e instanceof Error ? e.message : String(e));
let thrown;
try { throw 'plain string'; } catch (e) { thrown = message(e); }
console.log('non-Error throws are handled', thrown === 'plain string' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `as any` to make an error go away.
- Typing API responses as the expected interface without validating (`res.json() as User`).
- Reading `e.message` in `catch` without checking.
- Confusing `void` (returns nothing) with `never` (never returns).
:::

::: understand
- `unknown` is the safe `any`; `never` is the type of "can't happen".
:::

::: ask
- *"Where does this data come from?"* If it crosses a boundary (network, storage, user), start from `unknown`.
:::

::: important ⭐ Say this in the interview
"any turns type checking off and spreads silently, so a typo or API change becomes a runtime crash; I avoid it. unknown also accepts any value but forces me to narrow it before use, so it's the right type for JSON, API responses and caught errors, usually combined with a type guard or a schema validator. never is the bottom type for values that can't exist: functions that always throw and exhaustive switch checks. Everything is assignable to unknown, and never is assignable to everything."
:::

::: links
Handbook: unknown | https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown
Handbook: never | https://www.typescriptlang.org/docs/handbook/2/functions.html#never
:::

=== How do you type functions? (parameters, callbacks, overloads)
@p 2
@tags typescript, functions, overloads, callbacks
@quick
- Annotate **parameters**; the return type is inferred (annotate it for exported/public functions).
- Optional `name?: string`, default `size = 10` (inferred `number`), rest `...ids: number[]`.
- Function types: `type Handler = (e: MouseEvent) => void`; callbacks with fewer parameters are allowed.
- **Overloads**: several signatures + one implementation, when return type depends on the input shape; often a union or generic is simpler.
- `this` parameter: `function onClick(this: HTMLButtonElement, e: MouseEvent)`.

::: text 🧒 In simple words
Typing a function is writing the **instructions on a vending machine**: "insert coins here (parameters), you'll get a snack (return value)". Overloads are a machine with **two slots**: coins give you a snack, a card gives you a receipt, and the label tells you which is which.
:::

::: text 📖 Detailed answer
### Parameters and returns
| Syntax | Meaning |
|---|---|
| `(a: number, b: number): number` | required params, explicit return |
| `(name?: string)` | may be `undefined` |
| `(size = 10)` | default (type inferred) |
| `(...ids: number[])` | rest |
| `(): void` | returns nothing useful |
| `(): Promise<User>` | async functions return promises |

### Function types and callbacks
- `type Fn = (x: number) => string` or call signatures in interfaces: `{ (x: number): string; displayName: string }`.
- Parameter **bivariance**/**fewer params**: passing `(a) => …` where `(a, b) => …` is expected is fine (JS ignores extra args).
- A callback typed to return `void` may return something; the value is ignored (so `forEach(x => arr.push(x))` is OK).

### Overloads
Write the public signatures first, then one implementation signature (not callable directly) that handles all of them. Use overloads when the **return type depends on the argument**; if not, a union parameter is clearer. Generics often replace overloads.
:::

::: diagram Choosing how to type a flexible function
flowchart TD
  Q{"Does the return type depend on the input?"} -->|"no"| U["union parameter: (v: string | string[]) => number"]
  Q -->|"yes, in a simple pattern"| G["generic: <T>(v: T) => T"]
  Q -->|"yes, different shapes"| O["overloads: one signature per shape"]
:::

::: image Typing functions and overloads
/images/typescript/ts-functions.svg
:::

::: text 🪜 Step by step
`parse('5')` and `parse(['1', '2'])` with two overload signatures:
1. TS checks the call against the overloads **top to bottom**.
2. `parse('5')` matches `(v: string): number` → result typed `number`.
3. `parse(['1','2'])` matches `(v: string[]): number[]` → `number[]`.
4. `parse(5)` matches none → error listing the overloads.
5. The implementation signature (`v: string | string[]`) is hidden from callers.
:::

::: code typescript Parameters, function types, overloads and this
function greet(name: string, title?: string, ...tags: string[]): string {
  return [title, name, ...tags].filter(Boolean).join(' ');
}

type Comparator<T> = (a: T, b: T) => number;
const byAge: Comparator<{ age: number }> = (a, b) => a.age - b.age;

function parse(v: string): number;
function parse(v: string[]): number[];
function parse(v: string | string[]): number | number[] {
  return Array.isArray(v) ? v.map(Number) : Number(v);
}
const one = parse('5');               // number
const many = parse(['1', '2']);       // number[]
// @ts-expect-error: no overload matches a number
parse(5);

// void callbacks may return values (ignored)
const list: number[] = [];
[1, 2].forEach((x) => list.push(x));

// a callback with fewer parameters is fine
const doubled = [1, 2, 3].map((x) => x * 2);

interface Counter { (step?: number): number; reset(): void }
function makeCounter(): Counter {
  let n = 0;
  const c = ((step = 1) => (n += step)) as Counter;
  c.reset = () => { n = 0; };
  return c;
}

function onClick(this: { label: string }, times: number) { return `${this.label} x${times}`; }
const result = onClick.call({ label: 'Save' }, 2);
console.log(greet('Asha', 'Dr'), [{ age: 3 }, { age: 1 }].sort(byAge), one, many, doubled, makeCounter()(), result);
:::

::: warning ⚠️ Common mistakes
- Leaving parameters untyped (implicit `any`).
- Writing overloads where a union or generic would do.
- Typing callbacks as `Function` (accepts anything, returns `any`).
- Forgetting `Promise<T>` on exported async function return types.
:::

::: understand
- Contracts live at the function boundary: parameters in, return type out.
:::

::: ask
- *"Is this function public (exported, library) or internal?"* Public ones get explicit return types.
:::

::: important ⭐ Say this in the interview
"I always annotate parameters, since TypeScript can't infer them, and usually let it infer the return type except for exported functions where an explicit return type documents the contract. Optional, default and rest parameters work like JavaScript with types attached, and callbacks are typed with function types; callbacks may take fewer parameters, and a void return type just means the result is ignored. Overloads are for when the return type depends on the argument shape, but a union or a generic is often simpler."
:::

::: links
Handbook: More on functions | https://www.typescriptlang.org/docs/handbook/2/functions.html
:::

=== Enums vs union literal types (and as const)
@p 2
@tags typescript, enums, unions, as-const
@quick
- `enum Role { Admin = 'ADMIN' }` creates a **runtime object** (numeric enums also add a reverse mapping).
- A **union of literals** `'ADMIN' | 'USER'` has **zero runtime cost** and accepts plain strings.
- Get both a list and a type from one source: `const ROLES = ['ADMIN', 'USER'] as const; type Role = (typeof ROLES)[number]`.
- Enums aren't supported by "erasable syntax" tools (Node type stripping, `erasableSyntaxOnly`); unions are. Same for `namespace` and constructor parameter properties (`constructor(public id: number)`): Node 22 throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
- Many teams prefer unions; enums are fine if you need a named runtime object (or `const enum` with care).

::: text 🧒 In simple words
An enum is a **printed menu card** that exists in the restaurant (at run time). A union type is the **chef's memory** of which dishes exist: it guides you while ordering but leaves nothing behind. If you also want a printed list, write the list once and derive the type from it.
:::

::: text 📖 Detailed answer
| | `enum` | union + `as const` |
|---|---|---|
| Runtime object | ✅ always (numeric: reverse map `Role[0] === 'Admin'`) | only the array/object you write |
| Accepts plain string `'ADMIN'` | ❌ (must use `Role.Admin` for string enums) | ✅ |
| Works with type-stripping (Node, `erasableSyntaxOnly`) | ❌ | ✅ |
| Iterate values | `Object.values(Role)` (numeric enums include names too!) | `ROLES` array |
| Bundle size | extra code | none |

### Numeric enum gotchas
`enum Dir { Up, Down }` → `Dir.Up === 0`; any number is assignable in older TS versions, and `Object.values(Dir)` returns `['Up', 'Down', 0, 1]` because of the reverse mapping.

### Recommended pattern
`const STATUS = { Draft: 'draft', Published: 'published' } as const;`  
`type Status = (typeof STATUS)[keyof typeof STATUS];   // 'draft' | 'published'`
Named constants for code, plain strings in JSON, one source of truth.
:::

::: diagram From one constant to a type
flowchart LR
  A["const ROLES = ['ADMIN', 'USER'] as const"] --> B["typeof ROLES: readonly ['ADMIN', 'USER']"]
  B --> C["(typeof ROLES)[number]"]
  C --> D["type Role = 'ADMIN' | 'USER'"]
  A --> E["runtime: ROLES.map(...) for dropdowns"]
:::

::: image Enums vs union literal types
/images/typescript/enum-vs-union.svg
:::

::: text 🪜 Step by step
`(typeof ROLES)[number]` explained:
1. `as const` makes `ROLES` a **readonly tuple** of literals: `readonly ['ADMIN', 'USER']`.
2. `typeof ROLES` gets that type from the value.
3. Indexing a tuple type with `number` gives the union of its element types.
4. Result: `'ADMIN' | 'USER'`.
5. Add `'GUEST'` to the array and the type updates automatically.
:::

::: code typescript enum vs union vs as-const object
enum Direction { Up, Down }                       // numeric enum
enum Role { Admin = 'ADMIN', User = 'USER' }      // string enum

const ROLES = ['ADMIN', 'USER'] as const;
type RoleName = (typeof ROLES)[number];           // 'ADMIN' | 'USER'

const STATUS = { Draft: 'draft', Published: 'published' } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];   // 'draft' | 'published'

function canEdit(role: Role) { return role === Role.Admin; }
canEdit(Role.Admin);
// @ts-expect-error: a plain string is not accepted by a string enum
canEdit('ADMIN');

function canPublish(role: RoleName) { return role === 'ADMIN'; }
canPublish('ADMIN');                              // plain strings work
// @ts-expect-error: not a valid role
canPublish('OWNER');

const s: Status = STATUS.Published;
const options = ROLES.map((r) => ({ value: r, label: r.toLowerCase() }));
console.log(Direction.Down, s, options);
:::

::: code javascript What an enum compiles to (runnable)
// TypeScript emits this for: enum Direction { Up, Down }
var Direction;
(function (Direction) {
  Direction[Direction['Up'] = 0] = 'Up';
  Direction[Direction['Down'] = 1] = 'Down';
})(Direction || (Direction = {}));

console.log(Direction);
console.log('numeric enums have a reverse mapping', Direction.Up === 0 && Direction[0] === 'Up' ? '✅' : '❌ FAIL');
console.log('Object.values includes names AND numbers', JSON.stringify(Object.values(Direction)) === '["Up","Down",0,1]' ? '✅' : '❌ FAIL');

// The union alternative leaves only the array you wrote
const ROLES = Object.freeze(['ADMIN', 'USER']);
console.log('as const array: just data, easy to iterate', ROLES.length === 2 && ROLES.includes('ADMIN') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Numeric enums in APIs/JSON (numbers lose meaning; any number may slip in).
- `Object.values` on numeric enums (gets names and numbers).
- `const enum` in libraries or with isolated transpilers (inlining breaks across modules).
- Duplicating the list of values in a type and in an array.
:::

::: understand
- Unions are types only; enums are values plus types. Derive types from `as const` data for one source of truth.
:::

::: ask
- *"Does the code base run TS via type stripping (Node, erasableSyntaxOnly)?"* Then avoid enums.
:::

::: important ⭐ Say this in the interview
"An enum is both a type and a runtime object, and numeric enums even add a reverse mapping, which surprises people when they iterate them. A union of string literals is type-only, has no runtime cost and accepts plain strings from JSON. When I need both a list at run time and a type, I write an as-const array or object and derive the union with typeof, so there's one source of truth. Enums also aren't supported by type-stripping tools like Node's, so I generally prefer unions."
:::

::: links
Handbook: Enums | https://www.typescriptlang.org/docs/handbook/enums.html
TS 5.8: --erasableSyntaxOnly | https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
:::

=== What does tsconfig.json do, and what does strict mode enable?
@p 2
@tags typescript, tsconfig, strict, tooling
@quick
- `tsconfig.json` tells `tsc` and your editor **which files** to check and **which rules** to apply.
- `strict: true` enables: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables`.
- Extra safety (opt-in): `noUncheckedIndexedAccess` (`arr[i]` may be `undefined`), `exactOptionalPropertyTypes`, `noImplicitOverride`.
- With bundlers: `noEmit`, `moduleResolution: "bundler"`, `isolatedModules`/`verbatimModuleSyntax`, `jsx: "react-jsx"`.
- Migrating JS: `allowJs` + `checkJs`, fix file by file; never turn strict off to "make it compile".

::: text 🧒 In simple words
`tsconfig.json` is the **settings page of the spell-checker**: which documents to check and how strict to be. `strict: true` is "check everything carefully" mode; turning it off is like ignoring red underlines because they're annoying.
:::

::: text 📖 Detailed answer
### The flags that change your daily life
| Flag | Effect |
|---|---|
| `strictNullChecks` | `null`/`undefined` aren't in every type: `string` can't be `null` unless you say `string \| null` |
| `noImplicitAny` | untyped parameters are errors |
| `strictFunctionTypes` | callback parameter types are checked safely |
| `strictPropertyInitialization` | class fields must be initialised |
| `useUnknownInCatchVariables` | `catch (e)` → `unknown` |
| `noUncheckedIndexedAccess` | `obj[key]`, `arr[i]` include `undefined` (great for dictionaries) |
| `exactOptionalPropertyTypes` | `x?: T` can't be explicitly set to `undefined` |

### A modern app config (Vite / Next.js)
`{ "compilerOptions": { "target": "ES2022", "lib": ["ES2023", "DOM", "DOM.Iterable"], "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "noUncheckedIndexedAccess": true, "isolatedModules": true, "noEmit": true, "skipLibCheck": true, "paths": { "@/*": ["./src/*"] } }, "include": ["src"] }`
- `noEmit`: the bundler produces JS; `tsc` only checks.
- `isolatedModules`: each file must be compilable alone (what esbuild/swc do).
- `skipLibCheck`: don't type-check `node_modules` `.d.ts` files (faster).
- `paths`: import aliases (the bundler must know them too).

### Project references and monorepos
`references` + `composite` split big repos into separately-built projects; `tsc -b` builds them incrementally.
:::

::: diagram How tsconfig is used
flowchart LR
  CFG["tsconfig.json"] --> ED["editor: errors and autocomplete"]
  CFG --> TSC["tsc --noEmit in CI"]
  CFG --> B["bundler reads paths, jsx, target"]
  TSC -->|"errors"| FAIL["build fails"]
:::

::: image tsconfig.json: the flags that matter
/images/typescript/tsconfig.svg
:::

::: text 🪜 Step by step
Turning on `noUncheckedIndexedAccess` in an existing app:
1. `const user = usersById[id]` changes from `User` to `User | undefined`.
2. Every place that used `user.name` directly now errors.
3. Each error is a real question: "what if the id isn't in the map?"
4. Fix with `if (!user) return notFound()` or `usersById[id] ?? fallback`.
5. Result: a whole class of "Cannot read properties of undefined" crashes disappears.
:::

::: code typescript What strict flags catch
// strictNullChecks
function len(s: string | null) {
  // @ts-expect-error: 's' is possibly 'null'
  return s.length;
}

// noImplicitAny
// @ts-expect-error: Parameter 'x' implicitly has an 'any' type
function double(x) { return x * 2; }

// strictPropertyInitialization
class Account {
  // @ts-expect-error: Property 'owner' has no initializer
  owner: string;
  balance = 0;
}

// useUnknownInCatchVariables
try { JSON.parse('{'); } catch (e) {
  // @ts-expect-error: 'e' is of type 'unknown'
  console.log(e.message);
}

// Index access without noUncheckedIndexedAccess is typed as always present:
const byId: Record<string, { name: string }> = {};
const maybe = byId['missing'];          // typed { name: string } here, but undefined at run time
const safe = byId['missing'] ?? { name: 'Unknown' };
console.log(len, double, new Account(), maybe, safe);
:::

::: warning ⚠️ Common mistakes
- Starting new projects without `strict`.
- Relying on Vite/Next dev server to show type errors (they don't block by default); add `tsc --noEmit` to CI.
- `skipLibCheck: false` in apps (slow, errors in libraries you can't fix).
- Path aliases in tsconfig but not in the bundler (works in the editor, fails at build).
:::

::: understand
- Strict mode is the point of TypeScript; tsconfig decides where and how hard to check.
:::

::: ask
- *"Is type-checking part of CI, and which strict flags are on?"*
:::

::: important ⭐ Say this in the interview
"tsconfig tells the compiler and editor which files to check and which rules apply. I always enable strict, which includes strictNullChecks, noImplicitAny, strict function types and unknown in catch clauses, and for apps I like noUncheckedIndexedAccess so dictionary and array lookups include undefined. With a bundler I set noEmit, moduleResolution bundler and isolatedModules, because the bundler transpiles and tsc only checks, and that check runs in CI. For JavaScript migrations I use allowJs and checkJs and tighten file by file."
:::

::: links
TSConfig reference | https://www.typescriptlang.org/tsconfig/
TSConfig: strict | https://www.typescriptlang.org/tsconfig/#strict
:::
