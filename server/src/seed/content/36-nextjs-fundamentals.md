@section Next.js Fundamentals
@icon ▲
@color #64748b
@desc Next.js 16 from the start: what it adds to React, the App Router, Server vs Client Components, rendering strategies and navigation. Examples were built with Next.js 16.3 and measured with next start.

=== What is Next.js, and why use it instead of a plain React (Vite) app?
@p 3
@tags nextjs, react, framework, ssr
@quick
- **Next.js** is a **full-stack React framework**: routing, server rendering, data fetching, caching, mutations (Server Actions), API routes, image/font optimisation and bundling (Turbopack) in one tool.
- A Vite SPA ships an empty HTML page; the browser downloads JS, fetches data, then renders. Next.js sends **HTML with content** (from the server or CDN) and hydrates only the interactive parts.
- Benefits: better **SEO**, faster **first paint/LCP**, less client JS (Server Components), one codebase for UI and backend logic.
- Costs: a server (or edge/serverless platform) to run, more concepts (server vs client, caching), framework conventions.
- Choose a SPA for internal tools behind login with no SEO needs; Next.js for public sites, e-commerce, content and apps that need fast first loads.

::: text 🧒 In simple words
Plain React is a **box of LEGO bricks**. Next.js is a **LEGO set with instructions, a baseplate and a carry case**: routing, the server and optimisations are already decided, so you build the actual product faster. And instead of shipping the bricks for the customer to assemble (SPA), Next.js can deliver the **finished model** (HTML) right away.
:::

::: text 📖 Detailed answer
### What Next.js adds to React
| Concern | Plain React + Vite | Next.js (App Router) |
|---|---|---|
| Routing | add React Router | folders in `app/` are routes, nested layouts |
| First load | empty HTML + JS bundle | HTML rendered on the server or at build time |
| Data fetching | `useEffect`/React Query in the browser | `async` Server Components fetch on the server |
| Mutations | build an API + call it | Server Actions (or Route Handlers) |
| SEO / social previews | hard (content appears after JS) | Metadata API, HTML has the content |
| Images, fonts | manual | `next/image`, `next/font` |
| Backend endpoints | separate server | Route Handlers (`route.ts`) |

### How a request is served
1. The user requests `/products/42`.
2. Next.js runs the Server Components for that route on the server (or serves a prerendered/cached version).
3. HTML streams to the browser (with `<Suspense>` fallbacks for slow parts).
4. The browser shows content immediately, then downloads JS only for **Client Components** and hydrates them.
5. Navigations after that are client-side; Next.js fetches just the new route's payload.

### When not to use it
- An admin dashboard behind a login with no SEO, where a Vite SPA + API is simpler to host.
- When you can't run Node or use a platform (though `output: 'export'` produces a static site).
:::

::: diagram SPA vs Next.js first load
sequenceDiagram
  participant B as Browser
  participant S as Server or CDN
  B->>S: "GET /products/42 (SPA)"
  S-->>B: "empty index.html + script tag"
  B->>S: "download JS bundle, then GET /api/products/42"
  Note over B: "content appears after JS + data"
  B->>S: "GET /products/42 (Next.js)"
  S-->>B: "HTML with the product, streamed"
  Note over B: "content visible at once, then hydrate client parts"
:::

::: image What Next.js adds to React
/images/nextjs/what-is-next.svg
:::

::: text 🪜 Step by step
Creating and running a Next.js 16 app:
1. `npx create-next-app@latest my-app` (TypeScript, App Router, Turbopack by default).
2. `app/layout.tsx` is the root layout (`<html>`, `<body>`), `app/page.tsx` is `/`.
3. `npm run dev` starts the dev server with Turbopack.
4. `npm run build` prerenders what it can and prints a route table: `○` static, `◐` partial prerender, `ƒ` dynamic.
5. `npm run start` runs the production server (or deploy to Vercel, Docker, a Node host).
:::

::: code tsx app/layout.tsx and app/page.tsx: the smallest Next.js app
// app/layout.tsx: wraps every page; must render <html> and <body>
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My Shop', description: 'Fast product pages' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>My Shop</header>
        {children}
      </body>
    </html>
  );
}

// app/page.tsx: a Server Component; it can be async and fetch data on the server
export async function HomePage() {
  const res = await fetch('https://dummyjson.com/products?limit=3');
  const { products } = (await res.json()) as { products: { id: number; title: string }[] };
  return (
    <main>
      <h1>Featured</h1>
      <ul>{products.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
    </main>
  );
}
:::

::: warning ⚠️ Common mistakes
- Treating Next.js like a SPA (fetching everything in `useEffect` with `'use client'` at the top of every file).
- Not knowing what runs where (server vs browser), and leaking secrets to client code.
- Choosing Next.js for a pure internal dashboard where its server adds no value.
- Following old Pages Router or Next 13–15 tutorials for a Next 16 app (`middleware.ts` is now `proxy.ts`, `params` is a Promise, caching uses `use cache`).
:::

::: understand
- Next.js = React + routing + server rendering + data/caching + backend endpoints, with conventions.
:::

::: ask
- *"Does this app need SEO or a fast first load for anonymous users?"* That's the strongest reason to pick Next.js.
:::

::: important ⭐ Say this in the interview
"Next.js is a full-stack React framework. On top of React it gives file-based routing with nested layouts, rendering on the server or at build time, Server Components that fetch data on the server and ship no JavaScript, caching, Server Actions for mutations, Route Handlers for API endpoints, and image and font optimisation. Compared to a Vite SPA, the browser receives HTML with real content instead of an empty page, which helps SEO and LCP and reduces client JavaScript. The trade-off is running a server and learning the server/client model, so for an internal tool without SEO needs a SPA can be simpler."
:::

::: links
Next.js docs | https://nextjs.org/docs
Next.js 16 release notes | https://nextjs.org/blog/next-16
React: Creating a React app (frameworks) | https://react.dev/learn/creating-a-react-app
:::

=== How does the App Router work? (pages, layouts, dynamic routes, special files)
@p 3
@tags nextjs, app-router, routing, layouts
@quick
- **Folders are routes**: `app/blog/page.tsx` → `/blog`. A folder without `page.tsx` isn't a page.
- `layout.tsx` wraps its segment and children and **persists across navigations** (state kept); the root layout renders `<html>` and `<body>`.
- Dynamic segments `[slug]`, catch-all `[...slug]`; in Next 15+ **`params` and `searchParams` are Promises**: `const { slug } = await params` (or the global `PageProps<'/blog/[slug]'>` helper).
- Special files: `loading.tsx` (Suspense fallback), `error.tsx` (error boundary, client), `not-found.tsx`, `route.ts` (API), `template.tsx`.
- Route groups `(marketing)` organise without affecting the URL; `@slot` parallel routes; `(.)` intercepting routes for modals.

::: text 🧒 In simple words
The `app` folder is a **map of your website**: every folder is a street, `page.tsx` is the house you can visit, and `layout.tsx` is the **street's shared roof and signs** that stay up while you walk from house to house on that street.
:::

::: text 📖 Detailed answer
### File conventions
| File | Purpose |
|---|---|
| `page.tsx` | the UI of a route; makes the folder publicly accessible |
| `layout.tsx` | shared UI for a segment and its children; doesn't re-render on navigation |
| `loading.tsx` | instant loading UI (wraps the page in `<Suspense>`) |
| `error.tsx` | error boundary for the segment (must be a Client Component) |
| `not-found.tsx` | UI for `notFound()` and unknown URLs |
| `route.ts` | Route Handler (GET/POST…) instead of a page |
| `template.tsx` | like a layout but re-mounts on every navigation |
| `default.tsx` | fallback for parallel routes |

### Segment types
| Folder | URL | Example |
|---|---|---|
| `blog` | `/blog` | static segment |
| `[slug]` | `/blog/hello` | dynamic segment, `params.slug = 'hello'` |
| `[...slug]` | `/docs/a/b` | catch-all, `slug = ['a', 'b']` |
| `[[...slug]]` | `/docs` too | optional catch-all |
| `(shop)` | not in URL | route group (different layouts per group) |
| `@modal` | not in URL | parallel route slot |
| `_components` | not routable | private folder for colocated files |

### How nesting renders
`app/layout` → `app/blog/layout` → `<Suspense fallback={loading}>` → `<ErrorBoundary fallback={error}>` → `page`. So a slow blog post shows the blog's loading UI inside the persistent blog layout, and an error only replaces the post, not the whole app.

### Static params
`export async function generateStaticParams()` returns the slugs to prerender at build time (`○ /posts/hello`); other slugs render on demand.
:::

::: diagram How a route's files nest
flowchart TD
  RL["app/layout.tsx (html, body)"] --> BL["app/blog/layout.tsx"]
  BL --> L["loading.tsx as Suspense fallback"]
  L --> E["error.tsx as error boundary"]
  E --> P["app/blog/[slug]/page.tsx"]
:::

::: image App Router: folders are routes
/images/nextjs/app-router.svg
:::

::: text 🪜 Step by step
Visiting `/blog/hello` for the first time:
1. Next.js matches `app/blog/[slug]/page.tsx` with `params = Promise<{ slug: 'hello' }>`.
2. It renders `app/layout.tsx`, then `app/blog/layout.tsx`.
3. Inside, the page is wrapped in `<Suspense fallback={<Loading />}>` from `loading.tsx` and an error boundary from `error.tsx`.
4. The page awaits `params`, fetches the post, and if it doesn't exist calls `notFound()` → `not-found.tsx`.
5. Navigating to `/blog/world` keeps both layouts mounted and swaps only the page.
:::

::: code tsx app/blog/[slug]/page.tsx with generateStaticParams, loading and error
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';

type Post = { slug: string; title: string; body: string };
const posts: Post[] = [
  { slug: 'hello', title: 'Hello Next.js', body: 'First post' },
  { slug: 'world', title: 'App Router', body: 'Second post' },
];
async function getPost(slug: string) { return posts.find((p) => p.slug === slug) ?? null; }

// prerender these at build time (○ in the build output)
export async function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;                 // params is a Promise since Next.js 15
  const post = await getPost(slug);
  if (!post) notFound();                         // renders not-found.tsx
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}

// app/blog/loading.tsx
export function Loading() { return <p>Loading post…</p>; }

// app/blog/error.tsx (error boundaries must be Client Components)
// 'use client';
export function BlogError({ error, reset }: { error: Error; reset: () => void }) {
  return <div role="alert"><p>Something went wrong: {error.message}</p><button onClick={reset}>Try again</button></div>;
}
:::

::: warning ⚠️ Common mistakes
- Reading `params.slug` synchronously (Next 15+ passes a Promise; await it).
- Putting state you want to reset into a layout (layouts persist; use `template.tsx` or keys).
- Forgetting `'use client'` in `error.tsx`.
- Mixing up route groups `(group)` (no URL segment) with dynamic segments `[id]`.
- Expecting `page.tsx` siblings like `utils.ts` to become routes (only `page`/`route` are public).
:::

::: understand
- The folder tree is the URL tree; special files add loading, error and layout behaviour per segment.
:::

::: ask
- *"Which URLs are known at build time?"* They go in `generateStaticParams`; the rest render on demand.
:::

::: important ⭐ Say this in the interview
"In the App Router, folders define routes and a page file makes a folder publicly accessible. Layouts wrap a segment and its children and persist across navigations, so their state survives; the root layout renders html and body. Dynamic segments use brackets, and since Next 15 params and searchParams are promises, so I await them. Special files add behaviour per segment: loading becomes a Suspense fallback, error becomes an error boundary, not-found handles notFound(), and route.ts creates an API endpoint. Route groups in parentheses organise code and layouts without changing the URL, and generateStaticParams prerenders known slugs."
:::

::: links
Next.js: Layouts and pages | https://nextjs.org/docs/app/getting-started/layouts-and-pages
Next.js: Dynamic routes | https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes
Next.js: Project structure | https://nextjs.org/docs/app/getting-started/project-structure
:::

=== Server Components vs Client Components: what's the difference?
@p 3
@tags nextjs, react-server-components, use-client
@quick
- In the App Router every component is a **Server Component** by default: it runs only on the server, can be `async`, can read databases and secrets, and its code is **never sent to the browser**.
- `'use client'` at the top of a file makes it (and everything it imports) a **Client Component**: prerendered to HTML, then **hydrated**; needed for state, effects, event handlers and browser APIs.
- Measured (Next 16 production): rendering Markdown with `marked` in a Server Component added **0 KB** of JS; in a Client Component **+11.7 KB gzip** (+37 KB uncompressed).
- Put the `'use client'` boundary **as low as possible** (a button, not the whole page). Server Components can render Client Components and pass them **serialisable props** or other server-rendered children.
- Use `import 'server-only'` to make sure secret code can never be imported by a Client Component.

::: text 🧒 In simple words
A Server Component is a **chef in the kitchen**: they cook (fetch data, use secret recipes) and send out the finished plate. A Client Component is a **waiter at your table**: they react to you (clicks, typing). You want the kitchen to do as much as possible and keep only a few waiters, because each waiter costs you JavaScript in the browser.
:::

::: text 📖 Detailed answer
| | Server Component (default) | Client Component (`'use client'`) |
|---|---|---|
| Runs | on the server (at build or per request) | prerendered on the server, then in the browser |
| `async`/`await` data | ✅ directly (DB, fetch, files) | via `use(promise)`, SWR, React Query |
| Secrets, env vars, DB clients | ✅ | ❌ (only `NEXT_PUBLIC_*` vars) |
| `useState`, `useEffect`, `onClick` | ❌ | ✅ |
| Browser APIs (`window`, `localStorage`) | ❌ | ✅ (in effects/handlers) |
| JavaScript shipped | **none** for its own code and imports | its code + imports |

### Composition rules
- Server → Client: a Server Component can render a Client Component and pass **serialisable props** (strings, numbers, plain objects, Dates, Promises), not functions (except Server Actions).
- Client → Server: a Client Component can't import a Server Component, but can receive one as `children` or another prop ("interleaving"): `<ClientTabs><ServerContent /></ClientTabs>`.
- Context providers are Client Components; wrap them as deep as possible (e.g. around `{children}` in the layout).

### Measured (Next 16.3 production build, `next start`, Chrome)
| Page | JS transferred (gzip) |
|---|---|
| plain server page (baseline: React + Next runtime) | 132.3 KB |
| Markdown rendered with `marked` in a **Server** Component | 132.3 KB (+0) |
| the same in a **Client** Component | 144.0 KB (+11.7 KB) |

### Typical boundary
`page.tsx` (server: fetches the product) → `<ProductDetails>` (server: static markup) → `<AddToCartButton>` (`'use client'`: state + click).
:::

::: diagram Where code runs
flowchart LR
  P["page.tsx (Server): fetch product"] --> D["Details (Server): HTML only"]
  P --> B["AddToCart ('use client')"]
  B --> H["hydrated in the browser: onClick, useState"]
  D -.->|"no JS shipped"| X["browser receives HTML"]
:::

::: image Server Components vs Client Components (measured JS)
/images/nextjs/server-client.svg
:::

::: chart bar Measured: JavaScript shipped for a page rendering Markdown with marked (Next.js 16, KB gzip)
Where marked runs,JS transferred (KB)
Server Component,132.3
Client Component,144
:::

::: text 🪜 Step by step
Rendering a product page with an "Add to cart" button:
1. The server runs `ProductPage` (Server Component): awaits the DB, renders the title, description and price as HTML.
2. It reaches `<AddToCart productId={42} />`, marked `'use client'`: rendered to HTML too, plus a reference to its JS chunk and its props (`{ productId: 42 }`).
3. The browser shows the full page immediately.
4. React downloads only the `AddToCart` chunk and **hydrates** it (attaches `onClick`, restores state).
5. The DB client, Markdown library and product formatting code never reach the browser.
:::

::: code tsx A Server Component page with a small Client Component leaf
// app/products/[id]/page.tsx: Server Component (default)
import 'server-only';                       // build error if a client file ever imports this module
import { AddToCart } from './AddToCart';

type Product = { id: number; title: string; price: number; description: string };
async function getProduct(id: string): Promise<Product> {
  const res = await fetch(`https://dummyjson.com/products/${id}`);   // runs on the server
  return res.json();
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  return (
    <main>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      <AddToCart productId={product.id} price={product.price} />   {/* serialisable props only */}
    </main>
  );
}

// app/products/[id]/AddToCart.tsx: Client Component
// 'use client';
import { useState } from 'react';
export function AddToCart({ productId, price }: { productId: number; price: number }) {
  const [qty, setQty] = useState(1);
  return (
    <div>
      <button onClick={() => setQty((q) => q + 1)}>Qty: {qty}</button>
      <button onClick={() => console.log('add', productId, qty)}>Add for ${(price * qty).toFixed(2)}</button>
    </div>
  );
}
:::

::: warning ⚠️ Common mistakes
- `'use client'` at the top of `page.tsx` or the root layout (everything below becomes client JS).
- Passing functions or class instances as props from Server to Client Components (not serialisable).
- Importing a DB client or secrets into a file that a Client Component imports.
- Using `useState`/`useEffect` in a Server Component, or `async` Client Components.
- Thinking Client Components only render in the browser (they're prerendered to HTML too).
:::

::: understand
- Default to Server Components; add small `'use client'` islands for interactivity.
:::

::: ask
- *"Does this component need state, effects, events or browser APIs?"* If not, keep it on the server.
:::

::: important ⭐ Say this in the interview
"In the App Router components are Server Components by default: they run only on the server, can be async and read data or secrets directly, and their code never ships to the browser. Adding 'use client' makes a component and its imports Client Components, which are prerendered to HTML and then hydrated so they can use state, effects and event handlers. I keep that boundary as low as possible. In a measurement, rendering Markdown with marked in a Server Component added zero JavaScript while doing it in a Client Component added about 12 KB gzipped. Server Components pass serialisable props down, and can be passed into Client Components as children."
:::

::: links
Next.js: Server and Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components
React: Server Components | https://react.dev/reference/rsc/server-components
React: 'use client' | https://react.dev/reference/rsc/use-client
:::

=== What are the rendering strategies in Next.js? (SSG, SSR, ISR, CSR, Partial Prerendering)
@p 3
@tags nextjs, rendering, ssr, ssg, isr, ppr
@quick
- **Static (SSG)**: HTML generated at **build time**, served from a CDN (`○` in the build output). Fastest.
- **Cached / ISR**: a static or cached result that's **refreshed** after a time (`cacheLife`) or on demand (`revalidateTag`/`updateTag`).
- **Dynamic (SSR)**: rendered **per request** because it reads cookies/headers/search params (`ƒ`).
- **Partial Prerendering** (Next 16 with Cache Components, `◐`): a **static shell** is served instantly and the dynamic parts **stream** in `<Suspense>`.
- Measured (`next start`, local): static TTFB **3.6 ms**; cached page whose data takes 400 ms: **1.5 ms**; streamed page: shell **5.1 ms**, data finished at **416 ms**.

::: text 🧒 In simple words
A restaurant can **pre-pack meals in the morning** (static), **re-pack them every hour** (cached/ISR), **cook each order fresh** (dynamic), or **serve the bread and salad immediately while the main course cooks** (partial prerendering with streaming). Good restaurants mix all four on the same menu.
:::

::: text 📖 Detailed answer
| Strategy | When HTML is made | Data freshness | Build symbol | Use for |
|---|---|---|---|---|
| Static (SSG) | build | as of build | `○` | marketing, docs, blog |
| Cached (`use cache`, ISR) | build or first request, then reused | refreshed by `cacheLife` or tags | `○` with revalidate/expire | catalogues, CMS pages |
| Partial Prerender | static shell at build + dynamic parts per request | per part | `◐` | product pages with personal bits, dashboards |
| Dynamic (SSR) | every request | always fresh | `ƒ` | per-user pages, search results |
| Client (CSR) | in the browser | client fetches | (client component) | highly interactive widgets |

### How Next.js 16 decides (Cache Components)
With `cacheComponents: true`, Next.js prerenders everything it can at build time:
- Synchronous code and `'use cache'` results become part of the **static shell**.
- Anything that reads **runtime data** (`cookies()`, `headers()`, `searchParams`, `connection()`) or **uncached** async work must sit inside `<Suspense>`; it streams at request time.
- Without a Suspense boundary around such work, the dev overlay reports a "blocking route" so you fix it.

### Measured on a Next.js 16.3 production server (local, median of 7)
| Route | Build symbol | First byte | Complete |
|---|---|---|---|
| `/static-page` | `○` | 3.6 ms | 3.7 ms |
| `/cached` (data takes 400 ms, `'use cache'`) | `○` (1 h / 1 d) | 1.5 ms | 1.5 ms |
| `/streamed` (400 ms data in `<Suspense>`) | `◐` | 5.1 ms (shell + skeleton) | 415.7 ms |
| `/api/time` (route handler) | `ƒ` | 1.7 ms | 1.7 ms |
| `/posts/hello` (`generateStaticParams`) | `○` | 0.9 ms | 0.9 ms |
:::

::: diagram Which strategy does a component get?
flowchart TD
  C["component"] --> R{"reads cookies, headers, searchParams or uncached data?"}
  R -->|"no"| S["static shell (prerendered)"]
  R -->|"yes"| U{"inside use cache?"}
  U -->|"yes (no runtime APIs)"| S
  U -->|"no"| SU{"inside Suspense?"}
  SU -->|"yes"| ST["streamed at request time (partial prerender)"]
  SU -->|"no"| B["blocking route: fix by adding Suspense or use cache"]
:::

::: image Rendering strategies in Next.js (measured TTFB)
/images/nextjs/rendering.svg
:::

::: chart bar Measured: time to first byte vs complete response (Next.js 16.3, next start, ms)
Route,First byte (ms),Complete (ms)
static page,3.6,3.7
use cache (400 ms data),1.5,1.5
streamed (400 ms data),5.1,415.7
route handler,1.7,1.7
:::

::: text 🪜 Step by step
A product page with a personalised "Recommended for you" section:
1. Product details come from `getProduct()` marked `'use cache'` + `cacheTag('product-42')` → part of the static shell.
2. Recommendations read `cookies()` → wrapped in `<Suspense fallback={<RecsSkeleton />}>`.
3. At build, Next.js prerenders the shell with the details and the skeleton (`◐`).
4. On a request, the shell is sent immediately from the cache/CDN; the server renders the recommendations and **streams** them into the same response.
5. When the product changes, a Server Action calls `updateTag('product-42')` and the next request gets a fresh shell.
:::

::: code tsx app/products/[id]/page.tsx: static shell + streamed personal part
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

async function getProduct(id: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(`product-${id}`);
  const res = await fetch(`https://dummyjson.com/products/${id}`);
  return (await res.json()) as { id: number; title: string; price: number };
}

async function Recommendations() {
  const viewed = (await cookies()).get('recently-viewed')?.value ?? '';   // runtime data → streamed
  return <p>Because you viewed: {viewed || 'nothing yet'}</p>;
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);                                   // cached → static shell
  return (
    <main>
      <h1>{product.title}</h1>
      <p>${product.price}</p>
      <Suspense fallback={<p>Loading recommendations…</p>}>
        <Recommendations />
      </Suspense>
    </main>
  );
}

export async function generateStaticParams() { return [{ id: '1' }, { id: '2' }]; }
:::

::: warning ⚠️ Common mistakes
- Making whole pages dynamic because one small part reads cookies (wrap that part in `<Suspense>` instead).
- Fetching uncached data outside `<Suspense>` (blocking route warnings, slow TTFB).
- Thinking SSR is always better than static (static/cached is faster and cheaper).
- Caching personalised data in a shared cache (use `'use cache: private'` or don't cache it).
- Following Next 13/14 caching rules (fetch cached by default) in Next 15/16, where defaults changed.
:::

::: understand
- Static first, cache what you can, stream what must be fresh; the build output's ○ / ◐ / ƒ tells you what you got.
:::

::: ask
- *"How fresh must this data be, and is it per user?"* That decides static, cached, streamed or dynamic.
:::

::: important ⭐ Say this in the interview
"Next.js supports static generation at build time, cached rendering that is revalidated by time or on demand, dynamic rendering per request, and client-side rendering for interactive parts, and in Next 16 with Cache Components it combines them per component through partial prerendering: everything synchronous or marked use cache becomes a static shell served instantly, and anything that reads cookies, headers or uncached data streams in inside a Suspense boundary. In my measurement a static page answered in about 4 milliseconds, a cached page whose data takes 400 milliseconds in 1.5, and a streamed page sent its shell in 5 milliseconds with the data arriving at 416. The build output marks routes as static, partial or dynamic."
:::

::: links
Next.js: Caching (Cache Components) | https://nextjs.org/docs/app/getting-started/caching
Next.js: cacheComponents | https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
Next.js: Partial prerendering glossary | https://nextjs.org/docs/app/glossary
:::

=== How does navigation work in Next.js? (Link, prefetching, useRouter, redirects)
@p 2
@tags nextjs, navigation, link, prefetch, router
@quick
- `<Link href="/blog">` does **client-side navigation** (no full reload) and **prefetches** routes when the link enters the viewport (production).
- Layouts **persist** between navigations; only the changed segment renders. `loading.tsx` shows instantly.
- Client hooks from `next/navigation`: `useRouter()` (`push`, `replace`, `back`, `refresh`), `usePathname()`, `useSearchParams()`, `useParams()`.
- Server-side: `redirect('/login')`, `permanentRedirect()`, `notFound()`; static rules in `next.config` `redirects`.
- Use `<a>` only for external links; don't use `router.push` where a `<Link>` works (you lose prefetching and accessibility).

::: text 🧒 In simple words
`<Link>` is a **smart door**: as soon as it's visible, Next.js quietly **peeks into the next room** (prefetch), so when you walk through, the room is already lit. The hallway (layout) stays the same; only the room changes.
:::

::: text 📖 Detailed answer
### Link and prefetching
| Behaviour | Details |
|---|---|
| Client-side transition | URL changes with the History API; React swaps the segment |
| Prefetch | in production, links in the viewport prefetch the route's static parts (and the loading UI for dynamic parts) |
| `prefetch={false}` | turn off for rarely used links (many links in a big table) |
| Scroll | scrolls to top by default; `scroll={false}` to keep position |
| `replace` | replace the history entry instead of pushing |

### Programmatic navigation
`const router = useRouter()` in a Client Component: `router.push('/orders/42')`, `router.replace('/login')`, `router.refresh()` (re-run Server Components for the current route, keep client state).

### Reading the URL
- Server Components: `params` and `searchParams` props (Promises).
- Client Components: `usePathname()`, `useSearchParams()` (wrap in `<Suspense>` for prerendering), `useParams()`.

### Redirects
- In Server Components, Server Actions, Route Handlers: `redirect()` (307) / `permanentRedirect()` (308) and `notFound()`.
- In `proxy.ts`: `NextResponse.redirect()` before rendering (e.g. locale or auth checks).
- Static mappings: `redirects()` in `next.config.ts`.
:::

::: diagram Clicking a Link
sequenceDiagram
  participant U as User
  participant B as Browser (Next router)
  participant S as Server
  Note over B: "link enters the viewport"
  B->>S: "prefetch /blog (static parts)"
  U->>B: "click Link"
  B->>B: "show prefetched UI, keep shared layouts"
  B->>S: "fetch dynamic parts if needed"
  S-->>B: "streamed RSC payload"
  B->>B: "update URL, render the new segment"
:::

::: image Linking and navigating
/images/nextjs/navigation.svg
:::

::: text 🪜 Step by step
A search box that updates the URL without losing the layout:
1. Client Component reads `useSearchParams()` and `usePathname()`.
2. On input (debounced), build `?q=shoes` with `URLSearchParams`.
3. `router.replace(pathname + "?q=shoes")` updates the URL without a new history entry.
4. The page (Server Component) receives `searchParams` and renders results; the layout and the input keep their state.
5. Sharing the URL reproduces the same results (state lives in the URL).
:::

::: code tsx Link, useRouter, search params and server redirects
// app/components/SearchBox.tsx
// 'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function onChange(q: string) {
    const next = new URLSearchParams(params.toString());
    if (q) next.set('q', q); else next.delete('q');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  return (
    <nav>
      <Link href="/">Home</Link> <Link href="/blog" prefetch={false}>Blog</Link>
      <input defaultValue={params.get('q') ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Search" />
    </nav>
  );
}

// app/account/page.tsx: Server Component redirect
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
export default async function AccountPage() {
  const session = (await cookies()).get('session')?.value;
  if (!session) redirect('/login?next=/account');
  return <h1>Your account</h1>;
}
:::

::: warning ⚠️ Common mistakes
- Importing `useRouter` from `next/router` (Pages Router) in the App Router (use `next/navigation`).
- `<a href>` for internal links (full reload, no prefetch).
- `router.push` in an `onClick` where a `<Link>` would be accessible and prefetched.
- `useSearchParams()` without a `<Suspense>` boundary in prerendered pages.
- Calling `redirect()` inside `try/catch` (it works by throwing; rethrow or call it outside).
:::

::: understand
- Links prefetch and swap segments; layouts persist; redirects happen on the server or in proxy.
:::

::: ask
- *"Should this state live in the URL?"* Filters, tabs and search usually should (shareable, back button works).
:::

::: important ⭐ Say this in the interview
"Link performs client-side navigation and, in production, prefetches routes when they enter the viewport, so clicks feel instant. Shared layouts stay mounted, only the changed segment renders, and loading.tsx shows immediately while the rest streams. In Client Components I use the hooks from next/navigation, useRouter for push, replace and refresh, plus usePathname and useSearchParams, and I keep filters in the URL. On the server I use redirect, permanentRedirect and notFound, or proxy and next.config redirects for rules that apply before rendering."
:::

::: links
Next.js: Linking and navigating | https://nextjs.org/docs/app/getting-started/linking-and-navigating
Next.js: useRouter | https://nextjs.org/docs/app/api-reference/functions/use-router
Next.js: redirect | https://nextjs.org/docs/app/api-reference/functions/redirect
:::
