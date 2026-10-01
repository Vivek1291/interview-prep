@section DSA: Heap & Graphs
@icon 🕸️
@color #f43f5e
@desc Tier 10 + Tier 11: heap (priority queue) from scratch, top-K, merging, streaming median, then graphs: adjacency lists, BFS/DFS, grids, multi-source BFS, topological sort, cloning and components. Every problem with pictures, dry runs and tests.

=== Heap / Priority Queue basics + Kth Largest Element
@p 3
@tags heap, priority-queue, medium
@quick
- A **heap** is a complete binary tree in an array: children of `i` are `2i + 1`, `2i + 2`; parent is `(i − 1) >> 1`.
- **Min-heap**: parent ≤ children → the smallest is at index 0. `peek` O(1), `push`/`pop` **O(log n)**.
- JavaScript has **no built-in heap**: know how to write one (bubble up / sift down).
- **Kth largest**: keep a **min-heap of size k**; its top is the answer → **O(n log k)**. Quickselect: O(n) average.

::: text 🧾 Problem
Implement a **min-heap** (priority queue), then use it to find the **k-th largest element** in an unsorted array (the k-th largest in sorted order, not the k-th distinct).

**Example 1:** `nums = [3, 2, 1, 5, 6, 4], k = 2 → 5`
**Example 2:** `nums = [3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4 → 4`

**Constraints:** 1 ≤ k ≤ n ≤ 10⁵.
:::

::: text 🧒 Intuition
A **hospital emergency room**: patients don't leave in arrival order but by **priority**; the most urgent is always treated next. A heap is the data structure behind that waiting room: you can always see the most urgent patient instantly, and adding or removing a patient only reshuffles a few people (one per "floor" of the tree), not the whole queue.

For the k-th largest: imagine a **top-k leaderboard** with exactly k seats. A new score only gets in if it beats the **weakest** person on the board, who then leaves. At the end, the weakest person on the board is the k-th best overall.
:::

::: text 🐢 Brute force
**Idea:** sort descending and take index `k − 1`.

`[...nums].sort((a, b) => b - a)[k - 1]`

**Complexity:** O(n log n). Fine in practice, but it does more work than needed (it fully orders all n numbers when we only care about the top k), and the interviewer asks for better. Repeatedly scanning for the maximum k times is O(n · k).
:::

::: text 💡 Key insight
A **min-heap of size k** holds the k largest numbers seen so far, with the smallest of them on top. For each new number: push it; if the heap grows beyond k, pop the smallest. Each step costs O(log k), so the total is O(n log k), and memory is only O(k). At the end, the top **is** the k-th largest.

**Pattern name: Heap / priority queue (top-K with a bounded heap).**
:::

::: diagram Push and pop in a min-heap
flowchart TD
  P["push(x)"] --> P1["add x at the end of the array"]
  P1 --> P2{"x < parent?"}
  P2 -->|"yes"| P3["swap with parent (bubble up)"] --> P2
  P2 -->|"no"| P4["done: O(log n)"]
  Q["pop()"] --> Q1["take the root, move the last element to the root"]
  Q1 --> Q2{"bigger than the smaller child?"}
  Q2 -->|"yes"| Q3["swap with the smaller child (sift down)"] --> Q2
  Q2 -->|"no"| Q4["done: O(log n)"]
:::

::: image Heap basics: min-heap 1 3 2 7 5 4 drawn as a tree and as an array
/images/dsa-heap-graphs/heap-basics.svg
:::

::: text 🔍 Dry run: kth largest, nums = [3, 2, 1, 5, 6, 4], k = 2
| x | heap after push (min on top) | size > k? | pop | heap after |
|---|---|---|---|---|
| 3 | [3] | no | | [3] |
| 2 | [2, 3] | no | | [2, 3] |
| 1 | [1, 3, 2] | yes | 1 | [2, 3] |
| 5 | [2, 3, 5] | yes | 2 | [3, 5] |
| 6 | [3, 5, 6] | yes | 3 | [5, 6] |
| 4 | [4, 6, 5] | yes | 4 | [5, 6] |

Top of the heap = **5** = 2nd largest.
:::

::: code javascript MinHeap from scratch + Kth Largest, with tests (runnable)
/**
 * Binary heap. compare(a, b) < 0 means "a comes out first".
 * Default = min-heap of numbers. push/pop O(log n), peek O(1).
 */
class Heap {
  constructor(compare = (a, b) => a - b) { this.data = []; this.compare = compare; }
  size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(x) {
    const d = this.data;
    d.push(x);                                       // 1) put the new item at the end
    let i = d.length - 1;
    while (i > 0) {                                  // 2) bubble it up while it beats its parent
      const parent = (i - 1) >> 1;
      if (this.compare(d[i], d[parent]) >= 0) break;
      [d[i], d[parent]] = [d[parent], d[i]];
      i = parent;
    }
  }
  pop() {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop();                            // 1) remove the last item
    if (d.length > 0) {
      d[0] = last;                                   // 2) move it to the root
      let i = 0;
      for (;;) {                                     // 3) sift it down to its place
        const l = 2 * i + 1, r = l + 1;
        let best = i;
        if (l < d.length && this.compare(d[l], d[best]) < 0) best = l;
        if (r < d.length && this.compare(d[r], d[best]) < 0) best = r;
        if (best === i) break;                       // both children are worse → done
        [d[i], d[best]] = [d[best], d[i]];
        i = best;
      }
    }
    return top;
  }
}

/** Kth largest with a min-heap of size k. Time O(n log k), Space O(k). */
function findKthLargest(nums, k) {
  const heap = new Heap();              // min-heap: the weakest of the top k is on top
  for (const x of nums) {
    heap.push(x);
    if (heap.size() > k) heap.pop();    // too many → drop the smallest
  }
  return heap.peek();
}

// ---------- tests ----------
const h = new Heap();
[5, 3, 8, 1, 9, 2].forEach((x) => h.push(x));
const sorted = [];
while (h.size()) sorted.push(h.pop());
console.log('heap pops in order:', sorted.join(), sorted.join() === '1,2,3,5,8,9' ? '✅' : '❌ FAIL');

const maxHeap = new Heap((a, b) => b - a);            // flip the comparator → max-heap
[4, 10, 7].forEach((x) => maxHeap.push(x));
console.log('max-heap top:', maxHeap.peek(), maxHeap.peek() === 10 ? '✅' : '❌ FAIL');

const cases = [
  [[3, 2, 1, 5, 6, 4], 2, 5],
  [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4, 4],   // duplicates count separately
  [[1], 1, 1],
  [[-1, -2, -3], 1, -1],
];
for (const [nums, k, expected] of cases) {
  const got = findKthLargest(nums, k);
  const viaSort = [...nums].sort((a, b) => b - a)[k - 1];
  console.log(JSON.stringify(nums), 'k =', k, '→', got, got === expected && viaSort === expected ? '✅' : '❌ FAIL');
}
const big = Array.from({ length: 100000 }, (_, i) => (i * 7919) % 100003);
console.log('100,000 numbers, k = 10 →', findKthLargest(big, 10), findKthLargest(big, 10) === [...big].sort((a, b) => b - a)[9] ? '✅' : '❌ FAIL');
:::

::: chart line Work for n numbers with k = 10: sort (n log n) vs heap of size k (n log k)
n,Sort n·log2 n,Heap n·log2 k
100,664,332
1000,9966,3322
10000,132877,33219
100000,1660964,332193
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Sort and index | O(n log n) | O(n) (copy) | One line | Sorts everything | Quick answer |
| Find the max k times | O(n · k) | O(1) | No structure | Slow for big k | k is tiny (1–3) |
| **Min-heap of size k** | **O(n log k)** | **O(k)** | Works on streams, small memory | Need to write a heap in JS | Default answer / streaming |
| Quickselect | O(n) average, O(n²) worst | O(1) | Fastest on average | Worst case; mutates input | When asked for O(n) average |
| Counting sort (small value range) | O(n + range) | O(range) | Linear | Only for bounded integers | Values are small integers |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using a **max-heap of all n** items and popping k times: O(n + k log n), uses O(n) memory, and misses the point.
- Forgetting to pop when the heap exceeds **k** (or popping at size k instead of k + 1).
- Using `Array.prototype.sort` as a "priority queue" by re-sorting after every insert: O(n log n) per push.
- Off-by-one in the parent/children index formulas.
:::

::: understand
- Heaps answer "give me the best item **right now**, repeatedly" efficiently. Used in [Top K Frequent Elements](https://leetcode.com/problems/top-k-frequent-elements/), [Merge k Sorted Lists](https://leetcode.com/problems/merge-k-sorted-lists/), [Find Median from Data Stream](https://leetcode.com/problems/find-median-from-data-stream/), Dijkstra's shortest path, task schedulers and timers.
- A heap is **not** sorted: only the top is guaranteed; siblings are in any order.
:::

::: ask
- *"k-th largest in sorted order (counting duplicates) or k-th distinct?"*
- *"Is the data fixed or a stream?"* (Stream → heap.)
- *"Is O(n log n) acceptable, or do you want better?"*
:::

::: important ⭐ How to explain it in the interview
> "A heap is a complete binary tree stored in an array, where each parent beats its children, so the best element is always at index 0. Push adds at the end and bubbles up; pop moves the last element to the root and sifts it down; both are O(log n). For the k-th largest I keep a min-heap of size k: push each number and pop when the size exceeds k. The heap then holds the k largest numbers and its top is the k-th largest. O(n log k) time and O(k) space, versus O(n log n) for sorting. Quickselect would give O(n) on average."
:::

::: links
LeetCode 215: Kth Largest Element in an Array | https://leetcode.com/problems/kth-largest-element-in-an-array/
NeetCode video: Kth Largest Element in an Array | https://www.youtube.com/results?search_query=neetcode+kth+largest+element+in+an+array
VisuAlgo: binary heap | https://visualgo.net/en/heap
:::

=== Merge K Sorted Lists
@p 2
@tags heap, linked-list, hard
@quick
- Put the **head of each list** in a **min-heap**; pop the smallest, append it, push its `next`.
- **O(N log k)** time (N = total nodes, k = lists), **O(k)** heap space.
- Alternative: **divide & conquer** pairwise merging, also O(N log k), O(log k) stack.
- Merging lists one by one into a growing result is O(N · k).

::: text 🧾 Problem
You are given `k` linked lists, each sorted ascending. Merge them all into **one sorted linked list** and return its head.

**Example 1:** `[[1,4,5], [1,3,4], [2,6]] → 1→1→2→3→4→4→5→6`
**Example 2:** `[] → []`; `[[]] → []`

**Constraints:** 0 ≤ k ≤ 10⁴, total nodes N ≤ 10⁴.
:::

::: text 🧒 Intuition
k **checkout lines**, each already sorted by ticket number. To call customers in global ticket order, a supervisor only needs to look at the **first person of each line**, call the smallest ticket, and then look at the person who stepped up in that line. A heap is the supervisor's "who's next among the line fronts?" board.
:::

::: text 🐢 Brute force
**Idea A:** collect all values, sort, build a new list → O(N log N) time, O(N) space.
**Idea B:** merge list 1 with list 2, then the result with list 3, and so on. The growing result is re-walked every time → **O(N · k)**. With k = 10⁴ lists of 1 node each that's ~5 × 10⁷ node visits.
:::

::: text 💡 Key insight
The next node of the merged list is always the **smallest of the k current heads**. Keeping those k heads in a min-heap gives the smallest in O(log k) instead of scanning all k. Each of the N nodes is pushed and popped once → O(N log k).

**Pattern name: K-way merge with a heap.**
:::

::: diagram K-way merge
flowchart TD
  A["push every non-empty head into a min-heap"] --> B{"heap empty?"}
  B -->|"yes"| R["return dummy.next"]
  B -->|"no"| C["node = pop() (smallest head)"]
  C --> D["tail.next = node, tail = node"]
  D --> E{"node.next exists?"}
  E -->|"yes"| F["push node.next"] --> B
  E -->|"no"| B
:::

::: image Merge K Sorted Lists: the k heads sit in a min-heap
/images/dsa-heap-graphs/merge-k-lists.svg
:::

::: text 🔍 Dry run: [[1,4,5], [1,3,4], [2,6]]
| Step | heap (values) | pop | result so far | push |
|---|---|---|---|---|
| start | 1a, 1b, 2 | | | |
| 1 | 1a, 1b, 2 | 1 (list 1) | 1 | 4 (list 1) |
| 2 | 1b, 2, 4 | 1 (list 2) | 1→1 | 3 (list 2) |
| 3 | 2, 3, 4 | 2 (list 3) | 1→1→2 | 6 |
| 4 | 3, 4, 6 | 3 | …→3 | 4 (list 2) |
| 5 | 4, 4, 6 | 4 | …→4 | 5 (list 1) |
| 6 | 4, 5, 6 | 4 | …→4 | – |
| 7 | 5, 6 | 5 | …→5 | – |
| 8 | 6 | 6 | 1→1→2→3→4→4→5→6 | – |
:::

::: code javascript Optimal solution with tests (runnable)
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (arr) => arr.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (head) => { const out = []; while (head) { out.push(head.val); head = head.next; } return out; };

/** Minimal binary min-heap with a comparator (see the Heap question for comments). */
class Heap {
  constructor(cmp) { this.d = []; this.cmp = cmp; }
  size() { return this.d.length; }
  push(x) { const d = this.d; d.push(x); let i = d.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(d[i], d[p]) >= 0) break; [d[i], d[p]] = [d[p], d[i]]; i = p; } }
  pop() { const d = this.d, top = d[0], last = d.pop(); if (d.length) { d[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let b = i; if (l < d.length && this.cmp(d[l], d[b]) < 0) b = l; if (r < d.length && this.cmp(d[r], d[b]) < 0) b = r; if (b === i) break; [d[i], d[b]] = [d[b], d[i]]; i = b; } } return top; }
}

/**
 * Merge k sorted lists. Time O(N log k), Space O(k).
 */
function mergeKLists(lists) {
  const heap = new Heap((a, b) => a.val - b.val);  // compares nodes by value
  for (const head of lists) if (head) heap.push(head); // one head per list
  const dummy = new ListNode(0);
  let tail = dummy;
  while (heap.size()) {
    const node = heap.pop();          // smallest current head among all lists
    tail.next = node;                 // append it
    tail = node;
    if (node.next) heap.push(node.next); // its successor becomes that list's new head
  }
  return dummy.next;
}

/** Divide & conquer alternative: merge pairs of lists, log k rounds. */
function mergeTwo(a, b) {
  const dummy = new ListNode(0); let t = dummy;
  while (a && b) { if (a.val <= b.val) { t.next = a; a = a.next; } else { t.next = b; b = b.next; } t = t.next; }
  t.next = a || b;
  return dummy.next;
}
function mergeKDivide(lists) {
  if (!lists.length) return null;
  while (lists.length > 1) {
    const next = [];
    for (let i = 0; i < lists.length; i += 2) next.push(mergeTwo(lists[i], lists[i + 1] || null));
    lists = next;
  }
  return lists[0];
}

// ---------- tests ----------
const cases = [
  [[[1, 4, 5], [1, 3, 4], [2, 6]], [1, 1, 2, 3, 4, 4, 5, 6]],
  [[], []],
  [[[]], []],
  [[[2], [], [1]], [1, 2]],
  [[[-3, 0], [-5, 10], [7]], [-5, -3, 0, 7, 10]],
];
for (const [arrs, expected] of cases) {
  const a = toArray(mergeKLists(arrs.map(fromArray)));
  const b = toArray(mergeKDivide(arrs.map(fromArray)));
  console.log(JSON.stringify(arrs), '→', JSON.stringify(a), JSON.stringify(a) === JSON.stringify(expected) && JSON.stringify(b) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
:::

::: chart line Node steps with N = 10,000 total nodes: merge one by one (N·k/2) vs heap (N log2 k)
k (lists),One by one ~N·k/2,Heap ~N·log2 k
2,10000,10000
10,50000,33219
100,500000,66439
1000,5000000,99658
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Collect + sort + rebuild | O(N log N) | O(N) | Simple | New nodes, ignores sortedness | Quick scripts |
| Merge one by one | O(N · k) | O(1) | Re-uses Merge Two Lists | Slow for many lists | k is tiny |
| **Min-heap of heads** | **O(N log k)** | **O(k)** | Optimal, streams well | Needs a heap | Default answer |
| Divide & conquer pairs | O(N log k) | O(log k) or O(1) | No heap needed in JS | Slightly more code | When you'd rather not write a heap |
:::

::: warning ⚠️ Common mistakes / edge cases
- Pushing `null` heads (empty lists) into the heap.
- Comparing nodes directly instead of by `.val`.
- Forgetting to push `node.next` after popping.
- Re-sorting an array of heads after every pop (O(k log k) per node).
:::

::: understand
- "K-way merge" appears in external sorting (merging sorted chunks from disk), log merging and [Find K Pairs with Smallest Sums](https://leetcode.com/problems/find-k-pairs-with-smallest-sums/), [Kth Smallest Element in a Sorted Matrix](https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/), [Smallest Range Covering Elements from K Lists](https://leetcode.com/problems/smallest-range-covering-elements-from-k-lists/).
:::

::: ask
- *"How many lists and how many nodes in total?"*
- *"Can lists be empty?"*
- *"Re-use the nodes or create new ones?"*
:::

::: important ⭐ How to explain it in the interview
> "The next node of the merged list is always the smallest among the k current heads, so I keep the heads in a min-heap keyed by value. I pop the smallest, append it to the result through a dummy node, and push that node's next if it exists. Each of the N nodes goes in and out of a heap of size at most k, so it's O(N log k) time and O(k) space. Without a heap, I'd merge lists in pairs, divide-and-conquer style, which has the same complexity."
:::

::: links
LeetCode 23: Merge k Sorted Lists | https://leetcode.com/problems/merge-k-sorted-lists/
NeetCode video: Merge K Sorted Lists | https://www.youtube.com/results?search_query=neetcode+merge+k+sorted+lists
:::

=== Find Median from Data Stream
@p 2
@tags heap, two-heaps, hard
@quick
- **Two heaps**: `low` = **max-heap** of the smaller half, `high` = **min-heap** of the bigger half.
- Keep `low.size === high.size` or `low.size === high.size + 1`; every value in low ≤ every value in high.
- Median = `low.top` (odd count) or `(low.top + high.top) / 2` (even count).
- `addNum` **O(log n)**, `findMedian` **O(1)**.

::: text 🧾 Problem
Design a structure with `addNum(x)` (numbers arrive one by one) and `findMedian()` (the middle value of all numbers so far; the average of the two middle values if the count is even).

**Example:** add 1, add 2 → median 1.5; add 3 → median 2.

**Constraints:** up to 5 × 10⁴ calls; values between −10⁵ and 10⁵.
:::

::: text 🧒 Intuition
Split a **class lined up by height** into two groups: the shorter half and the taller half. In the short group you only care about the **tallest** short person; in the tall group about the **shortest** tall person. The median is standing right at the border between those two people. When a new student arrives, put them in the right group and, if one group gets too big, move one border person across.
:::

::: text 🐢 Brute force
**Idea A:** keep all numbers in an array; on `findMedian` sort and take the middle → O(n log n) per query.
**Idea B:** keep the array **sorted** by inserting each number at its position (binary search + `splice`) → findMedian O(1), but `splice` shifts elements → **O(n) per add**. For 5 × 10⁴ adds that's ~10⁹ element moves in the worst case.
:::

::: text 💡 Key insight
The median only depends on the **two numbers at the middle border**. A max-heap gives the biggest of the lower half in O(1) and a min-heap the smallest of the upper half in O(1); keeping their sizes balanced keeps the border exactly in the middle. Each add is a couple of O(log n) heap operations.

**Pattern name: Two heaps (balanced halves).**
:::

::: diagram Adding a number
flowchart TD
  A["addNum(x)"] --> B["push x into low (max-heap)"]
  B --> C["move low's top to high (keeps every low ≤ every high)"]
  C --> D{"high.size > low.size?"}
  D -->|"yes"| E["move high's top back to low"]
  D -->|"no"| F["done"]
  E --> F
  G["findMedian()"] --> H{"sizes equal?"}
  H -->|"yes"| I["(low.top + high.top) / 2"]
  H -->|"no"| J["low.top"]
:::

::: image Find Median from Data Stream: max-heap 5 1 3 and min-heap 8 15, median 5
/images/dsa-heap-graphs/median-stream.svg
:::

::: text 🔍 Dry run: add 5, 15, 1, 3, 8
| add | low (max-heap) | high (min-heap) | median |
|---|---|---|---|
| 5 | [5] | [] | 5 |
| 15 | [5] | [15] | (5 + 15) / 2 = 10 |
| 1 | [5, 1] | [15] | 5 |
| 3 | [3, 1] | [5, 15] | (3 + 5) / 2 = 4 |
| 8 | [5, 3, 1] | [8, 15] | **5** |

After each add: push into low, move low's max to high, and if high is bigger move its min back to low.
:::

::: code javascript Optimal solution with tests (runnable)
/** Minimal binary heap with a comparator. */
class Heap {
  constructor(cmp) { this.d = []; this.cmp = cmp; }
  size() { return this.d.length; }
  peek() { return this.d[0]; }
  push(x) { const d = this.d; d.push(x); let i = d.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(d[i], d[p]) >= 0) break; [d[i], d[p]] = [d[p], d[i]]; i = p; } }
  pop() { const d = this.d, top = d[0], last = d.pop(); if (d.length) { d[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let b = i; if (l < d.length && this.cmp(d[l], d[b]) < 0) b = l; if (r < d.length && this.cmp(d[r], d[b]) < 0) b = r; if (b === i) break; [d[i], d[b]] = [d[b], d[i]]; i = b; } } return top; }
}

/**
 * Streaming median with two heaps. addNum O(log n), findMedian O(1).
 */
class MedianFinder {
  constructor() {
    this.low = new Heap((a, b) => b - a);  // max-heap: the smaller half, biggest on top
    this.high = new Heap((a, b) => a - b); // min-heap: the bigger half, smallest on top
  }
  addNum(x) {
    this.low.push(x);                       // 1) tentatively put x in the lower half
    this.high.push(this.low.pop());         // 2) move the biggest of the lower half up (keeps order)
    if (this.high.size() > this.low.size()) {
      this.low.push(this.high.pop());       // 3) rebalance: low may have one extra, never fewer
    }
  }
  findMedian() {
    if (this.low.size() === 0) return null;
    if (this.low.size() > this.high.size()) return this.low.peek();   // odd count
    return (this.low.peek() + this.high.peek()) / 2;                  // even count
  }
}

// ---------- tests ----------
const mf = new MedianFinder();
const steps = [[5, 5], [15, 10], [1, 5], [3, 4], [8, 5]];
for (const [x, expected] of steps) {
  mf.addNum(x);
  const got = mf.findMedian();
  console.log('add', x, '→ median', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
// random cross-check against sorting
let allOk = true;
const m2 = new MedianFinder(), seen = [];
for (let i = 0; i < 500; i++) {
  const x = Math.floor(Math.random() * 200) - 100;
  m2.addNum(x); seen.push(x);
  const s = [...seen].sort((a, b) => a - b), n = s.length;
  const expected = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  if (m2.findMedian() !== expected) allOk = false;
}
console.log('500 random adds match sort-based medians', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Element moves for n adds: sorted array with splice (~n²/4) vs two heaps (~3·n·log2 n)
n,Sorted array + splice,Two heaps
100,2500,1993
1000,250000,29897
10000,25000000,398631
50000,625000000,2340000
:::

::: text ⚖️ Trade-offs
| Approach | addNum | findMedian | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Unsorted array, sort on query | O(1) | O(n log n) | Trivial | Slow queries | Rare queries |
| Sorted array (binary search + splice) | O(n) | O(1) | Simple | Slow inserts | Small n |
| **Two heaps** | **O(log n)** | **O(1)** | Balanced performance | Two heaps to maintain | Default answer |
| Balanced BST / order-statistic tree | O(log n) | O(log n) | Supports deletes, any percentile | Not built into JS | Sliding-window median |
| Counting buckets (bounded values, e.g. 0–100) | O(1) | O(range) | Very fast | Only for small value ranges | Follow-up "values in 0..100" |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using a **min-heap for the lower half** (you need its **maximum**).
- Not keeping every value of `low` ≤ every value of `high` (pushing directly into the "smaller" heap without the move).
- Integer division for the even case (JS `/` is fine; in other languages watch it).
- Calling `findMedian()` with no numbers.
:::

::: understand
- "Two heaps around a border" also solves [Sliding Window Median](https://leetcode.com/problems/sliding-window-median/) (with lazy deletion) and [IPO](https://leetcode.com/problems/ipo/). The same idea tracks any percentile (e.g. p90 latency) by changing the size ratio.
:::

::: ask
- *"Are values bounded?"* (Small range → counting buckets.)
- *"Do we ever remove numbers?"* (Then two heaps need lazy deletion, or use a balanced BST.)
- *"How many queries vs inserts?"*
:::

::: important ⭐ How to explain it in the interview
> "I keep two heaps: a max-heap with the smaller half and a min-heap with the bigger half, sizes equal or the lower half one bigger. To add, I push into the lower half, move its maximum to the upper half so the order is preserved, and if the upper half became bigger I move its minimum back. The median is the top of the lower half for an odd count, or the average of both tops for an even count. Adding is O(log n) and finding the median O(1)."
:::

::: links
LeetCode 295: Find Median from Data Stream | https://leetcode.com/problems/find-median-from-data-stream/
NeetCode video: Find Median from Data Stream | https://www.youtube.com/results?search_query=neetcode+find+median+from+data+stream
:::

=== K Closest Points to Origin
@p 1
@tags heap, sorting, medium
@quick
- Compare **squared distance** `x² + y²` (no `Math.sqrt` needed: it preserves the order).
- **Max-heap of size k** (evict the farthest) → **O(n log k)**; sort → O(n log n); quickselect → O(n) average.
- The answer can be in **any order**.
- Same "top K" pattern as Kth Largest.

::: text 🧾 Problem
Given an array of points `[x, y]` and an integer `k`, return the `k` points **closest to the origin** `(0, 0)` (Euclidean distance), in any order.

**Example 1:** `points = [[1,3], [-2,2]], k = 1 → [[-2,2]]` (distances √10 vs √8).
**Example 2:** `points = [[3,3], [5,-1], [-2,4]], k = 2 → [[3,3], [-2,4]]`

**Constraints:** 1 ≤ k ≤ n ≤ 10⁴.
:::

::: text 🧒 Intuition
You're looking for the **k nearest coffee shops** to your home on a map. You keep a shortlist of k shops; whenever a new shop is closer than the **farthest** one on your shortlist, that farthest one gets kicked out. A max-heap keeps "the farthest on the shortlist" on top, ready to be replaced.
:::

::: text 🐢 Brute force
**Idea:** compute every distance, sort all points by distance, take the first k.

`points.sort((a, b) => dist(a) - dist(b)).slice(0, k)`

**Complexity:** O(n log n). Fine for 10⁴ points, but for a stream of millions of GPS points you can't keep and sort everything; with a heap you keep only k.
:::

::: text 💡 Key insight
We only need the k smallest distances, not a full order. A **max-heap bounded at k** keeps the k closest seen so far, with the farthest of them on top; any new point closer than that top replaces it. Also, comparing `x² + y²` gives the same order as comparing `√(x² + y²)`, so skip the square root.

**Pattern name: Top-K with a bounded heap.**
:::

::: diagram Bounded max-heap
flowchart TD
  A["for each point p"] --> B["d = x² + y²"]
  B --> C["push (d, p) into a MAX-heap"]
  C --> D{"heap size > k?"}
  D -->|"yes"| E["pop the farthest"] --> A
  D -->|"no"| A
  A -->|"done"| F["return the points in the heap"]
:::

::: image K Closest Points: the two closest points by squared distance are (-1,1) and (1,-2)
/images/dsa-heap-graphs/k-closest.svg
:::

::: text 🔍 Dry run: points = [[3,3], [5,-1], [-2,4]], k = 2
| point | x² + y² | max-heap after push (farthest on top) | pop? | heap after |
|---|---|---|---|---|
| (3,3) | 18 | [18] | no | [18] |
| (5,-1) | 26 | [26, 18] | no | [26, 18] |
| (-2,4) | 20 | [26, 18, 20] | size 3 > 2 → pop 26 | [20, 18] |

Answer: `(3,3)` and `(-2,4)`.
:::

::: code javascript Optimal solution with tests (runnable)
/** Minimal binary heap with a comparator. */
class Heap {
  constructor(cmp) { this.d = []; this.cmp = cmp; }
  size() { return this.d.length; }
  push(x) { const d = this.d; d.push(x); let i = d.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(d[i], d[p]) >= 0) break; [d[i], d[p]] = [d[p], d[i]]; i = p; } }
  pop() { const d = this.d, top = d[0], last = d.pop(); if (d.length) { d[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let b = i; if (l < d.length && this.cmp(d[l], d[b]) < 0) b = l; if (r < d.length && this.cmp(d[r], d[b]) < 0) b = r; if (b === i) break; [d[i], d[b]] = [d[b], d[i]]; i = b; } } return top; }
}

const dist2 = ([x, y]) => x * x + y * y;   // squared distance: same order as the real distance

/**
 * K closest points with a max-heap of size k. Time O(n log k), Space O(k).
 */
function kClosest(points, k) {
  const heap = new Heap((a, b) => dist2(b) - dist2(a)); // MAX-heap by distance: farthest on top
  for (const p of points) {
    heap.push(p);
    if (heap.size() > k) heap.pop();       // evict the farthest of the k + 1
  }
  return heap.d;                           // any order is accepted
}

/** Sort version for cross-checking: O(n log n). */
const kClosestSort = (points, k) => [...points].sort((a, b) => dist2(a) - dist2(b)).slice(0, k);

// ---------- tests ----------
const norm = (pts) => JSON.stringify(pts.map((p) => p.join(',')).sort());
const cases = [
  [[[1, 3], [-2, 2]], 1, [[-2, 2]]],
  [[[3, 3], [5, -1], [-2, 4]], 2, [[3, 3], [-2, 4]]],
  [[[0, 1], [1, 0]], 2, [[0, 1], [1, 0]]],   // k = n
  [[[3, 3], [5, -1], [-2, 4], [1, -2], [-1, 1]], 2, [[-1, 1], [1, -2]]],
];
for (const [pts, k, expected] of cases) {
  const got = kClosest(pts, k);
  console.log(JSON.stringify(pts), 'k =', k, '→', JSON.stringify(got), norm(got) === norm(expected) && norm(kClosestSort(pts, k)) === norm(expected) ? '✅' : '❌ FAIL');
}
:::

::: chart line Work for n points with k = 10: sort vs bounded heap
n,Sort n·log2 n,Heap n·log2 k
100,664,332
1000,9966,3322
10000,132877,33219
100000,1660964,332193
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Sort by distance | O(n log n) | O(n) | One line | Sorts everything | Small fixed input |
| **Max-heap of size k** | **O(n log k)** | **O(k)** | Works on streams, low memory | Need a heap in JS | Default / streaming |
| Quickselect | O(n) average | O(1) | Fastest on average | O(n²) worst; mutates input | Big fixed array |
| Min-heap of all n, pop k | O(n + k log n) | O(n) | Simple with heapify | O(n) memory | When you already have all points |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using a **min-heap** of size k (it would evict the closest points).
- Computing `Math.sqrt` (unnecessary and slower; floating point noise).
- Integer overflow of `x² + y²` in other languages (fine in JS for these ranges).
- Assuming the output must be sorted.
:::

::: understand
- Same "bounded heap for top-K" as [Kth Largest Element](https://leetcode.com/problems/kth-largest-element-in-an-array/) and [Top K Frequent Elements](https://leetcode.com/problems/top-k-frequent-elements/); quickselect is the O(n) average alternative ([Kth Largest](https://leetcode.com/problems/kth-largest-element-in-an-array/) editorial).
:::

::: ask
- *"Does the output need to be sorted?"*
- *"Is the input fixed or a stream?"*
- *"Ties at the same distance: any of them?"*
:::

::: important ⭐ How to explain it in the interview
> "I compare squared distances, which keeps the order without a square root. I keep a max-heap of at most k points keyed by distance: push each point, and if the heap exceeds k, pop the farthest. At the end the heap holds the k closest. O(n log k) time and O(k) space, which also works for a stream. Sorting is O(n log n), and quickselect gives O(n) on average."
:::

::: links
LeetCode 973: K Closest Points to Origin | https://leetcode.com/problems/k-closest-points-to-origin/
NeetCode video: K Closest Points to Origin | https://www.youtube.com/results?search_query=neetcode+k+closest+points+to+origin
:::

=== Graph fundamentals: adjacency list, BFS, DFS, visited set
@p 3
@tags graphs, bfs, dfs
@quick
- A graph = **nodes (vertices) + edges**. Store it as an **adjacency list**: `Map<node, neighbours[]>` (O(V + E) memory).
- **BFS** (queue): level by level → **shortest path in an unweighted graph**. **DFS** (stack/recursion): go deep → paths, cycles, components.
- Always keep a **visited** set, or cycles make you loop forever.
- Both run in **O(V + E)** time.

::: text 🧾 Problem
Given `n` nodes (0 … n−1) and a list of **undirected** edges, build the graph and return:
1. the **BFS order** starting from node 0,
2. the **DFS order** starting from node 0,
3. the **shortest number of edges** from node 0 to every node (−1 if unreachable).

**Example:** `n = 5, edges = [[0,1],[0,2],[1,3],[2,3],[2,4]]` → BFS `[0,1,2,3,4]`, DFS `[0,1,3,2,4]`, distances `[0,1,1,2,2]`.

**Constraints:** up to 10⁵ nodes and edges.

*Vocabulary: a **vertex** is a node; an **edge** connects two vertices; **directed** edges go one way (a → b), **undirected** both ways; **neighbours** of a node are the nodes it has an edge to.*
:::

::: text 🧒 Intuition
A graph is a **map of cities connected by roads**.
- **BFS** is like **ripples in a pond** (or news spreading): first everyone 1 road away, then everyone 2 roads away… That's why the first time BFS reaches a city, it used the fewest roads.
- **DFS** is like **exploring a maze**: follow one corridor as deep as it goes, and only back up when you hit a dead end.
- The **visited set** is the chalk mark on cities you've already been to, so you don't drive in circles forever.
:::

::: text 🐢 Brute force
**Storing the graph:** an **edge list** (just the array of pairs) means "who are my neighbours?" requires scanning all E edges → O(E) per lookup, so a traversal becomes **O(V · E)** (10¹⁰ for 10⁵ each). An **adjacency matrix** (V × V booleans) gives O(1) edge checks but uses O(V²) memory (10¹⁰ cells for 10⁵ nodes) and O(V) to list neighbours.

**Traversing without a visited set:** in a graph with a cycle, BFS/DFS never stops.
:::

::: text 💡 Key insight
Convert the edges once into an **adjacency list** (each node → array of neighbours). Then a traversal touches every node once and every edge a constant number of times: **O(V + E)**. BFS uses a queue (first in, first out → levels); DFS uses a stack or recursion (last in, first out → depth). Mark nodes **when you discover them** so each is queued once.

**Pattern name: Graph traversal (BFS / DFS + visited).**
:::

::: diagram BFS vs DFS
flowchart LR
  subgraph BFSBOX["BFS (queue)"]
    B1["enqueue start, mark visited"] --> B2["dequeue node"]
    B2 --> B3["for each unvisited neighbour: mark + enqueue"]
    B3 --> B2
  end
  subgraph DFSBOX["DFS (recursion)"]
    D1["dfs(node): mark visited"] --> D2["for each unvisited neighbour"]
    D2 --> D3["dfs(neighbour)"]
    D3 --> D2
  end
:::

::: image Graph fundamentals: a 5-node graph, its adjacency list, BFS and DFS orders
/images/dsa-heap-graphs/graph-basics.svg
:::

::: text 🔍 Dry run: BFS from 0 on the example graph
Adjacency list: 0: [1, 2] · 1: [0, 3] · 2: [0, 3, 4] · 3: [1, 2] · 4: [2]
| Step | dequeue | its neighbours | newly discovered (dist) | queue after |
|---|---|---|---|---|
| start | | | 0 (0) | [0] |
| 1 | 0 | 1, 2 | 1 (1), 2 (1) | [1, 2] |
| 2 | 1 | 0 ✓, 3 | 3 (2) | [2, 3] |
| 3 | 2 | 0 ✓, 3 ✓, 4 | 4 (2) | [3, 4] |
| 4 | 3 | 1 ✓, 2 ✓ | – | [4] |
| 5 | 4 | 2 ✓ | – | [] |

BFS order `0, 1, 2, 3, 4`, distances `[0, 1, 1, 2, 2]` (✓ = already visited).
:::

::: code javascript Build + BFS + DFS + shortest distances, with tests (runnable)
/** Build an adjacency list for an undirected graph. O(V + E). */
function buildGraph(n, edges) {
  const adj = Array.from({ length: n }, () => []);  // adj[u] = neighbours of u
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);                                 // undirected: add both directions
  }
  return adj;
}

/** BFS order + distances (number of edges) from start. O(V + E). */
function bfs(adj, start) {
  const dist = new Array(adj.length).fill(-1);       // -1 = not reached (also our "visited" marker)
  const order = [];
  const queue = [start];
  let head = 0;                                      // index instead of queue.shift() → O(1) dequeue
  dist[start] = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const v of adj[u]) {
      if (dist[v] === -1) {                          // first time we see v → shortest distance
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return { order, dist };
}

/** DFS order (recursive). O(V + E). */
function dfs(adj, start) {
  const visited = new Array(adj.length).fill(false), order = [];
  (function go(u) {
    visited[u] = true;                               // mark before exploring neighbours
    order.push(u);
    for (const v of adj[u]) if (!visited[v]) go(v);
  })(start);
  return order;
}

/** DFS with an explicit stack (no recursion limit). Order may differ from the recursive one. */
function dfsIterative(adj, start) {
  const visited = new Array(adj.length).fill(false), order = [], stack = [start];
  while (stack.length) {
    const u = stack.pop();
    if (visited[u]) continue;
    visited[u] = true;
    order.push(u);
    for (let i = adj[u].length - 1; i >= 0; i--) if (!visited[adj[u][i]]) stack.push(adj[u][i]); // reverse → same order as recursion
  }
  return order;
}

// ---------- tests ----------
const adj = buildGraph(5, [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4]]);
const { order, dist } = bfs(adj, 0);
const checks = [
  ['BFS order', order, [0, 1, 2, 3, 4]],
  ['distances', dist, [0, 1, 1, 2, 2]],
  ['DFS order', dfs(adj, 0), [0, 1, 3, 2, 4]],
  ['DFS iterative', dfsIterative(adj, 0), [0, 1, 3, 2, 4]],
];
const disconnected = buildGraph(4, [[0, 1]]);
checks.push(['unreachable nodes = -1', bfs(disconnected, 0).dist, [0, 1, -1, -1]]);
const cycle = buildGraph(3, [[0, 1], [1, 2], [2, 0]]);
checks.push(['cycle terminates', bfs(cycle, 0).order, [0, 1, 2]]);
for (const [name, got, expected] of checks) console.log(name, '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
:::

::: chart line Neighbour lookups for a full traversal (E = 2V): edge list scan (V·E) vs adjacency list (V + E)
V,Edge list V·E,Adjacency list V + E
10,200,30
100,20000,300
1000,2000000,3000
10000,200000000,30000
:::

::: text ⚖️ Trade-offs
| Representation / method | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Edge list | O(E) per neighbour query | O(E) | As given in the input | Slow traversals | Only as input / for Kruskal |
| Adjacency matrix | O(1) edge check, O(V) neighbours | O(V²) | Simple for dense graphs | Huge for big sparse graphs | Small or dense graphs |
| **Adjacency list** | **O(deg) neighbours** | **O(V + E)** | Best for typical (sparse) graphs | Edge check is O(deg) | Default |
| **BFS** | O(V + E) | O(V) | Shortest path (unweighted), levels | Queue memory on wide graphs | Shortest hops, levels |
| **DFS** | O(V + E) | O(V) | Paths, cycles, components, topological sort | Recursion depth | Explore / detect structure |
:::

::: warning ⚠️ Common mistakes / edge cases
- No **visited** set → infinite loop on any cycle.
- Marking visited when **dequeuing** instead of when **enqueuing** → the same node is queued many times.
- Forgetting the reverse edge for **undirected** graphs.
- Using DFS for shortest paths (it finds *a* path, not the shortest).
- Disconnected graphs: one traversal doesn't reach everything; loop over all nodes if needed.
:::

::: understand
- Almost every graph problem is BFS or DFS plus a small twist: [Number of Islands](https://leetcode.com/problems/number-of-islands/) (grid as a graph), [Rotting Oranges](https://leetcode.com/problems/rotting-oranges/) (multi-source BFS), [Course Schedule](https://leetcode.com/problems/course-schedule/) (directed, cycles), [Clone Graph](https://leetcode.com/problems/clone-graph/) (visited map), [Word Ladder](https://leetcode.com/problems/word-ladder/) (BFS on implicit graph).
- Weighted shortest paths need **Dijkstra** (BFS + heap).
:::

::: ask
- *"Directed or undirected? Weighted?"*
- *"Can it have cycles? Can it be disconnected?"*
- *"How are nodes given: numbers 0..n−1, strings, objects?"*
- *"How big: V and E?"*
:::

::: important ⭐ How to explain it in the interview
> "I first build an adjacency list from the edges, O(V + E) memory. BFS uses a queue and explores level by level, so the first time it reaches a node it's via the fewest edges, which gives shortest paths in unweighted graphs. DFS uses recursion or a stack and goes deep first, which suits paths, cycles and components. In both I mark nodes as visited when I discover them so cycles don't loop forever. Both run in O(V + E) time."
:::

::: links
VisuAlgo: graph traversal (BFS/DFS) | https://visualgo.net/en/dfsbfs
NeetCode: graphs playlist | https://www.youtube.com/results?search_query=neetcode+graph+bfs+dfs
LeetCode 1971: Find if Path Exists in Graph | https://leetcode.com/problems/find-if-path-exists-in-graph/
:::

=== Number of Islands
@p 3
@tags graphs, dfs, bfs, grid, medium
@quick
- Treat the grid as a graph: each `"1"` cell connects to its **4 neighbours** (up, down, left, right).
- Scan every cell; on an unvisited `"1"`: `count++` and **flood** (DFS/BFS) the whole island, marking it visited.
- **O(rows × cols)** time; each cell visited once.
- Marking: overwrite with `"0"` (mutates input) or use a separate visited grid.

::: text 🧾 Problem
Given a grid of `"1"` (land) and `"0"` (water), return the **number of islands**. An island is land connected **horizontally or vertically** (not diagonally), surrounded by water; the outside of the grid is water.

**Example 1:**
`["1","1","0","0","0"]`
`["1","1","0","0","0"]`
`["0","0","1","0","0"]`
`["0","0","0","1","1"]` → **3**

**Constraints:** 1 ≤ rows, cols ≤ 300.
:::

::: text 🧒 Intuition
You fly over a map of islands with a **paint bucket**. Every time you see land that isn't painted yet, you've found a new island: count it, then pour paint so it **floods across the whole island** (every connected land cell). Now the island is painted and you'll never count it again. Continue scanning.
:::

::: text 🐢 Brute force
**Idea:** for each land cell, check whether it's connected to any previously counted island by searching from scratch (or merge island IDs by relabelling the whole grid when two touch).

**Complexity:** relabelling or re-searching can cost O(R·C) per land cell → **O((R·C)²)**: for 300 × 300 that's ~8 × 10⁹. The waste: discovering the same island over and over.
:::

::: text 💡 Key insight
An island is a **connected component** of the grid graph. A DFS/BFS from one land cell reaches exactly its island; marking cells as visited ensures each cell is processed once. So: outer loop over cells + flood fill = O(R·C) total.

**Pattern name: Connected components on a grid (DFS/BFS flood fill).**
:::

::: diagram Scan and flood
flowchart TD
  A["for each cell (r, c)"] --> B{"grid[r][c] is land and not visited?"}
  B -->|"no"| A
  B -->|"yes"| C["count++"]
  C --> D["flood(r, c): mark visited, recurse into 4 land neighbours"]
  D --> A
  A -->|"all cells done"| E["return count"]
:::

::: image Number of Islands: three islands coloured green, amber and violet
/images/dsa-heap-graphs/islands.svg
:::

::: text 🔍 Dry run: the example grid
| Scan position | cell | visited? | action | count |
|---|---|---|---|---|
| (0,0) | 1 | no | new island → flood (0,0),(0,1),(1,0),(1,1) | 1 |
| (0,1), (1,0), (1,1) | 1 | yes | skip | 1 |
| (2,2) | 1 | no | new island → flood (2,2) | 2 |
| (3,3) | 1 | no | new island → flood (3,3),(3,4) | 3 |
| (3,4) | 1 | yes | skip | 3 |

All other cells are water. Answer **3**.
:::

::: code javascript Optimal solution (DFS and BFS) with tests (runnable)
/**
 * Number of Islands with an iterative DFS (no recursion depth problems).
 * Time O(R·C), Space O(R·C) worst case for the stack. Does NOT modify the input.
 */
function numIslands(grid) {
  const R = grid.length, C = R ? grid[0].length : 0;
  const seen = Array.from({ length: R }, () => new Array(C).fill(false));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];    // up, down, left, right
  let count = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (grid[r][c] !== '1' || seen[r][c]) continue; // water or already part of a counted island
      count++;                                        // a new island starts here
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {                          // flood the whole island
        const [cr, cc] = stack.pop();
        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === '1' && !seen[nr][nc]) {
            seen[nr][nc] = true;                      // mark when pushing → never pushed twice
            stack.push([nr, nc]);
          }
        }
      }
    }
  }
  return count;
}

/** BFS version that sinks land in a copy ("1" → "0"). */
function numIslandsBFS(input) {
  const grid = input.map((row) => [...row]);          // copy so the caller's grid is untouched
  let count = 0;
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] !== '1') continue;
      count++;
      const q = [[r, c]]; grid[r][c] = '0';
      for (let h = 0; h < q.length; h++) {
        const [cr, cc] = q[h];
        for (const [nr, nc] of [[cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]]) {
          if (grid[nr] && grid[nr][nc] === '1') { grid[nr][nc] = '0'; q.push([nr, nc]); }
        }
      }
    }
  return count;
}

// ---------- tests ----------
const g1 = [['1', '1', '0', '0', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '1', '0', '0'], ['0', '0', '0', '1', '1']];
const g2 = [['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']];
const g3 = [['1', '0', '1'], ['0', '1', '0'], ['1', '0', '1']];   // diagonals do NOT connect
const cases = [[g1, 3], [g2, 1], [g3, 5], [[['0']], 0], [[['1']], 1]];
for (const [grid, expected] of cases) {
  const a = numIslands(grid), b = numIslandsBFS(grid);
  console.log(JSON.stringify(grid.map((r) => r.join(''))), '→', a, a === expected && b === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const big = Array.from({ length: 300 }, () => new Array(300).fill('1'));  // one huge island
console.log('300×300 all land →', numIslands(big), numIslands(big) === 1 ? '✅ (no stack overflow)' : '❌ FAIL');
:::

::: chart line Cell visits: re-search per land cell vs one flood per island (worst case, all land)
cells (R·C),Re-search per cell ~(RC)²,Flood fill RC
100,10000,100
1000,1000000,1000
10000,100000000,10000
90000,8100000000,90000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Recursive DFS | O(R·C) | O(R·C) call stack | Shortest code | Stack overflow on huge islands | Small grids |
| **Iterative DFS / BFS** | **O(R·C)** | O(R·C) | Safe for big grids | A bit more code | Default answer |
| Union-Find | O(R·C · α) | O(R·C) | Great when land is added over time | More code | [Number of Islands II](https://leetcode.com/problems/number-of-islands-ii/) |
| Sink land in place (`"1"` → `"0"`) | O(R·C) | O(1) extra besides the stack | No visited grid | Destroys the input | If mutation is allowed |
:::

::: warning ⚠️ Common mistakes / edge cases
- Counting **diagonal** neighbours (the problem uses 4 directions).
- Marking visited when **popping** instead of when **pushing** → duplicates on the stack.
- Comparing with the number `1` when the grid holds strings `"1"`.
- Recursion depth: a 300 × 300 all-land grid means a 90,000-deep recursion in a naive DFS.
- Out-of-bounds checks in the wrong order.
:::

::: understand
- Grid problems are graph problems where neighbours are computed (`r ± 1`, `c ± 1`) instead of stored. Same template: [Max Area of Island](https://leetcode.com/problems/max-area-of-island/), [Surrounded Regions](https://leetcode.com/problems/surrounded-regions/), [Pacific Atlantic Water Flow](https://leetcode.com/problems/pacific-atlantic-water-flow/), [Flood Fill](https://leetcode.com/problems/flood-fill/).
:::

::: ask
- *"4 or 8 directions?"*
- *"Can I modify the grid?"*
- *"Are the cells strings or numbers?"*
- *"How big can the grid be?"* (Recursion vs iterative.)
:::

::: important ⭐ How to explain it in the interview
> "I treat the grid as a graph where land cells connect to their four neighbours. I scan every cell; when I find land that isn't visited, that's a new island, so I increment the count and flood it with DFS or BFS, marking every connected land cell as visited. Each cell is visited a constant number of times, so it's O(rows × cols) time and space. I use an explicit stack so a huge island doesn't overflow the call stack."
:::

::: links
LeetCode 200: Number of Islands | https://leetcode.com/problems/number-of-islands/
NeetCode video: Number of Islands | https://www.youtube.com/results?search_query=neetcode+number+of+islands
:::

=== Flood Fill / Rotting Oranges
@p 2
@tags grid, bfs, dfs, multi-source-bfs
@quick
- **Flood fill**: DFS/BFS from `(sr, sc)`, recolour every connected cell that has the **original** colour; return early if the new colour equals the old one (otherwise infinite loop).
- **Rotting oranges**: **multi-source BFS**: put **all** rotten oranges in the queue at minute 0; each BFS level = 1 minute.
- Answer = minutes elapsed, or **−1** if some fresh orange is never reached.
- Both **O(rows × cols)**.

::: text 🧾 Problem
**Flood Fill:** like the paint-bucket tool. From pixel `(sr, sc)`, change its colour and the colour of every pixel connected to it (4 directions) that had the **same original colour** to `color`.
`image = [[1,1,1],[1,1,0],[1,0,1]], sr = 1, sc = 1, color = 2 → [[2,2,2],[2,2,0],[2,0,1]]`

**Rotting Oranges:** `0` empty, `1` fresh, `2` rotten. Every minute, fresh oranges next to a rotten one (4 directions) become rotten. Return the minutes until no fresh orange is left, or `-1` if impossible.
`[[2,1,1],[1,1,0],[0,1,1]] → 4`; `[[2,1,1],[0,1,1],[1,0,1]] → -1` (the bottom-left orange is unreachable).

**Constraints:** grids up to 50 × 50 (flood fill), 10 × 10 (oranges).
:::

::: text 🧒 Intuition
**Flood fill** is the **paint bucket** in MS Paint: paint spreads to touching pixels of the same colour and stops at different colours.

**Rotting oranges** is a **rumour spreading** through a crowd: everyone who knows it tells their neighbours in the same minute. If several people start with the rumour, they all spread it **at the same time**, which is why every rotten orange goes into the queue at the start (multi-source BFS). The number of "rounds" until everyone knows is the answer.
:::

::: text 🐢 Brute force
**Rotting oranges, minute by minute:** each minute, scan the whole grid, find fresh oranges next to rotten ones, rot them, repeat until nothing changes. Each minute costs O(R·C) and there can be up to O(R·C) minutes (a long snake of oranges) → **O((R·C)²)**.

**Running a separate BFS from each rotten orange** and taking the minimum time per cell is O(rotten × R·C), also wasteful.
:::

::: text 💡 Key insight
Flood fill is plain DFS/BFS from one start. For the oranges, all rotten oranges spread **simultaneously**, which is exactly a BFS that starts with **all** of them in the queue at distance 0. BFS processes cells in increasing time order, so the time when a cell is first reached is its rot time. Each cell enters the queue at most once → O(R·C).

**Pattern name: Grid DFS/BFS → multi-source BFS.**
:::

::: diagram Multi-source BFS by levels
flowchart TD
  A["queue = all rotten cells, fresh = count of fresh"] --> B{"queue not empty and fresh > 0?"}
  B -->|"no"| E{"fresh === 0?"}
  E -->|"yes"| R["return minutes"]
  E -->|"no"| X["return -1"]
  B -->|"yes"| C["minutes++, process exactly one level"]
  C --> D["each fresh neighbour: make rotten, fresh--, enqueue"]
  D --> B
:::

::: image Rotting Oranges: rot spreads one ring per minute; everything is rotten after 4 minutes
/images/dsa-heap-graphs/rotting-oranges.svg
:::

::: text 🔍 Dry run: [[2,1,1],[1,1,0],[0,1,1]] (fresh = 6)
| Minute | queue at the start of the minute | newly rotten | fresh left |
|---|---|---|---|
| 1 | (0,0) | (0,1), (1,0) | 4 |
| 2 | (0,1), (1,0) | (0,2), (1,1) | 2 |
| 3 | (0,2), (1,1) | (2,1) | 1 |
| 4 | (2,1) | (2,2) | 0 |

fresh = 0 → answer **4**.
:::

::: code javascript Optimal solutions with tests (runnable)
/**
 * Flood Fill with an iterative DFS. Time O(R·C), Space O(R·C).
 */
function floodFill(image, sr, sc, color) {
  const img = image.map((row) => [...row]);   // work on a copy
  const old = img[sr][sc];
  if (old === color) return img;              // nothing to do (and avoids an infinite loop)
  const stack = [[sr, sc]];
  while (stack.length) {
    const [r, c] = stack.pop();
    if (r < 0 || r >= img.length || c < 0 || c >= img[0].length || img[r][c] !== old) continue;
    img[r][c] = color;                        // paint it: it no longer matches old → visited
    stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
  return img;
}

/**
 * Rotting Oranges with multi-source BFS. Time O(R·C), Space O(R·C).
 */
function orangesRotting(input) {
  const grid = input.map((row) => [...row]);
  const R = grid.length, C = grid[0].length;
  let queue = [], fresh = 0;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (grid[r][c] === 2) queue.push([r, c]);   // ALL rotten oranges start together
      else if (grid[r][c] === 1) fresh++;
    }
  let minutes = 0;
  while (queue.length && fresh > 0) {
    minutes++;                                    // one BFS level = one minute
    const next = [];
    for (const [r, c] of queue) {
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === 1) {
          grid[nr][nc] = 2;                       // rot it now so it isn't added twice
          fresh--;
          next.push([nr, nc]);
        }
      }
    }
    queue = next;
  }
  return fresh === 0 ? minutes : -1;              // some fresh orange was unreachable
}

// ---------- tests ----------
const ff = floodFill([[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2);
console.log('flood fill →', JSON.stringify(ff), JSON.stringify(ff) === '[[2,2,2],[2,2,0],[2,0,1]]' ? '✅' : '❌ FAIL');
const same = floodFill([[0, 0], [0, 0]], 0, 0, 0);
console.log('flood fill, same colour →', JSON.stringify(same), JSON.stringify(same) === '[[0,0],[0,0]]' ? '✅' : '❌ FAIL');
const oranges = [
  [[[2, 1, 1], [1, 1, 0], [0, 1, 1]], 4],
  [[[2, 1, 1], [0, 1, 1], [1, 0, 1]], -1],   // unreachable fresh orange
  [[[0, 2]], 0],                             // no fresh oranges at all
  [[[1]], -1],                               // fresh but nothing rotten
  [[[2, 2], [1, 1]], 1],                     // two sources at once
];
for (const [grid, expected] of oranges) {
  const got = orangesRotting(grid);
  console.log('oranges', JSON.stringify(grid), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Cell checks: rescan the grid every minute vs multi-source BFS (snake-shaped worst case)
cells,Rescan per minute ~cells²/2,BFS ~cells
25,313,25
100,5000,100
400,80000,400
2500,3125000,2500
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Rescan grid every minute | O((R·C)²) | O(1) extra | No queue | Slow | Tiny grids |
| BFS from each rotten orange separately | O(k · R·C) | O(R·C) | Easy to think about | Repeats work | Never |
| **Multi-source BFS** | **O(R·C)** | O(R·C) | Optimal, one pass | Must process level by level | Rotting oranges, "distance to nearest X" |
| DFS flood fill | O(R·C) | O(R·C) | Simplest for one region | No distances | Flood fill |
:::

::: warning ⚠️ Common mistakes / edge cases
- Flood fill: no early return when `color === old` → infinite loop (painted cells still match).
- Oranges: starting BFS from **one** rotten orange at a time (wrong minutes when there are several sources).
- Counting minutes for the last level that rots nothing (off by one): loop while `fresh > 0`.
- Forgetting `-1` when fresh oranges remain, or returning `-1` when there were no fresh oranges (answer 0).
:::

::: understand
- **Multi-source BFS** computes "distance to the nearest source" for every cell in one pass: [01 Matrix](https://leetcode.com/problems/01-matrix/), [Walls and Gates](https://leetcode.com/problems/walls-and-gates/), [As Far from Land as Possible](https://leetcode.com/problems/as-far-from-land-as-possible/).
- Flood fill is [Number of Islands](https://leetcode.com/problems/number-of-islands/) for one region.
:::

::: ask
- *"4 or 8 directions?"*
- *"Can I modify the input?"*
- *"What should be returned if it's impossible / if nothing needs to change?"*
:::

::: important ⭐ How to explain it in the interview
> "Flood fill is a DFS from the start pixel that repaints every connected pixel of the original colour; I return early if the new colour equals the old one. For rotting oranges, all rotten oranges spread at the same time, so I run a multi-source BFS: I enqueue every rotten orange at minute 0 and count the fresh ones. Each BFS level is one minute; I rot fresh neighbours and decrement the count. If the count reaches zero I return the minutes, otherwise −1. Both are O(rows × cols)."
:::

::: links
LeetCode 733: Flood Fill | https://leetcode.com/problems/flood-fill/
LeetCode 994: Rotting Oranges | https://leetcode.com/problems/rotting-oranges/
NeetCode video: Rotting Oranges | https://www.youtube.com/results?search_query=neetcode+rotting+oranges
:::

=== Course Schedule (cycle detection & topological sort)
@p 3
@tags graphs, topological-sort, kahn, medium
@quick
- Courses = nodes, prerequisite `[a, b]` = edge **b → a** (take b before a). Possible ⇔ the directed graph has **no cycle**.
- **Kahn's algorithm (BFS)**: compute in-degrees; queue nodes with in-degree 0; pop, reduce neighbours' in-degree; if processed count `===` n → no cycle (the order is a topological order).
- DFS alternative: 3 colours (unvisited / visiting / done); reaching a "visiting" node = cycle.
- **O(V + E)** time and space.

::: text 🧾 Problem
There are `numCourses` courses `0 … n−1`. `prerequisites[i] = [a, b]` means you must take **b before a**. Return `true` if you can finish all courses. (Follow-up, Course Schedule II: return a valid order.)

**Example 1:** `n = 2, [[1, 0]] → true` (take 0, then 1).
**Example 2:** `n = 2, [[1, 0], [0, 1]] → false` (each needs the other: a cycle).

**Constraints:** 1 ≤ n ≤ 2000, up to 5000 prerequisites.
:::

::: text 🧒 Intuition
Getting **dressed**: socks before shoes, underwear before trousers, trousers before shoes… You can always start with something that has **no remaining requirements**, put it on, and cross it off everyone else's list. If at some point everything left still has an unmet requirement, the rules contradict each other (a cycle: "shoes before socks" and "socks before shoes"), and you can never finish.
:::

::: text 🐢 Brute force
**Idea:** repeatedly scan all courses for one whose prerequisites are all done; take it; repeat until none is found.

**Complexity:** each round scans all V courses and all their prerequisites → O(V · (V + E)) (≈ 1.4 × 10⁷ for 2000 courses and 5000 edges), and checking every permutation of courses would be O(V!). We repeat scans for courses whose status hasn't changed.
:::

::: text 💡 Key insight
Track for each course its **in-degree** (how many prerequisites are still unmet). Courses with in-degree 0 can be taken now; taking one only affects its direct dependents (decrement their in-degree), so we never rescan everything. If a cycle exists, the courses on it never reach in-degree 0, so fewer than n courses get processed.

**Pattern name: Topological sort (Kahn's BFS) / cycle detection in a directed graph.**
:::

::: diagram Kahn's algorithm
flowchart TD
  A["build adjacency b → a and inDegree[a]++"] --> B["queue all courses with inDegree 0"]
  B --> C{"queue empty?"}
  C -->|"no"| D["take course u, order.push(u)"]
  D --> E["for each v in adj[u]: inDegree[v]--, if 0 → enqueue v"]
  E --> C
  C -->|"yes"| F{"order.length === n?"}
  F -->|"yes"| T["true (order is valid)"]
  F -->|"no"| X["false (cycle)"]
:::

::: image Course Schedule: course 0 before 1 and 2, both before 3; topological order 0 1 2 3
/images/dsa-heap-graphs/course-schedule.svg
:::

::: text 🔍 Dry run: n = 4, prerequisites = [[1,0], [2,0], [3,1], [3,2]]
Edges 0 → 1, 0 → 2, 1 → 3, 2 → 3. In-degrees: [0, 1, 1, 2].
| Step | take | in-degree updates | queue after | order |
|---|---|---|---|---|
| start | | | [0] | [] |
| 1 | 0 | 1: 1→0, 2: 1→0 | [1, 2] | [0] |
| 2 | 1 | 3: 2→1 | [2] | [0, 1] |
| 3 | 2 | 3: 1→0 | [3] | [0, 1, 2] |
| 4 | 3 | – | [] | [0, 1, 2, 3] |

4 processed = n → **true**. With a cycle `[[1,0],[0,1]]` both in-degrees are 1, the queue starts empty, 0 processed → **false**.
:::

::: code javascript Kahn's algorithm + DFS cycle check, with tests (runnable)
/**
 * Course Schedule I + II with Kahn's algorithm. Time O(V + E), Space O(V + E).
 * Returns a valid order, or [] if a cycle makes it impossible.
 */
function findOrder(numCourses, prerequisites) {
  const adj = Array.from({ length: numCourses }, () => []);
  const inDegree = new Array(numCourses).fill(0);
  for (const [course, pre] of prerequisites) {
    adj[pre].push(course);        // edge pre → course
    inDegree[course]++;           // course waits for one more prerequisite
  }
  const queue = [];
  for (let i = 0; i < numCourses; i++) if (inDegree[i] === 0) queue.push(i); // ready right now
  const order = [];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    order.push(u);                // take course u
    for (const v of adj[u]) {
      inDegree[v]--;              // one prerequisite of v is done
      if (inDegree[v] === 0) queue.push(v); // v is ready
    }
  }
  return order.length === numCourses ? order : []; // courses stuck in a cycle never reach 0
}
const canFinish = (n, prereqs) => findOrder(n, prereqs).length === n;

/** DFS version: 0 = unvisited, 1 = on the current path, 2 = done. */
function canFinishDFS(n, prerequisites) {
  const adj = Array.from({ length: n }, () => []);
  for (const [c, p] of prerequisites) adj[p].push(c);
  const state = new Array(n).fill(0);
  const hasCycle = (u) => {
    if (state[u] === 1) return true;   // back on the current path → cycle
    if (state[u] === 2) return false;  // already fully explored
    state[u] = 1;
    for (const v of adj[u]) if (hasCycle(v)) return true;
    state[u] = 2;
    return false;
  };
  for (let i = 0; i < n; i++) if (hasCycle(i)) return false;
  return true;
}

/** Check an order respects every prerequisite. */
const validOrder = (order, prereqs) => { const pos = new Map(order.map((c, i) => [c, i])); return prereqs.every(([c, p]) => pos.get(p) < pos.get(c)); };

// ---------- tests ----------
const cases = [
  [2, [[1, 0]], true],
  [2, [[1, 0], [0, 1]], false],                 // direct cycle
  [4, [[1, 0], [2, 0], [3, 1], [3, 2]], true],
  [3, [[0, 1], [1, 2], [2, 0]], false],         // longer cycle
  [1, [], true],
  [3, [], true],                                 // no prerequisites at all
];
for (const [n, pre, expected] of cases) {
  const order = findOrder(n, pre);
  const ok = canFinish(n, pre) === expected && canFinishDFS(n, pre) === expected && (!expected || validOrder(order, pre));
  console.log('n =', n, JSON.stringify(pre), '→', canFinish(n, pre), expected ? 'order ' + JSON.stringify(order) : '', ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Work for V courses (E = 2V): repeated full scans vs Kahn (V + E)
V,Repeated scans ~V·(V+E),Kahn V+E
10,300,30
100,30000,300
1000,3000000,3000
2000,12000000,6000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Repeated scans for a ready course | O(V · (V + E)) | O(V) | Intuitive | Slow | Tiny inputs |
| **Kahn's algorithm (BFS)** | **O(V + E)** | O(V + E) | Gives the order, no recursion | In-degree bookkeeping | Default; when the order is needed |
| DFS with 3 states | O(V + E) | O(V + E) | Natural cycle detection | Recursion depth; order = reverse postorder | Cycle detection only |
:::

::: warning ⚠️ Common mistakes / edge cases
- Reversing the edge: `[a, b]` means **b → a**.
- DFS with only a boolean `visited`: can't tell a cycle from a node finished earlier on another path → you need 3 states.
- Forgetting isolated courses (no edges): they have in-degree 0 and must be in the order.
- Assuming the input has no duplicate prerequisites (duplicates are fine with in-degrees as long as you count them consistently).
:::

::: understand
- Topological sort orders tasks with dependencies: build systems (webpack, Makefiles), package managers (npm install order), spreadsheet recalculation, job schedulers. Related: [Course Schedule II](https://leetcode.com/problems/course-schedule-ii/), [Alien Dictionary](https://leetcode.com/problems/alien-dictionary/), [Parallel Courses](https://leetcode.com/problems/parallel-courses/), [Minimum Height Trees](https://leetcode.com/problems/minimum-height-trees/).
:::

::: ask
- *"What does [a, b] mean exactly: a before b, or b before a?"*
- *"Do you need just true/false, or a valid order?"*
- *"Can there be duplicate prerequisites or self-loops?"*
:::

::: important ⭐ How to explain it in the interview
> "I model courses as a directed graph with an edge from each prerequisite to the course that needs it. All courses can be finished exactly when this graph has no cycle. I use Kahn's algorithm: compute in-degrees, queue every course with in-degree zero, and repeatedly take one, decrementing the in-degree of its dependents and queuing any that reach zero. If I process all n courses, the processing order is a valid schedule; if not, the remaining courses are in a cycle. O(V + E) time and space."
:::

::: links
LeetCode 207: Course Schedule | https://leetcode.com/problems/course-schedule/
LeetCode 210: Course Schedule II | https://leetcode.com/problems/course-schedule-ii/
NeetCode video: Course Schedule | https://www.youtube.com/results?search_query=neetcode+course+schedule
:::

=== Clone Graph
@p 2
@tags graphs, hashmap, dfs, medium
@quick
- Deep copy = **new node objects** with the same values and the same connections.
- Keep a **Map original → clone**: it prevents copying a node twice and stops infinite loops on cycles.
- DFS/BFS: create a node's clone **before** visiting its neighbours, then link clones.
- **O(V + E)** time and space.

::: text 🧾 Problem
Given a reference to a node of a **connected undirected graph** (each node has `val` and a list `neighbors`), return a **deep copy** of the graph.

**Example:** adjacency `[[2,4],[1,3],[2,4],[1,3]]` (a square: 1–2–3–4–1) → a new graph with the same structure, where no node is shared with the original.

**Constraints:** 0 ≤ nodes ≤ 100, values unique 1 … 100.
:::

::: text 🧒 Intuition
You're **photocopying a friendship network** printed on cards: each card has a person and the people they're friends with. You copy each card once and keep a **lookup sheet** "original card → copy". When a copied card needs to point at a friend, you look up (or make) that friend's copy. Without the lookup sheet you'd copy the same person again and again, forever, because friendships go both ways.
:::

::: text 🐢 Brute force
**Idea:** recursively copy a node and then copy each neighbour **without remembering** what was already copied.

**What happens:** in any graph with a cycle (node 1 → 2 → 1 …) the recursion never ends (stack overflow), and even in a graph without cycles shared neighbours get duplicated, so the copy has the **wrong structure**. Serialising to JSON fails for the same reason (`JSON.stringify` throws on circular references).
:::

::: text 💡 Key insight
A traversal (DFS/BFS) visits every node once if we mark visited nodes. Make the **visited map store the clone itself**: when we meet a node again, we reuse its clone instead of recursing. Create the clone **before** processing neighbours, so cycles that lead back to it find it in the map.

**Pattern name: Graph traversal + hash map (old → new).**
:::

::: diagram Clone with a map
flowchart TD
  A["clone(node)"] --> B{"node in map?"}
  B -->|"yes"| R["return map.get(node)"]
  B -->|"no"| C["copy = new Node(node.val), map.set(node, copy)"]
  C --> D["for each neighbour n: copy.neighbors.push(clone(n))"]
  D --> E["return copy"]
:::

::: image Clone Graph: a 4-node cycle and its copy, linked through a map from original to clone
/images/dsa-heap-graphs/clone-graph.svg
:::

::: text 🔍 Dry run: square 1–2–3–4–1, start at 1
| Call | in map? | action | map after |
|---|---|---|---|
| clone(1) | no | create 1', then visit neighbours 2, 4 | {1} |
| clone(2) | no | create 2', visit 1, 3 | {1, 2} |
| clone(1) | **yes** | return 1' (cycle stopped) | |
| clone(3) | no | create 3', visit 2, 4 | {1, 2, 3} |
| clone(2) | yes | return 2' | |
| clone(4) | no | create 4', visit 1, 3 | {1, 2, 3, 4} |
| clone(1), clone(3) | yes | return 1', 3' | |
| back in clone(1) | | neighbour 4 already in map → 4' | |

Every node is created once; every edge is linked once per direction.
:::

::: code javascript Optimal solution with tests (runnable)
class Node { constructor(val, neighbors = []) { this.val = val; this.neighbors = neighbors; } }
/** Build a graph from LeetCode's adjacency list (node i + 1 has neighbours adj[i]). */
function buildGraph(adj) {
  if (!adj.length) return null;
  const nodes = adj.map((_, i) => new Node(i + 1));
  adj.forEach((ns, i) => { nodes[i].neighbors = ns.map((v) => nodes[v - 1]); });
  return nodes[0];
}
/** Back to an adjacency list (BFS), for comparing. */
function toAdj(start) {
  if (!start) return [];
  const seen = new Map([[start.val, start]]), q = [start];
  for (let h = 0; h < q.length; h++) for (const n of q[h].neighbors) if (!seen.has(n.val)) { seen.set(n.val, n); q.push(n); }
  return [...seen.keys()].sort((a, b) => a - b).map((v) => seen.get(v).neighbors.map((n) => n.val));
}

/**
 * Clone Graph with DFS + a map original → copy. Time O(V + E), Space O(V).
 */
function cloneGraph(node) {
  const copies = new Map();                 // original node → its clone
  function clone(n) {
    if (!n) return null;
    if (copies.has(n)) return copies.get(n); // already cloned (or being cloned) → reuse, stops cycles
    const copy = new Node(n.val);
    copies.set(n, copy);                     // register BEFORE visiting neighbours
    for (const nb of n.neighbors) copy.neighbors.push(clone(nb));
    return copy;
  }
  return clone(node);
}

/** Collect all node objects reachable from start (to check nothing is shared). */
function allNodes(start) {
  const seen = new Set(), stack = start ? [start] : [];
  while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); stack.push(...n.neighbors); }
  return seen;
}

// ---------- tests ----------
const cases = [[[2, 4], [1, 3], [2, 4], [1, 3]], [[]], [], [[2], [1]]];
for (const adj of cases) {
  const original = buildGraph(adj);
  const copy = cloneGraph(original);
  const sameShape = JSON.stringify(toAdj(copy)) === JSON.stringify(toAdj(original));
  const origSet = allNodes(original);
  const noSharing = [...allNodes(copy)].every((n) => !origSet.has(n));
  const notSameRef = original === null ? copy === null : copy !== original;
  console.log(JSON.stringify(adj), '→', JSON.stringify(toAdj(copy)), sameShape && noSharing && notSameRef ? '✅' : '❌ FAIL');
}
:::

::: chart line Node copies for a directed chain of k "diamonds" (3k + 1 nodes): copying without a map follows every path
k diamonds,Without a map (2^(k+2) - 3),With a map (3k + 1)
1,5,4
3,29,10
5,125,16
10,4093,31
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Recursion without a map | ∞ on cycles | – | – | Infinite loop / wrong structure | Never |
| `structuredClone(node)` | O(V + E) | O(V) | Built in, handles cycles | Not what the interviewer wants; copies all fields | Real code |
| **DFS + Map** | **O(V + E)** | O(V) | Short | Recursion depth | Default answer |
| BFS + Map | O(V + E) | O(V) | No recursion | Slightly more code | Large graphs |
:::

::: warning ⚠️ Common mistakes / edge cases
- Putting the clone in the map **after** cloning the neighbours → infinite recursion on cycles.
- Keying the map by `val` when values aren't unique (key by the node object instead).
- Returning the original node, or sharing neighbour arrays between original and copy.
- Empty graph (`null` input).
:::

::: understand
- "Map from old to new" is the standard way to deep-copy any structure with shared references or cycles: [Copy List with Random Pointer](https://leetcode.com/problems/copy-list-with-random-pointer/), [Clone Binary Tree With Random Pointer](https://leetcode.com/problems/clone-binary-tree-with-random-pointer/). It's also how `structuredClone` handles cycles internally.
:::

::: ask
- *"Is the graph connected? Can it be empty?"*
- *"Are values unique?"*
- *"Directed or undirected?"*
:::

::: important ⭐ How to explain it in the interview
> "I traverse the graph with DFS and keep a hash map from each original node to its clone. When I visit a node that's already in the map, I return its clone, which both avoids duplicates and stops infinite loops on cycles. Otherwise I create the clone, put it in the map before visiting the neighbours, and then push the clones of all neighbours into its list. Every node and edge is handled once: O(V + E) time and O(V) space."
:::

::: links
LeetCode 133: Clone Graph | https://leetcode.com/problems/clone-graph/
NeetCode video: Clone Graph | https://www.youtube.com/results?search_query=neetcode+clone+graph
MDN: structuredClone | https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
:::

=== Number of Connected Components / Shortest Path in Binary Matrix
@p 1
@tags graphs, union-find, bfs
@quick
- **Components**: DFS/BFS from every unvisited node → `count++`; or **Union-Find** (start with n, each successful union → `count--`).
- Union-Find with **path compression + union by size** ≈ O(1) per operation.
- **Shortest path in a binary matrix**: **BFS** (8 directions) from (0,0); the first time you reach (n−1, n−1) is the shortest. Return −1 if blocked.
- Unweighted shortest path → BFS, never DFS.

::: text 🧾 Problem
**Connected components:** `n` nodes and undirected `edges`; return the number of connected components.
`n = 5, edges = [[0,1],[1,2],[3,4]] → 2`

**Shortest Path in Binary Matrix:** an n × n grid of `0` (open) and `1` (blocked). Return the length (number of cells) of the shortest path from the top-left to the bottom-right moving in **8 directions** through `0` cells, or `-1`.
`[[0,0,0],[1,1,0],[1,1,0]] → 4`; `[[0,1],[1,0]] → 2`; `[[1,0],[0,0]] → -1`

**Constraints:** n ≤ 2000 nodes / grid up to 100 × 100.
:::

::: text 🧒 Intuition
**Components:** count separate **friend groups** at a party: start from anyone not yet assigned, gather everyone reachable through friendships into a group, repeat. Union-Find is like **merging clubs**: every friendship merges two clubs into one; the number of clubs left is the answer.

**Shortest path:** dropping a **stone in a pond** at the top-left: the ripple reaches cells in order of distance, so the first ripple to touch the bottom-right took the fewest steps.
:::

::: text 🐢 Brute force
**Components:** for each pair of nodes, check if a path exists (a BFS per pair) → O(V² · (V + E)).
**Shortest path:** DFS trying **all** paths and keeping the shortest → exponential in the worst case (every cell has up to 8 choices). DFS finding *a* path quickly doesn't mean it's the shortest.
:::

::: text 💡 Key insight
**Components:** one traversal per component, and every node belongs to exactly one, so a loop over nodes + DFS is O(V + E). Union-Find answers the same question incrementally, which also works when edges arrive one at a time.

**Shortest path:** in an unweighted graph BFS discovers nodes in increasing distance order, so the first time it reaches the target, that distance is minimal. Each cell enters the queue at most once → O(n²).

**Pattern name: Connected components (DFS / Union-Find) + BFS shortest path.**
:::

::: diagram Union-Find and BFS shortest path
flowchart TD
  U["Union-Find: count = n"] --> U1["for each edge (a, b)"]
  U1 --> U2{"find(a) !== find(b)?"}
  U2 -->|"yes"| U3["union, count--"]
  U2 -->|"no"| U1
  U3 --> U1
  B["BFS: queue (0,0) with dist 1"] --> B1["pop cell, if target → return dist"]
  B1 --> B2["push 8 open, unvisited neighbours with dist + 1"]
  B2 --> B1
:::

::: image Connected components 0-1-2 and 3-4, and a 4-cell BFS path through a binary matrix
/images/dsa-heap-graphs/components-path.svg
:::

::: text 🔍 Dry run
**Union-Find:** n = 5, edges (0,1), (1,2), (3,4)
| edge | find(a) | find(b) | union? | count |
|---|---|---|---|---|
| start | | | | 5 |
| (0,1) | 0 | 1 | yes | 4 |
| (1,2) | 0 | 2 | yes | 3 |
| (3,4) | 3 | 4 | yes | **2** |

**BFS:** grid `[[0,0,0],[1,1,0],[1,1,0]]`
| dist | cells reached |
|---|---|
| 1 | (0,0) |
| 2 | (0,1) |
| 3 | (0,2), (1,2) |
| 4 | (2,2) → **target reached, answer 4** |
:::

::: code javascript Union-Find, DFS components and BFS shortest path, with tests (runnable)
/** Union-Find (Disjoint Set Union) with path compression + union by size. */
class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); this.size = new Array(n).fill(1); this.count = n; }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]; // path compression (halving): point to the grandparent
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;                      // already in the same component
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;                             // attach the smaller tree under the bigger one
    this.size[ra] += this.size[rb];
    this.count--;                                     // two components became one
    return true;
  }
}
const countComponentsUF = (n, edges) => { const uf = new UnionFind(n); for (const [a, b] of edges) uf.union(a, b); return uf.count; };

/** DFS version: count how many times we start a new traversal. O(V + E). */
function countComponentsDFS(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const seen = new Array(n).fill(false);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    count++;                                          // i starts a new component
    const stack = [i]; seen[i] = true;
    while (stack.length) for (const v of adj[stack.pop()]) if (!seen[v]) { seen[v] = true; stack.push(v); }
  }
  return count;
}

/** Shortest Path in Binary Matrix (8 directions). BFS: O(n²) time and space. */
function shortestPathBinaryMatrix(grid) {
  const n = grid.length;
  if (grid[0][0] === 1 || grid[n - 1][n - 1] === 1) return -1;  // start or end blocked
  const dist = Array.from({ length: n }, () => new Array(n).fill(0)); // 0 = not visited
  dist[0][0] = 1;                                     // path length counts cells
  const queue = [[0, 0]];
  for (let h = 0; h < queue.length; h++) {
    const [r, c] = queue[h];
    if (r === n - 1 && c === n - 1) return dist[r][c]; // first arrival = shortest
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if ((dr || dc) && nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] === 0 && !dist[nr][nc]) {
          dist[nr][nc] = dist[r][c] + 1;
          queue.push([nr, nc]);
        }
      }
  }
  return -1;                                          // target unreachable
}

// ---------- tests ----------
const comp = [[5, [[0, 1], [1, 2], [3, 4]], 2], [5, [[0, 1], [1, 2], [2, 3], [3, 4]], 1], [4, [], 4], [3, [[0, 1], [1, 0], [0, 1]], 2]];
for (const [n, edges, expected] of comp) {
  const a = countComponentsUF(n, edges), b = countComponentsDFS(n, edges);
  console.log('components n =', n, JSON.stringify(edges), '→', a, a === expected && b === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const paths = [
  [[[0, 0, 0], [1, 1, 0], [1, 1, 0]], 4],
  [[[0, 1], [1, 0]], 2],              // diagonal move
  [[[1, 0], [0, 0]], -1],             // start blocked
  [[[0]], 1],                         // start is the end
  [[[0, 1, 1], [1, 1, 1], [1, 1, 0]], -1], // no route
];
for (const [grid, expected] of paths) {
  const got = shortestPathBinaryMatrix(grid);
  console.log('path', JSON.stringify(grid), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Operations to answer "how many groups?" for V nodes (E = V): BFS per pair vs one pass
V,BFS per pair ~V²·2V/2,One DFS / Union-Find ~2V
10,1000,20
50,125000,100
100,1000000,200
500,125000000,1000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| **DFS/BFS from each unvisited node** | **O(V + E)** | O(V + E) | Simple | Needs the whole graph up front | Static graph |
| **Union-Find** | O(E · α(V)) ≈ O(E) | O(V) | Incremental (edges arrive over time), cycle detection | More code | Dynamic connectivity, Kruskal, [Redundant Connection](https://leetcode.com/problems/redundant-connection/) |
| **BFS shortest path** | **O(V + E)** (O(n²) on a grid) | O(V) | Correct for unweighted | Not for weighted graphs | Unweighted shortest path |
| DFS for shortest path | Exponential (all paths) | O(V) | – | Doesn't guarantee the shortest | Never |
| Dijkstra | O(E log V) | O(V) | Weighted shortest path | Needs a heap | Weighted edges |
:::

::: warning ⚠️ Common mistakes / edge cases
- Union-Find without path compression / union by size: chains can make `find` O(n).
- Decrementing `count` even when the two nodes were already connected.
- Shortest path: forgetting to check that the **start or end** cell is blocked; using 4 directions when 8 are required.
- Marking visited when popping instead of when pushing (duplicates in the queue).
- Counting edges instead of cells (this problem counts cells, so the start has length 1).
:::

::: understand
- Union-Find shines when connections arrive over time: [Number of Provinces](https://leetcode.com/problems/number-of-provinces/), [Redundant Connection](https://leetcode.com/problems/redundant-connection/), [Accounts Merge](https://leetcode.com/problems/accounts-merge/), Kruskal's minimum spanning tree.
- BFS = shortest path for unweighted graphs: [Word Ladder](https://leetcode.com/problems/word-ladder/), [Open the Lock](https://leetcode.com/problems/open-the-lock/), [Shortest Path in Binary Matrix](https://leetcode.com/problems/shortest-path-in-binary-matrix/).
:::

::: ask
- *"Are edges given all at once, or added over time?"* (Over time → Union-Find.)
- *"4 or 8 directions? Does the path length count cells or moves?"*
- *"Weighted edges?"* (Then Dijkstra, not BFS.)
:::

::: important ⭐ How to explain it in the interview
> "For connected components I loop over the nodes and start a DFS from each unvisited one, incrementing the count each time: O(V + E). Alternatively Union-Find starts with n components and every union of two different roots decrements the count; with path compression and union by size it's nearly O(1) per edge and it handles edges arriving over time. For the shortest path in a binary matrix the graph is unweighted, so I run BFS from the top-left in 8 directions, recording distances when I enqueue; the first time I reach the bottom-right is the shortest path, and if the queue empties first I return −1."
:::

::: links
LeetCode 323: Number of Connected Components | https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/
LeetCode 1091: Shortest Path in Binary Matrix | https://leetcode.com/problems/shortest-path-in-binary-matrix/
NeetCode video: Number of Connected Components | https://www.youtube.com/results?search_query=neetcode+number+of+connected+components
VisuAlgo: Union-Find | https://visualgo.net/en/ufds
:::
