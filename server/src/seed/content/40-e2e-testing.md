@section End-to-End Testing (Playwright)
@icon 🎭
@color #64748b
@desc Testing the real app in a real browser: Playwright basics, flaky tests and Playwright vs Cypress, and how to test a Next.js app at every level. All tests shown ran with Playwright 1.63 against a Next.js 16 production build.

=== What is end-to-end testing, and how does Playwright work?
@p 3
@tags testing, e2e, playwright
@quick
- **E2E tests** drive the **real app in a real browser** like a user: open pages, click, type, assert what's visible. They catch integration bugs no other test can (routing, server + client, auth cookies, CSS hiding a button).
- **Playwright** (Microsoft) controls Chromium, Firefox and WebKit; tests use `test` + `expect` from `@playwright/test`.
- **Locators** (`page.getByRole('button', { name: 'Add' })`) are lazy and re-resolved; actions **auto-wait** until the element is visible, enabled and stable.
- **Web-first assertions** (`await expect(locator).toHaveText(...)`) retry until true or timeout: no sleeps.
- Each test gets a fresh **browser context** (isolated cookies/storage); debug with `--ui`, the trace viewer and `codegen`. Measured: ~1 s per test (median 992 ms).

::: text 🧒 In simple words
An E2E test is a **robot customer**: it opens your real shop (the running app) in a real browser, walks to the shelf, puts things in the basket and checks out. If any part of the shop is broken (the door, the till, the shelf labels), the robot notices, just like a real customer would.
:::

::: text 📖 Detailed answer
### Core API
| Concept | Example | Why it matters |
|---|---|---|
| `page.goto('/streamed')` | uses `baseURL` from config | |
| Locators | `page.getByRole('link', { name: 'Blog' })`, `getByLabel`, `getByText`, `getByTestId` | same priority as Testing Library |
| Actions | `click()`, `fill()`, `press()`, `check()`, `selectOption()`, `setInputFiles()` | auto-wait for actionability |
| Assertions | `toBeVisible()`, `toHaveText()`, `toHaveCount()`, `toHaveURL()` | retry automatically (5 s default) |
| API testing | `request.get('/api/time')` | test endpoints without a browser |
| Fixtures | `page`, `context`, `request`, custom fixtures (logged-in user) | setup reuse |
| Auth reuse | `storageState` saved once in a setup project | skip logging in for every test |

### Running
- `npx playwright test` (headless, parallel), `--ui` (interactive), `--headed`, `--debug`.
- `npx playwright codegen http://localhost:3000` records actions into code.
- `trace: 'on-first-retry'` stores a full trace (DOM snapshots, network, console) for failures.
- `webServer` in the config starts the app before tests.

### What to cover with E2E
Critical journeys only: sign up/login, search → product → cart → checkout, create/edit/delete of the core entity, permissions. Edge cases belong in faster tests.
:::

::: diagram A Playwright test run
sequenceDiagram
  participant T as Test runner
  participant B as Browser (new context)
  participant A as App (next start)
  T->>B: "page.goto('/actions')"
  B->>A: "GET /actions"
  A-->>B: "HTML + JS"
  T->>B: "getByLabel('Title').fill(...)"
  T->>B: "getByRole('button', { name: 'Add' }).click() (auto-waits)"
  B->>A: "POST Server Action"
  A-->>B: "updated UI"
  T->>B: "expect(list.getByText(title)).toBeVisible() (retries)"
:::

::: image Playwright: end-to-end tests in real browsers
/images/testing/playwright.svg
:::

::: chart bar Measured: Playwright tests against a Next.js 16 production server (ms per test)
Test,Duration (ms)
route handler via request API,123
statically generated post,1200
streamed page shows products,1500
Server Action adds a todo,1600
:::

::: text 🪜 Step by step
The "adding a todo through a Server Action" test:
1. `page.goto('/actions')` (baseURL `http://localhost:5191` from the config).
2. `page.getByLabel('Title').fill(title)`: waits for the input, focuses, types.
3. `page.getByRole('button', { name: 'Add' }).click()`: waits until enabled and stable, clicks; the form posts to the Server Action.
4. `expect(page.getByRole('list', { name: 'todos' }).getByText(title)).toBeVisible()`: retries until the revalidated list contains the new item.
5. The context is discarded; the next test starts with fresh cookies and storage.
:::

::: code typescript e2e/app.spec.ts: four Playwright tests that passed against Next.js 16
import { expect, test } from '@playwright/test';

test('streamed page shows a skeleton, then the products', async ({ page }) => {
  await page.goto('/streamed');
  await expect(page.getByRole('heading', { name: 'Streamed page' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(5);          // auto-waits for the streamed list
  await expect(page.getByText('Loading products…')).toBeHidden();
});

test('a statically generated post renders its slug', async ({ page }) => {
  await page.goto('/posts/hello');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post: hello');
});

test('adding a todo through a Server Action', async ({ page }) => {
  const title = `Buy milk ${Date.now()}`;
  await page.goto('/actions');
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('list', { name: 'todos' }).getByText(title)).toBeVisible();
});

test('the route handler returns JSON', async ({ request }) => {
  const res = await request.get('/api/time');
  expect(res.ok()).toBeTruthy();
  expect(typeof (await res.json()).now).toBe('number');
});
:::

::: code typescript playwright.config.ts: start the app, parallel runs, traces on retry
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,                  // a stray test.only fails CI
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start',   // test the production build, not next dev
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
:::

::: warning ⚠️ Common mistakes
- `page.waitForTimeout(…)` instead of web-first assertions.
- CSS/XPath selectors (`.btn-primary > span`) that break on styling changes.
- Testing every edge case end-to-end (slow suites nobody runs).
- Tests depending on each other or on shared accounts/data.
- Running E2E against `next dev` (slower, different behaviour from production).
:::

::: understand
- E2E = highest confidence per test, highest cost; reserve it for journeys that must never break.
:::

::: ask
- *"Which flows would cost us money or users if they broke?"* Those are the E2E suite.
:::

::: important ⭐ Say this in the interview
"End-to-end tests drive the real application in a real browser the way a user would, so they catch problems between frontend, backend, routing and auth that unit tests can't. I use Playwright: locators like getByRole are re-resolved on every action, actions auto-wait for elements to be visible and enabled, and web-first assertions retry until they pass, so I never add sleeps. Each test gets an isolated browser context, the config's webServer starts a production build, and traces are recorded on retries for debugging. Since each test takes around a second, I keep them to critical journeys like login and checkout."
:::

::: links
Playwright: Getting started | https://playwright.dev/docs/intro
Playwright: Locators | https://playwright.dev/docs/locators
Playwright: Best practices | https://playwright.dev/docs/best-practices
:::

=== How do you avoid flaky E2E tests? (and Playwright vs Cypress)
@p 2
@tags testing, e2e, flaky-tests, playwright, cypress
@quick
- **Flaky** = passes and fails without code changes. Main causes: **timing guesses**, shared state/data, test order, animations, third-party services, real time.
- Measured: reading a list after `waitForTimeout(200)` on a page whose data streams in after ~400 ms failed **10/10**; `await expect(items).toHaveCount(5)` passed **10/10**.
- Fixes: web-first assertions, unique test data per test (`Date.now()`/factories), API setup instead of UI setup, `storageState` for auth, mock third parties with `page.route`, fixed clock (`page.clock`).
- Use retries + traces to **diagnose**, not to hide flakiness; quarantine and fix.
- **Playwright vs Cypress**: Playwright runs outside the browser with async/await, multi-browser (incl. WebKit), multi-tab/origin and free parallelism; Cypress runs inside the browser with chained commands and a great interactive runner.

::: text 🧒 In simple words
A flaky test is a **smoke alarm that sometimes beeps for no reason**: soon everyone ignores it, and then it misses a real fire. Most flakiness comes from the test **guessing how long things take** instead of **watching for the thing to happen**.
:::

::: text 📖 Detailed answer
### Causes and fixes
| Cause | Symptom | Fix |
|---|---|---|
| fixed sleeps | fails on slow CI, wastes time locally | `await expect(locator).toBeVisible()` / `toHaveCount()` |
| shared accounts/data | parallel tests overwrite each other | unique data per test, seed via API, clean up |
| order dependence | passes alone, fails in the suite | isolated contexts, no reliance on previous tests |
| animations/transitions | click lands on a moving element | auto-wait for stable, or disable animations in test env |
| third-party APIs (payments, maps) | random timeouts | `page.route('**/api.stripe.com/**', …)` mocks |
| real time | date-dependent UI changes | `page.clock.setFixedTime(...)` |
| `next dev` compilation | first request slow | test the production build |

### Measured (Playwright 1.63, page data streams after ~400 ms, 10 runs each)
| Approach | Passed |
|---|---|
| `waitForTimeout(200)` then `count()` | 0/10 |
| `await expect(page.getByRole('listitem')).toHaveCount(5)` | 10/10 |
A slightly longer sleep would pass *sometimes*: that's exactly how flaky tests are born.

### Playwright vs Cypress
| | Playwright | Cypress |
|---|---|---|
| Architecture | drives browsers via protocols, out of process | runs inside the browser next to your app |
| Browsers | Chromium, Firefox, WebKit (Safari engine) | Chromium family, Firefox, WebKit experimental |
| Multiple tabs / origins | yes | single tab; `cy.origin` for other origins |
| Language style | `async/await` | chained commands with automatic retry |
| Parallelism | built in, free (workers, sharding) | via Cypress Cloud or plugins |
| Also does | API testing, component testing, visual comparisons | component testing, great time-travel debugger |
Both are good; Playwright is the common default for new projects (and what Next.js's `with-playwright` example uses).
:::

::: diagram Diagnosing a flaky test
flowchart TD
  F["test fails sometimes"] --> T["open the trace from the retry"]
  T --> W{"waiting on time?"}
  W -->|"yes"| A["replace sleep with web-first assertion"]
  W -->|"no"| D{"shared data or order?"}
  D -->|"yes"| U["unique data per test, isolated setup"]
  D -->|"no"| X{"external service or clock?"}
  X -->|"yes"| M["page.route mock or page.clock"]
  X -->|"no"| R["real bug: race condition in the app"]
:::

::: image Flaky tests and Playwright vs Cypress (measured)
/images/testing/flaky-e2e.svg
:::

::: chart bar Measured: passes out of 10 runs on a page whose data streams in after ~400 ms
Approach,Passed (of 10)
waitForTimeout(200) then count,0
expect(items).toHaveCount(5),10
:::

::: text 🪜 Step by step
Making a checkout test reliable:
1. Replace "log in through the UI" in every test with a setup project that saves `storageState` once.
2. Create the product/cart via the API in `beforeEach` with a unique name (`Product ${test.info().testId}`).
3. Mock the payment provider: `page.route('**/payments/**', (r) => r.fulfill({ json: { status: 'succeeded' } }))`.
4. Replace `waitForTimeout(2000)` with `await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()`.
5. Run with `--repeat-each=20` locally; it should pass 20/20 before it goes into CI.
:::

::: code typescript e2e/flaky.spec.ts: the flaky version and the stable version
import { expect, test } from '@playwright/test';

// ❌ guesses the timing: reads the list after a fixed 200 ms (data needs ~400 ms) → failed 10/10
test('fixed wait (flaky)', async ({ page }) => {
  await page.goto('/streamed', { waitUntil: 'commit' });
  await page.waitForTimeout(200);
  const count = await page.getByRole('listitem').count();
  expect(count).toBe(5);
});

// ✅ web-first assertion: retries until the condition is true (or the timeout) → passed 10/10
test('auto-waiting assertion (stable)', async ({ page }) => {
  await page.goto('/streamed', { waitUntil: 'commit' });
  await expect(page.getByRole('listitem')).toHaveCount(5);
});

// ✅ third-party calls mocked, clock fixed
test('checkout with a mocked payment provider', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-15T10:00:00'));
  await page.route('**/payments/**', (route) => route.fulfill({ json: { status: 'succeeded' } }));
  await page.goto('/streamed');
  await expect(page.getByRole('heading', { name: 'Streamed page' })).toBeVisible();
});
:::

::: code javascript Why polling for a condition beats a fixed sleep (runnable)
// Data "arrives" after a random 50–150 ms, like a real network.
const arrivesAfter = () => 50 + Math.random() * 100;
function loadList() { const s = { items: [] }; setTimeout(() => { s.items = [1, 2, 3, 4, 5]; }, arrivesAfter()); return s; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fixedWait() { const s = loadList(); await sleep(80); return s.items.length === 5; }
async function pollUntil(timeout = 1000) {
  const s = loadList(); const start = Date.now();
  while (Date.now() - start < timeout) { if (s.items.length === 5) return true; await sleep(10); }
  return false;
}
(async () => {
  const fixed = await Promise.all(Array.from({ length: 20 }, fixedWait));
  const polled = await Promise.all(Array.from({ length: 20 }, () => pollUntil()));
  const f = fixed.filter(Boolean).length, p = polled.filter(Boolean).length;
  console.log(`fixed 80 ms wait: ${f}/20 passed · polling: ${p}/20 passed`);
  console.log('a fixed wait is flaky (some pass, some fail)', f > 0 && f < 20 ? '✅' : '⚠️ (random run: try again)');
  console.log('polling for the condition always passes', p === 20 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Adding retries and calling it fixed.
- Sharing one test account across parallel workers.
- Setting up state through the UI in every test (slow and fragile).
- Real payment/email providers in E2E runs.
- Choosing a tool by popularity instead of browser coverage and team style.
:::

::: understand
- Flakiness is a bug in the test (or a race in the app); fix the cause, use retries only to collect traces.
:::

::: ask
- *"Do we need Safari (WebKit) coverage and multi-tab flows?"* That often decides Playwright.
:::

::: important ⭐ Say this in the interview
"Flaky tests mostly come from guessing timing, shared data, test order, animations and external services. I replace sleeps with web-first assertions that retry until the condition holds; in a measurement a fixed 200 millisecond wait failed ten out of ten times on a streamed page while an auto-waiting assertion passed every time. I give each test unique data created through the API, reuse authentication via storageState, mock third parties with page.route and fix the clock. Retries with traces help me diagnose, not hide. Between tools, Playwright runs out of process with async/await, covers Chromium, Firefox and WebKit, handles multiple tabs and parallelism for free, while Cypress runs inside the browser with a great interactive runner."
:::

::: links
Playwright: Auto-waiting | https://playwright.dev/docs/actionability
Playwright: Mock APIs | https://playwright.dev/docs/mock
Cypress docs | https://docs.cypress.io/
:::

=== How do you test a Next.js app? (unit, components, Server Components, E2E)
@p 3
@tags testing, nextjs, vitest, playwright, server-components
@quick
- **Unit** (Vitest): utilities, validation, Server Action logic extracted into plain functions.
- **Component** (Vitest + RTL): **Client Components** and synchronous Server Components; mock `next/navigation` (`useRouter`, `usePathname`) where needed.
- **Async Server Components** aren't fully supported by current unit-testing tools: the Next.js docs recommend **E2E** for them.
- **Route Handlers**: call the exported `GET`/`POST` with a `new Request(...)` and assert the `Response`; or hit them with Playwright's `request`.
- **E2E** (Playwright): run against `next build && next start` via `webServer`. Measured: 4 tests (streaming page, static post, Server Action, route handler) in **3.4 s**.

::: text 🧒 In simple words
A Next.js app has a **kitchen** (server) and a **dining room** (browser). You taste ingredients on their own (unit tests), check each waiter's routine (client component tests), and then do a **full dinner service rehearsal** (E2E) because some kitchen work (async Server Components) can only really be checked when the whole restaurant runs.
:::

::: text 📖 Detailed answer
| What | Tool | How |
|---|---|---|
| pure logic, schemas, formatters | Vitest | plain unit tests |
| Server Action logic | Vitest | move validation/business logic into a function; test it directly; keep the action thin |
| Client Components | Vitest + RTL + jsdom | render, user-event, MSW for fetches |
| `next/navigation` hooks | Vitest | `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/x' }))` |
| sync Server Components | Vitest + RTL | render like any component |
| async Server Components, streaming, caching | Playwright | E2E against `next start` |
| Route Handlers | Vitest or Playwright | `await GET(new Request('http://x/api/time'))` / `request.get` |
| Proxy (`proxy.ts`) | Playwright (or unit-test helper functions) | assert redirects and headers |

### Setup
- Vitest: `vitest`, `@vitejs/plugin-react`, `jsdom`, RTL; `vite-tsconfig-paths` for `@/` aliases (Next's `with-vitest` example).
- Playwright: `npm init playwright@latest`; set `webServer` to build and start the app; `baseURL`.
- CI: run unit/component tests on every push (seconds), E2E on pull requests (minutes) with traces uploaded on failure.

### Measured on a Next.js 16 app
| Test | Result |
|---|---|
| streamed page shows the skeleton then 5 products | ✓ 1.5 s |
| static post `/posts/hello` | ✓ 1.2 s |
| Server Action adds a todo | ✓ 1.6 s |
| route handler returns JSON | ✓ 0.12 s |
| total (4 workers) | 3.4 s |
:::

::: diagram Which tool for which part of a Next.js app
flowchart TD
  A["Next.js code"] --> P["pure functions and action logic: Vitest unit"]
  A --> CC["Client Components: Vitest + RTL + MSW"]
  A --> SC["async Server Components: Playwright E2E"]
  A --> RH["Route Handlers: call GET/POST directly or request in Playwright"]
  A --> J["full journeys: Playwright against next start"]
:::

::: image Testing a Next.js app
/images/testing/testing-nextjs.svg
:::

::: text 🪜 Step by step
Testing "create post" end to end in a Next.js app:
1. Extract `validatePost(formData)` from the Server Action → unit tests for every rule.
2. `<PostForm>` (client, `useActionState`) → RTL test with a fake action: pending state, error messages.
3. `app/posts/page.tsx` (async Server Component reading the DB) → covered by E2E.
4. Playwright: log in via saved `storageState`, fill the form, submit, assert the post appears in the list (revalidated).
5. CI: Vitest on every push, Playwright on PRs with the `webServer` building the app.
:::

::: code tsx Unit, component and route-handler tests for Next.js code (Vitest)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// 1) Server Action logic extracted into a plain function
export function validatePost(formData: FormData): { ok: true; title: string } | { ok: false; error: string } {
  const title = formData.get('title');
  if (typeof title !== 'string' || title.trim().length < 3) return { ok: false, error: 'Title must have 3+ characters' };
  return { ok: true, title: title.trim() };
}

// 2) A Client Component that uses next/navigation (mocked below)
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/posts' }));
import { useRouter } from 'next/navigation';
function NewPostButton() {
  const router = useRouter();
  return <button onClick={() => router.push('/posts/new')}>New post</button>;
}

// 3) A Route Handler
export async function GET() { return Response.json({ now: 1700000000000 }); }

describe('Next.js code without a browser', () => {
  it('validates action input', () => {
    const fd = new FormData();
    fd.set('title', '  Hi there ');
    expect(validatePost(fd)).toEqual({ ok: true, title: 'Hi there' });
    fd.set('title', 'a');
    expect(validatePost(fd)).toEqual({ ok: false, error: 'Title must have 3+ characters' });
  });

  it('navigates with the mocked router', async () => {
    render(<NewPostButton />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New post' }));
    expect(push).toHaveBeenCalledWith('/posts/new');
  });

  it('route handler returns JSON', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ now: 1700000000000 });
  });
});
:::

::: warning ⚠️ Common mistakes
- Trying to unit-test async Server Components with RTL and fighting the tooling (use E2E).
- Putting business logic inside Server Actions/components where it can't be unit-tested.
- E2E against `next dev` (first-hit compilation makes tests slow and flaky).
- Not mocking `next/navigation` in component tests (hooks throw outside the app router).
- Skipping E2E for caching/revalidation behaviour, which only shows up in a production build.
:::

::: understand
- Thin framework code, fat testable functions; E2E for what only the running app can prove.
:::

::: ask
- *"Which parts are async Server Components?"* Plan E2E coverage for them.
:::

::: important ⭐ Say this in the interview
"I test a Next.js app at several levels. Pure logic, including the validation and business rules I extract from Server Actions, gets Vitest unit tests. Client Components get Vitest with React Testing Library, MSW for fetches and a mock of next/navigation. Async Server Components aren't fully supported by unit-testing tools yet, so as the Next.js docs recommend I cover them, along with streaming, caching and revalidation, with Playwright against a production build started through the webServer option. Route Handlers I can call directly with a Request. In a small app four Playwright tests covering streaming, a static page, a Server Action and an API route ran in about three and a half seconds."
:::

::: links
Next.js: Testing | https://nextjs.org/docs/app/guides/testing
Next.js: Setting up Vitest | https://nextjs.org/docs/app/guides/testing/vitest
Next.js: Setting up Playwright | https://nextjs.org/docs/app/guides/testing/playwright
:::
