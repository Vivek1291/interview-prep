@section Frontend LLD
@icon 🎨
@color #db2777
@desc Frontend low-level design with COMPLETE runnable React (Vite) projects: data table, autocomplete, toast, forms, modal, data-fetching layer, auth, file upload, chat and a design system. Every design: requirements, component tree + sequence diagrams, every file in full (components, hooks, CSS, App.jsx), a run guide, a browser simulation with tests, trade-offs and accessibility notes.

=== Design a reusable Data Table
@p 3
@tags lld, react, table, virtualization
@quick
- Props API: `columns` (key, header, sortable, render, width), `data` **or** `fetchRows` (server mode), `pageSize`, `selectable`, `onSelectionChange`, `virtualized`.
- Keep the logic **pure** (`sortRows`, `filterRows`, `paginate`) and the state in one hook/reducer; the component only renders.
- **Server-side mode**: send `{ page, pageSize, sortBy, sortDir, filter }`; render `loading / error / empty` states; ignore stale responses.
- **Virtualization**: render only the visible rows (`scrollTop / rowHeight`) so 10,000 rows stay smooth.
- Accessibility: real `<table>`, `aria-sort` on headers, buttons for sorting, labelled checkboxes, `aria-busy` while loading.

::: text 🧒 In simple words
A data table is the **Excel sheet inside your web app**: a list of users, orders or devices that people sort, search, page through and select. Every admin dashboard (Stripe, Jira, AWS console) has one. Building it as a **reusable component** means every page passes in *what* to show (columns + data), and the table handles *how* (sorting, paging, selection, loading states) in one consistent, tested place.
:::

::: text 📋 Requirements
### Functional
- Column configuration: header text, which columns sort, custom cell rendering (badges, buttons).
- Sorting (click header: ascending → descending → none), global text filter, pagination with page-size choice.
- Row selection with "select all on this page" (indeterminate state), selection reported to the parent.
- **Two data modes**: client (the table sorts/filters an array) and server (the table asks an API for one page).
- Loading, error (with retry) and empty states.
- Virtualization for very long lists.

### Non-functional
- Smooth with 10,000 rows (virtualized) and responsive while typing in the filter.
- Accessible (keyboard, screen readers) and themeable with CSS variables.
- No table library: everything is visible and testable.

### Assumptions
- React 18 + Vite, plain CSS. A fake API (`fakeApi.js`) simulates a server with latency and occasional errors.
:::

::: ask
- *"How many rows: hundreds (client-side) or millions (server-side)?"*
- *"Which features are must-haves: sorting, filtering per column, resizing, column hiding, inline editing?"*
- *"Selection across pages, or only the current page?"*
- *"Is the table used on mobile?"* (Card layout vs horizontal scroll.)
- *"Should the URL reflect page/sort/filter (shareable links)?"*
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx (usage)"] --> DT["DataTable (props: columns, data or fetchRows)"]
  DT --> HOOK["useTableState (reducer: sort, filter, page, selection)"]
  DT --> UTIL["tableUtils (pure: sortRows, filterRows, paginate)"]
  DT --> TB["Toolbar: filter input, selected count"]
  DT --> TH["Header row: sortable buttons with aria-sort"]
  DT --> BODY{"virtualized?"}
  BODY -->|"no"| ROWS["Visible page rows"]
  BODY -->|"yes"| VR["useVirtualRows: only rows in the viewport"]
  DT --> ST["States: loading, error + retry, empty"]
  DT --> PG["Pagination: prev, next, page size"]
:::

::: diagram Sequence: server-side sorting
sequenceDiagram
  participant U as User
  participant DT as DataTable
  participant S as useTableState
  participant API as fetchRows (server)
  U->>DT: click "Name" header
  DT->>S: dispatch toggleSort("name")
  S-->>DT: state sortBy name asc, page 1
  DT->>API: fetchRows(page 1, size 10, name asc, filter)
  DT->>DT: loading (aria-busy true)
  API-->>DT: rows + total
  DT->>DT: ignore if a newer request started, else render rows
  DT-->>U: sorted page 1 of N
:::

::: image Data table: state hook, pure helpers, client or server data, virtualized body
/images/frontend-lld/data-table.svg
:::

::: text 🧱 Design
### Component API
| Prop | Type | Purpose |
|---|---|---|
| `columns` | `[{ key, header, sortable?, width?, render?(row) }]` | What to show and how |
| `data` | `object[]` | Client mode: all rows |
| `fetchRows` | `({ page, pageSize, sortBy, sortDir, filter }) => Promise<{ rows, total }>` | Server mode (used when `data` is not given) |
| `rowKey` | `string` (default `"id"`) | Stable key for rows and selection |
| `pageSize` | `number` (default 10) | Initial page size |
| `selectable` / `onSelectionChange` | `boolean` / `(ids) => void` | Row selection |
| `virtualized` / `height` / `rowHeight` | `boolean` / px / px | Render only visible rows (shows all rows, no pagination) |
| `emptyMessage` | `string` | Text for the empty state |

### State shape (`useTableState`)
`{ sortBy, sortDir: 'asc' | 'desc' | null, filter, page, pageSize, selected: Set<id> }`: changing sort/filter/pageSize resets `page` to 1.

### Responsibilities
| Piece | Responsibility |
|---|---|
| `tableUtils.js` | Pure functions: easy to unit test, reused by the fake server |
| `useTableState.js` | `useReducer` with named actions (`toggleSort`, `setFilter`, `setPage`, `toggleRow`, `togglePage`…) |
| `useVirtualRows.js` | From `scrollTop`, `rowHeight` and `height` → `{ start, end, offsetTop, totalHeight }` |
| `DataTable.jsx` | Wires state → data (client or server) → markup; loading/error/empty |
:::

::: text 📁 Folder structure
`data-table/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/data/fakeApi.js`
↳ `src/components/DataTable/DataTable.jsx`
↳ `src/components/DataTable/useTableState.js`
↳ `src/components/DataTable/useVirtualRows.js`
↳ `src/components/DataTable/tableUtils.js`
↳ `src/components/DataTable/DataTable.css`
:::

::: code json data-table/package.json
{
  "name": "data-table",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
:::

::: code javascript data-table/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
:::

::: code html data-table/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data Table LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx data-table/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx data-table/src/App.jsx
// Three usages of the same component: client data, server data, virtualized 10,000 rows.
import { useMemo, useState } from 'react';
import { DataTable } from './components/DataTable/DataTable.jsx';
import { makeUsers, fetchUsersPage } from './data/fakeApi.js';

const statusBadge = (row) => <span className={`badge badge-${row.status}`}>{row.status}</span>;

const columns = [
  { key: 'id', header: 'ID', sortable: true, width: 70 },
  { key: 'name', header: 'Name', sortable: true },
  { key: 'email', header: 'Email', sortable: true },
  { key: 'role', header: 'Role', sortable: true, width: 110 },
  { key: 'status', header: 'Status', sortable: true, width: 110, render: statusBadge },
];

export default function App() {
  const smallData = useMemo(() => makeUsers(57), []);
  const bigData = useMemo(() => makeUsers(10000), []);
  const [selected, setSelected] = useState([]);

  return (
    <main className="page">
      <h1>Data Table</h1>

      <h2>1. Client-side (57 rows): sort, filter, paginate, select</h2>
      <DataTable columns={columns} data={smallData} pageSize={10} selectable onSelectionChange={setSelected} />
      <p className="muted">Selected ids: {selected.length ? selected.join(', ') : 'none'}</p>

      <h2>2. Server-side (fake API with latency and random errors)</h2>
      <DataTable columns={columns} fetchRows={fetchUsersPage} pageSize={10} emptyMessage="No users match your search" />

      <h2>3. Virtualized: 10,000 rows, only the visible ones are in the DOM</h2>
      <DataTable columns={columns} data={bigData} virtualized height={360} rowHeight={40} />
    </main>
  );
}
:::

::: code javascript data-table/src/data/fakeApi.js
// Fake data + a fake server that uses the SAME pure helpers as the client mode.
import { filterRows, sortRows, paginate } from '../components/DataTable/tableUtils.js';

const FIRST = ['Asha', 'Ben', 'Chen', 'Divya', 'Eli', 'Fatima', 'Gopal', 'Hana', 'Ivan', 'Jaya'];
const LAST = ['Rao', 'Smith', 'Li', 'Kumar', 'Cohen', 'Ali', 'Nair', 'Sato', 'Petrov', 'Singh'];
const ROLES = ['admin', 'editor', 'viewer'];
const STATUSES = ['active', 'invited', 'suspended'];

export function makeUsers(count) {
  return Array.from({ length: count }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    return {
      id: i + 1,
      name: `${first} ${last}`,
      email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
      role: ROLES[(i * 3) % ROLES.length],
      status: STATUSES[(i * 5) % STATUSES.length],
    };
  });
}

const SERVER_DB = makeUsers(240);

/** Pretends to be GET /api/users?page=&pageSize=&sortBy=&sortDir=&filter= */
export function fetchUsersPage({ page, pageSize, sortBy, sortDir, filter }) {
  return new Promise((resolve, reject) => {
    const latency = 300 + Math.random() * 500;          // network delay
    setTimeout(() => {
      if (Math.random() < 0.1) return reject(new Error('Server error (simulated 10% failure)'));
      const filtered = filterRows(SERVER_DB, filter, ['name', 'email', 'role', 'status']);
      const sorted = sortRows(filtered, sortBy, sortDir);
      resolve({ rows: paginate(sorted, page, pageSize), total: filtered.length });
    }, latency);
  });
}
:::

::: code javascript data-table/src/components/DataTable/tableUtils.js
// Pure helpers: no React, no DOM → trivial to test and reusable on the server.

/** Case-insensitive "contains" search across the given keys. */
export function filterRows(rows, filter, keys) {
  const q = (filter || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => keys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)));
}

/** Stable sort by one key; numbers numerically, strings with localeCompare. Returns a NEW array. */
export function sortRows(rows, sortBy, sortDir) {
  if (!sortBy || !sortDir) return rows;
  const factor = sortDir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))                    // remember the original order (stability)
    .sort((a, b) => {
      const x = a.row[sortBy], y = b.row[sortBy];
      let cmp;
      if (typeof x === 'number' && typeof y === 'number') cmp = x - y;
      else cmp = String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return cmp !== 0 ? cmp * factor : a.index - b.index;
    })
    .map(({ row }) => row);
}

/** 1-based page slice. */
export function paginate(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Total pages (at least 1 so the UI can always show "page 1 of 1"). */
export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Header click cycles: none → asc → desc → none. */
export function nextSort(current, key) {
  if (current.sortBy !== key) return { sortBy: key, sortDir: 'asc' };
  if (current.sortDir === 'asc') return { sortBy: key, sortDir: 'desc' };
  return { sortBy: null, sortDir: null };
}
:::

::: code javascript data-table/src/components/DataTable/useTableState.js
// All table state in one reducer: every change is a named action (easy to reason about and log).
import { useReducer } from 'react';
import { nextSort } from './tableUtils.js';

function reducer(state, action) {
  switch (action.type) {
    case 'toggleSort':
      return { ...state, ...nextSort(state, action.key), page: 1 };          // new order → back to page 1
    case 'setFilter':
      return { ...state, filter: action.value, page: 1 };
    case 'setPage':
      return { ...state, page: action.page };
    case 'setPageSize':
      return { ...state, pageSize: action.pageSize, page: 1 };
    case 'toggleRow': {
      const selected = new Set(state.selected);
      selected.has(action.id) ? selected.delete(action.id) : selected.add(action.id);
      return { ...state, selected };
    }
    case 'togglePage': {                                                      // header checkbox
      const selected = new Set(state.selected);
      const allSelected = action.ids.length > 0 && action.ids.every((id) => selected.has(id));
      action.ids.forEach((id) => (allSelected ? selected.delete(id) : selected.add(id)));
      return { ...state, selected };
    }
    default:
      throw new Error(`Unknown table action ${action.type}`);
  }
}

export function useTableState({ pageSize = 10 } = {}) {
  const [state, dispatch] = useReducer(reducer, {
    sortBy: null,
    sortDir: null,
    filter: '',
    page: 1,
    pageSize,
    selected: new Set(),
  });
  return [state, dispatch];
}

export { reducer as tableReducer };
:::

::: code javascript data-table/src/components/DataTable/useVirtualRows.js
// Windowing: only the rows inside the scroll viewport (+ a small overscan) are rendered.
import { useState, useCallback } from 'react';

export function useVirtualRows({ count, rowHeight, height, overscan = 5 }) {
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(height / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visibleCount);

  return {
    start,                                   // first rendered row index
    end,                                     // one past the last rendered row
    offsetTop: start * rowHeight,            // space above the rendered rows
    totalHeight: count * rowHeight,          // makes the scrollbar the right size
    onScroll,
  };
}
:::

::: code jsx data-table/src/components/DataTable/DataTable.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTableState } from './useTableState.js';
import { useVirtualRows } from './useVirtualRows.js';
import { filterRows, sortRows, paginate, pageCount } from './tableUtils.js';
import './DataTable.css';

export function DataTable({
  columns,
  data,                       // client mode when provided
  fetchRows,                  // server mode when data is undefined
  rowKey = 'id',
  pageSize = 10,
  selectable = false,
  onSelectionChange,
  virtualized = false,
  height = 400,
  rowHeight = 40,
  emptyMessage = 'No rows to show',
}) {
  const [state, dispatch] = useTableState({ pageSize });
  const isServer = data === undefined;
  const searchKeys = useMemo(() => columns.map((c) => c.key), [columns]);

  // ---------- client mode: derive rows with pure helpers ----------
  const clientResult = useMemo(() => {
    if (isServer) return null;
    const filtered = filterRows(data, state.filter, searchKeys);
    const sorted = sortRows(filtered, state.sortBy, state.sortDir);
    return { all: sorted, total: sorted.length };
  }, [isServer, data, state.filter, state.sortBy, state.sortDir, searchKeys]);

  // ---------- server mode: fetch one page, ignore stale responses ----------
  const [server, setServer] = useState({ rows: [], total: 0, loading: false, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    if (!isServer) return;
    const id = ++requestId.current;                                   // a newer request makes older ones stale
    setServer((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {                                  // small debounce while typing in the filter
      fetchRows({ page: state.page, pageSize: state.pageSize, sortBy: state.sortBy, sortDir: state.sortDir, filter: state.filter })
        .then(({ rows, total }) => { if (id === requestId.current) setServer({ rows, total, loading: false, error: null }); })
        .catch((err) => { if (id === requestId.current) setServer((s) => ({ ...s, loading: false, error: err.message })); });
    }, 250);
    return () => clearTimeout(timer);
  }, [isServer, fetchRows, state.page, state.pageSize, state.sortBy, state.sortDir, state.filter, reloadKey]);

  const total = isServer ? server.total : clientResult.total;
  const pageRows = isServer
    ? server.rows
    : virtualized
      ? clientResult.all
      : paginate(clientResult.all, state.page, state.pageSize);
  const pages = pageCount(total, state.pageSize);

  // ---------- selection ----------
  const pageIds = pageRows.map((r) => r[rowKey]);
  const selectedOnPage = pageIds.filter((id) => state.selected.has(id)).length;
  const headerCheckbox = useRef(null);
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }, [selectedOnPage, pageIds.length]);
  useEffect(() => {
    if (onSelectionChange) onSelectionChange([...state.selected]);
  }, [state.selected, onSelectionChange]);

  // ---------- virtualization ----------
  const virtual = useVirtualRows({ count: virtualized ? pageRows.length : 0, rowHeight, height });
  const visibleRows = virtualized ? pageRows.slice(virtual.start, virtual.end) : pageRows;
  const colCount = columns.length + (selectable ? 1 : 0);

  const renderRow = (row) => (
    <tr key={row[rowKey]} className={state.selected.has(row[rowKey]) ? 'is-selected' : undefined} style={virtualized ? { height: rowHeight } : undefined}>
      {selectable && (
        <td className="dt-check">
          <input
            type="checkbox"
            aria-label={`Select row ${row[rowKey]}`}
            checked={state.selected.has(row[rowKey])}
            onChange={() => dispatch({ type: 'toggleRow', id: row[rowKey] })}
          />
        </td>
      )}
      {columns.map((col) => (
        <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
      ))}
    </tr>
  );

  let body;
  if (isServer && server.error) {
    body = (
      <tr><td colSpan={colCount} className="dt-state dt-error">
        {server.error} <button type="button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
      </td></tr>
    );
  } else if (!(isServer && server.loading) && pageRows.length === 0) {
    body = <tr><td colSpan={colCount} className="dt-state">{emptyMessage}</td></tr>;
  } else if (virtualized) {
    body = (
      <>
        <tr aria-hidden="true" style={{ height: virtual.offsetTop }} />
        {visibleRows.map(renderRow)}
        <tr aria-hidden="true" style={{ height: virtual.totalHeight - virtual.offsetTop - visibleRows.length * rowHeight }} />
      </>
    );
  } else {
    body = visibleRows.map(renderRow);
  }

  return (
    <div className="dt">
      <div className="dt-toolbar">
        <input
          type="search"
          className="dt-filter"
          placeholder="Filter…"
          aria-label="Filter rows"
          value={state.filter}
          onChange={(e) => dispatch({ type: 'setFilter', value: e.target.value })}
        />
        <span className="dt-meta" aria-live="polite">
          {total} rows{selectable && state.selected.size ? ` · ${state.selected.size} selected` : ''}
          {isServer && server.loading ? ' · loading…' : ''}
        </span>
      </div>

      <div className="dt-scroll" style={virtualized ? { height } : undefined} onScroll={virtualized ? virtual.onScroll : undefined}>
        <table aria-busy={isServer && server.loading}>
          <thead>
            <tr>
              {selectable && (
                <th className="dt-check">
                  <input
                    ref={headerCheckbox}
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                    onChange={() => dispatch({ type: 'togglePage', ids: pageIds })}
                  />
                </th>
              )}
              {columns.map((col) => {
                const active = state.sortBy === col.key ? state.sortDir : null;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
                  >
                    {col.sortable ? (
                      <button type="button" className="dt-sort" onClick={() => dispatch({ type: 'toggleSort', key: col.key })}>
                        {col.header}
                        <span aria-hidden="true">{active === 'asc' ? ' ▲' : active === 'desc' ? ' ▼' : ' ↕'}</span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={isServer && server.loading ? 'is-loading' : undefined}>{body}</tbody>
        </table>
      </div>

      {!virtualized && (
        <div className="dt-pagination">
          <button type="button" disabled={state.page <= 1} onClick={() => dispatch({ type: 'setPage', page: state.page - 1 })}>‹ Prev</button>
          <span>Page {state.page} of {pages}</span>
          <button type="button" disabled={state.page >= pages} onClick={() => dispatch({ type: 'setPage', page: state.page + 1 })}>Next ›</button>
          <label>
            Rows per page{' '}
            <select value={state.pageSize} onChange={(e) => dispatch({ type: 'setPageSize', pageSize: Number(e.target.value) })}>
              {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
:::

::: code css data-table/src/components/DataTable/DataTable.css
.dt { --dt-border: #d5dbe5; --dt-head: #f1f4f9; --dt-hover: #f6f8fc; --dt-selected: #e8edff; --dt-accent: #4f46e5;
  border: 1px solid var(--dt-border); border-radius: 10px; overflow: hidden; background: #fff; }
.dt-toolbar { display: flex; gap: 12px; align-items: center; padding: 10px; border-bottom: 1px solid var(--dt-border); }
.dt-filter { flex: 1; max-width: 280px; padding: 6px 10px; border: 1px solid var(--dt-border); border-radius: 6px; }
.dt-meta { color: #64748b; font-size: 13px; }
.dt-scroll { overflow: auto; }
.dt table { width: 100%; border-collapse: collapse; font-size: 14px; }
.dt th, .dt td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--dt-border); white-space: nowrap; }
.dt thead th { position: sticky; top: 0; background: var(--dt-head); z-index: 1; }
.dt tbody tr:hover { background: var(--dt-hover); }
.dt tr.is-selected { background: var(--dt-selected); }
.dt-sort { all: unset; cursor: pointer; font-weight: 600; }
.dt-sort:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: 2px; border-radius: 3px; }
.dt-check { width: 36px; }
.dt-state { text-align: center; color: #64748b; padding: 24px; }
.dt-error { color: #b91c1c; }
.dt tbody.is-loading { opacity: 0.5; }
.dt-pagination { display: flex; gap: 12px; align-items: center; padding: 10px; justify-content: flex-end; font-size: 14px; }
.dt-pagination button { padding: 4px 10px; border: 1px solid var(--dt-border); border-radius: 6px; background: #fff; cursor: pointer; }
.dt-pagination button:disabled { opacity: 0.4; cursor: default; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.badge-active { background: #d1fae5; color: #065f46; }
.badge-invited { background: #fef3c7; color: #92400e; }
.badge-suspended { background: #fee2e2; color: #991b1b; }
@media (prefers-color-scheme: dark) {
  .dt { --dt-border: #2b3650; --dt-head: #18213a; --dt-hover: #1a2440; --dt-selected: #23305a; background: #111827; color: #e5e7eb; }
  .dt-pagination button, .dt-filter { background: #111827; color: inherit; }
}
:::

::: code css data-table/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 1000px; margin: 0 auto; padding: 24px 16px 64px; }
h2 { font-size: 18px; margin-top: 32px; }
.muted { color: #64748b; font-size: 14px; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } }
:::

::: code javascript Browser simulation: pure table logic and the reducer (runnable)
// Same algorithms as tableUtils.js + the reducer, tested without React.
function filterRows(rows, filter, keys) { const q = (filter || '').trim().toLowerCase(); return q ? rows.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q))) : rows; }
function sortRows(rows, sortBy, sortDir) {
  if (!sortBy || !sortDir) return rows;
  const f = sortDir === 'asc' ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = a.row[sortBy], y = b.row[sortBy];
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp * f : a.index - b.index;
  }).map((x) => x.row);
}
const paginate = (rows, page, size) => rows.slice((page - 1) * size, (page - 1) * size + size);
function nextSort(cur, key) { if (cur.sortBy !== key) return { sortBy: key, sortDir: 'asc' }; if (cur.sortDir === 'asc') return { sortBy: key, sortDir: 'desc' }; return { sortBy: null, sortDir: null }; }
function virtualWindow(scrollTop, rowHeight, height, count, overscan = 5) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  return { start, end: Math.min(count, start + Math.ceil(height / rowHeight) + overscan * 2) };
}

// ---------- tests ----------
const rows = [
  { id: 1, name: 'Chen', role: 'admin' }, { id: 2, name: 'asha', role: 'viewer' },
  { id: 3, name: 'Ben', role: 'admin' }, { id: 10, name: 'Divya', role: 'editor' },
];
const names = (rs) => rs.map((r) => r.name).join(',');
console.log('sort name asc (case-insensitive) →', names(sortRows(rows, 'name', 'asc')), names(sortRows(rows, 'name', 'asc')) === 'asha,Ben,Chen,Divya' ? '✅' : '❌ FAIL');
console.log('sort id desc (numeric, not "10" < "2") →', sortRows(rows, 'id', 'desc').map((r) => r.id).join(), sortRows(rows, 'id', 'desc').map((r) => r.id).join() === '10,3,2,1' ? '✅' : '❌ FAIL');
console.log('stable: equal roles keep input order →', names(sortRows(rows, 'role', 'asc')), names(sortRows(rows, 'role', 'asc')) === 'Chen,Ben,Divya,asha' ? '✅' : '❌ FAIL');
console.log('filter "ADMIN" →', names(filterRows(rows, 'ADMIN', ['name', 'role'])), filterRows(rows, 'ADMIN', ['name', 'role']).length === 2 ? '✅' : '❌ FAIL');
console.log('page 2 of size 3 →', names(paginate(rows, 2, 3)), names(paginate(rows, 2, 3)) === 'Divya' ? '✅' : '❌ FAIL');
let s = { sortBy: null, sortDir: null };
const cycle = [1, 2, 3].map(() => { s = nextSort(s, 'name'); return s.sortDir; });
console.log('header click cycle →', JSON.stringify(cycle), JSON.stringify(cycle) === '["asc","desc",null]' ? '✅' : '❌ FAIL');
const w = virtualWindow(4000, 40, 360, 10000);
console.log('virtual window at scrollTop 4000 → rows', w.start, 'to', w.end, '(only', w.end - w.start, 'of 10000 rendered)', w.start === 95 && w.end - w.start === 19 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then:
`cd data-table && npm install && npm run dev` → open the printed URL (e.g. `http://localhost:5173`).
2. **Client table**: click **Name** → ▲ ascending, again → ▼ descending, again → unsorted. Type `admin` in the filter → only admins, page resets to 1. Change "Rows per page" to 25.
3. **Selection**: tick two rows → "2 selected" and the ids appear below the table; the header checkbox shows the indeterminate dash; click it to select the whole page.
4. **Server table**: each sort/page/filter change shows "loading…" (rows fade), about 10% of requests fail on purpose → the error row with **Retry**. Type quickly: only the last request is shown (stale responses are ignored).
5. **Virtualized table**: scroll fast through 10,000 rows; in DevTools → Elements, the `<tbody>` holds only ~20 `<tr>` at any time.
6. **Accessibility**: Tab to a header button and press Enter to sort; a screen reader announces "column header, sorted ascending" thanks to `aria-sort`.
7. **Production build**: `npm run build` → `dist/` ready to deploy.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Where data work happens | **Client-side** (sort/filter in the browser) | **Server-side** (API returns one page) | Client below ~5,000 rows; server for big or private datasets |
| Long lists | Pagination | **Virtualization** (windowing) | Pagination for business tables; virtualization for logs/feeds/large exports |
| Pagination style | Offset (`page`, `pageSize`) | Cursor (`after=<id>`) | Offset for "jump to page 7"; cursor for infinite scroll on huge data |
| Library | **Own component** (this) | TanStack Table (headless), AG Grid (full-featured) | TanStack Table when features grow; AG Grid for spreadsheet-like needs |
| State location | Inside the table | **URL query params** (`?page=2&sort=name`) | URL when links must be shareable/back-button friendly |
| Markup | `<div>` grid | **Semantic `<table>`** | `<table>` for accessibility (div grids need many ARIA roles) |
:::

::: text 📈 Scaling & edge cases
- **Huge datasets**: server-side everything, debounce the filter, cancel old requests (`AbortController`), cache pages (React Query).
- **Performance**: memoise derived rows (`useMemo`), stable `rowKey`, `React.memo` for row components, virtualization (with fixed row heights; variable heights need measurement).
- **Selection across pages / "select all 10,000"**: store "all selected except these ids" instead of a giant Set.
- **Accessibility**: `aria-sort`, labelled checkboxes, focus styles, keyboard-reachable controls, `aria-live` count; don't rely on colour alone for status.
- **Edge cases**: empty data, filter with no matches, deleting rows so the current page becomes empty (step back a page), very long cell text (truncate with title), null values in sort.
:::

::: warning ⚠️ Common mistakes
- Sorting the `data` prop **in place** (`data.sort(...)`) → mutates the parent's state.
- Using the array index as `key` → selection and focus jump when sorting.
- Not resetting to page 1 after filtering → "page 5 of 1".
- Showing results from an **old** request after a newer one (race condition).
- Click handlers on `<th>` instead of a `<button>` → not keyboard accessible.
:::

::: understand
- Split **logic** (pure functions + reducer) from **presentation** (JSX). The same `filterRows/sortRows/paginate` power the client mode and the fake server, and are unit-tested without a browser.
- Server-side tables are a **contract** with the backend: `page, pageSize, sortBy, sortDir, filter` in, `{ rows, total }` out (see the Express pagination question).
:::

::: important ⭐ How to present this design in 5 minutes
> "I'd start by clarifying data size and must-have features. The component API takes columns with key, header, sortable and an optional render function, plus either a data array for client mode or a fetchRows function for server mode. All state, sort, filter, page, page size and selection, lives in one reducer with named actions; changing sort or filter resets to page one. Data logic is pure functions, so client mode derives rows with useMemo, and server mode sends page, size, sort and filter to the API, shows loading, error with retry and empty states, and ignores stale responses. Selection supports select-all-on-page with an indeterminate checkbox. For 10,000 rows I virtualize: only rows in the viewport are rendered. It's a semantic table with aria-sort and keyboard-accessible sort buttons."
:::

::: links
MDN: aria-sort | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-sort
TanStack Table (headless) | https://tanstack.com/table/latest
web.dev: virtualize long lists | https://web.dev/articles/virtualize-long-lists-react-window
React: useReducer | https://react.dev/reference/react/useReducer
:::

=== Design an Autocomplete / Search component
@p 3
@tags lld, react, debounce, a11y
@quick
- **Debounce** input (~250 ms) → fewer requests; **AbortController** cancels the previous request; ignore stale responses.
- **Cache** results per `query + page` (small LRU) → instant results when the user types back.
- **Keyboard**: ↓/↑ move the active option, Enter selects, Escape closes; ARIA **combobox** pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"/"option"`).
- **Infinite scroll** in the listbox: load the next page when the user scrolls near the bottom (or reaches the last item with ↓).
- States: idle (min chars), loading, results, empty, error with retry; highlight the matching text.

::: text 🧒 In simple words
An autocomplete is the **search box that suggests things as you type**: Google search, the "To:" field in Gmail, city pickers on travel sites. It feels simple, but it must not send a request for every keystroke, must show the *latest* results (not an older slow response), must work with the keyboard, and must be understandable by screen readers. It's like a **helpful shop assistant** who waits until you've finished saying a word, remembers what you asked a minute ago, and points to the item you're considering.
:::

::: text 📋 Requirements
### Functional
- Type to search (minimum 2 characters); suggestions appear in a dropdown.
- Keyboard navigation (↓ ↑ Enter Escape) and mouse selection; `onSelect(item)` callback.
- Load more results when scrolling to the end of the list (infinite scroll, 10 per page).
- Loading, empty, and error (retry) states; matching text highlighted.

### Non-functional
- At most ~1 request per pause in typing; old requests cancelled; no flicker of stale results.
- Repeated queries served from cache.
- WAI-ARIA combobox pattern; usable without a mouse.

### Assumptions
- React 18 + Vite. A fake search API (`searchApi.js`) over ~400 cities, with latency, pagination and abort support.
:::

::: ask
- *"Where does the data come from: our API, a third party, a local list?"* (Local → no network concerns.)
- *"How fast does the API respond? Is there a rate limit?"* (Debounce/caching.)
- *"Free text allowed, or must the value be one of the options?"*
- *"Multi-select (chips)? Recent searches?"*
- *"Mobile keyboards and screen readers: which ones must we support?"*
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx"] --> AC["Autocomplete (label, fetchPage, onSelect)"]
  AC --> HOOK["useAutocomplete (state + effects)"]
  HOOK --> DB["useDebouncedValue (250 ms)"]
  HOOK --> CACHE["LruCache (query and page to results)"]
  HOOK --> API["fetchPage(query, page, signal)"]
  AC --> INPUT["input role combobox"]
  AC --> LIST["ul role listbox (scroll → load more)"]
  LIST --> OPT["li role option + Highlight"]
  AC --> STATES["loading / empty / error + retry"]
:::

::: diagram Sequence: typing fast, then picking with the keyboard
sequenceDiagram
  participant U as User
  participant AC as Autocomplete
  participant H as useAutocomplete
  participant API as Search API
  U->>AC: types "b", "be", "ber" quickly
  AC->>H: query changes (debounce resets each time)
  H->>H: 250 ms pause, debounced query "ber"
  H->>H: cache miss for ber page 1
  H->>API: fetchPage("ber", 1, signal)
  U->>AC: types "berl"
  H->>API: abort previous, fetchPage("berl", 1)
  API-->>H: results for berl
  H-->>AC: options, open listbox
  U->>AC: ArrowDown, ArrowDown, Enter
  AC->>AC: activeIndex 1, select option
  AC-->>U: input shows "Berlin", listbox closes
:::

::: image Autocomplete: debounce, cache, abort, listbox with keyboard navigation and infinite scroll
/images/frontend-lld/autocomplete.svg
:::

::: text 🧱 Design
### Component API
| Prop | Type | Purpose |
|---|---|---|
| `label` | string | Visible label (also the accessible name) |
| `fetchPage` | `(query, page, signal) => Promise<{ items, hasMore }>` | Data source |
| `getLabel` | `(item) => string` | Text shown for an item |
| `onSelect` | `(item) => void` | Called when the user picks an item |
| `minChars` / `debounceMs` | number | Defaults 2 / 250 |

### Hook state (`useAutocomplete`)
`{ query, items, page, hasMore, status: 'idle' | 'loading' | 'success' | 'error', error, open, activeIndex }`

### Responsibilities
| Piece | Responsibility |
|---|---|
| `useDebouncedValue` | Returns the value only after it stopped changing for `delay` ms |
| `LruCache` | Bounded `Map` (oldest entry evicted); key `query::page` |
| `useAutocomplete` | Fetch on debounced query, abort previous, merge pages, keyboard handlers, open/close |
| `Highlight` | Wraps the matched part in `<mark>` (escapes nothing dangerous: React escapes text) |
| `Autocomplete.jsx` | ARIA markup, scroll listener for infinite loading, states |
:::

::: text 📁 Folder structure
`autocomplete/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/api/searchApi.js`
↳ `src/components/Autocomplete/Autocomplete.jsx`, `useAutocomplete.js`, `useDebouncedValue.js`, `LruCache.js`, `Highlight.jsx`, `Autocomplete.css`
:::

::: code json autocomplete/package.json
{
  "name": "autocomplete",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript autocomplete/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code html autocomplete/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Autocomplete LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx autocomplete/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx autocomplete/src/App.jsx
import { useState } from 'react';
import { Autocomplete } from './components/Autocomplete/Autocomplete.jsx';
import { searchCities, requestLog } from './api/searchApi.js';

export default function App() {
  const [picked, setPicked] = useState(null);
  const [, forceRender] = useState(0);

  return (
    <main className="page">
      <h1>Autocomplete</h1>
      <Autocomplete
        label="Destination city"
        fetchPage={searchCities}
        getLabel={(city) => `${city.name}, ${city.country}`}
        onSelect={(city) => { setPicked(city); forceRender((n) => n + 1); }}
      />
      <p className="muted">Selected: {picked ? `${picked.name} (${picked.country})` : 'nothing yet'}</p>
      <p className="muted">
        Requests sent to the "server": {requestLog.length}{' '}
        <button type="button" onClick={() => forceRender((n) => n + 1)}>refresh count</button>
      </p>
      <p className="muted">Try: type "ber" fast, use ↓ ↑ Enter Esc, scroll the list to load more, type "zzz" for the empty state.</p>
    </main>
  );
}
:::

::: code javascript autocomplete/src/api/searchApi.js
// Fake search API: ~400 cities, 10 per page, 200-600 ms latency, 5% errors, supports AbortSignal.
const BASE = [
  ['Berlin', 'Germany'], ['Bern', 'Switzerland'], ['Bergen', 'Norway'], ['Bengaluru', 'India'], ['Beirut', 'Lebanon'],
  ['Belgrade', 'Serbia'], ['Boston', 'USA'], ['Barcelona', 'Spain'], ['Bangkok', 'Thailand'], ['Delhi', 'India'],
  ['Dublin', 'Ireland'], ['Dubai', 'UAE'], ['Mumbai', 'India'], ['Madrid', 'Spain'], ['Munich', 'Germany'],
  ['Paris', 'France'], ['Pune', 'India'], ['Prague', 'Czechia'], ['London', 'UK'], ['Lisbon', 'Portugal'],
];
// Make the list bigger so infinite scroll has something to load: "Berlin", "Berlin 2", …
const CITIES = [];
for (let i = 0; i < 20; i++) for (const [name, country] of BASE) CITIES.push({ id: CITIES.length + 1, name: i ? `${name} ${i + 1}` : name, country });

export const requestLog = [];      // lets the demo show how many requests really happened

export function searchCities(query, page, signal) {
  requestLog.push({ query, page, at: Date.now() });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (Math.random() < 0.05) return reject(new Error('Search service unavailable'));
      const q = query.trim().toLowerCase();
      const matches = CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().startsWith(q));
      const pageSize = 10;
      const items = matches.slice((page - 1) * pageSize, page * pageSize);
      resolve({ items, hasMore: page * pageSize < matches.length });
    }, 200 + Math.random() * 400);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);                            // the "server" stops working on it
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}
:::

::: code javascript autocomplete/src/components/Autocomplete/useDebouncedValue.js
import { useEffect, useState } from 'react';

/** Returns `value` only after it hasn't changed for `delay` ms. */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);               // a new keystroke cancels the pending update
  }, [value, delay]);
  return debounced;
}
:::

::: code javascript autocomplete/src/components/Autocomplete/LruCache.js
// Small LRU cache: Map keeps insertion order, so the first key is the least recently used.
export class LruCache {
  constructor(max = 50) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);                       // mark as recently used
    return value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value); // evict the oldest
  }
}
:::

::: code javascript autocomplete/src/components/Autocomplete/useAutocomplete.js
// All behaviour of the autocomplete: debounced fetching, cache, abort, pages, keyboard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue.js';
import { LruCache } from './LruCache.js';

export function useAutocomplete({ fetchPage, minChars = 2, debounceMs = 250, onSelect, getLabel }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('idle');      // idle | loading | success | error
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retryKey, setRetryKey] = useState(0);

  const debouncedQuery = useDebouncedValue(query, debounceMs);
  const cacheRef = useRef(new LruCache(50));
  const controllerRef = useRef(null);

  const pageQueryRef = useRef('');                  // which query the current `page` belongs to

  // Fetch (or read from cache) the current page
  useEffect(() => {
    if (pageQueryRef.current !== debouncedQuery) {    // new query → always restart at page 1
      pageQueryRef.current = debouncedQuery;
      setActiveIndex(-1);
      if (page !== 1) { setPage(1); return; }         // this effect runs again with page 1
    }
    const q = debouncedQuery.trim();
    if (q.length < minChars) {
      controllerRef.current?.abort();
      setStatus('idle');
      setHasMore(false);
      return;
    }
    const key = `${q.toLowerCase()}::${page}`;
    const cached = cacheRef.current.get(key);
    if (cached) {                                    // instant answer, no request
      setItems((prev) => (page === 1 ? cached.items : [...prev, ...cached.items]));
      setHasMore(cached.hasMore);
      setStatus('success');
      return;
    }
    controllerRef.current?.abort();                  // cancel the previous request
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('loading');
    setError(null);
    fetchPage(q, page, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;        // stale: a newer request is in charge
        cacheRef.current.set(key, result);
        setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setStatus('success');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;        // cancelled on purpose: not an error
        setError(err.message);
        setStatus('error');
      });
    return () => controller.abort();                 // unmount / deps change → cancel
  }, [debouncedQuery, page, minChars, fetchPage, retryKey]);

  const loadMore = useCallback(() => {
    if (status !== 'loading' && hasMore) setPage((p) => p + 1);
  }, [status, hasMore]);

  const select = useCallback((item) => {
    setQuery(getLabel(item));
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(item);
  }, [getLabel, onSelect]);

  const onInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => {
        const next = Math.min(items.length - 1, i + 1);
        if (next >= items.length - 2) loadMore();      // near the end → fetch the next page
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        select(items[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return {
    query, items, status, error, open, activeIndex, hasMore,
    setOpen, setActiveIndex, onInputChange, onKeyDown, select, loadMore,
    retry: () => setRetryKey((k) => k + 1),
    showList: open && debouncedQuery.trim().length >= minChars,
  };
}
:::

::: code jsx autocomplete/src/components/Autocomplete/Highlight.jsx
/** Wraps the first case-insensitive match of `query` in <mark>. React escapes the text, so no XSS. */
export function Highlight({ text, query }) {
  const q = query.trim();
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}
:::

::: code jsx autocomplete/src/components/Autocomplete/Autocomplete.jsx
import { useEffect, useId, useRef } from 'react';
import { useAutocomplete } from './useAutocomplete.js';
import { Highlight } from './Highlight.jsx';
import './Autocomplete.css';

export function Autocomplete({ label, fetchPage, getLabel = (x) => String(x), onSelect, minChars = 2, debounceMs = 250 }) {
  const ac = useAutocomplete({ fetchPage, minChars, debounceMs, onSelect, getLabel });
  const id = useId();
  const listId = `${id}-listbox`;
  const optionId = (i) => `${id}-option-${i}`;
  const listRef = useRef(null);

  // Keep the active option visible while moving with the keyboard
  useEffect(() => {
    if (ac.activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`#${CSS.escape(optionId(ac.activeIndex))}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [ac.activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const onListScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) ac.loadMore(); // 40px from the bottom
  };

  return (
    <div className="ac">
      <label htmlFor={`${id}-input`} className="ac-label">{label}</label>
      <input
        id={`${id}-input`}
        className="ac-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={ac.showList}
        aria-controls={listId}
        aria-activedescendant={ac.activeIndex >= 0 ? optionId(ac.activeIndex) : undefined}
        autoComplete="off"
        value={ac.query}
        placeholder={`Type at least ${minChars} letters…`}
        onChange={ac.onInputChange}
        onKeyDown={ac.onKeyDown}
        onFocus={() => ac.setOpen(true)}
        onBlur={() => setTimeout(() => ac.setOpen(false), 120)} // let a click on an option land first
      />
      {ac.status === 'loading' && <span className="ac-spinner" aria-hidden="true" />}

      {ac.showList && (
        <ul id={listId} role="listbox" className="ac-list" ref={listRef} onScroll={onListScroll} aria-label={`${label} suggestions`}>
          {ac.items.map((item, i) => (
            <li
              key={item.id ?? i}
              id={optionId(i)}
              role="option"
              aria-selected={i === ac.activeIndex}
              className={i === ac.activeIndex ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()}          // keep focus in the input
              onMouseEnter={() => ac.setActiveIndex(i)}
              onClick={() => ac.select(item)}
            >
              <Highlight text={getLabel(item)} query={ac.query} />
            </li>
          ))}
          {ac.status === 'loading' && <li className="ac-info" role="presentation">Loading…</li>}
          {ac.status === 'success' && ac.items.length === 0 && <li className="ac-info" role="presentation">No matches</li>}
          {ac.status === 'error' && (
            <li className="ac-info ac-error" role="presentation">
              {ac.error} <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={ac.retry}>Retry</button>
            </li>
          )}
          {ac.status === 'success' && ac.hasMore && <li className="ac-info" role="presentation">Scroll for more…</li>}
        </ul>
      )}
      <div className="sr-only" aria-live="polite">
        {ac.showList && ac.status === 'success' ? `${ac.items.length} suggestions available` : ''}
      </div>
    </div>
  );
}
:::

::: code css autocomplete/src/components/Autocomplete/Autocomplete.css
.ac { --ac-border: #cbd5e1; --ac-active: #e0e7ff; --ac-accent: #4f46e5; position: relative; max-width: 420px; }
.ac-label { display: block; font-weight: 600; margin-bottom: 6px; }
.ac-input { width: 100%; box-sizing: border-box; padding: 10px 36px 10px 12px; font-size: 16px; border: 1px solid var(--ac-border); border-radius: 8px; }
.ac-input:focus { outline: 2px solid var(--ac-accent); outline-offset: 1px; }
.ac-spinner { position: absolute; right: 12px; top: 42px; width: 14px; height: 14px; border: 2px solid var(--ac-border); border-top-color: var(--ac-accent); border-radius: 50%; animation: ac-spin 0.8s linear infinite; }
@keyframes ac-spin { to { transform: rotate(360deg); } }
.ac-list { position: absolute; z-index: 10; left: 0; right: 0; margin: 4px 0 0; padding: 4px; list-style: none; max-height: 240px; overflow-y: auto; background: #fff; border: 1px solid var(--ac-border); border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); }
.ac-list li { padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.ac-list li.is-active { background: var(--ac-active); }
.ac-list mark { background: #fde68a; color: inherit; border-radius: 2px; }
.ac-info { color: #64748b; cursor: default; font-size: 14px; }
.ac-error { color: #b91c1c; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-color-scheme: dark) {
  .ac { --ac-border: #334155; --ac-active: #1e2a4f; }
  .ac-input, .ac-list { background: #0f172a; color: #e2e8f0; }
  .ac-list mark { background: #854d0e; }
}
:::

::: code css autocomplete/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
.muted { color: #64748b; font-size: 14px; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } }
:::

::: code javascript Browser simulation: debounce, abort, cache and keyboard navigation (runnable)
// The hook's rules as plain functions + a fake API, with short timers.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const requests = [];
function fakeApi(q, page, signal) {
  requests.push(q);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ items: [q + '-1', q + '-2', q + '-3'], hasMore: page < 2 }), q === 'be' ? 60 : 20); // "be" is slow
    signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
}
class LruCache { constructor(max) { this.max = max; this.map = new Map(); } get(k) { if (!this.map.has(k)) return; const v = this.map.get(k); this.map.delete(k); this.map.set(k, v); return v; } set(k, v) { this.map.delete(k); this.map.set(k, v); if (this.map.size > this.max) this.map.delete(this.map.keys().next().value); } }
const cache = new LruCache(2);
let controller = null, shown = null, debounceTimer = null;
function type(q) {                       // what the hook does on every keystroke
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const key = q + '::1', hit = cache.get(key);
    if (hit) { shown = hit; return; }
    controller?.abort();
    const c = (controller = new AbortController());
    try { const r = await fakeApi(q, 1, c.signal); if (!c.signal.aborted) { cache.set(key, r); shown = r; } } catch (e) { if (e.name !== 'AbortError') throw e; }
  }, 30);
}
const move = (index, key, length) => (key === 'ArrowDown' ? Math.min(length - 1, index + 1) : key === 'ArrowUp' ? Math.max(0, index - 1) : index);

// ---------- tests ----------
(async () => {
  type('b'); type('be'); type('ber');                       // fast typing
  await sleep(100);
  console.log('debounce: 3 keystrokes → 1 request →', JSON.stringify(requests), requests.length === 1 && requests[0] === 'ber' ? '✅' : '❌ FAIL');
  type('be'); await sleep(40); type('berl');                 // slow "be" is in flight when "berl" starts
  await sleep(120);
  console.log('stale "be" aborted, "berl" shown →', shown.items[0], shown.items[0] === 'berl-1' ? '✅' : '❌ FAIL');
  const before = requests.length;
  type('ber'); await sleep(60);
  console.log('cached query → no new request →', requests.length === before && shown.items[0] === 'ber-1' ? '✅' : '❌ FAIL');
  let i = -1; ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp'].forEach((k) => (i = move(i, k, 3)));
  console.log('keyboard: ↓↓↓↓↑ over 3 options → index', i, i === 1 ? '✅' : '❌ FAIL');
  cache.set('x::1', 1); cache.set('y::1', 1);
  console.log('LRU keeps only 2 entries →', cache.map.size, cache.map.size === 2 && !cache.map.has('berl::1') ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
1. Create the files, then `cd autocomplete && npm install && npm run dev` → open the printed URL.
2. **Debounce**: type `ber` quickly → one request (the "Requests sent" counter increases by 1 after you click refresh count).
3. **Cache**: change to `berl`, then back to `ber` → results appear instantly; the request counter doesn't grow.
4. **Keyboard**: press ↓ ↓ → the second option is highlighted (and announced); Enter → the input shows the city and "Selected: …" updates; Escape closes the list.
5. **Infinite scroll**: type `be` (hundreds of matches), scroll the dropdown to the bottom → "Loading…" then 10 more results; ↓ at the last items also loads more.
6. **States**: `zzz` → "No matches"; type one letter → no list (min 2 chars); about 1 in 20 requests fails → error with Retry.
7. **Screen reader** (VoiceOver: Cmd+F5): the input is announced as a combobox, the active option is read as you press ↓, and "N suggestions available" is announced.
8. `npm run build` → production bundle.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Request timing | Fetch on every keystroke | **Debounce 200–300 ms** | Debounce (throttle if you want results *while* typing continuously) |
| Stale responses | Ignore by request id | **AbortController** (also frees the network) | Abort + ignore |
| Caching | None | **In-memory LRU** / React Query cache | LRU or React Query (`staleTime`) |
| Data size | Load all options once, filter locally | **Server search with pagination** | Local for < ~1,000 options; server for big/dynamic data |
| More results | "Show more" button | **Infinite scroll** in the listbox | Infinite scroll + keyboard trigger; a button is simpler/more accessible |
| Library | **Own component** (this) | Downshift / React Aria `useComboBox` / Headless UI | A tested a11y library in production |
:::

::: text 📈 Scaling & edge cases
- **API load**: debounce + cache + minimum characters + server-side rate limits; cache popular prefixes at the CDN/edge.
- **Relevance**: search engines (Elasticsearch, Algolia, Typesense) with prefix/fuzzy matching instead of SQL `LIKE '%q%'`.
- **Accessibility**: follow the WAI-ARIA combobox pattern exactly; announce counts; visible focus; don't steal focus; works with IME (Chinese/Japanese composition events).
- **Mobile**: large touch targets, `inputmode`, avoid the dropdown being hidden by the virtual keyboard.
- **Edge cases**: leading/trailing spaces, very fast typing then blur, selecting an item then editing the text, results arriving after the component unmounted (abort in cleanup), special regex characters in the query (we use `indexOf`, not RegExp).
:::

::: warning ⚠️ Common mistakes
- A request per keystroke and **out-of-order** results ("ber" results showing after "berlin").
- `onBlur` closing the list before the click on an option registers (use `onMouseDown` preventDefault or a short delay).
- No keyboard support / no ARIA → unusable for many users.
- Building the highlight with `dangerouslySetInnerHTML` and a RegExp from user input (XSS + regex errors).
- Not resetting the page/active index when the query changes.
:::

::: understand
- Autocomplete combines four classic ideas: **debounce** (from the JS implementations), **cancellation** (AbortController), **caching** (LRU), and **accessible keyboard UX** (combobox pattern).
- Keep behaviour in a hook (`useAutocomplete`) and markup in the component: the hook can then power a different UI (command palette, mention picker).
:::

::: important ⭐ How to present this design in 5 minutes
> "The component takes a label, a fetchPage function and an onSelect callback. A useAutocomplete hook owns the state: query, items, page, status and active index. The query is debounced by about 250 milliseconds; when the debounced query changes I reset to page one, check an LRU cache keyed by query and page, and otherwise abort the previous request with AbortController and fetch the new one, ignoring stale responses. Scrolling near the bottom of the listbox, or arrowing to the last items, loads the next page. Keyboard: down and up move the active option, Enter selects, Escape closes. The markup follows the ARIA combobox pattern with aria-expanded, aria-controls and aria-activedescendant, and a live region announces the number of results. Loading, empty and error-with-retry states are explicit."
:::

::: links
WAI-ARIA APG: Combobox pattern | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
MDN: AbortController | https://developer.mozilla.org/en-US/docs/Web/API/AbortController
React Aria: useComboBox | https://react-spectrum.adobe.com/react-aria/useComboBox.html
Downshift | https://www.downshift-js.com/
:::

=== Design a Toast / Notification system
@p 2
@tags lld, react, context, a11y
@quick
- API callable from anywhere: `toast.success('Saved')`, `toast.error('Failed', { action })`, returns an id; `toast.dismiss(id)`.
- **Global store** outside React + `useSyncExternalStore` in one `<Toaster />` (works in event handlers, services, even non-React code).
- **Queue** with a **max visible** (e.g. 3); extra toasts wait; **priority** (errors jump ahead); **dedupe** identical messages (show ×2).
- **Auto-dismiss** with a timer that **pauses on hover/focus**; errors stay longer; sticky toasts (`duration: 0`).
- Accessibility: `role="status"` (polite) for info/success, `role="alert"` (assertive) for errors; dismiss button with a label; don't steal focus.

::: text 🧒 In simple words
Toasts are the small messages that pop up in a corner ("Saved ✅", "Upload failed ❌") and disappear by themselves, like **notes slid under your door**: they tell you something without blocking what you're doing. A good toast system lets any part of the app post a note with one line of code, doesn't bury the screen when 20 notes arrive at once (it queues them), lets urgent notes cut the line, and makes sure screen-reader users hear them too.
:::

::: text 📋 Requirements
### Functional
- `toast.success / error / info / warning(message, options)` from anywhere; options: `duration`, `action: { label, onClick }`, `id`.
- Up to 3 visible; others queue; errors have priority over other queued toasts.
- Identical toasts are merged with a counter instead of stacking.
- Auto-dismiss (success/info 4 s, warning 6 s, error 8 s); pause while hovered or focused; manual close button.

### Non-functional
- No prop drilling or context needed to *show* a toast; one `<Toaster />` renders them.
- Accessible announcements; keyboard reachable actions; respects reduced motion.

### Assumptions
- React 18 + Vite, no libraries. The store is framework-agnostic plain JS.
:::

::: ask
- *"Where on screen? Stacked newest on top or bottom?"*
- *"How many at once? What happens with bursts (20 errors)?"*
- *"Do some toasts need actions (Undo) or links?"*
- *"Should errors stay until dismissed?"*
- *"Server-side notifications (WebSocket) too, or only local UI feedback?"*
:::

::: diagram Component tree and data flow
flowchart TD
  ANY["Any code: event handler, API layer, store"] -->|"toast.error('Failed')"| API["toast API (toast.js)"]
  API --> STORE["toastStore: visible[], queue[], subscribe()"]
  STORE -->|"useSyncExternalStore"| TOASTER["Toaster (rendered once in App)"]
  TOASTER --> ITEM["ToastItem x visible (role status or alert)"]
  ITEM --> TIMER["useToastTimer: auto-dismiss, pause on hover/focus"]
  ITEM -->|"close / action / timeout"| STORE
  STORE -->|"promote next by priority"| TOASTER
:::

::: diagram Sequence: a burst of toasts with a max of 3
sequenceDiagram
  participant C as Code
  participant S as toastStore
  participant T as Toaster
  C->>S: info A, info B, info C
  S-->>T: visible A, B, C
  C->>S: info D
  S->>S: queue D (max 3 visible)
  C->>S: error E
  S->>S: queue E BEFORE D (priority)
  T->>S: A times out, dismiss(A)
  S->>S: promote E
  S-->>T: visible B, C, E
:::

::: image Toast system: global store with a queue, Toaster renders visible toasts with timers
/images/frontend-lld/toast-system.svg
:::

::: text 🧱 Design
### Public API (`toast.js`)
| Call | Effect |
|---|---|
| `toast.success(msg, opts)` / `info` / `warning` / `error` | Adds a toast, returns its `id` |
| `toast.dismiss(id)` / `toast.clear()` | Removes one / all |
| options | `{ duration?: ms (0 = sticky), action?: { label, onClick }, id?: string }` |

### Store (`toastStore.js`)
State: `{ visible: Toast[], queue: Toast[] }` with `Toast { id, type, message, duration, priority, count, action, createdAt }`.
Rules: dedupe by `type + message` (increase `count`); `visible.length < max` → show, else insert into `queue` sorted by **priority desc, then createdAt**; on dismiss, promote the head of the queue. `subscribe(listener)` + `getSnapshot()` for React.

### Components
| Piece | Responsibility |
|---|---|
| `Toaster` | Subscribes with `useSyncExternalStore`, renders the region and items |
| `ToastItem` | Icon, message, ×count, action, close; `role` by type |
| `useToastTimer` | Remaining-time countdown that pauses/resumes (hover, focus, hidden tab) |
:::

::: text 📁 Folder structure
`toast-system/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/toast/toastStore.js`, `src/toast/toast.js`, `src/toast/useToastTimer.js`, `src/toast/Toaster.jsx`, `src/toast/Toast.css`
:::

::: code json toast-system/package.json
{
  "name": "toast-system",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript toast-system/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code html toast-system/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Toast System LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx toast-system/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx toast-system/src/App.jsx
import { useState } from 'react';
import { Toaster } from './toast/Toaster.jsx';
import { toast } from './toast/toast.js';

// A plain function (not a component): toasts work outside React too
async function fakeSave(shouldFail) {
  await new Promise((r) => setTimeout(r, 300));
  if (shouldFail) throw new Error('Network error while saving');
  return { ok: true };
}

export default function App() {
  const [items, setItems] = useState(['Report.pdf', 'Photo.png', 'Notes.txt']);

  const deleteItem = (name) => {
    setItems((list) => list.filter((x) => x !== name));
    toast.info(`Deleted ${name}`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => setItems((list) => [...list, name]) },
    });
  };

  const save = async (fail) => {
    try {
      await fakeSave(fail);
      toast.success('Changes saved');
    } catch (err) {
      toast.error(err.message, { action: { label: 'Retry', onClick: () => save(false) } });
    }
  };

  return (
    <main className="page">
      <h1>Toast system</h1>
      <div className="row">
        <button type="button" onClick={() => toast.success('Profile updated')}>Success</button>
        <button type="button" onClick={() => toast.info('New version available')}>Info</button>
        <button type="button" onClick={() => toast.warning('Your session expires in 2 minutes')}>Warning</button>
        <button type="button" onClick={() => save(true)}>Save (fails)</button>
        <button type="button" onClick={() => save(false)}>Save (works)</button>
        <button type="button" onClick={() => toast.info('Sticky: stays until closed', { duration: 0 })}>Sticky</button>
        <button type="button" onClick={() => { for (let i = 1; i <= 6; i++) toast.info(`Burst message ${i}`); toast.error('Urgent: payment failed'); }}>
          Burst (6 info + 1 error)
        </button>
        <button type="button" onClick={() => toast.clear()}>Clear all</button>
      </div>

      <h2>Files</h2>
      <ul>
        {items.map((name) => (
          <li key={name}>{name} <button type="button" onClick={() => deleteItem(name)}>Delete</button></li>
        ))}
      </ul>

      <Toaster max={3} />
    </main>
  );
}
:::

::: code javascript toast-system/src/toast/toastStore.js
// Framework-agnostic store: plain JS + subscribe/getSnapshot (works with useSyncExternalStore).
const PRIORITY = { error: 2, warning: 1, success: 0, info: 0 };
export const DEFAULT_DURATION = { success: 4000, info: 4000, warning: 6000, error: 8000 };

export function createToastStore({ max = 3 } = {}) {
  let state = { visible: [], queue: [] };
  let counter = 0;
  const listeners = new Set();

  const emit = () => listeners.forEach((l) => l());
  const set = (next) => { state = next; emit(); };                 // new object → React re-renders

  function insertByPriority(queue, toast) {
    const index = queue.findIndex((t) => t.priority < toast.priority); // first lower-priority item
    return index === -1 ? [...queue, toast] : [...queue.slice(0, index), toast, ...queue.slice(index)];
  }

  function add(type, message, options = {}) {
    const all = [...state.visible, ...state.queue];
    const dup = all.find((t) => t.type === type && t.message === message);
    if (dup) {                                                     // same toast again → count it instead
      const bump = (list) => list.map((t) => (t.id === dup.id ? { ...t, count: t.count + 1, createdAt: Date.now() } : t));
      set({ visible: bump(state.visible), queue: bump(state.queue) });
      return dup.id;
    }
    const toast = {
      id: options.id || `toast-${++counter}`,
      type,
      message,
      duration: options.duration ?? DEFAULT_DURATION[type],
      priority: PRIORITY[type],
      action: options.action || null,
      count: 1,
      createdAt: Date.now(),
    };
    if (state.visible.length < max) set({ ...state, visible: [...state.visible, toast] });
    else set({ ...state, queue: insertByPriority(state.queue, toast) });
    return toast.id;
  }

  function dismiss(id) {
    const visible = state.visible.filter((t) => t.id !== id);
    const queue = state.queue.filter((t) => t.id !== id);
    while (visible.length < max && queue.length) visible.push(queue.shift()); // promote the next in line
    set({ visible, queue });
  }

  return {
    add,
    dismiss,
    clear: () => set({ visible: [], queue: [] }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
  };
}
:::

::: code javascript toast-system/src/toast/toast.js
// The app-wide store + a friendly API. Import { toast } anywhere.
import { createToastStore } from './toastStore.js';

export const toastStore = createToastStore({ max: 3 });

export const toast = {
  success: (message, options) => toastStore.add('success', message, options),
  info: (message, options) => toastStore.add('info', message, options),
  warning: (message, options) => toastStore.add('warning', message, options),
  error: (message, options) => toastStore.add('error', message, options),
  dismiss: (id) => toastStore.dismiss(id),
  clear: () => toastStore.clear(),
};
:::

::: code javascript toast-system/src/toast/useToastTimer.js
// Countdown that can pause (hover/focus/hidden tab) and resume with the REMAINING time.
import { useEffect, useRef, useState } from 'react';

export function useToastTimer({ duration, onExpire }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!duration || paused) return undefined;                   // sticky or paused → no timer
    startedAt.current = Date.now();
    const timer = setTimeout(onExpire, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;        // keep what's left for the resume
    };
  }, [duration, paused, onExpire]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);        // don't expire while the tab is hidden
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { pause: () => setPaused(true), resume: () => setPaused(false), paused };
}
:::

::: code jsx toast-system/src/toast/Toaster.jsx
import { useCallback, useSyncExternalStore } from 'react';
import { toastStore } from './toast.js';
import { useToastTimer } from './useToastTimer.js';
import './Toast.css';

const ICONS = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '⛔' };

function ToastItem({ toast }) {
  const close = useCallback(() => toastStore.dismiss(toast.id), [toast.id]);
  const { pause, resume } = useToastTimer({ duration: toast.duration, onExpire: close });
  const isUrgent = toast.type === 'error';

  return (
    <div
      className={`toast toast-${toast.type}`}
      role={isUrgent ? 'alert' : 'status'}                 // alert = announced immediately
      aria-live={isUrgent ? 'assertive' : 'polite'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
      <p className="toast-message">
        {toast.message}
        {toast.count > 1 && <span className="toast-count"> ×{toast.count}</span>}
      </p>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => { toast.action.onClick(); close(); }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={close}>×</button>
    </div>
  );
}

export function Toaster({ max = 3 }) {
  const state = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot);
  return (
    <section className="toaster" aria-label="Notifications">
      {state.visible.slice(0, max).map((t) => <ToastItem key={t.id} toast={t} />)}
      {state.queue.length > 0 && <p className="toast-queued">+{state.queue.length} more waiting</p>}
    </section>
  );
}
:::

::: code css toast-system/src/toast/Toast.css
.toaster { position: fixed; right: 16px; bottom: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; width: min(360px, calc(100vw - 32px)); }
.toast { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-radius: 10px; background: #1f2937; color: #f9fafb;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18); border-left: 4px solid #60a5fa; animation: toast-in 0.18s ease-out; }
.toast-success { border-left-color: #34d399; }
.toast-warning { border-left-color: #fbbf24; }
.toast-error { border-left-color: #f87171; }
.toast-message { flex: 1; margin: 0; font-size: 14px; }
.toast-count { opacity: 0.7; font-weight: 600; }
.toast-action { background: transparent; border: 1px solid #93c5fd; color: #bfdbfe; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.toast-close { background: transparent; border: 0; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; }
.toast button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
.toast-queued { margin: 0; text-align: right; font-size: 12px; color: #64748b; }
@keyframes toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
:::

::: code css toast-system/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 760px; margin: 0 auto; padding: 32px 16px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
button { padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } button { background: #111827; color: #e2e8f0; border-color: #334155; } }
:::

::: code javascript Browser simulation: queue, priority, dedupe and promotion (runnable)
// The same store logic as toastStore.js, tested without React.
function createToastStore({ max = 3 } = {}) {
  const PRIORITY = { error: 2, warning: 1, success: 0, info: 0 };
  let state = { visible: [], queue: [] }, counter = 0;
  const ins = (q, t) => { const i = q.findIndex((x) => x.priority < t.priority); return i === -1 ? [...q, t] : [...q.slice(0, i), t, ...q.slice(i)]; };
  return {
    add(type, message) {
      const dup = [...state.visible, ...state.queue].find((t) => t.type === type && t.message === message);
      if (dup) { const b = (l) => l.map((t) => (t.id === dup.id ? { ...t, count: t.count + 1 } : t)); state = { visible: b(state.visible), queue: b(state.queue) }; return dup.id; }
      const t = { id: 't' + ++counter, type, message, priority: PRIORITY[type], count: 1 };
      state = state.visible.length < max ? { ...state, visible: [...state.visible, t] } : { ...state, queue: ins(state.queue, t) };
      return t.id;
    },
    dismiss(id) { const v = state.visible.filter((t) => t.id !== id), q = state.queue.filter((t) => t.id !== id); while (v.length < max && q.length) v.push(q.shift()); state = { visible: v, queue: q }; },
    get: () => state,
  };
}
const msgs = (list) => list.map((t) => t.message).join(',');

// ---------- tests ----------
const s = createToastStore({ max: 3 });
['A', 'B', 'C', 'D'].forEach((m) => s.add('info', m));
console.log('max 3 visible, 1 queued →', msgs(s.get().visible), '|', msgs(s.get().queue), s.get().visible.length === 3 && s.get().queue.length === 1 ? '✅' : '❌ FAIL');
s.add('warning', 'W'); s.add('error', 'E');
console.log('queue ordered by priority →', msgs(s.get().queue), msgs(s.get().queue) === 'E,W,D' ? '✅' : '❌ FAIL');
s.dismiss(s.get().visible[0].id);
console.log('dismiss promotes the error first →', msgs(s.get().visible), msgs(s.get().visible) === 'B,C,E' ? '✅' : '❌ FAIL');
const id1 = s.add('info', 'B'), id2 = s.add('info', 'B');
console.log('duplicate merged with a counter →', s.get().visible.find((t) => t.message === 'B').count, id1 === id2 && s.get().visible.find((t) => t.message === 'B').count === 3 ? '✅' : '❌ FAIL');
['B', 'C', 'E'].forEach(() => s.dismiss(s.get().visible[0].id));
console.log('remaining queue drains in order →', msgs(s.get().visible), msgs(s.get().visible) === 'W,D' && s.get().queue.length === 0 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd toast-system && npm install && npm run dev` → open the printed URL.
2. Click **Success**, **Info**, **Warning**: toasts appear bottom-right and disappear after 4/4/6 s. Hover one: it stays while the mouse is over it, then continues with the remaining time.
3. **Burst**: 6 info + 1 error → 3 visible and "+4 more waiting"; when one closes, the **error** appears next (priority) before the remaining info toasts.
4. Click **Success** three times quickly → one toast showing "×3".
5. **Save (fails)** → an error toast (8 s, `role="alert"`) with **Retry**; Retry calls the save again and shows "Changes saved".
6. **Undo**: delete a file → "Deleted Photo.png" with **Undo** → the file comes back.
7. **Keyboard / screen reader**: Tab reaches Undo/Retry/× buttons; focusing a toast pauses it; VoiceOver reads info toasts politely and errors immediately.
8. **Sticky**: stays until you press ×. **Clear all** empties visible and queued toasts.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| State location | React Context provider + `useToast()` hook | **External store + `useSyncExternalStore`** | External store: callable outside components (API layer, interceptors) |
| Bursts | Show everything | **Max visible + queue (+ dedupe)** | Queue with priority |
| Errors | Auto-dismiss like others | Longer / sticky + `role="alert"` | Longer, never silently lost |
| Placement | Top-centre | Bottom-right (desktop), bottom (mobile) | Away from primary actions; consistent |
| Library | **Own** (this) | react-hot-toast, sonner, Radix Toast | A library unless you need custom queuing/a11y rules |
| Critical info | Toast | **Inline message / modal** | Never put must-read info only in a disappearing toast |
:::

::: text 📈 Scaling & edge cases
- **Server events**: a WebSocket listener can call `toast.info(...)` directly; dedupe by id to avoid repeats after reconnects.
- **Micro-frontends**: one shared store instance (module federation singleton) so toasts don't overlap.
- **Accessibility**: WCAG 2.2.1 (timing adjustable): pause on hover/focus; enough reading time; don't move focus to toasts; `prefers-reduced-motion`.
- **Edge cases**: very long messages (clamp + expand), the same toast id updated in place (`toast.loading → success`), toasts after navigation (keep the store global), hidden tab (timer paused).
:::

::: warning ⚠️ Common mistakes
- Requiring a hook (`useToast`) so services/interceptors can't show toasts.
- Unlimited stacking that covers the UI during error storms.
- Auto-dismissing errors in 2 s; no pause on hover; no close button.
- Using `role="alert"` for everything (screen readers interrupt the user constantly).
- Timer restarts from full duration after hover instead of continuing with the remaining time.
:::

::: understand
- The **external store + subscribe** pattern (the same idea behind Redux/Zustand) decouples *who triggers* a notification from *who renders* it. `useSyncExternalStore` is React's official way to read such stores safely.
- Queueing with priority and dedupe is the same idea as the backend Notification System, at UI scale.
:::

::: important ⭐ How to present this design in 5 minutes
> "I expose a tiny API, toast.success, error, info and warning, that any code can call, even outside React, because it writes to a framework-agnostic store with subscribe and getSnapshot. A single Toaster reads the store with useSyncExternalStore. The store keeps visible toasts and a queue: at most three are visible, the rest are queued by priority so errors jump ahead, and identical messages are merged with a counter. Each toast has an auto-dismiss timer that pauses on hover, focus or a hidden tab and resumes with the remaining time; errors last longer. Toasts can carry an action like Undo or Retry. For accessibility, errors use role alert, others role status, and focus is never stolen."
:::

::: links
React: useSyncExternalStore | https://react.dev/reference/react/useSyncExternalStore
MDN: ARIA status role | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/status_role
WCAG 2.2: Timing Adjustable | https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
Sonner (toast library) | https://sonner.emilkowal.ski/
:::

=== Design a Form with validation (multi-step)
@p 3
@tags lld, react, forms, validation
@quick
- One **schema** describes every field: `required`, `minLength`, `pattern`, `validate(value, allValues)` (cross-field), `asyncValidate` (e.g. "username taken").
- A `useForm` hook owns `values`, `errors`, `touched`, `isSubmitting`, `step`; components only call `register(name)`.
- **When to validate**: on blur (first time), then on change once touched; everything on submit; async checks debounced.
- **Multi-step wizard**: validate only the current step's fields before Next; keep values across steps; save a draft (`localStorage`).
- Accessibility: `<label for>`, `aria-invalid`, `aria-describedby` → error text, error summary that receives focus on submit, focus the first invalid field.

::: text 🧒 In simple words
A form is a **conversation where the app asks questions** (name, email, password) and checks the answers. A good form tells you *what's wrong* right next to the field, at the right time (not shouting "invalid email!" while you're still typing), remembers your answers if you go back a step, and doesn't let you click "Submit" twice. A **multi-step form** (wizard) is like a check-in desk with three counters: you only move to the next counter when this one's paperwork is complete.
:::

::: text 📋 Requirements
### Functional
- 3-step sign-up wizard: **Account** (email, username, password, confirm), **Profile** (full name, age, country, website), **Review** (summary + accept terms).
- Sync rules (required, length, pattern, ranges), **cross-field** rule (confirm = password), **async** rule (username availability, debounced).
- Errors shown after a field is touched or after a submit attempt; Next validates only the current step.
- Submit: disable the button, show progress, map **server errors** back to fields, success screen.
- Draft auto-saved to `localStorage` and restored on reload (never the password).

### Non-functional
- Reusable `useForm` hook with no form library; no re-render storms (simple state, memoised handlers).
- Fully accessible: labels, error associations, error summary and focus management.

### Assumptions
- React 18 + Vite; a fake API (`fakeApi.js`) with `checkUsername` and `registerUser` (the server rejects the email `taken@example.com`).
:::

::: ask
- *"Which fields and rules? Do rules come from the backend (dynamic forms)?"*
- *"When should errors appear: on blur, on change, on submit?"*
- *"Should progress be saved if the user leaves?"*
- *"Server-side validation errors: what format?"* (`{ field: message }`.)
- *"Any very large forms (100+ fields)?"* (Performance → uncontrolled inputs / react-hook-form.)
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx"] --> WIZ["SignupWizard"]
  WIZ --> HOOK["useForm(schema, steps, onSubmit)"]
  HOOK --> VAL["validators.js (pure rules)"]
  HOOK --> ASYNC["async validators (debounced, latest wins)"]
  HOOK --> DRAFT["useDraft (localStorage)"]
  WIZ --> STEPS["Stepper (step 1 of 3)"]
  WIZ --> SUM["ErrorSummary (role alert, focused on submit)"]
  WIZ --> FIELD["Field: label + input + hint + error"]
  WIZ --> NAV["Back / Next / Submit buttons"]
:::

::: diagram Sequence: Next on step 1 with an invalid field
sequenceDiagram
  participant U as User
  participant W as SignupWizard
  participant F as useForm
  participant API as fakeApi
  U->>W: types username "admin"
  W->>F: setValue(username)
  F->>API: checkUsername("admin") after 400 ms
  API-->>F: taken
  F-->>W: errors.username = "Username is taken"
  U->>W: click Next
  W->>F: nextStep()
  F->>F: validate step 1 fields, mark all touched
  F-->>W: invalid, stay on step 1
  W->>W: show ErrorSummary, focus it
  U->>W: fixes fields, Next, Next, Submit
  W->>API: registerUser(values)
  API-->>W: 201 Created, success screen
:::

::: image Form: schema-driven useForm hook with sync, cross-field and async validation across wizard steps
/images/frontend-lld/form-wizard.svg
:::

::: text 🧱 Design
### Schema (one source of truth)
`{ email: { label, type, required, pattern, message }, password: { minLength, validate }, confirm: { validate: (v, all) => v === all.password || 'Passwords must match' }, username: { asyncValidate } }`

### `useForm(schema, { steps, initialValues, onSubmit })` returns
| Item | Purpose |
|---|---|
| `values`, `errors`, `touched` | Current state |
| `register(name)` | `{ id, name, value, onChange, onBlur, aria-invalid, aria-describedby }` for an input |
| `step`, `nextStep()`, `prevStep()`, `isLastStep` | Wizard navigation (validates the current step) |
| `handleSubmit(e)` | Validates all, runs `onSubmit`, maps server field errors |
| `isSubmitting`, `submitError`, `pending` (async checks running) | Status flags |
| `reset()` | Back to initial values (clears the draft) |

### Validation timing
- `onBlur` → mark touched + validate that field.
- `onChange` → validate only if touched (no errors while typing the first time).
- `Next` / `Submit` → validate the step / all fields, mark them touched, focus the error summary.
:::

::: text 📁 Folder structure
`form-wizard/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/api/fakeApi.js`
↳ `src/form/validators.js`, `src/form/useForm.js`, `src/form/useDraft.js`, `src/form/Field.jsx`, `src/form/ErrorSummary.jsx`, `src/form/form.css`
↳ `src/signup/schema.js`, `src/signup/SignupWizard.jsx`
:::

::: code json form-wizard/package.json
{
  "name": "form-wizard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript form-wizard/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code html form-wizard/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Form Wizard LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx form-wizard/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx form-wizard/src/App.jsx
import { SignupWizard } from './signup/SignupWizard.jsx';

export default function App() {
  return (
    <main className="page">
      <h1>Create your account</h1>
      <p className="muted">Try: username "admin" (taken), mismatched passwords, email "taken@example.com" (server error), reload mid-way (draft restored).</p>
      <SignupWizard />
    </main>
  );
}
:::

::: code javascript form-wizard/src/api/fakeApi.js
// Fake backend: username check + registration with server-side validation.
const TAKEN_USERNAMES = ['admin', 'root', 'vivek'];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function checkUsername(username) {
  await delay(300);
  return { available: !TAKEN_USERNAMES.includes(username.toLowerCase()) };
}

export async function registerUser(values) {
  await delay(700);
  // The server ALWAYS validates again: never trust the client
  if (values.email.toLowerCase() === 'taken@example.com') {
    const err = new Error('Validation failed');
    err.status = 422;
    err.fieldErrors = { email: 'An account with this email already exists' };
    throw err;
  }
  return { id: Math.floor(Math.random() * 10000), username: values.username };
}
:::

::: code javascript form-wizard/src/form/validators.js
// Pure validation: (schema, values) → errors. No React → easy to test and share with the server.

/** Validates one field with its rule; returns an error message or ''. */
export function validateField(rule, value, values) {
  const v = typeof value === 'string' ? value.trim() : value;
  const empty = v === '' || v === undefined || v === null || v === false;
  if (rule.required && empty) return rule.requiredMessage || `${rule.label} is required`;
  if (empty) return '';                                              // optional and empty → fine
  if (rule.minLength && String(v).length < rule.minLength) return `${rule.label} must be at least ${rule.minLength} characters`;
  if (rule.maxLength && String(v).length > rule.maxLength) return `${rule.label} must be at most ${rule.maxLength} characters`;
  if (rule.min !== undefined && Number(v) < rule.min) return `${rule.label} must be at least ${rule.min}`;
  if (rule.max !== undefined && Number(v) > rule.max) return `${rule.label} must be at most ${rule.max}`;
  if (rule.pattern && !rule.pattern.test(String(v))) return rule.message || `${rule.label} is invalid`;
  if (rule.validate) {
    const result = rule.validate(v, values);                        // cross-field rules see all values
    if (result !== true && result) return result;
  }
  return '';
}

/** Validates a list of field names; returns { name: message } for the failing ones. */
export function validateFields(schema, values, names) {
  const errors = {};
  for (const name of names) {
    const message = validateField(schema[name], values[name], values);
    if (message) errors[name] = message;
  }
  return errors;
}
:::

::: code javascript form-wizard/src/form/useDraft.js
// Saves a draft to localStorage (minus secret fields) and restores it on load.
import { useEffect } from 'react';

/** Reads a saved draft once (call it in a lazy useState initialiser). */
export function loadDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;                                           // corrupted or blocked storage → no draft
  }
}

export function useDraft(key, values, { exclude = [] } = {}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const safe = Object.fromEntries(Object.entries(values).filter(([name]) => !exclude.includes(name)));
      try { localStorage.setItem(key, JSON.stringify(safe)); } catch { /* storage full or disabled */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [key, values, exclude]);

  const clearDraft = () => { try { localStorage.removeItem(key); } catch { /* ignore */ } };
  return { clearDraft };
}
:::

::: code javascript form-wizard/src/form/useForm.js
// Reusable form state: values, errors, touched, steps, async validation, submit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateField, validateFields } from './validators.js';

export function useForm(schema, { steps, initialValues, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [asyncErrors, setAsyncErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [step, setStep] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState({});               // async checks in flight
  const [attempt, setAttempt] = useState(0);                // increases on every failed Next/Submit
  const asyncSeq = useRef({});

  const stepFields = steps[step].fields;
  const isLastStep = step === steps.length - 1;

  // ---------- async validation (debounced, latest wins) ----------
  useEffect(() => {
    const timers = [];
    for (const [name, rule] of Object.entries(schema)) {
      if (!rule.asyncValidate) continue;
      const value = values[name];
      if (validateField(rule, value, values)) {               // sync error first: no request
        setPending((p) => (p[name] ? { ...p, [name]: false } : p));
        continue;
      }
      const seq = (asyncSeq.current[name] = (asyncSeq.current[name] || 0) + 1);
      setPending((p) => ({ ...p, [name]: true }));
      timers.push(setTimeout(async () => {
        const message = await rule.asyncValidate(value);
        if (asyncSeq.current[name] !== seq) return;           // the user typed again: stale result
        setAsyncErrors((e) => ({ ...e, [name]: message || '' }));
        setPending((p) => ({ ...p, [name]: false }));
      }, 400));
    }
    return () => timers.forEach(clearTimeout);
    // only re-run when an async-validated value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, Object.keys(schema).filter((n) => schema[n].asyncValidate).map((n) => values[n]));

  const runSync = useCallback((names, nextValues) => {
    const found = validateFields(schema, nextValues, names);
    setErrors((prev) => {
      const merged = { ...prev };
      names.forEach((n) => { if (found[n]) merged[n] = found[n]; else delete merged[n]; });
      return merged;
    });
    return found;
  }, [schema]);

  const setValue = useCallback((name, value) => {
    const next = { ...values, [name]: value };
    setValues(next);
    // re-validate touched fields, including ones that depend on others (confirm after password changes)
    const toCheck = Object.keys(touched).filter((n) => touched[n]);
    if (toCheck.length) runSync(toCheck, next);
    if (asyncErrors[name]) setAsyncErrors((e) => ({ ...e, [name]: '' }));
  }, [values, touched, runSync, asyncErrors]);

  const register = useCallback((name) => {
    const rule = schema[name];
    const isCheckbox = rule.type === 'checkbox';
    const shownError = touched[name] ? errors[name] || asyncErrors[name] : '';
    return {
      id: `field-${name}`,
      name,
      type: rule.type || 'text',
      ...(isCheckbox ? { checked: Boolean(values[name]) } : { value: values[name] ?? '' }),
      onChange: (e) => setValue(name, isCheckbox ? e.target.checked : e.target.value),
      onBlur: () => {
        setTouched((t) => ({ ...t, [name]: true }));
        runSync([name], values);
      },
      'aria-invalid': shownError ? true : undefined,
      'aria-describedby': shownError ? `field-${name}-error` : rule.hint ? `field-${name}-hint` : undefined,
    };
  }, [schema, values, errors, asyncErrors, touched, setValue, runSync]);

  const validateStep = (names) => {
    setTouched((t) => ({ ...t, ...Object.fromEntries(names.map((n) => [n, true])) }));
    const found = runSync(names, values);
    const asyncFound = names.filter((n) => asyncErrors[n] || pending[n]);
    const ok = Object.keys(found).length === 0 && asyncFound.length === 0;
    if (!ok) setAttempt((a) => a + 1);
    return ok;
  };

  const nextStep = () => { if (validateStep(stepFields)) setStep((s) => Math.min(steps.length - 1, s + 1)); };
  const prevStep = () => setStep((s) => Math.max(0, s - 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLastStep) return nextStep();                       // Enter key on earlier steps = Next
    const all = steps.flatMap((s) => s.fields);
    if (!validateStep(all) || isSubmitting) return undefined;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit(values);
    } catch (err) {
      if (err.fieldErrors) {                                  // map server errors back to fields
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
        const firstStep = steps.findIndex((s) => s.fields.some((f) => err.fieldErrors[f]));
        if (firstStep !== -1) setStep(firstStep);
        setAttempt((a) => a + 1);
      } else {
        setSubmitError(err.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  const reset = () => { setValues(initialValues); setErrors({}); setAsyncErrors({}); setTouched({}); setStep(0); };

  // errors to show in the summary: current step, touched fields only
  const visibleErrors = useMemo(() => {
    const out = {};
    for (const name of stepFields) {
      const msg = touched[name] ? errors[name] || asyncErrors[name] : '';
      if (msg) out[name] = msg;
    }
    return out;
  }, [stepFields, touched, errors, asyncErrors]);

  return {
    values, errors: visibleErrors, touched, step, isLastStep, isSubmitting, submitError, pending, attempt,
    register, setValue, nextStep, prevStep, handleSubmit, reset,
  };
}
:::

::: code jsx form-wizard/src/form/Field.jsx
// Label + control + hint + error, wired with ids so screen readers read them together.
export function Field({ form, name, schema, as = 'input', children }) {
  const rule = schema[name];
  const props = form.register(name);
  const error = form.errors[name];
  const Control = as;

  if (rule.type === 'checkbox') {
    return (
      <div className="field field-check">
        <input {...props} />
        <label htmlFor={props.id}>{rule.label}</label>
        {error && <p id={`${props.id}-error`} className="field-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={props.id}>
        {rule.label}{rule.required && <span aria-hidden="true"> *</span>}
      </label>
      <Control {...props} {...(as === 'select' ? { type: undefined } : {})}>{children}</Control>
      {rule.hint && !error && <p id={`${props.id}-hint`} className="field-hint">{rule.hint}</p>}
      {form.pending[name] && <p className="field-hint">Checking…</p>}
      {error && <p id={`${props.id}-error`} className="field-error">{error}</p>}
    </div>
  );
}
:::

::: code jsx form-wizard/src/form/ErrorSummary.jsx
import { useEffect, useRef } from 'react';

// Shown after a failed Next/Submit. Gets focus so keyboard and screen-reader users know what to fix.
export function ErrorSummary({ errors, schema, attempt }) {
  const ref = useRef(null);
  const entries = Object.entries(errors);

  useEffect(() => {
    if (attempt > 0 && ref.current) ref.current.focus();
  }, [attempt]);

  if (attempt === 0 || entries.length === 0) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2>Please fix {entries.length} {entries.length === 1 ? 'problem' : 'problems'}</h2>
      <ul>
        {entries.map(([name, message]) => (
          <li key={name}>
            <a href={`#field-${name}`} onClick={(e) => { e.preventDefault(); document.getElementById(`field-${name}`)?.focus(); }}>
              {schema[name].label}: {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
:::

::: code javascript form-wizard/src/signup/schema.js
import { checkUsername } from '../api/fakeApi.js';

export const signupSchema = {
  email: { label: 'Email', type: 'email', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email like name@example.com' },
  username: {
    label: 'Username', required: true, minLength: 3, maxLength: 20,
    pattern: /^[a-z0-9_]+$/i, message: 'Use letters, numbers and _ only',
    asyncValidate: async (value) => ((await checkUsername(value)).available ? '' : 'Username is taken'),
  },
  password: {
    label: 'Password', type: 'password', required: true, minLength: 8, hint: 'At least 8 characters with a number',
    validate: (v) => /\d/.test(v) || 'Password must contain a number',
  },
  confirm: { label: 'Confirm password', type: 'password', required: true, validate: (v, all) => v === all.password || 'Passwords must match' },
  fullName: { label: 'Full name', required: true, minLength: 2 },
  age: { label: 'Age', type: 'number', required: true, min: 13, max: 120 },
  country: { label: 'Country', required: true, requiredMessage: 'Choose a country' },
  website: { label: 'Website', type: 'url', pattern: /^https?:\/\/\S+\.\S+$/, message: 'Website must start with http:// or https://' },
  terms: { label: 'I accept the terms of service', type: 'checkbox', required: true, requiredMessage: 'You must accept the terms' },
};

export const signupSteps = [
  { title: 'Account', fields: ['email', 'username', 'password', 'confirm'] },
  { title: 'Profile', fields: ['fullName', 'age', 'country', 'website'] },
  { title: 'Review', fields: ['terms'] },
];

export const emptySignup = { email: '', username: '', password: '', confirm: '', fullName: '', age: '', country: '', website: '', terms: false };
:::

::: code jsx form-wizard/src/signup/SignupWizard.jsx
import { useState } from 'react';
import { useForm } from '../form/useForm.js';
import { useDraft, loadDraft } from '../form/useDraft.js';
import { Field } from '../form/Field.jsx';
import { ErrorSummary } from '../form/ErrorSummary.jsx';
import { signupSchema, signupSteps, emptySignup } from './schema.js';
import { registerUser } from '../api/fakeApi.js';
import '../form/form.css';

const SECRET_FIELDS = ['password', 'confirm'];

export function SignupWizard() {
  const [done, setDone] = useState(null);
  const draftKey = 'signup-draft-v1';
  const [restored] = useState(() => loadDraft(draftKey));     // read localStorage once, not every render

  const form = useForm(signupSchema, {
    steps: signupSteps,
    initialValues: { ...emptySignup, ...(restored || {}) },
    onSubmit: async (values) => {
      const user = await registerUser(values);
      clearDraft();
      setDone(user);
    },
  });
  const { clearDraft } = useDraft(draftKey, form.values, { exclude: SECRET_FIELDS });

  if (done) {
    return (
      <div className="card success" role="status">
        <h2>Welcome, {done.username}! 🎉</h2>
        <p>Your account #{done.id} was created.</p>
        <button type="button" onClick={() => { form.reset(); setDone(null); }}>Create another</button>
      </div>
    );
  }

  const { step } = form;
  return (
    <form className="card" noValidate onSubmit={form.handleSubmit} aria-labelledby="wizard-title">
      <ol className="stepper" aria-label="Progress">
        {signupSteps.map((s, i) => (
          <li key={s.title} className={i === step ? 'is-current' : i < step ? 'is-done' : undefined} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {s.title}
          </li>
        ))}
      </ol>
      <h2 id="wizard-title">Step {step + 1} of {signupSteps.length}: {signupSteps[step].title}</h2>
      {restored && step === 0 && <p className="field-hint">Draft restored from your last visit (passwords are never saved).</p>}

      <ErrorSummary errors={form.errors} schema={signupSchema} attempt={form.attempt} />

      {step === 0 && (
        <>
          <Field form={form} name="email" schema={signupSchema} />
          <Field form={form} name="username" schema={signupSchema} />
          <Field form={form} name="password" schema={signupSchema} />
          <Field form={form} name="confirm" schema={signupSchema} />
        </>
      )}
      {step === 1 && (
        <>
          <Field form={form} name="fullName" schema={signupSchema} />
          <Field form={form} name="age" schema={signupSchema} />
          <Field form={form} name="country" schema={signupSchema} as="select">
            <option value="">Choose…</option>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="DE">Germany</option>
          </Field>
          <Field form={form} name="website" schema={signupSchema} />
        </>
      )}
      {step === 2 && (
        <>
          <dl className="review">
            {['email', 'username', 'fullName', 'age', 'country', 'website'].map((name) => (
              <div key={name}><dt>{signupSchema[name].label}</dt><dd>{form.values[name] || '—'}</dd></div>
            ))}
          </dl>
          <Field form={form} name="terms" schema={signupSchema} />
        </>
      )}

      {form.submitError && <p className="field-error" role="alert">{form.submitError}</p>}

      <div className="actions">
        {step > 0 && <button type="button" onClick={form.prevStep}>Back</button>}
        {form.isLastStep ? (
          <button type="submit" className="primary" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        ) : (
          <button type="submit" className="primary">Next</button>
        )}
      </div>
    </form>
  );
}
:::

::: code css form-wizard/src/form/form.css
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 24px; max-width: 520px; }
.stepper { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0 0 8px; font-size: 14px; color: #94a3b8; }
.stepper .is-current { color: #4f46e5; font-weight: 700; }
.stepper .is-done { color: #059669; }
.field { display: flex; flex-direction: column; gap: 4px; margin: 14px 0; }
.field label { font-weight: 600; font-size: 14px; }
.field input, .field select { padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; }
.field input:focus, .field select:focus { outline: 2px solid #6366f1; outline-offset: 1px; }
.field.has-error input, .field.has-error select { border-color: #dc2626; }
.field-check { flex-direction: row; align-items: center; flex-wrap: wrap; }
.field-check .field-error { width: 100%; }
.field-hint { margin: 0; font-size: 13px; color: #64748b; }
.field-error { margin: 0; font-size: 13px; color: #b91c1c; }
.error-summary { border: 2px solid #dc2626; border-radius: 8px; padding: 10px 14px; background: #fef2f2; }
.error-summary:focus { outline: 3px solid #fca5a5; }
.error-summary h2 { font-size: 15px; margin: 0 0 6px; color: #991b1b; }
.error-summary a { color: #991b1b; }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
.actions button { padding: 9px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 15px; }
.actions .primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
.actions .primary:disabled { opacity: 0.6; cursor: progress; }
.review { display: grid; gap: 6px; margin: 0; }
.review div { display: flex; gap: 8px; }
.review dt { font-weight: 600; min-width: 110px; }
.review dd { margin: 0; }
.success { border-color: #34d399; }
@media (prefers-color-scheme: dark) {
  .card { background: #111827; border-color: #273449; }
  .field input, .field select, .actions button { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  .error-summary { background: #2a1215; }
  .error-summary h2, .error-summary a { color: #fca5a5; }
}
:::

::: code css form-wizard/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
.muted { color: #64748b; font-size: 14px; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } }
:::

::: code javascript Browser simulation: validators and step validation (runnable)
// validateField / validateFields from validators.js + the wizard's "validate current step" rule.
function validateField(rule, value, values) {
  const v = typeof value === 'string' ? value.trim() : value;
  const empty = v === '' || v === undefined || v === null || v === false;
  if (rule.required && empty) return rule.requiredMessage || `${rule.label} is required`;
  if (empty) return '';
  if (rule.minLength && String(v).length < rule.minLength) return `${rule.label} must be at least ${rule.minLength} characters`;
  if (rule.min !== undefined && Number(v) < rule.min) return `${rule.label} must be at least ${rule.min}`;
  if (rule.pattern && !rule.pattern.test(String(v))) return rule.message || `${rule.label} is invalid`;
  if (rule.validate) { const r = rule.validate(v, values); if (r !== true && r) return r; }
  return '';
}
const validateFields = (schema, values, names) => Object.fromEntries(names.map((n) => [n, validateField(schema[n], values[n], values)]).filter(([, m]) => m));
const schema = {
  email: { label: 'Email', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
  password: { label: 'Password', required: true, minLength: 8, validate: (v) => /\d/.test(v) || 'Password must contain a number' },
  confirm: { label: 'Confirm', required: true, validate: (v, all) => v === all.password || 'Passwords must match' },
  age: { label: 'Age', required: true, min: 13 },
  website: { label: 'Website', pattern: /^https?:\/\/\S+\.\S+$/, message: 'Website must start with http' },
};
const step1 = ['email', 'password', 'confirm'];

// ---------- tests ----------
const bad = { email: 'vivek@', password: 'secretpw', confirm: 'secret', age: '9', website: '' };
const e1 = validateFields(schema, bad, step1);
console.log('step 1 errors →', JSON.stringify(e1));
console.log('invalid email caught', e1.email === 'Enter a valid email' ? '✅' : '❌ FAIL');
console.log('password needs a number', e1.password === 'Password must contain a number' ? '✅' : '❌ FAIL');
console.log('cross-field confirm', e1.confirm === 'Passwords must match' ? '✅' : '❌ FAIL');
console.log('only step 1 fields validated (age ignored)', !('age' in e1) ? '✅' : '❌ FAIL');
console.log('optional empty website is fine', validateField(schema.website, '', bad) === '' ? '✅' : '❌ FAIL');
console.log('age min 13 →', validateField(schema.age, '9', bad), validateField(schema.age, '9', bad) === 'Age must be at least 13' ? '✅' : '❌ FAIL');
const good = { email: 'vivek@example.com', password: 'secret12', confirm: 'secret12' };
console.log('valid step 1 → no errors, can go Next', Object.keys(validateFields(schema, good, step1)).length === 0 ? '✅' : '❌ FAIL');
console.log('whitespace-only required value is empty →', validateField({ label: 'Name', required: true }, '   ', {}), validateField({ label: 'Name', required: true }, '   ', {}) === 'Name is required' ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd form-wizard && npm install && npm run dev` → open the printed URL.
2. Click **Next** on the empty step 1 → the red **error summary** appears and receives focus; each field shows its error; clicking a summary link focuses that field.
3. Type an email slowly: no error while typing the first time; leave the field (blur) → error if invalid; after that it re-validates on every keystroke.
4. Username `admin` → "Checking…" then **Username is taken** (async, debounced 400 ms). `vivek_dev` → fine.
5. Password `secret12`, confirm `secret1` → "Passwords must match"; change the password → the confirm error updates (cross-field).
6. Fill step 2 (age 9 → "at least 13"), go **Back**: values are kept. **Reload the page**: values (not passwords) are restored from the draft.
7. Step 3: submit without accepting the terms → error. With email `taken@example.com` → the server error jumps you back to step 1 with "An account with this email already exists".
8. Valid submit → the button shows "Creating account…" and is disabled (no double submit) → success screen.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Inputs | **Controlled** (state per keystroke, this design) | Uncontrolled + refs (react-hook-form) | Controlled for small/medium forms; RHF for very large or performance-critical forms |
| Rules | Hand-written schema (this) | **Zod / Yup** schema shared with the backend | Zod in production (type-safe, reuse on the server) |
| Error timing | On change (noisy) | **On blur, then on change; all on submit** | "Reward early, punish late" |
| Wizard state | One form across steps (this) | Separate form per step | One form: Back keeps values, single submit |
| Draft | None | **localStorage** / server-side draft | localStorage for anonymous; server for logged-in, cross-device |
| Server errors | Generic banner | **Mapped to fields** (`422 { field: message }`) | Map to fields + banner for non-field errors |
:::

::: text 📈 Scaling & edge cases
- **Large or dynamic forms**: generate fields from a JSON schema sent by the backend; field-level subscriptions (react-hook-form, Final Form) avoid re-rendering the whole form.
- **Security**: client validation is UX only; the server must validate again. Never store passwords in drafts; use `autocomplete="new-password"` hints.
- **Accessibility**: labels for every control, `aria-invalid`, `aria-describedby`, an error summary that takes focus, required markers not by colour only, sensible tab order.
- **Edge cases**: double submit (disable + guard), async check finishing after the value changed (sequence numbers), browser autofill (no change events in some browsers → validate on submit), paste with spaces (trim), numbers as strings.
:::

::: warning ⚠️ Common mistakes
- Showing errors on the first keystroke ("Invalid email" after typing `v`).
- Validating only on submit with no indication where the problems are (no summary, no focus).
- Confirm-password error not updating when the *password* changes.
- Trusting client validation and skipping server validation.
- Saving passwords or card numbers in `localStorage` drafts.
:::

::: understand
- A **schema** separates *what is valid* from *how it's displayed*; the same rules can run on the server (with Zod you literally share the file).
- The wizard is just **one form with a step index**: Next validates a subset of fields; Submit validates everything.
:::

::: important ⭐ How to present this design in 5 minutes
> "I'd describe every field in one schema with required, length, pattern, a cross-field validate function and optional async validation. A useForm hook holds values, errors, touched, step and submitting state and gives each input a register function with value, onChange, onBlur and the ARIA attributes. Errors appear after blur and then update live; Next validates only the current step's fields, Submit validates everything. The username check is debounced and ignores stale results. On submit I disable the button, call the API, and map 422 field errors back to fields and to the right step. A draft without passwords is saved to localStorage. For accessibility: real labels, aria-invalid and aria-describedby, and an error summary that takes focus with links to each field. In production I'd likely use react-hook-form with a Zod schema shared with the backend."
:::

::: links
GOV.UK Design System: error summary | https://design-system.service.gov.uk/components/error-summary/
React Hook Form | https://react-hook-form.com/
Zod | https://zod.dev/
WAI: Form instructions & validation | https://www.w3.org/WAI/tutorials/forms/validation/
:::

=== Design an accessible Modal / Dialog
@p 2
@tags lld, react, a11y, portal
@quick
- Render into a **portal** (`document.body`) so parent `overflow`/`z-index` can't clip it.
- **Focus management**: save the opener, move focus into the dialog, **trap Tab/Shift+Tab**, restore focus on close.
- Close on **Escape** and backdrop click (configurable); `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`.
- **Scroll lock** on `<body>` (with scrollbar-width compensation); background made `inert` so screen readers can't wander behind.
- **Stacked modals**: a modal stack; only the top one handles Escape; scroll lock released when the last one closes. Modern alternative: the native `<dialog>` element with `showModal()`.

::: text 🧒 In simple words
A modal is a **pop-up box that pauses the page**: "Delete this file? Cancel / Delete". While it's open you can't use the page behind it. The tricky part isn't drawing the box, it's the *behaviour*: the keyboard must stay inside the box (pressing Tab shouldn't wander to the page behind), Escape should close it, the page shouldn't scroll underneath, and when it closes your focus must go back to the button you came from, like a **receptionist who returns you to exactly where you were standing**.
:::

::: text 📋 Requirements
### Functional
- `<Modal open onClose title description>` with any content; `closeOnBackdrop`, `closeOnEsc`, `initialFocusRef` options.
- A `useConfirm()` helper: `await confirm({ title, message })` → `true/false` (promise-based dialog).
- Nested modals (a modal opening another modal) behave correctly.

### Non-functional
- Meets the WAI-ARIA dialog pattern: focus trap, focus restore, Escape, labelled dialog, background inert.
- No layout shift when the scrollbar disappears; respects reduced motion.

### Assumptions
- React 18 + Vite; no libraries. `inert` is supported in all modern browsers.
:::

::: ask
- *"Which close behaviours: Escape, backdrop, X button, only explicit buttons (for destructive confirmations)?"*
- *"Can modals open other modals?"*
- *"Mobile: full-screen sheet?"*
- *"Should we use the native `<dialog>` element?"* (Browser support is now good.)
- *"Is any modal triggered automatically (e.g. session timeout)?"* (Focus and announcement rules.)
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx"] --> MP["ConfirmProvider (useConfirm)"]
  APP --> BTN["Opener button"]
  APP --> M["Modal (open, onClose, title)"]
  M --> PORTAL["createPortal → document.body"]
  PORTAL --> BD["Backdrop (click → close)"]
  PORTAL --> DLG["div role dialog, aria-modal, aria-labelledby"]
  M --> FT["useFocusTrap (Tab cycle, initial focus, restore)"]
  M --> SL["useScrollLock (counted, scrollbar compensation)"]
  M --> STACK["modalStack (top modal handles Escape)"]
  M --> INERT["root element gets inert while open"]
:::

::: diagram Sequence: open, Tab past the last button, Escape
sequenceDiagram
  participant U as User
  participant B as Opener button
  participant M as Modal
  participant D as document
  U->>B: click "Delete project"
  B->>M: open = true
  M->>M: remember opener, push to stack, lock scroll, root inert
  M->>M: focus first field (or initialFocusRef)
  U->>M: Tab on the last button
  M->>M: focus wraps to the first focusable
  U->>D: Escape
  D->>M: keydown handled by top modal only
  M->>B: onClose, unlock scroll, remove inert, focus opener
:::

::: image Modal: portal, focus trap, scroll lock, inert background, stack for nested modals
/images/frontend-lld/modal.svg
:::

::: text 🧱 Design
### Component API
| Prop | Default | Purpose |
|---|---|---|
| `open` / `onClose` | (required) | Controlled visibility |
| `title` / `description` | (required) / optional | Rendered and linked via `aria-labelledby` / `aria-describedby` |
| `closeOnEsc` / `closeOnBackdrop` | `true` / `true` | Turn off for destructive or unsaved-work dialogs |
| `initialFocusRef` | first focusable | Where focus goes on open (e.g. the safe "Cancel" button) |
| `size` | `"md"` | `sm`, `md`, `lg`, `full` |

### Hooks / modules
| Piece | Responsibility |
|---|---|
| `focusable.js` | Query all tabbable elements inside a node |
| `useFocusTrap` | Initial focus, Tab/Shift+Tab wrap, restore focus to the opener |
| `useScrollLock` | Counter-based body lock + `padding-right` = scrollbar width |
| `modalStack.js` | Ordered list of open modal ids; `isTop(id)` |
| `ConfirmProvider` / `useConfirm` | Promise API built on `Modal` |
:::

::: text 📁 Folder structure
`modal/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/modal/Modal.jsx`, `src/modal/useFocusTrap.js`, `src/modal/useScrollLock.js`, `src/modal/modalStack.js`, `src/modal/focusable.js`, `src/modal/ConfirmProvider.jsx`, `src/modal/Modal.css`
:::

::: code json modal/package.json
{
  "name": "modal",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript modal/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code html modal/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Modal LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx modal/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ConfirmProvider } from './modal/ConfirmProvider.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
:::

::: code jsx modal/src/App.jsx
import { useRef, useState } from 'react';
import { Modal } from './modal/Modal.jsx';
import { useConfirm } from './modal/ConfirmProvider.jsx';

export default function App() {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('Apollo');
  const [draft, setDraft] = useState('');
  const [log, setLog] = useState([]);
  const confirm = useConfirm();
  const nameInput = useRef(null);

  const addLog = (line) => setLog((l) => [line, ...l].slice(0, 5));

  const deleteProject = async () => {
    const ok = await confirm({ title: 'Delete project?', message: `"${name}" and all its files will be deleted. This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    addLog(ok ? `Deleted ${name}` : 'Delete cancelled');
  };

  const closeEditor = async () => {
    if (draft !== name) {                                       // nested modal: confirm discarding changes
      const discard = await confirm({ title: 'Discard changes?', message: 'You have unsaved changes.', confirmLabel: 'Discard' });
      if (!discard) return;
    }
    setEditOpen(false);
  };

  return (
    <main className="page">
      <h1>Modal / Dialog</h1>
      <p>Project: <strong>{name}</strong></p>
      <div className="row">
        <button type="button" onClick={() => { setDraft(name); setEditOpen(true); }}>Rename project</button>
        <button type="button" className="danger" onClick={deleteProject}>Delete project</button>
      </div>
      <h2>Log</h2>
      <ul>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className="tall">Scroll area: the page behind can't scroll while a modal is open.</div>

      <Modal
        open={editOpen}
        onClose={closeEditor}
        title="Rename project"
        description="Names must be 2 to 40 characters."
        initialFocusRef={nameInput}
        closeOnBackdrop={false}
      >
        <form onSubmit={(e) => { e.preventDefault(); setName(draft.trim() || name); setEditOpen(false); addLog(`Renamed to ${draft}`); }}>
          <label htmlFor="project-name">Name</label>
          <input id="project-name" ref={nameInput} value={draft} onChange={(e) => setDraft(e.target.value)} minLength={2} maxLength={40} />
          <div className="modal-actions">
            <button type="button" onClick={closeEditor}>Cancel</button>
            <button type="submit" className="primary">Save</button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
:::

::: code javascript modal/src/modal/focusable.js
// Everything a keyboard user can Tab to.
const SELECTOR = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusable(container) {
  if (!container) return [];
  return [...container.querySelectorAll(SELECTOR)].filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}
:::

::: code javascript modal/src/modal/modalStack.js
// Order of open modals: only the TOP one reacts to Escape / owns the focus trap.
const stack = [];

export const modalStack = {
  push: (id) => { stack.push(id); },
  remove: (id) => { const i = stack.indexOf(id); if (i !== -1) stack.splice(i, 1); },
  isTop: (id) => stack[stack.length - 1] === id,
  size: () => stack.length,
};
:::

::: code javascript modal/src/modal/useScrollLock.js
// Locks body scroll while ANY modal is open (counter handles nested modals).
import { useEffect } from 'react';

let locks = 0;
let saved = null;

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (locks === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth; // width that will disappear
      saved = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
      document.body.style.overflow = 'hidden';
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;          // no layout jump
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow;
        document.body.style.paddingRight = saved.paddingRight;
      }
    };
  }, [active]);
}
:::

::: code javascript modal/src/modal/useFocusTrap.js
// Moves focus in, keeps Tab inside, and gives focus back to the opener on close.
import { useEffect } from 'react';
import { getFocusable } from './focusable.js';
import { modalStack } from './modalStack.js';

export function useFocusTrap({ active, containerRef, initialFocusRef, id }) {
  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;                      // where to return later
    const container = containerRef.current;

    const first = initialFocusRef?.current || getFocusable(container)[0] || container;
    first.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab' || !modalStack.isTop(id)) return;
      const items = getFocusable(container);
      if (items.length === 0) { e.preventDefault(); container.focus(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === container)) {
        e.preventDefault();
        lastItem.focus();                                       // Shift+Tab on first → last
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();                                      // Tab on last → first
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [active, containerRef, initialFocusRef, id]);
}
:::

::: code jsx modal/src/modal/Modal.jsx
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './useFocusTrap.js';
import { useScrollLock } from './useScrollLock.js';
import { modalStack } from './modalStack.js';
import './Modal.css';

export function Modal({
  open, onClose, title, description, children,
  closeOnEsc = true, closeOnBackdrop = true, initialFocusRef, size = 'md',
}) {
  const id = useId();
  const dialogRef = useRef(null);
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  // register in the stack + make the app behind inert
  useEffect(() => {
    if (!open) return undefined;
    modalStack.push(id);
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    return () => {
      modalStack.remove(id);
      if (modalStack.size() === 0) {
        root?.removeAttribute('inert');
        root?.removeAttribute('aria-hidden');
      }
    };
  }, [open, id]);

  useScrollLock(open);
  useFocusTrap({ active: open, containerRef: dialogRef, initialFocusRef, id });

  // Escape closes only the top-most modal
  useEffect(() => {
    if (!open || !closeOnEsc) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && modalStack.isTop(id)) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose, id]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}  // only the backdrop itself
    >
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-x" aria-label="Close dialog" onClick={onClose}>×</button>
        </header>
        {description && <p id={descId} className="modal-desc">{description}</p>}
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
:::

::: code jsx modal/src/modal/ConfirmProvider.jsx
// Promise-based confirm: const ok = await confirm({ title, message })
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);       // { title, message, confirmLabel, danger, resolve }
  const cancelRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);

  const finish = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(request)}
        onClose={() => finish(false)}
        title={request?.title || ''}
        description={request?.message}
        initialFocusRef={cancelRef}                       // safe default: Cancel, not Delete
        size="sm"
      >
        <div className="modal-actions">
          <button type="button" ref={cancelRef} onClick={() => finish(false)}>Cancel</button>
          <button type="button" className={request?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
            {request?.confirmLabel || 'OK'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
:::

::: code css modal/src/modal/Modal.css
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); display: grid; place-items: center; padding: 16px; z-index: 1000; animation: modal-fade 0.15s ease-out; }
.modal { background: #fff; color: #0f172a; border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3); width: 100%; max-height: calc(100vh - 32px); overflow: auto; padding: 20px 22px; outline: none; }
.modal-sm { max-width: 380px; }
.modal-md { max-width: 520px; }
.modal-lg { max-width: 760px; }
.modal-full { max-width: none; height: calc(100vh - 32px); }
.modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.modal-header h2 { margin: 0; font-size: 18px; }
.modal-x { border: 0; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; color: inherit; padding: 2px 6px; border-radius: 6px; }
.modal-desc { color: #475569; margin: 8px 0 0; }
.modal-body { margin-top: 14px; }
.modal-body label { display: block; font-weight: 600; margin-bottom: 4px; }
.modal-body input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.modal button:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
@keyframes modal-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .modal-backdrop { animation: none; } }
@media (max-width: 480px) { .modal-backdrop { place-items: end stretch; padding: 0; } .modal { border-radius: 14px 14px 0 0; max-height: 90vh; } }
@media (prefers-color-scheme: dark) { .modal { background: #111827; color: #e5e7eb; } .modal-desc { color: #94a3b8; } .modal-body input { background: #0f172a; color: inherit; border-color: #334155; } }
:::

::: code css modal/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
.row { display: flex; gap: 8px; }
button { padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; cursor: pointer; font-size: 15px; }
button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
button.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
.tall { height: 1500px; margin-top: 24px; padding: 16px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } button { background: #111827; border-color: #334155; } }
:::

::: code javascript Browser simulation: focus trap and modal stack (runnable)
// The Tab-wrapping rule and the stack/scroll-lock counters, without a DOM.
function nextFocus(items, activeIndex, shift) {          // returns the index that should get focus
  if (items.length === 0) return -1;                      // nothing focusable → focus the dialog itself
  if (shift && activeIndex <= 0) return items.length - 1; // Shift+Tab on first → last
  if (!shift && activeIndex === items.length - 1) return 0; // Tab on last → first
  return shift ? activeIndex - 1 : activeIndex + 1;      // normal browser behaviour
}
function createStack() {
  const stack = []; let locks = 0, bodyOverflow = 'auto';
  return {
    open(id) { stack.push(id); if (locks++ === 0) bodyOverflow = 'hidden'; },
    close(id) { stack.splice(stack.indexOf(id), 1); if (--locks === 0) bodyOverflow = 'auto'; },
    escape() { return stack[stack.length - 1]; },         // only the top handles Escape
    get overflow() { return bodyOverflow; },
  };
}

// ---------- tests ----------
const items = ['nameInput', 'cancelBtn', 'saveBtn', 'closeX'];
console.log('Tab on last wraps to first →', items[nextFocus(items, 3, false)], nextFocus(items, 3, false) === 0 ? '✅' : '❌ FAIL');
console.log('Shift+Tab on first wraps to last →', items[nextFocus(items, 0, true)], nextFocus(items, 0, true) === 3 ? '✅' : '❌ FAIL');
console.log('Tab in the middle moves forward →', items[nextFocus(items, 1, false)], nextFocus(items, 1, false) === 2 ? '✅' : '❌ FAIL');
console.log('no focusable items → dialog itself', nextFocus([], 0, false) === -1 ? '✅' : '❌ FAIL');
const s = createStack();
s.open('editor'); s.open('confirm-discard');
console.log('nested: Escape goes to the top modal →', s.escape(), s.escape() === 'confirm-discard' ? '✅' : '❌ FAIL');
s.close('confirm-discard');
console.log('scroll still locked while the editor is open →', s.overflow, s.overflow === 'hidden' ? '✅' : '❌ FAIL');
s.close('editor');
console.log('unlocked after the last modal closes →', s.overflow, s.overflow === 'auto' ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd modal && npm install && npm run dev` → open the printed URL.
2. Click **Delete project** with the keyboard (Tab + Enter): the dialog opens with focus on **Cancel** (safe default). Press Tab repeatedly: focus cycles Cancel → Delete → × → Cancel and never reaches the page behind.
3. Press **Escape** → closes, "Delete cancelled" is logged, focus returns to the **Delete project** button.
4. **Rename project**: focus lands in the name input. Change the text and press Escape → a **nested** "Discard changes?" dialog opens on top. Escape again closes only the top dialog; the editor stays open.
5. Click the dark backdrop of the rename dialog → nothing happens (`closeOnBackdrop={false}` protects unsaved work); on the delete dialog the backdrop closes it.
6. Try to scroll the page while a dialog is open → it doesn't move, and the content doesn't jump sideways when the scrollbar disappears.
7. Screen reader: "Delete project?, dialog" + the description is read; the page behind is not reachable (`inert`).
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Element | Custom `div role="dialog"` + hooks (this) | **Native `<dialog>` + `showModal()`** (built-in focus trap, Escape, top layer, `::backdrop`) | Native `<dialog>` for new code; custom when you need full control/animations/legacy browsers |
| Rendering | Inline in the component tree | **Portal to body** | Portal (or the native top layer) to escape `overflow`/`z-index` |
| Background | `aria-hidden` on siblings | **`inert`** (blocks focus + AT + clicks) | `inert` |
| API | Declarative `<Modal open>` | **Imperative `await confirm()`** | Both: declarative for rich content, promise API for confirmations |
| Library | **Own** (this) | Radix Dialog, React Aria, Headless UI | A tested library in production |
:::

::: text 📈 Scaling & edge cases
- **Many modals in a large app**: a modal manager (context or store) that renders modals by id; deep-linkable modals via the URL (`?modal=settings`).
- **Accessibility**: initial focus on the least destructive action; long content scrolls *inside* the modal; heading as label; don't auto-open on page load without reason.
- **Mobile**: bottom-sheet layout, `100dvh`, iOS scroll-lock quirks (`position: fixed` on body as a fallback).
- **Edge cases**: opener removed while the modal is open (focus `body`/main heading), modal content with no focusable elements (focus the dialog), iframes inside, Escape inside a select/autocomplete (let the inner widget handle it first), React StrictMode double effects (counters must be symmetric).
:::

::: warning ⚠️ Common mistakes
- No focus trap → Tab walks into the page behind the modal.
- Not restoring focus → keyboard users are dumped at the top of the page.
- Backdrop `onClick` closing the modal when the user drags a text selection from inside to outside (use `mousedown` on the backdrop itself).
- Every modal locking/unlocking scroll independently → closing a nested modal unlocks the page.
- Focusing the destructive "Delete" button by default.
:::

::: understand
- A dialog is mainly **focus and state management**; the box is the easy part. The three essentials: move focus in, keep it in, give it back.
- The native `<dialog>` element now does most of this for you; knowing the manual way explains *why* it behaves as it does.
:::

::: important ⭐ How to present this design in 5 minutes
> "The Modal is controlled with open and onClose, rendered through a portal into the body. When it opens I remember the previously focused element, push the modal id on a stack, lock body scroll with a counter and scrollbar compensation, set the app root to inert and move focus to an initial element, usually the safest button. A focus trap wraps Tab and Shift+Tab inside the dialog. Escape and backdrop clicks close only the top-most modal and can be disabled for unsaved work. On close I undo everything and restore focus to the opener. The markup is role dialog with aria-modal, labelled by the title and described by the description. On top I offer a promise-based useConfirm. For new code I'd consider the native dialog element with showModal, which gives focus trapping and the top layer for free."
:::

::: links
WAI-ARIA APG: Dialog (Modal) pattern | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
MDN: The dialog element | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
MDN: inert | https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert
React: createPortal | https://react.dev/reference/react-dom/createPortal
:::

=== Design a data-fetching layer (cache, retries, optimistic updates)
@p 3
@tags lld, react, caching, react-query
@quick
- Two layers: an **API client** (base URL, auth header, timeout, JSON, one `ApiError` shape) and a **query cache** (keys → data, status, `updatedAt`, subscribers).
- **Stale-while-revalidate**: show cached data instantly, refetch in the background when stale (`staleTime`), garbage-collect unused entries (`gcTime`).
- **Dedupe** identical in-flight requests (one promise per key); **retry** with exponential backoff on network/5xx only (never 4xx).
- **Mutations**: optimistic update → rollback on error → **invalidate** related keys; refetch on window focus / reconnect.
- In production use **TanStack Query** (React Query) or SWR / RTK Query, but know how they work inside.

::: text 🧒 In simple words
Every screen needs data from the server. If each component calls `fetch` by itself, you get the same request five times, spinners everywhere, stale lists after you edit something, and no retry when Wi-Fi blips. A data-fetching layer is like a **smart librarian**: you ask for "todos", and if someone just asked, you get the copy on the desk immediately while the librarian quietly checks for a newer edition; if two people ask at once, the librarian makes one trip; when you change a book, the librarian updates the catalogue (and puts it back if the change failed).
:::

::: text 📋 Requirements
### Functional
- `useQuery(key, fetcher, { staleTime, retry, enabled })` → `{ data, error, status, isFetching, refetch }`.
- `useMutation(fn, { onMutate, onError, onSuccess, onSettled })` → `{ mutate, status }` with optimistic updates and rollback.
- `queryClient.invalidate(prefix)`, `setQueryData(key, updater)`, `getQueryData(key)`.
- Refetch stale queries when the window regains focus or the network comes back.
- An API client that adds the auth token, times out, parses JSON and throws a consistent `ApiError`.

### Non-functional
- One network request per key at a time; cached data shown instantly on revisit.
- Retries never hammer the server (backoff) and never retry client errors.

### Assumptions
- React 18 + Vite. A tiny **mock server** (`mockServer.js`) patches `fetch` for `/api/*` with latency and random 503s, so the project runs without a backend (the same idea as MSW).
:::

::: ask
- *"How fresh must data be? Is a few seconds stale acceptable?"* (staleTime.)
- *"Which updates must feel instant?"* (Optimistic updates.)
- *"Do we need offline support or real-time pushes?"*
- *"REST or GraphQL?"* (Apollo/urql have normalised caches.)
- *"Is server-side rendering involved?"* (Hydrating the cache.)
:::

::: diagram Component tree and layers
flowchart TD
  UI["Components: TodoList, TodoStats"] --> HOOKS["useQuery / useMutation"]
  HOOKS --> QC["queryClient: cache Map, subscribers, inflight Map"]
  QC --> RETRY["retry with exponential backoff"]
  RETRY --> API["apiClient: base URL, auth, timeout, ApiError"]
  API --> NET["fetch → /api/todos"]
  NET --> MOCK["mockServer (dev only)"]
  EVENTS["window focus / online events"] --> QC
  MUT["mutation: optimistic setQueryData, rollback, invalidate"] --> QC
:::

::: diagram Sequence: optimistic toggle that fails, then rollback
sequenceDiagram
  participant U as User
  participant L as TodoList
  participant Q as queryClient
  participant A as apiClient
  participant S as Server
  U->>L: tick "Buy milk"
  L->>Q: onMutate: snapshot todos, setQueryData(done true)
  Q-->>L: re-render instantly (ticked)
  L->>A: PATCH /api/todos/2
  A->>S: request
  S-->>A: 503
  A-->>L: ApiError 503
  L->>Q: onError: setQueryData(snapshot)
  Q-->>L: un-ticked again + error message
  L->>Q: onSettled: invalidate todos
  Q->>A: GET /api/todos (background)
:::

::: image Data layer: API client, query cache with dedupe, staleness and retries, optimistic mutations
/images/frontend-lld/data-fetching.svg
:::

::: text 🧱 Design
### Cache entry
`{ key, data, error, status: 'idle' | 'loading' | 'success' | 'error', isFetching, updatedAt, promise, subscribers: Set, gcTimer }`

### queryClient methods
| Method | Behaviour |
|---|---|
| `fetchQuery(key, fn, opts)` | Returns the in-flight promise if one exists (**dedupe**); else runs `fn` with retries; stores data + `updatedAt` |
| `ensureFresh(key, fn, opts)` | Fetches only if missing or older than `staleTime` |
| `subscribe(key, cb)` / `getEntry(key)` | For `useSyncExternalStore`; last unsubscribe starts the `gcTime` timer |
| `setQueryData(key, updater)` / `getQueryData(key)` | Manual updates (optimistic) |
| `invalidate(prefix)` | Marks matching keys stale and refetches the ones on screen |

### API client
`api.get/post/patch/delete(path, body)` → JSON or throws `ApiError { status, message, details }`; adds `Authorization: Bearer <token>`; `AbortController` timeout; `retryable = network error or status >= 500 or 429`.
:::

::: text 📁 Folder structure
`data-layer/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/api/apiClient.js`, `src/api/todosApi.js`, `src/api/mockServer.js`
↳ `src/query/queryClient.js`, `src/query/useQuery.js`, `src/query/useMutation.js`
↳ `src/todos/TodoList.jsx`, `src/todos/TodoStats.jsx`
:::

::: code json data-layer/package.json
{
  "name": "data-layer",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
:::

::: code javascript data-layer/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code html data-layer/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data Layer LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code jsx data-layer/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installMockServer } from './api/mockServer.js';
import './styles.css';

installMockServer();          // dev only: answers /api/* inside the browser (remove with a real backend)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx data-layer/src/App.jsx
import { useState } from 'react';
import { TodoList } from './todos/TodoList.jsx';
import { TodoStats } from './todos/TodoStats.jsx';
import { queryClient } from './query/queryClient.js';
import { mockServerStats, setFailureRate } from './api/mockServer.js';

export default function App() {
  const [showList, setShowList] = useState(true);
  const [, rerender] = useState(0);

  return (
    <main className="page">
      <h1>Data-fetching layer</h1>
      <div className="row">
        <button type="button" onClick={() => setShowList((s) => !s)}>{showList ? 'Unmount' : 'Mount'} list</button>
        <button type="button" onClick={() => queryClient.invalidate(['todos'])}>Invalidate todos</button>
        <button type="button" onClick={() => { setFailureRate(0.6); rerender((n) => n + 1); }}>Make server flaky (60%)</button>
        <button type="button" onClick={() => { setFailureRate(0); rerender((n) => n + 1); }}>Make server healthy</button>
        <button type="button" onClick={() => rerender((n) => n + 1)}>Refresh stats</button>
      </div>
      <p className="muted">Server requests so far: {mockServerStats.requests} · failure rate: {Math.round(mockServerStats.failureRate * 100)}%</p>

      {/* Two components use the SAME key → one request, shared cache */}
      <TodoStats />
      {showList && <TodoList />}
    </main>
  );
}
:::

::: code javascript data-layer/src/api/apiClient.js
// One place for base URL, auth, timeouts, JSON and error shape.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;            // 0 = network error / timeout
    this.details = details;
  }
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;  // never retry 4xx validation/auth errors
  }
}

const BASE_URL = '/api';
let authToken = 'demo-token';
export const setAuthToken = (token) => { authToken = token; };

async function request(method, path, body, { timeoutMs = 8000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(0, err.name === 'AbortError' ? 'Request timed out' : 'Network error, check your connection');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, data?.error?.message || response.statusText, data?.error?.details);
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  delete: (path, opts) => request('DELETE', path, undefined, opts),
};
:::

::: code javascript data-layer/src/api/todosApi.js
// Endpoint functions: components never build URLs themselves.
import { api } from './apiClient.js';

export const todosApi = {
  list: () => api.get('/todos'),
  create: (title) => api.post('/todos', { title }),
  update: (id, patch) => api.patch(`/todos/${id}`, patch),
  remove: (id) => api.delete(`/todos/${id}`),
};
:::

::: code javascript data-layer/src/api/mockServer.js
// Dev-only fake backend: wraps fetch and answers /api/todos with latency and random 503s.
export const mockServerStats = { requests: 0, failureRate: 0.15 };
export const setFailureRate = (rate) => { mockServerStats.failureRate = rate; };

let todos = [
  { id: 1, title: 'Learn stale-while-revalidate', done: true },
  { id: 2, title: 'Buy milk', done: false },
  { id: 3, title: 'Write the LLD answer', done: false },
];
let nextId = 4;

const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function installMockServer() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    mockServerStats.requests += 1;
    await wait(300 + Math.random() * 400);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Math.random() < mockServerStats.failureRate) return json(503, { error: { message: 'Service temporarily unavailable' } });

    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const match = url.match(/^\/api\/todos(?:\/(\d+))?$/);
    if (!match) return json(404, { error: { message: 'Not found' } });
    const id = match[1] ? Number(match[1]) : null;

    if (method === 'GET' && !id) return json(200, todos);
    if (method === 'POST' && !id) {
      if (!body.title || !body.title.trim()) return json(400, { error: { message: 'Title is required' } });
      const todo = { id: nextId++, title: body.title.trim(), done: false };
      todos = [...todos, todo];
      return json(201, todo);
    }
    const todo = todos.find((t) => t.id === id);
    if (!todo) return json(404, { error: { message: `Todo ${id} not found` } });
    if (method === 'PATCH') {
      const updated = { ...todo, ...body };
      todos = todos.map((t) => (t.id === id ? updated : t));
      return json(200, updated);
    }
    if (method === 'DELETE') {
      todos = todos.filter((t) => t.id !== id);
      return json(204, null);
    }
    return json(405, { error: { message: 'Method not allowed' } });
  };
}
:::

::: code javascript data-layer/src/query/queryClient.js
// A small React-Query-like cache: dedupe, staleTime, gcTime, retries, invalidation, focus refetch.
const hashKey = (key) => JSON.stringify(key);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createQueryClient({ defaultStaleTime = 5000, defaultGcTime = 60000 } = {}) {
  const cache = new Map();                                  // hash → entry

  function getEntry(key) {
    const hash = hashKey(key);
    if (!cache.has(hash)) {
      cache.set(hash, {
        key, data: undefined, error: null, status: 'idle', isFetching: false, updatedAt: 0,
        promise: null, fetchId: 0, subscribers: new Set(), gcTimer: null, fetcher: null, options: {}, snapshot: null,
      });
    }
    return cache.get(hash);
  }

  function makeSnapshot(entry) {
    // a NEW object only when something changed → useSyncExternalStore re-renders
    entry.snapshot = { data: entry.data, error: entry.error, status: entry.status, isFetching: entry.isFetching, updatedAt: entry.updatedAt };
  }

  function notify(entry) {
    makeSnapshot(entry);
    entry.subscribers.forEach((cb) => cb());
  }

  async function withRetry(fn, retry, attempt = 0) {
    try {
      return await fn();
    } catch (err) {
      const canRetry = err.retryable !== false && attempt < retry;
      if (!canRetry) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 8000) * (0.5 + Math.random() / 2)); // backoff + jitter
      return withRetry(fn, retry, attempt + 1);
    }
  }

  // force = start a new request even if one is in flight (its result will be ignored)
  function fetchQuery(key, fetcher, options = {}, force = false) {
    const entry = getEntry(key);
    entry.fetcher = fetcher;
    entry.options = options;
    if (entry.promise && !force) return entry.promise;      // DEDUPE: share the in-flight request
    const id = ++entry.fetchId;                             // only the latest request may write
    const isLatest = () => id === entry.fetchId;
    entry.isFetching = true;
    if (entry.data === undefined) entry.status = 'loading';   // no data yet → spinner; else background refresh
    notify(entry);
    entry.promise = withRetry(fetcher, options.retry ?? 3)
      .then((data) => {
        if (isLatest()) Object.assign(entry, { data, error: null, status: 'success', updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        if (isLatest()) {
          entry.error = error;
          if (entry.data === undefined) entry.status = 'error'; // with old data we keep showing it
        }
        throw error;
      })
      .finally(() => {
        if (!isLatest()) return;                             // a newer request owns the entry
        entry.promise = null;
        entry.isFetching = false;
        notify(entry);
      });
    return entry.promise;
  }

  function isStale(entry, staleTime) {
    return entry.updatedAt === 0 || Date.now() - entry.updatedAt > staleTime;
  }

  function ensureFresh(key, fetcher, options = {}) {
    const entry = getEntry(key);
    const staleTime = options.staleTime ?? defaultStaleTime;
    if (isStale(entry, staleTime) || entry.status === 'idle') return fetchQuery(key, fetcher, options).catch(() => {});
    return Promise.resolve(entry.data);
  }

  function subscribe(key, cb) {
    const entry = getEntry(key);
    clearTimeout(entry.gcTimer);
    entry.subscribers.add(cb);
    return () => {
      entry.subscribers.delete(cb);
      if (entry.subscribers.size === 0) {
        const gcTime = entry.options.gcTime ?? defaultGcTime;   // keep data around for quick revisits
        entry.gcTimer = setTimeout(() => cache.delete(hashKey(entry.key)), gcTime);
      }
    };
  }

  function getSnapshot(key) {
    const entry = getEntry(key);
    if (!entry.snapshot) makeSnapshot(entry);                 // never notify during render
    return entry.snapshot;
  }

  function setQueryData(key, updater) {
    const entry = getEntry(key);
    entry.fetchId += 1;                                       // "cancel": in-flight results are now stale
    entry.promise = null;
    entry.isFetching = false;
    entry.data = typeof updater === 'function' ? updater(entry.data) : updater;
    entry.status = 'success';
    entry.updatedAt = Date.now();
    notify(entry);
  }

  const startsWith = (key, prefix) => prefix.every((part, i) => hashKey(part) === hashKey(key[i]));

  function invalidate(prefix) {
    for (const entry of cache.values()) {
      if (!startsWith(entry.key, prefix)) continue;
      entry.updatedAt = 0;                                    // stale now
      if (entry.subscribers.size > 0 && entry.fetcher) fetchQuery(entry.key, entry.fetcher, entry.options, true).catch(() => {});
    }
  }

  function refetchStaleActive() {
    for (const entry of cache.values()) {
      const staleTime = entry.options.staleTime ?? defaultStaleTime;
      if (entry.subscribers.size > 0 && entry.fetcher && isStale(entry, staleTime)) fetchQuery(entry.key, entry.fetcher, entry.options).catch(() => {});
    }
  }

  return {
    fetchQuery, ensureFresh, subscribe, getSnapshot, setQueryData, invalidate, refetchStaleActive,
    getQueryData: (key) => getEntry(key).data,
    _cache: cache,
  };
}

export const queryClient = createQueryClient();

// Refetch stale on-screen data when the user comes back to the tab or the network returns
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => queryClient.refetchStaleActive());
  window.addEventListener('online', () => queryClient.refetchStaleActive());
}
:::

::: code javascript data-layer/src/query/useQuery.js
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { queryClient } from './queryClient.js';

export function useQuery(key, fetcher, options = {}) {
  const { enabled = true, staleTime, retry, gcTime } = options;
  const hash = JSON.stringify(key);

  const subscribe = useCallback((cb) => queryClient.subscribe(key, cb), [hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const getSnapshot = useCallback(() => queryClient.getSnapshot(key), [hash]);   // eslint-disable-line react-hooks/exhaustive-deps
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (enabled) queryClient.ensureFresh(key, fetcher, { staleTime, retry, gcTime });
  }, [hash, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => queryClient.fetchQuery(key, fetcher, { staleTime, retry, gcTime }).catch(() => {}), [hash]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    isLoading: state.status === 'loading' || (enabled && state.status === 'idle'), // first render before the effect
    isError: state.status === 'error',
    refetch,
  };
}
:::

::: code javascript data-layer/src/query/useMutation.js
import { useCallback, useState } from 'react';

/**
 * onMutate(vars) → context (e.g. a snapshot for rollback)
 * onError(err, vars, context) · onSuccess(data, vars, context) · onSettled(data, err, vars, context)
 */
export function useMutation(mutationFn, { onMutate, onError, onSuccess, onSettled } = {}) {
  const [state, setState] = useState({ status: 'idle', error: null, data: undefined });

  const mutate = useCallback(async (vars) => {
    setState({ status: 'pending', error: null, data: undefined });
    const context = onMutate ? await onMutate(vars) : undefined;
    try {
      const data = await mutationFn(vars);
      onSuccess?.(data, vars, context);
      setState({ status: 'success', error: null, data });
      onSettled?.(data, null, vars, context);
      return data;
    } catch (error) {
      onError?.(error, vars, context);
      setState({ status: 'error', error, data: undefined });
      onSettled?.(undefined, error, vars, context);
      return undefined;
    }
  }, [mutationFn, onMutate, onError, onSuccess, onSettled]);

  return { ...state, mutate, isPending: state.status === 'pending' };
}
:::

::: code jsx data-layer/src/todos/TodoList.jsx
import { useState } from 'react';
import { useQuery } from '../query/useQuery.js';
import { useMutation } from '../query/useMutation.js';
import { queryClient } from '../query/queryClient.js';
import { todosApi } from '../api/todosApi.js';

const TODOS = ['todos'];

export function TodoList() {
  const todos = useQuery(TODOS, todosApi.list, { staleTime: 10000 });
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  // Optimistic toggle: update the cache first, roll back if the server fails
  const toggle = useMutation(({ id, done }) => todosApi.update(id, { done }), {
    onMutate: ({ id, done }) => {
      const previous = queryClient.getQueryData(TODOS);
      queryClient.setQueryData(TODOS, (list = []) => list.map((t) => (t.id === id ? { ...t, done } : t)));
      setMessage('');
      return { previous };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(TODOS, context.previous);       // rollback
      setMessage(`Could not update: ${err.message} (change undone)`);
    },
    onSettled: () => queryClient.invalidate(TODOS),            // sync with the server truth
  });

  const create = useMutation((newTitle) => todosApi.create(newTitle), {
    onSuccess: (todo) => {
      queryClient.setQueryData(TODOS, (list = []) => [...list, todo]);
      setTitle('');
      setMessage('');
    },
    onError: (err) => setMessage(`Could not add: ${err.message}`),
  });

  if (todos.isLoading) return <p aria-busy="true">Loading todos…</p>;
  if (todos.isError && !todos.data) {
    return (
      <p role="alert">
        Failed to load: {todos.error.message} <button type="button" onClick={todos.refetch}>Retry</button>
      </p>
    );
  }

  return (
    <section className="card" aria-labelledby="todos-title">
      <h2 id="todos-title">
        Todos {todos.isFetching && <small className="muted">(refreshing…)</small>}
      </h2>
      <ul className="todos">
        {todos.data.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={t.done} onChange={(e) => toggle.mutate({ id: t.id, done: e.target.checked })} />
              <span className={t.done ? 'done' : undefined}>{t.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(title); }} className="row">
        <input aria-label="New todo" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a todo" />
        <button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</button>
      </form>
      {message && <p role="alert" className="error">{message}</p>}
      <p className="muted">Last updated: {todos.updatedAt ? new Date(todos.updatedAt).toLocaleTimeString() : 'never'}</p>
    </section>
  );
}
:::

::: code jsx data-layer/src/todos/TodoStats.jsx
// Uses the SAME query key as TodoList: no extra request, always in sync.
import { useQuery } from '../query/useQuery.js';
import { todosApi } from '../api/todosApi.js';

export function TodoStats() {
  const { data, isLoading } = useQuery(['todos'], todosApi.list, { staleTime: 10000 });
  if (isLoading || !data) return <p className="muted">Stats loading…</p>;
  const done = data.filter((t) => t.done).length;
  return <p className="stats">✅ {done} done · ⏳ {data.length - done} open</p>;
}
:::

::: code css data-layer/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.muted { color: #64748b; font-size: 14px; }
.card { background: #fff; border: 1px solid #dbe1ea; border-radius: 12px; padding: 16px 20px; margin-top: 12px; }
.todos { list-style: none; padding: 0; }
.todos li { padding: 6px 0; }
.done { text-decoration: line-through; color: #64748b; }
.error { color: #b91c1c; }
.stats { font-weight: 600; }
button, input { padding: 7px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: inherit; font-size: 14px; }
button { cursor: pointer; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } .card, button, input { background: #111827; border-color: #273449; } }
:::

::: code javascript Browser simulation: dedupe, retries, staleness and rollback (runnable)
// A compact copy of the queryClient rules, driven by a fake server.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let serverCalls = 0, failNext = 0;
const server = { todos: [{ id: 1, done: false }] };
async function fetchTodos() { serverCalls++; await sleep(10); if (failNext-- > 0) throw Object.assign(new Error('503'), { retryable: true }); return structuredClone(server.todos); }

function createClient() {
  const cache = new Map();
  const entry = (k) => cache.get(k) || cache.set(k, { data: undefined, updatedAt: 0, promise: null }).get(k);
  async function withRetry(fn, retry, attempt = 0) { try { return await fn(); } catch (e) { if (!e.retryable || attempt >= retry) throw e; await sleep(5 * 2 ** attempt); return withRetry(fn, retry, attempt + 1); } }
  return {
    fetch(k, fn, retry = 3) { const e = entry(k); if (e.promise) return e.promise; e.promise = withRetry(fn, retry).then((d) => { e.data = d; e.updatedAt = Date.now(); return d; }).finally(() => { e.promise = null; }); return e.promise; },
    ensureFresh(k, fn, staleTime) { const e = entry(k); return Date.now() - e.updatedAt > staleTime ? this.fetch(k, fn) : Promise.resolve(e.data); },
    get: (k) => entry(k).data,
    set: (k, up) => { entry(k).data = up(entry(k).data); },
  };
}

// ---------- tests ----------
(async () => {
  const qc = createClient();
  await Promise.all([qc.fetch('todos', fetchTodos), qc.fetch('todos', fetchTodos), qc.fetch('todos', fetchTodos)]);
  console.log('3 components, same key → server calls:', serverCalls, serverCalls === 1 ? '✅' : '❌ FAIL');
  await qc.ensureFresh('todos', fetchTodos, 10000);
  console.log('fresh within staleTime → no new call:', serverCalls, serverCalls === 1 ? '✅' : '❌ FAIL');
  await sleep(20);
  await qc.ensureFresh('todos', fetchTodos, 5);
  console.log('stale after staleTime → refetched:', serverCalls, serverCalls === 2 ? '✅' : '❌ FAIL');
  failNext = 2;
  const data = await qc.fetch('todos', fetchTodos);
  console.log('2 failures then success with retry → calls:', serverCalls, serverCalls === 5 && data.length === 1 ? '✅' : '❌ FAIL');
  const noRetry = await qc.fetch('x', async () => { serverCalls++; throw Object.assign(new Error('400'), { retryable: false }); }).catch((e) => e.message);
  console.log('4xx is not retried →', noRetry, serverCalls === 6 ? '✅' : '❌ FAIL');
  const snapshot = qc.get('todos');
  qc.set('todos', (list) => list.map((t) => ({ ...t, done: true })));
  console.log('optimistic update visible immediately →', qc.get('todos')[0].done === true ? '✅' : '❌ FAIL');
  qc.set('todos', () => snapshot);                                   // server failed → rollback
  console.log('rollback restores the snapshot →', qc.get('todos')[0].done === false ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
1. Create the files, then `cd data-layer && npm install && npm run dev` → open the printed URL.
2. On load, **TodoStats** and **TodoList** both use the `['todos']` key → "Server requests so far: 1" (click Refresh stats): **dedupe**.
3. **Unmount list**, then **Mount list** within 10 s → the list appears instantly from cache, no "Loading…" and no new request (fresh). After 10 s, mounting shows cached data immediately *and* "(refreshing…)" in the background: **stale-while-revalidate**.
4. Switch to another tab and back after 10 s → a background refetch (**focus refetch**).
5. Click **Make server flaky (60%)** and tick a todo → it ticks instantly (optimistic); if the PATCH fails, it un-ticks and shows "Could not update… (change undone)".
6. Add an empty todo → the 400 error is shown immediately (**no retries** for client errors). Add "Read docs" → appears in both list and stats.
7. **Invalidate todos** → one refetch for all components using the key.
8. With a real backend, delete `installMockServer()` from `main.jsx`; the rest stays the same.
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Library | **Own cache** (to learn, this) | **TanStack Query** / SWR / RTK Query / Apollo | TanStack Query in production: devtools, pagination, infinite queries, SSR hydration |
| Server state in | Redux/global store | **Query cache** (server state ≠ UI state) | Query cache; keep Redux/Zustand for client-only state |
| Freshness | `staleTime: 0` (always refetch) | Longer `staleTime` | Per query: prices 0–5 s, user profile minutes |
| Updates | Wait for the server | **Optimistic + rollback** | Optimistic for fast, likely-to-succeed actions (likes, toggles); not for payments |
| After mutation | Refetch everything | **Invalidate related keys** / `setQueryData` | Targeted invalidation; hierarchical keys `['todos', id]` |
| Cache shape | Per-query (document) | Normalised by entity id (Apollo, RTK) | Per-query is simpler; normalise when the same entity appears in many lists |
:::

::: text 📈 Scaling & edge cases
- **Pagination / infinite lists**: keys like `['todos', { page }]`, `keepPreviousData`, cursor-based `useInfiniteQuery`.
- **Real-time**: WebSocket events call `setQueryData` or `invalidate`; polling with `refetchInterval` as a fallback.
- **SSR / Next.js**: prefetch on the server, dehydrate the cache into HTML, hydrate on the client.
- **Auth**: on 401 refresh the token once, then retry (see the Auth frontend design); clear the cache on logout (`queryClient.clear()`).
- **Edge cases**: race between an optimistic update and a background refetch (here every fetch has an id and `setQueryData`/`invalidate` make older in-flight results stale, like `cancelQueries`), memory growth (gcTime), request waterfalls (prefetch, parallel queries), offline mutations (queue + persist).
:::

::: warning ⚠️ Common mistakes
- `useEffect(() => fetch(...))` in every component: duplicate requests, no cache, race conditions, no retries.
- Retrying 400/401/404 errors (they will never succeed).
- Optimistic updates without a snapshot to roll back to.
- Putting server data into Redux and hand-writing loading flags everywhere.
- Using a non-serialisable or unstable query key (new object each render → infinite refetch).
:::

::: understand
- Separate **server state** (owned by the backend, cached in the browser, can be stale) from **client state** (owned by the UI). A query cache is a specialised store for server state.
- The core ideas, keys, dedupe, staleness, background refresh, retry with backoff, invalidation, optimistic updates, are exactly what TanStack Query implements.
:::

::: important ⭐ How to present this design in 5 minutes
> "I split it into an API client and a query cache. The API client centralises the base URL, auth header, timeout and JSON parsing, and throws one ApiError type that knows whether it's retryable: network errors, 429 and 5xx yes, other 4xx no. The cache maps a serialisable key to data, status, updatedAt and subscribers; components read it through useQuery built on useSyncExternalStore. Identical in-flight requests are deduped, cached data is shown immediately and refetched in the background when older than staleTime, unused entries are garbage-collected after gcTime, and stale active queries refetch on window focus or reconnect. Mutations do optimistic updates: snapshot, setQueryData, call the API, roll back on error, and invalidate related keys when settled. In production I'd use TanStack Query, which implements exactly these concepts."
:::

::: links
TanStack Query: Overview | https://tanstack.com/query/latest/docs/framework/react/overview
TanStack Query: Optimistic updates | https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
SWR (stale-while-revalidate) | https://swr.vercel.app/
MDN: Using Fetch | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
:::

=== Design the frontend of an Auth flow (login, refresh, protected routes)
@p 2
@tags lld, react, auth, security
@quick
- **Access token in memory** (short-lived, e.g. 15 min), **refresh token in an httpOnly, Secure, SameSite cookie** (JS can't read it → XSS can't steal it).
- On page load: **silent refresh** (`POST /auth/refresh`) → get an access token + user; show a splash while `status = 'checking'`.
- HTTP wrapper: add `Authorization: Bearer`; on **401 → refresh once (single-flight)** → retry the request; refresh fails → logout.
- **Protected routes**: `checking` → spinner, `anonymous` → redirect to `/login` with `from`, wrong role → 403 page. UI checks are UX only; the server enforces.
- **Logout** everywhere: clear memory, call `/auth/logout` (revokes the refresh token), and sync tabs with `BroadcastChannel`.

::: text 🧒 In simple words
Logging in is like getting a **wristband at a festival**. The short-lived wristband (access token) gets you into tents, and it expires quickly so a stolen one isn't worth much. The ticket office keeps a **locked locker key** for you (refresh cookie) that your browser carries automatically but no script can peek into; when the wristband expires, the browser quietly swaps the key for a new wristband. The frontend's job is to do this swap smoothly (once, even if 5 requests fail together), send you to the login page when needed and back to where you were afterwards, and log every tab out together.
:::

::: text 📋 Requirements
### Functional
- Login page (email + password) with errors; redirect back to the originally requested page.
- Keep the user logged in across reloads (silent refresh) without storing tokens in `localStorage`.
- Protected pages (`/dashboard`), role-protected page (`/admin` for admins only), public home.
- Automatic token refresh on 401 (concurrent requests trigger **one** refresh), logout, cross-tab logout.

### Non-functional
- XSS-resistant token storage; CSRF-safe refresh (SameSite cookie + JSON body + same-origin proxy).
- No flash of protected content before the auth check finishes.

### Assumptions
- React 18 + Vite + React Router 6; a small **Express mock auth server** in the same project (`server/index.js`) with an access token TTL of 30 seconds so you can watch refreshes happen. Vite proxies `/api` to it (same origin → cookies just work).
:::

::: ask
- *"Is the API on the same site as the frontend?"* (Cookie `SameSite`, CORS with credentials.)
- *"Session cookies or JWT?"* (Server-rendered apps often use plain session cookies.)
- *"Social login / SSO (OAuth, OIDC)? MFA?"*
- *"How long should sessions last? 'Remember me'?"*
- *"Role-based UI: which roles and pages?"*
:::

::: diagram Component tree
flowchart TD
  MAIN["main.jsx: BrowserRouter + AuthProvider"] --> AP["AuthProvider (user, status, login, logout)"]
  AP --> HTTP["http.js: Bearer header, 401 → single-flight refresh → retry"]
  HTTP --> TS["tokenStore (memory only)"]
  AP --> BC["BroadcastChannel 'auth' (cross-tab logout)"]
  MAIN --> ROUTES["App routes"]
  ROUTES --> HOME["/ Home (public)"]
  ROUTES --> LOGIN["/login LoginPage"]
  ROUTES --> PR["ProtectedRoute (checking, anonymous, role)"]
  PR --> DASH["/dashboard"]
  PR --> ADMIN["/admin (role admin)"]
:::

::: diagram Sequence: expired access token, two parallel requests, one refresh
sequenceDiagram
  participant D as Dashboard
  participant H as http.js
  participant S as Auth server
  D->>H: GET /api/me and GET /api/notes (parallel)
  H->>S: both with expired Bearer token
  S-->>H: 401, 401
  H->>H: first 401 starts refresh, second waits on the same promise
  H->>S: POST /api/auth/refresh (httpOnly cookie sent automatically)
  S-->>H: new access token + rotated refresh cookie
  H->>S: retry both requests with the new token
  S-->>H: 200, 200
  H-->>D: data (user never noticed)
:::

::: image Auth frontend: memory token, refresh cookie, single-flight refresh, protected routes
/images/frontend-lld/auth-frontend.svg
:::

::: text 🧱 Design
### Auth state (`AuthProvider`)
`{ status: 'checking' | 'authenticated' | 'anonymous', user: { id, email, name, role } | null }` + `login(email, password)`, `logout()`, `hasRole(role)`.

### Where things live
| Data | Where | Why |
|---|---|---|
| Access token | JS memory (`tokenStore`) | Gone on reload, never in storage → XSS can't read it later; short TTL limits damage |
| Refresh token | `httpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie | JS can't read it; sent only to the auth endpoints |
| User profile | React state | Rendering only; the server is the authority |

### `http.js` rules
1. Add `Authorization` if a token exists; always `credentials: 'include'`.
2. On `401` (and the request isn't the refresh call itself): `await refreshOnce()` → retry **once**.
3. `refreshOnce` keeps **one shared promise** while a refresh is running (single-flight).
4. Refresh fails → clear the token and emit `auth:logout` → the provider sets `anonymous` → routes redirect.

### Server endpoints (mock)
`POST /api/auth/login`, `POST /api/auth/refresh` (rotates the cookie), `POST /api/auth/logout`, `GET /api/me`, `GET /api/notes`, `GET /api/admin/stats` (admin only).
:::

::: text 📁 Folder structure
`auth-frontend/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `server/index.js` (mock auth API)
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/auth/tokenStore.js`, `src/auth/http.js`, `src/auth/AuthProvider.jsx`, `src/auth/ProtectedRoute.jsx`
↳ `src/pages/HomePage.jsx`, `src/pages/LoginPage.jsx`, `src/pages/DashboardPage.jsx`, `src/pages/AdminPage.jsx`, `src/pages/ForbiddenPage.jsx`
:::

::: code json auth-frontend/package.json
{
  "name": "auth-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "server": "node server/index.js",
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "express": "^4.19.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
:::

::: code javascript auth-frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // same origin for the browser → cookies work without CORS
    proxy: { '/api': 'http://localhost:4000' },
  },
});
:::

::: code html auth-frontend/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Auth Frontend LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript auth-frontend/server/index.js
// Mock auth API (ESM). Access tokens are HMAC-signed and expire in 30 s; refresh tokens rotate.
import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json());

const SECRET = crypto.randomBytes(32);
const ACCESS_TTL_MS = 30 * 1000;                    // short on purpose so you can watch refreshes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hash = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const users = [
  { id: 1, email: 'alice@example.com', name: 'Alice', role: 'admin', salt: 's1', passwordHash: hash('password123', 's1') },
  { id: 2, email: 'bob@example.com', name: 'Bob', role: 'user', salt: 's2', passwordHash: hash('password123', 's2') },
];
const refreshTokens = new Map();                    // token → { userId, expiresAt }
const publicUser = ({ id, email, name, role }) => ({ id, email, name, role });

// ---------- tokens ----------
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function signAccess(user) {
  const payload = b64({ sub: user.id, role: user.role, exp: Date.now() + ACCESS_TTL_MS });
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyAccess(token) {
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}
function issueRefresh(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  refreshTokens.set(token, { userId, expiresAt: Date.now() + REFRESH_TTL_MS });
  res.cookie('rt', token, {
    httpOnly: true,                                 // invisible to JavaScript
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
    sameSite: 'strict',
    path: '/api/auth',                              // only sent to auth endpoints
    maxAge: REFRESH_TTL_MS,
  });
}
const readCookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

// ---------- middleware ----------
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const claims = verifyAccess(token);
  if (!claims) return res.status(401).json({ error: { message: 'Access token missing or expired' } });
  req.user = users.find((u) => u.id === claims.sub);
  return next();
}
const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: { message: 'Forbidden' } });

// ---------- routes ----------
app.post('/api/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = users.find((u) => u.email === email.toLowerCase().trim());
  if (!user || hash(password, user.salt) !== user.passwordHash) {
    return res.status(401).json({ error: { message: 'Invalid email or password' } }); // same message for both
  }
  issueRefresh(res, user.id);
  return res.json({ accessToken: signAccess(user), user: publicUser(user) });
});

app.post('/api/auth/refresh', (req, res) => {
  const token = readCookie(req, 'rt');
  const record = token && refreshTokens.get(token);
  if (!record || record.expiresAt < Date.now()) return res.status(401).json({ error: { message: 'Session expired' } });
  refreshTokens.delete(token);                      // rotation: each refresh token works once
  const user = users.find((u) => u.id === record.userId);
  issueRefresh(res, user.id);
  return res.json({ accessToken: signAccess(user), user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = readCookie(req, 'rt');
  if (token) refreshTokens.delete(token);
  res.clearCookie('rt', { path: '/api/auth' });
  res.status(204).end();
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.get('/api/notes', requireAuth, (req, res) => res.json({ notes: [`Private note for ${req.user.name}`, `Fetched at ${new Date().toLocaleTimeString()}`] }));
app.get('/api/admin/stats', requireAuth, requireRole('admin'), (req, res) => res.json({ users: users.length, activeSessions: refreshTokens.size }));

app.listen(4000, () => console.log('Mock auth API on http://localhost:4000'));
:::

::: code javascript auth-frontend/src/auth/tokenStore.js
// The access token lives ONLY in memory (a module variable). Reload → gone → silent refresh.
let accessToken = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token) => { accessToken = token; },
  clear: () => { accessToken = null; },
};
:::

::: code javascript auth-frontend/src/auth/http.js
// fetch wrapper: Bearer token, JSON, and "401 → refresh once → retry" with a SINGLE shared refresh.
import { tokenStore } from './tokenStore.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let refreshPromise = null;                          // single-flight: shared by all waiting requests
const listeners = new Set();
export const onSessionExpired = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

async function rawRequest(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  const res = await fetch(path, {
    method,
    credentials: 'include',                         // send the refresh cookie to /api/auth/*
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status, data?.error?.message || res.statusText);
  return data;
}

/** Calls /api/auth/refresh once even if many requests ask at the same time. */
export function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/api/auth/refresh', { method: 'POST' })
      .then((data) => {
        tokenStore.set(data.accessToken);
        return data;
      })
      .catch((err) => {
        tokenStore.clear();
        listeners.forEach((cb) => cb());            // tell the AuthProvider: session is over
        throw err;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/** Use this for every API call. */
export async function http(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    const isAuthCall = path.startsWith('/api/auth/');
    if (err.status !== 401 || isAuthCall || options._retried) throw err;
    await refreshOnce();                             // throws if the session really expired
    return rawRequest(path, { ...options, _retried: true });
  }
}
:::

::: code jsx auth-frontend/src/auth/AuthProvider.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http, refreshOnce, onSessionExpired } from './http.js';
import { tokenStore } from './tokenStore.js';

const AuthContext = createContext(null);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth') : null;

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });

  const becomeAnonymous = useCallback(() => {
    tokenStore.clear();
    setState({ status: 'anonymous', user: null });
  }, []);

  // 1. On load: try a silent refresh (the httpOnly cookie may still be valid)
  useEffect(() => {
    let cancelled = false;
    refreshOnce()
      .then((data) => { if (!cancelled) setState({ status: 'authenticated', user: data.user }); })
      .catch(() => { if (!cancelled) setState({ status: 'anonymous', user: null }); });
    return () => { cancelled = true; };
  }, []);

  // 2. A failed refresh anywhere → logged out; 3. Other tabs logging in/out → follow them
  useEffect(() => {
    const offExpired = onSessionExpired(becomeAnonymous);
    const onMessage = (e) => {
      if (e.data === 'logout') becomeAnonymous();
      if (e.data === 'login') refreshOnce().then((d) => setState({ status: 'authenticated', user: d.user })).catch(() => {});
    };
    channel?.addEventListener('message', onMessage);
    return () => { offExpired(); channel?.removeEventListener('message', onMessage); };
  }, [becomeAnonymous]);

  const login = useCallback(async (email, password) => {
    const data = await http('/api/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(data.accessToken);
    setState({ status: 'authenticated', user: data.user });
    channel?.postMessage('login');
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await http('/api/auth/logout', { method: 'POST' }); } catch { /* already logged out on the server */ }
    becomeAnonymous();
    channel?.postMessage('logout');
  }, [becomeAnonymous]);

  const value = useMemo(() => ({
    ...state,
    login,
    logout,
    hasRole: (role) => state.user?.role === role,
  }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
:::

::: code jsx auth-frontend/src/auth/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';

/** Wrap routes: <Route element={<ProtectedRoute role="admin" />}>…</Route> */
export function ProtectedRoute({ role }) {
  const { status, hasRole } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <p className="splash" aria-busy="true">Checking your session…</p>; // no flash of content
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && !hasRole(role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
:::

::: code jsx auth-frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
:::

::: code jsx auth-frontend/src/App.jsx
import { Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider.jsx';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { ForbiddenPage } from './pages/ForbiddenPage.jsx';

export default function App() {
  const { status, user, logout, hasRole } = useAuth();
  return (
    <>
      <nav className="nav">
        <Link to="/">Home</Link>
        <Link to="/dashboard">Dashboard</Link>
        {hasRole('admin') && <Link to="/admin">Admin</Link>}
        <span className="spacer" />
        {status === 'authenticated' ? (
          <>
            <span>{user.name} ({user.role})</span>
            <button type="button" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </nav>
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<p>Page not found</p>} />
        </Routes>
      </main>
    </>
  );
}
:::

::: code jsx auth-frontend/src/pages/HomePage.jsx
export function HomePage() {
  return (
    <section>
      <h1>Welcome</h1>
      <p>Public page. Try <code>alice@example.com</code> (admin) or <code>bob@example.com</code> (user), password <code>password123</code>.</p>
      <p className="muted">Access tokens expire after 30 seconds: watch the Network tab for automatic refreshes on the dashboard.</p>
    </section>
  );
}
:::

::: code jsx auth-frontend/src/pages/LoginPage.jsx
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });            // back to where the user wanted to go
    } catch (err) {
      setError(err.status === 401 ? 'Invalid email or password' : 'Login failed, please try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="login-title">
      <h1 id="login-title">Log in</h1>
      {location.state?.from && <p className="muted">Please log in to continue to {location.state.from}</p>}
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}
:::

::: code jsx auth-frontend/src/pages/DashboardPage.jsx
import { useEffect, useState } from 'react';
import { http } from '../auth/http.js';
import { useAuth } from '../auth/AuthProvider.jsx';

export function DashboardPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    // Two parallel calls: if the token expired, http.js refreshes ONCE and retries both
    Promise.all([http('/api/me'), http('/api/notes')])
      .then(([, data]) => setNotes(data.notes))
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);

  return (
    <section>
      <h1>Dashboard</h1>
      <p>Hello {user.name}! This page needs a valid session.</p>
      <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" onClick={load}>Reload notes (wait 30 s to see a refresh)</button>
    </section>
  );
}
:::

::: code jsx auth-frontend/src/pages/AdminPage.jsx
import { useEffect, useState } from 'react';
import { http } from '../auth/http.js';

export function AdminPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    http('/api/admin/stats').then(setStats).catch((err) => setError(err.message)); // the SERVER enforces the role too
  }, []);
  return (
    <section>
      <h1>Admin</h1>
      {stats && <p>Users: {stats.users} · Active sessions: {stats.activeSessions}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
:::

::: code jsx auth-frontend/src/pages/ForbiddenPage.jsx
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <section>
      <h1>403: Not allowed</h1>
      <p>Your account doesn't have access to this page.</p>
      <Link to="/">Go home</Link>
    </section>
  );
}
:::

::: code css auth-frontend/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.nav { display: flex; gap: 16px; align-items: center; padding: 12px 20px; background: #1e293b; color: #e2e8f0; }
.nav a { color: #c7d2fe; }
.spacer { flex: 1; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
.card { display: flex; flex-direction: column; gap: 8px; max-width: 360px; background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #dbe1ea; }
input { padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; }
button { padding: 8px 14px; border-radius: 8px; border: 1px solid #4f46e5; background: #4f46e5; color: #fff; cursor: pointer; }
.error { color: #b91c1c; margin: 0; }
.muted { color: #64748b; font-size: 14px; }
.splash { color: #64748b; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } .card { background: #111827; border-color: #273449; } input { background: #0f172a; color: inherit; border-color: #334155; } }
:::

::: code javascript Browser simulation: single-flight refresh and retry (runnable)
// The http.js rules with a fake server whose token expires.
let validToken = 'old', refreshCalls = 0, sessionAlive = true, token = 'expired';
async function fakeFetch(path) {
  await new Promise((r) => setTimeout(r, 5));
  if (path === '/api/auth/refresh') { refreshCalls++; if (!sessionAlive) return { status: 401 }; validToken = 'new-' + refreshCalls; return { status: 200, data: { accessToken: validToken } }; }
  return token === validToken ? { status: 200, data: { path } } : { status: 401 };
}
let refreshPromise = null, loggedOut = false;
async function raw(path) { const r = await fakeFetch(path); if (r.status !== 200) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status }); return r.data; }
function refreshOnce() {
  if (!refreshPromise) refreshPromise = raw('/api/auth/refresh').then((d) => { token = d.accessToken; return d; }).catch((e) => { token = null; loggedOut = true; throw e; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function http(path, retried = false) {
  try { return await raw(path); } catch (e) { if (e.status !== 401 || retried) throw e; await refreshOnce(); return http(path, true); }
}

// ---------- tests ----------
(async () => {
  const results = await Promise.all(['/api/me', '/api/notes', '/api/orders'].map((p) => http(p)));
  console.log('3 parallel 401s → refresh calls:', refreshCalls, refreshCalls === 1 ? '✅' : '❌ FAIL');
  console.log('all 3 retried successfully →', results.map((r) => r.path).join(' '), results.length === 3 ? '✅' : '❌ FAIL');
  console.log('new token in memory →', token, token === 'new-1' ? '✅' : '❌ FAIL');
  await http('/api/me');
  console.log('valid token → no extra refresh:', refreshCalls, refreshCalls === 1 ? '✅' : '❌ FAIL');
  token = 'expired'; sessionAlive = false;                    // refresh cookie revoked too
  const err = await http('/api/me').catch((e) => e.message);
  console.log('session gone → request fails with', err, 'and user logged out', loggedOut && token === null ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
1. Create the files and run `cd auth-frontend && npm install`. Then, in two terminals:
`npm run server` → "Mock auth API on http://localhost:4000"
`npm run dev` → open `http://localhost:5173`
2. Open **/dashboard** while logged out → redirected to **/login** with "Please log in to continue to /dashboard".
3. Log in as `bob@example.com` / `password123` → you land back on **/dashboard**. In DevTools → Application → Cookies, `rt` is **HttpOnly** (`document.cookie` in the console doesn't show it). `localStorage` is empty.
4. **Reload** the page → "Checking your session…" briefly, then you're still logged in (silent refresh via the cookie).
5. Wait 30+ seconds, click **Reload notes** → Network tab: `/api/me` and `/api/notes` return **401**, then **one** `POST /api/auth/refresh`, then both requests are retried with **200**.
6. As Bob, open **/admin** → redirected to **/403**. Log in as Alice (admin) → the Admin link appears and the page shows stats.
7. Open two tabs, click **Log out** in one → the other tab switches to logged-out too (BroadcastChannel).
8. Server-side check with curl:
`curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@example.com","password":"password123"}' -c jar.txt`
→ `{"accessToken":"…","user":{"id":2,"email":"bob@example.com","name":"Bob","role":"user"}}`
`curl -s -X POST localhost:4000/api/auth/refresh -b jar.txt -c jar.txt` → a new access token (the old refresh cookie no longer works: rotation).
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Token storage | `localStorage` (easy, survives reload) | **Memory + httpOnly refresh cookie** | Memory + cookie: XSS can't exfiltrate the long-lived token |
| Session model | JWT access + refresh | **Server session cookie** (`sid`, httpOnly) | Plain session cookie for same-site apps (simplest, revocable); JWT when many APIs/services verify tokens |
| Refresh timing | Reactive (on 401, this design) | Proactive timer before `exp` | Reactive + optional proactive; both need single-flight |
| Cross-site API | Same-origin proxy (this) | CORS with `credentials: 'include'` + `SameSite=None; Secure` + CSRF token | Same origin whenever possible |
| Route guard | Per-page checks | **`<ProtectedRoute>` layout route** | Layout route; plus server checks on every API call |
| Third-party login | Own login form | **OIDC** (Auth0, Cognito, Keycloak) with PKCE | OIDC for SSO/social/MFA |
:::

::: text 📈 Scaling & edge cases
- **Security**: CSP to reduce XSS; refresh-token rotation with reuse detection (a reused token revokes the whole family); rate-limit login; generic error messages; MFA.
- **Many tabs**: they share the cookie; rotation can race (two tabs refresh at once) → a short grace period on the old token or a cross-tab lock (`navigator.locks`).
- **SSR (Next.js)**: read the session cookie on the server, render the right page, avoid the "checking" flash.
- **Edge cases**: refresh fails while a form is half filled (keep the draft, re-login in a modal), clock skew (server decides expiry), 403 vs 401 (403 = logged in but not allowed → never refresh), logout must revoke on the server.
:::

::: warning ⚠️ Common mistakes
- Storing long-lived tokens in `localStorage` (one XSS bug = stolen sessions).
- N parallel 401s → N refresh calls → rotation invalidates all but one → random logouts.
- Retrying forever (refresh → 401 → refresh…). Retry once; never refresh on the refresh endpoint.
- Rendering protected content before the auth check finishes (flash), or relying on hidden UI for security.
- Logout that only clears client state but leaves the refresh token valid on the server.
:::

::: understand
- The frontend's auth job is **state + plumbing**: know who the user is, attach credentials, recover from expiry transparently, and route correctly. **Authorization always happens on the server.**
- Single-flight refresh is the same "share one in-flight promise" idea as request dedupe in the data-fetching layer.
:::

::: important ⭐ How to present this design in 5 minutes
> "The access token is short-lived and kept only in memory; the refresh token is an httpOnly, Secure, SameSite cookie scoped to the auth path, so JavaScript, and therefore XSS, can't read it. On load the AuthProvider does a silent refresh and shows a checking state until it knows if the user is logged in. All API calls go through an http wrapper that adds the Bearer token and, on a 401, runs a single-flight refresh, one shared promise for all failing requests, then retries each request once; if refresh fails it clears state and the app goes anonymous. A ProtectedRoute layout route shows a spinner while checking, redirects to login with the original path, and sends wrong roles to a 403 page, but the server enforces roles on every endpoint. Logout revokes the refresh token server-side and BroadcastChannel logs out other tabs."
:::

::: links
OWASP: HTML5 Security Cheat Sheet (local storage) | https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
OWASP: Session Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
Auth0: Refresh token rotation | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
React Router: Auth example | https://github.com/remix-run/react-router/tree/dev/examples/auth
:::

=== Design a File Upload component (chunked, resumable, with progress)
@p 3
@tags lld, react, upload, xhr
@quick
- **Validate first** (type, size, count) on the client; the server validates again.
- **Chunked upload** (e.g. 1 MB parts): `init → PUT chunk i → complete`. Progress = bytes sent / total; a failed chunk is retried alone.
- **Resumable**: the server remembers received chunks; after a refresh or network drop, ask `GET /uploads/:id` and send only the missing ones.
- **Concurrency limit** (e.g. 3 files × 3 chunks), **pause/resume/cancel** via `AbortController`/`xhr.abort()`, retry with backoff.
- UX + a11y: drag-and-drop **and** a real file `<input>` (keyboard), per-file progress with `role="progressbar"`, image previews with `URL.createObjectURL` (revoke later).

::: text 🧒 In simple words
Uploading a big video in one piece is like **carrying a whole wardrobe up the stairs at once**: if you trip on the 9th floor, you start again from the ground. Chunked upload carries it **drawer by drawer**. Each drawer is small, a dropped drawer is re-carried alone, you can stop for tea (pause) and continue later, and a progress bar shows how many drawers are upstairs. The server keeps a checklist of drawers that arrived, so even after a reload you only carry the missing ones.
:::

::: text 📋 Requirements
### Functional
- Pick files via button or **drag & drop**; multiple files; image previews.
- Validation: allowed types (images, PDF, video), max 200 MB per file, max 10 files.
- Per-file progress %, speed, status (queued, uploading, paused, done, error), **pause / resume / cancel / retry**.
- **Resumable**: reload the page, pick the same file → the upload continues where it stopped.

### Non-functional
- Large files (hundreds of MB) without loading them fully into memory (`file.slice`).
- Bounded concurrency; automatic retries for flaky networks; the UI stays responsive.

### Assumptions
- React 18 + Vite; a small Express **upload server** in `server/index.js` stores chunks on disk and assembles them. Vite proxies `/api`. In production the same flow maps to **S3 multipart upload** with pre-signed URLs.
:::

::: ask
- *"Max file size and types? How many files at once?"*
- *"Upload straight to cloud storage (pre-signed URLs) or through our API?"*
- *"Do we need resume after closing the browser?"*
- *"Virus scanning, image resizing, or video processing after upload?"*
- *"Mobile networks: how flaky?"* (Chunk size, retries.)
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx"] --> UP["FileUploader (accept, maxSize, maxFiles)"]
  UP --> DZ["DropZone: drag events + hidden input + button"]
  UP --> HOOK["useUploadQueue (files state, concurrency)"]
  HOOK --> VAL["validateFile (type, size)"]
  HOOK --> UPL["ChunkedUploader per file"]
  UPL --> API["uploadApi: init, status, putChunk (XHR progress), complete"]
  API --> SRV["Express upload server: chunks on disk, assemble"]
  UP --> ROW["FileRow: preview, progress bar, pause, resume, cancel, retry"]
:::

::: diagram Sequence: resumable chunked upload
sequenceDiagram
  participant U as User
  participant C as ChunkedUploader
  participant S as Upload server
  U->>C: drop video.mp4 (5 MB)
  C->>S: POST /api/uploads (name, size, chunkSize, fingerprint)
  S-->>C: uploadId, received [] (or [0,1] if seen before)
  loop each missing chunk, up to 3 in parallel
    C->>S: PUT /api/uploads/id/chunks/i (1 MB)
    S-->>C: 200 (progress events update the bar)
  end
  Note over C,S: network drop on chunk 3 → retry with backoff
  C->>S: POST /api/uploads/id/complete
  S->>S: assemble chunks, check total size
  S-->>C: file url
  C-->>U: status done ✅
:::

::: image File upload: validation, chunking, parallel chunk PUTs with retry, resume from the server's received list
/images/frontend-lld/file-upload.svg
:::

::: text 🧱 Design
### Upload item state
`{ id, file, status: 'queued' | 'uploading' | 'paused' | 'done' | 'error', progress (0–1), speed (bytes/s), error, uploadId, url, previewUrl }`

### Modules
| Piece | Responsibility |
|---|---|
| `validateFile(file, rules)` | Pure: returns an error message or `''` |
| `uploadApi` | `init(meta)`, `putChunk(id, index, blob, onProgress, signal)` (XHR for upload progress), `complete(id)` |
| `ChunkedUploader` | Splits with `file.slice`, asks which chunks exist, uploads missing ones with a concurrency of 3, retries each chunk with backoff, reports progress, supports `pause()` (abort in-flight, keep state) |
| `useUploadQueue` | List of items; starts up to 2 files at a time; pause/resume/cancel/retry actions |
| `DropZone` / `FileRow` | Accessible UI |

### Server API
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/uploads` | `{ name, size, type, chunkSize, fingerprint }` → `{ uploadId, received: [] }` (same fingerprint → same uploadId = resume) |
| PUT | `/api/uploads/:id/chunks/:index` | Raw bytes of one chunk |
| POST | `/api/uploads/:id/complete` | Assemble → `{ url }` |
| GET | `/files/:name` | Download the assembled file |
:::

::: text 📁 Folder structure
`file-upload/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `server/index.js`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/upload/validateFile.js`, `src/upload/uploadApi.js`, `src/upload/ChunkedUploader.js`, `src/upload/useUploadQueue.js`
↳ `src/upload/FileUploader.jsx`, `src/upload/DropZone.jsx`, `src/upload/FileRow.jsx`, `src/upload/upload.css`
:::

::: code json file-upload/package.json
{
  "name": "file-upload",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "server": "node server/index.js",
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "express": "^4.19.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
:::

::: code javascript file-upload/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4100', '/files': 'http://localhost:4100' } },
});
:::

::: code html file-upload/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>File Upload LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript file-upload/server/index.js
// Chunked, resumable upload server (ESM). Chunks: uploads/tmp/<id>/<index>, files: uploads/files/<id>-<name>.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const app = express();
app.use(express.json());

const ROOT = path.resolve('uploads');
const TMP = path.join(ROOT, 'tmp');
const FILES = path.join(ROOT, 'files');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(FILES, { recursive: true });

const MAX_SIZE = 200 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|gif|webp)|application\/pdf|video\/mp4|text\/plain)$/;
const FAIL_RATE = Number(process.env.FAIL_RATE || 0.1);   // simulate a flaky network (10% of chunk PUTs fail)
const uploads = new Map();                                 // uploadId → { name, size, type, chunkSize, total, received:Set, url }
const byFingerprint = new Map();                           // fingerprint → uploadId (enables resume)

const safeName = (name) => path.basename(String(name)).replace(/[^\w.-]/g, '_').slice(0, 100);

app.post('/api/uploads', (req, res) => {
  const { name, size, type, chunkSize, fingerprint } = req.body || {};
  if (!name || !Number.isInteger(size) || size <= 0 || !Number.isInteger(chunkSize) || chunkSize < 64 * 1024) {
    return res.status(400).json({ error: { message: 'name, size and chunkSize (>= 64 KB) are required' } });
  }
  if (size > MAX_SIZE) return res.status(413).json({ error: { message: 'File too large (max 200 MB)' } });
  if (!ALLOWED.test(type || '')) return res.status(415).json({ error: { message: `Type ${type || 'unknown'} not allowed` } });

  const existingId = fingerprint && byFingerprint.get(fingerprint);
  if (existingId && uploads.has(existingId)) {             // RESUME: same file seen before
    const u = uploads.get(existingId);
    return res.json({ uploadId: existingId, received: [...u.received], url: u.url || null });
  }
  const uploadId = crypto.randomUUID();
  uploads.set(uploadId, { name: safeName(name), size, type, chunkSize, total: Math.ceil(size / chunkSize), received: new Set(), url: null });
  if (fingerprint) byFingerprint.set(fingerprint, uploadId);
  fs.mkdirSync(path.join(TMP, uploadId), { recursive: true });
  return res.status(201).json({ uploadId, received: [], url: null });
});

app.put('/api/uploads/:id/chunks/:index', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const u = uploads.get(req.params.id);
  const index = Number(req.params.index);
  if (!u) return res.status(404).json({ error: { message: 'Upload not found' } });
  if (!Number.isInteger(index) || index < 0 || index >= u.total) return res.status(400).json({ error: { message: 'Bad chunk index' } });
  if (Math.random() < FAIL_RATE) return res.status(503).json({ error: { message: 'Simulated network failure' } });
  const expected = index === u.total - 1 ? u.size - index * u.chunkSize : u.chunkSize;
  if (req.body.length !== expected) return res.status(400).json({ error: { message: `Chunk ${index} should be ${expected} bytes, got ${req.body.length}` } });
  fs.writeFileSync(path.join(TMP, req.params.id, String(index)), req.body);   // idempotent: re-sending overwrites
  u.received.add(index);
  return res.json({ index, received: u.received.size, total: u.total });
});

app.post('/api/uploads/:id/complete', (req, res) => {
  const u = uploads.get(req.params.id);
  if (!u) return res.status(404).json({ error: { message: 'Upload not found' } });
  if (u.url) return res.json({ url: u.url });               // already completed (idempotent)
  const missing = [];
  for (let i = 0; i < u.total; i++) if (!u.received.has(i)) missing.push(i);
  if (missing.length) return res.status(409).json({ error: { message: 'Chunks missing', details: { missing } } });

  const finalName = `${req.params.id.slice(0, 8)}-${u.name}`;
  const out = path.join(FILES, finalName);
  fs.writeFileSync(out, '');
  for (let i = 0; i < u.total; i++) fs.appendFileSync(out, fs.readFileSync(path.join(TMP, req.params.id, String(i))));
  if (fs.statSync(out).size !== u.size) return res.status(500).json({ error: { message: 'Assembled size mismatch' } });
  fs.rmSync(path.join(TMP, req.params.id), { recursive: true, force: true });
  u.url = `/files/${encodeURIComponent(finalName)}`;
  return res.json({ url: u.url, size: u.size });
});

app.use('/files', express.static(FILES));
app.listen(4100, () => console.log(`Upload server on http://localhost:4100 (FAIL_RATE=${FAIL_RATE})`));
:::

::: code javascript file-upload/src/upload/validateFile.js
// Pure checks before any network call (the server checks again).
export const DEFAULT_RULES = {
  maxSize: 200 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4', 'text/plain'],
};

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function validateFile(file, rules = DEFAULT_RULES) {
  if (file.size === 0) return 'File is empty';
  if (file.size > rules.maxSize) return `Too large (${formatBytes(file.size)}). Max ${formatBytes(rules.maxSize)}`;
  if (!rules.accept.includes(file.type)) return `Type "${file.type || 'unknown'}" is not allowed`;
  return '';
}
:::

::: code javascript file-upload/src/upload/uploadApi.js
// Network calls. XHR is used for chunk PUTs because fetch has no upload-progress events.
async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || res.statusText), { status: res.status, details: data?.error?.details });
  return data;
}

export const uploadApi = {
  init: (meta) => fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) }).then(json),

  complete: (uploadId) => fetch(`/api/uploads/${uploadId}/complete`, { method: 'POST' }).then(json),

  putChunk(uploadId, index, blob, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/uploads/${uploadId}/chunks/${index}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
        ? resolve(JSON.parse(xhr.responseText))
        : reject(Object.assign(new Error(`Chunk ${index} failed (${xhr.status})`), { status: xhr.status })));
      xhr.onerror = () => reject(Object.assign(new Error(`Network error on chunk ${index}`), { status: 0 }));
      xhr.onabort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(blob);
    });
  },
};
:::

::: code javascript file-upload/src/upload/ChunkedUploader.js
// Uploads ONE file in chunks: resume-aware, parallel chunks, per-chunk retry, pause = abort in-flight.
import { uploadApi } from './uploadApi.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ChunkedUploader {
  constructor(file, { chunkSize = 1024 * 1024, concurrency = 3, retries = 4, onProgress, api = uploadApi } = {}) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.concurrency = concurrency;
    this.retries = retries;
    this.onProgress = onProgress || (() => {});
    this.api = api;
    this.total = Math.max(1, Math.ceil(file.size / chunkSize));
    this.done = new Set();               // chunk indexes confirmed by the server
    this.inflight = new Map();           // index → bytes sent so far (for smooth progress)
    this.controller = null;
    this.uploadId = null;
  }

  /** Same file (name, size, lastModified) → same fingerprint → the server resumes it. */
  get fingerprint() {
    return `${this.file.name}:${this.file.size}:${this.file.lastModified}:${this.chunkSize}`;
  }

  chunkBytes(index) {
    return index === this.total - 1 ? this.file.size - index * this.chunkSize : this.chunkSize;
  }

  reportProgress() {
    let sent = 0;
    this.done.forEach((i) => { sent += this.chunkBytes(i); });
    this.inflight.forEach((bytes) => { sent += bytes; });
    this.onProgress(Math.min(1, sent / this.file.size));
  }

  async uploadChunk(index, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        const blob = this.file.slice(index * this.chunkSize, index * this.chunkSize + this.chunkBytes(index)); // no full read into memory
        await this.api.putChunk(this.uploadId, index, blob, (loaded) => { this.inflight.set(index, loaded); this.reportProgress(); }, signal);
        this.inflight.delete(index);
        this.done.add(index);
        this.reportProgress();
        return;
      } catch (err) {
        this.inflight.delete(index);
        if (err.name === 'AbortError' || signal.aborted) throw err;          // paused/cancelled
        const retryable = err.status === 0 || err.status >= 500 || err.status === 429;
        if (!retryable || attempt >= this.retries) throw err;
        await sleep(Math.min(300 * 2 ** attempt, 5000));                    // backoff
      }
    }
  }

  /** Starts or resumes. Resolves with { url } when the file is assembled. */
  async start() {
    this.controller = new AbortController();
    const { signal } = this.controller;
    if (!this.uploadId || this.done.size === 0) {
      const res = await this.api.init({ name: this.file.name, size: this.file.size, type: this.file.type, chunkSize: this.chunkSize, fingerprint: this.fingerprint });
      this.uploadId = res.uploadId;
      res.received.forEach((i) => this.done.add(i));                          // chunks the server already has
      if (res.url) return { url: res.url };                                   // finished in an earlier session
      this.reportProgress();
    }
    const missing = [];
    for (let i = 0; i < this.total; i++) if (!this.done.has(i)) missing.push(i);

    // simple worker pool: `concurrency` workers pull the next missing index
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const index = missing[next++];
        await this.uploadChunk(index, signal);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(this.concurrency, missing.length) }, worker));
    } catch (err) {
      this.controller.abort();                                                // stop sibling workers
      throw err;
    }
    return this.api.complete(this.uploadId);
  }

  pause() {
    this.controller?.abort();
  }
}
:::

::: code javascript file-upload/src/upload/useUploadQueue.js
// Holds all files, starts up to `maxParallelFiles`, exposes pause/resume/cancel/retry.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChunkedUploader } from './ChunkedUploader.js';
import { validateFile } from './validateFile.js';

let nextId = 1;

export function useUploadQueue({ rules, maxFiles = 10, maxParallelFiles = 2, chunkSize } = {}) {
  const [items, setItems] = useState([]);
  const uploaders = useRef(new Map());          // id → ChunkedUploader
  const speedRef = useRef(new Map());           // id → { time, progress }

  const update = useCallback((id, patch) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback((fileList) => {
    setItems((list) => {
      const room = Math.max(0, maxFiles - list.length);
      const incoming = [...fileList].slice(0, room).map((file) => {
        const error = validateFile(file, rules);
        return {
          id: nextId++,
          file,
          status: error ? 'error' : 'queued',
          error,
          progress: 0,
          speed: 0,
          url: null,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          rejected: Boolean(error),     // invalid files can't be retried
        };
      });
      const tooMany = fileList.length > room
        ? [{ id: nextId++, file: { name: `${fileList.length - room} file(s) skipped`, size: 0, type: '' }, status: 'error', error: `Max ${maxFiles} files`, progress: 0, rejected: true }]
        : [];
      return [...list, ...incoming, ...tooMany];
    });
  }, [maxFiles, rules]);

  const run = useCallback(async (item) => {
    let uploader = uploaders.current.get(item.id);
    if (!uploader) {
      uploader = new ChunkedUploader(item.file, {
        chunkSize,
        onProgress: (progress) => {
          const now = performance.now();
          const last = speedRef.current.get(item.id) || { time: now, progress };
          const dt = (now - last.time) / 1000;
          const speed = dt > 0.5 ? ((progress - last.progress) * item.file.size) / dt : undefined;
          if (speed !== undefined) speedRef.current.set(item.id, { time: now, progress });
          else if (!speedRef.current.has(item.id)) speedRef.current.set(item.id, last);
          update(item.id, speed !== undefined ? { progress, speed } : { progress });
        },
      });
      uploaders.current.set(item.id, uploader);
    }
    update(item.id, { status: 'uploading', error: '' });
    try {
      const result = await uploader.start();
      update(item.id, { status: 'done', progress: 1, url: result.url });
    } catch (err) {
      if (err.name === 'AbortError') return;          // pause/cancel already set the status
      update(item.id, { status: 'error', error: err.message });
    }
  }, [chunkSize, update]);

  // Scheduler: whenever the list changes, start queued items while below the limit
  useEffect(() => {
    const active = items.filter((it) => it.status === 'uploading').length;
    const queued = items.filter((it) => it.status === 'queued').slice(0, Math.max(0, maxParallelFiles - active));
    queued.forEach((it) => run(it));
  }, [items, maxParallelFiles, run]);

  const pause = (id) => { uploaders.current.get(id)?.pause(); update(id, { status: 'paused', speed: 0 }); };
  const resume = (id) => update(id, { status: 'queued' });
  const retry = (id) => update(id, { status: 'queued', error: '' });
  const remove = (id) => {
    uploaders.current.get(id)?.pause();
    uploaders.current.delete(id);
    setItems((list) => {
      const item = list.find((it) => it.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);   // free memory
      return list.filter((it) => it.id !== id);
    });
  };

  return { items, addFiles, pause, resume, retry, remove };
}
:::

::: code jsx file-upload/src/upload/DropZone.jsx
import { useRef, useState } from 'react';

// Drag & drop area that is ALSO a keyboard-accessible button for a real <input type="file">.
export function DropZone({ onFiles, accept, multiple = true }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`dropzone${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}     // required to allow dropping
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <p>Drag files here or</p>
      <button type="button" onClick={() => inputRef.current.click()}>Choose files</button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={accept.join(',')}
        aria-label="Choose files to upload"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}   // allow picking the same file again
      />
      <p className="hint">Images, PDF, MP4 or text, up to 200 MB each</p>
    </div>
  );
}
:::

::: code jsx file-upload/src/upload/FileRow.jsx
import { formatBytes } from './validateFile.js';

const LABEL = { queued: 'Queued', uploading: 'Uploading', paused: 'Paused', done: 'Done ✅', error: 'Error' };

export function FileRow({ item, onPause, onResume, onRetry, onRemove }) {
  const percent = Math.round(item.progress * 100);
  return (
    <li className={`file-row status-${item.status}`}>
      {item.previewUrl ? <img src={item.previewUrl} alt="" className="thumb" /> : <span className="thumb icon" aria-hidden="true">📄</span>}
      <div className="file-main">
        <div className="file-name">
          {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.file.name}</a> : item.file.name}
          <span className="muted"> · {formatBytes(item.file.size)}</span>
        </div>
        <div
          className="bar"
          role="progressbar"
          aria-label={`Upload progress for ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="file-meta">
          {LABEL[item.status]} {item.status !== 'error' && `${percent}%`}
          {item.status === 'uploading' && item.speed > 0 && ` · ${formatBytes(item.speed)}/s`}
          {item.error && <span className="error"> · {item.error}</span>}
        </div>
      </div>
      <div className="file-actions">
        {item.status === 'uploading' && <button type="button" onClick={() => onPause(item.id)}>Pause</button>}
        {item.status === 'paused' && <button type="button" onClick={() => onResume(item.id)}>Resume</button>}
        {item.status === 'error' && !item.rejected && <button type="button" onClick={() => onRetry(item.id)}>Retry</button>}
        <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => onRemove(item.id)}>✕</button>
      </div>
    </li>
  );
}
:::

::: code jsx file-upload/src/upload/FileUploader.jsx
import { DropZone } from './DropZone.jsx';
import { FileRow } from './FileRow.jsx';
import { useUploadQueue } from './useUploadQueue.js';
import { DEFAULT_RULES } from './validateFile.js';
import './upload.css';

export function FileUploader({ rules = DEFAULT_RULES, maxFiles = 10, chunkSize = 1024 * 1024 }) {
  const queue = useUploadQueue({ rules, maxFiles, chunkSize });
  const done = queue.items.filter((i) => i.status === 'done').length;

  return (
    <section className="uploader" aria-label="File uploader">
      <DropZone onFiles={queue.addFiles} accept={rules.accept} />
      {queue.items.length > 0 && <p className="muted" aria-live="polite">{done} of {queue.items.length} uploaded</p>}
      <ul className="file-list">
        {queue.items.map((item) => (
          <FileRow key={item.id} item={item} onPause={queue.pause} onResume={queue.resume} onRetry={queue.retry} onRemove={queue.remove} />
        ))}
      </ul>
    </section>
  );
}
:::

::: code jsx file-upload/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code jsx file-upload/src/App.jsx
import { FileUploader } from './upload/FileUploader.jsx';

export default function App() {
  return (
    <main className="page">
      <h1>File upload</h1>
      <p className="muted">Chunks of 256 KB here so progress is visible with small files. The server fails 10% of chunk requests on purpose.</p>
      <FileUploader chunkSize={256 * 1024} />
    </main>
  );
}
:::

::: code css file-upload/src/upload/upload.css
.uploader { display: flex; flex-direction: column; gap: 12px; }
.dropzone { border: 2px dashed #94a3b8; border-radius: 12px; padding: 28px; text-align: center; background: #fff; transition: background 0.15s; }
.dropzone.is-dragging { background: #eef2ff; border-color: #6366f1; }
.dropzone button { padding: 8px 16px; border-radius: 8px; border: 1px solid #4f46e5; background: #4f46e5; color: #fff; cursor: pointer; }
.dropzone .hint { font-size: 13px; color: #64748b; }
.file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.file-row { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid #dbe1ea; border-radius: 10px; padding: 10px 12px; }
.thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.thumb.icon { display: grid; place-items: center; font-size: 24px; background: #f1f5f9; }
.file-main { flex: 1; min-width: 0; }
.file-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 14px; }
.bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin: 6px 0 4px; }
.bar span { display: block; height: 100%; background: #6366f1; transition: width 0.2s; }
.status-done .bar span { background: #10b981; }
.status-error .bar span { background: #ef4444; }
.status-paused .bar span { background: #f59e0b; }
.file-meta { font-size: 12px; color: #64748b; }
.file-actions { display: flex; gap: 6px; }
.file-actions button { padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
.error { color: #b91c1c; }
.muted { color: #64748b; font-size: 14px; }
@media (prefers-color-scheme: dark) {
  .dropzone, .file-row, .file-actions button { background: #111827; border-color: #334155; color: #e2e8f0; }
  .dropzone.is-dragging { background: #1e1b4b; }
  .bar { background: #1f2937; }
}
:::

::: code css file-upload/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.page { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } }
:::

::: code javascript Browser simulation: chunking, retries and resume (runnable)
// ChunkedUploader's core loop with a fake server that drops some chunks.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeServer(failOnce = []) {
  const uploads = new Map(), failed = new Set(), log = [];
  return {
    log,
    async init({ fingerprint, size, chunkSize }) { if (!uploads.has(fingerprint)) uploads.set(fingerprint, { total: Math.ceil(size / chunkSize), got: new Set() }); return { uploadId: fingerprint, received: [...uploads.get(fingerprint).got] }; },
    async putChunk(id, i) { await sleep(2); log.push(i); if (failOnce.includes(i) && !failed.has(i)) { failed.add(i); throw Object.assign(new Error('503'), { status: 503 }); } uploads.get(id).got.add(i); },
    async complete(id) { const u = uploads.get(id); return u.got.size === u.total ? { url: '/files/' + id } : Promise.reject(new Error('missing')); },
  };
}
async function upload(file, api, { chunkSize, concurrency = 3, stopAfter = Infinity }) {
  const total = Math.ceil(file.size / chunkSize);
  const { uploadId, received } = await api.init({ fingerprint: file.name + file.size, size: file.size, chunkSize });
  const missing = [...Array(total).keys()].filter((i) => !received.includes(i));
  let next = 0, sent = 0;
  const worker = async () => {
    while (next < missing.length && sent < stopAfter) {
      const i = missing[next++];
      for (let attempt = 0; ; attempt++) { try { await api.putChunk(uploadId, i); sent++; break; } catch (e) { if (attempt >= 3) throw e; await sleep(1); } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  return sent < missing.length ? { paused: true, missing: missing.length - sent } : api.complete(uploadId);
}

// ---------- tests ----------
(async () => {
  const file = { name: 'video.mp4', size: 10 * 1024 * 1024 + 5 };      // 10 MB + 5 bytes
  const chunkSize = 1024 * 1024;
  console.log('chunks for 10 MB + 5 B at 1 MB →', Math.ceil(file.size / chunkSize), Math.ceil(file.size / chunkSize) === 11 ? '✅' : '❌ FAIL');
  console.log('last chunk size →', file.size - 10 * chunkSize, 'bytes', file.size - 10 * chunkSize === 5 ? '✅' : '❌ FAIL');

  const s1 = makeServer([2, 7]);
  const r1 = await upload(file, s1, { chunkSize });
  console.log('chunks 2 and 7 failed once, retried → done', r1.url, s1.log.length === 13 && r1.url ? '✅' : '❌ FAIL');

  const s2 = makeServer();
  const first = await upload(file, s2, { chunkSize, concurrency: 1, stopAfter: 4 });   // "connection lost" after 4 chunks
  console.log('session 1 stopped with', first.missing, 'chunks missing', first.missing === 7 ? '✅' : '❌ FAIL');
  s2.log.length = 0;
  const second = await upload(file, s2, { chunkSize });                                 // same file again → resume
  console.log('session 2 resumed: sent only', s2.log.length, 'chunks', s2.log.length === 7 && second.url ? '✅' : '❌ FAIL');
})();
:::

::: text 🧪 How to run & test
1. Create the files and `cd file-upload && npm install`. Then, in two terminals:
`npm run server` → "Upload server on http://localhost:4100 (FAIL_RATE=0.1)"
`npm run dev` → open `http://localhost:5173`
2. Drop a few images and a PDF → previews appear, each file shows progress, speed and status; at most 2 files upload at a time.
3. DevTools → Network: `POST /api/uploads`, then many `PUT …/chunks/N` (3 in parallel); some return **503** and are retried automatically; finally `POST …/complete` → the file name becomes a download link.
4. Drop an `.exe` or a 300 MB file → rejected immediately with a clear message (no request).
5. Start a big video (e.g. 50 MB), click **Pause** → in-flight chunk requests are cancelled; **Resume** → continues from the same %.
6. **Resume after reload**: start a big file, reload the page mid-way, pick the same file again → `POST /api/uploads` returns `received: [0,1,2,…]` and only the missing chunks are sent.
7. Keyboard: Tab to **Choose files** and press Enter; progress bars are announced (`role="progressbar"`).
8. Server check with curl (start it with `FAIL_RATE=0 npm run server` so no chunk is rejected): a ~400 KB text file in 2 chunks of 256 KB.
`head -c 307200 /dev/urandom | base64 > big.txt; SIZE=$(wc -c < big.txt | tr -d ' ')`
`ID=$(curl -s -X POST localhost:4100/api/uploads -H 'Content-Type: application/json' -d "{\"name\":\"big.txt\",\"size\":$SIZE,\"type\":\"text/plain\",\"chunkSize\":262144}" | node -pe "JSON.parse(require('fs').readFileSync(0)).uploadId")`
`dd if=big.txt bs=262144 skip=0 count=1 2>/dev/null | curl -s -X PUT --data-binary @- -H 'Content-Type: application/octet-stream' localhost:4100/api/uploads/$ID/chunks/0` → `{"index":0,"received":1,"total":2}`
`curl -s -X POST localhost:4100/api/uploads/$ID/complete` → `{"error":{"message":"Chunks missing","details":{"missing":[1]}}}`
`dd if=big.txt bs=262144 skip=1 count=1 2>/dev/null | curl -s -X PUT --data-binary @- -H 'Content-Type: application/octet-stream' localhost:4100/api/uploads/$ID/chunks/1` → `{"index":1,"received":2,"total":2}`
`curl -s -X POST localhost:4100/api/uploads/$ID/complete` → `{"url":"/files/…-big.txt","size":409601}`
`curl -s localhost:4100$(curl -s -X POST localhost:4100/api/uploads/$ID/complete | node -pe "JSON.parse(require('fs').readFileSync(0)).url") | cmp - big.txt && echo identical` → `identical`
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Path | Through our API server (this) | **Direct to S3/GCS with pre-signed URLs** (multipart) | Direct-to-storage in production: no app-server bandwidth, scales infinitely |
| Size | Single request (`FormData`) | **Chunked** | Single request below ~10 MB; chunked for big files/mobile |
| Progress | `fetch` (no upload progress) | **XHR `upload.onprogress`** | XHR (or fetch with streams where supported) |
| Resume key | Server-issued id stored in `localStorage` | **Fingerprint** (name+size+mtime) | Fingerprint + server id; hash content (slow) only if needed |
| Protocol | Custom (this) | **tus** (open resumable protocol) / Uppy | tus/Uppy when you want a standard |
| Chunk size | Small (256 KB: fine progress, more requests) | Large (5–10 MB: fewer requests) | 5 MB+ in production (S3 multipart minimum is 5 MB) |
:::

::: text 📈 Scaling & edge cases
- **Backend scale**: pre-signed multipart URLs, storage lifecycle rule to delete abandoned parts, a "file uploaded" event → virus scan / thumbnails / transcoding in a queue.
- **Integrity**: per-chunk checksum (`Content-MD5`/CRC32C), final size check (done here), content-type sniffing on the server (don't trust the extension).
- **Accessibility**: real file input behind the drop zone, progress semantics, status text not only colour, focus stays stable when rows are added.
- **Edge cases**: duplicate files, 0-byte files, the same file in two tabs, network switch Wi-Fi→4G, server restart (persist upload state in a DB/Redis), browser tab closed (use `beforeunload` warning), very slow uploads (show remaining time).
:::

::: warning ⚠️ Common mistakes
- Reading the whole file into memory (`FileReader.readAsArrayBuffer`) instead of `file.slice`.
- Trusting client-side type/size checks only.
- No retry → one dropped packet fails a 2 GB upload.
- Forgetting `URL.revokeObjectURL` for previews (memory leak).
- Drop zone without a keyboard-accessible input.
:::

::: understand
- Chunked upload turns one big fragile operation into many small **idempotent** ones (re-sending chunk 7 is harmless), which makes retries and resume simple.
- The server's "received chunks" list is the source of truth for resuming, the same idea as S3 multipart's `ListParts`.
:::

::: important ⭐ How to present this design in 5 minutes
> "First I validate type, size and count on the client for fast feedback; the server validates again. Each file goes through a ChunkedUploader: it calls init with name, size, type and a fingerprint, and the server returns an uploadId and the list of chunks it already has, which gives resume for free. The uploader slices the file with file.slice so nothing is loaded fully into memory, uploads missing chunks with a small worker pool of three using XHR for progress events, retries retryable failures with backoff, and finally calls complete, where the server assembles and verifies the size. Pause aborts in-flight requests, resume restarts from the missing chunks. A queue hook limits parallel files and exposes pause, resume, retry and remove. The drop zone wraps a real file input for keyboard users and progress bars use role progressbar. In production I'd upload directly to S3 with pre-signed multipart URLs."
:::

::: links
MDN: Blob.slice | https://developer.mozilla.org/en-US/docs/Web/API/Blob/slice
MDN: XMLHttpRequest upload progress | https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload
AWS: S3 multipart upload | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
tus: resumable upload protocol | https://tus.io/
:::

=== Design a real-time Chat UI (WebSocket)
@p 3
@tags lld, react, websocket, realtime
@quick
- **One WebSocket connection** managed outside React (`ChatSocket` class): connect, heartbeat (ping/pong), **reconnect with exponential backoff + jitter**, outbox for messages sent while offline.
- **Optimistic send**: show the message immediately with a `clientId` and status `sending` → server **ack** replaces it with the real id (`sent`); no ack in time → `failed` + Retry. Dedupe by `clientId`.
- **History**: load the latest 30 via REST; **load older on scroll-up** with a cursor (`before=<id>`), keeping the scroll position.
- **Auto-scroll** only if the user is near the bottom; otherwise show "↓ N new messages".
- Typing indicators (throttled send, auto-expire), presence, rooms; virtualize very long histories; `aria-live` for new messages.

::: text 🧒 In simple words
A chat app is a **walkie-talkie with a notebook**. The WebSocket is the walkie-talkie: a line that stays open so messages arrive instantly in both directions. The notebook is the history you scroll back through. The tricky parts are: the walkie-talkie drops when you go through a tunnel (reconnect and resend), you want your own message to appear *immediately* even before the server confirms it (optimistic UI with a "sending…" tick), and the screen shouldn't jump to the bottom while you're reading old messages.
:::

::: text 📋 Requirements
### Functional
- Rooms (`#general`, `#random`); send and receive messages in real time; see who is online and who is typing.
- Message states: sending → sent ✓ → failed (retry). Messages typed offline are queued and sent after reconnect.
- History: last 30 messages on join; older ones loaded on scroll-up.
- Unread counter per room; "new messages" pill when scrolled up.

### Non-functional
- Survives network drops and server restarts (auto-reconnect, no duplicates, no lost messages).
- Smooth with thousands of messages; accessible to keyboard and screen-reader users.

### Assumptions
- React 18 + Vite. A Node server (`server/index.js`) with Express (history) + `ws` (real time) on port 4200; Vite proxies `/api` and `/ws`. Messages are kept in memory.
:::

::: ask
- *"1:1, group, or both? Max group size?"*
- *"Must messages survive reconnects (at-least-once) and be ordered?"*
- *"Read receipts, reactions, attachments, editing/deleting?"*
- *"Expected scale: concurrent users and messages per second?"* (Server fan-out, Redis pub/sub.)
- *"Mobile/background tabs?"* (Push notifications.)
:::

::: diagram Component tree
flowchart TD
  APP["App.jsx: name prompt"] --> CHAT["ChatApp (rooms, active room)"]
  CHAT --> SOCK["ChatSocket (one WebSocket, backoff, heartbeat, outbox)"]
  CHAT --> STORE["useChatStore (reducer: messagesByRoom, typing, online, unread)"]
  CHAT --> SIDE["RoomList (unread badges) + OnlineList"]
  CHAT --> ML["MessageList: load older, stick to bottom, new pill"]
  ML --> MSG["MessageItem (status sending, sent, failed)"]
  CHAT --> TI["TypingIndicator"]
  CHAT --> COMP["Composer (Enter to send, throttled typing events)"]
  CHAT --> BANNER["ConnectionBanner (connecting, offline, reconnecting in Ns)"]
:::

::: diagram Sequence: optimistic send while the connection drops
sequenceDiagram
  participant U as User
  participant C as Composer
  participant S as ChatSocket
  participant W as WS Server
  U->>C: Enter "hello"
  C->>C: add message (clientId c1, status sending)
  C->>S: send message c1
  S--xW: connection lost (message in outbox)
  S->>S: reconnect after 1s, 2s (backoff + jitter)
  S->>W: open, join room, flush outbox c1
  W-->>S: ack (clientId c1, id 57, ts)
  S-->>C: status sent ✓ (id 57)
  W-->>S: broadcast message 57 to the room
  S->>S: dedupe (already have c1 / 57)
:::

::: image Chat: one socket with backoff and outbox, reducer keyed by room, optimistic messages acked by clientId
/images/frontend-lld/chat.svg
:::

::: text 🧱 Design
### Protocol (JSON over WebSocket)
| Direction | Type | Payload |
|---|---|---|
| client → server | `hello` | `{ name }` |
| client → server | `join` | `{ room }` |
| client → server | `message` | `{ room, clientId, text }` |
| client → server | `typing` | `{ room }` |
| client → server | `ping` | `{}` |
| server → client | `ack` | `{ clientId, id, ts }` |
| server → client | `message` | `{ id, clientId, room, user, text, ts }` |
| server → client | `typing` / `presence` / `pong` | `{ room, user }` / `{ online: [names] }` / `{}` |
| REST | `GET /api/rooms/:room/messages?before=<id>&limit=30` | `{ messages, hasMore }` |

### Client state (`useChatStore` reducer)
`{ status: 'connecting' | 'open' | 'reconnecting' | 'offline', retryIn, room, messagesByRoom: { [room]: Message[] }, hasMore: { [room]: bool }, typing: { [room]: { [user]: expiresAt } }, online: string[], unread: { [room]: n } }`
`Message { id?, clientId, room, user, text, ts, status: 'sending' | 'sent' | 'failed' }`
:::

::: text 📁 Folder structure
`chat-app/`
↳ `package.json`, `vite.config.js`, `index.html`
↳ `server/index.js`
↳ `src/main.jsx`, `src/App.jsx`, `src/styles.css`
↳ `src/chat/ChatSocket.js`, `src/chat/chatReducer.js`, `src/chat/useChat.js`, `src/chat/api.js`
↳ `src/chat/ChatApp.jsx`, `src/chat/MessageList.jsx`, `src/chat/Composer.jsx`, `src/chat/chat.css`
:::

::: code json chat-app/package.json
{
  "name": "chat-app",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "server": "node server/index.js",
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "express": "^4.19.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
:::

::: code javascript chat-app/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4200',
      '/ws': { target: 'ws://localhost:4200', ws: true },
    },
  },
});
:::

::: code html chat-app/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat LLD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
:::

::: code javascript chat-app/server/index.js
// Express (history) + ws (real time) on one port. In-memory storage.
import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';

const ROOMS = ['general', 'random'];
const messages = { general: [], random: [] };
let nextId = 1;
const seenClientIds = new Map();                 // clientId → message (dedupe resends)

// seed some history so "load older" has something to load
for (let i = 1; i <= 75; i++) {
  messages.general.push({ id: nextId++, clientId: `seed-${i}`, room: 'general', user: i % 2 ? 'Asha' : 'Ben', text: `History message ${i}`, ts: Date.now() - (80 - i) * 60000 });
}
// new ids continue from the clock so they stay unique (and increasing) even after a server restart
nextId = Math.max(nextId, Date.now());

const app = express();
app.get('/api/rooms', (req, res) => res.json({ rooms: ROOMS }));
app.get('/api/rooms/:room/messages', (req, res) => {
  const list = messages[req.params.room];
  if (!list) return res.status(404).json({ error: { message: 'Room not found' } });
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const before = req.query.before ? Number(req.query.before) : Infinity;
  const older = list.filter((m) => m.id < before);           // cursor pagination by id
  const page = older.slice(-limit);
  return res.json({ messages: page, hasMore: older.length > page.length });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();                       // ws → { name, room, alive }

const send = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg) => { for (const [ws, c] of clients) if (!room || c.room === room) send(ws, msg); };
const presence = () => broadcast(null, { type: 'presence', online: [...new Set([...clients.values()].map((c) => c.name).filter(Boolean))] });

wss.on('connection', (ws) => {
  clients.set(ws, { name: null, room: null, alive: true });
  ws.on('pong', () => { clients.get(ws).alive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const client = clients.get(ws);
    switch (msg.type) {
      case 'hello':
        client.name = String(msg.name || 'anon').slice(0, 20);
        presence();
        break;
      case 'join':
        if (ROOMS.includes(msg.room)) client.room = msg.room;
        break;
      case 'ping':
        send(ws, { type: 'pong' });
        break;
      case 'typing':
        for (const [other, c] of clients) if (other !== ws && c.room === msg.room) send(other, { type: 'typing', room: msg.room, user: client.name });
        break;
      case 'message': {
        const text = String(msg.text || '').trim().slice(0, 2000);
        if (!text || !ROOMS.includes(msg.room) || !client.name) return;
        let saved = seenClientIds.get(msg.clientId);
        if (!saved) {                                    // first time we see this clientId
          saved = { id: nextId++, clientId: msg.clientId, room: msg.room, user: client.name, text, ts: Date.now() };
          messages[msg.room].push(saved);
          seenClientIds.set(msg.clientId, saved);
          broadcast(null, { type: 'message', ...saved });   // demo: everyone is in every room → unread badges work
        }
        send(ws, { type: 'ack', clientId: msg.clientId, id: saved.id, ts: saved.ts }); // ack even for duplicates
        break;
      }
      default:
        break;
    }
  });
  ws.on('close', () => { clients.delete(ws); presence(); });
});

// heartbeat: drop dead connections every 30 s
setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) { ws.terminate(); continue; }
    c.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(4200, () => console.log('Chat server on http://localhost:4200 (ws path /ws)'));
:::

::: code javascript chat-app/src/chat/ChatSocket.js
// One WebSocket for the whole app, independent of React: reconnect, heartbeat, outbox, events.
export class ChatSocket {
  constructor(url, { name, onEvent, onStatus }) {
    this.url = url;
    this.name = name;
    this.onEvent = onEvent;           // (message) => void
    this.onStatus = onStatus;         // (status, retryInMs) => void
    this.outbox = [];                 // messages to (re)send after reconnect
    this.room = null;
    this.attempt = 0;
    this.closedByUser = false;
    this.connect();
  }

  connect() {
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting', 0);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.onStatus('open', 0);
      this.raw({ type: 'hello', name: this.name });
      if (this.room) this.raw({ type: 'join', room: this.room });
      this.outbox.forEach((m) => this.raw(m));           // resend everything not yet acked
      this.heartbeat = setInterval(() => this.raw({ type: 'ping' }), 20000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ack') this.outbox = this.outbox.filter((m) => m.clientId !== msg.clientId);
      this.onEvent(msg);
    };
    ws.onclose = () => {
      clearInterval(this.heartbeat);
      if (this.closedByUser) return;
      const delay = Math.min(30000, 1000 * 2 ** this.attempt) * (0.5 + Math.random() / 2); // backoff + jitter
      this.attempt += 1;
      this.onStatus(navigator.onLine === false ? 'offline' : 'reconnecting', delay);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();                       // onclose handles the retry
  }

  raw(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  join(room) {
    this.room = room;
    this.raw({ type: 'join', room });
  }

  sendMessage(msg) {
    const frame = { type: 'message', ...msg };
    this.outbox.push(frame);                             // kept until the server acks it
    this.raw(frame);
  }

  typing(room) {
    this.raw({ type: 'typing', room });
  }

  reconnectNow() {
    clearTimeout(this.retryTimer);
    this.attempt = 0;
    if (this.ws.readyState === WebSocket.CLOSED) this.connect();
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    this.ws?.close();
  }
}
:::

::: code javascript chat-app/src/chat/chatReducer.js
// Pure state transitions for the chat UI (easy to test).
export const initialChatState = {
  status: 'connecting', retryIn: 0, room: 'general',
  messagesByRoom: {}, hasMore: {}, typing: {}, online: [], unread: {},
};

/** Insert or update by clientId (optimistic) or id (server), keep sorted by ts. */
function upsert(list = [], msg) {
  const index = list.findIndex((m) => (msg.clientId && m.clientId === msg.clientId) || (msg.id && m.id === msg.id));
  const next = index === -1 ? [...list, msg] : list.map((m, i) => (i === index ? { ...m, ...msg } : m));
  return next.sort((a, b) => a.ts - b.ts);
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status, retryIn: action.retryIn };
    case 'switchRoom':
      return { ...state, room: action.room, unread: { ...state.unread, [action.room]: 0 } };
    case 'history': {                                    // older page, first page or catch-up after reconnect
      let list = state.messagesByRoom[action.room] || [];
      for (const m of action.messages) list = upsert(list, { ...m, status: 'sent' }); // merges by id OR clientId (no duplicates)
      return {
        ...state,
        messagesByRoom: { ...state.messagesByRoom, [action.room]: list },
        hasMore: { ...state.hasMore, [action.room]: action.hasMore },
      };
    }
    case 'optimistic':
      return { ...state, messagesByRoom: { ...state.messagesByRoom, [action.message.room]: upsert(state.messagesByRoom[action.message.room], { ...action.message, status: 'sending' }) } };
    case 'ack': {
      const messagesByRoom = {};
      for (const [room, list] of Object.entries(state.messagesByRoom)) {
        messagesByRoom[room] = list.map((m) => (m.clientId === action.clientId ? { ...m, id: action.id, ts: action.ts, status: 'sent' } : m));
      }
      return { ...state, messagesByRoom };
    }
    case 'failed': {
      const list = state.messagesByRoom[action.room] || [];
      return { ...state, messagesByRoom: { ...state.messagesByRoom, [action.room]: list.map((m) => (m.clientId === action.clientId && m.status === 'sending' ? { ...m, status: 'failed' } : m)) } };
    }
    case 'incoming': {                                   // broadcast from the server
      const msg = { ...action.message, status: 'sent' };
      const isOtherRoom = msg.room !== state.room;
      const alreadyHave = (state.messagesByRoom[msg.room] || []).some((m) => m.id === msg.id || m.clientId === msg.clientId);
      return {
        ...state,
        messagesByRoom: { ...state.messagesByRoom, [msg.room]: upsert(state.messagesByRoom[msg.room], msg) },
        unread: isOtherRoom && !alreadyHave ? { ...state.unread, [msg.room]: (state.unread[msg.room] || 0) + 1 } : state.unread,
        typing: { ...state.typing, [msg.room]: { ...(state.typing[msg.room] || {}), [msg.user]: 0 } }, // they stopped typing
      };
    }
    case 'typing':
      return { ...state, typing: { ...state.typing, [action.room]: { ...(state.typing[action.room] || {}), [action.user]: action.expiresAt } } };
    case 'presence':
      return { ...state, online: action.online };
    default:
      return state;
  }
}
:::

::: code javascript chat-app/src/chat/api.js
export async function fetchHistory(room, before) {
  const qs = new URLSearchParams({ limit: '30', ...(before ? { before: String(before) } : {}) });
  const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/messages?${qs}`);
  if (!res.ok) throw new Error(`History failed (${res.status})`);
  return res.json();
}
:::

::: code javascript chat-app/src/chat/useChat.js
// Connects ChatSocket to the reducer and exposes actions to components.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ChatSocket } from './ChatSocket.js';
import { chatReducer, initialChatState } from './chatReducer.js';
import { fetchHistory } from './api.js';

const ACK_TIMEOUT_MS = 8000;

export function useChat(name) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const socketRef = useRef(null);
  const ackTimers = useRef(new Map());

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new ChatSocket(`${proto}://${window.location.host}/ws`, {
      name,
      onStatus: (status, retryIn) => dispatch({ type: 'status', status, retryIn }),
      onEvent: (msg) => {
        if (msg.type === 'ack') {
          clearTimeout(ackTimers.current.get(msg.clientId));
          dispatch({ type: 'ack', clientId: msg.clientId, id: msg.id, ts: msg.ts });
        } else if (msg.type === 'message') {
          dispatch({ type: 'incoming', message: msg });
        } else if (msg.type === 'typing') {
          dispatch({ type: 'typing', room: msg.room, user: msg.user, expiresAt: Date.now() + 3000 });
        } else if (msg.type === 'presence') {
          dispatch({ type: 'presence', online: msg.online });
        }
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [name]);

  // join + load the first page whenever the room changes
  useEffect(() => {
    socketRef.current?.join(state.room);
    if (!state.messagesByRoom[state.room]) {
      fetchHistory(state.room).then((page) => dispatch({ type: 'history', room: state.room, ...page })).catch(() => {});
    }
  }, [state.room]); // eslint-disable-line react-hooks/exhaustive-deps

  // after a reconnect, catch up with messages we missed while offline
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (prevStatus.current === 'reconnecting' && state.status === 'open') {
      fetchHistory(state.room).then((page) => dispatch({ type: 'history', room: state.room, ...page })).catch(() => {});
    }
    prevStatus.current = state.status;
  }, [state.status, state.room]);

  const send = useCallback((text, existingClientId) => {
    const clientId = existingClientId || crypto.randomUUID();
    const message = { clientId, room: state.room, user: name, text, ts: Date.now() };
    dispatch({ type: 'optimistic', message });
    socketRef.current.sendMessage({ room: state.room, clientId, text });
    clearTimeout(ackTimers.current.get(clientId));
    ackTimers.current.set(clientId, setTimeout(() => dispatch({ type: 'failed', room: message.room, clientId }), ACK_TIMEOUT_MS));
  }, [state.room, name]);

  const loadOlder = useCallback(async () => {
    const list = state.messagesByRoom[state.room] || [];
    const oldest = list.find((m) => m.id);
    if (!oldest || !state.hasMore[state.room]) return;
    const page = await fetchHistory(state.room, oldest.id);
    dispatch({ type: 'history', room: state.room, ...page });
  }, [state.messagesByRoom, state.hasMore, state.room]);

  const lastTyping = useRef(0);
  const notifyTyping = useCallback(() => {
    if (Date.now() - lastTyping.current < 2000) return;    // throttle: at most every 2 s
    lastTyping.current = Date.now();
    socketRef.current?.typing(state.room);
  }, [state.room]);

  return {
    state,
    send,
    loadOlder,
    notifyTyping,
    switchRoom: (room) => dispatch({ type: 'switchRoom', room }),
    reconnectNow: () => socketRef.current?.reconnectNow(),
  };
}
:::

::: code jsx chat-app/src/chat/MessageList.jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_PX = 80;

export function MessageList({ messages, me, hasMore, onLoadOlder, onRetry }) {
  const ref = useRef(null);
  const [stick, setStick] = useState(true);              // follow new messages?
  const [newCount, setNewCount] = useState(0);
  const prev = useRef({ length: 0, firstId: null, scrollHeight: 0, room: null });
  const loading = useRef(false);

  // keep position when older messages are prepended; stick to bottom for new ones
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const firstKey = messages[0]?.id ?? messages[0]?.clientId;
    const room = messages[0]?.room;
    const prepended = prev.current.firstId !== null && firstKey !== prev.current.firstId && messages.length > prev.current.length;
    if (room !== prev.current.room) {
      el.scrollTop = el.scrollHeight;                                    // switched room → start at the bottom
    } else if (prepended) {
      el.scrollTop += el.scrollHeight - prev.current.scrollHeight;     // no jump
    } else if (messages.length > prev.current.length) {
      const last = messages[messages.length - 1];
      if (stick || last?.user === me) el.scrollTop = el.scrollHeight;   // my own message → always scroll
      else setNewCount((n) => n + messages.length - prev.current.length);
    }
    prev.current = { length: messages.length, firstId: firstKey, scrollHeight: el.scrollHeight, room };
  }, [messages, stick, me]);

  const onScroll = async () => {
    const el = ref.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setStick(nearBottom);
    if (nearBottom) setNewCount(0);
    if (el.scrollTop < 40 && hasMore && !loading.current) {           // top reached → older page
      loading.current = true;
      prev.current.scrollHeight = el.scrollHeight;
      try { await onLoadOlder(); } finally { loading.current = false; }
    }
  };

  useEffect(() => { setNewCount(0); setStick(true); }, [messages[0]?.room]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="message-wrap">
      <ol className="messages" ref={ref} onScroll={onScroll} aria-label="Messages" aria-live="polite" aria-relevant="additions">
        {hasMore && <li className="system">Scroll up for older messages…</li>}
        {messages.map((m) => (
          <li key={m.clientId || m.id} className={`message${m.user === me ? ' mine' : ''} ${m.status}`}>
            <div className="meta">
              <strong>{m.user}</strong> <time dateTime={new Date(m.ts).toISOString()}>{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <div className="text">{m.text}</div>
            {m.user === me && (
              <div className="status">
                {m.status === 'sending' && 'Sending…'}
                {m.status === 'sent' && '✓ Sent'}
                {m.status === 'failed' && <>❌ Not sent <button type="button" onClick={() => onRetry(m)}>Retry</button></>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {newCount > 0 && (
        <button type="button" className="new-pill" onClick={() => { ref.current.scrollTop = ref.current.scrollHeight; setNewCount(0); }}>
          ↓ {newCount} new message{newCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
:::

::: code jsx chat-app/src/chat/Composer.jsx
import { useState } from 'react';

export function Composer({ onSend, onTyping, disabledReason }) {
  const [text, setText] = useState('');
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label htmlFor="composer-input" className="sr-only">Message</label>
      <textarea
        id="composer-input"
        rows={1}
        value={text}
        placeholder={disabledReason || 'Type a message (Enter to send, Shift+Enter for a new line)'}
        onChange={(e) => { setText(e.target.value); onTyping(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
        maxLength={2000}
      />
      <button type="submit" disabled={!text.trim()}>Send</button>
    </form>
  );
}
:::

::: code jsx chat-app/src/chat/ChatApp.jsx
import { useEffect, useState } from 'react';
import { useChat } from './useChat.js';
import { MessageList } from './MessageList.jsx';
import { Composer } from './Composer.jsx';
import './chat.css';

const ROOMS = ['general', 'random'];

export function ChatApp({ name }) {
  const { state, send, loadOlder, notifyTyping, switchRoom, reconnectNow } = useChat(name);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); // expire typing

  const messages = state.messagesByRoom[state.room] || [];
  const typers = Object.entries(state.typing[state.room] || {}).filter(([user, exp]) => user !== name && exp > now).map(([user]) => user);

  return (
    <div className="chat">
      <aside className="sidebar">
        <h2>Rooms</h2>
        <ul>
          {ROOMS.map((room) => (
            <li key={room}>
              <button type="button" className={room === state.room ? 'active' : undefined} aria-current={room === state.room ? 'true' : undefined} onClick={() => switchRoom(room)}>
                # {room}
                {state.unread[room] > 0 && <span className="badge" aria-label={`${state.unread[room]} unread`}>{state.unread[room]}</span>}
              </button>
            </li>
          ))}
        </ul>
        <h2>Online ({state.online.length})</h2>
        <ul className="online">{state.online.map((u) => <li key={u}>🟢 {u}{u === name ? ' (you)' : ''}</li>)}</ul>
      </aside>

      <section className="room" aria-label={`Room ${state.room}`}>
        {state.status !== 'open' && (
          <div className="banner" role="status">
            {state.status === 'connecting' && 'Connecting…'}
            {state.status === 'reconnecting' && <>Connection lost. Reconnecting{state.retryIn ? ` in ${Math.ceil(state.retryIn / 1000)}s` : '…'} <button type="button" onClick={reconnectNow}>Retry now</button></>}
            {state.status === 'offline' && 'You are offline. Messages will be sent when you reconnect.'}
          </div>
        )}
        <MessageList
          messages={messages}
          me={name}
          hasMore={state.hasMore[state.room]}
          onLoadOlder={loadOlder}
          onRetry={(m) => send(m.text, m.clientId)}
        />
        <p className="typing" aria-live="polite">{typers.length ? `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing…` : ' '}</p>
        <Composer onSend={send} onTyping={notifyTyping} disabledReason={state.status !== 'open' ? 'Offline: your message will be queued' : ''} />
      </section>
    </div>
  );
}
:::

::: code jsx chat-app/src/App.jsx
import { useState } from 'react';
import { ChatApp } from './chat/ChatApp.jsx';

export default function App() {
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  if (!name) {
    return (
      <form className="join" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) setName(draft.trim()); }}>
        <h1>Join the chat</h1>
        <label htmlFor="name">Your name</label>
        <input id="name" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} autoFocus />
        <button type="submit">Join</button>
      </form>
    );
  }
  return <ChatApp name={name} />;
}
:::

::: code jsx chat-app/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
:::

::: code css chat-app/src/chat/chat.css
.chat { display: grid; grid-template-columns: 200px 1fr; height: 100vh; }
.sidebar { background: #1e293b; color: #e2e8f0; padding: 16px; overflow-y: auto; }
.sidebar h2 { font-size: 13px; text-transform: uppercase; color: #94a3b8; margin: 16px 0 8px; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar button { all: unset; display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.sidebar button.active { background: #334155; font-weight: 700; }
.sidebar button:focus-visible { outline: 2px solid #818cf8; }
.badge { background: #ef4444; color: #fff; border-radius: 999px; padding: 0 7px; font-size: 12px; }
.online li { padding: 3px 0; font-size: 14px; }
.room { display: flex; flex-direction: column; min-width: 0; }
.banner { background: #fef3c7; color: #92400e; padding: 8px 14px; font-size: 14px; }
.message-wrap { position: relative; flex: 1; min-height: 0; }
.messages { list-style: none; margin: 0; padding: 12px 16px; height: 100%; box-sizing: border-box; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.message { max-width: 70%; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 12px; align-self: flex-start; }
.message.mine { align-self: flex-end; background: #eef2ff; border-color: #c7d2fe; }
.message.sending { opacity: 0.6; }
.message.failed { border-color: #f87171; }
.meta { font-size: 12px; color: #64748b; }
.text { white-space: pre-wrap; word-wrap: break-word; }
.status { font-size: 11px; color: #64748b; text-align: right; }
.system { align-self: center; font-size: 12px; color: #94a3b8; }
.new-pill { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); border: 0; border-radius: 999px; background: #4f46e5; color: #fff; padding: 6px 14px; cursor: pointer; }
.typing { margin: 0; padding: 0 16px; font-size: 13px; color: #64748b; min-height: 18px; }
.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
.composer textarea { flex: 1; resize: none; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font: inherit; }
.composer button { padding: 0 18px; border-radius: 8px; border: 0; background: #4f46e5; color: #fff; cursor: pointer; }
.composer button:disabled { opacity: 0.5; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 640px) { .chat { grid-template-columns: 1fr; } .sidebar { display: none; } }
@media (prefers-color-scheme: dark) {
  .message { background: #111827; border-color: #273449; }
  .message.mine { background: #1e1b4b; border-color: #3730a3; }
  .composer { border-color: #273449; }
  .composer textarea { background: #0f172a; color: inherit; border-color: #334155; }
}
:::

::: code css chat-app/src/styles.css
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f6fa; color: #0f172a; }
.join { max-width: 320px; margin: 80px auto; display: flex; flex-direction: column; gap: 8px; }
.join input { padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 16px; }
.join button { padding: 10px; border-radius: 8px; border: 0; background: #4f46e5; color: #fff; font-size: 16px; cursor: pointer; }
@media (prefers-color-scheme: dark) { body { background: #0b1020; color: #e2e8f0; } .join input { background: #0f172a; color: inherit; border-color: #334155; } }
:::

::: code javascript Browser simulation: optimistic send, ack, dedupe and backoff (runnable)
// chatReducer rules + the reconnect delay formula, without a socket.
function upsert(list = [], msg) {
  const i = list.findIndex((m) => (msg.clientId && m.clientId === msg.clientId) || (msg.id && m.id === msg.id));
  return (i === -1 ? [...list, msg] : list.map((m, j) => (j === i ? { ...m, ...msg } : m))).sort((a, b) => a.ts - b.ts);
}
function reducer(state, a) {
  if (a.type === 'optimistic') return { ...state, list: upsert(state.list, { ...a.message, status: 'sending' }) };
  if (a.type === 'ack') return { ...state, list: state.list.map((m) => (m.clientId === a.clientId ? { ...m, id: a.id, status: 'sent' } : m)) };
  if (a.type === 'incoming') return { ...state, list: upsert(state.list, { ...a.message, status: 'sent' }) };
  if (a.type === 'history') return { ...state, list: a.messages.reduce((list, m) => upsert(list, { ...m, status: 'sent' }), state.list) };
  return state;
}
const backoff = (attempt) => Math.min(30000, 1000 * 2 ** attempt);   // before jitter

// ---------- tests ----------
let s = { list: [] };
s = reducer(s, { type: 'optimistic', message: { clientId: 'c1', user: 'me', text: 'hello', ts: 100 } });
console.log('optimistic message shown as sending →', s.list[0].status, s.list[0].status === 'sending' ? '✅' : '❌ FAIL');
s = reducer(s, { type: 'ack', clientId: 'c1', id: 57 });
console.log('ack → sent with server id →', s.list[0].status, s.list[0].id, s.list[0].status === 'sent' && s.list[0].id === 57 ? '✅' : '❌ FAIL');
s = reducer(s, { type: 'incoming', message: { id: 57, clientId: 'c1', user: 'me', text: 'hello', ts: 100 } });
s = reducer(s, { type: 'incoming', message: { id: 57, clientId: 'c1', user: 'me', text: 'hello', ts: 100 } });
console.log('broadcast echo + duplicate resend → still 1 message →', s.list.length, s.list.length === 1 ? '✅' : '❌ FAIL');
s = reducer(s, { type: 'incoming', message: { id: 58, clientId: 'x', user: 'Ben', text: 'hi', ts: 200 } });
s = reducer(s, { type: 'history', messages: [{ id: 50, ts: 10, text: 'old' }, { id: 57, ts: 100, text: 'hello' }] });
console.log('older history prepended without duplicates →', s.list.map((m) => m.id).join(','), s.list.map((m) => m.id).join(',') === '50,57,58' ? '✅' : '❌ FAIL');
s = reducer(s, { type: 'optimistic', message: { clientId: 'c9', user: 'me', text: 'offline msg', ts: 300 } });
s = reducer(s, { type: 'history', messages: [{ id: 60, clientId: 'c9', user: 'me', text: 'offline msg', ts: 301 }] }); // catch-up arrives before the ack
console.log('catch-up history merges with the pending message by clientId →', s.list.length, s.list.at(-1).status, s.list.length === 4 && s.list.at(-1).id === 60 ? '✅' : '❌ FAIL');
const delays = [0, 1, 2, 3, 4, 5, 6].map(backoff);
console.log('reconnect backoff (ms) →', delays.join(', '), delays[0] === 1000 && delays[5] === 30000 && delays[6] === 30000 ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files and `cd chat-app && npm install`. Then, in two terminals:
`npm run server` → "Chat server on http://localhost:4200 (ws path /ws)"
`npm run dev` → open `http://localhost:5173` in **two browser windows**; join as "Vivek" and "Asha".
2. **Real time**: send in one window → appears instantly in the other; your own message shows "Sending…" then "✓ Sent".
3. **Typing**: type in one window → "Vivek is typing…" in the other (disappears ~3 s after the last keystroke or when the message arrives).
4. **History**: `#general` loads the last 30 of 75 seeded messages; scroll to the top → 30 older ones load **without the view jumping**.
5. **New-message pill**: scroll up in Asha's window, send from Vivek → "↓ 1 new message" instead of a jump.
6. **Unread**: Asha switches to `#random`; Vivek posts in `#general` → a red badge on `#general`.
7. **Reconnect**: stop the server (Ctrl+C) → yellow banner "Reconnecting in 1s… 2s… 4s…". Send a message: it stays "Sending…" (queued in the outbox). Restart the server → the banner disappears and the message is delivered once (acked by `clientId`).
8. **Failed**: if no ack arrives within 8 s the message shows "❌ Not sent · Retry"; Retry reuses the same `clientId`, so the server never stores it twice.
9. History API check: `curl -s "localhost:4200/api/rooms/general/messages?limit=2&before=10"` → `{"messages":[{"id":8,…},{"id":9,…}],"hasMore":true}`
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Transport | Polling / long polling | **WebSocket** / Server-Sent Events | WebSocket for two-way chat; SSE for one-way feeds |
| Library | Raw `WebSocket` + own reconnect (this) | **Socket.IO** (rooms, acks, reconnect, fallbacks) | Socket.IO or a managed service (Ably, Pusher) to save effort |
| Socket owner | Inside a component | **Singleton class outside React** | Outside React: survives re-renders/StrictMode, easy to test |
| Delivery | Fire and forget | **Ack + outbox + clientId dedupe** (at-least-once + idempotency) | Ack/outbox; server dedupes by `clientId` |
| Ordering | Client clock | **Server timestamp / sequence id** | Server ids; client `ts` only for optimistic placement |
| Long histories | Render all | **Virtualize** (react-virtuoso handles reverse scrolling) | Virtualize after a few hundred messages |
:::

::: text 📈 Scaling & edge cases
- **Server scale**: many WS servers behind a load balancer (sticky sessions or not needed with stateless auth); fan-out through **Redis pub/sub** / NATS / Kafka; store messages in Cassandra/DynamoDB/Postgres partitioned by room; presence in Redis with TTLs.
- **Client scale**: virtualized list, message grouping, lazy images, IndexedDB cache for offline history.
- **Catch-up after reconnect**: request messages `after=<lastSeenId>` (here: refetch the latest page) so nothing is missed.
- **Accessibility**: `aria-live="polite"` on the list (not assertive), labelled composer, keyboard room switching, don't steal focus on new messages, respect reduced motion.
- **Edge cases**: duplicate tabs, clock skew, very long messages, XSS (render text, never HTML), IME composition (don't send on Enter while composing), tab in background (throttled timers → heartbeat on the server side).
:::

::: warning ⚠️ Common mistakes
- Creating a new WebSocket in every render, or not closing it on unmount.
- Reconnecting immediately in a tight loop (thundering herd after a server restart): use backoff + jitter.
- Losing messages typed while offline, or sending them twice without an id to dedupe.
- Always scrolling to the bottom even when the user is reading history.
- Rendering message text with `dangerouslySetInnerHTML`.
:::

::: understand
- Real-time UIs combine a **long-lived connection** (managed outside React), a **reducer** that merges three sources of truth (optimistic local, server acks, broadcasts/history), and **idempotency** (`clientId`) so retries are safe.
- The same patterns (outbox, ack, backoff) appear in the backend Notification and Job Queue designs.
:::

::: important ⭐ How to present this design in 5 minutes
> "I keep a single ChatSocket class outside React that owns the WebSocket: it sends hello and join on open, heartbeats, reconnects with exponential backoff and jitter, and keeps an outbox of unacknowledged messages that it re-sends after reconnecting. A reducer holds messages by room, typing, presence, unread counts and connection status. Sending is optimistic: I add the message with a clientId and status sending; the server stores it once per clientId and acks with the real id, which flips it to sent; no ack within 8 seconds marks it failed with Retry using the same clientId. History loads 30 messages over REST and older pages with a before cursor while preserving scroll position. The list auto-scrolls only when the user is near the bottom, otherwise it shows a new-messages pill. Typing events are throttled and expire. For scale: virtualize the list, and on the server fan out with Redis pub/sub across WebSocket nodes."
:::

::: links
MDN: WebSocket API | https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
ws (Node WebSocket library) | https://github.com/websockets/ws
Socket.IO: Delivery guarantees | https://socket.io/docs/v4/delivery-guarantees
AWS: Exponential backoff and jitter | https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
:::

=== Design a component library / Design System
@p 3
@tags lld, react, design-system, theming
@quick
- **Design tokens** first: colours, spacing, radius, typography, shadows as **CSS custom properties**; semantic names (`--ds-color-bg`, `--ds-color-primary`) mapped from a raw palette, so **themes** (light/dark/brand) just swap values.
- Components with a **small, consistent API**: `variant`, `size`, `disabled`, `loading`, forward `ref`, spread the rest of the props, `className` escape hatch.
- **Accessibility built in**: native elements first (`<button>`, `<label>`), focus-visible rings, ARIA patterns for composite widgets (Tabs with arrow keys), colour contrast ≥ 4.5:1.
- **ThemeProvider**: system preference by default, user override persisted, `data-theme` on `<html>` (no flash if set before paint).
- Ship as a **package**: library build (ESM, React as peer dependency), versioning with semver + changelog, docs/playground (Storybook), visual regression tests.

::: text 🧒 In simple words
A design system is a **LEGO set for your company's apps**. Instead of every team carving its own bricks (slightly different blues, buttons with different paddings, modals that behave differently), there's one box of well-made bricks: colours and spacing (tokens) plus components (Button, TextField, Tabs) that are already accessible and themeable. Teams build faster, apps look like one family, and when the brand colour changes you change one token instead of 400 files.
:::

::: text 📋 Requirements
### Functional
- Tokens for colour, spacing, radius, font sizes, shadows; **light and dark themes** plus a brand theme.
- Components: `Button` (primary/secondary/ghost/danger, sm/md/lg, loading, icon), `TextField` (label, hint, error, required), `Badge`, `Card`, `Stack` (layout), `Tabs` (keyboard accessible).
- `ThemeProvider` + `useTheme()` with system / light / dark / brand.
- A docs page showing every component and state.

### Non-functional
- WCAG 2.1 AA: keyboard support, focus visible, contrast, labels.
- Tree-shakeable package, no runtime CSS-in-JS cost, React as a peer dependency.
- Stable, documented API; breaking changes only in major versions.

### Assumptions
- React 18 + Vite; plain CSS with custom properties (works with any framework or SSR); a Vite **library-mode** config builds the package.
:::

::: ask
- *"Who are the consumers: one app or many teams/frameworks?"* (Web components vs React.)
- *"Is there a Figma library? Who owns tokens?"* (Design-dev handoff, Style Dictionary.)
- *"Which themes: dark mode, white-label brands?"*
- *"Styling approach constraints: Tailwind, CSS Modules, CSS-in-JS?"*
- *"How will we version and roll out changes?"*
:::

::: diagram Architecture: tokens → themes → components → apps
flowchart TD
  FIGMA["Design (Figma variables)"] --> RAW["Raw tokens: palette, spacing scale"]
  RAW --> SEM["Semantic tokens: --ds-color-bg, --ds-color-primary"]
  SEM --> THEMES["Themes: light, dark, brand (data-theme)"]
  THEMES --> COMP["Components: Button, TextField, Tabs, Badge, Card, Stack"]
  TP["ThemeProvider + useTheme"] --> THEMES
  COMP --> PKG["Package @acme/ui (ESM, peer react)"]
  PKG --> APP1["App A"]
  PKG --> APP2["App B"]
  COMP --> DOCS["Docs / Storybook + tests"]
:::

::: diagram Sequence: switching to dark theme
sequenceDiagram
  participant U as User
  participant T as ThemeToggle
  participant P as ThemeProvider
  participant H as html element
  participant C as Components
  U->>T: choose "Dark"
  T->>P: setTheme("dark")
  P->>P: save "dark" in localStorage
  P->>H: data-theme = "dark"
  H-->>C: CSS variables change value
  C-->>U: every component re-paints, no React re-render needed
:::

::: image Design system: raw tokens to semantic tokens to themes to components, consumed as a package
/images/frontend-lld/design-system.svg
:::

::: text 🧱 Design
### Token layers
| Layer | Example | Who changes it |
|---|---|---|
| Raw (palette, scales) | `--ds-indigo-600: #4f46e5`, `--ds-space-4: 16px` | Rarely (brand refresh) |
| Semantic | `--ds-color-primary: var(--ds-indigo-600)`, `--ds-color-bg`, `--ds-color-text-muted` | Per theme |
| Component | `--ds-button-radius: var(--ds-radius-md)` | Per component (optional) |

### Component API conventions
| Convention | Why |
|---|---|
| `variant` + `size` props with a fixed set of values | Consistency, easy to document |
| `forwardRef` + `...rest` spread onto the native element | Works with forms, focus management, tooltips, testing |
| Native element first (`button`, `input`) | Free keyboard and screen-reader behaviour |
| `className` merged, never replaced | Escape hatch without forking |
| No margins on components; spacing via `Stack` | Components compose without overrides |

### Theming
`ThemeProvider` keeps `preference: 'system' | 'light' | 'dark' | 'brand'`, resolves `system` with `matchMedia('(prefers-color-scheme: dark)')`, sets `document.documentElement.dataset.theme`, persists the choice. A tiny inline script in `index.html` applies the saved theme **before** React loads to avoid a flash.
:::

::: text 📁 Folder structure
`design-system/`
↳ `package.json`, `vite.config.js` (docs app), `vite.lib.config.js` (package build), `index.html`
↳ `src/tokens/tokens.css`
↳ `src/theme/ThemeProvider.jsx`
↳ `src/components/Button.jsx`, `TextField.jsx`, `Tabs.jsx`, `Badge.jsx`, `Card.jsx`, `Stack.jsx`, `components.css`
↳ `src/utils/cx.js`, `src/index.js` (public API)
↳ `src/docs/main.jsx`, `src/docs/DocsApp.jsx`
:::

::: code json design-system/package.json
{
  "name": "@acme/ui",
  "version": "1.0.0",
  "type": "module",
  "files": ["dist"],
  "main": "./dist/acme-ui.js",
  "module": "./dist/acme-ui.js",
  "exports": {
    ".": "./dist/acme-ui.js",
    "./styles.css": "./dist/style.css"
  },
  "sideEffects": ["**/*.css"],
  "scripts": {
    "dev": "vite",
    "build:docs": "vite build",
    "build:lib": "vite build --config vite.lib.config.js"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "vite": "^5.4.0"
  }
}
:::

::: code javascript design-system/vite.config.js
// Docs/playground app
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
:::

::: code javascript design-system/vite.lib.config.js
// Package build: one ESM file + one CSS file, React NOT bundled (peer dependency).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'acme-ui.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { assetFileNames: 'style.css' },
    },
  },
});
:::

::: code html design-system/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acme UI: Design System</title>
    <script>
      // Apply the saved theme BEFORE first paint (prevents a light flash in dark mode)
      (function () {
        try {
          var pref = localStorage.getItem('ds-theme') || 'system';
          var dark = matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.dataset.theme = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/docs/main.jsx"></script>
  </body>
</html>
:::

::: code css design-system/src/tokens/tokens.css
/* 1. Raw tokens: the palette and scales (never used directly by components) */
:root {
  --ds-indigo-50: #eef2ff; --ds-indigo-500: #6366f1; --ds-indigo-600: #4f46e5; --ds-indigo-700: #4338ca;
  --ds-slate-0: #ffffff; --ds-slate-50: #f8fafc; --ds-slate-100: #f1f5f9; --ds-slate-200: #e2e8f0; --ds-slate-300: #cbd5e1;
  --ds-slate-500: #64748b; --ds-slate-600: #475569; --ds-slate-700: #334155; --ds-slate-800: #1e293b; --ds-slate-900: #0f172a; --ds-slate-950: #0b1020;
  --ds-red-50: #fef2f2; --ds-red-300: #fca5a5; --ds-red-600: #dc2626; --ds-red-700: #b91c1c;
  --ds-green-50: #ecfdf5; --ds-green-700: #047857; --ds-amber-50: #fffbeb; --ds-amber-700: #b45309;
  --ds-teal-600: #0d9488; --ds-teal-700: #0f766e;

  --ds-space-1: 4px; --ds-space-2: 8px; --ds-space-3: 12px; --ds-space-4: 16px; --ds-space-6: 24px; --ds-space-8: 32px;
  --ds-radius-sm: 6px; --ds-radius-md: 10px; --ds-radius-full: 999px;
  --ds-font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --ds-text-sm: 13px; --ds-text-md: 15px; --ds-text-lg: 18px; --ds-text-xl: 24px;
  --ds-shadow-md: 0 4px 14px rgba(15, 23, 42, 0.08);
  --ds-duration: 150ms;
}

/* 2. Semantic tokens: what components use. Light theme = default */
:root, [data-theme='light'] {
  --ds-color-bg: var(--ds-slate-50);
  --ds-color-surface: var(--ds-slate-0);
  --ds-color-border: var(--ds-slate-200);
  --ds-color-border-strong: var(--ds-slate-300);
  --ds-color-text: var(--ds-slate-900);
  --ds-color-text-muted: var(--ds-slate-600);
  --ds-color-primary: var(--ds-indigo-600);
  --ds-color-primary-hover: var(--ds-indigo-700);
  --ds-color-primary-soft: var(--ds-indigo-50);
  --ds-color-on-primary: #ffffff;
  --ds-color-danger: var(--ds-red-600);
  --ds-color-danger-hover: var(--ds-red-700);
  --ds-color-danger-soft: var(--ds-red-50);
  --ds-color-danger-text: var(--ds-red-700);
  --ds-color-success-soft: var(--ds-green-50);
  --ds-color-success-text: var(--ds-green-700);
  --ds-color-warning-soft: var(--ds-amber-50);
  --ds-color-warning-text: var(--ds-amber-700);
  --ds-color-focus: var(--ds-indigo-500);
}

[data-theme='dark'] {
  --ds-color-bg: var(--ds-slate-950);
  --ds-color-surface: var(--ds-slate-900);
  --ds-color-border: var(--ds-slate-700);
  --ds-color-border-strong: var(--ds-slate-600);
  --ds-color-text: var(--ds-slate-100);
  --ds-color-text-muted: var(--ds-slate-300);
  --ds-color-primary: var(--ds-indigo-500);
  --ds-color-primary-hover: #818cf8;
  --ds-color-primary-soft: #1e1b4b;
  --ds-color-on-primary: #ffffff;
  --ds-color-danger: #ef4444;
  --ds-color-danger-hover: #f87171;
  --ds-color-danger-soft: #2a1215;
  --ds-color-danger-text: var(--ds-red-300);
  --ds-color-success-soft: #052e22;
  --ds-color-success-text: #6ee7b7;
  --ds-color-warning-soft: #2b1d05;
  --ds-color-warning-text: #fcd34d;
  --ds-color-focus: #a5b4fc;
}

/* A white-label brand theme only overrides what differs */
[data-theme='brand'] {
  --ds-color-primary: var(--ds-teal-600);
  --ds-color-primary-hover: var(--ds-teal-700);
  --ds-color-primary-soft: #f0fdfa;
  --ds-radius-md: 4px;
}

body {
  margin: 0;
  background: var(--ds-color-bg);
  color: var(--ds-color-text);
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-md);
}

@media (prefers-reduced-motion: reduce) {
  :root { --ds-duration: 0ms; }
}
:::

::: code javascript design-system/src/utils/cx.js
/** Joins class names, skipping falsy values: cx('a', cond && 'b') */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
:::

::: code jsx design-system/src/theme/ThemeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'ds-theme';
const THEMES = ['system', 'light', 'dark', 'brand'];

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children, defaultPreference }) {
  const [preference, setPreference] = useState(() => defaultPreference || readPreference());
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);

  // follow the OS setting live while preference is "system"
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;      // CSS variables switch, no re-render needed
    try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* private mode */ }
  }, [resolved, preference]);

  const value = useMemo(() => ({ preference, resolved, setPreference, themes: THEMES }), [preference, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
:::

::: code jsx design-system/src/components/Button.jsx
import { forwardRef } from 'react';
import { cx } from '../utils/cx.js';

/**
 * <Button variant="primary|secondary|ghost|danger" size="sm|md|lg" loading icon={<Icon/>}>Save</Button>
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled = false, icon = null, fullWidth = false, type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}                                          // never accidentally submit forms
      className={cx('ds-btn', `ds-btn--${variant}`, `ds-btn--${size}`, fullWidth && 'ds-btn--full', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : icon && <span className="ds-btn__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
});
:::

::: code jsx design-system/src/components/TextField.jsx
import { forwardRef, useId } from 'react';
import { cx } from '../utils/cx.js';

/** Label + input + hint + error, wired for screen readers. */
export const TextField = forwardRef(function TextField(
  { label, hint, error, required = false, id: idProp, className, ...inputProps },
  ref,
) {
  const autoId = useId();
  const id = idProp || autoId;
  const hintId = hint && !error ? `${id}-hint` : undefined;      // only reference elements that are rendered
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cx('ds-field', error && 'has-error', className)}>
      <label htmlFor={id} className="ds-field__label">
        {label}
        {required && <span className="ds-field__required" aria-hidden="true"> *</span>}
      </label>
      <input
        ref={ref}
        id={id}
        className="ds-field__input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        {...inputProps}
      />
      {hint && !error && <p id={hintId} className="ds-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ds-field__error">{error}</p>}
    </div>
  );
});
:::

::: code jsx design-system/src/components/Tabs.jsx
import { useId, useRef, useState } from 'react';
import { cx } from '../utils/cx.js';

/**
 * <Tabs items={[{ id, label, content }]} defaultValue="a" onChange={fn} />
 * WAI-ARIA Tabs pattern: ← → Home End move focus and select (automatic activation).
 */
export function Tabs({ items, defaultValue, value: controlled, onChange, label = 'Tabs', className }) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? items[0]?.id);
  const value = controlled ?? uncontrolled;
  const baseId = useId();
  const tabRefs = useRef([]);

  const select = (id, index) => {
    if (controlled === undefined) setUncontrolled(id);
    onChange?.(id);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (e, index) => {
    const last = items.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(items[next].id, next);
  };

  return (
    <div className={cx('ds-tabs', className)}>
      <div role="tablist" aria-label={label} className="ds-tabs__list">
        {items.map((item, index) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}                 // roving tabindex: one Tab stop for the whole list
              className={cx('ds-tabs__tab', selected && 'is-selected')}
              onClick={() => select(item.id, index)}
              onKeyDown={(e) => onKeyDown(e, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== value}
          tabIndex={0}
          className="ds-tabs__panel"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
:::

::: code jsx design-system/src/components/Badge.jsx
import { cx } from '../utils/cx.js';

/** <Badge tone="neutral|success|warning|danger|info">Active</Badge> */
export function Badge({ tone = 'neutral', className, children, ...rest }) {
  return <span className={cx('ds-badge', `ds-badge--${tone}`, className)} {...rest}>{children}</span>;
}
:::

::: code jsx design-system/src/components/Card.jsx
import { cx } from '../utils/cx.js';

/** <Card title="Plan" actions={<Button/>}>…</Card> renders a section with an optional heading. */
export function Card({ title, actions, as: Tag = 'section', className, children, ...rest }) {
  return (
    <Tag className={cx('ds-card', className)} {...rest}>
      {(title || actions) && (
        <header className="ds-card__header">
          {title && <h3 className="ds-card__title">{title}</h3>}
          {actions && <div className="ds-card__actions">{actions}</div>}
        </header>
      )}
      <div className="ds-card__body">{children}</div>
    </Tag>
  );
}
:::

::: code jsx design-system/src/components/Stack.jsx
import { cx } from '../utils/cx.js';

const GAP = { 1: 'var(--ds-space-1)', 2: 'var(--ds-space-2)', 3: 'var(--ds-space-3)', 4: 'var(--ds-space-4)', 6: 'var(--ds-space-6)', 8: 'var(--ds-space-8)' };

/** Layout primitive: spacing lives here, not as margins on components. */
export function Stack({ direction = 'column', gap = 4, align, justify, wrap = false, as: Tag = 'div', className, style, children, ...rest }) {
  return (
    <Tag
      className={cx('ds-stack', className)}
      style={{ display: 'flex', flexDirection: direction, gap: GAP[gap] || gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
:::

::: code css design-system/src/components/components.css
/* Every value comes from a token → themes work automatically */
.ds-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--ds-space-2); border: 1px solid transparent; border-radius: var(--ds-radius-md);
  font: inherit; font-weight: 600; cursor: pointer; transition: background var(--ds-duration), border-color var(--ds-duration); }
.ds-btn:focus-visible, .ds-field__input:focus-visible, .ds-tabs__tab:focus-visible, .ds-tabs__panel:focus-visible { outline: 2px solid var(--ds-color-focus); outline-offset: 2px; }
.ds-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ds-btn--sm { padding: 4px 10px; font-size: var(--ds-text-sm); }
.ds-btn--md { padding: 8px 16px; font-size: var(--ds-text-md); }
.ds-btn--lg { padding: 12px 22px; font-size: var(--ds-text-lg); }
.ds-btn--full { width: 100%; }
.ds-btn--primary { background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
.ds-btn--primary:hover:not(:disabled) { background: var(--ds-color-primary-hover); }
.ds-btn--secondary { background: var(--ds-color-surface); color: var(--ds-color-text); border-color: var(--ds-color-border-strong); }
.ds-btn--secondary:hover:not(:disabled) { background: var(--ds-color-primary-soft); }
.ds-btn--ghost { background: transparent; color: var(--ds-color-primary); }
.ds-btn--ghost:hover:not(:disabled) { background: var(--ds-color-primary-soft); }
.ds-btn--danger { background: var(--ds-color-danger); color: #fff; }
.ds-btn--danger:hover:not(:disabled) { background: var(--ds-color-danger-hover); }
.ds-spinner { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: ds-spin 0.7s linear infinite; }
@keyframes ds-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ds-spinner { animation-duration: 2s; } }

.ds-field { display: flex; flex-direction: column; gap: var(--ds-space-1); }
.ds-field__label { font-weight: 600; font-size: var(--ds-text-sm); }
.ds-field__required { color: var(--ds-color-danger-text); }
.ds-field__input { padding: 9px 12px; border-radius: var(--ds-radius-md); border: 1px solid var(--ds-color-border-strong); background: var(--ds-color-surface); color: var(--ds-color-text); font: inherit; }
.ds-field.has-error .ds-field__input { border-color: var(--ds-color-danger); }
.ds-field__hint { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-text-muted); }
.ds-field__error { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-danger-text); }

.ds-badge { display: inline-block; padding: 2px 10px; border-radius: var(--ds-radius-full); font-size: var(--ds-text-sm); font-weight: 600; }
.ds-badge--neutral { background: var(--ds-color-bg); color: var(--ds-color-text-muted); border: 1px solid var(--ds-color-border); }
.ds-badge--info { background: var(--ds-color-primary-soft); color: var(--ds-color-primary); }
.ds-badge--success { background: var(--ds-color-success-soft); color: var(--ds-color-success-text); }
.ds-badge--warning { background: var(--ds-color-warning-soft); color: var(--ds-color-warning-text); }
.ds-badge--danger { background: var(--ds-color-danger-soft); color: var(--ds-color-danger-text); }

.ds-card { background: var(--ds-color-surface); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); box-shadow: var(--ds-shadow-md); }
.ds-card__header { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-3); padding: var(--ds-space-4) var(--ds-space-4) 0; }
.ds-card__title { margin: 0; font-size: var(--ds-text-lg); }
.ds-card__body { padding: var(--ds-space-4); }

.ds-tabs__list { display: flex; gap: var(--ds-space-1); border-bottom: 1px solid var(--ds-color-border); }
.ds-tabs__tab { border: 0; background: none; color: var(--ds-color-text-muted); padding: var(--ds-space-2) var(--ds-space-3); font: inherit; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.ds-tabs__tab.is-selected { color: var(--ds-color-primary); border-bottom-color: var(--ds-color-primary); font-weight: 600; }
.ds-tabs__panel { padding: var(--ds-space-4) 0; }
:::

::: code javascript design-system/src/index.js
// Public API of the package: only what is exported here is supported.
import './tokens/tokens.css';
import './components/components.css';

export { ThemeProvider, useTheme } from './theme/ThemeProvider.jsx';
export { Button } from './components/Button.jsx';
export { TextField } from './components/TextField.jsx';
export { Tabs } from './components/Tabs.jsx';
export { Badge } from './components/Badge.jsx';
export { Card } from './components/Card.jsx';
export { Stack } from './components/Stack.jsx';
export { cx } from './utils/cx.js';
:::

::: code jsx design-system/src/docs/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '../index.js';
import { DocsApp } from './DocsApp.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <DocsApp />
    </ThemeProvider>
  </React.StrictMode>
);
:::

::: code jsx design-system/src/docs/DocsApp.jsx
// Living documentation: every component, variant and state on one page.
import { useState } from 'react';
import { Badge, Button, Card, Stack, Tabs, TextField, useTheme } from '../index.js';

function ThemeSwitcher() {
  const { preference, resolved, setPreference, themes } = useTheme();
  return (
    <Stack direction="row" gap={2} align="center" wrap>
      <span>Theme:</span>
      {themes.map((t) => (
        <Button key={t} size="sm" variant={t === preference ? 'primary' : 'secondary'} aria-pressed={t === preference} onClick={() => setPreference(t)}>
          {t}
        </Button>
      ))}
      <Badge tone="info">active: {resolved}</Badge>
    </Stack>
  );
}

export function DocsApp() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const emailError = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email address' : '';

  const fakeSave = () => { setLoading(true); setTimeout(() => setLoading(false), 1500); };

  return (
    <Stack gap={6} style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px' }}>
      <Stack gap={2}>
        <h1 style={{ margin: 0 }}>Acme UI</h1>
        <p style={{ margin: 0, color: 'var(--ds-color-text-muted)' }}>Tokens, themes and accessible components.</p>
        <ThemeSwitcher />
      </Stack>

      <Card title="Button">
        <Stack gap={3}>
          <Stack direction="row" gap={2} wrap>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
          </Stack>
          <Stack direction="row" gap={2} align="center" wrap>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button icon="＋" variant="secondary">With icon</Button>
            <Button loading={loading} onClick={fakeSave}>{loading ? 'Saving…' : 'Save (loading demo)'}</Button>
          </Stack>
        </Stack>
      </Card>

      <Card title="TextField">
        <Stack gap={4}>
          <TextField label="Full name" placeholder="Vivek Singh" hint="As shown on your ID" required />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} hint="We never share it" />
          <TextField label="Disabled" disabled value="Read only value" readOnly />
        </Stack>
      </Card>

      <Card title="Badge">
        <Stack direction="row" gap={2} wrap>
          <Badge>Neutral</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Suspended</Badge>
        </Stack>
      </Card>

      <Card title="Tabs" actions={<Badge tone="info">← → Home End</Badge>}>
        <Tabs
          label="Account settings"
          items={[
            { id: 'profile', label: 'Profile', content: <p>Profile settings panel.</p> },
            { id: 'security', label: 'Security', content: <p>Password and two-factor authentication.</p> },
            { id: 'billing', label: 'Billing', content: <p>Invoices and payment methods.</p> },
          ]}
        />
      </Card>
    </Stack>
  );
}
:::

::: code javascript Browser simulation: tokens, themes and Tabs keyboard logic (runnable)
// Theme resolution, token lookup through layers, contrast check and the Tabs key map.
function resolveTheme(preference, systemDark) { return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference; }
const raw = { 'indigo-600': '#4f46e5', 'indigo-500': '#6366f1', 'teal-600': '#0d9488', 'slate-900': '#0f172a', 'slate-100': '#f1f5f9' };
const themes = {
  light: { primary: 'indigo-600', text: 'slate-900' },
  dark: { primary: 'indigo-500', text: 'slate-100' },
  brand: { primary: 'teal-600' },                                    // overrides only what differs
};
const token = (theme, name) => raw[(themes[theme] && themes[theme][name]) || themes.light[name]];
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function nextTab(key, index, count) { const last = count - 1; return { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[key]; }

// ---------- tests ----------
console.log('system + OS dark → dark', resolveTheme('system', true) === 'dark' ? '✅' : '❌ FAIL');
console.log('explicit choice beats the OS → brand', resolveTheme('brand', true) === 'brand' ? '✅' : '❌ FAIL');
console.log('brand primary →', token('brand', 'primary'), token('brand', 'primary') === '#0d9488' ? '✅' : '❌ FAIL');
console.log('brand falls back to light text →', token('brand', 'text'), token('brand', 'text') === '#0f172a' ? '✅' : '❌ FAIL');
const c = contrast('#ffffff', token('light', 'primary'));
console.log('white on primary contrast', c.toFixed(2), ': 1 (AA needs 4.5)', c >= 4.5 ? '✅' : '❌ FAIL');
const keys = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home'];
const path = []; let i = 0; keys.forEach((k) => { i = nextTab(k, i, 3); path.push(i); });
console.log('Tabs keys', keys.join(' '), '→', path.join(','), path.join(',') === '1,2,0,2,2,0' ? '✅' : '❌ FAIL');
:::

::: text 🧪 How to run & test
1. Create the files, then `cd design-system && npm install && npm run dev` → open the printed URL (the docs page).
2. **Themes**: click **dark**, **light**, **brand** → every component changes instantly (only `data-theme` on `<html>` changes; inspect it in DevTools). Choose **system** and switch your OS appearance → the page follows.
3. Reload in dark mode → no white flash (the inline script in `index.html` sets the theme before React loads).
4. **Keyboard**: Tab through buttons → visible focus rings. Tab into the Tabs component → one tab stop; ← → Home End move between tabs.
5. **TextField**: type `abc` in Email → red border + "Enter a valid email address", and VoiceOver reads the error with the field (`aria-describedby`).
6. **Loading button**: click "Save" → spinner, `aria-busy`, disabled for 1.5 s (no double submit).
7. **Package build**: `npm run build:lib` → `dist/acme-ui.js` (React is **not** bundled) and `dist/style.css`. A consumer app installs it and writes:
`import { Button, ThemeProvider } from '@acme/ui';`
`import '@acme/ui/styles.css';`
8. `npm run build:docs` → static docs site in `dist/` (deploy alongside, or use Storybook).
:::

::: text ⚖️ Trade-offs & alternatives
| Decision | Option A | Option B | Choose |
|---|---|---|---|
| Styling | **CSS variables + plain CSS** (this) | CSS-in-JS (styled-components, Emotion) / Tailwind | CSS variables: zero runtime, SSR-friendly, framework-agnostic; Tailwind if the org already uses it |
| Behaviour | Build everything | **Headless primitives** (Radix, React Aria) + own styles | Headless libs for complex widgets (combobox, menu, dialog) |
| Token source | Hand-written CSS | **Style Dictionary / Figma variables** → CSS/JS/iOS/Android | Generated tokens when several platforms share a brand |
| Distribution | Copy-paste components (shadcn/ui style) | **Versioned npm package** | Package for many teams; copy-paste when teams need to customise heavily |
| Docs | Static page (this) | **Storybook** + interaction tests + Chromatic visual diffs | Storybook for a real library |
| Theming | Prop drilling / context re-render | **`data-theme` + CSS vars** | CSS vars: switching theme doesn't re-render React |
:::

::: text 📈 Scaling & edge cases
- **Governance**: an owning team, contribution guidelines, RFCs for new components, deprecation policy (warn for one major version).
- **Versioning**: semver + changesets; codemods for breaking changes; publish canary builds for testing.
- **Quality gates**: unit tests (Testing Library), accessibility tests (axe), visual regression (Chromatic/Playwright screenshots), bundle-size budget.
- **Performance**: tree-shaking (ESM, `sideEffects`), no heavy dependencies, CSS split per component if the library grows.
- **Edge cases**: RTL languages (logical CSS properties like `margin-inline-start`), high-contrast mode (`forced-colors`), long labels and translations, density (compact/comfortable) as another token layer, SSR theme flash.
:::

::: warning ⚠️ Common mistakes
- Hard-coded colours in components (`#4f46e5`) → themes and dark mode break.
- Raw palette names in components (`--blue-600`) instead of semantic names (`--color-primary`).
- Components that don't forward refs or spread props → unusable with forms/tooltips/tests.
- `<div onClick>` buttons and custom selects without keyboard support.
- Breaking API changes in a minor release.
:::

::: understand
- A design system is **tokens + components + documentation + governance**. Tokens make themes cheap; native-first, accessible components make every product better at once.
- Layered tokens (raw → semantic → component) are what make light/dark/brand themes a few lines of CSS.
:::

::: important ⭐ How to present this design in 5 minutes
> "I start with design tokens as CSS custom properties in layers: a raw palette and scales, then semantic tokens like color-bg, color-text and color-primary that components use, and themes that only remap semantic tokens under a data-theme attribute, so light, dark and a brand theme are a few lines and switching doesn't re-render React. A ThemeProvider resolves system preference with matchMedia, persists the user's choice and sets data-theme; an inline script applies it before first paint to avoid a flash. Components follow one API convention: variant, size, disabled and loading props, forwardRef, rest props spread onto native elements, and className merged. Accessibility is built in: native buttons and labels, focus-visible rings, aria-describedby for errors, and the ARIA Tabs pattern with roving tabindex and arrow keys. It ships as an ESM package with React as a peer dependency, semver and changelogs, documented in Storybook with visual and axe tests."
:::

::: links
W3C Design Tokens Community Group | https://www.designtokens.org/
WAI-ARIA APG: Tabs pattern | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
Storybook | https://storybook.js.org/
Radix Primitives | https://www.radix-ui.com/primitives
:::
