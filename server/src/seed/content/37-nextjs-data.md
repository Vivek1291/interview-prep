@section Next.js Data, Caching & Server
@icon 🗄️
@color #64748b
@desc After the fundamentals: fetching data in Server Components, caching with use cache (Next.js 16), Server Actions, Route Handlers and Proxy, and metadata, images and fonts for SEO and Core Web Vitals. Verified against Next.js 16.3.

=== How do you fetch data in the App Router? (parallel fetching, streaming, deduplication)
@p 3
@tags nextjs, data-fetching, suspense, streaming
@quick
- In **Server Components**, just `await` your data: `fetch`, an ORM, the database, the file system. No `useEffect`, no API layer needed.
- Avoid **waterfalls**: start independent requests together with `Promise.all` (or start them and await later).
- **Stream** slow parts with `<Suspense fallback>` or a `loading.tsx` file: the shell arrives first, slow data streams in.
- **Deduplicate** with `React.cache(fn)` (same arguments → one call per request); fetch where the data is needed instead of prop drilling.
- In **Client Components**: pass a promise from the server and read it with `use(promise)`, or use SWR / TanStack Query for client-side fetching.

::: text 🧒 In simple words
Fetching in Server Components is like the **kitchen getting ingredients directly from the storeroom** instead of the waiter running back and forth. And a good kitchen sends out the **starters first** (the shell) while the slow-cooked dish is still on the stove (streaming).
:::

::: text 📖 Detailed answer
### Where to fetch
| Where | How | Notes |
|---|---|---|
| Server Component | `await fetch(...)`, `await db.query(...)` | default choice; secrets stay on the server |
| Server Component → Client | pass a **promise** prop, read with `use()` | starts the fetch early on the server |
| Client Component | SWR / TanStack Query / `fetch` in effects | for data that changes with user interaction (polling, infinite scroll) |
| Route Handler | `GET` in `route.ts` | when something outside your UI needs the data |

### Sequential vs parallel
- Sequential: `const user = await getUser(); const posts = await getPosts(user.id)`: necessary only when the second call needs the first result.
- Parallel: `const [user, stats] = await Promise.all([getUser(id), getStats(id)])`: total time = the slowest call, not the sum.

### Streaming
Wrap slow components in `<Suspense>`; each boundary streams independently. `loading.tsx` wraps the whole page segment. Measured on Next.js 16: a page with 400 ms of data sent its shell in **5.1 ms** and finished at **416 ms**.

### Deduplication
`React.cache(getUser)` memoises per request, so a layout and a page can both call `getUser(id)` and the database is hit once. For cross-request caching use `'use cache'` (next question).
:::

::: diagram Waterfall vs parallel vs streaming
flowchart LR
  subgraph W["waterfall: A + B"]
    A1["await getUser"] --> B1["await getPosts"]
  end
  subgraph PA["parallel: max of A, B"]
    A2["getUser"] --> J["Promise.all"]
    B2["getPosts"] --> J
  end
  subgraph ST["streaming"]
    SH["shell + fallback sent now"] --> SL["slow part streams when ready"]
  end
:::

::: image Fetching data in the App Router
/images/nextjs/data-fetching.svg
:::

::: text 🪜 Step by step
A user dashboard with a profile header (fast), stats (fast) and activity feed (slow):
1. The page awaits `Promise.all([getUser(id), getStats(id)])` (parallel).
2. The activity feed is a separate async component inside `<Suspense fallback={<FeedSkeleton />}>`.
3. The server sends HTML for the header, stats and the skeleton right away.
4. When the feed's query resolves, React streams its HTML into the same response and swaps out the skeleton.
5. `getUser` is wrapped in `React.cache`, so the layout's avatar and the page's header share one query.
:::

::: code tsx app/dashboard/[id]/page.tsx: parallel fetching, streaming and React.cache
import { Suspense, cache } from 'react';

type User = { id: number; firstName: string };
type Post = { id: number; title: string };

const getUser = cache(async (id: string): Promise<User> => {        // deduped per request
  const res = await fetch(`https://dummyjson.com/users/${id}`);
  return res.json();
});
async function getStats(id: string) {
  const res = await fetch(`https://dummyjson.com/carts/user/${id}`);
  return (await res.json()) as { total: number };
}
async function getActivity(id: string): Promise<Post[]> {
  const res = await fetch(`https://dummyjson.com/posts/user/${id}`);
  return (await res.json()).posts;
}

async function ActivityFeed({ id }: { id: string }) {
  const posts = await getActivity(id);                                 // slow: streamed
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, stats] = await Promise.all([getUser(id), getStats(id)]); // parallel, not a waterfall
  return (
    <main>
      <h1>Hi {user.firstName}</h1>
      <p>{stats.total} carts</p>
      <Suspense fallback={<p>Loading activity…</p>}>
        <ActivityFeed id={id} />
      </Suspense>
    </main>
  );
}
:::

::: code javascript Why parallel fetching matters (runnable)
const wait = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
const getUser = () => wait(60, { name: 'Asha' });
const getStats = () => wait(60, { carts: 3 });

(async () => {
  let t = Date.now();
  const u1 = await getUser(); const s1 = await getStats();          // waterfall
  const sequential = Date.now() - t;
  t = Date.now();
  const [u2, s2] = await Promise.all([getUser(), getStats()]);      // parallel
  const parallel = Date.now() - t;
  console.log({ sequential, parallel, same: u1.name === u2.name && s1.carts === s2.carts });
  console.log('parallel ≈ the slowest call, sequential ≈ the sum', sequential >= 115 && parallel < 100 ? '✅' : '❌ FAIL');

  // React.cache-style dedupe: same args → one call per request
  let calls = 0;
  const cache = (fn) => { const m = new Map(); return (k) => (m.has(k) ? m.get(k) : (m.set(k, fn(k)), m.get(k))); };
  const getUserCached = cache((id) => { calls++; return wait(10, { id }); });
  await Promise.all([getUserCached('1'), getUserCached('1'), getUserCached('2')]);
  console.log('deduplicated calls', calls === 2 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Fetching in Client Components with `useEffect` what a Server Component could fetch.
- Sequential `await`s for independent data (waterfalls).
- Calling your own Route Handlers from Server Components (`fetch('/api/...')`): call the function/DB directly instead.
- One big `loading.tsx` when only one small widget is slow (use a focused `<Suspense>`).
- Expecting `React.cache` to cache across requests (it's per request; use `'use cache'` for that).
:::

::: understand
- Fetch on the server, in parallel, close to where data is used; stream what's slow.
:::

::: ask
- *"Does this data change with user interaction in the browser?"* Then a client fetching library may fit better.
:::

::: important ⭐ Say this in the interview
"In the App Router I fetch data directly in async Server Components, with fetch, an ORM or the database, so there's no API layer for my own UI and secrets stay on the server. I avoid waterfalls by starting independent requests together with Promise.all, I wrap slow parts in Suspense or use loading.tsx so the shell streams immediately, and I dedupe with React.cache so a layout and page can ask for the same user and hit the database once. Client Components can receive a promise and read it with use, or use a client fetching library for interactive data."
:::

::: links
Next.js: Fetching data | https://nextjs.org/docs/app/getting-started/fetching-data
React: cache | https://react.dev/reference/react/cache
React: use | https://react.dev/reference/react/use
:::

=== How does caching work in Next.js 16? ('use cache', cacheLife, cacheTag, revalidation)
@p 3
@tags nextjs, caching, use-cache, revalidation, isr
@quick
- Enable **Cache Components** with `cacheComponents: true` in `next.config.ts`; then caching is **explicit**: nothing is cached unless you add **`'use cache'`**.
- `'use cache'` at the top of an async function or component caches its result; **arguments and captured values form the cache key**.
- `cacheLife('hours' | 'days' | 'max' | …)` sets the lifetime; `cacheTag('products')` labels entries for invalidation.
- Invalidate: **`updateTag(tag)`** in a Server Action (expire now: the user sees their own write), **`revalidateTag(tag, 'max')`** (stale-while-revalidate in the background), `revalidatePath(path)` (whole path, less precise).
- Measured: a page whose data takes 400 ms responded in **1.5 ms** with `'use cache'`. Never cache per-user data in a shared cache (`'use cache: private'` or don't cache).

::: text 🧒 In simple words
`'use cache'` is a **photocopy of a finished answer** kept on the shelf. `cacheLife` is the **"best before" date**, `cacheTag` is the **label on the folder**. When the original changes, you either **throw the copy away now** (`updateTag`) or **keep handing out the old copy while a new one is made** (`revalidateTag`).
:::

::: text 📖 Detailed answer
### Turning it on
`// next.config.ts`  
`const nextConfig = { cacheComponents: true };`
Then everything is dynamic by default unless it's synchronous/static or marked `'use cache'`, and uncached async work must be inside `<Suspense>`.

### Levels
| Level | Example | Caches |
|---|---|---|
| Data | `async function getProducts() { 'use cache'; … }` | the function's return value |
| UI | `export default async function Page() { 'use cache'; … }` | a component's rendered output |
| File | `'use cache'` at the top of a file | every exported function in it |

### Lifetimes and tags
- `cacheLife('seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max')` or a custom profile in config.
- `cacheTag('products', \`product-${id}\`)`: tags can be shared across functions.

### Invalidation
| API | Where | Behaviour | Use |
|---|---|---|---|
| `updateTag('products')` | Server Actions only | expires immediately, next read is fresh | read-your-own-writes (admin saves a product) |
| `revalidateTag('products', 'max')` | Server Actions, Route Handlers | serve stale, refresh in background | CMS webhooks, catalogues |
| `revalidatePath('/shop')` | Server Actions, Route Handlers | everything under a path | when tags aren't set up |
| `cacheLife` | inside the cached function | time-based expiry | periodically changing data |

### Rules
- Cached functions can't read `cookies()`/`headers()` directly; read them outside and pass values as arguments (they become part of the key).
- Arguments and return values must be serialisable.
- Per-user data: don't put it in a shared cache.

### Before Cache Components
Older apps (Next 13–15 without the flag) use `fetch(url, { next: { revalidate: 60, tags: [...] } })`, route segment config (`export const revalidate = 60`, `dynamic = 'force-static'`) and `unstable_cache`. Next 15 changed `fetch` to **not** be cached by default.
:::

::: diagram Life of a cached entry
flowchart LR
  R["request"] --> H{"cache hit and fresh?"}
  H -->|"yes"| S["serve cached result (1.5 ms measured)"]
  H -->|"no"| F["run the function (400 ms of data work)"]
  F --> W["store with cacheLife and cacheTag"]
  W --> S
  U["updateTag('products') in a Server Action"] -->|"expire now"| H
  RV["revalidateTag('products', 'max')"] -->|"stale while revalidate"| H
:::

::: image Caching in Next.js 16: use cache, cacheLife, cacheTag
/images/nextjs/caching.svg
:::

::: chart bar Measured: response time for a page whose data takes 400 ms (Next.js 16.3, next start, ms)
Version of the page,Complete response (ms)
data inside use cache,1.5
uncached data streamed in Suspense,415.7
:::

::: text 🪜 Step by step
An admin edits product 42:
1. Product pages read `getProduct(id)` marked `'use cache'`, `cacheLife('days')`, `cacheTag('product-42', 'products')`.
2. The admin submits a form handled by the `saveProduct` Server Action.
3. The action validates input, checks permissions and writes to the database.
4. It calls `updateTag('product-42')`: that entry expires immediately.
5. The redirect back to the product shows fresh data for the admin; other cached products are untouched.
:::

::: code tsx app/lib/products.ts and a Server Action that invalidates it
// next.config.ts → const nextConfig: NextConfig = { cacheComponents: true };
import { cacheLife, cacheTag, updateTag, revalidateTag } from 'next/cache';

type Product = { id: number; title: string; price: number };

export async function getProduct(id: number): Promise<Product> {
  'use cache';
  cacheLife('days');
  cacheTag(`product-${id}`, 'products');
  const res = await fetch(`https://dummyjson.com/products/${id}`);
  return res.json();
}

export async function getProductsForCountry(country: string): Promise<Product[]> {
  'use cache';                                   // `country` is part of the cache key
  cacheLife('hours');
  cacheTag('products');
  const res = await fetch(`https://dummyjson.com/products?limit=5&country=${country}`);
  return (await res.json()).products;
}

// app/admin/actions.ts
export async function saveProduct(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const price = Number(formData.get('price'));
  if (!Number.isInteger(id) || !(price > 0)) return { error: 'Invalid input' };
  // await db.product.update({ where: { id }, data: { price } })
  updateTag(`product-${id}`);                    // the admin sees the new price right away
  return { ok: true };
}

// app/api/cms-webhook/route.ts: content changed elsewhere
export async function POST(request: Request) {
  if (request.headers.get('x-webhook-secret') !== process.env.CMS_SECRET) return new Response('Forbidden', { status: 403 });
  revalidateTag('products', 'max');              // background refresh, stale content served meanwhile
  return Response.json({ revalidated: true });
}
:::

::: warning ⚠️ Common mistakes
- Assuming Next 13/14 behaviour (fetch cached by default); Next 15/16 doesn't cache unless you opt in.
- Reading `cookies()` inside a `'use cache'` function (pass the value in as an argument, or don't cache).
- Caching personalised data in a shared cache (one user's data served to another).
- Using `revalidatePath('/')` for everything (over-invalidation); prefer precise tags.
- Calling `updateTag` from a Route Handler (it's for Server Actions; use `revalidateTag` there).
:::

::: understand
- Explicit caching: mark what can be reused, give it a lifetime and tags, invalidate precisely after writes.
:::

::: ask
- *"After a write, must the writer see it immediately, or is a short delay fine?"* `updateTag` vs `revalidateTag`.
:::

::: important ⭐ Say this in the interview
"In Next 16 with Cache Components, caching is explicit: I add 'use cache' to an async function or component, and its arguments form the cache key. cacheLife sets how long it lives and cacheTag labels it. After a mutation I call updateTag from the Server Action so the user immediately sees their own write, or revalidateTag with stale-while-revalidate for background refreshes like CMS webhooks, and revalidatePath when tags aren't available. Cached functions can't read cookies directly and I never put per-user data in a shared cache. I measured a page whose data takes 400 milliseconds answering in 1.5 milliseconds when cached."
:::

::: links
Next.js: Caching | https://nextjs.org/docs/app/getting-started/caching
Next.js: Revalidating | https://nextjs.org/docs/app/getting-started/revalidating
Next.js: use cache | https://nextjs.org/docs/app/api-reference/directives/use-cache
:::

=== What are Server Actions, and how do you use them safely?
@p 3
@tags nextjs, server-actions, forms, mutations, security
@quick
- A **Server Action** (Server Function) is an `async` function marked **`'use server'`** that runs on the server and can be called from forms and Client Components, with no API route to write.
- `<form action={createTodo}>` posts `FormData`; it works **before JavaScript loads** (progressive enhancement).
- Client helpers: `useActionState(action, initial)` → `[state, formAction, isPending]`; `useFormStatus()` for a submit button; `useOptimistic()` for instant UI.
- After writing: `updateTag`/`revalidatePath` to refresh data, `redirect()` to navigate.
- **Every action is a public HTTP endpoint**: validate input (zod), check **authentication and authorization inside the action**, rate-limit sensitive ones.

::: text 🧒 In simple words
A Server Action is like a **suggestion box that goes straight to the manager's office**: you write your note (the form), drop it in, and the manager handles it. But anyone can drop notes in that box, so the manager must **check who wrote it** and whether it makes sense before acting.
:::

::: text 📖 Detailed answer
### Defining actions
- Inline in a Server Component: `async function create(formData: FormData) { 'use server'; … }`.
- In a separate file with `'use server'` at the top: every export is an action (importable by Client Components).

### Calling actions
| From | How |
|---|---|
| `<form>` in a Server Component | `<form action={create}>` (works without JS) |
| Client Component form | `const [state, formAction, pending] = useActionState(create, initial)`, then `<form action={formAction}>` |
| Event handler | `startTransition(() => create(data))` or `await create(data)` |
| Extra arguments | `create.bind(null, postId)` (bound args are serialised) |

### After the mutation
1. Validate and authorise.
2. Write to the database.
3. Refresh what changed: `updateTag('posts')` or `revalidatePath('/posts')`.
4. Return a result (errors, ids) or `redirect('/posts/42')`.

### Security checklist
- Treat inputs as untrusted (`FormData` values are strings or files); parse with zod.
- Check the session **in the action** (a hidden button or page-level check isn't protection).
- Check ownership/permissions (can this user edit post 42?).
- Don't return sensitive data; return only what the UI needs.
- Next.js adds CSRF protections (POST only, origin check), and unused actions get unguessable IDs, but authorization is your job.
:::

::: diagram A form submitted to a Server Action
sequenceDiagram
  participant U as User
  participant C as Client form (useActionState)
  participant A as Server Action
  participant D as Database
  U->>C: "submit"
  C->>A: "POST with FormData (isPending = true)"
  A->>A: "validate with zod, check session and permissions"
  A->>D: "insert or update"
  A->>A: "updateTag('todos')"
  A-->>C: "result state (errors or ok) + fresh UI"
:::

::: image Server Actions: mutations without an API layer
/images/nextjs/server-actions.svg
:::

::: text 🪜 Step by step
Adding a todo with validation errors shown inline:
1. `app/todos/actions.ts` (`'use server'`) exports `addTodo(prevState, formData)`.
2. The Client Component calls `useActionState(addTodo, { error: null })` and renders `<form action={formAction}>`.
3. On submit, `isPending` becomes `true`; the button shows "Saving…".
4. The action validates: empty title → returns `{ error: 'Title is required' }`, rendered under the input.
5. Valid title → insert, `updateTag('todos')`, return `{ error: null }`; the list re-renders with the new item.
:::

::: code tsx app/todos/actions.ts and a form using useActionState
// app/todos/actions.ts
// 'use server';
import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';

export type TodoState = { error: string | null; count: number };

async function getUserId(): Promise<string | null> {
  return (await cookies()).get('session')?.value ?? null;   // look up the session in real code
}

export async function addTodo(prev: TodoState, formData: FormData): Promise<TodoState> {
  'use server';
  const userId = await getUserId();
  if (!userId) return { ...prev, error: 'Please log in' };            // authorization INSIDE the action
  const title = formData.get('title');
  if (typeof title !== 'string' || title.trim().length < 3) return { ...prev, error: 'Title must have 3+ characters' };
  // await db.todoItem.create({ data: { title: title.trim(), userId } })
  updateTag('todos');
  return { error: null, count: prev.count + 1 };
}

// app/todos/TodoForm.tsx
// 'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>;
}

export function TodoForm() {
  const [state, formAction, isPending] = useActionState(addTodo, { error: null, count: 0 });
  return (
    <form action={formAction} aria-busy={isPending}>
      <input name="title" required minLength={3} />
      <SubmitButton />
      {state.error && <p role="alert">{state.error}</p>}
      <p>Added {state.count} todos</p>
    </form>
  );
}
:::

::: code javascript The validation logic inside the action (runnable)
// The same checks the action performs, as a plain function you can test.
function validateTodo(session, formData) {
  if (!session) return { error: 'Please log in' };
  const title = formData.get('title');
  if (typeof title !== 'string' || title.trim().length < 3) return { error: 'Title must have 3+ characters' };
  return { error: null, title: title.trim() };
}
const fd = (obj) => new Map(Object.entries(obj));          // minimal FormData stand-in (has .get)
console.log('no session → rejected', validateTodo(null, fd({ title: 'Buy milk' })).error === 'Please log in' ? '✅' : '❌ FAIL');
console.log('too short → error', validateTodo('u1', fd({ title: ' a ' })).error.startsWith('Title') ? '✅' : '❌ FAIL');
console.log('missing field → error', validateTodo('u1', fd({})).error !== null ? '✅' : '❌ FAIL');
console.log('valid → trimmed title', validateTodo('u1', fd({ title: '  Buy milk ' })).title === 'Buy milk' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Trusting that only your UI calls the action (anyone can POST to it).
- Checking auth in the page but not in the action.
- Forgetting to revalidate, so the UI shows stale data after a successful write.
- Using actions for data **reads** (they're POST and sequential; read in Server Components).
- Wrapping `redirect()` in `try/catch` (it throws to work).
:::

::: understand
- Server Actions = typed RPC for mutations with progressive enhancement; secure them like any public endpoint.
:::

::: ask
- *"Is this a mutation from our own UI, or an API for other clients?"* Actions for the first, Route Handlers for the second.
:::

::: important ⭐ Say this in the interview
"A Server Action is an async function marked 'use server' that runs on the server and can be passed to a form's action or called from a Client Component, so I don't need to write an API route for my own UI's mutations, and forms keep working before JavaScript loads. On the client I use useActionState for the result and pending state, useFormStatus for submit buttons and useOptimistic for instant feedback. Inside the action I validate the FormData, check the session and permissions, write, then call updateTag or revalidatePath, because every action is effectively a public POST endpoint."
:::

::: links
Next.js: Mutating data | https://nextjs.org/docs/app/getting-started/mutating-data
React: useActionState | https://react.dev/reference/react/useActionState
Next.js: Data security guide | https://nextjs.org/docs/app/guides/data-security
:::

=== Route Handlers and Proxy (formerly Middleware): when do you use them?
@p 2
@tags nextjs, route-handlers, proxy, middleware, api
@quick
- **Route Handlers**: `app/api/users/route.ts` exporting `GET`, `POST`, `PUT`, `DELETE`… using the Web `Request`/`Response` APIs. For webhooks, public/mobile APIs, file downloads, OAuth callbacks.
- **Proxy** (`proxy.ts`, renamed from `middleware.ts` in **Next.js 16**): runs **before** a request is handled: redirects, rewrites, headers, A/B tests, optimistic auth checks. One per project, filtered with `config.matcher`.
- Proxy is **not** for slow data fetching or full authorization; do real auth checks where data is accessed (Server Components, Actions, Route Handlers).
- For your own UI: **read** in Server Components, **write** with Server Actions; don't add API routes just to call them from your own pages.
- Simple static redirects belong in `next.config.ts` `redirects()`.

::: text 🧒 In simple words
**Proxy** is the **security guard at the building entrance**: checks badges quickly, points people to the right floor, but doesn't do the actual work. **Route Handlers** are **service counters** for visitors from outside (other apps, webhooks). Your own staff (your UI) use internal doors: Server Components and Server Actions.
:::

::: text 📖 Detailed answer
### Route Handlers
- File: `route.ts` in any `app/` folder (can't coexist with a `page.tsx` in the same folder).
- Signature: `export async function GET(request: Request, { params }: { params: Promise<{ id: string }> })`.
- Return `Response.json(data, { status })`, `new Response(stream)`, redirects, any headers.
- With Cache Components, `GET` handlers follow the same prerendering model as pages: use `connection()` or runtime APIs for per-request responses.

### Proxy (`proxy.ts`)
| Good for | Not for |
|---|---|
| redirect `/` to `/en` based on `Accept-Language` | database queries |
| rewrite `/dashboard` to a variant for an A/B test | full session validation |
| add security headers | heavy computations |
| optimistic check: no session cookie → redirect to `/login` | anything that must be the only line of defence |

`export function proxy(request: NextRequest) { … }` + `export const config = { matcher: ['/dashboard/:path*'] }`. Fetch caching options have no effect in Proxy.

### Choosing
| Need | Use |
|---|---|
| Data for your pages | Server Component |
| Mutation from your UI | Server Action |
| Endpoint for other clients, webhooks, files | Route Handler |
| Before-request logic for many routes | Proxy |
| Fixed old → new URL mapping | `next.config` redirects |
:::

::: diagram A request through Proxy to a handler
flowchart LR
  R["request"] --> P{"proxy.ts matcher matches?"}
  P -->|"no"| H["page or route.ts"]
  P -->|"yes"| X["proxy: redirect, rewrite or set headers"]
  X -->|"redirect"| R2["new URL"]
  X -->|"continue"| H
  H --> RS["Response"]
:::

::: image Route Handlers and Proxy
/images/nextjs/route-handlers-proxy.svg
:::

::: text 🪜 Step by step
Protecting `/dashboard` and exposing an API for a mobile app:
1. `proxy.ts` with `matcher: ['/dashboard/:path*']` checks for a `session` cookie; missing → `NextResponse.redirect('/login')` (optimistic, fast).
2. The dashboard page still verifies the session against the database in a data-access function (the real check).
3. `app/api/orders/route.ts` exports `GET` for the mobile app, verifying a bearer token.
4. `POST` in the same file creates an order after validating the JSON body.
5. Both return `Response.json(...)` with proper status codes.
:::

::: code tsx proxy.ts and app/api/orders/route.ts
// proxy.ts (project root, Next.js 16; was middleware.ts)
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('session');
  if (!hasSession) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);              // optimistic check only
  }
  const res = NextResponse.next();
  res.headers.set('x-frame-options', 'DENY');
  return res;
}
export const config = { matcher: ['/dashboard/:path*'] };

// app/api/orders/route.ts
type Order = { id: number; item: string; qty: number };
const orders: Order[] = [];

function authorised(request: Request) {
  return request.headers.get('authorization') === `Bearer ${process.env.API_TOKEN}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20);
  return Response.json({ data: orders.slice(0, limit) });
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || typeof (body as Order).item !== 'string' || !Number.isInteger((body as Order).qty)) {
    return Response.json({ error: 'item (string) and qty (integer) are required' }, { status: 400 });
  }
  const order = { id: orders.length + 1, item: (body as Order).item, qty: (body as Order).qty };
  orders.push(order);
  return Response.json({ data: order }, { status: 201 });
}
:::

::: warning ⚠️ Common mistakes
- Calling `middleware.ts` in a Next 16 project (renamed to `proxy.ts`; the function is `proxy`).
- Doing full authorization only in Proxy (it can be bypassed by matcher mistakes; check where data is read).
- Creating API routes for your own pages' reads (extra hop; use Server Components).
- Slow database calls in Proxy (it runs on every matched request).
- A `route.ts` and `page.tsx` in the same folder (conflict).
:::

::: understand
- Proxy = fast gatekeeper before routing; Route Handlers = HTTP endpoints for the outside world.
:::

::: ask
- *"Who calls this endpoint: our UI, another app, or a webhook?"*
:::

::: important ⭐ Say this in the interview
"Route Handlers are route.ts files that export functions like GET and POST using the Web Request and Response APIs; I use them for webhooks, public or mobile APIs, file downloads and OAuth callbacks. Proxy, which Next 16 renamed from middleware, runs before a request is handled and is good for redirects, rewrites, headers, A/B tests and optimistic auth redirects, filtered by a matcher. It isn't meant for slow data fetching or as the only authorization layer, so real permission checks live where data is read or mutated. For my own UI I read in Server Components and write with Server Actions instead of building API routes."
:::

::: links
Next.js: Route Handlers | https://nextjs.org/docs/app/getting-started/route-handlers
Next.js: Proxy | https://nextjs.org/docs/app/getting-started/proxy
Next.js 16 upgrade guide | https://nextjs.org/docs/app/guides/upgrading/version-16
:::

=== How does Next.js help with SEO and performance? (Metadata, next/image, next/font)
@p 2
@tags nextjs, seo, metadata, next-image, next-font, web-vitals
@quick
- **Metadata API**: `export const metadata = { title, description, openGraph }` or `generateMetadata()` for dynamic pages; file conventions `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`, `icon.png`.
- **`next/image`**: resizes and serves modern formats (WebP/AVIF), lazy-loads by default, requires `width`/`height` (or `fill`) so there's **no layout shift**. For the LCP image use `fetchPriority="high"` (Next 16 deprecated `priority` in favour of `preload`).
- **`next/font`**: downloads Google/local fonts **at build time**, self-hosts them, and adds fallback metrics (`size-adjust`) to avoid layout shift.
- Server Components and streaming shrink JS (better INP) and send content early (better FCP/LCP).
- Measure: Lighthouse/DevTools in the lab, real-user Web Vitals (`useReportWebVitals`, Vercel Analytics) in the field.

::: text 🧒 In simple words
Metadata is the **label on the shop window** that search engines and social apps read. `next/image` is a **photo lab** that prints each picture at the right size and reserves the frame on the wall before the photo arrives. `next/font` **brings the font into the shop** so customers don't wait for it from somewhere else.
:::

::: text 📖 Detailed answer
### Metadata
| Need | How |
|---|---|
| Static title/description | `export const metadata: Metadata = { title: { default: 'Shop', template: '%s · Shop' } }` in a layout |
| Per-page dynamic | `export async function generateMetadata({ params })` (shares cached fetches with the page) |
| Social previews | `openGraph`, `twitter` fields, or `opengraph-image.tsx` generating an image |
| Crawling | `sitemap.ts`, `robots.ts` |
| Canonical URLs | `alternates: { canonical: '/products/42' }` |

### next/image
- Automatic resizing per device (`sizes` + `srcset`), modern formats, lazy loading.
- Space reserved from `width`/`height` or `fill` + a sized parent → no CLS.
- LCP image: `fetchPriority="high"` (or `loading="eager"`); configure `images.remotePatterns` for external hosts.

### next/font
`const inter = Inter({ subsets: ['latin'], display: 'swap' })` → `<body className={inter.className}>`. The font files are bundled with your app (no request to Google at run time) and fallback fonts are adjusted to match, so text doesn't jump when the font loads.

### Web Vitals mapping
| Metric | Next.js lever |
|---|---|
| LCP | static/cached rendering, streaming, `fetchPriority="high"` on the hero image |
| CLS | image dimensions, `next/font`, reserved space for streamed content (skeletons) |
| INP | Server Components (less JS), small client islands, `useTransition` |
| TTFB | static/cached pages, CDN, avoid blocking data in the shell |
:::

::: diagram From page to search result and fast paint
flowchart LR
  M["metadata / generateMetadata"] --> H["head: title, description, Open Graph"]
  H --> SE["search engines and social previews"]
  I["next/image with fetchPriority high"] --> LCP["fast LCP, no CLS"]
  F["next/font self-hosted"] --> CLS["no font layout shift"]
:::

::: image Metadata, next/image and next/font
/images/nextjs/metadata-image-font.svg
:::

::: text 🪜 Step by step
A product page that ranks and loads fast:
1. `generateMetadata({ params })` awaits `getProduct(id)` (cached; the page reuses the same entry) and returns title, description, canonical and Open Graph image.
2. The hero `<Image>` has `width`, `height`, `sizes` and `fetchPriority="high"`.
3. The layout uses `next/font` for Inter, so text renders with matched fallback metrics.
4. Reviews (slow) stream in `<Suspense>` with a skeleton that reserves height.
5. Lighthouse shows LCP from the hero image, CLS ≈ 0; field data confirms with real users.
:::

::: code tsx app/products/[id]/page.tsx: metadata, image and font
import type { Metadata } from 'next';
import Image from 'next/image';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

type Product = { id: number; title: string; description: string; thumbnail: string };
async function getProduct(id: string): Promise<Product> {
  const res = await fetch(`https://dummyjson.com/products/${id}`);
  return res.json();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return {
    title: product.title,
    description: product.description.slice(0, 155),
    alternates: { canonical: `/products/${id}` },
    openGraph: { title: product.title, images: [{ url: product.thumbnail }] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  return (
    <main className={inter.className}>
      <Image
        src={product.thumbnail}
        alt={product.title}
        width={800}
        height={600}
        sizes="(max-width: 768px) 100vw, 800px"
        fetchPriority="high"
      />
      <h1>{product.title}</h1>
      <p>{product.description}</p>
    </main>
  );
}
// next.config.ts → images: { remotePatterns: [new URL('https://cdn.dummyjson.com/**')] }
:::

::: warning ⚠️ Common mistakes
- Using `priority` on images in Next 16 (deprecated; use `fetchPriority="high"` or `preload`).
- Images without dimensions or `fill` + sized parent (CLS).
- Loading fonts with a `<link>` to Google Fonts instead of `next/font` (extra request, layout shift).
- Client-side-only rendered content for pages that must rank.
- Fetching data twice for metadata and page without caching (use the same cached function).
:::

::: understand
- Metadata for crawlers, `next/image` and `next/font` for LCP/CLS, Server Components for less JS.
:::

::: ask
- *"Which element is the LCP on our key pages?"* Optimise that first.
:::

::: important ⭐ Say this in the interview
"For SEO I use the Metadata API: a static metadata export in layouts with a title template, generateMetadata for dynamic pages, Open Graph images, a sitemap and robots file, and canonical URLs. For performance, next/image resizes and serves modern formats, lazy-loads by default and reserves space so there's no layout shift, and for the LCP image I set fetchPriority high, since priority is deprecated in Next 16. next/font self-hosts fonts at build time with matched fallbacks. Together with Server Components and streaming that improves LCP, CLS and INP, which I verify with real-user Web Vitals."
:::

::: links
Next.js: Metadata and OG images | https://nextjs.org/docs/app/getting-started/metadata-and-og-images
Next.js: Image component | https://nextjs.org/docs/app/api-reference/components/image
Next.js: Font optimization | https://nextjs.org/docs/app/getting-started/fonts
:::
