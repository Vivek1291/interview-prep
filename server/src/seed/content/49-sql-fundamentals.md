@section SQL Fundamentals
@icon 🧾
@color #6366f1
@desc Relational basics every backend interview expects: tables, keys and constraints, joins (with real output), normalisation, indexes and EXPLAIN (measured on 1M rows), ACID transactions, isolation levels and their anomalies (measured), and common slow-query patterns. Run on PostgreSQL 17.

=== Tables, primary keys, foreign keys and constraints: what do they guarantee?
@p 3
@tags sql, schema, constraints, primary-key, foreign-key
@quick
- A **primary key** uniquely identifies a row (unique + not null); prefer surrogate keys (`bigint` identity or UUID) over business values that can change.
- A **foreign key** guarantees the referenced row exists: measured `INSERT … user_id = 99` failed with *violates foreign key constraint* because user 99 doesn't exist.
- `UNIQUE`, `NOT NULL`, `CHECK (qty > 0)`, `DEFAULT` move rules into the database, where they hold even under **concurrent** requests and bugs.
- `ON DELETE CASCADE` deletes children; `RESTRICT` (default) refuses; `SET NULL` keeps them orphaned on purpose.
- Relationships: one-to-many (FK on the "many" side), many-to-many (a **join table** with a composite primary key).

::: text 🧒 In simple words
Constraints are the **rules printed on the form itself**: "this box is required", "this number must be positive", "this customer number must exist in the customer list". Even if a clerk (your app) is careless, the form won't accept a wrong entry.
:::

::: text 📖 Detailed answer
### Building blocks
| Concept | Example | Guarantees |
|---|---|---|
| Primary key | `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | one row per id |
| Foreign key | `user_id bigint NOT NULL REFERENCES users(id)` | no orphan orders |
| Unique | `email text UNIQUE` | no duplicate accounts, even with races |
| Not null | `status text NOT NULL` | value always present |
| Check | `CHECK (status IN ('pending','paid','shipped','cancelled'))` | allowed values |
| Default | `created_at timestamptz NOT NULL DEFAULT now()` | sensible value when omitted |

### Relationships
| Type | Modelled as | Example |
|---|---|---|
| One-to-one | FK + `UNIQUE` | `user_profiles.user_id` |
| One-to-many | FK on the child | `orders.user_id → users.id` |
| Many-to-many | join table with composite PK | `order_items (order_id, product_id)` |

### Why constraints beat application checks
Application code checks "is the email taken?" then inserts; two requests at the same time both pass the check. A `UNIQUE` index rejects the second insert atomically, and your code turns error `23505` into a 409.

### Natural vs surrogate keys
Emails, phone numbers and SKUs change; use them as `UNIQUE` columns, not as the primary key. UUIDv7 or identity columns are good surrogate keys (UUIDv4 random keys fragment B-tree indexes).
:::

::: diagram Orders schema
erDiagram
  USERS ||--o{ ORDERS : places
  ORDERS ||--|{ ORDER_ITEMS : contains
  PRODUCTS ||--o{ ORDER_ITEMS : "appears in"
  USERS {
    bigint id PK
    text email UK
    text country
  }
  ORDERS {
    bigint id PK
    bigint user_id FK
    text status
    int total_cents
  }
  ORDER_ITEMS {
    bigint order_id PK
    bigint product_id PK
    int qty
  }
  PRODUCTS {
    bigint id PK
    text sku UK
    int stock
  }
:::

::: image Tables, keys and constraints
/images/sql/schema-constraints.svg
:::

::: text 🪜 Step by step
Two sign-ups with the same email arrive at the same millisecond:
1. Both requests run `SELECT 1 FROM users WHERE email = $1` → both see nothing.
2. Both run `INSERT INTO users …`.
3. The `UNIQUE` index lets the first commit and makes the second fail with `23505 unique_violation`.
4. The repository maps `23505` to `ConflictError('EMAIL_TAKEN')` → 409.
5. Without the constraint you'd have two accounts with one email and a data clean-up job.
:::

::: code sql Schema with keys and constraints (PostgreSQL)
CREATE TABLE users (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  name        text NOT NULL,
  country     char(2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku         text NOT NULL UNIQUE,
  name        text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_id_idx ON orders (user_id);          -- PostgreSQL does NOT index foreign keys automatically

CREATE TABLE order_items (
  order_id    bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  bigint NOT NULL REFERENCES products (id),
  qty         integer NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, product_id)                          -- many-to-many join table
);

-- measured: INSERT INTO orders (user_id, status, total_cents) VALUES (99, 'pending', 10);
-- ERROR: insert or update on table "orders" violates foreign key constraint "orders_user_id_fkey"
:::

::: code javascript What a UNIQUE constraint does under concurrency (runnable)
// Application-level check vs database constraint when two requests interleave.
async function signup(db, email, useConstraint) {
  const exists = db.rows.some((r) => r.email === email);
  await new Promise((r) => setTimeout(r, 2));                                 // the other request runs here
  if (exists) return 'taken (app check)';
  if (useConstraint && db.rows.some((r) => r.email === email)) return '409: 23505 unique_violation';   // the index re-checks at insert
  db.rows.push({ email });
  return 'created';
}
(async () => {
  const noConstraint = { rows: [] }, withConstraint = { rows: [] };
  const a = await Promise.all([signup(noConstraint, 'asha@example.com', false), signup(noConstraint, 'asha@example.com', false)]);
  const b = await Promise.all([signup(withConstraint, 'asha@example.com', true), signup(withConstraint, 'asha@example.com', true)]);
  console.log({ appCheckOnly: a, withUniqueIndex: b });
  console.log('app check alone creates duplicates', noConstraint.rows.length === 2 ? '✅ (this is the bug)' : '❌ FAIL');
  console.log('unique constraint keeps one row', withConstraint.rows.length === 1 && b.includes('409: 23505 unique_violation') ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Relying on "check then insert" in code instead of `UNIQUE`.
- Forgetting that PostgreSQL doesn't index foreign key columns (slow joins and deletes).
- Using email or SKU as the primary key.
- `ON DELETE CASCADE` on important data (one delete wipes history).
- Storing money as floating point (use integer cents or `numeric`).
:::

::: understand
- Constraints are business rules the database enforces atomically, for every client, forever.
:::

::: ask
- *"What must never be true in this data, even if the code has a bug?"* Make that a constraint.
:::

::: important ⭐ Say this in the interview
"A primary key uniquely identifies each row, and I prefer surrogate keys like identity columns so business values can change. Foreign keys guarantee referenced rows exist: inserting an order for a non-existent user fails with a foreign key violation. I put rules into UNIQUE, NOT NULL, CHECK and DEFAULT constraints because they hold under concurrency, where 'check then insert' in code doesn't, and I translate violations like 23505 into proper API errors. One-to-many puts the foreign key on the child, many-to-many uses a join table with a composite key, and in Postgres I index foreign key columns myself."
:::

::: links
PostgreSQL: Constraints | https://www.postgresql.org/docs/current/ddl-constraints.html
PostgreSQL: Error codes | https://www.postgresql.org/docs/current/errcodes-appendix.html
:::

=== SQL joins: INNER, LEFT, RIGHT, FULL, self and anti-joins (with real output)
@p 3
@tags sql, joins, queries
@quick
- **INNER JOIN**: only rows that match on both sides. **LEFT JOIN**: all left rows, `NULL`s where the right side has no match. **RIGHT**: the mirror. **FULL OUTER**: everything.
- Real output with users (Asha, Ben, Chen) and orders (Asha ×2, Ben ×1, one with no user): INNER **3 rows**, LEFT **4** (Chen with NULL), RIGHT **4** (orphan order), FULL **5**.
- **Anti-join**: `LEFT JOIN … WHERE right.id IS NULL` finds rows without a match (users with no orders → Chen), same as `NOT EXISTS`.
- Count with `count(o.id)`, not `count(*)`, after a LEFT JOIN: measured `count(*)` reported **1** order for Chen instead of **0**.
- **Self join** relates rows in the same table (employee → manager); **CROSS JOIN** = every combination.

::: text 🧒 In simple words
Two class lists: students and their library cards. **INNER** = students who have a card. **LEFT** = every student, with an empty space when they have no card. **FULL** = every student and every card, even a card whose owner left the school. **Anti-join** = students who still need a card.
:::

::: text 📖 Detailed answer
### Sample data
`users`: 1 Asha, 2 Ben, 3 Chen · `orders`: 10 (Asha, 500), 11 (Asha, 250), 12 (Ben, 900), 13 (no user, 100)

### Real output (PostgreSQL 17)
| Join | Rows returned |
|---|---|
| `users JOIN orders` | Asha 10, Asha 11, Ben 12 → **3** |
| `users LEFT JOIN orders` | Asha 10, Asha 11, Ben 12, Chen NULL → **4** |
| `users RIGHT JOIN orders` | Asha 10, Asha 11, Ben 12, NULL 13 → **4** |
| `users FULL JOIN orders` | all of the above → **5** |
| `LEFT JOIN … WHERE o.id IS NULL` | Chen → **1** |

### Aggregates after a LEFT JOIN
| Query | Asha | Ben | Chen |
|---|---|---|---|
| `count(o.id)`, `coalesce(sum(o.total), 0)` | 2, 750 | 1, 900 | **0, 0** |
| `count(*)` | 2 | 1 | **1** ❗ (counts the NULL row) |

### Rules of thumb
- Put conditions on the right table in the `ON` clause for LEFT JOINs; in `WHERE` they turn it into an INNER JOIN.
- One-to-many joins multiply rows: aggregate (`GROUP BY`) or use `EXISTS` when you only need "has any".
- Join on indexed columns (the FK side especially).
:::

::: diagram Join types
flowchart LR
  I["INNER: matches only"] --> L["LEFT: all left rows plus matches"]
  L --> F["FULL: all rows from both"]
  L --> A["anti-join: LEFT JOIN where right is NULL"]
:::

::: image SQL joins
/images/sql/joins.svg
:::

::: text 🪜 Step by step
"Customers who haven't ordered in 90 days" (re-engagement email):
1. Start from `users u` (everyone).
2. `LEFT JOIN orders o ON o.user_id = u.id AND o.created_at > now() - interval '90 days'` (date condition in `ON`!).
3. `WHERE o.id IS NULL` keeps users with no recent order.
4. Equivalent and often clearer: `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.created_at > …)`.
5. Index `orders (user_id, created_at)` makes it fast.
:::

::: code sql The join queries behind the output above
SELECT u.name, o.id FROM users u JOIN orders o ON o.user_id = u.id;              -- 3 rows
SELECT u.name, o.id FROM users u LEFT JOIN orders o ON o.user_id = u.id;         -- 4 rows (Chen, NULL)
SELECT u.name, o.id FROM users u RIGHT JOIN orders o ON o.user_id = u.id;        -- 4 rows (NULL, 13)
SELECT u.name, o.id FROM users u FULL JOIN orders o ON o.user_id = u.id;         -- 5 rows

-- anti-join: users without orders
SELECT u.name FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL;   -- Chen
SELECT u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- aggregates: count(o.id) ignores NULLs, count(*) doesn't
SELECT u.name, count(o.id) AS orders, coalesce(sum(o.total_cents), 0) AS spent
  FROM users u LEFT JOIN orders o ON o.user_id = u.id
 GROUP BY u.name;                                                                 -- Chen: 0, 0

-- self join: employees and their managers
SELECT e.name AS employee, m.name AS manager
  FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;
:::

::: code javascript Joins implemented over arrays (runnable)
const users = [{ id: 1, name: 'Asha' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Chen' }];
const orders = [{ id: 10, userId: 1, total: 500 }, { id: 11, userId: 1, total: 250 }, { id: 12, userId: 2, total: 900 }, { id: 13, userId: null, total: 100 }];
const inner = users.flatMap((u) => orders.filter((o) => o.userId === u.id).map((o) => [u.name, o.id]));
const left = users.flatMap((u) => { const m = orders.filter((o) => o.userId === u.id); return m.length ? m.map((o) => [u.name, o.id]) : [[u.name, null]]; });
const right = orders.map((o) => [users.find((u) => u.id === o.userId)?.name ?? null, o.id]);
const full = [...left, ...right.filter(([name]) => name === null)];
const anti = users.filter((u) => !orders.some((o) => o.userId === u.id)).map((u) => u.name);
console.log({ inner: inner.length, left: left.length, right: right.length, full: full.length, anti });
console.log('row counts match PostgreSQL (3, 4, 4, 5)', [inner, left, right, full].map((r) => r.length).join() === '3,4,4,5' ? '✅' : '❌ FAIL');
const countStar = (name) => left.filter(([n]) => n === name).length;
const countId = (name) => left.filter(([n, id]) => n === name && id !== null).length;
console.log('Chen: count(*) =', countStar('Chen'), 'count(o.id) =', countId('Chen'), countStar('Chen') === 1 && countId('Chen') === 0 ? '✅ the count(*) trap' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Filtering the right table in `WHERE` after a LEFT JOIN (silently becomes INNER).
- `count(*)` after a LEFT JOIN (counts the NULL row).
- Joining two one-to-many tables at once and summing (row multiplication inflates totals).
- Joining on unindexed columns.
- `SELECT DISTINCT` to hide duplicate rows instead of fixing the join.
:::

::: understand
- Decide which side must keep all rows; that decides INNER vs LEFT.
:::

::: ask
- *"Should rows without a match appear in the result?"*
:::

::: important ⭐ Say this in the interview
"INNER JOIN keeps only matching rows, LEFT JOIN keeps every row from the left with NULLs where nothing matches, RIGHT is the mirror and FULL keeps both sides. With three users and four orders, one without a user, Postgres returned 3, 4, 4 and 5 rows respectively. An anti-join, LEFT JOIN where the right id is NULL or NOT EXISTS, finds users without orders. Two traps I watch for: a WHERE condition on the right table turns a LEFT JOIN into an INNER one, and count(*) after a LEFT JOIN counts the NULL row, which reported one order for a user with none, so I use count of the right table's id."
:::

::: links
PostgreSQL tutorial: Joins between tables | https://www.postgresql.org/docs/current/tutorial-join.html
PostgreSQL: Table expressions (joined tables) | https://www.postgresql.org/docs/current/queries-table-expressions.html
:::

=== What is normalisation (1NF, 2NF, 3NF), and when do you denormalise?
@p 2
@tags sql, normalization, schema-design
@quick
- Normalisation removes **duplicate facts** so each fact is stored once: no update anomalies (change a customer's city in one place).
- **1NF**: atomic values, no repeating groups (no `tags = 'a,b,c'`, no `item1, item2` columns). **2NF**: no column depends on only *part* of a composite key. **3NF**: no column depends on another non-key column.
- Quick test for 3NF: "every non-key column depends on the key, the whole key, and nothing but the key".
- **Denormalise on purpose** for read performance or history: an order line keeps the `price_paid` (a snapshot), dashboards use summary tables or materialised views.
- Every denormalised copy needs an owner and a sync mechanism (trigger, job, event).

::: text 🧒 In simple words
If your address is written on 50 different forms, moving house means updating 50 forms, and you'll miss some. Normalisation is writing the address **once** in your profile and having the forms **point to it**. Denormalisation is deliberately keeping a copy on the receipt, because the receipt should show where it was *delivered*, even after you move.
:::

::: text 📖 Detailed answer
### Starting point (unnormalised)
`orders_flat(order_id, customer_email, customer_city, product_name, product_price, qty, tags)` with `tags = 'gift,express'`.

### The steps
| Form | Rule | Fix in the example |
|---|---|---|
| 1NF | atomic values, no repeating groups | `order_tags(order_id, tag)` table instead of a comma list |
| 2NF | non-key columns depend on the whole key | with key `(order_id, product_id)`, `product_name` depends only on `product_id` → `products` table |
| 3NF | no transitive dependencies | `customer_city` depends on the customer, not the order → `customers` table |

### Anomalies normalisation prevents
| Anomaly | Example in the flat table |
|---|---|
| Update | product renamed → must update thousands of rows |
| Insert | can't add a product until someone orders it |
| Delete | deleting the last order of a product loses the product |

### When to denormalise
| Case | Technique |
|---|---|
| Historical truth | snapshot columns (`price_paid`, `shipping_address` on the order) |
| Expensive aggregations | summary tables, materialised views, counters (`orders_count` on users) |
| Read-heavy listing pages | cached/duplicated display fields (`author_name` on posts) with an update path |
| Analytics | star schema in a warehouse, not in the OLTP database |
:::

::: diagram From flat table to 3NF
flowchart LR
  F["orders_flat"] --> C["customers: email, city"]
  F --> O["orders: customer_id, created_at"]
  F --> P["products: name, price"]
  F --> I["order_items: order_id, product_id, qty, price_paid"]
  F --> T["order_tags: order_id, tag"]
:::

::: image Normalisation: 1NF, 2NF, 3NF
/images/sql/normalization.svg
:::

::: text 🪜 Step by step
Designing an orders schema in an interview:
1. List the entities: customers, products, orders, order lines.
2. Give each a primary key and move each fact to the entity it describes.
3. Model many-to-many (orders ↔ products) with `order_items`.
4. Decide what must be **snapshotted**: price at purchase time, shipping address.
5. Mention read optimisations you'd add later (indexes first, then summary tables or caches) with how they stay in sync.
:::

::: code sql Normalised schema with deliberate snapshots
-- 3NF entities
CREATE TABLE customers (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL UNIQUE, city text NOT NULL);
CREATE TABLE products  (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, price_cents int NOT NULL CHECK (price_cents > 0));
CREATE TABLE orders    (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id bigint NOT NULL REFERENCES customers (id),
                        shipping_city text NOT NULL,                   -- snapshot: where THIS order went
                        created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE order_items (order_id bigint REFERENCES orders (id) ON DELETE CASCADE, product_id bigint REFERENCES products (id),
                          qty int NOT NULL CHECK (qty > 0),
                          price_paid_cents int NOT NULL,              -- snapshot: price at purchase time
                          PRIMARY KEY (order_id, product_id));
CREATE TABLE order_tags (order_id bigint REFERENCES orders (id) ON DELETE CASCADE, tag text NOT NULL, PRIMARY KEY (order_id, tag));   -- 1NF

-- deliberate denormalisation for a dashboard, refreshed by a job
CREATE MATERIALIZED VIEW daily_revenue AS
  SELECT date_trunc('day', o.created_at) AS day, sum(i.qty * i.price_paid_cents) AS revenue_cents
    FROM orders o JOIN order_items i ON i.order_id = o.id GROUP BY 1;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;   (needs a unique index on day)
:::

::: code javascript Update anomaly: flat rows vs normalised (runnable)
const flat = Array.from({ length: 1000 }, (_, i) => ({ orderId: i + 1, productId: 1 + (i % 3), productName: ['Desk', 'Chair', 'Lamp'][i % 3] }));
const products = new Map([[1, 'Desk'], [2, 'Chair'], [3, 'Lamp']]);
// Rename "Desk" → "Standing desk"
let flatWrites = 0; for (const row of flat) if (row.productId === 1) { row.productName = 'Standing desk'; flatWrites++; }
products.set(1, 'Standing desk'); const normalisedWrites = 1;
console.log({ flatWrites, normalisedWrites });
console.log('flat table needs one write per order row', flatWrites === 334 ? '✅' : '❌ FAIL');
// A missed row in the flat table = inconsistent data
flat[0].productName = 'Desk';
const names = new Set(flat.filter((r) => r.productId === 1).map((r) => r.productName));
console.log('one missed update → two names for one product', names.size === 2 ? '✅ (update anomaly)' : '❌ FAIL');
console.log('normalised: one source of truth', products.get(1) === 'Standing desk' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Comma-separated lists in a column (`tags = 'a,b'`): can't index, join or constrain them.
- Joining to the current product price for old orders (history changes).
- Denormalising "for speed" before measuring, with no plan to keep copies in sync.
- Over-normalising tiny lookup data into dozens of joins on hot paths.
- Treating MongoDB embedding and SQL normalisation as unrelated (same trade-off: read shape vs update cost).
:::

::: understand
- Store each fact once; copy it only on purpose, with an owner for the copy.
:::

::: ask
- *"Is this value a fact about this row, or a copy of a fact stored elsewhere?"*
:::

::: important ⭐ Say this in the interview
"Normalisation stores each fact once so updates can't leave data inconsistent. First normal form means atomic values and no repeating groups, second means no column depends on only part of a composite key, and third means no column depends on another non-key column: every column depends on the key, the whole key and nothing but the key. I normalise transactional data by default and denormalise deliberately: snapshotting the price paid and shipping address on orders, or using summary tables and materialised views for dashboards, always with a clear way to keep the copy in sync."
:::

::: links
Wikipedia: Database normalization | https://en.wikipedia.org/wiki/Database_normalization
PostgreSQL: Materialized views | https://www.postgresql.org/docs/current/rules-materializedviews.html
:::

=== How do indexes work, and how do you read EXPLAIN? (measured on 1M rows)
@p 3
@tags sql, indexes, explain, performance, postgresql
@quick
- A B-tree index is a sorted structure pointing to rows: lookups go from scanning everything (**O(n)**) to walking a tree (**O(log n)**).
- Measured: `orders WHERE user_id = 4242` **10.9 ms** (parallel seq scan of 1M rows) → **0.007 ms** with an index.
- `EXPLAIN (ANALYZE, BUFFERS)` shows the chosen plan, real time and rows: look for `Seq Scan` on big tables, `Rows Removed by Filter`, estimate vs actual rows, and `Sort` nodes.
- **Composite** indexes follow the left-most prefix: `(user_id, created_at)` serves `WHERE user_id = ? ORDER BY created_at DESC LIMIT 5` without a sort.
- Indexes cost writes and space (measured: the 1M-row orders table 65 MB, its `(user_id, created_at)` index 30 MB). Index for real queries only.

::: text 🧒 In simple words
An index is the **index at the back of a textbook**: to find "photosynthesis" you jump to the page instead of reading the whole book. But every time the book changes, the index must be updated too, so you only index the words people actually look up.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, 1M orders, 100k users, best of 3)
| Query | Plan | Time |
|---|---|---|
| `users WHERE email = …` | Index Scan (unique) | 0.007 ms |
| `orders WHERE user_id = 4242`, no index | Parallel Seq Scan, removed 333,330 rows per worker | **10.9 ms** |
| same, with `orders_user_id_idx` | Bitmap Index Scan | **0.007 ms** |
| `user_id = 4242 ORDER BY created_at DESC LIMIT 5`, user_id index | Bitmap scan → **Sort** | 0.015 ms |
| same with `(user_id, created_at DESC)` | Index Scan, no sort | 0.006 ms |
| `count(*) WHERE status = 'paid'` (25% of rows) | Seq Scan (index wouldn't help) | 19.6 ms |
| `orders JOIN users … ORDER BY created_at DESC LIMIT 100`, no index on created_at | Hash Join of everything + Sort | ~200 ms |
| same with index on `created_at` | Nested Loop over 100 rows | **1.7 ms** |

### Reading a plan
1. Read from the innermost node outwards.
2. `actual time` and `rows` vs estimated `rows`: big gaps mean stale statistics (`ANALYZE`).
3. `Seq Scan` + `Rows Removed by Filter` on a big table = missing or unusable index.
4. `Sort` / `Hash` with large memory or `external merge` = consider an index matching the ORDER BY.
5. `Buffers: shared read` = disk reads; `hit` = cache.

### Choosing indexes
- Columns in `WHERE`, `JOIN` and `ORDER BY` of frequent queries.
- Selective conditions (few matching rows); low-selectivity flags alone rarely help (use partial indexes).
- Composite order: equality columns first, then range/sort columns.
- Foreign keys (Postgres doesn't create them automatically).
:::

::: diagram How the planner uses an index
flowchart TD
  Q["WHERE user_id = 4242 ORDER BY created_at DESC LIMIT 5"] --> C{"index on user_id, created_at?"}
  C -->|"yes"| I["Index Scan: read 5 entries in order, stop"]
  C -->|"only user_id"| B["Bitmap scan of that user's rows, then Sort"]
  C -->|"none"| S["Seq Scan 1M rows, filter, sort"]
:::

::: image Indexes and query plans (measured)
/images/sql/indexes.svg
:::

::: chart bar Measured: ms for the same lookups with and without an index (1M rows)
Query,No index (ms),Index (ms)
orders by user_id,10.869,0.007
lower(email),18.213,0.008
:::

::: text 🪜 Step by step
Investigating a slow `GET /users/:id/orders`:
1. Take the SQL from the log; run `EXPLAIN (ANALYZE, BUFFERS)` with real parameters.
2. See `Parallel Seq Scan on orders … Rows Removed by Filter: 333330`.
3. Add `CREATE INDEX CONCURRENTLY orders_user_created_idx ON orders (user_id, created_at DESC)`.
4. Re-run: `Index Scan using orders_user_created_idx`, 0.006 ms.
5. Check write overhead and drop now-redundant indexes (a `(user_id, created_at)` index also serves `WHERE user_id = ?`).
:::

::: code sql EXPLAIN before and after an index
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at FROM orders WHERE user_id = 4242 ORDER BY created_at DESC LIMIT 5;
--  Limit
--    -> Sort  (Sort Key: created_at DESC)
--         -> Bitmap Heap Scan on orders  (Recheck Cond: (user_id = 4242))
--              -> Bitmap Index Scan on orders_user_id_idx
--  Execution Time: 0.015 ms        (without any index: Parallel Seq Scan, 10.9 ms)

CREATE INDEX CONCURRENTLY orders_user_created_idx ON orders (user_id, created_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at FROM orders WHERE user_id = 4242 ORDER BY created_at DESC LIMIT 5;
--  Limit
--    -> Index Scan using orders_user_created_idx on orders  (Index Cond: (user_id = 4242))
--  Execution Time: 0.006 ms

-- which indexes are never used? (candidates to drop)
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes ORDER BY idx_scan, pg_relation_size(indexrelid) DESC;
:::

::: code javascript Full scan vs sorted index lookup (runnable)
// A B-tree is a balanced, sorted structure; binary search over a sorted array shows the same O(log n) idea.
const N = 1_000_000;
const rows = Array.from({ length: N }, (_, i) => ({ id: i + 1, userId: (i * 7919) % 100000 }));
const index = rows.map((r, pos) => [r.userId, pos]).sort((a, b) => a[0] - b[0]);       // (user_id → row position)
let comparisons = 0;
function scan(userId) { const out = []; for (const r of rows) { comparisons++; if (r.userId === userId) out.push(r); } return out; }
function seek(userId) { let lo = 0, hi = index.length; while (lo < hi) { comparisons++; const mid = (lo + hi) >> 1; if (index[mid][0] < userId) lo = mid + 1; else hi = mid; } const out = []; for (let i = lo; i < index.length && index[i][0] === userId; i++) out.push(rows[index[i][1]]); return out; }
comparisons = 0; const a = scan(4242); const scanCost = comparisons;
comparisons = 0; const b = seek(4242); const seekCost = comparisons;
console.log({ matches: a.length, scanComparisons: scanCost, indexComparisons: seekCost });
console.log('same rows found', a.map((r) => r.id).sort().join() === b.map((r) => r.id).sort().join() ? '✅' : '❌ FAIL');
console.log('index needs ~log2(1M) = 20 steps instead of 1M', seekCost <= 21 && scanCost === N ? '✅ (measured 10.9 ms → 0.007 ms)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Adding an index per column instead of composite indexes that match real queries.
- Wrong column order in composite indexes (range column first).
- Indexing low-selectivity columns alone (`status`, booleans).
- Running `EXPLAIN` without `ANALYZE` and trusting estimates.
- Never dropping unused indexes (they slow every write).
:::

::: understand
- Index the shape of your frequent queries; prove it with EXPLAIN ANALYZE.
:::

::: ask
- *"What are the top 5 queries by total time?"* (`pg_stat_statements`) Index for those.
:::

::: important ⭐ Say this in the interview
"A B-tree index keeps column values sorted with pointers to rows, so a lookup walks a tree instead of scanning the table. On a million orders, filtering by user_id took 10.9 milliseconds with a parallel sequential scan and 0.007 with an index. I read plans with EXPLAIN ANALYZE and BUFFERS, looking for sequential scans with many rows removed, estimate versus actual mismatches and sort nodes. Composite indexes follow the left-most prefix rule, so (user_id, created_at) serves 'a user's latest orders' without a sort. Indexes cost space and write time, so I index real query patterns and drop unused ones."
:::

::: links
PostgreSQL: Using EXPLAIN | https://www.postgresql.org/docs/current/using-explain.html
Use The Index, Luke | https://use-the-index-luke.com/
:::

=== What are ACID transactions and isolation levels? (anomalies measured)
@p 3
@tags sql, transactions, acid, isolation, concurrency
@quick
- **ACID**: **Atomicity** (all or nothing), **Consistency** (constraints hold), **Isolation** (concurrent transactions don't see each other's partial work), **Durability** (committed data survives a crash, via the write-ahead log).
- PostgreSQL levels: **READ COMMITTED** (default), **REPEATABLE READ** (one snapshot for the whole transaction), **SERIALIZABLE** (as if transactions ran one at a time).
- Measured, another transaction commits stock 50 → 45 mid-way: READ COMMITTED read **50 then 45** and its write **overwrote** the change (final 44); REPEATABLE READ and SERIALIZABLE read 50 twice and the write **failed with 40001** → retry.
- **Write skew** (two doctors both go off call): REPEATABLE READ allowed it (**0 on call**); SERIALIZABLE aborted one (**1 on call**).
- Stricter levels mean more retries; most apps use READ COMMITTED + atomic updates / `FOR UPDATE`, and SERIALIZABLE for complex invariants.

::: text 🧒 In simple words
Isolation levels decide **what you see while others are editing the same document**. READ COMMITTED: you see their saved changes immediately, even halfway through your own work. REPEATABLE READ: you work on a **photocopy** taken when you started. SERIALIZABLE: the system acts like people took **turns**, and if that's impossible it asks one person to start over.
:::

::: text 📖 Detailed answer
### Anomalies
| Anomaly | What happens |
|---|---|
| Dirty read | read another transaction's uncommitted data (PostgreSQL never allows it) |
| Non-repeatable read | same row, two different values in one transaction |
| Phantom read | same query, new rows appear |
| Lost update | two read-modify-writes, one overwrites the other |
| Write skew | two transactions read overlapping data and write different rows, breaking an invariant |

### Measured (PostgreSQL 17)
| Level | Reads during the transaction | Its write | Final stock |
|---|---|---|---|
| READ COMMITTED | 50, then **45** | applied (overwrote the other change) | 44 |
| REPEATABLE READ | 50, then **50** | **40001** could not serialize access | 45 |
| SERIALIZABLE | 50, then **50** | **40001** | 45 |

Write skew ("at least one doctor on call", both check then go off call):
| Level | Result | Doctors on call |
|---|---|---|
| REPEATABLE READ | both commit | **0** (invariant broken) |
| SERIALIZABLE | second fails with 40001 | **1** |

### Practical guidance
- Default READ COMMITTED is fine when writes are **atomic** (`SET stock = stock - 1 WHERE stock > 0`) or rows are locked (`FOR UPDATE`).
- Use REPEATABLE READ for consistent multi-query reports.
- Use SERIALIZABLE for invariants spanning rows; **always retry** 40001.
- Keep transactions short; long ones hold locks and block VACUUM.
:::

::: diagram Snapshot vs fresh reads
sequenceDiagram
  participant A as Transaction A
  participant DB as Database
  participant B as Transaction B
  A->>DB: "BEGIN, read stock: 50"
  B->>DB: "UPDATE stock to 45, COMMIT"
  A->>DB: "read stock again"
  Note over A,DB: "READ COMMITTED sees 45, REPEATABLE READ still sees 50"
  A->>DB: "UPDATE stock"
  Note over A,DB: "READ COMMITTED overwrites, REPEATABLE READ fails 40001"
:::

::: image ACID and isolation levels (measured)
/images/sql/acid-isolation.svg
:::

::: text 🪜 Step by step
Transferring money between accounts:
1. `BEGIN`.
2. `UPDATE accounts SET balance = balance - 100 WHERE id = 1 AND balance >= 100` → check `rowCount`.
3. `UPDATE accounts SET balance = balance + 100 WHERE id = 2`.
4. `INSERT INTO transfers …`; `COMMIT` (atomic: both or neither, durable once committed).
5. Lock rows in a consistent order (lower id first) to avoid deadlocks; retry on 40001/40P01.
:::

::: code sql Reproducing the measured anomalies
-- Session A                                   -- Session B
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT stock FROM products WHERE sku = 'SKU-2';   -- 50
                                                UPDATE products SET stock = stock - 5 WHERE sku = 'SKU-2';  -- autocommit → 45
SELECT stock FROM products WHERE sku = 'SKU-2';   -- 45 (non-repeatable read)
UPDATE products SET stock = 44 WHERE sku = 'SKU-2';   -- computed from a stale value: lost update risk
COMMIT;

BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT stock FROM products WHERE sku = 'SKU-2';   -- 50
                                                UPDATE products SET stock = stock - 5 WHERE sku = 'SKU-2';
SELECT stock FROM products WHERE sku = 'SKU-2';   -- still 50 (snapshot)
UPDATE products SET stock = 49 WHERE sku = 'SKU-2';
-- ERROR: could not serialize access due to concurrent update   (SQLSTATE 40001) → ROLLBACK and retry
ROLLBACK;

-- write skew: run in two sessions at SERIALIZABLE; the second COMMIT fails with 40001
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;       -- 2, "safe to go off call"
UPDATE doctors SET on_call = false WHERE name = 'alice';
COMMIT;
:::

::: code javascript Snapshots vs fresh reads (runnable)
function run(level) {
  const db = { stock: 50, version: 1 };
  const tx = { snapshot: { ...db }, startVersion: db.version };
  const read = () => (level === 'READ COMMITTED' ? db.stock : tx.snapshot.stock);
  const r1 = read();
  db.stock -= 5; db.version++;                                         // another transaction commits
  const r2 = read();
  if (level !== 'READ COMMITTED' && db.version !== tx.startVersion) return { reads: [r1, r2], result: '40001 → retry', final: db.stock };
  db.stock = r2 - 1;                                                    // write based on what this transaction saw
  return { reads: [r1, r2], result: 'committed', final: db.stock };
}
const rc = run('READ COMMITTED'), rr = run('REPEATABLE READ');
console.log({ rc, rr });
console.log('READ COMMITTED: non-repeatable read, final 44', rc.reads.join() === '50,45' && rc.final === 44 ? '✅ (measured)' : '❌ FAIL');
console.log('REPEATABLE READ: same value twice, write rejected', rr.reads.join() === '50,50' && rr.result.startsWith('40001') && rr.final === 45 ? '✅ (measured)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Assuming transactions alone prevent lost updates at READ COMMITTED.
- Using SERIALIZABLE without retry logic.
- Long transactions (holding locks, blocking VACUUM, bloating tables).
- Mixing isolation level assumptions across ORMs (check the default your ORM uses).
- Forgetting MongoDB/other databases have different defaults and guarantees.
:::

::: understand
- Atomicity = all or nothing; isolation level = which concurrent changes you can see and what happens on conflict.
:::

::: ask
- *"What invariant must hold, and can two transactions break it by writing different rows?"*
:::

::: important ⭐ Say this in the interview
"ACID means a transaction is all or nothing, leaves constraints satisfied, is isolated from concurrent transactions and is durable once committed thanks to the write-ahead log. Postgres defaults to READ COMMITTED, where each statement sees the latest committed data. I tested it: when another transaction changed stock from 50 to 45 mid-way, READ COMMITTED read 50 then 45 and its write overwrote the change, while REPEATABLE READ and SERIALIZABLE kept reading 50 and failed the write with error 40001. For write skew, REPEATABLE READ let both doctors go off call and SERIALIZABLE aborted one. So I use atomic updates or row locks at READ COMMITTED, and SERIALIZABLE with retries for complex invariants."
:::

::: links
PostgreSQL: Transaction isolation | https://www.postgresql.org/docs/current/transaction-iso.html
PostgreSQL wiki: SSI (write skew examples) | https://wiki.postgresql.org/wiki/SSI
:::

=== Why is my SQL query slow? Common anti-patterns (measured)
@p 3
@tags sql, performance, query-optimization, pagination
@quick
- **Function on an indexed column** (`WHERE lower(email) = …`) can't use a plain index: measured **18.2 ms** → **0.008 ms** with an expression index on `lower(email)`.
- **Leading wildcard** `LIKE '%abc'` always scans (5.7 ms); even prefix `LIKE 'abc%'` scanned under the default `en_US.utf8` collation (3.75 ms) until a `text_pattern_ops` index (**0.083 ms**). Full-text or trigram (`pg_trgm`) for "contains" search.
- **Deep OFFSET** reads and throws away rows: `OFFSET 500000 LIMIT 20` **50.7 ms** vs keyset `WHERE created_at < $last LIMIT 20` **0.012 ms**.
- Other usual suspects: `SELECT *` of wide columns, N+1 queries, missing FK indexes, `OR` across columns, implicit casts, stale statistics.
- Find them with `pg_stat_statements`, slow-query logs (`log_min_duration_statement`) and `EXPLAIN ANALYZE`.

::: text 🧒 In simple words
A phone book is sorted by surname. Asking for "everyone whose surname **ends** with -son" or "everyone whose surname **in capitals** is SMITH" makes you read the whole book, even though the book has an order. Slow queries usually ask the question in a shape the index can't answer.
:::

::: text 📖 Detailed answer
### Measured (PostgreSQL 17, 100k users, 1M orders, best of 3)
| Query | Plan | Time |
|---|---|---|
| `lower(email) = …` (index on `email`) | Seq Scan | 18.2 ms |
| same, `CREATE INDEX … (lower(email))` | Index Scan | **0.008 ms** |
| `email LIKE '%77777@example.com'` | Seq Scan | 5.7 ms |
| `email LIKE 'user77777%'`, default collation | Seq Scan | 3.75 ms |
| same, `(email text_pattern_ops)` index | Index Scan | **0.083 ms** |
| `ORDER BY created_at DESC OFFSET 500000 LIMIT 20` | Index Scan reading 500,020 rows | 50.7 ms |
| keyset `WHERE created_at < $1 … LIMIT 20` | Index Scan reading 20 rows | **0.012 ms** |

### Checklist
1. Is there an index whose **left-most columns** match the WHERE/ORDER BY?
2. Is the indexed column wrapped in a function or cast? → expression index or rewrite.
3. Does pagination use OFFSET on large pages? → keyset.
4. Are you selecting only needed columns?
5. Are statistics fresh (`ANALYZE`) and estimates close to actual rows?
6. Is it actually many small queries (N+1)?
7. Is the query waiting on locks rather than computing (`pg_stat_activity.wait_event`)?

### Observability
- `pg_stat_statements`: total/mean time per normalised query → optimise the top of the list.
- `log_min_duration_statement = 200ms`: log slow queries.
- `auto_explain`: log plans of slow queries automatically.
:::

::: diagram Slow query triage
flowchart TD
  S["slow endpoint"] --> N{"many queries per request?"}
  N -->|"yes"| F["fix N+1 with JOIN or batch"]
  N -->|"no"| E["EXPLAIN ANALYZE the slow query"]
  E --> Q{"Seq Scan with many rows removed?"}
  Q -->|"yes"| I["add or fix index: expression, composite, pattern ops"]
  Q -->|"no"| O{"OFFSET or big sort?"}
  O -->|"yes"| K["keyset pagination or index on sort column"]
  O -->|"no"| L["check locks, stats, columns selected"]
:::

::: image Indexes and query plans (measured)
/images/sql/indexes.svg
:::

::: chart bar Measured: deep OFFSET vs keyset pagination (ms)
Pagination,ms
OFFSET 500000,50.749
keyset,0.012
:::

::: text 🪜 Step by step
Case-insensitive login lookup is slow:
1. Query: `SELECT * FROM users WHERE lower(email) = lower($1)`.
2. `EXPLAIN ANALYZE`: `Seq Scan on users … Rows Removed by Filter: 99999`, 18 ms.
3. Option A: `CREATE INDEX CONCURRENTLY users_lower_email_idx ON users (lower(email))` → 0.008 ms.
4. Option B: normalise emails to lower case on write and use the existing unique index (also prevents `Asha@` vs `asha@` duplicates).
5. Option C: `citext` column type.
:::

::: code sql Fixes for the measured anti-patterns
-- 1. function on a column → expression index (or store normalised values)
CREATE INDEX CONCURRENTLY users_lower_email_idx ON users (lower(email));
SELECT id FROM users WHERE lower(email) = lower($1);

-- 2. prefix LIKE under a non-C collation → text_pattern_ops
CREATE INDEX CONCURRENTLY users_email_pattern_idx ON users (email text_pattern_ops);
SELECT id FROM users WHERE email LIKE 'user77777%';

-- 3. "contains" search → trigram index
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
SELECT id, name FROM products WHERE name ILIKE '%chair%';

-- 4. deep OFFSET → keyset (cursor) pagination with a tie-breaker
SELECT id, created_at FROM orders
 WHERE (created_at, id) < ($1, $2)              -- values from the last row of the previous page
 ORDER BY created_at DESC, id DESC
 LIMIT 20;

-- 5. find the queries worth optimising (needs shared_preload_libraries = 'pg_stat_statements')
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms, query
  FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
:::

::: code javascript Keyset vs OFFSET cost model (runnable)
// OFFSET must walk past every skipped row; keyset seeks straight to the last seen key.
const rows = Array.from({ length: 1_000_000 }, (_, i) => ({ id: i + 1, createdAt: 1_000_000 - i }));   // already sorted DESC (like an index)
function offsetPage(offset, limit) { let touched = 0; const out = []; for (let i = 0; i < rows.length && out.length < limit; i++) { touched++; if (i >= offset) out.push(rows[i]); } return { out, touched }; }
function keysetPage(afterCreatedAt, limit) { let lo = 0, hi = rows.length, touched = 0; while (lo < hi) { touched++; const mid = (lo + hi) >> 1; if (rows[mid].createdAt >= afterCreatedAt) lo = mid + 1; else hi = mid; } return { out: rows.slice(lo, lo + limit), touched: touched + limit }; }
const a = offsetPage(500000, 20);
const b = keysetPage(rows[499999].createdAt, 20);
console.log({ offsetRowsTouched: a.touched, keysetRowsTouched: b.touched });
console.log('same page', a.out.map((r) => r.id).join() === b.out.map((r) => r.id).join() ? '✅' : '❌ FAIL');
console.log('keyset touches ~40 rows instead of 500,020', b.touched < 50 && a.touched === 500020 ? '✅ (measured 50.7 ms → 0.012 ms)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Adding indexes without checking the plan actually uses them.
- `OFFSET` pagination for infinite scroll or exports.
- `LIKE '%term%'` on big tables without trigram/full-text indexes.
- Comparing a `bigint` column to a text parameter (implicit cast blocks the index).
- Optimising a 2 ms query that runs once a day instead of a 5 ms query that runs a million times.
:::

::: understand
- Ask questions in the shape of the index, and optimise by total time, not by worst single run.
:::

::: ask
- *"Which queries consume the most total database time?"*
:::

::: important ⭐ Say this in the interview
"Most slow queries ask in a shape the index can't serve. Wrapping a column in a function, like lower(email), forced a full scan at 18 milliseconds; an expression index made it 0.008. A leading wildcard always scans, and even a prefix LIKE scanned under the default collation until I added a text_pattern_ops index. Deep OFFSET reads and discards rows: page 25,000 took 50 milliseconds versus 0.012 with keyset pagination. I find candidates with pg_stat_statements and slow-query logs, confirm with EXPLAIN ANALYZE, and also check for N+1 queries, SELECT star, missing foreign key indexes and stale statistics."
:::

::: links
PostgreSQL: pg_stat_statements | https://www.postgresql.org/docs/current/pgstatstatements.html
PostgreSQL: Operator classes (text_pattern_ops) | https://www.postgresql.org/docs/current/indexes-opclass.html
PostgreSQL: pg_trgm | https://www.postgresql.org/docs/current/pgtrgm.html
:::
