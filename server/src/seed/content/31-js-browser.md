@section Browser & DOM
@icon 🌐
@color #eab308
@desc How the browser turns HTML into pixels: the critical rendering path, reflow and repaint, async/defer, resource hints, DNS and the URL-to-page journey, storage, requestAnimationFrame, events and delegation, heap snapshots and Web Vitals. Numbers measured in Chrome 154.

=== What is the critical rendering path?
@p 3
@tags browser, rendering, crp, performance
@quick
- The steps from bytes to pixels: **HTML → DOM**, **CSS → CSSOM**, DOM + CSSOM → **render tree** → **layout** → **paint** → **composite**.
- **CSS is render-blocking** (no paint until the CSSOM is ready); a classic `<script>` is **parser-blocking** (HTML parsing stops while it downloads and runs).
- Measured in Chrome 154 with a 500 ms resource: first paint **20 ms** with nothing blocking, **512 ms** with a `<script>` in `<head>`, **516 ms** with a slow stylesheet, **20 ms** with `async`, **48 ms** with `defer`.
- Optimise: inline critical CSS, `defer`/`async` scripts, preload key resources, fewer bytes (compression, code splitting), fast server (TTFB).
- `display: none` elements are not in the render tree; `visibility: hidden` ones are (they take space).

::: text 🧒 In simple words
Building a page is like building a **house from a plan**. The HTML is the **floor plan** (DOM), the CSS is the **interior design guide** (CSSOM). Combine them into a **build list** of what's visible (render tree), **measure** where everything goes (layout), **paint** the walls (paint) and **assemble the layers** (composite). If the builder must stop and read a long letter (a blocking script) every few rooms, the house takes longer.
:::

::: text 📖 Detailed answer
### The steps
| Step | Input → output | Notes |
|---|---|---|
| 1. Parse HTML | bytes → tokens → **DOM** | incremental; the preload scanner looks ahead for resources |
| 2. Parse CSS | CSS → **CSSOM** | render-blocking: the browser won't paint unstyled content |
| 3. Render tree | DOM + CSSOM → visible nodes with computed styles | `display:none`, `<head>` excluded |
| 4. Layout (reflow) | sizes and positions of every box | depends on viewport size |
| 5. Paint | draw text, colours, borders, images into layers | |
| 6. Composite | combine layers on the GPU | `transform`/`opacity` animations happen here |

### What blocks
- **CSS** in `<head>` blocks **rendering** (and also running later scripts, since they may read styles).
- A classic `<script src>` blocks **parsing**: the parser waits for download + execution because the script might `document.write` or read the DOM.
- `async`, `defer` and `type="module"` scripts don't block parsing.
- Images don't block, but a late **LCP image** delays Largest Contentful Paint.

### Measured: first contentful paint (Chrome 154, local server, 500 ms delay on one resource)
| Page | First paint | DOMContentLoaded |
|---|---|---|
| no blocking resource | 20 ms | 7 ms |
| `<script>` in `<head>` | **512 ms** | 509 ms |
| `<link rel="stylesheet">` (slow) | **516 ms** | 4 ms |
| `<script async>` | 20 ms | 4 ms |
| `<script defer>` | 48 ms | 506 ms |
| `<script>` at the end of `<body>` | 20 ms | 507 ms |

### Optimising the CRP
1. Minimise critical resources: inline the CSS needed above the fold, load the rest later.
2. Scripts: `defer` (or `type="module"`) for app code, `async` for independent ones.
3. Reduce bytes: compression (Brotli), minification, code splitting, modern image formats.
4. Shorten the path: preconnect to critical origins, preload the LCP image and fonts, use a CDN, good TTFB.
:::

::: diagram Bytes to pixels
flowchart LR
  H["HTML"] --> D["DOM"]
  C["CSS"] --> O["CSSOM"]
  D --> R["Render tree"]
  O --> R
  R --> L["Layout"]
  L --> P["Paint"]
  P --> CO["Composite"]
  JS["JavaScript"] -.->|"can modify"| D
  JS -.->|"can modify"| O
:::

::: image The critical rendering path, with measured first paint times
/images/javascript/crp.svg
:::

::: chart bar Measured: first contentful paint with one 500 ms resource (Chrome 154, ms)
Page,First contentful paint (ms)
nothing blocking,20
script async,20
script at end of body,20
script defer,48
slow stylesheet,516
script in head,512
:::

::: text 🪜 Step by step
Loading `<head><link rel="stylesheet" href="app.css"><script src="app.js"></script></head><body>…`:
1. The parser starts building the DOM; the preload scanner already requests `app.css` and `app.js`.
2. It reaches `<script src="app.js">` and **stops parsing** until the script is downloaded and run (which itself waits for `app.css`, since scripts can read styles).
3. Parsing continues and builds the rest of the DOM.
4. CSSOM ready + DOM → render tree → layout → paint: the user finally sees content.
5. With `defer` on the script, step 2 doesn't stop the parser and the first paint can happen as soon as the CSS is ready.
:::

::: code html Optimised head for a fast first paint
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- 1. Connect early to the API / CDN origins -->
  <link rel="preconnect" href="https://cdn.example.com" crossorigin>
  <!-- 2. Critical above-the-fold CSS inline, the rest loaded without blocking -->
  <style>header{height:64px}.hero{min-height:60vh}</style>
  <link rel="preload" href="/css/app.css" as="style" onload="this.rel='stylesheet'">
  <!-- 3. The LCP image as early as possible -->
  <link rel="preload" href="/img/hero.webp" as="image" fetchpriority="high">
  <!-- 4. App code doesn't block parsing and runs in order after the DOM is ready -->
  <script defer src="/js/app.js"></script>
  <!-- 5. Independent third-party code runs whenever it's ready -->
  <script async src="https://analytics.example.com/a.js"></script>
</head>
<body>
  <header>…</header>
  <img class="hero" src="/img/hero.webp" width="1200" height="600" alt="Product">
</body>
</html>
:::

::: warning ⚠️ Common mistakes
- `<script>` tags in `<head>` without `defer`.
- Huge CSS bundles loaded in `<head>` when only a little is needed for the first screen.
- Lazy-loading the hero (LCP) image.
- Saying "JS blocks rendering" without distinguishing parser-blocking (scripts) from render-blocking (CSS).
:::

::: understand
- Two trees (DOM, CSSOM) → render tree → layout → paint → composite.
- CSS blocks rendering, classic scripts block parsing; `defer`/`async`/modules don't.
:::

::: ask
- *"Which metric is slow: TTFB, FCP or LCP?"* Each points to a different step.
:::

::: important ⭐ Say this in the interview
"The critical rendering path is the sequence from bytes to pixels: the browser parses HTML into the DOM and CSS into the CSSOM, combines them into a render tree of visible nodes, computes layout, paints, and composites layers. CSS is render-blocking and a classic script is parser-blocking. I measured it in Chrome with a 500 millisecond resource: first paint went from 20 milliseconds to over 500 with a script in the head or a slow stylesheet, but stayed at 20 to 48 with async or defer. So I inline critical CSS, defer scripts, preload the LCP image and keep the critical bytes small."
:::

::: links
web.dev: Critical rendering path | https://web.dev/articles/critical-rendering-path
MDN: Critical rendering path | https://developer.mozilla.org/en-US/docs/Web/Performance/Critical_rendering_path
:::

=== What are reflow and repaint, and what is layout thrashing?
@p 3
@tags browser, rendering, reflow, performance, dom
@quick
- **Reflow (layout)**: recalculating sizes and positions. Triggered by geometry changes (`width`, `top`, `font-size`, adding/removing nodes, window resize).
- **Repaint**: redrawing pixels without layout (`color`, `background`, `box-shadow`).
- **Composite only**: `transform` and `opacity` on their own layer, the cheapest, ideal for animations.
- **Layout thrashing**: alternating DOM **writes** and layout **reads** (`offsetWidth`, `getBoundingClientRect`) forces a synchronous layout each time. Measured on 1,000 elements: **106 ms** interleaved vs **1.8 ms** batched (about 59× faster).
- Fix: read everything first, then write; use classes instead of many inline style changes; `requestAnimationFrame` for visual updates.

::: text 🧒 In simple words
Reflow is **rearranging the furniture** in a room: when one sofa gets bigger, everything around it may move. Repaint is just **repainting a wall**: nothing moves. Layout thrashing is asking "how wide is the room now?" after **every single** piece you move, so the movers must re-measure the whole room each time instead of once at the end.
:::

::: text 📖 Detailed answer
### What triggers what
| Change | Layout | Paint | Composite |
|---|---|---|---|
| `width`, `height`, `margin`, `top`, `font-size`, DOM insert/remove, text change | ✅ | ✅ | ✅ |
| `color`, `background`, `box-shadow`, `outline`, `visibility` | | ✅ | ✅ |
| `transform`, `opacity` (promoted layer) | | | ✅ |

### Why reads force layout
Browsers batch style/layout work until the next frame. But if you **write** (`el.style.width = …`) and then **read** a layout value (`el.offsetWidth`), the browser must run layout **now** to give you a correct answer. In a loop, that's one full layout per element.

### Layout-reading properties (force a sync layout)
`offsetTop/Left/Width/Height`, `clientWidth/Height`, `scrollTop/Height`, `getBoundingClientRect()`, `getComputedStyle()`, `innerText`, `focus()`, `scrollIntoView()`.

### Techniques
1. **Batch**: read all values first, then write all.
2. **Classes over inline styles**: toggle one class instead of changing 10 style properties.
3. **Animate `transform`/`opacity`**, not `top/left/width`.
4. **Off-DOM work**: build with a `DocumentFragment` or a single `innerHTML`, then insert once.
5. **`requestAnimationFrame`** for writes; `ResizeObserver` instead of polling sizes.
6. **CSS containment** (`contain: layout`), `content-visibility: auto` for long pages.
:::

::: diagram Thrashing vs batching
flowchart TD
  subgraph TH["thrashing: 1,000 layouts"]
    R1["read offsetWidth"] --> W1["write style.width"]
    W1 --> R2["read offsetWidth: forced layout"]
    R2 --> W2["write style.width"]
  end
  subgraph BA["batched: 1 layout"]
    RA["read all widths"] --> WA["write all widths"]
    WA --> L["one layout in the next frame"]
  end
:::

::: image Reflow, repaint and layout thrashing (measured 106 ms vs 1.8 ms)
/images/javascript/reflow.svg
:::

::: chart bar Measured: resizing 1,000 elements in Chrome 154 (ms)
Approach,Time (ms)
interleaved read/write (thrashing),106
reads first then writes (batched),1.8
:::

::: text 🪜 Step by step
`for (const el of boxes) { const w = el.offsetWidth; el.style.width = w + 1 + 'px'; }`
1. Iteration 1 reads `offsetWidth`: layout is clean → cheap.
2. It writes a new width → layout is now **dirty**.
3. Iteration 2 reads `offsetWidth` → the browser must **recalculate layout right now**.
4. Repeat 1,000 times → 1,000 layouts (106 ms measured).
5. Batched: read all 1,000 widths (one layout), write all 1,000 (one layout later) → 1.8 ms.
:::

::: code javascript Fixing layout thrashing (runs in a browser page)
const boxes = [...document.querySelectorAll('.box')];

// ❌ Thrashing: every read after a write forces a synchronous layout
function slow() {
  for (const el of boxes) {
    const width = el.offsetWidth;          // READ (forces layout if dirty)
    el.style.width = `${width + 1}px`;     // WRITE (makes layout dirty)
  }
}

// ✅ Batched: all reads, then all writes
function fast() {
  const widths = boxes.map((el) => el.offsetWidth);
  boxes.forEach((el, i) => { el.style.width = `${widths[i] + 1}px`; });
}

// ✅ Animations: transform runs on the compositor, no layout
function slideIn(el) {
  el.style.transition = 'transform 300ms ease-out';
  requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; });
}

// ✅ Many inserts: build off-DOM, insert once
function renderList(items, list) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item.name;
    frag.append(li);
  }
  list.replaceChildren(frag);              // one layout instead of one per item
}

const t0 = performance.now(); slow(); const t1 = performance.now(); fast(); const t2 = performance.now();
console.log(`thrashing ${(t1 - t0).toFixed(1)} ms vs batched ${(t2 - t1).toFixed(1)} ms`);
slideIn(document.querySelector('.panel'));
renderList([{ name: 'a' }, { name: 'b' }], document.querySelector('ul'));
:::

::: warning ⚠️ Common mistakes
- Animating `top/left/width/height` instead of `transform`.
- Reading `getBoundingClientRect()` inside a loop that also writes styles.
- Adding hundreds of nodes one by one into the live DOM.
- Using `will-change` on everything (each layer costs memory).
:::

::: understand
- Geometry → layout → paint → composite; only `transform`/`opacity` skip to composite.
- Reads after writes force synchronous layout; batch them.
:::

::: ask
- *"Is the jank during scroll, animation, or a click?"* The Performance panel shows purple (layout) and green (paint) blocks.
:::

::: important ⭐ Say this in the interview
"Reflow, or layout, recalculates element geometry and happens when sizes, positions or the DOM structure change; repaint redraws pixels for visual changes like colour without layout; and transform and opacity can skip both and only composite, which is why I animate them. Layout thrashing is interleaving DOM writes with reads like offsetWidth, which forces a synchronous layout on every read. I measured it on 1,000 elements: 106 milliseconds interleaved versus 1.8 batched. So I read first and write after, toggle classes, build off-DOM and schedule visual writes with requestAnimationFrame."
:::

::: links
web.dev: Avoid large, complex layouts and layout thrashing | https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
What forces layout (Paul Irish) | https://gist.github.com/paulirish/5d52fb081b3570c81e3a
:::

=== What happens after layout? Paint, rasterization and compositing (CPU vs GPU)
@p 2
@tags browser, rendering, rasterization, compositing, gpu
@quick
- **Paint** (main thread, CPU) records **what** to draw as a display list ("rectangle here, text there"); **rasterization** turns that into **pixels** (tiles, on raster threads, usually GPU-accelerated); **compositing** combines layers into the final frame (compositor thread + GPU).
- Pipeline: Style → Layout (**where**) → Paint (**what**) → Rasterize (**pixels**) → Composite (**layers → screen**).
- Elements with their own **layer** (transform/opacity animations, `will-change`, video, canvas) can be moved by the compositor **without layout or paint**.
- Measured in Chrome: animating a box 500 px for 1 s with **`left` caused 62 layouts**; with **`transform`, 1 layout**.
- Check GPU status at `chrome://gpu`; inspect layers in DevTools → Layers; too many layers waste GPU memory.

::: text 🧒 In simple words
Making a poster: **layout** decides where each picture goes, **paint** writes the drawing instructions ("draw a red circle here"), **rasterization** is the printer turning instructions into dots, and **compositing** is stacking transparent sheets on top of each other. To move one picture, you can just **slide its sheet** (composite) instead of reprinting the whole poster.
:::

::: text 📖 Detailed answer
| Stage | Thread / hardware | Output | Triggered by |
|---|---|---|---|
| Style | main (CPU) | computed styles | class/style changes |
| Layout | main (CPU) | boxes with positions and sizes | geometry changes |
| Paint | main (CPU) | display list (draw commands) per layer | visual changes |
| Rasterize | raster worker threads, GPU (OOP raster) | bitmap **tiles** | new/changed paint, zoom |
| Composite | compositor thread + GPU | the frame on screen | scrolling, transform/opacity changes |

### Tiles
Long pages aren't rasterized in one bitmap: the browser splits layers into **tiles** and rasterizes the ones near the viewport first, which is why fast scrolling can briefly show checkerboard/blank areas.

### Layers and why transform is cheap
When an element is on its own compositor layer, changing `transform` or `opacity` just tells the GPU to draw the existing texture somewhere else or more transparent. No layout, no paint, no rasterization. The compositor thread can even keep animating while the main thread is busy.

### Measured (Chrome, `Performance.getMetrics`, 1 s animation)
| Animated property | LayoutCount | Layout time |
|---|---|---|
| `left` | 62 | 2.9 ms |
| `transform: translateX` | 1 | 0.06 ms |

### Costs
Each layer needs GPU memory (width × height × 4 bytes); hundreds of `will-change: transform` elements can make things slower, especially on mobile.
:::

::: diagram From DOM to pixels on screen
flowchart LR
  S["Style (main)"] --> L["Layout: where (main)"]
  L --> P["Paint: what, display list (main)"]
  P --> R["Rasterize: pixels in tiles (raster threads, GPU)"]
  R --> C["Composite: layers to a frame (compositor, GPU)"]
  T["transform or opacity change on a layer"] -.->|"skips layout, paint, raster"| C
:::

::: image Paint, rasterization and compositing (measured layouts)
/images/javascript/raster-composite.svg
:::

::: chart bar Measured in Chrome: layouts while animating a box for 1 second
Animated property,Layouts
left,62
transform,1
:::

::: text 🪜 Step by step
Changing `box.style.transform = 'translateX(100px)'` on a layered element:
1. Style recalculation: the new transform value is computed (cheap).
2. Layout: **skipped**: transform doesn't change geometry in the layout tree.
3. Paint and rasterization: **skipped**: the layer's pixels are unchanged.
4. Compositor: draws the existing layer texture 100 px to the right.
5. With `left: 100px` instead, steps 2–4 all run, every frame.
:::

::: code javascript Which pipeline stages a CSS property change triggers (runnable)
// Simplified from csstriggers.com / Chrome behaviour.
const LAYOUT = ['width', 'height', 'left', 'top', 'margin', 'padding', 'font-size', 'display', 'border-width'];
const PAINT_ONLY = ['color', 'background-color', 'box-shadow', 'border-color', 'visibility', 'outline'];
const COMPOSITE_ONLY = ['transform', 'opacity'];
function stagesFor(prop) {
  if (COMPOSITE_ONLY.includes(prop)) return ['style', 'composite'];
  if (PAINT_ONLY.includes(prop)) return ['style', 'paint', 'raster', 'composite'];
  if (LAYOUT.includes(prop)) return ['style', 'layout', 'paint', 'raster', 'composite'];
  return ['style', 'layout', 'paint', 'raster', 'composite'];   // assume the worst when unsure
}
for (const p of ['left', 'background-color', 'transform', 'opacity']) console.log(p.padEnd(18), stagesFor(p).join(' → '));
console.log('transform skips layout and paint', !stagesFor('transform').includes('layout') && !stagesFor('transform').includes('paint') ? '✅' : '❌ FAIL');
console.log('left needs layout', stagesFor('left').includes('layout') ? '✅' : '❌ FAIL');
const framesPerSecond = 60;
console.log(`animating left for 1 s ≈ ${framesPerSecond} layouts (measured 62), transform ≈ 1 (measured 1)`, '✅');
:::

::: warning ⚠️ Common mistakes
- Saying "paint" when you mean the whole render: paint ≠ rasterization ≠ compositing.
- Animating `top/left/width` for movement instead of `transform`.
- `will-change` on everything ("layer explosion").
- Assuming the GPU does all the work (style, layout and paint are still main-thread CPU work).
:::

::: understand
- Layout = where, paint = what, raster = pixels, composite = stack layers; transform/opacity jump straight to composite.
:::

::: ask
- *"Does this animation run while the main thread is busy?"* Compositor-only properties keep it smooth.
:::

::: important ⭐ Say this in the interview
"After style and layout, the main thread paints, which records drawing commands into a display list; rasterization turns those commands into pixels in tiles, on raster threads with GPU acceleration; and the compositor thread combines layers into the frame on the GPU. If an element has its own layer, changing transform or opacity skips layout, paint and raster entirely, so the compositor just moves the texture. I measured that animating left caused 62 layouts in a second while transform caused one. Layers cost GPU memory, so I promote only what animates, and check chrome://gpu and the Layers panel when debugging."
:::

::: links
Chrome: Inside look at modern web browser (part 3) | https://developer.chrome.com/blog/inside-browser-part3
web.dev: Stick to compositor-only properties | https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
Chrome: RenderingNG architecture | https://developer.chrome.com/docs/chromium/renderingng-architecture
:::

=== How does the browser produce frames? (vsync, the 16.7 ms budget, dropped frames)
@p 2
@tags browser, frames, vsync, jank, performance
@quick
- A 60 Hz screen refreshes every **16.7 ms** (120 Hz: 8.3 ms). The browser tries to deliver a new frame for each refresh (**vsync**).
- Each frame's main-thread work (input, JS, rAF, style, layout, paint) must fit the budget; if it doesn't, the frame is **dropped** and the update appears at the **next** vsync.
- Measured in Chrome: after a 25 ms task, rAF callback gaps were **16.5 → 25.0 → 8.4 → 16.6 ms**: the work ended at 25 ms but the next frame started on the grid at ~33.3 ms: **one dropped frame**.
- Dropped frames = **jank**: an animation jumps (position 1 → 3). Time-based animation keeps the *position* correct even when frames drop.
- The **Long Animation Frames** API reports slow frames: a 120 ms blocking task appeared as a **135.6 ms** entry.

::: text 🧒 In simple words
The screen is a **train that leaves every 16.7 ms**. Each frame is a passenger. If the passenger (your frame) is ready in time, it gets on. If it's still packing (long JavaScript) when the train leaves, it waits for the **next train**: the screen shows the old picture for one more trip, and the movement looks like it jumped.
:::

::: text 📖 Detailed answer
### The frame loop
1. Vsync signal (every 16.7 ms at 60 Hz).
2. Input events → JS tasks → `requestAnimationFrame` callbacks.
3. Style → layout → paint (main thread), then raster and composite.
4. The frame is presented at a vsync. If not ready, the previous frame stays on screen.

### Measured in Chrome (rAF callbacks; a 25 ms busy loop inside one callback)
| Gap between callbacks | Meaning |
|---|---|
| 16.5 ms | normal frame |
| 25.0 ms | the next callback started late (the 25 ms task blocked it) |
| 8.4 ms | the browser caught up to the vsync grid: 25 + 8.4 = 33.4 ms |
| 16.6 ms | back to normal |
So the work that finished at 25 ms reached the screen with the frame at ~33.3 ms, and the frame at 16.7 ms was lost.

### Consequences
- Animations: move by **elapsed time** (`x = speed × (now − start)`), not by "one step per frame", so the object is in the right place even if a frame drops.
- Input responsiveness (INP): a long task delays the next paint after a click; INP measures exactly that.
- Variable refresh rate displays and the compositor make real timing more nuanced, but the 16.7 ms model is the right mental picture.

### Measuring
- `requestAnimationFrame` timestamps, the DevTools frame track (dropped frames in red/yellow).
- `new PerformanceObserver(cb).observe({ type: 'long-animation-frame' })`: a 120 ms task was reported as one 135.6 ms long animation frame (task + rendering).
:::

::: diagram A frame that misses the deadline
sequenceDiagram
  participant V as Vsync (every 16.7 ms)
  participant M as Main thread
  participant S as Screen
  V->>M: "frame 1 at 0 ms"
  M-->>S: "frame 1 ready in time"
  V->>M: "frame 2 at 16.7 ms"
  Note over M: "long task until 25 ms: deadline missed"
  S->>S: "frame 1 stays on screen (dropped frame)"
  V->>M: "frame 3 at 33.3 ms"
  M-->>S: "new frame shown at 33.3 ms"
:::

::: image Frames, vsync and dropped frames (measured)
/images/javascript/frames.svg
:::

::: chart line Measured in Chrome: gap between rAF callbacks around a 25 ms task (ms)
Callback,Gap (ms)
1,16.5
2,25
3,8.4
4,16.6
5,16.7
:::

::: text 🪜 Step by step
A game moving a player 10 px per frame at 60 Hz:
1. Frames at 0, 16.7, 33.3, 50 ms should show x = 0, 10, 20, 30.
2. A 25 ms task runs during frame 2.
3. Frame 2's deadline (16.7 ms) is missed; the screen keeps showing x = 0.
4. At 33.3 ms the next frame is presented. With step-per-frame logic it shows x = 10 (the game "slowed down"); with time-based logic it shows x = 20 (correct position, one visible jump).
5. Either way the user sees jank; the fix is to remove or split the long task.
:::

::: code javascript Frame scheduling model: when does work reach the screen? (runnable)
// Given a refresh interval and how long each frame's work takes, compute when each update is shown.
function present(workMs, interval = 1000 / 60) {
  const shown = [];
  let t = 0;
  for (const w of workMs) {
    const ready = t + w;
    const vsync = Math.ceil(ready / interval) * interval;   // next refresh after the work is done
    shown.push(+vsync.toFixed(1));
    t = vsync;                                              // next frame starts at that vsync
  }
  return shown;
}
const normal = present([5, 5, 5, 5]);
const withLongTask = present([5, 25, 5, 5]);
console.log('normal frames shown at   ', normal.join(', '));
console.log('with a 25 ms task, shown at', withLongTask.join(', '));
console.log('each normal frame takes one vsync', normal.join() === '16.7,33.3,50,66.7' ? '✅' : '❌ FAIL');
console.log('the 25 ms frame lands on the vsync after next (one dropped frame)', withLongTask[1] === 50 ? '✅' : '❌ FAIL');

// Time-based movement stays correct when frames drop
const speed = 0.6;                                          // px per ms
console.log('position at 50 ms (time-based):', speed * 50, 'px', speed * 50 === 30 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- "16 ms per frame for JavaScript" (the budget also covers style, layout and paint, so JS should take much less).
- Step-per-frame animations that slow down on slow devices or speed up on 120 Hz screens.
- Using `setInterval(fn, 16)` for animation (not aligned with vsync).
- Confusing a slow network (late content) with dropped frames (main-thread jank).
:::

::: understand
- The screen sets the rhythm; your work must fit between beats or the beat is skipped.
:::

::: ask
- *"Is the jank during animation, scrolling or after input?"* It points to rAF work, scroll handlers or event handlers.
:::

::: important ⭐ Say this in the interview
"Displays refresh at a fixed rhythm, every 16.7 milliseconds at 60 hertz, and the browser tries to produce a frame for each vsync. All main-thread work for the frame, input, JavaScript, rAF, style, layout and paint, has to fit in that budget; if it doesn't, the frame is dropped and the update appears at the next vsync. I measured it: after a 25 millisecond task the rAF gaps went 16.5, 25, 8.4, 16.6, so the result reached the screen at about 33 milliseconds, one dropped frame. That's jank, and the same long tasks hurt INP. I use time-based animation, keep tasks short, and check the Long Animation Frames API and the DevTools frames track."
:::

::: links
web.dev: Rendering performance | https://web.dev/articles/rendering-performance
Chrome: Long Animation Frames API | https://developer.chrome.com/docs/web-platform/long-animation-frames
MDN: requestAnimationFrame | https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
:::

=== Does the browser paint the whole page at once? (progressive rendering)
@p 2
@tags browser, rendering, streaming, progressive, lcp
@quick
- **No.** The HTML parser builds the DOM **incrementally** as bytes arrive, and the browser paints whatever is ready at the next frame: users see the page **in chunks**.
- Measured with a streamed page (3 chunks, 300 ms apart): header painted at **28 ms**, sidebar at **308 ms**, main text at **612 ms**; the LCP candidate updated each time.
- What stops early painting: **CSS in `<head>`** (render-blocking: no paint until loaded), **parser-blocking scripts**, and server responses that buffer the whole page.
- Server streaming (Next.js/React `<Suspense>`, `res.write` chunks) uses this to show a shell immediately.
- Layout and paint happen many times during load: each new chunk can cause **reflow/repaint**, and late-inserted content above existing content causes **CLS**.

::: text 🧒 In simple words
A long page arrives like a **newspaper being printed page by page**. The browser doesn't wait for the last page; it shows the front page as soon as it's printed, then adds more as they come. The only thing it waits for is the **style guide** (CSS), so it doesn't show pages in the wrong font and then reprint them.
:::

::: text 📖 Detailed answer
### How a long HTML file is processed
1. Bytes arrive over the network in chunks (TCP packets / HTTP/2 frames).
2. The parser tokenizes and builds DOM nodes as it goes (speculative preload scanner fetches resources early).
3. Once CSS in `<head>` is ready, the browser can render: at the next frame it lays out and paints **what exists so far**.
4. More HTML arrives → more DOM → another layout/paint at a later frame.
5. Each paint can update LCP (a bigger element appeared) and may cause layout shifts.

### Measured: a server that streams 3 chunks 300 ms apart
| Chunk | Painted at | LCP candidate |
|---|---|---|
| `<header>` | 28 ms | header (846 px²) |
| `<aside>` sidebar | 308 ms | sidebar (882 px²) |
| `<main>` with large text | 612 ms | paragraph (324,254 px²) |

### What changes it
| Factor | Effect |
|---|---|
| stylesheet in `<head>` | nothing paints until it loads (measured 600 ms CSS → FCP 612 ms) |
| classic `<script>` mid-body | parsing (and thus later content) waits for it |
| server buffering (no streaming) | browser gets everything at the end |
| `<Suspense>` streaming (React/Next.js) | shell first, slow parts later in the same response |
| `content-visibility: auto` | offscreen sections skip layout/paint until needed |
:::

::: diagram Bytes to pixels, chunk by chunk
sequenceDiagram
  participant S as Server
  participant P as Parser
  participant R as Renderer
  S->>P: "chunk 1: header"
  P->>R: "DOM so far"
  R->>R: "layout + paint at next frame (28 ms)"
  S->>P: "chunk 2: sidebar"
  R->>R: "layout + paint (308 ms)"
  S->>P: "chunk 3: main content"
  R->>R: "layout + paint (612 ms), new LCP candidate"
:::

::: image Does the browser paint the page all at once? (measured)
/images/javascript/progressive.svg
:::

::: chart bar Measured: when each streamed chunk was painted (ms)
Chunk,Painted at (ms)
header,28
sidebar,308
main text,612
:::

::: text 🪜 Step by step
Why a slow stylesheet hides everything while a slow chunk doesn't:
1. CSS in `<head>` is render-blocking: the browser won't paint the first frame without it (avoids a flash of unstyled content).
2. A 600 ms stylesheet → first paint at 612 ms even though the HTML arrived at once.
3. After CSS is ready, there's no such rule for HTML: whatever DOM exists is painted.
4. So a streamed page shows the header at 28 ms and the rest as it arrives.
5. Design implication: ship critical CSS early, stream HTML, reserve space for later content (avoid CLS).
:::

::: code javascript server.js: a streaming response that paints progressively (Node, no framework)
const http = require('node:http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http.createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  // 1) shell + header immediately (inline critical CSS so nothing blocks rendering)
  res.write('<!doctype html><html><head><style>aside{float:left;width:200px}main{margin-left:220px}</style></head><body>');
  res.write('<header>My Shop</header>');
  // 2) slower data: the browser paints the header meanwhile
  await sleep(300);
  res.write('<aside>Categories…</aside>');
  await sleep(300);
  res.write('<main><h1>Products</h1><p>All products are listed here.</p></main>');
  res.end('</body></html>');
}).listen(3000, () => console.log('http://localhost:3000'));
:::

::: code javascript Progressive rendering model: paints and LCP candidates (runnable)
// Chunks arrive at given times; the browser paints at the next frame after each chunk.
const frame = 1000 / 60;
const chunks = [{ at: 20, el: 'header', area: 846 }, { at: 300, el: 'sidebar', area: 882 }, { at: 600, el: 'main text', area: 324254 }];
let lcp = null;
const timeline = chunks.map((c) => {
  const paintedAt = Math.ceil(c.at / frame) * frame;
  if (!lcp || c.area > lcp.area) lcp = { ...c, paintedAt };
  return `${c.el} painted at ${paintedAt.toFixed(0)} ms (LCP candidate: ${lcp.el})`;
});
console.log(timeline.join('\n'));
console.log('content appears in 3 separate paints', timeline.length === 3 ? '✅' : '❌ FAIL');
console.log('final LCP is the biggest element, painted last', lcp.el === 'main text' && Math.round(lcp.paintedAt) === 600 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Believing the page is painted once at the end (or once per element).
- Large stylesheets in `<head>` hiding a streamed page.
- Inserting late content above already-visible content (layout shift).
- Buffering the whole response on the server (compression or frameworks that don't stream).
:::

::: understand
- Parsing, layout and paint are incremental; render-blocking CSS is the gate for the first paint.
:::

::: ask
- *"Does our server stream HTML, and what blocks the first paint?"*
:::

::: important ⭐ Say this in the interview
"The browser doesn't wait for the whole page. The parser builds the DOM incrementally as bytes arrive and, once render-blocking CSS is ready, the browser lays out and paints whatever exists at the next frame, so long or streamed pages appear in chunks. I measured a page streamed in three chunks: the header painted at 28 milliseconds, the sidebar at 308 and the main text at 612, and the LCP candidate updated each time. What delays the first paint is CSS in the head and parser-blocking scripts, which is why we inline critical CSS, defer scripts and stream with Suspense."
:::

::: links
web.dev: Critical rendering path | https://web.dev/articles/critical-rendering-path
Jake Archibald: Fun hacks for faster content (streaming) | https://jakearchibald.com/2016/fun-hacks-faster-content/
React: renderToPipeableStream | https://react.dev/reference/react-dom/server/renderToPipeableStream
:::

=== async vs defer: how should scripts be loaded?
@p 3
@tags browser, scripts, async, defer, performance
@quick
- **Normal `<script>`**: parsing **stops** while the script downloads and runs.
- **`async`**: downloads in parallel, runs **as soon as it arrives** (interrupting parsing), **no order guarantee**. For independent scripts (analytics, ads).
- **`defer`**: downloads in parallel, runs **after parsing** finishes, **in document order**, before `DOMContentLoaded`. For app code.
- **`type="module"`**: deferred by default (add `async` to run when ready); supports `import`.
- Measured (Chrome 154, 500 ms script): first paint **512 ms** normal, **20 ms** async, **48 ms** defer; DOMContentLoaded **4 ms** with async vs **506 ms** with defer.

::: text 🧒 In simple words
You're reading a book (parsing HTML) and need a few reference sheets (scripts). **Normal**: you stop reading, go get the sheet, read it, then continue. **async**: a friend fetches it, and **interrupts you** to read it whenever they're back. **defer**: a friend fetches it, and you read all the sheets **in order after finishing the book**.
:::

::: text 📖 Detailed answer
| | Blocks parsing | Download | Runs | Order kept | Before DOMContentLoaded |
|---|---|---|---|---|---|
| `<script>` | ✅ yes | blocking | immediately | ✅ | ✅ |
| `<script async>` | only while running | parallel | when downloaded | ❌ | not guaranteed |
| `<script defer>` | ❌ | parallel | after parsing | ✅ | ✅ (just before) |
| `<script type="module">` | ❌ | parallel (+ imports) | after parsing | ✅ | ✅ |
| dynamic `import()` / injected script | ❌ | when called | when ready | ❌ | no |

### Measured (Chrome 154, local server, script delayed 500 ms)
| | First contentful paint | DOMContentLoaded | Script ran at |
|---|---|---|---|
| `<script>` in head | 512 ms | 509 ms | 508 ms |
| `async` | 20 ms | 4 ms | 506 ms |
| `defer` | 48 ms | 506 ms | 506 ms |
| end of `<body>` | 20 ms | 507 ms | 507 ms |

### Which one?
- App bundle that needs the DOM and depends on other scripts → **`defer`** (or `type="module"`).
- Independent third-party (analytics, chat widget) → **`async`**, or load it after the page is interactive.
- Inline scripts ignore `async`/`defer` (except modules).
- `<script>` at the end of `<body>` was the old trick; `defer` in the `<head>` is better because the download starts earlier.
:::

::: diagram What happens to HTML parsing
flowchart LR
  P["HTML parsing"] --> N{"script type?"}
  N -->|"normal"| ST["pause: download + run, then continue"]
  N -->|"async"| AS["keep parsing, run when downloaded (pauses briefly)"]
  N -->|"defer or module"| DF["keep parsing, run after parsing, in order"]
  DF --> DCL["DOMContentLoaded"]
:::

::: image Script loading: normal vs async vs defer
/images/javascript/async-defer.svg
:::

::: chart bar Measured: first contentful paint with a 500 ms script (Chrome 154, ms)
Script tag,First paint (ms)
script in head,512
async,20
defer,48
end of body,20
:::

::: text 🪜 Step by step
`<head><script defer src="a.js"></script><script defer src="b.js"></script></head>` where `b.js` downloads first:
1. The parser sees both tags and starts both downloads without stopping.
2. `b.js` finishes first, but it **waits** (defer keeps order).
3. HTML parsing finishes.
4. `a.js` runs, then `b.js`.
5. `DOMContentLoaded` fires. With `async`, `b.js` would have run first, possibly before the DOM was complete.
:::

::: code html Choosing the right loading strategy
<head>
  <!-- App code: needs the DOM, keeps order (vendor before app) -->
  <script defer src="/js/vendor.js"></script>
  <script defer src="/js/app.js"></script>

  <!-- ES modules are deferred automatically -->
  <script type="module" src="/js/main.mjs"></script>

  <!-- Independent third party: run whenever ready -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
</head>
<body>
  <button id="open-chat">Chat</button>
  <script>
    // Load heavy, optional code only when needed
    document.getElementById('open-chat').addEventListener('click', async () => {
      const { openChat } = await import('/js/chat-widget.mjs');
      openChat();
    }, { once: true });
  </script>
</body>
:::

::: warning ⚠️ Common mistakes
- Using `async` for scripts that depend on each other or on the full DOM.
- Putting `defer` on inline scripts (ignored).
- Assuming `async` scripts run after `DOMContentLoaded`.
- Loading every third-party script synchronously in `<head>`.
:::

::: understand
- Normal blocks parsing; async runs ASAP without order; defer runs after parsing in order; modules defer by default.
:::

::: ask
- *"Does this script depend on the DOM or on another script?"* Yes → defer; no → async.
:::

::: important ⭐ Say this in the interview
"A normal script blocks HTML parsing while it downloads and runs. async and defer both download in parallel. An async script runs as soon as it arrives, in any order, so it's for independent things like analytics. A deferred script runs after parsing, in document order, just before DOMContentLoaded, so it's for application code; modules are deferred by default. I measured a 500 millisecond script in Chrome: first paint was 512 milliseconds as a normal head script, 20 with async and 48 with defer."
:::

::: links
MDN: script element (async, defer) | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script
HTML spec: script loading diagram | https://html.spec.whatwg.org/multipage/scripting.html#attr-script-defer
:::

=== preload vs prefetch vs preconnect vs dns-prefetch
@p 2
@tags browser, performance, resource-hints, preload
@quick
- **dns-prefetch**: resolve a domain name early (cheap). **preconnect**: DNS + TCP + TLS early (saves 1 to 3 round trips); use for 1 to 3 critical origins.
- **preload**: fetch a resource needed **for this page** now, at high priority (`as=` is required): fonts, LCP image, critical CSS.
- **prefetch**: fetch something for the **next** navigation at low priority, when idle.
- **modulepreload**: preload + parse JS modules; **fetchpriority**: `high` for the LCP image, `low` for below-the-fold.
- Overusing preload hurts: it competes with critical resources, and unused preloads show a console warning.

::: text 🧒 In simple words
Going on a trip: **dns-prefetch** = looking up the address. **preconnect** = also driving to the building and **opening the door**. **preload** = packing what you need **today** first. **prefetch** = packing what you'll need **tomorrow**, only when you have free time.
:::

::: text 📖 Detailed answer
| Hint | What it does | Priority | Use for |
|---|---|---|---|
| `dns-prefetch` | DNS lookup only | low cost | many third-party origins |
| `preconnect` | DNS + TCP + TLS | moderate (keeps a socket open) | 1 to 3 critical origins (API, CDN, fonts) |
| `preload` | downloads the resource now | as for its type (high for fonts/CSS) | late-discovered critical resources: fonts, LCP image, CSS imported from CSS |
| `modulepreload` | downloads + parses a module and dependencies | high | entry modules |
| `prefetch` | downloads for later | lowest (idle) | likely next page's JS/data |
| `fetchpriority` | changes priority of a fetch | high/low/auto | hero image high, carousels low |

### Details that matter
- `preload` needs `as` (`style`, `script`, `font`, `image`, `fetch`) and `crossorigin` for fonts, or the resource is downloaded twice.
- Preloaded resources should be **used within a few seconds**, or Chrome warns.
- `preconnect` costs CPU and sockets; only for origins you'll definitely use soon.
- The **Speculation Rules API** (`<script type="speculationrules">`) can prefetch or even **prerender** whole next pages in Chromium.

### DNS lookup in one line
Before connecting, the browser resolves the hostname: browser cache → OS cache → configured resolver (ISP/1.1.1.1) → root → TLD (`.com`) → the domain's authoritative server; results are cached for the record's TTL.
:::

::: diagram Connection setup and which hint skips what
flowchart LR
  D["DNS lookup"] --> T["TCP handshake"]
  T --> S["TLS handshake"]
  S --> R["HTTP request"]
  R --> B["Download"]
  DP["dns-prefetch"] -.-> D
  PC["preconnect"] -.-> S
  PL["preload / prefetch"] -.-> B
:::

::: image Resource hints: what each one does early
/images/javascript/resource-hints.svg
:::

::: text 🪜 Step by step
A page uses a web font from `fonts.example.com` referenced inside CSS:
1. Without hints: HTML → CSS downloaded and parsed → the font URL is discovered **late** → DNS + TCP + TLS → font download → text finally renders.
2. Add `<link rel="preconnect" href="https://fonts.example.com" crossorigin>` → the connection is ready while the CSS downloads.
3. Add `<link rel="preload" href="…/inter.woff2" as="font" type="font/woff2" crossorigin>` → the font downloads in parallel with the CSS.
4. Use `font-display: swap` so text shows immediately with a fallback.
5. Result: the font arrives one or more round trips earlier and less text flashes.
:::

::: code html Resource hints in practice
<head>
  <!-- Third-party origins you'll touch: cheap DNS warm-up -->
  <link rel="dns-prefetch" href="https://analytics.example.com">

  <!-- Critical origins: full connection warm-up -->
  <link rel="preconnect" href="https://api.example.com">
  <link rel="preconnect" href="https://fonts.example.com" crossorigin>

  <!-- Late-discovered critical resources for THIS page -->
  <link rel="preload" href="https://fonts.example.com/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/img/hero.avif" as="image" fetchpriority="high">
  <link rel="modulepreload" href="/js/app.mjs">

  <!-- Likely NEXT page: fetched when the browser is idle -->
  <link rel="prefetch" href="/js/checkout.chunk.js">

  <!-- Chromium: prerender links the user is about to click -->
  <script type="speculationrules">
    { "prerender": [{ "where": { "href_matches": "/product/*" }, "eagerness": "moderate" }] }
  </script>
</head>
:::

::: warning ⚠️ Common mistakes
- Preloading too many things (they compete with truly critical resources).
- Forgetting `crossorigin` on font preloads (double download).
- `preconnect` to a dozen origins.
- Using `prefetch` for something needed on the current page.
:::

::: understand
- Hints move work **earlier**: name resolution, connection, or the download itself.
:::

::: ask
- *"Is the resource late-discovered and critical?"* That's the case for preload.
:::

::: important ⭐ Say this in the interview
"They all start work early. dns-prefetch only resolves a domain; preconnect also opens the TCP and TLS connection, which saves round trips for one to three critical origins. preload downloads a resource the current page needs but discovers late, like fonts or the LCP image, at high priority; prefetch downloads something for the next navigation at idle priority. modulepreload does the same for JS modules and fetchpriority adjusts priority. I use them sparingly, because over-preloading competes with the truly critical resources."
:::

::: links
web.dev: Preload critical assets | https://web.dev/articles/preload-critical-assets
MDN: rel=preconnect | https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/preconnect
MDN: Speculation Rules API | https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API
:::

=== What happens when you type a URL and press Enter? (DNS lookup to pixels)
@p 3
@tags browser, networking, dns, http, rendering
@quick
- 1 **URL parsing** (search or URL? HSTS → force HTTPS), check caches / service worker.
- 2 **DNS lookup**: browser cache → OS → resolver → root → TLD → authoritative server → IP (cached for the TTL).
- 3 **TCP** handshake (1 round trip) + **TLS** (1 RTT with TLS 1.3); HTTP/3 uses **QUIC** over UDP (combined, can be 0-RTT on repeat).
- 4 **HTTP request** → server (load balancer, app, DB) → **response**; time to the first byte = **TTFB**.
- 5 **Render**: parse HTML, fetch CSS/JS/images, CRP → paint; then JS makes it interactive.

::: text 🧒 In simple words
Sending a letter to a shop: you **look up the address** in the phone book (DNS), **call to confirm** they're open (TCP), agree on a **secret code** so nobody can read your letters (TLS), **send your order** (HTTP request), receive the **parcel** (response), then **assemble** the furniture inside (rendering).
:::

::: text 📖 Detailed answer
### 1. Input and caches
The browser decides whether you typed a URL or a search, applies **HSTS** (always HTTPS for known sites), and may answer from a **service worker** or the **HTTP cache** without touching the network.

### 2. DNS lookup
| Step | Where |
|---|---|
| browser DNS cache | in memory |
| OS cache / hosts file | `/etc/hosts` |
| recursive resolver | ISP, 1.1.1.1, 8.8.8.8 (it does the rest) |
| root servers | "ask the `.com` servers" |
| TLD servers | "ask example.com's nameservers" |
| authoritative server | returns the A/AAAA record (IP) with a **TTL** |

CDNs answer with an IP close to the user. `dns-prefetch` does this step early.

### 3. Connection
- **TCP**: SYN → SYN-ACK → ACK.
- **TLS 1.3**: client hello/server hello, certificate checked against trusted CAs, keys agreed (1 RTT).
- **HTTP/2** multiplexes many requests on one connection; **HTTP/3** runs over QUIC (UDP), avoiding TCP head-of-line blocking.

### 4. Request and response
`GET /` with headers (cookies, `Accept-Encoding`). The server (often CDN → load balancer → app → cache/DB) returns status, headers (`Cache-Control`, `Set-Cookie`, `Content-Encoding: br`) and the HTML. **Redirects** add whole round trips.

### 5. Rendering
The critical rendering path: DOM, CSSOM, render tree, layout, paint, composite; scripts execute; images and fonts load; the page becomes interactive. Metrics along the way: TTFB → FCP → LCP; INP for interactions afterwards.
:::

::: diagram From Enter to pixels
sequenceDiagram
  participant B as Browser
  participant R as DNS resolver
  participant S as Server
  B->>R: "where is example.com?"
  R-->>B: "93.184.216.34 (TTL 300 s)"
  B->>S: "TCP SYN"
  S-->>B: "SYN-ACK"
  B->>S: "TLS hello + key share"
  S-->>B: "certificate + key share"
  B->>S: "GET / (HTTP/2)"
  S-->>B: "200 OK + HTML"
  Note over B: "parse, fetch CSS and JS, layout, paint"
:::

::: image From URL to pixels
/images/javascript/url-to-pixels.svg
:::

::: text 🪜 Step by step
Typing `example.com` for the first time on a phone (about 100 ms round trip):
1. HSTS says HTTPS → `https://example.com/`.
2. DNS: nothing cached → resolver walks root → `.com` → authoritative → IP (about 1 round trip to the resolver, more if its cache is cold).
3. TCP (1 RTT) + TLS 1.3 (1 RTT) → about 200 ms before the request is even sent.
4. Request + server work → TTFB.
5. HTML arrives → more requests for CSS/JS (on the same HTTP/2 connection) → render. That's why CDNs, preconnect and avoiding redirects matter.
:::

::: code javascript Simulation: a caching DNS resolver with TTLs (runnable)
// Tiny model of how DNS answers are cached at each layer.
const authoritative = { 'example.com': { ip: '93.184.216.34', ttl: 300 }, 'api.example.com': { ip: '93.184.216.35', ttl: 60 } };

function makeResolver(name, upstream) {
  const cache = new Map();
  let hits = 0, misses = 0;
  return {
    name,
    resolve(host, now) {
      const entry = cache.get(host);
      if (entry && entry.expires > now) { hits++; return { ...entry.answer, from: name }; }
      misses++;
      const answer = upstream ? upstream.resolve(host, now) : { ...authoritative[host], from: 'authoritative' };
      if (!answer.ip) throw new Error(`NXDOMAIN ${host}`);
      cache.set(host, { answer, expires: now + answer.ttl * 1000 });
      return answer;
    },
    stats: () => ({ hits, misses }),
  };
}

const isp = makeResolver('ISP resolver', null);
const os = makeResolver('OS cache', isp);
const browser = makeResolver('browser cache', os);

const first = browser.resolve('example.com', 0);
const second = browser.resolve('example.com', 1000);           // 1 s later
const afterTtl = browser.resolve('example.com', 301000);       // after the 300 s TTL
console.log(first.from, '→', second.from, '→', afterTtl.from);
console.log('first lookup goes all the way', first.from === 'authoritative' ? '✅' : '❌ FAIL');
console.log('repeat lookups hit the browser cache', second.from === 'browser cache' ? '✅' : '❌ FAIL');
console.log('after the TTL the answer is fetched again', afterTtl.from === 'authoritative' ? '✅' : '❌ FAIL');
let error = '';
try { browser.resolve('nope.example', 0); } catch (e) { error = e.message; }
console.log('unknown names fail', error === 'NXDOMAIN nope.example' ? '✅' : '❌ FAIL');

// Round trips before the first byte of HTML (cold connection, 100 ms RTT)
const rtt = 100;
const steps = { dns: 1, tcp: 1, tls13: 1, request: 1 };
const total = Object.values(steps).reduce((a, b) => a + b, 0) * rtt;
console.log(`cold start ≈ ${total} ms of pure network latency before server work`, total === 400 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Skipping DNS/TCP/TLS and jumping straight to "the server sends HTML".
- Forgetting caches (browser, service worker, CDN) that can skip whole steps.
- Ignoring redirects (`http → https → www`) that each cost round trips.
- Not mentioning what happens after HTML arrives (the CRP).
:::

::: understand
- Network (DNS, TCP, TLS, HTTP) gets the bytes; the CRP turns them into pixels; latency is counted in round trips.
:::

::: ask
- *"How deep should I go: networking, server, or rendering?"* Interviewers often want one part in detail.
:::

::: important ⭐ Say this in the interview
"The browser parses the URL, applies HSTS and checks its caches and service worker. Then DNS resolves the hostname through the browser and OS caches and a recursive resolver, which walks root, TLD and authoritative servers and caches the answer for its TTL. It opens a TCP connection and does a TLS handshake, or uses QUIC for HTTP/3, sends the HTTP request, and the server returns the HTML; that's the time to first byte. Then the critical rendering path builds the DOM and CSSOM, loads the subresources, lays out and paints. Each step costs round trips, which is why CDNs, preconnect and avoiding redirects help."
:::

::: links
MDN: How browsers work | https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work
Cloudflare: What is DNS? | https://www.cloudflare.com/learning/dns/what-is-dns/
:::

=== HTTP/1.1 vs HTTP/2 vs HTTP/3: what changed?
@p 2
@tags browser, networking, http2, http3, quic
@quick
- **HTTP/1.1**: one request at a time per TCP connection; browsers open **~6 connections per origin**, so many small files queue (head-of-line blocking per connection).
- **HTTP/2**: one TCP+TLS connection carries **many parallel streams** (multiplexing), **HPACK** header compression, stream priorities.
- **HTTP/3**: HTTP over **QUIC (UDP)**: TLS 1.3 built in, **no TCP head-of-line blocking** between streams, faster setup (1-RTT, 0-RTT on resume), connection migration (Wi-Fi → mobile).
- Measured in Chrome (local TLS, 60 images with 40 ms server delay each): **HTTP/1.1 430 ms**, **HTTP/2 58 ms**.
- Old HTTP/1 tricks (domain sharding, sprites, bundling everything) are unnecessary or harmful with HTTP/2+.

::: text 🧒 In simple words
HTTP/1.1 is a **shop with 6 checkout counters** where each counter serves one customer at a time: 60 customers means 10 rounds. HTTP/2 is **one super counter serving everyone in parallel**. HTTP/3 is the same super counter, but if one customer drops their coins (lost packet), the others don't have to wait while they pick them up.
:::

::: text 📖 Detailed answer
| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport | TCP (+TLS) | TCP + TLS (h2) | QUIC over UDP (TLS 1.3 inside) |
| Requests per connection | 1 at a time (pipelining unused) | many concurrent streams | many concurrent streams |
| Connections per origin | ~6 | 1 | 1 |
| Head-of-line blocking | per connection | TCP-level: one lost packet stalls all streams | per stream only |
| Header compression | none | HPACK | QPACK |
| Handshake (new connection) | TCP 1 RTT + TLS 1–2 RTT | same | 1 RTT (0-RTT on resumption) |
| Network switch | reconnect | reconnect | connection migration |

### Measured (Chrome, local TLS server, 60 images, each delayed 40 ms by the server)
| Protocol (`nextHopProtocol`) | Page load |
|---|---|
| `http/1.1` | 430 ms (≈ 60 / 6 connections × 40 ms + overhead) |
| `h2` | 58 ms (all requests in flight at once) |

### What it means for frontends
- Don't shard domains or inline everything for HTTP/1 reasons; more origins = more connections and handshakes.
- Still bundle sensibly (code splitting is fine), use `preconnect` for critical third-party origins.
- HTTP/3 benefits most on lossy mobile networks; enable it at the CDN (Cloudflare, Fastly, CloudFront support it); browsers discover it via the `Alt-Svc` header.
:::

::: diagram Many requests over HTTP/1.1 vs HTTP/2
flowchart LR
  subgraph H1["HTTP/1.1: 6 connections, 1 request each at a time"]
    A1["conn 1: img1, img7, img13..."]
    A2["conn 2: img2, img8, img14..."]
    A6["conn 6: img6, img12, img18..."]
  end
  subgraph H2["HTTP/2: 1 connection, 60 streams at once"]
    S["stream 1 ... stream 60 interleaved"]
  end
:::

::: image HTTP/1.1 vs HTTP/2 vs HTTP/3 (measured)
/images/javascript/http-versions.svg
:::

::: chart bar Measured in Chrome: loading 60 images with 40 ms server delay each (ms)
Protocol,Page load (ms)
HTTP/1.1,430
HTTP/2,58
:::

::: text 🪜 Step by step
Why 60 small images take ~430 ms on HTTP/1.1:
1. The browser opens up to 6 TCP+TLS connections to the origin.
2. Each connection carries one request at a time; each response takes 40 ms on the server.
3. 60 requests / 6 connections = 10 rounds × 40 ms ≈ 400 ms (+ handshakes) → 430 ms measured.
4. HTTP/2: one connection, all 60 requests sent immediately as streams; responses come back interleaved after ~40 ms → 58 ms measured.
5. With packet loss, HTTP/2's single TCP connection stalls all streams; HTTP/3 (QUIC) only stalls the affected stream.
:::

::: code javascript server.js: serving HTTP/2 with Node (and checking the protocol in the page)
const http2 = require('node:http2');
const fs = require('node:fs');

// browsers only speak HTTP/2 over TLS ("h2"); use a real certificate in production (a CDN usually does this)
const server = http2.createSecureServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  allowHTTP1: true,                         // fall back for old clients
});

server.on('stream', (stream, headers) => {
  if (headers[':path'] === '/') {
    stream.respond({ ':status': 200, 'content-type': 'text/html' });
    stream.end(`<!doctype html><script>
      addEventListener('load', () => console.log(performance.getEntriesByType('navigation')[0].nextHopProtocol));  // "h2"
    </script>${Array.from({ length: 60 }, (_, i) => `<img src="/img/${i}.png">`).join('')}`);
    return;
  }
  stream.respond({ ':status': 200, 'content-type': 'image/png' });
  stream.end(fs.readFileSync('pixel.png'));
});

server.listen(8443, () => console.log('https://localhost:8443'));
:::

::: code javascript Simulating requests over 6 connections vs one multiplexed connection (runnable)
function http1Time(requests, serverMs, connections = 6) {
  const free = Array(connections).fill(0);                 // when each connection is free
  for (let i = 0; i < requests; i++) {
    free.sort((a, b) => a - b);
    free[0] += serverMs;                                    // next request waits for a free connection
  }
  return Math.max(...free);
}
const http2Time = (requests, serverMs) => serverMs;         // all streams in flight together (ignoring bandwidth)
const h1 = http1Time(60, 40), h2 = http2Time(60, 40);
console.log({ http1: h1, http2: h2 });
console.log('HTTP/1.1: 60 requests / 6 connections = 10 rounds of 40 ms (measured 430 ms)', h1 === 400 ? '✅' : '❌ FAIL');
console.log('HTTP/2: one round (measured 58 ms)', h2 === 40 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Domain sharding and image sprites "for performance" on HTTP/2.
- Saying HTTP/2 needs no bundling at all (thousands of tiny modules still cost per-request overhead).
- Confusing HTTP/2 server push (deprecated, removed from Chrome) with preload.
- Assuming HTTP/3 always wins (it shines on lossy/mobile networks; UDP can be blocked by some networks, so browsers fall back).
:::

::: understand
- HTTP/2 multiplexes over one TCP connection; HTTP/3 moves to QUIC to remove TCP's head-of-line blocking.
:::

::: ask
- *"Does our CDN serve HTTP/2 and HTTP/3?"* Check `nextHopProtocol` in the Network panel's Protocol column.
:::

::: important ⭐ Say this in the interview
"HTTP/1.1 handles one request at a time per TCP connection, so browsers open about six connections per origin and many small files queue up. HTTP/2 multiplexes many streams over a single TLS connection with header compression; in my test, sixty images with a 40 millisecond server delay took 430 milliseconds over HTTP/1.1 and 58 over HTTP/2. HTTP/3 runs HTTP over QUIC on UDP, with TLS 1.3 built in, faster setup and no head-of-line blocking between streams when packets are lost, plus connection migration, which helps mobile users. So I avoid HTTP/1-era hacks like domain sharding and enable HTTP/2 and 3 at the CDN."
:::

::: links
web.dev: Introduction to HTTP/2 | https://web.dev/articles/performance-http2
MDN: Evolution of HTTP | https://developer.mozilla.org/en-US/docs/Web/HTTP/Evolution_of_HTTP
Cloudflare: HTTP/3 explained | https://www.cloudflare.com/learning/performance/what-is-http3/
:::

=== Cookies vs localStorage vs sessionStorage vs IndexedDB
@p 3
@tags browser, storage, cookies, localstorage, indexeddb, security
@quick
- **Cookies** (~4 KB): sent with **every request** to their domain; can be **HttpOnly** (JS can't read), **Secure**, **SameSite**. Use for session ids.
- **localStorage** (~5 MB, measured **5.2 million characters** in Chrome 154): strings only, **synchronous**, persists until cleared, per origin.
- **sessionStorage**: same API, but **per tab** and cleared when the tab closes.
- **IndexedDB**: large structured data (objects, blobs, indexes), **asynchronous**, transactions; for offline apps. Measured 1,000 writes+reads: localStorage **2.6 ms** (blocks), IndexedDB **24.2 ms** (doesn't block).
- Never store auth tokens in localStorage if you can avoid it: any XSS script can read it. Prefer HttpOnly cookies.

::: text 🧒 In simple words
**Cookies** are a **wristband** the venue checks at every door (sent with every request). **localStorage** is your **locker** at the gym: it's still there tomorrow. **sessionStorage** is a **tray** at the food court: gone when you leave your table (tab). **IndexedDB** is a **storage unit** for big things, organised with shelves (indexes).
:::

::: text 📖 Detailed answer
| | Cookies | localStorage | sessionStorage | IndexedDB |
|---|---|---|---|---|
| Capacity | ~4 KB per cookie | ~5 MB per origin | ~5 MB per origin per tab | large (a share of free disk) |
| Lifetime | `Expires`/`Max-Age`, or the session | until cleared | until the tab closes | until cleared (or evicted) |
| Sent to the server | ✅ every matching request | ❌ | ❌ | ❌ |
| API | headers / `document.cookie` | sync, strings | sync, strings | async, structured clone, indexes, transactions |
| Readable by JS | ❌ if `HttpOnly` | ✅ | ✅ | ✅ |
| Shared between tabs | ✅ | ✅ (with a `storage` event) | ❌ | ✅ |
| Works in workers | ❌ | ❌ | ❌ | ✅ |

### Cookie attributes worth knowing
- `HttpOnly`: invisible to JS (protects session cookies from XSS).
- `Secure`: HTTPS only. `SameSite=Lax/Strict/None`: controls cross-site sending (CSRF defence; `None` requires `Secure`).
- `Domain`/`Path`: scope; `Max-Age`: lifetime. Prefix `__Host-` for the strictest scoping.

### Where to keep auth
- **Session id or refresh token** → HttpOnly, Secure, SameSite cookie.
- **Access token** → memory (a variable) and refreshed via the cookie; avoid localStorage (readable by any injected script).
- See the REST & Auth section: "Where should JWTs be stored?".

### Other storage
**Cache API** (with service workers) for offline responses; **OPFS** (origin private file system) for fast file access; `navigator.storage.persist()` to ask the browser not to evict.
:::

::: diagram Choosing storage
flowchart TD
  Q{"Does the server need it on every request?"} -->|"yes"| C["Cookie (HttpOnly, Secure, SameSite)"]
  Q -->|"no"| S{"Large or structured data, or offline?"}
  S -->|"yes"| I["IndexedDB (or Cache API for responses)"]
  S -->|"no"| T{"Only for this tab?"}
  T -->|"yes"| SS["sessionStorage"]
  T -->|"no"| LS["localStorage (non-sensitive)"]
:::

::: image Browser storage compared
/images/javascript/storage.svg
:::

::: chart bar Measured in Chrome 154: 1,000 writes then 1,000 reads (ms)
Storage,Time (ms)
localStorage (sync: blocks the thread),2.6
IndexedDB (async: one transaction each way),24.2
:::

::: text 🪜 Step by step
Persisting a draft form safely:
1. On every change (debounced), `localStorage.setItem('draft:post', JSON.stringify(values))`.
2. Wrap in `try/catch`: Safari private mode or a full quota throws `QuotaExceededError`.
3. On load, `JSON.parse(localStorage.getItem('draft:post') ?? 'null')` inside `try/catch` (corrupted data).
4. Listen to `window.addEventListener('storage', …)` to sync other open tabs.
5. Clear it after a successful submit. Don't put secrets in it.
:::

::: code javascript Browser demo: a safe storage wrapper with expiry (runnable, uses an in-memory Storage fallback)
// The same interface as window.localStorage, so the wrapper works in the browser and here.
class MemoryStorage {
  #data = new Map();
  #limit;
  constructor(limitChars = 5_000_000) { this.#limit = limitChars; }
  get length() { return this.#data.size; }
  getItem(k) { return this.#data.has(k) ? this.#data.get(k) : null; }
  setItem(k, v) {
    const value = String(v);
    const used = [...this.#data].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
    if (used + k.length + value.length > this.#limit) { const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e; }
    this.#data.set(k, value);
  }
  removeItem(k) { this.#data.delete(k); }
  clear() { this.#data.clear(); }
}

function createStore(storage, prefix = 'app:') {
  return {
    set(key, value, { ttlMs } = {}) {
      const record = { v: value, exp: ttlMs ? Date.now() + ttlMs : null };
      try { storage.setItem(prefix + key, JSON.stringify(record)); return true; }
      catch (e) { if (e.name === 'QuotaExceededError') return false; throw e; }
    },
    get(key, fallback = null) {
      try {
        const raw = storage.getItem(prefix + key);
        if (raw === null) return fallback;
        const { v, exp } = JSON.parse(raw);
        if (exp && Date.now() > exp) { storage.removeItem(prefix + key); return fallback; }
        return v;
      } catch { return fallback; }                        // corrupted JSON → fallback
    },
    remove(key) { storage.removeItem(prefix + key); },
  };
}

const storage = new MemoryStorage(1000);                  // tiny quota to show the failure path
const store = createStore(storage);
store.set('theme', 'dark');
store.set('draft', { title: 'Hello', tags: ['js'] });
console.log('values survive as JSON', store.get('theme') === 'dark' && store.get('draft').tags[0] === 'js' ? '✅' : '❌ FAIL');
console.log('everything is stored as strings', typeof storage.getItem('app:theme') === 'string' ? '✅' : '❌ FAIL');
store.set('otp', '123456', { ttlMs: -1 });                // already expired
console.log('expired values are removed', store.get('otp') === null && storage.getItem('app:otp') === null ? '✅' : '❌ FAIL');
storage.setItem('app:broken', '{not json');
console.log('corrupted JSON falls back safely', store.get('broken', 'default') === 'default' ? '✅' : '❌ FAIL');
console.log('quota errors are handled', store.set('big', 'x'.repeat(2000)) === false ? '✅' : '❌ FAIL');

// Cookie string parsing (what document.cookie gives you)
const parseCookies = (s) => Object.fromEntries(s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => { const i = p.indexOf('='); return [decodeURIComponent(p.slice(0, i)), decodeURIComponent(p.slice(i + 1))]; }));
const cookies = parseCookies('theme=dark; lang=en-IN; cart=%7B%22n%22%3A2%7D');
console.log('cookie parsing', cookies.lang === 'en-IN' && JSON.parse(cookies.cart).n === 2 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing JWTs/secrets in localStorage (XSS can steal them).
- Storing objects without `JSON.stringify` (you get `"[object Object]"`).
- Big or frequent localStorage writes on the main thread (it's synchronous).
- Forgetting `try/catch` for quota and private-mode errors.
- Large cookies (sent with every request, including images and API calls).
:::

::: understand
- Cookies travel to the server; Web Storage is small, sync and JS-only; IndexedDB is big, async and structured.
:::

::: ask
- *"Is the data sensitive, large, per-tab, or needed by the server?"* Each answer picks a different store.
:::

::: important ⭐ Say this in the interview
"Cookies are small, about 4 KB, and sent with every request to their domain; with HttpOnly, Secure and SameSite they're the right place for a session id. localStorage and sessionStorage hold around 5 MB of strings per origin, I measured about 5.2 million characters in Chrome, through a synchronous API; localStorage persists, sessionStorage is per tab. IndexedDB is asynchronous and stores large structured data with indexes, for offline apps. Anything in Web Storage is readable by any script on the page, so I don't keep tokens there."
:::

::: links
MDN: Web Storage API | https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
MDN: Using HTTP cookies | https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
MDN: IndexedDB API | https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
:::

=== What is requestAnimationFrame and when should you use it?
@p 2
@tags browser, animation, raf, performance
@quick
- `requestAnimationFrame(cb)` runs `cb` **right before the next repaint**, once per frame (every **16.7 ms** at 60 Hz; measured 16.5 to 16.8 ms in Chrome 154).
- The callback gets a high-resolution **timestamp**: move things by **elapsed time**, not by "1 px per call" (works on 60/120/144 Hz screens).
- **Paused in background tabs** (saves CPU and battery); cancel with `cancelAnimationFrame(id)`.
- Better than `setTimeout(fn, 16)`: synced with the display, no drift, no wasted frames.
- Use it for visual updates (animations, scroll-linked effects, batching DOM writes); prefer CSS transitions/animations when they're enough.

::: text 🧒 In simple words
A screen refreshes like a **flip book** turning 60 pages a second. `requestAnimationFrame` says "**call me just before you draw the next page**", so your drawing is always ready on time. `setTimeout(16)` is like guessing the timing with your own stopwatch: sometimes you're late and a page is skipped.
:::

::: text 📖 Detailed answer
### Where it runs
In each event-loop turn where the browser decides to render: **rAF callbacks → style → layout → paint**. So changes made inside rAF land in the very next frame.

### rAF vs timers
| | `requestAnimationFrame` | `setTimeout`/`setInterval` |
|---|---|---|
| Timing | aligned to the display refresh | approximate, clamped (≥4 ms nested), delayed by long tasks |
| Background tab | paused | throttled (about 1 per second or less) |
| High refresh screens | adapts (120 Hz → 8.3 ms) | doesn't |
| Use for | visual updates | non-visual scheduling |

### The frame budget
At 60 Hz each frame has **16.7 ms** for JS + style + layout + paint. Keep rAF work small (a few ms). Heavy work: split it, or use a Web Worker / `OffscreenCanvas`.

### Patterns
- **Time-based animation**: `x = start + speed * (now - t0)`.
- **Throttling scroll/resize handlers** to one update per frame (`ticking` flag).
- **Read in rAF, write in rAF** to avoid layout thrashing; or read now, write in rAF.
- **Two rAFs** (`rAF(() => rAF(fn))`) to run after the next paint, e.g., to trigger a CSS transition from an initial state.
:::

::: diagram A frame
flowchart LR
  I["input events"] --> J["JS tasks and microtasks"]
  J --> RAF["rAF callbacks"]
  RAF --> S["style"]
  S --> L["layout"]
  L --> P["paint + composite"]
  P --> N["next frame in about 16.7 ms"]
:::

::: image requestAnimationFrame vs setTimeout
/images/javascript/raf.svg
:::

::: chart line Measured: interval between rAF callbacks in Chrome 154 (ms)
Frame,Interval (ms)
1,16.6
2,16.7
3,16.6
4,16.7
5,16.7
6,16.7
7,16.7
8,16.5
9,16.8
10,16.6
:::

::: text 🪜 Step by step
Moving a box 300 px in 1 second, time-based:
1. `const start = performance.now()` and request the first frame.
2. In the callback: `const p = Math.min((now - start) / 1000, 1)`.
3. `box.style.transform = translateX(${300 * ease(p)}px)` (compositor-only property).
4. If `p < 1`, request the next frame; otherwise stop.
5. On a 120 Hz screen it simply runs 120 smoother steps; on a slow device it skips frames but still ends at 300 px after 1 s.
:::

::: code javascript Browser demo: a time-based animation engine (runnable, with a fake clock)
// The engine takes the scheduler as a parameter, so it runs with requestAnimationFrame in the browser
// and with a simulated 60 Hz clock here.
function animate({ duration, from, to, ease = (t) => t, onUpdate, schedule }) {
  return new Promise((resolve) => {
    let start = null;
    function frame(now) {
      if (start === null) start = now;
      const p = Math.min((now - start) / duration, 1);       // progress by TIME, not by call count
      onUpdate(from + (to - from) * ease(p));
      if (p < 1) schedule(frame); else resolve();
    }
    schedule(frame);
  });
}
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Fake display: calls the callback every 1000/hz ms of simulated time
function makeDisplay(hz, droppedEvery = 0) {
  let now = 0, frames = 0, queue = [];
  return {
    schedule: (cb) => queue.push(cb),
    run() {
      while (queue.length) {
        now += 1000 / hz;
        if (droppedEvery && ++frames % droppedEvery === 0) now += 1000 / hz;   // a janky frame
        const cbs = queue; queue = [];
        cbs.forEach((cb) => cb(now));
      }
      return now;
    },
  };
}

async function demo(hz, dropped) {
  const values = [];
  const display = makeDisplay(hz, dropped);
  const done = animate({ duration: 1000, from: 0, to: 300, ease: easeOutCubic, onUpdate: (x) => values.push(x), schedule: display.schedule });
  const endedAt = display.run();
  await done;
  return { frames: values.length, final: values.at(-1), endedAt: Math.round(endedAt) };
}

Promise.all([demo(60), demo(120), demo(60, 3)]).then(([hz60, hz120, janky]) => {
  console.log({ hz60, hz120, janky });
  console.log('60 Hz: about 60 frames', hz60.frames >= 60 && hz60.frames <= 62 ? '✅' : '❌ FAIL');
  console.log('120 Hz: twice the frames, same duration', hz120.frames >= 120 && Math.abs(hz120.endedAt - hz60.endedAt) <= 34 ? '✅' : '❌ FAIL');
  console.log('dropped frames still end at the right place and time', janky.final === 300 && janky.frames < hz60.frames ? '✅' : '❌ FAIL');
  console.log('every run ends exactly at the target', hz60.final === 300 && hz120.final === 300 ? '✅' : '❌ FAIL');
});

// In the browser: animate({ duration: 1000, from: 0, to: 300, ease: easeOutCubic,
//   onUpdate: (x) => { box.style.transform = `translateX(${x}px)`; }, schedule: requestAnimationFrame });
:::

::: warning ⚠️ Common mistakes
- Moving by a fixed amount per callback (faster on 120 Hz screens, slower on janky devices).
- Animating `left/top/width` instead of `transform`.
- Heavy work inside rAF (blows the 16.7 ms budget).
- Forgetting `cancelAnimationFrame` on unmount (React effects).
- Using rAF for non-visual polling.
:::

::: understand
- rAF = "run before the next paint"; animate by elapsed time; prefer CSS when possible.
:::

::: ask
- *"Can CSS transitions/animations do this?"* They run off the main thread when animating transform/opacity.
:::

::: important ⭐ Say this in the interview
"requestAnimationFrame schedules a callback right before the browser's next repaint, so it runs once per frame, every 16.7 milliseconds on a 60 hertz display; I measured 16.5 to 16.8 in Chrome. It's synced to the display, paused in background tabs and gives a timestamp, so I compute positions from elapsed time, which works on any refresh rate. I use it for JS-driven animations and to batch DOM writes or throttle scroll handlers to one update per frame, animating transform and opacity and cancelling it on cleanup."
:::

::: links
MDN: requestAnimationFrame | https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
web.dev: Rendering performance | https://web.dev/articles/rendering-performance
:::

=== Event bubbling, capturing and event delegation
@p 3
@tags browser, dom, events, delegation
@quick
- A DOM event travels in 3 phases: **capture** (window → target), **target**, **bubble** (target → window). Listeners run in the bubble phase by default; `{ capture: true }` for capture.
- `event.target` = the element that was actually clicked; `event.currentTarget` = the element the listener is on.
- `stopPropagation()` stops the travel; `preventDefault()` stops the browser default (link navigation, form submit). They're different.
- **Event delegation**: one listener on a parent handles events from many children via `event.target.closest(selector)`; works for elements added later.
- Some events don't bubble (`focus`, `blur`, `mouseenter`); use `focusin`/`focusout`. React attaches listeners at the root (delegation) too.

::: text 🧒 In simple words
Dropping a stone in a well: the **sound goes down** to the water (capture), **splashes** (target), and the **echo comes back up** (bubble). Delegation is putting **one receptionist at the building entrance** instead of one in every office: every visitor passes the entrance anyway, and new offices are covered automatically.
:::

::: text 📖 Detailed answer
### The three phases
1. **Capture**: from `window` down through each ancestor to the target's parent. Listeners added with `{ capture: true }` run here.
2. **Target**: listeners on the target itself.
3. **Bubble**: back up through the ancestors to `window`. Normal listeners run here.

### Useful listener options
| Option | Effect |
|---|---|
| `capture: true` | listen in the capture phase |
| `once: true` | auto-remove after the first call |
| `passive: true` | promises not to call `preventDefault` → smoother scroll/touch |
| `signal` | remove with an `AbortController` (great for cleanup) |

### Event delegation
Instead of 1,000 listeners on 1,000 buttons, put one on the list:
`list.addEventListener('click', (e) => { const btn = e.target.closest('button[data-id]'); if (!btn || !list.contains(btn)) return; remove(btn.dataset.id); })`

Benefits: works for items added later, one place for logic, less setup and memory for very large lists. (Measured in Chrome 154: attaching 10,000 individual listeners took 0.7 ms, so the main win is simplicity and dynamic content, not raw setup time.)

### stopPropagation vs preventDefault
- `stopPropagation()` → ancestors don't hear it (can break delegated handlers and analytics; use sparingly).
- `stopImmediatePropagation()` → also other listeners on the same element.
- `preventDefault()` → no navigation/submit/checkbox toggle, but it still bubbles.
:::

::: diagram The path of a click
flowchart TD
  W["window"] -->|"capture"| D["document"]
  D -->|"capture"| U["ul (delegated listener)"]
  U -->|"capture"| B["button: target phase"]
  B -.->|"bubble"| U2["ul: handler runs, uses event.target"]
  U2 -.->|"bubble"| D2["document"]
  D2 -.->|"bubble"| W2["window"]
:::

::: image Event capturing, target and bubbling
/images/javascript/event-phases.svg
:::

::: text 🪜 Step by step
Clicking a `<button>` inside `<li>` inside `<ul id="list">` with a delegated click listener on the list:
1. Capture: window → document → … → ul → li (capture listeners only).
2. Target: listeners on the button run.
3. Bubble: li → **ul**: the delegated handler runs. `e.currentTarget` is the ul, `e.target` is the button (or an icon inside it).
4. `e.target.closest('button')` finds the button even if the user clicked the icon inside it.
5. The handler reads `button.dataset.id` and acts; buttons added later work too.
:::

::: code javascript Browser demo: an event-propagation simulator (runnable)
// A tiny model of DOM event dispatch: capture down, target, bubble up.
class Node {
  constructor(name, parent = null) { this.name = name; this.parent = parent; this.listeners = []; this.dataset = {}; }
  addEventListener(type, fn, opts = {}) { this.listeners.push({ type, fn, capture: !!opts.capture }); }
  closest(pred) { for (let n = this; n; n = n.parent) if (pred(n)) return n; return null; }
}
function dispatch(target, type) {
  const path = [];
  for (let n = target; n; n = n.parent) path.unshift(n);           // window … target
  const event = { type, target, stopped: false, stopPropagation() { this.stopped = true; } };
  const run = (node, phase) => node.listeners.filter((l) => l.type === type && (phase === 'target' || l.capture === (phase === 'capture')))
    .forEach((l) => { if (!event.stopped) l.fn({ ...event, currentTarget: node, phase, stopPropagation: () => { event.stopped = true; } }); });
  for (const n of path.slice(0, -1)) { if (event.stopped) break; run(n, 'capture'); }
  if (!event.stopped) run(target, 'target');
  for (const n of path.slice(0, -1).reverse()) { if (event.stopped) break; run(n, 'bubble'); }
}

const win = new Node('window'), ul = new Node('ul', win), li = new Node('li', ul), button = new Node('button', li), icon = new Node('svg-icon', button);
button.dataset.id = '42';

const log = [];
win.addEventListener('click', (e) => log.push(`window ${e.phase}`), { capture: true });
ul.addEventListener('click', (e) => log.push(`ul ${e.phase}`), { capture: true });
ul.addEventListener('click', (e) => {                                 // delegated handler
  const btn = e.target.closest((n) => n.name === 'button');
  log.push(`ul ${e.phase}: delegated → button ${btn?.dataset.id} (target ${e.target.name}, currentTarget ${e.currentTarget.name})`);
});
win.addEventListener('click', (e) => log.push(`window ${e.phase}`));

dispatch(icon, 'click');
console.log(log.join('\n'));
console.log('capture runs top-down before bubble runs bottom-up', log[0] === 'window capture' && log[1] === 'ul capture' && log.at(-1) === 'window bubble' ? '✅' : '❌ FAIL');
console.log('delegation finds the button from the inner icon', log[2].includes('button 42') && log[2].includes('target svg-icon') && log[2].includes('currentTarget ul') ? '✅' : '❌ FAIL');

// New elements are handled without new listeners
const newBtn = new Node('button', new Node('li', ul)); newBtn.dataset.id = '99';
log.length = 0; dispatch(newBtn, 'click');
console.log('works for elements added later', log.some((l) => l.includes('button 99')) ? '✅' : '❌ FAIL');

// stopPropagation on the target stops the bubble
button.addEventListener('click', (e) => e.stopPropagation());
log.length = 0; dispatch(button, 'click');
console.log('stopPropagation stops bubbling', !log.some((l) => l.includes('bubble')) ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `e.target` when you meant `e.currentTarget` (clicks on child icons/spans).
- Calling `stopPropagation()` "to be safe" and breaking delegated listeners elsewhere.
- Confusing `preventDefault` with `stopPropagation`.
- Delegating events that don't bubble (`focus`, `mouseenter`).
- Adding listeners in loops without removing them (leaks).
:::

::: understand
- Capture down, target, bubble up; delegation uses the bubble phase and `closest()`.
:::

::: ask
- *"Are items added dynamically?"* Delegation handles them for free.
:::

::: important ⭐ Say this in the interview
"A DOM event goes through three phases: capture from the window down to the target, the target phase, and bubbling back up. Listeners run in the bubble phase unless I pass capture: true. event.target is the element actually clicked, currentTarget is the element whose listener is running. Event delegation uses bubbling: one listener on a parent finds the relevant child with event.target.closest, which handles elements added later and keeps logic in one place. stopPropagation stops the travel, preventDefault cancels the browser's default action; they're independent."
:::

::: links
MDN: Event bubbling | https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Event_bubbling
MDN: addEventListener options | https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
:::

=== How do you find a memory leak with heap snapshots?
@p 2
@tags browser, memory, devtools, heap-snapshot, performance
@quick
- A **heap snapshot** is a picture of every object in the JS heap, with sizes and references (Chrome DevTools → Memory).
- Workflow: **baseline** → repeat the suspect action (open/close a modal 5 to 10 times) → **force GC** → second snapshot → **Comparison** view.
- Look at **# Delta** (objects added and not freed) and **Retained size**; filter by `Detached` for removed DOM nodes still held by JS.
- The **Retainers** panel shows the path from a GC root to the object: that path is the bug (a listener, a cache, a closure, a global).
- **Shallow size** = the object itself; **retained size** = memory freed if this object were collected.

::: text 🧒 In simple words
A heap snapshot is like **photographing your storeroom**. Take a photo, use the app for a while, clean up, and take another photo. Whatever is **still there but shouldn't be** is the leak, and the "retainers" tell you **who is still holding a string tied to it**.
:::

::: text 📖 Detailed answer
### Snapshot columns
| Column | Meaning |
|---|---|
| Constructor | group by class/type (`Array`, `HTMLDivElement`, `(closure)`, your classes) |
| Distance | number of hops from a GC root (bigger = deeper) |
| Shallow size | memory of the object itself |
| Retained size | memory that would be freed with it (includes what only it references) |
| # New / # Deleted / # Delta | in Comparison view: objects created/freed between snapshots |

### The workflow
1. Open DevTools → **Memory** → *Heap snapshot*. Take a **baseline** after the page settles.
2. Do the action you suspect several times (navigate to a route and back, open/close a dialog).
3. Click the **trash icon** (collect garbage), take a **second snapshot**.
4. Switch to **Comparison** with the baseline; sort by **# Delta** or **Size Delta**.
5. Pick a suspicious entry (e.g., 10 extra `Modal` objects or `Detached HTMLDivElement`) → **Retainers**: read the path from the bottom (a root like `Window` / `system / Context`) to the object.
6. Fix the reference, repeat, and confirm the delta is gone.

### Other tools
- **Allocation instrumentation on timeline**: blue bars that stay = allocations never freed.
- **Performance monitor**: watch JS heap size and DOM node count over time.
- `performance.measureUserAgentSpecificMemory()` for field measurements (cross-origin isolated pages).

### Typical retainer paths and fixes
| Retainer path | Fix |
|---|---|
| `Window → listeners → (closure) → component data` | remove the listener in cleanup / use `AbortController` |
| `Map → entry → DOM node` | WeakMap or delete the entry |
| `setInterval → (closure)` | `clearInterval` |
| `module variable → array of old items` | bound or clear the cache |
:::

::: diagram Leak hunting loop
flowchart LR
  B["Baseline snapshot"] --> A["Repeat the action 5 to 10 times"]
  A --> G["Collect garbage"]
  G --> S["Second snapshot"]
  S --> C["Comparison: count delta, size delta"]
  C --> R["Retainers: path from a GC root"]
  R --> F["Fix the reference"]
  F --> B
:::

::: image Finding a memory leak with heap snapshots
/images/javascript/heap-snapshot.svg
:::

::: image What keeps memory alive (measured)
/images/javascript/memory-retention.svg
:::

::: text 🪜 Step by step
Opening and closing a chat panel 10 times grows memory:
1. Comparison shows **+10 `Detached HTMLDivElement`** and +10 `ChatPanel` objects.
2. Retainers of one detached div: `Window → resize listener → (closure) → panel → div`.
3. The panel added `window.addEventListener('resize', this.onResize)` on open and never removed it.
4. Fix: create an `AbortController` on open, pass `{ signal }`, call `controller.abort()` on close.
5. Re-measure: # Delta returns to 0 after GC.
:::

::: code javascript Leak and fix: listeners and detached nodes (runs in a browser page)
// ❌ Leaky: every open adds a window listener that keeps the panel (and its DOM) alive
class LeakyPanel {
  open() {
    this.el = document.createElement('div');
    this.el.textContent = 'Chat';
    this.onResize = () => { this.el.style.width = `${window.innerWidth / 3}px`; };
    window.addEventListener('resize', this.onResize);
    document.body.append(this.el);
  }
  close() { this.el.remove(); }                         // removed from the page, still referenced → detached
}

// ✅ Fixed: one AbortController removes every listener on close, and references are dropped
class Panel {
  open() {
    this.controller = new AbortController();
    this.el = document.createElement('div');
    this.el.textContent = 'Chat';
    window.addEventListener('resize', () => { this.el.style.width = `${window.innerWidth / 3}px`; }, { signal: this.controller.signal });
    document.body.append(this.el);
  }
  close() {
    this.controller.abort();                            // removes the listener
    this.el.remove();
    this.el = null;                                     // no detached node kept by this object
  }
}

// Reproduce in DevTools: take a snapshot, run this, collect garbage, take another, compare.
for (let i = 0; i < 10; i++) { const p = new LeakyPanel(); p.open(); p.close(); }
for (let i = 0; i < 10; i++) { const p = new Panel(); p.open(); p.close(); }
console.log('Now filter the heap snapshot by "Detached": only the LeakyPanel divs remain.');
:::

::: warning ⚠️ Common mistakes
- Taking only one snapshot (you need a comparison).
- Not forcing GC before the second snapshot (garbage looks like a leak).
- Chasing big shallow sizes instead of retained sizes and deltas.
- Testing in a dev build with extensions running (use an incognito window, production build).
:::

::: understand
- Leaks = unexpected retainers. Snapshots + comparison + retainers show who holds the memory.
:::

::: ask
- *"Does memory grow after repeating the same action and then going idle?"* That's a leak; a one-time growth is often a cache.
:::

::: important ⭐ Say this in the interview
"I take a baseline heap snapshot, repeat the suspect action several times, force garbage collection, take a second snapshot and use the Comparison view sorted by delta. Objects that keep increasing, often detached DOM nodes or component instances, are candidates. The Retainers panel then shows the reference path from a GC root, typically a window listener, an interval, a cache or a closure, and that path is the bug. After fixing it, for example with an AbortController for listeners, I repeat the measurement to confirm the delta is zero."
:::

::: links
Chrome DevTools: Record heap snapshots | https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots
Chrome DevTools: Fix memory problems | https://developer.chrome.com/docs/devtools/memory-problems
:::

=== What are Web Vitals (LCP, INP, CLS) and how do you improve them?
@p 3
@tags browser, performance, web-vitals, lcp, inp, cls
@quick
- **LCP** (Largest Contentful Paint, loading): good ≤ **2.5 s**. **INP** (Interaction to Next Paint, responsiveness): good ≤ **200 ms**. **CLS** (Cumulative Layout Shift, stability): good ≤ **0.1**.
- These three are the **Core Web Vitals**, judged at the **75th percentile** of real users (field data). Supporting metrics: **FCP** (≤ 1.8 s), **TTFB** (≤ 0.8 s).
- LCP: fast server/CDN, preload + `fetchpriority="high"` for the hero image, no render-blocking resources, compressed images.
- INP: break up long tasks (> 50 ms), less JS, yield to the main thread, avoid layout thrashing, debounce expensive handlers.
- CLS: set `width`/`height` (or `aspect-ratio`) on images/embeds, reserve space for ads/banners, `font-display` + matched fallback fonts.

::: text 🧒 In simple words
Web Vitals are a **restaurant review**: **LCP** = how fast the main dish arrives, **INP** = how quickly the waiter reacts when you raise your hand, **CLS** = whether the table keeps **moving** while you're trying to eat.
:::

::: text 📖 Detailed answer
| Metric | Measures | Good | Poor | Main causes when bad |
|---|---|---|---|---|
| **LCP** | when the largest image/text block renders | ≤ 2.5 s | > 4 s | slow TTFB, render-blocking CSS/JS, late or huge hero image, client-side rendering |
| **INP** | slowest-ish interaction latency (input → next paint) | ≤ 200 ms | > 500 ms | long tasks, heavy handlers, big re-renders, layout thrashing |
| **CLS** | sum of unexpected layout shifts | ≤ 0.1 | > 0.25 | images without size, injected banners/ads, web-font swaps |
| FCP | first text/image painted | ≤ 1.8 s | > 3 s | TTFB, blocking resources |
| TTFB | time to the first byte of the response | ≤ 0.8 s | > 1.8 s | server, redirects, no CDN |

INP replaced FID (First Input Delay) in March 2024: it measures **all** interactions (input delay + processing + presentation), not only the first one's delay.

### Lab vs field
- **Lab** (Lighthouse, DevTools): reproducible, good for debugging, simulated device/network; can't measure real INP.
- **Field** (CrUX, the `web-vitals` library, RUM): real users, 75th percentile; this is what counts for search ranking.

### Fixes that move the numbers
- **LCP**: SSR/SSG the main content, CDN, `preload` + `fetchpriority="high"` for the LCP image, don't lazy-load it, AVIF/WebP with responsive `srcset`, inline critical CSS, `defer` scripts.
- **INP**: split long tasks (`await scheduler.yield()` or `setTimeout` chunks), move work to Web Workers, `useTransition`/`useDeferredValue` in React, virtualise long lists, avoid forced layouts.
- **CLS**: `width`/`height` or `aspect-ratio` for media, `min-height` placeholders for dynamic content, transforms for animations, `size-adjust` on fallback fonts.
:::

::: diagram Which part of the page lifecycle each metric covers
flowchart LR
  N["navigation"] --> T["TTFB: first byte"]
  T --> F["FCP: first content"]
  F --> L["LCP: main content"]
  L --> I["INP: every interaction until the user leaves"]
  F -.-> C["CLS: shifts during the whole visit"]
:::

::: image Web Vitals and their thresholds
/images/javascript/web-vitals.svg
:::

::: image The critical rendering path (what drives FCP and LCP)
/images/javascript/crp.svg
:::

::: text 🪜 Step by step
Fixing a product page with LCP 4.2 s, CLS 0.31, INP 380 ms:
1. **LCP**: the hero image was lazy-loaded and discovered by JS → render it in HTML, remove `loading="lazy"`, add `fetchpriority="high"` and a preload, serve AVIF from the CDN → 2.1 s.
2. **CLS**: the image had no dimensions and a cookie banner pushed content down → add `width`/`height`, overlay the banner instead of inserting it above content → 0.04.
3. **INP**: "Add to cart" re-rendered the whole page and ran analytics synchronously → memoise, update only the cart badge, send analytics after a `yield` → 140 ms.
4. Verify in the lab (Lighthouse/DevTools), then watch field data (CrUX / RUM) over the next weeks.
5. Add budgets in CI (Lighthouse CI) so regressions are caught.
:::

::: code javascript Browser demo: breaking a long task so interactions stay responsive (runnable)
// 120 ms of work, done as ONE long task vs in chunks of at most 10 ms that yield to the event loop.
// A "click" is scheduled 5 ms after the work starts; we measure how late its handler runs (input delay → INP).
const busy = (ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* work */ } };
const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));   // scheduler.yield() where available
const TOTAL_MS = 120, UNIT_MS = 2;

function scheduleClick() {
  const intended = performance.now() + 5;
  return new Promise((resolve) => setTimeout(() => resolve(Math.round(performance.now() - intended)), 5));
}

async function oneLongTask() {
  const click = scheduleClick();
  busy(TOTAL_MS);                                         // nothing else can run for 120 ms
  return click;
}

async function chunked(budgetMs = 10) {
  const click = scheduleClick();
  let chunkStart = performance.now(), longest = 0;
  for (let done = 0; done < TOTAL_MS; done += UNIT_MS) {
    busy(UNIT_MS);
    if (performance.now() - chunkStart >= budgetMs) {
      longest = Math.max(longest, performance.now() - chunkStart);
      await yieldToMain();                                // the browser can handle input and paint here
      chunkStart = performance.now();
    }
  }
  return { clickDelay: await click, longest: Math.round(longest) };
}

(async () => {
  const blockedDelay = await oneLongTask();
  const { clickDelay, longest } = await chunked(10);
  console.log({ clickDelayWithLongTask: blockedDelay, clickDelayWithChunks: clickDelay, longestChunk: longest });
  console.log('one long task delays the click by most of its duration', blockedDelay >= 80 ? '✅' : '❌ FAIL');
  console.log('chunks keep every task short', longest <= 30 ? '✅' : '❌ FAIL');
  console.log('a click during chunked work is handled quickly (good INP)', clickDelay <= 30 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Optimising a single Lighthouse score instead of field data at p75.
- Lazy-loading the LCP image.
- Images and embeds without dimensions (CLS).
- Huge JS bundles and long tasks hurting INP.
- Still talking about FID (replaced by INP in 2024).
:::

::: understand
- LCP = loading, INP = responsiveness, CLS = stability; measure in the field, debug in the lab.
:::

::: ask
- *"Which metric fails, on which pages, for which devices?"* Fix the worst segment first.
:::

::: important ⭐ Say this in the interview
"The Core Web Vitals are LCP for loading, good under 2.5 seconds; INP for responsiveness, good under 200 milliseconds; and CLS for visual stability, good under 0.1, all measured at the 75th percentile of real users. For LCP I make the hero content arrive early: fast TTFB, server rendering, preload with high fetch priority and optimized images. For INP I break up long tasks, yield to the main thread and reduce JavaScript and re-render work. For CLS I give media explicit dimensions and reserve space for anything injected. I debug in Lighthouse and DevTools, but judge success on field data."
:::

::: links
web.dev: Web Vitals | https://web.dev/articles/vitals
web.dev: Optimize INP | https://web.dev/articles/optimize-inp
web.dev: Optimize LCP | https://web.dev/articles/optimize-lcp
:::

=== How exactly are FCP and LCP measured?
@p 3
@tags browser, web-vitals, fcp, lcp, performance
@quick
- **FCP**: time from navigation to the **first paint of any content** (text, image, non-white canvas/SVG). It doesn't wait for images, PDFs or other downloads.
- **LCP**: the **largest image or text block in the viewport**; the browser emits a new candidate whenever a bigger element paints, and stops at the **first user input or scroll**.
- Measured in Chrome: a page with an `<h1>` and a photo arriving at 800 ms → **FCP 16 ms, LCP = `<h1>` at 16 ms, then the photo at 816 ms**.
- **Low-entropy** images (flat colours, placeholders) are **ignored** for LCP (measured: a flat one-colour SVG never became LCP). Offscreen, `opacity:0` and full-viewport background images don't count either.
- Failures: a **slow** stylesheet delayed FCP to **612 ms**; a **404** stylesheet didn't (28 ms); a 404 or throwing `<script>` didn't stop later HTML from rendering.

::: text 🧒 In simple words
FCP is **when the first thing appears** on the empty canvas. LCP is **when the biggest thing appears**: the browser keeps a "largest so far" record and updates it while the page loads, then stops counting as soon as you start interacting.
:::

::: text 📖 Detailed answer
### FCP
- Starts at navigation start; ends at the first frame that paints DOM content (text, `<img>`, `<svg>`, non-white `<canvas>`).
- Doesn't wait for other resources: a link to a PDF or an image below the fold doesn't matter.
- If the first content **is** an image, FCP waits for that image to decode and paint.

### LCP
| Counts | Doesn't count |
|---|---|
| `<img>`, `<image>` in SVG, `<video>` poster/first frame | elements with `opacity: 0`, offscreen elements |
| background images loaded via `url()` | full-viewport backgrounds and placeholders |
| block-level text elements | **low-entropy images** (< 0.05 bits per pixel) |
| | anything painted after the first input/scroll |
Size = visible area in the viewport (an image's size is also capped by its intrinsic size).

### Measured (Chrome 154, local server)
| Page | FCP | LCP entries |
|---|---|---|
| `<h1>` + 600×340 photo (arrives at 800 ms, shown 900×500) | 16 ms | `H1` at 16 ms → `IMG` at 816 ms (204,000 px²) |
| `<h1>` + flat one-colour SVG (900×500) | 24 ms | only `H1` (image ignored: low entropy) |
| stylesheet takes 600 ms | 612 ms | |
| stylesheet 404 | 28 ms (unstyled) | |
| `<script src>` 404 between two elements | 24 ms; HTML after it rendered | |
| inline script throws | 28 ms; HTML after it rendered | |

### Field vs lab
In the field (`web-vitals` library, CrUX), LCP is reported per page load at the 75th percentile; `onLCP` reports the final candidate when the page is hidden or the user interacts.
:::

::: diagram How LCP is decided
flowchart TD
  P["element painted in the viewport"] --> E{"eligible? (not opacity 0, not low entropy, not full-viewport background)"}
  E -->|"no"| X["ignored"]
  E -->|"yes"| B{"bigger than the current candidate?"}
  B -->|"yes"| N["new LCP entry (time = its render time)"]
  B -->|"no"| X
  I["first click, key press or scroll"] --> F["stop: last candidate is final LCP"]
:::

::: image How FCP and LCP are measured (Chrome measurements)
/images/javascript/fcp-lcp.svg
:::

::: chart bar Measured in Chrome: first contentful paint in different failure cases (ms)
Page,FCP (ms)
normal stylesheet,20
stylesheet 404,28
script 404,24
script throws,28
stylesheet takes 600 ms,612
:::

::: text 🪜 Step by step
The `<h1>` + slow photo page:
1. HTML arrives; the `<h1>` is laid out and painted in the first frame → **FCP = 16 ms** and the first LCP entry (`H1`, 4,071 px²).
2. The `<img>` has `width`/`height`, so its space is reserved (no layout shift) while it downloads.
3. At ~800 ms the photo arrives, decodes and paints → a new LCP entry (`IMG`, 204,000 px²) at **816 ms**.
4. No bigger element appears; when the user scrolls, LCP stops: final LCP = 816 ms.
5. To improve it: preload the hero with `fetchpriority="high"`, serve it faster (CDN, AVIF), don't lazy-load it.
:::

::: code javascript Measuring FCP and LCP in the page (PerformanceObserver)
// paste in DevTools console or ship to your analytics
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint') console.log('FCP', Math.round(entry.startTime), 'ms');
  }
}).observe({ type: 'paint', buffered: true });

new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log('LCP candidate', Math.round(entry.startTime), 'ms', entry.element, `${entry.size} px²`, entry.url || '(text)');
  }
}).observe({ type: 'largest-contentful-paint', buffered: true });

// In production prefer the web-vitals library (handles bfcache, prerender, visibility):
// import { onFCP, onLCP, onINP, onCLS } from 'web-vitals';
// onLCP(({ value, attribution }) => sendToAnalytics({ name: 'LCP', value, element: attribution.target }));
document.addEventListener('click', () => console.log('after this input, LCP stops updating'), { once: true });
:::

::: code javascript The LCP candidate algorithm (runnable)
function lcpEntries(paints, firstInputAt = Infinity) {
  const entries = [];
  let largest = 0;
  for (const p of paints.sort((a, b) => a.at - b.at)) {
    if (p.at >= firstInputAt) break;                       // stops at the first input or scroll
    const eligible = !p.hidden && !(p.kind === 'image' && p.bitsPerPixel < 0.05);
    if (eligible && p.size > largest) { largest = p.size; entries.push(`${p.name}@${p.at}`); }
  }
  return entries;
}
const page = [
  { name: 'H1', kind: 'text', size: 4071, at: 16 },
  { name: 'flat-image', kind: 'image', size: 450000, at: 400, bitsPerPixel: 0.01 },   // low entropy: ignored
  { name: 'photo', kind: 'image', size: 204000, at: 816, bitsPerPixel: 2.9 },
];
console.log(lcpEntries(page).join(' → '));
console.log('text first, then the photo; the flat image is ignored', lcpEntries(page).join() === 'H1@16,photo@816' ? '✅' : '❌ FAIL');
console.log('a scroll at 500 ms freezes LCP at the heading', lcpEntries(page, 500).join() === 'H1@16' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking FCP waits for all images or downloads.
- Optimising a placeholder or background that isn't the real LCP element.
- Lazy-loading the hero image (LCP waits for scroll-time loading logic).
- Assuming a failed stylesheet blocks rendering forever (a slow one blocks; a failed one releases).
- Reading LCP from a single Lighthouse run instead of field data.
:::

::: understand
- FCP = first pixels of content; LCP = the largest eligible element, updated until interaction.
:::

::: ask
- *"Which element is LCP on our key pages, and what delays it?"* DevTools' Performance panel shows it.
:::

::: important ⭐ Say this in the interview
"FCP is the time until the first text or image content is painted; it doesn't wait for other images or downloads. LCP is the render time of the largest eligible image or text block in the viewport: the browser emits a new candidate whenever a bigger element paints and stops at the first input or scroll. Low-entropy placeholders, invisible and offscreen elements don't count. In a measurement, a heading painted at 16 milliseconds was both FCP and the first LCP candidate, and the hero photo replaced it at 816. A slow stylesheet pushed FCP to over 600 milliseconds, while a missing stylesheet or a failing script didn't block painting."
:::

::: links
web.dev: First Contentful Paint | https://web.dev/articles/fcp
web.dev: Largest Contentful Paint | https://web.dev/articles/lcp
web-vitals library | https://github.com/GoogleChrome/web-vitals
:::

=== How do you debug rendering performance with Chrome DevTools?
@p 2
@tags browser, devtools, performance, debugging
@quick
- **Performance panel**: record an interaction/load → flame chart of the main thread: long tasks (red corner), **Layout** (purple), **Paint** (green), frames, LCP/INP/CLS markers, network waterfall.
- **Rendering tab** (⋮ → More tools): **Paint flashing** (green = repainted areas), **Layout Shift Regions**, **Frame Rendering Stats**, **Layer borders**.
- **Layers panel**: 3D view of compositor layers, why each was created and its memory.
- **`chrome://gpu`**: whether hardware acceleration and GPU rasterization are on (and problems).
- In code: `PerformanceObserver` for `long-animation-frame`, `largest-contentful-paint`, `layout-shift`, `event` (INP), or the `web-vitals` library; CDP `Performance.getMetrics` gives counters like `LayoutCount` (that's how 62 vs 1 layouts were measured here).

::: text 🧒 In simple words
DevTools is the **dashboard camera and engine diagnostics** for your page: the Performance recording replays exactly what the engine did frame by frame, paint flashing **lights up** whatever had to be redrawn, and the Layers view shows the stack of transparent sheets the GPU is juggling.
:::

::: text 📖 Detailed answer
### A debugging workflow
1. Reproduce in an incognito window (no extensions), with CPU throttling (4× or 6×) to mimic mid-range phones.
2. Performance panel → Record → do the slow action → Stop.
3. Look for: **long tasks** (> 50 ms, red corner) in the Main track, repeated **Layout/Recalculate Style** inside loops (forced reflow warnings), big **Paint** areas, dropped frames in the Frames track.
4. Click an event → Bottom-Up/Call Tree to find the function responsible.
5. Fix (split work, batch reads/writes, transform instead of left, virtualise lists), record again, compare.

### Tools and what they answer
| Tool | Question it answers |
|---|---|
| Performance panel | what ran on the main thread, and when? |
| Performance → Insights / LCP & INP breakdown | which element is LCP; which handler made INP slow |
| Rendering → Paint flashing | what is being repainted while I scroll/animate? |
| Rendering → Layout Shift Regions | what moved (CLS)? |
| Layers panel | how many layers, why, how much memory? |
| `chrome://gpu` | is the GPU actually used? |
| Lighthouse | lab scores + diagnostics |
| `PerformanceObserver` / `web-vitals` | what do real users experience? |

### Measuring from code (as done for this page)
- `new PerformanceObserver(cb).observe({ type: 'long-animation-frame', buffered: true })` → a 120 ms task appeared as a 135.6 ms entry with script attribution.
- CDP `Performance.getMetrics` (Puppeteer/Playwright) → `LayoutCount`, `RecalcStyleCount`, `ScriptDuration` for automated performance tests.
:::

::: diagram Debugging loop
flowchart LR
  R["reproduce (throttled CPU, incognito)"] --> REC["record in the Performance panel"]
  REC --> F["find: long task, layout, paint or dropped frames"]
  F --> C["click through to the function (Bottom-Up)"]
  C --> X["fix"]
  X --> REC2["record again and compare"]
:::

::: image Debugging rendering performance in Chrome DevTools
/images/javascript/devtools-perf.svg
:::

::: chart bar Measured with CDP Performance.getMetrics: layouts during a 1 s animation
Animated property,LayoutCount
left,62
transform,1
:::

::: text 🪜 Step by step
Finding why scrolling a list janks:
1. Rendering → enable **Paint flashing**: the whole list flashes green on every scroll → repainting a lot.
2. Performance recording while scrolling: each frame shows a long purple **Layout** block called from a scroll handler.
3. Bottom-Up: `onScroll` reads `el.offsetTop` for every row after setting styles → forced synchronous layout (thrashing).
4. Fix: read positions once with `IntersectionObserver`, or batch reads before writes; use `transform` for the sticky header.
5. New recording: no layouts during scroll, green flashing only on the header, frames on time.
:::

::: code javascript Collecting rendering metrics from code (long animation frames, CLS, layout counts)
// 1) Long Animation Frames: which frames were slow and which scripts caused them
new PerformanceObserver((list) => {
  for (const frame of list.getEntries()) {
    if (frame.duration < 50) continue;
    const scripts = frame.scripts.map((s) => `${s.sourceFunctionName || s.invoker} (${Math.round(s.duration)} ms)`);
    console.log('long frame', Math.round(frame.duration), 'ms', scripts);
  }
}).observe({ type: 'long-animation-frame', buffered: true });

// 2) Layout shifts not caused by user input (CLS)
let cls = 0;
new PerformanceObserver((list) => {
  for (const shift of list.getEntries()) if (!shift.hadRecentInput) cls += shift.value;
  console.log('CLS so far', cls.toFixed(3));
}).observe({ type: 'layout-shift', buffered: true });

// 3) Automated check with Playwright + CDP (in a test file):
// const cdp = await page.context().newCDPSession(page);
// await cdp.send('Performance.enable');
// const metrics = (await cdp.send('Performance.getMetrics')).metrics;   // LayoutCount, RecalcStyleCount, ...
document.title = 'measuring';
:::

::: code javascript Spotting forced reflows in a trace-like event list (runnable)
// A simplified main-thread trace: a scroll handler alternating style writes and layout reads.
const trace = [
  { t: 0, type: 'Event', name: 'scroll' },
  ...Array.from({ length: 5 }, (_, i) => [{ t: i * 3 + 1, type: 'StyleWrite' }, { t: i * 3 + 2, type: 'Layout', forced: true, ms: 2.4 }]).flat(),
  { t: 20, type: 'Paint', ms: 3 },
];
const forced = trace.filter((e) => e.type === 'Layout' && e.forced);
const layoutMs = forced.reduce((s, e) => s + e.ms, 0);
console.log(`forced synchronous layouts: ${forced.length}, time: ${layoutMs.toFixed(1)} ms`);
console.log('DevTools would flag these as "Forced reflow"', forced.length === 5 ? '✅' : '❌ FAIL');
console.log('batched reads/writes would need 1 layout instead of 5', Math.ceil(forced.length / 5) === 1 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Profiling on a fast laptop without CPU throttling.
- Profiling with browser extensions enabled (they add their own work).
- Optimising by guessing instead of recording before and after.
- Looking only at Lighthouse scores instead of the actual main-thread activity.
:::

::: understand
- Record, find the expensive work, attribute it to code, fix, record again.
:::

::: ask
- *"Is the problem loading (LCP), responsiveness (INP) or smoothness (frames)?"* Each has its own DevTools view.
:::

::: important ⭐ Say this in the interview
"I reproduce the problem with CPU throttling in an incognito window, record it in the Performance panel and read the main-thread flame chart: long tasks, purple layout blocks with forced reflow warnings, green paint blocks and dropped frames, then use Bottom-Up to find the function. The Rendering tab's paint flashing and layout shift regions show what repaints or moves, the Layers panel shows compositor layers and memory, and chrome://gpu confirms GPU acceleration. For real users I collect long animation frames, LCP, INP and CLS with PerformanceObserver or the web-vitals library, and for automated checks I read counters like LayoutCount through the DevTools protocol."
:::

::: links
Chrome DevTools: Analyze runtime performance | https://developer.chrome.com/docs/devtools/performance
Chrome DevTools: Rendering tab | https://developer.chrome.com/docs/devtools/rendering
Chrome DevTools: Layers panel | https://developer.chrome.com/docs/devtools/layers
:::
