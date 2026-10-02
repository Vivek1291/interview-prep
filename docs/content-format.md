<!-- How to write the default content in server/src/seed/content/*.md -->
# Content file format

Files: `server/src/seed/content/NN-topic.md`. Order in the sidebar = file name order; question order = order in the file.

```
@section DSA: Arrays, Strings & Hashing
@icon 🧮
@color #6366f1
@desc One-line description of the section.

=== Two Sum
@p 3                         ← priority: 3 = must know, 2 = important, 1 = good to know
@tags hashmap, array, easy
@quick                       ← quick-revise notes: one "- " line each, stops at the first non "- " line
- One-line fact to revise
- Supports **bold**, `code`, ==highlight==

::: text 📖 Answer            ← block header: "::: <type> [lang|chartType] [optional custom title]"
Markdown subset here…
:::
```

## Block types
| Header | Renders as | Content |
|---|---|---|
| `::: text [title]` | plain rich-text box | markdown subset |
| `::: understand` / `ask` / `tip` / `warning` / `note` / `important` `[title]` | coloured callout boxes (preset colour + title) | markdown subset |
| `::: code <lang> [title]` | syntax-highlighted code (▶ Run button for plain JS) | raw code, no escaping needed |
| `::: diagram [title]` | Mermaid diagram | Mermaid source |
| `::: chart <bar\|line\|area> [title]` | Recharts chart | CSV: header row, first column = X labels, other columns numeric |
| `::: links [title]` | link cards | `Label \| https://url` per line |
| `::: image [title]` | images | one URL per line (e.g. `/images/dsa/two-sum.svg`) |

Languages: `javascript js typescript ts jsx tsx bash json yaml docker nginx sql python html css text`.

## Markdown subset supported in text/callout blocks (see `server/src/seed/markdown.js`)
`## Heading` (→h3), `### Sub` (→h4), paragraphs, `- ` lists (one nested level with 2 spaces), `1. ` lists, `> quote`, `| tables |` (second row must be `|---|`), inline `` `code` ``, `**bold**`, `*italic*`, `==highlight==`, `==[#bbf7d0]custom colour highlight==`, `{color:#dc2626}red text{/color}`, `[link](https://…)`.

## Rules that prevent broken content
1. **Never write a bare `==` in prose** (it becomes a highlight). Put JS equality in backticks: `` `===` ``.
2. A `|` inside a table cell must be inside backticks, otherwise it splits the cell.
3. A line that is exactly `:::` closes a block, so don't put it inside code.
4. Mermaid: quote every label that has punctuation, e.g. `A["setTimeout(fn, 0)"]`, `-->|"label"|`. Don't reuse the same id for a node and a subgraph. Don't use `end` as a node id. Avoid `;` and `#` in labels. Valid headers: `flowchart TD|LR`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`.
5. **Runnable JS examples** (plain JS, no `require`/`import`/DOM/`process.`/db/`res.json(`…) get a ▶ Run button, and the checker **executes** them. Include self-tests that print `✅` or `❌ FAIL`. Code that needs Node/Express/Mongo is syntax-checked only, so it must still be complete and valid.
6. Keep `canRun()` in `client/src/utils/runJs.js` and `scripts/verify-content.js` identical.
7. Images: put SVG/PNG files in `client/public/images/<section>/name.svg` and reference them as `/images/<section>/name.svg` in `::: image` blocks (rebuild the web image afterwards). Hand-written SVG is preferred (small, crisp, themable). Always add a text alternative in the title.

## Content quality standard (applies to every question)

The reader is a **beginner** in backend, LLD and DSA. Explain like a patient senior mentor.

### 1 Concept questions (Node, Express, REST, MongoDB, Mongoose, AWS, Full-Stack)
Blocks in this order:
1. `text 🧒 In simple words`: 3–6 sentences with a **real-life analogy** (restaurant, post office, library…). No jargon, or define it right away.
2. `text 📖 Detailed answer`: the full explanation with headings, bullet points, and at least one **comparison table** where a comparison exists.
3. At least one **visual**: a `diagram` (flow / sequence / state / class / ER) **and**, where numbers help, a `chart` (performance, memory, complexity, cost). Where a picture explains better than a diagram, add an `image` (SVG in `client/public/images/<section>/`).
4. `text 🪜 Step by step`: numbered walkthrough of what happens internally or how to do it.
5. `code`: **complete, runnable** example(s) with comments on every important line; a "how to run it" comment at the top (`node file.js`, `curl …`). Add a browser-runnable plain-JS demo with ✅/❌ self-tests whenever the concept can be simulated.
6. `warning ⚠️ Common mistakes`: 3–5 bullets.
7. `understand`: what you must really understand (the "why").
8. `ask`: clarifying questions for the interviewer, plus traps to be careful about.
9. `important ⭐ Say this in the interview`: a 30–60 second model answer.
10. `links`: official docs first, then 1–2 good articles/videos.
11. `@quick`: 4–6 one-line revision notes.

### 2 DSA questions
1. `text 🧾 Problem`: statement in simple words + 2 examples (input → output) + constraints.
2. `text 🧒 Intuition`: real-life analogy + how a human would solve it by hand.
3. `text 🐢 Brute force`: idea, code sketch, complexity, **why it's slow** (count the operations for n = 10⁵).
4. `text 💡 Key insight`: the one observation that unlocks the optimal solution + the **pattern name** (hash map, two pointers, sliding window, prefix sum, monotonic stack, binary search, BFS/DFS, heap, backtracking, DP).
5. `diagram` and/or `image`: a visual of the algorithm (pointer movement, window, stack states, tree/graph traversal, DP table).
6. `text 🔍 Dry run`: a **step-by-step table** on an example (every iteration: pointers, map/stack contents, answer so far).
7. `code javascript`: optimal solution with **line-by-line comments** + tests (`✅`/`❌ FAIL`) including edge cases (empty, one element, duplicates, negatives, large input). It must be runnable in the browser.
8. `chart`: brute force vs optimal operation counts for growing n (e.g. 10, 100, 1k, 10k).
9. `text ⚖️ Trade-offs`: a table of every approach with time, space, pros, cons and when to choose it (e.g. sort vs hash map vs two pointers; recursion vs iteration; memo vs tabulation).
10. `warning ⚠️ Common mistakes / edge cases`
11. `understand`: the pattern and where else it appears (2–3 related problems with links).
12. `ask`: clarifying questions to ask before coding.
13. `important ⭐ How to explain it in the interview`: clarify → brute → optimise → code → test → complexity, in 6–8 lines.
14. `links`: LeetCode problem + one visual explanation (NeetCode / VisuAlgo).
15. `@quick`: pattern, key insight, complexity, one gotcha.

### 3 LLD questions (Frontend, Backend, Full-Stack)
LLD code must be **complete and runnable**, and a beginner must be able to copy it into files and run it.
1. `text 🧒 In simple words`: what we're building and why (a real product example).
2. `text 📋 Requirements`: functional + non-functional; list **assumptions**.
3. `ask`: clarifying questions (scale, users, constraints) **first**.
4. `diagram`: high-level architecture + a **class diagram** (backend) or **component tree** (frontend) + a **sequence diagram** of the main flow. Add an ER diagram if there's data.
5. `text 🧱 Design`: responsibilities of each class/module/component, data models, API contracts (method, path, request, response, status codes), state shape.
6. `text 📁 Folder structure`: a tree of every file in the solution.
7. `code`: **every file in full**, one `code` block per file, titled with its path (e.g. `server/src/services/rateLimiter.service.js`). No `...`, no "// rest omitted", no placeholder functions (e.g. `toast`, `api`, `authenticate` must be defined somewhere in the solution). Backend solutions include `package.json` and run with `npm install && node index.js`; frontend solutions include the component, the hook/state, minimal CSS, and a usage example (`App.jsx`). Where possible also add a **self-contained browser-runnable simulation** of the core logic with tests.
8. `text 🧪 How to run & test`: exact commands + curl/Postman examples + expected output.
9. `text ⚖️ Trade-offs & alternatives`: a table (e.g. fixed window vs token bucket; polling vs WebSocket; offset vs cursor).
10. `text 📈 Scaling & edge cases`: what changes at 10× / 100× load, failures, security, accessibility (frontend).
11. `warning`, `understand`, `important ⭐ How to present this design in 5 minutes`, `links`, `@quick`.

### 4 Visual guidelines
- Every question gets **at least 1 diagram**. DSA and LLD get **at least 2 visuals** (diagram, image or chart).
- Charts use realistic, labelled numbers (say "illustrative" when approximate).
- SVG images: 800×400 viewBox, readable in light **and** dark mode (mid-tone colours, no pure black/white backgrounds or transparent + `currentColor`), labelled arrows, max ~20 KB.
- Colours for callouts are preset; don't override them unless it helps meaning.

## Checking your changes

```bash
node scripts/verify-content.js        # all files: format checks + runs every ▶ Run example
node scripts/verify-content.js 16     # only files whose name contains "16"
SHOW=1 node scripts/verify-content.js 16
```
Expect **0 failures**. Then load the files into the app as an admin: Settings → Export (backup), then Settings → Reset.
