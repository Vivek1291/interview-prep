@section DSA: Heap & Graphs
@icon 🕸️
@color #f43f5e
@desc Tier 10 + Tier 11: min/max heap implementation, top-K, streaming median, BFS/DFS on grids and graphs, topological sort.

=== Heap / Priority Queue basics + Kth Largest Element
@p 3
@tags heap, priority-queue, medium
@quick
- **Binary heap** = complete binary tree in an array; min-heap: parent ≤ children. Children of i: `2i+1`, `2i+2`; parent: `(i-1)>>1`.
- push/pop **O(log n)** (bubble up/down), peek O(1), build O(n).
- JS has **no built-in heap**: know how to write a small MinHeap (or mention a library).
- Kth largest: keep a **min-heap of size k**; the top is the kth largest → **O(n log k)**. Quickselect: O(n) average.
- Max-heap = min-heap with a negated comparator.

::: text
### When to use a heap
Whenever you repeatedly need the **smallest/largest** item from a changing collection: top-K, merge K sorted lists, scheduling (Dijkstra, task schedulers), streaming median, rate limiters, job priority queues (BullMQ priorities).

### Kth largest with a min-heap of size k
Push each number; if the size exceeds k, pop the smallest. At the end the heap holds the k largest numbers, and the **top** is the kth largest.

| Approach | Time | Space |
|---|---|---|
| Sort | O(n log n) | O(1)–O(n) |
| **Min-heap size k** | **O(n log k)** | O(k) |
| Quickselect | O(n) avg, O(n²) worst | O(1) |
:::

::: diagram Min-heap as array [1,3,2,7,4,5]
flowchart TD
  A(("1, i=0")) --> B(("3, i=1"))
  A --> C(("2, i=2"))
  B --> D(("7, i=3"))
  B --> E(("4, i=4"))
  C --> F(("5, i=5"))
:::

::: code javascript MinHeap implementation + Kth largest + tests
class MinHeap {
  constructor(compare = (a, b) => a - b) { this.data = []; this.compare = compare; }
  get size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(val) {
    const d = this.data;
    d.push(val);
    let i = d.length - 1;
    while (i > 0) {                                   // bubble up
      const p = (i - 1) >> 1;
      if (this.compare(d[i], d[p]) >= 0) break;
      [d[i], d[p]] = [d[p], d[i]];
      i = p;
    }
  }
  pop() {
    const d = this.data;
    if (!d.length) return undefined;
    const top = d[0];
    const last = d.pop();
    if (d.length) {
      d[0] = last;
      let i = 0;
      while (true) {                                  // bubble down
        const l = 2 * i + 1, r = l + 1;
        let smallest = i;
        if (l < d.length && this.compare(d[l], d[smallest]) < 0) smallest = l;
        if (r < d.length && this.compare(d[r], d[smallest]) < 0) smallest = r;
        if (smallest === i) break;
        [d[i], d[smallest]] = [d[smallest], d[i]];
        i = smallest;
      }
    }
    return top;
  }
}

function findKthLargest(nums, k) {
  const heap = new MinHeap();
  for (const n of nums) {
    heap.push(n);
    if (heap.size > k) heap.pop();
  }
  return heap.peek();
}

// heap sort sanity check
const h = new MinHeap();
[5, 3, 8, 1, 9, 2].forEach((x) => h.push(x));
const sorted = []; while (h.size) sorted.push(h.pop());
console.log('heap pops sorted:', sorted.join(), sorted.join() === '1,2,3,5,8,9' ? '✅' : '❌ FAIL');

[[[3, 2, 1, 5, 6, 4], 2, 5], [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4, 4], [[1], 1, 1]].forEach(([n, k, e]) =>
  console.log(JSON.stringify(n), 'k=' + k, findKthLargest(n, k), findKthLargest(n, k) === e ? '✅' : '❌ FAIL'));

// max-heap = reversed comparator
const maxHeap = new MinHeap((a, b) => b - a);
[4, 10, 7].forEach((x) => maxHeap.push(x));
console.log('max-heap top:', maxHeap.peek(), maxHeap.peek() === 10 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Can I use a built-in priority queue?"* (Not in JS, so offer to implement one.) *"Is the data streaming?"* (Heap handles streams; sorting doesn't.)
:::

::: links
LeetCode 215: Kth Largest Element | https://leetcode.com/problems/kth-largest-element-in-an-array/
VisuAlgo: binary heap | https://visualgo.net/en/heap
:::

=== Merge K Sorted Lists
@p 2
@tags heap, linked-list, hard
@quick
- Min-heap of the current head of each list (compare by value); pop the smallest, append it, push its `next`.
- **O(N log k)** (N = total nodes, k = lists). Divide & conquer pairwise merging has the same complexity.
- Naive "merge one by one" = O(N·k).

::: code javascript Solution + tests
class MinHeap {
  constructor(cmp) { this.d = []; this.cmp = cmp; }
  get size() { return this.d.length; }
  push(v) { const d = this.d; d.push(v); let i = d.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(d[i], d[p]) >= 0) break; [d[i], d[p]] = [d[p], d[i]]; i = p; } }
  pop() { const d = this.d, top = d[0], last = d.pop(); if (d.length) { d[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < d.length && this.cmp(d[l], d[s]) < 0) s = l; if (r < d.length && this.cmp(d[r], d[s]) < 0) s = r; if (s === i) break; [d[i], d[s]] = [d[s], d[i]]; i = s; } } return top; }
}
class ListNode { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((n, v) => new ListNode(v, n), null);
const toArray = (h) => { const o = []; while (h) { o.push(h.val); h = h.next; } return o; };

function mergeKLists(lists) {
  const heap = new MinHeap((a, b) => a.val - b.val);
  for (const head of lists) if (head) heap.push(head);
  const dummy = new ListNode(0);
  let tail = dummy;
  while (heap.size) {
    const node = heap.pop();
    tail.next = node; tail = node;
    if (node.next) heap.push(node.next);
  }
  return dummy.next;
}

const r = toArray(mergeKLists([[1, 4, 5], [1, 3, 4], [2, 6]].map(fromArray))).join();
console.log(r, r === '1,1,2,3,4,4,5,6' ? '✅' : '❌ FAIL');
console.log(toArray(mergeKLists([])).join() === '' ? '✅ empty' : '❌ FAIL');
:::

::: ask
- *"How many lists vs total nodes?"* Mention the real-world version: merging sorted log files / database k-way merge.
:::

::: links
LeetCode 23 | https://leetcode.com/problems/merge-k-sorted-lists/
:::

=== Find Median from Data Stream
@p 2
@tags heap, two-heaps, hard
@quick
- **Two heaps**: a max-heap `low` (smaller half) and a min-heap `high` (larger half); sizes differ by ≤ 1.
- addNum: push to low → move low's max to high → rebalance if high is bigger.
- Median = top of low (odd count) or the average of both tops. addNum **O(log n)**, findMedian **O(1)**.

::: code javascript Solution + tests
class Heap {
  constructor(cmp) { this.d = []; this.cmp = cmp; }
  get size() { return this.d.length; }
  peek() { return this.d[0]; }
  push(v) { const d = this.d; d.push(v); let i = d.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(d[i], d[p]) >= 0) break; [d[i], d[p]] = [d[p], d[i]]; i = p; } }
  pop() { const d = this.d, top = d[0], last = d.pop(); if (d.length) { d[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < d.length && this.cmp(d[l], d[s]) < 0) s = l; if (r < d.length && this.cmp(d[r], d[s]) < 0) s = r; if (s === i) break; [d[i], d[s]] = [d[s], d[i]]; i = s; } } return top; }
}

class MedianFinder {
  constructor() {
    this.low = new Heap((a, b) => b - a);  // max-heap
    this.high = new Heap((a, b) => a - b); // min-heap
  }
  addNum(num) {
    this.low.push(num);
    this.high.push(this.low.pop());          // largest of low → high
    if (this.high.size > this.low.size) this.low.push(this.high.pop()); // keep low ≥ high
  }
  findMedian() {
    return this.low.size > this.high.size ? this.low.peek() : (this.low.peek() + this.high.peek()) / 2;
  }
}

const mf = new MedianFinder();
const expected = [1, 1.5, 2, 2.5, 3];
[1, 2, 3, 4, 5].forEach((n, i) => {
  mf.addNum(n);
  console.log('add', n, 'median', mf.findMedian(), mf.findMedian() === expected[i] ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Are values bounded (e.g. 0–100)?"* Then use counting buckets, which is O(1). *"Sliding-window median?"*
:::

::: links
LeetCode 295 | https://leetcode.com/problems/find-median-from-data-stream/
:::

=== K Closest Points to Origin
@p 1
@tags heap, sorting, medium
@quick
- Distance² = x² + y² (no need for sqrt).
- **Max-heap of size k** by distance → O(n log k); or sort → O(n log n); or quickselect → O(n) average.

::: code javascript Solution + tests
function kClosest(points, k) {
  // simple & clear: sort by squared distance (O(n log n)). Mention the heap for O(n log k).
  return [...points].sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2)).slice(0, k);
}
const norm = (x) => JSON.stringify(x.map(String).sort());
console.log(JSON.stringify(kClosest([[1, 3], [-2, 2]], 1)), norm(kClosest([[1, 3], [-2, 2]], 1)) === norm([[-2, 2]]) ? '✅' : '❌ FAIL');
console.log(JSON.stringify(kClosest([[3, 3], [5, -1], [-2, 4]], 2)), norm(kClosest([[3, 3], [5, -1], [-2, 4]], 2)) === norm([[3, 3], [-2, 4]]) ? '✅' : '❌ FAIL');
:::

::: ask
- *"Is k small relative to n? Streaming points?"* → heap.
:::

::: links
LeetCode 973 | https://leetcode.com/problems/k-closest-points-to-origin/
:::

=== Graph fundamentals: adjacency list, BFS, DFS, visited set
@p 3
@tags graphs, bfs, dfs
@quick
- Represent graphs with an **adjacency list**: `Map<node, neighbors[]>` → O(V + E) space.
- **BFS** (queue): level by level → **shortest path in unweighted graphs**.
- **DFS** (recursion/stack): go deep → connectivity, cycle detection, topological sort, backtracking.
- Always keep a **visited set** (graphs can have cycles).
- Complexity: **O(V + E)**. Grids: the neighbours are the 4 directions; V = rows × cols.

::: diagram BFS vs DFS visit order from A
flowchart LR
  A(("A")) --- B(("B"))
  A --- C(("C"))
  B --- D(("D"))
  C --- E(("E"))
  D --- F(("F"))
:::

::: code javascript Adjacency list + BFS + DFS + shortest path
function buildGraph(edges, directed = false) {
  const g = new Map();
  for (const [u, v] of edges) {
    if (!g.has(u)) g.set(u, []);
    if (!g.has(v)) g.set(v, []);
    g.get(u).push(v);
    if (!directed) g.get(v).push(u);
  }
  return g;
}

function bfs(graph, start) {
  const visited = new Set([start]), order = [], queue = [start];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const next of graph.get(node)) if (!visited.has(next)) { visited.add(next); queue.push(next); }
  }
  return order;
}

function dfs(graph, node, visited = new Set(), order = []) {
  visited.add(node);
  order.push(node);
  for (const next of graph.get(node)) if (!visited.has(next)) dfs(graph, next, visited, order);
  return order;
}

function shortestPath(graph, start, target) {  // BFS with parent tracking
  const parent = new Map([[start, null]]), queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (node === target) break;
    for (const next of graph.get(node)) if (!parent.has(next)) { parent.set(next, node); queue.push(next); }
  }
  if (!parent.has(target)) return null;
  const path = [];
  for (let n = target; n !== null; n = parent.get(n)) path.unshift(n);
  return path;
}

const g = buildGraph([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'E'], ['D', 'F'], ['E', 'F']]);
console.log('BFS:', bfs(g, 'A').join(' → '), bfs(g, 'A').join('') === 'ABCDEF' ? '✅' : '❌ FAIL');
console.log('DFS:', dfs(g, 'A').join(' → '), dfs(g, 'A').join('') === 'ABDFEC' ? '✅' : '❌ FAIL');
console.log('shortest A→F:', shortestPath(g, 'A', 'F').join(' → '), shortestPath(g, 'A', 'F').length === 4 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Directed or undirected? Weighted?"* (Weighted shortest path → Dijkstra with a heap.) *"Can there be cycles / disconnected parts?"*
:::

::: links
VisuAlgo: graph traversal | https://visualgo.net/en/dfsbfs
:::

=== Number of Islands
@p 3
@tags graphs, dfs, bfs, grid, medium
@quick
- Scan the grid; on each unvisited '1' → count++ and **flood fill** (DFS/BFS) to mark the whole island visited.
- Mark visited by setting the cell to '0' (or use a visited set if mutation isn't allowed).
- **O(rows × cols)** time; recursion depth can be large → BFS/iterative for huge grids.
- Same pattern: Flood Fill, Max Area of Island, Rotting Oranges (multi-source BFS).

::: code javascript Solution (DFS + BFS) + tests
function numIslands(grid) {
  grid = grid.map((r) => [...r]); // don't mutate the caller's grid
  const rows = grid.length, cols = grid[0]?.length || 0;
  let count = 0;
  const sink = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== '1') return;
    grid[r][c] = '0';
    sink(r + 1, c); sink(r - 1, c); sink(r, c + 1); sink(r, c - 1);
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === '1') { count++; sink(r, c); }
  return count;
}

function numIslandsBFS(input) {
  const grid = input.map((r) => [...r]), rows = grid.length, cols = grid[0]?.length || 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let count = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c] !== '1') continue;
    count++;
    const q = [[r, c]]; grid[r][c] = '0';
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < rows && ny < cols && grid[nx][ny] === '1') { grid[nx][ny] = '0'; q.push([nx, ny]); }
      }
    }
  }
  return count;
}

const g1 = [['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']];
const g2 = [['1', '1', '0', '0', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '1', '0', '0'], ['0', '0', '0', '1', '1']];
console.log('grid1:', numIslands(g1), numIslands(g1) === 1 && numIslandsBFS(g1) === 1 ? '✅' : '❌ FAIL');
console.log('grid2:', numIslands(g2), numIslands(g2) === 3 && numIslandsBFS(g2) === 3 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Can I modify the grid? Do diagonals count as connected? How large can the grid be?"* (Deep recursion → BFS / Union-Find.)
:::

::: links
LeetCode 200 | https://leetcode.com/problems/number-of-islands/
:::

=== Flood Fill / Rotting Oranges
@p 2
@tags grid, bfs, dfs, multi-source-bfs
@quick
- **Flood fill**: DFS from (sr, sc), recolour cells with the original colour; return early if new colour === old colour.
- **Rotting oranges**: **multi-source BFS**: enqueue all rotten oranges at time 0; each BFS level = 1 minute; at the end, if fresh remain → -1.
- Both O(rows × cols).

::: code javascript Solutions + tests
function floodFill(image, sr, sc, color) {
  const img = image.map((r) => [...r]);
  const orig = img[sr][sc];
  if (orig === color) return img;
  const fill = (r, c) => {
    if (r < 0 || c < 0 || r >= img.length || c >= img[0].length || img[r][c] !== orig) return;
    img[r][c] = color;
    fill(r + 1, c); fill(r - 1, c); fill(r, c + 1); fill(r, c - 1);
  };
  fill(sr, sc);
  return img;
}

function orangesRotting(input) {
  const grid = input.map((r) => [...r]);
  let queue = [], fresh = 0, minutes = 0;
  grid.forEach((row, r) => row.forEach((v, c) => { if (v === 2) queue.push([r, c]); if (v === 1) fresh++; }));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length && fresh) {
    const next = [];
    for (const [r, c] of queue) for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (grid[nr]?.[nc] === 1) { grid[nr][nc] = 2; fresh--; next.push([nr, nc]); }
    }
    queue = next;
    minutes++;
  }
  return fresh ? -1 : minutes;
}

const ff = floodFill([[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2);
console.log(JSON.stringify(ff), JSON.stringify(ff) === '[[2,2,2],[2,2,0],[2,0,1]]' ? '✅' : '❌ FAIL');
console.log('rotting:', orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), orangesRotting([[2, 1, 1], [1, 1, 0], [0, 1, 1]]) === 4 ? '✅' : '❌ FAIL');
console.log('impossible:', orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), orangesRotting([[2, 1, 1], [0, 1, 1], [1, 0, 1]]) === -1 ? '✅' : '❌ FAIL');
:::

::: ask
- *"4-directional or 8?"* For rotting oranges, explain why BFS (not DFS): the levels represent time.
:::

::: links
LeetCode 733 | https://leetcode.com/problems/flood-fill/
LeetCode 994 | https://leetcode.com/problems/rotting-oranges/
:::

=== Course Schedule (cycle detection & topological sort)
@p 3
@tags graphs, topological-sort, kahn, medium
@quick
- Courses = nodes, prerequisites = directed edges. Can you finish them all? ⇔ **no cycle** in a directed graph.
- **Kahn's algorithm (BFS)**: compute in-degrees; queue nodes with in-degree 0; pop, reduce the neighbours' in-degree; if processed count === n → no cycle (and the order = topological order).
- DFS alternative: 3 colours (unvisited / visiting / done); reaching a "visiting" node = cycle.
- **O(V + E)**. Real world: build systems, npm dependency install order, task pipelines.

::: text
**Problem:** `numCourses = 2, prerequisites = [[1,0]]` (take 0 before 1) → `true`. `[[1,0],[0,1]]` → `false` (cycle).

### Kahn's algorithm
1. Build the adjacency list `pre → [courses]` and `indegree[course]`.
2. Queue every course with in-degree 0 (no prerequisites).
3. Pop a course, add it to the order, decrement the in-degree of the courses that depend on it; push any that reach 0.
4. If the order contains all courses → possible; otherwise a cycle blocks some.
:::

::: diagram Prerequisites graph (edges point from prerequisite to course)
flowchart LR
  C0["0: JS basics"] --> C1["1: Node"]
  C0 --> C2["2: React"]
  C1 --> C3["3: Express"]
  C2 --> C4["4: Full-stack app"]
  C3 --> C4
:::

::: code javascript Solution (Kahn + DFS) + tests
function findOrder(numCourses, prerequisites) {
  const graph = Array.from({ length: numCourses }, () => []);
  const indegree = new Array(numCourses).fill(0);
  for (const [course, pre] of prerequisites) { graph[pre].push(course); indegree[course]++; }

  const queue = [];
  indegree.forEach((d, i) => d === 0 && queue.push(i));
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const next of graph[node]) if (--indegree[next] === 0) queue.push(next);
  }
  return order.length === numCourses ? order : []; // [] → cycle
}
const canFinish = (n, pre) => findOrder(n, pre).length === n;

// DFS 3-colour cycle detection
function hasCycleDFS(n, prerequisites) {
  const graph = Array.from({ length: n }, () => []);
  for (const [c, p] of prerequisites) graph[p].push(c);
  const state = new Array(n).fill(0); // 0 unvisited, 1 visiting, 2 done
  const visit = (u) => {
    if (state[u] === 1) return true;   // back edge → cycle
    if (state[u] === 2) return false;
    state[u] = 1;
    for (const v of graph[u]) if (visit(v)) return true;
    state[u] = 2;
    return false;
  };
  return [...Array(n).keys()].some(visit);
}

console.log(canFinish(2, [[1, 0]]) === true ? '✅' : '❌ FAIL', 'simple chain');
console.log(canFinish(2, [[1, 0], [0, 1]]) === false ? '✅' : '❌ FAIL', 'cycle');
const order = findOrder(5, [[1, 0], [2, 0], [3, 1], [4, 2], [4, 3]]);
console.log('topological order:', order.join(' → '), order[0] === 0 && order.at(-1) === 4 ? '✅' : '❌ FAIL');
console.log('DFS finds cycle:', hasCycleDFS(3, [[1, 0], [2, 1], [0, 2]]) === true ? '✅' : '❌ FAIL');
:::

::: ask
- *"Return just possible/impossible, or an actual order (Course Schedule II)?"* *"Are there duplicate edges?"*
:::

::: links
LeetCode 207 | https://leetcode.com/problems/course-schedule/
LeetCode 210 (order) | https://leetcode.com/problems/course-schedule-ii/
:::

=== Clone Graph
@p 2
@tags graphs, hashmap, dfs, medium
@quick
- DFS/BFS with a **Map original → clone** (it doubles as the visited set and handles cycles).
- Create the clone when first seen; then connect the neighbour clones. **O(V + E)**.

::: code javascript Solution + tests
class GraphNode { constructor(val, neighbors = []) { this.val = val; this.neighbors = neighbors; } }

function cloneGraph(node, clones = new Map()) {
  if (!node) return null;
  if (clones.has(node)) return clones.get(node);
  const copy = new GraphNode(node.val);
  clones.set(node, copy);                           // register BEFORE recursing (cycles!)
  copy.neighbors = node.neighbors.map((n) => cloneGraph(n, clones));
  return copy;
}

// 1-2, 2-3, 3-4, 4-1 (square)
const n = [1, 2, 3, 4].map((v) => new GraphNode(v));
n[0].neighbors = [n[1], n[3]]; n[1].neighbors = [n[0], n[2]]; n[2].neighbors = [n[1], n[3]]; n[3].neighbors = [n[2], n[0]];
const c = cloneGraph(n[0]);
const adj = (start) => { const seen = new Map(), q = [start]; seen.set(start, true); const out = []; while (q.length) { const x = q.shift(); out.push(`${x.val}:${x.neighbors.map((y) => y.val).join('')}`); for (const y of x.neighbors) if (!seen.has(y)) { seen.set(y, true); q.push(y); } } return out.sort().join(' '); };
console.log('same structure:', adj(c) === adj(n[0]) ? '✅' : '❌ FAIL', adj(c));
console.log('deep copy (different objects):', c !== n[0] && c.neighbors[0] !== n[1] ? '✅' : '❌ FAIL');
:::

::: ask
- *"Directed or undirected? Can node values repeat?"* (Key the map by node reference, not value.)
:::

::: links
LeetCode 133 | https://leetcode.com/problems/clone-graph/
:::

=== Number of Connected Components / Shortest Path in Binary Matrix
@p 1
@tags graphs, union-find, bfs
@quick
- Connected components: DFS count, or **Union-Find** (path compression + union by rank → near O(1) operations).
- Shortest path in a binary matrix: **BFS with 8 directions** from (0,0); distance = the level. Return -1 if blocked.
- BFS gives the shortest path only when all edges have equal weight.

::: code javascript Union-Find + BFS matrix + tests
class UnionFind {
  constructor(n) { this.parent = [...Array(n).keys()]; this.rank = Array(n).fill(0); this.count = n; }
  find(x) { return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x])); } // path compression
  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    this.count--;
    return true;
  }
}
function countComponents(n, edges) {
  const uf = new UnionFind(n);
  edges.forEach(([a, b]) => uf.union(a, b));
  return uf.count;
}

function shortestPathBinaryMatrix(grid) {
  const n = grid.length;
  if (grid[0][0] || grid[n - 1][n - 1]) return -1;
  const seen = grid.map((r) => r.map(() => false));
  let queue = [[0, 0]], dist = 1;
  seen[0][0] = true;
  while (queue.length) {
    const next = [];
    for (const [r, c] of queue) {
      if (r === n - 1 && c === n - 1) return dist;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < n && nc < n && !grid[nr][nc] && !seen[nr][nc]) { seen[nr][nc] = true; next.push([nr, nc]); }
      }
    }
    queue = next; dist++;
  }
  return -1;
}

console.log('components:', countComponents(5, [[0, 1], [1, 2], [3, 4]]), countComponents(5, [[0, 1], [1, 2], [3, 4]]) === 2 ? '✅' : '❌ FAIL');
console.log('path [[0,1],[1,0]]:', shortestPathBinaryMatrix([[0, 1], [1, 0]]), shortestPathBinaryMatrix([[0, 1], [1, 0]]) === 2 ? '✅' : '❌ FAIL');
console.log('path 3x3:', shortestPathBinaryMatrix([[0, 0, 0], [1, 1, 0], [1, 1, 0]]), shortestPathBinaryMatrix([[0, 0, 0], [1, 1, 0], [1, 1, 0]]) === 4 ? '✅' : '❌ FAIL');
console.log('blocked:', shortestPathBinaryMatrix([[1, 0, 0], [1, 1, 0], [1, 1, 0]]) === -1 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Weighted edges?"* → Dijkstra. *"Dynamic connections added over time?"* → Union-Find shines.
:::

::: links
LeetCode 1091 | https://leetcode.com/problems/shortest-path-in-binary-matrix/
Union-Find explained | https://cp-algorithms.com/data_structures/disjoint_set_union.html
:::
