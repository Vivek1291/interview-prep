@section DSA: Stack, Queue & Linked List
@icon 🥞
@color #ec4899
@desc Tier 5 + Tier 6: LIFO/FIFO, monotonic stack, stack/queue design, and the linked-list pointer problems every interviewer asks. Every problem with pictures, dry runs and tests.

=== Valid Parentheses
@p 3
@tags stack, string, easy
@quick
- **Pattern: stack**: push opening brackets; on a closing bracket the **top must be its partner** → pop.
- Valid only if the stack is **empty at the end**.
- Map closing → opening: `{ ')': '(', ']': '[', '}': '{' }`.
- **O(n) time, O(n) space**. Odd length → false immediately.

::: text 🧾 Problem
Given a string containing only `()[]{}`, return `true` if every bracket is closed by the **same type** of bracket in the **correct order**.

**Example 1:** `"({[]})" → true`
**Example 2:** `"(]" → false`, `"([)]" → false` (closed in the wrong order).

**Constraints:** 1 ≤ length ≤ 10⁴.
:::

::: text 🧒 Intuition
Think of **stacking plates**: every time you open a bracket you put a plate of that colour on the pile. A closing bracket must match the plate **on top** (the most recently opened one), and then you remove it. If the top plate is a different colour, or there's no plate, the string is broken. At the end the pile must be empty.

That "last opened, first closed" rule is exactly **LIFO** (last in, first out), which is what a stack does.
:::

::: text 🐢 Brute force
**Idea:** repeatedly delete adjacent pairs `()`, `[]`, `{}` until nothing changes; valid if the string becomes empty.

`while s contains "()" or "[]" or "{}": remove them`
`return s === ''`

**Complexity:** each pass is O(n) and may remove only one pair → **O(n²)** (e.g. `"((((…))))"` with n = 10⁴ → ~2.5 × 10⁷ character copies). It also creates many new strings.
:::

::: text 💡 Key insight
A closing bracket always closes the **most recent unclosed** opening bracket. "Most recent" = top of a stack. So a single left-to-right pass with a stack checks everything in O(n).

**Pattern name: Stack (LIFO matching).**
:::

::: diagram One pass with a stack
flowchart TD
  S["stack = []"] --> L{"next char c?"}
  L -->|"none"| E{"stack empty?"}
  E -->|"yes"| T["true"]
  E -->|"no"| F["false (unclosed)"]
  L -->|"opening"| P["push c"] --> L
  L -->|"closing"| Q{"top is the partner of c?"}
  Q -->|"yes"| O["pop"] --> L
  Q -->|"no"| F2["false"]
:::

::: image Valid Parentheses: the stack after each character of ({[]})
/images/dsa-stack-linkedlist/valid-parentheses.svg
:::

::: text 🔍 Dry run: "({[]})" and "([)]"
| i | c | type | top before | action | stack after |
|---|---|---|---|---|---|
| 0 | ( | open | – | push | ( |
| 1 | { | open | ( | push | ( { |
| 2 | [ | open | { | push | ( { [ |
| 3 | ] | close | [ | partner ✓ pop | ( { |
| 4 | } | close | { | partner ✓ pop | ( |
| 5 | ) | close | ( | partner ✓ pop | (empty) |

End: empty → **true**. For `"([)]"`: after `(` and `[` the top is `[`, then `)` arrives → top isn't `(` → **false**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Valid Parentheses. Time O(n), Space O(n).
 */
function isValid(s) {
  if (s.length % 2 === 1) return false;              // odd length can never be balanced
  const partner = { ')': '(', ']': '[', '}': '{' };  // closing → its opening bracket
  const stack = [];
  for (const c of s) {
    if (c === '(' || c === '[' || c === '{') {
      stack.push(c);                                 // remember the opening bracket
    } else {
      // closing bracket: the most recent opening bracket must be its partner
      if (stack.length === 0 || stack[stack.length - 1] !== partner[c]) return false;
      stack.pop();                                   // matched → remove it
    }
  }
  return stack.length === 0;                         // anything left was never closed
}

/** Brute force for cross-checking: remove pairs until stable. O(n²). */
function isValidBrute(s) {
  let prev;
  do { prev = s; s = s.replace('()', '').replace('[]', '').replace('{}', ''); } while (s !== prev);
  return s === '';
}

// ---------- tests ----------
const cases = [
  ['({[]})', true],
  ['()[]{}', true],
  ['(]', false],
  ['([)]', false],   // wrong order
  ['((', false],     // never closed
  ['))', false],     // closing with an empty stack
  ['', true],        // nothing to match
  ['{[]}', true],
];
for (const [s, expected] of cases) {
  const got = isValid(s);
  console.log(JSON.stringify(s), '→', got, got === expected && isValidBrute(s) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Character operations: remove pairs repeatedly vs one stack pass (deeply nested input)
n,Remove pairs ~n²/4,Stack n
10,25,10
100,2500,100
1000,250000,1000
10000,25000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Remove pairs until stable | O(n²) | O(n) | Cute one-liner idea | Quadratic, many string copies | Never |
| Counter per type | O(n) | O(1) | Tiny memory | **Wrong**: can't detect `"([)]"` | Only for a single bracket type |
| **Stack** | **O(n)** | O(n) | Correct for all types and nesting | Extra memory for deep nesting | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using **counters** for each bracket type: `"([)]"` has balanced counts but is invalid.
- Popping from an **empty** stack on a closing bracket (`")("`).
- Forgetting the final `stack.length === 0` check (`"(("` would pass).
- Treating other characters: ask whether the string can contain letters (then just skip them).
:::

::: understand
- A stack is the natural tool whenever "the most recent unfinished thing must finish first": parsers, undo history, the JS call stack. Related: [Min Stack](https://leetcode.com/problems/min-stack/), [Evaluate Reverse Polish Notation](https://leetcode.com/problems/evaluate-reverse-polish-notation/), [Generate Parentheses](https://leetcode.com/problems/generate-parentheses/), [Minimum Remove to Make Valid Parentheses](https://leetcode.com/problems/minimum-remove-to-make-valid-parentheses/).
:::

::: ask
- *"Only the six bracket characters, or other characters too?"*
- *"Is an empty string valid?"*
- *"Return true/false, or the index of the first error?"*
:::

::: important ⭐ How to explain it in the interview
> "A closing bracket must match the most recently opened one, which is a last-in-first-out rule, so I use a stack. I push opening brackets; for a closing bracket I check that the stack isn't empty and its top is the matching opener, then pop. At the end the stack must be empty. One pass: O(n) time, O(n) space. Simple counters don't work because they can't detect wrong ordering like '([)]'."
:::

::: links
LeetCode 20: Valid Parentheses | https://leetcode.com/problems/valid-parentheses/
NeetCode video: Valid Parentheses | https://www.youtube.com/results?search_query=neetcode+valid+parentheses
VisuAlgo: stack | https://visualgo.net/en/list
:::

=== Daily Temperatures (monotonic stack)
@p 3
@tags monotonic-stack, medium
@quick
- **Pattern: monotonic decreasing stack of indices** still waiting for a warmer day.
- When today is warmer than the top: pop it and set `answer[top] = today − top`.
- Each index is pushed once and popped once → **O(n) time**, O(n) space.
- Days never popped keep answer 0.

::: text 🧾 Problem
Given daily temperatures, return an array `answer` where `answer[i]` is the **number of days you have to wait** after day `i` for a warmer temperature. If there's no warmer day later, `answer[i] = 0`.

**Example 1:** `[73,74,75,71,69,72,76,73] → [1,1,4,2,1,1,0,0]`
**Example 2:** `[30,40,50,60] → [1,1,1,0]`

**Constraints:** 1 ≤ n ≤ 10⁵, 30 ≤ temperature ≤ 100.
:::

::: text 🧒 Intuition
Imagine a **queue of people at a bus stop waiting for a taller person** to arrive (taller = warmer). Each new arrival looks at the people still waiting at the back of the queue: everyone shorter than the newcomer has their wish granted and leaves (we write down how long they waited). People taller than the newcomer keep waiting. The ones waiting always stand in **decreasing** height order, which is why it's called a **monotonic** stack.
:::

::: text 🐢 Brute force
**Idea:** for each day, scan forward until a warmer day.

`for i in 0..n-1:`
↳ `for j in i+1..n-1: if t[j] > t[i]: answer[i] = j - i; break`

**Complexity:** O(n²) in the worst case (temperatures that only fall). For n = 10⁵ → ~5 × 10⁹ comparisons. We re-scan the same future days for many different i.
:::

::: text 💡 Key insight
Process days left to right and keep the **days still waiting** on a stack. A new day can only resolve waiting days that are **colder** than it, and those are exactly the ones at the top (the stack stays decreasing). So each day is pushed once and popped once: O(n) total, even though there's a `while` inside the `for`.

**Pattern name: Monotonic stack ("next greater element").**
:::

::: diagram Monotonic decreasing stack
flowchart TD
  S["stack = [] (indices), answer = zeros"] --> L{"day i"}
  L --> W{"stack not empty and t[i] > t[top]?"}
  W -->|"yes"| P["j = pop(), answer[j] = i - j"] --> W
  W -->|"no"| U["push i"] --> L
  L -->|"all days done"| R["return answer (the rest stay 0)"]
:::

::: image Daily Temperatures: 72 pops the waiting days 69 and 71
/images/dsa-stack-linkedlist/daily-temperatures.svg
:::

::: text 🔍 Dry run: [73,74,75,71,69,72,76,73]
| i | t[i] | popped (index: wait) | stack after (index:temp) |
|---|---|---|---|
| 0 | 73 | – | 0:73 |
| 1 | 74 | 0: 1 | 1:74 |
| 2 | 75 | 1: 1 | 2:75 |
| 3 | 71 | – | 2:75, 3:71 |
| 4 | 69 | – | 2:75, 3:71, 4:69 |
| 5 | 72 | 4: 1, 3: 2 | 2:75, 5:72 |
| 6 | 76 | 5: 1, 2: 4 | 6:76 |
| 7 | 73 | – | 6:76, 7:73 |

Indices 6 and 7 are never popped → 0. Answer: `[1,1,4,2,1,1,0,0]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Daily Temperatures with a monotonic decreasing stack of indices.
 * Time O(n): every index is pushed once and popped at most once. Space O(n).
 */
function dailyTemperatures(t) {
  const answer = new Array(t.length).fill(0); // default 0 = no warmer day
  const stack = [];                           // indices of days still waiting (temps decreasing)
  for (let i = 0; i < t.length; i++) {
    // today is warmer than the waiting days on top → their wait is over
    while (stack.length && t[i] > t[stack[stack.length - 1]]) {
      const j = stack.pop();
      answer[j] = i - j;                      // days waited
    }
    stack.push(i);                            // today now waits for its own warmer day
  }
  return answer;
}

/** Brute force for cross-checking: O(n²). */
function dailyTemperaturesBrute(t) {
  return t.map((x, i) => { for (let j = i + 1; j < t.length; j++) if (t[j] > x) return j - i; return 0; });
}

// ---------- tests ----------
const cases = [
  [[73, 74, 75, 71, 69, 72, 76, 73], [1, 1, 4, 2, 1, 1, 0, 0]],
  [[30, 40, 50, 60], [1, 1, 1, 0]],       // rising
  [[60, 50, 40, 30], [0, 0, 0, 0]],       // falling: nobody gets a warmer day
  [[70, 70, 71], [2, 1, 0]],              // equal is NOT warmer
  [[50], [0]],
];
for (const [t, expected] of cases) {
  const got = dailyTemperatures(t);
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(dailyTemperaturesBrute(t)) === JSON.stringify(expected);
  console.log(JSON.stringify(t), '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Comparisons (worst case): scan forward from each day vs monotonic stack
n,Scan forward ~n²/2,Monotonic stack ~2n
10,50,20
100,5000,200
1000,500000,2000
10000,50000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Scan forward per day | O(n²) | O(1) | Obvious | Slow for falling temperatures | First idea |
| **Monotonic stack (left → right)** | **O(n)** | O(n) | Optimal, general pattern | Needs the "waiting list" idea | Default answer |
| Right → left with jumps (`j += answer[j]`) | O(n) | O(1) extra | No stack | Trickier to explain | Follow-up for O(1) extra space |
| Array of next-seen index per temperature (30–100) | O(n · 71) | O(71) | Uses the small range | Only works for bounded values | Values are tiny integers |
:::

::: warning ⚠️ Common mistakes / edge cases
- Storing **temperatures** on the stack instead of **indices** (you need indices to compute the wait).
- Using `>=` instead of `>`: equal temperatures are not warmer.
- Thinking the nested `while` makes it O(n²): count pushes and pops instead (each at most n).
- Forgetting the days left on the stack (they stay 0).
:::

::: understand
- The **monotonic stack** answers "next greater / next smaller element" questions in O(n). Related: [Next Greater Element I](https://leetcode.com/problems/next-greater-element-i/), [Next Greater Element II](https://leetcode.com/problems/next-greater-element-ii/) (circular), [Largest Rectangle in Histogram](https://leetcode.com/problems/largest-rectangle-in-histogram/), [Online Stock Span](https://leetcode.com/problems/online-stock-span/).
:::

::: ask
- *"Does 'warmer' mean strictly greater?"*
- *"Return the number of days or the index of the warmer day?"*
- *"What if there's no warmer day?"* (0.)
:::

::: important ⭐ How to explain it in the interview
> "Brute force scans forward from each day: O(n²). Instead I keep a stack of indices of days still waiting for a warmer temperature; their temperatures are decreasing from bottom to top. For each new day, while it's warmer than the day on top, I pop that index and record the difference in days. Then I push today. Every index is pushed and popped at most once, so it's O(n) time and O(n) space. Days left on the stack keep 0."
:::

::: links
LeetCode 739: Daily Temperatures | https://leetcode.com/problems/daily-temperatures/
NeetCode video: Daily Temperatures | https://www.youtube.com/results?search_query=neetcode+daily+temperatures
:::

=== Next Greater Element
@p 2
@tags monotonic-stack, hashmap, easy
@quick
- Precompute "next greater" for every value of `nums2` with a **monotonic stack**, store in a **Map**, then answer `nums1` by lookup.
- **O(n + m) time**, O(n) space (brute force O(n · m)).
- Values are distinct, so a value → answer Map works.
- Circular variant (II): loop twice over the array (`i % n`).

::: text 🧾 Problem
`nums1` is a subset of `nums2` (all values distinct). For each `x` in `nums1`, find the **first element to the right of x in nums2 that is greater than x**, or `-1` if none.

**Example 1:** `nums1 = [4,1,2], nums2 = [1,3,4,2] → [-1,3,-1]`
**Example 2:** `nums1 = [2,4], nums2 = [1,2,3,4] → [3,-1]`

**Constraints:** 1 ≤ m ≤ n ≤ 1000, distinct values.
:::

::: text 🧒 Intuition
Picture people standing in a line (nums2), each looking to their **right** for the first person taller than them. If we walk the line once and keep a "still searching" group, every new person instantly answers the question for all the shorter people in that group. We write those answers into a phone book (Map), and later anyone in nums1 just looks up their own name.
:::

::: text 🐢 Brute force
**Idea:** for each x in nums1, find x in nums2, then scan right for the first bigger value.

`for x of nums1: i = nums2.indexOf(x); scan nums2[i+1..] for a value > x`

**Complexity:** O(m · n): fine for 1000, but 10⁸ for n = m = 10⁴, and it repeats the same scans.
:::

::: text 💡 Key insight
The "next greater" of every value in nums2 can be computed **once** in O(n) with a monotonic decreasing stack (same idea as Daily Temperatures, but we record the **value**, not the distance). Store it in a Map value → next greater; each query becomes O(1).

**Pattern name: Monotonic stack + hash map.**
:::

::: diagram Precompute, then look up
flowchart LR
  A["for x of nums2"] --> B{"stack top < x?"}
  B -->|"yes"| C["next[pop()] = x"] --> B
  B -->|"no"| D["push x"] --> A
  A -->|"done"| E["remaining on stack → -1"]
  E --> F["answer = nums1.map(x → next[x])"]
:::

::: image Next Greater Element: in 1 3 4 2 the next greater of 1 is 3, of 3 is 4, others -1
/images/dsa-stack-linkedlist/next-greater.svg
:::

::: text 🔍 Dry run: nums2 = [1, 3, 4, 2]
| x | pops (value → next greater) | stack after |
|---|---|---|
| 1 | – | [1] |
| 3 | 1 → 3 | [3] |
| 4 | 3 → 4 | [4] |
| 2 | – (2 < 4) | [4, 2] |
| end | 4 → −1, 2 → −1 | [] |

Map: {1: 3, 3: 4, 4: −1, 2: −1}. Queries `[4, 1, 2]` → `[-1, 3, -1]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Next Greater Element I. Time O(n + m), Space O(n).
 */
function nextGreaterElement(nums1, nums2) {
  const next = new Map();       // value → its next greater value in nums2
  const stack = [];             // values still waiting, decreasing from bottom to top
  for (const x of nums2) {
    while (stack.length && stack[stack.length - 1] < x) {
      next.set(stack.pop(), x); // x is the first greater value to the right of the popped one
    }
    stack.push(x);
  }
  for (const v of stack) next.set(v, -1); // nobody greater came after them
  return nums1.map((x) => next.get(x));   // O(1) per query
}

/** Variant II: circular array, answer for every index. Loop twice. */
function nextGreaterCircular(nums) {
  const n = nums.length, ans = new Array(n).fill(-1), stack = []; // stack of indices
  for (let k = 0; k < 2 * n; k++) {
    const i = k % n;
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) ans[stack.pop()] = nums[i];
    if (k < n) stack.push(i);   // only push during the first lap
  }
  return ans;
}

/** Brute force for cross-checking. */
const nextGreaterBrute = (nums1, nums2) => nums1.map((x) => {
  for (let i = nums2.indexOf(x) + 1; i < nums2.length; i++) if (nums2[i] > x) return nums2[i];
  return -1;
});

// ---------- tests ----------
const cases = [
  [[4, 1, 2], [1, 3, 4, 2], [-1, 3, -1]],
  [[2, 4], [1, 2, 3, 4], [3, -1]],
  [[5], [5], [-1]],
  [[3, 1], [3, 2, 1], [-1, -1]],   // strictly decreasing
];
for (const [a, b, expected] of cases) {
  const got = nextGreaterElement(a, b);
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(nextGreaterBrute(a, b)) === JSON.stringify(expected);
  console.log(JSON.stringify(a), JSON.stringify(b), '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
const c = nextGreaterCircular([1, 2, 1]);
console.log('circular [1,2,1] →', JSON.stringify(c), JSON.stringify(c) === '[2,-1,2]' ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons (m = n): scan per query vs stack + map
n,Scan per query n·m,Stack + map n + m
10,100,20
100,10000,200
1000,1000000,2000
10000,100000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| indexOf + scan right per query | O(n · m) | O(1) | Simple | Repeats work | Tiny inputs |
| **Monotonic stack + Map** | **O(n + m)** | O(n) | Optimal, reusable for many queries | Needs distinct values for the Map | Default answer |
| Stack of indices + array answer | O(n) | O(n) | Works with duplicates | Answers by index, not value | Variant II / duplicates |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using the Map approach when values can **repeat** (then key by index).
- Forgetting to set `-1` for values left on the stack.
- In the circular version, pushing indices during the **second** lap (duplicates on the stack).
- Comparing with `<=` vs `<`: "greater" means strictly greater.
:::

::: understand
- Same monotonic-stack core as [Daily Temperatures](https://leetcode.com/problems/daily-temperatures/); also [Next Greater Element II](https://leetcode.com/problems/next-greater-element-ii/) and [Next Greater Node In Linked List](https://leetcode.com/problems/next-greater-node-in-linked-list/).
- "Precompute once, answer many queries with a Map" is a general speed-up.
:::

::: ask
- *"Are all values distinct?"*
- *"Is the array circular?"*
- *"Return the value, the index, or the distance?"*
:::

::: important ⭐ How to explain it in the interview
> "I precompute the next greater value for every element of nums2 in one pass with a monotonic decreasing stack: when a new value is bigger than the top, it's the answer for the popped value, which I store in a map. Values left on the stack get −1. Then each query from nums1 is a map lookup. O(n + m) time, O(n) space, versus O(n·m) for scanning per query."
:::

::: links
LeetCode 496: Next Greater Element I | https://leetcode.com/problems/next-greater-element-i/
LeetCode 503: Next Greater Element II | https://leetcode.com/problems/next-greater-element-ii/
NeetCode video: Next Greater Element | https://www.youtube.com/results?search_query=neetcode+next+greater+element
:::

=== Min Stack
@p 2
@tags stack, design, medium
@quick
- Design: `push`, `pop`, `top`, `getMin` **all O(1)**.
- Keep a **second stack of minimums**: push `min(x, currentMin)` with every push; pop both together.
- Alternative: store pairs `[value, minSoFar]` in one stack.
- Space O(n) extra (one min per element).

::: text 🧾 Problem
Design a stack that supports `push(x)`, `pop()`, `top()` and `getMin()` (the smallest element currently in the stack), **each in O(1) time**.

**Example:** `push(-2), push(0), push(-3), getMin() → -3, pop(), top() → 0, getMin() → -2`

**Constraints:** up to 3 × 10⁴ calls; `pop`, `top`, `getMin` are only called on a non-empty stack.
:::

::: text 🧒 Intuition
Imagine a **stack of boxes**, and on each box you write a sticky note: *"the lightest box from here down is X kg"*. When you add a box, its note is the lighter of its own weight and the note on the box below. To know the lightest box in the whole stack, you just read the note on the **top** box. When you remove the top box, the next note is already correct, because it was written when that box was the top.
:::

::: text 🐢 Brute force
**Idea:** a normal array; `getMin()` scans all elements with `Math.min(...stack)`.

**Complexity:** push/pop/top O(1), but **getMin O(n)**. With 3 × 10⁴ calls on a big stack that's up to ~10⁹ steps, and it breaks the O(1) requirement.

**Another wrong idea:** keep one `min` variable. It fails on `pop()`: if you pop the minimum, you don't know the previous minimum without scanning.
:::

::: text 💡 Key insight
The minimum of the stack only depends on **what's below the top**, and the stack only changes at the top. So remember, **for every level**, the minimum of that level and everything below it. A parallel "min stack" stores exactly that; push and pop it together with the main stack.

**Pattern name: Auxiliary stack (store extra state per level).**
:::

::: diagram Two stacks moving together
flowchart LR
  P["push(x)"] --> P1["values.push(x)"]
  P --> P2["mins.push(min(x, mins.top or x))"]
  O["pop()"] --> O1["values.pop() and mins.pop()"]
  G["getMin()"] --> G1["return mins.top"]
  T["top()"] --> T1["return values.top"]
:::

::: image Min Stack: values 5 3 7 2 with a min stack 5 3 3 2
/images/dsa-stack-linkedlist/min-stack.svg
:::

::: text 🔍 Dry run: push(5), push(3), push(7), push(2), getMin, pop, getMin
| Operation | values (bottom → top) | mins (bottom → top) | returns |
|---|---|---|---|
| push(5) | 5 | 5 | |
| push(3) | 5, 3 | 5, 3 | |
| push(7) | 5, 3, 7 | 5, 3, 3 | |
| push(2) | 5, 3, 7, 2 | 5, 3, 3, 2 | |
| getMin() | | | **2** |
| pop() | 5, 3, 7 | 5, 3, 3 | |
| getMin() | | | **3** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Min Stack: every operation O(1). Space O(n).
 */
class MinStack {
  constructor() {
    this.values = []; // the normal stack
    this.mins = [];   // mins[i] = smallest value among values[0..i]
  }
  push(x) {
    this.values.push(x);
    const currentMin = this.mins.length ? this.mins[this.mins.length - 1] : x;
    this.mins.push(Math.min(x, currentMin)); // the new level's minimum
  }
  pop() {
    this.mins.pop();             // both stacks always have the same height
    return this.values.pop();
  }
  top() {
    return this.values[this.values.length - 1];
  }
  getMin() {
    return this.mins[this.mins.length - 1];
  }
}

// ---------- tests ----------
const s = new MinStack();
s.push(-2); s.push(0); s.push(-3);
const checks = [];
checks.push(['getMin after -2,0,-3', s.getMin(), -3]);
s.pop();
checks.push(['top after pop', s.top(), 0]);
checks.push(['getMin after pop', s.getMin(), -2]);

const t = new MinStack();
[5, 3, 7, 2].forEach((x) => t.push(x));
checks.push(['getMin of 5,3,7,2', t.getMin(), 2]);
t.pop();
checks.push(['getMin after popping 2', t.getMin(), 3]);
t.push(3); t.push(3);            // duplicates of the minimum
t.pop();
checks.push(['duplicate minimum still 3', t.getMin(), 3]);

for (const [label, got, expected] of checks) console.log(label, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
:::

::: chart line Steps for n getMin() calls on a stack of size n: scan every time vs min stack
n,Scan each time n²,Min stack n
10,100,10
100,10000,100
1000,1000000,1000
10000,100000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | push | pop | getMin | Extra space | Notes |
|---|---|---|---|---|---|
| Scan on getMin | O(1) | O(1) | O(n) | O(1) | Fails the requirement |
| Single `min` variable | O(1) | **O(n)** on popping the min | O(1) | O(1) | Must rescan after popping the min |
| **Parallel min stack** | **O(1)** | **O(1)** | **O(1)** | O(n) | Simplest correct design |
| Pairs `[value, min]` in one stack | O(1) | O(1) | O(1) | O(n) | Same idea, one array |
| Min stack only on new minimums (≤) | O(1) | O(1) | O(1) | O(n) worst, less on average | Must push on `<=` to handle duplicates |
| Store differences `x − min` | O(1) | O(1) | O(1) | O(1) extra | Clever but overflow-prone in other languages |
:::

::: warning ⚠️ Common mistakes / edge cases
- Tracking one `min` variable: after popping the minimum you've lost the previous one.
- In the "push only new minimums" variant, using `<` instead of `<=`: duplicates of the minimum break `pop`.
- Forgetting to pop the min stack when popping the value stack.
- Calling `getMin` on an empty stack (ask what should happen).
:::

::: understand
- "Store extra information alongside each element so queries stay O(1)" is a common design trick: [Max Stack](https://leetcode.com/problems/max-stack/), [Online Stock Span](https://leetcode.com/problems/online-stock-span/), and the queue version [Sliding Window Maximum](https://leetcode.com/problems/sliding-window-maximum/) (monotonic deque).
:::

::: ask
- *"Can pop/top/getMin be called on an empty stack? What should happen?"*
- *"Is extra memory acceptable?"*
- *"Do you also need getMax?"*
:::

::: important ⭐ How to explain it in the interview
> "A single min variable breaks when the minimum is popped. So next to the value stack I keep a min stack where each level stores the minimum of that level and everything below. On push I push min(x, current min); on pop I pop both. getMin just reads the top of the min stack. Every operation is O(1), at the cost of O(n) extra space."
:::

::: links
LeetCode 155: Min Stack | https://leetcode.com/problems/min-stack/
NeetCode video: Min Stack | https://www.youtube.com/results?search_query=neetcode+min+stack
:::

=== Implement Queue using Stacks
@p 2
@tags queue, stack, design, easy
@quick
- Two stacks: **`in`** for push, **`out`** for pop/peek.
- When `out` is empty, **pour everything** from `in` into `out` (this reverses the order → oldest on top).
- Each element moves at most once → **amortised O(1)** per operation.
- `empty()` = both stacks empty.

::: text 🧾 Problem
Implement a FIFO **queue** (`push` to the back, `pop`/`peek` from the front, `empty`) using **only stack operations** (push to top, pop from top, peek top, size, isEmpty).

**Example:** `push(1), push(2), peek() → 1, pop() → 1, empty() → false`

**Constraints:** up to 100 calls (follow-up: amortised O(1) per operation).
:::

::: text 🧒 Intuition
You have two **buckets of tennis balls** and can only take balls from the top of a bucket. New balls go into bucket A. When someone wants the **oldest** ball, it's at the bottom of A. So pour all of A into bucket B: the order flips and the oldest ball is now on top of B. Keep serving from B until it's empty, and only then pour again.
:::

::: text 🐢 Brute force
**Idea:** one stack for storage. To pop the front, move everything to a helper stack, pop the bottom one, then move everything **back**.

**Complexity:** **O(n) for every pop/peek** (2n moves). For n pushes followed by n pops that's O(n²). The waste: moving everything back undoes the reversal we just paid for.
:::

::: text 💡 Key insight
Don't move elements back. After pouring, the `out` stack is already in queue order, so it can serve many pops. Each element is pushed to `in` once, moved to `out` once, and popped once: **3 operations per element**, so the **average** cost per operation is O(1) (amortised), even though one particular pop may move many elements.

**Pattern name: Two stacks (amortised reversal).**
:::

::: diagram Push to in, pop from out
flowchart TD
  PU["push(x)"] --> IN["in.push(x)"]
  PO["pop() / peek()"] --> E{"out empty?"}
  E -->|"yes"| M["while in not empty: out.push(in.pop())"]
  E -->|"no"| R["out.pop() / out.top"]
  M --> R
:::

::: image Queue using two stacks: in holds 3 and 4, out holds 1 on top of 2
/images/dsa-stack-linkedlist/queue-two-stacks.svg
:::

::: text 🔍 Dry run: push 1, push 2, pop, push 3, push 4, pop, pop
| Operation | in (bottom → top) | out (bottom → top) | returns |
|---|---|---|---|
| push(1) | 1 | – | |
| push(2) | 1, 2 | – | |
| pop() | – (poured) | 2, 1 → pop 1 → 2 | **1** |
| push(3) | 3 | 2 | |
| push(4) | 3, 4 | 2 | |
| pop() | 3, 4 | out not empty → pop 2 | **2** |
| pop() | – (poured) | 4, 3 → pop 3 → 4 | **3** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Queue built from two stacks. push O(1); pop/peek amortised O(1).
 */
class MyQueue {
  constructor() {
    this.in = [];   // receives new elements (newest on top)
    this.out = [];  // serves old elements (oldest on top)
  }
  push(x) {
    this.in.push(x);
  }
  #refill() {
    if (this.out.length === 0) {
      while (this.in.length) this.out.push(this.in.pop()); // pouring reverses the order
    }
  }
  pop() {
    this.#refill();
    return this.out.pop();
  }
  peek() {
    this.#refill();
    return this.out[this.out.length - 1];
  }
  empty() {
    return this.in.length === 0 && this.out.length === 0;
  }
}

// ---------- tests ----------
const q = new MyQueue();
const log = [];
q.push(1); q.push(2);
log.push(['peek', q.peek(), 1]);
log.push(['pop', q.pop(), 1]);
q.push(3); q.push(4);
log.push(['pop', q.pop(), 2]);
log.push(['pop', q.pop(), 3]);
log.push(['empty?', q.empty(), false]);
log.push(['pop', q.pop(), 4]);
log.push(['empty?', q.empty(), true]);
for (const [op, got, expected] of log) console.log(op, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);

// amortised check: 100,000 pushes then pops → each element moved exactly once
const big = new MyQueue();
for (let i = 0; i < 100000; i++) big.push(i);
let ok = true;
for (let i = 0; i < 100000; i++) if (big.pop() !== i) ok = false;
console.log('100,000 elements come out in FIFO order', ok ? '✅' : '❌ FAIL');
:::

::: chart line Element moves for n pushes then n pops: move back every time vs two stacks
n,Move back each pop ~n²,Two stacks ~3n
10,100,30
100,10000,300
1000,1000000,3000
10000,100000000,30000
:::

::: text ⚖️ Trade-offs
| Approach | push | pop / peek | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| One stack, move all and back on pop | O(1) | O(n) | Simple | Quadratic overall | Never |
| Make push expensive (keep oldest on top) | O(n) | O(1) | Predictable pops | Every push costs n | When pops must be worst-case O(1) |
| **Two stacks, lazy pour** | **O(1)** | **amortised O(1)** | Optimal overall | One pop can be O(n) | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Pouring **every** time (even when `out` isn't empty): breaks the FIFO order.
- Moving elements **back** to `in` after popping (that's the slow version).
- `empty()` checking only one stack.
- Confusing "amortised O(1)" with "worst-case O(1)": say which one you mean.
:::

::: understand
- **Amortised analysis**: count the total work over many operations and divide. Each element is moved at most once, so total work is O(n) for n operations.
- Related design problems: [Implement Stack using Queues](https://leetcode.com/problems/implement-stack-using-queues/), [Design Circular Queue](https://leetcode.com/problems/design-circular-queue/), [Min Stack](https://leetcode.com/problems/min-stack/).
- In real JavaScript, avoid `array.shift()` for big queues (it's O(n)); use two stacks, a head index, or a linked list.
:::

::: ask
- *"Amortised O(1) acceptable, or must each operation be worst-case O(1)?"*
- *"Will pop/peek be called on an empty queue?"*
:::

::: important ⭐ How to explain it in the interview
> "I use two stacks: pushes go onto the 'in' stack. For pop or peek, if the 'out' stack is empty I pour everything from 'in' into 'out', which reverses the order so the oldest element is on top; then I pop or peek from 'out'. I never move elements back. Each element is pushed, moved and popped once, so operations are amortised O(1), with O(n) space."
:::

::: links
LeetCode 232: Implement Queue using Stacks | https://leetcode.com/problems/implement-queue-using-stacks/
NeetCode video: Implement Queue using Stacks | https://www.youtube.com/results?search_query=neetcode+implement+queue+using+stacks
:::

=== Implement Stack using Queues
@p 1
@tags stack, queue, design, easy
@quick
- One queue: after `push(x)`, **rotate** the older `n − 1` elements behind x → x is at the front.
- `pop()` / `top()` read the **front**: O(1). `push` is **O(n)**.
- Two-queue version: same costs, more code.
- Mostly a design warm-up: shows you understand LIFO vs FIFO.

::: text 🧾 Problem
Implement a LIFO **stack** (`push`, `pop`, `top`, `empty`) using only **queue** operations (push to back, pop from front, peek front, size, isEmpty).

**Example:** `push(1), push(2), top() → 2, pop() → 2, empty() → false`

**Constraints:** up to 100 calls.
:::

::: text 🧒 Intuition
A queue is a **line at a shop**: people leave from the front. To make the newest person leave first (stack behaviour), every time someone new joins, everyone who was already in line walks to the back **behind** the newcomer. Now the newcomer is at the front and leaves first.
:::

::: text 🐢 Brute force
**Idea:** push is O(1) (just enqueue); for pop, dequeue n − 1 elements into a second queue, take the last one, then swap the queues.

**Complexity:** push O(1), **pop O(n)** and top O(n). Either push or pop has to pay O(n); there's no amortised trick like the reverse problem, because moving elements through a queue doesn't reverse their order.
:::

::: text 💡 Key insight
Pay the cost on `push`: after enqueueing x, rotate (dequeue + enqueue) the `size − 1` older elements. The queue's front is then always the most recent element, so `pop` and `top` are O(1).

**Pattern name: Queue rotation.**
:::

::: diagram Rotate after every push
flowchart LR
  A["push(x): q.enqueue(x)"] --> B["repeat size - 1 times: q.enqueue(q.dequeue())"]
  B --> C["front of q = x (newest)"]
  D["pop(): q.dequeue()"] --> C
:::

::: image Stack using a queue: the newest element is rotated to the front
/images/dsa-stack-linkedlist/stack-two-queues.svg
:::

::: text 🔍 Dry run: push 1, push 2, push 3, pop, top
| Operation | queue (front → back) after | returns |
|---|---|---|
| push(1) | [1] | |
| push(2) | [1, 2] → rotate 1 → [2, 1] | |
| push(3) | [2, 1, 3] → rotate 2 → [3, 2, 1] | |
| pop() | [2, 1] | **3** |
| top() | [2, 1] | **2** |
:::

::: code javascript Optimal solution with tests (runnable)
/** A tiny FIFO queue with O(1) enqueue/dequeue (head index instead of array.shift). */
class Queue {
  constructor() { this.items = []; this.head = 0; }
  enqueue(x) { this.items.push(x); }
  dequeue() { const x = this.items[this.head]; this.head++; if (this.head > 64 && this.head * 2 > this.items.length) { this.items = this.items.slice(this.head); this.head = 0; } return x; }
  front() { return this.items[this.head]; }
  size() { return this.items.length - this.head; }
}

/**
 * Stack built from ONE queue. push O(n), pop/top O(1).
 */
class MyStack {
  constructor() { this.q = new Queue(); }
  push(x) {
    this.q.enqueue(x);
    for (let i = 0; i < this.q.size() - 1; i++) {
      this.q.enqueue(this.q.dequeue()); // move older elements behind x
    }
  }
  pop() { return this.q.dequeue(); }   // the front is the newest element
  top() { return this.q.front(); }
  empty() { return this.q.size() === 0; }
}

// ---------- tests ----------
const s = new MyStack();
s.push(1); s.push(2);
const checks = [['top', s.top(), 2], ['pop', s.pop(), 2], ['empty?', s.empty(), false]];
s.push(3); s.push(4);
checks.push(['pop', s.pop(), 4], ['pop', s.pop(), 3], ['pop', s.pop(), 1], ['empty?', s.empty(), true]);
for (const [op, got, expected] of checks) console.log(op, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
:::

::: chart line Element moves for n pushes: rotate on push (≈ n²/2) vs an array-backed stack (n)
n,Queue-based stack pushes ~n²/2,Real stack pushes n
10,45,10
100,4950,100
1000,499500,1000
:::

::: text ⚖️ Trade-offs
| Approach | push | pop / top | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Two queues, expensive pop | O(1) | O(n) | Cheap pushes | Every pop/top is slow | Push-heavy workloads |
| Two queues, expensive push | O(n) | O(1) | Cheap reads | Extra queue | Equivalent to the one-queue version |
| **One queue, rotate on push** | **O(n)** | **O(1)** | Least code | Pushes are slow | Default answer |
| Just use an array | O(1) | O(1) | Real-world answer | Not the exercise | Production code |
:::

::: warning ⚠️ Common mistakes / edge cases
- Rotating `size` times instead of `size − 1` (x ends up at the back again).
- Using `array.shift()` as the queue and claiming O(1) dequeue (it's O(n) in JS).
- Forgetting `empty()`.
:::

::: understand
- This is the mirror of [Implement Queue using Stacks](https://leetcode.com/problems/implement-queue-using-stacks/), but here no amortised trick exists: one side must pay O(n).
- Knowing which data structure gives O(1) at which end (stack: one end, queue: both ends, deque: both ends both ways) helps in [Sliding Window Maximum](https://leetcode.com/problems/sliding-window-maximum/) and BFS.
:::

::: ask
- *"Which operation should be fast: push or pop?"*
- *"May I use one queue or must I use two?"*
:::

::: important ⭐ How to explain it in the interview
> "A queue serves the oldest element first, so to make it behave like a stack I move the newest element to the front. After enqueueing x, I rotate the previous size − 1 elements from the front to the back. Then pop and top just read the front in O(1), and push costs O(n). The alternative is cheap push and expensive pop; I'd pick based on which operation is more frequent."
:::

::: links
LeetCode 225: Implement Stack using Queues | https://leetcode.com/problems/implement-stack-using-queues/
NeetCode video: Implement Stack using Queues | https://www.youtube.com/results?search_query=neetcode+implement+stack+using+queues
:::

=== Evaluate Reverse Polish Notation
@p 1
@tags stack, math, medium
@quick
- **Stack**: number → push; operator → pop `b`, pop `a`, push `a op b` (order matters for `-` and `/`).
- Division **truncates toward zero**: `Math.trunc(a / b)`.
- The answer is the single value left on the stack. **O(n) time, O(n) space**.
- RPN = postfix: no parentheses needed, which is why calculators and compilers use it.

::: text 🧾 Problem
Evaluate an arithmetic expression in **Reverse Polish Notation** (postfix): operators come **after** their two operands. Valid operators: `+ - * /`; division truncates toward zero.

**Example 1:** `["2","1","+","3","*"] → 9` (that's `(2 + 1) * 3`).
**Example 2:** `["4","13","5","/","+"] → 6` (that's `4 + 13 / 5 = 4 + 2`).

**Constraints:** 1 ≤ tokens ≤ 10⁴, always a valid expression, no division by zero.
:::

::: text 🧒 Intuition
Think of a **kitchen counter**: each number is an ingredient you put on the counter. Each operator is a recipe step that takes the **two most recent** ingredients, combines them, and puts the result back. At the end exactly one dish is left: the answer. "Most recent" again means a stack.
:::

::: text 🐢 Brute force
**Idea:** find the first operator, replace `[a, b, op]` in the token array with the result, and repeat.

`while tokens.length > 1: find first operator at i; tokens.splice(i - 2, 3, apply(...))`

**Complexity:** each step scans and splices (O(n)) and removes 2 tokens → **O(n²)** (~2.5 × 10⁷ for n = 10⁴).
:::

::: text 💡 Key insight
In postfix, an operator always applies to the **two most recently produced values**. A stack keeps exactly those on top, so each token is handled in O(1).

**Pattern name: Stack (expression evaluation).**
:::

::: diagram Evaluate with a stack
flowchart TD
  S["stack = []"] --> L{"next token"}
  L -->|"number"| P["push Number(token)"] --> L
  L -->|"operator"| O["b = pop(), a = pop()"]
  O --> A["push(a op b), division: Math.trunc"] --> L
  L -->|"done"| R["return pop()"]
:::

::: image Evaluate RPN: tokens 2 1 + 3 * evaluate to 9
/images/dsa-stack-linkedlist/rpn.svg
:::

::: text 🔍 Dry run: ["4","13","5","/","+"]
| token | action | stack after |
|---|---|---|
| 4 | push | [4] |
| 13 | push | [4, 13] |
| 5 | push | [4, 13, 5] |
| / | b = 5, a = 13 → trunc(13 / 5) = 2 | [4, 2] |
| + | b = 2, a = 4 → 6 | [6] |

Answer **6**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Evaluate Reverse Polish Notation. Time O(n), Space O(n).
 */
function evalRPN(tokens) {
  const stack = [];
  const ops = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => Math.trunc(a / b), // truncate toward zero (-7 / 2 → -3, not -4)
  };
  for (const tok of tokens) {
    if (tok in ops) {
      const b = stack.pop();          // second operand (pushed last)
      const a = stack.pop();          // first operand
      stack.push(ops[tok](a, b));     // order matters for - and /
    } else {
      stack.push(Number(tok));        // a number (can be negative like "-11")
    }
  }
  return stack.pop();
}

// ---------- tests ----------
const cases = [
  [['2', '1', '+', '3', '*'], 9],
  [['4', '13', '5', '/', '+'], 6],
  [['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+'], 22],
  [['7', '-2', '/'], -3],   // truncation toward zero
  [['42'], 42],             // a single number
  [['3', '4', '-'], -1],    // a - b, not b - a
];
for (const [tokens, expected] of cases) {
  const got = evalRPN(tokens);
  console.log(JSON.stringify(tokens), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Token operations: repeated splice vs stack
n (tokens),Splice repeatedly ~n²/4,Stack n
10,25,10
100,2500,100
1000,250000,1000
10000,25000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Repeated find + splice | O(n²) | O(n) | No data structure | Slow | Never |
| Recursion from the end | O(n) | O(n) stack | Elegant | Deep recursion on 10⁴ tokens | Short expressions |
| **Explicit stack** | **O(n)** | O(n) | Simple, iterative | – | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Popping in the wrong order: `a - b` needs `b = pop()` **first**.
- Using `Math.floor` for division: `-7 / 2` must be `-3` (toward zero), floor gives `-4`.
- Detecting operators with `isNaN(tok)`: `"-11"` is a number, `"-"` is an operator. Check the operator set instead.
- Using `parseInt` without care (fine here, but `Number` is clearer).
:::

::: understand
- Stacks evaluate expressions: postfix directly; infix with two stacks or via the shunting-yard algorithm. Related: [Basic Calculator II](https://leetcode.com/problems/basic-calculator-ii/), [Basic Calculator](https://leetcode.com/problems/basic-calculator/), [Valid Parentheses](https://leetcode.com/problems/valid-parentheses/).
:::

::: ask
- *"Is the expression always valid? Any division by zero?"*
- *"How should division round?"* (Toward zero in this problem.)
- *"Which operators are allowed?"*
:::

::: important ⭐ How to explain it in the interview
> "In postfix every operator applies to the two most recent values, so I use a stack. For a number I push it; for an operator I pop b, then a, compute a op b, and push the result. Division truncates toward zero, so I use Math.trunc. At the end the stack holds the answer. O(n) time and O(n) space."
:::

::: links
LeetCode 150: Evaluate Reverse Polish Notation | https://leetcode.com/problems/evaluate-reverse-polish-notation/
NeetCode video: Evaluate Reverse Polish Notation | https://www.youtube.com/results?search_query=neetcode+evaluate+reverse+polish+notation
:::

=== Reverse Linked List
@p 3
@tags linked-list, pointers, easy
@quick
- Three pointers: `prev = null`, `curr = head`; loop: `next = curr.next; curr.next = prev; prev = curr; curr = next`.
- Return **`prev`** (the new head). **O(n) time, O(1) space**.
- Recursive version: O(n) stack space (stack overflow on very long lists).
- Write it without hesitation: it's the building block of many list problems.

::: text 🧾 Problem
Given the `head` of a singly linked list, **reverse** the list and return the new head.

**Example 1:** `1 → 2 → 3 → 4 → 5 → null` becomes `5 → 4 → 3 → 2 → 1 → null`.
**Example 2:** `[]` → `[]` (empty list).

**Constraints:** 0 ≤ n ≤ 5000.

*A linked list is a chain of nodes; each node holds a value and a `next` pointer to the following node. The last node points to `null`.*
:::

::: text 🧒 Intuition
Imagine a **conga line** where each person holds the shoulders of the person in front. To reverse the line, walk from the front to the back and tell each person to **turn around** and hold the person who used to be behind them. You must remember who's next before they turn, or you'll lose the rest of the line.
:::

::: text 🐢 Brute force
**Idea:** copy the values into an array, then walk the list again writing the values in reverse order (or build a brand new list).

`vals = []; for node: vals.push(node.val)`
`for node: node.val = vals.pop()`

**Complexity:** O(n) time but **O(n) extra space**. It also changes values instead of links, which some interviewers forbid ("reverse the nodes, not the values").
:::

::: text 💡 Key insight
Reversing a list just means flipping every `next` arrow. To flip `curr.next` you need the previous node (where it should point now) and you must **save** the next node first (otherwise the rest of the list is unreachable). Three pointers walk the list once.

**Pattern name: Linked-list pointer manipulation (in-place reversal).**
:::

::: diagram One step of the loop
flowchart LR
  A["next = curr.next (save)"] --> B["curr.next = prev (flip)"]
  B --> C["prev = curr (advance)"]
  C --> D["curr = next (advance)"]
  D -->|"curr not null"| A
  D -->|"curr is null"| E["return prev"]
:::

::: image Reverse Linked List: prev, curr and next pointers
/images/dsa-stack-linkedlist/reverse-list.svg
:::

::: text 🔍 Dry run: 1 → 2 → 3 → null
| Step | prev | curr | next (saved) | after flipping | list as seen from prev |
|---|---|---|---|---|---|
| start | null | 1 | | | |
| 1 | 1 | 2 | 2 | 1.next = null | 1 → null |
| 2 | 2 | 3 | 3 | 2.next = 1 | 2 → 1 → null |
| 3 | 3 | null | null | 3.next = 2 | 3 → 2 → 1 → null |

`curr` is null → return `prev` = node 3.
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null); // [1,2] → 1→2→null
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

/**
 * Reverse a singly linked list in place. Time O(n), Space O(1).
 */
function reverseList(head) {
  let prev = null;          // the reversed part (starts empty)
  let curr = head;          // the node we're about to flip
  while (curr) {
    const next = curr.next; // 1) remember the rest of the list
    curr.next = prev;       // 2) flip the arrow backwards
    prev = curr;            // 3) the reversed part now starts at curr
    curr = next;            // 4) move on
  }
  return prev;              // new head
}

/** Recursive version: reverse the rest, then hook the current node at the end. O(n) stack. */
function reverseListRecursive(head) {
  if (!head || !head.next) return head;       // 0 or 1 node: already reversed
  const newHead = reverseListRecursive(head.next);
  head.next.next = head;                      // the node after head now points back to head
  head.next = null;                           // head becomes the tail
  return newHead;
}

// ---------- tests ----------
const cases = [[1, 2, 3, 4, 5], [1, 2], [1], []];
for (const arr of cases) {
  const a = toArray(reverseList(fromArray(arr)));
  const b = toArray(reverseListRecursive(fromArray(arr)));
  const expected = [...arr].reverse();
  console.log(JSON.stringify(arr), '→', JSON.stringify(a), JSON.stringify(a) === JSON.stringify(expected) && JSON.stringify(b) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
// long list: iterative is fine, recursion would risk a stack overflow
const long = fromArray(Array.from({ length: 100000 }, (_, i) => i));
const r = reverseList(long);
console.log('100,000 nodes reversed, head =', r.val, r.val === 99999 ? '✅' : '❌ FAIL');
:::

::: chart line Extra memory (values stored): copy to an array vs in-place pointers
n,Copy values to an array,In-place pointers
10,10,0
100,100,0
1000,1000,0
10000,10000,0
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Copy values to an array and rewrite | O(n) | O(n) | Very easy | Extra memory; changes values not links | Never as the final answer |
| Push nodes on a stack, relink | O(n) | O(n) | Intuitive | Extra memory | Explaining the idea |
| Recursive | O(n) | O(n) call stack | Elegant | Stack overflow for long lists | If asked for recursion |
| **Iterative three pointers** | **O(n)** | **O(1)** | Optimal | Order of the 4 lines matters | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Flipping `curr.next` **before** saving it: the rest of the list is lost.
- Returning `head` (now the tail) or `curr` (null) instead of `prev`.
- In the recursive version, forgetting `head.next = null` → a cycle between the first two nodes.
- Not handling the empty list and the single-node list.
:::

::: understand
- In-place reversal is a building block: [Reverse Linked List II](https://leetcode.com/problems/reverse-linked-list-ii/) (reverse a range), [Palindrome Linked List](https://leetcode.com/problems/palindrome-linked-list/) (reverse the second half), [Reorder List](https://leetcode.com/problems/reorder-list/), [Reverse Nodes in k-Group](https://leetcode.com/problems/reverse-nodes-in-k-group/).
- Pointer problems are about **order of assignments**: draw boxes and arrows before coding.
:::

::: ask
- *"Should I reverse the links in place, or may I create a new list?"*
- *"Iterative or recursive?"*
- *"Singly or doubly linked?"*
:::

::: important ⭐ How to explain it in the interview
> "I walk the list once with three pointers. prev starts as null and curr as head. In each step I save curr.next, point curr.next back to prev, then move prev to curr and curr to the saved next. When curr becomes null, prev is the new head. O(n) time and O(1) space. The recursive version is shorter but uses O(n) call-stack space, which can overflow on long lists."
:::

::: links
LeetCode 206: Reverse Linked List | https://leetcode.com/problems/reverse-linked-list/
NeetCode video: Reverse Linked List | https://www.youtube.com/results?search_query=neetcode+reverse+linked+list
VisuAlgo: linked list | https://visualgo.net/en/list
:::

=== Merge Two Sorted Lists
@p 3
@tags linked-list, merge, easy
@quick
- **Dummy node** + `tail` pointer: attach the smaller head, advance that list, repeat.
- When one list ends, attach the **rest** of the other in one step.
- **O(n + m) time, O(1) space** (re-uses the existing nodes).
- Return `dummy.next`.

::: text 🧾 Problem
Merge two **sorted** linked lists into one sorted list by **splicing their nodes together**, and return its head.

**Example 1:** `1→2→4` and `1→3→4` → `1→1→2→3→4→4`
**Example 2:** `[]` and `[0]` → `[0]`

**Constraints:** 0 ≤ n, m ≤ 50, sorted ascending.
:::

::: text 🧒 Intuition
Two **sorted piles of exam papers** (by student ID) must become one sorted pile. Look at the top paper of each pile, move the smaller one onto the output pile, and repeat. When one pile runs out, put the whole remaining pile on top: it's already sorted.

The **dummy node** is like an empty tray you start the output pile on, so you don't need a special case for the very first paper.
:::

::: text 🐢 Brute force
**Idea:** copy all values into an array, sort it, and build a new list.

`vals = [...list1 values, ...list2 values].sort((a, b) => a - b)`
`build a new list from vals`

**Complexity:** O((n + m) log(n + m)) time and O(n + m) extra space. It ignores that both lists are already sorted and creates new nodes instead of re-using them.
:::

::: text 💡 Key insight
The smallest remaining value is always at the **head** of one of the two lists. So the merge step of merge sort works on lists too: compare heads, attach the smaller, advance. A dummy head removes the "is the result still empty?" special case.

**Pattern name: Two pointers (merge) + dummy node.**
:::

::: diagram Merge with a dummy node
flowchart TD
  S["dummy = new node, tail = dummy"] --> L{"both lists non-empty?"}
  L -->|"yes"| C{"l1.val <= l2.val?"}
  C -->|"yes"| A["tail.next = l1, l1 = l1.next"]
  C -->|"no"| B["tail.next = l2, l2 = l2.next"]
  A --> T["tail = tail.next"]
  B --> T
  T --> L
  L -->|"no"| R["tail.next = l1 or l2 (the rest), return dummy.next"]
:::

::: image Merge Two Sorted Lists: dummy node and tail pointer
/images/dsa-stack-linkedlist/merge-two-lists.svg
:::

::: text 🔍 Dry run: l1 = 1→2→4, l2 = 1→3→4
| Step | l1 head | l2 head | pick | merged so far |
|---|---|---|---|---|
| 1 | 1 | 1 | l1's 1 (≤) | 1 |
| 2 | 2 | 1 | l2's 1 | 1→1 |
| 3 | 2 | 3 | l1's 2 | 1→1→2 |
| 4 | 4 | 3 | l2's 3 | 1→1→2→3 |
| 5 | 4 | 4 | l1's 4 | 1→1→2→3→4 |
| 6 | null | 4 | attach rest of l2 | 1→1→2→3→4→4 |
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

/**
 * Merge two sorted lists by re-linking nodes. Time O(n + m), Space O(1).
 */
function mergeTwoLists(l1, l2) {
  const dummy = new ListNode(0);   // placeholder before the real head
  let tail = dummy;                // last node of the merged list
  while (l1 && l2) {
    if (l1.val <= l2.val) {        // <= keeps equal values in a stable order
      tail.next = l1;
      l1 = l1.next;
    } else {
      tail.next = l2;
      l2 = l2.next;
    }
    tail = tail.next;              // the merged list grew by one node
  }
  tail.next = l1 || l2;            // one list is empty → attach the rest of the other
  return dummy.next;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 4], [1, 3, 4], [1, 1, 2, 3, 4, 4]],
  [[], [], []],
  [[], [0], [0]],
  [[5], [1, 2, 3], [1, 2, 3, 5]],
  [[-3, 10], [-5, 0, 20], [-5, -3, 0, 10, 20]],
];
for (const [a, b, expected] of cases) {
  const got = toArray(mergeTwoLists(fromArray(a), fromArray(b)));
  console.log(JSON.stringify(a), '+', JSON.stringify(b), '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
:::

::: chart line Comparisons: copy + sort vs merge (n + m nodes)
n + m,Copy + sort ~N log2 N,Merge N
10,33,10
100,664,100
1000,9966,1000
10000,132877,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Copy + sort + rebuild | O(N log N) | O(N) | Easy | Ignores sortedness, new nodes | Never |
| Recursive merge | O(N) | O(N) call stack | Very short | Stack depth N | Short lists |
| **Iterative with dummy** | **O(N)** | **O(1)** | Optimal, no special cases | – | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting to attach the **remaining** list at the end.
- Not advancing `tail` → you overwrite the same link.
- Special-casing the first node instead of using a dummy (more bugs).
- Returning `dummy` instead of `dummy.next`.
:::

::: understand
- The dummy-node trick removes head special cases in almost every list problem: [Remove Nth Node From End](https://leetcode.com/problems/remove-nth-node-from-end-of-list/), [Partition List](https://leetcode.com/problems/partition-list/), [Add Two Numbers](https://leetcode.com/problems/add-two-numbers/).
- Merging is the core of [Merge k Sorted Lists](https://leetcode.com/problems/merge-k-sorted-lists/) and [Sort List](https://leetcode.com/problems/sort-list/) (merge sort on a list).
:::

::: ask
- *"Should I re-use the existing nodes or create new ones?"*
- *"Ascending order? Can there be duplicates?"*
- *"Can either list be empty?"*
:::

::: important ⭐ How to explain it in the interview
> "Both lists are sorted, so the smallest remaining node is always one of the two heads. I create a dummy node and a tail pointer; while both lists have nodes, I attach the smaller head to tail and advance that list and the tail. When one list runs out, I attach the rest of the other. I return dummy.next. O(n + m) time and O(1) extra space, re-using the existing nodes."
:::

::: links
LeetCode 21: Merge Two Sorted Lists | https://leetcode.com/problems/merge-two-sorted-lists/
NeetCode video: Merge Two Sorted Lists | https://www.youtube.com/results?search_query=neetcode+merge+two+sorted+lists
:::

=== Linked List Cycle (fast & slow pointers)
@p 3
@tags linked-list, floyd, two-pointers, easy
@quick
- **Floyd's tortoise and hare**: `slow` moves 1 step, `fast` 2 steps.
- `fast` reaches `null` → no cycle; `slow === fast` → cycle.
- **O(n) time, O(1) space** (a Set of visited nodes uses O(n) space).
- Follow-up (cycle start): reset one pointer to head, move both 1 step; they meet at the start.

::: text 🧾 Problem
Given the `head` of a linked list, return `true` if the list has a **cycle**: some node's `next` points back to an earlier node, so following `next` never reaches `null`.

**Example 1:** `3 → 2 → 0 → -4 → (back to 2)` → `true`.
**Example 2:** `1 → 2 → null` → `false`.

**Constraints:** 0 ≤ n ≤ 10⁴; follow-up: O(1) memory.
:::

::: text 🧒 Intuition
Two runners on a **track**: one jogs, one sprints at double speed. If the track is a straight road with an end, the sprinter simply reaches the end. If the track is a **loop**, the sprinter eventually comes around and **laps** the jogger: they meet. Meeting = there's a loop.
:::

::: text 🐢 Brute force
**Idea:** remember every node you've visited in a Set; if you see a node again, there's a cycle.

`seen = new Set(); while node: if seen.has(node) return true; seen.add(node); node = node.next`

**Complexity:** O(n) time but **O(n) extra memory** (the follow-up forbids it). An even worse idea: "walk 10⁵ steps and assume a cycle if you haven't hit null", which is a guess, not an algorithm.
:::

::: text 💡 Key insight
Once both pointers are inside the cycle, the gap between them shrinks by **exactly 1** every move (fast gains one step on slow). A gap that shrinks by 1 must reach 0, so they meet within one lap. No memory needed, just two pointers.

**Pattern name: Fast & slow pointers (Floyd's cycle detection).**
:::

::: diagram Fast and slow pointers
flowchart TD
  S["slow = head, fast = head"] --> L{"fast and fast.next exist?"}
  L -->|"no"| F["return false (reached the end)"]
  L -->|"yes"| M["slow = slow.next, fast = fast.next.next"]
  M --> E{"slow === fast?"}
  E -->|"yes"| T["return true (cycle)"]
  E -->|"no"| L
:::

::: image Linked List Cycle: the tail points back to node -4
/images/dsa-stack-linkedlist/linked-list-cycle.svg
:::

::: text 🔍 Dry run: 3 → 2 → 0 → -4 → (back to 2)
Nodes by position: 0 = 3, 1 = 2, 2 = 0, 3 = −4, then −4.next is node 1 (value 2).
| Move | slow (value) | fast (value) | same node? |
|---|---|---|---|
| start | 3 | 3 | (start) |
| 1 | 2 | 0 | no |
| 2 | 0 | 2 | no |
| 3 | −4 | −4 | **yes → cycle** |
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
/** Build a list from values; if pos >= 0 the tail links back to the node at index pos. */
function buildWithCycle(values, pos) {
  const nodes = values.map((v) => new ListNode(v));
  nodes.forEach((n, i) => (n.next = nodes[i + 1] || null));
  if (pos >= 0 && nodes.length) nodes[nodes.length - 1].next = nodes[pos];
  return nodes[0] || null;
}

/**
 * Floyd's cycle detection. Time O(n), Space O(1).
 */
function hasCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {     // fast can only reach null if there is NO cycle
    slow = slow.next;             // 1 step
    fast = fast.next.next;        // 2 steps
    if (slow === fast) return true; // same NODE object (not just the same value)
  }
  return false;
}

/** Follow-up: return the node where the cycle starts (or null). */
function detectCycleStart(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next; fast = fast.next.next;
    if (slow === fast) {          // they met inside the cycle
      let p = head;               // distance head → start equals meeting point → start
      while (p !== slow) { p = p.next; slow = slow.next; }
      return p;
    }
  }
  return null;
}

/** Set version for comparison: O(n) memory. */
function hasCycleSet(head) {
  const seen = new Set();
  for (let n = head; n; n = n.next) { if (seen.has(n)) return true; seen.add(n); }
  return false;
}

// ---------- tests ----------
const cases = [
  [[3, 2, 0, -4], 1, true],
  [[1, 2], 0, true],      // tail → head
  [[1], -1, false],
  [[1], 0, true],         // a node pointing to itself
  [[], -1, false],        // empty list
  [[1, 2, 3, 4, 5], -1, false],
];
for (const [vals, pos, expected] of cases) {
  const head = buildWithCycle(vals, pos);
  const got = hasCycle(head);
  const start = detectCycleStart(buildWithCycle(vals, pos));
  const startOk = pos < 0 ? start === null : start && start.val === vals[pos];
  console.log(JSON.stringify(vals), 'pos', pos, '→', got, got === expected && hasCycleSet(buildWithCycle(vals, pos)) === expected && startOk ? '✅' : '❌ FAIL');
}
:::

::: chart line Extra memory: Set of visited nodes vs two pointers
n (nodes),Set entries,Two pointers
10,10,2
100,100,2
1000,1000,2
10000,10000,2
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Set of visited nodes | O(n) | O(n) | Obvious, also gives the start | Memory | When memory doesn't matter |
| Mark visited nodes (mutate) | O(n) | O(1) | No extra structure | Destroys the input | Never in interviews |
| **Floyd (fast & slow)** | **O(n)** | **O(1)** | Optimal, finds the start too | Needs the proof idea | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Checking only `fast` (not `fast.next`) before `fast.next.next` → crash on even-length lists.
- Comparing **values** instead of node identity (two nodes can have the same value).
- Comparing `slow === fast` **before** the first move (they both start at head → false positive).
- Empty list and single node (with and without a self-loop).
:::

::: understand
- Fast & slow pointers solve many list problems: [Middle of the Linked List](https://leetcode.com/problems/middle-of-the-linked-list/), [Linked List Cycle II](https://leetcode.com/problems/linked-list-cycle-ii/) (start of the cycle), [Happy Number](https://leetcode.com/problems/happy-number/), [Find the Duplicate Number](https://leetcode.com/problems/find-the-duplicate-number/).
- Why the start is found: if the tail before the cycle has length a and they meet b steps into the cycle, then a = (multiple of the cycle length) − b, so walking a steps from the head and from the meeting point lands both at the start.
:::

::: ask
- *"Is O(n) extra memory allowed, or do you want O(1)?"*
- *"Return true/false, or the node where the cycle starts?"*
- *"May I modify the list?"*
:::

::: important ⭐ How to explain it in the interview
> "I use Floyd's algorithm: a slow pointer moves one step and a fast pointer two steps. If there's no cycle, fast reaches null. If there is one, once both are inside it the gap shrinks by one per move, so fast must land on slow. I compare node references, not values. O(n) time and O(1) space, versus a Set of visited nodes which needs O(n) memory. For the start of the cycle, I reset one pointer to head and move both one step until they meet."
:::

::: links
LeetCode 141: Linked List Cycle | https://leetcode.com/problems/linked-list-cycle/
LeetCode 142: Linked List Cycle II | https://leetcode.com/problems/linked-list-cycle-ii/
NeetCode video: Linked List Cycle | https://www.youtube.com/results?search_query=neetcode+linked+list+cycle
:::

=== Middle of the Linked List
@p 2
@tags linked-list, fast-slow, easy
@quick
- **Fast & slow**: fast moves 2, slow moves 1; when fast reaches the end, slow is in the middle.
- Even length → this loop returns the **second** middle (LeetCode's rule).
- **O(n) time, O(1) space**, one pass.
- Used to split a list in half (merge sort on lists, palindrome check).

::: text 🧾 Problem
Return the **middle node** of a singly linked list. If there are two middle nodes (even length), return the **second** one.

**Example 1:** `1→2→3→4→5` → node `3`.
**Example 2:** `1→2→3→4→5→6` → node `4`.

**Constraints:** 1 ≤ n ≤ 100.
:::

::: text 🧒 Intuition
Two friends walk along a path; one takes **two steps** for every **one step** of the other. When the fast friend reaches the end of the path, the slow friend has covered exactly **half** the distance: they're standing in the middle.
:::

::: text 🐢 Brute force
**Idea:** two passes: count the nodes (n), then walk `floor(n / 2)` steps from the head.

`n = length(list); walk n/2 steps`

**Complexity:** O(n) time, O(1) space, two passes. Perfectly acceptable; the fast/slow version does it in **one** pass, which matters when the list is a stream or when you combine it with other steps.
:::

::: text 💡 Key insight
If one pointer moves twice as fast, it covers the whole list while the other covers half. So the slow pointer's position when the fast pointer stops **is** the middle, with no counting needed.

**Pattern name: Fast & slow pointers.**
:::

::: diagram Fast stops at the end, slow is in the middle
flowchart TD
  S["slow = head, fast = head"] --> L{"fast and fast.next?"}
  L -->|"yes"| M["slow = slow.next, fast = fast.next.next"] --> L
  L -->|"no"| R["return slow"]
:::

::: image Middle of the Linked List: when fast is at 5, slow is at 3
/images/dsa-stack-linkedlist/middle-list.svg
:::

::: text 🔍 Dry run: 1→2→3→4→5 and 1→2→3→4→5→6
| Step | slow (odd list) | fast (odd list) | slow (even list) | fast (even list) |
|---|---|---|---|---|
| 0 | 1 | 1 | 1 | 1 |
| 1 | 2 | 3 | 2 | 3 |
| 2 | **3** | 5 (fast.next is null → stop) | 3 | 5 |
| 3 | | | **4** | null (stop) |

Odd list → **3**; even list → **4** (the second middle).
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);

/**
 * Middle node (second middle for even length). Time O(n), Space O(1).
 */
function middleNode(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {   // stop when fast is on the last node or past it
    slow = slow.next;           // 1 step
    fast = fast.next.next;      // 2 steps
  }
  return slow;
}

/** Variant: FIRST middle for even lengths (useful to split a list for merge sort). */
function firstMiddle(head) {
  let slow = head, fast = head;
  while (fast.next && fast.next.next) { slow = slow.next; fast = fast.next.next; }
  return slow;
}

/** Two-pass version for comparison. */
function middleTwoPass(head) {
  let n = 0;
  for (let p = head; p; p = p.next) n++;
  let p = head;
  for (let i = 0; i < Math.floor(n / 2); i++) p = p.next;
  return p;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 4, 5], 3, 3],
  [[1, 2, 3, 4, 5, 6], 4, 3],   // second middle = 4, first middle = 3
  [[1], 1, 1],
  [[1, 2], 2, 1],
];
for (const [arr, expectedSecond, expectedFirst] of cases) {
  const head = fromArray(arr);
  const got = middleNode(head).val;
  const ok = got === expectedSecond && middleTwoPass(head).val === expectedSecond && firstMiddle(head).val === expectedFirst;
  console.log(JSON.stringify(arr), '→', got, '(first middle', firstMiddle(head).val + ')', ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Nodes visited: count then walk (1.5n) vs fast & slow (one pass, fast does n)
n,Two passes ~1.5n,Fast & slow ~n
10,15,10
100,150,100
1000,1500,1000
10000,15000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Copy nodes into an array, take `arr[n >> 1]` | O(n) | O(n) | Trivial | Extra memory | Quick scripts |
| Count, then walk n/2 | O(n), 2 passes | O(1) | Easy to explain | Two passes | Fine answer |
| **Fast & slow** | **O(n), 1 pass** | **O(1)** | One pass, reusable pattern | Which middle for even n? | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Wrong loop condition gives the wrong middle for even lengths (decide first vs second middle up front).
- Accessing `fast.next.next` without checking `fast.next`.
- Single-node list.
:::

::: understand
- Splitting a list in half is step 1 of [Palindrome Linked List](https://leetcode.com/problems/palindrome-linked-list/), [Reorder List](https://leetcode.com/problems/reorder-list/) and [Sort List](https://leetcode.com/problems/sort-list/). Same fast/slow idea as [Linked List Cycle](https://leetcode.com/problems/linked-list-cycle/).
:::

::: ask
- *"For an even number of nodes, the first or the second middle?"*
- *"Return the node or its value?"*
:::

::: important ⭐ How to explain it in the interview
> "I use fast and slow pointers from the head: slow moves one step and fast two. When fast can't move two more steps, slow is at the middle, the second middle for even lengths with this loop condition. One pass, O(n) time, O(1) space. If they want the first middle, I stop when fast.next.next is null instead."
:::

::: links
LeetCode 876: Middle of the Linked List | https://leetcode.com/problems/middle-of-the-linked-list/
NeetCode video: Middle of the Linked List | https://www.youtube.com/results?search_query=neetcode+middle+of+the+linked+list
:::

=== Remove Nth Node From End of List
@p 2
@tags linked-list, two-pointers, medium
@quick
- **Dummy node** + two pointers with a **gap of n + 1**: move `fast` n + 1 steps first, then move both until `fast` is null.
- `slow` stops right **before** the node to delete → `slow.next = slow.next.next`.
- **One pass, O(n) time, O(1) space**. The dummy handles deleting the head.
- Two-pass alternative: count length L, delete node L − n.

::: text 🧾 Problem
Remove the **n-th node from the end** of a linked list and return the head.

**Example 1:** `1→2→3→4→5, n = 2` → `1→2→3→5` (the 4 is removed).
**Example 2:** `[1], n = 1` → `[]`; `[1,2], n = 2` → `[2]` (the head is removed).

**Constraints:** 1 ≤ n ≤ length ≤ 30; follow-up: one pass.
:::

::: text 🧒 Intuition
Hold a **stick of fixed length** (n + 1 nodes) and slide it along the list. When the front end of the stick falls off the end of the list, the back end is exactly one node before the one you want to remove. You never need to know the total length.
:::

::: text 🐢 Brute force
**Idea:** two passes: count the length L, then walk to node `L − n − 1` and unlink the next node (special case when removing the head).

**Complexity:** O(n) time, O(1) space, but **two passes**. The follow-up asks for one pass. (Copying nodes into an array to index from the end is one pass but O(n) space.)
:::

::: text 💡 Key insight
"n-th from the end" means "the node where a pointer n steps ahead hits the end". Keep two pointers a fixed distance apart; when the leading one reaches `null`, the trailing one is in position. Starting both at a **dummy node** placed before the head means `slow` stops at the node **before** the target, even when the target is the head.

**Pattern name: Two pointers with a fixed gap + dummy node.**
:::

::: diagram Fixed gap
flowchart TD
  A["dummy.next = head, slow = dummy, fast = dummy"] --> B["move fast n + 1 steps"]
  B --> C{"fast is null?"}
  C -->|"no"| D["slow = slow.next, fast = fast.next"] --> C
  C -->|"yes"| E["slow.next = slow.next.next"]
  E --> F["return dummy.next"]
:::

::: image Remove Nth Node From End: slow stops at 3 when fast is null, node 4 is skipped
/images/dsa-stack-linkedlist/remove-nth.svg
:::

::: text 🔍 Dry run: 1→2→3→4→5, n = 2
List with dummy: D→1→2→3→4→5→null. Fast first moves n + 1 = 3 steps: D → 1 → 2 → 3.
| Step | slow | fast |
|---|---|---|
| after the head start | D | 3 |
| 1 | 1 | 4 |
| 2 | 2 | 5 |
| 3 | **3** | **null** → stop |

`slow` = 3, so `3.next = 3.next.next` → skip 4. Result `1→2→3→5`.
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

/**
 * Remove the n-th node from the end in one pass. Time O(L), Space O(1).
 */
function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head);   // a node BEFORE the head (makes removing the head easy)
  let slow = dummy, fast = dummy;
  for (let i = 0; i < n + 1; i++) fast = fast.next; // open a gap of n + 1 nodes
  while (fast) {                         // slide both until fast falls off the end
    slow = slow.next;
    fast = fast.next;
  }
  slow.next = slow.next.next;            // slow is just before the target → unlink it
  return dummy.next;                     // the head may have changed
}

/** Two-pass version for comparison. */
function removeNthTwoPass(head, n) {
  let len = 0;
  for (let p = head; p; p = p.next) len++;
  const dummy = new ListNode(0, head);
  let p = dummy;
  for (let i = 0; i < len - n; i++) p = p.next; // stop before the target
  p.next = p.next.next;
  return dummy.next;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 4, 5], 2, [1, 2, 3, 5]],
  [[1], 1, []],              // remove the only node
  [[1, 2], 1, [1]],          // remove the tail
  [[1, 2], 2, [2]],          // remove the head
  [[10, 20, 30], 3, [20, 30]],
];
for (const [arr, n, expected] of cases) {
  const a = toArray(removeNthFromEnd(fromArray(arr), n));
  const b = toArray(removeNthTwoPass(fromArray(arr), n));
  console.log(JSON.stringify(arr), 'n =', n, '→', JSON.stringify(a), JSON.stringify(a) === JSON.stringify(expected) && JSON.stringify(b) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
:::

::: chart line Node visits: two passes (count + walk) vs one pass with a gap
L (length),Two passes ~2L - n,One pass ~L + 1
10,18,11
100,198,101
1000,1998,1001
10000,19998,10001
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Copy nodes into an array | O(L) | O(L) | Index from the end directly | Extra memory | Quick scripts |
| Count length, then walk | O(L), 2 passes | O(1) | Easy to reason about | Two passes | Fine first answer |
| **Two pointers with a gap + dummy** | **O(L), 1 pass** | **O(1)** | One pass, no head special case | Gap off-by-one is easy to get wrong | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Gap of `n` instead of `n + 1`: slow stops **on** the target instead of before it.
- Removing the **head** without a dummy node → crash or wrong head.
- Returning `head` instead of `dummy.next` (wrong when the head was removed).
- Single-node list with n = 1 → empty list.
:::

::: understand
- "Two pointers a fixed distance apart" also finds the k-th node from the end and powers [Rotate List](https://leetcode.com/problems/rotate-list/). The dummy node appears in [Merge Two Sorted Lists](https://leetcode.com/problems/merge-two-sorted-lists/) and [Remove Linked List Elements](https://leetcode.com/problems/remove-linked-list-elements/).
:::

::: ask
- *"Is n always valid (1 ≤ n ≤ length)?"*
- *"Is one pass required?"*
- *"Return the new head?"*
:::

::: important ⭐ How to explain it in the interview
> "I put a dummy node before the head and start two pointers there. I move fast n + 1 steps ahead, then move both until fast is null. Now slow is right before the node to remove, so I set slow.next to slow.next.next and return dummy.next. The dummy makes removing the head work without special cases. One pass, O(L) time, O(1) space."
:::

::: links
LeetCode 19: Remove Nth Node From End of List | https://leetcode.com/problems/remove-nth-node-from-end-of-list/
NeetCode video: Remove Nth Node From End of List | https://www.youtube.com/results?search_query=neetcode+remove+nth+node+from+end+of+list
:::

=== Intersection of Two Linked Lists
@p 2
@tags linked-list, two-pointers, easy
@quick
- Two pointers: when `pA` reaches the end of A, jump to the head of **B** (and vice versa).
- Both walk `a + c + b` steps → they meet at the intersection, or both become `null` together.
- **O(n + m) time, O(1) space**. Compare **node identity**, not values.
- Alternative: Set of A's nodes (O(n) space), or align by length difference.

::: text 🧾 Problem
Two singly linked lists may **merge** at some node and share the same tail from there. Return the **node** where they intersect, or `null` if they don't. The lists must keep their original structure.

**Example 1:** A = `4→1→8→4→5`, B = `5→6→1→8→4→5` where the `8` node is shared → return the node `8`.
**Example 2:** A = `2→6→4`, B = `1→5` (no shared node) → `null`.

**Constraints:** 1 ≤ n, m ≤ 3 × 10⁴; follow-up: O(1) memory.
:::

::: text 🧒 Intuition
Two friends start walking on **two different streets** that join into one road. One street is longer, so they don't arrive at the junction together. Trick: when a friend reaches the end of the road, they **teleport to the start of the other friend's street** and keep walking. Now both walk the same total distance (my street + shared road + your street), so they arrive at the junction at the **same moment**.
:::

::: text 🐢 Brute force
**Idea 1:** for each node of A, scan all of B for the same node → **O(n · m)** (~9 × 10⁸ for 3 × 10⁴ each).
**Idea 2:** put all nodes of A in a **Set**, then walk B and return the first node in the Set → O(n + m) time but **O(n) memory**.
:::

::: text 💡 Key insight
Say A has `a` unique nodes, B has `b` unique nodes and they share `c` nodes. Pointer pA walks `a + c` then switches to B and walks `b` more; pB walks `b + c` then `a`. After `a + b + c` steps both are at the intersection (or both at `null` if c = 0). The switch cancels out the length difference.

**Pattern name: Two pointers with head switching (length alignment).**
:::

::: diagram Switch heads at the end
flowchart TD
  S["pA = headA, pB = headB"] --> L{"pA !== pB?"}
  L -->|"yes"| A["pA = pA ? pA.next : headB"]
  A --> B["pB = pB ? pB.next : headA"]
  B --> L
  L -->|"no"| R["return pA (intersection node or null)"]
:::

::: image Intersection of Two Linked Lists: lists 4 1 and 5 6 1 join at node 8
/images/dsa-stack-linkedlist/intersection-lists.svg
:::

::: text 🔍 Dry run: A = 4→1→(8→4→5), B = 5→6→1→(8→4→5)
a = 2 unique nodes in A, b = 3 unique nodes in B, c = 3 shared nodes. Each loop iteration moves **both** pointers.
| Iteration | pA | pB | same node? |
|---|---|---|---|
| 0 | 4 (A) | 5 (B) | no |
| 1 | 1 (A) | 6 (B) | no |
| 2 | 8 (shared) | 1 (B) | no |
| 3 | 4 (shared) | 8 (shared) | no |
| 4 | 5 (shared) | 4 (shared) | no |
| 5 | null | 5 (shared) | no |
| 6 | 5 (B, switched) | null | no |
| 7 | 6 (B) | 4 (A, switched) | no |
| 8 | 1 (B) | 1 (A) | no: same value, different nodes |
| 9 | **8** | **8** | **yes → return node 8** |

Both pointers took a + b + c + 1 = 9 moves (the extra one is the step onto null).
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
/** Build two lists A = a + common, B = b + common that share the SAME common nodes. */
function buildIntersecting(aVals, bVals, commonVals) {
  const common = fromArray(commonVals);
  const attach = (vals) => { if (!vals.length) return common; const h = fromArray(vals); let t = h; while (t.next) t = t.next; t.next = common; return h; };
  return { headA: attach(aVals), headB: attach(bVals), common };
}

/**
 * Intersection node of two lists. Time O(n + m), Space O(1).
 */
function getIntersectionNode(headA, headB) {
  let pA = headA, pB = headB;
  while (pA !== pB) {                 // compares node identity (the same object), not values
    pA = pA ? pA.next : headB;        // end of A → continue on B
    pB = pB ? pB.next : headA;        // end of B → continue on A
  }
  return pA;                          // the shared node, or null if both reached the end together
}

/** Set version for comparison: O(n) memory. */
function getIntersectionSet(headA, headB) {
  const seen = new Set();
  for (let p = headA; p; p = p.next) seen.add(p);
  for (let p = headB; p; p = p.next) if (seen.has(p)) return p;
  return null;
}

// ---------- tests ----------
const cases = [
  [[4, 1], [5, 6, 1], [8, 4, 5]],   // intersect at 8 (note: B's "1" is a DIFFERENT node with the same value)
  [[1, 9, 1], [3], [2, 4]],
  [[2, 6, 4], [1, 5], []],          // no intersection
  [[], [], [7]],                    // both lists ARE the common part
];
for (const [a, b, common] of cases) {
  const { headA, headB, common: c } = buildIntersecting(a, b, common);
  const got = getIntersectionNode(headA, headB);
  const ok = got === c && getIntersectionSet(headA, headB) === c;
  console.log('A', JSON.stringify([...a, ...common]), 'B', JSON.stringify([...b, ...common]), '→', got ? got.val : null, ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Node visits (n = m): compare every pair vs head switching
n,Every pair n·m,Head switching ~2n
10,100,20
100,10000,200
1000,1000000,2000
10000,100000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Compare every pair of nodes | O(n · m) | O(1) | Obvious | Slow | Never |
| Set of A's nodes | O(n + m) | O(n) | Simple | Memory | Memory isn't a concern |
| Count lengths, advance the longer by the difference | O(n + m) | O(1) | Easy to explain | Three passes, more code | Equivalent alternative |
| **Head switching** | **O(n + m)** | **O(1)** | Shortest code | Needs the a + b + c argument | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing **values** (`pA.val === pB.val`): different nodes can hold the same value (B's `1` above).
- Switching to the **own** head instead of the other list's head → infinite loop when there's no intersection.
- Switching when `pA.next` is null (skips the null step) → infinite loop for non-intersecting lists of different lengths.
- Modifying the lists (e.g. marking nodes): the problem says keep the structure.
:::

::: understand
- Aligning two walks so they "arrive together" is a recurring trick; related: [Linked List Cycle II](https://leetcode.com/problems/linked-list-cycle-ii/) and [Lowest Common Ancestor of a Binary Tree III](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree-iii/) (same head-switching idea with parent pointers).
:::

::: ask
- *"Can the lists contain cycles?"* (Assume no.)
- *"Must I keep the lists unchanged? Is O(1) memory required?"*
- *"Return the node, or just whether they intersect?"*
:::

::: important ⭐ How to explain it in the interview
> "I walk two pointers, one per list. When a pointer reaches the end, it continues from the head of the other list. Both then travel the unique part of A, the unique part of B and the shared part, the same total, so they reach the intersection node at the same time, or both reach null if there's none. I compare node references, not values. O(n + m) time, O(1) space."
:::

::: links
LeetCode 160: Intersection of Two Linked Lists | https://leetcode.com/problems/intersection-of-two-linked-lists/
NeetCode video: Intersection of Two Linked Lists | https://www.youtube.com/results?search_query=neetcode+intersection+of+two+linked+lists
:::

=== Add Two Numbers (linked lists)
@p 2
@tags linked-list, math, medium
@quick
- Digits are stored in **reverse** (ones first), so add like on paper from the head: `sum = a + b + carry`.
- New digit = `sum % 10`, `carry = Math.floor(sum / 10)`.
- Loop while **either list or the carry** remains (`999 + 1` adds a new digit).
- **O(max(n, m)) time**; dummy node for the result.

::: text 🧾 Problem
Two non-negative integers are stored as linked lists of digits in **reverse order** (the head is the ones digit). Return their sum as a linked list in the same format.

**Example 1:** `2→4→3` (342) + `5→6→4` (465) → `7→0→8` (807).
**Example 2:** `9→9→9` (999) + `1` (1) → `0→0→0→1` (1000).

**Constraints:** 1 ≤ length ≤ 100 (numbers can be far bigger than JS can store exactly), no leading zeros.
:::

::: text 🧒 Intuition
This is **column addition from primary school**, just written backwards. You add the ones column, write down the last digit, carry the 1, then move to the tens column, and so on. Because the lists already start with the ones digit, you can walk them from the head in exactly the order you'd add on paper.
:::

::: text 🐢 Brute force
**Idea:** convert each list to a number, add, convert back.

`n1 = Number(digits of l1 reversed)`, `n2 = …`, `sum = n1 + n2`, build a list from `sum`'s digits.

**Problem:** 100-digit numbers overflow JavaScript's safe integers (2⁵³ ≈ 9 × 10¹⁵), so the answer is **wrong**, not just slow. `BigInt` fixes correctness but misses the point of the exercise and costs extra conversions.
:::

::: text 💡 Key insight
Digit-by-digit addition only needs the two current digits and a **carry** (0 or 1), so it works for numbers of any length without ever building the full number. The reverse order means the lists are already aligned by place value.

**Pattern name: Linked-list traversal + carry (elementary arithmetic) + dummy node.**
:::

::: diagram Column addition with a carry
flowchart TD
  S["dummy, tail = dummy, carry = 0"] --> L{"l1 or l2 or carry?"}
  L -->|"no"| R["return dummy.next"]
  L -->|"yes"| A["sum = (l1 digit or 0) + (l2 digit or 0) + carry"]
  A --> B["tail.next = new node(sum % 10), tail = tail.next"]
  B --> C["carry = floor(sum / 10), advance l1 and l2"]
  C --> L
:::

::: image Add Two Numbers: column addition with a carry gives 7 0 8
/images/dsa-stack-linkedlist/add-two-numbers.svg
:::

::: text 🔍 Dry run: 2→4→3 + 5→6→4
| Column | l1 digit | l2 digit | carry in | sum | new digit | carry out | result so far |
|---|---|---|---|---|---|---|---|
| ones | 2 | 5 | 0 | 7 | 7 | 0 | 7 |
| tens | 4 | 6 | 0 | 10 | 0 | 1 | 7→0 |
| hundreds | 3 | 4 | 1 | 8 | 8 | 0 | 7→0→8 |

Both lists end and carry = 0 → done: **7→0→8** (807).
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

/**
 * Add two numbers stored as reversed digit lists. Time O(max(n, m)), Space O(max(n, m)) for the result.
 */
function addTwoNumbers(l1, l2) {
  const dummy = new ListNode(0);
  let tail = dummy;
  let carry = 0;
  while (l1 || l2 || carry) {               // keep going while anything is left to add
    const a = l1 ? l1.val : 0;              // a missing digit counts as 0
    const b = l2 ? l2.val : 0;
    const sum = a + b + carry;
    tail.next = new ListNode(sum % 10);     // write the last digit
    tail = tail.next;
    carry = Math.floor(sum / 10);           // 0 or 1
    if (l1) l1 = l1.next;
    if (l2) l2 = l2.next;
  }
  return dummy.next;
}

/** Check helper using BigInt (only for testing). */
const toBig = (arr) => BigInt([...arr].reverse().join('') || '0');

// ---------- tests ----------
const cases = [
  [[2, 4, 3], [5, 6, 4], [7, 0, 8]],
  [[0], [0], [0]],
  [[9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9], [8, 9, 9, 9, 0, 0, 0, 1]],
  [[9, 9, 9], [1], [0, 0, 0, 1]],     // final carry creates a new digit
  [[5], [5], [0, 1]],
];
for (const [a, b, expected] of cases) {
  const got = toArray(addTwoNumbers(fromArray(a), fromArray(b)));
  const ok = JSON.stringify(got) === JSON.stringify(expected) && toBig(got) === toBig(a) + toBig(b);
  console.log(JSON.stringify(a), '+', JSON.stringify(b), '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
// 100-digit numbers: Number() would lose precision, the list version is exact
const big1 = Array.from({ length: 100 }, (_, i) => (i * 7) % 10);
const big2 = Array.from({ length: 100 }, (_, i) => (i * 3) % 10);
const sum = toArray(addTwoNumbers(fromArray(big1), fromArray(big2)));
console.log('100-digit sum exact:', toBig(sum) === toBig(big1) + toBig(big2) ? '✅' : '❌ FAIL');
:::

::: chart line Correct digits for an n-digit sum: Number() conversion vs digit-by-digit
digits,Number() correct up to,Digit by digit correct
10,10,10
16,15,16
50,15,50
100,15,100
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Convert to Number, add, convert back | O(n) | O(n) | Short | **Wrong** above ~15 digits | Never |
| Convert to BigInt | O(n) (plus BigInt cost) | O(n) | Correct | Avoids the exercise; extra conversions | Quick scripts |
| **Digit-by-digit with carry** | **O(max(n, m))** | O(max(n, m)) | Exact for any length, one pass | – | Default answer |
| Recursive | O(max(n, m)) | O(max(n, m)) stack | Elegant | Stack depth | If asked |
:::

::: warning ⚠️ Common mistakes / edge cases
- Stopping when both lists end but a **carry** remains (`999 + 1` → loses the leading 1).
- Assuming both lists have the same length.
- Converting to `Number` and losing precision for long inputs.
- Forgetting `Math.floor` for the carry (`sum / 10` is 1.4, not 1).
:::

::: understand
- Elementary arithmetic on digit lists: [Add Two Numbers II](https://leetcode.com/problems/add-two-numbers-ii/) (digits in forward order → use stacks or reverse first), [Add Binary](https://leetcode.com/problems/add-binary/), [Plus One](https://leetcode.com/problems/plus-one/), [Multiply Strings](https://leetcode.com/problems/multiply-strings/).
:::

::: ask
- *"Are digits stored in reverse order? Can there be leading zeros?"*
- *"Can I modify the input lists or must I build a new list?"*
- *"Can the numbers be negative?"* (Usually no.)
:::

::: important ⭐ How to explain it in the interview
> "The digits are stored ones-first, so I can add them column by column from the heads, exactly like on paper. I keep a carry; each step I add the two digits (0 if a list has ended) plus the carry, append sum mod 10 to the result via a dummy node, and set carry to sum divided by 10, floored. I loop while either list or the carry remains, so 999 + 1 correctly produces 0001. O(max(n, m)) time. Converting to Number would overflow for long inputs."
:::

::: links
LeetCode 2: Add Two Numbers | https://leetcode.com/problems/add-two-numbers/
NeetCode video: Add Two Numbers | https://www.youtube.com/results?search_query=neetcode+add+two+numbers
:::
