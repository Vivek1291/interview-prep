@section DSA: Recursion, Backtracking & DP
@icon 🔁
@color #0891b2
@desc Tier 9 + Tier 12: choose → explore → backtrack, subsets, permutations, combination sum, word search, and the classic DP problems.

=== Backtracking template: Subsets
@p 2
@tags backtracking, recursion, subsets
@quick
- Backtracking = **Choose → Explore → Un-choose (backtrack)**.
- Subsets: at each index, include or exclude → 2ⁿ subsets; **O(n · 2ⁿ)**.
- Template: `backtrack(start, path)` → record `path` → for i from start: push, recurse(i+1), pop.
- Push a **copy** (`[...path]`), not `path` itself.
- Duplicates (Subsets II): sort + skip `nums[i] === nums[i-1]` when `i > start`.

::: text
### The universal backtracking template
1. **Base case / record**: is the current path a valid answer? Save a **copy**.
2. **Loop over choices** starting at `start` (avoids reusing earlier elements → combinations, not permutations).
3. **Choose**: `path.push(choice)`
4. **Explore**: `backtrack(next state)`
5. **Un-choose**: `path.pop()` (restore state for the next choice)

Subsets / combinations / permutations / N-Queens / Sudoku all fit this shape.
:::

::: diagram Decision tree for subsets of [1,2,3]
flowchart TD
  R["[]"] --> A["[1]"]
  R --> B["[2]"]
  R --> C["[3]"]
  A --> AB["[1,2]"]
  A --> AC["[1,3]"]
  AB --> ABC["[1,2,3]"]
  B --> BC["[2,3]"]
:::

::: code javascript Solution + tests
function subsets(nums) {
  const result = [];
  const path = [];
  function backtrack(start) {
    result.push([...path]);                 // every node is a valid subset
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);                   // choose
      backtrack(i + 1);                     // explore
      path.pop();                           // un-choose
    }
  }
  backtrack(0);
  return result;
}

// Subsets II (with duplicates)
function subsetsWithDup(nums) {
  nums = [...nums].sort((a, b) => a - b);
  const res = [], path = [];
  (function bt(start) {
    res.push([...path]);
    for (let i = start; i < nums.length; i++) {
      if (i > start && nums[i] === nums[i - 1]) continue; // skip duplicate branch
      path.push(nums[i]); bt(i + 1); path.pop();
    }
  })(0);
  return res;
}

const s = subsets([1, 2, 3]);
console.log(JSON.stringify(s), s.length === 8 ? '✅ 2^3 = 8 subsets' : '❌ FAIL');
const d = subsetsWithDup([1, 2, 2]);
console.log(JSON.stringify(d), d.length === 6 ? '✅ no duplicate subsets' : '❌ FAIL');
:::

::: ask
- *"Can the input contain duplicates? Does the output order matter?"*
:::

::: links
LeetCode 78 | https://leetcode.com/problems/subsets/
:::

=== Permutations
@p 2
@tags backtracking, permutations
@quick
- Use a `used[]` array: pick any unused element at each level; when `path.length === n` → record.
- **n! permutations**, O(n · n!) time.
- Swap-based in-place alternative. Duplicates → sort + skip `if (used[i-1] is false and nums[i] === nums[i-1])`.

::: code javascript Solution + tests
function permute(nums) {
  const res = [], path = [], used = new Array(nums.length).fill(false);
  function bt() {
    if (path.length === nums.length) return res.push([...path]);
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true; path.push(nums[i]);   // choose
      bt();                                 // explore
      path.pop(); used[i] = false;          // un-choose
    }
  }
  bt();
  return res;
}
const p = permute([1, 2, 3]);
console.log(JSON.stringify(p), p.length === 6 && new Set(p.map(String)).size === 6 ? '✅ 3! = 6 unique' : '❌ FAIL');
console.log('permute([0,1]) =', JSON.stringify(permute([0, 1])));
:::

::: ask
- *"Distinct elements? Return all or the k-th permutation?"* (The k-th permutation has a math solution.)
:::

::: links
LeetCode 46 | https://leetcode.com/problems/permutations/
:::

=== Combination Sum
@p 2
@tags backtracking, combinations
@quick
- Candidates can be **reused**: recurse with the **same index `i`** (not i+1).
- Prune: sort, and `break` when `candidate > remaining`.
- Record when `remaining === 0`.
- Combination Sum II (use each once, with duplicates) → `i + 1` + skip duplicates.

::: code javascript Solution + tests
function combinationSum(candidates, target) {
  candidates = [...candidates].sort((a, b) => a - b);
  const res = [], path = [];
  function bt(start, remaining) {
    if (remaining === 0) return res.push([...path]);
    for (let i = start; i < candidates.length; i++) {
      if (candidates[i] > remaining) break;  // pruning (sorted)
      path.push(candidates[i]);
      bt(i, remaining - candidates[i]);      // i, not i+1 → reuse allowed
      path.pop();
    }
  }
  bt(0, target);
  return res;
}
const norm = (x) => JSON.stringify(x.map((c) => c.join()).sort());
console.log(JSON.stringify(combinationSum([2, 3, 6, 7], 7)), norm(combinationSum([2, 3, 6, 7], 7)) === norm([[2, 2, 3], [7]]) ? '✅' : '❌ FAIL');
console.log(JSON.stringify(combinationSum([2, 3, 5], 8)), norm(combinationSum([2, 3, 5], 8)) === norm([[2, 2, 2, 2], [2, 3, 3], [3, 5]]) ? '✅' : '❌ FAIL');
console.log(JSON.stringify(combinationSum([2], 1)), combinationSum([2], 1).length === 0 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Can candidates be reused? Positive numbers only?"* (Negatives would make it infinite.)
:::

::: links
LeetCode 39 | https://leetcode.com/problems/combination-sum/
:::

=== Generate Parentheses
@p 2
@tags backtracking, recursion
@quick
- Build strings char by char: add `(` if `open < n`; add `)` if `close < open`.
- Record when `length === 2n`. The number of results is the Catalan number.
- The constraints guarantee validity, so there's no need to validate at the end.

::: code javascript Solution + tests
function generateParenthesis(n) {
  const res = [];
  function bt(current, open, close) {
    if (current.length === 2 * n) return res.push(current);
    if (open < n) bt(current + '(', open + 1, close);
    if (close < open) bt(current + ')', open, close + 1);
  }
  bt('', 0, 0);
  return res;
}
console.log(generateParenthesis(3), generateParenthesis(3).length === 5 ? '✅ Catalan(3)=5' : '❌ FAIL');
console.log(generateParenthesis(1).join() === '()' ? '✅' : '❌ FAIL', generateParenthesis(4).length === 14 ? '✅ Catalan(4)=14' : '❌ FAIL');
:::

::: ask
- *"Only one bracket type?"* (Multiple types → track a stack.)
:::

::: links
LeetCode 22 | https://leetcode.com/problems/generate-parentheses/
:::

=== Word Search
@p 2
@tags backtracking, grid, dfs
@quick
- DFS from each cell matching `word[0]`; mark a cell as visited (temporarily set it to '#'), explore 4 directions for the next char, then **restore** it (backtrack).
- Time O(rows · cols · 4^L), where L = word length.
- Prune early on mismatch.

::: code javascript Solution + tests
function exist(board, word) {
  const rows = board.length, cols = board[0].length;
  function dfs(r, c, i) {
    if (i === word.length) return true;
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== word[i]) return false;
    const tmp = board[r][c];
    board[r][c] = '#';                                       // choose (mark visited)
    const found = dfs(r + 1, c, i + 1) || dfs(r - 1, c, i + 1) || dfs(r, c + 1, i + 1) || dfs(r, c - 1, i + 1);
    board[r][c] = tmp;                                       // un-choose (restore)
    return found;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (dfs(r, c, 0)) return true;
  return false;
}
const board = [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']];
[['ABCCED', true], ['SEE', true], ['ABCB', false]].forEach(([w, e]) =>
  console.log(w, exist(board.map((r) => [...r]), w), exist(board.map((r) => [...r]), w) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Can a cell be reused? Many words to search?"* → Word Search II with a **Trie**.
:::

::: links
LeetCode 79 | https://leetcode.com/problems/word-search/
:::

=== Climbing Stairs (intro to DP)
@p 3
@tags dp, fibonacci, easy
@quick
- `ways(n) = ways(n-1) + ways(n-2)` (the last step was 1 or 2) → **Fibonacci**.
- Naive recursion O(2ⁿ) → **memoisation** O(n) → **bottom-up with 2 variables O(n) time, O(1) space**.
- The DP recipe: state → recurrence → base cases → order → optimise space.

::: text
### How to recognise DP
1. The problem asks for **count / min / max / is it possible**.
2. The answer can be built from answers to **smaller subproblems**.
3. Subproblems **overlap** (plain recursion recomputes them).

### Climbing stairs
To reach step n, your last move came from n−1 (1 step) or n−2 (2 steps): `f(n) = f(n−1) + f(n−2)`, `f(1) = 1`, `f(2) = 2`.
:::

::: chart bar Function calls for n=25: naive recursion vs memo
Approach,Calls
Naive recursion,150049
Memoised,47
Bottom-up loop iterations,23
:::

::: code javascript Solutions (naive → memo → bottom-up) + tests
let calls = 0;
const naive = (n) => { calls++; return n <= 2 ? n : naive(n - 1) + naive(n - 2); };

function climbMemo(n, memo = new Map()) {
  if (n <= 2) return n;
  if (memo.has(n)) return memo.get(n);
  const v = climbMemo(n - 1, memo) + climbMemo(n - 2, memo);
  memo.set(n, v);
  return v;
}

function climbStairs(n) {        // O(n) time, O(1) space
  if (n <= 2) return n;
  let prev2 = 1, prev1 = 2;
  for (let i = 3; i <= n; i++) [prev2, prev1] = [prev1, prev1 + prev2];
  return prev1;
}

console.log('naive(25) =', naive(25), 'calls:', calls);
[[1, 1], [2, 2], [3, 3], [5, 8], [45, 1836311903]].forEach(([n, e]) =>
  console.log('n=' + n, climbStairs(n), climbStairs(n) === e && climbMemo(n) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Steps of 1 or 2 only, or a set of allowed steps?"* (Generalises to Coin Change-style DP.)
:::

::: links
LeetCode 70 | https://leetcode.com/problems/climbing-stairs/
:::

=== House Robber
@p 3
@tags dp, medium
@quick
- `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`: skip house i, or rob it plus the best up to i−2.
- O(n) time, **O(1) space** with two variables.
- Circular street (II): max(rob(0…n−2), rob(1…n−1)).

::: code javascript Solution + tests
function rob(nums) {
  let prev2 = 0, prev1 = 0; // best up to i-2, best up to i-1
  for (const money of nums) {
    const current = Math.max(prev1, prev2 + money);
    prev2 = prev1;
    prev1 = current;
  }
  return prev1;
}
const robCircular = (nums) => (nums.length === 1 ? nums[0] : Math.max(rob(nums.slice(0, -1)), rob(nums.slice(1))));

[[[1, 2, 3, 1], 4], [[2, 7, 9, 3, 1], 12], [[2, 1, 1, 2], 4], [[], 0]].forEach(([n, e]) =>
  console.log(JSON.stringify(n), rob(n), rob(n) === e ? '✅' : '❌ FAIL'));
console.log('circular [2,3,2] =', robCircular([2, 3, 2]), robCircular([2, 3, 2]) === 3 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Circular street? Negative amounts?"* Explain the recurrence before coding.
:::

::: links
LeetCode 198 | https://leetcode.com/problems/house-robber/
:::

=== Coin Change
@p 2
@tags dp, unbounded-knapsack, medium
@quick
- `dp[a]` = min coins to make amount a; `dp[0] = 0`; `dp[a] = min(dp[a - coin] + 1)` over the coins.
- O(amount × coins) time, O(amount) space. Return -1 if `dp[amount]` is still Infinity.
- Greedy (take the largest coin) **fails** for coins like [1, 3, 4], amount 6 (greedy 4+1+1 = 3 coins, optimal 3+3 = 2).
- Count the number of ways (Coin Change II): loop coins outer, amounts inner.

::: code javascript Solution + tests
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}

// number of combinations (Coin Change II)
function change(amount, coins) {
  const dp = new Array(amount + 1).fill(0);
  dp[0] = 1;
  for (const c of coins) for (let a = c; a <= amount; a++) dp[a] += dp[a - c];
  return dp[amount];
}

[[[1, 2, 5], 11, 3], [[2], 3, -1], [[1], 0, 0], [[1, 3, 4], 6, 2]].forEach(([c, a, e]) =>
  console.log(JSON.stringify(c), a, coinChange(c, a), coinChange(c, a) === e ? '✅' : '❌ FAIL'));
console.log('ways to make 5 with [1,2,5]:', change(5, [1, 2, 5]), change(5, [1, 2, 5]) === 4 ? '✅' : '❌ FAIL');
:::

::: ask
- *"Unlimited coins of each type? Minimum count or number of ways?"*
:::

::: links
LeetCode 322 | https://leetcode.com/problems/coin-change/
:::

=== Longest Increasing Subsequence
@p 2
@tags dp, binary-search, medium
@quick
- DP O(n²): `dp[i] = 1 + max(dp[j])` for j < i with `nums[j] < nums[i]`.
- **Patience sorting O(n log n)**: keep `tails[len] = smallest tail of an increasing subsequence of length len+1`; binary search for the position of each number.
- Subsequence = not necessarily contiguous.

::: code javascript Solutions + tests
function lengthOfLIS_DP(nums) {
  const dp = new Array(nums.length).fill(1);
  for (let i = 1; i < nums.length; i++)
    for (let j = 0; j < i; j++)
      if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
  return nums.length ? Math.max(...dp) : 0;
}

function lengthOfLIS(nums) {           // O(n log n)
  const tails = [];
  for (const x of nums) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
    tails[lo] = x;                      // replace or append
  }
  return tails.length;
}

[[[10, 9, 2, 5, 3, 7, 101, 18], 4], [[0, 1, 0, 3, 2, 3], 4], [[7, 7, 7, 7], 1], [[], 0]].forEach(([n, e]) =>
  console.log(JSON.stringify(n), lengthOfLIS(n), lengthOfLIS(n) === e && lengthOfLIS_DP(n) === e ? '✅' : '❌ FAIL'));
:::

::: ask
- *"Strictly increasing? Return the length or the actual sequence?"* (The sequence needs parent pointers.)
:::

::: links
LeetCode 300 | https://leetcode.com/problems/longest-increasing-subsequence/
:::

=== Longest Common Subsequence
@p 2
@tags dp, 2d-dp, strings, medium
@quick
- 2D DP: `dp[i][j]` = LCS of `a[0..i)` and `b[0..j)`.
- Characters match → `dp[i-1][j-1] + 1`; else `max(dp[i-1][j], dp[i][j-1])`.
- **O(n·m)** time; space can be reduced to O(min(n, m)) with one row.
- Basis for diff tools (git diff), edit distance, DNA alignment.

::: text
**Problem:** `text1 = "abcde", text2 = "ace" → 3` ("ace")

| | "" | a | c | e |
|---|---|---|---|---|
| "" | 0 | 0 | 0 | 0 |
| a | 0 | **1** | 1 | 1 |
| b | 0 | 1 | 1 | 1 |
| c | 0 | 1 | **2** | 2 |
| d | 0 | 1 | 2 | 2 |
| e | 0 | 1 | 2 | **3** |
:::

::: code javascript Solution + tests
function longestCommonSubsequence(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // reconstruct the subsequence
  let i = a.length, j = b.length, seq = '';
  while (i && j) {
    if (a[i - 1] === b[j - 1]) { seq = a[i - 1] + seq; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { length: dp[a.length][b.length], seq };
}
[['abcde', 'ace', 3], ['abc', 'abc', 3], ['abc', 'def', 0], ['AGGTAB', 'GXTXAYB', 4]].forEach(([a, b, e]) => {
  const r = longestCommonSubsequence(a, b);
  console.log(a, b, r.length, JSON.stringify(r.seq), r.length === e ? '✅' : '❌ FAIL');
});
:::

::: ask
- *"Return the length or the subsequence? Very long strings?"* (Discuss space optimisation.)
:::

::: links
LeetCode 1143 | https://leetcode.com/problems/longest-common-subsequence/
:::
