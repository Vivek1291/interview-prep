@section React Hooks
@icon 🪝
@color #06b6d4
@desc useState, useReducer, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useEffectEvent and custom hooks: how they work inside, when to use each, and the bugs interviewers love to ask about. Numbers measured with React 19.3.

=== What are hooks, and why do the Rules of Hooks exist?
@p 3
@tags react, hooks, rules-of-hooks
@quick
- Hooks are functions starting with `use` that let function components keep **state**, run **effects** and reuse logic.
- React stores a component's hooks in a **list** and matches them by **call order** on every render.
- Rule 1: call hooks only at the **top level** (not in `if`, loops, nested functions or after an early `return`).
- Rule 2: call hooks only from **components or custom hooks** (not regular functions or class components).
- Exception: `use()` (React 19) may be called conditionally; it isn't stored by position.

::: text 🧒 In simple words
Imagine a teacher who doesn't know the students' names and gives out notebooks **by seat order**: first seat gets notebook 1, second seat gets notebook 2. It works perfectly as long as everyone sits in the **same order every day**. If one student is absent and everyone shifts left, each student gets **someone else's notebook**. Hooks are the students, the notebooks are the stored state, and the Rules of Hooks just say "always sit in the same order".
:::

::: text 📖 Detailed answer
Before hooks (React 16.8, 2019), only **class components** could have state and lifecycle methods. Hooks let **function components** do everything, and let you extract stateful logic into reusable **custom hooks**.

### The built-in hooks you must know
| Hook | Purpose |
|---|---|
| `useState` | a state value + setter |
| `useReducer` | state updated through actions and a reducer function |
| `useEffect` | synchronize with something outside React (network, subscriptions, timers) after paint |
| `useLayoutEffect` | same, but before paint (measure DOM) |
| `useRef` | a mutable box that survives renders; DOM references |
| `useMemo` / `useCallback` | cache a value / a function between renders |
| `useContext` / `use` | read context (and, for `use`, promises) |
| `useTransition` / `useDeferredValue` | mark updates as non-urgent |
| `useId` | stable unique ids for accessibility attributes |
| `useActionState`, `useFormStatus`, `useOptimistic` | React 19 forms and Actions |
| `useEffectEvent` | React 19.2: read latest props/state inside an effect without re-running it |

### How React stores hooks
Each component instance (fiber) has a **linked list of hook slots**. During render, the 1st hook call reads slot 0, the 2nd reads slot 1, and so on. That's why the order must be **identical every render**: React has no other way to know which `useState` is which.

### Rules of Hooks
1. Only call hooks at the **top level**.
2. Only call hooks from **React function components** or **custom hooks**.
The `eslint-plugin-react-hooks` package enforces both (and, since v6 / React 19.2, compiler-powered rules too).
:::

::: diagram Hook slots are matched by call order
flowchart LR
  R["Render calls hooks in order"] --> H1["1st call → slot 0: name"]
  R --> H2["2nd call → slot 1: count"]
  R --> H3["3rd call → slot 2: effect"]
  X["An if skips the 1st call"] -.->|"every later hook shifts one slot"| B["Wrong state, React error"]
:::

::: image Hooks are matched by call order; skipping one shifts every later hook
/images/react/hooks-order.svg
:::

::: text 🪜 Step by step
What React does when it renders `Profile` twice:
1. First render: `useState('Asha')` → no slot yet → create slot 0 = 'Asha'. `useState(0)` → slot 1 = 0. `useEffect(fn)` → slot 2 stores the effect.
2. Second render: the hook pointer resets to slot 0. `useState('Asha')` returns slot 0's **current** value (the argument is ignored now), and so on in order.
3. If an `if` skipped the first `useState`, the second call would read slot 0 ("Asha") as the count, and the effect would read slot 1. React detects that the number/order of hooks changed and throws.
:::

::: code javascript Browser demo: a mini hooks engine (runnable)
// A tiny re-implementation of useState to show why hooks are matched by ORDER.
let slots = [];
let cursor = 0;
function useState(initial) {
  const i = cursor++;
  if (slots.length <= i) slots.push(initial);              // first render: create the slot
  const setState = (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; };
  return [slots[i], setState];
}
function render(Component, props) { cursor = 0; return Component(props); }   // React resets the cursor each render

function Profile({ showName }) {
  const out = {};
  if (showName) [out.name] = useState('Asha');            // ❌ conditional hook
  const [count, setCount] = useState(0);
  out.count = count;
  out.inc = () => setCount((c) => c + 1);
  return out;
}

const first = render(Profile, { showName: true });
first.inc();                                               // count: 0 → 1 (slot 1)
const second = render(Profile, { showName: true });
console.log('same order → count is', second.count);
console.log('stable order keeps state', second.count === 1 ? '✅' : '❌ FAIL');

const third = render(Profile, { showName: false });       // the first hook is skipped this time
console.log('skipped hook → "count" reads', JSON.stringify(third.count));
console.log('conditional hook reads the WRONG slot', third.count === 'Asha' ? '✅' : '❌ FAIL');
:::

::: code jsx Rule violations and their fixes
// ❌ conditional hook
function Product({ id, showReviews }) {
  if (showReviews) {
    const [reviews, setReviews] = useState([]);            // breaks the order
  }
}

// ✅ always call it; use the condition inside
function ProductFixed({ id, showReviews }) {
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    if (!showReviews) return;
    fetchReviews(id).then(setReviews);
  }, [id, showReviews]);
}

// ❌ hook after an early return
function Panel({ user }) {
  if (!user) return null;
  const [open, setOpen] = useState(false);                 // not called on some renders
}

// ✅ hooks first, early return after
function PanelFixed({ user }) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return <button onClick={() => setOpen(!open)}>{user.name}</button>;
}
:::

::: warning ⚠️ Common mistakes
- Calling a hook inside `if`, `for`, `.map()`, an event handler or after an early `return`.
- Calling hooks from a normal helper function (`function getUser() { useState… }`). Name it `useUser` to make it a custom hook, and call it from a component.
- Thinking the argument of `useState(initial)` is applied on every render: it's only used the **first** time.
- Disabling the ESLint rule instead of fixing the code.
:::

::: understand
- "Hooks are matched by order" explains both rules.
- Hooks are **per component instance**: two `<Counter />`s have separate slots.
- `use()` is the one exception (conditional is allowed) because it doesn't occupy a slot.
:::

::: ask
- *"Are we migrating class components?"* Then lifecycle methods map to effects, but don't translate 1:1.
- *"Is the React Compiler enabled?"* It relies on the Rules of React being followed.
:::

::: important ⭐ Say this in the interview
"Hooks let function components have state, effects and reusable logic. React keeps a list of hook slots for each component instance and matches hook calls to slots by call order on every render. That's why the rules exist: call hooks only at the top level, never conditionally or in loops, and only from components or custom hooks. If a hook were skipped in one render, every following hook would read the wrong slot. The lint plugin enforces this, and React 19's `use` is the only API that may be called conditionally."
:::

::: links
react.dev: Rules of Hooks | https://react.dev/reference/rules/rules-of-hooks
react.dev: Built-in React hooks | https://react.dev/reference/react/hooks
eslint-plugin-react-hooks | https://react.dev/reference/eslint-plugin-react-hooks
:::

=== useState vs useReducer: which one and when?
@p 2
@tags react, hooks, useState, useReducer
@quick
- `useState` = one value + setter. Best for independent, simple values (toggle, input, counter).
- `useReducer(reducer, initial)` = `dispatch(action)` → `reducer(state, action)` returns the **next** state.
- Use a reducer when several fields change **together**, the next state depends on the action type, or the logic deserves **unit tests**.
- Reducers must be **pure**: no fetch, no mutation, no `Date.now()`; return new objects.
- `dispatch` is stable (same function every render), handy to pass down via context.

::: text 🧒 In simple words
`useState` is a **light switch**: you flip it yourself. `useReducer` is a **vending machine**: you don't reach inside; you press a button labelled "cola" (an **action**), and the machine's rules (the **reducer**) decide what comes out. With many buttons and rules, a machine is easier to reason about than ten switches.
:::

::: text 📖 Detailed answer
| | `useState` | `useReducer` |
|---|---|---|
| API | `const [v, setV] = useState(init)` | `const [state, dispatch] = useReducer(reducer, init)` |
| Update | `setV(next)` or `setV(prev => next)` | `dispatch({ type: 'added', item })` |
| Where the logic lives | event handlers | one pure `reducer` function |
| Best for | few independent values | related values, many transitions, complex rules |
| Testing | test the component | test `reducer(state, action)` as a plain function |
| Debugging | look at each setter | log every action (Redux-style) |

### Signs you want a reducer
- Three `setX` calls that always happen together (`setLoading(false); setData(d); setError(null)`).
- Impossible states are possible: `loading && error` both true.
- The same update logic is copy-pasted in several handlers.

### Reducer + context
`useReducer` in a provider, with `state` and `dispatch` in two contexts, is a small, dependency-free alternative to Redux for medium apps.
:::

::: diagram How a reducer update flows
flowchart LR
  E["Event handler"] -->|"dispatch(action)"| D["React"]
  D --> R["reducer(state, action)"]
  R -->|"new state"| V["Re-render with new state"]
:::

::: image useState vs useReducer
/images/react/state-vs-reducer.svg
:::

::: text 🪜 Step by step
Turning a fetch with 3 `useState`s into a reducer:
1. List the **states** the UI can be in: idle, loading, success, error.
2. List the **events**: `started`, `succeeded`, `failed`.
3. Write `reducer(state, action)` with a `switch` that returns the next **whole** state object for each action.
4. Replace `setLoading/setData/setError` with `dispatch({ type: 'started' })` etc.
5. Now "loading and error at the same time" can't happen, and the reducer can be unit-tested without React.
:::

::: code javascript Browser demo: a pure reducer you can test without React (runnable)
function fetchReducer(state, action) {
  switch (action.type) {
    case 'started':   return { status: 'loading', data: state.data, error: null };
    case 'succeeded': return { status: 'success', data: action.data, error: null };
    case 'failed':    return { status: 'error', data: null, error: action.error };
    default: throw new Error(`Unknown action ${action.type}`);
  }
}

const initial = { status: 'idle', data: null, error: null };
let s = fetchReducer(initial, { type: 'started' });
console.log(s.status);
s = fetchReducer(s, { type: 'succeeded', data: ['react', 'hooks'] });
console.log(s.status, s.data);
console.log('success state is consistent', s.status === 'success' && s.error === null && s.data.length === 2 ? '✅' : '❌ FAIL');
const failed = fetchReducer(fetchReducer(initial, { type: 'started' }), { type: 'failed', error: 'timeout' });
console.log('error clears data', failed.status === 'error' && failed.data === null ? '✅' : '❌ FAIL');
console.log('pure: the old state is untouched', initial.status === 'idle' ? '✅' : '❌ FAIL');
:::

::: code jsx Cart with useReducer
import { useReducer } from 'react';

function cartReducer(state, action) {
  switch (action.type) {
    case 'added': {
      const existing = state.items.find((i) => i.id === action.product.id);
      const items = existing
        ? state.items.map((i) => (i.id === action.product.id ? { ...i, qty: i.qty + 1 } : i))
        : [...state.items, { ...action.product, qty: 1 }];
      return { ...state, items };
    }
    case 'removed':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'couponApplied':
      return { ...state, discount: action.percent };
    default:
      return state;
  }
}

export function Cart() {
  const [cart, dispatch] = useReducer(cartReducer, { items: [], discount: 0 });
  const total = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * (1 - cart.discount / 100);
  return (
    <>
      <button onClick={() => dispatch({ type: 'added', product: { id: 1, name: 'Mug', price: 12 } })}>Add mug</button>
      <button onClick={() => dispatch({ type: 'couponApplied', percent: 10 })}>Apply 10%</button>
      <p>{cart.items.length} items · {total.toFixed(2)} €</p>
    </>
  );
}
:::

::: warning ⚠️ Common mistakes
- Mutating state inside the reducer (`state.items.push(x); return state;`): same reference → no re-render.
- Side effects in the reducer (API calls, `localStorage`): reducers may run twice in Strict Mode; put effects in handlers or `useEffect`.
- A reducer for a single boolean: overkill; `useState` is clearer.
- Forgetting a `default` case and returning `undefined` for unknown actions.
:::

::: understand
- Both store state the same way; the difference is **where update logic lives**.
- Reducers make state transitions explicit and testable; that's why Redux uses the same idea.
- `dispatch` identity never changes: safe in dependency arrays and context.
:::

::: ask
- *"How many related fields and transitions are there?"*
- *"Is this state shared widely?"* Then reducer + context or an external store.
:::

::: important ⭐ Say this in the interview
"useState is a single value with a setter, ideal for simple independent state. useReducer centralizes the update logic in a pure function: components dispatch actions and the reducer returns the next state. I switch to a reducer when several values change together, when impossible combinations like loading-and-error must be prevented, or when the logic is worth unit testing on its own. Reducers must be pure and return new objects; dispatch is stable, so it's easy to pass through context."
:::

::: links
react.dev: useReducer | https://react.dev/reference/react/useReducer
react.dev: Extracting state logic into a reducer | https://react.dev/learn/extracting-state-logic-into-a-reducer
:::

=== How does useEffect work? (dependencies and cleanup)
@p 3
@tags react, hooks, useEffect, lifecycle
@quick
- `useEffect(setup, deps)` runs **after the browser paints**, to sync with something outside React (network, subscriptions, timers, DOM APIs).
- No deps → after **every** render; `[]` → once after mount; `[a, b]` → when `a` or `b` changed (`Object.is`).
- Return a **cleanup** function: React runs it before the next effect and on unmount.
- Measured over 5 renders (id changed once): no deps **5** runs, `[]` **1**, `[id]` **2**.
- In Strict Mode (dev) React runs setup → cleanup → setup on mount to expose missing cleanups.

::: text 🧒 In simple words
An effect is like **subscribing to a newspaper when you move into a house**. When you move to a new house (the dependencies changed), you first **cancel the old subscription** (cleanup) and then subscribe at the new address. When you leave town (unmount), you cancel it for good. If you never cancel, newspapers pile up at every old address: that's a memory leak.
:::

::: text 📖 Detailed answer
Effects let a component **synchronize** with an external system. Think "keep X in sync with these values", not "run code on mount".

### Dependency arrays
| Code | Runs after | Typical use |
|---|---|---|
| `useEffect(fn)` | every render | rarely right (logging, syncing to a non-React widget) |
| `useEffect(fn, [])` | mount only (+ cleanup on unmount) | subscribe to a global event, init a third-party library |
| `useEffect(fn, [roomId])` | mount + whenever `roomId` changes | connect to a chat room, fetch data for an id |

Every **reactive value** used inside (props, state, values derived from them) must be in the array; the linter tells you.

### Cleanup
The setup function may return a function. React calls it:
- **before re-running** the effect with new deps (clean up the old room before joining the new one),
- **on unmount**.

### Timing
`useEffect` runs **after paint** (non-blocking). `useLayoutEffect` runs after the DOM update but **before paint**; use it only to measure layout.

### Class lifecycle mapping (don't translate blindly)
`componentDidMount` ≈ `useEffect(fn, [])`, `componentDidUpdate` ≈ deps, `componentWillUnmount` ≈ cleanup. But effects are about **synchronization per value**, not lifecycle moments.

### You might not need an effect
Don't use effects to compute derived data (`fullName`), to react to events (do it in the handler), or to reset state when a prop changes (use a `key`).
:::

::: diagram Effect timing on mount, update and unmount
sequenceDiagram
  participant R as React
  participant E as Your effect
  R->>R: render + commit + paint
  R->>E: setup(roomId=1)
  R->>R: re-render with roomId=2
  R->>E: cleanup(roomId=1)
  R->>E: setup(roomId=2)
  R->>E: cleanup(roomId=2) on unmount
:::

::: image When useEffect runs and cleans up (measured runs per dependency style)
/images/react/effect-lifecycle.svg
:::

::: chart bar Measured: effect runs over 5 renders where the id changed once (React 19.3)
Dependencies,Effect runs
none: useEffect(fn),5
empty: [],1
[id],2
:::

::: text 🪜 Step by step
`ChatRoom` with `useEffect(() => { const c = connect(roomId); return () => c.disconnect(); }, [roomId])`:
1. Mount with room "general": render → commit → paint → **setup** connects to "general".
2. A parent re-render with the same `roomId`: deps unchanged → nothing runs.
3. User switches to "travel": render → commit → paint → React runs the **cleanup** of the previous effect (disconnect "general") → runs **setup** for "travel".
4. User leaves the page: **cleanup** disconnects "travel".
5. In development Strict Mode, step 1 is setup → cleanup → setup, to prove your cleanup works.
:::

::: code jsx Effects with dependencies and cleanup
import { useEffect, useState } from 'react';

function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('message', (m) => setMessages((list) => [...list, m]));
    connection.connect();
    return () => connection.disconnect();          // cleanup: before the next roomId, and on unmount
  }, [roomId]);                                    // re-sync when the room changes

  return <ul>{messages.map((m) => <li key={m.id}>{m.text}</li>)}</ul>;
}

function WindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);   // same function reference!
  }, []);
  return <p>{width}px</p>;
}
:::

::: code jsx You might not need an effect
// ❌ derived state through an effect: an extra render and a moment of stale UI
function Bad({ first, last }) {
  const [fullName, setFullName] = useState('');
  useEffect(() => setFullName(`${first} ${last}`), [first, last]);
  return <h2>{fullName}</h2>;
}

// ✅ calculate during render
function Good({ first, last }) {
  const fullName = `${first} ${last}`;
  return <h2>{fullName}</h2>;
}

// ❌ "event" logic in an effect
// useEffect(() => { if (submitted) postForm(data); }, [submitted]);
// ✅ do it in the event handler
// const onSubmit = () => postForm(data);
:::

::: warning ⚠️ Common mistakes
- Missing dependencies (stale values) or silencing the linter instead of restructuring.
- Objects/functions created during render in the deps array: they're new every render → the effect runs every render.
- Forgetting cleanup for subscriptions, intervals and event listeners: leaks and duplicate handlers.
- Setting state unconditionally inside an effect that depends on that state → infinite loop.
- Using effects for derived data, event handling or data that the framework could fetch (loaders, RSC, `use`).
:::

::: understand
- An effect = "keep this external thing in sync with these values"; cleanup = "undo the previous sync".
- Dependencies are not a tuning knob; they're **everything reactive the effect reads**.
- Effects run after paint, so they never block the first frame.
:::

::: ask
- *"Is this data fetching?"* In production apps prefer a data library or the framework's loaders over raw effects.
- *"Strict Mode on?"* Then double effect calls in development are expected.
:::

::: important ⭐ Say this in the interview
"useEffect synchronizes a component with an external system after the browser paints. The dependency array lists every reactive value the effect reads: with no array it runs after every render, with an empty array once after mount, and with values whenever one of them changes. The setup can return a cleanup function that React runs before the next setup and on unmount, which is how I avoid leaks with subscriptions, timers and listeners. I don't use effects for derived values or event logic; those belong in render and in handlers."
:::

::: links
react.dev: useEffect | https://react.dev/reference/react/useEffect
react.dev: Synchronizing with effects | https://react.dev/learn/synchronizing-with-effects
react.dev: You might not need an effect | https://react.dev/learn/you-might-not-need-an-effect
:::

=== Common useEffect bugs: stale closures, infinite loops and race conditions
@p 3
@tags react, hooks, useEffect, bugs, useEffectEvent
@quick
- **Stale closure**: an effect/interval created once keeps the values from **that** render. Fix with updater functions, correct deps or `useEffectEvent` (React 19.2).
- Measured: interval with `setCount(count + 1)` and `[]` deps shows **1** after 5 ticks; with `setCount(c => c + 1)` it shows **5**.
- **Infinite loop**: effect sets state that's in its own deps, or deps contain a new object every render.
- **Race condition**: two fetches resolve out of order and the old one wins. Fix with an `ignore` flag or `AbortController` in cleanup.
- `useEffectEvent` = read the **latest** props/state inside an effect without adding them to deps.

::: text 🧒 In simple words
A **stale closure** is like a photo: the interval took a photo of `count` when it was 0, and keeps looking at the photo instead of the real counter. A **race condition** is like asking two waiters for the menu of two different restaurants: if the first waiter is slow, you might end up reading the wrong menu after you changed your mind. The cleanup says "ignore the first waiter".
:::

::: text 📖 Detailed answer
### 1. Stale closures
Every render creates **new functions** that capture **that render's** values. An effect with `[]` deps keeps the functions from the first render forever.
| Fix | When |
|---|---|
| updater: `setCount(c => c + 1)` | the stale value is only used to compute the next state |
| add the value to deps | the effect should re-run when it changes |
| `useEffectEvent` (React 19.2) | the effect shouldn't re-run, but needs the latest value (e.g. a theme for a notification) |
| a ref holding the latest value | older React versions |

### 2. Infinite loops
- `useEffect(() => setCount(count + 1), [count])` → render → effect → state change → render…
- `useEffect(fn, [{ page: 1 }])` or `[options]` where `options` is created in render → new object every render → runs every render (and if it sets state: loop).
Fix: derive instead of syncing, move object creation inside the effect, depend on primitives (`options.page`), or `useMemo` the object.

### 3. Race conditions in data fetching
User types "re" then "react": request A ("re") is slow, request B ("react") is fast. A resolves **last** and overwrites the correct results.
Fix: in cleanup, mark the old request as stale (`ignore = true`) or abort it (`controller.abort()`). React runs the cleanup before the next effect, so only the latest request may set state.
:::

::: diagram A fetch race and how cleanup prevents it
sequenceDiagram
  participant U as User
  participant C as Component
  participant S as Server
  U->>C: query = "re"
  C->>S: fetch A ("re")
  U->>C: query = "react"
  C->>C: cleanup A: ignore = true
  C->>S: fetch B ("react")
  S-->>C: B results (fast) → setResults
  S-->>C: A results (slow) → ignored
:::

::: image A stale closure in an interval (measured: 1 vs 5 after 5 ticks)
/images/react/stale-closure.svg
:::

::: chart bar Measured: counter value after 5 interval ticks, effect with [] deps (React 19.3)
Code in the interval,Value shown
setCount(count + 1) (stale),1
setCount(c => c + 1),5
:::

::: text 🪜 Step by step
Why the stale interval shows 1:
1. Render 1: `count = 0`. The effect (deps `[]`) creates an interval whose callback closes over `count = 0`.
2. Tick 1: `setCount(0 + 1)` → render 2 with `count = 1`. The effect doesn't re-run (deps unchanged), so the **old** callback stays.
3. Tick 2: the old callback still sees `count = 0` → `setCount(1)` → same value → React bails out.
4. Every tick sets 1 again. With the updater, React passes the **current** value: 1→2→3→4→5.
:::

::: code javascript Browser demo: closures capture the value of their render (runnable)
// Each "render" creates new functions that remember that render's state.
function makeRender(count) {
  return { count, onTick: () => count + 1 };       // like `() => setCount(count + 1)`
}
let state = 0;
const firstRender = makeRender(state);              // the interval keeps THIS function ([] deps)
for (let tick = 0; tick < 5; tick++) state = firstRender.onTick();
console.log('stale closure after 5 ticks:', state);
console.log('stale callback always computes 0 + 1', state === 1 ? '✅' : '❌ FAIL');

let fresh = 0;
const updater = (c) => c + 1;                       // like setCount(c => c + 1): gets the CURRENT value
for (let tick = 0; tick < 5; tick++) fresh = updater(fresh);
console.log('updater function after 5 ticks:', fresh, fresh === 5 ? '✅' : '❌ FAIL');
:::

::: code jsx Fixing all three bugs
import { useEffect, useEffectEvent, useState } from 'react';

// 1) stale closure in an interval
function Timer() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);   // ✅ updater
    return () => clearInterval(id);
  }, []);
  return <p>{count}</p>;
}

// 2) latest value without re-subscribing (React 19.2 useEffectEvent)
function ChatRoom({ roomId, theme }) {
  const onConnected = useEffectEvent(() => showNotification('Connected!', theme));   // always sees the latest theme
  useEffect(() => {
    const c = createConnection(roomId);
    c.on('connected', () => onConnected());
    c.connect();
    return () => c.disconnect();
  }, [roomId]);                                    // ✅ theme changes don't reconnect
  return <h2>#{roomId}</h2>;
}

// 3) race condition when fetching
function SearchResults({ query }) {
  const [results, setResults] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setResults)
      .catch((e) => { if (e.name !== 'AbortError') throw e; });
    return () => controller.abort();               // ✅ the previous request can't overwrite newer results
  }, [query]);
  return <ul>{results.map((r) => <li key={r.id}>{r.title}</li>)}</ul>;
}
:::

::: warning ⚠️ Common mistakes
- Adding `// eslint-disable-next-line react-hooks/exhaustive-deps` to hide a stale closure.
- Putting an object/array literal or inline function in deps and getting an effect on every render.
- `async` function directly as the effect (`useEffect(async () => …)`): it returns a promise, not a cleanup. Define an async function inside and call it.
- Not handling races in search boxes, tabs and pagination.
- Calling an Effect Event (`useEffectEvent`) from render or listing it in deps: it's only for effects.
:::

::: understand
- Closures capture **values per render**; effects with stale deps see old renders.
- Cleanup is the tool for both leaks **and** races.
- `useEffectEvent` separates "what triggers the effect" (deps) from "what it reads" (latest values).
:::

::: ask
- *"Which React version?"* `useEffectEvent` is stable from 19.2.
- *"Can we use a data library?"* TanStack Query/SWR handle races, caching and retries for you.
:::

::: important ⭐ Say this in the interview
"The three classic effect bugs are stale closures, loops and races. Each render's functions capture that render's values, so an interval created in an effect with empty deps keeps reading the first count; I fix that with the updater form, correct dependencies, or in React 19.2 with useEffectEvent for values the effect reads but shouldn't re-run for. Loops come from setting state the effect depends on, or from objects created during render in the dependency array. Races happen when an older fetch resolves after a newer one; I abort or ignore the previous request in the cleanup."
:::

::: links
react.dev: Separating events from effects (useEffectEvent) | https://react.dev/learn/separating-events-from-effects
react.dev: Removing effect dependencies | https://react.dev/learn/removing-effect-dependencies
react.dev: Fetching data in effects (race conditions) | https://react.dev/reference/react/useEffect#fetching-data-with-effects
:::

=== useRef: when to use a ref instead of state
@p 2
@tags react, hooks, useRef, dom
@quick
- `useRef(initial)` returns the **same** `{ current }` object on every render; changing `.current` does **not** re-render.
- Use refs for **DOM nodes** (`<input ref={r} />` → `r.current.focus()`) and **mutable values** that don't affect the UI (timer ids, previous value, latest callback).
- Use **state** for anything shown on screen; measured: counting 10 clicks → state 10 renders, ref 0 (and the screen doesn't update).
- Don't read or write `ref.current` **during render** (except lazy init); do it in effects and handlers.
- React 19: `ref` is a normal prop for function components (no `forwardRef`), and ref callbacks can return a cleanup.

::: text 🧒 In simple words
State is a **scoreboard**: when the score changes, everyone in the stadium sees it (re-render). A ref is a **note in your pocket**: you can scribble on it any time, it stays with you between innings, but nobody else sees the change and the scoreboard doesn't update.
:::

::: text 📖 Detailed answer
| | `useState` | `useRef` |
|---|---|---|
| Changing it | `setX(v)` → re-render | `ref.current = v` → **no** re-render |
| Value in this render | a snapshot (constant) | always the latest (mutable) |
| Use for | data shown in the UI | DOM nodes, ids, caches, "latest value" |

### DOM refs
Pass a ref object to a JSX element: React sets `ref.current` to the DOM node after commit and back to `null` on unmount. Use it for focus, scroll, measuring, media playback, third-party widgets.

### Refs as instance variables
- `intervalRef.current = setInterval(…)` so a Stop button can clear it.
- `prevValueRef` to compare the previous and current props.
- `latestCallbackRef.current = onChange` so a long-lived subscription calls the newest handler (useEffectEvent covers many of these cases in 19.2).

### React 19 changes
- Function components receive `ref` as a **regular prop**: `function Input({ ref, ...props }) { return <input ref={ref} {...props} /> }`. `forwardRef` is no longer needed (and will be deprecated).
- **Ref callbacks can return a cleanup** function, called when the element is removed.
:::

::: diagram State vs ref when the value changes
flowchart LR
  S["setCount(n + 1)"] --> R["React re-renders"] --> U["Screen shows new value"]
  F["ref.current += 1"] --> N["No re-render"] --> O["Screen shows the old value"]
:::

::: image useRef: a value that survives renders but doesn't trigger them (measured: 0 vs 10 renders)
/images/react/useref.svg
:::

::: chart bar Measured: re-renders while counting 10 clicks (React 19.3)
Stored in,Re-renders
useState,10
useRef,0
:::

::: text 🪜 Step by step
A stopwatch with start/stop buttons:
1. `const [now, setNow] = useState(null)` and `const [start, setStart] = useState(null)`: both shown on screen → state.
2. `const intervalRef = useRef(null)`: the interval id is not shown → ref.
3. Start: `setStart(Date.now())`, `intervalRef.current = setInterval(() => setNow(Date.now()), 10)`.
4. Stop: `clearInterval(intervalRef.current)`: the handler reads the **current** id from the ref, even though it was set in an earlier render.
5. Elapsed time is derived during render: `(now - start) / 1000`.
:::

::: code jsx DOM refs, instance values and React 19 ref-as-prop
import { useEffect, useRef, useState } from 'react';

function Stopwatch() {
  const [start, setStart] = useState(null);
  const [now, setNow] = useState(null);
  const intervalRef = useRef(null);               // not shown on screen → ref

  const begin = () => {
    setStart(Date.now()); setNow(Date.now());
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setNow(Date.now()), 10);
  };
  const stop = () => clearInterval(intervalRef.current);
  useEffect(() => () => clearInterval(intervalRef.current), []);   // clean up on unmount

  return (
    <>
      <p>{start ? ((now - start) / 1000).toFixed(2) : '0.00'} s</p>
      <button onClick={begin}>Start</button> <button onClick={stop}>Stop</button>
    </>
  );
}

// React 19: ref is a normal prop, no forwardRef
function SearchInput({ ref, ...props }) {
  return <input ref={ref} type="search" {...props} />;
}

function SearchPage() {
  const inputRef = useRef(null);
  useEffect(() => inputRef.current.focus(), []);  // focus after mount
  return <SearchInput ref={inputRef} placeholder="Search…" />;
}

// React 19: a ref callback can return a cleanup
function Video({ src }) {
  return (
    <video
      src={src}
      ref={(node) => {
        const observer = new IntersectionObserver(([e]) => (e.isIntersecting ? node.play() : node.pause()));
        observer.observe(node);
        return () => observer.disconnect();       // runs when the element is removed
      }}
    />
  );
}
:::

::: warning ⚠️ Common mistakes
- Storing displayed data in a ref and wondering why the UI doesn't update.
- Reading `ref.current` during render to decide what to show: the value may be stale and breaks purity.
- Accessing a DOM ref before mount (`null`) or in a conditional element that isn't rendered.
- Using `forwardRef` in new React 19 code: just accept `ref` as a prop.
- Copying `ref.current` into an effect's cleanup after it has changed (read it into a variable at setup time).
:::

::: understand
- Refs are an **escape hatch** from React's data flow: use them for imperative, non-visual things.
- Rule of thumb: if the value is rendered, it's state; if not, it may be a ref.
- `useRef` gives you a stable identity across renders; `useState` gives you re-rendering.
:::

::: ask
- *"React 19?"* Then `ref` as a prop and ref cleanup callbacks are available.
- *"Do we control the child component?"* Otherwise, `useImperativeHandle` exposes a limited API instead of the DOM node.
:::

::: important ⭐ Say this in the interview
"useRef gives me a mutable object whose current property survives re-renders, and changing it doesn't trigger a render. I use it for DOM access, like focusing an input or measuring an element, and for values that don't appear in the UI, like timer ids or the previous value. Anything the user sees must be state: counting ten clicks in a ref causes zero re-renders, so the screen never updates. In React 19, function components receive ref as a normal prop, so forwardRef isn't needed, and ref callbacks can return a cleanup."
:::

::: links
react.dev: useRef | https://react.dev/reference/react/useRef
react.dev: Referencing values with refs | https://react.dev/learn/referencing-values-with-refs
react.dev: Manipulating the DOM with refs | https://react.dev/learn/manipulating-the-dom-with-refs
:::

=== useMemo and useCallback: when do they actually help?
@p 3
@tags react, hooks, useMemo, useCallback, performance
@quick
- `useMemo(fn, deps)` caches the **result** of `fn`; `useCallback(fn, deps)` caches the **function** itself (= `useMemo(() => fn, deps)`).
- They help in 2 cases: an **expensive calculation**, or keeping a **stable identity** for a prop of a `React.memo` child / a hook dependency.
- Measured: 50 unrelated re-renders filtering + sorting 20,000 items → **~126 ms** without, **~1.2 ms** with `useMemo`.
- Everywhere else they add code and comparison cost for nothing.
- React Compiler 1.0 memoizes automatically; keep manual hooks as escape hatches.

::: text 🧒 In simple words
`useMemo` is a **sticky note with an answer**: "for 23 × 47 the answer is 1081". If you're asked the same question again, you read the note instead of multiplying. `useCallback` is like keeping the **same phone number**: if you change your number every day, your friends' "known contacts" list (a memoized child) thinks you're a new person every time.
:::

::: text 📖 Detailed answer
On every render, everything in the component body runs again and every inline object/function is **new**.

| | `useMemo` | `useCallback` |
|---|---|---|
| Caches | the return value | the function |
| Equivalent | `useMemo(() => compute(a, b), [a, b])` | `useCallback(fn, deps)` ≈ `useMemo(() => fn, deps)` |
| Helps when | the calculation is expensive, or the result object is passed to a memoized child / effect deps | the function is passed to a memoized child or used in effect deps |

### When it's worth it
1. **Expensive work**: filtering/sorting thousands of items, building big maps, heavy formatting. Rule of thumb: if it takes **≥ 1 ms** (measure with `console.time`), consider it.
2. **Referential stability**: a `React.memo(Child)` receives `onSelect={() => …}` or `style={{…}}`: without memoization the props change on every render and memo is useless.
3. **Effect dependencies** that are objects/functions created in render.

### When it's not
Cheap expressions (`a + b`, `items.length`), values not passed anywhere, children that aren't memoized. Memoization isn't free: React stores deps and compares them each render.

### React Compiler (1.0, Oct 2025)
A build-time compiler that inserts memoization automatically (even after early returns). With it enabled, new code rarely needs manual `useMemo`/`useCallback`.
:::

::: diagram What useMemo does on each render
flowchart TD
  R["Render"] --> Q{"deps same as last render? (Object.is)"}
  Q -->|"yes"| C["Return cached value: no work"]
  Q -->|"no"| N["Run the function, cache the new value"]
:::

::: image useMemo and useCallback reuse values unless dependencies change (measured: 126 ms vs 1.2 ms)
/images/react/usememo.svg
:::

::: chart bar Measured: 50 re-renders caused by unrelated state, filter + sort of 20,000 products (React 19.3 production, average of 3 runs)
Version,Total time (ms)
No memoization,126
useMemo([query]),1.2
:::

::: text 🪜 Step by step
A product page re-renders because a "cart count" in the same component changed:
1. Without `useMemo`, `products.filter(...).sort(...)` runs again (20,000 items): ~2.5 ms per render.
2. With `useMemo(() => …, [query])`, React compares `query` with the previous render's `query`.
3. Same → return the cached array (**same reference**): ~0 ms, and a memoized `<ProductGrid items={visible} />` can skip rendering because its prop didn't change.
4. When the user types in the search box, `query` changes → recompute once → cache again.
:::

::: code jsx Memoizing a calculation and a callback for a memo child
import { memo, useCallback, useMemo, useState } from 'react';

function Shop({ products }) {
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);

  // ✅ expensive: only recompute when products or query change
  const visible = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.price - b.price),
    [products, query],
  );

  // ✅ stable function identity so the memoized grid doesn't re-render when cartCount changes
  const addToCart = useCallback(() => setCartCount((c) => c + 1), []);

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <span>🛒 {cartCount}</span>
      <ProductGrid items={visible} onAdd={addToCart} />
    </>
  );
}

const ProductGrid = memo(function ProductGrid({ items, onAdd }) {
  return <ul>{items.map((p) => <li key={p.id}>{p.name} <button onClick={onAdd}>Add</button></li>)}</ul>;
});
:::

::: code jsx Useless memoization (don't do this)
function Price({ amount, currency }) {
  const label = useMemo(() => `${amount} ${currency}`, [amount, currency]);   // ❌ cheap string concat
  const onClick = useCallback(() => console.log(label), [label]);             // ❌ passed to a plain <button>
  return <button onClick={onClick}>{label}</button>;
}
// ✅ just write it:
// const label = `${amount} ${currency}`;
// <button onClick={() => console.log(label)}>{label}</button>
:::

::: warning ⚠️ Common mistakes
- Wrapping everything in `useMemo`/`useCallback` "for performance" without measuring.
- `useCallback` for a function passed to a **non-memoized** child: the child re-renders anyway.
- Wrong or missing deps → stale values (the linter catches it).
- Expecting `useMemo` to be a guaranteed cache: React may discard it (e.g. offscreen), so code must still be correct without it.
- Memoizing a value whose deps change every render (an inline object in deps): it never hits the cache.
:::

::: understand
- Memoization trades memory + comparisons for skipped work; it only pays off when the work or a re-render is expensive.
- Identity matters because `React.memo` and dependency arrays compare with `Object.is`.
- The compiler makes this mostly automatic, but understanding it is still a top interview topic.
:::

::: ask
- *"Is the React Compiler enabled?"* Then most manual memoization can go.
- *"Did we measure?"* React DevTools Profiler shows which components re-render and how long they take.
:::

::: important ⭐ Say this in the interview
"useMemo caches the result of a calculation and useCallback caches a function, both until their dependencies change. They're worth it in two situations: an expensive computation, like filtering and sorting thousands of items, and keeping a stable reference for props of a React.memo child or for effect dependencies. In my measurement, fifty unrelated re-renders that filtered twenty thousand products took about 126 milliseconds without useMemo and about one millisecond with it. Otherwise I don't add them, because they cost comparisons and clutter. With React Compiler 1.0 most of this is automatic."
:::

::: links
react.dev: useMemo | https://react.dev/reference/react/useMemo
react.dev: useCallback | https://react.dev/reference/react/useCallback
React Compiler v1.0 | https://react.dev/blog/2025/10/07/react-compiler-1
:::

=== useEffect vs useLayoutEffect
@p 2
@tags react, hooks, useLayoutEffect, rendering
@quick
- Order of one update: **render → commit DOM → `useLayoutEffect` → browser paint → `useEffect`**.
- `useLayoutEffect` runs **synchronously before paint**: use it to **measure** the DOM and adjust (tooltip position, scroll restore) without a visible flicker.
- `useEffect` runs **after paint**: data fetching, subscriptions, logging; it never delays the first frame.
- Heavy work in a layout effect **blocks painting** and hurts responsiveness (INP).
- On the server, neither runs; layout effects warn in older React SSR (use `useEffect` or render only on the client).

::: text 🧒 In simple words
Think of a photographer. `useLayoutEffect` is fixing someone's hair **after they stood up but before the photo is taken**: the photo is perfect but everyone waits a moment. `useEffect` is fixing the hair **after the photo**: no waiting, but the first photo shows messy hair (a flicker) if the fix was visible.
:::

::: text 📖 Detailed answer
Both hooks have the same signature and cleanup rules. Only **timing** differs:

| | `useLayoutEffect` | `useEffect` |
|---|---|---|
| Runs | after DOM mutations, **before** the browser paints | **after** paint (usually) |
| Blocks paint? | yes, synchronous | no |
| State updates inside | applied before the user sees anything | the user may see one frame of the old state |
| Use for | measuring layout (size, position), synchronous DOM fixes, scroll position | everything else |
| Server rendering | doesn't run | doesn't run |

### Typical example: a tooltip
1. Render the tooltip at a default position.
2. Measure the trigger and tooltip (`getBoundingClientRect()`).
3. If it would overflow the viewport, move it above.
With `useEffect`, step 1 is painted first → the tooltip **jumps**. With `useLayoutEffect`, the corrected position is painted directly.

### Related
- `useInsertionEffect`: runs before layout effects; only for CSS-in-JS libraries to inject styles.
- `flushSync`: forces a synchronous render (e.g. scroll to a newly added item right after setState).
:::

::: diagram Where each effect runs in one update
flowchart LR
  A["Render"] --> B["Commit DOM"] --> C["useLayoutEffect: blocks paint"] --> D["Browser paints"] --> E["useEffect"]
:::

::: image useLayoutEffect vs useEffect in the update timeline
/images/react/layout-effect.svg
:::

::: text 🪜 Step by step
Tooltip with `useLayoutEffect`:
1. Render returns `<div ref={tipRef} style={{ top: y }}>` with an initial guess `y`.
2. React commits the DOM node (not painted yet).
3. The layout effect measures `tipRef.current.getBoundingClientRect()`, sees it overflows, calls `setY(newY)`.
4. React re-renders **synchronously** and commits the new position, still before paint.
5. The browser paints once, with the correct position: no flicker.
:::

::: code jsx Tooltip positioned without flicker
import { useLayoutEffect, useRef, useState } from 'react';

function Tooltip({ anchorRect, children }) {
  const ref = useRef(null);
  const [top, setTop] = useState(anchorRect.bottom + 8);        // first guess: below the anchor

  useLayoutEffect(() => {
    const { height } = ref.current.getBoundingClientRect();     // measure before paint
    if (anchorRect.bottom + 8 + height > window.innerHeight) {
      setTop(anchorRect.top - height - 8);                      // not enough room: show it above
    }
  }, [anchorRect]);

  return (
    <div ref={ref} role="tooltip" style={{ position: 'fixed', top, left: anchorRect.left }}>
      {children}
    </div>
  );
}
:::

::: code javascript Browser demo: the order of the phases (runnable)
// Simulates one React update and records when each phase runs relative to "paint".
const log = [];
function update({ layoutEffect, effect }) {
  log.push('render');
  log.push('commit DOM');
  layoutEffect();                              // synchronous, same task as the commit
  return new Promise((resolve) => {
    setTimeout(() => {                         // the browser paints between tasks
      log.push('paint');
      effect();                                // passive effects run after paint
      resolve();
    }, 0);
  });
}
update({ layoutEffect: () => log.push('useLayoutEffect'), effect: () => log.push('useEffect') }).then(() => {
  console.log(log.join(' → '));
  console.log('layout effect before paint, effect after', log.indexOf('useLayoutEffect') < log.indexOf('paint') && log.indexOf('useEffect') > log.indexOf('paint') ? '✅' : '❌ FAIL');
});
:::

::: warning ⚠️ Common mistakes
- Using `useLayoutEffect` by default "to be safe": it delays every paint.
- Fetching data in a layout effect (it can't make the network faster, it only blocks the UI).
- Measuring the DOM in `useEffect` and getting a visible jump.
- Expecting layout effects to run during SSR.
:::

::: understand
- Same API, different moment: before paint (layout) vs after paint (effect).
- Use layout effects only for **read layout → write layout** before the user sees it.
:::

::: ask
- *"Is there a visible flicker?"* That's the signal to consider `useLayoutEffect`.
- *"Server-rendered?"* Then make sure the component behaves well before effects run.
:::

::: important ⭐ Say this in the interview
"Both hooks take the same arguments; the difference is timing. After React commits the DOM, it runs layout effects synchronously before the browser paints, then paints, then runs normal effects. I use useLayoutEffect only to measure layout and adjust it before the user sees the frame, for example to flip a tooltip that would overflow, because doing it in useEffect causes a one-frame jump. Everything else, like fetching and subscriptions, goes in useEffect so it never blocks painting."
:::

::: links
react.dev: useLayoutEffect | https://react.dev/reference/react/useLayoutEffect
react.dev: useInsertionEffect | https://react.dev/reference/react/useInsertionEffect
:::

=== How do you build a custom hook? (useDebounce, useFetch)
@p 3
@tags react, hooks, custom-hooks, reuse
@quick
- A custom hook is a function named `useSomething` that **calls other hooks** and returns whatever is useful.
- It shares **logic**, not state: each component that calls it gets its **own** state and effects.
- Good candidates: debouncing, fetching, media queries, local storage, online status, form fields.
- Measured: typing "react hooks" → **11** API calls without debounce, **1** with `useDebounce(300)`.
- Keep them focused and return stable values (memoize returned functions if consumers depend on them).

::: text 🧒 In simple words
A custom hook is a **recipe card**. Two cooks can follow the same recipe card in their own kitchens; each one gets their own cake. Sharing the recipe doesn't share the cake.
:::

::: text 📖 Detailed answer
### Why
Components often repeat the same stateful logic: "track window width", "fetch this URL and handle loading/error", "debounce this value". Before hooks you used HOCs or render props; now you extract a function.

### Rules
- Name starts with `use` (so the linter applies the Rules of Hooks inside it).
- It may call any hooks; it follows the same rules (top level only).
- It returns anything: a value, a tuple `[value, setValue]`, or an object `{ data, error, loading }`.

### Designing a good hook
| Do | Why |
|---|---|
| One responsibility (`useDebounce`, `useOnlineStatus`) | composable, testable |
| Accept configuration as arguments (`delay`) | reusable |
| Clean up everything (timers, listeners, requests) | no leaks |
| Return memoized functions (`useCallback`) if consumers pass them to deps | avoids effect loops in callers |
| Prefer `useSyncExternalStore` for browser/global stores | correct in concurrent rendering |

### Testing
Use `renderHook` from React Testing Library, or test through a small component.
:::

::: diagram One hook, many components, separate state
flowchart TD
  H["useDebounce(value, ms)"] --> A["SearchBox: own state"]
  H --> B["UserFilter: own state"]
  H --> C["PriceSlider: own state"]
:::

::: image Custom hooks reuse logic; each call has its own state (measured: 11 → 1 API calls)
/images/react/custom-hooks.svg
:::

::: chart bar Measured: API calls while typing "react hooks" (11 keys, 40 ms apart, React 19.3)
Search input,API calls
Raw value,11
useDebounce with 300 ms,1
:::

::: text 🪜 Step by step
How `useDebounce(text, 300)` works while typing "abc":
1. "a": the hook's effect starts a 300 ms timer to set `debounced = "a"`.
2. "b" 40 ms later: `value` changed → React runs the **cleanup** (clears the "a" timer) and starts a new timer for "ab".
3. "c": same → timer for "abc".
4. 300 ms of silence: the timer fires → `debounced = "abc"` → re-render.
5. The component's fetch effect depends on `debounced`, so it fires **once**.
:::

::: code jsx useDebounce, useFetch and useLocalStorage
import { useEffect, useState, useSyncExternalStore } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);                          // a new value cancels the pending one
  }, [value, delay]);
  return debounced;
}

export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => controller.abort();                       // no race conditions
  }, [url]);
  return state;
}

export function useOnlineStatus() {                        // external store → useSyncExternalStore
  return useSyncExternalStore(
    (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; },
    () => navigator.onLine,
    () => true,                                            // server snapshot
  );
}

// Using them together
function SearchPage() {
  const [text, setText] = useState('');
  const q = useDebounce(text, 300);
  const { data, loading, error } = useFetch(`/api/search?q=${encodeURIComponent(q)}`);
  const online = useOnlineStatus();
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} disabled={!online} />
      {loading ? <p>Searching…</p> : error ? <p role="alert">{error.message}</p> : <ul>{data?.map((r) => <li key={r.id}>{r.title}</li>)}</ul>}
    </>
  );
}
:::

::: code javascript Browser demo: debounce while "typing" (runnable)
// The same idea as useDebounce, without React: only the last value after a pause is used.
function debounce(fn, ms) {
  let timer;
  return (value) => { clearTimeout(timer); timer = setTimeout(() => fn(value), ms); };
}
const apiCalls = [];
const search = debounce((q) => apiCalls.push(q), 100);

let typed = '';
const keys = [...'react hooks'];
keys.forEach((ch, i) => setTimeout(() => { typed += ch; search(typed); }, i * 20));   // 20 ms between keys

setTimeout(() => {
  console.log('API calls:', JSON.stringify(apiCalls));
  console.log('11 keystrokes → 1 request', apiCalls.length === 1 && apiCalls[0] === 'react hooks' ? '✅' : '❌ FAIL');
}, keys.length * 20 + 250);
:::

::: warning ⚠️ Common mistakes
- Naming it `getSomething` or `fetchSomething`: without the `use` prefix the linter won't check it, and readers won't know it uses hooks.
- Expecting two components using the same hook to **share** state (they don't; use context or a store).
- Returning a new function/object every render that callers put in effect deps → loops.
- Forgetting cleanup inside the hook (timers, listeners, requests).
- Building a giant `useEverything()` hook.
:::

::: understand
- Custom hooks = **reusable stateful logic**; state stays per caller.
- They compose: `useSearch` can use `useDebounce` and `useFetch`.
- `useSyncExternalStore` is the correct way to subscribe to external stores in concurrent React.
:::

::: ask
- *"Should this be a hook, a component, or a utility function?"* No hooks inside → it's just a function.
- *"Is there a library already?"* (TanStack Query for fetching, usehooks-ts for common hooks.)
:::

::: important ⭐ Say this in the interview
"A custom hook is a function whose name starts with use and that calls other hooks to package stateful logic for reuse. It shares the logic, not the state: every component that calls it gets its own state and effects. For example useDebounce uses useState and a useEffect with a timer that's cleared in the cleanup; typing 'react hooks' then triggers one request instead of eleven. I keep hooks small, clean up everything they start, return stable functions, and use useSyncExternalStore when subscribing to an external store."
:::

::: links
react.dev: Reusing logic with custom hooks | https://react.dev/learn/reusing-logic-with-custom-hooks
react.dev: useSyncExternalStore | https://react.dev/reference/react/useSyncExternalStore
Testing Library: renderHook | https://testing-library.com/docs/react-testing-library/api/#renderhook
:::
