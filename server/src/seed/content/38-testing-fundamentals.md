@section Testing Fundamentals
@icon 🧪
@color #14b8a6
@desc Start here: why we test, unit vs integration vs end-to-end (with measured speeds), test doubles (mocks, stubs, spies, fakes), what makes a good test, TDD and code coverage. Every test shown was run with Vitest 5 and Playwright 1.63.

=== Unit vs integration vs end-to-end tests (the testing pyramid)
@p 3
@tags testing, unit, integration, e2e, pyramid
@quick
- **Unit test**: one function/component in isolation, dependencies faked. Fast, precise failures.
- **Integration test**: several real pieces together (route + validation + data layer; component + hooks + mocked network).
- **End-to-end (E2E)**: the real app in a real browser, like a user (Playwright, Cypress).
- Measured median time per test: unit **0.32 ms**, API integration **5.6 ms**, React component **72 ms**, E2E **992 ms** (≈3,000× a unit test).
- **Pyramid**: many unit, fewer integration, few E2E. The **testing trophy** (Kent C. Dodds) puts most weight on integration tests for UIs. Either way: fast tests for logic, a few E2E for critical journeys (login, checkout).

::: text 🧒 In simple words
Testing a car: **unit tests** check each part on a bench (does the brake pad grip?). **Integration tests** check parts working together (brake pedal + hydraulics + pad). **End-to-end tests** are a **test drive** on a real road. Test drives catch the most, but they're slow and expensive, so you don't do one for every bolt.
:::

::: text 📖 Detailed answer
| | Unit | Integration | End-to-end |
|---|---|---|---|
| Scope | one function / component | several modules together | whole app: browser → server → DB |
| Dependencies | faked | some real, external ones faked | all real (or a staging env) |
| Speed (measured) | 0.32 ms | 5.6 ms (API), 72 ms (UI) | 992 ms |
| Confidence for users | low–medium | medium–high | highest |
| When it fails | exactly which function | which feature | "something in this journey" |
| Tools | Vitest, Jest, node:test | + Supertest, RTL, MSW, test DB | Playwright, Cypress |
| Maintenance | low | medium | higher (more moving parts, flakiness) |

### Why we test at all
- Catch regressions before users do; refactor safely.
- Document behaviour with executable examples.
- Faster feedback than manual checking, especially in CI on every pull request.

### Pyramid vs trophy
- **Pyramid**: the classic shape; cheap unit tests form the base.
- **Trophy**: static analysis (TypeScript, ESLint) at the base, then unit, then a **thick middle of integration tests**, then a few E2E. For React apps, testing components the way users use them (RTL) gives the best confidence per minute.

### A practical mix for a full-stack app
- Unit: pure logic (pricing, validation, reducers, utils).
- Integration: API endpoints with Supertest + a test DB; React components with RTL + MSW.
- E2E: 5–20 critical journeys in Playwright, run in CI against a production build.
:::

::: diagram What each level touches
flowchart LR
  subgraph U["unit"]
    F["function or component"]
  end
  subgraph I["integration"]
    R["route + validation + data layer"]
    C["component + hooks + mocked network"]
  end
  subgraph E["end-to-end"]
    BR["real browser"] --> FE["frontend"] --> API["API"] --> DB["database"]
  end
:::

::: image The testing pyramid (with measured speeds)
/images/testing/pyramid.svg
:::

::: chart bar Measured: median duration per test (ms, Vitest 5 + Playwright 1.63, M3 Pro)
Level,Median ms per test
unit (pure function),0.32
API integration (Supertest),5.6
React component (RTL + jsdom),71.6
E2E (Chrome + Next.js),992
:::

::: text 🪜 Step by step
Choosing tests for a "sign up" feature:
1. **Unit**: `validatePassword()` rules (length, characters): many cases, milliseconds.
2. **Integration (API)**: `POST /api/users` with Supertest: 201 on success, 400 on invalid input, 409 on duplicate email, against an in-memory or test DB.
3. **Integration (UI)**: `<SignupForm>` with RTL: typing, error messages, disabled button while submitting; network mocked with MSW.
4. **E2E**: one Playwright test: open `/signup`, fill the form, land on the dashboard.
5. Result: most bugs are caught by fast tests; the single E2E test proves the pieces really connect.
:::

::: code typescript cart.unit.test.ts: unit tests (Vitest) that ran in 0.32 ms each
import { describe, expect, it, vi } from 'vitest';
import { applyCoupon, subtotal } from './cart';

describe('subtotal', () => {
  it('multiplies price by quantity and adds the lines', () => {
    expect(subtotal([{ name: 'Book', price: 300, qty: 2 }, { name: 'Pen', price: 20, qty: 3 }])).toBe(660);
  });
  it('returns 0 for an empty cart', () => {
    expect(subtotal([])).toBe(0);
  });
  it('avoids floating point noise', () => {
    expect(subtotal([{ name: 'A', price: 0.1, qty: 1 }, { name: 'B', price: 0.2, qty: 1 }])).toBe(0.3);
  });
});

describe('applyCoupon', () => {
  it('takes 10% off with SAVE10', () => {
    expect(applyCoupon(500, 'SAVE10')).toBe(450);
  });
  it('applies NEWYEAR only in January (time is controlled, not real)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-15'));
    expect(applyCoupon(500, 'NEWYEAR')).toBe(450);
    vi.setSystemTime(new Date('2027-03-15'));
    expect(() => applyCoupon(500, 'NEWYEAR')).toThrow('Invalid coupon: NEWYEAR');
    vi.useRealTimers();
  });
});
:::

::: code javascript A 20-line test runner: what Vitest and Jest do underneath (runnable)
const results = [];
function test(name, fn) {
  const start = Date.now();
  try { fn(); results.push({ name, ok: true, ms: Date.now() - start }); }
  catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function expect(actual) {
  return {
    toBe: (expected) => { if (!Object.is(actual, expected)) throw new Error(`expected ${expected}, got ${actual}`); },
    toThrow: (msg) => { try { actual(); } catch (e) { if (!e.message.includes(msg)) throw new Error(`wrong error: ${e.message}`); return; } throw new Error('expected a throw'); },
  };
}

// code under test
const subtotal = (items) => Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
const applyCoupon = (total, code) => { if (!code) return total; if (code === 'SAVE10') return total * 0.9; throw new Error(`Invalid coupon: ${code}`); };

test('subtotal adds lines', () => expect(subtotal([{ price: 300, qty: 2 }, { price: 20, qty: 3 }])).toBe(660));
test('no floating point noise', () => expect(subtotal([{ price: 0.1, qty: 1 }, { price: 0.2, qty: 1 }])).toBe(0.3));
test('SAVE10 takes 10% off', () => expect(applyCoupon(500, 'SAVE10')).toBe(450));
test('unknown coupons throw', () => expect(() => applyCoupon(500, 'FREE')).toThrow('Invalid coupon'));
test('a deliberately wrong expectation', () => expect(subtotal([])).toBe(1));

for (const r of results) console.log(r.ok ? 'PASS' : 'FAIL', r.name, r.error ?? '');
console.log('4 pass and the wrong one fails with a clear message', results.filter((r) => r.ok).length === 4 && results[4].error === 'expected 1, got 0' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Only E2E tests ("ice-cream cone"): slow, flaky, hard to debug.
- Only unit tests with everything mocked: green tests, broken app.
- Testing implementation details (private functions, internal state) instead of behaviour.
- E2E tests for every edge case that a unit test could cover in a millisecond.
:::

::: understand
- Cost and confidence grow together as you go up the pyramid; choose the cheapest test that gives the confidence you need.
:::

::: ask
- *"Which user journeys would hurt most if they broke?"* Those get E2E tests.
:::

::: important ⭐ Say this in the interview
"Unit tests check one function or component in isolation and run in fractions of a millisecond; integration tests check several real pieces together, like an Express route with validation and the data layer through Supertest, or a React component with its hooks and a mocked network; end-to-end tests drive the real app in a real browser. In my measurements a unit test took 0.3 milliseconds, an API integration test 6, a component test about 70 and an end-to-end test about one second. So I write many fast tests for logic, a solid layer of integration tests, which gives the best confidence for UIs, and a handful of Playwright tests for critical journeys like login and checkout."
:::

::: links
Martin Fowler: The practical test pyramid | https://martinfowler.com/articles/practical-test-pyramid.html
Kent C. Dodds: The testing trophy | https://kentcdodds.com/blog/write-tests
Vitest docs | https://vitest.dev/guide/
:::

=== Mocks, stubs, spies and fakes: what's the difference, and when should you mock?
@p 3
@tags testing, mocks, stubs, spies, fakes
@quick
- **Dummy**: passed but never used. **Stub**: returns canned answers. **Spy**: records calls (args, count). **Mock**: stub/spy with expectations you verify. **Fake**: a working lightweight implementation (in-memory DB, MSW server, fake timers).
- In Vitest/Jest: `vi.fn()` creates a mock function, `vi.spyOn(obj, 'method')` wraps a real one, `vi.mock('module')` replaces a module, `vi.useFakeTimers()` controls time.
- **Mock what you don't own or can't control**: network, time, randomness, email/SMS, payment APIs.
- **Don't mock your own modules** by default: you'd test that the code calls itself, not that it works.
- Prefer **fakes at boundaries** (MSW for HTTP, an in-memory repository) over deep `vi.mock` chains.

::: text 🧒 In simple words
In a film, stunt doubles stand in for actors. A **stub** is a cardboard cut-out that always says the same line. A **spy** is a hidden camera recording what happened. A **mock** is a stand-in with a script you check afterwards ("did they say the line exactly twice?"). A **fake** is an understudy who can actually play the role, just more simply.
:::

::: text 📖 Detailed answer
| Double | Purpose | Vitest example |
|---|---|---|
| Dummy | fill a parameter | `new NoopLogger()` |
| Stub | control an input | `const getRate = vi.fn().mockReturnValue(1.1)` |
| Spy | observe an output/side effect | `const spy = vi.spyOn(console, 'error')` |
| Mock | verify an interaction | `expect(sendEmail).toHaveBeenCalledWith('a@b.c', expect.stringContaining('Welcome'))` |
| Fake | realistic substitute | in-memory DB, MSW request handlers, `vi.useFakeTimers()` |

### When to mock
| Mock / fake it | Keep it real |
|---|---|
| HTTP calls to other services (MSW) | your own pure functions |
| time (`vi.setSystemTime`), randomness | your own components and hooks |
| email, SMS, payments, analytics | the database in integration tests (use a test DB) |
| slow or flaky infrastructure | framework behaviour (React, Express) |

### Dependency injection makes faking easy
`createApp(db)` receives its data layer; tests pass `createMemoryDb()`, production passes the real repository. No module mocking needed.

### Over-mocking smells
- Tests break on every refactor even though behaviour didn't change.
- More mock setup than assertions.
- Tests pass while the real integration is broken (the mock doesn't match reality).
:::

::: diagram Where to put the seam
flowchart LR
  T["test"] --> APP["your code (real)"]
  APP --> DB["data layer: in-memory fake or test DB"]
  APP --> NET["HTTP to other services: MSW fake"]
  APP --> CLK["clock and randomness: fake timers, seeded random"]
  APP --> EM["email or payments: mock and verify the call"]
:::

::: image Test doubles: dummy, stub, spy, mock, fake
/images/testing/test-doubles.svg
:::

::: text 🪜 Step by step
Testing "send a welcome email after sign-up" without sending real email:
1. Inject `mailer` into `signUp({ db, mailer })`.
2. In the test, `const mailer = { send: vi.fn().mockResolvedValue({ id: 'm1' }) }` (stub + spy).
3. Use a fake in-memory `db`.
4. Call `await signUp(...)`.
5. Assert the outcome (user saved) **and** the interaction: `expect(mailer.send).toHaveBeenCalledWith('asha@x.com', expect.stringContaining('Welcome'))`.
:::

::: code typescript signup.test.ts: stub, spy, mock and fake together (Vitest)
import { describe, expect, it, vi } from 'vitest';

type Mailer = { send(to: string, body: string): Promise<{ id: string }> };
type Db = { insert(u: { email: string }): Promise<{ id: number; email: string }> };

export async function signUp(email: string, deps: { db: Db; mailer: Mailer; now: () => Date }) {
  const user = await deps.db.insert({ email });
  const hour = deps.now().getHours();
  await deps.mailer.send(email, `${hour < 12 ? 'Good morning' : 'Hello'}! Welcome aboard.`);
  return user;
}

function createFakeDb(): Db & { rows: { id: number; email: string }[] } {      // fake
  const rows: { id: number; email: string }[] = [];
  return { rows, insert: async (u) => { const row = { id: rows.length + 1, ...u }; rows.push(row); return row; } };
}

describe('signUp', () => {
  it('saves the user and sends a welcome email', async () => {
    const db = createFakeDb();
    const mailer: Mailer = { send: vi.fn().mockResolvedValue({ id: 'm1' }) };   // stub + spy
    const now = () => new Date('2027-01-15T09:00:00');                         // stub for time

    const user = await signUp('asha@x.com', { db, mailer, now });

    expect(user).toEqual({ id: 1, email: 'asha@x.com' });
    expect(db.rows).toHaveLength(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);                              // mock-style verification
    expect(mailer.send).toHaveBeenCalledWith('asha@x.com', expect.stringContaining('Good morning'));
  });

  it('logs nothing on success (spy on a real method)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await signUp('b@x.com', { db: createFakeDb(), mailer: { send: vi.fn().mockResolvedValue({ id: 'm2' }) }, now: () => new Date() });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
:::

::: code javascript Building a spy and a fake by hand (runnable)
function fn(impl = () => undefined) {                     // what vi.fn() does
  const mock = (...args) => { mock.calls.push(args); return impl(...args); };
  mock.calls = [];
  return mock;
}
const sent = fn(async () => ({ id: 'm1' }));
const fakeDb = { rows: [], async insert(u) { const r = { id: this.rows.length + 1, ...u }; this.rows.push(r); return r; } };

async function signUp(email, { db, mailer }) {
  const user = await db.insert({ email });
  await mailer.send(email, 'Welcome!');
  return user;
}

signUp('asha@x.com', { db: fakeDb, mailer: { send: sent } }).then((user) => {
  console.log({ user, calls: sent.calls });
  console.log('fake DB stored the user', fakeDb.rows.length === 1 && user.id === 1 ? '✅' : '❌ FAIL');
  console.log('spy recorded exactly one call with the right args', sent.calls.length === 1 && sent.calls[0][0] === 'asha@x.com' ? '✅' : '❌ FAIL');
});
:::

::: warning ⚠️ Common mistakes
- Mocking the thing under test, or every import ("mockist" tests that pass while the app is broken).
- Forgetting to restore spies/fake timers (`mockRestore`, `vi.useRealTimers`, `restoreMocks` config): tests leak into each other.
- Mocks that drift from the real API shape (use typed fakes, contract tests, MSW handlers that mirror the API).
- Asserting on calls only, never on the observable result.
:::

::: understand
- Doubles replace what you can't control; inject dependencies so tests can swap them easily.
:::

::: ask
- *"What's the boundary of my system here?"* Fake beyond it, keep things real inside it.
:::

::: important ⭐ Say this in the interview
"A stub returns canned answers to control inputs, a spy records how something was called, a mock combines that with expectations I verify, a fake is a working lightweight implementation like an in-memory database or an MSW server, and a dummy just fills a parameter. In Vitest that's vi.fn, vi.spyOn, vi.mock and fake timers. I mock what I don't own or can't control, like the network, time, randomness and email, and keep my own code real, ideally by injecting dependencies so tests pass fakes. Over-mocking makes tests pass while the real integration is broken."
:::

::: links
Martin Fowler: Mocks aren't stubs | https://martinfowler.com/articles/mocksArentStubs.html
Vitest: Mocking | https://vitest.dev/guide/mocking
:::

=== What makes a good test? (Arrange-Act-Assert, FIRST, testing behaviour)
@p 2
@tags testing, best-practices, aaa, flaky-tests
@quick
- Structure: **Arrange** (set up), **Act** (do one thing), **Assert** (check the outcome).
- **FIRST**: Fast, Independent (no shared state or order), Repeatable (control time/random/network), Self-validating (assertions, not logs), Timely.
- Test **behaviour, not implementation**: what a caller or user can observe (return values, DOM, HTTP responses), not private functions or internal state.
- Descriptive names (`'rejects duplicate emails with 409'`), one reason to fail, no logic (`if`/loops) in tests.
- **Flaky** tests (sometimes fail) come from timing, shared state, order dependence, real network or time: fix them, don't retry forever.

::: text 🧒 In simple words
A good test is like a **good recipe check**: set out the ingredients (arrange), cook one dish (act), taste it (assert). And you judge the **taste**, not whether the chef stirred clockwise: if they find a better way to stir, the dish should still pass.
:::

::: text 📖 Detailed answer
### Arrange, Act, Assert
Visually separate the three parts. If "Act" needs several steps, you're probably testing more than one behaviour.

### FIRST
| Letter | Meaning | How |
|---|---|---|
| Fast | ms, not seconds | no real network/sleeps; fakes at boundaries |
| Independent | any order, in parallel | fresh data in `beforeEach`, no globals |
| Repeatable | same result anywhere | fake timers, seeded randomness, fixed time zones |
| Self-validating | pass/fail automatically | real assertions, no `console.log` checking |
| Timely | with the code | tests in the same PR (or first, with TDD) |

### Behaviour vs implementation
| Implementation detail (fragile) | Behaviour (robust) |
|---|---|
| `expect(component.state.open).toBe(true)` | `expect(screen.getByRole('dialog')).toBeVisible()` |
| `expect(helper).toHaveBeenCalled()` for an internal helper | assert the result the helper produces |
| snapshot of a huge DOM tree | assert the few things that matter |

### Fixing flaky tests
| Cause | Fix |
|---|---|
| `setTimeout`/`sleep` waits | await the actual condition (`findBy`, Playwright auto-wait) |
| shared mutable data | reset in `beforeEach`, unique test data |
| real time/date | `vi.setSystemTime`, inject a clock |
| real network | MSW / test server |
| order dependence | run with `--sequence.shuffle` to find it |
:::

::: diagram Arrange, act, assert
flowchart LR
  A["Arrange: data, fakes, render"] --> B["Act: one action (call, click, request)"]
  B --> C["Assert: observable outcome"]
  C --> D["Cleanup: restore mocks and timers (often automatic)"]
:::

::: image Anatomy of a good test
/images/testing/good-tests.svg
:::

::: text 🪜 Step by step
Turning a flaky test into a reliable one:
1. Flaky: `click('Save'); await sleep(500); expect(toast).toBeVisible()`: fails on slow CI machines.
2. Cause: guessing the timing.
3. Fix: `await screen.findByRole('status')` (RTL) or `await expect(page.getByRole('status')).toBeVisible()` (Playwright): waits up to a timeout for the real condition.
4. If the toast depends on the current date, set it: `vi.setSystemTime(...)`.
5. Run the suite with shuffling and in parallel to make sure no test relies on another.
:::

::: code typescript Fragile vs robust versions of the same test
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

function greeting(name: string, now = new Date()) {
  const h = now.getHours();
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${name}`;
}

describe('greeting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ❌ Not repeatable: depends on when the test runs
  it.skip('greets in the morning (flaky)', () => {
    expect(greeting('Asha')).toContain('Good morning');
  });

  // ✅ Repeatable: time is controlled
  it('greets in the morning before 12:00', () => {
    vi.setSystemTime(new Date('2027-01-15T09:30:00'));
    expect(greeting('Asha')).toBe('Good morning, Asha');
  });

  it.each([
    ['2027-01-15T11:59:00', 'Good morning'],
    ['2027-01-15T12:00:00', 'Good afternoon'],
    ['2027-01-15T18:00:00', 'Good evening'],
  ])('at %s says %s (boundaries)', (iso, expected) => {
    vi.setSystemTime(new Date(iso));
    expect(greeting('Asha')).toBe(`${expected}, Asha`);
  });
});
:::

::: code javascript Why shared state makes tests order-dependent (runnable)
// Two "tests" sharing a module-level cart: the result depends on the order they run in.
let sharedCart = [];
const addItem = (cart, item) => { cart.push(item); return cart.length; };

const testA = () => addItem(sharedCart, 'book') === 1;   // assumes an empty cart
const testB = () => addItem(sharedCart, 'pen') === 1;    // also assumes an empty cart
const runInOrder = (tests) => { sharedCart = []; return tests.map((t) => t()); };
console.log('A then B:', runInOrder([testA, testB]), '| B then A:', runInOrder([testB, testA]));
console.log('with shared state, the second test always fails', JSON.stringify(runInOrder([testA, testB])) === '[true,false]' ? '✅' : '❌ FAIL');

// Fix: each test creates its own data (what beforeEach does)
const independentA = () => addItem([], 'book') === 1;
const independentB = () => addItem([], 'pen') === 1;
console.log('independent tests pass in any order', [independentA(), independentB(), independentB(), independentA()].every(Boolean) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Assertions on internal state or private methods.
- Fixed `sleep`s instead of waiting for conditions.
- Tests that need to run in a specific order.
- Giant snapshot tests nobody reads ("update snapshot" becomes a reflex).
- Test names like `'works'` or `'test 1'`.
:::

::: understand
- A good test fails only when behaviour breaks, and tells you exactly what broke.
:::

::: ask
- *"Would this test still pass after a refactor that keeps behaviour the same?"* If not, it tests implementation.
:::

::: important ⭐ Say this in the interview
"I structure tests as arrange, act, assert, with one behaviour per test and a name that reads like a requirement. Good tests are fast, independent, repeatable, self-validating and written with the code, so I control time and randomness, use fresh data per test and never rely on order. Most importantly I test behaviour that a caller or user can observe rather than implementation details, so refactors don't break tests. Flaky tests usually come from fixed sleeps, shared state, real time or the real network, and I fix the cause by awaiting conditions and faking those boundaries."
:::

::: links
Kent C. Dodds: Testing implementation details | https://kentcdodds.com/blog/testing-implementation-details
Vitest: Fake timers | https://vitest.dev/api/vi.html#vi-usefaketimers
:::

=== What is TDD (test-driven development)?
@p 2
@tags testing, tdd, red-green-refactor
@quick
- **Red → Green → Refactor**: write a **failing** test, write the **simplest code** to pass it, then **clean up** with the tests staying green. Repeat in small steps.
- Forces you to design from the **caller's point of view** and keeps every line covered by a test.
- Great for pure logic, algorithms, parsers, validation and **bug fixes** (first write a test that reproduces the bug).
- Harder for exploratory UI work or unclear requirements (spike first, then test).
- Related: **BDD** (Given/When/Then, behaviour described in business language).

::: text 🧒 In simple words
TDD is like **writing the exam question before teaching the lesson**: first you write "what should happen" (the question), check that nobody can answer it yet (red), teach just enough to answer it (green), then tidy up your notes (refactor).
:::

::: text 📖 Detailed answer
### The loop
1. **Red**: write one small test for the next behaviour; run it; see it fail for the right reason.
2. **Green**: write the minimum code to pass (even hard-coding is fine at first).
3. **Refactor**: remove duplication, improve names and structure; all tests stay green.
4. Next behaviour.

### Benefits and costs
| Benefits | Costs |
|---|---|
| design emerges from usage (good APIs) | slower at first |
| high coverage by construction | hard when requirements are unknown |
| small, safe steps; less debugging | tempting to test implementation if done mechanically |
| regression suite for free | needs discipline in teams |

### Bug-fix TDD (most practical)
Reproduce the bug in a failing test → fix → the test stays forever as a regression guard.

### Interview angle
You don't need to claim you do TDD all the time; explain when you use it and why.
:::

::: diagram The TDD loop
stateDiagram-v2
  [*] --> Red: "write a failing test"
  Red --> Green: "simplest code that passes"
  Green --> Refactor: "clean up, tests stay green"
  Refactor --> Red: "next behaviour"
:::

::: image Test-driven development: red, green, refactor
/images/testing/tdd.svg
:::

::: text 🪜 Step by step
TDD for `slugify("Hello World!")` → `"hello-world"`:
1. Red: `expect(slugify('Hello World')).toBe('hello-world')` fails (function doesn't exist).
2. Green: `return s.toLowerCase().replace(' ', '-')`: passes.
3. Red: add `expect(slugify('Hello  Big World!')).toBe('hello-big-world')`: fails (two spaces, punctuation).
4. Green: `s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`: passes.
5. Refactor: extract the regexes into named constants; tests stay green.
:::

::: code typescript slugify.test.ts written test-first
import { describe, expect, it } from 'vitest';

// The implementation that grew out of the tests below
const NON_ALNUM = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
export function slugify(input: string): string {
  return input.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(NON_ALNUM, '-').replace(EDGE_DASHES, '');
}

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => expect(slugify('Hello World')).toBe('hello-world'));
  it('collapses spaces and drops punctuation', () => expect(slugify('Hello  Big World!')).toBe('hello-big-world'));
  it('trims leading and trailing separators', () => expect(slugify('  --Next.js 16--  ')).toBe('next-js-16'));
  it('removes accents', () => expect(slugify('Crème Brûlée')).toBe('creme-brulee'));
  it('returns an empty string for symbols only', () => expect(slugify('!!!')).toBe(''));
});
:::

::: code javascript The same TDD steps, runnable
const check = (name, actual, expected) => console.log(name, actual === expected ? '✅' : `❌ FAIL (got "${actual}")`);

// Step 2 (first green): handles only the first test
const slugifyV1 = (s) => s.toLowerCase().replace(' ', '-');
check('v1: Hello World', slugifyV1('Hello World'), 'hello-world');
console.log('v1 fails the next test (red):', slugifyV1('Hello  Big World!'));

// Step 4 (green again): general rule
const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
check('v2: Hello World', slugify('Hello World'), 'hello-world');
check('v2: extra spaces + punctuation', slugify('Hello  Big World!'), 'hello-big-world');
check('v2: trims dashes', slugify('  --Next.js 16--  '), 'next-js-16');
check('v2: accents', slugify('Crème Brûlée'), 'creme-brulee');
check('v2: symbols only', slugify('!!!'), '');
:::

::: warning ⚠️ Common mistakes
- Writing many tests up front, then all the code (that's not TDD).
- Skipping the refactor step (code quality decays).
- Never seeing the test fail (it might be testing nothing).
- Forcing TDD on throwaway prototypes.
:::

::: understand
- TDD is a design and feedback loop in tiny steps; the tests are a by-product.
:::

::: ask
- *"Are the requirements clear enough to write the test first?"* If not, spike, then test.
:::

::: important ⭐ Say this in the interview
"TDD is red, green, refactor: write a small failing test for the next behaviour, write the simplest code that passes, then clean up while the tests stay green, and repeat. It makes me design APIs from the caller's point of view and leaves a full regression suite behind. I use it most for pure logic, validation and parsers, and always for bug fixes: first a test that reproduces the bug, then the fix. For exploratory UI work I usually prototype first and add tests once the behaviour is clear."
:::

::: links
Martin Fowler: Test-driven development | https://martinfowler.com/bliki/TestDrivenDevelopment.html
Kent Beck: Canon TDD | https://tidyfirst.substack.com/p/canon-tdd
:::

=== What is code coverage, and is 100% coverage a good goal?
@p 2
@tags testing, coverage, ci, quality
@quick
- **Coverage** measures which code ran during tests: **lines/statements**, **branches** (both sides of `if`, `?:`, `??`), **functions**.
- Measured on the example app (Vitest v8): **97.6%** lines, **89.4%** branches, **100%** functions; the missed branches were fallback/error paths.
- High coverage ≠ good tests: code can run without any meaningful assertion. Coverage shows **what's untested**, not what's correct.
- Use it to find gaps, especially **branch** coverage; set a reasonable CI floor (e.g. 80%) and focus on critical code.
- **Mutation testing** (Stryker) changes your code (e.g. `>` to `>=`) and checks that a test fails: a better measure of test quality.

::: text 🧒 In simple words
Coverage is a **map of which rooms the inspector walked through**. A room marked "visited" doesn't mean the inspector checked the wiring; it just means they walked in. But rooms marked "never visited" are definitely unchecked, and that's the useful part.
:::

::: text 📖 Detailed answer
### The metrics
| Metric | Counts | Catches |
|---|---|---|
| Statements / lines | executed lines | dead or untested code |
| Branches | each path of `if/else`, `switch`, `?:`, `&&`, `??` | missed error and edge paths |
| Functions | functions called at least once | unused/untested functions |

### Measured on the example app (18 tests, `vitest run --coverage`)
| File | Lines | Branches |
|---|---|---|
| all files | 97.56% | 89.36% |
| `server/app.js` | 95.65% | 85.71% |
| `LoginForm.tsx` | 94.44% | 87.5% |
| `UserList.tsx` | 100% | 83.33% |

The uncovered branches were fallback paths (`req.body ?? {}` when there's no body, an early return, the unmount guard in an effect): exactly what coverage is good at pointing out.

### Why 100% isn't the goal
- Diminishing returns: the last 10% is often trivial getters or hard-to-reach error paths.
- It can be gamed: calling code without asserting gives coverage without testing.
- Teams start writing tests for the number instead of for confidence.

### Good practice
- Track coverage in CI, fail on drops (e.g. below 80% or a decrease in changed files).
- Require tests for critical paths (payments, auth) regardless of the global number.
- Review uncovered **branches** during code review.
:::

::: diagram What coverage can and can't tell you
flowchart TD
  C["coverage report"] --> U["uncovered lines and branches: definitely untested"]
  C --> V["covered lines: executed, maybe not verified"]
  V --> M["mutation testing: would a test fail if this line changed?"]
  U --> A["add tests for important gaps"]
:::

::: image Code coverage: useful, but not the goal
/images/testing/coverage.svg
:::

::: chart bar Measured: coverage of the example app (Vitest 5, v8 provider, %)
Metric,Coverage (%)
Lines,97.56
Branches,89.36
Functions,100
:::

::: text 🪜 Step by step
Using coverage in a pull request:
1. CI runs `vitest run --coverage` and uploads the report.
2. The PR adds `applyCoupon` with a new `NEWYEAR` branch.
3. The report shows the January branch uncovered (no test sets the date).
4. Add a test with `vi.setSystemTime(new Date('2027-01-15'))` and one for March.
5. Branch coverage of the file goes up and, more importantly, the date logic is now verified.
:::

::: code typescript vitest.config.ts: coverage with thresholds that fail CI
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**', 'server/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
  },
});
:::

::: code javascript 100% coverage, zero real testing (runnable)
// A function and a "test" that executes every line but checks nothing meaningful.
function discount(total, isMember) {
  if (isMember) return total * 0.8;      // bug: members should get 10%, not 20%
  return total;
}
const executed = new Set();
const traced = (total, isMember) => { executed.add(isMember ? 'member-branch' : 'default-branch'); return discount(total, isMember); };

traced(100, true); traced(100, false);                // both branches run → 100% coverage
console.log('both branches executed (100% coverage)', executed.size === 2 ? '✅' : '❌ FAIL');
console.log('but the bug is still there:', traced(100, true), '(expected 90)');

// A real assertion catches it: this is what matters, not the percentage
const assertion = traced(100, true) === 90;
console.log('a meaningful assertion fails and reveals the bug', assertion === false ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating the coverage percentage as the goal.
- Ignoring branch coverage (line coverage hides missed `else` paths).
- Tests without assertions written to raise the number.
- Excluding hard files from coverage instead of testing them.
:::

::: understand
- Coverage finds untested code; assertions and good test design make tested code trustworthy.
:::

::: ask
- *"Which uncovered branches matter for users?"* Start there, not at 100%.
:::

::: important ⭐ Say this in the interview
"Coverage measures which lines, branches and functions ran during the tests. It's great for finding untested code, especially missed branches like error paths, but it can't tell you whether the executed code was actually verified, since a test without meaningful assertions still counts. So I use it as a signal: a reasonable threshold in CI, extra attention to critical paths, and reviewing uncovered branches in pull requests. On a small example app I measured about 98% lines and 89% branches, and the gaps were exactly the fallback paths. For test quality, mutation testing is a better measure than chasing 100%."
:::

::: links
Vitest: Coverage | https://vitest.dev/guide/coverage
Stryker mutation testing | https://stryker-mutator.io/
Martin Fowler: Test coverage | https://martinfowler.com/bliki/TestCoverage.html
:::
