@section Distributed Systems Fundamentals
@icon 🕸️
@color #8b5cf6
@desc The distributed-systems ideas behind every large design, from an interview angle: CAP, PACELC and consistency models; replication, quorums, consensus, leader election, split brain and fencing tokens; distributed transactions with 2PC vs sagas; and time, ordering and "exactly once" (measured: per-conversation sequence numbers under concurrency).

=== What are CAP, PACELC and consistency models, and how do they affect design choices?
@p 3
@tags distributed-systems, cap, pacelc, consistency, eventual-consistency
@quick
- **CAP**: when a network **partition** happens, a distributed data store must choose **Consistency** (refuse or block some requests) or **Availability** (answer, possibly with stale data). Partitions aren't optional, so it's really C vs A *during failures*.
- **PACELC** adds the everyday trade-off: **E**lse (no partition) choose **L**atency or **C**onsistency, e.g. synchronous replicas (consistent, slower writes) vs asynchronous (fast, stale reads).
- Consistency models from strong to weak: **linearizable** → **read-your-writes** → **monotonic reads** → **causal** → **eventual**.
- Choose **per feature**, not per system: balances and inventory need strong consistency; like counts, feeds and search can be eventual.
- Most "eventual" bugs are users not seeing their own write; route their reads to the primary or use session guarantees.

::: text 🧒 In simple words
Two shop branches share one stock list by phone. If the phone line goes down (**partition**), each branch either **stops selling** until the line is back (consistent) or **keeps selling** and fixes overselling later (available). Even when the phone works, calling the other branch before every sale is slower (**latency vs consistency**).
:::

::: text 📖 Detailed answer
### CAP in practice
| Choice during a partition | Behaviour | Examples |
|---|---|---|
| CP | some requests fail or wait so no one reads stale/conflicting data | etcd, ZooKeeper, a single Postgres primary with sync replicas, MongoDB majority writes |
| AP | every node answers; conflicts reconciled later | Cassandra/DynamoDB (tunable), DNS, CDN caches, shopping carts |

### PACELC
| System | If Partition | Else |
|---|---|---|
| Postgres primary + async replicas | C (primary only) | L (replica reads are fast but stale) |
| DynamoDB default reads | A | L (eventually consistent), C with strongly consistent reads at higher cost |
| Spanner | C | C (pays latency for global consistency) |

### Consistency models
| Model | Guarantee | Use for |
|---|---|---|
| Linearizable (strong) | every read sees the latest completed write | balances, stock, unique usernames, locks |
| Read-your-writes | you always see your own updates | profile edits, posting a comment |
| Monotonic reads | you never see older data after newer | feeds, chat history |
| Causal | effects appear after their causes | a reply never before its question |
| Eventual | replicas converge if writes stop | counters, likes, search indexes, analytics |

### Design moves
- Put strongly consistent data in one primary (or a consensus store); cache and replicate the rest.
- Use conditional writes / version numbers for concurrent updates.
- Tell the UI what's eventually consistent (optimistic updates, "processing…").
:::

::: diagram Choosing consistency per feature
flowchart TD
  F["feature"] --> Q{"wrong or stale value costs money or trust?"}
  Q -->|"yes: balance, stock, username"| S["strong: primary DB, transactions, conditional writes"]
  Q -->|"only for the author"| RYW["read-your-writes: read own data from primary"]
  Q -->|"no: likes, feed, analytics"| E["eventual: replicas, caches, async events"]
:::

::: image CAP, PACELC and consistency models
/images/system-design/cap.svg
:::

::: text 🪜 Step by step
1. For each feature ask: what happens if a user sees stale or conflicting data?
2. Classify: strong, read-your-writes, or eventual.
3. Strong: single primary or consensus store, transactions, conditional updates.
4. Read-your-writes: route the author's reads to the primary or wait for the replica to catch up (LSN/token).
5. Eventual: replicas, caches, async events; design idempotent, convergent updates.
6. Explain the partition behaviour: which requests fail or degrade when a link breaks.
:::

::: code javascript Read-your-writes with an async replica (runnable)
// A primary and a replica that applies writes 50 ms later. Reading from the replica right after a write shows stale data.
function makeDb(lagMs) {
  const primary = new Map(), replica = new Map(); let lsn = 0, replicaLsn = 0;
  return {
    write(key, value) { primary.set(key, value); const my = ++lsn; setTimeout(() => { replica.set(key, value); replicaLsn = my; }, lagMs); return my; },
    readPrimary: (key) => primary.get(key),
    readReplica: (key) => replica.get(key),
    replicaCaughtUp: (token) => replicaLsn >= token,
  };
}
const db = makeDb(50);
db.write('user:1:name', 'Asha');
setTimeout(() => {
  const token = db.write('user:1:name', 'Asha K.');                                  // user edits their profile
  const stale = db.readReplica('user:1:name');
  const routed = db.replicaCaughtUp(token) ? db.readReplica('user:1:name') : db.readPrimary('user:1:name');
  console.log('replica right after the write:', stale, '| read-your-writes routing:', routed);
  console.log(stale === 'Asha' ? '✅ async replica returns the old value' : '❌ FAIL');
  console.log(routed === 'Asha K.' ? '✅ token-based routing shows the user their own write' : '❌ FAIL');
  setTimeout(() => console.log(db.readReplica('user:1:name') === 'Asha K.' ? '✅ eventually the replica converges' : '❌ FAIL'), 80);
}, 80);
:::

::: warning ⚠️ Common mistakes
- Saying "we pick CA": without partition tolerance you don't have a distributed system.
- Treating the whole system as either consistent or eventual instead of choosing per feature.
- Reading from replicas right after a write and showing the user their old data.
- Assuming "eventual" means "within milliseconds"; lag can be seconds under load.
- Last-write-wins by wall-clock time for important data.
:::

::: understand
- During partitions you trade consistency for availability; the rest of the time you trade latency for consistency, and you choose per feature.
:::

::: ask
- *"If two users buy the last item at the same moment, which one should win, and is it OK to apologise to the other later?"*
:::

::: important ⭐ Say this in the interview
"CAP says that during a network partition a distributed store must either refuse some requests to stay consistent or answer with possibly stale data to stay available; PACELC adds that even without partitions we trade latency for consistency, for example synchronous versus asynchronous replicas. I decide per feature: balances, inventory and unique names need strong consistency through a primary, transactions or conditional writes; a user's own edits need read-your-writes, so I route their reads to the primary; and counters, feeds and search can be eventually consistent with replicas, caches and async events."
:::

::: links
Martin Kleppmann: Please stop calling databases CP or AP | https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html
Jepsen: Consistency models | https://jepsen.io/consistency
:::

=== How do replication, quorums and consensus work? (leader election, split brain, fencing tokens)
@p 2
@tags distributed-systems, replication, quorum, consensus, raft, leader-election
@quick
- **Leader-follower** replication: the leader takes writes and ships a log; followers apply it. Failover promotes a follower.
- **Quorums**: with N replicas, write to W and read from R; if **R + W > N** every read overlaps the latest write (N=3, W=2, R=2).
- **Consensus** (Raft, Paxos) makes a **majority** agree on a log and a leader; 3 nodes tolerate 1 failure, 5 tolerate 2. Use etcd/ZooKeeper/Consul instead of writing your own.
- **Split brain**: two nodes both believe they're leader (partition, long GC pause) and both accept writes.
- **Fencing tokens**: each lease comes with an increasing number; storage rejects writes with an older token, so a "zombie" leader can't corrupt data.

::: text 🧒 In simple words
A team keeps one shared notebook. One person is the **writer** (leader); everyone else copies their pages (followers). If the writer goes missing, the team **votes** a new one and needs more than half the votes (consensus). If the old writer comes back still thinking they're in charge, the notebook only accepts pages stamped with the **newest ticket number** (fencing token).
:::

::: text 📖 Detailed answer
### Replication styles
| Style | Writes | Trade-off | Examples |
|---|---|---|---|
| single leader | one node | simple, ordered; leader is a bottleneck | Postgres, MySQL, MongoDB replica sets |
| multi-leader | several nodes | write anywhere; conflicts | multi-region active-active, offline-first apps |
| leaderless (quorum) | any W of N | no failover; read repair, hinted handoff | Cassandra, DynamoDB-style stores |

### Quorum maths (N = 3)
| W | R | R + W > N? | Behaviour |
|---|---|---|---|
| 2 | 2 | yes | reads see the latest write; tolerates 1 node down |
| 1 | 1 | no | fast, may read stale data |
| 3 | 1 | yes | slow writes; one node down blocks writes |

### Consensus and leader election
- Raft: nodes vote in **terms**; a candidate needs a majority; the leader appends entries and commits them when a majority stores them.
- A minority partition can't elect a leader or commit writes, which is what keeps it consistent (CP).
- Cluster sizes are odd (3, 5): 4 nodes still tolerate only 1 failure.

### Split brain and fencing
1. Node A holds a lock lease, then freezes in a 30 s GC pause; its lease expires.
2. Node B gets the lock (token 34) and writes.
3. A wakes up, still believes it holds the lock (token 33) and writes.
4. With fencing, storage has seen 34 and **rejects 33**.
:::

::: diagram Leader election with a majority
sequenceDiagram
  participant A as "node A (leader, term 4)"
  participant B as "node B"
  participant C as "node C"
  Note over A: crashes / partitioned away
  B->>B: election timeout, become candidate (term 5)
  B->>C: RequestVote(term 5)
  C-->>B: vote granted
  Note over B: 2 of 3 votes = majority → leader for term 5
  A->>C: AppendEntries(term 4) after it returns
  C-->>A: rejected: term 4 is stale
:::

::: image Replication, quorums, consensus, split brain and fencing tokens
/images/system-design/replication-quorum.svg
:::

::: text 🪜 Step by step
1. Decide the replication style from write patterns (single leader is the default).
2. For leaderless stores pick N, W, R from the consistency you need (R + W > N for overlap).
3. Use a consensus system (etcd, ZooKeeper, Consul, the DB's own failover) for leader election and locks.
4. Make leadership a **lease** with expiry; renew it via heartbeats.
5. Pass fencing tokens to every protected write and reject older ones.
6. Test partitions and pauses (kill -STOP a process) in staging.
:::

::: code javascript Quorum overlap and fencing tokens (runnable)
// 1) With N=3, W=2, R=2 every read set overlaps every write set. 2) Storage rejects writes from a stale leader.
function combos(n, k, start = 0, acc = []) { if (acc.length === k) return [acc]; const out = []; for (let i = start; i < n; i++) out.push(...combos(n, k, i + 1, [...acc, i])); return out; }
function alwaysOverlap(n, w, r) { return combos(n, w).every((ws) => combos(n, r).every((rs) => rs.some((x) => ws.includes(x)))); }
console.log('N=3 W=2 R=2 overlap:', alwaysOverlap(3, 2, 2), '| N=3 W=1 R=1 overlap:', alwaysOverlap(3, 1, 1));
console.log(alwaysOverlap(3, 2, 2) && !alwaysOverlap(3, 1, 1) ? '✅ R + W > N guarantees a read sees the latest write' : '❌ FAIL');
function fencedStorage() {
  let highest = 0; const log = [];
  return { write(token, value) { if (token < highest) return log.push(`rejected ${value} (token ${token} < ${highest})`) && false; highest = token; log.push(`accepted ${value} (token ${token})`); return true; }, log };
}
const store = fencedStorage();
store.write(33, 'A: balance=100');            // A is leader with token 33
store.write(34, 'B: balance=80');             // A paused, lease expired, B is the new leader
const zombie = store.write(33, 'A: balance=120');  // A wakes up and writes with its old token
store.log.forEach((l) => console.log('  ' + l));
console.log(zombie === false ? '✅ the zombie leader\'s write is fenced off' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Building leader election with a Redis `SET NX` and no fencing, then trusting it for correctness.
- Even-sized clusters (2 or 4 nodes) for consensus.
- Assuming a lock holder can't be paused (GC, VM steal, swapping).
- Reading from a follower and expecting linearizable results.
- Failing over automatically without checking replication lag (losing acknowledged writes).
:::

::: understand
- A majority decides leaders and commits; leases expire; fencing tokens stop old leaders from writing after they lose leadership.
:::

::: ask
- *"What happens if the leader freezes for 30 seconds and then wakes up?"*
:::

::: important ⭐ Say this in the interview
"Most systems use single-leader replication: the leader takes writes and ships its log to followers, and failover promotes one. Leaderless stores use quorums, where reading R and writing W of N replicas with R plus W greater than N guarantees overlap. Leader election and locks need consensus like Raft, where a majority votes, so a minority partition can't make progress; I use etcd, ZooKeeper or the database's failover rather than building it. Because a paused leader can come back believing it still leads, leadership is a lease and every protected write carries an increasing fencing token that storage checks."
:::

::: links
The Raft consensus algorithm (visual guide) | https://raft.github.io/
Martin Kleppmann: How to do distributed locking | https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
:::

=== How do you keep data consistent across services? (2PC vs sagas, compensations, orchestration vs choreography)
@p 3
@tags distributed-transactions, saga, 2pc, microservices, consistency
@quick
- One database → use a normal **ACID transaction**. Several services/databases → no shared transaction.
- **2PC** (two-phase commit): a coordinator asks all participants to *prepare*, then *commit*; locks are held across services and it **blocks** if the coordinator dies. Rare between microservices.
- **Saga**: a sequence of **local transactions**, each with a **compensating action** (refund, release stock, cancel). The system is eventually consistent; there are no global locks.
- **Orchestration** (one coordinator, e.g. Temporal, Step Functions) is easier to follow; **choreography** (services react to events) is looser but harder to trace.
- Every step must be **idempotent** and published reliably (transactional **outbox**); design states like `PENDING → CONFIRMED / CANCELLED`.

::: text 🧒 In simple words
Booking a trip: flight, hotel and car from three companies. You can't lock all three at once. A **saga** books them one by one, and if the car fails you **cancel the hotel and the flight** (compensations). Meanwhile the trip shows "booking in progress", not "confirmed".
:::

::: text 📖 Detailed answer
### 2PC vs saga
| | 2PC | Saga |
|---|---|---|
| Atomicity | all-or-nothing | eventual, via compensations |
| Isolation | locks held until commit | none: others may see intermediate states |
| Failure of coordinator | participants block holding locks | orchestrator state is persisted; resumes |
| Latency | slow (two round trips, locks) | each step commits locally |
| Where used | inside one DB engine, XA in legacy systems | microservices, external APIs (payments) |

### An order saga
| Step | Local transaction | Compensation |
|---|---|---|
| 1 | create order `PENDING` | mark order `CANCELLED` |
| 2 | reserve stock | release stock |
| 3 | charge card | refund |
| 4 | mark order `CONFIRMED` | — |

If step 3 fails, run compensations 2 → 1 backwards. Payments often come last because refunds are the most expensive compensation.

### Orchestration vs choreography
| | Orchestration | Choreography |
|---|---|---|
| Control | a coordinator calls each step | each service listens and emits events |
| Visibility | one place shows the state | state spread across services |
| Coupling | orchestrator knows all steps | services know only events |
| Tools | Temporal, AWS Step Functions, a state machine table | Kafka/SNS/EventBridge events |

### Handling the lack of isolation
- Semantic locks: `PENDING` status that other flows respect.
- Commutative updates (increments) where possible.
- Re-check before final steps (price or stock changed?).
:::

::: diagram Orchestrated order saga with a failure
sequenceDiagram
  participant O as "order orchestrator"
  participant ORD as "orders"
  participant INV as "inventory"
  participant PAY as "payments"
  O->>ORD: create order (PENDING)
  O->>INV: reserve stock
  INV-->>O: reserved
  O->>PAY: charge card
  PAY-->>O: declined
  O->>INV: release stock (compensate)
  O->>ORD: cancel order (compensate)
:::

::: image Distributed transactions: 2PC vs saga
/images/system-design/saga.svg
:::

::: text 🪜 Step by step
1. Keep each service's changes in its own local transaction.
2. List the saga steps and a compensation for each one that can be undone.
3. Persist saga state (orchestrator table or workflow engine) so a crash can resume.
4. Make every step and compensation idempotent (keyed by saga/order id).
5. Publish events with a transactional outbox; consume with retries and DLQs.
6. Expose intermediate states to the UI (`PENDING`) and alert on sagas stuck too long.
:::

::: code javascript An orchestrated saga with compensations (runnable)
async function runSaga(steps, ctx) {
  const done = [];
  for (const step of steps) {
    try { await step.run(ctx); done.push(step); ctx.log.push(`✔ ${step.name}`); }
    catch (e) {
      ctx.log.push(`✖ ${step.name}: ${e.message}`);
      for (const s of done.reverse()) if (s.compensate) { await s.compensate(ctx); ctx.log.push(`↩ ${s.name} compensated`); }
      return { ok: false, ctx };
    }
  }
  return { ok: true, ctx };
}
const make = (cardOk) => {
  const state = { order: null, stock: 5, charged: 0, log: [] };
  const steps = [
    { name: 'create order', run: async (c) => { c.order = 'PENDING'; }, compensate: async (c) => { c.order = 'CANCELLED'; } },
    { name: 'reserve stock', run: async (c) => { c.stock -= 1; }, compensate: async (c) => { c.stock += 1; } },
    { name: 'charge card', run: async (c) => { if (!cardOk) throw new Error('card declined'); c.charged = 1999; }, compensate: async (c) => { c.charged = 0; } },
    { name: 'confirm order', run: async (c) => { c.order = 'CONFIRMED'; } },
  ];
  return runSaga(steps, state);
};
(async () => {
  const ok = await make(true), bad = await make(false);
  console.log('happy path:', ok.ctx.log.join(' → '));
  console.log('declined  :', bad.ctx.log.join(' → '));
  console.log(ok.ok && ok.ctx.order === 'CONFIRMED' && ok.ctx.stock === 4 ? '✅ all steps committed' : '❌ FAIL');
  console.log(!bad.ok && bad.ctx.order === 'CANCELLED' && bad.ctx.stock === 5 && bad.ctx.charged === 0 ? '✅ compensations restored stock and cancelled the order' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Calling three services in a row in one HTTP handler with no recovery when the second fails.
- Compensations that aren't idempotent (refunding twice on a retry).
- Publishing an event outside the DB transaction ("saved but never published").
- Showing `CONFIRMED` before the saga finishes.
- Using 2PC across services and blocking everything when the coordinator is down.
:::

::: understand
- Across services, consistency comes from local transactions plus compensations, reliable events and idempotency, not from a global lock.
:::

::: ask
- *"Which step is hardest to undo, and should it go last?"*
:::

::: important ⭐ Say this in the interview
"Inside one database I use a normal transaction. Across services there's no shared transaction, and two-phase commit holds locks across services and blocks if the coordinator fails, so I use a saga: a sequence of local transactions, each with a compensation, like create the order as pending, reserve stock, charge the card and confirm, and if the charge fails release the stock and cancel the order. I prefer orchestration with persisted state for visibility, make every step and compensation idempotent, publish events through an outbox, and show intermediate states like pending in the UI."
:::

::: links
microservices.io: Saga pattern | https://microservices.io/patterns/data/saga.html
Temporal: What is a durable workflow? | https://docs.temporal.io/workflows
:::

=== How do you handle time, ordering and "exactly once" in distributed systems?
@p 2
@tags distributed-systems, ordering, clocks, idempotency, exactly-once, lamport
@quick
- **Wall clocks drift** (milliseconds to seconds between servers); "last write wins" by timestamp can silently drop the real last write.
- **Logical clocks**: Lamport counters order causally related events; vector clocks also detect concurrent writes.
- Order **per key**, not globally: Kafka partition key, SQS FIFO message group, a per-conversation sequence number.
- Measured (20 concurrent senders, 2,000 messages): `SELECT max(seq)+1` then `INSERT` produced **1,869 duplicate sequence numbers**; an atomic `UPDATE … SET last_seq = last_seq + 1 RETURNING` produced **0** (4,972 msgs/s).
- "Exactly once" = **at-least-once delivery + idempotent processing** (dedupe table, idempotency keys, upserts, conditional writes).

::: text 🧒 In simple words
Every office clock shows a slightly different time, so "who wrote last?" by clock time is unreliable. Instead you number the tickets at **one counter** (sequence numbers) or pass a **counter that only goes up** with every message (logical clock). And because the post office may deliver a letter twice, you keep a list of letter numbers you've already handled.
:::

::: text 📖 Detailed answer
### Why clocks are a problem
| Issue | Effect |
|---|---|
| clock skew between servers | event B timestamped before event A even though it happened after |
| NTP jumps / leap seconds | time goes backwards |
| last-write-wins by timestamp | concurrent edits lost silently |

Use timestamps for display and TTLs, not for deciding order or winners of important writes.

### Ordering tools
| Tool | Gives |
|---|---|
| single DB sequence / counter row | total order per key, simple |
| Kafka partition key | order within a partition |
| SQS FIFO message group id | order within a group |
| Lamport clock | if A caused B then L(A) < L(B) |
| vector clock / version vector | detects concurrent (conflicting) updates |
| version column (optimistic locking) | rejects updates based on stale reads |

### Measured: per-conversation sequence numbers (Postgres 17)
| Approach | 2,000 messages from 20 concurrent senders | Duplicates |
|---|---|---|
| `SELECT max(seq)+1`, then `INSERT` | 214 ms | **1,869** (only 131 distinct numbers) |
| `UPDATE conversations SET last_seq = last_seq + 1 … RETURNING`, then insert | 402 ms | **0** |

The atomic counter serialises writers per conversation (a row lock), which is exactly the ordering you want, and still did ~5,000 messages a second on one row. Add a unique constraint `(conversation_id, seq)` as a safety net.

### Exactly once
Networks and queues give at-most-once or at-least-once. To get the *effect* of exactly once:
- dedupe by message id / idempotency key (unique constraint, `ON CONFLICT DO NOTHING`);
- make operations idempotent (`SET status = 'paid'` not `balance = balance + 10` without a key);
- commit the consumer offset and the side effect together where possible (transactions, outbox/inbox tables).
:::

::: diagram Lamport clocks across two services
sequenceDiagram
  participant A as "service A (clock 0)"
  participant B as "service B (clock 0)"
  A->>A: local event → clock 1
  A->>B: message with clock 1
  B->>B: receive → max(0, 1) + 1 = 2
  B->>B: local event → clock 3
  B->>A: message with clock 3
  A->>A: receive → max(1, 3) + 1 = 4
:::

::: image Time, ordering and exactly-once (with the measured sequence race)
/images/system-design/ordering.svg
:::

::: text 🪜 Step by step
1. Decide where ordering matters (per conversation, per account, per order) and pick that as the key.
2. Assign order at one place per key: an atomic counter, a partition, a FIFO group.
3. Add uniqueness constraints that make duplicates impossible.
4. Give every message/command an id; dedupe on the consumer.
5. Use version columns for concurrent edits instead of timestamps.
6. Let clients reconnect with "everything after seq N".
:::

::: code sql Atomic per-conversation sequence numbers
CREATE TABLE conversations (id bigint PRIMARY KEY, last_seq bigint NOT NULL DEFAULT 0);
CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id),
  seq bigint NOT NULL,
  client_msg_id uuid NOT NULL,                -- idempotency key from the sender
  body text NOT NULL,
  UNIQUE (conversation_id, seq),
  UNIQUE (conversation_id, client_msg_id)     -- a retried send can't create a second message
);

-- assign the next number and insert in one statement (row lock serialises senders per conversation)
WITH c AS (UPDATE conversations SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq)
INSERT INTO messages (conversation_id, seq, client_msg_id, body)
SELECT $1, last_seq, $2, $3 FROM c
ON CONFLICT (conversation_id, client_msg_id) DO NOTHING
RETURNING seq;
:::

::: code javascript Lamport clocks and idempotent consumers (runnable)
class Node {
  constructor(name) { this.name = name; this.clock = 0; this.events = []; }
  local(what) { this.clock++; this.events.push([this.clock, what]); return this.clock; }
  send(what) { this.clock++; this.events.push([this.clock, 'send ' + what]); return { what, clock: this.clock }; }
  receive(msg) { this.clock = Math.max(this.clock, msg.clock) + 1; this.events.push([this.clock, 'recv ' + msg.what]); return this.clock; }
}
const a = new Node('A'), b = new Node('B');
a.local('create order'); const m1 = a.send('OrderPlaced');
b.local('unrelated'); b.local('unrelated'); b.local('unrelated');
const recv = b.receive(m1); const m2 = b.send('StockReserved'); a.receive(m2);
console.log('A:', a.events, 'B:', b.events);
console.log(m1.clock < recv && recv < m2.clock ? '✅ causally related events get increasing Lamport times' : '❌ FAIL');
// idempotent consumer: at-least-once delivery, exactly-once effect
const processed = new Set(); let balance = 0;
const consume = (msg) => { if (processed.has(msg.id)) return 'duplicate ignored'; processed.add(msg.id); balance += msg.amount; return 'applied'; };
const deliveries = [{ id: 'pay-1', amount: 10 }, { id: 'pay-2', amount: 5 }, { id: 'pay-1', amount: 10 }];   // pay-1 redelivered
deliveries.forEach((d) => console.log(d.id, consume(d)));
console.log(balance === 15 ? '✅ redelivery did not double-apply the payment' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `SELECT max(id)+1` to generate numbers: duplicates under concurrency (measured 1,869 of 2,000).
- Ordering events from several servers by their wall-clock timestamps.
- Promising "exactly-once delivery" instead of idempotent processing.
- Global ordering when per-key ordering is enough (it kills parallelism).
- Dedupe sets in memory only (lost on restart); store processed ids with a TTL.
:::

::: understand
- Don't trust clocks for ordering; order per key at one place, and make processing idempotent so duplicates are harmless.
:::

::: ask
- *"Does this need a global order, or only an order per user, conversation or account?"*
:::

::: important ⭐ Say this in the interview
"Wall clocks drift between machines, so I never decide order or the winner of a write by timestamp. I order per key, using an atomic per-conversation counter, a Kafka partition key or an SQS FIFO group, and logical clocks or version numbers when I need causality or conflict detection. In a test with 20 concurrent senders, select max plus one produced 1,869 duplicate sequence numbers out of 2,000 while an atomic update-returning counter produced none. And exactly-once is really at-least-once delivery plus idempotent processing: message ids, unique constraints and dedupe tables."
:::

::: links
Leslie Lamport: Time, Clocks, and the Ordering of Events | https://lamport.azurewebsites.net/pubs/time-clocks.pdf
Confluent: Exactly-once semantics in Kafka | https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/
:::
