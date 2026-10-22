@section Streams & Buffers in Depth
@icon 🌊
@color #0891b2
@desc The four stream types, backpressure (measured), pipe() vs pipeline() (measured), custom Transform streams, streaming large HTTP responses (measured), and Buffers with encodings. Builds on "What are streams?" and "What are Buffers?" in Node.js Core.

=== What are the four stream types, and how do readable streams flow?
@p 3
@tags streams, nodejs, readable, writable, transform
@quick
- **Readable** (source: file, `req`, DB cursor), **Writable** (destination: file, `res`, socket), **Duplex** (both, independent: TCP socket), **Transform** (duplex that changes data: gzip, CSV parser, cipher).
- Readables have two modes: **paused** (you call `read()` / use `for await`) and **flowing** (`'data'` events); `pipe`/`pipeline` handle this for you.
- `highWaterMark` is the buffer threshold (64 KB for byte streams since Node 22, 16 objects in object mode), not a hard limit.
- Key events: Readable `'data'`, `'end'`, `'error'`, `'close'`; Writable `'drain'`, `'finish'`, `'error'`.
- **objectMode** streams pass JS objects (rows, events) instead of bytes.

::: text 🧒 In simple words
Streams are **plumbing**. A Readable is a **tap**, a Writable is a **drain**, a Transform is a **water filter** in the middle, and a Duplex is a **two-way pipe** like a phone line where both sides talk. You connect them and the water flows a bit at a time instead of filling a giant tank first.
:::

::: text 📖 Detailed answer
| Type | Examples | Implement |
|---|---|---|
| Readable | `fs.createReadStream`, `http.IncomingMessage` (server `req`), `process.stdin`, Mongo `cursor.stream()` | `read(size)` → `this.push(chunk)` / `push(null)` |
| Writable | `fs.createWriteStream`, `http.ServerResponse` (`res`), `process.stdout` | `write(chunk, enc, cb)` / `final(cb)` |
| Duplex | `net.Socket`, TLS sockets | both |
| Transform | `zlib.createGzip()`, `crypto.createCipheriv`, `csv-parse` | `transform(chunk, enc, cb)` / `flush(cb)` |

### Readable modes
- **Paused** (default): data waits in the buffer until consumed (`for await (const chunk of stream)` is the modern way).
- **Flowing**: attaching a `'data'` listener or calling `pipe()` starts the flow; `pause()`/`resume()` control it.
- Mixing both styles on one stream causes lost or duplicated data: pick one.

### Object mode
`new Transform({ objectMode: true, … })` lets each chunk be an object, so pipelines like *DB cursor → map → filter → NDJSON* stay readable. `Readable.from(iterable)` creates an object-mode readable from arrays and async generators.

### Web Streams
`ReadableStream`/`WritableStream`/`TransformStream` (used by `fetch`) also exist in Node; convert with `Readable.fromWeb()` / `Readable.toWeb()`.
:::

::: diagram A typical pipeline
flowchart LR
  R["Readable: file or DB cursor"] --> T1["Transform: parse"]
  T1 --> T2["Transform: gzip"]
  T2 --> W["Writable: file, S3 upload or HTTP response"]
:::

::: image The four stream types
/images/nodejs/stream-types.svg
:::

::: text 🪜 Step by step
`for await (const chunk of fs.createReadStream('big.log'))`:
1. The stream starts paused; the async iterator asks for data.
2. libuv reads up to 64 KB on the thread pool and the stream buffers it.
3. The loop body gets the chunk; while it runs, no more data is requested beyond `highWaterMark`.
4. When the loop finishes a chunk, the iterator asks for the next one.
5. At EOF the loop ends; on error the loop throws, so `try/catch` works.
:::

::: code javascript Creating each stream type
const { Readable, Writable, Duplex, Transform } = require('node:stream');

// Readable from an async generator (object mode): e.g. paging through an API
const users = Readable.from((async function* () {
  for (let page = 1; page <= 3; page++) yield* [{ id: page * 10 + 1 }, { id: page * 10 + 2 }];
})());

// Transform: object → NDJSON line
const toNdjson = new Transform({
  writableObjectMode: true,
  transform(user, enc, cb) { cb(null, JSON.stringify(user) + '\n'); },
});

// Writable: collects into memory (in real code: a file, S3 upload or HTTP response)
const lines = [];
const sink = new Writable({ write(chunk, enc, cb) { lines.push(chunk.toString()); cb(); } });

// Duplex: an echo "socket" whose readable side returns what was written to it
const echo = new Duplex({
  write(chunk, enc, cb) { this.push(chunk.toString().toUpperCase()); cb(); },
  read() {},
});

users.pipe(toNdjson).pipe(sink).on('finish', () => console.log(lines.length, 'lines written'));
echo.on('data', (d) => console.log('echo:', d.toString()));
echo.write('hello');
:::

::: code javascript A readable you pull from (runnable model)
// Paused mode in miniature: the consumer pulls; the producer only fills up to highWaterMark.
function createReadable(source, highWaterMark = 3) {
  const buffer = []; let i = 0, produced = 0;
  const fill = () => { while (buffer.length < highWaterMark && i < source.length) { buffer.push(source[i++]); produced++; } };
  return {
    read() { fill(); return buffer.length ? buffer.shift() : null; },
    get buffered() { return buffer.length; },
    get produced() { return produced; },
  };
}
const r = createReadable(Array.from({ length: 10 }, (_, n) => `row${n}`));
const first = r.read();
console.log('first chunk', first, '| produced so far', r.produced, '| buffered', r.buffered);
console.log('producer stops at highWaterMark', r.produced === 3 ? '✅' : '❌ FAIL');
const rest = []; let c; while ((c = r.read()) !== null) rest.push(c);
console.log('all data arrives in order', [first, ...rest].join() === Array.from({ length: 10 }, (_, n) => `row${n}`).join() ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Mixing `'data'` listeners with `for await` or `read()` on the same stream.
- Forgetting object mode when pushing objects (`TypeError: chunk must be a string or Buffer`).
- Treating `highWaterMark` as a maximum chunk size or a memory limit.
- Not listening for `'error'` (an unhandled stream error crashes the process).
- Building a giant array before writing (that's not streaming).
:::

::: understand
- Readable → (Transform…) → Writable, a chunk at a time, connected with pipeline.
:::

::: ask
- *"Is the data bytes or records?"* Records → object mode.
:::

::: important ⭐ Say this in the interview
"There are four stream types: Readable sources like files, the request object or a database cursor; Writable destinations like files or the response; Duplex streams that read and write independently, like TCP sockets; and Transform streams that change data in flight, like gzip or a CSV parser. Readables start paused and either flow through data events or are pulled, most cleanly with for await. highWaterMark is the buffering threshold that drives backpressure, and object mode lets chunks be JavaScript objects. I connect them with pipeline."
:::

::: links
Node.js: Stream | https://nodejs.org/api/stream.html
Node.js: Backpressuring in streams | https://nodejs.org/en/learn/modules/backpressuring-in-streams
:::

=== What is backpressure, and what happens if you ignore it? (measured)
@p 3
@tags streams, backpressure, performance, memory
@quick
- Backpressure = the consumer telling the producer to **slow down** when it can't keep up.
- `writable.write()` returns **false** when its buffer passes `highWaterMark`; the producer must stop until `'drain'`.
- Measured: pushing 250 MB into a slow writable while **ignoring** `write()` queued **249.94 MB** in memory; waiting for `'drain'` or using `pipeline()` peaked at **0.06 MB**.
- `pipe()`, `pipeline()` and `for await` all respect backpressure automatically; manual `write()` loops and `'data'` handlers usually don't.
- HTTP is the same: `res.write()` to a slow client, or an upload faster than your S3 stream.

::: text 🧒 In simple words
A conveyor belt delivers boxes to a packer. If the packer is slow and the belt never stops, boxes **pile up on the floor** until the room is full. Backpressure is the packer pressing a **stop button**: the belt pauses until there's space again.
:::

::: text 📖 Detailed answer
### The mechanism
1. Each writable has an internal buffer (`writableLength` bytes queued).
2. `write(chunk)` adds to it and returns `writableLength < highWaterMark`.
3. When it returns `false`, a well-behaved producer stops.
4. When the buffer drains below the threshold, the writable emits `'drain'`.
5. Readables do the same internally: `push()` returns false and `_read` isn't called again until there's room.

### Measured (Node 22, 4,000 × 64 KB chunks into a writable that completes each write on the next tick)
| Producer | Peak bytes queued | Peak RSS |
|---|---|---|
| Ignores `write()` return value | **249.94 MB** | 299 MB |
| Waits for `'drain'` | **0.06 MB** | 146 MB (garbage not yet collected) |
| `pipeline(readable, transform, writable)` | **0.06 MB** | 101 MB |

RSS also includes chunks already written but not yet garbage-collected; the queued bytes are the real cost of ignoring backpressure, and they grow with the input size until the process runs out of memory.

### Where it shows up
- Writing a big export to `res` for a slow mobile client.
- Reading from Kafka/RabbitMQ faster than the DB can insert (use prefetch / consumer concurrency limits).
- `readable.on('data', (c) => writable.write(c))` handlers.
:::

::: diagram Backpressure loop
flowchart LR
  P["producer"] -->|"write chunk"| B["writable buffer"]
  B -->|"write returns false"| P2["producer pauses"]
  B --> C["slow consumer"]
  C -->|"buffer below highWaterMark: drain"| P
:::

::: image Backpressure (measured)
/images/nodejs/backpressure.svg
:::

::: chart bar Measured: peak MB queued in the writable while producing 250 MB
Producer,MB queued at peak
ignores write(),249.94
waits for drain,0.06
pipeline(),0.06
:::

::: text 🪜 Step by step
Fixing a memory spike in a CSV export to S3:
1. Code: `cursor.on('data', (row) => upload.write(toCsv(row)))`.
2. The DB cursor reads 50,000 rows/s, the upload sends 5,000 rows/s → 45,000 rows/s pile up.
3. Memory grows until the container is OOM-killed.
4. Fix: `await pipeline(cursor, toCsvTransform, upload)`, so the cursor pauses whenever the upload buffer is full.
5. Memory stays flat regardless of table size; total time is set by the slowest stage, as it must be.
:::

::: code javascript bp.js: the measurement (node bp.js ignore | manual | pipeline)
const { Readable, Writable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const mode = process.argv[2];
const chunk = () => Buffer.alloc(64 * 1024, 'x');
const TOTAL = 4000;                                   // 4000 × 64 KB = 250 MB
let queuedPeak = 0;
const slow = () => {
  const w = new Writable({
    highWaterMark: 64 * 1024,
    write(c, enc, cb) { queuedPeak = Math.max(queuedPeak, w.writableLength); setImmediate(cb); },
  });
  return w;
};

async function main() {
  if (mode === 'ignore') {
    const w = slow();
    for (let i = 0; i < TOTAL; i++) w.write(chunk());                               // return value ignored
    await new Promise((r) => w.end(r));
  } else if (mode === 'manual') {
    const w = slow();
    for (let i = 0; i < TOTAL; i++) if (!w.write(chunk())) await new Promise((r) => w.once('drain', r));
    await new Promise((r) => w.end(r));
  } else {
    let i = 0;
    await pipeline(new Readable({ read() { this.push(i++ < TOTAL ? chunk() : null); } }), new Transform({ transform(c, e, cb) { cb(null, c); } }), slow());
  }
  console.log(mode, 'peak queued MB:', (queuedPeak / 1048576).toFixed(2));   // ignore 249.94 · manual 0.06 · pipeline 0.06
}
main();
:::

::: code javascript Simulating a fast producer and slow consumer (runnable)
function run(respectBackpressure, { chunks = 1000, highWaterMark = 4, consumePerTick = 1, producePerTick = 10 } = {}) {
  const queue = []; let produced = 0, peak = 0, waitingForDrain = false;
  while (produced < chunks || queue.length) {
    for (let i = 0; i < producePerTick && produced < chunks; i++) {
      if (respectBackpressure && waitingForDrain) break;
      queue.push(produced++);
      if (queue.length >= highWaterMark) waitingForDrain = true;            // write() returned false
    }
    peak = Math.max(peak, queue.length);
    queue.splice(0, consumePerTick);                                         // slow consumer
    if (queue.length < highWaterMark) waitingForDrain = false;               // 'drain'
  }
  return peak;
}
const ignored = run(false), respected = run(true);
console.log({ peakQueuedIgnoring: ignored, peakQueuedRespecting: respected });
console.log('ignoring backpressure queues almost everything', ignored > 800 ? '✅ (measured 249.94 of 250 MB)' : '❌ FAIL');
console.log('respecting it caps the queue near highWaterMark', respected <= 5 ? '✅ (measured 0.06 MB)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Ignoring the boolean returned by `write()`.
- Forwarding `'data'` events to a writable by hand.
- Huge `highWaterMark` values to "make it faster" (just more memory).
- Unlimited consumer concurrency on queues (backpressure exists there too: prefetch).
- Measuring only RSS and missing that queued bytes grow with input size.
:::

::: understand
- Backpressure lets the slowest stage set the pace, keeping memory bounded.
:::

::: ask
- *"Which stage is slowest, and does everything upstream slow down with it?"*
:::

::: important ⭐ Say this in the interview
"Backpressure is how a slow consumer slows down a fast producer. A writable's write method returns false once its buffer passes highWaterMark, and the producer should wait for the drain event. I measured it: pushing 250 megabytes into a slow writable while ignoring the return value queued 249.9 megabytes in memory, while waiting for drain or using pipeline kept the queue at 0.06 megabytes. pipe, pipeline and for-await handle it automatically, which is why I never forward data events by hand, and the same idea applies to HTTP responses and message consumers."
:::

::: links
Node.js: Backpressuring in streams | https://nodejs.org/en/learn/modules/backpressuring-in-streams
Node.js: writable.write() | https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback
:::

=== pipe() vs pipeline(): why does stream error handling matter? (measured)
@p 3
@tags streams, pipeline, error-handling
@quick
- `src.pipe(dest)` does **not** forward errors or clean up: measured, after the source failed the destination was still **open** (`destroyed: false`, `writable: true`) → leaked file descriptors/sockets.
- `await pipeline(src, ...transforms, dest)` (from `node:stream/promises`) **destroys every stream** on any error and **rejects once** (measured: `destroyed: true`).
- `pipeline` accepts **async generator** functions as transforms: `async function* (source) { for await (const c of source) yield … }`.
- Pass an `AbortSignal` (`pipeline(a, b, { signal })`) to cancel, e.g. when the HTTP client disconnects.
- `stream.finished(stream)` waits for a stream to end or fail.

::: text 🧒 In simple words
`pipe()` is connecting hoses with **tape**: if one bursts, water keeps leaking from the others and nobody is told. `pipeline()` is a **plumbing system with a master valve**: if any part fails, every valve shuts and you get one alarm.
:::

::: text 📖 Detailed answer
### Measured (Node 22, source errors after 2 chunks)
| | Error reported | Destination after the error |
|---|---|---|
| `src.pipe(dest)` | only on `src` (needs its own listener) | `destroyed: false`, `writable: true` (leak) |
| `await pipeline(src, dest)` | promise rejects with `source failed` | `destroyed: true` |

### What `pipeline` does
- Connects streams with backpressure.
- Listens for `'error'` and premature `'close'` on **all** of them.
- Destroys all streams on failure (closing file descriptors and sockets).
- Calls back / resolves once when the last stream finishes.

### Async generators as stages
Simpler than writing a `Transform` class for most logic: `async function* (source) { for await (const row of source) if (row.active) yield row; }`.

### Cancelling
`const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); }); await pipeline(source, res, { signal: ac.signal })`: a client disconnect stops the DB cursor too. Listen on `res`, not `req`: in Node 22 `req` emits `close` as soon as its body has been read (measured ~1 ms for a POST), long before the response ends.
:::

::: diagram What happens on failure
flowchart TD
  E["source emits error"] --> Q{"connected with?"}
  Q -->|"pipe"| L["destination left open: fd or socket leaks, error only on source"]
  Q -->|"pipeline"| D["all streams destroyed, promise rejects once"]
:::

::: image pipe() vs pipeline() (measured)
/images/nodejs/pipe-vs-pipeline.svg
:::

::: text 🪜 Step by step
A user cancels a large download half-way:
1. The browser closes the TCP connection; `res` emits `'close'` (and an error on write).
2. With `pipe()`, the file read stream keeps reading into a dead socket or stays open.
3. With `pipeline(fileStream, gzip, res)`, the failure destroys `fileStream` and `gzip`.
4. The file descriptor closes and the DB cursor (if any) is released.
5. Your `catch` logs `ERR_STREAM_PREMATURE_CLOSE` at debug level (normal for cancellations).
:::

::: code javascript pipeerr.js: the measurement
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const failing = () => {
  let n = 0;
  return new Readable({ read() { if (++n === 3) this.destroy(new Error('source failed')); else this.push('row\n'); } });
};

(async () => {
  const out1 = fs.createWriteStream('/tmp/pipe-out.txt');
  const src1 = failing();
  src1.on('error', (e) => console.log('pipe(): source error:', e.message));
  src1.pipe(out1);
  await new Promise((r) => setTimeout(r, 100));
  console.log('pipe(): destination destroyed?', out1.destroyed, '| still writable?', out1.writable);   // false | true

  const out2 = fs.createWriteStream('/tmp/pipeline-out.txt');
  try { await pipeline(failing(), out2); } catch (e) { console.log('pipeline(): rejected with:', e.message); }
  console.log('pipeline(): destination destroyed?', out2.destroyed);                                  // true
})();
:::

::: code javascript Async generator stages, like pipeline uses them (runnable)
// pipeline(source, stage1, stage2, sink) where each stage is an async generator function.
async function pipelineLike(source, ...stages) {
  let it = source;
  for (const stage of stages) it = stage(it);
  const out = []; for await (const x of it) out.push(x); return out;
}
async function* rows() { for (let i = 1; i <= 6; i++) yield { id: i, active: i % 2 === 0, email: `U${i}@EXAMPLE.COM` }; }
const onlyActive = async function* (source) { for await (const r of source) if (r.active) yield r; };
const normalise = async function* (source) { for await (const r of source) yield { ...r, email: r.email.toLowerCase() }; };
const toLine = async function* (source) { for await (const r of source) yield JSON.stringify(r); };
async function* failingRows() { yield { id: 1, active: true, email: 'A@X' }; throw new Error('cursor closed'); }
(async () => {
  const lines = await pipelineLike(rows(), onlyActive, normalise, toLine);
  console.log(lines);
  console.log('filter + map in order', lines.length === 3 && lines[0].includes('u2@example.com') ? '✅' : '❌ FAIL');
  try { await pipelineLike(failingRows(), onlyActive, toLine); console.log('❌ FAIL'); }
  catch (e) { console.log('error from any stage surfaces once:', e.message, '✅'); }
})();
:::

::: warning ⚠️ Common mistakes
- `.pipe()` chains without error handlers on every stream.
- Only catching the error of the last stream.
- Not cancelling upstream work when the HTTP client disconnects.
- Using the callback `pipeline` and forgetting the callback (errors silently lost); prefer `stream/promises`.
- Logging client cancellations (`ERR_STREAM_PREMATURE_CLOSE`) as server errors.
:::

::: understand
- `pipe` moves data; `pipeline` moves data *and* owns errors and cleanup.
:::

::: ask
- *"What happens to the source if the destination dies half-way?"*
:::

::: important ⭐ Say this in the interview
"pipe connects streams with backpressure but doesn't forward errors or clean up: when I made the source fail, the destination file stream stayed open and writable, which leaks file descriptors or sockets. pipeline from stream/promises destroys every stream on any failure and rejects once, which I also verified. I use it everywhere, with async generator functions as transform stages, and pass an AbortSignal tied to the client disconnect so a cancelled download also stops the file read or database cursor."
:::

::: links
Node.js: stream.pipeline() | https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
Node.js: stream.finished() | https://nodejs.org/api/stream.html#streamfinishedstream-options-callback
:::

=== How do you stream a large HTTP response or export? (measured)
@p 3
@tags streams, http, performance, export, ndjson
@quick
- Building the whole result then `res.json()` holds everything in memory and makes the client wait for the **first byte** until it's all built.
- Measured, 300,000 rows (34.2 MB): buffered → first byte **330 ms**, server **355 MB**; streamed NDJSON → first byte **7–9 ms**, **84–91 MB**.
- One `write()` per row is CPU-heavy (629 ms total); **batching 1,000 rows per chunk** was fastest overall (**261 ms**).
- Source from a **cursor** (`Model.find().cursor()`, `pg-query-stream`), never `find()` of everything; connect with `pipeline(…, res)`.
- Use NDJSON or CSV for streamed exports (a JSON array can stream too, but clients must parse it incrementally).

::: text 🧒 In simple words
Buffering is **printing the whole book before handing over page one**. Streaming hands over pages **as they come off the press**, so the reader starts immediately and you never need a warehouse for the whole book. Handing over one page at a time is slow, though; handing over **bundles of pages** is the sweet spot.
:::

::: text 📖 Detailed answer
### Measured (Node 22, 300,000 rows, fresh server per run, 2 runs each)
| Strategy | First byte | Total | Server peak RSS |
|---|---|---|---|
| Collect array → `JSON.stringify` → `res.end` | 305–334 ms | 332–362 ms | **354–355 MB** |
| Stream, one write per row | 9 ms | 624–629 ms | 91 MB |
| Stream, 1,000 rows per chunk | **7 ms** | **257–261 ms** | **84 MB** |

### Why
- Buffered memory = rows as objects + one big JSON string; it grows linearly with the export. Ten concurrent exports would need ~3.5 GB.
- Per-row writes pay stream bookkeeping 300,000 times; batching amortises it.
- The response's backpressure pauses the cursor for slow clients.

### Formats
| Format | Streaming-friendly | Notes |
|---|---|---|
| NDJSON (`application/x-ndjson`) | ✅ | one JSON object per line |
| CSV | ✅ | spreadsheets; escape quotes and commas |
| JSON array | ⚠️ | write `[`, rows with commas, `]`; client needs a streaming parser |

### Production notes
Set `Content-Disposition: attachment; filename="users.csv"`, add `Cache-Control: no-store`, cancel the cursor when the client disconnects, and for very large or slow exports, generate the file in a **background job** to S3 and email a pre-signed link.
:::

::: diagram Streaming export
flowchart LR
  DB["database cursor"] --> B["batch 1000 rows"]
  B --> F["format NDJSON or CSV"]
  F --> G["gzip, optional"]
  G --> RES["HTTP response"]
  RES -.->|"slow client: backpressure pauses the cursor"| DB
:::

::: image Streaming a large HTTP response (measured)
/images/nodejs/streaming-export.svg
:::

::: chart bar Measured: time to first byte (ms) for a 300,000-row export
Strategy,First byte (ms)
build array,330
stream per row,9
stream 1000 per chunk,7
:::

::: text 🪜 Step by step
`GET /api/admin/users/export.csv` streaming from MongoDB:
1. Authorize the admin and validate filters.
2. `const cursor = User.find(filter).select('email name plan createdAt').lean().cursor({ batchSize: 1000 })`.
3. `pipeline(cursor, batchToCsv, res, { signal })` with headers set first.
4. The first CSV lines reach the browser within milliseconds; memory stays flat.
5. If the admin closes the tab, the abort signal destroys the cursor and frees the DB connection.
:::

::: code javascript Streaming CSV export from MongoDB in Express
const { pipeline } = require('node:stream/promises');

const csvEscape = (v) => { const s = v instanceof Date ? v.toISOString() : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function* toCsvBatches(cursor, columns, batchSize = 1000) {
  yield columns.join(',') + '\n';
  let lines = [];
  for await (const doc of cursor) {
    lines.push(columns.map((c) => csvEscape(doc[c])).join(','));
    if (lines.length === batchSize) { yield lines.join('\n') + '\n'; lines = []; }
  }
  if (lines.length) yield lines.join('\n') + '\n';
}

function exportUsers(User) {
  return async (req, res) => {
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });       // client went away before we finished → stop the cursor
    const cursor = User.find({ deletedAt: null }).select('email name plan createdAt').lean().cursor({ batchSize: 1000 });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="users.csv"', 'Cache-Control': 'no-store' });
    try {
      await pipeline(toCsvBatches(cursor, ['email', 'name', 'plan', 'createdAt']), res, { signal: ac.signal });
    } catch (err) {
      await cursor.close().catch(() => {});
      if (err.name !== 'AbortError' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw err;
    }
  };
}

module.exports = { exportUsers, toCsvBatches };
:::

::: code javascript Batching rows into chunks (runnable)
async function* rows(n) { for (let i = 0; i < n; i++) yield { id: i, email: `user${i}@example.com`, note: i === 3 ? 'says "hi", ok' : '' }; }
const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function* batches(source, size) {
  let buf = [];
  for await (const r of source) { buf.push([r.id, r.email, r.note].map(esc).join(',')); if (buf.length === size) { yield buf.join('\n') + '\n'; buf = []; } }
  if (buf.length) yield buf.join('\n') + '\n';
}
(async () => {
  const perRow = []; for await (const c of batches(rows(2500), 1)) perRow.push(c);
  const batched = []; for await (const c of batches(rows(2500), 1000)) batched.push(c);
  console.log({ writesPerRow: perRow.length, writesBatched: batched.length });
  console.log('same bytes either way', perRow.join('') === batched.join('') ? '✅' : '❌ FAIL');
  console.log('1000x fewer writes', perRow.length / batched.length > 800 ? '✅ (measured 629 ms → 261 ms total)' : '❌ FAIL');
  console.log('CSV escaping', batched[0].includes('"says ""hi"", ok"') ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- `const all = await Model.find(filter)` for exports (whole collection in memory).
- One `res.write()` per row (CPU overhead) or no backpressure (`res.write` in a loop).
- Forgetting to close the cursor when the client disconnects.
- Streaming a JSON array that clients then `JSON.parse` in one go (no benefit on their side).
- Long exports on the request thread when a background job + pre-signed URL would be better.
:::

::: understand
- Stream from a cursor, batch the writes, let backpressure and abort signals do the rest.
:::

::: ask
- *"How big can this export get, and how long may the request take?"* Over a minute → background job.
:::

::: important ⭐ Say this in the interview
"For large responses I stream from a database cursor through pipeline into the response instead of building an array. I measured a 300 thousand row export: buffering took 330 milliseconds to the first byte and 355 megabytes on the server, while streaming NDJSON started in under 10 milliseconds with about 85 megabytes. Writing every row separately was CPU-heavy at 629 milliseconds total, so I batch about a thousand rows per chunk, which was the fastest at 261 milliseconds. I abort the cursor when the client disconnects, and move very long exports to a background job that uploads to S3."
:::

::: links
Mongoose: QueryCursor | https://mongoosejs.com/docs/api/querycursor.html
NDJSON specification | https://github.com/ndjson/ndjson-spec
:::

=== Buffers in depth: encodings, base64, byte length and allocation (measured)
@p 2
@tags buffers, encoding, utf8, base64, nodejs
@quick
- A `Buffer` is a fixed-size chunk of raw bytes (a `Uint8Array` subclass) allocated outside the V8 heap.
- `str.length` counts UTF-16 code units, not bytes: measured `'héllo 👋'` → length **8**, UTF-8 **11** bytes, UTF-16 **16** bytes. Use `Buffer.byteLength()` for `Content-Length` and size limits.
- **base64** makes binary text-safe at **+33%** (measured 3000 B → 4000 chars); hex doubles it (6000).
- `Buffer.alloc(n)` zero-fills (measured 872 ns for 4 KB); `allocUnsafe(n)` is faster (470 ns) but may contain old memory → fill it completely before use.
- A multi-byte character split across chunks decodes as `�` (measured); use `StringDecoder` or `setEncoding('utf8')` on streams.

::: text 🧒 In simple words
A Buffer is a **row of numbered boxes, each holding a number 0–255**. Text is just one way to read those numbers: UTF-8 says "these 4 boxes together are a 👋". Cut the row in the middle of an emoji and the reader sees nonsense, unless a helper (StringDecoder) remembers the half for the next row.
:::

::: text 📖 Detailed answer
### Measured facts (Node 22)
| Check | Result |
|---|---|
| `'héllo 👋'.length` | 8 |
| `Buffer.byteLength('héllo 👋')` (UTF-8) | **11** |
| UTF-16 bytes | 16 |
| 3000 random bytes → base64 / hex | 4000 / 6000 chars |
| `Buffer.alloc(4096)` vs `allocUnsafe(4096)` | 872 ns vs 470 ns |
| first 2 bytes of 👋 → `toString()` | `"�"` |
| same bytes through `StringDecoder` in two writes | `"👋"` |

### Common conversions
| Task | Code |
|---|---|
| string → bytes | `Buffer.from(str, 'utf8')` |
| bytes → string | `buf.toString('utf8')` |
| binary → base64 / base64url | `buf.toString('base64')`, `'base64url'` (JWT, URLs) |
| join chunks | `Buffer.concat(chunks)` |
| compare | `buf.equals(other)`, `crypto.timingSafeEqual` for secrets |
| slice without copy | `buf.subarray(start, end)` (shares memory!) |
| read numbers | `buf.readUInt32BE(offset)` (binary protocols) |

### Buffers vs streams
Buffers hold a known, bounded amount of bytes; streams move unbounded data as a sequence of Buffers. Collecting all chunks of an unbounded stream into one Buffer recreates the memory problem.
:::

::: diagram From text to bytes and back
flowchart LR
  S["string héllo with emoji"] -->|"Buffer.from utf8"| B["11 bytes"]
  B -->|"toString base64"| B64["base64 text, 33 percent larger"]
  B -->|"split across chunks"| X["half an emoji"]
  X -->|"StringDecoder"| OK["whole characters"]
:::

::: image Buffers and encodings (measured)
/images/nodejs/buffers.svg
:::

::: text 🪜 Step by step
Enforcing a 1 MB limit on a JSON body with emoji and accents:
1. Don't use `body.length` on a string: that's code units, not bytes.
2. Count `chunk.length` of incoming Buffers while reading the stream.
3. Reject with 413 as soon as the total passes 1,048,576 bytes (don't wait for the end).
4. `Buffer.concat(chunks).toString('utf8')` once at the end (no split-character issue).
5. Set `Content-Length` of responses with `Buffer.byteLength(json)`.
:::

::: code javascript buffers.js: the measured checks
const crypto = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');

const s = 'héllo 👋';
console.log('length', s.length, 'utf8 bytes', Buffer.byteLength(s), 'utf16 bytes', Buffer.byteLength(s, 'utf16le'));   // 8 11 16

const b = crypto.randomBytes(3000);
console.log('base64', b.toString('base64').length, 'hex', b.toString('hex').length);                                   // 4000 6000

const wave = Buffer.from('👋');                                   // 4 bytes: f0 9f 91 8b
console.log('half an emoji:', JSON.stringify(wave.subarray(0, 2).toString()));                                         // "�"
const d = new StringDecoder('utf8');
console.log('decoder:', JSON.stringify(d.write(wave.subarray(0, 2)) + d.write(wave.subarray(2))));                      // "👋"

const unsafe = Buffer.allocUnsafe(1024).fill(0);                  // always fill allocUnsafe before exposing it
const view = unsafe.subarray(0, 4);
view[0] = 255;
console.log('subarray shares memory:', unsafe[0] === 255);                                                             // true
:::

::: code javascript Bytes vs characters with Uint8Array (runnable)
// Buffer is a Uint8Array subclass; TextEncoder/TextDecoder show the same facts without Node APIs.
const enc = new TextEncoder();
const s = 'héllo 👋';
const bytes = enc.encode(s);
console.log({ length: s.length, utf8Bytes: bytes.length, codePoints: [...s].length });
console.log('length ≠ bytes', s.length === 8 && bytes.length === 11 ? '✅ (measured)' : '❌ FAIL');
const wave = enc.encode('👋');
const broken = new TextDecoder().decode(wave.subarray(0, 2));
const streaming = new TextDecoder();
const joined = streaming.decode(wave.subarray(0, 2), { stream: true }) + streaming.decode(wave.subarray(2));
console.log({ broken, joined });
console.log('split character breaks, streaming decoder fixes it', broken.includes('�') && joined === '👋' ? '✅' : '❌ FAIL');
const b64len = (n) => 4 * Math.ceil(n / 3);
console.log('base64 overhead for 3000 bytes:', b64len(3000), b64len(3000) === 4000 ? '✅ +33%' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `string.length` for byte limits or `Content-Length`.
- `chunk.toString()` per chunk on multi-byte text (split characters → `�`).
- `Buffer.allocUnsafe` without overwriting every byte (can leak old memory).
- Forgetting that `subarray`/`slice` share memory with the original buffer.
- Base64-encoding large files into JSON/MongoDB (+33% size; use multipart or S3).
:::

::: understand
- Buffers are bytes; encodings are interpretations; count bytes, not characters.
:::

::: ask
- *"Is this limit in bytes or characters?"* Storage and networks care about bytes.
:::

::: important ⭐ Say this in the interview
"A Buffer is a fixed-size chunk of raw bytes outside the V8 heap, a Uint8Array subclass. Strings and bytes differ: I measured 'héllo' plus an emoji as length 8 but 11 UTF-8 bytes, so I use Buffer.byteLength for limits and Content-Length. Base64 adds about a third, 3000 bytes became 4000 characters. Buffer.alloc zero-fills while allocUnsafe is faster but may contain old memory, so it must be fully overwritten. When text arrives in chunks, a character can be split across chunks and decode as a replacement character, which StringDecoder or setEncoding fixes."
:::

::: links
Node.js: Buffer | https://nodejs.org/api/buffer.html
Node.js: String decoder | https://nodejs.org/api/string_decoder.html
:::
