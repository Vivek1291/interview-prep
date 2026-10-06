@section React Testing Library
@icon 🐙
@color #ec4899
@desc Testing React components the way users use them: React Testing Library with Vitest, the query priority, user-event and async UI, mocking APIs with MSW, and testing hooks and providers. Every test shown here ran with Vitest 5, RTL 16 and MSW 2.

=== What is React Testing Library, and how do you set it up?
@p 3
@tags testing, react, rtl, vitest, jsdom
@quick
- **React Testing Library (RTL)** renders components into a fake DOM (**jsdom**) and lets you find elements **the way a user does** (by role, label, text), then interact and assert what's visible.
- Philosophy: *"The more your tests resemble the way your software is used, the more confidence they can give you."* Don't test state, props or internal methods.
- Stack: **Vitest** (or Jest) as runner, `environment: 'jsdom'`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` matchers (`toBeVisible`, `toHaveTextContent`, `toBeDisabled`).
- Pattern: `render(<C />)` → `screen.getByRole(...)` → `await user.click(...)` → `expect(...)`.
- Measured: a typical component test took **~72 ms** (median) vs **0.32 ms** for a pure unit test; still fast enough to run hundreds on every save.

::: text 🧒 In simple words
RTL is like asking a **friend to use your app** while you watch, except the friend is a robot. The robot doesn't open the engine (component state); it reads the screen, finds the "Log in" button by its name, types in the "Email" field and checks the message that appears.
:::

::: text 📖 Detailed answer
### Why RTL replaced Enzyme-style tests
| Implementation tests (Enzyme) | Behaviour tests (RTL) |
|---|---|
| `wrapper.state('email')` | `screen.getByLabelText('Email')` |
| call `instance().handleSubmit()` | `await user.click(screen.getByRole('button', { name: 'Log in' }))` |
| break when you rename state or switch to hooks | keep passing while behaviour stays the same |
| no accessibility signal | role/label queries fail if the UI isn't accessible |

### Setup with Vitest
1. `npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`
2. `vitest.config.ts`: `test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'] }` (plus the React plugin).
3. `test/setup.ts`: `import '@testing-library/jest-dom/vitest'` and `afterEach(cleanup)`.
4. Write `Component.test.tsx` next to the component; run `npx vitest` (watch mode).

### What jsdom is (and isn't)
A JavaScript implementation of the DOM: no layout, no real rendering, no CSS visibility from stylesheets, no `IntersectionObserver` unless mocked. Layout/visual/browser-specific behaviour belongs in Playwright tests.
:::

::: diagram The flow of an RTL test
flowchart LR
  R["render(LoginForm) into jsdom"] --> Q["screen.getByRole / getByLabelText"]
  Q --> U["await user.type and user.click"]
  U --> A["expect: toHaveTextContent, toBeDisabled, toHaveBeenCalledWith"]
  A --> C["cleanup after each test"]
:::

::: image React Testing Library: test like a user
/images/testing/rtl-philosophy.svg
:::

::: text 🪜 Step by step
Testing "shows an error for a short password" on `<LoginForm onLogin={fn} />`:
1. `render(<LoginForm onLogin={onLogin} />)` with `onLogin = vi.fn()`.
2. `await user.type(screen.getByLabelText(/email/i), 'asha@example.com')`.
3. `await user.type(screen.getByLabelText(/password/i), 'short')`.
4. `await user.click(screen.getByRole('button', { name: /log in/i }))`.
5. `expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')` and `expect(onLogin).not.toHaveBeenCalled()`.
:::

::: code tsx LoginForm.test.tsx: three behaviour tests that pass
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

describe('<LoginForm>', () => {
  it('submits the email and password', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(onLogin).toHaveBeenCalledWith('asha@example.com', 'Secret123');
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error and does not submit a short password', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('disables the button while logging in and shows server errors', async () => {
    const user = userEvent.setup();
    let reject!: (e: Error) => void;
    const onLogin = vi.fn(() => new Promise<void>((_, r) => { reject = r; }));
    render(<LoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
    reject(new Error('401'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(screen.getByRole('button', { name: /log in/i })).toBeEnabled();
  });
});
:::

::: code tsx LoginForm.tsx: the component under test
import { useState } from 'react';
type Props = { onLogin: (email: string, password: string) => Promise<void> };
export function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.includes('@')) return setError('Enter a valid email');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setError(null);
    setSubmitting(true);
    try { await onLogin(email, password); } catch { setError('Wrong email or password'); } finally { setSubmitting(false); }
  }
  return (
    <form onSubmit={handleSubmit} aria-label="Log in">
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}
:::

::: warning ⚠️ Common mistakes
- Testing state/props/instance methods instead of what's on screen.
- Forgetting `@testing-library/jest-dom` (no `toBeInTheDocument`).
- Expecting jsdom to do layout, CSS or real browser APIs.
- One giant test per component instead of one test per behaviour.
:::

::: understand
- RTL tests describe what a user sees and does; that's why they survive refactors.
:::

::: ask
- *"Do we use Vitest or Jest, and is jsdom or happy-dom configured?"*
:::

::: important ⭐ Say this in the interview
"React Testing Library renders components into jsdom and lets me query them the way a user would, by role, label or text, interact with user-event and assert on what's visible with jest-dom matchers. The principle is that tests should resemble how the software is used, so I never reach into component state or call internal methods, and tests keep passing through refactors. I run it with Vitest in a jsdom environment with a setup file for the matchers and cleanup. A component test takes tens of milliseconds, so I can have hundreds; anything that needs a real browser goes to Playwright."
:::

::: links
Testing Library: Guiding principles | https://testing-library.com/docs/guiding-principles
React Testing Library intro | https://testing-library.com/docs/react-testing-library/intro
Vitest: Environment | https://vitest.dev/guide/environment
:::

=== Which queries should you use? (getBy vs queryBy vs findBy, and the priority)
@p 3
@tags testing, rtl, queries, accessibility
@quick
- Priority: **`getByRole`** (with `name`) → `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue` → `getByAltText`/`Title` → **`getByTestId`** (last resort).
- **`getBy`**: must exist now (throws if 0 or >1). **`queryBy`**: returns `null` (use to assert absence). **`findBy`**: returns a Promise, retries until it appears (async). `…AllBy` variants return arrays.
- Role queries double as **accessibility checks**: if `getByRole('button', { name: 'Save' })` fails, a screen reader can't find it either.
- `within(container)` scopes queries to part of the page (a row, a dialog).
- Measured on a 500-row list: `getByRole` **125 ms**, `getByLabelText` **13.6 ms**, `getByText` **10.9 ms**, `getByTestId` **1.4 ms**. Prefer role, but scope with `within` on huge DOMs.

::: text 🧒 In simple words
Finding something on a page the way a person does: "the **Save button**" (role), "the **Email box**" (label), "the text **No users yet**". A test ID is like **finding a box by its barcode**: fast and precise, but no person would ever do it, so it tells you less.
:::

::: text 📖 Detailed answer
### Variants
| Variant | 0 matches | 1 match | >1 match | Async? | Use for |
|---|---|---|---|---|---|
| `getBy…` | throws | element | throws | no | asserting presence now |
| `queryBy…` | `null` | element | throws | no | asserting absence |
| `findBy…` | rejects after timeout | element | rejects | **yes** | content that appears later |
| `getAllBy…` / `queryAllBy…` / `findAllBy…` | | arrays | | | lists |

### Priority (from the Testing Library docs)
1. `getByRole('button', { name: /save/i })`: buttons, links, headings (`{ level: 1 }`), textboxes, checkboxes, lists, dialogs, alerts.
2. `getByLabelText('Email')`: form fields.
3. `getByPlaceholderText`: only if there's no label.
4. `getByText`: non-interactive content.
5. `getByDisplayValue`: filled form values.
6. `getByAltText`, `getByTitle`.
7. `getByTestId`: when nothing user-visible identifies the element.

### Measured cost (500 rows = 1,000 inputs and buttons, median of 3 runs)
| Query | ms per call |
|---|---|
| `getByRole('button', { name })` | 125 |
| `getByLabelText` | 13.6 |
| `getByText` | 10.9 |
| `getByTestId` | 1.4 |

Role queries compute accessible names and roles for every element, which is expensive on huge trees. Keep using them (they test accessibility), but scope with `within(row)` and keep test DOMs small.
:::

::: diagram Picking the right variant
flowchart TD
  Q{"Should the element be there right now?"} -->|"yes"| G["getBy"]
  Q -->|"no, I assert it is absent"| QB["queryBy + not.toBeInTheDocument()"]
  Q -->|"it appears after async work"| F["await findBy"]
  G --> P["prefer ByRole with a name, then ByLabelText, ByText"]
:::

::: image Which query should I use?
/images/testing/rtl-queries.svg
:::

::: chart bar Measured: one query on a 500-row list in jsdom (ms per call, Vitest 5)
Query,ms per call
getByRole (with name),125
getByLabelText,13.6
getByText,10.9
getByTestId,1.4
:::

::: text 🪜 Step by step
Asserting the "Delete" button of Ravi's row in a table:
1. `const row = screen.getByRole('row', { name: /ravi/i })`.
2. `within(row).getByRole('button', { name: /delete/i })`: scoped, fast, unambiguous.
3. Click it with `user.click`.
4. `expect(screen.queryByRole('row', { name: /ravi/i })).not.toBeInTheDocument()`.
5. If the row disappears after an API call: `await waitForElementToBeRemoved(() => screen.queryByRole('row', { name: /ravi/i }))`.
:::

::: code tsx UserList.test.tsx: findBy, queryBy and within
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserList } from './UserList';

describe('<UserList> queries', () => {
  it('waits for the list, reads items with within, and checks the loader is gone', async () => {
    render(<UserList />);
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();          // getBy: there now
    const list = await screen.findByRole('list', { name: 'users' });         // findBy: appears later
    const names = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(names).toEqual(['Asha', 'Ravi']);
    expect(screen.queryByText(/loading users/i)).not.toBeInTheDocument();    // queryBy: absence
  });
});
:::

::: warning ⚠️ Common mistakes
- `getBy` to assert absence (it throws instead of failing nicely); use `queryBy`.
- `getBy` for async content (fails before data arrives); use `findBy`.
- `getByTestId` everywhere (tests pass even when the UI is inaccessible).
- `container.querySelector('.btn-primary')` (couples tests to CSS).
- Not giving buttons accessible names (icon buttons need `aria-label`).
:::

::: understand
- Query by what users perceive; choose get/query/find by timing and presence.
:::

::: ask
- *"Can a screen reader find this element?"* If `getByRole` can't, fix the component, not the test.
:::

::: important ⭐ Say this in the interview
"I follow the Testing Library priority: getByRole with an accessible name first, then label text, placeholder, text, display value, alt and title, and test IDs only as a last resort, because role queries also tell me the UI is accessible. getBy asserts something is there now and throws otherwise, queryBy returns null so I use it to assert absence, and findBy returns a promise that retries, for content that appears asynchronously; the All variants return arrays. Role queries are the slowest; in a measurement on a 500-row list getByRole took about 125 milliseconds versus 1.4 for a test ID, so on large DOMs I scope queries with within."
:::

::: links
Testing Library: Which query should I use? | https://testing-library.com/docs/queries/about#priority
Testing Library: ByRole | https://testing-library.com/docs/queries/byrole
:::

=== How do you simulate user interactions and test async UI? (user-event, findBy, waitFor)
@p 3
@tags testing, rtl, user-event, async, waitfor
@quick
- **`@testing-library/user-event`** simulates real interactions (`type`, `click`, `keyboard`, `tab`, `selectOptions`, `upload`) with the full event sequence; prefer it over `fireEvent`.
- Create it per test: `const user = userEvent.setup()`; every call is **async**: `await user.click(...)`.
- Wait for async UI with **`await screen.findBy…`** (retries up to 1 s by default) or **`await waitFor(() => expect(...))`** for non-DOM assertions.
- Assert absence after async work with `waitForElementToBeRemoved` or `queryBy` + `not.toBeInTheDocument()`.
- Never wait with fixed timeouts; for timers (debounce), use fake timers with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

::: text 🧒 In simple words
`fireEvent` is like **teleporting** a letter into a text box. `user-event` is like a person who **clicks the box, places the cursor, presses each key** and lifts their finger. If your component reacts to focus or key presses, only the second one notices. And when the app needs time (loading data), you **wait for what you expect to see**, not for a guessed number of seconds.
:::

::: text 📖 Detailed answer
### user-event vs fireEvent
| | `user-event` | `fireEvent` |
|---|---|---|
| Typing "ab" | focus, keydown, keypress, input, keyup for each char | one `change`/`input` event |
| Disabled / hidden elements | refuses to interact (like a user) | dispatches anyway |
| `maxLength`, selection, `pointer-events` | respected | ignored |
| API | `await user.type(el, 'ab')` | `fireEvent.change(el, { target: { value: 'ab' } })` |

### Waiting
| Need | Tool |
|---|---|
| element appears | `await screen.findByRole(...)` |
| element disappears | `await waitForElementToBeRemoved(() => screen.queryByText('Loading…'))` |
| a mock was called / non-DOM state | `await waitFor(() => expect(save).toHaveBeenCalled())` |
| debounce/throttle timers | `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)` |

Rules for `waitFor`: put **assertions** inside, no side effects (no clicks), one assertion is enough.

### act() warnings
RTL helpers (`render`, user-event, `findBy`, `waitFor`) already wrap updates in `act`. A warning "update was not wrapped in act(...)" usually means a state update happened **after the test finished** (an unawaited promise): await the visible result.
:::

::: diagram Click, loading, then result
sequenceDiagram
  participant T as Test
  participant C as Component
  participant N as Network (MSW)
  T->>C: "await user.click(Save)"
  C->>N: "POST /todos"
  C-->>T: "button disabled, 'Saving…' visible"
  N-->>C: "201 Created"
  C-->>T: "'Saved' appears"
  T->>T: "await screen.findByText('Saved')"
:::

::: image Interacting and waiting for async UI
/images/testing/rtl-async.svg
:::

::: text 🪜 Step by step
Testing a debounced search box (300 ms):
1. `vi.useFakeTimers({ shouldAdvanceTime: true })` and `const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` (without `shouldAdvanceTime`, user-event's internal delays never resolve and the test times out: we hit exactly that).
2. `await user.type(screen.getByRole('searchbox'), 'ash')`.
3. Assert the search function hasn't been called yet (debounce pending).
4. `vi.advanceTimersByTime(300)`.
5. Assert it was called **once** with `'ash'`, then `vi.useRealTimers()`.
:::

::: code tsx SearchBox.test.tsx: user-event with fake timers and async results
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function SearchBox({ search }: { search: (q: string) => Promise<string[]> }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<string[]>([]);
  useEffect(() => {
    if (!q) return;
    const id = setTimeout(() => { search(q).then(setResults); }, 300);   // debounce
    return () => clearTimeout(id);
  }, [q, search]);
  return (
    <div>
      <input type="search" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul aria-label="results">{results.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}

describe('<SearchBox>', () => {
  afterEach(() => vi.useRealTimers());

  it('debounces typing and shows results', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });          // user-event needs time to keep moving
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const search = vi.fn(async (q: string) => [`${q}a`, `${q}ok`]);
    render(<SearchBox search={search} />);

    await user.type(screen.getByRole('searchbox', { name: /search users/i }), 'ash');
    expect(search).not.toHaveBeenCalled();                  // still inside the 300 ms window

    vi.advanceTimersByTime(300);
    expect(search).toHaveBeenCalledTimes(1);                // one call, not three
    expect(search).toHaveBeenCalledWith('ash');

    vi.useRealTimers();
    expect(await screen.findByText('asha')).toBeInTheDocument();
  });
});
:::

::: code javascript Why debouncing reduces calls: the logic the test verifies (runnable)
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const calls = [];
const search = debounce((q) => calls.push(q), 50);
['a', 'as', 'ash'].forEach((q, i) => setTimeout(() => search(q), i * 10));   // typed within 50 ms
setTimeout(() => {
  console.log('calls:', calls);
  console.log('only the final value is searched', calls.length === 1 && calls[0] === 'ash' ? '✅' : '❌ FAIL');
}, 150);
:::

::: warning ⚠️ Common mistakes
- Forgetting `await` before `user.*` calls (assertions run too early).
- `fireEvent.change` for typing (misses focus/key handlers, ignores `disabled`).
- `await new Promise(r => setTimeout(r, 500))` instead of `findBy`/`waitFor`.
- Clicking inside `waitFor` (it may run many times).
- Fake timers without `shouldAdvanceTime: true` and user-event's `advanceTimers` option, so typing hangs until the test times out.
:::

::: understand
- Interact like a user, then wait for what the user would see; never for a guessed time.
:::

::: ask
- *"Does this component use timers (debounce, polling)?"* Then plan fake timers in the test.
:::

::: important ⭐ Say this in the interview
"I simulate interactions with user-event rather than fireEvent, because it reproduces the full sequence of focus, key and input events and refuses to interact with disabled elements, just like a user; every call is awaited. For asynchronous UI I await findBy queries, which retry until the element appears, waitFor for non-DOM assertions like a mock being called, and waitForElementToBeRemoved for loaders. I never use fixed sleeps. For debounce or polling I switch to fake timers and pass advanceTimers to user-event, then advance time explicitly."
:::

::: links
user-event docs | https://testing-library.com/docs/user-event/intro
Testing Library: Async methods | https://testing-library.com/docs/dom-testing-library/api-async
:::

=== How do you mock API calls in component tests? (MSW)
@p 3
@tags testing, msw, mocking, api, react
@quick
- **Mock Service Worker (MSW)** intercepts requests at the **network layer**: your component's real `fetch`/axios code runs; only the response is fake.
- Define handlers once: `http.get('https://api.example.com/users', () => HttpResponse.json([...]))`; start with `setupServer(...handlers)` in the test setup.
- Override per test for errors/empty states: `server.use(http.get(url, () => new HttpResponse(null, { status: 500 })))`; `resetHandlers()` after each test.
- `onUnhandledRequest: 'error'` makes tests fail when a component calls an API you didn't mock.
- The same handlers can power local development and Storybook (browser service worker).

::: text 🧒 In simple words
Instead of replacing the phone in your component (mocking `fetch`), MSW **sits at the telephone exchange**: your component makes a real call, and MSW answers with the script you wrote. So you test the real calling code, just with a predictable voice on the other end.
:::

::: text 📖 Detailed answer
### Why MSW over mocking fetch/axios
| `vi.mock('axios')` / stubbing `fetch` | MSW |
|---|---|
| tied to the HTTP library you use | works with fetch, axios, React Query, GraphQL clients |
| skips your request code (URLs, headers, parsing) | exercises it |
| easy to drift from the real API | handlers mirror endpoints, reusable across tests and dev |
| per-test boilerplate | one handler file + per-test overrides |

### Setup (Node, for Vitest/Jest)
`// test/msw.ts`  
`export const server = setupServer(http.get('https://api.example.com/users', () => HttpResponse.json([{ id: 1, name: 'Asha' }])))`  
`// test/setup.ts`  
`beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`  
`afterEach(() => server.resetHandlers())`  
`afterAll(() => server.close())`

### Testing every state
- Happy path: default handler.
- Error: `server.use(... status 500)`.
- Empty: `server.use(... HttpResponse.json([]))`.
- Slow: `await delay(1000)` inside a handler to test loading UI.
- Assert requests: read `request.json()` inside a handler, or check the UI that results.
:::

::: diagram Where MSW sits
flowchart LR
  C["component: fetch('/users')"] --> L["fetch / axios (real code)"]
  L --> M["MSW interceptor"]
  M -->|"matching handler"| R["mocked response (200, 500, empty, slow)"]
  M -->|"no handler"| E["test fails: unhandled request"]
  R --> C
:::

::: image Mocking the network with MSW
/images/testing/msw.svg
:::

::: text 🪜 Step by step
Testing the error state of `<UserList />`:
1. Global handler returns two users (happy path).
2. In the error test: `server.use(http.get(url, () => new HttpResponse(null, { status: 500 })))`.
3. `render(<UserList />)`: the component's real `fetch` runs and gets a 500.
4. `expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users')`.
5. `afterEach(server.resetHandlers)` restores the happy path for the next test.
:::

::: code tsx UserList.test.tsx: happy, error and empty states with MSW
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw';
import { UserList } from './UserList';

describe('<UserList> (network mocked with MSW)', () => {
  it('shows a loading state, then the users from the API', async () => {
    render(<UserList />);
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'users' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Asha', 'Ravi']);
    expect(screen.queryByText(/loading users/i)).not.toBeInTheDocument();
  });

  it('shows an error when the API fails', async () => {
    server.use(http.get('https://api.example.com/users', () => new HttpResponse(null, { status: 500 })));
    render(<UserList />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users');
  });

  it('shows an empty state', async () => {
    server.use(http.get('https://api.example.com/users', () => HttpResponse.json([])));
    render(<UserList />);
    expect(await screen.findByText('No users yet')).toBeInTheDocument();
  });
});
:::

::: code tsx test/msw.ts and test/setup.ts: shared handlers and lifecycle
// test/msw.ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
export const handlers = [
  http.get('https://api.example.com/users', () => HttpResponse.json([{ id: 1, name: 'Asha' }, { id: 2, name: 'Ravi' }])),
];
export const server = setupServer(...handlers);

// test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => server.close());
:::

::: warning ⚠️ Common mistakes
- Forgetting `resetHandlers()` (an error override leaks into later tests).
- `onUnhandledRequest: 'bypass'` hiding real network calls in tests.
- Handlers that return shapes the real API never returns (keep them typed / generated from the API schema).
- Testing only the happy path (error, empty and loading states are where bugs hide).
:::

::: understand
- Fake the network, not your code: components run their real data-fetching logic.
:::

::: ask
- *"Do we have an OpenAPI schema?"* Handlers (and types) can be generated from it.
:::

::: important ⭐ Say this in the interview
"I mock APIs with Mock Service Worker, which intercepts requests at the network layer, so the component's real fetch or axios code runs and only the response is fake. Handlers are defined once with http.get returning HttpResponse.json, the server starts in the test setup with onUnhandledRequest set to error, and each test overrides handlers with server.use to cover error, empty and slow states, with resetHandlers after each test. Compared to mocking fetch or axios directly it's independent of the HTTP library and harder to drift from the real API, and the same handlers can drive local development."
:::

::: links
MSW docs | https://mswjs.io/docs/
MSW: Node.js integration | https://mswjs.io/docs/integrations/node
:::

=== How do you test custom hooks and components that need providers?
@p 2
@tags testing, rtl, hooks, context, providers
@quick
- Prefer testing a hook **through a component** that uses it; use **`renderHook`** for reusable hooks with many states.
- `const { result } = renderHook(() => useCounter(5))`; update with `act(() => result.current.increment())`; read `result.current` again after updates.
- Components needing context (theme, auth, React Query, router, Redux) get a **custom render** with a `wrapper` that provides the same providers as the app.
- Create a **fresh provider instance per test** (new `QueryClient` with `retry: false`, new store) to avoid shared state.
- For routing: `MemoryRouter` (React Router) or test navigation in Playwright; for Next.js `useRouter`, mock `next/navigation` or test in E2E.

::: text 🧒 In simple words
A hook is an **engine**; `renderHook` puts it on a **test bench** so you can rev it directly. A component that needs providers is an **appliance that needs electricity and water**: the custom render plugs it into the same supply the real house has, so it behaves like at home.
:::

::: text 📖 Detailed answer
### renderHook
| API | Use |
|---|---|
| `renderHook(() => useX(args))` | mounts a tiny test component calling the hook |
| `result.current` | the latest return value (read it after each update) |
| `rerender(newProps)` | change the hook's arguments |
| `unmount()` | test cleanup logic (effects returning functions) |
| `act(() => …)` | wrap direct calls that update state |

### Custom render with providers
`function renderWithProviders(ui, { theme = 'light' } = {}) { return render(ui, { wrapper: ({ children }) => <ThemeProvider initial={theme}>{children}</ThemeProvider> }) }`

### React Query in tests
`new QueryClient({ defaultOptions: { queries: { retry: false } } })` per test: no retries delaying error states, no cache shared between tests.

### When to use which
- Hook used by one component → test the component.
- Library-like hook (`useDebounce`, `useLocalStorage`, `usePagination`) → `renderHook` for its edge cases.
:::

::: diagram Wrapping a component with providers
flowchart LR
  T["test"] --> R["renderWithProviders(ui)"]
  R --> W["wrapper: QueryClientProvider, ThemeProvider, Router"]
  W --> C["component under test"]
  C --> H["useQuery, useTheme, useNavigate work as in the app"]
:::

::: image Testing hooks and components that need providers
/images/testing/rtl-hooks.svg
:::

::: text 🪜 Step by step
Testing a `ThemeToggle` that uses a theme context:
1. Write `renderWithTheme(ui, initial)` that wraps `ui` in `<ThemeProvider initial={initial}>`.
2. `renderWithTheme(<ThemeToggle />, 'light')`.
3. Assert the button says "Switch to dark".
4. `await user.click(button)`.
5. Assert it now says "Switch to light" (context state changed through the real provider).
:::

::: code tsx useCounter.test.tsx and ThemeToggle.test.tsx: renderHook and a custom render
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

// a reusable hook
function useCounter(initial = 0, { min = -Infinity, max = Infinity } = {}) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((c) => Math.min(max, c + 1)), [max]);
  const decrement = useCallback(() => setCount((c) => Math.max(min, c - 1)), [min]);
  return { count, increment, decrement };
}

describe('useCounter (renderHook)', () => {
  it('increments, decrements and respects max', () => {
    const { result } = renderHook(() => useCounter(9, { max: 10 }));
    act(() => result.current.increment());
    act(() => result.current.increment());
    expect(result.current.count).toBe(10);
    act(() => result.current.decrement());
    expect(result.current.count).toBe(9);
  });
});

// a component that needs a provider
type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);
function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initial);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }}>{children}</ThemeContext.Provider>;
}
function ThemeToggle() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('ThemeToggle needs ThemeProvider');
  return <button onClick={ctx.toggle}>Switch to {ctx.theme === 'light' ? 'dark' : 'light'}</button>;
}
function renderWithTheme(ui: ReactNode, initial: Theme = 'light') {
  return render(ui, { wrapper: ({ children }) => <ThemeProvider initial={initial}>{children}</ThemeProvider> });
}

describe('<ThemeToggle> (custom render with providers)', () => {
  it('toggles the theme through the real provider', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />, 'light');
    await user.click(screen.getByRole('button', { name: /switch to dark/i }));
    expect(screen.getByRole('button', { name: /switch to light/i })).toBeInTheDocument();
  });
  it('starts from the given theme', () => {
    renderWithTheme(<ThemeToggle />, 'dark');
    expect(screen.getByRole('button')).toHaveTextContent('Switch to light');
  });
});
:::

::: warning ⚠️ Common mistakes
- Testing every hook with `renderHook` even when a component test would be more meaningful.
- Reading a stale `result.current` captured before an update.
- Sharing one `QueryClient`/store across tests (cached data leaks between tests).
- Leaving React Query retries on (error tests become slow or time out).
- Mocking your own context instead of rendering the real provider.
:::

::: understand
- Give components the same environment as the app; test hooks directly only when they're reusable units.
:::

::: ask
- *"Which providers does the app root have?"* The test wrapper should mirror them.
:::

::: important ⭐ Say this in the interview
"I usually test a hook through a component that uses it, and use renderHook for reusable hooks with lots of edge cases: it mounts a small component, I call methods inside act and read result.current after each update. Components that depend on context get a custom render whose wrapper provides the same providers as the app, theme, auth, router, React Query, with a fresh instance per test and retries turned off so tests don't share cache or slow down. That way components behave exactly as they do in the app without mocking my own context."
:::

::: links
React Testing Library: renderHook | https://testing-library.com/docs/react-testing-library/api#renderhook
Testing Library: Custom render | https://testing-library.com/docs/react-testing-library/setup#custom-render
TanStack Query: Testing | https://tanstack.com/query/latest/docs/framework/react/guides/testing
:::
