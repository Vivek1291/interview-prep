@section Full-Stack LLD
@icon 🧩
@color #9333ea
@desc End-to-end feature design: user management, product management, file upload + S3, real-time notifications, large-scale dashboard.

=== Design a User Management System
@p 3
@tags lld, full-stack, crud, rbac
@quick
- **React** (UsersTable, UserForm, filters, pagination, role badges) → **API** `/api/v1/users` → **Express** (auth + RBAC + validation) → **Service** → **MongoDB**.
- Features: create/update/delete (**soft delete**), search, filter (role/status), sort, pagination, roles, authentication.
- Model: `{ name, email (unique, lowercase), passwordHash (select:false), role, status, lastLoginAt, deletedAt }` + indexes `{ status, role, createdAt }`, text/regex on name/email.
- Security: only admins manage users; users edit their own profile; can't demote the last admin; audit log.
- UX: optimistic updates, URL-synced filters, invite-by-email flow.

::: text
### Requirements
| Feature | Design decision |
|---|---|
| Create user | Admin invites → email with a set-password token (don't set passwords for users) |
| Update user | `PATCH /users/:id` with allowlisted fields; role changes admin-only |
| Delete user | **Soft delete** (`status: 'deleted', deletedAt`) for audit + restore |
| Search | `?q=` → prefix/regex on name/email (Atlas Search at scale) |
| Filter / sort | `?role=admin&status=active&sort=-createdAt` with an allowlist |
| Pagination | Offset for the admin table (needs page numbers + total) |
| Roles | `user`, `manager`, `admin` → permission map shared with the frontend |
| Auth | JWT access + refresh; `authenticate` + `requirePermission('user:manage')` |

### API
`GET /users` · `GET /users/:id` · `POST /users` (invite) · `PATCH /users/:id` · `DELETE /users/:id` · `POST /users/:id/restore` · `GET /me` · `PATCH /me`
:::

::: diagram
flowchart LR
  subgraph React
    UP["UsersPage: URL filters"] --> UT["UsersTable"]
    UP --> UF["UserFormModal"]
    UP --> HK["useUsers / useUpdateUser hooks"]
  end
  HK -->|"GET /api/v1/users?page&q&role"| RT["users.routes: authenticate, requirePermission"]
  RT --> CT["UserController"] --> SV["UserService: rules, invite, audit"] --> RP["UserRepository"] --> DB[("users collection")]
  SV --> MAIL["Email queue: invite"]
:::

::: code javascript Backend: model, repository, service rules, routes
// ---------- model ----------
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['user', 'manager', 'admin'], default: 'user', index: true },
  status: { type: String, enum: ['invited', 'active', 'suspended', 'deleted'], default: 'invited' },
  lastLoginAt: Date,
  deletedAt: Date,
}, { timestamps: true });
UserSchema.index({ status: 1, role: 1, createdAt: -1 });
const User = model('User', UserSchema);

// ---------- repository ----------
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const userRepository = {
  async list({ q, role, status, page, limit, sort }) {
    const filter = { status: status || { $ne: 'deleted' } };
    if (role) filter.role = role;
    if (q) filter.$or = [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { email: { $regex: '^' + escapeRegex(q.toLowerCase()) } }];
    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).select('name email role status lastLoginAt createdAt').lean(),
      User.countDocuments(filter),
    ]);
    return { items, total };
  },
  countAdmins: () => User.countDocuments({ role: 'admin', status: 'active' }),
  update: (id, data) => User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
};

// ---------- service (business rules live here) ----------
const userService = {
  list: (query) => userRepository.list(query),
  async update(actor, id, changes) {
    const allowed = actor.role === 'admin' ? ['name', 'role', 'status'] : ['name'];
    if (actor.role !== 'admin' && String(actor.id) !== String(id)) throw new AppError(403, 'Forbidden');
    const data = Object.fromEntries(Object.entries(changes).filter(([k]) => allowed.includes(k)));
    if (data.role && data.role !== 'admin') {
      const target = await User.findById(id).lean();
      if (target.role === 'admin' && (await userRepository.countAdmins()) <= 1) throw new AppError(409, 'Cannot demote the last admin');
    }
    const user = await userRepository.update(id, data);
    await AuditLog.create({ actorId: actor.id, action: 'user.update', targetId: id, changes: data });
    return user;
  },
  softDelete: (actor, id) => userService.update(actor, id, { status: 'deleted' }).then(() => User.updateOne({ _id: id }, { deletedAt: new Date() })),
};

// ---------- routes ----------
router.get('/users', authenticate, requirePermission('user:manage'), validate(listUsersSchema), asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const { items, total } = await userService.list({ ...req.validated.query, sort: { createdAt: -1, _id: -1 } });
  res.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));
router.patch('/users/:id', authenticate, validate(updateUserSchema), asyncHandler(async (req, res) => {
  res.json({ data: await userService.update(req.user, req.params.id, req.body) });
}));
router.delete('/users/:id', authenticate, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  await userService.softDelete(req.user, req.params.id);
  res.status(204).end();
}));
:::

::: code jsx Frontend: UsersPage with URL filters, table, role change (optimistic)
export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const filters = { page: Number(params.get('page') || 1), limit: 20, q: params.get('q') || '', role: params.get('role') || '' };
  const { data, isPending, error } = useQuery({ queryKey: ['users', filters], queryFn: ({ signal }) => usersApi.list(filters, signal), placeholderData: keepPreviousData });
  const qc = useQueryClient();
  const changeRole = useMutation({
    mutationFn: ({ id, role }) => usersApi.update(id, { role }),
    onMutate: async ({ id, role }) => {
      await qc.cancelQueries({ queryKey: ['users', filters] });
      const prev = qc.getQueryData(['users', filters]);
      qc.setQueryData(['users', filters], (old) => ({ ...old, data: old.data.map((u) => (u._id === id ? { ...u, role } : u)) }));
      return { prev };
    },
    onError: (err, v, ctx) => { qc.setQueryData(['users', filters], ctx.prev); toast.error(err.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const set = (patch) => setParams({ ...Object.fromEntries(params), ...patch, page: patch.page ?? '1' });
  const columns = [
    { id: 'name', header: 'Name', sortable: true },
    { id: 'email', header: 'Email' },
    { id: 'role', header: 'Role', cell: (u) => (
      <Can permission="user:manage" fallback={<span>{u.role}</span>}>
        <select value={u.role} onChange={(e) => changeRole.mutate({ id: u._id, role: e.target.value })}>
          <option>user</option><option>manager</option><option>admin</option>
        </select>
      </Can>) },
    { id: 'status', header: 'Status' },
  ];
  return (
    <>
      <input defaultValue={filters.q} placeholder="Search name or email" onChange={debounce((e) => set({ q: e.target.value }), 300)} />
      <select value={filters.role} onChange={(e) => set({ role: e.target.value })}><option value="">All roles</option><option>admin</option><option>manager</option><option>user</option></select>
      <DataTable manual columns={columns} data={data?.data} total={data?.pagination.total} loading={isPending} error={error}
        pagination={{ pageIndex: filters.page - 1, pageSize: 20 }} onPaginationChange={(p) => set({ page: String(p.pageIndex + 1) })} rowKey={(u) => u._id} />
    </>
  );
}
:::

::: ask
- *"Who can manage users? Self sign-up or invite-only? Multi-tenant (users per organisation)? SSO provisioning (SCIM)? Hard delete for GDPR 'right to be forgotten'?"*
:::

::: links
OWASP: Authorization | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
:::

=== Design a Product Management System
@p 3
@tags lld, full-stack, products, catalog
@quick
- Frontend: **ProductTable, ProductForm, ProductDetails, Filters, Pagination** (+ image uploader).
- Backend: **ProductController → ProductService → ProductRepository → ProductModel**; collections **products, categories, users** (+ images in S3).
- Model: `{ name, slug (unique), description, price (paise), currency, categoryId, stock, images[{ key }], attributes{}, status: draft|active|archived, createdBy }`.
- Filters: category, price range, status, search; indexes `{ status, categoryId, price }`, text index or Atlas Search; slugs for SEO URLs.
- Concerns: stock concurrency, price history, image processing, caching of product pages (Redis/CDN) + invalidation.

::: diagram Data model
erDiagram
  CATEGORY ||--o{ PRODUCT : contains
  USER ||--o{ PRODUCT : creates
  PRODUCT {
    ObjectId _id
    string name
    string slug
    number pricePaise
    ObjectId categoryId
    number stock
    array images
    string status
  }
  CATEGORY {
    ObjectId _id
    string name
    string slug
    ObjectId parentId
  }
  USER {
    ObjectId _id
    string name
    string role
  }
:::

::: diagram Layers
flowchart LR
  subgraph FE["React"]
    PT["ProductTable"]
    PF["ProductForm + ImageUploader"]
    PD["ProductDetails"]
    FL["Filters"]
    PG["Pagination"]
  end
  FE -->|"REST /api/v1/products"| PC["ProductController"]
  PC --> PS["ProductService: slug, pricing rules, cache invalidation"]
  PS --> PR["ProductRepository"]
  PR --> DB[("products, categories")]
  PS --> S3[("S3 images")]
  PS --> RC[("Redis cache")]
:::

::: code javascript Backend: model + service + controller routes
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const ProductSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 },
  slug: { type: String, unique: true },
  description: String,
  pricePaise: { type: Number, required: true, min: 0 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  stock: { type: Number, default: 0, min: 0 },
  images: [{ _id: false, key: String, alt: String }],
  attributes: { type: Map, of: String },                 // flexible: { color: 'red', ram: '16GB' }
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
ProductSchema.index({ status: 1, categoryId: 1, pricePaise: 1 });
ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.pre('save', function () { if (this.isModified('name')) this.slug = `${slugify(this.name)}-${this._id.toString().slice(-6)}`; });
const Product = model('Product', ProductSchema);

const productRepository = {
  list: async ({ filter, sort, skip, limit }) => Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).populate('categoryId', 'name slug').lean(),
    Product.countDocuments(filter),
  ]),
  bySlug: (slug) => Product.findOne({ slug, status: 'active' }).populate('categoryId', 'name slug').lean(),
};

const productService = {
  buildFilter({ category, minPrice, maxPrice, q, status = 'active' }) {
    const f = { status };
    if (category) f.categoryId = category;
    if (minPrice || maxPrice) f.pricePaise = { ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) };
    if (q) f.$text = { $search: q };
    return f;
  },
  async list(query) {
    const page = Math.max(Number(query.page) || 1, 1), limit = Math.min(Number(query.limit) || 20, 100);
    const sortMap = { price: { pricePaise: 1 }, '-price': { pricePaise: -1 }, newest: { createdAt: -1 } };
    const [items, total] = await productRepository.list({ filter: this.buildFilter(query), sort: { ...(sortMap[query.sort] || sortMap.newest), _id: -1 }, skip: (page - 1) * limit, limit });
    return { items: items.map(toProductDTO), pagination: { page, limit, total } };
  },
  async getBySlug(slug) {
    return cached(`product:${slug}`, 300, () => productRepository.bySlug(slug));
  },
  async update(id, data) {
    const p = await Product.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    await redis.del(`product:${p.slug}`);                                  // invalidate cache
    return p;
  },
};

const toProductDTO = (p) => ({ id: p._id, name: p.name, slug: p.slug, price: p.pricePaise / 100, stock: p.stock, category: p.categoryId?.name, image: p.images?.[0] && `${process.env.CDN_URL}/${p.images[0].key}` });

router.get('/products', asyncHandler(async (req, res) => res.json(await productService.list(req.query))));
router.get('/products/:slug', asyncHandler(async (req, res) => {
  const p = await productService.getBySlug(req.params.slug);
  if (!p) return res.status(404).json({ message: 'Not found' });
  res.set('Cache-Control', 'public, max-age=60').json({ data: toProductDTO(p) });
}));
router.post('/products', authenticate, requirePermission('product:write'), validate(productSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await Product.create({ ...req.body, createdBy: req.user.id }) });
}));
router.patch('/products/:id', authenticate, requirePermission('product:write'), asyncHandler(async (req, res) => res.json({ data: await productService.update(req.params.id, req.body) })));
:::

::: code jsx Frontend: ProductForm with validation + image upload
const productSchema = z.object({
  name: z.string().min(3, 'At least 3 characters'),
  price: z.coerce.number().positive('Price must be > 0'),
  categoryId: z.string().min(1, 'Choose a category'),
  stock: z.coerce.number().int().min(0),
  status: z.enum(['draft', 'active']),
});

export function ProductForm({ initial, onSaved }) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(productSchema), defaultValues: initial });
  const [images, setImages] = useState(initial?.images || []);
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: Infinity });

  const onSubmit = async (v) => {
    const body = { ...v, pricePaise: Math.round(v.price * 100), images };
    const saved = initial?.id ? await productsApi.update(initial.id, body) : await productsApi.create(body);
    toast.success('Product saved');
    onSaved(saved);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>Name <input {...register('name')} /></label>{errors.name && <p role="alert">{errors.name.message}</p>}
      <label>Price (₹) <input type="number" step="0.01" {...register('price')} /></label>{errors.price && <p role="alert">{errors.price.message}</p>}
      <label>Category <select {...register('categoryId')}><option value="">Select…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Stock <input type="number" {...register('stock')} /></label>
      <label>Status <select {...register('status')}><option value="draft">Draft</option><option value="active">Active</option></select></label>
      <FileUploader presign={uploadsApi.presign} onUploaded={(key) => setImages((imgs) => [...imgs, { key }])} />
      <button disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</button>
    </form>
  );
}
:::

::: ask
- *"Catalogue size? Variants (size/colour SKUs)? Multi-currency? Search requirements (facets, typo tolerance → Atlas Search/Elasticsearch)? Who can edit? Draft/publish workflow?"*
:::

::: links
MongoDB: attribute pattern (product specs) | https://www.mongodb.com/blog/post/building-with-patterns-the-attribute-pattern
:::

=== Design a File Upload System (React → API → presigned URL → S3)
@p 3
@tags lld, full-stack, s3, upload
@quick
- Frontend: **FileUploader → API (presign) → PUT to S3 (presigned URL) → API (complete)**.
- Backend: **FileController → FileService (validation, quotas, permissions, metadata) → S3Service (SDK wrapper)** + FileRepository.
- Status lifecycle: `pending → ready` (→ `processing` for thumbnails/virus scan) → `deleted`.
- Post-processing: S3 event → SQS/Lambda (thumbnail, scan) → update metadata → notify the client (WebSocket/polling).
- Cleanup of abandoned uploads; private bucket + presigned GET/CloudFront for downloads.

::: text
This question combines three existing answers. Use this structure in the interview:
1. **Frontend component**: see *Frontend LLD → Design a File Upload component* (multi-file, progress, cancel, retry, preview).
2. **Upload flow**: see *Full-Stack Integration → How do you upload an image from React to S3?* (presigned PUT, S3 CORS, verification).
3. **Backend service**: see *Backend LLD → Design a File Storage Service* (FileService, S3Service, permissions, metadata).
4. **Large files**: see *AWS S3 → How would you upload large files?* (multipart).

### End-to-end sequence
| Step | Component | Action |
|---|---|---|
| 1 | FileUploader | Validate type/size locally, show a preview |
| 2 | `POST /files/presign` | FileService checks auth, quota, type → creates a `pending` metadata doc → S3Service signs a PUT (5 min) |
| 3 | Browser → S3 | PUT with progress/cancel (AbortController) |
| 4 | `POST /files/:id/complete` | HeadObject verifies size/type → status `processing` |
| 5 | S3 event → Lambda | Thumbnail + virus scan → status `ready` (or `rejected`) |
| 6 | WebSocket / polling | UI updates the file card |
| 7 | Download | `GET /files/:id/download` → permission check → presigned GET |
:::

::: diagram
flowchart LR
  FU["React FileUploader"] -->|"1 presign"| FC["FileController"]
  FC --> FS["FileService: validate, quota, permissions"]
  FS --> S3S["S3Service: presignPut"]
  FS --> DB[("files metadata: pending")]
  FU -->|"2 PUT bytes"| S3[("S3 private bucket")]
  FU -->|"3 complete"| FC
  S3 -->|"ObjectCreated event"| L["Lambda: thumbnail + scan"]
  L -->|"status ready"| DB
  DB -.->|"WebSocket / poll"| FU
:::

::: code javascript Lambda post-processor (S3 event) updating metadata via the API
// Triggered by S3 ObjectCreated on prefix users/
exports.handler = async (event) => {
  for (const r of event.Records) {
    const key = decodeURIComponent(r.s3.object.key.replace(/\+/g, ' '));
    const clean = await scanForMalware(r.s3.bucket.name, key);          // e.g. ClamAV layer
    let thumbKey = null;
    if (clean && /\.(png|jpe?g|webp)$/i.test(key)) thumbKey = await makeThumbnail(r.s3.bucket.name, key); // sharp
    await fetch(`${process.env.API_URL}/internal/files/processed`, {   // internal endpoint, service auth
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_TOKEN },
      body: JSON.stringify({ key, status: clean ? 'ready' : 'rejected', thumbKey }),
    });
  }
};
:::

::: ask
- *"File types & max sizes? Who can see files (sharing)? Need thumbnails / previews / scanning? Retention & deletion policy? Expected volume?"*
:::

::: links
S3 event notifications | https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html
:::

=== Design a Real-Time Notification System
@p 3
@tags lld, websocket, real-time, notifications
@quick
- **React ↔ WebSocket ↔ Node** ← **Event/Queue** ← domain events (order shipped, comment added).
- **Persist** notifications in MongoDB (`{ userId, type, data, readAt, createdAt }`) → history, **unread count**, offline users catch up on reconnect.
- WebSocket connection authenticated with a JWT; rooms per user (`user:42`); **reconnection** with backoff + fetch missed since the last id.
- Delivery: at-least-once → client dedupes by id; ack/read receipts; fallback to push/email when offline.
- **Scaling**: many WS servers → **Redis pub/sub adapter** (or a managed service: API Gateway WebSockets / Pusher / Ably); sticky sessions on the ALB.

::: diagram
flowchart LR
  SVC["Order service: order shipped"] -->|"event"| Q["Queue / Redis Streams / SNS"]
  Q --> NW["Notification worker: persist + fan-out"]
  NW --> DB[("notifications")]
  NW -->|"publish user:42"| RP["Redis pub/sub"]
  RP --> WS1["WS server 1"]
  RP --> WS2["WS server 2"]
  WS1 -->|"notification:new"| R1["React: bell + toast"]
  R1 -->|"GET /notifications?after=lastId on reconnect"| API["REST API"]
  API --> DB
:::

::: code javascript Server: Socket.IO with JWT auth, user rooms, Redis adapter, persistence
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

async function initRealtime(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.WEB_ORIGIN, credentials: true } });
  const pub = createClient({ url: process.env.REDIS_URL }); const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));                                 // broadcast across all WS servers

  io.use((socket, next) => {                                           // authenticate the handshake
    try { socket.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET); next(); }
    catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.sub}`);                            // private room per user
    socket.on('notification:read', async ({ id }) => {
      await Notification.updateOne({ _id: id, userId: socket.user.sub }, { $set: { readAt: new Date() } });
    });
  });
  return io;
}

// Called by the notification worker (or directly by services)
async function notifyUser(io, userId, type, data) {
  const n = await Notification.create({ userId, type, data });         // persist first (history + offline users)
  io.to(`user:${userId}`).emit('notification:new', { id: n._id, type, data, createdAt: n.createdAt });
}

// REST for history & unread count
router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const filter = { userId: req.user.id, ...(req.query.after && { _id: { $gt: req.query.after } }) };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ _id: -1 }).limit(30).lean(),
    Notification.countDocuments({ userId: req.user.id, readAt: null }),
  ]);
  res.json({ items, unread });
}));
// Index: notificationSchema.index({ userId: 1, _id: -1 }); notificationSchema.index({ userId: 1, readAt: 1 });
:::

::: code jsx Client: useNotifications hook (reconnect + catch-up + dedupe + unread)
export function useNotifications(token) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications').then((r) => r.data) });

  useEffect(() => {
    const socket = io({ auth: { token } });
    socket.on('connect', async () => {
      const lastId = qc.getQueryData(['notifications'])?.items?.[0]?.id;           // catch up after reconnect
      if (lastId) {
        const missed = await api.get('/notifications', { params: { after: lastId } }).then((r) => r.data);
        qc.setQueryData(['notifications'], (old) => merge(old, missed.items, missed.unread));
      }
    });
    socket.on('notification:new', (n) => {
      qc.setQueryData(['notifications'], (old) => merge(old, [n], (old?.unread || 0) + 1));
      toast.info(renderText(n));
    });
    return () => socket.disconnect();
  }, [token, qc]);

  return { items: data?.items || [], unread: data?.unread || 0 };
}

function merge(old = { items: [], unread: 0 }, incoming, unread) {
  const seen = new Set(old.items.map((i) => String(i.id || i._id)));
  const fresh = incoming.filter((i) => !seen.has(String(i.id || i._id)));          // dedupe (at-least-once)
  return { items: [...fresh, ...old.items].slice(0, 100), unread };
}
:::

::: ask
- *"How many concurrent users? Must notifications be guaranteed? Multiple devices per user? Mobile push when offline? Preferences/muting?"*
- *"WebSocket vs SSE?"* SSE is simpler for server→client only and works over HTTP/2; WebSocket is bidirectional.
:::

::: links
Socket.IO rooms | https://socket.io/docs/v4/rooms/
MDN: Server-sent events | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
:::

=== Design a Large-Scale Dashboard (charts, tables, filters, widgets, live data)
@p 3
@tags lld, dashboard, aggregation, caching, real-time
@quick
- Frontend: **Dashboard → Filters (global, URL-synced) → Widgets (Charts, Tables, KPIs) → Notifications**; each widget has its own query (parallel loading, isolated errors), lazy-loaded & virtualised.
- Backend: **API → Services → MongoDB aggregation**; heavy queries **pre-aggregated** (rollups per minute/hour/day via jobs or `$merge` materialised views).
- **Caching**: Redis per (widget, filters) with a short TTL; HTTP caching; React Query `staleTime`.
- **Real-time**: WebSocket/SSE pushes deltas (e.g. alarms, live metrics); throttle UI updates; fall back to polling.
- Performance: downsample time series for charts, pagination for tables, time-series collections, indexes on `(deviceId, ts)`.

::: text
### Architecture (SCADA/IoT or business analytics style)
| Layer | Design |
|---|---|
| **Filters** | Date range, site/device, granularity → stored in the URL → part of every widget's query key |
| **Widgets** | `<Widget title query render>` wrapper with its own loading/error/empty state + ErrorBoundary; lazy-load below-the-fold widgets |
| **Charts** | Downsampled series from the API (≤ 500 points per series); zoom → refetch at finer granularity |
| **Tables** | Server-side pagination + virtualisation |
| **Live data** | WebSocket channel per dashboard; batch updates every 1s; `setQueryData` to patch the cache |
| **API** | `GET /metrics/timeseries?device=..&from=..&to=..&bucket=5m`, `GET /kpis?...` |
| **Data** | Raw readings in a **time-series collection**; rollup collections (`metrics_5m`, `metrics_1h`) maintained by a job |
| **Caching** | Redis cache-aside keyed by the query; invalidate on new rollups |

### Performance techniques
Pre-aggregation · downsampling · `$match` on indexed `(deviceId, ts)` first · `$facet` for multiple KPIs · parallel widget requests · compression · CDN for static assets · `React.memo` / `useMemo` for expensive chart transforms · web workers for heavy client calculations.
:::

::: diagram
flowchart TB
  subgraph FE["React Dashboard"]
    F["Global filters in URL"] --> W1["KPI widgets"]
    F --> W2["Time-series charts"]
    F --> W3["Alarms table: virtualised"]
    WS["WebSocket client"] --> W2
    WS --> N["Notifications / alarms toasts"]
  end
  W1 -->|"GET /kpis"| API["Express API"]
  W2 -->|"GET /timeseries?bucket=5m"| API
  W3 -->|"GET /alarms?page"| API
  API --> RC[("Redis cache")]
  API --> AGG[("Rollups: metrics_5m, metrics_1h")]
  ING["Ingest: devices, events"] --> RAW[("Time-series collection")]
  RAW -->|"job / $merge every minute"| AGG
  ING -->|"live deltas"| PUB["Redis pub/sub"] --> WSS["WS server"] --> WS
:::

::: chart area Example: raw points vs downsampled points sent to the chart (per series, 7 days)
Resolution,Points
Raw 1s,604800
1 minute,10080
5 minutes,2016
1 hour,168
:::

::: code javascript Backend: time-series collection, rollup with $merge, cached timeseries endpoint
// 1) Time-series collection for raw readings (MongoDB 5+)
db.createCollection('readings', { timeseries: { timeField: 'ts', metaField: 'deviceId', granularity: 'seconds' }, expireAfterSeconds: 60 * 60 * 24 * 30 });

// 2) Rollup job (every minute): raw → 5-minute buckets (materialised view)
async function rollup5m(from, to) {
  await Reading.aggregate([
    { $match: { ts: { $gte: from, $lt: to } } },
    { $group: {
        _id: { deviceId: '$deviceId', bucket: { $dateTrunc: { date: '$ts', unit: 'minute', binSize: 5 } } },
        avg: { $avg: '$value' }, min: { $min: '$value' }, max: { $max: '$value' }, count: { $sum: 1 },
    } },
    { $merge: { into: 'metrics_5m', on: '_id', whenMatched: 'replace', whenNotMatched: 'insert' } },
  ]);
}

// 3) API: pick the resolution based on the range, cache the result
router.get('/timeseries', authenticate, asyncHandler(async (req, res) => {
  const { deviceId, from, to } = req.query;
  const rangeH = (new Date(to) - new Date(from)) / 36e5;
  const collection = rangeH <= 6 ? 'metrics_5m' : 'metrics_1h';           // downsample for long ranges
  const key = `ts:${collection}:${deviceId}:${from}:${to}`;
  const data = await cached(key, 30, () =>
    mongoose.connection.collection(collection).find(
      { '_id.deviceId': deviceId, '_id.bucket': { $gte: new Date(from), $lt: new Date(to) } },
      { projection: { _id: 0, t: '$_id.bucket', avg: 1, min: 1, max: 1 } }
    ).sort({ '_id.bucket': 1 }).toArray());
  res.json({ resolution: collection, points: data });
}));
:::

::: code jsx Frontend: Widget wrapper + live updates batched into the React Query cache
function Widget({ title, queryKey, queryFn, children }) {
  const q = useQuery({ queryKey, queryFn, staleTime: 30_000 });
  return (
    <section className="widget" aria-busy={q.isFetching}>
      <header><h3>{title}</h3>{q.isFetching && <small>updating…</small>}</header>
      <ErrorBoundary fallback={<p>Widget crashed</p>}>
        {q.isPending ? <Skeleton /> : q.isError ? <ErrorState onRetry={q.refetch} /> : children(q.data)}
      </ErrorBoundary>
    </section>
  );
}

function useLiveMetrics(deviceId, filters) {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = io({ auth: { token: getAccessToken() } });
    socket.emit('subscribe', { deviceId });
    let buffer = [];
    socket.on('metric', (m) => buffer.push(m));
    const flush = setInterval(() => {                     // batch UI updates (max 1/sec)
      if (!buffer.length) return;
      const batch = buffer; buffer = [];
      qc.setQueryData(['timeseries', deviceId, filters], (old) =>
        old ? { ...old, points: [...old.points, ...batch.map((m) => ({ t: m.ts, avg: m.value }))].slice(-500) } : old);
    }, 1000);
    return () => { clearInterval(flush); socket.disconnect(); };
  }, [deviceId, filters, qc]);
}

export function DeviceDashboard() {
  const filters = useDashboardFilters();                 // from URL: deviceId, from, to
  useLiveMetrics(filters.deviceId, filters);
  return (
    <div className="grid">
      <Widget title="Temperature" queryKey={['timeseries', filters.deviceId, filters]} queryFn={() => metricsApi.timeseries(filters)}>
        {(d) => <LineChartMemo points={d.points} />}
      </Widget>
      <Widget title="KPIs" queryKey={['kpis', filters]} queryFn={() => metricsApi.kpis(filters)}>{(k) => <KpiRow kpis={k} />}</Widget>
      <Widget title="Alarms" queryKey={['alarms', filters]} queryFn={() => alarmsApi.list(filters)}>{(a) => <VirtualTable rows={a.items} />}</Widget>
    </div>
  );
}
:::

::: ask
- *"How many devices/users, data points per second, retention? How real-time must it be (1s vs 1min)? Export/reporting needs? Role-based widget visibility? Custom user layouts (drag & drop grid)?"*
- Relate it to your **SCADA experience**: alarms, live values, historian data. That's a strong story.
:::

::: links
MongoDB time series collections | https://www.mongodb.com/docs/manual/core/timeseries-collections/
$merge (on-demand materialized views) | https://www.mongodb.com/docs/manual/core/materialized-views/
:::
