@section DSA: Binary Search & Trees
@icon 🌳
@color #14b8a6
@desc Tier 7 + Tier 8: binary search (on index and on answer), DFS/BFS traversals, BST validation, LCA, diameter.

=== Binary Search
@p 3
@tags binary-search, easy
@quick
- Sorted array: compare with the middle, discard half each step → **O(log n)**.
- Template: `lo = 0, hi = n - 1; while (lo <= hi) { mid = lo + ((hi - lo) >> 1) … }`.
- Avoid overflow / off-by-one: be consistent with `lo <= hi` + `hi = mid - 1`, or `lo < hi` + `hi = mid`.
- Variants: lower bound (first ≥ target), upper bound, search on the **answer space**.

::: text
**Problem:** Return the index of `target` in a sorted array, or -1.

### Why O(log n)?
Each comparison halves the search space: 1,000,000 → 500,000 → … → 1, which takes about **20 steps**. (This is also why database B-tree indexes are fast.)

### Two templates worth memorising
1. **Exact match**: `while (lo <= hi)`, return on equality.
2. **Lower bound** (first index where `nums[i] >= target`): `lo = 0, hi = n; while (lo < hi) { mid; if (nums[mid] < target) lo = mid + 1; else hi = mid; } return lo;` This is the building block for insert position, first/last occurrence, and binary search on the answer.
:::

::: chart line Steps needed: linear vs binary search
n,Linear (worst),Binary (worst)
10,10,4
100,100,7
1000,1000,10
10000,10000,14
100000,100000,17
:::

::: code javascript Solution + lower/upper bound + tests
function binarySearch(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

// first index with nums[i] >= target  (insert position)
function lowerBound(nums, target) {
  let lo = 0, hi = nums.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}
// first index with nums[i] > target
const upperBound = (nums, target) => lowerBound(nums, target + 1e-9); // for integers you can use target + 1

const arr = [-1, 0, 3, 5, 9, 12];
[[9, 4], [2, -1], [-1, 0], [12, 5]].forEach(([t, e]) => console.log('search', t, binarySearch(arr, t), binarySearch(arr, t) === e ? '✅' : '❌ FAIL'));
console.log('lowerBound(4) =', lowerBound(arr, 4), lowerBound(arr, 4) === 3 ? '✅' : '❌ FAIL');
console.log('upperBound(5) =', upperBound(arr, 5), upperBound(arr, 5) === 4 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Is the array sorted ascending? Duplicates? What to return if not found?"*
:::

::: links
LeetCode 704 | https://leetcode.com/problems/binary-search/
:::

=== Search in Rotated Sorted Array
@p 3
@tags binary-search, medium
@quick
- At any `mid`, **one half is sorted**. Check whether the target lies in the sorted half; if yes, search there, else the other half.
- If `nums[lo] <= nums[mid]` → the left half is sorted.
- **O(log n)**; values are distinct in the classic version (with duplicates, worst case O(n)).

::: text
**Problem:** A sorted array rotated at an unknown pivot, e.g. `[4,5,6,7,0,1,2]`. Find the target's index in O(log n).

### Reasoning at each step
- If `nums[lo] <= nums[mid]`: **left half sorted**. If `nums[lo] <= target < nums[mid]` → go left, else go right.
- Else: **right half sorted**. If `nums[mid] < target <= nums[hi]` → go right, else go left.
:::

::: code javascript Solution + tests
function searchRotated(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {                       // left half sorted
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {                                           // right half sorted
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}
[[[4, 5, 6, 7, 0, 1, 2], 0, 4], [[4, 5, 6, 7, 0, 1, 2], 3, -1], [[1], 0, -1], [[3, 1], 1, 1], [[5, 1, 3], 5, 0]].forEach(([n, t, e]) =>
  console.log(JSON.stringify(n), t, searchRotated(n, t), searchRotated(n, t) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Are values distinct?"* (Duplicates → LeetCode 81; when `nums[lo] === nums[mid]`, shrink `lo++`.)
:::

::: links
LeetCode 33 | https://leetcode.com/problems/search-in-rotated-sorted-array/
:::

=== Find Minimum in Rotated Sorted Array
@p 2
@tags binary-search, medium
@quick
- Compare `nums[mid]` with `nums[hi]`: if `nums[mid] > nums[hi]`, the min is to the **right** (`lo = mid + 1`); else it's at mid or the left (`hi = mid`).
- Loop `while (lo < hi)`; answer `nums[lo]`. **O(log n)**.

::: code javascript Solution + tests
function findMin(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] > nums[hi]) lo = mid + 1; // pivot is right of mid
    else hi = mid;                          // mid could be the min
  }
  return nums[lo];
}
[[[3, 4, 5, 1, 2], 1], [[4, 5, 6, 7, 0, 1, 2], 0], [[11, 13, 15, 17], 11], [[2, 1], 1]].forEach(([n, e]) =>
  console.log(JSON.stringify(n), findMin(n), findMin(n) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Distinct values?"* Why compare with `hi`, not `lo`? Because comparing with `lo` can't distinguish an unrotated array.
:::

::: links
LeetCode 153 | https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/
:::

=== Search Insert Position / First and Last Position
@p 2
@tags binary-search, lower-bound
@quick
- Insert position = **lower bound** (first index ≥ target).
- First & last position: `first = lowerBound(t)`, `last = lowerBound(t + 1) - 1`; verify `nums[first] === t`.
- Both **O(log n)**.

::: code javascript Solutions + tests
function lowerBound(nums, target) {
  let lo = 0, hi = nums.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

const searchInsert = (nums, target) => lowerBound(nums, target); // LeetCode 35

function searchRange(nums, target) {                             // LeetCode 34
  const first = lowerBound(nums, target);
  if (first === nums.length || nums[first] !== target) return [-1, -1];
  return [first, lowerBound(nums, target + 1) - 1];
}

[[[1, 3, 5, 6], 5, 2], [[1, 3, 5, 6], 2, 1], [[1, 3, 5, 6], 7, 4], [[1, 3, 5, 6], 0, 0]].forEach(([n, t, e]) =>
  console.log('insert', JSON.stringify(n), t, searchInsert(n, t), searchInsert(n, t) === e ? '✅' : '❌ FAIL'));
[[[5, 7, 7, 8, 8, 10], 8, '3,4'], [[5, 7, 7, 8, 8, 10], 6, '-1,-1'], [[], 0, '-1,-1']].forEach(([n, t, e]) =>
  console.log('range', JSON.stringify(n), t, searchRange(n, t).join(), searchRange(n, t).join() === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Integers only?"* (The `target + 1` trick needs integers; otherwise write a separate upper-bound.)
:::

::: links
LeetCode 35 | https://leetcode.com/problems/search-insert-position/
LeetCode 34 | https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/
:::

=== Find Peak Element
@p 1
@tags binary-search, medium
@quick
- If `nums[mid] < nums[mid+1]`, a peak exists to the **right** (going uphill); else to the left including mid.
- Works on unsorted arrays because of the "slope" argument. **O(log n)**.

::: code javascript Solution + tests
function findPeakElement(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] < nums[mid + 1]) lo = mid + 1; // climb right
    else hi = mid;
  }
  return lo;
}
const isPeak = (n, i) => (i === 0 || n[i] > n[i - 1]) && (i === n.length - 1 || n[i] > n[i + 1]);
[[1, 2, 3, 1], [1, 2, 1, 3, 5, 6, 4], [1], [3, 2, 1]].forEach((n) => {
  const i = findPeakElement(n);
  console.log(JSON.stringify(n), 'peak index', i, isPeak(n, i) ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Any peak or the global maximum?"* (Any peak → O(log n); global max needs O(n).)
:::

::: links
LeetCode 162 | https://leetcode.com/problems/find-peak-element/
:::

=== Koko Eating Bananas (binary search on the answer)
@p 2
@tags binary-search, answer-space, medium
@quick
- Search the **answer** (speed k in `[1, max(piles)]`), not an index.
- `canFinish(k)` = `sum(ceil(pile / k)) <= h` is **monotonic** (if k works, bigger k works) → find the smallest k that works.
- **O(n log M)**. The pattern appears in: ship packages within D days, split array largest sum, min days for bouquets.

::: text
**Problem:** `piles` of bananas, `h` hours. Each hour Koko eats up to `k` bananas from one pile. Minimum `k` to finish in `h` hours?
`piles = [3,6,7,11], h = 8 → 4`

### "Binary search on the answer" recipe
1. Define the answer range `[lo, hi]`.
2. Write a **feasibility check** `ok(x)` that's monotonic (false…false, true…true).
3. Binary search for the **first true**.
:::

::: code javascript Solution + tests
function minEatingSpeed(piles, h) {
  const hoursNeeded = (k) => piles.reduce((sum, p) => sum + Math.ceil(p / k), 0);
  let lo = 1, hi = Math.max(...piles);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hoursNeeded(mid) <= h) hi = mid;  // feasible → try slower
    else lo = mid + 1;                    // too slow
  }
  return lo;
}
[[[3, 6, 7, 11], 8, 4], [[30, 11, 23, 4, 20], 5, 30], [[30, 11, 23, 4, 20], 6, 23], [[1000000000], 2, 500000000]].forEach(([p, h, e]) =>
  console.log(JSON.stringify(p), 'h=' + h, minEatingSpeed(p, h), minEatingSpeed(p, h) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Is h always ≥ the number of piles?"* (Otherwise it's impossible.) State the monotonicity: interviewers want to hear why binary search is valid.
:::

::: links
LeetCode 875 | https://leetcode.com/problems/koko-eating-bananas/
:::

=== Tree traversals: DFS (pre/in/post-order) and BFS (level order)
@p 3
@tags trees, dfs, bfs, traversal
@quick
- **Preorder** root→left→right (copy/serialise) · **Inorder** left→root→right (**sorted order for a BST**) · **Postorder** left→right→root (delete/compute from children).
- **BFS / level order** uses a **queue**; DFS uses **recursion or a stack**.
- Example tree 1,(2,(4,5)),3 → inorder **4→2→5→1→3**, preorder 1,2,4,5,3, postorder 4,5,2,3,1, level [[1],[2,3],[4,5]].
- Time O(n); space O(h) for DFS (h = height), O(w) for BFS (w = max width).

::: text
### Example tree
- 1 is the root; 2 and 3 are its children; 4 and 5 are the children of 2.

| Traversal | Order | Result | Typical use |
|---|---|---|---|
| Preorder | Root, Left, Right | 1, 2, 4, 5, 3 | Serialise/clone a tree |
| **Inorder** | Left, Root, Right | **4, 2, 5, 1, 3** | BST → sorted output |
| Postorder | Left, Right, Root | 4, 5, 2, 3, 1 | Delete a tree, compute heights/sizes |
| Level order (BFS) | Level by level | [1], [2, 3], [4, 5] | Shortest path in unweighted trees, per-level views |
:::

::: diagram Example tree
flowchart TD
  N1(("1")) --> N2(("2"))
  N1 --> N3(("3"))
  N2 --> N4(("4"))
  N2 --> N5(("5"))
:::

::: code javascript All traversals (recursive + iterative) + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
// build from level-order array (null = missing)
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) {
    const node = q.shift();
    if (arr[i] != null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}

const preorder = (n, out = []) => (n ? (out.push(n.val), preorder(n.left, out), preorder(n.right, out), out) : out);
const inorder = (n, out = []) => (n ? (inorder(n.left, out), out.push(n.val), inorder(n.right, out), out) : out);
const postorder = (n, out = []) => (n ? (postorder(n.left, out), postorder(n.right, out), out.push(n.val), out) : out);

function inorderIterative(root) {           // stack-based (no recursion)
  const out = [], stack = [];
  let cur = root;
  while (cur || stack.length) {
    while (cur) { stack.push(cur); cur = cur.left; }
    cur = stack.pop();
    out.push(cur.val);
    cur = cur.right;
  }
  return out;
}

function levelOrder(root) {                 // BFS with a queue
  if (!root) return [];
  const res = [], queue = [root];
  while (queue.length) {
    const size = queue.length, level = [];
    for (let i = 0; i < size; i++) {
      const node = queue.shift();
      level.push(node.val);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    res.push(level);
  }
  return res;
}

const root = buildTree([1, 2, 3, 4, 5]);
const check = (name, got, exp) => console.log(name.padEnd(18), JSON.stringify(got), JSON.stringify(got) === JSON.stringify(exp) ? '✅' : '❌ FAIL');
check('preorder', preorder(root), [1, 2, 4, 5, 3]);
check('inorder', inorder(root), [4, 2, 5, 1, 3]);
check('inorder iterative', inorderIterative(root), [4, 2, 5, 1, 3]);
check('postorder', postorder(root), [4, 5, 2, 3, 1]);
check('level order', levelOrder(root), [[1], [2, 3], [4, 5]]);
:::

::: ask
- *"Recursive or iterative?"* (Deep trees may overflow the call stack.) *"Return a flat list or grouped by level?"*
:::

::: links
LeetCode 102: Level Order | https://leetcode.com/problems/binary-tree-level-order-traversal/
LeetCode 94: Inorder | https://leetcode.com/problems/binary-tree-inorder-traversal/
VisuAlgo BST | https://visualgo.net/en/bst
:::

=== Maximum Depth of Binary Tree
@p 3
@tags trees, dfs, recursion, easy
@quick
- `depth(node) = 0 if null else 1 + max(depth(left), depth(right))`.
- **O(n) time, O(h) space** (recursion stack).
- BFS alternative: count levels.

::: code javascript Solution + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) { const n = q.shift();
    if (arr[i] != null) q.push((n.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((n.right = new TreeNode(arr[i]))); i++; }
  return root;
}

const maxDepth = (node) => (node ? 1 + Math.max(maxDepth(node.left), maxDepth(node.right)) : 0);

function maxDepthBFS(root) {
  if (!root) return 0;
  let depth = 0, q = [root];
  while (q.length) { depth++; q = q.flatMap((n) => [n.left, n.right].filter(Boolean)); }
  return depth;
}

[[[3, 9, 20, null, null, 15, 7], 3], [[1, null, 2], 2], [[], 0]].forEach(([a, e]) => {
  const t = buildTree(a);
  console.log(JSON.stringify(a), maxDepth(t), maxDepth(t) === e && maxDepthBFS(t) === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Depth counted in nodes or edges?"* (LeetCode counts nodes.)
:::

::: links
LeetCode 104 | https://leetcode.com/problems/maximum-depth-of-binary-tree/
:::

=== Invert Binary Tree / Same Tree
@p 2
@tags trees, recursion, easy
@quick
- **Invert**: swap left and right at every node (recursively or with BFS). O(n).
- **Same tree**: both null → true; one null or values differ → false; recurse on left AND right. O(n).
- Symmetric tree = same-tree check on `left` vs mirrored `right`.

::: code javascript Solutions + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) { const n = q.shift();
    if (arr[i] != null) q.push((n.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((n.right = new TreeNode(arr[i]))); i++; }
  return root;
}
const toLevelArray = (root) => { const out = [], q = [root]; while (q.length) { const n = q.shift(); if (n) { out.push(n.val); q.push(n.left, n.right); } } return out; };

function invertTree(node) {
  if (!node) return null;
  [node.left, node.right] = [invertTree(node.right), invertTree(node.left)];
  return node;
}

function isSameTree(p, q) {
  if (!p && !q) return true;
  if (!p || !q || p.val !== q.val) return false;
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}

function isSymmetric(root) {
  const mirror = (a, b) => (!a && !b) || (!!a && !!b && a.val === b.val && mirror(a.left, b.right) && mirror(a.right, b.left));
  return !root || mirror(root.left, root.right);
}

const inv = toLevelArray(invertTree(buildTree([4, 2, 7, 1, 3, 6, 9]))).join();
console.log('invert:', inv, inv === '4,7,2,9,6,3,1' ? '✅' : '❌ FAIL');
console.log('same  :', isSameTree(buildTree([1, 2, 3]), buildTree([1, 2, 3])) === true ? '✅' : '❌ FAIL');
console.log('diff  :', isSameTree(buildTree([1, 2]), buildTree([1, null, 2])) === false ? '✅' : '❌ FAIL');
console.log('symmetric:', isSymmetric(buildTree([1, 2, 2, 3, 4, 4, 3])) === true ? '✅' : '❌ FAIL');
:::

::: ask
- *"In place or return a new tree?"*
:::

::: links
LeetCode 226 | https://leetcode.com/problems/invert-binary-tree/
LeetCode 100 | https://leetcode.com/problems/same-tree/
:::

=== Validate Binary Search Tree
@p 3
@tags bst, dfs, medium
@quick
- BST: **every** node in the left subtree < node < **every** node in the right subtree (not just the direct children!).
- Pass a valid range `(min, max)` down: left child gets `(min, node.val)`, right child gets `(node.val, max)`.
- Or: an inorder traversal must be **strictly increasing**.
- **O(n) time, O(h) space**.

::: text
**Common mistake:** checking only `left.val < node.val < right.val`. This tree passes that check but is **not** a BST:
- 5 has children 4 and 6; 6 has a left child **3**. 3 < 6 locally, but 3 is in the **right** subtree of 5, so it must be > 5 ❌

### Range approach
Each node must satisfy `low < val < high`, where the bounds come from its ancestors.
:::

::: diagram Invalid BST that fools the naive check
flowchart TD
  A(("5")) --> B(("4"))
  A --> C(("6"))
  C --> D(("3: must be > 5"))
  C --> E(("7"))
:::

::: code javascript Solution + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) { const n = q.shift();
    if (arr[i] != null) q.push((n.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((n.right = new TreeNode(arr[i]))); i++; }
  return root;
}

function isValidBST(node, low = -Infinity, high = Infinity) {
  if (!node) return true;
  if (node.val <= low || node.val >= high) return false;
  return isValidBST(node.left, low, node.val) && isValidBST(node.right, node.val, high);
}

// Inorder must be strictly increasing
function isValidBSTInorder(root) {
  let prev = -Infinity, ok = true;
  (function walk(n) { if (!n || !ok) return; walk(n.left); if (n.val <= prev) ok = false; prev = n.val; walk(n.right); })(root);
  return ok;
}

[[[2, 1, 3], true], [[5, 1, 4, null, null, 3, 6], false], [[5, 4, 6, null, null, 3, 7], false], [[2, 2, 2], false], [[10, 5, 15, 3, 7, 12, 20], true]].forEach(([a, e]) => {
  const t = buildTree(a);
  console.log(JSON.stringify(a), isValidBST(t), isValidBST(t) === e && isValidBSTInorder(t) === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Are duplicates allowed, and on which side?"* This changes `<` vs `<=`.
:::

::: links
LeetCode 98 | https://leetcode.com/problems/validate-binary-search-tree/
:::

=== Lowest Common Ancestor
@p 2
@tags trees, recursion, medium
@quick
- Binary tree: recurse; if the node is p or q → return it; if both left and right return non-null → the current node is the LCA; else return the non-null side. O(n).
- **BST**: walk from the root. If both values < node → go left; both > node → go right; else the current node is the LCA. O(h).

::: code javascript Solutions + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) { const n = q.shift();
    if (arr[i] != null) q.push((n.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((n.right = new TreeNode(arr[i]))); i++; }
  return root;
}
const find = (n, v) => (!n ? null : n.val === v ? n : find(n.left, v) || find(n.right, v));

// General binary tree (LeetCode 236)
function lowestCommonAncestor(root, p, q) {
  if (!root || root === p || root === q) return root;
  const left = lowestCommonAncestor(root.left, p, q);
  const right = lowestCommonAncestor(root.right, p, q);
  if (left && right) return root;   // p and q are on different sides
  return left || right;
}

// BST (LeetCode 235): use ordering
function lcaBST(root, p, q) {
  let node = root;
  while (node) {
    if (p.val < node.val && q.val < node.val) node = node.left;
    else if (p.val > node.val && q.val > node.val) node = node.right;
    else return node;
  }
  return null;
}

const t = buildTree([3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]);
console.log('LCA(5,1) =', lowestCommonAncestor(t, find(t, 5), find(t, 1)).val, lowestCommonAncestor(t, find(t, 5), find(t, 1)).val === 3 ? '✅' : '❌ FAIL');
console.log('LCA(5,4) =', lowestCommonAncestor(t, find(t, 5), find(t, 4)).val, lowestCommonAncestor(t, find(t, 5), find(t, 4)).val === 5 ? '✅' : '❌ FAIL');
const bst = buildTree([6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]);
console.log('BST LCA(2,8) =', lcaBST(bst, find(bst, 2), find(bst, 8)).val, lcaBST(bst, find(bst, 2), find(bst, 8)).val === 6 ? '✅' : '❌ FAIL');
console.log('BST LCA(2,4) =', lcaBST(bst, find(bst, 2), find(bst, 4)).val, lcaBST(bst, find(bst, 2), find(bst, 4)).val === 2 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Is it a BST or a general binary tree? Are both nodes guaranteed to exist? Do nodes have parent pointers?"*
:::

::: links
LeetCode 236 | https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/
:::

=== Diameter of Binary Tree / Balanced Binary Tree
@p 2
@tags trees, dfs, height
@quick
- Both are **postorder height** problems: compute the height of the children, then use them at the parent.
- Diameter = max over nodes of `leftHeight + rightHeight` (edges); track it globally while computing heights. O(n).
- Balanced: `|leftH - rightH| <= 1` at every node; return -1 early to signal "unbalanced". O(n) (not O(n²)).

::: code javascript Solutions + tests
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] == null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;
  while (q.length && i < arr.length) { const n = q.shift();
    if (arr[i] != null) q.push((n.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] != null) q.push((n.right = new TreeNode(arr[i]))); i++; }
  return root;
}

function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (n) => {
    if (!n) return 0;
    const l = height(n.left), r = height(n.right);
    best = Math.max(best, l + r);   // path through n
    return 1 + Math.max(l, r);
  };
  height(root);
  return best;
}

function isBalanced(root) {
  const h = (n) => {
    if (!n) return 0;
    const l = h(n.left); if (l === -1) return -1;
    const r = h(n.right); if (r === -1) return -1;
    return Math.abs(l - r) > 1 ? -1 : 1 + Math.max(l, r);
  };
  return h(root) !== -1;
}

console.log('diameter [1,2,3,4,5] =', diameterOfBinaryTree(buildTree([1, 2, 3, 4, 5])), diameterOfBinaryTree(buildTree([1, 2, 3, 4, 5])) === 3 ? '✅' : '❌ FAIL');
console.log('diameter [1,2] =', diameterOfBinaryTree(buildTree([1, 2])), diameterOfBinaryTree(buildTree([1, 2])) === 1 ? '✅' : '❌ FAIL');
console.log('balanced [3,9,20,null,null,15,7]', isBalanced(buildTree([3, 9, 20, null, null, 15, 7])) === true ? '✅' : '❌ FAIL');
console.log('unbalanced [1,2,2,3,3,null,null,4,4]', isBalanced(buildTree([1, 2, 2, 3, 3, null, null, 4, 4])) === false ? '✅' : '❌ FAIL');
:::

::: ask
- *"Diameter in edges or nodes?"* *"Height-balanced definition?"*
:::

::: links
LeetCode 543 | https://leetcode.com/problems/diameter-of-binary-tree/
LeetCode 110 | https://leetcode.com/problems/balanced-binary-tree/
:::
