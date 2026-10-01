@section DSA: Stack, Queue & Linked List
@icon 🥞
@color #ec4899
@desc Tier 5 + Tier 6: LIFO/FIFO, monotonic stack, and the linked-list problems every interviewer asks.

=== Valid Parentheses
@p 3
@tags stack, string, easy
@quick
- Push opening brackets; on a closing bracket, the top of the stack must be its matching opener → pop, else false.
- At the end the stack must be **empty**.
- **O(n) time, O(n) space**. Odd length → false immediately.

::: text
**Problem:** Is a string of `()[]{}` valid (correct type and order)?
`"()[]{}" → true`, `"(]" → false`, `"([)]" → false`, `"{[]}" → true`

### Why a stack?
The **most recently opened** bracket must close **first**, which is exactly **LIFO**. The same idea powers HTML tag validation, undo, the call stack and expression parsing.
:::

::: diagram Stack evolution for "{[()]}"
flowchart LR
  A["{ → push"] --> B["[ → push"] --> C["( → push"] --> D[") matches ( → pop"] --> E["] matches [ → pop"] --> F["} matches { → pop"] --> G["stack empty → valid"]
:::

::: code javascript Solution + tests
function isValid(s) {
  if (s.length % 2) return false;
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}
[['()', true], ['()[]{}', true], ['(]', false], ['([)]', false], ['{[]}', true], ['((', false], ['', true]].forEach(([s, e]) =>
  console.log(JSON.stringify(s), isValid(s), isValid(s) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Only brackets, or other characters too?"* (Skip non-bracket chars.) Follow-ups: minimum removals to make valid, generate parentheses.
:::

::: links
LeetCode 20 | https://leetcode.com/problems/valid-parentheses/
:::

=== Daily Temperatures (monotonic stack)
@p 3
@tags monotonic-stack, medium
@quick
- For each day: how many days until a warmer temperature?
- **Monotonic decreasing stack of indices**: when the current temperature > the top's, pop and set `answer[top] = i - top`.
- Each index is pushed/popped once → **O(n)**. Brute force O(n²).
- The same pattern solves **Next Greater Element**, stock span and histogram problems.

::: text
**Problem:** `temps = [73,74,75,71,69,72,76,73] → [1,1,4,2,1,1,0,0]`

### Monotonic stack
Keep a stack of indices whose "warmer day" hasn't been found yet. Their temperatures are **decreasing** from bottom to top. When a warmer day arrives, it resolves every colder day on top of the stack.
:::

::: chart bar Temperatures: each bar waits for the next taller bar
Day,Temp
0,73
1,74
2,75
3,71
4,69
5,72
6,76
7,73
:::

::: code javascript Solution + tests
function dailyTemperatures(temps) {
  const answer = new Array(temps.length).fill(0);
  const stack = []; // indices with decreasing temps
  for (let i = 0; i < temps.length; i++) {
    while (stack.length && temps[i] > temps[stack[stack.length - 1]]) {
      const j = stack.pop();
      answer[j] = i - j;
    }
    stack.push(i);
  }
  return answer;
}
[[[73, 74, 75, 71, 69, 72, 76, 73], '1,1,4,2,1,1,0,0'], [[30, 40, 50, 60], '1,1,1,0'], [[30, 60, 90], '1,1,0'], [[90, 80, 70], '0,0,0']].forEach(([t, e]) =>
  console.log(JSON.stringify(t), dailyTemperatures(t).join(), dailyTemperatures(t).join() === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Return the distance or the next temperature? Circular array?"* (Circular → loop twice, i % n.)
:::

::: links
LeetCode 739 | https://leetcode.com/problems/daily-temperatures/
:::

=== Next Greater Element
@p 2
@tags monotonic-stack, hashmap, easy
@quick
- Monotonic stack over `nums2` → a map `value → next greater value`; then look up each nums1 value.
- Circular version (II): iterate `2n` times with `i % n`.
- **O(n + m)**.

::: code javascript Solutions + tests
// LeetCode 496: nums1 is a subset of nums2
function nextGreaterElement(nums1, nums2) {
  const next = new Map();
  const stack = [];
  for (const n of nums2) {
    while (stack.length && n > stack[stack.length - 1]) next.set(stack.pop(), n);
    stack.push(n);
  }
  return nums1.map((n) => next.get(n) ?? -1);
}

// LeetCode 503: circular array
function nextGreaterCircular(nums) {
  const n = nums.length, res = new Array(n).fill(-1), stack = [];
  for (let i = 0; i < 2 * n; i++) {
    const cur = nums[i % n];
    while (stack.length && cur > nums[stack[stack.length - 1]]) res[stack.pop()] = cur;
    if (i < n) stack.push(i);
  }
  return res;
}

console.log(nextGreaterElement([4, 1, 2], [1, 3, 4, 2]).join() === '-1,3,-1' ? '✅' : '❌ FAIL', nextGreaterElement([4, 1, 2], [1, 3, 4, 2]));
console.log(nextGreaterElement([2, 4], [1, 2, 3, 4]).join() === '3,-1' ? '✅' : '❌ FAIL');
console.log(nextGreaterCircular([1, 2, 1]).join() === '2,-1,2' ? '✅' : '❌ FAIL', nextGreaterCircular([1, 2, 1]));
:::

::: ask
- *"Circular? Duplicates?"* (With duplicates, store indices instead of values.)
:::

::: links
LeetCode 496 | https://leetcode.com/problems/next-greater-element-i/
:::

=== Min Stack
@p 2
@tags stack, design, medium
@quick
- `push, pop, top, getMin` all **O(1)**.
- Store pairs `[value, minSoFar]` (or a second stack of mins).
- `getMin` = the top's `minSoFar`.

::: code javascript Solution + tests
class MinStack {
  constructor() { this.stack = []; } // each entry: [value, minAtThisLevel]
  push(val) {
    const min = this.stack.length ? Math.min(val, this.getMin()) : val;
    this.stack.push([val, min]);
  }
  pop() { return this.stack.pop()?.[0]; }
  top() { return this.stack[this.stack.length - 1]?.[0]; }
  getMin() { return this.stack[this.stack.length - 1]?.[1]; }
}

const s = new MinStack();
s.push(-2); s.push(0); s.push(-3);
console.log('getMin', s.getMin(), s.getMin() === -3 ? '✅' : '❌ FAIL');
s.pop();
console.log('top', s.top(), s.top() === 0 ? '✅' : '❌ FAIL');
console.log('getMin', s.getMin(), s.getMin() === -2 ? '✅' : '❌ FAIL');
:::

::: ask
- *"What should pop/top return on an empty stack?"* *"Also getMax?"* (The same trick.)
:::

::: links
LeetCode 155 | https://leetcode.com/problems/min-stack/
:::

=== Implement Queue using Stacks
@p 2
@tags queue, stack, design, easy
@quick
- Two stacks: `inStack` for push, `outStack` for pop/peek.
- When `outStack` is empty, move everything from `inStack` (reverses the order → FIFO).
- **Amortised O(1)** per operation (each element moves once).

::: code javascript Solution + tests
class MyQueue {
  constructor() { this.in = []; this.out = []; }
  push(x) { this.in.push(x); }
  #shift() { if (!this.out.length) while (this.in.length) this.out.push(this.in.pop()); }
  pop() { this.#shift(); return this.out.pop(); }
  peek() { this.#shift(); return this.out[this.out.length - 1]; }
  empty() { return !this.in.length && !this.out.length; }
}

const q = new MyQueue();
q.push(1); q.push(2);
console.log(q.peek() === 1 ? '✅' : '❌ FAIL', 'peek 1');
console.log(q.pop() === 1 ? '✅' : '❌ FAIL', 'pop 1');
q.push(3);
console.log(q.pop() === 2 && q.pop() === 3 && q.empty() ? '✅' : '❌ FAIL', 'FIFO order kept');
:::

::: ask
- Explain **amortised** complexity clearly: a single pop can be O(n), but n operations cost O(n) in total.
:::

::: links
LeetCode 232 | https://leetcode.com/problems/implement-queue-using-stacks/
:::

=== Implement Stack using Queues
@p 1
@tags stack, queue, design, easy
@quick
- One queue: on push, enqueue then **rotate** the previous n-1 elements behind it → the front is always the newest.
- push O(n), pop/top O(1).
- Mention a real queue needs O(1) dequeue: JS `array.shift()` is O(n), so use a head index or a linked list.

::: code javascript Solution + tests
class Queue { // O(1) enqueue/dequeue using a head pointer
  constructor() { this.items = []; this.head = 0; }
  enqueue(x) { this.items.push(x); }
  dequeue() { const x = this.items[this.head++]; if (this.head > 50 && this.head * 2 > this.items.length) { this.items = this.items.slice(this.head); this.head = 0; } return x; }
  front() { return this.items[this.head]; }
  get size() { return this.items.length - this.head; }
}

class MyStack {
  constructor() { this.q = new Queue(); }
  push(x) {
    this.q.enqueue(x);
    for (let i = 0; i < this.q.size - 1; i++) this.q.enqueue(this.q.dequeue()); // rotate
  }
  pop() { return this.q.dequeue(); }
  top() { return this.q.front(); }
  empty() { return this.q.size === 0; }
}

const st = new MyStack();
st.push(1); st.push(2); st.push(3);
console.log(st.top() === 3 ? '✅' : '❌ FAIL', 'top 3');
console.log(st.pop() === 3 && st.pop() === 2 ? '✅' : '❌ FAIL', 'LIFO');
console.log(st.empty() === false ? '✅' : '❌ FAIL');
console.log('Stack = LIFO (undo, call stack) · Queue = FIFO (BFS, job queues) · Deque = both ends (sliding window max)');
:::

::: ask
- *"Optimise push or pop?"* You can make either one O(1) and the other O(n).
:::

::: links
LeetCode 225 | https://leetcode.com/problems/implement-stack-using-queues/
:::

=== Evaluate Reverse Polish Notation
@p 1
@tags stack, math, medium
@quick
- Numbers → push; operator → pop **b** then **a**, push `a op b`.
- Division truncates toward zero: `Math.trunc(a / b)`.
- **O(n)** time and space.

::: code javascript Solution + tests
function evalRPN(tokens) {
  const stack = [];
  const ops = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => Math.trunc(a / b),
  };
  for (const t of tokens) {
    if (t in ops) {
      const b = stack.pop(), a = stack.pop(); // order matters!
      stack.push(ops[t](a, b));
    } else stack.push(Number(t));
  }
  return stack.pop();
}
[[['2', '1', '+', '3', '*'], 9], [['4', '13', '5', '/', '+'], 6], [['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+'], 22]].forEach(([t, e]) =>
  console.log(t.join(' '), '=', evalRPN(t), evalRPN(t) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Is the input always valid? Integer division semantics?"*
:::

::: links
LeetCode 150 | https://leetcode.com/problems/evaluate-reverse-polish-notation/
:::

=== Reverse Linked List
@p 3
@tags linked-list, pointers, easy
@quick
- Iterative with three pointers: `prev = null, curr = head`; loop: `next = curr.next; curr.next = prev; prev = curr; curr = next`; return `prev`.
- **O(n) time, O(1) space**. Write it without hesitation!
- Recursive: `newHead = reverse(head.next); head.next.next = head; head.next = null` → O(n) stack space.

::: text
**Problem:** Reverse a singly linked list. `1→2→3→4→5 → 5→4→3→2→1`

### The pointer dance (say it out loud)
1. Save `next` (so we don't lose the rest of the list).
2. Point `curr.next` backwards to `prev`.
3. Move `prev` forward to `curr`.
4. Move `curr` forward to `next`.
When `curr` is null, `prev` is the new head.
:::

::: diagram
flowchart LR
  subgraph Before
    A1["1"] --> A2["2"] --> A3["3"] --> AN["null"]
  end
  subgraph After
    B3["3"] --> B2["2"] --> B1["1"] --> BN["null"]
  end
:::

::: code javascript Solution (iterative + recursive) + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

function reverseList(head) {
  let prev = null;
  let current = head;
  while (current) {
    const next = current.next;
    current.next = prev;
    prev = current;
    current = next;
  }
  return prev;
}

function reverseListRecursive(head) {
  if (!head || !head.next) return head;
  const newHead = reverseListRecursive(head.next);
  head.next.next = head;   // the node after head points back to head
  head.next = null;
  return newHead;
}

[[1, 2, 3, 4, 5], [1, 2], [], [7]].forEach((arr) => {
  const a = toArray(reverseList(fromArray(arr))).join();
  const b = toArray(reverseListRecursive(fromArray(arr))).join();
  const e = [...arr].reverse().join();
  console.log(JSON.stringify(arr), '→', a, a === e && b === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Iterative or recursive?"* (Iterative avoids stack overflow on long lists.) Follow-ups: reverse between positions m and n, reverse in k-groups.
:::

::: links
LeetCode 206 | https://leetcode.com/problems/reverse-linked-list/
VisuAlgo: linked list | https://visualgo.net/en/list
:::

=== Merge Two Sorted Lists
@p 3
@tags linked-list, merge, easy
@quick
- **Dummy head** + tail pointer; attach the smaller node each step; attach the remainder at the end.
- **O(n + m) time, O(1) space** (reuses nodes).
- Recursive version is elegant but uses O(n + m) stack.

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

function mergeTwoLists(l1, l2) {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (l1 && l2) {
    if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }
    else { tail.next = l2; l2 = l2.next; }
    tail = tail.next;
  }
  tail.next = l1 || l2; // attach remainder
  return dummy.next;
}

[[[1, 2, 4], [1, 3, 4], '1,1,2,3,4,4'], [[], [], ''], [[], [0], '0'], [[5], [1, 2, 3], '1,2,3,5']].forEach(([a, b, e]) => {
  const r = toArray(mergeTwoLists(fromArray(a), fromArray(b))).join();
  console.log(JSON.stringify(a), JSON.stringify(b), '→', r, r === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Can I reuse the input nodes, or must I create new ones?"* Follow-up: merge **K** sorted lists (heap). See the Heap section.
:::

::: links
LeetCode 21 | https://leetcode.com/problems/merge-two-sorted-lists/
:::

=== Linked List Cycle (fast & slow pointers)
@p 3
@tags linked-list, floyd, two-pointers, easy
@quick
- **Floyd's tortoise & hare**: slow moves 1, fast moves 2; if they meet → cycle; if fast hits null → no cycle.
- **O(n) time, O(1) space** (a Set of visited nodes = O(n) space).
- Cycle start (II): after meeting, reset one pointer to head; move both by 1; the meeting point is the start.

::: text
**Why do they meet?** Inside a cycle, fast gains 1 step on slow every iteration, so the gap shrinks by 1 each time until it hits 0. It can't skip over slow.

**Finding the cycle start:** if the distance from head to the cycle start is `a`, and they meet `b` steps into the cycle, the math gives `a ≡ (cycle length − b)`. So walking from head and from the meeting point at the same speed meets exactly at the start.
:::

::: diagram
flowchart LR
  H["head: 3"] --> N2["2"] --> N0["0"] --> N4["-4"]
  N4 -->|"cycle back"| N2
:::

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
function build(arr, pos) { // pos = index the tail connects to (-1 = no cycle)
  const nodes = arr.map((v) => new ListNode(v));
  nodes.forEach((n, i) => (n.next = nodes[i + 1] || null));
  if (pos >= 0 && nodes.length) nodes[nodes.length - 1].next = nodes[pos];
  return { head: nodes[0] || null, nodes };
}

function hasCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}

function detectCycleStart(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next; fast = fast.next.next;
    if (slow === fast) {
      let p = head;
      while (p !== slow) { p = p.next; slow = slow.next; }
      return p;
    }
  }
  return null;
}

[[[3, 2, 0, -4], 1, true], [[1, 2], 0, true], [[1], -1, false], [[], -1, false]].forEach(([arr, pos, e]) => {
  const { head, nodes } = build(arr, pos);
  const start = detectCycleStart(head);
  const ok = hasCycle(head) === e && (pos < 0 ? start === null : start === nodes[pos]);
  console.log(JSON.stringify(arr), 'pos=' + pos, hasCycle(head), ok ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Detect only, or also return the start node / cycle length?"* The fast/slow pattern also finds the **middle** and appears in "Find the Duplicate Number".
:::

::: links
LeetCode 141 | https://leetcode.com/problems/linked-list-cycle/
LeetCode 142 (cycle start) | https://leetcode.com/problems/linked-list-cycle-ii/
:::

=== Middle of the Linked List
@p 2
@tags linked-list, fast-slow, easy
@quick
- Slow 1 step, fast 2 steps; when fast reaches the end, slow is at the middle.
- For even length this returns the **second** middle (LeetCode's convention).
- **O(n) / O(1)**. Used in merge sort on lists and palindrome-list checks.

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);

function middleNode(head) {
  let slow = head, fast = head;
  while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
  return slow;
}
[[[1, 2, 3, 4, 5], 3], [[1, 2, 3, 4, 5, 6], 4], [[1], 1]].forEach(([a, e]) =>
  console.log(JSON.stringify(a), middleNode(fromArray(a)).val, middleNode(fromArray(a)).val === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"For an even length, first or second middle?"* (Use `while (fast.next && fast.next.next)` for the first.)
:::

::: links
LeetCode 876 | https://leetcode.com/problems/middle-of-the-linked-list/
:::

=== Remove Nth Node From End of List
@p 2
@tags linked-list, two-pointers, medium
@quick
- **Dummy** node before head (handles removing the head).
- Move `fast` n+1 steps ahead, then move both until fast is null → `slow.next` is the node to remove.
- One pass, **O(n) / O(1)**.

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const o = []; while (h) { o.push(h.val); h = h.next; } return o; };

function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head);
  let fast = dummy, slow = dummy;
  for (let i = 0; i <= n; i++) fast = fast.next;   // gap of n nodes between slow and fast
  while (fast) { fast = fast.next; slow = slow.next; }
  slow.next = slow.next.next;
  return dummy.next;
}
[[[1, 2, 3, 4, 5], 2, '1,2,3,5'], [[1], 1, ''], [[1, 2], 1, '1'], [[1, 2], 2, '2']].forEach(([a, n, e]) => {
  const r = toArray(removeNthFromEnd(fromArray(a), n)).join();
  console.log(JSON.stringify(a), 'n=' + n, '→', r, r === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Is n always valid?"* The dummy node trick is worth explaining: it removes the head edge case.
:::

::: links
LeetCode 19 | https://leetcode.com/problems/remove-nth-node-from-end-of-list/
:::

=== Intersection of Two Linked Lists
@p 2
@tags linked-list, two-pointers, easy
@quick
- Two pointers; when one reaches the end, redirect it to the **other** list's head.
- Both travel `lenA + lenB` → they meet at the intersection (or both reach null together).
- **O(n + m) time, O(1) space**. Compare **nodes by reference**, not values.

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }

function getIntersectionNode(headA, headB) {
  let a = headA, b = headB;
  while (a !== b) {
    a = a ? a.next : headB;
    b = b ? b.next : headA;
  }
  return a; // intersection node or null
}

// build: A = 4→1→(8→4→5), B = 5→6→1→(8→4→5)
const shared = new ListNode(8, new ListNode(4, new ListNode(5)));
const A = new ListNode(4, new ListNode(1, shared));
const B = new ListNode(5, new ListNode(6, new ListNode(1, shared)));
console.log('intersection val:', getIntersectionNode(A, B)?.val, getIntersectionNode(A, B) === shared ? '✅' : '❌ FAIL');
const C = new ListNode(2, new ListNode(6));
console.log('no intersection:', getIntersectionNode(A, C), getIntersectionNode(A, C) === null ? '✅' : '❌ FAIL');
:::

::: ask
- *"Can the lists have cycles?"* (That's a harder variant.) *"Must I avoid modifying the lists?"*
:::

::: links
LeetCode 160 | https://leetcode.com/problems/intersection-of-two-linked-lists/
:::

=== Add Two Numbers (linked lists)
@p 2
@tags linked-list, math, medium
@quick
- Digits are stored in **reverse** order → add node by node with a **carry**, like grade-school addition.
- Loop while `l1 || l2 || carry`; dummy head for the result.
- **O(max(n, m))**; handles different lengths and a final carry.

::: code javascript Solution + tests
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const o = []; while (h) { o.push(h.val); h = h.next; } return o; };

function addTwoNumbers(l1, l2) {
  const dummy = new ListNode(0);
  let tail = dummy, carry = 0;
  while (l1 || l2 || carry) {
    const sum = (l1?.val || 0) + (l2?.val || 0) + carry;
    carry = Math.floor(sum / 10);
    tail.next = new ListNode(sum % 10);
    tail = tail.next;
    l1 = l1?.next; l2 = l2?.next;
  }
  return dummy.next;
}
// 342 + 465 = 807 → stored reversed: [2,4,3] + [5,6,4] = [7,0,8]
[[[2, 4, 3], [5, 6, 4], '7,0,8'], [[0], [0], '0'], [[9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9], '8,9,9,9,0,0,0,1']].forEach(([a, b, e]) => {
  const r = toArray(addTwoNumbers(fromArray(a), fromArray(b))).join();
  console.log(JSON.stringify(a), '+', JSON.stringify(b), '=', r, r === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Digits in reverse or forward order?"* (Forward → use stacks or reverse first; LeetCode 445.)
:::

::: links
LeetCode 2 | https://leetcode.com/problems/add-two-numbers/
:::
