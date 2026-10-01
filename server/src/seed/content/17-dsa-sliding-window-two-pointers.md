@section DSA: Sliding Window & Two Pointers
@icon 🪟
@color #8b5cf6
@desc Tier 3 + Tier 4: two pointers from both ends (container, 3Sum, Two Sum II, rain water) and the sliding-window templates (fixed windows, anagram windows, expand/shrink). Every problem with pictures, dry runs and tests.

=== Container With Most Water
@p 3
@tags two-pointers, greedy, medium
@quick
- **Pattern: two pointers from both ends**; area = `(r − l) × min(h[l], h[r])`.
- Always move the **shorter** wall inward: moving the taller one can only shrink the area.
- **O(n) time, O(1) space** (brute force checks all pairs: O(n²)).
- The width shrinks every step, so the only hope for a bigger area is a taller short wall.

::: text 🧾 Problem
`height[i]` is the height of a vertical wall at position `i`. Pick **two walls** that, together with the floor, hold the **most water**. The water level is limited by the **shorter** wall. Return the maximum amount of water.

**Example 1:** `[1, 8, 6, 2, 5, 4, 8, 3, 7] → 49` (walls at index 1 and 8: width 7 × height min(8, 7) = 7).
**Example 2:** `[1, 1] → 1`.

**Constraints:** 2 ≤ n ≤ 10⁵, 0 ≤ height ≤ 10⁴.
:::

::: text 🧒 Intuition
Picture two people holding a **sheet of plastic between two fence posts** to catch rain. The water can only rise as high as the **lower** post. Start with the two posts that are furthest apart (widest container). To find something better you must get rid of the bottleneck, the **shorter** post, and hope the next one is taller. Moving the taller post can never help: the width shrinks and the height is still capped by the short one.
:::

::: text 🐢 Brute force
**Idea:** try every pair of walls.

`for i in 0..n-1:`
↳ `for j in i+1..n-1: best = max(best, (j - i) * min(h[i], h[j]))`

**Complexity:** O(n²). For n = 10⁵ that's ~5 × 10⁹ pairs (~50 s). Most pairs are obviously worse than ones already seen.
:::

::: text 💡 Key insight
Start with the widest pair (`l = 0`, `r = n − 1`). The area is limited by the shorter wall. If we move the **taller** wall inward, the width drops and the height can't rise above the short wall, so the area can only get worse. So every pair involving the current short wall has been "used up": we can safely discard it and move that pointer. Each step discards one wall → n steps total.

**Pattern name: Two pointers from both ends (greedy elimination).**
:::

::: diagram Move the shorter wall
flowchart TD
  S["l = 0, r = n - 1, best = 0"] --> L{"l < r?"}
  L -->|"no"| R["return best"]
  L -->|"yes"| A["area = (r - l) × min(h[l], h[r])"]
  A --> B["best = max(best, area)"]
  B --> C{"h[l] < h[r]?"}
  C -->|"yes"| D["l++ (left wall is the bottleneck)"]
  C -->|"no"| E["r-- (right wall is the bottleneck)"]
  D --> L
  E --> L
:::

::: image Container With Most Water: walls at 1 and 8 hold 49 units
/images/dsa-sliding-window/container-most-water.svg
:::

::: text 🔍 Dry run: height = [1, 8, 6, 2, 5, 4, 8, 3, 7]
| Step | l (h) | r (h) | width | min h | area | best | move |
|---|---|---|---|---|---|---|---|
| 1 | 0 (1) | 8 (7) | 8 | 1 | 8 | 8 | l++ (1 < 7) |
| 2 | 1 (8) | 8 (7) | 7 | 7 | **49** | **49** | r-- (8 ≥ 7) |
| 3 | 1 (8) | 7 (3) | 6 | 3 | 18 | 49 | r-- |
| 4 | 1 (8) | 6 (8) | 5 | 8 | 40 | 49 | r-- (equal → either) |
| 5 | 1 (8) | 5 (4) | 4 | 4 | 16 | 49 | r-- |
| 6 | 1 (8) | 4 (5) | 3 | 5 | 15 | 49 | r-- |
| 7 | 1 (8) | 3 (2) | 2 | 2 | 4 | 49 | r-- |
| 8 | 1 (8) | 2 (6) | 1 | 6 | 6 | 49 | r-- → stop |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Container With Most Water. Time O(n), Space O(1).
 */
function maxArea(height) {
  let l = 0, r = height.length - 1;   // start with the widest container
  let best = 0;
  while (l < r) {
    const width = r - l;
    const h = Math.min(height[l], height[r]);  // water level = the shorter wall
    best = Math.max(best, width * h);
    // The shorter wall limits every container it's part of → discard it
    if (height[l] < height[r]) l++;
    else r--;
  }
  return best;
}

/** Brute force for cross-checking: all pairs, O(n²). */
function maxAreaBrute(height) {
  let best = 0;
  for (let i = 0; i < height.length; i++)
    for (let j = i + 1; j < height.length; j++) best = Math.max(best, (j - i) * Math.min(height[i], height[j]));
  return best;
}

// ---------- tests ----------
const cases = [
  [[1, 8, 6, 2, 5, 4, 8, 3, 7], 49],
  [[1, 1], 1],                // minimum size
  [[4, 3, 2, 1, 4], 16],      // the two ends are best
  [[1, 2, 1], 2],
  [[0, 0, 0], 0],             // no height → no water
];
for (const [h, expected] of cases) {
  const got = maxArea(h);
  console.log(JSON.stringify(h), '→', got, got === expected && maxAreaBrute(h) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const arr = Array.from({ length: 2 + Math.floor(Math.random() * 20) }, () => Math.floor(Math.random() * 15));
  if (maxArea(arr) !== maxAreaBrute(arr)) allOk = false;
}
console.log('300 random inputs match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Pairs examined: brute force vs two pointers
n,All pairs n(n-1)/2,Two pointers n-1
10,45,9
100,4950,99
1000,499500,999
10000,49995000,9999
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All pairs | O(n²) | O(1) | Obviously correct | Too slow | First idea |
| Sort walls by height + track min/max index | O(n log n) | O(n) | Interesting | More complex, slower | Rarely |
| **Two pointers, move the shorter wall** | **O(n)** | **O(1)** | Optimal, tiny code | Needs the greedy argument | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Moving the **taller** wall (or both): you can skip the optimal pair.
- Using `max` instead of `min` for the height (water spills over the shorter wall).
- Width off by one: it's `r − l`, not `r − l + 1`.
- Confusing this with **Trapping Rain Water** (that one sums water above every bar).
:::

::: understand
- The greedy proof: every container using the shorter wall with any wall between l and r is **narrower and no taller**, so none can beat the current one. Discarding it is safe.
- Opposite-end two pointers: [Two Sum II](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/), [3Sum](https://leetcode.com/problems/3sum/), [Trapping Rain Water](https://leetcode.com/problems/trapping-rain-water/).
:::

::: ask
- *"Can heights be zero? Is n at least 2?"*
- *"Return the area only, or also the two indices?"*
- *"Can walls be slanted?"* (No: the water level is flat.)
:::

::: important ⭐ How to explain it in the interview
> "Brute force tries all pairs, O(n²). Instead I start with the widest container, pointers at both ends. The area is width times the shorter wall. Moving the taller wall inward can only reduce the area, because the width shrinks and the height is still capped by the shorter wall. So I always move the shorter one, updating the best area each step. Each step discards one wall: O(n) time, O(1) space."
:::

::: links
LeetCode 11: Container With Most Water | https://leetcode.com/problems/container-with-most-water/
NeetCode video: Container With Most Water | https://www.youtube.com/results?search_query=neetcode+container+with+most+water
:::

=== 3Sum
@p 3
@tags two-pointers, sorting, medium
@quick
- **Sort**, then fix `nums[i]` and run **Two Sum II** (two pointers) on the rest for target `−nums[i]`.
- **Skip duplicates**: for `i` (same as previous) and for `l`/`r` after finding a triplet.
- **O(n²) time**, O(1) extra space (ignoring sort/output).
- Early exit: if `nums[i] > 0` after sorting, no triplet can sum to 0.

::: text 🧾 Problem
Return **all unique triplets** `[a, b, c]` from `nums` (different indices) with `a + b + c = 0`. The answer must not contain duplicate triplets.

**Example 1:** `[-1, 0, 1, 2, -1, -4] → [[-1, -1, 2], [-1, 0, 1]]`
**Example 2:** `[0, 0, 0, 0] → [[0, 0, 0]]` (only once).

**Constraints:** 3 ≤ n ≤ 3000, −10⁵ ≤ values ≤ 10⁵.
:::

::: text 🧒 Intuition
You're picking **three friends whose bank balances cancel out** (sum to zero). Line everyone up by balance, from most in debt to richest. Pick the first friend; now you need two others whose total equals the opposite of friend 1's balance. With a sorted line that's easy: start with the poorest and richest of the rest. Too much money? Swap the richest for someone poorer. Too little? Swap the poorest for someone richer.
:::

::: text 🐢 Brute force
**Idea:** three nested loops over all index triples, add the sorted triplet to a Set to remove duplicates.

`for i: for j > i: for k > j: if nums[i] + nums[j] + nums[k] === 0 → add sorted triplet to a Set`

**Complexity:** O(n³): for n = 3000 that's ~4.5 × 10⁹ triples. Plus duplicate handling via string keys.
:::

::: text 💡 Key insight
Fix one number `a = nums[i]`; the problem becomes **"find pairs that sum to −a"** in the rest of the array. If the array is **sorted**, that's Two Sum II: two pointers in O(n). Doing it for each `i` gives O(n²). Sorting also makes **duplicates adjacent**, so we skip them by comparing with the neighbour instead of using a Set.

**Pattern name: Sort + fix one + two pointers.**
:::

::: diagram Fix i, then two pointers
flowchart TD
  A["sort nums"] --> B["for i = 0 .. n-3"]
  B --> C{"nums[i] same as nums[i-1]?"}
  C -->|"yes"| B
  C -->|"no"| D["l = i + 1, r = n - 1"]
  D --> E{"l < r?"}
  E -->|"no"| B
  E -->|"yes"| F["sum = nums[i] + nums[l] + nums[r]"]
  F -->|"sum < 0"| G["l++"] --> E
  F -->|"sum > 0"| H["r--"] --> E
  F -->|"sum = 0"| I["save triplet, l++ and r--, skip equal neighbours"] --> E
:::

::: image 3Sum: i fixed at -1, two pointers find -1 and 2
/images/dsa-sliding-window/three-sum.svg
:::

::: text 🔍 Dry run: sorted nums = [-4, -1, -1, 0, 1, 2]
| i (a) | l (val) | r (val) | sum | action | triplets |
|---|---|---|---|---|---|
| 0 (−4) | 1 (−1) | 5 (2) | −3 | l++ | |
| 0 (−4) | 2 (−1) | 5 (2) | −3 | l++ | |
| 0 (−4) | 3 (0) | 5 (2) | −2 | l++ | |
| 0 (−4) | 4 (1) | 5 (2) | −1 | l++ → l = r, stop | |
| 1 (−1) | 2 (−1) | 5 (2) | **0** | save, l++, r-- | [−1, −1, 2] |
| 1 (−1) | 3 (0) | 4 (1) | **0** | save, l++, r-- → stop | [−1, 0, 1] |
| 2 (−1) | | | | same as previous i → skip | |
| 3 (0) | 4 (1) | 5 (2) | 3 | r-- → stop | |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * 3Sum: all unique triplets that sum to 0.
 * Time O(n²) (sort O(n log n) + n two-pointer scans), Space O(1) extra besides the output.
 */
function threeSum(input) {
  const nums = [...input].sort((a, b) => a - b); // numeric sort (don't mutate the caller's array)
  const result = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (nums[i] > 0) break;                       // smallest is positive → sum can't be 0
    if (i > 0 && nums[i] === nums[i - 1]) continue; // same first number as before → duplicates
    let l = i + 1, r = nums.length - 1;
    while (l < r) {
      const sum = nums[i] + nums[l] + nums[r];
      if (sum < 0) l++;                           // too small → need a bigger number
      else if (sum > 0) r--;                      // too big → need a smaller number
      else {
        result.push([nums[i], nums[l], nums[r]]);
        l++; r--;
        while (l < r && nums[l] === nums[l - 1]) l++; // skip duplicate second numbers
        while (l < r && nums[r] === nums[r + 1]) r--; // skip duplicate third numbers
      }
    }
  }
  return result;
}

/** Brute force for cross-checking: O(n³) with a Set of keys. */
function threeSumBrute(nums) {
  const seen = new Set(), out = [];
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      for (let k = j + 1; k < nums.length; k++)
        if (nums[i] + nums[j] + nums[k] === 0) {
          const t = [nums[i], nums[j], nums[k]].sort((a, b) => a - b);
          const key = t.join(',');
          if (!seen.has(key)) { seen.add(key); out.push(t); }
        }
  return out;
}

const norm = (ts) => JSON.stringify(ts.map((t) => t.join(',')).sort());

// ---------- tests ----------
const cases = [
  [[-1, 0, 1, 2, -1, -4], [[-1, -1, 2], [-1, 0, 1]]],
  [[0, 0, 0, 0], [[0, 0, 0]]],      // duplicates collapse to one triplet
  [[0, 1, 1], []],                  // no answer
  [[-2, 0, 1, 1, 2], [[-2, 0, 2], [-2, 1, 1]]],
  [[3, -2, 1, 0], []],
];
for (const [nums, expected] of cases) {
  const got = threeSum(nums);
  console.log(JSON.stringify(nums), '→', JSON.stringify(got), norm(got) === norm(expected) && norm(threeSumBrute(nums)) === norm(expected) ? '✅' : '❌ FAIL');
}
let allOk = true;
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 12) }, () => Math.floor(Math.random() * 11) - 5);
  if (norm(threeSum(arr)) !== norm(threeSumBrute(arr))) allOk = false;
}
console.log('200 random arrays match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Triples checked: brute force O(n³) vs sort + two pointers O(n²)
n,Brute force n³/6,Sort + two pointers n²/2
10,167,50
100,166667,5000
1000,166666667,500000
3000,4500000000,4500000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Three loops + Set of keys | O(n³) | O(k) | Obvious | Far too slow | First idea only |
| Fix i + hash set (Two Sum) | O(n²) | O(n) | No sorting needed | Duplicate handling is messy | Unsorted, must keep indices |
| **Sort + fix i + two pointers** | **O(n²)** | O(1) extra | Clean duplicate skipping | Changes order (we copy) | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting to **skip duplicates** → `[-1, -1, 2]` appears twice.
- Skipping duplicates for `i` with `nums[i] === nums[i + 1]` (wrong direction: you skip a valid first choice).
- Default `sort()` sorts as strings: `[-1, -4, 2]` sorts wrongly. Use `(a, b) => a - b`.
- Not moving both pointers after a match → infinite loop.
:::

::: understand
- "Reduce k-Sum to (k−1)-Sum by fixing one element" generalises: [4Sum](https://leetcode.com/problems/4sum/) is O(n³) with two fixed elements. Related: [3Sum Closest](https://leetcode.com/problems/3sum-closest/), [Two Sum II](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/).
- Sorting is what makes both the two-pointer search and the duplicate skipping possible.
:::

::: ask
- *"Should the triplets be unique by value? Does the order of the output matter?"*
- *"Can I modify (sort) the input array?"*
- *"Is the target always 0?"* (If not, compare with `target − nums[i]`.)
:::

::: important ⭐ How to explain it in the interview
> "I sort the array, then fix each element as the first number and look for pairs summing to its negative with two pointers on the rest: too small → move left up, too big → move right down. Sorting makes duplicates adjacent, so I skip a first number equal to the previous one, and after recording a triplet I skip equal neighbours for both pointers. That's O(n²) time, better than the O(n³) brute force, with O(1) extra space besides the output."
:::

::: links
LeetCode 15: 3Sum | https://leetcode.com/problems/3sum/
NeetCode video: 3Sum | https://www.youtube.com/results?search_query=neetcode+3sum
:::

=== Two Sum II (sorted input)
@p 2
@tags two-pointers, sorted, medium
@quick
- Sorted input → **two pointers** at both ends: sum too big → `r--`; too small → `l++`.
- **O(n) time, O(1) space** (better memory than the hash map version).
- Return **1-indexed** positions in the LeetCode version.
- Why it's safe: when the sum is too big, `nums[r]` is too big for every remaining `l`.

::: text 🧾 Problem
`numbers` is sorted in non-decreasing order. Find the two numbers that add up to `target` and return their positions **1-indexed** (`[index1, index2]`, index1 < index2). Exactly one solution exists; use only O(1) extra space.

**Example 1:** `numbers = [2, 7, 11, 15], target = 9 → [1, 2]`
**Example 2:** `numbers = [-1, 0], target = -1 → [1, 2]`

**Constraints:** 2 ≤ n ≤ 3 × 10⁴, sorted, exactly one answer.
:::

::: text 🧒 Intuition
Two kids stand at the two ends of a **line sorted by height** and want a pair whose total height is exactly 300 cm. If the total is **too tall**, the tall end must step aside for someone shorter (move right pointer left). If it's **too short**, the short end steps aside for someone taller (move left pointer right). They meet the right pair without ever comparing everyone with everyone.
:::

::: text 🐢 Brute force
**Idea 1:** all pairs → O(n²) (~4.5 × 10⁸ for n = 3 × 10⁴).
**Idea 2:** the hash map from Two Sum → O(n) time but **O(n) space**, which the problem forbids.
**Idea 3:** for each number, binary-search its partner → O(n log n), O(1) space. OK, but not optimal.
:::

::: text 💡 Key insight
Look at `numbers[l] + numbers[r]`:
- If it's **too big**, `numbers[r]` is too big even with the smallest remaining partner `numbers[l]` → `numbers[r]` can't be in the answer → `r--`.
- If it's **too small**, `numbers[l]` is too small even with the largest remaining partner → `l++`.

Each step safely eliminates one number, so we finish in at most n steps.

**Pattern name: Two pointers on a sorted array (opposite ends).**
:::

::: diagram Shrink from the side that's wrong
flowchart TD
  S["l = 0, r = n - 1"] --> L{"sum = a[l] + a[r]"}
  L -->|"sum = target"| R["return [l + 1, r + 1]"]
  L -->|"sum > target"| A["r-- (right value too big)"]
  L -->|"sum < target"| B["l++ (left value too small)"]
  A --> L
  B --> L
:::

::: image Two Sum II: the sum is too big twice, so r moves left until 2 + 7 = 9
/images/dsa-sliding-window/two-sum-ii.svg
:::

::: text 🔍 Dry run: [2, 7, 11, 15], target = 9
| Step | l (val) | r (val) | sum | compare | move |
|---|---|---|---|---|---|
| 1 | 0 (2) | 3 (15) | 17 | > 9 | r-- |
| 2 | 0 (2) | 2 (11) | 13 | > 9 | r-- |
| 3 | 0 (2) | 1 (7) | **9** | = 9 | return [1, 2] |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Two Sum II on a sorted array. Returns 1-indexed positions.
 * Time O(n), Space O(1).
 */
function twoSumSorted(numbers, target) {
  let l = 0, r = numbers.length - 1;
  while (l < r) {
    const sum = numbers[l] + numbers[r];
    if (sum === target) return [l + 1, r + 1]; // the problem wants 1-indexed positions
    if (sum > target) r--;                     // too big → the right value can't be used
    else l++;                                  // too small → the left value can't be used
  }
  return [];                                   // no pair (problem guarantees one exists)
}

/** Binary-search alternative: O(n log n), O(1) space. */
function twoSumBinary(numbers, target) {
  for (let i = 0; i < numbers.length; i++) {
    let lo = i + 1, hi = numbers.length - 1;
    const need = target - numbers[i];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (numbers[mid] === need) return [i + 1, mid + 1];
      if (numbers[mid] < need) lo = mid + 1; else hi = mid - 1;
    }
  }
  return [];
}

// ---------- tests ----------
const cases = [
  [[2, 7, 11, 15], 9, [1, 2]],
  [[2, 3, 4], 6, [1, 3]],
  [[-1, 0], -1, [1, 2]],         // negatives
  [[1, 2, 3, 4, 4, 9, 56, 90], 8, [4, 5]], // duplicates
  [[0, 0, 3, 4], 0, [1, 2]],
];
for (const [nums, target, expected] of cases) {
  const a = twoSumSorted(nums, target), b = twoSumBinary(nums, target);
  const ok = JSON.stringify(a) === JSON.stringify(expected) && JSON.stringify(b) === JSON.stringify(expected);
  console.log(JSON.stringify(nums), 'target', target, '→', JSON.stringify(a), ok ? '✅' : '❌ FAIL expected ' + JSON.stringify(expected));
}
:::

::: chart line Steps: all pairs vs binary search per element vs two pointers
n,All pairs n²/2,Binary search n log2 n,Two pointers n
10,50,33,10
100,5000,664,100
1000,500000,9966,1000
10000,50000000,132877,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All pairs | O(n²) | O(1) | Trivial | Slow | Never |
| Hash map (Two Sum I) | O(n) | O(n) | Works unsorted | Ignores the sorted order; extra memory | Unsorted input |
| Binary search per element | O(n log n) | O(1) | Uses sorting | Slower than two pointers | If you only remember binary search |
| **Two pointers** | **O(n)** | **O(1)** | Optimal on sorted input | Needs sorted input | This problem |
:::

::: warning ⚠️ Common mistakes / edge cases
- Returning **0-indexed** positions when the problem asks for 1-indexed.
- Moving the wrong pointer (too big → move `r`, not `l`).
- Using `l <= r` and pairing an element with itself.
- Using the hash-map solution and ignoring the O(1)-space requirement.
:::

::: understand
- Two pointers work here because sorting gives **monotonic** behaviour: moving `l` right only increases the sum, moving `r` left only decreases it.
- It's the inner loop of [3Sum](https://leetcode.com/problems/3sum/) and [4Sum](https://leetcode.com/problems/4sum/), and similar to [Container With Most Water](https://leetcode.com/problems/container-with-most-water/).
:::

::: ask
- *"Is the array guaranteed sorted? Ascending?"*
- *"1-indexed or 0-indexed output?"*
- *"Exactly one answer, or could there be none/many?"*
:::

::: important ⭐ How to explain it in the interview
> "Because the array is sorted, I use two pointers at both ends. If the sum is too big, the right value is too big for any remaining left value, so I move right inward; if it's too small, I move left forward. Each step eliminates one candidate, so it's O(n) time and O(1) space, unlike the hash map version which needs O(n) memory. I return 1-indexed positions as the problem asks."
:::

::: links
LeetCode 167: Two Sum II | https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
NeetCode video: Two Sum II | https://www.youtube.com/results?search_query=neetcode+two+sum+ii
:::

=== Trapping Rain Water
@p 2
@tags two-pointers, prefix-max, hard
@quick
- Water above bar i = `min(maxLeft[i], maxRight[i]) − height[i]`.
- Prefix/suffix max arrays: **O(n) time, O(n) space**.
- Two pointers: move the side with the **smaller max**; its water is fully decided. **O(n) time, O(1) space**.
- A monotonic stack also works (fills "pits" layer by layer).

::: text 🧾 Problem
`height[i]` is the height of a bar of width 1. After it rains, how much water is **trapped between the bars**?

**Example 1:** `[0,1,0,2,1,0,1,3,2,1,2,1] → 6`
**Example 2:** `[4,2,0,3,2,5] → 9`

**Constraints:** 1 ≤ n ≤ 2 × 10⁴, 0 ≤ height ≤ 10⁵.
:::

::: text 🧒 Intuition
Stand on one bar and look **left** and **right**. The water above you can rise only up to the **lower of the two tallest walls** you can see (it would spill over the lower one). If you're taller than that, no water sits on you.

Doing this for every bar is the whole problem. The smart part is computing "tallest wall to my left/right" without looking around again for every bar.
:::

::: text 🐢 Brute force
**Idea:** for each bar, scan left for the tallest wall and scan right for the tallest wall.

`for i: leftMax = max(h[0..i]); rightMax = max(h[i..n-1]); water += min(leftMax, rightMax) - h[i]`

**Complexity:** O(n²): ~4 × 10⁸ steps for n = 2 × 10⁴. We recompute the same maximums again and again.
:::

::: text 💡 Key insight
1. Precompute `maxLeft[i]` (running max from the left) and `maxRight[i]` (running max from the right) in two passes → O(n) time, O(n) space.
2. Better: use **two pointers**. If `leftMax < rightMax`, the water at `l` is decided by `leftMax` alone (there's definitely a taller wall somewhere on the right), so compute it and move `l`. Otherwise do the same on the right. O(1) space.

**Pattern name: Prefix/suffix maximum → Two pointers.**
:::

::: diagram Two pointers with running maxima
flowchart TD
  S["l = 0, r = n-1, leftMax = 0, rightMax = 0, water = 0"] --> L{"l < r?"}
  L -->|"no"| R["return water"]
  L -->|"yes"| C{"height[l] < height[r]?"}
  C -->|"yes"| A["leftMax = max(leftMax, height[l]), water += leftMax - height[l], l++"]
  C -->|"no"| B["rightMax = max(rightMax, height[r]), water += rightMax - height[r], r--"]
  A --> L
  B --> L
:::

::: image Trapping Rain Water: the elevation map traps 6 units
/images/dsa-sliding-window/trapping-rain-water.svg
:::

::: text 🔍 Dry run (prefix/suffix max): [0,1,0,2,1,0,1,3,2,1,2,1]
| i | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| height | 0 | 1 | 0 | 2 | 1 | 0 | 1 | 3 | 2 | 1 | 2 | 1 |
| maxLeft | 0 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 |
| maxRight | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 1 |
| min − height | 0 | 0 | **1** | 0 | **1** | **2** | **1** | 0 | 0 | **1** | 0 | 0 |

Total = 1 + 1 + 2 + 1 + 1 = **6**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Trapping Rain Water with two pointers. Time O(n), Space O(1).
 */
function trap(height) {
  let l = 0, r = height.length - 1;
  let leftMax = 0, rightMax = 0;   // tallest wall seen so far from each side
  let water = 0;
  while (l < r) {
    if (height[l] < height[r]) {
      // The right side has a wall at least as tall as height[l] → the left max decides the water at l
      leftMax = Math.max(leftMax, height[l]);
      water += leftMax - height[l];   // 0 when height[l] is the new max
      l++;
    } else {
      rightMax = Math.max(rightMax, height[r]);
      water += rightMax - height[r];
      r--;
    }
  }
  return water;
}

/** Prefix/suffix max version: O(n) time, O(n) space. Easier to explain first. */
function trapPrefix(height) {
  const n = height.length;
  const maxLeft = new Array(n), maxRight = new Array(n);
  for (let i = 0; i < n; i++) maxLeft[i] = Math.max(height[i], i > 0 ? maxLeft[i - 1] : 0);
  for (let i = n - 1; i >= 0; i--) maxRight[i] = Math.max(height[i], i < n - 1 ? maxRight[i + 1] : 0);
  let water = 0;
  for (let i = 0; i < n; i++) water += Math.min(maxLeft[i], maxRight[i]) - height[i];
  return water;
}

// ---------- tests ----------
const cases = [
  [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1], 6],
  [[4, 2, 0, 3, 2, 5], 9],
  [[], 0],            // empty
  [[5], 0],           // one bar
  [[1, 2, 3, 4], 0],  // rising: nothing trapped
  [[3, 0, 3], 3],
];
for (const [h, expected] of cases) {
  const got = trap(h);
  console.log(JSON.stringify(h), '→', got, got === expected && trapPrefix(h) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 20) }, () => Math.floor(Math.random() * 8));
  if (trap(arr) !== trapPrefix(arr)) allOk = false;
}
console.log('300 random maps: two pointers = prefix/suffix', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Steps: scan left/right for every bar vs one pass
n,Brute force n²,Two pointers n
10,100,10
100,10000,100
1000,1000000,1000
10000,100000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Scan both sides per bar | O(n²) | O(1) | Direct translation of the rule | Slow | First idea |
| **Prefix + suffix max arrays** | **O(n)** | O(n) | Easiest correct O(n) | Two extra arrays | Explaining step by step |
| Monotonic stack | O(n) | O(n) | Fills pits layer by layer | Harder to get right | If asked for a stack solution |
| **Two pointers** | **O(n)** | **O(1)** | Optimal | Needs the "smaller side is decided" argument | Final answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using `max(maxLeft, maxRight)` instead of `min` (water spills over the lower side).
- Forgetting to include the current bar in the running max (can produce negative water).
- Moving the pointer with the **bigger** height in the two-pointer version.
- Empty input or fewer than 3 bars → 0.
:::

::: understand
- "Precompute running maxima from both sides" is the prefix/suffix idea from [Product of Array Except Self](https://leetcode.com/problems/product-of-array-except-self/). Two pointers then remove the arrays, like in [Container With Most Water](https://leetcode.com/problems/container-with-most-water/).
- The stack version relates to [Largest Rectangle in Histogram](https://leetcode.com/problems/largest-rectangle-in-histogram/).
:::

::: ask
- *"Is each bar width 1? Can heights be 0?"*
- *"Is O(n) extra space OK, or do you want O(1)?"*
- *"2-D version?"* (That's [Trapping Rain Water II](https://leetcode.com/problems/trapping-rain-water-ii/), solved with a heap.)
:::

::: important ⭐ How to explain it in the interview
> "The water above each bar is the minimum of the tallest wall on its left and on its right, minus its own height. Brute force recomputes those maxima per bar: O(n²). I can precompute prefix and suffix maxima in O(n) time and space. To get O(1) space I use two pointers: whichever side has the lower wall, its water is fully determined by its own running max, because the other side has something at least that tall. So I add that water and move that pointer. O(n) time, O(1) space."
:::

::: links
LeetCode 42: Trapping Rain Water | https://leetcode.com/problems/trapping-rain-water/
NeetCode video: Trapping Rain Water | https://www.youtube.com/results?search_query=neetcode+trapping+rain+water
:::

=== Maximum Sum Subarray of Size K (fixed window)
@p 2
@tags sliding-window, fixed-window, easy
@quick
- **Fixed sliding window**: sum the first k, then slide: `sum += a[i] − a[i − k]`.
- **O(n) time, O(1) space** (re-summing every window is O(n · k)).
- Record the answer once the window is full (`i >= k − 1`).
- Same template: max average of size k, count windows with a property, anagram windows.

::: text 🧾 Problem
Given an array of numbers and a window size `k`, return the **maximum sum** of any contiguous subarray of exactly `k` elements.

**Example 1:** `[2, 1, 5, 1, 3, 2], k = 3 → 9` (`[5, 1, 3]`).
**Example 2:** `[2, 3, 4, 1, 5], k = 2 → 7` (`[3, 4]`).

**Constraints:** 1 ≤ k ≤ n ≤ 10⁵, values can be negative.
:::

::: text 🧒 Intuition
Imagine a **train of k carriages moving along a track** of numbers. To know the weight of the train after it moves by one, you don't re-weigh every carriage: one carriage left the track behind (subtract it) and one new carriage joined in front (add it).
:::

::: text 🐢 Brute force
**Idea:** for every start, add up the next k numbers.

`for i in 0..n-k:`
↳ `sum = 0; for j in i..i+k-1: sum += a[j]`
↳ `best = max(best, sum)`

**Complexity:** O(n · k). With n = 10⁵ and k = 5 × 10⁴ that's ~2.5 × 10⁹ additions. Two neighbouring windows share k − 1 numbers, yet we re-add them every time.
:::

::: text 💡 Key insight
Window `[i−k+1 .. i]` and window `[i−k .. i−1]` differ by exactly **two** numbers: the one entering (`a[i]`) and the one leaving (`a[i−k]`). So update the sum in O(1): `sum = sum + a[i] − a[i − k]`.

**Pattern name: Fixed-size sliding window.**
:::

::: diagram Slide: add the new, remove the old
flowchart LR
  A["sum of first k"] --> B["for i = k .. n-1"]
  B --> C["sum += a[i] (enters)"]
  C --> D["sum -= a[i-k] (leaves)"]
  D --> E["best = max(best, sum)"]
  E --> B
:::

::: image Fixed window of size 3 over 2 1 5 1 3 2: sums 8 7 9 6
/images/dsa-sliding-window/fixed-window.svg
:::

::: text 🔍 Dry run: [2, 1, 5, 1, 3, 2], k = 3
| i | enters a[i] | leaves a[i−k] | sum | window | best |
|---|---|---|---|---|---|
| 0–2 | 2, 1, 5 | – | 8 | [2, 1, 5] | 8 |
| 3 | 1 | 2 | 8 + 1 − 2 = 7 | [1, 5, 1] | 8 |
| 4 | 3 | 1 | 7 + 3 − 1 = **9** | [5, 1, 3] | **9** |
| 5 | 2 | 5 | 9 + 2 − 5 = 6 | [1, 3, 2] | 9 |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Maximum sum of a window of exactly k elements.
 * Time O(n), Space O(1).
 */
function maxSumWindow(a, k) {
  if (k <= 0 || k > a.length) return null;     // no window of size k exists
  let sum = 0;
  for (let i = 0; i < k; i++) sum += a[i];     // first window
  let best = sum;
  for (let i = k; i < a.length; i++) {
    sum += a[i] - a[i - k];                    // one enters on the right, one leaves on the left
    best = Math.max(best, sum);
  }
  return best;
}

/** Same template: maximum average of size k (LeetCode 643). */
const maxAverage = (a, k) => maxSumWindow(a, k) / k;

/** Brute force for cross-checking: O(n · k). */
function maxSumBrute(a, k) {
  if (k <= 0 || k > a.length) return null;
  let best = -Infinity;
  for (let i = 0; i + k <= a.length; i++) {
    let s = 0;
    for (let j = i; j < i + k; j++) s += a[j];
    best = Math.max(best, s);
  }
  return best;
}

// ---------- tests ----------
const cases = [
  [[2, 1, 5, 1, 3, 2], 3, 9],
  [[2, 3, 4, 1, 5], 2, 7],
  [[-1, -2, -3], 2, -3],   // all negative
  [[5], 1, 5],             // k = n = 1
  [[1, 2], 3, null],       // k bigger than the array
];
for (const [a, k, expected] of cases) {
  const got = maxSumWindow(a, k);
  console.log(JSON.stringify(a), 'k =', k, '→', got, got === expected && maxSumBrute(a, k) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('max average [1,12,-5,-6,50,3], k=4 →', maxAverage([1, 12, -5, -6, 50, 3], 4), maxAverage([1, 12, -5, -6, 50, 3], 4) === 12.75 ? '✅' : '❌ FAIL');
:::

::: chart line Additions with k = n/2: re-sum every window vs slide
n,Re-sum every window k·(n-k+1),Slide ~2n
10,30,20
100,2550,200
1000,250500,2000
10000,25005000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Re-sum every window | O(n · k) | O(1) | Obvious | Slow for large k | Tiny inputs |
| Prefix sums: `prefix[i+k] − prefix[i]` | O(n) | O(n) | Answers any range query fast | Extra array | Many different k / range queries |
| **Sliding window** | **O(n)** | **O(1)** | Optimal, simple | Only one fixed k | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Starting `best = 0`: wrong for all-negative arrays. Start with the first window's sum.
- Off by one: the element leaving is `a[i − k]`, not `a[i − k + 1]`.
- Not handling `k > n` (no valid window).
- Using a sliding window for "sum **equals** k" with negative numbers: that's prefix sums ([Subarray Sum Equals K](https://leetcode.com/problems/subarray-sum-equals-k/)).
:::

::: understand
- The **fixed window** is the simpler of the two sliding-window templates: the window always has k items, so you add one and remove one per step. Used in [Maximum Average Subarray I](https://leetcode.com/problems/maximum-average-subarray-i/), [Find All Anagrams in a String](https://leetcode.com/problems/find-all-anagrams-in-a-string/), [Permutation in String](https://leetcode.com/problems/permutation-in-string/).
- The **variable window** (expand/shrink) is used when the size isn't fixed: [Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/).
:::

::: ask
- *"Is k always ≤ n? What should I return if not?"*
- *"Can values be negative?"*
- *"Sum, average, or the subarray itself?"*
:::

::: important ⭐ How to explain it in the interview
> "Neighbouring windows share k − 1 elements, so I don't re-add them. I sum the first k elements, then slide: add the element entering on the right and subtract the one leaving on the left, updating the best sum each step. That's O(n) time and O(1) space instead of O(n·k). I start best with the first window's sum so negative arrays work."
:::

::: links
LeetCode 643: Maximum Average Subarray I | https://leetcode.com/problems/maximum-average-subarray-i/
NeetCode: sliding window explained | https://www.youtube.com/results?search_query=neetcode+sliding+window
:::

=== Longest Repeating Character Replacement
@p 2
@tags sliding-window, counting, medium
@quick
- Window is valid if `windowLength − maxFreq ≤ k` (letters to replace ≤ k).
- Expand right; if invalid, move left **one** step (the window never shrinks below the best size).
- `maxFreq` doesn't need to decrease when left moves (it only matters when it grows).
- **O(n) time, O(26) space**.

::: text 🧾 Problem
Given an uppercase string `s` and an integer `k`, you may change **at most k characters** to any other uppercase letter. Return the length of the **longest substring** that can be made of one repeated letter.

**Example 1:** `s = "ABAB", k = 2 → 4` (change both A's or both B's).
**Example 2:** `s = "AABABBA", k = 1 → 4` ("AABA" → "AAAA").

**Constraints:** 1 ≤ n ≤ 10⁵, 0 ≤ k ≤ n.
:::

::: text 🧒 Intuition
You're **repainting a row of fence boards** so a stretch is all one colour, but you only have paint for k boards. In any stretch, the cheapest plan is to keep the most common colour and repaint the others. So a stretch is "affordable" if *(stretch length − count of its most common colour) ≤ k*. Slide a window along and find the longest affordable stretch.
:::

::: text 🐢 Brute force
**Idea:** for every substring, count letters and check `length − maxCount ≤ k`.

`for i: counts = zeros; for j ≥ i: counts[s[j]]++; if (j - i + 1) - max(counts) <= k: best = max(best, j - i + 1)`

**Complexity:** O(n² · 26) (or O(n²) if you track the max as you go). For n = 10⁵ that's ~10¹⁰ steps.
:::

::: text 💡 Key insight
Validity only depends on the window length and the count of its most frequent letter, both easy to maintain while sliding. Use the expand/shrink window: add `s[right]`, update `maxFreq`; if the window needs more than k replacements, move `left` one step (removing its count).

Subtle trick: we never need to **lower** `maxFreq` when shrinking. The answer only improves when a window with a **higher** `maxFreq` appears, so a stale, too-high `maxFreq` just keeps the window size the same (never makes the answer wrong).

**Pattern name: Sliding window (variable) + frequency count.**
:::

::: diagram Expand, check, shift
flowchart TD
  S["left = 0, maxFreq = 0, counts = 26 zeros"] --> R{"right = 0 .. n-1"}
  R -->|"done"| E["return n - left (= best window)"]
  R --> A["counts[s[right]]++, maxFreq = max(maxFreq, counts[s[right]])"]
  A --> B{"(right - left + 1) - maxFreq > k?"}
  B -->|"yes"| C["counts[s[left]]--, left++"]
  B -->|"no"| D["best = max(best, right - left + 1)"]
  C --> R
  D --> R
:::

::: image Character replacement: window AABA has 3 As and 1 B, so one replacement makes AAAA
/images/dsa-sliding-window/char-replacement.svg
:::

::: text 🔍 Dry run: s = "AABABBA", k = 1
| right | ch | counts (A,B) | maxFreq | window len | len − maxFreq | action | best |
|---|---|---|---|---|---|---|---|
| 0 | A | 1,0 | 1 | 1 | 0 | ok | 1 |
| 1 | A | 2,0 | 2 | 2 | 0 | ok | 2 |
| 2 | B | 2,1 | 2 | 3 | 1 | ok | 3 |
| 3 | A | 3,1 | 3 | 4 | 1 | ok | **4** |
| 4 | B | 3,2 | 3 | 5 | 2 > 1 | remove s[0]=A, left = 1 | 4 |
| 5 | B | 2,3 | 3 | 5 | 2 > 1 | remove s[1]=A, left = 2 | 4 |
| 6 | A | 2,3 | 3 | 5 | 2 > 1 | remove s[2]=B, left = 3 | 4 |

Answer **4**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Longest Repeating Character Replacement.
 * Time O(n), Space O(26).
 */
function characterReplacement(s, k) {
  const counts = new Array(26).fill(0);  // letter counts inside the window
  let left = 0, maxFreq = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const idx = s.charCodeAt(right) - 65;          // 'A' → 0
    counts[idx]++;
    maxFreq = Math.max(maxFreq, counts[idx]);      // most common letter count seen in a window
    // letters we would have to repaint = window length - most common letter count
    if (right - left + 1 - maxFreq > k) {
      counts[s.charCodeAt(left) - 65]--;           // drop the leftmost letter
      left++;                                      // window shifts (keeps its size)
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}

/** Brute force for cross-checking: O(n² · 26). */
function characterReplacementBrute(s, k) {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const c = new Array(26).fill(0);
    for (let j = i; j < s.length; j++) {
      c[s.charCodeAt(j) - 65]++;
      if (j - i + 1 - Math.max(...c) <= k) best = Math.max(best, j - i + 1);
    }
  }
  return best;
}

// ---------- tests ----------
const cases = [
  ['ABAB', 2, 4],
  ['AABABBA', 1, 4],
  ['AAAA', 0, 4],      // already uniform
  ['ABCD', 0, 1],      // no replacements allowed
  ['A', 5, 1],         // k bigger than the string
  ['ABBB', 2, 4],
];
for (const [s, k, expected] of cases) {
  const got = characterReplacement(s, k);
  console.log(JSON.stringify(s), 'k =', k, '→', got, got === expected && characterReplacementBrute(s, k) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const str = Array.from({ length: 1 + Math.floor(Math.random() * 15) }, () => 'ABC'[Math.floor(Math.random() * 3)]).join('');
  const k = Math.floor(Math.random() * 4);
  if (characterReplacement(str, k) !== characterReplacementBrute(str, k)) allOk = false;
}
console.log('300 random strings match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Window checks: every substring vs sliding window
n,Every substring n²/2,Sliding window n
10,50,10
100,5000,100
1000,500000,1000
10000,50000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Every substring | O(n² · 26) | O(26) | Obvious | Too slow | First idea |
| Binary search on the length + fixed-window check | O(n log n · 26) | O(26) | Shows "binary search on the answer" | Slower | Follow-up discussion |
| Sliding window, recompute max of 26 when shrinking | O(26 · n) | O(26) | Easy to prove correct | Constant factor | If the stale-maxFreq trick feels risky |
| **Sliding window with non-decreasing maxFreq** | **O(n)** | O(26) | Optimal | The trick needs explaining | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Shrinking with a `while` and recomputing `maxFreq` incorrectly (e.g. decrementing it blindly).
- Using the count of `s[right]` instead of the **max** count in the window.
- Off by one in the window length (`right − left + 1`).
- Forgetting that k can be larger than n (answer = n).
:::

::: understand
- "Window length − most common count ≤ k" turns the replacement rule into a validity check, which is all a sliding window needs. Related: [Max Consecutive Ones III](https://leetcode.com/problems/max-consecutive-ones-iii/) (flip at most k zeros), [Longest Substring with At Most K Distinct Characters](https://leetcode.com/problems/longest-substring-with-at-most-k-distinct-characters/).
:::

::: ask
- *"Only uppercase letters?"*
- *"Can k be 0 or larger than the string?"*
- *"Return the length or the resulting substring?"*
:::

::: important ⭐ How to explain it in the interview
> "A window can become one letter if its length minus the count of its most frequent letter is at most k. I slide a window, keeping letter counts and the max frequency. When the window needs more than k replacements, I move left by one, so the window never shrinks below the best size found. I don't need to decrease maxFreq, because a better answer requires a higher max frequency anyway. O(n) time and O(26) space."
:::

::: links
LeetCode 424: Longest Repeating Character Replacement | https://leetcode.com/problems/longest-repeating-character-replacement/
NeetCode video: Longest Repeating Character Replacement | https://www.youtube.com/results?search_query=neetcode+longest+repeating+character+replacement
:::

=== Find All Anagrams in a String
@p 2
@tags sliding-window, fixed-window, counting, medium
@quick
- **Fixed window** of size `p.length` over `s`, with letter counts.
- Slide: add the entering letter, remove the leaving one; compare counts (26 checks) or track a `matches` counter.
- **O(n) time** (O(26 · n) with the simple compare), O(1) space.
- Return all **start indices** where the window is an anagram of p.

::: text 🧾 Problem
Given strings `s` and `p`, return all **start indices** in `s` where a substring is an **anagram** of `p` (same letters, same counts, any order).

**Example 1:** `s = "cbaebabacd", p = "abc" → [0, 6]` ("cba" and "bac").
**Example 2:** `s = "abab", p = "ab" → [0, 1, 2]`.

**Constraints:** 1 ≤ n, m ≤ 3 × 10⁴, lowercase letters.
:::

::: text 🧒 Intuition
You have a **stencil with exactly |p| holes** and a list of letters needed (the counts of p). Slide the stencil across s one letter at a time. Each time it moves, one letter falls out on the left and one comes in on the right. Whenever the letters under the stencil match the needed counts, you've found an anagram.
:::

::: text 🐢 Brute force
**Idea:** for each start i, take `s.slice(i, i + m)` and check if it's an anagram (sort or count).

`for i in 0..n-m: if isAnagram(s.slice(i, i + m), p): result.push(i)`

**Complexity:** O(n · m) with counting (O(n · m log m) with sorting). For n = m/2 = 1.5 × 10⁴: ~2 × 10⁸ steps. Neighbouring windows share m − 1 letters, yet we recount them all.
:::

::: text 💡 Key insight
The window length is fixed (= m), so it's a **fixed sliding window**: keep a 26-count array for the window, update it in O(1) per step (one letter in, one out), and compare it with p's counts. The comparison costs 26 steps, a constant.

**Pattern name: Fixed sliding window + frequency counts.**
:::

::: diagram Slide a window of size m
flowchart TD
  A["need = counts of p, win = 26 zeros"] --> B["for right = 0 .. n-1"]
  B --> C["win[s[right]]++"]
  C --> D{"right >= m?"}
  D -->|"yes"| E["win[s[right - m]]-- (leaves)"]
  D -->|"no"| F{"right >= m - 1 and win equals need?"}
  E --> F
  F -->|"yes"| G["result.push(right - m + 1)"]
  F -->|"no"| B
  G --> B
:::

::: image Find All Anagrams: windows starting at 0 (cba) and 6 (bac) match abc
/images/dsa-sliding-window/find-anagrams.svg
:::

::: text 🔍 Dry run: s = "cbaebabacd", p = "abc" (m = 3)
| right | enters | leaves | window | counts a,b,c,e | matches p? | result |
|---|---|---|---|---|---|---|
| 2 | a | – | cba | 1,1,1,0 | **yes → 0** | [0] |
| 3 | e | c | bae | 1,1,0,1 | no | [0] |
| 4 | b | b | aeb | 1,1,0,1 | no | [0] |
| 5 | a | a | eba | 1,1,0,1 | no | [0] |
| 6 | b | e | bab | 1,2,0,0 | no | [0] |
| 7 | a | b | aba | 2,1,0,0 | no | [0] |
| 8 | c | a | bac | 1,1,1,0 | **yes → 6** | [0, 6] |
| 9 | d | b | acd | 1,0,1,0 (+d) | no | [0, 6] |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Find All Anagrams in a String. Time O(26 · n) = O(n), Space O(26).
 */
function findAnagrams(s, p) {
  const m = p.length, result = [];
  if (m > s.length) return result;
  const need = new Array(26).fill(0), win = new Array(26).fill(0);
  for (const ch of p) need[ch.charCodeAt(0) - 97]++;   // letters we need
  const same = () => need.every((c, i) => c === win[i]); // 26 comparisons
  for (let right = 0; right < s.length; right++) {
    win[s.charCodeAt(right) - 97]++;                     // letter enters on the right
    if (right >= m) win[s.charCodeAt(right - m) - 97]--; // letter leaves on the left
    if (right >= m - 1 && same()) result.push(right - m + 1); // window is full and matches
  }
  return result;
}

/** Brute force for cross-checking: sort every substring of length m and compare. */
function findAnagramsBrute(s, p) {
  const key = [...p].sort().join(''), out = [];
  for (let i = 0; i + p.length <= s.length; i++) if ([...s.slice(i, i + p.length)].sort().join('') === key) out.push(i);
  return out;
}

// ---------- tests ----------
const cases = [
  ['cbaebabacd', 'abc', [0, 6]],
  ['abab', 'ab', [0, 1, 2]],
  ['a', 'ab', []],          // p longer than s
  ['aaaa', 'aa', [0, 1, 2]],
  ['xyz', 'abc', []],       // no common letters
];
for (const [s, p, expected] of cases) {
  const got = findAnagrams(s, p);
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(findAnagramsBrute(s, p)) === JSON.stringify(expected);
  console.log(JSON.stringify(s), JSON.stringify(p), '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Letter operations (m = 100): recount each window vs slide
n,Recount n·m,Slide + compare 26 ~28n
1000,100000,28000
10000,1000000,280000
100000,10000000,2800000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Sort each window | O(n · m log m) | O(m) | Simple | Slowest | Never final |
| Recount each window | O(n · m) | O(26) | Simple | Recounts shared letters | Small m |
| **Slide + compare 26 counts** | **O(26 · n)** | O(26) | Short, clear | 26 comparisons per step | Default answer |
| Slide + `matches` counter | O(n) | O(26) | Strictly linear | Fiddly bookkeeping | Interviewer pushes for pure O(n) |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing before the window is **full** (`right < m − 1`).
- Removing the wrong letter: it's `s[right − m]`.
- Comparing two arrays with `===` or `==` (compares references, always false). Compare element by element.
- Forgetting `p.length > s.length`.
:::

::: understand
- Fixed window + counts is the template for [Permutation in String](https://leetcode.com/problems/permutation-in-string/) (return true at the first match) and [Substring with Concatenation of All Words](https://leetcode.com/problems/substring-with-concatenation-of-all-words/).
- It's [Valid Anagram](https://leetcode.com/problems/valid-anagram/) applied to every window, with O(1) updates instead of recounting.
:::

::: ask
- *"Only lowercase letters?"*
- *"Return start indices in increasing order?"*
- *"Can p be longer than s?"*
:::

::: important ⭐ How to explain it in the interview
> "An anagram window always has length |p|, so I use a fixed sliding window with a 26-count array for the window and one for p. Each step one letter enters and one leaves, an O(1) update, and I compare the two count arrays in 26 steps. When they match, I record the window's start index. O(n) time overall and constant space. To be strictly linear I could track how many of the 26 counts currently match."
:::

::: links
LeetCode 438: Find All Anagrams in a String | https://leetcode.com/problems/find-all-anagrams-in-a-string/
NeetCode video: Find All Anagrams in a String | https://www.youtube.com/results?search_query=neetcode+find+all+anagrams+in+a+string
:::

=== Minimum Window Substring
@p 2
@tags sliding-window, hashmap, hard
@quick
- Variable window: **expand right until valid** (contains all of t with counts), then **shrink left while valid**, recording the smallest.
- Track `formed` (how many distinct letters meet their required count) to check validity in O(1).
- **O(n + m) time**, O(k) space (k = distinct characters).
- Return `""` if no window contains t.

::: text 🧾 Problem
Given strings `s` and `t`, return the **smallest substring of s** that contains **every character of t, including duplicates**. If there's none, return `""`.

**Example 1:** `s = "ADOBECODEBANC", t = "ABC" → "BANC"`
**Example 2:** `s = "a", t = "aa" → ""` (s has only one "a").

**Constraints:** 1 ≤ n, m ≤ 10⁵, upper- and lowercase letters.
:::

::: text 🧒 Intuition
You need a **shopping list** of items (t), and the shop's aisle is a long row of products (s). Walk forward (expand right) until your basket has everything on the list. Then try to drop items from the **start** of your path (shrink left) as long as the basket still has everything, because a shorter path is better. When dropping breaks the list, walk forward again. Remember the shortest complete path you ever had.
:::

::: text 🐢 Brute force
**Idea:** check every substring and test whether it contains t's letters with counts.

`for i: for j ≥ i: if covers(s.slice(i, j + 1), t) → keep the shortest`

**Complexity:** O(n²) substrings × O(n) check = O(n³) (O(n²) if counts are updated incrementally). For n = 10⁵ that's hopeless (10¹⁰ even in the better version).
:::

::: text 💡 Key insight
Once a window `[left, right]` is valid, any bigger window containing it is valid too, so for each `right` we only care about the **smallest valid window ending there**. Expanding right and shrinking left both move forward only → each pointer moves at most n times.

To test "valid" in O(1), count how many distinct letters currently have **enough** copies (`formed`) and compare with how many distinct letters t needs (`required`).

**Pattern name: Sliding window (variable, minimum) + hash map counts.**
:::

::: diagram Expand to valid, shrink to minimal
flowchart TD
  S["need = counts of t, required = distinct letters in t, formed = 0"] --> R{"right = 0 .. n-1"}
  R -->|"done"| E["return best window or empty"]
  R --> A["add s[right], if its count reaches need → formed++"]
  A --> V{"formed === required?"}
  V -->|"no"| R
  V -->|"yes"| B["record window if smaller"]
  B --> C["remove s[left], if its count drops below need → formed--"]
  C --> D["left++"]
  D --> V
:::

::: image Minimum Window Substring: first valid window ADOBEC, best window BANC
/images/dsa-sliding-window/min-window.svg
:::

::: text 🔍 Dry run: s = "ADOBECODEBANC", t = "ABC" (required = 3)
| Phase | right | left | window | formed | event | best |
|---|---|---|---|---|---|---|
| expand | 0–4 | 0 | ADOBE | 2 (A, B) | need C | – |
| expand | 5 | 0 | ADOBEC | 3 | **valid** | ADOBEC (6) |
| shrink | 5 | 1 | DOBEC | 2 | removed A → invalid | ADOBEC |
| expand | 6–9 | 1 | DOBECODEB | 2 | still no A | ADOBEC |
| expand | 10 | 1 | DOBECODEBA | 3 | valid | ADOBEC |
| shrink | 10 | 2…5 | CODEBA | 3 | still valid; CODEBA ties length 6, not smaller | ADOBEC (6) |
| shrink | 10 | 6 | ODEBA | 2 | removed C → invalid | ADOBEC |
| expand | 11–12 | 6 | ODEBANC | 3 | valid | ADOBEC |
| shrink | 12 | 7…9 | DEBANC → EBANC → BANC | 3 | still valid, smaller each time | **BANC (4)** |
| shrink | 12 | 10 | ANC | 2 | removed B → invalid | BANC |

Answer **"BANC"**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Minimum Window Substring. Time O(n + m), Space O(k) (k distinct chars).
 */
function minWindow(s, t) {
  if (t.length === 0 || t.length > s.length) return '';
  const need = new Map();                         // char → copies required
  for (const ch of t) need.set(ch, (need.get(ch) || 0) + 1);
  const required = need.size;                     // distinct chars that must be satisfied
  const have = new Map();                         // char → copies inside the window
  let formed = 0;                                 // distinct chars currently satisfied
  let left = 0, bestLen = Infinity, bestStart = 0;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    have.set(ch, (have.get(ch) || 0) + 1);
    if (need.has(ch) && have.get(ch) === need.get(ch)) formed++; // this char just became satisfied

    while (formed === required) {                 // window is valid → try to shrink it
      if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }
      const out = s[left];
      have.set(out, have.get(out) - 1);
      if (need.has(out) && have.get(out) < need.get(out)) formed--; // we broke a requirement
      left++;
    }
  }
  return bestLen === Infinity ? '' : s.slice(bestStart, bestStart + bestLen);
}

/** Brute force for cross-checking (small inputs only). */
function minWindowBrute(s, t) {
  const covers = (sub) => { const c = {}; for (const ch of sub) c[ch] = (c[ch] || 0) + 1; for (const ch of t) { if (!c[ch]) return false; c[ch]--; } return true; };
  let best = '';
  for (let i = 0; i < s.length; i++)
    for (let j = i; j < s.length; j++) {
      const sub = s.slice(i, j + 1);
      if ((best === '' || sub.length < best.length) && covers(sub)) best = sub;
    }
  return best;
}

// ---------- tests ----------
const cases = [
  ['ADOBECODEBANC', 'ABC', 'BANC'],
  ['a', 'a', 'a'],
  ['a', 'aa', ''],           // not enough copies
  ['ab', 'b', 'b'],
  ['aaflslflsldkalskaaa', 'aaa', 'aaa'],
  ['abc', 'xyz', ''],         // impossible
];
for (const [s, t, expected] of cases) {
  const got = minWindow(s, t);
  console.log(JSON.stringify(s), JSON.stringify(t), '→', JSON.stringify(got), got === expected && minWindowBrute(s, t).length === expected.length ? '✅' : '❌ FAIL expected ' + JSON.stringify(expected));
}
let allOk = true;
for (let k = 0; k < 200; k++) {
  const s = Array.from({ length: 1 + Math.floor(Math.random() * 12) }, () => 'abc'[Math.floor(Math.random() * 3)]).join('');
  const t = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => 'abc'[Math.floor(Math.random() * 3)]).join('');
  if (minWindow(s, t).length !== minWindowBrute(s, t).length) allOk = false;
}
console.log('200 random cases: same length as brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Character steps: all substrings (incremental counts) vs sliding window
n,All substrings ~n²/2,Sliding window ~2n
10,50,20
100,5000,200
1000,500000,2000
10000,50000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Every substring + full check | O(n³) | O(k) | Obvious | Hopeless | Never |
| Every start + incremental counts | O(n²) | O(k) | Simpler logic | Too slow for 10⁵ | Small inputs |
| **Sliding window + `formed` counter** | **O(n + m)** | O(k) | Optimal | Most bookkeeping of all window problems | Default answer |
| Filtered s (only chars in t) + window | O(n + m) | O(n) | Faster when t is tiny and s is huge | Extra list | Optimisation follow-up |
:::

::: warning ⚠️ Common mistakes / edge cases
- Treating t as a **set**: `t = "aa"` needs **two** a's.
- Incrementing `formed` every time a needed char is added (it should happen only when the count **reaches** the requirement).
- Recording the window **after** shrinking past validity.
- Returning `s.slice(bestStart, bestLen)` (slice takes an end index, not a length).
:::

::: understand
- This is the "minimum window" version of the sliding-window template: expand until valid, then shrink while valid. Related: [Minimum Size Subarray Sum](https://leetcode.com/problems/minimum-size-subarray-sum/), [Permutation in String](https://leetcode.com/problems/permutation-in-string/), [Find All Anagrams in a String](https://leetcode.com/problems/find-all-anagrams-in-a-string/).
- The `formed`/`required` counters avoid comparing whole maps on every step.
:::

::: ask
- *"Does t contain duplicates that must all be matched?"*
- *"Case-sensitive?"*
- *"If several windows have the same minimum length, which one?"* (Usually any / the first.)
- *"What to return if there's no valid window?"*
:::

::: important ⭐ How to explain it in the interview
> "I use a variable sliding window with count maps. I expand right, adding characters; when a character's count reaches what t needs I increment 'formed'. When formed equals the number of distinct characters in t, the window is valid, so I record it if it's the smallest, then shrink from the left while it stays valid, decrementing formed when a requirement breaks. Both pointers only move forward, so it's O(n + m) time with O(k) space. If no valid window is found I return the empty string."
:::

::: links
LeetCode 76: Minimum Window Substring | https://leetcode.com/problems/minimum-window-substring/
NeetCode video: Minimum Window Substring | https://www.youtube.com/results?search_query=neetcode+minimum+window+substring
:::
