@section DSA: Binary Search & Trees
@icon 🌳
@color #14b8a6
@desc Tier 7 + Tier 8: binary search (on an index and on the answer), rotated arrays, lower bound, DFS/BFS traversals, depth, BST validation, LCA and diameter. Every problem with pictures, dry runs and tests.

=== Binary Search
@p 3
@tags binary-search, easy
@quick
- Sorted array: compare with the **middle**, discard the half that can't contain the target.
- `while (lo <= hi)`, `mid = lo + ((hi - lo) >> 1)`; `lo = mid + 1` / `hi = mid - 1`.
- **O(log n) time, O(1) space**: 1,000,000 items → at most 20 comparisons.
- Return `-1` when `lo > hi` (not found).

::: text 🧾 Problem
Given a **sorted** (ascending) array `nums` and a `target`, return the index of `target`, or `-1` if it isn't there. You must write an **O(log n)** algorithm.

**Example 1:** `nums = [-1, 0, 3, 5, 9, 12], target = 9 → 4`
**Example 2:** `nums = [-1, 0, 3, 5, 9, 12], target = 2 → -1`

**Constraints:** 1 ≤ n ≤ 10⁴, all values distinct, sorted ascending.
:::

::: text 🧒 Intuition
The **"guess my number" game**: I think of a number between 1 and 100. A smart player always guesses the **middle** (50). "Too high" → the answer is in 1–49, so half the possibilities are gone with one question. Then guess 25, and so on. At most 7 guesses for 100 numbers.

A sorted array works the same way: look at the middle element; if it's too small, everything to its left is also too small.
:::

::: text 🐢 Brute force
**Idea:** linear scan: check every element until you find the target.

`for i in 0..n-1: if nums[i] === target: return i`
`return -1`

**Complexity:** O(n). For n = 10⁹ (e.g. searching a huge sorted log file) that's a billion comparisons; binary search needs about **30**. The linear scan ignores the fact that the array is sorted.
:::

::: text 💡 Key insight
In a sorted array, one comparison with the middle tells you **which half** the target must be in. Discarding half every step means the range shrinks n → n/2 → n/4 → … → 1, which takes log₂ n steps.

**Pattern name: Binary search (on an index).**
:::

::: diagram Binary search loop
flowchart TD
  S["lo = 0, hi = n - 1"] --> L{"lo <= hi?"}
  L -->|"no"| N["return -1"]
  L -->|"yes"| M["mid = lo + ((hi - lo) >> 1)"]
  M --> C{"compare nums[mid] with target"}
  C -->|"equal"| F["return mid"]
  C -->|"smaller"| R["lo = mid + 1 (go right)"]
  C -->|"bigger"| Q["hi = mid - 1 (go left)"]
  R --> L
  Q --> L
:::

::: image Binary Search: mid 3 is too small, then mid 9 is found
/images/dsa-binary-search-trees/binary-search.svg
:::

::: text 🔍 Dry run: nums = [-1, 0, 3, 5, 9, 12]
**target = 9**
| Step | lo | hi | mid | nums[mid] | decision |
|---|---|---|---|---|---|
| 1 | 0 | 5 | 2 | 3 | 3 < 9 → lo = 3 |
| 2 | 3 | 5 | 4 | 9 | **found → return 4** |

**target = 2**
| Step | lo | hi | mid | nums[mid] | decision |
|---|---|---|---|---|---|
| 1 | 0 | 5 | 2 | 3 | 3 > 2 → hi = 1 |
| 2 | 0 | 1 | 0 | −1 | −1 < 2 → lo = 1 |
| 3 | 1 | 1 | 1 | 0 | 0 < 2 → lo = 2 |
| 4 | 2 | 1 | | | lo > hi → **return −1** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Binary search on a sorted array. Time O(log n), Space O(1).
 */
function search(nums, target) {
  let lo = 0, hi = nums.length - 1;           // the target, if present, is inside [lo, hi]
  while (lo <= hi) {                          // the range is not empty
    const mid = lo + ((hi - lo) >> 1);        // middle index (avoids overflow in other languages)
    if (nums[mid] === target) return mid;     // found it
    if (nums[mid] < target) lo = mid + 1;     // target is bigger → discard the left half and mid
    else hi = mid - 1;                        // target is smaller → discard the right half and mid
  }
  return -1;                                  // range became empty → not present
}

/** Count comparisons to show the log2(n) growth. */
function countSteps(n, target) {
  let lo = 0, hi = n - 1, steps = 0;
  while (lo <= hi) { steps++; const mid = lo + ((hi - lo) >> 1); if (mid === target) return steps; if (mid < target) lo = mid + 1; else hi = mid - 1; }
  return steps;
}

// ---------- tests ----------
const cases = [
  [[-1, 0, 3, 5, 9, 12], 9, 4],
  [[-1, 0, 3, 5, 9, 12], 2, -1],   // not present
  [[5], 5, 0],                     // single element
  [[5], -5, -1],
  [[1, 3], 3, 1],                  // two elements, target at the end
  [[1, 3, 5, 7, 9], 1, 0],         // first element
  [[], 1, -1],                     // empty
];
for (const [nums, target, expected] of cases) {
  const got = search(nums, target);
  console.log(JSON.stringify(nums), 'target', target, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const steps = countSteps(1000000, 999999);
console.log('1,000,000 items, worst-case target →', steps, 'comparisons', steps <= 20 ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons in the worst case: linear scan vs binary search
n,Linear scan n,Binary search log2 n
10,10,4
100,100,7
1000,1000,10
10000,10000,14
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Linear scan | O(n) | O(1) | Works on unsorted data | Slow on big inputs | Unsorted or tiny arrays |
| **Iterative binary search** | **O(log n)** | **O(1)** | Optimal on sorted data | Off-by-one traps | Default answer |
| Recursive binary search | O(log n) | O(log n) stack | Mirrors the idea | Extra stack | If asked |
| Hash set | O(1) average lookup | O(n) | Faster per lookup | O(n) build time and memory; no order | Many lookups, order not needed |
:::

::: warning ⚠️ Common mistakes / edge cases
- `while (lo < hi)` with `hi = mid - 1` → misses the case where the target is at the last remaining index.
- `lo = mid` or `hi = mid` (instead of ±1) in this template → **infinite loop**.
- Using it on an **unsorted** array.
- Computing `mid` as `(lo + hi) / 2` without flooring in JS (gives a fraction).
:::

::: understand
- Binary search works whenever there's a **monotonic yes/no question** ("is the value at mid ≥ target?"). That includes: [Search Insert Position](https://leetcode.com/problems/search-insert-position/) (lower bound), [Search in Rotated Sorted Array](https://leetcode.com/problems/search-in-rotated-sorted-array/), [Koko Eating Bananas](https://leetcode.com/problems/koko-eating-bananas/) (binary search on the answer).
- Learn **one** template perfectly (inclusive `[lo, hi]` with `lo <= hi`) instead of mixing styles.
:::

::: ask
- *"Is the array sorted ascending? Can there be duplicates?"* (Duplicates → which index: first, last, any?)
- *"Return the index, or a boolean?"*
- *"What to return if not found?"*
:::

::: important ⭐ How to explain it in the interview
> "Since the array is sorted, I compare the target with the middle element. If it's equal I return mid; if the middle is smaller, the target can only be to the right, so lo = mid + 1; otherwise hi = mid − 1. I loop while lo ≤ hi; if the range becomes empty I return −1. Each step halves the range, so O(log n) time and O(1) space; for a million items that's at most 20 comparisons."
:::

::: links
LeetCode 704: Binary Search | https://leetcode.com/problems/binary-search/
NeetCode video: Binary Search | https://www.youtube.com/results?search_query=neetcode+binary+search
VisuAlgo: binary search tree / search | https://visualgo.net/en/bst
:::

=== Search in Rotated Sorted Array
@p 3
@tags binary-search, medium
@quick
- A rotated sorted array (`[4,5,6,7,0,1,2]`): around any `mid`, **one half is always sorted**.
- If `nums[lo] <= nums[mid]` the left half is sorted: target in `[nums[lo], nums[mid])` → go left, else right. Mirror for the right half.
- **O(log n) time, O(1) space**, distinct values.
- Alternative: find the rotation point (minimum) first, then a normal binary search.

::: text 🧾 Problem
A sorted array of **distinct** values was **rotated** at an unknown pivot (e.g. `[0,1,2,4,5,6,7]` → `[4,5,6,7,0,1,2]`). Given `target`, return its index or `-1`, in **O(log n)**.

**Example 1:** `nums = [4,5,6,7,0,1,2], target = 0 → 4`
**Example 2:** `nums = [4,5,6,7,0,1,2], target = 3 → -1`

**Constraints:** 1 ≤ n ≤ 5000, distinct values.
:::

::: text 🧒 Intuition
A **clock face** read starting at 4 o'clock: 4, 5, 6, 7, then it wraps to 0, 1, 2. Cut it anywhere in the middle and at least one of the two pieces is a normal, increasing run. For that normal piece you can instantly say *"is my number in this range or not?"*, and that's enough to throw away half the array.
:::

::: text 🐢 Brute force
**Idea:** linear scan → O(n). Or `indexOf`. It works, but the problem demands O(log n): for n = 10⁶ that's 10⁶ steps versus ~20.
:::

::: text 💡 Key insight
Normal binary search needs to know which side the target is on. In a rotated array, comparing `nums[lo]` with `nums[mid]` tells you **which half is sorted**. In a sorted half you can check range membership with two comparisons; if the target isn't in the sorted half, it must be in the other one. Either way, half is discarded.

**Pattern name: Modified binary search (identify the sorted half).**
:::

::: diagram Which half is sorted?
flowchart TD
  S["lo, hi"] --> M["mid"]
  M --> F{"nums[mid] === target?"}
  F -->|"yes"| R["return mid"]
  F -->|"no"| H{"nums[lo] <= nums[mid]?"}
  H -->|"yes: left sorted"| A{"nums[lo] <= target < nums[mid]?"}
  A -->|"yes"| A1["hi = mid - 1"]
  A -->|"no"| A2["lo = mid + 1"]
  H -->|"no: right sorted"| B{"nums[mid] < target <= nums[hi]?"}
  B -->|"yes"| B1["lo = mid + 1"]
  B -->|"no"| B2["hi = mid - 1"]
:::

::: image Search in Rotated Sorted Array: the sorted left half does not contain 0, so search right
/images/dsa-binary-search-trees/rotated-search.svg
:::

::: text 🔍 Dry run: [4,5,6,7,0,1,2], target = 0
| Step | lo | hi | mid (val) | sorted half | target inside it? | move |
|---|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 (7) | left [4..7] | no | lo = 4 |
| 2 | 4 | 6 | 5 (1) | left [0..1] (nums[4]=0 ≤ 1) | yes (0 ≤ 0 < 1) | hi = 4 |
| 3 | 4 | 4 | 4 (0) | – | **found** | return 4 |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Search in a rotated sorted array of distinct values. Time O(log n), Space O(1).
 */
function searchRotated(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {
      // LEFT half [lo..mid] is sorted
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1; // target lies in the sorted left half
      else lo = mid + 1;                                          // otherwise it can only be on the right
    } else {
      // RIGHT half [mid..hi] is sorted
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1; // target lies in the sorted right half
      else hi = mid - 1;
    }
  }
  return -1;
}

// ---------- tests ----------
const cases = [
  [[4, 5, 6, 7, 0, 1, 2], 0, 4],
  [[4, 5, 6, 7, 0, 1, 2], 3, -1],
  [[1], 0, -1],
  [[1], 1, 0],
  [[3, 1], 1, 1],
  [[5, 1, 3], 5, 0],
  [[1, 2, 3, 4, 5], 4, 3],        // not rotated at all
];
for (const [nums, target, expected] of cases) {
  const got = searchRotated(nums, target);
  console.log(JSON.stringify(nums), 'target', target, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
// every rotation of 0..19, every target → compare with indexOf
let allOk = true;
const base = Array.from({ length: 20 }, (_, i) => i * 2);
for (let r = 0; r < base.length; r++) {
  const rot = [...base.slice(r), ...base.slice(0, r)];
  for (let t = -1; t <= 40; t++) if (searchRotated(rot, t) !== rot.indexOf(t)) allOk = false;
}
console.log('all rotations × all targets match indexOf', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons: linear scan vs modified binary search
n,Linear scan n,Binary search ~log2 n
10,10,4
100,100,7
1000,1000,10
10000,10000,14
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Linear scan / indexOf | O(n) | O(1) | Trivial | Not O(log n) | Never as the answer |
| Find the pivot, then normal binary search | O(log n) | O(1) | Two simple steps | Two loops | If you find it easier to reason about |
| **One-pass: identify the sorted half** | **O(log n)** | **O(1)** | Single loop | More conditions | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using `<` instead of `<=` in `nums[lo] <= nums[mid]`: breaks when `lo === mid` (two elements left).
- Getting the range boundaries wrong (`target < nums[mid]` must be strict, the `nums[lo] <=` side inclusive).
- Duplicates: with values like `[1,0,1,1,1]` you can't tell which half is sorted → worst case O(n) ([Search in Rotated Sorted Array II](https://leetcode.com/problems/search-in-rotated-sorted-array-ii/)).
- Forgetting the not-rotated case.
:::

::: understand
- Binary search doesn't need a fully sorted array, only a rule that tells you **which half to keep**. Related: [Find Minimum in Rotated Sorted Array](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/), [Find Peak Element](https://leetcode.com/problems/find-peak-element/), [Search a 2D Matrix](https://leetcode.com/problems/search-a-2d-matrix/).
:::

::: ask
- *"Are all values distinct?"* (Duplicates change the worst case.)
- *"Could the array be not rotated at all?"*
- *"Return the index or -1?"*
:::

::: important ⭐ How to explain it in the interview
> "At any mid, at least one half of a rotated sorted array is sorted; I can tell which by comparing nums[lo] with nums[mid]. If the left half is sorted and the target lies between nums[lo] and nums[mid], I search left, otherwise right; symmetrically when the right half is sorted. Each step still discards half, so it's O(log n) time and O(1) space. With duplicates this can degrade to O(n)."
:::

::: links
LeetCode 33: Search in Rotated Sorted Array | https://leetcode.com/problems/search-in-rotated-sorted-array/
NeetCode video: Search in Rotated Sorted Array | https://www.youtube.com/results?search_query=neetcode+search+in+rotated+sorted+array
:::

=== Find Minimum in Rotated Sorted Array
@p 2
@tags binary-search, medium
@quick
- Compare `nums[mid]` with **`nums[hi]`**: if `nums[mid] > nums[hi]` the minimum is **right** of mid (`lo = mid + 1`), else it's at mid or left (`hi = mid`).
- Loop `while (lo < hi)`; answer `nums[lo]`.
- **O(log n) time, O(1) space**, distinct values.
- The minimum's index = how many times the array was rotated.

::: text 🧾 Problem
A sorted array of distinct values was rotated between 1 and n times. Return the **minimum** element in **O(log n)**.

**Example 1:** `[3, 4, 5, 1, 2] → 1`
**Example 2:** `[4, 5, 6, 7, 0, 1, 2] → 0`; `[11, 13, 15, 17] → 11` (rotated n times = not rotated).

**Constraints:** 1 ≤ n ≤ 5000, distinct values.
:::

::: text 🧒 Intuition
Imagine a **staircase that goes up, then suddenly drops** to the bottom and climbs again. The minimum is the bottom right after the drop. Standing at any step, look at the **last step** (hi): if you're higher than the last step, the drop is still ahead of you (go right). If you're lower, you're already past the drop, and the bottom is here or behind you (go left, keep mid).
:::

::: text 🐢 Brute force
**Idea:** `Math.min(...nums)` or a linear scan → O(n). Alternatively, scan for the first `i` where `nums[i] < nums[i − 1]` → also O(n). Both ignore the sorted structure; the problem asks for O(log n).
:::

::: text 💡 Key insight
`nums[hi]` acts as a reference: every element of the **right (lower) part** is ≤ `nums[hi]`, every element of the **left (upper) part** is > `nums[hi]`. So `nums[mid] > nums[hi]` means mid is in the upper part → the minimum is strictly to the right. Otherwise mid is in the lower part → the minimum is mid or to its left. This is a monotonic yes/no question, so binary search applies.

**Pattern name: Binary search on a condition (compare with the right end).**
:::

::: diagram Compare mid with hi
flowchart TD
  S["lo = 0, hi = n - 1"] --> L{"lo < hi?"}
  L -->|"no"| R["return nums[lo]"]
  L -->|"yes"| M["mid = lo + ((hi - lo) >> 1)"]
  M --> C{"nums[mid] > nums[hi]?"}
  C -->|"yes: min is right of mid"| A["lo = mid + 1"]
  C -->|"no: min is mid or left"| B["hi = mid"]
  A --> L
  B --> L
:::

::: image Find Minimum in Rotated Sorted Array: comparing mid with hi narrows to 1
/images/dsa-binary-search-trees/rotated-min.svg
:::

::: text 🔍 Dry run: [3, 4, 5, 1, 2]
| Step | lo | hi | mid (val) | nums[hi] | compare | move |
|---|---|---|---|---|---|---|
| 1 | 0 | 4 | 2 (5) | 2 | 5 > 2 | lo = 3 |
| 2 | 3 | 4 | 3 (1) | 2 | 1 ≤ 2 | hi = 3 |
| 3 | 3 | 3 | | | `lo === hi` | **return nums[3] = 1** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Minimum of a rotated sorted array (distinct values). Time O(log n), Space O(1).
 */
function findMin(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {                       // stop when one candidate remains
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] > nums[hi]) lo = mid + 1; // mid is in the upper part → min is to the right
    else hi = mid;                          // mid is in the lower part → min is mid or to the left
  }
  return nums[lo];
}

// ---------- tests ----------
const cases = [
  [[3, 4, 5, 1, 2], 1],
  [[4, 5, 6, 7, 0, 1, 2], 0],
  [[11, 13, 15, 17], 11],   // not rotated
  [[2, 1], 1],
  [[1], 1],
];
for (const [nums, expected] of cases) {
  const got = findMin(nums);
  console.log(JSON.stringify(nums), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
const base = Array.from({ length: 30 }, (_, i) => i * 3 - 20);
for (let r = 0; r < base.length; r++) {
  const rot = [...base.slice(r), ...base.slice(0, r)];
  if (findMin(rot) !== Math.min(...rot)) allOk = false;
}
console.log('every rotation of a 30-element array → correct minimum', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons: linear scan vs binary search
n,Linear scan n,Binary search ~log2 n
10,10,4
100,100,7
1000,1000,10
10000,10000,14
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| `Math.min(...nums)` / scan | O(n) | O(1) | Trivial | Ignores the structure; spread fails on huge arrays | Never as the answer |
| Compare mid with `nums[lo]` | O(log n) | O(1) | Possible | Extra case for the not-rotated array | Avoid |
| **Compare mid with `nums[hi]`** | **O(log n)** | **O(1)** | No special cases | – | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using `hi = mid - 1` when `nums[mid] <= nums[hi]`: you might skip the minimum (mid itself can be it).
- Using `while (lo <= hi)` with `hi = mid` → infinite loop.
- Comparing with `nums[lo]` and forgetting the not-rotated case.
- Duplicates (`[2,2,2,0,2]`): then `hi--` when equal ([Find Minimum II](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array-ii/)), worst case O(n).
:::

::: understand
- This is the "binary search on a condition" template: `while (lo < hi)`, keep the half where the answer can be, end when `lo === hi`. Same template as [Find Peak Element](https://leetcode.com/problems/find-peak-element/) and lower bound ([Search Insert Position](https://leetcode.com/problems/search-insert-position/)).
:::

::: ask
- *"Are values distinct?"*
- *"Return the value or its index (the rotation count)?"*
:::

::: important ⭐ How to explain it in the interview
> "I compare the middle with the last element of the range. If nums[mid] is greater than nums[hi], mid is in the upper part before the drop, so the minimum is strictly to the right: lo = mid + 1. Otherwise mid is in the lower part, so the minimum is mid or to its left: hi = mid. When lo equals hi, that's the minimum. O(log n) time, O(1) space, and it also works when the array isn't rotated."
:::

::: links
LeetCode 153: Find Minimum in Rotated Sorted Array | https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/
NeetCode video: Find Minimum in Rotated Sorted Array | https://www.youtube.com/results?search_query=neetcode+find+minimum+in+rotated+sorted+array
:::

=== Search Insert Position / First and Last Position
@p 2
@tags binary-search, lower-bound
@quick
- **Lower bound**: first index `i` with `nums[i] >= target` (= insert position). Template: `lo = 0, hi = n`, `while (lo < hi)`, `nums[mid] < target ? lo = mid + 1 : hi = mid`.
- First position = `lowerBound(t)`; last position = `lowerBound(t + 1) − 1` (integers) or an upper-bound search.
- Check `first < n && nums[first] === target`, otherwise `[-1, -1]`.
- **O(log n)** each.

::: text 🧾 Problem
**Search Insert Position:** sorted distinct array; return the index of `target`, or the index where it **would be inserted** to keep the order.
`[1,3,5,6], 5 → 2`; `[1,3,5,6], 2 → 1`; `[1,3,5,6], 7 → 4`

**First and Last Position:** sorted array **with duplicates**; return `[first, last]` index of `target`, or `[-1, -1]`.
`[5,7,7,8,8,10], 8 → [3, 4]`; `[5,7,7,8,8,10], 6 → [-1, -1]`

**Constraints:** up to 10⁵ elements, O(log n) required.
:::

::: text 🧒 Intuition
You're **inserting a new book into a sorted shelf**. You want the first spot where the existing book is **not smaller** than yours: that's where yours goes. If a copy of your book is already there, that same spot is where the copies **start**. To find where the copies **end**, look for the spot where a book "one bigger" would go, and step back one.
:::

::: text 🐢 Brute force
**Idea:** scan left to right for the first `nums[i] >= target` (insert position), or scan for the first and last occurrence.

**Complexity:** O(n). With a big run of duplicates (e.g. 10⁵ copies of 8), even "find one 8 with binary search and expand left and right" is O(n). The requirement is O(log n) in every case.
:::

::: text 💡 Key insight
The question "is `nums[i] >= target`?" is **false … false, true … true** along a sorted array. Binary search can find the **first true** in O(log n). That single helper (lower bound) answers both problems: insert position directly, first occurrence directly, last occurrence as `lowerBound(target + 1) − 1`.

**Pattern name: Binary search for a boundary (lower bound / upper bound).**
:::

::: diagram Lower bound: find the first "true"
flowchart TD
  S["lo = 0, hi = n (hi is exclusive)"] --> L{"lo < hi?"}
  L -->|"no"| R["return lo (first index with nums[i] >= target)"]
  L -->|"yes"| M["mid = lo + ((hi - lo) >> 1)"]
  M --> C{"nums[mid] < target?"}
  C -->|"yes"| A["lo = mid + 1"]
  C -->|"no"| B["hi = mid"]
  A --> L
  B --> L
:::

::: image Lower bound: insert position of 2 is 1, and target 8 spans indices 3 to 4
/images/dsa-binary-search-trees/lower-bound.svg
:::

::: text 🔍 Dry run: lowerBound([5,7,7,8,8,10], 8) and lowerBound(…, 9)
**target 8 (first position)**
| lo | hi | mid (val) | val < 8? | move |
|---|---|---|---|---|
| 0 | 6 | 3 (8) | no | hi = 3 |
| 0 | 3 | 1 (7) | yes | lo = 2 |
| 2 | 3 | 2 (7) | yes | lo = 3 |
| 3 | 3 | | stop | **first = 3** |

**target 9 (one past the last 8)**
| lo | hi | mid (val) | val < 9? | move |
|---|---|---|---|---|
| 0 | 6 | 3 (8) | yes | lo = 4 |
| 4 | 6 | 5 (10) | no | hi = 5 |
| 4 | 5 | 4 (8) | yes | lo = 5 |
| 5 | 5 | | stop | 5 → **last = 5 − 1 = 4** |

Answer `[3, 4]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Lower bound: first index i with nums[i] >= target (nums.length if none).
 * Time O(log n), Space O(1).
 */
function lowerBound(nums, target) {
  let lo = 0, hi = nums.length;          // hi is EXCLUSIVE: the answer can be nums.length
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] < target) lo = mid + 1; // mid is too small → answer is to the right
    else hi = mid;                        // mid could be the answer → keep it
  }
  return lo;
}

/** LeetCode 35: Search Insert Position. */
const searchInsert = (nums, target) => lowerBound(nums, target);

/** LeetCode 34: First and Last Position (integers). */
function searchRange(nums, target) {
  const first = lowerBound(nums, target);
  if (first === nums.length || nums[first] !== target) return [-1, -1]; // target not present
  const last = lowerBound(nums, target + 1) - 1;                         // one before the first bigger value
  return [first, last];
}

// ---------- tests ----------
const insertCases = [[[1, 3, 5, 6], 5, 2], [[1, 3, 5, 6], 2, 1], [[1, 3, 5, 6], 7, 4], [[1, 3, 5, 6], 0, 0], [[], 3, 0]];
for (const [nums, t, expected] of insertCases) {
  const got = searchInsert(nums, t);
  console.log('insert', JSON.stringify(nums), t, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const rangeCases = [
  [[5, 7, 7, 8, 8, 10], 8, [3, 4]],
  [[5, 7, 7, 8, 8, 10], 6, [-1, -1]],
  [[], 0, [-1, -1]],
  [[2, 2, 2, 2], 2, [0, 3]],       // all equal
  [[1], 1, [0, 0]],
];
for (const [nums, t, expected] of rangeCases) {
  const got = searchRange(nums, t);
  console.log('range', JSON.stringify(nums), t, '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
// 100,000 copies of the target: still ~17 steps per search
const big = Array(100000).fill(8);
console.log('100,000 eights →', JSON.stringify(searchRange(big, 8)), JSON.stringify(searchRange(big, 8)) === '[0,99999]' ? '✅' : '❌ FAIL');
:::

::: chart line Steps when the target repeats n times: find one + expand vs two lower bounds
n copies,Find one then expand ~n,Two lower bounds ~2·log2 n
10,10,8
100,100,14
1000,1000,20
10000,10000,28
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Linear scan | O(n) | O(1) | Simple | Not O(log n) | Never |
| Binary search one hit, expand left/right | O(log n + k) | O(1) | Intuitive | O(n) when k copies is large | Few duplicates |
| **Two boundary searches (lower bound)** | **O(log n)** | **O(1)** | Always log n, one helper | Must master the half-open template | Default answer |
| `findIndex` / `lastIndexOf` | O(n) | O(1) | One line | Linear | Scripts |
:::

::: warning ⚠️ Common mistakes / edge cases
- Starting with `hi = n − 1` in the lower-bound template: you can't return `n` for "insert at the end".
- Mixing templates (`lo <= hi` with `hi = mid`) → infinite loops.
- Forgetting to check `nums[first] === target` before returning a range.
- `target + 1` only works for **integers**; for other types write an explicit upper bound (`nums[mid] <= target`).
:::

::: understand
- Lower/upper bound are the most reusable binary-search building blocks (JavaScript has no built-in; C++ has `lower_bound`, Python has `bisect_left`). They power [Count of Smaller Numbers After Self](https://leetcode.com/problems/count-of-smaller-numbers-after-self/), [Longest Increasing Subsequence](https://leetcode.com/problems/longest-increasing-subsequence/) (O(n log n) version) and [Time Based Key-Value Store](https://leetcode.com/problems/time-based-key-value-store/).
:::

::: ask
- *"Can there be duplicates?"*
- *"If the target is missing, return -1 or the insert position?"*
- *"Are values integers?"* (Matters for the `target + 1` trick.)
:::

::: important ⭐ How to explain it in the interview
> "I write one helper, lower bound, which returns the first index whose value is at least the target, using a half-open range [lo, hi) and moving lo = mid + 1 when nums[mid] < target, otherwise hi = mid. Search Insert Position is exactly lower bound. For first and last position, first is lower bound of the target, and if nums[first] isn't the target I return [-1, -1]; last is lower bound of target + 1, minus one. Each search is O(log n), even with many duplicates."
:::

::: links
LeetCode 35: Search Insert Position | https://leetcode.com/problems/search-insert-position/
LeetCode 34: Find First and Last Position | https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/
NeetCode video: Search Insert Position | https://www.youtube.com/results?search_query=neetcode+search+insert+position
:::

=== Find Peak Element
@p 1
@tags binary-search, medium
@quick
- A **peak** is bigger than its neighbours; edges count as `-∞`, so a peak always exists.
- If `nums[mid] < nums[mid + 1]`, we're on a **rising slope** → a peak exists on the right (`lo = mid + 1`), else on the left including mid (`hi = mid`).
- **O(log n)** even though the array isn't sorted.
- Return **any** peak.

::: text 🧾 Problem
A peak element is strictly greater than its neighbours. Imagine `nums[-1] = nums[n] = −∞`. Return the index of **any** peak, in **O(log n)**. Neighbouring values are never equal.

**Example 1:** `[1, 2, 3, 1] → 2` (the 3).
**Example 2:** `[1, 2, 1, 3, 5, 6, 4] → 5` (the 6), or `1` (the 2) is also accepted.

**Constraints:** 1 ≤ n ≤ 1000, `nums[i] !== nums[i + 1]`.
:::

::: text 🧒 Intuition
You're **hiking in thick fog** and want to reach any hilltop. You can only see the ground right next to you. Rule: always walk **uphill**. If the ground to your right goes up, a top must exist somewhere to the right (the path can't go up forever, the edge is a cliff down to −∞). Binary search does this hiking with giant jumps.
:::

::: text 🐢 Brute force
**Idea:** scan and return the first `i` where `nums[i] > nums[i + 1]` (or the maximum element).

**Complexity:** O(n). Correct and simple, but the problem asks for O(log n).
:::

::: text 💡 Key insight
Look at `mid` and `mid + 1`. If `nums[mid] < nums[mid + 1]`, the slope goes **up** to the right, and because the right edge is −∞ the values must come down again somewhere → a peak lies in `[mid + 1, hi]`. Otherwise the slope goes down → a peak lies in `[lo, mid]` (mid itself may be it). Each step halves the range even though the array is not sorted: binary search only needs a rule for **which half still contains an answer**.

**Pattern name: Binary search on a slope (condition-based).**
:::

::: diagram Walk uphill
flowchart TD
  S["lo = 0, hi = n - 1"] --> L{"lo < hi?"}
  L -->|"no"| R["return lo (a peak)"]
  L -->|"yes"| M["mid"]
  M --> C{"nums[mid] < nums[mid + 1]?"}
  C -->|"yes: rising"| A["lo = mid + 1"]
  C -->|"no: falling"| B["hi = mid"]
  A --> L
  B --> L
:::

::: image Find Peak Element: at index 3 the slope rises, so the peak 6 is on the right
/images/dsa-binary-search-trees/peak-element.svg
:::

::: text 🔍 Dry run: [1, 2, 1, 3, 5, 6, 4]
| Step | lo | hi | mid (val) | nums[mid + 1] | slope | move |
|---|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 (3) | 5 | rising | lo = 4 |
| 2 | 4 | 6 | 5 (6) | 4 | falling | hi = 5 |
| 3 | 4 | 5 | 4 (5) | 6 | rising | lo = 5 |
| 4 | 5 | 5 | | | stop | **return 5** (value 6) |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Find Peak Element (any peak). Time O(log n), Space O(1).
 */
function findPeakElement(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);     // mid < hi, so mid + 1 is always valid
    if (nums[mid] < nums[mid + 1]) lo = mid + 1; // uphill to the right → a peak is on the right
    else hi = mid;                         // downhill → mid or something on the left is a peak
  }
  return lo;
}

/** A peak check for testing: bigger than both neighbours (edges are -Infinity). */
const isPeak = (nums, i) => (i === 0 || nums[i] > nums[i - 1]) && (i === nums.length - 1 || nums[i] > nums[i + 1]);

// ---------- tests ----------
const cases = [[1, 2, 3, 1], [1, 2, 1, 3, 5, 6, 4], [1], [2, 1], [1, 2], [5, 4, 3, 2, 1], [1, 2, 3, 4, 5]];
for (const nums of cases) {
  const i = findPeakElement(nums);
  console.log(JSON.stringify(nums), '→ index', i, '(value ' + nums[i] + ')', isPeak(nums, i) ? '✅' : '❌ FAIL not a peak');
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const arr = [];
  const n = 1 + Math.floor(Math.random() * 20);
  while (arr.length < n) { const v = Math.floor(Math.random() * 50); if (!arr.length || v !== arr[arr.length - 1]) arr.push(v); }
  if (!isPeak(arr, findPeakElement(arr))) allOk = false;
}
console.log('300 random arrays → always a valid peak', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons: scan vs binary search on the slope
n,Linear scan n,Binary search log2 n
10,10,4
100,100,7
1000,1000,10
10000,10000,14
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Linear scan for the first drop | O(n) | O(1) | Very simple | Not O(log n) | First answer |
| Index of the maximum | O(n) | O(1) | Always the global peak | Linear | When the highest peak is required |
| **Binary search on the slope** | **O(log n)** | **O(1)** | Meets the requirement | Returns *a* peak, not the highest | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Thinking binary search needs a sorted array: here it only needs a rule that keeps an answer in one half.
- Using `while (lo <= hi)` and reading `nums[mid + 1]` out of bounds.
- Expecting the **global** maximum: the problem accepts any peak.
- Equal neighbours break the guarantee (the problem forbids them).
:::

::: understand
- "Binary search on a condition" generalises far beyond sorted arrays. Related: [Find Minimum in Rotated Sorted Array](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/), [Peak Index in a Mountain Array](https://leetcode.com/problems/peak-index-in-a-mountain-array/), [Find a Peak Element II](https://leetcode.com/problems/find-a-peak-element-ii/) (2-D).
:::

::: ask
- *"Any peak, or the highest one?"*
- *"Can neighbours be equal?"*
- *"How are the edges treated?"* (−∞ outside the array.)
:::

::: important ⭐ How to explain it in the interview
> "Since the outside of the array counts as minus infinity, following an upward slope always leads to a peak. At mid I compare with mid + 1: if it's rising, a peak exists to the right so lo = mid + 1; otherwise one exists at mid or to the left so hi = mid. When lo meets hi, that index is a peak. O(log n) time and O(1) space, even though the array isn't sorted."
:::

::: links
LeetCode 162: Find Peak Element | https://leetcode.com/problems/find-peak-element/
NeetCode video: Find Peak Element | https://www.youtube.com/results?search_query=neetcode+find+peak+element
:::

=== Koko Eating Bananas (binary search on the answer)
@p 2
@tags binary-search, answer-space, medium
@quick
- **Binary search on the answer**: the speed k ranges from 1 to `max(piles)`; "can finish in h hours?" is **monotonic** (false … false, true … true).
- Hours at speed k = `Σ Math.ceil(pile / k)`.
- Find the **smallest k** that works → O(n log max).
- Template: `lo = 1, hi = max`; `canFinish(mid) ? hi = mid : lo = mid + 1`.

::: text 🧾 Problem
Koko has `piles` of bananas and `h` hours. Each hour she picks one pile and eats up to `k` bananas from it (if the pile has fewer, she finishes it and waits for the next hour). Return the **minimum integer speed k** that lets her finish all piles within `h` hours.

**Example 1:** `piles = [3, 6, 7, 11], h = 8 → 4`
**Example 2:** `piles = [30, 11, 23, 4, 20], h = 5 → 30`

**Constraints:** n ≤ h ≤ 10⁹, 1 ≤ pile ≤ 10⁹, 1 ≤ n ≤ 10⁴.
:::

::: text 🧒 Intuition
Choosing a **delivery truck speed**: too slow and you miss the deadline, fast enough and you make it, and anything faster than a working speed also works. Instead of trying every speed from 1 upward, try a middle speed: if it's fast enough, the answer is this speed or slower; if not, it must be faster. That's binary search, but over **possible answers** instead of array positions.
:::

::: text 🐢 Brute force
**Idea:** try k = 1, 2, 3, … and return the first k with `hours(k) <= h`.

`for k = 1..max(piles): if hours(k) <= h: return k` where hours(k) loops over all piles (O(n)).

**Complexity:** O(n · max). With max = 10⁹ and n = 10⁴ that's 10¹³ operations: impossible.
:::

::: text 💡 Key insight
If Koko can finish at speed k, she can finish at any speed bigger than k. So `canFinish(k)` looks like `false, false, …, false, true, true, …, true` over k = 1..max. We want the **first true**, which binary search finds in log₂(max) ≈ 30 checks, each O(n).

**Pattern name: Binary search on the answer space.**
:::

::: diagram Binary search over speeds
flowchart TD
  S["lo = 1, hi = max(piles)"] --> L{"lo < hi?"}
  L -->|"no"| R["return lo (minimum speed)"]
  L -->|"yes"| M["mid = speed to try"]
  M --> C{"hours(mid) <= h?"}
  C -->|"yes: fast enough"| A["hi = mid (try slower)"]
  C -->|"no: too slow"| B["lo = mid + 1"]
  A --> L
  B --> L
:::

::: image Koko Eating Bananas: hours needed per speed; 4 is the smallest speed within 8 hours
/images/dsa-binary-search-trees/koko.svg
:::

::: text 🔍 Dry run: piles = [3, 6, 7, 11], h = 8
| Step | lo | hi | mid (k) | hours = ceil(3/k)+ceil(6/k)+ceil(7/k)+ceil(11/k) | ≤ 8? | move |
|---|---|---|---|---|---|---|
| 1 | 1 | 11 | 6 | 1 + 1 + 2 + 2 = 6 | yes | hi = 6 |
| 2 | 1 | 6 | 3 | 1 + 2 + 3 + 4 = 10 | no | lo = 4 |
| 3 | 4 | 6 | 5 | 1 + 2 + 2 + 3 = 8 | yes | hi = 5 |
| 4 | 4 | 5 | 4 | 1 + 2 + 2 + 3 = 8 | yes | hi = 4 |
| 5 | 4 | 4 | | | stop | **return 4** |
:::

::: code javascript Optimal solution with tests (runnable)
/** Hours needed to eat all piles at speed k. */
function hoursAt(piles, k) {
  let hours = 0;
  for (const p of piles) hours += Math.ceil(p / k); // a partly eaten pile still costs a full hour
  return hours;
}

/**
 * Minimum eating speed. Time O(n log max), Space O(1).
 */
function minEatingSpeed(piles, h) {
  let lo = 1, hi = Math.max(...piles);      // speed max(piles) always works (one hour per pile)
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (hoursAt(piles, mid) <= h) hi = mid; // fast enough → the answer is mid or slower
    else lo = mid + 1;                      // too slow → must be faster
  }
  return lo;
}

/** Brute force for cross-checking (small inputs only). */
function minEatingSpeedBrute(piles, h) {
  for (let k = 1; ; k++) if (hoursAt(piles, k) <= h) return k;
}

// ---------- tests ----------
const cases = [
  [[3, 6, 7, 11], 8, 4],
  [[30, 11, 23, 4, 20], 5, 30],   // h = number of piles → speed = biggest pile
  [[30, 11, 23, 4, 20], 6, 23],
  [[1], 1, 1],
  [[1000000000], 2, 500000000],    // huge pile: brute force would be hopeless
];
for (const [piles, h, expected] of cases) {
  const got = minEatingSpeed(piles, h);
  const ok = got === expected && (expected > 1000 || minEatingSpeedBrute(piles, h) === expected);
  console.log(JSON.stringify(piles), 'h =', h, '→', got, ok ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Speed checks (each costs O(n)): try every speed vs binary search
max pile,Try every speed max,Binary search log2 max
100,100,7
10000,10000,14
1000000,1000000,20
1000000000,1000000000,30
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Try every speed from 1 | O(n · max) | O(1) | Obvious | Impossible for max = 10⁹ | Tiny inputs |
| Start at the lower bound `ceil(total / h)` and count up | O(n · range) | O(1) | Better start | Still linear in the range | Never final |
| **Binary search on k** | **O(n log max)** | **O(1)** | ~30 checks even for 10⁹ | Needs the monotonic insight | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using `Math.floor` instead of `Math.ceil` for hours (a pile of 7 at speed 4 takes **2** hours).
- Starting `lo` at 0 → division by zero.
- Using `hi = sum(piles)`: works but slower; `max(piles)` is already enough.
- Returning `hi` with the wrong loop template (stick to `lo < hi`, return `lo`).
:::

::: understand
- **Binary search on the answer** works when you can check "is X good enough?" and goodness is monotonic. Same pattern: [Capacity To Ship Packages Within D Days](https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/), [Split Array Largest Sum](https://leetcode.com/problems/split-array-largest-sum/), [Minimum Number of Days to Make m Bouquets](https://leetcode.com/problems/minimum-number-of-days-to-make-m-bouquets/).
:::

::: ask
- *"Is h always at least the number of piles?"* (Otherwise no speed works.)
- *"Integer speeds only?"*
- *"How big can the piles be?"* (Tells you brute force is impossible.)
:::

::: important ⭐ How to explain it in the interview
> "The answer is a speed between 1 and the largest pile, and feasibility is monotonic: if a speed works, every faster speed works. So I binary-search the speed. For a candidate k, I compute the hours as the sum of ceil(pile / k); if it fits in h I try slower with hi = mid, otherwise lo = mid + 1. That's O(n log max): about 30 checks of O(n) each, even for piles of a billion."
:::

::: links
LeetCode 875: Koko Eating Bananas | https://leetcode.com/problems/koko-eating-bananas/
NeetCode video: Koko Eating Bananas | https://www.youtube.com/results?search_query=neetcode+koko+eating+bananas
:::

=== Tree traversals: DFS (pre/in/post-order) and BFS (level order)
@p 3
@tags trees, dfs, bfs, traversal
@quick
- **DFS** goes deep first: **pre**order (root, L, R), **in**order (L, root, R), **post**order (L, R, root). Recursion or an explicit stack.
- **BFS / level order** visits level by level with a **queue**; record `size = queue.length` to group levels.
- Inorder of a **BST** is sorted. Postorder = compute children first (heights, deletes). Preorder = copy/serialise.
- All traversals: **O(n) time**; space O(h) for DFS (h = height), O(w) for BFS (w = widest level).

::: text 🧾 Problem
Given the root of a binary tree, return its node values in **preorder**, **inorder**, **postorder** and **level order** (a list of levels).

**Example:** tree `[1, 2, 3, 4, 5]` (1 is the root, 2 and 3 its children, 4 and 5 the children of 2):
- preorder `[1, 2, 4, 5, 3]`, inorder `[4, 2, 5, 1, 3]`, postorder `[4, 5, 2, 3, 1]`
- level order `[[1], [2, 3], [4, 5]]`

**Constraints:** 0 ≤ nodes ≤ 2000.

*A binary tree: each node has a value and up to two children, `left` and `right`. The top node is the root; nodes without children are leaves.*
:::

::: text 🧒 Intuition
Think of a **company org chart**.
- **Preorder** is a manager introducing themselves *before* their team: "I'm the CEO, here's my first department…".
- **Postorder** is a report that needs every team's numbers *before* the manager can write the summary.
- **Inorder** reads the chart left to right like a sorted list (for a search tree).
- **Level order (BFS)** is a photo taken floor by floor: CEO first, then all directors, then all team leads.

DFS uses a **stack** (recursion is a hidden stack); BFS uses a **queue** (first in, first out).
:::

::: text 🐢 Brute force
There's no "slow" way to visit n nodes: every correct traversal is O(n). The beginner pitfalls are different:
- Using `queue.shift()` on big trees: each shift is O(n), so BFS becomes **O(n²)** (e.g. 10⁵ nodes → ~5 × 10⁹ moves). Use a head index instead.
- Recursion on a **very deep** tree (a "linked list" of 10⁵ nodes) can overflow the call stack; an explicit stack avoids it.
:::

::: text 💡 Key insight
All DFS orders are the same recursive walk; only the **moment you record the node** changes (before, between or after visiting the children). BFS needs a queue so that nodes are processed in the order they were discovered, which is level by level.

**Pattern name: Tree DFS (recursion / stack) and BFS (queue).**
:::

::: diagram Where the "visit" happens
flowchart LR
  A["dfs(node)"] --> P["preorder: record node"]
  P --> L["dfs(node.left)"]
  L --> I["inorder: record node"]
  I --> R["dfs(node.right)"]
  R --> O["postorder: record node"]
:::

::: image Tree traversals: preorder 1 2 4 5 3, inorder 4 2 5 1 3, postorder 4 5 2 3 1, level order 1 | 2 3 | 4 5
/images/dsa-binary-search-trees/traversals.svg
:::

::: text 🔍 Dry run: level order on [1, 2, 3, 4, 5] with a queue
| Level | queue at the start of the level | size | visited this level | children added |
|---|---|---|---|---|
| 0 | [1] | 1 | [1] | 2, 3 |
| 1 | [2, 3] | 2 | [2, 3] | 4, 5 (from 2) |
| 2 | [4, 5] | 2 | [4, 5] | none |
| – | [] | | stop | |

Preorder with recursion: visit 1 → go left to 2 → visit 2 → left 4 (visit) → right 5 (visit) → back to 1 → right 3 (visit) = `1 2 4 5 3`.
:::

::: code javascript All four traversals with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
/** Build a tree from LeetCode-style level order, e.g. [1, 2, 3, null, 4]. */
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]);
  const queue = [root];
  let head = 0, i = 1;
  while (head < queue.length && i < arr.length) {
    const node = queue[head++];
    if (i < arr.length && arr[i] !== null) queue.push((node.left = new TreeNode(arr[i])));
    i++;
    if (i < arr.length && arr[i] !== null) queue.push((node.right = new TreeNode(arr[i])));
    i++;
  }
  return root;
}

// ----- DFS, recursive: only the position of out.push changes -----
function preorder(root, out = []) { if (!root) return out; out.push(root.val); preorder(root.left, out); preorder(root.right, out); return out; }
function inorder(root, out = []) { if (!root) return out; inorder(root.left, out); out.push(root.val); inorder(root.right, out); return out; }
function postorder(root, out = []) { if (!root) return out; postorder(root.left, out); postorder(root.right, out); out.push(root.val); return out; }

// ----- DFS, iterative inorder with an explicit stack (no recursion depth limit) -----
function inorderIterative(root) {
  const out = [], stack = [];
  let node = root;
  while (node || stack.length) {
    while (node) { stack.push(node); node = node.left; } // go as far left as possible
    node = stack.pop();                                   // the leftmost unvisited node
    out.push(node.val);
    node = node.right;                                    // then its right subtree
  }
  return out;
}

// ----- BFS: level order with a queue (head index instead of shift → O(n)) -----
function levelOrder(root) {
  if (!root) return [];
  const levels = [], queue = [root];
  let head = 0;
  while (head < queue.length) {
    const size = queue.length - head;          // number of nodes on this level
    const level = [];
    for (let k = 0; k < size; k++) {
      const node = queue[head++];
      level.push(node.val);
      if (node.left) queue.push(node.left);    // children belong to the next level
      if (node.right) queue.push(node.right);
    }
    levels.push(level);
  }
  return levels;
}

// ---------- tests ----------
const t = buildTree([1, 2, 3, 4, 5]);
const checks = [
  ['preorder', preorder(t), [1, 2, 4, 5, 3]],
  ['inorder', inorder(t), [4, 2, 5, 1, 3]],
  ['inorder (iterative)', inorderIterative(t), [4, 2, 5, 1, 3]],
  ['postorder', postorder(t), [4, 5, 2, 3, 1]],
  ['level order', levelOrder(t), [[1], [2, 3], [4, 5]]],
  ['empty tree', levelOrder(null), []],
  ['BST inorder is sorted', inorder(buildTree([4, 2, 6, 1, 3, 5, 7])), [1, 2, 3, 4, 5, 6, 7]],
];
for (const [name, got, expected] of checks) console.log(name, '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
:::

::: chart line Queue element moves for BFS: array.shift() vs head index
n (nodes),shift() each time ~n²/2,head index n
10,50,10
100,5000,100
1000,500000,1000
10000,50000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Recursive DFS | O(n) | O(h) call stack | Shortest code | Stack overflow on very deep trees | Default for DFS |
| Iterative DFS (explicit stack) | O(n) | O(h) | No recursion limit | More code (esp. postorder) | Deep / skewed trees |
| **BFS with a queue** | **O(n)** | O(w) | Natural for levels, shortest paths | Wide trees use more memory | Level order, minimum depth |
| Morris traversal | O(n) | O(1) | No extra memory | Temporarily rewires the tree | Only if O(1) space is demanded |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting the base case `if (!root) return`.
- Mixing levels in BFS: read `size` **before** the inner loop.
- Using `queue.shift()` in a loop on big trees (hidden O(n) per call).
- Assuming inorder is sorted for **any** binary tree (only for a BST).
:::

::: understand
- Choose the order by **when you need the node's information**: preorder (top-down, pass info to children), postorder (bottom-up, combine children's results: [Maximum Depth](https://leetcode.com/problems/maximum-depth-of-binary-tree/), [Diameter](https://leetcode.com/problems/diameter-of-binary-tree/)), inorder (sorted order of a BST: [Validate BST](https://leetcode.com/problems/validate-binary-search-tree/), [Kth Smallest Element in a BST](https://leetcode.com/problems/kth-smallest-element-in-a-bst/)), BFS (levels: [Binary Tree Right Side View](https://leetcode.com/problems/binary-tree-right-side-view/)).
:::

::: ask
- *"Which order do you want? Should levels be grouped?"*
- *"Recursive OK, or must it be iterative?"*
- *"How deep can the tree be?"* (Decides recursion vs explicit stack.)
:::

::: important ⭐ How to explain it in the interview
> "DFS orders differ only in when I record the node: before the children for preorder, between them for inorder, after them for postorder. I write them recursively, or with an explicit stack if the tree can be very deep. For level order I use a queue: at the start of each level I note how many nodes are in the queue, process exactly that many, and push their children for the next level. Every traversal is O(n) time; DFS uses O(h) space and BFS O(w)."
:::

::: links
LeetCode 94: Inorder Traversal | https://leetcode.com/problems/binary-tree-inorder-traversal/
LeetCode 102: Level Order Traversal | https://leetcode.com/problems/binary-tree-level-order-traversal/
NeetCode video: Binary Tree Level Order Traversal | https://www.youtube.com/results?search_query=neetcode+binary+tree+level+order+traversal
VisuAlgo: binary search tree traversals | https://visualgo.net/en/bst
:::

=== Maximum Depth of Binary Tree
@p 3
@tags trees, dfs, recursion, easy
@quick
- `depth(node) = 1 + max(depth(left), depth(right))`, `depth(null) = 0`.
- Recursive DFS (postorder): **O(n) time, O(h) space**.
- BFS alternative: count the levels.
- Classic "trust the recursion" problem: solve for the children, combine at the parent.

::: text 🧾 Problem
Return the **maximum depth** of a binary tree: the number of nodes on the longest path from the root down to the farthest leaf.

**Example 1:** `[3, 9, 20, null, null, 15, 7] → 3`
**Example 2:** `[1, null, 2] → 2`; empty tree → `0`.

**Constraints:** 0 ≤ nodes ≤ 10⁴.
:::

::: text 🧒 Intuition
A **family tree**: how many generations deep is it? Ask each child: "how many generations are below you, including you?" Take the bigger answer and add 1 for yourself. Each child asks their own children the same question, until someone has no children (answer 1, or 0 for "nobody").
:::

::: text 🐢 Brute force
**Idea:** list every root-to-leaf path (copying the path array at each leaf) and take the longest.

**Complexity:** O(n · h) because each leaf copies a path of length up to h; in a skewed tree that's O(n²) (~5 × 10⁷ copies for 10⁴ nodes). The waste: we only need the **length**, not the paths.
:::

::: text 💡 Key insight
The depth of a tree is defined by the depths of its two subtrees, so recursion (postorder: children first, then the node) computes it with one visit per node. "Trust" that the recursive call returns the right depth for a subtree; you only write how to **combine** two answers.

**Pattern name: Tree DFS (bottom-up recursion).**
:::

::: diagram Bottom-up recursion
flowchart TD
  A["maxDepth(node)"] --> B{"node is null?"}
  B -->|"yes"| Z["return 0"]
  B -->|"no"| C["l = maxDepth(node.left)"]
  C --> D["r = maxDepth(node.right)"]
  D --> E["return 1 + max(l, r)"]
:::

::: image Maximum Depth: tree 3 9 20 15 7 has depth 3
/images/dsa-binary-search-trees/max-depth.svg
:::

::: text 🔍 Dry run: [3, 9, 20, null, null, 15, 7]
Order in which calls **return** (postorder):
| Call | left result | right result | returns |
|---|---|---|---|
| 9 | 0 | 0 | 1 |
| 15 | 0 | 0 | 1 |
| 7 | 0 | 0 | 1 |
| 20 | 1 | 1 | 2 |
| 3 (root) | 1 | 2 | **3** |
:::

::: code javascript Optimal solution with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let head = 0, i = 1;
  while (head < q.length && i < arr.length) {
    const node = q[head++];
    if (i < arr.length && arr[i] !== null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] !== null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}

/** Recursive DFS. Time O(n), Space O(h). */
function maxDepth(root) {
  if (!root) return 0;                           // an empty tree has depth 0
  const left = maxDepth(root.left);              // trust the recursion for each subtree
  const right = maxDepth(root.right);
  return 1 + Math.max(left, right);              // this node + the deeper subtree
}

/** BFS alternative: count the levels. Time O(n), Space O(w). */
function maxDepthBFS(root) {
  if (!root) return 0;
  let depth = 0, queue = [root];
  while (queue.length) {
    depth++;
    const next = [];
    for (const node of queue) { if (node.left) next.push(node.left); if (node.right) next.push(node.right); }
    queue = next;                                // move to the next level
  }
  return depth;
}

// ---------- tests ----------
const cases = [
  [[3, 9, 20, null, null, 15, 7], 3],
  [[1, null, 2], 2],
  [[], 0],
  [[1], 1],
  [[1, 2, null, 3, null, 4], 4],   // skewed (like a linked list)
];
for (const [arr, expected] of cases) {
  const root = buildTree(arr);
  const a = maxDepth(root), b = maxDepthBFS(root);
  console.log(JSON.stringify(arr), '→', a, a === expected && b === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Work for a skewed tree of n nodes: copy every path vs one DFS
n,Copy root-to-leaf paths ~n²/2,DFS n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Enumerate all paths | O(n · h) | O(n · h) | Gives the paths too | Wasteful | When the paths are needed |
| **Recursive DFS** | **O(n)** | O(h) | 3 lines | Deep trees can overflow the stack | Default answer |
| BFS level count | O(n) | O(w) | No recursion | More code | Very deep, narrow trees |
| Iterative DFS with (node, depth) pairs | O(n) | O(h) | No recursion | More code | If recursion is forbidden |
:::

::: warning ⚠️ Common mistakes / edge cases
- Returning 1 for an empty tree.
- Counting **edges** when nodes are asked (or the reverse): depth of a single node is 1 here.
- Using `min` instead of `max`, or confusing with [Minimum Depth](https://leetcode.com/problems/minimum-depth-of-binary-tree/) (where a missing child doesn't count as a leaf).
:::

::: understand
- "Compute from the children, combine at the parent" is the template for [Diameter of Binary Tree](https://leetcode.com/problems/diameter-of-binary-tree/), [Balanced Binary Tree](https://leetcode.com/problems/balanced-binary-tree/), [Binary Tree Maximum Path Sum](https://leetcode.com/problems/binary-tree-maximum-path-sum/).
:::

::: ask
- *"Depth in nodes or in edges?"*
- *"Can the tree be empty? How deep can it be?"*
:::

::: important ⭐ How to explain it in the interview
> "The depth of a tree is one plus the larger depth of its two subtrees, and an empty tree has depth zero. So I recurse into both children and return 1 + max of their results. Each node is visited once: O(n) time, and O(h) space for the recursion, where h is the height. For a very deep tree I'd count levels with BFS instead."
:::

::: links
LeetCode 104: Maximum Depth of Binary Tree | https://leetcode.com/problems/maximum-depth-of-binary-tree/
NeetCode video: Maximum Depth of Binary Tree | https://www.youtube.com/results?search_query=neetcode+maximum+depth+of+binary+tree
:::

=== Invert Binary Tree / Same Tree
@p 2
@tags trees, recursion, easy
@quick
- **Invert**: swap `left` and `right` at **every** node (recursively or with BFS). O(n).
- **Same Tree**: both null → true; one null or different values → false; else recurse on both pairs of children.
- Both: **O(n) time, O(h) space**.
- Related: Symmetric Tree = "is the tree the same as its own mirror?".

::: text 🧾 Problem
**Invert Binary Tree:** mirror the tree (every left child becomes a right child and vice versa) and return the root.
`[4, 2, 7, 1, 3, 6, 9] → [4, 7, 2, 9, 6, 3, 1]`

**Same Tree:** given roots `p` and `q`, return `true` if the trees have the same shape and the same values.
`[1, 2, 3]` vs `[1, 2, 3] → true`; `[1, 2]` vs `[1, null, 2] → false`.

**Constraints:** 0 ≤ nodes ≤ 100.
:::

::: text 🧒 Intuition
**Invert** = looking at the tree in a **mirror**: at every branching point, what was on the left is now on the right. You can mirror a big tree by mirroring each small subtree and then swapping them.

**Same Tree** = comparing **two Lego builds** brick by brick: same brick at the top? Then compare the left parts with each other and the right parts with each other.
:::

::: text 🐢 Brute force
**Same Tree:** serialise both trees to strings (with null markers) and compare: O(n) time but O(n) extra memory for the strings, and it's easy to forget the null markers (then `[1, 2]` and `[1, null, 2]` look equal).
**Invert:** build a brand-new mirrored tree: O(n) time and O(n) extra nodes instead of swapping in place.
:::

::: text 💡 Key insight
Both problems are **structural recursion**: the answer for a tree is defined by the answers for its subtrees plus one local step (swap the children / compare the two roots). One visit per node.

**Pattern name: Tree DFS (recursion over two subtrees).**
:::

::: diagram Invert and Same Tree
flowchart TD
  I["invert(node)"] --> I1{"null?"}
  I1 -->|"yes"| I2["return null"]
  I1 -->|"no"| I3["swap node.left and node.right"]
  I3 --> I4["invert(left), invert(right), return node"]
  S["same(p, q)"] --> S1{"both null?"}
  S1 -->|"yes"| S2["true"]
  S1 -->|"no"| S3{"one null or p.val !== q.val?"}
  S3 -->|"yes"| S4["false"]
  S3 -->|"no"| S5["same(p.left, q.left) and same(p.right, q.right)"]
:::

::: image Invert Binary Tree: 4 2 7 1 3 6 9 becomes its mirror image
/images/dsa-binary-search-trees/invert-tree.svg
:::

::: text 🔍 Dry run: invert [4, 2, 7, 1, 3, 6, 9]
| Visit | children before | after the swap |
|---|---|---|
| 4 | L = 2, R = 7 | L = 7, R = 2 |
| 7 | L = 6, R = 9 | L = 9, R = 6 |
| 9, 6 | leaves | unchanged |
| 2 | L = 1, R = 3 | L = 3, R = 1 |
| 3, 1 | leaves | unchanged |

Level order of the result: `[4, 7, 2, 9, 6, 3, 1]`.

**Same Tree** `[1, 2]` vs `[1, null, 2]`: roots 1 = 1 → compare lefts: node 2 vs null → **false**.
:::

::: code javascript Optimal solutions with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let head = 0, i = 1;
  while (head < q.length && i < arr.length) {
    const node = q[head++];
    if (i < arr.length && arr[i] !== null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] !== null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}
/** Level order with nulls, trailing nulls trimmed (LeetCode format) for easy comparison. */
function toArray(root) {
  const out = [], q = [root];
  for (let head = 0; head < q.length; head++) {
    const n = q[head];
    if (n) { out.push(n.val); q.push(n.left, n.right); } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

/** Invert Binary Tree in place. Time O(n), Space O(h). */
function invertTree(root) {
  if (!root) return null;
  [root.left, root.right] = [root.right, root.left]; // swap the two subtrees
  invertTree(root.left);                             // then mirror each subtree
  invertTree(root.right);
  return root;
}

/** Same Tree. Time O(n), Space O(h). */
function isSameTree(p, q) {
  if (!p && !q) return true;                  // both empty → same
  if (!p || !q || p.val !== q.val) return false; // shape or value differs
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}

/** Bonus: Symmetric Tree = the left subtree mirrors the right subtree. */
function isSymmetric(root) {
  const mirror = (a, b) => (!a && !b) || (!!a && !!b && a.val === b.val && mirror(a.left, b.right) && mirror(a.right, b.left));
  return !root || mirror(root.left, root.right);
}

// ---------- tests ----------
const inv = toArray(invertTree(buildTree([4, 2, 7, 1, 3, 6, 9])));
console.log('invert →', JSON.stringify(inv), JSON.stringify(inv) === '[4,7,2,9,6,3,1]' ? '✅' : '❌ FAIL');
console.log('invert empty →', invertTree(null) === null ? '✅' : '❌ FAIL');
const twice = toArray(invertTree(invertTree(buildTree([1, 2, 3, null, 4]))));
console.log('invert twice = original', JSON.stringify(twice) === '[1,2,3,null,4]' ? '✅' : '❌ FAIL');
const sameCases = [
  [[1, 2, 3], [1, 2, 3], true],
  [[1, 2], [1, null, 2], false],   // same values, different shape
  [[1, 2, 1], [1, 1, 2], false],
  [[], [], true],
];
for (const [a, b, expected] of sameCases) {
  const got = isSameTree(buildTree(a), buildTree(b));
  console.log('same', JSON.stringify(a), JSON.stringify(b), '→', got, got === expected ? '✅' : '❌ FAIL');
}
console.log('symmetric [1,2,2,3,4,4,3] →', isSymmetric(buildTree([1, 2, 2, 3, 4, 4, 3])) ? '✅' : '❌ FAIL');
:::

::: chart line Extra memory (values): serialise both trees vs recursive compare (balanced tree, height log2 n)
n,Serialise to strings ~2n,Recursion stack ~log2 n
15,30,4
255,510,8
4095,8190,12
65535,131070,16
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Serialise + compare strings (Same Tree) | O(n) | O(n) | Easy to reason about | Extra memory; must include null markers | Quick check |
| Build a new mirrored tree (Invert) | O(n) | O(n) | Keeps the original | Extra nodes | Input must not change |
| **Recursive DFS** | **O(n)** | O(h) | Shortest code | Recursion depth | Default answer |
| BFS with a queue | O(n) | O(w) | No recursion | More code | Very deep trees |
:::

::: warning ⚠️ Common mistakes / edge cases
- Inverting with `root.left = invertTree(root.right); root.right = invertTree(root.left)` → the second line uses the **already changed** left. Swap first, or store both results in temporaries.
- Same Tree: checking only values, not shape (`[1, 2]` vs `[1, null, 2]`).
- Not handling empty trees.
:::

::: understand
- Two-tree recursion (walk two trees in lockstep) also solves [Symmetric Tree](https://leetcode.com/problems/symmetric-tree/), [Subtree of Another Tree](https://leetcode.com/problems/subtree-of-another-tree/) and [Merge Two Binary Trees](https://leetcode.com/problems/merge-two-binary-trees/).
:::

::: ask
- *"Invert in place, or return a new tree?"*
- *"Same Tree: same structure AND same values?"*
:::

::: important ⭐ How to explain it in the interview
> "Both are structural recursion. To invert, at each node I swap the left and right subtrees and then invert each of them; empty trees return null. For Same Tree: two empty trees are equal; if only one is empty or the values differ they're not; otherwise both left subtrees and both right subtrees must be the same. Each node is visited once: O(n) time, O(h) space."
:::

::: links
LeetCode 226: Invert Binary Tree | https://leetcode.com/problems/invert-binary-tree/
LeetCode 100: Same Tree | https://leetcode.com/problems/same-tree/
NeetCode video: Invert Binary Tree | https://www.youtube.com/results?search_query=neetcode+invert+binary+tree
:::

=== Validate Binary Search Tree
@p 3
@tags bst, dfs, medium
@quick
- BST rule: **every** node in the left subtree < node < **every** node in the right subtree (not just the direct children).
- Pass a valid range down: left child → `(low, node.val)`, right child → `(node.val, high)`.
- Or: **inorder traversal must be strictly increasing**.
- **O(n) time, O(h) space**.

::: text 🧾 Problem
Return `true` if a binary tree is a valid **Binary Search Tree**: for every node, all values in its **left subtree are smaller** and all values in its **right subtree are larger** (strictly), and both subtrees are BSTs too.

**Example 1:** `[2, 1, 3] → true`
**Example 2:** `[5, 1, 4, null, null, 3, 6] → false` (4 is in the right subtree of 5 but 4 < 5).

**Constraints:** 1 ≤ nodes ≤ 10⁴, values can be as small as −2³¹.
:::

::: text 🧒 Intuition
A BST is like a **library shelf system**: everything shelved to the left of a sign is alphabetically before it, everything to the right after it, and that must hold for **all** signs above too. When you walk down to a book, each sign you pass narrows the allowed range: "after M" and then "before P" means the book must be between M and P. A book outside its allowed range breaks the system, even if it looks fine next to its direct neighbour.
:::

::: text 🐢 Brute force
**Idea:** for every node, scan its entire left subtree for the maximum and its entire right subtree for the minimum, and check `maxLeft < node < minRight`.

**Complexity:** each node scans its subtree → O(n · h), which is **O(n²)** for a skewed tree (~5 × 10⁷ visits for 10⁴ nodes). The waste: the same subtrees are scanned again for every ancestor.

**Wrong shortcut:** only comparing each node with its direct children (`left.val < node.val < right.val`). The tree `[5, 4, 6, null, null, 3, 7]` passes that check (6 > 5, 3 < 6, 7 > 6), but 3 sits in the **right** subtree of 5 while being smaller than 5, so it is not a BST.
:::

::: text 💡 Key insight
Instead of looking **up** for every node, push the constraints **down**: each node must lie in an open interval `(low, high)` inherited from its ancestors. Going left tightens `high` to the node's value; going right tightens `low`. One visit per node.

Equivalent insight: an **inorder** traversal of a BST visits values in sorted order, so just check that each value is bigger than the previous one.

**Pattern name: DFS with bounds (top-down constraints) / inorder property.**
:::

::: diagram Pass the allowed range down
flowchart TD
  A["valid(node, low, high)"] --> B{"node is null?"}
  B -->|"yes"| T["true"]
  B -->|"no"| C{"low < node.val < high?"}
  C -->|"no"| F["false"]
  C -->|"yes"| D["valid(node.left, low, node.val) and valid(node.right, node.val, high)"]
:::

::: image Validate BST: 4 sits in the right subtree of 5 but is smaller than 5, so the tree is invalid
/images/dsa-binary-search-trees/validate-bst.svg
:::

::: text 🔍 Dry run: [5, 4, 6, null, null, 3, 7] (passes the "children only" check, but is invalid)
| Node | allowed range (low, high) | inside? |
|---|---|---|
| 5 | (−∞, +∞) | yes |
| 4 | (−∞, 5) | yes |
| 6 | (5, +∞) | yes |
| 3 | (5, 6) | **no → return false** |

Inorder check gives `4, 5, 3, 6, 7`: 3 is not bigger than 5 → false as well.
:::

::: code javascript Optimal solutions with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let head = 0, i = 1;
  while (head < q.length && i < arr.length) {
    const node = q[head++];
    if (i < arr.length && arr[i] !== null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] !== null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}

/** Range (bounds) method. Time O(n), Space O(h). */
function isValidBST(root, low = -Infinity, high = Infinity) {
  if (!root) return true;                                   // an empty subtree is valid
  if (root.val <= low || root.val >= high) return false;    // outside the range from the ancestors
  return isValidBST(root.left, low, root.val) &&            // left: everything must be < root.val
         isValidBST(root.right, root.val, high);            // right: everything must be > root.val
}

/** Inorder method: values must strictly increase. Time O(n), Space O(h). */
function isValidBSTInorder(root) {
  let prev = -Infinity, ok = true;
  (function walk(node) {
    if (!node || !ok) return;
    walk(node.left);
    if (node.val <= prev) ok = false;   // not strictly increasing → not a BST
    prev = node.val;
    walk(node.right);
  })(root);
  return ok;
}

/** WRONG approach (only compares direct children) to show the trap. */
function childrenOnlyCheck(node) {
  if (!node) return true;
  if (node.left && node.left.val >= node.val) return false;
  if (node.right && node.right.val <= node.val) return false;
  return childrenOnlyCheck(node.left) && childrenOnlyCheck(node.right);
}

// ---------- tests ----------
const cases = [
  [[2, 1, 3], true],
  [[5, 1, 4, null, null, 3, 6], false],
  [[5, 4, 6, null, null, 3, 7], false],   // the trap: 3 is in 5's right subtree
  [[2, 2, 2], false],                     // duplicates are not allowed (strict)
  [[1], true],
  [[-2147483648, null, 2147483647], true], // extreme values: bounds must be ±Infinity, not ±2^31
];
for (const [arr, expected] of cases) {
  const root = buildTree(arr);
  const a = isValidBST(root), b = isValidBSTInorder(root);
  console.log(JSON.stringify(arr), '→', a, a === expected && b === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('children-only check is fooled by [5,4,6,null,null,3,7]:', childrenOnlyCheck(buildTree([5, 4, 6, null, null, 3, 7])) === true ? '✅ (shows the trap)' : '❌ FAIL');
:::

::: chart line Node visits for a skewed tree: scan subtrees for every node vs one DFS with bounds
n,Scan min/max per node ~n²/2,Bounds DFS n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Children-only comparison | O(n) | O(h) | Short | **Wrong** | Never |
| Max of left / min of right per node | O(n²) worst | O(h) | Literal translation of the rule | Rescans subtrees | Explaining the rule |
| **DFS with (low, high) bounds** | **O(n)** | O(h) | Clear, top-down | Bounds must handle extreme values | Default answer |
| Inorder, strictly increasing | O(n) | O(h) | Uses a BST property | Needs a `prev` variable | Equally good alternative |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing only with direct children (the classic trap above).
- Using `<` / `>` instead of `<=` / `>=` → duplicates slip through.
- Initial bounds of `-2^31` and `2^31 − 1`: fails when a node equals those extremes. Use ±Infinity (or null).
- Forgetting that an empty tree is valid.
:::

::: understand
- BSTs give **ordered** data with O(h) search; inorder = sorted is the property behind [Kth Smallest Element in a BST](https://leetcode.com/problems/kth-smallest-element-in-a-bst/), [Convert Sorted Array to BST](https://leetcode.com/problems/convert-sorted-array-to-binary-search-tree/) and [Lowest Common Ancestor of a BST](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/).
- Passing constraints **down** a recursion (top-down) is the opposite of computing results **up** (bottom-up, like Maximum Depth).
:::

::: ask
- *"Are duplicates allowed? On which side?"* (Usually not allowed → strict comparisons.)
- *"What range of values?"* (Extreme values break naive bounds.)
:::

::: important ⭐ How to explain it in the interview
> "Comparing each node only with its children isn't enough: a node deep in the right subtree must still be bigger than the root. So I pass an allowed open range down the recursion, starting with minus and plus infinity. Each node must be strictly inside its range; its left child gets the range (low, node.val) and its right child (node.val, high). Alternatively, an inorder traversal must be strictly increasing. Both are O(n) time and O(h) space."
:::

::: links
LeetCode 98: Validate Binary Search Tree | https://leetcode.com/problems/validate-binary-search-tree/
NeetCode video: Validate Binary Search Tree | https://www.youtube.com/results?search_query=neetcode+validate+binary+search+tree
:::

=== Lowest Common Ancestor
@p 2
@tags trees, recursion, medium
@quick
- **Binary tree**: recurse; return the node if it's `p` or `q`; if **both** subtrees return non-null, this node is the LCA; else pass up the non-null side.
- **BST**: walk from the root; both smaller → go left, both bigger → go right, otherwise this node is the LCA. O(h).
- A node can be its own ancestor (`p` is an ancestor of `q` → answer `p`).
- Binary tree version: **O(n) time, O(h) space**.

::: text 🧾 Problem
Given a binary tree and two nodes `p` and `q` in it, return their **lowest common ancestor**: the deepest node that has both `p` and `q` in its subtree (a node counts as a descendant of itself).

**Example 1:** tree `[3,5,1,6,2,0,8,null,null,7,4]`, p = 5, q = 1 → **3**.
**Example 2:** same tree, p = 5, q = 4 → **5** (5 is an ancestor of 4).

**Constraints:** 2 ≤ nodes ≤ 10⁵, all values unique, p and q exist.
:::

::: text 🧒 Intuition
In a **family tree**, the lowest common ancestor of two cousins is the closest grandparent they share. Ask every person: "is either of the two people in your branch?" A person whose **left side** contains one and **right side** contains the other is the meeting point. If a person **is** one of the two, they report themselves upward.
:::

::: text 🐢 Brute force
**Idea:** find the root-to-p path and the root-to-q path (two DFS searches, storing the paths), then walk both paths from the root and return the last node they share.

**Complexity:** O(n) time but O(n) extra space for the paths and several passes. A worse version re-searches "is p in this subtree?" for every node → O(n²).
:::

::: text 💡 Key insight
One postorder recursion can answer "is p or q in this subtree?" for every node at once. The function returns `p` or `q` if found below (or the LCA once found), else null. The **first** node (bottom-up) whose left and right calls are **both** non-null is where p and q split → the LCA.

**Pattern name: Tree DFS returning information upward.**
:::

::: diagram LCA recursion
flowchart TD
  A["lca(node)"] --> B{"node null, p or q?"}
  B -->|"yes"| R1["return node"]
  B -->|"no"| C["left = lca(node.left), right = lca(node.right)"]
  C --> D{"left and right both non-null?"}
  D -->|"yes"| R2["return node (the split point = LCA)"]
  D -->|"no"| R3["return left or right (whichever found something)"]
:::

::: image Lowest Common Ancestor: 5 and 1 are on different sides of 3, so their LCA is 3
/images/dsa-binary-search-trees/lca.svg
:::

::: text 🔍 Dry run: p = 5, q = 4 on [3,5,1,6,2,0,8,null,null,7,4]
| Call | result | why |
|---|---|---|
| lca(3) → lca(5) | returns **5** immediately | node is p (we don't need to look below it) |
| lca(3) → lca(1) → lca(0), lca(8) | null, null | neither p nor q there |
| lca(1) | null | both sides null |
| lca(3) | left = 5, right = null → returns **5** | only one side found something |

Answer **5**: q = 4 is inside 5's subtree, so 5 itself is the LCA. For p = 5, q = 1: left = 5, right = 1 at node 3 → **3**.
:::

::: code javascript Optimal solutions with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let head = 0, i = 1;
  while (head < q.length && i < arr.length) {
    const node = q[head++];
    if (i < arr.length && arr[i] !== null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] !== null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}
const find = (root, val) => (!root ? null : root.val === val ? root : find(root.left, val) || find(root.right, val));

/** LCA in any binary tree. Time O(n), Space O(h). */
function lowestCommonAncestor(root, p, q) {
  if (!root || root === p || root === q) return root;      // found p or q (or hit the bottom)
  const left = lowestCommonAncestor(root.left, p, q);       // what did the left subtree find?
  const right = lowestCommonAncestor(root.right, p, q);     // what did the right subtree find?
  if (left && right) return root;                           // p and q are on different sides → split point
  return left || right;                                     // pass up whatever was found (or null)
}

/** LCA in a BST: use the ordering, no recursion needed. Time O(h), Space O(1). */
function lcaBST(root, p, q) {
  let node = root;
  while (node) {
    if (p.val < node.val && q.val < node.val) node = node.left;       // both on the left
    else if (p.val > node.val && q.val > node.val) node = node.right; // both on the right
    else return node;                                                 // they split here (or one IS node)
  }
  return null;
}

// ---------- tests ----------
const tree = buildTree([3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]);
const cases = [[5, 1, 3], [5, 4, 5], [6, 4, 5], [7, 8, 3], [0, 8, 1]];
for (const [a, b, expected] of cases) {
  const got = lowestCommonAncestor(tree, find(tree, a), find(tree, b));
  console.log(`LCA(${a}, ${b}) →`, got.val, got.val === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const bst = buildTree([6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]);
const bstCases = [[2, 8, 6], [2, 4, 2], [3, 5, 4], [7, 9, 8]];
for (const [a, b, expected] of bstCases) {
  const got = lcaBST(bst, find(bst, a), find(bst, b));
  console.log(`BST LCA(${a}, ${b}) →`, got.val, got.val === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Node visits: re-check "is p below?" at every node vs one recursion (skewed tree)
n,Re-search per node ~n²/2,One DFS n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Re-search subtrees at each node | O(n²) | O(h) | Literal | Slow | Never |
| Store both root paths, compare | O(n) | O(n) | Easy to explain | Extra memory, two searches | If recursion feels risky |
| Parent pointers + Set of ancestors | O(n) | O(n) | Works with parent links | Needs a parent map | Nodes have parent pointers |
| **One recursive DFS** | **O(n)** | O(h) | Short, one pass | Must trust the return values | Binary tree (default) |
| **BST walk** | **O(h)** | **O(1)** | Uses ordering | Only for BSTs | BST version |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing values when nodes are given (fine for unique values, but say it).
- Forgetting that p can be an ancestor of q (answer p).
- In the BST version, using `<=`/`>=` incorrectly so you walk past the split point.
- Assuming p and q exist: if they might not, you need an extra "found both" check.
:::

::: understand
- "Return information upward and decide at the node where both sides report back" also solves [Diameter of Binary Tree](https://leetcode.com/problems/diameter-of-binary-tree/) and [Binary Tree Maximum Path Sum](https://leetcode.com/problems/binary-tree-maximum-path-sum/). The BST version is in [LCA of a BST](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/).
:::

::: ask
- *"Is it a BST or a general binary tree?"* (BST → O(h) walk.)
- *"Are p and q guaranteed to be in the tree?"*
- *"Do nodes have parent pointers?"*
:::

::: important ⭐ How to explain it in the interview
> "For a general binary tree I recurse: if the node is null, p or q, I return it. Otherwise I ask the left and right subtrees. If both return something, p and q are on different sides, so this node is the lowest common ancestor; otherwise I pass up whichever side found something. That's one pass: O(n) time, O(h) space. If it's a BST I can walk from the root instead: go left if both values are smaller, right if both are bigger, otherwise I've found the split, in O(h)."
:::

::: links
LeetCode 236: LCA of a Binary Tree | https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/
LeetCode 235: LCA of a BST | https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/
NeetCode video: Lowest Common Ancestor | https://www.youtube.com/results?search_query=neetcode+lowest+common+ancestor
:::

=== Diameter of Binary Tree / Balanced Binary Tree
@p 2
@tags trees, dfs, height
@quick
- One postorder DFS returns each node's **height**; at every node also check the **path through it** = `h(left) + h(right)` (edges).
- Diameter = the max of those paths; it may **not** pass through the root.
- Balanced: `|h(left) − h(right)| ≤ 1` at **every** node; return `-1` as a "not balanced" signal to stop early.
- Both **O(n)** (calling height() separately at every node is O(n²)).

::: text 🧾 Problem
**Diameter:** the length (number of **edges**) of the longest path between any two nodes.
`[1, 2, 3, 4, 5] → 3` (path 4 → 2 → 1 → 3 or 5 → 2 → 1 → 3).

**Balanced Binary Tree:** return `true` if, for **every** node, the heights of its two subtrees differ by at most 1.
`[3, 9, 20, null, null, 15, 7] → true`; `[1, 2, 2, 3, 3, null, null, 4, 4] → false`.

**Constraints:** up to 10⁴ nodes.
:::

::: text 🧒 Intuition
**Diameter:** the longest **hiking trail** between two points in a park whose paths form a tree. Every trail bends at some "highest point" node; there it's the deepest branch on the left plus the deepest branch on the right. Check every node as the bend and keep the longest.

**Balanced:** a **mobile hanging from the ceiling**: at every hook, the two sides must be about the same depth, or it tilts.
:::

::: text 🐢 Brute force
**Idea:** for every node, call a separate `height(left)` and `height(right)` function (each a full DFS of that subtree).

**Complexity:** O(n · h): **O(n²)** for a skewed tree (~5 × 10⁷ visits for 10⁴ nodes). Heights of the same subtrees are recomputed for every ancestor.
:::

::: text 💡 Key insight
A postorder DFS already computes `height(node) = 1 + max(h(left), h(right))`. At the same moment you have both children's heights, so you can update the diameter (`h(left) + h(right)`) or check balance (`|h(left) − h(right)| ≤ 1`) **for free**. One pass, each node visited once.

**Pattern name: Tree DFS returning height + updating a global answer.**
:::

::: diagram One DFS, two answers
flowchart TD
  A["h(node)"] --> B{"node null?"}
  B -->|"yes"| Z["return 0"]
  B -->|"no"| C["l = h(node.left), r = h(node.right)"]
  C --> D["diameter = max(diameter, l + r)"]
  C --> E{"balanced check: abs(l - r) > 1?"}
  E -->|"yes"| U["mark unbalanced"]
  D --> F["return 1 + max(l, r)"]
:::

::: image Diameter: heights computed bottom-up; the longest path 4-2-1-3 has 3 edges
/images/dsa-binary-search-trees/diameter.svg
:::

::: text 🔍 Dry run: diameter of [1, 2, 3, 4, 5]
| Node (postorder) | h(left) | h(right) | path through node = l + r | best | returns height |
|---|---|---|---|---|---|
| 4 | 0 | 0 | 0 | 0 | 1 |
| 5 | 0 | 0 | 0 | 0 | 1 |
| 2 | 1 | 1 | 2 | 2 | 2 |
| 3 | 0 | 0 | 0 | 2 | 1 |
| 1 | 2 | 1 | **3** | **3** | 3 |

Answer **3** edges.
:::

::: code javascript Optimal solutions with tests (runnable)
class TreeNode { constructor(val, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
function buildTree(arr) {
  if (!arr.length || arr[0] === null) return null;
  const root = new TreeNode(arr[0]); const q = [root]; let head = 0, i = 1;
  while (head < q.length && i < arr.length) {
    const node = q[head++];
    if (i < arr.length && arr[i] !== null) q.push((node.left = new TreeNode(arr[i]))); i++;
    if (i < arr.length && arr[i] !== null) q.push((node.right = new TreeNode(arr[i]))); i++;
  }
  return root;
}

/** Diameter (in edges). Time O(n), Space O(h). */
function diameterOfBinaryTree(root) {
  let best = 0;
  function height(node) {               // returns the height in NODES (0 for null)
    if (!node) return 0;
    const l = height(node.left);
    const r = height(node.right);
    best = Math.max(best, l + r);       // longest path that bends at this node (edges = l + r)
    return 1 + Math.max(l, r);
  }
  height(root);
  return best;
}

/** Balanced tree: returns -1 as soon as any subtree is unbalanced. Time O(n). */
function isBalanced(root) {
  function check(node) {
    if (!node) return 0;
    const l = check(node.left);
    if (l === -1) return -1;            // stop early: already unbalanced below
    const r = check(node.right);
    if (r === -1) return -1;
    if (Math.abs(l - r) > 1) return -1; // this node is unbalanced
    return 1 + Math.max(l, r);          // otherwise return its height
  }
  return check(root) !== -1;
}

// ---------- tests ----------
const diam = [
  [[1, 2, 3, 4, 5], 3],
  [[1, 2], 1],
  [[1], 0],
  [[], 0],
  [[1, 2, null, 3, 4, 5, null, null, 6, 7, null, null, 8], 6], // longest path does NOT go through the root
];
for (const [arr, expected] of diam) {
  const got = diameterOfBinaryTree(buildTree(arr));
  console.log('diameter', JSON.stringify(arr), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
const bal = [
  [[3, 9, 20, null, null, 15, 7], true],
  [[1, 2, 2, 3, 3, null, null, 4, 4], false],
  [[], true],
  [[1, 2, null, 3], false],   // a chain of 3
];
for (const [arr, expected] of bal) {
  const got = isBalanced(buildTree(arr));
  console.log('balanced', JSON.stringify(arr), '→', got, got === expected ? '✅' : '❌ FAIL');
}
:::

::: chart line Node visits for a skewed tree: height() at every node vs one DFS
n,height() per node ~n²/2,One DFS n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Separate height() call per node | O(n²) worst | O(h) | Literal translation | Recomputes heights | Never as final |
| **One postorder DFS + outer variable** | **O(n)** | O(h) | Optimal, short | Uses a variable outside the recursion | Default answer |
| Return a pair [height, best] | O(n) | O(h) | No outer variable (pure function) | Slightly more code | If you prefer no shared state |
:::

::: warning ⚠️ Common mistakes / edge cases
- Assuming the diameter goes through the **root** (the test above shows it doesn't have to).
- Mixing up **edges vs nodes**: diameter counts edges = `l + r` when heights are in nodes.
- Balanced check only at the root (`|h(root.left) − h(root.right)| ≤ 1`) instead of at every node.
- Not stopping early in the balanced check (still O(n), but wasted work).
:::

::: understand
- "Return a value upward (height) while updating a global answer at each node" also solves [Binary Tree Maximum Path Sum](https://leetcode.com/problems/binary-tree-maximum-path-sum/) and [Longest Univalue Path](https://leetcode.com/problems/longest-univalue-path/). Same skeleton as [Maximum Depth](https://leetcode.com/problems/maximum-depth-of-binary-tree/).
:::

::: ask
- *"Diameter in edges or nodes?"*
- *"Balanced by height difference ≤ 1 at every node?"*
- *"Can the tree be empty?"*
:::

::: important ⭐ How to explain it in the interview
> "I do one postorder DFS that returns each node's height. At each node I already know the heights of both subtrees, so the longest path bending at that node is left height plus right height, and I keep the maximum: that's the diameter, which doesn't have to pass through the root. For balance, I return −1 as soon as any node's subtree heights differ by more than one. Each node is visited once: O(n) time, O(h) space, instead of O(n²) from calling height() separately at every node."
:::

::: links
LeetCode 543: Diameter of Binary Tree | https://leetcode.com/problems/diameter-of-binary-tree/
LeetCode 110: Balanced Binary Tree | https://leetcode.com/problems/balanced-binary-tree/
NeetCode video: Diameter of Binary Tree | https://www.youtube.com/results?search_query=neetcode+diameter+of+binary+tree
:::
