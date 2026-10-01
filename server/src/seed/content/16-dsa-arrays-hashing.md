@section DSA: Arrays, Strings & Hashing
@icon 🧮
@color #6366f1
@desc Tier 1 + Tier 2: hash map, set, prefix sum, Kadane and sorting patterns. Every solution runs with tests (▶ Run).

=== How to approach any DSA problem (patterns + Big-O cheat sheet)
@p 3
@tags patterns, big-o, approach
@quick
- Flow: **clarify → brute force → find bottleneck → optimise → code → test → time → space**.
- Pattern triggers: fast lookup → **HashMap/Set** · sorted + pair relation → **Two pointers** · contiguous subarray/substring → **Sliding window** · subarray sums → **Prefix sum + HashMap** · next greater → **Monotonic stack** · sorted/answer-space → **Binary search** · top K → **Heap** · grid/graph → **BFS/DFS** · choices/all combos → **Backtracking** · overlapping subproblems → **DP**.
- Big-O ladder: O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!).
- n ≤ 10⁵ usually needs O(n log n) or better.

::: text
### The 8-step interview flow
1. **Clarify**: input size, types, duplicates, negatives, empty input, sorted?, what to return (index vs value), modify in place?
2. **Brute force**: state it and its complexity, even if it's bad.
3. **Identify the bottleneck**: *"the nested loop searches for the complement, so can I look it up in O(1)?"*
4. **Optimise**: pick a pattern (table below).
5. **Write clean code**: meaningful names, small helpers.
6. **Test** with examples + edge cases (empty, one element, duplicates, negatives, large).
7. **Time complexity**
8. **Space complexity**

### Pattern recognition
| If you see… | Think… |
|---|---|
| "Find pair/complement", "seen before?", counting | **HashMap / Set** |
| Sorted array, pair with target, palindromes | **Two pointers** |
| Longest/shortest **contiguous** substring/subarray with a condition | **Sliding window** |
| Subarray **sum equals K**, range sums | **Prefix sum + HashMap** |
| Next greater/smaller element, temperatures | **Monotonic stack** |
| Sorted input, "minimum capacity/speed that works" | **Binary search** (on index or on answer) |
| Top/Kth largest, merge K sorted, streaming median | **Heap** |
| Grid islands, shortest path, dependencies | **BFS / DFS / topological sort** |
| All combinations/permutations/subsets | **Backtracking** |
| Count ways / min cost with overlapping subproblems | **Dynamic programming** |
:::

::: chart line Operations vs input size (log scale feel)
n,O(log n),O(n),O(n log n),O(n²)
10,3,10,33,100
100,7,100,664,10000
1000,10,1000,9966,1000000
10000,13,10000,132877,100000000
:::

::: code javascript Feel the difference: O(n²) vs O(n) for Two Sum on 20,000 numbers
const n = 20000;
const nums = Array.from({ length: n }, (_, i) => i);
const target = (n - 1) + (n - 2);

function bruteForce(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
}
function hashMap(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}
console.time('O(n²) brute force'); console.log(bruteForce(nums, target)); console.timeEnd('O(n²) brute force');
console.time('O(n) hash map    '); console.log(hashMap(nums, target)); console.timeEnd('O(n) hash map    ');
:::

::: ask
- Always ask before coding: *"Can the input be empty? Negative numbers? Duplicates? Is it sorted? Can I modify it? Return indices or values? Is there always exactly one answer?"*
:::

::: links
Big-O cheat sheet | https://www.bigocheatsheet.com
NeetCode roadmap | https://neetcode.io/roadmap
LeetCode patterns (Sean Prashad) | https://seanprashad.com/leetcode-patterns/
:::

=== Two Sum
@p 3
@tags hashmap, array, easy
@quick
- Brute O(n²): check all pairs.
- Optimal **O(n) time / O(n) space**: one pass with a Map `value → index`; check `target - x` **before** inserting x.
- Sorted input variant → two pointers, O(1) space (Two Sum II).
- Return **indices**, not values.

::: text
**Problem:** Given `nums` and `target`, return the **indices** of the two numbers that add up to `target`. Exactly one solution; you can't use the same element twice.
`nums = [2,7,11,15], target = 9 → [0,1]`

### Approach
- **Brute force:** two nested loops → **O(n²)**.
- **Bottleneck:** for each `x`, we *search* for `target - x`. A HashMap makes that search **O(1)**.
- **One pass:** iterate; if `target - x` is already in the map, return; otherwise store `x → i`. Checking before storing prevents using the same element twice.

| | Time | Space |
|---|---|---|
| Brute force | O(n²) | O(1) |
| HashMap | **O(n)** | O(n) |
:::

::: code javascript Solution + tests
function twoSum(nums, target) {
  const seen = new Map(); // value → index
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}

const tests = [
  [[2, 7, 11, 15], 9, [0, 1]],
  [[3, 2, 4], 6, [1, 2]],
  [[3, 3], 6, [0, 1]],
  [[-1, -2, -3, -4, -5], -8, [2, 4]],
];
for (const [nums, target, expected] of tests) {
  const got = twoSum(nums, target);
  console.log(JSON.stringify(nums), target, '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
:::

::: ask
- *"Is there always exactly one solution? Can there be duplicates? Is the array sorted?"* (Sorted → two pointers, O(1) space.) *"Return indices or values?"*
:::

::: links
LeetCode 1: Two Sum | https://leetcode.com/problems/two-sum/
:::

=== Contains Duplicate
@p 3
@tags set, array, easy
@quick
- **Set**: if you've seen it → true. **O(n) time, O(n) space**.
- Sorting alternative: O(n log n) time, O(1) extra space (mutates / needs copy).
- One-liner: `new Set(nums).size !== nums.length`.

::: text
**Problem:** Return `true` if any value appears at least twice.
`[1,2,3,1] → true`, `[1,2,3,4] → false`

| Approach | Time | Space |
|---|---|---|
| Nested loops | O(n²) | O(1) |
| Sort + compare neighbours | O(n log n) | O(1)–O(n) |
| **HashSet** | **O(n)** | O(n) |

The early-exit Set loop beats `new Set(nums).size` when a duplicate appears early.
:::

::: code javascript Solution + tests
function containsDuplicate(nums) {
  const seen = new Set();
  for (const n of nums) {
    if (seen.has(n)) return true; // early exit
    seen.add(n);
  }
  return false;
}
const containsDuplicateOneLiner = (nums) => new Set(nums).size !== nums.length;

const cases = [[[1, 2, 3, 1], true], [[1, 2, 3, 4], false], [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2], true], [[], false]];
for (const [input, exp] of cases) {
  const a = containsDuplicate(input), b = containsDuplicateOneLiner(input);
  console.log(JSON.stringify(input), a, a === exp && b === exp ? '✅' : '❌ FAIL');
}
:::

::: ask
- *"Is memory constrained?"* Then sort in place, O(1) extra space. *"Within distance k?"* → Contains Duplicate II (sliding window Set).
:::

::: links
LeetCode 217: Contains Duplicate | https://leetcode.com/problems/contains-duplicate/
:::

=== Valid Anagram
@p 3
@tags hashmap, string, counting, easy
@quick
- Different lengths → false.
- Count chars: +1 for s, −1 for t; all counts must be 0. **O(n) time, O(1) space** for a fixed alphabet (26).
- Sort both and compare: O(n log n).
- Unicode input → use a Map instead of a 26-slot array.

::: text
**Problem:** Is `t` an anagram of `s` (same letters, same counts)?
`s = "anagram", t = "nagaram" → true`; `"rat","car" → false`

### Approach
Count frequencies with a single array of 26 (lowercase letters): increment for `s`, decrement for `t`. If any count is non-zero → false.

| Approach | Time | Space |
|---|---|---|
| Sort both strings | O(n log n) | O(n) |
| **Count array / Map** | **O(n)** | O(1) (26 letters) |
:::

::: code javascript Solution + tests
function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const count = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    count[s.charCodeAt(i) - 97]++;
    count[t.charCodeAt(i) - 97]--;
  }
  return count.every((c) => c === 0);
}

// Unicode-safe version with Map
function isAnagramUnicode(s, t) {
  if (s.length !== t.length) return false;
  const m = new Map();
  for (const ch of s) m.set(ch, (m.get(ch) || 0) + 1);
  for (const ch of t) {
    if (!m.get(ch)) return false;
    m.set(ch, m.get(ch) - 1);
  }
  return true;
}

[['anagram', 'nagaram', true], ['rat', 'car', false], ['a', 'ab', false], ['', '', true]].forEach(([s, t, e]) =>
  console.log(s, t, isAnagram(s, t), isAnagram(s, t) === e && isAnagramUnicode(s, t) === e ? '✅' : '❌ FAIL'));
console.log('unicode:', isAnagramUnicode('नमस्ते', 'स्तेनम'));
:::

::: ask
- *"Lowercase English only, or Unicode? Case-sensitive? Ignore spaces/punctuation?"*
:::

::: links
LeetCode 242: Valid Anagram | https://leetcode.com/problems/valid-anagram/
:::

=== Group Anagrams
@p 3
@tags hashmap, string, medium
@quick
- Group words by a **canonical key** in a Map: sorted letters (`"aet"`) or a 26-count signature (`"1#0#0…"`).
- Sorted key: O(n · k log k); count key: **O(n · k)**, where k = word length.
- Return `[...map.values()]`.

::: text
**Problem:** Group strings that are anagrams of each other.
`["eat","tea","tan","ate","nat","bat"] → [["eat","tea","ate"],["tan","nat"],["bat"]]`

### Approach
Anagrams share the same **signature**. Use it as a Map key:
- **Sorted string**: `"eat" → "aet"`, cost O(k log k) per word.
- **Letter-count key**: `"eat" → "1#0#0#0#1#…#1…"`, O(k) per word (better for long words).

| | Time | Space |
|---|---|---|
| Sorted key | O(n · k log k) | O(n · k) |
| Count key | **O(n · k)** | O(n · k) |
:::

::: code javascript Solution + tests
function groupAnagrams(strs) {
  const groups = new Map();
  for (const word of strs) {
    const count = new Array(26).fill(0);
    for (const ch of word) count[ch.charCodeAt(0) - 97]++;
    const key = count.join('#');           // e.g. "1#0#0#0#1#...": unique per letter-multiset
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(word);
  }
  return [...groups.values()];
}

// Simpler sorted-key version
const groupAnagramsSorted = (strs) => {
  const m = new Map();
  for (const w of strs) {
    const k = [...w].sort().join('');
    m.set(k, [...(m.get(k) || []), w]);
  }
  return [...m.values()];
};

const normalize = (groups) => JSON.stringify(groups.map((g) => [...g].sort()).sort());
const input = ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'];
console.log(groupAnagrams(input));
console.log(normalize(groupAnagrams(input)) === normalize([['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]) ? '✅' : '❌ FAIL');
console.log(normalize(groupAnagramsSorted(input)) === normalize(groupAnagrams(input)) ? '✅ both approaches agree' : '❌ FAIL');
console.log(JSON.stringify(groupAnagrams([''])), JSON.stringify(groupAnagrams(['a'])));
:::

::: ask
- *"Does the output order matter? Only lowercase letters?"*
:::

::: links
LeetCode 49: Group Anagrams | https://leetcode.com/problems/group-anagrams/
:::

=== Best Time to Buy and Sell Stock
@p 3
@tags array, greedy, sliding-window, easy
@quick
- Track the **minimum price so far**; profit = price − minSoFar; keep the max.
- **O(n) time, O(1) space**, one pass.
- You must buy before you sell; return 0 if no profit.
- Variants: unlimited transactions (sum all positive diffs), with cooldown/fee (DP).

::: text
**Problem:** `prices[i]` is the price on day i. Choose one day to buy and a **later** day to sell. Return the max profit (0 if none).
`[7,1,5,3,6,4] → 5` (buy at 1, sell at 6)

### Approach
While scanning left to right, the best buy day for selling today is the **cheapest day so far**. So maintain `minPrice` and `maxProfit`.

This is a **sliding window** in disguise: the left pointer = the buy day (move it when a cheaper price appears), the right pointer = the sell day.

| | Time | Space |
|---|---|---|
| Try all pairs | O(n²) | O(1) |
| **One pass** | **O(n)** | O(1) |
:::

::: chart line Prices [7,1,5,3,6,4]: buy at the min, sell at the peak after it
Day,Price,Min so far
1,7,7
2,1,1
3,5,1
4,3,1
5,6,1
6,4,1
:::

::: code javascript Solution + tests
function maxProfit(prices) {
  let minPrice = Infinity;
  let best = 0;
  for (const price of prices) {
    if (price < minPrice) minPrice = price;          // better day to buy
    else best = Math.max(best, price - minPrice);    // sell today?
  }
  return best;
}

// Variant II: unlimited transactions → collect every upward move
const maxProfitUnlimited = (prices) => prices.reduce((sum, p, i) => sum + (i > 0 ? Math.max(0, p - prices[i - 1]) : 0), 0);

[[[7, 1, 5, 3, 6, 4], 5], [[7, 6, 4, 3, 1], 0], [[2, 4, 1], 2], [[1], 0]].forEach(([p, e]) =>
  console.log(JSON.stringify(p), maxProfit(p), maxProfit(p) === e ? '✅' : '❌ FAIL'));
console.log('unlimited [7,1,5,3,6,4] =', maxProfitUnlimited([7, 1, 5, 3, 6, 4]), maxProfitUnlimited([7, 1, 5, 3, 6, 4]) === 7 ? '✅' : '❌ FAIL');
:::

::: ask
- *"One transaction or many? Fees or cooldown? Can I short-sell?"*
:::

::: links
LeetCode 121 | https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
:::

=== Maximum Subarray (Kadane's algorithm)
@p 3
@tags kadane, dp, array, medium
@quick
- Kadane: `current = max(x, current + x)`; `best = max(best, current)`.
- Idea: a negative running sum only hurts, so **restart** from the current element.
- **O(n) time, O(1) space**. Initialise with `nums[0]` (handles all-negative arrays).
- Track start/end indices if asked for the subarray itself.

::: text
**Problem:** Find the contiguous subarray with the **largest sum**.
`[-2,1,-3,4,-1,2,1,-5,4] → 6` (subarray `[4,-1,2,1]`)

### Kadane's insight
At each index, the best subarray **ending here** is either:
- just this element (start fresh), or
- this element + the best subarray ending at the previous index.

So `cur = max(x, cur + x)`. The answer is the max `cur` seen. It's DP with O(1) memory.

| | Time | Space |
|---|---|---|
| All subarrays | O(n²) | O(1) |
| Divide & conquer | O(n log n) | O(log n) |
| **Kadane** | **O(n)** | O(1) |
:::

::: chart bar Running sum with restart (Kadane) for [-2,1,-3,4,-1,2,1,-5,4]
Index,Value,Best ending here
0,-2,-2
1,1,1
2,-3,-2
3,4,4
4,-1,3
5,2,5
6,1,6
7,-5,1
8,4,5
:::

::: code javascript Solution + tests (with indices)
function maxSubArray(nums) {
  let cur = nums[0], best = nums[0];
  let start = 0, bestStart = 0, bestEnd = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > cur + nums[i]) { cur = nums[i]; start = i; } // restart
    else cur += nums[i];                                        // extend
    if (cur > best) { best = cur; bestStart = start; bestEnd = i; }
  }
  return { sum: best, subarray: nums.slice(bestStart, bestEnd + 1) };
}

[
  [[-2, 1, -3, 4, -1, 2, 1, -5, 4], 6],
  [[1], 1],
  [[5, 4, -1, 7, 8], 23],
  [[-3, -1, -2], -1], // all negative
].forEach(([n, e]) => {
  const r = maxSubArray(n);
  console.log(JSON.stringify(n), '→', r.sum, JSON.stringify(r.subarray), r.sum === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Can all numbers be negative?"* (Then don't initialise best to 0.) *"Return the sum or the subarray? Non-empty subarray required?"*
:::

::: links
LeetCode 53: Maximum Subarray | https://leetcode.com/problems/maximum-subarray/
:::

=== Move Zeroes
@p 3
@tags two-pointers, in-place, easy
@quick
- Two pointers: `write` = the next position for a non-zero; scan with `read`; swap non-zeros forward.
- Keeps the **relative order** of non-zeros; **in place**; **O(n) time, O(1) space**.
- Swapping (vs overwrite + fill zeros) minimises writes.

::: text
**Problem:** Move all `0`s to the end **in place** while keeping the order of the non-zero elements.
`[0,1,0,3,12] → [1,3,12,0,0]`

### Approach: read/write pointers
- `write` marks where the next non-zero should go.
- For each `read` index with a non-zero value, swap `nums[read]` and `nums[write]`, then `write++`.
- Everything before `write` is non-zero (in order); everything after is zero.
:::

::: code javascript Solution + tests
function moveZeroes(nums) {
  let write = 0;
  for (let read = 0; read < nums.length; read++) {
    if (nums[read] !== 0) {
      [nums[write], nums[read]] = [nums[read], nums[write]];
      write++;
    }
  }
  return nums; // modified in place
}

[[[0, 1, 0, 3, 12], [1, 3, 12, 0, 0]], [[0], [0]], [[1, 2, 3], [1, 2, 3]], [[0, 0, 1], [1, 0, 0]]].forEach(([n, e]) => {
  const input = JSON.stringify(n);
  const out = moveZeroes(n);
  console.log(input, '→', JSON.stringify(out), JSON.stringify(out) === JSON.stringify(e) ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Must it be in place? Must the order of non-zeros be preserved?"* (If not, it's even simpler.)
:::

::: links
LeetCode 283: Move Zeroes | https://leetcode.com/problems/move-zeroes/
:::

=== Merge Sorted Arrays
@p 3
@tags two-pointers, merge, easy
@quick
- LeetCode 88: `nums1` has space at the end → merge **from the back** with 3 pointers (i = m-1, j = n-1, k = m+n-1).
- Filling from the end avoids overwriting unprocessed values. **O(m+n) time, O(1) space**.
- The loop runs while `j >= 0` (leftover nums1 items are already in place).
- New array version: standard merge step of merge sort.

::: text
**Problem:** `nums1` has length `m + n` (the last n slots are 0), `nums2` has length n. Both are sorted. Merge `nums2` into `nums1` **in place**, sorted.
`nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3 → [1,2,2,3,5,6]`

### Why go backwards?
The empty space is at the **end** of nums1. Placing the **largest** remaining element at position `k` from the back never overwrites an element we still need.
:::

::: code javascript Solution + tests
function merge(nums1, m, nums2, n) {
  let i = m - 1, j = n - 1, k = m + n - 1;
  while (j >= 0) {
    if (i >= 0 && nums1[i] > nums2[j]) nums1[k--] = nums1[i--];
    else nums1[k--] = nums2[j--];
  }
  return nums1;
}

// Classic merge into a new array (merge-sort step)
function mergeNew(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]);
  return out.concat(a.slice(i), b.slice(j));
}

const t1 = merge([1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3);
console.log(JSON.stringify(t1), JSON.stringify(t1) === '[1,2,2,3,5,6]' ? '✅' : '❌ FAIL');
const t2 = merge([0], 0, [1], 1);
console.log(JSON.stringify(t2), JSON.stringify(t2) === '[1]' ? '✅' : '❌ FAIL');
const t3 = merge([4, 5, 6, 0, 0, 0], 3, [1, 2, 3], 3);
console.log(JSON.stringify(t3), JSON.stringify(t3) === '[1,2,3,4,5,6]' ? '✅' : '❌ FAIL');
console.log('new array:', JSON.stringify(mergeNew([1, 4, 7], [2, 3, 8, 9])));
:::

::: ask
- *"In place into nums1, or return a new array?"* *"Can there be duplicates / negative numbers?"*
:::

::: links
LeetCode 88: Merge Sorted Array | https://leetcode.com/problems/merge-sorted-array/
:::

=== Remove Duplicates from Sorted Array
@p 2
@tags two-pointers, in-place, easy
@quick
- Sorted → duplicates are adjacent. `write` pointer for the next unique slot; copy when `nums[read] !== nums[write-1]`.
- Return `k` (the count of uniques); the first k elements are the answer. **O(n) / O(1)**.
- Variant "at most 2 duplicates": compare with `nums[write-2]`.

::: code javascript Solution + tests
function removeDuplicates(nums) {
  if (nums.length === 0) return 0;
  let write = 1;
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) nums[write++] = nums[read];
  }
  return write;
}

// Allow each element at most twice (LeetCode 80)
function removeDuplicatesII(nums) {
  let write = 0;
  for (const x of nums) if (write < 2 || x !== nums[write - 2]) nums[write++] = x;
  return write;
}

const a = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4];
const k = removeDuplicates(a);
console.log(k, JSON.stringify(a.slice(0, k)), k === 5 && a.slice(0, k).join() === '0,1,2,3,4' ? '✅' : '❌ FAIL');
const b = [1, 1, 1, 2, 2, 3];
const k2 = removeDuplicatesII(b);
console.log(k2, JSON.stringify(b.slice(0, k2)), b.slice(0, k2).join() === '1,1,2,2,3' ? '✅' : '❌ FAIL');
:::

::: ask
- *"Is the array guaranteed sorted?"* (If not → Set, O(n) space.) *"What should the remaining slots contain?"*
:::

::: links
LeetCode 26 | https://leetcode.com/problems/remove-duplicates-from-sorted-array/
:::

=== Rotate Array
@p 2
@tags array, reverse, in-place, medium
@quick
- `k = k % n` first!
- Reverse trick: reverse all → reverse the first k → reverse the rest. **O(n) time, O(1) space**.
- Extra-array version: `result[(i + k) % n] = nums[i]` (O(n) space).

::: text
**Problem:** Rotate the array to the right by `k` steps.
`[1,2,3,4,5,6,7], k = 3 → [5,6,7,1,2,3,4]`

### Reverse trick (why it works)
1. Reverse the whole array: `[7,6,5,4,3,2,1]`, which moves the last k elements to the front (reversed).
2. Reverse the first k: `[5,6,7, 4,3,2,1]`.
3. Reverse the remaining n−k: `[5,6,7, 1,2,3,4]` ✅
:::

::: code javascript Solution + tests
function rotate(nums, k) {
  const n = nums.length;
  k %= n;
  const reverse = (l, r) => { while (l < r) { [nums[l], nums[r]] = [nums[r], nums[l]]; l++; r--; } };
  reverse(0, n - 1);
  reverse(0, k - 1);
  reverse(k, n - 1);
  return nums;
}

[[[1, 2, 3, 4, 5, 6, 7], 3, '5,6,7,1,2,3,4'], [[-1, -100, 3, 99], 2, '3,99,-1,-100'], [[1, 2], 5, '2,1']].forEach(([n, k, e]) => {
  const out = rotate([...n], k).join();
  console.log(JSON.stringify(n), 'k=' + k, '→', out, out === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Right or left rotation? Can k be larger than n? In place required?"*
:::

::: links
LeetCode 189: Rotate Array | https://leetcode.com/problems/rotate-array/
:::

=== Product of Array Except Self
@p 3
@tags prefix, suffix, array, medium
@quick
- `answer[i]` = product of everything to the **left** × product of everything to the **right**.
- Pass 1: prefix products into answer; pass 2 (right→left): multiply by the running suffix.
- **O(n) time, O(1) extra space** (the output doesn't count); **no division** (handles zeros).
- Division approach breaks with zeros → interviewers forbid it.

::: text
**Problem:** Return `answer` where `answer[i]` = product of all elements except `nums[i]`. No division; O(n).
`[1,2,3,4] → [24,12,8,6]`

### Prefix × suffix
| i | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| nums | 1 | 2 | 3 | 4 |
| prefix (product left of i) | 1 | 1 | 2 | 6 |
| suffix (product right of i) | 24 | 12 | 4 | 1 |
| **answer = prefix × suffix** | **24** | **12** | **8** | **6** |
:::

::: code javascript Solution + tests
function productExceptSelf(nums) {
  const n = nums.length;
  const answer = new Array(n).fill(1);
  let prefix = 1;
  for (let i = 0; i < n; i++) { answer[i] = prefix; prefix *= nums[i]; }
  let suffix = 1;
  for (let i = n - 1; i >= 0; i--) { answer[i] *= suffix; suffix *= nums[i]; }
  return answer;
}

[[[1, 2, 3, 4], '24,12,8,6'], [[-1, 1, 0, -3, 3], '0,0,9,0,0'], [[2, 3], '3,2']].forEach(([n, e]) => {
  const out = productExceptSelf(n).map((x) => (Object.is(x, -0) ? 0 : x)).join();
  console.log(JSON.stringify(n), '→', out, out === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Is division allowed? Can there be zeros? Does the output array count as extra space?"*
:::

::: links
LeetCode 238 | https://leetcode.com/problems/product-of-array-except-self/
:::

=== Longest Substring Without Repeating Characters
@p 3
@tags sliding-window, hashmap, string, medium
@quick
- Sliding window `[left, right]` with a Map `char → last index`.
- On a repeat inside the window: `left = lastIndex + 1` (never move left backwards: use `max`).
- Answer = max window length. **O(n) time, O(min(n, alphabet)) space**.
- Template: expand right → shrink left while invalid → update the answer.

::: text
**Problem:** Length of the longest substring with all distinct characters.
`"abcabcbb" → 3 ("abc")`, `"bbbbb" → 1`, `"pwwkew" → 3 ("wke")`

### Sliding window
- Expand `right` one char at a time.
- If the char was seen **inside the current window** (`last[ch] >= left`), jump `left` past its previous occurrence.
- Track `best = max(best, right - left + 1)`.

Each character is visited at most twice → O(n).
:::

::: diagram Window on "abcabcbb"
flowchart LR
  A["a b c → window abc, len 3"] --> B["see a again: left jumps past first a → bca"]
  B --> C["see b again: left jumps → cab"]
  C --> D["... best stays 3"]
:::

::: code javascript Solution + tests
function lengthOfLongestSubstring(s) {
  const last = new Map(); // char → last index seen
  let left = 0, best = 0, bestStart = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (last.has(ch) && last.get(ch) >= left) left = last.get(ch) + 1; // shrink
    last.set(ch, right);
    if (right - left + 1 > best) { best = right - left + 1; bestStart = left; }
  }
  return { length: best, substring: s.slice(bestStart, bestStart + best) };
}

[['abcabcbb', 3], ['bbbbb', 1], ['pwwkew', 3], ['', 0], ['abba', 2], ['dvdf', 3]].forEach(([s, e]) => {
  const r = lengthOfLongestSubstring(s);
  console.log(JSON.stringify(s), r.length, JSON.stringify(r.substring), r.length === e ? '✅' : '❌ FAIL');
});
:::

::: code javascript Generic sliding-window template (memorise this)
function slidingWindowTemplate(arr) {
  let left = 0, best = 0;
  const state = new Map();                 // whatever the window needs to know
  for (let right = 0; right < arr.length; right++) {
    // 1) expand: add arr[right] to state
    state.set(arr[right], (state.get(arr[right]) || 0) + 1);
    // 2) shrink while the window is invalid
    while (state.get(arr[right]) > 1) {
      state.set(arr[left], state.get(arr[left]) - 1);
      left++;
    }
    // 3) update the answer
    best = Math.max(best, right - left + 1);
  }
  return best;
}
console.log('template on "abcabcbb":', slidingWindowTemplate('abcabcbb'), slidingWindowTemplate('abcabcbb') === 3 ? '✅' : '❌ FAIL');
:::

::: ask
- *"What character set: ASCII, Unicode? Case-sensitive? Return the length or the substring?"*
:::

::: links
LeetCode 3 | https://leetcode.com/problems/longest-substring-without-repeating-characters/
:::

=== Valid Palindrome
@p 2
@tags two-pointers, string, easy
@quick
- Two pointers from both ends; **skip non-alphanumeric**; compare lowercase.
- **O(n) time, O(1) space** (vs building a cleaned reversed string: O(n) space).
- Variant II: allow deleting one char → on mismatch try skipping left OR right.

::: code javascript Solution + tests
function isPalindrome(s) {
  const isAlnum = (c) => /[a-z0-9]/i.test(c);
  let l = 0, r = s.length - 1;
  while (l < r) {
    while (l < r && !isAlnum(s[l])) l++;
    while (l < r && !isAlnum(s[r])) r--;
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;
    l++; r--;
  }
  return true;
}

// Variant: can delete at most one character (LeetCode 680)
function validPalindromeII(s) {
  const check = (l, r) => { while (l < r) if (s[l++] !== s[r--]) return false; return true; };
  let l = 0, r = s.length - 1;
  while (l < r) {
    if (s[l] !== s[r]) return check(l + 1, r) || check(l, r - 1);
    l++; r--;
  }
  return true;
}

[['A man, a plan, a canal: Panama', true], ['race a car', false], [' ', true], ['0P', false]].forEach(([s, e]) =>
  console.log(JSON.stringify(s), isPalindrome(s), isPalindrome(s) === e ? '✅' : '❌ FAIL'));
[['aba', true], ['abca', true], ['abc', false]].forEach(([s, e]) =>
  console.log('II', s, validPalindromeII(s), validPalindromeII(s) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Ignore case and non-alphanumeric characters? Unicode letters?"*
:::

::: links
LeetCode 125 | https://leetcode.com/problems/valid-palindrome/
:::

=== Longest Palindromic Substring
@p 2
@tags two-pointers, expand-around-center, string, medium
@quick
- **Expand around center**: every palindrome has a center: 2n−1 centers (each char and each gap).
- Expand while `s[l] === s[r]`; track the longest. **O(n²) time, O(1) space**.
- DP table also O(n²) but O(n²) space; Manacher's is O(n) (rarely expected).

::: code javascript Solution + tests
function longestPalindrome(s) {
  if (s.length < 2) return s;
  let start = 0, maxLen = 1;
  const expand = (l, r) => {
    while (l >= 0 && r < s.length && s[l] === s[r]) { l--; r++; }
    const len = r - l - 1;               // window is (l, r) exclusive
    if (len > maxLen) { maxLen = len; start = l + 1; }
  };
  for (let i = 0; i < s.length; i++) {
    expand(i, i);       // odd length, center = char
    expand(i, i + 1);   // even length, center = gap
  }
  return s.slice(start, start + maxLen);
}

[['babad', ['bab', 'aba']], ['cbbd', ['bb']], ['a', ['a']], ['forgeeksskeegfor', ['geeksskeeg']]].forEach(([s, ok]) => {
  const r = longestPalindrome(s);
  console.log(s, '→', r, ok.includes(r) ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Return the substring or its length? Any valid answer if there are ties?"*
:::

::: links
LeetCode 5 | https://leetcode.com/problems/longest-palindromic-substring/
:::

=== Reverse a String
@p 2
@tags two-pointers, string, easy
@quick
- In place (char array): swap `l` and `r` moving inward. **O(n) time, O(1) space**.
- JS strings are **immutable**: `[...s].reverse().join('')` (spread handles Unicode surrogate pairs better than `split('')`).
- Follow-ups: reverse words in a sentence, recursive reverse, reverse only vowels.

::: code javascript Solutions + tests
// LeetCode 344: reverse char array in place
function reverseString(chars) {
  let l = 0, r = chars.length - 1;
  while (l < r) { [chars[l], chars[r]] = [chars[r], chars[l]]; l++; r--; }
  return chars;
}

const reverseStr = (s) => [...s].reverse().join('');                    // Unicode-friendly
const reverseRecursive = (s) => (s === '' ? '' : reverseRecursive(s.slice(1)) + s[0]);
const reverseWords = (s) => s.trim().split(/\s+/).reverse().join(' ');  // LeetCode 151

console.log(reverseString(['h', 'e', 'l', 'l', 'o']).join('') === 'olleh' ? '✅' : '❌ FAIL', 'in place');
console.log(reverseStr('hello') === 'olleh' ? '✅' : '❌ FAIL', reverseStr('hello'));
console.log('emoji safe:', reverseStr('ab😀'), '| split("") breaks it:', 'ab😀'.split('').reverse().join(''));
console.log(reverseRecursive('abc') === 'cba' ? '✅' : '❌ FAIL', 'recursive');
console.log(reverseWords('  the sky   is blue ') === 'blue is sky the' ? '✅' : '❌ FAIL', reverseWords('  the sky   is blue '));
:::

::: ask
- *"Input is a string or char array? In place? Unicode/emoji?"*
:::

::: links
LeetCode 344 | https://leetcode.com/problems/reverse-string/
:::

=== First Unique Character in a String
@p 2
@tags hashmap, counting, easy
@quick
- Two passes: count frequencies → return the first index with count 1. **O(n) time, O(1) space** (26 letters).
- Return -1 if none.

::: code javascript Solution + tests
function firstUniqChar(s) {
  const count = new Map();
  for (const ch of s) count.set(ch, (count.get(ch) || 0) + 1);
  for (let i = 0; i < s.length; i++) if (count.get(s[i]) === 1) return i;
  return -1;
}
[['leetcode', 0], ['loveleetcode', 2], ['aabb', -1]].forEach(([s, e]) =>
  console.log(s, firstUniqChar(s), firstUniqChar(s) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Streaming input?"* Then keep a count map + a queue of candidates (first unique in a stream).
:::

::: links
LeetCode 387 | https://leetcode.com/problems/first-unique-character-in-a-string/
:::

=== Intersection of Two Arrays
@p 2
@tags set, hashmap, easy
@quick
- Unique intersection: Set of one array, filter the other → **O(n + m)**.
- With duplicates (II): count map of one, decrement while scanning the other.
- Sorted inputs: two pointers, O(1) extra space.

::: code javascript Solutions + tests
// LeetCode 349: unique elements
function intersection(a, b) {
  const setA = new Set(a);
  return [...new Set(b.filter((x) => setA.has(x)))];
}

// LeetCode 350: keep duplicates as many times as they appear in both
function intersect(a, b) {
  const count = new Map();
  for (const x of a) count.set(x, (count.get(x) || 0) + 1);
  const res = [];
  for (const x of b) if (count.get(x) > 0) { res.push(x); count.set(x, count.get(x) - 1); }
  return res;
}

const sorted = (arr) => JSON.stringify([...arr].sort((x, y) => x - y));
console.log(sorted(intersection([1, 2, 2, 1], [2, 2])) === '[2]' ? '✅' : '❌ FAIL', intersection([1, 2, 2, 1], [2, 2]));
console.log(sorted(intersection([4, 9, 5], [9, 4, 9, 8, 4])) === '[4,9]' ? '✅' : '❌ FAIL');
console.log(sorted(intersect([1, 2, 2, 1], [2, 2])) === '[2,2]' ? '✅' : '❌ FAIL', intersect([1, 2, 2, 1], [2, 2]));
:::

::: ask
- *"Unique results or with multiplicity? Are the inputs sorted? Is one array much larger?"* (Put the smaller one in the Set.)
:::

::: links
LeetCode 349 | https://leetcode.com/problems/intersection-of-two-arrays/
:::

=== Longest Consecutive Sequence
@p 2
@tags set, hashing, medium
@quick
- Put everything in a Set; only start counting from numbers where **`n-1` is not in the set** (a sequence start).
- Count up while `n+1` exists. Each number is visited at most twice → **O(n)**.
- Sorting is O(n log n): the interviewer asks for O(n).

::: code javascript Solution + tests
function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const n of set) {
    if (set.has(n - 1)) continue;          // not a sequence start
    let len = 1;
    while (set.has(n + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}
[[[100, 4, 200, 1, 3, 2], 4], [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1], 9], [[], 0], [[1, 2, 0, 1], 3]].forEach(([n, e]) =>
  console.log(JSON.stringify(n), longestConsecutive(n), longestConsecutive(n) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Duplicates? Negative numbers? O(n) required?"*
:::

::: links
LeetCode 128 | https://leetcode.com/problems/longest-consecutive-sequence/
:::

=== Top K Frequent Elements
@p 3
@tags hashmap, heap, bucket-sort, medium
@quick
- Count with a Map, then either: sort by count O(n log n), **min-heap of size k** O(n log k), or **bucket sort** by frequency **O(n)**.
- Bucket: `buckets[freq] = [nums…]`; walk from the highest freq down until k are collected.
- Say all three and their trade-offs; code the bucket (or heap) version.

::: text
**Problem:** Return the `k` most frequent elements.
`nums = [1,1,1,2,2,3], k = 2 → [1,2]`

| Approach | Time | Space | Note |
|---|---|---|---|
| Count + sort | O(n log n) | O(n) | Simplest |
| Count + **min-heap size k** | O(n log k) | O(n + k) | Great when k ≪ n; works for streams |
| Count + **bucket sort** | **O(n)** | O(n) | Frequencies are bounded by n |
:::

::: code javascript Solution (bucket sort) + tests
function topKFrequent(nums, k) {
  const count = new Map();
  for (const n of nums) count.set(n, (count.get(n) || 0) + 1);

  const buckets = Array.from({ length: nums.length + 1 }, () => []); // index = frequency
  for (const [num, freq] of count) buckets[freq].push(num);

  const result = [];
  for (let f = buckets.length - 1; f > 0 && result.length < k; f--) {
    for (const num of buckets[f]) {
      result.push(num);
      if (result.length === k) break;
    }
  }
  return result;
}

const s = (a) => JSON.stringify([...a].sort((x, y) => x - y));
console.log(topKFrequent([1, 1, 1, 2, 2, 3], 2), s(topKFrequent([1, 1, 1, 2, 2, 3], 2)) === '[1,2]' ? '✅' : '❌ FAIL');
console.log(topKFrequent([1], 1), s(topKFrequent([1], 1)) === '[1]' ? '✅' : '❌ FAIL');
console.log(topKFrequent([4, 4, 4, 5, 5, 6, 6, 6, 6], 1), s(topKFrequent([4, 4, 4, 5, 5, 6, 6, 6, 6], 1)) === '[6]' ? '✅' : '❌ FAIL');
:::

::: ask
- *"Is the answer unique? Any order OK? Is k always valid? Is it a stream?"* (Stream → heap.)
:::

::: links
LeetCode 347 | https://leetcode.com/problems/top-k-frequent-elements/
:::

=== Subarray Sum Equals K
@p 3
@tags prefix-sum, hashmap, medium
@quick
- Prefix sum `P`: subarray (i, j] sums to k ⇔ `P[j] - P[i] = k` ⇔ **count of earlier prefixes equal to `P[j] - k`**.
- Map `prefixSum → frequency`, start with `{0: 1}` (a subarray starting at index 0).
- **O(n) time, O(n) space**; works with **negative numbers** (a sliding window does NOT).

::: text
**Problem:** Count contiguous subarrays whose sum equals `k`.
`nums = [1,1,1], k = 2 → 2`, `nums = [1,2,3], k = 3 → 2`

### Why not a sliding window?
With **negative numbers**, expanding/shrinking a window doesn't change the sum monotonically, so the window logic fails.

### Prefix sum + HashMap
- Running sum `sum` after index j.
- If some earlier prefix equals `sum - k`, the elements between them sum to k.
- `count += seen[sum - k]`, then `seen[sum]++`.
- `seen = {0: 1}` handles subarrays that start at index 0.
:::

::: code javascript Solution + tests
function subarraySum(nums, k) {
  const seen = new Map([[0, 1]]); // prefixSum → how many times
  let sum = 0, count = 0;
  for (const n of nums) {
    sum += n;
    count += seen.get(sum - k) || 0;
    seen.set(sum, (seen.get(sum) || 0) + 1);
  }
  return count;
}

// brute force for verification O(n²)
const brute = (nums, k) => { let c = 0; for (let i = 0; i < nums.length; i++) { let s = 0; for (let j = i; j < nums.length; j++) { s += nums[j]; if (s === k) c++; } } return c; };

[[[1, 1, 1], 2, 2], [[1, 2, 3], 3, 2], [[1, -1, 0], 0, 3], [[3, 4, 7, 2, -3, 1, 4, 2], 7, 4]].forEach(([n, k, e]) =>
  console.log(JSON.stringify(n), 'k=' + k, subarraySum(n, k), subarraySum(n, k) === e && brute(n, k) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Can numbers be negative?"* (This decides prefix sum vs sliding window.) *"Count them or return them?"*
:::

::: links
LeetCode 560 | https://leetcode.com/problems/subarray-sum-equals-k/
:::
