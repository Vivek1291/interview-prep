@section DSA: Sliding Window & Two Pointers
@icon 🪟
@color #8b5cf6
@desc Tier 3 + Tier 4: window expand/shrink template, fixed windows, anagram windows, 3Sum, container, trapping rain water.

=== Container With Most Water
@p 3
@tags two-pointers, greedy, medium
@quick
- Area = `min(h[l], h[r]) * (r - l)`.
- Start at both ends; **move the shorter line inward** (moving the taller one can never increase the area).
- **O(n) time, O(1) space** vs O(n²) brute force.

::: text
**Problem:** `height[i]` are vertical lines. Pick two lines that, with the x-axis, hold the most water.
`[1,8,6,2,5,4,8,3,7] → 49` (lines at index 1 and 8: min(8,7) × 7 = 49)

### Why move the shorter pointer?
The area is limited by the **shorter** line. If we move the taller line inward, the width shrinks and the height is still capped by the same short line, so the area can only get worse. Moving the shorter line is the only way to maybe find a taller boundary.
:::

::: chart bar Heights [1,8,6,2,5,4,8,3,7]: best container between index 1 and 8
Index,Height
0,1
1,8
2,6
3,2
4,5
5,4
6,8
7,3
8,7
:::

::: code javascript Solution + tests
function maxArea(height) {
  let l = 0, r = height.length - 1, best = 0;
  while (l < r) {
    best = Math.max(best, Math.min(height[l], height[r]) * (r - l));
    if (height[l] < height[r]) l++;
    else r--;
  }
  return best;
}
[[[1, 8, 6, 2, 5, 4, 8, 3, 7], 49], [[1, 1], 1], [[4, 3, 2, 1, 4], 16], [[1, 2, 1], 2]].forEach(([h, e]) =>
  console.log(JSON.stringify(h), maxArea(h), maxArea(h) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Can lines have zero height? Return the area or the indices?"* Explain the greedy proof briefly.
:::

::: links
LeetCode 11 | https://leetcode.com/problems/container-with-most-water/
:::

=== 3Sum
@p 3
@tags two-pointers, sorting, medium
@quick
- **Sort**, fix `i`, then two-pointer search on `i+1…n-1` for `-nums[i]`.
- **Skip duplicates** for i, and after finding a triplet, skip duplicate l and r values.
- Early break when `nums[i] > 0`.
- **O(n²) time**, O(1) extra space (excluding the output / sort).

::: text
**Problem:** Return all **unique** triplets `[a,b,c]` with `a + b + c = 0`.
`[-1,0,1,2,-1,-4] → [[-1,-1,2],[-1,0,1]]`

### Approach
1. Sort: `[-4,-1,-1,0,1,2]`.
2. For each `i` (skip it if it equals the previous value), run **Two Sum II** with two pointers on the rest, target `-nums[i]`.
3. When found, record it and move both pointers past duplicates.

Brute force is O(n³). Sorting + two pointers gives **O(n²)**.
:::

::: code javascript Solution + tests
function threeSum(nums) {
  nums = [...nums].sort((a, b) => a - b);
  const res = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (nums[i] > 0) break;                          // no way to reach 0
    if (i > 0 && nums[i] === nums[i - 1]) continue;  // skip duplicate anchors
    let l = i + 1, r = nums.length - 1;
    while (l < r) {
      const sum = nums[i] + nums[l] + nums[r];
      if (sum < 0) l++;
      else if (sum > 0) r--;
      else {
        res.push([nums[i], nums[l], nums[r]]);
        while (l < r && nums[l] === nums[l + 1]) l++;
        while (l < r && nums[r] === nums[r - 1]) r--;
        l++; r--;
      }
    }
  }
  return res;
}

const norm = (x) => JSON.stringify(x.map((t) => t.join()).sort());
[
  [[-1, 0, 1, 2, -1, -4], [[-1, -1, 2], [-1, 0, 1]]],
  [[0, 1, 1], []],
  [[0, 0, 0, 0], [[0, 0, 0]]],
  [[-2, 0, 1, 1, 2], [[-2, 0, 2], [-2, 1, 1]]],
].forEach(([n, e]) => console.log(JSON.stringify(n), JSON.stringify(threeSum(n)), norm(threeSum(n)) === norm(e) ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Unique triplets only? Return values or indices? Can I sort / modify the input?"* Follow-ups: 3Sum Closest, 4Sum (generalise to kSum).
:::

::: links
LeetCode 15: 3Sum | https://leetcode.com/problems/3sum/
:::

=== Two Sum II (sorted input)
@p 2
@tags two-pointers, sorted, medium
@quick
- Sorted → `l = 0, r = n-1`: sum too small → `l++`, too big → `r--`.
- **O(n) time, O(1) space** (better space than the HashMap version).
- LeetCode returns **1-indexed** positions.

::: code javascript Solution + tests
function twoSumSorted(numbers, target) {
  let l = 0, r = numbers.length - 1;
  while (l < r) {
    const sum = numbers[l] + numbers[r];
    if (sum === target) return [l + 1, r + 1]; // 1-indexed
    if (sum < target) l++;
    else r--;
  }
  return [];
}
[[[2, 7, 11, 15], 9, '1,2'], [[2, 3, 4], 6, '1,3'], [[-1, 0], -1, '1,2']].forEach(([n, t, e]) =>
  console.log(JSON.stringify(n), t, twoSumSorted(n, t).join(), twoSumSorted(n, t).join() === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"1-indexed or 0-indexed? Guaranteed exactly one solution?"*
:::

::: links
LeetCode 167 | https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
:::

=== Trapping Rain Water
@p 2
@tags two-pointers, prefix-max, hard
@quick
- Water above i = `min(maxLeft[i], maxRight[i]) - height[i]`.
- Prefix/suffix max arrays: O(n) time, O(n) space.
- **Two pointers**: move the side with the **smaller max**; that side's water is determined → **O(n) time, O(1) space**.
- Also solvable with a monotonic stack.

::: text
**Problem:** Given elevation bars, compute how much rain water is trapped.
`[0,1,0,2,1,0,1,3,2,1,2,1] → 6`

### Key formula
`water[i] = min(highest bar to the left, highest bar to the right) - height[i]` (if positive).

### Two-pointer optimisation
Keep `leftMax` and `rightMax`. If `leftMax < rightMax`, the water at `l` is bounded by `leftMax` (because there's a taller wall somewhere on the right), so compute it and move `l`. Otherwise do the same from the right.
:::

::: chart bar Elevation [0,1,0,2,1,0,1,3,2,1,2,1] and trapped water
Index,Bar,Water
0,0,0
1,1,0
2,0,1
3,2,0
4,1,1
5,0,2
6,1,1
7,3,0
8,2,0
9,1,1
10,2,0
11,1,0
:::

::: code javascript Solution + tests
function trap(height) {
  let l = 0, r = height.length - 1;
  let leftMax = 0, rightMax = 0, water = 0;
  while (l < r) {
    if (height[l] < height[r]) {
      leftMax = Math.max(leftMax, height[l]);
      water += leftMax - height[l];
      l++;
    } else {
      rightMax = Math.max(rightMax, height[r]);
      water += rightMax - height[r];
      r--;
    }
  }
  return water;
}

// prefix/suffix version (easier to explain first)
function trapPrefix(h) {
  const n = h.length, L = Array(n).fill(0), R = Array(n).fill(0);
  for (let i = 0; i < n; i++) L[i] = Math.max(h[i], i ? L[i - 1] : 0);
  for (let i = n - 1; i >= 0; i--) R[i] = Math.max(h[i], i < n - 1 ? R[i + 1] : 0);
  return h.reduce((sum, x, i) => sum + Math.min(L[i], R[i]) - x, 0);
}

[[[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1], 6], [[4, 2, 0, 3, 2, 5], 9], [[], 0], [[3, 2, 1], 0]].forEach(([h, e]) =>
  console.log(JSON.stringify(h), trap(h), trap(h) === e && trapPrefix(h) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Can heights be zero or empty? O(1) space required?"* Start with the prefix-max idea, then optimise.
:::

::: links
LeetCode 42 | https://leetcode.com/problems/trapping-rain-water/
:::

=== Maximum Sum Subarray of Size K (fixed window)
@p 2
@tags sliding-window, fixed-window, easy
@quick
- Fixed-size window: sum the first k, then slide: `sum += a[i] - a[i-k]`.
- **O(n)** instead of O(n·k).
- Template for all "window of size k" problems (averages, max/min with a deque, anagram windows).

::: code javascript Solution + tests
function maxSumSubarrayK(arr, k) {
  if (k > arr.length) return null;
  let sum = 0;
  for (let i = 0; i < k; i++) sum += arr[i];
  let best = sum, bestStart = 0;
  for (let i = k; i < arr.length; i++) {
    sum += arr[i] - arr[i - k];               // slide: add new, remove old
    if (sum > best) { best = sum; bestStart = i - k + 1; }
  }
  return { best, window: arr.slice(bestStart, bestStart + k) };
}

[[[2, 1, 5, 1, 3, 2], 3, 9], [[2, 3, 4, 1, 5], 2, 7], [[-1, -2, -3], 2, -3]].forEach(([a, k, e]) => {
  const r = maxSumSubarrayK(a, k);
  console.log(JSON.stringify(a), 'k=' + k, r.best, JSON.stringify(r.window), r.best === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Can k exceed the length? Negative numbers?"* Follow-up: max of every window → **monotonic deque** (LeetCode 239).
:::

::: links
Sliding window maximum (LeetCode 239) | https://leetcode.com/problems/sliding-window-maximum/
:::

=== Longest Repeating Character Replacement
@p 2
@tags sliding-window, counting, medium
@quick
- Window is valid if `windowLength - maxFreqInWindow <= k` (replace the others).
- Expand right, update counts & `maxFreq`; if invalid, move left once.
- `maxFreq` doesn't need decreasing (the answer only grows when a bigger maxFreq appears). **O(n)**.

::: code javascript Solution + tests
function characterReplacement(s, k) {
  const count = new Map();
  let left = 0, maxFreq = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    count.set(s[right], (count.get(s[right]) || 0) + 1);
    maxFreq = Math.max(maxFreq, count.get(s[right]));
    while (right - left + 1 - maxFreq > k) {          // too many chars to replace
      count.set(s[left], count.get(s[left]) - 1);
      left++;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
[['ABAB', 2, 4], ['AABABBA', 1, 4], ['AAAA', 0, 4], ['ABCDE', 1, 2]].forEach(([s, k, e]) =>
  console.log(s, 'k=' + k, characterReplacement(s, k), characterReplacement(s, k) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Uppercase letters only? k can be 0?"*
:::

::: links
LeetCode 424 | https://leetcode.com/problems/longest-repeating-character-replacement/
:::

=== Find All Anagrams in a String
@p 2
@tags sliding-window, fixed-window, counting, medium
@quick
- Fixed window of size `p.length`; maintain letter counts for the window and for p.
- Track `matches` (number of letters whose counts are equal) → O(1) comparison per slide.
- Simpler: compare 26-length arrays each slide (O(26·n) = O(n)).

::: code javascript Solution + tests
function findAnagrams(s, p) {
  const res = [];
  if (p.length > s.length) return res;
  const need = new Array(26).fill(0), win = new Array(26).fill(0);
  const idx = (c) => c.charCodeAt(0) - 97;
  for (const c of p) need[idx(c)]++;

  for (let r = 0; r < s.length; r++) {
    win[idx(s[r])]++;
    if (r >= p.length) win[idx(s[r - p.length])]--;           // drop the char leaving the window
    if (r >= p.length - 1 && win.every((v, i) => v === need[i])) res.push(r - p.length + 1);
  }
  return res;
}
[['cbaebabacd', 'abc', '0,6'], ['abab', 'ab', '0,1,2'], ['a', 'ab', '']].forEach(([s, p, e]) =>
  console.log(s, p, findAnagrams(s, p).join(), findAnagrams(s, p).join() === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Lowercase only? Return start indices?"* Related: Permutation in String (LeetCode 567) = the same check with a boolean result.
:::

::: links
LeetCode 438 | https://leetcode.com/problems/find-all-anagrams-in-a-string/
:::

=== Minimum Window Substring
@p 2
@tags sliding-window, hashmap, hard
@quick
- Expand right until the window **contains all chars of t** (with counts); then **shrink left** while still valid, recording the smallest.
- Track `formed` = number of chars whose required count is satisfied → O(1) validity check.
- **O(|s| + |t|)** time.

::: text
**Problem:** Smallest substring of `s` containing every character of `t` (including duplicates).
`s = "ADOBECODEBANC", t = "ABC" → "BANC"`

### Variable window: expand, then shrink
1. `need` = counts of t; `required` = number of distinct chars in t.
2. Expand `right`: update `have`; when `have[c] === need[c]`, `formed++`.
3. While `formed === required`: record the window, then remove `s[left]` and move `left++` (if a count drops below need, `formed--`).
:::

::: code javascript Solution + tests
function minWindow(s, t) {
  if (!t.length || t.length > s.length) return '';
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);
  const have = new Map();
  let formed = 0, required = need.size;
  let left = 0, best = [Infinity, 0, 0];

  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    have.set(c, (have.get(c) || 0) + 1);
    if (need.has(c) && have.get(c) === need.get(c)) formed++;

    while (formed === required) {
      if (right - left + 1 < best[0]) best = [right - left + 1, left, right];
      const d = s[left];
      have.set(d, have.get(d) - 1);
      if (need.has(d) && have.get(d) < need.get(d)) formed--;
      left++;
    }
  }
  return best[0] === Infinity ? '' : s.slice(best[1], best[2] + 1);
}
[['ADOBECODEBANC', 'ABC', 'BANC'], ['a', 'a', 'a'], ['a', 'aa', ''], ['aaflslflsldkalskaaa', 'aaa', 'aaa']].forEach(([s, t, e]) =>
  console.log(s, t, JSON.stringify(minWindow(s, t)), minWindow(s, t) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Case-sensitive? Duplicates in t count? Return any minimum if there are ties?"*
:::

::: links
LeetCode 76 | https://leetcode.com/problems/minimum-window-substring/
:::
