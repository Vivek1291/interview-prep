# 🎯 Full-Stack Interview Prep

A self-hosted study app for **Node.js, Express, REST/Auth, MongoDB, Mongoose, AWS, Full-Stack integration, LLD (frontend, backend and full-stack), JS implementations and DSA**. It ships with **243 questions** in 26 sections (including React: fundamentals, hooks, performance, Suspense & concurrent rendering, React 19) and 26 glossary terms, ordered by interview importance. Each concept question includes:

- 🧒 **In simple words**: an everyday analogy first
- 📖 **Detailed answer** with tables, then 🪜 **Step by step** (what actually happens)
- 📊 at least two visuals: a Mermaid diagram plus an illustration and/or a chart; charts use **numbers measured** on real software (MongoDB 7, Express 5, Mongoose 9, PM2, S3-compatible storage…), not made-up values
- 💻 complete code (with "How to run") and a **▶ Run**-able browser demo that checks itself with ✅ / ❌
- ⚠️ common mistakes, 🧠 what you must understand, ❓ what to ask the interviewer
- ⭐ **Say this in the interview**: a ready-to-speak answer
- 🔗 links to official docs, ⚡ quick-revise notes

DSA questions add dry runs and complexity; LLD questions contain complete, runnable projects. The Full-Stack, EC2, S3 and Security sections share one tested project (`fullstack-app/`: Express 5 + Mongoose 9 API, React 19 + TanStack Query web, Docker, deploy scripts).

Everything is editable, and every change is saved to MongoDB, so it's still there after a restart.

---

## 🚀 Run it (only Docker is needed)

1. Install **Docker Desktop** (Mac/Windows) and start it.
2. Open a terminal in this folder and run:

```bash
docker compose up -d --build
```

3. Open **http://localhost:3000** and **sign up**. 👑 **The first account becomes the admin.** Everyone who signs up after that is a learner.

The first build takes a few minutes because it downloads Node, MongoDB and the npm packages. After that, starting takes seconds.

| Service | URL | Notes |
|---|---|---|
| Web app (React + Nginx) | http://localhost:3000 | The app |
| API (Express) | http://localhost:5050/api/health | Try it with Postman / curl |
| MongoDB | `mongodb://localhost:27018` | Connect with MongoDB Compass to browse the data |

### Everyday commands

```bash
docker compose up -d          # start (after the first build)
docker compose down           # stop (your data is KEPT)
docker compose logs -f api    # see API logs
docker compose up -d --build  # rebuild after changing code
```

> ⚠️ `docker compose down -v` **deletes the volumes**: all accounts, private pages, progress and edits. Settings → Export (admin) backs up only the **shared** content.

---

## ✨ Features

- **🗂️ Category tree** (any depth): **Frontend** → JavaScript → Polyfills → …, **Backend** → Node.js / Java / Databases (MongoDB, SQL, PostgreSQL, Redis) / Common, **System Design** → Frontend / Backend / Full-Stack / Common, **DevOps**, **Testing**, **DSA**. Click a category to see its overview (sub-topics, pages, progress). Hover a category in the sidebar and press **＋** to add a sub-category or a page.
- **👥 Accounts & roles**: sign up / log in, profile with **avatar**, name and password in Settings.
  - **Admin**: what they create or edit is **shared**; every user sees it, read-only. Admins also manage roles, backups and reset (Settings).
  - **Everyone**: can create **🔒 private** categories and pages anywhere (even inside shared categories); only they can see and edit them.
  - **Progress is per user**: status, ★ star and personal Quick-Revise notes are yours alone.
- **Categories & pages**: add, edit, move, delete and **drag to reorder** (⋮⋮ handle in the sidebar).
- **Block editor** (click ✏️ Edit on a question):
  - 📖 **Rich text**: bold, italic, underline, **highlight colours**, **text colours**, headings, lists, quotes, links, tables
  - 🖍️ **Highlight / note boxes**: Note, Tip, Important, Warning, Understand, Ask-interviewer, or a custom box
  - 🎨 **Colour picker on every box** (12 presets + custom colour)
  - 💻 **Code** blocks with syntax highlighting (JS, TS, JSX, bash, JSON, YAML, Docker, Nginx, SQL…)
  - 🗺️ **Diagrams** (Mermaid: flowcharts, sequence, class, ER, state) with a live preview
  - 📊 **Charts** (bar / line / area from simple CSV)
  - 🖼️ **Images** (upload or paste a URL) and 🔗 **links**
  - Drag, move up/down, duplicate, delete and fold blocks. **Ctrl/Cmd + S** saves.
- **📥 Import your own notes** (Word **.docx** or a **Google Docs link**): click **📥 Import** on a category (or ＋ in the sidebar → Import a document). Choose how to split it: lines starting with **“Q)”** (or any text you type), **Heading 1 / 2 / 3** (higher headings become sub-categories), or one page. A live preview lets you rename pages, **⤴ merge** a page into the one above, or leave pages out. Monospace text becomes ▶ code blocks; images, tables, lists, links, bold and colours are kept. Admins import shared content; everyone else imports privately. Google Docs links must be shared as “Anyone with the link”.
  - **Google Docs with tabs** keep their structure: you get the tab tree (tab → sub-tab → sub-sub-tab) with checkboxes. Every tab becomes a page; a tab with sub-tabs becomes a sub-category (its own text is the first page) or, if you choose, **one page** with the sub-tabs as sections. A 99-tab document imports in about 40 seconds, with progress. (A downloaded .docx loses the tabs, so use the link.)
- **📖 Terms (glossary)**: short explanations of words that keep coming up (libuv, hydration, idempotent, JWT…), 26 included. Terms are **linked automatically** inside pages (first mention, dotted underline): click one to read it in a side panel without leaving the page. Open **📖 Terms** in the top bar for the A–Z list and search, select any word on a page → **📖 Add as term** to create your own (private, or shared if you're an admin), and edit terms with the same block editor as pages. Turn the links off in Settings.
- **🔍 Zoom** any image, diagram or chart: click it (or the ⤢ Zoom button) for a full-screen view. Scroll or pinch to zoom, drag to move, double-click to zoom in, `+` / `-` / `0` / `1` keys, Esc to close. SVGs and charts are re-drawn at the zoom level, so they stay sharp.
- **⚡ Quick Revise**: the page's notes plus your own, in one page, filterable by category (including its sub-categories), must-know only, printable. **Select any text** in a question → **📌 Add to Quick Revise**.
- **🏋️ Practice mode** (top bar) blurs the solutions until you click, so you try first.
- **▶ Run**: runs plain JavaScript examples in a sandboxed web worker and shows the console output.
- **Progress tracking**: status per question (Not started / Learning / Needs revision / Confident), ⭐ importance, ★ starred, and a dashboard chart.
- **Search** across titles, content, code and notes. Filters: Must-know, Starred, To learn.
- **Backup** (admin): Export / Import the shared content as JSON, or Reset it to the default content (Settings). Private content and progress survive a reset.
- Light / dark theme, and it works on mobile.

---

## 🧱 Architecture (also a good interview story!)

```
React (Vite) + React Query + Tiptap editor + Mermaid + Recharts
        │  axios → /api/*
        ▼
Nginx  (serves the React build, reverse-proxies /api and /uploads)
        ▼
Express API  routes → controllers → services → repositories   (zod validation, JWT auth,
        │                                                       error middleware, multer uploads)
        ▼
MongoDB (Mongoose models; question blocks are EMBEDDED; aggregation for stats / revise page)
```

```
interview-prep/
├── docker-compose.yml        # mongo + api + web in one command
├── server/                   # Express API
│   └── src/
│       ├── config/  models/  repositories/  services/  controllers/  routes/  middleware/  validators/  utils/
│       └── seed/             # default content: seed/content/*.md (one file per section)
└── client/                   # React app
    └── src/
        ├── api/ (axios client + React Query hooks)
        ├── components/ (Sidebar, blocks/*: RichTextEditor, CodeBlock, DiagramBlock, ChartBlock…)
        ├── auth/ (AuthProvider: session, login, signup, logout)
        └── pages/ (lazy-loaded: Dashboard, CategoryPage, QuestionPage, RevisePage, SettingsPage, AuthPage)
```

### How content is stored
- `sections`: the category tree: `{ title, icon, color, description, parent, owner, order, key }`. `owner: null` = shared (admin) content, `owner: <userId>` = private.
- `questions` (pages): `{ section, owner, title, priority, tags, order, blocks[], quickNotes[] }`
- `progresses`: per user and page: `{ user, question, status, starred, notes[] }`
- `users`: `{ name, email, passwordHash, role: admin|user, avatarUrl }`
- Each block: `{ id, type: text|callout|code|diagram|chart|image|links, title, content, color, variant, lang, chartType }`

The default content is seeded **only when the database is empty**, so your edits are never overwritten. A database from the older single-user version is migrated automatically on start (sections are moved into the new tree; the old progress is given to the first admin). When new default content is released, a migration adds only what's missing (new categories, pages and glossary terms) and never changes or re-creates anything you edited or deleted.

### 🔐 Authentication
- Short-lived **JWT access token** (15 min, kept in memory) + **refresh token** in an `httpOnly` cookie (30 days, rotated on every use; a reused token logs out all sessions).
- Passwords are hashed with **bcrypt**. Login and signup are rate-limited.
- The JWT secrets are generated on first start and stored in MongoDB. To manage them yourself, set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` on the `api` service.
- If you serve the app over **HTTPS**, set `COOKIE_SECURE=true` on the `api` service.
- Forgot the admin password? Another admin can't see it either. Promote a second account to admin in Settings beforehand, or reset the data (`down -v`, see below).

### Editing the default question bank (optional)
The seed files in `server/src/seed/content/*.md` use a simple format (`=== Question`, `::: code javascript`, `::: understand`, `::: ask`, `::: image`, …; see [`docs/content-format.md`](docs/content-format.md)). Illustrations live in `client/public/images/<section>/*.svg` (rebuild the web image after adding some).

After changing seed files:

```bash
node scripts/verify-content.js        # runs every ▶ Run example and checks the format (expect 0 failures, 0 warnings)
```

Then, logged in as an admin: **Settings → Export** (back up first), then **Settings → Reset** to load the seed files. Reset replaces the **shared** content; private content and everyone's progress are kept.

With curl (log in as an admin first to get a token):
```bash
TOKEN=$(curl -s -X POST localhost:5050/api/auth/login -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"…"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s -H "Authorization: Bearer $TOKEN" localhost:5050/api/backup/export -o backup-$(date +%Y%m%d-%H%M).json
curl -s -X POST -H "Authorization: Bearer $TOKEN" localhost:5050/api/backup/reset
```

`backup-*.json` files are git-ignored because they contain your personal edits.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Change the left-hand port in `docker-compose.yml` (e.g. `"3001:80"`, `"5051:5050"`, `"27019:27017"`) |
| Page loads but says "Is the API running?" | `docker compose logs api`; the API waits for MongoDB to be healthy on the first start |
| Build fails on `npm install` | Check your internet / proxy, then `docker compose build --no-cache` |
| Want to start fresh | Settings → Reset (shared content only), or `docker compose down -v && docker compose up -d --build` (⚠️ deletes **all** accounts and data) |
| "Too many attempts" on login | Wait 15 minutes (rate limit), or set `AUTH_RATE_LIMIT=off` on the `api` service |

### Local development without Docker (optional)
```bash
# terminal 1 — needs a MongoDB running on 27017
cd server && npm install && MONGO_URI=mongodb://localhost:27017/interview_prep npm run dev
# terminal 2
cd client && npm install && npm run dev   # http://localhost:5173 (proxies /api to :5050)
```

### Tests
```bash
cd server && npm install
MONGO_URI=mongodb://localhost:27018/learning_hub_test npm test   # API tests (auth, roles, private content, tree, progress, reset, migration)
```
Use a database name that is **not** `interview_prep`: the tests drop their database.
