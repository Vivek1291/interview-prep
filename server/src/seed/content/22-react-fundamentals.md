@section React Fundamentals
@icon 🧱
@color #06b6d4
@desc How React thinks: components, JSX, props and state, rendering and reconciliation, keys, batching, forms and context. Every answer has simple words, diagrams, numbers measured with React 19.3 and a model interview answer.

=== What is React and how does it update the screen?
@p 3
@tags react, rendering, virtual-dom, reconciliation
@quick
- React = a library for building UIs from **components**: functions that take **props** and return what the UI should look like.
- You write UI as a function of state: `UI = f(state)`. Change the state, React re-renders and updates the DOM for you.
- Every update has 3 steps: **trigger** (setState) → **render** (call components, build a new element tree) → **commit** (change only the DOM nodes that differ).
- Render must be **pure** (no side effects); side effects go in event handlers or `useEffect`.
- Measured: editing 1 row of 1,000 → `innerHTML` rebuild touches **4,002** nodes, React changes **1** text node.

::: text 🧒 In simple words
Think of React as an architect with a **drawing of your house**. You never move bricks yourself. When something should change (a new room colour), you give the architect a **new drawing**. The architect compares it with the old drawing and tells the builders to repaint **only that one wall**. The drawing is cheap paper (JavaScript objects); the builders are slow and expensive (the real DOM). React's job is to keep the number of builder trips as small as possible.
:::

::: text 📖 Detailed answer
**React** is a JavaScript library for building user interfaces out of **components**. It is *declarative*: you describe **what** the UI should look like for the current data, and React works out **how** to change the page.

### The building blocks
| Concept | What it is | Example |
|---|---|---|
| **Component** | A function that returns UI | `function Price({ value }) { return <b>{value} €</b>; }` |
| **Props** | Inputs passed by the parent (read-only) | `<Price value={9} />` |
| **State** | Data owned by a component that can change | `const [count, setCount] = useState(0)` |
| **Element** | The plain object a component returns | `{ type: 'b', props: { children: '9 €' } }` |
| **Root** | Where React attaches to the page | `createRoot(document.getElementById('root'))` |

### What happens on an update
1. **Trigger**: something calls `setState`, a parent passes new props, or a context value changes.
2. **Render**: React calls your component functions again. They return a new tree of elements (this is the "virtual DOM"). Nothing on the screen changes yet.
3. **Reconcile**: React compares the new tree with the previous one to find the differences.
4. **Commit**: React applies only those differences to the real DOM, sets refs, then runs effects.
5. The browser **paints**.

### Why this design?
- **Predictable**: the UI is always a function of the current state, so there are no forgotten manual DOM updates.
- **Fast enough by default**: DOM operations are batched and minimal.
- **Composable**: small components combine into big screens; the same model works on the web (react-dom), mobile (React Native) and the server (SSR, Server Components).
:::

::: diagram From setState to pixels
flowchart LR
  T["Trigger: setState, new props, context"] --> R["Render: call components, new element tree"]
  R --> D["Reconcile: diff with previous tree"]
  D --> C["Commit: change only differing DOM nodes"]
  C --> P["Browser paints, then useEffect runs"]
:::

::: image How React updates the screen: trigger, render, reconcile, commit, paint (measured: 1 DOM change instead of 4,002)
/images/react/render-commit.svg
:::

::: chart bar Measured: DOM nodes created, removed or changed to edit 1 row of a 1,000-row list (React 19.3, jsdom)
Approach,DOM nodes touched
Rebuild with innerHTML,4002
React re-render,1
:::

::: text 🪜 Step by step
Follow a click on the counter below:
1. The first `root.render(<Counter />)` calls `Counter()`, which returns `<button>Clicked 0 times</button>`; React creates the DOM button (**mount**).
2. You click: React runs `onClick`, which calls `setCount(1)`. React **schedules** a re-render; `count` doesn't change in the current function call.
3. React calls `Counter()` again. `useState` now returns `1`, so the function returns `<button>Clicked 1 times</button>`.
4. React diffs the old and new element: same type (`button`), only the text differs.
5. Commit: React updates **one text node**. The button element, its event listener and focus stay the same.
:::

::: code jsx A component with state (React 19)
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Counter() {
  const [count, setCount] = useState(0);           // state that survives re-renders
  return (
    <button onClick={() => setCount(count + 1)}>  {/* event handler: side effects are OK here */}
      Clicked {count} times
    </button>
  );
}

createRoot(document.getElementById('root')).render(<Counter />);
:::

::: code jsx Imperative vs declarative: the same feature
// ❌ Imperative (vanilla DOM): you must remember every DOM change
const btn = document.querySelector('#like');
let liked = false;
btn.addEventListener('click', () => {
  liked = !liked;
  btn.textContent = liked ? '♥ Liked' : '♡ Like';
  btn.classList.toggle('active', liked);
});

// ✅ Declarative (React): describe the UI for any state
function LikeButton() {
  const [liked, setLiked] = useState(false);
  return (
    <button className={liked ? 'active' : ''} onClick={() => setLiked(!liked)}>
      {liked ? '♥ Liked' : '♡ Like'}
    </button>
  );
}
:::

::: warning ⚠️ Common mistakes
- Saying "React is fast because of the virtual DOM". The real win is the **programming model**; the diff itself costs time. Well-written vanilla code can be faster.
- Mutating the DOM directly (`document.getElementById(...).innerText = ...`) in a React component: React will overwrite it on the next render.
- Doing side effects during render (fetching, subscribing, `Math.random()` for ids). Render must be pure; React may call it more than once (Strict Mode does this on purpose).
- Thinking `setState` changes the variable immediately: the new value appears in the **next render**.
:::

::: understand
- `UI = f(state)`: components are functions from data to UI description; React handles the "how".
- Render (calculate) and commit (apply) are separate; only commit touches the DOM.
- React re-renders the component that changed **and its children** by default; that's why memoization and state placement matter later.
:::

::: ask
- *"Is this a client-rendered app, SSR, or React Server Components (Next.js App Router)?"* The answer changes where code runs.
- *"Which React version?"* React 19 added Actions, `use()` and ref-as-prop; 19.2/19.3 added Activity, View Transitions and more.
- If asked "React vs framework X": compare the model (components, one-way data flow, ecosystem), not just speed.
:::

::: important ⭐ Say this in the interview
"React is a declarative library for building UIs out of components. A component is a function of props and state that returns a description of the UI as elements. When state changes, React re-renders the affected components to get a new element tree, reconciles it with the previous tree, and commits only the differences to the real DOM. Rendering must be pure; side effects belong in event handlers or effects. For example, editing one row in a list of a thousand changes one text node instead of rebuilding the list."
:::

::: links
react.dev: Thinking in React | https://react.dev/learn/thinking-in-react
react.dev: Render and commit | https://react.dev/learn/render-and-commit
react.dev: Keeping components pure | https://react.dev/learn/keeping-components-pure
:::

=== What is JSX and what does it compile to?
@p 3
@tags react, jsx, compiler
@quick
- JSX is **syntax sugar**: `<b className="x">Hi</b>` compiles to `jsx('b', { className: 'x', children: 'Hi' })` (React 17+ automatic runtime).
- The call returns a **plain object** (a React element): `{ type, props, key }`. No DOM yet.
- `{ }` holds any JavaScript **expression** (not statements): `{user.name}`, `{ok ? 'yes' : 'no'}`, `{items.map(...)}`.
- Capitalized tags are components (`<Price />`), lowercase are DOM tags (`<div>`).
- `className`, `htmlFor`, camelCase events (`onClick`), one parent or a Fragment `<>…</>`.

::: text 🧒 In simple words
JSX looks like HTML, but it's really a **shorthand for writing JavaScript objects**. It's like writing a shopping list in emojis: 🍎×3 is quicker to read than `{ fruit: 'apple', count: 3 }`, but a computer (the compiler) turns it into the long form before running it. Your browser never sees JSX.
:::

::: text 📖 Detailed answer
JSX is an extension of JavaScript syntax. A build tool (Babel, SWC, esbuild, TypeScript) compiles it.

### What the compiler produces
| You write | Compiled (automatic runtime, React 17+) |
|---|---|
| `<div className="card">Hi</div>` | `jsx('div', { className: 'card', children: 'Hi' })` |
| `<Price value={9} />` | `jsx(Price, { value: 9 })` |
| `<ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>` | `jsx('ul', { children: items.map(i => jsx('li', { children: i.name }, i.id)) })` |
| `<>A B</>` | `jsx(Fragment, { children: 'A B' })` |

Old React (before 17) compiled to `React.createElement(...)`, which is why old files needed `import React from 'react'`.

### Rules that follow from "JSX is JavaScript"
- `class` and `for` are reserved words → **`className`**, **`htmlFor`**.
- Attributes are props, so they're **camelCase**: `onClick`, `tabIndex`, `style={{ fontSize: 14 }}` (an object).
- You can only embed **expressions**: use ternaries, `&&` and `.map()`, not `if`/`for` statements inside braces.
- A component must return **one** element (or a Fragment, or an array with keys, or `null`).
- Text is **escaped** automatically: `{userInput}` can't inject HTML. Raw HTML needs the explicit `dangerouslySetInnerHTML` escape hatch.
:::

::: diagram From JSX to the DOM
flowchart LR
  A["JSX in your file"] -->|"compiler (build time)"| B["jsx(type, props) calls"]
  B -->|"runs in the browser"| C["Element objects: type, props, key"]
  C -->|"React render + commit"| D["Real DOM nodes"]
:::

::: image JSX compiles to a jsx() call that returns a plain element object
/images/react/jsx-compile.svg
:::

::: text 🪜 Step by step
For `<Card title="Hi"><b>1</b></Card>`:
1. The compiler sees a capitalized tag → `jsx(Card, { title: 'Hi', children: jsx('b', { children: '1' }) })`.
2. At runtime the inner call runs first and returns `{ type: 'b', props: { children: '1' } }`.
3. The outer call returns `{ type: Card, props: { title: 'Hi', children: <that b element> } }`.
4. React sees `type` is a function, so it **calls** `Card(props)` to get more elements, and repeats until only DOM tags are left.
5. React creates or updates DOM nodes for those tags.
:::

::: code javascript Browser demo: build a tiny jsx() and render elements to HTML (runnable)
// A 20-line model of what React does with JSX: jsx() makes objects, render() walks them.
function jsx(type, props = {}) { return { type, props }; }

function render(el) {
  if (el == null || el === false) return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el).replace(/</g, '&lt;');   // text is escaped
  if (Array.isArray(el)) return el.map(render).join('');
  if (typeof el.type === 'function') return render(el.type(el.props));          // component: call it
  const { children, className, ...rest } = el.props;
  const attrs = Object.entries({ class: className, ...rest }).filter(([, v]) => v != null && typeof v !== 'function')
    .map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<${el.type}${attrs}>${render(children)}</${el.type}>`;
}

// <Card title="Prices">{items.map((i) => <Price value={i.value} />)}</Card>, compiled by hand:
const Price = ({ value }) => jsx('b', { children: `${value} €` });
const Card = ({ title, children }) => jsx('div', { className: 'card', children: [jsx('h3', { children: title }), children] });
const items = [{ id: 1, value: 9 }, { id: 2, value: 12 }];
const tree = jsx(Card, { title: 'Prices', children: items.map((i) => jsx(Price, { value: i.value })) });

const html = render(tree);
console.log(html);
console.log('elements are plain objects', typeof tree === 'object' && tree.type === Card ? '✅' : '❌ FAIL');
console.log('components are called, tags become HTML', html === '<div class="card"><h3>Prices</h3><b>9 €</b><b>12 €</b></div>' ? '✅' : '❌ FAIL');
console.log('text is escaped', render(jsx('p', { children: '<script>' })) === '<p>&lt;script></p>' ? '✅' : '❌ FAIL');
:::

::: code jsx JSX patterns you use every day
function ProductList({ products, loading, user }) {
  if (loading) return <Spinner />;                       // early return instead of if-in-JSX

  return (
    <>                                                    {/* Fragment: no extra <div> */}
      <h2 className="title">Products ({products.length})</h2>
      {user && <p>Welcome back, {user.name}!</p>}       {/* render only if truthy */}
      {products.length === 0 ? (
        <p>No products yet.</p>                           // ternary for if/else
      ) : (
        <ul>
          {products.map((p) => (
            <li key={p.id} style={{ fontWeight: p.featured ? 700 : 400 }}>
              <label htmlFor={`qty-${p.id}`}>{p.name}</label>
              <input id={`qty-${p.id}`} type="number" defaultValue={1} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
:::

::: warning ⚠️ Common mistakes
- `{count && <Badge />}` when `count` is `0` renders a **"0"** on the page. Use `{count > 0 && <Badge />}`.
- Writing `class=` or `onclick=`; it must be `className` and `onClick`.
- Calling a component like a function: `{Price({ value: 9 })}`. It loses hooks/state rules; write `<Price value={9} />`.
- Forgetting `key` on items created with `.map()`, or using `Math.random()` as a key.
- Defining a component **inside** another component: it's a new type on every render, so React remounts it and loses its state.
:::

::: understand
- JSX → `jsx()` calls → element objects → DOM. Knowing this explains every JSX rule.
- Elements are **immutable descriptions**; React compares them, never mutates them.
- Because text is escaped, JSX protects you from XSS unless you use `dangerouslySetInnerHTML`.
:::

::: ask
- *"Which build tool and runtime: automatic (`react/jsx-runtime`) or classic (`React.createElement`)?"*
- *"TypeScript (TSX)?"* Then props get types and JSX is type-checked.
- If asked whether JSX is required: no, `createElement` works, but nobody writes it by hand.
:::

::: important ⭐ Say this in the interview
"JSX is syntax that a compiler turns into JavaScript function calls. Since React 17 the automatic runtime turns `<Button size="lg">Save</Button>` into `jsx(Button, { size: 'lg', children: 'Save' })`, which returns a plain object called a React element, with a type and props. React calls component types to get more elements and eventually turns DOM-tag elements into real DOM nodes. That's why JSX uses `className`, camelCase events, takes expressions inside braces, and escapes text automatically."
:::

::: links
react.dev: Writing markup with JSX | https://react.dev/learn/writing-markup-with-jsx
React blog: Introducing the new JSX transform | https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
react.dev: Conditional rendering | https://react.dev/learn/conditional-rendering
:::

=== Props vs state: what's the difference, and what is "lifting state up"?
@p 3
@tags react, props, state, data-flow
@quick
- **Props** = inputs from the parent, **read-only** inside the child. **State** = data the component owns and can change with `setState`.
- Data flows **down** (props); events flow **up** (callbacks passed as props).
- Two siblings need the same data → move the state to their **closest common parent** ("lift state up").
- Derive values instead of copying props into state (`fullName = first + ' ' + last`, not a second state).
- Changing state re-renders the component **and its children**; changing a prop object from the child is a bug.

::: text 🧒 In simple words
**Props** are like the **ingredients a parent hands you**: you can cook with them, but you don't swap them for other ingredients. **State** is **your own notebook**: you write in it and rub things out. If your brother and you both need the same shopping list, you don't keep two notebooks that disagree; you put **one list on the fridge** (the closest common parent) and both of you read it.
:::

::: text 📖 Detailed answer
| | Props | State |
|---|---|---|
| Who owns it | the **parent** | the component itself |
| Can the component change it? | **No** (read-only) | Yes, with the setter from `useState`/`useReducer` |
| How it changes | parent re-renders with new values | `setX(newValue)` schedules a re-render |
| Typical content | configuration, data to show, callbacks | user input, toggles, fetched data, UI flags |
| Example | `<Avatar size={48} user={u} />` | `const [open, setOpen] = useState(false)` |

### One-way data flow
React data flows in **one direction**: parent → child via props. A child that needs to change something calls a **function prop** the parent gave it (`onAdd`, `onChange`). This keeps one **single source of truth** for every piece of data, and makes bugs easy to trace: to find who changed something, go up the tree.

### Lifting state up
When two components must stay in sync (a search box and a results list), the state can't live in either one: move it to the **closest common parent** and pass it down. The parent becomes the "owner"; children become "controlled" by props.

### Derived data
If you can **calculate** a value from props or other state, don't store it. Calculate it during render (or with `useMemo` if expensive). Copies get out of sync.
:::

::: diagram Lifting state up for two siblings
flowchart TD
  P["SearchPage: query state"] -->|"query, onChange"| S["SearchBox"]
  P -->|"query"| R["Results"]
  S -.->|"onChange(text): event up"| P
:::

::: image One-way data flow: state in the parent, props down, events up
/images/react/data-flow.svg
:::

::: text 🪜 Step by step
Building a todo app the React way:
1. Find the minimal state: the **list of todos** (the count, "remaining" and filtered lists can be derived).
2. Find who needs it: `AddTodo` (to add) and `TodoList` (to show). Their common parent is `TodoApp` → state lives there.
3. Pass data down: `<TodoList todos={todos} />`.
4. Pass a callback down for changes: `<AddTodo onAdd={(text) => setTodos([...todos, { id: crypto.randomUUID(), text }])} />`.
5. `AddTodo` calls `onAdd(text)`; the parent updates state; React re-renders the parent and both children with the new list.
:::

::: code jsx Lifting state up (complete example)
import { useState } from 'react';

export default function TodoApp() {
  const [todos, setTodos] = useState([{ id: 1, text: 'Learn props', done: true }]);   // single source of truth
  const remaining = todos.filter((t) => !t.done).length;                              // derived, not stored

  const add = (text) => setTodos((list) => [...list, { id: Date.now(), text, done: false }]);
  const toggle = (id) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <section>
      <AddTodo onAdd={add} />
      <TodoList todos={todos} onToggle={toggle} />
      <p>{remaining} left</p>
    </section>
  );
}

function AddTodo({ onAdd }) {
  const [text, setText] = useState('');            // local UI state: only this component cares
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(''); } }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What next?" />
      <button>Add</button>
    </form>
  );
}

function TodoList({ todos, onToggle }) {
  return (
    <ul>
      {todos.map((t) => (
        <li key={t.id}>
          <label><input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} /> {t.text}</label>
        </li>
      ))}
    </ul>
  );
}
:::

::: code jsx Anti-pattern: copying props into state
// ❌ The copy is set once; when the parent sends a new `user`, `name` keeps the old value
function Profile({ user }) {
  const [name, setName] = useState(user.name);
  return <h2>{name}</h2>;
}

// ✅ Read the prop directly (or derive from it)
function ProfileFixed({ user }) {
  return <h2>{user.name}</h2>;
}

// ✅ If you really need an editable copy that resets when the user changes: give it a key
// <EditProfile key={user.id} user={user} />  → a new user remounts the form with fresh state
:::

::: warning ⚠️ Common mistakes
- Mutating props or state objects: `props.user.name = 'x'` or `todos.push(t); setTodos(todos)`. React compares references, sees the **same array**, and may skip the update. Always create a new object/array.
- Duplicating the same data in two components' state: they drift apart. Lift it up instead.
- Storing derived values (`filteredTodos`, `total`) in state and forgetting to update them.
- Lifting state **too high** (to the app root) just in case: every keystroke then re-renders the whole app. Keep state as low as possible.
:::

::: understand
- Ask "who owns this data?" for every piece of state. One owner, many readers.
- Props make components **reusable** (same component, different data); state makes them **interactive**.
- Immutability isn't style: React's change detection uses `Object.is` on state values.
:::

::: ask
- *"Is this data shared by other screens? Does it come from the server?"* Server data often belongs in a cache (React Query, framework loaders) rather than component state.
- *"How big is the tree under the state owner?"* Decides whether lifting is fine or context/colocation is better.
:::

::: important ⭐ Say this in the interview
"Props are inputs a component receives from its parent and must treat as read-only; state is data a component owns and changes with its setter, which triggers a re-render. Data flows one way: down through props, while changes flow up through callback props. When two components need the same data, I lift the state to their closest common parent so there's a single source of truth, and I derive values like counts or filtered lists during render instead of storing copies. I also keep state as close as possible to where it's used, to limit re-renders."
:::

::: links
react.dev: Passing props to a component | https://react.dev/learn/passing-props-to-a-component
react.dev: Sharing state between components | https://react.dev/learn/sharing-state-between-components
react.dev: Choosing the state structure | https://react.dev/learn/choosing-the-state-structure
:::

=== How does reconciliation work, and why do keys matter?
@p 3
@tags react, reconciliation, keys, diffing
@quick
- **Reconciliation** = React comparing the new element tree with the previous one to decide what to keep, update or remount.
- Rule 1: different **type** at the same position (`div`→`span`, `A`→`B`) → destroy the old subtree (state lost) and mount a new one.
- Rule 2: same type → keep the DOM node/component (state kept), update changed props.
- **Keys** identify list items between renders. Use a stable id; **index keys break** when items are inserted, removed or reordered.
- Measured (1,000 rows, prepend one): index keys → **1,001** DOM changes, stable keys → **1**.

::: text 🧒 In simple words
Imagine a teacher with name tags on every desk. When a new student joins **at the front**, a smart teacher just adds one desk. A teacher who identifies students by **seat number** ("seat 1, seat 2…") thinks everyone changed: seat 1 now has a different face, so she re-introduces every student and hands each the previous person's notebook. **Keys are name tags**; the index is the seat number.
:::

::: text 📖 Detailed answer
Comparing two arbitrary trees optimally is O(n³). React uses two heuristics to make it **O(n)**:

### 1. Elements of different types produce different trees
- `<div>` → `<section>`, or `<Login>` → `<Signup>` at the same place: React **unmounts** the old subtree (DOM removed, state destroyed, effects cleaned up) and **mounts** the new one.
- Same DOM tag: React keeps the node and updates only changed attributes.
- Same component type: React keeps the instance (its **state survives**) and re-renders it with new props.

### 2. Keys identify children in a list
Without keys React matches children **by position**. With keys it matches by **identity**: the same key in the old and new list means "the same item", even if it moved.

| Change in the list | Index as key | Stable id as key |
|---|---|---|
| append at end | fine | fine |
| **prepend / insert** | every row "changes", state shifts to the wrong row | one insert |
| **delete from middle** | rows after it get the wrong state | one removal |
| **reorder / sort** | all contents updated, state mixed up | nodes moved |

Index keys are OK only when the list is **static** (never reordered, inserted into or filtered) and items have no state.

### Keys outside lists: reset a component on purpose
Changing a component's `key` makes React treat it as a **new** component: `<ProfileForm key={userId} />` resets the form's state when the user changes.
:::

::: diagram How React matches children
flowchart TD
  N["New child at position i"] --> K{"Has key?"}
  K -->|"yes"| F["Find old child with the same key"]
  K -->|"no"| P["Use old child at position i"]
  F --> T{"Same type?"}
  P --> T
  T -->|"yes"| U["Keep node and state, update props"]
  T -->|"no"| R["Unmount old subtree, mount new one"]
:::

::: image Prepending with index keys vs stable keys (measured: 1,001 vs 1 DOM changes)
/images/react/keys.svg
:::

::: chart bar Measured: DOM changes when prepending 1 item to a 1,000-item list (React 19.3, jsdom)
Key choice,DOM changes
key = index,1001
key = item.id,1
:::

::: text 🪜 Step by step
List `[A, B, C]` rendered with **index keys**, then we prepend `Z`:
1. Old: key0=A, key1=B, key2=C. New: key0=Z, key1=A, key2=B, key3=C.
2. React matches by key: key0 (was A, now Z) → same `<li>` type → **update text** A→Z. Same for key1 (B→A) and key2 (C→B).
3. key3 is new → **create** a node for C.
4. Result: 3 text updates + 1 insert, and any state inside each row (an input value, a checkbox) stays at its **old position**, now next to the wrong item.

With **id keys**: React sees ids A, B, C are unchanged and only `Z` is new → **1 insert** at the top; every row keeps its own state.
:::

::: code javascript Browser demo: count DOM operations of a keyed vs index diff (runnable)
// A small model of React's list diff: match children by key, count the DOM operations needed.
function diff(oldList, newList, keyOf) {
  const ops = [];
  const oldByKey = new Map(oldList.map((item, i) => [keyOf(item, i), item]));
  newList.forEach((item, i) => {
    const key = keyOf(item, i);
    if (!oldByKey.has(key)) ops.push(`insert ${item.text}`);
    else if (oldByKey.get(key).text !== item.text) ops.push(`update text ${oldByKey.get(key).text} → ${item.text}`);
    oldByKey.delete(key);
  });
  oldByKey.forEach((item) => ops.push(`remove ${item.text}`));
  return ops;
}

const before = [{ id: 'a', text: 'Apple' }, { id: 'b', text: 'Banana' }, { id: 'c', text: 'Cherry' }];
const after = [{ id: 'z', text: 'Zucchini' }, ...before];             // prepend one item

const byIndex = diff(before, after, (_, i) => i);
const byId = diff(before, after, (item) => item.id);
console.log('index keys →', byIndex.length, 'ops:', byIndex.join(' | '));
console.log('id keys    →', byId.length, 'op:', byId.join(' | '));
console.log('index keys touch every row', byIndex.length === 4 ? '✅' : '❌ FAIL');
console.log('stable keys: only one insert', byId.length === 1 && byId[0] === 'insert Zucchini' ? '✅' : '❌ FAIL');
:::

::: code jsx The classic index-key bug with inputs
// Type a note into the first row, then click "Add at top": the note jumps to the NEW row.
function Notes() {
  const [items, setItems] = useState([{ id: 1, name: 'Milk' }, { id: 2, name: 'Eggs' }]);
  const addTop = () => setItems([{ id: Date.now(), name: 'Bread' }, ...items]);
  return (
    <>
      <button onClick={addTop}>Add at top</button>
      <ul>
        {items.map((item, index) => (
          <li key={index}>               {/* ❌ use key={item.id} */}
            {item.name} <input placeholder="note" />
          </li>
        ))}
      </ul>
    </>
  );
}

// Resetting state on purpose with a key:
// <ChatRoom key={roomId} roomId={roomId} />   → switching rooms remounts ChatRoom with empty state
:::

::: warning ⚠️ Common mistakes
- Using the **array index** as key in lists that can change order or have items inserted/removed.
- `key={Math.random()}` or `key={uuid()}` during render: a new key every render → React remounts every row (slow, loses focus and state).
- Duplicate keys among siblings (two items with the same id): React warns and behavior is undefined.
- Thinking keys are passed as props: `key` is used by React and is **not** available as `props.key`.
- Conditionally rendering different component types at the same spot (`{isEdit ? <Form/> : <View/>}`) and being surprised the state resets: that's rule 1.
:::

::: understand
- Two rules: **type** decides keep vs remount; **key** decides identity within a list.
- State belongs to a **position in the tree** (plus key), not to the component function.
- A key change is the cleanest way to reset a subtree's state.
:::

::: ask
- *"Do the items have a stable unique id from the server?"* If not, generate one when the item is **created**, not during render.
- *"Can this list be sorted, filtered or reordered by drag and drop?"* Then index keys are definitely wrong.
:::

::: important ⭐ Say this in the interview
"Reconciliation is how React compares the new element tree with the previous one. It uses two heuristics to stay linear: if the element type at a position changes, React unmounts the old subtree and mounts a new one, losing its state; if the type is the same, it keeps the node or component instance and just updates props. In lists, keys tell React which child is which across renders. With stable ids, prepending an item to a thousand-row list is one DOM insertion; with index keys it's a thousand text updates plus an insert, and row state like input values ends up next to the wrong item. I also use a key change deliberately to reset a component."
:::

::: links
react.dev: Preserving and resetting state | https://react.dev/learn/preserving-and-resetting-state
react.dev: Rendering lists (keys) | https://react.dev/learn/rendering-lists
legacy docs: Reconciliation | https://legacy.reactjs.org/docs/reconciliation.html
:::

=== How do state updates work? (batching, functional updates, immutability)
@p 3
@tags react, state, batching, immutability
@quick
- `setState` doesn't change the variable now; it **queues** an update and React re-renders later with the new value.
- Updates are **batched**: several `setState` calls in one event (or timeout, or promise, since React 18) → **one** render.
- Need the latest value? Use the **updater function**: `setCount(c => c + 1)` (three of them add 3; `setCount(count + 1)` three times adds 1).
- State must be replaced, not mutated: `setUser({ ...user, name })`, `setList([...list, item])`.
- `flushSync(() => setX(v))` forces a synchronous render (rarely needed: measuring DOM right after an update).

::: text 🧒 In simple words
`setState` is like **putting a letter in the post box**, not handing it over in person. You can post three letters in a row; the postman (React) picks them all up together and delivers them in **one trip** (one render). If each letter says "make it 1 more than the number I saw this morning", all three say the same thing. If each says "add 1 to whatever is there", they add up.
:::

::: text 📖 Detailed answer
### State is a snapshot
Inside one render, `count` is a **constant**. The event handler you created during that render closes over that value. Calling `setCount(count + 1)` three times enqueues "set to 1" three times → result 1.

### Updater functions
`setCount(c => c + 1)` enqueues a **function**. React runs queued updaters in order, each with the result of the previous one → three updaters add 3. Use updaters whenever the next state depends on the previous one, especially in async code and intervals.

### Automatic batching (React 18+)
| Where the setState calls happen | React 17 | React 18 / 19 |
|---|---|---|
| React event handler (`onClick`) | batched | batched |
| `setTimeout`, promise `.then`, native listener | **not** batched (one render per call) | **batched** |
| inside `flushSync()` | n/a | rendered immediately |

### Immutability
React decides whether to re-render by comparing the old and new state with `Object.is`. Mutating an object keeps the same reference → React may **skip** the update, and memoized children won't see the change. Always create new objects and arrays:

| Goal | ❌ Mutation | ✅ New value |
|---|---|---|
| add item | `list.push(x)` | `[...list, x]` |
| remove item | `list.splice(i, 1)` | `list.filter(t => t.id !== id)` |
| update item | `list[i].done = true` | `list.map(t => t.id === id ? { ...t, done: true } : t)` |
| update nested | `user.address.city = c` | `{ ...user, address: { ...user.address, city: c } }` |
:::

::: diagram What happens to three setState calls
flowchart LR
  A["onClick: setA, setB, setC"] --> Q["Update queue"]
  Q --> R["One render with all three applied"]
  R --> C["One commit"]
:::

::: image Three setState calls → one render (measured with React 19.3)
/images/react/batching.svg
:::

::: chart bar Measured: renders caused by 3 setState calls (React 19.3, jsdom)
Where the 3 calls run,Renders
onClick handler,1
setTimeout callback,1
Promise.then,1
flushSync() around each,3
:::

::: text 🪜 Step by step
`onClick={() => { setCount(count + 1); setCount(count + 1); setCount(c => c + 1); }}` with `count = 0`:
1. The handler runs with the **snapshot** `count = 0`.
2. Queue: "replace with 1", "replace with 1", "updater c => c + 1".
3. The handler ends; React processes the queue once: 0 → 1 → 1 → **2**.
4. React renders the component **once** with `count = 2` and commits.
5. Inside the handler, `console.log(count)` after the calls still prints **0**: the variable belongs to the old render.
:::

::: code javascript Browser demo: a state queue with values vs updater functions (runnable)
// A tiny model of React's update queue to show why updater functions add up.
function createState(initial) {
  let state = initial;
  let queue = [];
  let renders = 0;
  return {
    get: () => state,
    renders: () => renders,
    set: (next) => queue.push(next),                 // enqueue, don't apply
    flush() {                                        // what React does once after the event (batching)
      for (const u of queue) state = typeof u === 'function' ? u(state) : u;
      queue = [];
      renders++;
    },
  };
}

const a = createState(0);
const snapshot = a.get();                            // like `count` in one render
a.set(snapshot + 1); a.set(snapshot + 1); a.set(snapshot + 1);
a.flush();

const b = createState(0);
b.set((c) => c + 1); b.set((c) => c + 1); b.set((c) => c + 1);
b.flush();

console.log('three setCount(count + 1) →', a.get(), '| three setCount(c => c + 1) →', b.get());
console.log('values from one snapshot give 1', a.get() === 1 ? '✅' : '❌ FAIL');
console.log('updater functions give 3', b.get() === 3 ? '✅' : '❌ FAIL');
console.log('batched: one render each', a.renders() === 1 && b.renders() === 1 ? '✅' : '❌ FAIL');
:::

::: code jsx Correct updates in real components
function Cart() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  const addThree = () => {
    setCount((c) => c + 1);                         // ✅ updater: depends on previous state
    setCount((c) => c + 1);
    setCount((c) => c + 1);                         // count goes up by 3, ONE render
  };

  const addItem = (product) =>
    setItems((list) => [...list, { ...product, qty: 1 }]);                       // ✅ new array

  const setQty = (id, qty) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, qty } : it)));  // ✅ new item object

  useEffect(() => {
    const t = setInterval(() => setCount((c) => c + 1), 1000);   // ✅ updater avoids a stale `count`
    return () => clearInterval(t);
  }, []);

  return <button onClick={addThree}>{count} · {items.length} items</button>;
}
:::

::: warning ⚠️ Common mistakes
- Reading state right after setting it (`setX(5); console.log(x)`) and expecting 5.
- `setCount(count + 1)` inside `setInterval` with `[]` deps: `count` is frozen at 0, so it shows 1 forever. Use `setCount(c => c + 1)`.
- Mutating arrays/objects then calling the setter with the **same reference**: UI doesn't update or memoized children miss it.
- Wrapping everything in `flushSync` "to make it work": it disables batching and hurts performance.
- Putting values that don't affect rendering in state (timer ids, previous values): use `useRef`.
:::

::: understand
- Each render has its **own** props, state and handlers (a snapshot); React gives you the new snapshot on the next render.
- Batching is why many updates in one event cost one render.
- Immutability makes change detection a cheap reference check (`Object.is`) and enables memoization.
:::

::: ask
- *"Which React version?"* Batching outside events only exists in React 18+ with `createRoot` (not legacy `ReactDOM.render`).
- *"Is the state complex (many fields that change together)?"* Then `useReducer` may be clearer than several `useState`s.
:::

::: important ⭐ Say this in the interview
"Calling setState doesn't change the variable immediately: it queues an update and React re-renders later, and state inside a render is a snapshot. Since React 18, all updates in the same tick are batched, even in timeouts and promises, so three setState calls cause one render. When the new value depends on the old one I use the updater form, `setCount(c => c + 1)`, which also avoids stale closures in intervals. And I never mutate state: I create new arrays and objects, because React detects changes by reference with Object.is."
:::

::: links
react.dev: State as a snapshot | https://react.dev/learn/state-as-a-snapshot
react.dev: Queueing a series of state updates | https://react.dev/learn/queueing-a-series-of-state-updates
react.dev: Updating objects in state | https://react.dev/learn/updating-objects-in-state
React 18: Automatic batching | https://react.dev/blog/2022/03/29/react-v18#new-feature-automatic-batching
:::

=== Controlled vs uncontrolled components (forms in React)
@p 2
@tags react, forms, controlled, uncontrolled
@quick
- **Controlled**: React state holds the value: `<input value={v} onChange={e => setV(e.target.value)} />`. React is the source of truth.
- **Uncontrolled**: the DOM holds the value: `<input defaultValue="" ref={r} />` or read it with `FormData` on submit.
- Controlled = instant validation, formatting, dependent fields; costs **one render per keystroke** (measured: 20 keys → 20 renders).
- Uncontrolled = less code and no re-renders; great with React 19 **form actions** (`<form action={fn}>`).
- `value` without `onChange` makes a read-only input (React warns); `value={undefined}` → `value="x"` switches modes (warning).

::: text 🧒 In simple words
A **controlled** input is like a **puppet**: React holds the strings and decides every letter shown. An **uncontrolled** input is a **free-roaming pet**: it remembers what you typed by itself, and React just asks "what do you have?" when the form is submitted.
:::

::: text 📖 Detailed answer
| | Controlled | Uncontrolled |
|---|---|---|
| Value lives in | React state | the DOM node |
| Set initial value | `value={state}` | `defaultValue="…"` / `defaultChecked` |
| Read value | from state, any time | `ref.current.value`, `new FormData(form)`, or the action's `formData` |
| Re-renders while typing | yes, every change | no |
| Good for | live validation, masks (phone, card), enabling buttons, dependent fields | simple forms, file inputs (`<input type="file">` is always uncontrolled), big forms, form actions |

### React 19: forms without state
React 19 lets you pass a function to `<form action={…}>`. React calls it with the form's `FormData` on submit, tracks pending state (`useFormStatus`, `useActionState`) and resets uncontrolled fields after a successful action. Many forms no longer need a `useState` per field.

### Libraries
React Hook Form uses uncontrolled inputs + refs for performance; Formik is controlled. Both are fine; know the trade-off.
:::

::: diagram Where the value lives
flowchart LR
  subgraph CTRL["Controlled"]
    S["React state"] -->|"value"| I1["input"]
    I1 -->|"onChange"| S
  end
  subgraph UNC["Uncontrolled"]
    I2["input keeps its own value"] -->|"read on submit: ref or FormData"| H["submit handler"]
  end
:::

::: image Controlled vs uncontrolled inputs (measured: 20 renders vs 0 for 20 keystrokes)
/images/react/controlled-uncontrolled.svg
:::

::: chart bar Measured: re-renders of the form while typing 20 characters (React 19.3, jsdom)
Input type,Renders
Controlled (value + onChange),20
Uncontrolled (defaultValue + ref),0
:::

::: text 🪜 Step by step
Controlled input, user presses "a":
1. The browser fires an `input` event; React calls `onChange` with the event.
2. `setName(e.target.value)` queues an update to `"a"`.
3. React re-renders the component; JSX returns `<input value="a">`.
4. Commit: the DOM value already is "a", so nothing visible changes; React keeps DOM and state in sync.
5. If `onChange` rejected the change (e.g. digits only), React would set the DOM value **back** to the state: that's what "controlled" means.
:::

::: code jsx Controlled: live validation and a dependent button
function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailOk = /^\S+@\S+\.\S+$/.test(email);          // derived on every render
  const strong = password.length >= 8;

  return (
    <form onSubmit={(e) => { e.preventDefault(); api.signup({ email, password }); }}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
      {email && !emailOk && <small role="alert">Enter a valid email</small>}
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <small>{strong ? '✓ strong enough' : `${8 - password.length} more characters`}</small>
      <button disabled={!emailOk || !strong}>Create account</button>
    </form>
  );
}
:::

::: code jsx Uncontrolled: FormData, refs and a React 19 form action
// Read everything on submit
function ContactForm() {
  const fileRef = useRef(null);
  const onSubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));   // { name, message }
    console.log(data, fileRef.current.files[0]);
  };
  return (
    <form onSubmit={onSubmit}>
      <input name="name" defaultValue="Asha" />
      <textarea name="message" />
      <input type="file" ref={fileRef} />                {/* file inputs are always uncontrolled */}
      <button>Send</button>
    </form>
  );
}

// React 19: the action receives FormData; the form resets after a successful action
function Newsletter() {
  async function subscribe(formData) {
    await fetch('/api/subscribe', { method: 'POST', body: formData });
  }
  return (
    <form action={subscribe}>
      <input name="email" type="email" required />
      <button>Subscribe</button>
    </form>
  );
}
:::

::: warning ⚠️ Common mistakes
- `value={x}` with no `onChange`: the input can't be typed into (React warns: use `defaultValue` or add `onChange`).
- Starting with `value={undefined}` (e.g. `user?.name` before data loads) then a string: "changing an uncontrolled input to be controlled". Use `value={name ?? ''}`.
- Controlling a big form with one state object and re-rendering a huge tree on every key: split components or use uncontrolled inputs.
- Trying to control `<input type="file">`: its value is read-only for security.
:::

::: understand
- "Controlled" = **React state is the single source of truth** and the DOM mirrors it.
- Pick per field: control the ones that need live logic, leave the rest uncontrolled.
- React 19 form actions make the uncontrolled + `FormData` style first-class.
:::

::: ask
- *"Do we need validation while typing, or only on submit?"*
- *"Is this a large form (dozens of fields) or performance-sensitive?"* Then prefer uncontrolled/React Hook Form.
- *"Are we on React 19 / a framework with Server Actions?"* Then `<form action>` is the idiomatic choice.
:::

::: important ⭐ Say this in the interview
"A controlled input gets its value from React state and reports changes through onChange, so React is the single source of truth; that's what I use for live validation, formatting or enabling a submit button. An uncontrolled input keeps its own value in the DOM; I set defaultValue and read it with a ref or FormData on submit. Controlled inputs re-render on every keystroke, 20 renders for 20 characters in my measurement, uncontrolled ones don't. In React 19 I often use `<form action={fn}>` with FormData and useActionState instead of a state variable per field."
:::

::: links
react.dev: input (controlled inputs) | https://react.dev/reference/react-dom/components/input
react.dev: form (actions) | https://react.dev/reference/react-dom/components/form
React Hook Form | https://react-hook-form.com/
:::

=== How does the Context API work, and when should you use it?
@p 2
@tags react, context, state-management, re-renders
@quick
- Context passes a value **through the tree without props**: `createContext` → `<ThemeContext value={v}>` (React 19; older: `.Provider`) → `useContext(ThemeContext)` or `use(ThemeContext)`.
- When the provider's `value` changes (by `Object.is`), **every component that reads it re-renders**, even if it only uses part of it.
- Measured: 60 consumers, theme changes → one combined context re-renders **60**, split contexts **10**.
- Fixes: split contexts, `useMemo` the value object, keep fast-changing state out of wide contexts, or use a store with selectors (Zustand, Redux).
- Context is **dependency injection**, not a state manager: great for theme, locale, current user, services.

::: text 🧒 In simple words
Passing props through five components that don't need them is like passing a note **hand to hand** across a classroom. **Context is the school loudspeaker**: the principal announces once and anyone who's listening hears it. The catch: when the announcement changes, **everyone listening** stops what they're doing to listen again, even if the news isn't for them.
:::

::: text 📖 Detailed answer
### The three parts
1. **Create**: `const ThemeContext = createContext('light')` (the default is used when there's no provider above).
2. **Provide**: wrap a subtree: `<ThemeContext value={theme}>…</ThemeContext>` (React 19 renders the context directly; `ThemeContext.Provider` still works).
3. **Consume**: `const theme = useContext(ThemeContext)` (or `use(ThemeContext)`, which may be called conditionally).

### Re-render rules
- A consumer re-renders when the **nearest provider's value** changes (compared with `Object.is`).
- `React.memo` does **not** stop context updates: a memoized consumer still re-renders.
- `value={{ theme, user }}` creates a **new object every render** → every consumer re-renders every time the provider re-renders. Memoize it, or split.

### When to use what
| Need | Use |
|---|---|
| Theme, locale, current user, feature flags, a service object | **Context** (changes rarely) |
| Prop drilling 1–2 levels | plain props, or pass components as `children` |
| Frequently changing shared state (editor, cart with many readers) | a store with **selectors** (Zustand, Redux Toolkit, Jotai) |
| Server data (lists, details) | a data cache (TanStack Query, framework loaders, RSC) |
:::

::: diagram Provider, consumers and what re-renders
flowchart TD
  P["ThemeContext value=dark"] --> L["Layout (doesn't read it)"]
  L --> H["Header: useContext(Theme) → re-renders"]
  L --> M["Main (doesn't read it)"]
  M --> B["Button: useContext(Theme) → re-renders"]
  M --> T["Table (doesn't read it, skipped if memoized)"]
:::

::: image One combined context vs split contexts (measured: 60 vs 10 re-renders)
/images/react/context.svg
:::

::: chart bar Measured: components re-rendered when the theme changes (10 theme + 50 user consumers, React 19.3)
Setup,Re-rendered components
One context (theme + user),60
Split ThemeContext + UserContext,10
:::

::: text 🪜 Step by step
Adding dark mode with context:
1. `export const ThemeContext = createContext({ theme: 'light', toggle: () => {} })` in its own file.
2. A `ThemeProvider` component owns the state: `const [theme, setTheme] = useState('light')`.
3. It memoizes the value: `const value = useMemo(() => ({ theme, toggle: () => setTheme(t => t === 'light' ? 'dark' : 'light') }), [theme])`.
4. It renders `<ThemeContext value={value}>{children}</ThemeContext>`; children passed from outside don't re-render just because the provider did.
5. Any component calls `const { theme, toggle } = useContext(ThemeContext)`; only those components re-render when the theme changes.
:::

::: code jsx A theme context done right (React 19 syntax)
import { createContext, useContext, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  // memoized: consumers re-render only when theme really changes
  const value = useMemo(() => ({ theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }), [theme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;   // React 19: no .Provider needed
}

export function useTheme() {                       // custom hook: nice error if used outside the provider
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle}>{theme === 'light' ? '🌙 Dark' : '☀️ Light'}</button>;
}

// <ThemeProvider><App /></ThemeProvider>
:::

::: code jsx Avoid over-rendering: split state and actions
const UserContext = createContext(null);          // changes rarely
const CartContext = createContext(null);          // changes often → separate context
const CartActionsContext = createContext(null);   // stable functions → components that only ADD never re-render

function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const actions = useMemo(() => ({
    add: (p) => setItems((list) => [...list, p]),
    remove: (id) => setItems((list) => list.filter((p) => p.id !== id)),
  }), []);                                         // never changes
  return (
    <CartActionsContext value={actions}>
      <CartContext value={items}>{children}</CartContext>
    </CartActionsContext>
  );
}

function AddToCartButton({ product }) {
  const { add } = useContext(CartActionsContext);  // doesn't re-render when items change
  return <button onClick={() => add(product)}>Add</button>;
}
:::

::: warning ⚠️ Common mistakes
- One giant `AppContext` with everything in it: every change re-renders everything that reads it.
- `value={{ a, b }}` without `useMemo`: a new object every render → all consumers re-render.
- Using context for **high-frequency** updates (mouse position, text being typed) in a wide tree.
- Expecting `React.memo` to block context updates; it doesn't.
- Forgetting the provider: the consumer silently gets the **default value**. Throw in a custom hook instead.
:::

::: understand
- Context solves **prop drilling**, not performance; it can make re-renders wider.
- The value's **identity** decides re-renders: memoize objects, split by update frequency.
- For app-wide state with many writers/readers, a selector-based store scales better.
:::

::: ask
- *"How often does this value change, and how many components read it?"*
- *"Is it server data?"* Then a query cache is usually better than context.
- *"React 19?"* Then `<Context value>` and `use(Context)` are available.
:::

::: important ⭐ Say this in the interview
"Context lets a provider make a value available to any component below it without prop drilling: createContext, wrap the tree with the provider, and read it with useContext. Every component that reads the context re-renders when the provider's value changes by reference, and React.memo doesn't stop that. So I use context for things that change rarely, like theme, locale or the current user. I memoize the value object and split contexts by how often they change: in my measurement, changing the theme in one combined context re-rendered 60 components, split contexts re-rendered 10. For frequently changing shared state I'd pick a store with selectors, and for server data a query cache."
:::

::: links
react.dev: Passing data deeply with context | https://react.dev/learn/passing-data-deeply-with-context
react.dev: useContext | https://react.dev/reference/react/useContext
react.dev: Scaling up with reducer and context | https://react.dev/learn/scaling-up-with-reducer-and-context
:::
