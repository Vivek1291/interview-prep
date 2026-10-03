@section React Performance
@icon ⚡
@color #06b6d4
@desc Why components re-render, React.memo and the memo chain, state colocation, code splitting, virtualization and profiling: measure first, then fix. Numbers measured with React 19.3 and this app's own production build.

=== What causes a component to re-render, and how do you stop unnecessary ones?
@p 3
@tags react, performance, re-render, children-prop
@quick
- A component re-renders when **its state** changes, **its parent** re-renders, a **context** it reads changes, or a hook it uses (an external store) changes.
- "Props changed" is not the trigger: by default children re-render **whenever the parent renders**, even with identical props.
- Cheap fixes first: move state **down** (colocation), pass components as **children**, split contexts; then `React.memo`.
- Measured: counter +1 above a 100-item list → **101** renders with the list inside, **1** with the list passed as `children`.
- A re-render is not a DOM update: React still diffs, and only changed nodes are committed.

::: text 🧒 In simple words
When a manager (parent) changes their plan, by default **every person in their team** re-reads the plan, even people whose task didn't change. That's usually fine: reading is fast. It becomes a problem when the team has **thousands** of people or each one reads slowly. Then you either move the planning **closer to the people it affects** (colocation), or give a few people a note: "only re-read if *your* part changed" (`React.memo`).
:::

::: text 📖 Detailed answer
### The four triggers
| Trigger | Example |
|---|---|
| Own state changes | `setOpen(true)`, `dispatch(...)` |
| Parent re-renders | the page's counter changes → every child rendered by the page runs again |
| Context value changes | the theme provider's value changes → every consumer re-renders |
| External store / hook | `useSyncExternalStore` (Redux, Zustand) reports a new snapshot |

### Re-render ≠ slow
React re-renders are usually cheap (calling functions, comparing objects). They matter when a component is **expensive** (big lists, charts, heavy calculations) or when they happen **very often** (every keystroke, scroll, animation frame).

### Fix order (cheapest first)
1. **Measure** with the React DevTools Profiler; don't guess.
2. **Colocate state**: move it into the smallest component that needs it.
3. **Lift content up**: pass expensive subtrees as `children` (or other props) from a component that doesn't re-render. React reuses those element objects and skips them.
4. **Split contexts** by update frequency; memoize provider values.
5. `React.memo` + stable props (`useMemo`/`useCallback`) for expensive children; or turn on the **React Compiler**.
6. For huge lists: **virtualize**. For non-urgent updates: **transitions** / `useDeferredValue`.
:::

::: diagram Why a child re-rendered
flowchart TD
  A["Component renders"] --> Q1{"Its own state changed?"}
  Q1 -->|"yes"| R["Re-render"]
  Q1 -->|"no"| Q2{"Parent rendered it again?"}
  Q2 -->|"yes"| M{"Wrapped in memo and props shallow-equal?"}
  M -->|"no"| R
  M -->|"yes"| S["Skipped"]
  Q2 -->|"no"| Q3{"Context or store it reads changed?"}
  Q3 -->|"yes"| R
  Q3 -->|"no"| S
:::

::: image What makes a component re-render, and the children-as-props trick (measured: 101 vs 1)
/images/react/rerender-causes.svg
:::

::: chart bar Measured: components re-rendered when a counter increments above a 100-item list (React 19.3)
Structure,Components re-rendered
List rendered inside the counter component,101
List passed in as children,1
:::

::: text 🪜 Step by step
Why passing `children` helps:
1. `Page` renders `<Counter><List /></Counter>`. The `<List />` element object is created **by Page**.
2. Clicking the counter changes **Counter's** state; React re-renders `Counter` only.
3. `Counter` returns `<div>{n}{children}</div>`. `children` is the **same element object** Page created earlier (Page didn't re-render).
4. React sees the same element reference for `List` → it skips rendering `List` and its 100 items.
5. If `List` were written *inside* `Counter` (`<List />` in Counter's JSX), a new element would be created on every Counter render → List re-renders.
:::

::: code jsx Children as props: the free optimization
import { useState } from 'react';

// ❌ ExpensiveTree re-renders on every mouse move
function PageSlow() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div onPointerMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      <Cursor pos={pos} />
      <ExpensiveTree />
    </div>
  );
}

// ✅ the component with fast-changing state wraps the expensive part, which is created outside it
function PointerTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div onPointerMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      <Cursor pos={pos} />
      {children}                               {/* same element object every time → skipped */}
    </div>
  );
}

function PageFast() {
  return (
    <PointerTracker>
      <ExpensiveTree />
    </PointerTracker>
  );
}
:::

::: warning ⚠️ Common mistakes
- Trying to stop all re-renders: most are harmless; optimize only what the profiler shows is slow.
- Believing a component only re-renders when its props change (that's only true with `memo`).
- Putting fast-changing state (mouse position, input text) in a high-level component or a wide context.
- Creating components inside components (a new type each render → remount, not just re-render).
:::

::: understand
- Default rule: **parent renders → children render**. Everything else is an optimization on top.
- Element identity is the key: same element object or memo + equal props → React can skip.
- Re-render cost = render work; DOM cost happens only for real changes.
:::

::: ask
- *"What is actually slow?"* Typing lag, slow navigation, janky scrolling: each has a different fix.
- *"Is the React Compiler enabled?"* It removes most manual memoization work.
:::

::: important ⭐ Say this in the interview
"A component re-renders when its own state changes, when its parent re-renders, when a context it reads changes, or when an external store it subscribes to changes. By default children re-render with their parent even if props are identical, so I first measure with the Profiler, then fix structurally: move state down to where it's used, pass expensive subtrees as children so they're created by a component that doesn't re-render, and split contexts. In my measurement, passing a 100-item list as children reduced re-renders from 101 to 1. Only then do I add React.memo with stable props, or rely on the React Compiler."
:::

::: links
react.dev: Render and commit | https://react.dev/learn/render-and-commit
react.dev: memo (when to skip re-rendering) | https://react.dev/reference/react/memo
Dan Abramov: Before you memo() | https://overreacted.io/before-you-memo/
:::

=== How do React.memo, useMemo and useCallback work together?
@p 3
@tags react, performance, memo, useCallback
@quick
- `React.memo(Component)` skips re-rendering when **every prop is `Object.is`-equal** to last time (shallow compare).
- Inline objects/arrays/functions (`style={{…}}`, `onClick={() => …}`) are **new every render** → memo never skips.
- So memo needs a **chain**: `memo` on the child + `useMemo`/`useCallback` for its object/function props.
- Measured (100 children): no memo **100** renders, memo + inline props **100**, memo + stable props **0**.
- A custom compare function `memo(C, areEqual)` exists, but it's easy to get wrong; React Compiler automates the chain.

::: text 🧒 In simple words
`React.memo` is a **bouncer** who checks your ticket: "same ticket as last time? then no need to come in". But if the parent prints a **brand-new ticket every time** (an inline object or function), the bouncer sees a different ticket even though it says the same thing, and lets everyone in. `useMemo` and `useCallback` make sure the parent hands over the **same ticket**.
:::

::: text 📖 Detailed answer
### What memo compares
`memo` compares old and new props **one by one with `Object.is`**:
- primitives (`'a'`, `3`, `true`): compared by value → equal if unchanged,
- objects, arrays, functions: compared by **reference** → equal only if it's the **same** object.

### The chain
| Prop passed | Without memoization in the parent | With memoization |
|---|---|---|
| `items={data}` (state) | same reference until data changes ✅ | ✅ |
| `style={{ color: 'red' }}` | new object every render ❌ | `useMemo(() => ({ color: 'red' }), [])` or a constant outside the component ✅ |
| `onSelect={(id) => setSel(id)}` | new function every render ❌ | `useCallback((id) => setSel(id), [])` ✅ |
| `children={<Icon />}` | new element every render ❌ | memoize the element, or don't memo components that take children |

### When memo is worth it
- The child is **expensive** to render (big list, chart, rich editor), **and**
- the parent re-renders **often** with props that are usually the same.
Otherwise memo just adds comparison work.

### React Compiler
With React Compiler 1.0, components and hooks are memoized at build time, including the props you pass down, so the chain happens automatically. Manual `memo`/`useMemo`/`useCallback` remain escape hatches.
:::

::: diagram The memo chain
flowchart LR
  P["Parent re-renders"] --> U["useMemo / useCallback keep prop references stable"]
  U --> C{"memo(Child): every prop Object.is-equal?"}
  C -->|"yes"| S["Child skipped"]
  C -->|"no: a new object or function"| R["Child re-renders"]
:::

::: image React.memo only skips renders when props are stable (measured: 100 / 100 / 0)
/images/react/memo-chain.svg
:::

::: chart bar Measured: child re-renders when the parent's state changes, 100 children (React 19.3)
Setup,Child re-renders
No memo,100
memo + inline object/function props,100
memo + useMemo/useCallback props,0
:::

::: text 🪜 Step by step
`<Row item={item} style={{ color: 'red' }} onPick={() => select(item.id)} />` inside `memo(Row)`:
1. The parent re-renders (its search text changed).
2. React builds a new props object for each Row: `item` is the same reference (from state), but `style` and `onPick` are **new**.
3. `memo` compares: `item` equal, `style` **not** equal → re-render. Memo wasted its comparison.
4. Fix: hoist the constant style outside the component, and pass `onPick={select}` (a `useCallback`) plus `id={item.id}`, letting Row call `onPick(id)`.
5. Now all props are equal → every Row is skipped; only rows whose `item` changed re-render.
:::

::: code jsx A list row that memo can actually skip
import { memo, useCallback, useState } from 'react';

const rowStyle = { padding: 8 };                                 // constant: same reference forever

const Row = memo(function Row({ item, selected, onSelect }) {
  return (
    <li style={rowStyle} aria-selected={selected} onClick={() => onSelect(item.id)}>
      {item.name}
    </li>
  );
});

export function List({ items }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('');
  const onSelect = useCallback((id) => setSelectedId(id), []);    // stable function
  return (
    <>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul>
        {items.map((item) => (
          // only 2 rows re-render when the selection changes; typing in the filter re-renders none
          <Row key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
        ))}
      </ul>
    </>
  );
}
:::

::: code javascript Browser demo: shallow comparison like React.memo (runnable)
// React.memo compares each prop with Object.is.
const shallowEqual = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.is(a[k], b[k]));

const item = { id: 1, name: 'Mug' };
const select = () => {};
const style = { color: 'red' };

const inlineRender1 = { item, style: { color: 'red' }, onSelect: () => {} };
const inlineRender2 = { item, style: { color: 'red' }, onSelect: () => {} };   // new objects each render
const stableRender1 = { item, style, onSelect: select };
const stableRender2 = { item, style, onSelect: select };                        // same references

console.log('inline props equal?', shallowEqual(inlineRender1, inlineRender2));
console.log('stable props equal?', shallowEqual(stableRender1, stableRender2));
console.log('inline object/function props defeat memo', !shallowEqual(inlineRender1, inlineRender2) ? '✅' : '❌ FAIL');
console.log('stable references let memo skip', shallowEqual(stableRender1, stableRender2) ? '✅' : '❌ FAIL');
console.log('primitives compare by value', shallowEqual({ n: 3, s: 'a' }, { n: 3, s: 'a' }) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `memo` on a component that receives `children` JSX: children is a new element each render, so memo never skips.
- `useCallback` without `memo` on the child: the stable function changes nothing.
- A `useCallback` whose deps change every render (an inline object in deps).
- A custom `areEqual` that ignores a prop: the component shows stale data.
- Memoizing everything; check the profiler first.
:::

::: understand
- Memo is only as good as the **least stable prop**.
- `useMemo`/`useCallback` exist mostly to feed memoized children and effect deps.
- The compiler makes the chain automatic; the reasoning still matters in reviews and interviews.
:::

::: ask
- *"Is the child actually expensive, and does the parent re-render often?"*
- *"React Compiler enabled?"* Then avoid adding manual memo noise.
:::

::: important ⭐ Say this in the interview
"React.memo skips a child's render when all its props are equal with Object.is, which is a shallow comparison. Because inline objects and functions are recreated on every render, memo alone often does nothing: the parent has to pass stable references, with useMemo for objects and useCallback for functions, or constants defined outside the component. In my measurement with 100 children, memo with inline props still re-rendered all 100, while memo with stable props re-rendered none. I only build this chain for children that are expensive and often re-rendered, and React Compiler now does it automatically."
:::

::: links
react.dev: memo | https://react.dev/reference/react/memo
react.dev: useCallback (skipping re-renders) | https://react.dev/reference/react/useCallback#skipping-re-rendering-of-components
react.dev: React Compiler | https://react.dev/learn/react-compiler
:::

=== What is state colocation, and how does it improve performance?
@p 2
@tags react, performance, state, colocation
@quick
- **Colocation** = keep state in the **lowest** component that needs it; lift it only when siblings must share it.
- State placed too high re-renders everything below it on every change.
- Measured: 10 keystrokes in a search box → **1,000** ProductCard renders with state in the page, **0** with state inside `SearchBox`.
- Share results via the URL (search params), a store with selectors, or a callback on submit, not by lifting the keystrokes.
- Same idea for context: fast-changing values in their own small provider.

::: text 🧒 In simple words
If you keep your **pencil** in the family's shared drawer, everyone has to stop and check the drawer every time you sharpen it. Keep the pencil **in your own pocket**; only put things in the shared drawer when other people actually need them.
:::

::: text 📖 Detailed answer
State causes re-renders of the component that owns it **and its subtree**. So *where* state lives decides *how much* re-renders.

| Situation | Where the state should live |
|---|---|
| Text being typed in an input | the input's component (or uncontrolled) |
| Open/closed state of one dropdown | the dropdown |
| Selected tab shared by tabs and panel | their closest common parent |
| Search query that filters a server list | the URL (`?q=`) → shareable, survives reload |
| Data used across distant screens | a store (Zustand/Redux) or server cache |

### Typical refactor
1. Find the state that changes often (keystrokes, hover, timers).
2. Check which components **read** it.
3. Move it down into a new small component that wraps only those readers.
4. Communicate outward with an event (`onSearch(q)` on submit or debounced), not by lifting every keystroke.

Colocation also improves **readability**: state sits next to the code that uses it, and deleting a component deletes its state.
:::

::: diagram Moving fast-changing state down
flowchart TD
  subgraph BEFORE["Before: query in the page"]
    P1["ProductsPage (query)"] --> S1["SearchBox"]
    P1 --> L1["100 ProductCards re-render per key"]
  end
  subgraph AFTER["After: query in SearchBox"]
    P2["ProductsPage"] --> S2["SearchBox (query)"]
    P2 --> L2["100 ProductCards untouched"]
  end
:::

::: image State colocation: keep state where it is used (measured: 1,000 vs 0 card renders)
/images/react/colocation.svg
:::

::: chart bar Measured: ProductCard renders during 10 keystrokes, 100 cards (React 19.3)
Where the query state lives,ProductCard renders
ProductsPage (lifted),1000
SearchBox (colocated),0
:::

::: text 🪜 Step by step
1. Profiling shows typing in the search box takes 40 ms per key: all 100 cards re-render.
2. The cards don't need the half-typed text; they need the **submitted** (or debounced) query.
3. Move `const [text, setText] = useState('')` into `SearchBox`.
4. `SearchBox` calls `onSearch(text)` on submit (or after a 300 ms debounce); the page stores **that** in the URL with `setSearchParams({ q })`.
5. Typing now re-renders only `SearchBox`; the list updates once per search.
:::

::: code jsx Colocated input state, results in the URL
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

function ProductsPage({ products }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';                          // shareable, survives reload
  const visible = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <SearchBox initial={q} onSearch={(next) => setParams(next ? { q: next } : {})} />
      {visible.map((p) => <ProductCard key={p.id} product={p} />)}
    </>
  );
}

function SearchBox({ initial, onSearch }) {
  const [text, setText] = useState(initial);               // keystrokes stay here
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()); }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search products" />
      <button>Search</button>
    </form>
  );
}
:::

::: warning ⚠️ Common mistakes
- Lifting all state to the top "in case we need it later".
- Global stores for local UI state (a modal's open flag in Redux).
- Syncing the same value in two places instead of choosing one owner.
- Putting input text in a wide context so every consumer re-renders per keystroke.
:::

::: understand
- Ownership decides blast radius: the higher the state, the more re-renders.
- The URL is underrated state storage: shareable, bookmarkable, back-button friendly.
:::

::: ask
- *"Should the search be shareable/bookmarkable?"* → URL.
- *"Do other screens need it?"* → store or server cache; otherwise keep it local.
:::

::: important ⭐ Say this in the interview
"State colocation means keeping state in the lowest component that needs it and lifting it only when siblings genuinely share it. Since a state change re-renders the owner and its whole subtree, fast-changing state placed too high is the most common performance problem I see. In my measurement, ten keystrokes caused a thousand product-card renders with the query in the page, and zero after moving the input state into the search box and sending only the submitted query up, into the URL. It also makes the code easier to read and delete."
:::

::: links
Kent C. Dodds: State colocation will make your React app faster | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
react.dev: Choosing the state structure | https://react.dev/learn/choosing-the-state-structure
:::

=== Code splitting with React.lazy and Suspense
@p 3
@tags react, performance, code-splitting, lazy, suspense
@quick
- **Code splitting** = ship JavaScript in several chunks and download each **when it's needed**.
- `const Page = lazy(() => import('./Page'))` + `<Suspense fallback={<Spinner />}>` shows a fallback while the chunk loads.
- Split by **route** first, then by heavy, rarely used **features** (editors, charts, maps, admin).
- Measured (this app's build): **1,325 KB** of gzipped JS in 69 files, but the first load downloads only **109 KB**.
- Preload likely-next chunks on hover/idle (`import()` early) so navigation doesn't show a spinner.

::: text 🧒 In simple words
Don't carry the **whole library** to read one book. Code splitting lets the browser download the book (chunk) for the page you're on, and fetch others only when you walk to that shelf. The Suspense fallback is the "fetching your book…" sign while you wait.
:::

::: text 📖 Detailed answer
Bundlers (Vite, webpack, Next.js) create a **separate chunk for every dynamic `import()`**. React adds two pieces:
- **`React.lazy(loader)`**: a component that calls `loader()` the first time it renders and **suspends** until the module resolves.
- **`<Suspense fallback>`**: shows the fallback for any lazy (or otherwise suspending) component inside it.

### What to split
| Split | Example | Benefit |
|---|---|---|
| Routes | `/settings`, `/admin`, `/reports` | users download only the pages they visit |
| Heavy features | rich-text editor, charts, maps, PDF viewer | the main chunk stays small |
| Rarely used UI | modals, wizards, "export" dialogs | loaded on demand |
| Big libraries | Mermaid, Monaco, date libraries | loaded only where used |

### Good practice
- Put `<Suspense>` boundaries at **layout level** so the shell (nav, sidebar) stays visible.
- **Preload**: call the same `import()` on link hover or when the browser is idle, so the chunk is cached before the click.
- Wrap lazy areas with an **error boundary**: a network failure while loading a chunk should show a retry, not a blank page.
- Frameworks (Next.js) split routes automatically; you still split heavy components with `next/dynamic` or `lazy`.
:::

::: diagram Loading a lazy route
sequenceDiagram
  participant U as User
  participant R as React
  participant N as Network
  U->>R: navigate to /settings
  R->>N: import("./SettingsPage") (chunk)
  R-->>U: Suspense fallback (spinner)
  N-->>R: chunk loaded
  R-->>U: SettingsPage rendered
:::

::: image Code splitting in this app: 109 KB first load instead of 1,325 KB
/images/react/code-splitting.svg
:::

::: chart bar Measured: gzipped JavaScript in this app's production build (Vite), KB
Download,KB (gzip)
Everything (69 chunks),1325
First load: main chunk,109
Editor + code blocks (lazy),150
Mermaid core (lazy),161
Charts (lazy),103
:::

::: text 🪜 Step by step
How this app loads a question page:
1. The browser downloads `index.js` (109 KB gzipped): React, router, sidebar, top bar.
2. You click a question: the router renders `QuestionPage`, which is `lazy(() => import('./pages/QuestionPage'))`.
3. React suspends; the nearest `<Suspense>` (inside the layout) shows a skeleton while the sidebar stays visible.
4. The chunk with the block renderers arrives; React renders the page.
5. Only if the page contains a diagram does the Mermaid chunk (161 KB+) load; a page without diagrams never downloads it.
:::

::: code jsx Route-level and feature-level splitting with preloading
import { lazy, Suspense, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const loadSettings = () => import('./pages/Settings');           // keep the loader to preload it
const Settings = lazy(loadSettings);
const RichEditor = lazy(() => import('./components/RichEditor')); // heavy, only for editors

export function App() {
  return (
    <Layout>
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/settings" onMouseEnter={loadSettings} onFocus={loadSettings}>Settings</Link>  {/* preload on intent */}
      </nav>
      <ErrorBoundary fallback={<p>Couldn't load this page. <button onClick={() => location.reload()}>Retry</button></p>}>
        <Suspense fallback={<PageSkeleton />}>                   {/* the layout stays visible */}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

function CommentBox() {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <Suspense fallback={<p>Loading editor…</p>}>
      <RichEditor />
    </Suspense>
  ) : (
    <button onClick={() => setEditing(true)}>Write a comment</button>
  );
}
:::

::: warning ⚠️ Common mistakes
- Calling `lazy()` **inside** a component: a new lazy type every render → remount and re-download.
- One `<Suspense>` at the very top: the whole app (nav included) flashes a spinner on every navigation.
- No error boundary: a failed chunk download (after a deploy) leaves a blank screen.
- Splitting tiny components: more requests, no gain.
- Lazy-loading what's visible on the first screen: it delays the most important content.
:::

::: understand
- First load cost = what's in the **main chunk**; keep it to what the first screen needs.
- Suspense turns "the code isn't here yet" into a declarative loading state.
- Preloading hides chunk latency; error boundaries handle chunk failures.
:::

::: ask
- *"Which routes do most users visit first?"* Keep those in the main path; split the rest.
- *"What's the target device/network?"* Mid-range phones on 4G feel every 100 KB.
- *"Framework or SPA?"* Next.js splits routes for you; you still split heavy widgets.
:::

::: important ⭐ Say this in the interview
"Code splitting means the bundler emits separate chunks for dynamic imports, and React.lazy with Suspense renders a fallback while a chunk downloads. I split by route first, then heavy, rarely used features like editors, charts and diagram libraries, and place Suspense boundaries at layout level so navigation keeps the shell visible. I preload likely chunks on hover and wrap lazy areas in error boundaries for failed downloads. In this app the build contains 1.3 MB of gzipped JavaScript, but the first load downloads only 109 KB."
:::

::: links
react.dev: lazy | https://react.dev/reference/react/lazy
react.dev: Suspense | https://react.dev/reference/react/Suspense
web.dev: Reduce JavaScript payloads with code splitting | https://web.dev/articles/reduce-javascript-payloads-with-code-splitting
Vite: Dynamic import | https://vite.dev/guide/features#dynamic-import
:::

=== How do you render a list of 10,000 items efficiently? (virtualization)
@p 3
@tags react, performance, virtualization, lists
@quick
- **Virtualization (windowing)**: render only the rows inside the viewport (+ a small overscan), with a spacer that keeps the full scroll height.
- Measured (10,000 rows): full list **30,001** DOM elements / **241 ms** to mount; windowed **77** elements / **1.5 ms**.
- Libraries: **TanStack Virtual** (headless, dynamic sizes), **react-window** (small, simple).
- Alternatives: **pagination**, **infinite scroll** with a cap, `content-visibility: auto` (CSS) for long pages.
- Costs: in-page search (Ctrl+F) only sees rendered rows; dynamic row heights need measuring; accessibility needs care.

::: text 🧒 In simple words
A train window shows only a few metres of landscape at a time, but the landscape is hundreds of kilometres long. Virtualization paints **only what's outside the window right now**; as you scroll, it repaints the window with the next part. You still feel the whole length (the scrollbar), but the painter never paints more than one window.
:::

::: text 📖 Detailed answer
Rendering 10,000 rows means 10,000 components, tens of thousands of DOM nodes, slow mounting, high memory and slow re-renders. Users see maybe 20 rows at a time.

### How windowing works
1. A scroll container with a fixed height (e.g. 600 px) and an inner **spacer** of `itemCount × rowHeight` px (so the scrollbar is right).
2. On scroll, compute `start = floor(scrollTop / rowHeight)` and `end = start + visibleCount + overscan`.
3. Render only `items.slice(start, end)`, each absolutely positioned at `index × rowHeight` (or with a translateY offset).
4. Variable heights: measure rows after render and keep a position cache (TanStack Virtual does this).

### Choosing an approach
| Approach | Good for | Watch out |
|---|---|---|
| Pagination | tables, admin screens, SEO pages | extra clicks |
| Infinite scroll | feeds | memory grows; combine with virtualization |
| Virtualization | huge lists/grids users scroll through | Ctrl+F, accessibility, sticky headers |
| `content-visibility: auto` | long documents | still creates all DOM nodes |
| Server-side filtering | search results | fewer items to begin with is the best optimization |
:::

::: diagram Windowing on scroll
flowchart LR
  S["onScroll: scrollTop"] --> I["start = scrollTop / rowHeight"]
  I --> W["rows = items.slice(start, start + visible + overscan)"]
  W --> P["render rows at absolute positions"]
  P --> T["spacer keeps the full scroll height"]
:::

::: image Virtualization renders only visible rows (measured: 30,001 vs 77 DOM elements)
/images/react/virtualization.svg
:::

::: chart bar Measured: mounting a 10,000-row list (React 19.3 production build, jsdom, average of 3)
Approach,Mount time (ms)
Render all rows,241
Windowed (600 px viewport),1.5
:::

::: text 🪜 Step by step
With rows of 30 px and a 600 px viewport:
1. `scrollTop = 0` → start = 0, visible = 20, overscan 5 → render rows 0–24.
2. User scrolls to `scrollTop = 4,500` → start = 150 → render rows 150–174, positioned at 4,500 px…
3. React reuses row components by **key** (the item id) where possible; rows that left the window unmount.
4. The spacer is `10,000 × 30 = 300,000 px` tall, so the scrollbar size and position are correct.
5. Each scroll costs ~25 row renders instead of 10,000.
:::

::: code jsx A list with TanStack Virtual
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export function UserList({ users }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,                       // px; real sizes are measured if rows differ
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>       {/* spacer */}
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={users[row.index].id}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
          >
            {users[row.index].name} · {users[row.index].email}
          </div>
        ))}
      </div>
    </div>
  );
}
:::

::: code javascript Browser demo: which rows does a window render? (runnable)
// The math behind windowing, without React.
function visibleRange({ scrollTop, viewport, rowHeight, count, overscan = 5 }) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { start, end, rendered: end - start, spacerHeight: count * rowHeight };
}

const top = visibleRange({ scrollTop: 0, viewport: 600, rowHeight: 30, count: 10000 });
const middle = visibleRange({ scrollTop: 150000, viewport: 600, rowHeight: 30, count: 10000 });
console.log('top:', JSON.stringify(top));
console.log('middle:', JSON.stringify(middle));
console.log('renders ~25 rows instead of 10,000', top.rendered === 25 && middle.rendered === 30 ? '✅' : '❌ FAIL');
console.log('spacer keeps the full height', top.spacerHeight === 300000 ? '✅' : '❌ FAIL');
console.log('the window follows the scroll', middle.start === 4995 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Virtualizing a list of 50 items: complexity for nothing.
- Using the index as key in a virtualized list with insertions → wrong row state.
- Forgetting the container's fixed height: everything renders (no window).
- Ignoring accessibility: screen readers only see rendered rows; consider `aria-rowcount`/`aria-rowindex` for grids.
- Not memoizing row components when each row is heavy.
:::

::: understand
- The fastest DOM node is the one you don't create.
- Windowing turns O(n) render work into O(viewport).
- Often the better fix is fewer items: filter/paginate on the server.
:::

::: ask
- *"Do users need to see all items, or search them?"* Search/pagination may beat virtualization.
- *"Fixed or variable row heights? Grid or list?"* Decides the library and complexity.
:::

::: important ⭐ Say this in the interview
"For very long lists I use virtualization, also called windowing: only the rows in the viewport plus a small overscan are rendered, absolutely positioned inside a spacer that keeps the real scroll height. In my measurement, mounting 10,000 rows created 30,000 DOM elements and took 241 milliseconds, while the windowed version created 77 and took 1.5. I'd use TanStack Virtual or react-window, keep stable keys, and remember the trade-offs: in-page search, variable heights and accessibility. If users don't need to scroll everything, pagination or server-side filtering is simpler."
:::

::: links
TanStack Virtual | https://tanstack.com/virtual/latest
react-window | https://github.com/bvaughn/react-window
web.dev: Virtualize large lists | https://web.dev/articles/virtualize-long-lists-react-window
MDN: content-visibility | https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility
:::

=== How do you find and measure performance problems in React?
@p 2
@tags react, performance, profiler, devtools, inp
@quick
- **Measure first**: React DevTools **Profiler** (record → see which components rendered, how long, and why), browser Performance panel, Lighthouse/Web Vitals.
- React 19.2 adds **Performance tracks** (Scheduler ⚛, Components ⚛) to Chrome DevTools' Performance panel.
- `<Profiler id onRender>` measures render time in code: `actualDuration` (this commit) vs `baseDuration` (without memoization).
- Measured with `<Profiler>`: re-rendering 1,000 rows took **2.78 ms** without memo, **1.27 ms** with memo (dev build).
- Profile **production builds** for real numbers (dev mode is slower); user-facing metric: **INP** (Interaction to Next Paint).

::: text 🧒 In simple words
A doctor doesn't operate because you *feel* tired; she does tests first. The **Profiler is the blood test** for your app: it shows exactly which components worked, for how long, and why they were called. Then you treat the real problem, not a guess.
:::

::: text 📖 Detailed answer
### Tools
| Tool | Answers |
|---|---|
| React DevTools → **Profiler** | which components rendered in each commit, how long, flame/ranked charts, "Why did this render?" |
| React DevTools → **Highlight updates** | visual flash of components re-rendering while you interact |
| Chrome **Performance** panel (+ React 19.2 tracks) | long tasks, scripting vs rendering vs painting, React scheduler priorities |
| **Lighthouse / Web Vitals** (LCP, INP, CLS) | what users experience; INP measures input responsiveness |
| `<Profiler>` API | render timings in code, sent to monitoring |
| Bundle analyzers (`rollup-plugin-visualizer`, `source-map-explorer`) | what's inside your JS chunks |

### A process that works
1. Reproduce the slow interaction (typing, opening a page, scrolling).
2. Record with the Profiler in a **production profiling build** if possible.
3. Find the commit that's slow; sort by "ranked"; read **"Why did this render?"**.
4. Fix the biggest cost (colocate state, memo, virtualize, transition, split code).
5. Record again and compare; keep the measurement (e.g. INP from real users).

### Reading Profiler numbers
- **actualDuration**: time to render the subtree for this commit (memoized parts that were skipped cost ~0).
- **baseDuration**: estimated time to render the whole subtree without memoization: the worst case.
:::

::: diagram Measure, fix, measure again
flowchart LR
  R["Reproduce the slow interaction"] --> P["Record: Profiler / Performance panel"]
  P --> F["Find the expensive commit and why it rendered"]
  F --> X["Fix the biggest cost"]
  X --> V["Record again, compare"]
  V -->|"still slow"| F
:::

::: image The React Profiler: what rendered, how long, and why (measured with Profiler: 2.78 vs 1.27 ms)
/images/react/profiler.svg
:::

::: chart bar Measured with <Profiler>: average actualDuration of re-rendering 1,000 rows (React 19.3 development build)
Children,actualDuration (ms)
Plain components,2.78
React.memo components,1.27
:::

::: text 🪜 Step by step
Investigating "typing in the filter feels laggy":
1. Open React DevTools → Profiler → ⚙️ enable "Record why each component rendered".
2. Click record, type 5 characters, stop.
3. Each keystroke is a commit; the flame chart shows `ProductList` (and 500 `ProductCard`s) rendering each time, ~40 ms.
4. "Why did this render?" says "Parent component rendered" → the filter state lives in the page.
5. Fix with `useDeferredValue(filter)` for the list (or colocation + memo), record again: keystroke commits drop to ~2 ms; the list updates right after.
:::

::: code jsx Measuring renders in code with <Profiler>
import { Profiler } from 'react';

function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  // phase: "mount" | "update" | "nested-update"
  if (actualDuration > 16) {                    // slower than one frame at 60 fps
    navigator.sendBeacon('/api/perf', JSON.stringify({ id, phase, actualDuration, baseDuration, commitTime }));
  }
}

export function App() {
  return (
    <Profiler id="ProductList" onRender={onRender}>
      <ProductList />
    </Profiler>
  );
}

// Profiling in production: alias react-dom/client to the profiling build, e.g. in Vite:
// resolve: { alias: { 'react-dom/client': 'react-dom/profiling' } }
:::

::: warning ⚠️ Common mistakes
- Optimizing by intuition without a recording.
- Judging speed in **development** mode (Strict Mode double renders, extra checks).
- Looking only at render counts: a component rendering 100 times at 0.01 ms is not the problem.
- Ignoring non-React costs: huge bundles, layout thrashing, heavy CSS, images.
- Shipping `<Profiler>` everywhere in production (it has overhead; sample it).
:::

::: understand
- Performance work is a loop: measure → fix the biggest cost → measure.
- `actualDuration` vs `baseDuration` tells you how much memoization is saving.
- INP is the user-facing metric for interaction lag; React's job is to keep long tasks short.
:::

::: ask
- *"What does slow mean here: first load, an interaction, or scrolling?"*
- *"Do we have real-user metrics (RUM) like INP?"*
:::

::: important ⭐ Say this in the interview
"I always measure before optimizing. I reproduce the slow interaction, record it with the React DevTools Profiler with 'why did this render' enabled, and look at the slowest commits and the components that dominate them; for whole-page issues I use Chrome's Performance panel, which since React 19.2 has React scheduler and component tracks, plus Web Vitals like INP from real users. The Profiler API gives actualDuration and baseDuration in code: for example re-rendering a thousand rows took about 2.8 milliseconds without memo and 1.3 with it. Then I fix the biggest cost and record again."
:::

::: links
react.dev: Profiler | https://react.dev/reference/react/Profiler
React DevTools | https://react.dev/learn/react-developer-tools
React 19.2: Performance tracks | https://react.dev/blog/2025/10/01/react-19-2#performance-tracks
web.dev: Interaction to Next Paint (INP) | https://web.dev/articles/inp
:::
