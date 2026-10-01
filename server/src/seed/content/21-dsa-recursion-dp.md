@section DSA: Recursion, Backtracking & DP
@icon 🔁
@color #0891b2
@desc Tier 9 + Tier 12: the choose → explore → un-choose template (subsets, permutations, combination sum, parentheses, word search) and the classic DP problems (stairs, robber, coins, LIS, LCS) from recursion to memo to table.

=== Backtracking template: Subsets
@p 2
@tags backtracking, recursion, subsets
@quick
- **Template**: `choose → explore → un-choose`: `path.push(x); backtrack(...); path.pop()`.
- Subsets: every element is either **in or out** → 2ⁿ subsets; record `[...path]` at **every** node.
- **O(n · 2ⁿ)** time (2ⁿ subsets × copy cost), O(n) recursion depth.
- Always push a **copy** (`[...path]`), not `path` itself.

::: text 🧾 Problem
Given an array of **distinct** integers, return **all possible subsets** (the power set), in any order, without duplicates.

**Example 1:** `[1, 2, 3] → [[], [1], [2], [1,2], [3], [1,3], [2,3], [1,2,3]]`
**Example 2:** `[0] → [[], [0]]`

**Constraints:** 1 ≤ n ≤ 10 (2¹⁰ = 1024 subsets).

*Backtracking = build a solution step by step, and **undo** the last step when you go back to try another option.*
:::

::: text 🧒 Intuition
You're packing for a trip and deciding item by item: **take the sunglasses or not? take the umbrella or not?** Each decision splits your possibilities in two, which draws a **decision tree**. Walking every path of that tree (and unpacking the last item when you walk back up) lists every possible packing.
:::

::: text 🐢 Brute force
**Idea:** count from 0 to 2ⁿ − 1 and use the binary digits as "in / out" flags (bitmask).

`for mask in 0..2ⁿ−1: subset = elements where bit i of mask is 1`

**Complexity:** also O(n · 2ⁿ): there's no faster way because the **output itself** has 2ⁿ subsets. The bitmask version is fine; the point of this question is learning the **backtracking template**, which also handles problems where bitmasks don't fit (constraints, pruning, permutations).
:::

::: text 💡 Key insight
Every backtracking problem has the same skeleton: a `path` (current partial answer), a set of **choices** at each step, and an **undo** after exploring each choice. For subsets, the choices at each step are "add one of the remaining elements (with a bigger index)", and every node of the tree is itself a valid subset.

**Pattern name: Backtracking (DFS over a decision tree).**
:::

::: diagram Choose → explore → un-choose
flowchart TD
  A["backtrack(start)"] --> B["record a copy of path (every node is a subset)"]
  B --> C{"for i = start .. n-1"}
  C --> D["choose: path.push(nums[i])"]
  D --> E["explore: backtrack(i + 1)"]
  E --> F["un-choose: path.pop()"]
  F --> C
  C -->|"loop done"| G["return"]
:::

::: image Subsets: decision tree of include / exclude for 1 2 3 with 8 leaves
/images/dsa-recursion-dp/subsets.svg
:::

::: text 🔍 Dry run: nums = [1, 2, 3] (start-index version)
| Call | path at entry | recorded | next choices |
|---|---|---|---|
| bt(0) | [] | [] | 1, 2, 3 |
| bt(1) | [1] | [1] | 2, 3 |
| bt(2) | [1, 2] | [1, 2] | 3 |
| bt(3) | [1, 2, 3] | [1, 2, 3] | none → return, pop 3, pop 2 |
| bt(3) | [1, 3] | [1, 3] | none → pop 3, pop 1 |
| bt(2) | [2] | [2] | 3 |
| bt(3) | [2, 3] | [2, 3] | none |
| bt(3) | [3] | [3] | none |

8 subsets recorded.
:::

::: code javascript Backtracking + bitmask versions with tests (runnable)
/**
 * Subsets with the backtracking template. Time O(n · 2^n), Space O(n) recursion (+ output).
 */
function subsets(nums) {
  const result = [];
  const path = [];                    // the subset we're building right now
  function backtrack(start) {
    result.push([...path]);           // every node of the tree is a valid subset → record a COPY
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);             // choose nums[i]
      backtrack(i + 1);               // explore: only later elements (no duplicates like [2,1])
      path.pop();                     // un-choose: undo before trying the next element
    }
  }
  backtrack(0);
  return result;
}

/** Bitmask version: bit i of mask = "is nums[i] in the subset?". */
function subsetsBitmask(nums) {
  const out = [];
  for (let mask = 0; mask < 1 << nums.length; mask++) {
    out.push(nums.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

/** Variant: Subsets II (input has duplicates) → sort, skip equal siblings. */
function subsetsWithDup(input) {
  const nums = [...input].sort((a, b) => a - b), out = [], path = [];
  (function bt(start) {
    out.push([...path]);
    for (let i = start; i < nums.length; i++) {
      if (i > start && nums[i] === nums[i - 1]) continue; // same value at the same level → skip
      path.push(nums[i]); bt(i + 1); path.pop();
    }
  })(0);
  return out;
}

// ---------- tests ----------
const norm = (sets) => JSON.stringify(sets.map((s) => [...s].sort((a, b) => a - b).join(',')).sort());
const cases = [
  [[1, 2, 3], [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]],
  [[0], [[], [0]]],
  [[], [[]]],
];
for (const [nums, expected] of cases) {
  const a = subsets(nums), b = subsetsBitmask(nums);
  console.log(JSON.stringify(nums), '→', JSON.stringify(a), norm(a) === norm(expected) && norm(b) === norm(expected) ? '✅' : '❌ FAIL');
}
const dup = subsetsWithDup([1, 2, 2]);
console.log('with duplicates [1,2,2] →', JSON.stringify(dup), norm(dup) === norm([[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]) ? '✅' : '❌ FAIL');
console.log('n = 10 → count', subsets([...Array(10).keys()]).length, subsets([...Array(10).keys()]).length === 1024 ? '✅' : '❌ FAIL');
:::

::: chart line Number of subsets (= minimum work) as n grows: 2ⁿ
n,Subsets 2^n,Elements copied n·2^(n-1)
5,32,80
10,1024,5120
15,32768,245760
20,1048576,10485760
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| **Backtracking (start index)** | **O(n · 2ⁿ)** | O(n) stack | Template reused everywhere, easy pruning | Recursion | Default answer |
| Include / exclude recursion | O(n · 2ⁿ) | O(n) | Mirrors the decision tree exactly | Records only at leaves | Explaining the idea |
| Bitmask loop | O(n · 2ⁿ) | O(1) extra | No recursion | Only for n ≤ ~30, no pruning | Small n, iterative code |
| Iterative "double the list" | O(n · 2ⁿ) | O(1) extra | Very short | Less general | Quick answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- `result.push(path)` instead of a **copy**: every entry ends up as the same (finally empty) array.
- Forgetting `path.pop()` (the un-choose step) → paths keep growing.
- Starting the loop at 0 instead of `start` → duplicates like `[1,2]` and `[2,1]`.
- With duplicate input values, not sorting + skipping equal siblings ([Subsets II](https://leetcode.com/problems/subsets-ii/)).
:::

::: understand
- The same template solves [Permutations](https://leetcode.com/problems/permutations/), [Combination Sum](https://leetcode.com/problems/combination-sum/), [Combinations](https://leetcode.com/problems/combinations/), [Palindrome Partitioning](https://leetcode.com/problems/palindrome-partitioning/), [N-Queens](https://leetcode.com/problems/n-queens/). Only the **choices** and the **stop/record condition** change.
- Exponential output = exponential time: that's expected, not a bad solution.
:::

::: ask
- *"Are the numbers distinct?"* (Duplicates → Subsets II.)
- *"Does the order of subsets or of elements inside a subset matter?"*
- *"How big is n?"* (n > 20 means millions of subsets.)
:::

::: important ⭐ How to explain it in the interview
> "I use the backtracking template: a path array, and a function that first records a copy of the path, because every node of the decision tree is a valid subset, then loops over the remaining elements from a start index: push the element, recurse with i + 1, and pop it to undo. The start index prevents reordered duplicates. There are 2ⁿ subsets and copying each costs up to n, so O(n · 2ⁿ) time, O(n) recursion depth."
:::

::: links
LeetCode 78: Subsets | https://leetcode.com/problems/subsets/
LeetCode 90: Subsets II | https://leetcode.com/problems/subsets-ii/
NeetCode video: Subsets | https://www.youtube.com/results?search_query=neetcode+subsets
:::

=== Permutations
@p 2
@tags backtracking, permutations
@quick
- At each position pick any **unused** element (`used[i]` boolean array); record when `path.length === n`.
- n! permutations → **O(n · n!)** time; O(n) extra space besides the output.
- Alternative: **swap-based** in place: swap `nums[start]` with each `nums[i ≥ start]`, recurse, swap back.
- Duplicates in the input (Permutations II): sort + skip `nums[i] === nums[i−1] && !used[i−1]`.

::: text 🧾 Problem
Given an array of **distinct** integers, return **all permutations** (all orderings), in any order.

**Example 1:** `[1, 2, 3] → [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]`
**Example 2:** `[0, 1] → [[0,1],[1,0]]`

**Constraints:** 1 ≤ n ≤ 6 (6! = 720).
:::

::: text 🧒 Intuition
Seating **3 guests in 3 chairs**: for the first chair you can pick any of the 3 guests; for the second chair, any of the 2 who are still standing; the last chair gets the remaining guest. 3 × 2 × 1 = 6 seatings. Backtracking walks this: seat someone, fill the rest, then **stand them back up** to try the next guest in that chair.
:::

::: text 🐢 Brute force
**Idea:** generate every sequence of n elements **with repetition** (n nested choices = nⁿ sequences) and keep only those without repeated elements.

**Complexity:** O(n · nⁿ). For n = 6: 6⁶ = 46,656 sequences to get 720 permutations (65× wasted); for n = 10: 10¹⁰ vs 3.6 × 10⁶.
:::

::: text 💡 Key insight
Track which elements are **already in the path** (a `used` array). At each level only unused elements are choices, so every branch of the tree is a valid partial permutation and no work is wasted: the tree has exactly n! leaves.

**Pattern name: Backtracking with a "used" set.**
:::

::: diagram Choose an unused element per position
flowchart TD
  A["backtrack()"] --> B{"path.length === n?"}
  B -->|"yes"| R["record a copy, return"]
  B -->|"no"| C{"for each i with used[i] false"}
  C --> D["used[i] = true, path.push(nums[i])"]
  D --> E["backtrack()"]
  E --> F["path.pop(), used[i] = false"]
  F --> C
:::

::: image Permutations: 3 then 2 then 1 choices give 6 permutations of 1 2 3
/images/dsa-recursion-dp/permutations.svg
:::

::: text 🔍 Dry run: nums = [1, 2, 3] (first branch)
| Depth | path | used | choices tried |
|---|---|---|---|
| 0 | [] | – | 1, 2, 3 |
| 1 | [1] | {1} | 2, 3 |
| 2 | [1, 2] | {1, 2} | 3 |
| 3 | [1, 2, 3] | all | record **[1,2,3]**, back up |
| 2 | [1, 3] | {1, 3} | 2 |
| 3 | [1, 3, 2] | all | record **[1,3,2]**, back up to depth 0 |
| 1 | [2] | {2} | 1, 3 → [2,1,3], [2,3,1] |
| 1 | [3] | {3} | 1, 2 → [3,1,2], [3,2,1] |
:::

::: code javascript Optimal solutions with tests (runnable)
/**
 * Permutations with a used[] array. Time O(n · n!), Space O(n) besides the output.
 */
function permute(nums) {
  const result = [], path = [];
  const used = new Array(nums.length).fill(false);
  function backtrack() {
    if (path.length === nums.length) {   // every position filled
      result.push([...path]);             // record a copy
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;              // already placed in this permutation
      used[i] = true; path.push(nums[i]); // choose
      backtrack();                        // explore the next position
      path.pop(); used[i] = false;        // un-choose
    }
  }
  backtrack();
  return result;
}

/** Swap-based version: positions [0..start) are fixed. */
function permuteSwap(input) {
  const nums = [...input], out = [];
  (function bt(start) {
    if (start === nums.length) { out.push([...nums]); return; }
    for (let i = start; i < nums.length; i++) {
      [nums[start], nums[i]] = [nums[i], nums[start]]; // put nums[i] at position start
      bt(start + 1);
      [nums[start], nums[i]] = [nums[i], nums[start]]; // swap back (un-choose)
    }
  })(0);
  return out;
}

/** Permutations II (duplicates allowed). */
function permuteUnique(input) {
  const nums = [...input].sort((a, b) => a - b), out = [], path = [], used = new Array(nums.length).fill(false);
  (function bt() {
    if (path.length === nums.length) { out.push([...path]); return; }
    for (let i = 0; i < nums.length; i++) {
      if (used[i] || (i > 0 && nums[i] === nums[i - 1] && !used[i - 1])) continue; // skip duplicate branches
      used[i] = true; path.push(nums[i]); bt(); path.pop(); used[i] = false;
    }
  })();
  return out;
}

// ---------- tests ----------
const norm = (ps) => JSON.stringify(ps.map((p) => p.join(',')).sort());
const p3 = permute([1, 2, 3]);
console.log('[1,2,3] →', JSON.stringify(p3), norm(p3) === norm([[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) && norm(permuteSwap([1, 2, 3])) === norm(p3) ? '✅' : '❌ FAIL');
console.log('[0,1] →', JSON.stringify(permute([0, 1])), permute([0, 1]).length === 2 ? '✅' : '❌ FAIL');
console.log('[1] →', JSON.stringify(permute([1])), JSON.stringify(permute([1])) === '[[1]]' ? '✅' : '❌ FAIL');
console.log('n = 6 →', permute([1, 2, 3, 4, 5, 6]).length, 'permutations', permute([1, 2, 3, 4, 5, 6]).length === 720 ? '✅' : '❌ FAIL');
const u = permuteUnique([1, 1, 2]);
console.log('unique [1,1,2] →', JSON.stringify(u), norm(u) === norm([[1, 1, 2], [1, 2, 1], [2, 1, 1]]) ? '✅' : '❌ FAIL');
:::

::: chart line Sequences generated: all n^n sequences then filter vs backtracking (n!)
n,Filter n^n,Backtracking n!
3,27,6
5,3125,120
7,823543,5040
8,16777216,40320
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Generate nⁿ, filter | O(n · nⁿ) | O(n) | Simple loops | Massive waste | Never |
| **Backtracking + used[]** | **O(n · n!)** | O(n) | Clear, extends to duplicates | Extra used array | Default answer |
| Swap in place | O(n · n!) | O(n) stack | No used array | Output order less intuitive; duplicates trickier | Memory-tight |
| Next-permutation loop | O(n · n!) | O(1) extra | Iterative, lexicographic order | Must know the algorithm | "Lexicographic order" required |
:::

::: warning ⚠️ Common mistakes / edge cases
- Pushing `path` instead of a copy.
- Forgetting to reset `used[i] = false` when backtracking.
- In the swap version, forgetting to **swap back**.
- n! grows fast: n = 10 already gives 3.6 million results; ask about n.
:::

::: understand
- "Choose from what's left" appears in [Permutations II](https://leetcode.com/problems/permutations-ii/), [Next Permutation](https://leetcode.com/problems/next-permutation/), [N-Queens](https://leetcode.com/problems/n-queens/) (one queen per row, unused columns), [Letter Case Permutation](https://leetcode.com/problems/letter-case-permutation/).
:::

::: ask
- *"Are the numbers distinct?"*
- *"Any required order of the output?"*
- *"How big can n be?"*
:::

::: important ⭐ How to explain it in the interview
> "I backtrack position by position. I keep the current path and a used array; at each level I loop over all elements, skip the used ones, choose one by marking it used and pushing it, recurse, then pop and unmark. When the path has n elements I record a copy. There are n! permutations and each copy costs n, so O(n · n!) time with O(n) extra space. For duplicate inputs I sort and skip an element equal to the previous one when the previous one isn't used."
:::

::: links
LeetCode 46: Permutations | https://leetcode.com/problems/permutations/
LeetCode 47: Permutations II | https://leetcode.com/problems/permutations-ii/
NeetCode video: Permutations | https://www.youtube.com/results?search_query=neetcode+permutations
:::

=== Combination Sum
@p 2
@tags backtracking, combinations
@quick
- Backtrack with the **remaining target**; numbers can be **reused** → recurse with the **same index** `i`.
- Loop `i` from `start` (not 0) → no reordered duplicates like `[2,3,2]`.
- **Prune**: sort candidates; stop the loop when `candidate > remaining`.
- Record when `remaining === 0`.

::: text 🧾 Problem
Given **distinct** positive `candidates` and a `target`, return all **unique combinations** whose sum equals `target`. The **same number may be used any number of times**. Combinations are unique by their counts (order doesn't matter).

**Example 1:** `candidates = [2, 3, 6, 7], target = 7 → [[2, 2, 3], [7]]`
**Example 2:** `candidates = [2, 3, 5], target = 8 → [[2,2,2,2], [2,3,3], [3,5]]`

**Constraints:** 1 ≤ candidates ≤ 30, 1 ≤ target ≤ 40.
:::

::: text 🧒 Intuition
Paying exactly **7 euros with coins** of 2, 3, 6 and 7 (unlimited coins of each). You try adding a coin, see how much is still left to pay, and keep going. If you overpay, that path is dead: take the last coin back. To avoid counting "2 + 3" and "3 + 2" as different, you promise to only add coins **in non-decreasing order** (never go back to a smaller coin).
:::

::: text 🐢 Brute force
**Idea:** generate every multiset of candidates up to the target size (or every sequence) and check its sum, removing duplicates with a Set of sorted keys.

**Complexity:** the number of sequences explodes (each step has |candidates| choices, up to target/min depth): for target 40 and min 2 that's up to 30²⁰ sequences without pruning. Most of them overshoot the target long before the end.
:::

::: text 💡 Key insight
Carry the **remaining** amount down the recursion: overshooting (`remaining < 0`) stops a branch immediately, and with sorted candidates the whole rest of the loop can be cut (`break`). Recursing with the **same index** allows reuse; never going back to smaller indices removes order duplicates without any Set.

**Pattern name: Backtracking with pruning (unbounded choices).**
:::

::: diagram Explore with the remaining target
flowchart TD
  A["bt(start, remaining)"] --> B{"remaining === 0?"}
  B -->|"yes"| R["record a copy of path"]
  B -->|"no"| C{"for i = start .. n-1"}
  C --> D{"candidates[i] > remaining?"}
  D -->|"yes (sorted)"| X["break: every later candidate is bigger"]
  D -->|"no"| E["push, bt(i, remaining - candidates[i]), pop"]
  E --> C
:::

::: image Combination Sum: search tree reaching 2 2 3 and 7 as the combinations that sum to 7
/images/dsa-recursion-dp/combination-sum.svg
:::

::: text 🔍 Dry run: candidates = [2, 3, 6, 7], target = 7
| path | remaining | action |
|---|---|---|
| [] | 7 | try 2, 3, 6, 7 |
| [2] | 5 | try 2, 3 (6 > 5 → break) |
| [2, 2] | 3 | try 2 → [2,2,2] rem 1 (2 > 1 → break, dead end); try 3 → |
| [2, 2, 3] | 0 | **record [2, 2, 3]** |
| [2, 3] | 2 | 3 > 2 → break |
| [3] | 4 | try 3 → [3,3] rem 1 → dead end; 6 > 4 → break |
| [6] | 1 | 6 > 1 → break |
| [7] | 0 | **record [7]** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Combination Sum (reuse allowed). Exponential in the worst case, heavily pruned.
 */
function combinationSum(candidates, target) {
  const nums = [...candidates].sort((a, b) => a - b); // sorted → we can break early
  const result = [], path = [];
  function backtrack(start, remaining) {
    if (remaining === 0) { result.push([...path]); return; } // exact sum reached
    for (let i = start; i < nums.length; i++) {
      if (nums[i] > remaining) break;  // too big, and every later number is bigger → prune
      path.push(nums[i]);              // choose
      backtrack(i, remaining - nums[i]); // explore: SAME i → the number may be reused
      path.pop();                      // un-choose
    }
  }
  backtrack(0, target);
  return result;
}

/** Variant: Combination Sum II (each number once, input may contain duplicates). */
function combinationSum2(candidates, target) {
  const nums = [...candidates].sort((a, b) => a - b), out = [], path = [];
  (function bt(start, rem) {
    if (rem === 0) { out.push([...path]); return; }
    for (let i = start; i < nums.length; i++) {
      if (i > start && nums[i] === nums[i - 1]) continue; // skip duplicate values at this level
      if (nums[i] > rem) break;
      path.push(nums[i]); bt(i + 1, rem - nums[i]); path.pop(); // i + 1 → each number used once
    }
  })(0, target);
  return out;
}

// ---------- tests ----------
const norm = (cs) => JSON.stringify(cs.map((c) => [...c].sort((a, b) => a - b).join(',')).sort());
const cases = [
  [[2, 3, 6, 7], 7, [[2, 2, 3], [7]]],
  [[2, 3, 5], 8, [[2, 2, 2, 2], [2, 3, 3], [3, 5]]],
  [[2], 1, []],             // impossible
  [[1], 2, [[1, 1]]],
  [[7, 3, 2], 7, [[2, 2, 3], [7]]], // unsorted input
];
for (const [cands, target, expected] of cases) {
  const got = combinationSum(cands, target);
  console.log(JSON.stringify(cands), 'target', target, '→', JSON.stringify(got), norm(got) === norm(expected) ? '✅' : '❌ FAIL');
}
const c2 = combinationSum2([10, 1, 2, 7, 6, 1, 5], 8);
console.log('II →', JSON.stringify(c2), norm(c2) === norm([[1, 1, 6], [1, 2, 5], [1, 7], [2, 6]]) ? '✅' : '❌ FAIL');
:::

::: chart line Recursive calls for candidates [2,3,5] (start index): stop only when remaining ≤ 0 vs sorted + break
target,Without the break,Sorted + break
8,23,13
12,47,29
16,83,54
20,131,91
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All sequences + dedupe Set | Exponential, huge | Large | Easy to reason about | Explodes, duplicates | Never |
| **Backtracking, start index, prune** | **Exponential but pruned** | O(target / min) depth | No duplicates, no Set | Still exponential output | Default answer |
| DP counting (ways to make the sum) | O(n · target) | O(target) | Fast for **counting** | Doesn't list the combinations | Only the count is needed ([Combination Sum IV](https://leetcode.com/problems/combination-sum-iv/), Coin Change II) |
:::

::: warning ⚠️ Common mistakes / edge cases
- Recursing with `i + 1` (no reuse) or with `0` (duplicates in different orders).
- `continue` instead of `break` after sorting (correct but wastes time).
- Forgetting to copy the path.
- Confusing with Combination Sum II (each candidate once, duplicates in input).
:::

::: understand
- "Pass the remaining budget down and prune when it goes negative" is the core of most constraint backtracking: [Combination Sum II](https://leetcode.com/problems/combination-sum-ii/), [Combination Sum III](https://leetcode.com/problems/combination-sum-iii/), [Partition to K Equal Sum Subsets](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/).
- If you only need **how many** combinations, switch to DP ([Coin Change II](https://leetcode.com/problems/coin-change-ii/)).
:::

::: ask
- *"Can a number be reused?"*
- *"Are candidates distinct and positive?"* (Zero or negatives break the pruning.)
- *"Do you need the combinations or just how many?"*
:::

::: important ⭐ How to explain it in the interview
> "I backtrack with the remaining target. I sort the candidates, loop from a start index, and for each candidate that fits I push it and recurse with the same index, because numbers can be reused, and the remaining amount reduced. Looping from the start index means combinations are built in non-decreasing order, so I never produce [3,2,2] after [2,2,3]. When the remaining amount hits zero I record a copy; when a candidate exceeds it, I break because all later ones are bigger. It's exponential in the worst case, but pruning cuts most branches."
:::

::: links
LeetCode 39: Combination Sum | https://leetcode.com/problems/combination-sum/
LeetCode 40: Combination Sum II | https://leetcode.com/problems/combination-sum-ii/
NeetCode video: Combination Sum | https://www.youtube.com/results?search_query=neetcode+combination+sum
:::

=== Generate Parentheses
@p 2
@tags backtracking, recursion
@quick
- Build the string char by char: add `"("` if `open < n`; add `")"` if `close < open`.
- These rules only ever build **valid prefixes**, so every completed string is valid (no checking needed).
- Count = **Catalan number** C(n): 1, 2, 5, 14, 42… (n = 1..5).
- Time ≈ O(4ⁿ / √n) (the number of results × n).

::: text 🧾 Problem
Given `n` pairs of parentheses, generate **all well-formed** (balanced) combinations.

**Example 1:** `n = 3 → ["((()))","(()())","(())()","()(())","()()()"]`
**Example 2:** `n = 1 → ["()"]`

**Constraints:** 1 ≤ n ≤ 8.
:::

::: text 🧒 Intuition
You're **opening and closing doors** in a hallway. You may open a new door as long as you have doors left (`open < n`), and you may close a door only if there's an open one to close (`close < open`). Following those two rules, you can never end up in an impossible state, and when all n doors are opened and closed you've got a valid string.
:::

::: text 🐢 Brute force
**Idea:** generate all 2²ⁿ strings of `(` and `)` of length 2n and keep the valid ones (check each with a counter).

**Complexity:** O(2²ⁿ · n). For n = 8: 65,536 strings checked to keep 1,430 (98% wasted).
:::

::: text 💡 Key insight
A prefix can still become valid **only if** it never has more `)` than `(` and never more than n `(`. Enforce those two rules while building, and invalid strings are **never generated**: the tree has exactly the valid prefixes, and its leaves are exactly the answers.

**Pattern name: Backtracking with validity constraints (pruning by construction).**
:::

::: diagram Two rules
flowchart TD
  A["bt(path, open, close)"] --> B{"path.length === 2n?"}
  B -->|"yes"| R["record path"]
  B -->|"no"| C{"open < n?"}
  C -->|"yes"| D["bt(path + '(', open + 1, close)"]
  C --> E{"close < open?"}
  E -->|"yes"| F["bt(path + ')', open, close + 1)"]
:::

::: image Generate Parentheses for n = 3: only valid prefixes are grown, giving 5 strings
/images/dsa-recursion-dp/generate-parentheses.svg
:::

::: text 🔍 Dry run: n = 2
| path | open | close | can add "("? | can add ")"? |
|---|---|---|---|---|
| "" | 0 | 0 | yes | no |
| "(" | 1 | 0 | yes | yes |
| "((" | 2 | 0 | no | yes → "(()" → "(())" ✅ |
| "()" | 1 | 1 | yes → "()(" | no |
| "()(" | 2 | 1 | no | yes → "()()" ✅ |

Result: `["(())", "()()"]` (C(2) = 2).
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Generate Parentheses. Produces exactly the Catalan(n) valid strings.
 */
function generateParenthesis(n) {
  const result = [];
  function backtrack(path, open, close) {
    if (path.length === 2 * n) { result.push(path); return; } // complete and valid by construction
    if (open < n) backtrack(path + '(', open + 1, close);      // still have "(" to place
    if (close < open) backtrack(path + ')', open, close + 1);  // can close an open one
  }
  backtrack('', 0, 0);
  return result;
}

/** Brute force for cross-checking: all 2^(2n) strings, keep the valid ones. */
function generateBrute(n) {
  const out = [];
  for (let mask = 0; mask < 1 << (2 * n); mask++) {
    let s = '', bal = 0, ok = true;
    for (let i = 0; i < 2 * n; i++) {
      const ch = mask & (1 << i) ? '(' : ')';
      bal += ch === '(' ? 1 : -1;
      if (bal < 0) ok = false;
      s += ch;
    }
    if (ok && bal === 0) out.push(s);
  }
  return out;
}

// ---------- tests ----------
const catalan = [1, 1, 2, 5, 14, 42, 132, 429, 1430];
for (const n of [1, 2, 3, 4, 8]) {
  const got = generateParenthesis(n);
  const ok = got.length === catalan[n] && JSON.stringify([...got].sort()) === JSON.stringify(generateBrute(n).sort());
  console.log('n =', n, '→', got.length, 'strings', n <= 3 ? JSON.stringify(got) : '', ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Strings examined: all 2^(2n) vs only valid prefixes (≈ results)
n,All strings 2^(2n),Valid results C(n)
2,16,2
4,256,14
6,4096,132
8,65536,1430
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All strings + validity check | O(n · 4ⁿ) | O(n) | Obvious | Mostly wasted work | Never |
| **Backtracking with open/close rules** | **O(4ⁿ / √n)** | O(n) depth | Only valid strings are built | Recursion | Default answer |
| DP by closure number: `"(" + a + ")" + b` | Same output size | Stores sub-results | Elegant, reuses smaller answers | More memory | Follow-up / DP practice |
:::

::: warning ⚠️ Common mistakes / edge cases
- Allowing `")"` when `close < n` instead of `close < open` → invalid strings like `"))(("`.
- Using string concatenation **and** a shared array path without undoing (pick one style).
- Forgetting the base case length is `2n`, not `n`.
:::

::: understand
- Building only valid partial states is the strongest form of pruning. Related: [Valid Parentheses](https://leetcode.com/problems/valid-parentheses/), [Remove Invalid Parentheses](https://leetcode.com/problems/remove-invalid-parentheses/), [Letter Combinations of a Phone Number](https://leetcode.com/problems/letter-combinations-of-a-phone-number/).
:::

::: ask
- *"Only one bracket type?"*
- *"Any required order of the output?"*
- *"How big can n be?"* (Output grows ~4ⁿ.)
:::

::: important ⭐ How to explain it in the interview
> "I build the string one character at a time with two counters. I can add an opening bracket while I've used fewer than n, and a closing bracket only while there are more opens than closes. Those rules mean every prefix can still become valid, so I never generate invalid strings and don't need a final check. When the length reaches 2n I record it. The number of results is the Catalan number, roughly 4ⁿ / n^1.5, which bounds the time."
:::

::: links
LeetCode 22: Generate Parentheses | https://leetcode.com/problems/generate-parentheses/
NeetCode video: Generate Parentheses | https://www.youtube.com/results?search_query=neetcode+generate+parentheses
:::

=== Word Search
@p 2
@tags backtracking, grid, dfs
@quick
- DFS from every cell matching `word[0]`; at step k look for `word[k]` in the 4 neighbours.
- **Mark** the cell as used (e.g. replace with `"#"`) before recursing and **restore** it after (backtracking).
- Worst case **O(R · C · 3ᴸ)** (L = word length; 3 directions after the first step).
- Pruning: check letter counts first (board must contain enough of each letter); start from the rarer end of the word.

::: text 🧾 Problem
Given an R × C grid of letters and a `word`, return `true` if the word can be formed by **adjacent** cells (horizontally or vertically), using each cell **at most once**.

**Example:** board `ABCE / SFCS / ADEE`: `"ABCCED" → true`, `"SEE" → true`, `"ABCB" → false`.

**Constraints:** R, C ≤ 6, word length ≤ 15.
:::

::: text 🧒 Intuition
A **word-search puzzle** where you trace the word with your finger, moving one square at a time. You can't reuse a square, so as you trace you **put a coin** on each used square. If you get stuck, you **pick the last coin back up** and try another direction. That pick-up is the "un-choose" step of backtracking.
:::

::: text 🐢 Brute force
**Idea:** generate every path of length L in the grid (from every start, every direction sequence) and compare it with the word.

**Complexity:** O(R · C · 4ᴸ) paths without stopping at the first wrong letter. For a 6 × 6 board and L = 15 that's ~3.9 × 10¹⁰. The waste: continuing paths whose prefix already doesn't match.
:::

::: text 💡 Key insight
Compare **letter by letter while walking**: a path stops the moment the next letter doesn't match, so almost all branches die after one or two steps. Marking the current path's cells (and unmarking on the way back) enforces "each cell once" without copying any visited set.

**Pattern name: Grid DFS + backtracking (mark / unmark).**
:::

::: diagram DFS with mark and unmark
flowchart TD
  A["dfs(r, c, k)"] --> B{"k === word.length?"}
  B -->|"yes"| T["true"]
  B -->|"no"| C{"in bounds and board[r][c] === word[k]?"}
  C -->|"no"| F["false"]
  C -->|"yes"| D["mark the cell as used"]
  D --> E["found = any of the 4 dfs(neighbour, k + 1)"]
  E --> G["unmark board[r][c] = letter"]
  G --> H["return found"]
:::

::: image Word Search: the path A B C C E D highlighted in the grid
/images/dsa-recursion-dp/word-search.svg
:::

::: text 🔍 Dry run: "ABCCED" from (0,0)
| k | looking for | at cell | match? | next |
|---|---|---|---|---|
| 0 | A | (0,0) | yes | mark, try neighbours |
| 1 | B | (0,1) | yes | mark |
| 2 | C | (0,2) | yes | mark |
| 3 | C | (1,2) | yes (down) | mark |
| 4 | E | (2,2) | yes (down) | mark |
| 5 | D | (2,1) | yes (left) | k = 6 = length → **true** |

For `"ABCB"`: after A(0,0) → B(0,1) → C(0,2), the only B nearby is (0,1), which is marked → every branch fails → **false**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Word Search with DFS + backtracking. Worst case O(R·C·3^L), Space O(L) recursion.
 */
function exist(input, word) {
  const board = input.map((row) => [...row]);  // copy: we temporarily overwrite cells
  const R = board.length, C = board[0].length;

  // Cheap pruning: the board must contain enough of every letter
  const have = {};
  for (const row of board) for (const ch of row) have[ch] = (have[ch] || 0) + 1;
  for (const ch of word) { if (!have[ch]) return false; have[ch]--; }

  function dfs(r, c, k) {
    if (k === word.length) return true;                       // matched every letter
    if (r < 0 || r >= R || c < 0 || c >= C || board[r][c] !== word[k]) return false;
    const letter = board[r][c];
    board[r][c] = '#';                                        // choose: mark as used
    const found = dfs(r + 1, c, k + 1) || dfs(r - 1, c, k + 1) || dfs(r, c + 1, k + 1) || dfs(r, c - 1, k + 1);
    board[r][c] = letter;                                     // un-choose: restore for other paths
    return found;
  }

  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (dfs(r, c, 0)) return true;                          // try every starting cell
  return false;
}

// ---------- tests ----------
const board = [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']];
const cases = [['ABCCED', true], ['SEE', true], ['ABCB', false], ['ESCCBA', true], ['Z', false], ['ADFBCCEESE', true]];
for (const [word, expected] of cases) {
  const got = exist(board, word);
  console.log(JSON.stringify(word), '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('board unchanged after searching:', JSON.stringify(board) === JSON.stringify([['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']]) ? '✅' : '❌ FAIL');
// tough case: all "A", word "AAAAAAAAAB" (no B) → letter-count pruning answers instantly
const allA = Array.from({ length: 6 }, () => new Array(6).fill('A'));
const t0 = Date.now();
console.log('no B on the board →', exist(allA, 'AAAAAAAAAB'), Date.now() - t0 < 100 ? '✅ pruned instantly' : '❌ FAIL too slow');
:::

::: chart line Paths explored (6×6 board, length L): all 4^L paths vs letter-by-letter DFS on real words (illustrative)
L,All paths per start 4^L,DFS with early mismatch
3,64,6
5,1024,10
8,65536,20
10,1048576,30
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Enumerate all paths, compare | O(R·C·4ᴸ) | O(L) | Simple idea | Explodes | Never |
| DFS + separate visited Set | O(R·C·3ᴸ) | O(L) + Set | Doesn't touch the board | Set overhead | Board must stay read-only |
| **DFS + in-place mark / unmark** | **O(R·C·3ᴸ)** worst | O(L) | Fast, no extra structure | Temporarily mutates (we copy first) | Default answer |
| Trie of many words + one DFS | Depends | O(total word length) | Searches MANY words at once | More code | [Word Search II](https://leetcode.com/problems/word-search-ii/) |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting to **unmark** after exploring → later paths think the cell is used.
- Using a shared `visited` and returning early without cleaning up.
- Checking `k === word.length` **after** the bounds check (fails when the last letter is on the edge).
- Allowing diagonal moves.
:::

::: understand
- Mark / unmark is how backtracking enforces "use each thing once" on grids: [Word Search II](https://leetcode.com/problems/word-search-ii/), [Unique Paths III](https://leetcode.com/problems/unique-paths-iii/), [Path with Maximum Gold](https://leetcode.com/problems/path-with-maximum-gold/), [N-Queens](https://leetcode.com/problems/n-queens/).
:::

::: ask
- *"Can a cell be reused? 4 or 8 directions?"*
- *"May I modify the board temporarily?"*
- *"One word or many words?"* (Many → Trie.)
:::

::: important ⭐ How to explain it in the interview
> "I start a DFS from every cell that matches the first letter. The DFS checks bounds and the expected letter, marks the cell as used, tries the four neighbours for the next letter, and then restores the cell so other paths can use it. If the index reaches the word length, the word exists. A mismatch stops a branch immediately. Worst case is O(R·C·3^L) with O(L) recursion depth; as a cheap pre-check I compare letter counts between the word and the board."
:::

::: links
LeetCode 79: Word Search | https://leetcode.com/problems/word-search/
NeetCode video: Word Search | https://www.youtube.com/results?search_query=neetcode+word+search
:::

=== Climbing Stairs (intro to DP)
@p 3
@tags dp, fibonacci, easy
@quick
- `ways(n) = ways(n − 1) + ways(n − 2)`: the last move was 1 step or 2 steps. Base: `ways(0) = ways(1) = 1`.
- Plain recursion repeats subproblems → **O(2ⁿ)**. Memo or a table → **O(n)**. Two variables → **O(1) space**.
- DP recipe: **state** (ways to reach step i) → **transition** → **base cases** → **order**.
- It's Fibonacci in disguise.

::: text 🧾 Problem
You climb a staircase of `n` steps, taking **1 or 2 steps** at a time. In how many **distinct ways** can you reach the top?

**Example 1:** `n = 2 → 2` (1+1, 2).
**Example 2:** `n = 3 → 3` (1+1+1, 1+2, 2+1); `n = 5 → 8`.

**Constraints:** 1 ≤ n ≤ 45.

*Dynamic programming (DP) = solve a big problem by combining answers to smaller versions of the same problem, and **store** those answers so each is computed only once.*
:::

::: text 🧒 Intuition
Stand on the **top step** and look back: you arrived either from **one step below** or from **two steps below**. So "ways to reach the top" = "ways to reach the step below" + "ways to reach two steps below". You'd fill a little table on paper from the bottom: 1, 1, 2, 3, 5, 8… each number is the sum of the two before it.
:::

::: text 🐢 Brute force
**Idea:** recursion straight from the rule, no memory.

`ways(n) = n <= 1 ? 1 : ways(n − 1) + ways(n − 2)`

**Complexity:** the call tree doubles at every level → about **1.6ⁿ calls** (O(2ⁿ)). For n = 45 that's over a **billion** calls (seconds to minutes), because `ways(43)` is recomputed twice, `ways(42)` three times, and so on (see the picture).
:::

::: text 💡 Key insight
There are only **n + 1 different subproblems** (`ways(0)` … `ways(n)`); the brute force solves them exponentially many times. Store each answer once (memoisation, top-down) or fill them in order (tabulation, bottom-up). Since each value only needs the previous two, keep just two variables.

**Pattern name: 1-D dynamic programming (Fibonacci-style).**
:::

::: diagram From recursion to DP
flowchart LR
  A["plain recursion: O(2^n)"] -->|"cache results"| B["memoisation (top-down): O(n) time, O(n) space"]
  B -->|"fill in order"| C["tabulation (bottom-up): O(n) time, O(n) space"]
  C -->|"keep only the last two"| D["two variables: O(n) time, O(1) space"]
:::

::: image Climbing Stairs: the recursion tree repeats f(3) and f(2); the dp array is 1 1 2 3 5 8
/images/dsa-recursion-dp/climbing-stairs.svg
:::

::: text 🔍 Dry run: n = 5 with two variables (prev2 = ways(i − 2), prev1 = ways(i − 1))
| i | prev2 | prev1 | ways(i) = prev1 + prev2 |
|---|---|---|---|
| start | ways(0) = 1 | ways(1) = 1 | |
| 2 | 1 | 1 | 2 |
| 3 | 1 | 2 | 3 |
| 4 | 2 | 3 | 5 |
| 5 | 3 | 5 | **8** |
:::

::: code javascript Recursion → memo → table → O(1) space, with tests (runnable)
/** 1) Plain recursion: correct but O(2^n). Counts calls to show the explosion. */
let calls = 0;
function waysNaive(n) {
  calls++;
  if (n <= 1) return 1;                        // 0 or 1 step: exactly one way
  return waysNaive(n - 1) + waysNaive(n - 2);  // last move was 1 step or 2 steps
}

/** 2) Memoisation (top-down): remember each answer. O(n) time, O(n) space. */
function waysMemo(n, memo = new Map()) {
  if (n <= 1) return 1;
  if (memo.has(n)) return memo.get(n);         // already solved → reuse
  const result = waysMemo(n - 1, memo) + waysMemo(n - 2, memo);
  memo.set(n, result);
  return result;
}

/** 3) Tabulation (bottom-up): fill dp[0..n]. O(n) time, O(n) space. */
function waysTable(n) {
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1; dp[1] = 1;                        // base cases
  for (let i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2]; // transition
  return dp[n];
}

/** 4) Optimal: only the last two values matter. O(n) time, O(1) space. */
function climbStairs(n) {
  let prev2 = 1, prev1 = 1;                    // ways(0), ways(1)
  for (let i = 2; i <= n; i++) {
    const cur = prev1 + prev2;                 // ways(i)
    prev2 = prev1;                             // slide the window forward
    prev1 = cur;
  }
  return prev1;
}

// ---------- tests ----------
const expected = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8, 10: 89, 45: 1836311903 };
for (const [n, e] of Object.entries(expected)) {
  const N = Number(n);
  const ok = climbStairs(N) === e && waysTable(N) === e && waysMemo(N) === e;
  console.log('n =', N, '→', climbStairs(N), ok ? '✅' : '❌ FAIL expected ' + e);
}
calls = 0; waysNaive(25);
console.log('naive recursion calls for n = 25:', calls.toLocaleString(), calls > 100000 ? '✅ (exponential!)' : '❌ FAIL');
:::

::: chart line Function calls: plain recursion (~1.6^n) vs DP (n)
n,Plain recursion calls,DP steps
10,177,10
20,21891,20
30,2692537,30
40,331160281,40
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Plain recursion | O(2ⁿ) | O(n) stack | Mirrors the definition | Exponential | Never (except to explain) |
| Memoisation (top-down) | O(n) | O(n) + stack | Easy to add to recursion | Recursion depth | When the recursion is natural |
| Tabulation (bottom-up) | O(n) | O(n) | No recursion, clear order | Full table | When you want all values |
| **Two variables** | **O(n)** | **O(1)** | Optimal | Only works when the transition looks back a fixed distance | Default answer |
| Matrix exponentiation / Binet formula | O(log n) | O(1) | Asymptotically fastest | Overkill, floating point issues (Binet) | Very large n (mod arithmetic) |
:::

::: warning ⚠️ Common mistakes / edge cases
- Wrong base cases (`ways(0) = 0` makes everything 0).
- Off-by-one: is the answer `dp[n]` or `dp[n − 1]`? Define the state clearly ("ways to reach step i").
- Using recursion without memo for n = 45 → timeout.
- Variant with step sizes `[1, 3, 5]`: the transition becomes a sum over all allowed step sizes.
:::

::: understand
- The DP recipe (state → transition → base → order → answer) solves every problem in this section: [House Robber](https://leetcode.com/problems/house-robber/), [Min Cost Climbing Stairs](https://leetcode.com/problems/min-cost-climbing-stairs/), [Decode Ways](https://leetcode.com/problems/decode-ways/), [Fibonacci Number](https://leetcode.com/problems/fibonacci-number/).
- **Overlapping subproblems** (the same question asked many times) + **optimal substructure** (big answer built from small answers) = DP applies.
:::

::: ask
- *"Which step sizes are allowed?"*
- *"How large can n be?"* (Huge n → modulo arithmetic / matrix power.)
- *"Count the ways or list them?"* (Listing them is backtracking and exponential.)
:::

::: important ⭐ How to explain it in the interview
> "To reach step n, the last move was either one step from n − 1 or two steps from n − 2, so ways(n) = ways(n − 1) + ways(n − 2), with ways(0) = ways(1) = 1. Plain recursion recomputes the same values exponentially often. Since there are only n distinct subproblems, I compute them bottom-up, and because each value needs only the previous two, I keep two variables: O(n) time and O(1) space. It's the Fibonacci sequence."
:::

::: links
LeetCode 70: Climbing Stairs | https://leetcode.com/problems/climbing-stairs/
NeetCode video: Climbing Stairs | https://www.youtube.com/results?search_query=neetcode+climbing+stairs
NeetCode: dynamic programming roadmap | https://neetcode.io/roadmap
:::

=== House Robber
@p 3
@tags dp, medium
@quick
- `best[i] = max(best[i − 1], best[i − 2] + nums[i])`: **skip** house i, or **rob** it plus the best up to i − 2.
- Two variables → **O(n) time, O(1) space**.
- Greedy "rob every other house" fails (`[2, 1, 1, 2]` → best is 4 by robbing houses 0 and 3).
- Circular street (House Robber II): answer = max(rob houses 0..n−2, rob houses 1..n−1).

::: text 🧾 Problem
Houses along a street have `nums[i]` money. You can't rob **two adjacent houses** (the alarm goes off). Return the **maximum** amount you can rob.

**Example 1:** `[1, 2, 3, 1] → 4` (rob houses 0 and 2).
**Example 2:** `[2, 7, 9, 3, 1] → 12` (houses 0, 2, 4).

**Constraints:** 1 ≤ n ≤ 100, 0 ≤ nums[i] ≤ 400.
:::

::: text 🧒 Intuition
Walk down the street with a **notebook**. At each house write down: "the most I could have stolen if the street ended here". For the current house you have exactly two options: **skip it** (keep the previous best), or **rob it** (its money + the best from two houses back, since the neighbour is off-limits). Write the bigger number. The last number in the notebook is the answer.
:::

::: text 🐢 Brute force
**Idea:** try every subset of houses with no two adjacent and keep the best sum (recursion: rob or skip each house).

`best(i) = max(best(i + 1), nums[i] + best(i + 2))` without memo

**Complexity:** ~O(1.6ⁿ) (Fibonacci-many valid subsets). For n = 100 that's ~10²⁰ calls: impossible. The same `best(i)` is recomputed again and again.
:::

::: text 💡 Key insight
The decision at house i only depends on two earlier answers: the best up to i − 1 (skip) and the best up to i − 2 (rob). So define the **state** `best[i]` = max money from houses 0..i, use the **transition** above, and keep only the last two values.

**Pattern name: 1-D DP with a take/skip choice.**
:::

::: diagram Take it or skip it
flowchart LR
  A["house i"] --> B["skip: best[i - 1]"]
  A --> C["rob: best[i - 2] + nums[i]"]
  B --> D["best[i] = max of the two"]
  C --> D
:::

::: image House Robber: houses 2 7 9 3 1 with best totals 2 7 11 11 12
/images/dsa-recursion-dp/house-robber.svg
:::

::: text 🔍 Dry run: [2, 7, 9, 3, 1]
| i | nums[i] | skip = best[i−1] | rob = best[i−2] + nums[i] | best[i] |
|---|---|---|---|---|
| 0 | 2 | 0 | 0 + 2 | 2 |
| 1 | 7 | 2 | 0 + 7 | 7 |
| 2 | 9 | 7 | 2 + 9 = 11 | 11 |
| 3 | 3 | 11 | 7 + 3 = 10 | 11 |
| 4 | 1 | 11 | 11 + 1 = 12 | **12** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * House Robber. Time O(n), Space O(1).
 */
function rob(nums) {
  let prev2 = 0;   // best up to house i - 2
  let prev1 = 0;   // best up to house i - 1
  for (const money of nums) {
    const cur = Math.max(prev1, prev2 + money); // skip this house, or rob it (+ best from two back)
    prev2 = prev1;
    prev1 = cur;
  }
  return prev1;
}

/** House Robber II: houses in a circle → first and last are neighbours. */
function robCircle(nums) {
  if (nums.length === 1) return nums[0];
  return Math.max(rob(nums.slice(0, -1)), rob(nums.slice(1))); // exclude the last OR exclude the first
}

/** Brute force for cross-checking: try rob/skip for every house. O(2^n). */
function robBrute(nums, i = 0) {
  if (i >= nums.length) return 0;
  return Math.max(robBrute(nums, i + 1), nums[i] + robBrute(nums, i + 2));
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 1], 4],
  [[2, 7, 9, 3, 1], 12],
  [[2, 1, 1, 2], 4],   // greedy "every other house" gives 3
  [[5], 5],
  [[], 0],
  [[0, 0, 0], 0],
];
for (const [nums, expected] of cases) {
  const got = rob(nums);
  console.log(JSON.stringify(nums), '→', got, got === expected && robBrute(nums) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('circle [2,3,2] →', robCircle([2, 3, 2]), robCircle([2, 3, 2]) === 3 ? '✅' : '❌ FAIL');
let allOk = true;
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 15) }, () => Math.floor(Math.random() * 20));
  if (rob(arr) !== robBrute(arr)) allOk = false;
}
console.log('200 random streets match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Calls: rob/skip recursion without memo vs DP (n)
n,Recursion calls,DP steps
10,287,10
20,35421,20
30,4356617,30
40,535828591,40
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Greedy (every other house / biggest first) | O(n) | O(1) | Simple | **Wrong** on many inputs | Never |
| Rob/skip recursion | O(1.6ⁿ) | O(n) | Direct | Exponential | Never |
| Memo / table | O(n) | O(n) | Easy to derive | Extra array | Explaining DP |
| **Two variables** | **O(n)** | **O(1)** | Optimal | – | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Assuming the answer is "even indices vs odd indices" (fails for `[2, 1, 1, 2]`).
- Mixing up `prev1`/`prev2` updates (update `prev2` before overwriting `prev1`).
- Empty input or one house.
- Circular version: forgetting that the first and last houses are neighbours.
:::

::: understand
- "Take it (and skip the neighbour) or leave it" is the 1-D DP template for [House Robber II](https://leetcode.com/problems/house-robber-ii/), [Delete and Earn](https://leetcode.com/problems/delete-and-earn/), [House Robber III](https://leetcode.com/problems/house-robber-iii/) (on a tree), and maximum sum of non-adjacent elements.
:::

::: ask
- *"Is the street circular?"*
- *"Can amounts be negative?"* (Then skipping everything gives 0.)
- *"Return the amount or which houses?"* (Then keep choices to backtrack.)
:::

::: important ⭐ How to explain it in the interview
> "Let best[i] be the most I can rob from the first i houses. For house i I either skip it, giving best[i − 1], or rob it, giving best[i − 2] plus its money, and take the max. Greedy choices fail on inputs like [2, 1, 1, 2]. Since each step only needs the previous two values, I keep two variables: O(n) time and O(1) space. For a circular street I run it twice, excluding the first or the last house."
:::

::: links
LeetCode 198: House Robber | https://leetcode.com/problems/house-robber/
LeetCode 213: House Robber II | https://leetcode.com/problems/house-robber-ii/
NeetCode video: House Robber | https://www.youtube.com/results?search_query=neetcode+house+robber
:::

=== Coin Change
@p 2
@tags dp, unbounded-knapsack, medium
@quick
- `dp[a]` = **fewest coins** to make amount `a`; `dp[0] = 0`, others `Infinity`.
- `dp[a] = 1 + min(dp[a − coin])` over coins ≤ a. Answer `dp[amount]` or `-1` if still Infinity.
- **O(amount × coins)** time, **O(amount)** space.
- **Greedy fails** (coins [1, 3, 4], amount 6 → greedy 4+1+1 = 3 coins, best 3+3 = 2).

::: text 🧾 Problem
Given coin denominations `coins` (unlimited of each) and an `amount`, return the **fewest number of coins** that make up that amount, or `-1` if it's impossible.

**Example 1:** `coins = [1, 2, 5], amount = 11 → 3` (5 + 5 + 1).
**Example 2:** `coins = [2], amount = 3 → -1`; `amount = 0 → 0`.

**Constraints:** 1 ≤ coins ≤ 12, 0 ≤ amount ≤ 10⁴.
:::

::: text 🧒 Intuition
A **cashier building a cheat sheet**: "the fewest coins for 1 cent, for 2 cents, for 3 cents…". To fill the line for 11 cents, ask: "if the last coin I hand over is a 5, I still need the best way to make 6, which is already on my sheet". Try each possible last coin, take the cheapest, add 1. Every line uses lines above it.
:::

::: text 🐢 Brute force
**Idea:** recursion: `fewest(a) = 1 + min(fewest(a − c))` for every coin, without memory. Or a greedy "always take the largest coin".

**Complexity:** the recursion branches `|coins|` ways at each level, depth up to `amount / minCoin` → exponential (for coins [1, 2, 5] and amount 50 it's already billions of calls). Greedy is fast but **wrong** for many coin systems.
:::

::: text 💡 Key insight
There are only `amount + 1` subproblems (`fewest(0..amount)`). Solve them **from small to large** so every `dp[a − coin]` is ready when needed. Each amount checks each coin once → O(amount × coins).

**Pattern name: DP over amounts (unbounded knapsack, minimisation).**
:::

::: diagram Fill dp from 0 to amount
flowchart TD
  A["dp[0] = 0, dp[1..amount] = Infinity"] --> B["for a = 1 .. amount"]
  B --> C["for each coin c <= a"]
  C --> D["dp[a] = min(dp[a], dp[a - c] + 1)"]
  D --> C
  C -->|"coins done"| B
  B -->|"done"| E["dp[amount] === Infinity ? -1 : dp[amount]"]
:::

::: image Coin Change: dp array for amounts 0 to 11 with coins 1 2 5; dp[11] = 3
/images/dsa-recursion-dp/coin-change.svg
:::

::: text 🔍 Dry run: coins = [1, 2, 5], amount = 11
| a | dp[a−1] + 1 | dp[a−2] + 1 | dp[a−5] + 1 | dp[a] |
|---|---|---|---|---|
| 0 | | | | 0 |
| 1 | 1 | – | – | 1 |
| 2 | 2 | 1 | – | 1 |
| 3 | 2 | 2 | – | 2 |
| 4 | 3 | 2 | – | 2 |
| 5 | 3 | 3 | 1 | 1 |
| 6 | 2 | 3 | 2 | 2 |
| 7 | 3 | 2 | 2 | 2 |
| 8 | 3 | 3 | 3 | 3 |
| 9 | 4 | 3 | 3 | 3 |
| 10 | 4 | 4 | 2 | 2 |
| 11 | 3 | 4 | 3 | **3** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Coin Change: fewest coins. Time O(amount × coins), Space O(amount).
 */
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity); // Infinity = "can't make this amount (yet)"
  dp[0] = 0;                                       // zero coins make amount 0
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && dp[a - c] + 1 < dp[a]) {
        dp[a] = dp[a - c] + 1;                     // use coin c last, plus the best for the rest
      }
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}

/** Greedy (largest coin first) to show where it FAILS. */
function coinGreedy(coins, amount) {
  let count = 0;
  for (const c of [...coins].sort((a, b) => b - a)) { count += Math.floor(amount / c); amount %= c; }
  return amount === 0 ? count : -1;
}

/** Variant: Coin Change II = number of COMBINATIONS (coin loop outside → order doesn't matter). */
function change(amount, coins) {
  const ways = new Array(amount + 1).fill(0);
  ways[0] = 1;
  for (const c of coins) for (let a = c; a <= amount; a++) ways[a] += ways[a - c];
  return ways;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 5], 11, 3],
  [[2], 3, -1],            // impossible
  [[1], 0, 0],             // amount 0
  [[1, 3, 4], 6, 2],       // greedy gives 3
  [[186, 419, 83, 408], 6249, 20],
];
for (const [coins, amount, expected] of cases) {
  const got = coinChange(coins, amount);
  console.log(JSON.stringify(coins), 'amount', amount, '→', got, got === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('greedy on [1,3,4], 6 →', coinGreedy([1, 3, 4], 6), 'coins (DP says 2)', coinGreedy([1, 3, 4], 6) === 3 ? '✅ shows greedy failing' : '❌ FAIL');
console.log('Coin Change II: ways to make 5 with [1,2,5] →', change(5, [1, 2, 5])[5], change(5, [1, 2, 5])[5] === 4 ? '✅' : '❌ FAIL');
:::

::: chart line Calls for coins [1,2,5]: recursion without memo vs DP table (amount × coins)
amount,Recursion (no memo),DP amount×3
10,309,30
15,4457,45
20,64207,60
25,924876,75
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Greedy (largest first) | O(coins) | O(1) | Instant | **Wrong** for many coin sets | Only for "canonical" systems like euro coins |
| Recursion without memo | Exponential | O(amount) | Direct | Hopeless | Never |
| Memoised recursion | O(amount × coins) | O(amount) + stack | Natural top-down | Deep recursion for large amounts | If you think top-down |
| **Bottom-up table** | **O(amount × coins)** | **O(amount)** | No recursion | – | Default answer |
| BFS over amounts | O(amount × coins) | O(amount) | Shortest "path" in coins | Same cost, more code | Alternative view |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using greedy.
- Initialising `dp` with 0 instead of Infinity (every amount looks free).
- Forgetting `-1` for impossible amounts and `0` for amount 0.
- Coin Change II (count combinations): looping amounts outside and coins inside counts **permutations** (1+2 and 2+1 twice).
:::

::: understand
- This is the **unbounded knapsack** shape: items can be reused, iterate amounts upward. Related: [Coin Change II](https://leetcode.com/problems/coin-change-ii/) (count ways), [Perfect Squares](https://leetcode.com/problems/perfect-squares/), [Minimum Cost For Tickets](https://leetcode.com/problems/minimum-cost-for-tickets/), [Word Break](https://leetcode.com/problems/word-break/).
:::

::: ask
- *"Unlimited coins of each type?"*
- *"Fewest coins, or number of ways?"*
- *"What to return if impossible?"*
- *"How large can the amount be?"* (Table size.)
:::

::: important ⭐ How to explain it in the interview
> "Greedy fails for coin sets like [1, 3, 4] with amount 6. I use DP: dp[a] is the fewest coins for amount a, dp[0] = 0, everything else starts at infinity. For each amount from 1 up, I try every coin as the last coin: dp[a] = min(dp[a], dp[a − coin] + 1). The answer is dp[amount], or −1 if it's still infinity. That's O(amount × coins) time and O(amount) space."
:::

::: links
LeetCode 322: Coin Change | https://leetcode.com/problems/coin-change/
LeetCode 518: Coin Change II | https://leetcode.com/problems/coin-change-ii/
NeetCode video: Coin Change | https://www.youtube.com/results?search_query=neetcode+coin+change
:::

=== Longest Increasing Subsequence
@p 2
@tags dp, binary-search, medium
@quick
- **O(n²) DP**: `dp[i]` = length of the LIS **ending at i** = `1 + max(dp[j])` for `j < i` with `nums[j] < nums[i]`; answer `max(dp)`.
- **O(n log n)**: keep `tails[k]` = smallest possible tail of an increasing subsequence of length k + 1; binary-search (lower bound) where each number goes.
- `tails` is **not** the LIS itself, only its length is correct.
- Subsequence = keep order, may skip elements (not contiguous).

::: text 🧾 Problem
Return the length of the **longest strictly increasing subsequence** of `nums` (elements in order, not necessarily adjacent).

**Example 1:** `[10, 9, 2, 5, 3, 7, 101, 18] → 4` (e.g. `[2, 3, 7, 18]`).
**Example 2:** `[0, 1, 0, 3, 2, 3] → 4`; `[7, 7, 7] → 1`.

**Constraints:** 1 ≤ n ≤ 2500 (follow-up: O(n log n)).
:::

::: text 🧒 Intuition
**O(n²) idea:** each number asks all earlier, **smaller** numbers: "how long is the best increasing chain that ends with you?" It extends the longest one by 1.

**O(n log n) idea (patience sorting):** deal cards into piles from left to right; a card goes on the **leftmost pile whose top is ≥ the card**, or starts a new pile on the right. The number of piles is the LIS length. Keeping each pile's top as small as possible leaves the most room for future cards.
:::

::: text 🐢 Brute force
**Idea:** check every subsequence (2ⁿ of them) for being increasing and keep the longest.

**Complexity:** O(n · 2ⁿ). For n = 2500 that's unimaginable (2²⁵⁰⁰); even n = 40 is ~4 × 10¹³.
:::

::: text 💡 Key insight
1. **DP**: the best subsequence ending at i only depends on the best subsequences ending at earlier smaller values → `dp[i] = 1 + max(dp[j])`. O(n²).
2. **Greedy + binary search**: for each length we only need the **smallest tail value** seen so far. `tails` is always sorted, so the position for each new number is found with binary search (lower bound). O(n log n).

**Pattern name: 1-D DP (sequence) → patience sorting with binary search.**
:::

::: diagram Two algorithms
flowchart TD
  A["O(n^2): for i, for j < i"] --> B{"nums[j] < nums[i]?"}
  B -->|"yes"| C["dp[i] = max(dp[i], dp[j] + 1)"]
  D["O(n log n): for x of nums"] --> E["pos = lowerBound(tails, x)"]
  E --> F{"pos === tails.length?"}
  F -->|"yes"| G["tails.push(x): a longer subsequence"]
  F -->|"no"| H["tails[pos] = x: a smaller tail for that length"]
:::

::: image Longest Increasing Subsequence: dp values and the tails array for 10 9 2 5 3 7 101 18
/images/dsa-recursion-dp/lis.svg
:::

::: text 🔍 Dry run: [10, 9, 2, 5, 3, 7, 101, 18]
| x | lowerBound position in tails | action | tails after | dp value for x |
|---|---|---|---|---|
| 10 | 0 (empty) | push | [10] | 1 |
| 9 | 0 | replace 10 | [9] | 1 |
| 2 | 0 | replace 9 | [2] | 1 |
| 5 | 1 | push | [2, 5] | 2 |
| 3 | 1 | replace 5 | [2, 3] | 2 |
| 7 | 2 | push | [2, 3, 7] | 3 |
| 101 | 3 | push | [2, 3, 7, 101] | 4 |
| 18 | 3 | replace 101 | [2, 3, 7, 18] | 4 |

Length of tails = **4**.
:::

::: code javascript O(n²) DP and O(n log n) versions, with tests (runnable)
/** O(n²) DP. dp[i] = LIS length ending exactly at index i. */
function lengthOfLISQuadratic(nums) {
  if (nums.length === 0) return 0;
  const dp = new Array(nums.length).fill(1);    // every element alone is a subsequence of length 1
  for (let i = 1; i < nums.length; i++)
    for (let j = 0; j < i; j++)
      if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1); // extend the chain ending at j
  return Math.max(...dp);
}

/** O(n log n): tails[k] = smallest tail of an increasing subsequence of length k + 1. */
function lengthOfLIS(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0, hi = tails.length;               // lower bound: first tail >= x
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1; else hi = mid;
    }
    if (lo === tails.length) tails.push(x);     // x extends the longest subsequence
    else tails[lo] = x;                         // x is a smaller tail for length lo + 1
  }
  return tails.length;
}

// ---------- tests ----------
const cases = [
  [[10, 9, 2, 5, 3, 7, 101, 18], 4],
  [[0, 1, 0, 3, 2, 3], 4],
  [[7, 7, 7, 7], 1],      // strictly increasing → duplicates don't count
  [[5], 1],
  [[], 0],
  [[1, 2, 3, 4, 5], 5],
  [[5, 4, 3, 2, 1], 1],
];
for (const [nums, expected] of cases) {
  const a = lengthOfLIS(nums), b = lengthOfLISQuadratic(nums);
  console.log(JSON.stringify(nums), '→', a, a === expected && b === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 30) }, () => Math.floor(Math.random() * 20));
  if (lengthOfLIS(arr) !== lengthOfLISQuadratic(arr)) allOk = false;
}
console.log('200 random arrays: both algorithms agree', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons: O(n²) DP vs O(n log n) patience sorting
n,DP n²/2,Binary search n·log2 n
100,5000,664
1000,500000,9966
2500,3125000,28219
10000,50000000,132877
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All subsequences | O(n · 2ⁿ) | O(n) | – | Impossible beyond ~25 | Never |
| **DP over endings** | **O(n²)** | O(n) | Easy to explain; can rebuild the sequence | Slow for 10⁵ | First answer, n ≤ few thousand |
| **Patience sorting (tails + lower bound)** | **O(n log n)** | O(n) | Fast | Tails isn't the actual subsequence (needs extra parent pointers) | Follow-up / large n |
| Segment tree / BIT over values | O(n log n) | O(n) | Generalises (count LIS, weights) | Much more code | Advanced variants |
:::

::: warning ⚠️ Common mistakes / edge cases
- Returning `dp[n − 1]` instead of `max(dp)` (the LIS doesn't have to end at the last element).
- Using `<=` (non-decreasing) when the problem says strictly increasing, or the reverse.
- Thinking `tails` is the subsequence itself.
- Upper bound vs lower bound: for strictly increasing use lower bound (first `>= x`).
:::

::: understand
- "Best answer ending at i" is the standard state for sequence DP. Related: [Number of Longest Increasing Subsequence](https://leetcode.com/problems/number-of-longest-increasing-subsequence/), [Russian Doll Envelopes](https://leetcode.com/problems/russian-doll-envelopes/) (sort + LIS), [Longest Common Subsequence](https://leetcode.com/problems/longest-common-subsequence/).
:::

::: ask
- *"Strictly increasing or non-decreasing?"*
- *"Return the length or the subsequence itself?"*
- *"How large is n?"* (Decides O(n²) vs O(n log n).)
:::

::: important ⭐ How to explain it in the interview
> "With DP, dp[i] is the longest increasing subsequence ending at i: one plus the best dp[j] over earlier smaller values, and the answer is the max over all i, O(n²). To get O(n log n) I keep a tails array where tails[k] is the smallest possible tail of an increasing subsequence of length k + 1. It stays sorted, so for each number I binary-search the first tail that's at least as big and replace it, or append if none. The length of tails is the answer."
:::

::: links
LeetCode 300: Longest Increasing Subsequence | https://leetcode.com/problems/longest-increasing-subsequence/
NeetCode video: Longest Increasing Subsequence | https://www.youtube.com/results?search_query=neetcode+longest+increasing+subsequence
:::

=== Longest Common Subsequence
@p 2
@tags dp, 2d-dp, strings, medium
@quick
- `dp[i][j]` = LCS of `text1[0..i)` and `text2[0..j)`.
- Letters equal → `dp[i−1][j−1] + 1`; different → `max(dp[i−1][j], dp[i][j−1])`.
- **O(m × n) time**, O(m × n) space (or O(min(m, n)) with two rows).
- The foundation of `diff` tools, git merges and DNA alignment.

::: text 🧾 Problem
Return the length of the **longest common subsequence** of two strings: the longest sequence of characters that appears in **both**, in the same order, not necessarily contiguous. Return 0 if there's none.

**Example 1:** `"abcde", "ace" → 3` ("ace").
**Example 2:** `"abc", "def" → 0`.

**Constraints:** 1 ≤ m, n ≤ 1000, lowercase letters.
:::

::: text 🧒 Intuition
Two friends describe their day as a list of activities; you want the **longest story they both share** in the same order (they may have done extra things in between). Compare their lists from the start: if the current activities match, that's part of the shared story, so move both forward. If not, try skipping an activity from one friend or the other, and keep the better result. A table remembers the answer for every pair of "how far into each list".
:::

::: text 🐢 Brute force
**Idea:** generate all 2ᵐ subsequences of `text1` and check each against `text2` (O(n) each).

**Complexity:** O(n · 2ᵐ): for m = 1000 that's astronomically large. A plain recursion `lcs(i, j)` without memo is also exponential (it branches twice whenever letters differ).
:::

::: text 💡 Key insight
The answer for prefixes `(i, j)` only depends on three smaller pairs: `(i−1, j−1)`, `(i−1, j)`, `(i, j−1)`. There are only `(m + 1) × (n + 1)` pairs, so filling a 2-D table row by row computes all of them in O(m × n).

**Pattern name: 2-D DP on two strings.**
:::

::: diagram Fill the table cell by cell
flowchart TD
  A["dp = (m+1) × (n+1) zeros"] --> B["for i = 1..m, for j = 1..n"]
  B --> C{"text1[i-1] === text2[j-1]?"}
  C -->|"yes"| D["dp[i][j] = dp[i-1][j-1] + 1 (diagonal)"]
  C -->|"no"| E["dp[i][j] = max(dp[i-1][j], dp[i][j-1]) (up or left)"]
  D --> B
  E --> B
  B -->|"done"| F["answer dp[m][n]"]
:::

::: image Longest Common Subsequence: 2-D table for abcde and ace; the bottom-right cell is 3
/images/dsa-recursion-dp/lcs.svg
:::

::: text 🔍 Dry run: text1 = "abcde", text2 = "ace" (rows = text1, columns = text2)
| | "" | a | c | e |
|---|---|---|---|---|
| "" | 0 | 0 | 0 | 0 |
| a | 0 | **1** (a = a) | 1 | 1 |
| b | 0 | 1 | 1 | 1 |
| c | 0 | 1 | **2** (c = c) | 2 |
| d | 0 | 1 | 2 | 2 |
| e | 0 | 1 | 2 | **3** (e = e) |

Answer `dp[5][3]` = **3**. Walking back along the bold diagonal steps gives "ace".
:::

::: code javascript Full table, rebuild the string, and two-row version, with tests (runnable)
/**
 * Longest Common Subsequence. Time O(m·n), Space O(m·n). Also rebuilds one LCS string.
 */
function lcs(text1, text2) {
  const m = text1.length, n = text2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0)); // row/col 0 = empty prefix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;  // match → extend the diagonal
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);              // skip a char from one side
    }
  }
  // Walk back from the bottom-right to rebuild one LCS
  let i = m, j = n, out = '';
  while (i > 0 && j > 0) {
    if (text1[i - 1] === text2[j - 1]) { out = text1[i - 1] + out; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { length: dp[m][n], sequence: out };
}

/** Space-optimised: only the previous row is needed. O(min(m, n)) space. */
function lcsLength(a, b) {
  if (b.length > a.length) [a, b] = [b, a];       // keep the row short
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** Check that s is a subsequence of t (for testing the rebuilt string). */
const isSubseq = (s, t) => { let k = 0; for (const ch of t) if (ch === s[k]) k++; return k === s.length; };

// ---------- tests ----------
const cases = [
  ['abcde', 'ace', 3],
  ['abc', 'abc', 3],
  ['abc', 'def', 0],
  ['', 'abc', 0],
  ['AGGTAB', 'GXTXAYB', 4],   // "GTAB"
  ['bsbininm', 'jmjkbkjkv', 1],
];
for (const [a, b, expected] of cases) {
  const r = lcs(a, b);
  const ok = r.length === expected && lcsLength(a, b) === expected && r.sequence.length === expected && isSubseq(r.sequence, a) && isSubseq(r.sequence, b);
  console.log(JSON.stringify(a), JSON.stringify(b), '→', r.length, JSON.stringify(r.sequence), ok ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Work for two strings of length n: all subsequences of one (n·2^n) vs DP table (n²)
n,All subsequences n·2^n,DP table n²
10,10240,100
15,491520,225
20,20971520,400
25,838860800,625
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All subsequences | O(n · 2ᵐ) | O(m) | – | Exponential | Never |
| Recursion + memo | O(m · n) | O(m · n) + stack | Natural top-down | Stack depth m + n | If you think recursively |
| **Bottom-up table** | **O(m · n)** | O(m · n) | Can rebuild the LCS | Memory for 1000 × 1000 = 10⁶ cells | Default; when the sequence is needed |
| Two rows | O(m · n) | O(min(m, n)) | Little memory | Can't rebuild the string easily | Only the length is needed |
:::

::: warning ⚠️ Common mistakes / edge cases
- Off-by-one: the table is `(m + 1) × (n + 1)` and compares `text1[i − 1]` with `text2[j − 1]`.
- Confusing **subsequence** (gaps allowed) with **substring** (contiguous: then on a mismatch `dp[i][j] = 0`).
- Using `dp[i − 1][j − 1]` on a mismatch (it should be the max of up and left).
- Building the row with `new Array(n).fill([])` (shared inner arrays). Use `Array.from`.
:::

::: understand
- 2-D DP on two sequences is the family of [Edit Distance](https://leetcode.com/problems/edit-distance/), [Longest Common Substring](https://leetcode.com/problems/maximum-length-of-repeated-subarray/), [Distinct Subsequences](https://leetcode.com/problems/distinct-subsequences/), [Interleaving String](https://leetcode.com/problems/interleaving-string/). Tools like `git diff` are built on LCS-style algorithms.
:::

::: ask
- *"Subsequence or substring?"*
- *"Return the length or the sequence itself?"*
- *"How long are the strings?"* (Memory for the full table.)
:::

::: important ⭐ How to explain it in the interview
> "I define dp[i][j] as the LCS length of the first i characters of text1 and the first j of text2. If the current characters match, it's dp[i−1][j−1] + 1; otherwise I skip a character from one string: max(dp[i−1][j], dp[i][j−1]). Row and column zero are empty prefixes with value 0. I fill the table row by row and return dp[m][n]: O(m × n) time and space, or O(min(m, n)) space if I keep only two rows. Walking back through the table rebuilds the subsequence."
:::

::: links
LeetCode 1143: Longest Common Subsequence | https://leetcode.com/problems/longest-common-subsequence/
NeetCode video: Longest Common Subsequence | https://www.youtube.com/results?search_query=neetcode+longest+common+subsequence
LeetCode 72: Edit Distance | https://leetcode.com/problems/edit-distance/
:::
