@section React 19
@icon ⚛️
@color #06b6d4
@desc Everything new from React 19.0 to 19.3: Actions and form hooks, useOptimistic, use(), ref as a prop, document metadata, Server Components and Server Functions, React Compiler 1.0 and how to upgrade. Numbers measured with React 19.3 and React Compiler 1.0.

=== What's new in React 19 (19.0 to 19.3)?
@p 3
@tags react, react-19, overview
@quick
- **19.0 (Dec 2024)**: Actions (async transitions), `useActionState`, `useFormStatus`, `useOptimistic`, `<form action={fn}>`, `use()`, ref as a prop, `<Context value>`, `<title>/<meta>/<link>` in components, Server Components and Server Functions stable.
- **19.1 (Mar 2025)**: Owner Stacks (`captureOwnerStack`) for debugging, Suspense and hydration fixes.
- **19.2 (Oct 2025)**: `<Activity>`, `useEffectEvent`, `cacheSignal`, Performance tracks, Partial Pre-rendering. Same month: **React Compiler 1.0**.
- **19.3 (Sep 2026)**: `<ViewTransition>` and `addTransitionType` stable, `<Fragment ref>`, `use(browser())`, Trusted Types, Context rendered directly in Server Components.
- Removed: `ReactDOM.render`, `propTypes`/`defaultProps` on function components, string refs, legacy context.

::: text 🧒 In simple words
React 18 gave React a **faster engine** (concurrent rendering). React 19 is about **less code for everyday jobs**: submitting a form, showing "saving…", updating the list before the server answers, setting the page title. Many things that needed `useState` + `useEffect` + a library now take one built-in hook or plain HTML-like tags.
:::

::: text 📖 Detailed answer
### React 19.0: the big release
| Area | What's new | Replaces |
|---|---|---|
| Actions | async functions in `startTransition`, `<form action={fn}>`, `useActionState`, `useFormStatus`, `useOptimistic` | manual `isLoading`/`error` state, onSubmit boilerplate |
| Data | `use(promise)` with Suspense, `use(context)` (conditional) | effects + loading flags |
| Refs | `ref` as a normal prop; ref callbacks return a cleanup | `forwardRef`, cleanup on `null` |
| Context | `<ThemeContext value={…}>` | `.Provider` |
| Document | `<title>`, `<meta>`, `<link>` rendered anywhere are hoisted to `<head>`; stylesheets with `precedence`; async `<script>` dedupe; `preload`/`preinit`/`preconnect` | react-helmet, manual head management |
| Server | Server Components, Server Functions (`'use server'`), static `prerender` APIs | API routes for every mutation |
| Errors | one log per error with owner stack, root `onCaughtError`/`onUncaughtError`, much clearer hydration mismatch diffs | duplicated errors |
| Suspense | fallback committed immediately, siblings pre-warmed | waiting for all siblings |

### React 19.1 / 19.2 / 19.3
- **19.1**: `captureOwnerStack()` (which component *rendered* the broken one), Suspense fixes.
- **19.2**: `<Activity mode>`, `useEffectEvent`, `cacheSignal` (RSC), Chrome Performance tracks, Partial Pre-rendering (`prerender` + `resume`), batched Suspense reveals for SSR, `useId` prefix `_r_`.
- **React Compiler 1.0** (Oct 2025): automatic memoization at build time, React 17+.
- **19.3**: `<ViewTransition>`, `addTransitionType`, `<Fragment ref>`, `use(browser())`, Trusted Types, transitions render independently, Context directly from Server Components.
:::

::: diagram How the React 19 features fit together
flowchart TD
  A["Actions: async transitions"] --> F["form action + useActionState + useFormStatus"]
  A --> O["useOptimistic"]
  S["Suspense"] --> U["use(promise)"]
  S --> AC["Activity, ViewTransition (19.2/19.3)"]
  R["Server Components"] --> SF["Server Functions: use server"]
  SF --> F
  C["React Compiler 1.0"] --> M["Automatic memoization"]
:::

::: image React 19 timeline from 19.0 to 19.3
/images/react/react19-timeline.svg
:::

::: text 🪜 Step by step
How to explain React 19 in an interview, in order:
1. Start with the theme: React 18 brought concurrency; 19 builds **Actions** on top of transitions.
2. Forms: `<form action>`, `useActionState` (state + pending), `useFormStatus` (pending in child buttons), `useOptimistic`.
3. Data: `use()` reads promises with Suspense and context conditionally.
4. Developer experience: ref as a prop, `<Context value>`, metadata tags, better errors.
5. Platform: Server Components/Functions, Compiler 1.0, and the 19.2/19.3 additions (Activity, useEffectEvent, View Transitions).
:::

::: code jsx A small component using several React 19 features
import { useActionState, useOptimistic, use, Suspense } from 'react';
import { useFormStatus } from 'react-dom';

function SaveButton() {
  const { pending } = useFormStatus();                       // reads the parent form's status
  return <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>;
}

export function TodoPage({ todosPromise, addTodo }) {
  const todos = use(todosPromise);                            // suspends until loaded
  const [optimisticTodos, addOptimistic] = useOptimistic(todos, (list, title) => [...list, { id: 'tmp', title }]);
  const [error, formAction] = useActionState(async (_prev, formData) => {
    const title = formData.get('title');
    addOptimistic(title);                                     // show it right away
    try { await addTodo(title); return null; } catch (e) { return e.message; }
  }, null);

  return (
    <>
      <title>{`Todos (${optimisticTodos.length})`}</title>   {/* hoisted into <head> */}
      <form action={formAction}>
        <input name="title" required />
        <SaveButton />
        {error && <p role="alert">{error}</p>}
      </form>
      <ul>{optimisticTodos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </>
  );
}

// <Suspense fallback={<p>Loading…</p>}><TodoPage todosPromise={loadTodos()} addTodo={api.addTodo} /></Suspense>
:::

::: warning ⚠️ Common mistakes
- Saying "React 19 = Server Components only": most features work in plain client apps.
- Confusing `useActionState` (state of an action) with `useFormStatus` (status of the **parent** form, read in a child).
- Thinking `use()` fetches data: it **reads** a promise you created.
- Forgetting the removals when upgrading (`ReactDOM.render`, `propTypes`, string refs).
:::

::: understand
- The unifying idea of 19.0 is **Actions**: async work inside transitions with built-in pending, error and optimistic states.
- 19.2/19.3 continue the concurrent story: hide without unmounting (Activity), animate transitions (ViewTransition).
:::

::: ask
- *"Which React version does the project use, and is it on a framework (Next.js App Router) with Server Components?"*
- *"Is the React Compiler enabled?"* It changes how much manual memoization you'd write.
:::

::: important ⭐ Say this in the interview
"React 19's main theme is Actions: async functions in transitions, which power form actions, useActionState for result and pending state, useFormStatus for nested buttons and useOptimistic for instant feedback. It also added use() to read promises and context, ref as a regular prop, Context as a provider, metadata tags like title rendered from components, stable Server Components and Server Functions, and better error reporting. 19.2 added Activity and useEffectEvent, the React Compiler reached 1.0, and 19.3 made View Transitions and Fragment refs stable."
:::

::: links
React v19 | https://react.dev/blog/2024/12/05/react-19
React 19.2 | https://react.dev/blog/2025/10/01/react-19-2
React 19.3 | https://react.dev/blog/2026/09/09/react-19-3
React Compiler v1.0 | https://react.dev/blog/2025/10/07/react-compiler-1
:::

=== What are Actions? (useActionState and form actions)
@p 3
@tags react, react-19, actions, useActionState, forms
@quick
- An **Action** is an async function used in a transition; React tracks its **pending** state, errors and optimistic updates.
- `<form action={fn}>` calls `fn(formData)` on submit (no `preventDefault`), and **resets** uncontrolled fields after success.
- `const [state, formAction, isPending] = useActionState(action, initialState)`: `action(prevState, formData)` returns the next state.
- Measured on the two versions of the same form below: **30 → 19 lines** and **4 → 0 `useState` calls**.
- With Server Functions (`'use server'`) the same form works **before JavaScript loads** (progressive enhancement).

::: text 🧒 In simple words
Before, every form was like doing your taxes by hand: you tracked "am I submitting?", "did it fail?", "clear the fields" yourself. An **Action** is giving the paperwork to an accountant (React): you hand over the form, React says "busy…" while it works, and gives you back the result.
:::

::: text 📖 Detailed answer
### The old way
`onSubmit` + `preventDefault` + `useState` for each field, `isPending`, `error`, `success` + `try/catch/finally` + resetting fields manually. Easy to get wrong (double submits, stale errors).

### React 19 pieces
| API | What it does |
|---|---|
| `startTransition(async () => {…})` | an Action: `isPending` from `useTransition` stays true until it finishes |
| `<form action={fn}>` / `<button formAction={fn}>` | calls `fn(formData)` on submit in a transition; resets the form after success |
| `useActionState(action, initial, permalink?)` | stores what the action **returns**; gives you `formAction` and `isPending` |
| `useFormStatus()` | `{ pending, data, method, action }` of the **parent** form (for submit buttons) |
| `useOptimistic` | temporary optimistic state while an Action runs |
| `requestFormReset(form)` | reset a form manually from inside a transition |

### Rules
- The action receives `prevState` first, then `formData` (with `useActionState`).
- Return values are the **new state**: errors, success messages, the saved item.
- Updates after an `await` inside an Action are still part of the transition (React 19).
:::

::: diagram What happens when an action form is submitted
sequenceDiagram
  participant U as User
  participant F as form action
  participant R as React
  participant S as Server
  U->>F: submit
  F->>R: start transition, isPending = true
  R->>S: action(prevState, formData)
  S-->>R: returns next state
  R-->>U: state updated, isPending = false, form reset
:::

::: image Actions and useActionState
/images/react/actions.svg
:::

::: chart bar Counted: the "update name" form written two ways (code on this page)
Version,Lines of component code
onSubmit + useState (React 18 style),30
useActionState + form action (React 19),19
:::

::: text 🪜 Step by step
`useActionState(updateName, null)` with `<form action={formAction}>`:
1. User submits → React collects `FormData` and starts a **transition**; `isPending` becomes true (button disabled, "Saving…").
2. React calls `updateName(prevState, formData)`; it awaits the API.
3. On failure it **returns** `{ error: 'Name taken' }` → that becomes `state`; the form keeps the user's input.
4. On success it returns `{ ok: true }`; React resets the uncontrolled inputs.
5. `isPending` returns to false. No `useState`, no `try/finally` for the pending flag.
:::

::: code jsx Before: onSubmit with useState (React 18 style)
import { useState } from 'react';

export function UpdateNameOld({ updateName }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    setSaved(false);
    try {
      await updateName(name);
      setSaved(true);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
      {error && <p role="alert">{error}</p>}
      {saved && <p>Saved!</p>}
    </form>
  );
}
:::

::: code jsx After: useActionState with a form action (React 19)
import { useActionState } from 'react';

export function UpdateName({ updateName }) {
  const [state, formAction, isPending] = useActionState(async (prevState, formData) => {
    try {
      await updateName(formData.get('name'));
      return { saved: true };
    } catch (err) {
      return { error: err.message };
    }
  }, {});

  return (
    <form action={formAction}>
      <input name="name" required />
      <button disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && <p>Saved!</p>}
    </form>
  );
}
:::

::: warning ⚠️ Common mistakes
- Swapping the argument order: with `useActionState` the action gets `(prevState, formData)`, not `(formData)`.
- Calling `formAction` outside a form or transition (React warns; wrap manual calls in `startTransition`).
- Expecting controlled inputs to reset after an action (only uncontrolled fields are reset).
- Throwing instead of returning expected errors: throwing goes to the error boundary; return validation errors as state.
:::

::: understand
- Actions = transitions + async + built-in pending/error/optimistic handling.
- State is "the last result of the action", which makes forms declarative.
:::

::: ask
- *"Client-only or with Server Functions?"* With `'use server'` the form also works without JS.
- *"Do we need field-level validation while typing?"* Then combine with controlled fields or a form library.
:::

::: important ⭐ Say this in the interview
"In React 19 an Action is an async function run inside a transition. A form can take a function as its action prop: React calls it with FormData on submit, tracks it as a transition and resets the uncontrolled fields when it succeeds. useActionState wraps an action so it receives the previous state and FormData and its return value becomes the new state, and it gives me isPending. The same update-name form went from 30 lines and four useState calls to 19 lines and none. With Server Functions the form even works before JavaScript loads."
:::

::: links
react.dev: useActionState | https://react.dev/reference/react/useActionState
react.dev: form (action prop) | https://react.dev/reference/react-dom/components/form
React 19: Actions | https://react.dev/blog/2024/12/05/react-19#actions
:::

=== useFormStatus and useOptimistic
@p 3
@tags react, react-19, useFormStatus, useOptimistic
@quick
- `useFormStatus()` (from `react-dom`) returns `{ pending, data, method, action }` of the **parent `<form>`**: perfect for a reusable submit button.
- It must be called in a component **rendered inside** the form, not in the component that renders the form.
- `const [optimistic, addOptimistic] = useOptimistic(state, (current, value) => next)` shows a temporary value while an Action runs.
- Measured (server takes 500 ms): the new message appears after **508 ms** waiting for the server, **2 ms** with `useOptimistic`.
- If the Action fails (state isn't updated), the optimistic value is **dropped automatically** (rollback).

::: text 🧒 In simple words
`useFormStatus` is a **little light on the submit button** that knows when its own form is busy. `useOptimistic` is a waiter who writes your order on the board **as soon as you say it**, and erases it only if the kitchen says "sorry, we're out".
:::

::: text 📖 Detailed answer
### useFormStatus
- Reads the status of the **nearest parent form** that's submitting through an Action.
- `pending`: true while the action runs; `data`: the FormData being submitted (e.g. show "Sending 'Hello'…").
- Design-system buttons use it so every form gets a disabled/"Saving…" button without prop drilling.

### useOptimistic
| Argument | Meaning |
|---|---|
| `state` | the real (confirmed) state, e.g. `messages` from the server |
| `updateFn(current, optimisticValue)` | how to merge an optimistic value into the state |
| returns `[optimisticState, addOptimistic]` | render `optimisticState`; call `addOptimistic(value)` inside an Action |

Lifecycle:
1. Inside an Action, `addOptimistic(text)` → `optimisticState` immediately includes the new item.
2. When the Action finishes and the real `state` has been updated, React re-renders with the real state (the optimistic copy disappears because it's recomputed from `state`).
3. If the Action fails and you don't update the state, the optimistic item vanishes: rollback for free. Show an error.
:::

::: diagram Optimistic update with success and failure
flowchart LR
  S["submit"] --> A["addOptimistic(item): shown at once"]
  A --> W["await server"]
  W -->|"success: setState(saved)"| R["real list shown"]
  W -->|"failure: no state change"| B["optimistic item disappears, show error"]
:::

::: image useOptimistic shows the result before the server answers (measured: 2 ms vs 508 ms)
/images/react/optimistic.svg
:::

::: chart bar Measured: time until a sent chat message is visible, server takes 500 ms (React 19.3, jsdom)
Approach,Visible after (ms)
Wait for the server,508
useOptimistic,2
:::

::: text 🪜 Step by step
Sending "Hello" in a chat with `useOptimistic`:
1. The form action runs inside a transition; it calls `addOptimistic('Hello')`.
2. React renders `optimisticMessages` = messages + `{ text: 'Hello', sending: true }` → visible in ~2 ms, greyed out.
3. `await sendMessage('Hello')` takes 500 ms; `useFormStatus` in the button reports `pending: true`.
4. The server returns the saved message; `setMessages(m => [...m, saved])`.
5. The Action ends: React renders the real `messages` (now containing the saved one); the "sending" copy is gone.
:::

::: code jsx A chat with useOptimistic and a useFormStatus button
import { startTransition, useOptimistic, useState } from 'react';
import { useFormStatus } from 'react-dom';

function SendButton() {
  const { pending, data } = useFormStatus();                   // status of the PARENT form
  return <button disabled={pending}>{pending ? `Sending "${data.get('text')}"…` : 'Send'}</button>;
}

export function Chat({ initialMessages, sendMessage }) {
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState(null);
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (current, text) => [...current, { id: `tmp-${current.length}`, text, sending: true }],
  );

  async function send(formData) {
    const text = formData.get('text');
    setError(null);
    addOptimistic(text);                                       // visible immediately
    try {
      const saved = await sendMessage(text);
      startTransition(() => setMessages((m) => [...m, saved]));
    } catch (e) {
      setError(`Not sent: ${e.message}`);                      // optimistic item disappears by itself
    }
  }

  return (
    <>
      <ul>
        {optimisticMessages.map((m) => (
          <li key={m.id} style={{ opacity: m.sending ? 0.5 : 1 }}>{m.text}</li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      <form action={send}>
        <input name="text" required />
        <SendButton />
      </form>
    </>
  );
}
:::

::: warning ⚠️ Common mistakes
- Calling `useFormStatus` in the same component that renders `<form>`: it reads the **parent** form, so it returns `pending: false`.
- Calling `addOptimistic` outside an Action/transition (React warns and the value doesn't stay).
- Forgetting to update the real state on success: the optimistic item vanishes when the Action ends.
- Optimistic UI for operations that often fail or are dangerous (payments): confirm instead.
:::

::: understand
- `useFormStatus` = form status for **children**; `useActionState` = action result for the **form owner**.
- Optimistic state is derived from the real state plus pending updates, so rollback is automatic.
:::

::: ask
- *"How likely is failure, and how bad is a wrong optimistic UI?"* Likes and messages: fine. Money: no.
- *"Do we have a design-system button?"* Put `useFormStatus` there once.
:::

::: important ⭐ Say this in the interview
"useFormStatus lets a component inside a form read that form's pending status and submitted data, which is ideal for a reusable submit button. useOptimistic takes the confirmed state and a merge function, and inside an Action I call addOptimistic to show the expected result right away. When the Action finishes React shows the real state again, so if the request failed and I didn't update state, the optimistic item disappears automatically. In my measurement a chat message became visible after 2 milliseconds instead of 508 while waiting for a 500 millisecond server."
:::

::: links
react.dev: useFormStatus | https://react.dev/reference/react-dom/hooks/useFormStatus
react.dev: useOptimistic | https://react.dev/reference/react/useOptimistic
:::

=== What is the use() API?
@p 3
@tags react, react-19, use, suspense, context
@quick
- `use(resource)` reads a **promise** or a **context** during render.
- `use(promise)`: pending → the component **suspends** (nearest `<Suspense>`); resolved → returns the value; rejected → nearest **error boundary**.
- `use(Context)` works like `useContext` but may be called **conditionally**, in loops and after early returns.
- Create the promise **outside** render (parent, loader, Server Component, cache), or it's recreated on every render.
- Server Components can pass promises to Client Components that `use()` them, streaming the data.

::: text 🧒 In simple words
`use(promise)` is like asking "is my parcel here?". If it's not there yet, you **pause and wait at the door** (Suspense shows "loading"); when it arrives you open it and continue. `use(Context)` is reading a sign on the wall: you can choose to read it only when you need it.
:::

::: text 📖 Detailed answer
| | `use(promise)` | `use(Context)` |
|---|---|---|
| Returns | the resolved value | the context value |
| While waiting | suspends (Suspense fallback) | never waits |
| Errors | rejected promise → error boundary | n/a |
| Conditional / in loops | allowed | allowed |
| Where | components and hooks (not regular functions, not try/catch) | same |

### Why it's not a hook
Hooks are matched by call order, so they can't be conditional. `use` doesn't occupy a hook slot, so the Rules of Hooks' order rule doesn't apply (it still must be called during render of a component or hook).

### The promise rule
`use(fetch(url))` inside the component creates a **new** promise every render → React suspends forever (and warns about uncached promises). Promises must be:
- created in a Server Component and passed as a prop,
- created by a router loader or event,
- or cached (`cache()` on the server, a Map or a data library on the client).

### Compared to useEffect fetching
No loading flags, no race conditions inside the component, loading UI is declared with Suspense, and requests can start earlier (render-as-you-fetch).
:::

::: diagram What use(promise) does
flowchart LR
  P["use(promise)"] --> Q{"Promise status"}
  Q -->|"pending"| S["Suspend: nearest Suspense fallback"]
  Q -->|"fulfilled"| V["Return the value"]
  Q -->|"rejected"| E["Throw: nearest error boundary"]
  S -->|"settles"| P
:::

::: image The use() API for promises and context
/images/react/use-api.svg
:::

::: text 🪜 Step by step
Server Component passing a promise to a Client Component:
1. On the server: `const commentsPromise = db.comments.byPost(id)` (not awaited) and `<Comments commentsPromise={commentsPromise} />`.
2. React streams the page; the comments boundary shows its fallback.
3. In the browser, `Comments` ('use client') calls `use(commentsPromise)`: pending → suspended.
4. The server resolves the data and streams it; the promise resolves on the client.
5. React retries `Comments`; `use()` returns the array; the list replaces the fallback.
:::

::: code jsx use() with a promise and with context
import { createContext, Suspense, use } from 'react';

const ThemeContext = createContext('light');

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);                      // suspends while pending
  return <ul>{comments.map((c) => <li key={c.id}>{c.text}</li>)}</ul>;
}

function Heading({ children, show }) {
  if (!show) return null;
  const theme = use(ThemeContext);                            // ✅ after an early return: allowed for use()
  return <h2 className={theme}>{children}</h2>;
}

export function PostPage({ commentsPromise }) {               // the promise is created by the parent/loader
  return (
    <>
      <Heading show>Comments</Heading>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </>
  );
}

// ❌ never: function Comments() { const c = use(fetch('/api/comments').then(r => r.json())); }
:::

::: warning ⚠️ Common mistakes
- Creating the promise in the component body on every render.
- Wrapping `use()` in try/catch to handle errors: use an error boundary (and `.catch` on the promise for fallbacks).
- Calling `use()` in a regular (non-component) function or event handler.
- Forgetting a Suspense boundary above a component that uses a promise.
:::

::: understand
- `use` is a reader, not a fetcher: when the request starts is your design decision.
- Conditional context reads make components simpler (no more reading context "just in case").
:::

::: ask
- *"Where are promises created and cached in this codebase?"*
- *"Are we on a framework with Server Components?"* Passing promises from server to client is the idiomatic pattern there.
:::

::: important ⭐ Say this in the interview
"use is a React 19 API that reads a resource during render: a promise or a context. With a promise, it returns the value when resolved, suspends to the nearest Suspense boundary while pending and throws to the error boundary when rejected. With context, it's like useContext but can be called conditionally or after early returns, because it's not stored in a hook slot. The key rule is that the promise must be created outside render, for example by a Server Component, a loader or a cache, otherwise a new promise every render suspends forever."
:::

::: links
react.dev: use | https://react.dev/reference/react/use
react.dev: Streaming data from server to client | https://react.dev/reference/react/use#streaming-data-from-server-to-client
:::

=== React 19 developer experience: ref as a prop, Context as provider, metadata and preloading
@p 2
@tags react, react-19, refs, context, metadata
@quick
- **ref as a prop**: `function Input({ ref, ...props }) { return <input ref={ref} {...props} /> }`; no `forwardRef` (to be deprecated).
- **Ref cleanup**: a ref callback may `return () => …`, called when the element is removed.
- **`<Context value={…}>`** renders a provider; `.Provider` still works.
- **Metadata**: `<title>`, `<meta>`, `<link>` rendered in any component are hoisted into `<head>`; stylesheets with `precedence` are ordered and deduplicated; `async` scripts are deduplicated.
- **Resource APIs** (`react-dom`): `preload`, `preinit`, `preconnect`, `prefetchDNS` to start loading fonts, scripts and styles early.

::: text 🧒 In simple words
These are **small conveniences that remove boilerplate**: like a car that now has an automatic boot opener and a phone holder built in. You could do it all before with extra parts (forwardRef, react-helmet, manual `<link>` tags); now it's built in.
:::

::: text 📖 Detailed answer
| Feature | React 18 | React 19 |
|---|---|---|
| Pass a ref to a function component | `forwardRef((props, ref) => …)` | `ref` is a regular prop |
| Clean up a ref callback | handle the call with `null` | return a cleanup function |
| Provide context | `<Ctx.Provider value>` | `<Ctx value>` |
| Page title / meta | react-helmet, `document.title` in effects | `<title>{x}</title>` anywhere; React hoists to `<head>` (works with SSR and streaming) |
| Stylesheets | manual `<link>` ordering, duplicates | `<link rel="stylesheet" href precedence="default" />`: deduplicated, ordered, and Suspense waits for them |
| Scripts | duplicates when two components include the same script | `<script async src>` deduplicated |
| Preloading | handwritten `<link rel=preload>` | `preload(href, { as })`, `preinit(href, { as: 'style' })`, `preconnect`, `prefetchDNS` |
| Hydration errors | vague "text content did not match" | a diff of server vs client output |
| Custom elements | props passed as attributes (strings) | full support: properties set correctly |

These are small individually; together they remove several dependencies (react-helmet, forwardRef wrappers) and a class of bugs (style ordering, duplicate scripts).
:::

::: diagram How React 19 handles metadata tags
flowchart LR
  C["Component renders title, meta, link"] --> R["React"]
  R -->|"hoists"| H["document head"]
  R -->|"dedupes and orders by precedence"| S["stylesheets"]
  R -->|"SSR: emitted in the streamed head"| SSR["server HTML"]
:::

::: image React 19 quality-of-life changes: before and after
/images/react/react19-dx.svg
:::

::: text 🪜 Step by step
A blog post page in React 19:
1. `PostPage` renders `<title>{post.title}</title>` and `<meta name="description" content={post.summary} />` in its JSX.
2. React moves them into `<head>` (on the client) or writes them into the head during SSR; navigating to another post replaces them.
3. A code-highlighting component renders `<link rel="stylesheet" href="/prism.css" precedence="default" />`; React inserts it once, and the Suspense boundary waits for it before revealing (no unstyled flash).
4. On hover of a "Next post" link, `preload('/fonts/serif.woff2', { as: 'font' })` warms the font.
5. A custom `SearchInput({ ref })` receives the parent's ref directly; its ref callback returns a cleanup for an observer.
:::

::: code jsx ref as a prop, Context provider, metadata, stylesheets and preloading
import { createContext, useContext, useRef } from 'react';
import { preload, preconnect } from 'react-dom';

const ThemeContext = createContext('light');

function SearchInput({ ref, ...props }) {                     // ✅ no forwardRef
  return <input ref={ref} type="search" {...props} />;
}

function PostPage({ post }) {
  const inputRef = useRef(null);
  preconnect('https://images.example.com');                   // start the TLS handshake early
  return (
    <ThemeContext value="dark">                                {/* ✅ no .Provider */}
      <title>{`${post.title} · My blog`}</title>
      <meta name="description" content={post.summary} />
      <link rel="stylesheet" href="/styles/prism.css" precedence="default" />
      <article>
        <h1>{post.title}</h1>
        <SearchInput ref={inputRef} placeholder="Search posts" />
        <a href={`/posts/${post.nextId}`} onMouseEnter={() => preload('/fonts/serif.woff2', { as: 'font', type: 'font/woff2' })}>
          Next post
        </a>
      </article>
      <ThemedFooter />
    </ThemeContext>
  );
}

function ThemedFooter() {
  const theme = useContext(ThemeContext);
  return <footer className={theme}>© 2026</footer>;
}
:::

::: warning ⚠️ Common mistakes
- Keeping `forwardRef` wrappers in new code (works, but unnecessary and will be deprecated).
- Rendering `<title>` from many components at once: the last rendered one wins; keep one owner per page.
- Using metadata tags inside `<svg>` (an SVG `<title>` is an accessible name, not hoisted).
- Forgetting `precedence` on stylesheets you want React to manage.
:::

::: understand
- These features remove libraries and wrappers rather than add concepts.
- Metadata and resources work with streaming SSR, which is why they're built into React now.
:::

::: ask
- *"Are we using a framework's metadata API (Next.js `metadata`)?"* Then prefer it; React's tags are the primitive underneath.
- *"Do we have codemods for forwardRef/Provider?"* The React 19 codemods handle most of it.
:::

::: important ⭐ Say this in the interview
"React 19 removed a lot of boilerplate: function components receive ref as a normal prop, so forwardRef isn't needed, and ref callbacks can return a cleanup; a context object can be rendered directly as the provider; title, meta and link tags rendered anywhere are hoisted into the head, stylesheets with a precedence are deduplicated and ordered and Suspense waits for them; and react-dom exposes preload, preinit and preconnect to load resources early. Hydration errors also show a proper diff now."
:::

::: links
React 19: ref as a prop | https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop
react.dev: title (metadata) | https://react.dev/reference/react-dom/components/title
react.dev: link (stylesheets with precedence) | https://react.dev/reference/react-dom/components/link
react.dev: preload | https://react.dev/reference/react-dom/preload
:::

=== What are React Server Components and Server Functions?
@p 3
@tags react, react-19, rsc, server-components, server-functions
@quick
- **Server Components (RSC)** run only on the server (or at build time): they can be `async`, read databases/files directly, and send **no JavaScript** to the browser.
- **Client Components** start with `'use client'`: state, effects, event handlers, browser APIs. They're still SSR'd to HTML, then hydrated.
- **Server Functions** (`'use server'`) are async functions the client can call (e.g. as a form action); React sends a request and returns the result.
- Measured: a markdown + highlighting stack (marked + sanitize-html + highlight.js) is **377 KB gzipped**: in a Server Component, **0 KB** reaches the browser.
- Security: Server Functions are **public endpoints**; validate input and check auth in every one (and keep React patched: Dec 2025 RSC advisories).

::: text 🧒 In simple words
A restaurant: **Server Components** are the kitchen: they use heavy equipment (databases, big libraries) and send out finished plates; the guest never sees the oven. **Client Components** are the salt and pepper on the table: small things the guest uses themselves. **Server Functions** are the bell on the table: press it and the kitchen does something for you.
:::

::: text 📖 Detailed answer
| | Server Component | Client Component |
|---|---|---|
| Marker | default (in RSC frameworks) | `'use client'` at the top of the file |
| Runs | server / build only | server (SSR) + browser |
| Can be `async`, `await` data | yes | no (use `use()` or a data library) |
| State, effects, event handlers | no | yes |
| Access DB, file system, secrets | yes | no |
| Ships JS to the browser | **no** | yes |

### How they combine
- Server Components can render Client Components and pass **serializable** props (data, promises, JSX, Server Functions), not regular functions or class instances.
- Client Components can't import Server Components, but can receive them as `children`.
- The server sends an **RSC payload** (a serialized tree) that React merges into the page; navigation fetches new payloads, keeping client state.

### Server Functions
- `'use server'` functions can be called from Client Components (form `action`, `startTransition`). React serializes arguments, calls the server, returns the result.
- Use cases: mutations (create post, like), revalidation. With forms they work **before hydration**.
- Treat each one like an API route: **authenticate, authorize, validate**.

### Where you get them
Next.js App Router (default), React Router framework mode (RSC support), Parcel/Vite plugins. React provides the protocol; the framework provides bundling and routing.
:::

::: diagram Server and client boundaries
flowchart TD
  P["Page (Server Component, async)"] -->|"reads DB directly"| D[("Database")]
  P --> A["Article (Server Component): markdown rendered on the server"]
  P --> L["LikeButton: use client (state, onClick)"]
  L -->|"calls"| F["likePost: use server function"]
  F --> D
:::

::: image Server Components keep code and data access on the server (measured: 377 KB stays off the client)
/images/react/rsc.svg
:::

::: chart bar Measured: gzipped JavaScript a markdown + syntax-highlighting page needs in the browser (esbuild, minified)
Where markdown is rendered,JS sent to the browser (KB gzip)
Client Component (marked + sanitize-html + highlight.js),377
Server Component,0
:::

::: text 🪜 Step by step
Rendering a blog post with RSC:
1. Request `/posts/42` → the framework runs the Server Component `PostPage` on the server.
2. `PostPage` awaits `db.posts.find(42)` and renders markdown to HTML with `marked` + `highlight.js` (on the server only).
3. It renders `<LikeButton postId={42} initialLikes={post.likes} />`, a `'use client'` component.
4. The server streams HTML + the RSC payload; the browser downloads JS **only** for `LikeButton`.
5. Clicking Like calls the Server Function `likePost(42)` → React POSTs to the server → returns the new count.
:::

::: code jsx A Server Component, a Client Component and a Server Function (Next.js App Router style)
// app/posts/[id]/page.jsx: Server Component (no directive needed)
import { marked } from 'marked';
import { db } from '@/lib/db';
import { LikeButton } from './LikeButton';

export default async function PostPage({ params }) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });        // direct DB access, never shipped to the client
  const html = marked.parse(post.markdown);                         // the markdown library stays on the server
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <LikeButton postId={post.id} initialLikes={post.likes} />
    </article>
  );
}

// app/posts/[id]/actions.js
// 'use server';
// export async function likePost(postId) {
//   const user = await requireUser();                             // ✅ every Server Function checks auth
//   return db.like.create({ data: { postId: String(postId), userId: user.id } }).then(() => db.like.count({ where: { postId } }));
// }

// app/posts/[id]/LikeButton.jsx
// 'use client';
// import { useOptimistic, startTransition } from 'react';
// import { likePost } from './actions';
// export function LikeButton({ postId, initialLikes }) {
//   const [likes, addLike] = useOptimistic(initialLikes, (n) => n + 1);
//   return <button onClick={() => startTransition(async () => { addLike(); await likePost(postId); })}>♥ {likes}</button>;
// }
:::

::: warning ⚠️ Common mistakes
- Adding `'use client'` to everything (you lose the benefit) or to nothing interactive (event handlers fail).
- Passing non-serializable props (functions, class instances) from Server to Client Components.
- Treating Server Functions as private: they're HTTP endpoints anyone can call; validate and authorize.
- Importing server-only code (DB clients, secrets) into a client file: use the `server-only` package to fail the build.
- Running an unpatched React/Next version: RSC had critical advisories in December 2025.
:::

::: understand
- RSC moves data fetching and heavy rendering to the server and ships less JS; client components keep interactivity.
- The `'use client'` line marks a **boundary**: everything imported from that file down is client code.
:::

::: ask
- *"Which framework and version?"* RSC needs bundler integration.
- *"What must stay interactive?"* Those parts become small Client Components at the leaves.
:::

::: important ⭐ Say this in the interview
"Server Components run only on the server or at build time, can be async and read data directly, and send no JavaScript to the browser; Client Components marked with 'use client' handle state, effects and events and are still server-rendered and hydrated. Server Components can render client ones and pass serializable props, including promises. Server Functions marked 'use server' are async functions the client can call, for example as a form action, so they must validate input and check authorization like any API. The payoff is less JavaScript: rendering markdown with highlighting on the server keeps about 377 KB gzipped of libraries out of the browser."
:::

::: links
react.dev: Server Components | https://react.dev/reference/rsc/server-components
react.dev: Server Functions | https://react.dev/reference/rsc/server-functions
react.dev: 'use client' | https://react.dev/reference/rsc/use-client
React security advisory (Dec 2025) | https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
:::

=== What is the React Compiler?
@p 3
@tags react, react-compiler, memoization, performance
@quick
- React Compiler (**1.0, Oct 2025**) is a build-time Babel plugin (`babel-plugin-react-compiler`) that **automatically memoizes** components and hooks.
- It caches values and JSX elements in slots and reuses them when inputs haven't changed: the effect of `memo`/`useMemo`/`useCallback` without writing them.
- Measured (plain code, 200-item list): an unrelated click re-rendered **201 → 0** components; 50 clicks **26 → 4.6 ms**.
- It only compiles code that follows the **Rules of React** (pure render, no mutation of props/state, hooks rules); it skips the rest.
- Works with React 17+ (17/18 need `react-compiler-runtime`); lint rules ship in `eslint-plugin-react-hooks`.

::: text 🧒 In simple words
Manual memoization is putting **sticky notes** on every answer yourself. The React Compiler is an assistant who reads your homework **before you hand it in** and adds all the sticky notes for you, in exactly the right places. If your homework breaks the rules, the assistant leaves that page alone instead of guessing.
:::

::: text 📖 Detailed answer
### What it does
For each component/hook, the compiler analyses data flow and rewrites the function so that:
- derived values (`items.filter(...)`) are recomputed only when their inputs change,
- functions (`const onSelect = id => …`) keep the same identity,
- JSX elements (`<ProductList items={items} />`) are **reused** when their props didn't change → React skips rendering that child.
It can memoize **conditionally** (after early returns), which manual hooks can't.

### What it doesn't do
- It doesn't wrap components in `React.memo`: a list item still re-renders if the list re-renders with new item elements (measured below: selecting a row re-rendered all 200 items).
- It can't fix impure code: mutating props/state during render, reading refs during render, side effects in render → it **bails out** for that component.
- It doesn't make expensive work cheaper; it avoids **repeating** it.

### Adopting it
1. `npm i -D -E babel-plugin-react-compiler@latest`, add it first in Babel plugins (Vite: `@vitejs/plugin-react` babel option; Next.js: `reactCompiler: true`).
2. Turn on `eslint-plugin-react-hooks` recommended rules to find Rule-of-React violations.
3. Roll out incrementally (`compilationMode: 'annotation'` + `'use memo'`, or exclude files; `'use no memo'` opts a component out).
4. Keep existing `useMemo`/`useCallback` until tested; new code doesn't need them.
:::

::: diagram What the compiler adds around a component
flowchart LR
  S["Your component (plain code)"] --> B["Babel: babel-plugin-react-compiler"]
  B --> C["Compiled: cache slots, recompute only when inputs change"]
  C --> R["Same element reused → React skips the child"]
  B -.->|"breaks Rules of React"| X["Left as is (bail out)"]
:::

::: image React Compiler: automatic memoization (measured: 201 → 0 re-renders per click)
/images/react/compiler.svg
:::

::: chart bar Measured: components re-rendered per unrelated click above a 200-item list (React 19.3, compiled with babel-plugin-react-compiler 1.0)
Build,Components re-rendered per click
Without the compiler,201
With React Compiler 1.0,0
:::

::: chart bar Measured: 50 clicks on the cart button (same app, React 19.3 production build, jsdom)
Build,Total time (ms)
Without the compiler,26
With React Compiler 1.0,4.6
:::

::: text 🪜 Step by step
What happened in the measurement:
1. `Shop` has `cartCount` state and renders `<ProductList items={items} selectedId={selectedId} onSelect={handleSelect} />` (no memo anywhere).
2. Without the compiler, clicking the cart re-renders `Shop` → a new `handleSelect` and a new `<ProductList>` element → ProductList and its 200 Items re-render.
3. The compiler wrapped `handleSelect` and the `<ProductList>` element in cache slots keyed by `items` and `selectedId`.
4. A cart click changes only `cartCount` → the cached `<ProductList>` element is reused → React skips it: 0 child renders, 26 → 4.6 ms for 50 clicks.
5. Selecting a row changes `selectedId` → ProductList recomputes its item elements → all 200 Items re-render (add `memo` to Item if that matters).
:::

::: code javascript What compiled code looks like (simplified, runnable)
// The compiler turns a component into "check inputs, reuse the cached element if nothing changed".
function createCache(size) { return new Array(size).fill(Symbol.for('empty')); }

let created = 0;
const element = (type, props) => { created++; return { type, props }; };    // stands for JSX

function ShopCompiled($, { items, cartCount }) {                  // $ = this component's cache slots
  let list;
  if ($[0] !== items) {                                            // inputs changed?
    list = element('ProductList', { items });                      //   → build a new element
    $[0] = items; $[1] = list;
  } else {
    list = $[1];                                                   //   → reuse the same element object
  }
  return element('div', { children: [element('button', { children: cartCount }), list] });
}

const $ = createCache(2);
const items = [{ id: 1 }, { id: 2 }];
const first = ShopCompiled($, { items, cartCount: 0 });
const second = ShopCompiled($, { items, cartCount: 1 });           // only the cart changed
console.log('ProductList element reused', first.props.children[1] === second.props.children[1] ? '✅' : '❌ FAIL');
const third = ShopCompiled($, { items: [...items, { id: 3 }], cartCount: 1 });
console.log('new items → new element', third.props.children[1] !== second.props.children[1] ? '✅' : '❌ FAIL');
console.log('elements created:', created, created === 8 ? '✅' : '❌ FAIL');
:::

::: code bash Turning it on (Vite and Next.js)
# install (pin the exact version)
npm install --save-dev --save-exact babel-plugin-react-compiler@latest
npm install --save-dev eslint-plugin-react-hooks@latest

# vite.config.js
#   import react from '@vitejs/plugin-react';
#   export default { plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })] };

# next.config.js (Next.js 15.3.1+ / 16)
#   module.exports = { reactCompiler: true };
:::

::: warning ⚠️ Common mistakes
- Expecting it to fix code that breaks the Rules of React (it skips those components silently unless you lint).
- Deleting all existing `useMemo`/`useCallback` at once without tests: compiled output may differ (e.g. effect timing that depended on identity).
- Thinking it replaces virtualization, code splitting or good state placement.
- Not pinning the version (`--save-exact`): output can change between releases.
:::

::: understand
- The compiler automates the memo chain you'd build by hand, including element reuse.
- It's only as good as your code's purity: the Rules of React became enforceable, not optional.
:::

::: ask
- *"Is the codebase clean under eslint-plugin-react-hooks' compiler rules?"*
- *"Which bundler?"* Vite, Next.js, Expo and Babel-based setups are supported; SWC support depends on the framework.
:::

::: important ⭐ Say this in the interview
"React Compiler, stable since version 1.0 in October 2025, is a build-time Babel plugin that automatically memoizes components and hooks: it caches derived values, callbacks and JSX elements and reuses them when their inputs didn't change, so React can skip children. In my measurement on plain code with no memo, an unrelated click above a 200-item list re-rendered 201 components without the compiler and none with it, and fifty clicks went from 26 to under 5 milliseconds. It only compiles code that follows the Rules of React, it doesn't add memo to list items, and I'd roll it out with the lint rules and tests."
:::

::: links
react.dev: React Compiler | https://react.dev/learn/react-compiler
React Compiler v1.0 | https://react.dev/blog/2025/10/07/react-compiler-1
react.dev: Rules of React | https://react.dev/reference/rules
:::

=== How do you upgrade to React 19, and what was removed?
@p 2
@tags react, react-19, migration, breaking-changes
@quick
- Step 1: upgrade to **React 18.3**: same as 18.2 but **warns** about everything removed in 19. Fix the warnings.
- Step 2: install `react@19 react-dom@19` (and `@types/react@19`), run the **codemods** (`npx codemod@latest react/19/migration-recipe`).
- Removed: `ReactDOM.render`/`hydrate`, `unmountComponentAtNode`, `findDOMNode`, string refs, legacy context, `propTypes`/`defaultProps` on function components, `react-test-renderer/shallow`, `act` from `react-dom/test-utils`.
- New strictness: errors in render are reported once (not re-thrown); `useRef` requires an argument in TypeScript; JSX namespace moved to `React.JSX`.
- Check libraries (UI kits, form libs, testing) for 19 support, and test in Strict Mode.

::: text 🧒 In simple words
Upgrading React is like moving house: first you **label everything that won't fit** in the new house (React 18.3 warnings), fix or throw those things away, then move (install 19) with a removal company that packs the easy boxes for you (codemods).
:::

::: text 📖 Detailed answer
### Removed APIs and replacements
| Removed / deprecated | Replacement |
|---|---|
| `ReactDOM.render`, `ReactDOM.hydrate` | `createRoot(el).render()`, `hydrateRoot(el, <App/>)` |
| `unmountComponentAtNode` | `root.unmount()` |
| `findDOMNode` | DOM refs |
| string refs (`ref="input"`) | `useRef` / callback refs |
| legacy context (`contextTypes`, `getChildContext`) | `createContext` |
| `propTypes` on any component, `defaultProps` on function components | TypeScript / runtime validation, ES default parameters |
| `react-test-renderer` (deprecated), `act` from `react-dom/test-utils` | Testing Library, `act` from `react` |
| `forwardRef` (still works) | `ref` as a prop |
| `<Context.Provider>` (still works) | `<Context>` |

### TypeScript changes
`useRef()` needs an initial value, `ref` callbacks must not implicitly return values, `ReactElement` props default to `unknown`, global `JSX` namespace → `React.JSX`. The `types-react-codemod` handles most.

### Upgrade plan for a real app
1. Upgrade to 18.3, run the app and tests with Strict Mode, fix every deprecation warning.
2. Update libraries: router, state, UI kit, form, testing (most support 19 since 2025).
3. Install 19, run codemods (React and TypeScript).
4. Run tests, check hydration warnings (now more precise), check error reporting (`onCaughtError`).
5. Only then adopt new APIs (Actions, `use`, ref as prop) and consider the Compiler.
:::

::: diagram The upgrade path
flowchart LR
  A["React 18.2"] --> B["React 18.3: deprecation warnings"]
  B --> C["Fix warnings, update libraries"]
  C --> D["React 19 + codemods"]
  D --> E["Tests, Strict Mode, hydration checks"]
  E --> F["Adopt Actions, use(), Compiler"]
:::

::: image What React 19 removed and what to use instead
/images/react/react19-upgrade.svg
:::

::: text 🪜 Step by step
Migrating an old component file:
1. `ReactDOM.render(<App />, el)` → `createRoot(el).render(<App />)` in `main.jsx`.
2. `Button.defaultProps = { size: 'md' }` → `function Button({ size = 'md' })`.
3. `Button.propTypes = {…}` → delete (types in TypeScript) or validate at boundaries.
4. `forwardRef((props, ref) => <input ref={ref} />)` → `function Input({ ref, ...props })` (codemod).
5. Tests: `import { act } from 'react-dom/test-utils'` → `import { act } from 'react'`; shallow renderer tests → Testing Library.
:::

::: code bash Commands for the upgrade
# 1) the warning release
npm install react@18.3 react-dom@18.3

# 2) React 19 + types
npm install react@19 react-dom@19
npm install --save-dev @types/react@19 @types/react-dom@19

# 3) codemods
npx codemod@latest react/19/migration-recipe          # render → createRoot, string refs, act import, …
npx types-react-codemod@latest preset-19 ./src        # TypeScript changes
:::

::: code jsx Before and after: the most common migrations
// BEFORE (React 17/18)
import ReactDOM from 'react-dom';
const Button = React.forwardRef(function Button(props, ref) {
  return <button ref={ref} className={props.size}>{props.children}</button>;
});
Button.defaultProps = { size: 'md' };
ReactDOM.render(<Button>Save</Button>, document.getElementById('root'));

// AFTER (React 19)
import { createRoot } from 'react-dom/client';
function ButtonNew({ ref, size = 'md', children }) {
  return <button ref={ref} className={size}>{children}</button>;
}
createRoot(document.getElementById('root')).render(<ButtonNew>Save</ButtonNew>);
:::

::: warning ⚠️ Common mistakes
- Jumping straight from 17/18.2 to 19 without the 18.3 warnings.
- Upgrading React before checking that key libraries support 19.
- Relying on `defaultProps` for function components (silently ignored in 19).
- Tests failing because `act` was imported from `react-dom/test-utils`.
:::

::: understand
- 19's removals were deprecated for years; 18.3 exists to find them.
- Codemods do most mechanical work; libraries and tests are usually the real effort.
:::

::: ask
- *"Which React version and which key libraries are we on?"*
- *"How good is test coverage?"* It decides how fast you can upgrade safely.
:::

::: important ⭐ Say this in the interview
"I'd upgrade in steps: first to React 18.3, which warns about every API removed in 19, fix those warnings and update libraries, then install React 19 with the types and run the official codemods. The main removals are ReactDOM.render and hydrate in favour of createRoot and hydrateRoot, string refs, legacy context, findDOMNode, propTypes, defaultProps on function components and act from test-utils. Then I run the tests in Strict Mode, check hydration warnings, and only after that adopt Actions, use and the Compiler."
:::

::: links
React 19 upgrade guide | https://react.dev/blog/2024/04/25/react-19-upgrade-guide
React codemods | https://github.com/reactjs/react-codemod
types-react-codemod | https://github.com/eps1lon/types-react-codemod
:::
