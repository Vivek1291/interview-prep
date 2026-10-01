@section DSA: Arrays, Strings & Hashing
@icon 🧮
@color #6366f1
@desc Tier 1 + Tier 2: hash map, set, prefix sum, Kadane and two-pointer basics. Every problem: intuition, brute force, key insight, picture, dry run, commented code with tests (▶ Run), chart, trade-offs and an interview script.

=== How to approach any DSA problem (patterns + Big-O cheat sheet)
@p 3
@tags patterns, big-o, approach, meta
@quick
- Flow: **clarify → brute force → find the bottleneck → optimise → code → test → time → space**.
- Big-O ladder: O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!).
- n ≤ 10⁵ (100,000) usually needs **O(n log n) or better**; ~10⁸ simple operations ≈ 1 second.
- Pattern triggers: fast lookup → **HashMap/Set** · sorted + pairs → **two pointers** · contiguous range → **sliding window** · subarray sum → **prefix sum** · top K → **heap** · grid/graph → **BFS/DFS** · all combinations → **backtracking** · overlapping subproblems → **DP**.
- Say the brute force out loud first: it proves you understand the problem and gives you something to optimise.

::: text 🧒 In simple words
A DSA interview is not a memory test. It's a **thinking-out-loud test**: the interviewer wants to watch you turn a vague problem into working code, step by step, while explaining your choices.

Think of it like a **doctor's visit**: a good doctor first asks questions (clarify), then considers the obvious explanation (brute force), notices what doesn't fit (bottleneck), picks the right test (pattern), treats (code) and checks the result (test). Jumping straight to "surgery" (code) without asking questions is the most common way candidates fail.

**Big-O** is just a way to say *"how does the work grow when the input grows?"* If the input doubles, does the work double (O(n)), quadruple (O(n²)) or barely change (O(log n))?
:::

::: text 📖 Detailed answer
## The 8-step interview flow
1. **Clarify**: input size, types, duplicates, negatives, empty input, sorted?, what to return (index or value?), can I modify the input?
2. **Brute force**: say the simplest correct idea and its complexity, even if it's slow. *"Check every pair: O(n²)."*
3. **Find the bottleneck**: which part repeats work? *"For each number I search the whole array for its partner."*
4. **Optimise**: remove the repeated work with a pattern (table below). *"A hash map makes that search O(1)."*
5. **Code**: clean names, small helpers, explain as you type.
6. **Test**: walk through one normal example by hand, then edge cases (empty, one element, duplicates, negatives, very large).
7. **Time complexity**: count how many times the main loop body runs.
8. **Space complexity**: count the extra memory you created (maps, arrays, recursion stack).

## Big-O in plain words
| Big-O | Name | Real-life picture | n = 1,000,000 → about |
|---|---|---|---|
| O(1) | constant | Grab the top plate of a stack | 1 step |
| O(log n) | logarithmic | Find a word in a dictionary by halving | 20 steps |
| O(n) | linear | Read every page of a book once | 1,000,000 steps |
| O(n log n) | linearithmic | Sort a deck of cards smartly | 20,000,000 steps |
| O(n²) | quadratic | Everyone shakes hands with everyone | 10¹² steps (too slow) |
| O(2ⁿ) | exponential | Try every subset of items | impossible |

**Rule of thumb:** a computer does roughly **10⁸ simple operations per second**. So for n = 10⁵, O(n²) = 10¹⁰ operations ≈ 100 seconds (too slow), while O(n log n) ≈ 1.7 × 10⁶ (instant).

## Pattern recognition
| If you see… | Think… | Typical complexity |
|---|---|---|
| "Find a pair / complement", "seen before?", counting | **Hash map / Set** | O(n) |
| Sorted array, pair with a target, palindromes | **Two pointers** | O(n) |
| Longest/shortest **contiguous** substring/subarray with a rule | **Sliding window** | O(n) |
| Subarray **sum equals K**, range sums | **Prefix sum + hash map** | O(n) |
| Next greater/smaller element | **Monotonic stack** | O(n) |
| Sorted input, "minimum speed/capacity that works" | **Binary search** | O(log n) or O(n log m) |
| Top/Kth largest, merge K sorted lists, running median | **Heap** | O(n log k) |
| Grids, islands, shortest path, dependencies | **BFS / DFS / topological sort** | O(V + E) |
| All combinations / permutations / subsets | **Backtracking** | O(2ⁿ) or O(n!) |
| Count ways / min cost with repeated sub-questions | **Dynamic programming** | depends on states |
:::

::: diagram The interview loop
flowchart LR
  A["1. Clarify"] --> B["2. Brute force + its Big-O"]
  B --> C["3. Find the bottleneck"]
  C --> D["4. Pick a pattern"]
  D --> E["5. Code it"]
  E --> F["6. Test: normal + edge cases"]
  F --> G["7-8. Time + space"]
  F -->|"bug found"| E
  G -->|"interviewer: can you do better?"| C
:::

::: image How to approach any DSA problem: the 8 steps and pattern triggers
/images/dsa-arrays-hashing/dsa-approach.svg
:::

::: chart line Operations for growing n (how fast each Big-O grows)
n,O(log n),O(n),O(n log n),O(n²)
10,3,10,33,100
100,7,100,664,10000
1000,10,1000,9966,1000000
10000,13,10000,132877,100000000
:::

::: text 🪜 Step by step: estimating complexity
1. Find the **loops**. One loop over n items → O(n). A loop inside a loop over the same items → O(n²).
2. Look at what happens **inside** the loop. `map.get()` / `set.has()` are O(1) on average; `array.includes()` and `indexOf()` are O(n) (they loop too!).
3. **Halving** the search space each step (binary search) → O(log n).
4. **Sorting** costs O(n log n). If you sort first, your solution is at least O(n log n).
5. Recursion: (number of calls) × (work per call). Fibonacci without memo makes ~2ⁿ calls.
6. Space: count new arrays/maps/sets that grow with n, plus the recursion depth.
:::

::: code javascript Feel the difference: O(n²) vs O(n) on 20,000 numbers (runnable)
// We solve the same problem (find two numbers that add up to target) in two ways
// and count how many "steps" each one takes.
const n = 20000;
const nums = Array.from({ length: n }, (_, i) => i); // [0, 1, 2, ..., 19999]
const target = (n - 1) + (n - 2);                    // the two LAST numbers: worst case for brute force

function bruteForce(nums, target) {
  let steps = 0;
  for (let i = 0; i < nums.length; i++) {            // pick the first number
    for (let j = i + 1; j < nums.length; j++) {      // try every number after it
      steps++;
      if (nums[i] + nums[j] === target) return { pair: [i, j], steps };
    }
  }
  return { pair: [], steps };
}

function hashMap(nums, target) {
  let steps = 0;
  const seen = new Map();                            // value → index
  for (let i = 0; i < nums.length; i++) {
    steps++;
    const need = target - nums[i];                   // the partner we are looking for
    if (seen.has(need)) return { pair: [seen.get(need), i], steps };
    seen.set(nums[i], i);                            // remember this number for later
  }
  return { pair: [], steps };
}

const a = bruteForce(nums, target);
const b = hashMap(nums, target);
console.log('brute force steps:', a.steps.toLocaleString());  // ~200 million
console.log('hash map steps:   ', b.steps.toLocaleString());  // 20 thousand
console.log(JSON.stringify(a.pair) === JSON.stringify(b.pair) ? '✅ same answer' : '❌ FAIL different answers');
console.log(a.steps > 1000 * b.steps ? '✅ hash map is over 1000× fewer steps' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- **Coding immediately** without clarifying: you solve the wrong problem (indices vs values, sorted vs unsorted).
- **Hiding the brute force** because it's "bad": interviewers want to hear it first.
- Forgetting that `includes`, `indexOf`, `slice`, `splice` and `shift` are **O(n)**: using them in a loop makes O(n²).
- Not testing **edge cases**: empty input, one element, all duplicates, negative numbers.
- Saying "O(n)" without saying **what n is** (length of the array? number of words? total characters?).
:::

::: understand
- Patterns exist because most problems hide **repeated work**. Every optimisation is a way to stop doing the same thing twice: remember it (hash map), skip it (two pointers / binary search) or reuse it (prefix sum / DP).
- Big-O ignores constants: 2n and 100n are both O(n). It describes the **growth**, not the exact time.
- Related practice: [Two Sum](https://leetcode.com/problems/two-sum/) (hash map), [Valid Palindrome](https://leetcode.com/problems/valid-palindrome/) (two pointers), [Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/) (sliding window).
:::

::: ask
- *"Can the input be empty? Can it contain negatives or duplicates? Is it sorted?"*
- *"Should I return indices or values? Is there always exactly one answer?"*
- *"How large can n be?"* (This tells you which complexity is acceptable.)
- *"Can I modify the input array, or should I keep it unchanged?"*
- Trap: don't assume ASCII strings. Ask about Unicode/emoji if strings are involved.
:::

::: important ⭐ How to explain it in the interview
> "Before I code, let me clarify the input: size, duplicates, negatives, and whether it's sorted. The simplest correct approach is to check every pair, which is O(n²). The bottleneck is that for each element I search the whole array again. If I store what I've seen in a hash map, that search becomes O(1), so the total is O(n) time and O(n) space. Let me code that, then walk through an example and the edge cases: an empty array, one element, and duplicates."
:::

::: links
Big-O cheat sheet | https://www.bigocheatsheet.com
NeetCode roadmap (patterns in order) | https://neetcode.io/roadmap
LeetCode patterns (Sean Prashad) | https://seanprashad.com/leetcode-patterns/
VisuAlgo: animated algorithms | https://visualgo.net/en
:::

=== Two Sum
@p 3
@tags hashmap, array, easy
@quick
- **Pattern: hash map "look up the partner"**: for each x, check if `target - x` was seen before; then store `x → index`.
- Check **before** storing, so a number never pairs with itself.
- Brute O(n²) → hash map **O(n) time, O(n) space**.
- Sorted input variant → two pointers, O(1) space (Two Sum II).
- Return **indices**, not values.

::: text 🧾 Problem
Given an array of numbers `nums` and a number `target`, return the **indices** (positions) of the two numbers that add up to `target`. You may assume there is **exactly one** answer, and you can't use the same element twice.

**Example 1:** `nums = [2, 7, 11, 15], target = 9 → [0, 1]` because `nums[0] + nums[1] = 2 + 7 = 9`.
**Example 2:** `nums = [3, 2, 4], target = 6 → [1, 2]` (not `[0, 0]`: you can't use the 3 twice).

**Constraints:** 2 ≤ n ≤ 10⁴, values can be negative, exactly one valid answer.
:::

::: text 🧒 Intuition
Imagine a **school dance**: every student wears a number, and a pair can dance only if their numbers add up to 9. A slow way: each student walks to every other student and asks "do we add up to 9?".

A smart way: there's a **guest book at the door**. When student "7" arrives, they think "I need a 2". They check the guest book: is a 2 already inside? Yes, at position 0 → found the pair. If not, they write "7 is at position 1" in the book and go in.

By hand you'd do the same: walk through the list once, and for each number ask *"have I already seen my partner?"*
:::

::: text 🐢 Brute force
**Idea:** try every pair `(i, j)` with `i < j` and check if they add up to `target`.

`for i in 0..n-1:`
↳ `for j in i+1..n-1:`
↳ ↳ `if nums[i] + nums[j] === target: return [i, j]`

**Complexity:** O(n²) time, O(1) space.
**Why it's slow:** the number of pairs is n(n−1)/2. For n = 10⁵ that's about **5 × 10⁹ checks**, which takes ~50 seconds at 10⁸ operations/second. The waste: for each `i` we scan the whole array looking for one specific value, `target - nums[i]`.
:::

::: text 💡 Key insight
"Search for a specific value" is exactly what a **hash map** does in **O(1)** on average. So instead of scanning for the partner, we **remember** every number we've passed in a map `value → index`, and look the partner up instantly.

**Pattern name: Hash map (complement lookup).** Whenever you think *"have I seen X before?"*, reach for a Map or Set.
:::

::: diagram One pass with a hash map
flowchart TD
  S["Start: seen = empty Map"] --> L{"More numbers?"}
  L -->|"no"| N["Return [] (no pair)"]
  L -->|"yes: take x = nums[i]"| C["need = target - x"]
  C --> H{"Is need in seen?"}
  H -->|"yes"| R["Return [seen.get(need), i]"]
  H -->|"no"| P["seen.set(x, i)"]
  P --> L
:::

::: image Two Sum: at index 1 we need 2, and the map already holds 2 at index 0
/images/dsa-arrays-hashing/two-sum.svg
:::

::: text 🔍 Dry run: nums = [2, 7, 11, 15], target = 9
| Step | i | x = nums[i] | need = 9 − x | need in map? | Action | map after step |
|---|---|---|---|---|---|---|
| 1 | 0 | 2 | 7 | no | store 2 → 0 | {2: 0} |
| 2 | 1 | 7 | 2 | **yes (index 0)** | return [0, 1] | {2: 0} |

Second example, `nums = [3, 2, 4], target = 6`:
| Step | i | x | need | in map? | Action | map |
|---|---|---|---|---|---|---|
| 1 | 0 | 3 | 3 | no (map is empty) | store 3 → 0 | {3: 0} |
| 2 | 1 | 2 | 4 | no | store 2 → 1 | {3: 0, 2: 1} |
| 3 | 2 | 4 | 2 | **yes (index 1)** | return [1, 2] | |

Notice step 1: the 3 needs another 3, but we look it up **before** storing, so the 3 can't pair with itself.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Two Sum: return the indices of the two numbers that add up to target.
 * Time O(n): one pass, each Map operation is O(1) on average.
 * Space O(n): the map can hold up to n numbers.
 */
function twoSum(nums, target) {
  const seen = new Map();                 // remembers: value → the index where we saw it
  for (let i = 0; i < nums.length; i++) { // visit every number exactly once
    const x = nums[i];                    // the current number
    const need = target - x;              // the partner that would complete the sum
    if (seen.has(need)) {                 // did we already pass the partner?
      return [seen.get(need), i];         // yes → earlier index first, then current index
    }
    seen.set(x, i);                       // no → remember x for future numbers
  }
  return [];                              // no pair found (the problem says this won't happen)
}

// ---------- tests ----------
const tests = [
  { nums: [2, 7, 11, 15], target: 9, expected: [0, 1] },     // basic example
  { nums: [3, 2, 4], target: 6, expected: [1, 2] },          // must not use 3 twice
  { nums: [3, 3], target: 6, expected: [0, 1] },             // duplicates are two different elements
  { nums: [-1, -2, -3, -4, -5], target: -8, expected: [2, 4] }, // negatives
  { nums: [0, 4, 3, 0], target: 0, expected: [0, 3] },       // zeros
  { nums: [1, 2], target: 7, expected: [] },                 // no answer → empty array
];
for (const { nums, target, expected } of tests) {
  const got = twoSum(nums, target);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(JSON.stringify(nums), 'target', target, '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL expected ' + JSON.stringify(expected));
}

// large input: 100,000 numbers, partner pair at the very end
const big = Array.from({ length: 100000 }, (_, i) => i);
const t0 = Date.now();
const r = twoSum(big, 99998 + 99999);
console.log('n = 100,000 →', JSON.stringify(r), 'in', Date.now() - t0, 'ms', JSON.stringify(r) === '[99998,99999]' ? '✅' : '❌ FAIL');
:::

::: chart line Steps needed: brute force (all pairs) vs hash map (one pass)
n,Brute force n(n-1)/2,Hash map n
10,45,10
100,4950,100
1000,499500,1000
10000,49995000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Brute force (all pairs) | O(n²) | O(1) | Simplest, no extra memory | Far too slow for big n | n is tiny (< 1,000) or as a first answer |
| Sort + two pointers | O(n log n) | O(n) to keep original indices | No hash map; great if already sorted | Sorting loses the original indices (must store pairs) | Input is **already sorted** (Two Sum II → O(1) space) |
| **Hash map (one pass)** | **O(n)** | O(n) | Fastest, one pass, keeps indices | Uses extra memory | Default answer for unsorted input |
:::

::: warning ⚠️ Common mistakes / edge cases
- Storing **before** checking → `[3, 2, 4], target 6` would return `[0, 0]` (3 + 3 using the same element).
- Using `if (seen.get(need))` instead of `seen.has(need)`: index **0** is falsy, so you miss the answer.
- Returning the **values** instead of the indices.
- Using an object `{}` with negative or non-string keys: works, but `Map` is cleaner and avoids prototype keys like `"constructor"`.
- Sorting the array first and then returning indices of the **sorted** array (they no longer match the original).
:::

::: understand
- The pattern is **"complement lookup"**: turn a search ("find the partner") into a memory lookup (hash map). The same idea solves [Subarray Sum Equals K](https://leetcode.com/problems/subarray-sum-equals-k/) (look up `prefix - k`), [4Sum II](https://leetcode.com/problems/4sum-ii/) and [Contains Duplicate](https://leetcode.com/problems/contains-duplicate/).
- If the array is **sorted**, two pointers solve it in O(1) space: [Two Sum II](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/).
- Trading **memory for speed** is the core idea behind most hash-map solutions.
:::

::: ask
- *"Is there always exactly one solution? What should I return if there's none?"*
- *"Can the array contain duplicates or negative numbers?"*
- *"Is the array sorted?"* (Sorted → two pointers with O(1) space.)
- *"Should I return indices or the values? Does the order of the two indices matter?"*
:::

::: important ⭐ How to explain it in the interview
> "Clarify: I return two indices, exactly one answer exists, and I can't reuse an element. Brute force checks all pairs: O(n²). The bottleneck is searching for the partner, target minus x, on every iteration. A hash map from value to index turns that search into O(1). In one pass, for each number I first check whether its partner is already in the map, and if so return both indices; otherwise I store the number. Checking before storing prevents pairing an element with itself. Testing: [3,2,4] with target 6 gives [1,2], and duplicates like [3,3] work. Time O(n), space O(n). If the input were sorted I'd use two pointers for O(1) space."
:::

::: links
LeetCode 1: Two Sum | https://leetcode.com/problems/two-sum/
NeetCode video: Two Sum | https://www.youtube.com/results?search_query=neetcode+Two+Sum
Two Sum II (sorted, two pointers) | https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
:::

=== Contains Duplicate
@p 3
@tags set, array, easy
@quick
- **Pattern: Set as a "guest list"**: if you've seen it → true; otherwise add it.
- **O(n) time, O(n) space**; return early on the first duplicate.
- Sort alternative: O(n log n) time, O(1) extra space (but changes the input).
- One-liner: `new Set(nums).size !== nums.length` (always scans everything).

::: text 🧾 Problem
Given an array `nums`, return `true` if **any value appears at least twice**, and `false` if every element is distinct.

**Example 1:** `[1, 2, 3, 1] → true` (1 appears twice).
**Example 2:** `[1, 2, 3, 4] → false`.

**Constraints:** 1 ≤ n ≤ 10⁵, values can be negative.
:::

::: text 🧒 Intuition
Think of a **bouncer at a club with a guest list**. Each person who arrives gives their name. The bouncer checks the list: if the name is already written there, someone is trying to come in twice → alarm! Otherwise, they write the name down.

By hand: you'd read the numbers one by one and keep a mental list of "numbers I've already seen". The moment one repeats, you stop.
:::

::: text 🐢 Brute force
**Idea:** compare every element with every element after it.

`for i in 0..n-1:`
↳ `for j in i+1..n-1:`
↳ ↳ `if nums[i] === nums[j]: return true`
`return false`

**Complexity:** O(n²) time, O(1) space.
**Why it's slow:** for n = 10⁵ there are ~5 × 10⁹ comparisons (about 50 seconds). Every element is compared again and again with the same others.
:::

::: text 💡 Key insight
We only need to answer *"have I seen this value before?"* for each element. A **Set** answers that in O(1) on average, so one pass is enough.

Alternative insight: after **sorting**, equal values sit **next to each other**, so we only compare neighbours.

**Pattern name: Hash set (membership check).**
:::

::: diagram Set membership check
flowchart TD
  S["seen = new Set()"] --> L{"Next number x?"}
  L -->|"none left"| F["return false"]
  L -->|"x"| H{"seen.has(x)?"}
  H -->|"yes"| T["return true (duplicate)"]
  H -->|"no"| A["seen.add(x)"]
  A --> L
:::

::: image Contains Duplicate: the second 1 is already in the Set
/images/dsa-arrays-hashing/contains-duplicate.svg
:::

::: text 🔍 Dry run: nums = [1, 2, 3, 1]
| Step | x | seen before the check | seen.has(x)? | Action | seen after |
|---|---|---|---|---|---|
| 1 | 1 | {} | no | add 1 | {1} |
| 2 | 2 | {1} | no | add 2 | {1, 2} |
| 3 | 3 | {1, 2} | no | add 3 | {1, 2, 3} |
| 4 | 1 | {1, 2, 3} | **yes** | **return true** | |

For `[1, 2, 3, 4]` all four checks say "no", the loop ends, and we return `false`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Contains Duplicate: true if any value appears at least twice.
 * Time O(n), Space O(n).
 */
function containsDuplicate(nums) {
  const seen = new Set();          // values we have already met
  for (const x of nums) {          // look at each value once
    if (seen.has(x)) return true;  // already met → duplicate found, stop early
    seen.add(x);                   // first time → remember it
  }
  return false;                    // finished without a repeat
}

// Alternative 1: one-liner (simple, but always builds the full Set)
const containsDuplicateOneLiner = (nums) => new Set(nums).size !== nums.length;

// Alternative 2: sort a copy, then compare neighbours. O(n log n) time.
function containsDuplicateSorted(nums) {
  const sorted = [...nums].sort((a, b) => a - b); // numeric sort! (default sort compares strings)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) return true; // equal neighbours = duplicate
  }
  return false;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 1], true],                      // basic duplicate
  [[1, 2, 3, 4], false],                     // all distinct
  [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2], true],    // many duplicates
  [[], false],                               // empty
  [[7], false],                              // one element
  [[-1, 0, -1], true],                       // negatives
  [[10, 9, 100, 2], false],                  // default .sort() would order these as strings
];
for (const [input, expected] of cases) {
  const a = containsDuplicate(input);
  const b = containsDuplicateOneLiner(input);
  const c = containsDuplicateSorted(input);
  const ok = a === expected && b === expected && c === expected;
  console.log(JSON.stringify(input), '→', a, ok ? '✅' : '❌ FAIL expected ' + expected);
}

// early exit: the duplicate is at the start of a huge array, the Set loop stops immediately
const huge = [5, 5, ...Array.from({ length: 200000 }, (_, i) => i + 10)];
console.log('huge input with an early duplicate →', containsDuplicate(huge), containsDuplicate(huge) === true ? '✅' : '❌ FAIL');
:::

::: chart line Comparisons: all pairs vs sort (n log n) vs Set (n)
n,All pairs n(n-1)/2,Sort ~n log2 n,Set n
10,45,33,10
100,4950,664,100
1000,499500,9966,1000
10000,49995000,132877,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Nested loops | O(n²) | O(1) | No extra memory, trivial | Too slow for big n | Tiny arrays only |
| Sort + compare neighbours | O(n log n) | O(1) if sorting in place | Little memory | Changes the input (or needs a copy); slower | Memory is very limited |
| **Set with early exit** | **O(n)** | O(n) | Fastest; stops at the first repeat | Extra memory | Default answer |
| `new Set(nums).size` | O(n) | O(n) | One line | Never exits early | Readability matters more than speed |
:::

::: warning ⚠️ Common mistakes / edge cases
- `nums.sort()` without a compare function sorts **as strings** (`[10, 9, 100]` → `[10, 100, 9]`). Always use `(a, b) => a - b`.
- Sorting the caller's array in place when they didn't allow it (side effect).
- Using `indexOf` inside the loop: that's a hidden second loop → O(n²).
- Forgetting the empty array and single-element cases (both → false).
:::

::: understand
- The **Set membership** pattern is the simplest hash-based trick and appears everywhere: [Contains Duplicate II](https://leetcode.com/problems/contains-duplicate-ii/) (duplicates within distance k → sliding window Set), [Happy Number](https://leetcode.com/problems/happy-number/) (detect a repeated state), [Longest Consecutive Sequence](https://leetcode.com/problems/longest-consecutive-sequence/).
- Sorting groups equal values together; that's a second general trick worth remembering.
:::

::: ask
- *"Is memory limited?"* (Then sort in place for O(1) extra space.)
- *"May I modify the input array?"*
- *"Do I need to know which value is duplicated, or just true/false?"*
- *"Is it 'within k positions'?"* That's a different problem (Contains Duplicate II).
:::

::: important ⭐ How to explain it in the interview
> "I need to know whether any value repeats. Brute force compares all pairs: O(n²). Instead I walk the array once with a Set: if the current value is already in the Set I return true immediately, otherwise I add it. That's O(n) time and O(n) space. If memory were tight I'd sort and compare neighbours: O(n log n) time and O(1) extra space, but it changes the input. Edge cases: empty and single-element arrays return false."
:::

::: links
LeetCode 217: Contains Duplicate | https://leetcode.com/problems/contains-duplicate/
NeetCode video: Contains Duplicate | https://www.youtube.com/results?search_query=neetcode+Contains+Duplicate
MDN: Set | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
:::

=== Valid Anagram
@p 3
@tags hashmap, string, counting, easy
@quick
- Different lengths → `false` immediately.
- **Pattern: frequency counting**: +1 for each char of s, −1 for each char of t; all counts must end at 0.
- **O(n) time, O(1) space** for 26 lowercase letters (the array never grows).
- Sorting both strings and comparing: O(n log n).
- Unicode input → use a `Map` instead of a 26-slot array.

::: text 🧾 Problem
Given two strings `s` and `t`, return `true` if `t` is an **anagram** of `s`: it uses exactly the same letters the same number of times, just in a different order.

**Example 1:** `s = "anagram", t = "nagaram" → true`.
**Example 2:** `s = "rat", t = "car" → false` (t has a "c", s has a "t").

**Constraints:** 1 ≤ length ≤ 5 × 10⁴, lowercase English letters (follow-up: Unicode).
:::

::: text 🧒 Intuition
Imagine two bags of **Scrabble tiles**. To check if they hold the same tiles, you don't need to arrange them into words. You make a tally sheet with a row for each letter: for every tile in bag 1 add a mark (+1), for every tile in bag 2 erase a mark (−1). If every row ends at **zero**, the bags are identical.
:::

::: text 🐢 Brute force
**Idea 1 (very slow):** for each letter of `s`, find and remove a matching letter in `t` (using `indexOf` + `splice`). Each search is O(n), so the total is **O(n²)**: for n = 5 × 10⁴ that's ~2.5 × 10⁹ steps.

**Idea 2 (OK):** sort both strings and compare: `[...s].sort().join('') === [...t].sort().join('')`. That's **O(n log n)** (≈ 780,000 steps for n = 5 × 10⁴) and simple to say in an interview, but we can do better.
:::

::: text 💡 Key insight
Order doesn't matter, only **how many of each letter**. Counting is O(n), and with only 26 possible letters the tally fits in a fixed array of 26 numbers, so space stays O(1).

**Pattern name: Frequency counting (hash map / count array).**
:::

::: diagram Counting approach
flowchart TD
  A{"same length?"} -->|"no"| F["return false"]
  A -->|"yes"| B["count = 26 zeros"]
  B --> C["for each i: count[s[i]]++ and count[t[i]]--"]
  C --> D{"every count is 0?"}
  D -->|"yes"| T["return true"]
  D -->|"no"| F2["return false"]
:::

::: image Valid Anagram: counts after s and after t
/images/dsa-arrays-hashing/valid-anagram.svg
:::

::: text 🔍 Dry run: s = "anagram", t = "nagaram"
We process both strings in the same loop (index i). Only letters that change are shown.
| i | s[i] | t[i] | a | g | m | n | r |
|---|---|---|---|---|---|---|---|
| start | | | 0 | 0 | 0 | 0 | 0 |
| 0 | a (+1) | n (−1) | 1 | 0 | 0 | −1 | 0 |
| 1 | n (+1) | a (−1) | 0 | 0 | 0 | 0 | 0 |
| 2 | a (+1) | g (−1) | 1 | −1 | 0 | 0 | 0 |
| 3 | g (+1) | a (−1) | 0 | 0 | 0 | 0 | 0 |
| 4 | r (+1) | r (−1) | 0 | 0 | 0 | 0 | 0 |
| 5 | a (+1) | a (−1) | 0 | 0 | 0 | 0 | 0 |
| 6 | m (+1) | m (−1) | 0 | 0 | 0 | 0 | 0 |

All zero → **true**. For `"rat"` / `"car"`: after the loop `t = +1` and `c = −1` → **false**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Valid Anagram for lowercase a-z.
 * Time O(n), Space O(1): the count array always has 26 slots.
 */
function isAnagram(s, t) {
  if (s.length !== t.length) return false;   // different sizes can never match
  const count = new Array(26).fill(0);        // count[0] = 'a', count[1] = 'b', ...
  for (let i = 0; i < s.length; i++) {
    count[s.charCodeAt(i) - 97]++;            // 97 is the char code of 'a'
    count[t.charCodeAt(i) - 97]--;            // t cancels out s
  }
  return count.every((c) => c === 0);         // all cancelled → same letters
}

/**
 * Unicode-safe version (emoji, Hindi, accents): a Map instead of a fixed array.
 * Time O(n), Space O(k) where k = number of distinct characters.
 */
function isAnagramUnicode(s, t) {
  const a = [...s], b = [...t];               // spread splits by real characters (not UTF-16 halves)
  if (a.length !== b.length) return false;
  const m = new Map();
  for (const ch of a) m.set(ch, (m.get(ch) || 0) + 1);   // count s
  for (const ch of b) {
    if (!m.get(ch)) return false;             // t has a char that s ran out of
    m.set(ch, m.get(ch) - 1);
  }
  return true;
}

// Simple-to-say alternative: sort both. O(n log n).
const isAnagramSorted = (s, t) => s.length === t.length && [...s].sort().join('') === [...t].sort().join('');

// ---------- tests ----------
const cases = [
  ['anagram', 'nagaram', true],
  ['rat', 'car', false],
  ['a', 'ab', false],      // different lengths
  ['', '', true],          // both empty
  ['aacc', 'ccac', false], // same letters, different counts
  ['listen', 'silent', true],
];
for (const [s, t, expected] of cases) {
  const ok = isAnagram(s, t) === expected && isAnagramUnicode(s, t) === expected && isAnagramSorted(s, t) === expected;
  console.log(`"${s}" vs "${t}" →`, isAnagram(s, t), ok ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('unicode नमस्ते / स्तेनम →', isAnagramUnicode('नमस्ते', 'स्तेनम'), isAnagramUnicode('नमस्ते', 'स्तेनम') ? '✅' : '❌ FAIL');
console.log('emoji 🍕🍔 / 🍔🍕 →', isAnagramUnicode('🍕🍔', '🍔🍕'), isAnagramUnicode('🍕🍔', '🍔🍕') ? '✅' : '❌ FAIL');
:::

::: chart line Steps: remove-matching O(n²) vs sorting O(n log n) vs counting O(n)
n (length),Remove matching n²,Sort both 2·n log2 n,Count 2n
10,100,66,20
100,10000,1329,200
1000,1000000,19932,2000
10000,100000000,265754,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Find & remove each letter | O(n²) | O(n) | Intuitive | Very slow | Never (only as the first idea) |
| Sort both strings | O(n log n) | O(n) | One line, easy to explain | Slower; sorting Unicode by UTF-16 can split emoji | Quick answer, short strings |
| **Count array (26)** | **O(n)** | **O(1)** | Fastest, tiny memory | Only works for a known small alphabet | Lowercase English (the usual case) |
| Count Map | O(n) | O(k) | Works for any Unicode | Slightly slower than an array | Unicode / unknown alphabet |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting the **length check**: without it, `"a"` vs `"ab"` might look fine for the first letter.
- Using `s.split('')` on emoji: it splits a 🍕 into two broken halves. Use `[...s]`.
- Not asking about **case and spaces**: is "Dormitory" an anagram of "dirty room"? Only if you lowercase and remove spaces.
- Building two separate objects and comparing them with `JSON.stringify`: key order can differ, so equal counts can look different.
:::

::: understand
- **Frequency counting** turns "same items in any order" into "same counts". It solves [Group Anagrams](https://leetcode.com/problems/group-anagrams/) (use the counts as a key), [Find All Anagrams in a String](https://leetcode.com/problems/find-all-anagrams-in-a-string/) (counts in a sliding window) and [Ransom Note](https://leetcode.com/problems/ransom-note/).
- A fixed-size array is still O(1) space because its size doesn't grow with the input.
:::

::: ask
- *"Only lowercase a–z, or Unicode?"*
- *"Is it case-sensitive? Should spaces and punctuation be ignored?"*
- *"Can the strings be empty?"*
:::

::: important ⭐ How to explain it in the interview
> "Two strings are anagrams if they contain the same characters with the same counts. If the lengths differ I return false. Sorting both and comparing works in O(n log n), but counting is O(n): I use a 26-slot array, add one for each character of s and subtract one for each character of t, then check that every slot is zero. Space is O(1) because the array never grows. For Unicode input I'd switch to a Map and iterate with the spread operator so emoji stay whole."
:::

::: links
LeetCode 242: Valid Anagram | https://leetcode.com/problems/valid-anagram/
NeetCode video: Valid Anagram | https://www.youtube.com/results?search_query=neetcode+Valid+Anagram
MDN: String.prototype.charCodeAt | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt
:::

=== Group Anagrams
@p 3
@tags hashmap, string, medium
@quick
- **Pattern: group by a canonical key** in a `Map<key, words[]>`.
- Key = sorted letters (`"eat" → "aet"`, O(k log k) per word) or a 26-count signature (O(k) per word).
- Total: sorted key **O(n · k log k)**, count key **O(n · k)** (n words, k = max word length).
- Return `[...map.values()]`; output order usually doesn't matter.

::: text 🧾 Problem
Given an array of strings, **group the anagrams together** (words made of the same letters). Return the groups in any order.

**Example 1:** `["eat","tea","tan","ate","nat","bat"] → [["eat","tea","ate"],["tan","nat"],["bat"]]`
**Example 2:** `[""] → [[""]]`, `["a"] → [["a"]]`

**Constraints:** 1 ≤ n ≤ 10⁴ words, each word 0–100 lowercase letters.
:::

::: text 🧒 Intuition
Think of a **post office sorting room**. Every letter gets a **postcode**, and letters with the same postcode go into the same pigeonhole. For anagrams, the "postcode" is the word's letters in alphabetical order: "eat", "tea" and "ate" all become "aet", so they land in the same pigeonhole.

By hand you'd do the same: rewrite each word with its letters sorted, then collect words with the same rewritten form.
:::

::: text 🐢 Brute force
**Idea:** for each word, compare it with every existing group using an anagram check (Valid Anagram, O(k)).

`for each word:`
↳ `for each existing group: if isAnagram(word, group[0]) → add and stop`
↳ `if no group matched → start a new group`

**Complexity:** O(n² · k) in the worst case (every word is in its own group). For n = 10⁴ words of length 10 that's ~10⁹ character checks. The waste: we keep re-comparing words instead of computing a "label" once.
:::

::: text 💡 Key insight
Anagrams share a **signature** that's identical for all of them and different from everything else. Compute it once per word and use it as a **hash map key**: grouping becomes one lookup per word.

- **Sorted-letters key**: `"tea" → "aet"`. Easy, O(k log k) per word.
- **Count key**: `"tea" → "1#0#0#0#1#…#1#…"` (26 counts). O(k) per word; better for long words.

**Pattern name: Hash map grouping by canonical key.**
:::

::: diagram Grouping with a canonical key
flowchart LR
  W["word"] --> K["key = sorted letters"]
  K --> Q{"key in map?"}
  Q -->|"no"| N["map.set(key, [])"]
  Q -->|"yes"| P["map.get(key).push(word)"]
  N --> P
  P --> R["answer = [...map.values()]"]
:::

::: image Group Anagrams: eat, tea, ate share key aet; tan, nat share ant; bat is alone
/images/dsa-arrays-hashing/group-anagrams.svg
:::

::: text 🔍 Dry run: ["eat","tea","tan","ate","nat","bat"]
| Step | word | key (sorted) | new key? | map after step |
|---|---|---|---|---|
| 1 | eat | aet | yes | aet → [eat] |
| 2 | tea | aet | no | aet → [eat, tea] |
| 3 | tan | ant | yes | aet → [eat, tea]; ant → [tan] |
| 4 | ate | aet | no | aet → [eat, tea, ate]; ant → [tan] |
| 5 | nat | ant | no | …; ant → [tan, nat] |
| 6 | bat | abt | yes | …; abt → [bat] |

Answer: `[["eat","tea","ate"], ["tan","nat"], ["bat"]]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Group Anagrams with a 26-count key: O(n · k) time, O(n · k) space.
 * n = number of words, k = length of the longest word.
 */
function groupAnagrams(strs) {
  const groups = new Map();                       // key → list of words with that key
  for (const word of strs) {
    const count = new Array(26).fill(0);          // letter counts for this word
    for (const ch of word) count[ch.charCodeAt(0) - 97]++;
    const key = count.join('#');                  // "#" separator keeps counts like 1,11 and 11,1 apart
    if (!groups.has(key)) groups.set(key, []);    // first word with this signature → new group
    groups.get(key).push(word);                   // add the word to its group
  }
  return [...groups.values()];                    // only the groups are needed, not the keys
}

/** Simpler version: sorted letters as the key. O(n · k log k). */
function groupAnagramsSorted(strs) {
  const m = new Map();
  for (const w of strs) {
    const key = [...w].sort().join('');           // "tea" → "aet"
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(w);
  }
  return [...m.values()];
}

// Groups can come back in any order → normalise before comparing
const normalize = (groups) => JSON.stringify(groups.map((g) => [...g].sort()).sort());

// ---------- tests ----------
const cases = [
  [['eat', 'tea', 'tan', 'ate', 'nat', 'bat'], [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]],
  [[''], [['']]],                                 // one empty string
  [['a'], [['a']]],                               // one letter
  [['abc', 'bca', 'xyz'], [['abc', 'bca'], ['xyz']]],
  [['ab', 'a', 'b'], [['ab'], ['a'], ['b']]],     // different lengths never group
];
for (const [input, expected] of cases) {
  const a = groupAnagrams(input), b = groupAnagramsSorted(input);
  const ok = normalize(a) === normalize(expected) && normalize(b) === normalize(expected);
  console.log(JSON.stringify(input), '→', JSON.stringify(a), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Character operations for words of length k = 10: compare-with-groups vs sorted key vs count key
n (words),Compare with every group n²·k,Sorted key n·k·log2 k,Count key n·k
10,1000,332,100
100,100000,3322,1000
1000,10000000,33219,10000
10000,1000000000,332193,100000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Compare with every group | O(n² · k) | O(n · k) | No hashing needed | Very slow when there are many groups | Never in an interview answer |
| **Sorted-letters key** | O(n · k log k) | O(n · k) | Shortest code, easy to explain | log k factor | Default for short words |
| **Count key (26)** | **O(n · k)** | O(n · k) | Fastest for long words | Keys are long strings; only for a fixed alphabet | Long words / interviewer asks to optimise |
:::

::: warning ⚠️ Common mistakes / edge cases
- Joining counts **without a separator**: counts `[1, 11]` and `[11, 1]` both become `"111"` → wrong groups. Use `"#"`.
- Using `count` (an array) itself as a Map key: arrays are compared **by reference**, so every word gets its own group.
- Forgetting the empty string `""` (its key is valid: all zeros / empty).
- Assuming a specific output order in tests.
:::

::: understand
- "Group by a **canonical form**" is a general idea: normalise each item to one representative, then use it as a key. Related: [Valid Anagram](https://leetcode.com/problems/valid-anagram/), [Group Shifted Strings](https://leetcode.com/problems/group-shifted-strings/), [Find Duplicate File in System](https://leetcode.com/problems/find-duplicate-file-in-system/).
- In JavaScript, Map keys must be **primitive** (string/number) to match by value. Convert arrays to strings first.
:::

::: ask
- *"Only lowercase letters?"* (Decides between the 26-count key and the sorted key.)
- *"Does the order of groups or of words inside a group matter?"*
- *"How long can the words be?"* (Long words favour the count key.)
:::

::: important ⭐ How to explain it in the interview
> "Anagrams share a canonical form, so I group words in a hash map keyed by that form. The simple key is the sorted letters, which costs O(k log k) per word. To optimise, I use a 26-count signature joined with a separator, which is O(k) per word, so the total is O(n·k). For each word I compute its key, push it into map[key], and finally return the map's values. Edge cases: empty strings and single letters work, and the output order doesn't matter."
:::

::: links
LeetCode 49: Group Anagrams | https://leetcode.com/problems/group-anagrams/
NeetCode video: Group Anagrams | https://www.youtube.com/results?search_query=neetcode+Group+Anagrams
MDN: Map | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
:::

=== Best Time to Buy and Sell Stock
@p 3
@tags array, greedy, sliding-window, easy
@quick
- Track the **minimum price so far**; profit if sold today = price − minSoFar; keep the max.
- **O(n) time, O(1) space**, one pass.
- You must buy **before** you sell; return 0 if prices only go down.
- Variants: unlimited transactions = sum of every upward step; cooldown/fee → DP.

::: text 🧾 Problem
`prices[i]` is a stock's price on day `i`. Choose **one** day to buy and a **later** day to sell. Return the maximum profit, or `0` if no profit is possible.

**Example 1:** `[7, 1, 5, 3, 6, 4] → 5` (buy at 1 on day 2, sell at 6 on day 5).
**Example 2:** `[7, 6, 4, 3, 1] → 0` (prices only fall, so don't trade).

**Constraints:** 1 ≤ n ≤ 10⁵, 0 ≤ price ≤ 10⁴.
:::

::: text 🧒 Intuition
Imagine you can **travel back in time** but only with a notebook. Each day you write down the **cheapest price you've seen so far**. Then, standing on today, you ask: "if I had bought on that cheapest day and sell today, how much would I make?" Keep the best answer.

You never need to remember every past price, only the cheapest one, because selling today is always best paired with the cheapest earlier day.
:::

::: text 🐢 Brute force
**Idea:** try every buy day `i` and every later sell day `j`, and keep the best `prices[j] - prices[i]`.

`for i in 0..n-1:`
↳ `for j in i+1..n-1: best = max(best, prices[j] - prices[i])`

**Complexity:** O(n²) time, O(1) space. For n = 10⁵ → ~5 × 10⁹ pairs (~50 s). The waste: for each sell day we re-scan all earlier days to find the minimum, which we could simply **remember**.
:::

::: text 💡 Key insight
For a sell day `j`, the best buy day is simply the **minimum price before j**. Keep that minimum in one variable while scanning: one pass, two variables.

**Pattern name: Greedy running minimum** (a sliding window where the left edge jumps to a new low).
:::

::: diagram One pass with a running minimum
flowchart TD
  S["minPrice = Infinity, best = 0"] --> L{"next price p?"}
  L -->|"no more"| R["return best"]
  L -->|"p"| M{"p < minPrice?"}
  M -->|"yes"| U["minPrice = p (better buy day)"]
  M -->|"no"| P["best = max(best, p - minPrice)"]
  U --> L
  P --> L
:::

::: image Best Time to Buy and Sell Stock: buy at the lowest point before the peak
/images/dsa-arrays-hashing/best-time-stock.svg
:::

::: text 🔍 Dry run: prices = [7, 1, 5, 3, 6, 4]
| Day | price | minPrice before | price < min? | profit if sold today | best |
|---|---|---|---|---|---|
| 1 | 7 | ∞ | yes → min = 7 | | 0 |
| 2 | 1 | 7 | yes → min = 1 | | 0 |
| 3 | 5 | 1 | no | 5 − 1 = 4 | 4 |
| 4 | 3 | 1 | no | 3 − 1 = 2 | 4 |
| 5 | 6 | 1 | no | 6 − 1 = **5** | **5** |
| 6 | 4 | 1 | no | 4 − 1 = 3 | 5 |

Answer: **5**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Best Time to Buy and Sell Stock (one transaction).
 * Time O(n), Space O(1).
 */
function maxProfit(prices) {
  let minPrice = Infinity;   // cheapest price seen so far (best day to have bought)
  let best = 0;              // best profit so far (0 = don't trade)
  for (const price of prices) {
    if (price < minPrice) {
      minPrice = price;                          // found a cheaper day to buy
    } else {
      best = Math.max(best, price - minPrice);   // what if I sell today?
    }
  }
  return best;
}

/** Variant II: unlimited transactions → collect every upward step. */
function maxProfitUnlimited(prices) {
  let total = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1]; // buy yesterday, sell today
  }
  return total;
}

/** Brute force (for checking): every pair. */
function maxProfitBrute(prices) {
  let best = 0;
  for (let i = 0; i < prices.length; i++)
    for (let j = i + 1; j < prices.length; j++) best = Math.max(best, prices[j] - prices[i]);
  return best;
}

// ---------- tests ----------
const cases = [
  [[7, 1, 5, 3, 6, 4], 5],
  [[7, 6, 4, 3, 1], 0],   // only falling → 0
  [[2, 4, 1], 2],         // the minimum comes AFTER the best sell day
  [[1], 0],               // one day → can't trade
  [[], 0],                // no days
  [[3, 3, 3], 0],         // flat
];
for (const [p, expected] of cases) {
  const got = maxProfit(p);
  console.log(JSON.stringify(p), '→', got, got === expected && maxProfitBrute(p) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
console.log('unlimited [7,1,5,3,6,4] =', maxProfitUnlimited([7, 1, 5, 3, 6, 4]), maxProfitUnlimited([7, 1, 5, 3, 6, 4]) === 7 ? '✅' : '❌ FAIL');

// random cross-check against brute force
let allOk = true;
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: 1 + Math.floor(Math.random() * 30) }, () => Math.floor(Math.random() * 50));
  if (maxProfit(arr) !== maxProfitBrute(arr)) allOk = false;
}
console.log('200 random arrays match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Steps: all pairs vs one pass
n (days),All pairs n(n-1)/2,One pass n
10,45,10
100,4950,100
1000,499500,1000
10000,49995000,10000
:::

::: chart line Prices [7,1,5,3,6,4] with the running minimum: profit = gap between the two lines
Day,Price,Min so far
1,7,7
2,1,1
3,5,1
4,3,1
5,6,1
6,4,1
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All pairs | O(n²) | O(1) | Obvious | Too slow | First idea only |
| **Running minimum** | **O(n)** | **O(1)** | Optimal, tiny | Only for ONE transaction | The standard problem |
| Kadane on daily differences | O(n) | O(1) | Shows the link to Maximum Subarray | Less intuitive | To impress / follow-up |
| DP with states (hold / not hold) | O(n) | O(1) | Extends to fees, cooldown, k transactions | More code | Follow-up variants |
:::

::: warning ⚠️ Common mistakes / edge cases
- Selling **before** buying (taking `max - min` of the whole array): `[2, 4, 1]` would give 3, but the 1 comes after the 4 → correct answer 2.
- Initialising `best` with a negative number: the answer can't be below 0 (you can choose not to trade).
- Forgetting empty or one-day inputs.
- Confusing the variants: one transaction (this), unlimited (II), at most two (III), with cooldown, with a fee.
:::

::: understand
- "Remember the best thing seen so far" (running min/max) is the simplest **greedy** pattern. It's also Kadane in disguise: profit = max subarray sum of daily price differences. See [Maximum Subarray](https://leetcode.com/problems/maximum-subarray/), [Best Time to Buy and Sell Stock II](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-ii/), [with Cooldown](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/).
:::

::: ask
- *"Exactly one buy and one sell, or many transactions?"*
- *"Are there fees or a cooldown?"*
- *"Should I return the profit or the days?"*
- *"Can prices be empty?"*
:::

::: important ⭐ How to explain it in the interview
> "For any sell day, the best buy day is the cheapest day before it. So I scan once, keeping the minimum price seen so far and the best profit. For each price I either update the minimum or compute price minus minimum and update the best. That's O(n) time and O(1) space, versus O(n²) for checking all pairs. Edge cases: falling prices return 0, and a minimum that appears after the peak is handled because I only compare with earlier days."
:::

::: links
LeetCode 121: Best Time to Buy and Sell Stock | https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
NeetCode video: Best Time to Buy and Sell Stock | https://www.youtube.com/results?search_query=neetcode+Best+Time+to+Buy+and+Sell+Stock
LeetCode 122: Stock II (unlimited) | https://leetcode.com/problems/best-time-to-buy-and-sell-stock-ii/
:::

=== Maximum Subarray (Kadane's algorithm)
@p 3
@tags kadane, dp, array, medium
@quick
- Kadane: `cur = max(x, cur + x)`; `best = max(best, cur)`.
- Idea: a **negative running sum only hurts**, so restart from the current element.
- **O(n) time, O(1) space**. Initialise with `nums[0]` (handles all-negative arrays).
- Track the start/end index if the subarray itself is asked for.

::: text 🧾 Problem
Given an integer array `nums`, find the **contiguous** (no gaps) non-empty subarray with the **largest sum** and return that sum.

**Example 1:** `[-2, 1, -3, 4, -1, 2, 1, -5, 4] → 6` (the subarray `[4, -1, 2, 1]`).
**Example 2:** `[-3, -1, -2] → -1` (all negative: the best is the single largest element).

**Constraints:** 1 ≤ n ≤ 10⁵, values between −10⁴ and 10⁴.
:::

::: text 🧒 Intuition
Imagine walking along a road collecting **coins (positive) and paying tolls (negative)**. You can start and stop your trip anywhere, and you want to end with the most money.

As you walk, you carry a running wallet total. If your wallet ever goes **negative**, it's a burden: anyone starting fresh right here would beat you. So you **drop the wallet and start again** at the next coin. Along the way you remember the best total you ever had.
:::

::: text 🐢 Brute force
**Idea:** try every start `i` and every end `j`, keep a running sum, track the maximum.

`for i in 0..n-1:`
↳ `sum = 0`
↳ `for j in i..n-1: sum += nums[j]; best = max(best, sum)`

**Complexity:** O(n²) time, O(1) space. For n = 10⁵ → ~5 × 10⁹ additions. The waste: subarrays that start with a negative prefix can never be the best, yet we keep trying them.
:::

::: text 💡 Key insight
The best subarray **ending at index i** is either:
- just `nums[i]` (start fresh), or
- `nums[i]` + the best subarray ending at `i − 1` (extend).

So `cur = max(nums[i], cur + nums[i])`, and the answer is the largest `cur` ever seen. This is **dynamic programming** where each state only needs the previous one, so it uses O(1) memory.

**Pattern name: Kadane's algorithm (1-D DP / greedy restart).**
:::

::: diagram Extend or restart
flowchart TD
  S["cur = nums[0], best = nums[0]"] --> L{"next x?"}
  L -->|"none"| R["return best"]
  L -->|"x"| D{"cur + x > x?"}
  D -->|"yes: extend"| E["cur = cur + x"]
  D -->|"no: restart"| F["cur = x"]
  E --> B["best = max(best, cur)"]
  F --> B
  B --> L
:::

::: image Kadane: running sum per index; restart where the previous sum is negative
/images/dsa-arrays-hashing/kadane.svg
:::

::: text 🔍 Dry run: [-2, 1, -3, 4, -1, 2, 1, -5, 4]
| i | x | cur + x | max(x, cur + x) = new cur | decision | best |
|---|---|---|---|---|---|
| 0 | −2 | | −2 | start | −2 |
| 1 | 1 | −1 | **1** | restart | 1 |
| 2 | −3 | −2 | −2 | extend | 1 |
| 3 | 4 | 2 | **4** | restart | 4 |
| 4 | −1 | 3 | 3 | extend | 4 |
| 5 | 2 | 5 | 5 | extend | 5 |
| 6 | 1 | 6 | 6 | extend | **6** |
| 7 | −5 | 1 | 1 | extend | 6 |
| 8 | 4 | 5 | 5 | extend | 6 |

Answer **6**: the run that started at index 3 and peaked at index 6 → `[4, −1, 2, 1]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Maximum Subarray (Kadane). Returns the sum and the subarray.
 * Time O(n), Space O(1) (apart from the returned slice).
 */
function maxSubArray(nums) {
  let cur = nums[0];            // best sum of a subarray that ENDS at the current index
  let best = nums[0];           // best sum seen anywhere so far
  let start = 0;                // where the current run started
  let bestStart = 0, bestEnd = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > cur + nums[i]) {   // the previous run is negative → it only drags us down
      cur = nums[i];                 // restart at i
      start = i;
    } else {
      cur += nums[i];                // extend the current run
    }
    if (cur > best) {                // new record → remember the boundaries
      best = cur;
      bestStart = start;
      bestEnd = i;
    }
  }
  return { sum: best, subarray: nums.slice(bestStart, bestEnd + 1) };
}

/** Brute force for cross-checking: all subarrays. */
function maxSubArrayBrute(nums) {
  let best = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    let sum = 0;
    for (let j = i; j < nums.length; j++) { sum += nums[j]; best = Math.max(best, sum); }
  }
  return best;
}

// ---------- tests ----------
const cases = [
  [[-2, 1, -3, 4, -1, 2, 1, -5, 4], 6, [4, -1, 2, 1]],
  [[1], 1, [1]],                         // single element
  [[5, 4, -1, 7, 8], 23, [5, 4, -1, 7, 8]],  // whole array
  [[-3, -1, -2], -1, [-1]],              // all negative → best single element
  [[0, 0, 0], 0, [0]],                   // zeros
];
for (const [n, expectedSum, expectedSub] of cases) {
  const r = maxSubArray(n);
  const ok = r.sum === expectedSum && JSON.stringify(r.subarray) === JSON.stringify(expectedSub) && maxSubArrayBrute(n) === expectedSum;
  console.log(JSON.stringify(n), '→', r.sum, JSON.stringify(r.subarray), ok ? '✅' : '❌ FAIL');
}
let allOk = true;
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: 1 + Math.floor(Math.random() * 25) }, () => Math.floor(Math.random() * 21) - 10);
  if (maxSubArray(arr).sum !== maxSubArrayBrute(arr)) allOk = false;
}
console.log('200 random arrays match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Additions: all subarrays vs Kadane
n,All subarrays n(n+1)/2,Kadane n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
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

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All subarrays (running sum) | O(n²) | O(1) | Easy to get right | Too slow for 10⁵ | First idea |
| Prefix sums: max(prefix[j] − min earlier prefix) | O(n) | O(1) | Same idea as the stock problem | Slightly harder to explain | If you think in prefix sums |
| Divide & conquer | O(n log n) | O(log n) | Classic follow-up | Longer code, slower | Interviewer asks for it |
| **Kadane** | **O(n)** | **O(1)** | Optimal, short | Needs the "restart" insight | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Initialising `best = 0`: an all-negative array like `[-3, -1]` would wrongly return 0. Start with `nums[0]`.
- Resetting `cur` to 0 (instead of to `x`) when it goes negative: works only if you also handle all-negative inputs separately.
- Confusing **subarray** (contiguous) with **subsequence** (may skip elements).
- Updating `best` before updating `cur`.
:::

::: understand
- Kadane is the simplest **DP**: "best answer ending here" depends only on "best answer ending at the previous index". The same shape appears in [Best Time to Buy and Sell Stock](https://leetcode.com/problems/best-time-to-buy-and-sell-stock/), [Maximum Product Subarray](https://leetcode.com/problems/maximum-product-subarray/) (track min and max) and [Maximum Sum Circular Subarray](https://leetcode.com/problems/maximum-sum-circular-subarray/).
:::

::: ask
- *"Can all numbers be negative?"* (Then the answer is the largest single element.)
- *"Must the subarray be non-empty?"*
- *"Return the sum, or the subarray / its indices?"*
:::

::: important ⭐ How to explain it in the interview
> "Brute force tries every start and end: O(n²). The key insight is that the best subarray ending at index i either starts fresh at i or extends the best subarray ending at i − 1, so cur = max(x, cur + x). A negative running sum can only hurt, so we drop it. I track the best cur seen. One pass, O(n) time, O(1) space. I initialise with the first element so an all-negative array returns its largest element. If needed, I record where each run starts to return the subarray itself."
:::

::: links
LeetCode 53: Maximum Subarray | https://leetcode.com/problems/maximum-subarray/
NeetCode video: Maximum Subarray | https://www.youtube.com/results?search_query=neetcode+Maximum+Subarray
Kadane's algorithm (Wikipedia) | https://en.wikipedia.org/wiki/Maximum_subarray_problem
:::

=== Move Zeroes
@p 3
@tags two-pointers, in-place, easy
@quick
- **Pattern: read/write two pointers**: `write` = the next slot for a non-zero; `read` scans everything.
- Swap each non-zero into `write`, then `write++`.
- Keeps the **relative order** of non-zeros; **in place**; **O(n) time, O(1) space**.
- Swapping (instead of overwrite + fill zeros at the end) minimises total writes.

::: text 🧾 Problem
Move all `0`s in `nums` to the **end**, keeping the **relative order** of the non-zero elements. Do it **in place** (no copy of the array).

**Example 1:** `[0, 1, 0, 3, 12] → [1, 3, 12, 0, 0]`
**Example 2:** `[0] → [0]`

**Constraints:** 1 ≤ n ≤ 10⁴, modify the input array directly.
:::

::: text 🧒 Intuition
Picture a **queue at a ticket counter** where some people (the zeros) are just standing around, not buying. The manager walks down the line (`read`) and tells every real customer to step forward into the next free spot at the front (`write`). The idle people naturally end up at the back, and the customers keep their order.
:::

::: text 🐢 Brute force
**Idea A:** copy all non-zeros into a new array, then append the right number of zeros. That's O(n) time but **O(n) extra space**, and it breaks the "in place" rule.

**Idea B (in place, slow):** every time you find a zero, `splice` it out and `push` a zero to the end. `splice` shifts every later element, so each removal is O(n) → **O(n²)** in the worst case (an array full of zeros): ~10⁸ moves for n = 10⁴.
:::

::: text 💡 Key insight
Everything we've **already processed** can be split into two zones: non-zeros (in order) at the front and zeros after them. A `write` pointer marks the border. When `read` finds a non-zero, swap it to `write` and advance `write`. Each element moves at most once.

**Pattern name: Two pointers (read/write, same direction).**
:::

::: diagram Read/write pointers
flowchart LR
  A["write = 0"] --> B{"read: next element"}
  B -->|"zero"| B
  B -->|"non-zero"| C["swap nums[read] and nums[write]"]
  C --> D["write++"]
  D --> B
  B -->|"end of array"| E["done: zeros are at the end"]
:::

::: image Move Zeroes: read finds 12 and swaps it into the write slot
/images/dsa-arrays-hashing/move-zeroes.svg
:::

::: text 🔍 Dry run: [0, 1, 0, 3, 12]
| read | nums[read] | non-zero? | action | write after | array after |
|---|---|---|---|---|---|
| 0 | 0 | no | skip | 0 | [0, 1, 0, 3, 12] |
| 1 | 1 | yes | swap idx 1 ↔ 0 | 1 | [1, 0, 0, 3, 12] |
| 2 | 0 | no | skip | 1 | [1, 0, 0, 3, 12] |
| 3 | 3 | yes | swap idx 3 ↔ 1 | 2 | [1, 3, 0, 0, 12] |
| 4 | 12 | yes | swap idx 4 ↔ 2 | 3 | [1, 3, 12, 0, 0] |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Move Zeroes in place. Time O(n), Space O(1).
 */
function moveZeroes(nums) {
  let write = 0;                                   // next position for a non-zero value
  for (let read = 0; read < nums.length; read++) { // read looks at every element once
    if (nums[read] !== 0) {
      if (read !== write) {                        // avoid a pointless self-swap
        [nums[write], nums[read]] = [nums[read], nums[write]]; // move the non-zero forward
      }
      write++;                                     // the non-zero zone grew by one
    }
  }
  return nums;                                     // same array object, now rearranged
}

// ---------- tests ----------
const cases = [
  [[0, 1, 0, 3, 12], [1, 3, 12, 0, 0]],
  [[0], [0]],               // single zero
  [[1, 2, 3], [1, 2, 3]],   // no zeros
  [[0, 0, 1], [1, 0, 0]],   // zeros first
  [[], []],                 // empty
  [[-1, 0, 0, -2], [-1, -2, 0, 0]], // negatives keep their order
];
for (const [input, expected] of cases) {
  const before = JSON.stringify(input);
  const ref = input;
  const out = moveZeroes(input);
  const ok = JSON.stringify(out) === JSON.stringify(expected) && out === ref; // same array = in place
  console.log(before, '→', JSON.stringify(out), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Element moves: splice-and-push vs read/write pointers (worst case, all zeros first)
n,splice per zero ~n²/2,read/write ~n
10,50,10
100,5000,100
1000,500000,1000
10000,50000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| New array (filter + zeros) | O(n) | O(n) | Very readable | Not in place | In-place isn't required |
| splice + push | O(n²) | O(1) | In place | Slow: each splice shifts the array | Never |
| Overwrite non-zeros, then fill zeros | O(n) | O(1) | Simple | Writes every slot even if unchanged | Fine alternative |
| **Swap with read/write** | **O(n)** | **O(1)** | Fewest writes, one pass | Slightly trickier | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using `splice` inside a `for` loop: indices shift and you skip elements (and it's O(n²)).
- Returning a **new** array when the problem says in place (the caller's array stays unchanged).
- Breaking the relative order (e.g. swapping zeros with the last element).
- Forgetting the cases with no zeros or only zeros.
:::

::: understand
- The **read/write pointer** (also called "fast/slow" or "partition") pattern compacts an array in place. Same idea: [Remove Duplicates from Sorted Array](https://leetcode.com/problems/remove-duplicates-from-sorted-array/), [Remove Element](https://leetcode.com/problems/remove-element/), [Sort Colors](https://leetcode.com/problems/sort-colors/) (three pointers).
:::

::: ask
- *"Must it be in place? Must the order of non-zeros be preserved?"* (If order doesn't matter it's even simpler.)
- *"Should I minimise the number of writes?"*
:::

::: important ⭐ How to explain it in the interview
> "I keep a write pointer that marks where the next non-zero belongs. A read pointer scans the array; whenever it finds a non-zero, I swap it into the write position and advance write. Everything before write is non-zero in the original order, and everything between write and read is zero. One pass, O(n) time, O(1) space, and each element moves at most once. Edge cases: no zeros, all zeros, and an empty array all work."
:::

::: links
LeetCode 283: Move Zeroes | https://leetcode.com/problems/move-zeroes/
NeetCode video: Move Zeroes | https://www.youtube.com/results?search_query=neetcode+Move+Zeroes
VisuAlgo: arrays and sorting | https://visualgo.net/en/sorting
:::

=== Merge Sorted Arrays
@p 3
@tags two-pointers, merge, easy
@quick
- LeetCode 88: `nums1` has empty space at the end → merge **from the back** with 3 pointers (`i = m-1`, `j = n-1`, `k = m+n-1`).
- Filling from the end never overwrites values you still need. **O(m + n) time, O(1) space**.
- Loop while `j >= 0`: leftover `nums1` values are already in place.
- New-array version = the merge step of merge sort.

::: text 🧾 Problem
You get two **sorted** arrays. `nums1` has length `m + n`: its first `m` values are real and the last `n` slots are `0` placeholders. `nums2` has `n` values. Merge `nums2` into `nums1` **in place** so `nums1` ends up sorted.

**Example 1:** `nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3 → [1,2,2,3,5,6]`
**Example 2:** `nums1 = [0], m = 0, nums2 = [1], n = 1 → [1]`

**Constraints:** 0 ≤ m, n ≤ 200, both inputs sorted ascending.
:::

::: text 🧒 Intuition
Two **sorted queues of people by height** must merge into one line, and the only free space is at the **back** of line 1. If you start filling from the front, you'd push people out of their spots. Instead, compare the **tallest** person of each queue and send the taller one to the very back slot. Repeat. Nobody is ever overwritten, because the back slots were empty to begin with.
:::

::: text 🐢 Brute force
**Idea:** copy `nums2` into the empty slots, then sort `nums1`.

`for j in 0..n-1: nums1[m + j] = nums2[j]`
`nums1.sort((a, b) => a - b)`

**Complexity:** O((m + n) log(m + n)) time. It ignores the fact that both inputs are **already sorted**. For m + n = 10⁵ that's ~1.7 × 10⁶ comparisons versus 10⁵ for a real merge, and the interviewer will ask you to use the sorted order.
:::

::: text 💡 Key insight
The largest remaining value overall is always at the **end** of one of the two arrays. Place it at the last free slot `k`, then move that array's pointer left. Because the free space is at the back of `nums1`, writing from the back never destroys an unread value.

**Pattern name: Two pointers (merge), running backwards.**
:::

::: diagram Merge from the back
flowchart TD
  S["i = m-1, j = n-1, k = m+n-1"] --> L{"j >= 0?"}
  L -->|"no"| D["done: rest of nums1 already in place"]
  L -->|"yes"| C{"i >= 0 and nums1[i] > nums2[j]?"}
  C -->|"yes"| A["nums1[k] = nums1[i], i--"]
  C -->|"no"| B["nums1[k] = nums2[j], j--"]
  A --> K["k--"]
  B --> K
  K --> L
:::

::: image Merge Sorted Array: compare from the back and write the larger value into slot k
/images/dsa-arrays-hashing/merge-sorted-arrays.svg
:::

::: text 🔍 Dry run: nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3
| Step | i (nums1[i]) | j (nums2[j]) | larger | write to k | nums1 after |
|---|---|---|---|---|---|
| 1 | 2 (3) | 2 (6) | 6 from nums2 | k = 5 | [1,2,3,0,0,6] |
| 2 | 2 (3) | 1 (5) | 5 from nums2 | k = 4 | [1,2,3,0,5,6] |
| 3 | 2 (3) | 0 (2) | 3 from nums1 | k = 3 | [1,2,3,3,5,6] |
| 4 | 1 (2) | 0 (2) | tie → take nums2's 2 | k = 2 | [1,2,2,3,5,6] |
| 5 | 1 (2) | −1 | j < 0 → stop | | [1,2,2,3,5,6] |

The 1 and 2 left in `nums1` were already in the right place.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Merge Sorted Array (LeetCode 88), in place, from the back.
 * Time O(m + n), Space O(1).
 */
function merge(nums1, m, nums2, n) {
  let i = m - 1;          // last real value of nums1
  let j = n - 1;          // last value of nums2
  let k = m + n - 1;      // last slot of nums1 (the next place to write)
  while (j >= 0) {        // once nums2 is used up, the rest of nums1 is already sorted in place
    if (i >= 0 && nums1[i] > nums2[j]) {
      nums1[k] = nums1[i];  // nums1 has the bigger value → move it to the back
      i--;
    } else {
      nums1[k] = nums2[j];  // nums2's value is bigger (or equal, or nums1 is exhausted)
      j--;
    }
    k--;                    // the next free slot is one to the left
  }
  return nums1;
}

/** Merge into a NEW array (the merge step of merge sort). */
function mergeNew(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]); // take the smaller head
  while (i < a.length) out.push(a[i++]);   // leftovers of a
  while (j < b.length) out.push(b[j++]);   // leftovers of b
  return out;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3, [1, 2, 2, 3, 5, 6]],
  [[1], 1, [], 0, [1]],                    // nothing to merge
  [[0], 0, [1], 1, [1]],                   // nums1 has no real values
  [[4, 5, 6, 0, 0, 0], 3, [1, 2, 3], 3, [1, 2, 3, 4, 5, 6]], // all of nums2 goes first
  [[-1, 0, 0, 0], 1, [-3, -2, 5], 3, [-3, -2, -1, 5]],      // negatives
];
for (const [a, m, b, n, expected] of cases) {
  const got = merge([...a], m, [...b], n);
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(mergeNew(a.slice(0, m), b)) === JSON.stringify(expected);
  console.log(JSON.stringify(a), m, JSON.stringify(b), n, '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Comparisons: copy + sort vs two-pointer merge (m + n total)
m + n,Copy + sort ~N log2 N,Merge N
10,33,10
100,664,100
1000,9966,1000
10000,132877,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Copy + sort | O(N log N) | O(1)–O(N) (sort internals) | One line | Ignores that the input is sorted | Never as the final answer |
| Merge into a new array | O(N) | O(N) | Classic, easy | Extra array; problem asks in place | When a new array is fine |
| **Merge from the back** | **O(N)** | **O(1)** | In place, optimal | Must think backwards | LeetCode 88 |
:::

::: warning ⚠️ Common mistakes / edge cases
- Merging from the **front** into `nums1`: you overwrite values you haven't read yet.
- Looping `while (i >= 0 && j >= 0)` and forgetting the leftover `nums2` values (when nums2 has the smallest numbers).
- Forgetting `m = 0` (nums1 has only placeholders) or `n = 0`.
- Using `.sort()` without a compare function (sorts as strings).
:::

::: understand
- The **merge** of two sorted lists is the heart of merge sort and appears in [Merge Two Sorted Lists](https://leetcode.com/problems/merge-two-sorted-lists/), [Merge k Sorted Lists](https://leetcode.com/problems/merge-k-sorted-lists/) and [Squares of a Sorted Array](https://leetcode.com/problems/squares-of-a-sorted-array/) (also filled from the back).
- "Fill from the back" is a general trick whenever the free space is at the end.
:::

::: ask
- *"In place into nums1, or may I return a new array?"*
- *"Can m or n be 0? Can there be duplicates or negatives?"*
:::

::: important ⭐ How to explain it in the interview
> "Both arrays are sorted and nums1 has free space at the end, so I merge from the back. Three pointers: i at the last real value of nums1, j at the end of nums2, and k at the last slot. Each step I write the larger of nums1[i] and nums2[j] into k and move that pointer. I loop while j ≥ 0; anything left in nums1 is already in place. Writing from the back never overwrites unread values. O(m + n) time, O(1) space."
:::

::: links
LeetCode 88: Merge Sorted Array | https://leetcode.com/problems/merge-sorted-array/
NeetCode video: Merge Sorted Array | https://www.youtube.com/results?search_query=neetcode+Merge+Sorted+Array
VisuAlgo: merge sort | https://visualgo.net/en/sorting
:::

=== Remove Duplicates from Sorted Array
@p 2
@tags two-pointers, in-place, easy
@quick
- Sorted → duplicates are **adjacent**.
- `write` = next slot for a new unique value; copy when `nums[read] !== nums[write - 1]`.
- Return `k` (count of uniques); the first k slots hold the answer. **O(n) / O(1)**.
- Variant "at most 2 copies": compare with `nums[write - 2]`.

::: text 🧾 Problem
`nums` is sorted in non-decreasing order. Remove the duplicates **in place** so each value appears once, keep the order, and return `k`, the number of unique values. The first `k` slots of `nums` must hold them; what's after doesn't matter.

**Example 1:** `[1, 1, 2] → k = 2`, nums starts with `[1, 2]`.
**Example 2:** `[0,0,1,1,1,2,2,3,3,4] → k = 5`, nums starts with `[0,1,2,3,4]`.

**Constraints:** 1 ≤ n ≤ 3 × 10⁴, sorted.
:::

::: text 🧒 Intuition
You're writing a **guest list from a sign-in sheet** where people who arrived together signed one after another. Read down the sheet; write a name on your clean list only if it's different from the **last name you wrote**. Because duplicates are always next to each other, comparing with your last written name is enough.
:::

::: text 🐢 Brute force
**Idea:** whenever `nums[i] === nums[i + 1]`, `splice` out one copy.

`for i from n-2 down to 0:`
↳ `if nums[i] === nums[i+1]: nums.splice(i + 1, 1)`

**Complexity:** each `splice` shifts every later element → **O(n²)** in the worst case (`[1,1,1,…,1]`). For n = 3 × 10⁴ that's ~4.5 × 10⁸ moves. A Set-based copy is O(n) but uses O(n) extra space and isn't in place.
:::

::: text 💡 Key insight
Since the array is sorted, a value is "new" exactly when it differs from the **last kept value** (`nums[write - 1]`). So use two pointers moving forward: `read` scans, `write` marks where the next unique value goes. No shifting needed.

**Pattern name: Two pointers (read/write) on a sorted array.**
:::

::: diagram Keep a value only if it differs from the last kept one
flowchart TD
  S["write = 1 (first value is always unique)"] --> L{"read = 1 .. n-1"}
  L -->|"nums[read] === nums[write-1]"| L
  L -->|"different"| C["nums[write] = nums[read], write++"]
  C --> L
  L -->|"end"| R["return write (= k)"]
:::

::: image Remove Duplicates: read finds a new value and copies it to write
/images/dsa-arrays-hashing/remove-duplicates.svg
:::

::: text 🔍 Dry run: [0, 0, 1, 1, 1, 2, 2, 3]
| read | nums[read] | last kept nums[write−1] | new? | action | write after | first `write` slots |
|---|---|---|---|---|---|---|
| start | | | | | 1 | [0] |
| 1 | 0 | 0 | no | skip | 1 | [0] |
| 2 | 1 | 0 | yes | nums[1] = 1 | 2 | [0, 1] |
| 3 | 1 | 1 | no | skip | 2 | [0, 1] |
| 4 | 1 | 1 | no | skip | 2 | [0, 1] |
| 5 | 2 | 1 | yes | nums[2] = 2 | 3 | [0, 1, 2] |
| 6 | 2 | 2 | no | skip | 3 | [0, 1, 2] |
| 7 | 3 | 2 | yes | nums[3] = 3 | 4 | [0, 1, 2, 3] |

Return **k = 4**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Remove Duplicates from Sorted Array (in place). Returns k.
 * Time O(n), Space O(1).
 */
function removeDuplicates(nums) {
  if (nums.length === 0) return 0;
  let write = 1;                                    // nums[0] is always kept
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) {           // differs from the last kept value → it's new
      nums[write] = nums[read];                     // keep it
      write++;
    }
  }
  return write;                                     // number of unique values
}

/** Variant: allow each value at most twice (LeetCode 80). */
function removeDuplicatesAtMostTwo(nums) {
  let write = 0;
  for (const x of nums) {
    if (write < 2 || x !== nums[write - 2]) nums[write++] = x; // keep if it's not a third copy
  }
  return write;
}

// ---------- tests ----------
const cases = [
  [[1, 1, 2], [1, 2]],
  [[0, 0, 1, 1, 1, 2, 2, 3, 3, 4], [0, 1, 2, 3, 4]],
  [[1], [1]],                 // single element
  [[2, 2, 2, 2], [2]],        // all the same
  [[-3, -1, 0, 5], [-3, -1, 0, 5]], // already unique
];
for (const [input, expected] of cases) {
  const arr = [...input];
  const k = removeDuplicates(arr);
  const ok = k === expected.length && JSON.stringify(arr.slice(0, k)) === JSON.stringify(expected);
  console.log(JSON.stringify(input), '→ k =', k, JSON.stringify(arr.slice(0, k)), ok ? '✅' : '❌ FAIL');
}
const v = [1, 1, 1, 2, 2, 3];
const k2 = removeDuplicatesAtMostTwo(v);
console.log('at most two:', JSON.stringify(v.slice(0, k2)), JSON.stringify(v.slice(0, k2)) === '[1,1,2,2,3]' ? '✅' : '❌ FAIL');
:::

::: chart line Element moves in the worst case (all equal): splice vs read/write
n,splice ~n²/2,read/write ~n
10,50,10
100,5000,100
1000,500000,1000
10000,50000000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| `splice` duplicates | O(n²) | O(1) | Intuitive | Slow; index bugs | Never |
| `[...new Set(nums)]` | O(n) | O(n) | One line | Not in place; returns a new array | Unsorted input or no in-place rule |
| **Read/write pointers** | **O(n)** | **O(1)** | In place, optimal | Needs the sorted property | The real problem |
:::

::: warning ⚠️ Common mistakes / edge cases
- Comparing with `nums[read - 1]` instead of the last **kept** value `nums[write - 1]` (works here, but breaks in the "at most 2" variant).
- Returning the array instead of `k`.
- Forgetting the empty array.
- Using this on an **unsorted** array: duplicates aren't adjacent there.
:::

::: understand
- This is the same read/write compaction as [Move Zeroes](https://leetcode.com/problems/move-zeroes/) and [Remove Element](https://leetcode.com/problems/remove-element/). The variant [Remove Duplicates II](https://leetcode.com/problems/remove-duplicates-from-sorted-array-ii/) generalises to "at most k copies" by comparing with `nums[write - k]`.
:::

::: ask
- *"Is the array guaranteed to be sorted?"* (If not → Set, O(n) space.)
- *"Should I return k, the array, or both? What should the slots after k contain?"*
:::

::: important ⭐ How to explain it in the interview
> "Because the array is sorted, duplicates are adjacent. I keep a write pointer for the next unique slot, starting at 1, and scan with a read pointer. When nums[read] differs from the last kept value nums[write − 1], I copy it to nums[write] and advance write. At the end write is k. O(n) time, O(1) space, no shifting like splice would cause."
:::

::: links
LeetCode 26: Remove Duplicates from Sorted Array | https://leetcode.com/problems/remove-duplicates-from-sorted-array/
NeetCode video: Remove Duplicates | https://www.youtube.com/results?search_query=neetcode+Remove+Duplicates
LeetCode 80: at most twice | https://leetcode.com/problems/remove-duplicates-from-sorted-array-ii/
:::

=== Rotate Array
@p 2
@tags array, reverse, in-place, medium
@quick
- Always do `k = k % n` first (rotating n times = no change).
- **Reverse trick**: reverse all → reverse the first k → reverse the rest. **O(n) time, O(1) space**.
- Extra-array version: `result[(i + k) % n] = nums[i]` (O(n) space).
- Rotating one step at a time k times is O(n·k): too slow.

::: text 🧾 Problem
Rotate `nums` to the **right** by `k` steps, in place. Each step moves the last element to the front.

**Example 1:** `[1,2,3,4,5,6,7], k = 3 → [5,6,7,1,2,3,4]`
**Example 2:** `[-1,-100,3,99], k = 2 → [3,99,-1,-100]`

**Constraints:** 1 ≤ n ≤ 10⁵, 0 ≤ k ≤ 10⁵ (k can be bigger than n).
:::

::: text 🧒 Intuition
Think of a **train**: rotating right by 3 means the last 3 carriages are unhooked and moved to the front. The reverse trick is like turning the whole train around (now the last carriages are in front, but backwards), then turning each of the two parts around again so they face the right way.
:::

::: text 🐢 Brute force
**Idea:** rotate by one, k times: pop the last element and unshift it to the front.

`repeat k times: nums.unshift(nums.pop())`

**Complexity:** `unshift` shifts all n elements, so this is **O(n · k)**. With n = k = 10⁵ that's 10¹⁰ moves (minutes). Copying into a new array with `(i + k) % n` is O(n) but needs O(n) extra space.
:::

::: text 💡 Key insight
After rotation, the **last k** elements come first and the **first n − k** follow, each block keeping its order. Reversing the whole array puts the blocks in the right places but each block is backwards; reversing each block again fixes the order. Three reversals, each O(n), no extra array.

**Pattern name: Array reversal (in-place two pointers).**
:::

::: diagram Three reversals
flowchart LR
  A["[1,2,3,4,5,6,7]"] -->|"reverse all"| B["[7,6,5,4,3,2,1]"]
  B -->|"reverse first k = 3"| C["[5,6,7,4,3,2,1]"]
  C -->|"reverse the rest"| D["[5,6,7,1,2,3,4]"]
:::

::: image Rotate Array by 3: reverse all, reverse the first 3, reverse the rest
/images/dsa-arrays-hashing/rotate-array.svg
:::

::: text 🔍 Dry run: [1,2,3,4,5,6,7], k = 3
| Step | Range reversed | Swaps (l ↔ r) | Array after |
|---|---|---|---|
| k = k % 7 | | | k = 3 |
| 1 | 0..6 (all) | 1↔7, 2↔6, 3↔5 | [7,6,5,4,3,2,1] |
| 2 | 0..2 (first k) | 7↔5 | [5,6,7,4,3,2,1] |
| 3 | 3..6 (rest) | 4↔1, 3↔2 | [5,6,7,1,2,3,4] |
:::

::: code javascript Optimal solution with tests (runnable)
/** Reverse nums[l..r] in place with two pointers. */
function reverse(nums, l, r) {
  while (l < r) {
    [nums[l], nums[r]] = [nums[r], nums[l]]; // swap the ends
    l++;                                     // move both pointers inward
    r--;
  }
}

/**
 * Rotate right by k, in place. Time O(n), Space O(1).
 */
function rotate(nums, k) {
  const n = nums.length;
  if (n === 0) return nums;
  k = k % n;                 // rotating by n is the same as not rotating
  reverse(nums, 0, n - 1);   // 1) whole array
  reverse(nums, 0, k - 1);   // 2) first k elements (the ones that wrapped around)
  reverse(nums, k, n - 1);   // 3) the remaining n - k elements
  return nums;
}

/** Extra-array version: every element jumps to (i + k) % n. O(n) space. */
function rotateCopy(nums, k) {
  const n = nums.length, out = new Array(n);
  for (let i = 0; i < n; i++) out[(i + k) % n] = nums[i];
  return out;
}

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 4, 5, 6, 7], 3, [5, 6, 7, 1, 2, 3, 4]],
  [[-1, -100, 3, 99], 2, [3, 99, -1, -100]],
  [[1, 2], 3, [2, 1]],          // k > n
  [[1, 2, 3], 0, [1, 2, 3]],    // k = 0
  [[1, 2, 3], 3, [1, 2, 3]],    // k = n
  [[9], 100, [9]],              // single element
];
for (const [input, k, expected] of cases) {
  const got = rotate([...input], k);
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(rotateCopy(input, k)) === JSON.stringify(expected);
  console.log(JSON.stringify(input), 'k =', k, '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Element moves: rotate one step k times vs three reversals (k = n/2)
n,One step at a time n·k,Reverse trick ~2n
10,50,20
100,5000,200
1000,500000,2000
10000,50000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| pop/unshift k times | O(n · k) | O(1) | Obvious | Very slow for big k | Never |
| New array with `(i + k) % n` | O(n) | O(n) | Simple formula | Extra memory | In-place not required |
| `slice` + `concat` | O(n) | O(n) | One line in JS | Extra memory | Quick scripts |
| **Three reversals** | **O(n)** | **O(1)** | In place, elegant | Needs the insight | Default answer |
| Cyclic replacements | O(n) | O(1) | In place | Tricky gcd cycles | Follow-up only |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting `k % n`: with k > n, `reverse(nums, 0, k - 1)` goes out of bounds.
- Rotating **left** instead of right (left by k = right by n − k).
- Off-by-one in the reverse ranges (`k - 1` and `k`).
- Not handling k = 0 or a single element.
:::

::: understand
- In-place **reversal** is a building block for [Reverse Words in a String](https://leetcode.com/problems/reverse-words-in-a-string/), [Rotate Image](https://leetcode.com/problems/rotate-image/) (transpose + reverse rows) and [Rotate List](https://leetcode.com/problems/rotate-list/).
- Modulo `%` turns "wrap around" into simple arithmetic: index `(i + k) % n`.
:::

::: ask
- *"Rotate right or left?"*
- *"Can k be larger than n? Can it be 0?"*
- *"In place, or may I return a new array?"*
:::

::: important ⭐ How to explain it in the interview
> "First I reduce k with k % n. Rotating right by k moves the last k elements to the front while both blocks keep their order. If I reverse the whole array, the blocks swap places but are backwards, so I then reverse the first k and the remaining n − k elements. Three in-place reversals: O(n) time, O(1) space. The simpler alternative is a new array where element i goes to (i + k) % n, which costs O(n) memory."
:::

::: links
LeetCode 189: Rotate Array | https://leetcode.com/problems/rotate-array/
NeetCode video: Rotate Array | https://www.youtube.com/results?search_query=neetcode+Rotate+Array
:::

=== Product of Array Except Self
@p 3
@tags prefix, suffix, array, medium
@quick
- `answer[i]` = product of everything to the **left** × product of everything to the **right**.
- Pass 1 (left → right): prefix products into `answer`; pass 2 (right → left): multiply by a running suffix.
- **O(n) time, O(1) extra space** (the output array doesn't count); **no division** (zeros are fine).
- The division trick (total / nums[i]) breaks with zeros → interviewers forbid it.

::: text 🧾 Problem
Return an array `answer` where `answer[i]` is the product of **all elements except** `nums[i]`. You must run in O(n) and **without using division**.

**Example 1:** `[1, 2, 3, 4] → [24, 12, 8, 6]` (e.g. 24 = 2·3·4).
**Example 2:** `[-1, 1, 0, -3, 3] → [0, 0, 9, 0, 0]`

**Constraints:** 2 ≤ n ≤ 10⁵, the products fit in a 32-bit integer.
:::

::: text 🧒 Intuition
Imagine people standing in a line, each holding a number. To get "everyone's product except mine", I can ask: *"what's the product of everyone to my left?"* and *"what's the product of everyone to my right?"*, then multiply the two answers.

A messenger walks left → right carrying the running product and tells each person the left part. Another messenger walks right → left with the right part. Two walks and everyone knows their answer.
:::

::: text 🐢 Brute force
**Idea:** for each `i`, multiply every other element.

`for i in 0..n-1:`
↳ `p = 1; for j in 0..n-1: if j !== i: p *= nums[j]`
↳ `answer[i] = p`

**Complexity:** O(n²). For n = 10⁵ that's 10¹⁰ multiplications. Each person recomputes nearly the same product from scratch.

**Division idea:** total product / `nums[i]`. O(n), but it fails when any value is 0 (division by zero) and the problem forbids it.
:::

::: text 💡 Key insight
`answer[i] = (product of nums[0..i−1]) × (product of nums[i+1..n−1])`. Both parts are **running products**, so they can be built incrementally: a **prefix product** from the left and a **suffix product** from the right. Store the prefix in `answer`, then multiply in the suffix on the way back with a single variable.

**Pattern name: Prefix / suffix products (prefix sums with ×).**
:::

::: diagram Two passes
flowchart LR
  A["pass 1 (left → right): answer[i] = left product, left *= nums[i]"] --> B["pass 2 (right → left): answer[i] *= right, right *= nums[i]"]
  B --> C["answer[i] = left[i] × right[i]"]
:::

::: image Product Except Self: left products × right products
/images/dsa-arrays-hashing/product-except-self.svg
:::

::: text 🔍 Dry run: [1, 2, 3, 4]
**Pass 1 (left → right):** `answer[i] = left`, then `left *= nums[i]`.
| i | nums[i] | left before | answer[i] | left after |
|---|---|---|---|---|
| 0 | 1 | 1 | 1 | 1 |
| 1 | 2 | 1 | 1 | 2 |
| 2 | 3 | 2 | 2 | 6 |
| 3 | 4 | 6 | 6 | 24 |

**Pass 2 (right → left):** `answer[i] *= right`, then `right *= nums[i]`.
| i | nums[i] | right before | answer[i] | right after |
|---|---|---|---|---|
| 3 | 4 | 1 | 6 × 1 = 6 | 4 |
| 2 | 3 | 4 | 2 × 4 = 8 | 12 |
| 1 | 2 | 12 | 1 × 12 = 12 | 24 |
| 0 | 1 | 24 | 1 × 24 = 24 | 24 |

Answer: `[24, 12, 8, 6]`.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Product of Array Except Self, no division.
 * Time O(n), Space O(1) extra (the output array is required anyway).
 */
function productExceptSelf(nums) {
  const n = nums.length;
  const answer = new Array(n);
  let left = 1;                      // product of everything LEFT of i
  for (let i = 0; i < n; i++) {
    answer[i] = left;                // store the left part first
    left *= nums[i];                 // then include nums[i] for the next index
  }
  let right = 1;                     // product of everything RIGHT of i
  for (let i = n - 1; i >= 0; i--) {
    answer[i] *= right;              // left part × right part
    right *= nums[i];                // include nums[i] for the next index to the left
  }
  return answer;
}

/** Brute force for cross-checking: O(n²). */
function productBrute(nums) {
  return nums.map((_, i) => nums.reduce((p, x, j) => (j === i ? p : p * x), 1));
}

// A zero times a negative gives -0 in JavaScript; -0 === 0 is true, so a plain === comparison is safe
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- tests ----------
const cases = [
  [[1, 2, 3, 4], [24, 12, 8, 6]],
  [[-1, 1, 0, -3, 3], [0, 0, 9, 0, 0]],  // one zero
  [[0, 0, 2], [0, 0, 0]],                // two zeros → everything is 0
  [[2, 3], [3, 2]],                      // two elements
  [[-2, -3, 4], [-12, -8, 6]],           // negatives
];
for (const [input, expected] of cases) {
  const got = productExceptSelf(input);
  console.log(JSON.stringify(input), '→', JSON.stringify(got), same(got, expected) && same(productBrute(input), expected) ? '✅' : '❌ FAIL');
}
:::

::: chart line Multiplications: brute force vs prefix/suffix
n,Brute force n·(n-1),Prefix + suffix 2n
10,90,20
100,9900,200
1000,999000,2000
10000,99990000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Brute force | O(n²) | O(1) | Obvious | Too slow | First idea |
| Total product / nums[i] | O(n) | O(1) | Short | Breaks on zeros; forbidden | Never in this problem |
| Separate left[] and right[] arrays | O(n) | O(n) | Easiest to explain | Two extra arrays | Explaining step 1 |
| **Prefix in answer + running suffix** | **O(n)** | **O(1) extra** | Optimal | Slightly trickier | Final answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using division: crashes or gives `Infinity` / `NaN` with zeros.
- Multiplying `left *= nums[i]` **before** storing `answer[i] = left` (that includes nums[i] itself).
- Forgetting that two zeros make every answer 0, and one zero makes only one answer non-zero.
- Creating `left[]` and `right[]` arrays and then claiming O(1) space.
:::

::: understand
- **Prefix/suffix accumulation** is the multiplicative version of prefix sums. Related: [Range Sum Query](https://leetcode.com/problems/range-sum-query-immutable/), [Trapping Rain Water](https://leetcode.com/problems/trapping-rain-water/) (prefix max + suffix max), [Subarray Sum Equals K](https://leetcode.com/problems/subarray-sum-equals-k/).
- Question to ask yourself: *"can the answer at i be split into a left part and a right part?"*
:::

::: ask
- *"Is division allowed?"* (Usually no.)
- *"Can there be zeros? Negatives?"*
- *"Does the output array count as extra space?"* (Usually not.)
:::

::: important ⭐ How to explain it in the interview
> "Each answer is the product of everything to its left times everything to its right. In a first pass left to right, I store the running prefix product in answer[i] before multiplying in nums[i]. In a second pass right to left, I keep a running suffix product and multiply it into answer[i]. No division, so zeros are fine. O(n) time and O(1) extra space besides the output."
:::

::: links
LeetCode 238: Product of Array Except Self | https://leetcode.com/problems/product-of-array-except-self/
NeetCode video: Product of Array Except Self | https://www.youtube.com/results?search_query=neetcode+Product+of+Array+Except+Self
:::

=== Longest Substring Without Repeating Characters
@p 3
@tags sliding-window, hashmap, string, medium
@quick
- **Pattern: sliding window** `[left, right]` + a Map `char → last index`.
- On a repeat **inside** the window: `left = lastIndex + 1` (never move left backwards: use `Math.max`).
- Answer = max window length `right - left + 1`. **O(n) time, O(min(n, alphabet)) space**.
- Template: expand right → shrink left while invalid → update the answer.

::: text 🧾 Problem
Given a string `s`, return the length of the **longest substring** (contiguous characters) that has **no repeated character**.

**Example 1:** `"abcabcbb" → 3` ("abc").
**Example 2:** `"pwwkew" → 3` ("wke"; note "pwke" is a subsequence, not a substring).

**Constraints:** 0 ≤ length ≤ 5 × 10⁴; letters, digits, symbols and spaces.
:::

::: text 🧒 Intuition
Imagine reading a sentence through a **stretchy magnifying glass**. You stretch it to the right one letter at a time. The moment a letter inside the glass appears twice, you pull the **left edge** just past the earlier copy, so the glass again shows only unique letters. The widest the glass ever gets is the answer.
:::

::: text 🐢 Brute force
**Idea:** check every substring and test whether its characters are unique.

`for i in 0..n-1:`
↳ `seen = new Set()`
↳ `for j in i..n-1: if seen.has(s[j]) break; seen.add(s[j]); best = max(best, j - i + 1)`

**Complexity:** O(n²) in the worst case (O(n · alphabet) with the early break). For n = 5 × 10⁴ that's up to ~1.25 × 10⁹ steps. The waste: after a repeat, we restart from `i + 1` and re-read characters we already know are unique.
:::

::: text 💡 Key insight
When `s[right]` repeats a character at index `p` **inside** the window, every window starting at or before `p` is invalid. So we can jump `left` straight to `p + 1` instead of restarting. Both pointers only move forward → each character is processed a constant number of times.

**Pattern name: Sliding window (variable size) + hash map of last positions.**
:::

::: diagram Variable-size sliding window
flowchart TD
  S["left = 0, best = 0, last = empty Map"] --> R{"right = 0 .. n-1"}
  R -->|"done"| E["return best"]
  R -->|"ch = s[right]"| Q{"last.has(ch) and last.get(ch) >= left?"}
  Q -->|"yes: repeat inside window"| J["left = last.get(ch) + 1"]
  Q -->|"no"| U["keep left"]
  J --> W["last.set(ch, right), best = max(best, right - left + 1)"]
  U --> W
  W --> R
:::

::: image Sliding window over abcabcbb: the repeated b moves left past its last index
/images/dsa-arrays-hashing/longest-substring.svg
:::

::: text 🔍 Dry run: s = "abcabcbb"
| right | ch | last[ch] (before) | inside window? | left after | window | length | best |
|---|---|---|---|---|---|---|---|
| 0 | a | – | – | 0 | a | 1 | 1 |
| 1 | b | – | – | 0 | ab | 2 | 2 |
| 2 | c | – | – | 0 | abc | 3 | **3** |
| 3 | a | 0 | yes (0 ≥ 0) | 1 | bca | 3 | 3 |
| 4 | b | 1 | yes (1 ≥ 1) | 2 | cab | 3 | 3 |
| 5 | c | 2 | yes | 3 | abc | 3 | 3 |
| 6 | b | 4 | yes | 5 | cb | 2 | 3 |
| 7 | b | 6 | yes | 7 | b | 1 | 3 |

Answer **3**.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Longest Substring Without Repeating Characters.
 * Time O(n): right moves n times, left only moves forward.
 * Space O(k): k = number of distinct characters stored in the map.
 */
function lengthOfLongestSubstring(s) {
  const last = new Map();      // character → the last index where we saw it
  let left = 0;                // left edge of the current window (inclusive)
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    // A repeat only matters if its previous copy is INSIDE the window (index >= left)
    if (last.has(ch) && last.get(ch) >= left) {
      left = last.get(ch) + 1; // jump past the previous copy
    }
    last.set(ch, right);                      // update the latest position of ch
    best = Math.max(best, right - left + 1);  // window size = right - left + 1
  }
  return best;
}

/** Brute force for cross-checking: O(n²). */
function bruteLongest(s) {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = new Set();
    for (let j = i; j < s.length; j++) {
      if (seen.has(s[j])) break;
      seen.add(s[j]);
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
}

// ---------- tests ----------
const cases = [
  ['abcabcbb', 3],
  ['bbbbb', 1],
  ['pwwkew', 3],
  ['', 0],           // empty
  [' ', 1],          // a space is a character
  ['abba', 2],       // the second "a" is OUTSIDE the window → left must not move back
  ['dvdf', 3],
];
for (const [s, expected] of cases) {
  const got = lengthOfLongestSubstring(s);
  console.log(JSON.stringify(s), '→', got, got === expected && bruteLongest(s) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const str = Array.from({ length: Math.floor(Math.random() * 20) }, () => 'abcd'[Math.floor(Math.random() * 4)]).join('');
  if (lengthOfLongestSubstring(str) !== bruteLongest(str)) allOk = false;
}
console.log('300 random strings match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Character checks: restart from every start vs sliding window
n,All starts ~n²/2,Sliding window ~2n
10,50,20
100,5000,200
1000,500000,2000
10000,50000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All substrings + Set | O(n²) | O(k) | Easy to reason about | Too slow for 5 × 10⁴ | First idea |
| Window + Set (shrink one by one) | O(n) (≤ 2n steps) | O(k) | Generic template | Left moves step by step | When you only need "is it inside?" |
| **Window + Map of last index** | **O(n)** | O(k) | Left jumps directly | Must guard `>= left` | Default answer |
| Window + array of 128 (ASCII) | O(n) | O(1) | Fastest in practice | Only for ASCII | Interviewer says ASCII |
:::

::: warning ⚠️ Common mistakes / edge cases
- Moving `left` **backwards**: in `"abba"`, at the last `a` its previous index (0) is outside the window (left = 2). Without the `>= left` check, left would jump back to 1.
- Computing the length as `right - left` (off by one).
- Confusing **substring** (contiguous) with **subsequence**.
- Forgetting the empty string and strings with spaces.
:::

::: understand
- The sliding-window template is: **expand right → while the window is invalid, shrink left → record the answer**. It solves [Longest Repeating Character Replacement](https://leetcode.com/problems/longest-repeating-character-replacement/), [Minimum Window Substring](https://leetcode.com/problems/minimum-window-substring/) and [Permutation in String](https://leetcode.com/problems/permutation-in-string/).
- It works because the "validity" rule is **monotonic**: if a window is invalid, every bigger window containing it is invalid too.
:::

::: ask
- *"Which characters can appear: ASCII only, or Unicode?"*
- *"Is it case-sensitive?"*
- *"Return the length or the substring itself?"*
:::

::: important ⭐ How to explain it in the interview
> "I use a sliding window with two pointers and a map from character to its last index. I extend right one character at a time. If that character was last seen inside the current window, I move left to just after that previous position, never backwards. After each step the window has no repeats, so I update the best length with right − left + 1. Each pointer moves forward at most n times: O(n) time and O(k) space for the map."
:::

::: links
LeetCode 3: Longest Substring Without Repeating Characters | https://leetcode.com/problems/longest-substring-without-repeating-characters/
NeetCode video: Longest Substring | https://www.youtube.com/results?search_query=neetcode+Longest+Substring
NeetCode: sliding window explained | https://www.youtube.com/results?search_query=neetcode+sliding+window
:::

=== Valid Palindrome
@p 2
@tags two-pointers, string, easy
@quick
- **Pattern: two pointers from both ends**, skipping non-alphanumeric characters; compare lowercase.
- **O(n) time, O(1) space** (vs building a cleaned, reversed copy: O(n) space).
- Variant II: allow deleting one char → on a mismatch, try skipping the left OR the right char.
- An empty string (after cleaning) is a palindrome.

::: text 🧾 Problem
A phrase is a **palindrome** if, after lowercasing and removing everything that's not a letter or digit, it reads the same forwards and backwards. Return `true` or `false`.

**Example 1:** `"A man, a plan, a canal: Panama" → true` ("amanaplanacanalpanama").
**Example 2:** `"race a car" → false` ("raceacar").

**Constraints:** 1 ≤ length ≤ 2 × 10⁵, printable ASCII.
:::

::: text 🧒 Intuition
Two friends start at **opposite ends of a word printed on a long banner**. They walk toward each other. Whenever one of them stands on a space or punctuation, they just step over it. Each time both stand on letters, they shout their letter; if the letters ever differ, it's not a palindrome. If they meet in the middle without a mismatch, it is.
:::

::: text 🐢 Brute force
**Idea:** build a cleaned string, reverse it, compare.

`clean = s.toLowerCase().replace(/[^a-z0-9]/g, '')`
`return clean === [...clean].reverse().join('')`

**Complexity:** O(n) time but **O(n) extra space** (two new strings). It's a perfectly fine first answer; the follow-up is "can you do it in O(1) space?"
:::

::: text 💡 Key insight
A palindrome compares position `i` with position `n − 1 − i`. Two pointers can make exactly those comparisons directly on the original string, skipping the characters we'd have removed, without building any copy.

**Pattern name: Two pointers (opposite ends, moving inward).**
:::

::: diagram Two pointers moving inward
flowchart TD
  S["l = 0, r = n - 1"] --> L{"l < r?"}
  L -->|"no"| T["return true"]
  L -->|"yes"| A{"s[l] alphanumeric?"}
  A -->|"no"| A1["l++"] --> L
  A -->|"yes"| B{"s[r] alphanumeric?"}
  B -->|"no"| B1["r--"] --> L
  B -->|"yes"| C{"lower(s[l]) === lower(s[r])?"}
  C -->|"no"| F["return false"]
  C -->|"yes"| M["l++, r--"] --> L
:::

::: image Valid Palindrome: two pointers compare lowercase letters and skip punctuation
/images/dsa-arrays-hashing/valid-palindrome.svg
:::

::: text 🔍 Dry run: s = "Ab,a"
| Step | l (s[l]) | r (s[r]) | action |
|---|---|---|---|
| 1 | 0 (A) | 3 (a) | both letters: "a" vs "a" equal → l = 1, r = 2 |
| 2 | 1 (b) | 2 (,) | s[r] is not alphanumeric → r = 1 |
| 3 | 1 | 1 | l < r is false → **return true** |

And `"race a car"`: compares r–r, a–a, c–c, e vs **a** → mismatch → **false**.
:::

::: code javascript Optimal solution with tests (runnable)
/** true if ch is a letter or a digit (ASCII). */
function isAlphaNum(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122); // 0-9, A-Z, a-z
}

/**
 * Valid Palindrome with two pointers. Time O(n), Space O(1).
 */
function isPalindrome(s) {
  let l = 0, r = s.length - 1;
  while (l < r) {
    if (!isAlphaNum(s[l])) { l++; continue; }   // skip junk on the left
    if (!isAlphaNum(s[r])) { r--; continue; }   // skip junk on the right
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false; // mismatch
    l++;                                        // both matched → move inward
    r--;
  }
  return true;                                  // pointers met without a mismatch
}

/** Simple O(n)-space version for comparison. */
const isPalindromeClean = (s) => {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === [...clean].reverse().join('');
};

/** Variant II: may delete at most one character. */
function validPalindromeII(s) {
  const check = (l, r) => { while (l < r) { if (s[l] !== s[r]) return false; l++; r--; } return true; };
  let l = 0, r = s.length - 1;
  while (l < r) {
    if (s[l] !== s[r]) return check(l + 1, r) || check(l, r - 1); // skip left OR skip right
    l++; r--;
  }
  return true;
}

// ---------- tests ----------
const cases = [
  ['A man, a plan, a canal: Panama', true],
  ['race a car', false],
  [' ', true],         // only junk → empty → palindrome
  ['0P', false],       // digits count: "0" vs "p"
  ['a.', true],
  ['No lemon, no melon', true],
];
for (const [s, expected] of cases) {
  const got = isPalindrome(s);
  console.log(JSON.stringify(s), '→', got, got === expected && isPalindromeClean(s) === expected ? '✅' : '❌ FAIL');
}
console.log('II "abca" →', validPalindromeII('abca'), validPalindromeII('abca') === true && validPalindromeII('abc') === false ? '✅' : '❌ FAIL');
:::

::: chart line Extra memory (characters copied): clean + reverse vs two pointers
n,Clean + reversed copy ~2n,Two pointers
10,20,0
100,200,0
1000,2000,0
10000,20000,0
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Clean + reverse + compare | O(n) | O(n) | Very readable, 2 lines | Builds copies | First answer, short strings |
| Recursion on the cleaned string | O(n) | O(n) stack | Elegant | Stack overflow on 2 × 10⁵ chars | Avoid |
| **Two pointers, skip junk** | **O(n)** | **O(1)** | No copies, early exit on mismatch | More conditions | Final answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting that **digits count** (`"0P"` is not a palindrome).
- Using a regex like `/\w/`: it also matches `_`, which should be skipped.
- Infinite loop: forgetting to move a pointer after skipping a character.
- Comparing without lowercasing ("A" vs "a").
:::

::: understand
- Opposite-end two pointers solve [Reverse String](https://leetcode.com/problems/reverse-string/), [Two Sum II](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/), [Container With Most Water](https://leetcode.com/problems/container-with-most-water/) and [Valid Palindrome II](https://leetcode.com/problems/valid-palindrome-ii/).
- Skipping invalid characters "in place" is how you avoid allocating a cleaned copy.
:::

::: ask
- *"Should I ignore case and non-alphanumeric characters?"*
- *"Only ASCII, or Unicode letters too?"*
- *"Is an empty string a palindrome?"* (Usually yes.)
:::

::: important ⭐ How to explain it in the interview
> "The simple way is to clean the string and compare it with its reverse, which is O(n) time and O(n) space. To use O(1) space I put one pointer at each end and move them inward, skipping characters that aren't letters or digits. When both point at valid characters I compare them lowercased; any mismatch returns false. If the pointers meet, it's a palindrome. O(n) time, O(1) space."
:::

::: links
LeetCode 125: Valid Palindrome | https://leetcode.com/problems/valid-palindrome/
NeetCode video: Valid Palindrome | https://www.youtube.com/results?search_query=neetcode+Valid+Palindrome
LeetCode 680: Valid Palindrome II | https://leetcode.com/problems/valid-palindrome-ii/
:::

=== Longest Palindromic Substring
@p 2
@tags two-pointers, expand-around-center, string, medium
@quick
- **Expand around the center**: every palindrome has a center; there are 2n − 1 centers (each char + each gap).
- Expand while `s[l] === s[r]`; track the longest. **O(n²) time, O(1) space**.
- DP table is also O(n²) but uses O(n²) space; Manacher's is O(n) (rarely expected).
- Try BOTH odd centers (`i, i`) and even centers (`i, i + 1`).

::: text 🧾 Problem
Given a string `s`, return the **longest substring** that is a palindrome.

**Example 1:** `"babad" → "bab"` ("aba" is also correct).
**Example 2:** `"cbbd" → "bb"` (an even-length palindrome).

**Constraints:** 1 ≤ length ≤ 1000, digits and English letters.
:::

::: text 🧒 Intuition
Drop a **stone in a pond**: ripples spread out equally in both directions. A palindrome is like that: it grows from a **center** outwards, matching letters on both sides. So stand on each possible center, let the "ripple" grow while the letters on both sides match, and remember the biggest ripple.
:::

::: text 🐢 Brute force
**Idea:** check every substring with a palindrome test.

`for i in 0..n-1:`
↳ `for j in i..n-1: if isPalindrome(s, i, j) and j - i + 1 > best → record`

**Complexity:** O(n²) substrings × O(n) check = **O(n³)**. For n = 1000 that's ~1.7 × 10⁸ character comparisons (slow, and 10× worse for n = 2000). The waste: "aba" and "xabax" share a center; checking them separately repeats the inner comparisons.
:::

::: text 💡 Key insight
Instead of picking a substring and checking it, pick a **center** and **grow** it. Growing reuses the work: if `s[l..r]` is a palindrome, we only need one comparison to know whether `s[l−1..r+1]` is too. There are only 2n − 1 centers (odd lengths center on a character, even lengths on the gap between two), and each expansion is at most n steps → O(n²) total with O(1) memory.

**Pattern name: Expand around center (two pointers moving outward).**
:::

::: diagram Expand around every center
flowchart TD
  S["best = empty"] --> I{"for each i"}
  I --> O["expand(i, i): odd length"]
  I --> E["expand(i, i + 1): even length"]
  O --> X{"s[l] === s[r] and inside bounds?"}
  E --> X
  X -->|"yes"| G["l--, r++"] --> X
  X -->|"no"| U["palindrome = s[l+1 .. r-1], keep it if longer"]
  U --> I
:::

::: image Longest Palindromic Substring: expanding from the center a gives bab
/images/dsa-arrays-hashing/longest-palindrome.svg
:::

::: text 🔍 Dry run: s = "babad"
| center | type | expansion steps | palindrome found | best |
|---|---|---|---|---|
| 0 (b) | odd | b → l = −1 stop | "b" | "b" |
| 0–1 (ba) | even | b ≠ a stop | "" | "b" |
| 1 (a) | odd | a → b = b → l = −1 stop | "bab" | **"bab"** |
| 1–2 (ab) | even | a ≠ b | "" | "bab" |
| 2 (b) | odd | b → a = a → b ≠ d stop | "aba" | "bab" (same length) |
| 2–3 (ba) | even | b ≠ a | "" | "bab" |
| 3 (a) | odd | a → b ≠ d | "a" | "bab" |
| 4 (d) | odd | d | "d" | "bab" |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Longest Palindromic Substring by expanding around centers.
 * Time O(n²), Space O(1).
 */
function longestPalindrome(s) {
  if (s.length < 2) return s;
  let start = 0, maxLen = 1;               // best palindrome found so far: s.slice(start, start + maxLen)

  // Grow outward from (l, r) while it stays a palindrome; returns its length.
  function expand(l, r) {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      l--;                                 // step left
      r++;                                 // step right
    }
    // The loop stops one step too far on each side: the palindrome is s[l+1 .. r-1]
    const len = r - l - 1;
    if (len > maxLen) { maxLen = len; start = l + 1; }
  }

  for (let i = 0; i < s.length; i++) {
    expand(i, i);       // odd length: center is one character ("aba")
    expand(i, i + 1);   // even length: center is a gap ("abba")
  }
  return s.slice(start, start + maxLen);
}

/** Brute force for checking: O(n³). */
function bruteLongestPalindrome(s) {
  let best = '';
  for (let i = 0; i < s.length; i++)
    for (let j = i; j < s.length; j++) {
      const sub = s.slice(i, j + 1);
      if (sub.length > best.length && sub === [...sub].reverse().join('')) best = sub;
    }
  return best;
}

// ---------- tests ----------
const isPal = (x) => x === [...x].reverse().join('');
const cases = [
  ['babad', 3],     // "bab" or "aba"
  ['cbbd', 2],      // "bb" (even center)
  ['a', 1],
  ['ac', 1],
  ['forgeeksskeegfor', 10], // "geeksskeeg"
  ['aaaa', 4],
];
for (const [s, expectedLen] of cases) {
  const got = longestPalindrome(s);
  const ok = isPal(got) && got.length === expectedLen && s.includes(got) && bruteLongestPalindrome(s).length === expectedLen;
  console.log(JSON.stringify(s), '→', JSON.stringify(got), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Character comparisons (worst case): all substrings O(n³) vs expand O(n²)
n,All substrings ~n³/6,Expand around center ~n²/2
10,167,50
100,166667,5000
500,20833333,125000
1000,166666667,500000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Check every substring | O(n³) | O(1) | Obvious | Too slow | First idea |
| DP table `dp[i][j]` | O(n²) | O(n²) | Systematic, good DP practice | 1000 × 1000 = 1M cells | When asked for DP |
| **Expand around center** | **O(n²)** | **O(1)** | Short, no memory | Must handle even centers | Default answer |
| Manacher's algorithm | O(n) | O(n) | Optimal | Hard to write under pressure | Only if explicitly asked |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting **even-length** centers: `"cbbd"` would return "c" instead of "bb".
- Off-by-one when converting the stopped pointers back to the palindrome (`l + 1`, `r − 1`).
- Returning the **length** when the substring was asked (or the reverse).
- Confusing with "Longest Palindromic **Subsequence**" (a DP problem where characters may be skipped).
:::

::: understand
- "Expand from a center" reuses work by growing an answer instead of re-checking it. The same idea counts all palindromes in [Palindromic Substrings](https://leetcode.com/problems/palindromic-substrings/).
- The DP version is a good introduction to 2-D DP: `dp[i][j] = s[i] === s[j] && dp[i+1][j-1]`. See [Longest Palindromic Subsequence](https://leetcode.com/problems/longest-palindromic-subsequence/).
:::

::: ask
- *"Return the substring or its length? Any valid answer if there's a tie?"*
- *"What characters can appear? Is it case-sensitive?"*
- *"How long can the string be?"* (1000 → O(n²) is fine.)
:::

::: important ⭐ How to explain it in the interview
> "Every palindrome mirrors around a center, which is either a character or the gap between two characters, so there are 2n − 1 centers. For each one I expand two pointers outward while the characters match, and keep the longest result. Expansion reuses work: one comparison extends a known palindrome by two characters. That's O(n²) time and O(1) space, better than the O(n³) brute force and the O(n²)-memory DP. I make sure to try even centers so 'bb' is found."
:::

::: links
LeetCode 5: Longest Palindromic Substring | https://leetcode.com/problems/longest-palindromic-substring/
NeetCode video: Longest Palindromic Substring | https://www.youtube.com/results?search_query=neetcode+Longest+Palindromic+Substring
LeetCode 647: Palindromic Substrings | https://leetcode.com/problems/palindromic-substrings/
:::

=== Reverse a String
@p 2
@tags two-pointers, string, easy
@quick
- In place (char array): swap `l` and `r`, move inward. **O(n) time, O(1) space**.
- JS strings are **immutable**: `[...s].reverse().join('')` (spread keeps emoji whole; `split('')` breaks them).
- n/2 swaps; the middle character of an odd-length string stays put.
- Follow-ups: reverse words in a sentence, reverse only vowels, recursive reverse.

::: text 🧾 Problem
Reverse an array of characters **in place** (LeetCode version), or return the reversed string (JavaScript string version).

**Example 1:** `["h","e","l","l","o"] → ["o","l","l","e","h"]`
**Example 2:** `"Hannah" → "hannaH"`

**Constraints:** 1 ≤ length ≤ 10⁵, O(1) extra memory for the array version.
:::

::: text 🧒 Intuition
People standing in a row want to stand in **reverse order**. The first and last person swap places, then the second and second-to-last, and so on, until the swappers meet in the middle. Nobody needs a second row to stand in.
:::

::: text 🐢 Brute force
**Idea:** build a new string by prepending each character.

`out = ''`
`for ch of s: out = ch + out`

**Complexity:** each `ch + out` copies the whole string so far → **O(n²)** character copies in the worst case (≈ 5 × 10⁹ for n = 10⁵), plus O(n) space. A loop from the end that appends is O(n) time but still O(n) space.
:::

::: text 💡 Key insight
Position `i` and position `n − 1 − i` simply trade places. Two pointers that start at the ends and move inward perform exactly those n/2 swaps in place.

**Pattern name: Two pointers (opposite ends).**
:::

::: diagram Swap the ends, move inward
flowchart LR
  A["l = 0, r = n - 1"] --> B{"l < r?"}
  B -->|"yes"| C["swap s[l] and s[r]"]
  C --> D["l++, r--"]
  D --> B
  B -->|"no"| E["done"]
:::

::: image Reverse a String: swap h with o, then e with l
/images/dsa-arrays-hashing/reverse-string.svg
:::

::: text 🔍 Dry run: ["h","e","l","l","o"]
| Step | l | r | swap | array after |
|---|---|---|---|---|
| 1 | 0 | 4 | h ↔ o | [o, e, l, l, h] |
| 2 | 1 | 3 | e ↔ l | [o, l, l, e, h] |
| 3 | 2 | 2 | l < r is false → stop | [o, l, l, e, h] |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Reverse a character array in place. Time O(n), Space O(1).
 */
function reverseString(chars) {
  let l = 0, r = chars.length - 1;
  while (l < r) {
    [chars[l], chars[r]] = [chars[r], chars[l]]; // swap the two ends
    l++;                                         // move inward from the left
    r--;                                         // move inward from the right
  }
  return chars;
}

/** JS string version: strings are immutable, so we must build a new one. */
const reverseStr = (s) => [...s].reverse().join(''); // spread splits by real characters (emoji-safe)

/** Recursive version (for the follow-up). O(n) stack depth → avoid for huge inputs. */
const reverseRec = (s) => (s.length <= 1 ? s : reverseRec(s.slice(1)) + s[0]);

/** Follow-up: reverse the order of words. */
const reverseWords = (sentence) => sentence.trim().split(/\s+/).reverse().join(' ');

// ---------- tests ----------
const arrCases = [
  [['h', 'e', 'l', 'l', 'o'], ['o', 'l', 'l', 'e', 'h']],
  [['H', 'a', 'n', 'n', 'a', 'h'], ['h', 'a', 'n', 'n', 'a', 'H']],
  [['a'], ['a']],
  [[], []],
];
for (const [input, expected] of arrCases) {
  const got = reverseString([...input]);
  console.log(JSON.stringify(input), '→', JSON.stringify(got), JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
console.log(reverseStr('hello'), reverseStr('hello') === 'olleh' && reverseRec('hello') === 'olleh' ? '✅' : '❌ FAIL');
console.log('emoji:', reverseStr('a🍕b'), reverseStr('a🍕b') === 'b🍕a' ? '✅ spread keeps 🍕 whole' : '❌ FAIL');
console.log('split("") breaks emoji:', 'a🍕b'.split('').reverse().join('') !== 'b🍕a' ? '✅ (as expected, it is broken)' : '❌ FAIL');
console.log(reverseWords('  the sky  is blue '), reverseWords('  the sky  is blue ') === 'blue is sky the' ? '✅' : '❌ FAIL');
:::

::: chart line Characters copied: prepend in a loop vs in-place swaps
n,Prepend ch + out ~n²/2,In-place swaps n/2
10,50,5
100,5000,50
1000,500000,500
10000,50000000,5000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Prepend in a loop | O(n²) | O(n) | Obvious | Quadratic copying | Never |
| `[...s].reverse().join('')` | O(n) | O(n) | One line, emoji-safe | New string | JS strings (immutable anyway) |
| Recursion | O(n²) with slices | O(n) stack | Shows recursion | Stack overflow, slow | Only if asked |
| **Two-pointer swap** | **O(n)** | **O(1)** | In place, optimal | Needs a mutable array | Char array version |
:::

::: warning ⚠️ Common mistakes / edge cases
- Trying to assign `s[0] = 'x'` on a JS **string**: it silently does nothing (strings are immutable).
- Using `split('')` on emoji or accented characters: it splits UTF-16 surrogate pairs and corrupts them.
- Looping `while (l <= r)`: harmless here, but swapping the middle with itself is wasted work.
- Using recursion on 10⁵ characters → "Maximum call stack size exceeded".
:::

::: understand
- Reversal is a building block: [Rotate Array](https://leetcode.com/problems/rotate-array/) (three reversals), [Reverse Words in a String](https://leetcode.com/problems/reverse-words-in-a-string/), [Reverse Vowels of a String](https://leetcode.com/problems/reverse-vowels-of-a-string/), [Reverse Linked List](https://leetcode.com/problems/reverse-linked-list/).
:::

::: ask
- *"Is the input a string or a character array? Must it be in place?"*
- *"Can it contain emoji or other Unicode characters?"*
:::

::: important ⭐ How to explain it in the interview
> "For a character array I use two pointers at the ends, swap, and move inward until they meet: n/2 swaps, O(n) time, O(1) space. In JavaScript, strings are immutable, so for a string input I'd spread it into an array, reverse, and join, which is O(n) space; I use spread rather than split('') so emoji aren't broken."
:::

::: links
LeetCode 344: Reverse String | https://leetcode.com/problems/reverse-string/
NeetCode video: Reverse String | https://www.youtube.com/results?search_query=neetcode+Reverse+String
MDN: Array.prototype.reverse | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reverse
:::

=== First Unique Character in a String
@p 2
@tags hashmap, counting, easy
@quick
- Two passes: **count** frequencies → return the first index whose count is 1. **O(n) time, O(1) space** (26 letters).
- Return `-1` if every character repeats.
- Don't use `indexOf === lastIndexOf` in a loop: that's O(n²).
- Streaming input → count map + queue of candidates.

::: text 🧾 Problem
Given a string `s`, return the **index** of the first character that appears **exactly once**. If there's none, return `-1`.

**Example 1:** `"leetcode" → 0` ("l").
**Example 2:** `"loveleetcode" → 2` ("v"); `"aabb" → -1`.

**Constraints:** 1 ≤ length ≤ 10⁵, lowercase letters.
:::

::: text 🧒 Intuition
A teacher wants the **first student in the roll call whose name is unique** in the class. First she tallies how many times each name appears (one walk through the list). Then she reads the list again from the top and stops at the first name with a tally of 1.
:::

::: text 🐢 Brute force
**Idea:** for each index i, scan the whole string to see if `s[i]` appears anywhere else.

`for i in 0..n-1:`
↳ `if no j !== i with s[j] === s[i]: return i`
`return -1`

**Complexity:** O(n²): ~10¹⁰ comparisons for n = 10⁵. (`s.indexOf(ch) === s.lastIndexOf(ch)` looks short but is the same O(n²).)
:::

::: text 💡 Key insight
Whether a character is unique depends on its **total count**, which we can compute once for all characters. A second pass then just reads the counts. Two linear passes instead of n nested scans.

**Pattern name: Frequency counting (hash map / count array), two passes.**
:::

::: diagram Count, then scan again
flowchart LR
  A["pass 1: count[ch]++ for every ch"] --> B["pass 2: i = 0 .. n-1"]
  B --> C{"count[s[i]] === 1?"}
  C -->|"yes"| D["return i"]
  C -->|"no"| B
  B -->|"end"| E["return -1"]
:::

::: image First Unique Character: counts for loveleetcode; v at index 2 is the first with count 1
/images/dsa-arrays-hashing/first-unique-char.svg
:::

::: text 🔍 Dry run: s = "loveleetcode"
**Pass 1 counts:** l: 2, o: 2, v: 1, e: 4, t: 1, c: 1, d: 1.

**Pass 2:**
| i | s[i] | count | unique? |
|---|---|---|---|
| 0 | l | 2 | no |
| 1 | o | 2 | no |
| 2 | v | 1 | **yes → return 2** |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * First Unique Character. Time O(n), Space O(1) (26 counters).
 */
function firstUniqChar(s) {
  const count = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) count[s.charCodeAt(i) - 97]++; // pass 1: tally every letter
  for (let i = 0; i < s.length; i++) {                               // pass 2: first letter with tally 1
    if (count[s.charCodeAt(i) - 97] === 1) return i;
  }
  return -1;                                                         // every letter repeats
}

/** Map version for any characters (Unicode, uppercase, digits). */
function firstUniqCharMap(s) {
  const m = new Map();
  for (const ch of s) m.set(ch, (m.get(ch) || 0) + 1);
  let i = 0;
  for (const ch of s) {
    if (m.get(ch) === 1) return i;
    i += ch.length;            // index in UTF-16 units, like s[i]
  }
  return -1;
}

// ---------- tests ----------
const cases = [
  ['leetcode', 0],
  ['loveleetcode', 2],
  ['aabb', -1],     // nothing unique
  ['z', 0],         // single char
  ['aadadaad', -1],
  ['abcabd', 2],    // "c" is the first unique
];
for (const [s, expected] of cases) {
  const got = firstUniqChar(s);
  console.log(JSON.stringify(s), '→', got, got === expected && firstUniqCharMap(s) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
:::

::: chart line Comparisons: scan the rest for each char vs count twice
n,For each char scan all n²,Two passes 2n
10,100,20
100,10000,200
1000,1000000,2000
10000,100000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Nested scan / indexOf + lastIndexOf | O(n²) | O(1) | One-liner | Quadratic | Tiny strings only |
| **Count array (26) + second pass** | **O(n)** | **O(1)** | Fastest | Only lowercase a–z | The standard problem |
| Count Map + second pass | O(n) | O(k) | Any characters | Slightly slower | Unicode / mixed case |
| Map + queue (streaming) | O(n) amortised | O(k) | Works on a stream | More code | "Characters arrive one by one" |
:::

::: warning ⚠️ Common mistakes / edge cases
- Returning the **character** instead of its index.
- Iterating over the **count map** in pass 2: you need the first position in the string, so iterate over the string.
- Forgetting the `-1` case.
- Using `indexOf`/`lastIndexOf` in a loop and calling it O(n).
:::

::: understand
- "Count first, then answer" (two passes) is the basic **frequency** pattern: [Valid Anagram](https://leetcode.com/problems/valid-anagram/), [Majority Element](https://leetcode.com/problems/majority-element/), [Top K Frequent Elements](https://leetcode.com/problems/top-k-frequent-elements/).
- For streams, keep a queue of candidates and pop from the front while the front's count is above 1 ([First Unique Number](https://leetcode.com/problems/first-unique-number/)).
:::

::: ask
- *"Only lowercase letters? Case-sensitive?"*
- *"Return the index or the character? What if there's none?"*
- *"Is the input a fixed string or a stream?"*
:::

::: important ⭐ How to explain it in the interview
> "Uniqueness depends on the total count, so I make two passes. First I count each character in a 26-slot array. Then I scan the string again from the start and return the first index whose count is 1, or −1 if none. O(n) time and O(1) space since the alphabet is fixed. For Unicode I'd use a Map; for a stream I'd add a queue of candidates."
:::

::: links
LeetCode 387: First Unique Character in a String | https://leetcode.com/problems/first-unique-character-in-a-string/
NeetCode practice list | https://neetcode.io/practice
:::

=== Intersection of Two Arrays
@p 2
@tags set, hashmap, easy
@quick
- Unique intersection: Set of one array, keep values of the other that are in it → **O(n + m)**.
- With duplicates (II): a **count map** of one array, decrement while scanning the other.
- Sorted inputs: two pointers, O(1) extra space.
- Put the **smaller** array in the Set to save memory.

::: text 🧾 Problem
Return the values that appear in **both** arrays. **Version I:** each value once (unique). **Version II:** as many times as it appears in both.

**Example 1 (I):** `nums1 = [1,2,2,1], nums2 = [2,2] → [2]`
**Example 2 (II):** `nums1 = [4,9,5], nums2 = [9,4,9,8,4] → [4,9]` (or `[9,4]`; order doesn't matter).

**Constraints:** 1 ≤ n, m ≤ 1000 (follow-up: what if one array is huge or on disk?).
:::

::: text 🧒 Intuition
Two friends compare their **sticker collections**. Friend A writes all their sticker names on a list (a Set). Friend B goes through their stickers and checks each name against A's list; matches go in a "we both have it" pile. For the "with duplicates" version, A's list says how many of each they have, and every match crosses one off.
:::

::: text 🐢 Brute force
**Idea:** for each value in `nums1`, scan `nums2` for it.

`for x of nums1:`
↳ `if nums2.includes(x) and x not already in result: result.push(x)`

**Complexity:** O(n · m) (`includes` is a loop). For two arrays of 10⁵ that's 10¹⁰ comparisons.
:::

::: text 💡 Key insight
"Is x in the other array?" is a membership question → a **Set** answers it in O(1). Build the Set from one array once (O(n)), then scan the other (O(m)). For the multiplicity version, a **count map** remembers how many copies are still available.

**Pattern name: Hash set / hash map membership.**
:::

::: diagram Set intersection
flowchart LR
  A["set1 = new Set(nums1)"] --> B["for x of nums2"]
  B --> C{"set1.has(x)?"}
  C -->|"yes"| D["add x to result Set"]
  C -->|"no"| B
  D --> B
  B -->|"done"| E["return [...result]"]
:::

::: image Intersection: put nums1 in a set; scanning nums2 keeps 9 and 4
/images/dsa-arrays-hashing/intersection.svg
:::

::: text 🔍 Dry run (version II with counts): nums1 = [4,9,5], nums2 = [9,4,9,8,4]
Count map of nums1: {4: 1, 9: 1, 5: 1}
| x (from nums2) | count[x] before | match? | result | count after |
|---|---|---|---|---|
| 9 | 1 | yes | [9] | 9 → 0 |
| 4 | 1 | yes | [9, 4] | 4 → 0 |
| 9 | 0 | no (used up) | [9, 4] | |
| 8 | – | no | [9, 4] | |
| 4 | 0 | no | [9, 4] | |
:::

::: code javascript Optimal solutions with tests (runnable)
/**
 * Version I: unique values present in both. Time O(n + m), Space O(min(n, m)).
 */
function intersection(nums1, nums2) {
  if (nums1.length > nums2.length) return intersection(nums2, nums1); // Set from the smaller array
  const set1 = new Set(nums1);
  const result = new Set();               // a Set so each value is added once
  for (const x of nums2) {
    if (set1.has(x)) result.add(x);
  }
  return [...result];
}

/**
 * Version II: keep duplicates (as many as appear in both). Time O(n + m).
 */
function intersect(nums1, nums2) {
  const count = new Map();                            // value → copies still available from nums1
  for (const x of nums1) count.set(x, (count.get(x) || 0) + 1);
  const result = [];
  for (const x of nums2) {
    if (count.get(x) > 0) {                           // a copy is still available
      result.push(x);
      count.set(x, count.get(x) - 1);                 // use it up
    }
  }
  return result;
}

/** Sorted inputs: two pointers, O(1) extra space (besides the output). */
function intersectSorted(a, b) {
  let i = 0, j = 0;
  const out = [];
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) i++;            // a is behind → move a
    else if (a[i] > b[j]) j++;       // b is behind → move b
    else { out.push(a[i]); i++; j++; } // equal → part of the intersection
  }
  return out;
}

// ---------- tests ----------
const sortNum = (arr) => [...arr].sort((x, y) => x - y);
const check = (label, got, expected) =>
  console.log(label, JSON.stringify(got), JSON.stringify(sortNum(got)) === JSON.stringify(sortNum(expected)) ? '✅' : '❌ FAIL expected ' + JSON.stringify(expected));

check('I  [1,2,2,1] ∩ [2,2] →', intersection([1, 2, 2, 1], [2, 2]), [2]);
check('I  [4,9,5] ∩ [9,4,9,8,4] →', intersection([4, 9, 5], [9, 4, 9, 8, 4]), [4, 9]);
check('I  no overlap →', intersection([1, 2], [3, 4]), []);
check('II [1,2,2,1] ∩ [2,2] →', intersect([1, 2, 2, 1], [2, 2]), [2, 2]);
check('II [4,9,5] ∩ [9,4,9,8,4] →', intersect([4, 9, 5], [9, 4, 9, 8, 4]), [4, 9]);
check('sorted two pointers →', intersectSorted([1, 1, 2, 2], [2, 2, 3]), [2, 2]);
check('empty →', intersect([], [1]), []);
:::

::: chart line Comparisons (n = m): includes in a loop vs Set
n,includes in a loop n·m,Set n + m
10,100,20
100,10000,200
1000,1000000,2000
10000,100000000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Nested loops / `includes` | O(n · m) | O(1) | Simple | Slow | Tiny inputs |
| **Set (I) / count Map (II)** | **O(n + m)** | O(min(n, m)) | Fastest for unsorted input | Extra memory | Default answer |
| Sort both + two pointers | O(n log n + m log m) | O(1) extra | Low memory | Sorting cost | Memory-limited |
| Two pointers on sorted input | O(n + m) | O(1) | Optimal if already sorted | Needs sorted input | Input given sorted |
| Binary search each of the small array in the big sorted one | O(s · log b) | O(1) | Great if one array is tiny | Needs sorted big array | One array is huge |
:::

::: warning ⚠️ Common mistakes / edge cases
- Returning duplicates in version I (use a Set for the result).
- Losing the multiplicity in version II (a Set can't count; use a Map).
- Sorting with the default `sort()` (string order).
- Building the Set from the **bigger** array (wastes memory).
:::

::: understand
- Set/Map membership is the backbone of most "compare two collections" problems: [Two Sum](https://leetcode.com/problems/two-sum/), [Contains Duplicate](https://leetcode.com/problems/contains-duplicate/), [Intersection of Two Arrays II](https://leetcode.com/problems/intersection-of-two-arrays-ii/).
- If one array is on **disk** and too big for memory, sort/stream it in chunks and use two pointers (external merge).
:::

::: ask
- *"Should the result be unique, or keep multiplicity?"*
- *"Are the inputs sorted? Is one much larger than the other?"*
- *"Does the output order matter?"*
:::

::: important ⭐ How to explain it in the interview
> "For the unique version I build a Set from the smaller array and scan the other, adding matches to a result Set: O(n + m) time. For the version with duplicates I use a count map from one array and decrement as I match values from the other. If both are sorted I'd use two pointers with O(1) extra space, and if one array is tiny I could binary-search it in the big sorted one."
:::

::: links
LeetCode 349: Intersection of Two Arrays | https://leetcode.com/problems/intersection-of-two-arrays/
LeetCode 350: Intersection of Two Arrays II | https://leetcode.com/problems/intersection-of-two-arrays-ii/
NeetCode video: Intersection of Two Arrays | https://www.youtube.com/results?search_query=neetcode+intersection+of+two+arrays
:::

=== Longest Consecutive Sequence
@p 2
@tags set, hashing, medium
@quick
- Put everything in a **Set**; only start counting from numbers where **`n − 1` is not in the set** (a sequence start).
- Count upward while `n + 1` exists. Each number is visited at most twice → **O(n)**.
- Sorting first is O(n log n); the problem asks for O(n).
- Iterate over the **Set** (not the array) to skip duplicates.

::: text 🧾 Problem
Given an unsorted array of integers, return the length of the **longest run of consecutive numbers** (like 1, 2, 3, 4). The numbers can be in any order in the array. Your algorithm must run in **O(n)**.

**Example 1:** `[100, 4, 200, 1, 3, 2] → 4` (the run 1, 2, 3, 4).
**Example 2:** `[0, 3, 7, 2, 5, 8, 4, 6, 0, 1] → 9` (0 to 8).

**Constraints:** 0 ≤ n ≤ 10⁵, values between −10⁹ and 10⁹.
:::

::: text 🧒 Intuition
Think of **page numbers torn out of a book and scattered** on the floor. To find the longest run of consecutive pages, you'd only start counting from a page whose **previous page is missing** (that's where a run begins), then keep looking for the next page number. Pages in the middle of a run don't need their own count; someone already counted them from the start of their run.
:::

::: text 🐢 Brute force
**Idea A:** for each number, count upward with `includes` (a linear search each time).

`for x of nums: len = 1; while nums.includes(x + len): len++`

That's O(n³) in the worst case (n starts × n steps × O(n) search).

**Idea B:** sort, then scan for runs: **O(n log n)**: fine in practice, but the problem explicitly requires O(n).
:::

::: text 💡 Key insight
Two observations:
1. A Set makes "does x + 1 exist?" O(1).
2. If we count upward from **every** number, a run of length L is counted L times (O(n²)). But a run has exactly **one start**: the number whose predecessor `x − 1` is missing. Counting only from starts means every number is visited at most twice (once in the outer loop, once while counting a run).

**Pattern name: Hash set + "only start at the beginning of a sequence".**
:::

::: diagram Only count from a sequence start
flowchart TD
  A["set = new Set(nums)"] --> B["for x of set"]
  B --> C{"set.has(x - 1)?"}
  C -->|"yes: not a start"| B
  C -->|"no: x starts a run"| D["len = 1, while set.has(x + len): len++"]
  D --> E["best = max(best, len)"]
  E --> B
  B -->|"done"| F["return best"]
:::

::: image Longest Consecutive Sequence: only 1, 100 and 200 are starts; counting from 1 gives length 4
/images/dsa-arrays-hashing/longest-consecutive.svg
:::

::: text 🔍 Dry run: [100, 4, 200, 1, 3, 2]
Set = {100, 4, 200, 1, 3, 2}
| x | x − 1 in set? | start? | count upward | len | best |
|---|---|---|---|---|---|
| 100 | 99: no | yes | 101? no | 1 | 1 |
| 4 | 3: yes | no | – | – | 1 |
| 200 | 199: no | yes | 201? no | 1 | 1 |
| 1 | 0: no | yes | 2 ✓, 3 ✓, 4 ✓, 5? no | **4** | **4** |
| 3 | 2: yes | no | – | – | 4 |
| 2 | 1: yes | no | – | – | 4 |
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Longest Consecutive Sequence in O(n).
 * Each number is touched at most twice: once as x, once while counting a run.
 */
function longestConsecutive(nums) {
  const set = new Set(nums);          // O(1) lookups, and duplicates disappear
  let best = 0;
  for (const x of set) {              // iterate the Set, not the array (skips duplicates)
    if (set.has(x - 1)) continue;     // x is in the middle of a run → its start will count it
    let len = 1;                      // x starts a run
    while (set.has(x + len)) len++;   // walk upward: x+1, x+2, ...
    best = Math.max(best, len);
  }
  return best;
}

/** Sorting version for cross-checking: O(n log n). */
function longestConsecutiveSort(nums) {
  if (!nums.length) return 0;
  const a = [...new Set(nums)].sort((x, y) => x - y);
  let best = 1, run = 1;
  for (let i = 1; i < a.length; i++) {
    run = a[i] === a[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// ---------- tests ----------
const cases = [
  [[100, 4, 200, 1, 3, 2], 4],
  [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1], 9],
  [[], 0],                 // empty
  [[5], 1],                // one number
  [[1, 2, 2, 3], 3],       // duplicates don't break the run
  [[-2, -1, 0, 10], 3],    // negatives
];
for (const [nums, expected] of cases) {
  const got = longestConsecutive(nums);
  console.log(JSON.stringify(nums), '→', got, got === expected && longestConsecutiveSort(nums) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
// worst case for "count from every number": one long run of 100,000 numbers
const big = Array.from({ length: 100000 }, (_, i) => 100000 - i);
const t0 = Date.now();
const r = longestConsecutive(big);
console.log('100,000-long run →', r, 'in', Date.now() - t0, 'ms', r === 100000 ? '✅' : '❌ FAIL');
:::

::: chart line Set lookups for one long run of n numbers: count from every number vs only from starts
n,Count from every number ~n²/2,Only from starts ~2n
10,55,20
100,5050,200
1000,500500,2000
10000,50005000,20000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Count upward from each number with `includes` | O(n³) | O(1) | – | Hopeless | Never |
| Set, count from every number | O(n²) worst | O(n) | Simple | Recounts runs | Never as final |
| Sort + scan | O(n log n) | O(1)–O(n) | Easy, no hashing | Not O(n) | If O(n) isn't required |
| **Set, count only from starts** | **O(n)** | O(n) | Meets the requirement | Needs the "start" insight | Default answer |
| Union-Find | ~O(n) | O(n) | Generalises to merging groups | Much more code | Follow-up only |
:::

::: warning ⚠️ Common mistakes / edge cases
- Counting from **every** number (forgetting the `x − 1` check) → O(n²) on one long run.
- Iterating the original array instead of the Set: with many duplicates of a start, you recount the run each time.
- Returning 1 for an empty array (should be 0).
- Sorting with the default `sort()` (string order: 10 comes before 9).
:::

::: understand
- "Only process the beginning of a group" is how you turn O(n²) into O(n). The Set trick also helps in [Missing Number](https://leetcode.com/problems/missing-number/) and [First Missing Positive](https://leetcode.com/problems/first-missing-positive/).
- Amortised analysis: even though there's a `while` inside a `for`, the **total** work of all `while` loops is at most n.
:::

::: ask
- *"Can there be duplicates? Negative numbers?"*
- *"Is O(n) required, or is O(n log n) acceptable?"*
- *"Should I return the length or the sequence itself?"*
:::

::: important ⭐ How to explain it in the interview
> "Sorting gives O(n log n), but O(n) is required. I put all numbers in a Set. A number starts a run only if x − 1 isn't in the Set. For each start I count upward while x + 1, x + 2, … exist, and keep the longest length. Every number is visited at most twice, once in the outer loop and once inside a single run, so it's O(n) time and O(n) space. I iterate the Set so duplicates don't cause recounting."
:::

::: links
LeetCode 128: Longest Consecutive Sequence | https://leetcode.com/problems/longest-consecutive-sequence/
NeetCode video: Longest Consecutive Sequence | https://www.youtube.com/results?search_query=neetcode+longest+consecutive+sequence
:::

=== Top K Frequent Elements
@p 3
@tags hashmap, heap, bucket-sort, medium
@quick
- Count with a Map, then: sort by count **O(n log n)**, min-heap of size k **O(n log k)**, or **bucket sort** by frequency **O(n)**.
- Bucket: `buckets[freq] = [values…]`; walk from the highest frequency down until k values are collected.
- Frequencies are between 1 and n, so n + 1 buckets are enough.
- Say all three approaches and their trade-offs; code the bucket (or heap) version.

::: text 🧾 Problem
Given an integer array and `k`, return the `k` **most frequent** elements, in any order.

**Example 1:** `nums = [1,1,1,2,2,3], k = 2 → [1, 2]`
**Example 2:** `nums = [1], k = 1 → [1]`

**Constraints:** 1 ≤ n ≤ 10⁵, the answer is unique, follow-up: better than O(n log n).
:::

::: text 🧒 Intuition
A shop wants its **top 2 best-selling products**. First it counts sales per product (a tally). Then, instead of sorting all products, it places them on **shelves numbered by how many times they sold**: shelf 3, shelf 2, shelf 1… Walking from the highest shelf down, it picks products until it has 2.
:::

::: text 🐢 Brute force
**Idea:** count with a Map, then sort all distinct values by their count and take the first k.

`count = Map(value → freq)`
`return [...count.keys()].sort((a, b) => count.get(b) - count.get(a)).slice(0, k)`

**Complexity:** O(n log n) because of the sort (n distinct values in the worst case). It's a good first answer, but the follow-up asks for better. (A truly naive version counts each value with a loop: O(n²).)
:::

::: text 💡 Key insight
We don't need a **full** order, only the top k. Two ways to exploit that:
- **Heap of size k**: keep only the k best so far → O(n log k).
- **Bucket sort**: a frequency is an integer between 1 and n, so values can be dropped into buckets indexed by frequency in O(n), then read from the top.

**Pattern name: Counting + bucket sort** (or **heap / priority queue** for "top K").
:::

::: diagram Count → bucket → collect from the top
flowchart LR
  A["count: Map value → freq"] --> B["buckets[freq].push(value)"]
  B --> C["for f = n down to 1"]
  C --> D{"result has k values?"}
  D -->|"no"| E["take values from buckets[f]"]
  E --> C
  D -->|"yes"| F["return result"]
:::

::: image Top K Frequent: buckets indexed by frequency; walking from the top gives 1 then 2
/images/dsa-arrays-hashing/top-k-frequent.svg
:::

::: text 🔍 Dry run: nums = [1,1,1,2,2,3], k = 2
**Count:** {1: 3, 2: 2, 3: 1}
**Buckets (index = frequency):** `[0]: [] · [1]: [3] · [2]: [2] · [3]: [1] · [4..6]: []`
| f | buckets[f] | result after | done? |
|---|---|---|---|
| 6 | [] | [] | no |
| 5 | [] | [] | no |
| 4 | [] | [] | no |
| 3 | [1] | [1] | no |
| 2 | [2] | [1, 2] | **yes (k = 2)** |
:::

::: code javascript Optimal solution (bucket sort) + heap version, with tests (runnable)
/**
 * Top K Frequent Elements with bucket sort. Time O(n), Space O(n).
 */
function topKFrequent(nums, k) {
  const count = new Map();                                  // value → how many times it appears
  for (const x of nums) count.set(x, (count.get(x) || 0) + 1);

  // buckets[f] = list of values that appear exactly f times (f is between 1 and n)
  const buckets = Array.from({ length: nums.length + 1 }, () => []);
  for (const [value, freq] of count) buckets[freq].push(value);

  const result = [];
  for (let f = buckets.length - 1; f >= 1 && result.length < k; f--) { // highest frequency first
    for (const value of buckets[f]) {
      result.push(value);
      if (result.length === k) break;                       // stop as soon as we have k
    }
  }
  return result;
}

/** Min-heap version: keep the k most frequent seen so far. Time O(n log k). */
function topKFrequentHeap(nums, k) {
  const count = new Map();
  for (const x of nums) count.set(x, (count.get(x) || 0) + 1);
  const heap = [];                                           // array-based min-heap of [freq, value]
  const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const down = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } };
  for (const [value, freq] of count) {
    heap.push([freq, value]); up(heap.length - 1);           // add the candidate
    if (heap.length > k) {                                   // too many → drop the least frequent
      heap[0] = heap[heap.length - 1]; heap.pop(); down(0);
    }
  }
  return heap.map(([, value]) => value);
}

// ---------- tests ----------
const sortNum = (a) => [...a].sort((x, y) => x - y);
const cases = [
  [[1, 1, 1, 2, 2, 3], 2, [1, 2]],
  [[1], 1, [1]],
  [[4, 4, 4, 5, 5, 6, 6, 6, 6], 1, [6]],
  [[-1, -1, 2, 2, 2, 3], 2, [-1, 2]],   // negatives
  [[7, 8, 9], 3, [7, 8, 9]],            // k equals the number of distinct values
];
for (const [nums, k, expected] of cases) {
  const a = topKFrequent(nums, k), b = topKFrequentHeap(nums, k);
  const ok = JSON.stringify(sortNum(a)) === JSON.stringify(sortNum(expected)) && JSON.stringify(sortNum(b)) === JSON.stringify(sortNum(expected));
  console.log(JSON.stringify(nums), 'k =', k, '→', JSON.stringify(a), ok ? '✅' : '❌ FAIL');
}
:::

::: chart line Work after counting (n distinct values, k = 10): sort vs heap vs buckets
n,Sort n log2 n,Heap n log2 k,Buckets n
100,664,332,100
1000,9966,3322,1000
10000,132877,33219,10000
100000,1660964,332193,100000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| Count + sort by frequency | O(n log n) | O(n) | Shortest code | Sorts more than needed | First answer |
| **Count + min-heap of size k** | **O(n log k)** | O(n + k) | Great when k ≪ n; works on streams | JS has no built-in heap | Streaming data, small k |
| **Count + bucket sort** | **O(n)** | O(n) | Linear, simple arrays | Needs integer frequencies ≤ n | Fixed array, follow-up "better than n log n" |
| Quickselect on counts | O(n) average | O(n) | Linear average | O(n²) worst case, tricky | Advanced follow-up |
:::

::: warning ⚠️ Common mistakes / edge cases
- Using a **max-heap of all n** items (O(n log n), no better than sorting). Use a **min-heap of size k**.
- Making only k buckets instead of n + 1 (frequency can be as large as n).
- Iterating buckets from low to high frequency.
- Returning the frequencies instead of the values.
:::

::: understand
- "Top K" → think **heap of size k** or **bucket by count**. Related: [Kth Largest Element in an Array](https://leetcode.com/problems/kth-largest-element-in-an-array/), [Top K Frequent Words](https://leetcode.com/problems/top-k-frequent-words/), [Sort Characters By Frequency](https://leetcode.com/problems/sort-characters-by-frequency/).
- Bucket sort works whenever the "keys" are small integers with a known maximum.
:::

::: ask
- *"Is the answer guaranteed unique? What about ties?"*
- *"Is k always valid (1 ≤ k ≤ distinct count)?"*
- *"Is the data fixed, or a stream?"* (Stream → heap.)
- *"Does the output order matter?"*
:::

::: important ⭐ How to explain it in the interview
> "First I count frequencies with a hash map. Sorting the distinct values by count is O(n log n). Better: a min-heap capped at size k gives O(n log k), which also works for streams. Best for a fixed array: frequencies are integers from 1 to n, so I bucket values by frequency and walk from the highest bucket down until I have k values. That's O(n) time and O(n) space."
:::

::: links
LeetCode 347: Top K Frequent Elements | https://leetcode.com/problems/top-k-frequent-elements/
NeetCode video: Top K Frequent Elements | https://www.youtube.com/results?search_query=neetcode+top+k+frequent+elements
VisuAlgo: binary heap | https://visualgo.net/en/heap
:::

=== Subarray Sum Equals K
@p 3
@tags prefix-sum, hashmap, medium
@quick
- **Pattern: prefix sum + hash map**: `sum(i..j) = prefix[j] − prefix[i−1]`, so count earlier prefixes equal to `prefix − k`.
- Initialise the map with **`{0: 1}`** (the empty prefix) so subarrays starting at index 0 are counted.
- **O(n) time, O(n) space**. Works with **negative numbers** (sliding window doesn't).
- Look up first, then add the current prefix.

::: text 🧾 Problem
Given an integer array `nums` and an integer `k`, return the **number of contiguous subarrays** whose sum equals `k`.

**Example 1:** `nums = [1, 1, 1], k = 2 → 2` (`[1,1]` at indices 0–1 and 1–2).
**Example 2:** `nums = [1, 2, 3], k = 3 → 2` (`[1,2]` and `[3]`).

**Constraints:** 1 ≤ n ≤ 2 × 10⁴, values can be **negative**, −10⁷ ≤ k ≤ 10⁷.
:::

::: text 🧒 Intuition
Think of a **car's odometer**. If it read 120 km at one point and 170 km later, you drove 50 km in between. The distance of any stretch = reading at the end − reading at the start.

Prefix sums are the odometer readings of the array. To find stretches of exactly k, at each position ask: *"how many earlier readings were exactly (current reading − k)?"* Each one is the start of a stretch that sums to k. A hash map remembers how many times each reading appeared.
:::

::: text 🐢 Brute force
**Idea:** try every start `i`, extend the end `j`, keep a running sum and count matches.

`for i in 0..n-1:`
↳ `sum = 0`
↳ `for j in i..n-1: sum += nums[j]; if sum === k: count++`

**Complexity:** O(n²): for n = 2 × 10⁴ that's 2 × 10⁸ additions (a couple of seconds), and it grows quadratically. **Sliding window doesn't work** here because negative numbers mean that growing a window can make the sum smaller.
:::

::: text 💡 Key insight
Let `prefix[j]` = sum of `nums[0..j]`. Then `sum(i..j) = prefix[j] − prefix[i − 1]`. We want that to equal `k`, i.e. **`prefix[i − 1] = prefix[j] − k`**. So while scanning, keep a map `prefixValue → how many times we've seen it`, and add `map.get(prefix − k)` to the answer at each step. Start with `{0: 1}` for the "empty prefix" before index 0.

**Pattern name: Prefix sum + hash map (count of complements).** It's Two Sum on prefix sums.
:::

::: diagram Prefix sum + map of earlier prefixes
flowchart TD
  S["prefix = 0, count = 0, seen = {0: 1}"] --> L{"next x?"}
  L -->|"none"| R["return count"]
  L -->|"x"| P["prefix += x"]
  P --> Q["count += seen.get(prefix - k) or 0"]
  Q --> A["seen[prefix] += 1"]
  A --> L
:::

::: image Subarray Sum Equals K: at prefix 6 we look up 6 minus 3 = 3, seen once
/images/dsa-arrays-hashing/subarray-sum-k.svg
:::

::: text 🔍 Dry run: nums = [1, 2, 3, −2, 2], k = 3
| i | x | prefix | prefix − k | seen[prefix − k] | count | seen after |
|---|---|---|---|---|---|---|
| start | | 0 | | | 0 | {0: 1} |
| 0 | 1 | 1 | −2 | 0 | 0 | {0:1, 1:1} |
| 1 | 2 | 3 | 0 | **1** ([1,2]) | 1 | {0:1, 1:1, 3:1} |
| 2 | 3 | 6 | 3 | **1** ([3]) | 2 | {…, 6:1} |
| 3 | −2 | 4 | 1 | **1** ([2,3,−2]) | 3 | {…, 4:1} |
| 4 | 2 | 6 | 3 | **1** ([3,−2,2]) | 4 | {…, 6:2} |

Answer: **4** subarrays.
:::

::: code javascript Optimal solution with tests (runnable)
/**
 * Subarray Sum Equals K with prefix sums. Time O(n), Space O(n).
 */
function subarraySum(nums, k) {
  const seen = new Map([[0, 1]]); // prefix value → how many times seen; the empty prefix (0) once
  let prefix = 0;                 // running sum of nums[0..i]
  let count = 0;
  for (const x of nums) {
    prefix += x;                              // odometer reading at this position
    count += seen.get(prefix - k) || 0;       // each earlier prefix of (prefix - k) starts a valid subarray
    seen.set(prefix, (seen.get(prefix) || 0) + 1); // record AFTER the lookup (a subarray can't be empty)
  }
  return count;
}

/** Brute force for cross-checking: O(n²). */
function subarraySumBrute(nums, k) {
  let count = 0;
  for (let i = 0; i < nums.length; i++) {
    let sum = 0;
    for (let j = i; j < nums.length; j++) { sum += nums[j]; if (sum === k) count++; }
  }
  return count;
}

// ---------- tests ----------
const cases = [
  [[1, 1, 1], 2, 2],
  [[1, 2, 3], 3, 2],
  [[1, 2, 3, -2, 2], 3, 4],   // the dry-run example
  [[1, -1, 0], 0, 3],         // negatives and zero: [1,-1], [0], [1,-1,0]
  [[3], 3, 1],                // single element equals k
  [[0, 0, 0], 0, 6],          // every subarray of zeros
  [[], 5, 0],                 // empty
];
for (const [nums, k, expected] of cases) {
  const got = subarraySum(nums, k);
  console.log(JSON.stringify(nums), 'k =', k, '→', got, got === expected && subarraySumBrute(nums, k) === expected ? '✅' : '❌ FAIL expected ' + expected);
}
let allOk = true;
for (let t = 0; t < 300; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 15) }, () => Math.floor(Math.random() * 9) - 4);
  const k = Math.floor(Math.random() * 9) - 4;
  if (subarraySum(arr, k) !== subarraySumBrute(arr, k)) allOk = false;
}
console.log('300 random arrays (with negatives) match brute force', allOk ? '✅' : '❌ FAIL');
:::

::: chart line Additions: all subarrays vs prefix sum + map
n,All subarrays n(n+1)/2,Prefix + map n
10,55,10
100,5050,100
1000,500500,1000
10000,50005000,10000
:::

::: text ⚖️ Trade-offs
| Approach | Time | Space | Pros | Cons | Choose when |
|---|---|---|---|---|---|
| All subarrays (running sum) | O(n²) | O(1) | Simple, no memory | Slow | First idea, tiny n |
| Sliding window | O(n) | O(1) | Fast | **Wrong with negative numbers** | Only if all values are positive |
| Prefix array + check all pairs | O(n²) | O(n) | Teaches prefix sums | Still quadratic | Explaining the idea |
| **Prefix sum + hash map** | **O(n)** | O(n) | Handles negatives, one pass | Extra memory | Default answer |
:::

::: warning ⚠️ Common mistakes / edge cases
- Forgetting **`{0: 1}`**: subarrays that start at index 0 are never counted.
- Adding the current prefix to the map **before** the lookup: with k = 0 you'd count an empty subarray.
- Using a sliding window: it fails on negatives like `[1, -1, 0], k = 0`.
- Storing only "seen or not" (a Set) instead of a **count**: the same prefix can appear several times (e.g. zeros).
:::

::: understand
- This is **Two Sum on prefix sums**: look up a complement (`prefix − k`) in a map of what you've seen. Related: [Continuous Subarray Sum](https://leetcode.com/problems/continuous-subarray-sum/) (prefix mod k), [Contiguous Array](https://leetcode.com/problems/contiguous-array/) (0 → −1, then sum 0), [Path Sum III](https://leetcode.com/problems/path-sum-iii/) (the same idea on tree paths).
- Prefix sums turn "sum of a range" into "difference of two numbers".
:::

::: ask
- *"Can the numbers be negative?"* (Yes → prefix sums, not a sliding window.)
- *"Count the subarrays, or return them / the longest one?"*
- *"Can k be 0?"*
:::

::: important ⭐ How to explain it in the interview
> "A subarray sum is a difference of two prefix sums: sum(i..j) = prefix[j] − prefix[i−1]. So as I scan and update the running prefix, I ask how many earlier prefixes equal prefix − k, using a hash map of prefix counts, and add that to the answer. I seed the map with {0: 1} so subarrays starting at index 0 count, and I add the current prefix after the lookup. A sliding window fails with negative numbers; this works with any values. O(n) time, O(n) space."
:::

::: links
LeetCode 560: Subarray Sum Equals K | https://leetcode.com/problems/subarray-sum-equals-k/
NeetCode video: Subarray Sum Equals K | https://www.youtube.com/results?search_query=neetcode+subarray+sum+equals+k
:::
