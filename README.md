# 🎯 Full-Stack Interview Prep

A self-hosted study app for **Node.js, Express, REST/Auth, MongoDB, Mongoose, AWS, Full-Stack integration, LLD (frontend, backend and full-stack), JS implementations and DSA**. It ships with **207 questions** ordered by interview importance. Each one includes:

- 📖 a detailed answer, with tables, diagrams and charts
- 💻 complete code you can study, copy, or **▶ Run** in the browser (JS examples)
- 🧠 **What you must understand**
- ❓ **Ask the interviewer / be cautious** (clarifying questions and traps)
- 🔗 links to official docs and LeetCode
- ⚡ quick-revise notes

Everything is editable, and every change is saved to MongoDB, so it's still there after a restart.

---

## 🚀 Run it (only Docker is needed)

1. Install **Docker Desktop** (Mac/Windows) and start it.
2. Open a terminal in this folder and run:

```bash
docker compose up -d --build
```

3. Open **http://localhost:3000**

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

> ⚠️ `docker compose down -v` **deletes the volumes**, which means ALL your edits. Export a backup first (Settings → Export).

---

## ✨ Features

- **Sections & questions**: add, edit, delete and **drag to reorder** (⋮⋮ handle in the sidebar). Use ＋ / ✎ / 🗑 on a section header.
- **Block editor** (click ✏️ Edit on a question):
  - 📖 **Rich text**: bold, italic, underline, **highlight colours**, **text colours**, headings, lists, quotes, links, tables
  - 🖍️ **Highlight / note boxes**: Note, Tip, Important, Warning, Understand, Ask-interviewer, or a custom box
  - 🎨 **Colour picker on every box** (12 presets + custom colour)
  - 💻 **Code** blocks with syntax highlighting (JS, TS, JSX, bash, JSON, YAML, Docker, Nginx, SQL…)
  - 🗺️ **Diagrams** (Mermaid: flowcharts, sequence, class, ER, state) with a live preview
  - 📊 **Charts** (bar / line / area from simple CSV)
  - 🖼️ **Images** (upload or paste a URL) and 🔗 **links**
  - Drag, move up/down, duplicate, delete and fold blocks. **Ctrl/Cmd + S** saves.
- **⚡ Quick Revise**: every quick note in one page, filterable by section, must-know only, printable. **Select any text** in a question → **📌 Add to Quick Revise**.
- **🏋️ Practice mode** (top bar) blurs the solutions until you click, so you try first.
- **▶ Run**: runs plain JavaScript examples in a sandboxed web worker and shows the console output.
- **Progress tracking**: status per question (Not started / Learning / Needs revision / Confident), ⭐ importance, ★ starred, and a dashboard chart.
- **Search** across titles, content, code and notes. Filters: Must-know, Starred, To learn.
- **Backup**: Export / Import JSON, or Reset to the default content (Settings).
- Light / dark theme, and it works on mobile.

---

## 🧱 Architecture (also a good interview story!)

```
React (Vite) + React Query + Tiptap editor + Mermaid + Recharts
        │  axios → /api/*
        ▼
Nginx  (serves the React build, reverse-proxies /api and /uploads)
        ▼
Express API  routes → controllers → services → repositories   (zod validation,
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
        └── pages/ (Dashboard, QuestionPage, RevisePage, SettingsPage)
```

### How content is stored
- `sections` collection: `{ title, icon, color, description, order }`
- `questions` collection: `{ section, title, priority, tags, status, starred, order, blocks[], quickNotes[] }`
- Each block: `{ id, type: text|callout|code|diagram|chart|image|links, title, content, color, variant, lang, chartType }`

The default content is seeded **only when the database is empty**, so your edits are never overwritten.

### Editing the default question bank (optional)
The seed files in `server/src/seed/content/*.md` use a simple format (`=== Question`, `::: code javascript`, `::: understand`, `::: ask`, …). After changing them, go to **Settings → Reset to default content** (this replaces your current data).

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Change the left-hand port in `docker-compose.yml` (e.g. `"3001:80"`, `"5051:5050"`, `"27019:27017"`) |
| Page loads but says "Is the API running?" | `docker compose logs api`; the API waits for MongoDB to be healthy on the first start |
| Build fails on `npm install` | Check your internet / proxy, then `docker compose build --no-cache` |
| Want to start fresh | Settings → Reset, or `docker compose down -v && docker compose up -d --build` |

### Local development without Docker (optional)
```bash
# terminal 1 — needs a MongoDB running on 27017
cd server && npm install && MONGO_URI=mongodb://localhost:27017/interview_prep npm run dev
# terminal 2
cd client && npm install && npm run dev   # http://localhost:5173 (proxies /api to :5050)
```
